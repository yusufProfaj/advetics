# A1 — Google Ads API (v25) araştırması: AdvCampaign için kampanya kurma yüzeyi

> Tarih: 2026-10-07 · Sürüm: **v25** (karar verildi) · Kapsam: kampanya OLUŞTURMA,
> acemi amaç → kampanya türü eşlemesi, güvenli yazma, öneri/optimizasyon,
> erişim/kota, v25 değişiklikleri.
>
> **İşaretler:** `[belge]` = developers.google.com / support.google.com sayfasından
> bu turda okundu, kaynak URL yanında. `[çıkarım]` = belgeden türetilmiş ya da
> belge sessiz, canlıda doğrulanmadı. Bu projede "belgede yazıyor" ile "canlıda
> çalışıyor" AYNI ŞEY DEĞİL (CLAUDE.md § Canlıda öğrenilen platform gerçekleri) —
> Google yazma yolu canlıda HİÇ denenmedi.
>
> Kısaltma: `API = https://developers.google.com/google-ads/api`

---

## 0. Özet (10 madde)

1. **v25 2026-07-22'de çıktı, sunset Ağustos 2027.** v26 Ekim 2026'da geliyor;
   v25 o andan itibaren "deprecated" ama çalışır. Bizim yıllık bir yükseltme
   borcumuz var, acil değil. `[belge]` API/docs/sunset-dates
2. **API'den kurulabilen dört yol:** Search (RSA + anahtar kelime), Performance
   Max (asset group), Demand Gen (YouTube/Discover/Gmail — video için TEK yol),
   standart Display (responsive display ad). VIDEO kampanyası API'den
   kurulamıyor (depoda zaten kilitli). `[belge]`
3. **Tek istekte atomik kurulum mümkün ve Google'ın önerdiği yol:**
   `GoogleAdsService.Mutate` + negatif geçici kimlikler (`campaigns/-1`),
   `partial_failure=false` → "hepsi ya da hiçbiri". PMax için bu ZORUNLU.
   Depodaki mevcut kod bunu KULLANMIYOR (servis başına sıralı çağrı + elle
   geri alma). `[belge]` API/docs/mutating/overview
4. **`validate_only=true` gerçek bir prova:** istek doğrulanır, yürütülmez;
   politika ihlalleri `PolicyFindingError` olarak döner. Bazı kaynaklar
   desteklemez (`RESOURCE_DOES_NOT_SUPPORT_VALIDATE_ONLY`), BatchJob hiç
   desteklemez. Meta'daki "prova" adımının birebir karşılığı. `[belge]`
5. **DEPODA İKİ KESİN KIRILMA BULUNDU (kod yazılmadı, yalnızca not):**
   (a) `Campaign.start_date/end_date` v23'te KALDIRILDI → `start_date_time/
   end_date_time`; `google-write.ts` ve `google-demandgen.ts` hâlâ
   `startDate/endDate` yazıyor ve `createVideoBoost` her çağrıda `endDate`
   gönderiyor. (b) `contains_eu_political_advertising` kampanya OLUŞTURMADA
   zorunlu (`FieldError.REQUIRED`), iki gövde de göndermiyor. `[belge]` + `[çıkarım]`
   (bkz. § 7)
6. **Acemi için varsayılan kampanya türü:** dönüşüm takibi YOKSA Search +
   Maximize Clicks (ya da mevcut Manual CPC); takip VARSA Search/PMax +
   Maximize Conversions. PMax yalnızca Maximize Conversions/Value kabul ediyor —
   takipsiz hesapta öğrenmeyen kampanya. `[belge]` + `[çıkarım]`
7. **"Form kampanyası" Google'da VAR:** `LeadFormAsset` (Search ve PMax).
   Ama uygunluk eşiği var (≥1.000 USD harcama + politika geçmişi +
   doğrulama), dönüşüm odaklı teklif ŞART ve Türkiye'nin destek listesinde
   olup olmadığı belgede yazmıyor. Depodaki "karşılığı YOK" yorumu
   (`createLeadForm`) bu yüzden yeniden değerlendirilmeli. `[belge]`
8. **WhatsApp:** `BusinessMessageAsset` (WHATSAPP sağlayıcı) Search'te
   Click-to-Message — ama **allowlist arkasında**, hesap yöneticisiyle
   açılıyor. Varsayılan akışa konamaz. `[belge]`
9. **Anahtar kelime üretimi (`KeywordPlanIdeaService`) Explorer erişiminde
   YASAK**, Basic gerektiriyor; ayrıca 1 QPS sınırı. Depo "Basic Access"
   varsayıyor — gerçek seviye canlıda teyit edilmeli. `[belge]`
10. **Kurulum sırasında öneri:** `RecommendationService.GenerateRecommendations`
    henüz var olmayan bir Search/PMax kampanyası için bütçe, anahtar kelime,
    teklif stratejisi önerisi üretebiliyor — "sistem en optimize kurulumu
    seçsin" hedefinin Google tarafındaki doğal aracı. Yetersiz veride HATA
    VERMİYOR, sessizce boş dönüyor (bu projenin klasik tuzağı). `[belge]`

## 1. Depodaki mevcut durum (okundu, değiştirilmedi)

| Konu | Yer | Not |
|---|---|---|
| Sürüm sabiti | `apps/api/src/config/configuration.ts:173` → `GOOGLE_ADS_API_VERSION` varsayılanı `'v25'` | Ortam değişkeniyle ezilebilir |
| Taban URL | `google.provider.ts:171` → `https://googleads.googleapis.com/${apiVersion}` | REST, SDK yok |
| Başlıklar | `google.provider.ts:451-486, 1262, 1749, 2149` | `developer-token` + `login-customer-id` (MCC varsa) |
| Yazma çağrısı | `google.provider.ts:2143` `mutate()` → `customers/{id}/{koleksiyon}:mutate` | Servis başına; `results[0].resourceName` yoksa hata (iyi) |
| Search kurulumu | `publishDraft` (`:2029`) + `google-write.ts` | bütçe → kampanya (`manualCpc`, PAUSED) → reklam grubu (`SEARCH_STANDARD`, `cpcBidMicros`) → anahtar kelime (`PHRASE`) → RSA; hata olursa TERS SIRADA `remove` |
| Demand Gen video | `createVideoBoost` (`:1864`) + `google-demandgen.ts` | logo asset + YouTube video asset + DG kampanya (`targetSpend`) + konum + yaş kitlesi + `DemandGenVideoResponsiveAdInfo`; en son yayına alma |
| Varlık yükleme | `uploadAdImage` (`:1826`), `createYouTubeVideoAsset` (`:1839`) | Görsel base64 ile `assets:mutate` |
| Konum araması | `searchGeoLocations` (`:1743`) → `geoTargetConstants:suggest` | Varsayılan Türkiye `geoTargetConstants/2792` (`google-demandgen.ts:248`) |
| Okuma | `fetchStructure`, `fetchInsights`, `fetchBreakdowns`, `fetchSearchTerms`, `fetchKeywords` | Canlıda çalışıyor (TASARIM-OLUSTUR.md § 9.1) |
| Lead form | `createLeadForm` (`:2203`) | "Google'da Meta anlık formunun karşılığı YOK" diye kalıcı hata — § 4.3'e bakın |
| `partialFailure` | `google-write.ts:48`, `google-demandgen.ts:27` | Her yerde `false` — doğru |

**Yapısal gözlem `[çıkarım]`:** mevcut kod atomikliği elle taklit ediyor
(oluştur → hata olursa sil). Bu, silme de düşerse yarım kampanya bırakıyor
(kod bunu logluyor ama kullanıcıya söyleyecek bir yer yok). Google'ın kendi
önerisi tek `GoogleAdsService.Mutate` isteği — § 5.1.

---

## 2. Kampanya oluşturma yolları

### 2.1. Genel tablo

| Tür | `advertising_channel_type` | Zorunlu kaynaklar | Reklam birimi | Kaynak |
|---|---|---|---|---|
| Search | `SEARCH` | CampaignBudget, Campaign, AdGroup, AdGroupAd, AdGroupCriterion (anahtar kelime) | `ResponsiveSearchAdInfo` | `[belge]` API/docs/campaigns/search-campaigns/getting-started |
| Performance Max | `PERFORMANCE_MAX` (alt tip YOK) | CampaignBudget, Campaign, AssetGroup, Asset'ler, AssetGroupAsset'ler (+ marka yönergeleri açıkken CampaignAsset) | Asset group (reklam nesnesi yok) | `[belge]` API/docs/performance-max/create-campaign |
| Demand Gen | `DEMAND_GEN` (alt tip YOK) | CampaignBudget (paylaşımsız), Campaign, AdGroup (tipsiz), AdGroupCriterion, Asset'ler, AdGroupAd | `DemandGenMultiAssetAdInfo` / `DemandGenVideoResponsiveAdInfo` / `DemandGenCarouselAdInfo` / `DemandGenProductAdInfo` | `[belge]` API/docs/demand-gen/create-campaign |
| Display (standart) | `DISPLAY` | CampaignBudget, Campaign, AdGroup, görsel Asset'ler, AdGroupAd | `ResponsiveDisplayAdInfo` | `[belge]` API/docs/responsive-display-ads/create-responsive-display-ads |
| Video | `VIDEO` | — | — | **API'den OLUŞTURULAMAZ**, yalnızca okuma/rapor (depoda `google-demandgen.ts` başındaki alıntı) `[belge]` |

**Bütün türlerde ortak zorunluluk:** `contains_eu_political_advertising`
(`DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING`). Oluşturmada set edilmezse
`FieldError.REQUIRED`; 2026-04-01'den beri hesapta beyansız TEK bir kampanya
varsa kampanya yönetimine dair BÜTÜN mutate'ler
`MutateError.EU_POLITICAL_ADVERTISING_DECLARATION_REQUIRED` ile düşüyor
(raporlama etkilenmiyor). `[belge]` API/docs/api-policy/eu-par,
API/reference/rpc/v25/MutateErrorEnum.MutateError

> **Sonucu `[çıkarım]`:** bu bir HESAP kilidi. Ajansın havuzundaki bir
> müşteri hesabında başka bir araçla (ya da elle) açılmış beyansız eski bir
> kampanya varsa, bizim doğru kurduğumuz istek de düşer ve hata mesajı
> "bizim" kampanyamızdan bahsetmez. Yayın öncesi kontrolde
> `SELECT campaign.id FROM campaign WHERE campaign.missing_eu_political_advertising_declaration = TRUE`
> sorulmalı ve kullanıcıya hesaptaki sorun olarak söylenmeli.

### 2.2. Search

| Konu | Değer | Kaynak |
|---|---|---|
| RSA başlık | 3–15 adet, her biri ≤30 karakter, tekrar yok | `[belge]` API/docs/responsive-search-ads/create-responsive-search-ads |
| RSA açıklama | 2–4 adet, ≤90 karakter | aynı |
| `path1` / `path2` | ≤15 karakter; `path2` yalnızca `path1` varsa | aynı |
| Sabitleme | HEADLINE_1/2/3, DESCRIPTION_1/2; her konum doldurulabilir kalmalı | `[belge]` API/docs/responsive-search-ads/overview |
| Gösterimde | en çok 3 başlık + 2 açıklama | aynı |
| Ağ ayarı | `target_google_search`, `target_search_network` (arama ortakları), `target_content_network` (Display genişlemesi), `target_partner_search_network` (yalnızca seçili ortaklar — "muhtemelen sizin için geçerli değil") | `[belge]` API/reference/rpc/v25/Campaign.NetworkSettings |
| Eşleme türü | EXACT / PHRASE / BROAD; örnek kod "akıllı teklifte BROAD önerilen" diyor | `[belge]` search getting-started |
| Reklam paylaşımı | v23'ten beri bir reklam birden çok reklam grubunda kullanılamaz (`AD_SHARING_NOT_ALLOWED`) | `[belge]` release-notes v23 |
| Call ads | v23'te KALDIRILDI; telefon için `CallAsset` | `[belge]` release-notes v23 |

**AI Max for Search** `[belge]` API/docs/campaigns/ai-max-for-search-campaigns/getting-started:
`Campaign.ai_max_setting.enable_ai_max = true` yalnızca arama terimi
eşleştirmesini (broad + "anahtar kelimesiz") açıyor; metin özelleştirme
(`TEXT_ASSET_AUTOMATION`) ve son URL genişletme
(`FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION`) Search'te varsayılan
`OPTED_OUT` ve AI Max kapalıyken açılırsa `CampaignError.AI_MAX_MUST_BE_ENABLED`.
v25.1 `Campaign.aca_migration_date_time` ve `broad_match_migration_date_time`
alanlarını ekledi: Google bazı kampanyaları **kendiliğinden** AI Max'e
taşıyacak. `[belge]` release-notes v25.1

> `[çıkarım]` Acemi akışta AI Max kapalı başlamalı ve bunu AÇIKÇA yazmalıyız
> (`enable_ai_max = false`): "platformun varsayılanına güvenme" kuralı. Otomatik
> taşıma tarihi okuma tarafında izlenmeli; taşınan kampanya bizim kurduğumuz
> dar eşlemeyi sessizce genişletir.

### 2.3. Performance Max

| Varlık (`AssetFieldType`) | Min | Maks | Sınır | Kaynak |
|---|---|---|---|---|
| HEADLINE | 3 | 15 | 30 karakter | `[belge]` API/docs/performance-max/asset-requirements |
| LONG_HEADLINE | 1 | 5 | 90 karakter | aynı |
| DESCRIPTION | 2 | 5 | 90 karakter | aynı |
| MARKETING_IMAGE (yatay 1.91:1) | 1 | 20 | öneri 1200×628, min 600×314, ≤5120 KB | aynı |
| SQUARE_MARKETING_IMAGE (1:1) | 1 | 20 | öneri 1200×1200, min 300×300 | aynı |
| BUSINESS_NAME | 1 | 1 | 25 karakter — marka yönergeleri AÇIKKEN CampaignAsset olarak | aynı |
| LOGO (1:1) | 1 | 5 | min 128×128 — marka yönergeleri AÇIKKEN CampaignAsset | aynı |
| PORTRAIT_MARKETING_IMAGE (4:5) | 0 | 20 | min 480×600 | aynı |
| LANDSCAPE_LOGO (4:1) | 0 | 20 | min 512×128 | aynı |
| YOUTUBE_VIDEO | 0 | 15 | 16:9 / 1:1 / 9:16, ≥10 sn — **zorunlu değil** | aynı |
| CALL_TO_ACTION_SELECTION | 0 | 1 | otomatik ya da listeden | aynı |

- Görsel türleri GIF/JPG/PNG. **En-boy oranı kontrolü YÜKLEMEDE DEĞİL
  BAĞLAMADA yapılıyor** (`ASPECT_RATIO_NOT_ALLOWED`). `[belge]` aynı sayfa.
  `[çıkarım]` Yani asset yükleme başarılı döner, hata ancak asset group
  kurulurken düşer — "giriş anında doğrula" kuralı gereği oran kontrolü
  panelde, görsel BIRAKILDIĞINDA yapılmalı.
- Teklif: **yalnızca** `MaximizeConversions` (opsiyonel tCPA) ve
  `MaximizeConversionValue` (opsiyonel tROAS); portföy stratejisi yok. `[belge]`
  API/docs/performance-max/create-campaign
- Marka yönergeleri (`brand_guidelines_enabled`) yeni standart ve retail PMax'te
  **otomatik açık**, alan `Immutable`. Açıkken BUSINESS_NAME/LOGO/LANDSCAPE_LOGO
  CampaignAsset olarak bağlanmalı. `[belge]` API/reference/rpc/v25/Campaign
- "Bütün marka varlıkları kampanya seviyesinde bağlanmalı ve partial failure
  KULLANILMADAN tek kampanya oluşturma isteğinde gönderilmeli." `[belge]`
  API/docs/performance-max/create-campaign → PMax için tek `GoogleAdsService.Mutate`
  zorunlu.
- v25.2: AssetGroup seviyesinde izleme şablonu/özel parametre/son URL eki;
  PMax için otomatik video tarama (`AUTOMATED_VIDEO_CRAWL`: açılış sayfası,
  sosyal, YouTube). `[belge]` release-notes v25.2

### 2.4. Demand Gen

| Konu | Değer | Kaynak |
|---|---|---|
| Bütçe | paylaşımsız (`explicitly_shared=false`); toplam bütçe için `total_amount_micros` + `period=CUSTOM` + kampanyada başlangıç/bitiş | `[belge]` API/docs/demand-gen/create-campaign |
| Bütçe büyüklüğü | "günlük bütçe beklenen tCPA'nın en az 15 katı" önerisi | aynı |
| Teklif | Maximize Clicks, Target CPA, Maximize Conversions, Target ROAS; v22'den beri Target CPC | `[belge]` aynı + release-notes v22 özeti |
| Hedefleme | konum/dil/kitle **reklam grubu** seviyesinde | aynı |
| Kanal kontrolü | `demand_gen_ad_group_settings.channel_controls.selected_channels`: `youtube_in_stream`, `youtube_in_feed`, `youtube_shorts`, `discover`, `gmail`, `display` | aynı + API/docs/demand-gen/channel-controls |
| Önerilen kurulum | tek `GoogleAdsService.Mutate`, negatif geçici kimlikler; "yetim varlık kalmasın" | aynı |

`DemandGenMultiAssetAdInfo` (görsel reklam) `[belge]` API/reference/rpc/v25/DemandGenMultiAssetAdInfo:

| Alan | Sınır |
|---|---|
| `headlines` | 1–5, görüntü genişliği 30 |
| `descriptions` | 1–5, genişlik 90 |
| `business_name` | zorunlu, genişlik 25 |
| `logo_images` | 1–5, 1:1 (±%1), min 128×128 |
| `marketing_images` (1.91:1, min 600×314) / `square_marketing_images` (1:1, min 300×300) | biri zorunlu; dört görsel türü TOPLAM ≤20 |
| `portrait_marketing_images` (4:5, min 480×600), `tall_portrait_marketing_images` (9:16, min 600×1067) | opsiyonel |
| `classic_display_images` | ≤20 (v24.1'de eklendi) |
| `lead_form_only` | v23'te KALDIRILDI |

`DemandGenVideoResponsiveAdInfo` (video) `[belge]` API/reference/rpc/v25/DemandGenVideoResponsiveAdInfo:
`business_name`, `videos` (YouTube video asset), `logo_images` ZORUNLU
(v24'ten beri video ve logo da zorunlu — release-notes v24); `headlines`,
`long_headlines`, `descriptions`, `call_to_actions`, `breadcrumb1/2`,
`companion_banners` (tek). Başlık/açıklama adet sınırları proto'da YOK →
`[çıkarım]` yardım merkezinden ölçülmeli (support.google.com/google-ads/answer/13547298
bu turda okunamadı).

### 2.5. Display (standart)

`ResponsiveDisplayAdInfo` `[belge]` API/docs/responsive-display-ads/create-responsive-display-ads:
en az 1 `final_urls`; `marketing_images` (1.91:1, min 600×314) ve
`square_marketing_images` (1:1, min 300×300) — toplam ≤15; `headlines` 1–5
(≤30); `long_headline` tek (≤90); `descriptions` 1–5 (≤90); `business_name`
≤25. Renk (`main_color`/`accent_color`), `format_setting` (native/non-native).

### 2.6. Video varlığı — YouTube kimliği ZORUNLU mu?

- Bütün video alanları (`YOUTUBE_VIDEO`, `AdVideoAsset`) bir
  `YoutubeVideoAsset { youtube_video_id }` (11 karakter) istiyor — evet,
  video **önce YouTube'da olmalı**. `[belge]` API/reference/rpc/v25/YoutubeVideoAsset
- v23'ten beri `YouTubeVideoUploadService.CreateYouTubeVideoUpload` ile video
  API'den doğrudan YouTube'a yüklenebiliyor (yalnızca REST, .NET, PHP,
  Python). `channel_id` verilmezse **Google'ın yönettiği kanala** ve
  `UNLISTED` olarak gidiyor; durum makinesi `PENDING → UPLOADED → PROCESSED`
  (+ `FAILED`, `REJECTED`, `UNAVAILABLE`). Marka kanalına yükleme servis
  hesabıyla yapılamıyor. `[belge]` API/docs/assets/upload-videos
- `[çıkarım]` Bu, "kullanıcı video bırakır" akışının Google tarafını
  YouTube Data API'ye gerek kalmadan kapatıyor. Ama Meta'daki "video hazır
  olmadan kurma" dersi aynen geçerli: `PROCESSED` görülmeden asset/ad
  kurulmamalı ve `REJECTED` kullanıcıya platformun mesajıyla gösterilmeli.

---

## 3. Teklif stratejileri

| Strateji (alan) | Search | PMax | Demand Gen | Display | Ne zaman `[çıkarım]` |
|---|---|---|---|---|---|
| Manual CPC (`manual_cpc`) | ✓ | ✗ | ✗ | ✓ | Mevcut kod; öngörülebilir ama acemiye tavan teklif sormayı gerektirir |
| Maximize Clicks (`target_spend`) | ✓ | ✗ | ✓ | ✓ | **Takipsiz yeni hesapta varsayılan** — sadece bütçe ister |
| Maximize Conversions (`maximize_conversions`, ops. `target_cpa_micros`) | ✓ | ✓ | ✓ | ✓ | Dönüşüm takibi + birkaç hafta veri varken |
| Target CPA | ✓ | (MaxConv içinde) | ✓ | ✓ | Geçmiş CPA bilindiğinde; yeni hesapta tahmin = risk |
| Maximize Conversion Value / tROAS | ✓ | ✓ | ✓ (tROAS) | ✓ | Değer gönderen e-ticaret |
| Target Impression Share | ✓ | ✗ | ✗ | ✗ | Marka koruma; acemi akışta yok |
| Target CPC | — | — | ✓ (v22+) | — | DG'de tıklama tavanı |

Kaynaklar: PMax `[belge]` API/docs/performance-max/create-campaign; DG `[belge]`
API/docs/demand-gen/create-campaign; genel liste `[belge]`
API/docs/campaigns/bidding/assign-strategies. Hücrelerdeki ✓/✗ Search/Display
için `[çıkarım]` (assign-strategies sayfası tür başına tablo vermiyor).

- v25.2: Search'te "teklif açık artırmaya giremeyecek kadar düşük" için
  `RAISE_TARGET_CPA_PERFORMANCE_BID_TOO_LOW` / `LOWER_TARGET_ROAS_..._TOO_LOW`
  önerileri. `[belge]` release-notes v25.2 — tCPA'yı tahminle düşük koymanın
  sessiz sonucunu Google artık öneri olarak söylüyor.
- Lead form'un yayınlanması için "dönüşüm odaklı teklif" ve "lead form
  dönüşüm hedefine optimize" şart → mevcut `manualCpc` ile lead form
  ÇALIŞMAZ. `[belge]` support.google.com/google-ads/answer/9423234

---

## 4. Acemi amaç → Google kampanya türü eşlemesi

### 4.1. Eşleme tablosu

| Kullanıcının cümlesi | Önerilen tür | Teklif | Zorunlu ek | Notlar | Durum |
|---|---|---|---|---|---|
| "form / potansiyel müşteri" | Search + `LeadFormAsset` (takip varsa PMax + lead form) | Maximize Conversions (lead form hedefi) | gizlilik politikası URL'si, uygunluk | Uygun değilse: Search + site formuna trafik | `[belge]` + `[çıkarım]` |
| "web sitesi trafiği" | Search | Maximize Clicks | anahtar kelime, son URL | Görsel varsa ikinci kampanya DG (Discover/Gmail) | `[çıkarım]` |
| "satış" | Takip VARSA PMax (feed yoksa standart); YOKSA Search + Maximize Clicks ve uyarı | MaxConv / MaxConvValue | dönüşüm eylemi | Takipsiz PMax öğrenmez (depodaki K14 gerekçesi) | `[belge]` + `[çıkarım]` |
| "arama / telefon" | Search + `CallAsset` | Maximize Clicks → takip gelince MaxConv | `country_code`, `phone_number` | Call ads v23'te kaldırıldı; yalnızca asset | `[belge]` |
| "WhatsApp" | Search + `BusinessMessageAsset` (WHATSAPP) | Maximize Clicks | **allowlist**, WhatsApp hesabı, `starter_message`, CTA | Allowlist yoksa: Search + son URL `wa.me` YAPILMAMALI mı? → açık soru | `[belge]` |
| "bilinirlik" | Demand Gen (görsel/video) | Maximize Clicks / Target CPC | görsel ya da YouTube video + logo | API'de CPM/erişim stratejili VIDEO yok; "erişim" vaat edilemez | `[belge]` + `[çıkarım]` |
| "video izlenme" | Demand Gen video (`youtube_in_stream/in_feed/shorts`) | Maximize Clicks / MaxConv | YouTube video, logo, işletme adı | CPV YOK (`MANUAL_CPV`/`TARGET_CPV` VIDEO'ya ait) — depoda zaten yazılı | `[belge]` |

> `[çıkarım]` Ürün sohbeti "izlenme" için Google'da **görüntüleme başına
> ödeme** dememeli; doğru cümle "videonuz YouTube'da gösterilir, tıklama/sonuç
> başına ödersiniz".

### 4.2. Konum ve dil

- Konum ölçütü kimliği `GeoTargetConstantService.SuggestGeoTargetConstants`
  ile adla bulunuyor (`locale`, `country_code`, `location_names`); yanıtta
  `reach`, `target_type`, `status` var. Türkiye = `geoTargetConstants/2792`
  (depoda kilitli). `[belge]` API/docs/targeting/location-targeting
- Yarıçap: `ProximityInfo` (nokta + yarıçap). `[belge]` aynı sayfa
- `positive_geo_target_type`: **PRESENCE** ("ürün yalnızca o bölgede")
  ve **PRESENCE_OR_INTEREST** — sayfa iki yerde ikisini de "önerilen
  varsayılan" diye anıyor (bağlama göre). Negatifte PRESENCE_OR_INTEREST
  genelde desteklenmiyor. `[belge]` aynı sayfa
  > `[çıkarım]` Türk yerel işletmesi için PRESENCE AÇIKÇA gönderilmeli:
  > varsayılana bırakmak "İzmir'e ilgi duyan Almanya'daki kullanıcı"ya
  > gösterim demek — Meta'daki "kova birleşimi" hatasının kardeşi.
- İl/ilçe: Türkiye için il seviyesi (`Province`) ve bazı ilçeler GeoTargets
  CSV'de var; hangi ilçelerin hedeflenebilir olduğu `[çıkarım]` — canlıda
  `suggest` ile ölçülmeli (`target_type` alanı).
- Dil: Türkçe = `languageConstants/1037`. `[belge]` API/data/codes-formats
- DG'de konum/dil reklam grubu seviyesinde; Search/PMax'te kampanya
  seviyesinde (`CampaignCriterion`). `[belge]` DG create-campaign

### 4.3. Lead form (`LeadFormAsset`)

`[belge]` API/reference/rpc/v25/LeadFormAsset:

| Alan | Zorunlu | Not |
|---|---|---|
| `business_name` | ✓ | |
| `call_to_action_type` | ✓ | APPLY_NOW, BOOK_NOW, CONTACT_US, DOWNLOAD, GET_INFO, GET_OFFER, GET_QUOTE, GET_STARTED, JOIN_NOW, LEARN_MORE, REGISTER, REQUEST_DEMO, SIGN_UP, SUBSCRIBE |
| `call_to_action_description` | ✓ | |
| `headline`, `description` | ✓ | |
| `privacy_policy_url` | ✓ | Acemi kullanıcıdan ALINMASI gereken tek "teknik" bilgi `[çıkarım]` |
| `fields[]` | — | Sonradan yalnızca SIRALANABİLİR, soru eklenip çıkarılamaz |
| `custom_question_fields[]` | — | en çok 5 |
| `delivery_methods[]` | — | en çok BİR `WebhookDelivery` |
| `background_image_asset` | — | TAM 1200×628 |
| `post_submit_*` | — | gönderim sonrası metin/CTA |
| `desired_intent` | — | daha çok hacim / daha nitelikli |

Uygunluk ve işletme `[belge]` support.google.com/google-ads/answer/9423234:
Search ve PMax'te; hesap başına >1.000 USD (ya da tüm hesaplarda >15.000 USD)
harcama + iyi politika geçmişi + gizlilik politikası; hassas dikeyler hariç;
dönüşüm odaklı teklif + lead form dönüşüm hedefi ŞART; Google lead'leri
**60 gün** saklıyor, CSV son 30 gün; webhook ile CRM'e. Ülke listesi sayfada
yok — Türkiye `[çıkarım]` / doğrulanmalı.

> **Depo için sonuç `[çıkarım]`:** `createLeadForm`'daki *"karşılığı YOK"*
> ifadesi bugünkü Google için YANLIŞ — karşılık var ama Meta'nınkinden farklı
> (asset, webhook, uygunluk eşiği). TASARIM-OLUSTUR.md § 9.1 bu metodu "asla
> olmayacak" kovasına koyuyor; AdvCampaign'de "koşullu var" kovasına taşınmalı
> ve uygunluk yoksa kullanıcıya NEDEN olmadığı söylenmeli (`emptyReason`).
> Lead'leri çekmek ayrı iş: webhook uç noktası ya da API okuması.

### 4.4. Telefon ve mesaj varlıkları

- `CallAsset`: `country_code` (iki harf) + `phone_number` zorunlu; reklam
  takvimi (günde ≤6, toplam ≤42 aralık); arama dönüşümü raporlama durumu.
  `[belge]` API/reference/rpc/v25/CallAsset
- `BusinessMessageAsset`: WHATSAPP (`whatsapp_info`: ülke kodu + numara),
  FACEBOOK_MESSENGER ve ZALO (v23+); `starter_message` + CTA; hesap,
  kampanya ya da reklam grubu seviyesinde bağlanıyor, aynı anda tek aktif;
  **allowlist** (hesap yöneticisi). `[belge]` API/docs/assets/business-message-assets

> `[çıkarım]` Meta'da öğrenilen "numara sorulmaz, sayfadan gelir" kuralı
> Google'da GEÇERLİ DEĞİL: Google numarayı varlığın içinde istiyor. Numara
> bir kez Marka Merkezi'nde tutulmalı, her kampanyada yeniden sorulmamalı.

### 4.5. Anahtar kelime üretimi ve negatifler

`KeywordPlanIdeaService.GenerateKeywordIdeas` `[belge]`
API/docs/keyword-planning/generate-keyword-ideas, API/reference/rpc/v25/GenerateKeywordIdeasRequest:

| Konu | Değer |
|---|---|
| Tohum (tam olarak biri) | `keyword_seed` (1–20 kelime), `url_seed`, `keyword_and_url_seed` (1–20 + URL), `site_seed` (alan adı) |
| Hedefleme | `language` (ör. `languageConstants/1037`), `geo_target_constants` (≤10; boş = her yer) |
| Ağ | `keyword_plan_network` — boşsa "Google Search and Partners" |
| Dönen | ortalama aylık arama, rekabet, sayfa üstü teklif (düşük/yüksek) |
| Sayfa | ≤10.000 sonuç/sayfa; "10.000'den az sonuç son sayfa demek DEĞİL" |
| Kota | 1 QPS (`GenerateKeywordIdeas`, `...HistoricalMetrics`, `...ForecastMetrics`) — API/docs/best-practices/quotas |
| Erişim | **Explorer seviyesinde YASAK** (KeywordPlan* servisleri, AudienceInsights, ReachPlan) — API/docs/api-policy/access-levels |

- v24'te `GenerateKeywordForecastMetrics` alanları değişti (negatif anahtar
  kelime ve `max_cpc_bid_micros` tahminden KALDIRILDI). `[belge]` release-notes v24
- Negatifler: `AdGroupCriterion`/`CampaignCriterion` `negative=true` ya da
  paylaşımlı negatif listesi (`SharedSet` + `CampaignSharedSet`); getting-started
  "paylaşımlı negatif listeleri kullan" diyor. `[belge]` search getting-started
- `[çıkarım]` Acemi için negatif listesi üretimi: (1) sabit bir Türkçe taban
  liste ("bedava", "ücretsiz", "nasıl yapılır", "iş ilanı", "staj", "pdf",
  "indir" — işletme türüne göre), (2) yayından sonra `search_term_view`
  okunup öneri — depoda `fetchSearchTerms` zaten var.
- Sessiz hata uyarısı `[belge]`: bu servis Meta'nın ilgi alanı aramasına
  benzer biçimde boş liste dönebilir; "eşleşme yok" ile "çağrı reddedildi"
  ayrı yazılmalı.

### 4.6. Üretken varlık (başlık/görsel üretimi)

`AssetGenerationService` (`GenerateText`, `GenerateImages`) v22'de geldi,
**kapalı beta** ("closed beta participants"). `[belge]` release-notes v22,
API/reference/rpc/v25/AssetGenerationService. `[çıkarım]` AdvCampaign başlık
üretimini kendi modelimizle yapmalı; bu servise yaslanmamalı.

---

## 5. Güvenli yazma

### 5.1. `GoogleAdsService.Mutate` (tek istek, atomik)

`[belge]` API/docs/mutating/overview, API/docs/mutating/best-practices,
API/reference/rpc/v25/MutateGoogleAdsRequest:

| Konu | Kural |
|---|---|
| Geçici kimlik | `customers/{id}/campaigns/-1`, `.../campaignBudgets/-2` … |
| Sıra | geçici ad yalnızca TANIMLANDIKTAN SONRA referans verilebilir; ebeveyn önce |
| Tekillik | aynı istekte her geçici kimlik tek; istekler arası HATIRLANMAZ |
| Aynı kaynak iki kez | `ID_EXISTS_IN_MULTIPLE_MUTATES` |
| Kapsam | tek `customer_id`; başka hesabın nesnesini yalnızca yetkili MCC değiştirebilir |
| `partial_failure` | varsayılan `false`: "hepsi geçerliyse tek transaction'da" |
| `validate_only` | "doğrulanır, yürütülmez; mutate'ler yalnızca HATA döner" |
| `response_content_type` | yalnızca ad mı, değişen kaynak mı |
| Limit | istek başına 10.000 işlem (`TOO_MANY_MUTATE_OPERATIONS`) — API/docs/best-practices/quotas |
| BatchJob | her zaman partial failure, `validate_only` YOK |

REST biçimi `[çıkarım — v14 REST referansından, v25'te aynı desen]`:
`POST https://googleads.googleapis.com/v25/customers/{id}/googleAds:mutate`
gövde `{ "mutateOperations": [ { "campaignBudgetOperation": { "create": {...} } }, ... ], "partialFailure": false, "validateOnly": true }`.
Yanıt `mutateOperationResponses[i]` sırası işlem sırasıyla aynı.

> **AdvCampaign için öneri `[çıkarım]`:** prova ve yayın AYNI işlem listesini
> kullanmalı: önce `validateOnly: true` (sıfır nesne açar), sonra aynı liste
> `validateOnly: false`. Bu, Meta tarafındaki "nesne açmadan validate_only"
> commit'iyle (3e507da) simetrik ve "ikinci fonksiyon doğduğu anda ayrışır"
> dersine uyuyor: tek üretici, iki mod. Mevcut sıralı + geri almalı yol,
> yarım kampanya ihtimali yüzünden emekliye ayrılmalı.

### 5.2. PAUSED kur, sonra aç

- DG belgesi kampanyayı `PAUSED` kurmayı öneriyor; Search getting-started
  "kurulum sırasında duraklat" diyor. `[belge]`
- `[çıkarım]` Tek atomik istekte de kampanya `PAUSED` kurulmalı, ayrı bir
  `update` (`updateMask: status`) ile `ENABLED` yapılmalı. Gerekçe: politika
  incelemesi ve `primary_status` ilk okumayı yayından önce görmek;
  kullanıcı onayı ile "para harcamaya başla" anını ayırmak.

### 5.3. Politika incelemesi

| Okunacak | Anlamı | Kaynak |
|---|---|---|
| `ad_group_ad.policy_summary.approval_status` | APPROVED / APPROVED_LIMITED / AREA_OF_INTEREST_ONLY / DISAPPROVED (en ağır olan kazanır) | `[belge]` API/reference/rpc/v25/PolicyApprovalStatusEnum.PolicyApprovalStatus |
| `...review_status` | REVIEW_IN_PROGRESS / REVIEWED / ELIGIBLE_MAY_SERVE / UNDER_APPEAL | `[belge]` PolicyReviewStatusEnum |
| `...policy_topic_entries[]` | `topic` (ör. "ALCOHOL", "DESTINATION_NOT_WORKING"), `type`, `evidences`, `constraints` (ör. ülkede gösterilmez) | `[belge]` API/reference/rpc/v25/PolicyTopicEntry |
| `asset_group_asset.policy_summary` | PMax varlık düzeyi | `[çıkarım]` alan adı canlıda doğrulanmalı |
| `campaign.primary_status`, `primary_status_reasons[]`, `serving_status` | "neden yayında değil" tek cümlesi | `[belge]` API/reference/rpc/v25/Campaign |

- Konu listesi "sabit değil, herhangi bir anda değişebilir" → enum gibi
  ele alınmamalı, ham metin kullanıcıya gösterilmeli. `[belge]` PolicyTopicEntry
- Oluşturma anında politika ihlali `PolicyFindingError` (+ `PolicyFindingDetails`)
  olarak döner; anahtar kelimelerde `PolicyViolationError`. Muafiyet
  (`exempt_policy_violation_keys` / `ignorable_policy_topics`) ile yeniden
  gönderilebilir. `[belge]` API/docs/policy-exemption/overview
  > `[çıkarım]` Acemi akışta muafiyet OTOMATİK istenmemeli — "punctuation"
  > gibi zararsız durumlar dışında muafiyet istemek hesabın politika
  > geçmişini (lead form uygunluğunun şartı!) riske atar.
- `validate_only` politika bulgularını da döndürüyor (resmi "validate ad"
  örneği bunu gösteriyor). `[belge]` API/samples/validate-ad

### 5.4. Hata türleri

`[belge]` API/docs/best-practices/error-types, API/docs/get-started/handle-errors:

| Sınıf | Örnek | Davranış |
|---|---|---|
| Kimlik | `AuthenticationError.OAUTH_TOKEN_REVOKED` | yeniden yetkilendirme iste |
| Yetki | v25+: `AuthorizationError.CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` (Test seviyesi + gerçek hesap; v24'te `ACTION_NOT_PERMITTED`) | "geliştirici token'ı onaysız" — ayrı cümle |
| Tekrar denenebilir | `TRANSIENT_ERROR`, `INTERNAL_ERROR`, `RESOURCE_EXHAUSTED` | üstel bekleme + jitter (5 → 10 → 20 sn); kalırsa `request-id` logla |
| Doğrulama | `PolicyViolationError`, `PolicyFindingError`, `DateError`, `FieldError.REQUIRED`, `ASPECT_RATIO_NOT_ALLOWED` | kullanıcı girdisi; platform mesajını göster |
| Senkron | `RESOURCE_NOT_FOUND`, `RESOURCE_ALREADY_EXISTS` | yerel kayıt platformdan ayrışmış |
| Mutate özel | `EU_POLITICAL_ADVERTISING_DECLARATION_REQUIRED`, `RESOURCE_DOES_NOT_SUPPORT_VALIDATE_ONLY`, `OPERATION_DOES_NOT_SUPPORT_PARTIAL_FAILURE` | § 2.1, § 5.1 |

Hata gövdesi `GoogleAdsFailure` (`errors[]`, `requestId`). `[belge]`
handle-errors. `[çıkarım]` Mevcut `PlatformApiError` sınıflandırmasına
`kalıcı/geçici` haritası bu tabloyla kurulmalı; `requestId` sync/yayın
kaydına yazılmalı (Google destek talebinde istenen tek şey).

---

## 6. Optimizasyon ve öneri

### 6.1. RecommendationService

`[belge]` API/docs/recommendations:

| İşlev | Nasıl |
|---|---|
| Okuma | GAQL `FROM recommendation` — türe özel alt alan (`campaign_budget_recommendation`, `keyword_recommendation` …) |
| Uygulama | `RecommendationService.ApplyRecommendation` + `ApplyRecommendationOperation` (değerler ezilebilir) |
| Reddetme | `DismissRecommendation` |
| Otomatik uygulama | `RecommendationSubscriptionService` (ör. KEYWORD, RESPONSIVE_SEARCH_AD, TARGET_CPA_OPT_IN) |
| Kurulum anında | `GenerateRecommendations` — yalnızca `SEARCH` ve `PERFORMANCE_MAX` |
| İzleme | `change_event` içinde `GOOGLE_ADS_RECOMMENDATIONS_SUBSCRIPTION` |

`GenerateRecommendations` desteklediği türler `[belge]`: CAMPAIGN_BUDGET,
KEYWORD, MAXIMIZE_CLICKS_OPT_IN, MAXIMIZE_CONVERSIONS_OPT_IN,
MAXIMIZE_CONVERSION_VALUE_OPT_IN, SET_TARGET_CPA, SET_TARGET_ROAS,
SITELINK_ASSET, TARGET_CPA_OPT_IN, TARGET_ROAS_OPT_IN. Bütçe önerisi Search'te
`country_code` + konum + (`asset_group_info`) istiyor.
**"RecommendationService yetersiz veri verildiğinde HATA VERMEZ"** — boş
sonuç = "veri yetmedi" ya da "zaten önerilen durumda". `[belge]` aynı sayfa.

> `[çıkarım]` AdvCampaign'in "sistem en optimize kurulumu seçer" vaadi için
> en güçlü Google aracı bu. Ama boş yanıtın iki anlamı var ve ikisi
> ayrılamıyor → arayüzde "Google bu kurulum için öneri vermedi" denmeli,
> "en iyisi bu" denmemeli. Otomatik uygulama aboneliği acemi akışta AÇILMAMALI:
> Google'ın uyguladığı değişiklik bizim kural motorumuzu eski rakamla karar
> verdirir (Meta MCP hafıza notundaki sorunun aynısı).

v25 yenilikleri: `RAISE_TARGET_CPA_PERFORMANCE_BID_TOO_LOW`,
`LOWER_TARGET_ROAS_PERFORMANCE_BID_TOO_LOW` (v25.2),
`campaign_specific_app_goal_recommendation` (v25.1). `[belge]` release-notes.

### 6.2. Optimizasyon skoru

`customer.optimization_score`, `campaign.optimization_score` (0–1);
çoklu hesapta `optimization_score_weight` ile ağırlıklandır. `[belge]`
API/docs/recommendations, API/reference/rpc/v25/Campaign.
`[çıkarım]` Skor Google önerilerini uygulama oranını ölçüyor — performans
değil. Müşteri raporunda "başarı" olarak gösterilmemeli.

### 6.3. Mevcut kampanyayı yönetmek için okunacaklar `[çıkarım]`

| Ne | GAQL kaynağı / alan |
|---|---|
| Neden yayında değil | `campaign.primary_status`, `primary_status_reasons`, `ad_group_ad.policy_summary` |
| Teklif öğreniyor mu | `campaign.bidding_strategy_system_status` |
| Bütçe sınırlı mı | `campaign_budget` + `metrics.search_budget_lost_impression_share` |
| Arama terimleri / negatif adayı | `search_term_view` (depoda var) |
| Anahtar kelime kalitesi | `ad_group_criterion.quality_info.*` |
| Varlık performansı | `asset_group_asset`, `ad_group_ad_asset_view` (v23'te toplu performans etiketi Search/Display için KALDIRILDI — `[belge]` release-notes v23) |
| AI Max'e otomatik taşınma | `campaign.aca_migration_date_time`, `broad_match_migration_date_time` (v25.1) |
| Benzer işletmelere göre konum | `BenchmarksService.GenerateBenchmarksMetrics` yüzdelik (v25.2) — `[belge]` |

---

## 7. Depodaki mevcut yazma kodunda v25'e göre tespit edilen sorunlar

Kod YAZILMADI; aşağıdakiler AdvCampaign Google yolu yazılırken ele alınmalı.

| # | Sorun | Yer | Kanıt | Etki |
|---|---|---|---|---|
| 7.1 | `startDate` / `endDate` gönderiliyor | `google-write.ts:124-125`, `google-demandgen.ts:121-122`; `createVideoBoost` her çağrıda `endDate` | v23: "Campaign.start_date / end_date → start_date_time / end_date_time; eski alanlar KALDIRILDI" `[belge]` release-notes v23; v25 Campaign referansında `start_date_time` "yyyy-MM-dd HH:mm:ss" | `[çıkarım]` REST JSON'da bilinmeyen alan → 400 `INVALID_ARGUMENT`; DG video yolu HER ZAMAN düşer, Search yolu tarih verilince düşer |
| 7.2 | `containsEuPoliticalAdvertising` yok | `campaignBody`, `demandGenCampaignBody` | "kampanya oluşturma çağrısı alan set edilmezse `FieldError.REQUIRED`" `[belge]` eu-par | Her kampanya oluşturma düşer |
| 7.3 | Atomik değil | `publishDraft`, `createVideoBoost` | Google tek `GoogleAdsService.Mutate` öneriyor `[belge]` | Geri alma düşerse yarım kampanya |
| 7.4 | `manualCpc` + `enhancedCpcEnabled:false` | `google-write.ts:116` | `[çıkarım]` kalıcı değil, ama lead form ve PMax'e geçişte dönüşüm teklifi ŞART | Lead form ile bağdaşmaz |
| 7.5 | Lead form "karşılığı yok" | `createLeadForm` | `LeadFormAsset` mevcut `[belge]` | Ürün kararı yeniden açılmalı |
| 7.6 | Explorer/Basic varsayımı | `google.provider.ts:75` yorumu, ARCHITECTURE.md | Explorer'da KeywordPlanIdeaService yasak `[belge]` | Anahtar kelime önerisi canlıda reddedilebilir |

> 7.1 ve 7.2 TÜRÜ HATA: testler gövdenin ŞEKLİNİ doğruluyor (alan var mı),
> alanın v25'te GEÇERLİ olup olmadığını değil. Bu, CLAUDE.md'deki "Google
> yazma yolu canlıda HİÇ denenmedi" cümlesinin somut bedeli — ilk canlı
> `validate_only` provası ikisini de anında gösterecektir.

---

## 8. Erişim, kota, kimlik

### 8.1. Developer token seviyeleri

`[belge]` API/docs/api-policy/access-levels, API/docs/best-practices/quotas:

| Seviye | Hesaplar | Günlük işlem | Kısıt | Başvuru |
|---|---|---|---|---|
| Test | yalnızca test | 15.000 | — | API'yi açınca otomatik |
| Explorer | test + üretim | üretimde 2.880, testte 15.000 | KeywordPlan*, AudienceInsights, ReachPlan, faturalama servisleri YASAK | Cloud Console, otomatik yükseltilebilir |
| Basic | test + üretim | 15.000 | — | önce **marka doğrulaması** |
| Standard | test + üretim | sınırsız | servis bazlı sınırlar sürer | ~10 iş günü manuel denetim, RMF uyumu, demo hesabı |

- "Gün" = kayan 24 saat; aşımda `RESOURCE_EXHAUSTED`. Search/SearchStream
  bir işlem sayılıyor, geçerli `page_token`'lı sayfalar sayılmıyor. `[belge]` quotas

### 8.2. MCC ve başlıklar

`[belge]` API/docs/concepts/call-structure:
- `developer-token` her istekte.
- `login-customer-id`: yönetici hesap ÜZERİNDEN erişiliyorsa ZORUNLU ve
  yöneticinin kimliği olmalı; unutulursa yetki hatası. Arayüzde "hesap
  seçmek"e eşdeğer.
- `linked-customer-id`: yalnızca bağlı hesap (ör. üçüncü taraf uygulama)
  senaryosu.
- Mutate tek `customer_id`'ye gider; MCC kendi yönettiği hesabın nesnesini
  değiştirebilir. `[belge]` mutating/overview

Depo bunu zaten doğru yapıyor (`ctx.loginCustomerId`). `[çıkarım]` Müşteri
kendi Google'ını bağlarsa (Meta'daki "havuzun iki sahibi" modeli) MCC
olmayabilir → başlık gönderilmemeli, depodaki koşul bunu karşılıyor.

### 8.3. OAuth

- Senaryolar: servis hesabı (kendi hesaplarınız), tek kullanıcı, çok
  kullanıcılı web akışı (başkasının hesabı). Developer token ayrıca şart ve
  OAuth istemcisi API'nin açık olduğu AYNI Cloud projesinde olmalı. `[belge]`
  API/docs/oauth/overview
- Refresh token şu durumlarda ölür: kullanıcı iptali, **6 ay kullanılmama**,
  istemci başına kullanıcı başına **100 token** sınırı (101. en eskiyi
  uyarısız siler), ve onay ekranı "Testing" durumundaysa **7 gün**. `[belge]`
  developers.google.com/identity/protocols/oauth2 (Refresh token expiration)
  > `[çıkarım]` 100 token sınırı ajans modelinde gerçek bir tuzak: aynı
  > ajans kullanıcısıyla ortam başına (yerel, iki geliştirici, sunucu) ve
  > her yeniden bağlamada yeni token alınırsa eskiler SESSİZCE ölür —
  > LinkedIn'deki "bağlantı hiçbir şey bozulmadan ölür" dersinin Google
  > karşılığı.

---

## 9. v25 değişiklikleri ve ömrü

### 9.1. Takvim `[belge]` API/docs/sunset-dates

| Sürüm | Çıkış | Sunset |
|---|---|---|
| v23 | 2026-01-28 | Şubat 2027 |
| v24 | 2026-04-22 | Mayıs 2027 |
| **v25** | **2026-07-22** | **Ağustos 2027** |
| v25.1 | 2026-08-19 | Ağustos 2027 |
| v25.2 | 2026-09-23 | Ağustos 2027 |
| v26 (gelecek) | Ekim 2026 | Kasım 2027 |

Google "bir sürümü çıkışından ~1 yıl sonra kapatmayı" hedefliyor; minör
sürümler kırıcı değişiklik içermiyor. `[belge]` sunset-dates, release-notes.
`[çıkarım]` v25 → v25.2 yükseltmesi URL'de `v25` kalırken alınamaz mı? —
Minör sürümlerin REST yolu ayrı mı (ör. `v25_2`) belge burada sessiz; açık soru.

### 9.2. Bizi ilgilendiren değişiklikler (v23 → v25.2)

| Sürüm | Değişiklik | Bize etkisi |
|---|---|---|
| v23 | `start_date/end_date` → `start_date_time/end_date_time` (KIRICI) | § 7.1 |
| v23 | Reklam paylaşımı yasak; Call ads kaldırıldı; DG `lead_form_only` kaldırıldı | eşleme tablosu |
| v23 | `YouTubeVideoUpload` servisi | video akışı YouTube Data API'siz |
| v23 | `BusinessMessageAsset` Messenger/Zalo | WhatsApp yine allowlist |
| v23 | toplam bütçe hataları `DURATION_TOO_LONG_FOR_TOTAL_BUDGET`, `END_DATE_TIME_REQUIRED_FOR_TOTAL_BUDGET` | "toplam bütçe" seçeneği bitiş tarihi ister |
| v24 | DG video reklamda `videos` + `logo_images` ZORUNLU (KIRICI) | depoda zaten uygulanmış |
| v24 | Kampanya seviyesinde video marka güvenliği kaldırıldı (yalnızca müşteri seviyesi) | — |
| v24 | Keyword forecast alanları değişti | tahmin kullanılacaksa |
| v24.1 | DG `classic_display_images` | görsel reklam |
| v25 | Yaşam döngüsü hedefleri `Goal`/`CampaignGoalConfig`'e taşındı (KIRICI); `allowed_domain` ortak davetinde zorunlu | yeni müşteri hedefi kullanılmıyorsa etkisiz |
| v25 | Test seviyesi + gerçek hesap → `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` | hata eşlemesi |
| v25.1 | AI Max'e otomatik taşınma tarihleri; `TEXT_DISCLAIMER` asset | § 2.2 |
| v25.2 | AssetGroup URL seçenekleri; PMax otomatik video tarama; tCPA/tROAS "teklif çok düşük" önerileri; Smart → PMax taslak dönüşümü (`validate_only` destekli) | § 6.1 |

Kaynak: `[belge]` API/docs/release-notes (v23, v24, v24.1, v25, v25.1, v25.2 bölümleri).

---

## 10. AdvCampaign Google akışı için önerilen iskelet `[çıkarım]`

| Adım | İş | Yazma? |
|---|---|---|
| 1 | Ön koşul: erişim seviyesi, hesapta beyansız kampanya (§ 2.1), dönüşüm eylemi var mı, lead form uygunluğu | yok |
| 2 | Amaç → tür (§ 4.1); sohbette tek soru: "Sitenizde form/satış ölçümü kurulu mu?" | yok |
| 3 | İçerik kendi modelimizle; sınırlar (§ 2.2–2.4) DOĞRULAMADA, görsel oranı bırakıldığı anda | yok |
| 4 | `GenerateRecommendations` (bütçe/kelime/teklif) + `GenerateKeywordIdeas` + taban negatif liste; boş yanıt "öneri yok" | yok |
| 5 | Prova: tek `googleAds:mutate`, `validateOnly: true`; hatalar platform metniyle | yok |
| 6 | Yayın: aynı liste, kampanya PAUSED; geri okuma (`policy_summary`, `primary_status`) | var |
| 7 | Onay → `update` + `updateMask: "status"` → ENABLED; ilk 48 saat inceleme/öğrenme izleme | var |

---

## 11. Açık sorular / canlıda doğrulanmalı

1. **REST'te kaldırılmış alan (`startDate`) ne üretiyor?** 400 mü, sessiz
   yok sayma mı? (§ 7.1) — sessiz yok sayma daha kötü: kampanya bitiş
   tarihsiz yayınlanır. İlk `validate_only` provasıyla ölç.
2. **Projenin gerçek erişim seviyesi** (Explorer / Basic)? Depo "Basic"
   varsayıyor; KeywordPlanIdeaService çağrısı belirler.
3. **`validate_only` hangi kaynaklarda reddediliyor?**
   (`RESOURCE_DOES_NOT_SUPPORT_VALIDATE_ONLY`) — özellikle Asset (görsel
   baytı), AssetGroup, YouTubeVideoUpload. Belge kaynak listesini vermiyor.
4. **`validate_only` + geçici kimlik:** prova, geçici kimlikli tüm
   hiyerarşiyi (bütçe → kampanya → asset group) uçtan uca doğruluyor mu,
   yoksa yalnızca ilk düzeyi mi? Belge sessiz.
5. **Politika incelemesi `validate_only`'de ne kadar yakalanıyor?** Metin
   politikası evet (örnek kod); hedef URL / görsel incelemesi büyük
   olasılıkla oluşturmadan SONRA. Ölçülmeli.
6. **Lead form Türkiye'de destekleniyor mu ve bizim müşteri hesapları
   uygun mu?** (>1.000 USD harcama + doğrulama). Uygunluğu API'den
   önceden okumanın yolu var mı, yoksa oluşturma hatası mı tek sinyal?
7. **Demand Gen video reklamında başlık/uzun başlık/açıklama adet ve
   karakter sınırları** — proto vermiyor; yardım merkezi (13547298) okunamadı.
8. **Logo minimumu çelişkisi:** proto 128×128, yardım merkezi 144×144
   (depo notu `google-demandgen.ts`) — hangisi uygulanıyor?
9. **`positive_geo_target_type` gönderilmezse varsayılan ne?** Belge iki
   yerde iki ayrı "önerilen varsayılan" diyor; açıkça gönderilecek ama
   okumada mevcut kampanyaların değeri raporlanmalı.
10. **Türkiye ilçe kapsamı:** `SuggestGeoTargetConstants` hangi ilçeleri
    `District`/`City` olarak döndürüyor; dönmeyen ilçede yarıçap
    (`ProximityInfo`) mi kullanılacak?
11. **Mutate kotası "istek" mi "işlem" mi sayıyor?** 40 işlemlik tek
    kampanya kurulumu 1 mi 40 mı düşüyor (Basic'te 15.000/gün)?
12. **Minör sürüm URL'si:** v25.2 özellikleri (`raise_target_cpa...`) `/v25/`
    yolundan mı geliyor?
13. **AI Max otomatik taşıma** bizim kurduğumuz kampanyaları da kapsıyor mu
    ve `enable_ai_max=false` açıkça yazılmışsa taşınma yine oluyor mu?
14. **`BusinessMessageAsset` allowlist'i** Profaj MCC'si için alınabilir mi?
    Alınamazsa "WhatsApp" amacı Google'da hangi cümleyle reddedilecek?
15. **`YouTubeVideoUpload` Google-yönetimli kanal:** UNLISTED video müşteri
    hesabı başka MCC'ye taşınınca ne oluyor; video kimin malı?
16. **Bütçe alt sınırı TRY'de:** Google hesap para birimine göre minimum
    günlük bütçe uyguluyor mu (`campaigns/budgets/restrictions-errors`
    sayfası tam okunmadı)?

---

## Kaynaklar

Metin içindeki `API/...` kısaltmaları `https://developers.google.com/google-ads/api/...` demek. Ek tam adresler:

- https://developers.google.com/google-ads/api/rest/reference/rest/v14/customers.googleAds/mutate (REST biçimi)
- https://support.google.com/google-ads/answer/9423234 (lead form uygunluğu)
- https://developers.google.com/identity/protocols/oauth2 (refresh token ömrü)
