import type { CookieOptions, Response } from 'express';
import type { AppConfig } from '../../config/configuration';
import { parseTtl } from './token.service';

export const ACCESS_COOKIE = 'adv_at';
export const REFRESH_COOKIE = 'adv_rt';
export const ACTIVE_CLIENT_COOKIE = 'adv_client';

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
      httpOnly: false, // Frontend'in aktif müşteriyi okuması gerekiyor
      path: '/',
      maxAge: parseTtl('30d'),
    });
  } else {
    res.clearCookie(ACTIVE_CLIENT_COOKIE, { ...base, httpOnly: false, path: '/' });
  }
}

export function clearAuthCookies(res: Response, config: AppConfig): void {
  const base = baseOptions(config);
  res.clearCookie(ACCESS_COOKIE, { ...base, path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base, path: REFRESH_COOKIE_PATH });
  res.clearCookie(ACTIVE_CLIENT_COOKIE, { ...base, httpOnly: false, path: '/' });
}
