import type { Metadata } from 'next';

import { DEMO_MAILTO, FIYAT_SORULARI } from '@/components/landing/site-icerik';
import { BIRINCIL, Bolum, KapanisBandi, SayfaGirisi } from '@/components/landing/site-parcalari';

/**
 * Fiyatlandırma. RAKAM YOK, bilerek: fiyat listesi henüz belirlenmedi ve
 * sayfaya yazılan bir rakam müşteriye verilmiş bir söz olur.
 *
 * Sorular `<details>` ile açılıyor: istemci JavaScript'i yok, klavyeyle ve
 * ekran okuyucuyla kendiliğinden çalışıyor, içerik DOM'dan çıkmadığı için
 * arama motoru da okuyor.
 */
export const metadata: Metadata = {
  title: 'Fiyatlandırma | Advetics',
  description:
    'Advetics fiyatı yöneteceğiniz şirket ve hesap sayısına göre belirlenir. Reklam bütçeniz ' +
    'doğrudan platformlara ödenir. Teklif için demo talep edin.',
  alternates: { canonical: '/fiyatlandirma' },
};

const NELERE_BAKIYORUZ = [
  'Kaç şirketi ve kaç reklam hesabını yöneteceğiniz',
  'Ajans mı, kendi reklamını yöneten bir işletme mi olduğunuz',
  'Kurulumda ve sonrasında ne kadar destek istediğiniz',
];

export default function FiyatlandirmaSayfasi() {
  return (
    <>
      <SayfaGirisi
        ust="Fiyatlandırma"
        baslik="İhtiyacınıza göre teklif"
        ozet={
          'Her işletmenin ve ajansın ihtiyacı farklı. Kısa bir görüşmede ne yapmak ' +
          'istediğinizi dinleyip size uygun bir teklif hazırlıyoruz.'
        }
        ikincil={{ href: '/demo', etiket: 'Demo Nasıl İşler' }}
      />

      <Bolum baslik="Teklif neye göre hazırlanır">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <ul className="space-y-3">
            {NELERE_BAKIYORUZ.map((m) => (
              <li key={m} className="flex gap-3 text-base leading-relaxed text-ink">
                <span aria-hidden className="mt-2.5 h-2 w-2 shrink-0 rounded-[2px] bg-brand" />
                {m}
              </li>
            ))}
          </ul>
          <a href={DEMO_MAILTO} className={BIRINCIL}>
            Teklif İste
          </a>
        </div>
      </Bolum>

      <Bolum baslik="Sık sorulanlar" koyu>
        <div className="divide-y divide-line rounded-xl border border-line bg-surface">
          {FIYAT_SORULARI.map((s) => (
            <details key={s.baslik} className="group px-6 py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-baslik text-base font-bold text-ink [&::-webkit-details-marker]:hidden">
                {s.baslik}
                <span
                  aria-hidden
                  className="text-xl leading-none text-ink-muted motion-safe:transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-ink-muted">{s.metin}</p>
            </details>
          ))}
        </div>
      </Bolum>

      <KapanisBandi />
    </>
  );
}
