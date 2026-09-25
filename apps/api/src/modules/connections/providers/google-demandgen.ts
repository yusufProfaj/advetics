import type { GoogleMutateBody } from './google-write';

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
}): GoogleMutateBody {
  const create: Record<string, unknown> = {
    name: `${params.name} — ${params.stamp}`,
    status: 'PAUSED',
    advertisingChannelType: 'DEMAND_GEN',
    campaignBudget: params.budgetResource,
    // Tıklamayı azamileştir. Alan adı stratejinin kendisi; ayrı bir
    // `biddingStrategyType` gönderilmiyor (o salt okunur ve buradan türüyor).
    targetSpend: {},
  };
  if (params.startDate) create.startDate = params.startDate;
  if (params.endDate) create.endDate = params.endDate;
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
 * REKLAM ENABLED AÇILIYOR. Kampanya henüz duraklatılmış; reklamın kendisi de
 * duraklatılmış kalsaydı kampanya yayına alındığında hiçbir şey
 * yayınlanmazdı — hata yok, harcama yok, gösterim yok. Yayın kararı tek
 * yerde, kampanya seviyesinde veriliyor.
 */
export function demandGenVideoAdBody(params: {
  adGroupResource: string;
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
 * Kampanyanın konum ölçütleri — `campaignCriteria`.
 *
 * KAMPANYA SEVİYESİNDE. Google'ın Demand Gen belgesi konumun reklam grubu
 * seviyesinde de verilebileceğini söylüyor ("you can choose to set the
 * location and language group criteria at the ad group level"); kampanya
 * seviyesi ise Google'ın bütün kampanya türlerinde belgelenmiş standart yolu.
 *
 * BOŞ LİSTE REDDEDİLİYOR — burada, isteğe çıkmadan. Boş bir ölçüt listesi
 * gönderilemez, gönderilmezse de kampanya bütün ülkelere açılır; ikisi de
 * sessiz. Çağıran her zaman en az bir konum vermek zorunda.
 */
export function demandGenKonumBody(params: {
  campaignResource: string;
  konumlar: string[];
}): GoogleMutateBody {
  if (params.konumlar.length === 0) {
    throw new Error('Konum listesi boş: kampanya bütün ülkelere açılırdı.');
  }
  return body(
    params.konumlar.map((geoTargetConstant) => ({
      create: {
        campaign: params.campaignResource,
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
