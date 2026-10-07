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
 * Varlık önizleme adresi. API `previewUrl`i GÖRELİ veriyor
 * (`/assets/<id>/preview`) ve önüne `API_URL` eklenmeden kullanılınca istek
 * panelin kendi adresine gidip 404 dönüyor. Logo sekmesi ve AI asistanın ek
 * kutusu tam olarak bunu yapıyordu: logo yüklü ve seçili görünüyor, kutuda
 * "Görsel yok" yazıyordu (canlı tur, 2026-10-06). Hata yok, yalnızca boş kutu.
 */
export function onizlemeAdresi(previewUrl: string): string {
  return /^https?:\/\//.test(previewUrl) ? previewUrl : `${API_URL}${previewUrl}`;
}

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
  /**
   * Kapı retleri (Pilot 409: `{ message, retler: [{ kod, mesaj }] }`). Ret
   * birden çok nedenle olabiliyor ve hepsi bir kerede görünmeli; yalnız
   * başlığı göstermek kullanıcıyı neden neden tek tek deneyerek bulmaya
   * gönderirdi.
   */
  retler?: Array<{ kod: string; mesaj: string }>;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly fieldErrors?: Array<{ field: string; message: string }>,
    readonly retler?: Array<{ kod: string; mesaj: string }>,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.ok) {
    if (res.status === 204) return undefined as T;

    /*
     * BOŞ GÖVDE JSON DEĞİL — VE 204 TEK YOLU DEĞİL.
     *
     * NestJS bir uç `null` döndürdüğünde gövdeyi BOŞ bırakıyor ve durum
     * kodu 200 kalıyor. `res.json()` o gövdede "Unexpected end of JSON
     * input" fırlatıyor ve hata, uç noktanın düştüğü sanılacak biçimde
     * ekrana çıkıyor — canlıda tam olarak bu oldu: "E-posta ayarları
     * alınamadı: Unexpected end of JSON input", oysa yanıt BAŞARILIYDI ve
     * anlamı "henüz ayar yok" idi.
     *
     * `null` dönebilen her uç bu tuzağa açıktı. Gövde önce metin olarak
     * okunuyor; boşsa `undefined` dönüyor.
     */
    const metin = await res.text();
    if (metin.length === 0) return undefined as T;
    return JSON.parse(metin) as T;
  }

  let body: ApiError | null = null;
  try {
    body = (await res.json()) as ApiError;
  } catch {
    /* gövde JSON değilse yut */
  }

  throw new ApiRequestError(
    mesajaKodEkle(
      alanHatalariniEkle(body?.message ?? `İstek başarısız (${res.status})`, body?.errors),
      res.status,
      body?.requestId,
    ),
    res.status,
    body?.code ?? 'UNKNOWN',
    body?.errors,
    Array.isArray(body?.retler) ? body.retler.filter((r) => typeof r?.mesaj === 'string') : undefined,
  );
}

/**
 * ═══ DOĞRULAMA HATASI HANGİ ALANIN NEDEN REDDEDİLDİĞİNİ SÖYLÜYOR ═══
 *
 * Sunucu her doğrulama hatasında alan listesini (`errors`) dönüyordu ama
 * ekranlar yalnızca başlığı gösteriyordu: rapor maili "Doğrulama hatası"
 * deyip kaldı ve kullanıcı alıcı mı, konu mu, tarih mi olduğunu göremedi
 * (2026-10-06). Şemanın kendi yorumu "Zod hatası hangi elemanın bozuk
 * olduğunu söylüyor" diyordu — söylüyordu, ekrana ulaşmıyordu.
 *
 * TEK YERDE: mesajı gösteren her ekran kendiliğinden taşıyor. Alanların
 * altında ayrıca gösteren ekran (giriş formu) `fieldErrors`ı okumaya devam
 * ediyor. Alan adı tanınmıyorsa ham hâliyle yazılıyor — hiç yazmamaktan iyi.
 */
const ALAN_ETIKETLERI: Record<string, string> = {
  to_emails: 'Alıcı',
  subject: 'Konu',
  html: 'Mail metni',
  from: 'Başlangıç tarihi',
  to: 'Bitiş tarihi',
  clientId: 'Workspace',
  templateId: 'Şablon',
  sablon: 'Şablon',
  expiresInDays: 'Geçerlilik süresi',
};

function alanEtiketi(alan: string): string {
  const [kok, sira] = alan.split('.');
  const etiket = ALAN_ETIKETLERI[kok ?? ''] ?? alan;
  // Dizi elemanı: "to_emails.1" → "Alıcı 2" (kullanıcı birden sayıyor).
  return sira !== undefined && /^\d+$/.test(sira) && etiket !== alan
    ? `${etiket} ${Number(sira) + 1}`
    : etiket;
}

export function alanHatalariniEkle(
  mesaj: string,
  hatalar: Array<{ field: string; message: string }> | undefined,
): string {
  if (!hatalar || hatalar.length === 0) return mesaj;
  const ayrinti = hatalar
    .slice(0, 3)
    .map((h) => (h.field === '_' ? h.message : `${alanEtiketi(h.field)}: ${h.message}`))
    .join(' · ');
  // SESSİZ KESME YOK: üçten fazlaysa kaç tane daha olduğu yazılıyor.
  const kalan = hatalar.length > 3 ? ` · +${hatalar.length - 3} alan daha` : '';
  return `${mesaj}: ${ayrinti}${kalan}`;
}

/**
 * ═══ SUNUCU HATASINDA KISA HATA KODU MESAJA EKLENİYOR ═══
 *
 * Sunucu her hatada `requestId` dönüyor ve log satırı onu taşıyor, ama panel
 * göstermiyordu: kullanıcı yalnızca "Beklenmeyen bir hata oluştu" görüyor,
 * sebebi bulmak için logda saate göre aramak gerekiyordu (raporlar,
 * 2026-10-05). Kod mesaja TEK YERDE ekleniyor: mesajı gösteren her ekran
 * kendiliğinden taşıyor, ekran ekran unutulamıyor.
 *
 * YALNIZCA 5xx: 4xx'in cümlesi zaten ne yapılacağını söylüyor ("bu alan
 * zorunlu") ve kod orada gürültü. İlk 8 karakter logda aramaya yetiyor.
 */
export function mesajaKodEkle(mesaj: string, status: number, requestId: string | undefined): string {
  if (status < 500 || !requestId || requestId === '-') return mesaj;
  return `${mesaj} (hata kodu: ${requestId.slice(0, 8)})`;
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
