import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { OZELLIKLER, ozellikAdresi, ozellikBul } from '@/components/landing/site-icerik';
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
  const o = ozellikBul((await params).ozellik);
  if (!o) return {};
  // Menü etiketi (`o.ad`) sekme başlığında da: menüde ve sekmede aynı ad.
  return {
    title: `${o.ad} | Advetics`,
    description: o.ozet,
    alternates: { canonical: ozellikAdresi(o.slug) },
  };
}

export default async function OzellikSayfasi({ params }: Props) {
  const o = ozellikBul((await params).ozellik);
  if (!o) notFound();

  const digerleri = OZELLIKLER.filter((x) => x.slug !== o.slug)
    .slice(0, 4)
    .map((x) => x.slug);
  const yakindaVar = Boolean(o.yakinda && o.yakinda.length > 0);

  return (
    <>
      <SayfaGirisi
        ust={o.ad}
        baslik={o.baslik}
        ozet={o.ozet}
        ikincil={{ href: '/ozellikler', etiket: 'Bütün Özellikler' }}
        Sahne={OZELLIK_SAHNELERI[o.slug]}
      />

      <Bolum baslik="Size ne kazandırır" aciklama={`Paneldeki adı: ${o.panelAdi}.`}>
        <MaddeIzgarasi maddeler={o.faydalar} />
        {o.sinirlar && o.sinirlar.length > 0 && (
          <div className="mt-8">
            <SinirKutusu sinirlar={o.sinirlar} />
          </div>
        )}
      </Bolum>

      <Bolum baslik="Nasıl çalışır" koyu>
        <AdimListesi adimlar={o.adimlar} />
      </Bolum>

      {yakindaVar && o.yakinda && (
        <Bolum baslik="Yakında" aciklama="Üzerinde çalıştığımız ama henüz panelde olmayan parçalar.">
          <MaddeIzgarasi maddeler={o.yakinda} yakinda />
        </Bolum>
      )}

      <Bolum baslik="Diğer özellikler" koyu={yakindaVar}>
        <OzellikKartlari sluglar={digerleri} />
      </Bolum>

      <KapanisBandi />
    </>
  );
}
