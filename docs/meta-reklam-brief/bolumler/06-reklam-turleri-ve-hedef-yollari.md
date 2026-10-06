# 06 — Reklam türleri ve hedef yolları (iş hedefinden uçtan uca kurulum)

> Kaynak: 56 sayfa (`_listeler/F2-formatlar.txt`) · Okunan: 56/56 · Bilgi belgeden, canlıda doğrulanmadı.
>
> Bu bölümdeki hiçbir alan/enum Advetics'in canlı hesabında denenmedi. Belgenin
> kendi içinde çeliştiği yerler ayrıca **"belgede çelişkili"**, hiç söylemediği
> yerler **"belgede belirsiz"** diye işaretli. Örneklerin çoğu Graph `v25.0`
> üzerinden yazılmış; omnichannel sayfası `v20.0`, Threads yanıt moderasyonu
> `v24.0` örnekleri taşıyor.

## Özet: Advetics için ne demek

1. **Her reklam türü dört katmanlı tek bir tariften çıkıyor:** kampanya
   `objective` → reklam seti `optimization_goal` + `destination_type` +
   `promoted_object` → kreatif (`object_story_spec` / `asset_feed_spec`) →
   kreatifteki `call_to_action`. Bu dördü birbirinden bağımsız seçilirse Meta
   ya reddediyor ya da (daha kötüsü) kabul edip başka bir şey yayınlıyor. Panelin
   "ne istiyorsun?" sorusu aşağıdaki **kapalı sözlük tablosundan** dördünü birden
   seçmeli; kullanıcıya ayrı ayrı sorulmamalı.
2. **`destination_type` her tür sayfasında "Required" yazıyor** (WHATSAPP,
   MESSENGER, INSTAGRAM_DIRECT, ON_AD, PHONE_CALL, FACEBOOK_PAGE,
   INSTAGRAM_PROFILE, …). Advetics'in boost'ta `ON_POST` dersiyle aynı desen:
   gönderilmeyen hedef Meta'nın tahminine kalıyor. Her yolda açıkça yazılmalı.
3. **Reklam seti `status` verilmezse `ACTIVE` oluyor** (CTWA, CTIG,
   multidestination, profil ziyareti sayfaları açıkça yazıyor) ve belgedeki
   kampanya örneklerinin çoğu `status=ACTIVE` ile kuruluyor. Advetics her
   seviyede `PAUSED` göndermeli, yayın ayrı ve onaylı bir adım olmalı.
4. **Click-to-WhatsApp tarifi Advetics'in canlı bilgisiyle birebir uyuşuyor**
   (`destination_type: WHATSAPP`, `promoted_object.page_id`, kreatifte
   `https://api.whatsapp.com/send`, CTA `WHATSAPP_MESSAGE` +
   `{app_destination: "WHATSAPP"}`). Numara `promoted_object.whatsapp_phone_number`
   ile **isteğe bağlı**; sorulmaması doğru. Ama "web sitesinden mesaja" sayfası
   tıkla-mesaj hedeflerini `MESSAGING_WHATSAPP` diye adlandırıyor — **belgede
   çelişkili**, canlı bilgi `WHATSAPP` lehine.
5. **Lead formu silinemiyor, yalnızca arşivleniyor; Messenger lead şablonu ise
   ne düzenlenebiliyor ne siliniyor.** Ayrıca Messenger'da lead toplayan
   reklamları **API ile oluşturmak v24.0'dan itibaren kaldırılıyor**. Form
   oluşturmak geri alınamaz bir iş: AI aracı olarak onaylı olmalı.
6. **Lead okumak ayrı bir yetki dünyası:** `leads_retrieval` + App Review +
   Business Verification; uygulama Development modundaysa lead'ler okunamıyor;
   kullanıcı token'ı uygulamanın aktif kullanıcı sayısına göre (pratikte 1)
   sınırlanıyor, **Sayfa token'ı kullanılmalı**. Webhook birkaç dakika
   gecikebiliyor; tek bildirim birden çok lead taşıyabiliyor.
7. **Sessiz düşüşler bu grupta yoğun:** Threads'te 1000 karakteri aşan metin
   reklamı oluşturuyor ama Threads'e hiç göstermiyor; partnership reklamı izin
   yokken "beklemede" yayınlanıyor; sponsor hesabın IG↔FB bağı yoksa o
   platforma hiç gitmiyor; WhatsApp Durum'da kimlik verilmezse "bazı reklamlar
   teslim edilmeyebilir"; Audience Network'te karuselin yalnızca ilk iki kartı
   görünüyor; açıklama verilmezse Meta bağlantıdan metin kazıyor.
8. **Varsayılanı açık olan genişletmeler:** WhatsApp Durum yerleşimi seçiliyken
   `user_age_unknown` verilmezse **`true`** (Temmuz 2026'dan beri) — yaşı
   bilinmeyen kişiler kitleye giriyor, Advantage+ yerleşimde de. Threads
   yerleşimi açıksa yeni uyumlu formatlar **kendiliğinden** Threads'e gidiyor.
9. **Profil ziyareti API'si "sınırlı erişim"de**, omnichannel yalnızca uygun
   hesaplarda (`3858449`), Threads teslimatı Meta tarafından bilerek düşük
   tutuluyor. Bu üçü panelin ilk sürümünde acemiye açılmamalı.
10. **Etkinlik ve uygulama sayfaları eski hedef adlarını taşıyor**
    (`EVENT_RESPONSES`, `CONVERSIONS`, `APP_INSTALLS`, `LINK_CLICKS` kampanya
    objective'i olarak) ama aynı sayfaların örnekleri `OUTCOME_*` gönderiyor.
    **Belgede çelişkili** — bu iki tür canlıda en küçük bütçeyle denenmeden
    açılmamalı.
11. **Meta'nın kendi omnichannel örneği coğrafya birleşim tuzağına düşüyor:**
    `countries: ["US"]` + `regions` + `cities` aynı istekte. Advetics'in canlı
    bilgisine göre bu ülke geneli demek. Belge örneği "doğru" sayılmamalı.

## Kapalı sözlük: "Ne istiyorsun?" → tam kurulum

Panelin acemi kullanıcıya sorduğu tek sorunun cevap listesi. Sütunlar
belgeden okunan değerlerdir; birden fazla geçerli değer varsa **önerilen**
kalın, alternatifler parantez içinde. "—" = bu tür için belge alan istemiyor;
"belgede yok" = belge söylemiyor, tahmin edilmemeli.

| # | Kullanıcının dilindeki hedef | `objective` | `optimization_goal` | `destination_type` | `promoted_object` | Zorunlu kreatif alanı | CTA tipi (`call_to_action`) | Panel durumu |
|---|---|---|---|---|---|---|---|---|
| 1 | "WhatsApp'tan bana yazsınlar" | **`OUTCOME_ENGAGEMENT`** (`OUTCOME_LEADS`, `OUTCOME_SALES`, `OUTCOME_TRAFFIC`) | **`CONVERSATIONS`** | `WHATSAPP` | `{page_id}` (+ ops. `whatsapp_phone_number`) | `object_story_spec.page_id` + `link_data.link = "https://api.whatsapp.com/send"` + görsel/video; ops. `page_welcome_message` | `WHATSAPP_MESSAGE`, `value: {app_destination: "WHATSAPP"}` | Acemi |
| 2 | "WhatsApp'tan yazsınlar ya da hemen arasınlar" | **`OUTCOME_ENGAGEMENT`** (çağrı istemi varsa ZORUNLU) | `CONVERSATIONS` | `WHATSAPP` | `{page_id}` | #1 + `page_welcome_message.landing_screen_type = "ctwa_call_prompt"` + `call_prompt_data.call_prompt_message` | `WHATSAPP_MESSAGE` + `{app_destination: "WHATSAPP"}` | Gelişmiş |
| 3 | "Messenger'dan bana yazsınlar" | **`OUTCOME_ENGAGEMENT`** (`OUTCOME_SALES`, `OUTCOME_TRAFFIC`) | **`CONVERSATIONS`** (`IMPRESSIONS`) | `MESSENGER` | `{page_id}` | `object_story_spec.page_id` + `link_data`/`video_data`; ops. `page_welcome_message` | **`MESSAGE_PAGE`** (`LEARN_MORE`), `value: {app_destination: "MESSENGER"}` | Acemi |
| 4 | "Instagram DM'den bana yazsınlar" | **`OUTCOME_ENGAGEMENT`** (`OUTCOME_SALES`, `OUTCOME_TRAFFIC`; `OUTCOME_LEADS` YOK) | **`CONVERSATIONS`** | `INSTAGRAM_DIRECT` | `{page_id}` | `object_story_spec.page_id` + IG hesap kimliği (belgede `instagram_actor_id`, bkz. tuzaklar) + `link_data` | `INSTAGRAM_MESSAGE`, `value: {app_destination: "INSTAGRAM_DIRECT"}` | Acemi |
| 5 | "Nereden olursa mesaj atsınlar (WhatsApp/Messenger/DM)" | **`OUTCOME_ENGAGEMENT`** (`OUTCOME_SALES`, `OUTCOME_TRAFFIC`) | `CONVERSATIONS` (zorunlu) | `MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP` (ya da ikili: `MESSAGING_INSTAGRAM_DIRECT_MESSENGER`, `MESSAGING_MESSENGER_WHATSAPP`, `MESSAGING_INSTAGRAM_DIRECT_WHATSAPP`) | `{page_id}` | `object_story_spec.page_id` + `instagram_user_id` + `asset_feed_spec.optimization_type = "DOF_MESSAGING_DESTINATION"` + `asset_feed_spec.call_to_actions` (destination ile birebir aynı küme) | Her hedef kendi CTA'sı: `MESSAGE_PAGE`/`MESSENGER`, `WHATSAPP_MESSAGE`/`WHATSAPP`, `INSTAGRAM_MESSAGE`/`INSTAGRAM_DIRECT` | Acemi (bağlı kanallardan otomatik) |
| 6 | "Siteme gelsinler, isterlerse WhatsApp'tan da yazabilsinler" | **`OUTCOME_TRAFFIC`** (kanal tablosuna bkz.) | Trafik: `LANDING_PAGE_VIEWS`; Satış/Lead/Etkileşim: `OFFSITE_CONVERSIONS`; Bilinirlik: `REACH` | `WEBSITE` (ya da `UNDEFINED`) | `{page_id}` | **Inline** `POST /ads` kreatifinde `asset_feed_spec.message_extensions: [{type: "whatsapp"\|"messenger"\|"instagram_message"}]` + `link_data.link` = site | `LEARN_MORE` (mesaj CTA'ları YASAK) | Gelişmiş |
| 7 | "Form doldursunlar / iletişim bilgisi bıraksınlar" | `OUTCOME_LEADS` | **`LEAD_GENERATION`** (CRM verisi bağlıysa `QUALITY_LEAD`) | `ON_AD` | `{page_id}` (`QUALITY_LEAD` + CRM: `pixel_id` eklenebilir) | `link_data.link = "https://fb.me/"` + görsel/video + `call_to_action.value.lead_gen_form_id` | **`SIGN_UP`** (`APPLY_NOW`, `GET_QUOTE`, `LEARN_MORE`, `DOWNLOAD`, `SUBSCRIBE`) | Acemi |
| 8 | "Beni arasınlar" | **`OUTCOME_TRAFFIC`** (`OUTCOME_AWARENESS`, `OUTCOME_ENGAGEMENT`, `OUTCOME_LEADS`, `OUTCOME_SALES`) | `QUALITY_CALL` | `PHONE_CALL` | belgede yok | `object_story_spec.link_data` + telefon | `CALL_NOW`, `value: {link: "tel:+<ülke kodu><numara>"}` | Acemi (numara Sayfa'dan) |
| 9 | "Arasınlar ya da numara bıraksınlar, ben arayayım" | #8 ile aynı | `QUALITY_CALL` | `PHONE_CALL` | belgede yok | #8 + `asset_feed_spec.call_ads_configuration.callback_type = "FORM"` | `CALL_NOW` | Gelişmiş |
| 10 | "Instagram profilime gelsinler" | **`OUTCOME_TRAFFIC`** (`OUTCOME_ENGAGEMENT`) | `PROFILE_VISIT` | `INSTAGRAM_PROFILE` | `{page_id}` (IG iş hesabı bağlı Sayfa) | `object_story_spec.instagram_user_id` + `link_data.link = "https://www.instagram.com/<kullanıcı>"` | `VIEW_INSTAGRAM_PROFILE`, `value: {link: <IG profil>}` | Kapalı (API sınırlı erişim) |
| 11 | "Facebook sayfama gelsinler" | **`OUTCOME_TRAFFIC`** (`OUTCOME_ENGAGEMENT`) | `PROFILE_VISIT` | `FACEBOOK_PAGE` | `{page_id}` | `object_story_spec.page_id` + `link_data.link = "https://www.facebook.com/<sayfa>"` | `VISIT_PROFILE`, `value: {link: <FB sayfa>}` | Kapalı (API sınırlı erişim) |
| 12 | "Profilime gelsinler, hangisi tutarsa" | **`OUTCOME_TRAFFIC`** (`OUTCOME_ENGAGEMENT`) | `PROFILE_VISIT` | `INSTAGRAM_PROFILE_AND_FACEBOOK_PAGE` | `{page_id}` | `page_id` + `instagram_user_id` + `asset_feed_spec.call_to_actions` (ikisi) + `optimization_type = "UNIFIED_PROFILE_VISIT_DESTINATION"` | `VIEW_INSTAGRAM_PROFILE` + `VISIT_PROFILE` | Kapalı (API sınırlı erişim) |
| 13 | "Messenger'dan kampanya mesajı almaya abone olsunlar" | `OUTCOME_TRAFFIC` | belgede çelişkili (`CONVERSATIONS` ya da `CONVERSIONS`) | `MESSENGER` | `{page_id}` | `page_welcome_message`: `landing_screen_type = "marketing_messages"`, `payload.template_type = "notification_messages"` | `LEARN_MORE` + `{app_destination: "MESSENGER"}` | Kapalı |
| 14 | "Uygulamamı indirsinler" | `OUTCOME_APP_PROMOTION` | `APP_INSTALLS` | belgede yok | `{application_id, object_store_url}` | `link_data.link` = mağaza adresi + görsel/video; hedeflemede `user_os` + `device_platforms: ["mobile"]` | `INSTALL_MOBILE_APP`, `value: {link: <mağaza>}` | Gelişmiş |
| 15 | "Uygulamamda bir şey yapsınlar (satın alma vb.)" | `OUTCOME_APP_PROMOTION` | `OFFSITE_CONVERSIONS` | belgede yok | `{application_id, object_store_url, custom_event_type}` | `call_to_action.value.app_link` (derin bağlantı) | `USE_MOBILE_APP` / `LEARN_MORE` | Kapalı |
| 16 | "Etkinliğime katılsınlar" | `EVENT_RESPONSES` (eski ad — belgede çelişkili) | `EVENT_RESPONSES` | belgede yok | belgede yok | kreatif kökünde `object_type = "EVENT"` + `link_data.event_id` + `link` | belgede yok | Kapalı |
| 17 | "Etkinliğime bilet alsınlar" | `OUTCOME_TRAFFIC` | `LINK_CLICKS` | belgede yok | belgede yok | `link_data.link` + `link_data.event_id` | `BUY_TICKETS`, `value: {link: <bilet sitesi>}` | Kapalı |
| 18 | "Mağazamın çevresindekiler görsün / yol tarifi alsınlar" | `OUTCOME_AWARENESS` | `REACH` (faturalama `IMPRESSIONS`) | belgede yok | `{page_id}` | Sayfa gönderisi (`object_story_id`) ya da `link_data`; hedeflemede `custom_locations` (ülke YOK) | `GET_DIRECTIONS` (`fbgeo:`), `CALL_NOW` (`tel:`), `MESSAGE_PAGE` (değersiz) | Gelişmiş |
| 19 | "Hem mağazada hem sitede satış" | `OUTCOME_SALES` (tek seçenek) | `OFFSITE_CONVERSIONS` (tek seçenek) | belgede yok | `omnichannel_object: {pixel:[…PURCHASE], offline:[…PURCHASE]}` | `link_data` + ops. `degrees_of_freedom_spec…local_store_extension` | `SHOP_NOW` | Kapalı (hesap uygunluğu) |

**Hedef değil, yerleşim/değiştirici olan satırlar** (hedef yukarıdan seçilir,
bunlar ona eklenir):

| Değiştirici | Ne ekleniyor | Kısıt | Panel durumu |
|---|---|---|---|
| WhatsApp Durum'da da görüneyim | `targeting.publisher_platforms: ["instagram","whatsapp"]`, `instagram_positions: ["story"]`, `whatsapp_positions: ["status"]`; kreatifte `wamo_whatsapp_identity_spec`; `user_age_unknown` AÇIKÇA | Yalnızca tek görsel/tek video; özel kategori yok; objective tablosu aşağıda | Gelişmiş |
| Threads'te de görüneyim | `publisher_platforms` içine `instagram` + `threads`, `instagram_positions: ["stream"]` + `threads_positions: ["threads_stream"]`; kreatifte `threads_user_id` + `instagram_user_id` | Objective: AWARENESS/TRAFFIC/ENGAGEMENT/SALES; metin ≤1000 | Kapalı |
| Audience Network'te de görüneyim | `publisher_platforms` içine `audience_network` (başka bir platformla birlikte ZORUNLU) | Karuselin yalnızca ilk 2 kartı | Kapalı |
| Bir içerik üreticiyle birlikte (partnership) | kreatife `facebook_branded_content.sponsor_page_id` / `instagram_branded_content.sponsor_id` / `branded_content{…}` | Hesap ya da gönderi düzeyinde izin şart | Kapalı |
| Birden çok görsel/video tek reklamda | inline `POST /ads` kreatifinde `media_sourcing_spec` | En çok 10 medya | Gelişmiş |

> Not (CLAUDE.md "Kasıtlı olarak DAR kalan listeler"): bu sözlük panelin
> **yazma yollarını** besleyecek; satırı "Kapalı" olan bir türü arayüzde seçenek
> olarak göstermek çalışmayan bir yolu açmak olur. Liste genişletilirken önce
> yazma kodu ve canlı doğrulama gelmeli.

## Kavramlar, kurallar ve alanlar

### Ortak iskelet ve izinler

- Akış her türde aynı: `POST /act_<ID>/campaigns` → `POST /act_<ID>/adsets` →
  `POST /act_<ID>/adcreatives` (ya da kreatif inline) → `POST /act_<ID>/ads` →
  `POST /<AD_ID>` ile `status=ACTIVE`. Onaydan önce `effective_status =
  PENDING_REVIEW`.
- Mesajlaşma, lead, arama ve profil sayfalarının ortak yetki seti: işlemi yapan
  kişinin Sayfa'da `ADVERTISE` görevi olan **Sayfa token'ı**; izinler
  `ads_management`, `pages_manage_ads`, `pages_read_engagement`,
  `pages_show_list`. (Arama reklamı sayfası görevi "ADVERTIZE" diye yazıyor —
  yazım hatası.)
- `billing_event` mesajlaşma, lead, arama, profil ziyareti ve yerel reklamda
  `IMPRESSIONS` olarak **zorunlu** yazılmış.
- Bütçe kuralları (tür sayfalarında tekrar ediliyor): `daily_budget` ya da
  `lifetime_budget`'tan biri > 0; günlük bütçe yalnızca 24 saatten uzun reklam
  setinde; ömür boyu bütçede `end_time` (eşdeğeri `time_stop`) zorunlu;
  `end_time=0` ya da boş = bitişsiz. `start_time` verilmezse "şimdi".
  `bid_amount` yalnızca `LOWEST_COST_WITH_BID_CAP` / `COST_CAP` ile zorunlu;
  ama lead, arama ve CTM sayfaları `bid_amount`'u koşulsuz "must include"
  listesine koyuyor — **belgede çelişkili**.
- Reklam seti `status` verilmezse **`ACTIVE`**; kampanya `PAUSED` olursa alt
  nesneler `CAMPAIGN_PAUSED` etkin durumuna düşüyor.
- `degrees_of_freedom_spec.creative_features_spec.standard_enhancements.enroll_status`:
  v17.0+ uygun kreatiflerde verilmezse hata ("Creative Must Provide
  enroll_status for Standard Enhancements"). Partnership "yeni kreatif"
  örnekleri `degrees_of_freedom_spec`'i "required" diye işaretliyor ve
  `degrees_of_freedom_type: "USER_ENROLLED_AUTOFLOW"` taşıyor.

### Mesajlaşma reklamları

**Ortak: karşılama mesajı (`page_welcome_message`)**

- Verilmezse kişinin gördüğü varsayılan cümle İngilizce: *"Hello! Can I get
  more info on this?"* — Türk müşteride bu, reklamın ilk mesajının İngilizce
  olması demek. Advetics her zaman Türkçe bir karşılama göndermeli.
- Yapı (WhatsApp/IG/çoklu): `type: "VISUAL_EDITOR"`, `version: 2`,
  `landing_screen_type`, `media_type: "text"`, `text_format.customer_action_type`
  ve `text_format.message`. Gördüğümüz değerler:
  - `landing_screen_type`: `welcome_message`, `ctwa_flows` (WhatsApp Flow),
    `ctwa_call_prompt` (WhatsApp çağrı istemi), `call_prompt` (Messenger),
    `marketing_messages` (Messenger abonelik).
  - `customer_action_type`: `autofill_message` (kişinin kutusuna hazır mesaj,
    `message.autofill_message.content`), `ice_breakers` (hazır soru düğmeleri,
    `message.ice_breakers[{title, response}]`), `whatsapp_flow`, `buttons`.
  - `message.automated_greeting_message_cta.type`: `call`, `url` (+`url`),
    `catalog`, `flow` (+`flow_data {call_to_action, flow_id}`).
  - Yer tutucular (IG sayfası): `{{user_first_name}}`, `{{user_last_name}}`,
    `{{user_full_name}}`, `{{page_name}}`.
- Sınırlar (Messenger ve çoklu hedef sayfaları): buz kırıcı başlığı ≤ 80,
  buz kırıcı cevabı ≤ 300, mesaj metni ≤ 300 karakter. WhatsApp ve IG için
  sınır yazılmamış — **belgede belirsiz**.
- Örneklerde `page_welcome_message` bazen nesne, bazen JSON **dizgesi**, bazen
  dizi; konumu bazen `link_data`/`video_data` içi, bazen `object_story_spec`
  kökü. **Belgede çelişkili**: canlıda geri okuma ile doğrulanmalı (yazılan
  alanın yankısı aynı yerde mi).
- İş ortağı uygulamasındaki akış: `asset_feed_spec.additional_data.partner_app_welcome_message_flow_id`.

**Click-to-WhatsApp (CTWA)**

- Ön koşul: WhatsApp numarası bağlı Facebook Sayfası (elle ya da
  `page_whatsapp_number_verification` API'si).
- Kampanya `objective`: `OUTCOME_ENGAGEMENT`, `OUTCOME_LEADS`, `OUTCOME_SALES`,
  `OUTCOME_TRAFFIC`. Çağrı istemi varsa **yalnızca** `OUTCOME_ENGAGEMENT`.
- Reklam seti `optimization_goal`, objective'e göre:
  - ENGAGEMENT: `CONVERSATIONS`, `LINK_CLICKS`
  - SALES: `CONVERSATIONS`, `OFFSITE_CONVERSIONS`, `LINK_CLICKS`, `IMPRESSIONS`, `REACH`
  - TRAFFIC: `CONVERSATIONS`, `LANDING_PAGE_VIEWS`, `LINK_CLICKS`, `IMPRESSIONS`, `REACH`, `POST_ENGAGEMENT`
  - LEADS: yalnızca `CONVERSATIONS`
- `destination_type: "WHATSAPP"` (tek hedef). `promoted_object.page_id`
  zorunlu, `whatsapp_phone_number` isteğe bağlı.
- Kreatif: `object_story_spec.page_id` zorunlu; `link_data` / `photo_data` /
  `text_data` / `video_data`'dan biri. `link_data.link =
  "https://api.whatsapp.com/send"`, CTA `WHATSAPP_MESSAGE` +
  `{app_destination: "WHATSAPP"}`.
- WhatsApp Flow ile karşılama: Flow sürümü > 5.1, doğrulama hatasız, statik
  (veri alışverişi yok), tek ekran, ≤ 8 bileşen, en az bir girdi bileşeni;
  izin verilen bileşenler başlık/alt başlık/gövde/açıklama metni, metin girişi,
  metin alanı, tarih seçici, radyo grubu, onay kutusu grubu, altbilgi.
  `flow_id`, reklam setinde tanıtılan numaranın WABA'sına ait olmalı. WhatsApp
  Flow kullanan işletmede karşılama metnini değiştirmek BSP akışlarını
  bozabilir.
- IG gönderisinden CTWA: kök seviyede `source_instagram_media_id`,
  `instagram_user_id`, `object_id` (Sayfa); CTA `WHATSAPP_MESSAGE`,
  `value: {link: "https://api.whatsapp.com/send", app_destination: "WHATSAPP"}`.
- Örnek reklam seti `optimization_goal: IMPRESSIONS` kullanıyor; tablo
  örneğinde `optimization_goal` değeri olarak `OUTCOME_SALES` yazıyor —
  **belge örneği hatalı**, kopyalanmamalı.

**Click-to-Messenger (CTM) ve Click-to-Subscribe (CTS)**

- Kampanya: genel CTM için `OUTCOME_ENGAGEMENT`, `OUTCOME_SALES`,
  `OUTCOME_TRAFFIC`; CTS için `OUTCOME_TRAFFIC`; Messenger lead için
  `OUTCOME_LEADS`. `buying_type: AUCTION` (varsayılan).
  `special_ad_categories` örnekte `["NONE"]`.
- Reklam seti: `destination_type: "MESSENGER"`; `optimization_goal` metinde
  `CONVERSATIONS`/`IMPRESSIONS`/`LEAD_GENERATION`/`QUALITY_LEAD`, tabloda
  "CTM ya da CTS için `CONVERSATIONS` veya `CONVERSIONS`" — **belgede
  çelişkili**; `CONVERSIONS` başka hiçbir yerde reklam seti hedefi olarak
  geçmiyor. Örnek hedefleme `publisher_platforms: ["messenger"]` içeriyor.
- Kreatif sınırları: `object_story_id` ile oluşturulan reklam **desteklenmiyor**;
  kişinin cihazında Messenger kurulu olmalı; sağ sütun yerleşimi yok. (Aynı
  sayfa birkaç paragraf sonra `object_story_id` ile Facebook gönderisinden CTM
  kreatifi örneği veriyor — **belgede çelişkili**.)
- CTA: `type` örneklerde `LEARN_MORE` ya da `MESSAGE_PAGE`; `value:
  {app_destination: "MESSENGER"}` zorunlu.
- CTS: `page_welcome_message` bir şablon: `landing_screen_type:
  "marketing_messages"`, `media_type: "image"`, `image_format.customer_action_type:
  "buttons"`, `attachment.payload.template_type: "notification_messages"`,
  `elements[{title, subtitle, image_url, app_id, buttons:[{type:"postback",
  payload, title:"Get messages"}]}]`. Abone olan kişiye en çok **günde bir**
  pazarlama mesajı; abone olmayan hiç almaz.
- Çağrı istemi (CTM): `page_welcome_message` dizi; `landing_screen_type:
  "call_prompt"`, `media_type: "text"`, `text_format.message.text` +
  `call_prompt_data.call_prompt_message`.
- Çoklu şablon: `page_welcome_message` dizisi içinde Send API şablonu (ör.
  `quick_replies[{content_type:"text", title, payload}]`); en çok 5 şablon
  mesajı.
- Ürün uzantıları (Advantage+ "Show product"): katalog bir Facebook mağazasına
  bağlı, ≥ 1 ürün; objective ENGAGEMENT/LEADS/SALES (belge ayrıca eski
  `LINK_CLICK`'i sayıyor); tek görsel/video ya da mevcut FB gönderisi.
  Alanlar: `creative_sourcing_spec.associated_product_set_id`,
  `degrees_of_freedom_spec.creative_features_spec.product_extensions.enroll_status:
  "OPT_IN"`, `product_data[{product_id, product_source:"MANUAL",
  product_decision:"ACCEPT"}]`. Çok fotoğraflı gönderide önce videoya
  çevriliyor (`multi_photo_to_video`).
- **Messenger lead reklamı (sohbet içinde form):** v24.0'dan itibaren API ile
  oluşturma kaldırılıyor (Reklam Yöneticisi'nde devam). Eski yol:
  `POST /{page_id}/messenger_lead_forms` (`privacy_url`, `template_name`,
  `reminder_text`, `step_list[]`), sonra kreatifte `page_welcome_message:
  {"ctm_lead_gen_template_id": …}` ve CTA `MESSAGE_PAGE`. `step_list` alanları:
  `step_id`, `step_type` (`INTRO` ve `CONFIRMATION` zorunlu; `QUESTION`,
  `DISQUALIFY`), `reply_type` (`NONE`, `PREFILL`, `QUICK_REPLIES`),
  `prefill_type` (`CITY`, `EMAIL`, `PHONE`), `answers`, `next_step_ids`
  (geriye işaret edemez), `allow_to_skip`, `answer_validation_enabled`
  (şehir, ülke, e-posta, kimlik no, telefon, posta kodu). Şablon **oluştuktan
  sonra düzenlenemez ve silinemez**; Messenger lead ToS'u önce kabul edilmeli.
  Arka planda bir `fblead_form` da oluşuyor.

**Click-to-Instagram Direct (CTIG)**

- Kampanya: `OUTCOME_ENGAGEMENT`, `OUTCOME_SALES`, `OUTCOME_TRAFFIC`
  (**`OUTCOME_LEADS` desteklenmiyor**).
- Reklam seti: `destination_type: "INSTAGRAM_DIRECT"`; hedefler CTWA ile aynı
  (LEADS satırı hariç). `promoted_object.page_id` zorunlu.
- Kreatif: `object_story_spec.page_id` + IG hesap kimliği zorunlu. Bu sayfa
  alanı `instagram_actor_id` diye adlandırıyor; çoklu hedef, profil ziyareti,
  Threads ve partnership sayfaları `instagram_user_id` diyor — **belgede
  çelişkili**. IG kimliği üç yoldan: Business Manager'a ait, Sayfa'ya bağlı,
  Sayfa destekli (page-backed) hesap.
- CTA `INSTAGRAM_MESSAGE` + `{app_destination: "INSTAGRAM_DIRECT"}`. Reklam
  seviyesindeki CTA örneği `MESSAGE_PAGE` + `INSTAGRAM_DIRECT` kullanıyor.
  IG gönderisinden kreatifte CTA değeri yalnızca `{link:
  "https://www.instagram.com"}` (app_destination yok) — **belgede çelişkili**.
- IABP (Instagram hesabı destekli Sayfa) kimliği: `GET
  /act_<ID>/connected_instagram_accounts_with_iabp?fields=iabp_id&business_id=…`;
  gönderiden reklamda `object_id` yerine kullanılabilir.

**Çoklu hedef (multidestination)**

- Kampanya: `OUTCOME_ENGAGEMENT`, `OUTCOME_SALES`, `OUTCOME_TRAFFIC`.
  `special_ad_categories` **desteklenmiyor** (`NONE` / boş dizi zorunlu).
- Reklam seti: `optimization_goal: CONVERSATIONS` zorunlu;
  `destination_type` dört değerden biri (tabloda). WhatsApp içeren kombinasyonda
  Sayfa'ya bağlı WhatsApp işletme numarası, Instagram içerende Sayfa'ya bağlı IG
  işletme hesabı gerekiyor.
- Kreatif: `asset_feed_spec.optimization_type: "DOF_MESSAGING_DESTINATION"` ve
  `call_to_actions` — **reklam setindeki destination kümesiyle birebir
  eşleşmeli**. Sabit bağlantılar: Messenger `https://fb.com/messenger_doc/`,
  WhatsApp `https://api.whatsapp.com/send`, Instagram `https://www.instagram.com`.
  Meta kişiyi "cevap verme olasılığı en yüksek" uygulamaya gönderiyor; hangi
  uygulamaya gittiğini Advetics seçemiyor.

**Web sitesinden mesaja (website ads that click to message)**

- Tıkla-mesajdan **ayrı ürün**: kişi siteye gidiyor (FB/IG uygulama içi
  tarayıcı), sayfanın altında mesaj düğmeli bir şerit çıkıyor.
- Reklam seti `destination_type: WEBSITE` ya da `UNDEFINED` olmak **zorunda**;
  `MESSAGING_*` değerleri kullanılmamalı.
- Kanal başına desteklenen objective: WhatsApp → Satış, Trafik, Etkileşim,
  Lead, Bilinirlik; Messenger → Satış, Trafik, Lead, Bilinirlik; IG Direct →
  Satış, Trafik, Lead.
- `optimization_goal`: Satış/Lead/Etkileşim `OFFSITE_CONVERSIONS`, Trafik
  `LANDING_PAGE_VIEWS`, Bilinirlik `REACH`.
- `asset_feed_spec.message_extensions: [{type: "whatsapp" | "messenger" |
  "instagram_message"}]` **yalnızca inline** (`POST /ads` içinde creative).
  Ayrı `POST /adcreatives` ile `message_extensions` → **hata kodu 3**.
- CTA web CTA'sı (`LEARN_MORE` vb.); `WHATSAPP_MESSAGE`, `INSTAGRAM_MESSAGE`,
  `MESSAGE_PAGE` uyumsuz.
- Tanıma: reklam seti `WEBSITE`/`UNDEFINED` **ve** kreatifte
  `asset_feed_spec.message_extensions` — ikisi birlikte.

### Potansiyel müşteri (lead) reklamları

**Kurulum**

- Kampanya `OUTCOME_LEADS`, `buying_type: AUCTION`.
- Reklam seti: `optimization_goal` `LEAD_GENERATION` ya da `QUALITY_LEAD`;
  `destination_type: "ON_AD"`; `promoted_object` Sayfa kimliği (örnek yalnızca
  çıplak dizge gönderiyor — diğer bütün türlerde `{page_id}` nesnesi; **belge
  örneği şüpheli**). `QUALITY_LEAD` + CRM veri kaynağı varsa `promoted_object`
  içine `pixel_id` eklenebilir, `pixel_rule` gerekmez. Varsayılan optimizasyon
  lead **hacmi**.
- Bütün lead'ler Facebook Sayfası'na ait; IG'de koşan lead reklamının
  lead'leri de Sayfa'ya düşüyor.

**Form (`POST /{page_id}/leadgen_forms`)**

- Alanlar: `name`, `questions` (dizi; her öğe `type`, `key`, gerekirse
  `label`, `options[{value, key}]`).
- Soru türleri: `FULL_NAME`, `FIRST_NAME`, `LAST_NAME`, `EMAIL`, `PHONE`,
  `CUSTOM` (+`label`, ops. `options` = açılır liste), `DATE_TIME` (randevu;
  ops. `inline_context` açıklama satırı), `STORE_LOOKUP`
  (+`context_provider_type: "LOCATION_MANAGER"`, Mağaza Sayfaları yapısı
  şart; değer mağaza numarası olarak gelir), ulusal kimlik:
  `ID_AR_DNI`, `ID_CPF`, `ID_CL_RUT`, `ID_CO_CC`, `ID_EC_CI`, `ID_PE_DNI`.
  Ulusal kimlik: formda **en çok bir**, hedefleme o ülkeyle sınırlı olmalı
  (yoksa reklam onaylanmıyor); doğrulama yalnızca biçim. **Türkiye için kimlik
  türü yok.**
- Messenger sohbetinde gösterilebilir form: yalnızca `CUSTOM`, `EMAIL`,
  `FIRST_NAME`, `FULL_NAME`, `LAST_NAME`, `PHONE` ve
  `block_display_for_non_targeted_viewer: false` ("Open Sharing"). Uygunluk
  `GET /{page_id}/leadgen_forms?fields=is_eligible_for_in_thread_forms`.
- Kalite/gelişmiş ayarlar:
  - `tracking_parameters` (anahtar/değer; reklamda görünmez, lead meta verisine girer)
  - `is_optimized_for_quality: true` → "Daha yüksek niyet": gönderimden önce
    gözden geçir/onayla adımı.
  - `block_display_for_non_targeted_viewer: true` → organik lead'leri süz.
  - `upload_gated_file` + `thank_you_page {title, body, button_type:
    "VIEW_ON_FACEBOOK", button_text}` → teşekkür sayfasında dosya indirme.
- **Gizlilik politikası:** bu gruptaki `leadgen_forms` örneklerinin hiçbiri
  gizlilik politikası alanı göstermiyor. Messenger lead şablonunda
  `privacy_url` ve Messenger lead kreatifinde `privacy_url` **zorunlu**
  yazıyor. `leadgen_forms` için alan adı ve zorunluluğu **belgede belirsiz** —
  form başvurusunun referans sayfasında doğrulanmadan form oluşturma aracı
  yazılmamalı; panel gizlilik URL'sini her durumda istemeli.
- Yönetim: liste `GET /{page_id}/leadgen_forms?fields=name,id`; sorular
  `GET /{form_id}?fields=questions`; **silme yok**, `status=ARCHIVED` ile
  arşiv (belge örneği bunu `GET` ile yazıyor — yazma bir `POST` olmalı,
  **belge örneği hatalı**); `status=ACTIVE` ile geri açılıyor. Arşivli form
  reklamda kullanılamaz (API hata verebilir) ve kütüphanede varsayılan olarak
  görünmez.

**Kreatif**

- `object_story_spec.page_id` + `link_data {call_to_action {type, value
  {lead_gen_form_id}}, description, image_hash, message, link}`.
- `link_data.link` için **tek geçerli değer `https://fb.me/`**.
- CTA türleri: `APPLY_NOW`, `DOWNLOAD`, `GET_QUOTE`, `LEARN_MORE`, `SIGN_UP`,
  `SUBSCRIBE`.
- Karusel: her `child_attachments` öğesinde aynı `lead_gen_form_id`
  (farklı form verilemez). Video: `video_data.call_to_action.value {link:
  "http://fb.me/", lead_gen_form_id}`.

**Lead'i almak**

- Yetkiler: tam veri için `leads_retrieval`, `ads_management`,
  `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`; webhook için
  ek `pages_manage_metadata`. `leads_retrieval` ve `pages_manage_ads` App
  Review'dan geçmeli, ardından Business Verification. Hızlı başlangıç sayfası
  izni bir yerde `lead_retrieval` diye yazıyor — doğrusu `leads_retrieval`.
- Development modundaki uygulama lead okuyamaz (yalnızca uygulamada rolü olan
  kişilerin gönderdiği lead'ler).
- Okuma için Sayfa yöneticisi ya da esnek izin; Leads Access Manager
  özelleştirilmişse Sayfa yöneticisi bile okuyamayabilir.
- Hız sınırı: Sayfa başına 24 saatte `200 × 24 × (son 90 günde oluşan lead
  sayısı)` çağrı.
- Webhook: Page nesnesinde `leadgen` alanına abonelik, ardından uygulamanın
  Sayfa'ya kurulması (`POST /{page-id}/subscribed_apps?subscribed_fields=leadgen`,
  Sayfa token'ı); Sayfa ayarlarında "App" platformu kapalıysa bildirim gelmez.
  Gövde: `object: "page"`, `entry[].changes[]` her biri `field: "leadgen"`,
  `value {leadgen_id, page_id, form_id, adgroup_id, ad_id, created_time}`.
  Gecikme "birkaç dakikaya kadar". Uzun ömürlü Sayfa token'ı öneriliyor.
- Lead detayı: `GET /{leadgen_id}` → `field_data[{name, values[]}]`.
- Toplu okuma: `GET /{ad_id}/leads` ya da `GET /{form_id}/leads?fields=created_time,id,ad_id,form_id,field_data`
  (form birden çok reklamda kullanılabildiği için form tarafı her zaman ≥ reklam
  tarafı). Süzgeç: `filtering=[{field:"time_created", operator:
  "GREATER_THAN"|"LESS_THAN"|"GREATER_THAN_OR_EQUAL", value:<unix>}]`.
- İsteğe bağlı onay kutusu cevapları `field_data` içinde **gelmiyor**; ayrı
  alan `custom_disclaimer_responses[{checkbox_key, is_checked}]`.
- CSV dışa aktarma: `https://www.facebook.com/ads/lead_gen/export_csv/?id=<FORM>&type=form&from_date&to_date`
  (unix). `from_date` yoksa ya da form oluşturulmadan önceyse form oluşturma
  zamanı; `to_date` yoksa şimdi. Satırda reklam kimliği yoksa: organik lead
  (`is_organic=1`), reklam önizlemesinden gönderim ya da isteyenin reklam
  hesabında yetkisi yok.
- Formda özel alan kimlikleri tanımlıysa dönen alan adları onlardır.

**Test ve sorun giderme**

- Test aracı (developers.facebook.com/tools/lead-ads-testing) Development
  modunda çalışmıyor; form başına **tek** test lead'i (yenisi için öncekini
  sil). "Track Status" ile webhook teslimi `pending` → `success`/`failed`
  (+`error_code`).
- API: `POST /{form_id}/test_leads` (o formda test lead'i olmamalı, Sayfa'da
  Advertiser+ rolü, Sayfa token'ı); ops. `field_data`,
  `custom_disclaimer_responses`. `GET /{form_id}/test_leads`. Silme
  `DELETE /{lead_id}` (yalnızca lead'in sahibi).
- Test lead'leri **organik** ve hiçbir reklama bağlı değil — reklam kimliğine
  göre eşleyen bir kod onları kaybeder.

### Arama reklamları (call ads)

- Kampanya: `OUTCOME_AWARENESS`, `OUTCOME_ENGAGEMENT`, `OUTCOME_LEADS`,
  `OUTCOME_SALES`, `OUTCOME_TRAFFIC`.
- Reklam seti: `destination_type: "PHONE_CALL"`, `optimization_goal:
  "QUALITY_CALL"`, `billing_event: IMPRESSIONS`. `promoted_object` hiç
  geçmiyor — **belgede belirsiz**.
- Kreatif: karusel, görsel, yalnız metin ve video destekli; `link_data.call_to_action
  {type: "CALL_NOW", value: {link: "tel:+<ülke kodu><numara>"}}`.
- Kısıtlar: hedef kitle **18+**; numara **hedef kitleyle aynı ülkeden**. Yerel
  reklam sayfası ayrıca: numara `+` ve ülke koduyla başlar, `+` dışında rakam
  olmayan karakter içermez; birden çok konum varsa hepsi aynı ülkede; **ücretli
  (premium) hat yasak**; telefon araması yapabilen cihaz için mobil hedefleme
  önerilir.
- Öneri: Sayfa ayarlarında açılış saatleri girilmiş olmalı.
- Geri arama formu: kreatifte `asset_feed_spec.call_ads_configuration.callback_type:
  "FORM"`. Talepler `GET /{ad_id}/leads` ile okunur — **form üzerinden
  okunamaz**.

### Etkinlik ve yerel reklamlar

- **Standart etkinlik reklamı:** kampanya `objective: EVENT_RESPONSES`, reklam
  seti `optimization_goal: EVENT_RESPONSES`; kreatif kökünde `object_type:
  "EVENT"` ve `object_story_spec.link_data {link, event_id}`.
- **Web sitesinden bilet (tıklama):** `OUTCOME_TRAFFIC` + `LINK_CLICKS`; CTA
  `BUY_TICKETS` + `value.link`. Etkinliğin bilet URL'si olmalı.
- **Web sitesinden bilet (dönüşüm):** kampanya `objective: CONVERSIONS`,
  `OFFSITE_CONVERSIONS`, `promoted_object {pixel_id, custom_event_type}`.
  Facebook üzerinde bilet satışında (yetkili bilet ortağı şart)
  `promoted_object` ayrıca `event_id` ve `application_id` taşıyor.
  `targeting.connections[{id}]` ile etkinliğe "Gidiyor" diyenler hedeflenebilir.
- `picture` verilmezse görsel etkinlik bağlantısından **kazınıyor**.
- Karusel: `link_data.link` son kartın, `child_attachments[].link` görsel
  kartların bağlantısı.
- **Eski objective adları:** `EVENT_RESPONSES` ve `CONVERSIONS` kampanya
  objective'i olarak bu sayfada duruyor; diğer bütün sayfalar `OUTCOME_*`
  kullanıyor. Geçerli olup olmadıkları **belgede çelişkili**.
- **Yerel reklam:** `OUTCOME_AWARENESS`; `optimization_goal: REACH`,
  `billing_event: IMPRESSIONS`, `promoted_object.page_id` zorunlu; hedeflemede
  `geo_locations` **ülke içermemeli**, bütün konumlar aynı ülkede. Örnek:
  `custom_locations[{latitude, longitude, radius, distance_unit, address_string}]`,
  `location_types: ["home","recent"]`, `excluded_geo_locations.zips`. Önerilen
  yarıçap: `GET /search?type=adradiussuggestion&latitude&longitude&distance_unit`
  → `suggested_radius`. Kreatif genellikle yayınlanmamış Sayfa gönderisi
  (`published=0`) + `object_story_id`; yalnızca `promoted_object`teki Sayfa'nın
  gönderisi; video gönderisi yalnızca `GET_DIRECTIONS` ile. `LEARN_MORE` dışında
  `link` Sayfa URL'si olmalı. CTA: `GET_DIRECTIONS` (`link: "fbgeo:<lat>,<lon>,\"<adres>\""`),
  `CALL_NOW` (`tel:`), `MESSAGE_PAGE` (değer yok; Messenger yazma kutusunu
  reklam görseli ekli açar).

### Mobil uygulama reklamları

- Ön koşul: uygulama Meta'ya kayıtlı (app ID), reklam bir Sayfa üzerinden.
- Metin `APP_INSTALLS`, `LINK_CLICKS`, `CONVERSIONS` kampanya objective'lerini
  sayıyor; Advantage+ katalog ve Audience Network örnekleri `OUTCOME_APP_PROMOTION`
  gönderiyor — **belgede çelişkili** (ODAX adı `OUTCOME_APP_PROMOTION`).
- Reklam seti: `promoted_object {application_id, object_store_url}` (+
  uygulama olayı için `custom_event_type`); hedeflemede **`user_os` zorunlu**,
  `device_platforms: ["mobile"]`. Masaüstü (canvas) uygulamada
  `device_platforms: ["desktop"]`.
- CTA türleri — mobil: `SHOP_NOW`, `BOOK_TRAVEL`, `LEARN_MORE`, `SIGN_UP`,
  `DOWNLOAD`, `INSTALL_MOBILE_APP`, `USE_MOBILE_APP`, `WATCH_VIDEO`,
  `WATCH_MORE`, `OPEN_LINK`; masaüstü: `USE_APP`, `PLAY_GAME`; sanal ürün:
  `BUY_NOW`, `GET_OFFER` (indirimli fiyat zorunlu). `value.link` mağaza URL'si
  (zorunlu), `value.app_link` mobil derin bağlantı, `value.product_link` sanal
  ürün, `value.link_title` ops.
- Karusel: tek uygulama, **en az 3 görsel** (normal karuselde 2), CTA zorunlu,
  bitiş kartı gösterilmiyor; her kartta aynı mağaza bağlantısı.
- Derin bağlantıyı kullanmadan önce `GET /?type=og&scrape=true&id=<APP_LINK>`
  ile taratılmalı.
- Reklamda `redownload=1` örneklerde var.
- Oynanabilir (playable): `POST /act_<ID>/adplayables` (`name`, `source`) →
  kreatifte `playable_asset_id`; yerleşim Facebook Akış + AN ödüllü video /
  geçiş; video en-boy ≥ 1.
- Bilinirlik hedefinde uygulamaya yönlendirme için kreatifte
  `template_url_spec.config.app_id`; **verilmezse reklam web sitesine gider.**
- Trafik hedefinde uygulamadan web'e düşme: `template_data.call_to_action.value
  {link, app_link, object_store_urls}`.
- Uygulama kurulum demografisi: `GET /<APP_ID>/insights/application_mobile_app_installs`
  (`breakdown`: `gender_age` | `country` | `locale`, birleştirilemez; uygulama
  token'ı). Yalnızca `promoted_object`'i app ID taşıyan reklamlar için.

### WhatsApp Durum reklamları ve "marketing messages"

- Durum = 24 saatte kaybolan, 9:16 dikey görsel/video akışı; sohbetlerden ayrı.
- Kısıtlar: **tek başına Durum kampanyası yok** — IG Hikâye
  (`instagram_positions: ["story"]`) de seçili olmalı; yalnızca tek görsel /
  tek video (karusel, koleksiyon, esnek format yok); özel reklam kategorileri
  (finans, istihdam, konut, sosyal konular/seçim/siyaset) ve hassas sektörler
  (ilaç, sağlık, GSI) dışarıda; A/B test, Dinamik Kreatif, Erişim ve Sıklık,
  Advantage+ Creative araçları uyumsuz. Bölge: EU, UK, İran, Küba, Suriye,
  Rusya, Kuzey Kore **hariç** küresel (Türkiye listede yok; canlıda
  doğrulanmalı).
- Objective → optimization_goal:
  - `OUTCOME_AWARENESS`: `REACH`, `IMPRESSIONS`, `THRUPLAY`
  - `OUTCOME_TRAFFIC`: `LINK_CLICKS`, `REACH`, `IMPRESSIONS`, `CONVERSATIONS`, `LANDING_PAGE_VIEWS`
  - `OUTCOME_ENGAGEMENT`: yukarıdakiler + `THRUPLAY`
  - `OUTCOME_LEADS`, `OUTCOME_SALES`: `LINK_CLICKS`, `REACH`, `IMPRESSIONS`, `CONVERSATIONS`, `LANDING_PAGE_VIEWS`
- Hedefler: WhatsApp sohbeti ya da web sitesi (web için WABA gerekmez).
- İzin: `ads_management` ya da BM üzerinden erişimde `business_management`.
- `targeting.user_age_unknown` (boolean, reklam seti hedeflemesinde, yalnızca
  Durum yerleşimine etki eder): Durum yerleşimi varken **verilmezse `true`**
  (Temmuz 2026'dan beri), Advantage+ yerleşimde de. `true` iken reklam her
  yaşa uygun olmalı. `false` teslimatı ciddi düşürebilir.
- Kimlik: kreatifte `wamo_whatsapp_identity_spec {wamo_whatsapp_identity_id,
  whatsapp_phone_number}` — ikisi verilirse aynı WhatsApp işletme profiline
  bağlı olmalı. Kimlik türleri: Sayfa kimliği (`PAGE_BACKED`, varsayılan),
  Sayfa WhatsApp Numarası kimliği (Phone/Business Link), WABA-to-Number
  kimliği (Business Connected). Kimlik verilmezse Sayfa kimliği gösterilir ve
  belge "bazı reklamlar Durum'a teslim edilmeyebilir" diyor.
- Kimlik **sonradan değiştirilemez**: `POST /<CREATIVE_ID>` yalnızca `status`,
  `name`, `ad_labels` kabul ediyor; yeni kreatif gerekir.
- Önizleme: `ad_format=WHATSAPP_STATUS_MEDIA` (`/previews`,
  `/generatepreviews`).
- Kimlik sayfasının "desteklenen yerleşim" tablosu yalnızca
  `publisher_platforms: ["whatsapp"]` gösteriyor, aynı sayfa IG Hikâye'nin
  zorunlu olduğunu söylüyor — **belgede çelişkili**; zorunluluk geçerli
  sayılmalı.
- **Marketing messages:** bu grupta yalnızca Messenger tarafı (CTS, günde en
  çok bir mesaj, açık rıza) anlatılıyor. WhatsApp pazarlama mesajları bu
  gruptaki sayfalarda **geçmiyor**.

### Audience Network

- Başka yayıncıların iOS/Android uygulamaları ve mobil siteleri. **Yalnızca
  AN'de yayın yok** — `publisher_platforms` içinde başka bir platform zorunlu.
- Desteklenen kreatif: mobil uygulama görsel/video, bağlantı ve video bağlantı
  reklamları, karusel bağlantı/uygulama, Advantage+ katalog. IAB boyutları yok.
- Objective listesi eski adlarla (`MOBILE_APP_INSTALLS`,
  `MOBILE_APP_ENGAGEMENT`, `LINK_CLICKS`, `CONVERSIONS`,
  `PRODUCT_CATALOG_SALES`), örnekler `OUTCOME_TRAFFIC` / `OUTCOME_APP_PROMOTION`
  — **belgede çelişkili**.
- Karuselde AN **yalnızca ilk iki kartı** verilen sırayla gösteriyor.
- Video yerleşimi: `audience_network_positions: ["classic", "instream_video"]`.
- Önizleme `ad_format`: `MOBILE_BANNER`, `MOBILE_INTERSTITIAL`, `MOBILE_NATIVE`,
  `MOBILE_MEDIUM_RECTANGLE`, `MOBILE_FULLWIDTH`, `AUDIENCE_NETWORK_INSTREAM_VIDEO`,
  `AUDIENCE_NETWORK_OUTSTREAM_VIDEO`, `AUDIENCE_NETWORK_INSTREAM_VIDEO_MOBILE`,
  `AUDIENCE_NETWORK_REWARDED_VIDEO`, `AUDIENCE_NETWORK_NATIVE_BANNER`,
  `MESSENGER_MOBILE_INBOX_MEDIA`; dönen iFrame **24 saat** geçerli.
- Örnek AN reklam seti `billing_event: LINK_CLICKS` kullanıyor (diğer türler
  `IMPRESSIONS`).

### Profil ziyareti reklamları

- **API'de sınırlı erişim, kademeli açılıyor.** Erişim yoksa Reklam Yöneticisi.
- Kampanya: `OUTCOME_ENGAGEMENT` ya da `OUTCOME_TRAFFIC`; özel reklam
  kategorisi **desteklenmiyor** (`NONE`/boş).
- Reklam seti: `billing_event: IMPRESSIONS`, `optimization_goal: PROFILE_VISIT`,
  `promoted_object.page_id`; `destination_type`: `FACEBOOK_PAGE`,
  `INSTAGRAM_PROFILE` (Sayfa'ya bağlı IG işletme hesabı şart),
  `INSTAGRAM_PROFILE_AND_FACEBOOK_PAGE`.
- Kreatif:
  - FB: `object_story_spec.page_id`, CTA `VISIT_PROFILE`, `value.link =
    https://www.facebook.com/<kullanıcı adı>`.
  - IG: `object_story_spec.instagram_user_id` (örnekte `page_id` yok), CTA
    `VIEW_INSTAGRAM_PROFILE`, `value.link = https://www.instagram.com/<kullanıcı adı>`.
  - Çoklu: `page_id` + `instagram_user_id` + `asset_feed_spec {call_to_actions:
    [VIEW_INSTAGRAM_PROFILE, VISIT_PROFILE], optimization_type:
    "UNIFIED_PROFILE_VISIT_DESTINATION"}`.
- Mevcut gönderiden: FB `object_story_id` + kök `call_to_action`; IG
  `object_id` + `instagram_user_id` + `source_instagram_media_id` +
  `object_type: "PHOTO"` + `body` + CTA.
- Görsel, video, karusel ve slayt gösterisi destekleniyor.

### Ortaklık (partnership) reklamları

**Ne:** reklam bir içerik üreticisinin/iş ortağının kimliğiyle (başlıkta iki
hesap) yayınlanıyor; iki hesabın sinyali sıralamada kullanılıyor.

**İzin modeli**

- **Hesap düzeyi (IG):** `POST /{business-account-id}/branded_content_ad_permissions`
  (`creator_instagram_account` ya da `creator_instagram_username`) → üretici IG
  uygulamasında onaylar. Onaydan sonra: üreticinin hesabından gönderisiz
  reklam, markayı etiketleyen her gönderiden reklam (ücretli ortaklık etiketi,
  @bahsetme, kişi/ürün etiketi, Collab), üreticinin kitlesini dahil/hariç
  tutma. Listeleme `GET` (+`creator_username`), `permission_status`
  (`APPROVED`, `PENDING`, `REVOKED` …); geri alma `revoke=true`. İzinler:
  `instagram_branded_content_ads_brand`, `instagram_basic`,
  `business_management`; IG işletme hesabında en az `ADVERTISER` rolü.
- **Hesap düzeyi (FB):** `https://api.facebook.com/partnership-ads/fb-account-level-permissions/<PAGE_ID>`
  (Bearer + `X-API-Version: 1.0.0`). `GET` süzgeçleri `status` (1
  `PENDING_APPROVAL`, 2/7 `APPROVED`, 3 `REJECTED`, 4 `REVOKED`, 5
  `SELF_REMOVED`, 6 `CANCELED`), `partner_page_ids`, `permission_direction`
  (`sent`/`received`), `offset`, `limit` (≤ 1000). `POST` gövdesi eylem dizisi:
  `send-request`, `cancel-request`, `accept-request`, `reject-request`,
  `remove-permission` (örnek `revoke-permission` kullanıyor — **belgede
  çelişkili**). İzin `facebook_branded_content_ads_brand`.
- **Gönderi düzeyi:** marka tarafında onaylı üretici listesi
  `GET|POST|DELETE /{user-id}/branded_content_tag_approval` (`user_ids`, sorguda
  ≤ 100) — biri bile başarısızsa `false` döner ve **hiçbiri** işlenmez. Üretici
  tarafında `GET|POST /{ig-media-id}/branded_content_partner_promote`
  (`sponsor_id`, `permission: true|false`). İzinler `instagram_basic`,
  `instagram_branded_content_brand` / `instagram_branded_content_creator`,
  Advanced Access.
- **Reklam kodu:** üretici `POST /{ig-media-id}/partnership_ad_code` → `ad_code`
  (silme `DELETE`). Arşivlenmiş içerik ve gizli Collab gönderileri de boost
  edilebiliyor; reklam üreticinin profilinde görünmez ama Reklam
  Kütüphanesi'nde listelenir. Daha önce boost edilmiş organik içerik artık
  düzenlenemez (tekrar boost edilebilir). İzinler: `instagram_basic`,
  `instagram_branded_content_creator`, `business_management`.
- Aynı işletmeye ait iki hesap ve ikisine reklam erişimi olan çalışan → izin
  gerekmiyor.

**İçerik keşfi**

- Yeni birleşik uç: `GET /{business-id}/partnership-ads-advertisable-content`
  (`fb_page_id` ve/veya `ig_user_id`; ikisi verilirse birbirine bağlı olmalı).
  Süzgeçler: `ad_partner_ig_user_ids`, `ad_partner_page_ids`, `platform_types`,
  `media_types` (`IMAGE`/`VIDEO`/`CAROUSEL`/`LINK`), `post_types`
  (`FEED`/`STORY`/`REEL`), `content_types` (`BRANDED_CONTENT`, `PRODUCT`,
  `AFFILIATE`, `COLLAB_POST`, `TAGGED`, `REPOSTED`), `ad_eligibilities`
  (`AD_READY`, `INELIGIBLE`, `NEEDS_ATTENTION`, `EXCLUDED`), `ad_usages`
  (`NEVER_USED`, `ACTIVE`, `PREVIOUSLY_USED`), `country_codes`,
  `start_date`/`end_date` (ikisi birlikte), `search_key`, `sort_by`
  (`RECOMMENDED` varsayılan / `DATE`), `is_recommended`. Doğrudan arama
  (`content_ids` / `permalinks` / `ad_codes`, ≤ 50, tek tür, süzgeçle
  birleşmez, sayfalama yok). `limit` 1–50 (varsayılan 25), yalnızca ileri
  imleç (`before` → 400). Varsayılan yalnızca `content_id` döner; diğer alanlar
  `fields` ile (`platform`, `caption`, `author{…}`, `partnership_info{ad_eligibility,
  tagged_partner, permission_status, permission_type, ad_code, content_types}`,
  `organic_insights{likes, comments, views, reach, shares, interaction, saves}`).
  Brand kapsamı: `business_management` + en az biri
  `facebook_branded_content_ads_brand` / `instagram_branded_content_ads_brand`
  (ikincisi `instagram_basic` olmadan 403).
- Eski uçlar **1 Aralık 2026'da kaldırılıyor**:
  `/{instagram-id}/branded_content_advertisable_medias` ve
  `/partnership-ads/{sponsor-page-id}/advertisable-posts`.
- Öneriler: yalnızca ücretli ortaklık etiketli içerik, 3 günlük gecikme, son 60
  gün; `recommended_campaign_objectives` döner (gösterim → AWARENESS;
  etkileşim → ENGAGEMENT/TRAFFIC/LEADS; dönüşüm → APP_PROMOTION/SALES).

**Kreatif alanları**

- `facebook_branded_content.sponsor_page_id`, `instagram_branded_content.sponsor_id`
  (ikincil kimlik), `object_id` (markanın Sayfası), `source_instagram_media_id`
  ya da FB için `object_story_id = "<CREATOR_PAGE_ID>_<POST_ID>"`.
- `branded_content` nesnesi: `ad_format` (`1` iki kimlik — varsayılan, `2`
  yalnızca ilki, `3` otomatik; otomatik seçim **yalnızca Instagram'da**
  çalışıyor), `instagram_boost_post_access_token` / `facebook_boost_post_access_token`
  (reklam kodu), `testimonial` (öne çıkan yorum), `promoted_page_id`,
  `parent_source_instagram_media_id` / `parent_source_facebook_post_id`
  (katalog giriş kartı).
- Birincil kimlik = `object_story_spec.page_id`. Üreticinin FB Sayfası yoksa
  markanın Sayfası verilebilir ama **Facebook'a teslim edilmez**.
- Yalnızca `sponsor_id` ya da yalnızca `sponsor_page_id` verilirse Meta
  karşılığını bağlıyor; IG↔FB arasında sağlam bağ yoksa **o platforma teslim
  edilmez**.
- Desteklenen yapılandırmalar: Yerleşim varlık özelleştirme
  (`asset_feed_spec.optimization_type: "PLACEMENT"` + `asset_customization_rules`),
  Advantage+ Creative (standard enhancements, ürün uzantıları), tıkla-mesaj
  hedefleri (CTA `value.app_destination`), Advantage+ katalog (karusel/koleksiyon;
  `canvas_existing_post`, `hero_asset_instagram_media_id`/`hero_asset_facebook_post_id`),
  referanslar, lead. Lead kısıtı: form **tebrik kartı (greeting card)**
  biçiminde ve reklam setindeki Sayfa'ya ait olmalı.
- Video hatası "Instagram Video Must Be Uploaded To Facebook": `POST
  /act_<ID>/advideos` (`source_instagram_media_id`, `partnership_ad_ad_code`,
  `is_partnership_ad=true`).
- Yorum moderasyonu: `POST /{comment-id}` `is_hidden=true|false` (yalnızca Sayfa
  gönderisi yorumları).
- İzinler (oluşturma): `ads_management`, `business_management`,
  `instagram_basic`, `instagram_branded_content_ads_brand`,
  `pages_read_engagement`, `pages_show_list`, `create_ads`; FB boost için
  `facebook_branded_content_ads_brand`.

### Threads reklamları

- Threads hesap kimliği üç yoldan: **IG ile ilişkili** (aynı kullanıcı adı,
  aynı Business Portfolio; `GET /<IG_USER_ID>/connected_threads_user?fields=threads_user_id`),
  **IG destekli** (`POST|GET /<IG_USER_ID>/instagram_backed_threads_user`),
  **Sayfa destekli** (`POST /<PAGE_ID>/page_backed_threads_accounts`, okuma
  `GET /<PAGE_ID>?fields=page_backed_threads_account_id`; yalnızca Sayfa
  destekli IG kullanılıyorsa). Destekli hesaplara giriş yapılamaz. Her IG
  hesabının / Sayfa'nın türüne göre tek Threads hesabı; oluşturma çağrısı varsa
  mevcut kimliği döndürüyor.
- 29 Ocak 2026 öncesi IG ile ilişkili Threads hesapları Portfolio'ya otomatik
  eklendi; sonrası elle eklenmeli.
- IG hesabı reklam veremiyorsa Threads'te de veremez. İzinler (IG ile ilişkili):
  `instagram_basic`, `threads_business_basic`, `pages_read_engagement` (+ rol
  BM üzerindense `ads_management`/`ads_read`).
- Objective: `OUTCOME_AWARENESS`, `OUTCOME_TRAFFIC`, `OUTCOME_ENGAGEMENT`,
  `OUTCOME_SALES`. Yerleşim: `publisher_platforms` içinde `instagram` +
  `threads`, `threads_positions: ["threads_stream"]` seçilecekse
  `instagram_positions: ["stream"]` **şart**.
- Kreatif: `instagram_user_id` (object_story_spec içinde), `threads_user_id`
  (object_story_spec içinde ya da kökte), `page_id`. IG ile ilişkili / IG
  destekli hesapta o IG hesabı kullanılmalı. Sayfa bilgisi Threads reklamında
  görünmez.
- Medya: görsel, video, karusel. Metin ≤ 1000 karakter (önerilen 80–160);
  görsel genişliği ≥ 500 px; en-boy 1.91:1–9:16, 4:5'ten uzun olan 4:5'e
  kırpılıyor; karusel görselleri 1:1 dışındaysa 1:1'e kırpılıyor. Reklam başına
  ≤ 30 hashtag — ama aynı sayfa "metinde hashtag ve URL desteklenmez" diyor
  (**belgede çelişkili**).
- Karusel: kartlarda CTA düğmesi yok (başlık CTA metninin yerine geçer), her
  kartta `link` ve `picture`/`image_hash` zorunlu (üst `link_data`'dan
  kalıtılmıyor), inline en çok 10 kart.
- Mevcut gönderi: FB/IG gönderisi Threads reklamı olabilir; **Threads organik
  gönderisi olamaz**; partnership boost Threads'te yok; telif müzik/filtre
  içeren medya olmaz; etkileşim kaynağa geri yansımaz.
- Advantage+ katalog: yalnızca görsel ve görsel karusel; ürün videoları
  render edilmez; giriş statik kartı varsa Threads'e **hiç** gitmez;
  etkileşim (yanıt, alıntı, kaydet, paylaş) kapalı; `OUTCOME_APP_PROMOTION` yok.
- Uygulama reklamı: mobil kurulum/etkileşim var, masaüstü yok; playable video
  olarak görünür.
- Insights: `breakdowns=publisher_platform,platform_position` → Threads için
  tek değer `threads_feed`. Dış takip için `url_tags` ile `utm_source=threads`
  ya da `SITE_SOURCE_NAME` makrosu.
- Yanıt moderasyonu: `GET /{media-id}` ve `/{media-id}/replies` (alanlar:
  `caption`, `like_count`, `reply_count`, `share_count`, `quote_count`,
  `repost_count`, `hide_status` `HUSHED`/`UNHUSHED`, `timestamp`, `media_url`,
  `media_type`…), gizleme `POST /{reply-id}/manage_reply` (`hide`), yanıt ekleme
  `POST /{reply-id}/add_reply` (`text`; yalnızca metin). Yalnızca doğrudan
  yanıtlar; katalog, boost edilmiş gönderi, IG/Sayfa destekli hesap reklamları
  desteklenmiyor. Okuma `ads_read`, yazma `ads_management`.
- Teslimat Meta tarafından bilerek düşük tutuluyor.

### Çoklu medya (multi-media) reklamları

- Tek reklamda en çok **10** görsel+video; reklam `POST /act_<ID>/ads` ile
  inline kreatifle.
- `object_story_spec`'teki birincil medya (`link_data.image_hash` ya da
  `video_data.video_id`) `media_sourcing_spec` içinde de **olmalı**; aynı
  hash/video iki kez → ret; `related_media` ile açık `images`/`videos`
  dizileri birlikte kullanılamaz.
- `media_sourcing_spec.images[]`: `hash` (ya da `url`), `source:
  "multi_media"`, `opt_in_status: "opt_in"`; `videos[]`: `video_id`,
  `original_video_id`, `source`, `opt_in_status`, `thumbnail_url`,
  `thumbnail_source` (`generated_default`/`custom`).
- Özelleştirmeler (medya başına): `text_customizations {titles, bodies,
  descriptions}` (köke yazılan genel metni ezer), `destination_customizations
  [{url, display_url}]`, `placement_customizations [{publisher_platform
  (facebook/instagram/audience_network/messenger/whatsapp/threads),
  placement_exclusions[]}]`, `image_crops [{type (manual/auto_crop/smart_crop/super_crop),
  crop_spec {"100x100": [[x,y],[x,y]], …}}]`. Kökteki `titles`/`bodies`/
  `descriptions` sistemin kombinasyon denemesi için.
- Okuma: `GET /<AD_ID>?fields=creative{media_sourcing_spec}`.

### Omnichannel (mağaza + site) reklamları

- Resmî destek Reklam Yöneticisi'nde; API "kurulum için kullanılabilir".
  Hesap uygun değilse `3858449`.
- Kampanya yalnızca `OUTCOME_SALES` (`2446432`); `promoted_object.product_catalog_id`
  kampanya düzeyinde Advantage+ katalog'u açar.
- Reklam seti: `optimization_goal: OFFSITE_CONVERSIONS` (`3858454`);
  `attribution_spec` yalnızca `CLICK_THROUGH` 7 gün + `VIEW_THROUGH` 1 gün
  (`3858453`); `promoted_object.omnichannel_object {pixel:[{pixel_id,
  custom_event_type:"PURCHASE"}], offline:[{offline_conversion_data_set_id,
  custom_event_type:"PURCHASE"}]}` — tek veri kümesi kullanılıyorsa iki alana da
  aynı kimlik (`3858513`); olay türü yalnızca `PURCHASE` (`3858451`).
  Katalogla: `product_set_id` + `variation: "PRODUCT_SET_AND_IN_STORE"`; web +
  uygulama + mağaza: `variation: "PRODUCT_SET_WEBSITE_APP_AND_INSTORE"` (o zaman
  `omnichannel_object` yok).
- Kreatif: `degrees_of_freedom_spec.creative_features_spec.local_store_extension
  {enroll_status: "OPT_IN"}` (mağaza konumları; katalog dışı reklamlarda);
  mağaza bazlı yerel envanter katalogu için `recommender_settings
  {product_sales_channel: "omni"}`. Esnek format (`3858455`) ve mevcut gönderi
  / Creative Hub mockup'ı (`3858456`) desteklenmiyor.
- Diğer alt kodlar: `3858450` geçersiz Pixel, `3858452` geçersiz offline veri
  kümesi, `3858514`/`3858515` birleşik veri kümesi sorunları.

### `asset_feed_spec`: dinamik kreatif ve varlık özelleştirme

- İki kullanım: **otomatik** (Dinamik Kreatif — kural yok) ve **elle**
  (varlık özelleştirme kuralları: yerleşim, çok dilli, segment). Ayrıca
  yukarıdaki tıkla-mesaj (`DOF_MESSAGING_DESTINATION`), profil ziyareti,
  arama geri dönüşü ve web→mesaj uzantısı da aynı alanı kullanıyor.
- Seçenekler: `images` (`hash`/`url`, `url_tags`; SINGLE_IMAGE ve
  CAROUSEL_IMAGE'da zorunlu), `videos` (`video_id`, `thumbnail_url`,
  `url_tags`; SINGLE_VIDEO'da zorunlu), `carousels`, `bodies`, `titles`,
  `descriptions`, `call_to_action_types` (AWARENESS hariç zorunlu, ≤ 5),
  `link_urls` (zorunlu; `website_url`, ops. `deeplink_url`), `ad_formats`
  (zorunlu; `SINGLE_IMAGE`, `CAROUSEL`, `SINGLE_VIDEO`, `AUTOMATIC_FORMAT` —
  feed başına tek), `optimization_type`, `message_extensions`,
  `onsite_destinations` / `shops_bundle` / `reasons_to_shop` (Shops).
- Sınırlar: toplam ≤ 30 varlık; görsel ≤ 10, video ≤ 10, gövde ≤ 5, CTA ≤ 5,
  başlık ≤ 5, bağlantı ≤ 5, açıklama ≤ 5. Başlık/açıklama ≤ 255, gövde ≤ 1024
  karakter. CAROUSEL_IMAGE için ≥ 2 görsel. IG yerleşiminde yalnızca kare/yatay
  video.
- Uygulama kurulumu optimizasyonunda `link_urls` **tek** olmalı ve
  `promoted_object.object_store_url` ile aynı.
- Düzenleme: varlık eklenip çıkarılabilir (yeni kreatifle), ama **format
  değiştirilemez** ve asset feed'li kreatif normal kreatife çevrilemez.
- Dinamik Kreatif: objective `OUTCOME_*` altısından biri, `buying_type
  AUCTION`; reklam setinde `is_dynamic_creative: true`; belge
  SALES/ENGAGEMENT/LEADS/TRAFFIC için `optimization_goal: OFFSITE_CONVERSIONS`
  "zorunlu" diyor (bu, CTWA/lead gibi yollarla bağdaşmıyor — **belgede
  belirsiz**). Reklam seti **boş** olmalı, **reklam seti başına tek reklam**;
  reklam silinemez/arşivlenemez, reklam seti silinmeli. Messenger
  `sponsored_messages` dışındaki bütün yerleşimler. 10'dan fazla görselle
  karusel 10 kart. Karuselde `BODY_LABEL`, `CALL_TO_ACTION_TYPE_LABEL`,
  `LINK_URL_LABEL`, `CAPTION_LABEL`, `AD_FORMAT_LABEL` kullanılamaz. Görsel
  başına tek kırpma, bütün yerleşimlere uygulanır. İnceleme sonucu reklam
  setinde `review_feedback` (boş dizi = geçti; aksi hâlde varlık bazlı
  `reason`, ör. `ALCOHOL`). `asset_feed_id` yalnızca v3.1 ve öncesi.
- Varlık özelleştirme: reklam setinde `is_dynamic_creative: false`; "asset feed
  kullanan bütün reklamlar en az iki hedef özelleştirme kuralı içermeli"
  deniyor — Dinamik Kreatif ve tıkla-mesaj örnekleriyle **çelişkili**; kural
  yalnızca `asset_customization_rules` kullanan kurgular için geçerli sayılmalı.
  Kural tablosundaki objective'ler eski adlarla (`APP_INSTALLS`,
  `BRAND_AWARENESS`, `CONVERSIONS`, `LEAD_GENERATION`, `LINK_CLICKS`, `REACH`,
  `VIDEO_VIEWS`).
- Insights kırılımları: `body_asset`, `description_asset`, `image_asset`,
  `title_asset`, `call_to_action_asset`, `link_url_asset`, `video_asset`,
  `ad_format_asset`; yalnızca `age`, `gender` ya da ikisiyle birleşiyor.
  Dinamik Kreatif'te tam kombinasyon kırılımı API'de yok (yalnızca Reklam
  Yöneticisi'nde). Karuselde kart içi varlıkların gösterim metrikleri ilk karta
  toplanıyor.

## API çağrıları

Örnekler kısaltılmıştır; erişim belirteci ve isim alanları atlandı.

| İş | Uç nokta | Yöntem | Zorunlu / kritik alanlar |
|---|---|---|---|
| Kampanya | `/act_<ID>/campaigns` | POST | `name`, `objective`, `special_ad_categories`, `status` (her zaman `PAUSED` gönder) |
| Reklam seti | `/act_<ID>/adsets` | POST | `campaign_id`, `billing_event`, `optimization_goal`, `destination_type`, `promoted_object`, `targeting`, bütçe, `status` |
| Kreatif | `/act_<ID>/adcreatives` | POST | `object_story_spec` ya da kök `object_id`+`source_instagram_media_id` / `object_story_id` |
| Reklam | `/act_<ID>/ads` | POST | `name`, `adset_id`, `creative{creative_id}` (ya da inline), `status` |
| Yayın | `/<AD_ID>` | POST | `status=ACTIVE` → `effective_status=PENDING_REVIEW` |
| Lead formu | `/{page_id}/leadgen_forms` | POST/GET | `name`, `questions` |
| Form arşivi | `/{form_id}` | POST | `status=ARCHIVED` / `ACTIVE` |
| Messenger lead şablonu (v24+ API'de kalkıyor) | `/{page_id}/messenger_lead_forms` | POST/GET | `privacy_url`, `template_name`, `reminder_text`, `step_list` |
| Lead detayı | `/{leadgen_id}` | GET | ops. `fields=custom_disclaimer_responses` |
| Toplu lead | `/{ad_id}/leads`, `/{form_id}/leads` | GET | ops. `filtering` (time_created) |
| Lead CSV | `www.facebook.com/ads/lead_gen/export_csv/` | GET | `id`, `type=form`, `from_date`, `to_date` |
| Webhook kurulumu | `/{page_id}/subscribed_apps` | POST/GET | `subscribed_fields=leadgen` (Sayfa token'ı) |
| Test lead | `/{form_id}/test_leads` | POST/GET | ops. `field_data`, `custom_disclaimer_responses` |
| Lead silme | `/{lead_id}` | DELETE | yalnızca sahibi |
| Yarıçap önerisi | `/search?type=adradiussuggestion` | GET | `latitude`, `longitude`, `distance_unit` |
| IABP | `/act_<ID>/connected_instagram_accounts_with_iabp` | GET | `fields=iabp_id`, `business_id` |
| Playable | `/act_<ID>/adplayables` | POST | `name`, `source` |
| App kurulum içgörüsü | `/<APP_ID>/insights/application_mobile_app_installs` | GET | ops. `breakdown` |
| Durum önizleme | `/<CREATIVE_ID>/previews` | GET | `ad_format=WHATSAPP_STATUS_MEDIA` |
| Threads kimliği | `/<IG_USER_ID>/connected_threads_user`, `/<IG_USER_ID>/instagram_backed_threads_user`, `/<PAGE_ID>/page_backed_threads_accounts` | GET/POST | — |
| Threads yanıtları | `/{media-id}/replies`, `/{reply-id}/manage_reply`, `/{reply-id}/add_reply` | GET/POST | `hide`, `text` |
| Partnership izni (IG) | `/{business-account-id}/branded_content_ad_permissions` | POST/GET | `creator_instagram_account`\|`creator_instagram_username`, `revoke` |
| Partnership izni (FB) | `api.facebook.com/partnership-ads/fb-account-level-permissions/<PAGE_ID>` | GET/POST | eylem dizisi |
| Onaylı üretici listesi | `/{user-id}/branded_content_tag_approval` | GET/POST/DELETE | `user_ids` |
| Gönderi boost izni | `/{ig-media-id}/branded_content_partner_promote` | GET/POST | `sponsor_id`, `permission` |
| Reklam kodu | `/{ig-media-id}/partnership_ad_code` | POST/DELETE | — |
| İçerik keşfi | `/{business-id}/partnership-ads-advertisable-content` | GET | `fb_page_id`\|`ig_user_id`, `fields` |
| IG videoyu FB'ye | `/act_<ID>/advideos` | POST | `source_instagram_media_id`, `partnership_ad_ad_code`, `is_partnership_ad` |
| Yorum gizleme | `/{comment-id}` | POST | `is_hidden` |

Kısa örnek gövdeler:

```jsonc
// CTWA reklam seti
{ "campaign_id": "<C>", "billing_event": "IMPRESSIONS",
  "optimization_goal": "CONVERSATIONS", "destination_type": "WHATSAPP",
  "promoted_object": { "page_id": "<PAGE>" },
  "daily_budget": "<MINOR_UNITS>", "status": "PAUSED", "targeting": { … } }

// CTWA kreatif
{ "object_story_spec": { "page_id": "<PAGE>", "link_data": {
    "image_hash": "<H>", "link": "https://api.whatsapp.com/send",
    "message": "<metin>", "page_welcome_message": { … },
    "call_to_action": { "type": "WHATSAPP_MESSAGE",
                        "value": { "app_destination": "WHATSAPP" } } } },
  "degrees_of_freedom_spec": { "creative_features_spec": {
    "standard_enhancements": { "enroll_status": "OPT_OUT" } } } }  // açıkça

// Çoklu hedef kreatif (ek kısım)
{ "asset_feed_spec": { "optimization_type": "DOF_MESSAGING_DESTINATION",
  "call_to_actions": [
    { "type": "MESSAGE_PAGE", "value": { "app_destination": "MESSENGER", "link": "https://fb.com/messenger_doc/" } },
    { "type": "WHATSAPP_MESSAGE", "value": { "app_destination": "WHATSAPP", "link": "https://api.whatsapp.com/send" } } ] } }

// Lead reklam seti + kreatif
{ "optimization_goal": "LEAD_GENERATION", "destination_type": "ON_AD",
  "billing_event": "IMPRESSIONS", "promoted_object": { "page_id": "<PAGE>" } }
{ "object_story_spec": { "page_id": "<PAGE>", "link_data": {
    "link": "https://fb.me/", "image_hash": "<H>", "message": "<metin>",
    "call_to_action": { "type": "SIGN_UP", "value": { "lead_gen_form_id": "<F>" } } } } }

// Arama reklamı
{ "destination_type": "PHONE_CALL", "optimization_goal": "QUALITY_CALL", "billing_event": "IMPRESSIONS" }
{ "call_to_action": { "type": "CALL_NOW", "value": { "link": "tel:+90XXXXXXXXXX" } } }

// Web → WhatsApp (yalnızca inline POST /ads)
{ "adset_id": "<AS>", "status": "PAUSED", "creative": {
  "object_story_spec": { "page_id": "<PAGE>", "link_data": { "link": "<SITE>", "image_hash": "<H>",
    "call_to_action": { "type": "LEARN_MORE", "value": { "link": "<SITE>" } } } },
  "asset_feed_spec": { "message_extensions": [ { "type": "whatsapp" } ] } } }
```

## Tuzaklar ve sessiz hata riskleri

**Sessiz (hata yok, yanlış sonuç)**

- **Reklam seti `status` verilmezse `ACTIVE`.** Kampanya `ACTIVE` örnekleri
  kopyalanırsa onay adımı atlanmış olur. Her seviyede `PAUSED` gönder.
- **Karşılama mesajı verilmezse İngilizce varsayılan** ("Hello! Can I get
  more info on this?") müşterinin WhatsApp/Messenger kutusuna düşer.
- **Threads metni > 1000 karakter:** reklam oluşturma BAŞARILI, IG'de yayında,
  Threads'e hiç teslim yok. Kontrol giriş anında, Advetics'te yapılmalı.
- **Threads yerleşimi açıkken yeni uyumlu formatlar kendiliğinden Threads'e
  gider**; Threads katalog reklamında giriş statik kartı varsa Threads'e
  hiç gitmez; ürün videoları görsele düşer.
- **WhatsApp Durum `user_age_unknown` varsayılanı `true`** — WhatsApp'ta yaş
  bilgisi olmayan kişiler kitleye giriyor (Advantage+ yerleşimle de) ve reklam
  her yaşa uygun olmak zorunda. Açıkça yazılmalı.
- **WhatsApp Durum kimliği verilmezse** Sayfa kimliği gösterilir ve "bazı
  reklamlar Durum'a teslim edilmeyebilir" — hata yok.
- **Partnership:** izin yokken yayınlanan reklam "beklemede teslim" durumunda
  bekler (üreticiye istek gider); sponsor IG↔FB bağı yoksa o platforma; üretici
  FB Sayfası yoksa Facebook'a teslim edilmez. `ad_format: 3` yalnızca IG'de
  optimize eder.
- **Partnership toplu izin `POST`'u 200 dönüp öğe bazında `failure` taşıyabilir**;
  onaylı üretici listesi ise biri bozuksa hepsini reddedip yalnızca `false`
  döner. Yanıt öğe öğe okunmalı.
- **Çoklu hedef / çoklu profil:** Meta kişiyi istediği kanala gönderir; IG
  hesabı Sayfa'ya bağlı değilse IG ayağı düşer (belge "teslim için gerekli"
  diyor, hata vermez).
- **Audience Network karuseli yalnızca ilk iki kart.** Kart sırası anlam
  taşıyorsa (ör. fiyat kartı sonda) AN'de görünmez.
- **Açıklama/görsel kazıma:** `asset_feed_spec.descriptions` verilmezse Meta
  bağlantıdan açıklama kazır (boş istiyorsan tek boşluk); etkinlik
  reklamında `picture` yoksa görsel kazınır.
- **Uygulama + Bilinirlik:** `template_url_spec.config.app_id` verilmezse
  reklam uygulamaya değil siteye gider.
- **Lead okumada eksik veri:** onay kutusu cevapları `field_data`'da yok;
  test lead'leri ve organik lead'ler reklam kimliği taşımıyor; Development
  modunda lead okunmuyor; Leads Access Manager özelleştirilmişse Sayfa
  yöneticisi bile okuyamıyor. Dördü de "lead gelmiyor" gibi görünür ve ayrı
  ayrı söylenmeli (`emptyReason` deseni).
- **Webhook tek bildirimde birden çok lead taşıyor** (`changes[]`) ve birkaç
  dakika gecikebiliyor; yalnızca ilk `change`i işleyen kod lead kaybeder.
  Bildirim yalnızca uygulama Sayfa'ya kuruluysa ve Sayfa'da "App" platformu
  açıksa gelir.
- **Ulusal kimlik sorusu ülke dışı hedeflemeyle** reklamı onaydan geçirmiyor
  (oluşturmada değil incelemede).
- **Omnichannel resmî örneği `countries` + `regions` + `cities`'i birlikte
  gönderiyor** — Advetics'in canlı bilgisiyle bu ülke geneli demek.
- **Dinamik Kreatif'te kombinasyon kırılımı API'de yok**; karusel kart içi
  metrikler ilk karta toplanıyor — kart bazlı rapor yanıltır.

**Belge içi çelişkiler (canlıda doğrulanmadan kod yazılmamalı)**

- Tıkla-mesaj `destination_type`: CTWA/CTM/CTIG sayfaları `WHATSAPP` /
  `MESSENGER` / `INSTAGRAM_DIRECT`; web→mesaj sayfası `MESSAGING_WHATSAPP` /
  `MESSAGING_MESSENGER` / `MESSAGING_INSTAGRAM_DIRECT`. Canlı bilgi birincisini
  doğruluyor.
- IG kimlik alanı: CTIG `instagram_actor_id`, diğerleri `instagram_user_id`.
- CTM: "`object_story_id` desteklenmez" ↔ aynı sayfada `object_story_id`
  örneği.
- WhatsApp Durum örneklerinde `app_destination: "whatsapp"` (küçük harf);
  CTWA'da `"WHATSAPP"`.
- Eski objective adları (`EVENT_RESPONSES`, `CONVERSIONS`, `APP_INSTALLS`,
  `LINK_CLICKS`, `MOBILE_APP_*`, `PRODUCT_CATALOG_SALES`, `BRAND_AWARENESS`,
  `LEAD_GENERATION`, `VIDEO_VIEWS`) metinlerde, `OUTCOME_*` örneklerde.
- "Asset feed kullanan her reklam ≥ 2 özelleştirme kuralı" ↔ kuralsız Dinamik
  Kreatif ve tıkla-mesaj örnekleri.
- Threads: "≤ 30 hashtag" ↔ "metinde hashtag desteklenmez".
- FB partnership izin eylemi: `remove-permission` ↔ `revoke-permission`.
- `bid_amount` bazı sayfalarda koşulsuz zorunlu, bazılarında yalnızca tavanlı
  stratejide.
- Lead formu arşiv örneği `GET` ile yazılmış; lead reklam seti örneği
  `promoted_object`'i çıplak dizge gönderiyor; CTWA reklam seti tablosunda
  `optimization_goal` örnek değeri `OUTCOME_SALES`.

**Geri alınamaz / kısıtlı işlemler**

- Lead formu silinemez (arşiv), Messenger lead şablonu düzenlenemez/silinemez.
- Dinamik Kreatif reklamı silinemez/arşivlenemez (reklam seti silinir), reklam
  seti başına tek reklam.
- WhatsApp Durum kimliği ve asset feed formatı sonradan değişmez.
- Boost edilmiş organik IG içeriği artık düzenlenemez.
- Partnership izin isteği üreticiye bildirim olarak gider (dış etki).

## Advetics'in canlı bilgisiyle karşılaştırma

| # | Canlı bilgi | Bu grupta | Sonuç |
|---|---|---|---|
| 1 | Boost'ta `destination_type` yoksa ret; doğru değer `ON_POST` | `ON_POST` bu grupta geçmiyor. Ama her tür sayfası `destination_type`'ı **Required** yazıyor (WHATSAPP, MESSENGER, INSTAGRAM_DIRECT, MESSAGING_*, ON_AD, PHONE_CALL, FACEBOOK_PAGE, INSTAGRAM_PROFILE, INSTAGRAM_PROFILE_AND_FACEBOOK_PAGE, WEBSITE/UNDEFINED) | Desen olarak **uyuşan** |
| 2 | `geo_locations` kovaları birleşim | Yerel reklam sayfası "ülke içermesin, hepsi aynı ülke" diyor (uyumlu); omnichannel örneği US + bölge + şehir birlikte gönderiyor (tuzağa düşen örnek) | **Uyuşan** (dolaylı); belge örneği güvenilmez |
| 3 | IG gönderisi `source_instagram_media_id` + `instagram_user_id` + `object_id` ile; `object_story_id` ile olmaz | CTWA, CTM, CTIG, çoklu hedef, profil ziyareti, Threads, partnership hepsi bu üçlüyü kullanıyor; IABP kimliği `object_id` yerine geçebiliyor | **Uyuşan** (+ yeni: IABP) |
| 4 | Kreatif `image_url`/`thumbnail_url` imzalı ve ölüyor | Bu grupta geçmiyor. CTM/arama/etkinlik örnekleri `image_url`/`picture` ile URL veriyor; Threads `media_url`, partnership `profile_picture_url` CDN adresi — kalıcılığı söylenmiyor | **Belgede geçmiyor**; aynı varsayım (saklanamaz) korunmalı |
| 5 | `?ids=` tek kötü kimlik bütün isteği düşürüyor | Geçmiyor. Partnership doğrudan aramada `content_ids` ≤ 50 | **Belgede geçmiyor** |
| 6 | CTWA: `WHATSAPP` + `promoted_object.page_id` + `api.whatsapp.com/send` + `{app_destination: "WHATSAPP"}` | CTWA sayfası **birebir aynı**; numara `promoted_object.whatsapp_phone_number` ile isteğe bağlı (sorulmaması doğru). Web→mesaj sayfası `MESSAGING_WHATSAPP` diyor; Durum sayfası küçük harf `whatsapp` | **Uyuşan**; iki çelişki canlı bilgi lehine çözülmeli |
| 7 | `limit=500` → "reduce the amount of data" | Geçmiyor. Partnership keşfinde `limit` ≤ 50, FB izin listesinde ≤ 1000 | **Belgede geçmiyor** |
| 8 | Insights'ta atıf ayarları açıkça gönderiliyor | Omnichannel reklam setinde `attribution_spec` yalnızca 7g tık + 1g görüntüleme kabul ediyor — atıf **reklam setinde** de kilitli olabiliyor | **Uyumlu** (yeni bilgi: tür bazlı zorunlu atıf) |
| 9 | `age_max = 65` = "65 ve üzeri" | Web→mesaj örneği `age_max: 65` gönderiyor, anlamı yazılmıyor; arama reklamı 18+ zorunlu; Durum'da yaşı bilinmeyenler | **Belgede geçmiyor** (anlam) |
| 10 | `image_hash` hesap başına | Asset feed ve çoklu medya görsellerin hesabın görsel kütüphanesinde olmasını istiyor | **Uyuşan** |
| 11 | `adinterest` kısa terimle; büyüklük dünya geneli | Geçmiyor (omnichannel örneği `flexible_spec.interests` taşıyor) | **Belgede geçmiyor** |
| 12 | Organik istatistik adları değişti | Partnership keşfi `organic_insights{likes, comments, views, reach, shares, interaction, saves}` dönüyor — gösterim yok, `views` var; Threads yanıtlarında `like_count`/`reply_count`/`share_count`/`quote_count`/`repost_count` | **Uyumlu** (`views` gösterimi tutuyor) |

## Yapay zekâ ile yönetim için çıkarımlar

**Araç olmalı (her biri tek iş yapar, Advetics servisini çağırır):**

- `reklam_turu_onerisi(isteğe_dair_metin)` → **yalnızca kapalı sözlükteki
  satır numarasını** döndürür; objective/hedef/destination/CTA'yı AI üretmez,
  satırdan okunur.
- `mesaj_reklami_kur(kanal_kümesi, karşılama, buz_kırıcılar?)` — kanal kümesi
  {WhatsApp, Messenger, IG} alt kümesi; tekse tek hedef, çoksa
  `MESSAGING_*` + `DOF_MESSAGING_DESTINATION` otomatik.
- `lead_formu_listele(page)` / `lead_formu_olustur(...)` /
  `lead_formu_arsivle(form)` / `form_uygunlugu(form)` (in-thread).
- `leadleri_getir(ad|form, since)` + `lead_webhook_durumu(page)` (abonelik
  var mı, uygulama kurulu mu, son teslim).
- `test_lead_olustur(form)` / `test_lead_sil(lead)`.
- `arama_reklami_kur(numara_kaynağı=Sayfa, geri_arama?)`.
- `profil_ziyareti_kur(hedef)` — erişim yoksa açık hata.
- `partnership_icerik_ara(...)`, `partnership_izin_iste(üretici)`,
  `partnership_izin_durumu(...)`.
- `threads_kimligi_bul(ig|page)` (oluşturma ayrı ve onaylı).
- `durum_yerlesimi_ekle(adset, yasi_bilinmeyen: bool)` — parametre zorunlu,
  varsayılansız.

**Kapalı sözlükten seçilecek parametreler (AI serbest metin üretemez):**
`objective`, `optimization_goal`, `destination_type`, `billing_event`,
`call_to_action.type`, `app_destination`, `asset_feed_spec.optimization_type`,
`message_extensions[].type`, `page_welcome_message.landing_screen_type` /
`customer_action_type`, lead `questions[].type` (ulusal kimlik dahil),
`step_type`/`reply_type`/`prefill_type`, profil `destination_type`,
partnership `ad_format`, `user_age_unknown`, `status`.

**İnsan onayı gerektiren işlemler:**

- Yayın (`status=ACTIVE`) ve canlı reklama dokunan her değişiklik (proje
  kuralı).
- Lead formu oluşturma (silinemez), Messenger lead şablonu (silinemez,
  düzenlenemez), form arşivleme.
- Partnership izin isteği / geri alma (üreticiye bildirim gider), onaylı
  üretici listesine ekleme/çıkarma, reklam kodu üretme/silme.
- Threads IG/Sayfa destekli hesap oluşturma (kalıcı sahte hesap).
- Webhook aboneliği (`subscribed_apps`) — Sayfa ayarına dokunuyor.
- Threads yanıtı ekleme/gizleme ve partnership yorum gizleme (müşteri adına
  kamuya açık işlem).
- `user_age_unknown` değişikliği (kitle genişler/daralır).

**AI'ın asla tahmin etmemesi gerekenler:**

- Telefon numarası (`CALL_NOW`): Sayfa'dan okunmalı, ülke kodu ve hedef
  ülkeyle eşleşmesi kontrol edilmeli; premium hat reddi.
- WhatsApp numarası: sorulmaz, Sayfa'ya bağlı olan kullanılır; WABA/Flow
  kimliği tahmin edilmez.
- IG hesap kimliği, Threads kimliği, IABP, Sayfa kimliği: API'den okunur.
- Lead formu gizlilik URL'si: Marka Merkezi'nden ya da kullanıcıdan;
  uydurulamaz.
- `event_id`, uygulama `object_store_url`, `application_id`, Pixel/offline
  veri kümesi kimlikleri.
- Partnership üretici kimliği: kullanıcı adından Business Discovery ile
  çözülür, tahmin edilmez.
- Belgede çelişkili alanlar (yukarıdaki liste): AI bunları "belgeye göre"
  diye seçemez; Advetics'in doğrulanmış yolu ne ise o.

## Panel kurgusu için çıkarımlar

**Acemi kullanıcıya sorulacak tek soru:** "Bu reklamdan ne istiyorsun?" —
cevaplar kapalı sözlükteki "Acemi" satırlarının iş dilindeki karşılığı:

1. Bana WhatsApp'tan yazsınlar
2. Bana Messenger'dan yazsınlar
3. Bana Instagram'dan mesaj atsınlar
4. Nereden olursa yazsınlar (bağlı kanallar otomatik)
5. Form doldurup iletişim bilgisi bıraksınlar
6. Beni arasınlar

(Mevcut panelin trafik/satış/bilinirlik/boost yolları ayrı bölümlerde; bu
liste onlara eklenir, onları değiştirmez. Not: hafızadaki karar gereği
`/reklam-olustur` şu an donuk — bu liste yeni kurgunun girdisi.)

**Otomatik kararlaştırılacaklar (kullanıcı görmez):** `objective`
(mesaj → `OUTCOME_ENGAGEMENT`, form → `OUTCOME_LEADS`, arama →
`OUTCOME_TRAFFIC` ya da canlıda doğrulanacak en uygun), `optimization_goal`,
`billing_event: IMPRESSIONS`, `destination_type`, `promoted_object.page_id`,
CTA türü, `app_destination`, sabit bağlantılar (`api.whatsapp.com/send`,
`fb.me/`, `fb.com/messenger_doc/`), `status: PAUSED`, standart geliştirmeler
için açık `enroll_status`, `special_ad_categories` (çoklu hedef ve profil
ziyaretinde zorunlu boş).

**Acemiye sorulabilecek ama hazır doldurulmuş alanlar:**

- Mesaj reklamları: Türkçe karşılama metni (varsayılan İngilizce cümleye asla
  düşülmez); ops. 3 hazır soru (buz kırıcı, ≤ 80 karakter).
- Form: "Hangi bilgileri isteyelim?" — kapalı liste (Ad Soyad, Telefon,
  E-posta, Şehir için CUSTOM, Randevu tarihi); gizlilik politikası adresi
  Marka Merkezi'nden zorunlu, yoksa form adımı açılmaz ve **nedeni** yazılır.
- Arama: numara Sayfa'dan gösterilir, kullanıcı yalnızca onaylar; yanlış
  ülke/premium hat **giriş anında** uyarılır.

**Giriş anı doğrulamaları (sessiz hatayı önleme):**

- Seçilen kanal için ön koşul: WhatsApp numarası Sayfa'ya bağlı mı, IG işletme
  hesabı Sayfa'ya bağlı mı — yoksa seçenek pasif ve nedeni yazılı.
- Arama reklamında hedef yaş < 18 engeli, çok ülkeli hedefleme engeli.
- Metin uzunlukları (gövde ≤ 1024, başlık/açıklama ≤ 255; Threads açıksa
  ≤ 1000 ve hashtag/URL yok).
- Lead okuma kurulumu eksikse (webhook yok, uygulama Development modunda,
  `leads_retrieval` yok) form reklamı yayın adımında **uyarılır**: "lead'ler
  Advetics'e düşmeyecek".

**Yalnızca Gelişmiş modda:** çağrı istemi, WhatsApp Flow, iş ortağı uygulaması
akışı, `QUALITY_LEAD`, `is_optimized_for_quality`,
`block_display_for_non_targeted_viewer`, kapılı içerik, `tracking_parameters`,
geri arama formu, web sitesinden mesaja, WhatsApp Durum yerleşimi (yaşı
bilinmeyen kişiler sorusu **varsayılansız** sorulur), çoklu medya ve
özelleştirmeleri, uygulama kurulumu, yerel reklam (yarıçap önerisiyle).

**Panelde kapalı (yazma kodu ve canlı doğrulama gelmeden gösterilmez):**
profil ziyareti (API sınırlı erişim), Messenger lead şablonu (API'de
kaldırılıyor), Messenger abonelik (CTS), etkinlik reklamları (eski objective
adları), uygulama içi olay optimizasyonu, omnichannel (hesap uygunluğu),
Threads, Audience Network, partnership, Dinamik Kreatif.

**Raporlama tarafı:** lead listesinde gösterilen/toplam sayısı, organik ve
test lead ayrımı, onay kutusu cevapları ayrı sütun; Threads ve AN kırılımı
`publisher_platform, platform_position` ile; Dinamik Kreatif'te "kombinasyon
kırılımı API'de yok" notu.

## Sayfa sayfa dizin

`…/` = `https://developers.facebook.com/documentation/ads-commerce/marketing-api/`

| Dosya | Kaynak URL | Tek satır özet | Önem |
|---|---|---|---|
| `marketing-api__ad-creative__asset-feed-spec.md` | …/ad-creative/asset-feed-spec | `asset_feed_spec`'in iki kullanımı (otomatik/kurallı), oluşturma-okuma-düzenleme; format değiştirilemez | Orta |
| `marketing-api__ad-creative__asset-feed-spec__asset-customization-rules.md` | …/ad-creative/asset-feed-spec/asset-customization-rules | Yerleşim/dil/segment özelleştirme kuralları; ≥ 2 kural; eski objective tablosu | Düşük |
| `marketing-api__ad-creative__asset-feed-spec__dynamic-creative.md` | …/ad-creative/asset-feed-spec/dynamic-creative | Dinamik Kreatif: `is_dynamic_creative`, set başına tek reklam, silinemeyen reklam, `review_feedback` | Orta |
| `marketing-api__ad-creative__asset-feed-spec__insights.md` | …/ad-creative/asset-feed-spec/insights | Varlık bazlı kırılımlar (`body_asset` vb.) ve sınırları | Düşük |
| `marketing-api__ad-creative__asset-feed-spec__options.md` | …/ad-creative/asset-feed-spec/options | Asset feed alanları, sayı/uzunluk sınırları, derin bağlantı, `message_extensions` | Orta |
| `marketing-api__ad-creative__messaging-ads.md` | …/ad-creative/messaging-ads | Mesajlaşma reklam türlerinin haritası (CTM, CTM lead, ürün uzantısı, CTS, CTIG, CTWA, çoklu) | Orta |
| `marketing-api__ad-creative__messaging-ads__click-to-instagram.md` | …/ad-creative/messaging-ads/click-to-instagram | CTIG uçtan uca: `INSTAGRAM_DIRECT`, `INSTAGRAM_MESSAGE`, IABP, LEADS yok | Yüksek |
| `marketing-api__ad-creative__messaging-ads__click-to-messenger.md` | …/ad-creative/messaging-ads/click-to-messenger | CTM/CTS/Messenger lead (v24 kaldırılıyor), çağrı istemi, ürün uzantıları, karşılama sınırları | Yüksek |
| `marketing-api__ad-creative__messaging-ads__click-to-multidestination.md` | …/ad-creative/messaging-ads/click-to-multidestination | Çoklu hedef: dört `MESSAGING_*` değeri, `DOF_MESSAGING_DESTINATION`, sabit bağlantılar | Yüksek |
| `marketing-api__ad-creative__messaging-ads__click-to-whatsapp.md` | …/ad-creative/messaging-ads/click-to-whatsapp | CTWA uçtan uca; karşılama, Flow, çağrı istemi, IG gönderisinden CTWA | Yüksek |
| `marketing-api__ad-creative__messaging-ads__website-ads-click-to-message.md` | …/ad-creative/messaging-ads/website-ads-click-to-message | Web→mesaj: `WEBSITE`/`UNDEFINED`, inline `message_extensions`, hata 3 | Yüksek |
| `marketing-api__ad-creative__multi-media-ads.md` | …/ad-creative/multi-media-ads | ≤ 10 medya, `media_sourcing_spec`, medya başına metin/hedef/yerleşim/kırpma | Orta |
| `marketing-api__ad-creative__omnichannel-ads.md` | …/ad-creative/omnichannel-ads | Mağaza+site satış: `omnichannel_object`, 7g/1g atıf, hata alt kodları | Düşük |
| `marketing-api__ad-creative__partnership-ads.md` | …/ad-creative/partnership-ads | Partnership API'sine giriş ve alt sayfa haritası | Düşük |
| `marketing-api__ad-creative__partnership-ads__account-level-permissioning.md` | …/ad-creative/partnership-ads/account-level-permissioning | IG hesap düzeyi izin isteme/listeleme/geri alma | Orta |
| `marketing-api__ad-creative__partnership-ads__ad-codes.md` | …/ad-creative/partnership-ads/ad-codes | Üreticinin reklam kodu üretmesi/silmesi | Düşük |
| `marketing-api__ad-creative__partnership-ads__ads-creation.md` | …/ad-creative/partnership-ads/ads-creation | Oluşturma ön koşulları, izinler, izinsiz yayının "beklemede" kalması | Orta |
| `marketing-api__ad-creative__partnership-ads__ads-creation__boost-existing-fb-post.md` | …/ad-creative/partnership-ads/ads-creation/boost-existing-fb-post | FB gönderisini partnership olarak boost; eski uç 1 Ara 2026'da kalkıyor; yorum gizleme | Orta |
| `marketing-api__ad-creative__partnership-ads__ads-creation__boost-existing-post.md` | …/ad-creative/partnership-ads/ads-creation/boost-existing-post | IG medyasını boost; `branded_content.ad_format`; öneriler; IG video hatası çözümü | Orta |
| `marketing-api__ad-creative__partnership-ads__ads-creation__new-fb-creative.md` | …/ad-creative/partnership-ads/ads-creation/new-fb-creative | Yeni kreatifle FB partnership; birincil/ikincil kimlik; bağ yoksa teslim yok | Orta |
| `marketing-api__ad-creative__partnership-ads__ads-creation__supported-configurations.md` | …/ad-creative/partnership-ads/ads-creation/supported-configurations | Desteklenen yapılandırmaların listesi | Düşük |
| `marketing-api__ad-creative__partnership-ads__ads-creation__supported-configurations__advantage-catalog-ads.md` | …/ad-creative/partnership-ads/ads-creation/supported-configurations/advantage-catalog-ads | Partnership + katalog (koleksiyon/karusel), canvas hero varlık alanları | Düşük |
| `marketing-api__ad-creative__partnership-ads__ads-creation__supported-configurations__advantage-creative.md` | …/ad-creative/partnership-ads/ads-creation/supported-configurations/advantage-creative | Partnership + standart geliştirmeler / ürün uzantıları örneği | Düşük |
| `marketing-api__ad-creative__partnership-ads__ads-creation__supported-configurations__click-to-message-destinations.md` | …/ad-creative/partnership-ads/ads-creation/supported-configurations/click-to-message-destinations | Partnership + mesaj hedefi (CTA `app_destination`) örneği | Düşük |
| `marketing-api__ad-creative__partnership-ads__ads-creation__supported-configurations__lead-ads.md` | …/ad-creative/partnership-ads/ads-creation/supported-configurations/lead-ads | Partnership + lead; tebrik kartı biçimi ve form sahipliği kısıtı | Orta |
| `marketing-api__ad-creative__partnership-ads__ads-creation__supported-configurations__placement-asset-customization.md` | …/ad-creative/partnership-ads/ads-creation/supported-configurations/placement-asset-customization | Partnership + yerleşime göre varlık örneği | Düşük |
| `marketing-api__ad-creative__partnership-ads__ads-creation__supported-configurations__testimonial-ads.md` | …/ad-creative/partnership-ads/ads-creation/supported-configurations/testimonial-ads | Partnership'e referans yorumu (`branded_content.testimonial`) | Düşük |
| `marketing-api__ad-creative__partnership-ads__ads-creation__use-new-creative.md` | …/ad-creative/partnership-ads/ads-creation/use-new-creative | Yeni kreatifle IG partnership; Business Discovery ile üretici kimliği | Orta |
| `marketing-api__ad-creative__partnership-ads__content-discovery-api.md` | …/ad-creative/partnership-ads/content-discovery-api | Birleşik içerik keşfi ucu: süzgeçler, alanlar, sayfalama, organik metrikler | Orta |
| `marketing-api__ad-creative__partnership-ads__fb-account-level-permissioning.md` | …/ad-creative/partnership-ads/fb-account-level-permissioning | FB hesap düzeyi izin; durum kodları 1–7; toplu eylemde öğe bazlı başarısızlık | Orta |
| `marketing-api__ad-creative__partnership-ads__post-level-permissioning.md` | …/ad-creative/partnership-ads/post-level-permissioning | Onaylı üretici listesi ve gönderi bazlı boost izni; hepsi-ya-hiç davranışı | Orta |
| `marketing-api__ad-creative__profile-visit-ads.md` | …/ad-creative/profile-visit-ads | Profil ziyareti türleri; API sınırlı erişim uyarısı | Orta |
| `marketing-api__ad-creative__profile-visit-ads__facebook-page-visit.md` | …/ad-creative/profile-visit-ads/facebook-page-visit | `FACEBOOK_PAGE` + `PROFILE_VISIT` + `VISIT_PROFILE` | Orta |
| `marketing-api__ad-creative__profile-visit-ads__instagram-profile-visit.md` | …/ad-creative/profile-visit-ads/instagram-profile-visit | `INSTAGRAM_PROFILE` + `VIEW_INSTAGRAM_PROFILE`; IG gönderisinden kreatif | Orta |
| `marketing-api__ad-creative__profile-visit-ads__multidestination-profile-visit.md` | …/ad-creative/profile-visit-ads/multidestination-profile-visit | İkili profil hedefi, `UNIFIED_PROFILE_VISIT_DESTINATION` | Orta |
| `marketing-api__ad-creative__threads-ads.md` | …/ad-creative/threads-ads | Threads hesap türleri (IG ilişkili / IG destekli / Sayfa destekli), kimlik alma, kısıtlar | Orta |
| `marketing-api__ad-creative__threads-ads__creation.md` | …/ad-creative/threads-ads/creation | Threads yerleşimi, objective'ler, medya şartları, 1000 karakter sessiz düşüşü | Orta |
| `marketing-api__ad-creative__threads-ads__creation__advantage-catalog-ads.md` | …/ad-creative/threads-ads/creation/advantage-catalog-ads | Threads katalog: yalnız görsel, giriş kartı teslimi engeller | Düşük |
| `marketing-api__ad-creative__threads-ads__creation__app-ads.md` | …/ad-creative/threads-ads/creation/app-ads | Threads uygulama reklamı; masaüstü yok, playable video olur | Düşük |
| `marketing-api__ad-creative__threads-ads__creation__carousel-ads.md` | …/ad-creative/threads-ads/creation/carousel-ads | Threads karusel farkları: CTA düğmesi yok, kart başına link/görsel | Düşük |
| `marketing-api__ad-creative__threads-ads__creation__use-posts-as-ads.md` | …/ad-creative/threads-ads/creation/use-posts-as-ads | FB/IG gönderisinden Threads reklamı; Threads gönderisi ve partnership yok | Düşük |
| `marketing-api__ad-creative__threads-ads__insights.md` | …/ad-creative/threads-ads/insights | `threads_feed` kırılımı, `utm_source=threads` | Düşük |
| `marketing-api__ad-creative__threads-ads__reply-moderation.md` | …/ad-creative/threads-ads/reply-moderation | Threads reklam yanıtlarını okuma/gizleme/yanıtlama | Düşük |
| `marketing-api__ads-in-whatsapp-status.md` | …/ads-in-whatsapp-status | Durum reklamları: kısıtlar, objective tablosu, yerleşim, kimlik, önizleme | Orta |
| `marketing-api__ads-in-whatsapp-status__user-age-unknown.md` | …/ads-in-whatsapp-status/user-age-unknown | `user_age_unknown` varsayılanı `true` (Temmuz 2026) — sessiz genişleme | Yüksek |
| `marketing-api__ads-in-whatsapp-status__whatsapp-identity.md` | …/ads-in-whatsapp-status/whatsapp-identity | `wamo_whatsapp_identity_spec`, kimlik türleri, sonradan değiştirilemez | Orta |
| `marketing-api__audience-network.md` | …/audience-network | AN tek başına olmaz, karuselde ilk 2 kart, önizleme formatları | Düşük |
| `marketing-api__call-ads.md` | …/call-ads | Arama reklamı: `PHONE_CALL`, `QUALITY_CALL`, `CALL_NOW` `tel:`; 18+, aynı ülke | Yüksek |
| `marketing-api__call-ads__callback-feature.md` | …/call-ads/callback-feature | Geri arama formu (`callback_type: FORM`), yalnızca reklamdan okunur | Orta |
| `marketing-api__guides__event-ads.md` | …/guides/event-ads | Etkinlik (eski objective'ler) ve yerel reklam (yarıçap, `GET_DIRECTIONS`, `CALL_NOW` kuralları) | Orta |
| `marketing-api__guides__lead-ads.md` | …/guides/lead-ads | Lead ön koşulları: App Review, Business Verification, Sayfa token'ı, Development modu | Yüksek |
| `marketing-api__guides__lead-ads__create.md` | …/guides/lead-ads/create | Lead kampanya/set/form/kreatif; soru türleri; kalite ayarları; arşiv | Yüksek |
| `marketing-api__guides__lead-ads__quickstart__webhooks-integration.md` | …/guides/lead-ads/quickstart/webhooks-integration | `leadgen` webhook kurulumu, `subscribed_apps`, gövde örneği | Yüksek |
| `marketing-api__guides__lead-ads__retrieving.md` | …/guides/lead-ads/retrieving | Lead okuma: webhook, toplu, CSV, süzgeç, onay kutusu cevapları, hız sınırı | Yüksek |
| `marketing-api__guides__lead-ads__testing-troubleshooting.md` | …/guides/lead-ads/testing-troubleshooting | Test lead oluşturma/okuma/silme, webhook teslim izleme | Orta |
| `marketing-api__mobile-app-ads.md` | …/mobile-app-ads | Uygulama reklamları: CTA'lar, `user_os`, derin bağlantı, playable, katalog | Orta |
