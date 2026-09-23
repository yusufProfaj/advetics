import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertAssigned } from '../common/utils/ad-account-assignment';
import type { DiscoveredLead } from '../modules/connections/provider.types';
import { PlatformApiError } from '../modules/connections/provider.types';
import { ProviderRegistry } from '../modules/connections/provider.registry';
import { CryptoService } from '../crypto/crypto.service';
import { PrismaAdminService } from '../prisma/prisma-admin.service';
import { QuotaGuardService } from './quota-guard.service';

/**
 * Potansiyel müşteri çekme ve mutabakat.
 *
 * İKİ GİRİŞ, TEK YAZMA YOLU:
 *
 *   · `fetchOne` — webhook'un bildirdiği tek kayıt. Anlık.
 *   · `reconcile` — bir formun kaçmış kayıtları. Periyodik.
 *
 * İkisi de `persist` üzerinden yazıyor ve `ON CONFLICT DO NOTHING` ile
 * mükerrer kayıt zararsız hâle geliyor. Örtüşmeyi ENGELLEMİYORUZ: iki yolun
 * çakışması, birinin sessizce ölmesine karşı tek korumamız.
 *
 * MUTABAKAT NEDEN ZORUNLU: Meta webhook teslimini garanti etmiyor. Sunucumuz
 * bir dakika yanıt vermezse o bildirim kayboluyor ve bir daha gelmiyor.
 * Kaybolan bildirim = kaybolan müşteri, ve hiçbir yerde hata yok.
 */

/**
 * İlk taramanın geriye dönük penceresi.
 *
 * Yeni bir form bağlandığında tüm geçmişi çekmek cazip ama iki sorun var:
 * kota ve alaka. 30 günden eski bir kayıt zaten aranmış ya da soğumuş
 * olacak; onu bugün "yeni potansiyel müşteri" diye göstermek ajansı yanlış
 * yönlendirir.
 */
const FIRST_SCAN_DAYS = 30;

/**
 * Taramanın imleci geriye çekme payı.
 *
 * İmleci son okunan kaydın tam zamanına koymak, aynı saniyede oluşan bir
 * kaydı atlamak demek. Beş dakikalık örtüşme mükerrer kayıt üretiyor ama
 * mükerrer zaten engelleniyor — atlanan kaydın telafisi yok.
 */
const OVERLAP_MS = 5 * 60 * 1000;

@Injectable()
export class LeadSyncService {
  private readonly logger = new Logger(LeadSyncService.name);

  constructor(
    private readonly db: PrismaAdminService,
    private readonly providers: ProviderRegistry,
    private readonly crypto: CryptoService,
    private readonly quota: QuotaGuardService,
  ) {}

  // ---------------------------------------------------------------------------
  // Webhook yolu
  // ---------------------------------------------------------------------------

  async fetchOne(params: {
    socialProfileId: string;
    externalLeadId: string;
  }): Promise<{ rows: number; note: string }> {
    const profile = await this.loadProfile(params.socialProfileId);
    const provider = this.providers.get('meta');

    await this.acquire(params.socialProfileId);

    const lead = await provider.fetchLead({
      pageAccessToken: profile.pageToken,
      externalLeadId: params.externalLeadId,
      onRateLimit: (snapshot) =>
        this.quota.record({
          platform: 'meta',
          adAccountId: params.socialProfileId,
          endpoint: 'leads:fetch',
          snapshot,
        }),
    });

    const written = await this.persist(profile, [lead], 'webhook');
    return {
      rows: written,
      // "0 satır" BAŞARISIZLIK DEĞİL: kayıt zaten mutabakat taramasıyla
      // gelmiş olabilir. Notun bunu söylemesi, iş listesinde sıfırı görenin
      // arıza aramasını engelliyor.
      note: written === 0 ? 'kayıt zaten vardı' : '1 kayıt eklendi',
    };
  }

  // ---------------------------------------------------------------------------
  // Mutabakat yolu
  // ---------------------------------------------------------------------------

  /**
   * ═══ FORM LİSTESİNİN KAYNAĞI META, KENDİ TABLOMUZ DEĞİL ═══
   *
   * Bu fonksiyon bir süre yalnızca `lead_forms` tablosunu geziyordu: panelde
   * ÜRETİLMİŞ formlar. Ajansların formlarının çoğu ise doğrudan Meta Ads
   * Manager'da kurulmuş ve onların bizde satırı yok — o formlar HİÇ
   * taranmıyordu. Belirti kullanıcının cümlesiyle "potansiyel müşteriler
   * gelmiyor": reklam yayında, form doldruluyor, panel boş ve hiçbir yerde
   * hata yok.
   *
   * Bugün kaynak sayfanın kendisi: müşteriye atanmış her Facebook sayfasının
   * altındaki BÜTÜN formlar okunuyor, kimin ürettiği fark etmiyor.
   *
   * SAYFA BAŞINA ve FORM BAŞINA AYRI HATA YÖNETİMİ. Bir sayfanın token'ı
   * bozuksa diğerleri taranmaya devam ediyor; tek try/catch olsaydı ilk hata
   * bütün müşteriyi karanlıkta bırakırdı.
   */
  async reconcile(
    clientId: string,
    opts: { gecmis?: boolean } = {},
  ): Promise<{ rows: number; note: string; notlar: string[] }> {
    const profiles = await this.db.$queryRaw<
      Array<{ id: string; name: string; external_id: string; token_var: boolean }>
    >(Prisma.sql`
      SELECT sp.id::text AS id, sp.name, sp.external_id,
             (sp.page_access_token_enc IS NOT NULL) AS token_var
      FROM social_profiles sp
      WHERE sp.client_id = ${clientId}::uuid
        AND sp.profile_type = 'facebook_page'
      ORDER BY sp.name
    `);

    if (profiles.length === 0) {
      /*
       * SEBEP YAZILIYOR. "0 kayıt" tek başına, sistemin bozuk olduğunu
       * düşündürüyor; oysa yapılacak iş belli: sayfayı workspace'e ata.
       */
      return {
        rows: 0,
        note: 'atanmış Facebook sayfası yok',
        notlar: [
          'Bu workspace’e atanmış bir Facebook sayfası yok. ' +
            'Anlık form kayıtları sayfanın altında yaşıyor; Platform Bağlantıları ' +
            'ekranından sayfayı bu workspace’e ata.',
        ],
      };
    }

    let total = 0;
    let basarisiz = 0;
    const notlar: string[] = [];

    for (const profile of profiles) {
      if (!profile.token_var) {
        basarisiz++;
        notlar.push(
          `${profile.name}: sayfa token’ı yok. Meta bağlantısını ` +
            '`leads_retrieval` izniyle yeniden kur.',
        );
        continue;
      }

      try {
        const sonuc = await this.sayfayiTara(clientId, profile, opts.gecmis === true);
        total += sonuc.rows;
        notlar.push(`${profile.name}: ${sonuc.not}`);
      } catch (err) {
        basarisiz++;
        const mesaj = err instanceof Error ? err.message : String(err);
        this.logger.error(`Sayfa ${profile.name} taranamadı: ${mesaj}`);
        notlar.push(`${profile.name}: ${mesaj}`);
      }
    }

    /**
     * TÜMÜ BAŞARISIZSA İŞ BAŞARISIZ.
     *
     * Kısmi başarıyı başarı saymak doğru (bir sayfa bozuk, diğerleri
     * çalışıyor) ama hepsinin patladığı bir turu "tamamlandı" diye kaydetmek,
     * iş listesinde yeşil görünen tamamen ölü bir mutabakat demek olurdu.
     */
    if (basarisiz === profiles.length) {
      throw new PlatformApiError(
        'meta',
        'permanent',
        `${basarisiz} sayfanın hiçbiri taranamadı: ${notlar.join(' · ')}`,
      );
    }

    return {
      rows: total,
      note: `${profiles.length - basarisiz}/${profiles.length} sayfa tarandı, ${total} yeni kayıt`,
      notlar,
    };
  }

  /**
   * Bir sayfanın bütün formlarını tarar.
   *
   * FORM LİSTESİ META'DAN, ama kendi yayınladığımız formlar da BİRLEŞTİRİLİYOR:
   * Meta listesi sayfa sınırına takılabiliyor ve bizde satırı olan bir formun
   * o yüzden atlanması, kendi kurduğumuz akışın sessizce çalışmaması olurdu.
   */
  private async sayfayiTara(
    clientId: string,
    profile: { id: string; name: string; external_id: string },
    gecmis: boolean,
  ): Promise<{ rows: number; not: string }> {
    const yuklenen = await this.loadProfile(profile.id);
    const provider = this.providers.get('meta');

    await this.acquire(profile.id);
    const metaFormlari = await provider.listPageLeadForms({
      pageAccessToken: yuklenen.pageToken,
      pageExternalId: profile.external_id,
      onRateLimit: (snapshot) =>
        this.quota.record({
          platform: 'meta',
          adAccountId: profile.id,
          endpoint: 'leads:forms',
          snapshot,
        }),
    });

    const bizimkiler = await this.db.$queryRaw<Array<{ external_form_id: string; name: string }>>(
      Prisma.sql`
        SELECT DISTINCT ON (f.external_form_id) f.external_form_id, f.name
        FROM lead_forms f
        WHERE f.social_profile_id = ${profile.id}::uuid
          AND f.external_form_id IS NOT NULL
        ORDER BY f.external_form_id, f.created_at DESC
      `,
    );

    const adlar = new Map<string, string>();
    for (const f of metaFormlari) adlar.set(f.externalFormId, f.name);
    // KENDİ ADIMIZ ÖNCELİKLİ: panelde form neyse kayıtta da o yazsın.
    for (const f of bizimkiler) adlar.set(f.external_form_id, f.name);

    if (adlar.size === 0) {
      return { rows: 0, not: 'bu sayfada anlık form yok' };
    }

    let rows = 0;
    let basarisiz = 0;

    for (const [externalFormId, ad] of adlar) {
      try {
        rows += await this.reconcileForm(clientId, profile.id, externalFormId, ad, gecmis);
      } catch (err) {
        basarisiz++;
        const mesaj = err instanceof Error ? err.message : String(err);
        this.logger.error(`Form ${ad} taranamadı: ${mesaj}`);
        await this.db.$executeRaw(Prisma.sql`
          UPDATE lead_sync_cursors
          SET last_error = ${mesaj.slice(0, 1000)}, last_run_at = now(), updated_at = now()
          WHERE external_form_id = ${externalFormId}
        `);
      }
    }

    // SESSİZ KESME YOK: kaç form tarandı, kaçı düştü, kaç kayıt geldi.
    const not =
      basarisiz > 0
        ? `${adlar.size - basarisiz}/${adlar.size} form tarandı, ${rows} yeni kayıt`
        : `${adlar.size} form tarandı, ${rows} yeni kayıt`;
    return { rows, not };
  }

  private async reconcileForm(
    clientId: string,
    socialProfileId: string,
    externalFormId: string,
    formAdi: string,
    gecmis: boolean,
  ): Promise<number> {
    const profile = await this.loadProfile(socialProfileId);
    const provider = this.providers.get('meta');

    const [cursor] = await this.db.$queryRaw<Array<{ synced_through: Date | null }>>(Prisma.sql`
      SELECT synced_through FROM lead_sync_cursors WHERE external_form_id = ${externalFormId}
    `);

    /*
     * ═══ GEÇMİŞ ÇEKİMİ İMLECİ YOK SAYIYOR ═══
     *
     * Kullanıcı "son 30 günün bütün kayıtlarını getir" dediğinde imleçten
     * devam etmek hiçbir şey getirmez: imleç zaten en yeni kayıtta duruyor.
     * Mükerrer kayıt tehlikesi YOK — `ON CONFLICT (external_lead_id) DO
     * NOTHING` onu veritabanı seviyesinde engelliyor ve engel bizim
     * kontrolümüze değil, tekil indekse dayanıyor.
     */
    const since =
      gecmis || !cursor?.synced_through
        ? new Date(Date.now() - FIRST_SCAN_DAYS * 86_400_000)
        : new Date(cursor.synced_through.getTime() - OVERLAP_MS);

    await this.acquire(socialProfileId);

    const leads = await provider.fetchFormLeads({
      pageAccessToken: profile.pageToken,
      externalFormId,
      since,
      onRateLimit: (snapshot) =>
        this.quota.record({
          platform: 'meta',
          adAccountId: socialProfileId,
          endpoint: 'leads:reconcile',
          snapshot,
        }),
    });

    const written = await this.persist(profile, leads, 'reconcile', formAdi);

    /**
     * İMLEÇ EN YENİ KAYDA GÖRE, "şimdi"ye göre DEĞİL.
     *
     * "Şimdi" yazmak, sayfa sınırına takılıp yarım okuduğumuz bir turda
     * okunmamış kayıtların üzerinden atlamak demek — kalıcı kayıp. En yeni
     * okunan kayıt, gerçekten nereye kadar geldiğimizi söylüyor.
     */
    const newest = leads.reduce<Date | null>(
      (acc, l) => (!acc || l.submittedAt > acc ? l.submittedAt : acc),
      null,
    );

    await this.db.$executeRaw(Prisma.sql`
      INSERT INTO lead_sync_cursors (
        id, org_id, client_id, social_profile_id, external_form_id,
        synced_through, last_run_at, last_new_count, last_error, updated_at
      ) VALUES (
        gen_random_uuid(), ${profile.orgId}::uuid, ${clientId}::uuid,
        ${socialProfileId}::uuid, ${externalFormId},
        ${newest}, now(), ${written}, NULL, now()
      )
      ON CONFLICT (external_form_id) DO UPDATE SET
        -- İMLEÇ GERİ GİTMİYOR. Boş bir tur mevcut imleci silseydi, sonraki
        -- tarama 30 gün geriden başlar ve her turda aynı kayıtları yeniden
        -- okurdu.
        synced_through = GREATEST(
          lead_sync_cursors.synced_through,
          COALESCE(${newest}, lead_sync_cursors.synced_through)
        ),
        last_run_at = now(),
        last_new_count = ${written},
        last_error = NULL,
        updated_at = now()
    `);

    if (written > 0) {
      /**
       * MUTABAKAT KAYIT BULDUYSA WEBHOOK ÇALIŞMIYOR DEMEKTİR.
       *
       * Tarama bir yedek yol; her şey düzgünse hiçbir şey bulmaması gerekir.
       * Bulduğu her kayıt, webhook'un o sayfa için sessizce öldüğünün
       * kanıtı ve bu, kendiliğinden hiçbir yerde görünmeyecek bir arıza.
       */
      this.logger.warn(
        `Mutabakat ${written} kayıt buldu (form ${externalFormId}) — ` +
          'webhook bu sayfa için çalışmıyor olabilir',
      );
    }
    return written;
  }

  // ---------------------------------------------------------------------------
  // Yazma
  // ---------------------------------------------------------------------------

  private async persist(
    profile: ProfileRow,
    leads: DiscoveredLead[],
    source: 'webhook' | 'reconcile',
    /**
     * Meta'dan okunan form adı — bizde satırı OLMAYAN formlar için.
     *
     * Bu parametre olmadan Meta Ads Manager'da kurulmuş bir formdan gelen
     * kaydın adı NULL kalıyordu ve panelde "hangi form" sorusu cevapsızdı:
     * kayıt var, nereden geldiği yok.
     */
    formAdiYedegi?: string | null,
  ): Promise<number> {
    let written = 0;
    /*
     * FORM ADI ÖNBELLEĞİ — TUR BAŞINA.
     *
     * Aynı formdan gelen on kayıt için Meta'ya on kez sormak gereksiz çağrı
     * ve kota. Önbellek yalnızca bu çağrı boyunca yaşıyor: kalıcı bir tablo
     * tutmak, Meta'da adı değişen bir formun panelde eski adıyla kalması
     * demek olurdu.
     */
    const metaAdlari = new Map<string, string | null>();

    for (const lead of leads) {
      if (!lead.externalLeadId) continue;

      const contact = extractContact(lead.fields);
      /**
       * İLETİŞİM BİLGİSİ OLMAYAN KAYIT YAZILMIYOR.
       *
       * Üçü de boşsa elimizde ulaşılamayan bir kayıt var demektir ve bu,
       * çekme çağrısının boş döndüğü ama hatanın yutulduğu durumun imzası.
       * Veritabanı kısıtı da aynı şeyi söylüyor; burada durdurup loglamak,
       * kısıt ihlalini iş hatasına çevirmekten anlaşılır.
       */
      if (!contact.fullName && !contact.email && !contact.phone) {
        this.logger.warn(
          `Kayıt ${lead.externalLeadId} iletişim bilgisi içermiyor — atlandı`,
        );
        continue;
      }

      // Reklam ve form adı KOPYALANIYOR, join'le çözülmüyor: ikisi de
      // sonradan silinebiliyor ve atıf o zaman kaybolurdu.
      const campaignName = lead.externalAdId
        ? await this.campaignNameFor(lead.externalAdId)
        : null;
      const formName = lead.externalFormId
        ? await this.formNameFor(lead.externalFormId)
        : null;
      /*
       * ═══ FORM ADI ÜÇ KAYNAKTAN, BU SIRAYLA ═══
       *
       *   1. kendi tablomuz (panelde üretilmiş form),
       *   2. taramanın Meta'dan getirdiği ad,
       *   3. tek kayıt için Meta'ya sorulan ad.
       *
       * Üçüncüsü WEBHOOK YOLU İÇİN: oradan tek bir kayıt geliyor ve form
       * listesi hiç okunmuyor. Bu olmadan Meta Ads Manager'da kurulmuş bir
       * formdan düşen kaydın adı NULL kalıyordu ve panelde "hangi form"
       * sorusu cevapsızdı — kayıt var, nereden geldiği yok.
       */
      let formAdi = formName?.name ?? formAdiYedegi ?? null;
      if (!formAdi && lead.externalFormId) {
        formAdi = await this.metaFormAdi(profile, lead.externalFormId, metaAdlari);
      }

      const n = await this.db.$executeRaw(Prisma.sql`
        INSERT INTO leads (
          id, org_id, client_id, external_lead_id, lead_form_id, social_profile_id,
          external_ad_id, campaign_name, lead_form_name,
          full_name, email, phone, fields, source, submitted_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${profile.orgId}::uuid, ${profile.clientId}::uuid,
          ${lead.externalLeadId},
          ${formName?.id ?? null}::uuid, ${profile.id}::uuid,
          ${lead.externalAdId}, ${campaignName}, ${formAdi},
          ${contact.fullName}, ${contact.email}, ${contact.phone},
          ${JSON.stringify(lead.fields)}::jsonb, ${source}, ${lead.submittedAt}, now()
        )
        -- MÜKERRER SESSİZCE DÜŞÜYOR ve bu TASARIM.
        --
        -- Webhook ile tarama aynı kaydı görüyor. Çakışmayı hata saymak, her
        -- mutabakat turunu kırmızı yapardı; güncelleme yapmak ise ajansın
        -- girdiği durumu ve notu ezerdi.
        ON CONFLICT (external_lead_id) DO NOTHING
      `);
      written += n;
    }

    return written;
  }

  /**
   * Formun adını Meta'dan okur — YALNIZCA bizde satırı yoksa.
   *
   * ÇAĞRI DÜŞERSE KAYIT YAZILMAYA DEVAM EDİYOR. Ad bir süsleme alanı;
   * onun için kişisel veri taşıyan bir kaydı düşürmek, gerçek bir müşteriyi
   * kaybetmek olurdu.
   */
  private async metaFormAdi(
    profile: ProfileRow,
    externalFormId: string,
    onbellek: Map<string, string | null>,
  ): Promise<string | null> {
    const kayitli = onbellek.get(externalFormId);
    if (kayitli !== undefined) return kayitli;

    let ad: string | null = null;
    try {
      // İSTEĞE BAĞLI METOT: arayüzde `?` ile duruyor çünkü yalnızca Meta'da
      // anlık form var. Yoksa ad boş kalıyor, kayıt yine yazılıyor.
      ad =
        (await this.providers.get('meta').fetchLeadFormName?.({
          pageAccessToken: profile.pageToken,
          externalFormId,
        })) ?? null;
    } catch (err) {
      this.logger.warn(
        `Form adı okunamadı (${externalFormId}): ${err instanceof Error ? err.message : err}`,
      );
    }
    onbellek.set(externalFormId, ad);
    return ad;
  }

  private async campaignNameFor(externalAdId: string): Promise<string | null> {
    const [row] = await this.db.$queryRaw<Array<{ name: string }>>(Prisma.sql`
      SELECT c.name FROM ads a
      JOIN campaigns c ON c.id = a.campaign_id
      WHERE a.platform = 'meta' AND a.external_id = ${externalAdId}
      LIMIT 1
    `);
    return row?.name ?? null;
  }

  private async formNameFor(
    externalFormId: string,
  ): Promise<{ id: string; name: string } | null> {
    const [row] = await this.db.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
      SELECT id::text AS id, name FROM lead_forms
      WHERE external_form_id = ${externalFormId}
      LIMIT 1
    `);
    return row ?? null;
  }

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------

  private async loadProfile(socialProfileId: string): Promise<ProfileRow> {
    const found = await this.db.socialProfile.findUniqueOrThrow({
      where: { id: socialProfileId },
    });

    // ATANMAMIŞ SAYFA BURADA DURUR. `leads.client_id` NOT NULL ve atanmamış
    // bir sayfadan gelen kaydın hangi müşteriye ait olduğu BİLİNMİYOR — tahmin
    // etmek, kişisel veriyi yanlış markanın CRM'ine yazmak olurdu.
    const profile = assertAssigned(found);

    if (!profile.pageAccessTokenEnc) {
      throw new PlatformApiError(
        'meta',
        'permanent',
        `${profile.name}: sayfa token'ı yok. Bağlantıyı leads_retrieval iznyle yeniden kur.`,
      );
    }

    return {
      id: profile.id,
      clientId: profile.clientId,
      orgId: profile.orgId,
      pageToken: this.crypto.decrypt(Buffer.from(profile.pageAccessTokenEnc)),
    };
  }

  private async acquire(socialProfileId: string): Promise<void> {
    const gate = await this.quota.acquire({
      platform: 'meta',
      // Kota anahtarı SOSYAL PROFİL: çağrılar sayfa token'ıyla gidiyor ve
      // reklam hesabının kotasından düşmüyor.
      adAccountId: socialProfileId,
      layer: 'interactive',
    });
    if (!gate.allowed) {
      throw new PlatformApiError('meta', 'rate_limited', `Kota engeli: ${gate.reason}`);
    }
  }
}

interface ProfileRow {
  id: string;
  clientId: string;
  orgId: string;
  pageToken: string;
}

/**
 * Alanlardan ad/e-posta/telefonu çıkarır.
 *
 * Meta'nın standart alan adları sabit (`full_name`, `email`, `phone_number`)
 * ama tek parça ad soyad kullanan formlarda `first_name` + `last_name` ayrı
 * geliyor. İkisini de karşılamak gerekiyor, yoksa o formlarda ad alanı boş
 * kalır ve kayıt "iletişim bilgisi yok" diye atlanabilir.
 */
export function extractContact(fields: Array<{ name: string; value: string }>): {
  fullName: string | null;
  email: string | null;
  phone: string | null;
} {
  const get = (name: string): string | null => {
    const f = fields.find((x) => x.name.toLowerCase() === name);
    const v = f?.value?.trim();
    return v ? v : null;
  };

  const full = get('full_name');
  const first = get('first_name');
  const last = get('last_name');
  // Parçalı ad boşsa `null` — boş dize yazmak, kaydı "iletişim bilgisi var"
  // saydırıp kısıtı da geçerdi.
  const joined = [first, last].filter(Boolean).join(' ').trim();

  return {
    fullName: full ?? (joined.length > 0 ? joined : null),
    email: get('email'),
    // `phone` de deneniyor: özel sorularla kurulan formlarda alan adı
    // standart olmayabiliyor.
    phone: get('phone_number') ?? get('phone'),
  };
}
