/**
 * ═══ GOOGLE ARAMA ÖĞELERİ: ARAMA, İŞLETME ADI, LOGO, SNIPPET, PROMOSYON, FİYAT ═══
 *
 * "Siteme gelsinler" ile kurulan ilk canlı Arama kampanyasında (2026-10-12,
 * g-1.1.0) Google Ads arayüzü bu öğelerin HEPSİNİ boş gösterdi ve her biri
 * için "ekleyin" uyarısı verdi. Öğeler reklamı büyütüyor ve tıklanma oranını
 * artırıyor; ama her biri MÜŞTERİ ADINA SÖZ, o yüzden kaynağı olmayan öğe
 * KURULMUYOR ve sebebi ekranda yazıyor (yönetici kararları, 2026-10-12):
 *
 * - ARAMA (CallAsset): workspace telefonu (Marka Merkezi, `clients.contact_
 *   phone`) Arama kurgusunun HER ulaşmasında. Telefon ulaşmasında numara
 *   reklamın kendisi (rehberin `telefon` alanı), burada ikinci kez kurulmaz.
 * - İŞLETME ADI: Marka Merkezi'ndeki marka adı, ≤ 25. KISALTMA UYDURULMAZ:
 *   "Ege Birlik İnş." Google'ın eşleştirmek istediği ad değil.
 * - LOGO (BUSINESS_LOGO): Marka Merkezi logosu, kare (±%1) ve ≥ 128 piksel.
 * - SNIPPET: başlık Google'ın Türkçe KAPALI listesinden, değerler marka
 *   profilindeki "Ürün ve hizmet kategorileri"nden ya da site menüsünden.
 * - PROMOSYON / FİYAT: UYDURULAMAZ; rehberde kullanıcı doldurursa.
 *
 * TEK FONKSİYON (`googleAramaOgeleri`): türetme (gövdeye ne girecek) ve karar
 * tablosu (ekran ne diyecek) AYNI çıktıyı okuyor. İkisi ayrı yazılsaydı ekran
 * "logo eklendi" derken gövde logosuz giderdi.
 *
 * SAF: ağ yok, saat yok. Kaynakları servis okuyor.
 */
import { z } from 'zod';
import { karakterSayisi } from './metin';
import { GOOGLE_ISLETME_ADI_EN_COK, GOOGLE_ORAN_PAYI } from './google-gorsel';

const tarih = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD olmalı');

/**
 * STRUCTURED SNIPPET BAŞLIKLARI — Türkçe çeviriler RESMÎ tablodan
 * (developers.google.com/google-ads/api/reference/data/structured-snippet-
 * headers, "tr" satırı, 2026-10-12 okundu). `header` değeri tablodaki dizeyle
 * BİREBİR eşleşmek zorunda; "destinasyonlar"ın küçük harfi tablodaki hâli.
 * Serbest başlık yazmak yok: liste dışı başlık atomik isteğin TAMAMINI düşürür.
 */
export const GOOGLE_SNIPPET_BASLIKLARI = {
  MARKALAR: 'Markalar',
  OLANAKLAR: 'Sunulan olanaklar',
  STILLER: 'Stiller',
  TURLER: 'Türler',
  DESTINASYONLAR: 'destinasyonlar',
  HIZMETLER: 'Hizmetler',
  KURSLAR: 'Kurslar',
  MAHALLELER: 'Mahalleler',
  PROGRAMLAR: 'Programlar',
  SIGORTA: 'Sigorta kapsamı',
  LISANS: 'Lisans programları',
  OTELLER: 'Öne çıkan oteller',
  MODELLER: 'Modeller',
} as const;
export type GoogleSnippetBasligi = (typeof GOOGLE_SNIPPET_BASLIKLARI)[keyof typeof GOOGLE_SNIPPET_BASLIKLARI];

/** v25 `StructuredSnippetAsset.values`: 3-10 değer, her biri 1-25 karakter. */
export const SNIPPET_EN_AZ = 3;
export const SNIPPET_EN_COK = 10;
export const SNIPPET_DEGER_SINIRI = 25;
/** v25 `PriceAsset.price_offerings`: 3-8 kalem; `PriceOffering.header/description` 1-25. */
export const FIYAT_EN_AZ = 3;
export const FIYAT_EN_COK = 8;
export const FIYAT_METIN_SINIRI = 25;
/**
 * PROMOSYON HEDEFİ: v25 başvurusu sınır YAZMIYOR; Google Ads arayüzü "Öğe"
 * alanını 20 karakterle sınırlıyor. DAR olanı seçildi ve canlı ölçüm
 * listesinde: API daha uzununu kabul etse bile 20, reddederse atomik
 * istek düşerdi.
 */
export const PROMOSYON_HEDEF_SINIRI = 20;
/** Logo: Google'ın Arama işletme logosu kuralı (kare, en az 128×128). */
export const LOGO_EN_AZ = 128;

/** Rehberde kullanıcının doldurduğu promosyon (İSTEĞE BAĞLI). */
export const rehberPromosyonSchema = z.object({
  /** Ne üzerine: "Tüm daireler", "Yaz koleksiyonu". */
  hedef: z.string().max(80),
  indirim: z.discriminatedUnion('tur', [
    z.object({ tur: z.literal('yuzde'), yuzde: z.number().int().min(1).max(99) }),
    /** micros DİZGE (para kuralı). */
    z.object({ tur: z.literal('tutar'), micros: z.string().regex(/^\d{1,18}$/) }),
  ]),
  baslangic: tarih.nullable(),
  /** ZORUNLU: süresiz promosyon, kampanya bittiğinde de "%20 indirim" der. */
  bitis: tarih.nullable(),
});
export type RehberPromosyon = z.infer<typeof rehberPromosyonSchema>;

export const FIYAT_TURLERI = ['SERVICES', 'PRODUCT_CATEGORIES'] as const;
export const FIYAT_TURU_ETIKETI: Record<(typeof FIYAT_TURLERI)[number], string> = { SERVICES: 'Hizmetler', PRODUCT_CATEGORIES: 'Ürünler' };

export const rehberFiyatListesiSchema = z.object({
  tur: z.enum(FIYAT_TURLERI),
  kalemler: z
    .array(z.object({ baslik: z.string().max(80), aciklama: z.string().max(80), micros: z.string().regex(/^\d{1,18}$/) }))
    .max(FIYAT_EN_COK),
});
export type RehberFiyatListesi = z.infer<typeof rehberFiyatListesiSchema>;

/** Promosyonun girişteki sorunu; yoksa `null`. Eksik listesi ve öğe seçimi AYNI fonksiyon. */
export function promosyonSorunu(p: RehberPromosyon): string | null {
  const h = p.hedef.trim();
  if (!h) return 'Kampanyanın neyi kapsadığını yaz';
  if (karakterSayisi(h) > PROMOSYON_HEDEF_SINIRI) return `Kampanya konusu en çok ${PROMOSYON_HEDEF_SINIRI} karakter`;
  if (p.indirim.tur === 'tutar' && BigInt(p.indirim.micros) <= 0n) return 'İndirim tutarı sıfırdan büyük olmalı';
  if (!p.bitis) return 'Kampanyanın bitiş tarihini yaz; süresiz indirim kampanya bitince de reklamda kalır';
  if (p.baslangic && p.baslangic > p.bitis) return 'Kampanya bitişi başlangıçtan önce';
  return null;
}

/** Fiyat listesinin girişteki sorunu; yoksa `null`. */
export function fiyatSorunu(f: RehberFiyatListesi): string | null {
  const dolu = f.kalemler.filter((k) => k.baslik.trim() || k.aciklama.trim());
  if (dolu.length < FIYAT_EN_AZ) return `Fiyat listesi en az ${FIYAT_EN_AZ} kalem ister`;
  for (const k of dolu) {
    if (!k.baslik.trim() || !k.aciklama.trim()) return 'Her kalemin adı ve kısa açıklaması olmalı';
    if (karakterSayisi(k.baslik.trim()) > FIYAT_METIN_SINIRI || karakterSayisi(k.aciklama.trim()) > FIYAT_METIN_SINIRI) {
      return `Kalem adı ve açıklaması en çok ${FIYAT_METIN_SINIRI} karakter`;
    }
    if (BigInt(k.micros) <= 0n) return `"${k.baslik.trim()}" için fiyat yaz`;
  }
  const adlar = new Set(dolu.map((k) => k.baslik.trim().toLocaleLowerCase('tr-TR')));
  if (adlar.size < dolu.length) return 'Aynı kalem iki kez yazılmış';
  return null;
}

/**
 * Serbest yazılmış Türkiye numarası → E.164 (`+90` + 10 hane). Marka
 * Merkezi'ndeki telefon serbest metin ("0232 444 75 09", "+90 532 …").
 * Türetilemeyen numara (444'lü kısa hat, yabancı numara, eksik hane) `null`:
 * ülke kodu TAHMİN EDİLMİYOR (`aramaOgesiTelefonu`) ve 444 hattı Google'ın
 * ulusal biçim kuralına uymuyor.
 */
export function aramaOgesiE164(ham: string | null | undefined): string | null {
  if (!ham) return null;
  const r = ham.replace(/[^\d+]/g, '');
  let d: string | null = null;
  if (/^\+90\d{10}$/.test(r)) d = r.slice(3);
  else if (/^0090\d{10}$/.test(r)) d = r.slice(4);
  else if (/^90\d{10}$/.test(r)) d = r.slice(2);
  else if (/^0\d{10}$/.test(r)) d = r.slice(1);
  else if (/^\d{10}$/.test(r)) d = r;
  // Ulusal anlamlı numara 2xx-5xx (sabit, mobil) ile başlar; 444/850 gibi
  // ayrı tarife hatlarının ulusal biçimi farklı, tahmin edilmiyor.
  if (!d || !/^[2-5]/.test(d)) return null;
  return `+90${d}`;
}

/**
 * Site menüsünde HİZMET olmayan bağlantılar. Snippet değeri "Hizmetler:
 * Kurumsal, Haberler, İletişim" olursa Google başlıkla değer uyuşmazlığından
 * reddeder ve reklamda yalan bir liste görünürdü. Kapalı bir kara liste
 * değil, çıkarma listesi: kalan en az üç değer yoksa öğe kurulmuyor.
 */
const GENEL_MENU = /^(ana ?sayfa|anasayfa|home|kurumsal|hakk[ıi]m[ıi]zda|hakk[ıi]nda|biz kimiz|ileti[şs]im|bize ula[şs][ıi]n|haberler|duyurular|blog|galeri|foto[ğg]raflar|videolar|referanslar|kariyer|insan kaynaklar[ıi]|sss|s[ıi]k sorulan sorular|giri[şs]|[üu]ye ol|sepet|kvkk|gizlilik.*|[çc]erez.*|e-?b[üu]lten|bas[ıi]nda biz|katalog|devam eden projeler|tamamlanan projeler|projeler|projelerimiz|ekibimiz|vizyon.*|misyon.*)$/i;

export interface GoogleOgeKaynagi {
  ulasma: 'site' | 'telefon' | null;
  /** `clients.contact_phone` (serbest metin). */
  workspaceTelefonu: string | null;
  /** `client_profiles.marka_adi` — workspace adı DEĞİL (o çoğu zaman proje adı). */
  markaAdi: string | null;
  logo: { varlikId: string; genislik: number | null; yukseklik: number | null } | null;
  urunKategorileri: readonly string[];
  /** Site menüsündeki bağlantı metinleri (site okunduysa); `null` = okunmadı. */
  menuMetinleri: readonly string[] | null;
  promosyon: RehberPromosyon | null;
  fiyatListesi: RehberFiyatListesi | null;
  /**
   * Google provası öğeleri reddettiyse sebebi: kurulum öğesiz yeniden prova
   * edildi. Bütün isteğe bağlı öğeler "eklenmedi: Google reddetti" olur.
   */
  googleReddi?: string | null;
}

export type GoogleOgeKodu = 'ARAMA' | 'ISLETME_ADI' | 'LOGO' | 'SNIPPET' | 'PROMOSYON' | 'FIYAT';

export const GOOGLE_OGE_ADLARI: Record<GoogleOgeKodu, string> = {
  ARAMA: 'Aramalar',
  ISLETME_ADI: 'İşletme adı',
  LOGO: 'İşletme logosu',
  SNIPPET: 'Ek açıklamalı snippet',
  PROMOSYON: 'Promosyon',
  FIYAT: 'Fiyatlar',
};

export interface GoogleOgeDurumu {
  kod: GoogleOgeKodu;
  eklendi: boolean;
  /** Eklendiyse ne eklendiği (ekranda), eklenmediyse SEBEBİ. */
  metin: string;
}

export interface GooglePromosyonOgesi {
  hedef: string;
  yuzdeMicros: string | null;
  tutarMicros: string | null;
  baslangic: string | null;
  bitis: string;
}

export interface GoogleFiyatOgesi {
  tur: (typeof FIYAT_TURLERI)[number];
  kalemler: Array<{ baslik: string; aciklama: string; micros: string }>;
}

/** Derleyiciye giden öğeler. `null` = o öğe KURULMAZ. */
export interface GoogleAramaOgeleri {
  /** Site ulaşmasında arama öğesi (E.164). Telefon ulaşmasında `null`: numara reklamın kendisi. */
  telefon: string | null;
  isletmeAdi: string | null;
  logoVarlikId: string | null;
  snippet: { baslik: GoogleSnippetBasligi; degerler: string[] } | null;
  promosyon: GooglePromosyonOgesi | null;
  fiyat: GoogleFiyatOgesi | null;
}

export const BOS_ARAMA_OGELERI: GoogleAramaOgeleri = { telefon: null, isletmeAdi: null, logoVarlikId: null, snippet: null, promosyon: null, fiyat: null };

function tekil(xs: readonly string[]): { degerler: string[]; uzun: number } {
  const gorulen = new Set<string>();
  const degerler: string[] = [];
  let uzun = 0;
  for (const ham of xs) {
    const v = ham.replace(/\s+/g, ' ').trim();
    if (!v) continue;
    if (karakterSayisi(v) > SNIPPET_DEGER_SINIRI) {
      uzun++;
      continue;
    }
    const k = v.toLocaleLowerCase('tr-TR');
    if (gorulen.has(k)) continue;
    gorulen.add(k);
    degerler.push(v);
  }
  return { degerler, uzun };
}

/**
 * Kaynaktan öğeler ve her öğenin ekrandaki satırı. Öğe ya kurulur ya da
 * SEBEBİYLE kurulmaz; üçüncü hâl yok.
 */
export function googleAramaOgeleri(k: GoogleOgeKaynagi): { ogeler: GoogleAramaOgeleri; durumlar: GoogleOgeDurumu[] } {
  const ogeler: GoogleAramaOgeleri = { ...BOS_ARAMA_OGELERI };
  const durumlar: GoogleOgeDurumu[] = [];
  const yok = (kod: GoogleOgeKodu, metin: string) => durumlar.push({ kod, eklendi: false, metin });
  const var_ = (kod: GoogleOgeKodu, metin: string) => durumlar.push({ kod, eklendi: true, metin });
  const red = k.googleReddi ? `Google reddetti (${k.googleReddi}); reklam bu öğe olmadan kuruldu` : null;

  // ── Aramalar ──
  if (k.ulasma === 'telefon') var_('ARAMA', 'Reklamın kendi numarası');
  else if (red) yok('ARAMA', red);
  else {
    const tel = aramaOgesiE164(k.workspaceTelefonu);
    if (tel) {
      ogeler.telefon = tel;
      var_('ARAMA', `${tel} (Marka Merkezi)`);
    } else if (k.workspaceTelefonu?.trim()) {
      yok('ARAMA', `Marka Merkezi'ndeki numara (${k.workspaceTelefonu.trim().slice(0, 20)}) Türkiye sabit ya da cep numarası olarak okunamadı`);
    } else yok('ARAMA', "Marka Merkezi'nde telefon yok");
  }

  // ── İşletme adı ──
  const ad = k.markaAdi?.replace(/\s+/g, ' ').trim() ?? '';
  if (red) yok('ISLETME_ADI', red);
  else if (!ad) yok('ISLETME_ADI', "Marka Merkezi'nde marka adı yok");
  else if (karakterSayisi(ad) > GOOGLE_ISLETME_ADI_EN_COK) {
    yok('ISLETME_ADI', `"${ad}" ${GOOGLE_ISLETME_ADI_EN_COK} karakteri aşıyor; kısaltma uydurmuyoruz, Marka Merkezi'nde kısa marka adını yaz`);
  } else {
    ogeler.isletmeAdi = ad;
    var_('ISLETME_ADI', `${ad} · Google bu adın sitenle ya da doğrulanmış reklamveren adınla eşleşmesini ister`);
  }

  // ── Logo ──
  if (red) yok('LOGO', red);
  else if (!k.logo) yok('LOGO', "Marka Merkezi'nde logo yok");
  else if (!k.logo.genislik || !k.logo.yukseklik) yok('LOGO', 'Logonun boyutu okunamadı; logoyu yeniden yükle');
  else if (Math.abs(k.logo.genislik / k.logo.yukseklik - 1) > GOOGLE_ORAN_PAYI) {
    yok('LOGO', `Logo kare değil (${k.logo.genislik}×${k.logo.yukseklik}); Google Arama'da kare logo istiyor`);
  } else if (k.logo.genislik < LOGO_EN_AZ) {
    yok('LOGO', `Logo çok küçük (${k.logo.genislik}×${k.logo.yukseklik}); en az ${LOGO_EN_AZ}×${LOGO_EN_AZ} olmalı`);
  } else {
    ogeler.logoVarlikId = k.logo.varlikId;
    var_('LOGO', `Marka Merkezi logosu (${k.logo.genislik}×${k.logo.yukseklik})`);
  }

  // ── Snippet ── Profil ÖNCE: kullanıcının kendi yazdığı liste.
  if (red) yok('SNIPPET', red);
  else {
    const profil = tekil(k.urunKategorileri);
    // Türkçe küçük harfe ÇEVİRİP sına: `/i` bayrağı "İ"yi "i" saymıyor ve
    // "İletişim" hizmet diye snippet'e giriyordu (testte yakalandı).
    const menu = k.menuMetinleri ? tekil(k.menuMetinleri.filter((x) => !GENEL_MENU.test(x.trim().toLocaleLowerCase('tr-TR')))) : null;
    if (profil.degerler.length >= SNIPPET_EN_AZ) {
      ogeler.snippet = { baslik: GOOGLE_SNIPPET_BASLIKLARI.TURLER, degerler: profil.degerler.slice(0, SNIPPET_EN_COK) };
      var_('SNIPPET', `Türler: ${ogeler.snippet.degerler.join(', ')} (Marka Merkezi)`);
    } else if (menu && menu.degerler.length >= SNIPPET_EN_AZ) {
      ogeler.snippet = { baslik: GOOGLE_SNIPPET_BASLIKLARI.HIZMETLER, degerler: menu.degerler.slice(0, SNIPPET_EN_COK) };
      var_('SNIPPET', `Hizmetler: ${ogeler.snippet.degerler.join(', ')} (site menüsü)`);
    } else {
      const uzun = profil.uzun ? `; ${profil.uzun} kategori ${SNIPPET_DEGER_SINIRI} karakteri aştığı için alınmadı` : '';
      yok(
        'SNIPPET',
        `En az ${SNIPPET_EN_AZ} kalem gerekiyor: Marka Merkezi'nde ${profil.degerler.length} ürün/hizmet kategorisi var${menu ? `, site menüsünde ${menu.degerler.length} hizmet` : ''}${uzun}`,
      );
    }
  }

  // ── Promosyon ──
  if (!k.promosyon) yok('PROMOSYON', 'Kampanya bilgisi verilmedi');
  else if (red) yok('PROMOSYON', red);
  else {
    const s = promosyonSorunu(k.promosyon);
    if (s) yok('PROMOSYON', s);
    else {
      const p = k.promosyon;
      ogeler.promosyon = {
        hedef: p.hedef.trim(),
        // v25: percent_off 1.000.000 = %100.
        yuzdeMicros: p.indirim.tur === 'yuzde' ? String(p.indirim.yuzde * 10_000) : null,
        tutarMicros: p.indirim.tur === 'tutar' ? p.indirim.micros : null,
        baslangic: p.baslangic,
        bitis: p.bitis!,
      };
      var_('PROMOSYON', `${ogeler.promosyon.hedef} · ${p.bitis} tarihine kadar`);
    }
  }

  // ── Fiyat ──
  if (!k.fiyatListesi) yok('FIYAT', 'Fiyat listesi verilmedi');
  else if (red) yok('FIYAT', red);
  else {
    const s = fiyatSorunu(k.fiyatListesi);
    if (s) yok('FIYAT', s);
    else {
      const kalemler = k.fiyatListesi.kalemler
        .filter((x) => x.baslik.trim() || x.aciklama.trim())
        .map((x) => ({ baslik: x.baslik.trim(), aciklama: x.aciklama.trim(), micros: x.micros }));
      ogeler.fiyat = { tur: k.fiyatListesi.tur, kalemler };
      var_('FIYAT', `${kalemler.length} kalem: ${kalemler.map((x) => x.baslik).join(', ')}`);
    }
  }
  return { ogeler, durumlar };
}

/** Öğe satırının ekrandaki cümlesi (karar tablosu ve prova notu aynı yerden). */
export function ogeDurumuCumlesi(d: GoogleOgeDurumu): string {
  return `${GOOGLE_OGE_ADLARI[d.kod]}: ${d.eklendi ? 'eklendi' : 'eklenmedi'} · ${d.metin}`;
}
