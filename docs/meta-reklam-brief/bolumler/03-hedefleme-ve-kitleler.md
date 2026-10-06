# 03 — Hedefleme, kitleler ve marka güvenliği

> Kaynak: 50 sayfa (`_listeler/D-hedefleme.txt`) · Okunan: 50/50 · Bilgi belgeden, canlıda doğrulanmadı.
>
> Okuma notu: Custom Audience kenar sayfalarındaki SDK örnek blokları (PHP/JS/Android/iOS) atlandı, parametre/alan/hata tabloları okundu. Belgedeki örneklerin bir kısmı `v2.11`, `v24.0`, `v25.0` sürümlerini karışık kullanıyor; bazı örneklerde ana makine `graph.facebook.com` yerine `facebook.com` yazılmış (belge hatası).

## Özet: Advetics için ne demek

1. **`geo_locations` kovaları BİRLEŞİM — belge bunu açıkça söylüyor.** Temel hedefleme örneği "Menlo Park çevresi, *ya da* Teksas'ta, *ya da* Japonya'da yaşayan" diye anlatılıyor ve aynı nesnede `countries` + `regions` + `cities` gönderiliyor. Yani "Türkiye + İzmir" = Türkiye geneli. Advetics'in canlıda öğrendiği kural belgeyle UYUŞUYOR. Daraltmanın (kesişimin) tek belgeli yolu kapsayan kovayı göndermemek ya da `excluded_geo_locations` kullanmak.
2. **v23.0'dan beri yeni ad set'te `targeting_automation.advantage_audience` ya `1`'e düşüyor ya da açıkça yazılması şart.** "Varsayılan" (yaş 18–65, cinsiyet yok, özel kitle yok, ilgi yok) bir hedefleme gönderip bayrağı yazmamak = **Advantage+ kitle SESSİZCE AÇIK**. Varsayılan dışı bir hedefleme (ör. yaş 30–50 + özel kitle) bayraksız gönderilirse API hata veriyor. Advetics'in `advantage_audience: 0`'ı her zaman yazması doğru ve şart.
3. **Advantage+ kitle açıkken yaş bir SINIR DEĞİL, ÖNERİ.** Kesin kalanlar yalnızca: konum, minimum yaş, dil, özel kitle hariç tutmaları. `age_min` yalnızca 18–25 arası verilebiliyor, `age_max` sabit 65, `age_range` öneri. Cinsiyet, ilgi alanları, özel kitle dahil etmeleri genişletilebilir.
4. **Advantage lookalike ve Advantage custom audience desteklenen amaçlarda VARSAYILAN AÇIK** (`targeting_relaxation_types.lookalike` / `.custom_audience`). Advetics `custom_audiences` gönderiyor ama `targeting_relaxation_types` göndermiyor → "Bu özel kitleye göster" seçimi Meta'da sessizce genişliyor olabilir. Desteklenmeyen amaçta bu alanı göndermek HATA veriyor; yani alan amaca göre yazılmalı.
5. **Advantage detailed targeting (ilgi alanı genişletme) için belge kendi içinde çelişkili:** bir sayfa "varsayılan kapalı, `targeting_optimization: none` ile kapatılır" diyor; başka bir sayfa 21 optimizasyon hedefinde (bağlantı tıklaması, açılış sayfası görüntüleme, konuşmalar, dönüşümler…) genişlemenin **zorunlu** olduğunu ve yalnızca okunabilir `targeting_optimization_types` alanında görüneceğini söylüyor. Bu hedeflerde ilgi alanları kesin süzgeç değil. Oluşturduktan sonra geri okunmalı.
6. **Türkiye'de il = `regions`, ilçe/şehir = `cities` kovası; anahtar `/search?type=adgeolocation` ile bulunur, ad değil `key` saklanır.** Ülke kodu ile il/ilçe aynı nesneye konmaz. Belgede Türkiye'ye özgü hiçbir şey yok; ilçe düzeyinin hangi türle (`city`, `subcity`, `medium_geo_area`) döneceği ve `subcity` gibi türlerin hangi kovaya yazılacağı BELGEDE YOK.
7. **Özel reklam kategorisi alanı her kampanyada ZORUNLU** (`special_ad_categories`, yoksa `NONE`/boş dizi). Konut/istihdam/finans kısıtları ABD, Kanada ve "Avrupa" için zorunlu; dışındakiler için "isteğe bağlı". Türkiye'nin bu "Avrupa"ya dahil olup olmadığı BELGEDE BELİRSİZ. Siyasi kategori 6 Ekim 2025'ten beri AB'de hiç yayınlanmıyor.
8. **Silinen ya da paylaşımı kaldırılan özel kitle, onu kullanan reklamları KALICI olarak durduruyor** — "yeniden başlatılamaz". 2 yıl kullanılmayan kitleler otomatik silinme sırasına giriyor; 2 Eylül 2025'ten beri sağlık/finans çağrıştıran kitleler `operation_status = 471` ile işaretlenip kullanılamıyor ve kullanan ad set `WITH_ISSUES` oluyor.
9. **Hedeflemenin insan diliyle karşılığı API'den okunabiliyor** (`targetingsentencelines`). Yayından önce kullanıcıya/AI'a "Konum — yaşayan: Türkiye, İzmir" gibi Meta'nın KENDİ yorumunu göstermek, birleşim hatasını gözle yakalatmanın belgedeki en ucuz yolu.
10. **Yerleşim alanı boş bırakılırsa "bütün varsayılan yerleşimler" ve ileride eklenecek yeni yerleşimler** dahil oluyor. WhatsApp Durum yerleşimi dahilse Mayıs 2026'dan beri **yaşı bilinmeyen kişiler varsayılan olarak hedefleniyor** (`user_age_unknown` varsayılanı `true`).
11. **Marka güvenliği API'lerinin (blok listeleri, içerik raporları, feed doğrulama, passback) neredeyse hepsi Meta'nın ayrıca verdiği "capability grant" istiyor** — iş ortağı programı. Advetics'in pratikte kullanabileceği kısım ad set hedeflemesindeki üç alan: `brand_safety_content_filter_levels`, `excluded_publisher_categories`, `excluded_publisher_list_ids`.

## Kavramlar, kurallar ve alanlar

### 1. Hedefleme nesnesi (`targeting`) — genel kurallar

- `targeting` ad set'in alanı. Konum, demografi, ilgi, davranış, özel kitle, yerleşim ve otomasyon bayraklarını tek JSON nesnesinde taşıyor.
- **En az bir ülke zorunlu — özel kitle kullanılıyorsa değil.** Belge "ülke belirtmelisiniz, Custom Audience kullanmıyorsanız" diyor. Yani yalnızca özel kitle + konumsuz bir hedefleme geçerli ve o zaman ülke sınırı YOK: kitledeki kişiler nerede olursa olsun. Advetics boş konumda `TR`ye düşüyor; bu doğru bir savunma.
- **Benzer kitle (lookalike) kullanılıyorsa konum zorunlu** (yeni lookalike modelinde): konumsuz ad set `error_subcode 192342134` "Missing Location while using Lookalike" alıyor.
- `flexible_spec` kullanılıyorsa hedeflemede şunlardan biri ZORUNLU: `geo_locations`, `custom_audiences`, `product_audience_specs`, `dynamic_audience_ids`.
- **Mantık:**
  - Aynı kova/alan içindeki değerler VEYA (ülkeler, şehirler, `publisher_platforms` öğeleri…).
  - `geo_locations` içindeki farklı kovalar da VEYA (birleşim) — belge örneği "or" diye anlatıyor.
  - Farklı alanlar arası (konum × yaş × cinsiyet × `flexible_spec` × yerleşim) VE.
  - `flexible_spec` dizisinin üst düzey öğeleri birbirine VE, bir öğenin içindeki listeler VEYA.
  - Advanced targeting sayfası ayrıca "Facebook kombinasyonları varsayılan olarak VEYA'lar" diyor; bunun kök düzeydeki `interests` + `behaviors` için mi geçerli olduğu BELGEDE BELİRSİZ. Kesin mantık için `flexible_spec` kullanılmalı.
- Flexible targeting sayfası "`flexible_spec` içinde verilen davranış gibi segmentler dışarıda kullanılamaz" diyor; ama aynı belgenin başka örnekleri `interests` ve `behaviors`'ı kök düzeyde gönderiyor. ÇELİŞKİLİ — Advetics'in ilgi alanlarını yalnızca `flexible_spec` içinde göndermesi güvenli taraf.

### 2. Demografi

| Alan | Tür | Kural / varsayılan |
|---|---|---|
| `age_min` | int | Varsayılan **18**. Verilirse ≥ 13. Uygulama yükleme amacında uygulamanın kendi yaş sınırı daha yüksekse o kullanılır (13 yazsanız bile 18 olur — sessiz). |
| `age_max` | int | ≤ 65. Belgede 65'in "65 ve üzeri" olduğu açıkça yazmıyor; ama özel kategori kısıtları "18 ile 65+" diyor ve geri okunan varsayılan ad set `age_max: 65` dönüyor. |
| `age_range` | [min, max] | Yalnızca Advantage+ kitle ya da "yaş önerisi" açıkken anlamlı; **öneri**, sınır değil. Verilmezse `age_min`/`age_max`'tan türetiliyor. |
| `genders` | int[] | `1` erkek, `2` kadın. Varsayılan hepsi. |
| `user_age_unknown` | bool | Yalnızca WhatsApp Durum yerleşimi. **Mayıs 2026'dan beri WhatsApp Durum dahilse ve alan yoksa `true`** → yaşı bilinmeyenler dahil. `false` ile dışlanır. |
| `relationship_statuses` | int[] | 1 bekâr, 2 ilişkide, 3 evli, 4 nişanlı, 6 belirtilmemiş. `0` kullanılmaz. Null/yok = hepsi. |
| `life_events`, `industries`, `income`, `family_statuses` | `{id, name?}[]` | Kimlikler `/search?type=adTargetingCategory&class=...` ile. |
| `education_schools` (≤200), `education_majors` (≤200), `education_statuses` (1–13 tamsayı), `college_years` (≥1980), `work_employers` (≤200), `work_positions` (≤200) | | `adeducationschool`, `adeducationmajor`, `adworkemployer`, `adworkposition` aramaları. |
| `user_adclusters` | `{id,name}[]` ≤50 | Hesaba özel "Broad Category" (BCT). `GET act_X/broadtargetingcategories`. |
| `locales` | int[] ≤50 | Dil. `type=adlocale` araması (ör. 6 = English US). Kısıtlar sayfası "90 (50 önerilen)" diyor — ÇELİŞKİ. |

**Demografik seçenekler her ülkede yok** ve `class=demographics` taraması **erişim token'ının sahibi kullanıcının ev ülkesine göre** farklı (boş dahil) sonuç dönebiliyor. Aynı çağrı iki kullanıcıda farklı liste = sessiz fark.

### 3. Konum (`geo_locations` / `excluded_geo_locations`)

| Kova | Biçim | Sınır | Not |
|---|---|---|---|
| `countries` | `["TR"]` | — | ISO-2 kod. |
| `country_groups` | `["europe", "gcc", …]` | — | 20 grup: `worldwide`, `africa`, `afta`, `android_app_store`, `android_free_store`, `apec`, `asia`, `caribbean`, `central_america`, `cisfta`, `eea`, `emerging_markets`, `europe`, `gcc`, `itunes_app_store`, `mercosur`, `nafta`, `north_america`, `oceania`, `south_america`. |
| `regions` | `[{key:"3847"}]` | 200 | İl/eyalet. Anahtar sayısal DİZGE. |
| `cities` | `[{key, radius, distance_unit}]` | 250 | Yarıçap 10–50 mil / 17–80 km. Yarıçapın zorunlu olup olmadığı BELGEDE BELİRSİZ (tablo "key, radius, distance_unit belirtin" diyor, örneklerin hepsi yarıçaplı). |
| `zips` | `[{key:"US:94304"}]` | 50.000 (eski 2.500) | 2.500 üstü `location_cluster` nesnesine çevriliyor; kısıtlar sayfası eşiği 50.000 diyor — ÇELİŞKİ. Desteklenen ülkeler Yardım Merkezi'nde; Türkiye'nin durumu belgede yok. |
| `places` | `[{key, name, radius, distance_unit}]` | 200 | Facebook "place" nesnesi. |
| `custom_locations` | `{latitude, longitude, radius, distance_unit, name}` ya da `{address_string, radius}` | 200 | Yarıçap 0,63–50 mil / 1–80 km. **`distance_unit` varsayılanı `mile`** — km sanılarak "5" yazılırsa 8 km olur (sessiz). Posta kutusu tek başına geçersiz; adreste posta kodu yazılmamalı. |
| `custom_locations` (çok şehir) | `{custom_type:"multi_city", country / country_group, min_population, max_population}` | | Nüfus eşiğine göre şehir kümesi. |
| `geo_markets` | `[{key:"COMSCORE_MARKET:2001"}]` | 2.500 / 210 | İki sayfa farklı sınır veriyor — ÇELİŞKİ. ABD odaklı. |
| `electoral_district(s)` | `[{key:"US:CA01"}]` | | Yalnız ABD. Alan adı tabloda tekil, örnekte çoğul — belge tutarsız. |
| `location_types` | `["home","recent"]` | | **Tek geçerli değer bu ikili ve gönderilmezse de bu.** `recent` hariç tutmada kullanılamaz. |

- **Yarıçap uyarısı:** Birden çok konumla `radius` kullanmak `code 100 / subcode 1815946` hatası üretebiliyor; belge "her konum için ayrı reklam ya da yarıçapsız" öneriyor.
- **Coğrafi hiyerarşi (büyükten küçüğe):** `REGION` › `LARGE_GEO_AREA` › `MEDIUM_GEO_AREA` › `SMALL_GEO_AREA` › `METRO_AREA` (henüz yok) › `CITY` › `SUBCITY` › `NEIGHBORHOOD` › `SUBNEIGHBORHOOD` (henüz yok). Ancak `geo_locations` alan tablosunda `LARGE/MEDIUM/SMALL_GEO_AREA`, `SUBCITY`, `NEIGHBORHOOD` için **kova adı tanımlanmamış**. Bu türlerin hangi kovaya yazılacağı BELGEDE YOK.
- Şehir araması (`location_types=["city"]`) belgedeki örnekte `type: "subcity"` satırı da döndürüyor (Manhattan, NY). 2019'dan beri bazı şehirler "başka rollere" taşınmış; `city` aramak hâlâ çalışıyor ama dönen türe güvenilmeli.
- `key` kategori içinde sabit ve tekil; `name` dahil diğer alanlar değişebilir → **anahtar saklanır, ad yalnızca etiket**.
- **"Seçili şehir/bölgelerle ilgilenen kişilere de ulaş"**: `targeting_automation.individual_setting.geo = 1` açar, `0` kapatır. Konumu, o şehre seyahat/satın alma/ilgi niyeti gösteren (aynı ülkedeki) kişilere genişletir; yalnızca şehir/bölge seçiliyken çalışır. **Varsayılanı BELGEDE YOK.**

#### Türkiye'de il/ilçe hedeflemesinin belgeye göre doğru biçimi

Belge Türkiye örneği içermiyor; aşağıdaki kurallar genel kurallardan çıkarılmıştır.

1. **Anahtar bulma:** `GET /search?type=adgeolocation&location_types=["region"]&q=İzmir&country_code=TR` (il) ve `location_types=["city"]` (ilçe/şehir). Bir ilin içindeki şehirleri aramak için `region_id=<il anahtarı>` parametresi var. `country_code` göndermek başka ülkelerdeki aynı adları eliyor (Advetics bugün göndermiyor; etiketteki ülke adına güveniyor). Varsayılan `limit` **8** — gönderilmezse sonuç sessizce kırpılıyor (Advetics 25 gönderiyor).
2. **Bir ülkenin il/şehir desteği:** ülke satırındaki `supports_region` / `supports_city` bayrakları. Belge örneğinde bazı ülkelerde ikisi de `false`; Türkiye'nin değeri canlıda okunmalı.
3. **Gönderim:**
   - Yalnız il: `{"geo_locations": {"regions": [{"key": "<İL>"}]}}`
   - Yalnız ilçe/şehir: `{"geo_locations": {"cities": [{"key": "<ŞEHİR>"}]}}` (yarıçap isteğe bağlıysa yarıçapsız; belgede belirsiz)
   - İl + başka ilin ilçesi: `regions` ve `cities` birlikte — sonuç BİRLEŞİM, istenen de bu.
   - **`countries: ["TR"]` aynı nesneye EKLENMEZ** — eklenirse sonuç Türkiye geneli.
   - **Aynı ilin kendisi ve ilçesi birlikte seçilirse** birleşim nedeniyle ilçe anlamsızlaşır (bütün il). Hata yok; panel bunu kullanıcıya söylemeli.
   - "Türkiye, İstanbul hariç": `geo_locations.countries=["TR"]` + `excluded_geo_locations.regions=[{key:"<İSTANBUL>"}]`. (Özel kategoride konum hariç tutma yasak.)
4. **İlçe türü belirsizliği:** Türkiye ilçeleri aramada `city`, `subcity` ya da `*_geo_area` türüyle dönebilir; belge bu türlerin kovasını tanımlamıyor. Advetics'in `BoostLocation.type` enum'u `country | region | city`; `subcity` gibi bir tür dönerse ya şema reddeder ya da satır elenir — eleme sonrası liste boşalırsa `metaTargetingFrom` **TR geneline** düşer. Canlıda bir ilçe aranıp dönen `type` değerleri ölçülmeli ve tanınmayan tür SESSİZCE ATILMAMALI, kullanıcıya söylenmeli.

### 4. İlgi alanı, davranış ve ayrıntılı hedefleme

- `interests`, `behaviors`: `{id, name?}` dizisi; Meta yalnızca `id`'ye bakar, `name` okunabilirlik için.
- İlgi alanı limiti: "sınırsız (100 önerilen)"; `flexible_spec` üst düzey en çok **25** öğe, ikinci düzey en çok **1.000**.
- `flexible_spec` içinde kullanılabilen alanlar: `custom_audiences`, `interests`, `behaviors`, `college_years`, `education_majors`, `education_schools`, `education_statuses`, `family_statuses`, `income`, `industries`, `life_events`, `user_adclusters`, `work_positions`, `work_employers`.
- **İlgi alanları yeniden adlandırılabiliyor;** ada göre doğrulama bir gün düşer → `adinterestvalid` ile `interest_fbid_list` (kimlikle) doğrula.
- Arama "bütün ilgi alanlarını döndürmez" (belge bunu iki kez söylüyor).
- Hesap düzeyi ayrıntılı hedefleme uçları (birden çok türü tek çağrıda arar): `targetingsearch`, `targetingsuggestions` (varsayılan 30, en çok 45), `targetingbrowse`, `targetingvalidation`. `limit_type` verilmezse `work_employers`, `work_positions`, `education_majors`, `education_schools` türlerinde **2.000 kişiden küçük sonuçlar süzülüyor**. `locale` varsayılanı reklam hesabının dili.
- Yanıtta `audience_size_lower_bound` / `audience_size_upper_bound`; belge bu büyüklüğün ülkeye göre mi dünya geneli mi olduğunu SÖYLEMİYOR.
- **Mobil:** `user_os` (zorunlu — mobil hedeflemede), `user_device`, `excluded_user_device`, `wireless_carrier: ["Wifi"]`. iOS ve Android sürüm aralıkları karıştırılamaz (`["Android", "iOS_ver_8.0_and_above"]` geçersiz). Marka bilinirliği amacında cihaz modeli/iOS sürümü hedeflenemez. SKAdNetwork/AEM uygulama reklamlarında yalnız `iOS_ver_14.0_and_above`.

### 5. Advantage (hedefleme otomasyonu) — hangisi ne zaman açık

| Özellik | Alan | Açma / kapama | Varsayılan (belgeye göre) | Genişlemeyen |
|---|---|---|---|---|
| **Advantage+ kitle** | `targeting_automation.advantage_audience` | `1` / `0` | **v23.0+ yeni ad set'te:** varsayılan ya da "gevşetilmiş" kurulumda alan yazılmazsa `1`; diğer kurulumlarda alan yazılmazsa HATA. Güncellemede bu davranış yok. | Konum, minimum yaş, dil, özel kitle hariç tutmaları |
| **Advantage custom audience** | `targeting_relaxation_types.custom_audience` | `1` / `0` | Desteklenen amaçlarda **açık** | — |
| **Advantage lookalike** | `targeting_relaxation_types.lookalike` | `1` / `0` | Desteklenen amaçlarda **açık** | — |
| **Advantage detailed targeting** | `targeting_optimization` | `expansion_all` / `none` | Detay sayfası: **kapalı**. Advantage targeting sayfası: aşağıdaki hedeflerde **zorunlu açık** (`targeting_optimization_types`, salt okunur) — ÇELİŞKİ | Konum, yaş, cinsiyet, hariç tutmalar (bireysel genişletme bunları değiştirmez) |
| **Yaş önerisi** | `targeting_automation.individual_setting.age` | `1` | Yalnız seçili reklamverenler; yalnız `OUTCOME_SALES` ve `APP_INSTALLS` | Meta yaş aralığının dışına çıkabilir |
| **Cinsiyet önerisi** | `targeting_automation.individual_setting.gender` | `1` | Aynı | Meta cinsiyet dışına çıkabilir |
| **Şehir/bölge ilgisi** | `targeting_automation.individual_setting.geo` | `1` / `0` | BELGEDE YOK | Aynı ülke içinde kalır |

- **"Varsayılan kurulum" tanımı:** yaş, cinsiyet, özel kitle dahil etme ve ayrıntılı hedefleme dahil etme ya varsayılan değerde (18–65, tüm cinsiyetler) ya da hiç yok. Advetics'in "TR, 18+, herkes" hedeflemesi tam olarak budur → bayrak yazılmazsa Advantage+ AÇIK.
- **"Gevşetilmiş kurulum":** bireysel gevşetme ayarları (ör. `targeting_relaxation_types: {custom_audience:1, lookalike:1}` + `targeting_optimization: "expansion_all"`) kullanılıyorsa da varsayılan `1`.
- **Zorunlu genişletme listesi (`targeting_optimization_types` → `lookalike: 1`, `detailed_targeting: 1`):** Value, App installs, App events, Conversations, Offsite clicks, Landing page views, Replies, Messaging purchase conversions, Research poll responses, In app value, Subscribers, Clicks, Reminder set, Social impressions, Offer claims, Offsite conversions, Return on ad spend, Onsite conversions, App installs and offsite conversions, Incremental offsite conversions, Store visits. Diğer hedeflerde bu alan görünmüyor. Listede gönderi etkileşimi, erişim, gösterim, ThruPlay yok.
- Advantage+ kitle açıkken: `age_min` yalnız **18–25**, `age_max` verilemez (**65 sabit**), sistem `age_min`/`age_max`'ı varsayılana sıfırlıyor.
- `custom_audiences` `flexible_spec` içinde kullanılırsa Advantage custom audience "varsayılan açık olabilir".
- Rezervasyon (erişim ve sıklık) akışlarında otomasyon desteklenmiyor.
- Detailed targeting genişlemesi açıkken `reachestimate` Ads Manager'dan FARKLI (daha büyük, genişlemiş) sayı dönebiliyor.

### 6. Yerleşim hedeflemesi

| Alan | Değerler | Varsayılan / kısıt |
|---|---|---|
| `device_platforms` | `mobile`, `desktop` | Hepsi |
| `publisher_platforms` | `facebook`, `instagram`, `threads`, `messenger`, `audience_network` (+ `whatsapp` örnekte) | Hepsi. Belge "verilirse `facebook` içermeli" diyor ama Instagram-only örnekler de veriyor — ÇELİŞKİ. Threads için `instagram` + `threads` birlikte. |
| `facebook_positions` | `feed`, `right_hand_column`, `marketplace`, `video_feeds`, `story`, `search`, `instream_video`, `facebook_reels`, `facebook_reels_overlay`, `profile_feed`, `notification` | Hepsi. `story` → FB `feed` ya da IG `story` + `mobile` şart. `marketplace`/`search`/`profile_feed`/`notification` → `feed` şart. `right_hand_column` tek başına video/collection/canvas'ta olmaz. |
| `instagram_positions` | `stream`, `story`, `explore`, `explore_home`, `reels`, `profile_feed`, `ig_search`, `profile_reels` | Hepsi |
| `threads_positions` | `threads_stream` | IG `stream` şart |
| `audience_network_positions` | `classic`, `rewarded_video` | Hepsi. Audience Network tek başına seçilemez. Video görüntüleme amacında `THRUPLAYS` ister. |
| `messenger_positions` | `sponsored_messages`, `story` | Varsayılan `story`. `sponsored_messages` başka hiçbir yerleşimle birlikte olamaz. |
| `whatsapp_positions` | `status` | IG `story` şart + Click-to-WhatsApp ayarı şart |
| `placement_soft_opt_out` | yerleşim listesi | Hariç tutulan yerleşime **%5'e kadar** harcama izni (isteğe bağlı, kendiliğinden açık değil). |

- **Alan boş = bütün varsayılan yerleşimler + Meta'nın ileride ekleyeceği yeni yerleşimler.** Bugün çalışan bir ad set yarın yeni bir yüzeyde görünebilir.
- Seçilen yerleşim amaçla uyumsuzsa ad set oluşur ama o yerleşime GİTMEZ. Gerçek yerleşim `effective_publisher_platforms`, `effective_facebook_positions`, `effective_instagram_positions`, `effective_device_platforms`, `effective_audience_network_positions` ile okunur (bu alanlar varsayılan olarak dönmez, istenmeli). Neden süzüldüğü `recommendations` alanında (ör. kod 1815609 "Placement Not Supported By Objective", 1815610 "Device Platform Not Supported By Objective").
- Mantık sonucunda kimse kalmıyorsa (ör. `instagram` + `desktop`) hata veriyor.

### 7. Özel reklam kategorileri (`special_ad_categories`)

- Değerler: `HOUSING`, `FINANCIAL_PRODUCTS_SERVICES`, `EMPLOYMENT`, `ISSUES_ELECTIONS_POLITICS`, `NONE`. **`CREDIT` 14 Ocak 2025'te `FINANCIAL_PRODUCTS_SERVICES` ile değiştirildi** (belgenin bir yerinde 21 Ocak yazıyor — tarih tutarsız).
- **Her kampanya oluşturma/düzenlemesinde alan ZORUNLU**; kategori yoksa `NONE` ya da boş dizi. Birden çok kategori birlikte verilebilir.
- Herhangi bir kategori seçiliyse `special_ad_category_country` (ISO-2 dizisi) ayarlanmalı. Konut/istihdam/finansta verilmezse **vergi ülkesine düşüyor** (sessiz varsayılan); siyasette kullanıcı ve sayfanın yetkili olduğu ülke olmalı. Alan adı belgede üç farklı yazımla geçiyor (`special_ad_category_country`, `special_ads_category_country`, `special_ad_category_countries`); eski örneklerde tekil `special_ad_category` — belge tutarsız.
- **Konut/istihdam/finans kısıtları (ABD merkezli ya da ABD/Kanada/Avrupa'ya ulaşan):**
  - Yaş sabit 18–65+ (Avrupa'da kredi reklamı istisna).
  - Cinsiyet seçilemez (önerilen: `genders` hiç gönderme).
  - Konum hariç tutma yok. Şehir/adres/iğne çevresinde en az 15 mil / 25 km (ABD, Kanada), 15 km (Avrupa).
  - Desteklenmeyen konum türleri: `subcity`, `neighborhood`, `metro_area`, `small_geo_area`, `subneighborhood`, `electoral_district`, `zips`.
  - Davranış ve demografi hedeflemesi yok, ilgi/ayrıntılı hedefleme hariç tutma yok; ilgiler önceden onaylı listeden.
  - Benzer kitle ve kayıtlı kitle yok; benzer kitle hariç tutma yok; teklif çarpanı yok.
  - Desteklenen: özel kitle dahil/hariç, özel kitle genişletme, Advantage+ kitle, ayrıntılı hedefleme genişletme.
  - Bu üç kategoride kısıt ihlali **sert hata** (`2909035` ailesi; `2859024` = ayrımcılık karşıtı politika işletme yöneticisince onaylanmamış).
- **ABD/Kanada/Avrupa dışı işletme ve kitle:** alanı yine göndermek zorunda ama kısıtlara "katılıp katılmamayı" seçebiliyor. Türkiye'nin "Avrupa" kapsamı BELGEDE TANIMLI DEĞİL.
- `tune_for_category=EMPLOYMENT` (ad set'e POST): mevcut hedeflemeyi kategoriye uyumlu hâle kendiliğinden getiriyor — kayıtlı kitle ve benzer kitleyi siliyor, yaşı/cinsiyeti genişletiyor, yarıçapı minimuma çıkarıyor (hedefleme sessizce değişiyor).
- **Siyasi kategori:** reklam düzeyinde `authorization_category` (`POLITICAL`, dijital olarak üretilmiş/değiştirilmiş medya için `POLITICAL_WITH_DIGITALLY_CREATED_MEDIA`). Siyasi ve siyasi olmayan reklam aynı kampanyada karıştırılamaz. **6 Ekim 2025'ten beri AB'de siyasi/seçim/toplumsal mesele reklamı yayınlanmıyor.** Siyasi kategori kitle seçeneklerini kısıtlamıyor.
- Özel kitlenin özel kategori kampanyasına uygunluğu: `GET /{custom_audience_id}?fields=is_eligible_for_sac_campaigns&ad_account_id=…&special_ad_categories=…&special_ad_category_countries=…`.
- Yanlış kategori bildirilirse Meta (insan + makine) reklamları kampanya düzeltilene kadar durdurabiliyor. Teslim edilemeyen nesne `effective_status: WITH_ISSUES` + `issues_info`.

### 8. Hedefleme kısıtları ve kullanımdan kalkan terimler

- Sınır tablosu: yaş 13–65; dil 90 (50 önerilen); ilgi sınırsız (100 önerilen); okul/işyeri/bölüm 200 (100 önerilen); şehir 250; bölge 200; `custom_locations` 200; `geo_markets` 210; bağlantı 50; mezuniyet yılı ≥1980; posta kodu 50.000.
- Özel kitle: `custom_audiences` ≤ **500**, `excluded_custom_audiences` ≤ **500**.
- **Kullanımdan kalkan terim yaşam döngüsü** (`/search?type=targetingoptionstatus&targeting_option_list=[…]`): `NORMAL` · `DEPRECATING` (ad set yayına devam eder ama yeni ad set'te kullanılamaz, **terimi içeren ad set GÜNCELLENİRSE REDDEDİLİR**) · `NON-DELIVERABLE` · `NON-DELIVERABLE-IN-EXCLUSION` · `UNKNOWN`; `future_plan` tarih→durum haritası.
- Etkilenen ad set'ler: `GET act_X/deprecatedtargetingadsets?type=deprecating|delivery_paused`; ya da `adsets?filtering=[{field:"adset.targeting_state", operator:"IN", value:[…]}]` (`normal`, `deprecating`, `delivery_affected`, `delivery_paused`). `delivery_paused` = Meta ad set'i durdurmuş.

### 9. Erişim ve sonuç tahmini

- `GET act_X/reachestimate` (`targeting_spec`, `optimize_for`) → kişi aralığı.
- `GET act_X/delivery_estimate` ve `GET {adset}/delivery_estimate` (ad set düzeyinde parametresiz → ad set'in ayarları) → tahmini teklif, `estimate_dau`, `estimate_mau`, `daily_outcomes_curve` (harcama → erişim/gösterim/sonuç). Aşamalı açılıyor; her hesapta olmayabilir. **Teklif tahmini hesap geçmişine göre değişiyor** — aynı hedefleme iki hesapta farklı.
- Yeni (konumsuz) benzer kitle ilk kullanımında `users: -1`, `estimate_dau/mau: -1` ve `targeting_status`: `lookalike_container_without_country`, `lookalike_container_without_delivery_lookalike`, `none`. **−1 "sıfır kişi" değil, "henüz bilinmiyor".**
- `targetingsentencelines`: `GET {ad_id}/targetingsentencelines` ya da `GET act_X/targetingsentencelines?targeting_spec=…` → "Location - Living In: …", "Age: …" satırları. Yalnız etkin yerleşimleri dikkate alıyor.

### 10. Özel kitleler

**Genel:**
- İzin: `ads_management`. **Özel Kitle Hizmet Şartları** imzalı olmalı (aşağıya bkz.).
- Hesap başına sınır: müşteri listesi 500, web sitesi 10.000, mobil uygulama 200, benzer kitle 500, etkileşim 500.
- Listeleme: "en iyi uygulama `limit=20` + sayfalama"; büyük limit `code 1` *"Please reduce the amount of data you're asking for"* veriyor.
- `delivery_status.code`: `200` kullanıma hazır · `300` olması gerekenden küçük, kullanılamaz · `400+` kullanılamaz (politika dahil).
- `operation_status.code`: 0, 100 (süresi doluyor), 200 normal, 400 uyarı, 410 dosya yok, 411 düşük eşleşme, 412 geçersiz girdi oranı yüksek, 414 değiştirme sürüyor, 415 değiştirme başarısız, 421/422/423 piksel yok/çalışmıyor/geçersiz, 431–434 benzer kitle yenileme/oluşturma hataları, 441 dolduruluyor, 442 ön doldurma yapılamadı, 450 güncel değil, 470 oluşturan hesap pasif, **471 bütünlük nedeniyle işaretli**, 500 hata.
- **2 Eylül 2025'ten beri bütünlük işareti (471):** sağlık durumu ya da finansal durum çağrıştıran kitle (ad, açıklama ya da kural — `fields_violating_integrity_policy`) yeni kampanyada kullanılamıyor; kullanan ad set `WITH_ISSUES`; düzenleme yalnız işaretli alanlar değiştirilerek yapılabiliyor (`1713231`); müşteri listesi ve benzer kitle hiç düzenlenemiyor (`1713228`); üye ekleme/çıkarma engelli (`1713230`); bu kitleden benzer kitle oluşturulamıyor (`1713232`).
- **Süre dolumu:** 2 yıl hiçbir aktif ad set'te kullanılmayan özel/benzer/kayıtlı kitle `EXPIRING` (`operation_status 100`) olur, `delete_time` = işaretlemeden 90 gün sonra. Aktif bir ad set'te kullanmak silinmeyi engeller. Müşteri listelerinde "kullanmamak" silme talimatı sayılıyor.
- **Silme:** `DELETE /{id}` → kalıcı; kullanan reklamlar durur ve **yeniden başlatılamaz**. Bağlı benzer kitle varsa `2656` ile reddedilir. Web sitesi kitlesi silinince aktif kampanya `Pause` oluyor.
- Oluşturma ucu: `POST act_X/customaudiences`. Güncelleme: `POST /{id}` (`name`, `description`, `opt_out_link`, `rule`, `rule_aggregation`, `retention_days`, `lookalike_spec`, `customer_file_source`, `enable_fetch_or_create` — aynı ad/kurala sahip kitle varsa yenisini açmak yerine onu döndürür, `use_in_campaigns`, `use_for_products: [ADS, MARKETING_MESSAGES]` …).
- `IG_BUSINESS`, `FB_EVENT`, `EXPERIMENTAL`, `MULTI_DATA` alt türleri yalnız Ads Manager'dan oluşturulabiliyor.
- Eylül 2018'den beri web sitesi, uygulama, etkileşim ve çevrimdışı kitlelerde `subtype` desteklenmiyor (video etkileşimi hariç).

**Müşteri listesi (customer file):**
- 1) `POST act_X/customaudiences` `subtype=CUSTOM`, `customer_file_source` (`USER_PROVIDED_ONLY`, `PARTNER_PROVIDED_ONLY`, `BOTH_USER_AND_PARTNER_PROVIDED`), isteğe bağlı `audience_labels` (`QUALIFIED_LEADS`, `DISQUALIFIED_LEADS`, `APP_USERS`, `TRIAL_USERS`, `ENGAGED_USERS`, `HIGH_VALUE_CUSTOMERS`, `LOW_VALUE_CUSTOMERS`, `AT_RISK`, `DISENGAGED`, `CUSTOMERS`).
- 2) `POST /{id}/users` — istek başına **en çok 10.000** kayıt; `session` (`session_id` hesapta tekil 64-bit, `batch_seq` 1'den sıralı, `last_batch_flag`, `estimated_num_total`) ve `payload` (`schema`, `data`). Son parti işaretlenmezse oturum ilk partiden **90 dk** sonra kapanıyor, sonrası atılıyor. Değişiklikler **24 saate kadar** sürebiliyor.
- Anahtarlar: `EMAIL`, `PHONE`, `GEN`, `DOBY`, `DOBM`, `DOBD`, `LN`, `FN`, `FI`, `CT`, `ST`, `ZIP`, `COUNTRY`, `MADID`, `EXTERN_ID`, `PAGEUID` (+`page_ids`), `LOOKALIKE_VALUE`. Kişisel veri **SHA-256, küçük harf hex**; normalizasyon: e-posta kırp + küçük harf; telefon sembol/harf/baştaki sıfır temizlenmiş, ülke kodu önekli; ad/soyad küçük harf a–z (yalnız FN/LN özel karakter destekliyor, Latin karşılığı önerilir); şehir boşluksuz; ülke ISO-2 küçük harf. `MADID` ve `EXTERN_ID` hash'lenmez.
- `EXTERN_ID` saklama süresi 90 gün ve **reklam hesabına özel** (aynı işletmenin başka hesabında kullanılamaz).
- Yanıt: `num_received`, `num_invalid_entries` (yaklaşık), `invalid_entry_samples` (≤100). **Hatalı hash'li satırlar hata vermeden eşleşmiyor.**
- Silme: `DELETE /{id}/users` (aynı payload). **`DELETE act_X/usersofanyaudience` kişiyi hesabın BÜTÜN müşteri listesi kitlelerinden çıkarıyor** (opt-out için).
- **`POST /{id}/usersreplace`**: üyeleri tek oturumda tamamen değiştirir; aktif ad set'in **öğrenme aşamasını sıfırlamıyor** (`/users` POST/DELETE sıfırlıyor). Koşullar: <100 milyon kişi, `subtype=CUSTOM`, değer bazlı ↔ normal arası değiştirilemez, `operation_status` normal olmalı, aynı anda tek değiştirme, oturumda şema sabit. Durum `replace_in_progress` / `replace_error`. Hatalar `code 2650`: 1870145 güncelleme sürüyor, **1870158 oturum 90 dk'yı aştı → kitle o ana kadar yüklenenle DEĞİŞTİRİLİR**, 1870147 ilk `batch_seq` 1 değil, 1870159 oturum bitti, 1870148 "bir şeyler ters gitti", 1870144 ≥100M.
- Sınırlı Veri Kullanımı (LDU, Kaliforniya): `DATA_PROCESSING_OPTIONS` (+`_COUNTRY`, `_STATE`) şemaya; kitle başına ayrı uygulanır.
- `retention_days` (müşteri listesi): 1–180, **verilmezse süresiz**.

**Web sitesi (piksel):** `POST act_X/customaudiences` `name`, `rule` (zorunlu), `retention_days` (1–180; verilmezse kuraldaki `retention_seconds`), `prefill` (varsayılan `true` = oluşturmadan önceki trafik dahil, en çok 180 gün). SSS "en uzun 365 gün" diyor, kural sözdizimi de `retention_seconds` için 365 gün — 180/365 ÇELİŞKİSİ. Conversions API olayları da web sitesi kitlesine girer; CAPI `external_id` ile müşteri listesi `EXTERN_ID` eşlemeleri birbirinin yerine kullanılamaz. Kitle küçükken hedeflenemez. Kumar siteleri yönetilen listede onaylı olmalı ve yaş kısıtı (21+) şart.

**Kitle kuralları (audience rules):** `{inclusions, exclusions}` → her biri `{operator: and|or, rules:[…]}` → kural `{event_sources:[{id,type}], retention_seconds, filter, aggregation}`. Kural başına ≤**10** kural, kural başına ≤**100** filtre. Filtre operatörleri: `=`/`eq`, `!=`/`neq`, `>`/`gt`, `>=`, `<`, `<=`, `i_contains`, `i_not_contains`, `contains`, `not_contains`, `is_any`, `is_not_any`, `i_is_any`, `i_is_not_any`, `starts_with`, `i_starts_with`, `regex_match` (PCRE). `field = event` ise operatör `=` olmalı. Veri alanları: `url`, `domain`, `path`, `event`, `device_type`, herhangi bir `customData` alanı. Toplama: `count`, `sum`, `avg`, `min`, `max`, `time_spent`, `last_event_time_field` (web), `method: absolute|percentile` (yüzdelikte `in_range`/`not_in_range`). **`retention_seconds` veya `aggregation` düzenlenince kitle boşaltılmıyor** — eski kurala uyanlar süreleri dolana kadar kalıyor. Belge `exclusions`'ı "zorunlu" yazıyor ama örneklerin çoğu göndermiyor.

**Etkileşim kitleleri:** `event_sources.type`: `page`, `lead`, `ig_lead_generation`, `canvas`, `ig_business`, `shopping_page`, `shopping_ig`, `ar_experience`, `ar_effects`. Sayfa olayları: `page_engaged` (en kapsayıcı), `page_visited`, `page_liked` (saklama süresi **0** ve başka sayfa olaylarıyla birleşemez), `page_messaged`, `page_cta_clicked`, `page_or_post_save`, `page_post_interaction`. Form: `lead_generation_submitted`, `_dropoff`, `_opened`. IG: `ig_business_profile_all`, `_engaged`, `ig_user_messaged_business`, `ig_business_profile_visit`, `ig_business_profile_ad_saved`, `ig_ad_*`, `ig_organic_*`. Alışveriş: `VIEW_CONTENT` (global), `ADD_TO_CART`/`PURCHASE` (yalnız ABD). En uzun saklama: form 90 gün, IG ve sayfa 730, Instant Experience 730, alışveriş ve AR 365. Mesajlaşma olayları Avrupa'da mevcut olmayabilir. Birden çok kural/sayfa = VEYA.

**Mobil uygulama:** `event_sources.type = app`; `retention_days` 1–180 (son eşleşen olaydan itibaren yenilenir); olay adları "wire name" (`fb_mobile_purchase`, `fb_mobile_add_to_cart` …); `GET {app_id}/app_event_types`. iOS 14.5+ SKAdNetwork kampanyalarında dahil etme hedeflemesi olarak kullanılamıyor. Hizmet şartları için kullanıcı reklam hesabında yönetici/geliştirici/insights rolünde olmalı ve hesap uygulamada reklam hesabı olarak tanımlı olmalı.

**Çevrimdışı:** `event_sources.type = offline_events` (çevrimdışı olay seti). Aynı kural sözdizimi; `custom_data.*` alanlarıyla süzme.

**Dinamik ürün kitleleri (Advantage+ katalog):** `POST act_X/product_audiences` — `name`, `product_set_id`, `inclusions` (her biri TEK olay; `retention_seconds` + `rule`), isteğe bağlı `exclusions`. Kural `event` + `eq` içermeli; aynı olay hem dahil hem hariçte ise ek parametreler birebir aynı olmalı. Hariç tutma ürün GRUBU düzeyinde işliyor (`item_group_id`). Piksel olayları `Search`, `ViewCategory`, `ViewContent`, `AddToCart`, `Purchase` + `content_ids`/`contents` + `content_type` (`product`|`product_group`; verilmezse aynı kimlikli her öğeyle eşleşiyor). Uygulama olayları için katalog–kaynak bağı `POST {catalog}/external_event_sources`.

### 11. Benzer kitleler (lookalike)

- `POST act_X/customaudiences` `subtype=LOOKALIKE`, `origin_audience_id`, `lookalike_spec`.
- Kaynak (seed): özel kitle (en az **100** kişi), kampanya/ad set dönüşümleri (`origin_ids`, `conversion_type: campaign_conversions`, ≥100 tekil dönüşüm, 200+ önerilir, 180 güne kadar veri), sayfa beğenenleri (`page_id`, `conversion_type: page_like`).
- `lookalike_spec`: `type` (`similarity` = %1, `reach` = %5) **ya da** `ratio` (0,01–0,20, 0,01 adımlı), `starting_ratio` (< `ratio`; ör. %3–%5 dilimi), `country` **ya da** `location_spec` (`geo_locations.countries/country_groups`, `excluded_geo_locations`), `allow_international_seeds` (varsayılan `false`).
- Doldurma 1–6 saat; dolarken de ad set'te kullanılabiliyor. Ad set'te kullanılıyorsa 3 günde bir yenileniyor. `delivery_status.code 200` = hazır.
- 90 gün aktif reklamda kullanılmayan benzer kitle "inaktif": `approximate_count` ve `delivery_estimate` **−1**, `operation_status 450`. Yine de kampanyada kullanılabilir.
- Kaynağın cinsiyet/coğrafya gibi nitelikleri benzer kitleye taşınmayabilir (belge açıkça söylüyor).
- 2021'den beri "ertelenmiş" bir değişiklik: `country`/`location_spec` kaldırılıp konum ad set'ten alınacak, yeni benzer kitlelerde `approximate_count = -1`. Belge hâlâ "erteledik, haber vereceğiz" diyor — mevcut durum BELGEDE BELİRSİZ.
- Özel kategori (konut/istihdam/finans) kampanyalarında benzer kitle YOK.
- **Değer bazlı:** kaynak kitle `is_value_based=1` + `LOOKALIKE_VALUE` (negatif olmayan sayı) şemasıyla doldurulur, ≥100 kişi, benzer kitle `type: custom_ratio`. Her reklam hesabı için ayrı değer bazlı hizmet şartı.
- Paylaşılan (başka hesaptan gelen) kitle kaynak olarak kullanılamaz, değiştirilemez.

### 12. Özel Kitle Hizmet Şartları (ToS)

- **Kullanıcı × işletme** başına kabul ediliyor; sistem kullanıcısı kendisi imzalayamıyor — sistem dışı bir kullanıcının o işletmenin bir reklam hesabı içinden kabul etmesi gerekiyor.
- Kabulün KİMİN adına sayıldığı reklam hesabının durumuna bağlı:
  - İşletmenin kendi hesabı → o işletme.
  - Başka işletme **adına hareket eden** (on-behalf-of) hesap → adına hareket edilen işletme.
  - Başka işletmeyle **paylaşılmış** hesap → **hesabın SAHİBİ işletme**. Paylaşılan işletme kendi adına kabul için kendi hesabına geçmeli.
- Kontrol: `GET act_X?fields=tos_accepted` → `{custom_audience_tos: 1}` (paylaşılmış/OBO olmayan bir hesapta güvenilir); kullanıcı için `user_tos_accepted`. İmzasızsa müşteri listesi oluşturma/düzenleme ve özel kitle içeren hedefleme/kayıtlı kitle değişikliği hata veriyor (`200 / 1870090`). Kabul bağlantısı `https://business.facebook.com/ads/manage/customaudiences/tos/?act=<ID>`.

### 13. Kitle paylaşımı (custom-audience kenarları)

- `POST /{ca}/ad_accounts` — `adaccounts`, `permissions` (`targeting` | `targeting_and_insights`; GET kenarı belgesine göre varsayılan `targeting_and_insights`), `relationship_type`, `replace` (`true` → mevcut paylaşım listesinin YERİNE geçer). Yanıt `sharing_data[].audience_share_status`, `errors`. Paylaşım için sahip ve alıcı hesapları işletmece sahiplenmiş olmalı.
- `DELETE /{ca}/ad_accounts` — paylaşımı kaldırır; **alıcı hesapta bu kitleyi kullanan reklamlar durur, yeniden başlatılamaz.**
- `GET /{ca}/adaccounts` (paylaşılan hesaplar, `permissions` süzgeci), `GET /{ca}/ads` (kitleyi kullanan reklamlar, `effective_status` süzgeci), `GET /{ca}/sessions` (yükleme oturumları), `GET /{ca}/shared_account_info` (`SHARED`, `IN_PROGRESS`, `NOT_SHARED`; yalnız işletme dışı paylaşımda dolu, diğerlerinde `null`), `GET /{ca}/shared_account_campaign_info`, `GET /{ca}/capabilities`, `GET /{ca}/health` (Audience API ile paylaşılan toplu kullanıcı değeri verisi; `calculated_date`, `processed_date`, `value_currency`, `value_country`…). Son üçünün alanları belgede tanımsız/boş.
- `ad_accounts` sayfasının başında konuyla ilgisiz "işaretli özel dönüşüm" uyarısı var (`is_unavailable: true`; yayınlanan kampanyada özel dönüşüm değiştirilemez) — belge kopya hatası ama bilgi kendi başına doğru görünüyor.
- Hız sınırı: `80003` (özel kitle), `80004` (reklam yönetimi), `613`.

## Marka güvenliği ve uygunluğu

### Ad set hedeflemesindeki kontroller (Advetics'in doğrudan kullanabileceği)

- **Envanter filtresi** `targeting.brand_safety_content_filter_levels` (dizi): akış içi (FB in-stream + FB Reels reklamları) `FACEBOOK_RELAXED` / `FACEBOOK_STANDARD` / `FACEBOOK_STRICT`; Audience Network `AN_RELAXED` / `AN_STANDARD` / `AN_STRICT`; akış (FB/IG Feed, FB/IG Reels Feed) `FEED_RELAXED` / `FEED_STANDARD` / `FEED_STRICT`. Karşılıkları Genişletilmiş / Orta / Sınırlı. **Gönderilmezse varsayılanın ne olduğu BELGEDE YOK.**
- Hesap düzeyinde bir filtre varsa kampanyada yalnız daha kısıtlayıcı seçenekler seçilebiliyor. Gerçekte uygulanan seviye salt okunur `effective_brand_safety_content_filter_levels` (hesap + kampanya ayarlarının en tutucu birleşimi). Hesap ayarı `GET act_X?fields=brand_safety_content_filter_levels`.
- `excluded_publisher_categories`: `dating`, `gambling`; Audience Network ve akış içi video için ayrıca `debated_social_issues`, `mature_audiences`, `tragedy_and_conflict`.
- `excluded_publisher_list_ids`: yayıncı blok listesi kimlikleri.

### Yayıncı blok listeleri (Publisher Block Lists API)

- Uygulama izni: `block_list_management_v2_api_access` **capability grant**; durum sorgusu için uygulamada `ads_read`, `ads_management` ve Marketing API Access Tier.
- Akış: dosyadan taslak `POST {business}/block_list_drafts` (`publisher_urls_file`) → `async_job_status` (`scheduled|running|success|failed`) ve `async_percent_completion` izlenir → `POST {business}/publisher_block_lists` (`draft_id`, `name`; güncellemede `block_list_id`).
- Okuma `GET {block_list}?fields=…,items_count,web_publishers,app_publishers`; silmeden önce bütün işletmelerden paylaşım kaldırılmalı.
- Paylaşım `POST {block_list}/agencies` (`agency_id`, `permitted_roles`: `APPLY_BLOCK_LIST` | `MANAGE_BLOCK_LIST`). `MANAGE` içeriği değiştirebiliyor ve **değişiklik aynı listeyi kullanan bütün işletmelere yansıyor**.
- Doğrudan hesaba uygulama (View Performance yeterli): `POST {block_list}/auto_applied_ad_accounts` `account_id`, `business_id`, `is_auto_blocking_on=true|false`. Bu kenar yalnız BU yolla uygulanan hesapları listeliyor.
- Sınırlar: liste başına 10.000 URL, işletme başına 200 liste. **Aynı adla yüklenen liste öncekinin YERİNE geçiyor** (sessiz üzerine yazma). Yerleşime göre engellenebilecek yayıncı eşikleri (ör. FB in-stream ve Reels: işletme/hesap 200.000, kampanya 1.000; AN native/banner: 20.750/20.750/12.500; AN ödüllü video: 11.350/11.350/3.400).
- Hata: `80011` marka güvenliği API'leri hız sınırı; `2349019` geçersiz platform-yerleşim birleşimi; tarih aralığı hataları `2349020–2349025`.

### İçerik blok listeleri (Content Block Lists API)

- `brand_safety_content_block_list` capability grant. Belirli FB/IG/Threads gönderilerinin yanında görünmeyi engeller.
- `POST {business}/content_block_lists` (`name`), `GET` liste/metaveri, `POST` yeniden adlandır, `DELETE` (önce hiçbir hesaba uygulanmamış olmalı); içerik `POST/DELETE {list}/content` (`facebook_ids`, `instagram_ids`, `threads_ids`, çağrı başına ≤50.000; paylaşım/ek/çapraz gönderi kök gönderiye normalize edilir); `GET {list}/facebook_content|instagram_content|threads_content`; hesaba uygula/kaldır `POST/DELETE {list}/applied_ad_accounts` (`account_id`; okuma izni yeterli).
- Dosyayla toplu `replace`: `api.facebook.com/content_block_lists/{id}/file_upload` (≤100 MB, ≤2 milyon kimlik; iş durumu `queued|processing|failed|completed`), indirme `PUT …/file_download`.
- "Hesaba uygulanan listeleri getir" ve "içerik listede mi" uçları **planlanmış, henüz yok**.
- Sınırlar: işletme/3P başına 200 liste, liste başına 2M gönderi, hesap başına 75 uygulanmış liste, saatte 480K çağrı.

### Raporlama ve doğrulama (iş ortağı programı)

- **İçerik teslim raporu:** `GET {adset}/content_delivery_report?platform=facebook&position=instream_video|facebook_reels_overlay&datetime=…` → `content_id`, `creator_id`, `estimated_impressions`; saatlik, geriye 15 gün, yalnız herkese açık içerik; tarih **Pasifik saati**. Önce `content_delivery_report_date_ranges`. Capability `brand_safety_third_party_partners`; hesapta View Performance.
- **Yayıncı teslim raporu:** `GET {adset}/publisher_delivery_report` (`platform`: `audience_network|facebook|instagram`; `position`: `instream_video|facebook_reels_overlay|an_classic|rewarded_video`; `start_date`/`end_date` verilmezse son 29 gün; `sort_by`, `name_contains`, `publisher_status`) → `url`, `name`, `estimated_impressions`, `content_types`, `status`. In-stream/reels'te en çok iki ayrık tarih aralığı.
- **Feed doğrulama (komşu içerik):** `adjacent_content_delivery_report_date_ranges` (`missing_datetimes` döner) ve `api.facebook.com/adjacent_content_delivery_reports/{business}/file_download` → gösterim başına üstteki/alttaki gönderi kimliği, sahibi, dili (Türkçe destekli), gizliliği; GZIP JSONL parçaları; ~9 saat gecikme, 15 gün geriye; saat dilimi reklam hesabının. Capability `brand_safety_feed_verification`.
- **Partner-publisher listesi:** `GET /brand_safety_publisher_list?platform=…&position=…` (2 Eylül 2025'ten beri in-stream ve reels-overlay aynı birleşik listeyi döndürüyor), `GET /brand_safety_publisher_list_metadata`; saatte 2,4K çağrı.
- **Passback:** iş ortağının Meta'ya içerik risk etiketi (`POST /content_risk_labels`, ad set'e `POST {adset}/content_risk_labels`; GARM kategorisi + `risk_level: floor|high|medium|low|no`) ve uygunluk skoru (`POST /suitability_scores`, `act_X/…`, `{adset}/…`) göndermesi.
- **Kurulum:** iş ortağı işletmesi + doğrulanmış işletme + uygulama incelemesi; müşteri reklam hesabını "Assign Partner" ile View Performance olarak paylaşır. Marketing API erişim kademesi adları değişti: Standard → **Limited**, Advanced → **Full**; Full eşiği son 15 günde **500** çağrı.

## API çağrıları

```http
# Konum anahtarı (il)
GET /v25.0/search?type=adgeolocation&location_types=["region"]&country_code=TR&q=İzmir&limit=25
# Bir ilin şehirleri
GET /v25.0/search?type=adgeolocation&location_types=["city"]&region_id=<İL_KEY>&q=Kar
# Anahtardan metaveri doğrulama
GET /v25.0/search?type=adgeolocationmeta&regions=[<KEY>]&cities=[<KEY>]
# Yarıçap önerisi
GET /v25.0/search?type=adradiussuggestion&latitude=…&longitude=…&distance_unit=kilometer
# İlgi alanı / öneri / doğrulama
GET /v25.0/search?type=adinterest&q=golf&limit=25
GET /v25.0/search?type=adinterestsuggestion&interest_list=["Golf"]
GET /v25.0/search?type=adinterestvalid&interest_fbid_list=[6003…]
# Kategori taraması (q yok sayılır)
GET /v25.0/search?type=adTargetingCategory&class=behaviors|interests|life_events|industries|income|family_statuses|user_device|user_os
# Dil
GET /v25.0/search?type=adlocale&q=tr
# Terim durumu
GET /v25.0/search?type=targetingoptionstatus&targeting_option_list=[<ID>,…]
# Hesap düzeyinde ayrıntılı hedefleme
GET /v25.0/act_X/targetingsearch?q=…&limit_type=interests&locale=tr_TR
GET /v25.0/act_X/targetingsuggestions?targeting_list=[{"type":"interests","id":…}]
GET /v25.0/act_X/targetingvalidation?targeting_list=[…]
GET /v25.0/act_X/targetingbrowse
```

```http
# Ad set — doğrudan konum, Advantage+ kitle kapalı, genişletmeler açıkça kapalı
POST /v25.0/act_X/adsets
targeting={
  "geo_locations": {"regions": [{"key":"<İZMİR>"}]},
  "age_min": 25, "age_max": 45, "genders": [2],
  "flexible_spec": [{"interests": [{"id":"6003…","name":"Golf"}]}],
  "custom_audiences": [{"id":"<CA>"}],
  "excluded_custom_audiences": [{"id":"<MÜŞTERİLER>"}],
  "targeting_automation": {"advantage_audience": 0},
  "targeting_relaxation_types": {"custom_audience": 0, "lookalike": 0},   // yalnız destekleyen amaçta
  "targeting_optimization": "none",                                        // yalnız destekleyen amaçta
  "brand_safety_content_filter_levels": ["FEED_STANDARD","FACEBOOK_STANDARD"]
}

# Advantage+ kitle açık (yaş öneri)
targeting={"geo_locations":{"countries":["TR"]},"age_min":18,"age_range":[25,35],
           "targeting_automation":{"advantage_audience":1}}

# Gerçek yerleşim ve hedefleme geri okuma
GET /v25.0/<ADSET>?fields=targeting{effective_publisher_platforms,effective_facebook_positions,effective_instagram_positions,effective_device_platforms,targeting_automation,targeting_relaxation_types,targeting_optimization,effective_brand_safety_content_filter_levels},recommendations
GET /v25.0/ad_campaign_placement?account_id=…&billing_event=IMPRESSIONS&buying_type=AUCTION&objective=…&optimization_goal=…
GET /v25.0/<ADSET>?fields=placement_soft_opt_out

# İnsan diliyle hedefleme / tahmin
GET /v25.0/act_X/targetingsentencelines?targeting_spec={…}
GET /v25.0/act_X/reachestimate?targeting_spec={…}&optimize_for=IMPRESSIONS
GET /v25.0/act_X/delivery_estimate?targeting_spec={…}&optimization_goal=…
GET /v25.0/<ADSET>/delivery_estimate

# Kullanımdan kalkan terimlerden etkilenen ad set'ler
GET /v25.0/act_X/deprecatedtargetingadsets?type=delivery_paused
GET /v25.0/act_X/adsets?filtering=[{"field":"adset.targeting_state","operator":"IN","value":["deprecating","delivery_paused"]}]
```

```http
# Özel reklam kategorisi (kampanya)
POST /v25.0/act_X/campaigns  special_ad_categories=["NONE"]   (ya da [])
POST /v25.0/act_X/campaigns  special_ad_categories=["EMPLOYMENT"]&special_ad_category_country=["TR"]
POST /v25.0/<ADSET>  tune_for_category=EMPLOYMENT
GET  /v25.0/<CA>?fields=is_eligible_for_sac_campaigns&ad_account_id=…&special_ad_categories=HOUSING&special_ad_category_countries=TR
```

```http
# Özel kitle — müşteri listesi
POST /v25.0/act_X/customaudiences  name, subtype=CUSTOM, customer_file_source=USER_PROVIDED_ONLY
POST /v25.0/<CA>/users  session={"session_id":…,"batch_seq":1,"last_batch_flag":false}, payload={"schema":["EMAIL","PHONE"],"data":[["<sha>","<sha>"],…]}   # ≤10.000/istek
POST /v25.0/<CA>/usersreplace  (aynı gövde; öğrenmeyi sıfırlamaz)
DELETE /v25.0/<CA>/users  payload={…}
DELETE /v25.0/act_X/usersofanyaudience  payload={…}   # hesaptaki BÜTÜN müşteri listelerinden çıkarır

# Web sitesi / etkileşim / uygulama / çevrimdışı — kural tabanlı
POST /v25.0/act_X/customaudiences  name, retention_days, prefill, rule={"inclusions":{"operator":"or","rules":[{"event_sources":[{"id":"<PIXEL|PAGE|IG|APP|OFFLINE_SET>","type":"pixel|page|ig_business|app|offline_events"}],"retention_seconds":2592000,"filter":{"operator":"and","filters":[{"field":"event","operator":"eq","value":"page_engaged"}]}}]}}

# Benzer kitle
POST /v25.0/act_X/customaudiences  name, subtype=LOOKALIKE, origin_audience_id=<CA>, lookalike_spec={"ratio":0.01,"country":"TR"}
GET  /v25.0/<LAL>?fields=delivery_status,operation_status,approximate_count_lower_bound,approximate_count_upper_bound

# Ürün kitlesi
POST /v25.0/act_X/product_audiences  name, product_set_id, inclusions=[{"retention_seconds":604800,"rule":{"event":{"eq":"ViewContent"}}}], exclusions=[{"retention_seconds":604800,"rule":{"event":{"eq":"Purchase"}}}]

# Okuma / süzme / silme / paylaşım
GET /v25.0/act_X/customaudiences?fields=id,name,subtype,delivery_status,operation_status,delete_time,approximate_count_lower_bound&limit=20
GET /v25.0/act_X/customaudiences?filtering=[{"field":"operation_status.code","operator":"IN","value":[100,471]}]
GET /v25.0/act_X?fields=tos_accepted   |   ?fields=user_tos_accepted
DELETE /v25.0/<CA>
POST /v25.0/<CA>/ad_accounts  adaccounts=[…], permissions=targeting
```

## Tuzaklar ve sessiz hata riskleri

1. **Kova birleşimi:** `countries` + `regions`/`cities` aynı `geo_locations`'ta = en geniş olan kazanır. Aynı ilin kendisi + ilçesi = bütün il. Hata yok.
2. **Advantage+ kitle sessizce açık:** v23+ yeni ad set'te "varsayılan" hedefleme (18–65, herkes, özel kitle yok) ve bayrak yazılmamış → `advantage_audience = 1`. Açıkken yaş/cinsiyet/ilgi/özel kitle dahil etme yalnız öneri.
3. **Advantage custom audience / lookalike varsayılan açık:** desteklenen amaçlarda `targeting_relaxation_types` yazılmazsa seçilen özel/benzer kitlenin dışına çıkılıyor. Desteklenmeyen amaçta yazmak HATA → amaç tablosu olmadan körlemesine yazılamaz.
4. **Ayrıntılı hedefleme zorunlu genişlemesi:** bağlantı tıklaması, açılış sayfası görüntüleme, konuşmalar, dönüşümler vb. 21 hedefte ilgi alanları ve benzer kitleler `targeting_optimization_types` ile zorla genişletiliyor; `targeting_optimization: none` göndermenin bunu kapatıp kapatmadığı BELGEDE ÇELİŞKİLİ.
5. **Yaş önerisi / cinsiyet önerisi** (`individual_setting.age/gender = 1`) açıkken reklam seçilen aralığın dışına gidiyor; arayüzde "25–35" yazıp 40 yaşına harcama.
6. **`individual_setting.geo`** varsayılanı bilinmiyor; açıksa "İzmir" seçimi İzmir'e ilgi duyan başka şehirdeki kişilere de gider.
7. **`custom_locations.distance_unit` varsayılanı mil.** Birim yazılmazsa km sanılan yarıçap 1,6 katına çıkar.
8. **`location_types` varsayılanı `home + recent`:** "yaşayan" değil "yaşayan ya da yakın zamanda orada bulunan". Turistik bölgede hedefleme turistleri de içerir; bunu daraltmanın belgeli yolu yok (tek seçenek bu ikili).
9. **Özel kitle tek başına + konumsuz hedefleme ülke sınırsız.**
10. **Yerleşim alanı boş = gelecekteki yerleşimler dahil**; WhatsApp Durum dahilse **yaşı bilinmeyenler varsayılan dahil** (Mayıs 2026) — yaş sınırı olan sektörlerde (alkol, kumar, finans) sessiz uyumsuzluk.
11. **Amaçla uyumsuz yerleşim** kabul edilip teslim edilmiyor; yalnız `effective_*` ve `recommendations` gösteriyor.
12. **Uygulama yükleme amacında `age_min`** uygulamanın yaş ayarıyla sessizce yükseltiliyor.
13. **`/search` varsayılan limiti 8**; demografi taraması token sahibinin ülkesine göre değişiyor; ilgi araması bütün ilgileri döndürmüyor; ilgi adları değişebiliyor.
14. **Kullanımdan kalkan terim:** `DEPRECATING` terimli ad set yayına devam ediyor ama BAŞKA BİR ALAN için yapılan güncelleme (ör. bütçe artırma) bile reddediliyor; `delivery_paused`'ta Meta ad set'i durduruyor. Kural motoru/AI düzenlemeleri "anlamsız" hatayla düşebilir.
15. **Özel kitle hash/normalizasyon hatası** hata vermeden eşleşmeme; `num_invalid_entries` yaklaşık sayı.
16. **`usersreplace` 90 dk zaman aşımı:** kitle o ana kadar yüklenen kısmi listeyle DEĞİŞTİRİLİYOR.
17. **`usersofanyaudience` DELETE** kişiyi hesaptaki bütün müşteri listelerinden çıkarıyor.
18. **`/users` POST/DELETE aktif ad set'in öğrenme aşamasını sıfırlıyor** (belge bunu `usersreplace` ile karşılaştırarak ima ediyor).
19. **Kitle silme / paylaşım kaldırma** reklamları geri dönüşsüz durduruyor; web sitesi kitlesi silinince kampanya duraklıyor. `replace: true` ile paylaşım listesi göndermek eski paylaşımları siliyor → alıcı hesaplarda reklamlar duruyor.
20. **2 yıllık kullanılmama → 90 gün sonra otomatik silme.** Müşteri listesinde "kullanmamak" silme talimatı sayılıyor.
21. **471 bütünlük işareti** kitlenin adı/açıklaması/kuralı yüzünden de konabiliyor ("diyabet hastaları" gibi bir ad). Ad set `WITH_ISSUES` oluyor; panel `issues_info`'yu göstermezse "reklam yayında değil" sebepsiz görünür.
22. **Kural düzenlemesi kitleyi boşaltmıyor:** saklama süresini kısaltan kullanıcı, eski kurala uyanların hemen çıktığını sanır.
23. **Benzer kitle büyüklüğü −1** "bilinmiyor" demek; sıfır diye gösterilirse kullanıcı çalışan kitleyi siler.
24. **`delivery_status 300`** = kitle küçük, ad set'te kullanılamaz; seçim anında söylenmeli.
25. **Özel kategori ülke alanı** verilmezse vergi ülkesine düşüyor; `tune_for_category` hedeflemeyi sessizce yeniden yazıyor.
26. **Hizmet şartları paylaşılmış hesapta** hesabın sahibi işletme adına sayılıyor; ajansın kendi işletmesi için ayrıca kabul gerekebilir. `tos_accepted` paylaşılmış hesapta güvenilir değil.
27. **Lookalike'ta seed nitelikleri** (cinsiyet/coğrafya) taşınmıyor; "kadın müşterilerime benzeyenler" erkekleri de içerebilir.
28. **Envanter filtresi:** ad set'te yazılan değer, hesap düzeyi daha sıkıysa geçerli değil; gerçek değer yalnız `effective_brand_safety_content_filter_levels`'ta.
29. **Aynı adla yüklenen blok listesi öncekinin yerine geçiyor.** `MANAGE_BLOCK_LIST` rolündeki işletmenin yaptığı değişiklik listeyi kullanan herkesi etkiliyor.
30. **Belge iç çelişkileri** (tahminle doldurulmamalı): web sitesi saklama 180/365 gün; `locales` 50/90; `geo_markets` 2.500/210; posta kodu küme eşiği 2.500/50.000; `publisher_platforms` "facebook içermeli"; ayrıntılı hedefleme varsayılanı; `special_ad_category(ies)` alan adları; FINANCIAL tarihi 14/21 Ocak 2025; etkileşim "multiple rules" örneği iki kez `page_engaged` + `and` kullanıyor (anlattığı şeyi yapmıyor); advanced targeting örneği "Japonya" diyor ama `countries: ["US"]` gönderiyor ve gövdede olmayan "Home Ownership: Renters"ı sayıyor.

## Advetics'in canlı bilgisiyle karşılaştırma

| # | Canlı bilgi | Belge | Sonuç |
|---|---|---|---|
| 2 | `geo_locations` kovaları birleşim; "Türkiye + İzmir" = Türkiye geneli, hata yok | Basic targeting örneği "…Menlo Park çevresi, *ya da* Teksas'ta *ya da* Japonya'da" diye anlatılıyor ve üç kovayı birlikte gönderiyor; advanced targeting de "Japan **or** … Menlo Park **or** … Texas" diyor | **UYUŞUYOR** (belge açıkça birleşim) |
| 9 | `age_max = 65` = "65 ve üzeri" | `age_max` ≤ 65; özel kategori "18 ile 65+" sabit; Advantage+ kitlede `age_max` 65'e sabitleniyor; geri okunan varsayılan `age_max: 65` | **UYUŞUYOR** (dolaylı; belge "65 = 65+" cümlesini açıkça kurmuyor) |
| 11 | `/search?type=adinterest` kısa terimle eşleşiyor; ilgi büyüklüğü dünya geneli | Belge yalnız "bütün ilgiler aramada dönmez" ve "adlar değişebilir" diyor; büyüklüğün kapsamını ve kısa terim davranışını SÖYLEMİYOR. Ülkeye göre büyüklük için `reachestimate` / `delivery_estimate` var. | **BELGEDE GEÇMİYOR** (çelişki yok) |
| 7 | Büyük hesapta `limit=500` → "Please reduce the amount of data"; limit yarılanmalı | Özel kitle hata tablosu aynı mesajı `code 1` olarak veriyor; çözüm "limit 20 + sayfalama" | **UYUŞUYOR** (özel kitle uçlarında; belge yarılamayı değil sabit küçük limiti öneriyor) |
| — | `advantage_audience` açıkça yazılmazsa ad set reddediliyor (subcode 1870227) | v23+: varsayılan/gevşetilmiş olmayan kurulumda bayraksız istek hata veriyor; varsayılan kurulumda ise HATA YOK, bayrak `1`'e düşüyor | **UYUŞUYOR ve TAMAMLIYOR:** hata yalnız bir hâl; diğer hâl sessiz açılma. Advetics'in her zaman `0` yazması ikisini de kapatıyor. Subcode belgede yok. |
| — | Özel kitle "300 = kampanya için çok küçük", büyüklük 1000–1000 bir taban | `delivery_status 300` "olması gerekenden küçük, kullanılamaz" | **UYUŞUYOR**; "1000 taban" belgede yok |
| 10 | `ad_accounts.external_id` `act_` önekli | Bütün uçlar `act_<ID>` biçiminde; içerik blok listesi `applied_ad_accounts` hem önekli (`account_id`) hem öneksiz (`id`) döndürüyor | **UYUŞUYOR**; iki biçimin aynı yanıtta gelmesine dikkat |
| 1, 3–6, 8, 12 | Boost `destination_type`, IG kimlik uzayları, kreatif adresleri, `?ids=`, CTWA, insights atıf ayarları, organik metrik adları | Bu gruptaki sayfalarda geçmiyor (yalnız WhatsApp Durum yerleşiminin CTWA ayarı gerektirdiği ve `promoted_object.whatsapp_phone_number` örneği var) | **BELGEDE GEÇMİYOR** — CTWA için belge örneği `whatsapp_phone_number` gönderiyor; Advetics'in "numara sorulmaz, sayfadan alınır" kuralıyla bu örnek ÇELİŞİYOR GİBİ, ama örnek Durum yerleşimine özgü ve zorunluluk belirtilmemiş |

**Advetics kodu (`apps/api/src/modules/boosts/meta-targeting.ts`) için belgeden çıkan notlar:**
- Kova ayrımı, `countries` + alt kova birlikte gönderilmemesi, `{key}` nesneleri, `age_max=65` göndermeme, ilgi alanlarını tek `flexible_spec` öğesinde birleştirme, `advantage_audience: 0` — belgeyle uyumlu.
- `custom_audiences` gönderilirken `targeting_relaxation_types` yazılmıyor → desteklenen amaçlarda Advantage custom audience/lookalike **varsayılan açık** kalıyor olabilir. Belgede `advantage_audience: 0`'ın bunları da kapatıp kapatmadığı yazmıyor (tek ipucu: geri okunan bir örnekte ikisi `0` dönüyor). Oluşturma sonrası geri okunmalı.
- `targeting_automation.individual_setting.geo` yazılmıyor; varsayılanı bilinmiyor.
- Aynı il + o ilin ilçesi seçilirse kod ikisini de gönderiyor; birleşim gereği ilçe anlamsız ve kullanıcıya söylenmiyor.
- `searchGeoLocations` `country_code=TR` göndermiyor; `subcity`/`*_geo_area` türünde dönen satırlar `BoostLocation.type` enum'una uymuyor — bu satırların kaderi (ret mi, sessiz eleme mi) kontrol edilmeli; eleme sonrası liste boşalırsa fonksiyon TR geneline düşer.

## Yapay zekâ ile yönetim için çıkarımlar

**Araç olmalı (okuma — onaysız):**
- `konum_ara(q, tür, il?)` → `adgeolocation` (`country_code=TR`, `region_id`); dönen `type`'ı OLDUĞU GİBİ döndürmeli.
- `ilgi_ara(q)` + `ilgi_dogrula(id[])` (`adinterestvalid` / `targetingvalidation`).
- `hedefleme_ozeti(spec)` → `targetingsentencelines`. **AI her yayın önerisinde bu çıktıyı kullanıcıya göstermeli** (Meta'nın kendi yorumu; birleşim hatasını gözle yakalar).
- `erisim_tahmini(spec, hedef)` → `reachestimate` / `delivery_estimate` (−1 = bilinmiyor diye raporla).
- `etkin_yerlesim(adset)` → `effective_*` + `recommendations`.
- `hedefleme_geri_oku(adset)` → `targeting_automation`, `targeting_relaxation_types`, `targeting_optimization(_types)`, `effective_brand_safety_content_filter_levels`.
- `kalkan_terimler(hesap)` → `deprecatedtargetingadsets` + `targetingoptionstatus` (periyodik denetim; düzenleme hatalarını açıklamak için).
- `ozel_kitle_listele(hesap)` → `delivery_status`, `operation_status`, `delete_time`, 471 ve `EXPIRING` uyarıları; `limit=20` sayfalı.
- `tos_durumu(hesap)`, `ozel_kategori_uygunlugu(kitle, kategori, ülke)`.

**KAPALI sözlükten seçilmeli (AI serbest metin üretmemeli):**
- `special_ad_categories` (5 değer), `location_types` (yalnız `["home","recent"]`), `genders` (1/2), `relationship_statuses`, `education_statuses`, `country_groups`, yerleşim enum'ları ve geçerli birleşim kuralları, `brand_safety_content_filter_levels` (9 değer), `excluded_publisher_categories` (5 değer), `lookalike_spec.type`, `customer_file_source`, `audience_labels`, kitle kuralı operatörleri, etkileşim olay adları.
- Konum/ilgi/davranış/özel kitle **kimlikleri** yalnız arama aracının döndürdüğü kümeden; AI bir kimlik "hatırlamamalı" ya da addan türetmemeli.

**Onay gerektirmeli:**
- Ad set hedeflemesi oluşturma/değiştirme (özellikle Advantage bayraklarının değeri, konum ve yaş).
- Özel kitle oluşturma, üye yükleme (kişisel veri), `usersreplace`, `usersofanyaudience` silme, kitle silme, paylaşım ekleme/kaldırma (`replace: true` dahil) — silme ve paylaşım kaldırma reklamları geri dönüşsüz durdurur, onay ekranı bunu söylemeli.
- `tune_for_category` ve özel reklam kategorisi değişikliği.
- Blok listesi uygulama/kaldırma.

**AI'ın asla tahmin etmemesi gereken yerler:**
- Konumun kovası (`regions` mi `cities` mi) — arama yanıtındaki `type`'tan gelir; tanınmayan türde DURUR ve sorar.
- Advantage bayraklarının varsayılanı — her zaman açıkça yazılır ve geri okunur.
- Özel kategori gerekip gerekmediği (konut/iş ilanı/kredi/sigorta/siyasi içerik sinyali varsa kullanıcıya sorulur; Türkiye'nin kısıt kapsamı belgede belirsiz).
- Benzer/özel kitle büyüklüğü −1 veya 1000 tabanı "gerçek sayı" diye yorumlanmaz.
- Bir ilgi alanının Türkiye'deki büyüklüğü (arama yanıtındaki sayı kapsamı belgede belirsiz).
- `targeting_relaxation_types` / `targeting_optimization`'ın hangi amaçta kabul edildiği — amaç tablosu olmadan gönderilmez.

## Panel kurgusu için çıkarımlar

**Acemi kullanıcıya sorulacaklar (az ve somut):**
- "Nerede?" — il/ilçe arama kutusu (ülke seçimi yalnız "bütün Türkiye" düğmesi olarak). Aynı ilin kendisi ve ilçesi seçilirse "İzmir'in tamamı zaten seçili, Karşıyaka ayrıca etkisiz" uyarısı. Ülke + il birlikte seçilemez (birleşim).
- "Kimlere?" — yaş aralığı ve cinsiyet; 65'in "65 ve üzeri" olduğu yazılı.
- "Bu kişilerle sınırlı kalsın mı, Meta benzerlerini de bulsun mu?" — tek soru; arka planda `advantage_audience`, `targeting_relaxation_types`, `targeting_optimization` buna göre AÇIKÇA yazılır. Varsayılan Advetics kararıyla "sınırlı" (0). Bağlantı tıklaması/dönüşüm gibi zorunlu genişleme olan hedeflerde "Meta bu hedefte ilgi alanlarını genişletebilir" notu.
- "Konut, iş ilanı, kredi/finans ya da siyasi içerik mi?" — evet ise özel kategori akışı (yaş/cinsiyet kilitlenir, konum hariç tutma ve benzer kitle gizlenir).

**Otomatik kararlaştırılacaklar:**
- `location_types` gönderilmez (tek değer zaten varsayılan) ya da sabit `["home","recent"]` yazılır; panelde "bu bölgede yaşayan ya da yakın zamanda bulunan" diye anlatılır.
- `special_ad_categories: []`/`NONE` normal kampanyada her zaman yazılır.
- Yerleşim: hedefe göre eşleme katmanında; WhatsApp Durum dahil olacaksa `user_age_unknown` açıkça yazılır (yaş hassas sektörde `false`).
- Envanter filtresi: varsayılanı bilinmediği için eşleme katmanı açıkça bir değer yazmalı (ör. `*_STANDARD`) ve `effective_*` geri okunmalı.
- Yayın öncesi `targetingsentencelines` + `reachestimate` ekranda gösterilir; erişim çok küçükse uyarılır.

**Yalnız Gelişmiş modda:**
- Ayrıntılı hedefleme (`flexible_spec` gruplarıyla VE/VEYA mantığı — "her grup VE, grup içi VEYA" görsel olarak), davranış/demografi kategorileri, dil (`locales`), mobil işletim sistemi/cihaz, yarıçaplı konum ve iğne (`custom_locations`, birim km olarak sabitlenmiş), konum hariç tutma, manuel yerleşim seçimi ve `placement_soft_opt_out`, yaş/cinsiyet önerisi, şehir ilgisi (`individual_setting.geo`), benzer kitle oranı (`ratio`/`starting_ratio`), blok listeleri ve yayıncı kategorisi hariç tutma.

**Kitle yönetimi ekranı:**
- Her kitle için durum (`delivery_status`, `operation_status` metni Meta'dan), büyüklük aralığı (−1 → "Meta henüz hesaplamadı"), silinme tarihi (`delete_time`), 471 işareti ve `fields_violating_integrity_policy`, kullanan reklam sayısı (`/ads`) — silme düğmesinde "bu kitleyi kullanan N reklam kalıcı olarak durur" uyarısı.
- Liste sayfalı (`limit=20`) ve "gösterilen / toplam" yazılı.
- Müşteri listesi yüklemesinde `num_received` / `num_invalid_entries` sonucu ekranda; hizmet şartları imzalı değilse yükleme düğmesi yerine imza bağlantısı.

## Sayfa sayfa dizin

Kaynak URL kökü: `https://developers.facebook.com/documentation/ads-commerce/`

| Dosya | Kaynak URL | Tek satır özet | Önem |
|---|---|---|---|
| marketing-api__audiences.md | marketing-api/audiences | Kitle bölümünün giriş ve içindekiler sayfası | Düşük |
| marketing-api__audiences__guides__audience-rules.md | marketing-api/audiences/guides/audience-rules | Web/uygulama/çevrimdışı kitle kural sözdizimi, operatörler, toplama, sınırlar (10 kural, 100 filtre) | Yüksek |
| marketing-api__audiences__guides__custom-audiences.md | marketing-api/audiences/guides/custom-audiences | Müşteri listesi kitlesi: oluşturma, 10k'lık oturumlu yükleme, hash/normalizasyon, `usersreplace`, hesap başına sınırlar, hata kodları | Yüksek |
| marketing-api__audiences__guides__dynamic-product-audiences.md | marketing-api/audiences/guides/dynamic-product-audiences | Advantage+ katalog için ürün kitleleri: piksel/uygulama olayları, `content_type`, `product_audiences` | Orta |
| marketing-api__audiences__guides__engagement-custom-audiences.md | marketing-api/audiences/guides/engagement-custom-audiences | Sayfa/IG/form/Instant Experience/alışveriş/AR etkileşim kitleleri, olay adları, saklama süreleri | Yüksek |
| marketing-api__audiences__guides__lookalike-audiences.md | marketing-api/audiences/guides/lookalike-audiences | Benzer kitle oluşturma, `lookalike_spec`, seed türleri, inaktiflik (−1), ertelenmiş konum değişikliği | Yüksek |
| marketing-api__audiences__guides__mobile-app-custom-audiences.md | marketing-api/audiences/guides/mobile-app-custom-audiences | Uygulama olayı kitleleri, `retention_days`, olay "wire name" tablosu, iOS 14.5 kısıtları | Düşük |
| marketing-api__audiences__guides__offline-custom-audiences.md | marketing-api/audiences/guides/offline-custom-audiences | Çevrimdışı olay setinden kural tabanlı kitle | Düşük |
| marketing-api__audiences__guides__reach-estimate.md | marketing-api/audiences/guides/reach-estimate | `act_X/reachestimate` tek örnekli kısa sayfa | Orta |
| marketing-api__audiences__guides__value-based-lookalike-audiences.md | marketing-api/audiences/guides/value-based-lookalike-audiences | Değer bazlı seed (`is_value_based`, `LOOKALIKE_VALUE`) ve `custom_ratio` benzer kitle | Orta |
| marketing-api__audiences__guides__website-custom-audiences.md | marketing-api/audiences/guides/website-custom-audiences | Piksel tabanlı kitle oluşturma/okuma/güncelleme/silme, `prefill`, saklama, SSS | Yüksek |
| marketing-api__audiences__overview.md | marketing-api/audiences/overview | Kitle türleri özeti, 2025 bütünlük işareti (471), 2 yıl + 90 gün otomatik silme, ülke zorunluluğu | Yüksek |
| marketing-api__audiences__reference.md | marketing-api/audiences/reference | Referans sayfalarının bağlantı dizini | Düşük |
| marketing-api__audiences__reference__advanced-targeting.md | marketing-api/audiences/reference/advanced-targeting | Mobil, gelişmiş demografi, eğitim/iş, özel kitle dahil/hariç (500/500), dil, şehir ilgisi (`individual_setting.geo`), yaş/cinsiyet önerisi, BCT | Yüksek |
| marketing-api__audiences__reference__advantage-targeting.md | marketing-api/audiences/reference/advantage-targeting | `targeting_optimization_types` / `relaxation_types` / `optimization` ayrımı ve zorunlu genişleme olan 21 hedef | Yüksek |
| marketing-api__audiences__reference__basic-targeting.md | marketing-api/audiences/reference/basic-targeting | Yaş/cinsiyet, `geo_locations` kovaları ve sınırları, `location_types`, ilgi/davranış; birleşim örneği | Yüksek |
| marketing-api__audiences__reference__custom-audience-terms-of-service.md | marketing-api/audiences/reference/custom-audience-terms-of-service | Özel kitle hizmet şartlarının kimin adına sayıldığı (sahip/OBO/paylaşılmış), sistem kullanıcısı, `tos_accepted` | Yüksek |
| marketing-api__audiences__reference__deprecated-targeting-terms.md | marketing-api/audiences/reference/deprecated-targeting-terms | `deprecatedtargetingadsets`, `adset.targeting_state` süzgeci, deprecating/delivery_paused | Orta |
| marketing-api__audiences__reference__detailed-targeting.md | marketing-api/audiences/reference/detailed-targeting | Hesap düzeyi `targetingsearch/suggestions/browse/validation`, `limit_type`, 2.000 kişi süzgeci | Orta |
| marketing-api__audiences__reference__estimated-daily-results.md | marketing-api/audiences/reference/estimated-daily-results | `delivery_estimate` (hesap/ad set), sonuç eğrisi, hesaba göre değişen teklif tahmini | Orta |
| marketing-api__audiences__reference__flexible-targeting.md | marketing-api/audiences/reference/flexible-targeting | `flexible_spec` VE/VEYA mantığı, 25/1.000 sınırı, kullanılabilen alanlar | Yüksek |
| marketing-api__audiences__reference__placement-targeting.md | marketing-api/audiences/reference/placement-targeting | Yerleşim enum'ları ve birleşim kuralları, envanter filtresi, yayıncı hariç tutma, `placement_soft_opt_out`, etkin yerleşim | Yüksek |
| marketing-api__audiences__reference__targeting-description.md | marketing-api/audiences/reference/targeting-description | `targetingsentencelines` — hedeflemenin insan diliyle karşılığı | Orta |
| marketing-api__audiences__reference__targeting-expansion__advantage-audience.md | marketing-api/audiences/reference/targeting-expansion/advantage-audience | v23+ `advantage_audience` varsayılan/zorunluluk kuralı, yaş kısıtları, hata hâli | Yüksek |
| marketing-api__audiences__reference__targeting-expansion__advantage-custom-audience.md | marketing-api/audiences/reference/targeting-expansion/advantage-custom-audience | `targeting_relaxation_types.custom_audience`; desteklenen amaçta varsayılan açık | Yüksek |
| marketing-api__audiences__reference__targeting-expansion__advantage-detailed-targeting.md | marketing-api/audiences/reference/targeting-expansion/advantage-detailed-targeting | `targeting_optimization: expansion_all/none`; erişim tahmini farkı | Yüksek |
| marketing-api__audiences__reference__targeting-expansion__advantage-lookalike.md | marketing-api/audiences/reference/targeting-expansion/advantage-lookalike | `targeting_relaxation_types.lookalike`; varsayılan açık | Yüksek |
| marketing-api__audiences__reference__targeting-restrictions.md | marketing-api/audiences/reference/targeting-restrictions | Yaş, dil, şehir, bölge, posta kodu vb. sayısal sınır tablosu | Orta |
| marketing-api__audiences__reference__targeting-search.md | marketing-api/audiences/reference/targeting-search | `/search` türleri: coğrafi (hiyerarşi, posta kodu, meta, yarıçap), ilgi, davranış, demografi, terim durumu | Yüksek |
| marketing-api__audiences__special-ad-category.md | marketing-api/audiences/special-ad-category | Özel reklam kategorileri, ülke alanı, kısıtlar, `tune_for_category`, hata kodları, AB siyasi yasağı | Yüksek |
| marketing-api__brand-safety-and-suitability.md | marketing-api/brand-safety-and-suitability | Marka güvenliği API'lerinin dizini | Düşük |
| marketing-api__brand-safety-and-suitability__block-list.md | marketing-api/brand-safety-and-suitability/block-list | Yayıncı blok listesi taslak/oluştur/paylaş/uygula, sınırlar ve eşikler | Orta |
| marketing-api__brand-safety-and-suitability__brand-safety-partners.md | marketing-api/brand-safety-and-suitability/brand-safety-partners | İş ortağı programı kurulumu: işletme, uygulama, doğrulama, uygulama incelemesi, partner ataması | Düşük |
| marketing-api__brand-safety-and-suitability__content-block-lists.md | marketing-api/brand-safety-and-suitability/content-block-lists | Gönderi düzeyinde içerik blok listeleri, toplu dosya, sınırlar | Orta |
| marketing-api__brand-safety-and-suitability__content-delivery-report.md | marketing-api/brand-safety-and-suitability/content-delivery-report | Ad set düzeyi içerik teslim raporu (in-stream, reels overlay), PT saat dilimi | Düşük |
| marketing-api__brand-safety-and-suitability__feed-verification.md | marketing-api/brand-safety-and-suitability/feed-verification | Komşu içerik raporu (akış), `effective_brand_safety_content_filter_levels` açıklaması | Orta |
| marketing-api__brand-safety-and-suitability__passback-api.md | marketing-api/brand-safety-and-suitability/passback-api | İş ortağının Meta'ya GARM risk etiketi ve uygunluk skoru göndermesi | İlgisiz |
| marketing-api__brand-safety-and-suitability__publisher-delivery-report.md | marketing-api/brand-safety-and-suitability/publisher-delivery-report | Yayıncı düzeyi teslim raporu parametre/alanları | Düşük |
| marketing-api__brand-safety-and-suitability__publisher-list.md | marketing-api/brand-safety-and-suitability/publisher-list | Partner-publisher listeleri ve metaverisi | Düşük |
| marketing-api__reference__custom-audience.md | marketing-api/reference/custom-audience | CustomAudience düğümü: alanlar, `operation_status`/`delivery_status` kodları, güncelleme parametreleri, silme sonuçları, 471 hataları | Yüksek |
| marketing-api__reference__custom-audience__ad_accounts.md | marketing-api/reference/custom-audience/ad_accounts | Kitleyi başka hesaplarla paylaşma/kaldırma (`permissions`, `replace`) | Orta |
| marketing-api__reference__custom-audience__adaccounts.md | marketing-api/reference/custom-audience/adaccounts | Paylaşılan hesapları okuma; paylaşım kaldırınca reklamların durması | Orta |
| marketing-api__reference__custom-audience__ads.md | marketing-api/reference/custom-audience/ads | Kitleyi kullanan reklamlar | Orta |
| marketing-api__reference__custom-audience__capabilities.md | marketing-api/reference/custom-audience/capabilities | Yalnız okuma kenarı; alanları belgede tanımsız | Düşük |
| marketing-api__reference__custom-audience__health.md | marketing-api/reference/custom-audience/health | Audience API ile paylaşılan toplu değer verisi; parametreler var, alanlar tanımsız | Düşük |
| marketing-api__reference__custom-audience__sessions.md | marketing-api/reference/custom-audience/sessions | Yükleme oturumlarını okuma (`session_id`) | Düşük |
| marketing-api__reference__custom-audience__shared_account_campaign_info.md | marketing-api/reference/custom-audience/shared_account_campaign_info | Paylaşılan hesap kampanya bilgisi; alanları tanımsız | Düşük |
| marketing-api__reference__custom-audience__shared_account_info.md | marketing-api/reference/custom-audience/shared_account_info | İşletme dışı paylaşım durumu (`SHARED`/`IN_PROGRESS`/`NOT_SHARED`) | Düşük |
| marketing-api__reference__custom-audience__users.md | marketing-api/reference/custom-audience/users | Üye ekleme/silme: `payload` şeması, `session`, dönüş alanları, hata kodları | Yüksek |
| marketing-api__reference__custom-audience__usersreplace.md | marketing-api/reference/custom-audience/usersreplace | Üyeleri toplu değiştirme ucu parametreleri ve hataları | Orta |
