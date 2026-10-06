# 09 — Reklam hesabı, Business Manager ve varlıklar

> Kaynak: 221 sayfa (`_listeler/H2-hesap.txt`) · Okunan: 221/221 · Bilgi belgeden, canlıda doğrulanmadı.
>
> Okuma notu: 221 sayfanın ~190'ı aynı kalıpta "kenar" (edge) referans sayfası. Hepsinin başlık, açıklama, parametre, alan ve hata kodu tabloları okundu. En büyük beş sayfada (`ad-account/adcreatives`, `ad-account/insights`, `ad-account/adsets`, `ad-account/campaigns`, `business`) yüzlerce değerlik enum hücreleri (CTA tipleri, saat dilimi kimlikleri, insights alan listesi) kırpılarak okundu; bu alanların ayrıntısı F1/F2/E/H1 bölümlerinin konusu. 10 sayfanın gövdesi tamamen boş (yalnızca başlık; dizinde "ölü"), ~20 sayfada da bir işlem bölümü (çoğu "Creating") başlığıyla boş geliyor. Hesap durumu (`account_status`, `disable_reason`, `spend_cap`) bu grubun sayfalarında YOK: o alanlar `ad-account` düğüm sayfasında (C-referans grubu) duruyor. Soru doğrudan sorulduğu için bu bölümde o sayfadan da alıntı yapıldı ve öyle işaretlendi.

## Özet: Advetics için ne demek

1. **"Bu sayfa/IG/pixel için reklam verebilir miyim" sorusunun belgede TEK bir cevap ucu yok.** Cevap üç ayrı izin katmanının kesişimi: (a) kimliğin reklam hesabında `ADVERTISE` (ya da `MANAGE`) görevi, (b) kimliğin sayfada `ADVERTISE` görevi (Sayfa "Reklamveren" rolü = `ADVERTISE, ANALYZE, DRAFT`), (c) token kapsamı (`ads_management`, `pages_manage_ads`, `pages_show_list`; Business uçları için `business_management`). Panel uyarısı bu üçünü ayrı ayrı sorgulayıp hangisinin eksik olduğunu söylemeli; tek bir "izin yok" cümlesi teşhisi kaybettirir.
2. **Görevler (task) rollerin yerini aldı.** Reklam hesabında atanabilir görevler: `MANAGE`, `ADVERTISE`, `ANALYZE`, `DRAFT`, `AA_ANALYZE`. `ANALYZE` tek başına yalnızca rapor demek: Advetics'in izlediği hesapların bir kısmı bu seviyede olabilir ve o hesaplarda yazma yolu açılmamalı. Kontrol: `GET /act_{id}/assigned_users?business={ajans_bm}` (alan `tasks`) ya da `GET /{system-user-id}/assigned_ad_accounts` (alan `tasks`, `permitted_tasks`).
3. **Ajans görünümü `client_*` kenarlarında.** Ajans BM'inin müşteriden aldığı erişim `GET /{business-id}/client_ad_accounts`, `client_pages`, `client_pixels`, `client_instagram_accounts`, `client_product_catalogs` ile listeleniyor ve her satırda `permitted_tasks` geliyor. Ajans BM'ine paylaşılmış olmak, Advetics'in kullandığı KİMLİĞE atanmış olmak demek değil: ikinci adım `assigned_*` kenarlarıyla ayrıca doğrulanmalı.
4. **`client_ad_accounts` için kalıcı erişim riski:** sayfada "erişimi geçici olarak sınırlıyoruz; yalnızca son 30 günde bu ucu başarıyla çağırmış uygulamalar erişimi korur" notu var. Not "Creating" başlığının altında ama o bölüm boş; okuma için de geçerli olup olmadığı **belgede belirsiz**. Advetics bu ucu kullanacaksa en az 30 günde bir çağırmak güvenli taraf.
5. **Ödeme yöntemi olmayan hesapta reklam OLUŞTURULUYOR ama YAYINLANMIYOR** (`funding_source` ve `POST /{business_id}/adaccount` → `funding_id` açıklamaları). Hata yok. Yayın akışı `account_status` ve `funding_source` kontrolünü platform çağrısından ÖNCE yapmalı.
6. **Reklam hesabı durumu kod olarak geliyor** (`ad-account` düğümü, C-referans): `1 ACTIVE`, `2 DISABLED`, `3 UNSETTLED`, `7 PENDING_RISK_REVIEW`, `8 PENDING_SETTLEMENT`, `9 IN_GRACE_PERIOD`, `100 PENDING_CLOSURE`, `101 CLOSED`. `disable_reason` 0–15 arası ayrı bir sözlük. `spend_cap` = hesap harcama limiti (0 = limitsiz; yeni limit yalnızca KONDUĞU andan sonraki harcamaya uygulanıyor).
7. **Yayından önce doğrulama ucu var:** `POST /act_{id}/ads` → `execution_options=["validate_only","synchronous_ad_review"]` değişiklik yapmadan doğrulama ve reklam bütünlük incelemesini (metin, görsel kuralları) koşturuyor; `validate_only` kampanya, ad set ve kreatif uçlarında da var. AI'ın "yayına hazır mı" aracı bunun üstüne kurulmalı.
8. **`deprecatedtargetingadsets` sessiz durmaların tek habercisi.** `type=delivery_paused` hedeflemesi kalkan bir özellik yüzünden yayını DURDURULMUŞ ad set'leri veriyor; `type=deprecating` yakında duracakları. Bunu kimse çağırmazsa kampanya "aktif" görünüp harcamaz.
9. **`activities` hesabın değişiklik günlüğü.** Advetics dışından (Ads Manager, MCP) yapılan bütçe/durum değişikliklerini görmek için doğru kaynak; kural motoru eski rakamla karar vermeden önce bakılmalı.
10. **Görsel kitaplığı hesaba bağlı ama kopyalanabiliyor:** `POST /act_{id}/adimages` → `copy_from {source_account_id, hash}`. Business seviyesinde ayrıca paylaşılan bir kreatif kitaplığı var (`/{business-id}/images`, `/videos`, `/creative_folders`).
11. **Özel kitle oluşturmak için hesabın Özel Kitle Şartları'nı kabul etmiş olması gerekiyor** (`customaudiencestos`) ve hesap başına en fazla **500 özel kitle** var. Şartları API'den kabul etmek mümkün (`POST /act_{id}/customaudiencestos`) ama bu, müşteri adına hukuki onay; AI ve otomasyon asla yapmamalı.
12. **Business Manager yazma uçlarının çoğu ajans için YIKICI ya da gereksiz** (BM oluşturma, varlık sahiplenme, ajans/müşteri ilişkisini koparma). Advetics bu grubu neredeyse yalnızca OKUMA için kullanmalı.

## Kavramlar, kurallar ve alanlar

### Varlık sahipliği: `owned_*` / `client_*` / `pending_*` / `assigned_*`

| Kenar ailesi | Anlamı | Ajans için |
|---|---|---|
| `owned_ad_accounts`, `owned_pages`, `owned_pixels`, `owned_instagram_accounts`, `owned_instagram_assets`, `owned_product_catalogs`, `owned_apps`, `owned_custom_conversions`, `owned_whatsapp_business_accounts`, `owned_domains`, `owned_businesses`, `owned_publisher_block_lists` | BM'in SAHİBİ olduğu varlıklar | Ajansın kendi varlıkları; müşteri varlıkları burada GÖRÜNMEZ |
| `client_ad_accounts`, `client_pages`, `client_pixels`, `client_instagram_accounts`, `client_instagram_assets`, `client_product_catalogs`, `client_apps`, `client_whatsapp_business_accounts`, `client_publisher_block_lists`, `client_business_asset_groups`, `client_offsite_signal_container_business_objects`, `client_objects` | Müşterinin sahip olduğu, ajans BM'ine erişim verdiği varlıklar; satırda `permitted_tasks` | Havuzun gerçek kaynağı |
| `pending_client_ad_accounts`, `pending_client_pages`, `pending_client_apps`, `pending_owned_ad_accounts`, `pending_owned_pages`, `pending_shared_pixels`, `pending_offline_conversion_data_sets`, `pending_users`, `pending_shared_offsite_signal_container_business_objects` | İstenmiş ama ONAYLANMAMIŞ erişim/sahiplik | Panelde "müşteri onayı bekleniyor" durumu |
| `assigned_ad_accounts`, `assigned_pages`, `assigned_ads_pixels`, `assigned_instagram_accounts`, `assigned_product_catalogs`, `assigned_apps`, `assigned_business_asset_groups`, `assigned_creative_folders`, `assigned_offline_conversion_data_sets`, `assigned_whatsapp_business_accounts`, `assigned_monetization_properties` (iş kullanıcısı ve sistem kullanıcısı altında) | KİŞİYE/sistem kullanıcısına atanmış varlıklar; satırda `tasks` (+ çoğunda `permitted_tasks`) | Advetics'in kimliği gerçekte ne yapabilir |
| `clients` / `agencies` / `partners` / `partner_relationships` | BM'ler arası ilişki; `clients`/`agencies` satırında `adaccount_permissions`, `page_permissions`, `application_permissions`, `productcatalog_permissions`, `shared_ca_count` | Müşteri listesi ve hangi varlık türünün paylaşıldığı |

- `client_objects` tek uçta bütün müşteri varlıklarını `type` süzgeciyle (`page`, `ad-account`, `pixel`, `instagram-account`, `instagram-account-v2`, …) ve `owner_biz_id` ile veriyor; satırda `permitted_tasks`.
- `client_product_catalogs` ve `assigned_product_catalogs` görev değil ROL (`permitted_roles`) ve `access_type` (sahip mi ajans mı) döndürüyor; kataloğun izin modeli diğerlerinden farklı.
- `offline_conversion_data_sets` (business) satırında `access_type` = `OWNER` ya da `AGENCY` açıkça yazıyor; diğer kenarlarda bu ayrım yok, sahiplik kenarın adından anlaşılıyor.
- `business_asset_groups` (varlık grupları): bir kullanıcıya grup halinde izin vermek mümkün; grup satırında varlık türüne göre ayrı görev listeleri var (`adaccount_tasks`, `page_tasks`, `pixel_tasks`, `offline_conversion_data_set_tasks`). Yani bir kimliğin bir varlıktaki yetkisi DOĞRUDAN atamadan değil GRUP üyeliğinden de gelebilir: yalnızca `assigned_pages`'e bakan kontrol yanlış "izin yok" diyebilir. `assigned_business_asset_groups?contained_asset_id={varlık}` bunu soruyor.

### Görev (task) sözlükleri

**Reklam hesabı** (`assigned_users` → `tasks` enum): `MANAGE`, `ADVERTISE`, `ANALYZE`, `DRAFT`, `AA_ANALYZE`.

| Eski rol | Görev karşılığı | Ne yapabilir |
|---|---|---|
| `ADMIN` | `MANAGE, ADVERTISE, ANALYZE` | Kampanya, rapor, fatura ve hesap izinleri |
| `GENERAL_USER` | `ADVERTISE, ANALYZE` | Hesabın ödeme yöntemiyle reklam oluşturma + rapor |
| `GENERAL_USER` (yalnız rapor) | `ANALYZE` | Yalnızca rapor |

**Sayfa** (aynı sayfadaki eşleme tablosu; rol → görev):

| Sayfa rolü | Görevler |
|---|---|
| `MANAGER` | `MANAGE, CREATE_CONTENT, MODERATE, ADVERTISE, ANALYZE, DRAFT` |
| `CONTENT_CREATOR` | `CREATE_CONTENT, MODERATE, ADVERTISE, ANALYZE, DRAFT` |
| `MODERATOR` | `MODERATE, ADVERTISE, ANALYZE, DRAFT` |
| `ADVERTISER` | `ADVERTISE, ANALYZE, DRAFT` |
| `INSIGHTS_ANALYST` | `ANALYZE, DRAFT` |
| `CREATIVE_HUB_MOCKUPS_MANAGER` | `DRAFT` |

Sayfa görevlerinin tam enum'u (`owned_businesses` → `page_permitted_tasks`): `MANAGE, CREATE_CONTENT, MODERATE, MESSAGING, ADVERTISE, ANALYZE, MODERATE_COMMUNITY, MANAGE_JOBS, PAGES_MESSAGING, PAGES_MESSAGING_SUBSCRIPTIONS, READ_PAGE_MAILBOXES, VIEW_MONETIZATION_INSIGHTS, MANAGE_LEADS, PROFILE_PLUS_*` …. **Sayfada reklam için gereken görev `ADVERTISE`**; `MANAGE_LEADS` ayrı (form yanıtlarını okumak ADVERTISE ile gelmiyor). Rol modelinin "ileride kaldırılacağı" yazıyor, tarih yok.

**Business kullanıcı rolleri** (`business_users`, `system_users`, `business-role-request` → `role` enum): `ADMIN`, `EMPLOYEE`, `DEVELOPER`, `FINANCE_EDITOR`, `FINANCE_ANALYST`, `ADS_RIGHTS_REVIEWER`, `PARTNER_CENTER_*` (5 adet), `MANAGE`, `DEFAULT`, `FINANCE_EDIT`, `FINANCE_VIEW`. `business_users` listesindeki `role` alanı YALNIZCA temel rolü (Admin / Employee) gösteriyor; finans ve "ads rights" rolleri `finance_permission` ve `ip_permission` alanlarında ayrı.

**Instagram**: atanan IG hesaplarında görev değil `permitted_roles` geliyor (`assigned_instagram_accounts`); IG için görev adları bu grupta **belgelenmemiş**.

### Sistem kullanıcısı ve token

- Sistem kullanıcısı: `POST /{business_id}/system_users` (`name` zorunlu, `role` opsiyonel). BM'de en az bir uygulama yoksa oluşturulamıyor (`104001`); BM başına sistem kullanıcısı ve admin sistem kullanıcısı sınırı var (`3949`, `3965`; sayı belgede yok).
- Token: `POST /{business_id}/system_user_access_tokens` → parametreler `system_user_id`, `scope` (izin listesi), `asset` (varlık kimlikleri dizisi), `fetch_only`, `set_token_expires_in_60_days`. Dönüş `access_token`. **`set_token_expires_in_60_days` parametresinin varlığı varsayılan tokenın süresiz olduğunu düşündürüyor ama belgede açıkça yazmıyor** (belgede belirsiz). Hatalı izin adı `3962`.
- Bu uçlar "uygulama yalnızca kendisini SAHİPLENMİŞ BM'leri (ve onların alt BM'lerini) hedefleyebilir" kısıtına tabi (`business_users`, `system_users` oluşturma uyarısı; `business-user` düğümü v10 notu). Yani **Advetics müşterinin BM'inde sistem kullanıcısı açamaz**; sistem kullanıcısı ajans BM'inde yaşar ve müşteri varlıkları ona ajans BM'i üzerinden atanır.
- Sistem kullanıcısı düğümü (`system-user`): `id`, `name`, `created_by`, `created_time`, `finance_permission`, `ip_permission`; kenarlar `assigned_*`.
- `user_tos_accepted` (ad-account düğümü) sistem kullanıcısı için GEÇERSİZ; şart kabulü sistem kullanıcısı tokenıyla doğrulanamıyor.

### Rol istekleri (davetler)

- `business-role-request` düğümü: `email`, `role`, `status` (kabul/ret/süresi doldu…), `expiration_time`, `invited_user_type` (`FB` varsayılan, `MWA` = kurum yönetimli Meta hesabı), `finance_role`. Güncelleme yalnızca `role`; silme = daveti geri çekme.
- `assigned_owned_assets` / `assigned_client_assets`: davete önceden bağlanmış varlıklar, `asset_type` süzgeci ve `permitted_roles`/`permitted_tasks`.
- `pending_users`: kabul edilmemiş davetler.

### Reklam hesabı durumu ve ödeme (kaynak: `ad-account` düğümü, C-referans grubu)

| Alan | Değer / anlam |
|---|---|
| `account_status` | `1 ACTIVE`, `2 DISABLED`, `3 UNSETTLED` (ödenmemiş bakiye), `7 PENDING_RISK_REVIEW`, `8 PENDING_SETTLEMENT`, `9 IN_GRACE_PERIOD`, `100 PENDING_CLOSURE`, `101 CLOSED`, `201 ANY_ACTIVE`, `202 ANY_CLOSED` (son ikisi süzgeç değeri) |
| `disable_reason` | `0 NONE`, `1 ADS_INTEGRITY_POLICY`, `2 ADS_IP_REVIEW`, `3 RISK_PAYMENT`, `4 GRAY_ACCOUNT_SHUT_DOWN`, `5 ADS_AFC_REVIEW`, `6 BUSINESS_INTEGRITY_RAR`, `7 PERMANENT_CLOSE`, `8 UNUSED_RESELLER_ACCOUNT`, `9 UNUSED_ACCOUNT`, `10 UMBRELLA_AD_ACCOUNT`, `11 BUSINESS_MANAGER_INTEGRITY_POLICY`, `12 MISREPRESENTED_AD_ACCOUNT`, `13 AOAB_DESHARE_LEGAL_ENTITY`, `14 CTX_THREAD_REVIEW`, `15 COMPROMISED_AD_ACCOUNT` |
| `spend_cap` / `amount_spent` | Hesap harcama limiti ve ona göre harcanan; `0` = limitsiz; para biriminin alt birimi (kuruş) |
| `balance` | Ödenecek fatura tutarı |
| `funding_source`, `funding_source_details` | Ödeme yöntemi; hesap kapalıysa gelmiyor |
| `is_prepay_account` | Ön ödemeli mi; okumak için `ADVERTISE` ya da `MANAGE` görevi gerekiyor |
| `min_daily_budget`, `min_campaign_group_spend_cap` | Hesabın asgari günlük bütçesi; kampanya harcama limiti alt sınırı |
| `tos_accepted`, `user_tos_accepted` | Şart sözleşmeleri |
| `failed_delivery_checks` | Başarısız yayın kontrolleri |
| `default_dsa_payor`, `default_dsa_beneficiary` | AB DSA alanlarının hesap varsayılanı |

Bu gruptaki ilgili kenarlar: `direct_debits`, `prepay_fund`, `tax_info` (üçünün de gövdesi boş — belgesiz); `business_invoices` (yalnızca kredi hattıyla faturalanan BM'lerin aylık faturaları; `type` = `INV`, `CM`, `DM`, `PRO_FORMA`; varsayılan aralık son 6 ay; `start_date` DIŞLAYICI, `end_date` dışlayıcı); `extendedcredits` (BM kredi hatları); `finance_permissions`. Kartla ödeyen hesapların makbuzları bu uçlardan **gelmiyor** (belgede geçmiyor).

### Hesap seviyesi kısıtlar (`account_controls`)

`POST /act_{id}/account_controls` hesabın BÜTÜN kampanyalarına uygulanan sınırlar koyuyor (`AdAccountBusinessConstraints`):
- `audience_controls` (zorunlu): `age_min`, `geo_locations`, `excluded_geo_locations`, `exclusions`.
- `placement_controls.placement_exclusions`: yalnızca beş yerleşim dışlanabiliyor — `AUDIENCE_NETWORK_CLASSIC`, `AUDIENCE_NETWORK_REWARDED_VIDEO`, `AUDIENCE_NETWORK_INSTREAM_VIDEO`, `FACEBOOK_MARKETPLACE`, `FACEBOOK_RIGHT_HAND_COLUMN`.
- `campaign_ids_to_set_ap` (açıklaması yok).
Dönüşte `success` + `error_code` + `error_message` alanları birlikte geliyor: HTTP başarılı olup `success=false` dönebilir (belgede bu durum anlatılmıyor). Bu ayarlar Advantage+ kitle/yerleşim genişlemesinin hesap seviyesindeki frenidir; okuyup panelde göstermek gerekir, çünkü ad set'te seçilmeyen bir kısıt burada uygulanıyor olabilir.

### Reklam oluşturmada kullanılan reklam hesabı kenarları

| Kenar | Ne döndürüyor / ne yapıyor | Advetics'te nerede |
|---|---|---|
| `adimages` | `AdImage` listesi; süzgeç `hashes`, `name`, `minwidth/minheight`, `business_id`. POST: `bytes` (base64) ya da `copy_from {source_account_id, hash}`; dönüş `hash`, `url`, `url_128`, `url_256`, boyutlar. DELETE: `hash` (zorunlu) | Görsel yükleme; hesaplar arası kopya; `image_hash` önbelleği |
| `advideos` | Video listesi (en-boy, süre, boyut süzgeçleri). POST: `source` / `file_url` / parçalı yükleme (`upload_phase` = `start/transfer/finish/cancel`, `upload_session_id`, `start_offset`, `end_offset`, `video_file_chunk`, `file_size`); `source_instagram_media_id` ile IG videosunu içe alma (`upload_phase` ile birlikte kullanılamaz); `title` < 255 karakter | Video yükleme; büyük dosyada parçalı yol |
| `adcreatives` | Kreatif listesi + oluşturma (alanlar F1/F2'de). Bu sayfadaki kritik kurallar Tuzaklar'da | Kreatif üretimi |
| `generatepreviews` | Kreatif spec + `ad_format` → iframe önizleme; iframe **24 saat** geçerli; `width/height` yalnızca iframe'i boyutlandırıyor | Panelde ve AI onay ekranında "böyle görünecek" |
| `ads`, `adsets`, `campaigns` | Liste + oluşturma (ayrıntı E/A bölümlerinde) | Yayın yolu |
| `customaudiences` | Özel kitle listesi (`fields` verilmezse YALNIZCA kimlik döner; `pixel_id`, `filtering` süzgeci); oluşturma boş kitle + `users` kenarı; hesap başına en fazla 500 | Kitle seçici |
| `customaudiencestos` | Hesabın kabul ettiği kitle şartları; POST `tos_id` ile kabul | Kitle oluşturmadan önce kontrol |
| `saved_audiences` | Kayıtlı kitleler (varsayılan yalnız kimlik) | Gelişmiş mod |
| `product_audiences` | Katalog ürün setine dayalı kitle oluşturma (`product_set_id`, `inclusions/exclusions` retention ile) | Katalog (G grubu) |
| `reachestimate` | Hedefleme spec'ine göre kitle büyüklüğü aralığı `users_lower_bound` / `users_upper_bound`; özel kitlede kullanılamıyorsa **-1** | "Kitle büyüklüğü" göstergesi |
| `delivery_estimate` | `optimization_goal` + `targeting_spec` (+ `promoted_object`) → günlük sonuç tahmini ve kitle büyüklüğü; pasif benzer kitlede çalışmıyor | Bütçe/sonuç tahmini |
| `message_delivery_estimate` | Pazarlama mesajı kampanyası için tahmin | İlgisiz (şimdilik) |
| `minimum_budgets` | Açık artırma ad set'i için para birimine göre asgari günlük bütçe; manuel teklifte `bid_amount` verilir | Bütçe alanının giriş anında doğrulanması |
| `targetingsearch` | `q` (zorunlu) ile birleşik hedefleme araması; `limit_type`, `objective`, `regulated_categories`, `allow_only_fat_head_interests` (yalnız önceden incelenmiş ilgi alanları), `app_store` | İlgi alanı/demografi arama |
| `targetingbrowse` | Bütün hedefleme ağacı düz liste (`parent` ile ağaç kurulur); `limit_type`, `regulated_categories` | Gelişmiş modda ağaçtan seçim |
| `targetingsuggestions` | Verilen ilgi alanı/davranış listesine benzer öneriler | AI kitle önerisi |
| `targetingvalidation` | `id_list` / `name_list` / `targeting_list` doğrulama; `is_exclusion` | Kayıtlı kitlelerin hâlâ geçerli olduğunu kontrol |
| `broadtargetingcategories` | Geniş hedefleme kategorileri | Düşük |
| `deprecatedtargetingadsets` | Kalkan hedefleme yüzünden etkilenen ad set'ler; `type` = `deprecating` (varsayılan) / `delivery_paused` | Sağlık ekranı; uyarı |
| `promote_pages` | Hesabın reklamını verebileceği sayfalar; `pages_show_list` + `pages_manage_ads` gerektiriyor | Sayfa seçici; "reklam veremezsin" ön kontrolü |
| `instagram_accounts` | Hesapla ilişkili IG hesapları (`IGUser`), `total_count`; IG oran sınırı `80002` | IG kimliği seçici |
| `connected_instagram_accounts` | Aynı tanım ("bu hesapla ilişkili IG hesapları"), `IGUser` | İkisinin farkı **belgede belirsiz** |
| `adspixels` | Hesabın pixel'leri; POST yeni pixel (`name`) — hesapta zaten pixel varsa `6200`/`6202` | Dönüşüm hedefi seçici |
| `customconversions` | Özel dönüşümler; POST `name` (zorunlu), `event_source_id`, `rule`, `custom_event_type`, `default_conversion_value` (varsayılan 0), `action_source_type` | Dönüşüm hedefi |
| `offline_conversion_data_sets` | Hesaba bağlı çevrim dışı setler; `auto_track_for_ads` | Düşük |
| `mcmeconversions` | MCME dönüşümleri | Düşük |
| `adrules_library` | Otomatik kurallar (`evaluation_spec`, `execution_spec`, `schedule_spec`, `status`) | Advetics'in kendi kural motoruyla çakışma riski |
| `active_adrules`, `adrules_count_by_type` | Seçili nesnelerde etkin kurallar; durum başına sayı | Çakışma kontrolü |
| `activities` | Hesap etkinlik günlüğü (`AdActivity`) | Dış değişiklik tespiti |
| `adlabels` | Etiket listesi + oluşturma (`name`) | Advetics'in kurduğu nesneleri işaretlemek |
| `addrafts` | Ads Manager taslakları | Düşük |
| `async_batch_requests`, `asyncadrequestsets`, `asyncadcreatives` | Toplu/asenkron oluşturma işleri; `notification_mode` = `OFF` / `ON_COMPLETE`, `notification_uri` | Toplu işlem (ileride) |
| `dsa_recommendations` | AB DSA için olası "yararlanıcı/ödeyen" dizeleri; DOĞRULUĞU GARANTİ DEĞİL | AB hedeflemesinde form ön doldurma |
| `applied_publisher_block_lists`, `publisher_block_lists` | Yayıncı engel listeleri (hesap + üst BM); `is_auto_blocking_on` | Marka güvenliği (Gelişmiş) |
| `tracking` | Hesap seviyesi `tracking_specs` okuma/ekleme | Dikkat: hesap geneli |
| `subscribed_apps` | Hesaba abone uygulamalar; POST/DELETE `app_id` | Webhook aboneliği gerekiyorsa |
| `agencies` | Hesaba erişen ajans BM'leri; satırda `access_status`, `access_requested_time`, `permitted_tasks`; DELETE ajans erişimini kaldırır | Ajansın görevlerini hesaptan doğrulama |
| `assigned_users`, `users` | Hesaba atanmış iş/sistem kullanıcıları ve görevleri; POST/DELETE atama | İzin teşhisi |
| `website_creative_assets`, `website_creative_info`, `urls_for_asset_extraction` | Bir URL'den otomatik çıkarılan metin/görsel/video önerileri; hesabın önerilen URL'leri | AI'ın müşteri sitesinden kreatif taslağı |
| `suggested_ads`, `smart_suggested_ads` | Meta'nın önerdiği reklam/kurgu (`use_case`, `objective`, `optimization_goal`) | Düşük; AI için ilham kaynağı |
| `campaign_attribution_options`, `optimization_goals_aemv2_eligibility` | Uygulama (`app_id`) için atıf seçenekleri ve AEM v2 uygunluğu | Uygulama reklamı yoksa ilgisiz |
| `reachfrequencypredictions` | Erişim-sıklık (rezervasyonlu) tahmini; `stop_time` ≤ 8 hafta, en az ~1.000.000 erişim, tek ülke | İlgisiz (acemi kullanıcı) |
| `insights` | Rapor (H1/E bölümleri) | Raporlama |
| `reporting`, `ad_custom_derived_metrics`, `ads_reporting_mmm_*`, `naming_templates`, `ad_column_sizes`, `start_your_day_widgets`, `site_links`, `proposals`, `impacting_ad_studies`, `collaborative_ads_partner_businesses`, `aaa_compatible_ad_objects`, `ad_place_page_sets`, `adplayables`, `applications`, `youth_ads_advertiser` | Ads Manager iç özellikleri, rapor oluşturucu, yerel/oyun/uygulama özel uçları | Düşük / ilgisiz |

**Bu grupta OLMAYAN ama brief'te istenen kenarlar:** `leadgen_forms`, `ads_volume`, `advertisable_applications`. Bunlar başka grupların sayfalarında (ör. `marketing-api__insights-api__ads-volume.md`); burada yalnızca yokluğu not edildi.

### Business düğümü

- Alanlar: `id`, `name`, `verification_status` (`expired, failed, ineligible, not_verified, pending, pending_need_more_info, pending_submission, rejected, revoked, verified`), `two_factor_type` (`none`, `admin_required`, `all_required`), `primary_page`, `timezone_id`, `vertical`, `payment_account_id`, `created_by`, `is_hidden`.
- BM oluşturma: `POST /{user_id}/businesses` (`name`, `vertical` zorunlu) ve alt BM: `POST /{business_id}/owned_businesses` (`name`, `shared_page_id`, `page_permitted_tasks`, `timezone_id`). Uygulama incelemesinde `BUSINESS_MANAGEMENT` alınmadan geliştirme modunda yalnızca **2 alt BM**. Alt BM silmek için kredi hattındaki bütün hesapların başka ödeme yöntemine geçmiş ve faturaların ödenmiş olması gerekiyor.
- Reklam hesabı açma: `POST /{business_id}/adaccount` — zorunlu `name`, `currency`, `timezone_id`, `end_advertiser`, `media_agency`, `partner`. `end_advertiser` bir kez `NONE`/`UNFOUND` dışı bir değere ayarlanınca DEĞİŞTİRİLEMİYOR. Sınır aşımı `3979`; BM'deki herhangi bir hesap kötü durumdaysa yeni hesap açılamıyor (`3980`).
- Sahiplenme: `POST /{business_id}/owned_ad_accounts` (`adaccount_id`), `POST /{business_id}/owned_pages` (`page_id`; sayfa admini olmak gerekiyor `3977`; başka BM'in sayfasıysa `3918` — "erişim iste, sahiplenme"). Ajans müşterinin varlığını SAHİPLENMEMELİ.
- İlişki koparma (DELETE): `/{business_id}/agencies`, `/{business_id}/clients`, `/{business_id}/pages`, `/{business_id}/instagram_accounts`, `/{business_id}/ad_accounts`, `/act_{id}/agencies`, `/{instagram_business_asset_id}/agencies`, `/{user_id}/businesses`, `/{business_id}/owned_businesses`. Hepsi geri alınması müşteriye bağlı işlemler.
- Ajansın müşterinin varlığına erişim İSTEMESİNİ sağlayan POST gövdeleri bu grupta **belgelenmemiş** (`client_ad_accounts` ve `client_pages` "Creating" bölümleri boş). Erişim isteği akışı belgeden kurulamaz.

### Pixel paylaşımı (2024 değişikliği)

`assigned_ad_accounts`, `client_ad_accounts`, `owned_ad_accounts` sayfalarındaki uyarı: **Eylül 2024 sonundan itibaren `POST /{pixel-id}/shared_accounts`, bir BM hem pixel'e hem reklam hesabına erişemiyorsa pixel'i o hesaba paylaşmıyor.** Doğru sıra: önce `POST /{pixel-id}/agencies` (ya da `POST /act_{id}/agencies`) ile varlığı BM'e paylaş, sonra `POST /{pixel-id}/shared_accounts` ile pixel'i hesaba bağla. Ajans için anlamı: müşterinin pixel'i ajans BM'ine paylaşılmadan, müşterinin reklam hesabında o pixel'le dönüşüm kampanyası kurulamayabilir.

## API çağrıları

```http
# 1) Ajans kimliğinin bir reklam hesabındaki görevleri
GET /v25.0/act_{id}/assigned_users?business={ajans_bm_id}&fields=id,name,tasks
GET /v25.0/{system_user_id}/assigned_ad_accounts?fields=account_id,name,account_status,tasks

# 2) Kimliğin sayfa görevleri (doğrudan + grup üzerinden)
GET /v25.0/{system_user_id}/assigned_pages?fields=id,name,tasks
GET /v25.0/{system_user_id}/assigned_business_asset_groups?contained_asset_id={page_id}
#    → page_tasks / adaccount_tasks / pixel_tasks

# 3) Hesabın reklam verebileceği sayfalar ve IG hesapları
GET /v25.0/act_{id}/promote_pages?fields=id,name
GET /v25.0/act_{id}/instagram_accounts
GET /v25.0/act_{id}/connected_instagram_accounts

# 4) Ajans BM'ine müşteriden gelen varlıklar ve onay bekleyenler
GET /v25.0/{ajans_bm_id}/client_ad_accounts?fields=account_id,name,permitted_tasks
GET /v25.0/{ajans_bm_id}/client_pages?fields=id,name,permitted_tasks
GET /v25.0/{ajans_bm_id}/client_pixels?fields=id,name,permitted_tasks
GET /v25.0/{ajans_bm_id}/pending_client_ad_accounts
GET /v25.0/{ajans_bm_id}/clients?fields=id,name,adaccount_permissions,page_permissions

# 5) Hesabın ajanslarını hesaptan sorma
GET /v25.0/act_{id}/agencies   # access_status, permitted_tasks

# 6) Yayın öncesi kuru doğrulama
POST /v25.0/act_{id}/ads
  name=…&adset_id=…&creative={"creative_id":"…"}&status=PAUSED
  &execution_options=["validate_only","synchronous_ad_review"]
# geçerse {"success": true}, geçmezse ayrıntılı hata

# 7) Bütçe ve kitle göstergeleri
GET /v25.0/act_{id}/minimum_budgets
GET /v25.0/act_{id}/reachestimate?targeting_spec={…}
GET /v25.0/act_{id}/delivery_estimate?optimization_goal=LINK_CLICKS&targeting_spec={…}

# 8) Görseli başka hesaba kopyalama
POST /v25.0/act_{hedef}/adimages
  copy_from={"source_account_id":"{kaynak}","hash":"{hash}"}

# 9) Sessiz durma ve dış değişiklik taraması
GET /v25.0/act_{id}/deprecatedtargetingadsets?type=delivery_paused
GET /v25.0/act_{id}/activities

# 10) Sistem kullanıcısı tokenı (ajans BM'inde)
POST /v25.0/{ajans_bm_id}/system_user_access_tokens
  system_user_id=…&scope=ads_management,pages_manage_ads,…&asset=[…]
```

### Hata kodları sözlüğü (bu gruptan; panel mesajına çevrilecek)

| Kod | Anlam | Panel karşılığı |
|---|---|---|
| `200` | İzin hatası (genel) | Hangi varlıkta hangi görevin eksik olduğunu ayrıca sor; bu kod tek başına teşhis değil |
| `283` | `pages_read_engagement` / `pages_read_user_content` / `pages_manage_ads` / `pages_manage_metadata` izinlerinden biri eksik | "Bağlantının sayfa reklam izni yok, yeniden yetkilendir" |
| `270` | Ads API isteği geliştirme erişim seviyesindeki uygulamaya kapalı; token sahibi hem uygulamanın hem reklam hesabının admini olmalı | Kurulum hatası (uygulama seviyesi) |
| `190` | Geçersiz token | Bağlantıyı yenile |
| `415` | İki adımlı doğrulama gerekiyor (2FA korumalı BM'in varlığı) | "Müşterinin BM'i 2FA istiyor" |
| `368` | Kötüye kullanım / izin verilmeyen işlem | Platformun mesajını aynen göster |
| `2635` | Eski API sürümü | Kod hatası |
| `2641` | Kısıtlı lokasyon dahil/hariç | Lokasyon seçimini kısıtla |
| `80004` / `80003` / `80002` / `613` | Hesap / özel kitle / IG / genel oran sınırı | Kuyruk geri çekilmesi |
| `2616` | Rapor çok fazla satır; aralığı daralt | Parçala |
| `3018` | Başlangıç 37 aydan eski | Aralığı kısıtla |
| `3944` | BM bu nesneye zaten erişiyor | Bilgi |
| `3977` | Sayfayı sahiplenmek için sayfa admini olmak gerekir | — |
| `3918` | Sayfa başka BM'in; erişim iste | — |
| `3982` | Varlığı bu BM'e almak için yetki yetersiz | — |
| `3979` / `3980` | Hesap sayısı sınırı / BM'de kötü durumda hesap var | Hesap açma |
| `3914` | Son admin kaldırılamaz | — |
| `42001` | Sayfa IG işletme profiline bağlı, BM'den kaldırılamaz | — |
| `6200` / `6202` | Hesapta zaten pixel var / birden çok pixel var | Pixel oluşturma |
| `2703` | Reklam KAPATAN kural maliyet koşulu taşıyamaz | Kural kurucu |
| `1404163` | Reklam erişimi kısıtlı (hesap/kişi seviyesi yaptırım) | "Bu kimlik reklam veremez" |
| `1690111` | Ödeme hesabı devre dışı | Ödeme |
| `104001` | Sistem kullanıcısı için BM'de uygulama yok | Kurulum |

**Belgede OLMAYAN:** "bu reklam hesabıyla bu sayfa için reklam veremezsin" durumunun özel bir kodu. Bu gruptaki sayfalar yalnızca genel `200`/`283` veriyor; kreatif oluştururken sayfa yetkisi eksikse hangi kod/subcode döndüğü **belgede belirsiz**. Uyarı bu yüzden HATA beklenerek değil, yukarıdaki okuma uçlarıyla ÖNDEN kurulmalı.

## Tuzaklar ve sessiz hata riskleri

- **Ödeme yöntemi yoksa reklam oluşur, yayınlanmaz.** Hata yok, durum "aktif" görünebilir. → Yayın öncesi `funding_source` ve `account_status == 1` kontrolü.
- **`object_story_id` zaten bir kreatifte kullanılıyorsa YENİ kreatif oluşmuyor; var olanın `creative_id`'si dönüyor** (`adcreatives` Limitations). Advetics yeni kreatif yazdığını sanıp eski kreatifin adını/etiketini görür; aynı gönderiden iki farklı kreatif (farklı CTA/URL) kurulamaz.
- **`object_story_spec` ya da `object_story_id` verilince `image_file` ve `image_hash` YOK SAYILIYOR.** Hata yok.
- **Ad set'te yalnızca `bid_amount` verilirse `bid_strategy` sessizce `LOWEST_COST_WITH_BID_CAP` (manuel tavan) oluyor.** Teklif tavanı istemeyen kullanıcının reklamı düşük tavan yüzünden az yayınlanır. → `bid_strategy` HER ZAMAN açıkça yazılmalı.
- **`targeting` için "countries zorunlu" yazıyor** (`adsets`, `reachestimate`). Canlı bilgi (madde 2) şehir seçilince ülkenin GÖNDERİLMEMESİ gerektiğini söylüyor. Belge ile canlı bilgi çelişiyor; canlı bilgi esas, belgedeki cümle "geo_locations zorunlu" olarak okunmalı (belgede belirsiz).
- **`reachestimate` özel kitlede tahmin yoksa `-1` döndürüyor**; bu "kitle boş" ya da "yayın engellenir" demek değil. -1 sıfır ya da hata gibi gösterilmemeli.
- **`campaigns` listesi süzgeçsiz çağrılınca arşivlenmiş/silinmiş kampanyaları DÖNDÜRMÜYOR.** Senkronizasyon tamlık iddia ediyorsa `effective_status` açıkça verilmeli.
- **`customaudiences` ve `saved_audiences` `fields` verilmezse yalnızca kimlik döndürüyor**; ad/büyüklük boş gelir ve "kitlenin adı yok" sanılır.
- **Insights varsayılanları:** `date_preset` verilmezse `last_30d`; `fields` verilmezse yalnızca gösterim + harcama (GET) — POST (asenkron) için "en çok kullanılan alanlar" yazıyor, ikisi farklı. `time_range` verildiğinde `date_preset` yok sayılıyor; `time_ranges` verildiğinde `time_range` ve `time_increment` yok sayılıyor. Hepsi sessiz.
- **iOS 14.5 ve diğer kampanyalar birlikte sorgulanınca inline olmayan dönüşüm metrikleri HİÇ dönmüyor** (insights başı). Toplam "0" görünür.
- **`spend_cap` yeni değeri yalnızca ayarlandığı andan sonraki harcamaya uygulanıyor**; geçmiş harcama sayılmıyor. Kampanya `spend_cap` asgarisi ~100 USD karşılığı; kaldırmak için `922337203685478` yazılıyor (sıfır değil). Hesap seviyesinde ise `0` = limitsiz — iki seviyede "limitsiz"in kodu FARKLI.
- **Ad set `PAUSED` olunca altındaki aktif reklamlar `ADSET_PAUSED`, kampanya `PAUSED` olunca `CAMPAIGN_PAUSED`** etkin durumuna geçiyor; reklamın kendi `status`'ü ACTIVE kalıyor. Durumu yalnızca `status`'ten okuyan ekran yanlış "yayında" der; `effective_status` okunmalı.
- **`daily_budget` yalnızca 24 saatten uzun ad set'te geçerli**; `lifetime_budget` verilince `end_time` zorunlu; sürekli günlük bütçede `end_time=0`.
- **`frequency_control_specs` yalnızca `REACH` ve `THRUPLAY` hedefli ad set'lerde yazılabiliyor**; diğerlerinde ne olduğu belgede yok (kabul edip yok sayma ihtimali).
- **`is_adset_budget_sharing_enabled` kampanya örnek isteğinde var ama parametre tablosunda YOK.** Anlamı ve varsayılanı bu sayfadan çıkarılamıyor (belgede belirsiz; A/E bölümüne bakılmalı).
- **Ad set silme (`DELETE /act_{id}/adsets`) v8'den beri kaldırıldı**; kampanyalarda toplu silme `delete_strategy` (`DELETE_ANY`, `DELETE_OLDEST`, `DELETE_ARCHIVED_BEFORE`) ile — `DELETE_ANY` hesaptaki herhangi bir kampanyayı silebilir. AI'a asla verilmemeli.
- **`account_controls` hesap genelinde yaş/konum/yerleşim kısıtı koyuyor.** Ad set'te seçilmeyen bir kısıt burada uygulanıyor olabilir: kullanıcı "65+ seçtim, gösterilmiyor" der, sebep hesap ayarıdır. Yazma dönüşünde `success=false` + `error_message` HTTP hatası olmadan gelebilir.
- **`tracking` (hesap seviyesi `tracking_specs`) bütün reklamlara etki edebilir**; kapsamı belgede açık değil. Dokunulmamalı.
- **`conversion_domain` pixel'e veri paylaşan kampanyada reklam oluştururken ZORUNLU**; mevcut reklamlarda hedef URL'den tahminle dolduruluyor. Tahmin yanlış alan adını yazarsa dönüşüm sayımı sessizce kayar. Yalnızca birinci+ikinci seviye alan adı (`ornek.com`), tam URL değil.
- **`ad_schedule_start_time` / `ad_schedule_end_time` (reklam seviyesi zamanlama) yalnızca satış ve uygulama tanıtımı kampanyalarında**; diğerlerinde ne olduğu belgede yok.
- **`generatepreviews` iframe'i 24 saatte ölüyor.** Saklanırsa kırık önizleme olur (canlı bilgi 4'ün kardeşi).
- **`connected_instagram_accounts` ile `instagram_accounts` aynı açıklamayı taşıyor**; hangisinin reklam kimliği olarak geçerli olduğu belgede belirsiz. Yanlış kenardan seçilen IG hesabıyla kreatif reddedilebilir ya da (daha kötüsü) yalnızca Facebook'ta yayınlanabilir — bunun olup olmadığı belgede yok, canlıda ölçülmeli.
- **Görev grup üzerinden de gelebiliyor** (`business_asset_groups`); yalnızca doğrudan atamaya bakan kontrol YANLIŞ ALARM üretir. Advetics'in ilkesi: kesin bilgi yoksa alan üç hâlli (`true` / `false` / `null`), yalnızca kesin `false`'ta uyar.
- **`client_ad_accounts` erişimi "son 30 günde çağırmayan uygulama için" kapanabilir** (yukarıdaki not). Erişim kesilirse belirti "havuz boş geldi" olur — hata değil.
- **`dsa_recommendations` tahmindir**, doğruluğu garanti edilmiyor. Otomatik doldurulup onaysız gönderilmemeli.
- **`business_users` satırındaki `role` yalnızca Admin/Employee**; finans rolü ayrı alanda. "Admin değil" görünen kişi finans editörü olabilir.
- **`adimages` DELETE görseli hesaptan ayırıyor**; o hash'i kullanan kreatiflere ne olduğu belgede yok.
- **`ads` → `bid_amount` artık reklam seviyesinde kabul edilmiyor (kullanımdan kalktı)**; ad set'e yazılmalı.
- **`reachfrequencypredictions` uyarısı: v23'ten itibaren `instagram_destination_id` `instagram_actor_id` yerine `ig_user_id` döndürüyor; `destination_ids`'te `instagram_actor_id` artık desteklenmiyor.** IG kimlik uzayı karışıklığının bir örneği daha.

## Advetics'in canlı bilgisiyle karşılaştırma

| # | Canlı bilgi | Bu gruptaki belge | Sonuç |
|---|---|---|---|
| 1 | Boost'ta `destination_type: ON_POST` | `adsets` → `destination_type` enum'unda `ON_POST` var; açıklama yalnızca "Website, App, Messenger, INSTAGRAM_DIRECT, INSTAGRAM_PROFILE" sayıyor, gönderilmezse ne olacağı yazmıyor | Değer var, zorunluluk belgede yok — canlı bilgi geçerli |
| 2 | `geo_locations` kovaları birleşim | `targeting` için "countries zorunlu" yazıyor | **Çelişki görünümü**: belgeye uyulursa şehir hedeflemesi ülke geneline genişler. Canlı bilgi esas |
| 3 | IG kimlik uzayları, `source_instagram_media_id` + `instagram_user_id` | `adcreatives` alanlarında `instagram_user_id`, `source_instagram_media_id`, `instagram_permalink_url`, `object_id` var; `advideos` → `source_instagram_media_id` "V2 ID" diyor; R&F sayfası `instagram_actor_id`'nin `ig_user_id`'ye geçtiğini söylüyor | Uyuşuyor; "V2 ID" ifadesi hangi kimlik uzayının kastedildiğini netleştirmiyor (belgede belirsiz) |
| 4 | `image_url`/`thumbnail_url` imzalı ve ölüyor | `adcreatives` → `image_url`: "Facebook'un döndürdüğü görsel adreslerini KULLANMAYIN, kendi sunucunuzda barındırın"; `generatepreviews` iframe'i 24 saat | **Uyuşuyor** |
| 5 | `?ids=` tek kötü kimlik isteği düşürüyor | Bu grupta geçmiyor | — |
| 6 | Click-to-WhatsApp kurulumu | `destination_type: WHATSAPP` enum'da; CTA `value.app_destination` enum'unda `WHATSAPP`; `whatsapp_number` alanı da var; `page_welcome_message` WhatsApp için `object_story_spec` altında | Uyuşuyor; belge `whatsapp_number` alanını da sunuyor — canlı bilgi onu KULLANMAMAYI söylüyor (ayrışma riski) |
| 7 | `limit=500` → "reduce the amount of data" | Bu grupta yok; en yakını `2616` ("çok fazla satır, aralığı daralt") | Kısmen akraba |
| 8 | Insights'ta `use_unified_attribution_setting` + `action_report_time` açıkça | `use_unified_attribution_setting`: "Ads Manager ile aynı davranış için `true` yapın"; `use_account_attribution_setting` varsayılan `false` ve unified `true` iken yok sayılıyor; `action_report_time` = `impression/conversion/mixed/lifetime` | **Uyuşuyor**; açık gönderme kararını destekliyor |
| 9 | `age_max = 65` = 65+ | Bu grupta geçmiyor | — |
| 10 | `image_hash` hesap başına; `act_` öneki | `adimages` POST `copy_from` hesaplar arası KOPYA gerektiriyor; bütün uçlar `act_{ad_account_id}` yolunu kullanıyor | **Uyuşuyor**; ek olarak kopyalama ucu var (yeniden yüklemeye gerek yok) |
| 11 | İlgi araması kısa terimle eşleşiyor; büyüklük dünya geneli | `targetingsearch` (`q` zorunlu, `allow_only_fat_head_interests`) ve `targetingsuggestions` var; büyüklük kapsamı belirtilmiyor | Ülkeye göre büyüklük için `reachestimate` / `delivery_estimate` doğru uç (canlı bilgiyle uyumlu) |
| 12 | Organik istatistik adları değişti | Bu grupta yok | — |

## Yapay zekâ ile yönetim için çıkarımlar

**Araç olmalı (salt okuma, onaysız):**
- `hesap_durumu(act_id)` → `account_status`, `disable_reason`, `funding_source` var mı, `spend_cap`/`amount_spent`, `min_daily_budget`, `currency`, `timezone_name`. Her kampanya işinden önce çağrılmalı.
- `reklam_yetkisi(act_id, page_id, ig_id?, pixel_id?)` → hesap görevi, sayfa görevi (doğrudan + grup), `promote_pages` üyeliği, IG'nin hesapla ilişkisi, pixel'in hesaba bağlılığı. Dönüş her katman için `true` / `false` / `null` ve eksik olanın ADI.
- `kitle_buyuklugu(targeting)` (`reachestimate`), `sonuc_tahmini(goal, targeting)` (`delivery_estimate`), `asgari_butce(act_id)` (`minimum_budgets`).
- `hedefleme_ara(q, tip)` (`targetingsearch`), `hedefleme_oner(liste)` (`targetingsuggestions`), `hedefleme_dogrula(liste)` (`targetingvalidation`).
- `onizleme(kreatif, ad_format)` (`generatepreviews`).
- `kuru_dogrulama(ad_spec)` (`execution_options: validate_only + synchronous_ad_review`).
- `durmus_adsetler(act_id)` (`deprecatedtargetingadsets?type=delivery_paused`), `son_degisiklikler(act_id)` (`activities`), `etkin_kurallar` (`active_adrules`).
- `site_varliklari(url)` (`website_creative_assets`) — AI'ın müşteri sitesinden metin/görsel taslağı çıkarması.

**Kapalı sözlükten seçilmeli (AI serbest metin üretmemeli):** `tasks` (`MANAGE/ADVERTISE/ANALYZE/DRAFT/AA_ANALYZE`), `account_status` ve `disable_reason` kodları (sayı → Türkçe açıklama tablosu), `destination_type`, `bid_strategy`, `billing_event`, `optimization_goal`, `special_ad_categories`, `ad_format` (önizleme), `placement_exclusions` (beş değer), `delete_strategy` (AI'a hiç verilmez).

**İnsan onayı gerektirir:** görsel/video yükleme hariç bütün yazmalar; özellikle `adimages copy_from` (başka müşterinin hesabından kopya = müşteri izolasyonu riski: kaynak ve hedef hesap AYNI workspace'te değilse reddet), `customconversions`/`adspixels` oluşturma, `adlabels` dışındaki etiketleme, `account_controls`, `tracking`, `subscribed_apps`.

**AI'a HİÇ verilmemeli:** `customaudiencestos` kabulü (müşteri adına hukuki onay), bütün Business DELETE uçları (ajans/müşteri ilişkisini koparma, sayfa/IG/hesap ayırma), `assigned_users` POST/DELETE (izin değiştirme), `owned_*` sahiplenme, BM/reklam hesabı/sistem kullanıcısı oluşturma, `system_user_access_tokens`, `campaigns` toplu DELETE, `adrules_library` yazma (Advetics'in kural motoruyla çakışır).

**AI'ın asla tahmin etmemesi gereken yerler:** bir kimliğin bir varlıkta yetkisi olup olmadığı (ölç, tahmin etme); `-1` kitle büyüklüğünün anlamı (boş değil, "bilinmiyor"); `dsa_beneficiary`/`dsa_payor` (öneriyi göster, kullanıcı onaylasın); `conversion_domain` (hedef URL'den türet ama kullanıcıya göster); hangi IG kenarının geçerli olduğu.

**Değişiklik izi:** Advetics'in oluşturduğu kampanya/ad set/reklamlara `adlabels` ile sabit bir etiket koymak, MCP ya da Ads Manager'dan yapılan değişiklikleri `activities` ile karşılaştırırken "bunu biz mi kurduk" sorusunu cevaplar (belge etiketin raporda süzgeç olarak kullanılabildiğini gösteriyor: `adlabels` özetinde `insights` kenarı var).

## Panel kurgusu için çıkarımlar

**Acemi kullanıcıya SORULMAYACAKLAR (otomatik karar):** görevler, roller, sistem kullanıcısı, token; `bid_strategy` (açıkça `LOWEST_COST_WITHOUT_CAP` yazılır, `bid_amount` gönderilmez); `account_controls`; yayıncı engel listeleri; atıf ayarları.

**Kullanıcıya GÖSTERİLECEK, sorulmayacak:**
- Reklam hesabı kartında durum rozeti: `ACTIVE` dışındaki her `account_status` Türkçe cümleyle ve `disable_reason` ile ("Ödenmemiş bakiye var", "Risk incelemesinde", "Politika nedeniyle kapatıldı"). `UNSETTLED`, `PENDING_RISK_REVIEW`, `IN_GRACE_PERIOD` hesaplarında "Reklam Oluştur" düğmesi KAPALI ve sebebi yazılı.
- Ödeme yöntemi yoksa: "Bu hesapta ödeme yöntemi yok; reklam kurulabilir ama yayınlanmaz." — yayın düğmesi kapalı.
- Harcama limiti doluysa ya da yakınsa (`amount_spent` / `spend_cap`) uyarı.
- **"Bu hesapla bu sayfa için reklam veremezsin" uyarısının dayanağı** (giriş anında, sayfa seçilirken): (1) sayfa `promote_pages` listesinde mi, (2) kimliğin sayfada `ADVERTISE` görevi var mı (`assigned_pages` + `assigned_business_asset_groups`), (3) kimliğin hesapta `ADVERTISE`/`MANAGE` görevi var mı, (4) token'da `pages_manage_ads` var mı. Hangisi eksikse o söylenir: "Sayfa bu reklam hesabına bağlı değil", "Ajansın sayfada reklam yetkisi yok — müşteri Business ayarlarından 'Reklam' iznini vermeli", "Ajansın bu hesapta yalnızca rapor yetkisi var", "Bağlantının sayfa reklam izni yok — yeniden bağlan". Belirsizse (görülemiyor) uyarı verilmez, "doğrulanamadı" yazılır.
- IG hesabı seçicisi yalnızca hesabın IG listesinden (`instagram_accounts`) dolsun; boşsa sebebi yazsın ("Bu reklam hesabına bağlı Instagram hesabı yok").
- Pixel seçicisi yalnızca hesaba bağlı pixel'ler (`adspixels`); müşterinin pixel'i ajansa paylaşılmamışsa "pixel bu hesaba paylaşılmamış" (2024 kuralı).
- Bütçe alanı `minimum_budgets` / `min_daily_budget` ile GİRİŞ ANINDA doğrulanır.
- Kitle büyüklüğü göstergesi `reachestimate`; `-1` → "Bu kitle için tahmin yok" (sıfır değil).
- "Durdurulmuş reklam setleri" bandı (`deprecatedtargetingadsets?type=delivery_paused`) Genel Bakış'ta.

**Yalnızca Gelişmiş modda:** `bid_strategy`/`bid_amount`, `frequency_control_specs`, yayıncı engel listeleri, hesap seviyesi yerleşim dışlamaları (salt okuma), kayıtlı kitleler, hedefleme ağacı (`targetingbrowse`), DSA alanlarının elle düzenlenmesi, `conversion_domain`'in elle düzeltilmesi.

**Hiç gösterilmeyecek:** BM oluşturma/sahiplenme/ilişki koparma, sistem kullanıcısı yönetimi, R&F tahmini, Audience Network yayıncı analitiği, MMM raporları, reseller/China/WhatsApp ön doğrulama uçları, iş birliği reklamları (collaborative ads), üçüncü taraf ölçüm istekleri.

## Sayfa sayfa dizin

| Dosya | Kaynak URL | Tek satır özet | Önem |
|---|---|---|---|
| `marketing-api__reference__ad-account__aaa_compatible_ad_objects.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/aaa_compatible_ad_objects | Advantage+ App Ads'e çoğaltma uygunluk kontrolü (kampanya/set/reklam kimlikleri) | İlgisiz |
| `marketing-api__reference__ad-account__account_controls.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/account_controls | Hesap geneli kitle/yerleşim kısıtı (AdAccountBusinessConstraints) okuma/yazma; yalnız 5 yerleşim dışlanabilir | Yüksek |
| `marketing-api__reference__ad-account__active_adrules.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/active_adrules | Seçili nesnelerde etkin otomatik kurallar (`selected_ids` zorunlu) | Orta |
| `marketing-api__reference__ad-account__activities.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/activities | Hesabın değişiklik/etkinlik günlüğü (AdActivity); dış değişiklik tespiti | Yüksek |
| `marketing-api__reference__ad-account__ad_column_sizes.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/ad_column_sizes | Ads Manager sütun genişlikleri; oluşturma bölümü boş | İlgisiz |
| `marketing-api__reference__ad-account__ad_custom_derived_metrics.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/ad_custom_derived_metrics | Özel türetilmiş metrik listesi | Düşük |
| `marketing-api__reference__ad-account__ad_place_page_sets.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/ad_place_page_sets | Yerel reklam için konum sayfa setleri; POST `name`, `parent_page`, `location_types` | Düşük |
| `marketing-api__reference__ad-account__ad_place_page_sets_async.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/ad_place_page_sets_async | Ölü sayfa: yalnız başlık, içerik yok | İlgisiz |
| `marketing-api__reference__ad-account__adcreatives.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/adcreatives | Kreatif listesi ve oluşturma; aynı `object_story_id` mevcut kreatifi döndürüyor, Facebook görsel URL'si kullanılmamalı | Yüksek |
| `marketing-api__reference__ad-account__addrafts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/addrafts | Ads Manager taslakları (AdDraft) listesi | Düşük |
| `marketing-api__reference__ad-account__adimages.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/adimages | Görsel kitaplığı: liste, base64 yükleme, `copy_from` ile hesaplar arası kopya, hash ile silme | Yüksek |
| `marketing-api__reference__ad-account__adlabels.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/adlabels | Reklam etiketleri listesi ve oluşturma (`name`); Advetics nesnelerini işaretlemek için | Orta |
| `marketing-api__reference__ad-account__adplayables.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/adplayables | Oynanabilir (playable) HTML varlıkları | İlgisiz |
| `marketing-api__reference__ad-account__adrules_count_by_type.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/adrules_count_by_type | Durum başına kural sayısı | Düşük |
| `marketing-api__reference__ad-account__adrules_library.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/adrules_library | Otomatik kural oluşturma (evaluation/execution/schedule spec); 2703 maliyet koşulu kısıtı | Orta |
| `marketing-api__reference__ad-account__ads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/ads | Reklam listesi ve oluşturma; `validate_only`+`synchronous_ad_review`, `conversion_domain`, reklam seviyesi zamanlama | Yüksek |
| `marketing-api__reference__ad-account__ads_reporting_mmm_reports.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/ads_reporting_mmm_reports | MMM raporları | İlgisiz |
| `marketing-api__reference__ad-account__ads_reporting_mmm_schedulers.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/ads_reporting_mmm_schedulers | MMM rapor zamanlayıcıları | İlgisiz |
| `marketing-api__reference__ad-account__adsets.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/adsets | Ad set listesi ve oluşturma; yalnız `bid_amount` → manuel tavan, `countries` zorunlu ifadesi, silme v8'de kalktı | Yüksek |
| `marketing-api__reference__ad-account__adspixels.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/adspixels | Hesabın pixel'leri; POST yeni pixel (6200/6202 sınırı) | Yüksek |
| `marketing-api__reference__ad-account__advideos.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/advideos | Video kitaplığı; tek parça/parçalı yükleme, IG videosu içe alma, silme | Yüksek |
| `marketing-api__reference__ad-account__agencies.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/agencies | Hesaba erişen ajans BM'leri: `access_status`, `permitted_tasks`; DELETE erişimi kaldırır | Yüksek |
| `marketing-api__reference__ad-account__applications.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/applications | Hesapla ilişkili uygulamalar | Düşük |
| `marketing-api__reference__ad-account__applied_publisher_block_lists.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/applied_publisher_block_lists | Hesaba/üst BM'e uygulanmış yayıncı engel listeleri | Düşük |
| `marketing-api__reference__ad-account__assigned_users.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/assigned_users | Hesaba atanmış iş/sistem kullanıcıları ve görevleri; rol→görev eşlemesi (hesap ve sayfa) | Yüksek |
| `marketing-api__reference__ad-account__async_batch_requests.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/async_batch_requests | Asenkron toplu istek (`adbatch`: name, relative_url, body) | Orta |
| `marketing-api__reference__ad-account__asyncadcopies.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/asyncadcopies | Ölü sayfa: yalnız başlık | İlgisiz |
| `marketing-api__reference__ad-account__asyncadcreatives.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/asyncadcreatives | Asenkron kreatif oluşturma işleri; bildirim modu | Düşük |
| `marketing-api__reference__ad-account__asyncadrequestsets.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/asyncadrequestsets | Asenkron reklam istek setleri (`ad_specs`) | Düşük |
| `marketing-api__reference__ad-account__broadtargetingcategories.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/broadtargetingcategories | Geniş hedefleme kategorileri | Düşük |
| `marketing-api__reference__ad-account__campaign_attribution_options.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/campaign_attribution_options | Uygulama (`app_id`) için olay/optimizasyon bazlı atıf seçenekleri | Düşük |
| `marketing-api__reference__ad-account__campaigns.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/campaigns | Kampanya listesi (süzgeçsiz arşiv/silinmiş dönmez), oluşturma, toplu silme stratejileri | Yüksek |
| `marketing-api__reference__ad-account__collaborative_ads_partner_businesses.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/collaborative_ads_partner_businesses | İş birliği reklamı ortak BM'leri; ajans adına `business_id` parametresi | Düşük |
| `marketing-api__reference__ad-account__connected_instagram_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/connected_instagram_accounts | Hesapla ilişkili IG hesapları (instagram_accounts ile farkı belgesiz) | Yüksek |
| `marketing-api__reference__ad-account__customaudiences.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/customaudiences | Özel kitle listesi (varsayılan yalnız kimlik); hesap başına 500 sınırı | Yüksek |
| `marketing-api__reference__ad-account__customaudiencestos.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/customaudiencestos | Özel kitle şartları: okuma ve `tos_id` ile kabul | Orta |
| `marketing-api__reference__ad-account__customconversions.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/customconversions | Özel dönüşüm listesi ve oluşturma (rule, event_source_id, custom_event_type) | Orta |
| `marketing-api__reference__ad-account__delivery_estimate.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/delivery_estimate | Optimizasyon hedefi + hedeflemeye göre yayın/sonuç tahmini; `promoted_object` alanları | Yüksek |
| `marketing-api__reference__ad-account__deprecatedtargetingadsets.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/deprecatedtargetingadsets | Kalkan hedefleme nedeniyle durmuş/duracak ad set'ler (`delivery_paused`/`deprecating`) | Yüksek |
| `marketing-api__reference__ad-account__direct_debits.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/direct_debits | Ölü sayfa: otomatik ödeme talimatları, içerik yok | Düşük |
| `marketing-api__reference__ad-account__dsa_recommendations.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/dsa_recommendations | AB DSA yararlanıcı/ödeyen önerileri (garanti değil) | Orta |
| `marketing-api__reference__ad-account__generatepreviews.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/generatepreviews | Kreatif spec'ten iframe önizleme (24 saat geçerli); ad_format listesi ve desteklenen kombinasyonlar | Yüksek |
| `marketing-api__reference__ad-account__impacting_ad_studies.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/impacting_ad_studies | Hesabı etkileyen test/lift çalışmaları | Düşük |
| `marketing-api__reference__ad-account__insights.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/insights | Hesap insights: parametreler, atıf ayarları, varsayılan last_30d, asenkron AdReportRun | Yüksek |
| `marketing-api__reference__ad-account__instagram_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/instagram_accounts | Hesapla ilişkili IG hesapları + total_count; IG oran sınırı 80002 | Yüksek |
| `marketing-api__reference__ad-account__locationclusters.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/locationclusters | Ölü sayfa: yalnız başlık | İlgisiz |
| `marketing-api__reference__ad-account__mcmeconversions.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/mcmeconversions | MCME dönüşümleri listesi | Düşük |
| `marketing-api__reference__ad-account__message_delivery_estimate.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/message_delivery_estimate | Pazarlama mesajı kampanyası yayın tahmini | Düşük |
| `marketing-api__reference__ad-account__minimum_budgets.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/minimum_budgets | Açık artırma ad set'i için asgari günlük bütçe (bid_amount opsiyonel) | Yüksek |
| `marketing-api__reference__ad-account__naming_templates.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/naming_templates | Adlandırma şablonları | Düşük |
| `marketing-api__reference__ad-account__offline_conversion_data_sets.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/offline_conversion_data_sets | Hesaba bağlı çevrim dışı dönüşüm setleri (`auto_track_for_ads`) | Düşük |
| `marketing-api__reference__ad-account__optimization_goals_aemv2_eligibility.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/optimization_goals_aemv2_eligibility | Uygulama için AEM v2 optimizasyon uygunluğu | İlgisiz |
| `marketing-api__reference__ad-account__prepay_fund.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/prepay_fund | Ölü sayfa: ön ödeme bakiyesi, içerik yok | Düşük |
| `marketing-api__reference__ad-account__product_audiences.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/product_audiences | Ürün setine dayalı kitle oluşturma (inclusions/exclusions) | Düşük |
| `marketing-api__reference__ad-account__promote_pages.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/promote_pages | Hesabın reklamını verebileceği sayfalar; `pages_show_list` + `pages_manage_ads` gerekir | Yüksek |
| `marketing-api__reference__ad-account__proposals.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/proposals | Hesap teklifleri (AdProposal) | İlgisiz |
| `marketing-api__reference__ad-account__publisher_block_lists.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/publisher_block_lists | Hesabın yayıncı engel listeleri; POST oluşturma | Düşük |
| `marketing-api__reference__ad-account__reachestimate.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/reachestimate | Hedefleme için kitle büyüklüğü aralığı; özel kitlede -1 olabilir | Yüksek |
| `marketing-api__reference__ad-account__reachfrequencypredictions.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/reachfrequencypredictions | Erişim-sıklık tahmini; v23'te instagram_actor_id → ig_user_id | Düşük |
| `marketing-api__reference__ad-account__report_specs.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/report_specs | Ölü sayfa: yalnız başlık | İlgisiz |
| `marketing-api__reference__ad-account__reporting.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/reporting | Rapor oluşturucu (Report Builder) sorgusu; atıf pencereleri, boyutlar, metrikler | Düşük |
| `marketing-api__reference__ad-account__saved_audiences.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/saved_audiences | Kayıtlı kitleler (varsayılan yalnız kimlik) | Orta |
| `marketing-api__reference__ad-account__site_links.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/site_links | Site bağlantıları listesi | Düşük |
| `marketing-api__reference__ad-account__smart_suggested_ads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/smart_suggested_ads | Akıllı önerilen reklamlar (hedef/optimizasyon süzgeçli) | Düşük |
| `marketing-api__reference__ad-account__start_your_day_widgets.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/start_your_day_widgets | Ads Manager günlük widget'ları | İlgisiz |
| `marketing-api__reference__ad-account__subscribed_apps.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/subscribed_apps | Hesaba abone uygulamalar; POST/DELETE `app_id` | Orta |
| `marketing-api__reference__ad-account__suggested_ads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/suggested_ads | Önerilen reklamlar (`use_case`, `rank_by`) | Düşük |
| `marketing-api__reference__ad-account__targetingbrowse.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/targetingbrowse | Hedefleme ağacının düz listesi (`limit_type`, `regulated_categories`) | Orta |
| `marketing-api__reference__ad-account__targetingsearch.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/targetingsearch | Birleşik hedefleme araması (`q` zorunlu, `allow_only_fat_head_interests`) | Yüksek |
| `marketing-api__reference__ad-account__targetingsuggestions.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/targetingsuggestions | Verilen hedeflemelere benzer öneriler | Orta |
| `marketing-api__reference__ad-account__targetingvalidation.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/targetingvalidation | İlgi alanı/kategori kimlik ve ad doğrulaması (`is_exclusion`) | Orta |
| `marketing-api__reference__ad-account__tax_info.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/tax_info | Ölü sayfa: vergi bilgisi, içerik yok | Düşük |
| `marketing-api__reference__ad-account__tracking.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/tracking | Hesap seviyesi tracking_specs okuma/ekleme | Düşük |
| `marketing-api__reference__ad-account__urls_for_asset_extraction.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/urls_for_asset_extraction | Kreatif varlık çıkarımı için önerilen URL'ler | Orta |
| `marketing-api__reference__ad-account__users.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/users | Hesap kullanıcıları (AdAccountUser); oluşturma/silme bölümleri boş | Orta |
| `marketing-api__reference__ad-account__website_creative_assets.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/website_creative_assets | URL'den otomatik çıkarılan kreatif varlık önerileri | Orta |
| `marketing-api__reference__ad-account__website_creative_info.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/website_creative_info | URL'nin web sitesi kreatif bilgisi | Düşük |
| `marketing-api__reference__ad-account__youth_ads_advertiser.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/youth_ads_advertiser | Gençlere reklam veren uygunluğu (`objective` zorunlu) | Düşük |
| `marketing-api__reference__business-role-request.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business-role-request | BM davet isteği düğümü: rol, durum, süre; rol güncelleme ve iptal | Orta |
| `marketing-api__reference__business-role-request__assigned_client_assets.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business-role-request/assigned_client_assets | Davete bağlanmış müşteri varlıkları (`asset_type`, izinler) | Düşük |
| `marketing-api__reference__business-role-request__assigned_owned_assets.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business-role-request/assigned_owned_assets | Davete bağlanmış sahip olunan varlıklar | Düşük |
| `marketing-api__reference__business-user.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business-user | İş kullanıcısı düğümü: rol, finans/ads-rights izni, 2FA; oluşturma, güncelleme, silme; v10 sahiplenme kısıtı | Yüksek |
| `marketing-api__reference__business-user__assigned_ad_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business-user/assigned_ad_accounts | Kişiye atanmış reklam hesapları ve `tasks`; 2024 pixel paylaşım uyarısı | Yüksek |
| `marketing-api__reference__business-user__assigned_ads_pixels.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business-user/assigned_ads_pixels | Kişiye atanmış pixel'ler ve görevler | Orta |
| `marketing-api__reference__business-user__assigned_apps.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business-user/assigned_apps | Kişiye atanmış uygulamalar | Düşük |
| `marketing-api__reference__business-user__assigned_business_asset_groups.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business-user/assigned_business_asset_groups | Kişinin varlık grupları ve tür bazlı görevler (`contained_asset_id`) | Yüksek |
| `marketing-api__reference__business-user__assigned_creative_folders.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business-user/assigned_creative_folders | Kişiye atanmış kreatif klasörleri | Düşük |
| `marketing-api__reference__business-user__assigned_instagram_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business-user/assigned_instagram_accounts | Kişiye atanmış IG hesapları (`permitted_roles`) | Orta |
| `marketing-api__reference__business-user__assigned_monetization_properties.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business-user/assigned_monetization_properties | Kişiye atanmış para kazanma varlıkları | İlgisiz |
| `marketing-api__reference__business-user__assigned_offline_conversion_data_sets.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business-user/assigned_offline_conversion_data_sets | Kişiye atanmış çevrim dışı setler | Düşük |
| `marketing-api__reference__business-user__assigned_pages.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business-user/assigned_pages | Kişiye atanmış sayfalar ve `tasks` | Yüksek |
| `marketing-api__reference__business-user__assigned_product_catalogs.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business-user/assigned_product_catalogs | Kişiye atanmış kataloglar (`access_type`) | Düşük |
| `marketing-api__reference__business-user__assigned_whatsapp_business_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business-user/assigned_whatsapp_business_accounts | Kişiye atanmış WABA'lar | Düşük |
| `marketing-api__reference__business.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business | Business düğümü: alanlar, kenar listesi, BM oluşturma/güncelleme, ilişki koparma DELETE'leri | Yüksek |
| `marketing-api__reference__business__ad_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/ad_accounts | Yalnız DELETE: reklam hesabını BM'den ayırma | Orta |
| `marketing-api__reference__business__ad_studies.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/ad_studies | BM'in lift/split test çalışmaları; POST çalışma oluşturma | Düşük |
| `marketing-api__reference__business__adaccount.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/adaccount | BM içinde reklam hesabı açma; zorunlu alanlar, değiştirilemeyen `end_advertiser` | Orta |
| `marketing-api__reference__business__add_phone_numbers.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/add_phone_numbers | Ölü sayfa: WhatsApp ön doğrulamalı numara ekleme, içerik yok | İlgisiz |
| `marketing-api__reference__business__adnetworkanalytics.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/adnetworkanalytics | Audience Network yayıncı analitiği (senkron/asenkron) | İlgisiz |
| `marketing-api__reference__business__adnetworkanalytics_export.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/adnetworkanalytics_export | Audience Network sorgu dışa aktarımı | İlgisiz |
| `marketing-api__reference__business__adnetworkanalytics_results.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/adnetworkanalytics_results | Audience Network asenkron sonuçları | İlgisiz |
| `marketing-api__reference__business__ads_custom_pivots_preview.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/ads_custom_pivots_preview | Özel pivot gruplaması önizlemesi | İlgisiz |
| `marketing-api__reference__business__ads_reporting_exports.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/ads_reporting_exports | Rapor oluşturucu dışa aktarımları | Düşük |
| `marketing-api__reference__business__ads_reporting_mmm_reports.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/ads_reporting_mmm_reports | BM MMM raporları | İlgisiz |
| `marketing-api__reference__business__ads_reporting_mmm_schedulers.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/ads_reporting_mmm_schedulers | BM MMM zamanlayıcıları | İlgisiz |
| `marketing-api__reference__business__adspixels.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/adspixels | BM'in eriştiği pixel'ler (ad/kimlik süzgeci); 270 geliştirme erişimi hatası | Orta |
| `marketing-api__reference__business__agencies.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/agencies | BM'in varlıklarına erişen ajanslar ve izin türleri; DELETE ilişkiyi koparır | Orta |
| `marketing-api__reference__business__an_placements.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/an_placements | Audience Network yerleşimleri | İlgisiz |
| `marketing-api__reference__business__an_publisher_blocklist_apps.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/an_publisher_blocklist_apps | AN uygulama engel listesi | İlgisiz |
| `marketing-api__reference__business__an_publisher_blocklist_categories.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/an_publisher_blocklist_categories | AN kategori engel listesi | İlgisiz |
| `marketing-api__reference__business__an_publisher_blocklist_domains.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/an_publisher_blocklist_domains | AN alan adı engel listesi | İlgisiz |
| `marketing-api__reference__business__an_publisher_blocklist_pages.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/an_publisher_blocklist_pages | AN sayfa engel listesi | İlgisiz |
| `marketing-api__reference__business__applied_publisher_block_lists.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/applied_publisher_block_lists | BM'e uygulanmış yayıncı engel listeleri | Düşük |
| `marketing-api__reference__business__business_asset_groups.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/business_asset_groups | BM varlık grupları; oluşturma bölümü boş | Orta |
| `marketing-api__reference__business__business_invoices.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/business_invoices | Kredi hatlı BM'lerin aylık faturaları (INV/CM/DM/PRO_FORMA); varsayılan son 6 ay | Düşük |
| `marketing-api__reference__business__business_users.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/business_users | BM iş kullanıcıları (rol yalnız Admin/Employee); davetle ekleme | Orta |
| `marketing-api__reference__business__china_business_onboarding_attributions.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/china_business_onboarding_attributions | Çin bayi onboarding izleme | İlgisiz |
| `marketing-api__reference__business__claim_custom_conversions.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/claim_custom_conversions | Özel dönüşümü BM'e sahiplenme | Düşük |
| `marketing-api__reference__business__client_ad_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/client_ad_accounts | Müşterinin ajansa paylaştığı reklam hesapları + `permitted_tasks`; 30 gün erişim notu | Yüksek |
| `marketing-api__reference__business__client_apps.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/client_apps | Müşteri uygulamaları; POST `app_id` ile erişim | Düşük |
| `marketing-api__reference__business__client_business_asset_groups.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/client_business_asset_groups | Müşteri varlık grupları | Düşük |
| `marketing-api__reference__business__client_instagram_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/client_instagram_accounts | Müşterinin paylaştığı IG hesapları + `permitted_tasks` | Yüksek |
| `marketing-api__reference__business__client_instagram_assets.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/client_instagram_assets | Müşteri IG işletme varlıkları | Orta |
| `marketing-api__reference__business__client_objects.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/client_objects | Bütün müşteri varlıkları tek uçta (`type`, `owner_biz_id`) | Orta |
| `marketing-api__reference__business__client_offsite_signal_container_business_objects.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/client_offsite_signal_container_business_objects | Müşteri sinyal kapsayıcı nesneleri | Düşük |
| `marketing-api__reference__business__client_pages.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/client_pages | Müşterinin paylaştığı sayfalar + `permitted_tasks` | Yüksek |
| `marketing-api__reference__business__client_pixels.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/client_pixels | Müşterinin paylaştığı pixel'ler + `permitted_tasks` | Yüksek |
| `marketing-api__reference__business__client_product_catalogs.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/client_product_catalogs | Müşteri katalogları (`permitted_roles`) | Orta |
| `marketing-api__reference__business__client_publisher_block_lists.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/client_publisher_block_lists | Müşteri yayıncı engel listeleri | Düşük |
| `marketing-api__reference__business__client_whatsapp_business_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/client_whatsapp_business_accounts | Ajansa paylaşılmış WABA'lar | Düşük |
| `marketing-api__reference__business__clients.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/clients | Ajansın müşteri BM'leri ve izin türleri; DELETE ilişkiyi koparır | Yüksek |
| `marketing-api__reference__business__collaborative_ads_collaboration_requests.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/collaborative_ads_collaboration_requests | İş birliği reklamı istekleri | İlgisiz |
| `marketing-api__reference__business__collaborative_ads_suggested_partners.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/collaborative_ads_suggested_partners | Önerilen iş birliği ortakları | İlgisiz |
| `marketing-api__reference__business__commerce_merchant_settings.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/commerce_merchant_settings | Ticaret satıcı ayarları | İlgisiz |
| `marketing-api__reference__business__content_block_lists.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/content_block_lists | İçerik engel listeleri | Düşük |
| `marketing-api__reference__business__creative_asset_tags.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/creative_asset_tags | Kreatif varlık etiketleri | Düşük |
| `marketing-api__reference__business__creative_folders.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/creative_folders | BM kreatif klasörleri | Düşük |
| `marketing-api__reference__business__creatives.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/creatives | BM kreatif kitaplığı (görsel/video) | Düşük |
| `marketing-api__reference__business__custom_pivots.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/custom_pivots | BM özel pivotları | İlgisiz |
| `marketing-api__reference__business__customconversions.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/customconversions | BM'in eriştiği özel dönüşümler (arşiv dahil varsayılan) | Düşük |
| `marketing-api__reference__business__event_source_groups.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/event_source_groups | Olay kaynağı grupları; POST pixel listesiyle grup | Düşük |
| `marketing-api__reference__business__extendedcredits.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/extendedcredits | BM kredi hatları | Düşük |
| `marketing-api__reference__business__finance_permissions.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/finance_permissions | Kullanıcıların finans izinleri | Düşük |
| `marketing-api__reference__business__ig_bc_ad_permissions.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/ig_bc_ad_permissions | Instagram markalı içerik reklam izinleri | Düşük |
| `marketing-api__reference__business__images.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/images | BM görsel kitaplığı (klasör süzgeci) | Düşük |
| `marketing-api__reference__business__initiated_audience_sharing_requests.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/initiated_audience_sharing_requests | BM'in başlattığı kitle paylaşım istekleri | Düşük |
| `marketing-api__reference__business__initiated_sharing_agreements.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/initiated_sharing_agreements | BM'in başlattığı varlık paylaşım anlaşmaları | Düşük |
| `marketing-api__reference__business__instagram_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/instagram_accounts | BM'in eriştiği IG hesapları; DELETE ayırma | Orta |
| `marketing-api__reference__business__instagram_business_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/instagram_business_accounts | İşletmeye dönüştürülmüş IG hesapları | Orta |
| `marketing-api__reference__business__managed_businesses.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/managed_businesses | Toplayıcı BM'in yönettiği müşteri BM oluşturma/güncelleme | İlgisiz |
| `marketing-api__reference__business__managed_partner_ads_funding_source_details.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/managed_partner_ads_funding_source_details | Yönetilen ortak reklam fon kaynağı (kupon) ayrıntısı | İlgisiz |
| `marketing-api__reference__business__managed_partner_businesses.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/managed_partner_businesses | Yönetilen ortak BM oluşturma/silme (iş birliği reklamı) | İlgisiz |
| `marketing-api__reference__business__measurement_reports.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/measurement_reports | Ölçüm raporları (MTA, lift, MMM) | İlgisiz |
| `marketing-api__reference__business__offline_conversion_data_sets.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/offline_conversion_data_sets | BM çevrim dışı setleri; `access_type` OWNER/AGENCY | Düşük |
| `marketing-api__reference__business__openbridge_configurations.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/openbridge_configurations | Conversions API Gateway (OpenBridge) yapılandırmaları | Düşük |
| `marketing-api__reference__business__owned_ad_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/owned_ad_accounts | BM'in sahip olduğu reklam hesapları; POST sahiplenme (3936/3994) | Orta |
| `marketing-api__reference__business__owned_apps.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/owned_apps | BM'in sahip olduğu uygulamalar | Düşük |
| `marketing-api__reference__business__owned_businesses.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/owned_businesses | Alt BM listesi/oluşturma/silme; geliştirme modunda 2 alt BM sınırı, ayrıntılı hata tablosu | Düşük |
| `marketing-api__reference__business__owned_custom_conversions.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/owned_custom_conversions | BM'in sahip olduğu özel dönüşümler | Düşük |
| `marketing-api__reference__business__owned_domains.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/owned_domains | BM'in sahip olduğu alan adları | Orta |
| `marketing-api__reference__business__owned_instagram_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/owned_instagram_accounts | BM'in sahip olduğu IG hesapları | Orta |
| `marketing-api__reference__business__owned_instagram_assets.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/owned_instagram_assets | BM'in sahip olduğu IG işletme varlıkları | Orta |
| `marketing-api__reference__business__owned_offsite_signal_container_business_objects.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/owned_offsite_signal_container_business_objects | Sahip olunan sinyal kapsayıcıları | Düşük |
| `marketing-api__reference__business__owned_pages.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/owned_pages | BM'in sahip olduğu sayfalar; POST sahiplenme (3977/3918) | Orta |
| `marketing-api__reference__business__owned_pixels.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/owned_pixels | BM'in sahip olduğu pixel'ler | Orta |
| `marketing-api__reference__business__owned_product_catalogs.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/owned_product_catalogs | BM katalogları; POST katalog oluşturma (vertical vb.) | Düşük |
| `marketing-api__reference__business__owned_publisher_block_lists.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/owned_publisher_block_lists | BM'in sahip olduğu engel listeleri | Düşük |
| `marketing-api__reference__business__owned_whatsapp_business_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/owned_whatsapp_business_accounts | BM'in sahip olduğu WABA'lar | Düşük |
| `marketing-api__reference__business__pages.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/pages | Yalnız DELETE: sayfayı BM'den ayırma (42001 IG bağlı) | Düşük |
| `marketing-api__reference__business__parent_advertiser_infos.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/parent_advertiser_infos | Üst reklamveren bilgileri | İlgisiz |
| `marketing-api__reference__business__partner_account_linking.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/partner_account_linking | Ortak hesap bağlama | İlgisiz |
| `marketing-api__reference__business__partner_center_export_files.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/partner_center_export_files | Partner Center dışa aktarımları (kapanan hesaplar, reddedilen reklamlar) | Düşük |
| `marketing-api__reference__business__partner_relationships.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/partner_relationships | Ortak BM ilişkileri | Düşük |
| `marketing-api__reference__business__partners.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/partners | Ortak BM'ler | Düşük |
| `marketing-api__reference__business__pending_client_ad_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/pending_client_ad_accounts | Ajansın istediği, müşteri onayı bekleyen reklam hesapları | Yüksek |
| `marketing-api__reference__business__pending_client_apps.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/pending_client_apps | Onay bekleyen müşteri uygulamaları | Düşük |
| `marketing-api__reference__business__pending_client_pages.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/pending_client_pages | Ajansın istediği, onay bekleyen müşteri sayfaları | Yüksek |
| `marketing-api__reference__business__pending_offline_conversion_data_sets.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/pending_offline_conversion_data_sets | Onay bekleyen çevrim dışı setler | Düşük |
| `marketing-api__reference__business__pending_owned_ad_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/pending_owned_ad_accounts | Sahiplik isteği bekleyen reklam hesapları | Orta |
| `marketing-api__reference__business__pending_owned_pages.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/pending_owned_pages | Sahiplik isteği bekleyen sayfalar | Orta |
| `marketing-api__reference__business__pending_shared_offsite_signal_container_business_objects.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/pending_shared_offsite_signal_container_business_objects | Paylaşım onayı bekleyen sinyal kapsayıcıları | Düşük |
| `marketing-api__reference__business__pending_shared_pixels.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/pending_shared_pixels | Paylaşım onayı bekleyen pixel'ler | Orta |
| `marketing-api__reference__business__pending_users.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/pending_users | Kabul edilmemiş BM davetleri | Düşük |
| `marketing-api__reference__business__preverified_numbers.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/preverified_numbers | WhatsApp ön doğrulamalı numaralar (14 gün geçerlilik) | İlgisiz |
| `marketing-api__reference__business__publisher_block_lists.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/publisher_block_lists | BM'in eriştiği engel listeleri (ad/sıralama) | Düşük |
| `marketing-api__reference__business__received_audience_permissions.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/received_audience_permissions | Alınan paylaşılmış kitleler | Düşük |
| `marketing-api__reference__business__received_audience_sharing_requests.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/received_audience_sharing_requests | Alınan kitle paylaşım istekleri | Düşük |
| `marketing-api__reference__business__received_inprogress_onbehalf_requests.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/received_inprogress_onbehalf_requests | Adına alınan devam eden istekler | İlgisiz |
| `marketing-api__reference__business__received_inprogress_transfer_ownership_agreements.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/received_inprogress_transfer_ownership_agreements | Devam eden sahiplik devri anlaşmaları | Düşük |
| `marketing-api__reference__business__received_sharing_agreements.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/received_sharing_agreements | Alınan varlık paylaşım anlaşmaları | Düşük |
| `marketing-api__reference__business__reseller_events.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/reseller_events | Bayi olayları | İlgisiz |
| `marketing-api__reference__business__reseller_guidances.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/reseller_guidances | Çin bayi yönlendirmeleri | İlgisiz |
| `marketing-api__reference__business__resellervettingrequests.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/resellervettingrequests | Bayi müşteri inceleme istekleri | İlgisiz |
| `marketing-api__reference__business__salesrights_inventory_management.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/salesrights_inventory_management | Satış hakları envanter yönetimi | İlgisiz |
| `marketing-api__reference__business__self_certified_whatsapp_business_submissions.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/self_certified_whatsapp_business_submissions | WhatsApp ortak-müşteri doğrulama başvuruları | İlgisiz |
| `marketing-api__reference__business__self_certify_whatsapp_business.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/self_certify_whatsapp_business | Yarım sayfa: WhatsApp ortak doğrulaması, parametre yok | İlgisiz |
| `marketing-api__reference__business__sent_inprogress_onbehalf_requests.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/sent_inprogress_onbehalf_requests | Adına gönderilen devam eden istekler | İlgisiz |
| `marketing-api__reference__business__share_preverified_numbers.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/share_preverified_numbers | Ölü sayfa: ön doğrulamalı numara paylaşımı, içerik yok | İlgisiz |
| `marketing-api__reference__business__shared_audience_permissions.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/shared_audience_permissions | BM'in paylaştığı kitleler | Düşük |
| `marketing-api__reference__business__sso_migrated_business_users.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/sso_migrated_business_users | SSO'ya taşınmış kullanıcılar | İlgisiz |
| `marketing-api__reference__business__sso_unmigrated_business_users.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/sso_unmigrated_business_users | SSO'ya taşınmamış kullanıcılar | İlgisiz |
| `marketing-api__reference__business__system_user_access_tokens.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/system_user_access_tokens | Sistem kullanıcısı token üretimi (scope, asset, 60 gün seçeneği) | Yüksek |
| `marketing-api__reference__business__system_users.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/system_users | BM sistem kullanıcıları; oluşturma (104001, 3949, 3965) | Yüksek |
| `marketing-api__reference__business__third_party_partner_lift_requests.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/third_party_partner_lift_requests | Üçüncü taraf lift istekleri | İlgisiz |
| `marketing-api__reference__business__third_party_partner_panel_recurring_requests.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/third_party_partner_panel_recurring_requests | Üçüncü taraf panel tekrarlı istekleri | İlgisiz |
| `marketing-api__reference__business__third_party_partner_panel_requests.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/third_party_partner_panel_requests | Üçüncü taraf panel istekleri | İlgisiz |
| `marketing-api__reference__business__third_party_partner_viewability_requests.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/third_party_partner_viewability_requests | Üçüncü taraf görünürlük raporları | İlgisiz |
| `marketing-api__reference__business__videos.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/videos | BM video kitaplığı (boyut/süre süzgeçleri) | Düşük |
| `marketing-api__reference__business__whatsapp_business_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/business/whatsapp_business_accounts | BM WABA listesi | İlgisiz |
| `marketing-api__reference__system-user.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/system-user | Sistem kullanıcısı düğümü ve oluşturma | Yüksek |
| `marketing-api__reference__system-user__assigned_ad_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/system-user/assigned_ad_accounts | Sistem kullanıcısına atanmış reklam hesapları ve `tasks` | Yüksek |
| `marketing-api__reference__system-user__assigned_ads_pixels.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/system-user/assigned_ads_pixels | Sistem kullanıcısına atanmış pixel'ler | Yüksek |
| `marketing-api__reference__system-user__assigned_apps.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/system-user/assigned_apps | Sistem kullanıcısına atanmış uygulamalar | Düşük |
| `marketing-api__reference__system-user__assigned_business_asset_groups.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/system-user/assigned_business_asset_groups | Sistem kullanıcısının varlık grupları ve tür bazlı görevleri | Yüksek |
| `marketing-api__reference__system-user__assigned_creative_folders.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/system-user/assigned_creative_folders | Sistem kullanıcısına atanmış kreatif klasörleri | Düşük |
| `marketing-api__reference__system-user__assigned_instagram_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/system-user/assigned_instagram_accounts | Sistem kullanıcısına atanmış IG hesapları (`permitted_roles`) | Yüksek |
| `marketing-api__reference__system-user__assigned_monetization_properties.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/system-user/assigned_monetization_properties | Sistem kullanıcısına atanmış para kazanma varlıkları | İlgisiz |
| `marketing-api__reference__system-user__assigned_offline_conversion_data_sets.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/system-user/assigned_offline_conversion_data_sets | Sistem kullanıcısına atanmış çevrim dışı setler | Düşük |
| `marketing-api__reference__system-user__assigned_pages.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/system-user/assigned_pages | Sistem kullanıcısına atanmış sayfalar ve `tasks` | Yüksek |
| `marketing-api__reference__system-user__assigned_product_catalogs.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/system-user/assigned_product_catalogs | Sistem kullanıcısına atanmış kataloglar | Orta |
| `marketing-api__reference__system-user__assigned_whatsapp_business_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/system-user/assigned_whatsapp_business_accounts | Sistem kullanıcısına atanmış WABA'lar | Düşük |
