import { redirect } from 'next/navigation';
import { eskiAdresYonu } from '@/lib/panel-adresleri';
import { butceAdresi } from '@/lib/butce-adresi';

/**
 * ═══ ESKİ BİLGİ BANKASI → MARKA MERKEZİ › MARKA ═══
 *
 * Adres silinmiyor, yönleniyor: kayıtlı bağlantılar kırılmamalı. Eşleme
 * TEK YERDE (`ESKI_ADRESLER`, docs/panel-sadelestirme/MIMARI.md § 3).
 *
 * BÜTÇE SEKMESİ ÖNCE YAKALANIYOR: Aylık Bütçe'nin tek üreticisi panelde
 * (`butceAdresi`); eşlemeye ikinci bir bütçe yolu yazmak 2026-10-06'da
 * `ay` parametresini düşüren iki yönlendirmenin aynısı olurdu.
 */
export default async function BilgiBankasiYonlendirme({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const p = await searchParams;
  if (ilk(p.sekme) === 'butce') redirect(butceAdresi(ilk(p.musteri), { ay: ilk(p.ay) }));
  redirect(eskiAdresYonu('kutuphane/bilgi-bankasi', { musteri: ilk(p.musteri), sorgu: { sekme: ilk(p.sekme) } }));
}

function ilk(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
