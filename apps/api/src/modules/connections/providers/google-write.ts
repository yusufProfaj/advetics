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
  /**
   * GÜNCELLEME — `updateMask` ile BİRLİKTE. Maskesiz bir güncelleme Google'da
   * reddediliyor; maskeye yazılmayan alan ise gövdede olsa bile YOK
   * SAYILIYOR. İkisi ayrı alan olduğu için birini unutmak derlemede görünmez;
   * bu yüzden güncelleme gövdeleri yalnızca üretici fonksiyonlardan geliyor.
   */
  update?: Record<string, unknown>;
  /** Virgülle ayrılmış alan yolları — REST gövdesinde düz metin. */
  updateMask?: string;
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
  /**
   * PROVA: Google her işlemi gerçek kurallarla doğruluyor, HİÇBİR ŞEY
   * değiştirmiyor. Yalnız açıkça istenince gönderiliyor; alanın hiç
   * olmaması "gerçek yazma" demek.
   */
  validateOnly?: boolean;
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
export type AramaTeklifi = 'manualCpc' | 'targetSpend' | 'maximizeConversions';

/**
 * Teklif stratejisinin gövdedeki alanı. Strateji ALANIN ADIYLA seçiliyor;
 * `biddingStrategyType` salt okunur ve buradan türüyor. Üçünden yalnız biri
 * gönderilmeli: ikisi birden "birden çok strateji" ile reddedilir.
 *
 * - `manualCpc`: eski yol (tavan reklam grubunda, `cpcBidMicros`).
 * - `targetSpend`: Maksimum tıklama — rehberde dönüşüm ölçülmüyorsa.
 * - `maximizeConversions`: yalnız birincil dönüşüm işlemi ETKİNSE; ölçümsüz
 *   hesapta öğrenmiyor ve harcamayı rastgele dağıtıyor (A4 § 4.1).
 */
function teklifAlani(t: AramaTeklifi): Record<string, unknown> {
  if (t === 'targetSpend') return { targetSpend: {} };
  if (t === 'maximizeConversions') return { maximizeConversions: {} };
  return { manualCpc: { enhancedCpcEnabled: false } };
}

export function campaignBody(params: {
  name: string;
  budgetResource: string;
  stamp: string;
  /**
   * Kampanya adına zaman damgası EKLENMEZ (rehber, 2026-10-12): adı
   * `advKampanyaAdi` kuruyor ve benzersizliği yayın kodu sağlıyor. Akıllı
   * Boost'un canlıda doğrulanmış gövdesi değişmesin diye isteğe bağlı.
   */
  damgasiz?: boolean;
  /** `YYYY-MM-DD` — Date'e çevirmek saat dilimi kayması üretiyor. */
  startDate?: string;
  endDate?: string;
  /** Verilmezse `manualCpc` (eski yolun davranışı değişmesin). */
  teklif?: AramaTeklifi;
}): GoogleMutateBody {
  const create: Record<string, unknown> = {
    name: params.damgasiz ? params.name : `${params.name} — ${params.stamp}`,
    status: 'PAUSED',
    advertisingChannelType: 'SEARCH',
    campaignBudget: params.budgetResource,
    ...teklifAlani(params.teklif ?? 'manualCpc'),
    containsEuPoliticalAdvertising: AB_SIYASI_BEYAN,
    // AI Max açıkça KAPALI: açıkken anahtar kelimesiz eşleme ve geniş eşleme
    // devreye giriyor ve bütçe kullanıcının seçmediği sorgulara gidiyor
    // (SENTEZ S-19). Göndermemek kararı Google'a bırakmak olurdu.
    aiMaxSetting: { enableAiMax: false },
    /*
     * METİN ÖZELLEŞTİRME ve URL GENİŞLETME de AÇIKÇA KAPALI. Panel turunda
     * (A4 § 4.1) ikisi de açık geliyordu: biri yazdığımız metni Google'ın
     * ürettiğiyle değiştiriyor (yasal uyarılı sektörde onaysız metin), öbürü
     * trafiği bizim seçmediğimiz bir sayfaya gönderiyor. Alan adları v25
     * referansından (`Campaign.asset_automation_settings`); CANLIDA
     * ÖLÇÜLMEDİ — tanınmayan değer validateOnly provasında YÜKSEK SESLE
     * reddedilir, sessiz değil.
     */
    assetAutomationSettings: [
      { assetAutomationType: 'TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' },
      { assetAutomationType: 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' },
    ],
    /*
     * KONUM "BULUNANLAR" (PRESENCE). Google'ın varsayılanı "bulunan VEYA
     * ilgilenen": İzmir hedefli reklam İzmir'i arayan Berlin'deki kişiye de
     * çıkar ve bütçe başka ülkeye akar — hata vermeden.
     */
    geoTargetTypeSetting: { positiveGeoTargetType: 'PRESENCE', negativeGeoTargetType: 'PRESENCE' },
    networkSettings: {
      targetGoogleSearch: true,
      targetSearchNetwork: false,
      targetContentNetwork: false,
      targetPartnerSearchNetwork: false,
    },
  };
  Object.assign(create, kampanyaTarihleri(params.startDate, params.endDate));
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
  /**
   * `null` YALNIZ otomatik teklifte (`targetSpend`, `maximizeConversions`):
   * orada tavanı Google koyuyor ve grup teklifi yok sayılıyor. Elle CPC'de
   * dizge zorunlu (yukarıdaki gerekçe).
   */
  cpcBidMicros: string | null;
}): GoogleMutateBody {
  return body([
    {
      create: {
        name: params.name,
        campaign: params.campaignResource,
        status: 'ENABLED',
        type: 'SEARCH_STANDARD',
        ...(params.cpcBidMicros !== null ? { cpcBidMicros: params.cpcBidMicros } : {}),
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
  /**
   * Rehber yolunda `ENABLED`: yayın kararı TEK yerde, kampanya seviyesinde.
   * Reklam da duraklatılmış kalsaydı kampanya açıldığında hiçbir şey
   * yayınlanmazdı — hata yok, gösterim yok (Demand Gen dersiyle aynı).
   */
  durum?: 'ENABLED' | 'PAUSED';
}): GoogleMutateBody {
  return body([
    {
      create: {
        adGroup: params.adGroupResource,
        status: params.durum ?? 'PAUSED',
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
/**
 * KAMPANYA TARİHİ ve AB SİYASİ BEYANI — iki kampanya gövdesinin ortak alanları
 * (A1 §7.1-7.2, SENTEZ D-G1/D-G2).
 *
 * `startDate/endDate` v23'te KALDIRILDI; v25 `startDateTime/endDateTime`
 * istiyor ("yyyy-MM-dd HH:mm:ss", hesabın saat diliminde). Eski adla giden
 * gövde reddediliyor: YouTube boost'u her çağrıda bitiş tarihi gönderdiği
 * için o yol HER SEFERİNDE düşüyordu.
 *
 * `containsEuPoliticalAdvertising` oluşturmada ZORUNLU. Göndermemek
 * `FieldError.REQUIRED`; üstelik hesapta beyansız tek kampanya kalırsa Google
 * o hesaptaki kampanya yazmalarını kilitliyor. Ürün AB siyasi reklamı
 * yayınlamıyor, değer sabit.
 */
export const AB_SIYASI_BEYAN = 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING';

export function kampanyaTarihleri(startDate?: string, endDate?: string): Record<string, string> {
  const t: Record<string, string> = {};
  if (startDate) t.startDateTime = `${startDate} 00:00:00`;
  if (endDate) t.endDateTime = `${endDate} 23:59:59`;
  return t;
}

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

// ---------------------------------------------------------------------------
// ARAMA KAMPANYASI ÖLÇÜTLERİ — konum, dil, negatif (AdvCampaign rehberi)
// ---------------------------------------------------------------------------

/**
 * Kampanya konumları — `CampaignCriterion.location`.
 *
 * BOŞ LİSTE BURADA REDDEDİLİYOR: konumsuz arama kampanyası BÜTÜN ÜLKELERE
 * açılıyor ve Google hata vermiyor (panel turunda varsayılan "Tüm ülkeler ve
 * bölgeler"di, A4 § 4.1). Demand Gen'den farkı: Arama'da konum KAMPANYA
 * seviyesinde (Demand Gen'deki ret `upgradedTargeting`e özgü).
 */
export function kampanyaKonumlariBody(params: { campaignResource: string; konumlar: string[] }): GoogleMutateBody {
  if (params.konumlar.length === 0) throw new Error('Konum listesi boş: kampanya bütün ülkelere açılırdı.');
  return body(
    params.konumlar.map((geoTargetConstant) => ({
      create: { campaign: params.campaignResource, location: { geoTargetConstant } },
    })),
  );
}

/**
 * Kampanya dili — `CampaignCriterion.language`. Dil ölçütü hiç yoksa Google
 * "bütün diller" sayıyor; Türkçe metinli reklam başka dilde arama yapanlara
 * da çıkar ve tıklanmadan gösterim harcar.
 */
export function kampanyaDiliBody(params: { campaignResource: string; dil: string }): GoogleMutateBody {
  if (!/^languageConstants\/\d+$/.test(params.dil)) throw new Error(`Geçersiz dil kaynağı: ${params.dil}`);
  return body([{ create: { campaign: params.campaignResource, language: { languageConstant: params.dil } } }]);
}

/**
 * Kampanya düzeyi NEGATİF anahtar kelimeler (`TABAN_NEGATIFLER`).
 *
 * EŞLEME `BROAD`: negatif geniş eşleme, kelimelerin HEPSİNİ (sırası ne olursa
 * olsun) içeren aramayı dışarıda bırakır. "iş ilanı" negatifi "ilanı iş
 * arıyorum"u da kapatmalı; öbek eşleme yalnız aynı sırayı kapatırdı. Tek
 * kelimelik negatiflerde ikisi aynı.
 */
export function kampanyaNegatifleriBody(params: { campaignResource: string; kelimeler: readonly string[] }): GoogleMutateBody {
  return body(
    params.kelimeler.map((text) => ({
      create: { campaign: params.campaignResource, negative: true, keyword: { text: text.trim(), matchType: 'BROAD' } },
    })),
  );
}

/**
 * ═══ ARAMA ÖĞESİ (CallAsset) — telefon numarası ═══
 *
 * E.164 numaradan (`+905321234567`) Google'ın istediği iki alanı türetir:
 * `countryCode` (iki harf) ve `phoneNumber` (ulusal biçim). Alan adları v25
 * referansından (`CallAsset`: ikisi de "Required").
 *
 * YALNIZ +90. Ülke kodu numaranın önekinden TAHMİN EDİLMİYOR: +1 ABD de
 * Kanada da, +7 Rusya da Kazakistan da; yanlış ülke kodu numarayı başka bir
 * hatta çevirir ve Google bunu geçerli sayabilir (aramalar başka yere düşer,
 * hata yok). Rehber zaten yalnız +90 istiyor (`eksikler.ts` "Telefon numarası
 * +90 ile başlamalı"); E.164 deseni orada daha geniş olduğu için buradaki
 * kontrol İKİNCİ kapı ve bilinmeyen önekte AÇIKÇA patlıyor.
 *
 * Ulusal biçim: Türkiye'de ulusal anlamlı numara 10 hane (5xx/2xx/3xx/4xx…),
 * başına santral öneki `0` KONMUYOR. Google'ın örneği ABD için
 * `1234567890` (ülke kodu ve santral öneki yok); aynı kural. Hane sayısı
 * tutmuyorsa numara eksik ya da fazla yazılmış demektir ve bu da reddediliyor:
 * Google eksik numarayı da kaydedip "doğrulanmamış" diye bekletebilir.
 */
export function aramaOgesiTelefonu(e164: string): { countryCode: 'TR'; phoneNumber: string } {
  const t = e164.trim();
  const m = /^\+90(\d{10})$/.exec(t);
  if (m) return { countryCode: 'TR', phoneNumber: m[1]! };
  if (t.startsWith('+90')) throw new Error(`Türkiye numarası +90'dan sonra 10 hane olmalı: ${t.slice(0, 20)}`);
  throw new Error(`Arama öğesi yalnız +90 (Türkiye) numarasıyla kuruluyor; ülke kodu tahmin edilmiyor: ${t.slice(0, 20)}`);
}

/**
 * Arama öğesinin dönüşüm ayarı. AÇIKÇA yazılıyor (CLAUDE.md "platformun
 * varsayılanına güvenme"). Üç seçenek var (v25 `CallConversionReportingState`):
 * - `DISABLED`: reklamdan gelen arama dönüşüm sayılmaz. Telefon amacında bu,
 *   "En çok dönüşüm" teklifini kör bırakmak ve raporda aramanın hiç
 *   görünmemesi demek.
 * - `USE_RESOURCE_LEVEL_CALL_CONVERSION_ACTION`: öğeye özel dönüşüm işlemi
 *   ister (`callConversionAction`); elimizde böyle bir kimlik yok, uydurmuyoruz.
 * - `USE_ACCOUNT_LEVEL_CALL_CONVERSION_ACTION`: hesabın "reklamdan arama"
 *   dönüşüm ayarını kullanır. SEÇİLEN bu. Bedeli: hesapta arama dönüşümü
 *   tanımlı değilse arama yine sayılmaz — ama o bir HESAP KURULUMU kararı ve
 *   ölçüm kurulumunun işi; burada hesaptaki kararı ezmiyoruz.
 */
export const ARAMA_DONUSUM_AYARI = 'USE_ACCOUNT_LEVEL_CALL_CONVERSION_ACTION';

/**
 * ═══ ARAMA KAMPANYASI — TEK ATOMİK İSTEK (AdvCampaign rehberi) ═══
 *
 * `demandGenAtomikIstek`in Arama karşılığı: bütün işlemler tek
 * `googleAds:mutate` isteğinde, geçici (eksi) kimliklerle bağlı ve
 * `partialFailure: false`. Ya hepsi kurulur ya hiçbiri; ortada kalan yetim
 * bütçe ve elle geri alma kodu yok. Prova AYNI gövde, yalnız `validateOnly`.
 *
 * Gövdeler tek tek yukarıdaki üreticilerden geliyor (alan adları ve kurallar
 * orada, testli); burada yalnız geçici kimlik ve işlem türü ekleniyor.
 *
 * SIRA ÖNEMLİ: geçici kimlik ancak onu kuran işlem sırada önce geliyorsa
 * çözülüyor (bütçe → kampanya → kampanya ölçütleri → grup → kelimeler → reklam
 * → [arama öğesi → kampanya-öğe bağı]).
 *
 * ARAMA ÖĞESİ (`telefon` verilirse): `Asset` (callAsset) + `CampaignAsset`
 * (fieldType CALL) AYNI istekte. Ayrı bir ikinci istek, kampanya kurulup öğe
 * düştüğünde "telefon reklamı" diye açılan ama telefonu olmayan bir kampanya
 * bırakırdı: kullanıcı aramayı bekler, site tıklaması gelir, hata yok.
 * Öğe kampanyaya bağlanıyor, reklam grubuna değil: grubun tek RSA'sı var ve
 * kampanya düzeyi bağ, ileride eklenecek grupları da kapsıyor.
 *
 * NUMARA DOĞRULAMASI: Google, reklamdaki numaranın doğrulanmış olmasını
 * istiyor (Google Ads politika yardımı "Unverified phone number" / "Phone
 * number verification for call and location assets": numara reklamın
 * sitesinde METİN olarak görünmeli ya da alan adı sahipliği kanıtlanmalı;
 * algılama 3 güne kadar sürebiliyor). Bu bir POLİTİKA İNCELEMESİ, mutate
 * reddi değil (API'de ÖLÇÜLMEDİ): öğe kurulur, onaylanana kadar
 * `campaign_asset.primary_status` gösterilmeyen/beklemede kalır. Geri okuma
 * bu yüzden onay durumunu değil öğenin VARLIĞINI ve numarasını kıyaslıyor;
 * onay durumunu fark saymak, her yeni telefon reklamını "fark var"da
 * durdururdu.
 *
 * `adScheduleTargets` GÖNDERİLMİYOR: telefonun açık olduğu saatler Marka
 * Merkezi'nde yok ve saat uydurulmuyor. Alan boşken öğe reklamın gösterildiği
 * her saatte çıkar (hesap ayarına bağlı bir varsayılan değil, "kısıt yok");
 * kullanıcıya not olarak söyleniyor (`derle-google.ts`).
 *
 * CANLIDA HİÇ KOŞMADI (2026-10-10). İlk gerçek çağrı validateOnly provası
 * (MIMARI-REHBER § 8, Ö-1).
 */
export interface AtomikAramaIstegi {
  /** Kampanya adına damga eklenmez (rehber; `advKampanyaAdi`). */
  damgasiz?: boolean;
  customerId: string;
  name: string;
  stamp: string;
  gunlukButceMicros: bigint;
  /** Verilmezse kampanya açıldığı anda başlar (bugün başlayan rehber). */
  startDate?: string;
  endDate: string | null;
  teklif: AramaTeklifi;
  konumlar: string[];
  dil: string;
  negatifler: readonly string[];
  anahtarKelimeler: string[];
  finalUrl: string;
  basliklar: string[];
  aciklamalar: string[];
  /** E.164 (+90…). Verilirse arama öğesi kurulur ve kampanyaya bağlanır. */
  telefon?: string | null;
  validateOnly: boolean;
}

export interface AtomikAramaGovdesi {
  mutateOperations: Array<Record<string, unknown>>;
  partialFailure: false;
  validateOnly: boolean;
}

export interface AtomikAramaSirasi {
  kampanya: number;
  reklamGrubu: number;
  reklam: number;
  /** Arama öğesinin kampanya bağı (CampaignAsset); telefon yoksa null. */
  aramaOgesi: number | null;
}

function ilkOlustur(b: GoogleMutateBody): Record<string, unknown> {
  const c = b.operations[0]?.create;
  if (!c) throw new Error('Gövde üreticisi create işlemi döndürmedi.');
  return c;
}

export function aramaAtomikIstek(p: AtomikAramaIstegi): { govde: AtomikAramaGovdesi; sira: AtomikAramaSirasi } {
  if (p.anahtarKelimeler.length === 0) {
    // Anahtar kelimesiz arama kampanyası hiç harcamaz ve hata vermez.
    throw new Error('Anahtar kelime yok: arama kampanyası hiç gösterilmezdi.');
  }
  if (p.teklif === 'manualCpc') {
    // Rehber elle CPC kurmuyor: grup tavanını bilmeden yazmak, hesabın
    // varsayılan teklifine güvenmek olurdu.
    throw new Error('Atomik arama isteği yalnız otomatik teklifle kurulur.');
  }
  const kok = `customers/${p.customerId}`;
  const BUTCE = `${kok}/campaignBudgets/-1`;
  const KAMPANYA = `${kok}/campaigns/-2`;
  const GRUP = `${kok}/adGroups/-3`;
  const ARAMA_OGESI = `${kok}/assets/-4`;
  // Numara İSTEK KURULMADAN çözülüyor: bilinmeyen önekte hiçbir işlem
  // üretilmeden patlasın, yarım bir gövde kimsenin eline geçmesin.
  const tel = p.telefon ? aramaOgesiTelefonu(p.telefon) : null;

  const ops: Array<Record<string, unknown>> = [];
  const ekle = (op: Record<string, unknown>): number => ops.push(op) - 1;

  ekle({
    campaignBudgetOperation: {
      create: {
        ...ilkOlustur(campaignBudgetBody({ name: p.name, amountMicros: p.gunlukButceMicros.toString(), stamp: p.stamp })),
        resourceName: BUTCE,
      },
    },
  });
  const kampanya = ekle({
    campaignOperation: {
      create: {
        ...ilkOlustur(
          campaignBody({
            name: p.name,
            budgetResource: BUTCE,
            stamp: p.stamp,
            damgasiz: p.damgasiz,
            ...(p.startDate ? { startDate: p.startDate } : {}),
            ...(p.endDate ? { endDate: p.endDate } : {}),
            teklif: p.teklif,
          }),
        ),
        resourceName: KAMPANYA,
      },
    },
  });
  for (const o of [
    ...kampanyaKonumlariBody({ campaignResource: KAMPANYA, konumlar: p.konumlar }).operations,
    ...kampanyaDiliBody({ campaignResource: KAMPANYA, dil: p.dil }).operations,
    ...kampanyaNegatifleriBody({ campaignResource: KAMPANYA, kelimeler: p.negatifler }).operations,
  ]) {
    ekle({ campaignCriterionOperation: { create: o.create } });
  }
  const reklamGrubu = ekle({
    adGroupOperation: {
      create: { ...ilkOlustur(adGroupBody({ name: `${p.name} — grup`, campaignResource: KAMPANYA, cpcBidMicros: null })), resourceName: GRUP },
    },
  });
  for (const o of keywordsBody({ adGroupResource: GRUP, keywords: p.anahtarKelimeler }).operations) {
    ekle({ adGroupCriterionOperation: { create: o.create } });
  }
  const reklam = ekle({
    adGroupAdOperation: {
      create: ilkOlustur(
        responsiveSearchAdBody({
          adGroupResource: GRUP,
          finalUrl: p.finalUrl,
          headlines: p.basliklar,
          descriptions: p.aciklamalar,
          durum: 'ENABLED',
        }),
      ),
    },
  });
  let aramaOgesi: number | null = null;
  if (tel) {
    ekle({
      assetOperation: {
        create: {
          resourceName: ARAMA_OGESI,
          callAsset: { countryCode: tel.countryCode, phoneNumber: tel.phoneNumber, callConversionReportingState: ARAMA_DONUSUM_AYARI },
        },
      },
    });
    aramaOgesi = ekle({ campaignAssetOperation: { create: { campaign: KAMPANYA, asset: ARAMA_OGESI, fieldType: 'CALL' } } });
  }
  return {
    govde: { mutateOperations: ops, partialFailure: false, validateOnly: p.validateOnly },
    sira: { kampanya, reklamGrubu, reklam, aramaOgesi },
  };
}

// ---------------------------------------------------------------------------
// İYİLEŞTİR — var olan varlıkta DURUM ve BÜTÇE güncellemesi
// ---------------------------------------------------------------------------

/**
 * Durum güncellemesi: kampanya, reklam grubu ya da reklam (ad_group_ad).
 *
 * `updateMask: 'status'` TEK ALAN. Maskeye başka bir alan yazmak, gövdede
 * olmayan o alanı Google'ın VARSAYILANA çekmesi demek; maskesiz güncelleme
 * ise reddediliyor (`GoogleMutateOperation.update` yorumu).
 *
 * Değerler `ENABLED`/`PAUSED` — `REMOVED` bu yoldan ASLA gönderilmiyor:
 * kaldırma geri alınamaz ve İyileştir'in eylemleri durdur/sürdür/bütçe.
 */
export function durumGuncelleBody(params: {
  resourceName: string;
  status: 'ENABLED' | 'PAUSED';
  validateOnly: boolean;
}): GoogleMutateBody {
  return {
    ...body([{ update: { resourceName: params.resourceName, status: params.status }, updateMask: 'status' }]),
    ...(params.validateOnly ? { validateOnly: true } : {}),
  };
}

/**
 * Bütçe tutarı güncellemesi — `CampaignBudget.amount_micros`.
 *
 * TUTAR STRING: int64 alanları REST gövdesinde string taşınıyor ve
 * `Number`a çevirmek büyük tutarda hassasiyet kaybı demek. Sıfır ve eksi
 * burada reddediliyor: Google'ın kendi hatası yerine sebebi söyleyen bir
 * mesaj, teşhisi kısaltıyor.
 */
export function butceTutariBody(params: {
  budgetResourceName: string;
  amountMicros: bigint;
  validateOnly: boolean;
}): GoogleMutateBody {
  if (params.amountMicros <= 0n) throw new Error('Bütçe sıfır ya da eksi olamaz');
  return {
    ...body([
      {
        update: { resourceName: params.budgetResourceName, amountMicros: params.amountMicros.toString() },
        updateMask: 'amount_micros',
      },
    ]),
    ...(params.validateOnly ? { validateOnly: true } : {}),
  };
}

/**
 * Seviye → koleksiyon ve kaynak adı. Reklamın kaynak adı reklam grubuyla
 * birlikte kuruluyor (`adGroupAds/{grup}~{reklam}`); grup kimliği yoksa
 * yazılacak bir yol YOK ve tahmin edilmiyor.
 */
export function googleKaynakAdi(
  customerId: string,
  level: 'campaign' | 'ad_group' | 'ad',
  externalId: string,
  ustExternalId?: string,
): { koleksiyon: 'campaigns' | 'adGroups' | 'adGroupAds'; kaynak: string } {
  if (level === 'campaign') return { koleksiyon: 'campaigns', kaynak: `customers/${customerId}/campaigns/${externalId}` };
  if (level === 'ad_group') return { koleksiyon: 'adGroups', kaynak: `customers/${customerId}/adGroups/${externalId}` };
  if (!ustExternalId) throw new Error('Google reklamına yazmak için reklam grubu kimliği gerekli');
  return { koleksiyon: 'adGroupAds', kaynak: `customers/${customerId}/adGroupAds/${ustExternalId}~${externalId}` };
}
