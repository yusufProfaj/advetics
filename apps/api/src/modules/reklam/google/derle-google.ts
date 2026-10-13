import {
  GOOGLE_YARICAP_KURGULARI,
  GOOGLE_YARICAP_YOK_MESAJI,
  GOOGLE_ISLETME_ADI_EN_COK,
  GOOGLE_KISA_ACIKLAMA,
  googleGorselOraniMi,
  googleGorselSorunu,
  advKampanyaAdi,
  gunlukEsdeger,
  gorunenYolu,
  METIN_SINIRLARI,
  karakterSayisi,
  paraOndaligi,
  SITE_BAGLANTISI_YOK_CUMLESI,
  GOOGLE_OGE_ADLARI,
  calismaSaatleriOzeti,
  GOOGLE_TELEFON_TEKLIF_CUMLESI,
  googleAramaSaatleri,
  type GoogleSaatPlani,
  type GoogleAramaOgeleri,
  type GoogleDerlemeGirdisi,
  type GorselOlcusu,
  PMAX_HEDEF_CUMLESI,
  DEMAND_GEN_VIDEO_KANALLARI,
  DEMAND_GEN_VIDEO_EN_COK_BASLIK,
  videoUzunBaslik,
  type DemandGenKanali,
} from '@advetics/shared';
import { aramaAtomikIstek, aramaOgesiTelefonu, nameStamp } from '../../connections/providers/google-write';
import {
  DEMAND_GEN_GORSEL_KANALLARI,
  DEMAND_GEN_GORSEL_OTOMASYONU,
  demandGenAtomikIstek,
  demandGenGorselAtomikIstek,
  yakinlikOlcutu,
  yasSegmentleri,
  type GoogleGorselKaynagi,
  type YasSegmenti,
} from '../../connections/providers/google-demandgen';
import { aramaOgeIslemleriEkle } from '../../connections/providers/google-arama-ogeleri';
import {
  PMAX_HEDEF_DEGERI,
  PMAX_OTOMASYONU,
  pmaxAlanSayilari,
  pmaxAtomikIstek,
  pmaxLogoKareMi,
  pmaxTeklifHedefleri,
  type PmaxAlani,
} from '../../connections/providers/google-pmax';

/**
 * ═══ GOOGLE DERLEYİCİSİ (AdvCampaign rehberi) ═══
 *
 * `GoogleDerlemeGirdisi` (shared, `rehberdenGoogle`) → tek atomik
 * `googleAds:mutate` gövdesi + geri okumada beklenecek değerler.
 *
 * YENİ GÖVDE KURUCUSU YOK. Gövdeler `google-write.ts#aramaAtomikIstek` ve
 * `google-demandgen.ts#demandGenAtomikIstek`ten; burada yalnız rehberin
 * girdisi o kuruculara çevriliyor. "Aynı şeyi üreten ikinci fonksiyon doğduğu
 * anda ayrışır" (CLAUDE.md, Meta hedefleme dersi).
 *
 * PROVA VE YAYIN AYNI FONKSİYONDAN: tek fark `validateOnly`. Ayrı bir prova
 * gövdesi, provanın yayının sınamadığı bir şeyi sınaması demek olurdu.
 *
 * SAF: saat dışarıdan (`simdi`), logo dışarıdan (servis önbellekten ya da
 * arşivden okuyor). Platform çağrısı yok.
 */

/** Derlenmiş gövdenin sürümü; prova ve yayın buna bağlanıyor (`prova.derleyici_surumu`). */
// Telefon ulaşması (CallAsset) eklendiğinde sürüm ARTIRILMADI: site
// gövdesi bayt bayt aynı kaldı ve telefon gövdesi daha önce hiç 'gecti'
// provası alamazdı (derleyici yerelde reddediyordu). Artırmak bekleyen bütün
// site provalarını boşuna geçersiz kılardı.
// g-1.1.0: Arama + site'de site bağlantısı ve açıklama metni öğeleri, görünen yol;
// dönüşüm teklifi veri eşiğine bağlı (`googleTeklifKarari`). Site gövdesi
// DEĞİŞTİ: eski provalar uzantısız gövdeyi kanıtlıyordu.
// g-1.2.0: Arama öğeleri (arama her ulaşmada, işletme adı, logo, snippet,
// promosyon, fiyat; `google-ogeler.ts`). Arama gövdesi DEĞİŞTİ: g-1.1.0
// provaları öğesiz gövdeyi kanıtlıyordu.
// g-1.3.0: Arama + telefon'da arama öğesine çalışma saatleri
// (`adScheduleTargets`, Marka Merkezi) ve teklif yalnız reklamdan arama
// dönüşümüyle (`googleTelefonDonusumuMu`). Telefon gövdesi DEĞİŞEBİLİR:
// g-1.2.0 provaları saatsiz öğeyi ve genel dönüşüm eşiğini kanıtlıyordu.
// g-1.4.0: Maks. Performans kampanya dönüşüm hedefleri (yalnız PURCHASE~WEBSITE
// teklife giriyor, `pmaxHedefIslemleri`) ve kare logo kuralı. Maks.
// Performans gövdesi DEĞİŞTİ: g-1.3.0 provaları hedefsiz gövdeyi kanıtlıyordu
// ve o gövde hesabın bütün dönüşümlerine optimize olurdu.
// g-1.5.0: Talep Yaratma VİDEO (VIDEO denetimi): yedi kanal bayrağı shared
// sabitinden (`maps: false` dahil), uzun başlık en uzun başlıktan ve
// açıklamalardan AYRI (`videoUzunBaslik`), kare logo kuralı Talep Yaratma
// video ve görselde de. Video gövdesi DEĞİŞTİ: g-1.4.0 provaları uzun başlığı
// açıklamayla aynı ve haritaları belirsiz gövdeyi kanıtlıyordu.
// g-1.6.0: ERİŞİM turu — Talep Yaratma'da "işletme adresinin çevresi"
// (`proximity`, K4) ve geri okumada konumların KİMLİĞİ ve yaş kitlesi (B12).
// Talep Yaratma gövdesi adres çevresinde DEĞİŞTİ; il/ilçeli gövde aynı ama
// beklenen yankı genişledi ve eski provalar bu kıyası görmedi.
export const GOOGLE_DERLEYICI_SURUMU = 'g-1.6.0';

/**
 * Google yayınında `yayin.atif_standardi`. Karar tablosunun "Ölçüm"
 * satırı "Google'ın saydığı" diyor: Google'ın kendi dönüşüm penceresini
 * kullanıyoruz, Meta'nın ajans standardını (tik7_gor1 …) değil. Kolon
 * NOT NULL ve CHECK'siz (MIMARI-REHBER § 2.2).
 */
export const GOOGLE_ATIF = 'platform';

export type GoogleLogo = { resource: string } | { yeniGorsel: { name: string; bytes: Buffer } };

export interface GoogleDerlemeBaglami {
  /** Yayın (ya da prova) kimliği: kampanya adına kısa hâli girer, tekillik araması onu arar. */
  kimlik: string;
  workspaceKisaAdi: string;
  amacEkranAdi: string;
  simdi: Date;
  validateOnly: boolean;
  /** Talep Yaratma için zorunlu; Arama'da kullanılmaz. */
  logo: GoogleLogo | null;
  youtubeVideoBasligi: string | null;
  /**
   * Marka Merkezi logosunun piksel ölçüsü (Maks. Performans LOGO kuralı:
   * 1:1, en az 128×128). Verilmezse ya da bilinmiyorsa kontrol prova'ya
   * kalır (Google reddeder ve sebebi söyler); bilinen ve uymayan ölçü RET.
   */
  logoOlcusu?: { genislik: number | null; yukseklik: number | null } | null;
  /**
   * GÖRSEL KURGULARI (Dalga 3): her görselin Google kaynağı (hesapta kayıtlı
   * kaynak adı ya da yüklenecek bayt) ve ÖLÇÜSÜ. Servis veritabanından
   * okuyor; derleyici saf kalıyor. Girdideki bir görsel burada yoksa RET
   * (sessizce eksik görselle kurmak yok).
   */
  gorselKaynaklari?: ReadonlyMap<string, { kaynak: GoogleGorselKaynagi; olcu: GorselOlcusu }>;
}

/** Talep Yaratma görsel reklamının geri okumada beklenen hâli. */
export interface GoogleGorselReklamBeklentisi {
  reklamSayisi: number;
  yatay: number;
  kare: number;
  dik45: number;
  logo: number;
  kanallar: Record<keyof typeof DEMAND_GEN_GORSEL_KANALLARI, boolean>;
  otomasyon: Record<string, string>;
}

/**
 * Talep Yaratma VİDEO reklamının geri okumada beklenen hâli (B13). Önceden
 * video kurgusunda yalnız kampanya, bütçe ve konum okunuyordu: kanallar,
 * teklif ve videonun kendisi Google'da başka çıksa yayın "temiz" açılırdı.
 */
export interface GoogleVideoReklamBeklentisi {
  reklamSayisi: number;
  /** YouTube video kimliği (asset `youtube_video_asset.youtube_video_id`). */
  videoKimligi: string;
  kanallar: Record<DemandGenKanali, boolean>;
}

/** Maks. Performans varlık grubunun geri okumada beklenen hâli. */
export interface GoogleVarlikGrubuBeklentisi {
  grupSayisi: number;
  adresler: string[];
  alanlar: Record<PmaxAlani, number>;
  /** Kampanya düzeyinde marka bağları (marka kuralları açık). */
  marka: { BUSINESS_NAME: number; LOGO: number };
  markaKurallari: boolean;
  otomasyon: Record<string, string>;
}

/** Kampanyaya bağlı site bağlantısı / açıklama metni öğelerinin İÇERİĞİ. */
export interface GoogleUzantiBeklentisi {
  siteBaglantilari: Array<{ metin: string; adres: string; satir1: string | null; satir2: string | null }>;
  aciklamaMetinleri: string[];
}

/**
 * Arama öğelerinin geri okumada beklenen İÇERİĞİ (g-1.2.0). `null` = o öğe
 * beklenmiyor ve kampanyaya bağlı (Google'ın kendi üretmediği) bir tane varsa
 * FARK: söz verilmemiş öğe.
 */
export interface GoogleOgeBeklentisi {
  isletmeAdi: string | null;
  logo: number;
  snippet: { baslik: string; degerler: string[] } | null;
  promosyon: { hedef: string; yuzdeMicros: string | null; tutarMicros: string | null; baslangic: string | null; bitis: string } | null;
  fiyat: { tur: string; kalemler: Array<{ baslik: string; aciklama: string; micros: string }> } | null;
}

/** Geri okumada beklenen değerler — `google-geri-okuma.ts` bunlarla karşılaştırır. */
export interface GoogleBeklenen {
  kanal: 'SEARCH' | 'DEMAND_GEN' | 'PERFORMANCE_MAX';
  kampanyaAdi: string;
  durum: 'PAUSED';
  gunlukButceMicros: string;
  /** Arama: dört ağ bayrağı; Talep Yaratma: null (ağ bayrağı yok, kanallar grupta). */
  aglar: { googleSearch: boolean; searchNetwork: boolean; contentNetwork: boolean; partnerSearchNetwork: boolean } | null;
  konumTuru: 'PRESENCE';
  konumSayisi: number;
  /** Arama: öbek eşleme kelime sayısı; Talep Yaratma: null. */
  anahtarKelimeSayisi: number | null;
  negatifSayisi: number | null;
  /**
   * Arama öğesi (telefon ulaşması): kampanyaya CALL olarak bağlı TEK öğe ve
   * numarası. Yoksa null. Eski yayın satırlarının `beklenen_yanki` JSON'unda
   * bu alan HİÇ yok (undefined); okuyan taraf onu null sayıyor.
   */
  aramaOgesi?: { countryCode: string; phoneNumber: string } | null;
  /**
   * Arama öğesinin saat planı. YALNIZ gönderildiyse yazılır (eski satırlarda
   * ve saatsiz kurulumda YOK = bakılmaz). Gönderip beklemeye yazmamak,
   * Google'ın planı düşürmesini görmemek olurdu.
   */
  aramaSaatleri?: GoogleSaatPlani[];
  /**
   * Site bağlantısı ve açıklama metni (Arama + site, g-1.1.0). Eski satırlarda
   * YOK (undefined) = bakılmaz. Boş diziler = HİÇ öğe beklenmiyor (kaynak
   * çıkmadı); kampanyaya bağlı öğe varsa fark. Onay durumu beklentide YOK.
   */
  uzantilar?: GoogleUzantiBeklentisi;
  /** Arama öğeleri (g-1.2.0); eski satırlarda YOK = bakılmaz. */
  ogeler?: GoogleOgeBeklentisi;
  /**
   * Arama reklamının görünen yolu. YALNIZ gönderildiyse yazılır; eski yayın
   * satırlarında ve yolsuz reklamda alan YOK = bakılmaz. Yeni bir alanı
   * gönderip beklentiye yazmamak, Google'ın onu düşürmesini görmemek olurdu.
   */
  gorunenYol?: { path1: string; path2: string | null };
  /**
   * Dalga 3 (yalnız yeni kurgularda yazılır; eski satırlarda yok = bakılmaz):
   * teklif stratejisi (`campaign.bidding_strategy_type`), Talep Yaratma görsel
   * reklamı ve Maks. Performans varlık grubu.
   */
  teklif?: 'TARGET_SPEND' | 'MAXIMIZE_CONVERSIONS';
  gorselReklam?: GoogleGorselReklamBeklentisi;
  /** g-1.5.0 Talep Yaratma video; eski satırlarda YOK = bakılmaz. */
  videoReklam?: GoogleVideoReklamBeklentisi;
  varlikGrubu?: GoogleVarlikGrubuBeklentisi;
  /**
   * MAKS. PERFORMANS (g-1.4.0): kampanyada TEKLİFE GİREN dönüşüm hedefleri
   * (`KATEGORI~KAYNAK`, sıralı). Beklenen yalnız `PURCHASE~WEBSITE`; Google
   * bir hedefi hesap varsayılanıyla açık bırakırsa (yeni hedef, maskesiz
   * güncelleme) fark. Eski satırlarda YOK = bakılmaz.
   */
  teklifHedefleri?: string[];
  /**
   * g-1.6.0 (B12) — KONUM KİMLİKLE: `konumSayisi` yalnız sayıyordu ve İzmir
   * yerine Manisa'ya kurulmuş bir kampanya "1 konum" ile temiz geçerdi.
   * `geoTargetConstants/NNN` sıralı. Eski satırlarda YOK = bakılmaz.
   */
  konumKimlikleri?: string[];
  /**
   * Adres çevresi (ERİŞİM K4) Google'ın döndürdüğü birimlerle: mikro-derece
   * ve yarıçap. `null` = beklenmiyor; kampanyada yakınlık ölçütü VARSA fark
   * (söz verilmemiş bir daire). Eski satırlarda YOK = bakılmaz.
   */
  yakinlik?: { enlemMikro: number; boylamMikro: number; yaricap: number; birim: 'KILOMETERS' } | null;
  /**
   * Talep Yaratma YAŞ KİTLESİ (B12): reklam grubuna bağlı kitlenin yaş
   * aralıkları ve "yaşı bilinmeyenler" bayrağı. `null` = yaş kitlesi YOK
   * (18+, kısıtsız); bağlı bir kitle dönerse fark. Arama ve Maks. Performans
   * yaş ölçütü taşımıyor: alan yok. Eski satırlarda YOK = bakılmaz.
   */
  yasKitlesi?: GoogleYasKitlesi | null;
}

export interface GoogleYasKitlesi {
  segmentler: YasSegmenti[];
  belirsizDahil: false;
}

/** Gövdenin kurduğu yaş kitlesinin beklenen hâli (`demandGenYasKitlesiBody` ile aynı kural). */
export function yasKitlesiBeklenen(kovalar: readonly string[]): GoogleYasKitlesi | null {
  const segmentler = yasSegmentleri(kovalar);
  return segmentler.length ? { segmentler, belirsizDahil: false } : null;
}

export type GoogleDerleme =
  | {
      tur: 'govde';
      kurgu: GoogleDerlemeGirdisi['kurgu'];
      govde: { mutateOperations: Array<Record<string, unknown>>; partialFailure: false; validateOnly: boolean };
      /**
       * `reklam: null` = Maks. Performans (reklam nesnesi yok, `reklamGrubu`
       * varlık grubu). `gorseller`: bu istekte YENİ yüklenen görseller
       * (yayın sonrası `asset_platform_refs` önbelleğine yazılır).
       */
      sira: {
        kampanya: number;
        reklamGrubu: number;
        reklam: number | null;
        logo: number | null;
        aramaOgesi: number | null;
        gorseller?: Array<{ varlikId: string; sira: number }>;
        /** Arama + site: uzantı bağlarının (CampaignAsset) sıraları; öğe bir önceki işlem. */
        siteBaglantilari?: number[];
        aciklamaMetinleri?: number[];
        /**
         * Arama: İSTEĞE BAĞLI öğelerin BÜTÜN işlemleri (öğe + bağ; site
         * ulaşmasında arama öğesi dahil). Google yalnız bunları reddettiyse
         * kurulum öğesiz yeniden prova edilir.
         */
        ogeIslemleri?: number[];
      };
      beklenen: GoogleBeklenen;
      atif: typeof GOOGLE_ATIF;
      /** Kullanıcıya söylenecek kısıt (sessiz değişiklik yok): ör. yaş kovası yuvarlandı. */
      notlar: string[];
    }
  | { tur: 'ret'; retler: Array<{ kod: string; mesaj: string }> };

/**
 * Google'ın yaş kovaları 18-24, 25-34 …; "en düşük yaş 21" diye bir kova
 * YOK. Tahmin etmektense KISITLA: kovanın altına düşen yaş bir üst kovaya
 * yuvarlanır (25), yani reklam en düşük yaşın altındakine HİÇ çıkmaz; bedeli
 * 21-24 arasının dışarıda kalması ve bu notla söyleniyor.
 */
export function googleYasKovalari(enDusukYas: number): { kovalar: string[]; not: string | null } {
  if (enDusukYas <= 18) return { kovalar: [], not: null };
  const tum = ['AGE_RANGE_25_34', 'AGE_RANGE_35_44', 'AGE_RANGE_45_54', 'AGE_RANGE_55_64', 'AGE_RANGE_65_UP'];
  return {
    kovalar: tum,
    not: enDusukYas < 25 ? `Google'da yaş ${enDusukYas}'ten değil 25'ten başlıyor (Google'ın yaş grupları 18-24, 25-34 …).` : null,
  };
}

/** Kare logo reddi (B17): Talep Yaratma ve Maks. Performans aynı Google kuralı, aynı cümle. */
export const GOOGLE_LOGO_KARE_MESAJI = "Google logosu kare (1:1) ve en az 128×128 olmalı; Marka Merkezi'ndeki logoyu değiştir.";

/** Hesabın saat diliminde bugün, `YYYY-MM-DD`. */
function bugun(simdi: Date, saatDilimi: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: saatDilimi, year: 'numeric', month: '2-digit', day: '2-digit' }).format(simdi);
}

export function derleGoogle(g: GoogleDerlemeGirdisi, b: GoogleDerlemeBaglami): GoogleDerleme {
  const retler: Array<{ kod: string; mesaj: string }> = [];
  const notlar: string[] = [];

  // ── Bütçe: Google'a GÜNLÜK tutar gidiyor ─────────────────────────────────
  // Toplam bütçe dönem gün sayısına bölünüyor. Google'ın "kampanya toplam
  // bütçesi" bu kurgularda API'den ÖLÇÜLMEDİ; bilinen yola düşüp kısıtı
  // söylüyoruz (CLAUDE.md "tahmin etmektense kısıtla").
  const gunluk = gunlukEsdeger(g.butce.micros, g.butce.tip, g.takvim);
  if (gunluk === null) retler.push({ kod: 'BTC-02', mesaj: 'Toplam bütçede bitiş tarihi gerekli.' });
  // Para biriminin en küçük biriminin katı olmalı: Google "minimum para
  // birimi katı değil" diye reddediyor. Aşağı yuvarlanıyor; artan kuruş
  // harcanmıyor, fazlası harcanmıyor.
  const birim = 10n ** BigInt(6 - paraOndaligi(g.paraBirimi));
  const gunlukMicros = gunluk === null ? 0n : gunluk - (gunluk % birim);
  if (gunluk !== null && gunlukMicros <= 0n) retler.push({ kod: 'BTC-01', mesaj: "Google'a düşen günlük tutar sıfır." });
  if (g.butce.tip === 'toplam') notlar.push("Google'da toplam bütçe günlük tutara bölündü; Google bir günde günlük tutarın iki katına kadar harcayabilir, dönem toplamını aşmaz.");

  // ── Takvim ───────────────────────────────────────────────────────────────
  const bu = bugun(b.simdi, g.saatDilimi);
  if (g.takvim.baslangic < bu) retler.push({ kod: 'TKV-GECMIS', mesaj: 'Başlangıç tarihi geçmişte kaldı; yeni bir tarih seç.' });
  if (g.takvim.bitis !== null && g.takvim.bitis < bu) retler.push({ kod: 'TKV-GECMIS', mesaj: 'Bitiş tarihi geçmişte kaldı.' });
  // Bugün başlıyorsa tarih GÖNDERİLMİYOR: "bugün 00:00" geçmişte kalır ve
  // Google reddeder; tarih yokken kampanya açıldığı anda başlar.
  const startDate = g.takvim.baslangic > bu ? g.takvim.baslangic : undefined;

  if (g.konumlar.length === 0 && !g.yakinlik) retler.push({ kod: 'KNM-01', mesaj: 'Konum yok: kampanya bütün ülkelere açılırdı.' });
  /*
   * ADRES ÇEVRESİ GOOGLE'DA HİÇBİR KURGUDA KURULMUYOR (Ajan 4 kapısı):
   * v25 reklam grubu ölçütünde `proximity` alanı yok, Talep Yaratma konumu
   * kampanya düzeyinde reddediyor (`GOOGLE_YARICAP_YOK_MESAJI` gerekçesi).
   * Gövdeyi kurup Google'ın "Unknown name" reddini beklemek yerine giriş
   * anındaki kuralla (`GOOGLE_YARICAP_KURGULARI`, eksik listesi) AYNI ret.
   * Sessizce atlamak "konumsuz = bütün ülkeler" demekti.
   */
  if (g.yakinlik && !GOOGLE_YARICAP_KURGULARI.includes(g.kurgu)) {
    retler.push({ kod: 'G-YARICAP-KURGU', mesaj: GOOGLE_YARICAP_YOK_MESAJI });
  }
  if (g.yakinlik && g.konumlar.length > 0) {
    // Birleşim: daire + il = il geneli (Meta ile aynı kural, `adresCevresiKarisik`).
    retler.push({ kod: 'KNM-ADRES', mesaj: 'İşletme adresinin çevresi başka konumlarla birlikte seçilemez.' });
  }
  let yakinlikBeklenen: GoogleBeklenen['yakinlik'] = null;
  if (g.yakinlik) {
    try {
      const o = yakinlikOlcutu(g.yakinlik) as { geoPoint: { latitudeInMicroDegrees: number; longitudeInMicroDegrees: number }; radius: number };
      yakinlikBeklenen = { enlemMikro: o.geoPoint.latitudeInMicroDegrees, boylamMikro: o.geoPoint.longitudeInMicroDegrees, yaricap: o.radius, birim: 'KILOMETERS' };
    } catch (e) {
      retler.push({ kod: 'KNM-ADRES-KONUM', mesaj: (e as Error).message });
    }
  }
  // B12: bütün kurgularda konum kimliği (sıralı) beklenir.
  const konumKimlikleri = [...g.konumlar].sort();
  if (g.basliklar.length === 0) retler.push({ kod: 'METIN-BASLIK', mesaj: 'Başlık yok.' });

  // AD BİÇİMİ META İLE AYNI ÜRETİCİDEN (`advKampanyaAdi`, kullanıcı kararı
  // 2026-10-12): "ADV · 12.10.2026 · Siteme gelsinler · 4F2A". Tarih hesabın
  // saat diliminde. Kampanya adı DAMGASIZ (`damgasiz`): benzersizliği kod
  // sağlıyor; aynı yayının yeniden denemesinde DUPLICATE_NAME ikinci bir
  // kampanyanın açılmasını da engelliyor.
  const ad = advKampanyaAdi(bu, b.amacEkranAdi, b.kimlik);
  const stamp = nameStamp(b.simdi);

  if (g.kurgu === 'ARAMA') {
    if (g.ulasma === 'form') {
      // Form öğesi (LeadFormAsset) KENDİ İÇERİĞİNİ istiyor: form başlığı,
      // işletme adı, sorulacak alanlar, gizlilik politikası adresi, gönderim
      // sonrası metin. Rehberde bunların Google için bir kaynağı yok (Meta
      // formu Meta'da duruyor, Google'a taşınmıyor). Sessizce yalnız site
      // reklamı kurmak, kullanıcının istediği "form doldursunlar"ı hiç
      // kurmamak demekti; içeriği uydurmak ise müşteri adına söz vermek.
      retler.push({
        kod: 'G-KURGU-KAPALI',
        mesaj: "Google'da form reklamı henüz kurulamıyor: Google formunun içeriği (sorular, gizlilik adresi) için bir kaynak yok.",
      });
    } else if (g.ulasma !== 'site' && g.ulasma !== 'telefon') {
      // Arama kurgusunda ulaşma null ya da bilinmeyen bir değer: tür
      // sisteminin dışından gelmiş bir girdi. Tahminle site reklamı KURULMAZ.
      retler.push({ kod: 'G-KURGU-KAPALI', mesaj: `Google Arama'da bu ulaşma türü kurulamıyor: ${String(g.ulasma)}` });
    }
    let tel: ReturnType<typeof aramaOgesiTelefonu> | null = null;
    let saatPlani: GoogleSaatPlani[] | null = null;
    if (g.ulasma === 'telefon') {
      try {
        saatPlani = googleAramaSaatleri(g.aramaSaatleri);
      } catch (e) {
        // Bozuk plan sessizce "her saat"e düşmez: kullanıcı saat girdi ve
        // reklam o sözü tutmazdı.
        retler.push({ kod: 'G-SAAT', mesaj: (e as Error).message });
      }
      // Numara derleyicide bir kez daha çözülüyor: eksikler +90 diyor ama
      // E.164 deseni daha geniş; bilinmeyen önek burada ret oluyor (kurucu
      // da patlardı, ama ret kullanıcıya CÜMLE olarak dönüyor, istisna değil).
      if (!g.telefon) retler.push({ kod: 'G-TELEFON', mesaj: 'Telefon numarası yok: arama reklamı numarasız kurulamaz.' });
      else {
        try {
          tel = aramaOgesiTelefonu(g.telefon);
        } catch (e) {
          retler.push({ kod: 'G-TELEFON', mesaj: (e as Error).message });
        }
      }
    }
    if (g.anahtarKelimeler.length === 0) retler.push({ kod: 'G-KELIME', mesaj: 'Anahtar kelime yok: arama kampanyası hiç gösterilmezdi.' });
    if (g.aciklamalar.length < 2) retler.push({ kod: 'G-ACIKLAMA-SAYI', mesaj: 'Google için en az 2 açıklama gerekiyor.' });
    if (g.basliklar.length < 3) retler.push({ kod: 'G-BASLIK-SAYI', mesaj: 'Google için en az 3 başlık gerekiyor.' });
    // Görünen yol: sınırı aşan parça KIRPILMAZ, ret (yarıda kesilmiş yol
    // başka bir sayfayı anlatabilir). Eksik listesi aynı sınırı engel sayıyor.
    const yol = gorunenYolu(g.gorunenYol);
    yol.forEach((x, i) => {
      if (karakterSayisi(x) > METIN_SINIRLARI.gorunenYol) retler.push({ kod: 'G-YOL-UZUN', mesaj: `Görünen yol ${i + 1} en çok ${METIN_SINIRLARI.gorunenYol} karakter olabilir.` });
    });
    // ── Öğeler (g-1.2.0) ── Kaynak `googleAramaOgeleri` (shared); burada
    // yalnız yayın anına bağlı iki kontrol: bitmiş promosyon ve okunamayan logo.
    const ogeler: GoogleAramaOgeleri | null = g.ogeler ? { ...g.ogeler } : null;
    if (ogeler?.promosyon && ogeler.promosyon.bitis < bu) {
      // Bitmiş bir indirimi reklama koymak yalan; kampanyanın kendisi bunun
      // için durmaz, öğe düşer ve söylenir.
      notlar.push(`Promosyonun bitiş tarihi (${ogeler.promosyon.bitis}) geçti; promosyon eklenmedi.`);
      ogeler.promosyon = null;
    }
    if (ogeler?.logoVarlikId && !b.logo) {
      notlar.push('İşletme logosu okunamadı; logo eklenmedi.');
      ogeler.logoVarlikId = null;
    }
    let ogeTel: ReturnType<typeof aramaOgesiTelefonu> | null = null;
    if (g.ulasma === 'site' && ogeler?.telefon) {
      try {
        ogeTel = aramaOgesiTelefonu(ogeler.telefon);
      } catch (e) {
        // Öğe kaynağı zaten süzüyor; buraya düşen numara öğeyi düşürür,
        // kampanyayı değil (site reklamının çekirdeği telefon değil).
        notlar.push(`Arama öğesi eklenmedi: ${(e as Error).message}`);
      }
    }
    if (retler.length) return { tur: 'ret', retler };
    /*
     * TELEFON'DA DÖNÜŞÜM TEKLİFİ YOK (Ö-1, 2026-10-13): türetme zaten tıklama
     * veriyor; burada İKİNCİ kapı. Eski bir taslak MAKS_DONUSUM taşısa bile
     * Google hesabın bütün birincil işlemlerine (sitedeki tel: tıklaması,
     * form) optimize etmesin.
     */
    const donusumTeklifi = g.teklif === 'MAKS_DONUSUM' && g.ulasma !== 'telefon';
    if (g.teklif === 'MAKS_DONUSUM' && !donusumTeklifi) notlar.push(GOOGLE_TELEFON_TEKLIF_CUMLESI + '.');
    const { govde, sira } = aramaAtomikIstek({
      customerId: g.musteriId,
      name: ad,
      stamp,
      damgasiz: true,
      gunlukButceMicros: gunlukMicros,
      ...(startDate ? { startDate } : {}),
      endDate: g.takvim.bitis,
      teklif: donusumTeklifi ? 'maximizeConversions' : 'targetSpend',
      konumlar: g.konumlar,
      dil: g.dil,
      negatifler: g.negatifler,
      anahtarKelimeler: g.anahtarKelimeler,
      finalUrl: g.hedefAdres,
      basliklar: g.basliklar,
      aciklamalar: g.aciklamalar,
      ...(yol.length ? { gorunenYol: yol } : {}),
      telefon: tel ? g.telefon : ogeTel ? ogeler!.telefon : null,
      // Saat planı YALNIZ telefon ulaşmasının öğesinde: site reklamındaki
      // isteğe bağlı arama öğesinin saati sorulmadı.
      aramaSaatleri: tel ? saatPlani : null,
      // Uzantılar yalnız site ulaşmasında girdiye yazılıyor (`rehberdenGoogle`).
      siteBaglantilari: g.siteBaglantilari ?? [],
      aciklamaMetinleri: g.aciklamaMetinleri ?? [],
      validateOnly: b.validateOnly,
    });
    const ogeSira = ogeler
      ? aramaOgeIslemleriEkle(govde.mutateOperations, {
          customerId: g.musteriId,
          kampanya: kampanyaKaynagi(govde.mutateOperations[sira.kampanya]),
          ogeler,
          logo: ogeler.logoVarlikId ? b.logo : null,
          paraBirimi: g.paraBirimi,
          finalUrl: g.hedefAdres,
        })
      : { islemler: [], logo: null };
    // Site ulaşmasında arama öğesi de İSTEĞE BAĞLI bir öğe; telefon
    // ulaşmasında reklamın çekirdeği (reddi kampanyanın reddi).
    const ogeIslemleri = [...(ogeTel && sira.aramaOgesi !== null ? [sira.aramaOgesi - 1, sira.aramaOgesi] : []), ...ogeSira.islemler];
    // Reddedilip öğesiz kurulan hâlde her öğe için "Google reddetti" yazmak
    // aynı cümleyi yedi kez tekrarlar; ret cümlesi servisten ayrıca geliyor.
    const eklenmeyen = g.ogeReddi ? [] : (g.ogeDurumlari ?? []).filter((d) => !d.eklendi && d.kod !== 'PROMOSYON' && d.kod !== 'FIYAT');
    if (eklenmeyen.length) notlar.push(`Eklenmeyen öğeler: ${eklenmeyen.map((d) => `${GOOGLE_OGE_ADLARI[d.kod]} (${d.metin})`).join('; ')}.`);
    if (tel) {
      // Sessiz kalmasın: iki kısıt da kullanıcının göreceği yerde.
      notlar.push(
        "Google arama öğesini numara doğrulanınca gösterir: numara sitende yazı olarak (görsel değil) görünmeli; Google'ın algılaması 3 güne kadar sürebilir.",
      );
      notlar.push(
        saatPlani
          ? `Arama düğmesi yalnız çalışma saatlerinde görünür: ${calismaSaatleriOzeti(g.aramaSaatleri)}.`
          : "Telefon her saatte görünür: Marka Merkezi'nde çalışma saatleri girilmedi.",
      );
    }
    if (g.siteBaglantilari !== undefined && g.siteBaglantilari.length === 0 && !g.ogeReddi) {
      notlar.push(g.siteSebebi ? `${SITE_BAGLANTISI_YOK_CUMLESI}: ${g.siteSebebi}.` : `${SITE_BAGLANTISI_YOK_CUMLESI}.`);
    }
    if ((g.siteBaglantilari?.length ?? 0) + (g.aciklamaMetinleri?.length ?? 0) > 0) {
      notlar.push('Site bağlantıları ve açıklama metinleri Google incelemesinden sonra görünür; inceleme sürerken reklam yine yayında.');
    }
    return {
      tur: 'govde',
      kurgu: g.kurgu,
      govde,
      sira: { ...sira, logo: ogeSira.logo, ...(ogeler ? { ogeIslemleri } : {}) },
      beklenen: {
        kanal: 'SEARCH',
        kampanyaAdi: kampanyaAdi(govde.mutateOperations[sira.kampanya]),
        durum: 'PAUSED',
        gunlukButceMicros: gunlukMicros.toString(),
        aglar: { googleSearch: true, searchNetwork: false, contentNetwork: false, partnerSearchNetwork: false },
        konumTuru: 'PRESENCE',
        konumSayisi: g.konumlar.length,
        konumKimlikleri,
        yakinlik: null,
        anahtarKelimeSayisi: g.anahtarKelimeler.length,
        negatifSayisi: g.negatifler.length,
        aramaOgesi: tel ? { countryCode: tel.countryCode, phoneNumber: tel.phoneNumber } : ogeTel ? { countryCode: ogeTel.countryCode, phoneNumber: ogeTel.phoneNumber } : null,
        ...(tel && saatPlani ? { aramaSaatleri: saatPlani.map((x) => ({ ...x })) } : {}),
        ...(ogeler
          ? {
              ogeler: {
                isletmeAdi: ogeler.isletmeAdi,
                logo: ogeler.logoVarlikId ? 1 : 0,
                snippet: ogeler.snippet ? { baslik: ogeler.snippet.baslik, degerler: [...ogeler.snippet.degerler] } : null,
                promosyon: ogeler.promosyon ? { ...ogeler.promosyon } : null,
                fiyat: ogeler.fiyat ? { tur: ogeler.fiyat.tur, kalemler: ogeler.fiyat.kalemler.map((k) => ({ ...k })) } : null,
              },
            }
          : {}),
        // Teklif Arama'da da geri okunuyor (g-1.1.0): eşik kararı gövdeye
        // gerçekten yansıdı mı, kampanyanın kendisinden.
        teklif: donusumTeklifi ? 'MAXIMIZE_CONVERSIONS' : 'TARGET_SPEND',
        ...(g.siteBaglantilari !== undefined || g.aciklamaMetinleri !== undefined
          ? {
              uzantilar: {
                siteBaglantilari: (g.siteBaglantilari ?? []).map((x) => ({ metin: x.metin, adres: x.adres, satir1: x.satir1 ?? null, satir2: x.satir2 ?? null })),
                aciklamaMetinleri: [...(g.aciklamaMetinleri ?? [])],
              },
            }
          : {}),
        ...(yol.length ? { gorunenYol: { path1: yol[0]!, path2: yol[1] ?? null } } : {}),
      },
      atif: GOOGLE_ATIF,
      notlar,
    };
  }

  if (g.kurgu === 'TALEP_YARATMA_VIDEO') {
    if (!g.youtubeVideoId) retler.push({ kod: 'G-VIDEO', mesaj: "YouTube'dan video seç." });
    if (!g.isletmeAdi) retler.push({ kod: 'G-LOGO', mesaj: "Marka Merkezi'nde işletme adı yok." });
    if (!b.logo) retler.push({ kod: 'G-LOGO', mesaj: "Marka Merkezi'nde logo yok." });
    if (pmaxLogoKareMi(b.logoOlcusu) === false) retler.push({ kod: 'G-LOGO-KARE', mesaj: GOOGLE_LOGO_KARE_MESAJI });
    // UZUN BAŞLIK AÇIKLAMADAN AYRI (B14c): eski gövde ikisini de
    // `aciklamalar`dan dolduruyordu ve aynı metin iki alana gidiyordu.
    const uzun = videoUzunBaslik(g.basliklar, g.aciklamalar);
    if (!uzun) retler.push({ kod: 'G-BASLIK-SAYI', mesaj: 'YouTube reklamı için en az 1 başlık gerekiyor.' });
    else if (uzun.aciklamalar.length === 0) {
      retler.push({ kod: 'G-ACIKLAMA-SAYI', mesaj: 'YouTube reklamı için başlıktan farklı en az 1 açıklama gerekiyor.' });
    }
    if (retler.length || !g.youtubeVideoId || !g.isletmeAdi || !b.logo || !uzun) return { tur: 'ret', retler };
    const yas = googleYasKovalari(g.enDusukYas);
    if (yas.not) notlar.push(yas.not);
    // SESSİZ KESME YOK (B14b): görsel dalı söylüyordu, video dalı söylemiyordu.
    if (g.basliklar.length > DEMAND_GEN_VIDEO_EN_COK_BASLIK) {
      notlar.push(`Google video reklamı en çok ${DEMAND_GEN_VIDEO_EN_COK_BASLIK} başlık alıyor; ilk ${DEMAND_GEN_VIDEO_EN_COK_BASLIK} başlığın gitti (${g.basliklar.length} yazdın).`);
    }
    const aciklamalar = uzun.aciklamalar.slice(0, 5);
    if (uzun.aciklamalar.length > 5) notlar.push(`Google video reklamı en çok 5 açıklama alıyor; ilk 5 açıklaman gitti.`);
    const { govde, sira } = demandGenAtomikIstek({
      customerId: g.musteriId,
      name: ad,
      stamp,
      damgasiz: true,
      dailyBudgetMicros: gunlukMicros,
      endDate: g.takvim.bitis,
      ...(startDate ? { startDate } : {}),
      yalnizBulunanlar: true,
      // DURAKLATILMIŞ KURULUR: rehberin üç adımı (kur → geri oku → aç) Meta
      // motoruyla aynı. Atomik istek yarım hâl bırakmıyor ama geri okuma
      // "kurulan şey istenen mi" sorusunu cevaplıyor ve o soru açmadan önce.
      acilis: 'PAUSED',
      konumlar: g.konumlar,
      yakinlik: g.yakinlik ?? null,
      yaslar: yas.kovalar,
      videoId: g.youtubeVideoId,
      videoTitle: b.youtubeVideoBasligi ?? ad,
      logo: b.logo,
      businessName: g.isletmeAdi,
      finalUrl: g.hedefAdres,
      // Talep Yaratma video reklamı: başlık ≤ 40, uzun başlık ve açıklama
      // ≤ 90 (rehber başlığı zaten ≤ 30, açıklaması ≤ 90). Uzun başlık EN
      // UZUN BAŞLIK (yönetici kararı): başka bir metin UYDURULMUYOR.
      headlines: g.basliklar.slice(0, DEMAND_GEN_VIDEO_EN_COK_BASLIK),
      longHeadlines: [uzun.uzunBaslik],
      descriptions: aciklamalar,
      // B20/B14d: yedi kanal bayrağı, Kontrol'ün "Nerede" hücresiyle AYNI sabit.
      kanallar: DEMAND_GEN_VIDEO_KANALLARI,
      validateOnly: b.validateOnly,
    });
    return {
      tur: 'govde',
      kurgu: g.kurgu,
      govde,
      sira: { ...sira, aramaOgesi: null },
      beklenen: {
        kanal: 'DEMAND_GEN',
        kampanyaAdi: kampanyaAdi(govde.mutateOperations[sira.kampanya]),
        durum: 'PAUSED',
        gunlukButceMicros: gunlukMicros.toString(),
        aglar: null,
        konumTuru: 'PRESENCE',
        konumSayisi: g.konumlar.length,
        konumKimlikleri,
        yakinlik: yakinlikBeklenen,
        yasKitlesi: yasKitlesiBeklenen(yas.kovalar),
        anahtarKelimeSayisi: null,
        negatifSayisi: null,
        aramaOgesi: null,
        // B13: teklif, kanallar ve videonun KENDİSİ geri okunuyor; okunamayan
        // (`null`) fark sayılır, "temiz" değil.
        teklif: 'TARGET_SPEND',
        videoReklam: { reklamSayisi: 1, videoKimligi: g.youtubeVideoId, kanallar: { ...DEMAND_GEN_VIDEO_KANALLARI } },
      },
      atif: GOOGLE_ATIF,
      notlar,
    };
  }

  if (g.kurgu === 'TALEP_YARATMA_GORSEL' || g.kurgu === 'MAKS_PERFORMANS') {
    // ── Ortak: marka, görseller ─────────────────────────────────────────
    if (!g.isletmeAdi) retler.push({ kod: 'G-LOGO', mesaj: "Marka Merkezi'nde işletme adı yok." });
    else if (karakterSayisi(g.isletmeAdi) > GOOGLE_ISLETME_ADI_EN_COK) {
      // Kırpmak yok: yarım kalan ad markanın adı değil.
      retler.push({ kod: 'G-ISLETME-ADI', mesaj: `Google'da işletme adı en çok ${GOOGLE_ISLETME_ADI_EN_COK} karakter; Marka Merkezi'ndeki marka adını kısalt.` });
    }
    if (!b.logo) retler.push({ kod: 'G-LOGO', mesaj: "Marka Merkezi'nde logo yok." });
    // B17: Talep Yaratma görselinde de (Maks. Performans aşağıda kendi kodunu yazıyor).
    if (g.kurgu === 'TALEP_YARATMA_GORSEL' && pmaxLogoKareMi(b.logoOlcusu) === false) {
      retler.push({ kod: 'G-LOGO-KARE', mesaj: GOOGLE_LOGO_KARE_MESAJI });
    }
    const gorseller = gorselleriCoz(g, b, retler, notlar);
    const say = (o: 'yatay' | 'kare' | 'dik45') => gorseller.filter((x) => x.oran === o).length;
    if (g.kurgu === 'TALEP_YARATMA_GORSEL') {
      if (say('yatay') + say('kare') === 0) retler.push({ kod: 'G-GORSEL-YOK', mesaj: 'Google görsel reklamı için en az bir yatay (1.91:1) ya da kare (1:1) görsel gerekli.' });
      if (g.aciklamalar.length === 0) retler.push({ kod: 'G-ACIKLAMA-SAYI', mesaj: 'Google görsel reklamı için en az 1 açıklama gerekiyor.' });
      if (retler.length || !g.isletmeAdi || !b.logo) return { tur: 'ret', retler };
      const yas = googleYasKovalari(g.enDusukYas);
      if (yas.not) notlar.push(yas.not);
      const { govde, sira } = demandGenGorselAtomikIstek({
        customerId: g.musteriId,
        name: ad,
        stamp,
        damgasiz: true,
        dailyBudgetMicros: gunlukMicros,
        endDate: g.takvim.bitis,
        ...(startDate ? { startDate } : {}),
        acilis: 'PAUSED',
        konumlar: g.konumlar,
        yakinlik: g.yakinlik ?? null,
        yaslar: yas.kovalar,
        logo: b.logo,
        gorseller,
        businessName: g.isletmeAdi,
        finalUrl: g.hedefAdres,
        // En çok 5 başlık / 5 açıklama (v25); rehber başlığı zaten ≤ 30.
        headlines: g.basliklar.slice(0, 5),
        descriptions: g.aciklamalar.slice(0, 5),
        validateOnly: b.validateOnly,
      });
      if (g.basliklar.length > 5) notlar.push(`Google görsel reklamı en çok 5 başlık alıyor; ilk 5 başlığın gitti (${g.basliklar.length} yazdın).`);
      return {
        tur: 'govde',
        kurgu: g.kurgu,
        govde,
        sira: { ...sira, aramaOgesi: null },
        beklenen: {
          kanal: 'DEMAND_GEN',
          kampanyaAdi: kampanyaAdi(govde.mutateOperations[sira.kampanya]),
          durum: 'PAUSED',
          gunlukButceMicros: gunlukMicros.toString(),
          aglar: null,
          konumTuru: 'PRESENCE',
          konumSayisi: g.konumlar.length,
          konumKimlikleri,
          yakinlik: yakinlikBeklenen,
          yasKitlesi: yasKitlesiBeklenen(yas.kovalar),
          anahtarKelimeSayisi: null,
          negatifSayisi: null,
          aramaOgesi: null,
          teklif: 'TARGET_SPEND',
          gorselReklam: {
            reklamSayisi: 1,
            yatay: say('yatay'),
            kare: say('kare'),
            dik45: say('dik45'),
            logo: 1,
            kanallar: { ...DEMAND_GEN_GORSEL_KANALLARI },
            otomasyon: Object.fromEntries(DEMAND_GEN_GORSEL_OTOMASYONU.map((x) => [x.assetAutomationType, x.assetAutomationStatus])),
          },
        },
        atif: GOOGLE_ATIF,
        notlar,
      };
    }

    // ── MAKS_PERFORMANS ─────────────────────────────────────────────────
    // Teklif girdide dönüşüm olmalı (`googleTeklifi`); değilse girdi başka
    // bir kuraldan gelmiş demektir ve tıklama teklifiyle Maks. Performans
    // KURULAMAZ (Google reddeder) — burada cümleyle durur.
    if (g.teklif !== 'MAKS_DONUSUM') retler.push({ kod: 'G-DONUSUM', mesaj: "Maks. Performans yalnız dönüşüm teklifiyle kurulur; Google Ads'te satın alma dönüşümü etkin olmalı." });
    if (g.enDusukYas !== 18) retler.push({ kod: 'G-PMAX-YAS', mesaj: "Maks. Performans'ta yaş sınırı kurulmuyor; en düşük yaşı 18 yap." });
    if (say('yatay') === 0) retler.push({ kod: 'G-GORSEL-YATAY', mesaj: 'Maks. Performans için en az bir yatay (1.91:1) görsel gerekli.' });
    if (say('kare') === 0) retler.push({ kod: 'G-GORSEL-KARE', mesaj: 'Maks. Performans için en az bir kare (1:1) görsel gerekli.' });
    const uzun = g.uzunBasliklar ?? [];
    if (uzun.length === 0) retler.push({ kod: 'G-UZUN-BASLIK', mesaj: 'Maks. Performans uzun başlık istiyor: ana metni 90 karaktere indir ya da üçüncü bir açıklama ekle.' });
    if (g.basliklar.length < 3) retler.push({ kod: 'G-BASLIK-SAYI', mesaj: 'Maks. Performans için en az 3 başlık gerekiyor.' });
    if (g.aciklamalar.length < 2) retler.push({ kod: 'G-ACIKLAMA-SAYI', mesaj: 'Maks. Performans için en az 2 açıklama gerekiyor.' });
    else if (!g.aciklamalar.some((x) => karakterSayisi(x) <= GOOGLE_KISA_ACIKLAMA)) {
      retler.push({ kod: 'G-KISA-ACIKLAMA', mesaj: `Maks. Performans için en az bir açıklama ${GOOGLE_KISA_ACIKLAMA} karakteri geçmemeli.` });
    }
    /*
     * DÖNÜŞÜM HEDEFLERİ (g-1.4.0): okunamadıysa KURULMAZ. Hedefleri yazmadan
     * kurmak, kampanyanın hesap varsayılanıyla form/telefon dönüşümlerine
     * optimize olması demek — "tahmin etmektense kısıtla".
     */
    const hedefler = g.donusumHedefleri;
    if (!hedefler) {
      retler.push({ kod: 'G-HEDEF-OKUNAMADI', mesaj: "Google Ads'teki dönüşüm hedefleri okunamadı; Maks. Performans yalnız satın almaya bağlanamadan kurulmaz. Yeniden prova et." });
    } else if (hedefler.some((h) => !PMAX_HEDEF_DEGERI.test(h.kategori) || !PMAX_HEDEF_DEGERI.test(h.kaynak))) {
      retler.push({ kod: 'G-HEDEF-TANINMIYOR', mesaj: "Google Ads'ten tanınmayan bir dönüşüm hedefi geldi; kampanya hedefleri güvenle yazılamıyor." });
    } else if (pmaxTeklifHedefleri(hedefler).length === 0) {
      retler.push({ kod: 'G-HEDEF-SATIS', mesaj: "Google Ads'te siteden satın alma hedefi yok; Maks. Performans satın almaya bağlanamıyor." });
    }
    // LOGO 1:1 ve ≥ 128 (Google belgesi). Bilinmeyen ölçü prova'ya kalır.
    if (pmaxLogoKareMi(b.logoOlcusu) === false) retler.push({ kod: 'G-LOGO-KARE', mesaj: "Maks. Performans logosu kare (1:1) ve en az 128×128 olmalı; Marka Merkezi'ndeki logoyu değiştir." });
    if (retler.length || !g.isletmeAdi || !b.logo || !hedefler) return { tur: 'ret', retler };
    const pIstek = {
      basliklar: g.basliklar.slice(0, 15),
      uzunBasliklar: uzun.slice(0, 5),
      aciklamalar: g.aciklamalar.slice(0, 5),
      gorseller,
      youtubeVideo: g.youtubeVideoId ? { id: g.youtubeVideoId, baslik: b.youtubeVideoBasligi ?? ad } : null,
    };
    const { govde, sira } = pmaxAtomikIstek({
      customerId: g.musteriId,
      name: ad,
      stamp,
      damgasiz: true,
      dailyBudgetMicros: gunlukMicros,
      endDate: g.takvim.bitis,
      ...(startDate ? { startDate } : {}),
      acilis: 'PAUSED',
      konumlar: g.konumlar,
      dil: g.dil,
      finalUrl: g.hedefAdres,
      businessName: g.isletmeAdi,
      logo: b.logo,
      ...pIstek,
      donusumHedefleri: hedefler,
      validateOnly: b.validateOnly,
    });
    if (!pIstek.youtubeVideo) notlar.push("YouTube videosu seçmedin: Google görsellerinden kendi videosunu üretip YouTube'da gösterebilir.");
    notlar.push(`${PMAX_HEDEF_CUMLESI}.`);
    return {
      tur: 'govde',
      kurgu: g.kurgu,
      govde,
      sira: { ...sira, aramaOgesi: null },
      beklenen: {
        kanal: 'PERFORMANCE_MAX',
        kampanyaAdi: kampanyaAdi(govde.mutateOperations[sira.kampanya]),
        durum: 'PAUSED',
        gunlukButceMicros: gunlukMicros.toString(),
        aglar: null,
        konumTuru: 'PRESENCE',
        konumSayisi: g.konumlar.length,
        konumKimlikleri,
        yakinlik: null,
        anahtarKelimeSayisi: null,
        negatifSayisi: null,
        aramaOgesi: null,
        teklif: 'MAXIMIZE_CONVERSIONS',
        varlikGrubu: {
          grupSayisi: 1,
          adresler: [g.hedefAdres],
          alanlar: pmaxAlanSayilari(pIstek),
          marka: { BUSINESS_NAME: 1, LOGO: 1 },
          markaKurallari: true,
          otomasyon: Object.fromEntries(PMAX_OTOMASYONU.map((x) => [x.assetAutomationType, x.assetAutomationStatus])),
        },
        teklifHedefleri: pmaxTeklifHedefleri(hedefler),
      },
      atif: GOOGLE_ATIF,
      notlar,
    };
  }

  // Tür sisteminin dışından gelen bir kurgu: SESLİ ret.
  return { tur: 'ret', retler: [{ kod: 'G-KURGU-KAPALI', mesaj: `Google kurgusu henüz derlenmiyor: ${String((g as { kurgu: unknown }).kurgu)}` }] };
}

/**
 * Girdinin görsellerini Google'a gidecek hâle çevirir: 9:16 NOTLA dışarıda
 * (Google'da alanı ölçülmedi / yok), kaynağı ya da ölçüsü bilinmeyen RET,
 * Google'ın ±%1 oran ve en az boyut kuralına uymayan RET (`google-gorsel.ts`
 * — eksik listesiyle AYNI fonksiyon).
 */
function gorselleriCoz(
  g: GoogleDerlemeGirdisi,
  b: GoogleDerlemeBaglami,
  retler: Array<{ kod: string; mesaj: string }>,
  notlar: string[],
): Array<{ varlikId: string; oran: 'yatay' | 'kare' | 'dik45'; kaynak: GoogleGorselKaynagi }> {
  const cikti: Array<{ varlikId: string; oran: 'yatay' | 'kare' | 'dik45'; kaynak: GoogleGorselKaynagi }> = [];
  let dikey = 0;
  for (const x of g.gorseller ?? []) {
    if (!googleGorselOraniMi(x.oran)) {
      dikey++;
      continue;
    }
    const k = b.gorselKaynaklari?.get(x.varlikId);
    if (!k) {
      retler.push({ kod: 'G-GORSEL-KAYNAK', mesaj: 'Bir görsel arşivde bulunamadı; görseli yeniden ekle.' });
      continue;
    }
    const sorun = googleGorselSorunu(x.oran, k.olcu);
    if (sorun) {
      retler.push({ kod: 'G-GORSEL-OLCU', mesaj: `${sorun}.` });
      continue;
    }
    cikti.push({ varlikId: x.varlikId, oran: x.oran, kaynak: k.kaynak });
  }
  if (dikey) notlar.push(`${dikey} dikey (9:16) görsel Google'a gönderilmedi.`);
  return cikti;
}

function kampanyaKaynagi(op: Record<string, unknown> | undefined): string {
  const c = (op?.campaignOperation as { create?: { resourceName?: unknown } } | undefined)?.create;
  if (typeof c?.resourceName !== 'string') throw new Error('Derlenmiş gövdede kampanya kaynağı yok.');
  return c.resourceName;
}

function kampanyaAdi(op: Record<string, unknown> | undefined): string {
  const c = (op?.campaignOperation as { create?: { name?: unknown } } | undefined)?.create;
  if (typeof c?.name !== 'string') throw new Error('Derlenmiş gövdede kampanya adı yok.');
  return c.name;
}
