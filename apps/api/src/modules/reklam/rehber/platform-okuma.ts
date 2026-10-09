import { paraOndaligi } from '@advetics/shared';
import { hataSiniflandir, metaSurumuDogrula } from '../meta-graf';

/**
 * Rehber hazırlığının SALT OKUNUR platform sorguları (Meta Graph). Hiçbiri
 * yazmıyor, hiçbiri para harcamıyor. Token hiçbir hata mesajına ya da log'a
 * yazılmıyor; adres yalnız graph.facebook.com.
 *
 * Yanıt çözümleyicileri SAF ve ayrı (testte doğrudan sınanıyor): yanlış
 * birim (kuruş/lira) ya da yanlış alan, "asgari bütçe" uyarısını yüz kat
 * kaydırır ve HİÇBİR hata düşmez.
 */

const SURE_MS = 15_000;

async function grafGet(apiSurumu: string, yol: string, token: string, fetchFn: typeof fetch = fetch): Promise<unknown> {
  const adres = `https://graph.facebook.com/${metaSurumuDogrula(apiSurumu)}/${yol}`;
  let res: Response;
  try {
    res = await fetchFn(adres, { headers: { Authorization: `Bearer ${token}` }, redirect: 'manual', signal: AbortSignal.timeout(SURE_MS) });
  } catch {
    throw hataSiniflandir(null, null);
  }
  const metin = await res.text().catch(() => '');
  let veri: unknown = null;
  try {
    veri = metin ? JSON.parse(metin) : null;
  } catch {
    veri = null;
  }
  if (!res.ok) throw hataSiniflandir(res.status, veri);
  return veri;
}

/**
 * `GET /act_X/minimum_budgets` → günlük asgari, micros dizge.
 *
 * BİRİM: Meta tutarı para biriminin EN KÜÇÜK biriminde veriyor (kuruş);
 * micros'a çevirmek 10^(6 − ondalık). Panel turunda bu hesapta 49,34 ₺
 * görüldü (Ö-3: canlıda karşılaştırılacak — ÖLÇÜLMEDİ).
 *
 * ALAN: `min_daily_budget_imp` — gösterim üzerinden ücretlenen reklamın
 * asgarisi (trafik ve form reklamları gösterimle ücretleniyor). Diğer alanlar
 * (`_high_freq`, `_low_freq`, `_video_views`) farklı ücretlendirmenin;
 * en yükseğini almak kullanıcıyı gereksiz yere durdururdu. Meta'nın kendi
 * provası asgarinin altını zaten reddediyor: bu yalnız GİRİŞ ANINDA uyarı.
 *
 * Hesabın para birimine ait satır yoksa ya da değer sayı değilse `null`:
 * bir sayı UYDURULMUYOR.
 */
export function metaAsgariCoz(govde: unknown, paraBirimi: string): string | null {
  const satirlar = (govde as { data?: unknown[] } | null)?.data;
  if (!Array.isArray(satirlar)) return null;
  const s = satirlar.find((x) => (x as { currency?: unknown }).currency === paraBirimi.toUpperCase()) as
    | { min_daily_budget_imp?: unknown }
    | undefined;
  const v = s?.min_daily_budget_imp;
  const ham = typeof v === 'number' ? (Number.isInteger(v) ? String(v) : null) : typeof v === 'string' ? v.trim() : null;
  if (!ham || !/^\d{1,15}$/.test(ham)) return null;
  return (BigInt(ham) * 10n ** BigInt(6 - paraOndaligi(paraBirimi))).toString();
}

export async function metaAsgariOku(apiSurumu: string, hesap: string, token: string, paraBirimi: string, fetchFn?: typeof fetch): Promise<string | null> {
  if (!/^act_\d+$/.test(hesap)) throw new Error('Reklam hesabı act_ önekli olmalı');
  return metaAsgariCoz(await grafGet(apiSurumu, `${hesap}/minimum_budgets`, token, fetchFn), paraBirimi);
}

/**
 * Sayfada Lead Ads koşulları kabul edilmiş mi. Alan yoksa `null` ("kontrol
 * edemedik"), `false` DEĞİL: alanın gelmemesi iznin olmaması da olabilir ve
 * "kabul edilmemiş" demek kullanıcıyı sağlam bir sayfayı düzeltmeye gönderir.
 */
export function formKosuluCoz(govde: unknown): boolean | null {
  const v = (govde as { leadgen_tos_accepted?: unknown } | null)?.leadgen_tos_accepted;
  return typeof v === 'boolean' ? v : null;
}

export async function metaFormKosuluOku(apiSurumu: string, sayfaPlatformId: string, sayfaTokeni: string, fetchFn?: typeof fetch): Promise<boolean | null> {
  if (!/^\d+$/.test(sayfaPlatformId)) throw new Error('Sayfa kimliği geçersiz');
  return formKosuluCoz(await grafGet(apiSurumu, `${sayfaPlatformId}?fields=leadgen_tos_accepted`, sayfaTokeni, fetchFn));
}
