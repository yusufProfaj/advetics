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
export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const host = req.headers.get('host') ?? '';

  const isCustomDomain =
    host.length > 0 &&
    host !== ROOT_DOMAIN &&
    !host.startsWith('localhost') &&
    !host.startsWith('127.0.0.1');

  // Custom domain'ler yalnızca herkese açık rapor sayfalarını servis eder.
  // Panelin kendisi kök domain'de yaşar — müşterinin alan adı üzerinden
  // ajans paneline erişilmesini istemiyoruz.
  if (isCustomDomain && !pathname.startsWith('/r/')) {
    return NextResponse.redirect(new URL('/r/bulunamadi', req.url));
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hasSessionCookie = req.cookies.has(ACCESS_COOKIE);

  if (!isPublic && !hasSessionCookie) {
    const loginUrl = new URL('/login', req.url);
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === '/login' && hasSessionCookie) {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  const res = NextResponse.next();
  if (isCustomDomain) res.headers.set('x-advetics-domain', host);
  return res;
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|webp)$).*)'],
};
