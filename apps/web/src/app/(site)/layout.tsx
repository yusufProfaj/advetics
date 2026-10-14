import type { ReactNode } from 'react';

import '@/components/landing/tanitim.css';
import { CerezBildirimi } from '@/components/landing/cerez-bildirimi';
import { SiteFooter } from '@/components/landing/site-footer';
import { SiteNav } from '@/components/landing/site-nav';

/**
 * Tanıtım sitesinin ortak düzeni (ana sayfa, özellikler, çözümler,
 * entegrasyonlar, fiyatlandırma, güvenlik, demo).
 *
 * Grup parantezi adrese girmiyor: `/`, `/ozellikler/...` olarak açılıyor.
 * Yasal sayfaların düzeni ayrı ((legal)/layout.tsx) ama AYNI üst çubuk, alt
 * bilgi ve çerez kartıyla: ziyaretçi alt bilgiden gizliliğe geçince başka
 * bir siteye düşmüş gibi olmasın.
 *
 * `tanitim` sınıfı renk belirteçlerini kılavuzun dört rengine sabitliyor
 * (globals.css) ve `tanitim.css`teki bütün seçiciler onun altında. Panelin
 * karanlık teması mavi-gri tonlar taşıyor; tanıtım sitesi markanın vitrini
 * ve orada kılavuz dışı ton olmamalı.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="tanitim min-h-screen">
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
      <CerezBildirimi />
    </div>
  );
}
