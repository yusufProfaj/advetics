import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/landing/site-footer';
import { SiteNav } from '@/components/landing/site-nav';

/**
 * Tanıtım sitesinin ortak düzeni (ana sayfa, özellikler, çözümler,
 * entegrasyonlar, fiyatlandırma, güvenlik, demo).
 *
 * Grup parantezi adrese girmiyor: `/`, `/ozellikler/...` olarak açılıyor.
 * Yasal sayfalar bu grubun DIŞINDA kaldı: onların kendi düzeni Meta App
 * Review için sade tutuluyor ((legal)/layout.tsx).
 *
 * `tanitim` sınıfı renk belirteçlerini kılavuzun dört rengine sabitliyor
 * (globals.css). Panelin karanlık teması mavi-gri tonlar taşıyor; tanıtım
 * sitesi markanın vitrini ve orada kılavuz dışı ton olmamalı.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="tanitim min-h-screen bg-surface text-ink">
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
