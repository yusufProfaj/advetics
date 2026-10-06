# 04 — Bütçe, teklif, Advantage+, ölçüm (Insights), otomatik kurallar ve testler

> Kaynak: 45 sayfa (`_listeler/E-butce.txt`) · Okunan: 45/45 · Bilgi belgeden, canlıda doğrulanmadı.
>
> Not: `bid-multiplier` sayfasının (72 KB) kavram, geçiş ve API bölümleri tam okundu; sondaki
> "kitle kategorisi" başvuru listesinde değer tabloları ve açıklamalar okundu, tekrar eden JSON
> çevirileri atlandı. `ad-study/*` kenar sayfaları yalnızca boş okuma iskeleti taşıyor.
>
> Belgeler kendi içinde birçok yerde ÇELİŞİYOR. Çelişkiler aşağıda "belgede çelişkili" diye
> ayrıca işaretlendi; hiçbiri tahminle çözülmedi.

## Özet: Advetics için ne demek

1. **`action_report_time=impression` artık etkisiz olabilir.** Insights "Limits and Best
   Practices" sayfası 10 Haziran 2025'ten beri `use_unified_attribution_setting` ve
   `action_report_time` parametrelerinin **yok sayıldığını**, API'nin Ads Manager'ı taklit
   ettiğini yazıyor: atıf ad set ayarından, rapor zamanı `mixed` (Meta içi eylemler gösterim
   gününe, site satın alması gibi Meta dışı eylemler DÖNÜŞÜM gününe). Advetics
   `meta.provider.ts` içinde `impression` gönderiyor ve yorumu "dönüşüm gösterim gününe
   yazılıyor" diyor — belgeye göre bu cümle Meta dışı dönüşümler için artık doğru değil ve hata
   dönmüyor. Aynı sayfanın son cümlesi ise "varsayılan davranış farklı, aynısını istiyorsan
   `true` gönder" diyor: **belgede çelişkili**. Canlıda ölçülmeli (aynı gün için `impression` /
   `conversion` / `mixed` ile üç çağrı, sonuç aynı mı).
2. **Günlük bütçe sert tavan DEĞİL.** "Budgets" sayfası günlük bütçenin bazı günler **%25'e
   kadar** aşılabileceğini söylüyor; "Ad set budget sharing" sayfası aynı kavrama "daily budget
   flexibility **%75**" diyor ve haftalık tavanı günlük × 7 olarak veriyor. **Belgede
   çelişkili.** Advetics'in bütçe bekçisi ve AI, günlük harcamanın günlük bütçeyi geçmesini
   hata saymamalı; kontrol haftalık/aylık toplam üzerinden yapılmalı.
3. **Advantage+ durumu bir ALAN değil, SONUÇ.** `advantage_state` salt okunur; kampanya,
   bütçe kampanyada + yerleşim kısıtı yok + (en az bir ad set'te) Advantage+ kitle ya da
   "yalnızca `geo_locations`" koşullarını sağlayınca kendiliğinden `ADVANTAGE_PLUS_SALES/APP/
   LEADS` oluyor. Advantage+ yerleşim API'de **varsayılan**. Yani Advetics'in "kampanya
   bütçesi + yalnızca ülke hedefi" ile kurduğu bir satış kampanyası, hiç istenmeden
   Advantage+ olarak işaretlenebilir. Doğrulama: `GET /{campaign}?fields=advantage_state_info`.
4. **Eski ASC/AAC yolu kapandı.** `smart_promotion_type=AUTOMATED_SHOPPING_ADS` /
   `SMART_APP_PROMOTION` ile oluşturma v25.0'dan itibaren HER sürümde hata. Eski ASC'ler
   v25'te düzenlenemiyor (yalnızca göç), v26'da tamamen kilitleniyor;
   `existing_customer_budget_percentage` kullananlar v26'da **duraklatılıyor**. Göç
   (`migrate_to_advantage_plus`) kampanyayı **öğrenme aşamasına zorluyor**, istisnası yok.
5. **Bütçe/teklif değiştirme sıklığı belgede tek bir cümleye bağlı:** değişiklik sistemi yeni
   optimum teklifi öğrenmeye zorlar; gerekiyorsa **günde en fazla 2–3 kez ve günün erken
   saatlerinde**. "Öğrenme aşamasını sıfırlayan değişikliklerin" listesi bu sayfalarda YOK —
   AI bu konuda kural uyduramaz.
6. **`is_adset_budget_sharing_enabled` v24'ten beri zorunlu** (kampanya bütçesi yoksa; hata
   4834011). Advetics bunu `false` gönderiyor — belgeyle uyuşuyor. Ortada çalışan kampanyada
   AÇILAMIYOR (3858418), açıkken teklif stratejisi değiştirilemiyor (4834006).
7. **Teklif birimleri tuzaklı:** bütçe ve `bid_amount` hesap para biriminin EN KÜÇÜK biriminde
   (TRY için kuruş); `roas_average_floor` ise **10.000 ile ölçeklenmiş tamsayı** (1,5 ROAS =
   `15000`). Kural motoru filtrelerinde de para "taban birim" (1000 `spent` = 10,00 USD).
8. **Meta'nın yerleşik kural motoru (`adrules_library`) güçlü ama tuzaklı:** güncellemede spec
   TAMAMEN yeniden gönderilmeli (eksik alan düşüyor), `effective_status` süzgeci gizlice
   ekleniyor, `entity_type` kuralı SONRADAN açılan nesneleri de kapsıyor, `REBALANCE_BUDGET`
   bağışçı ad set'leri **duraklatıyor**, `CHANGE_BUDGET`'in sayaç sınırı varsayılan olarak
   SONSUZ. Advetics'in kendi motoru varken ikisini birlikte açmak çift karar demek.
9. **Insights'ta veri kayıyor:** metrikler 15 dakikada bir yenileniyor ve 28 güne kadar
   değişebiliyor; 13 aydan eski tarihlerde kırılımlı sorguda `reach`/`frequency`/`cpp`
   **sessizce düşüyor**; saatlik kırılımda `reach` ve `frequency` **0** dönüyor. "37 ay"
   saklama sınırı bu sayfalarda GEÇMİYOR.
10. **Bid multiplier 2027'de kalkıyor;** yerini value rules alıyor (yalnızca
    `LOWEST_COST_WITHOUT_CAP` ve `COST_CAP` ile). Value rule set'i ayırırken `value_rule_set_id`
    göndermek, `value_rules_applied=false` olsa bile set'i **yeniden bağlıyor**.

## Kavramlar, kurallar ve alanlar

### Bütçe

**Nerede durur.** Bütçe ya kampanyada (Advantage campaign budget, eski adı CBO) ya ad set'te.
Kampanya bütçesi kapatılırsa her ad set'e bütçe verilmeli.

| Alan | Seviye | Not |
|---|---|---|
| `daily_budget` | kampanya / ad set | int64, hesap para biriminin en küçük biriminde (USD'de cent). ASC sayfasına göre yalnızca süresi 24 saatten uzun ad set'lerde. |
| `lifetime_budget` | kampanya / ad set | Verilirse `end_time` ZORUNLU. |
| `end_time` | ad set | Günlük bütçeyle `end_time=0` = bitişsiz. |
| `spend_cap` | kampanya | Kural motorunda filtrelenebilir; bu sayfalarda ayrıntı yok. |
| `budget_rebalance_flag` | kampanya | Advantage campaign budget ile **kullanılmamalı**. |
| `adset_budgets` | kampanya (POST) | Kampanya bütçesini kapatıp ad set bütçelerini tek çağrıda vermek için: `[{"adset_id":..,"daily_budget":5000},…]`. |

**Günlük bütçe nasıl harcanır.** Günlük bütçe bir ORTALAMA:
- "Budgets": bazı günler **%25'e kadar** fazla harcanabilir (10 $ → 12,50 $).
- "Ad set budget sharing": günlük esneklik **%75**; azami günlük = (günlük + paylaşılan) × 1,75;
  azami haftalık = (günlük + paylaşılan) × 7. **Belgede çelişkili (%25 / %75).**
- Kısmi günler: ad set gün ortasında başlıyorsa ilk ve son gün bütçesi kalan saate oranlanıyor
  (18:00'de başlayan ad set o gün bütçenin ~%25'ini hedefler).

**Ömür boyu bütçe.** Harcama dönem boyunca dengesiz dağılabilir (5 günlük 250 $ örneği:
50/50/75/25/50). Toplam aşılmaz — "teslimat ayarlarını değiştirmedikçe".

**Minimum bütçe kuralları:** bu sayfalarda **yok**. Asgari tutarlar belgede geçmiyor; AI ya da
panel tahmin etmemeli, platform hatasını kullanıcıya göstermeli.

**Para birimi / "offset".** Bütçe ve teklif "hesap para biriminin minimum biriminde" (cent).
Kural motoru `change_spec.limit` örneği: `5000` = 50 USD. Insights tabanlı kural filtreleri de
taban birimde (`spent` 1000 = 10,00 USD). Sıfır ondalıklı para birimleri (ör. JPY) için davranış
bu sayfalarda anlatılmıyor — **belgede belirsiz**.

### Advantage campaign budget (kampanya bütçesi, CBO)

| Kampanya alanı | Değerler / not |
|---|---|
| `daily_budget` / `lifetime_budget` | Kampanya bütçesi. |
| `bid_strategy` | `LOWEST_COST_WITHOUT_CAP`, `COST_CAP`, `LOWEST_COST_WITH_BID_CAP`, `LOWEST_COST_WITH_MIN_ROAS`. Tüm ad set'ler aynı stratejiyi paylaşır. |
| `pacing_type` | `standard`, `no_pacing` (hızlandırılmış), `day_parting` (zamanlama). Kampanya bütçesinde pacing KAMPANYADA tanımlanır, ad set'te değil. |
| `adset_bid_amounts` | `{"<adset_id>": 1500, …}` — `COST_CAP` / `LOWEST_COST_WITH_BID_CAP` için ad set başına tutar. |

| Ad set alanı | Not |
|---|---|
| `daily_min_spend_target` / `daily_spend_cap` | Kampanyada GÜNLÜK bütçe şart. Hedef garanti değil ("best effort"). Kaldırmak için `0` ya da boş. |
| `lifetime_min_spend_target` / `lifetime_spend_cap` | Kampanyada ÖMÜR BOYU bütçe şart. |
| `bid_amount` | Yalnızca otomatik teklif kapalıysa. |
| `bid_constraints` | Min ROAS tabanı; `bid_amount` ile birlikte kullanılamaz. |

Kısıtlar:
- Otomatik teklifte tüm ad set'lerin `optimization_goal`'ü aynı olmalı; **kampanya yayına
  girdikten sonra optimizasyon hedefi değiştirilemez.**
- `LOWEST_COST_WITH_MIN_ROAS` seçilmiş bir kampanya bütçesinde sonradan başka stratejiye
  **geçilemez**.
- **70'ten fazla ad set'i olan** kampanya bütçeli kampanyada teklif stratejisi değiştirilemez,
  kampanya bütçesi kapatılamaz.
- Stratejiler arasında güncelleme örneği yalnızca `COST_CAP` ↔ `LOWEST_COST_WITH_BID_CAP`.

### Ad set bütçe paylaşımı (`is_adset_budget_sharing_enabled`)

- Kampanya alanı. Bütçe ad set'teyse ad set'ler günlük bütçelerinin **%20'sine kadarını**
  birbirleriyle paylaşır. Yalnızca GÜNLÜK bütçede.
- **v24.0+'da kampanya bütçesi verilmiyorsa ZORUNLU** (`True`/`False`); yoksa 4834011.
- Kampanya bütçesiyle birlikte kullanılamaz (4834002); teklif stratejisi olmadan açılamaz
  (4834005); açıkken ad set'ler aynı stratejiyi taşımalı ("uniform spec", 4834009).
- Ortada çalışan kampanyada **açılamaz** (3858418), yalnızca kapatılabilir. Açıkken teklif
  stratejisi ortada değiştirilemez (4834006). Silme yok; `False` ile kapatılır.
- **Belgede çelişkili:** aynı sayfa başta "oluşturmada ve ortada açıp kapatabilirsin" diyor,
  "Updating" bölümünde "ortada açmak desteklenmiyor" diyor. Hata kodu 3858418 ikincisini
  destekliyor.
- Tek aktif ad set kaldığında paylaşım uygulanmaz.

### Pacing ve zamanlama (dayparting)

- `pacing_type`: `["standard"]` (varsayılan), `["no_pacing"]` (hızlandırılmış teslimat;
  bütçe gün bitmeden tükenebilir), `["day_parting"]`.
- **`adset_schedule` yalnızca ÖMÜR BOYU bütçeyle** kullanılır (belge açık). Dizi; her öğe
  `start_minute`, `end_minute` (0 tabanlı gün dakikası), `days` (0=Pazar … 6=Cumartesi),
  opsiyonel `timezone_type` (`user` | `advertiser`).
- `start_minute`/`end_minute` **saat başında** olmalı ve aralarında **en az 1 saat** olmalı
  (Reach & Frequency'de en az 4 saat).
- **Zaman dilimi tuzağı:** zamanlama varsayılan olarak HEDEF KİTLENİN saat diliminde
  uygulanıyor, hesabın değil. `timezone_type` alanı gönderilmezse hangisinin kullanıldığı
  sayfada "kitle" diye yazıyor; alan opsiyonel ve varsayılanı açıkça belirtilmemiş —
  Advetics her zaman açıkça göndermeli.
- Kapatma: `pacing_type=["standard"]` + `adset_schedule=[]`.
- Bireysel reklam zamanlaması: reklam seviyesinde `ad_schedule_start_time` /
  `ad_schedule_end_time` (tüm kampanya türlerinde).
- Faturalama olayını `IMPRESSIONS` → `LINK_CLICKS` değiştirmek pacing'i yeniden ayarlatır.

### Teklif stratejileri (`bid_strategy`)

| Değer | Ne yapar | Zorunlu alan | Notlar |
|---|---|---|---|
| `LOWEST_COST_WITHOUT_CAP` | Otomatik teklif, bütçeyi harcar. | — | Maliyet kontrolü yok; bütçe arttıkça maliyet artabilir. Ads Manager'da `VALUE` hedefiyle "Highest Value" görünür. |
| `COST_CAP` | Ortalama sonuç başına maliyeti hedefler. | `bid_amount` | `billing_event=IMPRESSIONS`, `pacing_type=standard` şart. **Uyum garanti değil.** Tavan tutunca bütçeyi harcamayabilir. |
| `LOWEST_COST_WITH_BID_CAP` | Açık artırma başına azami teklif. | `bid_amount` | Bütçeyi harcamayabilir; teklif raporlanan maliyet değil. |
| `LOWEST_COST_WITH_MIN_ROAS` | Değer optimizasyonu, ROAS tabanı. | `bid_constraints.roas_average_floor` | `optimization_goal=VALUE` şart. `bid_amount`/`bid_info` VERİLMEZ. |

- `roas_average_floor` **×10.000 ölçekli tamsayı**: `100` = 0,01 (%1), `10000` = 1,0,
  `15000` = 1,5. Geçerli aralık `[100, 10000000]`. (ASC örneğindeki `1000` = 0,1 ROAS'tır;
  dikkat.)
- Min ROAS uygunluğu hesap yeteneklerinden okunur: `CAN_USE_ROAS_VALUE_OPTIMIZATION` (web),
  `ADS_NEKO_MAI_ROAS` (uygulama), `CAN_USE_DYNAMIC_ADS_VALUE_OPTIMIZATION` (katalog).
- Min ROAS'ı kaldırmak: `bid_strategy=LOWEST_COST_WITHOUT_CAP` + `bid_constraints={}`.
- iOS 14.5 kampanyalarında `COST_CAP` ve `LOWEST_COST_WITH_MIN_ROAS` için süre **en az 3 gün**.
- Kullanımdan kalkanlar: `target_cost` (v9, teslimat duraklatılır); `is_autobid` ve
  `is_average_price_pacing` (v3.0).
- Strateji–amaç uyumluluk tablosu sayfada **eski amaç adlarıyla** (`CONVERSIONS`,
  `LINK_CLICKS` …) veriliyor; ODAX (`OUTCOME_*`) karşılığı bu sayfalarda yok.
- CCCO (site + uygulama) yalnızca `LOWEST_COST_WITHOUT_CAP` ve `LOWEST_COST_WITH_BID_CAP`
  destekliyor.

### Optimizasyon hedefi ve faturalama olayı

- Teklif modeli: Meta, `bid_strategy` + `bid_amount` + hedefe ulaşma olasılığından "etkin
  teklif" hesaplar. `objective` ve `billing_event` teklifi doğrudan değiştirmez.
- `optimization_goal` gönderilmezse amacın varsayılanına düşer (ör. `APP_INSTALLS` →
  `APP_INSTALLS`). **Sessiz varsayılan** — Advetics her zaman açıkça göndermeli.
- **Reach optimizasyonu `IMPRESSIONS` olarak geri okunur** (Meta Reach ve Impressions'ı
  birleştirdi; sıklık kontrolüyle birlikte). Geri okuma karşılaştırmasında `REACH` yazıp
  `IMPRESSIONS` görmek hata değil.
- Eski amaç → geçerli `optimization_goal` tablosu sayfada var (v17'de kalkmış amaç adlarıyla);
  ODAX eşlemesi başka bölümde.
- `buying_type`: `AUCTION` (neredeyse her zaman), `RESERVED`, `FIXED_CPM`. Son ikisi yalnızca
  `IMPRESSIONS` faturalar.

`optimization_goal` → geçerli `billing_event` (AUCTION):

| Hedef | Faturalama |
|---|---|
| `LINK_CLICKS` | `LINK_CLICKS`, `IMPRESSIONS` |
| `THRUPLAY` | `IMPRESSIONS`, `THRUPLAY` |
| `TWO_SECOND_CONTINUOUS_VIDEO_VIEWS` | `IMPRESSIONS`, `TWO_SECOND_CONTINUOUS_VIDEO_VIEWS` |
| `APP_INSTALLS`, `AD_RECALL_LIFT`, `ENGAGED_USERS`, `EVENT_RESPONSES`, `IMPRESSIONS`, `LEAD_GENERATION`, `OFFSITE_CONVERSIONS`, `PAGE_LIKES`, `POST_ENGAGEMENT`, `REACH`, `REPLIES`, `SOCIAL_IMPRESSIONS`, `VALUE`, `LANDING_PAGE_VIEWS` | yalnızca `IMPRESSIONS` |

Tabloda adı boş bir satır "`IMPRESSIONS` and `VIDEO_VIEWS`" diyor — **belgede eksik**.

**oCPM:** `billing_event=IMPRESSIONS`, `optimization_goal` istenen eylem, `bid_amount` cent.
Bütçe zorunlu. Uygulama yükleme için son 28 günde SDK/MMP'den yükleme olayı gelmiş olmalı.

**CPA (eylem başına ödeme):** `billing_event` ∈ `LINK_CLICKS`, `PAGE_LIKES`, `OFFER_CLAIMS`,
`THRUPLAY`; hedef aynı değer. `bid_amount` en az 1 cent. Sayfa beğenisi optimizasyonunda
hedeflemede `excluded_connections` zorunlu. CPA faturalaması 1 günlük tıklama dönüşümüne,
CPV 10 saniyelik izlemeye dayanır. v9'dan beri `APP_INSTALLS` aynı anda hem faturalama hem
hedef olamaz. **Belgede çelişkili:** sayfanın "CPA ad set" örneği `IMPRESSIONS` + `REACH`
kullanıyor; CPV örneği metinde `VIDEO_VIEWS` amacını, kodda `OUTCOME_ENGAGEMENT`'ı ve
`billing_event=VIDEO_VIEWS`'ı kullanıyor.

### Bid multipliers (kalkıyor) ve value rules (yerine geçen)

**Bid multipliers** — `bid_adjustments.user_groups` altında, ad set başına iç içe JSON;
ağırlık 0,09–1,0; `default` verilmezse 1,0. Kategoriler: `age`, `gender`, `device_platform`,
`publisher_platform`, `position_type`, `home_location`, `user_os`, `user_device`, `locale`,
`custom_audience`, `user_bucket`, `user_recency`, `booking_window`, `length_of_stay`,
`travel_start_date`, `travel_start_day_of_week`. **2027'de kaldırılıyor.** 30 Ocak 2023'ten
beri üçüncü taraf veri kategorileri izni olmayan kullanıcılara teslim edilmiyor. Okumada
`user_groups` **kaçışlı bir dizge** olarak dönebilir (JSON parse et). Silmek yalnızca value
rules bağlarken `bid_adjustments={}` ile mümkün ve **geri alınamaz** (önce oku, sakla).

**Value rules** — hesap düzeyinde "value rule set", ad set'e bağlanır.

| Kısıt | Değer |
|---|---|
| Set / hesap | **6** (value-rules sayfası) ya da **20** (bid-multiplier sayfası) — **belgede çelişkili** |
| Kural / set | 10 |
| Kriter / kural | 4; aynı kuralda aynı `criteria_type` iki kez olamaz |
| `adjust_sign` | `INCREASE` (1–1000 %) / `DECREASE` (1–90 %) |
| Varsayılan çarpan | daima 1,0 (değiştirilemez) |
| Sıra | İLK eşleşen kural uygulanır, sonrakiler yok sayılır |
| Uygun stratejiler | yalnızca `LOWEST_COST_WITHOUT_CAP`, `COST_CAP` |
| Özel kategori (konut/istihdam/kredi) | `AGE`, `GENDER` ve bazı `LOCATION` türleri yasak |

- `criteria_type`: `AGE`, `GENDER`, `OS_TYPE`, `DEVICE_PLATFORM`, `LOCATION`, `PLACEMENT`,
  `OMNI_CHANNEL` (`APP`, `INSTANT_FORM`, `PHONE_CALL`, `WEBSITE`), `AUDIENCE_LABEL`
  (`HIGH_VALUE`, `LOW_VALUE`, `NEW_USERS`, `QUALIFIED_LEADS` …; kapalı beta notu var).
  `operator` yalnızca `CONTAINS`. `criteria_value_types` dizisi `criteria_values` ile aynı
  uzunlukta; `LOCATION` dışında hep `NONE`. `LOCATION_DMA` 22 Haziran 2026'dan beri yerini
  `LOCATION_COMSCORE_MARKET`'e bırakıyor ve DMA'lı kurallar **devre dışı** kalıyor.
- Yaş: hazır aralıklar ya da özel aralık; **"65" üst sınır olarak YASAK** (`18-65` değil
  `18+`). Bu, Advetics'in "65 = 65 ve üzeri" bilgisiyle tutarlı.
- Alan adı **belgede çelişkili:** tablo `criteria` diyor, bütün örnekler `criterias`.
- Kampanya bütçeli kampanyada bütün ad set'lere AYNI set bağlanmalı; aksi "beklenmeyen teslimat".
- Bir ad set ya bid multiplier ya value rules taşır, ikisini birden değil.
- Değer optimizasyonu (`VALUE`) ve bid cap ile henüz/hiç desteklenmiyor; web + mağaza içi
  `OUTCOME_SALES` ve web + arama `OUTCOME_LEADS` yapılandırmaları istisna.

### Advantage+ kampanyalar (yeni birleşik yapı)

`advantage_state_info` (kampanya, salt okunur):

| Alt alan | ENABLED koşulu |
|---|---|
| `advantage_budget_state` | Bütçe kampanyada, desteklenen bir teklif stratejisiyle. |
| `advantage_placement_state` | HİÇBİR ad set'te yerleşim hedeflemesi/hariç tutma yok (hesap düzeyi hariç tutmalar serbest). API varsayılanı zaten otomatik yerleşim. |
| `advantage_audience_state` | EN AZ BİR ad set'te: `targeting_automation.advantage_audience=1`, **ya da** `geo_locations` dışında hedefleme yok, **ya da** `advantage_audience=0`/yok iken yaş varsayılan veya ≤25 veya öneri, cinsiyet varsayılan veya öneri, özel kitle dahil etme yok (ya da Advantage custom audience). |

Üçü de ENABLED ise `advantage_state` amaçla belirlenir: `OUTCOME_SALES` →
`ADVANTAGE_PLUS_SALES`, `APP_PROMOTION` → `ADVANTAGE_PLUS_APP` (adım listesinde amaç
`APP_INSTALLS` yazıyor — **belgede tutarsız**), `OUTCOME_LEADS` → `ADVANTAGE_PLUS_LEADS`.
Biri bile DISABLED ise `DISABLED`. Bu kampanyalar `smart_promotion_type=GUIDED_CREATION`
gösterir. `advantage_state` POST ile set **edilemez**.

ASC'yi yeni yapıda taklit: `OUTCOME_SALES`, yerleşim kısıtı yok, kampanya bütçesi +
`LOWEST_COST_WITHOUT_CAP` (önerilen) / `COST_CAP` / `LOWEST_COST_WITH_BID_CAP` /
`LOWEST_COST_WITH_MIN_ROAS`, hedefleme yalnızca `geo_locations` ya da Advantage+ kitle.
Yeni yapıda kampanya başına birden çok ad set ve ek dönüşüm konumları mümkün.

`existing_customer_budget_percentage` yeni kampanyada YOK. Taklidi: iki ad set — biri mevcut
müşteri özel kitlesini dahil eder (`targeting_relaxation_types.custom_audience=0` ile
gevşetmesiz) ve `daily_min_spend_target` = `daily_spend_cap` = X ile sınırlanır; diğeri aynı
kitleyi `excluded_custom_audiences` ile dışlar.

**Sürüm takvimi (belgede yazan):**

| Sürüm | Olay |
|---|---|
| v24.0 | `AUTOMATED_SHOPPING_ADS` ile ASC oluşturma kapanıyor (v23'e dönülerek mümkün). |
| v25.0 | ASC/AAC oluşturma HER sürümde hata. Göç etmemiş ASC'ler düzenlenemez (yalnızca göç). İstisna: `existing_customer_budget_percentage` kullanan ya da ad set'inde 50'den fazla reklam olan ASC'ler düzenlenebilir ama çoğaltılamaz. |
| v26.0 | Bütün eski ASC/AAC'ler düzenlemeye kapalı, göç alanı da çalışmaz. `existing_customer_budget_percentage` kullananlar **duraklatılır** (yalnızca Ads Manager'da "Duplicate Campaign" ile taşınır). |

Göç: `POST /{campaign}/copies?migrate_to_advantage_plus=true` (kopyala + göç) ya da
`POST /{campaign}?migrate_to_advantage_plus=true` (aynı kimlikle). AAC yalnızca göç eder,
kopyalanamaz. 50'den fazla reklamlı ASC hiç göç edemez. **Göç her durumda öğrenme aşamasını
yeniden başlatır.** Özel reklam kategorili kampanya, uygunsa Advantage+ yapısına, değilse
"geniş hedeflemeli benzer yapıya" taşınır — yani hedefleme sessizce genişleyebilir.

### Eski Advantage+ shopping (ASC) — yalnızca okuma/geçiş için

- Kampanya başına TEK ad set; hedefleme yalnızca `geo_locations` (`countries`, `regions` ≤200);
  `billing_event` yalnızca `IMPRESSIONS`; pixel_id + `custom_event_type` zorunlu.
- `optimization_goal`: `OFFSITE_CONVERSIONS` ya da `VALUE` (yalnızca web + `PURCHASE`).
- "Web + Shop" konumunda `PURCHASE` dışı bir olay seçilirse kampanya **sessizce yalnızca web
  konumuna dönüşüyor**.
- `existing_customers` hesap alanı (özel kitle kimlikleri); `custom_audience_info` ile UTM
  parametreleri (`audience_type_param_name`, `new_customer_tag`, `existing_customer_tag`).
  Raporda `user_segment_key` kırılımı yeni/mevcut müşteriyi ayırır.
- **Hesap kontrolleri (`/act_X/account_controls`)**: `age_min` 18–25, hariç konumlar, ülke
  dahil etme, yerleşim hariç tutma (Audience Network, Marketplace, sağ sütun). **Hesaptaki
  YENİ ve MEVCUT bütün kampanyalara uygulanır** — bir kampanyanın neden belli bir yaşın
  altına gitmediği kampanyadan okunamaz.
- `execution_options`: `validate_only`, `include_recommendations`, reklamda
  `synchronous_ad_review` (yalnızca `validate_only` ile).

### Çapraz kanal dönüşüm optimizasyonu (CCCO)

- Site + uygulama dönüşümünü tek kampanyada optimize eder. Ad set: `optimization_goal=
  OFFSITE_CONVERSIONS`, `billing_event=IMPRESSIONS`, `promoted_object.omnichannel_object`
  içinde `app[]` (`application_id`, `object_store_urls`, `custom_event_type`) ve `pixel[]`
  (`pixel_id`, opsiyonel `pixel_rule`, `custom_event_type`). Uygulama ve pixel olayı AYNI
  olmalı; SDK ve pixel ikisi de şart. Shop için `onsite[].commerce_merchant_settings_id` +
  `destination_type=SHOP_AUTOMATIC`.
- Olaylar: `PURCHASE`, `COMPLETE_REGISTRATION`, `ADD_PAYMENT_INFO`, `ADD_TO_CART`,
  `INITIATED_CHECKOUT`, `SEARCH`, `CONTENT_VIEW`, `LEAD`, `ADD_TO_WISHLIST` (`SUBSCRIBE`,
  `START_TRIAL` değerlendirmede).
- Yerleşim: Audience Network, Messenger, Instant Article ve yerleşime özel varlık
  özelleştirme HARİÇ.
- Reklam: `applink_treatment` (`web_only`, `deeplink_with_web_fallback`,
  `deeplink_with_appstore_fallback` — uygulama bağlantısı varsa varsayılan), katalogda
  `template_url_spec`, katalog dışı `omnichannel_link_spec` (`web.url` = `link_data.link`
  olmalı; `ios`/`ipad`/`iphone` birbirini dışlar). `tracking_specs` pixel + uygulama yükleme +
  uygulama olayı üçlüsünü taşımalı.
- **Belgede çelişkili:** `ccco.md` "yalnızca `CONVERSIONS` amacı" (eski ad) diyor; örnek ad set
  `optimization_goal: CONVERSIONS` kullanıyor, metin `OFFSITE_CONVERSIONS` diyor.

### Insights API

**Uç noktalar:** `/{act_id}/insights`, `/{campaign}/insights`, `/{adset}/insights`,
`/{ad}/insights` (GET senkron, POST asenkron). Varsayılan: temel metrikler, **son 30 gün**.
İzin: `ads_read`.

**Parametreler (bu sayfalarda geçenler):** `level`, `fields`, `breakdowns`,
`action_breakdowns`, `date_preset` (önerilen; özel aralık "daha az verimli"), `time_range`,
`time_increment` (MMM'de `1` ya da varsayılan `all_time`), `filtering` (nokta gösterimi,
`{field:"ad.impressions",operator:"GREATER_THAN",value:0}`), `action_attribution_windows`,
`use_unified_attribution_setting`, `action_report_time`, `export_format=csv` (MMM).

**Atıf:**
- 10 Haziran 2025'ten beri (belgeye göre): `use_unified_attribution_setting` ve
  `action_report_time` **yok sayılıyor**; değerler ad set atıf ayarına göre, rapor zamanı
  `mixed`. Reklam üstü (inline) eylemler `1d_click`/`1d_view` içine katılıyor; **tek başına
  `inline` penceresi artık dönmüyor.** Ardından gelen cümle "API varsayılanı Ads Manager'dan
  farklı, aynısı için `true` gönder" diyor — **belgede çelişkili**.
- Farklı atıf ayarlı nesneler üzerinden toplama yapılırsa eylem metrikleri **dönmüyor**.
  `action_attribution_windows=1d_click,7d_click,1d_view,incrementality` ile (varsayılan
  pencere dahil edilmeden) dönüyor.
- Kural motorunun atıf önekleri (`7d_click:` vb.) ve "Facebook varsayılanı 1 gün görüntüleme /
  28 gün tıklama" ifadesi eski; Insights sayfası başka bir varsayılan söylemiyor.

**Kırılımlar:**
- Genel liste: `action_device`, `action_canvas_component_name`, `action_carousel_card_id/
  name`, `action_destination`, `action_reaction`, `action_target_id`, `action_type`,
  `action_video_sound`, `action_video_type`, `ad_format_asset`, `age`, `app_id`, `body_asset`,
  `call_to_action_asset`, `country`, `description_asset`, `device_platform`, `dma`,
  `frequency_value`, `gender`, `hourly_stats_aggregated_by_advertiser_time_zone`,
  `hourly_stats_aggregated_by_audience_time_zone`, `image_asset`, `impression_device`,
  `is_conversion_id_modeled`, `link_url_asset`, `place_page_id`, `platform_position`,
  `product_id`, `publisher_platform`, `region`, `skan_campaign_id`, `skan_conversion_id`,
  `title_asset`, `user_segment_key`, `video_asset`, `mmm`.
- `action_breakdowns` verilmezse **`action_type` örtük ekleniyor.**
- İzinli birleşimler tablosu (yıldızlılar `action_type`/`action_target_id`/
  `action_destination` ile birleşebilir): `age`, `gender`, `age,gender`, `country`, `region`,
  `publisher_platform`, `publisher_platform,platform_position`, (+`impression_device`),
  `action_device` kombinasyonları, `product_id`, iki saatlik kırılım, carousel kart
  kombinasyonları, `app_id,skan_conversion_id`. Tabloda olmayan birleşim → 2/1504041
  "Invalid Breakdowns".
- **Meta dışı eylem kısıtı (27 Nisan 2021 sonrası):** Tür 1 (`region`, `dma`, iki saatlik
  kırılım) ile Meta dışı eylemler **hiç dönmüyor**; Tür 2 (`action_device`,
  `action_destination`, `action_target_id`, `product_id`, carousel, canvas) ile web eylemleri
  dönüyor ama **kırılım değeri boş**, mobil eylemler dönmüyor. Gösterim/tıklama gibi Meta içi
  metrikler etkilenmiyor.
- Saatlik kırılımda `unique_*`, `reach`, `frequency` desteklenmiyor — **0 dönüyor**
  (hata değil); `video_*` alanları saatlik kırılımla istenemez.
- 6 Ağustos 2026'dan beri `frequency_value`, `hourly_stats_aggregated_by_audience_time_zone`
  ve `impression_device` bazı hesaplarda **senkron istekte boş** dönebiliyor; ya hesap
  yöneticisi Ads Manager'dan açar ya asenkron iş kullanılır.
- Kırılımla istenmeyecek alanlar: `app_store_clicks`, `newsfeed_avg_position`,
  `newsfeed_clicks`, `relevance_score`, `newsfeed_impressions`.
- Dinamik kreatif varlık kırılımları yalnızca `impressions`, `clicks`, `spend`, `reach`,
  `actions`, `action_values`.
- `dma` örnekleme kullanıyor (küçük DMA'lar eksik ya da 2'nin kuvvetine ölçeklenmiş).
- Kırılım değerleri **tahmini** metrik sayılıyor.
- `actions` hiyerarşik; toplamı `total_actions`'a eşit olmayabilir (`post_engagement` alt
  eylemleri kapsar).

**Veri tazeliği ve saklama:**
- Metrikler **15 dakikada bir** yenileniyor, raporlandıktan **28 gün sonra** sabitleniyor;
  reklam bittikten sonra birkaç gün güncellenmeye devam edebilir.
- 10 Haziran 2025'ten beri **13 aydan eski** başlangıç tarihli, kırılımlı standart sorgularda
  `reach`, `frequency`, `cpp` **atlanıyor**. Asenkron işle hesap başına günde 10 istek
  hakkı var (`x-Fb-Ads-Insights-Reach-Throttle`); hak bitince yine sessizce atlanıyor.
- **37 aylık saklama sınırı bu sayfalarda geçmiyor** — başka bölümde aranmalı.
- Veriler hesabın saat diliminde raporlanıyor.

**Asenkron işler:** `POST /{obj}/insights` → `report_run_id` (**30 gün sonra ölür**,
saklanmamalı). `async_status`: `Job Not Started`, `Job Started`, `Job Running`,
`Job Completed`, `Job Failed`, `Job Skipped` (süresi doldu, yeniden gönder). `Job Completed`
+ `async_percent_completion=100` olana kadar yokla, sonra `GET /{report_run_id}/insights`.
Bir saate kadar sürebilir. v25.0+'da başarısız işte `error_code`, `error_subcode`,
`error_user_msg` vb. varsayılan olarak dönüyor.

**MMM:** `breakdowns=mmm` başka kırılımla birleşmez, yalnızca `level=adset`, metrikler
`impressions` ve `spend` (**tahmini**). Yalnızca `POST` + `export_format=csv` (yoksa hata);
sonuç `async_report_url`'den CSV. Sınırlı `filtering` operatörleri. İşletme düzeyinde yok;
`/owned_ad_accounts` + `/client_ad_accounts` gezilmeli.

**Hız sınırı:** her yanıtta `x-fb-ads-insights-throttle` (`app_id_util_pct`,
`acc_id_util_pct`, `ads_api_access_tier`) ve `x-ad-account-usage`. Uygulama + hesap bazında
sayılıyor; aşılınca kod 4. Erişim katmanları: "Standard Access" artık "Limited Access",
"Advanced Access" artık "Full Access"; Full Access eşiği son 15 günde **500** çağrı.

**Hata kodları:**

| Kod / alt kod | Kaynak | Anlam |
|---|---|---|
| -2 / 2490547 | async | Rapor üretilemedi, sonra dene |
| 100 / 1504018, 2 / 1504038 | sync | Zaman aşımı — aralığı küçült ya da async |
| 4 / 1504022, 4 / 1504039 | her ikisi | Çok fazla istek (1504022 küresel yük) |
| 2 / 1504041 | her ikisi | Geçersiz kırılım/metrik birleşimi |
| 2 / 1504042 | her ikisi | Geçersiz özel metrik |
| 2 / 1504043 | her ikisi | Ara sıra hata, tekrar dene |
| 2 / 1504044 | sync | Bilinmeyen hata |
| -3 / 1504045 | async | Rapor çok büyük |
| 100 / 1487534 | her ikisi | Çağrı başına veri sınırı (satır ya da özet satırı veri noktası) |
| 100 / 3191001 | her ikisi | İzin hatası |

**En iyi uygulamalar:** unique metrikleri ayrı çağrıda iste; hesap düzeyinde yüksek
kardinaliteli kırılım (`action_target_id`, `product_id`) + uzun aralıktan kaçın; önce
hesap düzeyinde `level` + `filtering` ile kimlikleri al, sonra alt nesnelerin `/insights`'ını
batch'le; `STARTS_WITH`/`CONTAIN` süzgeci özet satırını DEĞİŞTİRMİYOR (`IN` kullan).

**Ads volume:** `GET /act_X/ads_volume` → `ads_running_or_in_review_count`; sayfa (aktör)
başına reklam limiti için. `show_breakdown_by_actor=true` ya da `page_id`. Day-parting'li
reklam BÜTÜN GÜN "çalışıyor" sayılır; gelecekteki ad set sayılmaz.

### Otomatik kurallar (Ad Rules Engine)

**Nesne:** `POST /act_X/adrules_library` — `name`, `evaluation_spec`, `execution_spec`,
(zamanlı kurallarda) `schedule_spec`, `status` (`ENABLED`/`DISABLED`; kalıcı kaldırma DELETE).

**İki tür:**
- **Zamanlı (`evaluation_type: SCHEDULE`)** — `schedule_spec.schedule_type`: `DAILY`
  (hesap saat diliminde gece yarısı), `HOURLY`, `SEMI_HOURLY`, `CUSTOM`. `CUSTOM`'da
  `schedule[]` öğeleri: `start_minute` (30'un katı), `end_minute`, `days` (0=Pazar);
  her öğede en az `start_minute` ya da `days`. Öğeler VEYA ile birleşir. `start_minute`
  yoksa o günler yarım saatte bir.
- **Tetikli (`evaluation_type: TRIGGER`)** — yalnızca API'de (Ads Manager'da yok);
  `schedule_spec` desteklenmez. Gecikme: metadata birkaç saniye, insights birkaç dakika
  (p99 ≈ 7,5 dk). Tek `trigger`: `METADATA_CREATION`, `METADATA_UPDATE`, `STATS_CHANGE`
  (VE koşulu false→true olunca; true kaldıkça tekrar çalışmaz), `STATS_MILESTONE`
  (`value`'nun katlarında; operatör `EQUAL`, `time_preset=LIFETIME`; asgari değerler:
  `impressions`/`reach` 1000, `clicks` 10, `spent` 1000 cent, `results` 5, olaylar 1),
  `DELIVERY_INSIGHTS_CHANGE` (beta). Tetikli kurallarda `time_preset` BUGÜNÜ içermeli.

**`evaluation_spec.filters`** — hepsi VE ile. Her filtre `field`/`value`/`operator`.
Operatörler: `GREATER_THAN`, `LESS_THAN`, `EQUAL`, `NOT_EQUAL`, `IN_RANGE`, `NOT_IN_RANGE`,
`IN`, `NOT_IN`, `CONTAIN`, `NOT_CONTAIN`, `ANY`, `ALL`, `NONE`.
- `entity_type` (`AD`/`ADSET`/`CAMPAIGN`) ya da `id` ZORUNLU. `entity_type` DİNAMİK —
  kuraldan sonra açılan nesneler de kapsanır. Öneksiz `id` statik liste.
- `time_preset` (insights filtresi varsa zorunlu, tek, `EQUAL`): `LIFETIME`, `TODAY`,
  `YESTERDAY`, `LAST_2_DAYS`…`LAST_30_DAYS` (**bugünü içerir**), `LAST_2D`…`LAST_30D`
  (bugünü içermez), `THIS_MONTH`, `THIS_WEEK_MON_TODAY`, `THIS_WEEK_SUN_TODAY`,
  `LAST_ND_14_8` gibi olgun-veri aralıkları. **Dikkat:** kural motorunun `LAST_7_DAYS`'i
  bugünü İÇERİYOR, Insights'taki `last_7d` içermiyor.
- `attribution_window`: tek, `EQUAL`, yalnızca zamanlı kurallarda ve **tek izinli değer
  `ACCOUNT_DEFAULT`** — ama ROAS kılavuzu `7D_CLICK` ve `1D_VIEW_1D_CLICK` örnekliyor;
  "Evaluation spec filters" sayfası filtre başına `7d_click:` gibi önekler tanımlıyor.
  **Belgede çelişkili.**
- Gizli varsayılan: `effective_status` süzgeci verilmezse eylemli türlerde
  `IN ['ACTIVE','PENDING_REVIEW']`, `UNPAUSE`'da `NOT_IN ['DELETED','ARCHIVED']` örtük ekleniyor.
- Metadata filtreleri: `id`, `entity_type`, `name`, `adlabel_ids`, `objective`, `start_time`,
  `stop_time`, `buying_type`, `billing_event`, `optimization_goal`, `is_autobid`,
  `daily_budget`, `lifetime_budget`, `spend_cap`, `bid_amount`, `created_time`,
  `updated_time`; yalnızca zamanlıda `effective_status`, `placement.page_types`,
  `budget_reset_period` (`DAY`/`LIFETIME`), `hours_since_creation`,
  `estimated_budget_spending_percentage` (günde ≥10 saat teslimat ister),
  `audience_reached_percentage`, `active_time`, `current_time`. Önekle üst nesne süzülür
  (`campaign.objective`).
- Insights filtreleri: `spent`, `impressions`, `reach`, `frequency`, `cpc`, `cpm`, `ctr`,
  `cpa`, `results`, `cost_per`, `cost_per_purchase_fb`, `website_purchase_roas`,
  `mobile_app_purchase_roas`, `offsite_conversion.*`, `app_custom_event.*`, … Tetiklide
  hangilerinin geçerli olduğu tabloda var (ROAS ve offline dönüşümler hayır). Tabloda
  `unique_clicks` ve `reach` hem "Yes" hem "No" — **belgede çelişkili**.
- Gelişmiş (yalnızca zamanlı): önekli alanlar (`adset.yesterday_spent`,
  `campaign.28d_view_1d_click:lifetime_results` — sıra: nesne → atıf → zaman), `aggregate(...)`
  + `aggregation_id IN [...]` (aynı seviyeden kimlikler), formüller (`today_spent /
  adset.daily_budget`; en çok 6 alan, terimler boşlukla ayrılı), takma adlar
  `daily_ratio_spent`, `lifetime_ratio_spent`.

**`execution_spec.execution_type`:**

| Tür | Zamanlı | Tetikli | Not |
|---|---|---|---|
| `NOTIFICATION` | ✓ | ✓ | Oluşturana ya da `user_ids`'e bildirim |
| `PAUSE` / `UNPAUSE` | ✓ | ✓ | |
| `CHANGE_BUDGET` | ✓ | — | Yalnızca ad set |
| `CHANGE_CAMPAIGN_BUDGET` | ✓ | — | Yalnızca kampanya |
| `CHANGE_BID` | ✓ | — | Yalnızca ad set |
| `ROTATE` | ✓ | — | Aktif reklamı durdurup sıradakini açar; ad set `id` + `entity_type=AD` ister |
| `REBALANCE_BUDGET` | ✓ | — | Eşleşenleri DURDURUR, bütçelerini diğerlerine dağıtır |
| `PING_ENDPOINT` | — | ✓ | `ads_rules_engine` webhook aboneliği (APP token) gerekir |

`execution_options` (operatör yalnızca `EQUAL`):
- `change_spec`: `amount` (zorunlu), `unit` (`ACCOUNT_CURRENCY` | `PERCENTAGE`; `target_field`
  yoksa zorunlu), `limit` (tavan/taban; `target_field` ile `[alt, üst]`), `target_field`
  (hedef metriğe göre orantılı ölçekleme; ör. hedef 5,0 CPI, mevcut 4,0 → %25 artış).
  Örnekte `NOT_IN_RANGE` ile ±%10 ölü bölge öneriliyor.
- `execution_count_limit`: nesne başına azami değişiklik sayısı; **verilmezse SINIRSIZ**.
- `action_frequency`: aynı nesnede aynı eylem arasındaki asgari dakika (ör. 10080 = 1 hafta).
- `rebalance_spec`: `type` (`EVEN`, `PROPORTIONAL`, `NO_PAUSE_PROPORTIONAL`,
  `MATCHED_ONLY_PROPORTIONAL`), `target_field`, `target_count`, `is_cross_campaign`
  (varsayılan false = yalnızca kampanya içi), `is_inverse`. Örnek ise listede olmayan
  `INVERSE_PROPORTIONAL` kullanıyor — **belgede çelişkili**. Günlük ve ömür boyu bütçeli ad
  set'ler ayrı havuzlarda; ömür boyu için kalan bütçe taşınıyor. `MATCHED_ONLY_PROPORTIONAL`
  iyi performanslı ad set'in bütçe kaybetmesine yol açabilir.
- `user_ids`: zamanlı kurallarda günlük özet e-postası (hesap saatinde 00:30; hiç eylem yoksa
  gönderilmez).

**Yardımcı uçlar:** `GET /{rule}/history` (`object_id`, `action`, `hide_no_changes`),
`GET /act_X/adrules_history`, `POST /{rule}/preview` (zamanlı kuralın şu anki eşleşmeleri),
`POST /{rule}/execute` (hemen çalıştır), `GET|POST /{object}/adrules_governed`
(`pass_evaluation`).

### A/B (split) test ve lift çalışmaları (`ad_studies`)

- `POST /{business_id}/ad_studies` (ya da `/{user_id}/ad_studies`). `type`: `SPLIT_TEST`,
  `LIFT`, ve enum'da `CONTINUOUS_LIFT_CONFIG`, `GEO_LIFT`, `BACKEND_AB_TESTING`,
  `CREATIVE_SPEND_ENFORCEMENT`, `PORTFOLIO_OPTIMIZER`, `VERSION_CONTROL`. Kreatif testi
  `SPLIT_TEST_V2` ister ama bu değer referans enum'unda YOK — **belgede çelişkili**.
- Hücre (`cells[]`): `name`, `treatment_percentage` (her hücre ≥10, toplam ≤100),
  `control_percentage` (lift), `adaccounts`/`campaigns`/`adsets`/`ads` (en az biri),
  `creation_template`.
- Split test sınırları: eşzamanlı 100 çalışma / reklamveren, 150 hücre / çalışma, 100 nesne /
  hücre. Testte tek değişken. Hücreler birbirini dışlayan kitlelere bölünür.
- Kreatif testi: 2–5 hücre, her hücrede TAM BİR reklam, `creative_test_config` ile
  `daily_budget` ya da `lifetime_budget_percentage`; `cooldown_start_time = start_time`,
  `observation_end_time = end_time`.
- Lift: Conversion Lift "sınırlı erişim" (Meta temsilcisi). `start_time` gelecekte olmalı;
  başladıktan sonra `start_time`, `treatment_percentage` değiştirilemez, bağlı nesneler
  çıkarılamaz, hedefler (`objectives`) değiştirilemez; `end_time` ileri alınabilir, nesne
  eklenebilir. `cooldown_start_time` kullanımdan kalktı. Sonuç:
  `GET /{objective_id}?fields=results&breakdowns=["cell_id"]`; kırılım için en az 100
  dönüşüm; 13 Temmuz 2021 sonrası çalışmalarda "buyers" metrikleri ve yaş/cinsiyet/ülke
  kırılımı yok; `ds=` ile son 30 günden bir tarihin sonucu.
- Silme: referansta DELETE örneği var ama hemen ardından "bu uçta yapılamaz" yazıyor.
- Kenar uçlar (`cells`, `objectives`, `viewers`, `related_ad_accounts`, `instances`,
  `continuous_lift_config`) yalnızca okunur.

## API çağrıları

```
# Kampanya bütçeli (Advantage campaign budget) kampanya
POST /act_{id}/campaigns
  name, objective=OUTCOME_SALES, special_ad_categories=[], status=PAUSED,
  daily_budget=100000, bid_strategy=LOWEST_COST_WITHOUT_CAP

# Ad set bütçeli kampanya (v24+ ZORUNLU alan)
POST /act_{id}/campaigns
  name, objective, special_ad_categories=[], status=PAUSED,
  is_adset_budget_sharing_enabled=false

# Kampanya bütçesini kapat, ad set bütçelerine geç
POST /{campaign_id}
  adset_budgets=[{"adset_id":A,"daily_budget":5000},{"adset_id":B,"daily_budget":7000}]

# Kampanya stratejisini değiştir + ad set teklifleri
POST /{campaign_id}
  bid_strategy=LOWEST_COST_WITH_BID_CAP, adset_bid_amounts={"A":1500,"B":2000}

# Cost cap ad set
POST /act_{id}/adsets
  campaign_id, optimization_goal=OFFSITE_CONVERSIONS, billing_event=IMPRESSIONS,
  bid_strategy=COST_CAP, bid_amount=200, daily_budget=1000, targeting={...}, status=PAUSED

# Min ROAS ad set (1,5 ROAS)
POST /act_{id}/adsets
  optimization_goal=VALUE, promoted_object={"pixel_id":P,"custom_event_type":"PURCHASE"},
  bid_strategy=LOWEST_COST_WITH_MIN_ROAS, bid_constraints={"roas_average_floor":15000},
  billing_event=IMPRESSIONS, ...

# Dayparting (yalnızca ömür boyu bütçe)
POST /act_{id}/adsets
  lifetime_budget=100000, end_time=..., pacing_type=["day_parting"],
  adset_schedule=[{"start_minute":540,"end_minute":720,"days":[1,2,3,4,5],"timezone_type":"advertiser"}]

# Advantage+ durumunu doğrula
GET /{campaign_id}?fields=name,objective,advantage_state_info,smart_promotion_type

# ASC → Advantage+ göç (öğrenmeyi sıfırlar)
POST /{campaign_id}/copies?migrate_to_advantage_plus=true     # kopyala + göç
POST /{campaign_id}?migrate_to_advantage_plus=true            # aynı kimlik

# Hesap kontrolleri (hesaptaki tüm kampanyalara uygulanır)
POST /act_{id}/account_controls
  audience_controls={"age_min":20,"excluded_geo_locations":{...}},
  placement_controls={"placement_exclusions":["facebook_marketplace"]}

# Value rule set
POST /act_{id}/value_rule_set   {name, rules:[{name, adjust_sign, adjust_value, criterias:[...]}]}
GET  /act_{id}/value_rule_set?fields=name,rules{name,adjust_sign,adjust_value,status,criterias}
POST /{value_rule_set_id}       (tüm kural/kriter kimlikleriyle tam gövde)
POST /{value_rule_set_id}/delete_rule_set
POST /{adset_id}  {value_rule_set_id, value_rules_applied:true}     # bağla / değiştir
POST /{adset_id}  {value_rules_applied:false}                        # ayır (kimlik GÖNDERME)
POST /act_{id}/value_rule_set_translation {source:{bid_multiplier_ad_set_id:X}}
POST /{adset_id}  {value_rules_spec:{value_rule_set:{...}}, bid_adjustments:{}}  # tek adım göç

# Insights
GET  /{obj}/insights?level=ad&fields=spend,impressions,actions&time_range={...}
     &time_increment=1&action_attribution_windows=[...]&breakdowns=age,gender
POST /{obj}/insights  (aynı parametreler) -> {report_run_id}
GET  /{report_run_id}?fields=async_status,async_percent_completion
GET  /{report_run_id}/insights
POST /act_{id}/insights  breakdowns=mmm, export_format=csv, level=adset, time_increment=1
GET  /act_{id}/ads_volume?show_breakdown_by_actor=true

# Kural motoru
POST   /act_{id}/adrules_library  {name, schedule_spec, evaluation_spec, execution_spec}
GET    /act_{id}/adrules_library?fields=name,evaluation_spec,execution_spec,status
POST   /{rule_id}   (spec güncellemesi: TÜM alanlarla) | status=DISABLED
DELETE /{rule_id}
GET    /{rule_id}/history?hide_no_changes=true
POST   /{rule_id}/preview | /{rule_id}/execute
GET    /{object_id}/adrules_governed?pass_evaluation=true

# Kural örneği: CPA 3 günde 100 TL'yi geçen reklamı durdur (tetikli)
evaluation_spec={"evaluation_type":"TRIGGER",
  "trigger":{"type":"STATS_CHANGE","field":"cost_per_purchase_fb","value":10000,"operator":"GREATER_THAN"},
  "filters":[{"field":"entity_type","value":"AD","operator":"EQUAL"},
             {"field":"time_preset","value":"LAST_3_DAYS","operator":"EQUAL"}]}
execution_spec={"execution_type":"PAUSE"}

# Split test / kreatif testi
POST /{business_id}/ad_studies
  type=SPLIT_TEST, start_time, end_time,
  cells=[{name:"A",treatment_percentage:50,adsets:[X]},{name:"B",treatment_percentage:50,adsets:[Y]}]
POST /{business_id}/ad_studies
  type=SPLIT_TEST_V2, creative_test_config={"daily_budget":15000},
  cells=[{name:"a",treatment_percentage:50,ads:["AD1"]},{name:"b",treatment_percentage:50,ads:["AD2"]}],
  start_time=T0, cooldown_start_time=T0, end_time=T1, observation_end_time=T1
```

## Tuzaklar ve sessiz hata riskleri

**Bütçe / teklif**
- **Günlük bütçe aşımı hata değil** (%25 ya da %75 — belgede çelişkili). Advetics'in "bu ay
  bütçe aşıldı" mantığı gün bazında alarm üretirse yanlış alarm olur.
- **Para birimi ölçeği:** bütçe/teklif en küçük birimde, `roas_average_floor` ×10.000. Bir
  ölçek hatası API'ce GEÇERLİ sayılır (1,5 ROAS yerine `15` göndermek = 0,0015 ROAS tabanı →
  fiilen sınırsız teslimat; `1000` = 0,1).
- **`COST_CAP` ve bid cap'e uyum garanti değil;** üstelik tavan tuttuğunda bütçe
  HARCANMAYABİLİR — "kampanya neden harcamıyor" sorusunun sessiz sebebi.
- `optimization_goal` gönderilmezse amacın varsayılanı; `pacing_type` gönderilmezse
  `standard`; `timezone_type` gönderilmezse (belgeye göre) KİTLE saat dilimi. Üçü de
  açıkça gönderilmeli.
- **Reach → `IMPRESSIONS` geri okuma:** yazdığını geri okuyup karşılaştıran bir doğrulayıcı
  yanlış alarm verir.
- **Kısmi gün:** ad set gün ortasında başlarsa o günün harcaması orantılı düşük — ilk gün
  "az harcadı" uyarısı yanlış.
- **Bütçe paylaşımı ortada açılamaz:** AI "paylaşımı aç" derse çalışan kampanyada 3858418.
- **CBO'da optimizasyon hedefi kilitli** (yayından sonra), **Min ROAS stratejisi kilitli**,
  **>70 ad set'te strateji ve CBO kilitli.**

**Advantage+**
- **Kendiliğinden Advantage+ olma:** bütçe kampanyada + yerleşim kısıtı yok + yalnızca ülke
  hedefi = `ADVANTAGE_PLUS_SALES`. Hiçbir hata/uyarı yok; davranış (otomasyon) değişebilir.
  Tersi de geçerli: tek bir ad set'e yerleşim kısıtı eklemek bütün kampanyayı `DISABLED`
  yapar.
- **Advantage+ kitle koşulu "en az bir ad set"**: diğer ad set'lerin dar olması durumu
  bozmaz — yani `advantage_audience_state=ENABLED` görmek "bütün ad set'ler geniş" demek
  değil.
- **Yaş ≤25 kuralı:** `age_min` 25 veya altıysa ve özel kitle yoksa kitle "Advantage+"
  sayılıyor (öneri olarak). Belgede bu durumda yaşın sert sınır mı öneri mi kaldığı
  **belirsiz**.
- **Hesap kontrolleri (`account_controls`)** hesaptaki bütün kampanyalara görünmeden
  uygulanır; kampanya nesnesinde izi yok.
- **ASC "Web + Shop"** konumunda `PURCHASE` dışı olay → sessizce yalnızca web.
- **Özel reklam kategorisi göçü:** uygun değilse "geniş hedeflemeli benzer yapıya" — hedefleme
  sessizce genişleyebilir.
- Eski ASC'ler v26'da duraklatılıyor (`existing_customer_budget_percentage`).

**Insights**
- **`action_report_time` / `use_unified_attribution_setting` yok sayılabilir** (bkz. Özet 1).
- **`inline` penceresi artık tek başına dönmüyor.**
- **Farklı atıf ayarlı ad set'leri toplayan hesap/kampanya sorgusunda eylem metrikleri
  dönmüyor** — boş `actions` "dönüşüm yok" değil.
- **13 aydan eski + kırılım → `reach`/`frequency`/`cpp` alanı YOK** (hata değil; alan düşüyor).
- **Saatlik kırılımda `reach`/`frequency` = 0.**
- **Tür 2 kırılımlarda web eylemleri kırılım değeri boş dönüyor**, mobil eylemler hiç
  dönmüyor; Tür 1'de Meta dışı eylemler hiç dönmüyor.
- **`action_breakdowns` örtük `action_type`.**
- **`STARTS_WITH`/`CONTAIN` süzgeci özet satırını süzmüyor** — süzülmüş liste + süzülmemiş
  toplam.
- **6 Ağustos 2026 sonrası** bazı kırılımlar bazı hesaplarda senkron istekte boş.
- Veri 28 güne kadar değişiyor: geçmiş günleri bir kez çekip donduran bir senkronizasyon
  eski rakamla kalır.
- `report_run_id` 30 günde ölür; `Job Skipped` = süresi doldu.

**Kural motoru**
- **Spec güncellemesi tam gövde ister** — yalnızca değişen filtreyi göndermek diğer
  filtreleri (`entity_type`, `time_preset`) siler; belge "değişmeyenler dahil hepsini ver"
  diyor ama eksik gönderince ne olduğunu söylemiyor.
- **Örtük `effective_status` süzgeci** — `PAUSED` nesnelere bakan bir kural, süzgeç açıkça
  verilmezse hiç eşleşmez.
- **`entity_type` dinamik** — gelecekte açılan (AI'ın açacağı) reklamlar da kurala girer.
- **`execution_count_limit` verilmezse sınırsız** — günlük %10 artış kuralı bütçeyi
  geometrik büyütür. `action_frequency` de varsayılan olarak yok.
- **`REBALANCE_BUDGET` (EVEN/PROPORTIONAL) bağışçıları DURDURUR**; tekrar açılan ad set eski
  bütçesiyle döner.
- **Kural `time_preset`'i `LAST_7_DAYS` bugünü içerir**, Insights'ın `last_7d`'si içermez —
  aynı adlı iki pencere farklı sayı.
- `attribution_window` için tek geçerli değerin `ACCOUNT_DEFAULT` olduğu yazıyor; ROAS
  örnekleri başka değer kullanıyor — gönderilen değerin kabul edilip YOK SAYILMA ihtimali var.
- Tetikli kurallar Ads Manager'da görünmüyor — müşteri hesabında "görünmez otomasyon".

**Value rules / bid multipliers**
- **Ayırma tuzağı:** `value_rules_applied=false` + `value_rule_set_id` birlikte gönderilirse
  set BAĞLANIYOR.
- **Kampanya bütçeli kampanyada farklı set'ler** "beklenmeyen teslimat".
- Bid multiplier silme geri alınamaz; `user_groups` okumada kaçışlı dizge.
- DMA'lı value rule'lar 22 Haziran 2026'dan beri etkisiz (hata değil, "aktif değil").
- >2 kriterli, özel yaş aralıklı ya da bazı yerleşimli set'ler Ads Manager'da salt okunur.

**Testler**
- Lift çalışması başladıktan sonra yüzdeler ve hedefler değiştirilemez.
- Hücre bütçeleri orantısız ise sonuç karşılaştırılamaz (belge uyarıyor, API engellemiyor).

## Advetics'in canlı bilgisiyle karşılaştırma

| # | Canlı bilgi | Bu sayfalarda | Durum |
|---|---|---|---|
| 8 | Insights çağrısında `use_unified_attribution_setting` ve `action_report_time` açıkça gönderiliyor | Belge 10 Haziran 2025'ten beri ikisinin de **yok sayıldığını** ve `action_report_time=mixed` uygulandığını yazıyor; aynı paragraf "Ads Manager ile aynısı için `true` gönder" diyor. Advetics `impression` gönderiyor ve yorumu bunun Ads Manager varsayılanı olduğunu söylüyor; belgeye göre Ads Manager `mixed`. | **ÇELİŞİYOR (kısmen).** Göndermek zarar vermez ama "dönüşüm gösterim gününe yazılıyor" varsayımı Meta dışı dönüşümler için yanlış olabilir. Canlıda ölçülmeli; `meta.provider.ts` yorumu güncellenmeli. |
| 9 | `age_max = 65` = "65 ve üzeri" | Value rules: "65 üst sınır olarak kullanılamaz, `18+` yaz" | **UYUŞUYOR** (dolaylı) |
| 10 | Bütçe/hesap `act_` önekli | Tüm örnekler `act_<AD_ACCOUNT_ID>` | **UYUŞUYOR** |
| 7 | `limit=500` → "reduce the amount of data" | Insights: kesin eşik yok; satır sayısı ya da özet veri noktası sınırı 100/1487534; zaman aşımı 100/1504018, 2/1504038; "rapor çok büyük" -3/1504045 | **UYUŞUYOR** (sabit eşik olmadığı doğrulanıyor; mesaj metni bu sayfalarda yok) |
| — | `is_adset_budget_sharing_enabled` zorunlu (4834011), Advetics `false` gönderiyor | Belge v24+ zorunluluğu ve 4834011'i doğruluyor | **UYUŞUYOR** |
| — | Advetics `bid_strategy` varsayılanı `LOWEST_COST_WITHOUT_CAP` | ASC/Advantage+ için önerilen değer | **UYUŞUYOR** |
| 1–6, 11, 12 | `destination_type`, `geo_locations` birleşimi, IG kimlikleri, imzalı görsel adresi, `?ids=`, CTWA, ilgi araması, organik metrikler | Bu sayfalarda geçmiyor | **Belgede geçmiyor** |
| — | "37 aylık" metrik sınırı (CLAUDE.md'de geçiyor) | Yalnızca "13 ay" (kırılımlı reach) ve "28 gün" (veri sabitlenmesi) var | **Belgede geçmiyor** — başka bölümde doğrulanmalı |
| — | Meta hesapları artık MCP ile yönetiliyor; panel gecikmeli ayna | Insights 15 dakikada bir yenileniyor, kural motoru tetikleri p99 7,5 dk | Uyumlu bilgi: panelin "şu an" rakamı en iyi ihtimalle 15 dk geride |

## Yapay zekâ ile yönetim için çıkarımlar

**Araç olması gereken işlemler (hepsi Advetics servisleri üzerinden):**
- `butce_degistir(nesne, yeni_tutar)` — ad set ya da kampanya (CBO) seviyesini kendisi
  belirlemeli; AI seviyeyi seçmemeli, nesnenin bütçesinin nerede durduğu okunup yazılmalı.
- `teklif_stratejisi_degistir(nesne, strateji, tutar?)` — strateji KAPALI sözlükten:
  `LOWEST_COST_WITHOUT_CAP`, `COST_CAP`, `LOWEST_COST_WITH_BID_CAP`,
  `LOWEST_COST_WITH_MIN_ROAS`. Min ROAS için araç ROAS'ı ondalık alıp ×10.000 çevirmeli
  (AI ham `roas_average_floor` yazmamalı).
- `durdur` / `devam_ettir`, `reklam_dondur` (ROTATE benzeri).
- `advantage_durumu_oku(kampanya)` — `advantage_state_info`'yu açıklamalı döndürmeli.
- `insights_getir(nesne, aralik, kirilim)` — kırılım KAPALI sözlükten ve yalnızca belgedeki
  izinli birleşimlerden; atıf ve rapor zamanı araç içinde sabit.
- `test_kur(tur, hucreler)` — yalnızca split/kreatif testi; lift "sınırlı erişim".

**Kapalı sözlükten seçilmesi gerekenler:** `bid_strategy`, `optimization_goal` (amaçla uyum
tablosuna göre), `billing_event` (hedefe göre izinli değerler), `pacing_type`,
`breakdowns`/`action_breakdowns` birleşimleri, `date_preset`, kural `execution_type`,
`time_preset`, value rule `criteria_type`/`criteria_values`.

**AI'ın uyması gereken platform sınırları (belgede yazanlar):**
- Bütçe/teklif değişikliği **günde en fazla 2–3 kez, günün erken saatlerinde**; sık değişiklik
  sistemi optimum teklifi yeniden öğrenmeye zorlar. AI aynı nesneye gün içinde ardışık
  değişiklik önermemeli; araç bir sayaçla engellemeli.
- **ASC/AAC göçü öğrenmeyi sıfırlar** — onaysız asla.
- CBO'da yayından sonra `optimization_goal` değişmez; Min ROAS'tan çıkılamaz; >70 ad set'te
  strateji/CBO değişmez; bütçe paylaşımı ortada açılamaz; paylaşım açıkken strateji
  değişmez. Araç bu durumları platforma gitmeden reddetmeli (sıfır çağrılı ret).
- iOS 14.5 kampanyalarında `COST_CAP`/Min ROAS için en az 3 gün süre.
- Dayparting yalnızca ömür boyu bütçeyle; saat başı, ≥1 saat.
- "Hangi değişiklik öğrenme aşamasını sıfırlar" listesi bu belgelerde **YOK** — AI genel bir
  kural uydurmamalı; bilinmiyorsa "değişiklik teslimatı geçici olarak etkileyebilir" demekle
  yetinmeli.

**Onay gerektirenler:** her bütçe/teklif/strateji değişikliği, durdurma/açma, Advantage+
durumunu değiştirecek her düzenleme (yerleşim kısıtı eklemek, kitleyi daraltmak, bütçeyi
kampanyaya taşımak), göç, `account_controls` (bütün hesabı etkiler), value rule set
bağlama/ayırma, Meta kural motorunda kural oluşturma, test kurma.

**AI'ın asla tahmin etmemesi gerekenler:**
- Minimum bütçe tutarları (belgede yok) — platform hatasını kullanıcıya aktar.
- Günlük harcamanın günlük bütçeyi aşmasının "hata" olup olmadığı (değil).
- Bir kampanyanın Advantage+ olup olmadığı — her zaman `advantage_state_info` oku.
- Atıf penceresi — rakamı yorumlarken "ad set'in atıf ayarıyla" de; pencereyi kendin seçme.
- 13 aydan eski veride reach yoksa "erişim 0" deme; "Meta bu dönem için erişim vermiyor".
- `actions` boşsa "dönüşüm yok" deme; atıf karışıklığı, kırılım kısıtı ya da gerçek yokluk
  ayrılmalı.
- Cost cap/bid cap'in tutacağını vaat etme.

**Meta'nın yerleşik kural motoru mu, Advetics'in kendi motoru mu?**

| | Meta `adrules_library` | Advetics kural motoru |
|---|---|---|
| Gecikme | Tetikli: saniyeler–7,5 dk; zamanlı: 30 dk'ya kadar | Senkronizasyon gecikmesine bağlı (en az 15 dk + iş kuyruğu) |
| Veri | Meta'nın canlı insights'ı | Advetics'in aynası; MCP ile yapılan değişiklikleri geç görür |
| Görünürlük | Tetikli kurallar Ads Manager'da GÖRÜNMEZ; müşteri ekranda göremez | Panelde görünür, Advetics denetim kaydında |
| Bütçe bilgisi | Aylık bütçe, şemsiye bütçe, müşteri sahipliği yok | `monthly_budgets`, şemsiye, sahiplik var |
| Tehlike | Sınırsız sayaç varsayılanı, durduran rebalance, tam gövde güncelleme, örtük süzgeçler | Kendi hataları kendi testleriyle |
| Kayıt | `/history`, `/adrules_history` | `audit_logs` |

Öneri (belgeden çıkarım): karar ve bütçe değişikliği Advetics motorunda kalmalı. Meta
motoru yalnızca **gecikmenin kritik olduğu güvenlik freni** için düşünülebilir (ör. "bugün
harcama X'i geçerse durdur" — tetikli `STATS_CHANGE` + `PAUSE`), ve o durumda da kural
Advetics'te kayıtlı olmalı, `execution_count_limit` ve `action_frequency` her zaman açıkça
verilmeli, kural motorunun yaptığı değişiklikler `/adrules_history`'den okunup panele
taşınmalı. İki motor aynı nesneye BÜTÇE yazarsa birbirinin kararını ezer ve Advetics'in
aylık bütçe hesabı eski rakamla çalışır — bunun için ya biri ya diğeri.

## Panel kurgusu için çıkarımlar

**Acemi kullanıcıya sorulacaklar:**
- Bütçe tutarı ve tipi: "günlük ortalama" mı "toplam (başlangıç–bitiş)" mi. Günlük seçilirse
  ekranda: *"Meta bazı günler bu tutarın biraz üzerinde harcayabilir; haftalık toplam
  korunur."* (Yüzde yazılmamalı — belge %25 ile %75 arasında çelişkili.)
- Bitiş tarihi (toplam bütçede zorunlu).
- Varsa hedef maliyet ya da ROAS **yalnızca** "Gelişmiş"te.

**Otomatik kararlaştırılacaklar (eşleme katmanı):**
- `bid_strategy=LOWEST_COST_WITHOUT_CAP`, `pacing_type=standard`, `billing_event=IMPRESSIONS`
  (hedef izin verdiği sürece), `optimization_goal` amaçtan — hepsi AÇIKÇA gönderilir.
- Tek ad set'li kampanyada `is_adset_budget_sharing_enabled=false`.
- Kampanya mı ad set mi bütçesi: tek ad set'te fark yok; çok ad set'li kurguda karar
  bilinçli verilmeli çünkü kampanya bütçesi + geniş hedefleme Advantage+ durumunu açar.
- Oluşturduktan sonra `advantage_state_info` okunup kayda yazılmalı; panelde "Meta bu
  kampanyayı Advantage+ olarak yönetiyor" bilgisi gösterilmeli (sessiz durum değişikliği).

**Yalnızca Gelişmiş modda:**
- Teklif stratejisi (cost cap / bid cap / min ROAS) ve tutarı; uyarılar: "garanti değil",
  "bütçeyi harcamayabilir", "min ROAS seçildikten sonra değiştirilemez (kampanya bütçesinde)".
- Hızlandırılmış teslimat (`no_pacing`).
- Gün/saat zamanlaması — yalnızca toplam bütçede açılmalı; saat başı ve ≥1 saat seçici;
  saat dilimi seçimi açık ("izleyicinin saati" / "hesabın saati").
- Ad set başına harcama alt/üst sınırları (kampanya bütçesinde).
- Value rules (yaş/cinsiyet/konum/yerleşim/OS'e göre teklif artırma/azaltma) — 10 kural,
  ilk eşleşen kazanır bilgisiyle; `18-65` gibi aralıklar arayüzde engellenmeli.
- A/B (kreatif) testi: 2–5 varyant, eşit bölüşüm önerili.

**Raporlama ekranı:**
- Atıf: "Rakamlar her reklam setinin kendi atıf ayarıyla, Ads Manager'daki gibi." Farklı
  atıf ayarlı ad set'leri toplayan ekranda dönüşüm boş gelirse NEDENİ yazılmalı
  (`emptyReason`).
- 13 aydan eski dönemlerde kırılımlı erişim yoksa "Meta bu dönem için erişim vermiyor".
- Saatlik kırılımda erişim/sıklık sütunu gizlenmeli (0 yanıltıcı).
- Son 28 gün "kesinleşmemiş" etiketi taşıyabilir; rakamlar sonradan değişebilir.
- Advantage+ (eski ASC) kampanyalarında `user_segment_key` ile yeni/mevcut müşteri ayrımı.

## Sayfa sayfa dizin

| Dosya | Kaynak URL | Tek satır özet | Önem |
|---|---|---|---|
| marketing-api__ad-rules.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-rules | Kural motoru giriş: `adrules_library`, zamanlı/tetikli, status | Orta |
| marketing-api__ad-rules__ad-rules-specs.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-rules/ad-rules-specs | Evaluation/execution/change spec bağlantı sayfası | Düşük |
| marketing-api__ad-rules__guides__advanced-scheduling.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-rules/guides/advanced-scheduling | `CUSTOM` zamanlama: `start_minute`/`end_minute`/`days`, VEYA birleşimi | Düşük |
| marketing-api__ad-rules__guides__api-calls.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-rules/guides/api-calls | Oku/güncelle (tam gövde)/sil, history, preview, execute, governed | Orta |
| marketing-api__ad-rules__guides__evaluation-spec-filters.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-rules/guides/evaluation-spec-filters | Önekli alanlar, atıf/zaman önekleri, aggregate, formüller | Orta |
| marketing-api__ad-rules__guides__rebalance-budget.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-rules/guides/rebalance-budget | `REBALANCE_BUDGET` türleri; bağışçıyı durdurma; örnekte listede olmayan tür | Orta |
| marketing-api__ad-rules__guides__roas-ad-rules.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-rules/guides/roas-ad-rules | Olgun veriyle ROAS kuralı (`LAST_ND_14_8`, `hours_since_creation`) | Orta |
| marketing-api__ad-rules__guides__scheduled-based-rules.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-rules/guides/scheduled-based-rules | `schedule_spec` türleri; `execution_count_limit` örneği | Orta |
| marketing-api__ad-rules__guides__trigger-based-rules.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-rules/guides/trigger-based-rules | Tetik türleri, milestone asgari değerleri, gecikme, webhook | Orta |
| marketing-api__ad-rules__overview__change-spec.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-rules/overview/change-spec | `amount`/`unit`/`limit`/`target_field` ile bütçe/teklif değişimi | Orta |
| marketing-api__ad-rules__overview__evaluation-spec.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-rules/overview/evaluation-spec | Filtre operatörleri, `time_preset`, örtük `effective_status`, metadata/insights alanları | Yüksek |
| marketing-api__ad-rules__overview__execution-spec.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-rules/overview/execution-spec | Eylem türleri, `execution_count_limit` (varsayılan sınırsız), `action_frequency` | Yüksek |
| marketing-api__advantage-campaigns.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-campaigns | Yeni Advantage+ yapısı, `advantage_state_info`, ASC göçü ve sürüm takvimi | Yüksek |
| marketing-api__advantage-shopping-campaigns.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-shopping-campaigns | Eski ASC (v25'te oluşturma kapalı); tek ad set; hesap kontrolleri | Orta |
| marketing-api__advantage-shopping-campaigns__audience-type-url-parameters.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-shopping-campaigns/audience-type-url-parameters | ASC yeni/mevcut müşteri UTM parametresi (`custom_audience_info`) | Düşük |
| marketing-api__advantage-shopping-campaigns__cross-channel-conversion.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-shopping-campaigns/cross-channel-conversion | ASC'de site+uygulama/Shop dönüşümü, `omnichannel_object`, `tracking_specs` | Düşük |
| marketing-api__bidding-and-optimization__bid-multiplier.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding-and-optimization/bid-multiplier | Bid multiplier (2027'de kalkıyor) ve value rules'a çeviri/göç | Orta |
| marketing-api__bidding.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding | Teklif bölümü içindekiler | Düşük |
| marketing-api__bidding__guides.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding/guides | Teklif kılavuzları bağlantı listesi | Düşük |
| marketing-api__bidding__guides__adset-budget-sharing.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding/guides/adset-budget-sharing | `is_adset_budget_sharing_enabled` (v24 zorunlu), %20 paylaşım, %75 esneklik, hata kodları | Yüksek |
| marketing-api__bidding__guides__advantage-campaign-budget.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding/guides/advantage-campaign-budget | CBO alanları, ad set harcama sınırları, kilitler (>70 ad set, min ROAS) | Yüksek |
| marketing-api__bidding__guides__cost-per-action-ads.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding/guides/cost-per-action-ads | Eylem başına faturalama kısıtları; örnekler kendi içinde tutarsız | Düşük |
| marketing-api__bidding__guides__optimized-cost-per-mille.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding/guides/optimized-cost-per-mille | oCPM: `IMPRESSIONS` faturalama, bütçe zorunlu | Düşük |
| marketing-api__bidding__overview.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding/overview | Etkin teklif, varsayılan `optimization_goal`, amaç–hedef tablosu, Reach→Impressions | Yüksek |
| marketing-api__bidding__overview__bid-strategy.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding/overview/bid-strategy | Dört strateji, cost cap koşulları, `roas_average_floor` ×10.000 | Yüksek |
| marketing-api__bidding__overview__billing-events.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding/overview/billing-events | `buying_type` ve hedef → izinli `billing_event` tabloları | Yüksek |
| marketing-api__bidding__overview__budgets.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding/overview/budgets | Günlük/ömür boyu bütçe, en küçük para birimi, günlük %25 aşım | Yüksek |
| marketing-api__bidding__overview__pacing-and-scheduling.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding/overview/pacing-and-scheduling | `pacing_type`, dayparting (yalnızca ömür boyu), değişiklik sıklığı 2–3/gün | Yüksek |
| marketing-api__bidding__value-rules.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/bidding/value-rules | Value rule set CRUD, kriterler, bağlama/ayırma tuzağı, uygun yapılandırmalar | Orta |
| marketing-api__guides__lift-studies.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/lift-studies | Conversion lift kurulum/sonuç (sınırlı erişim) | Düşük |
| marketing-api__guides__split-testing.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/split-testing | Split test ve 2–5 hücreli kreatif testi (`SPLIT_TEST_V2`) | Orta |
| marketing-api__insights-api__ads-volume.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights-api/ads-volume | Sayfa başına çalışan/incelemedeki reklam sayısı | Orta |
| marketing-api__insights.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights | Insights uçları, varsayılan 30 gün, parametre/alan/kırılım | Yüksek |
| marketing-api__insights__best-practices.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights/best-practices | Hız sınırı, async işler, 13 ay reach, atıf parametrelerinin yok sayılması | Yüksek |
| marketing-api__insights__breakdowns.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights/breakdowns | Kırılım listesi, izinli birleşimler, Meta dışı eylem kısıtları | Yüksek |
| marketing-api__insights__error-codes.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights/error-codes | Insights hata kod/alt kod tablosu | Yüksek |
| marketing-api__insights__marketing-mix-modeling.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights/marketing-mix-modeling | `breakdowns=mmm` CSV dışa aktarımı | Düşük |
| marketing-api__reference__ad-study.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-study | AdStudy alanları, oluşturma parametreleri, kısıtlar | Orta |
| marketing-api__reference__ad-study__cells.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-study/cells | Hücreleri okuma kenarı (yalnızca GET) | Düşük |
| marketing-api__reference__ad-study__continuous_lift_config.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-study/continuous_lift_config | Sürekli lift ayarı okuma kenarı | İlgisiz |
| marketing-api__reference__ad-study__instances.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-study/instances | Private Lift hesaplama örnekleri (okuma) | İlgisiz |
| marketing-api__reference__ad-study__objectives.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-study/objectives | Hedefleri okuma kenarı; geliştirme erişiminde 270 hatası | Düşük |
| marketing-api__reference__ad-study__related_ad_accounts.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-study/related_ad_accounts | Çalışmayı görebilen hesaplar (okuma) | İlgisiz |
| marketing-api__reference__ad-study__viewers.md | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-study/viewers | Çalışmanın paylaşıldığı kullanıcılar (okuma) | İlgisiz |
| ccco.md | https://developers.facebook.com/documentation/ads-commerce/ccco | Site + uygulama çapraz kanal dönüşüm optimizasyonu | Düşük |
