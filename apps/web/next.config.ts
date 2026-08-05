import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import type { NextConfig } from 'next';

/**
 * Monorepo kökündeki tek .env dosyasını yükler.
 *
 * Next.js varsayılan olarak yalnızca KENDİ dizinindeki .env dosyalarını okur.
 * API ile aynı dosyadan beslenmezse iki ayrı env dosyası tutmak gerekir ve
 * bunlar er ya da geç ayrışır.
 *
 * Kritik: `NEXT_PUBLIC_*` değişkenleri BUILD ANINDA koda gömülür. Üretimde
 * `pnpm build` çalıştırılmadan önce sunucudaki .env dosyasının doğru
 * NEXT_PUBLIC_API_URL değerini içermesi zorunludur — sonradan pm2 restart
 * etmek bu değeri değiştirmez.
 */
loadEnv({ path: resolve(__dirname, '../../.env') });

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Monorepo'daki paylaşılan paket derlenmiş CJS olarak gelir; Next'in
  // kendi derleyicisinden geçmesi kaynak haritalarını doğru tutar.
  transpilePackages: ['@advetics/shared'],

  experimental: {
    // White-label custom domain'ler için middleware'in host başlığını
    // güvenilir şekilde okuması gerekiyor.
    optimizePackageImports: ['@advetics/shared'],
  },

  /**
   * `/api/*` için YEDEK yönlendirme.
   *
   * Üretimde iki katman da bu yolu taşıyabilir:
   *
   *   1. Nginx `location /api/` bloğu → doğrudan NestJS'e gider (TERCİH EDİLEN).
   *      İstek Next.js'e hiç ulaşmaz, buradaki rewrite devreye girmez.
   *
   *   2. Nginx'te böyle bir blok yoksa — yani CloudPanel'in ürettiği varsayılan
   *      vhost hiç düzenlenmemişse — her şey Next.js'e düşer ve bu rewrite
   *      isteği NestJS'e iletir.
   *
   * Sonuç: uygulama CloudPanel'in varsayılan Node.js site yapılandırmasıyla
   * KUTUDAN ÇIKTIĞI GİBİ çalışır; Nginx bloğu eklemek yalnızca bir ek atlamayı
   * ortadan kaldıran optimizasyondur. İkisi birden yapılandırılmış olması
   * sorun değil — hangisi isteği önce görürse o işler.
   *
   * Not: Next.js'in `/app/api` dizini KULLANILMIYOR; bu yolda çakışma yok.
   */
  async rewrites() {
    const internalApi = process.env.INTERNAL_API_URL;
    if (!internalApi) return [];

    return {
      beforeFiles: [
        {
          source: '/api/:path*',
          destination: `${internalApi.replace(/\/$/, '')}/:path*`,
        },
      ],
      afterFiles: [],
      fallback: [],
    };
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
