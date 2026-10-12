import Link from 'next/link';

import { AdveticsLogo } from '@/components/advetics-logo';

import { COZUMLER, DEMO_EPOSTA, OZELLIKLER, UST_MENU, cozumAdresi, ozellikAdresi } from './site-icerik';

/**
 * Tanıtım sitesinin alt bilgisi.
 *
 * Üç yasal bağlantı burada olmak ZORUNDA. Meta App Review ve Google OAuth
 * doğrulaması bu adresleri kendi crawler'larıyla ziyaret ediyor ve
 * "gizlilik politikası herkese açık değil" gerekçesi başvuruyu tek başına
 * reddettiriyor. Adresler middleware'de de PUBLIC_PATHS içinde.
 *
 * Sütunlar menüyle AYNI listeden (site-icerik.ts): alt bilgide ayrı yazılan
 * bir liste, yeni özellik sayfası eklendiğinde unutuluyor.
 */
const YASAL = [
  { href: '/gizlilik', label: 'Gizlilik' },
  { href: '/kosullar', label: 'Kullanım Şartları' },
  { href: '/veri-silme', label: 'Veri Silme' },
];

const SUTUN_BASLIGI = 'text-xs font-bold uppercase tracking-[0.12em] text-ink';
const BAG = 'text-sm text-ink-muted motion-safe:transition-colors hover:text-ink';

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div>
          <AdveticsLogo />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-ink-muted">
            {'Meta, Google ve LinkedIn reklamlarınız tek panelde. Ne yapılacağını söyler, onayınızla yapar.'}
          </p>
          <a href={`mailto:${DEMO_EPOSTA}`} className={`mt-4 inline-block ${BAG}`}>
            {DEMO_EPOSTA}
          </a>
        </div>

        <div>
          <p className={SUTUN_BASLIGI}>Özellikler</p>
          <ul className="mt-4 space-y-2.5">
            {OZELLIKLER.map((o) => (
              <li key={o.slug}>
                <Link href={ozellikAdresi(o.slug)} className={BAG}>
                  {o.ad}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className={SUTUN_BASLIGI}>Çözümler</p>
          <ul className="mt-4 space-y-2.5">
            {COZUMLER.map((c) => (
              <li key={c.slug}>
                <Link href={cozumAdresi(c.slug)} className={BAG}>
                  {c.ad}
                </Link>
              </li>
            ))}
            {UST_MENU.map((m) => (
              <li key={m.href}>
                <Link href={m.href} className={BAG}>
                  {m.etiket}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className={SUTUN_BASLIGI}>Advetics</p>
          <ul className="mt-4 space-y-2.5">
            <li>
              <Link href="/demo" className={BAG}>
                Demo
              </Link>
            </li>
            <li>
              <Link href="/login" className={BAG}>
                Giriş Yap
              </Link>
            </li>
            {YASAL.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={BAG}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
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
