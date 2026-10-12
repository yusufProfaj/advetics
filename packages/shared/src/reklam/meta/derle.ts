/**
 * `derleMeta()` — taslaktan Meta gövdelerine (TASARIM.md § 06.1, 06.4).
 *
 * SAF: platform çağrısı, veritabanı, saat, rastgelelik yok. Aynı girdi iki
 * kez derlenince AYNI baytlar çıkmalı; prova, onay kartı ve yayın aynı
 * çıktıya bağlanıyor ve ayrışırsa kart sebepsiz bayatlar.
 *
 * "KISMEN DERLENDİ" DİYE BİR HÂL YOK: ya gövdelerin TAMAMI ya ret. Yarım ağaç
 * Meta'da kurulursa geri almak arşiv ister ve arşiv tek yönlü.
 *
 * Ret ile hata AYRI: ret kullanıcının düzeltebileceği şey (konum yok, bütçe
 * yok); manifesto eksiği Advetics'in hatası ve FIRLATIR — kullanıcıya
 * "düzelt" denemez.
 *
 * Gövdeler arası bağlar yer tutucuyla (`{kampanya}`, `{reklam_seti}`,
 * `{kreatif:1}`): kimlikleri yayın motoru zincir sırasında doldurur.
 */
import { ACILMADI_ONEKI, adlabels, kampanyaAdi, kreatifAdi, reklamAdi, reklamSetiAdi } from './adlandirma';
import { etkinKategoriler, hedeflemeUret, type HedeflemeGirdisi, type OzelKategori } from './hedefleme';
import { NIYET_KATALOGU, formCtaTuru, metaOptimizasyonHedefi, type NiyetKodu, type SitePikselHali } from './niyetler';
import { KARSILAMA_SETTE_YOK_CUMLESI, karsilamaCoz, sayfaKarsilamaMesaji, type WhatsappKarsilama } from './karsilama';
import { microsToMinor } from '../para';
import type { Butce } from '../butce';
import { ATIF_STANDARTLARI } from '../taslak';
import { TELEFON_E164 } from '../taslak-alanlari';
import { ORAN_ETIKETI, YERLESIM_GRUPLARI, YERLESIM_SIRASI, bannerSetiDestekleniyor, grupMetaKonumlari, niyetYerlesimKisiti, reklamSetiPlani, setPlani, type GorselOrani, type SetPlani, type YerlesimGrubu } from '../banner-seti';

/**
 * 1.1.0: banner seti (yerleşime göre görsel) ve eksik boyutta elle yerleşim.
 * 1.2.0: TELEFON ve WHATSAPP derleniyor (Dalga 2).
 * 1.3.0: VIDEO_IZLENME, ERISIM ve SATIS derleniyor; WhatsApp numarası
 *        `promoted_object`te; erişimde sıklık sınırı (Dalga 3).
 * 1.3.1: banner seti yokken yerleşim planı BİRLEŞİM (`reklamSetiPlani`).
 * 1.3.2: kreatif adı 100 karaktere sığdırılıyor (`kreatifAdi`).
 * 1.5.0: banner seti form, WhatsApp, arama, satış ve erişimde; değerli düğme `call_to_actions`.
 * 1.4.0: ad biçimi "ADV · GG.AA.YYYY · amaç · KOD" (kullanıcı kararı, 2026-10-12).
 * 1.6.0: SITE'de hedef pikselin hâline göre (`metaOptimizasyonHedefi`):
 *        aktif piksel yoksa LINK_CLICKS. Eski provalar LPV gövdesini kanıtlıyordu.
 * 1.7.0: FORM'da elle yerleşim yalnız akış, hikâye ve Reels
 *        (`niyetYerlesimKisiti`); form düğmesi SIGN_UP değil LEARN_MORE,
 *        inşaat/emlak/hizmet sektöründe GET_QUOTE (`formCtaTuru`).
 * 1.8.0: WHATSAPP'ta Türkçe karşılama mesajı (`page_welcome_message`,
 *        `karsilama.ts`) tek görsel ve video kreatifinde; banner setinde
 *        gönderilmiyor. Elle yerleşimde WhatsApp da yalnız akış, hikâye ve
 *        Reels (`niyetYerlesimKisiti`, FORM'la aynı küme).
 * Sürüm provanın tazeliğine bağlı: eski derleyiciyle geçmiş prova yeni
 * gövdeyi kanıtlamaz.
 */
export const DERLEYICI_SURUMU = '1.8.0';

/**
 * CLICK-TO-WHATSAPP SABİTLERİ (CLAUDE.md "CLICK-TO-WHATSAPP"). Bağlantı
 * Meta'nın belgelediği SABİT adres.
 *
 * NUMARA ARTIK SORULUYOR (Dalga 3, 2026-10-11): önceden Meta numarayı
 * `destination_type: WHATSAPP` + `promoted_object.page_id` ikilisiyle
 * sayfaya bağlı hattan alıyordu ve numara sorulmuyordu. Kullanıcı numaranın
 * SEÇİLEBİLİR olmasını istedi (birden çok hattı olan işletme) ve ölçümde
 * sayfanın `whatsapp_number` alanı boş döndü, WABA `phone_numbers` ise
 * elimizde olmayan bir izin istiyor (#200): hangi hattın kullanılacağını
 * okuyamıyoruz. Numara `promoted_object.whatsapp_phone_number` ile AÇIKÇA
 * gidiyor; sayfaya bağlı olmayan bir numarayı Meta'nın REDDETMESİ bekleniyor
 * ve bu, sessizce yanlış hatta düşmeyi açık bir hataya çeviriyor (canlı turda
 * ölçülecek, `whatsappNumarasiBicimi`).
 *
 * CTA değeri `{ app_destination }`; `{ link }` belgelenen biçim DEĞİL ve Meta
 * onu kabul edip düğmeyi tarayıcıya yönlendirebiliyor (tıklayan WhatsApp
 * yerine bir web sayfası görür).
 *
 * Eski kurucu (`meta.provider.ts#buildCreativeSpec`, Akıllı Boost/eski
 * yayın) aynı iki değeri kendi içinde yazıyor; API paketi shared'ı okuyabilir
 * ama tersi olamaz. Ayrışmayı `derle.spec.ts` iki kaynağı karşılaştırarak
 * yakalıyor.
 */
export const WHATSAPP_BAGLANTISI = 'https://api.whatsapp.com/send';
export const WHATSAPP_CTA_DEGERI = { app_destination: 'WHATSAPP' } as const;

/**
 * `promoted_object.whatsapp_phone_number` BİÇİMİ — ÖLÇÜLMEDİ. E.164 başında
 * `+` ile gönderiliyor (`+905321234567`); Meta'nın `+`sız mı istediği ve
 * geri okumada nasıl döndürdüğü canlı turda görülecek. Geri okuma yalnız
 * rakamları kıyaslıyor (yanki.ts N-17): `+` farkı aynı numara.
 */
export function whatsappNumarasiBicimi(e164: string): string {
  return e164;
}

/**
 * SATIŞTA OPTİMİZE EDİLEN OLAY. Niyet kataloğu "satış ya da kayıt" diyor ama
 * rehber yalnız satın almayı soruyor ("Sitemden satış gelsin"); kayıt dalı
 * ayrı bir soru ve ayrı bir ölçüm ister. Olay sabit yazılıyor: verilmezse
 * Meta pikselin başka bir olayına düşebilir ve reklam satış değil ziyaret
 * için optimize olur, hata vermeden.
 */
export const SATIS_OLAYI = 'PURCHASE';

/**
 * ERİŞİMDE SIKLIK SINIRI. Rehberin amaç kartı "haftada en çok 2 kez" diyor;
 * gönderilmezse Meta erişim hedefinde kendi sıklığını seçiyor ve küçük bir
 * bölgede aynı kişiye günde birkaç kez gösterebiliyor: söz yalan olur.
 * Alan reklam setinde (`frequency_control_specs`); geri okumada nasıl
 * döndüğü ÖLÇÜLMEDİ, fark çıkarsa yayın durur (kabul edilemez sınıf).
 */
export const ERISIM_SIKLIK_SINIRI = [{ event: 'IMPRESSIONS', interval_days: 7, max_frequency: 2 }] as const;

/**
 * ARAMA REKLAMINDA `link_data.link` — ÖLÇÜLMEDİ. Meta'nın Call Ads belgesi
 * örnekte bu alana "işletme SAYFASININ adresi" yazıyor, numara yalnız CTA'da
 * (`tel:+90...`). `tel:` adresini `link`e koymanın reddedildiği üçüncü taraf
 * bir kaynakta yazıyor, Meta'da doğrulanmadı. Sayfa adresi taslaktan
 * bağımsız ve her zaman var (site adresi isteğe bağlı olsaydı aynı amaç iki
 * taslakta iki farklı gövde üretirdi). Eski kurucunun yedeği de bu biçim.
 * Canlı provada Meta'nın kabul edip etmediği ve reklamda nasıl göründüğü
 * gözle doğrulanmalı.
 */
export function sayfaAdresi(sayfaPlatformId: string): string {
  return `https://facebook.com/${sayfaPlatformId}`;
}
export const DESTEKLENEN_META_SURUMLERI = ['v25.0', 'v26.0'] as const;
export type MetaApiSurumu = (typeof DESTEKLENEN_META_SURUMLERI)[number];

/**
 * Advantage+ creative anahtarları — HER BİRİ OPT_OUT. Karar 2 kitleyi ve
 * yerleşimi kapsıyor, kreatifi DEĞİL: Meta'nın kırpması ya da metni yeniden
 * yazması güvenli banda konan zorunlu uyarıyı görünmez kılabilir.
 *
 * LİSTE CANLIDA ÖLÇÜLDÜ (2026-10-07, v25.0, ilk canlı tur, prova): belgeden
 * yazılmış 23 küçük harfli anahtarın ilki (`music`) "(#100) Param key ...
 * must be one of {...}" ile reddedildi ve Meta kabul ettiği kümeyi kendisi
 * söyledi — aşağıdaki yedi BÜYÜK HARFLİ anahtar. Belgedeki `adapt_to_placement`
 * ve `pac_relaxation` bu yolda KABUL EDİLMİYOR; gönderilemeyen bir anahtarın
 * varsayılanı geri okumada izleniyor (tanınmayan anahtar OPT_IN dönerse
 * açma durur). Yeni bir anahtar ancak canlıda ölçülüp buraya girer.
 */
export const TANINAN_OZELLIK_ANAHTARLARI = [
  'IG_VIDEO_NATIVE_SUBTITLE',
  'IMAGE_ANIMATION',
  'PRODUCT_BROWSING',
  'PRODUCT_METADATA_AUTOMATION',
  'PROFILE_CARD',
  'STANDARD_ENHANCEMENTS_CATALOG',
  'TEXT_OVERLAY_TRANSLATION',
] as const;

/**
 * KREATİF ÖZELLİKLERİNİN ÜÇ SINIFI (SENTEZ S-42, A3 Ç-1/Ç-2).
 *
 * Meta belgesi bazı uyarlamaları (`adapt_to_placement`, `text_optimizations`
 * …) VARSAYILAN AÇIK sayıyor ve canlıda onları kapatan anahtarı gönderemiyoruz
 * (yalnız yukarıdaki yedi anahtar kabul ediliyor). Bugüne kadar iki hata vardı:
 * ekran "görseli ve metni değiştirmesi kapalı" diyordu (kanıtsız söz) ve geri
 * okuma tanımadığı HER açık özellikte yayını durduruyordu (Meta bu
 * varsayılanları döndürürse her yayın kilitlenirdi).
 *
 * - `kapatildi`: gönderip kapattıklarımız; geri okumada açık dönerse FARK.
 * - `bilinen_kapatilamayan`: üretken OLMAYAN uyarlama; açık dönerse yayın
 *   durmaz, onay kartında "Meta'nın otomatik yaptıkları" altında yazılır.
 * - listede olmayan her şey üretken ya da tanımsız sayılır: açık dönerse durur.
 *
 * Anahtarlar küçük harfe çevrilerek eşleşiyor: Meta aynı özelliği belgede
 * küçük, kabul kümesinde büyük harfle yazıyor.
 */
export const KAPATILAN_OZELLIK_ADLARI: Record<(typeof TANINAN_OZELLIK_ANAHTARLARI)[number], string> = {
  IG_VIDEO_NATIVE_SUBTITLE: 'Instagram videosuna otomatik altyazı',
  IMAGE_ANIMATION: 'görseli hareketlendirme',
  PRODUCT_BROWSING: 'ürün göz atma kartları',
  PRODUCT_METADATA_AUTOMATION: 'ürün bilgisini otomatik ekleme',
  PROFILE_CARD: 'profil kartı',
  STANDARD_ENHANCEMENTS_CATALOG: 'katalog iyileştirmeleri',
  TEXT_OVERLAY_TRANSLATION: 'görseldeki metni çevirme',
};

export const BILINEN_KAPATILAMAYAN_OZELLIKLER: Record<string, string> = {
  adapt_to_placement: 'görseli yerleşime göre kırpabilir',
  image_touchups: 'parlaklık ve kontrast düzeltmesi yapabilir',
  video_auto_crop: 'videoyu yerleşime göre kırpabilir',
  inline_comment: 'reklamın altında öne çıkan bir yorumu gösterebilir',
  text_optimizations: 'metnin farklı varyasyonlarını gösterebilir',
};

/**
 * Bu anahtar workspace'te zorunlu yasal uyarı varken DURDURUR: Meta'nın metin
 * varyasyonu uyarıyı düşürebilir ve bunu ilk gören müşteri olur.
 */
export const YASAL_UYARIDA_DURDURAN_OZELLIK = 'text_optimizations';

export type OzellikSinifi = 'kapatildi' | 'bilinen_kapatilamayan' | 'uretken_ya_da_tanimsiz';

export function ozellikSinifi(anahtar: string): OzellikSinifi {
  const k = anahtar.toLowerCase();
  if (TANINAN_OZELLIK_ANAHTARLARI.some((t) => t.toLowerCase() === k)) return 'kapatildi';
  if (k in BILINEN_KAPATILAMAYAN_OZELLIKLER) return 'bilinen_kapatilamayan';
  return 'uretken_ya_da_tanimsiz';
}

/**
 * Ajans geneli atıf standardı (ATF-02). Seçilmeden yayın YOK: onaysız
 * uygulanan bir değer de bir karardır ve kararın sahibi kullanıcı.
 * Etkileşim penceresi belgede `attribution_spec` karşılığı olmadığı için
 * listede yok (canlıda ölçülecek).
 */
export type AtifStandardi = (typeof ATIF_STANDARTLARI)[number];

const ATIF_SPEC: Record<AtifStandardi, Array<{ event_type: string; window_days: number }>> = {
  tik7_gor1: [
    { event_type: 'CLICK_THROUGH', window_days: 7 },
    { event_type: 'VIEW_THROUGH', window_days: 1 },
  ],
  tik7: [{ event_type: 'CLICK_THROUGH', window_days: 7 }],
};

/**
 * ATIF NİYET BAŞINA (SENTEZ S-07, A3 §2.3). Ajans standardı (7 gün tıklama
 * ± 1 gün görüntüleme) yalnız dönüşüm optimizasyonunda geçerli; site
 * ziyareti, form, sohbet, arama ve erişimde yalnız 1 gün tıklama. Her niyete
 * aynı pencereyi yazmak ya reddedilir ya da Meta onu SESSİZCE değiştirir ve
 * raporun "7 gün" dediği sayı yalan olur. 1 gün tıklama ajansın seçebileceği
 * bir standart değil, kuralın sonucu.
 *
 * FORM BURADAYDI VE YANLIŞTI — ölçüldü (2026-10-11, v25.0, Dalga 2 canlı
 * turu, Ege Birlik Yapı, anlık form): referans tablosu formu "ajans
 * standardı geçerli" sayıyordu; gerçek kurulumda reklam seti *"desteklenen
 * tıklama ve görüntüleme ilişkilendirme aralığı değerleri şunlardır: (1, 0)"*
 * ile reddedildi. Prova bunu YAKALAMADI: satır içi kampanyalı `/adsets`
 * provası bilinen 5xx ile düştüğü için set tek başına sınanamıyor ve kitle ile
 * bütçe reklam parçasında kontrol ediliyor; atıf orada yok.
 */
/*
 * LINK_CLICKS DE 1 GÜN TIKLAMA ALIYOR — ÖLÇÜLMEDİ (2026-10-12). Meta'nın
 * reklam seti başvurusu yalnız "desteklenen pencereler optimizasyon hedefine
 * göre değişir" diyor ve hedef başına tabloyu bu sürümde vermiyor (sayfa
 * okundu, tablo yok). Trafik amacında Reklam Yöneticisi'nin sunduğu tek
 * pencere 1 gün tıklama; en dar pencereyi göndermek, geniş bir pencerenin
 * sessizce daraltılmasından ya da reddedilmesinden güvenli. Form dersi
 * burada da geçerli: ret ancak GERÇEK kurulumda çıkabilir, prova seti tek
 * başına sınamıyor. Canlı ölçüm listesinde.
 */
/*
 * THRUPLAY VE REACH 1 GÜN TIKLAMA ALIYOR — ÖLÇÜLMEDİ (Dalga 3). Video
 * izlenme ve erişimde tıklama zaten sonuç değil; Meta'nın bu hedeflerde
 * hangi pencereyi kabul ettiği canlı turda görülecek. Form dersi aynen
 * geçerli: ret ancak gerçek kurulumda çıkabilir (prova seti tek başına
 * sınamıyor).
 */
export const AJANS_STANDARDI_HEDEFLERI: readonly string[] = ['OFFSITE_CONVERSIONS'];

export function atifSpec(optimizationGoal: string, standart: AtifStandardi): Array<{ event_type: string; window_days: number }> {
  return AJANS_STANDARDI_HEDEFLERI.includes(optimizationGoal) ? ATIF_SPEC[standart] : [{ event_type: 'CLICK_THROUGH', window_days: 1 }];
}

export interface Kavram {
  /**
   * Bu reklam hesabındaki `image_hash` (hesap başına; başka hesabınki
   * çalışmaz). Video fikrinde bu KAPAK görselinin hash'i: Meta video
   * reklamında kapak istiyor ve vermemek kapağı Meta'nın seçimine bırakır.
   */
  gorselHash: string;
  /** Video fikri: hesaba yüklenmiş video kimliği (ya da yer tutucusu). */
  videoId?: string;
  baslik: string;
  metin: string;
  aciklama?: string;
  /**
   * Tek görselin oranı (`banner-seti.ts`). Yerleşim kararı buna bağlı: her
   * görsel fikrinde verilirse eksik boyutun yerleşimi kapanır. Verilmeyen
   * (video, ölçüsü olmayan) bir fikir varsa yerleşim eskisi gibi otomatik
   * kalır — bilinmeyen oranla yerleşim kapatmak tahmin olurdu.
   */
  oran?: GorselOrani;
  /**
   * BANNER SETİ: fikrin boyutları (en az iki). Varsa kreatif yerleşime göre
   * görsel taşır (`asset_feed_spec`); `gorselHash` setin varsayılan görseli.
   */
  setGorselleri?: Array<{ oran: GorselOrani; gorselHash: string }>;
}

export interface DerlemeGirdisi {
  apiSurumu: MetaApiSurumu;
  yayinKimligi: string;
  /** Hesabın saat diliminde `YYYY-MM-DD`; adlarda kullanılıyor. */
  tarih: string;
  workspaceKisaAdi: string;
  /** Adda görünen amaç (rehberin sözü); verilmezse niyet kataloğu (`adlandirma.ts`). */
  amacAdi?: string;
  niyet: NiyetKodu;
  hesap: { platformId: string; paraBirimi: string };
  sayfaPlatformId: string;
  instagramPlatformId: string | null;
  hedefleme: Omit<HedeflemeGirdisi, 'advantageAudience' | 'kategoriler'>;
  kategoriler: { taban: OzelKategori[]; ek: OzelKategori[] };
  butce: Butce;
  /** ISO 8601, hesabın saat dilimi ofsetiyle. Toplam bütçede bitiş zorunlu. */
  takvim: { baslangic: string; bitis: string | null };
  atif: AtifStandardi | null;
  kavramlar: Kavram[];
  /** SITE: nihai https adresi. */
  hedefAdres: string | null;
  /** FORM: zincirde ilk kurulup geri okunan formun kimliği ya da `{form}`. */
  formId: string | null;
  /** TELEFON: aranacak numara, E.164 (`+905321234567`). Diğer niyetlerde okunmaz. */
  telefon: string | null;
  /**
   * WHATSAPP: mesajın düşeceği hat, E.164. İsteğe bağlı alan çünkü eski
   * çağıranlar (ölçüm betikleri) WhatsApp derlemiyor; WHATSAPP niyetinde
   * yoksa RET (`WA-NUMARA`), varsayılana bırakılmaz.
   */
  whatsappNumarasi?: string | null;
  /** SATIS: Meta piksel kimliği (sayısal). Yoksa RET (`PIKSEL-YOK`). */
  pikselId?: string | null;
  /**
   * WHATSAPP: karşılama mesajı ve hızlı sorular (`karsilama.ts`). Yoksa ya
   * da mesaj boşsa Türkçe VARSAYILAN gider; hiç göndermemek Meta'nın
   * İngilizce cümlesine düşmek demek. Diğer niyetlerde okunmaz.
   */
  whatsappKarsilama?: WhatsappKarsilama | null;
  /**
   * SITE: hesabın piksel hâli (`sitePikselHali`). Hedefi o seçiyor
   * (`metaOptimizasyonHedefi`); verilmezse `bilinmiyor` = tıklama. Diğer
   * niyetlerde okunmaz.
   */
  sitePikseli?: SitePikselHali | null;
  /**
   * FORM: workspace'in sektörü (`client_profiles.sektor`, serbest metin) ve
   * ürün kategorileri. Düğmeyi seçer (`formCtaTuru`); verilmezse LEARN_MORE.
   */
  sektor?: { sektor: string | null; kategoriler: readonly string[] } | null;
  urlEtiketleri: string | null;
}

export type NesneTuru = 'form' | 'kampanya' | 'reklam_seti' | 'kreatif' | 'reklam';

export interface MetaGovdesi {
  nesne: NesneTuru;
  /** Zincirdeki adı; yer tutucular buna bakar (`kreatif:2`). */
  ad: string;
  /** Hesaba göre uç: `campaigns`, `adsets`, `adcreatives`, `ads`. */
  uc: string;
  alanlar: Record<string, unknown>;
}

export interface SifirCagriRet {
  kod: string;
  mesaj: string;
}

export type DerlemeSonucu =
  | {
      tur: 'govde';
      govdeler: MetaGovdesi[];
      kapattiklarimiz: string[];
      /** Kapatamadığımız uyarlamalar: Meta bunları yapabilir (onay kartında yazılır). */
      metaOtomatikYapabilir: string[];
      acikcaYazilanAlanlar: string[];
      apiSurumu: MetaApiSurumu;
      derleyiciSurumu: string;
    }
  | { tur: 'ret'; retler: SifirCagriRet[] };

/**
 * DERLEYİCİNİN GÖVDE ÜRETTİĞİ niyetler. Diğerleri tahmin yerine retle
 * duruyor (`NYT-OLCULMEDI`).
 */
export const DERLEYICI_NIYETLERI = ['FORM', 'SITE', 'TELEFON', 'WHATSAPP', 'VIDEO_IZLENME', 'ERISIM', 'SATIS'] as const satisfies readonly NiyetKodu[];

/**
 * Bağlantısı İSTEĞE BAĞLI niyetler: tıklama sonuç değil (izlenme, erişim).
 * Site adresi varsa düğme oraya, yoksa Facebook sayfasına gider. Adres
 * zorunlu tutulsaydı sitesi olmayan işletme video reklamı veremezdi; boş
 * bırakılsaydı `link: null` giderdi ve Meta ya reddeder ya da düğmeyi
 * kendi seçtiği bir yere bağlardı.
 */
export const BAGLANTISI_ISTEGE_BAGLI_NIYETLER: readonly NiyetKodu[] = ['VIDEO_IZLENME', 'ERISIM'];

/**
 * ÜRÜNDE AÇIK niyetler: AI taslağının seçebileceği (`AI_NIYETLERI`), AdvStrategy
 * aktarımının (`aktarimEngeli`) ve matrisin "kurulabilir" dediği küme.
 * Derleyicinin gövde üretmesi ile o gövdenin CANLIDA doğrulanması ayrı iş
 * (DALGA-2: "her satır kendi commit'inde ve canlı turun kanıtıyla açılır").
 * TELEFON ve WHATSAPP Dalga 2'de derleniyor ama canlı prova ve gözle kontrol
 * yapılmadı; bu listeye girmeleri, rehberin `REHBER_ACILIS` satırıyla
 * birlikte canlı turun commit'inde olur. Ayrı tutulmasaydı derleyiciye
 * eklenen niyet AI sohbetinde ve plan aktarımında kendiliğinden açılırdı.
 */
export const DERLENEN_NIYETLER = ['FORM', 'SITE'] as const satisfies readonly (typeof DERLEYICI_NIYETLERI)[number][];

export function derleMeta(g: DerlemeGirdisi): DerlemeSonucu {
  const retler: SifirCagriRet[] = [];
  const niyet = NIYET_KATALOGU[g.niyet];

  if (!(DESTEKLENEN_META_SURUMLERI as readonly string[]).includes(g.apiSurumu)) {
    throw new Error(`Desteklenmeyen Meta API sürümü: ${g.apiSurumu}`);
  }
  if (!niyet.meta) {
    return { tur: 'ret', retler: [{ kod: 'NYT-YONLENDIRME', mesaj: `${niyet.ekranAdi} Akıllı Boost'ta yapılır.` }] };
  }
  if (!(DERLEYICI_NIYETLERI as readonly NiyetKodu[]).includes(g.niyet)) {
    retler.push({
      kod: 'NYT-OLCULMEDI',
      mesaj: `"${niyet.ekranAdi}" henüz yayınlanamıyor: Meta'daki kurulumu canlıda doğrulanmadı.`,
    });
  }
  if (g.atif === null) {
    retler.push({
      kod: 'OK-16',
      mesaj: 'Atıf standardı henüz seçilmedi. Ajans yöneticisi seçene kadar yeni reklam yayınlanamaz.',
    });
  }
  if (g.kavramlar.length < 1 || g.kavramlar.length > 5) {
    retler.push({ kod: 'KRT-SAYI', mesaj: 'Bir reklamda 1 ile 5 arasında fikir olur.' });
  }
  for (const [i, k] of g.kavramlar.entries()) {
    // VİDEO İZLENME: her fikir video olmalı. Görsel fikri THRUPLAY ile
    // kurulursa Meta "video izlenmesi" için optimize edecek bir şey bulamaz;
    // ya reddeder ya da harcar ve sonuç sıfır görünür.
    if (g.niyet === 'VIDEO_IZLENME' && !k.videoId) retler.push({ kod: 'KRT-VIDEO-ZORUNLU', mesaj: `Fikir ${i + 1}: bu amaçta yalnız video kullanılır.` });
    if (!k.gorselHash) retler.push({ kod: 'KRT-GORSEL', mesaj: `Fikir ${i + 1}: görsel bu hesaba yüklenmemiş.` });
    if (!k.baslik.trim() || !k.metin.trim()) {
      retler.push({ kod: 'KRT-METIN', mesaj: `Fikir ${i + 1}: başlık ya da metin boş.` });
    }
    if (k.setGorselleri) {
      const oranlar = k.setGorselleri.map((x) => x.oran);
      if (k.videoId) retler.push({ kod: 'KRT-SET', mesaj: `Fikir ${i + 1}: banner seti yalnız görsellerden oluşur.` });
      if (new Set(oranlar).size !== oranlar.length) retler.push({ kod: 'KRT-SET', mesaj: `Fikir ${i + 1}: sette aynı boyuttan iki görsel var.` });
      if (k.setGorselleri.length < 2) retler.push({ kod: 'KRT-SET', mesaj: `Fikir ${i + 1}: set en az iki boyut taşır.` });
      // Kural tek yerde (`BANNER_SETI_NIYETLERI`); rehber bu amaçlarda
      // görselleri zaten gruplamıyor (`setlereAyir`), ret ikinci kapı.
      if (!bannerSetiDestekleniyor(g.niyet)) retler.push({ kod: 'KRT-SET', mesaj: `Fikir ${i + 1}: banner seti şimdilik yalnız "Siteme gelsinler" amacında.` });
    }
  }
  const yerlesim = yerlesimPlani(g.kavramlar, g.niyet);
  if (!yerlesim && g.kavramlar.some((k) => k.setGorselleri)) {
    // Bir fikir videoysa yerleşim otomatik kalır ve set tek görsele inerdi:
    // kullanıcının yüklediği boyutlar sessizce kaybolurdu.
    retler.push({ kod: 'KRT-SET', mesaj: 'Banner seti ve video aynı reklamda birlikte kullanılamaz.' });
  }
  if (yerlesim && Object.keys(yerlesim.gruplar).length === 0) {
    // Niyet kısıtı yüzünden boş kaldıysa sebep o: "1.91:1 ekle" demek
    // kullanıcıyı formun gösterilmeyeceği bir yer için görsele gönderirdi.
    retler.push(
      yerlesim.niyetKapanan.length
        ? { kod: 'KRT-ORAN', mesaj: `${g.niyet === 'WHATSAPP' ? 'WhatsApp' : 'Form'} reklamı yalnız akış, hikâye ve Reels’te gösterilir; 4:5, 1:1 ya da 9:16 görsel ekle.` }
        : { kod: 'KRT-ORAN', mesaj: 'Görsellerin hiçbiri bir yerleşime uymuyor; 4:5, 1:1, 9:16 ya da 1.91:1 boyut ekle.' },
    );
  }
  const adresGecerli = !!g.hedefAdres && /^https:\/\/[^\s/]+\.[^\s]+/.test(g.hedefAdres);
  // SATIS da siteye gönderiyor: adressiz satış reklamı `link: null` kurardı.
  // İsteğe bağlı niyetlerde VERİLEN adres yine geçerli olmalı.
  const adresZorunlu = g.niyet === 'SITE' || g.niyet === 'SATIS';
  const adresIstegeBagli = BAGLANTISI_ISTEGE_BAGLI_NIYETLER.includes(g.niyet);
  if ((adresZorunlu && !adresGecerli) || (adresIstegeBagli && g.hedefAdres && !adresGecerli)) {
    retler.push({ kod: 'SITE-ADRES', mesaj: 'Site adresi https:// ile başlayan geçerli bir adres olmalı.' });
  }
  if (g.niyet === 'WHATSAPP' && !(g.whatsappNumarasi && TELEFON_E164.test(g.whatsappNumarasi))) {
    retler.push({ kod: 'WA-NUMARA', mesaj: 'WhatsApp numarası +90 ile başlamalı.' });
  }
  if (g.niyet === 'SATIS' && !(g.pikselId && /^\d{1,30}$/.test(g.pikselId))) {
    retler.push({ kod: 'PIKSEL-YOK', mesaj: 'Meta pikseli seçilmedi.' });
  }
  if (g.niyet === 'FORM' && !g.formId) {
    retler.push({ kod: 'FORM-YOK', mesaj: 'Form seçilmedi.' });
  }
  if (g.niyet === 'TELEFON' && !(g.telefon && TELEFON_E164.test(g.telefon))) {
    // Numarasız ya da ülke kodsuz bir arama reklamı kurulmaz: `tel:` boş
    // gider ya da Meta numarayı başka bir ülkeninki sayar.
    retler.push({ kod: 'TEL-YOK', mesaj: 'Telefon numarası +90 gibi ülke koduyla yazılmalı.' });
  }
  if (g.butce.seviye !== 'kampanya') {
    // ABO yalnız Gelişmiş'te ve paylaşım alanı kuralıyla; bu turda yok.
    retler.push({ kod: 'BTC-02', mesaj: 'Reklam seti bütçesi bu sürümde desteklenmiyor.' });
  }
  if (g.butce.tip === 'toplam' && !g.takvim.bitis) {
    retler.push({ kod: 'BTC-02', mesaj: 'Toplam bütçede Meta bitiş tarihi istiyor.' });
  }
  let butceMinor: bigint | null = null;
  try {
    butceMinor = microsToMinor(g.butce.micros, g.hesap.paraBirimi);
    if (butceMinor <= 0n) throw new Error('sıfır');
  } catch {
    retler.push({ kod: 'BTC-01', mesaj: 'Bütçe tutarı bu para biriminde geçerli değil.' });
  }

  const kategoriler = etkinKategoriler(g.kategoriler.taban, g.kategoriler.ek);
  // Sağlık turizmi dalı (advantage 0) burada yok: dal sektör profilinden
  // gelecek; o güne kadar yeni modül her yayında 1 yazıyor (karar 2).
  const hedef = hedeflemeUret({ ...g.hedefleme, advantageAudience: 1, kategoriler });
  if (hedef.tur === 'ret') retler.push(...hedef.retler);

  if (retler.length > 0 || hedef.tur === 'ret' || butceMinor === null) return { tur: 'ret', retler };

  const m = niyet.meta;
  // GİDEN HEDEF katalogdan değil TEK karardan: SITE'de piksele bağlı.
  const optimizasyon = metaOptimizasyonHedefi(g.niyet, g.sitePikseli);
  const adG = {
    workspaceKisaAdi: g.workspaceKisaAdi,
    niyet: g.niyet,
    tarih: g.tarih,
    yayinKimligi: g.yayinKimligi,
    ...(g.amacAdi ? { amacAdi: g.amacAdi } : {}),
  };
  const etiketler = adlabels(g.yayinKimligi);
  // KARŞILAMA yalnız WhatsApp'ta; tek görsel ve video kreatifinde aynı gövde.
  const karsilama = g.niyet === 'WHATSAPP' ? sayfaKarsilamaMesaji(karsilamaCoz(g.whatsappKarsilama)) : null;
  let karsilamaSetteGitmedi = false;

  const kampanya: Record<string, unknown> = {
    name: ACILMADI_ONEKI + kampanyaAdi(adG),
    objective: m.objective,
    status: 'PAUSED',
    special_ad_categories: kategoriler,
    // CBO: bütçe kampanyada; paylaşım alanı GÖNDERİLMEZ (true → 4834002).
    [g.butce.tip === 'gunluk' ? 'daily_budget' : 'lifetime_budget']: butceMinor.toString(),
    // Yazılmayınca hesap varsayılanına kalıyor; iki müşteride iki teklif.
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    adlabels: etiketler,
  };
  if (kategoriler.length > 0) {
    // Boş bırakılırsa Meta HESABIN VERGİ ÜLKESİNE düşer.
    kampanya.special_ad_category_country = hedef.ulkeler;
  }

  const reklamSeti: Record<string, unknown> = {
    name: ACILMADI_ONEKI + reklamSetiAdi(adG),
    campaign_id: '{kampanya}',
    status: 'PAUSED',
    billing_event: 'IMPRESSIONS',
    optimization_goal: optimizasyon,
    promoted_object: tanitilanNesne(g),
    // ELLE YERLEŞİM yalnız bir boyut eksikse: eksik boyutun yerleşimi kapanır
    // (kullanıcı kararı). Dört boyut tamsa ya da oran bilinmiyorsa alanlar
    // yazılmaz ve Advantage+ yerleşim kalır.
    targeting: yerlesim && !yerlesim.otomatik ? { ...hedef.targeting, ...elleYerlesim(yerlesim, !!g.instagramPlatformId, g.niyet) } : hedef.targeting,
    attribution_spec: atifSpec(optimizasyon, g.atif!),
    start_time: g.takvim.baslangic,
    adlabels: etiketler,
  };
  if (m.destinationType) reklamSeti.destination_type = m.destinationType;
  if (optimizasyon === 'REACH') reklamSeti.frequency_control_specs = ERISIM_SIKLIK_SINIRI.map((x) => ({ ...x }));
  if (g.takvim.bitis) reklamSeti.end_time = g.takvim.bitis;

  const govdeler: MetaGovdesi[] = [
    { nesne: 'kampanya', ad: 'kampanya', uc: 'campaigns', alanlar: kampanya },
    { nesne: 'reklam_seti', ad: 'reklam_seti', uc: 'adsets', alanlar: reklamSeti },
  ];

  g.kavramlar.forEach((k, i) => {
    const n = i + 1;
    // CTA HER kavramda aynı biçim: eski kodda 2.+ reklam CTA'sız kuruluyordu.
    const cta = ctaDegeri(g, g.niyet === 'FORM' ? formCtaTuru(g.sektor) : m.cta);
    const oss: Record<string, unknown> = { page_id: g.sayfaPlatformId };
    let setKreatifi: Record<string, unknown> | null = null;
    if (k.videoId) {
      // VİDEO: `video_data` — başlık `title`, kapak `image_hash`, CTA aynı
      // biçim. `link_data` ile video karıştırılmaz: link_data'ya video
      // koymak Meta'da görsel reklam açar.
      const videoData: Record<string, unknown> = {
        video_id: k.videoId,
        image_hash: k.gorselHash,
        title: k.baslik,
        message: k.metin,
        call_to_action: g.niyet === 'FORM' ? { ...cta, value: { lead_gen_form_id: g.formId, link: 'http://fb.me/' } } : cta,
      };
      if (k.aciklama) videoData.link_description = k.aciklama;
      // VİDEODA KONUM ÖLÇÜLMEDİ: belge video örneği vermiyor; `link_data`
      // ile aynı düzeyde yazılıyor (yönetici kararı), geri okuma kökte de arar.
      if (karsilama) videoData.page_welcome_message = karsilama;
      oss.video_data = videoData;
    } else if (k.setGorselleri && yerlesim) {
      // `link_data` YOK: görseller ve metin `asset_feed_spec`te; sayfa ve
      // Instagram kimliği `object_story_spec`te kalıyor (aşağıda).
      setKreatifi = varlikAkisi(k, setPlani(k.setGorselleri.map((x) => x.oran)), yerlesim, cta, DEGERLI_CTA_NIYETLERI.includes(g.niyet), kreatifBaglantisi(g)!, !!g.instagramPlatformId, g.niyet);
      // Varlık akışında karşılamanın yeri belgede YOK: tahminle bir anahtar
      // yazmak Meta'nın onu kabul edip yok sayması demek olabilirdi. Gitmiyor
      // ve onay kartı bunu söylüyor (`KARSILAMA_SETTE_YOK_CUMLESI`).
      if (karsilama) karsilamaSetteGitmedi = true;
    } else {
      const linkData: Record<string, unknown> = {
        image_hash: k.gorselHash,
        name: k.baslik,
        message: k.metin,
        call_to_action: cta,
        link: kreatifBaglantisi(g),
      };
      if (k.aciklama) linkData.description = k.aciklama;
      // Resmî belgenin oluşturma örneğindeki konum (`link_data` içi).
      if (karsilama) linkData.page_welcome_message = karsilama;
      oss.link_data = linkData;
    }
    // IG seçiliyse daima: yoksa Instagram'da HİÇ yayın olmaz, hata da yok.
    if (g.instagramPlatformId) oss.instagram_user_id = g.instagramPlatformId;

    const kreatif: Record<string, unknown> = {
      name: kreatifAdi(adG, n, ACILMADI_ONEKI),
      object_story_spec: oss,
      ...(setKreatifi ? { asset_feed_spec: setKreatifi } : {}),
      degrees_of_freedom_spec: {
        creative_features_spec: Object.fromEntries(
          TANINAN_OZELLIK_ANAHTARLARI.map((a) => [a, { enroll_status: 'OPT_OUT' }]),
        ),
      },
      // Varsayılan OPT_IN: reklam başka markaların reklamlarıyla yan yana.
      contextual_multi_ads: { enroll_status: 'OPT_OUT' },
      adlabels: etiketler,
    };
    if (g.urlEtiketleri) kreatif.url_tags = g.urlEtiketleri;
    govdeler.push({ nesne: 'kreatif', ad: `kreatif:${n}`, uc: 'adcreatives', alanlar: kreatif });
    govdeler.push({
      nesne: 'reklam',
      ad: `reklam:${n}`,
      uc: 'ads',
      alanlar: {
        name: ACILMADI_ONEKI + reklamAdi(adG, n),
        adset_id: '{reklam_seti}',
        creative: { creative_id: `{kreatif:${n}}` },
        status: 'PAUSED',
        adlabels: etiketler,
      },
    });
  });

  const acikcaYazilanAlanlar = govdeler.flatMap((gv) => alanYollari(gv.nesne, gv.alanlar)).filter(tekil);
  manifestoDogrula(govdeler, {
    kategoriVar: kategoriler.length > 0,
    instagram: !!g.instagramPlatformId,
    elleYerlesim: !!yerlesim && !yerlesim.otomatik,
    tanitilan: tanitilanTuru(g.niyet),
    erisim: optimizasyon === 'REACH',
    karsilama: !!karsilama,
  });

  return {
    tur: 'govde',
    govdeler,
    // YALNIZ gerçekten gönderdiklerimiz. Kapatamadıklarımız ayrı listede ve
    // "yapabilir" diye yazılıyor; geri okumada açık dönerse onay kartı söyler.
    kapattiklarimiz: [
      ...hedef.kapatilanlar,
      ...(yerlesim?.kapanan.length
        ? [`Görseli olmadığı için kapalı yerleşimler: ${yerlesim.kapanan.map((x) => YERLESIM_GRUPLARI[x].etiket).join(', ')}.`]
        : []),
      ...(yerlesim?.niyetKapanan.length ? [niyetYerlesimKisiti(g.niyet)!.aciklama] : []),
      'Başka markaların reklamlarıyla yan yana gösterim kapalı.',
      `Kapattığımız otomatik özellikler: ${Object.values(KAPATILAN_OZELLIK_ADLARI).join(', ')}.`,
    ],
    metaOtomatikYapabilir: [...Object.values(BILINEN_KAPATILAMAYAN_OZELLIKLER), ...(karsilamaSetteGitmedi ? [KARSILAMA_SETTE_YOK_CUMLESI] : [])],
    acikcaYazilanAlanlar,
    apiSurumu: g.apiSurumu,
    derleyiciSurumu: DERLEYICI_SURUMU,
  };
}

/**
 * Bütün fikirlerin ortak yerleşim planı; bir fikrin oranı bilinmiyorsa
 * (video, ölçüsüz eski kayıt) `null` = eski davranış (Advantage+ yerleşim).
 */
export function yerlesimPlani(kavramlar: readonly Kavram[], niyet?: NiyetKodu | null): SetPlani | null {
  // Fikir yoksa plan da yok: KRT-SAYI zaten söylüyor, "hiçbir yerleşime
  // uymuyor" demek yanlış sebep olurdu.
  if (kavramlar.length === 0) return null;
  const setler: GorselOrani[][] = [];
  for (const k of kavramlar) {
    if (k.videoId) return null;
    if (k.setGorselleri) setler.push(k.setGorselleri.map((x) => x.oran));
    else if (k.oran) setler.push([k.oran]);
    else return null;
  }
  // Banner seti varsa kesişim, yoksa birleşim (`reklamSetiPlani`).
  return reklamSetiPlani(setler, niyet);
}

/**
 * Grubun Meta konumları; Instagram hesabı yoksa Instagram DÜŞER. Karar
 * tablosu o hâlde "Instagram'da gösterilmez" diyor; elle yerleşime Instagram
 * yazmak sözü bozardı (Meta sayfayı Instagram kimliği yerine kullanabiliyor).
 */
function grupKonumlari(g: YerlesimGrubu, instagram: boolean, niyet: NiyetKodu): Record<string, string[]> {
  // Niyetin çıkardığı konumlar (FORM'da Keşfet) TEK YERDEN: reklam seti
  // yerleşimi ile banner setinin yerleşim kuralları aynı listeyi görmeli.
  const m = grupMetaKonumlari(g, niyet);
  const out: Record<string, string[]> = {};
  for (const [alan, degerler] of Object.entries(m)) {
    if (!instagram && alan === 'instagram_positions') continue;
    out[alan] = alan === 'publisher_platforms' && !instagram ? degerler.filter((x) => x !== 'instagram') : [...degerler];
  }
  return out;
}

/** Açık grupların Meta konumları birleşimi (elle yerleşim). */
function elleYerlesim(p: SetPlani, instagram: boolean, niyet: NiyetKodu): Record<string, string[]> {
  const birlesim: Record<string, Set<string>> = {};
  for (const g of YERLESIM_SIRASI) {
    if (!p.gruplar[g]) continue;
    for (const [alan, degerler] of Object.entries(grupKonumlari(g, instagram, niyet))) {
      for (const v of degerler) (birlesim[alan] ??= new Set()).add(v);
    }
  }
  return Object.fromEntries(Object.entries(birlesim).map(([k, v]) => [k, [...v].sort()]));
}

/** Etiket: görsel `adv_<oran>`, metin alanları sabit. Kurallar etiketle eşleşir. */
const SET_ETIKETI = (o: GorselOrani) => `adv_${o}`;
const METIN_ETIKETLERI = { body_label: 'adv_metin', title_label: 'adv_baslik', link_url_label: 'adv_baglanti', description_label: 'adv_aciklama' } as const;

/**
 * YERLEŞİME GÖRE GÖRSEL — `meta-yerlesim-prova` ile ölçüldü (2026-10-10,
 * v25.0): bu biçim validate_only'den geçiyor. AMA kapsamayan kural setini de
 * geçiriyor (negatif kontrol), yani Meta kuralların eksiksizliğini
 * DENETLEMİYOR: eksiksizliği bu fonksiyon garanti eder. Her açık grup bir
 * kural, SONDA bir varsayılan kural (Meta kuralları sırayla değerlendiriyor,
 * ilk eşleşen kazanıyor). Metinler de etiketli: kuralın her varlık türünü
 * açıkça seçmesi, seçimi Meta'nın yorumuna bırakmıyor.
 */
/**
 * Düğmesi DEĞER taşıyan amaçlar (form kimliği, WhatsApp hedefi, `tel:`
 * numarası). Setlerinde düğme `call_to_actions` ile gider: düz tür listesi
 * (`call_to_action_types`) değeri taşımıyor ve Meta onu da doğrulamada
 * KABUL EDİYOR (ölçüldü 2026-10-12) — form kimliği olmayan bir form reklamı.
 */
const DEGERLI_CTA_NIYETLERI: readonly NiyetKodu[] = ['FORM', 'WHATSAPP', 'TELEFON'];

function varlikAkisi(
  k: Kavram,
  kendi: SetPlani,
  ortak: SetPlani,
  cta: Record<string, unknown>,
  ctaDegerli: boolean,
  link: string,
  instagram: boolean,
  niyet: NiyetKodu,
): Record<string, unknown> {
  const hash = new Map(k.setGorselleri!.map((x) => [x.oran, x.gorselHash]));
  const metinler = (kural: Record<string, unknown>) => ({
    ...kural,
    body_label: { name: METIN_ETIKETLERI.body_label },
    title_label: { name: METIN_ETIKETLERI.title_label },
    link_url_label: { name: METIN_ETIKETLERI.link_url_label },
    ...(k.aciklama ? { description_label: { name: METIN_ETIKETLERI.description_label } } : {}),
  });
  const kurallar: Array<Record<string, unknown>> = [];
  for (const g of YERLESIM_SIRASI) {
    if (!ortak.gruplar[g]) continue;
    // Ortak planda açık grup, her sette dolu (ortakPlan); oran SETE göre.
    const oran = kendi.gruplar[g]!;
    const yer = grupKonumlari(g, instagram, niyet);
    // Instagram'sız "yan" dışı bir grup yalnız Facebook'a iner; Facebook da
    // yoksa kural boş kalır ve yazılmaz.
    if (!yer.publisher_platforms?.length) continue;
    kurallar.push(metinler({ customization_spec: yer, image_label: { name: SET_ETIKETI(oran) } }));
  }
  // VARSAYILAN KURAL BOŞ customization_spec İLE VE EN SONDA — ölçüldü
  // (2026-10-10, v25.0, gerçek prova, `adcreatives` ucu): dört platformu
  // açıkça sayan varsayılan "Boş özelleştirme teknik özellikleriyle Varsayılan
  // Varlık Özelleştirmesi Kuralı (en düşük öncelikle) gereklidir" ile
  // REDDEDİLDİ. `/ads` ucundaki satır içi ölçüm bunu yakalamamıştı; kreatif
  // ucu daha sıkı. Boş tanım = reklam setinin yerleşimlerinden kurallarca
  // kapsanmayan her yer: otomatik yerleşimde kare, elle yerleşimde ilk açık
  // grubun görseli.
  const varsayilanOran: GorselOrani = ortak.otomatik ? 'kare' : kendi.gruplar[YERLESIM_SIRASI.find((g) => ortak.gruplar[g])!]!;
  // ortakPlan bunu imkânsız kılıyor (otomatik = her sette kare); yine de
  // varsayılanı olmayan bir kural seti sessizce gösterimsiz yerleşim demek.
  if (!hash.has(varsayilanOran)) throw new Error(`Setin varsayılan görseli yok: ${ORAN_ETIKETI[varsayilanOran]}`);
  kurallar.push(metinler({ customization_spec: {}, image_label: { name: SET_ETIKETI(varsayilanOran) } }));

  return {
    images: k.setGorselleri!.map((x) => ({ hash: x.gorselHash, adlabels: [{ name: SET_ETIKETI(x.oran) }] })),
    bodies: [{ text: k.metin, adlabels: [{ name: METIN_ETIKETLERI.body_label }] }],
    titles: [{ text: k.baslik, adlabels: [{ name: METIN_ETIKETLERI.title_label }] }],
    ...(k.aciklama ? { descriptions: [{ text: k.aciklama, adlabels: [{ name: METIN_ETIKETLERI.description_label }] }] } : {}),
    link_urls: [{ website_url: link, adlabels: [{ name: METIN_ETIKETLERI.link_url_label }] }],
    ...(ctaDegerli ? { call_to_actions: [cta] } : { call_to_action_types: [cta.type] }),
    ad_formats: ['SINGLE_IMAGE'],
    /*
     * YERLEŞİM ÖZELLEŞTİRMESİ AÇIKÇA — üç gerçek prova (2026-10-10, v25.0):
     * bu alan yokken Meta kuralları HEDEFLEME (segment) kuralı sayıyor: önce
     * "All non-default target rules must contain geolocation customization",
     * kurala konum eklenince "(#2715) Segment Asset Customization API has
     * been deprecated from v22". İkisi de yanlış yoldu; kural yerleşim seçiyor.
     */
    optimization_type: 'PLACEMENT',
    asset_customization_rules: kurallar.map((r, i) => ({ ...r, priority: i + 1 })),
  };
}

/** Reklam setinin `promoted_object` türü (manifesto ve gövde aynı kuralı okur). */
export function tanitilanTuru(niyet: NiyetKodu): 'sayfa' | 'piksel' | 'whatsapp' {
  if (NIYET_KATALOGU[niyet].meta?.promotedObject === 'pixel_id+custom_event_type') return 'piksel';
  return niyet === 'WHATSAPP' ? 'whatsapp' : 'sayfa';
}

/**
 * Reklam setinin `promoted_object`i. Niyet kataloğunun `promotedObject`
 * sütunu KARARI veriyor; burada yalnız değerler dolduruluyor.
 * - SATIS: piksel + olay. Sayfa kimliği YOK: satış optimizasyonunu taşıyan
 *   piksel; sayfa reklamın kimliği olarak kreatifte zaten var.
 * - WHATSAPP: sayfa + numara (numara notu: `whatsappNumarasiBicimi`).
 * - diğerleri: sayfa.
 */
function tanitilanNesne(g: DerlemeGirdisi): Record<string, unknown> {
  switch (tanitilanTuru(g.niyet)) {
    case 'piksel':
      return { pixel_id: g.pikselId, custom_event_type: SATIS_OLAYI };
    case 'whatsapp':
      return { page_id: g.sayfaPlatformId, whatsapp_phone_number: whatsappNumarasiBicimi(g.whatsappNumarasi!) };
    default:
      return { page_id: g.sayfaPlatformId };
  }
}

/**
 * Niyete göre CTA. Bağlantıyı TAŞIMAYAN üç dal ayrı ayrı yazılı: SITE dışı
 * bir niyete `{ link: hedefAdres }` düşmesi, WhatsApp ya da arama düğmesini
 * sessizce bir web sayfasına çevirir.
 */
function ctaDegeri(g: DerlemeGirdisi, tip: string): Record<string, unknown> {
  switch (g.niyet) {
    case 'FORM':
      return { type: tip, value: { lead_gen_form_id: g.formId } };
    case 'WHATSAPP':
      return { type: tip, value: { ...WHATSAPP_CTA_DEGERI } };
    case 'TELEFON':
      // Meta Call Ads belgesi: numara `tel:` ve ülke koduyla, CTA değerinde.
      return { type: tip, value: { link: `tel:${g.telefon}` } };
    default:
      // İsteğe bağlı bağlantıda (izlenme, erişim) adres yoksa sayfa:
      // `kreatifBaglantisi` ile AYNI değer, düğme ve bağlantı ayrışmasın.
      return { type: tip, value: { link: kreatifBaglantisi(g) } };
  }
}

/** `link_data.link`: tıklamanın düştüğü yer CTA'da; bu alan yine zorunlu. */
function kreatifBaglantisi(g: DerlemeGirdisi): string | null {
  switch (g.niyet) {
    // Tıklama formu açıyor; Meta'nın belgelediği sabit bağlantı.
    case 'FORM':
      return 'http://fb.me/';
    case 'WHATSAPP':
      return WHATSAPP_BAGLANTISI;
    // ÖLÇÜLMEDİ, `sayfaAdresi` notu.
    case 'TELEFON':
      return sayfaAdresi(g.sayfaPlatformId);
    // ÖLÇÜLMEDİ: sayfa adresinin video/erişim reklamında bağlantı olarak
    // kabul edildiği, TELEFON'daki gibi canlı provada görülecek.
    case 'VIDEO_IZLENME':
    case 'ERISIM':
      return g.hedefAdres ?? sayfaAdresi(g.sayfaPlatformId);
    default:
      return g.hedefAdres;
  }
}

function tekil<T>(v: T, i: number, a: T[]): boolean {
  return a.indexOf(v) === i;
}

function alanYollari(nesne: string, o: Record<string, unknown>, onek = ''): string[] {
  return Object.entries(o).flatMap(([k, v]) => {
    const yol = onek ? `${onek}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return [`${nesne}:${yol}`, ...alanYollari(nesne, v as Record<string, unknown>, yol)];
    }
    return [`${nesne}:${yol}`];
  });
}

/**
 * MANİFESTO (§ 06.4): her satır ilgili nesnede AÇIKÇA yazılmış olmalı.
 * Gönderilmeyen alan kararı hesabın varsayılanına bırakır ve aynı kod iki
 * müşteride farklı davranır, hata dönmeden.
 */
/** `yol` dizi ise alternatiflerden BİRİ yazılmış olmalı (görsel ya da video kreatifi). */
/**
 * `kosul`: satır yalnız o hâlde zorunlu. M-10 dallara ayrıldı (Dalga 3):
 * sayfa kimliği SATIŞTA yok (piksel taşıyor), WhatsApp'ta numara da var.
 */
export type ManifestoKosulu = 'kategori' | 'instagram' | 'sayfa' | 'piksel' | 'whatsapp' | 'erisim';
export const MANIFESTO: ReadonlyArray<{ kod: string; nesne: NesneTuru; yol: string | readonly string[]; kosul?: ManifestoKosulu }> = [
  { kod: 'M-01', nesne: 'kampanya', yol: 'status' },
  { kod: 'M-01', nesne: 'reklam_seti', yol: 'status' },
  { kod: 'M-01', nesne: 'reklam', yol: 'status' },
  { kod: 'M-02', nesne: 'kampanya', yol: 'objective' },
  { kod: 'M-03', nesne: 'kampanya', yol: 'special_ad_categories' },
  { kod: 'M-04', nesne: 'kampanya', yol: 'special_ad_category_country', kosul: 'kategori' },
  { kod: 'M-06', nesne: 'kampanya', yol: 'bid_strategy' },
  { kod: 'M-07', nesne: 'reklam_seti', yol: 'billing_event' },
  { kod: 'M-08', nesne: 'reklam_seti', yol: 'optimization_goal' },
  { kod: 'M-10', nesne: 'reklam_seti', yol: 'promoted_object.page_id', kosul: 'sayfa' },
  { kod: 'M-10', nesne: 'reklam_seti', yol: 'promoted_object.page_id', kosul: 'whatsapp' },
  { kod: 'M-10P', nesne: 'reklam_seti', yol: 'promoted_object.pixel_id', kosul: 'piksel' },
  { kod: 'M-10P', nesne: 'reklam_seti', yol: 'promoted_object.custom_event_type', kosul: 'piksel' },
  { kod: 'M-10W', nesne: 'reklam_seti', yol: 'promoted_object.whatsapp_phone_number', kosul: 'whatsapp' },
  { kod: 'M-11F', nesne: 'reklam_seti', yol: 'frequency_control_specs', kosul: 'erisim' },
  { kod: 'M-12', nesne: 'reklam_seti', yol: 'start_time' },
  { kod: 'M-13', nesne: 'reklam_seti', yol: 'targeting.targeting_automation.advantage_audience' },
  { kod: 'M-14', nesne: 'reklam_seti', yol: 'targeting.age_min' },
  { kod: 'M-16', nesne: 'reklam_seti', yol: 'targeting.user_age_unknown' },
  { kod: 'M-18', nesne: 'reklam_seti', yol: 'targeting.geo_locations' },
  { kod: 'M-21', nesne: 'reklam_seti', yol: 'attribution_spec' },
  { kod: 'M-24', nesne: 'kreatif', yol: 'object_story_spec.instagram_user_id', kosul: 'instagram' },
  { kod: 'M-25', nesne: 'kreatif', yol: ['object_story_spec.link_data.call_to_action', 'object_story_spec.video_data.call_to_action', 'asset_feed_spec.call_to_action_types', 'asset_feed_spec.call_to_actions'] },
  // M-26/M-27: belgedeki adapt_to_placement ve pac_relaxation canlıda
  // reddedildi (yukarıdaki not); manifesto ölçülen kümeden iki satır taşıyor,
  // derle.spec bütün kümeyi ayrıca tarıyor.
  { kod: 'M-26', nesne: 'kreatif', yol: 'degrees_of_freedom_spec.creative_features_spec.IMAGE_ANIMATION' },
  { kod: 'M-27', nesne: 'kreatif', yol: 'degrees_of_freedom_spec.creative_features_spec.TEXT_OVERLAY_TRANSLATION' },
  { kod: 'M-28', nesne: 'kreatif', yol: 'contextual_multi_ads.enroll_status' },
  { kod: 'M-35', nesne: 'reklam', yol: 'creative.creative_id' },
  { kod: 'M-35', nesne: 'reklam', yol: 'adset_id' },
  { kod: 'M-36', nesne: 'kampanya', yol: 'adlabels' },
  { kod: 'M-36', nesne: 'reklam_seti', yol: 'adlabels' },
  { kod: 'M-36', nesne: 'kreatif', yol: 'adlabels' },
  { kod: 'M-36', nesne: 'reklam', yol: 'adlabels' },
];

/** Yerleşim BİLEREK boş: Advantage+ yerleşim yalnız bu alanların yokluğuyla tanımlı. */
const YASAK_YERLESIM = ['publisher_platforms', 'facebook_positions', 'instagram_positions', 'messenger_positions', 'audience_network_positions'];

function deger(o: Record<string, unknown>, yol: string): unknown {
  return yol.split('.').reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Record<string, unknown>)[k] : undefined), o);
}

export interface ManifestoHali {
  kategoriVar: boolean;
  instagram: boolean;
  elleYerlesim: boolean;
  tanitilan: 'sayfa' | 'piksel' | 'whatsapp';
  erisim: boolean;
  /** WHATSAPP: banner seti DIŞINDAKİ her kreatif karşılama taşımalı. */
  karsilama?: boolean;
}

/** Bu hâlde satır zorunlu mu (testler de AYNI kuralı okuyor). */
export function manifestoSatiriGecerli(kosul: ManifestoKosulu | undefined, d: Omit<ManifestoHali, 'elleYerlesim' | 'karsilama'>): boolean {
  switch (kosul) {
    case undefined:
      return true;
    case 'kategori':
      return d.kategoriVar;
    case 'instagram':
      return d.instagram;
    case 'erisim':
      return d.erisim;
    default:
      return d.tanitilan === kosul;
  }
}

function manifestoDogrula(govdeler: MetaGovdesi[], d: ManifestoHali): void {
  for (const satir of MANIFESTO) {
    if (!manifestoSatiriGecerli(satir.kosul, d)) continue;
    for (const gv of govdeler.filter((x) => x.nesne === satir.nesne)) {
      const yollar = typeof satir.yol === 'string' ? [satir.yol] : satir.yol;
      const v = yollar.map((y) => deger(gv.alanlar, y)).find((x) => x !== undefined && x !== null);
      if (v === undefined || v === null) {
        throw new Error(`Manifesto ${satir.kod}: ${gv.ad} içinde ${satir.yol} yazılmadı`);
      }
    }
  }
  // M-29W: karşılama MANİFESTO TABLOSUNDA DEĞİL çünkü kural kreatife göre
  // değişiyor: banner setli kreatifte yeri belgede yok ve gönderilmiyor.
  // Tabloya koşulsuz yazılsaydı setli WhatsApp reklamı derlenemezdi; hiç
  // yazılmasaydı karşılamasız tek görsel reklam sessizce İngilizce açılırdı.
  if (d.karsilama) {
    for (const gv of govdeler.filter((x) => x.nesne === 'kreatif' && !x.alanlar.asset_feed_spec)) {
      const v = deger(gv.alanlar, 'object_story_spec.link_data.page_welcome_message') ?? deger(gv.alanlar, 'object_story_spec.video_data.page_welcome_message');
      if (!v) throw new Error(`Manifesto M-29W: ${gv.ad} içinde page_welcome_message yazılmadı`);
    }
  }
  for (const gv of govdeler.filter((x) => x.nesne === 'reklam_seti')) {
    const t = (gv.alanlar.targeting ?? {}) as Record<string, unknown>;
    if (!d.elleYerlesim) {
      for (const y of YASAK_YERLESIM) {
        if (y in t) throw new Error(`Yerleşim alanı yazıldı (${y}); Advantage+ yerleşim kapanır`);
      }
    } else if (!('publisher_platforms' in t)) {
      // Eksik boyut kararı verildi ama yerleşim yazılmadı: Meta kare görseli
      // Hikâye'ye kırparak götürürdü — kararın tam tersi, sessizce.
      throw new Error('Eksik boyut için elle yerleşim kararı verildi ama yerleşim yazılmadı');
    }
    if ('age_max' in t) throw new Error('age_max yazıldı; Advantage+ açıkken gönderilmez');
  }
}
