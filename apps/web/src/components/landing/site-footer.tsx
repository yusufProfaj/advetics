import Link from 'next/link';

/**
 * Tanıtım sayfasının alt bilgisi.
 *
 * Üç yasal bağlantı burada olmak ZORUNDA. Meta App Review ve Google OAuth
 * doğrulaması bu adresleri kendi crawler'larıyla ziyaret ediyor ve
 * "gizlilik politikası herkese açık değil" gerekçesi başvuruyu tek başına
 * reddettiriyor. Adresler middleware'de de PUBLIC_PATHS içinde.
 */
const LEGAL = [
  { href: '/gizlilik', label: 'Gizlilik' },
  { href: '/kosullar', label: 'Kullanım Şartları' },
  { href: '/veri-silme', label: 'Veri Silme' },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white"
          >
            A
          </span>
          <span className="text-base font-bold tracking-tight text-ink">Advetics</span>
        </div>

        <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {LEGAL.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="text-sm text-ink-muted transition-colors hover:text-ink"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© 2026 Advetics. Tüm hakları saklıdır.</p>
          <p>Profaj tarafından geliştirildi</p>
        </div>
      </div>
    </footer>
  );
}
