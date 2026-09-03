import { ImageResponse } from 'next/og';
import { markaIsareti } from './marka-isareti';

/**
 * TARAYICI SEKMESİ İKONU.
 *
 * Sekmede genel bir "dünya" simgesi görünüyordu: `app/` altında hiçbir
 * `icon`/`favicon` dosyası yoktu, yani Next.js hiçbir `<link rel="icon">`
 * üretmiyordu ve tarayıcı varsayılana düşüyordu.
 *
 * ÜRETİLİYOR, İKİLİ DOSYA DEĞİL. Depoda `advetics-logo.png` var ama o bir
 * YAZI MARKASI (670×139) ve kareye sıkıştırılamıyor; ayrıca ikinci bir ikili
 * marka dosyası eklemek, `marka-logosu.spec.ts`in var olma sebebi olan
 * "iki kopya ayrışır" sorununu üçe çıkarırdı. Aynı desen `opengraph-image.tsx`
 * içinde zaten kullanılıyor.
 *
 * 32×32: tarayıcılar 16'ya küçültüyor ve 32'den küçültme, 16'da doğrudan
 * çizmekten daha temiz sonuç veriyor.
 */
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(markaIsareti(size.width), size);
}
