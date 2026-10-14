import type { MetadataRoute } from 'next';

import { SITE_SAYFALARI } from '@/components/landing/site-icerik';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'advetics.com';
  const origin = base.startsWith('localhost') ? `http://${base}` : `https://${base}`;
  const now = new Date();

  // Yalnızca oturum gerektirmeyen sayfalar. Panel indekslenmemeli.
  //
  // Tanıtım sitesinin sayfaları `SITE_SAYFALARI`ndan geliyor: menü, alt bilgi
  // ve site haritası aynı listeyi okuyor, yeni bir özellik sayfası haritaya
  // kendiliğinden giriyor. Yasal metinler ve giriş ekranı düşük öncelikle.
  return [
    ...SITE_SAYFALARI.map(({ yol, oncelik }) => ({ path: yol, priority: oncelik })),
    { path: '/login', priority: 0.3 },
    { path: '/gizlilik', priority: 0.3 },
    { path: '/kosullar', priority: 0.3 },
    { path: '/veri-silme', priority: 0.3 },
    { path: '/cerez-politikasi', priority: 0.3 },
  ].map(({ path, priority }) => ({
    url: `${origin}${path}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority,
  }));
}
