import type { RehberAmacKodu } from '@advetics/shared';

/**
 * Taslaktaki çizgi ikonlar (`rehber-taslak.html`, `AMACLAR[].ikon`), aynı
 * yollarla. Ayrı bir ikon kütüphanesi bu ekranda taslaktan farklı çizgi
 * kalınlığı ve köşe getirirdi.
 */
export function Ikon({ d, className, boyut }: { d: React.ReactNode; className?: string; boyut?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      width={boyut}
      height={boyut}
      aria-hidden
    >
      {d}
    </svg>
  );
}

export const AMAC_IKONU: Record<RehberAmacKodu, React.ReactNode> = {
  SITE: <path d="M4 12h12M12 6l6 6-6 6" />,
  FORM: (
    <>
      <rect x="5" y="4" width="14" height="16" rx="2" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </>
  ),
  WHATSAPP: <path d="M5 19l1.5-4A7 7 0 1112 19a7 7 0 01-3.5-.9z" />,
  TELEFON: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a1 1 0 01-1 1A16 16 0 014 5a1 1 0 011-1z" />,
  VIDEO: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="3" />
      <path d="M10 9.5v5l4-2.5z" />
    </>
  ),
  ERISIM: (
    <>
      <circle cx="12" cy="11" r="3" />
      <path d="M12 21s-7-6-7-11a7 7 0 0114 0c0 5-7 11-7 11z" />
    </>
  ),
  SATIS: (
    <>
      <path d="M5 7h14l-1.5 9h-11z" />
      <circle cx="9" cy="20" r="1" />
      <circle cx="16" cy="20" r="1" />
      <path d="M8 7l1-3h6l1 3" />
    </>
  ),
};

export const IKON = {
  tik: <path d="M5 12l5 5L20 7" />,
  kapat: <path d="M6 6l12 12M18 6L6 18" />,
  bilgi: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8h.01M11 12h1v4h1" />
    </>
  ),
  eksik: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4M12 16h.01" />
    </>
  ),
  yok: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 8l8 8" />
    </>
  ),
  ucgen: (
    <>
      <path d="M12 3l9 16H3z" />
      <path d="M12 10v4M12 17h.01" />
    </>
  ),
  yukle: (
    <>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" />
    </>
  ),
  meta: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M17 7h.01" />
    </>
  ),
  google: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="M20 20l-4.5-4.5" />
    </>
  ),
  asagi: <path d="M6 9l6 6 6-6" />,
} as const;
