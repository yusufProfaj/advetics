import type { Metadata } from 'next';
import { Montserrat, Open_Sans } from 'next/font/google';
import './globals.css';
import { TEMA_BETIGI } from '@/lib/tema';
import { dilDurumu } from '@/dil/sunucu';
import { kokSozlugu } from '@/dil/sozlukler/kok';
import { sec } from '@advetics/shared';
import { DilSaglayici } from '@/dil/saglayici';
import { DilSecimEkrani } from '@/components/ui/dil-secimi';

/*
 * YAZI TİPİ GERÇEKTEN YÜKLENİYOR. `--brand-font` uzun süre 'Inter' diyordu
 * ama Inter hiçbir yerde yüklenmiyordu: yüklü olmayan makinede sistem
 * yazı tipine düşülüyor ve panel her bilgisayarda başka görünüyordu.
 * `next/font` dosyayı DERLEMEDE indirip kendi sunucumuzdan veriyor (çalışma
 * anında Google'a istek yok). `latin-ext` ZORUNLU: ğ, ş, ı, İ orada.
 */
/*
 * ═══ KURUMSAL KİMLİK: ANA BAŞLIK MONTSERRAT, GÖVDE OPEN SANS ═══
 *
 * Profaj kurumsal kullanım kılavuzu (2026-10-06): üst başlıklar ve
 * açıklamalar Open Sans, ana başlıklar Montserrat. Advetics'in görünüşü bu
 * kimlikten türüyor. Inter'den geçiş; değişkenler ayrı, çünkü beyaz etiketli
 * bir markanın kendi yazı tipi GÖVDEYİ değiştiriyor (`--brand-font`), başlık
 * yazı tipi ise ürünün imzası olarak kalıyor.
 */
const govde = Open_Sans({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  variable: '--font-govde',
});
const baslik = Montserrat({
  subsets: ['latin', 'latin-ext'],
  display: 'swap',
  weight: ['600', '700', '800'],
  variable: '--font-baslik',
});

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
/*
 * İKİ DİL: Open Graph ve açıklama sayfanın dilinde (`/en` sayfasının
 * paylaşım kartı Türkçe çıkmasın). Sayfalar kendi başlığını ezer; buradaki
 * değerler ezmeyenler için.
 */

export async function generateMetadata(): Promise<Metadata> {
  const m = sec(kokSozlugu, (await dilDurumu()).dil);
  return {
    metadataBase: new URL(ORIGIN),
    title: {
      default: m.baslik,
      template: '%s',
    },
    description: m.aciklama,
    applicationName: 'Advetics',
    openGraph: {
      type: 'website',
      siteName: 'Advetics',
      locale: m.yerel,
      alternateLocale: m.digerYerel,
      url: ORIGIN,
      title: m.ogBaslik,
      description: m.ogAciklama,
    },
    twitter: {
      card: 'summary_large_image',
      title: m.ogBaslik,
      description: m.ogAciklama,
    },
    // Panel oturum gerektiriyor; kök varsayılan olarak indekslenebilir kalıyor
    // ama korumalı yollar robots.ts içinde Disallow edildi.
    robots: { index: true, follow: true },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // DİL ÇEREZDEN (docs/i18n/MIMARI.md §2). `lang` ekran okuyucunun telaffuzu
  // ve tarayıcının çeviri önerisi için; sabit `tr` iken İngilizce sayfa
  // Türkçe okunuyordu.
  const { dil, dilSecildi, oneri } = await dilDurumu();
  return (
    /*
      TEMA İLK BOYAMADAN ÖNCE: kullanıcı kartındaki "Tema" seçimi
      `<html data-theme>` olarak saklanıyor (`components/tema.tsx`). Betik
      React'ten önce koştuğu için sunucunun bastığı `<html>` ile istemcinin
      gördüğü ayrışıyor; `suppressHydrationWarning` YALNIZ bu öğe için.
    */
    <html lang={dil} className={`${govde.variable} ${baslik.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_BETIGI }} />
      </head>
      <body>
        <DilSaglayici dil={dil}>
          {children}
          <DilSecimEkrani dilSecildi={dilSecildi} oneri={oneri} />
        </DilSaglayici>
      </body>
    </html>
  );
}
