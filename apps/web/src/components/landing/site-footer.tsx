import Link from 'next/link';

import { AdveticsLogo } from '@/components/advetics-logo';

import { COZUMLER, DEMO_EPOSTA, OZELLIKLER, UST_MENU, YASAL_BELGELER, cozumAdresi, ozellikAdresi } from './site-icerik';

/**
 * Tanıtım sitesinin ve yasal sayfaların alt bilgisi.
 *
 * Yasal bağlantılar burada olmak ZORUNDA. Meta App Review ve Google OAuth
 * doğrulaması bu adresleri kendi crawler'larıyla ziyaret ediyor ve
 * "gizlilik politikası herkese açık değil" gerekçesi başvuruyu tek başına
 * reddettiriyor. Adresler middleware'de de PUBLIC_PATHS içinde.
 *
 * Sütunlar menüyle AYNI listeden (site-icerik.ts): alt bilgide ayrı yazılan
 * bir liste, yeni özellik sayfası eklendiğinde unutuluyor.
 *
 * "Çerez tercihleri" `data-cerez-ac` taşıyan bir BAĞLANTI: çerez kartı
 * (`cerez-bildirimi.tsx`) tıklamayı yakalayıp kartı yeniden açıyor;
 * JavaScript yoksa politika sayfasına gidiyor. Alt bilgi sunucu bileşeni
 * olarak kalıyor.
 */
const SUTUN_BASLIGI = 'mont text-[13px] font-bold';
const BAG = 'text-[13.5px] text-ink-muted motion-safe:transition-colors hover:text-ink';

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      {/* `.kap` dolguyu kısa yazımla veriyor ve katmansız; dikey dolgu iç kutuda, yoksa eziliyordu. */}
      <div className="kap">
      <div className="grid gap-8 py-16 sm:grid-cols-2 md:grid-cols-[2fr_1fr_1fr_1fr_1fr]">
        <div>
          <AdveticsLogo />
          <p className="soluk mt-3 max-w-[280px] text-[13.5px] leading-relaxed">
            {'Meta, Google ve LinkedIn reklamları için tek panel. Profaj tarafından geliştirildi.'}
          </p>
          <a href={`mailto:${DEMO_EPOSTA}`} className={`mt-4 inline-block ${BAG}`}>
            {DEMO_EPOSTA}
          </a>
        </div>

        <div>
          <p className={SUTUN_BASLIGI}>Ürün</p>
          <ul className="mt-3 space-y-1.5">
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
          <ul className="mt-3 space-y-1.5">
            {COZUMLER.map((c) => (
              <li key={c.slug}>
                <Link href={cozumAdresi(c.slug)} className={BAG}>
                  {c.ad}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className={SUTUN_BASLIGI}>Advetics</p>
          <ul className="mt-3 space-y-1.5">
            {UST_MENU.map((m) => (
              <li key={m.href}>
                <Link href={m.href} className={BAG}>
                  {m.etiket}
                </Link>
              </li>
            ))}
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
          </ul>
        </div>

        <div>
          <p className={SUTUN_BASLIGI}>Yasal</p>
          <ul className="mt-3 space-y-1.5">
            {YASAL_BELGELER.map((y) => (
              <li key={y.href}>
                <Link href={y.href} className={BAG}>
                  {y.etiket}
                </Link>
              </li>
            ))}
            <li>
              <a href="/cerez-politikasi" data-cerez-ac className={BAG}>
                Çerez tercihleri
              </a>
            </li>
          </ul>
        </div>
      </div>
      </div>

      <div className="border-t border-line">
        <div className="kap">
          <div className="soluk flex flex-col gap-1 py-6 text-xs sm:flex-row sm:items-center sm:justify-between">
            <p>© 2026 Advetics. Tüm hakları saklıdır.</p>
            <p>Meta, Google Ads ve LinkedIn Ads reklam yönetim platformu</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
