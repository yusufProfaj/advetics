import { redirect } from 'next/navigation';
import { baglanti } from '@/lib/baglanti';

/**
 * ESKİ ADRES. AdvCampaign 2026-10-10'dan beri altı adımlı rehber (`/reklam`);
 * eski Acemi akışı (`/reklam/yeni`) ve sohbetin önizleme/onay ekranı
 * (`/reklam/onizleme`) kaldırıldı. Yer imleri 404 vermesin diye yalnız
 * yönlendiriyor; workspace seçimi taşınıyor, yoksa kullanıcı seçici ekranına
 * düşerdi. Eski `?taslak=` kimliği rehber kimliği DEĞİL, taşınmıyor.
 */
export default async function EskiReklamAdresi({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  const musteri = Array.isArray(p.musteri) ? p.musteri[0] : p.musteri;
  redirect(baglanti('/reklam', { musteri }));
}
