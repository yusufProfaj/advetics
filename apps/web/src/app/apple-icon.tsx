import { ImageResponse } from 'next/og';
import { markaIsareti } from './marka-isareti';

/**
 * iOS ANA EKRAN İKONU.
 *
 * Ayrı bir dosya çünkü ölçü farklı ve Safari bu boyutu ayrı istiyor; işaretin
 * kendisi `markaIsareti()` ile ORTAK — iki ikon farklı görünseydi aynı ürün
 * iki marka gibi dururdu.
 *
 * 180×180 Apple'ın istediği en büyük ölçü; küçükleri ondan türetiliyor.
 */
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(markaIsareti(size.width), size);
}
