import type { Metadata } from 'next';

import { ENTEGRASYON_GRUPLARI, YAKINDA_ENTEGRASYONLAR } from '@/components/landing/site-icerik';
import { Bolum, KapanisBandi, SayfaGirisi, YakindaRozeti } from '@/components/landing/site-parcalari';

/**
 * Entegrasyonlar. Platformların LOGOSU yok, ADI var: başka bir markanın
 * logosunu kullanmak onun kurallarına tabi ve elimizde onaylı bir dosya yok.
 *
 * Her satır o bağlantıyla BUGÜN ne yapıldığını söylüyor. "LinkedIn
 * destekleniyor" yazmak, LinkedIn'de reklam kurulabildiği izlenimini verirdi;
 * kurulamıyor, yalnız izleniyor. "Yakında" olanlar ayrı başlık altında.
 */
export const metadata: Metadata = {
  title: 'Entegrasyonlar | Advetics',
  description:
    'Advetics Meta (Facebook, Instagram), Google Ads, LinkedIn Ads ve YouTube ile çalışır; ' +
    'Meta Pixel, Google Tag Manager ve Google Analytics 4 kurulumunu kontrol eder.',
  alternates: { canonical: '/entegrasyonlar' },
};

export default function EntegrasyonlarSayfasi() {
  return (
    <>
      <SayfaGirisi
        ust="Entegrasyonlar"
        baslik="Reklam verdiğiniz yerlere bağlanır"
        ozet={
          'Advetics reklam hesaplarınıza platformların kendi izin ekranıyla bağlanır. ' +
          'Aşağıda her bağlantıyla bugün neler yapılabildiği yazıyor.'
        }
        ikincil={{ href: '/guvenlik', etiket: 'Güvenlik' }}
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
        baslik="Yakında"
        aciklama="Üzerinde çalıştığımız ama henüz panelde olmayan bağlantılar."
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
