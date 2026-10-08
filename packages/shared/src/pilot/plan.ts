import { z } from 'zod';
import { NIYET_KODLARI, type NiyetKodu } from '../reklam/meta/niyetler';
import { HUNI_KATMANLARI, STRATEJI_PLATFORMLARI, type HuniKatmani, type StratejiPlatformu } from '../strateji/plan';
import { AYRI_GRUP_HACIM_ESIGI } from '../strateji/kelime';
import { BOS_NEDENLERI, bos, hucreSchema, kaynakliSchema, pilotMicrosSchema, sayisalKaynakliSchema, type BosNedeni, type Hucre, type Kaynakli } from './kaynak';
import { reklamMetniSchema, type PlanReklamMetni } from './metin';

/**
 * ═══ PİLOT — AYLIK PLAN (yapay zekâ ile hesap yönetimi, Tur 1) ═══
 *
 * Ajan 1 sözleşmesi. Gerekçeler, tablolar ve akış: `docs/advcampaign/MIMARI.md`.
 * Ajan 2 ve Ajan 3 tip TANIMLAMAZ, buradan okur.
 *
 * ESKİ AdvStrategy'den (`strateji/`) FARKI: orada kullanıcı doldurur, sistem
 * doğrular (~100 etkileşim). Burada sistem doldurur (`planUret`), kullanıcı
 * itiraz eder (`PlanDegisikligi`). Platform ve huni katmanı sözlükleri
 * AYNI kaynaktan içe aktarılıyor: iki ayrı "katman" listesi doğarsa eski
 * planla yeni plan aynı kitleye iki ad verir.
 *
 * Eski strateji tabloları ve uçları yeni motor canlı turdan geçene kadar
 * DURUR (Ç-7 kuralı); yeni plan ayrı tablolarda (`pilot_planlari`).
 */
export const PILOT_PLATFORMLARI = STRATEJI_PLATFORMLARI;
export type PilotPlatformu = StratejiPlatformu;

// ─── Adlı ajans sabitleri (K-06 sınıfı; ekran metinleri bunlardan türer) ──

/**
 * GEÇMİŞ YOKKEN PLATFORM PAYI. Yeni müşteride 90 günlük veri yok ve plan
 * üretilmeseydi ajans her yeni müşteride elle başlardı. Değer bir AJANS
 * KARARI olarak ekranda kaynağıyla görünür ("Ajans kuralı: geçmiş yok").
 * Değerler S-3 kararıyla (2026-10-07) kalıcı; ekranda "ajans kuralı" kaynağıyla (MIMARI.md §9).
 */
export const GECMISSIZ_PLATFORM_PAYI_YUZ: Readonly<Record<PilotPlatformu, number>> = { meta: 60, google: 40 };

/**
 * META İÇİ HUNİ PAYI. Brief örneği "%70 soğuk, %30 retargeting"; üç katmana
 * açılmış hâli. Kitlesi olmayan katmanın payı SOĞUĞA eklenir ve satırın
 * notunda yazılır (`KITLESIZ_KATMAN_HEDEFI`); sessizce kaybolmaz, sessizce
 * de "dağıtılmamış" kalıp harcanmayan para olmaz.
 */
export const META_KATMAN_PAYI_YUZ: Readonly<Record<HuniKatmani, number>> = { soguk: 60, sicak: 25, yeniden_pazarlama: 15 };
export const KITLESIZ_KATMAN_HEDEFI: HuniKatmani = 'soguk';

/** Satır başına en çok varlık: en iyi 3 (pilot taslağında "TBO en yüksek 3"). */
export const SATIR_BASI_VARLIK = 3;

/**
 * K-06 `ARAMA_HACMI_ESIGI` — ayda 1.000 arama. TEK KAYNAK strateji
 * modülündeki sabit; burada yeniden yazmak aynı kelimeyi bir ekranda seçili,
 * diğerinde seçilmemiş yapardı.
 */
export const ARAMA_HACMI_ESIGI = AYRI_GRUP_HACIM_ESIGI;

/**
 * Google arama satırının niyeti. Arama kampanyası ziyaretçiyi siteye
 * gönderiyor; ana amaç "form" olsa da Google satırı site trafiğidir (form
 * uzantısı ayrı bir karar, Tur 3).
 */
export const GOOGLE_ARAMA_NIYETI: NiyetKodu = 'SITE';

/**
 * META BÜTÇESİ DÖNEM TOPLAMI (lifetime), GÜNLÜK DEĞİL. Gerekçe müşterinin
 * onay ekranındaki "en çok" sözü: günlük bütçede Meta bazı günler %75 fazla
 * harcayabiliyor ve ay toplamı plan tutarını aşabiliyor; dönem toplamında
 * aşamıyor. Onaylanan tutar = en çok harcanabilecek tutar.
 */
export const META_DONEM_BUTCE_TIPI = 'toplam' as const;
/**
 * Google'da arama kampanyası dönem toplamı taşımıyor (yalnız günlük); günlük
 * tutar `floor(aylık / 30,4)` — Google'ın aylık üst sınırı `30,4 × günlük`
 * olduğu için ay toplamı plan tutarını aşmaz. [Canlıda doğrulanmadı, K-02.]
 */
export const GOOGLE_DONEM_BUTCE_TIPI = 'gunluk' as const;

// ─── Plan üreticisinin girdisi ─────────────────────────────────────────────

/**
 * `planUret` girdisi. Çağıran (Ajan 2) veriyi okur ve buraya KOYAR; fonksiyon
 * ağ, saat ve veritabanı görmez. "Bugün" çağıranın verdiği `bugun`dan
 * okunur: hesabın saat dilimindeki tarih, testte sabitlenebilsin diye.
 */
export interface PlanUretGirdisi {
  clientId: string;
  /** Planın ayı, `YYYY-MM`. */
  donem: string;
  /** Hesabın saat dilimindeki bugün, `YYYY-MM-DD`. */
  bugun: string;
  /** Okuma anı (kaynak zamanı varsayılanı), ISO. */
  simdi: string;
  /** Workspace geneli aylık bütçe (`ad_account_id IS NULL`); yoksa `null`. */
  aylikButce: { id: string; micros: bigint; paraBirimi: string; guncellendi: string } | null;
  /**
   * O AY ŞİMDİYE KADAR HARCANAN (workspace'e atanmış hesapların hesap seviyesi
   * `insights_daily` toplamı, dönemin ilk gününden dünü dahil). Plan toplamı
   * = aylık bütçe − bu (S-7, kullanıcı kararı 2026-10-07). Gelecek ay için
   * çağıran `0n`'ı KAYNAĞIYLA verir. Bilinmiyorsa (veri yok, senkron eski)
   * `null`: toplam BOŞ kalır; gün oranına sessizce düşülmez — tahmini kalan,
   * zaten harcanmış parayı ikinci kez dağıtmak olabilir.
   */
  ayHarcanan: Kaynakli<bigint> | null;
  /** Workspace'e ATANMIŞ hesaplar (havuz satırları girmez, CLAUDE.md). */
  hesaplar: ReadonlyArray<{ id: string; platform: PilotPlatformu; paraBirimi: string }>;
  /**
   * Son 90 gün, HESAP seviyesi satırlar (`TOTALS_LEVEL`). Seviyeler toplanırsa
   * harcama katlanır (strateji dersi). Hiç okunmadıysa `null`.
   */
  gecmis: {
    pencere: { from: string; to: string };
    okundu: string;
    platformlar: ReadonlyArray<{ platform: PilotPlatformu; harcamaMicros: bigint; sonuc: number }>;
  } | null;
  /** Marka Merkezi; profil hiç kurulmamışsa `null`. */
  marka: {
    profilId: string;
    guncellendi: string;
    /** `CAMPAIGN_GOALS`: `form` | `whatsapp` | `website`. */
    anaAmac: 'form' | 'whatsapp' | 'website' | null;
  } | null;
  /**
   * Kitle şablonları. `katman` çağıranda türetilir (şablonun özel kitle
   * alt türünden: WEBSITE → yeniden pazarlama, etkileşim → sıcak, yoksa
   * soğuk); türetilemiyorsa `null` ve şablon plana GİRMEZ.
   */
  kitleler: ReadonlyArray<{ id: string; ad: string; katman: HuniKatmani | null; varsayilan: boolean; guncellendi: string }>;
  /** Varlıklar; `performans` yoksa varlık ölçülmemiş (yeni ya da hiç kullanılmamış). */
  varliklar: ReadonlyArray<{
    id: string;
    ad: string;
    tur: 'gorsel' | 'video';
    yuklendi: string;
    performans: { harcamaMicros: bigint; sonuc: number; pencere: { from: string; to: string }; okundu: string } | null;
  }>;
  /** Kelime fikirleri, varyantları tekilleştirilmiş (`kelime-tekil.ts`). */
  kelimeler: ReadonlyArray<{ id: string; kelime: string; grup: string; aylikArama: number | null; cekim: string }>;
}

// ─── Plan üreticisinin çıktısı ─────────────────────────────────────────────

export interface PlanSatiri {
  /**
   * KARARLI ANAHTAR: `meta:soguk:<kitleId>` / `google:soguk:<grup>`. Sürümler
   * arasında aynı satırı tanımak, onaylı satırı kurulum satırına bağlamak ve
   * yarıda düşen kurulumu tekrar denerken açılmış satırı ikinci kez açmamak
   * için. Sıra numarası olamaz: bir satır çıkarılınca sonrakiler kayar.
   */
  anahtar: string;
  platform: PilotPlatformu;
  katman: HuniKatmani;
  /** Kampanya adı: deterministik (`kitle · katman`), yapay zekâ yazmaz. */
  ad: string;
  niyet: Hucre<NiyetKodu>;
  /** Meta satırında dolu; Google satırında `null` (kelimeyle hedefleme). */
  kitle: Hucre<{ id: string; ad: string }> | null;
  /** Google satırında dolu; Meta satırında `null`. */
  kelimeGrubu: { grup: string; kelimeler: Kaynakli<string[]>; aylikArama: Kaynakli<number> } | null;
  /** Meta satırında varlıklar; Google arama satırında `null` (metin reklamı). */
  varliklar: Hucre<Array<Kaynakli<{ id: string; ad: string }>>> | null;
  /**
   * REKLAM METNİ — ONAYIN PARÇASI (kullanıcı kararı (a), 2026-10-08).
   * Meta satırında HER ZAMAN bir hücre: dolu (kaynak `yz_metin` ya da
   * `kullanici`) ya da boş + `METIN_BOS_NEDENLERI`nden biri. Google arama
   * satırında `null`: Tur 1'de Google kurulmuyor ve metni Tur 3'te ayrı bir
   * biçim (RSA başlıkları) taşıyacak. Planın içerik özeti bu alanı da
   * kapsar; metin değişirse onay düşer (`metin.ts`).
   */
  metinler: Hucre<PlanReklamMetni[]> | null;
  /** Satırın ay içindeki payı (micros, dizge). */
  tutar: Kaynakli<string>;
  /** Platforma gidecek bütçe biçimi (`META_DONEM_BUTCE_TIPI` / `GOOGLE_DONEM_BUTCE_TIPI`). */
  butce: Kaynakli<{ tip: 'toplam' | 'gunluk'; micros: string }>;
  /** Satırın KURULMASINA engel olan boşluklar; boşsa satır kurulabilir. */
  engeller: BosNedeni[];
  /** Ekrandaki gerekçe cümleleri (deterministik şablon, rakamlar hücrelerden). */
  notlar: string[];
}

export interface PlatformPayi {
  platform: PilotPlatformu;
  /** Binde değil ON BİNDE (baz puan): 6200 = %62. Tam sayı, kayan nokta yok. */
  payBaz: Kaynakli<number>;
  tutar: Kaynakli<string>;
  /** 90 günlük sonuç başı maliyetle tahmin; dönüşüm yoksa boş + neden. */
  beklenenSonuc: Hucre<number>;
  gerekce: string;
}

export interface PlanOnerisi {
  /** Şema sürümü (`PLAN_BICIMI`): saklanan JSON'un hangi biçimde olduğu; eskisi `saklananPlanOku` ile okunur. */
  bicim: 2;
  clientId: string;
  donem: string;
  paraBirimi: string | null;
  takvim: { baslangic: string; bitis: string } | null;
  /** Plan toplamı. Kısmi ayda aylık bütçenin kalan güne düşen payı. */
  toplam: Hucre<string>;
  platformlar: PlatformPayi[];
  /** Plana giremeyen platformlar ve nedeni (sessiz kesme yok). */
  disaridaKalanlar: Array<{ platform: PilotPlatformu; neden: BosNedeni }>;
  satirlar: PlanSatiri[];
  /** Satırlara dağıtılamayan tutar ve nedeni; sıfır değilse ekranda yazılır. */
  dagitilmamis: { micros: string; nedenler: BosNedeni[] };
  beklenenSonuc: Hucre<number>;
  /** Plan seviyesinde üretimi durduran nedenler; boşsa plan üretildi. */
  engeller: BosNedeni[];
  /** Yapay zekânın gerekçe paragrafı; yazılmadıysa boş + `yz_yazmadi`. */
  ozetMetni: Hucre<string>;
}

// ─── Şema: saklanan plan sürümü okunurken KAYNAKSIZ hücre geçmez ──────────

const kimlikAd = z.object({ id: z.string().uuid(), ad: z.string().min(1).max(200) }).strict();

/**
 * Saklanan JSON'un biçimi. 1 → 2 (2026-10-08): satıra `metinler` eklendi.
 * Yeni sürüm HER ZAMAN `PLAN_BICIMI` ile yazılır; eski biçim yalnız
 * OKUNUR (`saklananPlanOku`) ve onaylanamaz.
 */
export const PLAN_BICIMI = 2 as const;

const planSatiriAlanlari = {
  anahtar: z.string().min(3).max(200),
  platform: z.enum(PILOT_PLATFORMLARI),
  katman: z.enum(HUNI_KATMANLARI),
  ad: z.string().min(1).max(200),
  niyet: hucreSchema(z.enum(NIYET_KODLARI), { sayisal: false }),
  kitle: hucreSchema(kimlikAd, { sayisal: false }).nullable(),
  kelimeGrubu: z
    .object({
      grup: z.string().min(1).max(80),
      kelimeler: kaynakliSchema(z.array(z.string().min(1).max(80)).min(1)),
      aylikArama: sayisalKaynakliSchema(z.number().int().nonnegative()),
    })
    .strict()
    .nullable(),
  varliklar: hucreSchema(z.array(kaynakliSchema(kimlikAd)).max(SATIR_BASI_VARLIK), { sayisal: false }).nullable(),
  tutar: sayisalKaynakliSchema(pilotMicrosSchema),
  butce: sayisalKaynakliSchema(z.object({ tip: z.enum(['toplam', 'gunluk']), micros: pilotMicrosSchema }).strict()),
  engeller: z.array(z.enum(BOS_NEDENLERI)),
  notlar: z.array(z.string().max(300)),
};

/**
 * Meta satırı metin hücresi TAŞIR, Google satırı taşımaz. "Meta satırında
 * `null`" geçseydi, metni hiç yazılmamış bir satır kapıya "metin alanı yok"
 * olarak gelirdi ve hangi kuralın bakacağı belirsiz kalırdı.
 */
export const planSatiriSchema = z
  .object({
    ...planSatiriAlanlari,
    metinler: hucreSchema(z.array(reklamMetniSchema).min(1).max(SATIR_BASI_VARLIK), { sayisal: false }).nullable(),
  })
  .strict()
  .refine((s) => (s.platform === 'meta') === (s.metinler !== null), {
    message: 'Meta satırı reklam metni hücresi taşır; Google satırı taşımaz',
    path: ['metinler'],
  });

const planOnerisiAlanlari = {
  clientId: z.string().uuid(),
  donem: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  paraBirimi: z.string().regex(/^[A-Z]{3}$/).nullable(),
  takvim: z.object({ baslangic: z.string(), bitis: z.string() }).strict().nullable(),
  toplam: hucreSchema(pilotMicrosSchema, { sayisal: true }),
  platformlar: z.array(
    z
      .object({
        platform: z.enum(PILOT_PLATFORMLARI),
        payBaz: sayisalKaynakliSchema(z.number().int().min(0).max(10_000)),
        tutar: sayisalKaynakliSchema(pilotMicrosSchema),
        beklenenSonuc: hucreSchema(z.number().int().nonnegative(), { sayisal: true }),
        gerekce: z.string().max(300),
      })
      .strict(),
  ),
  disaridaKalanlar: z.array(z.object({ platform: z.enum(PILOT_PLATFORMLARI), neden: z.enum(BOS_NEDENLERI) }).strict()),
  dagitilmamis: z.object({ micros: pilotMicrosSchema, nedenler: z.array(z.enum(BOS_NEDENLERI)) }).strict(),
  beklenenSonuc: hucreSchema(z.number().int().nonnegative(), { sayisal: true }),
  engeller: z.array(z.enum(BOS_NEDENLERI)),
  ozetMetni: hucreSchema(z.string().max(1200), { sayisal: false }),
};

/** YAZILAN biçim (ve güncel okuma). Yeni sürüm yalnız bundan geçerek saklanır. */
export const planOnerisiSchema = z
  .object({ ...planOnerisiAlanlari, bicim: z.literal(PLAN_BICIMI), satirlar: z.array(planSatiriSchema).max(30) })
  .strict();

/** Eski biçim (metinsiz). YALNIZ okuma; `saklananPlanOku` dışında kullanılmaz. */
const planOnerisiV1Schema = z
  .object({ ...planOnerisiAlanlari, bicim: z.literal(1), satirlar: z.array(z.object(planSatiriAlanlari).strict()).max(30) })
  .strict();

/**
 * Saklanan sürümü OKUR. `pilot_plan_surumleri.icerik` için TEK kapı; API'nin
 * `surumOku`su bunu çağırır, `planOnerisiSchema.parse`ı doğrudan değil.
 *
 * ESKİ BİÇİM (1) SESSİZCE GEÇMEZ: metin taşımayan bir plan okunurken Meta
 * satırları `plan_eski_bicim` nedeniyle BOŞ metin hücresi ve aynı adlı
 * engel alır. Onay kapısı onu "kurulamayan satır" sayar, ekran "planı
 * yeniden hazırla" der. Eski planı metinsiz onaylatmak, kararın (a) kapattığı
 * yolu (kimsenin görmediği metin) geri açmak olurdu. Okunan nesne
 * BELLEKTE yükseltilir; saklanan JSON ve `icerik_ozeti` değişmez (özet
 * saklanan içerikten alınmıştı ve onay onunla karşılaştırılıyor).
 *
 * Bilinmeyen biçim PATLAR (Zod): sessizce en yakın biçime düşmek, şemanın
 * yakalamak için orada olduğu bozulmayı gizlerdi.
 */
export function saklananPlanOku(icerik: unknown): PlanOnerisi {
  const bicim = (icerik as { bicim?: unknown } | null)?.bicim;
  if (bicim === 1) {
    const v1 = planOnerisiV1Schema.parse(icerik);
    return {
      ...(v1 as unknown as Omit<PlanOnerisi, 'bicim' | 'satirlar'>),
      bicim: PLAN_BICIMI,
      satirlar: (v1.satirlar as unknown as Array<Omit<PlanSatiri, 'metinler'>>).map((s) =>
        s.platform === 'meta'
          ? { ...s, metinler: bos('plan_eski_bicim'), engeller: s.engeller.includes('plan_eski_bicim') ? s.engeller : [...s.engeller, 'plan_eski_bicim'] }
          : { ...s, metinler: null },
      ),
    };
  }
  return planOnerisiSchema.parse(icerik) as PlanOnerisi;
}

// ─── Plan durum makinesi ───────────────────────────────────────────────────

/**
 * ═══ PLAN DURUMU — ONAY = YAYIN KAPISI (Ç-6) ═══
 *
 *   taslak ──musteriye_gonder(ajans)──► musteride ──onayla(müşteri)──► onaylandi
 *     ▲                                   │  │                            │
 *     ├──────────geri_cek(ajans)──────────┘  │                kurulum_basla(worker)
 *     └──────degisiklik_iste(müşteri)────────┘                            ▼
 *                                         kismen_kuruldu ◄──(worker)── kuruluyor ──(worker)──► kuruldu
 *                                           │  ▲                                              (SON)
 *                                yeniden_dene(ajans)
 *                                           │
 *                                        kapat(ajans) ──► kapatildi (SON)
 *   taslak | musteride | onaylandi ──iptal(ajans | sistem: dönem geçti)──► iptal (SON)
 *   kuruluyor ──takilan_kurulumu_durdur(ajans | sistem; YALNIZ takıldıysa)──► kismen_kuruldu
 *
 * ONAYLANAN ŞEY SÜRÜMÜN ÖZETİ (hash). `onayla` isteği sürüm numarasını ve
 * `planKanonikIcerik` özetini taşır; sunucu ikisini de saklanan sürümle
 * karşılaştırır. Onaydan sonra plan DEĞİŞMEZ: değişiklik yeni sürüm demek ve
 * yeni sürüm yalnız `taslak`ta yazılabilir (`pilotPlanDuzenlenebilirMi`).
 *
 * AJANSIN "HEPSİNİ YAYINA AL" DÜĞMESİ YOK (Ç-6): `onaylandi → kuruluyor`
 * geçişini bir insan değil worker yazar. Ajansın kontrol noktası
 * `musteriye_gonder`den önceki inceleme.
 *
 * KISMİ TEKİL İNDEKS UYARISI: `(client_id, donem)` için "açık plan" indeksi
 * son olmayan bütün durumları kapsar. Her birinin çıkışı var ve testte
 * kilitli (`kismen_kuruldu` → `kapat`); çıkışı olmayan bir ara durum o ay
 * için kalıcı kilit olurdu (boost `active` dersi).
 *
 * `kuruluyor`un ÇIKIŞI (Ajan 4 B-4, 2026-10-08): önceden yalnız worker'ın
 * sayımı (`kurulum_bitti`/`kurulum_kismen`) çıkarıyordu. Bir satır işi ara
 * durumda (`prova`, `kuruluyor`, `geri_okundu_ayni`, `aciliyor`) beklenmedik
 * bir hatayla ölürse sayım hiç "bitti" demiyor ve plan sonsuza dek
 * `kuruluyor`da kalıp o ayı kilitliyordu. İki katman:
 *   1. SATIR: süpürme yaşlı ara satırı önce yeniden kuyruğa alır, deneme
 *      bitince son bir duruma çeker (`takilanSatirKarari`, kurulum.ts).
 *   2. PLAN: `takilan_kurulumu_durdur` — ajans (ya da süpürme) planı
 *      `kismen_kuruldu`ya alır; oradan bilinen iki çıkış var: "Şimdi kur"
 *      (`yeniden_dene`) ve "Vazgeç" (`kapat`). YALNIZ `kuruluyorPlanKarari`
 *      `takildi`/`satir_yok` dediğinde: canlı bir işin altından planı çekmek,
 *      platformda açılan kampanyayı kapatılmış bir plana bağlı bırakırdı.
 *   `kuruluyor`dan doğrudan `kapat`/`iptal` YOK: arada canlı bir işçi
 *   olabilir ve önce satırların son duruma inmesi gerekiyor.
 */
export const PILOT_PLAN_DURUMLARI = [
  'taslak',
  'musteride',
  'onaylandi',
  'kuruluyor',
  'kismen_kuruldu',
  'kuruldu',
  'kapatildi',
  'iptal',
] as const;
export type PilotPlanDurumu = (typeof PILOT_PLAN_DURUMLARI)[number];
export const PILOT_PLAN_SON_DURUMLARI: readonly PilotPlanDurumu[] = ['kuruldu', 'kapatildi', 'iptal'];

/** Geçişi kimin yazdığı: denetim kaydı ve uçların yetki kararı buradan. */
export type GecisYazani = 'ajans' | 'musteri' | 'worker' | 'sistem';

export const PILOT_PLAN_EYLEMLERI = [
  'musteriye_gonder',
  'geri_cek',
  'degisiklik_iste',
  'onayla',
  'kurulum_basla',
  'kurulum_bitti',
  'kurulum_kismen',
  'yeniden_dene',
  'kapat',
  'iptal',
  'takilan_kurulumu_durdur',
] as const;
export type PilotPlanEylemi = (typeof PILOT_PLAN_EYLEMLERI)[number];

export const PILOT_PLAN_GECISLERI = {
  musteriye_gonder: { kaynak: ['taslak'], hedef: 'musteride', yazan: ['ajans'] },
  geri_cek: { kaynak: ['musteride'], hedef: 'taslak', yazan: ['ajans'] },
  degisiklik_iste: { kaynak: ['musteride'], hedef: 'taslak', yazan: ['musteri'] },
  // `ajans` da yazabilir: MÜŞTERİ ADINA onay (gerekçe zorunlu, ekranda ayrı
  // yazılır). Panele hiç girmeyen müşterinin planı `musteride`de kalıcı
  // beklemesin diye. S-1 kararı (2026-10-07): gerekçe zorunlu, müşteri sonradan görür.
  onayla: { kaynak: ['musteride'], hedef: 'onaylandi', yazan: ['musteri', 'ajans'] },
  kurulum_basla: { kaynak: ['onaylandi'], hedef: 'kuruluyor', yazan: ['worker'] },
  kurulum_bitti: { kaynak: ['kuruluyor'], hedef: 'kuruldu', yazan: ['worker'] },
  kurulum_kismen: { kaynak: ['kuruluyor'], hedef: 'kismen_kuruldu', yazan: ['worker'] },
  yeniden_dene: { kaynak: ['kismen_kuruldu'], hedef: 'kuruluyor', yazan: ['ajans'] },
  kapat: { kaynak: ['kismen_kuruldu'], hedef: 'kapatildi', yazan: ['ajans'] },
  // `onaylandi`dan iptal YALNIZ kurulum başlamadan: kurulan bir satırı iptal
  // etmek platformda duran kampanyayı sahipsiz bırakır.
  iptal: { kaynak: ['taslak', 'musteride', 'onaylandi'], hedef: 'iptal', yazan: ['ajans', 'sistem'] },
  // Sunucu ön koşulu: `kuruluyorPlanKarari(...).tur` `takildi` ya da
  // `satir_yok`; aynı istekte son olmayan satırlar `TAKILAN_SATIR_HEDEFI`ne
  // çekilir. Ön koşulsuz uygulanırsa canlı işin altından plan kayar.
  takilan_kurulumu_durdur: { kaynak: ['kuruluyor'], hedef: 'kismen_kuruldu', yazan: ['ajans', 'sistem'] },
} as const satisfies Record<
  PilotPlanEylemi,
  { kaynak: readonly PilotPlanDurumu[]; hedef: PilotPlanDurumu; yazan: readonly GecisYazani[] }
>;

export function pilotGecisMumkunMu(durum: PilotPlanDurumu, eylem: PilotPlanEylemi, yazan: GecisYazani): boolean {
  const g = PILOT_PLAN_GECISLERI[eylem];
  return (g.kaynak as readonly PilotPlanDurumu[]).includes(durum) && (g.yazan as readonly GecisYazani[]).includes(yazan);
}

/** Yalnız `taslak` düzenlenir: müşterinin gördüğü belge ile kurulan belge ayrışmasın. */
export function pilotPlanDuzenlenebilirMi(durum: PilotPlanDurumu): boolean {
  return durum === 'taslak';
}

// ─── Değişiklik ("değiştir" kutusu ve elle düzenleme aynı tipi yazar) ──────

/**
 * "Google'a 5.000 TL daha ayır" cümlesini yapay zekâ BU TİPE çevirir; panelde
 * elle yapılan düzenleme de aynı tipi yazar. Sayı taşıyan değişiklikte sunucu
 * sayının kullanıcının cümlesinde geçtiğini doğrular (`yzMetniDenetle` aynı
 * kural): model "5.000" yerine "50.000" yazarsa değişiklik reddedilir.
 */
export const planDegisikligiSchema = z.discriminatedUnion('tur', [
  z.object({ tur: z.literal('satir_tutari'), anahtar: z.string(), tutarMicros: pilotMicrosSchema }).strict(),
  /**
   * GÖRELİ değişiklik: "5.000 TL daha ayır". Cümledeki sayı FARK; model onu
   * mutlak tutara çevirip yazsaydı (41.000) cümlede geçmeyen bir sayı olurdu
   * ve doğrulama ya haklı bir isteği reddeder ya da kontrolsüz kalırdı.
   */
  z.object({ tur: z.literal('satir_tutari_fark'), anahtar: z.string(), farkMicros: pilotMicrosSchema, yon: z.enum(['artir', 'azalt']) }).strict(),
  z.object({ tur: z.literal('satir_cikar'), anahtar: z.string() }).strict(),
  z.object({ tur: z.literal('varlik_cikar'), anahtar: z.string(), varlikId: z.string().uuid() }).strict(),
]);
export type PlanDegisikligi = z.infer<typeof planDegisikligiSchema>;

/**
 * İKİ BİÇİM (Ajan 2 eki, 2026-10-07): elle düzenleme `degisiklikler`i
 * taşır; "değiştir" kutusu YALNIZ `cumle`yi taşır ve sunucu cümleyi yapay
 * zekâyla `PlanDegisikligi[]`ye çevirip sayı doğrulamasından geçirir.
 * Panelin cümleyi kendisi çevirmesi, doğrulamanın panelde kalması demekti.
 * İkisi birden gelirse cümle değişiklikleri DOĞRULAR (sayılar cümlede
 * geçmeli); hiçbiri yoksa ret.
 */
export const planDegistirSchema = z
  .object({
    surum: z.number().int().positive(),
    /** Elle düzenlemede yok; "değiştir" kutusunda kullanıcının cümlesi. */
    cumle: z.string().trim().min(1).max(500).optional(),
    degisiklikler: z.array(planDegisikligiSchema).min(1).max(20).optional(),
  })
  .strict()
  .refine((v) => v.cumle !== undefined || (v.degisiklikler?.length ?? 0) > 0, {
    message: 'Bir cümle ya da en az bir değişiklik gerekli',
    path: ['degisiklikler'],
  });
export type PlanDegistirGirdisi = z.infer<typeof planDegistirSchema>;
