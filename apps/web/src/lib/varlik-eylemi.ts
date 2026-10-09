import type { Platform, VarlikEylemSeviyesi } from '@advetics/shared';

/**
 * Reklam Yöneticisi satırındaki durdur/başlat hedefi. Sunucuda üretiliyor
 * (`ads-explorer/page.tsx`), yalnız yazabilen platformlarda (Meta, Google)
 * ve yalnız durumu belli satırlarda (yayında / duraklatılmış): silinmiş ya da
 * incelemedeki bir varlığa "Başlat" göstermek çalışmayan bir düğme olurdu.
 */
export interface VarlikEylemHedefi {
  seviye: VarlikEylemSeviyesi;
  id: string;
  ad: string;
  platform: Platform;
  yayinda: boolean;
}

/** Hangi platformlar satır içinden yazılabiliyor (LinkedIn'de yazma yolu yok). */
export const SATIR_ICI_YAZILABILIR: readonly Platform[] = ['meta', 'google'];

/** Türkçe belirtme hâli düzeye göre değişiyor; ekle-çıkar yerine açık tablo. */
const NESNE: Record<VarlikEylemSeviyesi, string> = {
  campaign: 'Kampanyayı',
  ad_group: 'Reklam setini',
  ad: 'Reklamı',
};

/**
 * Satırın durumundan hedef. `null` = düğme yok. Saf: kural burada sınanıyor,
 * çizim bileşende.
 */
export function eylemHedefiCoz(v: {
  seviye: VarlikEylemSeviyesi;
  id: string;
  ad: string;
  platform: Platform;
  durum: string;
}): VarlikEylemHedefi | null {
  if (!SATIR_ICI_YAZILABILIR.includes(v.platform)) return null;
  if (v.durum !== 'active' && v.durum !== 'paused') return null;
  return { seviye: v.seviye, id: v.id, ad: v.ad, platform: v.platform, yayinda: v.durum === 'active' };
}

/**
 * Onay penceresinin metinleri. Reklam setini ya da kampanyayı durdurmak
 * altındaki her şeyi durdurur: bunu söylemek, "tek reklamı durdurdum"
 * sanılıp bütün setin kapanmasını önler.
 */
export function varlikEylemMetni(h: VarlikEylemHedefi): {
  baslik: string;
  aciklama: string;
  once: string;
  sonra: string;
} {
  const nesne = NESNE[h.seviye];
  const kapsam =
    h.seviye === 'campaign'
      ? ' Kampanyanın altındaki bütün reklam setleri ve reklamlar da yayın yapmaz.'
      : h.seviye === 'ad_group'
        ? ' Setin altındaki bütün reklamlar da yayın yapmaz.'
        : ' Reklam seti ve kampanya çalışmaya devam eder.';
  return h.yayinda
    ? {
        baslik: `${nesne} durdur: onay`,
        aciklama: `"${h.ad}" duraklatılacak.${kapsam} İstediğin zaman buradan yeniden başlatabilirsin.`,
        once: 'Yayında',
        sonra: 'Duraklatıldı',
      }
    : {
        baslik: `${nesne} başlat: onay`,
        aciklama: `"${h.ad}" yeniden yayına alınacak ve harcama başlayacak.`,
        once: 'Duraklatıldı',
        sonra: 'Yayında',
      };
}
