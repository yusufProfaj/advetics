import type { HazirlamaAdimDurumu, HazirlamaAdimKodu, HazirlamaDurumu } from '@advetics/shared';

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

/** Sözlük, dallanma değil: sunucuya yeni bir adım eklenince derleme kırılsın. */
export const ADIM_ADI: Record<HazirlamaAdimKodu, string> = {
  site: 'Site',
  marka: 'Marka bilgileri',
  olcum: 'Ölçüm',
  piksel: 'Meta pikseli',
  kategori: 'Reklam kategorisi',
  konum: 'Varsayılan konum',
  butce: 'Günlük bütçe',
};

export const ADIM_DURUM_TONU: Record<HazirlamaAdimDurumu, 'tamam' | 'soru' | 'eksik' | 'pasif'> = {
  tamam: 'tamam',
  soru: 'soru',
  eksik: 'eksik',
  hata: 'eksik',
  atlandi: 'pasif',
};

export const GENEL_DURUM_METNI: Record<HazirlamaDurumu, string> = {
  // Hesap atanmamış workspace'te iş hiç başlamıyor; "Hazırlanıyor" yalan olurdu.
  bekliyor: 'Hesap bekleniyor',
  calisiyor: 'Hazırlanıyor',
  hazir: 'Reklama hazır',
  soru: 'Cevabın bekleniyor',
  eksik: 'Eksik var',
};

/**
 * Kullanıcının yazdığı günlük bütçe ("750", "1.250,50") → micros dizgesi.
 * Türkçe yazımda nokta binlik, virgül ondalık. Kayan nokta YOK: 0,1 + 0,2
 * hatası para tutarında yanlış sayı demek.
 */
export function butceGirdisi(metin: string): { tur: 'tamam'; micros: string } | { tur: 'hata'; mesaj: string } {
  const temiz = metin.trim().replace(/\s/g, '').replace(/\./g, '');
  const m = /^(\d{1,12})(?:,(\d{1,2}))?$/.exec(temiz);
  if (!m) return { tur: 'hata', mesaj: 'Tutarı sayı olarak yaz (örn. 750 ya da 750,50).' };
  const micros = BigInt(m[1]!) * 1_000_000n + BigInt((m[2] ?? '').padEnd(2, '0')) * 10_000n;
  if (micros <= 0n) return { tur: 'hata', mesaj: 'Günlük bütçe sıfırdan büyük olmalı.' };
  return { tur: 'tamam', micros: micros.toString() };
}
