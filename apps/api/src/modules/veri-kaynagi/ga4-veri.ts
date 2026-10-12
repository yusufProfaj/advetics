import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { GA4_RAPORLARI, ga4ParaMikro, ga4Tarih } from '@advetics/shared';
import type { Ga4RaporSatiri } from '../connections/providers/ga4';
import { topluUpsert, topluYazmaNotu } from '../../queue/toplu-yazma';
import type { TxLike } from '../sinyal/sinyal-hesap';

/**
 * ═══ GA4 RAPOR SATIRI → TABLO SATIRI ═══
 *
 * İki rapor (`GA4_RAPORLARI.trafik`, `.anahtarEtkinlik`) iki tabloya gidiyor
 * ve BİRLEŞTİRİLMİYOR (shared ga4.ts başı: eventName boyutu satırı etkinlik
 * başına çoğaltıyor). Boyut ve metrik konumları tanımdan `indexOf` ile
 * okunuyor: sırayı burada elle yazmak, tanım değişince sütunları sessizce
 * kaydırırdı (oturum gelir kolonuna yazılırdı).
 */

export interface Ga4KampanyaAnahtari {
  kaynakOrtam: string;
  kampanyaAdi: string | null;
  kampanyaKimligi: string | null;
  adsKampanyaKimligi: string | null;
}

export interface Ga4TrafikKaydi extends Ga4KampanyaAnahtari {
  gun: string;
  hash: string;
  oturum: number;
  etkilesimliOturum: number;
  kullanici: number;
  anahtarEtkinlik: number;
  satinAlma: number;
  gelirMikro: bigint;
}

export interface Ga4EtkinlikKaydi extends Ga4KampanyaAnahtari {
  gun: string;
  hash: string;
  etkinlik: string;
  anahtarEtkinlik: number;
}

/** Boş dize NULL; "(not set)" OLDUĞU GİBİ (eşleme onu özel değer sayıyor, ham veri silinmiyor). */
const bosIseNull = (v: string | undefined): string | null => (v === undefined || v === '' ? null : v.slice(0, 300));

/**
 * SATIR ANAHTARI: kaynak/ortam ‖ kampanya adı ‖ kampanya kimliği ‖ Ads kimliği.
 * JSON dizisi olarak özetleniyor: düz birleştirme ("a|b" + "c" = "a" + "b|c")
 * iki farklı satırı aynı anahtara düşürürdü.
 */
export function ga4SatirHash(k: Ga4KampanyaAnahtari): string {
  return createHash('sha256')
    .update(JSON.stringify([k.kaynakOrtam, k.kampanyaAdi, k.kampanyaKimligi, k.adsKampanyaKimligi]))
    .digest('hex');
}

function konumlar<T extends readonly string[]>(liste: T, adlar: readonly string[]): number[] {
  return adlar.map((a) => {
    const i = liste.indexOf(a);
    if (i < 0) throw new Error(`GA4 rapor tanımında ${a} yok`);
    return i;
  });
}

const sayi = (v: string | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export function trafikSatirlari(ham: readonly Ga4RaporSatiri[]): Ga4TrafikKaydi[] {
  const t = GA4_RAPORLARI.trafik;
  const [iGun, iSm, iAd, iKimlik, iAds] = konumlar(t.boyutlar, ['date', 'sessionSourceMedium', 'sessionCampaignName', 'sessionCampaignId', 'sessionGoogleAdsCampaignId']);
  const [mOturum, mEtk, mKul, mAnahtar, mGelir, mSatin] = konumlar(t.metrikler, [
    'sessions',
    'engagedSessions',
    'totalUsers',
    'keyEvents',
    'totalRevenue',
    'ecommercePurchases',
  ]);
  return ham.map((r) => {
    const k: Ga4KampanyaAnahtari = {
      kaynakOrtam: (r.boyutlar[iSm!] ?? '').slice(0, 300),
      kampanyaAdi: bosIseNull(r.boyutlar[iAd!]),
      kampanyaKimligi: bosIseNull(r.boyutlar[iKimlik!]),
      adsKampanyaKimligi: bosIseNull(r.boyutlar[iAds!]),
    };
    return {
      ...k,
      gun: ga4Tarih(r.boyutlar[iGun!] ?? ''),
      hash: ga4SatirHash(k),
      oturum: Math.round(sayi(r.metrikler[mOturum!])),
      etkilesimliOturum: Math.round(sayi(r.metrikler[mEtk!])),
      kullanici: Math.round(sayi(r.metrikler[mKul!])),
      anahtarEtkinlik: sayi(r.metrikler[mAnahtar!]),
      satinAlma: sayi(r.metrikler[mSatin!]),
      gelirMikro: ga4ParaMikro(r.metrikler[mGelir!] ?? '0'),
    };
  });
}

export function etkinlikSatirlari(ham: readonly Ga4RaporSatiri[]): Ga4EtkinlikKaydi[] {
  const t = GA4_RAPORLARI.anahtarEtkinlik;
  const [iGun, iSm, iAd, iKimlik, iAds, iOlay] = konumlar(t.boyutlar, [
    'date',
    'sessionSourceMedium',
    'sessionCampaignName',
    'sessionCampaignId',
    'sessionGoogleAdsCampaignId',
    'eventName',
  ]);
  const [mAnahtar] = konumlar(t.metrikler, ['keyEvents']);
  return ham
    .map((r) => {
      const k: Ga4KampanyaAnahtari = {
        kaynakOrtam: (r.boyutlar[iSm!] ?? '').slice(0, 300),
        kampanyaAdi: bosIseNull(r.boyutlar[iAd!]),
        kampanyaKimligi: bosIseNull(r.boyutlar[iKimlik!]),
        adsKampanyaKimligi: bosIseNull(r.boyutlar[iAds!]),
      };
      return {
        ...k,
        gun: ga4Tarih(r.boyutlar[iGun!] ?? ''),
        hash: ga4SatirHash(k),
        etkinlik: (r.boyutlar[iOlay!] ?? '').slice(0, 100),
        anahtarEtkinlik: sayi(r.metrikler[mAnahtar!]),
      };
    })
    .filter((s) => s.etkinlik !== '');
}

export interface KaynakSahibi {
  id: string;
  clientId: string;
  orgId: string;
  paraBirimi: string | null;
}

export type IslemYapabilen = TxLike & {
  $transaction?: <T>(fn: (tx: TxLike) => Promise<T>, opts?: { timeout?: number; maxWait?: number }) => Promise<T>;
};

/**
 * ═══ PENCERE SİL-YENİDEN-YAZ (MIMARI § 3.1) ═══
 *
 * Upsert YETMİYOR: GA4'te bir kampanya satırı ertesi gün "(other)" kovasına
 * geçebiliyor. Upsert eski satırı yetim bırakır ve aynı oturumlar hem
 * kampanyada hem "(other)"da sayılır (çift sayım, hiç hata yok). Penceredeki
 * günler önce siliniyor, sonra yazılıyor; ikisi TEK transaction'da (yarıda
 * kalan bir yazma, pencereyi boş bırakmasın).
 *
 * Transaction yalnız veritabanı işi taşıyor; platform çağrısı ÖNCE ve
 * DIŞARIDA bitti (CLAUDE.md "platform çağrısı transaction'ın içinde
 * olamaz"). Büyük mülkte yazma 5 sn'yi aşabildiği için süre açıkça uzatıldı.
 */
export async function ga4PencereYaz(
  db: IslemYapabilen,
  kaynak: KaynakSahibi,
  aralik: { from: string; to: string },
  trafik: readonly Ga4TrafikKaydi[],
  etkinlik: readonly Ga4EtkinlikKaydi[],
): Promise<{ trafik: number; etkinlik: number; not: string }> {
  const yaz = async (tx: TxLike) => {
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM ga4_gunluk
       WHERE veri_kaynagi_id = ${kaynak.id}::uuid AND gun BETWEEN ${aralik.from}::date AND ${aralik.to}::date`);
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM ga4_anahtar_etkinlik_gunluk
       WHERE veri_kaynagi_id = ${kaynak.id}::uuid AND gun BETWEEN ${aralik.from}::date AND ${aralik.to}::date`);
    // Pencere dışına düşen satır yazılmaz: GA4 istenen aralığı döndürüyor,
    // ama dışarıdan gelen bir satır silinmemiş bir günün üstüne binerdi.
    const icinde = <T extends { gun: string }>(s: T) => s.gun >= aralik.from && s.gun <= aralik.to;
    const t = await topluUpsert({
      satirlar: trafik.filter(icinde),
      anahtar: (s) => `${s.gun}|${s.hash}`,
      deger: (s) => Prisma.sql`(${s.gun}::date, ${kaynak.id}::uuid, ${s.hash}, ${kaynak.clientId}::uuid, ${kaynak.orgId}::uuid,
        ${s.kaynakOrtam}, ${s.kampanyaAdi}, ${s.kampanyaKimligi}, ${s.adsKampanyaKimligi},
        ${s.oturum}::int, ${s.etkilesimliOturum}::int, ${s.kullanici}::int, ${s.anahtarEtkinlik}::numeric, ${s.satinAlma}::numeric,
        ${s.gelirMikro}::bigint, ${kaynak.paraBirimi})`,
      yaz: (values) =>
        tx.$executeRaw(Prisma.sql`
          INSERT INTO ga4_gunluk (gun, veri_kaynagi_id, satir_hash, client_id, org_id, kaynak_ortam, kampanya_adi,
                                  kampanya_kimligi, ads_kampanya_kimligi, oturum, etkilesimli_oturum, kullanici,
                                  anahtar_etkinlik, satin_alma, gelir_mikro, para_birimi)
          VALUES ${values}
          ON CONFLICT (gun, veri_kaynagi_id, satir_hash) DO UPDATE SET
            client_id = EXCLUDED.client_id, org_id = EXCLUDED.org_id,
            oturum = EXCLUDED.oturum, etkilesimli_oturum = EXCLUDED.etkilesimli_oturum, kullanici = EXCLUDED.kullanici,
            anahtar_etkinlik = EXCLUDED.anahtar_etkinlik, satin_alma = EXCLUDED.satin_alma,
            gelir_mikro = EXCLUDED.gelir_mikro, para_birimi = EXCLUDED.para_birimi, cekildi = now()`),
    });
    const e = await topluUpsert({
      satirlar: etkinlik.filter(icinde),
      anahtar: (s) => `${s.gun}|${s.hash}|${s.etkinlik}`,
      deger: (s) => Prisma.sql`(${s.gun}::date, ${kaynak.id}::uuid, ${s.hash}, ${s.etkinlik}, ${kaynak.clientId}::uuid, ${kaynak.orgId}::uuid,
        ${s.kaynakOrtam}, ${s.kampanyaAdi}, ${s.kampanyaKimligi}, ${s.adsKampanyaKimligi}, ${s.anahtarEtkinlik}::numeric)`,
      yaz: (values) =>
        tx.$executeRaw(Prisma.sql`
          INSERT INTO ga4_anahtar_etkinlik_gunluk (gun, veri_kaynagi_id, satir_hash, etkinlik, client_id, org_id, kaynak_ortam,
                                                   kampanya_adi, kampanya_kimligi, ads_kampanya_kimligi, anahtar_etkinlik)
          VALUES ${values}
          ON CONFLICT (gun, veri_kaynagi_id, satir_hash, etkinlik) DO UPDATE SET
            client_id = EXCLUDED.client_id, org_id = EXCLUDED.org_id,
            anahtar_etkinlik = EXCLUDED.anahtar_etkinlik, cekildi = now()`),
    });
    const notlar = [topluYazmaNotu(t), topluYazmaNotu(e)].filter(Boolean);
    return { trafik: t.yazilan, etkinlik: e.yazilan, not: notlar.join(' · ') };
  };
  return db.$transaction ? db.$transaction(yaz, { timeout: 60_000, maxWait: 10_000 }) : yaz(db);
}
