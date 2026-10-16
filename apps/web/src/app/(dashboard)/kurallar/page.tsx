import { redirect } from 'next/navigation';
import { sec } from '@advetics/shared';
import { iyilestirKurallarAdresi } from '@/lib/iyilestir';
import { dilAl } from '@/dil/sunucu';
import { kurallarSozlugu } from '@/dil/sozlukler/kurallar';

/** Başlık istek anında: dil çerezden okunuyor (CEVIRI-REHBERI §2). */
export async function generateMetadata() {
  return { title: `${sec(kurallarSozlugu, await dilAl()).sayfaBasligi} · Advetics` };
}
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
