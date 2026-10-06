import { redirect } from 'next/navigation';
import { varlikYonu } from '@/components/marka-merkezi/bolumler';

/**
 * Marka Merkezi › Varlıklar içine taşındı (2026-10-06). Bu adres menüde hiç
 * görünmüyordu ve geri dönmenin yolu tarayıcının geri tuşuydu. Silinmiyor,
 * yönleniyor; süzgeç parametreleri (`tur`, `form`) taşınıyor.
 */
export default async function Yonlendirme({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  redirect(varlikYonu(ilk(p.musteri), 'formlar', { tur: ilk(p.tur), form: ilk(p.form) }));
}

function ilk(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
