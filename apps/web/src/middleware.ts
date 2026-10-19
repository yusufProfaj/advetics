import { NextResponse, type NextRequest } from 'next/server';
import { ONEK_BASLIGI, enOnekliMi, ingilizceYolu, turkceYolu } from '@/lib/site-yollari';

const ACCESS_COOKIE = 'adv_at';
/** shared `DIL_CEREZI`, `DIL_SORGU_ANAHTARI`, `DILLER` ile aynı (middleware.spec.ts). */
const DIL_CEREZI_EDGE = 'adv_dil';
const DIL_SORGU_ANAHTARI = 'dil';
const DILLER_EDGE: string[] = ['tr', 'en'];
const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';

/** Oturum gerektirmeyen yollar. */
/**
 * Oturum gerektirmeyen yollar.
 *
 * Yasal sayfalar (`/gizlilik`, `/kosullar`, `/veri-silme`, `/cerez-politikasi`) burada olmak
 * ZORUNDA: Meta App Review ve Google OAuth Verification bu adresleri kendi
 * crawler'larıyla ziyaret ediyor. Login'e yönlendirilirlerse başvuru
 * reddedilir — "privacy policy not publicly accessible".
 */
const PUBLIC_PATHS = [
  '/login',
  '/davet',
  '/sifre-sifirla',
  // Şifresini unutan kişinin tanımı gereği oturumu YOK; bu satır olmadan
  // "Şifremi unuttum" bağlantısı kullanıcıyı /login'e geri atardı.
  '/sifremi-unuttum',
  '/r',
  // Girişsiz strateji onayı (AdvStrategy v2, kullanıcı kararı K-2). Erişim
  // kararı yoldaki token; müşterinin panel hesabı yok. Liste dışında kalsa
  // mail ile gelen bağlantı /login'e atar ve müşteri onaylayamaz — ajans
  // bunu HİÇ görmez, çünkü kendi oturumu açık. Önek sözleşmede
  // (`ONAY_SAYFASI_ONEKI`); middleware Edge paketine shared'ı sokmamak için
  // elle yazılı, `strateji-v2-sayfa.spec.ts` ikisini karşılaştırıyor.
  '/strateji-onay',
  '/gizlilik',
  '/kosullar',
  '/veri-silme',
  // Çerez politikası (2026-10-14): çerez bildirimi ve alt bilgi buraya
  // bağlanıyor; oturumsuz ziyaretçi /login'e atılırsa bildirimin "Çerez
  // Politikası" bağlantısı onu giriş ekranına götürürdü.
  '/cerez-politikasi',
  // Tanıtım sitesi (2026-10-12). Liste elle yazılı, `site-icerik.ts`ten
  // okunmuyor: o dosya sitenin bütün metnini taşıyor ve middleware her
  // istekte koşan Edge paketine girer. `site-icerik.spec.ts` iki listeyi
  // karşılaştırıyor; yeni bir sayfa buraya yazılmazsa ziyaretçi /login'e
  // atılıyor ve oturumu açık geliştirici bunu HİÇ görmüyor.
  '/ozellikler',
  '/cozumler',
  '/entegrasyonlar',
  '/fiyatlandirma',
  '/guvenlik',
  '/demo',
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

  // Protokol için X-Forwarded-Proto'ya GÜVENİLMEZ.
  //
  // CloudPanel'in vekili bu başlığı `http` olarak gönderiyor (TLS'i kendisi
  // sonlandırıp uygulamaya düz HTTP ile bağlandığı için). Başlığa güvenmek
  // üretimde `http://advetics.com/login` gibi Location değerleri üretiyordu:
  // tarayıcı bunu ikinci bir yönlendirmeyle düzeltiyor ama crawler'lar ve
  // OAuth doğrulayıcıları güvensiz şemayı olduğu gibi görüyor.
  //
  // Kural basit: gerçek bir public domain her zaman https ile servis edilir;
  // düz HTTP yalnızca yerel geliştirmede geçerlidir.
  const proto = isInternal ? 'http' : 'https';
  return `${proto}://${host}`;
}

function dilCereziYaz(res: NextResponse, dil: string, origin: string): void {
  res.cookies.set(DIL_CEREZI_EDGE, dil, {
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
    sameSite: 'lax',
    secure: origin.startsWith('https:'),
  });
}

/**
 * HREFLANG HTTP BAŞLIĞIYLA (Google bunu `<link rel=alternate>` ile eş
 * sayıyor). Sayfa başına metadata yazmak 16 sayfada aynı satırı tekrar
 * etmek ve birinin unutulması demekti; yol tablosu zaten burada.
 * `x-default` Türkçe: önek yok = Türkçe (Ç2).
 */
function hreflangBasligi(origin: string, tr: string, en: string): string {
  return [
    `<${origin}${tr}>; rel="alternate"; hreflang="tr"`,
    `<${origin}${en}>; rel="alternate"; hreflang="en"`,
    `<${origin}${tr}>; rel="alternate"; hreflang="x-default"`,
  ].join(', ');
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;
  const host = req.headers.get('host') ?? '';
  const origin = publicOrigin(req);

  /*
   * `www.` KÖK ALAN ADINA KALICI YÖNLENİR (2026-10-19). Nginx `www`yu da
   * buraya veriyor ama aşağıdaki white-label kararı onu MÜŞTERİ ALAN ADI
   * sayıp `/r/bulunamadi`ye atıyordu: `https://www.advetics.com/` 307 ile
   * "rapor bulunamadı" açıyordu. Google OAuth doğrulayıcısı ya da bir
   * ziyaretçi adresi `www` ile yazarsa ana sayfa hiç görünmüyordu.
   */
  if (host === `www.${ROOT_DOMAIN}`) {
    const proto = /^(localhost|127\.0\.0\.1)/.test(ROOT_DOMAIN) ? 'http' : 'https';
    return NextResponse.redirect(new URL(pathname + req.nextUrl.search, `${proto}://${ROOT_DOMAIN}`), 308);
  }

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

  /**
   * PAYLAŞILABİLİR DİL BAĞLANTISI (`?dil=en`, docs/i18n/MIMARI.md §2):
   * çerezi yazar ve AYNI adrese parametresiz döner. Parametre adreste
   * kalsaydı kişi Hesabım'dan dili değiştirdiğinde yer imindeki `?dil=en`
   * seçimini her açılışta geri alırdı. Oturum kararından ÖNCE: girişsiz
   * kişi panel adresine `?dil=en` ile gelirse giriş ekranı da İngilizce
   * açılsın. Sabitler shared'dan değil elle (Edge paketi, yukarıdaki
   * PUBLIC_PATHS ile aynı gerekçe); `middleware.spec.ts` karşılaştırıyor.
   */
  const dilSorgusu = req.nextUrl.searchParams.get(DIL_SORGU_ANAHTARI);
  if (dilSorgusu !== null) {
    const temiz = new URL(req.nextUrl.pathname + req.nextUrl.search, origin);
    temiz.searchParams.delete(DIL_SORGU_ANAHTARI);
    const yon = NextResponse.redirect(temiz);
    if (DILLER_EDGE.includes(dilSorgusu)) dilCereziYaz(yon, dilSorgusu, origin);
    return yon;
  }

  /**
   * İKİ DİLLİ SİTE (`lib/site-yollari.ts`, kullanıcı kararı Ç2).
   *
   * İSTEMCİNİN GÖNDERDİĞİ ÖNEK BAŞLIĞI HER ZAMAN SİLİNİR: başlık yalnız
   * buradaki yeniden yazımın işareti; dışarıdan gelirse Türkçe adres
   * İngilizce çizilir ve önbellek/arama motoru iki dili karıştırır.
   *
   * `/en/...` → Türkçe sayfaya YENİDEN YAZILIR (adres çubuğu `/en` kalır),
   * dil çereze de yazılır: İngilizce sayfadan girişe geçen kişi giriş
   * ekranını da İngilizce görsün. Eşlemesi olmayan `/en/x` olduğu gibi
   * geçer ve 404 olur (sessizce Türkçe sayfaya düşmek yanlış dilde içerik).
   *
   * Öneksiz site sayfası + `en` çerezi → `/en` karşılığına YÖNLENİR. Çerezi
   * olmayan (arama motoru, OAuth doğrulayıcısı) Türkçe sayfayı görür;
   * öneksiz adres çerez YAZMAZ, yoksa ilk ziyaret sorusu hiç çıkmazdı (Ç1).
   */
  /*
   * ═══ NEXT'İN KENDİ VEKİL İSTEĞİ: İKİNCİ GEÇİŞ (canlı, 2026-10-16) ═══
   *
   * Sunucu `--hostname 127.0.0.1` ile kalkıyor; Next'in iç adresi
   * `http://127.0.0.1:3598`. Ama `req.nextUrl` döngü adreslerini
   * `localhost`a çeviriyor, yani `/en` yeniden yazımının hedefi
   * `http://localhost:3598/...` oluyor ve köken tutmadığı için Next onu
   * DIŞ ADRES sayıp kendine HTTP ile vekil istek atıyor
   * (`resolve-routes.js`, `getRelativeURL`). O istek middleware'den İKİNCİ
   * KEZ geçiyordu: önek başlığı "istemci gönderdi" diye siliniyor, `en`
   * çerezi Türkçe adresi `/en`e geri yönlendiriyordu. Sonuç: `/en` ilk
   * ziyarette Türkçe çiziliyor, çerez yazıldıktan sonra ERR_TOO_MANY_REDIRECTS.
   * Yerelde görünmüyordu (geliştirme sunucusunun iç adresi zaten localhost).
   *
   * Vekil isteğin Host'u hedefin kendisi (`changeOrigin`): döngü adresi ve
   * kök alan adı DEĞİL. Nginx'ten gelen gerçek istekte Host `advetics.com`.
   * Yalnız o durumda önek başlığına güveniliyor; sahtesinin en kötü sonucu
   * Türkçe adresin İngilizce çizilmesi. Sunucunun `--hostname`ını
   * `localhost` yapmak kökü kapatırdı ama VPS'te `::1`e bağlanıp nginx'i
   * koparabilir: o yüzden burada.
   */
  const vekilIstek = host !== ROOT_DOMAIN && /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const vekilOnek = vekilIstek && req.headers.get(ONEK_BASLIGI) === 'en';
  const istekBasliklari = new Headers(req.headers);
  istekBasliklari.delete(ONEK_BASLIGI);
  if (vekilOnek) istekBasliklari.set(ONEK_BASLIGI, 'en');
  if (enOnekliMi(pathname)) {
    const tr = turkceYolu(pathname);
    if (tr === null) return NextResponse.next({ request: { headers: istekBasliklari } });
    istekBasliklari.set(ONEK_BASLIGI, 'en');
    const hedef = req.nextUrl.clone();
    hedef.pathname = tr;
    const yaz = NextResponse.rewrite(hedef, { request: { headers: istekBasliklari } });
    dilCereziYaz(yaz, 'en', origin);
    yaz.headers.set('Link', hreflangBasligi(origin, tr, pathname));
    return yaz;
  }
  const enKarsiligi = ingilizceYolu(pathname);
  if (enKarsiligi !== null) {
    if (!vekilOnek && req.cookies.get(DIL_CEREZI_EDGE)?.value === 'en') {
      return NextResponse.redirect(new URL(enKarsiligi + req.nextUrl.search, origin));
    }
    const devam = NextResponse.next({ request: { headers: istekBasliklari } });
    devam.headers.set('Link', hreflangBasligi(origin, pathname, enKarsiligi));
    return devam;
  }

  /**
   * Kök `/` tanıtım sayfası — herkese açık.
   *
   * PUBLIC_PATHS LİSTESİNE `'/'` EKLEMEYİN. Liste bugün
   * `pathname.startsWith(`${p}/`)` ile eşleşiyor ve `'/'` için bu `'//'`
   * ürettiğinden tesadüfen zararsız kalıyor. Eşleşme bir gün
   * `startsWith(p)` olarak sadeleştirilirse `'/'` her yolla eşleşir ve
   * PANELİN TAMAMI OTURUMSUZ AÇILIR — sessiz, gürültüsüz, tek satırlık bir
   * güvenlik açığı. Kök burada ayrı ve açıkça karşılanıyor.
   */
  const isPublic =
    pathname === '/' ||
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const hasSessionCookie = req.cookies.has(ACCESS_COOKIE);

  if (!isPublic && !hasSessionCookie) {
    const loginUrl = new URL('/login', origin);
    if (pathname !== '/') loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname === '/login' && hasSessionCookie) {
    return NextResponse.redirect(new URL('/dashboard', origin));
  }

  const res = NextResponse.next({ request: { headers: istekBasliklari } });
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
   *
   * LİSTEDE OLMAYAN BİR UZANTI SESSİZCE ÖLÜYOR. `mp4` ilk eklendiğinde
   * listede yoktu: ana sayfanın hero filmi `/login`'e 307 ile yönleniyor,
   * `<video>` `MEDIA_ERR_SRC_NOT_SUPPORTED` alıyor ve sayfa hiçbir hata
   * göstermeden posterde donuyordu. Poster `.jpg` olduğu için ÇALIŞIYORDU —
   * yani arıza "video yok" değil "video hiç oynamıyor" gibi görünüyor ve
   * sebebi bu satırda. `public/` altına yeni bir tür dosya koyan herkes
   * burayı da genişletmek zorunda; `statik-varliklar.spec.ts` iki listeyi
   * karşılaştırıyor.
   */
  matcher: [
    '/((?!api|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|opengraph-image|twitter-image|icon|apple-icon|.*\\.(?:png|jpg|jpeg|gif|svg|webp|avif|ico|txt|xml|webmanifest|mp4|webm|m4v|woff|woff2)$).*)',
  ],
};
