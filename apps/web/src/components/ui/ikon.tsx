/**
 * Kabuk ve açılır menü ikonları — `docs/marka/menu-sistemi.html` sembolleri.
 * 24×24, çizgi; renk `currentColor`. Dış ikon paketi yok: on beş ikon için
 * yüzlerce ikonluk bir paket panelin her sayfasına binerdi.
 */
const YOLLAR = {
  arti: 'M12 5v14M5 12h14',
  roket: 'M5 15c-1 1-2 4-2 6 2 0 5-1 6-2M14 4c3-1 6-1 6-1s0 3-1 6l-6 6-5-5z M15 9h.01',
  hedef: 'M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16zM12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8z',
  resim: 'M3 4h18v16H3zM9 8a2 2 0 1 0 0 4 2 2 0 1 0 0-4zM21 16l-5-5-9 9',
  kural: 'M4 6h10M4 12h16M4 18h7M18 4a2 2 0 1 0 0 4 2 2 0 1 0 0-4zM15 16a2 2 0 1 0 0 4 2 2 0 1 0 0-4z',
  rapor: 'M7 3h7l5 5v13H7z M14 3v5h5 M10 13h6 M10 17h6',
  kisi: 'M12 4a4 4 0 1 0 0 8 4 4 0 1 0 0-8zM4 21c1-4 4-6 8-6s7 2 8 6',
  kalkan: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z',
  tema: 'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z',
  cikis: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  zil: 'M6 16V11a6 6 0 0 1 12 0v5l2 2H4z M10 21h4',
  soru: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 17h.01',
  yenile: 'M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5',
  ara: 'M11 5a6 6 0 1 0 0 12 6 6 0 1 0 0-12zM20 20l-4.5-4.5',
  asagi: 'M7 10l5 5 5-5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  nokta3: 'M5 12h.01M12 12h.01M19 12h.01',
  tablo: 'M3 4h18v16H3zM3 10h18M9 10v10',
  tik: 'M5 12l5 5 9-10',
} as const;

export type IkonAdi = keyof typeof YOLLAR;

export function Ikon({ ad, className = 'h-[18px] w-[18px]' }: { ad: IkonAdi; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={ad === 'nokta3' ? 3 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={YOLLAR[ad]} />
    </svg>
  );
}
