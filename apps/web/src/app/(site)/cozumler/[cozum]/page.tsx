import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { COZUMLER, cozumAdresi, cozumBul } from '@/components/landing/site-icerik';
import {
  Bolum,
  KapanisBandi,
  MaddeIzgarasi,
  OzellikKartlari,
  SayfaGirisi,
} from '@/components/landing/site-parcalari';

/**
 * Çözüm sayfası: aynı ürün, iki farklı okur. Ajans çok müşteriyi ve ekibini
 * düşünüyor, işletme sahibi kendi reklamını. İkisi tek şablondan, içerik
 * `site-icerik.ts#COZUMLER`de.
 *
 * Senaryo açıkça "Örnek" diye başlıyor: gerçek bir müşteri hikâyesi değil.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return COZUMLER.map((c) => ({ cozum: c.slug }));
}

type Props = { params: Promise<{ cozum: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const c = cozumBul((await params).cozum);
  if (!c) return {};
  return {
    title: `${c.ad} | Advetics`,
    description: c.ozet,
    alternates: { canonical: cozumAdresi(c.slug) },
  };
}

export default async function CozumSayfasi({ params }: Props) {
  const c = cozumBul((await params).cozum);
  if (!c) notFound();
  const diger = COZUMLER.find((x) => x.slug !== c.slug);

  return (
    <>
      <SayfaGirisi
        ust={c.ad}
        baslik={c.baslik}
        ozet={c.ozet}
        ikincil={diger ? { href: cozumAdresi(diger.slug), etiket: diger.ad } : undefined}
      />

      <Bolum baslik="Neden Advetics">
        <MaddeIzgarasi maddeler={c.maddeler} />
      </Bolum>

      <Bolum
        baslik={c.senaryo.baslik}
        aciklama="Bu bir örnek senaryodur, gerçek bir müşteri hikâyesi değildir."
        koyu
      >
        <ol className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {c.senaryo.adimlar.map((a, i) => (
            <li key={a} className="rounded-xl border border-line bg-surface p-6">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand font-baslik text-sm font-extrabold text-white">
                {i + 1}
              </span>
              <p className="mt-4 text-sm leading-relaxed text-ink">{a}</p>
            </li>
          ))}
        </ol>
      </Bolum>

      <Bolum baslik="En çok kullanacağınız özellikler">
        <OzellikKartlari sluglar={c.ozellikler} />
        <Link
          href="/ozellikler"
          className="mt-8 inline-block text-sm font-semibold text-ink underline decoration-brand decoration-2 underline-offset-4"
        >
          Bütün Özellikler
        </Link>
      </Bolum>

      <KapanisBandi />
    </>
  );
}
