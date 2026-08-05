import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'advetics.com';
  const origin = base.startsWith('localhost') ? `http://${base}` : `https://${base}`;
  const now = new Date();

  // Yalnızca oturum gerektirmeyen sayfalar. Panel indekslenmemeli.
  return ['/login', '/gizlilik', '/kosullar', '/veri-silme'].map((path) => ({
    url: `${origin}${path}`,
    lastModified: now,
    changeFrequency: 'monthly' as const,
  }));
}
