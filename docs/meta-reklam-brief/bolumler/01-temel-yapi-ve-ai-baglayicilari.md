# 01 — Temel yapı (Marketing API) ve AI bağlayıcıları (Ads MCP + Ads CLI)

> Kaynak: 79 sayfa (`_listeler/A-temel.txt`) · Okunan: 79/79 · Bilgi belgeden, canlıda doğrulanmadı.
>
> **Ek kaynak (belge DEĞİL):** Belgenin "Available tools" sayfası (`ads-mcp-server-tools.md`) BOŞ geldi ve araç sayfaları yalnızca ad + tek cümle veriyor; parametre yok. Bu yüzden Meta Ads MCP sunucusunun araç şemaları, bu oturumda bağlı olan `mcp.facebook.com/ads` sunucusunun **canlı araç tanımlarından** (2026-10-06) okundu. O bilgiler aşağıda **[canlı şema]** etiketiyle ayrı işaretli. Hiçbir araç ÇAĞRILMADI; yalnızca tanımlar okundu. Şema Meta'nın değiştirebileceği bir sözleşme, belge değil.

## Özet: Advetics için ne demek

1. **Insights'ta atıf parametresi göndermek 2025-06-10'dan beri HİÇBİR ŞEY yapmıyor.** `use_unified_attribution_setting` ve `action_report_time` artık yok sayılıyor, yanıt Ads Manager ayarını taklit ediyor (OCC 2025-03-10). Advetics'in "açıkça gönderiyoruz, hesap varsayılanına kalmıyor" güvencesi (canlı bilgi #8) belgeye göre BOŞ: rakam artık ad set'in `attribution_spec`'ine bağlı. Ayrıca `7d_view` ve `28d_view` pencereleri 2026-01-12'den beri veri döndürmüyor. Bu, karşılaştırılabilir CPA/ROAS'ın kaynağının ad set kurulumuna taşındığı demek.
2. **v23'ten beri yeni ad set'ler Advantage+ Audience'a VARSAYILAN olarak giriyor.** Bu durumda `age_min`/`age_max` sert sınır değil ÖNERİ; Meta kitleyi sessizce genişletebiliyor. Sert yaş sınırı için `targeting_automation.advantage_audience = 0` açıkça yazılmalı ([canlı şema] da aynısını söylüyor). Canlı bilgi #9 (`age_max = 65`) bu katmanın altında kalıyor.
3. **Bugün (2026-10-06) v24.0'ın son günü.** v25.0 tek uzun ömürlü sürüm. Advetics'in varsayılanı `META_API_VERSION=v25.0` (`configuration.ts:162`); sunucu `.env`'i bunu ezmiyorsa sorun yok, eziyorsa kontrol edilmeli. Sürümü düşmüş çağrı ya patlıyor ya da sessizce bir sonraki sürüme yükseltiliyor (`X-Ad-Api-Version-Warning` başlığı) ve yükseltilen çağrı FARKLI davranabilir.
4. **v24'ten beri günlük bütçe esnekliği %25'ten %75'e çıktı.** Bir gün günlük bütçenin 1,75 katı harcanabilir; haftalık tavan 7 × günlük. Advetics'in kural motorundaki bütçe bekçisi "bugün günlük bütçeyi aştı" diye alarm üretiyorsa artık yanlış alarm üretir.
5. **Bütçe değişikliği ad set başına saatte 4 kez**, hesap harcama limiti günde 10 kez, mutasyon hızı hesap+uygulama başına 100 QPS. AI'ın "bütçeyi biraz artır, biraz daha artır" döngüsü 4. denemeden sonra bir saat kilitlenir (613 / 1487632).
6. **Meta'nın kendi AI aracı (Ads MCP) yazma işini üç kapıdan geçiriyor:** her nesne `PAUSED` oluşuyor; yayın ayrı bir araç (`ads_activate_entity`) ve "açık kullanıcı onayı olmadan çağırma" kuralı; Instagram boost'u `confirmed=false` ile önce PLAN döndürüyor. Ayrıca bir "taslak modu" var: reklam Ads Manager taslağına yazılıyor, yayın tek çağrıyla topluca yapılıyor. Advetics'in "okuma / taslak / onaylı canlı" katmanlaması bu tasarımla birebir örtüşüyor ve oradan alınacak çok somut kural var (bkz. "Yapay zekâ ile yönetim").
7. **Meta'nın aracı bütçeyi TAHMİN ETTİRMİYOR:** tutar ve sıklık (günlük/toplam) kullanıcı açıkça söylemediyse sor; "ayda 2.000" ne günlük ne toplamdır. İlgi alanı kimliği UYDURULMAZ. Yerleşim seçilmemişse "seçtim" denmez. Yapay zekâ içerik beyanı (`self_ai_disclosure`) ASLA tahmin edilmez.
8. **Meta'nın aracının da sessiz varsayılanları var:** IG boost varsayılanı ABD hedefleme + ~5 USD/gün + 6 gün + `OUTCOME_TRAFFIC`; mesajlaşma hedefinde `page_id` verilmezse "hesabın birincil sayfası" kendiliğinden seçiliyor; `instagram_user_id` verilmezse kreatif Instagram'da HİÇ yayınlanmıyor. Advetics bunları kopyalamamalı, kısıtlamalı.
9. **Silinmiş reklamın istatistiği üst nesnenin toplamına girer ama `level=ad` listesinde görünmez.** Reklam seviyesi tablonun toplamı kampanya toplamını tutmaz; hata yok. Arşivlenmiş nesneler kenar (edge) sorgularında filtresiz DÖNMEZ.
10. **Hata işlemenin tek güvenilir anahtarı kod/subcode;** açıklama metni haber vermeden değişebilir (belge açıkça söylüyor). `error_user_title` / `error_user_msg` ve `error_data.blame_field_specs` kullanıcıya gösterilecek metin ve hatalı alan için tasarlanmış. `is_transient: true` tekrar denenebilir demek.
11. **Webhook'lar artık ad hesabı seviyesinde:** `effective_status`, `with_issues_ad_objects`, `in_process_ad_objects`, `creative_fatigue`, `ad_recommendations`, `subscriptions` (eşik aboneliği). Bildirim yeni değeri TAŞIMIYOR (özellikle `effective_status`), mutlaka geri okumak gerekiyor.
12. **Öneri (recommendation) uygulamak tek tıkla Advantage+ özelliklerini açıyor, hatta ad set ÇOĞALTIYOR** (`CONVERSION_LEADS_OPTIMIZATION`, `CREATIVE_FATIGUE` üretken yapay zekâyla kopya kuruyor). AI'a "önerileri uygula" aracı verilirse bu, onaysız kampanya kurmanın arka kapısı olur.

---

## Kavramlar, kurallar ve alanlar

### Kısım 1 — Marketing API temeli

#### 1.1 Hiyerarşi ve hangi ayar nerede

| Seviye | API adı | Taşıdığı karar |
|---|---|---|
| Kampanya | `campaign` (eski adı `campaign_group`) | `objective`, `special_ad_categories`, `buying_type`; CBO ise bütçe + teklif stratejisi |
| Reklam seti | `adset` (eski adı `campaign`!) | bütçe (ABO), takvim, teklif, hedefleme, `optimization_goal`, `billing_event`, `promoted_object`, `destination_type` |
| Reklam | `ad` (eski adı `adgroup`) | hangi kreatif, `tracking_specs`, `status` |
| Kreatif | `adcreative` | görsel/metin; oluştuktan sonra DEĞİŞTİRİLEMEZ (yalnızca `name` ve durum) |

- Eski adlandırma uç noktalarda hâlâ yaşıyor: `/adcampaign` = ad set, `/campaigngroup` = kampanya, `/adgroup` = reklam. Kod okurken karıştırılmamalı.
- Kampanyanın amacı, altına eklenen her reklamın doğrulamasını belirliyor.
- Overview sayfasındaki tablo bütçe ve teklifi YALNIZCA ad set'e yazıyor; bu CBO'yu dışarıda bırakan eski bir anlatım (CBO'da bütçe kampanyada). Belge kendi içinde eskimiş.
- Her ad hesabının bir kreatif kütüphanesi var; kreatif birden çok reklamda yeniden kullanılabilir.

#### 1.2 Amaç (objective) — yalnızca ODAX

- **v21.0'dan (2024-10-02) itibaren** ODAX dışı amaçla yeni ad set/reklam oluşturulamıyor. Geçerli altı değer: `OUTCOME_AWARENESS`, `OUTCOME_TRAFFIC`, `OUTCOME_ENGAGEMENT`, `OUTCOME_LEADS`, `OUTCOME_SALES`, `OUTCOME_APP_PROMOTION`.
- **v19.0'dan itibaren** kopyalama (`/copies`) da yalnızca ODAX amaçlarıyla çalışıyor.
- **DİKKAT:** "Get started / basic ad creation / manage campaigns" sayfalarındaki örnekler hâlâ `objective=LINK_CLICKS` ve `objective=CONVERSIONS` kullanıyor, ad set örneği `optimization_goal` ve `billing_event` içermiyor. Bu örnekler bugün çalışmaz; kopyalanmamalı.

#### 1.3 Durum (status) modeli

- **Canlı durumlar:** `ACTIVE`, `PAUSED`, `PENDING_REVIEW`, `CREDIT_CARD_NEEDED`, `PREAPPROVED`, `DISABLED`, `PENDING_PROCESS`, `WITH_ISSUES`.
- **`effective_status` (okunur):** `ACTIVE, PAUSED, DELETED, PENDING_REVIEW, DISAPPROVED, PREAPPROVED, PENDING_BILLING_INFO, CAMPAIGN_PAUSED, ARCHIVED, ADSET_PAUSED, WITH_ISSUES, IN_PROCESS`. `configured_status` / `status` yalnızca `ACTIVE, PAUSED, DELETED, ARCHIVED`.
- **Kalıtım:** kampanya `WITH_ISSUES/PAUSED/ARCHIVED/DELETED` olursa altındakiler de o durumu miras alıyor; reklamın durumu üst nesneyi etkilemiyor.
- **ARCHIVED:** yalnızca `name` ve `status` değişebilir; durum yalnızca `DELETED`'a geçebilir. Hesap başına kampanya/ad set/reklam için ayrı ayrı 100.000 arşiv sınırı (best-practices sayfası "5000" diyor; belge kendi içinde çelişiyor). Sınıra gelince arşivleme `1487990` ile reddediliyor.
- **DELETED:** geri dönüşü yok; yalnızca `name` değişir. Kendi kimliğiyle sorgulanabilir ama üst nesnenin kenarından dönmez; `status` filtresine `DELETED` koymak HATA verir.
- Silinen reklam son yayından sonra **28 gün** daha gösterim/tıklama/eylem toplayabilir. Meta önerisi: silmeden önce istatistiği kendi sisteminde sakla, 28 gün bekle.
- **Post-processing (v4.0+):** oluşturma/düzenleme sonrası ağır işler ayrı akışta; nesne `IN_PROCESS` görünür (kreatifte `status` alanı ve belge burada `IN-PROCESS` tireli yazıyor; iki yazım var, ikisi de karşılanmalı). Başarısızsa `WITH_ISSUES` + `issues_info[]` (`level`, `error_code`, `error_summary`, `error_message`). `IN_PROCESS` nesne güncellenebilir.

#### 1.4 İnceleme (ad review) tetikleyicileri

- İncelemeye sokar: kreatif değişikliği (görsel, metin, bağlantı, video), hedefleme değişikliği, `optimization_goal` / `billing_event` değişikliği (belge "olabilir" diyor).
- İncelemeye sokmaz: teklif, bütçe, ad set takvimi.
- İncelemeye `PAUSED` giren reklam incelemeden sonra da `PAUSED` kalır; değilse yayına hazır sayılır.

#### 1.5 Kimlik doğrulama ve yetkilendirme

- **Erişim katmanı ("Marketing API Access Tier"):** 2026-05-04'te yeniden adlandırıldı. "Standard" → **Limited**, "Advanced" → **Full**.

| | Limited (varsayılan) | Full (App Review sonrası) |
|---|---|---|
| Hız sınırı | ağır; "yalnızca geliştirme" | hafif |
| Business Manager | ad hesabı/kullanıcı/sayfa yönetimi YOK | tümü |
| System user | 1 + 1 admin | 10 + 1 admin |
| Sayfa oluşturma | yok | yok |

- **Full'a geçmek VE KORUMAK için:** son 15 günde ≥500 başarılı Marketing API çağrısı **ve** son 500 çağrıda hata oranı <%15. (Eşik 1.500'den 500'e indi.) Hata oranı yüksek bir döngü katmanı kaybettirebilir; belge "korumak için" diyor ama düşüşün ne zaman uygulandığını söylemiyor (**belgede belirsiz**).
- Başkasının ad hesabını yönetmek için `ads_read` ve/veya `ads_management` izinlerinin **advanced/full** düzeyi gerekiyor. Yalnızca rapor: `ads_read`; okuma+yazma: `ads_management`.
- Hangi düzeyde olursa olsun **çağrılar ÜRETİM verisine** gidiyor; "geliştirme modu" diye ayrı bir veri yok. Sandbox reklam hesabı var ama orada reklam/kreatif OLUŞTURULAMIYOR.
- **Token türleri:**
  - Kısa ömürlü kullanıcı token'ı: 1–2 saat.
  - Uzun ömürlü kullanıcı token'ı: ~60 gün (veya "Never"); şifre değişince / izin geri alınınca ölür.
  - Sunucu taraflı OAuth akışı "kalıcı" token döndürüyor; istemci taraflı akış 1–2 saatlik token döndürüp uzatılması gerekiyor.
  - **System user token'ı: süresi dolmuyor**, kişiye bağlı değil, kullanıcı token'ından daha az geçersizleşiyor. Sunucudan sunucuya iş için önerilen yol.
- Token'ı her kullanımda geçerli say**ma**: kullanıcı token'ı her an geçersizleşebilir; arayüzü olmayan zamanlanmış işlerde yeniden yetki isteme yolu (ör. e-posta) kurulmalı.
- OAuth: `https://www.facebook.com/v25.0/dialog/oauth?client_id=…&redirect_uri=…&scope=ads_management` → `code` → `GET /v25.0/oauth/access_token?client_id&redirect_uri&client_secret&code`. `redirect_uri` sonuna `/` koyulması öneriliyor.
- **Business Verification**, uygulama hassas veriye erişecekse zorunlu.
- Kullanıcı kimliği, oturum ve ad hesabı kimliği BİRLİKTE saklanmalı: bir kullanıcının hesabıyla başka kullanıcının token'ı karıştırılırsa izin hatası.

#### 1.6 Sürümleme

- Güncel sürüm **v25.0** (2026-02-18, bitiş TBD). v24.0: 2025-10-08 → **2026-10-06**. v23.0: 2025-05-29 → 2026-06-09 (bitti). Sürümler ~4 ayda bir; eski sürüm en az 90 gün yaşıyor.
- **Sürümsüz çağrı GEÇERSİZ** (Graph API'nin geri kalanından farklı).
- **Otomatik yükseltme (2024-05'ten beri):** süresi dolmuş sürümle gelen çağrı, uç nokta sonraki sürümde değişmemişse sessizce yükseltiliyor; değişmişse düşüyor. Yükseltilen yanıtta `X-Ad-Api-Version-Warning` başlığı var. Uygulama ayarlarından kapatılabiliyor. Bir uygulama, oluşturulduğu andaki en yeni sürümden eskisini çağıramaz.
- **Migration**'lar sürümden bağımsız ve tüm sürümlere uygulanıyor; `migrations_override` ile çağrı başına açılıp kapatılabiliyor.

#### 1.7 Hız sınırları (rate limit)

Marketing API'nin hız sınırı Graph API'ninkinden AYRI.

| Sınır | Kapsam | Değer | Hata |
|---|---|---|---|
| Hesap seviyesi puan | ad hesabı | okuma 1, yazma 3 puan. Limited: tavan 60, sönme 300 sn, aşınca 300 sn blok. Full: tavan 9000, sönme 300 sn, aşınca 60 sn blok | `17`/`2446079`, `613`/`1487742` |
| Mutasyon QPS | hesap + uygulama | 100 istek/sn; kampanya/ad set/reklam oluşturma-düzenleme | `613`/`5044001` |
| Insights platformu | uygulama | altyapı kapasitesine göre; aşınca uygulamanın TÜM insights çağrıları kısılıyor | `4`/`1504022`, `1504039` |
| Uygulama seviyesi | uygulama | kullanıcı sayısına göre | `4` |
| BUC (Business Use Case) | ad hesabı, 1 saat | `ads_management`: (Full 100.000 / Dev 300) + 40 × aktif reklam. `custom_audience`: en az 190.000 (Full) / 5.000 (Dev) + 40 × aktif kitle, en çok 700.000. `ads_insights`: (Full 190.000 / Dev 600) + 400 × aktif reklam − 0,001 × kullanıcı hatası. Katalog yönetimi: 20.000 + 20.000 × log2(tekil kullanıcı). Katalog batch: 200 + 200 × log2(tekil kullanıcı). Ayrıca CPU ve duvar saati | `80000`, `80003`, `80004`, `80014` |
| Harcama limiti değişikliği | ad hesabı | günde 10 (`spend_cap`, `spend_cap_action`) | `17`/`1885172` |
| Ad set bütçe değişikliği | ad set | saatte 4 (`daily_budget`, `lifetime_budget`); aşınca 1 saat blok | `613`/`1487632` |
| Reklam oluşturma | ad hesabı | hesabın günlük harcama limitine bağlı | `613`/`1487225` |
| Kötüye kullanım | ad hesabı | anormal trafikte geçici kota düşürme; subcode YOK | `613` (subcode null) |

- **İzlenecek başlıklar:** `X-Ad-Account-Usage` (`acc_id_util_pct`, `reset_time_duration`, `ads_api_access_tier`), `X-Business-Use-Case` (`call_count`, `total_cputime`, `total_time`, `estimated_time_to_regain_access`), `X-FB-Ads-Insights-Throttle` (`app_id_util_pct`, `acc_id_util_pct`, `ads_api_access_tier`).
- **Önerilen azaltma:** patlamayı yay, batch/`?ids=` kullan, üstel geri çekilme, insights'ta async iş, `level` ve `filtering` ile çağrı sayısını düşür.
- "Kullanıcı hatası" insights kotasından DÜŞÜYOR (`− 0,001 × User Errors`): hatalı insights çağrıları kotayı da yiyor.

#### 1.8 Hata kodları — sınıflandırma

Belge: **hata işleme yalnızca kodla yapılmalı, açıklama metni haber vermeden değişebilir.**

**Tekrar denenebilir (geri çekilerek):**
- `is_transient: true` taşıyan her hata.
- `1` (bilinmeyen), `2` ve negatif kodlar (iç hata; asıl sebep `error_subcode`'da).
- Hız: `4`, `17`, `613` (subcode'a göre bekleme süresi farklı), `80000/80003/80004/80014`.
- `3910001` ("hesap sorun yaşıyor, sonra dene").

**Kullanıcıya gösterilmeli (tekrar denemek boşa):**
- Yetki/token: `10`, `190`, `200`, `294`, `102`, `104`; `100`/`33` (system user ad hesabına admin eklenmemiş); `2654`/`1713092`; `1815694`.
- Sözleşme/onay: `200`/`1870034`, `1870090` (Custom Audience şartları), `1870092` (Business Tools şartları), `2708008` (siyasi reklam yetkisi yok), `1404163` (reklam verme yasağı), `1404078` / `2859015` (geçici blok).
- Bütçe: `1885272`, `1885650` (bütçe düşük; güncelleme 15 dk sürebildiği için tampon isteniyor), `2238055` (CBO bütçesi ad set sayısına yetmiyor; aynı kod IG alanı çakışması için de listelenmiş, **belge aynı kodu iki anlamda kullanıyor**), `1885621` (ya ad set ya kampanya bütçesi), `2446307` (harcama tavanı düşük).
- Kurgu: `2446383` (amaç harici web adresi istiyor), `2446509` (geçersiz `destination_type`), `1885204` (bu optimizasyonda teklif otomatik olmalı), `1487929` (birden çok promoted object), `1885029` (reklam sayfası ile tanıtılan nesnenin sayfası farklı), `1487033` (bitiş tarihi geçmişte), `1487007` (bitmiş takvimli ad set'teki reklam düzenlenemez), `1373054` (CTA çözülemedi), `1815629` (varlık değerleri tekil olmalı), `2490085` (`191x100` kırpma anahtarı kalkıyor, `100x100`), `3858082` (Standard Enhancements için `enroll_status` verilmemiş).
- Hedefleme: `100`/`1487694` (kalkmış davranış kategorisi), `2446394` (kullanılamayan detaylı hedefleme), `1870165` / `3858064` (18 yaş altı kısıtı), `1870199` (`location_types` artık gönderilmemeli), `1870088` (bağlantı hedeflemesi kalktı), `1870065` (pasif hesaptan paylaşılmış devre dışı kitle).
- İçerik/gönderi: `1487472`, `1885557`, `2446289`, `2490155` (gönderi silinmiş/erişilemez), `1885183` (geliştirme modundaki uygulamanın gönderisi), `2490427` / `2490468` (reklam reddedildi, yeni reklam gerekiyor), `2446880` (sayfaya bağlı WhatsApp numarası koptu).
- Nesne durumu: `1487056` / `1487566` / `1885088` (silinmiş/arşivlenmiş nesnede yalnızca ad değişir), `1340029` (dinamik kreatifli reklam silinemez, ad set'i sil).
- IG kimliği: `2238055` / `2446149` (`instagram_user_id` ile `instagram_actor_id`, ya da `instagram_story_id` ile `source_instagram_media_id` birlikte gönderilemez), `1815199` (ad hesabının bu IG hesabına erişimi yok).
- DSA (AB): `100`/`3858079` (ödeyen yok), `3858081` (yararlanıcı yok), `3858152`.
- Görsel: `100`/`3858258` (görsel indirilemedi; robots.txt engeli olabilir).
- iOS 14 kodları (`1870125`, `2446632`, `2490xxx`, `3285xxx`, `3260002/7/8`) uygulama kampanyalarına özgü; `3260008`: dönüşüm olayı güncellenince reklam 72 saat duraklıyor.

**`blame_field_specs`:** doğrulama hatalarında `error_data` içinde; her eleman hatalı alanın yolu (`["daily_budget"]`, `["targeting_spec","interested_in"]`). Panelde hatayı ilgili alanın yanına koymak için tasarlanmış.

#### 1.9 Async ve batch istekler

- **Graph batch:** tek HTTP isteğinde en çok **50** istek; reklam oluştururken batch başına **≤10 reklam** önerisi. Önceki adımın sonucu JSONPath ile (`{result=create_creative:$.id}`). `redownload=1` güncellenen nesnenin tam halini döndürüyor.
- **Async ad request set'leri:** `GET /{request_set_id}` (`is_completed`, `total_count`, `success_count`, `error_count`, `canceled_count`, `notification_uri`, `notification_mode` = `OFF`/`ON_COMPLETE`); `GET /{request_set_id}/requests` (her istek `initial/in_progress/success/error/canceled`, `result` hatada `error_code`+`error_message`). İşlenmemiş istek `DELETE` ile iptal.
- **Async Batch API:** `POST /act_{id}/async_batch_requests`, `adbatch` dizisi, çağrı başına en çok **1000** istek; bağımsızlar paralel, bağımlılar sıralı. Liste: `GET /act_{id}/async_requests`.
- **ETag:** `If-None-Match` ile `304`; ama `304` da hız kotasından düşüyor. ETag kullanıcı aracısına (user-agent) göre değişebiliyor; istemci sabit olmalı.
- **v25:** başarısız async insights raporu artık varsayılan olarak `error_code`, `error_message`, `error_subcode`, `error_user_title`, `error_user_msg` döndürüyor; `error_code` tipi `uint`'ten `int`'e döndü.
- `act_{id}/adgroupstats` büyük hesapta zaman aşımına düşüyor; kullanılmamalı.

#### 1.10 Webhook'lar (ads webhooks)

- Nesne her zaman `ad_account`. İki adımlı kurulum, iki AYRI token:
  1. Uygulama token'ı ile `POST /{app_id}/subscriptions` (`object=ad_account`, `callback_url`, `fields`, `verify_token`). Meta doğrulama `GET`'i yolluyor (`hub.mode=subscribe`, `hub.challenge`, `hub.verify_token`); uç `hub.challenge`'ı aynen dönmezse abonelik kurulmaz.
  2. O hesabın admin token'ı (kullanıcı ya da system user) ile `POST /act_{id}/subscribed_apps`. Bu yapılmazsa olaylar HİÇ gelmez; her hesap için tekrarlanmalı.
- İmza: `X-Hub-Signature-256: sha256=<HMAC-SHA256(ham gövde, app secret)>`; ham gövde üzerinden doğrulanmalı.
- İzinler: bağlamak için `ads_management`, olay almak için `ads_read` veya `ads_management`.
- Zarf: `{object:"ad_account", entry:[{id, time, changes:[{field, value}]}]}`.

| Alan (`field`) | Ne zaman | `value` içeriği | Not |
|---|---|---|---|
| `effective_status` | teslim durumu değişince (red, blok, geri dönüş, üstten kalıtım) | `object_id`, `object_type` (`campaign/adset/ad`), `changed_fields:["effective_status"]` | **abone olunan ad `effective_status` ama bildirim `field_changed` alanıyla geliyor; YENİ DEĞER YOK**, geri okunmalı |
| `with_issues_ad_objects` | nesne sorun durumuna girince | `id`, `level` (`CAMPAIGN/AD_SET/AD/CREATIVE`), `error_code`, `error_summary`, `error_message` | |
| `in_process_ad_objects` | işleme bitince | `id`, `level`, `status_name` | |
| `creative_fatigue` | yorulma seviyesi değişince | `adgroup_id`, `creative_fatigue_level` (`LOW/MEDIUM/HIGH`), `creative_fatigue_message` | |
| `ad_recommendations` | yeni öneri | `ad_object_ids`, `recommendation_type`, `recommendation_signature`, `recommendation_message`, `recommendation_stage`, `recommendation_hash` | |
| `subscriptions` | tanımlanan eşik/olay | `subscription_id`, `account_id`, `object_id`, `object_type`, (`field`, `current_value`) | |

- **Eşik abonelikleri** (`/act_{id}/subscriptions`): `event_type` ∈ `OBJECT_CREATED`, `OBJECT_UPDATED` (metadata alanı: `name`, `objective`, `optimization_goal`, `buying_type`, `billing_event`, `is_autobid`, `daily_budget`, `lifetime_budget`, `spend_cap`, `bid_amount`, `adlabel_ids`, `start_time`, `stop_time`, `created_time`, `updated_time`), `INSIGHTS_UPDATED` (metrik eşik: `GREATER_THAN/LESS_THAN/IN_RANGE/NOT_IN_RANGE`; `spent`, `cpc`, `cpa`, `ctr`, `frequency`, `results`, `today_spent` vb.), `INSIGHTS_MILESTONE_REACHED` (`EQUAL`, değerin katları; `spent` en az 1000 = 10,00 birim). `filters` zorunlu, en çok 20; `entity_type` ile seviye. Para alanları hesap para biriminin alt biriminde (kuruş). Abonelik uygulamaya ve hesaba özgü. Zaman aralığı/atıf penceresi gibi zamanlama girdileri DESTEKLENMİYOR.
- **Bildirim tetikleyici, kaynak değil:** belge her webhook için "bildirimi al, sonra API'den oku" diyor.
- Teslim sırası, tekrar deneme ve mükerrer teslim davranışı bu sayfalarda **belirtilmiyor** (belgede belirsiz). Advetics'in mevcut kuralı (tekilleştirme `entry`/`change` seviyesinde) korunmalı.

#### 1.11 Performans önerileri (Opportunity Score) API'si

- Skor 0–100, **ad hesabı alanı**, neredeyse gerçek zamanlı. Öneriler kampanya/ad set/reklam/hesap seviyesinde.
- `GET /act_{id}/recommendations` (ad hesabı) veya `GET /{business_id}/recommendations` (yalnızca işletmenin SAHİP olduğu hesaplar; `ad_account_ids` en çok 100, `recommendation_stages`, `recommendation_names`, `locale`, `fields=recommendation_content`, `limit` ≤100).
- Alanlar: `recommendation_signature` (uygulamak için şart; bayatlarsa geçersiz; API'den uygulanamayan önerilerde HİÇ dönmüyor), `recommendation_stage` (`pre_create_guidance`, `pre_flight_recommendation`, `mid_flight_recommendation`), `recommendation_time`, `type` (hesap isteğinde) / `recommendation_name` + `level` (işletme isteğinde), `object_ids`, `recommendation_content.lift_estimate`, `body`, `opportunity_score_lift`, `url` (Ads Manager derin bağlantısı).
- API, Ads Manager'dan DAHA AZ öneri döndürebilir (Meta UI'da test ediyor).
- **Uygulama:** `POST /act_{id}/recommendations` + `recommendation_signature` + `extra_data`. Yanıt `{success}`; başarısızsa nesne değişmiyor. **Uygulamak Meta'nın hizmet şartlarını kabul etmek demek.** Eski `music_parameters` / `autoflow_parameters` / `fragmentation_parameters` biçimi kullanımdan kalkıyor.
- Türe göre `extra_data`: `ADVANTAGE_PLUS_AUDIENCE` (boş; tüm ad set'lerde A+A açar), `AUTOMATIC_PLACEMENTS` (boş; A+ yerleşim açar), `APLUSC_STANDARD_ENHANCEMENTS_BUNDLE` (`object_selection`, `creative_feature_opt_in_overrides`), `AUTOFLOW_OPT_IN`, `MUSIC`, `UNCROP_IMAGE`, `CREATIVE_FATIGUE` (üretken yapay zekâyla yeni varyasyon; reklamın kopyasını kurar), `BACKGROUND_GENERATION` (`action_type` OPT_IN/OPT_OUT zorunlu), `CONVERSION_LEADS_OPTIMIZATION` (**mevcut ad set ve reklamları ÇOĞALTIR**), `LANDING_PAGE_VIEW_OPTIMIZATION_GOAL` (optimizasyon hedefini değiştirir), `PERFORMANT_CREATIVE_REELS_OPT_IN`, `PRODUCT_SET_BOOSTING`, `SCALE_GOOD_CAMPAIGN` (`adsets`/`campaigns` ile `additional_budget` kuruş cinsinden), `SHOPS_ADS_SAOFF`.
- Diğer türler (yalnızca okunur/derin bağlantı): `BUDGET_LIMITED`, `FRAGMENTATION_V3`, `CAPI_*`, `PIXEL_*`, `MULTI_TEXT`, `OFFSITE_CONVERSION`, `VALUE_OPTIMIZATION_GOAL`, `PARTNERSHIP_ADS`, `UNIFIED_INBOX`, `MESSAGING_*`, `WA_MESSAGING_PARTNERS`, `GEN_AI_MVP`, `CTX_CREATION_PACKAGE`, `ADVANTAGE_PLUS_CATALOG_ADS`, `APLUSC_ADD_OVERLAYS`, `APLUSC_TEXT_IMPROVEMENTS`, `APLUSC_VISUAL_TOUCHUPS`, `CREATIVE_LIMITED`.
- **Geçmiş:** `GET /act_{id}/opportunity_score_history` (`from_date`, `to_date`, `get_reason`). En çok 45 gün; 2 gün veri gecikmesi (`to_date` bugün ise `5014023`); `get_reason=true` ile kampanya başına `changelog` (bütçe öncesi/sonrası, uygun/uygulanmış öneri türleri). Gerçek zamanlı skorla geçmiş skor ayrışabilir.
- Belge ayrıca `/act_{id}/ads` sorgularında daima `time_range` vermeyi öneriyor.

#### 1.12 Sürüm ve sürüm dışı değişiklikler (tarih ve sürümle)

| Tarih / sürüm | Değişiklik | Advetics etkisi |
|---|---|---|
| v18.0 (2023-09-12), tüm sürümler 2023-12-11 | `location_types` gönderilmezse `['home','recent']`; başka değerler hata | Gönderme (hata `1870199`) |
| 2023-06-06 OCC | IG Shop sekmesi yerleşimi (`instagram_positions: shop`) kalktı | Yerleşim sözlüğünden çıkar |
| v19.0 (2024-01-23) | Insights'ta `age_targeting`, `gender_targeting`, `labels`, `location`, `estimated_ad_recall*_bound` metrikleri kalktı. Kopyalama yalnızca ODAX. `targeting_optimization` link tıklama/LPV'de kabul edilmiyor; `targeting_as_signal` otomatik 1/3 | |
| 2024-03-11 OCC | Reklam seviyesinde `bid_amount` kalktı; ad set tek kaynak | Reklamda gönderme |
| v20.0 (2024-05-21), tüm sürümler 2024-08-19 | `IMPRESSIONS` optimizasyonu eski `POST_ENGAGEMENT` amacıyla ve `ON_POST` hedefiyle kabul edilmiyor. `frequency_control_specs` yalnızca `REACH` ve `THRUPLAY`'de; diğerlerinde çalışan kampanyalar devre dışı. Sponsored messages oluşturma kalktı. Offline Conversions API Mayıs 2025'te kapandı | Boost'ta `ON_POST` + `IMPRESSIONS` YASAK |
| 2024-06-24 OCC | Reklama `ad_schedule_start_time` / `ad_schedule_end_time` | |
| 2024-08-01 OCC, etkin 2024-10-30 | `unique_actions` / `cost_per_unique_action_type` yalnızca `link_click`, `onsite_conversion_messaging_first_reply`, `onsite_conversion_total_messaging_connection`, `outbound_click` döndürüyor | Tekil eylem raporu bu dört türe indi |
| 2024-10-07 / 2025-01-14 OCC | `CREDIT` → `FINANCIAL_PRODUCTS_SERVICES`; 2025-01-14'ten sonra `CREDIT` hata | |
| 2024-10-31 OCC | promoted object'e `variation` (`PRODUCT_SET_AND_WEBSITE/APP/IN_STORE/OMNICHANNEL`) | |
| v21.0 (2024-10-02) | ODAX dışı amaçla yeni ad set/reklam yok. Image Expansion, Standard Enhancements'ın parçası | |
| v22.0 (2025-01-21), tüm sürümler 2025-09-09 | Kreatifte `instagram_actor_id` → `instagram_user_id`; okumada `effective_instagram_story_id` → `effective_instagram_media_id`, `instagram_story_id` → `source_instagram_media_id`. `STANDARD_ENHANCEMENTS` paketiyle opt-in kalktı. Segment Asset Customization kalktı. Detaylı hedefleme hariç tutmaları kısıtlandı (2025-04-21 tüm sürümler); `exclusions` içinde özel kitle yerine `excluded_custom_audiences`. **"Seçilen şehir/bölgeye ilgi duyanlara da ulaş" genişlemesi geldi.** Marketing API'deki Instagram uçları kalktı (Instagram Platform'a taşı) | IG kimlik alanları; şehir hedeflemesinin sessiz genişlemesi |
| 2025-03-10 OCC, etkin **2025-06-10** | Insights `use_unified_attribution_setting` ve `action_report_time` YOK SAYILIYOR, yanıt Ads Manager ayarını taklit ediyor. 13 aydan eski başlangıçlı + breakdown'lı sorgularda `reach` dönmüyor (async gerek) | **Canlı bilgi #8 ile çelişiyor** |
| 2025-03-31 OCC | `facebook_positions`'a `notification` | |
| 2025-05-01 OCC (v22+) | `promoted_object.value_semantic_type` | |
| v23.0 (2025-05-29) | **Yeni ad set'ler Advantage+ Audience'a varsayılan opt-in.** Yaş/cinsiyet `targeting_automation.individual_setting` ile öneri olabilir. `smart_promotion_type` v25'te kalkıyor. R&F'de `instagram_actor_id` → `ig_user_id` | **Yaş sınırı sessizce öneriye dönüşüyor** |
| 2025-08-18 OCC (v21+) | Kampanyaya `is_adset_budget_sharing` | v24 sayfası alanı `is_adset_budget_sharing_enabled` diye yazıyor; **doğru ad belgede belirsiz** |
| 2025-08-19 OCC | `COMSCORE_MARKET` konum kaynağı | |
| 2025-09-18 OCC, etkin 2025-10-06 | AB'de sosyal mesele/seçim/siyasi reklam yasak | |
| v24.0 (2025-10-08) | Web sitesi hedefini optimize et (`destination_spec`). Messenger lead reklamı API'den kalktı. **Advantage+ Shopping/App kampanyası oluşturma/kopyalama/güncelleme yasak.** ABO'da `is_adset_budget_sharing_enabled` ZORUNLU. **Günlük bütçe esnekliği %75.** `placement_soft_opt_out` (hariç yerleşime %5'e kadar harcama; Satış ve Potansiyel Müşteri amaçları). Facebook video feeds yerleşimi kalktı (hata). Bayraklı özel kitle/dönüşümle kampanya güncellemesi hata (tüm sürümler 2026-01-06). **Detaylı hedefleme ilgi alanları birleştirildi**; eski seçenekli kampanyalar 2026-01-15'te durdu. Katalog batch 30 MB | Bütçe bekçisi; ABO alanı; ilgi alanı sözlüğü |
| 2025-10-09 OCC | `messenger_home` yerleşimi kalktı (tüm sürümler 2025-11-11) | |
| 2025-10-13 OCC, etkin **2026-01-12** | Insights `7d_view` ve `28d_view` veri döndürmüyor. Tekil sayımlar ve saatlik breakdown 13 ay, `frequency_value` 6 ay geçmiş. `mmm` yalnızca async | Geçmiş raporlar |
| 2025-10-29 OCC | `instagram_profile_visits` metriği | IG profil ziyareti hedefi için doğru metrik |
| 2025-12-08 OCC | `regional_regulated_categories: ["BRAZIL_REGULATION"]` + `regional_regulation_identities` | |
| v25.0 (2026-02-18) | Advantage+ Shopping/App yasağı tüm sürümlere 2026-05-19'da. Async insights hata alanları | |
| 2026-04-30 OCC | Özel kitlelere `audience_labels` | |
| 2026-05-04 | Erişim katmanı adları; `lift_estimate` yeni veri kaynağı | |
| 2026-05-08 OCC, etkin **2026-08-06** | `impression_device`, `hourly_stats_aggregated_by_audience_time_zone`, `frequency_value` breakdown'ları, satış desteği olmayan hesaplarda opt-in istiyor; senkron çağrı **BOŞ dönebiliyor** | Sessiz boş rapor |
| 2026-06-01 OCC | `/act_{id}/advideos` ile Reels müziğini telifsiz sesle değiştirme (`selected_audio_spec`, `replace_audio_status`) | |
| 2026-06-22 OCC | `breakdowns=dma` kalktı → `comscore_market` | |
| 2026-06-28 OCC | Advantage+ creative: `image_animation`, `video_filtering`, `video_uncrop` (`degrees_of_freedom_spec.creative_features_spec`) | Açıkça `OPT_OUT` yazılmazsa davranış belgede belirsiz |

#### 1.13 Diğer temel kavramlar

- **Insights uç noktası (`/{ad_id}/insights`):** `date_preset` varsayılanı `last_30d`; `time_increment` varsayılanı `all_days` (1–90 tam sayı, `monthly`); `time_ranges` verilirse diğer üçü yok sayılır; `time_range` UNIX zaman damgası kabul etmez. `action_breakdowns` için `actions` alanı da istenmeli. `sort` tek eleman. `fields` verilmezse yalnızca gösterim ve harcama. Başlangıç tarihi **37 aydan eski olamaz** (`3018`). `spend`, `reach`, `frequency`, `cpp` "tahmini"; bazı metrikler "geliştirmede". `attribution_setting` ad set'in penceresi; kampanya/hesap için ad set'lerden hesaplanıyor. `POST /{ad_id}/insights` async rapor (`report_run_id`).
- **Atıf penceresi varsayılanı belgede ÇELİŞKİLİ:** GET tablosu `default = ["7d_click","1d_view"]`, POST tablosu `default = ["7d_view","1d_click"]` diyor. MCP şeması 7 gün tıklama + 1 gün görüntüleme diyor. Doğrusu muhtemelen ilki ama **belgede belirsiz**; varsayılana yaslanılmamalı.
- **Önizleme (`/{ad_id}/previews`):** `ad_format` zorunlu; dönen iframe **24 saat** geçerli; her kreatif türü her biçimi desteklemiyor.
- **Kopyalama (`/{ad_id}/copies`):** `adset_id` (başka ad set'e taşıma), `creative_parameters` (üst seviye alanlar ezilir), `rename_options` (`DEEP_RENAME`/`ONLY_TOP_LEVEL_RENAME` varsayılan/`NO_RENAME`, `rename_prefix`, `rename_suffix` varsayılanı hesabın diline göre "- Copy"), `status_option` (`ACTIVE`/`PAUSED` varsayılan/`INHERITED_FROM_SOURCE`). AB DSA bölgesinde ödeyen/yararlanıcı yoksa kopyalama düşer.
- **`execution_options: ["validate_only"]`:** mutasyonu yapmadan doğrulama kurallarını koşturuyor, geçerse `{success:true}`. Bu grupta yalnızca `/{ad_id}/adlabels` sayfasında görüldü; kampanya/ad set/reklam oluşturmada da var olup olmadığı **bu sayfalardan doğrulanamıyor**.
- **Lead'ler (`/{ad_id}/leads`):** lead'ler reklama değil sayfaya ait; sayfa admini ya da sayfa yetkisi gerekli.
- **Diğer okuma kenarları:** `ad_studies`, `adcreatives`, `addrafts`, `adrules_governed` (`pass_evaluation`), `facebook_feedback` (`dynamic_post`), `targetingsentencelines`. Hepsi yalnızca okuma.
- **Data Processing Options (LDU):** yalnızca ABD eyaletleri; `data_processing_options: ["LDU"]`, ülke `1`/`0`, eyalet kodları `1000`–`1013`. Türkiye müşterileri için ilgisiz.
- **Omni/CAPI kurulum rehberi:** web olaylarında Pixel+CAPI tekilleştirmesi aynı `event_name` + `event_id` (veya `external_id`+`fbp`) ile, pencere **48 saat**; offline olaylar yalnızca offline olaylarla, `order_id` ya da kullanıcı bazlı, pencere **7 gün**. Satın almada `currency` ve `value` (≥0) zorunlu. EMQ 1–10; offline veri kalitesi skoru 8,5+ omni kampanyalar için. Katalog eşleşme oranı hedefi >%90.

### Kısım 2 — Ads AI Connectors

#### 2.1 Aile ve erişim

- Meta'nın "ads AI connectors" ailesi: **Ads MCP Server** (`https://mcp.facebook.com/ads`, Meta tarafından barındırılan uzak MCP sunucusu) ve **Ads CLI** (`meta-ads` PyPI paketi, Python 3.12+).
- **MCP kimlik doğrulama:**
  - OAuth: istemci Facebook Login for Business penceresine yönlendiriyor; Facebook hesabı ya da Meta Managed Account (MMA) ile giriş. Uygulamanın yönlendirme adresi istemciye göre ayarlanmalı.
  - Kullanıcı token'ı: `Authorization: Bearer <token>`; gereken izinler `ads_mcp_management`, `ads_read`, `ads_management`, `catalog_management`, `business_management`, `pages_show_list`, `instagram_basic`.
  - Kendi Meta uygulaması zorunlu değil; varsa "Create & manage ads with ads MCP server" kullanım durumu eklenmeli.
  - Claude Code: `claude mcp add --transport http --client-id <META_APP_ID> meta-ads https://mcp.facebook.com/ads`. ChatGPT: OAuth + uygulama kimliği.
- **[canlı şema]** `ads_get_ad_accounts` her hesap için `is_ads_mcp_enabled` (false ise o hesaba HİÇBİR araç çağrılmamalı) ve `is_queryable` + `not_queryable_reason` döndürüyor; ayrıca sahip işletme (`business_id`, `business_name`) yalnızca SAHİBİ gösteriyor, ajansla paylaşılmış hesabın diğer işletmeleri görünmüyor.
- **CLI kimlik doğrulama:** yalnızca **system user** token'ı (Admin rolünde system user; varlıklar atanmalı: dataset, ad hesabı, sayfa, katalog; system user uygulamaya App Admin olarak eklenmeli). Token kapsamları: `business_management`, `ads_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`, `catalog_management`, `read_insights`. Ortam: `ACCESS_TOKEN` (zorunlu), `AD_ACCOUNT_ID` (çoğu komutta zorunlu), `BUSINESS_ID` (isteğe bağlı; ad hesabından çözülüyor). Öncelik: bayrak > ortam değişkeni > proje `.env` > `~/.config/meta/` (XDG).

#### 2.2 Ads MCP — araç envanteri (eksiksiz)

Belgede yedi kategori var. Aşağıdaki liste belgedeki her aracı ve canlı sunucuda görülen fazlaları içeriyor. "Tür" sütunu Advetics katmanlaması için: **O** = salt okuma, **T** = taslak/PAUSED üretir (para harcamaz), **C** = canlı etki (para, yayın, kalıcı silme, kişisel veri).

**A. Hesap ve sayfa keşfi**

| Araç | Ne yapar | Tür | Önemli parametre / kural [canlı şema] |
|---|---|---|---|
| `ads_get_ad_accounts` | erişilen hesaplar (ad, durum, para birimi, saat dilimi) | O | sayfa 50, `cursor`; `is_ads_mcp_enabled`, `is_queryable` |
| `ads_get_ad_account_pages` | hesapta reklamda kullanılmış sayfalar | O | her sayfada `leadgen_tos_accepted` |
| `ads_get_pages_for_business` | işletmenin sayfaları | O | `business_id` zorunlu |
| `ads_get_user_pages` | kullanıcının CREATE_ADS yetkili tüm sayfaları | O | |
| `ads_get_field_context` | alan meta verisi (tip, filtrelenebilirlik, enum, seviye, takma ad) | O | `ads_get_ad_entities`'ten ÖNCE alan doğrulamak için; `spend` → `amount_spent` gibi takma adları çözer; çözülmeyen adlar `unknown_fields` |

**B. Kampanya / ad set / reklam yaşam döngüsü**

| Araç | Ne yapar | Tür | Önemli parametre / kural [canlı şema] |
|---|---|---|---|
| `ads_create_campaign` | kampanya (PAUSED) | T | zorunlu: `ad_account_id` (act_ öneksiz), `campaign_name`, `objective` (yalnızca 6 ODAX; eski amaçlar VALIDATION), `buying_type` (`AUCTION`/`RESERVED`). Bütçe: CBO varsayılan; `campaign_daily_budget` XOR `campaign_lifetime_budget` (alt birim); `campaign_bid_strategy` verilmezse `LOWEST_COST_WITHOUT_CAP`; ABO istenirse kampanyaya HİÇBİR bütçe/teklif alanı yazılmaz. `special_ad_categories` (`NONE, EMPLOYMENT, HOUSING, FINANCIAL_PRODUCTS_SERVICES, ISSUES_ELECTIONS_POLITICS, ONLINE_GAMBLING_AND_GAMING`; `CREDIT` emekli), `campaign_spend_cap`, `promoted_object`, `source_campaign_id`. Yanıt `valid_optimization_goals` + `recommended_optimization_goal` döndürüyor |
| `ads_create_ad_set` | ad set (PAUSED) | T | zorunlu: `ad_account_id`, `campaign_id`, `ad_set_name`, `billing_event`, `optimization_goal`, `targeting`. Ayrıntı aşağıda 2.3 |
| `ads_create_ad` | reklam (PAUSED); **taslak modunda Ads Manager taslağına yazar** | T | zorunlu: `ad_account_id`, `ad_set_id`, `ad_name`; `creative` içinde TAM OLARAK bir kaynak: `creative_id` / `object_story_id` / `object_story_spec` (`page_id` her zaman şart). `status` girdisi YOK. `source_ad_id` ile çoğaltma. `tracking_specs` |
| `ads_update_entity` | kampanya/ad set/reklam alanı güncelle | C | `entity_type` (`campaign/ad_set/ad`), `entity_id`, `fields` (JSON; **Ads API alan adları**: `name`, `daily_budget`… — create aracının argüman adları değil). `ad_account_id` nesnenin GERÇEK sahibi olmalı, değilse VALIDATION. `status` yalnızca `PAUSED/ARCHIVED/DELETED`; `ACTIVE` burada YASAK. Kreatif değiştirilemez; yeniden ebeveyn atama yasak; amaç yalnızca ODAX'a |
| `ads_activate_entity` | PAUSED → ACTIVE (yayın) | C | "Yalnızca kullanıcı açıkça onayladıktan sonra". Üst nesneyi açmak alttakileri açmaz; teslim için üç seviye de ACTIVE olmalı; yukarıdan aşağı aç. Taslakta `object_ids` ile toplu yayın, `publish_as_active`, `ignore_validation_errors` (yalnızca kullanıcı hataları GÖRDÜYSE). `PUBLISHING` sonucu "yayında" DEĞİL, "teslim edildi" demek |

**C. Kreatif ve medya**

| Araç | Ne yapar | Tür | Önemli parametre / kural [canlı şema] |
|---|---|---|---|
| `ads_create_creative` | kreatif oluştur | T | belge "tek görselli link reklam" diyor; canlı şema 8 biçim: tek görsel, tek video, PAC (yerleşime göre varlık, 2–10, tam bir "fallback"), MMU (2–10 varlık havuzu), Advantage+ katalog karuseli (`product_set_id`), statik karusel (`cards` 2–10), boost (`object_story_id`), Facebook Partnership Ad. `call_to_action_type` varsayılanı `LEARN_MORE`, kapalı enum. `advantage_plus_creative` yalnızca istenirse true. `self_ai_disclosure` (`OPT_IN/OPT_OUT`) **asla tahmin edilmez**, oluşturduktan sonra değiştirilemez. `instagram_user_id` yoksa IG'de yayın YOK. `display_link` yayından sonra değişmez |
| `ads_get_creatives` | kreatifleri listele | O | varsayılan alanlar `id, name, account_id, status, body, title, call_to_action_type`; `fields` kapalı liste (`effective_instagram_media_id`, `thumbnail_url`, `image_hash`…) |
| `ads_get_creative_ads` | kreatifi kullanan reklamlar | O | silmeden önce kontrol |
| `ads_get_ad_images` | yüklenmiş görseller | O | listelemede yalnızca `hash`+`name`; diğer alanlar için `hashes` ile tekrar çağır ("eksik alanı boş sanma"); `permalink_url`, `download_url` (yalnızca istenirse) |
| `ads_get_ad_videos` | yüklenmiş videolar | O | işleme durumu |
| `ads_get_ad_preview` | yerleşime göre önizleme | O | `ad_id` veya `creative_id`; `ad_account_id` ALMAZ; `preview_url` kullanıcıya aynen verilmeli |
| *(belgede yok)* `ads_creative_upload_media` | URL'den ya da yerel dosyadan görsel/video yükle | T | `upload_source` `URL`/`LOCAL_FILE`; Drive/Dropbox paylaşım bağlantıları çalışmaz; video `processing` iken kreatifte kullanılmaz |
| *(belgede yok)* `ads_creative_update` | kreatifin yalnızca `name`, `status=ACTIVE`, `adlabels`'ını değiştirir | C | içerik değiştirilemez; yeni kreatif + yeni reklam gerekir ve bunun için onay istenir |
| *(belgede yok)* `ads_creative_delete` | kreatif sil | C | önce `ads_get_creative_ads` ile kullanımda mı bak |
| *(belgede yok; uygulama içi)* `ads_creative_upload_local_image`, `ads_finalize_local_ad_image_upload`, `ads_delete_local_ad_image`, `ads_get_ad_preview_screenshot`, `ads_log_ui_interaction` | MCP App arayüzünün iç uçları | — | "modelin kullanması için değil" |

**D. Sorgu ve keşif**

| Araç | Ne yapar | Tür | Önemli parametre / kural [canlı şema] |
|---|---|---|---|
| `ads_get_ad_entities` | kampanya/ad set/reklam/hesap + metrik; **ana raporlama aracı** | O | `level` (`ad_account/campaign/adset/ad`), `fields` (verilmezse `id, name, amount_spent`), `filtering` (`field, operator, value[]`), `breakdowns`, `sort` (`metrik_descending` dizgesi), `date_preset` / `time_range`; verilmezse son 28 gün. `time_increment` DİZGE (`"7"`, `"monthly"`). `object_ids` ≤1000, `limit` ≤1000, `cursor` (diğer tüm parametreler aynen tekrar). `object_state: draft` taslakları okur. Hesap seviyesinde filtre/sıralama ve `cost_per_result` YOK. Yanıtta `next_actions` olabilir (2.4) |
| `ads_library_search` | Meta Reklam Kütüphanesi araması | O | `search_terms` / `page_ids` / `countries` (en az biri), `ad_type`, `ad_active_status`, `limit` ≤50; aktif ad hesabı şart |

**E. Instagram**

| Araç | Ne yapar | Tür | Önemli parametre / kural [canlı şema] |
|---|---|---|---|
| `ads_get_ig_accounts` | hesaba bağlı IG Business/Creator hesapları | O | sıfır dönerse ya bağlı hesap yok ya da `instagram_basic` izni yok |
| `ads_get_ig_media` | boost'a uygun medya | O | aynı `ad_account_id` zorunlu; `filters` (`date_range`, `media_type`, `product_type` FEED/STORY/REELS); sayfa ≤25 |
| `ads_boost_ig_post` | organik IG gönderisini reklama çevir (L3+L2+L1 birden) | T→C | zorunlu: `ad_account_id`, `ig_account_id`, `ig_media_id` (**`ads_get_ig_media`'nın sayısal `id`'si; permalink kısa kodu ÇÖZÜLMEZ**). İki adım: `confirmed=false` plan, `confirmed=true` oluşturma (PAUSED). Varsayılanlar: ~5 USD/gün karşılığı, 6 gün, `OUTCOME_TRAFFIC`, `INSTAGRAM_PROFILE` hedefi, `VISIT_INSTAGRAM_PROFILE`, **ABD hedefleme**, `IMPRESSIONS`, `LOWEST_COST_WITHOUT_CAP`. `destination_type` ∈ `INSTAGRAM_PROFILE, WEBSITE, ON_AD, INSTAGRAM_DIRECT, MESSENGER, WHATSAPP, FACEBOOK` |

**F. Özel kitleler**

| Araç | Ne yapar | Tür | Önemli parametre / kural [canlı şema] |
|---|---|---|---|
| `ads_get_ad_account_custom_audiences` | kitleleri listele | O | `subtype` filtresi |
| `ads_get_custom_audience` | tek kitle (boyut, durum, alt tür) | O | |
| `ads_get_custom_audience_adsets` | kitleyi kullanan ad set'ler | O | silmeden ÖNCE zorunlu |
| `ads_create_custom_audience` | kitle oluştur | T | `subtype` ∈ `CUSTOM, WEBSITE, ENGAGEMENT, MOBILE_APP, LOOKALIKE`; `rule` JSON DİZGESİ; WEBSITE "tüm ziyaretçiler" = `url i_contains ""` (PageView DEĞİL); LOOKALIKE `lookalike_ratio` 0,01–0,20, ülke sorulmaz; `retention_days` 1–180; olay adı uydurulmaz |
| `ads_update_custom_audience` | ad/açıklama/kural/etiket | C | |
| `ads_update_custom_audience_users` | müşteri listesine ekle/çıkar | C | `schema` + `data`; ham PII sunucuda normalize edilip SHA-256 ile hashleniyor; `EXTERN_ID`, `LOOKALIKE_VALUE` hashlenmiyor; `customer_consent`; çıkarma kitleyi teslim eşiğinin altına düşürürse ret |
| `ads_delete_custom_audience` | kalıcı sil | C | önce kullanan ad set'leri listele, üç uyarı (kalıcı, lookalike'lar önce silinmeli, ad set'ler OTOMATİK DURAKLATILACAK), sonra onay |

**G. Kapsamlı raporlama**

| Araç | Ne yapar | Tür | Not [canlı şema] |
|---|---|---|---|
| `ads_get_ad_entities` | (yukarıda) | O | |
| `ads_get_opportunity_score` | 0–100 skor + öneriler | O | skor HER ZAMAN hesap seviyesi; "bu kampanyanın skoru" denmez |
| `ads_insights_advertiser_context` | işletme bağlamı + huni özeti, doğru hedefi seçmeye yardım | O | |
| `ads_insights_anomaly_signal` | sapma/sıçrama uyarıları | O | gözlem, kesin sebep değil |
| `ads_insights_auction_ranking_benchmarks` | açık artırmada güçlü reklamlar, teklif/kalite etkenleri | O | yüksek örtüşmede ad set birleştirme önerir |
| `ads_insights_industry_benchmark` | benzer reklamverenlerle kıyas | O | `cas_segment`, `optimization_goal_override`, `sub_vertical` (çıkarılmaz/çevrilmez) |
| `ads_insights_performance_trend` | CPC, CPM, CPR, ROAS, CTR, CVR zaman serisi | O | tarih ALMAZ (tüm geçmiş); `analysis_level` `AD/ADSET` |

Bu dört "insights" aracının Marketing API'de belgelenmiş karşılığı **bu grubun sayfalarında yok**; Advetics bunları kendi verisinden üretmek zorunda ya da MCP'yi çağırmak zorunda.

**H. Sinyaller ve veri setleri**

| Araç | Ne yapar | Tür |
|---|---|---|
| `ads_get_datasets` | işletme/hesaptaki pikseller ve uygulamalar | O |
| `ads_get_dataset_details` | yapılandırma, CAPI kurulumu | O |
| `ads_get_dataset_stats` | olay hacmi (≤28 gün), cihaz/kaynak kırılımı | O |
| `ads_get_dataset_quality` | EMQ, eşleşme anahtarı kapsamı, tazelik | O |
| `ads_pixel_event_read` / `_create` (pasif başlar) / `_update` (aç/kapat) / `_delete` | Event Setup Tool olay kuralları | O/C/C/C |
| `ads_pixel_parameter_read` / `_create` / `_update` / `_delete` | olayın çıkardığı parametreler (`value`, `currency`, `content_ids`) | O/C/C/C |
| `ads_get_customconversions` | özel dönüşümler | O |

**I. Yardım ve sorun giderme**

| Araç | Ne yapar | Tür | Not [canlı şema] |
|---|---|---|---|
| `ads_get_errors` | teslimatı DURDURAN hatalar | O | performans, devre dışı hesap ve reklam reddi KAPSAMDA DEĞİL; katalog hatasında katalog araçlarına yönlendirir |
| `ads_get_help_article` | Business Help Center araması | O | hesaba özel veri, performans tavsiyesi, fatura için değil |

**J. A/B testleri ve dönüşüm artışı (lift)**

| Araç | Tür | Not [canlı şema] |
|---|---|---|
| `ads_experiment_list_tests` | O | |
| `ads_experiment_check_eligibility` | O | oluşturmadan önce |
| `ads_experiment_abtest_create_test` | C | hücre başına TAM bir nesne kimliği, hepsi aynı seviye; tarih `YYYY-MM-DD` (en erken yarın, hesap saat diliminde gece yarısı); varsayılan 7 gün; `primary_kpi` varsayılanı `cost_per_result`, kısaltma yasak (`cost_per_action_type:link_click`); kampanya ömür boyu bütçeliyse `budget_percentage` varsayılanı %20 |
| `ads_experiment_abtest_get_test` | O | |
| `ads_experiment_abtest_update_test` | C | düzenle/iptal |
| `ads_experiment_lift_create_test` | C | |
| `ads_experiment_lift_get_test` | O | |

**K. Aktivite günlüğü**

| Araç | Tür | Not [canlı şema] |
|---|---|---|
| `ads_account_get_activity_logs` | O | Ads Manager geçmiş sayfasının aynası; **Meta sistemi tarafından yapılan değişiklikler de dahil**. `object_id` (alt nesneleri de kapsar), `event_category` (`account, ad, ad_set, audience, bid, budget, campaign, date, status, targeting, ad_keywords`), `user_id`, `start_time` (varsayılan 3 ay önce), `limit` 1–1000 (varsayılan 100); `extra_data` eski/yeni değer |

**L. Katalog (belge ile canlı liste AYRIŞIYOR)**

- Belgede: `ads_catalog_create`, `_update_catalog`, `_get_catalogs`, `_get_details`, `_get_diagnostics`, `_get_dynamic_ads_health`, `_get_data_sources`, `_get_product_details`, `_product_create`, `_update_product`, `_delete_product`, `_get_product_product_sets`, `_search_product`, `_create_product_set`, `_update_product_set`, `_get_product_sets`, `_get_product_set_details`, `_get_product_set_products`, `_product_set_delete`, `_create_product_feed`, `_update_product_feed`, `_get_product_feed_details`, `_create_product_feed_upload_session`, `_get_product_feed_upload_sessions`, `_product_feed_delete`, `_create_feed_rule`, `_get_feed_rules`, `_product_feed_delete_rule`, `_event_source_get`, `_event_source_get_catalogs`, `_event_source_get_health` (28 günlük eşleşme), `_event_source_get_recommendations`, `_event_source_connect`, `_event_source_disconnect`.
- Canlıda belgede OLMAYAN: `ads_catalog_list_catalogs`, `_list_products`, `_list_product_sets`, `_list_product_feeds`, `_get_businesses`, `_get_suggested_filter`, `_list_dpa_eligible_catalogs`, `_list_partner_integrations`.
- Belgede olup canlıda GÖRÜLMEYEN: `_get_catalogs`, `_get_details`, `_get_product_details`, `_get_product_product_sets`, `_search_product`, `_get_product_sets`, `_get_product_set_details`, `_get_product_set_products`, `_get_product_feed_details`.
- Sonuç: araç adları belgeyle canlı arasında kayıyor. Advetics MCP'yi proxy'leyecekse araç adına sabit bağımlılık kurmamalı; `tools/list` çıktısını okumalı.
- Not: feed silmek, feed'in getirdiği ürünleri de asenkron siliyor (başka kaynaktan da gelen ürünler kalıyor).

#### 2.3 `ads_create_ad_set` kuralları — Meta'nın kendi "eşleme katmanı" [canlı şema]

Bu, Advetics'in `goal-mapping.ts`'inin Meta tarafından yazılmış karşılığı:

- **Amaç → geçerli `optimization_goal` (ilk değer varsayılan):**
  - `OUTCOME_AWARENESS` → `REACH`, `IMPRESSIONS`, `AD_RECALL_LIFT`, `THRUPLAY`, `TWO_SECOND_CONTINUOUS_VIDEO_VIEWS`
  - `OUTCOME_TRAFFIC` → `LINK_CLICKS`, `LANDING_PAGE_VIEWS`, `OFFSITE_CONVERSIONS`, `IMPRESSIONS`, `POST_ENGAGEMENT`, `REACH`, `CONVERSATIONS`, `THRUPLAY`, `VISIT_INSTAGRAM_PROFILE`, `PROFILE_VISIT`, `QUALITY_CALL`, `REMINDERS_SET`
  - `OUTCOME_ENGAGEMENT` → `THRUPLAY`, `POST_ENGAGEMENT`, `EVENT_RESPONSES`, `PAGE_LIKES`, `IMPRESSIONS`, `REACH`, `TWO_SECOND_CONTINUOUS_VIDEO_VIEWS`, `LINK_CLICKS`, `CONVERSATIONS`, `OFFSITE_CONVERSIONS`, `LANDING_PAGE_VIEWS`, `QUALITY_CALL`
  - `OUTCOME_LEADS` → `OFFSITE_CONVERSIONS`, `LEAD_GENERATION`, `QUALITY_LEAD`, `LANDING_PAGE_VIEWS`, `LINK_CLICKS`, `IMPRESSIONS`, `REACH`, `VALUE`, `CONVERSATIONS` (yalnızca WhatsApp), `QUALITY_CALL`
  - `OUTCOME_SALES` → `OFFSITE_CONVERSIONS`, `VALUE`, `LANDING_PAGE_VIEWS`, `IMPRESSIONS`, `POST_ENGAGEMENT`, `REACH`, `LINK_CLICKS`, `CONVERSATIONS`
  - `OUTCOME_APP_PROMOTION` → `APP_INSTALLS`, `OFFSITE_CONVERSIONS`, `IMPRESSIONS`, `LINK_CLICKS`, `REACH`, `VALUE`
  - Hesaba göre açılanlar: `ENGAGED_PAGE_VIEWS`, `MEANINGFUL_CALL_ATTEMPT`, `MESSAGING_PURCHASE_CONVERSION`, `IN_APP_VALUE`. `VIDEO_VIEWS` her amaçta kalktı → `THRUPLAY`.
- **Listede olmayan hedef SESSİZCE önerilen varsayılanla değiştiriliyor** (sunucu tarafı). Listedeki hedef de `destination_type`/`promoted_object`/`billing_event` eşleşmesi yanlışsa reddediliyor.
- **`destination_type` eşleşmeleri:** `CONVERSATIONS` / `MESSAGING_PURCHASE_CONVERSION` / `MEANINGFUL_CALL_ATTEMPT` → `MESSENGER`/`WHATSAPP`/`INSTAGRAM_DIRECT` (LEADS altında `CONVERSATIONS` yalnızca `WHATSAPP`). ENGAGEMENT + promoted_object: `POST_ENGAGEMENT` → `ON_POST`, `PAGE_LIKES` → `ON_PAGE`, `THRUPLAY`/2 sn video → `ON_VIDEO`; hedef verilmezse "Performance goal isn't available". `VISIT_INSTAGRAM_PROFILE` → `INSTAGRAM_PROFILE`; `PROFILE_VISIT` → `FACEBOOK_PAGE` veya `INSTAGRAM_PROFILE`; `PROFILE_AND_PAGE_ENGAGEMENT` → üçü. LPV/dönüşüm/değer → `WEBSITE`. Tam enum: `WEBSITE, APP, MESSENGER, INSTAGRAM_DIRECT, WHATSAPP, PHONE_CALL, ON_AD, ON_EVENT, ON_PAGE, ON_POST, ON_VIDEO, INSTAGRAM_PROFILE, FACEBOOK_PAGE, INSTAGRAM_PROFILE_AND_FACEBOOK_PAGE, LEAD_FORM_MESSENGER`.
- **`promoted_object`:** `OFFSITE_CONVERSIONS`, `VALUE`, `LEAD_GENERATION`, `QUALITY_LEAD`, `APP_INSTALLS`, `IN_APP_VALUE` için ZORUNLU; `OUTCOME_SALES` + `WEBSITE` için `pixel_id` olmadan "Performance goal isn't available".
- **Mesajlaşma hedefi:** `promoted_object.page_id` zorunlu; **verilmezse hesabın birincil tanıtılan sayfası KENDİLİĞİNDEN seçiliyor.**
- **Lead:** sayfanın `leadgen_tos_accepted=true` olması gerekiyor; değilse kullanıcı `facebook.com/legal/leadgen/tos`'a yönlendirilmeli.
- **`billing_event`:** `IMPRESSIONS` her hedefte geçerli; diğerleri hedefe özgü.
- **Teklif:** `bid_strategy` ABO'da; varsayılan `LOWEST_COST_WITHOUT_CAP`. `LOWEST_COST_WITH_BID_CAP` ve `COST_CAP` → `bid_amount` zorunlu; `LOWEST_COST_WITH_MIN_ROAS` → `bid_constraints.roas_average_floor` (200 = 2,00x). CBO altında ad set teklifi "Must Use Campaign Bid Strategy" ile reddediliyor.
- **Bütçe:** CBO ebeveyn altında ad set bütçesi ÖN DOĞRULAMAYLA reddediliyor. Ne ad set'te ne kampanyada bütçe yoksa araç "CBO mu ABO mu" diye soruyor. `lifetime_budget` → `end_time` zorunlu.
- **Hedefleme:** A+A varsayılan açık → yaş öneri; sert yaş için `advantage_audience = 0`. İlgi alanı kimliği UYDURULMAZ (13–16 haneli gerçek kimlik; "000"/"123" reddedilir); bilinmiyorsa yalnızca `geo_locations`. Yerleşim: hiçbir alan gönderilmezse Advantage+ yerleşim; kısıt `targeting.publisher_platforms` + `*_positions` ile; "yerleşim seçildi" denmesi için alanın GÖNDERİLMİŞ olması gerekiyor.
- **Özel kategori:** HOUSING/EMPLOYMENT/FINANCIAL'da şehir/adres yarıçapı ABD-Kanada'da ≥15 mil (25 km), diğer yerlerde ≥10 mil (17 km); ABD/Kanada/AB'de posta kodu, ilçe, mahalle, metro alanı vb. yasak.
- **`attribution_spec`:** kullanıcı istemedikçe GÖNDERME; varsayılan 7 gün tıklama + 1 gün görüntüleme. `is_incremental_attribution_enabled` ile birlikte verilmez.
- DSA: `dsa_beneficiary`, `dsa_payor`. Diğer onlarca isteğe bağlı alan (frekans, gün bölme, `placement_soft_opt_out`, `budget_schedule_specs`…) şemada var.

#### 2.4 MCP sunucusunun davranış sözleşmesi [canlı şema]

- **Her çağrıda kimlik ve niyet:** `client_conversation_id` (20 karakter rastgele, konuşma boyunca sabit), `client_model` (bildirilmişse), `advertiser_request` (reklamverenin isteği, KENDİ kelimeleriyle; teknik terime çevrilmeden, onay cümlesi değil asıl istek). Meta, her aracın neden çağrıldığını izlenebilir kılıyor.
- **`next_actions` tamamlama sözleşmesi:** `ads_get_ad_entities` yanıtında `next_actions.actions[]` varsa yanıt EKSİK sayılıyor; her eylem `step`, `strength` (`required`), `read_only`, `requires_user_confirmation`, `tool`, `suggested_args` taşıyor. Model `required` + `read_only` + onay gerektirmeyenleri sırayla çağırmak zorunda; onay gerektirenleri ASLA çağırmayıp kullanıcıya somut öneri olarak sunuyor.
- **Sonucu geri oku:** kampanya oluşturduktan sonra `ads_get_ad_entities` ile değişen alanları + `effective_status` okuyup kullanıcıya raporla.
- **Hata dönüşü:** `error_category=VALIDATION` gibi sınıflı hatalar; taslak yayınında hatalı nesneler listeleniyor ve "hiçbir şey yayınlanmadı" deniyor.
- **Arayüz:** `hide_ui` (çok nesne oluştururken widget kalabalığını önlemek), önizleme kartları, `scorecard` (kart gösterildiyse metinle tekrarlama).
- **Taslak modu:** "Draft mode is enabled for you" — `ads_create_ad` canlı reklam açmıyor, Ads Manager taslağına yazıp `status=DRAFT` ve ayrılmış `ad_id` dönüyor; hatalar `active_errors`'da; yayın `ads_activate_entity` ile kampanya üzerinden. Taslağın kimin için ve nasıl açıldığı (hesap ayarı mı, uygulama mı) **belgede yok**.

#### 2.5 Ads CLI — komut referansı

- Biçim: `meta [global] ads <kaynak> <eylem> [seçenek]`; global: `--output table|json|plain`, `--no-color`, `--no-input`, `--debug`.
- Çıkış kodları: `0` başarı, `1` genel, `2` kullanım/argüman, `3` kimlik doğrulama, `4` API hatası, `5` kaynak yok.
- Varsayılan durum her oluşturmada `PAUSED`; yayın için kampanya, ad set, reklam ayrı ayrı `--status ACTIVE`.
- Para birimleri "cent" (alt birim).

| Kaynak | Komutlar | Önemli seçenek |
|---|---|---|
| `adaccount` | `list` (varsayılan 25), `current` | sütunlar `id, name, account_status, currency, timezone_name` |
| `page` | `list` (25) | |
| `campaign` | `list` (10), `create`, `get`, `update`, `delete` | create: `--name`*, `--objective`* (6 ODAX), `--daily-budget`, `--lifetime-budget`, `--status` (varsayılan PAUSED). update: `--status ACTIVE/PAUSED/ARCHIVED`. **delete alt ad set ve reklamları da siler** |
| `adset` | `list [CAMPAIGN_ID]` (10), `create <CAMPAIGN_ID>`, `get`, `update`, `delete` | create: `--name`*, `--optimization-goal`* (13 değer), `--billing-event`* (`APP_INSTALLS, CLICKS, IMPRESSIONS, LINK_CLICKS, PAGE_LIKES, POST_ENGAGEMENT, THRUPLAY`), `--daily-budget` (CBO'da verme), `--lifetime-budget` (`--end-time` şart), `--bid-amount`, `--start-time`, `--end-time`, `--targeting-countries`, `--pixel-id`, `--custom-event-type` (varsayılan `PURCHASE`; 18 değer) |
| `ad` | `list [ADSET_ID]`, `create <ADSET_ID>`, `get`, `update`, `delete` | create: `--name`*, `--creative-id`*, `--pixel-id` XOR `--tracking-specs`. **update `--creative-id` kabul ediyor** |
| `creative` | `list`, `create`, `get`, `update`, `delete` | `--page-id`* zorunlu; biçim: `--video` → video, `--link-url` → link, ikisi de yok → sayfa fotoğraf gönderisi. CTA: `APPLY_NOW, BOOK_TRAVEL, BUY_NOW, CONTACT_US, DOWNLOAD, GET_OFFER, GET_QUOTE, LEARN_MORE, NO_BUTTON, OPEN_LINK, SHOP_NOW, SIGN_UP, SUBSCRIBE, WATCH_MORE`. DCO: çoğul bayraklar; en çok 10 görsel, 10 video, 5 başlık, 5 gövde, 5 açıklama, 5 CTA; `--link-url` + en az bir medya şart. `--instagram-actor-id` (API'de v22'de kalkmış alanın adı). Kullanımdaki kreatif silinemez; bazı alanlar oluşturulduktan sonra değişmez |
| `dataset` | `list`, `get`, `create`, `connect`, `disconnect`, `assign-user` | create öncesi Business Tools şartları kabul edilmeli; oluşturan kullanıcıya otomatik `ADVERTISE, ANALYZE, EDIT`. `--tasks` ∈ `ADVERTISE, ANALYZE, EDIT, UPLOAD` |
| `catalog` | `list`, `get`, `create`, `update`, `delete` | `--vertical` (varsayılan `commerce`; 12 değer). Aktif feed/reklamlı katalog silinemez |
| `insights` | `get` | `--date-preset` (varsayılan `last_30d`), `--since/--until` (birlikte), `--time-increment` (`all_days/daily/weekly/monthly`), `--breakdown` (tekrarlanabilir), `--fields` (varsayılan `spend, impressions, clicks, ctr, cpc, reach`), `--campaign-id/--adset-id/--ad-id`, `--sort metrik_ascending|descending`, `--limit` (50) |

---

## API çağrıları

### Kısım 1 — Marketing API

Hepsi `https://graph.facebook.com/v25.0/` altında.

**Temel kurulum (amaç ODAX, her şey önce `PAUSED`):**

```
POST act_{id}/campaigns
  name, objective=OUTCOME_TRAFFIC, status=PAUSED, special_ad_categories=[]
  (CBO ise) daily_budget | lifetime_budget, bid_strategy
POST act_{id}/adsets
  name, campaign_id, optimization_goal, billing_event=IMPRESSIONS,
  targeting={"geo_locations":{"countries":["TR"]}, "targeting_automation":{"advantage_audience":0}},
  (ABO ise) daily_budget + is_adset_budget_sharing_enabled, status=PAUSED
POST act_{id}/adcreatives
  name, object_story_spec={"page_id":"…","link_data":{"link":"…","message":"…","image_hash":"…","call_to_action":{"type":"LEARN_MORE"}}}
POST act_{id}/ads
  name, adset_id, creative={"creative_id":"…"}, status=PAUSED
```

- Belgedeki "zorunlu alan" tabloları eksik: kampanyada `special_ad_categories`, ad set'te `optimization_goal`/`billing_event` yazmıyor. Bu alanlar fiilen gerekli (bkz. 2.3 ve CLI zorunluları).
- Durum: `POST /{id}` `status=PAUSED|ACTIVE|ARCHIVED|DELETED` ya da `DELETE /{id}`.
- Güncelleme: `POST /{id}` + değişen alanlar.
- Kopya: `POST /{ad_id}/copies` (`adset_id`, `creative_parameters`, `rename_options`, `status_option`) → `copied_ad_id`.
- Önizleme: `GET /{ad_id}/previews?ad_format=MOBILE_FEED_STANDARD`.
- Insights: `GET /{obj}/insights?fields=…&time_range={…}&time_increment=1&level=ad`; async: `POST /{obj}/insights` → `GET /{report_run_id}`.
- Toplu okuma: `GET /?ids=a,b&fields=…`; batch: `POST /` `batch=[…]` (≤50).
- Async batch: `POST act_{id}/async_batch_requests` `adbatch=[…]` (≤1000).
- Öneriler: `GET act_{id}/recommendations`, `POST act_{id}/recommendations` (`recommendation_signature`, `extra_data`), `GET act_{id}/opportunity_score_history`.
- Webhook: `POST /{app_id}/subscriptions` (uygulama token'ı) + `POST act_{id}/subscribed_apps` (hesap admin token'ı); eşik: `POST/GET/PATCH/DELETE act_{id}/subscriptions[/{sub_id}]` (JSON gövde, `Authorization: Bearer`).
- Etiket: `POST /{ad_id}/adlabels` (`adlabels`, `execution_options=["validate_only"]`).
- Lead: `GET /{ad_id}/leads` (sayfa yetkisi).
- Etkinlik hızı kontrolü: yanıt başlıkları `X-Ad-Account-Usage`, `X-Business-Use-Case`, `X-FB-Ads-Insights-Throttle`.

### Kısım 2 — Ads MCP / CLI

- MCP JSON-RPC: `POST https://mcp.facebook.com/ads` gövde `{"jsonrpc":"2.0","method":"tools/list","id":1}`, başlık `Authorization: Bearer <token>`. Araç çağrısı standart MCP `tools/call`.
- Tipik MCP kurulumu (Meta'nın kendi sırası): `ads_get_ad_accounts` → `ads_get_ad_account_pages` (ve `leadgen_tos_accepted`) → `ads_create_campaign` (PAUSED; yanıttaki `valid_optimization_goals`) → `ads_create_ad_set` (PAUSED) → `ads_creative_upload_media` → `ads_create_creative` → `ads_create_ad` (PAUSED / taslak) → `ads_get_ad_preview` → **kullanıcı onayı** → `ads_activate_entity` (kampanya → ad set → reklam ya da taslakta `object_ids` toplu).
- IG boost: `ads_get_ig_accounts` → `ads_get_ig_media` → `ads_boost_ig_post confirmed=false` (plan) → kullanıcı onayı → `confirmed=true` (PAUSED) → `ads_activate_entity`.
- CLI uçtan uca: `meta ads adaccount list` → `page list` → `campaign create --name … --objective OUTCOME_TRAFFIC --daily-budget 5000` → `adset create <C> --optimization-goal LINK_CLICKS --billing-event IMPRESSIONS --targeting-countries TR` → `creative create --page-id … --image ./x.jpg --link-url … --call-to-action SHOP_NOW` → `ad create <AS> --creative-id …` → üç ayrı `update --status ACTIVE`.

---

## Tuzaklar ve sessiz hata riskleri

### Kısım 1 — Marketing API

1. **[SESSİZ] Atıf parametreleri yok sayılıyor (2025-06-10'dan beri).** İstek hata vermiyor, yanıt Ads Manager ayarını kullanıyor. İki müşterinin ad set'leri farklı `attribution_spec` ile kurulmuşsa CPA/ROAS karşılaştırılamaz ve kodda hiçbir iz yok. Koruma artık sorgu tarafında değil, kurulum tarafında: Advetics'in oluşturduğu her ad set'e `attribution_spec` AÇIKÇA yazılmalı ve rapor satırına `attribution_setting` alanı da çekilip saklanmalı.
2. **[SESSİZ] `7d_view` / `28d_view` 2026-01-12'den beri boş döner.** Hata değil, veri yok. Bu pencereyi isteyen bir rapor "sıfır dönüşüm" gösterir.
3. **[SESSİZ GENİŞLEME] Advantage+ Audience varsayılan açık (v23).** Yaş ve cinsiyet öneriye dönüşüyor; kullanıcı "25–45" dedi, reklam 18 yaşa da gidebilir. Hata yok.
4. **[SESSİZ GENİŞLEME] "Seçilen şehir/bölgeye ilgi duyanlar" (v22).** Konum hedeflemesi ilgiyle genişletilebiliyor; hangi alanla kapatıldığı bu grupta yazmıyor (**belgede belirsiz**; hedefleme bölümünde aranmalı). Canlı bilgi #2'deki birleşim tuzağının kardeşi.
5. **[SESSİZ] Günlük bütçe %75 esnek (v24).** "Günlük 1.000 TL" dedi, bir gün 1.750 TL harcandı. Panelde ve AI cevabında söylenmezse müşteri bunu hata sanar; kural motoru da yanlış tetiklenir.
6. **[SESSİZ] Listede olmayan optimizasyon hedefi varsayılanla değiştiriliyor** ([canlı şema], MCP sunucusu tarafında). Doğrudan Marketing API'de aynı davranış olup olmadığı **belgede belirsiz**; Advetics yanlış hedef gönderip "oluştu" demekle yetinmemeli, oluşturduktan sonra `optimization_goal`'ü geri okumalı.
7. **[SESSİZ] Silinmiş/arşivlenmiş alt nesneler toplamları bozuyor.** `/{parent}/insights` silinmişleri de toplar; `level=ad` listesi toplamaz. Reklam tablosunun toplamı kampanya kartını tutmaz. Arşivlenmiş nesneler edge sorgusunda filtresiz dönmez: Advetics'in delta yapı taraması arşivlenen kampanyayı "yok olmuş" sanabilir.
8. **[SESSİZ] Senkron breakdown'lar BOŞ dönebiliyor (2026-08-06).** `impression_device`, `hourly_stats_aggregated_by_audience_time_zone`, `frequency_value` opt-in istemeyen hesapta hatasız boş. "Veri yok" ile "erişim yok" aynı ekranda görünür; `emptyReason` deseni şart.
9. **[SESSİZ] 13 aydan eski + breakdown'lı sorguda `reach` dönmüyor; tekil sayımlar ve saatlik breakdown 13 ay, `frequency_value` 6 ay.** Eski dönem raporu eksik sütunla gelir.
10. **[SESSİZ] Otomatik sürüm yükseltme.** Düşmüş sürüm çağrısı başka sürümün semantiğiyle cevaplanabilir; tek iz `X-Ad-Api-Version-Warning` başlığı. Bu başlık loglanmalı.
11. **[SESSİZ] `?ids=` belge tarafından öneriliyor** ama tek kötü kimliğin isteğin tamamını düşürdüğünden bahsetmiyor (canlı bilgi #5 bunu buldu). Belge eksik, canlı bilgi geçerli.
12. **[SESSİZ] Kopyada `degrees_of_freedom_spec` TAMAMEN eziliyor.** Kaynağın `OPT_OUT`'ları yeni spec'te yazılmamışsa kaybolur ve Meta'nın o özellik için varsayılanı devreye girer.
13. **Webhook `effective_status` yeni değeri taşımıyor** ve abone olunan ad ile gelen `field` adı farklı (`field_changed`). `field === 'effective_status'` diye süzen bir işleyici HİÇBİR bildirimi işlemez.
14. **Webhook ikinci adımı (`subscribed_apps`) unutulursa olay gelmez** ve uygulama aboneliği "başarılı" görünür. Her yeni atanan hesap için çağrı yapılmalı ve sonuç doğrulanmalı.
15. **Hata metniyle karar verilmemeli.** Belge açık: açıklama değişebilir. Bu, Advetics'in "reduce the amount of data" mesajına bakan sayfa küçültme mantığıyla gerilim yaratıyor (canlı bilgi #7: kod `1` olduğu için ayırt edici tek şey mesaj). Mesaj eşleşmesi kalabilir ama mesaj değişince sessizce çalışmayı bırakacağını bilen bir test (ör. eşleşme hiç tutmazsa log) eklenmeli.
16. **Belgedeki "zorunlu parametre" tabloları ve örnekler eski** (legacy amaçlar, eksik zorunlu alanlar). Örnekten kod kopyalamak, çalışmayan kurulum üretir.
17. **Belge aynı kodu iki anlamda kullanıyor** (`2238055`: CBO bütçesi düşük / IG alanı çakışması). Kodla eşlerken subcode ve `blame_field_specs` birlikte okunmalı.
18. **Hata oranı Full erişimi tehdit eder.** Son 500 çağrıda %15 hata eşiği var; düşen bir otomasyon döngüsü (ör. geçersiz token'la saatlik deneme) katmanı riske atabilir. Ne zaman düşürüldüğü **belgede belirsiz**.
19. **Bütçe değişikliği saatte 4.** AI'ın ya da kural motorunun ardışık ayarları beşincide bir saat kilitlenir; kullanıcı "bütçeyi düşür" dediğinde yapılamaz. Değişiklikler birleştirilmeli ve sayaç tutulmalı.
20. **`IN_PROCESS` / `IN-PROCESS` iki yazım.** Durum karşılaştırması tek yazıma göre yapılırsa kreatif "bilinmeyen durumda" kalır.
21. **Önizleme iframe'i 24 saatte ölür;** saklanırsa ertesi gün boş kutu.
22. **Silinen reklam 28 gün veri toplamaya devam eder;** silme sonrası raporu "kapandı" saymak yanlış.

### Kısım 2 — AI bağlayıcıları

1. **[SESSİZ] IG boost varsayılan hedeflemesi ABD.** Türk müşteri için `targeting` verilmezse reklam ABD'ye gider ve para harcar; araç bunu hata saymaz. Plan adımı tam da bu yüzden var, ama planı okumayan bir otomasyon kaçırır.
2. **[SESSİZ] Mesajlaşma hedefinde `page_id` otomatik seçiliyor** (hesabın birincil sayfası). Çok sayfalı ajans hesabında yanlış sayfanın WhatsApp hattına düşen reklam; canlı bilgi #6'nın "başka hatta düşme" riskinin yeni bir kapısı.
3. **[SESSİZ] `instagram_user_id` yoksa Instagram'da yayın yok.** Kreatif oluşur, reklam yayınlanır, Instagram yerleşimi boş kalır.
4. **[SESSİZ] `description` Facebook akışında tek görsel/videoda gösterilmiyor, Instagram'da açıklama satırı yok; `display_link` Facebook mobil akıştan kalkıyor.** Araç uyarı döndürüyor; uyarıyı okumayan sistem "yazdık" sanır.
5. **[SESSİZ] Yeni inline kreatiflerde `contextual_multi_ads` varsayılanı `OPT_OUT`;** mevcut kreatif/gönderi yeniden kullanılınca değiştirilemiyor.
6. **`PUBLISHING` ≠ yayında.** Yayıncı kendi kontrollerinde reddedebilir ve hiçbir araç bunu bildirmez; birkaç dakika sonra geri okumak gerekir. "200 döndü doğrulama değil" kuralının Meta tarafından da kabul edilmiş hali.
7. **Üst nesneyi açmak alttakini açmaz;** alt nesneyi açmak üst kapalıyken teslim etmez. "Aktifleştirdim" demek için üç seviyenin de okunması gerekir.
8. **Kitle silmek ad set'leri OTOMATİK DURAKLATIR.** Kullanıcıya söylenmeden yapılırsa çalışan kampanyalar sessizce durur.
9. **MCP ile Marketing API kreatif değişiminde ayrışıyor:** API ve CLI `POST /{ad_id}` ile kreatif değişimine izin veriyor (webhook örneklerinde açıkça gösteriliyor), MCP aracı ise bunu yasaklayıp "yeni reklam + eskisini duraklat" diyor. MCP'nin seçimi, öğrenme geçmişini ve incelemeyi açıkça yöneten daha güvenli yol.
10. **CLI hâlâ `--instagram-actor-id` bayrağını kullanıyor;** API'de bu alan v22'de kalktı. Bayrağın hangi alana yazdığı **belgede belirsiz**.
11. **CLI `campaign delete` geri dönüşsüz ve basamaklı** (ad set + reklam), `--force --no-input` ile sorusuz. Ajans hesabında otomasyona verilmemeli.
12. **Belge ile canlı MCP araç adları ayrışıyor** (katalog). Araç adı sabit kodlanırsa bir gün çağrı "bilinmeyen araç" ile düşer.
13. **Bütçe birimi "cents".** Türk lirası için alt birimin kuruş olup olmadığı bu sayfalarda yazmıyor (**belgede belirsiz**; hesap para biriminin "offset" değeri ayrı bölümde aranmalı). Yanlış ölçek bütçeyi 100 kat büyütür ya da küçültür; API geçerli sayar.
14. **`time_increment` MCP'de DİZGE olmalı** (`"7"`), sayı reddediliyor; Marketing API'de tam sayı. İki arayüz arasında tip farkı.

---

## Advetics'in canlı bilgisiyle karşılaştırma

| # | Canlı bilgi | Bu gruptaki belge | Sonuç |
|---|---|---|---|
| 1 | `destination_type` yoksa boost reddediliyor (2446383), doğru değer `ON_POST` | Hata tablosunda `2446383` aynı metinle var. [canlı şema]: ENGAGEMENT altında `POST_ENGAGEMENT` → `ON_POST`, hedef yoksa "Performance goal isn't available". v20: `ON_POST` + `IMPRESSIONS` optimizasyonu yasak | **Uyuşuyor**, ek kısıt: boost'ta `IMPRESSIONS` optimizasyonu kullanılamaz |
| 2 | `geo_locations` kovaları birleşim | Bu grupta doğrudan yok. v22 "şehre ilgi duyanlar" genişlemesi ve v18 `location_types` varsayılanı ek genişleme kaynakları | **Belgede geçmiyor**; aynı yönde yeni bir sessiz genişleme bulundu |
| 3 | IG medyasının üç kimlik uzayı; `source_instagram_media_id` + `instagram_user_id` + `object_id` | v22: `instagram_actor_id` → `instagram_user_id`, `instagram_story_id` → `source_instagram_media_id`, `effective_instagram_story_id` → `effective_instagram_media_id`; ikisinin birlikte gönderilmesi hata (`2238055`/`2446149`). [canlı şema] `ig_media_id` = `ads_get_ig_media` sayısal `id`'si, kısa kod çözülmez | **Uyuşuyor ve güçleniyor**; `object_story_id` ile IG dönüşümü bu grupta ele alınmıyor |
| 4 | `image_url`/`thumbnail_url` imzalı ve ölüyor; kalıcı olan `permanent_url` | Bu grupta yalnızca önizleme iframe'inin 24 saat geçerli olduğu yazıyor. [canlı şema] `ads_get_ad_images` `permalink_url` ve `download_url` sunuyor | **Belgede geçmiyor**; `permalink_url` adayı canlıda denenebilir |
| 5 | `?ids=` tek kötü kimlikle tamamen düşüyor | Belge `?ids=`'i toplu okuma için öneriyor, bu davranıştan bahsetmiyor | **Belge eksik**; canlı bilgi geçerli |
| 6 | CTWA: ad set `WHATSAPP` + `promoted_object.page_id`, CTA `app_destination: WHATSAPP`, numara sorulmaz | [canlı şema] `WHATSAPP` hedefinde `page_id` zorunlu (verilmezse birincil sayfa OTOMATİK). Önizleme şemasında CTA değeri `app_destination` enum'unda `WHATSAPP` ve ayrıca `whatsapp_number` alanı VAR. `2446880` sayfaya bağlı numara koparsa | **Kısmen uyuşuyor**; `whatsapp_number` alanının varlığı numara verilebildiğini gösteriyor ama Advetics'in "sayfadan alınsın" kararı daha güvenli. Otomatik `page_id` yeni bir risk |
| 7 | `limit=500` → "reduce the amount of data", yarıla | Bu grupta yok; rate-limit sayfası async ve batch öneriyor. [canlı şema] `ads_get_ad_entities` `limit` ≤1000 | **Belgede geçmiyor**. Belge mesaja değil koda bakılmasını istiyor; çatışma Tuzak 15'te |
| 8 | Insights'ta `use_unified_attribution_setting` ve `action_report_time` açıkça gönderiliyor | **OCC 2025-03-10: 2025-06-10'dan beri iki parametre de YOK SAYILIYOR**, yanıt Ads Manager ayarını taklit ediyor. Ayrıca `7d_view`/`28d_view` 2026-01-12'de kalktı ve varsayılan pencere belgede çelişkili | **ÇELİŞİYOR.** Göndermek zararsız ama koruma sağlamıyor; `meta-attribution.spec.ts`'in kilitlediği davranış artık etkisiz. Koruma ad set kurulumuna (`attribution_spec`) taşınmalı |
| 9 | `age_max = 65` "65 ve üzeri" | Bu grupta doğrudan yok; ama v23 A+A varsayılanı yaşı ÖNERİYE çeviriyor | **Belgede geçmiyor**; yaş sınırının kendisi artık varsayılan olarak sert değil |
| 10 | `image_hash` hesap başına; `external_id` `act_` önekli | [canlı şema] araçlar `ad_account_id`'yi öneksiz sayısal istiyor (A/B test aracı örneği hariç `act_…`). `ads_get_ad_images` hesap kapsamlı | **Uyuşuyor**; önek her arayüzde farklı, normalize edilmeli |
| 11 | `adinterest` kısa terimle eşleşiyor; büyüklük dünya geneli | v24: ilgi alanları birleştirildi, eski seçenekli kampanyalar 2026-01-15'te durdu; arama birleşik seçeneği döndürüyor. `1487694` kalkmış kategori. [canlı şema] ilgi kimliği uydurulmaz | **Belgede doğrudan yok**; ilgi sözlüğü v24'te değişti, kayıtlı ön ayarlardaki eski kimlikler artık hata verebilir |
| 12 | Organik istatistik adları değişti | v20: IG kullanıcı insights'ında bazı zaman dilimleri kalktı; v22: Marketing API içindeki Instagram uçları kalktı, Instagram Platform'a taşınmalı | **Uyuşuyor yönde**; organik metrik adları bu grupta yok |

**Belgede bulunup Advetics'in canlı listesinde olmayan, ölçülmesi gerekenler:**
- Günlük bütçe esnekliği %75 (v24).
- ABO'da `is_adset_budget_sharing_enabled` zorunluluğu (v24) ve alan adının belirsizliği.
- Advantage+ Shopping/App kampanya oluşturma yasağı (v24/v25).
- Bütçe değişikliği saatte 4 kez.
- Webhook `effective_status` → `field_changed`.

---

## Yapay zekâ ile yönetim için çıkarımlar

### Meta'nın araç tasarımından alınacaklar

**1. Üç katman zaten Meta'nın modeli.** Meta'nın MCP'si yazmayı "oluştur = PAUSED", "yayınla = ayrı araç + açık onay", "boost = plan/onay" olarak ayırıyor. Advetics karşılığı:

| Advetics katmanı | İçerik | Meta karşılığı | Onay |
|---|---|---|---|
| **O — salt okuma** | hesap/sayfa/IG listesi, yapı + metrik (Advetics veritabanından, tazelik damgasıyla), alan sözlüğü, teslim hataları, aktivite günlüğü, öneriler, skor, önizleme, reklam kütüphanesi | `ads_get_*`, `ads_insights_*`, `ads_get_errors`, `ads_account_get_activity_logs`, `ads_get_field_context` | Yok |
| **T — taslak** | Advetics taslak ağacına kampanya/ad set/reklam/kreatif yazma, görsel yükleme (Advetics varlık deposuna), plan üretme, `validate_only` ile Meta'ya doğrulatma | `ads_create_*` (PAUSED), taslak modu, `ads_boost_ig_post confirmed=false` | Yok (para harcamaz); ama taslağın Meta'ya PAUSED yazılması bile yayına bir adım; Advetics'te taslak Meta'ya hiç gitmemeli |
| **C — onaylı canlı** | yayınlama, açma, bütçe/takvim/durum değişikliği, duraklatma, arşivleme, öneri uygulama, kitle silme/kullanıcı yükleme, A/B test oluşturma | `ads_activate_entity`, `ads_update_entity`, `ads_delete_custom_audience`, `ads_update_custom_audience_users`, `ads_experiment_*_create`, `POST /recommendations` | **Her biri ayrı onay**, onay ekranında somut fark |

**2. Onay bir sözleşme, bir düğme değil.** Meta'nın kuralları Advetics'e birebir alınabilir:
- Onaydan ÖNCE değişikliğin tam planı gösterilir (Meta: "tüm çözülmüş ayarlar, varsayılanlar dahil").
- Onay ilgili NESNEYE ve DEĞERE bağlanır. Meta'nın `advertiser_request` alanı, kısa bir "evet"i değil asıl isteği kaydettiriyor; Advetics de onay kaydına kullanıcının asıl cümlesini ve onaylanan diff'i yazmalı (denetim izi).
- `ignore_validation_errors` gibi "hataya rağmen yayınla" seçenekleri yalnızca kullanıcı hataları GÖRDÜYSE.
- Kitle silme gibi yan etkili işlemlerde yan etkiler (otomatik duraklatılacak ad set'ler) onay ekranında listelenir.

**3. Okuma araçlarında "tamamlama sözleşmesi" (`next_actions`).** Meta, aracın yanıtına "şunları da çağırmadan cevap verme" listesi koyuyor ve her adımı `read_only` / `requires_user_confirmation` ile etiketliyor. Advetics araçları da yanıtlarında önerilen sonraki adımları aynı iki bayrakla döndürebilir; model okuma adımlarını kendisi koşar, yazma adımlarını öneri olarak sunar. Bu, "AI bir şey yapmadan önce sorsun" kuralını prompt'a değil veriye koyar.

**4. Sonucu geri okuma zorunluluğu.** Meta: oluşturduktan sonra `effective_status` + değişen alanları oku ve raporla. Advetics'in "200 döndü doğrulama değil" kuralının aynısı. Her C aracı kendi içinde geri okuma yapmalı ve kullanıcıya platformun döndürdüğü değeri (Advetics'in gönderdiğini değil) göstermeli; `PUBLISHING`/`IN_PROCESS` "teslim edildi" diye raporlanmalı.

**5. Alan sözlüğü aracı.** `ads_get_field_context` gibi bir araç (alan adı, takma ad, enum değerleri, hangi seviyede geçerli, filtrelenebilir mi) modelin alan adı uydurmasını engelliyor. Advetics'te bu, `@advetics/shared`'daki Zod şemalarından üretilmeli; tek kaynak.

**6. Kimlikler yalnızca listeleme araçlarından gelir.** Meta: `page_id` → sayfa listesinden; `ig_media_id` → medya listesinin `id`'si (kısa kod çözülmez); ilgi kimliği → arama sonucundan; `creative_id` → kreatif listesinden. Advetics araç şeması kimlik parametrelerini serbest dizge değil, o konuşmada daha önce dönmüş bir kimlik olarak doğrulamalı.

**7. Hata dönüşü modelin işleyebileceği biçimde.** Meta `error_category` (VALIDATION…), taslak hatalarında nesne bazında liste ve "hiçbir şey yayınlanmadı" netliği veriyor. Advetics araçları `PlatformApiError`'ı modele kod + subcode + `error_user_title` + `error_user_msg` + `blame_field_specs` + `is_transient` + "tekrar denenebilir mi" bayrağıyla döndürmeli. "Beklenmeyen bir hata oluştu" modele de, kullanıcıya da asla gitmemeli.

### KAPALI sözlükten seçilmesi gerekenler

- `objective` (6 ODAX değer).
- `optimization_goal` (amaca göre 2.3'teki liste; hesaba bağlı olanlar ayrı işaretli).
- `destination_type` + eşleşme tablosu.
- `billing_event` (Advetics için sabit `IMPRESSIONS`).
- `bid_strategy` (4 değer).
- `call_to_action_type` (kapalı enum; Meta: "uydurma, yeniden biçimlendirme").
- `special_ad_categories` (`CREDIT` yok).
- `status` (ve hangi araçta hangisinin yasak olduğu).
- `date_preset`, `breakdowns` (opt-in gerektirenler işaretli), `action_attribution_windows` (`7d_view`/`28d_view` HARİÇ).
- Yerleşim adları (kalkanlar: `messenger_home`, IG `shop`, Facebook video feeds).
- `recommendation_type` ve hangilerinin uygulanabileceği.
- Webhook alan adları.

### AI'ın ASLA tahmin etmemesi gerekenler

- **Bütçe tutarı ve sıklığı.** Meta'nın kuralı: aylık rakam ne günlük ne toplamdır; belirsizse sor ve bekle, varsayılan değerle "onaya sunmak" da yasak.
- **Para birimi ölçeği** (alt birim çarpanı; TRY için bu grupta belirsiz). Araç tutarı insan biriminde alıp çevirmeyi kendisi yapmalı.
- **Hedef ülke/konum** (Meta'nın boost varsayılanı ABD; Advetics'te konum yoksa araç reddetmeli).
- İlgi alanı, kitle, piksel, sayfa, IG hesabı kimlikleri.
- Özel reklam kategorisi (sor; yanlış beyan politika riski).
- `self_ai_disclosure` (sorumluluk reklamverende; sonradan değiştirilemez).
- Atıf penceresi (sabit Advetics standardı, AI değiştirmez).
- Advantage+ özelliklerinin açılması (A+ creative, A+ audience, öneri uygulama).
- Yayın zamanı ("hemen" varsayılmaz).

### Onay gerektiren işlemler (C katmanı)

Yayınla/aç, bütçe değiştir (saatlik 4 sınırını araç kendisi saymalı ve aşacaksa reddetmeli), teklif değiştir, takvim değiştir, hedefleme/kreatif değiştir (**ayrıca: inceleme tetikler uyarısı**), duraklat, arşivle, sil (Advetics'te sil yerine arşivle; kampanya silme AI'a hiç verilmemeli), öneri uygula (özellikle çoğaltan ve Advantage+ açan türler), kitle oluştur/sil/kullanıcı yükle (kişisel veri), A/B test kur, piksel olay kuralı oluştur/sil, webhook/abonelik kur.

### Meta'nın MCP'sini doğrudan kullanmak mı, kendi araçlarını yazmak mı?

- MCP kişisel OAuth (Facebook Login for Business) ya da kullanıcı token'ı istiyor ve hesap bazında `is_ads_mcp_enabled` bayrağı var. Advetics'in ajans havuzu tek kimlikle yüzlerce hesap görüyor; MCP'nin bu modelde nasıl davranacağı **belgede belirsiz**.
- MCP çağrıları Advetics'in RLS'inden, `sync_jobs`'undan, onay kaydından ve bütçe bekçisinden GEÇMEZ; Meta'da değişen bütçe Advetics kural motoruna gecikmeli yansır (bu risk proje hafızasında zaten kayıtlı).
- Öneri: araç katmanı Advetics servislerinde kalsın; Meta'nın MCP'si yalnızca Marketing API'de karşılığı bu grupta görülmeyen salt-okuma analizler (`ads_insights_anomaly_signal`, `_industry_benchmark`, `_auction_ranking_benchmarks`, `_advertiser_context`) için, açıkça "Meta'nın yorumu" etiketiyle ve O katmanında değerlendirilsin. Bu bir karar önerisi; canlıda ölçülmedi.

### Webhook'lar AI'ın gözü olabilir

`with_issues_ad_objects` ve `effective_status` bildirimleri, AI asistanının "reklamın reddedildi, sebebi şu (`review_feedback`), yeni kreatifle değiştirmemi ister misin?" diye proaktif önerisinin tetikleyicisi olabilir. Önerinin kendisi T katmanında hazırlanır, uygulama C katmanında onaylanır.

---

## Panel kurgusu için çıkarımlar

**Acemi kullanıcıya sorulacaklar (Meta'nın MCP'sinin de sorduğu çekirdek):**
- Ne istiyorsun? (amaç, iş dilinde: "siteme ziyaretçi", "WhatsApp'tan mesaj", "satış").
- Ne kadar, hangi sıklıkla? (günlük mü, toplam mı; tutar). Aylık söylenirse panel çevirmez, sorar.
- Ne zaman başlasın, ne zaman bitsin?
- Nerede? (konum; boş bırakılamaz).
- Hangi sayfa / Instagram hesabı adına? (listeden seçim).
- Görsel/video ve metin.
- (Gerektiğinde) Reklam yapay zekâ ile üretilmiş içerik içeriyor mu? (sorumluluk beyanı; varsayılan cevap yok).
- (Gerektiğinde) Konut/iş/finans/siyaset gibi özel kategoriye giriyor mu?

**Otomatik kararlaştırılacaklar (eşleme katmanı):**
- `objective`, `optimization_goal`, `destination_type`, `promoted_object` (2.3 tablosundan).
- `billing_event=IMPRESSIONS`, `bid_strategy=LOWEST_COST_WITHOUT_CAP`, CBO.
- `attribution_spec` (Advetics standardı, AÇIKÇA yazılır).
- `advantage_audience` (karar verilmeli ve açıkça gönderilmeli; acemi modda "yaş sınırı kesin olsun mu" sorusu ya da sabit bir Advetics kararı; varsayılana bırakmak yasak).
- Yerleşim (Advantage+ ise "otomatik yerleşim" diye panelde söylenir).
- `instagram_user_id` (IG hesabı seçiliyse daima gönderilir).
- Kreatif Advantage+ özellikleri için açık `OPT_OUT`/`OPT_IN` (yeni gelen `image_animation`, `video_filtering`, `video_uncrop` dahil).

**Yalnızca Gelişmiş modda:** teklif stratejisi ve tavanlar, ABO + bütçe paylaşımı, manuel yerleşim ve `placement_soft_opt_out`, frekans sınırı (yalnızca REACH/THRUPLAY), atıf penceresi değişikliği, Advantage+ Audience'ı açık bırakma, DCO / PAC / MMU, gün bölme, takip kodları (`tracking_specs`, `url_tags`).

**Panelde mutlaka söylenecekler (sessiz hataya karşı):**
- "Günlük bütçe bazı günler %75'e kadar aşılabilir; haftalık toplam 7 günlük bütçeyi geçmez."
- Kreatif/hedefleme düzenlemesinde: "Bu değişiklik reklamı yeniden incelemeye sokar."
- Bütçe düzenlemesinde: bu saatte kalan değişiklik hakkı.
- Platform hatası: `error_user_msg` ve `blame_field_specs` ile ilgili alanın yanında; kod ve subcode tooltip'te.
- Raporlarda: hangi atıf penceresinin geçerli olduğu (`attribution_setting`), silinmiş reklamların toplama dahil olduğu ama listede olmadığı, opt-in gerektiren breakdown'larda "erişim yok" ile "veri yok" ayrımı.
- Yayın sonrası: "Meta'ya iletildi" ile "yayında" ayrı durumlar; `IN_PROCESS` ve `PENDING_REVIEW` ayrı etiketler.

---

## Sayfa sayfa dizin

URL'ler `https://developers.facebook.com/documentation/ads-commerce/` altına göredir.

| Dosya | Kaynak URL | Tek satır özet | Önem |
|---|---|---|---|
| graph-api__reference__adgroup__ad_studies.md | graph-api/reference/adgroup/ad_studies | Reklamın dahil olduğu çalışmalar (A/B, lift); salt okuma | Düşük |
| graph-api__reference__adgroup__adcreatives.md | graph-api/reference/adgroup/adcreatives | Reklamın kreatifleri; salt okuma; `80004` hız hatası | Orta |
| graph-api__reference__adgroup__addrafts.md | graph-api/reference/adgroup/addrafts | Reklamın taslakları; salt okuma, alan ayrıntısı yok | Düşük |
| graph-api__reference__adgroup__adlabels.md | graph-api/reference/adgroup/adlabels | Reklama etiket bağlama; `execution_options=validate_only` | Orta |
| graph-api__reference__adgroup__adrules_governed.md | graph-api/reference/adgroup/adrules_governed | Reklamı yöneten otomatik kurallar; `pass_evaluation` | Düşük |
| graph-api__reference__adgroup__copies.md | graph-api/reference/adgroup/copies | Reklam kopyalama; `creative_parameters` üst seviye ezme, `degrees_of_freedom_spec` tam ezilir, `status_option` varsayılan PAUSED, DSA hataları | Yüksek |
| graph-api__reference__adgroup__facebook_feedback.md | graph-api/reference/adgroup/facebook_feedback | Reklamın yorum/geri bildirim nesneleri; salt okuma | Düşük |
| graph-api__reference__adgroup__insights.md | graph-api/reference/adgroup/insights | Reklam insights parametre ve alanları; 37 ay sınırı, atıf varsayılanı GET/POST arasında çelişkili, async rapor | Yüksek |
| graph-api__reference__adgroup__leads.md | graph-api/reference/adgroup/leads | Lead reklamın lead'leri; sayfa yetkisi gerekir | Orta |
| graph-api__reference__adgroup__previews.md | graph-api/reference/adgroup/previews | Reklam önizlemesi; `ad_format` enum'u, iframe 24 saat, CTA değer şeması | Orta |
| graph-api__reference__adgroup__targetingsentencelines.md | graph-api/reference/adgroup/targetingsentencelines | Hedeflemenin okunabilir cümleleri; salt okuma | Düşük |
| marketing-api__ads-webhooks__ad-recommendations.md | marketing-api/ads-webhooks/ad-recommendations | Yeni öneri webhook'u, yük alanları, öneriyi geri okuma | Orta |
| marketing-api__ads-webhooks__ads-webhooks-overview.md | marketing-api/ads-webhooks/ads-webhooks-overview | Ad hesabı webhook'ları genel bakış, zarf, altı alan | Yüksek |
| marketing-api__ads-webhooks__creative-fatigue.md | marketing-api/ads-webhooks/creative-fatigue | Kreatif yorgunluğu webhook'u (LOW/MEDIUM/HIGH) ve teşhis sorguları | Orta |
| marketing-api__ads-webhooks__effective-status.md | marketing-api/ads-webhooks/effective-status | Teslim durumu webhook'u; `field_changed` ile gelir, yeni değeri taşımaz | Yüksek |
| marketing-api__ads-webhooks__in-process-ad-objects.md | marketing-api/ads-webhooks/in-process-ad-objects | İşleme bitti webhook'u (`level`, `status_name`) | Orta |
| marketing-api__ads-webhooks__setup__get-started.md | marketing-api/ads-webhooks/setup/get-started | İki token'lı kurulum, doğrulama, `X-Hub-Signature-256` | Yüksek |
| marketing-api__ads-webhooks__subscriptions.md | marketing-api/ads-webhooks/subscriptions | Eşik/olay abonelikleri; olay türleri, alan ve operatör listeleri, kilometre taşı minimumları | Yüksek |
| marketing-api__ads-webhooks__with-issues-ad-objects.md | marketing-api/ads-webhooks/with-issues-ad-objects | Sorunlu nesne webhook'u (hata kodu/özet/mesaj) | Yüksek |
| marketing-api__asyncrequests.md | marketing-api/asyncrequests | Async request set, batch (≤50, reklam ≤10), Batch API (≤1000), ETag | Yüksek |
| marketing-api__best-practices.md | marketing-api/best-practices | İnceleme tetikleyicileri, `?ids=`, arşiv/silme, sandbox, politikalar | Yüksek |
| marketing-api__best-practices__manage-your-ad-object-status.md | marketing-api/best-practices/manage-your-ad-object-status | Canlı/arşiv/silinmiş durumlar, kalıtım, 28 gün, toplamların ayrışması, 100.000 arşiv | Yüksek |
| marketing-api__best-practices__omni-optimal-setup-guide.md | marketing-api/best-practices/omni-optimal-setup-guide | Pixel/CAPI parametreleri, EMQ, offline kalite, tekilleştirme (48 sa / 7 gün), katalog eşleşmesi | Orta |
| marketing-api__error-reference.md | marketing-api/error-reference | Hata kodu tablosu, `blame_field_specs`, "yalnızca koda güven" | Yüksek |
| marketing-api__error-reference__ios-14-error-codes.md | marketing-api/error-reference/ios-14-error-codes | iOS 14 / SKAdNetwork uygulama kampanyası hataları | Düşük |
| marketing-api__get-started.md | marketing-api/get-started | Ön koşullar: ad hesabı, geliştirici hesabı, uygulama | Düşük |
| marketing-api__get-started__ad-optimization-basics.md | marketing-api/get-started/ad-optimization-basics | `customaudiences` ve `insights` uçlarına giriş | Düşük |
| marketing-api__get-started__ad-optimization-basics__monitoring-and-analytics.md | marketing-api/get-started/ad-optimization-basics/monitoring-and-analytics | Insights ile izleme, genel KPI yorumu | Düşük |
| marketing-api__get-started__ad-optimization-basics__optimization-tips.md | marketing-api/get-started/ad-optimization-basics/optimization-tips | Genel optimizasyon tavsiyeleri (kitle, bütçe, kreatif, CAPI) | Düşük |
| marketing-api__get-started__authentication.md | marketing-api/get-started/authentication | Token türleri, uzatma, system user (süresiz), OAuth akışı, saklama | Yüksek |
| marketing-api__get-started__authorization.md | marketing-api/get-started/authorization | Limited/Full erişim katmanı, 500 çağrı / %15 hata eşiği, izinler, Business Verification | Yüksek |
| marketing-api__get-started__basic-ad-creation.md | marketing-api/get-started/basic-ad-creation | campaigns/adsets/ads uçları; örnekler eski (legacy amaç) | Orta |
| marketing-api__get-started__basic-ad-creation__create-an-ad-campaign.md | marketing-api/get-started/basic-ad-creation/create-an-ad-campaign | Kampanya oluşturma; "zorunlu" tablo eksik, `LINK_CLICKS` örneği | Orta |
| marketing-api__get-started__basic-ad-creation__create-an-ad-creative.md | marketing-api/get-started/basic-ad-creation/create-an-ad-creative | `object_story_spec` + `link_data` ile kreatif | Orta |
| marketing-api__get-started__basic-ad-creation__create-an-ad-set.md | marketing-api/get-started/basic-ad-creation/create-an-ad-set | Ad set oluşturma; `optimization_goal`/`billing_event` eksik örnek | Orta |
| marketing-api__get-started__basic-ad-creation__create-an-ad.md | marketing-api/get-started/basic-ad-creation/create-an-ad | Reklam = ad set + kreatif, `status` | Orta |
| marketing-api__get-started__manage-campaigns.md | marketing-api/get-started/manage-campaigns | Güncelle/duraklat/arşivle/sil; `CONVERSIONS` örneği eski | Orta |
| marketing-api__marketing-api-changelog.md | marketing-api/marketing-api-changelog | Değişiklik günlüğü girişi; v25 güncel, erişim katmanı adları (2026-05-04) | Orta |
| marketing-api__marketing-api-changelog__version18.0.md | marketing-api/marketing-api-changelog/version18.0 | `location_types` varsayılanı ve kısıtı, R&F değişiklikleri, kredi kartı ucu | Orta |
| marketing-api__marketing-api-changelog__version19.0.md | marketing-api/marketing-api-changelog/version19.0 | Kalkan insights metrikleri, kopyada ODAX, `targeting_as_signal` | Orta |
| marketing-api__marketing-api-changelog__version20.0.md | marketing-api/marketing-api-changelog/version20.0 | `ON_POST`+`IMPRESSIONS` yasağı, frekans kontrolü kısıtı, Offline Conversions API kapanışı | Yüksek |
| marketing-api__marketing-api-changelog__version21.0.md | marketing-api/marketing-api-changelog/version21.0 | ODAX zorunluluğu, Image Expansion | Yüksek |
| marketing-api__marketing-api-changelog__version22.0.md | marketing-api/marketing-api-changelog/version22.0 | `instagram_actor_id` → `instagram_user_id`, IG alan değişimleri, hariç tutma kısıtı, şehir ilgi genişlemesi, IG uçları | Yüksek |
| marketing-api__marketing-api-changelog__version23.0.md | marketing-api/marketing-api-changelog/version23.0 | Advantage+ Audience varsayılan açık, yaş/cinsiyet öneri | Yüksek |
| marketing-api__marketing-api-changelog__version24.0.md | marketing-api/marketing-api-changelog/version24.0 | Bütçe esnekliği %75, ABO paylaşım alanı, A+ Shopping/App yasağı, ilgi birleştirme, yerleşim değişiklikleri | Yüksek |
| marketing-api__marketing-api-changelog__version25.0.md | marketing-api/marketing-api-changelog/version25.0 | A+ Shopping/App yasağı tüm sürümlere, async insights hata alanları | Yüksek |
| marketing-api__marketing-api-changelog__versions.md | marketing-api/marketing-api-changelog/versions | Tüm sürümlerin çıkış ve bitiş tarihleri (v24 bitiş 2026-10-06) | Orta |
| marketing-api__out-of-cycle-changes.md | marketing-api/out-of-cycle-changes | Sürüm dışı değişikliklerin tarih dizini | Düşük |
| marketing-api__out-of-cycle-changes__occ-2023.md | marketing-api/out-of-cycle-changes/occ-2023 | IG Shop yerleşimi kalktı; gerisi yalnızca SDK spec dosya listesi | Düşük |
| marketing-api__out-of-cycle-changes__occ-2024.md | marketing-api/out-of-cycle-changes/occ-2024 | Reklamda `bid_amount` kalktı, tekil metrik daralması, `CREDIT` → `FINANCIAL_PRODUCTS_SERVICES`, `ad_schedule_*` | Yüksek |
| marketing-api__out-of-cycle-changes__occ-2025.md | marketing-api/out-of-cycle-changes/occ-2025 | **Atıf parametreleri yok sayılıyor (2025-06-10)**, `7d_view`/`28d_view` kalktı, `messenger_home`, AB siyasi reklam, Brezilya | Yüksek |
| marketing-api__out-of-cycle-changes__occ-2026.md | marketing-api/out-of-cycle-changes/occ-2026 | Breakdown opt-in (2026-08-06), `dma` → `comscore_market`, yeni A+ creative özellikleri, IG ses değişimi, Threads | Yüksek |
| marketing-api__overview.md | marketing-api/overview | Hiyerarşi ve hangi ayar hangi seviyede (CBO'yu anlatmıyor) | Orta |
| marketing-api__overview__data-processing-options.md | marketing-api/overview/data-processing-options | ABD eyalet gizlilik yasaları için LDU bayrağı | İlgisiz |
| marketing-api__overview__performance-recommendations-history-api.md | marketing-api/overview/performance-recommendations-history-api | Opportunity Score geçmişi (45 gün, 2 gün gecikme, hata subcode'ları) | Orta |
| marketing-api__overview__performance-recommendations.md | marketing-api/overview/performance-recommendations | Opportunity Score ve öneriler; okuma/uygulama, tür bazında `extra_data`, çoğaltan öneriler | Yüksek |
| marketing-api__overview__rate-limiting.md | marketing-api/overview/rate-limiting | Tüm hız sınırları, formüller, hata kodları, başlıklar | Yüksek |
| marketing-api__overview__versioning.md | marketing-api/overview/versioning | 90 gün kuralı, sürümsüz çağrı yasağı, otomatik yükseltme ve başlığı, migration'lar | Yüksek |
| marketing-api__troubleshooting.md | marketing-api/troubleshooting | Genel hata işleme, `is_transient`, kuyruk ve önbellek tavsiyesi | Orta |
| marketing-api__using-the-api__faq.md | marketing-api/using-the-api/faq | Genel SSS (üretim için App Review şart) | Düşük |
| marketing-api__using-the-api__post-processing.md | marketing-api/using-the-api/post-processing | `IN_PROCESS` / `WITH_ISSUES` ve `issues_info` | Yüksek |
| ads-ai-connectors__ads-cli__ad-creatives.md | ads-ai-connectors/ads-cli/ad-creatives | CLI kreatif biçimleri, medya türleri, CTA listesi, DCO sınırları | Orta |
| ads-ai-connectors__ads-cli__ads-cli-overview.md | ads-ai-connectors/ads-cli/ads-cli-overview | CLI kapsamı, kaynak/işlem tablosu, otomasyon özellikleri | Orta |
| ads-ai-connectors__ads-cli__command-reference.md | ads-ai-connectors/ads-cli/command-reference | Tüm komutlar, zorunlu/isteğe bağlı bayraklar ve enum'lar | Yüksek |
| ads-ai-connectors__ads-cli__datasets-and-catalogs.md | ads-ai-connectors/ads-cli/datasets-and-catalogs | Piksel oluşturma/bağlama, katalog yönetimi, dönüşüm kurulum akışı | Orta |
| ads-ai-connectors__ads-cli__insights.md | ads-ai-connectors/ads-cli/insights | CLI insights seçenekleri ve varsayılanları | Orta |
| ads-ai-connectors__ads-cli__setup__configuration.md | ads-ai-connectors/ads-cli/setup/configuration | Ortam değişkenleri ve yapılandırma önceliği | Düşük |
| ads-ai-connectors__ads-cli__setup__get-started.md | ads-ai-connectors/ads-cli/setup/get-started | Kurulum, system user oluşturma, token kapsamları | Orta |
| ads-ai-connectors__ads-cli__tutorials-and-recipes.md | ads-ai-connectors/ads-cli/tutorials-and-recipes | Uçtan uca kurulum, çıkış kodları, basamaklı silme | Orta |
| ads-ai-connectors__ads-mcp-server__ads-mcp-server-get-started.md | ads-ai-connectors/ads-mcp-server/ads-mcp-server-get-started | MCP bağlantısı: OAuth ya da token, gereken izinler, istemci komutları | Yüksek |
| ads-ai-connectors__ads-mcp-server__ads-mcp-server-overview.md | ads-ai-connectors/ads-mcp-server/ads-mcp-server-overview | MCP sunucusu nedir, yedi araç kategorisi | Yüksek |
| ads-ai-connectors__ads-mcp-server__ads-mcp-server-tools-abtests-and-conversion-lift-studies.md | ads-ai-connectors/ads-mcp-server/ads-mcp-server-tools-abtests-and-conversion-lift-studies | A/B test ve lift araçları (7 araç) | Orta |
| ads-ai-connectors__ads-mcp-server__ads-mcp-server-tools-activity-logs.md | ads-ai-connectors/ads-mcp-server/ads-mcp-server-tools-activity-logs | Aktivite günlüğü aracı (1 araç) | Orta |
| ads-ai-connectors__ads-mcp-server__ads-mcp-server-tools-ad-creation-and-management.md | ads-ai-connectors/ads-mcp-server/ads-mcp-server-tools-ad-creation-and-management | Hesap keşfi, yaşam döngüsü, kreatif, IG boost, kitle araçları; yazmalar PAUSED + onay | Yüksek |
| ads-ai-connectors__ads-mcp-server__ads-mcp-server-tools-catalog-creation-and-management.md | ads-ai-connectors/ads-mcp-server/ads-mcp-server-tools-catalog-creation-and-management | Katalog/ürün/set/feed/kural/olay kaynağı araçları; canlı adlarla ayrışıyor | Orta |
| ads-ai-connectors__ads-mcp-server__ads-mcp-server-tools-comprehensive-reporting.md | ads-ai-connectors/ads-mcp-server/ads-mcp-server-tools-comprehensive-reporting | Raporlama, opportunity score ve dört insights analiz aracı | Yüksek |
| ads-ai-connectors__ads-mcp-server__ads-mcp-server-tools-help-and-troubleshooting.md | ads-ai-connectors/ads-mcp-server/ads-mcp-server-tools-help-and-troubleshooting | Teslim hatası ve yardım makalesi araçları | Orta |
| ads-ai-connectors__ads-mcp-server__ads-mcp-server-tools-signals-and-datasets.md | ads-ai-connectors/ads-mcp-server/ads-mcp-server-tools-signals-and-datasets | Veri seti, EMQ, piksel olay/parametre kuralları, özel dönüşüm araçları | Orta |
| ads-ai-connectors__ads-mcp-server__ads-mcp-server-tools.md | ads-ai-connectors/ads-mcp-server/ads-mcp-server-tools | **BOŞ SAYFA**: yalnızca başlık; parametreler canlı şemadan okundu | Düşük |
