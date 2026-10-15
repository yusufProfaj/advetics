import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { sec } from '@advetics/shared';
import { dilAl } from '@/dil/sunucu';
import { siteArayuzSozlugu } from '@/dil/sozlukler/site-arayuz';
import { dilBaglantilari } from '@/lib/site-metadata';
import { yerelYol } from '@/lib/site-yollari';
import { COZUMLER, cozumAdresi, cozumBul, siteIcerigi } from '@/components/landing/site-icerik';
import {
  Bolum,
  KapanisBandi,
  MaddeIzgarasi,
  OzellikKartlari,
  SayfaGirisi,
} from '@/components/landing/site-parcalari';

/**
 * Çözüm sayfası: aynı ürün, üç farklı okur. Küçük işletme kendi reklamını,
 * şirket birden çok projesini ve ekibini, ajans müşterilerini düşünüyor.
 * Üçü tek şablondan, içerik `site-icerik.ts#COZUMLER`de.
 *
 * Senaryo açıkça "Örnek" diye başlıyor: gerçek bir müşteri hikâyesi değil.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return COZUMLER.map((c) => ({ cozum: c.slug }));
}

type Props = { params: Promise<{ cozum: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const dil = await dilAl();
  const c = cozumBul((await params).cozum, dil);
  if (!c) return {};
  return {
    title: `${c.ad} | Advetics`,
    description: c.ozet,
    alternates: dilBaglantilari(`/cozumler/${c.slug}`, dil),
  };
}

export default async function CozumSayfasi({ params }: Props) {
  const dil = await dilAl();
  const g = sec(siteArayuzSozlugu, dil);
  const c = cozumBul((await params).cozum, dil);
  if (!c) notFound();
  const diger = siteIcerigi(dil).COZUMLER.find((x) => x.slug !== c.slug);

  return (
    <>
      <SayfaGirisi
        ust={c.ad}
        baslik={c.baslik}
        ozet={c.ozet}
        ikincil={diger ? { href: cozumAdresi(diger.slug), etiket: diger.ad } : undefined}
      />

      <Bolum baslik={g.cozum.nedenAdvetics}>
        <MaddeIzgarasi maddeler={c.maddeler} />
      </Bolum>

      <Bolum
        baslik={c.senaryo.baslik}
        aciklama={g.cozum.ornekNotu}
        koyu
      >
        <ol className="adimlar gor">
          {c.senaryo.adimlar.map((a, i) => (
            <li key={a}>
              <span className="no">{i + 1}</span>
              <p>{a}</p>
            </li>
          ))}
        </ol>
      </Bolum>

      <Bolum baslik={g.cozum.enCok}>
        <OzellikKartlari sluglar={c.ozellikler} />
        <Link href={yerelYol('/ozellikler', dil)} className="bag">
          {g.ortak.tumOzelliklerOk}
        </Link>
      </Bolum>

      <KapanisBandi />
    </>
  );
}
