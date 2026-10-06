# Meta reklam brief'i — kampanya kurma mantığı, yapay zekâ ile yönetim, panelin baştan yapımı

> **Ne:** Meta'nın "Ads and Commerce" geliştirici dokümantasyonunun TAMAMI (1.013 sayfa, her sayfanın
> "Copy for LLM" metni) okunarak hazırlanan uygulama brief'i. Advetics'te reklam oluşturma panelinin
> baştan yapımına ve kampanyaların yapay zekâ ile kurulup yönetilmesine girdi olacak.
> **Tarih:** 2026-10-06 · **Kaynak:** `developers.facebook.com/documentation/ads-commerce` ·
> **Durum:** karar belgesi, kod yok. §8'deki sorular cevaplanmadan uygulamaya geçilmez.
>
> **Kullanıcı kararları (2026-10-06)** — §8'deki ilgili satırlar güncellendi:
> 1. **Yayın onayı tek adım:** "Yayınla" = Meta'ya `PAUSED` kur → geri oku → fark yoksa aç. Fark
>    varsa açma durur ve fark gösterilir.
> 2. **Advantage+ kitle ve otomatik (Advantage+) yerleşim AÇIK.** §2 ve §7'deki "kapalı" önerisi
>    geçersiz. Değer yine AÇIKÇA yazılır (`advantage_audience: 1`) ve geri okunur; kullanıcıya "yaş
>    aralığı Meta'ya öneri olarak gider" ve "otomatik yerleşim" denir (§2).
> 3. **Sohbetten yayın var:** AI asistanı onay kartıyla yayınlayabilir. Kart, panelin tek adımlı
>    yayınının aynısı.
> 4. **Konut reklamı kısıtları Türkiye'de de uygulanır** (`HOUSING`; belgede Türkiye'nin kapsamı
>    belirsiz, kısıtlamak tahmin etmekten iyi).
> 5. **Akıllı Boost dışındaki reklam oluşturma modülü mevcut yapıya bağlı kalınmadan BAŞTAN tasarlanır.**
>    §4–§7 bugünkü kodla köprü kuruyor. Yeni modülün tasarımı ayrı belgede, derin araştırmayla yazılacak.
>
> **Bilgi BELGEDEN, canlıda doğrulanmadı.** Canlıda (parayla) öğrenilmiş kurallar `CLAUDE.md`
> "Canlıda öğrenilen platform gerçekleri"nde duruyor; belge onlarla çeliştiğinde canlı bilgi esas
> alınıyor ve çelişki §3'te ayrıca yazılı. Advetics'in Meta'ya yazan hiçbir yolu bugüne kadar canlıda
> çalıştırılmadı (bkz. §4) — bu brief'teki her yazma kuralı ilk canlı turda (§9) sınanmalı.

---

## 0. Bu belge nasıl okunur

Bu dosya **karar belgesi**: Meta'nın modelinden Advetics'in nasıl kampanya kuracağına, yapay zekânın
neyi yapıp neyi yapamayacağına ve panelin nasıl görüneceğine kadar. Ayrıntı ve kaynak `bolumler/`
altında: her bölüm kendi sayfa grubunu okuyup Advetics gözüyle yazıldı ve sonunda okuduğu HER sayfa
için bir satır taşıyor (sessiz kesme yok; satır sayıları listeyle betikle karşılaştırıldı).

| Bölüm | Konu | Sayfa |
|---|---|---|
| [00](bolumler/00-advetics-mevcut-durum.md) | **Advetics bugün:** ekranlar, taslak modeli, `goal-mapping.ts`, yayın yolu, AI asistan, "karmakarışık"ın kanıtları | depo kodu |
| [01](bolumler/01-temel-yapi-ve-ai-baglayicilari.md) | Marketing API temeli (hiyerarşi, durum, sürüm, hız sınırı, hata kodları, changelog) + **Meta'nın Ads MCP / Ads CLI'ı** | 79 |
| [02](bolumler/02-kampanya-adset-reklam-referansi.md) | Kampanya / ad set / reklam / kreatif **alan sözlüğü** ve amaç uyumluluk tabloları | 46 |
| [03](bolumler/03-hedefleme-ve-kitleler.md) | Hedefleme, coğrafya, Advantage+ kitle, özel kategori, özel kitleler, marka güvenliği | 50 |
| [04](bolumler/04-butce-teklif-advantage-olcum.md) | Bütçe, teklif, Advantage+ kampanyalar, Insights, kural motoru, A/B test | 45 |
| [05](bolumler/05-kreatif-ve-instagram.md) | Kreatif, Advantage+ creative, önizleme, Instagram, **giriş anında medya doğrulama tablosu** | 37 |
| [06](bolumler/06-reklam-turleri-ve-hedef-yollari.md) | Reklam türleri uçtan uca + **"Ne istiyorsun?" kapalı sözlüğü** (19 satır) | 56 |
| [07](bolumler/07-katalog-ve-dikey-reklamlar.md) | Katalog, Advantage+ catalog ads, dikeyler (emlak, otomotiv, seyahat), Commerce | 255 |
| [08](bolumler/08-olcum-pixel-conversions-api.md) | Pixel, Conversions API, dataset kalitesi, **dönüşüm kampanyası öncesi 17 maddelik kontrol** | 224 |
| [09](bolumler/09-hesap-business-ve-varliklar.md) | Reklam hesabı kenarları, Business Manager, izin katmanları, ödeme ve hesap durumu | 221 |
| [tasarim/](tasarim/TASARIM.md) | **Yeni Reklam Oluştur modülünün tasarımı** (18 bölüm), çelişki hükümleri, bekleyen kararlar | — |

- Toplam **1.013 sayfa**; 1.013'ü de bir bölümün dizininde. Ham metinler depoya girmiyor (Meta'nın
  metni ve depo herkese açık): `./scripts/meta-doku-indir.sh` ile `kaynak/` altına yeniden indirilir.
  "Copy for LLM" düğmesi sayfayı `Accept: text/markdown` ile istiyor; betik aynısını yapıyor.
- **43 sayfanın markdown sürümü yok** (Meta'nın sitesinde de boş açılıyor): 15 affiliate, 8 commerce,
  5 gateway, 2 conversions, 1 katalog, 12 Marketing API (`glossary`, `get-started/use-cases`,
  `lead-ads/enable-quality-features` ve iki alt sayfası, `insights/products`, `mobile-measurement`,
  `advertiser-networks`, `automotive-model-ads`, kök sayfa, iki 404 referans). Liste betiğin ürettiği
  `kaynak/_basarisiz.txt`te.
- İşaretler: **[Belge]** belgeden okundu · **[Canlı]** Advetics canlıda öğrendi · **[Çelişki]** ikisi ya
  da belgenin iki sayfası ayrışıyor · **[Karar]** kullanıcının vermesi gereken karar (§8).

---

## 1. Meta'nın reklam modeli — bir sayfada

**Hiyerarşi** (eski adlar uç noktalarda hâlâ yaşıyor; kod okurken karıştırma):

| Seviye | API adı (eski) | Taşıdığı karar | Sonradan değişir mi |
|---|---|---|---|
| Kampanya | `campaign` (`campaign_group`) | `objective`, `special_ad_categories`, `buying_type`; CBO ise bütçe + teklif stratejisi | Amaç yalnız ODAX'a; kategori dikkatle |
| Ad set | `adset` (`campaign`!) | bütçe (ABO), takvim, teklif, **hedefleme**, `optimization_goal`, `billing_event`, `destination_type`, `promoted_object`, `attribution_spec` | `promoted_object` neredeyse hiç; `optimization_goal` CBO'da yayından sonra değişmez |
| Reklam | `ad` (`adgroup`) | hangi kreatif, `tracking_specs`, `status` | `adset_id` değişmez |
| Kreatif | `adcreative` | görsel/video/metin/CTA/IG kimliği | **İçerik HİÇ değişmez** — yeni kreatif + reklamın kreatifini değiştirme |

**Amaç yalnız ODAX** (v21'den beri): `OUTCOME_AWARENESS`, `OUTCOME_TRAFFIC`, `OUTCOME_ENGAGEMENT`,
`OUTCOME_LEADS`, `OUTCOME_SALES`, `OUTCOME_APP_PROMOTION`. Belgedeki "get started" örnekleri hâlâ
`LINK_CLICKS`/`CONVERSIONS` kullanıyor — bugün çalışmaz, kopyalanmamalı. [Belge, 01 §1.2]

**Her reklam türü dört katmanlı TEK bir tariften çıkar:** kampanya `objective` → ad set
`optimization_goal` + `destination_type` + `promoted_object` (+ `billing_event`) → kreatif
(`object_story_spec` / `asset_feed_spec`) → kreatifteki `call_to_action` (+ `app_destination`). Dördü
ayrı ayrı seçilirse Meta ya reddeder ya da **kabul edip başka bir şey yayınlar**. Kullanıcıya dördü
ayrı sorulmaz; tek bir "niyet" satırından birlikte seçilir (§5.3). [06 Özet 1]

**Durum modeli:**
- `status` (senin yazdığın) ≠ `effective_status` (gerçek): `CAMPAIGN_PAUSED`, `ADSET_PAUSED`,
  `PENDING_REVIEW`, `DISAPPROVED`, `WITH_ISSUES`, `IN_PROCESS`, `PENDING_BILLING_INFO`… Ekran yalnız
  `status` okursa "yayında" der ama reklam üst nesne yüzünden durmuştur. [09]
- **Ad set `status` verilmezse `ACTIVE`** [Belge, CTWA referansı birebir]. Yeni reklam
  `PENDING_REVIEW`'a girer ve **onaylanınca kendiliğinden yayına başlar**. Yani her şey `PAUSED`
  kurulmalı, yayın ayrı ve onaylı bir adım olmalı. Meta'nın kendi MCP'si de böyle çalışıyor. [02, 06, 01]
- İncelemeye sokar: kreatif, hedefleme, `optimization_goal`/`billing_event` değişikliği. Sokmaz:
  bütçe, teklif, takvim. [01 §1.4]
- `DELETED` geri dönmez; silinen reklam 28 gün daha metrik toplayabilir ve üst nesnenin toplamına
  girer ama `level=ad` listesinde görünmez (reklam tablosu toplamı kampanya kartını tutmaz). [01]

**Para ve birimler** — aynı API'de üç farklı ölçek, üçü de API'ce "geçerli":
- Bütçe, `bid_amount`, kampanya `spend_cap`: hesap para biriminin **alt biriminde tam sayı** (TRY → kuruş).
- Hesap `spend_cap` **güncellemesi**: standart birimde ondalık (`23.50`), okunurken alt birimde döner. [02]
- `roas_average_floor`: **10.000 ile ölçekli** tam sayı (1,5 ROAS = `15000`) [Belge, bid-strategy].
  **[Çelişki]** Meta'nın kendi MCP aracının şeması aynı alan için "`200` = 2,00x" diyor (100 ile ölçek).
  Advetics doğrudan API'ye yazıyor: belge esas; MCP açıklamasını örnek alan kod yüz kat düşük taban gönderir.

**Sürüm:** en yeni sürüm **v26.0** (2026-07-29; indirilen dokümantasyonun "Versions" sayfası hâlâ "güncel
v25" diyor — **[Çelişki]**, Graph değişiklik günlüğü ve Meta'nın aracı v26'yı gösteriyor). **v24.0 bugün
(2026-10-06) sona eriyor.** Sürümsüz çağrı geçersiz; süresi dolan sürümle gelen çağrı uç değişmemişse
sessizce bir sonrakine yükseltiliyor (`X-Ad-Api-Version-Warning`) ve FARKLI davranabiliyor. Advetics
varsayılanı `v25.0` (`configuration.ts:162`, `.env.example:99`) — **sunucudaki `.env`'in bunu ezmediği
kontrol edilmeli**. [01 §1.6, R4]

**v26'nın bütün sürümlere uygulanacağı tarih: 2026-10-27** (Meta'nın resmî v26 değişiklik günlüğü,
doğrulandı): kök `GET /?ids=` istekleri HATA dönecek (Advetics'te iki çağrı var — ayrı görev açıldı);
ETag/304 kalkıyor; `delivery_estimate`'ten günlük sonuç eğrisi kalkıyor (yani "tahmini sonuç" gösterilemez,
`reachestimate` ile kitle büyüklüğü kalıyor); Instagram Explore yerleşimi kalkıyor (belirtilirse hata);
Messenger Stories yerleşimi sessizce siliniyor. v26'da yeni bir **sessiz varsayılan** da var: mağazası olan
reklamverende uygun kreatifler `WEBSITE_AND_SHOP` varışına düşüyor (çıkış `WEBSITE_AND_SHOP_OPT_OUT`), ve
HOUSING/EMPLOYMENT/FINANCIAL'da kısıtlı kurulumlu yeni ad set `advantage_audience`'ı açıkça istiyor. [R4 §3.10]

**Sınırlar (muhafazakâr okuma):** ad set bütçesi **saatte en fazla 4 kez** değişir (5.'si bir saat
kilit: `613 / 1487632`); ad set başına 50 reklam, kampanya başına 200 ad set (belgede iki ayrı sayı
var, küçüğü); hesap başına 500 özel kitle. [01 §1.7, 02, 09]

---

## 2. Sessiz hata haritası — "gönderilmeyen alan" manifestosu

Bu projenin baş belası sessiz hata, Meta'da da en çok **gönderilmeyen alandan** çıkıyor: alan yoksa
karar hesabın ya da Meta'nın varsayılanına kalıyor, aynı kod iki müşteride farklı davranıyor ve hata
dönmüyor. Aşağıdaki her alan, Advetics'in kurduğu HER nesnede **açıkça** yazılmalı. Bu tablo yeni
"derleyici"nin (§5.5) test edilecek sözleşmesidir.

| Alan | Gönderilmezse Meta ne yapıyor | Advetics ne yazmalı | Kaynak |
|---|---|---|---|
| `status` (kampanya/ad set/reklam) | Ad set `ACTIVE`; reklam inceleme sonrası kendiliğinden yayın | Hepsinde `PAUSED`; yayın ayrı onaylı adım | 06, 02 |
| `bid_strategy` | **[Çelişki]** bir sayfa varsayılanı `LOWEST_COST_WITH_BID_CAP` diyor; yalnız `bid_amount` verilirse kesin manuel tavan | `LOWEST_COST_WITHOUT_CAP` (Gelişmiş'te seçilebilir) | 02, 09 |
| `billing_event` | Zorunlu | `IMPRESSIONS` (her hedefte geçerli) | 01, 02 |
| `destination_type` | Meta tahmin ediyor; boost'ta ret [Canlı #1] | Niyet satırından açıkça — **site amacında da `WEBSITE`** (bugün gönderilmiyor) | 06, 00 §4.1 |
| `promoted_object.page_id` (mesaj) | Meta MCP'de "hesabın birincil sayfası" kendiliğinden seçiliyor | Her zaman seçilen sayfa | 01 §2.3 |
| `targeting_automation.advantage_audience` | v23+: "varsayılan" hedeflemede **sessizce `1`** (yaş öneriye döner); diğerlerinde hata | **`1` açıkça** (kullanıcı kararı 2026-10-06; eski kod `0` yazıyordu). Kesin kalanlar: konum, en düşük yaş (en çok 25), dil, özel kitle HARİÇ TUTMALARI; yaş aralığı, cinsiyet, ilgi ve özel kitle dahil etmeleri ÖNERİ — panel bunu söyler | 03, [Canlı] |
| `targeting_relaxation_types` (özel kitle / benzer kitle genişletmesi) | Desteklenen amaçlarda **varsayılan açık**; desteklenmeyende alanı yazmak HATA | Amaç tablosuna göre açıkça; oluşturduktan sonra geri oku | 03 Özet 4 |
| `targeting_optimization` (ayrıntılı hedefleme genişletmesi) | **[Çelişki]** 21 optimizasyon hedefinde zorunlu genişleme diyen sayfa var | Geri oku (`targeting_optimization_types`), varsa kullanıcıya "Meta ilgi alanlarını genişletebilir" | 03 Özet 5 |
| Yerleşim (`publisher_platforms` + `*_positions`) | Advantage+ yerleşim: bugünkü VE gelecekte eklenecek bütün yerleşimler | **Advantage+ yerleşim** (kullanıcı kararı). Meta bunu yalnızca alanların GÖNDERİLMEMESİYLE tanımlıyor: manifestonun tek "bilerek boş" satırı. Geri okumayla doğrulanır, panelde "otomatik yerleşim" yazılır; WhatsApp Durum'a da gidebileceği için `user_age_unknown` açıkça yazılır; medya yerleşimleri karşılamalı (kare + dikey) | 03, 01 |
| `user_age_unknown` (WhatsApp Durum yerleşimi) | `true` (2026'dan beri; yaşı bilinmeyenler kitleye girer) | Açıkça; yaş hassas sektörde `false` | 06, 03 |
| `custom_locations[].distance_unit` | **mil** | `kilometer` | 03 |
| `special_ad_categories` | Zorunlu alan | `[]` ya da seçilen kategori — kullanıcı beyanıyla | 02, 03 |
| `is_adset_budget_sharing_enabled` | v24+ ABO'da zorunlu (`4834011`) | `false` (kod bugün yazıyor) | 04 |
| `attribution_spec` | 7 gün tık + 1 gün görüntüleme (Meta MCP varsayılanı); değer optimizasyonunda geçmişte 1 gün tık | [Karar] Advetics standardı, açıkça | 02 §9d, 01 |
| Advantage+ creative (`degrees_of_freedom_spec.creative_features_spec`) | `adapt_to_placement` "Default is opt-in"; bazı özellikler markanın görselini/metnini değiştiriyor | Her özellik **açıkça `OPT_OUT`**; açmak müşteri onayıyla | 05 Özet 1–2 |
| `contextual_multi_ads.enroll_status` | **`OPT_IN`** (2024-08-19'dan beri; reklam başka markaların reklamlarıyla birlikte gösterilir) | `OPT_OUT` | 05 |
| Karusel `multi_share_optimized` | `true` (kart sırasını Meta seçer) | `false` | 05 |
| Otomatik ürün etiketleme | açık | kapalı | 05 |
| `page_welcome_message` (mesaj reklamı) | İngilizce varsayılan karşılama | Türkçe metin | 06 |
| `instagram_user_id` | Meta MCP'ye göre IG'de **hiç yayın yok** | IG hesabı seçiliyse daima (sayfadan bulunur) | 01, 05 |
| `conversion_domain` | Hedef URL'den tahminle dolduruluyor | Bağlantıdan türet, kullanıcıya göster | 09 |
| `url_tags` | yok | Ajansın UTM şablonu (kimlik makrolarıyla) | 05 |
| `self_ai_disclosure` | — (sonradan değişmez) | **Kullanıcıya sorulur, tahmin edilmez** | 01 |
| Insights `date_preset` / `fields` | `last_30d` / yalnız gösterim+harcama | Açık `time_range`, açık alan listesi | 09 |
| `/campaigns`, `/ads` listelerinde `effective_status` süzgeci | Arşivli/silinmiş DÖNMÜYOR | Tamlık iddia eden senkronizasyonda açıkça | 09, 02 |

**Bir de "kabul edip yok sayma" listesi var** (hata yok, etkisi yok): `object_story_spec` varken
`image_hash`; `promoted_object` varken `conversion_specs`; sayfa etiketi (mention) yayında düşüyor;
`OPT_IN` istenen ama uygun olmayan Advantage+ özelliği siliniyor; listede olmayan `optimization_goal`
(MCP tarafında) önerilen varsayılanla değiştiriliyor. Hepsinin tek ilacı **oluşturduktan sonra geri
okuyup gönderilenle karşılaştırmak** (§5.8). [02, 05, 09, 01]

---

## 3. Belge ile Advetics'in canlı kuralları

### 3a. Belgenin doğruladıkları

| Canlı kural (`CLAUDE.md`) | Belge | Bölüm |
|---|---|---|
| `geo_locations` kovaları BİRLEŞİM ("Türkiye + İzmir" = Türkiye geneli) | Açıkça "…ya da…ya da" diye anlatıyor; daraltmanın tek yolu kapsayan kovayı göndermemek ya da `excluded_geo_locations` | 03 |
| `advantage_audience` açıkça yazılmalı | v23+ davranışı birebir; ayrıca yazılmazsa SESSİZ açılma hâli de var | 03 |
| Click-to-WhatsApp kurulumu (`WHATSAPP`, `page_id`, `api.whatsapp.com/send`, `app_destination`) | Birebir; numara (`whatsapp_phone_number`) isteğe bağlı — sorulmaması doğru | 06 |
| IG gönderisi `object_id` + `instagram_user_id` + `source_instagram_media_id` | Birebir; ek olarak IABP kimliği `object_id` yerine geçebiliyor | 05, 06 |
| Kreatif görsel adresleri ölüyor | "Facebook'un döndürdüğü görsel adreslerini kullanmayın, kendi sunucunuzda barındırın"; önizleme iframe'i 24 saat | 09 |
| `image_hash` hesap başına | Hesaplar arası `adimages copy_from` gerekiyor | 09 |
| Sabit `limit` "reduce the amount of data" ile düşüyor | Sabit eşik yok; özel kitle uçlarında aynı mesaj | 03, 04 |
| Kreatif oluştu ≠ doğru gönderiye bağlandı | Aynı `object_story_id` ikinci kez verilirse YENİ kreatif açılmıyor, eskisinin kimliği dönüyor | 09, 02 |

### 3b. Çelişkiler — ne yapılacak

1. **Insights atıf parametreleri 10 Haziran 2025'ten beri YOK SAYILIYOR.** [Belge, iki ayrı sayfa:
   insights best practices + 2025 sürüm dışı değişiklikler] `use_unified_attribution_setting` ve
   `action_report_time` artık bir şey değiştirmiyor; yanıt Ads Manager'ı taklit ediyor: atıf **ad set'in
   kendi `attribution_spec`'inden**, rapor zamanı her durumda **`mixed`** (Meta içi eylemler gösterim
   gününe, site satın alması gibi Meta dışı eylemler DÖNÜŞÜM gününe). Ayrıca `7d_view` ve `28d_view`
   pencereleri 2026-01-12'den beri boş dönüyor.
   - `meta.provider.ts:1077` yorumu "dönüşüm gösterim gününe yazılıyor" diyor — Meta dışı dönüşümler
     için artık yanlış. Göndermek zarar vermiyor ama **koruma sağlamıyor**: "iki müşteride farklı atıf"
     riskinin kaynağı artık ad set kurulumu.
   - **Yapılacak:** (a) canlıda aynı gün için `impression`/`conversion`/`mixed` ile üç çağrı, sonuç aynı
     mı; (b) Advetics'in KURDUĞU ad set'lerde `attribution_spec` açıkça yazılır (§2); (c) havuzdaki
     diğer kampanyalarda raporda her ad set'in `attribution_setting`'i gösterilir; (d) `CLAUDE.md`
     "PLATFORMA GİDEN İSTEKTE ATIF..." maddesi güncellenir. [01, 04]
2. **"`countries` zorunlu"** (ad set ve `reachestimate` referansı) — birleşim kuralıyla çelişiyor
   gibi. Hedefleme sayfaları birleşimi açıkça anlatıyor; doğru okuma "**`geo_locations` zorunlu**".
   Şehir seçilince ülke gönderilmez. [02, 09, 03]
3. **`roas_average_floor` ölçeği**: API ×10.000, Meta MCP aracı ×100 (§1). Gelişmiş moda girdiğinde
   ilk canlı turda ölçülmeli; araç ROAS'ı ondalık alıp kendisi çevirmeli.
4. **Günlük bütçe esnekliği**: bir sayfa %25 diyor; v24 changelog'u ve bütçe paylaşımı sayfası **%75**
   (haftalık tavan = 7 × günlük). Yeni olan %75. Advetics'in bütçe bekçisi "bugün günlük bütçeyi
   aştı"yı hata saymamalı; kontrol haftalık/aylık toplamla. [01, 04]
5. **AdImage kalıcı adres alanının adı `permalink_url`** — kod doğru alanı kullanıyor
   (`meta.provider.ts:1718`); `CLAUDE.md` "`AdImage.permanent_url`" yazıyor (ad hatası, düzeltilmeli). [02]
6. **CTWA'da iki belge hatası**: bir sayfa hedefi `MESSAGING_WHATSAPP` diye, WhatsApp Durum sayfası
   `app_destination`'ı küçük harf `whatsapp` diye yazıyor. Canlı bilgi (`WHATSAPP`) esas. [06]
7. **Meta'nın kendi örnekleri birleşim tuzağına düşüyor** (omnichannel ve Reels örnekleri ülke + bölge +
   şehir birlikte gönderiyor ve bunu "New York hedeflemesi" diye sunuyor). Belge örnekleri hedefleme
   için "doğru" sayılmaz. [05, 06]
8. **Ad set başına reklam / hesap başına ad set sınırları** iki farklı sayı; küçüğü uygulanır (§1). [02]
9. **"37 aylık metrik sınırı"** (`CLAUDE.md`) bu sayfalarda geçmiyor; belgede "13 aydan eski tarihlerde
   kırılımlı sorguda `reach` dönmüyor" ve "metrik 28 gün içinde değişebilir" var. Kaynağı ayrıca bulunmalı. [04]

### 3c. Belgenin getirdiği, Advetics'in bilmediği en önemli şeyler

- **`execution_options=["validate_only","synchronous_ad_review"]`**: kampanya, ad set, kreatif ve reklam
  uçlarında mutasyon YAPMADAN Meta'nın bütün doğrulamasını ve reklam bütünlük incelemesini (metin,
  görsel kuralları) koşturuyor; `include_recommendations` önerileri ekliyor. Bedava prova — yeni
  akışın "Meta'ya göster" adımı bunun üstüne kurulmalı. [02, 09]
- **`targetingsentencelines`**: ad set hedeflemesinin Meta'nın KENDİ yorumuyla insan dilinde karşılığı
  ("Konum — yaşayan: Türkiye, İzmir"). Birleşim hatasını gözle yakalatmanın en ucuz yolu. [03]
- **`generatepreviews`**: kreatif OLUŞTURMADAN yerleşim başına önizleme (iframe, 24 saat). [05]
- **`advantage_state_info`**: kampanya bütçesi + yerleşim kısıtı yok + yalnız ülke hedeflemesi olunca
  kampanya **kendiliğinden Advantage+** sayılıyor. Oluşturduktan sonra okunmalı. [04]
- **`deprecatedtargetingadsets?type=delivery_paused`**: kalkan bir hedefleme seçeneği yüzünden Meta'nın
  DURDURDUĞU ad set'ler — kimse çağırmazsa kampanya "aktif" görünüp harcamaz. [09]
- **Ödeme yöntemi olmayan hesapta reklam oluşuyor ama yayınlanmıyor** (hata yok). [09, 02]
- **"Bu sayfa için reklam veremezsin" diye tek bir hata kodu yok** (yalnız genel `200`/`283`); izin
  üç katmanın kesişimi ve önden ölçülmeli (§5.4). [09]
- **Lead formu silinemiyor, yalnız arşivleniyor**; Messenger lead reklamları v24'ten beri API'den
  kurulamıyor; lead OKUMAK ayrı yetki (`leads_retrieval` + App Review). [06]
- **Insights sessiz boşlukları**: 13 aydan eski kırılımlı sorguda `reach` yok, saatlik kırılımda `reach`
  0, bazı kırılımlar opt-in istemeyen hesapta hatasız boş (2026-08-06). "Veri yok" ile "erişim yok"
  ayrılmalı (`emptyReason`). [01, 04]
- **Dönüşüm kampanyası olayın "var olmasıyla" değil yakın zamanda GELMESİYLE çalışır** ve Meta bunu
  hata olarak söylemiyor. Kontrol Advetics'te, yayından önce (08'deki 17 maddelik liste). [08]
- **İnşaat/emlak müşterileri için: konut reklamı = `HOUSING` beyanı** — yalnız katalog reklamında değil,
  form ya da WhatsApp reklamı da konut satıyorsa. Açıkken yaş 18–65+ sabit, cinsiyet yok, lookalike
  yok, konum hariç tutma yok, şehir/pin yarıçapı alt sınırlı — **[Çelişki]** belge "Avrupa'da 15 km,
  ABD/Kanada'da 25 km" diyor, Meta MCP şeması "ABD/Kanada dışında 17 km"; ikisini de karşılayan değer
  17 km; ihlal sert hata (`2909035`). Meta'nın kendi emlak
  örneği bile alanı göndermiyor; `special_ad_category_country` verilmezse hesabın VERGİ ülkesine
  düşüyor; Türkiye'nin kısıt kapsamındaki "Avrupa"ya dahil olup olmadığı belgede tanımsız (§8-12).
  Advetics'te kategori bugün müşteri kartında (`special-category.spec.ts`) — korunacak. [03, 07]
- **Katalog reklamı ön koşullarından biri eksikken HATASIZ kurulup HİÇ teslim edilmiyor** (boş ürün seti,
  20 kişinin altında kitle, `content_ids` ↔ katalog `id` uyuşmazlığı); feed varsayılanları yıkıcı
  (`update_only=false` = dosyada olmayan öğe SİLİNİR, varsayılan ülke/para birimi US/USD); fiyat biçimi
  uca göre değişiyor (dize / kuruş / float — 100 kat hata sessiz); ürün seti etiket filtrelerinde
  İngilizce dışı karakter yasak ("İzmir" etiketli set boş kalabilir). Katalog satışı bu yüzden ilk
  turlarda **Kapalı** (§5.3). [07]
- **Meta'nın kendi Ads MCP'si**: araç envanteri, "oluştur = PAUSED, yayın = ayrı araç + açık onay",
  `advertiser_request` ile asıl isteği kaydetme, `next_actions` tamamlama sözleşmesi, geri okuma
  zorunluluğu. Advetics'in AI katmanlaması bununla birebir örtüşüyor (§6). [01 §2]

---

## 4. Advetics bugün — kısa (ayrıntı: [00](bolumler/00-advetics-mevcut-durum.md))

- **Meta'ya yazan hiçbir yol canlıda çalıştırılmadı.** Tek istisna 13 Ağustos'ta ajansın kendi
  hesabındaki ilk deneme: altı hata, üçü sessiz. Yani bugünkü kod "Meta'nın ne kabul ettiğini" değil "ne
  göndereceğini" anlatıyor.
- **İzin durumu (R4, Meta'nın salt okuma aracıyla 2026-10-06'da okundu):** `ads_management` dahil App
  Review başvurusu **2026-10-01'den beri incelemede**; Business Verification **geçiyor**. `DURUM.md` §6'daki
  "başvurulmadı / yapılmadı" bilgisi bayat. Aynı araç bazı izinlerde ekran kaydı ve API ön kontrolünün eksik
  göründüğünü ve "ileride lazım" izinlerin (katalog, MCP) ret riski taşıdığını gösteriyor — App
  Dashboard'dan kontrol edilmeli (R4 eylem A1–A2). **Canlı doğrulama turu izin onayını beklemek zorunda
  değil:** Standard erişim, uygulamada rolü olan kimliğin kendi varlıklarında çalışıyor; tur ajansın kendi
  reklam hesabında bugün koşulabilir. [R4]
- **Yedi canlı yazma yolu + bir yetim + bir ölü yol**; iki ayrı boost yolu (`boost-executor` korumalı,
  `draft-publish.publishBoost` korumasız).
- **Girişler tekniğe göre bölünmüş:** beş kart (AI, Hızlı, Kampanya Kur, Toplu, Akıllı Boost) + menüde
  ayrıca AI alt öğeleri. Hızlı Reklam yalnız üç amaç biliyor (form / WhatsApp / site).
- **Taslak çıkmaz sokak:** kurulup yayınlanmayan taslağı açacak, yayınlayacak, yeniden deneyecek ekran
  yok; AI'ın "incele ve yayınla" bağlantısı salt okunur listeye gidiyor.
- **Kod okumasıyla bulunan sessiz hata adayları** (canlıda görülmedi, yeni yapımda kapanmalı):
  çoklu kreatifte 2.+ reklam CTA'sız ve `PAUSED` kuruluyor (form/WhatsApp bağı kayboluyor — 13
  Ağustos'un 5. hatası geri gelmiş); uzman modun "Başlangıç" alanı Meta'ya hiç gitmiyor (kampanya
  hemen başlıyor); taslak yayınında `creating` koruması yok (mükerrer kampanya riski); toplam bütçede
  özet yanlış toplam yazıyor; uzman sayfasında üç `.catch(() => [])`.
- **Sağlam ve korunacak çekirdek:** `goal-mapping.ts` (amaç → Meta eşlemesi), `objective-matrix.ts`
  (izin listesi), tek hedefleme üreticisi `metaTargetingFrom`, `advantage_audience: 0`, `actPath()`,
  micros dönüşümü, WhatsApp ve form kuralları, video yolu, transaction dışı çalıştırıcı + `creating`
  (boost'ta), kitle şablonu, yasal uyarı kapısı. Her biri testle kilitli — liste 00 §12.1'de.
- **AI asistan çalışıyor ama taslakta duruyor:** 14 araç, tek kullanımlık onay kartı (duraklat /
  sürdür / bütçe / boost), sohbetten yayın (plan FAZ 2) yazılmadı. Kitle önerisi ve "AI ile yaz" tek
  atışlık yardımcılar. Model `claude-sonnet-5` (yapılandırılabilir).
- **Kullanıcı Meta hesaplarını 2026-09-23'ten beri Meta'nın Ads MCP'siyle de yönetiyor**: iki yazma
  kaynağı var, panel MCP'den yapılan değişikliği gecikmeli görüyor.

---

## 5. Yeni kampanya kurma mantığı

### 5.1. Omurga: tek taslak, tek derleyici, tek yayın yolu, üç yüz

```
  Panel (Acemi) ─┐
  Panel (Gelişmiş)├─► TASLAK (Advetics'te) ─► ÖN KOŞUL ─► DERLEYİCİ ─► PROVA ─► [ONAY] ─► YAZ (PAUSED) ─► GERİ OKU ─► AÇ (ACTIVE) ─► İZLE
  AI sohbeti ────┘         ▲                   (sıfır     (niyet →     (validate_only,          (sırayla,       (gönderilen    (yukarıdan
                           │                    çağrılı    Meta gövdesi, sentencelines,          tx dışı,        = kaydedilen?)  aşağı)
                           └──── her yüzden açılır, düzenlenir, yayınlanır, yeniden denenir ────────────────────────────────────────────┘
```

- **Taslak Advetics'te yaşar, Meta'ya yayın onayına kadar GİTMEZ.** Önizleme (`generatepreviews`) ve
  doğrulama (`validate_only`) Meta'da nesne açmadan yapılabiliyor; Meta'da `PAUSED` duran yarım
  nesneler "taslak" değildir, müşterinin Ads Manager'ında görünen çöp olur.
- **Üç yüz, tek taslak:** Acemi panel, Gelişmiş panel ve AI sohbeti aynı taslak modelini okur/yazar.
  Taslak her yüzden açılabilir; bugünkü "çıkmaz sokak" (00 §11 #7) böyle kapanır.
- **Tek derleyici:** niyet + seçimler → Meta istek gövdeleri. `goal-mapping.ts` + `objective-matrix.ts`
  + `metaTargetingFrom` + kreatif kurucu tek modülde, saf fonksiyonlar, §2 manifestosuna karşı testli.
  Bugün iki kreatif kurucu var ve ayrışmış (00 §11 #2) — biri kalacak.
- **Tek yayın yolu:** boost dahil her yazma aynı durum makinesinden geçer (§5.7).

### 5.2. Taslağın taşıdığı bilgi

| Grup | Alanlar | Nereden |
|---|---|---|
| Kim için | workspace, reklam hesabı, sayfa, IG hesabı, (gerekirse) pixel/olay, form | Seçim listeleri (API'den okunmuş kimlikler; serbest metin yok) |
| Ne istiyor | **niyet satırı** (§5.3) | Kapalı sözlük |
| Ne kadar / ne zaman | tutar + tip (günlük / toplam) + başlangıç + bitiş | Kullanıcı; aylık rakam ÇEVRİLMEZ, sorulur |
| Kime / nerede | konumlar (kova türüyle), yaş, cinsiyet, ilgi/özel kitle (Gelişmiş), "sınırlı mı" kararı | Kullanıcı + kitle şablonu (taslağa KOPYA) |
| Ne gösterecek | medya, ana metin, başlık, açıklama, hedef adres / mevcut gönderi | Kullanıcı / AI önerisi / varlık arşivi |
| Beyanlar | özel reklam kategorisi (evet/hayır + hangisi), yapay zekâ içerik beyanı, yasal uyarı | Kullanıcı (tahmin edilmez) + Marka Merkezi |
| Kanıt | ön koşul sonuçları, prova sonucu, onaylayan + asıl cümlesi + onaylanan fark, Meta'nın geri okunan değerleri | Sistem |

### 5.3. Niyet sözlüğü (kapalı) — "Bu reklamdan ne istiyorsun?"

06'daki 19 satırlık tablonun Acemi'ye açılacak kısmı, bugünkü `goal-mapping.ts` ile yan yana. Satırın
dışına çıkılamaz; AI de yalnızca satır NUMARASI seçer, alan üretmez. **Tablodaki değerler belgeden;
canlıda doğrulanmadı.**

| # | Kullanıcının cümlesi | `objective` | `optimization_goal` | `destination_type` | `promoted_object` | CTA | Bugün kodda | Önerilen durum |
|---|---|---|---|---|---|---|---|---|
| 1 | "Form doldursunlar" | `OUTCOME_LEADS` | `LEAD_GENERATION` | `ON_AD` | `page_id` | `SIGN_UP` + `lead_gen_form_id` | Aynı | Acemi |
| 2 | "WhatsApp'tan yazsınlar" | `OUTCOME_LEADS` (kod) / `OUTCOME_ENGAGEMENT` (belge önerisi) | `CONVERSATIONS` | `WHATSAPP` | `page_id` | `WHATSAPP_MESSAGE` + `app_destination` | LEADS ile | Acemi — **[Karar]** amaç |
| 3 | "Siteme gelsinler" | `OUTCOME_TRAFFIC` | `LANDING_PAGE_VIEWS` | `WEBSITE` | — | `LEARN_MORE` | `destination_type` **gönderilmiyor** | Acemi — `WEBSITE` açıkça |
| 4 | "Messenger'dan yazsınlar" | `OUTCOME_ENGAGEMENT` | `CONVERSATIONS` | `MESSENGER` | `page_id` | `MESSAGE_PAGE` + `app_destination` | Yok (uzmanda kısmen) | Acemi (2. tur) |
| 5 | "Instagram'dan mesaj atsınlar" | `OUTCOME_ENGAGEMENT` | `CONVERSATIONS` | `INSTAGRAM_DIRECT` | `page_id` | `INSTAGRAM_MESSAGE` + `app_destination` | Yok | Acemi (2. tur) |
| 6 | "Nereden olursa yazsınlar" | `OUTCOME_ENGAGEMENT` | `CONVERSATIONS` | `MESSAGING_*` (bağlı kanallar) | `page_id` | kanal başına | Yok | Acemi (3. tur) |
| 7 | "Beni arasınlar" | `OUTCOME_TRAFFIC` (06) / `OUTCOME_LEADS` (02) | `QUALITY_CALL` | `PHONE_CALL` | belgede belirsiz | `CALL_NOW` + `tel:` (Sayfa'dan) | Yok | Acemi (2. tur) — **[Karar]** amaç |
| 8 | "Paylaşımımı öne çıkar" | `OUTCOME_ENGAGEMENT` | `POST_ENGAGEMENT` | `ON_POST` | — | — | Boost yolu | Acemi (Akıllı Boost ile tek yol) |
| 9 | "Sitemden satış/kayıt gelsin" | `OUTCOME_SALES` / `OUTCOME_LEADS` | `OFFSITE_CONVERSIONS` | `WEBSITE` | `pixel_id` + `custom_event_type` | `SHOP_NOW` (satış) / `LEARN_MORE` (kayıt) | Uzmanda | Acemi **yalnız ölçüm hazırsa** (§5.4, 08) |
| 10 | "Daha çok kişi görsün" | `OUTCOME_AWARENESS` | `REACH` | — | `page_id` | `LEARN_MORE` | Uzmanda | Acemi (2. tur) |

Gelişmiş'e açılacaklar (06): çağrı istemli WhatsApp, siteye + mesaj uzantısı, uygulama yükleme, yerel
reklam (yarıçap), WhatsApp Durum / Threads / Audience Network değiştiricileri, geri arama formu.
**Kapalı** (yazma kodu + canlı doğrulama gelmeden arayüzde görünmez): profil ziyareti (API "sınırlı
erişim"), Messenger lead/abonelik, etkinlik, uygulama içi olay, omnichannel, partnership, katalog
satışı (07), dinamik kreatif. `CLAUDE.md`'nin "kasıtlı olarak dar kalan listeler" ilkesi aynen geçerli.

### 5.4. Ön koşullar — platforma gitmeden, sıfır çağrılı ret önce

Sıra önemli: maliyeti sıfır olan kontrol önce, ucuz okuma sonra, platform yazması en son
(`CLAUDE.md` "önce kontrol, sonra çağrı"). Her madde üç hâlli döner: **geçti / kaldı (sebep + ne
yapmalı) / bilinmiyor (neden okunamadı)** — RLS ya da izin yüzünden görülemeyen şey "yok" sayılmaz.

1. **Hesap:** `account_status == 1` (UNSETTLED, PENDING_RISK_REVIEW, IN_GRACE_PERIOD… Türkçe cümleyle),
   `funding_source` var (yoksa "kurulur ama yayınlanmaz"), `spend_cap` doluluğu, `min_daily_budget`. [09]
2. **İzin üçlüsü** (09 §Panel): (a) kimliğin hesapta `ADVERTISE`/`MANAGE` görevi (`ANALYZE` = yalnız
   rapor; o hesapta yazma yolu açılmaz), (b) kimliğin sayfada `ADVERTISE` görevi (doğrudan ya da
   `business_asset_groups` üzerinden), (c) token'da `pages_manage_ads`. Hangisi eksikse O söylenir.
3. **Sayfa / IG:** sayfa `promote_pages` listesinde; IG hesabı bu hesabın IG listesinde ve bu sayfaya
   bağlı (`instagram_user_id` ↔ `page_id`). [05, 09]
4. **Niyete özel:** form → sayfa `leadgen_tos_accepted` + gizlilik politikası adresi (Marka Merkezi);
   WhatsApp → sayfaya bağlı numara var; satış/kayıt → 08'deki ölçüm listesi (pixel hesaba paylaşılmış,
   `is_unavailable=false`, seçilen olay son 7 günde gelmiş, açılış alan adında çalışıyor); olay
   gelmiyorsa **sessizce üst huni olayına düşülmez**, kullanıcıya seçenek sunulur. [06, 08]
5. **Bütçe:** hesap minimumu (`minimum_budgets` / `min_daily_budget`) ve para birimi; toplam bütçede bitiş
   tarihi; günlük bütçede süre > 24 saat. [02, 09]
6. **Beyanlar:** özel kategori cevabı verilmiş; yapay zekâ içerik beyanı verilmiş; yasal uyarı ana metinde.
7. **Hesap sağlığı:** `deprecatedtargetingadsets` (seçilen hedefleme kalkan bir seçenek mi), özel kitle
   `delivery_status` (300 = küçük) ve `operation_status` (471 = bütünlük işareti). [03, 09]

### 5.5. Derleyici — niyetten Meta gövdesine

- Girdi: taslak. Çıktı: dört istek gövdesi (kampanya, ad set, kreatif, reklam) + "açıkça yazılan alanlar"
  listesi. Saf fonksiyon, platform çağrısı yok.
- **Manifesto testi:** §2'deki her alan çıktıda VAR mı ve beklenen değerde mi — tek tablo-tabanlı test.
  Bir alan eksik kalırsa test düşer (bugün `destination_type`'ın site amacında eksik olması gibi).
- Hedefleme tek üreticiden (`metaTargetingFrom`): kovalar birleşim, il + o ilin ilçesi seçilirse ilçe
  düşürülür ve kullanıcıya söylenir; konum yoksa TR; `age_max` 65 = "65+" gönderilmez; özel kategoride
  kısıtlar en son uygulanır (yarıçap TR'de ≥ 17 km — belge 15, MCP 17 diyor; büyüğü iki kuralı da
  karşılar). **Türkiye ilçe türleri** (`subcity`, `*_geo_area`)
  hangi kovaya yazılır — belgede yok; tanınmayan tür sessizce elenmez, durur ve sorar. [03]
- Kreatif tek kurucudan: niyet satırının CTA'sı HER varyant reklama aynı biçimde uygulanır (bugünkü
  2.+ reklam hatası). Metin sınırları (IG 2.200, karışık yerleşimde aşan metin IG'de sessizce
  gösterilmiyor) derlemede değil girişte de uygulanır (§7). [05]

### 5.6. Prova — Meta'ya göster ama nesne açma

1. `execution_options=["validate_only","synchronous_ad_review"]` ile dört gövdeyi doğrulat (bütünlük
   incelemesi dahil). Hata varsa Meta'nın kendi metni (`error_user_title`, `error_user_msg`,
   `blame_field_specs`) ilgili alanın yanında gösterilir. "Beklenmeyen bir hata oluştu" yasak.
2. `targetingsentencelines` → "Meta bu reklamı şu kişilere gösterecek:" (Meta'nın kendi cümlesi).
3. `reachestimate` / `delivery_estimate` → tahmini kitle; `-1` = "tahmin yok", sıfır değil.
4. `generatepreviews` → yerleşim başına önizleme (en az akış, IG akış, IG hikâye, Reels); iframe
   saklanmaz, her açılışta yeniden istenir.

### 5.7. Yazma — durum makinesi

- Sıra: kampanya → ad set → (görsel/video yükleme) → kreatif → reklam; **hepsi `PAUSED`**; platform
  çağrıları transaction DIŞINDA (`TxRunner`), aralarda kısa transaction'larla durum yazılır.
- Durumlar: `taslak → doğrulandı → kuruluyor (creating) → kuruldu (PAUSED) → yayında → (durduruldu |
  arşivlendi)`, yan dallar `kurulamadı (yeniden denenebilir)` ve `kayıt yazılamadı (yeniden denenemez,
  insan bakar)`. `CLAUDE.md` kuralı: kayıt yazılamazsa `failed` değil `creating` kalır — ikinci kampanya
  açmak para harcayan mükerrerlik. Bugün taslak yolunda bu yok (00 §11 #6).
- Kısmi başarıda (kampanya açıldı, ad set düştü) açılan nesnelerin kimlikleri kaydedilir, ters sırada
  geri alma ya da "kaldığı yerden devam" seçilir; sessizce yarım bırakılmaz.
- Advetics'in açtığı her nesneye sabit bir `adlabels` etiketi: MCP / Ads Manager değişikliklerini
  `activities` ile karşılaştırırken "bunu biz mi kurduk" sorusunun cevabı. [09]

### 5.8. Geri okuma — "200 döndü" doğrulama değil

Yazmadan hemen sonra (yayından ÖNCE) şunlar okunur ve gönderilenle karşılaştırılır; fark varsa yayın
durur ve fark kullanıcıya gösterilir:

| Okunacak | Neden |
|---|---|
| ad set `optimization_goal`, `destination_type`, `billing_event`, `bid_strategy` | Listede olmayan hedefin sessizce değiştirilmesi; bid_strategy varsayılanı |
| `targeting.targeting_automation`, `targeting_relaxation_types`, `targeting_optimization_types` | Advantage+ kitle / özel kitle / ayrıntılı hedefleme sessiz genişlemesi |
| kampanya `advantage_state_info` | Sessizce Advantage+ sayılma |
| kreatif `degrees_of_freedom_spec`, `contextual_multi_ads`, IG kimliği (`effective_instagram_media_id` — benzeri benzerle: yazdığın alanın yankısı) | Sessizce silinen `OPT_IN`, yanlış gönderiye bağlanma |
| `effective_status`, `issues_info`, `learning_stage_info` | Gerçek durum ve yayını engelleyen sorunlar |
| `targetingsentencelines` (yeniden) | Kaydedilen hedeflemenin Meta yorumu |

### 5.9. Yayın ve sonrası

- Yayın **ayrı ve onaylı** adım: yukarıdan aşağı `ACTIVE` (kampanya → ad set → reklam; üst nesneyi
  açmak alttakileri açmaz). "Meta'ya iletildi" (`IN_PROCESS`, `PENDING_REVIEW`) ile "yayında" ayrı
  etiketler. [01 §2.2]
- Sonrası: `effective_status`/`with_issues_ad_objects` webhook'ları (reddedilme, sorun) → AI'ın
  proaktif önerisi; `deprecatedtargetingadsets` periyodik; `activities` ile dış değişiklik izi;
  öğrenme aşaması rozeti; ilk 28 gün rakamların "kesinleşmemiş" olabileceği notu. [01, 04, 09]

---

## 6. Yapay zekâ ile yönetim

### 6.1. Mimari — bugünkü karar korunuyor, Meta'nın MCP'si referans

Karar (`docs/AI-ASISTAN-PLANI.md`, hafızadaki tasarım notu): panel içi sohbet, Claude tool-calling,
araçlar Advetics servislerini çağırır; RLS, RBAC, eşleme katmanı, bütçe bekçisi aynen geçerli; ikinci
bir kod yolu açılmaz. Belge bunu değiştirecek bir şey söylemiyor; tersine, Meta'nın kendi Ads MCP'si
aynı katmanlamayı kullanıyor (01 §2). **Meta MCP'sini doğrudan kullanmanın sakıncaları:** kişisel OAuth
ya da kullanıcı token'ı istiyor, hesap başına `is_ads_mcp_enabled` var, ajans havuzu modelinde
davranışı belgede yok, çağrılar Advetics'in RLS'inden / onay kaydından / bütçe bekçisinden geçmiyor.
**Öneri [Karar]:** araçlar Advetics'te kalır; MCP'nin Marketing API'de karşılığı olmayan salt okuma
analizleri (`ads_insights_anomaly_signal`, `_industry_benchmark`, `_auction_ranking_benchmarks`,
`_advertiser_context`, `ads_get_opportunity_score`) ileride "Meta'nın yorumu" etiketiyle O katmanında
değerlendirilir.

### 6.2. Araç katmanları

| Katman | Ne | Örnek araçlar (bölümlerden birleşik) | Onay |
|---|---|---|---|
| **O — salt okuma** | Advetics verisi (tazelik damgasıyla) + Meta okumaları | `hesap_durumu`, `reklam_yetkisi` (izin üçlüsü), `olcum_hazirlik_kontrolu`, `konum_ara` / `ilgi_ara` (dönen `type` aynen), `hedefleme_ozeti`, `erisim_tahmini`, `onizleme`, `durum_teshis` (`effective_status`/`issues_info`/öğrenme), `degisiklik_gecmisi` (`activities`), `advantage_durumu_oku`, `insights_getir` (kırılım kapalı sözlükten), `ozel_kitle_listele`, `alan_sozlugu` | Yok |
| **T — taslak** | Advetics taslağına yazar; Meta'ya GİTMEZ | `taslak_olustur` / `taslak_guncelle` (niyet satırı numarası ile), `kreatif_hazirla` (metin + medya doğrulama), `kuru_dogrulama` (`validate_only`), `plan_goster` | Yok (para harcamaz) |
| **C — onaylı canlı** | Meta'da para, yayın, kalıcı değişiklik, kişisel veri | `yayina_al`, `durdur` / `devam_ettir`, `butce_degistir`, `takvim_degistir`, `hedefleme_degistir` / `kreatif_degistir` (yeniden inceleme uyarısı), `arsivle`, `kopyala` (`status_option=PAUSED`), `form_olustur` (silinemez), `ozel_kitle_olustur` / `uye_yukle` / `sil` (kullanan ad set'ler listelenir), `test_kur`, `boost` | **Her biri ayrı onay** |
| **Hiç verilmez** | Geri dönüşsüz ya da hukuki | toplu kampanya silme (`delete_strategy`), `status=DELETED`, özel kitle şartlarını kabul (`customaudiencestos`), Business uçları (sahiplenme, ilişki koparma, `assigned_users`), hesap `spend_cap`, `account_controls`, Meta kural motoruna yazma | — |

### 6.3. Onay bir sözleşme, bir düğme değil

Meta'nın MCP kurallarından Advetics'e birebir alınacaklar [01 §2.4]:
1. Onaydan ÖNCE tam plan: çözülmüş bütün ayarlar, varsayılanlar dahil (§2 manifestosunun okunur hâli);
   canlı nesnede eski → yeni farkı.
2. Onay NESNEYE ve DEĞERE bağlı, tek kullanımlık (bugünkü onay kartı + PK kilidi korunur).
3. Kayıtta kullanıcının **asıl cümlesi** (Meta'nın `advertiser_request` alanı gibi; "evet" değil, ilk
   isteğin kendisi) + onaylanan fark + kim/ne zaman (denetim izi).
4. "Hataya rağmen yayınla" yalnızca kullanıcı hataları GÖRDÜYSE.
5. Yan etkiler onay ekranında: "bu kitleyi kullanan 3 ad set otomatik durur", "bu değişiklik reklamı
   yeniden incelemeye sokar", "bu saatte 1 bütçe değişikliği hakkın kaldı".
6. Onaydan sonra geri okuma ve Meta'nın döndürdüğü değerin raporu (§5.8).

### 6.4. Kapalı sözlükler (tek kaynak: `packages/shared` Zod şemaları)

`objective` (6) · niyet satırları (§5.3) · `optimization_goal` (amaca göre alt küme) · `destination_type` ·
`billing_event` · `bid_strategy` (4) · `call_to_action.type` + `app_destination` · `special_ad_categories`
(`NONE, EMPLOYMENT, HOUSING, FINANCIAL_PRODUCTS_SERVICES, ISSUES_ELECTIONS_POLITICS,
ONLINE_GAMBLING_AND_GAMING`; `CREDIT` emekli) · `status` · yerleşim adları (kalkanlar hariç) ·
`date_preset`, `breakdowns` (izinli birleşimler; `7d_view`/`28d_view` hariç) · `custom_event_type` ·
`action_source` · `account_status`/`disable_reason` → Türkçe metin tablosu · `ad_format` (önizleme).
Alan sözlüğü aracı (`ads_get_field_context` benzeri) bu şemalardan üretilir; model alan adı uyduramaz.

### 6.5. AI'ın asla tahmin etmediği şeyler

- **Bütçe tutarı ve tipi.** "Ayda 20 bin" ne günlük ne toplamdır: sorar, bekler. Varsayılan bir tutarla
  "onaya sunmak" da yasak (Meta MCP kuralı).
- **Para birimi çarpanı** — AI "500 TL" der, kuruşu kod hesaplar; ROAS'ı ondalık verir, ×10.000'i kod yapar.
- **Konum** — boşsa sorar (Meta'nın kendi boost varsayılanı ABD!); kova türü arama yanıtından.
- **Kimlikler** — sayfa, IG, pixel, form, ilgi alanı, özel kitle, medya: yalnız o konuşmada bir okuma
  aracının döndürdüğü kümeden. Araç şeması serbest dizgeyi reddeder.
- **Özel reklam kategorisi** — AI sinyal görürse sorar; karar kullanıcının (yasal beyan).
- **Yapay zekâ içerik beyanı** (`self_ai_disclosure`) — sonradan değişmez, sorumluluk reklamverende.
- **Advantage+ özelliklerinin açılması** (kitle, creative, öneri uygulama) — workspace'in kayıtlı onay
  listesinden; AI açamaz.
- **Atıf penceresi** — Advetics standardı; AI değiştirmez.
- **Yayın zamanı** — "hemen" varsayılmaz.
- **Ölçümün hazır olduğu** — her zaman `event_last_fired_time` / `recent_events` ile ölçülür.

### 6.6. Platform sınırları araçta, prompt'ta değil

Araç bu durumları platforma gitmeden reddeder (sıfır çağrılı ret) ve sebebini modele yapılandırılmış
döner: ad set bütçesi saatte 4 değişiklik (sayaç araçta); Meta önerisi "günde en fazla 2–3 kez, günün
erken saatinde" (aynı nesneye gün içinde ardışık değişiklik önerilmez); CBO'da yayından sonra
`optimization_goal` değişmez; Min ROAS'tan çıkılamaz; bütçe paylaşımı yayın ortasında açılamaz ve
açıkken strateji değişmez; 70+ ad set'li kampanyada strateji/CBO değişmez; dayparting yalnız toplam
bütçede; bütçe düşürülürken yeni değer harcananın ≥ %10 üstünde. **"Hangi değişiklik öğrenme aşamasını
sıfırlar" listesi belgede YOK** — AI kural uydurmaz, "teslimatı geçici etkileyebilir" der. [04]

### 6.7. Araç yanıt sözleşmesi

- Sonuç türü: `success | failed | partial | pending_confirmation` (bugünkü yapı korunur).
- Hata: kod + subcode + `error_user_title` + `error_user_msg` + `blame_field_specs` + `is_transient`.
  Ayırt edici anahtar kod/subcode; Meta açıklama metnini haber vermeden değiştirebiliyor. [01 §1.8]
- **Tamamlama listesi** (Meta'nın `next_actions`'ı gibi): okuma aracı "cevap vermeden önce şunları da
  çağır" listesini `read_only` ve `requires_user_confirmation` bayraklarıyla döndürebilir; model okuma
  adımlarını kendisi koşar, yazma adımlarını öneri olarak sunar. "Önce sor" kuralı prompt'a değil veriye
  yazılır.
- Boş sonuç NEDENİYLE döner (`emptyReason`): "bu hesapta IG yok" ile "izin yok" ile "Meta bu dönem için
  erişim vermiyor" ayrı.

### 6.8. Proaktif yönetim

- Tetikleyiciler: `with_issues_ad_objects` / `effective_status` webhook'ları (ret, sorun), Advetics'in
  kendi `insights_daily` tabanlı uyarıları (AI planı FAZ 4 — eşik yoksa uyarı yok), `deprecatedtargetingadsets`.
- AI önerir (T katmanında hazırlar), kullanıcı onaylar (C). Kalıcı otomasyon gerekiyorsa "bunu kural
  yap" → **Advetics'in kural motoru**. Meta'nın yerleşik kural motoru (`adrules_library`) kullanılmaz:
  güncellemede tam gövde istiyor, sayaç varsayılanı sınırsız, örtük süzgeçler ekliyor, `REBALANCE_BUDGET`
  bağışçı ad set'leri durduruyor, tetikli kurallar Ads Manager'da görünmüyor ve iki motor aynı bütçeye
  yazarsa birbirini ezer. [04]

---

## 7. Panelin baştan yapım kurgusu

### 7.1. Neden baştan

Kullanıcının cümlesi "karmakarışık"; kanıtları 00 §11'de (19 madde). Özü: **girişler tekniğe göre
bölünmüş** (elle / kural / tablo / sohbet), aynı işi yapan iki yol var (iki boost, iki kreatif kurucu,
iki çoğaltma, iki hedefleme varsayılanı), taslak bir kez kurulunca açılamıyor ve kod okumasıyla
bulunan sessiz hatalar ayrışan üreticilerden doğmuş. Belge buna bir şey daha ekliyor: Meta'nın
sorduğu soru "hangi teknik" değil **"ne istiyorsun"** ve Meta'nın kendi aracı da öyle soruyor.

### 7.2. İlkeler

1. **Tek giriş, niyetle başlar.** "Reklam Oluştur" → "Bu reklamdan ne istiyorsun?" (§5.3 satırları).
   Akıllı Boost ayrı menü değil, 8. satırın ("Paylaşımımı öne çıkar") otomatik hâli.
2. **Acemi varsayılan, Gelişmiş aynı ekranda açılır.** Ayrı sayfa değil, aynı taslağın ek alanları
   (`CLAUDE.md` ürün kararı: "Gelişmiş modu ayrı sayfa değil").
3. **Giriş anında doğrulama** — 05'teki medya/metin tablosu, bütçe minimumu, izin üçlüsü, ölçüm hazırlığı
   bırakıldığı/seçildiği anda; düğme kapalıysa sebebi yazılı.
4. **Meta'nın yorumu yayından önce ekranda** (§5.6): hedefleme cümlesi, tahmini kitle, yerleşim
   önizlemeleri, Meta'nın doğrulama sonucu.
5. **Sessiz olan her şey söylenir:** "otomatik yerleşim", "günlük bütçe bazı günler %75'e kadar aşılabilir,
   haftalık toplam korunur", "Meta bu hedefte ilgi alanlarını genişletebilir", "65 = 65 ve üzeri",
   "bu değişiklik yeniden incelemeye sokar".
6. **Hata yutulmaz** (`.catch(() => setX([]))` yasak): "henüz aramadım / arıyorum / sonuç yok / çağrı
   düştü" dört ayrı hâl; platform hatası Meta'nın metniyle.
7. **Taslak her zaman açılabilir** — liste satırından düzenle / yayınla / yeniden dene; yayınlanmış olan
   için "kaynaktan yeni" (çoğaltma tek kavram).

### 7.3. Akış (Acemi)

| Adım | Kullanıcı ne görür / ne yapar | Arkada |
|---|---|---|
| 1. Kim için | Workspace + reklam hesabı (durum rozetiyle; sorunlu hesapta "Reklam Oluştur" kapalı ve sebebi yazılı); sayfa ve IG listeden | §5.4 madde 1–3 |
| 2. Ne istiyorsun | 6–10 büyük kart (§5.3 Acemi satırları); seçilemeyen kartta sebep ("WhatsApp numarası sayfaya bağlı değil") | Niyet satırı → objective/goal/destination/CTA |
| 3. Kime, nerede | İl/ilçe arama (ülke yalnız "bütün Türkiye" düğmesi; il + ilçe çakışma uyarısı), yaş (65+), cinsiyet, kitle şablonu hazır seçili; tek soru: "Bu kişilerle sınırlı kalsın mı?" | `metaTargetingFrom`, `advantage_audience` |
| 4. Ne kadar, ne zaman | Günlük / toplam, tutar (hesap minimumu canlı), başlangıç, bitiş; %75 notu | Bütçe alanları alt birime koddan |
| 5. Ne göstereceksin | Medya bırak (anında doğrulama + kırpma önizlemesi) ya da paylaşılmış gönderi seç (uygun olmayanlar soluk + sebep); ana metin (2.200 sayaç), başlık; "AI ile yaz" | 05 tablosu, `boost_eligibility_info` |
| 6. Beyanlar | Özel kategori (evet/hayır), yapay zekâ içerik beyanı; yasal uyarı otomatik eklenir ve gösterilir | §5.4 madde 6 |
| 7. Meta'ya göster | Hedefleme cümlesi, tahmini kitle, yerleşim önizlemeleri, doğrulama sonucu (Meta'nın metniyle) | §5.6 prova |
| 8. Yayınla | Tam plan (çözülmüş ayarlar) + tek onay | §5.7 yazma → §5.8 geri okuma → fark yoksa aç; fark varsa dur ve göster |
| 9. Sonra | "Meta'ya iletildi / incelemede / yayında / sorun var" durumları; öğrenme rozeti | §5.9 |

**[Karar]** 8. adım tek onay mı ("Yayınla" = PAUSED kur + geri oku + aç) yoksa iki onay mı ("Meta'ya kur"
+ "Yayına al")? Öneri: **tek onay**, ama geri okumada fark çıkarsa açma adımı kendiliğinden durur ve
ikinci bir onay ister.

### 7.4. Acemi / Gelişmiş / Kapalı matrisi (bölümlerden birleşik)

| Konu | Acemi | Gelişmiş | Kapalı |
|---|---|---|---|
| Amaç | Niyet kartları | objective + optimization + destination (izin listesiyle) | eski amaçlar, `RESERVED` |
| Hedefleme | il/ilçe, yaş, cinsiyet, kitle şablonu, "sınırlı mı" | ayrıntılı hedefleme (`flexible_spec` VE/VEYA), dil, cihaz/OS, yarıçap (km sabit), konum hariç tutma, benzer kitle oranı | — |
| Yerleşim | Karar (§8) ve ekranda söylenir | manuel liste, `placement_soft_opt_out`, WhatsApp Durum / Threads / AN | kalkan yerleşimler |
| Bütçe/teklif | günlük/toplam, tarih | CBO/ABO, teklif stratejisi + tutar, harcama sınırları, dayparting (toplam bütçede), frekans (REACH/THRUPLAY) | `daily_imps` vb. |
| Kreatif | tek görsel/video, gönderi, karusel (2. tur) | çoklu medya, yerleşime göre medya, çok dilli, Advantage+ creative (müşteri onayına bağlı, rozetli) | `translate_voiceover`, `image_background_gen` (şimdilik) |
| Ölçüm | otomatik pixel/olay (tekse), hazırlık rozeti | olay/özel dönüşüm seçimi, değer optimizasyonu, `attribution_spec` | CAPI'ye olay gönderme (ayrı ürün kararı) |
| Diğer | — | UTM düzenleme, etiketler, kopyalama seçenekleri | profil ziyareti, partnership, omnichannel, Threads, etkinlik, katalog satışı |

### 7.5. Durum ve hata dili

- Hesap: `account_status`/`disable_reason` → Türkçe cümle ("Ödenmemiş bakiye var", "Risk
  incelemesinde"); ödeme yöntemi yoksa yayın düğmesi kapalı ve sebebi yazılı. [09]
- Nesne: `effective_status` Türkçe karşılığı; `issues_info` Meta'nın metniyle; ret sebebi
  `ad_review_feedback`; "öğreniyor" rozeti; "Meta kitlenizi genişletiyor" notu. [02]
- Raporda: "Rakamlar her reklam setinin kendi atıf ayarıyla, Ads Manager'daki gibi"; 13 aydan eski
  kırılımda "Meta bu dönem için erişim vermiyor"; saatlikte erişim sütunu gizli; silinmiş reklamların
  toplama dahil, listede yok olduğu notu. [01, 04]

### 7.6. Panel ve AI aynı şeyi söyler

AI sohbeti taslağı panelin kullandığı alanlarla doldurur; sohbet sonunda "Taslağı aç" bağlantısı
gerçekten DÜZENLENEBİLİR taslağa gider. AI'ın sorduğu sorular panelin sorduklarıyla aynıdır (Eksen 1:
form neyi soruyorsa sohbet de onu sorar), yapısal kararlar (müşteri, hesap, bütçe tipi, para birimi,
konum) sorulmadan geçilmez, yaratıcı kararlar (metin, görsel seçimi) üretilip taslağa konur (Eksen 2).
Kısmi cevapta kalan eksikler tekrar sorulur.

---

## 8. Karar bekleyen sorular

| # | Soru | Seçenekler | Öneri |
|---|---|---|---|
| 1 | `ads_management` başvurusu ve Business Verification | — | **Güncellendi (R4):** başvuru 2026-10-01'den beri incelemede, BV geçiyor. Eksik ekran kaydı / fazla izin App Dashboard'dan kontrol edilmeli; Tech Provider (erişim doğrulaması) ayrıca başlatılmalı. Canlı tur onayı beklemeden ajansın kendi hesabında yapılabilir |
| 2 | Taslak Meta'ya ne zaman gider | yalnız yayında / taslakta PAUSED | **Yalnız yayında** (§5.1) |
| 3 | Yayın onayı | tek / iki adım | **KARAR: tek adım.** Geri okumada fark çıkarsa açma durur ve fark gösterilir |
| 4 | Advantage+ kitle | hep kapalı / Gelişmiş'te açılabilir / niyete göre | **KARAR: açık** (`advantage_audience: 1` açıkça); yaşın öneri olduğu ekranda söylenir |
| 5 | Yerleşim | Advantage+ (otomatik) / Advetics'in açık listesi | **KARAR: Advantage+ (otomatik)**; panelde söylenir, medya kare + dikey ister |
| 6 | Advantage+ creative | hepsi kapalı / workspace onayıyla | **Hepsi `OPT_OUT`**, müşteri onayı workspace ayarında kayıtlı olursa Gelişmiş'te açılır |
| 7 | Atıf standardı (`attribution_spec`) | 7g tık + 1g görüntüleme / 7g tık / 1g tık | **7g tık + 1g görüntüleme** (Ads Manager varsayılanı; rapor müşterinin gördüğüyle tutar) — açıkça yazılarak |
| 8 | WhatsApp niyetinin amacı | `OUTCOME_LEADS` (bugün) / `OUTCOME_ENGAGEMENT` | İkisi de geçerli; canlı turda ikisi de PAUSED kurulup okunsun, karar ondan sonra |
| 9 | "Beni arasınlar" amacı | `OUTCOME_TRAFFIC` / `OUTCOME_LEADS` | Aynı: canlı turda ölç |
| 10 | Sohbetten yayın (AI planı FAZ 2) | evet (onay kartıyla) / hayır (panelden) | **KARAR: evet, onay kartıyla** — onay sözleşmesi §6.3 |
| 11 | Meta MCP'nin analiz araçları | kullan (O katmanı) / kullanma | Şimdilik **kullanma**; sonra "Meta'nın yorumu" etiketiyle değerlendir |
| 12 | Özel kategori Türkiye'de | kısıtları uygula / uygulama | **KARAR: uygula** (belgede Türkiye'nin "Avrupa" kapsamı belirsiz; tahmin etmektense kısıtla) |
| 13 | Müşteri (şirket admini) doğrudan yayınlayabilir mi (TASARIM K3) | doğrudan / ajans onayı | Açık — ürün kararı |
| 14 | Acemi niyet listesinin ilk turu | 3 (bugünkü) / 6 / 10 | **6**: form, WhatsApp, site, gönderi öne çıkar + canlı doğrulanırsa Messenger ve arama |

---

## 9. Canlı doğrulama turu (en küçük bütçeyle, ajansın kendi hesabında)

Ön koşul: uygulamada rolü olan kimlik + ajansın kendi reklam hesabı (Standard erişim yeterli; App Review
onayı başka işletmelerin hesapları için gerekli — R4). Lead okumak için `leads_retrieval`. `PAUSED` kurulan
nesne para harcamaz; her satır kur → geri oku → arşivle. Sandbox hesaplarında reklam ve kreatif
oluşturulamıyor ve test kullanıcısı oluşturma 2026-04'ten beri kapalı (R4) — tur gerçek hesapta yapılır.

1. Her Acemi niyet satırı (§5.3) için dört nesneyi `PAUSED` kur; `validate_only` sonucuyla gerçek kurulumun
   aynı olduğunu gör; geri okunan alanları §5.8 tablosuyla karşılaştır.
2. Site amacında `destination_type: WEBSITE` kabul ediliyor mu.
3. `advantage_audience: 0` + `custom_audiences` ile kurulan ad set'te `targeting_relaxation_types` ne dönüyor.
4. Hedefleme: Türkiye il/ilçe arama yanıtındaki türler (`city`, `subcity`, `*_geo_area`) ve kovaları;
   `targetingsentencelines` çıktısı.
5. Kreatif varsayılanları: hiçbir şey göndermeden ve açıkça `OPT_OUT` göndererek kurulan iki kreatifte
   `degrees_of_freedom_spec`, `contextual_multi_ads` farkı.
6. Insights: aynı gün `impression`/`conversion`/`mixed` üç çağrı (§3b-1).
7. `instagram_accounts` ile `connected_instagram_accounts` hangisi reklam kimliği olarak geçerli.
8. `roas_average_floor` ölçeği (yalnız Gelişmiş moda girerse).
9. Kampanya `advantage_state_info` — bütçe kampanyada + açık yerleşim listesi ile kurulduğunda.
10. Hata metinleri: kasıtlı hatalı bir kurulumda `error_user_msg` ve `blame_field_specs` gerçekten geliyor mu.

---

## 10. Önerilen aşamalar

| Aşama | İş | Çıktı |
|---|---|---|
| **0 — Ön koşul** | App Review başvurusunun eksikleri + Tech Provider (R4 A1–A2); 27 Ekim öncesi kök `?ids=` düzeltmesi (ayrı görev); sunucu `.env` sürüm kontrolü; `CLAUDE.md` iki düzeltme (§3b-1 atıf, §3b-5 `permalink_url`); `DURUM.md` §6 izin durumu | Erişim yolu net, üretim kırılmıyor |
| **1 — Çekirdek** | Derleyici (tek modül: niyet sözlüğü + eşleme + hedefleme + kreatif kurucu), §2 manifesto testi, ön koşul denetçisi (üç hâlli), geri okuma karşılaştırıcı, yayın durum makinesi (`creating` dahil) | Saf fonksiyonlar + testler; panel yok |
| **2 — Canlı tur** | §9 listesi, ajansın hesabında | Belgeden gelen her "[Belge]" kuralı ya "[Canlı]" olur ya düzeltilir |
| **3 — Acemi panel** | §7.3 akışı, taslak listesi (açılabilir/yayınlanabilir), durum dili | Eski beş kart kalkar; Akıllı Boost niyet satırına bağlanır |
| **4 — AI** | Araç katmanları §6.2 aynı derleyiciye bağlanır; onay sözleşmesi; sohbetten yayın (karar 10'a göre) | AI ile panel aynı taslağı paylaşır |
| **5 — Gelişmiş + ek niyetler** | §7.4 Gelişmiş sütunu; Messenger, IG DM, arama, erişim | Her yeni niyet: yazma kodu + canlı doğrulama + kapalı sözlük satırı |
| **6 — Temizlik** | Ölü/yetim yollar (00 §12.2): eski sihirbaz, `bulk-composer`, `publishBoost`, ikinci kreatif kurucu, ikinci hedefleme varsayılanı | Meta'ya yazan yol sayısı bire iner |

Reklam oluşturma sistemi kullanıcı kararıyla (2026-09-29) DONUK; bu brief o kararı kaldırmıyor, yeniden
yapımın girdisi. Aşama 1'e §8 cevaplanınca geçilir.
