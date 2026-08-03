/**
 * API istemcisi.
 *
 * İki ayrı yol var çünkü Next.js'te iki farklı çalıştırma ortamı var:
 *   - Tarayıcı: cookie'ler otomatik gider, `credentials: 'include'` yeterli.
 *   - Sunucu (RSC / Server Action): cookie'leri ELLE iletmek gerekir,
 *     aksi halde istek kimliksiz gider ve 401 döner.
 *
 * Bu ayrımı unutmak, "lokalde çalışıyor ama sunucuda boş geliyor" hatasının
 * en yaygın kaynağıdır.
 */

/** Tarayıcıdan görünen adres. Build anında koda gömülür. */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';

/**
 * Sunucu tarafı çağrılar için doğrudan adres.
 *
 * Üretimde tarayıcı `https://advetics.com/api` adresini kullanır, ama Next.js
 * sunucusu aynı makinede olduğu için bu adresi kullanmak isteği Nginx'e geri
 * gönderir (hairpin): gereksiz TLS el sıkışması, ek gecikme ve sertifika
 * doğrulamasına bağımlılık. `INTERNAL_API_URL` ile localhost'a doğrudan gidilir.
 *
 * Tanımlı değilse dış adrese düşer — yerel geliştirmede ikisi zaten aynıdır.
 */
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? API_URL;

export interface ApiError {
  statusCode: number;
  code: string;
  message: string;
  requestId?: string;
  errors?: Array<{ field: string; message: string }>;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly fieldErrors?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.ok) {
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  let body: ApiError | null = null;
  try {
    body = (await res.json()) as ApiError;
  } catch {
    /* gövde JSON değilse yut */
  }

  throw new ApiRequestError(
    body?.message ?? `İstek başarısız (${res.status})`,
    res.status,
    body?.code ?? 'UNKNOWN',
    body?.errors,
  );
}

// -----------------------------------------------------------------------------
// Tarayıcı tarafı
// -----------------------------------------------------------------------------

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    // httpOnly cookie tabanlı oturumun çalışması için zorunlu.
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  return handle<T>(res);
}

// -----------------------------------------------------------------------------
// Sunucu tarafı (Server Component / Server Action)
// -----------------------------------------------------------------------------

/**
 * Gelen isteğin cookie'lerini API'ye ileterek çağrı yapar.
 *
 * `cookies()` Next.js 15'te async'tir; bu yüzden fonksiyon await edilmelidir.
 */
export async function serverApiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const res = await fetch(`${INTERNAL_API_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(init.headers ?? {}),
    },
    // Oturuma bağlı veri asla önbelleğe alınmamalı — bir müşterinin verisi
    // başka bir müşteriye servis edilebilir.
    cache: 'no-store',
  });

  return handle<T>(res);
}
