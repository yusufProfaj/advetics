import type { Metadata } from 'next';
import './globals.css';

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'advetics.com';
const ORIGIN = ROOT_DOMAIN.startsWith('localhost')
  ? `http://${ROOT_DOMAIN}`
  : `https://${ROOT_DOMAIN}`;

/**
 * Kök metadata.
 *
 * `metadataBase` OLMADAN Next.js göreli OG adreslerini mutlak hâle
 * getiremez ve `og:image` eksik kalır — Meta Sharing Debugger tam bunu
 * uyarıyordu ("should be explicitly provided"). Görsel
 * app/opengraph-image.tsx tarafından çalışma anında üretiliyor ve Next.js
 * buradaki openGraph bloğuna otomatik ekliyor.
 *
 * Modül 6'da rapor paylaşım sayfaları bu metadata'yı müşteri markasıyla
 * override edecek; kök değerler ajansın kendi tanıtımı için.
 */
export const metadata: Metadata = {
  metadataBase: new URL(ORIGIN),
  title: {
    default: 'Advetics — Reklam Otomasyon Paneli',
    template: '%s',
  },
  description:
    'Meta (Facebook, Instagram) ve Google Ads kampanyalarınızı tek panelden yönetin: ' +
    'birleşik raporlama, kural tabanlı otomasyon ve white-label raporlar.',
  applicationName: 'Advetics',
  openGraph: {
    type: 'website',
    siteName: 'Advetics',
    locale: 'tr_TR',
    url: ORIGIN,
    title: 'Advetics — Meta ve Google Ads tek panelde',
    description:
      'Birleşik raporlama, kural tabanlı otomasyon ve white-label raporlar. ' +
      'Meta ve Google Ads hesaplarınızı tek yerden yönetin.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Advetics — Meta ve Google Ads tek panelde',
    description:
      'Birleşik raporlama, kural tabanlı otomasyon ve white-label raporlar.',
  },
  // Panel oturum gerektiriyor; kök varsayılan olarak indekslenebilir kalıyor
  // ama korumalı yollar robots.ts içinde Disallow edildi.
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
