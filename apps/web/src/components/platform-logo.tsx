import type { ChannelKind } from '@advetics/shared';

/**
 * PLATFORM MARKALARI — SVG, raster DEĞİL.
 *
 * Logolar PNG olarak gömülebilirdi ama üç sebeple çizildi: her boyutta net
 * kalıyor (rozet 16px, kart başlığı 36px), ek bir ağ isteği ve varlık hattı
 * gerektirmiyor, ve deponun mevcut ikon deseniyle aynı (bkz. `nav.tsx` —
 * "dış bağımlılık eklemeden tutarlı bir set").
 *
 * MARKA KULLANIMI: bu işaretler ürünü TANIMLAMAK için kullanılıyor — hangi
 * hesabın hangi platforma ait olduğunu göstermek. Advetics'in kendi markası
 * gibi sunulmuyor, bir onay ya da ortaklık iması taşımıyor.
 *
 * ÇİZİMLER SADELEŞTİRİLMİŞ. Resmî işaretlerin tanınabilir biçimleri; piksel
 * birebir kopyaları değil. 16-36px arasında fark görünmüyor ve bu boyutlarda
 * tanınırlık, birebir doğruluktan daha önemli. Marka kılavuzuna birebir uyum
 * gerekirse resmî SVG'ler indirilip buradaki `path`ler değiştirilmeli —
 * kullanım yerleri değişmez.
 */
export function PlatformLogo({
  kind,
  className = 'h-5 w-5',
}: {
  kind: ChannelKind;
  className?: string;
}) {
  const ortak = { className, viewBox: '0 0 24 24', 'aria-hidden': true as const };

  switch (kind) {
    case 'meta_ads':
      // Meta — sonsuzluk döngüsü.
      return (
        <svg {...ortak} fill="none">
          <path
            d="M2.5 14.2c0-3.6 1.8-7.4 4.3-7.4 1.4 0 2.5 1 3.9 3.1.9 1.4 1.6 2.6 1.6 2.6s.9-1.5 1.9-3c1.3-1.9 2.4-2.7 3.8-2.7 2.7 0 4.5 3.9 4.5 7.3 0 2.4-1.2 3.9-3.1 3.9-1.6 0-2.7-.9-4.1-3.2-.6-1-1.3-2.2-1.9-3.3-.7 1.2-1.4 2.4-2 3.4-1.4 2.2-2.5 3.1-4.1 3.1-2 0-3.8-1.5-3.8-3.8Z"
            stroke="#0082FB"
            strokeWidth="2.1"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'google_ads':
      // Google Ads — sarı ve mavi çubuklar, yeşil daire.
      return (
        <svg {...ortak}>
          <path d="M9.1 3.6 4.2 15.2l3.9 2.2 4.9-11.6-3.9-2.2Z" fill="#FBBC04" />
          <path
            d="M14.9 3.6c-.9-1.5-2.7-2-4.1-1.1-1.4.9-1.8 2.7-1 4.2l4.9 11.6c.9 1.5 2.7 2 4.1 1.1 1.4-.9 1.8-2.7 1-4.2L14.9 3.6Z"
            fill="#4285F4"
          />
          <circle cx="6.1" cy="18.4" r="3" fill="#34A853" />
        </svg>
      );

    case 'facebook':
      // Facebook — mavi daire, beyaz f.
      return (
        <svg {...ortak}>
          <circle cx="12" cy="12" r="10" fill="#0866FF" />
          <path
            d="M14.7 12.5h-2v7.3a10 10 0 0 1-3.1-.1v-7.2H7.4V9.9h2.2V8.3c0-2.2 1.3-3.4 3.3-3.4.9 0 1.9.2 1.9.2v2.1h-1.1c-1 0-1.4.7-1.4 1.4v1.3h2.4l-.4 2.6Z"
            fill="#fff"
          />
        </svg>
      );

    case 'instagram':
      // Instagram — degrade kare, kamera hatları.
      return (
        <svg {...ortak}>
          <defs>
            <linearGradient id="ig-grad" x1="2" y1="22" x2="22" y2="2">
              <stop offset="0" stopColor="#FFC107" />
              <stop offset=".45" stopColor="#F44336" />
              <stop offset="1" stopColor="#9C27B0" />
            </linearGradient>
          </defs>
          <rect x="2" y="2" width="20" height="20" rx="6" fill="url(#ig-grad)" />
          <rect
            x="6.2"
            y="6.2"
            width="11.6"
            height="11.6"
            rx="3.6"
            fill="none"
            stroke="#fff"
            strokeWidth="1.6"
          />
          <circle cx="12" cy="12" r="3" fill="none" stroke="#fff" strokeWidth="1.6" />
          <circle cx="16.4" cy="7.6" r="1" fill="#fff" />
        </svg>
      );

    case 'youtube':
      // YouTube — kırmızı yuvarlatılmış dikdörtgen, beyaz oynat üçgeni.
      return (
        <svg {...ortak}>
          <rect x="1.5" y="5" width="21" height="14" rx="4.2" fill="#FF0000" />
          <path d="M10 8.9v6.2l5.4-3.1L10 8.9Z" fill="#fff" />
        </svg>
      );
  }
}

/**
 * Reklam hesabı ve sosyal profil satırları kanal tipi TAŞIMIYOR; ellerinde
 * platform (`meta`/`google`) ya da profil tipi var. Eşleme burada, tek
 * yerde — iki bileşenin kendi `switch`ini yazması, bir logonun bir ekranda
 * doğru diğerinde yanlış çıkması demekti.
 */
export function adAccountKanali(platform: string): ChannelKind {
  return platform === 'google' ? 'google_ads' : 'meta_ads';
}

export function profilKanali(profileType: string): ChannelKind {
  if (profileType === 'instagram_business') return 'instagram';
  if (profileType === 'youtube_channel') return 'youtube';
  return 'facebook';
}
