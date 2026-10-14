import type { ReactNode } from 'react';

import '@/components/landing/tanitim.css';
import { CerezBildirimi } from '@/components/landing/cerez-bildirimi';
import { SiteFooter } from '@/components/landing/site-footer';
import { SiteNav } from '@/components/landing/site-nav';

/**
 * Yasal sayfalar için düzen (gizlilik, çerez, koşullar, veri silme).
 *
 * `(dashboard)` düzeninin ALTINDA DEĞİL — o düzen `requireSession()` çağırıyor
 * ve oturum yoksa /login'e yönlendiriyor. Meta App Review ve Google OAuth
 * Verification bu sayfaları kimliksiz crawler'larla ziyaret ediyor; oturum
 * kontrolüne takılırlarsa başvuru reddedilir.
 *
 * 2026-10-14: tanıtım sitesinin üst çubuğu ve alt bilgisiyle (onaylı taslak).
 * İkisi de SUNUCU bileşeni ve oturuma bakmıyor (`site-nav.tsx` yorumu):
 * metin crawler'a sunucudan HTML olarak gidiyor. Marka renkleri hâlâ
 * çekilmiyor: o çağrı API oturumu gerektiriyor ve bu sayfalar tamamen
 * kendi kendine yeterli olmalı.
 */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="tanitim min-h-screen">
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
      <CerezBildirimi />
    </div>
  );
}
