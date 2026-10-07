# A3 — Meta Marketing API: AdvCampaign için en optimize kurulum, birleşimler, video, prova, sinyaller

*Tarih: 2026-10-07 · Graph/Marketing API v25.0 (v26.0 2026-07-29'da çıktı, bütün sürümlere yayılan
kısımları 2026-10-27'de) · Yazan: araştırma ajanı · KOD YAZILMADI.*

Bu belge `docs/meta-reklam-brief/arastirma/R1`, `R4`, `R5`, `R6`, `tasarim/hukumler.md` ve
`CLAUDE.md` → "Canlıda öğrenilen platform gerçekleri → Meta" üzerine yazıldı. Orada söylenenleri
TEKRAR ETMİYOR; yalnız (a) resmî belgenin 2026 hâlinden çıkan yeni bilgiyi, (b) mevcut belgelerdeki
boşlukları ve (c) mevcut kodla (`packages/shared/src/reklam/meta/*`, `apps/api/src/modules/reklam/*`)
çelişen noktaları yazıyor. Daha önce yazılmış bir konuya değinildiğinde yalnız atıf var
(ör. "→ R1 §4.6", "→ C-26").

**Etiketler.** `[belge]` = Meta'nın resmî geliştirici belgesi (bu turda okundu, URL kaynak
listesinde). `[canlı-depo]` = depoda canlıda ölçülmüş olarak kayıtlı (CLAUDE.md, commit, kod yorumu).
`[çıkarım]` = iki kaynağın birleşiminden ya da belgenin sessiz kaldığı yerde benim yorumum; canlıda
ölçülmeden karar verdirmemeli. Canlı-depo ile çelişen belge iddiası, talimat gereği **belge hatası**
sayıldı ve öyle yazıldı.

**Okuma yöntemi notu.** `developers.facebook.com/docs/...` sayfalarının çoğu artık
`/documentation/ads-commerce/...` altına taşındı; eski adresler kısmen 404 ya da boş kabuk dönüyor.
Kaynak listesinde iki adres de var. Referans sayfalarının parametre tabloları HTML'den doğrudan
çıkarıldı; rehber sayfaları Meta'nın kendi doküman arama aracıyla (Meta Social Technologies MCP
`search_docs`) alıntılandı. Sıralama/rozet alanları Meta Ads MCP'nin alan kataloğundan okundu [D30].

---

## Özet (10 madde)

1. **"Advantage+ kampanya" API'de bir alan değil, üç kaldıracın SONUCU — ve bu yalnız Satış, Uygulama ve
   Lead amaçlarında tanımlı.** Kampanya bütçesi (desteklenen teklif stratejisiyle) + hiçbir ad set'te
   yerleşim kısıtı/hariç tutma yok + en az bir ad set'te Advantage+ kitle → `advantage_state_info.
   advantage_state` = `ADVANTAGE_PLUS_SALES | _APP | _LEADS`. Alan salt-okunur. Trafik, Etkileşim ve
   Bilinirlikte belge bu durumu hiç tanımlamıyor. [belge D1, D2] → Acemi varsayılanı zaten bu
   kaldıraçları kuruyor; eksik olan GERİ OKUMASI (§1.1, çelişki Ç-9).
2. **Eski yollar kapandı:** ASC/AAC (`smart_promotion_type = AUTOMATED_SHOPPING_ADS / SMART_APP_PROMOTION`)
   v24'te yeni sürümde, **2026-05-19'dan beri bütün sürümlerde** oluşturma/çoğaltma/güncelleme yok;
   `existing_customer_budget_percentage` yeni kampanyada yok, v26'da eski ASC'ler duraklatılıyor ve
   `migrate_to_advantage_plus` kalkıyor. Ayrıntılı hedeflemede **hariç tutma** 2025 başında kalktı,
   ilgi alanları birleştirildi (eski seçenekler 2026-01-15'ten beri teslim edilmiyor). [belge D1, D4,
   D5, D6, D28]
3. **Advantage+ creative belgesi küçük harfli ~15 özellik sayıyor (`adapt_to_placement` "varsayılan
   OPT_IN"), canlıda yalnız 7 BÜYÜK HARFLİ anahtar kabul edildi.** Canlı-depo kazanır; ama sonuç
   kritik: belgede varsayılanı açık olan özellikleri (`adapt_to_placement`, `text_optimizations`,
   `image_touchups`, `inline_comment`, `video_auto_crop`) bugün KAPATAMIYORUZ ve derleyicinin ekrana
   yazdığı "Meta'nın yapay zekâyla görseli ve metni değiştirmesi kapalı" cümlesi geri okumayla
   kanıtlanmadan söylenemez; aynı sebeple `yanki.ts` her yayını "tanımsız özellik OPT_IN" ile
   durdurabilir. [belge D22, D23 · canlı-depo f6e7f70] → Ç-1, Ç-2.
4. **Amaç birleşimlerinde belge kendi içinde çelişiyor** (ODAX eşleme tablosu, ad set "dönüşüm konumu"
   tablosu, mesajlaşma rehberleri ve ad set yazma enum'u dört ayrı şey söylüyor). En önemlileri:
   **Instagram Direct OUTCOME_LEADS'te YOK** (yalnız Etkileşim/Satış/Trafik); **WhatsApp OUTCOME_LEADS'te
   yalnız `CONVERSATIONS`**; **`PHONE_CALL` ad set yazma enum'unda hiç yok** ama ODAX tablosu ve Arama
   rehberi kullanıyor; **site üzerinden "kayıt/lead" olayı Satış değil Lead amacının dönüşüm konumu.**
   [belge D7, D8, D11–D15] → tablo §2.
5. **Atıf penceresi her optimizasyon hedefinde serbest değil:** referans tablo 7 gün tık + 1 gün görüntülemeyi
   yalnız (eski adlarla) dönüşüm/katalog için sayıyor ve "diğer bütün birleşimlerde yalnız 1 gün tık"
   diyor. Derleyici her niyete aynı `attribution_spec`'i yazıyor. ODAX'ta hangi pencerenin kabul
   edildiği canlıda ölçülmeli; reddedilmezse bile NORMALLEŞTİRİLEBİLİR (sessiz). [belge D7 · çıkarım]
   → Ç-3.
6. **Video:** iki yükleme yolu var — eski `/advideos` parçalı (`upload_phase` = start/transfer/finish/
   cancel, `upload_session_id`, `start_offset/end_offset`, `video_file_chunk`) ve yeni, kaldığı yerden
   devam eden `/video_ads` + `rupload.facebook.com`. Durum `video_status` ∈ `ready | processing | expired |
   error`. Kod tek istekte `source` gönderiyor ve `expired`i "işleniyor" sayıyor → 15 dakikalık sessiz
   bekleme. [belge D16, D17 · canlı-depo 2979fa8] → Ç-10.
7. **Yerleşime göre varlık (PAC) belgesi bayat:** `instagram_positions` listesinde `reels` yok,
   `facebook_positions` listesinde v24'te KALDIRILAN `video_feeds` var ve `facebook_reels` yok; desteklenen
   amaçlar hâlâ eski adlarla (mesajlaşma yok). 9:16 videonun Reels'e gittiğini PAC ile GARANTİ etmek
   belgeden mümkün değil → C-26'nın "Acemi'de PAC yok" hükmü belgeyle de doğrulanıyor. Yeni alternatif
   "Multi-media ads" (bir reklamda 10'a kadar medya) yerleşime göre özelleştirmeyi koruyor ama
   `opt_in_status: opt_in` istiyor (Meta'nın ilişkili medya özelliği). [belge D19, D20, D21, D4]
8. **Prova:** `/adsets` + satır içi `campaign_spec` belgede YALNIZ `name`, `objective`, `buying_type`
   taşıyor (örnek hâlâ eski `CONVERSIONS`); `/ads` + `adset_spec` ise belgede açıkça var ("spec verilince
   `adset_id` gerekmez"). Canlıdaki 5xx'in belgede doğrudan karşılığı yok, ama "kitle ve bütçeyi reklam
   provasındaki `adset_spec` ile doğrula" çözümü belgelenmiş bir yol. `synchronous_ad_review` "dil, %20
   metin kuralı vb." bütünlük kontrolü yapıyor ve **nihai karar değil**. [belge D8, D10 · canlı-depo 513926a]
9. **Optimizasyon sinyali artık API'de zengin:** `learning_stage_info` (+ dinamik eşik), `issues_info`,
   nesne üzerinde `recommendations`, hesap düzeyinde **Opportunity Score (0–100) ve `/recommendations`**
   (üç evre: `pre_create_guidance`, `pre_flight_recommendation`, `mid_flight_recommendation`; 14 tür API'den
   uygulanabiliyor), insights'ta `results`, `cost_per_result`, `frequency`, üç sıralama rozeti,
   `creative_fatigue_summary`, `creative_fatigued_ads`, `creative_diversity_score`, `deduping_ratio`.
   Modülde bunların HİÇBİRİ okunmuyor. [belge D9, D24, D25, D26, D30] → Ç-13.
10. **Acemi varsayılanı (öneri):** tek kampanya + tek ad set, kampanya bütçesi `LOWEST_COST_WITHOUT_CAP`,
    `advantage_audience: 1` (konum + en düşük yaş + dil kesin, yaş tercihi öneri), yerleşim alanı
    gönderilmez, Advantage+ creative mümkün olan her anahtarda `OPT_OUT` (C-27), atıf niyet başına açık
    (C-22), `PAUSED` kur → geri oku (`advantage_state_info` dahil) → aç. Form, WhatsApp, Arama ve
    site-lead niyetleri Lead amacında (Advantage+ leads durumuna aday); IG mesajı ve çok kanallı mesaj
    Etkileşim'de (Advantage+ durumu tanımsız); site trafiği Trafik'te. [çıkarım, D1/D8/D11–D15'ten]

---

## 1. "En optimize" kurulum: Advantage+ kaldıraçları API'de

### 1.1 Advantage+ kampanya durumu (Satış / Uygulama / Lead)

| Kaldıraç | Durumu ENABLED tutan koşul | Alan | Kaynak |
|---|---|---|---|
| Bütçe | Bütçe KAMPANYADA, `bid_strategy` ∈ `LOWEST_COST_WITHOUT_CAP` (önerilen), `COST_CAP`, `LOWEST_COST_WITH_BID_CAP`, `LOWEST_COST_WITH_MIN_ROAS` | kampanya `daily_budget`/`lifetime_budget` + `bid_strategy` | [belge D1] |
| Kitle | En az BİR ad set'te: `targeting_automation.advantage_audience = 1` YA DA `geo_locations` dışında hedefleme yok YA DA gevşetmeli tekil seçenekler (Advantage lookalike / custom audience). Yaş: varsayılan, `age_min ≤ 25` ya da öneri; özel kitle dahil etme yok ya da Advantage custom audience | ad set `targeting` | [belge D1] |
| Yerleşim | Hiçbir ad set'te yerleşim hedeflemesi YA DA hariç tutma yok. **Hesap düzeyi hariç tutmalar serbest** | ad set `targeting` (yerleşim alanları yok) | [belge D1] |

- Okuma: `GET /{campaign}?fields=advantage_state_info` → `advantage_state`, `advantage_budget_state`,
  `advantage_audience_state`, `advantage_placement_state`. Biri `DISABLED` ise üst durum `DISABLED`.
  POST ile yazılamaz; bu durumla oluşan kampanyada `smart_promotion_type = GUIDED_CREATION`.
  Bayrak v23'te geldi. [belge D1, D2, D3]
- Blog (2025-06) yalnız `ADVANTAGE_PLUS_SALES | _APP | DISABLED` sayıyor; güncel rehber `_LEADS`'i de
  sayıyor (2026-06-17 güncel). [belge D1, D2]
- **Trafik / Etkileşim / Bilinirlik için belge hiçbir şey söylemiyor.** Alanın bu amaçlarda dönüp
  dönmediği, dönerse alt durumların anlamlı olup olmadığı bilinmiyor. [çıkarım] → "Advantage+ açık"
  rozeti bu amaçlarda gösterilmemeli (C-41 ve C-47 ile aynı yön).
- **HEF (konut/istihdam/finans) kampanyalarında** Advantage+ hedefleme erişimi "kademeli açılıyor";
  v26 ile (bütün sürümlerde 2026-10-27) kısıtlı hedeflemeli HEF ad set'inde `advantage_audience` AÇIKÇA
  yazılmazsa hata. [belge D1, D6] → derleyici zaten her yayında açıkça `1` yazıyor
  (`hedefleme.ts:187`) [canlı-depo]; konut kısıtlarıyla birlikteliği → R1 §4.6, C-3.
- **Mevcut müşteri bütçe tavanının yerine** belge iki ad set öneriyor: biri mevcut müşteri kitlesini
  gevşetmesiz dahil eder (`targeting_relaxation_types.custom_audience = 0`) ve `daily_min_spend_target` /
  `daily_spend_cap` ile sınırlanır, diğeri aynı kitleyi hariç tutar; bu ad set düzeyi hedefler yalnız
  kampanyada GÜNLÜK bütçe varken yazılabiliyor. [belge D1, D8] → Acemi'de yok; Gelişmiş adayı.

### 1.2 Advantage+ kitle

- v23+: "varsayılan ya da gevşetilmiş kurulumla" açılan YENİ ad set'ler Advantage+ kitleye
  **varsayılan olarak dahil**; güncellemede bu davranış hiçbir sürümde yok. Yani alanı göndermemek
  "açık" demek ama yalnız oluşturmada — tutarsız bir varsayılan. [belge D3] Derleyici açıkça
  yazıyor, doğru. [canlı-depo `hedefleme.ts`]
- v23+: yaş ve cinsiyet `targeting_automation.individual_setting.age / gender` ile **öneri** olarak
  verilebiliyor; öneri "performansı artıracaksa ayarın dışına çıkılır" demek. [belge D3] Derleyici yaş
  tercihini `age_range` ile gönderiyor (`hedefleme.ts:197`); iki yolun aynı şeyi yapıp yapmadığı
  belgede yok → geri okumada `targeting_automation` ve `age_range` birlikte okunmalı. [çıkarım]
- Kesin kalanlar (konum, en düşük yaş ≤25, dil, özel kitle hariç tutma) ve konumun "yanıt verme olasılığı
  yüksek kişilere" genişleme riski → R1 §4.1.
- **Ayrıntılı hedefleme hariç tutması 2025'te kalktı**: yeni ad set'te kullanılamıyor; özel kitle hariç
  tutma `excluded_custom_audiences` ile sürüyor (`exclusions` içindeki özel kitle desteği kaldırıldı).
  [belge D28]
- **İlgi alanı birleştirme (v24, bütün sürümler 2026-01-06):** bazı ilgi seçenekleri gruplandı; eski
  seçenekle yeni kampanya kurmak/güncellemek HATA; 2025-10-08 öncesi kampanyalar 2026-01-15'ten beri
  teslim edilmiyor; aramada birleşik seçenek dönüyor. [belge D4] → Advantage+ kitlede ilgi zaten
  öneri; AI'ın ürettiği ilgi önerisi her seferinde `/search?type=adinterest`'ten TAZE alınmalı,
  önbellekteki eski kimlik hata üretir. [çıkarım; arama davranışı → CLAUDE.md "İLGİ ALANI ARAMASI"]

### 1.3 Advantage+ yerleşim

- API'de varsayılan: yerleşim alanları gönderilmez → otomatik. "Opt-in için işlem gerekmez." [belge D1, D2]
- **Sınırlı harcama (v24+):** `placement_soft_opt_out` ile, normalde hariç tutulacak yerleşime bütçenin
  %5'ine kadar izin; Satış amacıyla çalıştığı yazıyor (cümle kesik, diğer amaçlar belirsiz). Tam
  hariç tutma eskisi gibi yerleşim hedeflemesiyle. [belge D4] → Gelişmiş için daha az zararlı bir
  "sınırla" seçeneği; durum alanını DISABLED yapıp yapmadığı ölçülmeli. [çıkarım]
- Kaldırılanlar: Facebook video akışı (v24, belirtilirse hata), IG Explore akışı (v26), Messenger Stories
  (v26; tüm sürümlerde Ağustos 2026 sonu, sessizce düşüyor). [belge D4, D6] → R4 §3.10.

### 1.4 Advantage kampanya bütçesi

- Kampanya bütçesi + teklif stratejisi kampanyada. Ad set düzeyinde `daily_min_spend_target`,
  `daily_spend_cap` (kampanyada günlük bütçe şart), `lifetime_*` karşılıkları (toplam bütçe şart);
  `daily_spend_cap = 922337203685478` sınırı kaldırır. [belge D8]
- **v24+: ad set bütçesi kullanılacaksa `is_adset_budget_sharing_enabled` ZORUNLU** (true önerilen;
  ad set'ler arası %20'ye kadar paylaşım). [belge D4] → derleyici ABO'yu reddediyor (`BTC-02`); Gelişmiş
  ABO açılırsa alan açıkça yazılmalı. [canlı-depo `derle.ts` · çıkarım]
- **v24+: günlük bütçe esnekliği %25'ten %75'e çıktı**; haftalık harcama 7 × günlük bütçeyi geçmez;
  hafta Pazar–Cumartesi. [belge D4] → C-33'ün sorusunu belge kapatıyor: %75.

### 1.5 Advantage+ creative

- v22'den beri `standard_enhancements` paketi yok; özellikler tek tek `degrees_of_freedom_spec.
  creative_features_spec.<özellik>.enroll_status` ile. Paket alt özellikleri: tek görselde
  `image_template`, `image_touchups`, `text_optimizations`, `inline_comment`; tek videoda
  `video_auto_crop`, `text_optimizations`, `inline_comment`. [belge D22, D23]
- Belgede `adapt_to_placement`: **"Optional. Default is opt-in"**, 4:5 ve 9:16 yerleşimleri varsayılan
  açık; `customizations` (`aspect_ratio_config`, `image_crop_style`) ile sınırlanabiliyor. Ayrıca
  `add_text_overlay`, `creative_stickers` (üretken) vb. [belge D22]
- v22 blogu: **açılmış ama uygun olmayan özellik `creative_features_spec`'ten tamamen SİLİNİYOR** (ör.
  videoda `image_templates`). Yani geri okumada "anahtar yok" ≠ "kapalı" ve ≠ "açık". [belge D23]
- **Canlı-depo (2026-10-07, v25):** küçük harfli anahtarlar `(#100) Param key ... must be one of {...}` ile
  reddedildi; kabul edilen küme yalnız `IG_VIDEO_NATIVE_SUBTITLE, IMAGE_ANIMATION, PRODUCT_BROWSING,
  PRODUCT_METADATA_AUTOMATION, PROFILE_CARD, STANDARD_ENHANCEMENTS_CATALOG, TEXT_OVERLAY_TRANSLATION`.
  [canlı-depo CLAUDE.md, f6e7f70] → Talimat gereği belge hatası sayılıyor. **Ancak** belgenin
  "varsayılan açık" dediği özellikler bu kümede yok; yani Advetics onları kapatamıyor ve açık mı
  kapalı mı olduklarını yalnız GERİ OKUMA söyler. [çıkarım] → Ç-1, Ç-2, ölçüm Ö-1.
- Meta'nın öneri API'si `APLUSC_STANDARD_ENHANCEMENTS_BUNDLE` (parametre `creative_feature_opt_in_overrides`),
  `BACKGROUND_GENERATION`, `UNCROP_IMAGE`, `MUSIC` önerilerini **API'den uygulatabiliyor** — hepsi
  Advantage+ creative'i açar, ikisi üretken. [belge D24] → AI'a "öneriyi uygula" aracı verilirse C-27'nin
  yasağı arka kapıdan delinir (R5 B5.3 ile aynı ders).

### 1.6 Acemi için varsayılan (karar önerisi, mevcut kararlarla uyumlu)

| Katman | Varsayılan | Neden |
|---|---|---|
| Yapı | 1 kampanya, 1 ad set, 1–5 reklam (kavram) | Tek ad set'te CBO = ABO; Advantage+ durumu için yeterli [belge D1 · R1] |
| Bütçe | Kampanyada, `LOWEST_COST_WITHOUT_CAP` AÇIKÇA | Teklif hesabın varsayılanına kalmasın [canlı-depo `derle.ts`] |
| Kitle | `advantage_audience: 1`, konum zorunlu (C-45), `age_min` 18 ve `user_age_unknown: false` açık (C-9), yaş tercihi öneri | [belge D1, D3] |
| Yerleşim | Alan gönderilmez | [belge D1] |
| Kreatif | Tanınan her anahtar `OPT_OUT`, `contextual_multi_ads` `OPT_OUT`; geri okumada belgedeki varsayılan-açık özellikler izlenir | C-27, Ç-1 |
| Atıf | Niyet satırında, açıkça (C-22) | Ç-3 |
| Beklenen durum | FORM/WHATSAPP/ARAMA/SITE_LEAD → `ADVANTAGE_PLUS_LEADS`; SATIS → `ADVANTAGE_PLUS_SALES`; diğerleri: alan karşılaştırılmaz | [belge D1 · çıkarım] |

---

## 2. Amaç × optimizasyon × hedef × tanıtılan nesne

### 2.1 Belgenin dört kaynağı ve birbirleriyle çelişkisi

| Kaynak | Ne söylüyor | Sorun |
|---|---|---|
| ODAX eşleme tablosu (kampanya referansı) [D7] | Eski amaç → yeni amaç → `destination_type` → `optimization_goal` → `promoted_object` | 2022'den; WhatsApp yalnız Trafik altında, Lead'de WhatsApp yok |
| Ad set "dönüşüm konumu (L2)" tablosu [D8] | Amaç → konum → olaylar → hedef enum'u | Lead altında WhatsApp ve Instagram yok; Etkileşim'de WhatsApp/Messenger/Instagram var |
| Mesajlaşma ve Arama rehberleri (2026-05/06 güncel) [D11–D15] | Uç uca örnek gövdeler | En güncel; tablolarla çelişiyor |
| Ad set `destination_type` YAZMA enum'u [D8] | `WEBSITE, APP, MESSENGER, APPLINKS_AUTOMATIC, WHATSAPP, INSTAGRAM_DIRECT, FACEBOOK, MESSAGING_*` (4 birleşim), `SHOP_AUTOMATIC, ON_AD, ON_POST, ON_EVENT, ON_VIDEO, ON_PAGE, INSTAGRAM_PROFILE, FACEBOOK_PAGE, INSTAGRAM_PROFILE_AND_FACEBOOK_PAGE, INSTAGRAM_LIVE, FACEBOOK_LIVE, IMAGINE` | **`PHONE_CALL`, `LEAD_FROM_MESSENGER`, `LEAD_FROM_IG_DIRECT` YOK** |

Kural: en güncel rehber > tablo; hepsi canlıda `validate_only` + PAUSED kur + geri oku ile kanıtlanmadan
niyet satırı `kanit: 'canli'` olmaz (niyetler.ts'nin zaten koyduğu kural). [çıkarım]

### 2.2 Birleşim tablosu (AdvCampaign niyetleri)

Sütunlar: amaç · optimizasyon hedefi (önerilen ilk, sonra izinli diğerleri) · `destination_type` ·
`promoted_object` · CTA · piksel/CAPI · kaynak · depo durumu.

| Niyet (iş dili) | `objective` | `optimization_goal` | `destination_type` | `promoted_object` | CTA | Piksel / CAPI | Kaynak | Depo |
|---|---|---|---|---|---|---|---|---|
| **Form doldursunlar** (anlık form) | `OUTCOME_LEADS` | `LEAD_GENERATION` (ya da `QUALITY_LEAD`) | `ON_AD` | `page_id` | `SIGN_UP` vb. + `value.lead_gen_form_id`; `link` sabit | Gerekmez. `QUALITY_LEAD` (dönüşüm lead'i) CRM'den CAPI ister; Nisan 2026'dan beri CAPI'siz yeni kampanyada seçilemiyor (→ R1 m.9) | [belge D7, D8] | `FORM` derleniyor, `kanit: belge` |
| **WhatsApp'tan yazsınlar** | `OUTCOME_LEADS` | **yalnız** `CONVERSATIONS` | `WHATSAPP` | `page_id` (zorunlu), `whatsapp_phone_number` (isteğe bağlı) | `WHATSAPP_MESSAGE` + `app_destination: WHATSAPP` | Gerekmez. "Mesajlaşmayla lead" hedefi etiketli lead/CAPI ister (→ R1 m.10) | [belge D11] (tablo D8 bu satırı göstermiyor) | `WHATSAPP` tur 1, derlenmiyor |
| WhatsApp (Etkileşim) | `OUTCOME_ENGAGEMENT` | `CONVERSATIONS`, `LINK_CLICKS` | `WHATSAPP` | `page_id` | aynı | Gerekmez | [belge D8, D11] | `WHATSAPP_CAGRI` (çağrı istemi ENGAGEMENT zorunlu) |
| WhatsApp (Trafik / Satış) | `OUTCOME_TRAFFIC` / `OUTCOME_SALES` | Trafik: `CONVERSATIONS, LANDING_PAGE_VIEWS, LINK_CLICKS, IMPRESSIONS, REACH, POST_ENGAGEMENT`; Satış: `CONVERSATIONS, OFFSITE_CONVERSIONS, LINK_CLICKS, IMPRESSIONS, REACH` | `WHATSAPP` | `page_id` (Satış'ta `OFFSITE_CONVERSIONS` için piksel) | aynı | Satış'ta piksel | [belge D11] | yok (Acemi'ye gerek yok) |
| **Instagram'dan mesaj** | `OUTCOME_ENGAGEMENT` (Satış/Trafik de olur) | `CONVERSATIONS`, `LINK_CLICKS` | `INSTAGRAM_DIRECT` | `page_id` | `INSTAGRAM_MESSAGE` + `app_destination: INSTAGRAM_DIRECT` | Gerekmez | [belge D12] — **Lead amacı listede YOK** | `IG_MESAJ` ENGAGEMENT, belgeyle uyumlu |
| Instagram'dan lead (sohbet) | `OUTCOME_LEADS` | `LEAD_GENERATION` | `LEAD_FROM_IG_DIRECT` | `page_id` | — | Gerekmez | [belge D7] — yazma enum'unda yok | yok; ölçülmeden açılmamalı |
| **Messenger'dan yazsınlar** | `OUTCOME_ENGAGEMENT` | `CONVERSATIONS` (ya da `LINK_CLICKS`, eski tabloda `LEAD_GENERATION`) | `MESSENGER` | `page_id` | `MESSAGE_PAGE` + `app_destination: MESSENGER` | Gerekmez | [belge D7, D8] | `MESSENGER` tur 3 |
| Messenger lead (otomatik sohbet şablonu) | `OUTCOME_LEADS` | `LEAD_GENERATION`, `QUALITY_LEAD` | `LEAD_FROM_MESSENGER` (D7) / "Messenger" konumu (D8) | `page_id` | — | Gerekmez | [belge D7, D8] — yazma enum'unda yok | yok |
| **Nereden olursa yazsınlar** | `OUTCOME_ENGAGEMENT` (Satış/Trafik de olur; **Lead yok**) | **zorunlu** `CONVERSATIONS` | `MESSAGING_INSTAGRAM_DIRECT_MESSENGER_WHATSAPP` (+ üç ikili) | `page_id` | Kreatifte `asset_feed_spec.optimization_type = DOF_MESSAGING_DESTINATION` + kanal başına `call_to_actions` | Gerekmez; WhatsApp için sayfaya bağlı numara, IG için bağlı profesyonel hesap | [belge D13] | `COK_KANAL_MESAJ` tur 3, `cta: 'kanal_basina'` |
| **Beni arasınlar** | `OUTCOME_LEADS` (ODAX) — rehber örneği `OUTCOME_TRAFFIC`; rehber AWARENESS/ENGAGEMENT/LEADS/SALES/TRAFFIC sayıyor | `QUALITY_CALL` (Trafik'te `LINK_CLICKS` da) | `PHONE_CALL` (yazma enum'unda yok!) | Lead'de `page_id`; Trafik'te yok | `CALL_NOW` + `value.link = "tel:+<ülke kodlu numara>"` | Gerekmez. Kitle 18+; numara hedef kitleyle AYNI ülkeden | [belge D7, D15] | `ARAMA` tur 2, `canliOlculecek` var |
| **Siteme gelsinler** | `OUTCOME_TRAFFIC` | `LANDING_PAGE_VIEWS` (ya da `LINK_CLICKS, IMPRESSIONS, REACH`) | `WEBSITE` | yok | `LEARN_MORE` vb. | LPV pikselsiz de kullanılabiliyor (→ R1 m.11); C-39 geri okuma kuralı | [belge D8] | `SITE` derleniyor |
| Siteme gelsinler, isterlerse yazsınlar | `OUTCOME_TRAFFIC` | `LANDING_PAGE_VIEWS` | `WEBSITE` (ya da `UNDEFINED`) | yok | `LEARN_MORE` + kreatifte `asset_feed_spec.message_extensions: [{type: whatsapp|messenger|instagram_message}]` | Piksel gerekmez | [belge D14] | `SITE_MESAJ` gelişmiş — eklenti alanı katalogda yok (Ç-8) |
| **Sitemden satış** | `OUTCOME_SALES` | `OFFSITE_CONVERSIONS` (ya da `VALUE`, `LANDING_PAGE_VIEWS`, `LINK_CLICKS`, `IMPRESSIONS`, `REACH`) | `WEBSITE` | `pixel_id` + `custom_event_type` (`PURCHASE, INITIATE_CHECKOUT, ADD_PAYMENT_INFO, ADD_TO_CART, COMPLETE_REGISTRATION, DONATE, START_TRIAL, SUBSCRIBE, CONTENT_VIEW`) | `SHOP_NOW` | **Piksel zorunlu**; reklamda `conversion_domain` ("piksel paylaşan kampanyada oluşturma/güncellemede zorunlu"); CAPI önerilir (C-39 hazırlık kapısı) | [belge D7, D8, D10] | `SATIS` tur 1, derlenmiyor |
| **Sitemden kayıt / lead** | `OUTCOME_LEADS` | `OFFSITE_CONVERSIONS` (ya da `LANDING_PAGE_VIEWS, LINK_CLICKS, IMPRESSIONS, REACH`) | `WEBSITE` | `pixel_id` + `custom_event_type` (`LEAD, COMPLETE_REGISTRATION, CONTACT, FIND_LOCATION, SCHEDULE, START_TRIAL, SUBMIT_APPLICATION, SUBSCRIBE`) | `SIGN_UP` / `LEARN_MORE` | Piksel zorunlu, `conversion_domain` | [belge D8] | **YOK**: `SATIS` "satış ya da kayıt"ı tek satırda Satış amacıyla kuruyor (Ç-4) |
| **Daha çok kişi görsün** | `OUTCOME_AWARENESS` | `REACH` (ya da `AD_RECALL_LIFT`, `IMPRESSIONS`) | yok | `page_id` | `LEARN_MORE` | Gerekmez. `frequency_control_specs` YALNIZ `REACH` ve `THRUPLAY`'de yazılabiliyor | [belge D7, D8] | `ERISIM` tur 2 — frekans alanı manifestoda yok (Ç-7) |
| Video izlensin | `OUTCOME_AWARENESS` / `OUTCOME_ENGAGEMENT` | `THRUPLAY`, `TWO_SECOND_CONTINUOUS_VIDEO_VIEWS` | yok / `ON_VIDEO` | `page_id` / yok | — | Gerekmez | [belge D7, D8, D18] | yok |
| Paylaşımı öne çıkar | `OUTCOME_ENGAGEMENT` | `POST_ENGAGEMENT` (`IMPRESSIONS` v20'de bu hedef için kalktı) | `ON_POST` | — | — | — | [belge D7] | Akıllı Boost'a yönlendirme (karar 5) |

**Birleşime bağlı notlar**

- `billing_event`: Acemi'de her satırda `IMPRESSIONS` (Arama rehberi de böyle). [belge D15 · canlı-depo derle]
- Arama rehberinin ad set örneği `bid_amount` zorunlu sayıyor ve `publisher_platforms: [facebook]`,
  `device_platforms: [mobile]` yazıyor; derleyicinin `LOWEST_COST_WITHOUT_CAP` + yerleşimsiz kuralıyla
  çelişiyor. Rehber örneği bağlayıcı mı yoksa örnek mi, belge söylemiyor. [belge D15 · çıkarım] → Ö-4.
- CTWA'da `page_welcome_message` kreatif `object_story_spec` altında; varsayılan karşılama "Hello! Can I
  get more info on this?" (İngilizce!) — Türk kullanıcıya İngilizce karşılama gitmemesi için AÇIKÇA
  yazılmalı. [belge D11 · çıkarım] Numara konusu → CLAUDE.md "CLICK-TO-WHATSAPP'TA NUMARA SORULMAZ".
- Çağrı istemli (call prompt) mesajlaşma reklamında amaç **`OUTCOME_ENGAGEMENT` zorunlu.** [belge D11]
- Piksel/CAPI özet: piksel ZORUNLU yalnız `OFFSITE_CONVERSIONS`/`VALUE` (Satış, site-Lead) ve
  "nitelikli lead / dönüşüm lead'i" yollarında; LPV, form, mesaj, arama ve erişimde gerekmez. CAPI
  hiçbir Acemi niyetinde yayın koşulu değil, ama mesajlaşma ve lead "kalite" hedeflerinin ön koşulu.
  [belge D8 · R1]

### 2.3 Atıf penceresi (`attribution_spec`) — niyet başına

- Referans tablo (eski amaç adlarıyla): `CONVERSIONS / PRODUCT_CATALOG_SALES` + `OFFSITE_CONVERSIONS` →
  1g tık, 7g tık, 1g tık+1g gör, 7g tık+1g gör; `APP_INSTALLS` ayrı; `INCREMENTAL_OFFSITE_CONVERSIONS` →
  null. **"Diğer bütün optimization_goal ve objective birleşimlerinde attribution_spec için yalnız 1 gün
  tık kullanılabilir."** [belge D7]
- `learning_stage_info.attribution_windows` belgesi varsayılanı "1 gün görüntüleme ve 28 gün tık"
  diyor — 28 gün tık 2021'den beri yok; sayfa bayat. [belge D9 · çıkarım]
- Sonuç: derleyicinin her niyete yazdığı `tik7_gor1` LPV, CONVERSATIONS, QUALITY_CALL, REACH'te ya
  reddedilir ya da sessizce 1 gün tığa normalleştirilir. FORM provası canlıda geçti, ama provanın
  pencereyi doğrulayıp doğrulamadığı bilinmiyor. [canlı-depo 513926a · çıkarım] → Ç-3, Ö-2.

---

## 3. Video reklam

### 3.1 Yükleme

| Yol | Akış | Not | Kaynak |
|---|---|---|---|
| `/act_{id}/advideos` tek istek | `source` (çok parçalı) ya da `file_url` | Kodun bugün kullandığı yol | [belge D17 · canlı-depo `meta-graf.ts:133`] |
| `/act_{id}/advideos` parçalı | 1) `upload_phase=start` + `file_size` → `upload_session_id`, `video_id`, `start_offset`, `end_offset`; 2) `upload_phase=transfer` + `upload_session_id` + `start_offset` + `video_file_chunk` (Meta bir sonraki `start_offset/end_offset`'i döndürür; ikisi eşitlenince biter); 3) `upload_phase=finish` (+ `title`); `cancel` da var | Dönüşte `skip_upload`, `upload_domain`, `transcode_*` alanları var | [belge D17] |
| `/act_{id}/video_ads` + `rupload.facebook.com/video-ads-upload/v25.0/{video_id}` | 1) `upload_phase=start` → `video_id`, `upload_url`; 2) `Authorization: OAuth`, `offset`, `file_size` başlıklarıyla ham gövde ya da `file_url` başlığı; kesilirse `GET /{video_id}?fields=status` → `uploading_phase.bytes_transferred`'dan devam; 3) durum; 4) `upload_phase=finish` | "Resumable (non-chunking)". **"İşletme sistem kullanıcısıyla işletme hesaplarına yükleme henüz desteklenmiyor"**; kullanıcının hesapta `CREATE_CONTENT` görevi olmalı | [belge D16] |

- Belgelenen özellik (yeni yol): MP4 önerilir; 16:9–9:16; 10 GB'a kadar önerilir; **en az 1200 px
  genişlik**; 1280×720 önerilir; 24–60 fps; H.264/H.265/VP9/AV1; kapalı GOP 2–5 sn; AAC 128 kbps+,
  48 kHz stereo. [belge D16] 9:16 dikey videoda "genişlik 1200" kuralının nasıl yorumlandığı (kısa
  kenar mı?) belgede yok → giriş anında RET değil UYARI olmalı, ölçülene kadar. [çıkarım]
- Hata kodları (advideos): 352 desteklenmeyen biçim, 382 dosya çok küçük, 351/6000/6001 yükleme
  sorunu, 389 URL'den çekilemedi, 222 video görünmüyor. [belge D17]

### 3.2 İşlenme ve kullanılabilirlik

- `status.video_status` ∈ `ready | processing | expired | error`; alt evreler `uploading_phase`
  (`not_started | in_progress | complete | error`), `processing_phase`, `publishing_phase`. Küçük resim
  üretimi `processing_phase` içinde. Belgede işleme süresi ve "hazır" webhook'u yok → yoklama. [belge D16]
- Kreatif `video_data` için belgedeki her örnek `image_url` (küçük resim) taşıyor; canlıda kapaksız
  video kreatifi reddediliyor ve kod kapağı `image_hash` olarak gönderiyor. [belge D18 · canlı-depo 2979fa8]
- `video_id` reklam hesabıyla ilişkili olmalı (hesaplar arası taşınmaz). [belge D18]

### 3.3 Oranlar ve yerleşime göre varlık

- Yerleşim → oran tablosu ve "4:5 akış / 9:16 Stories-Reels" kuralı → R1 §4.5, R6 §1, C-25.
- **PAC belgesi (2026-06-28 güncel) bayat ve eksik:** `customization_spec.facebook_positions` =
  `feed, right_hand_column, marketplace, video_feeds, search, story, notification` — `video_feeds` v24'te
  kaldırıldı ve belirtilirse hata; `facebook_reels` yok. `instagram_positions` = `stream, story, explore,
  explore_home, profile_feed, ig_search` — **`reels` yok**, `explore` v26'da kaldırıldı. Her
  `asset_feed_spec` en az iki kural ister; desteklenen amaçlar eski adlarla (`APP_INSTALLS, BRAND_AWARENESS,
  CONVERSIONS, LEAD_GENERATION, LINK_CLICKS, REACH, VIDEO_VIEWS`); mevcut gönderiyle PAC artık API'de yok.
  [belge D20, D21, D4, D6] → 9:16 videonun Reels'te, 4:5'in akışta gösterilmesini PAC ile garanti etmenin
  belgeli yolu yok; C-26'nın hükmü güçleniyor.
- **Multi-media ads (2026-05 güncel):** bir reklamda 10'a kadar görsel+video, "yerleşim, metin, kırpma ve
  hedef için medya başına özelleştirme korunarak"; `media_sourcing_spec.images[] / videos[]`, her öğede
  `source: "multi_media"` ve `opt_in_status: "opt_in"`; ana medya `object_story_spec`'te de olmalı;
  aynı hash/video iki kez reddedilir. [belge D19] `opt_in` Meta'nın medyayı seçmesine izin vermek demek
  (Advantage+ creative ailesi) → C-27 kapsamında kullanıcı kararı. [çıkarım]
- Acemi için öneri (C-26 ile uyumlu): görselde tek 9:16 ana görsel + `image_crops`; videoda TEK video —
  dikey 9:16 yüklenirse Reels/Stories doğal, akışta Meta'nın 4:5 kırpması (bunu `adapt_to_placement`
  yapıyor ve kapatılamıyor, §1.5) önizlemede gösterilir. [çıkarım]

---

## 4. Prova ve güvenlik

### 4.1 `execution_options` ve satır içi spec'ler

- Kampanya ve ad set: `validate_only`, `include_recommendations` (ikincisi tek başına kullanılmaz).
  Kreatif: `validate_only`. Reklam: `validate_only`, `synchronous_ad_review`, `include_recommendations`.
  Geçerse `{"success": true}`. [belge D7, D8, D10] → C-42 belgeyle doğrulandı.
- **Ad set `campaign_spec`:** "Bir kampanya için `name`, `objective` ve `buying_type` verin; aksi hâlde
  `campaign_id` gerekir." Örnek hâlâ `"objective": "CONVERSIONS"`. Bütçe, teklif stratejisi ve
  `special_ad_categories`'in satır içi spec'te kabul edildiği BELGEDE YOK. [belge D8]
- **Reklam `adset_spec`:** "Spec verildiğinde `adset_id` gerekmez." `creative` kimlik ya da satır içi
  spec olabilir. [belge D10]
- **Canlı-depo:** `/adsets` + `campaign_spec` provası her denemede 5xx; aynı ad set gövdesi `/ads`
  provasının `adset_spec`'i içinde geçiyor. Kod yalnız BELİRSİZ sonucu, yalnız bütün reklam provaları
  geçtiyse çeviriyor. [canlı-depo 513926a, `prova-isleyici.ts:38`] Belgede 5xx'in karşılığı yok; iki
  aday açıklama [çıkarım]: (a) `prova.ts:79` satır içi kampanyaya belgelenmemiş alanları da koyuyor
  (`daily_budget`, `bid_strategy`, `special_ad_categories`...) — ama aynı nesne `adset_spec` içinde
  geçtiği için zayıf; (b) `/adsets` ucunun ODAX amaçlarıyla satır içi kampanya işleyişi bozuk (belge
  örneğinin hâlâ eski amaç taşıması bunu destekliyor). → Ö-3.
- **`synchronous_ad_review`:** yalnız `validate_only` ile; "mesaj dili kontrolü, görseldeki %20 metin
  kuralı vb." bütünlük doğrulaması; **"sonuç tam incelemenin nihai kararını temsil etmez"**. [belge D10]
- **Oluşturma sonrası:** v4'ten beri ağır işler "post-processing"te; kampanya/ad set/reklam
  `effective_status = IN_PROCESS`, kreatif `status = IN-PROCESS` (tireli!). Başarısızsa nesne
  `WITH_ISSUES` ve hata `issues_info` içinde (`level`, `error_code`, `error_summary`, `error_message`).
  IN_PROCESS iken nesne güncellenebilir. [belge D27] → "oluşturuldu" ≠ "sağlam"; geri okuma
  IN_PROCESS bitene kadar bekleyip `issues_info` okumalı. [çıkarım]
- Reklamda inceleme sebebi alanı `ad_review_feedback` (referans); webhook sayfasının `review_feedback`
  demesi → R4 §3.8 çelişkisi sürüyor. [belge D10]

### 4.2 Özel reklam kategorileri

- Kampanya enum'u: `NONE, EMPLOYMENT, HOUSING, CREDIT, ISSUES_ELECTIONS_POLITICS,
  ONLINE_GAMBLING_AND_GAMING, FINANCIAL_PRODUCTS_SERVICES`; `special_ad_category_country` listesinde
  `TR` var. [belge D7] CREDIT emekli → C-7; Türkiye ve konut → C-4..C-6, R3.
- Ad set `regional_regulated_categories` Tayvan, Avustralya, Hindistan, Singapur, Tayland, Malezya,
  Brezilya için; **Türkiye için değer yok.** AB hedeflemesinde `dsa_beneficiary`/`dsa_payor` zorunlu
  (yoksa yayın yok). [belge D8] → Yurt dışı hedeflemeli niyet (ör. sağlık turizmi, C-1) AB içeriyorsa DSA
  alanları ve Tayland/Malezya/Brezilya gibi ülkelerde "Beneficiary/payer is missing" (3858634, 3858636)
  hatası için ülke→kural tablosu gerekir. [çıkarım]
- 2025-09-02'den beri bayraklı özel kitle / özel dönüşüm içeren ad set'te `issues_info` her bayraklı öğe
  için bir satır taşıyor (sağlık/finans verisi bayrakları). [belge D8] → C-39(B) "veri kaynağı kategorisi"
  kontrolünün okunabilir bir yüzü.

### 4.3 Harcama güvenliği

- Kampanya `spend_cap`: para biriminin alt birimi cinsinden, **en az 100 $ karşılığı**;
  `922337203685478` kaldırır; R&F'de yok. [belge D7] Ad set `daily_spend_cap` / `lifetime_spend_cap`
  CBO'da. [belge D8]
- Günlük bütçe %75 esnek, haftalık tavan 7×. [belge D4] Yani "günde en çok X" sözü verilemez; söz
  verilebilecek tek tavan kampanya `spend_cap`'i ya da toplam bütçe. Acemi'de günlük bütçe seçilirse
  ekranın "bir günde X'in %75 fazlasına kadar harcanabilir, haftalık toplam 7×X'i geçmez" demesi
  gerekir. [çıkarım]
- Hesap düzeyi harcama limiti (hesabın `spend_cap`/`amount_spent`) ve `account_status`/
  `disable_reason` → R4 §2.6, §4.3 (bu turda yeniden okunmadı).

### 4.4 Hız sınırı

- BUC/hesap/uygulama başlıkları, `17/2446079` → R4 §3.5. Bu turda yeni: kampanya referansı hata
  kodlarında `613` ("bu API'ye çağrı sınırı aşıldı") ve `80004` ("bu reklam hesabına çok fazla çağrı")
  ayrı listeleniyor; ikisi farklı kova. [belge D7]
- Prova çağrıları da aynı `ads_management` kovasından yiyor mu → belgede yok (C-43 en dar okumayı
  uyguluyor). [çıkarım]

---

## 5. Optimizasyon için okunacak sinyaller

### 5.1 Nesne alanları (yoklama, ad set/reklam başına)

| Alan | Seviye | İçerik | Kaynak |
|---|---|---|---|
| `learning_stage_info` | ad set | `status` ∈ `LEARNING` / `SUCCESS` / `FAIL`; `conversions` (son önemli düzenlemeden beri); `last_sig_edit_ts`; `attribution_windows`; `dynamic_lp_status`, `dynamic_lp_conversions_threshold` | [belge D8, D9] |
| `issues_info` | kampanya, ad set, reklam | "Teslimatı engelleyen sorunlar" | [belge D7, D8, D27] |
| `recommendations` | kampanya, ad set, reklam | Yalnız öneri varsa döner | [belge D8, D10] |
| `advantage_state_info` | kampanya | §1.1 | [belge D1] |
| `effective_status` | hepsi | `ACTIVE, PAUSED, PENDING_REVIEW, DISAPPROVED, PREAPPROVED, PENDING_BILLING_INFO, CAMPAIGN_PAUSED, ADSET_PAUSED, ARCHIVED, DELETED, WITH_ISSUES, IN_PROCESS` | [belge D27] |
| `ad_review_feedback` | reklam | Ret sebebi | [belge D10] |
| `budget_remaining` | ad set | | [belge D8] |

### 5.2 Hesap düzeyi: Opportunity Score ve öneriler

- `GET /act_{id}/recommendations` (ve işletme düzeyinde `GET /{business_id}/recommendations`, sayfada
  en çok 100 hesap, `ad_account_ids` en çok 100). `opportunity_score` 0–100, "neredeyse gerçek zamanlı"
  güncelleniyor. Öneri alanları: `recommendation_signature` (uygulamak için; öneri geçersizleşince
  ölür), `recommendation_stage`, `type`/`recommendation_name`, `level` (`ad / ad_set / campaign /
  ad_account`), `object_ids`, `recommendation_content.{lift_estimate, body, opportunity_score_lift}`,
  `url` (Ads Manager derin bağlantısı). [belge D24]
- Evreler: **`pre_create_guidance`** (oluşturma akışına girmeden hesap düzeyi fırsatlar),
  `pre_flight_recommendation` (taslak nesnede), `mid_flight_recommendation` (yayındaki nesne). [belge D24]
  → AdvCampaign sohbetinin İLK adımında `pre_create_guidance` okunup AI'a bağlam verilebilir (ör.
  "hesabınızda parçalanma var"). [çıkarım]
- **API'den uygulanabilen 14 tür:** `ADVANTAGE_PLUS_AUDIENCE`, `APLUSC_STANDARD_ENHANCEMENTS_BUNDLE`,
  `AUTOFLOW_OPT_IN`, `AUTOMATIC_PLACEMENTS`, `BACKGROUND_GENERATION`, `CONVERSION_LEADS_OPTIMIZATION`,
  `CREATIVE_FATIGUE`, `LANDING_PAGE_VIEW_OPTIMIZATION_GOAL`, `MUSIC`, `PERFORMANT_CREATIVE_REELS_OPT_IN`,
  `PRODUCT_SET_BOOSTING`, `SCALE_GOOD_CAMPAIGN` (`adsets`/`campaigns`), `SHOPS_ADS_SAOFF`, `UNCROP_IMAGE`.
  Uygulama `POST /act_{id}/recommendations` + `recommendation_signature` + `extra_data`. Uygulanamayanlar
  (derin bağlantı/özel akış): `BUDGET_LIMITED`, CAPI türleri, `FRAGMENTATION_V3`, `GEN_AI_MVP`,
  `MESSAGING_EVENTS`, `MULTI_TEXT`, `OFFSITE_CONVERSION`, `PIXEL_UPSELL`, `VALUE_OPTIMIZATION_GOAL` vb.
  [belge D24, D25]
- **Uyarı:** "Meta'nın performans önerilerini uygulayarak Facebook Hizmet Şartlarını ... kabul etmiş
  olursunuz." API, Ads Manager'dan daha az öneri döndürebilir. [belge D24] → uygulama İNSAN onaylı bir
  eylem olmalı; AI'a uygulama aracı verilmez (R5 B5.3). Üretken türler (`BACKGROUND_GENERATION`,
  `UNCROP_IMAGE`, `MUSIC`, `APLUSC_*`) C-27 gereği yalnız Gelişmiş'te ve müşteri onayıyla. [çıkarım]
- Insights'ta `opportunity_score_l4` alanı da var (açıklamasız). [belge D26]

### 5.3 Insights alanları

| Alan | Ne için | Not | Kaynak |
|---|---|---|---|
| `results`, `cost_per_result`, `objective_results`, `cost_per_objective_result`, `result_rate` | Niyetin sonucu, amaçtan türetilmiş | "Sonuç" tanımı amaç+ayarlardan; panelin kendi eylem eşlemesiyle ayrışabilir | [belge D26, D30] |
| `frequency` | Yorgunluk | "Tahmini" | [belge D26, D30] |
| `quality_ranking`, `engagement_rate_ranking`, `conversion_rate_ranking` | Kreatif/sayfa sorunu | Ad set ve reklam; `ABOVE_AVERAGE / AVERAGE / BELOW_AVERAGE_35/_20/_10 / UNKNOWN` | [belge D30] |
| `creative_fatigue_summary`, `creative_fatigued_ads` | Meta'nın kendi yorgunluk teşhisi | Yapısı belgede açıklanmıyor | [belge D26] |
| `creative_diversity_score`, `creative_diversity_label`, `creative_diversity_data` | Andromeda sonrası çeşitlilik | Açıklamasız; anlamı canlıda ölçülmeli | [belge D26] |
| `deduping_ratio`, `deduping_1st/2nd/3rd_source_ratio` | Kitle örtüşmesi → açık artırma kaybı | Parçalanma teşhisi | [belge D26] |
| `attribution_setting` | Satırın atıf penceresi | C-22 | [belge D26] |
| `landing_page_view_per_link_click` | Site yavaşlığı / tık kalitesi | | [belge D26] |
| `today_spend` | Gün içi tempo | Hesap saat dilimi | [belge D26] |
| `inline_link_clicks`, `inline_post_engagement` | | **Sabit 1 gün tık atfı** — diğer metriklerle aynı pencerede değil | [belge D26] |

### 5.4 Öneri kuralları (AdvCampaign için taslak — [çıkarım], eşikler kullanıcı kararı)

Genel ilke: Meta'nın kendi teşhisi (öneri türü, `learning_stage_info`, yorgunluk alanları) Advetics'in
eşiğinden ÖNCE gelir; Advetics eşiği yalnız Meta sustuğunda ve "Advetics önerisi" etiketiyle.
Öğrenmedeki ad set'e (`LEARNING`) değişiklik ÖNERİLMEZ, yalnız bilgi verilir — önemli düzenleme listesi
→ R1 §2.2. Her kural minimum veri ister; yetmiyorsa "henüz karar için veri yok" (emptyReason deseni).

| Durum | Sinyal | Öneri | Uygulayan |
|---|---|---|---|
| Bütçe sınırlı ve iyi | `SUCCESS` + `cost_per_result` hedefte + öneri `BUDGET_LIMITED` ya da `SCALE_GOOD_CAMPAIGN` | Bütçe artışı (tutarı kullanıcı seçer; büyüklüğe bağlı sıfırlama uyarısıyla) | İnsan onayı → kural motoru → geri oku |
| Öğrenme sınırlı | `FAIL` 7+ gün | Aynı niyette ad set/kampanya birleştirme, daha sık olay (C-39), bütçe | İnsan |
| Kreatif yorgun | `creative_fatigued_ads` / `CREATIVE_FATIGUE` önerisi / webhook `creative_fatigue` HIGH | Yeni KAVRAM (farklı fikir), eski reklam açık kalabilir → C-37 | AI taslak, insan onay; Meta'nın "ACTIVE kur" örneği kopyalanmaz (R6 §2.5) |
| Sıralama düşük | Rozet `BELOW_AVERAGE_*` (`UNKNOWN` değilse) | Kalite → kreatif/metin; dönüşüm → açılış sayfası/form | Bilgi + taslak |
| Parçalanma | `deduping_ratio` yüksek ya da `FRAGMENTATION_V3` | Birleştirme | İnsan |
| Hiç teslimat yok | `issues_info` dolu / `WITH_ISSUES` / `DISAPPROVED` | Sebebi Meta'nın cümlesiyle göster, düzeltme taslağı | AI taslak |
| Advantage+ kapandı | `advantage_state_info` alt durumu `DISABLED` | Sebebi (bütçe/kitle/yerleşim) söyle | Bilgi |

---

## Mevcut kodla çelişen / eksik noktalar

- **Ç-1. `yanki.ts:300-318` — tanımsız özellik `OPT_IN` dönerse yayın durur; belge `adapt_to_placement`'ı
  "varsayılan OPT_IN" diyor.** Meta okumada bu anahtarı (ya da başka varsayılan-açık bir özelliği)
  döndürürse HER yayın "Meta tanımadığımız bir özelliği açtı" ile durur; döndürmezse özellik açık olduğu
  hâlde görünmez. İki durum da sessiz değil ama ilki ürünü kilitler. [belge D22 · canlı-depo yanki.ts]
- **Ç-2. `derle.ts` `kapattiklarimiz` → "Meta'nın yapay zekâyla görseli ve metni değiştirmesi kapalı."**
  Gönderilen OPT_OUT kümesi (7 anahtar) belgedeki `text_optimizations`, `image_touchups`,
  `adapt_to_placement`, `video_auto_crop`, `inline_comment`'i içermiyor. Cümle geri okumayla
  kanıtlanmadan ekranda söz olamaz; kanıtlanamazsa "kapatamadıklarımız" diye ayrı satır gerekir.
  [belge D22, D23 · canlı-depo derle.ts]
- **Ç-3. `derle.ts` `ATIF_SPEC` her niyete aynı.** Referans tablo LPV/CONVERSATIONS/QUALITY_CALL/REACH'te
  yalnız 1 gün tık diyor. C-22 (2) zaten "niyet satırı başına" diyor; kod henüz değil. [belge D7]
- **Ç-4. `niyetler.ts` `SATIS` = "satış ya da kayıt", `OUTCOME_SALES`.** `LEAD` olayı Satış'ın dönüşüm
  konumunda yok; kayıt/lead toplayan site Lead amacında kurulmalı (ve ancak orada `ADVANTAGE_PLUS_LEADS`
  olur). Ayrı `SITE_LEAD` niyeti ya da olay türüne göre amaç seçen bir dal gerekiyor. [belge D8]
- **Ç-5. `niyetler.ts` `ARAMA`: `destination_type: 'PHONE_CALL'`** yazma enum'unda yok; rehber
  `bid_amount` ve elle yerleşim istiyor; CTA'da `tel:+` biçimi ve numaranın hedef ülkeyle aynı olması
  kuralı katalogda/doğrulamada yok (giriş anında doğrulanmalı). [belge D8, D15]
- **Ç-6. `niyetler.ts` `IG_MESAJ` ve `COK_KANAL_MESAJ` Etkileşim'de — belgeyle uyumlu**; ama
  `COK_KANAL_MESAJ`'ın `cta: 'kanal_basina'` değeri derleyicide karşılıksız: belge
  `asset_feed_spec.optimization_type = DOF_MESSAGING_DESTINATION` + `call_to_actions[]` istiyor. Lead
  amacına taşınmamalı (belge izin vermiyor). [belge D12, D13]
- **Ç-7. `ERISIM`: `frequency_control_specs` yazılmıyor.** Yazılmazsa frekans hesabın/Meta'nın
  varsayılanına kalır; manifestoya bir satır gerekir (değer kullanıcı kararı). [belge D8 · çıkarım]
- **Ç-8. `SITE_MESAJ`: mesaj eklentisi (`asset_feed_spec.message_extensions`) için katalogda alan yok**;
  bugünkü satır düz Trafik kampanyası kurar ve "isterlerse yazsınlar" vaadi sessizce düşer. [belge D14]
- **Ç-9. `advantage_state_info` hiçbir yerde okunmuyor** (yalnız `niyetler.ts:112` yorumunda). C-47
  "beklenen advantage_state tablosu" diyor; geri okuma sorgusuna eklenmeli. [belge D1 · canlı-depo grep]
- **Ç-10. `meta-graf.ts:videoYukle/videoDurumu`:** (a) tek istekte `source` — büyük dosyada zaman aşımı
  ve kısmi yüklemede baştan başlama; belgeli parçalı/sürdürülebilir yollar kullanılmıyor. (b)
  `video_status = expired` "isleniyor" sayılıyor → 15 dakikalık sessiz bekleme, sonra yanlış teşhis
  ("zaman aşımı"). `expired` ayrı, kesin hata olmalı. [belge D16, D17]
- **Ç-11. `prova.ts:79` satır içi `campaign_spec`'e belgelenmemiş alanlar koyuyor** (bütçe, teklif,
  kategoriler). 513926a'nın çevirisi doğru yönde; `/adsets` provası belgede 3 alanlı tanımlı olduğu için
  ya kaldırılmalı ya da 3 alana indirilip ölçülmeli. Ayrıca `kampanya` provası bütçe/kategoriyi zaten
  doğruluyor. [belge D8 · canlı-depo]
- **Ç-12. `SATIS` derlenirken reklamda `conversion_domain` manifestoda yok** — belge "piksel paylaşan
  kampanyada zorunlu" diyor (C-39 bunu kullanıcıya soru olarak tutuyor; manifesto satırı eksik).
  [belge D10]
- **Ç-13. Modülde `learning_stage_info`, `issues_info`, `recommendations`, `/act/recommendations`,
  sıralama rozetleri ve yorgunluk alanları okunmuyor.** AdvCampaign'in "yönlendiren sistem" vaadi bu
  sinyaller olmadan Advetics'in kendi eşiklerine kalır. [canlı-depo grep]
- **Ç-14. Geri okumada `IN_PROCESS` / `IN-PROCESS` (kreatifte tireli) ayrı hâl olarak ele alınmalı**;
  oluşturma "başarılı" dönse de nesne `WITH_ISSUES`'a düşebilir. [belge D27]
- **Ç-15. CTWA `page_welcome_message` yazılmazsa İngilizce varsayılan karşılama** gider; WHATSAPP
  derlenirken açıkça Türkçe yazılmalı (platform varsayılanına güvenme). [belge D11]

## Canlıda ölçülmesi gerekenler

Hepsi `validate_only` ya da PAUSED kur → geri oku → arşivle ile, ajansın kendi hesabında (R4 m.3).

- **Ö-1. Advantage+ creative varsayılanları:** FORM ve SITE için PAUSED kreatif kurup
  `degrees_of_freedom_spec` geri oku: `adapt_to_placement`, `text_optimizations`, `image_touchups`,
  `inline_comment` dönüyor mu, değeri ne? Küçük harfli anahtarı `/adcreatives` (standalone) ucunda
  `OPT_OUT` ile denemek de kabul ediliyor mu (canlı ret `/ads` satır içi kreatifte miydi?).
- **Ö-2. Atıf penceresi niyet başına:** her niyet için `tik7_gor1`, `tik7`, `tik1` → kabul / ret /
  normalleştirme (geri okunan `attribution_spec`).
- **Ö-3. `/adsets` + `campaign_spec` 5xx:** yalnız `name/objective/buying_type` ile tekrarla; geçerse
  sebep fazladan alanlar, geçmezse uç bozuk (ve prova adımı kaldırılır).
- **Ö-4. ARAMA:** `OUTCOME_LEADS + QUALITY_CALL + PHONE_CALL`, `bid_amount` olmadan ve yerleşimsiz;
  reddedilirse `OUTCOME_TRAFFIC`; geri okumada yerleşimin Meta tarafından daraltılıp daraltılmadığı ve
  `advantage_state_info`.
- **Ö-5. WHATSAPP (Lead) ve FORM için `advantage_state_info`:** `ADVANTAGE_PLUS_LEADS` dönüyor mu;
  Trafik/Etkileşim niyetlerinde alan dönüyor mu ve ne dönüyor.
- **Ö-6. Lead-from-sohbet hedefleri:** `LEAD_FROM_MESSENGER` / `LEAD_FROM_IG_DIRECT` yazma enum'unda yok;
  kabul ediliyor mu (Gelişmiş adayı).
- **Ö-7. Site-Lead (`OUTCOME_LEADS + OFFSITE_CONVERSIONS + LEAD`)** ile `OUTCOME_SALES + COMPLETE_REGISTRATION`
  karşılaştırması: hangisi `ADVANTAGE_PLUS_*` veriyor.
- **Ö-8. Video:** (a) `expired` ne zaman oluyor; (b) 9:16 1080×1920 video "en az 1200 px genişlik"
  kuralına takılıyor mu; (c) sistem kullanıcısı token'ıyla `/advideos` ve `/video_ads` (R4 m.11'deki
  belirsizlik); (d) parçalı yükleme sınırı (tek istekte kabul edilen en büyük `source`).
- **Ö-9. `placement_soft_opt_out` yazılınca `advantage_placement_state`** ENABLED kalıyor mu.
- **Ö-10. `/act/recommendations`:** Türkiye hesaplarında hangi türler ve evreler dönüyor;
  `pre_create_guidance` boş mu; işletme düzeyi çağrı ajans portföyündeki müşteri hesaplarını döndürüyor
  mu ("yalnız sahip olunan hesaplar" notu ajans modelinde kritik).
- **Ö-11. Insights:** `creative_fatigue_summary`, `creative_fatigued_ads`, `creative_diversity_*`,
  `opportunity_score_l4` gerçek yapısı ve hangi seviyede dolu döndüğü; sıralama rozetlerinin `UNKNOWN`'dan
  çıktığı gösterim sayısı.
- **Ö-12. CTWA `page_welcome_message`** Türkçe metinle kabul ve geri okuma; WhatsApp sayfaya bağlı değilse
  hata kodu (giriş anında yakalanacak hâlin imzası).
- **Ö-13. Satış:** `conversion_domain` yazılmazsa ret mi otomatik doldurma mı (belge "mevcut reklamlar
  için hedef adreslerden çıkarılır" diyor — yeni reklam için belirsiz).

---

## Kaynaklar

Belge (bu turda okundu; tarih sayfanın "Updated" bilgisi):

- [D1] Advantage+ Campaign Experience for Sales, App, and Leads (2026-06-17) —
  https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-campaigns
- [D2] Blog: Advantage+ Campaign Experience for Sales and App (2025-06-03) —
  https://developers.facebook.com/blog/post/2025/06/03/advantage-plus-campaign-experience-for-sales-and-app/
- [D3] Marketing API Changelog v23.0 —
  https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog/version23.0
- [D4] Changelog v24.0 — https://developers.facebook.com/docs/marketing-api/marketing-api-changelog/version24.0/
- [D5] Changelog v25.0 — https://developers.facebook.com/docs/marketing-api/marketing-api-changelog/version25.0/
- [D6] Changelog v26.0 —
  https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog/version26.0
- [D7] Ad Campaign (campaign) referansı: ODAX eşleme tablosu, attribution tablosu, `spend_cap`, özel kategori
  enum'u, hata kodları — https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-group/
- [D8] Ad Set referansı: `destination_type`/`optimization_goal` enum'ları, dönüşüm konumu tablosu,
  `campaign_spec`, `execution_options`, `learning_stage_info`, `issues_info`, `regional_regulated_categories`,
  DSA — https://developers.facebook.com/docs/marketing-api/reference/ad-campaign/
- [D9] AdCampaignLearningStageInfo —
  https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-learning-stage-info/
- [D10] Ad referansı: `adset_spec`, `synchronous_ad_review`, `conversion_domain`, `ad_review_feedback` —
  https://developers.facebook.com/docs/marketing-api/reference/adgroup/
- [D11] Ads that Click to WhatsApp —
  https://developers.facebook.com/docs/marketing-api/ad-creative/messaging-ads/click-to-whatsapp
- [D12] Ads that Click to Instagram (2026-05-21) —
  https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/messaging-ads/click-to-instagram
- [D13] Ads that Click to Multidestination (2026-06-21) —
  https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/messaging-ads/click-to-multidestination
- [D14] Website ads that click to message (2026-05-07) —
  https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/messaging-ads/website-ads-click-to-message
- [D15] Call Ads (2026-05-21) — https://developers.facebook.com/documentation/ads-commerce/marketing-api/call-ads
- [D16] FB Video Ads (2026-05-21) —
  https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/videoads/fbvideoads
- [D17] Ad Account Ad Videos referansı (2026-02-24) —
  https://developers.facebook.com/docs/marketing-api/reference/ad-account/advideos/
- [D18] Video and Carousel Ads (2026-06-28) —
  https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/videoads
- [D19] Multi-media ads (2026-05-06) —
  https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/multi-media-ads
- [D20] Placement Asset Customization (2026-06-28) —
  https://developers.facebook.com/documentation/ads-commerce/marketing-api/dynamic-creative/placement-asset-customization
- [D21] Asset Customization Rules (2026-06-28) —
  https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/asset-feed-spec/asset-customization-rules
- [D22] Get Started with Advantage+ Creative (2026-06-28) —
  https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative/advantage-creative/get-started
- [D23] Blog: Marketing API v22.0 Impacts to Advantage+ Creative Enhancements (2025-01-17) —
  https://developers.facebook.com/blog/post/2025/01/17/marketing-api-v22-impacts-to-advantage-plus-creative-enhancements/
- [D24] Opportunity Score and Recommendations (2026-06-16) —
  https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview/performance-recommendations
- [D25] Blog: Unlock peak performance with new opportunity score features (2025-11-10, Mart 2026 güncellemesi) —
  https://developers.facebook.com/blog/post/2025/11/10/unlock-peak-performance-with-new-opportunity-score-features-in-the-marketing-api/
- [D26] Ad Insights / Ad Account Insights referansları —
  https://developers.facebook.com/documentation/ads-commerce/graph-api/reference/adgroup/insights ·
  https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/insights
- [D27] Post-Processing for Ad Creation and Edits (2026-06-26) —
  https://developers.facebook.com/documentation/ads-commerce/marketing-api/using-the-api/post-processing
- [D28] Blog: Removal of detailed targeting exclusions (2025-01-21) —
  https://developers.facebook.com/blog/post/2025/01/21/removal-of-detailed-targeting-exclusions/
- [D30] Meta Ads MCP alan kataloğu (`ads_get_field_context`, 2026-10-07): `quality_ranking`,
  `engagement_rate_ranking`, `conversion_rate_ranking`, `frequency`, `results`, `cost_per_result`.

Canlı-depo:

- `CLAUDE.md` → "Canlıda öğrenilen platform gerçekleri → Meta" (kreatif özellik anahtarları, CTWA,
  `destination_type`, `geo_locations`).
- Commit `513926a` (adset provası 5xx → `adset_spec` içinde geçiyor), `2979fa8` (video: kapak zorunlu,
  `ready` beklenir), `f6e7f70` (7 büyük harfli anahtar).
- Kod: `packages/shared/src/reklam/meta/derle.ts`, `niyetler.ts`, `hedefleme.ts`, `prova.ts`, `yanki.ts`;
  `apps/api/src/modules/reklam/meta-graf.ts`, `prova-isleyici.ts`.

Depodaki önceki araştırma (tekrar edilmedi, atıf yapıldı): `docs/meta-reklam-brief/arastirma/R1`, `R3`,
`R4`, `R5`, `R6`; `docs/meta-reklam-brief/tasarim/hukumler.md` (C-1…C-52).
