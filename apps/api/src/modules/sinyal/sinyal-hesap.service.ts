import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  SAGLIK,
  SAGLIK_KONTROLLERI,
  sinyalAnahtari,
  type Platform,
  type SinyalDurumu,
  type SinyalKodu,
  type SinyalTuru,
} from '@advetics/shared';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import {
  ON_KOSUL_NOTU,
  anomaliBul,
  bosNedenSayaci,
  donusumKesildiBulgusu,
  donusumPencereleri,
  gozlemKarari,
  gunEkle,
  isNotu,
  kampanyaToplami,
  okunacakGunler,
  reklamOnaysizBulgulari,
  sifirGosterimBulgulari,
  sureDolduMu,
  type Bulgu,
  type GunSayilari,
  type TxLike,
  type VarlikSerisi,
} from './sinyal-hesap';

/**
 * ═══ SİNYAL HESAPLAMA İŞİ (`signals_evaluate`, MIMARI § 5) ═══
 *
 * Hesap başına, gün başına. PLATFORM ÇAĞRISI YOK: her girdi veritabanında
 * (insights_daily, campaigns, ads). Worker'ın BYPASSRLS istemcisiyle koşuyor
 * (`db` parametresi; testte PGlite).
 *
 * ÖN KOŞUL SORGUDAN ÖNCE: o gün için başarılı günlük metrik yoksa iş hiçbir
 * şey okumadan biter, notu "hesaplanmadı:" ile başlar ve TEKRAR DENENMEZ
 * (sıfır maliyetli ret). Tekrar denenseydi metrik işi gecikirken beş deneme
 * boşa yanardı (CLAUDE.md "yavaş bir ön koşul bağımlı işin denemelerini
 * tüketiyor"); metrik işi bitince zincir işi zaten yeniden kuyruğa alıyor.
 */

interface HesapSatiri {
  id: string;
  client_id: string | null;
  org_id: string | null;
  platform: Platform;
  name: string;
  currency: string;
  last_insights_sync_at: Date | string | null;
}

interface MevcutSinyal {
  id: string;
  anahtar: string;
  tur: SinyalTuru;
  kod: SinyalKodu;
  durum: SinyalDurumu;
  kapatma_z: number | null;
  son_gorulme: Date | string;
}

export interface HesaplamaSonucu {
  rows: number;
  note: string;
  /** Testler ve log için ayrıntı. */
  yeni: number;
  yenidenAcilan: number;
  kapanan: number;
}

@Injectable()
export class SinyalHesapService {
  constructor(private readonly admin: PrismaAdminService) {}

  /** Worker girişi. */
  calistir(adAccountId: string, gun: string, simdi = new Date()): Promise<HesaplamaSonucu> {
    return degerlendir(this.admin as unknown as TxLike, adAccountId, gun, simdi);
  }
}

/**
 * Değerlendirmenin kendisi — servisten ayrı, `db` parametresiyle: PGlite
 * testleri GERÇEK sorguyu koşsun (kopyalanmış bir sorgu düzeltilmiş hâli
 * taşır ve servis eski kalsa bile yeşil geçerdi).
 */
export async function degerlendir(db: TxLike, adAccountId: string, gun: string, simdi = new Date()): Promise<HesaplamaSonucu> {
  const bos = (note: string): HesaplamaSonucu => ({ rows: 0, note, yeni: 0, yenidenAcilan: 0, kapanan: 0 });

  const [hesap] = await db.$queryRaw<HesapSatiri[]>(Prisma.sql`
    SELECT a.id::text AS id, a.client_id::text AS client_id, c.org_id::text AS org_id,
           a.platform::text AS platform, a.name, a.currency, a.last_insights_sync_at
      FROM ad_accounts a
      LEFT JOIN clients c ON c.id = a.client_id
     WHERE a.id = ${adAccountId}::uuid`);
  if (!hesap) return bos(`${ON_KOSUL_NOTU} reklam hesabı bulunamadı`);
  if (!hesap.client_id || !hesap.org_id) return bos(`${ON_KOSUL_NOTU} hesap bir workspace'e atanmamış`);
  const clientId = hesap.client_id;
  const orgId = hesap.org_id;

  // ÖN KOŞUL: gün için başarılı metrik işi (günlük ya da o günü kapsayan geri düzeltme).
  const [onKosul] = await db.$queryRaw<Array<{ n: number }>>(Prisma.sql`
    SELECT count(*)::int AS n FROM sync_jobs
     WHERE ad_account_id = ${adAccountId}::uuid
       AND job_type IN ('insights_daily'::"SyncJobType", 'insights_backfill'::"SyncJobType")
       AND status = 'succeeded'::"SyncJobStatus"
       AND date_from <= ${gun}::date AND date_to >= ${gun}::date`);
  if (!onKosul || onKosul.n === 0) return bos(`${ON_KOSUL_NOTU} ${gun} için günlük metrik henüz yok`);

  const sonCekim = hesap.last_insights_sync_at ? new Date(hesap.last_insights_sync_at) : null;
  const veriTaze = sonCekim !== null && simdi.getTime() - sonCekim.getTime() <= SAGLIK.veriTazelikSaat * 3_600_000;
  const ekler: string[] = [];

  // ── Anomali girdisi ──
  const gunler = okunacakGunler(gun);
  const satirlar = await db.$queryRaw<
    Array<{ seviye: 'account' | 'campaign'; varlik_id: string; gun: string; g: number; t: number; s: string; d: number }>
  >(Prisma.sql`
    SELECT entity_level::text AS seviye, entity_id::text AS varlik_id, date::text AS gun,
           impressions::float8 AS g, clicks::float8 AS t, spend_micros::text AS s, conversions::float8 AS d
      FROM insights_daily
     WHERE client_id = ${clientId}::uuid AND ad_account_id = ${adAccountId}::uuid
       AND breakdown_key = ''
       AND entity_level IN ('account'::"EntityLevel", 'campaign'::"EntityLevel")
       AND date = ANY(${gunler}::date[])`);

  const kampanyaSatirlari = await db.$queryRaw<
    Array<{ id: string; name: string; etkin: boolean; kayit_gunu: string; set_var: boolean; etkin_set_var: boolean }>
  >(Prisma.sql`
    SELECT c.id::text AS id, c.name,
           (c.status = 'active'::"EntityStatus" AND c.deleted_at IS NULL) AS etkin,
           c.created_at::date::text AS kayit_gunu,
           EXISTS (SELECT 1 FROM ad_groups g WHERE g.campaign_id = c.id AND g.deleted_at IS NULL) AS set_var,
           EXISTS (SELECT 1 FROM ad_groups g WHERE g.campaign_id = c.id AND g.deleted_at IS NULL
                     AND g.status = 'active'::"EntityStatus") AS etkin_set_var
      FROM campaigns c
     WHERE c.ad_account_id = ${adAccountId}::uuid AND c.client_id = ${clientId}::uuid`);
  const kampanyaBilgi = new Map(kampanyaSatirlari.map((k) => [k.id, k]));

  const seriler = new Map<string, VarlikSerisi>();
  const hesapSerisi: VarlikSerisi = {
    seviye: 'account',
    varlikId: adAccountId,
    varlikAdi: hesap.name,
    ustAdi: null,
    gunler: new Map(),
    degerlendir: false,
  };
  for (const r of satirlar) {
    const sayilar: GunSayilari = {
      gosterim: Number(r.g),
      tiklama: Number(r.t),
      harcama: Number(BigInt(r.s)) / 1_000_000,
      donusum: Number(r.d),
    };
    if (r.seviye === 'account') {
      hesapSerisi.gunler.set(r.gun, sayilar);
      continue;
    }
    const bilgi = kampanyaBilgi.get(r.varlik_id);
    // Ayna satırı olmayan metrik (yapı taraması henüz yazmadı) adsız bir
    // kart üretmesin; bir sonraki değerlendirmede gelir.
    if (!bilgi) continue;
    let s = seriler.get(r.varlik_id);
    if (!s) {
      s = { seviye: 'campaign', varlikId: r.varlik_id, varlikAdi: bilgi.name, ustAdi: hesap.name, gunler: new Map(), degerlendir: false };
      seriler.set(r.varlik_id, s);
    }
    s.gunler.set(r.gun, sayilar);
  }
  const kampanyalar = [...seriler.values()];
  for (const k of kampanyalar) {
    k.degerlendir = kampanyaBilgi.get(k.varlikId)!.etkin || k.gunler.has(gun);
  }
  if (hesapSerisi.gunler.size === 0 && kampanyalar.length > 0) {
    hesapSerisi.gunler = kampanyaToplami(kampanyalar);
    ekler.push('hesap seviyesi kampanya toplamından');
  }
  hesapSerisi.degerlendir = kampanyaSatirlari.some((k) => k.etkin) || hesapSerisi.gunler.has(gun);

  const nedenler = bosNedenSayaci();
  const bulgular: Bulgu[] = [
    ...anomaliBul(hesapSerisi, gun, nedenler),
    ...kampanyalar.flatMap((k) => anomaliBul(k, gun, nedenler)),
  ];

  // ── Sağlık kontrolleri ──
  const kosan = new Set<SinyalKodu>();
  if (veriTaze) {
    const bas = gunEkle(gun, -(SAGLIK.sifirGosterimGun - 1));
    const gosterim = await db.$queryRaw<Array<{ id: string; g: number; son: string | null }>>(Prisma.sql`
      SELECT entity_id::text AS id, sum(impressions)::float8 AS g,
             max(date) FILTER (WHERE impressions > 0)::text AS son
        FROM insights_daily
       WHERE client_id = ${clientId}::uuid AND ad_account_id = ${adAccountId}::uuid
         AND breakdown_key = '' AND entity_level = 'campaign'::"EntityLevel"
         AND date BETWEEN ${bas}::date AND ${gun}::date
       GROUP BY entity_id`);
    const gMap = new Map(gosterim.map((r) => [r.id, r]));
    bulgular.push(
      ...sifirGosterimBulgulari(
        kampanyaSatirlari.map((k) => ({
          id: k.id,
          ad: k.name,
          ustAd: hesap.name,
          etkin: k.etkin,
          etkinSetVar: k.set_var ? k.etkin_set_var : null,
          kayitGunu: k.kayit_gunu,
          gosterim: Number(gMap.get(k.id)?.g ?? 0),
          sonGosterimGunu: gMap.get(k.id)?.son ?? null,
        })),
        gun,
        veriTaze,
      ),
    );
    kosan.add('sifir_gosterim');

    const p = donusumPencereleri(gun);
    const [d] = await db.$queryRaw<Array<{ pg: number; pd: number; od: number }>>(Prisma.sql`
      SELECT coalesce(sum(impressions) FILTER (WHERE date BETWEEN ${p.pencere.bas}::date AND ${p.pencere.son}::date), 0)::float8 AS pg,
             coalesce(sum(conversions) FILTER (WHERE date BETWEEN ${p.pencere.bas}::date AND ${p.pencere.son}::date), 0)::float8 AS pd,
             coalesce(sum(conversions) FILTER (WHERE date BETWEEN ${p.onceki.bas}::date AND ${p.onceki.son}::date), 0)::float8 AS od
        FROM insights_daily
       WHERE client_id = ${clientId}::uuid AND ad_account_id = ${adAccountId}::uuid
         AND breakdown_key = '' AND entity_level = 'campaign'::"EntityLevel"
         AND date BETWEEN ${p.onceki.bas}::date AND ${p.pencere.son}::date`);
    const dk = donusumKesildiBulgusu(
      {
        hesapId: adAccountId,
        hesapAdi: hesap.name,
        pencere: { ...p.pencere, gosterim: Number(d?.pg ?? 0), donusum: Number(d?.pd ?? 0) },
        onceki: { ...p.onceki, donusum: Number(d?.od ?? 0) },
      },
      gun,
      veriTaze,
    );
    if (dk) bulgular.push(dk);
    kosan.add('donusum_kesildi');
  } else {
    ekler.push(`veri bayat (son çekim ${sonCekim?.toISOString() ?? 'hiç'}): gösterim ve dönüşüm kontrolleri atlandı`);
  }

  /*
   * REKLAM ONAYI yapı taramasının verisi, metrik tazeliğine bağlı değil.
   *
   * DURUM SÜZGECİ `status = active` DEĞİL: Meta reddedilmiş reklamı
   * `DISAPPROVED` etkin durumuyla döndürüyor ve sağlayıcı onu `paused`e
   * çeviriyor (meta.provider.ts). Yalnız `active` aramak bu kontrolü Meta'da
   * TAMAMEN ölü yapardı. Kullanıcının kendi durdurduğu reklam sayılmasın
   * diye `paused` yalnız platformun etkin durumu ret/sorun diyorsa giriyor.
   * Ön süzgeç Reklam Yöneticisi "Sorunlu" süzgeciyle aynı yüklem.
   */
  const reklamlar = await db.$queryRaw<
    Array<{ id: string; name: string; set_adi: string | null; platform: Platform; review_status: string | null; disapproval_reasons: unknown }>
  >(Prisma.sql`
    SELECT ad.id::text AS id, ad.name, g.name AS set_adi, ad.platform::text AS platform,
           ad.review_status, ad.disapproval_reasons
      FROM ads ad
      LEFT JOIN ad_groups g ON g.id = ad.ad_group_id
     WHERE ad.ad_account_id = ${adAccountId}::uuid AND ad.client_id = ${clientId}::uuid
       AND ad.deleted_at IS NULL
       AND (ad.status = 'active'::"EntityStatus"
            OR upper(coalesce(ad.effective_status, '')) IN ('DISAPPROVED', 'WITH_ISSUES'))
       AND (ad.disapproval_reasons IS NOT NULL OR ad.review_status IN ('DISAPPROVED', 'WITH_ISSUES'))`);
  bulgular.push(
    ...reklamOnaysizBulgulari(
      reklamlar.map((r) => ({
        id: r.id,
        ad: r.name,
        ustAd: r.set_adi,
        platform: r.platform,
        reviewStatus: r.review_status,
        disapprovalReasons: r.disapproval_reasons,
      })),
      gun,
    ),
  );
  kosan.add('reklam_onaysiz');

  // ── Yazma + durum makinesi ──
  const mevcutlar = await db.$queryRaw<MevcutSinyal[]>(Prisma.sql`
    SELECT id::text AS id, anahtar, tur, kod, durum, kapatma_z::float8 AS kapatma_z, son_gorulme
      FROM sinyaller WHERE ad_account_id = ${adAccountId}::uuid`);
  const mevcutHarita = new Map(mevcutlar.map((m) => [m.anahtar, m]));
  const goruldu = new Set<string>();
  const zaman = simdi.toISOString();
  let yeni = 0;
  let yenidenAcilan = 0;

  for (const b of bulgular) {
    const anahtar = sinyalAnahtari({ tur: b.tur, kod: b.kod, yon: b.yon, seviye: b.seviye, varlikId: b.varlikId });
    goruldu.add(anahtar);
    const m = mevcutHarita.get(anahtar);
    const karar = gozlemKarari(m ? { durum: m.durum, kapatmaZ: m.kapatma_z === null ? null : Number(m.kapatma_z) } : null, b.z);
    if (!m) {
      await db.$executeRaw(Prisma.sql`
        INSERT INTO sinyaller (org_id, client_id, ad_account_id, platform, anahtar, tur, kod, yon, seviye,
                               varlik_id, varlik_adi, ust_adi, gun, gozlenen, beklenen_alt, beklenen_orta,
                               beklenen_ust, nokta, z, onem, para_birimi, kanit, durum,
                               ilk_gorulme, son_gorulme, son_acilma, updated_at)
        VALUES (${orgId}::uuid, ${clientId}::uuid, ${adAccountId}::uuid, ${hesap.platform}::"Platform",
                ${anahtar}, ${b.tur}, ${b.kod}, ${b.yon}, ${b.seviye}::"EntityLevel",
                ${b.varlikId}::uuid, ${b.varlikAdi.slice(0, 512)}, ${b.ustAdi?.slice(0, 512) ?? null}, ${b.gun}::date,
                ${b.gozlenen}::numeric, ${b.alt}::numeric, ${b.orta}::numeric, ${b.ust}::numeric,
                ${b.nokta}::smallint, ${b.z}::numeric, ${b.onem}, ${hesap.currency}, ${JSON.stringify(b.kanit)}::jsonb,
                'acik', ${zaman}::timestamptz, ${zaman}::timestamptz, ${zaman}::timestamptz, ${zaman}::timestamptz)
        ON CONFLICT (anahtar) DO NOTHING`);
      yeni++;
      continue;
    }
    if (karar.acildi) yenidenAcilan++;
    /*
     * SAHİPLİK KOLONLARI DA YAZILIYOR (CLAUDE.md "upsert denormalize
     * sahiplik kolonunu da güncellemek zorunda"): hesap el değiştirdiyse
     * satır yarım kalmasın.
     */
    await db.$executeRaw(Prisma.sql`
      UPDATE sinyaller SET
        org_id = ${orgId}::uuid, client_id = ${clientId}::uuid,
        varlik_adi = ${b.varlikAdi.slice(0, 512)}, ust_adi = ${b.ustAdi?.slice(0, 512) ?? null},
        gun = ${b.gun}::date, gozlenen = ${b.gozlenen}::numeric,
        beklenen_alt = ${b.alt}::numeric, beklenen_orta = ${b.orta}::numeric, beklenen_ust = ${b.ust}::numeric,
        nokta = ${b.nokta}::smallint, z = ${b.z}::numeric, onem = ${b.onem}, para_birimi = ${hesap.currency},
        kanit = ${JSON.stringify(b.kanit)}::jsonb, son_gorulme = ${zaman}::timestamptz,
        durum = ${karar.sonraki},
        son_acilma = CASE WHEN ${karar.acildi}::boolean THEN ${zaman}::timestamptz ELSE son_acilma END,
        acilma_sayisi = acilma_sayisi + CASE WHEN ${karar.acildi}::boolean THEN 1 ELSE 0 END,
        kapatma_nedeni = CASE WHEN ${karar.acildi}::boolean THEN NULL ELSE kapatma_nedeni END,
        kapatma_z = CASE WHEN ${karar.acildi}::boolean THEN NULL ELSE kapatma_z END,
        kapatan_user_id = CASE WHEN ${karar.acildi}::boolean THEN NULL ELSE kapatan_user_id END,
        kapatma_zamani = CASE WHEN ${karar.acildi}::boolean THEN NULL ELSE kapatma_zamani END,
        kapatma_notu = CASE WHEN ${karar.acildi}::boolean THEN NULL ELSE kapatma_notu END,
        uygulama = CASE WHEN ${karar.acildi}::boolean THEN NULL ELSE uygulama END,
        updated_at = ${zaman}::timestamptz
      WHERE id = ${m.id}::uuid`);
  }

  // Görülmeyen açık/kapatılmış sinyaller: süre doldu mu?
  let kapanan = 0;
  for (const m of mevcutlar) {
    if (goruldu.has(m.anahtar) || m.durum === 'kendiliginden_kapandi') continue;
    if (!sureDolduMu({ tur: m.tur, kod: m.kod, sonGorulme: new Date(m.son_gorulme) }, simdi, kosan)) continue;
    /*
     * DURUM KOŞULU UPDATE'İN İÇİNDE: okuma ile yazma arasında kullanıcı
     * sinyali kapattıysa ya da geri açtıysa onun kararı ezilmesin.
     */
    kapanan += await db.$executeRaw(Prisma.sql`
      UPDATE sinyaller SET durum = 'kendiliginden_kapandi', kapatma_nedeni = 'sure_doldu',
             kapatma_z = NULL, kapatan_user_id = NULL, kapatma_zamani = ${zaman}::timestamptz,
             updated_at = ${zaman}::timestamptz
       WHERE id = ${m.id}::uuid AND durum = ${m.durum}`);
  }

  const kosmayan = SAGLIK_KONTROLLERI.filter((k) => !kosan.has(k));
  if (kosmayan.length > 0 && veriTaze) ekler.push(`koşmayan kontrol: ${kosmayan.join(', ')}`);

  return {
    rows: bulgular.length,
    note: isNotu({ bulgu: bulgular.length, yeni, yenidenAcilan, kapanan, nedenler, ekler }),
    yeni,
    yenidenAcilan,
    kapanan,
  };
}
