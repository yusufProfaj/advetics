import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ConsentBox,
  CustomQuestion,
  EditPlan,
  FormType,
  LeadFormInput,
  LeadFormRecord,
  LeadFormStatus,
  PrefillQuestion,
  TenantContext,
  TesekkurDugmeTuru,
} from '@advetics/shared';
import { FORM_YAYIN_BELIRSIZ_NOTU, FORM_YAYIN_YARIM_NOTU, FORM_YAYIN_YASLI_DAKIKA, tesekkurDugmesiTuru } from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { TxLike } from '../rules/rules.service';
import { FORM_YAYIN_BELIRSIZ, planEdit, publishBlockers, publishWarnings } from './form-versioning';

/** Kimlik yazıldı, geri okuma sonucu henüz kayda geçmedi (ya da geçemedi). */
export const GERI_OKUMA_BEKLIYOR = "Form Meta'da açıldı; geri okuma tamamlanmadı, KVKK kutuları doğrulanmadı.";

/**
 * Formlar kütüphanesi — veri katmanı.
 *
 * SÜRÜM MANTIĞI BURADA UYGULANIYOR, SAF HÂLİ `form-versioning.ts`'DE.
 *
 * Ayrım kasıtlı: "bu düzenleme yeni sürüm gerektirir mi" sorusu veritabanı
 * olmadan cevaplanabilmeli, çünkü arayüz aynı soruyu kaydetmeden önce de
 * soruyor. İki yerde iki farklı cevap, kullanıcının onayladığı şeyle olanın
 * ayrışması demek.
 */

interface FormRow {
  id: string;
  org_id: string;
  client_id: string;
  social_profile_id: string;
  social_profile_name: string;
  page_external_id: string;
  name: string;
  form_type: FormType;
  headline: string | null;
  intro: string | null;
  prefill_questions: PrefillQuestion[];
  custom_questions: CustomQuestion[];
  privacy_policy_url: string;
  privacy_policy_link_text: string;
  consent_boxes: ConsentBox[];
  thank_you_headline: string;
  thank_you_body: string;
  thank_you_cta_text: string;
  thank_you_cta_url: string | null;
  thank_you_cta_type: TesekkurDugmeTuru | null;
  thank_you_phone: string | null;
  readback_warning: string | null;
  status: LeadFormStatus;
  external_form_id: string | null;
  version: number;
  root_id: string;
  superseded_by_id: string | null;
  error: string | null;
  published_at: Date | null;
  created_at: Date;
}

@Injectable()
export class FormsService {
  private readonly logger = new Logger(FormsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Okuma
  // ---------------------------------------------------------------------------

  /**
   * Kütüphane listesi — YALNIZCA HER ZİNCİRİN SON HALKASI.
   *
   * Eski sürümleri de listelemek, 3 kez düzenlenmiş bir formu kütüphanede 4
   * satır olarak göstermek demek. Kullanıcının aradığı şey "formlarım", sürüm
   * geçmişi değil; geçmiş formun detayında duruyor.
   */
  async list(ctx: TenantContext, clientId: string): Promise<LeadFormRecord[]> {
    await this.yarimKalanlariAyirGuvenli(ctx, Prisma.sql`org_id = ${ctx.orgId}::uuid AND client_id = ${clientId}::uuid`);
    return this.prisma.withTenant(ctx, async (tx) => {
      const rows = await this.select(
        tx,
        Prisma.sql`f.org_id = ${ctx.orgId}::uuid AND f.client_id = ${clientId}::uuid
                   AND f.superseded_by_id IS NULL`,
      );
      return rows.map(toRecord);
    });
  }

  async get(ctx: TenantContext, id: string): Promise<LeadFormRecord> {
    await this.yarimKalanlariAyirGuvenli(ctx, Prisma.sql`id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid`);
    return this.prisma.withTenant(ctx, async (tx) => {
      const [row] = await this.select(
        tx,
        Prisma.sql`f.id = ${id}::uuid AND f.org_id = ${ctx.orgId}::uuid`,
      );
      if (!row) throw new NotFoundException('Form bulunamadı');
      return toRecord(row);
    });
  }

  /** Bir formun tüm sürümleri — eskiden yeniye. */
  async versions(ctx: TenantContext, id: string): Promise<LeadFormRecord[]> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ root_id: string }>>(Prisma.sql`
        SELECT root_id FROM lead_forms
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
      `);
      if (!row) throw new NotFoundException('Form bulunamadı');
      const rows = await this.select(
        tx,
        Prisma.sql`f.root_id = ${row.root_id}::uuid AND f.org_id = ${ctx.orgId}::uuid`,
        Prisma.sql`f.version ASC`,
      );
      return rows.map(toRecord);
    });
  }

  /** Yayın öncesi kontrol — arayüz bunu formu yazarken de gösteriyor. */
  async checks(
    ctx: TenantContext,
    id: string,
  ): Promise<{ blockers: string[]; warnings: string[] }> {
    const form = await this.get(ctx, id);
    return { blockers: publishBlockers(form), warnings: publishWarnings(form) };
  }

  // ---------------------------------------------------------------------------
  // Yazma
  // ---------------------------------------------------------------------------

  async create(ctx: TenantContext, input: LeadFormInput): Promise<LeadFormRecord> {
    const id = await this.prisma.withTenant(ctx, async (tx) => {
      await this.assertProfile(tx, input);
      return this.insert(tx, ctx, input, { version: 1, rootId: null });
    });
    return this.get(ctx, id);
  }

  /**
   * Kaydetmeden ÖNCE ne olacağını söyler.
   *
   * Arayüz "Kaydet"e basılmadan bunu çağırıyor. Yayınlanmış bir formda
   * düzenleme yeni sürüm üretiyor ve kullanıcı bunu sonradan öğrenmemeli —
   * Meta'da geri alınamayan bir kayıt oluşuyor.
   */
  async planUpdate(
    ctx: TenantContext,
    id: string,
    input: LeadFormInput,
  ): Promise<EditPlan> {
    const current = await this.get(ctx, id);
    return planEdit(current, toInput(current), input);
  }

  /**
   * Günceller — GEREKİYORSA YENİ SÜRÜM OLARAK.
   *
   * Taslakta satır güncelleniyor. Yayınlanmış formda yeni satır açılıyor ve
   * eskisi `superseded` işaretleniyor; ikisi TEK İŞLEMDE oluyor çünkü arada
   * bir hata, "yenisi var" diyen ama yenisi olmayan bir satır bırakırdı.
   */
  async update(ctx: TenantContext, id: string, input: LeadFormInput): Promise<LeadFormRecord> {
    const current = await this.get(ctx, id);
    // Yayını belirsiz satır düzenlenemez: Meta'da form açılmış olabilir ve
    // içeriği değiştirmek kayıt ile Meta'daki formu ayrıştırırdı.
    if (current.status === 'publishing' || current.status === 'uncertain') throw new BadRequestException(FORM_YAYIN_BELIRSIZ);
    const plan = planEdit(current, toInput(current), input);

    const nextId = await this.prisma.withTenant(ctx, async (tx) => {
      await this.assertProfile(tx, input);

      if (plan.inPlace) {
        const n = await tx.$executeRaw(Prisma.sql`
          UPDATE lead_forms SET
            name = ${input.name},
            ${
              // YAYINLANMIŞ FORMDA YALNIZCA AD GÜNCELLENİYOR.
              //
              // Diğer alanlar Meta'daki formla eşleşmek zorunda; buradan
              // değiştirilirlerse panel "reklamda ne yazıyor" sorusuna yanlış
              // cevap verir.
              current.status === 'published'
                ? Prisma.empty
                : Prisma.sql`
                    social_profile_id = ${input.socialProfileId}::uuid,
                    form_type = ${input.formType},
                    headline = ${input.headline || null},
                    intro = ${input.intro || null},
                    prefill_questions = ${JSON.stringify(input.prefillQuestions)}::jsonb,
                    custom_questions = ${JSON.stringify(input.customQuestions)}::jsonb,
                    privacy_policy_url = ${input.privacyPolicyUrl},
                    privacy_policy_link_text = ${input.privacyPolicyLinkText},
                    consent_boxes = ${JSON.stringify(input.consentBoxes)}::jsonb,
                    thank_you_headline = ${input.thankYouHeadline},
                    thank_you_body = ${input.thankYouBody},
                    thank_you_cta_text = ${input.thankYouCtaText},
                    thank_you_cta_url = ${input.thankYouCtaUrl || null},
                    thank_you_cta_type = ${tesekkurDugmesiTuru(input)},
                    thank_you_phone = ${input.thankYouPhone || null},
                  `
            }
            updated_at = now()
          WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
        `);
        if (n === 0) throw new NotFoundException('Form bulunamadı');
        return id;
      }

      const newId = await this.insert(tx, ctx, input, {
        version: plan.nextVersion ?? current.version + 1,
        rootId: current.rootId,
      });

      // ESKİ SATIR YENİYİ İŞARET EDİYOR ve durumu `superseded` oluyor.
      // Kısıt ikisini birlikte zorunlu kılıyor (`lead_forms_supersede_chk`);
      // biri olmadan diğeri arayüzde uyarı gösterip bağlantı verememek demek.
      await tx.$executeRaw(Prisma.sql`
        UPDATE lead_forms
        SET status = 'superseded', superseded_by_id = ${newId}::uuid, updated_at = now()
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
      `);
      return newId;
    });

    return this.get(ctx, nextId);
  }

  /**
   * Siler — YALNIZCA YAYINLANMAMIŞ FORMLARI.
   *
   * Yayınlanmış bir formu kayıtlarımızdan düşürmek, Meta'da yaşamaya ve bilgi
   * toplamaya devam eden bir formu görünmez kılmak demek: gelen kişilerin
   * hangi formdan geldiği bir daha bulunamaz.
   */
  async remove(ctx: TenantContext, id: string): Promise<void> {
    await this.prisma.withTenant(ctx, async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ status: LeadFormStatus }>>(Prisma.sql`
        SELECT status FROM lead_forms
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
      `);
      if (!row) throw new NotFoundException('Form bulunamadı');
      if (row.status === 'published' || row.status === 'superseded' || row.status === 'publishing' || row.status === 'uncertain') {
        throw new BadRequestException(
          "Yayınlanmış form silinemiyor — Meta'da yaşamaya devam ediyor ve " +
            'topladığı bilgilerin kaynağı bu kayıt.',
        );
      }
      await tx.$executeRaw(Prisma.sql`
        DELETE FROM lead_forms WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
      `);
    });
  }

  // ---------------------------------------------------------------------------
  // Yayın sonucunun kaydı
  // ---------------------------------------------------------------------------

  /**
   * `geriOkumaUyarisi`: yayından sonraki geri okumanın sonucu
   * (`formGeriOkumaUyarisi`). `error` kolonuna YAZILMIYOR: form Meta'da
   * açık ve kayıt `published`; "yayınlanamadı" hatasıyla aynı kolonda
   * durması iki ayrı işi (yeniden dene / Meta'da formu düzelt) tek cümleye
   * çevirirdi.
   */
  async markPublished(
    ctx: TenantContext,
    id: string,
    externalFormId: string,
    geriOkumaUyarisi: string | null = null,
  ): Promise<void> {
    await this.prisma.withTenant(ctx, async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE lead_forms
        SET status = 'published', external_form_id = ${externalFormId},
            readback_warning = ${geriOkumaUyarisi === null ? null : geriOkumaUyarisi.slice(0, 2000)},
            published_at = now(), error = NULL, updated_at = now()
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
      `);
    });
  }

  /**
   * YALNIZ META FORM AÇMADIYSA. Kimliği yazılmış satır `failed`a ASLA
   * düşmüyor (`external_form_id IS NULL`): `failed` yeniden denenebilir
   * demek ve Meta'da ikinci form açardı.
   */
  async markFailed(ctx: TenantContext, id: string, message: string): Promise<void> {
    await this.prisma.withTenant(ctx, async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE lead_forms
        SET status = 'failed', error = ${message.slice(0, 2000)}, updated_at = now()
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid AND external_form_id IS NULL
      `);
    });
  }

  /**
   * META CEVABI BELİRSİZ (zaman aşımı, ağ, 5xx): istek ulaşmış ve form
   * açılmış olabilir. `failed` DEĞİL `uncertain`: yeniden yayın yalnız
   * bilinçli onayla. Kimliği yazılmış satıra dokunmuyor.
   */
  async markBelirsiz(ctx: TenantContext, id: string, message: string): Promise<void> {
    await this.prisma.withTenant(ctx, async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE lead_forms
        SET status = 'uncertain',
            error = ${`${FORM_YAYIN_BELIRSIZ_NOTU} Meta hatası: ${message}`.slice(0, 2000)},
            updated_at = now()
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
          AND status = 'publishing' AND external_form_id IS NULL
      `);
    });
  }

  /**
   * YAYINI SAHİPLEN — koşullu UPDATE. Aynı satır için ikinci yayın isteği
   * (iki sekme, çift tık) burada SIFIR satır alır ve Meta'ya hiç gitmez.
   * `publishBlockers` okuması tek başına yetmiyor: iki istek de "taslak"
   * görüp ikisi de form açardı.
   */
  async yayinSahiplen(ctx: TenantContext, id: string, opts: { belirsizOnayi?: boolean } = {}): Promise<boolean> {
    /*
     * `uncertain` YALNIZ BİLİNÇLİ ONAYLA sahiplenilir: kullanıcı Meta'da formun
     * açılmadığını kontrol ettiğini söyledi. Damga sıfırlanıyor, çünkü bu yeni
     * bir deneme ve onun ölüm noktası kendi damgasıyla ayrılmalı.
     */
    const durumlar = opts.belirsizOnayi ? ['draft', 'failed', 'uncertain'] : ['draft', 'failed'];
    return this.prisma.withTenant(ctx, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        UPDATE lead_forms
        SET status = 'publishing', error = NULL, meta_request_started_at = NULL, updated_at = now()
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
          AND status = ANY(${durumlar}::text[]) AND external_form_id IS NULL
        RETURNING id
      `);
      return rows.length === 1;
    });
  }

  /**
   * META İSTEĞİ BAŞLIYOR — `createLeadForm`un HEMEN öncesinde, ayrı yazım.
   * Bundan sonra süreç ölürse satır `uncertain`a ayrılır (form açılmış
   * olabilir); öncesinde ölürse `failed`a (hiçbir şey gitmedi). Yazım
   * düşerse çağıran Meta'ya GİTMEMELİ: damgasız istek, ölünce "güvenle
   * yeniden dene" sayılır ve ikinci form açabilirdi.
   */
  async metaIstegiBasladi(ctx: TenantContext, id: string): Promise<void> {
    await this.prisma.withTenant(ctx, async (tx) => {
      const n = await tx.$executeRaw(Prisma.sql`
        UPDATE lead_forms
        SET meta_request_started_at = now(), updated_at = now()
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
          AND status = 'publishing' AND external_form_id IS NULL
      `);
      if (n !== 1) throw new Error(`Meta isteği damgası yazılamadı (etkilenen satır ${n})`);
    });
  }

  /**
   * YARIM KALAN YAYINI AYIR — okuma anında, tek koşullu UPDATE.
   *
   * NEDEN OKUMADA, SÜPÜRMEDE DEĞİL: bu satırı gören ve onunla bir şey yapmak
   * isteyen tek kişi formu açan kullanıcı; liste, detay ve yayın (`get`le
   * başlıyor) hepsi buradan geçiyor. Zamanlanmış bir süpürme yeni bir iş
   * türü, kuyruk kaydı ve kendi sessiz arıza yolu demek; burada ise ayırma
   * kullanıcının baktığı anda olur ve sonucu aynı yanıtta görünür.
   *
   * Yaş eşiği `updated_at`e bakıyor: sahiplenme ve damga ikisi de onu
   * tazeliyor, yani canlı bir yayın (Meta cevabını bekleyen) eşiği aşmadan
   * dokunulmaz. Kimliği yazılmış satır zaten `published`; koşul yine de
   * `external_form_id IS NULL` taşıyor.
   */
  /**
   * AYIRMA OKUMAYI DÜŞÜREMEZ. UPDATE bir politika (RLS WITH CHECK, ileride
   * daraltılmış bir UPDATE politikası) tarafından reddedilirse liste ve
   * detay yine dönmeli: "formlarım açılmıyor" ayırmadan çok daha kötü.
   * Bu yüzden AYRI bir işlemde koşuyor (aynı işlemde düşen deyim Postgres'te
   * işlemin kalanını da öldürürdü) ve hata YUTULMUYOR, loglanıyor; satır o
   * zaman `publishing` görünür ve yeniden yayın kapalı kalır (güvenli taraf).
   */
  private async yarimKalanlariAyirGuvenli(ctx: TenantContext, kapsam: Prisma.Sql): Promise<void> {
    try {
      await this.prisma.withTenant(ctx, (tx) => this.yarimKalanYayinlariAyir(tx, kapsam));
    } catch (e) {
      this.logger.warn(`Yarım kalan form yayını ayrılamadı (okuma sürüyor): ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private async yarimKalanYayinlariAyir(tx: TxLike, kapsam: Prisma.Sql): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      UPDATE lead_forms
      SET status = CASE WHEN meta_request_started_at IS NULL THEN 'failed' ELSE 'uncertain' END,
          error = CASE WHEN meta_request_started_at IS NULL THEN ${FORM_YAYIN_YARIM_NOTU} ELSE ${FORM_YAYIN_BELIRSIZ_NOTU} END,
          updated_at = now()
      WHERE ${kapsam}
        AND status = 'publishing' AND external_form_id IS NULL
        AND updated_at < now() - make_interval(mins => ${FORM_YAYIN_YASLI_DAKIKA}::int)
    `);
  }

  /**
   * META FORM KİMLİĞİ — `createLeadForm` döner dönmez, AYRI ve KISA bir
   * yazımla. Geri okuma, karşılaştırma ve uyarının kaydı SONRAKİ adımlar;
   * onlar düşerse satır kimliğiyle `published` kalır ve geri okuma
   * uyarısı "tamamlanmadı" der. Bu yazım da düşerse satır `publishing`
   * kalır ve yeniden yayın engellenir (`publishBlockers`).
   *
   * `uncertain` DE KABUL: Meta eşikten (`FORM_YAYIN_YASLI_DAKIKA`) geç cevap
   * verirse satır bu arada belirsiz sayılmış olabilir. Kimlik geldiyse form
   * KESİN var; yazmamak, açılmış bir formu kayıtta "belirsiz" bırakmak olurdu.
   */
  async kimlikYaz(ctx: TenantContext, id: string, externalFormId: string): Promise<void> {
    await this.prisma.withTenant(ctx, async (tx) => {
      const n = await tx.$executeRaw(Prisma.sql`
        UPDATE lead_forms
        SET status = 'published', external_form_id = ${externalFormId}, published_at = now(),
            readback_warning = ${GERI_OKUMA_BEKLIYOR}, error = NULL, updated_at = now()
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid AND status IN ('publishing', 'uncertain')
      `);
      if (n !== 1) throw new Error(`Form kimliği yazılamadı (etkilenen satır ${n})`);
    });
  }

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------

  private async insert(
    tx: TxLike,
    ctx: TenantContext,
    input: LeadFormInput,
    opts: { version: number; rootId: string | null },
  ): Promise<string> {
    /**
     * KİMLİK NODE'DA ÜRETİLİYOR, `gen_random_uuid()` İLE DEĞİL.
     *
     * İlk sürümde `root_id = id` olmak zorunda (`lead_forms_root_chk`) ve
     * `gen_random_uuid()` aynı INSERT içinde iki kez yazılırsa İKİ FARKLI
     * DEĞER üretiyor — Postgres onu tek çağrıya indirgemek zorunda değil.
     * Sonuç: var olmayan bir kökü işaret eden satır, yani yabancı anahtar
     * hatası ya da (kısıt olmasaydı) sessizce kopmuş bir sürüm zinciri.
     */
    const id = randomUUID();
    const [row] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO lead_forms (
        id, org_id, client_id, social_profile_id, name, form_type, headline, intro,
        prefill_questions, custom_questions, privacy_policy_url, privacy_policy_link_text,
        consent_boxes, thank_you_headline, thank_you_body, thank_you_cta_text,
        thank_you_cta_url, thank_you_cta_type, thank_you_phone, version, root_id, created_by, updated_at
      ) VALUES (
        ${id}::uuid, ${ctx.orgId}::uuid, ${input.clientId}::uuid,
        ${input.socialProfileId}::uuid, ${input.name}, ${input.formType},
        ${input.headline || null}, ${input.intro || null},
        ${JSON.stringify(input.prefillQuestions)}::jsonb,
        ${JSON.stringify(input.customQuestions)}::jsonb,
        ${input.privacyPolicyUrl}, ${input.privacyPolicyLinkText},
        ${JSON.stringify(input.consentBoxes)}::jsonb,
        ${input.thankYouHeadline}, ${input.thankYouBody}, ${input.thankYouCtaText},
        ${input.thankYouCtaUrl || null}, ${tesekkurDugmesiTuru(input)}, ${input.thankYouPhone || null},
        ${opts.version},
        ${opts.rootId ?? id}::uuid,
        ${ctx.userId}::uuid, now()
      )
      RETURNING id
    `);
    if (!row) throw new NotFoundException('Form oluşturulamadı');
    return row.id;
  }

  /**
   * Sayfanın gerçekten bu müşteriye ait olduğunu doğrular.
   *
   * RLS kiracı sınırını koruyor ama AYNI ORGANİZASYON İÇİNDE bir müşterinin
   * formunu başka bir müşterinin sayfasına bağlamayı engellemiyor: iki satır
   * da aynı `org_id`'ye sahip. Sessiz ve ciddi bir hata — form yanlış markanın
   * sayfasında yayınlanır.
   */
  private async assertProfile(tx: TxLike, input: LeadFormInput): Promise<void> {
    /**
     * NEDEN ÜÇ AYRI CEVAP: sayfa artık ATANMAMIŞ da olabiliyor (ajansın
     * havuzunda duruyor). Üçünü tek "bulunamadı" mesajına toplamak,
     * kullanıcıyı yanlış yere bakmaya gönderirdi — atanmamış bir sayfa için
     * yapılacak şey formu düzeltmek değil, sayfayı müşteriye atamak.
     */
    const rows = await tx.$queryRaw<Array<{ client_id: string | null; profile_type: string }>>(
      Prisma.sql`
        SELECT client_id::text AS client_id, profile_type::text AS profile_type
        FROM social_profiles WHERE id = ${input.socialProfileId}::uuid
      `,
    );
    const profile = rows[0];
    if (!profile || profile.profile_type !== 'facebook_page') {
      throw new BadRequestException('Seçilen Facebook sayfası bulunamadı.');
    }
    if (profile.client_id === null) {
      throw new BadRequestException(
        'Bu Facebook sayfası henüz bir workspace’e atanmamış. Platform Bağlantıları ' +
          'ekranından sayfayı bu workspace’e ata; atanmamış sayfadan gelen kayıtlar yazılamaz.',
      );
    }
    if (profile.client_id !== input.clientId) {
      throw new BadRequestException('Seçilen Facebook sayfası bu workspace’e ait değil.');
    }
  }

  private async select(
    tx: TxLike,
    where: Prisma.Sql,
    order: Prisma.Sql = Prisma.sql`f.created_at DESC`,
  ): Promise<FormRow[]> {
    return tx.$queryRaw<FormRow[]>(Prisma.sql`
      SELECT
        f.id, f.org_id, f.client_id, f.social_profile_id,
        sp.name AS social_profile_name, sp.external_id AS page_external_id,
        f.name, f.form_type, f.headline, f.intro,
        f.prefill_questions, f.custom_questions,
        f.privacy_policy_url, f.privacy_policy_link_text, f.consent_boxes,
        f.thank_you_headline, f.thank_you_body, f.thank_you_cta_text, f.thank_you_cta_url,
        f.thank_you_cta_type, f.thank_you_phone, f.readback_warning,
        f.status, f.external_form_id, f.version, f.root_id, f.superseded_by_id,
        f.error, f.published_at, f.created_at
      FROM lead_forms f
      JOIN social_profiles sp ON sp.id = f.social_profile_id
      WHERE ${where}
      ORDER BY ${order}
    `);
  }
}

function toRecord(row: FormRow): LeadFormRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    socialProfileId: row.social_profile_id,
    socialProfileName: row.social_profile_name,
    name: row.name,
    formType: row.form_type,
    headline: row.headline,
    intro: row.intro,
    prefillQuestions: row.prefill_questions ?? [],
    customQuestions: row.custom_questions ?? [],
    privacyPolicyUrl: row.privacy_policy_url,
    privacyPolicyLinkText: row.privacy_policy_link_text,
    consentBoxes: row.consent_boxes ?? [],
    thankYouHeadline: row.thank_you_headline,
    thankYouBody: row.thank_you_body,
    thankYouCtaText: row.thank_you_cta_text,
    thankYouCtaUrl: row.thank_you_cta_url,
    // Eski satırda kolon boş: tür eski kuraldan (adres varsa site) türetilir.
    thankYouCtaType: tesekkurDugmesiTuru({ thankYouCtaType: row.thank_you_cta_type, thankYouCtaUrl: row.thank_you_cta_url }),
    thankYouPhone: row.thank_you_phone,
    readbackWarning: row.readback_warning,
    status: row.status,
    externalFormId: row.external_form_id,
    version: row.version,
    rootId: row.root_id,
    supersededById: row.superseded_by_id,
    error: row.error,
    publishedAt: row.published_at ? row.published_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

/** Kayıt → girdi. Sürüm kararı ikisini karşılaştırarak veriliyor. */
export function toInput(record: LeadFormRecord): LeadFormInput {
  return {
    clientId: record.clientId,
    socialProfileId: record.socialProfileId,
    name: record.name,
    formType: record.formType,
    headline: record.headline ?? undefined,
    intro: record.intro ?? undefined,
    prefillQuestions: record.prefillQuestions,
    customQuestions: record.customQuestions,
    privacyPolicyUrl: record.privacyPolicyUrl,
    privacyPolicyLinkText: record.privacyPolicyLinkText,
    consentBoxes: record.consentBoxes,
    thankYouHeadline: record.thankYouHeadline,
    thankYouBody: record.thankYouBody,
    thankYouCtaText: record.thankYouCtaText,
    thankYouCtaUrl: record.thankYouCtaUrl ?? undefined,
    thankYouCtaType: record.thankYouCtaType,
    thankYouPhone: record.thankYouPhone ?? undefined,
  };
}
