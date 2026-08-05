import Link from 'next/link';

/**
 * Yasal sayfalar için ayrı düzen.
 *
 * `(dashboard)` düzeninin ALTINDA DEĞİL — o düzen `requireSession()` çağırıyor
 * ve oturum yoksa /login'e yönlendiriyor. Meta App Review ve Google OAuth
 * Verification bu sayfaları kimliksiz crawler'larla ziyaret ediyor; oturum
 * kontrolüne takılırlarsa başvuru reddedilir.
 *
 * Marka renkleri de çekilmiyor: o çağrı da API oturumu gerektiriyor. Bu
 * sayfalar tamamen kendi kendine yeterli olmalı.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-surface-muted">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-white">
              A
            </span>
            <span className="text-sm font-semibold">Advetics</span>
          </Link>
          <nav className="flex gap-4 text-xs text-ink-muted">
            <Link href="/gizlilik" className="hover:text-ink">
              Gizlilik
            </Link>
            <Link href="/kosullar" className="hover:text-ink">
              Koşullar
            </Link>
            <Link href="/veri-silme" className="hover:text-ink">
              Veri Silme
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <article className="rounded-xl border border-line bg-surface p-6 sm:p-8">
          {children}
        </article>
      </main>

      <footer className="border-t border-line px-6 py-6 text-center text-xs text-ink-muted">
        Advetics · Meta ve Google Ads reklam yönetim platformu ·{' '}
        <a href="mailto:hello@profaj.com" className="underline">
          hello@profaj.com
        </a>
      </footer>
    </div>
  );
}
