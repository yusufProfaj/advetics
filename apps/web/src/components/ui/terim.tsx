'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { TERIMLER, yonCumlesi, type TerimAnahtari } from '@/lib/terimler';

/**
 * ═══ TERİM: ADI GÖSTER, AÇIKLAMAYI İSTEYENE AÇ ═══
 *
 * Metrik açıklamaları panelde `title` özelliğindeydi. `title` fareyle
 * üstünde beklemeyi istiyor: dokunmatik ekranda HİÇ açılmıyor, klavyeyle
 * açılmıyor, ekran okuyucuların çoğu okumuyor. Yani açıklama, ona en çok
 * ihtiyacı olan kullanıcıya görünmüyordu.
 *
 * AÇIKLAMA BİR DÜĞMEYLE AÇILIYOR: tıklama, dokunma ve Enter aynı yoldan
 * geçiyor. Esc ve dışarı tıklama kapatıyor. Açıklama düğmeye
 * `aria-describedby` ile bağlı, yani ekran okuyucu onu kapalıyken de
 * okuyabiliyor.
 */
export function Terim({
  anahtar,
  kisaltmaGoster = true,
}: {
  anahtar: TerimAnahtari;
  /** Dar alanda (tablo başlığı) kısaltma rozeti gizlenebilir. */
  kisaltmaGoster?: boolean;
}) {
  const t = TERIMLER[anahtar];
  const [acik, setAcik] = useState(false);
  /*
   * SAĞDA YER YOKSA SOLA AÇILIYOR. Balon düğmenin solundan 16rem sağa
   * uzanıyor; satırın en sağındaki kartta (Genel Bakış'ta "Erişim") ekranın
   * kenarına dayanıyordu ve daha dar ekranda dışına taşardı. Karar açılış
   * anında düğmenin konumundan veriliyor.
   */
  const [sagaYasli, setSagaYasli] = useState(false);
  const kutu = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!acik) return;
    const disari = (e: PointerEvent) => {
      if (kutu.current && !kutu.current.contains(e.target as Node)) setAcik(false);
    };
    const tus = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAcik(false);
    };
    document.addEventListener('pointerdown', disari);
    document.addEventListener('keydown', tus);
    return () => {
      document.removeEventListener('pointerdown', disari);
      document.removeEventListener('keydown', tus);
    };
  }, [acik]);

  const yon = yonCumlesi(t);

  return (
    <span ref={kutu} className="relative inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate">{t.ad}</span>
      {kisaltmaGoster && t.kisaltma && (
        <span
          translate="no"
          className="rounded bg-surface-sunken px-1 py-px text-[11px] font-medium normal-case tracking-normal text-ink-muted"
        >
          {t.kisaltma}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setSagaYasli(r.left + 256 > window.innerWidth - 16);
          setAcik((v) => !v);
        }}
        aria-expanded={acik}
        aria-describedby={id}
        aria-label={`${t.ad} nedir?`}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-current text-[10px] font-semibold normal-case leading-none text-ink-muted/80 transition-colors hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        ?
      </button>
      <span
        id={id}
        role="tooltip"
        className={`absolute ${sagaYasli ? 'right-0' : 'left-0'} top-full z-30 mt-1.5 w-64 rounded-lg border border-line bg-surface p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-ink shadow-[var(--shadow-pop)] ${
          acik ? 'block' : 'sr-only'
        }`}
      >
        {t.aciklama}
        {yon && <span className="mt-1 block font-medium">{yon}</span>}
      </span>
    </span>
  );
}
