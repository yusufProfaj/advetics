import type { MetadataRoute } from 'next';

import { SITE_SAYFALARI } from '@/components/landing/site-icerik';
import { ingilizceYolu } from '@/lib/site-yollari';

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
  ].flatMap(({ path, priority }) => {
    // İKİ DİL (Ç2): İngilizce eşi olan her sayfa haritada İKİ adresle ve
    // birbirine `alternates` ile bağlı. Giriş ekranının eşi yok (öneksiz,
    // dil çerezde), tek kayıt kalıyor.
    const en = ingilizceYolu(path);
    const diller = en ? { languages: { tr: `${origin}${path}`, en: `${origin}${en}` } } : undefined;
    const kayit = (yol: string) => ({
      url: `${origin}${yol}`,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority,
      ...(diller ? { alternates: diller } : {}),
    });
    return en ? [kayit(path), kayit(en)] : [kayit(path)];
  });
}
