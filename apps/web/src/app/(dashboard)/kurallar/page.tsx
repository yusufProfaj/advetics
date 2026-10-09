import { redirect } from 'next/navigation';
import { iyilestirKurallarAdresi } from '@/lib/iyilestir';

export const metadata = { title: 'Kurallar · Advetics' };
export const dynamic = 'force-dynamic';

/**
 * ESKİ ADRES — Kurallar İyileştir'in üçüncü sekmesi oldu (2026-10-09,
 * Aşama 4). Yer imleri, bildirim bağlantıları ve kapsam değişiminde
 * korunan yol (`kapsam-hedefi.ts`) buraya gelebiliyor; kırılmasın diye
 * yönleniyor. `musteri` ve `kural` taşınıyor: açık geçmişi ya da adresle
 * seçilmiş workspace'i düşürmek, kullanıcıyı başka bir ekrana bırakırdı.
 */
export default async function KurallarYonlendirme({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(iyilestirKurallarAdresi(await searchParams));
}
