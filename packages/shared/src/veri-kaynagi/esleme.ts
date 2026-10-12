import type { Platform } from '../constants/platforms';

/**
 * ═══ GA4 TRAFİĞİNİ REKLAM KAMPANYASINA EŞLEME ═══
 *
 * Eşleme SORGU ANINDA yapılır, saklanmaz (türetilmiş metrikler gibi):
 * kampanya adı değişince saklanmış eşleme bayatlar ve "neden eski adla
 * görünüyor" diye hiçbir yerde görünmeyen bir hata doğar.
 *
 * Sıra KESİNDEN TAHMİNE DOĞRU DEĞİL, KESİN VE TAM EŞLEŞME, sonra DUR:
 *   1. `sessionGoogleAdsCampaignId` (Google Ads otomatik etiketleme + GA4
 *      bağlantısı) → Google kampanyasının `external_id`si.
 *   2. `utm_campaign` (`sessionCampaignId` ya da `sessionCampaignName`) bir
 *      kampanyanın `external_id`sine BİREBİR eşit → o kampanya. AdvCampaign
 *      Meta'da `utm_campaign={{campaign.id}}` yazmalı (MIMARI Ç-6): kimlik
 *      adla değişmiyor.
 *   3. Normalleştirilmiş AD workspace'te o platformda TEK kampanyaya eşit →
 *      o kampanya. İki kampanya aynı adı taşıyorsa `ad_belirsiz`: biri
 *      seçilmez (tahmin etmektense kısıtla).
 *   4. Kalan: `eslenemedi` + neden. Ekranda pay olarak YAZILIR.
 * Benzerlik (içerir, bulanık eşleşme) YOK: "Yaz Kampanyası" ile "Yaz
 * Kampanyası 2" karışırsa dönüşüm yanlış kampanyaya yazılır ve fark
 * hiçbir zaman görünmez.
 */

export const TRAFIK_KAYNAKLARI = ['google_ucretli', 'meta_ucretli', 'linkedin_ucretli', 'diger'] as const;
export type TrafikKaynagi = (typeof TRAFIK_KAYNAKLARI)[number];

/**
 * `sessionSourceMedium` ("google / cpc") hangi ücretli platforma ait?
 * Liste KAPALI: bilinmeyen ortam `diger`. Organik Facebook trafiği
 * ("facebook / referral") ücretli SAYILMAZ: reklam dönüşümüyle kıyaslamak
 * organik paylaşımları reklama yazmak olurdu.
 */
const UCRETLI_ORTAM = /^(cpc|ppc|paid|paidsocial|paid_social|paid-social|social_paid|cpm|display|ads?)$/;
const META_KAYNAK = /^(facebook|fb|instagram|ig|meta|an|messenger|m\.facebook\.com|l\.facebook\.com|lm\.facebook\.com|l\.instagram\.com)$/;

export function trafikKaynagi(sourceMedium: string): TrafikKaynagi {
  const [kaynakHam, ortamHam] = sourceMedium.split(' / ');
  const kaynak = (kaynakHam ?? '').trim().toLowerCase();
  const ortam = (ortamHam ?? '').trim().toLowerCase();
  if (!UCRETLI_ORTAM.test(ortam)) return 'diger';
  if (kaynak === 'google' || kaynak === 'youtube' || kaynak === 'googleads') return 'google_ucretli';
  if (META_KAYNAK.test(kaynak)) return 'meta_ucretli';
  if (kaynak === 'linkedin' || kaynak === 'lnkd.in') return 'linkedin_ucretli';
  return 'diger';
}

export const TRAFIK_PLATFORMU: Record<Exclude<TrafikKaynagi, 'diger'>, Platform> = {
  google_ucretli: 'google',
  meta_ucretli: 'meta',
  linkedin_ucretli: 'linkedin',
};

/**
 * Ad normalleştirme: Türkçe büyük/küçük harf (`I`→`ı`, `İ`→`i`), boşluk
 * sıkıştırma, baş/son boşluk. Aksan SİLİNMEZ: "Çanta" ile "Canta" iki ayrı
 * kampanya olabilir ve birleştirmek tahmin olur.
 */
export function adNormalize(ad: string): string {
  return ad.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
}

export interface EslemeKampanyasi {
  id: string;
  platform: Platform;
  externalId: string;
  ad: string;
}

export interface Ga4KampanyaSatiri {
  sourceMedium: string;
  kampanyaAdi: string | null;
  kampanyaKimligi: string | null;
  googleAdsKampanyaKimligi: string | null;
}

export const ESLEME_SONUCLARI = ['kimlik', 'utm_kimlik', 'ad', 'eslenemedi'] as const;
export type EslemeSonucu = (typeof ESLEME_SONUCLARI)[number];

export const ESLENEMEDI_NEDENLERI = [
  'ucretli_degil',
  'utm_yok',
  'kampanya_bulunamadi',
  'ad_belirsiz',
  'diger_kovasi',
] as const;
export type EslenemediNedeni = (typeof ESLENEMEDI_NEDENLERI)[number];

export const ESLENEMEDI_NEDEN_METNI: Record<EslenemediNedeni, string> = {
  ucretli_degil: 'Ücretli reklam trafiği değil',
  utm_yok: 'Reklam bağlantısında kampanya etiketi (utm_campaign) yok',
  kampanya_bulunamadi: 'Etiketteki kampanya bu workspace\'te yok',
  ad_belirsiz: 'Aynı adı taşıyan birden çok kampanya var',
  diger_kovasi: 'Analytics bu satırı "(other)" kovasında topladı',
};

export type EslemeCevabi =
  | { sonuc: Exclude<EslemeSonucu, 'eslenemedi'>; kampanyaId: string; platform: Platform }
  | { sonuc: 'eslenemedi'; neden: EslenemediNedeni; platform: Platform | null };

export function kampanyaEsle(satir: Ga4KampanyaSatiri, kampanyalar: readonly EslemeKampanyasi[]): EslemeCevabi {
  const kaynak = trafikKaynagi(satir.sourceMedium);
  if (satir.kampanyaAdi?.trim() === '(other)') return { sonuc: 'eslenemedi', neden: 'diger_kovasi', platform: null };
  if (kaynak === 'diger') return { sonuc: 'eslenemedi', neden: 'ucretli_degil', platform: null };
  const platform = TRAFIK_PLATFORMU[kaynak];
  const adaylar = kampanyalar.filter((k) => k.platform === platform);

  if (platform === 'google' && satir.googleAdsKampanyaKimligi && !ga4Ozel(satir.googleAdsKampanyaKimligi)) {
    const k = adaylar.find((c) => c.externalId === satir.googleAdsKampanyaKimligi);
    if (k) return { sonuc: 'kimlik', kampanyaId: k.id, platform };
  }
  for (const aday of [satir.kampanyaKimligi, satir.kampanyaAdi]) {
    if (!aday || ga4Ozel(aday)) continue;
    const k = adaylar.find((c) => c.externalId === aday.trim());
    if (k) return { sonuc: 'utm_kimlik', kampanyaId: k.id, platform };
  }
  const ad = satir.kampanyaAdi && !ga4Ozel(satir.kampanyaAdi) ? adNormalize(satir.kampanyaAdi) : null;
  if (!ad) return { sonuc: 'eslenemedi', neden: 'utm_yok', platform };
  const ayni = adaylar.filter((c) => adNormalize(c.ad) === ad);
  if (ayni.length === 1) return { sonuc: 'ad', kampanyaId: ayni[0]!.id, platform };
  if (ayni.length > 1) return { sonuc: 'eslenemedi', neden: 'ad_belirsiz', platform };
  return { sonuc: 'eslenemedi', neden: 'kampanya_bulunamadi', platform };
}

function ga4Ozel(v: string): boolean {
  const t = v.trim();
  return t === '' || t === '(not set)' || t === '(other)' || t === '(none)' || t === '(direct)';
}
