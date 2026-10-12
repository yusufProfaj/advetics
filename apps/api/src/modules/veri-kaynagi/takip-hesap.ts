import { Prisma } from '@prisma/client';
import {
  TAKIP_ACIGI,
  eslenemeyenPay,
  kampanyaEsle,
  takipAcigi,
  trafikKaynagi,
  type EslemeKampanyasi,
  type EslenemediNedeni,
  type Platform,
  type TakipAcigiSatiri,
} from '@advetics/shared';
import { gunEkle, type TxLike } from '../sinyal/sinyal-hesap';

/**
 * ═══ TAKİP AÇIĞI — TEK HESAP, İKİ TÜKETİCİ ═══
 *
 * Raporlar'daki "Site ve dönüşüm" tablosu (`GET /veri-kaynaklari/takip-acigi`)
 * ve sinyal kontrolü (`takip_acigi`) AYNI fonksiyonu çağırıyor. İkisi ayrı
 * yazılsaydı ekran "uyumlu" derken sinyal "tutmuyor" diye mail atardı
 * (CLAUDE.md "AYNI ŞEYİ ÜRETEN İKİNCİ FONKSİYON, DOĞDUĞU ANDA AYRIŞIR").
 *
 * SİTE TARAFI İKİ AYRI SORGU, JOIN YOK: anahtar etkinlik tablosu satırı
 * etkinlik başına çoğaltıyor; oturumla JOIN edip toplamak oturumu etkinlik
 * sayısı kadar katlardı. İkisi kampanya anahtarında JS'te birleşiyor.
 *
 * EŞLEME SORGU ANINDA (esleme.ts): saklanmış eşleme kampanya adı değişince
 * bayatlardı.
 */

export interface SiteKampanyaSatiri {
  kaynakOrtam: string;
  kampanyaAdi: string | null;
  kampanyaKimligi: string | null;
  adsKampanyaKimligi: string | null;
  anahtarEtkinlik: number;
  oturum: number;
}

export interface PlatformKampanyasi extends EslemeKampanyasi {
  adAccountId: string;
  donusum: number;
  tiklama: number;
}

export interface TakipHesabi {
  satirlar: TakipAcigiSatiri[];
  eslenemeyen: { pay: number | null; anahtarEtkinlik: number; nedenler: Partial<Record<EslenemediNedeni, number>> };
}

const anahtar = (s: Pick<SiteKampanyaSatiri, 'kaynakOrtam' | 'kampanyaAdi' | 'kampanyaKimligi' | 'adsKampanyaKimligi'>) =>
  JSON.stringify([s.kaynakOrtam, s.kampanyaAdi, s.kampanyaKimligi, s.adsKampanyaKimligi]);

/** Saf hesap: kampanya başına platform + site, etiket ve eşlenemeyen pay. */
export function takipHesapla(kampanyalar: readonly PlatformKampanyasi[], site: readonly SiteKampanyaSatiri[]): TakipHesabi {
  const toplam = new Map<string, { siteDonusum: number; siteOturum: number }>();
  const nedenler: Partial<Record<EslenemediNedeni, number>> = {};
  const payGirdisi: Array<{ eslendi: boolean; ucretli: boolean; anahtarEtkinlik: number }> = [];
  for (const s of site) {
    const e = kampanyaEsle(
      { sourceMedium: s.kaynakOrtam, kampanyaAdi: s.kampanyaAdi, kampanyaKimligi: s.kampanyaKimligi, googleAdsKampanyaKimligi: s.adsKampanyaKimligi },
      kampanyalar,
    );
    const ucretli = trafikKaynagi(s.kaynakOrtam) !== 'diger';
    payGirdisi.push({ eslendi: e.sonuc !== 'eslenemedi', ucretli, anahtarEtkinlik: s.anahtarEtkinlik });
    if (e.sonuc === 'eslenemedi') {
      // Organik trafiğin nedeni sayılmıyor: payda ücretli trafik (eslenemeyenPay notu).
      if (ucretli && s.anahtarEtkinlik > 0) nedenler[e.neden] = (nedenler[e.neden] ?? 0) + s.anahtarEtkinlik;
      continue;
    }
    const t = toplam.get(e.kampanyaId) ?? { siteDonusum: 0, siteOturum: 0 };
    t.siteDonusum += s.anahtarEtkinlik;
    t.siteOturum += s.oturum;
    toplam.set(e.kampanyaId, t);
  }
  const satirlar: TakipAcigiSatiri[] = [];
  for (const k of kampanyalar) {
    const t = toplam.get(k.id);
    // Ne tıklaması ne site verisi olan kampanya tabloyu şişirmesin.
    if (!t && k.tiklama === 0 && k.donusum === 0) continue;
    const g = { platformDonusum: k.donusum, siteDonusum: t?.siteDonusum ?? 0, platformTiklama: k.tiklama };
    const r = takipAcigi(g);
    satirlar.push({
      platform: k.platform,
      kampanyaId: k.id,
      kampanyaAdi: k.ad,
      ...g,
      siteOturum: t?.siteOturum ?? 0,
      etiket: r.etiket,
      oran: r.oran,
    });
  }
  satirlar.sort((a, b) => b.platformTiklama - a.platformTiklama || a.kampanyaAdi.localeCompare(b.kampanyaAdi, 'tr'));
  const p = eslenemeyenPay(payGirdisi);
  return { satirlar, eslenemeyen: { pay: p.pay, anahtarEtkinlik: p.eslenemeyen, nedenler } };
}

/** Kıyasın son günü: GA4 işlenmesini bitirmeden kıyas yok (son `isleniyorGun` gün + bugün dışarıda). */
export function kiyasBitisi(to: string, bugun: string): string {
  const sinir = gunEkle(bugun, -(TAKIP_ACIGI.isleniyorGun + 1));
  return to < sinir ? to : sinir;
}

// ─── Veritabanı okuyucuları (worker'da admin, panelde withTenant) ──────────

/** Site tarafı: iki ayrı toplama, kampanya anahtarında birleşir. */
export async function siteSatirlari(db: TxLike, clientId: string, from: string, to: string): Promise<SiteKampanyaSatiri[]> {
  const etkinlik = await db.$queryRaw<Array<{ ko: string; ad: string | null; kim: string | null; ads: string | null; n: number }>>(Prisma.sql`
    SELECT kaynak_ortam AS ko, kampanya_adi AS ad, kampanya_kimligi AS kim, ads_kampanya_kimligi AS ads,
           sum(anahtar_etkinlik)::float8 AS n
      FROM ga4_anahtar_etkinlik_gunluk
     WHERE client_id = ${clientId}::uuid AND gun BETWEEN ${from}::date AND ${to}::date
     GROUP BY 1, 2, 3, 4`);
  const oturum = await db.$queryRaw<Array<{ ko: string; ad: string | null; kim: string | null; ads: string | null; n: number }>>(Prisma.sql`
    SELECT kaynak_ortam AS ko, kampanya_adi AS ad, kampanya_kimligi AS kim, ads_kampanya_kimligi AS ads,
           sum(oturum)::float8 AS n
      FROM ga4_gunluk
     WHERE client_id = ${clientId}::uuid AND gun BETWEEN ${from}::date AND ${to}::date
     GROUP BY 1, 2, 3, 4`);
  const m = new Map<string, SiteKampanyaSatiri>();
  const al = (r: { ko: string; ad: string | null; kim: string | null; ads: string | null }) => {
    const s = { kaynakOrtam: r.ko, kampanyaAdi: r.ad, kampanyaKimligi: r.kim, adsKampanyaKimligi: r.ads };
    const k = anahtar(s);
    let v = m.get(k);
    if (!v) {
      v = { ...s, anahtarEtkinlik: 0, oturum: 0 };
      m.set(k, v);
    }
    return v;
  };
  for (const r of etkinlik) al(r).anahtarEtkinlik += Number(r.n);
  for (const r of oturum) al(r).oturum += Number(r.n);
  return [...m.values()];
}

/**
 * Platform tarafı: kampanya seviyesi dönüşüm + tıklama. Eşleme adayları
 * workspace'in BÜTÜN kampanyaları (yalnız metriği olanlar değil): utm
 * kimliği bir kampanyaya eşitse o kampanya dönemde harcamasa da bulunmalı.
 * `adAccountId` verilirse yalnız o hesap (sinyal hesap başına koşuyor).
 */
export async function platformKampanyalari(
  db: TxLike,
  clientId: string,
  from: string,
  to: string,
  adAccountId?: string,
): Promise<PlatformKampanyasi[]> {
  const hesapSuzgeci = adAccountId ? Prisma.sql`AND c.ad_account_id = ${adAccountId}::uuid` : Prisma.empty;
  const satirlar = await db.$queryRaw<
    Array<{ id: string; ad_account_id: string; platform: Platform; external_id: string; name: string; d: number | null; t: number | null }>
  >(Prisma.sql`
    SELECT c.id::text AS id, c.ad_account_id::text AS ad_account_id, c.platform::text AS platform, c.external_id, c.name,
           m.d, m.t
      FROM campaigns c
      LEFT JOIN (
        SELECT entity_id, sum(conversions)::float8 AS d, sum(clicks)::float8 AS t
          FROM insights_daily
         WHERE client_id = ${clientId}::uuid AND entity_level = 'campaign'::"EntityLevel" AND breakdown_key = ''
           AND date BETWEEN ${from}::date AND ${to}::date
         GROUP BY entity_id
      ) m ON m.entity_id = c.id
     WHERE c.client_id = ${clientId}::uuid ${hesapSuzgeci}`);
  return satirlar.map((r) => ({
    id: r.id,
    adAccountId: r.ad_account_id,
    platform: r.platform,
    externalId: r.external_id,
    ad: r.name,
    donusum: Number(r.d ?? 0),
    tiklama: Number(r.t ?? 0),
  }));
}
