import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'advetics.com';
  const origin = base.startsWith('localhost') ? `http://${base}` : `https://${base}`;
  const now = new Date();

  // Yalnızca oturum gerektirmeyen sayfalar. Panel indekslenmemeli.
  //
  // Kök `/` tanıtım sayfası ve sitenin indekslenmesi gereken TEK asıl sayfası;
  // diğerleri yasal metinler ve giriş ekranı. Öncelik farkı bunu söylüyor.
  return [
    { path: '/', priority: 1 },
    { path: '/login', priority: 0.3 },
    { path: '/gizlilik', priority: 0.3 },
    { path: '/kosullar', priority: 0.3 },
    { path: '/veri-silme', priority: 0.3 },
  ].map(({ path, priority }) => ({
    url: `${origin}${path}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
    priority,
  }));
}
