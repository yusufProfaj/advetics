import { AB_SIYASI_BEYAN, campaignBudgetBody, kampanyaTarihleri, type GoogleMutateBody } from './google-write';

/**
 * DEMAND GEN — YouTube video reklamının API'den kurulabilen TEK yolu.
 *
 * ═══ NEDEN VIDEO KAMPANYASI DEĞİL ═══
 *
 * Google'ın kendi dokümanı birebir: "The Google Ads API only supports fetching
 * and reporting on existing Video campaigns. You cannot create new Video
 * campaigns or update existing Video campaigns using the Google Ads API."
 *
 * `VideoAdInfo` ve `VideoResponsiveAdInfo` da SALT RAPORLAMA. Enum'da
 * `VIDEO_ACTION` gibi değerlerin durması aldatıcı: istek şema doğrulamasından
 * geçer, iş mantığı reddeder — bu projedeki en pahalı hata tipi.
 *
 * CPV (görüntüleme başına ödeme) DE YOK: `MANUAL_CPV` ve `TARGET_CPV` VIDEO
 * kampanyalara ait. Demand Gen'in desteklediği stratejiler tıklama ve dönüşüm
 * tabanlı. Kullanıcıya "görüntüleme başına ödeme" vaat edilemez.
 *
 * Bütün alan adları v25 referansından; hiçbiri tahmin edilmedi.
 */

function body(operations: GoogleMutateBody['operations']): GoogleMutateBody {
  // KISMİ BAŞARI KAPALI — google-write.ts ile aynı gerekçe: `true` olsaydı
  // Google geçersiz işlemleri atlayıp kalanları uygular ve yanıt "başarılı"
  // görünürdü.
  return { operations, partialFailure: false };
}

/**
 * Logo görseli — AYRI BİR ASSET KAYDI olmak zorunda.
 *
 * `logo_images[]` v24'ten beri ZORUNLU (v23'te opsiyoneldi) ve inline
 * verilemiyor: önce `AssetOperation` ile bir Asset oluşturulup kaynak adı
 * `AdImageAsset { asset }` içine konuyor.
 *
 * `AssetFieldType` (LOGO, SQUARE_MARKETING_IMAGE…) KULLANILMIYOR — o alanlar
 * `DemandGenMultiAssetAdInfo`'ya ait. Video responsive reklam yalnızca
 * `logo_images` tanıyor.
 *
 * Proto kısıtı: en az 128×128 ve en-boy oranı 1:1 (±%1). Yardım merkezi
 * 144×144 diyor ve ikisi ÇELİŞİYOR; hangisinin uygulandığı canlıda
 * doğrulanacak, bu yüzden yükleme öncesi kontrol proto'nun daha gevşek
 * değerine göre değil YARDIM MERKEZİNİN sıkı değerine göre yapılmalı.
 */
export function googleImageAssetBody(params: {
  name: string;
  /** Ham baytlar — base64'e burada çevriliyor. */
  bytes: Buffer;
}): GoogleMutateBody {
  return body([
    {
      create: {
        name: params.name.slice(0, 100),
        type: 'IMAGE',
        imageAsset: { data: params.bytes.toString('base64') },
      },
    },
  ]);
}

/**
 * YouTube video varlığı — bu da ayrı bir Asset kaydı.
 *
 * `youtubeVideoId` tanımı birebir: "This is the 11 character string value
 * used in the YouTube video URL." Yani `/{ig-user}/media` benzeri bir kimlik
 * uzayı karışıklığı YOK — adres çubuğundaki değerin aynısı.
 */
export function googleVideoAssetBody(params: {
  videoId: string;
  title: string;
}): GoogleMutateBody {
  return body([
    {
      create: {
        name: `${params.title.slice(0, 90)} — video`,
        type: 'YOUTUBE_VIDEO',
        youtubeVideoAsset: {
          youtubeVideoId: params.videoId,
          youtubeVideoTitle: params.title.slice(0, 100),
        },
      },
    },
  ]);
}

/**
 * Demand Gen kampanyası.
 *
 * `advertisingChannelType: 'DEMAND_GEN'` ve ALT TİP VERİLMİYOR — doküman
 * birebir: "No AdvertisingChannelSubType should be set." Bir değer yazmak
 * "geçersiz alt tip" hatası veriyor ve kanal tipi değiştirilemediği için
 * yanlış kurulan kampanya düzeltilemiyor, silinip yeniden kuruluyor.
 *
 * PAUSED AÇILIYOR, EN SONDA YAYINA ALINIYOR — Meta yolunun deseni.
 * Konum, reklam grubu ve reklam kurulmadan kampanya yayında olsaydı Google
 * eksik bir kampanyayı (konumsuz = BÜTÜN ÜLKELER) birkaç saniye bile olsa
 * yayınlayabilirdi. Yayına alma `kampanyayiYayinaAlBody` ile ve ancak her
 * parça yerindeyken.
 *
 * HEDEFLEME REKLAM GRUBU SEVİYESİNDE — `upgradedTargeting: true` AÇIKÇA.
 * İlk canlı prova (2026-10-09, v25) kampanya seviyesindeki konum ölçütünü
 * v25'in tanımadığı bir kodla reddetti (`requestError=UNKNOWN`, "The error
 * code is not in this version"). Google'ın konum belgesi Demand Gen'de
 * reklam grubu seviyesini "upgraded_targeting açık kampanyalar" için
 * anıyor; destek cevabına göre bu ayar açıkken kampanya seviyesindeki
 * konum reddediliyor ve ayar sonradan DEĞİŞTİRİLEMİYOR. Yeni kampanyada
 * varsayılanının açık olduğu ÖLÇÜLMEDİ — bu yüzden açıkça yazılıyor:
 * varsayılana bırakmak, konumun bir gün sessizce yok sayılıp kampanyanın
 * bütün ülkelere açılması demek. Alan adı yanlışsa prova YÜKSEK SESLE
 * reddeder (bilinmeyen alan), sessiz değil.
 *
 * TEKLİF `MAXIMIZE_CONVERSIONS` DEĞİL. Dönüşüm takibi olmayan hesapta o
 * strateji öğrenmiyor ve sessizce kötü çalışıyor; bu üründe piksel/etiket
 * hikâyesi henüz yok. `TARGET_SPEND` (maximize clicks) öngörülebilir.
 */
export function demandGenCampaignBody(params: {
  name: string;
  budgetResource: string;
  stamp: string;
  startDate?: string;
  endDate?: string;
  /**
   * KONUM "BULUNANLAR" (PRESENCE) — yalnız rehber yolu açıkça istiyor.
   * Rehberin karar tablosu "İlgilenenler kapalı" diyor ve bu söz gövdede
   * tutulmalı. Akıllı Boost'un CANLIDA doğrulanmış gövdesine dokunulmasın
   * diye isteğe bağlı: Demand Gen'in bu alanı kabul ettiği ÖLÇÜLMEDİ
   * (2026-10-10), reddederse validateOnly provası YÜKSEK SESLE söyler.
   */
  yalnizBulunanlar?: boolean;
}): GoogleMutateBody {
  const create: Record<string, unknown> = {
    name: `${params.name} — ${params.stamp}`,
    status: 'PAUSED',
    advertisingChannelType: 'DEMAND_GEN',
    campaignBudget: params.budgetResource,
    // Tıklamayı azamileştir. Alan adı stratejinin kendisi; ayrı bir
    // `biddingStrategyType` gönderilmiyor (o salt okunur ve buradan türüyor).
    targetSpend: {},
    containsEuPoliticalAdvertising: AB_SIYASI_BEYAN,
    demandGenCampaignSettings: { upgradedTargeting: true },
    ...(params.yalnizBulunanlar
      ? { geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE', negativeGeoTargetType: 'PRESENCE' } }
      : {}),
  };
  Object.assign(create, kampanyaTarihleri(params.startDate, params.endDate));
  return body([{ create }]);
}

/**
 * Demand Gen reklam grubu.
 *
 * TİP VERİLMİYOR — doküman: "Create an ad group without a type and attach it
 * to the Demand Gen campaign." `AdGroupType` enum'unda DEMAND_GEN karşılığı
 * YOK; oradaki `VIDEO_*` değerleri VIDEO kampanyalara ait ve tip alanı
 * değiştirilemediği için yanlış verilen bir tip ad group'u tamir edilemez
 * yapar.
 *
 * ═══ KANAL KONTROLLERİ AÇIKÇA YAZILIYOR — EN KOLAY ATLANAN VE EN PAHALI ═══
 *
 * Varsayılan `ALL_CHANNELS`. Yani bu blok gönderilmezse reklam yalnızca
 * YouTube'da değil GMAIL, DISCOVER, MAPS ve DISPLAY'de de yayınlanır —
 * kullanıcı "YouTube videomu tanıttım" sanırken bütçesinin bir kısmı bambaşka
 * envantere gider ve hiçbir hata çıkmaz. "Platformun varsayılanına güvenme"
 * kuralının Google karşılığı.
 */
export function demandGenAdGroupBody(params: {
  name: string;
  campaignResource: string;
  /**
   * YAŞ KİTLESİ BAĞLANACAK MI. Demand Gen'de yaş `Audience` kaydıyla
   * veriliyor ve Google bunun için reklam grubunda `useAudienceGrouped`
   * istiyor. Alan DEĞİŞTİRİLEMEZ (proto: IMMUTABLE): kurulumda yazılmazsa
   * sonradan kitle bağlanamaz, yani karar burada veriliyor.
   */
  kitleGrubu?: boolean;
}): GoogleMutateBody {
  return body([
    {
      create: {
        name: params.name,
        campaign: params.campaignResource,
        status: 'ENABLED',
        ...(params.kitleGrubu ? { audienceSetting: { useAudienceGrouped: true } } : {}),
        demandGenAdGroupSettings: {
          channelControls: {
            selectedChannels: {
              youtubeInStream: true,
              youtubeInFeed: true,
              youtubeShorts: true,
              // ÜÇÜ DE AÇIKÇA KAPALI. Alanı hiç göndermemek "varsayılana bırak"
              // demek ve varsayılan AÇIK.
              discover: false,
              gmail: false,
              display: false,
            },
          },
        },
      },
    },
  ]);
}

/**
 * Demand Gen video reklamı — API'den kurulabilen tek YouTube video reklamı.
 *
 * ZORUNLU ÜÇ ALAN (v24'ten beri): `businessName`, `videos[]`, `logoImages[]`.
 * v23'te yalnızca `businessName` zorunluydu; diğer ikisi sonradan zorunlu
 * oldu ve eski örneklere bakarak yazılan kod bugün reddediliyor.
 *
 * BAŞLIKLAR DÜZ STRING DEĞİL: `AdTextAsset` sarmalayıcısı ve metin `text`
 * alanında. Bu inline asset'ler ayrı bir Asset kaydı GEREKTİRMİYOR — metin
 * doğrudan gömülüyor. (Video ve logo öyle değil; onlar gerçek Asset.)
 *
 * HEDEF URL AD SEVİYESİNDE (`Ad.finalUrls`), reklam bilgisinin İÇİNDE DEĞİL.
 * Resmî örneklerin istisnasız hepsi böyle yapıyor.
 *
 * EYLEM ÇAĞRISI GÖNDERİLMİYOR. Alan var (`callToActions[]`) ama yalnızca bir
 * Asset kaynak adı taşıyor — inline metin yazılamıyor. Resmî örnek kod da
 * göndermiyor; Google kendisi seçiyor ("automated and required").
 *
 * REKLAMIN ADI (`Ad.name`) ZORUNLU — belgede değil, CANLIDA öğrenildi. İlk
 * prova (2026-10-09, v25) `fieldError=REQUIRED` ile reddetti ve ekrandaki
 * etiket "Reklam › ad" idi: etiket tablosu yalnızca `name` alanını "ad"
 * diye çeviriyor, yani eksik alan reklam işleminin içindeki `name`. Resmî
 * belge yalnızca `businessName`, `videos`, `logoImages` için "zorunlu"
 * diyor; örnek kodların hepsi ad veriyor ama zorunlu olduğunu söylemiyor.
 * Ad zaman damgalı: aynı videonun ikinci boost'unda ad çakışmasın.
 *
 * REKLAM ENABLED AÇILIYOR. Kampanya henüz duraklatılmış; reklamın kendisi de
 * duraklatılmış kalsaydı kampanya yayına alındığında hiçbir şey
 * yayınlanmazdı — hata yok, harcama yok, gösterim yok. Yayın kararı tek
 * yerde, kampanya seviyesinde veriliyor.
 */
export function demandGenVideoAdBody(params: {
  adGroupResource: string;
  /** Reklamın adı — Google'da zorunlu (yukarıya bkz.). */
  name: string;
  finalUrl: string;
  businessName: string;
  /** Asset kaynak adı — `googleVideoAssetBody` ile oluşturulmuş. */
  videoAssetResource: string;
  /** Asset kaynak adı — `googleImageAssetBody` ile oluşturulmuş. */
  logoAssetResource: string;
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
}): GoogleMutateBody {
  const metin = (t: string): { text: string } => ({ text: t });

  return body([
    {
      create: {
        adGroup: params.adGroupResource,
        status: 'ENABLED',
        ad: {
          name: params.name.slice(0, 255),
          // HEDEF URL BURADA — reklam bilgisinin içinde değil.
          finalUrls: [params.finalUrl],
          demandGenVideoResponsiveAd: {
            businessName: metin(params.businessName),
            videos: [{ asset: params.videoAssetResource }],
            logoImages: [{ asset: params.logoAssetResource }],
            headlines: params.headlines.map(metin),
            longHeadlines: params.longHeadlines.map(metin),
            descriptions: params.descriptions.map(metin),
          },
        },
      },
    },
  ]);
}

/**
 * VARSAYILAN KONUM — TÜRKİYE (`geoTargetConstants/2792`).
 *
 * Google'ın ülke ölçütü kimliği 2000 + ISO 3166 sayısal kodu; Türkiye 792.
 * Konum HİÇ gönderilmezse Google kampanyayı BÜTÜN ÜLKELERE açıyor ve hiçbir
 * hata vermiyor: İzmir'deki bir müşterinin videosu bütçesini Hindistan'da
 * harcar. "Platformun varsayılanına güvenme" kuralının Google karşılığı; bu
 * sabit, ön ayarda konum seçilmemişse gönderilen AÇIK değer.
 */
export const VARSAYILAN_KONUM = 'geoTargetConstants/2792';

/**
 * Reklam grubunun konum ölçütleri — `adGroupCriteria`.
 *
 * REKLAM GRUBU SEVİYESİNDE (2026-10-09'a kadar kampanya seviyesindeydi).
 * Gerekçe "standart yol"du ve ilk canlı provada reddedildi; ayrıntı
 * `demandGenCampaignBody` üstünde (`upgradedTargeting`).
 *
 * BOŞ LİSTE REDDEDİLİYOR — burada, isteğe çıkmadan. Boş bir ölçüt listesi
 * gönderilemez, gönderilmezse de kampanya bütün ülkelere açılır; ikisi de
 * sessiz. Çağıran her zaman en az bir konum vermek zorunda.
 */
export function demandGenKonumBody(params: {
  adGroupResource: string;
  konumlar: string[];
}): GoogleMutateBody {
  if (params.konumlar.length === 0) {
    throw new Error('Konum listesi boş: kampanya bütün ülkelere açılırdı.');
  }
  return body(
    params.konumlar.map((geoTargetConstant) => ({
      create: {
        adGroup: params.adGroupResource,
        location: { geoTargetConstant },
      },
    })),
  );
}

/**
 * KAMPANYAYI YAYINA ALIR — kurulumun SON adımı.
 *
 * `updateMask: 'status'` ZORUNLU: maskesiz güncelleme reddediliyor, maskede
 * olmayan alan ise gövdede olsa bile yok sayılıyor. Yalnızca durum
 * değişiyor; bütçe ve tarih kurulumda yazıldı.
 */
export function kampanyayiYayinaAlBody(campaignResource: string): GoogleMutateBody {
  return body([
    {
      update: { resourceName: campaignResource, status: 'ENABLED' },
      updateMask: 'status',
    },
  ]);
}

// ---------------------------------------------------------------------------
// Yaş — Audience kaydı
// ---------------------------------------------------------------------------

/**
 * Google'ın yaş kovası → yaş boyutunun sınırları.
 *
 * v25 `AgeSegment`: `min_age` 18/25/35/45/55/65, `max_age` 24/34/44/54/64 ve
 * "gerekmez" (üst sınırsız). 65+ kovasının üst sınırı YOK; 64 yazmak onu
 * 55-64'e çevirirdi.
 */
const YAS_SINIRI: Record<string, { min: number; max: number | null }> = {
  AGE_RANGE_18_24: { min: 18, max: 24 },
  AGE_RANGE_25_34: { min: 25, max: 34 },
  AGE_RANGE_35_44: { min: 35, max: 44 },
  AGE_RANGE_45_54: { min: 45, max: 54 },
  AGE_RANGE_55_64: { min: 55, max: 64 },
  AGE_RANGE_65_UP: { min: 65, max: null },
};
const YAS_SIRASI = Object.keys(YAS_SINIRI);

export interface YasSegmenti {
  minAge: number;
  maxAge?: number;
}

/**
 * Seçilen yaş kovalarını BİTİŞİK aralıklara birleştirir.
 *
 * `AgeSegment` "contiguous age range" — 25-34 ile 35-44 seçildiyse tek
 * `{25, 44}` segmenti, 18-24 ile 45-54 seçildiyse iki ayrı segment.
 *
 * HİÇBİRİ ya da HEPSİ seçiliyse BOŞ dönüyor = yaş kısıtı YOK. Altısını
 * birden bir kitleye çevirmek "yaşı bilinmeyenleri" dışarıda bırakırdı ve
 * kullanıcı "hepsini seçtim" derken erişimi sessizce daralırdı.
 */
export function yasSegmentleri(araliklar: readonly string[]): YasSegmenti[] {
  const secili = new Set(araliklar.filter((a) => a in YAS_SINIRI));
  if (secili.size === 0 || secili.size === YAS_SIRASI.length) return [];

  const segmentler: YasSegmenti[] = [];
  let bas: { min: number; max: number | null } | null = null;
  for (const kod of YAS_SIRASI) {
    const sinir = YAS_SINIRI[kod]!;
    if (secili.has(kod)) {
      bas = bas ? { min: bas.min, max: sinir.max } : { ...sinir };
    } else if (bas) {
      segmentler.push(bas.max === null ? { minAge: bas.min } : { minAge: bas.min, maxAge: bas.max });
      bas = null;
    }
  }
  if (bas) segmentler.push(bas.max === null ? { minAge: bas.min } : { minAge: bas.min, maxAge: bas.max });
  return segmentler;
}

/**
 * YAŞ KİTLESİ — `audiences:mutate`.
 *
 * AD HESAPTA TEKİL OLMALI (proto: "unique across all audiences within the
 * account"): zaman damgası ekleniyor, bütçe adıyla aynı gerekçe.
 *
 * YAŞI BİLİNMEYENLER DAHİL DEĞİL (`includeUndetermined: false`) ve açıkça
 * yazılıyor: alan isteğe bağlı ve varsayılana bırakmak, aynı kodun Google
 * varsayılanı değiştiğinde farklı kitleye yayın yapması demekti. Kullanıcı
 * yaş seçtiğinde o yaşlara reklam verdiğini düşünüyor.
 *
 * GERİ ALINAMIYOR: Audience servisi yalnızca oluşturma ve güncelleme kabul
 * ediyor, silme yok. Kurulum yarıda düşerse hesapta yetim bir kitle kalıyor;
 * para harcamıyor ve log'a yazılıyor.
 */
export function demandGenYasKitlesiBody(params: {
  name: string;
  stamp: string;
  segmentler: YasSegmenti[];
}): GoogleMutateBody {
  if (params.segmentler.length === 0) {
    throw new Error('Yaş segmenti yok: kısıtsız yayında kitle oluşturulmamalı.');
  }
  return body([
    {
      create: {
        name: `${params.name} — yaş ${params.stamp}`,
        dimensions: [
          { age: { ageRanges: params.segmentler, includeUndetermined: false } },
        ],
      },
    },
  ]);
}

/** Kitleyi reklam grubuna bağlar — `adGroupCriteria`, `AudienceInfo`. */
export function demandGenKitleBaglaBody(params: {
  adGroupResource: string;
  audienceResource: string;
}): GoogleMutateBody {
  return body([
    {
      create: {
        adGroup: params.adGroupResource,
        audience: { audience: params.audienceResource },
      },
    },
  ]);
}

/**
 * ═══ TEK ATOMİK İSTEK — HEPSİ YA DA HİÇBİRİ ═══
 *
 * YouTube boost'u sekiz ayrı `:mutate` çağrısıyla kuruluyordu ve zincir
 * ortada düşerse kurulanlar elle geri alınıyordu. Geri alma da aynı kotayı
 * kullandığı için kota bitince o da düşüyor ve hesapta yarım kampanya
 * kalıyordu (plan P3/P4). Google'ın kendi çözümü `GoogleAdsService.Mutate`:
 * bütün işlemler tek istekte, kaynaklar birbirine GEÇİCİ (eksi sayılı)
 * kimliklerle bağlanıyor ve `partialFailure: false` ile ya hepsi uygulanıyor
 * ya hiçbiri. Elle geri alma kodu ortadan kalkıyor.
 *
 * AYNI GÖVDE PROVA: `validateOnly: true` ile Google her işlemi gerçek
 * kurallarla doğruluyor ama HİÇBİR ŞEY kurmuyor. Prova ile yayın arasındaki
 * tek fark bu bayrak; ayrı bir gövde yazmak, provanın yayının sınamadığı
 * bir şeyi sınaması demek olurdu.
 *
 * Gövdeler TEK TEK üreticilerden geliyor (sınanmış alan adları ve kurallar);
 * burada yalnızca geçici kimlikler ve işlem türü ekleniyor.
 *
 * ÖLÇÜLMEDİ (2026-10-08): `audienceOperation`ın atomik istekte kabul
 * edildiği ve `validateOnly`ın varlık (asset) oluşturmayı kapsadığı belgeden.
 * Prova tam olarak bunları cevaplıyor.
 */
export type KampanyaAcilisi = 'ENABLED' | 'PAUSED';

export interface AtomikVideoIstegi {
  customerId: string;
  name: string;
  stamp: string;
  dailyBudgetMicros: bigint;
  /**
   * `null` = bitişsiz (rehberde günlük bütçe + bitiş tarihi yok). Akıllı
   * Boost her zaman süreli; o yol dizge vermeye devam ediyor.
   */
  endDate: string | null;
  /** Verilmezse kampanya hemen başlar (Akıllı Boost'un davranışı). */
  startDate?: string;
  /** Rehber yolu: konum PRESENCE (`demandGenCampaignBody` yorumu). */
  yalnizBulunanlar?: boolean;
  /** Kampanya açık mı kurulsun. İlk canlı deneme duraklatılmış (plan K3). */
  acilis: KampanyaAcilisi;
  konumlar: string[];
  yaslar: readonly string[];
  videoId: string;
  videoTitle: string;
  /** Hesapta kayıtlı logo ya da bu istekte oluşturulacak yeni görsel. */
  logo: { resource: string } | { yeniGorsel: { name: string; bytes: Buffer } };
  businessName: string;
  finalUrl: string;
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
  validateOnly: boolean;
}

export interface AtomikGovde {
  mutateOperations: Array<Record<string, unknown>>;
  partialFailure: false;
  validateOnly: boolean;
}

/** Yanıtta hangi sıradaki işlemin neyi kurduğu — sonuç bu sırayla okunuyor. */
export interface AtomikSira {
  kampanya: number;
  reklamGrubu: number;
  reklam: number;
  /** Bu istekte yeni logo oluşturulduysa sırası, yoksa null. */
  logo: number | null;
}

function ilkCreate(b: GoogleMutateBody): Record<string, unknown> {
  const c = b.operations[0]?.create;
  if (!c) throw new Error('Gövde üreticisi create işlemi döndürmedi.');
  return c;
}

export function demandGenAtomikIstek(p: AtomikVideoIstegi): { govde: AtomikGovde; sira: AtomikSira } {
  const kok = `customers/${p.customerId}`;
  const BUTCE = `${kok}/campaignBudgets/-1`;
  const KAMPANYA = `${kok}/campaigns/-2`;
  const GRUP = `${kok}/adGroups/-3`;
  const KITLE = `${kok}/audiences/-4`;
  const VIDEO = `${kok}/assets/-5`;
  const LOGO_YENI = `${kok}/assets/-6`;

  const ops: Array<Record<string, unknown>> = [];
  const ekle = (op: Record<string, unknown>): number => ops.push(op) - 1;

  ekle({
    campaignBudgetOperation: {
      create: {
        ...ilkCreate(campaignBudgetBody({ name: p.name, amountMicros: p.dailyBudgetMicros.toString(), stamp: p.stamp })),
        resourceName: BUTCE,
      },
    },
  });
  const kampanyaGovdesi = ilkCreate(
    demandGenCampaignBody({
      name: p.name,
      budgetResource: BUTCE,
      stamp: p.stamp,
      ...(p.startDate ? { startDate: p.startDate } : {}),
      ...(p.endDate ? { endDate: p.endDate } : {}),
      ...(p.yalnizBulunanlar ? { yalnizBulunanlar: true } : {}),
    }),
  );
  const kampanya = ekle({
    campaignOperation: { create: { ...kampanyaGovdesi, status: p.acilis, resourceName: KAMPANYA } },
  });
  const segmentler = yasSegmentleri(p.yaslar);
  const reklamGrubu = ekle({
    adGroupOperation: {
      create: {
        ...ilkCreate(demandGenAdGroupBody({ name: p.name, campaignResource: KAMPANYA, kitleGrubu: segmentler.length > 0 })),
        resourceName: GRUP,
      },
    },
  });
  // KONUM GRUPTAN HEMEN SONRA: geçici kimlik (-3) ancak grup işlemi
  // sırada önce geliyorsa çözülüyor.
  for (const o of demandGenKonumBody({ adGroupResource: GRUP, konumlar: p.konumlar }).operations) {
    ekle({ adGroupCriterionOperation: { create: o.create } });
  }
  if (segmentler.length > 0) {
    ekle({
      audienceOperation: {
        create: { ...ilkCreate(demandGenYasKitlesiBody({ name: p.name, stamp: p.stamp, segmentler })), resourceName: KITLE },
      },
    });
    ekle({
      adGroupCriterionOperation: {
        create: ilkCreate(demandGenKitleBaglaBody({ adGroupResource: GRUP, audienceResource: KITLE })),
      },
    });
  }
  /*
   * VİDEO VARLIĞININ ADI ZAMAN DAMGALI. Aynı video ikinci kez boostlanınca
   * aynı adla ikinci varlık oluşturmak `DUPLICATE_ASSET_NAME` riskiydi ve
   * bu istekte tek bir ret bütün kampanyayı düşürüyor.
   */
  const video = ilkCreate(googleVideoAssetBody({ videoId: p.videoId, title: p.videoTitle }));
  ekle({
    assetOperation: {
      create: { ...video, name: `${String(video.name).slice(0, 80)} ${p.stamp}`, resourceName: VIDEO },
    },
  });
  let logoSira: number | null = null;
  let logoKaynagi: string;
  if ('resource' in p.logo) {
    logoKaynagi = p.logo.resource;
  } else {
    logoKaynagi = LOGO_YENI;
    logoSira = ekle({
      assetOperation: {
        create: { ...ilkCreate(googleImageAssetBody(p.logo.yeniGorsel)), resourceName: LOGO_YENI },
      },
    });
  }
  const reklam = ekle({
    adGroupAdOperation: {
      create: ilkCreate(
        demandGenVideoAdBody({
          adGroupResource: GRUP,
          name: `${p.name} — reklam ${p.stamp}`,
          finalUrl: p.finalUrl,
          businessName: p.businessName,
          videoAssetResource: VIDEO,
          logoAssetResource: logoKaynagi,
          headlines: p.headlines,
          longHeadlines: p.longHeadlines,
          descriptions: p.descriptions,
        }),
      ),
    },
  });

  return {
    govde: { mutateOperations: ops, partialFailure: false, validateOnly: p.validateOnly },
    sira: { kampanya, reklamGrubu, reklam, logo: logoSira },
  };
}

/**
 * ═══ GOOGLE HATALARININ TAMAMI — ALAN YOLUYLA ═══
 *
 * Genel hata metni (`http.ts`) ilk iki hatayı taşıyor; prova ise BÜTÜN
 * hataları ve hangi alanda olduklarını göstermeli: "metin çok uzun" tek
 * başına işe yaramıyor, hangi başlık olduğu gerekiyor. Ham gövde
 * `PlatformApiError.detail.raw` içinde.
 */
export interface GoogleAlanHatasi {
  kod: string;
  mesaj: string;
  /** `operations[3].create.name` biçiminde; yoksa null. */
  alan: string | null;
  /** Atomik istekte kaçıncı işlem — hangi kaynakta olduğunu söylüyor. */
  islemSirasi: number | null;
  /**
   * Hatanın EK BİLGİSİ: Google'ın `details` (ör. asgari bütçe tutarı) ve
   * `trigger` (reddedilen değer) alanları, okunur tek satır. Yoksa null.
   *
   * İLK CANLI PROVADA (2026-10-09) bu ikisi atılıyordu ve üç hatanın ikisi
   * teşhis edilemedi: bütçe reddi "asgari tutarın altında" diyor ama tutarı
   * YALNIZCA `details` taşıyor; konum reddi v25'in tanımadığı bir kodla
   * geliyor (`requestError=UNKNOWN`) ve geriye ipucu olarak yalnızca bunlar
   * kalıyor.
   */
  ayrinti: string | null;
}

/**
 * `details` nesnesini TAHMİN ETMEDEN tek satıra çeviriyor. Alt alan adları
 * (`budgetPerDayMinimumErrorDetails` içindekiler gibi) belgede net değil ve
 * canlıda ölçülmedi; o yüzden adla değil BİÇİMLE okunuyor: `...Micros`
 * ile biten sayı, yanındaki `currencyCode` ile para tutarı olarak
 * yazılıyor, gerisi `ad=değer` olarak ham kalıyor. Bilinmeyen alanı atmak
 * yerine ham göstermek, bir sonraki provada cevabı ekranda bırakıyor.
 */
export function googleHataAyrintisi(details: unknown, trigger: unknown): string | null {
  const parcalar: string[] = [];
  const gez = (n: unknown, yol: string): void => {
    if (n === null || n === undefined) return;
    if (typeof n !== 'object') {
      parcalar.push(`${yol}=${String(n)}`);
      return;
    }
    if (Array.isArray(n)) {
      n.forEach((x, i) => gez(x, `${yol}[${i}]`));
      return;
    }
    const o = n as Record<string, unknown>;
    const birim = typeof o.currencyCode === 'string' ? o.currencyCode : null;
    for (const [k, v] of Object.entries(o)) {
      if (k === 'currencyCode' && birim) continue;
      const alt = yol ? `${yol}.${k}` : k;
      if (/Micros$/.test(k) && (typeof v === 'string' || typeof v === 'number') && /^-?\d+$/.test(String(v))) {
        // 1e6'ya bölmek kayan nokta değil: micros tam sayı, kuruşa iki
        // basamak yetiyor. Birim yoksa "birim yok" yazılıyor, uydurulmuyor.
        const m = BigInt(String(v));
        const tam = m / 1_000_000n;
        const kurus = ((m % 1_000_000n) / 10_000n).toString().padStart(2, '0');
        parcalar.push(`${alt}=${tam}.${kurus} ${birim ?? '(birim yok)'}`);
        continue;
      }
      gez(v, alt);
    }
  };
  gez(details, '');
  const t = trigger as { stringValue?: unknown; int64Value?: unknown } | null | undefined;
  const tetik = t?.stringValue ?? t?.int64Value;
  if (tetik !== undefined && tetik !== null) parcalar.push(`reddedilen değer=${String(tetik)}`);
  return parcalar.length > 0 ? parcalar.join(' · ') : null;
}

export function googleAlanHatalari(raw: unknown): GoogleAlanHatasi[] {
  const err = (raw as { error?: { details?: unknown[] } } | null)?.error;
  const out: GoogleAlanHatasi[] = [];
  for (const d of err?.details ?? []) {
    const hatalar = (d as { errors?: unknown[] }).errors;
    if (!Array.isArray(hatalar)) continue;
    for (const h of hatalar) {
      const e = h as {
        errorCode?: Record<string, unknown>;
        message?: string;
        location?: { fieldPathElements?: Array<{ fieldName?: string; index?: number }> };
        details?: unknown;
        trigger?: unknown;
      };
      const [kat, deger] = Object.entries(e.errorCode ?? {})[0] ?? [];
      const yol = e.location?.fieldPathElements ?? [];
      const islem = yol[0]?.fieldName === 'mutate_operations' || yol[0]?.fieldName === 'operations' ? yol[0]?.index ?? null : null;
      out.push({
        kod: kat ? `${kat}=${String(deger)}` : 'bilinmiyor',
        mesaj: e.message ?? '',
        alan: yol.length > 0 ? yol.map((x) => (x.index === undefined ? x.fieldName : `${x.fieldName}[${x.index}]`)).join('.') : null,
        islemSirasi: islem,
        ayrinti: googleHataAyrintisi(e.details, e.trigger),
      });
    }
  }
  return out;
}

/**
 * Google kaynak adından YALIN kimlik: `customers/1/campaigns/2` → `2`,
 * `customers/1/adGroupAds/3~4` → `4` (reklam kimliği dalganın sağı).
 *
 * Yapı taraması `campaigns.external_id`, `ad_groups.external_id` ve
 * `ads.external_id` kolonlarına yalın sayıyı yazıyor; yayın yolu kaynak
 * adını yazdığında kart kampanyasıyla hiç eşleşmiyor ve harcama kartta
 * HİÇ görünmüyordu — hata yok, yalnızca "henüz senkronize edilmedi".
 */
export function googleYalinKimlik(kaynak: string): string {
  const son = kaynak.slice(kaynak.lastIndexOf('/') + 1);
  return son.slice(son.lastIndexOf('~') + 1);
}
