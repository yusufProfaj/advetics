import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { sec } from '@advetics/shared';
import { dilAl } from '@/dil/sunucu';
import { siteArayuzSozlugu } from '@/dil/sozlukler/site-arayuz';
import { dilBaglantilari } from '@/lib/site-metadata';
import { OZELLIKLER, ozellikBul, siteIcerigi } from '@/components/landing/site-icerik';
import {
  AdimListesi,
  Bolum,
  KapanisBandi,
  MaddeIzgarasi,
  OzellikKartlari,
  SayfaGirisi,
  SinirKutusu,
} from '@/components/landing/site-parcalari';
import { OZELLIK_SAHNELERI } from '@/components/landing/simulasyon';

/**
 * Özellik sayfası. Sekiz sayfa TEK şablondan üretiliyor; içerik
 * `site-icerik.ts#OZELLIKLER`te. Sekiz ayrı dosya sekiz ayrı düzen demekti
 * ve sonradan eklenen bir bölüm yalnız birinde kalırdı.
 *
 * Girişte ana sayfadaki bölümün AYNI sahnesi oynuyor (`OZELLIK_SAHNELERI`):
 * ziyaretçi menüden ya da ana sayfadaki "Ayrıntılar"dan geldiğinde gördüğü
 * canlandırma değişmesin.
 *
 * `dynamicParams = false`: listede olmayan adres derlemede bilinen bir 404.
 * Sayfalar derlemede statik üretiliyor.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return OZELLIKLER.map((o) => ({ ozellik: o.slug }));
}

type Props = { params: Promise<{ ozellik: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const dil = await dilAl();
  // Menü etiketi (`o.ad`) sekme başlığında da: menüde ve sekmede aynı ad.
  const o = ozellikBul((await params).ozellik, dil);
  if (!o) return {};
  return {
    title: `${o.ad} | Advetics`,
    description: o.ozet,
    alternates: dilBaglantilari(`/ozellikler/${o.slug}`, dil),
  };
}

export default async function OzellikSayfasi({ params }: Props) {
  const dil = await dilAl();
  const g = sec(siteArayuzSozlugu, dil);
  const d = g.ozellik;
  const o = ozellikBul((await params).ozellik, dil);
  if (!o) notFound();

  const digerleri = siteIcerigi(dil).OZELLIKLER.filter((x) => x.slug !== o.slug)
    .slice(0, 4)
    .map((x) => x.slug);
  const yakindaVar = Boolean(o.yakinda && o.yakinda.length > 0);

  return (
    <>
      <SayfaGirisi
        ust={o.ad}
        baslik={o.baslik}
        ozet={o.ozet}
        ikincil={{ href: '/ozellikler', etiket: g.ortak.tumOzellikler }}
        Sahne={OZELLIK_SAHNELERI[o.slug]}
      />

      <Bolum baslik={d.neKazandirir} aciklama={d.panelAdi(o.panelAdi)}>
        <MaddeIzgarasi maddeler={o.faydalar} />
        {o.sinirlar && o.sinirlar.length > 0 && (
          <div className="mt-8">
            <SinirKutusu sinirlar={o.sinirlar} />
          </div>
        )}
      </Bolum>

      <Bolum baslik={d.nasilCalisir} koyu>
        <AdimListesi adimlar={o.adimlar} />
      </Bolum>

      {yakindaVar && o.yakinda && (
        <Bolum baslik={g.ortak.yakinda} aciklama={d.yakindaAciklama}>
          <MaddeIzgarasi maddeler={o.yakinda} yakinda />
        </Bolum>
      )}

      <Bolum baslik={d.digerleri} koyu={yakindaVar}>
        <OzellikKartlari sluglar={digerleri} />
      </Bolum>

      <KapanisBandi />
    </>
  );
}
