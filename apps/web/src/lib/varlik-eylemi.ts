import type { Platform, VarlikEylemSeviyesi } from '@advetics/shared';
import { googleYazilamazMi, sec, type Dil } from '@advetics/shared';
import { reklamYoneticisiSozlugu } from '@/dil/sozlukler/reklam-yoneticisi';

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
  /** Varlığın kampanyasının kanalı; Google Video'da API yazmıyor. */
  kampanyaKanali?: string | null;
}): VarlikEylemHedefi | null {
  if (!SATIR_ICI_YAZILABILIR.includes(v.platform)) return null;
  // Canlıda bir kullanıcı Google Video kampanyasına bastı ve Google
  // reddetti (2026-10-10): çalışmayacak düğme gösterilmiyor.
  if (googleYazilamazMi(v.platform, v.kampanyaKanali)) return null;
  if (v.durum !== 'active' && v.durum !== 'paused') return null;
  return { seviye: v.seviye, id: v.id, ad: v.ad, platform: v.platform, yayinda: v.durum === 'active' };
}

/**
 * Onay penceresinin metinleri. Reklam setini ya da kampanyayı durdurmak
 * altındaki her şeyi durdurur: bunu söylemek, "tek reklamı durdurdum"
 * sanılıp bütün setin kapanmasını önler.
 */
export function varlikEylemMetni(h: VarlikEylemHedefi, dil: Dil = 'tr'): {
  baslik: string;
  aciklama: string;
  once: string;
  sonra: string;
} {
  // Türkçe belirtme hâli düzeye göre değişiyor ("Kampanyayı", "Reklam setini"):
  // ekle-çıkar yerine sözlükte açık tablo.
  const e = sec(reklamYoneticisiSozlugu, dil).eylem;
  const nesne = e.nesne[h.seviye];
  const kapsam = e.kapsam[h.seviye];
  return h.yayinda
    ? {
        baslik: e.durdurBaslik(nesne),
        aciklama: e.durdurAciklama(h.ad, kapsam),
        once: e.yayinda,
        sonra: e.duraklatildi,
      }
    : {
        baslik: e.baslatBaslik(nesne),
        aciklama: e.baslatAciklama(h.ad),
        once: e.duraklatildi,
        sonra: e.yayinda,
      };
}
