import type { Metadata } from 'next';

import { OZELLIKLER } from '@/components/landing/site-icerik';
import { Bolum, KapanisBandi, OzellikKartlari, SayfaGirisi } from '@/components/landing/site-parcalari';

/**
 * Özelliklerin özet sayfası. Menüdeki "Özellikler" buraya iniyor; açılır
 * menü yalnız fareyle ya da odakla açıldığı için telefondan gelen için de
 * bütün listeyi gösteren bir sayfa olmalı.
 */
export const metadata: Metadata = {
  title: 'Özellikler | Advetics',
  description:
    'Advetics ile reklam planlama, kurma, öne çıkarma, iyileştirme, raporlama ve ölçüm kurulumu. ' +
    'Her ekran reklam bilmeyen biri düşünülerek tasarlandı.',
  alternates: { canonical: '/ozellikler' },
};

export default function OzelliklerSayfasi() {
  return (
    <>
      <SayfaGirisi
        ust="Özellikler"
        baslik="Reklamın her adımı için bir ekran"
        ozet={
          `Advetics ${OZELLIKLER.length} ana parçadan oluşur. Hepsi aynı panelde ve ` +
          'hepsinde son söz sizin: hiçbir değişiklik onayınız olmadan yayına çıkmaz.'
        }
        ikincil={{ href: '/entegrasyonlar', etiket: 'Entegrasyonlar' }}
      />
      <Bolum baslik="Bütün özellikler" koyu>
        <OzellikKartlari />
      </Bolum>
      <KapanisBandi />
    </>
  );
}
