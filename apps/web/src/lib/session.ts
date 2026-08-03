import { redirect } from 'next/navigation';
import type { Permission, SessionResponse } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from './api';

export type { SessionResponse };

/**
 * Sunucu tarafında oturumu getirir. Oturum yoksa null döner.
 *
 * Not: Bu çağrı her istekte API'ye gider ve yetkiler veritabanından taze
 * okunur. Alternatif olan "yetkileri JWT'ye gömmek" daha hızlıdır ama bir
 * kullanıcının yetkisi geri alındığında token'ı süresi dolana kadar geçerli
 * kalır. Bütçeye dokunan bir üründe bu gecikmeyi kabul etmiyoruz.
 */
export async function getSession(): Promise<SessionResponse | null> {
  try {
    return await serverApiFetch<SessionResponse>('/auth/session');
  } catch (err) {
    if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
      return null;
    }
    throw err;
  }
}

/** Oturum zorunlu olan sayfalar için. Yoksa /login'e yönlendirir. */
export async function requireSession(): Promise<SessionResponse> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

export function hasPermission(session: SessionResponse, permission: Permission): boolean {
  return session.permissions.includes(permission);
}
