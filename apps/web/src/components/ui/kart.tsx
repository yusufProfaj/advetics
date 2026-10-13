import type { ReactNode } from 'react';

/**
 * ═══ TEK KART ═══
 *
 * Panelde yedi yerel `Kart` kopyası ve üç farklı kart yarıçapı (12, 14, 16)
 * vardı; gölgesi kimi ekranda katmanlı, kimi ekranda yoktu. Referans ("03 ·
 * Kart"): 16 piksel yarıçap, çizgi, GÖLGE YOK. Başlık satırı üstte çizgiyle
 * ayrılır, kartın TEK eylemi sağ altta (`altEylem`).
 *
 * KART İÇİNDE KIRMIZI DOLU DÜĞME YOK: sayfanın tek birincil eylemi başlığın
 * sağında. Kart eylemi bir bağlantı ya da küçük ikincil düğmedir
 * (`docs/marka/BILESENLER.md` "Yerleşim").
 */
export function Kart({
  baslik,
  baslikEki,
  eylem,
  altEylem,
  dolgu = true,
  as: Etiket = 'section',
  className = '',
  children,
  ...kalan
}: {
  /** Kart başlığı (15 piksel, Montserrat). Yoksa başlık satırı çizilmez. */
  baslik?: ReactNode;
  /** Başlığın sağındaki küçük gri bilgi: "2 / 2", tarih. */
  baslikEki?: ReactNode;
  /** Başlık satırının sağındaki küçük eylem (bölümlü seçici, "Sütunlar"). */
  eylem?: ReactNode;
  /** Kartın sağ altındaki TEK eylem: "Raporu aç →". */
  altEylem?: ReactNode;
  /** İç dolgu (20 piksel). Tablo taşıyan kartta `false`: tablo kenara dayanır. */
  dolgu?: boolean;
  as?: 'section' | 'div' | 'article' | 'aside';
  className?: string;
  children?: ReactNode;
  'aria-labelledby'?: string;
  id?: string;
}) {
  return (
    <Etiket className={`min-w-0 rounded-kart border border-line bg-surface ${className}`} {...kalan}>
      {(baslik || eylem || baslikEki) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-baseline gap-2">
            {baslik && <h3 className="font-baslik m-0 text-15 font-bold text-ink">{baslik}</h3>}
            {baslikEki && <small className="text-12 text-ink-muted">{baslikEki}</small>}
          </div>
          {eylem && <div className="flex items-center gap-2">{eylem}</div>}
        </div>
      )}
      {children !== undefined && <div className={dolgu ? 'p-5' : ''}>{children}</div>}
      {altEylem && <div className="flex justify-end border-t border-line px-5 py-3">{altEylem}</div>}
    </Etiket>
  );
}

/**
 * Kartın alt eylemi olarak kullanılan bağlantı sınıfı (referans `.bag`):
 * kalın siyah yazı, üzerine gelince kırmızı. Kart içinde kırmızı DOLU
 * düğme yerine bu.
 */
export const KART_BAGLANTISI =
  'text-13 font-bold text-ink no-underline transition-colors hover:text-brand-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand';
