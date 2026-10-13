import { redirect } from 'next/navigation';
import { eskiAdresYonu } from '@/lib/panel-adresleri';

/**
 * ESKİ HESABIM — Ayarlar › Hesabım. `?kurtarma=1` TAŞINIYOR: kurtarma
 * koduyla giren kişiye yeni kod üretmesi söyleniyor ve parametre düşerse
 * uyarı hiç görünmez.
 */
export default async function EskiHesabimSayfasi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  const kurtarma = Array.isArray(p.kurtarma) ? p.kurtarma[0] : p.kurtarma;
  redirect(eskiAdresYonu('hesabim', { sorgu: { kurtarma } }));
}
