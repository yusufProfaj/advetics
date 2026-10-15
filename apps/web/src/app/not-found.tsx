import Link from 'next/link';
import { dugmeSinifi } from '@/components/ui/dugme';
import { sozluk } from '@/dil/sunucu';
import { kabukSozlugu } from '@/dil/sozlukler/kabuk';

/**
 * ═══ BULUNAMAYAN SAYFA — TÜRKÇE VE MARKALI ═══
 *
 * Next'in varsayılanı markasız İngilizce "404 This page could not be
 * found" yazıyordu (canlı denetim, `/ayarlar`). Beyaz etiketli panelde
 * müşteriye İngilizce bir hata sayfası göstermek ürünün dilini bozar.
 * Yalnız kılavuz renkleri; tek eylem Genel Bakış'a dönmek.
 */
export async function generateMetadata() {
  return { title: `${(await sozluk(kabukSozlugu)).hata.bulunamadi} · Advetics` };
}

export default async function BulunamadiSayfasi() {
  const d = (await sozluk(kabukSozlugu)).hata;
  return (
    <main className="grid min-h-screen place-items-center bg-white px-4 text-black">
      <div className="grid max-w-md justify-items-center gap-3 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/advetics-logo.png" alt="Advetics" className="max-h-10 max-w-[150px] object-contain" />
        <p className="m-0 font-baslik text-2xl font-bold">{d.bulunamadi}</p>
        <p className="m-0 text-sm text-[#302e2d]">{d.bulunamadiMetin}</p>
        <Link href="/dashboard" className={dugmeSinifi('birincil')}>
          {d.genelBakisaDon}
        </Link>
      </div>
    </main>
  );
}
