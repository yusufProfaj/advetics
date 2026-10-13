import { REHBER_AMACLARI, type RehberAmacKodu, type RehberPlatformu } from '../reklam/rehber/amaclar';
import { adresAlani } from '../reklam/rehber/eksikler';
import { beyanVarMi, type KurulumBeyani } from './beyan';

/**
 * ═══ "WEB SİTEMİZ YOK" — BEYANI OKUYAN TEK YARDIMCI ═══
 * (kullanıcı kararı, 2026-10-13; docs/kurulum-sihirbazi/MIMARI.md)
 *
 * Beyanın iki sonucu var ve ikisi de buradan okunur:
 *
 *   1. KURULUM: Dönüşüm ölçümü ve Meta pikseli adımları kapsam dışı
 *      (`SITE_YOK_KAPSAM_DISI_ADIMLAR`, `kurulumListesi` okuyor). Site yokken
 *      Tag Manager konteyneri açmak, etiket yayınlamak ya da piksel kurmak
 *      hiçbir yere gitmeyen iş; "Eksikleri tamamla" da bu adımlara dokunmaz.
 *   2. ADVCAMPAIGN: site isteyen amaç × platform kapanır
 *      (`siteYokRehberKapisi`). Kural İKİNCİ KEZ YAZILMIYOR: rehberin kendi
 *      adres kuralı (`adresAlani`) "zorunlu" diyorsa kapalı. Bugün bu Meta'da
 *      SITE ve SATIS, Google'da HER kurgu (Google'ın bütün kurguları nihai
 *      adres istiyor). Kural değişirse kapı da kendiliğinden değişir; iki
 *      liste tutmak, rehberin bir amaca adres sormayı bıraktığı gün o amacın
 *      site yok diye kapalı kalması demekti.
 *
 * Neden ayrı yardımcı: beyanı rehber, kurulum listesi, API'nin `tamamla`
 * ucu ve sihirbaz okuyacak. Her birinin `beyanlar.some(b => b.oge ===
 * 'site_yok')` yazması, biri okunamayan beyanı "yok" sayınca ayrışırdı.
 */

/** Beyan varsa kurulum listesinde kapsam dışı kalan adımlar (`KURULUM_LISTESI` kodları). */
export const SITE_YOK_KAPSAM_DISI_ADIMLAR = ['piksel', 'olcum'] as const;

/** Kurulum listesindeki site adresi ve site taraması parçaları da kapanır. */
export const SITE_YOK_KAPSAM_DISI_PARCALAR = [
  { kaynak: 'hazirlik', kod: 'site_adresi' },
  { kaynak: 'hazirlama', kod: 'site' },
] as const;

/** Üç hâlli: `null` = beyanlar okunamadı (bkz. `beyanVarMi`). */
export function siteYokMu(beyanlar: readonly Pick<KurulumBeyani, 'oge'>[] | null): boolean | null {
  return beyanVarMi(beyanlar, 'site_yok');
}

export const SITE_YOK_SEBEBI =
  'Bu workspace için "web sitemiz yok" dendi; bu amaç bir site adresi istiyor. Site eklenince Kurulum’dan beyanı geri al.';

export type SiteYokKapisi = { acik: true } | { acik: false; sebep: string };

/**
 * Bir amaç bu platformda, site yokken kurulabilir mi.
 *
 * `siteYok` ÜÇ HÂLLİ girer: `null` (beyan okunamadı) KAPATMAZ — rehber
 * zaten adres alanını zorunlu tutuyor ve site yoksa eksik listesi bunu
 * söyleyecek; okunamayan bir beyan yüzünden çalışan bir amacı gizlemek,
 * yanlış alarmın ters yüzü.
 */
export function siteYokRehberKapisi(
  amac: RehberAmacKodu,
  platform: RehberPlatformu,
  siteYok: boolean | null,
): SiteYokKapisi {
  if (siteYok !== true) return { acik: true };
  const acik: Record<RehberPlatformu, boolean> = { meta: platform === 'meta', google: platform === 'google' };
  // Google'da karşılığı olmayan amaç (WhatsApp) zaten kapalı; sebebi rehberin kendi sebebi.
  if (platform === 'google' && REHBER_AMACLARI[amac].google.kurgu === null) return { acik: true };
  return adresAlani(amac, acik) === 'zorunlu' ? { acik: false, sebep: SITE_YOK_SEBEBI } : { acik: true };
}
