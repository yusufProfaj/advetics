import { redirect } from 'next/navigation';

/**
 * ESKİ ADRES. Reklam Oluştur, AI Asistan ve Toplu Oluştur kaldırıldı
 * (kullanıcı kararı 2026-10-07); reklam AdvCampaign'de (`/reklam`) kuruluyor.
 * Yer imleri ve eski alt yollar (`/basit`, `/uzman`, `/ai-asistan`) 404 vermesin diye yalnız yönlendiriyor;
 * workspace seçimi taşınıyor, yoksa kullanıcı seçici ekranına düşerdi.
 */
export default async function EskiReklamOlustur({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await searchParams;
  const musteri = Array.isArray(p.musteri) ? p.musteri[0] : p.musteri;
  redirect(musteri ? `/reklam?musteri=${encodeURIComponent(musteri)}` : '/reklam');
}
