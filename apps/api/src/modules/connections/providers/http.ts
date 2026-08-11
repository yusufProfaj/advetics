import type { Platform } from '@advetics/shared';
import { PlatformApiError, type RateLimitSnapshot } from '../provider.types';

/**
 * Platform HTTP çağrıları için ince sarmalayıcı.
 *
 * SDK yerine bunu kullanıyoruz çünkü Modül 3'te kota header'larını HAM olarak
 * okumamız gerekiyor — SDK'lar onları soyutlayıp gizliyor. Ayrıca tek bir yerde
 * timeout, hata normalizasyonu ve telemetri toplama imkânı veriyor.
 */

export interface PlatformResponse<T> {
  data: T;
  rateLimit?: RateLimitSnapshot;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export async function platformFetch<T>(
  platform: Platform,
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
  parseRateLimit?: (headers: Headers) => RateLimitSnapshot | undefined,
): Promise<PlatformResponse<T>> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;

  // AbortSignal.timeout: ağ takılmasında worker'ın süresiz beklemesini önler.
  // Modül 3'te tek takılı istek, o hesabın tüm senkronizasyonunu durdurabilir.
  let res: Response;
  try {
    res = await fetch(url, { ...rest, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'TimeoutError';
    throw new PlatformApiError(
      platform,
      'transient',
      aborted ? `İstek ${timeoutMs}ms içinde tamamlanmadı` : 'Ağ hatası',
      { raw: err instanceof Error ? err.message : String(err) },
    );
  }

  const rateLimit = parseRateLimit?.(res.headers);
  const text = await res.text();

  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!res.ok) {
    throw normalizeError(platform, res, body);
  }

  return { data: body as T, rateLimit };
}

/**
 * HTTP durumunu ve platforma özgü hata gövdesini ortak dile çevirir.
 *
 * Meta hata kodlarını gövdede `error.code`/`error_subcode` olarak verir;
 * Google gRPC benzeri `error.status` + `details[].errors[].errorCode` yapısı
 * kullanır. İkisini de aynı beş kategoriye indiriyoruz.
 */
export function normalizeError(
  platform: Platform,
  res: Response,
  body: unknown,
): PlatformApiError {
  const retryAfter = Number(res.headers.get('retry-after') ?? '') || undefined;
  const b = (body ?? {}) as Record<string, unknown>;
  const err = (b.error ?? {}) as Record<string, unknown>;

  const code = err.code as number | string | undefined;
  const subcode = (err.error_subcode ?? err.status) as number | string | undefined;

  // MESAJI ZENGİNLEŞTİR.
  //
  // Meta kod 100 için yalnızca "Invalid parameter" diyor — hangi parametrenin
  // reddedildiğini söylemiyor. Gerçek bilgi yan alanlarda: `error_user_title`,
  // `error_user_msg`, `error_data` ve `fbtrace_id`. Bunları mesaja katmazsak
  // `sync_jobs.error_message` "Invalid parameter" olarak kalıyor ve arıza
  // teşhis edilemez hâle geliyor — ham gövde `detail.raw` içinde duruyor ama
  // oraya kimse bakmıyor.
  const parts: string[] = [];
  const base =
    (typeof err.message === 'string' && err.message) ||
    (typeof b.message === 'string' && b.message) ||
    `${res.status} ${res.statusText}`;
  parts.push(base);

  for (const key of ['error_user_title', 'error_user_msg'] as const) {
    const value = err[key];
    if (typeof value === 'string' && value.length > 0 && !base.includes(value)) {
      parts.push(value);
    }
  }
  // `error_data` bazen hangi alanın sorunlu olduğunu taşıyor.
  if (err.error_data !== undefined && err.error_data !== null) {
    parts.push(`error_data=${JSON.stringify(err.error_data).slice(0, 300)}`);
  }
  if (subcode !== undefined) parts.push(`subcode=${subcode}`);
  // fbtrace_id Meta desteğiyle konuşurken tek kullanışlı referans.
  if (typeof err.fbtrace_id === 'string') parts.push(`fbtrace=${err.fbtrace_id}`);

  // GOOGLE'IN GERÇEK SEBEBİ `details[].errors[]` ALTINDA.
  //
  // Üst seviye mesaj HER HATA İÇİN AYNI: "Request contains an invalid
  // argument." Hangi alanın reddedildiği, kotanın mı dolduğu, sorgunun mu
  // bozuk olduğu yalnızca `errorCode` ve iç mesajda yazıyor.
  //
  // Bu olmadan `sync_jobs.error_message` her Google hatasında birebir aynı
  // satırı gösteriyordu ve tanı imkânsızdı: hesap saatlerdir 30 dakikada bir
  // düşerken kayıtta yalnızca "invalid argument" yazıyordu.
  parts.push(...googleErrorParts(err));

  const message = parts.join(' · ');

  const detail = {
    httpStatus: res.status,
    platformCode: code,
    platformSubcode: subcode,
    retryAfterSeconds: retryAfter,
    raw: body,
  };

  // --- Meta ---
  if (platform === 'meta') {
    // 190: geçersiz/süresi dolmuş token · 102: oturum geçersiz
    if (code === 190 || code === 102) {
      return new PlatformApiError(platform, 'invalid_token', message, detail);
    }
    // 4/17/32/613: uygulama veya kullanıcı düzeyi kota · 80000+: BUC kotaları
    if (code === 4 || code === 17 || code === 32 || code === 613 || Number(code) >= 80000) {
      return new PlatformApiError(platform, 'rate_limited', message, detail);
    }
    // 10 ve 200-299: izin hatası
    if (code === 10 || (Number(code) >= 200 && Number(code) <= 299)) {
      return new PlatformApiError(platform, 'permission_denied', message, detail);
    }
    // 1/2: geçici platform hatası
    if (code === 1 || code === 2 || res.status >= 500) {
      return new PlatformApiError(platform, 'transient', message, detail);
    }
  }

  // --- Google ---
  if (platform === 'google') {
    const status = String(subcode ?? '');
    if (res.status === 401 || status === 'UNAUTHENTICATED') {
      return new PlatformApiError(platform, 'invalid_token', message, detail);
    }
    if (res.status === 429 || status === 'RESOURCE_EXHAUSTED') {
      return new PlatformApiError(platform, 'rate_limited', message, detail);
    }
    if (res.status === 403 || status === 'PERMISSION_DENIED') {
      return new PlatformApiError(platform, 'permission_denied', message, detail);
    }
    if (res.status >= 500 || status === 'UNAVAILABLE' || status === 'INTERNAL') {
      return new PlatformApiError(platform, 'transient', message, detail);
    }
  }

  // Sınıflandırılamayan 4xx'ler kalıcı sayılır: tekrar denemek aynı sonucu verir
  // ve kotayı boşa harcar.
  return new PlatformApiError(platform, 'permanent', message, detail);
}

/**
 * Google hata gövdesinden teşhis edilebilir parçaları çıkarır.
 *
 * Yapı:
 *   error.details[].errors[].errorCode = { <kategori>: <KOD> }
 *   error.details[].errors[].message   = insan okunur açıklama
 *   error.details[].requestId          = Google desteğiyle konuşurken referans
 *
 * `errorCode` TEK ANAHTARLI bir nesne ve anahtarın adı kategoriyi veriyor
 * (`queryError`, `requestError`, `authorizationError`…). Sabit bir anahtar
 * aramak yerine ilk girdiyi okuyoruz: kategori listesi uzun ve sürümle
 * değişiyor.
 *
 * İLK İKİ HATAYLA SINIRLI. Google tek yanıtta onlarca hata döndürebiliyor ve
 * hepsini `sync_jobs.error_message` içine yazmak sütunu taşırır; ilk ikisi
 * hemen her zaman aynı kök sebebi anlatıyor.
 */
function googleErrorParts(err: Record<string, unknown>): string[] {
  const details = err.details;
  if (!Array.isArray(details)) return [];

  const out: string[] = [];
  let requestId: string | undefined;

  for (const detail of details) {
    if (typeof detail !== 'object' || detail === null) continue;
    const d = detail as Record<string, unknown>;
    if (typeof d.requestId === 'string') requestId = d.requestId;

    const errors = d.errors;
    if (!Array.isArray(errors)) continue;

    for (const entry of errors.slice(0, 2)) {
      if (typeof entry !== 'object' || entry === null) continue;
      const e = entry as Record<string, unknown>;

      const codeObj = e.errorCode;
      if (typeof codeObj === 'object' && codeObj !== null) {
        const [category, value] = Object.entries(codeObj as Record<string, unknown>)[0] ?? [];
        if (category && value !== undefined) out.push(`${category}=${String(value)}`);
      }
      if (typeof e.message === 'string' && e.message.length > 0) {
        out.push(e.message.slice(0, 300));
      }
    }
  }

  // requestId EN SONA: Google desteğine yazarken gereken tek referans ama
  // mesajın başında yer kaplaması teşhisi zorlaştırırdı.
  if (requestId) out.push(`requestId=${requestId}`);
  return out;
}

/**
 * Meta'nın `X-Business-Use-Case-Usage` header'ını okur.
 *
 * Format: {"<ad_account_id>":[{"type":"ads_management","call_count":12,
 * "total_cputime":8,"total_time":5,"estimated_time_to_regain_access":0}]}
 *
 * Üç yüzdenin EN YÜKSEĞİ belirleyicidir — biri %100'e ulaşınca hesap bloklanır.
 */
export function parseMetaRateLimit(headers: Headers): RateLimitSnapshot | undefined {
  const raw = headers.get('x-business-use-case-usage') ?? headers.get('x-app-usage');
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // x-app-usage düz bir nesne, x-business-use-case-usage hesap→dizi eşlemesi.
    const entry = Array.isArray(Object.values(parsed)[0])
      ? ((Object.values(parsed)[0] as Record<string, number>[])[0] ?? {})
      : (parsed as unknown as Record<string, number>);

    const callCountPct = Number(entry.call_count ?? 0);
    const cpuTimePct = Number(entry.total_cputime ?? 0);
    const totalTimePct = Number(entry.total_time ?? 0);
    const regain = Number(entry.estimated_time_to_regain_access ?? 0);

    return {
      callCountPct,
      cpuTimePct,
      totalTimePct,
      usagePercent: Math.max(callCountPct, cpuTimePct, totalTimePct),
      retryAfterSeconds: regain > 0 ? regain * 60 : undefined,
      observedAt: new Date().toISOString(),
    };
  } catch {
    return undefined;
  }
}
