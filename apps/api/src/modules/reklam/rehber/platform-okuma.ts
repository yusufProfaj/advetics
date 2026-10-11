import { paraOndaligi, type SeciliFormHali, type SeciliPikselHali } from '@advetics/shared';
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

/** Seçili sayfanın yayında bir anlık formu (rehberin form seçicisi). */
export interface MetaFormSatiri {
  id: string;
  ad: string;
  gizlilikAdresi: string | null;
}

/**
 * Form listesi en çok bu kadar Meta sayfası gezilir (100'er form). Sınıra
 * takılırsa `kesildi`: kullanıcıya "ilk N form" yazılır, sessizce kesilmez.
 */
export const FORM_SAYFA_SINIRI = 5;

/**
 * `GET /{sayfa}/leadgen_forms` sayfası → YAYINDA formlar.
 *
 * YALNIZ `ACTIVE`: Meta taslak (`DRAFT`), arşivlenmiş ve silinmiş formu da
 * listeliyor. Lead senkronizasyonu arşivlenmiş formu BİLEREK tarıyor
 * (geçmiş kayıtları için); reklam için seçmek ise Meta'nın reddedeceği bir
 * kurulum demek. Durumu gelmeyen form da DIŞARIDA: bilinmeyeni "yayında"
 * saymak reddi yayına erteler.
 *
 * GİZLİLİK ADRESİ: alan `privacy_policy_url` (LeadgenForm düğümü; oluşturma
 * parametresi `privacy_policy{url}` ama okunan alan bu). ÖLÇÜLMEDİ, Graph
 * belgesinden — canlı turda bakılacak. Alan reddedilirse liste HATAYLA
 * düşer (panel Meta'nın mesajını gösterir), sessizce boş gelmez.
 */
export function metaFormlariCoz(govde: unknown): { satirlar: MetaFormSatiri[]; sonraki: string | null } {
  const g = govde as { data?: unknown[]; paging?: { cursors?: { after?: unknown }; next?: unknown } } | null;
  const satirlar: MetaFormSatiri[] = [];
  for (const ham of Array.isArray(g?.data) ? g!.data : []) {
    const f = ham as { id?: unknown; name?: unknown; status?: unknown; privacy_policy_url?: unknown };
    if (typeof f.id !== 'string' || !/^\d+$/.test(f.id)) continue;
    if (f.status !== 'ACTIVE') continue;
    const ad = typeof f.name === 'string' && f.name.trim() ? f.name.trim() : `Form ${f.id}`;
    const adres = typeof f.privacy_policy_url === 'string' && /^https?:\/\/\S+$/i.test(f.privacy_policy_url.trim()) ? f.privacy_policy_url.trim() : null;
    satirlar.push({ id: f.id, ad, gizlilikAdresi: adres });
  }
  // `next` yoksa son sayfa; imleç `next` olmadan da gelebiliyor ve onu
  // izlemek boş bir sayfa için fazladan çağrı olurdu.
  const imlec = g?.paging?.cursors?.after;
  const sonraki = typeof g?.paging?.next === 'string' && typeof imlec === 'string' && imlec ? imlec : null;
  return { satirlar, sonraki };
}

/**
 * Sayfanın yayında anlık formları. SAYFA TOKEN'I ZORUNLU: `leadgen_forms`
 * sayfanın altında yaşıyor; kullanıcı token'ıyla "(#200)" dönüyor
 * (`MetaProvider.listPageLeadForms` ile aynı ders).
 *
 * `MetaProvider.listPageLeadForms` kullanılmıyor: o yalnız `id,name,status`
 * istiyor ve lead senkronizasyonunu besliyor. Ona ölçülmemiş bir alan
 * eklemek, alan reddedildiğinde BÜTÜN potansiyel müşteri taramasını
 * düşürürdü; burada düşerse yalnız form seçici "okunamadı" der.
 */
export async function metaSayfaFormlariOku(
  apiSurumu: string,
  sayfaPlatformId: string,
  sayfaTokeni: string,
  fetchFn?: typeof fetch,
): Promise<{ satirlar: MetaFormSatiri[]; kesildi: boolean }> {
  if (!/^\d+$/.test(sayfaPlatformId)) throw new Error('Sayfa kimliği geçersiz');
  const satirlar: MetaFormSatiri[] = [];
  let imlec: string | null = null;
  for (let i = 0; i < FORM_SAYFA_SINIRI; i++) {
    const yol = `${sayfaPlatformId}/leadgen_forms?fields=id,name,status,privacy_policy_url&limit=100${imlec ? `&after=${encodeURIComponent(imlec)}` : ''}`;
    const s = metaFormlariCoz(await grafGet(apiSurumu, yol, sayfaTokeni, fetchFn));
    satirlar.push(...s.satirlar);
    imlec = s.sonraki;
    if (!imlec) return { satirlar, kesildi: false };
  }
  return { satirlar, kesildi: true };
}

/**
 * `fetchPageWhatsapp` → üç hâl. `true` yalnız numara OKUNDUYSA. Boş alan da
 * `null`: `whatsapp_number` belgelenmemiş bir alan ve Meta onu bazı
 * sayfalarda hiç sunmuyor; yokluğunu "hat yok" saymak çalışan bir WhatsApp
 * kurulumunu engellerdi (CLAUDE.md "GÖRÜNMEYEN SATIRI YOK SAYMAK"). Bu yüzden
 * `false` hiç üretilmiyor; hattın gerçekten yokluğunu Meta'nın provası söyler.
 */
export function whatsappHali(r: { number: string | null; hata: string | null }): boolean | null {
  if (r.number && r.number.trim()) return true;
  return null;
}

/**
 * Seçili formun hâli. `liste` = seçili sayfanın son BAŞARILI okunan yayında
 * formları; `null` = okunmadı → `null` (bilinmiyor, uyarı). Form seçilmemişse
 * de `null`: FORM-YOK zaten söylüyor.
 *
 * `kimlik` Meta form kimliği; eski bir UUID çevrilemediyse (`null`) form bu
 * sayfada yayında sayılmaz: Advetics'te yayınlanmamış ya da başka sayfanın.
 */
export function seciliFormHali(deger: string | null, kimlik: string | null, liste: readonly MetaFormSatiri[] | null): SeciliFormHali | null {
  if (!deger || !liste) return null;
  const f = kimlik ? liste.find((x) => x.id === kimlik) : undefined;
  if (!f) return { ad: null, sayfadaYayinda: false, gizlilikAdresi: false };
  return { ad: f.ad, sayfadaYayinda: true, gizlilikAdresi: f.gizlilikAdresi !== null };
}

/** Rehberin piksel okuması (`MetaProvider.fetchAdPixels` satırı, ISO tarihli). */
export interface PikselSatiri {
  id: string;
  ad: string;
  sonCalisma: string | null;
  kullanilamaz: boolean;
  satinAlma7Gun: boolean | null;
}

const YEDI_GUN_MS = 7 * 86_400_000;

/**
 * Seçili pikselin hâli (SATIS). `liste` = seçili HESABIN son BAŞARILI okunan
 * pikselleri; `null` = okunmadı → `null` (bilinmiyor, uyarı; platforma
 * giderken engel). Piksel seçilmemişse de `null`: `M-PIKSEL-SEC` söylüyor.
 *
 * `son7GundeCalisti` OKUMA ANINA göre (`simdi`): tarih çözülemezse `false`
 * değil, yalnız uyarı üreten "son 7 günde değil" sayılıyor. Hiç çalışmamış
 * olmakla karışmıyor; o `sonCalisma === null`.
 */
export function seciliPikselHali(pikselId: string | null, liste: readonly PikselSatiri[] | null, simdi: Date, kesildi = false): SeciliPikselHali | null {
  if (!pikselId || !liste) return null;
  const p = liste.find((x) => x.id === pikselId);
  // Liste sayfa sınırında KESİLDİYSE bulunamamak "hesapta yok" demek değil
  // (Ajan 4, Dalga 3 F6): bilinmiyor say, yanlış engel üretme.
  if (!p && kesildi) return null;
  if (!p) return { ad: null, hesaptaVar: false, kullanilamaz: false, hicCalismadi: false, son7GundeCalisti: false, satinAlma7Gun: null };
  const t = p.sonCalisma ? Date.parse(p.sonCalisma) : NaN;
  return {
    ad: p.ad,
    hesaptaVar: true,
    kullanilamaz: p.kullanilamaz,
    hicCalismadi: p.sonCalisma === null,
    son7GundeCalisti: !Number.isNaN(t) && simdi.getTime() - t <= YEDI_GUN_MS,
    satinAlma7Gun: p.satinAlma7Gun,
  };
}

/**
 * Hazırlıktaki `metaSatisOlcumu` (piksel henüz SEÇİLMEDİ): hesapta hiç
 * kullanılabilir piksel yoksa `false`, TEK kullanılabilir piksel varsa onun
 * satın alma sinyali, birden çoksa `null` (cevap seçime bağlı; birini seçip
 * "ölçülüyor" demek tahmin olurdu).
 */
export function hazirlikSatisOlcumu(liste: readonly PikselSatiri[] | null): boolean | null {
  if (!liste) return null;
  const kullanilir = liste.filter((p) => !p.kullanilamaz);
  if (kullanilir.length === 0) return false;
  return kullanilir.length === 1 ? (kullanilir[0] as PikselSatiri).satinAlma7Gun : null;
}
