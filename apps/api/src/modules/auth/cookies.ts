import type { CookieOptions, Response } from 'express';
import type { AppConfig } from '../../config/configuration';
import { parseTtl } from './token.service';

export const ACCESS_COOKIE = 'adv_at';
export const REFRESH_COOKIE = 'adv_rt';
export const ACTIVE_CLIENT_COOKIE = 'adv_client';
/**
 * Panelde seçili ŞİRKET (üst hesap altında geçiş yapılmışsa).
 *
 * `adv_client` ile AYNI güven seviyesi: değer tarayıcıda duruyor ve
 * kullanıcı düzenleyebilir. Güvenlik cookie'de değil, `TenantContextService`
 * içindeki doğrulamada — istenen şirket, veritabanından hesaplanan izin
 * listesinde yoksa sessizce EV organizasyonuna düşülüyor.
 */
export const ACTIVE_ORG_COOKIE = 'adv_org';

/**
 * SEÇİLİ ÜST HESAP.
 *
 * `adv_org` ile AYNI güven seviyesinde: değer tarayıcıda duruyor ve
 * `TenantContextService` onu kullanıcının gerçek üyelik listesine (platform
 * sahibinde: bütün üst hesaplara) karşı doğruluyor. Doğrulanmamış bir değer
 * `app.current_manager_account_id()`yi sürerdi — üst hesap tablolarının TEK
 * sınırı o.
 */
export const ACTIVE_MANAGER_COOKIE = 'adv_mgr';

/**
 * Refresh cookie yalnızca bu yol altında gönderilir. Böylece her normal API
 * isteğinde tarayıcı uzun ömürlü token'ı taşımaz.
 */
export const REFRESH_COOKIE_PATH = '/api/auth';

function baseOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookie.secure,
    // Lax: normal gezinmede gönderilir, cross-site POST'ta gönderilmez.
    // Bu, form tabanlı CSRF'in büyük kısmını kapatır. White-label custom
    // domain'ler rapor sayfalarını token ile servis eder, cookie ile değil —
    // bu yüzden SameSite=None'a ihtiyaç duymuyoruz.
    sameSite: 'lax',
    domain: config.cookie.domain === 'localhost' ? undefined : config.cookie.domain,
  };
}

/**
 * "BENİ HATIRLA" BURADA UYGULANIYOR — ve yalnızca burada.
 *
 * `tokens.persistent` false ise iki cookie de `maxAge`SİZ yazılıyor. Bu bir
 * detay değil, özelliğin TAMAMI: `maxAge` taşımayan bir cookie oturum
 * cookie'sidir ve tarayıcı kapanınca silinir.
 *
 * KARAR TOKEN NESNESİNDEN OKUNUYOR, ayrı bir parametreden değil. Ayrı
 * parametre olsaydı üç çağıran (`register`, `login`, `refresh`) vardı ve
 * birinin onu geçirmeyi unutması derlemeyi kırmadan mümkün olurdu; sonuç,
 * o yoldan giren kullanıcının "beni hatırlama" demesine rağmen 30 gün açık
 * kalan bir oturumu olurdu ve bunu hiçbir ekran göstermezdi.
 */
export function setAuthCookies(
  res: Response,
  config: AppConfig,
  tokens: { accessToken: string; refreshToken: string; persistent: boolean },
): void {
  const base = baseOptions(config);

  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base,
    path: '/',
    ...(tokens.persistent ? { maxAge: parseTtl(config.jwt.accessTtl) } : {}),
  });

  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    path: REFRESH_COOKIE_PATH,
    ...(tokens.persistent ? { maxAge: parseTtl(config.jwt.refreshTtl) } : {}),
  });
}

export function setActiveClientCookie(
  res: Response,
  config: AppConfig,
  clientId: string | null,
): void {
  const base = baseOptions(config);
  if (clientId) {
    res.cookie(ACTIVE_CLIENT_COOKIE, clientId, {
      ...base,
      httpOnly: false, // Frontend'in aktif workspace’i okuması gerekiyor
      path: '/',
      maxAge: parseTtl('30d'),
    });
  } else {
    res.clearCookie(ACTIVE_CLIENT_COOKIE, { ...base, httpOnly: false, path: '/' });
  }
}

/**
 * Seçili şirket cookie'si. `setActiveClientCookie` ile aynı desen.
 *
 * `httpOnly: false` — panelin sunucu tarafı hangi şirkette olduğumuzu
 * okuyor. Cookie bir YETKİ taşımıyor, yalnızca bir SEÇİM; yetki her istekte
 * yeniden hesaplanıyor.
 */
/** Seçili üst hesabı yazar; `null` çerezi siler. */
export function setActiveManagerCookie(
  res: Response,
  config: AppConfig,
  managerAccountId: string | null,
): void {
  const base = baseOptions(config);
  if (managerAccountId) {
    res.cookie(ACTIVE_MANAGER_COOKIE, managerAccountId, {
      ...base,
      // `httpOnly: false` — `adv_org` ile aynı: panel sunucu bileşenlerinde
      // okuyor ve değer bir SIR değil, doğrulanan bir SEÇİM.
      httpOnly: false,
      path: '/',
    });
  } else {
    res.clearCookie(ACTIVE_MANAGER_COOKIE, { ...base, httpOnly: false, path: '/' });
  }
}

export function setActiveOrgCookie(
  res: Response,
  config: AppConfig,
  organizationId: string | null,
): void {
  const base = baseOptions(config);
  if (organizationId) {
    res.cookie(ACTIVE_ORG_COOKIE, organizationId, {
      ...base,
      httpOnly: false,
      path: '/',
      maxAge: parseTtl('30d'),
    });
  } else {
    res.clearCookie(ACTIVE_ORG_COOKIE, { ...base, httpOnly: false, path: '/' });
  }
}

export function clearAuthCookies(res: Response, config: AppConfig): void {
  const base = baseOptions(config);
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_COOKIE_PATH });
  res.clearCookie(ACTIVE_CLIENT_COOKIE, { ...base, httpOnly: false, path: '/' });
  /*
   * ŞİRKET SEÇİMİ DE SİLİNİYOR. Kalsaydı, aynı tarayıcıdan giriş yapan
   * BAŞKA bir kullanıcı önceki kişinin şirket seçimiyle açılırdı; seçim
   * doğrulamadan geçmezse eve düşüyor, yani sızıntı değil — ama "neden
   * başka bir şirkettesin" sorusunun cevabı hiçbir ekranda yazmazdı.
   */
  res.clearCookie(ACTIVE_ORG_COOKIE, { ...base, httpOnly: false, path: '/' });
  // ÜST HESAP SEÇİMİ DE: aynı gerekçe, bir katman yukarısı.
  res.clearCookie(ACTIVE_MANAGER_COOKIE, { ...base, httpOnly: false, path: '/' });
}
