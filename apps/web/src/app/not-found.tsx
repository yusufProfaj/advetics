import Link from 'next/link';
import { dugmeSinifi } from '@/components/ui/dugme';

/**
 * ═══ BULUNAMAYAN SAYFA — TÜRKÇE VE MARKALI ═══
 *
 * Next'in varsayılanı markasız İngilizce "404 This page could not be
 * found" yazıyordu (canlı denetim, `/ayarlar`). Beyaz etiketli panelde
 * müşteriye İngilizce bir hata sayfası göstermek ürünün dilini bozar.
 * Yalnız kılavuz renkleri; tek eylem Genel Bakış'a dönmek.
 */
export const metadata = { title: 'Sayfa bulunamadı · Advetics' };

export default function BulunamadiSayfasi() {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-4 text-black">
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/advetics-logo.png" alt="Advetics" className="max-h-10 max-w-[150px] object-contain" />
        <p className="m-0 font-baslik text-2xl font-bold">Sayfa bulunamadı</p>
        <p className="m-0 text-sm text-[#302e2d]">Adres yanlış yazılmış ya da sayfa taşınmış olabilir.</p>
        <Link href="/dashboard" className={dugmeSinifi('birincil')}>
          Genel Bakış’a dön
        </Link>
      </div>
    </main>
  );
}
