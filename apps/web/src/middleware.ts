import { NextResponse, type NextRequest } from 'next/server';

const ACCESS_COOKIE = 'adv_at';
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';

/** Oturum gerektirmeyen yollar. */
/**
 * Oturum gerektirmeyen yollar.
 *
 * Yasal sayfalar (`/gizlilik`, `/kosullar`, `/veri-silme`) burada olmak
 * ZORUNDA: Meta App Review ve Google OAuth Verification bu adresleri kendi
 * crawler'larıyla ziyaret ediyor. Login'e yönlendirilirlerse başvuru
 * reddedilir — "privacy policy not publicly accessible".
 */
const PUBLIC_PATHS = [
  '/login',
  '/davet',
  '/sifre-sifirla',
  '/r',
  '/gizlilik',
  '/kosullar',
  '/veri-silme',
];

/**
 * İki iş yapar:
 *
 *  1. KABA OTURUM KONTROLÜ — access cookie'si yoksa /login'e yönlendirir.
 *     Bu bir GÜVENLİK KONTROLÜ DEĞİLDİR; sadece gereksiz sayfa yüklemesini
 *     önleyen bir kısayoldur. Middleware token'ı DOĞRULAMAZ (Edge runtime'da
 *     imza doğrulaması yapmak için secret'ı edge'e taşımak gerekirdi).
 *     Gerçek yetkilendirme her zaman API tarafındaki JwtAuthGuard + RLS'tir.
 *
 *  2. WHITE-LABEL DOMAIN ÇÖZÜMLEMESİ — kök domain dışındaki bir host'tan
 *     gelen istekleri işaretler. Rapor paylaşım sayfaları (Modül 6) bu
 *     başlığı okuyup ilgili markayı render eder.
 */
/**
 * Dışarıya verilecek yönlendirme adresinin kökü.
 *
 * `req.url` KULLANILMAZ. Ters vekil arkasında o adres iç adrestir: Nginx
 * `proxy_set_header Host $host` göndermezse varsayılanı `$proxy_host` olur ve
 * Next.js host'u `localhost:3598` görür. Sonuç: üretimde
 * `https://advetics.com/` isteği `http://localhost:3598/login` adresine
 * yönlendiriliyordu. Meta'nın crawler'ı oraya bağlanamadığı için "domain
 * uygulamanın domainlerinde yer almıyor" hatası veriyordu — App Domains doğru
 * girilse bile.
 *
 * Sıra: X-Forwarded-Host → Host → yapılandırılmış kök domain.
 * Host iç bir adres ise (localhost/127.0.0.1) yapılandırılmış domaine düşülür;
 * dışarıya iç adres yazmak her koşulda hatalıdır.
 */
function publicOrigin(req: NextRequest): string {
  const first = (v: string | null) => v?.split(',')[0]?.trim() ?? '';
  const forwardedHost = first(req.headers.get('x-forwarded-host'));
  const host = forwardedHost || first(req.headers.get('host')) || req.nextUrl.host;

  const isInternal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const configuredIsLocal = /^(localhost|127\.0\.0\.1)/.test(ROOT_DOMAIN);

  // Yerel geliştirmede ROOT_DOMAIN de localhost'tur; orada iç adres doğrudur.
  if (isInternal && !configuredIsLocal) {
    return `https://${ROOT_DOMAIN}`;
  }

  const proto =
    first(req.headers.get('x-forwarded-proto')) || (isInternal ? 'http' : 'https');
  return `${proto}://${host}`;
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const host = req.headers.get('host') ?? '';
  const origin = publicOrigin(req);

  const isCustomDomain =
    host.length > 0 &&
    host !== ROOT_DOMAIN &&
    !host.startsWith('localhost') &&
    !host.startsWith('127.0.0.1');

  // Custom domain'ler yalnızca herkese açık rapor sayfalarını servis eder.
  // Panelin kendisi kök domain'de yaşar — müşterinin alan adı üzerinden
  // ajans paneline erişilmesini istemiyoruz.
  if (isCustomDomain && !pathname.startsWith('/r/')) {
    return NextResponse.redirect(new URL('/r/bulunamadi', origin));
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hasSessionCookie = req.cookies.has(ACCESS_COOKIE);

  if (!isPublic && !hasSessionCookie) {
    const loginUrl = new URL('/login', origin);
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === '/login' && hasSessionCookie) {
    return NextResponse.redirect(new URL('/dashboard', origin));
  }

  const res = NextResponse.next();
  if (isCustomDomain) res.headers.set('x-advetics-domain', host);
  return res;
}

export const config = {
  /**
   * `robots.txt` ve `sitemap.xml` KASITLI olarak dışlandı.
   *
   * Middleware bunları da kapsadığında, oturumu olmayan bir istemci
   * `/robots.txt` yerine `/login`'e yönlendiriliyordu — yani Meta ve Google
   * crawler'ları robots.txt'yi hiç okuyamıyordu. Sharing Debugger'ın
   * "403, robots.txt engeli olabilir" uyarısının bir parçası da buydu.
   *
   * `opengraph-image` ve `twitter-image` de aynı sebeple dışlandı. Next.js bu
   * yolları uzantısız üretiyor (`/opengraph-image?<hash>`), dolayısıyla dosya
   * uzantısı eleği onları yakalamıyordu: Meta og:image adresini alıyor, adrese
   * gidiyor ve 307 ile login'e yönlendiriliyordu. Etiket doğru, görsel yok.
   *
   * Statik dosya uzantıları da dışlandı; bunlar için oturum mantığı çalıştırmak
   * gereksiz maliyet.
   */
  matcher: [
    '/((?!api|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|opengraph-image|twitter-image|icon|apple-icon|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|xml|webmanifest)$).*)',
  ],
};
