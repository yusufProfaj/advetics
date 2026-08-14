import Link from 'next/link';

/**
 * Tanıtım sayfasının üst çubuğu.
 *
 * "Giriş Yap" HER ZAMAN /login'e gidiyor; oturum çerezine BAKILMIYOR.
 * Bakmak mümkündü ("Panele Git" yazdırırdık) ama `cookies()` okumak sayfayı
 * statik render'dan çıkarıyor ve burası tanıtım sayfası — ilk boyama hızı
 * doğrudan SEO. Oturumu olan kullanıcı yine de kaybolmuyor: middleware
 * oturumlu bir /login isteğini /dashboard'a çeviriyor (middleware.ts).
 */
const LINKS = [
  { href: '#nasil-calisir', label: 'Nasıl Çalışır' },
  { href: '#avantajlar', label: 'Avantajlar' },
  { href: '#ajanslar', label: 'Ajanslar' },
  { href: '#raporlama', label: 'Raporlama' },
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-surface/85 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand text-base font-bold text-white"
          >
            A
          </span>
          <span className="text-lg font-bold tracking-tight text-ink">Advetics</span>
        </Link>

        {/*
          Orta bağlantılar mobilde gizli. Hamburger menüsü eklemek bu sayfaya
          JavaScript sokmak demekti; tek sayfalık bir tanıtımda aşağı kaydırmak
          zaten aynı yere götürüyor.
        */}
        <ul className="hidden items-center gap-7 md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-sm font-medium text-ink-muted transition-colors hover:text-ink"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        <Link
          href="/login"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
        >
          Giriş Yap
        </Link>
      </nav>
    </header>
  );
}
