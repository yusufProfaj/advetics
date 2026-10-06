# 08 — Ölçüm: Pixel (dataset), Conversions API, dataset kalitesi

> Kaynak: 224 sayfa (`_listeler/H1-olcum.txt`) · Okunan: 224/224 · Bilgi belgeden, canlıda doğrulanmadı.
>
> Okuma derinliği dürüstçe: 64 sayfa içeriksiz yönlendirme saplaması ("This content has moved"), yalnızca hedefi not edildi. 72 `gateway-products__*` sayfası (Conversions API Gateway / Signals Gateway bulut kurulumu) görev tanımı gereği giriş ve başlık düzeyinde okundu; içlerinden yapılandırma, sorun giderme ve sunucu olay ucu tam okundu. Geri kalan 88 sayfa (CAPI çekirdeği, parametreler, dataset kalite API'si, `ads-pixel` düğümü ve 34 kenarı, tracking specs, uygulama/çevrimdışı/CRM/mesajlaşma olayları) tam okundu; SDK kod örnekleri atlandı.
>
> **Bu grupta OLMAYAN ama görev tanımında istenen sayfalar:** standart olay listesi, özel dönüşüm (`CustomConversion`) düğümü, para birimleri sayfası, Aggregated Event Measurement, alan adı doğrulama, mobil ölçüm. Bunlar `kaynak/` altında bu listede yok; `promoted_object` (C-referans grubu) ve `act_/customconversions` (H2-hesap grubu) başka bölümlerde. Aşağıda bunlara değinilen her yerde "bu grupta yok" diye işaretlendi; `promoted_object` için yalnızca çapraz kontrol amacıyla C-referans'taki sayfaya bakıldı.

## Özet: Advetics için ne demek

1. **Dönüşüm kampanyası, pixel'in "var olması" ile değil, SEÇİLEN OLAYIN yakın zamanda gelmesiyle çalışır — ve Meta bu kontrolü bizim yerimize hata olarak söylemez.** Belgede "olay son X günde gelmediyse reklam seti reddedilir" diyen bir kural YOK. Tam da bu yüzden kontrol Advetics'te, yayından ÖNCE yapılmalı: `GET /{pixel}?fields=last_fired_time,is_unavailable`, `GET /{pixel}/event_last_fired_time?event=Purchase`, `GET /{pixel}/recent_events`. Kontrol listesi aşağıda (§ Panel kurgusu).
2. **Ad set'te `promoted_object.pixel_id` verilirse `custom_event_type` ZORUNLU** (C-referans'taki `ad-promoted-object` sayfası). Pixel'i `promoted_object`'e koymak o pixel'i otomatik izlemeye alır; `tracking_specs`'e ayrıca yazmaya gerek yok. `conversion_specs` v2.4'ten beri salt okunur — gönderirsek Meta **sessizce yok sayar**.
3. **`test_event_code` ile gönderilen olaylar ATILMIYOR**: Events Manager'a akıyor ve hedefleme + ölçümde kullanılıyor. Test amacıyla üretim pixeline atılan sahte bir `Purchase`, müşterinin optimizasyonunu ve raporunu kirletir. Üretim yükünde bu alan bulunmamalı.
4. **Parti tek olayla ölür.** `data` en fazla 1.000 olay taşır; içlerinden biri geçersizse ya da `event_time`'ı 7 günden eskiyse **TÜM istek** reddedilir, hiçbir olay işlenmez. Küçük parti + olay düzeyinde doğrulama + yeniden deneme şart.
5. **Tekilleştirme kuralları asimetrik ve sessiz.** `event_id`+`event_name` eşleşmesi 48 saat içinde çalışır. `fbp`/`external_id` ile tekilleştirme yalnızca "önce tarayıcı, sonra sunucu" sırasında çalışır; aynı kaynaktan gelen iki özdeş olay HİÇ tekilleştirilmez. Farklı olaylara aynı `event_id` verilirse Meta birini **atar** — dönüşüm kaybı, hata yok.
6. **Hash kuralı alan alan farklı.** `em, ph, fn, ln, db, ge, ct, st, zp, country` SHA-256 (önce normalleştir); `external_id` önerilir; `client_ip_address, client_user_agent, fbc, fbp, lead_id, ctwa_clid, page_id…` ASLA hash'lenmez. Yanlış tarafı hash'lemek hata vermez, eşleşmeyi düşürür. Eski App Events API hash'siz veriyi açıkça "yok sayıyor".
7. **"200 döndü" doğrulama değil.** Yanıt `events_received` sayısı döndürür; eşleşmeyen olay atıf ve optimizasyonda KULLANILMAZ, yalnızca temel ölçümde sayılır. Gerçek doğrulama: `dataset_quality` (EMQ ≥ 6.0 hedef, olay kapsaması hedefi %75, tekilleştirme anahtarları, tazelik).
8. **Tazelik performansı doğrudan etkiliyor.** ≤1 saat iyi; 2 saati geçen gecikme optimize edilen reklamlarda belirgin düşüş; ≥24 saat atıf ve teslimde ciddi sorun. (İstisna pLTV: orada hız fayda sağlamıyor.)
9. **Advetics ölçüm verisi YAZMAK zorunda değil, OKUMAK zorunda.** Panel ve yapay zekâ için en değerli kısım okuma kenarları: `last_fired_time`, `event_last_fired_time`, `recent_events`, `stats`, `dataset_quality`, `ads_signal_diagnostic_issues`, `customconversions`, `shared_accounts`. CAPI'ye olay göndermek (sunucu tarafı entegrasyon) ayrı bir ürün kararı; belge bunu "platform" olarak yapmak için App Review + Advanced Access istiyor.
10. **Kapalı sözlükler belgede net:** 9 `action_source` değeri, `customer_segmentation` 9 değeri, `data_use_setting`, `first_party_cookie_status`, `automatic_matching_fields`, `stats.aggregation` 16 değeri. AI bunları serbest metinle üretmemeli.
11. **Gateway ürünleri (CAPI Gateway / Signals Gateway) Advetics müşterisi için önerilmez** — müşterinin kendi AWS/GCP hesabında altyapı, DNS CNAME ve bakım istiyor; paylaşımlı VPS'te barındırmak ise proje kuralıyla zaten yasak. Tek satırlık değerlendirme § Panel'de.

## Kavramlar, kurallar ve alanlar

### Pixel = dataset

- Belgeler "Pixel" ve "dataset"i aynı kimlik için kullanıyor: CAPI olayları pixel ID'sine gönderilir; çevrimdışı, uygulama ve mesajlaşma olayları "dataset ID"ye — fiilen aynı uç (`/{id}/events`).
- **Birleşik dataset** (`is_consolidated_container = true`): web + uygulama + mağaza + mesajlaşma tek konteynerde. Uygulama ya da çevrimdışı olayı CAPI ile göndermenin ön koşulu bu; kontrol `GET /{pixel}?fields=is_consolidated_container`.
- Bir datasete **yalnızca bir uygulama** bağlanabilir; bir sayfaya **yalnızca bir dataset** bağlanabilir (mesajlaşma).
- Web olayı için aynı pixel ID hem tarayıcıda hem sunucuda kullanılmalı.

### `AdsPixel` düğümü (okunabilir alanlar)

| Alan | Tip | Advetics için anlamı |
|---|---|---|
| `id`, `name`, `code` | | `code` sitede çalışacak pixel kodu |
| `creation_time`, `creator`, `owner_business` | | `owner_business` null ise pixel hiçbir işletmeye ait değil |
| `last_fired_time` | datetime | **Pixel'in son tetiklenmesi** — ön kontrolün çekirdeği |
| `is_unavailable` | bool | Pixel kullanılamaz durumda (sebep belgede yok) |
| `is_consolidated_container` | bool | Birleşik dataset mi |
| `is_crm` | bool | Lead gen (CRM) veri kaynağı yapılandırması var mı |
| `is_created_by_business` | bool | |
| `has_1p_pixel_event` | bool | Birinci taraf sinyal gelmiş mi |
| `enable_automatic_matching` | bool | Otomatik gelişmiş eşleştirme açık mı |
| `automatic_matching_fields` | list<enum> | `em, fn, ln, ph, ge, zp, ct, st, country, db, external_id` |
| `data_use_setting` | enum | `EMPTY, ADVERTISING_AND_ANALYTICS, ANALYTICS_ONLY` — **`ANALYTICS_ONLY` reklam için kullanılamaz demek olabilir; belgede etkisi açıklanmıyor** |
| `first_party_cookie_status` | enum | `EMPTY, FIRST_PARTY_COOKIE_ENABLED, FIRST_PARTY_COOKIE_DISABLED` — kapalıysa `_fbp/_fbc` çerezi yazılmaz, eşleşme düşer |
| `can_proxy` | bool | |
| v13+ dataset alanları | | `config, description, duplicate_entries, enable_auto_assign_to_accounts, event_stats, event_time_max/min, is_mta_use, is_restricted_use (yalnız Lift), last_upload_app, match_rate_approx, matched_entries, valid_entries, usage` |

`is_restricted_use = true` dataset yalnız Lift içindir; `is_mta_use` yalnız MTA. Bu iki bayraktan biri açıksa reklam optimizasyonunda kullanılıp kullanılamayacağı belgede açık değil — **kısıtla**: optimizasyon olayı olarak önerme.

**Oluşturma:** `POST /act_{id}/adspixels` (`name`). Hata `6200` "bu hesapta zaten bir pixel var", `6202` "birden çok pixel var". Yani bu kenar hesap başına bir pixel varsayıyor.
**Güncelleme:** `POST /{pixel}` ile `automatic_matching_fields, data_use_setting, enable_automatic_matching, first_party_cookie_status, name, server_events_business_ids`. Silme belgede boş.

### Pixel paylaşımı (`shared_accounts`, `agencies`)

- `POST /{pixel}/shared_accounts` (`account_id`, `business` zorunlu) pixel'i reklam hesabına bağlar; `DELETE` aynı parametrelerle ayırır.
- **Eylül 2024 sonundan beri:** işletme hem pixel'e hem reklam hesabına erişimi yoksa bu çağrı çalışmıyor. Önce `POST /{pixel}/agencies` ya da `POST /{ad_account}/agencies` ile işletmeye paylaş, sonra `shared_accounts`.
- Advetics'in havuz modelinde ajans, müşteri BM'ine partner; pixel'in reklam hesabıyla paylaşılmamış olması, dönüşüm kampanyasında pixel seçicisinin boş gelmesi demek. Sebep "pixel yok" değil "pixel bu hesaba paylaşılmamış" olabilir — ayrı söylenmeli (`emptyReason`).

### Conversions API: gönderim

- Uç: `POST https://graph.facebook.com/{v}/{PIXEL_ID}/events?access_token=…`. CAPI çağrıları Marketing API çağrısı sayılır; ayrı bir hız sınırı yok, tek sınır **istek başına 1.000 olay**. Belgedeki örnek sürüm `v25.0`; CAPI sürümleri en az iki yıl destekleniyor.
- Gövde: `data` (zorunlu, olay dizisi), `test_event_code` (opsiyonel), `partner_agent` (platformlar için), `/events` kenarında ayrıca `platforms[]` ve `progress` (çevrimdışı yükleme ilerlemesi).
- Yanıt: `{ events_received, messages[], fbtrace_id }`.
- `event_time`: Unix **saniye**, GMT, en fazla 7 gün geçmiş. 7 günü aşan TEK olay tüm isteği düşürür. `physical_store` olaylarında "62 gün içinde yükleyin" deniyor — **belgede çelişkili** (aynı paragrafta 7 gün kuralı tekrar ediliyor; 62 günün nasıl mümkün olduğu açıklanmıyor).
- Gecikme: 20 dakika içinde Events Manager'da görünmeli.
- Hata: geçerliyse 2xx, geçersizse 4xx ve az ayrıntı. Zaman aşımı gibi istemci dışı hatalarda yeniden dene; önerilen zaman aşımı 1.500 ms, tipik yanıt < 600 ms.

### Sunucu olayı alanları

| Alan | Zorunluluk | Not |
|---|---|---|
| `event_name` | Zorunlu | Standart ya da özel ad; tekilleştirmede kullanılır |
| `event_time` | Zorunlu | saniye, ≤ 7 gün |
| `user_data` | Zorunlu | En az bir müşteri parametresi |
| `action_source` | Zorunlu (her olay) | `email, website, app, phone_call, chat, physical_store, system_generated, business_messaging, other` |
| `event_source_url` | Web olayında zorunlu | Doğrulanmış alan adıyla eşleşmeli |
| `client_user_agent` (user_data içinde) | Web olayında zorunlu | |
| `custom_data` | Opsiyonel | value, currency, contents… |
| `event_id` | Opsiyonel ama tekilleştirme için şart | Sipariş no ya da rastgele; tarayıcıdaki `eventID` ile aynı |
| `opt_out` | Opsiyonel | `true` → yalnız atıf, **optimizasyonda kullanılmaz** |
| `data_processing_options` | Opsiyonel | `["LDU"]` ya da `[]` |
| `data_processing_options_country` | LDU varsa zorunlu | `1` = ABD, `0` = Meta konumlasın |
| `data_processing_options_state` | Bazı durumlarda | `1000` = Kaliforniya, `0` = konumla. Ülke verip eyalet vermezsen tüm olay için konumlama uygulanır |
| `referrer_url` | Opsiyonel | |
| `original_event_data` | Opsiyonel | Gecikmeli olayı ilk olaya bağlar (`event_name, event_time, order_id, event_id`) |
| `customer_segmentation` | Opsiyonel enum | `new_customer_to_business, new_customer_to_business_line, new_customer_to_product_area, new_customer_to_medium, existing_customer_to_business, existing_customer_to_business_line, existing_customer_to_product_area, existing_customer_to_medium, customer_in_loyalty_program` — **tabloda üst düzey alan, örnekte `custom_data` içinde: belgede belirsiz** |
| `app_data` / `extinfo` | Uygulama olayında zorunlu | aşağıda |
| `messaging_channel` | Mesajlaşma olayında | `messenger, whatsapp, instagram` — sunucu olayı tablosunda listelenmiyor, yalnız mesajlaşma rehberinde |

`action_source` notu iki sayfada farklı: sunucu olayı sayfası "bütün kaynaklar optimizasyonu etkinleştirir", AppendAttribution referansı "`physical_store` HARİÇ hepsi" diyor. **Belgede çelişkili** — mağaza olayını optimizasyon olayı olarak önerme.

### Müşteri bilgisi parametreleri (`user_data`) ve hash

| Alan | Hash | Normalleştirme |
|---|---|---|
| `em` | SHA-256 | kırp, küçük harf |
| `ph` | SHA-256 | sembol/harf/baştaki sıfırları at, **ülke kodu ŞART** (TR: `90…`) |
| `fn`, `ln` | SHA-256 | küçük harf, noktalama yok; Latin dışı karakter UTF-8 olarak (`ş, ğ` korunur, örnekteki `valéry`) |
| `db` | SHA-256 | `YYYYMMDD` |
| `ge` | SHA-256 | `f` / `m` |
| `ct` | SHA-256 | küçük harf, boşluksuz, noktalamasız |
| `st` | SHA-256 | ABD dışı: küçük harf, boşluk/noktalama yok |
| `zp` | SHA-256 | küçük harf, boşluk/tire yok |
| `country` | SHA-256 | ISO 3166-1 alpha-2 küçük harf (`tr`); hep gönder |
| `external_id` | önerilir | Bütün kanallarda AYNI biçim ve aynı hash yöntemi |
| `client_ip_address` | ASLA | geçerli IPv4/IPv6, IPv6 tercih; sunucuda elle eklenmeli |
| `client_user_agent` | ASLA | web için zorunlu |
| `fbc`, `fbp` | ASLA | çerez değerleri, büyük/küçük harf korunur |
| `subscription_id, fb_login_id, lead_id, anon_id, madid, page_id, page_scoped_user_id, ctwa_clid, ig_account_id, ig_sid` | ASLA | `anon_id`, `madid` yalnız uygulama |

**v13 sonrası GEÇERSİZ sayılan kombinasyonlar** — olayda yalnızca bunlar (ya da alt kümeleri) varsa olay reddedilir: `ct+country+st+zp+ge+client_user_agent`, `db+client_user_agent`, `fn+ge`, `ln+ge`.

Yüksek değerli anahtarlar: `em`, `client_ip_address`, `fn+ln`, `ph`. En az `em`/`ph`/`external_id`/`fbc`'den biri olmadan kampanyayı CAPI olayına optimize etmek anlamsız.

### `fbc` / `fbp`

- `fbc` = `fb.{subdomainIndex}.{creationTime_ms}.{fbclid}`. `subdomainIndex`: `com`=0, `example.com`=1, `www.example.com`=2; sunucuda üretiliyorsa 1. `creationTime` **milisaniye** (oysa `event_time` saniye). `fbclid` büyük/küçük harfe duyarlı — küçük harfe çevirmek değeri sessizce bozar.
- Çerez önerisi: HTTP çerezi, 90 gün; yalnız çerez yoksa ya da URL'deki `fbclid` çerezdekinden farklıysa yaz.
- `fbp` = `fb.{subdomainIndex}.{creationTime_ms}.{random}`; pixel birinci taraf çerez kullanıyorsa kendisi yazar.
- Değerler oturumlar arasında değişir; profildeki değer tazelenmeli.
- Parameter Builder kütüphanesi bu değerlerin (ve hash'lenmiş PII'nin, hatta IP'nin) sonuna **8 karakterlik bir ek** koyar (`….ABcDEFGh`): SDK sürümü, dil vb. Bunu elle üretilen değerle karıştırmak ya da ekli değeri yeniden normalleştirmek eşleşmeyi bozar. "Yalnızca bir kez normalleştir ve hash'le" kuralı açık.

### `external_id`

- Kanallar arası birebir aynı olmalı (pixel'de `123` ise CAPI'de `123`).
- İlk olayda PII ile eşleşme kurulur; sonraki olaylarda yalnız `external_id` yeter. Eşleşme periyodik olarak süresi dolar → düzenli tazele.
- `fbp` var `external_id` yoksa Meta `fbp`'yi `external_id` gibi kullanır (çerez süresi dolar).
- Müşteri dosyası özel kitlesi yalnız `external_id` ile kurulamaz.
- Test Events aracında `external_id` görünmez.

### `custom_data` (standart parametreler, seçme)

- `value` — parasal değer; Purchase'ta ve değer optimizasyonunda zorunlu. Uygulamada karşılığı `_valueToSum`.
- `currency` — ISO 4217; Purchase'ta zorunlu. **Meta'nın kendi örneklerinin bir kısmı `"usd"` küçük harf kullanıyor, tanım ise üç harfli kod diyor** — büyük harf gönder, küçük harfin kabul edilip edilmediği belgede belirsiz. Para birimleri listesi bu grupta yok.
- `content_ids`, `content_type` (`product` | `product_group`), `contents` (`id, quantity, item_price, delivery_category`), `num_items` (yalnız InitiateCheckout), `search_string` (yalnız Search), `order_id` (string), `delivery_category` (`in_store, curbside, home_delivery`), `predicted_ltv`, `net_revenue`, `lead_event_source`, `product_catalog_id`, ve otomotiv/emlak/otel/seyahat dikey alanları (enum'larıyla).
- Çevrimdışı olaylarda ayrıca `store_data` (`store_page_id, brand_page_id, store_code`), `item_number`.

### Tekilleştirme

| Yöntem | Koşul | Sınır |
|---|---|---|
| `event_id` + `event_name` (önerilen) | Tarayıcıda `fbq('track', ad, {...}, {eventID})` — 4. argüman; görsel pixel'de `eid` | 48 saat; aynı pixel ID. Yaklaşık aynı anda (5 dk) gelirse tarayıcı olayı tercih edilir; içerik farkı yoksa genelde İLK gelen tutulur |
| `fbp` ve/veya `external_id` + `event_name` | İki kanalda da tutarlı | Yalnız "önce tarayıcı sonra sunucu" sırasında çalışır; son 48 saatte tarayıcı olayı yoksa sunucu olayı atılmaz |
| Tek kaynak içi tekrar | — | **Tekilleştirilmez** (iki özdeş sunucu olayı = iki olay) |
| Çevrimdışı | `order_id` (varsayılan) yoksa kullanıcı tabanlı; anahtar `dataset_id+event_time+event_name+item_number` | Yalnız çevrimdışı↔çevrimdışı, 7 gün |
| Uygulama kurulumları | otomatik | 90 gün, ilk kurulum tutulur |
| `order_id` tabanlı Purchase tekilleştirme | `custom_data.order_id` | **Yalnız seçili partnerler**; 48 saat ya da 28 gün pencere |
| İş mesajlaşma | — | **Meta tekilleştirme yapmıyor**, gönderen yapmalı |

### Olay tazeliği ve doğrulama

- Gerçek zamanlı ya da ≤1 saat. >2 saat: optimize edilen reklamda belirgin performans düşüşü. ≥24 saat: atıf ve optimize teslimde ciddi sorun.
- Events Manager'da: alınan / tekilleştirilen / eşleşen olay sayıları, Bağlantı Yöntemi, Olay Tazeliği sekmesi, Tekilleştirme sekmesi (tekilleştirme oranı ve "Overlap"), EMQ.
- **EMQ**: 10 üzerinden (bir sayfada "1-10"); hedef ≥ 6.0; **yalnızca web olayları** için hesaplanıyor. Çevrimdışı, uygulama, CRM olaylarında EMQ yok — "EMQ boş" bir hata değil.

### Dataset Quality API (eski adı Integration Quality)

- `GET /{v}/dataset_quality?dataset_id=…&fields=web{…}` — `agent_name` verilirse yalnız o `partner_agent` ile gelen olaylar, verilmezse hepsi.
- `web[]` öğesi: `event_name`, `event_match_quality{composite_score, match_key_feedback[{identifier, coverage{percentage}, potential_aly_acr_increase}], diagnostics[{name, description, solution, percentage, affected_event_count, total_event_count}]}`, `event_potential_aly_acr_increase`, `acr{percentage, description}`, `event_coverage{percentage, goal_percentage(75), description, potential_aly_acr_increase}`, `dedup_key_feedback` (örnekte `dedupe_key_feedback` — **alan adı belgede tutarsız**) `{dedupe_key, browser_events_with_dedupe_key, server_events_with_dedupe_key, overall_browser_coverage_from_dedupe_key}`, `data_freshness{upload_frequency (ör. real_time, hourly), description}`.
- 28 Mayıs 2025'te ACR, olay kapsaması, tekilleştirme, tazelik ve EMQ teşhisleri eklendi.
- Çevrimdışı (beta): `fields=offline{event_name, composite{score,recommendation}, match_key{score,recommendation,coverage{email,phone}}, frequency, freshness}`; 28 günlük; **composite ≥ 8.5 omnichannel reklamların kapısı**. Hata `2044055` = dataset yok, `10` = uygulama izni yok.
- İzinler: kullanıcı/sistem kullanıcısı için en az "Kısmi erişim → Etkinlik veri setini kullan"; uygulama için `ads_read` + (`ads_management` ya da `business_management`); çok sayıda dataset için `ads_management` Advanced + Marketing API Access Tier (App Review).
- **Müşterinin Events Manager'da ürettiği sistem kullanıcısı belirteci ile EMQ API çalışmıyor** ve bu tür belirteç yalnız veri GÖNDEREBİLİR, GET yapamaz. Temmuz 2025 öncesi Events Manager belirteçleri için reklamverenin bir kez onay vermesi gerekiyor.
- Eski kenarlar: `GET /{pixel}/integration_quality` (`agent_name, time_range`) ve `GET /{pixel}/setup_quality` (`agent_name`) — ikisi de `AdsPixelCAPIIntegrationQuality` döner.

### Teşhis ve sağlık kenarları (`/{pixel}/…`)

| Kenar | Zorunlu parametre | Kullanım |
|---|---|---|
| `event_last_fired_time` | (`event`) | Olay başına son tetiklenme |
| `domain_last_fired_time` | `domain_name_list` | Açılış sayfası alan adında pixel çalışıyor mu |
| `recent_events` | `event`, `lookback_window` (saniye) | Son X saniyedeki olay sayısı |
| `stats` | — | `aggregation` (varsayılan `event`): `browser_type, custom_data_field, device_os, device_type, event, host, match_keys, had_pii, pixel_fire, event_detection_method, url, event_value_count, url_by_rule, event_total_counts, event_source, event_processing_results`; `event_source` = `WEB_ONLY`/`SERVER_ONLY`; **en fazla 7 gün geriye**; saatlik kırılım; url'de sorgu parametreleri atılır; top 100 olay / 10.000 host-url |
| `raw_fires` | `event` | `filter_type`: `device_type, event_detection_method, host, url` |
| `ads_signal_diagnostic_issues` | `ad_account_id` | Reklam hesabına göre sinyal sorunları (düğüm alanları belgede yok) |
| `cpas_events_debugging_info` | (`action_source`) | Son günlerde olay × teşhis sayıları |
| `da_checks` | (`checks`: `pixel_missing_param_in_events`, `pixel_decline`; `connection_method`: `ALL, APP, BROWSER, SERVER`) | Dinamik/katalog reklam hazırlığı |
| `pixel_delivery_recommendations` | — | Pixel'e göre teslim önerileri (alanlar belgede yok) |
| `customconversions` | (`ad_account`) | Pixel'e bağlı özel dönüşümler, yalnız okuma |
| `audiences` | (`action_source`, `ad_account`) | Pixel kaynaklı özel kitleler |
| `domain_control_rule` | (`type`: `BLACKLIST`/`WHITELIST`) | Alan adı engel/izin kuralları |
| `assigned_users` | `business` | Atanmış kullanıcılar |
| `shared_accounts` | `business` | Paylaşıldığı reklam hesapları |
| `server_events_permitted_business` | — | Sunucu olayı gönderebilen işletmeler |
| `real_time_event_log` | — | Oturum açmış kullanıcının son tetiklemeleri (limit 100) |

Hız sınırı hatası `80004` (`stats`, `da_checks`, düğümün kendisi) — reklam hesabı kotasına yazılıyor.

### Tracking specs ve conversion specs

- `tracking_specs` (reklam düzeyi): yalnız ölçüm, teslimi etkilemez. Biçim `{'action.type':'offsite_conversion','fb_pixel':ID}` gibi action spec.
- Bazı hedef/teklif/kreatif kombinasyonlarının varsayılan tracking specs'i var; ek spec eklemek onları silmez — **AMA `APP_INSTALLS` ve `OUTCOME_ENGAGEMENT` hedeflerinde Meta varsayılanları EZER**; korumak için onları da listeye yazmak gerekir.
- `promoted_object`'teki pixel otomatik izlenir. Birden çok pixel'i izleyip birine optimize etmek mümkün.
- `conversion_specs` v2.4'ten beri salt okunur, `optimization_goal`'dan türer; gönderilen değer yok sayılır.
- Uygulama yükleme/etkileşim reklamlarında uygulama kimliğiyle tracking spec AÇIKÇA verilmeli.
- `leadgen_quality_conversion` aksiyon tipi CRM huni olaylarını (`fb_pixel` ya da `dataset`) izler.

### `promoted_object` ilişkisi (çapraz kontrol — C-referans grubu)

- `pixel_id` verilirse `custom_event_type` zorunlu; ayrıca `pixel_rule`, `pixel_aggregation_rule`, `custom_conversion_id`, `offline_conversion_data_set_id`, `value_semantic_type`, `custom_event_str` (`custom_event_type = OTHER` ile) alanları var.
- `custom_event_type` enum'u: `AD_IMPRESSION, RATE, TUTORIAL_COMPLETION, CONTACT, CUSTOMIZE_PRODUCT, DONATE, FIND_LOCATION, SCHEDULE, START_TRIAL, SUBMIT_APPLICATION, SUBSCRIBE, ADD_TO_CART, ADD_TO_WISHLIST, INITIATED_CHECKOUT, ADD_PAYMENT_INFO, PURCHASE, LEAD, COMPLETE_REGISTRATION, CONTENT_VIEW, SEARCH, SERVICE_BOOKING_REQUEST, MESSAGING_CONVERSATION_STARTED_7D, LEVEL_ACHIEVED, ACHIEVEMENT_UNLOCKED, SPENT_CREDITS, LISTING_INTERACTION, D2_RETENTION, D7_RETENTION, OTHER`. Bu **büyük harfli enum** ile CAPI'deki **olay adı** (`Purchase`, `InitiateCheckout`, `ViewContent`) farklı sözlükler; eşleme tablosu kodda tek yerde tutulmalı.
- Var olan ad set'e `promoted_object` sonradan eklenemez; `pixel_id/pixel_rule/custom_event_type` değişimi yalnız belli hedeflerde (`CONVERSIONS`, `PRODUCT_CATALOG_SALES`, `OFFSITE_CONVERSIONS`) mümkün. Ayrıntı C-referans bölümünde.

### Uygulama olayları

- Datasete bir uygulama bağlı olmalı (Events Manager'dan). `action_source = app`.
- `app_data.advertiser_tracking_enabled` (iOS 14.5+ ATT, 0/1) ZORUNLU; `application_tracking_enabled` opsiyonel; `extinfo` 16 elemanlı dizi, ZORUNLU, sıra sabit, eksik değer boş dize: [0] sürüm `a2` (Android) / `i2` (iOS) zorunlu, [4] işletim sistemi sürümü zorunlu. Eleman tipleri bir sayfada `string`, diğerinde ekran ölçüleri için `int64` — belgede tutarsız; örneklerin hepsi dize.
- `campaign_ids`: tıklamada URL'ye/deep link'e eklenen şifreli dize (App AEM). Uygulama standart olay adları `fb_mobile_purchase`, `fb_mobile_add_to_cart`… web adlarından FARKLI (AppendAttribution'da `Purchase` yazmak uygulama olayıyla eşleşmiyor).
- Eski `/{app-id}/activities` (App Events API) yeni entegrasyon için önerilmiyor; olay adı sınırı 1.000 (aşınca yeni tür loglanmaz, `100 Invalid parameter`); sunucudan gönderirken `X-Forwarded-For` ile cihaz IP'si; burada ülke anahtarı `cn` (CAPI'de `country`).

### Çevrimdışı / mağaza olayları

- `action_source = physical_store`; birleşik dataset gerekli. Gerçek zamanlı ya da günlük yükleme.
- Bu sayfadaki müşteri parametresi tablosu `email, phone, gen, zip` adlarını kullanıyor; CAPI'nin genel tablosu `em, ph, ge, zp`. **Belgede çelişkili** — CAPI ucuna `em/ph/ge/zp` gönder (örnek yük de öyle).
- `upload_tag` eski çevrimdışı API kullanıcıları için hâlâ destekleniyor.

### CRM (Conversion Leads) olayları

- Yalnız Facebook/Instagram Instant Form lead'leri için (SSS "Website Forms" da diyor — **belgede çelişkili**).
- Yük: `event_name` = CRM aşaması (serbest), `event_time` = aşama değişim zamanı (lead oluşturma zamanından SONRA olmalı, değilse atılabilir), `action_source = system_generated`, `user_data.lead_id` (15-17 hane, `leadgen_id`; geçersizse olay reddedilir), `custom_data.lead_event_source` (CRM adı), `custom_data.event_source = "crm"`.
- **`lead_event_source` ya da `event_source` eksik olay CAPI'ye kabul edilir, Events Manager'da GÖRÜNÜR, ama Conversion Leads için hiç sayılmaz.**
- Ham lead dahil HER aşama gönderilmeli (100 lead → 100 "raw lead" + sonraki aşamalar = örnekte 215 olay); en az 2, tercihen 3+ aşama; ≥ %60 lead kapsaması; ≥ 200 lead/ay; hedef aşama ≤ 28 gün ve %1-40 dönüşüm; en az 7 gün veri.
- Geri doldurma en fazla 7 gün; `event_time`'ı değiştirerek daha eskiye geri doldurmak tüm geri doldurulan veriyi attırabilir.
- Öğrenme 2-4 hafta (SSS'de 1-2 ay, platform sayfasında 3-4 hafta — **belgede çelişkili**). Sistem seçilenden farklı bir aşamaya optimize edebilir. Entegrasyon tamamlandıktan sonra pixel değiştirmek eğitimi sıfırlar.
- Kodsuz yollar: Zapier "Send Funnel Event", Salesforce Outbound Message (Meta hash'liyor). HubSpot Lead Sync ve Zoho Social lead ID'yi saklamıyor.

### İş mesajlaşma (Click-to-Messenger/WhatsApp/Instagram)

- `action_source = business_messaging`, `messaging_channel`; kullanıcı: Messenger `page_id + page_scoped_user_id`, WhatsApp `whatsapp_business_account_id + ctwa_clid` (mesaj webhook'undaki `referral` nesnesinden), Instagram `instagram_business_account_id + ig_sid`.
- Dataset: `POST /{PAGE_ID|WABA_ID|IG_USER_ID}/dataset` — varsa mevcut ID'yi döner.
- İzinler: `page_events`, `whatsapp_business_management` + `whatsapp_business_manage_events`, `instagram_manage_events` (Advanced).
- Desteklenen olaylar: `Purchase, LeadSubmitted, InitiateCheckout, AddToCart, ViewContent, OrderCreated, OrderShipped, OrderDelivered, OrderCanceled, OrderReturned, CartAbandoned, QualifiedLead, RatingProvided, ReviewProvided`.
- **Satın alma optimizasyonu yalnız Click-to-Messenger ve Click-to-WhatsApp'ta**; Instagram'da yok (yalnız sohbet optimizasyonu). Sohbet dışında olan dönüşüm web/app CAPI'siyle gönderilir.
- On-Premises WhatsApp API'nin son sürümü 23 Ekim 2025'te sona erdi; `ctwa_clid` yalnız Biz API 2.45.1+.

### Değer optimizasyonu ve pLTV

- Değer optimizasyonu Satış (Sales) hedefinde tüm standart ve özel olaylarda çalışır; `value` + `currency` pixel ve CAPI'de AYNI olmalı.
- pLTV: yalnız web; ≥5 farklı pozitif değer, en yüksek ≥ 3× en düşük; son 4 haftanın her birinde ≥100 Meta'ya atfedilmiş dönüşüm; dataset "Core Setup"ta olmamalı; dataset başına tek dönüşüm olayı (`Purchase, Subscribe, StartTrial, CompleteRegistration, AddPaymentInfo` ya da özel). Gecikmeli gönderim `AppendValue` olayı ile 7 gün içinde (süre dönüşüm olayının GÖNDERİLDİĞİ andan sayılır). Eğitim ~2 hafta, ısınma ~7 gün. pLTV ROAS'ı yalnız pLTV kampanyalarıyla karşılaştırılabilir.

### AppendAttribution (beta, sınırlı erişim)

- Kendi atıf modelinin kredisini `AppendAttribution` olayıyla, orijinal Purchase'tan **48 saat içinde** gönderme; Custom Attribution Source (CAS) gerekli; 14 gün eğitim; yaşam döngüsü `Pending → In Training → Setup Complete → Ready to Use / Quality Issue`.
- `attribution_data{ad_id, touchpoint_ts, attribution_share (0-1), attribution_value = share × value}`; `touchpoint_ts < original_event_data.event_time`. Advetics için şimdilik ilgisiz.

### Erişim, belirteç, partner

- Events Manager'dan belirteç: "Generate access token" yalnız geliştirici yetkili kullanıcıya görünür; App Review gerekmez. Kendi uygulama + sistem kullanıcısı da olur. v12'den beri belirteç tüm sürümlerde çalışır.
- Platform olarak (başka işletmeler adına) CAPI: App Review, Advanced Access, Marketing API Access Tier, `ads_management` (ya da `business_management`) + `pages_read_engagement` + `ads_read`. Erişim yolları: Facebook Login for Business (önerilen), Meta Business Extension (beta/onaylı partner), müşteri pixel'ini partner BM'ine paylaşır, müşteri sistem kullanıcısı belirteci üretip verir (yalnız POST).
- Erişim kademesi adları değişti: "Standard" → **Limited**, "Advanced" → **Full**; Full eşiği 15 günde 1.500'den **500** Marketing API çağrısına indi. Mesajlaşma ve CRM-platform sayfaları hâlâ 1.500 + < %10 hata oranı diyor — **belgede tutarsız**, yeni sayfalar 500.
- `partner_agent`: platform kimliği, < 23 karakter, en az 2 harf; `dataset_quality.agent_name` bunun küçük harfli normalleştirilmiş hali.

## API çağrıları

```http
# Pixel durumu (ön kontrolün çekirdeği)
GET /v25.0/{pixel_id}?fields=name,owner_business,last_fired_time,is_unavailable,is_consolidated_container,is_crm,data_use_setting,first_party_cookie_status,enable_automatic_matching

# Reklam hesabının pixel'leri / pixel oluşturma
GET  /v25.0/act_{id}/adspixels
POST /v25.0/act_{id}/adspixels          name=…        # 6200: zaten var, 6202: birden çok var

# Olay bazında son tetiklenme ve son X saniyedeki sayı
GET /v25.0/{pixel_id}/event_last_fired_time?event=Purchase
GET /v25.0/{pixel_id}/recent_events?event=Purchase&lookback_window=604800
GET /v25.0/{pixel_id}/domain_last_fired_time?domain_name_list=["ornek.com"]

# Tarayıcı / sunucu ayrımıyla 7 günlük istatistik
GET /v25.0/{pixel_id}/stats?aggregation=event_total_counts&event_source=SERVER_ONLY&start_time=…&end_time=…

# Reklam hesabına göre sinyal sorunları
GET /v25.0/{pixel_id}/ads_signal_diagnostic_issues?ad_account_id={id}

# Özel dönüşümler ve paylaşım
GET    /v25.0/{pixel_id}/customconversions?ad_account={id}
GET    /v25.0/{pixel_id}/shared_accounts?business={bm_id}
POST   /v25.0/{pixel_id}/shared_accounts     account_id=… business=…
DELETE /v25.0/{pixel_id}/shared_accounts     account_id=… business=…

# Dataset kalitesi
GET /v25.0/dataset_quality?dataset_id={pixel_id}&fields=web{event_name,event_match_quality{composite_score,match_key_feedback,diagnostics},event_coverage{percentage,goal_percentage},data_freshness{upload_frequency}}

# Conversions API (yazma)
POST /v25.0/{pixel_id}/events
{ "data": [ {
    "event_name": "Purchase", "event_time": 1760000000, "action_source": "website",
    "event_id": "SIPARIS-123", "event_source_url": "https://ornek.com/tesekkurler",
    "user_data": { "em": ["<sha256>"], "ph": ["<sha256 90…>"],
                   "client_ip_address": "…", "client_user_agent": "…", "fbc": "fb.1.…", "fbp": "fb.1.…" },
    "custom_data": { "value": 1250.00, "currency": "TRY", "order_id": "SIPARIS-123" } } ] }
# yanıt: { "events_received": 1, "messages": [], "fbtrace_id": "…" }

# CRM huni olayı
{ "event_name": "nitelikli_lead", "event_time": …, "action_source": "system_generated",
  "user_data": { "lead_id": 1234567890123456 },
  "custom_data": { "lead_event_source": "Advetics", "event_source": "crm" } }

# Mesajlaşma dataset'i
POST /v25.0/{page_id | waba_id | ig_user_id}/dataset
```

## Tuzaklar ve sessiz hata riskleri

1. **`test_event_code` olayları üretime işleniyor** (hedefleme + ölçüm). Kalıcı bir "test gönder" düğmesi müşteri verisini kirletir. Üretim yolunda alan kod düzeyinde yasaklanmalı.
2. **Partideki tek kötü olay tüm partiyi düşürür** (1.000'e kadar). Hata sebebi ayrıntısız; hangi olayın bozuk olduğu yanıtta söylenmeyebilir. Olayları göndermeden önce şema doğrulaması ve küçük parti.
3. **Hash'lenmemiş PII** CAPI'de "kabul edilmiyor", App Events API'de "yok sayılıyor". İkincisi tamamen sessiz.
4. **Yanlış alanı hash'lemek** (IP, user agent, `fbc`) hata vermez; eşleşme oranı düşer, kalite "Low".
5. **Geniş kombinasyonlu `user_data`** (yalnız şehir+cinsiyet gibi) v13'ten beri olayı geçersiz kılıyor; Zapier bunu "çok geniş müşteri parametresi" hatası olarak gösteriyor.
6. **`fbc` küçük harfe çevrilirse** değer bozulur, hata yok. `creationTime` milisaniye, `event_time` saniye — birini ötekiyle karıştırmak sessiz.
7. **Telefon ülke kodsuz** gönderilirse eşleşmez ("Türkiye'deki tüm müşteriler" varsayımı tam da belgenin uyardığı hata).
8. **`event_id` aynı değeri farklı olaylarda taşırsa** Meta sonrakini atar → dönüşüm kaybı.
9. **`fbp`/`external_id` tekilleştirmesi sunucu önce gelirse çalışmıyor**; aynı kaynaktan tekrar eden olay hiç tekilleştirilmiyor → çift sayım, şişkin ROAS.
10. **Mesajlaşma olaylarında Meta tekilleştirme YAPMIYOR**.
11. **`opt_out: true`** olayı optimizasyondan çıkarır; yanlışlıkla açık bırakılırsa kampanya "olay geliyor ama öğrenmiyor".
12. **`data_processing_options_country` verip `state` vermemek** tüm olay için konumlamayı tetikler.
13. **CRM olayında `lead_event_source`/`event_source` eksikse** olay Events Manager'da görünür ama Conversion Leads'e hiç girmez. **`event_time` lead oluşturmadan önceyse** olay atılabilir. Geri doldurma için `event_time`'ı oynamak bütün geri doldurmayı attırabilir.
14. **Conversion Leads seçtiğinden farklı aşamaya optimize edebilir**; entegrasyondan sonra pixel değişirse eğitim sıfırlanır.
15. **`APP_INSTALLS` ve `OUTCOME_ENGAGEMENT`'te özel `tracking_specs` varsayılanları ezer.**
16. **`conversion_specs` gönderilirse yok sayılır** (salt okunur).
17. **Tazelik**: olaylar toplu ve günlük gönderilirse (>2 saat, ≥24 saat) hata yok, performans düşer. Gecelik toplu gönderim bu projede doğal görünür ama ölçüm için yanlış.
18. **Belge tutarsızlıkları** (her biri "doğru olan hangisi" sorusunu canlıda doğrulamayı gerektirir): `currency` örneklerinde `"usd"`; çevrimdışı tabloda `email/phone/gen/zip`; App Events'te `cn`; `customer_segmentation` yeri; `extinfo` eleman tipleri; `dedup_key_feedback` / `dedupe_key_feedback`; `action_source=physical_store` optimizasyonu; `physical_store` 7 gün / 62 gün; CRM öğrenme süresi; Instant Form / Website Form; erişim eşiği 500 / 1.500.
19. **Kalite verisinin YOKLUĞU iki ayrı şey**: EMQ yalnız web olayında var (CRM/app/offline'da boş olması normal), müşteri sistem kullanıcısı belirteciyle `dataset_quality` HİÇ okunamaz. İkisi de "boş" görünür; `emptyReason` ayırmalı.
20. **`stats` en fazla 7 gün geriye bakıyor.** "Son 30 günde olay yok" sorusu bu kenarla cevaplanamaz; `last_fired_time`/`event_last_fired_time` kullanılmalı.
21. **Pixel reklam hesabıyla paylaşılmamışsa** pixel listesi boş gelir; Eylül 2024'ten beri paylaşım için işletmenin iki varlığa da erişimi şart.
22. **Gateway**: Event Setup Tool ile tanımlanmış olaylar Gateway'den GEÇMİYOR; engelli listedeki alan adından gelen olaylar hedefe gönderilmiyor; CSP başlığı olayları engelleyebiliyor; `badToken` ancak GraphQL sorgusuyla görülüyor. Hepsi sessiz.
23. **Parameter Builder eki** IP ve hash'in sonuna eklenir; elle üretilen değerle karıştırmak ya da ikinci kez normalleştirmek eşleşmeyi bozar.
24. **`event_source_url` doğrulanmış alan adıyla eşleşmeli** — eşleşmezse ne olduğu belgede yok (alan adı doğrulama bu grupta değil).

## Advetics'in canlı bilgisiyle karşılaştırma

| # | Canlı bilgi | Bu gruptaki belge |
|---|---|---|
| 6 | Click-to-WhatsApp kurulumu | **Uyuşuyor/tamamlıyor**: CTWA için sunucu tarafı dönüşüm `ctwa_clid` ile (webhook `referral` nesnesi), `action_source=business_messaging`, `messaging_channel=whatsapp`. CTWA ve Click-to-Messenger satın alma optimizasyonu CAPI ile açılıyor; Instagram'da yok. Reklam kurulumunun kendisi (ad set `destination_type`, kreatif bağlantısı) bu grupta geçmiyor. |
| 8 | Insights'ta `use_unified_attribution_setting` + `action_report_time` açıkça gönderiliyor | **Dolaylı destek**: eski App Events API sayfası "Ads Manager 1 gün görüntüleme / 28 gün tıklama kullanıyor" diyor — bugünkü varsayılanla uyuşmayan eski bir bilgi. Atıf penceresinin belgeden belgeye değişmesi, onu varsayılana bırakmamanın gerekçesini güçlendiriyor. Insights parametreleri bu grupta yok. |
| 10 | `act_` önekli hesap kimliği | **Uyuşuyor**: pixel oluşturma `POST /act_{id}/adspixels`. Ama `ads_signal_diagnostic_issues?ad_account_id=` ve `shared_accounts account_id=` parametrelerinde **önek olup olmayacağı belgede belirsiz** (tip `int64`/numeric string → muhtemelen öneksiz). `actPath()` gibi bir yardımcıyla iki biçim ayrı tutulmalı. |
| 7 | `limit=500` → "reduce the amount of data", limit yarılanmalı | **İlişkili ama farklı**: CAPI'de sabit sınır istek başına 1.000 olay ve tek kötü olay tüm partiyi düşürüyor. Yarılama mantığı burada da işe yarar: parti reddedilirse ikiye bölüp hangi olayın bozuk olduğunu bul. |
| 12 | Organik istatistik adları değişti | Değinilmiyor; ama aynı ders burada da geçerli: `dataset_quality` alanları 28 Mayıs 2025'te genişledi ve bir alan adı belgede iki biçimde yazılı. Yeni alanı istemeden önce betikle ölç. |
| 1-5, 9, 11 | Boost `destination_type`, `geo_locations` birleşimi, IG kimlik uzayları, imzalı görsel adresleri, `?ids=` toplu sorgu, `age_max`, ilgi alanı araması | Bu grupta geçmiyor. |
| — | "200 döndü doğrulama değil" (proje ilkesi) | **Belge kendi içinde çelişiyor**: platform SSS'si bağlantı testini "200 dönüş kodunu kontrol edin" diye tarif ediyor; aynı belgeler eşleşmeyen olayın atıf/optimizasyonda kullanılmadığını, test olaylarının üretime aktığını söylüyor. Advetics ilkesi doğru: 200 + `events_received` sonrası Events Manager / `dataset_quality` ile doğrula. |

## Yapay zekâ ile yönetim için çıkarımlar

**Araç olmalı (salt okuma, onaysız çalışabilir):**
- `olcum_hazirlik_kontrolu(ad_account_id, pixel_id, event)` — tek araç, tüm ön kontrol listesini çalıştırıp her maddeyi `geçti / kaldı / bilinmiyor + sebep` olarak döner. AI'ın kendisi beş ayrı çağrıyı birleştirip yorumlamamalı; karar kodda.
- `pixel_listele(ad_account_id)` — hesabın erişebildiği pixel'ler + `owner_business` + paylaşım durumu; boşsa sebebini söyler (pixel yok / paylaşılmamış / izin yok).
- `olay_son_tetiklenme(pixel_id, event)`, `olay_sayisi(pixel_id, event, gun)` (`recent_events`), `pixel_istatistik(pixel_id, aggregation, event_source)` (≤7 gün).
- `dataset_kalitesi(pixel_id)` — EMQ, kapsama, tekilleştirme, tazelik, teşhisler; yalnız web için anlamlı olduğunu yanıtta belirtir.
- `sinyal_teshisleri(pixel_id, ad_account_id)`, `ozel_donusumler(pixel_id, ad_account_id)`.

**Onay gerektiren (yazma):**
- Pixel oluşturma (`/act_/adspixels`), pixel'i reklam hesabına paylaşma/ayırma (`shared_accounts`), pixel ayarlarını değiştirme (`data_use_setting`, `first_party_cookie_status`, otomatik eşleştirme). Hepsi müşterinin ölçüm altyapısını değiştiriyor.
- CAPI'ye olay gönderme (Advetics bunu yaparsa): her zaman insan onaylı bir kurulum akışı; AI tek tek olay ÜRETMEMELİ. `test_event_code` ile test bile üretim verisine işlendiği için onay ister.

**KAPALI sözlükten seçilmesi gerekenler:**
- `action_source` (9 değer), `custom_event_type` (29 değer), CAPI olay adı ↔ `custom_event_type` eşlemesi (tek tablo), `customer_segmentation` (9), `data_use_setting` (3), `first_party_cookie_status` (3), `automatic_matching_fields` (11), `stats.aggregation` (16), `currency` (ISO 4217, büyük harf), `da_checks.checks` (2).

**AI'ın ASLA tahmin etmemesi gerekenler:**
- Bir olayın "aktif" olup olmadığı — her zaman `event_last_fired_time`/`recent_events` ile ölçülür, "sitede satın alma vardır" varsayımı yapılmaz.
- Hangi pixel'in müşteriye ait olduğu — `owner_business` ve paylaşım kenarından okunur; isim benzerliğinden çıkarılmaz.
- Para birimi — hesabın/sitenin para biriminden okunur; tahmin edilmez.
- Optimizasyon olayının kendisi: kullanıcı "satış istiyorum" dediğinde `PURCHASE` seçmeden önce Purchase olayının son 7 günde geldiği doğrulanmalı; gelmiyorsa AI daha üst huni olayına (ör. `INITIATED_CHECKOUT`, `ADD_TO_CART`) **kendiliğinden düşmemeli**, durumu kullanıcıya söyleyip seçenek sunmalı (belgede "olay gelmezse Meta ne yapar" tanımlı değil; sessizce başka olaya optimize etmek kullanıcının istediği şey değil).
- EMQ yoksa kalitenin kötü olduğu sonucu (CRM/app/offline'da EMQ zaten yok).

## Panel kurgusu için çıkarımlar

### Dönüşüm amaçlı kampanyadan ÖNCE kontrol listesi

Kullanıcıya teknik terim gösterilmeden, "Ölçüm hazır mı?" adımı olarak. Her madde için durum: Hazır / Sorun var (sebep + ne yapmalı) / Bilinmiyor (neden okunamadı).

| # | Kontrol | Kaynak | Eşik / karar | Belge desteği |
|---|---|---|---|---|
| 1 | Reklam hesabının kullanabildiği en az bir pixel var | `GET /act_{id}/adspixels`, `GET /{pixel}/shared_accounts?business=` | Yoksa: "pixel yok" mu "paylaşılmamış" mı ayrı söyle | Var |
| 2 | Pixel kullanılabilir | `is_unavailable = false`, `owner_business` dolu | `true` ise yayını engelle | Var (sebep belgede yok) |
| 3 | Pixel reklam için kullanılabilir | `data_use_setting ≠ ANALYTICS_ONLY`, `is_restricted_use`/`is_mta_use` = false | Değilse uyar; etkisi belgede açık değil → kısıtla | Kısmen |
| 4 | Pixel yakın zamanda çalıştı | `last_fired_time` | Eşik belgede YOK; Advetics kararı (öneri: 24 saat uyarı, 7 gün engel) | Alan var, eşik yok |
| 5 | Seçilen olay geliyor | `event_last_fired_time?event=`, `recent_events?lookback_window=604800` | 7 günde 0 ise yayını engelle ya da kullanıcıya üst huni olayı **seçenek olarak** sun | Alan var, Meta davranışı belgede yok |
| 6 | Olay açılış sayfasının alan adında çalışıyor | `domain_last_fired_time?domain_name_list=` | Reklamın gittiği alan adı listede yoksa uyar | Var |
| 7 | Sunucu tarafı (CAPI) var mı | `stats?aggregation=event_source` ya da `event_source=SERVER_ONLY` | Yalnız tarayıcıysa bilgi notu (engel değil) | Var |
| 8 | Eşleşme kalitesi | `dataset_quality` → `composite_score` | < 6.0 uyarı; web dışı olayda "uygulanmaz" | Var (hedef 6.0) |
| 9 | Olay kapsaması ve tekilleştirme | `event_coverage.percentage` (hedef 75), `dedupe_key_feedback` | Kapsama düşük/anahtar yoksa uyarı (çift sayım riski) | Var |
| 10 | Tazelik | `data_freshness.upload_frequency` | `real_time`/`hourly` dışı → uyarı | Var |
| 11 | Hesap düzeyi sinyal sorunu yok | `ads_signal_diagnostic_issues?ad_account_id=` | Sorun varsa göster | Kenar var, alanlar yok |
| 12 | Değer optimizasyonu için value+currency geliyor | `stats?aggregation=custom_data_field&event=Purchase` | `value`/`currency` yoksa değer optimizasyonu kapalı | Kısmen |
| 13 | Özel dönüşüm seçildiyse pixel'e bağlı ve hesapta görünür | `GET /{pixel}/customconversions?ad_account=` | Listede yoksa engel | Var (düğüm alanları H2 grubunda) |
| 14 | Katalog satışları için | `da_checks` | `pixel_missing_param_in_events` başarısızsa engel | Var |
| 15 | Lead (CRM) optimizasyonu için | `is_crm = true`, lead kampanyası Instant Form | Değilse Conversion Leads seçeneği gizlenir | Var |
| 16 | Uygulama olayı için | `is_consolidated_container`, datasete uygulama bağlı | — | Var |
| 17 | Alan adı doğrulama, Aggregated Event Measurement (olay öncelik sırası) | — | **Bu grupta yok**; başka bölümden doğrulanmadan panel bunu "hazır" saymamalı → "Bilinmiyor" | Yok |

### Acemi kullanıcıya

- **Sorulacak tek şey:** "Reklamdan ne bekliyorsunuz?" (satış / form / mesaj / ziyaret). Pixel, olay, `custom_event_type` eşlemesi `goal-mapping` katmanında kararlaştırılır.
- Pixel tek ise otomatik seçilir ve adı gösterilir; birden çoksa "Sitenizde hangisi kurulu?" diye son tetiklenme zamanıyla birlikte listelenir (seçim yardımı ölçümden gelir, isimden değil).
- Seçilen olay son 7 günde hiç gelmediyse açık cümle: "Sitenizden son 7 günde satış bilgisi gelmedi. Bu haliyle reklam satışa göre öğrenemez." + seçenekler (sepete ekleme olayına göre çalış / kurulumu tamamla). Sessiz geri düşüş yok.
- Kalite sorunları (EMQ, kapsama) acemi için engel değil, sarı not; "uzmanınıza iletin" bağlantısıyla teşhis metni.

### Otomatik kararlaştırılacaklar

- Olay adı ↔ `custom_event_type` eşlemesi; `currency` hesabın para biriminden; değer optimizasyonu yalnız value+currency doğrulanınca teklif edilir.
- Hazırlık kontrolü sonuçları kampanya taslağına ekli saklanır (yayın anındaki durum kanıtı).

### Yalnız Gelişmiş modda

- Pixel ve olay seçimini elle değiştirme, özel dönüşüm seçme, `pixel_rule`, değer optimizasyonu, pLTV, `tracking_specs` ile ek pixel izleme.
- Dataset kalite ayrıntıları (match key kapsamaları, teşhis listesi, ACR), `stats` kırılımları.
- Pixel ayarları (`first_party_cookie_status`, otomatik gelişmiş eşleştirme alanları) — onaylı yazma.

### Gateway ürünleri hakkında tek satır

Conversions API Gateway / Signals Gateway müşterinin kendi AWS/GCP hesabında, DNS CNAME ve sürekli bakım gerektiren bir altyapı; Advetics'in hedef kullanıcısı (reklamcılık bilmeyen) için **önerilmez**, Advetics sunucusunda barındırılması da proje kuralıyla yasak. Müşteride zaten kuruluysa panel yalnızca "sunucu tarafı ölçüm var" bilgisini `stats`'tan okumalı.

## Sayfa sayfa dizin

`…/` = `https://developers.facebook.com/documentation/ads-commerce/`

| Dosya | Kaynak URL | Tek satır özet | Önem |
|---|---|---|---|
| `conversions-api.md` | …/conversions-api | CAPI genel bakış: sunucu olayları dataset (pixel) kimliğine bağlanır, pixel olaylarıyla aynı işlenir; adım sırası ve kaynak bağlantıları. | Orta |
| `conversions-api__app-events.md` | …/conversions-api/app-events | Uygulama olayları CAPI ile: dataset’e tek uygulama bağlanır, action_source=app, advertiser_tracking_enabled + extinfo zorunlu, kurulum için 90 gün tekilleştirme. | Orta |
| `conversions-api__best-practices.md` | …/conversions-api/best-practices | Yedekli kurulum, zorunlu/önerilen parametreler, v13 sonrası GEÇERSİZ sayılan user_data kombinasyonları, fbp/fbc tazeleme, partner_agent, EMQ yalnız web. | Yüksek |
| `conversions-api__business-messaging.md` | …/conversions-api/business-messaging | Messenger/WhatsApp/Instagram sohbet olayları: action_source=business_messaging, messaging_channel, page_scoped_user_id/ctwa_clid/ig_sid; Meta tekilleştirme YAPMAZ; IG’de satın alma optimizasyonu yok. | Orta |
| `conversions-api__conversion-leads-integration.md` | …/conversions-api/conversion-leads-integration | CRM entegrasyonu (Conversion Leads) uygunluk: Instant Forms, ≥200 lead/ay, günde ≥1 yükleme, hedef aşama ≤28 gün ve %1-40 dönüşüm. | Orta |
| `conversions-api__conversion-leads-integration__crm-integration__1-connecting-your-crm-with-lead-ads.md` | …/conversions-api/conversion-leads-integration/crm-integration/1-connecting-your-crm-with-lead-ads | Lead’leri CRM’e indirme yolları (partner, webhook, Graph bulk read, elle) ve 15-17 haneli lead ID’nin saklanması. | Düşük |
| `conversions-api__conversion-leads-integration__crm-integration__2-getting-started-with-integration.md` | …/conversions-api/conversion-leads-integration/crm-integration/2-getting-started-with-integration | Lead kampanyası + CRM dataset oluşturma/dönüştürme; tamamlanan entegrasyonda pixel değiştirilmez. | Orta |
| `conversions-api__conversion-leads-integration__crm-integration__3-implementing-the-crm-integration.md` | …/conversions-api/conversion-leads-integration/crm-integration/3-implementing-the-crm-integration | CRM yükü: action_source=system_generated, custom_data.lead_event_source + event_source=crm, tüm aşamalar, 7 gün geri doldurma, parti hatasında tüm parti atılır. | Orta |
| `conversions-api__conversion-leads-integration__crm-integration__4-verify-your-data.md` | …/conversions-api/conversion-leads-integration/crm-integration/4-verify-your-data | CRM veri doğrulama: ≥200 lead/ay kampanya, ≥%60 lead kapsaması, doğru biçim. | Düşük |
| `conversions-api__conversion-leads-integration__crm-integration__5-configure-your-sales-funnel.md` | …/conversions-api/conversion-leads-integration/crm-integration/5-configure-your-sales-funnel | Satış hunisi yapılandırma; sistem seçtiğinden farklı aşamaya optimize edebilir. | Düşük |
| `conversions-api__conversion-leads-integration__crm-integration__6-follow-up-steps.md` | …/conversions-api/conversion-leads-integration/crm-integration/6-follow-up-steps | Huni analizi + 2-4 hafta öğrenme; pixel’i reklam hesaplarıyla paylaşma. | Düşük |
| `conversions-api__conversion-leads-integration__faq.md` | …/conversions-api/conversion-leads-integration/faq | CRM SSS: en az 7 gün veri, en az 2 aşama, eğitim 1-2 ay (diğer sayfayla çelişiyor). | Düşük |
| `conversions-api__conversion-leads-integration__how-to-find-the-lead-id.md` | …/conversions-api/conversion-leads-integration/how-to-find-the-lead-id | Lead ID’nin bulunduğu yer (webhook leadgen_id, Zapier/LeadsBridge/Make id, HubSpot/Zoho saklamıyor). | Düşük |
| `conversions-api__conversion-leads-integration__payload-specification.md` | …/conversions-api/conversion-leads-integration/payload-specification | Conversion Leads yük şartnamesi (zorunlu alanlar ve öncelik sırası: lead_id > click ID/e-posta > telefon). | Orta |
| `conversions-api__conversion-leads-integration__zapier.md` | …/conversions-api/conversion-leads-integration/zapier | Zapier ile CRM entegrasyonu dizini. | Düşük |
| `conversions-api__conversion-leads-integration__zapier__prerequisites.md` | …/conversions-api/conversion-leads-integration/zapier/prerequisites | Zapier ön koşul: lead’leri indirip lead ID’yi CRM alanına eşlemek. | Düşük |
| `conversions-api__conversion-leads-integration__zapier__step-1-implement-integration.md` | …/conversions-api/conversion-leads-integration/zapier/step-1-implement-integration | Zapier “Send Funnel Event” eylemi; zaman boşsa yükleme zamanı kullanılır; “çok geniş müşteri parametresi” hatası. | Düşük |
| `conversions-api__conversion-leads-integration__zapier__step-2-verify-integration.md` | …/conversions-api/conversion-leads-integration/zapier/step-2-verify-integration | Zapier doğrulama: ~30 dk gecikme, lead_event_source/event_source kontrolü, CRM kalitesi 24-48 saatte ölçülür. | Düşük |
| `conversions-api__dataset-quality-api.md` | …/conversions-api/dataset-quality-api | GET /dataset_quality: web olayı başına EMQ (composite_score, match_key_feedback, diagnostics), ACR, event_coverage (hedef %75), dedupe_key_feedback, data_freshness; izinler. | Yüksek |
| `conversions-api__dataset-quality-api__offline-events.md` | …/conversions-api/dataset-quality-api/offline-events | Çevrimdışı dataset kalitesi (beta): composite/match_key/frequency/freshness puanları; omnichannel için composite ≥8.5. | Orta |
| `conversions-api__deduplicate-pixel-and-server-events.md` | …/conversions-api/deduplicate-pixel-and-server-events | Tekilleştirme: event_id+event_name (önerilen, 48 saat) ya da fbp/external_id (yalnız önce tarayıcı sonra sunucu); tek kaynak içi tekrar tekilleştirilmez. | Yüksek |
| `conversions-api__get-started.md` | …/conversions-api/get-started | Ön koşullar: Pixel ID, Business hesabı, erişim belirteci (Events Manager ya da kendi uygulama + sistem kullanıcısı); erişim kademesi adları değişti (Limited/Full, 500 çağrı/15 gün). | Yüksek |
| `conversions-api__guides.md` | …/conversions-api/guides | Rehberler dizini (bağlantı listesi). | Düşük |
| `conversions-api__guides__append-attribution.md` | …/conversions-api/guides/append-attribution | AppendAttribution (beta): kendi atıf modelinin kredisini 48 saat içinde Meta’ya geri gönderme; Custom Attribution Source, 14 gün eğitim, yaygın hatalar. | Düşük |
| `conversions-api__guides__append-attribution__reference.md` | …/conversions-api/guides/append-attribution/reference | AppendAttribution alanları: attribution_data (ad_id, touchpoint_ts, attribution_share 0-1, attribution_value), original_event_data; web ve uygulama örnekleri. | Düşük |
| `conversions-api__guides__business-sdk-features.md` | …/conversions-api/guides/business-sdk-features | Business SDK: asenkron istek, eşzamanlı partileme (BatchProcessor), özel HTTP servis arayüzü; özel HTTP servis async/partide desteklenmiyor (kod örnekleri atlandı). | Düşük |
| `conversions-api__guides__conversions-api-crm-for-platforms.md` | …/conversions-api/guides/conversions-api-crm-for-platforms | Platform olarak CRM CAPI: izinler, MBE ya da müşteri sistem kullanıcısı belirteci, lead_id/partner_agent, tüm aşamalar, ≥%60 lead kapsaması, süre tahminleri. | Orta |
| `conversions-api__guides__end-to-end-implementation.md` | …/conversions-api/guides/end-to-end-implementation | Uçtan uca: yedekli/bölünmüş/yalnız sunucu kurulumları, tazelik (≤1 saat iyi, >2 saat performans düşer, ≥24 saat ciddi), partner_agent <23 karakter, müşteri belirteci yalnız POST yapabilir. | Yüksek |
| `conversions-api__guides__gateway-aws-app-runner.md` | …/conversions-api/guides/gateway-aws-app-runner | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: AWS ECS Express”. | İlgisiz |
| `conversions-api__guides__gateway-aws-app-runner__architecture.md` | …/conversions-api/guides/gateway-aws-app-runner/architecture | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: AWS ECS Express Architecture”. | İlgisiz |
| `conversions-api__guides__gateway-aws-app-runner__cost-monitoring.md` | …/conversions-api/guides/gateway-aws-app-runner/cost-monitoring | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: AWS ECS Express Cost Monitoring”. | İlgisiz |
| `conversions-api__guides__gateway-aws-app-runner__custom-domain-setup.md` | …/conversions-api/guides/gateway-aws-app-runner/custom-domain-setup | Taşındı, içerik yok → “Conversions API Gateway or Signals Gateway: AWS ECS Express Custom Domain Setup”. | İlgisiz |
| `conversions-api__guides__gateway-aws-app-runner__scaling-control.md` | …/conversions-api/guides/gateway-aws-app-runner/scaling-control | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: AWS ECS Express”. | İlgisiz |
| `conversions-api__guides__gateway-aws-app-runner__setup-guide.md` | …/conversions-api/guides/gateway-aws-app-runner/setup-guide | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: AWS ECS Express”. | İlgisiz |
| `conversions-api__guides__gateway-aws-app-runner__uninstallation.md` | …/conversions-api/guides/gateway-aws-app-runner/uninstallation | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: AWS ECS Express”. | İlgisiz |
| `conversions-api__guides__gateway-aws-app-runner__updates.md` | …/conversions-api/guides/gateway-aws-app-runner/updates | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: AWS ECS Express”. | İlgisiz |
| `conversions-api__guides__gateway-control-plane-api.md` | …/conversions-api/guides/gateway-control-plane-api | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway Control Plane API”. | İlgisiz |
| `conversions-api__guides__gateway-control-plane-api__reference.md` | …/conversions-api/guides/gateway-control-plane-api/reference | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway Control Plane API”. | İlgisiz |
| `conversions-api__guides__gateway-control-plane-api__reference__account-data-routing.md` | …/conversions-api/guides/gateway-control-plane-api/reference/account-data-routing | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway Control Plane API Reference: Account Data Routing Configuration”. | İlgisiz |
| `conversions-api__guides__gateway-control-plane-api__reference__account-event-metrics.md` | …/conversions-api/guides/gateway-control-plane-api/reference/account-event-metrics | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway Control Plane API Reference: Get Account Event Metrics by Time Frame”. | İlgisiz |
| `conversions-api__guides__gateway-control-plane-api__reference__account-management.md` | …/conversions-api/guides/gateway-control-plane-api/reference/account-management | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway Control Plane API Reference: Account Management”. | İlgisiz |
| `conversions-api__guides__gateway-control-plane-api__reference__objects.md` | …/conversions-api/guides/gateway-control-plane-api/reference/objects | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway Control Plane API Reference: Objects”. | İlgisiz |
| `conversions-api__guides__gateway-control-plane-api__reference__pixel-management.md` | …/conversions-api/guides/gateway-control-plane-api/reference/pixel-management | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway Control Plane API Reference: Pixel Management”. | İlgisiz |
| `conversions-api__guides__gateway-control-plane-api__reference__user-management.md` | …/conversions-api/guides/gateway-control-plane-api/reference/user-management | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway Control Plane API Reference: User Management”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts.md` | …/conversions-api/guides/gateway-multiple-accounts | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: Host Onboarding for AWS”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__account-onboarding.md` | …/conversions-api/guides/gateway-multiple-accounts/account-onboarding | Taşındı, içerik yok → “Managing Hosted Accounts”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__account-onboarding__account-data-routing.md` | …/conversions-api/guides/gateway-multiple-accounts/account-onboarding/account-data-routing | Taşındı, içerik yok → “Data Routing Configuration for Hosted Accounts”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__account-onboarding__account-user-management.md` | …/conversions-api/guides/gateway-multiple-accounts/account-onboarding/account-user-management | Taşındı, içerik yok → “User Management for Hosted Accounts”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__account-onboarding__data-source-management.md` | …/conversions-api/guides/gateway-multiple-accounts/account-onboarding/data-source-management | Taşındı, içerik yok → “Conversions API Gateway Data Source Management”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__account-onboarding__manage-allow-block-lists.md` | …/conversions-api/guides/gateway-multiple-accounts/account-onboarding/manage-allow-block-lists | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: Manage Domain Allow-Lists and Block-Lists for an Account”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__account-onboarding__unmanaged-accounts.md` | …/conversions-api/guides/gateway-multiple-accounts/account-onboarding/unmanaged-accounts | Taşındı, içerik yok → “Onboarding and Offboarding Unmanaged Hosted Accounts”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__agency-faqs.md` | …/conversions-api/guides/gateway-multiple-accounts/agency-faqs | Taşındı, içerik yok → “Gateway Products: Conversions API Gateway and Signals Gateway”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__architecture.md` | …/conversions-api/guides/gateway-multiple-accounts/architecture | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: AWS Architecture”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__architecture__aws-app-runner.md` | …/conversions-api/guides/gateway-multiple-accounts/architecture/aws-app-runner | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: AWS App Runner Architecture”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__architecture__aws-eks.md` | …/conversions-api/guides/gateway-multiple-accounts/architecture/aws-eks | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: AWS Architecture”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__architecture__gcp.md` | …/conversions-api/guides/gateway-multiple-accounts/architecture/gcp | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: GCP Architecture”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__glossary.md` | …/conversions-api/guides/gateway-multiple-accounts/glossary | Taşındı, içerik yok → “Gateway Products: Conversions API Gateway and Signals Gateway”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__host-management.md` | …/conversions-api/guides/gateway-multiple-accounts/host-management | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: Account Onboarding and Management”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__host-management__host-account-management.md` | …/conversions-api/guides/gateway-multiple-accounts/host-management/host-account-management | Taşındı, içerik yok → “Managing Hosted Accounts”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__host-management__host-settings.md` | …/conversions-api/guides/gateway-multiple-accounts/host-management/host-settings | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: Host Settings”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__host-management__host-user-management.md` | …/conversions-api/guides/gateway-multiple-accounts/host-management/host-user-management | Taşındı, içerik yok → “User Management for Hosted Accounts”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__host-management__set-up-smtp.md` | …/conversions-api/guides/gateway-multiple-accounts/host-management/set-up-smtp | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: Set Up SMTP Configuration”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__host-onboarding-aws-app-runner.md` | …/conversions-api/guides/gateway-multiple-accounts/host-onboarding-aws-app-runner | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: AWS App Runner”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__host-onboarding-aws-app-runner__configure-host-account.md` | …/conversions-api/guides/gateway-multiple-accounts/host-onboarding-aws-app-runner/configure-host-account | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: AWS App Runner”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__host-onboarding-aws-app-runner__create-instance.md` | …/conversions-api/guides/gateway-multiple-accounts/host-onboarding-aws-app-runner/create-instance | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: AWS App Runner”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__host-onboarding-aws-app-runner__set-up-domain.md` | …/conversions-api/guides/gateway-multiple-accounts/host-onboarding-aws-app-runner/set-up-domain | Taşındı, içerik yok → “Conversions API Gateway or Signals Gateway: AWS App Runner Custom Domain Setup”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__host-onboarding-gcp.md` | …/conversions-api/guides/gateway-multiple-accounts/host-onboarding-gcp | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: Host Onboarding for Google Cloud Platform”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__host-onboarding-gcp__auto-scaling-limits.md` | …/conversions-api/guides/gateway-multiple-accounts/host-onboarding-gcp/auto-scaling-limits | Taşındı, içerik yok → “Conversions API Gateway or Signals Gateway: Set Auto-Scaling Limits”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__host-onboarding-gcp__create-instance.md` | …/conversions-api/guides/gateway-multiple-accounts/host-onboarding-gcp/create-instance | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: Create an Instance for Google Cloud Platform”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__host-onboarding-gcp__set-up-domain.md` | …/conversions-api/guides/gateway-multiple-accounts/host-onboarding-gcp/set-up-domain | Taşındı, içerik yok → “Create a Custom Domain for Google Cloud Platform”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__host-onboarding.md` | …/conversions-api/guides/gateway-multiple-accounts/host-onboarding | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: Host Onboarding for AWS”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__host-onboarding__configure-host-account.md` | …/conversions-api/guides/gateway-multiple-accounts/host-onboarding/configure-host-account | Taşındı, içerik yok → “Conversions API Gateway: Instance Activation”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__host-onboarding__create-instance.md` | …/conversions-api/guides/gateway-multiple-accounts/host-onboarding/create-instance | Taşındı, içerik yok → “Create an AWS EKS Instance - Advertising Agencies and Partners”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__host-onboarding__set-up-domain.md` | …/conversions-api/guides/gateway-multiple-accounts/host-onboarding/set-up-domain | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: Set Up Custom Domain for AWS”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__monitoring.md` | …/conversions-api/guides/gateway-multiple-accounts/monitoring | Taşındı, içerik yok → “Monitor Your Conversions API Gateway Setup”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__troubleshooting-guide.md` | …/conversions-api/guides/gateway-multiple-accounts/troubleshooting-guide | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: Troubleshooting Guide”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__troubleshooting-tools.md` | …/conversions-api/guides/gateway-multiple-accounts/troubleshooting-tools | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: Troubleshooting Guide”. | İlgisiz |
| `conversions-api__guides__gateway-multiple-accounts__uninstall.md` | …/conversions-api/guides/gateway-multiple-accounts/uninstall | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: Uninstall Guide”. | İlgisiz |
| `conversions-api__guides__gateway.md` | …/conversions-api/guides/gateway | Taşındı, içerik yok → “Conversions API Gateway”. | İlgisiz |
| `conversions-api__guides__gateway__changelog.md` | …/conversions-api/guides/gateway/changelog | Taşındı, içerik yok → “Changelog”. | İlgisiz |
| `conversions-api__guides__gateway__configuration.md` | …/conversions-api/guides/gateway/configuration | Taşındı, içerik yok → “Conversions API Gateway or Signals Gateway Configuration”. | İlgisiz |
| `conversions-api__guides__gateway__enhance-events-advanced-matching.md` | …/conversions-api/guides/gateway/enhance-events-advanced-matching | Taşındı, içerik yok → “Conversions API Gateway: Enhance Events with Advanced Matching Data”. | İlgisiz |
| `conversions-api__guides__gateway__include-facebook-login-data.md` | …/conversions-api/guides/gateway/include-facebook-login-data | Taşındı, içerik yok → “Include Facebook Login Data in the Conversions API Gateway”. | İlgisiz |
| `conversions-api__guides__gateway__non-web-server-events.md` | …/conversions-api/guides/gateway/non-web-server-events | Taşındı, içerik yok → “Sending Events Directly From a Server”. | İlgisiz |
| `conversions-api__guides__gateway__post-setup-management.md` | …/conversions-api/guides/gateway/post-setup-management | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: Post-Setup Management”. | İlgisiz |
| `conversions-api__guides__gateway__setup.md` | …/conversions-api/guides/gateway/setup | Taşındı, içerik yok → “Conversions API Gateway: Setup Guide”. | İlgisiz |
| `conversions-api__guides__gateway__setup__dns-setup-guide.md` | …/conversions-api/guides/gateway/setup/dns-setup-guide | Taşındı, içerik yok → “How to Set Up DNS Record on Cloudflare”. | İlgisiz |
| `conversions-api__guides__gateway__telemetry.md` | …/conversions-api/guides/gateway/telemetry | Taşındı, içerik yok → “Conversions API Gateway or Signals Gateway System Health Information”. | İlgisiz |
| `conversions-api__guides__gateway__troubleshooting-guide.md` | …/conversions-api/guides/gateway/troubleshooting-guide | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: Troubleshooting Guide”. | İlgisiz |
| `conversions-api__guides__gateway__troubleshooting.md` | …/conversions-api/guides/gateway/troubleshooting | Taşındı, içerik yok → “Conversions API Gateway and Signals Gateway: Troubleshooting Guide”. | İlgisiz |
| `conversions-api__guides__gateway__uninstall.md` | …/conversions-api/guides/gateway/uninstall | Taşındı, içerik yok → “Uninstall the Conversions API Gateway”. | İlgisiz |
| `conversions-api__guides__gateway__upload-events.md` | …/conversions-api/guides/gateway/upload-events | Taşındı, içerik yok → “Conversions API Gateway: Uploading Events”. | İlgisiz |
| `conversions-api__guides__gtm-server-side.md` | …/conversions-api/guides/gtm-server-side | Sunucu taraflı GTM: GA4 web etiketi → sunucu konteyneri → Meta CAPI etiketi; GA4↔Meta olay ve parametre eşleme tabloları, x-fb-event_id ile tekilleştirme. | Orta |
| `conversions-api__guides__predicted-lifetime-value.md` | …/conversions-api/guides/predicted-lifetime-value | pLTV: yalnız web, ≥5 farklı pozitif değer ve en yüksek ≥3× en düşük, son 4 hafta ≥100 dönüşüm/hafta, Core Setup dataset hariç; AppendValue ile 7 gün içinde gecikmeli gönderim; ~2 hafta eğitim. | Orta |
| `conversions-api__guides__salesforce-webhooks.md` | …/conversions-api/guides/salesforce-webhooks | Salesforce Outbound Message + Flow ile kodsuz CRM entegrasyonu (Conversion Leads); alan eşleme, sorun tablosu. | Düşük |
| `conversions-api__guides__value-optimization.md` | …/conversions-api/guides/value-optimization | Değer optimizasyonu: Satış amacında her standart/özel olayda çalışır; value+currency hem pixel hem CAPI’de tutarlı gönderilmeli. | Yüksek |
| `conversions-api__guides__zapier-integration.md` | …/conversions-api/guides/zapier-integration | Zapier “Facebook Conversions” uygulamasıyla tetikleyici → CAPI olayı (ör. Google Sheets satırı → Purchase). | Düşük |
| `conversions-api__offline-events.md` | …/conversions-api/offline-events | Mağaza/çevrimdışı olaylar: action_source=physical_store, dataset gerekli (is_consolidated_container), 62 gün yükleme, order_id/kullanıcı tabanlı tekilleştirme (7 gün). | Orta |
| `conversions-api__parameter-builder-library.md` | …/conversions-api/parameter-builder-library | Parameter Builder SDK: fbc/fbp/IP üretimi ve PII normalleştirme+hash; değerlerin sonuna 8 karakterlik “appendix” ekler. | Orta |
| `conversions-api__parameter-builder-library__get-started.md` | …/conversions-api/parameter-builder-library/get-started | Parameter Builder kurulum: çerez okuma/yazma, onay (consent) entegrasyonu, GitHub bağlantıları. | Düşük |
| `conversions-api__parameter-builder-library__workflow-and-examples.md` | …/conversions-api/parameter-builder-library/workflow-and-examples | Parameter Builder iş akışı: istemci (processAndCollectAllParams, _fbi çerezi) + sunucu (processRequest, getFbc/getFbp/getClientIpAddress). | Düşük |
| `conversions-api__parameters.md` | …/conversions-api/parameters | Parametre haritası: web olayında client_user_agent + action_source + event_source_url zorunlu, web dışı yalnızca action_source; her müşteri parametresinin hash kuralı. | Yüksek |
| `conversions-api__parameters__app-data.md` | …/conversions-api/parameters/app-data | app_data: advertiser_tracking_enabled (iOS 14.5+ ATT, zorunlu), application_tracking_enabled, 16 elemanlı extinfo (a2/i2), campaign_ids, install_referrer vb. | Orta |
| `conversions-api__parameters__custom-data.md` | …/conversions-api/parameters/custom-data | Standart custom_data parametreleri (web/app/offline adlarıyla): value, currency (ISO 4217), contents, content_ids, content_type, order_id, predicted_ltv, net_revenue ve dikey alanlar. | Yüksek |
| `conversions-api__parameters__customer-information-parameters.md` | …/conversions-api/parameters/customer-information-parameters | user_data alanları ve normalleştirme/hash kuralları (em, ph, fn, ln, db, ge, ct, st, zp, country hash; IP, UA, fbc, fbp, lead_id, ctwa_clid vb. hash YOK). | Yüksek |
| `conversions-api__parameters__external-id.md` | …/conversions-api/parameters/external-id | external_id: kanallar arası tutarlılık şart, eşleşme süresi dolar; fbp gelirse external_id yerine kullanılır; müşteri dosyası kitlesi yalnız external_id ile kurulamaz. | Yüksek |
| `conversions-api__parameters__fbp-and-fbc.md` | …/conversions-api/parameters/fbp-and-fbc | fbclid → fbc biçimi (fb.subdomainIndex.creationTime(ms).fbclid), büyük/küçük harf korunur, 90 gün çerez; fbp biçimi; sunucuda üretilirken subdomainIndex=1. | Yüksek |
| `conversions-api__parameters__main-body.md` | …/conversions-api/parameters/main-body | Gövde: data (zorunlu, olay dizisi) ve test_event_code (opsiyonel). | Yüksek |
| `conversions-api__parameters__original-event.md` | …/conversions-api/parameters/original-event | original_event_data: gecikmeli olayı (AppendValue vb.) ilk olaya bağlamak için event_name/event_time/order_id/event_id. | Orta |
| `conversions-api__parameters__server-event.md` | …/conversions-api/parameters/server-event | Sunucu olayı alanları: event_name/event_time/user_data/action_source zorunlu; 9 action_source değeri; event_id; opt_out; LDU alanları; app_data/extinfo; customer_segmentation enum. | Yüksek |
| `conversions-api__payload-helper.md` | …/conversions-api/payload-helper | Payload Helper aracının tanıtımı (içerik yok, araç arayüzü). | Düşük |
| `conversions-api__set-up-conversions-api-as-a-platform.md` | …/conversions-api/set-up-conversions-api-as-a-platform | Platform olarak CAPI: App Review (Advanced Access, ads_management, pages_read_engagement, ads_read), müşteri pixeline erişim yolları (sistem kullanıcısı, FBE, pixel paylaşımı), partner_agent. | Yüksek |
| `conversions-api__support.md` | …/conversions-api/support | Hata: geçerli 2xx, geçersiz 4xx + az ayrıntı; ağ hatasında yeniden dene, 1.500 ms zaman aşımı, yanıt genelde <600 ms. | Orta |
| `conversions-api__using-the-api.md` | …/conversions-api/using-the-api | POST /{pixel_id}/events; event_time 7 gün sınırı, 1.000 olay/istek, tek geçersiz olay tüm partiyi düşürür; test_event_code olaylarının da üretime işlendiği; LDU örnekleri; Gateway SDK ayarları. | Yüksek |
| `conversions-api__verifying-setup.md` | …/conversions-api/verifying-setup | Doğrulama: 20 dk içinde Events Manager, olay tazeliği, tekilleştirme oranı ve anahtar kullanımı, EMQ (1-10, hedef ≥6.0). | Yüksek |
| `gateway-products.md` | …/gateway-products | Gateway ürünleri (CAPI Gateway + Signals Gateway) ortak altyapı dizini. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__changelog.md` | …/gateway-products/changelog | Gateway sürüm notları (son v2.3.0, Eylül 2025). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__configuration.md` | …/gateway-products/configuration | Gateway ön koşul/ağ/güvenlik; varsayılan kapasite EKS 1.000, App Runner/GCP 100 istek/sn. | Düşük |
| `gateway-products__conversions-api-gateway-pipeline.md` | …/gateway-products/conversions-api-gateway-pipeline | CAPI Gateway hattı: yalnız Meta Pixel kaynağı → yalnız Meta CAPI hedefi. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__conversions-api-gateway-pipeline__advanced-matching.md` | …/gateway-products/conversions-api-gateway-pipeline/advanced-matching | Signals Gateway gelişmiş eşleştirme çerezi (varsayılan kapalı). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__conversions-api-gateway-pipeline__include-facebook-login-data.md` | …/gateway-products/conversions-api-gateway-pipeline/include-facebook-login-data | Signals Gateway’de Facebook Login kimliğini eşleşmeye katma (varsayılan kapalı). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__conversions-api-gateway.md` | …/gateway-products/conversions-api-gateway | CAPI Gateway: kodsuz yedekli pixel+CAPI; reklamverenin bulut hesabında (AWS EKS/ECS Express/GCP) çalışır. | Orta |
| `gateway-products__conversions-api-gateway__data-source-management.md` | …/gateway-products/conversions-api-gateway/data-source-management | CAPI Gateway veri kaynağı yönetimi ve roller. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__conversions-api-gateway__enhance-events-advanced-matching.md` | …/gateway-products/conversions-api-gateway/enhance-events-advanced-matching | CAPI Gateway pixel verisiyle olay zenginleştirme (varsayılan kapalı). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__conversions-api-gateway__include-facebook-login-data.md` | …/gateway-products/conversions-api-gateway/include-facebook-login-data | CAPI Gateway’de FB Login ID (v1.6.0+, varsayılan kapalı). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__conversions-api-gateway__instance-activation.md` | …/gateway-products/conversions-api-gateway/instance-activation | CAPI Gateway örneği etkinleştirme (Chrome, reklam engelleyici kapalı). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__conversions-api-gateway__monitoring.md` | …/gateway-products/conversions-api-gateway/monitoring | CAPI Gateway izleme: hesap durumu, CloudWatch. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__conversions-api-gateway__setup.md` | …/gateway-products/conversions-api-gateway/setup | CAPI Gateway kurulum adımları (Events Manager > Ayarlar). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__conversions-api-gateway__uninstall.md` | …/gateway-products/conversions-api-gateway/uninstall | CAPI Gateway pixel bağlantısını kesme. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__conversions-api-gateway__upload-events.md` | …/gateway-products/conversions-api-gateway/upload-events | CAPI Gateway’e S3 ya da elle dosya ile olay yükleme. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-aws-ecs-express.md` | …/gateway-products/gateway-aws-ecs-express | AWS ECS Express barındırma seçeneği dizini. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-aws-ecs-express__architecture.md` | …/gateway-products/gateway-aws-ecs-express/architecture | ECS Express mimarisi ve AWS kaynakları. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-aws-ecs-express__ecs-express-cost-monitoring.md` | …/gateway-products/gateway-aws-ecs-express/ecs-express-cost-monitoring | ECS Express maliyet bütçesi/uyarıları (USD). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-aws-ecs-express__set-up-domain.md` | …/gateway-products/gateway-aws-ecs-express/set-up-domain | ECS Express özel alan adı (ACM). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-control-plane-api.md` | …/gateway-products/gateway-control-plane-api | Gateway Control Plane API (GraphQL) partner entegrasyonu genel bakış. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-control-plane-api__account-data-routing.md` | …/gateway-products/gateway-control-plane-api/account-data-routing | Control Plane: hesap veri yönlendirme sorguları. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-control-plane-api__account-event-metrics.md` | …/gateway-products/gateway-control-plane-api/account-event-metrics | Control Plane: zaman aralığına göre hesap olay metrikleri. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-control-plane-api__account-management.md` | …/gateway-products/gateway-control-plane-api/account-management | Control Plane: hesap oluşturma/yönetim. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-control-plane-api__objects.md` | …/gateway-products/gateway-control-plane-api/objects | Control Plane: nesne şemaları (Tenant vb.). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-control-plane-api__pixel-management.md` | …/gateway-products/gateway-control-plane-api/pixel-management | Control Plane: pixel bağlantısı oluşturma/etkinleştirme. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-control-plane-api__setup-data-pipelines.md` | …/gateway-products/gateway-control-plane-api/setup-data-pipelines | Signals Gateway hat/pixel API’leri genel bakış (tenant=hesap). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-control-plane-api__setup-data-pipelines__data-destinations.md` | …/gateway-products/gateway-control-plane-api/setup-data-pipelines/data-destinations | Control Plane: veri hedefi API’leri. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-control-plane-api__setup-data-pipelines__data-pipelines.md` | …/gateway-products/gateway-control-plane-api/setup-data-pipelines/data-pipelines | Control Plane: veri hattı API’leri. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-control-plane-api__setup-data-pipelines__data-sources.md` | …/gateway-products/gateway-control-plane-api/setup-data-pipelines/data-sources | Control Plane: veri kaynağı API’leri. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-control-plane-api__setup-data-pipelines__objects.md` | …/gateway-products/gateway-control-plane-api/setup-data-pipelines/objects | Control Plane: hat nesneleri. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-control-plane-api__user-management.md` | …/gateway-products/gateway-control-plane-api/user-management | Control Plane: kullanıcı/rol yönetimi. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-gcp__architecture.md` | …/gateway-products/gateway-gcp/architecture | GCP mimarisi (Cloud Run vb.). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-gcp__create-instance-agencies-partners.md` | …/gateway-products/gateway-gcp/create-instance-agencies-partners | GCP Cloud Shell ile ajans kurulumu (uzak betik çalıştırma). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-gcp__create-instance-from-events-manager.md` | …/gateway-products/gateway-gcp/create-instance-from-events-manager | Events Manager’dan GCP örneği. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-gcp__host-onboarding.md` | …/gateway-products/gateway-gcp/host-onboarding | GCP ev sahibi kurulumu, 300 USD kredi bölgeleri. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__gateway-gcp__set-up-domain.md` | …/gateway-products/gateway-gcp/set-up-domain | GCP özel alan adı (Load Balancer <13 alan adı, üstü Cloudflare). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__host-management.md` | …/gateway-products/host-management | Hesap katılımı ön koşulları (DNS yöneticisi erişimi, Chrome). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__host-management__account-management.md` | …/gateway-products/host-management/account-management | Yönetilen/yönetilmeyen barındırılan hesaplar; reklamveren başına bir hesap. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__host-management__account-management__account-data-routing.md` | …/gateway-products/host-management/account-management/account-data-routing | Birinci taraf alt alan adı (CNAME) yönlendirmesi. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__host-management__account-management__manage-allow-block-lists.md` | …/gateway-products/host-management/account-management/manage-allow-block-lists | Alan adı engelleme: engelli alandan gelen olay hedefe gitmez. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__host-management__account-management__onboarding-and-offboarding-accounts.md` | …/gateway-products/host-management/account-management/onboarding-and-offboarding-accounts | Yönetilmeyen hesap davet/silme. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__host-management__auto-scaling-limits.md` | …/gateway-products/host-management/auto-scaling-limits | Olay kapasitesi (varsayılan 100 olay/sn), aşımda uyarı. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__host-management__dns-setup-guide.md` | …/gateway-products/host-management/dns-setup-guide | Cloudflare DNS: proxy “DNS only”. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__host-management__host-settings.md` | …/gateway-products/host-management/host-settings | Ev sahibi ayarları ve güncellemeler. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__host-management__post-setup-management.md` | …/gateway-products/host-management/post-setup-management | Otomatik güncelleme/optimizasyon varsayılan açık. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__host-management__set-up-smtp.md` | …/gateway-products/host-management/set-up-smtp | Davet e-postaları için SMTP. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__host-management__system-health-information.md` | …/gateway-products/host-management/system-health-information | İsteğe bağlı sistem sağlık telemetrisi. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__host-management__user-management.md` | …/gateway-products/host-management/user-management | Barındırılan hesap rolleri (Admin/Standard/View Only). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__non-web-server-events.md` | …/gateway-products/non-web-server-events | Gateway’e sunucudan olay: POST https://<gateway>/capi/{PIXEL_ID}/events (v1.6.0+). | Orta |
| `gateway-products__signals-gateway.md` | …/gateway-products/signals-gateway | Signals Gateway: kendi altyapında çok kaynaklı/çok hedefli olay hattı. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__custom-audience.md` | …/gateway-products/signals-gateway/custom-audience | Signals Gateway özel kitle (açık beta). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__custom-data-destination.md` | …/gateway-products/signals-gateway/custom-data-destination | Özel veri hedefine olay yayını (5 sn zaman aşımı). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__data-destination-management.md` | …/gateway-products/signals-gateway/data-destination-management | Veri hedefi yönetimi (CAPI eklentisi gerekir). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__data-source-management.md` | …/gateway-products/signals-gateway/data-source-management | Veri kaynağı yönetimi. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__diagnostics-tab.md` | …/gateway-products/signals-gateway/diagnostics-tab | Signals Gateway teşhis sekmesi. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__enable-cdn.md` | …/gateway-products/signals-gateway/enable-cdn | Signals Gateway Pixel için CloudFront CDN. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__event-filtering.md` | …/gateway-products/signals-gateway/event-filtering | Hat/hedef düzeyinde olay süzme. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__google-bigquery-connection-setup.md` | …/gateway-products/signals-gateway/google-bigquery-connection-setup | BigQuery hedefi kurulumu. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__instance-activation.md` | …/gateway-products/signals-gateway/instance-activation | Signals Gateway örneği etkinleştirme. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__message-center.md` | …/gateway-products/signals-gateway/message-center | Günlük yenilenen sistem mesajları. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__pipeline-management.md` | …/gateway-products/signals-gateway/pipeline-management | Veri hattı oluşturma/silme/güncelleme. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__pixel-setup-google-tag-manager.md` | …/gateway-products/signals-gateway/pixel-setup-google-tag-manager | Signals Gateway Pixel’i GTM’de kurma. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__plugins.md` | …/gateway-products/signals-gateway/plugins | Eklentiler: Meta CAPI, BigQuery. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__setup.md` | …/gateway-products/signals-gateway/setup | Signals Gateway kurulum seçenekleri (partner barındırmalı: Stape, Madgicx…). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__signals-gateway-pixel-helper.md` | …/gateway-products/signals-gateway/signals-gateway-pixel-helper | Signals Gateway Pixel Helper Chrome eklentisi. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__signals-gateway-pixel-onboarding.md` | …/gateway-products/signals-gateway/signals-gateway-pixel-onboarding | Signals Gateway Pixel kurulumu (Meta sunucusuna bağımlı olmayan pixel). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__signals-gateway-sdk-onboarding.md` | …/gateway-products/signals-gateway/signals-gateway-sdk-onboarding | Signals Gateway iOS SDK kaynağı. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__temporary-user-for-debugging.md` | …/gateway-products/signals-gateway/temporary-user-for-debugging | Süreli geçici kullanıcı. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__signals-gateway__upload-events.md` | …/gateway-products/signals-gateway/upload-events | Signals Gateway CSV dosya yükleme. (giriş düzeyinde okundu) | Düşük |
| `gateway-products__troubleshooting-guide.md` | …/gateway-products/troubleshooting-guide | Gateway sorun giderme; Event Setup Tool ile tanımlı olaylar Gateway’de İZLENMEZ, engelli site/CSP/DNS/badToken. | Orta |
| `gateway-products__uninstall.md` | …/gateway-products/uninstall | Gateway kaldırma (CloudFormation/Cloud Shell). (giriş düzeyinde okundu) | Düşük |
| `gateway-products__updates.md` | …/gateway-products/updates | Otomatik/elle güncelleme. (giriş düzeyinde okundu) | Düşük |
| `marketing-api__app-event-api.md` | …/marketing-api/app-event-api | Eski App Events API (/{app-id}/activities) — yeni entegrasyon önerilmiyor; standart uygulama olay adları, hash’siz veri yok sayılır, X-Forwarded-For. | Düşük |
| `marketing-api__reference__ads-pixel.md` | …/marketing-api/reference/ads-pixel | AdsPixel düğümü: alanlar (last_fired_time, is_unavailable, is_consolidated_container, enable_automatic_matching, data_use_setting…), oluşturma (/act_/adspixels, 6200/6202), güncelleme. | Yüksek |
| `marketing-api__reference__ads-pixel__ads_signal_diagnostic_issues.md` | …/marketing-api/reference/ads-pixel/ads_signal_diagnostic_issues | Reklam hesabına göre sinyal teşhis sorunları (ad_account_id zorunlu); düğüm alanları sayfada yok. | Yüksek |
| `marketing-api__reference__ads-pixel__agencies.md` | …/marketing-api/reference/ads-pixel/agencies | Pixel’in paylaşıldığı ajans işletmeleri + permitted_roles/tasks. | Düşük |
| `marketing-api__reference__ads-pixel__analytics_entity_user_config.md` | …/marketing-api/reference/ads-pixel/analytics_entity_user_config | Analytics kullanıcı yapılandırması (belgede açıklama yok). | İlgisiz |
| `marketing-api__reference__ads-pixel__analytics_funnel_query.md` | …/marketing-api/reference/ads-pixel/analytics_funnel_query | Analytics huni sorgusu sonuçları (query_ids). | İlgisiz |
| `marketing-api__reference__ads-pixel__analytics_segments.md` | …/marketing-api/reference/ads-pixel/analytics_segments | Analytics segmentleri (açıklama yok). | İlgisiz |
| `marketing-api__reference__ads-pixel__assigned_users.md` | …/marketing-api/reference/ads-pixel/assigned_users | Pixel’e atanmış kullanıcılar ve görevleri (business zorunlu). | Orta |
| `marketing-api__reference__ads-pixel__audiences.md` | …/marketing-api/reference/ads-pixel/audiences | Pixel kaynaklı özel kitleler (action_source WEBSITE/PHYSICAL_STORE, ad_account süzgeci). | Orta |
| `marketing-api__reference__ads-pixel__capability_overrides.md` | …/marketing-api/reference/ads-pixel/capability_overrides | Pixel yetenek geçersiz kılmaları (açıklama yok). | İlgisiz |
| `marketing-api__reference__ads-pixel__cloudbridge_dataset_status.md` | …/marketing-api/reference/ads-pixel/cloudbridge_dataset_status | Gateway (cloudbridge) için CAPI hedef durumu. | Düşük |
| `marketing-api__reference__ads-pixel__cpas_events_debugging_info.md` | …/marketing-api/reference/ads-pixel/cpas_events_debugging_info | Son günlerin olay+teşhis sayıları (action_source süzgeci). | Orta |
| `marketing-api__reference__ads-pixel__customconversions.md` | …/marketing-api/reference/ads-pixel/customconversions | Pixel’e bağlı özel dönüşümler (ad_account süzgeci); yalnız okuma. | Yüksek |
| `marketing-api__reference__ads-pixel__da_checks.md` | …/marketing-api/reference/ads-pixel/da_checks | Dinamik reklam kontrolleri (pixel_missing_param_in_events, pixel_decline; connection_method). | Orta |
| `marketing-api__reference__ads-pixel__domain_control_rule.md` | …/marketing-api/reference/ads-pixel/domain_control_rule | Pixel alan adı kara/beyaz liste kuralları (okuma). | Orta |
| `marketing-api__reference__ads-pixel__domain_last_fired_time.md` | …/marketing-api/reference/ads-pixel/domain_last_fired_time | Verilen alan adlarında pixel’in son tetiklenme zamanı (domain_name_list zorunlu). | Yüksek |
| `marketing-api__reference__ads-pixel__event_last_fired_time.md` | …/marketing-api/reference/ads-pixel/event_last_fired_time | Olay başına son tetiklenme zamanı (event). | Yüksek |
| `marketing-api__reference__ads-pixel__event_rules.md` | …/marketing-api/reference/ads-pixel/event_rules | Pixel veri kaynağı altındaki mevcut kurallar. | Düşük |
| `marketing-api__reference__ads-pixel__events.md` | …/marketing-api/reference/ads-pixel/events | POST /{pixel_id}/events — CAPI uç noktası: data (zorunlu), test_event_code, partner platforms; dönüş events_received/messages/fbtrace_id. | Yüksek |
| `marketing-api__reference__ads-pixel__extractors.md` | …/marketing-api/reference/ads-pixel/extractors | Kodsuz olaylar için parametre çıkarıcılar (current_domain). | Düşük |
| `marketing-api__reference__ads-pixel__integration_quality.md` | …/marketing-api/reference/ads-pixel/integration_quality | CAPI entegrasyon kalitesi (agent_name, time_range); dataset_quality’nin eski adı. | Orta |
| `marketing-api__reference__ads-pixel__item_price_stats.md` | …/marketing-api/reference/ads-pixel/item_price_stats | Ürün fiyat kapsama istatistikleri. | Düşük |
| `marketing-api__reference__ads-pixel__microdata_stats.md` | …/marketing-api/reference/ads-pixel/microdata_stats | Katalog için mikroveri istatistikleri (catalog_id zorunlu). | Düşük |
| `marketing-api__reference__ads-pixel__openbridge_configurations.md` | …/marketing-api/reference/ads-pixel/openbridge_configurations | Pixel’e bağlı OpenBridge (Gateway) yapılandırmaları. | Düşük |
| `marketing-api__reference__ads-pixel__pixel_delivery_recommendations.md` | …/marketing-api/reference/ads-pixel/pixel_delivery_recommendations | Pixel bilgisine dayalı teslim önerileri (düğüm alanları yok). | Orta |
| `marketing-api__reference__ads-pixel__raw_fires.md` | …/marketing-api/reference/ads-pixel/raw_fires | Ham pixel tetiklemeleri (event zorunlu; device_type/host/url süzgeci). | Orta |
| `marketing-api__reference__ads-pixel__real_time_event_log.md` | …/marketing-api/reference/ads-pixel/real_time_event_log | Oturum açmış kullanıcı için son pixel tetiklemeleri (varsayılan limit 100). | Düşük |
| `marketing-api__reference__ads-pixel__recent_events.md` | …/marketing-api/reference/ads-pixel/recent_events | Bir olayın son X saniyedeki sayısı (event + lookback_window zorunlu). | Yüksek |
| `marketing-api__reference__ads-pixel__segments.md` | …/marketing-api/reference/ads-pixel/segments | Pixel trafiği segment analizi (date_preset, site_cpm). | İlgisiz |
| `marketing-api__reference__ads-pixel__server_events_permitted_business.md` | …/marketing-api/reference/ads-pixel/server_events_permitted_business | Sunucu olayı göndermesine izin verilen işletmeler. | Orta |
| `marketing-api__reference__ads-pixel__setup_quality.md` | …/marketing-api/reference/ads-pixel/setup_quality | Partnerin gönderdiği olaylara göre CAPI kurulum geri bildirimi (agent_name). | Orta |
| `marketing-api__reference__ads-pixel__shared_accounts.md` | …/marketing-api/reference/ads-pixel/shared_accounts | Pixel↔reklam hesabı paylaşımı (GET/POST/DELETE; business zorunlu); Eylül 2024 sonrası ortak erişim şartı. | Yüksek |
| `marketing-api__reference__ads-pixel__shared_agencies.md` | …/marketing-api/reference/ads-pixel/shared_agencies | Pixel’in paylaşıldığı ajanslar. | Düşük |
| `marketing-api__reference__ads-pixel__signals_iwl_feedback_nux.md` | …/marketing-api/reference/ads-pixel/signals_iwl_feedback_nux | Olay kurulum aracı (IWL) arayüz geri bildirimi — dahili. | İlgisiz |
| `marketing-api__reference__ads-pixel__signals_iwl_nux.md` | …/marketing-api/reference/ads-pixel/signals_iwl_nux | IWL tanıtım ekranı verisi — dahili. | İlgisiz |
| `marketing-api__reference__ads-pixel__stats.md` | …/marketing-api/reference/ads-pixel/stats | Pixel istatistikleri: aggregation (event, url, host, device_type, match_keys, had_pii, event_source…), en fazla 7 gün geriye; event_source WEB_ONLY/SERVER_ONLY. | Yüksek |
| `marketing-api__tracking-specs.md` | …/marketing-api/tracking-specs | tracking_specs (yalnız ölçüm) vs conversion_specs (v2.4’ten beri salt okunur, optimization_goal’dan türer); hedefe göre varsayılan izleme; promoted_object’teki pixel otomatik izlenir. | Yüksek |

