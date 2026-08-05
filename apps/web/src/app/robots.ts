import type { MetadataRoute } from 'next';

/**
 * robots.txt
 *
 * Sharing Debugger 403 döndürüp "robots.txt engeli olabilir" uyarısı verdi.
 * Açık bir robots.txt olmadan Meta ve Google crawler'larının davranışı
 * tahmine kalıyor; App Review gizlilik politikasını okuyamadığı için
 * reddedilebilir.
 *
 * Panel sayfaları taranmasın (oturum gerektiriyor, indekslenmesi anlamsız),
 * yasal sayfalar ve rapor paylaşım linkleri taranabilsin.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'advetics.com';
  const origin = base.startsWith('localhost') ? `http://${base}` : `https://${base}`;

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/gizlilik', '/kosullar', '/veri-silme'],
        disallow: ['/dashboard', '/ayarlar/', '/api/'],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
  };
}
