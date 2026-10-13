import { META_SORU_ETIKETLERI, paraOndaligi, type FormOnizlemeBolumu, type FormOnizlemesi, type FormOnizlemeSorusu, type SeciliFormHali, type SeciliPikselHali } from '@advetics/shared';
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
  /** `is_optimized_for_quality` okunduysa tür; okunmadıysa `null` (tahmin yok). */
  tur?: 'more_volume' | 'higher_intent' | null;
  /** `questions` okunduysa soru sayısı; okunmadıysa `null`. */
  soruSayisi?: number | null;
}

/**
 * Form listesinde istenen alanlar. Tür ve soru sayısı onay ekranında yazılır
 * (karar tablosu "Form" satırı). Bu iki alanın liste ucunda dönüşü CANLIDA
 * ÖLÇÜLMEDİ: Graph tek geçersiz alanda isteğin TAMAMINI düşürüyor ve o
 * zaman form seçici boş kalırdı. Ret görülürse liste ESKİ alanlarla yeniden
 * istenir (`alanReddiMi`); tür ve soru sayısı o zaman "okunamadı" olur.
 */
export const FORM_LISTE_ALANLARI = 'id,name,status,privacy_policy_url,is_optimized_for_quality,questions';
export const FORM_LISTE_TEMEL_ALANLARI = 'id,name,status,privacy_policy_url';

/** Graph'in "bu düğümde böyle alan yok" reddi (#100). */
export function alanReddiMi(err: unknown): boolean {
  const m = err instanceof Error ? err.message : String(err);
  return /nonexisting field|unknown field/i.test(m);
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
    const f = ham as { id?: unknown; name?: unknown; status?: unknown; privacy_policy_url?: unknown; is_optimized_for_quality?: unknown; questions?: unknown };
    if (typeof f.id !== 'string' || !/^\d+$/.test(f.id)) continue;
    if (f.status !== 'ACTIVE') continue;
    const ad = typeof f.name === 'string' && f.name.trim() ? f.name.trim() : `Form ${f.id}`;
    const adres = typeof f.privacy_policy_url === 'string' && /^https?:\/\/\S+$/i.test(f.privacy_policy_url.trim()) ? f.privacy_policy_url.trim() : null;
    // Tür YALNIZ alan döndüyse: dönmeyen alan "daha fazla hacim" DEĞİL, bilinmiyor.
    const tur = f.is_optimized_for_quality === true || f.is_optimized_for_quality === 'true'
      ? 'higher_intent'
      : f.is_optimized_for_quality === false || f.is_optimized_for_quality === 'false'
        ? 'more_volume'
        : null;
    const sorular = Array.isArray(f.questions) ? f.questions : Array.isArray((f.questions as { data?: unknown } | undefined)?.data) ? (f.questions as { data: unknown[] }).data : null;
    satirlar.push({ id: f.id, ad, gizlilikAdresi: adres, tur, soruSayisi: sorular ? sorular.length : null });
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
  let alanlar = FORM_LISTE_ALANLARI;
  for (let i = 0; i < FORM_SAYFA_SINIRI; i++) {
    const yol = (f: string) => `${sayfaPlatformId}/leadgen_forms?fields=${f}&limit=100${imlec ? `&after=${encodeURIComponent(imlec)}` : ''}`;
    let govde: unknown;
    try {
      govde = await grafGet(apiSurumu, yol(alanlar), sayfaTokeni, fetchFn);
    } catch (e) {
      // Ek alanlar reddedildiyse liste yine gelsin; başka her hata yukarı.
      if (alanlar === FORM_LISTE_TEMEL_ALANLARI || !alanReddiMi(e)) throw e;
      alanlar = FORM_LISTE_TEMEL_ALANLARI;
      govde = await grafGet(apiSurumu, yol(alanlar), sayfaTokeni, fetchFn);
    }
    const s = metaFormlariCoz(govde);
    satirlar.push(...s.satirlar);
    imlec = s.sonraki;
    if (!imlec) return { satirlar, kesildi: false };
  }
  return { satirlar, kesildi: true };
}

/**
 * Tek formun önizleme alanları (`GET /{form-id}`). Alan adları Meta'nın
 * resmî iş SDK'sının (Graph şemasından ÜRETİLEN `LeadgenForm`,
 * `LeadGenQuestion`, `LeadGenContextCard`, `LeadGenThankYouPage`,
 * `LeadGenQuestionOption`) alan listesinden doğrulandı; CANLIDA ÖLÇÜLMEDİ.
 * İç içe tek bir alan reddedilirse istek BÜTÜNÜYLE düşer ve panel Meta'nın
 * mesajını gösterir (sessizce eksik önizleme çizilmez).
 *
 * `legal_content` (onay kutuları) İSTENMİYOR: alt alanları SDK'da ayrı bir
 * tür ve doğrulanmadı; onu tahminle istemek bütün önizlemeyi düşürebilirdi.
 * Önizleme onay kutularını "okunmadı" diye yazıyor. `cover_photo` da yok:
 * Meta'nın görsel adresi imzalı ve ölüyor (CLAUDE.md), önizleme için ayrıca
 * indirmek gerekirdi.
 */
export const META_FORM_AYRINTI_ALANLARI =
  'id,name,status,locale,page_id,privacy_policy_url,question_page_custom_headline,' +
  'questions{key,label,type,options{key,value}},' +
  'context_card{title,style,content,button_text},' +
  'thank_you_page{title,body,button_text,button_type,website_url}';

const metin = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const adres = (v: unknown): string | null => {
  const m = metin(v);
  return m && /^https?:\/\/\S+$/i.test(m) ? m : null;
};

/**
 * Meta form yanıtı → ortak önizleme biçimi. SAF (testte doğrudan sınanıyor).
 *
 * "Formda yok" ile "okunamadı" ayrı: `context_card` gelmezse form giriş
 * ekranı OLMADAN kurulmuş demektir (Meta'da isteğe bağlı). Ama sorular,
 * gizlilik adresi ve teşekkür ekranı Meta'da her formda VAR; gelmezlerse
 * `okunamayanlar`a yazılır ve önizleme boş ekran çizmek yerine bunu söyler.
 */
export function metaFormAyrintisiCoz(govde: unknown): FormOnizlemesi & { sayfaPlatformId: string | null } {
  const g = (govde ?? {}) as Record<string, unknown>;
  const okunamayanlar: FormOnizlemeBolumu[] = [];

  const sorular: FormOnizlemeSorusu[] = [];
  if (Array.isArray(g.questions)) {
    for (const ham of g.questions) {
      const q = (ham ?? {}) as { type?: unknown; label?: unknown; options?: unknown };
      const tur = metin(q.type) ?? 'BILINMIYOR';
      const secenekler = Array.isArray(q.options)
        ? q.options.map((o) => metin((o as { value?: unknown })?.value)).filter((x): x is string => x !== null)
        : [];
      // CUSTOM sorunun etiketi Meta'nın; standart soruda Türkçe ad önce
      // (Meta etiketi formun diline göre İngilizce gelebiliyor).
      const etiket = tur !== 'CUSTOM' && META_SORU_ETIKETLERI[tur] ? META_SORU_ETIKETLERI[tur] : (metin(q.label) ?? tur);
      sorular.push({ tur, etiket, otomatikDolu: tur in META_SORU_ETIKETLERI, secenekler });
    }
  } else okunamayanlar.push('sorular');

  const gizlilikAdresi = adres(g.privacy_policy_url);
  if (!gizlilikAdresi) okunamayanlar.push('gizlilik');

  const kart = g.context_card && typeof g.context_card === 'object' ? (g.context_card as Record<string, unknown>) : null;
  const giris = kart
    ? {
        baslik: metin(kart.title),
        maddeler: Array.isArray(kart.content) ? kart.content.map(metin).filter((x): x is string => x !== null) : [],
        dugme: metin(kart.button_text),
      }
    : null;

  const ty = g.thank_you_page && typeof g.thank_you_page === 'object' ? (g.thank_you_page as Record<string, unknown>) : null;
  const tesekkur = ty
    ? { baslik: metin(ty.title), metin: metin(ty.body), dugme: metin(ty.button_text), adres: adres(ty.website_url) }
    : null;
  if (!tesekkur) okunamayanlar.push('tesekkur');

  return {
    kaynak: 'meta',
    ad: metin(g.name) ?? (metin(g.id) ? `Form ${metin(g.id)}` : 'Adsız form'),
    durum: metin(g.status),
    giris,
    soruBasligi: metin(g.question_page_custom_headline),
    sorular,
    // Bağlantı METNİ `legal_content` altında; istenmediği için `null` (uydurulmuyor).
    gizlilik: gizlilikAdresi ? { adres: gizlilikAdresi, metin: null } : null,
    onaylar: null,
    tesekkur,
    okunamayanlar,
    sayfaPlatformId: metin(g.page_id),
  };
}

/** Tek formun ayrıntısı, SAYFA TOKEN'IYLA (form sayfanın altında yaşıyor). */
export async function metaFormAyrintisiOku(
  apiSurumu: string,
  formPlatformId: string,
  sayfaTokeni: string,
  fetchFn?: typeof fetch,
): Promise<FormOnizlemesi & { sayfaPlatformId: string | null }> {
  if (!/^\d{1,30}$/.test(formPlatformId)) throw new Error('Form kimliği geçersiz');
  return metaFormAyrintisiCoz(await grafGet(apiSurumu, `${formPlatformId}?fields=${META_FORM_AYRINTI_ALANLARI}`, sayfaTokeni, fetchFn));
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
  return { ad: f.ad, sayfadaYayinda: true, gizlilikAdresi: f.gizlilikAdresi !== null, tur: f.tur ?? null, soruSayisi: f.soruSayisi ?? null };
}

/** Rehberin piksel okuması (`MetaProvider.fetchAdPixels` satırı, ISO tarihli). */
export interface PikselSatiri {
  id: string;
  ad: string;
  sonCalisma: string | null;
  kullanilamaz: boolean;
  satinAlma7Gun: boolean | null;
  /** Son 7 günün satın alma sayısı; okunamadıysa ya da sorulmadıysa `null`/yok. */
  satinAlma7GunSayisi?: number | null;
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
    satinAlma7GunSayisi: p.satinAlma7GunSayisi ?? null,
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

/**
 * ERİŞİM KİTLE TAHMİNİ (K5) — `GET /act_X/reachestimate?targeting_spec=`.
 *
 * UÇ SEÇİMİ: Meta'nın iki ucu var. `delivery_estimate` bir optimizasyon
 * hedefi ve teslim eğrisi istiyor (bütçeye göre tahmini sonuç); bizim
 * sorumuz daha dar: "bu bölgede KAÇ KİŞİ var". O sorunun belgedeki ucu
 * `reachestimate` (Reach Estimate, `users_lower_bound`/`users_upper_bound`).
 * İlgi alanı büyüklüğü (`audience_size_*`) DÜNYA GENELİ olduğu için
 * kullanılamaz (CLAUDE.md); bu uç hedeflemenin konumuyla daraltıyor.
 * CANLIDA ÖLÇÜLMEDİ: alan adları belgeden; `optimize_for` gönderilmiyor
 * (belgede isteğe bağlı, ölçülmemiş bir parametre okumanın tamamını
 * düşürebilirdi).
 *
 * `estimate_ready: false` ya da sınırlar sayı değilse FIRLATIR: "0 kişi"
 * uydurulmuyor, çağıran "okunamadı" yazar.
 */
export function erisimTahminiCoz(govde: unknown): { alt: number; ust: number } {
  const ham = (govde as { data?: unknown } | null)?.data;
  const d = (Array.isArray(ham) ? ham[0] : ham) as { users_lower_bound?: unknown; users_upper_bound?: unknown; estimate_ready?: unknown } | undefined;
  if (!d || typeof d !== 'object') throw new Error('Meta kitle tahmini boş döndü');
  if (d.estimate_ready === false) throw new Error('Meta kitle tahmini henüz hazır değil');
  const sayi = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && /^\d{1,12}$/.test(v) ? Number(v) : NaN);
  const alt = sayi(d.users_lower_bound);
  const ust = sayi(d.users_upper_bound);
  if (!Number.isInteger(alt) || !Number.isInteger(ust) || alt < 0 || ust < alt) throw new Error('Meta kitle tahmininde kişi sayısı okunamadı');
  return { alt, ust };
}

export async function metaErisimTahminiOku(
  apiSurumu: string,
  hesap: string,
  token: string,
  targeting: Record<string, unknown>,
  fetchFn?: typeof fetch,
): Promise<{ alt: number; ust: number }> {
  if (!/^act_\d+$/.test(hesap)) throw new Error('Reklam hesabı act_ önekli olmalı');
  return erisimTahminiCoz(await grafGet(apiSurumu, `${hesap}/reachestimate?targeting_spec=${encodeURIComponent(JSON.stringify(targeting))}`, token, fetchFn));
}
