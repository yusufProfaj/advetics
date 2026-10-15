import type { Metadata } from 'next';

import { sec } from '@advetics/shared';
import { dilAl } from '@/dil/sunucu';
import { siteArayuzSozlugu } from '@/dil/sozlukler/site-arayuz';
import { dilBaglantilari } from '@/lib/site-metadata';
import { siteIcerigi } from '@/components/landing/site-icerik';
import { Bolum, KapanisBandi, OzellikKartlari, SayfaGirisi } from '@/components/landing/site-parcalari';

/**
 * Özelliklerin özet sayfası. Menüdeki "Özellikler" buraya iniyor; açılır
 * menü yalnız fareyle ya da odakla açıldığı için telefondan gelen için de
 * bütün listeyi gösteren bir sayfa olmalı.
 */
export async function generateMetadata(): Promise<Metadata> {
  const dil = await dilAl();
  const d = sec(siteArayuzSozlugu, dil).ozellikler;
  return { title: d.metaBaslik, description: d.metaAciklama, alternates: dilBaglantilari('/ozellikler', dil) };
}

export default async function OzelliklerSayfasi() {
  const dil = await dilAl();
  const d = sec(siteArayuzSozlugu, dil).ozellikler;
  const { OZELLIKLER, UST_MENU } = siteIcerigi(dil);
  // İkincil düğme etiketi menüdeki adla AYNI dizeden (site-icerik.spec.ts).
  const entegrasyon = UST_MENU.find((m) => m.href === '/entegrasyonlar')!;
  return (
    <>
      <SayfaGirisi
        ust={d.ust}
        baslik={d.baslik}
        ozet={d.ozet(OZELLIKLER.length)}
        ikincil={{ href: entegrasyon.href, etiket: entegrasyon.etiket }}
      />
      <Bolum baslik={d.tumu} koyu>
        <OzellikKartlari />
      </Bolum>
      <KapanisBandi />
    </>
  );
}
