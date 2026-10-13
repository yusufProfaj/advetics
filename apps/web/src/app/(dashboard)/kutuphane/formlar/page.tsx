import { redirect } from 'next/navigation';
import { eskiAdresYonu } from '@/lib/panel-adresleri';

/**
 * ESKİ VARLIK ADRESİ → Base › Varlıklar (docs/panel-sadelestirme/MIMARI.md
 * § 3). Silinmiyor, yönleniyor; süzgeç parametreleri (`tur`, `form`)
 * taşınıyor ve `tur=logo` logonun evine (Marka › Logo) gidiyor. Eşleme tek
 * yerde: `ESKI_ADRESLER`.
 */
export default async function Yonlendirme({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  redirect(eskiAdresYonu('kutuphane/formlar', { musteri: ilk(p.musteri), sorgu: { tur: ilk(p.tur), form: ilk(p.form) } }));
}

function ilk(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
