import { redirect } from 'next/navigation';
import { mmAdresi } from '@/components/marka-merkezi/bolumler';

/**
 * Aylık Bütçe, Marka Merkezi'nin bir bölümü oldu (2026-10-06, kullanıcı:
 * "aylık bütçeyi de Base'e al"). Adres silinmiyor, yönleniyor; seçili ay
 * (`ay`) taşınıyor.
 */
export default async function ButceYonlendirme({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  redirect(mmAdresi(ilk(p.musteri), 'butce', { ay: ilk(p.ay) }));
}

function ilk(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
