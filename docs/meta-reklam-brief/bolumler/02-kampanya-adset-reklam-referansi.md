# 02 — Kampanya, Ad set, Reklam ve Kreatif referansı (yazma yolunun alan sözlüğü)

> Kaynak: 46 sayfa (`_listeler/C-referans.txt`) · Okunan: 46/46 · Bilgi belgeden, canlıda doğrulanmadı.
> İki insights kenarında (kampanya ve ad set) parametre tablosu tam okundu; ~330 metrik alanının adları tam listelendi, açıklamaları seçici okundu (metrik sözlüğü ölçüm bölümünün işi). `budget_split_set` sayfası Meta tarafında boş.

**Adlandırma uyarısı.** Meta'nın referans dosya adları tarihsel ve yanıltıcı:
`ad-campaign-group` = **Kampanya**, `ad-campaign` = **Ad set**, `adgroup` = **Reklam**.
Bu bölüm her yerde Kampanya / Ad set / Reklam / Kreatif der; dosya adı yalnızca dizinde geçer.
Hiyerarşi: **Reklam hesabı → Kampanya → Ad set → Reklam → (Kreatif'i referans alır)**. Kreatif
reklamın çocuğu değil, hesap kütüphanesinde duran ayrı bir nesne; birden çok reklam aynı
kreatifi kullanabilir.

---

## Özet: Advetics için ne demek

1. **Eski amaçlar ölü, yalnızca altı ODAX amacı kullanılmalı.** `objective` enum'u hâlâ
   `LINK_CLICKS`, `CONVERSIONS`, `MESSAGES`… taşıyor ama bunlar v17.0'dan beri kullanımdan
   kalkmış durumda. Yazma yolu yalnızca `OUTCOME_AWARENESS`, `OUTCOME_TRAFFIC`,
   `OUTCOME_ENGAGEMENT`, `OUTCOME_LEADS`, `OUTCOME_SALES`, `OUTCOME_APP_PROMOTION` kabul etmeli.
   Panelin "amaç" eşlemesi **objective × destination_type × optimization_goal × promoted_object**
   dörtlüsüdür; tablo aşağıda (§9).
2. **Teklif stratejisinin varsayılanı tehlikeli ve belge kendi içinde çelişiyor.** Kampanya
   sayfası `LOWEST_COST_WITH_BID_CAP`'in "belirtilmezse oluşturma sırasındaki varsayılan"
   olduğunu söylüyor; ad set sayfası ise bunu "yalnızca `bid_amount` verilip strateji
   verilmediğinde" diye daraltıyor. Her iki okumada da sonuç aynı: **`bid_strategy` HER ZAMAN
   açıkça gönderilmeli** (Advetics bugün ad set'te `LOWEST_COST_WITHOUT_CAP` gönderiyor — doğru).
3. **Oluştururken her şey PAUSED.** Yeni reklam önce `PENDING_REVIEW`'a giriyor ve onaylanınca
   **kendiliğinden** yayına başlıyor. Kampanya/ad set/reklam `status=PAUSED` ile kurulmalı,
   yayın ayrı ve insan onaylı bir adım olmalı.
4. **`execution_options=["validate_only"]` bedava bir prova.** Kampanya, ad set, reklam ve
   etiket uçlarında mutasyon yapmadan bütün doğrulamayı koşturuyor; reklamda
   `synchronous_ad_review` ile birlikte metin/görsel politika kontrolü de yapılıyor.
   `include_recommendations` öneri bölümünü ekliyor. Hem panelin "giriş anında doğrulama"
   ilkesi hem de AI'ın "önce kuru çalıştır" adımı bunun üstüne kurulmalı.
5. **Değişmeyen alanlar var ve platform bunları çoğu zaman sessizce değil hatayla reddediyor,
   ama bazıları sessiz.** `promoted_object` neredeyse tamamen değişmez; kreatif oluşturulduktan
   sonra yalnızca `name`/`status`/`adlabels` değişir (içerik değişikliği = yeni kreatif + reklamın
   kreatifini değiştirme); reklamın `adset_id`'si değişmez; arşivlenen nesnede yalnızca ad ve
   DELETED'a geçiş kalır.
6. **Para birimi tuzağı: aynı API'de iki farklı birim.** Kampanya/ad set bütçeleri, `bid_amount`
   ve kampanya `spend_cap` **alt birimde** (kuruş/cent) tam sayı. Ama **hesap `spend_cap`
   güncellemesi standart birimde ondalık** (`23.50` = 23,50 USD) ve okunurken alt birimde
   dönüyor. Yanlış birim 100 kat hata demek ve API ikisini de geçerli sayar.
7. **Bütçe kuralları sayısal ve hesaba göre değişiyor.** Minimum günlük bütçe faturalama
   olayına ve teklif stratejisine bağlı (ör. gösterim $0,50; düşük sıklıklı eylem $40); bazı
   ülkelerde 2 katı. Kesin değer hesabın `min_daily_budget` alanından ve `minimum_budgets`
   kenarından okunmalı — sabit kodlanmamalı. Bütçe düşürülürken yeni değer harcananın en az
   %10 üstünde olmalı.
8. **Durum teşhisi için üç alan birlikte okunmalı:** `effective_status` (ebeveyn etkisi
   dahil gerçek durum), `issues_info` (yayını engelleyen sorunlar, `SOFT_ERROR` dahil) ve ad
   set'te `learning_stage_info`. Eylül 2025'ten beri sağlık/finans çağrıştıran özel kitleler ve
   özel dönüşümler işaretleniyor ve `issues_info`'ya düşüyor — ad set `ACTIVE` görünürken
   yayın kısılmış olabilir.
9. **Sessiz davranışlar listesi uzun** (ayrıntı "Tuzaklar"da): aynı kreatif ikinci kez
   oluşturulunca yeni kimlik yerine eskisi dönüyor; Sayfa etiketi (Page mention) API'den
   kabul edilip yayında düşürülüyor; uygulama mağazası bağlantılı gönderide ad ve ikon
   mağazadan eziliyor; bitmiş ad set kopyalanınca "şimdi" başlatılıyor; ödeme yöntemi
   olmayan hesapta reklam oluşuyor ama hiç yayın almıyor; geçersiz `time_range` hata vermeden
   yok sayılıyor; `/ads` kenarı varsayılan olarak arşivli/silinmiş reklamları gizliyor.
10. **Hesap değişiklik geçmişi (`/activities`) Advetics dışından yapılan müdahaleyi
    görmenin tek yolu.** `application_id`/`application_name` alanı değişikliği hangi uygulamanın
    yaptığını söylüyor; varsayılan pencere yalnızca son 7 gün.
11. **Limitler belgenin iki yerinde farklı yazıyor** (ad set başına reklam: "50 arşivlenmemiş"
    / "50 silinmemiş"; hesap başına ad set: 5.000 / 6.000). Panel ve AI muhafazakâr olanı
    kullanmalı: ad set başına 50 reklam, kampanya başına 200 ad set.

---

## Kavramlar, kurallar ve alanlar

### 1. Kampanya (`ad-campaign-group`)

Kampanya tek bir amacı temsil eder; amaç verilirse altındaki her reklamın o amaçla uyumlu
olduğu doğrulanır. `start_time`/`stop_time` kampanyada **salt okunur** (ad set'lerden
birleştirilir) — oluşturma tablosunda listelense de değer ad set'te kurulur (belge kendi içinde
çelişiyor; ad set'e yaz).

#### 1a. Oluşturma — `POST /act_{ad_account_id}/campaigns`

| Parametre | Tip | Zorunlu | Değerler / varsayılan / kısıt |
|---|---|---|---|
| `special_ad_categories` | array<enum> | **Evet** | `NONE`, `EMPLOYMENT`, `HOUSING`, `CREDIT`, `ISSUES_ELECTIONS_POLITICS`, `ONLINE_GAMBLING_AND_GAMING`, `FINANCIAL_PRODUCTS_SERVICES`. Özel kategori yoksa `[]` ya da `NONE`. v7.0'dan beri tekil `special_ad_category` yerine bu. |
| `special_ad_category_country` | array<enum ISO ülke> | Hayır | Özel kategorinin geçerli olduğu ülkeler. |
| `name` | string | Pratikte evet (tabloda işaretsiz) | Emoji destekli. |
| `objective` | enum | Pratikte evet | ODAX: `OUTCOME_APP_PROMOTION`, `OUTCOME_AWARENESS`, `OUTCOME_ENGAGEMENT`, `OUTCOME_LEADS`, `OUTCOME_SALES`, `OUTCOME_TRAFFIC`. Eski (kullanımdan kalkmış): `APP_INSTALLS`, `BRAND_AWARENESS`, `CONVERSIONS`, `EVENT_RESPONSES`, `LEAD_GENERATION`, `LINK_CLICKS`, `LOCAL_AWARENESS`, `MESSAGES`, `OFFER_CLAIMS`, `PAGE_LIKES`, `POST_ENGAGEMENT`, `PRODUCT_CATALOG_SALES`, `REACH`, `STORE_VISITS`, `VIDEO_VIEWS`. `BRAND_AWARENESS`'ta kreatifler ya hep görsel ya hep video olmalı. |
| `status` | enum | Hayır | Oluştururken yalnızca `ACTIVE` / `PAUSED`. `PAUSED` olursa aktif çocuklar `CAMPAIGN_PAUSED` etkin durumuna geçer. |
| `buying_type` | string | Hayır | Varsayılan `AUCTION`; `RESERVED` = Erişim ve Sıklık (konut/istihdam/kredi'de kapalı). Bütün ad set'ler aynı tipi taşımalı. |
| `daily_budget` | int64 (alt birim) | Hayır | Kampanya bütçesi (CBO). Kampanyada **ya da** ad set'te — ikisinde birden değil. |
| `lifetime_budget` | int64 (alt birim) | Hayır | Aynı kural. |
| `bid_strategy` | enum | Hayır | `LOWEST_COST_WITHOUT_CAP`, `LOWEST_COST_WITH_BID_CAP`, `COST_CAP`, `LOWEST_COST_WITH_MIN_ROAS`. Yalnızca CBO açıksa kampanyada; değilse ad set'te. `TARGET_COST` v9'da kalktı. **Belgeye göre belirtilmezse oluşturma varsayılanı BID_CAP** (bkz. Tuzaklar). |
| `spend_cap` | int64 (alt birim) | Hayır | Kampanya harcama tavanı. En az ~100 USD karşılığı. Kaldırmak için `922337203685478`. Erişim/Sıklık ve Premium Self Serve'de yok. |
| `promoted_object` | object | Koşullu | Kampanya seviyesinde iOS 14+ uygulama kampanyalarında zorunlu; katalog satışında `product_catalog_id` burada. Alt alanlar §6. |
| `budget_schedule_specs` | list | Hayır | Kampanyayla birlikte yüksek talep dönemleri (§8). |
| `execution_options` | list<enum> | Hayır | `validate_only`, `include_recommendations` (ikincisi tek başına kullanılamaz). |
| `adlabels` | list | Hayır | Etiket (§7). |
| `is_skadnetwork_attribution` | bool | Hayır | iOS 14 SKAdNetwork kampanyası. |
| `campaign_optimization_type` | enum `NONE`, `ICO_ONLY` | Hayır | Belgede açıklama yok. |
| `is_using_l3_schedule`, `iterative_split_test_configs`, `topline_id`, `source_campaign_id` | — | Hayır | Açıklamasız / kopya izi. |
| `start_time`, `stop_time` | datetime | Hayır | Tabloda var ama kampanyada salt okunur — **belgede çelişkili**, kullanma. |

Örnek gövde (form-encoded): `name=…&objective=OUTCOME_TRAFFIC&status=PAUSED&special_ad_categories=[]&is_adset_budget_sharing_enabled=0`.
Dikkat: `is_adset_budget_sharing_enabled` oluşturma tablosunda **yok**, yalnızca örnekte ve
güncelleme tablosunda var; Advetics canlıda bunun ad set bütçeli kampanyada **zorunlu**
olduğunu öğrendi (subcode 4834011). Belge bu zorunluluğu söylemiyor.

Dönüş: `{ id, success }`. Hata kodları: 100, 200, 190, 613, 80004 (hesap başı oran sınırı),
2635 (eski sürüm), 300 (düzenleme hatası).

#### 1b. Okunabilir alanlar (seçki)

| Alan | Anlamı / not |
|---|---|
| `status` | `ACTIVE`, `PAUSED`, `DELETED`, `ARCHIVED` — kullanıcının kurduğu durum. `configured_status` ile aynı değer; belge `status`'u öneriyor. |
| `effective_status` | `ACTIVE`, `PAUSED`, `DELETED`, `ARCHIVED`, `IN_PROCESS` (v4+), `WITH_ISSUES`. |
| `issues_info` | (v3.2+) Kampanyanın yayınını engelleyen sorun listesi. |
| `budget_remaining`, `daily_budget`, `lifetime_budget`, `spend_cap`, `can_use_spend_cap` | Bütçe durumu. |
| `bid_strategy`, `buying_type`, `pacing_type` (`standard`) | Teslim ayarları. |
| `is_adset_budget_sharing_enabled` | Ad set'ler arası %20 bütçe paylaşımı açık mı. |
| `is_budget_schedule_enabled` | Bütçe planlama (yüksek talep dönemi) açık mı. |
| `last_budget_toggling_time` | CBO ↔ ad set bütçesi geçişinin son zamanı. |
| `special_ad_categories` (v7+ dizi), `special_ad_category` (eski, tekil string), `special_ad_category_country` | Özel kategori. |
| `promoted_object`, `objective`, `smart_promotion_type` | Amaç. |
| `source_campaign_id`, `source_campaign` | Kopyalandığı kampanya. |
| `start_time`, `stop_time` | Ad set'lerden birleştirilmiş, salt okunur. |
| `updated_time` | **Bütçe veya spend_cap değişince GÜNCELLENMİYOR** — bunu "son değişiklik" diye kullanmak sessiz hata. |
| `boosted_object_id` | Boost edilen nesne. |
| `brand_lift_studies`, `can_create_brand_lift_study`, `primary_attribution`, `has_secondary_skadnetwork_reporting`, `is_reels_trending_ads_enabled`, `topline_id`, `campaign_group_active_time` (iç kullanım) | Diğer. |
| `budget_rebalance_flag` | v7.0'da kalktı. |

Okuma parametreleri: `date_preset` (… `maximum` = en çok 37 ay; `lifetime` v10'da kaldırıldı),
`time_range` — **geçersizse hata vermeden yok sayılıyor**.

#### 1c. Güncelleme — `POST /{campaign_id}`

Oluşturmadaki alanların hepsi + şunlar: `adset_bid_amounts` (otomatik tekliften manuele
geçerken her çocuk ad set için teklif haritası, zorunlu), `adset_budgets` (CBO ile ad set bütçesi
arasında geçerken **silinmemiş bütün** ad set'lerin `daily_budget` ya da `lifetime_budget`
listesi, zorunlu), `is_adset_budget_sharing_enabled`, `is_reels_trending_ads_enabled`,
`smart_promotion_type` (`GUIDED_CREATION`, `SMART_APP_PROMOTION`), `budget_rebalance_flag`
(kalktı). Dönüş `{ success }`; ek hata 801 (geçersiz işlem).

Kurallar:
- CBO'lu ve **70'ten fazla ad set'i olan** kampanyada teklif stratejisi değiştirilemez ve CBO
  kapatılamaz.
- `objective` güncelleme tablosunda yer alıyor ama eski amaçlı kampanyayı ODAX amacına
  kopyalamanın hata verebileceği yazıyor; amacın sonradan değiştirilebileceği **belgede
  belirsiz** — değişmez kabul et.
- `status` ile `ARCHIVED`/`DELETED` güncellemede kullanılabilir.

#### 1d. Silme

- `DELETE /{campaign_id}` → `{ success }`.
- `DELETE /act_{id}/campaigns` **toplu silme**: `delete_strategy` (zorunlu: `DELETE_ANY`,
  `DELETE_OLDEST`, `DELETE_ARCHIVED_BEFORE`), `before_date`, `object_count`. Dönüş
  `objects_left_to_delete_count`, `deleted_object_ids`. **Advetics'te hiçbir araç bunu
  çağırmamalı.**

#### 1e. Kampanya limitleri

- Kampanya başına en çok **200 ad set**.
- Hesap başına kampanya: normal hesap 6.000 (arşivlenmemiş, silinmemiş), toplu (bulk) hesap
  10.000; arşivli 100.000.

### 2. Ad set (`ad-campaign`)

Bütçe, takvim, teklif, optimizasyon ve hedeflemeyi paylaşan reklam grubu.

#### 2a. Oluşturma — `POST /act_{ad_account_id}/adsets`

| Parametre | Tip | Zorunlu | Değerler / varsayılan / kısıt |
|---|---|---|---|
| `name` | string | **Evet** | En çok 400 karakter, emoji destekli. |
| `campaign_id` | id | Evet (ya da `campaign_spec`) | Tabloda işaretsiz ama ya bu ya `campaign_spec` gerekli. |
| `campaign_spec` | object | Alternatif | Satır içi kampanya: `name`, `objective`, `buying_type`. |
| `targeting` | Targeting | Pratikte evet | Belge "`countries` zorunlu" diyor (bkz. Karşılaştırma — Advetics'in birleşim bilgisiyle gerilim). Ayrıntı hedefleme bölümünde. |
| `optimization_goal` | enum | Pratikte evet | `NONE`, `APP_INSTALLS`, `AD_RECALL_LIFT`, `ENGAGED_USERS`, `EVENT_RESPONSES`, `IMPRESSIONS`, `LEAD_GENERATION`, `QUALITY_LEAD`, `LINK_CLICKS`, `OFFSITE_CONVERSIONS`, `PAGE_LIKES`, `POST_ENGAGEMENT`, `QUALITY_CALL`, `REACH`, `LANDING_PAGE_VIEWS`, `VISIT_INSTAGRAM_PROFILE`, `ENGAGED_PAGE_VIEWS`, `VALUE`, `THRUPLAY`, `DERIVED_EVENTS`, `APP_INSTALLS_AND_OFFSITE_CONVERSIONS`, `CONVERSATIONS`, `IN_APP_VALUE`, `MESSAGING_PURCHASE_CONVERSION`, `MESSAGING_DEEP_CONVERSATION_AND_FOLLOW`, `SUBSCRIBERS`, `REMINDERS_SET`, `MEANINGFUL_CALL_ATTEMPT`, `PROFILE_VISIT`, `PROFILE_AND_PAGE_ENGAGEMENT`, `ADVERTISER_SILOED_VALUE`, `AUTOMATIC_OBJECTIVE`, `MESSAGING_APPOINTMENT_CONVERSION`. `NONE` yalnızca v2.4 öncesi okuma; `CLICKS` kalktı. Uyumluluk §9. |
| `billing_event` | enum | Pratikte evet | `APP_INSTALLS`, `CLICKS` (kalktı), `IMPRESSIONS`, `LINK_CLICKS`, `NONE`, `OFFER_CLAIMS`, `PAGE_LIKES`, `POST_ENGAGEMENT`, `THRUPLAY`, `PURCHASE`, `LISTING_INTERACTION`. (Açıklamada geçen `VIDEO_VIEWS` enum'da yok.) |
| `destination_type` | enum | Koşullu (Advetics: hep gönder) | `WEBSITE`, `APP`, `MESSENGER`, `APPLINKS_AUTOMATIC`, `WHATSAPP`, `INSTAGRAM_DIRECT`, `FACEBOOK`, `MESSAGING_MESSENGER_WHATSAPP`, `MESSAGING_INSTAGRAM_DIRECT_MESSENGER`, `MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP`, `MESSAGING_INSTAGRAM_DIRECT_WHATSAPP`, `SHOP_AUTOMATIC`, `ON_AD`, `ON_POST`, `ON_EVENT`, `ON_VIDEO`, `ON_PAGE`, `INSTAGRAM_PROFILE`, `FACEBOOK_PAGE`, `INSTAGRAM_PROFILE_AND_FACEBOOK_PAGE`, `INSTAGRAM_LIVE`, `FACEBOOK_LIVE`, `IMAGINE`. (Okuma alanı açıklaması `ON_*`'u hâlâ "sınırlı beta" diye anıyor — bayat.) Ayrıca `LEAD_FROM_MESSENGER`, `LEAD_FROM_IG_DIRECT`, `PHONE_CALL` eşleme tablosunda geçiyor ama bu enum'da **yok** — belgede çelişkili. |
| `promoted_object` | object | Koşullu | Amaca göre zorunlu (§6, §9). |
| `status` | enum | Hayır | Oluştururken `ACTIVE`/`PAUSED`. `PAUSED` → aktif reklamlar `ADSET_PAUSED`. |
| `daily_budget` | int64 | Bütçe biri > 0 olmalı | Hesap para biriminde (alt birim). Yalnızca süresi 24 saatten uzun ad set'te. CBO varsa verilmez. |
| `lifetime_budget` | int64 | 〃 | Verilirse `end_time` zorunlu. |
| `start_time` | datetime | Hayır | ISO-8601 ya da UNIX. |
| `end_time` | datetime | `lifetime_budget` ile zorunlu | Günlük bütçede `end_time=0` = bitişsiz. |
| `bid_strategy` | enum | Hayır (Advetics: hep gönder) | Kampanyadaki dört değer. CBO açıksa kampanyada kurulmalı. **Yalnızca `bid_amount` verilirse BID_CAP'e düşüyor.** |
| `bid_amount` | int | `BID_CAP` / `COST_CAP`'te zorunlu | Alt birim (USD/EUR cent; JPY/KRW temel birim). `IMPRESSIONS`/`REACH` faturalamada **1.000 gösterim başına** ve en az 2 US cent; diğerlerinde olay başına, en az 1 US cent. Ad set teklifini güncellemek reklam seviyesindeki teklifi ezer. |
| `attribution_spec` | list | Hayır | `event_type` (`CLICK_THROUGH`, `VIEW_THROUGH`, `ENGAGED_VIDEO_VIEW`, zorunlu), `window_days` (zorunlu), `weight` (varsayılan 100). İzinli kombinasyonlar §9d. |
| `frequency_control_specs` | list | Hayır | Yalnızca `REACH` ve `THRUPLAY` hedefli ad set'te yazılabilir. `event` (pratikte yalnızca `IMPRESSIONS`), `interval_days` 1–90, `max_frequency` 1–90, `type` `NONE`/`CAP`/`TARGET`. |
| `adset_schedule` | list | Hayır | Gün içi zamanlama: `start_minute`, `end_minute` (0 tabanlı dakika), `days` (0=Pazar … 6=Cumartesi), `timezone_type` `USER` (varsayılan) / `ADVERTISER`. Yalnızca ömür boyu bütçeyle (yüksek talep dönemi sayfası). |
| `pacing_type` | list<string> | Hayır | `standard` varsayılan; gün içi zamanlama için `day_parting`. |
| `budget_schedule_specs` | list | Hayır | Yüksek talep dönemleri (§8). |
| `daily_min_spend_target`, `daily_spend_cap` | int64 | Hayır | Yalnızca kampanyada günlük bütçe (CBO) varken. Tavanı kaldırmak `922337203685478`. Alt sınır "en iyi çaba", garanti değil. |
| `lifetime_min_spend_target`, `lifetime_spend_cap` | int64 | Hayır | Yalnızca kampanyada ömür boyu bütçe varken. |
| `dsa_payor`, `dsa_beneficiary` | string ≤512 | AB hedeflemesinde zorunlu | §10b. |
| `execution_options` | list | Hayır | `validate_only`, `include_recommendations`. |
| `is_dynamic_creative` | bool | Hayır | Varsayılan `false`; dinamik kreatif yalnızca `true` olan ad set'te. |
| `optimization_sub_event` | enum | Hayır | `NONE`, `VIDEO_SOUND_ON`, `TRIP_CONSIDERATION`, `TRAVEL_INTENT…`, `POST_INTERACTION`. |
| `cost_bidding_mode` | enum `VOLUME_FOCUSED`, `BALANCED`, `COST_FOCUSED` | Hayır | Açıklamasız — belgede belirsiz. |
| `multi_optimization_goal_weight` | enum `UNDEFINED`, `BALANCED`, `PREFER_INSTALL`, `PREFER_EVENT` | Hayır | Uygulama. |
| `creative_sequence` | list<id> | Hayır | Reklam gösterim sırası. Bu varken reklamlar durdurulamaz/arşivlenemez/silinemez. |
| `time_based_ad_rotation_id_blocks` + `time_based_ad_rotation_intervals` | list | Hayır | Tarih aralığına göre hangi reklamın döneceği; en az iki aralık, ilk zaman = başlangıç, son = bitişten en az 1 saat önce, aralıklar tüm süreyi kapsamalı. |
| `contextual_bundling_spec` | `{status: OPT_IN|OPT_OUT}` | Hayır | Bağlamsal yüzeylerde gösterim. |
| `tune_for_category` | enum (özel kategoriler) | Hayır | Açıklamasız. |
| `daily_imps`, `lifetime_imps` | int64 | Hayır | Yalnızca `FIXED_CPM`. |
| `rf_prediction_id` | id | Hayır | Erişim ve Sıklık. |
| `source_adset_id`, `adlabels`, `value_rule_set_id`, `value_rules_applied`, `existing_customer_budget_percentage`, `min/max_budget_spend_percentage`, `budget_source` (`NONE`/`RMN`), `budget_split_set_id`, `campaign_attribution`, `automatic_manual_state`, `is_dc_follow_optimized`, `is_sac_cfca_terms_certified`, `multi_event_conversion_attribution_window_seconds`, `relative_value`, `time_start`, `time_stop` | — | Hayır | Açıklamasız ya da ileri/niş. |

Dönüş `{ id, success }`. Ek hata kodları: 368 (kötüye kullanım), 2695 (iOS14 kampanya ad set
sınırı), 2641 (**hedeflenen/dışlanan konum kısıtlı**), 900 (uygulama yok).

Belgede örneklerde geçen `autobid=true` parametre tablosunda yok (eski).
`regional_regulated_categories` ve `regional_regulation_identities` okuma alanında "oluşturma ve
güncellemede verilir" diye anlatılıyor ama oluşturma tablosunda **yok** — belgede çelişkili.

#### 2b. Okunabilir alanlar (seçki)

| Alan | Not |
|---|---|
| `status` / `configured_status` | `ACTIVE`, `PAUSED`, `DELETED`, `ARCHIVED` — ad set'e kurulan durum. |
| `effective_status` | `ACTIVE`, `PAUSED`, `DELETED`, `CAMPAIGN_PAUSED`, `ARCHIVED`, `IN_PROCESS` (v4+), `WITH_ISSUES` (v3.2+). |
| `issues_info` | Yayını engelleyen sorunlar; örnek yapı: `level`, `error_code`, `error_summary`, `error_message`, `error_type` (ör. `SOFT_ERROR`), `additional_info`. |
| `learning_stage_info` | Teslim sistemi hâlâ öğreniyor mu; öğrenmedeyken performans dengesiz. **Alt yapısı bu grupta tanımlı değil** (ayrı referans). |
| `recommendations` | Varsa öneriler; yoksa alan hiç dönmez. |
| `targeting_optimization_types` | (v12+) Gevşetilip sinyal olarak kullanılan hedefleme seçenekleri — ör. `detailed_targeting`, `lookalike` genişletmesi. **Meta'nın hedeflemeyi kendiliğinden genişlettiğini gösteren tek alan.** |
| `review_feedback` | Dinamik kreatif inceleme notu. |
| `budget_remaining`, `daily_budget`, `lifetime_budget`, min/max spend alanları | Bütçe. |
| `recurring_budget_semantics` | `true` ise günlük harcama günlük bütçeyi aşabilir, haftalık 7× günlüğü aşmaz; `false` ise günlük aşılmaz. **Hangi hesapta hangisi olduğu belgede yok** — okunup gösterilmeli. |
| `bid_amount`, `bid_info`, `bid_strategy`, `bid_constraints`, `bid_adjustments` | Teklif. |
| `attribution_spec`, `is_incremental_attribution_enabled`, `campaign_attribution` | Atıf. |
| `destination_type`, `optimization_goal`, `optimization_sub_event`, `billing_event`, `promoted_object` | Amaç zinciri. |
| `instagram_user_id` | (v22+) Reklamda kullanılan IG hesabı. |
| `dsa_payor`, `dsa_beneficiary`, `regional_regulated_categories`, `regional_regulation_identities` | Yasal beyan. |
| `source_adset_id`, `source_adset` | Kopya izi. |
| `asset_feed_id`, `is_dynamic_creative`, `creative_sequence`, `frequency_control_specs`, `adset_schedule`, `pacing_type`, `start_time`, `end_time`, `created_time`, `updated_time`, `brand_safety_config`, `contextual_bundling_spec`, `use_new_app_click`, `value_rule_set_id`, `rf_prediction_id`, `lifetime_imps` | Diğer. |

#### 2c. Güncelleme — `POST /{ad_set_id}`

Belgede güncelleme **parametre tablosu yok**; yalnızca örnekler ve kurallar var. Örnekler
`billing_event`, `optimization_goal`, `bid_amount`, `targeting`, `end_time`, `status`
güncelliyor. Kurallar:
- Arşivli ad set'te yalnızca `name` ve durum (yalnızca `DELETED`'a) değişir; silinmişte yalnızca
  `name`. (Belge burada eski alan adı `campaign_status`'u kullanıyor; tablolarda `status`.)
- Bütçe düşürülürken yeni değer **şimdiye kadar harcananın en az %10 fazlası** olmalı
  ($1.000 ömür boyu, $300 harcanmış → en düşük $330).
- Minimum bütçe kuralı güncellemede de geçerli.
- `promoted_object` değiştirilemez (istisnalar §6).
- Rezervasyon (RESERVED) tipinde bazı alanlar API'den güncellenemez.

#### 2d. Silme

`DELETE /{ad_set_id}` → `{ success }`.

#### 2e. Ad set limitleri ve minimum bütçe

- Hesap başına ad set: ad set sayfası 5.000 (silinmemiş) / bulk 10.000; hesap sayfası 6.000
  (arşivlenmemiş + silinmemiş). **Çelişkili.**
- Ad set başına reklam: **50** (bir sayfada "arşivlenmemiş", diğerinde "silinmemiş").

Minimum günlük bütçe (USD, "temsilîdir, değişebilir"; ömür boyu bütçeye gün sayısıyla
uygulanır; daha önce harcanan tutar hesaba katılır; USD dışı para birimi oluşturma anında
çevrilip doğrulanır):

| Teklif stratejisi | Faturalama olayı | Minimum günlük |
|---|---|---|
| `LOWEST_COST_WITHOUT_CAP` | Gösterim | $0,50 |
| 〃 | Tıklama / beğeni / video izleme | $2,50 |
| 〃 | Düşük sıklıklı eylem (uygulama yükleme, teklif alma…) | $40 (her ülkede aynı) |
| `LOWEST_COST_WITH_BID_CAP` | Gösterim | en az `bid_amount` |
| 〃 | Tıklama / eylem | 5 × `bid_amount` |

Avustralya, Avusturya, Belçika, Kanada, Danimarka, Finlandiya, Fransa, Almanya, Yunanistan,
Hong Kong, İsrail, İtalya, Japonya, Hollanda, Yeni Zelanda, Norveç, Singapur, Güney Kore,
İspanya, İsveç, İsviçre, Tayvan, Birleşik Krallık ve ABD hesaplarında 2 katı (düşük sıklıklı
eylem hariç). **Türkiye listede yok.** Gerçek değer için `act_X?fields=min_daily_budget` ve
`act_X/minimum_budgets` okunmalı.

#### 2f. Diğer ad set kuralları

- **Lookalike genişletmesi (v13+):** değer, dönüşüm ya da uygulama olayı optimize eden yeni ad
  set'lerde **varsayılan açık ve kapatılamaz**; `targeting_optimization_types` içinde
  `lookalike` olarak görünür. Kullanıcıya "bu kitle Meta tarafından genişletilir" denmeli.
- **Yerel ayarla hedeflenmiş Sayfa gönderisi** öne çıkarılıyorsa, ad set'in dil hedeflemesi
  gönderinin dilleriyle aynı ya da alt küme olmalı.
- Mobil uygulama ad set'leri `user_device`/`user_os` hedeflemesiyle kullanılmalı.
- **AB, AEA ve İsviçre'de gençlere reklam** Kasım 2023'ten beri engelli; yeni/güncellenen ad
  set oluşmuyor, eskiler duruyor.

#### 2g. İşaretlenen özel kitle / özel dönüşüm (Eylül 2025+)

Sağlık durumu ya da finansal durum çağrıştıran özel kitle, benzer kitle ve özel dönüşümler
işaretleniyor:
- Ad set'te `issues_info`'ya **her işaretli öğe için bir kayıt** düşüyor: `error_code`
  2460003 (kitle engelli) / 2460004 (dönüşüm engelli), `error_type: SOFT_ERROR`,
  `additional_info` içinde ilgili kimlik. Ad set `effective_status: ACTIVE` kalabiliyor.
- Belge çelişkili: bir paragraf "oluşturma ve düzenleme engellenmeyecek, yalnızca yayın
  etkilenir", hemen altındaki paragraf "işaretli öğe içeren ad set oluşturma/değiştirme hatayla
  düşer" diyor ve hata gövdelerini veriyor: subcode **246003** (`error_data` içinde "Restricted
  Custom Audience IDs" listesi) ve **246004** ("Restricted Custom Conversion ID").
- Yayımlanmış kampanyada özel dönüşüm sonradan **değiştirilemiyor**; çözüm kampanyayı
  çoğaltıp farklı dönüşüm seçmek.

### 3. Reklam (`adgroup`)

#### 3a. Oluşturma — `POST /act_{ad_account_id}/ads`

| Parametre | Tip | Zorunlu | Not |
|---|---|---|---|
| `name` | string | **Evet** | Emoji destekli. |
| `adset_id` | int64 | Evet (ya da `adset_spec`) | Sonradan **değiştirilemez**. |
| `adset_spec` | object | Alternatif | Satır içi ad set. |
| `creative` | object | **Evet** | `{"creative_id": "<ID>"}` ya da satır içi kreatif tanımı (`name`, `object_story_spec`…). |
| `status` | enum | Hayır | Oluştururken `ACTIVE`/`PAUSED`. Reklam önce `PENDING_REVIEW` olur, inceleme bitince seçilen duruma döner. **Test için PAUSED önerilir.** |
| `conversion_domain` | string | Pikselle veri paylaşan kampanyada zorunlu | Yalnızca birinci+ikinci seviye alan adı (`ornek.com`), tam URL değil. Eski reklamlarda hedef URL'den çıkarsanıyor. |
| `tracking_specs` | object | Hayır | Eylem izleme; amaçtan varsayılan türetiliyor (§9e). |
| `execution_options` | list | Hayır | `validate_only`, `synchronous_ad_review` (yalnızca `validate_only` ile; dil kontrolü, görselde %20 metin kuralı vb. bütünlük kontrolleri), `include_recommendations`. Senkron incleme sonucu **nihai karar değildir**. |
| `ad_schedule_start_time`, `ad_schedule_end_time` | datetime | Hayır | Tek reklam için takvim; **yalnızca satış ve uygulama tanıtımı** kampanyalarında. |
| `display_sequence` | int64 | Hayır | Kampanya içindeki sıra. |
| `engagement_audience` | bool | Hayır | Etkileşenlerden kitle oluştur. |
| `adlabels`, `audience_id`, `creative_asset_groups_spec`, `date_format`, `include_demolink_hashes`, `priority`, `source_ad_id` | — | Hayır | — |
| `bid_amount` | — | — | **Kalktı**: reklam seviyesinde teklif verilemez, ad set'e yaz. |

Siyasi içerikli reklamda `authorization_category=POLITICAL` (reklam ve kreatif seviyesinde);
reklam hesabının ilgili Sayfa tarafından yetkilendirilmesi ve kullanıcıların doğrulanması
gerekiyor. `redownload=1` oluşturma yanıtında nesneyi geri döndürüyor.

Dönüş `{ id, success }`. Hatalar: 100, 200, 613, 368, 80004, 194 (zorunlu parametre eksik),
**500 (yasaklı içerik)**, 2635, 190, 105 (parametre sayısı fazla).

Asenkron toplu oluşturma: `POST /act_{id}/asyncadrequestsets` — `name` (zorunlu), `ad_specs`
(zorunlu; görsel için önce `adimages`'e yükleyip hash kullan), `notification_uri`,
`notification_mode` (`OFF` / `ON_COMPLETE`). Ad set'in `asyncadrequests` kenarı istek
durumlarını süzüyor: `INITIAL`, `IN_PROGRESS`, `SUCCESS`, `ERROR`, `CANCELED`,
`PENDING_DEPENDENCY`, `CANCELED_DEPENDENCY`, `ERROR_DEPENDENCY`, `ERROR_CONFLICTS`,
`USER_CANCELED`, `USER_CANCELED_DEPENDENCY`, `PROCESS_BY_EVENT_PROCESSOR`,
`PROCESS_BY_AD_ASYNC_ENGINE`.

#### 3b. Okunabilir alanlar (seçki)

| Alan | Not |
|---|---|
| `effective_status` | `ACTIVE`, `PAUSED`, `DELETED`, `PENDING_REVIEW`, `DISAPPROVED`, `PREAPPROVED`, `PENDING_BILLING_INFO`, `CAMPAIGN_PAUSED`, `ARCHIVED`, `ADSET_PAUSED`, `IN_PROCESS`, `WITH_ISSUES`. |
| `status` / `configured_status` | `ACTIVE`, `PAUSED`, `DELETED`, `ARCHIVED`. |
| `issues_info` | Reklam seviyesi sorunlar. |
| `ad_review_feedback` | Red gerekçesi (ayrı tip). Okuma parametresi `review_feedback_breakdown` (varsayılan `false`). |
| `failed_delivery_checks` | Başarısız teslim kontrolleri. |
| `recommendations` | Öneriler. |
| `preview_shareable_link` | Paylaşılabilir önizleme bağlantısı. |
| `creative`, `adset_id`, `campaign_id`, `targeting`, `tracking_specs`, `conversion_specs`, `tracking_and_conversion_with_defaults` | Bağlam. |
| `special_ad_categories`, `bid_type` (`CPC`, `CPM`, `MULTI_PREMIUM`, `ABSOLUTE_OCPM`, `CPA`), `is_autobid`, `bid_amount`, `bid_info` | — |
| `last_updated_by_app_id` | **Reklamı en son hangi uygulama değiştirdi** — Advetics dışı müdahale teşhisi. |
| `source_ad_id`, `ad_active_time`, `ad_schedule_start/end_time`, `display_sequence`, `engagement_audience`, `priority`, `created_time`, `updated_time`, `demolink_hash`, `creative_asset_groups_spec` | — |

Kenarlar: `adcreatives`, `adrules_governed`, `copies`, `insights`, `leads`, `previews`,
`targetingsentencelines`.

#### 3c. Güncelleme — `POST /{ad_id}`

- "Yalnızca oluşturmada kullanılan alanlar güncellenebilir."
- `adset_id` ve `social_prefs` değiştirilemez.
- `ARCHIVED` reklamda yalnızca `name` ve `status` (yalnızca `DELETED`'a); `DELETED`'da yalnızca
  `name`.
- `creative_sequence` olan ad set'teki reklam `PAUSED`/`ARCHIVED`/`DELETED` yapılamaz ve
  silinemez.
- Belge örneklerinde eski alan adı `adgroup_status` geçiyor; tabloda `status` — **`status`
  kullan**.
- İsteğe bağlı bir alan boş değerle güncellenerek temizlenebilir.

#### 3d. Silme ve limitler

`DELETE /{ad_id}` → `{ success }` (hata 368 olabilir). Limitler: normal hesapta 5.000
silinmemiş reklam (hesap sayfası: 6.000 arşivlenmemiş + silinmemiş), bulk 50.000; ad set
başına 50; arşivli 100.000.

#### 3e. Reklam kopyalama — `POST /{ad_id}/copies`

`adset_id` (başka ad set'e taşı; boşsa aynı ebeveyn), `creative_parameters` (verilirse
**üst seviyede ezerek yeni bir kreatif** kurar; boşsa aynı kreatif), `rename_options`,
`status_option` (`ACTIVE`, `PAUSED` varsayılan, `INHERITED_FROM_SOURCE`). Dönüş
`copied_ad_id`.

### 4. Kreatif (`ad-creative`)

#### 4a. Oluşturma — `POST /act_{ad_account_id}/adcreatives`

Belgede ayrı bir oluşturma parametre tablosu **yok** ("bu uçta yapılamaz" notu düşmüş);
yazılabilir alanlar okuma alanı tablosundan ve örneklerden çıkarılıyor. Kreatif tek başına ya da
reklamla satır içi oluşturulabilir; her durumda hesabın kreatif kütüphanesine yazılır.

**Tekillik — sessiz:** Eşdeğer bir kreatif zaten varsa yenisi **oluşturulmaz, var olanın
kimliği döner**. Advetics "yeni kreatif kimliği" bekleyip ona özel bir şey yazıyorsa (etiket,
eşleme satırı) iki reklam aynı kreatifi paylaşıyor olabilir.

Başlıca yazılabilir alanlar:

| Alan | Not |
|---|---|
| `name` | Kütüphanedeki ad, en çok 100 karakter. |
| `object_story_spec` | Yeni, yayımlanmamış bir Sayfa gönderisi kurup reklama çevirir: `page_id` + `link_data` / `photo_data` / `video_data` / `text_data` / `template_data`. Bu yolla `object_story_id` **null** döner; gönderi kimliği `effective_object_story_id`'de. |
| `object_story_id` | Var olan Sayfa gönderisi (`<sayfa>_<gönderi>`). Gönderideki görsel 8 MB'ı aşmamalı; görsel hesap kütüphanesine kopyalanır. |
| `source_instagram_media_id`, `instagram_user_id`, `object_id` | Instagram gönderisinden reklam (bkz. Karşılaştırma #3). |
| `effective_instagram_media_id` | Okuma: reklamda kullanılan IG gönderisi. |
| `instagram_permalink_url` | IG gönderisinin URL'si — Advetics kodu bunu yazmamayı tercih ediyor. |
| `image_hash` / `image_url` | Biri ya da diğeri, ikisi birden değil. `image_url` verilirse görsel o adresten hesap kütüphanesine kaydedilir. |
| `image_crops` | Kırpma tanımı. |
| `video_id` | Video. |
| `call_to_action_type` | Uzun enum (ör. `LEARN_MORE`, `SHOP_NOW`, `SIGN_UP`, `CONTACT_US`, `WHATSAPP_MESSAGE`, `MESSAGE_PAGE`, `BOOK_NOW`, `GET_QUOTE`, `CALL_NOW`, `APPLY_NOW`, `DOWNLOAD`, `NO_BUTTON` …). Amaca göre izinli olanlar Ads Guide'da — bu grupta matris yok. |
| `call_to_action` | `{type, value}`; `value` alanları: `link`, `app_link`, `page`, `lead_gen_form_id`, `app_destination` (`MESSENGER`, `WHATSAPP`, `INSTAGRAM_DIRECT`, `MESSENGER_EXTENSIONS`, `LINK_CARD`, `MARKETPLACE`, …), `whatsapp_number`, `link_caption`, `link_description`, `link_title`, `product_link`, `offer_id`, `event_id` … (önizleme sayfasındaki şemadan). |
| `url_tags` | Tıklanan URL'lere eklenen sorgu parametreleri (`key1=val1&key2=val2`). |
| `asset_feed_spec` | Dinamik kreatif (çoklu görsel/metin varyasyonu). |
| `degrees_of_freedom_spec` | Kreatife hangi otomatik dönüşümlerin (Advantage+ kreatif iyileştirmeleri) uygulanabileceği — **içeriği bu grupta tanımlı değil**, ama Meta'nın kreatifi kendiliğinden değiştirebildiğinin işareti. |
| `platform_customizations` | Yerleşime özel medya (ör. Instagram'da başka görsel). |
| `portrait_customizations`, `format_transformation_spec`, `generative_asset_spec`, `creative_sourcing_spec`, `media_sourcing_spec`, `interactive_components_spec` | İleri/otomasyon alanları, açıklamaları kısa. |
| `authorization_category` | `POLITICAL`; Ocak 2024'ten beri dijital olarak üretilmiş/değiştirilmiş medya için `POLITICAL_WITH_DIGITALLY_CREATED_MEDIA`. Dinamik reklamda kullanılamaz. |
| `facebook_branded_content.sponsor_page_id` / `instagram_branded_content.sponsor_id` | Ortaklık reklamı (markanın etiketlendiği gönderi). |
| `branded_content_sponsor_page_id` | Markalı içerik (foto/video/link). |
| `title`, `body`, `object_url`, `link_url`, `link_destination_display_url` | Sayfaya bağlı olmayan eski link reklamı alanları — **sayfasız link/etkinlik reklamı 2017'den beri yasak** (hata 1885833 `ADPRO2__AD_MUST_HAVE_PAGE`); her zaman `object_story_spec`/`object_story_id` ile geçerli bir aktör ver. |
| `product_set_id`, `template_url`, `template_url_spec`, `recommender_settings`, `applink_treatment`, `dynamic_ad_voice`, `bundle_folder_id`, `categorization_criteria`, `category_media_source`, `destination_set_id`, `place_page_set_id` | Dinamik/katalog/yerel reklam. |
| `page_welcome_message`, `messenger_sponsored_message` | Mesaj reklamları. |
| `threads_user_id`, `threads_media_id`, `source_facebook_post_id`, `photo_album_source_object_story_id`, `playable_asset_id`, `referral_id`, `wamo_whatsapp_identity_spec`, `marketing_message_structured_spec`, `ad_disclaimer_spec` | Niş. |

Metin kuralları (doğrulama girişte yapılmalı):
- Başlık 1–25 karakter (öneri), gövde 1–90 karakter (öneri), URL en çok 1.000, tek kelime en
  çok 30 karakter (öneri).
- Başlık/gövde noktalama ile başlayamaz: `\ / ! . ? - * ( ) , ; :`; ardışık noktalama yasak
  (`...` hariç); en çok üç tek harfli kelime.
- Yasak karakterler: IPA simgeleri (ə ɚ ɛ ɜ ɝ ɞ ɟ hariç), tek başına birleşik aksan işaretleri
  (önceden birleşik harf serbest — Türkçe harfler sorun değil), üst/alt simge (™ ℠ hariç),
  `^ ~ _ = { } [ ] | < >`.
- Link reklamları özel karakter kullanamaz; Sayfa gönderisi reklamları `★` gibi karakterlere
  izin veriyor.
- Okuma en çok **50.000 kreatif** döndürür; ötesinde sayfalama yok.

#### 4b. Okunabilir alanlar (teşhis için)

`status` (`ACTIVE`, `IN_PROCESS`, `WITH_ISSUES`, `DELETED`), `effective_authorization_category`
(Meta reklamı siyasi saydıysa beyandan farklı olabilir), `effective_object_story_id`,
`effective_instagram_media_id`, `object_type` (`APPLICATION`, `DOMAIN`, `EVENT`, `OFFER`,
`PAGE`, `PHOTO`, `SHARE`, `STATUS`, `STORE_ITEM`, `VIDEO`, `INVALID` — silinmiş/erişilemeyen
nesne, `PRIVACY_CHECK_FAIL`, `POST_DELETED`), `thumbnail_url` (okuma parametreleri
`thumbnail_width`/`thumbnail_height`, varsayılan 64×64), `actor_id`, `account_id`.

#### 4c. Güncelleme ve silme

- `POST /{creative_id}`: yalnızca `name` (≤100), `status`, `adlabels`, `account_id`. **İçerik
  değiştirilemez** — metin/görsel değişikliği yeni kreatif kurup reklamın `creative` alanını
  güncellemekle yapılır (aktivite kaydında `update_ad_creative`).
- `DELETE /{creative_id}` → `{ success }`.

#### 4d. Önizleme — `GET /{creative_id}/previews`

`ad_format` **zorunlu** (ör. `MOBILE_FEED_STANDARD`, `DESKTOP_FEED_STANDARD`,
`INSTAGRAM_STANDARD`, `INSTAGRAM_STORY`, `INSTAGRAM_REELS`, `FACEBOOK_STORY_MOBILE`,
`FACEBOOK_REELS_MOBILE`, `RIGHT_COLUMN_STANDARD`, `INSTAGRAM_EXPLORE_GRID_HOME`,
`WHATSAPP_STATUS_MEDIA` …). Dönen iframe **24 saat** geçerli — saklanmamalı, gerektiğinde yeniden
istenmeli. `width`/`height` yalnızca iframe'i boyutlandırır, reklamı değil. Ek parametreler:
`creative_feature`, `dynamic_creative_spec`, `dynamic_asset_label`, `dynamic_customization`,
`product_item_ids`, `place_page_id`, `post` (yalnızca `object_id` taşıyan kreatifte),
`start_date`/`end_date`. Her kreatif türü her biçimi desteklemiyor (ör. Sayfa gönderisi
reklamı: sağ sütun, masaüstü/mobil akış, IG standart, IG hikâye). Hesap seviyesinde henüz
kaydedilmemiş bir kreatif tanımı için `act_X/generatepreviews` var.

Kreatif kenarları: `previews`, `adlabels` (yalnızca POST), `creative_insights` (alan tanımı yok).

### 5. AdImage (`ad-image`)

- **Yükleme:** `POST /act_{id}/adimages` — `bytes` (base64) ya da çok parçalı dosya; dosya adında
  uzantı **zorunlu** (`ornek.jpg`; `ornek` ya da `ornek.tmp` olmaz). ZIP de yüklenebilir.
  Dönüş: dosya adına göre harita → `hash`, `url`, `url_128`, `url_256`, `width`, `height`, `name`.
- **Hesaplar arası kopya:** `POST /act_{HEDEF}/adimages` + `copy_from={"source_account_id":
  "<önek OLMADAN>", "hash":"…"}`; kullanıcının kaynak hesapta kreatif okuma yetkisi olmalı.
- **Alanlar:** `hash` (varsayılan), `id`, `account_id`, `name` (≤100), `width`/`height`,
  `original_width`/`original_height`, `creatives` (kullanan kreatifler; `object_story_spec` +
  `picture` URL yolunda boş), `is_associated_creatives_in_adgroups`, `status` (`ACTIVE`,
  `INTERNAL`, `DELETED`), `created_time`, `updated_time`, **`url` — geçici, kreatif
  oluşturmada KULLANILMAMALI**, `url_128` (geçici, 128 kutu), **`permalink_url` — "hikâye
  kreatiflerinde kullanılacak kalıcı URL"**.
- **Güncelleme yok.** **Silme:** `DELETE /act_{id}/adimages` `hash` (zorunlu) / `image_id`;
  yalnızca hiçbir kreatifte kullanılmayan görsel silinebilir.
- Hesap başına görsel sayısı sınırsız.

### 6. promoted_object (`ad-promoted-object`)

Ad set'in (ve bazı durumlarda kampanyanın) neyi tanıttığı. Kampanya amacı + `promoted_object`
birlikte "bu ad set ne için?" sorusunu cevaplar.

**Kurallar:**
- Tanıtılan nesnelerde (`page_id`, `application_id`, `pixel_id`) yetki gerekli.
- `page_id` verilirse kreatif **aynı Sayfayı** tanıtmalı.
- `pixel_id` verilirse `custom_event_type` zorunlu.
- `object_store_url` → `application_id` zorunlu; URL o uygulamaya bağlı olmalı, cihaz
  hedeflemesi uygulamanın platformlarıyla eşleşmeli, kreatif aynı URL'ye gitmeli.
- `custom_event_str` → `custom_event_type=OTHER` zorunlu.
- **Değişmez:** oluşturulunca değiştirilemez; var olan ad set'e sonradan eklenemez. İstisnalar:
  eksikse `application_id` ya da `product_catalog_id` eklemek; `CONVERSIONS` /
  `PRODUCT_CATALOG_SALES` amacı veya `OFFSITE_CONVERSIONS` hedefinde `pixel_id`, `pixel_rule`,
  `custom_event_type` değiştirmek. Başka nesne tanıtmak = yeni ad set.
- **Sessiz:** `promoted_object` varsa Meta `conversion_specs`'i kendisi çıkarıyor; elle verilen
  `conversion_specs` **yok sayılıyor**.
- Kampanya seviyesinde yalnızca `product_catalog_id` ad set'e taşınıyor.

**Alanlar:** `page_id`, `pixel_id`, `custom_event_type` (enum: `AD_IMPRESSION`, `RATE`,
`TUTORIAL_COMPLETION`, `CONTACT`, `CUSTOMIZE_PRODUCT`, `DONATE`, `FIND_LOCATION`, `SCHEDULE`,
`START_TRIAL`, `SUBMIT_APPLICATION`, `SUBSCRIBE`, `ADD_TO_CART`, `ADD_TO_WISHLIST`,
`INITIATED_CHECKOUT`, `ADD_PAYMENT_INFO`, `PURCHASE`, `LEAD`, `COMPLETE_REGISTRATION`,
`CONTENT_VIEW`, `SEARCH`, `SERVICE_BOOKING_REQUEST`, `MESSAGING_CONVERSATION_STARTED_7D`,
`LEVEL_ACHIEVED`, `ACHIEVEMENT_UNLOCKED`, `SPENT_CREDITS`, `LISTING_INTERACTION`,
`D2_RETENTION`, `D7_RETENTION`, `OTHER`), `custom_event_str`, `custom_conversion_id`,
`pixel_rule`, `pixel_aggregation_rule`, `retention_days`, `application_id`, `object_store_url(s)`,
`product_catalog_id`, `product_set_id`, `boosted_product_set_id` (tüm ürünler setiyle
birlikte belirli seti öne çıkarma), `product_set_optimization`, `product_item_id`,
`event_id`, `offer_id`, `offline_conversion_data_set_id`, `place_page_set_id`,
`instagram_profile_id`, `conversion_goal_id`, `offsite_conversion_event_id`,
`mcme_conversion_id`, `lead_ads_*` (form olay kaynağı, özel olay, offsite dönüşüm tipi,
`lead_ads_follow_up_event: whatsapp_conversations`, `lead_ads_selected_pixel_id`),
`value_semantic_type` (`VALUE`, `MARGIN`, `LIFETIME_VALUE`), `variation`,
`full_funnel_objective`, `whats_app_business_phone_number_id`, `whatsapp_phone_number`,
`omnichannel_object` (`pixel` zorunlu, `app`, `onsite`), `smart_pse_enabled`/`smart_pse_setting`
(akıllı ürün seti genişletme), `dataset_split_id(s)`, `job_listing_id`, `fundraiser_campaign_id`,
`passback_pixel_id`, `passback_application_id`, `custom_attribution_source_ids`,
`multi_event_product`, `anchor_event_config`, `multi_event_conversion_info`,
`product_sales_channel` (`ONLINE`, `IN_STORE`, `OMNI`), `live_video_destination`.

Nesnenin kendisinde oluşturma/güncelleme/silme ucu yok; ad set (ya da kampanya) ile yazılır.

### 7. Reklam etiketi (`ad-label`)

- `POST /act_{id}/adlabels` `name` (zorunlu) → `{id}`; `POST /{label_id}` `name` ile yeniden
  adlandır; `DELETE /{label_id}`.
- Nesneye bağlama iki yolla ve **farklı anlamda**: `POST /{nesne_id}` içinde `adlabels`
  verilirse nesnenin **bütün etiket kümesi değiştirilir**; `POST /{nesne_id}/adlabels` ise
  **ekler** (var olanı kullanır). Yalnızca ad verilip o adda etiket yoksa **yeni etiket
  sessizce oluşturulur** ve bağlanır.
- Kampanya ve reklam etiket uçları `validate_only` destekliyor; kreatif ucu desteklemiyor.
- Sorgu: `act_X/campaignsbylabels`, `adsetsbylabels`, `adsbylabels`, `adcreativesbylabels`
  (`ad_label_ids`, işleç `ALL`/`ANY`; kısmi eşleşme yok). Etiket kenarları: `campaigns`,
  `adsets`, `ads`, `adcreatives`.
- Limit: hesap başına 100.000 etiket; bir nesneye tek seferde en çok 50.
- Advetics için: Advetics'in oluşturduğu nesneleri işaretlemek (ör. `advetics:<taslak-id>`)
  ve Ads Manager'da elle açılanlardan ayırmak için uygun bir araç. Etiket adları
  müşteriye görünür değil ama hesaptaki herkes görür.

### 8. Bütçe planlama — yüksek talep dönemi (`high-demand-period`, `budget_schedules`)

- Belirli gün/saatlerde **günlük bütçeyi geçici olarak artırma**. Bitince bütçe otomatik eski
  değere döner.
- Ön koşullar: hesap `capabilities` içinde **`CAN_USE_BUDGET_SCHEDULING_API`**; **yalnızca günlük
  bütçe**; kampanya ya da ad set başına en çok **50** dönem; artış toplamı günlük bütçenin
  **8 katını** aşamaz; dönem en az **3 saat**; Advantage+ App kampanyaları hariç.
- Reklam zamanlaması (`adset_schedule`, gösterim saatleri) ise **yalnızca ömür boyu bütçeyle**.
  İkisi farklı şey.
- Oluşturma: `POST /{campaign_id|ad_set_id}/budget_schedules` — `budget_value` (int64, zorunlu),
  `budget_value_type` (`ABSOLUTE` / `MULTIPLIER`, zorunlu), `time_start`, `time_end` (int64 UNIX,
  zorunlu) → `{id}`. Ya da kampanya/ad set oluştururken `budget_schedule_specs` (ek alanlar:
  `recurrence_type` `ONE_TIME`/`WEEKLY`, `weekly_schedule` [`days`, `minute_start`,
  `minute_end`, `timezone_type`]).
- Okuma: `GET …/budget_schedules?time_start=&time_stop=` (aralıkla kesişenler). Alanlar:
  `id`, `budget_value`, `budget_value_type`, `recurrence_type`, `time_start`, `time_end`.
- **Belirsizlikler:** `ABSOLUTE` değerin birimi (alt birim mi, ana birim mi) belgede belirsiz
  ("140, $140 ya da %140 olabilir" diyor, oysa diğer bütün bütçeler alt birimde).
  Okuma sayfası "yalnızca tek seferlik dönem destekleniyor" derken oluşturma `WEEKLY`
  kabul ediyor — çelişkili. **Dönemi güncelleme ya da silme ucu belgede yok** — kurulan bir
  dönemin API'den geri alınabileceği gösterilemiyor; bu yüzden AI'a açılacaksa onay şart.

### 9. Amaç uyumluluğu — panelin eşleme tablosunun temeli

#### 9a. ODAX ana tablosu (amaç × varış yeri × optimizasyon × promoted_object)

İki belge tablosunun (kampanya sayfası eşleme tablosu + ad set sayfası kısıt tablosu)
birleşimi. "Varış" sütunundaki ad, `destination_type` enum değeridir; "—" eşleme tablosunda
boş bırakılan yerdir.

| ODAX amacı | Varış (`destination_type`) | İzinli `optimization_goal` | `promoted_object` | Eski karşılık |
|---|---|---|---|---|
| `OUTCOME_AWARENESS` | — | `REACH`, `IMPRESSIONS`, `AD_RECALL_LIFT` | `page_id` | REACH, BRAND_AWARENESS |
| 〃 (video) | — | `THRUPLAY`, `TWO_SECOND_CONTINUOUS_VIDEO_VIEWS` | `page_id` | VIDEO_VIEWS |
| 〃 (mağaza ziyareti) | — | `REACH` | `place_page_set_id` | STORE_VISITS |
| `OUTCOME_TRAFFIC` | Web sitesi (`WEBSITE` / "—") | `LANDING_PAGE_VIEWS`, `LINK_CLICKS`, `IMPRESSIONS`, `REACH` | yok | LINK_CLICKS |
| 〃 | Uygulama (`APP`) | `LINK_CLICKS`, `REACH` | `application_id`, `object_store_url` | LINK_CLICKS |
| 〃 | `MESSENGER` | `LINK_CLICKS`, `IMPRESSIONS`, `REACH` | yok | LINK_CLICKS |
| 〃 | `WHATSAPP` | `LINK_CLICKS`, `IMPRESSIONS`, `REACH` | `page_id` | LINK_CLICKS |
| 〃 | `PHONE_CALL` | `QUALITY_CALL`, `LINK_CLICKS` | yok | LINK_CLICKS |
| 〃 | Facebook Shops (kapalı beta) | `LINK_CLICKS` | — | — |
| `OUTCOME_ENGAGEMENT` | `ON_POST` | `POST_ENGAGEMENT`, `REACH` (`IMPRESSIONS` **v20'den beri bu varışta kalktı**) | yok | POST_ENGAGEMENT |
| 〃 | `ON_VIDEO` | `THRUPLAY`, `TWO_SECOND_CONTINUOUS_VIDEO_VIEWS` | yok | VIDEO_VIEWS |
| 〃 | `ON_PAGE` | `PAGE_LIKES` | `page_id` | PAGE_LIKES |
| 〃 | `ON_EVENT` | `EVENT_RESPONSES`, `POST_ENGAGEMENT`, `REACH`, `IMPRESSIONS` | yok | EVENT_RESPONSES |
| 〃 | `MESSENGER` | `CONVERSATIONS`, `LINK_CLICKS` (eşlemede ayrıca `LEAD_GENERATION`) | `page_id` | MESSAGES |
| 〃 | `WHATSAPP` | `CONVERSATIONS`, `LINK_CLICKS` | (belgede yazmıyor; canlıda `page_id`) | MESSAGES |
| 〃 | `INSTAGRAM_DIRECT` | `CONVERSATIONS`, `LINK_CLICKS` | (belgede yazmıyor) | MESSAGES |
| 〃 | Web sitesi (dönüşüm) | `OFFSITE_CONVERSIONS`, `ONSITE_CONVERSIONS`*, `LANDING_PAGE_VIEWS`, `LINK_CLICKS`, `IMPRESSIONS`, `REACH` | `pixel_id` + `custom_event_type` (AddToWishlist, Contact, CustomizeProduct, Donate, FindLocation, Schedule, Search, StartTrial, SubmitApplication, Subscribe, ViewContent) | CONVERSIONS |
| 〃 | Uygulama (dönüşüm) | `APP_INSTALLS_AND_OFFSITE_CONVERSIONS`, `LINK_CLICKS`, `REACH` (eşlemede `OFFSITE_CONVERSIONS` da) | `application_id`, `object_store_url` | CONVERSIONS |
| `OUTCOME_LEADS` | Anında form (`ON_AD`) | `LEAD_GENERATION`, `QUALITY_LEAD` | `page_id` | LEAD_GENERATION |
| 〃 | Messenger (`LEAD_FROM_MESSENGER`) | `LEAD_GENERATION` (kısıt tablosunda `QUALITY_LEAD` da) | `page_id` | MESSAGES |
| 〃 | IG Direct (`LEAD_FROM_IG_DIRECT`) | `LEAD_GENERATION` | `page_id` | — |
| 〃 | Arama (`PHONE_CALL`) | `QUALITY_CALL` | `page_id` | LEAD_GENERATION |
| 〃 | Web sitesi | `OFFSITE_CONVERSIONS`, `ONSITE_CONVERSIONS`*, `LANDING_PAGE_VIEWS`, `LINK_CLICKS`, `IMPRESSIONS`, `REACH` | `pixel_id` + `custom_event_type` (Lead, CompleteRegistration, Contact, FindLocation, Schedule, StartTrial, SubmitApplication, Subscribe) | CONVERSIONS |
| 〃 | Uygulama | `APP_INSTALLS_AND_OFFSITE_CONVERSIONS`, `LINK_CLICKS`, `REACH` | `application_id`, `object_store_url` | CONVERSIONS |
| `OUTCOME_SALES` | Web sitesi | `OFFSITE_CONVERSIONS`, `VALUE`, `LANDING_PAGE_VIEWS`, `LINK_CLICKS`, `IMPRESSIONS`, `REACH` | `pixel_id` + `custom_event_type` (Purchase, InitiateCheckout, AddPaymentInfo, AddToCart, CompleteRegistration, Donate, StartTrial, Subscribe, ViewContent) | CONVERSIONS |
| 〃 | Uygulama | `OFFSITE_CONVERSIONS`, `LINK_CLICKS`, `REACH` | `application_id`, `object_store_url` | CONVERSIONS |
| 〃 | Web + uygulama | `OFFSITE_CONVERSIONS` | — | CONVERSIONS |
| 〃 | `MESSENGER` | `CONVERSATIONS`, `OFFSITE_CONVERSIONS`, `LINK_CLICKS`, `IMPRESSIONS`, `REACH` | `page_id` + `pixel_id` + `custom_event_type` | CONVERSIONS |
| 〃 | `WHATSAPP` | `OFFSITE_CONVERSIONS`, `LINK_CLICKS`, `IMPRESSIONS`, `REACH` | — | CONVERSIONS |
| 〃 | `PHONE_CALL` | `QUALITY_CALL` | `page_id` | CONVERSIONS |
| 〃 | Katalog (`WEBSITE`) | `LINK_CLICKS` (eşleme tablosu) | Kampanya: `product_catalog_id`; ad set: `product_set_id` + `custom_event_type` | PRODUCT_CATALOG_SALES |
| `OUTCOME_APP_PROMOTION` | — | AAA olmayan: `LINK_CLICKS`, `APP_INSTALLS`, `APP_INSTALLS_AND_OFFSITE_CONVERSIONS`, `VALUE` (eşlemede `OFFSITE_CONVERSIONS`); AAA: `APP_INSTALLS`, `APP_INSTALLS_AND_OFFSITE_CONVERSIONS`, `VALUE` | `application_id`, `object_store_url` (+ `OFFSITE_CONVERSIONS`'ta `custom_event_type`; özel olayda `OTHER` + `custom_event_str`) | APP_INSTALLS |

\* `ONSITE_CONVERSIONS` kısıt tablosunda geçiyor ama `optimization_goal` enum'unda **yok** —
belgede çelişkili; kullanma.

Ek tutarsızlıklar (eşleme tablosundaki hatalar gibi görünüyor, doğrulanmadan kullanılmamalı):
- Eski `CONVERSIONS` için `OUTCOME_ENGAGEMENT` altında `OFFSITE_CONVERSIONS` + `pixel_id` ve
  hatta `IMPRESSIONS` + `pixel_id` satırları var.
- Katalog satışında optimizasyon olarak yalnızca `LINK_CLICKS` yazıyor.
- Web sitesi varışı eşleme tablosunda "—" (yani `destination_type` gönderilmiyor gibi);
  enum'da `WEBSITE` var. **Gönderilmezse ne olduğu belgede yazmıyor** — Advetics ilkesi
  gereği açıkça `WEBSITE` gönderilmeli ve canlıda kabul edildiği doğrulanmalı.

#### 9b. billing_event uyumu

Bu gruptaki sayfalar tam bir `optimization_goal ↔ billing_event` matrisi vermiyor ("Bidding
Overview, Validation" sayfasına yönlendiriyor — bu grupta değil). Belgeden çıkanlar:
- Örneklerde neredeyse her hedef `billing_event=IMPRESSIONS` ile kuruluyor (`REACH`,
  `APP_INSTALLS`, `PAGE_LIKES`, `LINK_CLICKS` güncellemesi).
- `LINK_CLICKS` hem optimizasyon hem faturalama olarak seçilirse kreatifte
  `call_to_action` **zorunlu**.
- `THRUPLAY` faturalaması var (tamamlanan ya da 15 sn izlenen).
- Minimum bütçe faturalama olayına bağlı (§2e).
Panelin varsayılanı `IMPRESSIONS` olmalı; başka değer yalnızca Gelişmiş modda ve doğrulanmış
kombinasyonla.

#### 9c. Yerleşim kısıtları (amaçla ilişkili)

- `LEAD_GENERATION`: masaüstü cihaz + Instagram birlikte seçilemez.
- Trafik amacında: Facebook/Messenger `story` konumu `destination_type: MESSENGER`'ı
  desteklemez; Instagram `ig_search` ve `explore_home` WhatsApp ve Messenger varışını
  desteklemez.
- v3.0'dan beri çoğu amaçta Facebook `right_hand_column` yasak.
- `VIDEO_VIEWS`: Facebook `story` var ama `TWO_SECOND_CONTINUOUS_VIDEO_VIEWS` ile değil.
- Tablo eski amaç adlarıyla yazılmış; ODAX karşılığı için yerleşim bölümü (hedefleme) esas.

#### 9d. attribution_spec (optimizasyon için atıf penceresi)

Raporlama penceresinden **farklıdır**; teslim optimizasyonunda hangi dönüşümlerin sayılacağını
belirler. Pencereler 1 ya da 7 gün.

| Amaç | Optimizasyon | İzinli kombinasyon |
|---|---|---|
| CONVERSIONS, PRODUCT_CATALOG_SALES (≈ SALES/LEADS web) | `OFFSITE_CONVERSIONS` | 1g tık · 7g tık · 1g tık + 1g görüntüleme · 7g tık + 1g görüntüleme |
| APP_INSTALLS, LINK_CLICKS | `OFFSITE_CONVERSIONS` | 1g tık · 7g tık |
| APP_INSTALLS | `APP_INSTALLS` | 1g tık · 1g tık + 1g ilgili görüntüleme · 1g tık + 1g görüntüleme · üçü birden |
| CONVERSIONS | `INCREMENTAL_OFFSITE_CONVERSIONS` | tık ve görüntüleme null |
| Diğer her şey | — | yalnızca 1g tık |

**Sessiz varsayılan:** değer optimizasyonu ad set'lerinde `attribution_spec` verilmediğinde
geçmişte 1 günlük tıklamaya düşüyordu. Advetics her zaman açıkça göndermeli.

#### 9e. Amaca göre kreatif ve izleme

- Kreatif alanı: hemen her amaçta `object_story_id` **ya da** `object_story_spec`;
  `MESSAGES`'ta yalnızca `object_story_spec`; `PAGE_LIKES`'ta ayrıca `object_id`, `body`.
  `CONVERSIONS`, `LINK_CLICKS`, `POST_ENGAGEMENT`'ta uygulama mağazasına giden link reklamı
  yasak.
- Uyumlu reklam türleri tablosu (görsel, video, carousel, Instant Experience, koleksiyon,
  dinamik…) eski amaç adlarıyla verilmiş; ör. `POST_ENGAGEMENT`'ta video **yok**, `VIDEO_VIEWS`'ta
  görsel **yok**.
- **İzleme (tracking_specs) varsayılanları amaçtan türetiliyor; ama piksel izleme
  `CONVERSIONS`'ta varsayılan değil ve mobil uygulama reklamları yüklemeyi/olayları artık
  varsayılan olarak İZLEMİYOR** — açıkça `tracking_specs` verilmezse reklam hiçbir şey
  izlemez, hata da vermez.

#### 9f. Eski amaçların durumu

- v17.0'dan beri kullanımdan kalkmış; enum'da duruyor. Belge "2022 boyunca desteklenecek"
  diyor (bayat).
- Eski amaçlı kampanyayı ODAX amacına **çoğaltmak hata verebilir**; aynı uyarı reklam
  güncelleme sayfasında da var. Advetics geçmiş hesaplarda eski amaçlı kampanyaları
  okuyabilir ama kopyalamaya çalışmamalı.

### 10. Bütçe, teklif, zamanlama, özel kategoriler

#### 10a. Bütçe ve teklif özeti

- **CBO (kampanya bütçesi):** kampanyada `daily_budget`/`lifetime_budget` + `bid_strategy`;
  ad set'lerde bütçe yok, teklif tavanı gerekiyorsa ad set `bid_amount`. Ad set alt/üst
  harcama (`daily_min_spend_target`, `daily_spend_cap`, ömür boyu karşılıkları) yalnızca CBO'da.
- **Ad set bütçesi:** ad set'te bütçe + `bid_strategy`; kampanyada
  `is_adset_budget_sharing_enabled` (canlıda zorunlu; `true` ise %20'ye kadar ad set'ler arası
  kaydırma).
- **Geçiş:** CBO ↔ ad set bütçesi geçişi kampanya güncellemesinde `adset_budgets` ile, otomatik
  → manuel teklif geçişi `adset_bid_amounts` ile. 70+ ad set'li CBO kampanyada kilitli.
- **Strateji:** `LOWEST_COST_WITHOUT_CAP` (otomatik; bütçeye göre en çok sonuç, maliyet
  dalgalanabilir), `LOWEST_COST_WITH_BID_CAP` (açık artırma teklif tavanı; düşük tavan = az
  yayın), `COST_CAP` (ortalama sonuç başı maliyet hedefi), `LOWEST_COST_WITH_MIN_ROAS`
  (açıklaması bu grupta yok). İlk ikisi dışında `bid_amount` gerekiyor (`COST_CAP`'te de).
- **Teklif birimi:** §2a `bid_amount`.
- **Harcama tavanları:** kampanya `spend_cap` (alt birim, ≥ ~$100, kaldırma `922337203685478`);
  hesap `spend_cap` (okumada alt birim, **güncellemede standart birim ondalık**; `0` = tavansız;
  yalnızca ayarlandıktan SONRAKİ harcamaya uygulanır; `spend_cap_action=reset` harcananı sıfırlar,
  `delete` tavanı kaldırır). Hesap tavanına ulaşılınca bütün yayın durur.
- `recurring_budget_semantics` → günlük bütçenin aşılıp aşılamayacağı (§2b).

#### 10b. AB/DSA ve bölgesel düzenlemeler

- Ad set AB'yi, bağlı bölgeleri ya da **"dünya geneli"ni** hedefliyorsa `dsa_payor` ve
  `dsa_beneficiary` (≤512 karakter) zorunlu; yoksa subcode **3858079** (ödeyen) /
  **3858081** (yararlanan). Kopyalamada da aynı.
- Hesapta `default_dsa_payor` / `default_dsa_beneficiary` varsa eksik olan **hesap
  varsayılanından** doldurulur — **verdiğin diğer değerden değil**. Yalnızca birini gönderip
  ötekinin aynı olacağını varsaymak sessiz hata.
- Hesap varsayılanları ya ikisi birden ayarlanır ya hiç; silmek için ikisine aynı anda boş
  string.
- AB dışını hedefleyen ad set'te bu değerler **kaydedilmez** (verilse bile).
- Öneri ucu: `act_X/dsa_recommendations`.
- `regional_regulated_categories`: `TAIWAN_FINSERV`, `AUSTRALIA_FINSERV`, `INDIA_FINSERV`,
  `TAIWAN_UNIVERSAL`, `SINGAPORE_UNIVERSAL`, `THAILAND_UNIVERSAL`, `BRAZIL_REGULATION` (+ ilgili
  doğrulanmış kimlik kimlikleri). Türkiye için kategori yok. (Belgede Brezilya açıklaması
  "Tayland" diye yazılmış — kopyala-yapıştır hatası.)

#### 10c. Özel reklam kategorileri

- Her yeni ve düzenlenen kampanyada beyan zorunlu (`special_ad_categories`, boş dizi = yok).
- Konut, istihdam, kredi: hedefleme ve kitle kısıtları (hedefleme bölümü); Erişim ve Sıklık
  kapalı. Sosyal konu/seçim/siyaset etiketi hedeflemeyi etkilemiyor ama kreatif ve reklamda
  `authorization_category`, Sayfa yetkisi (`has_page_authorized_adaccount`) ve kullanıcı
  doğrulaması istiyor; yetki yoksa reklam **reddediliyor**.
- Yeni değerler: `ONLINE_GAMBLING_AND_GAMING`, `FINANCIAL_PRODUCTS_SERVICES`.

### 11. Durum alanları ve teşhis — tek tablo

| Seviye | `status` (kurulan) | `effective_status` (gerçek) | Teşhis alanları |
|---|---|---|---|
| Hesap | — | `account_status`: 1 ACTIVE, 2 DISABLED, 3 UNSETTLED, 7 PENDING_RISK_REVIEW, 8 PENDING_SETTLEMENT, 9 IN_GRACE_PERIOD, 100 PENDING_CLOSURE, 101 CLOSED, 201 ANY_ACTIVE, 202 ANY_CLOSED | `disable_reason`: 0 NONE, 1 ADS_INTEGRITY_POLICY, 2 ADS_IP_REVIEW, 3 RISK_PAYMENT, 4 GRAY_ACCOUNT_SHUT_DOWN, 5 ADS_AFC_REVIEW, 6 BUSINESS_INTEGRITY_RAR, 7 PERMANENT_CLOSE, 8 UNUSED_RESELLER_ACCOUNT, 9 UNUSED_ACCOUNT, 10 UMBRELLA_AD_ACCOUNT, 11 BUSINESS_MANAGER_INTEGRITY_POLICY, 12 MISREPRESENTED_AD_ACCOUNT, 13 AOAB_DESHARE_LEGAL_ENTITY, 14 CTX_THREAD_REVIEW, 15 COMPROMISED_AD_ACCOUNT; `failed_delivery_checks`, `funding_source` |
| Kampanya | ACTIVE/PAUSED/DELETED/ARCHIVED | + IN_PROCESS, WITH_ISSUES | `issues_info` |
| Ad set | 〃 | + CAMPAIGN_PAUSED, IN_PROCESS, WITH_ISSUES | `issues_info`, `learning_stage_info`, `recommendations`, `targeting_optimization_types`, `delivery_stats` kenarı |
| Reklam | 〃 | + PENDING_REVIEW, DISAPPROVED, PREAPPROVED, PENDING_BILLING_INFO, CAMPAIGN_PAUSED, ADSET_PAUSED, IN_PROCESS, WITH_ISSUES | `issues_info`, `ad_review_feedback`, `failed_delivery_checks`, `recommendations`, `last_updated_by_app_id` |
| Kreatif | ACTIVE/IN_PROCESS/WITH_ISSUES/DELETED | — | `effective_authorization_category`, `object_type` (`INVALID`, `POST_DELETED`) |

"Çalışıyor ya da incelemede" sayımı (`act_X/ads_volume`): reklam `effective_status` 1 (aktif)
ya da `configured_status=active` iken `effective_status` 9 (inceleme bekliyor) / 17 (işlem
bekliyor); hesap durumu 1, 8 ya da 9; ve ad set takvimi şu anı kapsıyor (gün içi zamanlamada
bütün gün sayılır). Bu sayı Sayfa başına reklam sınırına sayılıyor; `show_breakdown_by_actor`
ile Sayfa kırılımı.

Öğrenme aşaması: `learning_stage_info` alt yapısı bu grupta yok; `delivery_stats` kenarı
`groups` = `LEGACY_ALL`, `LEARNING_STAGE_COMMON_INFO`, `BIDDING_RECOMMENDATIONS`,
`LEARNING_STAGE_EXIT`, `UNSUPPORTED_FEATURES` ve `bid_recommendation_type=LOWEST_COST_TO_COST_CAP`
alıyor (dönen düğüm tipinin alanları bu grupta tanımlı değil). Aktivite olayları
`update_ad_set_learning_stage_status` ve `di_ad_set_learning_stage_exit` öğrenme değişimini
kaydediyor.

### 12. Kenarlar (edges): ne işe yarar, AI/panel için kullanılabilir mi

**Ad set kenarları**

| Kenar | Ne döner / parametre | AI / panel kullanımı |
|---|---|---|
| `delivery_estimate` | Ad set'in mevcut ayarlarıyla (ya da `optimization_goal`, `promoted_object`, `targeting_spec` ezilerek) teslim tahmini; `daily_outcomes_curve`. Pasif benzer kitlede çalışmaz; hata 2641 kısıtlı konum. **Güven düşükse eğri tek noktalı ve hepsi 0** döner. | Ayar değişikliğinden ÖNCE "bu değişiklik erişimi nasıl etkiler" sorusu (AI'ın taslak önerisi). Sıfır eğri "0 sonuç" diye gösterilmemeli, "tahmin yok" denmeli. Ad set henüz yokken hesap seviyesindeki `act_X/delivery_estimate` / `reachestimate` kullanılmalı. |
| `targetingsentencelines` | Hedeflemenin insan diliyle cümleleri. | **Geri okuma doğrulaması:** gönderilen hedeflemenin Meta'da nasıl anlaşıldığını kullanıcıya ve AI'a göstermek (ör. "Türkiye" + "İzmir" birleşimi yakalanır). Yüksek değer, düşük risk. |
| `targeting_insights` | `AdsTargetingInsights` listesi; alan tanımı yok. | Belgede belirsiz — kullanma. |
| `copies` | Okuma: kopyalar (`effective_status`, `is_completed` süzgeci). Yazma: kopyalama (§13). | Onaylı araç. |
| `budget_schedules` | Yüksek talep dönemleri (§8). | Gelişmiş mod; onaylı. |
| `asyncadrequests` | Asenkron reklam isteklerinin durumları. | Toplu oluşturma izleme. |
| `activities` | Ad set'in değişiklik geçmişi (§15). | Teşhis. |
| `adcreatives` | Ad set'teki kreatifler; `summary.total_count`. | Okuma. |
| `ads` | Ad set'teki reklamlar; `effective_status` süzgeci — **boşsa silinmiş/arşivli reklamları döndürmez**; `updated_since`; `summary.insights`. | Okuma; sayımlarda süzgeç açıkça verilmeli. |
| `adrules_governed` | Bu ad set'i yöneten otomatik kurallar; `pass_evaluation`. | Meta tarafı kuralların Advetics kural motoruyla çakışmasını görmek. |
| `delivery_stats` | Öğrenme ve teklif önerisi grupları. | Teşhis paneli. |
| `campaign_actions` | "Eyleme dönük içgörü" (Ad Proposals). Alan tanımı yok. | Belgede belirsiz. |
| `message_delivery_estimate` | Pazarlama mesajı kampanyası tahmini: `bid_amount`, `lifetime_budget`, `lifetime_in_days`, `optimization_goal`, `pacing_type` (`STANDARD`, `DISABLED`, `DAY_PARTING`, `NO_PACING`, `PROBABILISTIC_PACING(_V2)`), `promoted_object`, `targeting_spec`. | Şimdilik kapsam dışı. |
| `publisher_delivery_report` | Reklamın hangi yayıncılarda/konumlarda çıktığı; `platform` ve `position` zorunlu; `publisher_status`, `sort_by`, tarih. | Marka güvenliği raporu; düşük öncelik. |
| `insights` | Ad set metrikleri (§16). | Okuma. |
| `ad_studies`, `addrafts`, `budget_split_set` (boş sayfa) | — | Kullanılmaz. |

**Kampanya kenarları:** `adsets` (süzgeç `effective_status`, `is_completed`, `summary`),
`ads`, `copies`, `budget_schedules`, `insights`, `adlabels` (POST), `adrules_governed`,
`ad_studies`, `addrafts`, `video_groups` (`date_range`).

### 13. Kopyalama (`copies`)

| | Kampanya `POST /{campaign_id}/copies` | Ad set `POST /{ad_set_id}/copies` |
|---|---|---|
| Hedef ebeveyn | — | `campaign_id` (kopya o kampanyanın ayarlarını, ör. bütçesini, devralır) |
| `deep_copy` | Varsayılan `false`; çocuk reklam toplamı senkron çağrıda **≤3**, asenkronda **≤51** | Aynı |
| `start_time` / `end_time` | Derin kopyada çocuk ad set'lerin zamanı; verilmezse kaynaktan | Aynı; günlük bütçede `end_time=0` bitişsiz |
| `status_option` | `ACTIVE`, **`PAUSED` (varsayılan)**, `INHERITED_FROM_SOURCE` | Aynı |
| `rename_options` | `rename_strategy` (`DEEP_RENAME`, **`ONLY_TOP_LEVEL_RENAME` varsayılan**, `NO_RENAME`), `rename_prefix`, `rename_suffix` (boşsa hesap diline göre "- Copy") | Aynı |
| Diğer | `parameter_overrides` (kampanya tanımı) | — |
| Dönüş | `copied_campaign_id` + `ad_object_ids[]` (`ad_object_type`, `source_id`, `copied_id`) | `copied_adset_id` + aynı liste |

- Büyük kopyalar `asyncbatch` ile (tek HTTP isteğinde 50'ye kadar alt istek).
- **Bitmiş bir ad set kopyalanırsa kopya oluşturma anında başlar ve orijinalin süresini alır**
  — sessiz yeniden yayın.
- AB hedefli kopyada DSA alanları gerekli.
- Hata 2695: iOS14 kampanya ad set sınırı.

### 14. Reklam hesabı kökü — reklam oluşturmada gereken alanlar (`ad-account`)

| Alan | Neden gerekli |
|---|---|
| `id` (`act_<n>`), `account_id` (sayı) | Yol önekli, `copy_from` öneksiz ister. |
| `currency` | Bütçe/teklif birimini ve alt birim çarpanını belirler. |
| `timezone_id`, `timezone_name`, `timezone_offset_hours_utc` | Ad set saatleri, `adset_schedule` (`ADVERTISER` tipinde) ve "bugün" harcaması bu dilime göre. |
| `min_daily_budget` | Hesaba özgü minimum günlük bütçe. |
| `min_campaign_group_spend_cap` | Kampanya `spend_cap` alt sınırı. |
| `account_status`, `disable_reason` | Hesap kapalıysa yazma denenmemeli; nedeni Türkçe gösterilmeli. |
| `spend_cap`, `amount_spent`, `balance` | Hesap tavanı ve kalan; tavana ulaşınca her şey durur. |
| `funding_source`, `funding_source_details` (MANAGE yetkisi gerekir) | **Ödeme yöntemi yoksa reklam oluşur ama hiç yayın almaz** — oluşturmadan önce kontrol. |
| `is_prepay_account` | Ön ödemeli hesapta bakiye bitince yayın durur. |
| `capabilities` | Ör. `CAN_USE_BUDGET_SCHEDULING_API`. |
| `default_dsa_payor`, `default_dsa_beneficiary` | AB hedeflemesinde otomatik doldurma. |
| `has_page_authorized_adaccount` | Siyasi reklam yetkisi. |
| `user_tasks`, `tos_accepted`, `user_tos_accepted`, `offsite_pixels_tos_accepted` | Yetki ve sözleşme engelleri. |
| `failed_delivery_checks` | Hesap seviyesi teslim engelleri. |
| `brand_safety_content_filter_levels` | Hesap seviyesinde marka güvenliği filtresi. |
| `opportunity_score` (0–100), `opportunity_score_weight` | Meta'nın "optimizasyon puanı"; öneri kaynağı. |
| `business`, `owner`, `name`, `age`, `is_personal`, `tax_id_status`, `end_advertiser`, `media_agency`, `partner` | Bağlam. `attribution_spec` hesapta iOS 14 sonrası kalktı. |

Hesap kenarları (oluşturma için ilgili): `adimages`, `adcreatives`, `advideos`, `generatepreviews`,
`minimum_budgets`, `delivery_estimate`, `reachestimate`, `targetingsearch`/`targetingbrowse`/
`targetingsuggestions`/`targetingvalidation`, `connected_instagram_accounts`,
`instagram_accounts`, `promote_pages`, `customaudiences`, `customconversions`,
`saved_audiences`, `dsa_recommendations`, `deprecatedtargetingadsets` (kalkan hedefleme
kullanan ad set'ler — bakım için değerli), `account_controls` (Advantage+ alışveriş için yaş/konum
kısıtı), `activities`, `ads_volume`.

Hesap güncelleme (`POST /act_{id}`): `name`, `spend_cap`, `spend_cap_action`,
`default_dsa_*`, `end_advertiser`/`media_agency`/`partner` (bir kez `NONE`/`UNFOUND` dışı
değer alınca değişmez), `agency_client_declaration`, `business_info`, `custom_audience_info`,
`is_notifications_enabled`. Kullanıcı yetkisi: `POST /act_{id}/assigned_users` `user`, `tasks`
(`MANAGE`, `ADVERTISE`, `ANALYZE`, `DRAFT`, `AA_ANALYZE`). Hesap oluşturma
(`POST /{business_id}/adaccount`: `name`, `currency`, `timezone_id`, `end_advertiser`,
`media_agency`, `partner` zorunlu) Advetics'in işi değil.

Hesap limitleri: kişi başına 25 hesap, hesap başına 25 kişi; hesap başına görsel sınırsız.

Hesap kullanıcısı (`ad-account-user`): `id`, `name`, `tasks` — salt okunur.

### 15. Değişiklik geçmişi (`ad-activity`, `/activities`)

- `GET /act_{id}/activities` (ve ad set'te `/{ad_set_id}/activities`). **Varsayılan yalnızca son
  bir hafta** (`since` varsayılanı 7 gün önce, `until` şimdi).
- Parametreler: `since`, `until`, `category` (`ACCOUNT`, `AD`, `AD_KEYWORDS`, `AD_SET`,
  `AUDIENCE`, `BID`, `BUDGET`, `CAMPAIGN`, `DATE`, `STATUS`, `TARGETING`), `uid` (kullanıcıya
  göre), `limit`, `after`, **`business_id` (hesap bir işletmeye bağlıysa zorunlu)**.
- Alanlar: `event_time`, `event_type`, `translated_event_type` (yerelleştirilmiş ad),
  `date_time_in_timezone`, `actor_id`, `actor_name`, **`application_id`, `application_name`**,
  `object_id`, `object_name`, `object_type`, `extra_data` (JSON **string** — ayrıca parse
  edilmeli).
- Önemli olay türleri: `create_campaign_group`, `update_campaign_run_status`,
  `update_campaign_budget`, `update_campaign_group_spend_cap`,
  `update_campaign_budget_optimization_toggling_status`, `create_ad_set`,
  `update_ad_set_budget`, `update_ad_set_bid_strategy`, `update_ad_set_bidding`,
  `update_ad_set_target_spec`, `update_ad_set_optimization_goal`, `update_ad_set_run_status`,
  `update_ad_set_duration`, `update_ad_set_learning_stage_status`, `create_ad`,
  `update_ad_creative`, `edit_and_update_ad_creative`, `update_ad_run_status`,
  `ad_review_approved`, `ad_review_declined`, `first_delivery_event`, `campaign_ended`,
  `lifetime_budget_spent`, `account_spending_limit_reached`,
  `campaign_spending_limit_reached`, `ad_account_update_status`,
  `ad_account_billing_decline`, `conversion_event_updated`, `update_ad_labels`,
  `apply_restrictions_custom_audience` (+ kitle ve fatura olayları).
- Advetics için: (1) Meta hesapları artık MCP ile de yönetildiği için panel "gecikmeli ayna";
  bu uç, bütçe/durum değişikliğini **kimin (hangi uygulamanın) yaptığını** gösteriyor ve kural
  motorunun eski rakamla karar vermesini önlemek için senkron tetikleyicisi olabilir. (2) "Neden
  durdu?" sorusunun cevabı çoğu zaman burada (`account_spending_limit_reached`,
  `lifetime_budget_spent`, `ad_review_declined`).

### 16. Insights kenarı (kampanya ve ad set) — yazma yolunu ilgilendiren kısım

- `GET /{id}/insights` parametreleri: `fields` (boşsa yalnızca gösterim ve harcama),
  `level` (`ad`, `adset`, `campaign`, `account`), `date_preset` (**varsayılan `last_30d`**),
  `time_range`, `time_ranges` (verilirse `date_preset`/`time_range`/`time_increment` yok sayılır),
  `time_increment` (`all_days` varsayılan, `monthly` ya da 1–90 gün), `breakdowns` (yalnızca belirli
  kombinasyonlar; `impression_device` tek başına olmaz), `action_breakdowns` (varsayılan
  `action_type`; kullanılırsa `actions` alanı da istenmeli), `action_attribution_windows`,
  `action_report_time` (`impression`, `conversion`, `mixed`, `lifetime`),
  `use_unified_attribution_setting`, `use_account_attribution_setting` (varsayılan `false`),
  `filtering`, `sort` (tek öğe), `summary`, `default_summary`, `limit`, `product_id_limit`,
  `export_format` (`xls`/`csv`, asenkron), `export_name`, `export_columns`.
- `POST /{id}/insights` asenkron rapor (`report_run_id`) — aynı parametreler + `graph_cache`.
- **Belge çelişkisi:** `action_attribution_windows=default`'un anlamı GET'te
  `["7d_click","1d_view"]`, POST'ta `["7d_view","1d_click"]` yazıyor. Advetics'in açıkça
  gönderme kuralını doğruluyor.
- 37 aydan eski başlangıç hata 3018; geçersiz imleç 2642.
- `spend`, `reach`, `frequency`, `cpp`, `unique_*` ve maliyet-başı-tekil alanları "tahmini";
  `video_play_actions`, `cost_per_thruplay` "geliştirmede". `results`, `cost_per_result`,
  `objective_results` amaca göre sonuç; `attribution_setting` ad set'in kendi ayarı (kampanya/hesap
  için ad set'lerden hesaplanıyor). Metrik sözlüğünün tamamı ölçüm bölümünde.

---

## API çağrıları

Taban: `https://graph.facebook.com/v25.0`. Gövde form-encoded; nesne/dizi alanları JSON string.
Hepsinde `access_token`.

| İş | Uç | Yöntem | Zorunlu / kritik |
|---|---|---|---|
| Kampanya oluştur | `/act_{id}/campaigns` | POST | `special_ad_categories`; pratikte `name`, `objective`, `status=PAUSED`; ad set bütçesinde `is_adset_budget_sharing_enabled` |
| Kampanya güncelle | `/{campaign_id}` | POST | CBO geçişinde `adset_budgets`, teklif geçişinde `adset_bid_amounts` |
| Kampanya sil | `/{campaign_id}` | DELETE | — |
| Ad set oluştur | `/act_{id}/adsets` | POST | `name`, `campaign_id`, `targeting`, `optimization_goal`, `billing_event`, bütçe (CBO değilse), `bid_strategy`, `destination_type`, gerekiyorsa `promoted_object`, AB'de DSA |
| Ad set güncelle / sil | `/{ad_set_id}` | POST / DELETE | Bütçe düşürmede harcanan×1,1 alt sınırı |
| Reklam oluştur | `/act_{id}/ads` | POST | `name`, `adset_id`, `creative` |
| Reklam toplu (asenkron) | `/act_{id}/asyncadrequestsets` | POST | `name`, `ad_specs` |
| Reklam güncelle / sil | `/{ad_id}` | POST / DELETE | `status`, `creative` |
| Kreatif oluştur | `/act_{id}/adcreatives` | POST | `object_story_spec` ya da `object_story_id` (ya da IG üçlüsü) |
| Kreatif ad/durum | `/{creative_id}` | POST | yalnızca `name`, `status`, `adlabels` |
| Kreatif önizleme | `/{creative_id}/previews` | GET | `ad_format` |
| Kaydedilmemiş kreatif önizleme | `/act_{id}/generatepreviews` | GET | kreatif tanımı + `ad_format` |
| Görsel yükle / kopyala | `/act_{id}/adimages` | POST | `bytes` ya da dosya; `copy_from` |
| Görsel sil | `/act_{id}/adimages` | DELETE | `hash` |
| Kopyala | `/{campaign_id|ad_set_id|ad_id}/copies` | POST | `status_option` açıkça |
| Bütçe planı | `/{campaign_id|ad_set_id}/budget_schedules` | POST/GET | `budget_value`, `budget_value_type`, `time_start`, `time_end` |
| Etiket | `/act_{id}/adlabels`, `/{nesne}/adlabels` | POST | `name` / `adlabels` |
| Teslim tahmini | `/{ad_set_id}/delivery_estimate` | GET | isteğe bağlı ezmeler |
| Hedefleme cümlesi | `/{ad_set_id}/targetingsentencelines` | GET | — |
| Öğrenme / teklif önerisi | `/{ad_set_id}/delivery_stats` | GET | `groups` |
| Değişiklik geçmişi | `/act_{id}/activities` | GET | `since`, `until`, gerekiyorsa `business_id` |
| Çalışan reklam sayısı | `/act_{id}/ads_volume` | GET | `show_breakdown_by_actor` |
| Hesap alanları | `/act_{id}?fields=currency,timezone_name,min_daily_budget,account_status,disable_reason,spend_cap,amount_spent,funding_source,capabilities,default_dsa_payor,default_dsa_beneficiary` | GET | — |

Kısaltılmış örnekler:

```
POST /act_<HESAP>/campaigns
  name=Bahar trafik
  objective=OUTCOME_TRAFFIC
  status=PAUSED
  special_ad_categories=[]
  is_adset_budget_sharing_enabled=false
  execution_options=["validate_only"]        # önce prova, sonra bu satır olmadan
```

```
POST /act_<HESAP>/adsets
  name=Bahar trafik - İzmir
  campaign_id=<KAMPANYA>
  daily_budget=50000                          # alt birim: 500,00 TL
  bid_strategy=LOWEST_COST_WITHOUT_CAP
  billing_event=IMPRESSIONS
  optimization_goal=LANDING_PAGE_VIEWS
  destination_type=WEBSITE
  attribution_spec=[{"event_type":"CLICK_THROUGH","window_days":1}]
  targeting={"geo_locations":{...},"age_min":18,"age_max":65}
  status=PAUSED
```

```
POST /act_<HESAP>/adcreatives
  name=Bahar trafik - görsel 1
  object_story_spec={"page_id":"<SAYFA>","link_data":{"image_hash":"<HASH>",
    "link":"https://ornek.com","message":"…",
    "call_to_action":{"type":"LEARN_MORE","value":{"link":"https://ornek.com"}}}}
  url_tags=utm_source=meta&utm_medium=paid
```

```
POST /act_<HESAP>/ads
  name=Bahar trafik - reklam 1
  adset_id=<AD_SET>
  creative={"creative_id":"<KREATİF>"}
  status=PAUSED
  execution_options=["validate_only","synchronous_ad_review"]
```

```
POST /<AD_SET>/copies
  deep_copy=true
  status_option=PAUSED
  rename_options={"rename_strategy":"DEEP_RENAME","rename_suffix":" (kopya)"}
```

---

## Tuzaklar ve sessiz hata riskleri

1. **`bid_strategy` göndermemek.** Kampanya sayfasına göre oluşturma varsayılanı
   `LOWEST_COST_WITH_BID_CAP`; ad set sayfasına göre yalnızca `bid_amount` tek başına verilince.
   BID_CAP'e düşen ad set düşük tavanla neredeyse hiç yayın almayabilir — hata yok.
2. **`bid_amount`'u stratejisiz göndermek** ad set'i sessizce manuel tavan teklifine çevirir.
3. **Para birimi birimi karışıklığı:** bütçe/teklif/kampanya tavanı alt birim; hesap `spend_cap`
   güncellemesi standart birim (`23.50`), okuması alt birim. Gösterim/erişim faturalamasında
   `bid_amount` 1.000 gösterim başına, diğerlerinde olay başına.
4. **`attribution_spec` vermemek:** değer optimizasyonunda geçmişte 1 günlük tıklamaya düşüyordu;
   diğer kombinasyonlarda zaten yalnızca 1g tık izinli. Açıkça yaz.
5. **Piksel/uygulama izleme varsayılan değil:** `CONVERSIONS`'ta piksel ve mobil uygulama
   reklamlarında yükleme/olay izleme açıkça verilmezse reklam **hiçbir şey izlemez**.
6. **`promoted_object` varken verilen `conversion_specs` yok sayılıyor.**
7. **Kreatif tekilliği:** aynı kreatif yeniden oluşturulunca var olanın kimliği dönüyor.
8. **Sayfa etiketi (Page mention):** API kabul ediyor, reklam etiketsiz yayınlanıyor.
9. **Uygulama mağazası linkli gönderi:** gönderi adı ve ikon mağazadan eziliyor.
10. **Lookalike genişletmesi (v13+)** değer/dönüşüm/uygulama olayı optimizasyonunda
    kapatılamaz; ayrıntılı hedefleme genişletmesi de `targeting_optimization_types`'ta görünüyor.
    Kullanıcının seçtiği kitle Meta'nın gerçekte kullandığından dar.
11. **`degrees_of_freedom_spec` / Advantage+ kreatif:** Meta kreatifi dönüştürebiliyor; bu
    grupta içerik tanımı yok — açıkça ne gönderildiği kreatif bölümünde netleşmeli.
12. **DSA yarım doldurma:** yalnızca `dsa_payor` verilirse `dsa_beneficiary` hesap
    varsayılanından gelir, verilen değerden değil. AB dışı hedeflemede değerler kaydedilmez.
13. **Bitmiş ad set kopyası** oluşturulduğu anda yeniden başlıyor. `status_option` varsayılanı
    `PAUSED` olsa da `ACTIVE` ya da `INHERITED_FROM_SOURCE` verilirse anında harcama.
14. **Ödeme yöntemi yok:** reklam oluşuyor, hiç teslim almıyor (`funding_source` boş).
15. **Hesap `spend_cap`** ayarlandığı andan **sonraki** harcamaya uygulanıyor; tavana gelince
    bütün kampanyalar duruyor (aktivitede `account_spending_limit_reached`).
16. **Geçersiz `time_range` hata vermeden yok sayılıyor** (düğüm okumalarında) — sonuç
    varsayılan aralıkla gelir ve yanlış dönem gösterilir.
17. **`/ads` kenarı varsayılan olarak silinmiş/arşivli reklamları döndürmüyor** — sayım ve
    "bu ad set'te kaç reklam var" sorusunda süzgeç açıkça verilmeli.
18. **`delivery_estimate` güvensizse tek noktalı sıfır eğri** döndürüyor; "0 sonuç" diye
    gösterilirse yanıltır.
19. **`updated_time` bütçe/tavan değişikliğinde güncellenmiyor** — değişiklik tespiti için
    kullanılamaz; `activities` kullan.
20. **İşaretli özel kitle/dönüşüm:** ad set `ACTIVE` görünürken `issues_info`'da `SOFT_ERROR`
    ve yayın kısılmış. Ayrıca belgeye göre oluşturma/güncelleme 246003/246004 ile de
    düşebiliyor (belge çelişkili).
21. **Etiket kümesi ezme:** `POST /{nesne}` içinde `adlabels` göndermek mevcut bütün etiketleri
    siler; yalnızca ad vermek yeni etiket yaratır.
22. **Arşivleme tek yönlü:** `ARCHIVED` nesne yalnızca `DELETED`'a gidebilir, geri `PAUSED`
    yapılamaz.
23. **Yüksek talep dönemi geri alınamayabilir:** güncelleme/silme ucu belgede yok.
24. **`ONSITE_CONVERSIONS`, `LEAD_FROM_MESSENGER`, `LEAD_FROM_IG_DIRECT`, `PHONE_CALL`** eşleme
    tablolarında var ama ilgili enum listelerinde yok — enum'a güvenip tablodaki değeri
    "geçersiz" sanmak ya da tersi.
25. **Limit çelişkileri** (ad set başına 50 reklam "arşivlenmemiş" mi "silinmemiş" mi;
    hesap başına 5.000 mü 6.000 mi) — muhafazakâr değeri kullan.
26. **Senkron reklam incelemesi nihai değil:** `synchronous_ad_review` geçen reklam asıl
    incelemede reddedilebilir.
27. **Önizleme iframe'i 24 saatte ölüyor** — saklanmamalı.
28. **Kampanya `start_time`/`stop_time`** oluşturma tablosunda var ama salt okunur.
29. **Siyasi sınıflandırma:** `effective_authorization_category` beyandan farklı olabilir —
    Meta reklamı siyasi sayarsa yetkisiz hesapta reddedilir.

---

## Advetics'in canlı bilgisiyle karşılaştırma

**Uyuşan**

- **#1 `destination_type: ON_POST`:** ODAX eşleme tablosu gönderi etkileşimini
  `OUTCOME_ENGAGEMENT` + `ON_POST` + `POST_ENGAGEMENT` olarak veriyor. Ek bilgi: v20'den beri
  `ON_POST` ile `IMPRESSIONS` optimizasyonu kalktı. Belge, varış verilmezse reddedileceğini
  söylemiyor; okuma alanı açıklaması `ON_*`'u hâlâ "sınırlı beta" diye anıyor (bayat). Canlı
  bilgi belgeden ileride.
- **#3 Instagram kimlikleri:** kreatifte `source_instagram_media_id`, `instagram_user_id`,
  `object_id`, okumada `effective_instagram_media_id` ve `instagram_permalink_url` var; ad set'te
  v22+ `instagram_user_id`. `object_story_id`'nin IG gönderisiyle çalışmadığı belgede yazmıyor.
- **#4 imzalı görsel adresleri:** AdImage `url` ve `url_128` açıkça "geçici" ve "kreatif
  oluşturmada kullanma" diye işaretli; önizleme iframe'i 24 saat. Uyuşuyor.
- **#6 Click-to-WhatsApp:** eşleme tablosu `OUTCOME_TRAFFIC` + `WHATSAPP` + `page_id` (ve
  `OUTCOME_ENGAGEMENT` + `WHATSAPP` + `CONVERSATIONS`); CTA `value.app_destination` enum'unda
  `WHATSAPP` var. Uyuşuyor.
- **#8 atıf parametreleri:** `use_unified_attribution_setting` ve `action_report_time` belgede
  var; üstelik `default` atıf penceresinin anlamı GET ve POST sayfalarında **farklı yazılmış**
  (`7d_click+1d_view` / `7d_view+1d_click`) — açıkça gönderme kuralı belgeyle de gerekçeli.
- **#10 hesap başına hash ve `act_` öneki:** görselin başka hesapta kullanılması için
  `copy_from` gerekiyor (hash hesaba bağlı); hesap `id` = `act_<n>`, `account_id` = sayı;
  `copy_from.source_account_id` öneksiz isteniyor.
- **`bid_strategy` açıkça:** Advetics ad set'te `LOWEST_COST_WITHOUT_CAP` gönderiyor; belgedeki
  BID_CAP varsayılanı bunun doğru olduğunu gösteriyor.

**Çelişen / gerilimli**

- **#4 kalıcı görsel alanının adı:** CLAUDE.md "kalıcı olan yalnızca `AdImage.permanent_url`"
  diyor; bu referans sayfasında alanın adı **`permalink_url`** ("hikâye kreatiflerinde kullanılacak
  kalıcı URL"). `permanent_url` adında bir alan bu sayfada yok. Kod tarafında hangisinin
  istendiği canlıda kontrol edilmeli; yanlış ad isteniyorsa Graph hata verir ya da alan boş gelir.
- **#2 `geo_locations` birleşimi:** ad set `targeting` açıklaması "`countries` zorunlu" diyor;
  Advetics'in canlı bilgisi ise ülke + şehir birlikte gönderilince ülke geneline yayıldığı.
  Belgedeki "zorunlu" ifadesi takip edilirse il hedeflemesi sessizce ülke geneline döner.
  Bu grupta birleşim davranışı anlatılmıyor; hedefleme bölümünde netleşmeli. Canlı bilgi
  esas alınmalı (şehir seçiliyken `countries` gönderme).
- **`is_adset_budget_sharing_enabled`:** belge bu alanı oluşturma tablosunda listelemiyor
  (yalnızca örnekte ve güncellemede); Advetics canlıda zorunlu olduğunu öğrendi (subcode
  4834011). Canlı bilgi belgeden ileride.
- **#6 WhatsApp numarası:** CTA `value` şemasında `whatsapp_number`, `promoted_object`'te
  `whats_app_business_phone_number_id` ve `whatsapp_phone_number` alanları **var**. Advetics
  numarayı sormamayı, Meta'nın sayfadan çözmesini öğrendi. Belgede bu alanların ne zaman
  gerekli olduğu yazmıyor; kullanmak "yanlış hatta düşme" riskini geri açar — kapalı tutulmalı.

**Belgede geçmeyen (bu grupta)**

- #5 `?ids=` çoklu sorgu davranışı, #7 `limit=500` / "reduce the amount of data" (yalnızca
  "kreatif okuma 50.000'de kesilir" var), #9 `age_max=65`, #11 `adinterest` araması ve ilgi
  büyüklüğü, #12 organik istatistik adları.

---

## Yapay zekâ ile yönetim için çıkarımlar

**Araç olması gereken işlemler**

| Araç | Meta çağrısı | Onay |
|---|---|---|
| `kampanya_taslagi_dogrula` | create uçlarına `execution_options=["validate_only"]` (reklamda `+synchronous_ad_review`) | Gerekmez (mutasyon yok) |
| `kampanya_kur` (kampanya+ad set+kreatif+reklam, hepsi PAUSED) | 4 POST | Taslak onayı (para harcamaz ama hesapta nesne açar) |
| `yayina_al` / `durdur` | `status=ACTIVE` / `PAUSED` (genelde ad set ya da kampanya) | **Her zaman onay** |
| `butce_degistir` | ad set/kampanya `daily_budget`/`lifetime_budget` | **Onay**; harcanan×1,1 ve hesap minimumu araçta kontrol |
| `teklif_stratejisi_degistir` | `bid_strategy`, `bid_amount`, CBO geçişi | **Onay**, yalnızca Gelişmiş |
| `kopyala` | `/copies` | **Onay**; `status_option=PAUSED` sabit |
| `kreatif_degistir` | yeni kreatif + reklam `creative` güncelle | **Onay** (yeniden incelemeye girer) |
| `arsivle` | `status=ARCHIVED` | **Onay**; geri alınamaz diye uyar |
| `durum_teshis` | `effective_status`, `issues_info`, `learning_stage_info`, `ad_review_feedback`, `failed_delivery_checks`, hesap `account_status`/`disable_reason`/`funding_source` | Gerekmez |
| `hedefleme_ozeti` | `targetingsentencelines` | Gerekmez |
| `teslim_tahmini` | `delivery_estimate` / hesap `reachestimate` | Gerekmez |
| `degisiklik_gecmisi` | `activities` (`since`/`until` açıkça) | Gerekmez |
| `onizleme` | `previews` / `generatepreviews` | Gerekmez |

**Hiç araç olmamalı:** `DELETE /act_{id}/campaigns` (toplu silme), `status=DELETED`, hesap
`spend_cap`/`spend_cap_action`, `assigned_users`, hesap oluşturma, `copy_from` ile hesaplar arası
görsel taşıma (hash eşlemesi ayrı iş).

**Kapalı sözlükten seçilmesi gerekenler** (AI serbest metin üretmemeli):
`objective` (yalnızca 6 ODAX), `destination_type` (amaca göre alt küme, §9a),
`optimization_goal` (amaç+varışa göre alt küme), `billing_event` (varsayılan `IMPRESSIONS`),
`bid_strategy` (4 değer; Basit modda tek değer), `special_ad_categories` (7 değer),
`custom_event_type` (pikselin gerçekten gönderdiği olaylardan), `call_to_action_type`
(amaca uygun kısa liste), `status` (`ACTIVE`/`PAUSED`), `attribution_spec` kombinasyonları
(§9d), `frequency_control_specs` sınırları (1–90).

**AI'ın asla tahmin etmemesi gerekenler:**
- `page_id`, `instagram_user_id`, `pixel_id`, `application_id`, `object_store_url`,
  `product_set_id` — hepsi Advetics'in kayıtlı varlıklarından seçilir.
- Para birimi çarpanı ve tutar birimi — hesap `currency`'sinden kod hesaplar; AI "500 TL" der,
  `50000`'i kod üretir.
- Minimum bütçe — hesaptan okunur.
- Özel reklam kategorisi — yasal beyan; AI sınıflandırma **önerebilir** ama karar kullanıcının
  "evet/hayır" cevabıyla verilir.
- DSA ödeyen/yararlanan — kullanıcı ya da hesap varsayılanından.
- Siyasi içerik beyanı (`authorization_category`).
- Bir `issues_info` mesajının çözümü — Meta'nın `error_message`'ı aynen gösterilmeli,
  AI yorumu ayrı işaretlenmeli.

**AI akışı önerisi:** (1) amaç ve bilgileri topla → (2) kapalı sözlükle taslak →
(3) `validate_only` + `synchronous_ad_review` → (4) hataları Meta'nın kendi mesajıyla göster →
(5) PAUSED kur → (6) `targetingsentencelines` + `previews` ile geri okuyup kullanıcıya göster →
(7) onayla ACTIVE.

---

## Panel kurgusu için çıkarımlar

**Acemi kullanıcıya sorulacaklar** (iş dilinde):
1. Ne istiyorsunuz? → "Daha çok kişi görsün" (Awareness/REACH) · "Siteme gelsin" (Traffic/
   LANDING_PAGE_VIEWS) · "Bana mesaj atsın" (WhatsApp / Messenger / Instagram — Engagement/
   CONVERSATIONS ya da Traffic/WHATSAPP) · "Form doldursun" (Leads/ON_AD) · "Beni arasın"
   (Leads/PHONE_CALL) · "Sitemden satış/kayıt" (Sales ya da Leads + piksel olayı) ·
   "Gönderimi öne çıkar" (Engagement/ON_POST).
2. Günlük ne kadar harcamak istersiniz? (hesap minimumu ve para birimiyle doğrulanır) ve
   ne zamana kadar? (bitişsiz seçeneği = `end_time=0`).
3. Nerede ve kime? (hedefleme bölümü).
4. Görsel/video, metin, bağlantı.
5. **Reklamınız konut, iş ilanı, kredi/finans, kumar/şans oyunu ya da siyaset/toplumsal
   konu ile ilgili mi?** — evet/hayır; bu soru otomatikleştirilemez.

**Otomatik kararlaştırılacaklar** (gönderilmezse platform varsayılanına kalacağı için
hepsi açıkça yazılmalı): `buying_type=AUCTION`, `bid_strategy=LOWEST_COST_WITHOUT_CAP`,
`billing_event=IMPRESSIONS`, `optimization_goal` ve `destination_type` (§9a), `promoted_object`,
`attribution_spec` (izinli en dar/varsayılan kombinasyon), `is_adset_budget_sharing_enabled=false`,
`special_ad_categories` (soru 5'ten), `status=PAUSED` + ayrı yayın adımı, `conversion_domain`
(bağlantıdan türet), `url_tags` (ajans UTM şablonu), `tracking_specs` (piksel/uygulama varsa).

**Giriş anında doğrulama** (kullanıcı yazarken): başlık/gövde uzunluk önerileri, noktalama ile
başlama, ardışık noktalama, yasak karakterler, 30 karakterlik kelime, URL ≤1.000, kreatif adı
≤100, ad set adı ≤400; bütçe ≥ hesap minimumu; ömür boyu bütçede bitiş tarihi; günlük bütçede
süre >24 saat; görsel dosya uzantısı. Sonra `validate_only` ile Meta'nın kendi doğrulaması.

**Durum ekranı:** her nesne için `effective_status`'un Türkçe karşılığı, `issues_info`
mesajları (Meta'nın metniyle), "öğreniyor" rozeti, inceleme reddinde `ad_review_feedback`,
hesap seviyesinde `account_status`/`disable_reason`/ödeme yöntemi eksikliği,
`targeting_optimization_types` varsa "Meta kitlenizi genişletiyor" notu,
`recurring_budget_semantics=true` ise "günlük harcama bütçeyi aşabilir, haftalık 7 katını
aşmaz" notu, son değişikliği yapan uygulama (`activities`/`last_updated_by_app_id`).

**Yalnızca Gelişmiş modda:** teklif stratejisi ve `bid_amount` / cost cap, CBO ↔ ad set
bütçesi, `attribution_spec` seçimi, `frequency_control_specs`, `adset_schedule` (yalnızca
ömür boyu bütçe), yüksek talep dönemleri (yalnızca günlük bütçe, yetki varsa), harcama alt/üst
sınırları (CBO), `optimization_sub_event`, dinamik kreatif (`is_dynamic_creative`),
`creative_sequence`, `platform_customizations`, `url_tags` düzenleme, kopyalama seçenekleri,
etiketler.

**Hiç gösterilmemeli / kapalı:** eski amaçlar, `RESERVED` alım tipi, `daily_imps`/`lifetime_imps`,
açıklaması olmayan alanlar (`cost_bidding_mode`, `campaign_optimization_type`,
`tune_for_category`, `budget_source` …), `ONSITE_CONVERSIONS`.

---

## Sayfa sayfa dizin

| Dosya | Kaynak URL | Tek satır özet | Önem |
|---|---|---|---|
| `marketing-api__reference__ad-account-user.md` | …/reference/ad-account-user | Hesap kullanıcısı: `id`, `name`, `tasks`; salt okunur. | Düşük |
| `marketing-api__reference__ad-account.md` | …/reference/ad-account | Hesap alanları (para birimi, saat dilimi, `min_daily_budget`, durum/kapanma nedeni, `spend_cap` birim tuzağı, ödeme yöntemi, DSA varsayılanları), limitler, `ads_volume`, kenarlar, güncelleme. | Yüksek |
| `marketing-api__reference__ad-activity.md` | …/reference/ad-activity | Değişiklik geçmişi düğümü: olay türleri, aktör ve uygulama alanları, varsayılan 1 hafta. | Yüksek |
| `marketing-api__reference__ad-campaign-group.md` | …/reference/ad-campaign-group | **Kampanya**: alanlar, oluşturma/güncelleme/silme, toplu silme, kopya, amaç doğrulama tabloları, attribution_spec, ODAX eşleme tablosu. | Yüksek |
| `marketing-api__reference__ad-campaign-group__ad_studies.md` | …/ad-campaign-group/ad_studies | Kampanyanın dahil olduğu çalışmalar (lift). | Düşük |
| `marketing-api__reference__ad-campaign-group__addrafts.md` | …/ad-campaign-group/addrafts | Kampanya taslakları listesi; alan tanımı yok. | Düşük |
| `marketing-api__reference__ad-campaign-group__adlabels.md` | …/ad-campaign-group/adlabels | Kampanyaya etiket ekleme (POST, `validate_only`). | Orta |
| `marketing-api__reference__ad-campaign-group__adrules_governed.md` | …/ad-campaign-group/adrules_governed | Kampanyayı yöneten Meta otomatik kuralları; `pass_evaluation`. | Düşük |
| `marketing-api__reference__ad-campaign-group__ads.md` | …/ad-campaign-group/ads | Kampanyadaki reklamlar; `effective_status`, `updated_since`, özet. | Orta |
| `marketing-api__reference__ad-campaign-group__adsets.md` | …/ad-campaign-group/adsets | Kampanyadaki ad set'ler; durum ve `is_completed` süzgeci, özet. | Orta |
| `marketing-api__reference__ad-campaign-group__budget_schedules.md` | …/ad-campaign-group/budget_schedules | Kampanya yüksek talep dönemi oluşturma/okuma; güncelleme/silme yok. | Orta |
| `marketing-api__reference__ad-campaign-group__copies.md` | …/ad-campaign-group/copies | Kampanya kopyalama: derin kopya sınırları, durum ve ad seçenekleri. | Orta |
| `marketing-api__reference__ad-campaign-group__insights.md` | …/ad-campaign-group/insights | Kampanya insights: parametreler tam, alan adları tam, açıklamalar seçici; ad set sayfasıyla neredeyse aynı. | Orta |
| `marketing-api__reference__ad-campaign-group__video_groups.md` | …/ad-campaign-group/video_groups | Kampanyada kullanılan video grupları; `date_range`. | Düşük |
| `marketing-api__reference__ad-campaign.md` | …/reference/ad-campaign | **Ad set**: alanlar, oluşturma parametreleri, min bütçe tabloları, DSA, işaretli kitleler, güncelleme kuralları, ODAX kısıt tablosu. | Yüksek |
| `marketing-api__reference__ad-campaign__activities.md` | …/ad-campaign/activities | Ad set/hesap değişiklik geçmişi kenarı; `since`/`until`/`category`/`business_id`. | Orta |
| `marketing-api__reference__ad-campaign__ad_studies.md` | …/ad-campaign/ad_studies | Ad set'in dahil olduğu çalışmalar. | Düşük |
| `marketing-api__reference__ad-campaign__adcreatives.md` | …/ad-campaign/adcreatives | Ad set kreatifleri; `total_count`. | Düşük |
| `marketing-api__reference__ad-campaign__addrafts.md` | …/ad-campaign/addrafts | Ad set taslakları; alan tanımı yok. | Düşük |
| `marketing-api__reference__ad-campaign__adrules_governed.md` | …/ad-campaign/adrules_governed | Ad set'i yöneten otomatik kurallar. | Düşük |
| `marketing-api__reference__ad-campaign__ads.md` | …/ad-campaign/ads | Ad set reklamları; süzgeç boşsa silinmiş/arşivli dönmez. | Orta |
| `marketing-api__reference__ad-campaign__asyncadrequests.md` | …/ad-campaign/asyncadrequests | Asenkron reklam isteklerinin durum listesi. | Düşük |
| `marketing-api__reference__ad-campaign__budget_schedules.md` | …/ad-campaign/budget_schedules | Ad set yüksek talep dönemi oluşturma/okuma. | Orta |
| `marketing-api__reference__ad-campaign__budget_split_set.md` | …/ad-campaign/budget_split_set | Boş sayfa: okuma/güncelleme/silme yok, oluşturma bölümü boş. | İlgisiz (boş) |
| `marketing-api__reference__ad-campaign__campaign_actions.md` | …/ad-campaign/campaign_actions | Ad set için "eyleme dönük içgörü" önerileri; alan tanımı yok. | Düşük |
| `marketing-api__reference__ad-campaign__copies.md` | …/ad-campaign/copies | Ad set kopyalama; bitmiş ad set kopyası hemen başlar; asenkron toplu kopya; DSA hataları. | Orta |
| `marketing-api__reference__ad-campaign__delivery_estimate.md` | …/ad-campaign/delivery_estimate | Ad set teslim tahmini; ezilebilir ayarlar; güvensizde sıfır eğri. | Orta |
| `marketing-api__reference__ad-campaign__delivery_stats.md` | …/ad-campaign/delivery_stats | Öğrenme aşaması ve teklif önerisi grupları. | Orta |
| `marketing-api__reference__ad-campaign__insights.md` | …/ad-campaign/insights | Ad set insights: parametreler tam (default atıf çelişkisi), tahmini/geliştirmede metrik notları; alan açıklamaları seçici. | Orta |
| `marketing-api__reference__ad-campaign__message_delivery_estimate.md` | …/ad-campaign/message_delivery_estimate | Pazarlama mesajı kampanyası teslim tahmini. | Düşük |
| `marketing-api__reference__ad-campaign__publisher_delivery_report.md` | …/ad-campaign/publisher_delivery_report | Yayıncı/konum bazında gösterim raporu (marka güvenliği). | Düşük |
| `marketing-api__reference__ad-campaign__targeting_insights.md` | …/ad-campaign/targeting_insights | Hedefleme içgörüleri listesi; alan tanımı yok. | Düşük |
| `marketing-api__reference__ad-campaign__targetingsentencelines.md` | …/ad-campaign/targetingsentencelines | Hedeflemenin insan dilinde cümleleri — geri okuma doğrulaması için. | Orta |
| `marketing-api__reference__ad-creative.md` | …/reference/ad-creative | **Kreatif**: alanlar, metin kuralları, örnekler (link, carousel, gönderi, ortaklık, siyasi), tekillik, yalnızca ad/durum güncellenir. | Yüksek |
| `marketing-api__reference__ad-creative__adlabels.md` | …/ad-creative/adlabels | Kreatife etiket ekleme (POST). | Düşük |
| `marketing-api__reference__ad-creative__creative_insights.md` | …/ad-creative/creative_insights | Kreatif içgörü kenarı; alan tanımı yok. | Düşük |
| `marketing-api__reference__ad-creative__previews.md` | …/ad-creative/previews | Önizleme: `ad_format` listesi, 24 saatlik iframe, CTA değer şeması, sayfasız link reklamı yasağı. | Orta |
| `marketing-api__reference__ad-image.md` | …/reference/ad-image | AdImage: yükleme, hesaplar arası kopya, geçici `url` vs kalıcı `permalink_url`, yalnızca kullanılmayan silinir. | Yüksek |
| `marketing-api__reference__ad-label.md` | …/reference/ad-label | Etiket oluşturma/bağlama/sorgu; ezme ve sessiz oluşturma davranışı; limitler. | Orta |
| `marketing-api__reference__ad-label__adcreatives.md` | …/ad-label/adcreatives | Etiketli kreatifler. | Düşük |
| `marketing-api__reference__ad-label__ads.md` | …/ad-label/ads | Etiketli reklamlar. | Düşük |
| `marketing-api__reference__ad-label__adsets.md` | …/ad-label/adsets | Etiketli ad set'ler. | Düşük |
| `marketing-api__reference__ad-label__campaigns.md` | …/ad-label/campaigns | Etiketli kampanyalar. | Düşük |
| `marketing-api__reference__ad-promoted-object.md` | …/reference/ad-promoted-object | promoted_object kuralları (değişmezlik, istisnalar, `conversion_specs` yok sayılır) ve alan listesi. | Yüksek |
| `marketing-api__reference__adgroup.md` | …/reference/adgroup | **Reklam**: alanlar, oluşturma (senkron/asenkron), inceleme akışı, güncelleme kısıtları, limitler, Sayfa etiketinin sessizce düşmesi. | Yüksek |
| `marketing-api__reference__high-demand-period.md` | …/reference/high-demand-period | Bütçe planlama: koşullar (yalnızca günlük bütçe, ≤8×, ≥3 saat, ≤50), alanlar, birim ve tekrar belirsizliği. | Orta |
