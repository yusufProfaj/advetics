import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AKTARIM_IZINLERI,
  aktarimEngeli,
  aktarimIstemi,
  NIYET_KATALOGU,
  type AktarimAtlamaNedeni,
  type AktarimSatiriGirdisi,
  dagilimToplamDenetimi,
  duzenlenebilirMi,
  gecisMumkunMu,
  matrisButceDenetimi,
  paraOndaligi,
  PLAN_EYLEMLERI,
  PLAN_GECISLERI,
  tutarAyristir,
  HUNI_ETIKETLERI,
  type AktarimSonucu,
  type DagilimKaydetGirdisi,
  type DagilimOnerisi,
  type DagilimSatiri,
  type HuniKatmani,
  type KelimeAraGirdisi,
  type KelimeErisimDurumu,
  type KelimeGuncelleGirdisi,
  type KelimeSatiri,
  type MatrisKaydetGirdisi,
  type MatrisSatiri,
  type NiyetKodu,
  type Permission,
  type PlanDetayi,
  type PlanDurumu,
  type PlanEylemGirdisi,
  type PlanEylemi,
  type PlanListesi,
  type PlanOlusturGirdisi,
  type PlanOzeti,
  type StratejiPlatformu,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { dayanakSatirlari, kaynakBelirle, oneriHesapla, oneriPenceresi, type PlatformDayanagi } from './dagilim-oneri';
import { kelimeHesabi } from './kelime-isleyici';
import { medyaPlaniPdf } from './medya-plani-pdf';
import { StratejiKelimeKuyrugu } from './kelime-kuyrugu';
import { seviyeLiterali } from '../metrics/seviye-literali';

/**
 * ═══ ADVSTRATEGY — AYLIK MEDYA PLANI SERVİSİ ═══
 *
 * Sözleşme `packages/shared/src/strateji/`, kararlar `docs/advstrategy/
 * MIMARI.md`. Bu dosya tip TANIMLAMIYOR; dönüş şekilleri sözleşmeden.
 *
 * ÜÇ KAPI HER YAZMADA, BU SIRAYLA:
 *   1. Plan `taslak` mı (`duzenlenebilirMi`). Onaydaki plan değişmez:
 *      müşterinin onayladığı belge ile aktarılan belge ayrışırdı.
 *   2. Gövdedeki `surum` satırdakiyle aynı mı. Değilse 409: başka biri
 *      arada değiştirdi ve bu yazım onun yazdığını GÖRMEDEN ezerdi.
 *   3. Yazım + `surum = surum + 1` AYNI transaction'da, satır kilitli
 *      (`FOR UPDATE`). Kilitsiz iki istek aynı sürümü okuyup ikisi de
 *      geçerdi.
 */

/** Ö-1 ÖLÇÜLDÜ (2026-10-08, Polimek - Türkiye, v25): Keyword Planner ERİŞİMİ VAR. */
export const KELIME_ERISIM_OLCULEN: KelimeErisimDurumu = 'var';

/**
 * Kuyrukta ya da koşuyor görünen bir arama bu süreden eskiyse TAKILMIŞ
 * sayılır. İşçi deploy sırasında ölünce iş Redis'ten düşebiliyor ve plan
 * satırı sonsuza kadar "aranıyor" der (CLAUDE.md "sync_jobs satırı bir niyet
 * kaydı, kuyruk ise gerçek"). 1 QPS kuyrukta bir arama saniyeler sürüyor;
 * 15 dakika yüzlerce aramalık birikme payı.
 */
export const KELIME_ARAMA_ZAMAN_ASIMI_DK = 15;

/** Liste ucu en çok bu kadar plan döndürür; toplam ayrıca söylenir (sessiz kesme yok). */
export const PLAN_LISTE_SINIRI = 100;

/**
 * Eylem başına GEREKEN izinlerin TAMAMI. Aktarım iki anahtar istiyor
 * (`AKTARIM_IZINLERI`: planı aktarmak + AdvCampaign'de reklam kurmak); uç
 * yalnız `strategy.write` ile korunuyor, ikinci anahtar serviste. Liste
 * sözleşmeden: buraya elle yazılsaydı panelin "aktar" düğmesi ile sunucunun
 * kabulü ayrışırdı.
 */
const EYLEM_IZINLERI: Record<PlanEylemi, readonly Permission[]> = {
  onaya_gonder: ['strategy.write'],
  geri_cek: ['strategy.write'],
  onayla: ['strategy.approve'],
  aktar: AKTARIM_IZINLERI,
  iptal: ['strategy.write'],
};

/** Aktarılamayan satırın kullanıcıya söylenen nedeni (400 mesajı). */
const ATLAMA_METNI: Record<AktarimAtlamaNedeni, string> = {
  niyet_desteklenmiyor: 'amacı AdvCampaign henüz kurmuyor',
  platform_kapali: 'platformu AdvCampaign’de henüz açık değil',
  kaynak_silinmis: 'kitlesi ya da görseli silinmiş',
  butce_sifir: 'bütçesi sıfır',
};

/** Toplam seviyesi: metrik servisindeki `TOTALS_LEVEL` ile aynı (gerekçe aşağıda, `dagilimOner`). */
const TOPLAM_SEVIYESI = seviyeLiterali('campaign');

type Tx = Parameters<Parameters<PrismaService['withTenant']>[1]>[0];

interface PlanSatiri {
  id: string;
  org_id: string;
  client_id: string;
  donem: string;
  durum: PlanDurumu;
  surum: number;
  toplam_butce_micros: string;
  para_birimi: string;
  onaylayan_user_id: string | null;
  onaylayan_ad: string | null;
  onay_rolu: 'musteri' | 'ajans' | null;
  onay_zamani: Date | null;
  onaylanan_surum: number | null;
  aktarim: AktarimSonucu | null;
  notu: string | null;
  son_oneri: DagilimOnerisi | null;
  kelime_erisim: KelimeErisimDurumu | null;
  kelime_arama: 'bos' | 'kuyrukta' | 'calisiyor' | 'bitti' | 'hata';
  kelime_arama_zamani: Date | null;
  kelime_son_hata: string | null;
  kelime_toplam: number | null;
  dagitilan_micros: string;
  created_at: Date;
  updated_at: Date;
}

/*
 * Plan SELECT'i TEK YERDE. Satır tipine alan eklenip buraya eklenmezse
 * `$queryRaw<T>` susar ve alan `undefined` gelir (CLAUDE.md); iki kopya
 * olsaydı biri mutlaka geride kalırdı. Kullanıcı adı LEFT JOIN: `users`
 * politikası dar, INNER JOIN planı SESSİZCE süzerdi (rapor planı dersi).
 */
function planSecimi(kosul: Prisma.Sql, kilit: boolean): Prisma.Sql {
  return Prisma.sql`
    SELECT p.id::text, p.org_id::text, p.client_id::text, p.donem, p.durum, p.surum,
           p.toplam_butce_micros::text, p.para_birimi, p.onaylayan_user_id::text,
           u.full_name AS onaylayan_ad, p.onay_rolu, p.onay_zamani, p.onaylanan_surum,
           p.aktarim, p.notu, p.son_oneri, p.kelime_erisim, p.kelime_arama,
           p.kelime_arama_zamani, p.kelime_son_hata, p.kelime_toplam,
           COALESCE((SELECT SUM(d.tutar_micros) FROM strateji_dagilimlari d WHERE d.plan_id = p.id), 0)::text AS dagitilan_micros,
           p.created_at, p.updated_at
      FROM strateji_planlari p
      LEFT JOIN users u ON u.id = p.onaylayan_user_id
     WHERE ${kosul}
     ${kilit ? Prisma.sql`FOR UPDATE OF p` : Prisma.empty}`;
}

/** Kuyruğa alınamayan aramanın plana yazılan cümlesi (ayrıntı log'da). */
export const KUYRUK_HATASI = 'Arama başlatılamadı. Biraz sonra yeniden deneyin.';

@Injectable()
export class StratejiService {
  private readonly logger = new Logger('Strateji');

  /** Aktarımda açılan oturumun `model` kolonu: AdvCampaign'in kendi açılışıyla aynı değer. */
  private readonly modelAdi: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly kuyruk: StratejiKelimeKuyrugu,
    // İsteğe bağlı YALNIZ TypeScript'te (testler iki argümanla kuruyor);
    // `@Optional` YOK, yani Nest CONFIG'i bulamazsa açılışta patlar.
    @Inject(CONFIG) config?: AppConfig,
  ) {
    this.modelAdi = config?.yapayZeka.model ?? 'test';
  }

  // ── Aktarım (MIMARI § 6.1) ───────────────────────────────────────────

  /**
   * Onaylı plan → AdvCampaign. Platforma YAZMAZ (Ç-2): her aktarılabilir
   * matris satırı için hazır doldurulmuş bir oturum açar.
   *
   * KISA TRANSACTION'LAR. Okuma bir transaction, her oturum kendi
   * transaction'ı, son durum yazımı bir transaction. Yarıda düşerse plan
   * `onaylandi` kalır ve açılmış oturumlar YENİDEN AÇILMAZ (tekil kısmi
   * indeks + ON CONFLICT: var olan oturum aktarılmış sayılır). Tekrar deneme
   * yalnız eksikleri tamamlar.
   *
   * HİÇBİR SATIR AKTARILAMAZSA plan `onaylandi` kalır ve 400 nedenleri
   * sayar: boş bir aktarımı "aktarıldı" saymak, müşterinin onayladığı planın
   * hiçbir yere gitmediğini gizlerdi.
   */
  async aktar(ctx: TenantContext, id: string, surum: number): Promise<PlanDetayi> {
    if (!AKTARIM_IZINLERI.every((i) => ctx.permissions.includes(i))) {
      throw new ForbiddenException('Planı aktarmak için reklam kurma yetkisi de gerekiyor.');
    }
    const okuma = await this.prisma.withTenant(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, true);
      if (!gecisMumkunMu(p.durum, 'aktar')) throw new ConflictException(gecisMesaji(p.durum, 'aktar'));
      if (p.surum !== surum) throw new ConflictException(SURUM_MESAJI);
      // Aktarım ONAYLANAN sürümü taşır. Onaydan sonra düzenleme yolu yok,
      // ama bu kontrol o kuralın bir gün gevşemesine karşı son kapı.
      if (p.onaylanan_surum !== p.surum) throw new ConflictException('Plan onaylandıktan sonra değişmiş; yeniden onaylanmalı.');
      // org_id HEDEF WORKSPACE'TEN ("tüm şirketler" modunda ctx.orgId ev şirketi).
      const [c] = await tx.$queryRaw<Array<{ org_id: string }>>(Prisma.sql`
        SELECT org_id::text FROM clients WHERE id = ${p.client_id}::uuid`);
      const satirlar = await tx.$queryRaw<Array<{
        id: string;
        platform: StratejiPlatformu;
        katman: HuniKatmani;
        niyet: NiyetKodu;
        tutar_micros: string;
        notu: string | null;
        varlik_idleri: string[];
        mevcut_varliklar: string[] | null;
        kitle_adi: string | null;
      }>>(Prisma.sql`
        SELECT m.id::text, m.platform, m.katman, m.niyet, m.tutar_micros::text, m.notu,
               m.varlik_idleri::text[] AS varlik_idleri,
               (SELECT array_agg(a.id::text) FROM assets a
                 WHERE a.id = ANY(m.varlik_idleri) AND a.client_id = m.client_id) AS mevcut_varliklar,
               t.name AS kitle_adi
          FROM strateji_matrisi m
          LEFT JOIN audience_templates t ON t.id = m.kitle_sablonu_id AND t.client_id = m.client_id
         WHERE m.plan_id = ${p.id}::uuid
         ORDER BY m.sira`);
      return { p, orgId: c!.org_id, satirlar };
    });
    const { p, orgId } = okuma;

    const sonuc: AktarimSonucu = { zaman: '', aktarilan: [], atlanan: [] };
    for (const m of okuma.satirlar) {
      const mevcut = new Set(m.mevcut_varliklar ?? []);
      // Sıra plandaki sıra: kullanıcı görselleri o sırayla seçti.
      const varliklar = m.varlik_idleri.filter((v) => mevcut.has(v));
      const girdi: AktarimSatiriGirdisi = {
        platform: m.platform,
        katman: m.katman,
        niyet: m.niyet,
        kitleAdi: m.kitle_adi,
        varlikIdleri: varliklar,
        planlananVarlikSayisi: m.varlik_idleri.length,
        tutarMicros: BigInt(m.tutar_micros),
        paraBirimi: p.para_birimi,
        donem: p.donem,
        not: m.notu,
      };
      const engel = aktarimEngeli(girdi);
      if (engel) {
        sonuc.atlanan.push({ matrisSatiriId: m.id, neden: engel });
        continue;
      }
      const baslik = `${NIYET_KATALOGU[m.niyet].ekranAdi} · ${m.kitle_adi}`.slice(0, 120);
      const oturumId = await this.prisma.withTenant(ctx, async (tx) => {
        const [o] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO adv_oturum (org_id, client_id, user_id, baslik, model, hazir_istem, hazir_medyalar, strateji_matris_id)
          VALUES (${orgId}::uuid, ${p.client_id}::uuid, ${ctx.userId}::uuid, ${baslik}, ${this.modelAdi},
                  ${aktarimIstemi(girdi)}, ${varliklar}::uuid[], ${m.id}::uuid)
          ON CONFLICT (strateji_matris_id) WHERE strateji_matris_id IS NOT NULL DO NOTHING
          RETURNING id::text`);
        if (o) return o.id;
        // Satırın oturumu önceki (yarıda düşen) bir denemede açılmış: AYNI
        // oturum aktarılmış sayılır, ikincisi açılmaz. Ayrı bir ön kontrol
        // yerine tek kapı tekil indeks: ön kontrol yarışta iki isteği birden
        // geçirirdi, ON CONFLICT geçirmez.
        const [var_] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT id::text FROM adv_oturum WHERE strateji_matris_id = ${m.id}::uuid`);
        return var_!.id;
      });
      sonuc.aktarilan.push({ matrisSatiriId: m.id, oturumId });
    }

    if (sonuc.aktarilan.length === 0) {
      const sayac = new Map<AktarimAtlamaNedeni, number>();
      for (const a of sonuc.atlanan) sayac.set(a.neden, (sayac.get(a.neden) ?? 0) + 1);
      const nedenler = [...sayac].map(([n, k]) => `${k} satırın ${ATLAMA_METNI[n]}`).join(', ');
      throw new BadRequestException(
        okuma.satirlar.length === 0
          ? 'Matriste satır yok; aktarılacak bir şey bulunmadı.'
          : `Aktarılabilecek satır yok: ${nedenler}.`,
      );
    }

    return this.prisma.withTenant(ctx, async (tx) => {
      sonuc.zaman = new Date().toISOString();
      const n = await tx.$executeRaw(Prisma.sql`
        UPDATE strateji_planlari
           SET durum = ${PLAN_GECISLERI.aktar.hedef}, aktarim = ${JSON.stringify(sonuc)}::jsonb, updated_at = now()
         WHERE id = ${p.id}::uuid AND durum = 'onaylandi' AND surum = ${surum}`);
      // Arada başka bir istek planı aktardı ya da iptal etti. Açılan oturumlar
      // tekil indeks sayesinde mükerrer değil; durum ötekinin yazdığı kalır.
      if (n === 0) throw new ConflictException(SURUM_MESAJI);
      return detayKur(tx, ctx, await planOku(tx, ctx, p.id, false));
    });
  }

  // ── Okuma ────────────────────────────────────────────────────────────

  async listele(ctx: TenantContext, clientId: string): Promise<PlanListesi> {
    erisim(ctx, clientId);
    return this.prisma.withTenant(ctx, async (tx) => {
      const satirlar = await tx.$queryRaw<PlanSatiri[]>(
        Prisma.sql`${planSecimi(Prisma.sql`p.client_id = ${clientId}::uuid`, false)}
          ORDER BY p.donem DESC, p.created_at DESC LIMIT ${PLAN_LISTE_SINIRI}`,
      );
      const [n] = await tx.$queryRaw<Array<{ n: number }>>(Prisma.sql`
        SELECT count(*)::int AS n FROM strateji_planlari WHERE client_id = ${clientId}::uuid`);
      return { planlar: satirlar.map(ozet), toplam: n?.n ?? satirlar.length };
    });
  }

  async detay(ctx: TenantContext, id: string): Promise<PlanDetayi> {
    return this.prisma.withTenant(ctx, async (tx) => detayKur(tx, ctx, await planOku(tx, ctx, id, false)));
  }

  /**
   * Medya planı PDF'i (MIMARI § 6.3). Veri transaction İÇİNDE okunuyor, PDF
   * transaction DIŞINDA üretiliyor: üretim saniyeler sürebilir ve
   * `withTenant`in 5 saniyelik sınırı içinde yapılırsa büyük bir planda
   * transaction ölür (rapor PDF'iyle aynı karar, reports.controller.ts).
   */
  async pdf(ctx: TenantContext, id: string): Promise<{ bayt: Buffer; dosyaAdi: string }> {
    const veri = await this.prisma.withTenant(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, false);
      const [c] = await tx.$queryRaw<Array<{ name: string; slug: string }>>(Prisma.sql`
        SELECT name, slug FROM clients WHERE id = ${p.client_id}::uuid`);
      return { detay: await detayKur(tx, ctx, p), workspace: c?.name ?? '', slug: c?.slug ?? 'workspace' };
    });
    const bayt = await medyaPlaniPdf({ workspace: veri.workspace, detay: veri.detay });
    return { bayt, dosyaAdi: medyaPlaniDosyaAdi(veri.slug, veri.detay.plan.donem, veri.detay.plan.surum, veri.detay.plan.durum) };
  }

  // ── Plan aç ──────────────────────────────────────────────────────────

  async olustur(ctx: TenantContext, girdi: PlanOlusturGirdisi): Promise<PlanDetayi> {
    erisim(ctx, girdi.clientId);
    try {
      return await this.prisma.withTenant(ctx, async (tx) => {
        /*
         * org_id HEDEF WORKSPACE'TEN. "Tüm şirketler" modunda ctx.orgId EV
         * şirketi kalıyor; ondan yazmak (client_id, org_id) kompozit
         * anahtarını deliyor ve panelde tek cümle kalıyor: "İlişkili kayıt
         * geçersiz".
         */
        const [c] = await tx.$queryRaw<Array<{ org_id: string }>>(Prisma.sql`
          SELECT org_id::text FROM clients WHERE id = ${girdi.clientId}::uuid`);
        if (!c) throw new NotFoundException('Workspace bulunamadı');

        const paraBirimi = girdi.paraBirimi ?? (await workspaceParaBirimi(tx, girdi.clientId));
        try {
          paraOndaligi(paraBirimi);
        } catch {
          throw new BadRequestException('Para birimi kodu geçersiz');
        }
        const tutar = tutarAyristir(girdi.toplamButce, paraBirimi);
        if (tutar.tur === 'hata') throw new BadRequestException(`Toplam bütçe: ${tutar.mesaj}`);
        bigintSiniri(tutar.micros, 'Toplam bütçe');

        const [acik] = await tx.$queryRaw<Array<{ durum: string }>>(Prisma.sql`
          SELECT durum FROM strateji_planlari
           WHERE client_id = ${girdi.clientId}::uuid AND donem = ${girdi.donem}
             AND durum IN ('taslak', 'onayda', 'onaylandi')`);
        if (acik) throw new ConflictException(acikPlanMesaji(girdi.donem));

        const [yeni] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO strateji_planlari (org_id, client_id, donem, toplam_butce_micros, para_birimi, notu, created_by)
          VALUES (${c.org_id}::uuid, ${girdi.clientId}::uuid, ${girdi.donem}, ${tutar.micros}::bigint,
                  ${paraBirimi}, ${girdi.not ?? null}, ${ctx.userId}::uuid)
          RETURNING id::text`);
        return detayKur(tx, ctx, await planOku(tx, ctx, yeni!.id, false));
      });
    } catch (e) {
      // Ön kontrolle aynı anda açılan ikinci plan: kısmi tekil indeks yakalar.
      if (String(e instanceof Error ? e.message : e).includes('strateji_planlari_acik_donem_key')) {
        throw new ConflictException(acikPlanMesaji(girdi.donem));
      }
      throw e;
    }
  }

  // ── Dağılım ──────────────────────────────────────────────────────────

  /**
   * Geçmişten öneri. Dağılımı YAZMAZ, döndürür; yalnızca öneriyi plan
   * satırına not eder (`son_oneri`) ki kayıtta hangi satırın "geçmiş
   * veriden" geldiği sunucuda bilinsin (`kaynakBelirle`).
   *
   * SEVİYE KAMPANYA (`TOTALS_LEVEL`), HESAP DEĞİL. MIMARI "hesap seviyesi"
   * diyor ve kastı "TEK seviye" (seviyeler toplanırsa harcama katlanır).
   * Hesap seviyesi satırı platforma göre değişiyor (Google'ın `customer`
   * kaynağı farklı davranıyor); kampanya satırları harcama olduğunda her
   * zaman var ve metrik servisinin kartları da onu okuyor. Panelde
   * görünen rakamla öneri dayanağı aynı olsun diye aynı seviye.
   */
  async dagilimOner(ctx: TenantContext, id: string, simdi = new Date()): Promise<DagilimOnerisi> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, true);
      if (!duzenlenebilirMi(p.durum)) throw new ConflictException(duzenlenemezMesaji(p.durum));
      const pencere = oneriPenceresi(simdi);
      const oneri = await oneriKur(tx, p, pencere);
      await tx.$executeRaw(Prisma.sql`
        UPDATE strateji_planlari SET son_oneri = ${JSON.stringify(oneri)}::jsonb WHERE id = ${p.id}::uuid`);
      return oneri;
    });
  }

  async dagilimKaydet(ctx: TenantContext, id: string, girdi: DagilimKaydetGirdisi): Promise<PlanDetayi> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const p = await yazmaKapisi(tx, ctx, id, girdi.surum);
      const satirlar = girdi.satirlar.map((s) => ({
        platform: s.platform,
        katman: s.katman,
        tutarMicros: tutarCoz(s.tutar, p.para_birimi, `${platformAdi(s.platform)} · ${HUNI_ETIKETLERI[s.katman]}`),
      }));

      const toplam = dagilimToplamDenetimi(satirlar.map((s) => s.tutarMicros), BigInt(p.toplam_butce_micros));
      if (!toplam.tamam) {
        throw new BadRequestException(
          `Dağılım toplam bütçeyi ${paraYaz(toplam.asimMicros, p.para_birimi)} aşıyor.`,
        );
      }
      // Matris bu dağılıma dayanıyor: dağılımı matrisin altına çekmek,
      // müşteriye onaylatılacak planı kendi içinde tutarsız yapardı.
      const matris = await matrisTutarlari(tx, p.id);
      const asim = matrisButceDenetimi(satirlar, matris);
      if (asim.length > 0) throw new BadRequestException(matrisAsimMesaji(asim[0]!, p.para_birimi, 'dagilim'));

      const mevcut = await dagilimOku(tx, p.id);
      await tx.$executeRaw(Prisma.sql`DELETE FROM strateji_dagilimlari WHERE plan_id = ${p.id}::uuid`);
      for (const s of satirlar) {
        const k = kaynakBelirle(s, p.son_oneri?.satirlar ?? null, mevcut);
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO strateji_dagilimlari (plan_id, org_id, client_id, platform, katman, tutar_micros, kaynak, gerekce)
          VALUES (${p.id}::uuid, ${p.org_id}::uuid, ${p.client_id}::uuid, ${s.platform}, ${s.katman},
                  ${s.tutarMicros}::bigint, ${k.kaynak}, ${k.gerekce})`);
      }
      return surumArttirVeOku(tx, ctx, p.id);
    });
  }

  // ── Matris ───────────────────────────────────────────────────────────

  async matrisKaydet(ctx: TenantContext, id: string, girdi: MatrisKaydetGirdisi): Promise<PlanDetayi> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const p = await yazmaKapisi(tx, ctx, id, girdi.surum);
      const satirlar = girdi.satirlar.map((s, i) => ({
        ...s,
        tutarMicros: tutarCoz(s.tutar, p.para_birimi, `Matris ${i + 1}. satır`),
      }));

      /*
       * AYNI WORKSPACE KONTROLÜ SERVİSTE — RLS'E EK. "Tüm şirketler"
       * modunda RLS kardeş şirketlerin şablonlarını da gösteriyor; politikaya
       * güvenmek, B'nin kitlesini A'nın planına sokmaya izin verirdi ve
       * aktarımda A'nın oturumu B'nin hedeflemesiyle açılırdı.
       */
      const kitleler = [...new Set(satirlar.map((s) => s.kitleSablonuId).filter((x): x is string => x !== null))];
      if (kitleler.length > 0) {
        const bulunan = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT id::text FROM audience_templates
           WHERE id = ANY(${kitleler}::uuid[]) AND client_id = ${p.client_id}::uuid`);
        if (bulunan.length !== kitleler.length) {
          throw new BadRequestException('Seçilen kitle şablonlarından biri bu workspace’e ait değil ya da silinmiş.');
        }
      }
      const varliklar = [...new Set(satirlar.flatMap((s) => s.varlikIdleri))];
      if (varliklar.length > 0) {
        const bulunan = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT id::text FROM assets
           WHERE id = ANY(${varliklar}::uuid[]) AND client_id = ${p.client_id}::uuid`);
        if (bulunan.length !== varliklar.length) {
          throw new BadRequestException('Seçilen görsellerden biri bu workspace’e ait değil ya da silinmiş.');
        }
      }

      const dagilim = (await dagilimOku(tx, p.id)).map((d) => ({ ...d, tutarMicros: BigInt(d.tutarMicros) }));
      const asim = matrisButceDenetimi(dagilim, satirlar);
      if (asim.length > 0) throw new BadRequestException(matrisAsimMesaji(asim[0]!, p.para_birimi, 'matris'));

      await tx.$executeRaw(Prisma.sql`DELETE FROM strateji_matrisi WHERE plan_id = ${p.id}::uuid`);
      for (const [i, s] of satirlar.entries()) {
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO strateji_matrisi
            (plan_id, org_id, client_id, sira, platform, katman, niyet, kitle_sablonu_id,
             kelime_grubu, varlik_idleri, tutar_micros, notu)
          VALUES (${p.id}::uuid, ${p.org_id}::uuid, ${p.client_id}::uuid, ${i + 1}, ${s.platform}, ${s.katman},
                  ${s.niyet}, ${s.kitleSablonuId}::uuid, ${s.kelimeGrubu}, ${s.varlikIdleri}::uuid[],
                  ${s.tutarMicros}::bigint, ${s.not ?? null})`);
      }
      return surumArttirVeOku(tx, ctx, p.id);
    });
  }

  // ── Kelimeler ────────────────────────────────────────────────────────

  /**
   * Kelime araması: ÖN KOŞUL KONTROLÜ PLATFORM ÇAĞRISINDAN ÖNCE. Google
   * hesabı yoksa sıfır çağrıyla ret ve nedeni yazılı (CLAUDE.md "önce
   * kontrol, sonra çağrı"). Çağrının kendisi kuyrukta, transaction dışında.
   *
   * SÜRÜM ARTMIYOR: arama yalnızca SEÇİLMEMİŞ fikir yazıyor ve seçilmemiş
   * fikir planın içeriği değil. Sürümü artırsaydı, sonuç gelirken matrisi
   * kaydeden kullanıcı hiçbir şey değiştirmemiş birinin yüzünden 409 alırdı.
   */
  async kelimeAra(ctx: TenantContext, id: string, girdi: KelimeAraGirdisi): Promise<PlanDetayi> {
    const tohumlar = [...new Set(girdi.tohumlar.map((t) => t.trim()).filter(Boolean))];
    // Her arama yeni kimlik: işçi yalnız kimliği plandakiyle aynıysa yazar
    // (bayat iş yeni aramayı ezemez, kelime-isleyici.ts).
    const aramaId = randomUUID();
    await this.prisma.withTenant(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, true);
      if (!duzenlenebilirMi(p.durum)) throw new ConflictException(duzenlenemezMesaji(p.durum));
      if (aramaSuruyorMu(p)) throw new ConflictException('Bu planda bir kelime araması zaten sürüyor.');
      const hesap = await kelimeHesabi(tx, p.client_id);
      if (!hesap) {
        throw new BadRequestException(
          'Bu workspace’e atanmış Google Ads hesabı yok. Kelime araması için önce bir Google Ads hesabı atayın.',
        );
      }
      await tx.$executeRaw(Prisma.sql`
        UPDATE strateji_planlari
           SET kelime_arama = 'kuyrukta', kelime_arama_zamani = now(), kelime_son_hata = NULL,
               kelime_arama_id = ${aramaId}::uuid
         WHERE id = ${p.id}::uuid`);
    });

    try {
      await this.kuyruk.ekle({ planId: id, aramaId, tohumlar });
    } catch (e) {
      // Kuyruğa girmeyen arama "kuyrukta" kalmamalı: plan nedeniyle kapanır.
      // Ham hata (Redis metni) plana YAZILMAZ, müşteri de görüyor; log'a.
      this.logger.error(`Kelime araması kuyruğa alınamadı (plan ${id}): ${e instanceof Error ? e.message : String(e)}`);
      await this.prisma.withTenant(ctx, (tx) =>
        tx.$executeRaw(Prisma.sql`
          UPDATE strateji_planlari SET kelime_arama = 'hata', kelime_son_hata = ${KUYRUK_HATASI}
           WHERE id = ${id}::uuid AND kelime_arama_id = ${aramaId}::uuid`),
      );
      throw new ServiceUnavailableException('Kelime araması şu an başlatılamadı. Biraz sonra yeniden deneyin.');
    }
    return this.detay(ctx, id);
  }

  async kelimeGuncelle(ctx: TenantContext, id: string, girdi: KelimeGuncelleGirdisi): Promise<PlanDetayi> {
    const idler = girdi.satirlar.map((s) => s.id);
    if (new Set(idler).size !== idler.length) throw new BadRequestException('Aynı kelime iki kez gönderildi.');
    return this.prisma.withTenant(ctx, async (tx) => {
      const p = await yazmaKapisi(tx, ctx, id, girdi.surum);
      let guncellenen = 0;
      for (const s of girdi.satirlar) {
        // `undefined` = dokunma, `null` grup = temizle. İkisini ayırmak için
        // ayrı bayrak: COALESCE null'ı "dokunma" sayar ve grubu silmeyi
        // imkânsız yapardı. Yazılan grup ELLE sayılır (`grup_elle`) ve
        // otomatik gruplama onu bir daha ezmez; temizlenen grup otomatiğe
        // geri bırakılır (boş grup bir karar değil, "sen seç" demek).
        // KelimeGuncelleGirdisi string | null | undefined taşıyor; `!= null`
        // bilerek gevşek: ikisini de "yazılmadı" sayar.
        const grupVar = s.grup !== undefined;
        const n = await tx.$executeRaw(Prisma.sql`
          UPDATE strateji_kelimeleri
             SET secili = COALESCE(${s.secili ?? null}::boolean, secili),
                 grup = CASE WHEN ${grupVar}::boolean THEN ${s.grup ?? null} ELSE grup END,
                 grup_elle = CASE WHEN ${grupVar}::boolean THEN ${s.grup != null}::boolean ELSE grup_elle END
           WHERE id = ${s.id}::uuid AND plan_id = ${p.id}::uuid`);
        guncellenen += n;
      }
      // Sayı tutmuyorsa bir kimlik bu plana ait değil: sessizce atlamak,
      // kullanıcının seçtiği kelimenin plana girmediğini gizlerdi.
      if (guncellenen !== girdi.satirlar.length) {
        throw new BadRequestException('Gönderilen kelimelerden biri bu planda yok; sayfayı yenileyin.');
      }
      return surumArttirVeOku(tx, ctx, p.id);
    });
  }

  // ── Durum makinesi ───────────────────────────────────────────────────

  async eylem(ctx: TenantContext, id: string, girdi: PlanEylemGirdisi): Promise<PlanDetayi> {
    if (girdi.eylem === 'aktar') return this.aktar(ctx, id, girdi.surum);
    return this.prisma.withTenant(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, true);
      if (!gecisMumkunMu(p.durum, girdi.eylem)) throw new ConflictException(gecisMesaji(p.durum, girdi.eylem));
      if (p.surum !== girdi.surum) throw new ConflictException(SURUM_MESAJI);
      const hedef = PLAN_GECISLERI[girdi.eylem].hedef;
      // `geri_cek` sürümü artırır: düzenlemeye dönen plan yeni bir belge,
      // eski sürüme verilmiş bir onay ona taşınmamalı.
      const artis = girdi.eylem === 'geri_cek' ? 1 : 0;
      await tx.$executeRaw(Prisma.sql`
        UPDATE strateji_planlari
           SET durum = ${hedef}, surum = surum + ${artis}, updated_at = now()
         WHERE id = ${p.id}::uuid`);
      return detayKur(tx, ctx, await planOku(tx, ctx, p.id, false));
    });
  }

  /**
   * Onay — kendi ucunda ve kendi izninde (`strategy.approve`). ROL
   * KAYDEDİLİYOR: "müşteri onayladı" ile "ajans müşteri adına onayladı" aynı
   * belge değil (PlanOzeti.onaylayan). `onaylanan_surum` aktarımın bağlandığı
   * sürüm.
   */
  async onayla(ctx: TenantContext, id: string, surum: number): Promise<PlanDetayi> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const p = await planOku(tx, ctx, id, true);
      if (!gecisMumkunMu(p.durum, 'onayla')) throw new ConflictException(gecisMesaji(p.durum, 'onayla'));
      if (p.surum !== surum) throw new ConflictException(SURUM_MESAJI);
      const rol = onayRolu(ctx);
      await tx.$executeRaw(Prisma.sql`
        UPDATE strateji_planlari
           SET durum = ${PLAN_GECISLERI.onayla.hedef}, onaylayan_user_id = ${ctx.userId}::uuid,
               onay_rolu = ${rol}, onay_zamani = now(), onaylanan_surum = surum, updated_at = now()
         WHERE id = ${p.id}::uuid`);
      return detayKur(tx, ctx, await planOku(tx, ctx, p.id, false));
    });
  }
}

// ── Yardımcılar ──────────────────────────────────────────────────────────

const SURUM_MESAJI = 'Plan siz bakarken değişti. Sayfayı yenileyip yeniden deneyin.';

/** `client_viewer` müşterinin kendi giriş hesabı; diğer her rol ajans personeli. */
export function onayRolu(ctx: Pick<TenantContext, 'role'>): 'musteri' | 'ajans' {
  return ctx.role === 'client_viewer' ? 'musteri' : 'ajans';
}

/**
 * Bu kullanıcının bu planda yapabileceği eylemler: durum × izin. Panel
 * düğmeleri BUNDAN çiziliyor; düğmenin görünürlüğü ile sunucunun kabulü
 * ayrışırsa kullanıcı tıklayıp ret alır.
 */
export function yapilabilirEylemler(durum: PlanDurumu, izinler: readonly Permission[]): PlanEylemi[] {
  return PLAN_EYLEMLERI.filter((e) => gecisMumkunMu(durum, e) && EYLEM_IZINLERI[e].every((i) => izinler.includes(i)));
}

/**
 * PDF dosya adı: ASCII, başlık enjeksiyonuna kapalı. `slug` veritabanından
 * gelse de yalnız [a-z0-9-] bırakılıyor: `Content-Disposition` başlığına
 * tırnak ya da satır sonu sızarsa başlık bölünür. Sürüm adın içinde:
 * aynı ayın iki PDF'i karıştırılmasın. Taslak adında da yazıyor.
 */
export function medyaPlaniDosyaAdi(slug: string, donem: string, surum: number, durum: PlanDurumu): string {
  const temiz = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace';
  return `medya-plani-${temiz}-${donem}-s${surum}${durum === 'taslak' ? '-taslak' : ''}.pdf`;
}

function erisim(ctx: TenantContext, clientId: string): void {
  if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok');
}

async function planOku(tx: Tx, ctx: TenantContext, id: string, kilit: boolean): Promise<PlanSatiri> {
  const [p] = await tx.$queryRaw<PlanSatiri[]>(planSecimi(Prisma.sql`p.id = ${id}::uuid`, kilit));
  // RLS zaten süzüyor; bağlam listesi ikinci kapı ("tüm şirketler" modunda
  // RLS kardeş şirketleri de gösteriyor, bağlamın listesi kullanıcınınki).
  if (!p || !ctx.clientIds.includes(p.client_id)) throw new NotFoundException('Plan bulunamadı');
  return p;
}

async function yazmaKapisi(tx: Tx, ctx: TenantContext, id: string, surum: number): Promise<PlanSatiri> {
  const p = await planOku(tx, ctx, id, true);
  if (!duzenlenebilirMi(p.durum)) throw new ConflictException(duzenlenemezMesaji(p.durum));
  if (p.surum !== surum) throw new ConflictException(SURUM_MESAJI);
  return p;
}

async function surumArttirVeOku(tx: Tx, ctx: TenantContext, id: string): Promise<PlanDetayi> {
  await tx.$executeRaw(Prisma.sql`
    UPDATE strateji_planlari SET surum = surum + 1, updated_at = now() WHERE id = ${id}::uuid`);
  return detayKur(tx, ctx, await planOku(tx, ctx, id, false));
}

function aramaSuruyorMu(p: Pick<PlanSatiri, 'kelime_arama' | 'kelime_arama_zamani'>, simdi = Date.now()): boolean {
  if (p.kelime_arama !== 'kuyrukta' && p.kelime_arama !== 'calisiyor') return false;
  const zaman = p.kelime_arama_zamani ? new Date(p.kelime_arama_zamani).getTime() : 0;
  return simdi - zaman < KELIME_ARAMA_ZAMAN_ASIMI_DK * 60_000;
}

async function workspaceParaBirimi(tx: Tx, clientId: string): Promise<string> {
  const birimler = await tx.$queryRaw<Array<{ currency: string }>>(Prisma.sql`
    SELECT DISTINCT currency FROM ad_accounts
     WHERE client_id = ${clientId}::uuid AND platform IN ('meta'::"Platform", 'google'::"Platform")
     ORDER BY currency`);
  if (birimler.length === 0) {
    throw new BadRequestException('Bu workspace’e atanmış Meta ya da Google hesabı yok. Para birimini seçin.');
  }
  if (birimler.length > 1) {
    // Kur çevrimi yok: 1 USD + 1 TRY toplanamaz. Tahmin etmek yerine sor.
    throw new BadRequestException(
      `Workspace hesapları farklı para birimleri kullanıyor (${birimler.map((b) => b.currency).join(', ')}). Para birimini seçin.`,
    );
  }
  return birimler[0]!.currency;
}

/**
 * Kullanıcının yazdığı tutar → micros. `tutarAyristir` SIFIRI REDDEDİYOR
 * (plan toplamı için doğru); dağılım ve matris hücresinde ise "0" anlamlı
 * bir karar ("bu katmana bu ay bütçe yok", aktarımda `butce_sifir`).
 */
function tutarCoz(girdi: string, paraBirimi: string, alan: string): bigint {
  if (/^0+(,0+)?$/.test(girdi.trim())) return 0n;
  const t = tutarAyristir(girdi, paraBirimi);
  if (t.tur === 'hata') throw new BadRequestException(`${alan}: ${t.mesaj}`);
  bigintSiniri(t.micros, alan);
  return t.micros;
}

/** Postgres BIGINT üst sınırı (2^63 - 1). */
const BIGINT_EN_BUYUK = 9_223_372_036_854_775_807n;

/**
 * `tutarAyristir` üst sınır koymuyor; BIGINT'i aşan tutar INSERT'te 22003
 * ("out of range") ile düşüyor ve kullanıcı anlamsız bir veritabanı hatası
 * görüyordu. Sınır micros cinsinden: ~9,2 trilyon birim.
 */
function bigintSiniri(micros: bigint, alan: string): void {
  if (micros > BIGINT_EN_BUYUK) throw new BadRequestException(`${alan}: tutar çok büyük.`);
}

function paraYaz(micros: bigint, paraBirimi: string): string {
  const ondalik = paraOndaligi(paraBirimi);
  const tam = micros / 1_000_000n;
  const kesir = (micros % 1_000_000n).toString().padStart(6, '0').slice(0, ondalik);
  const tamYazi = tam.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${tamYazi}${ondalik > 0 && /[1-9]/.test(kesir) ? `,${kesir}` : ''} ${paraBirimi}`;
}

function platformAdi(p: StratejiPlatformu): string {
  return p === 'meta' ? 'Meta' : 'Google';
}

function matrisAsimMesaji(
  a: { platform: StratejiPlatformu; katman: HuniKatmani; dagilimMicros: bigint; matrisMicros: bigint },
  birim: string,
  kaynak: 'dagilim' | 'matris',
): string {
  const hucre = `${platformAdi(a.platform)} · ${HUNI_ETIKETLERI[a.katman]}`;
  return kaynak === 'matris'
    ? `${hucre}: matris satırları ${paraYaz(a.matrisMicros, birim)}, dağılımdaki bütçe ${paraYaz(a.dagilimMicros, birim)}.`
    : `${hucre}: matris bu hücrede ${paraYaz(a.matrisMicros, birim)} kullanıyor, dağılım ${paraYaz(a.dagilimMicros, birim)} olamaz. Önce matrisi düzenleyin.`;
}

function acikPlanMesaji(donem: string): string {
  return `${donem} için açık bir plan zaten var. Yeni plan için önce onu iptal edin.`;
}

function duzenlenemezMesaji(durum: PlanDurumu): string {
  return durum === 'onayda'
    ? 'Plan onayda; düzenlemek için önce geri çekin.'
    : 'Bu plan artık düzenlenemez.';
}

function gecisMesaji(durum: PlanDurumu, eylem: PlanEylemi): string {
  const eylemAdi: Record<PlanEylemi, string> = {
    onaya_gonder: 'onaya gönderilemez',
    geri_cek: 'geri çekilemez',
    onayla: 'onaylanamaz',
    aktar: 'aktarılamaz',
    iptal: 'iptal edilemez',
  };
  const durumAdi: Record<PlanDurumu, string> = {
    taslak: 'Taslaktaki',
    onayda: 'Onaydaki',
    onaylandi: 'Onaylanmış',
    aktarildi: 'Aktarılmış',
    iptal: 'İptal edilmiş',
  };
  return `${durumAdi[durum]} plan ${eylemAdi[eylem]}.`;
}

async function dagilimOku(tx: Tx, planId: string): Promise<DagilimSatiri[]> {
  const r = await tx.$queryRaw<Array<{ platform: StratejiPlatformu; katman: HuniKatmani; tutar_micros: string; kaynak: DagilimSatiri['kaynak']; gerekce: string | null }>>(Prisma.sql`
    SELECT platform, katman, tutar_micros::text, kaynak, gerekce
      FROM strateji_dagilimlari WHERE plan_id = ${planId}::uuid
     ORDER BY platform, CASE katman WHEN 'soguk' THEN 1 WHEN 'sicak' THEN 2 ELSE 3 END`);
  return r.map((s) => ({ platform: s.platform, katman: s.katman, tutarMicros: s.tutar_micros, kaynak: s.kaynak, gerekce: s.gerekce }));
}

async function matrisTutarlari(tx: Tx, planId: string): Promise<Array<{ platform: StratejiPlatformu; katman: HuniKatmani; tutarMicros: bigint }>> {
  const r = await tx.$queryRaw<Array<{ platform: StratejiPlatformu; katman: HuniKatmani; tutar_micros: string }>>(Prisma.sql`
    SELECT platform, katman, tutar_micros::text FROM strateji_matrisi WHERE plan_id = ${planId}::uuid`);
  return r.map((s) => ({ platform: s.platform, katman: s.katman, tutarMicros: BigInt(s.tutar_micros) }));
}

/**
 * Önerinin veri kısmı. Hesaplar: workspace'e ATANMIŞ (`client_id`) ve
 * İZLENEN Meta/Google hesapları. Havuz hesabı başka müşterinin olabilir;
 * izlenmeyen hesabın metriği eksik ve öneriyi eksik veriye dayandırırdı.
 */
async function oneriKur(tx: Tx, p: PlanSatiri, pencere: { from: string; to: string }): Promise<DagilimOnerisi> {
  const hesaplar = await tx.$queryRaw<Array<{ id: string; currency: string; platform: StratejiPlatformu }>>(Prisma.sql`
    SELECT id::text, currency, platform::text AS platform FROM ad_accounts
     WHERE client_id = ${p.client_id}::uuid AND sync_enabled = true
       AND platform IN ('meta'::"Platform", 'google'::"Platform")`);
  const bos = (bosNedeni: DagilimOnerisi['bosNedeni'], dayanak: DagilimOnerisi['dayanak'] = []): DagilimOnerisi => ({
    pencere,
    satirlar: null,
    bosNedeni,
    dayanak,
  });
  if (hesaplar.length === 0) return bos('hesap_yok');
  // Plan birimi de kümeye giriyor: hesaplar USD, plan TRY ise USD geçmişini
  // TRY bütçeye bölmek kur çevrimi gerektirir ve o yok.
  if (new Set([...hesaplar.map((h) => h.currency), p.para_birimi]).size > 1) return bos('karisik_birim');

  const idler = hesaplar.map((h) => h.id);
  /*
   * Hesap listesi ÖNCEDEN çekilip diziyle veriliyor: alt sorgu RLS
   * yüklemini satır başına değerlendirtip paneldeki yavaşlığın tamamı
   * olmuştu (metrics.service.ts izlenenHesapIdleri). Süzgeç client_id ile
   * de kuruluyor ki planlayıcı indeksi kullanabilsin.
   */
  const satirlar = await tx.$queryRaw<Array<{ platform: StratejiPlatformu; harcama: string; donusum: string; birimler: string[] }>>(Prisma.sql`
    SELECT platform::text AS platform,
           COALESCE(SUM(spend_micros), 0)::text AS harcama,
           COALESCE(SUM(conversions), 0)::text AS donusum,
           array_agg(DISTINCT currency::text) AS birimler
      FROM insights_daily
     WHERE client_id = ${p.client_id}::uuid
       AND ad_account_id = ANY(${idler}::uuid[])
       AND entity_level = ${TOPLAM_SEVIYESI}
       AND breakdown_key = ''
       AND date BETWEEN ${pencere.from}::date AND ${pencere.to}::date
     GROUP BY platform`);
  // Metrik satırının birimi hesabınkinden ayrışmış olabilir (hesap birimi
  // sonradan değişti); aynı kural.
  if (satirlar.some((s) => s.birimler.some((b) => b !== p.para_birimi))) return bos('karisik_birim');

  // Hesabı olan ama hiç satırı olmayan platform da dayanakta sıfırla görünür:
  // "Google'da veri yok" ile "Google hesabı yok" ayrı şeyler.
  const platformlar = [...new Set(hesaplar.map((h) => h.platform))].sort();
  const dayanak: PlatformDayanagi[] = platformlar.map((pl) => {
    const s = satirlar.find((x) => x.platform === pl);
    return { platform: pl, harcamaMicros: BigInt(s?.harcama ?? '0'), donusum: Number(s?.donusum ?? '0') };
  });
  const sonuc = oneriHesapla({
    toplamMicros: BigInt(p.toplam_butce_micros),
    paraBirimi: p.para_birimi,
    mevcut: await dagilimOku(tx, p.id),
    dayanak,
  });
  return { pencere, ...sonuc, dayanak: dayanakSatirlari(dayanak) };
}

function ozet(p: PlanSatiri): PlanOzeti {
  return {
    id: p.id,
    clientId: p.client_id,
    donem: p.donem,
    durum: p.durum,
    surum: p.surum,
    toplamButceMicros: p.toplam_butce_micros,
    paraBirimi: p.para_birimi,
    dagitilanMicros: p.dagitilan_micros,
    /*
     * Onay izi `onay_rolu` + `onay_zamani` ile var. Onaylayan kullanıcı
     * sonradan silinmişse (SET NULL) kimlik BOŞ dize gelir, ad `null`: onayı
     * yok saymak "müşteri onayladı" bilgisini kaybettirirdi.
     */
    onaylayan:
      p.onay_rolu && p.onay_zamani
        ? { userId: p.onaylayan_user_id ?? '', ad: p.onaylayan_ad, rol: p.onay_rolu, zaman: new Date(p.onay_zamani).toISOString() }
        : null,
    aktarim: p.aktarim,
    not: p.notu,
    olusturuldu: new Date(p.created_at).toISOString(),
    guncellendi: new Date(p.updated_at).toISOString(),
  };
}

async function detayKur(tx: Tx, ctx: TenantContext, p: PlanSatiri): Promise<PlanDetayi> {
  const dagilim = await dagilimOku(tx, p.id);

  const mr = await tx.$queryRaw<Array<{
    id: string;
    platform: StratejiPlatformu;
    katman: HuniKatmani;
    niyet: NiyetKodu;
    kitle_sablonu_id: string | null;
    kitle_ad: string | null;
    kelime_grubu: string | null;
    varlik_idleri: string[];
    tutar_micros: string;
    notu: string | null;
  }>>(Prisma.sql`
    SELECT m.id::text, m.platform, m.katman, m.niyet, m.kitle_sablonu_id::text, t.name AS kitle_ad,
           m.kelime_grubu, m.varlik_idleri::text[] AS varlik_idleri, m.tutar_micros::text, m.notu
      FROM strateji_matrisi m
      LEFT JOIN audience_templates t ON t.id = m.kitle_sablonu_id AND t.client_id = m.client_id
     WHERE m.plan_id = ${p.id}::uuid
     ORDER BY m.sira`);
  const varlikIdleri = [...new Set(mr.flatMap((m) => m.varlik_idleri))];
  const varliklar = varlikIdleri.length
    ? await tx.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
        SELECT id::text, name FROM assets WHERE id = ANY(${varlikIdleri}::uuid[]) AND client_id = ${p.client_id}::uuid`)
    : [];
  const varlikAdi = new Map(varliklar.map((v) => [v.id, v.name]));
  const matris: MatrisSatiri[] = mr.map((m) => ({
    id: m.id,
    platform: m.platform,
    katman: m.katman,
    niyet: m.niyet,
    /*
     * SİLİNMİŞ KİTLE: FK `ON DELETE SET NULL` kimliği de siliyor, yani
     * silinmiş şablon `null` olarak geliyor. Meta satırı kayıtta kitle
     * ZORUNLU (sözleşme), bu yüzden Meta satırında `null` yalnız silinmiş
     * demek; Google satırında "seçilmemiş". Ekran ayrımı platformdan yapar.
     */
    kitle: m.kitle_sablonu_id ? { id: m.kitle_sablonu_id, ad: m.kitle_ad } : null,
    kelimeGrubu: m.kelime_grubu,
    varliklar: m.varlik_idleri.map((v) => {
      const ad = varlikAdi.get(v) ?? null;
      // Silinmiş varlığın önizlemesi yok; adres verilirse ekranda kırık görsel olurdu.
      return { id: v, ad, kucukResimAdresi: ad === null ? null : `/assets/${v}/preview` };
    }),
    tutarMicros: m.tutar_micros,
    not: m.notu,
  }));

  const kr = await tx.$queryRaw<Array<{
    id: string;
    kelime: string;
    aylik_arama: string | null;
    rekabet: KelimeSatiri['rekabet'];
    teklif_alt_micros: string | null;
    teklif_ust_micros: string | null;
    varyantlar: string[];
    grup: string | null;
    grup_elle: boolean;
    secili: boolean;
    cekim_zamani: Date;
  }>>(Prisma.sql`
    SELECT id::text, kelime, aylik_arama::text, rekabet, teklif_alt_micros::text, teklif_ust_micros::text,
           varyantlar, grup, grup_elle, secili, cekim_zamani
      FROM strateji_kelimeleri WHERE plan_id = ${p.id}::uuid
     ORDER BY secili DESC, aylik_arama DESC NULLS LAST, kelime`);
  const kelimeler: KelimeSatiri[] = kr.map((k) => ({
    id: k.id,
    kelime: k.kelime,
    aylikArama: k.aylik_arama === null ? null : Number(k.aylik_arama),
    rekabet: k.rekabet,
    teklifAltMicros: k.teklif_alt_micros,
    teklifUstMicros: k.teklif_ust_micros,
    varyantlar: k.varyantlar ?? [],
    grup: k.grup,
    grupElle: k.grup_elle,
    secili: k.secili,
    cekimZamani: new Date(k.cekim_zamani).toISOString(),
  }));

  const suruyor = aramaSuruyorMu(p);
  const takildi = !suruyor && (p.kelime_arama === 'kuyrukta' || p.kelime_arama === 'calisiyor');
  return {
    plan: ozet(p),
    dagilim,
    matris,
    kelimeler: {
      erisim: p.kelime_erisim ?? KELIME_ERISIM_OLCULEN,
      satirlar: kelimeler,
      gosterilen: kelimeler.length,
      toplam: Math.max(p.kelime_toplam ?? 0, kelimeler.length),
      aramaSuruyor: suruyor,
      // Takılmış arama sonsuz "aranıyor" değil, nedeniyle bir hata.
      sonHata:
        p.kelime_arama === 'hata'
          ? p.kelime_son_hata
          : takildi
            ? `Arama ${KELIME_ARAMA_ZAMAN_ASIMI_DK} dakikadır yanıt vermedi. Yeniden deneyin.`
            : null,
    },
    yapilabilir: yapilabilirEylemler(p.durum, ctx.permissions),
  };
}
