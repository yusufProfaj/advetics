import type { Metadata } from 'next';

import { sec } from '@advetics/shared';
import { dilAl } from '@/dil/sunucu';
import { siteArayuzSozlugu } from '@/dil/sozlukler/site-arayuz';
import { dilBaglantilari } from '@/lib/site-metadata';
import { menuEtiketi, siteIcerigi } from '@/components/landing/site-icerik';
import { Bolum, KapanisBandi, SayfaGirisi, YakindaRozeti } from '@/components/landing/site-parcalari';

/**
 * Entegrasyonlar. Platformların LOGOSU yok, ADI var: başka bir markanın
 * logosunu kullanmak onun kurallarına tabi ve elimizde onaylı bir dosya yok.
 *
 * Her satır o bağlantıyla BUGÜN ne yapıldığını söylüyor. "LinkedIn
 * destekleniyor" yazmak, LinkedIn'de reklam kurulabildiği izlenimini verirdi;
 * kurulamıyor, yalnız izleniyor. "Yakında" olanlar ayrı başlık altında.
 */
export async function generateMetadata(): Promise<Metadata> {
  const dil = await dilAl();
  return {
    title: `${menuEtiketi(dil, '/entegrasyonlar')} | Advetics`,
    description: sec(siteArayuzSozlugu, dil).entegrasyonlar.metaAciklama,
    alternates: dilBaglantilari('/entegrasyonlar', dil),
  };
}

export default async function EntegrasyonlarSayfasi() {
  const dil = await dilAl();
  const g = sec(siteArayuzSozlugu, dil);
  const d = g.entegrasyonlar;
  const { ENTEGRASYON_GRUPLARI, YAKINDA_ENTEGRASYONLAR } = siteIcerigi(dil);
  return (
    <>
      <SayfaGirisi
        ust={menuEtiketi(dil, '/entegrasyonlar')}
        baslik={d.baslik}
        ozet={d.ozet}
        ikincil={{ href: '/guvenlik', etiket: menuEtiketi(dil, '/guvenlik') }}
      />

      {ENTEGRASYON_GRUPLARI.map((g, i) => (
        <Bolum key={g.baslik} baslik={g.baslik} aciklama={g.aciklama} koyu={i % 2 === 1}>
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {g.ogeler.map((o) => (
              <li key={o.ad} className="kart flex flex-col p-6">
                <h3 className="font-baslik text-lg font-bold text-ink">{o.ad}</h3>
                {o.alt && <p className="mt-1 text-xs font-semibold text-ink-muted">{o.alt}</p>}
                <p className="mt-3 text-sm leading-relaxed text-ink-muted">{o.ne}</p>
              </li>
            ))}
          </ul>
        </Bolum>
      ))}

      <Bolum
        baslik={g.ortak.yakinda}
        aciklama={d.yakindaAciklama}
        koyu={ENTEGRASYON_GRUPLARI.length % 2 === 1}
      >
        <ul className="flex flex-wrap gap-3">
          {YAKINDA_ENTEGRASYONLAR.map((ad) => (
            <li
              key={ad}
              className="kart flex items-center gap-3 px-4 py-2.5 text-sm font-semibold"
            >
              {ad}
              <YakindaRozeti />
            </li>
          ))}
        </ul>
      </Bolum>

      <KapanisBandi />
    </>
  );
}
