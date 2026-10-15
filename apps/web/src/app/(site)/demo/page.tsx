import type { Metadata } from 'next';

import { sec } from '@advetics/shared';
import { dilAl } from '@/dil/sunucu';
import { siteArayuzSozlugu } from '@/dil/sozlukler/site-arayuz';
import { dilBaglantilari } from '@/lib/site-metadata';
import { DEMO_EPOSTA, siteIcerigi } from '@/components/landing/site-icerik';
import { AdimListesi, BIRINCIL, Bolum, SayfaGirisi } from '@/components/landing/site-parcalari';

/**
 * Demo talebi.
 *
 * FORM YOK, bilerek: form, sunucuya yeni bir uç ve gelen talebin nereye
 * yazılacağı kararı demek; bu iş o kapsamda değil. `mailto:` bugün çalışıyor
 * ve şablon gövdeyle geliyor (hangi bilgiye ihtiyacımız olduğu yazılı).
 * Adres sayfada düz metin olarak da duruyor: mail istemcisi kurulu olmayan
 * bilgisayarda bağlantı hiçbir şey açmıyor ve ziyaretçi bunu bilemiyor.
 */
export async function generateMetadata(): Promise<Metadata> {
  const dil = await dilAl();
  return {
    title: 'Demo | Advetics',
    description: sec(siteArayuzSozlugu, dil).demo.metaAciklama,
    alternates: dilBaglantilari('/demo', dil),
  };
}

export default async function DemoSayfasi() {
  const dil = await dilAl();
  const g = sec(siteArayuzSozlugu, dil);
  const d = g.demo;
  const { DEMO_MAILTO } = siteIcerigi(dil);
  return (
    <>
      <SayfaGirisi
        ust="Demo"
        baslik={d.baslik}
        ozet={d.ozet}
        ikincil={{ href: '/ozellikler', etiket: g.nav.ozellikler }}
      />

      <Bolum baslik={d.nasilIlerliyoruz} koyu>
        <AdimListesi adimlar={d.adimlar} />
      </Bolum>

      <Bolum baslik={d.bizeUlasin}>
        <div className="kart flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <p className="text-sm text-ink-muted">{d.eposta}</p>
            <p className="mt-1 font-baslik text-xl font-bold text-ink">{DEMO_EPOSTA}</p>
          </div>
          <a href={DEMO_MAILTO} className={BIRINCIL}>
            {g.ortak.demoTalep}
          </a>
        </div>
      </Bolum>
    </>
  );
}
