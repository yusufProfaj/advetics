import { sec, type Dil, type HazirlamaAdimDurumu, type HazirlamaAdimKodu, type HazirlamaDurumu } from '@advetics/shared';
import { markaMerkeziKurulumSozlugu } from '@/dil/sozlukler/marka-merkezi-kurulum';

/**
 * Hazırlama kartının saf kararları (`hazirlama-karti.tsx`). Panelde bileşen
 * render eden test altyapısı yok; karar burada, çizim orada.
 */

/**
 * Sunucu arka planda çalışırken kart kendini yoklar; bitince durur.
 * `bekliyor` YOKLANMAZ: hesap atanmamış workspace'te iş hiç başlamıyor ve
 * yoklamak sınır dolana kadar boşa istek atmak olurdu. İş başladıysa ilk
 * okuma zaten `calisiyor` döndürüyor.
 */
export function yoklamaGerekli(durum: HazirlamaDurumu): boolean {
  return durum === 'calisiyor';
}

/** 3 sn, en çok 40 kez (2 dk): takılan bir iş sonsuza kadar istek atmasın. */
export const YOKLAMA_ARALIGI_MS = 3000;
export const YOKLAMA_SINIRI = 40;

/** Sözlük, dallanma değil: sunucuya yeni bir adım eklenince derleme kırılsın (Record anahtarı sözlükte). */
export function adimAdi(kod: HazirlamaAdimKodu, dil: Dil = 'tr'): string {
  // "Site" iki dilde aynı: sözlükte tutulursa çevrilmemiş sayılır.
  return kod === 'site' ? 'Site' : sec(markaMerkeziKurulumSozlugu, dil).hazirlamaAdi[kod];
}

export const ADIM_DURUM_TONU: Record<HazirlamaAdimDurumu, 'tamam' | 'soru' | 'eksik' | 'pasif'> = {
  tamam: 'tamam',
  soru: 'soru',
  eksik: 'eksik',
  hata: 'eksik',
  atlandi: 'pasif',
};

// Hesap atanmamış workspace'te iş hiç başlamıyor; "Hazırlanıyor" yalan olurdu.
export function genelDurumMetni(durum: HazirlamaDurumu, dil: Dil = 'tr'): string {
  return sec(markaMerkeziKurulumSozlugu, dil).hazirlamaDurum[durum];
}

/**
 * Kullanıcının yazdığı günlük bütçe ("750", "1.250,50") → micros dizgesi.
 * Türkçe yazımda nokta binlik, virgül ondalık. Kayan nokta YOK: 0,1 + 0,2
 * hatası para tutarında yanlış sayı demek.
 */
export function butceGirdisi(metin: string, dil: Dil = 'tr'): { tur: 'tamam'; micros: string } | { tur: 'hata'; mesaj: string } {
  const temiz = metin.trim().replace(/\s/g, '').replace(/\./g, '');
  const m = /^(\d{1,12})(?:,(\d{1,2}))?$/.exec(temiz);
  if (!m) return { tur: 'hata', mesaj: sec(markaMerkeziKurulumSozlugu, dil).butceSayiDegil };
  const micros = BigInt(m[1]!) * 1_000_000n + BigInt((m[2] ?? '').padEnd(2, '0')) * 10_000n;
  if (micros <= 0n) return { tur: 'hata', mesaj: sec(markaMerkeziKurulumSozlugu, dil).butceSifir };
  return { tur: 'tamam', micros: micros.toString() };
}
