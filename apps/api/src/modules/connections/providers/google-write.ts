/**
 * Google Ads yazma istekleri — SAF FONKSİYONLAR.
 *
 * NEDEN AYRI DOSYA: bu kod CANLI API'DE HİÇ ÇALIŞTIRILMADI. Meta'da ilk gerçek
 * yazma çağrısında altı hata çıktı ve üçü sessizdi; Google'ın kendi altısı
 * olacak. Saf fonksiyonlar en azından gövdenin ŞEKLİNİ test edilebilir
 * kılıyor — davranışı değil, ama alan adlarını, zorunlu alanların varlığını
 * ve sıralamayı.
 *
 * META'DAN YAPISAL FARK: bütçe AYRI BİR KAYNAK (`CampaignBudget`) ve kampanya
 * ona referans veriyor. Meta'da bütçe ad set'in (ya da CBO'da kampanyanın) bir
 * alanı. Bu yüzden Google'da dört çağrı var: bütçe → kampanya → reklam grubu →
 * (anahtar kelimeler) → reklam.
 *
 * ARAMA KAMPANYASI, PMAX DEĞİL (tasarım belgesi K14). Gerekçe
 * `goal-mapping.ts`'in kendi mantığı: PMax dönüşüm takibi olmadan öğrenmiyor
 * ve bu üründe piksel/etiket hikâyesi hiç yok. Takipsiz açılan bir PMax,
 * öğrenmeyen ve sessizce para harcayan bir kampanya olurdu.
 *
 * ARAMA REKLAMI METİNSEL: görsel yüklemeye gerek yok. `uploadAdImage`
 * uygulanmamış kalıyor ve bu bilinçli — PMax geldiğinde gerekecek.
 */

export interface GoogleMutateOperation {
  create?: Record<string, unknown>;
  remove?: string;
}

export interface GoogleMutateBody {
  operations: GoogleMutateOperation[];
  /**
   * KISMİ BAŞARI KAPALI.
   *
   * `partialFailure: true` olsaydı Google geçersiz işlemleri atlayıp
   * kalanları uygulardı ve yanıt "başarılı" görünürdü — yani üç anahtar
   * kelimeden ikisi eklenmiş bir kampanya, hiçbir hata olmadan. Bu projenin
   * klasik sessiz hatası. Hepsi ya da hiçbiri.
   */
  partialFailure: false;
}

function body(operations: GoogleMutateOperation[]): GoogleMutateBody {
  return { operations, partialFailure: false };
}

/**
 * Kampanya bütçesi.
 *
 * `explicitlyShared: false` — bütçe TEK kampanyaya ait. Paylaşımlı bütçe,
 * bir kampanyanın harcamasının diğerini aç bırakması demek ve kullanıcı
 * bunu istemedi. Varsayılana bırakmak, hesabın ayarına güvenmekle aynı hata
 * sınıfı: aynı kod iki müşteride farklı davranır.
 *
 * AD BENZERSİZ OLMALI. Google aynı adda ikinci bir bütçeyi reddediyor ve
 * hata mesajı ("DUPLICATE_NAME") kullanıcının kampanya adıyla ilgili
 * olduğunu söylemiyor; bu yüzden ada zaman damgası ekleniyor.
 */
export function campaignBudgetBody(params: {
  name: string;
  amountMicros: string;
  stamp: string;
}): GoogleMutateBody {
  return body([
    {
      create: {
        name: `${params.name} — bütçe ${params.stamp}`,
        amountMicros: params.amountMicros,
        deliveryMethod: 'STANDARD',
        explicitlyShared: false,
      },
    },
  ]);
}

/**
 * Kampanya.
 *
 * PAUSED AÇILIYOR VE PAUSED KALIYOR — Meta yolundan FARKLI ve bilinçli.
 * Meta'da kampanya PAUSED açılıp en sonda ACTIVE'e alınıyor; orada yol canlıda
 * bir kez çalıştı. Burada hiç çalışmadı: ilk gerçek çağrının sonucunu insan
 * görmeden para harcamamalı. Ajans Google Ads'te gözden geçirip kendisi
 * açıyor.
 *
 * `targetSearchNetwork: false` ve `targetContentNetwork: false` AÇIKÇA
 * yazılıyor. Google'ın varsayılanı arama ağı ortaklarını ve Görüntülü Reklam
 * Ağı'nı AÇIK getiriyor; bu, arama kampanyası kurduğunu sanan kullanıcının
 * bütçesinin bir kısmının bambaşka bir envantere gitmesi demek. Alanı
 * göndermemek, kararı platformun varsayılanına bırakmak olurdu.
 *
 * TEKLİF `manualCpc`. `MaximizeConversions` dönüşüm takibi istiyor ve bu
 * üründe yok; takipsiz açmak, kampanyanın hiç öğrenmemesi demek. Elle CPC
 * öngörülebilir ve reklam grubunda tavanı belli.
 */
export function campaignBody(params: {
  name: string;
  budgetResource: string;
  stamp: string;
  /** `YYYY-MM-DD` — Date'e çevirmek saat dilimi kayması üretiyor. */
  startDate?: string;
  endDate?: string;
}): GoogleMutateBody {
  const create: Record<string, unknown> = {
    name: `${params.name} — ${params.stamp}`,
    status: 'PAUSED',
    advertisingChannelType: 'SEARCH',
    campaignBudget: params.budgetResource,
    manualCpc: { enhancedCpcEnabled: false },
    networkSettings: {
      targetGoogleSearch: true,
      targetSearchNetwork: false,
      targetContentNetwork: false,
      targetPartnerSearchNetwork: false,
    },
  };
  if (params.startDate) create.startDate = params.startDate;
  if (params.endDate) create.endDate = params.endDate;
  return body([{ create }]);
}

/**
 * Reklam grubu.
 *
 * `cpcBidMicros` ZORUNLU tutuluyor: elle CPC'de tavansız bir grup, Google'ın
 * hesap varsayılanını kullanması demek ve o varsayılan müşteriden müşteriye
 * değişiyor.
 */
export function adGroupBody(params: {
  name: string;
  campaignResource: string;
  cpcBidMicros: string;
}): GoogleMutateBody {
  return body([
    {
      create: {
        name: params.name,
        campaign: params.campaignResource,
        status: 'ENABLED',
        type: 'SEARCH_STANDARD',
        cpcBidMicros: params.cpcBidMicros,
      },
    },
  ]);
}

/**
 * Anahtar kelimeler.
 *
 * ANAHTAR KELİMESİZ ARAMA KAMPANYASI HİÇ HARCAMAZ ve hiçbir hata da vermez —
 * sessiz sıfırın ta kendisi. Bu yüzden yayın kontrolü en az bir kelime
 * istiyor.
 *
 * EŞLEME TİPİ `PHRASE`. `BROAD` en geniş ama alakasız aramaları da yakalıyor
 * ve reklamcılık bilmeyen bir kullanıcının bütçesini en hızlı tüketen seçim
 * bu; `EXACT` ise çok dar başlıyor ve kampanya hiç gösterim almayabiliyor.
 * Öbek eşleme ikisinin arasında ve Google'ın küçük hesaplar için önerdiği
 * başlangıç.
 */
export function keywordsBody(params: {
  adGroupResource: string;
  keywords: string[];
}): GoogleMutateBody {
  return body(
    params.keywords.map((text) => ({
      create: {
        adGroup: params.adGroupResource,
        status: 'ENABLED',
        keyword: { text: text.trim(), matchType: 'PHRASE' },
      },
    })),
  );
}

/**
 * Duyarlı arama reklamı (RSA).
 *
 * PAUSED AÇILIYOR — kampanya zaten duraklatılmış ama reklam da duraklatılmış
 * olsun ki ajans kampanyayı açtığında hangi reklamın yayına gireceğine ayrıca
 * karar verebilsin.
 *
 * METİNLER `packTextsFor('google_rsa')` ÜZERİNDEN GELİYOR ve burada tekrar
 * kırpılmıyor: sınırın tek bir yerde uygulanması gerekiyor, yoksa iki kural
 * zamanla ayrışır.
 */
export function responsiveSearchAdBody(params: {
  adGroupResource: string;
  finalUrl: string;
  headlines: string[];
  descriptions: string[];
}): GoogleMutateBody {
  return body([
    {
      create: {
        adGroup: params.adGroupResource,
        status: 'PAUSED',
        ad: {
          finalUrls: [params.finalUrl],
          responsiveSearchAd: {
            headlines: params.headlines.map((text) => ({ text })),
            descriptions: params.descriptions.map((text) => ({ text })),
          },
        },
      },
    },
  ]);
}

/**
 * Geri alma işlemi.
 *
 * ORTADA KALMA SORUNU META'DAKİYLE AYNI: bütçe oluşup kampanya oluşmazsa
 * hesapta yetim bir bütçe kalıyor. Para harcamıyor ama Google Ads'i
 * kirletiyor ve bir sonraki denemede aynı adla ikinci bir bütçe açılamıyor
 * (DUPLICATE_NAME).
 */
export function removeBody(resourceName: string): GoogleMutateBody {
  return body([{ remove: resourceName }]);
}

/**
 * Zaman damgası — ad çakışmasını engelliyor.
 *
 * Google bütçe adlarında tekillik istiyor; kullanıcı aynı kampanyayı iki kez
 * kurmayı denediğinde ikinci deneme "DUPLICATE_NAME" ile düşerdi ve mesaj
 * sebebi anlatmazdı.
 */
export function nameStamp(now: Date): string {
  return now.toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * `YYYY-MM-DD` — Google kampanya tarihleri.
 *
 * Date'e çevirip geri almak saat dilimi kayması üretiyor; bu projede tarihler
 * zaten string olarak taşınıyor.
 */
export function googleDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Kaynak adından koleksiyon adını çıkarır — GERİ ALMA İÇİN.
 *
 * `customers/123/campaignBudgets/456` → `campaignBudgets`. Geri alma çağrısı
 * kaynağın kendi koleksiyonuna gitmek zorunda ve o bilgi kaynak adının
 * içinde zaten var; ayrıca taşımak, iki kaynağın ayrışması riski demek
 * olurdu.
 */
export function resourceCollection(resourceName: string): string {
  const parts = resourceName.split('/');
  // customers / <id> / <collection> / <id>
  return parts[2] ?? '';
}
