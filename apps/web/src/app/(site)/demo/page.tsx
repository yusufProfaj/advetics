import type { Metadata } from 'next';

import { DEMO_EPOSTA, DEMO_MAILTO } from '@/components/landing/site-icerik';
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
export const metadata: Metadata = {
  title: 'Demo | Advetics',
  description:
    'Advetics demosu için bize yazın. Kısa bir görüşmede hesaplarınızı bağlayıp kendi ' +
    'rakamlarınızla gösterelim.',
  alternates: { canonical: '/demo' },
};

const ADIMLAR = [
  {
    baslik: 'Bize yazın',
    metin: 'Şirketinizi ve reklam verdiğiniz yerleri kısaca anlatın. Şablon mailin içinde hazır.',
  },
  {
    baslik: 'Görüşme ayarlayalım',
    metin: 'Size uygun bir zamanda kısa bir görüşme yapıyoruz. Ne yapmak istediğinizi dinliyoruz.',
  },
  {
    baslik: 'Kendi rakamlarınızla görün',
    metin: 'İsterseniz hesaplarınızı birlikte bağlıyor, paneli kendi verinizle gösteriyoruz.',
  },
  {
    baslik: 'Teklif',
    metin: 'İhtiyacınıza göre hazırlanmış teklifi size gönderiyoruz.',
  },
];

export default function DemoSayfasi() {
  return (
    <>
      <SayfaGirisi
        ust="Demo"
        baslik="Kendi hesaplarınızla görün"
        ozet={
          'Ekran görüntüsü yerine kendi reklamlarınızı görmek daha çok şey anlatır. ' +
          'Bize yazın, kısa bir görüşmede gösterelim.'
        }
        ikincil={{ href: '/ozellikler', etiket: 'Özellikler' }}
      />

      <Bolum baslik="Nasıl ilerliyoruz" koyu>
        <AdimListesi adimlar={ADIMLAR} />
      </Bolum>

      <Bolum baslik="Bize ulaşın">
        <div className="flex flex-col gap-6 rounded-xl border border-line bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <p className="text-sm text-ink-muted">E-posta</p>
            <p className="mt-1 font-baslik text-xl font-bold text-ink">{DEMO_EPOSTA}</p>
          </div>
          <a href={DEMO_MAILTO} className={BIRINCIL}>
            Demo Talep Et
          </a>
        </div>
      </Bolum>
    </>
  );
}
