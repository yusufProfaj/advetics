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
 * PAUSED AÇILIYOR VE PAUSED KALIYOR — arama kampanyasıyla aynı gerekçe:
 * Google yazma yolu canlıda hiç çalışmadı ve ilk gerçek çağrının sonucunu
 * insan görmeden para harcamamalı. Meta yolundan farkı bu ve bilinçli.
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
}): GoogleMutateBody {
  return body([
    {
      create: {
        name: params.name,
        campaign: params.campaignResource,
        status: 'ENABLED',
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
 * PAUSED AÇILIYOR: kampanya zaten duraklatılmış, reklam da duraklatılmış olsun
 * ki ajans kampanyayı açtığında hangi reklamın yayına gireceğine ayrıca karar
 * verebilsin.
 *
 * > DOĞRULANMADI: başlık/açıklama adet ve karakter sınırları Google'ın kendi
 * > dokümanları arasında çelişiyor (3+ zorunlu / 40 karakter ile 1–5 / 30
 * > karakter). Resmî API örnekleri her alandan TEK tane gönderiyor. Kırpma
 * > burada YAPILMIYOR — sınır tek yerde (Zod şeması) uygulanmalı, yoksa iki
 * > kural zamanla ayrışır.
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
        status: 'PAUSED',
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
