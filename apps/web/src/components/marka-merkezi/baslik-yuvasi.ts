/**
 * MARKA MERKEZİ BAŞLIĞININ EYLEM YUVASI (onaylı taslak `#marka`).
 *
 * "Eksikleri tamamla" ve "Sihirbazla tamamla" başlığın SAĞINDA duruyor ama
 * işi yapan durum (kapsam, bekleme, sonuç) `KurulumListesi`nin içinde. Başlık
 * sunucu bileşeni; düğmeler yuvaya portal ile çiziliyor, durum tek yerde
 * kalıyor. Sabit AYRI DOSYADA: `'use client'` bir modülden sunucu
 * bileşenine aktarılan düz değer dize değil istemci referansı olur ve
 * `id` niteliğine `[object Object]`a benzer bir şey yazılırdı.
 */
export const KURULUM_EYLEM_YUVASI = 'marka-merkezi-baslik-eylemi';
