# 05 — Kreatif, Advantage+ creative ve Instagram reklamları

> Kaynak: 37 sayfa (`_listeler/F1-kreatif.txt`) · Okunan: 37/37 · Bilgi belgeden, canlıda doğrulanmadı.
>
> Bu gruptaki örneklerin bir kısmı eski (v18/v19/v21 adresleri, `instagram_actor_id`,
> ODAX öncesi hedef adları). Örnek ile metin çeliştiğinde metni esas aldım ve çelişkiyi
> "Tuzaklar" bölümüne yazdım. Belgede olmayan bir şeyi tahminle doldurmadım; öyle yerler
> "belgede belirsiz" ya da "belgede geçmiyor" diye işaretli.

## Özet: Advetics için ne demek

1. **Gönderilmeyen alan "kapalı" demek değil.** Bu grupta en az dört özellik, alan hiç
   gönderilmezse AÇIK geliyor: `adapt_to_placement` (görseli yerleşime göre uyarlama,
   "Default is opt-in"), `contextual_multi_ads` (reklamın başka reklamverenlerin
   reklamlarıyla birlikte gösterilmesi, 19 Ağustos 2024'ten beri varsayılan `OPT_IN`),
   otomatik ürün etiketleme (`interactive_components_spec`, "enabled by default") ve
   karuselde `multi_share_optimized` (kartların sırasını Meta seçiyor, varsayılan `true`).
   Facebook yerleşimlerinde `use_flexible_image_aspect_ratio` da açık geliyor ve görseli
   ortadan 1:1'e kırpıyor. Beyaz etiketli bir üründe her kreatif bu alanları AÇIKÇA
   yazmalı. Müziğin ve `format_transformation_spec`in varsayılanı belgede belirsiz.
2. **Advantage+ creative markanın görselini ve metnini DEĞİŞTİREBİLİYOR**: görseli AI ile
   genişletme (`image_uncrop`, `video_uncrop`), arka plan üretme (`image_background_gen`),
   görseli hareketlendirme (`image_animation`), AI çıkartma ve yazı katmanı
   (`creative_stickers`, `image_templates`), metin varyasyonu üretme
   (`text_generation`), metni alanlar arasında taşıma (`text_optimizations`), CTA'ya ifade
   ekleme (`enhance_cta`), çeviri ve **konuşmacının sesine benzeyen yapay seslendirme**
   (`translate_voiceover`). Müşteri onayı gerektiren bir konu. Panelde varsayılan
   **hepsi `OPT_OUT`** olmalı, açmak müşteri onayıyla olmalı (aşağıda tablo var).
3. **AI özelliği açık bir reklam `PAUSED` oluşturulmak ZORUNDA.** Sonra önizleme
   (`creative_feature` parametresi) alınıyor, sonra `ACTIVE` yapılıyor. Bu, Advetics'in
   "yayın insan onaylı" kuralıyla birebir örtüşüyor. Meta sorumluluğu açıkça reklamverene
   yüklüyor ve ek bir sözleşme (Ad Creative Generative AI Terms) devreye giriyor.
4. **`OPT_IN` istenen ama uygun olmayan özellik SESSİZCE siliniyor.** Hata yok. Doğrulama
   için `creative_features_spec` geri okunmalı. Önizlemede `transformation_spec` dönmüyorsa
   özellik uygulanmayacak demek.
5. **Instagram metin sınırının sessiz hâli:** başlık metni (caption/message) 2.200
   karakteri aşarsa yalnız-Instagram reklamı hata veriyor; ama Facebook + Instagram
   karışık yerleşimde reklam OLUŞUYOR ve Instagram'da HİÇ GÖSTERİLMİYOR. Panel 2.200'ü
   giriş anında dayatmalı.
6. **Instagram kimliği: `instagram_user_id` + aynı sayfanın `page_id`'si.** Sayfaya bağlı
   bir IG hesabı başka bir sayfayla kullanılamıyor. Gönderiyi reklam yapmak için
   `object_id` (SAYFA kimliği) + `instagram_user_id` + `source_instagram_media_id`.
   Advetics'in canlıda öğrendiğiyle birebir aynı. `instagram_actor_id`'nin hangi sürümde
   kaldırıldığı bu grupta yazmıyor (bkz. Karşılaştırma).
7. **Medya kuralları giriş anında doğrulanabilir:** en az 600 px genişlik, akışta oran
   1,91:1 ile 4:5 arası (dışı kırpılıyor), Stories'te 9:16, Instagram videosu 3–60 sn ve
   2,3 GB altı, karusel kartı kırpma sonrası en az 600×600. Tam tablo aşağıda.
   Belgeler arasında video için çelişkili sayılar var (600 px / 1.200 px, 2,3 GB / 10 GB).
8. **Önizleme bir araç olarak hazır:** `act_X/generatepreviews` kreatif oluşturmadan,
   `<AD_ID>/previews` ve `<CREATIVE_ID>/previews` sonradan. Dönen iframe 24 saat geçerli,
   saklanamaz. Yerleşim başına ayrı `ad_format` istenmeli.
9. **Çok dilli reklamda otomatik çeviri Türkçeden ÇIKMIYOR:** İngilizceden Türkçeye
   (`tr_TR`) var, Türkçeden İngilizceye yok. Türkçe kaynak metinle `autotranslate`
   kullanılamaz.
10. **Esnek format (`creative_asset_groups_spec`) yalnızca `OUTCOME_SALES` ve
    `OUTCOME_APP_PROMOTION`.** Diğer hedeflerde kullanılamaz.

## Kavramlar, kurallar ve alanlar

### Kreatifin yapısı

- Reklam kreatifi, reklamın görsel olarak çizilmesi için gereken her şeyi taşıyan nesne.
  Üç parçası var: kreatifin kendisi, yerleşim (ad set'te), yerleşim başına önizleme.
- İki temel yol:
  - **Var olan gönderi:** `object_story_id` = `<PAGE_ID>_<POST_ID>` (Facebook gönderisi)
    ya da Instagram için `object_id` + `instagram_user_id` + `source_instagram_media_id`.
  - **Satır içi oluşturma:** `object_story_spec` içinde `page_id` (+ Instagram için
    `instagram_user_id`) ve şu üç gövdeden biri: `link_data`, `photo_data`, `video_data`.
    Katalog şablonu için `template_data`. Bu yol sayfada YAYINLANMAMIŞ bir gönderi
    oluşturuyor (sayfanın promotable feed'inde görünüyor).
- Okurken her alan açıkça istenmeli (`fields=`); yalnızca `id` kendiliğinden geliyor.
- Kreatif ayrıca `/ads` çağrısının `creative` parametresi içinde satır içi verilebiliyor
  (ayrı `adcreatives` çağrısı gerekmiyor).
- `/ads` ile oluşturulan reklamın `status` alanı **varsayılan `PAUSED`**.

### `link_data` (en sık kullanılan gövde)

| Alan | Anlamı / kural |
|---|---|
| `link` | Hedef adres. Zorunlu. |
| `message` | Ana metin (primary text). Instagram'da en fazla 2.200 karakter. |
| `name` | Başlık. Karuselde kart başlığı olarak da görünüyor. |
| `description` | Açıklama. **Instagram'da gösterilmiyor** (karusel kartlarında da yok sayılıyor). |
| `caption` | Görünen adres. Instagram'da tek dokunuşluk görsel katmanında sayfa adıyla birlikte çıkıyor. İzleme adresi çirkinse buraya alan adı yazılmalı. |
| `image_hash` / `picture` | Görsel. `image_hash` reklam hesabı kütüphanesinden. |
| `image_crops` | Kırpma (aşağıda). |
| `call_to_action` | `{type, value:{link, app_destination, app_link, link_title...}}`. |
| `child_attachments` | Karusel kartları (2–10). |
| `multi_share_optimized` | Karusel: `true` ise kart sırasını ve seçimini Meta yapıyor. **Varsayılan `true`.** |
| `multi_share_end_card` | Karusel: sondaki sayfa kartı. Varsayılan `true`. Instagram'da etkisiz. |
| `attachment_style` | Örneklerde `link`. |

Diğer örneklerde geçen ama bu grupta açıklanmayan alanlar: `preferred_image_tags`,
`media_elements`, `customization_rules_spec`, `retailer_item_ids`, `collection_thumbnails`
(koleksiyon için açıklanıyor), `use_flexible_image_aspect_ratio`.

### `photo_data` ve `video_data`

- `photo_data`: CTA'sız görsel gönderisi. Instagram'da `caption` alanı ≤ 2.200.
  Instagram Stories'te yalnızca `REACH` hedefiyle.
- `video_data`: `video_id` + küçük resim (`image_url` ya da `image_hash`) ZORUNLU.
  Instagram'da `description` ≤ 2.200. `LINK_CLICKS`/`CONVERSIONS` reklamında
  `video_data` kullanılıyorsa `call_to_action` ZORUNLU. Diğer alanlar örneklerde:
  `title`, `message`, `link_description`.
- `video_id` reklam hesabıyla ilişkili olmak zorunda (başka hesabın videosu olmaz).

### Kırpma (`image_crops`)

- Biçim: `{"<anahtar>": [[x1, y1], [x2, y2]]}` (sol üst ve sağ alt köşe, piksel).
- Anahtarlar: `100x100` (kare), `191x100` (yatay), `90x160` (Stories dikey). Koleksiyon
  küçük resminde yalnızca `100x100` geçerli.
- `100x100` verilirse hem Instagram hem Facebook bunu kullanıyor.
- **Instagram akışı `191x100` anahtarını YOK SAYIYOR**, yalnızca
  `platform_customizations.instagram` içinde verilirse kullanıyor. Sessiz.
- Kırpma yoksa: Instagram 1,91:1'den genişi 1,91:1'e, 4:5'ten uzunu 4:5'e kırpıyor.
- **Videolar kırpılamıyor.** Oranı en baştan doğru olmalı.
- Facebook'ta kırpma yokken `use_flexible_image_aspect_ratio` (varsayılan açık):
  4:5 görsel ORTADAN 1:1'e, 4:5–1,91:1 arası görsel 1:1'e kırpılıyor. `false` ise her
  şey 1,91:1'e kırpılıyor. Yani aynı görsel, aynı alanlar gönderilmeden bırakıldığında
  Facebook'ta ve Instagram'da farklı yerinden kesiliyor.

### Platforma göre medya değiştirme (`platform_customizations`)

- Yalnızca tek anahtar: `instagram`. İçinde `image_url` ya da `image_hash`, isteğe bağlı
  `image_crops`, ya da `video_id`.
- `link_data`, `photo_data`, `video_data` ile çalışıyor. `object_story_id` ile verilen
  gönderide de Instagram için başka medya göstermeye yarıyor.
- **Metin değiştirilemiyor**, Facebook için ters yönde değiştirme yok, katalog
  reklamlarında çalışmıyor.

### Advantage+ creative (`degrees_of_freedom_spec.creative_features_spec`)

**Tarihçe:** Önceden tek paket olarak `standard_enhancements` vardı. v22.0'dan itibaren
paketin opt-in ve önizlemesi kaldırıldı; özellikler tek tek açılıp kapanıyor. Geri
okurken `standard_enhancements` ve alt özelliklerinin spec'e eklenmiş göründüğü olabiliyor;
belgeye göre `OPT_IN` değilse uygulanmıyor ve bu davranış kaldırılacak. Bazı yollarda
hâlâ *"Creative Must Provide enroll_status for Standard Enhancements"* hatası
alınabiliyor (Instagram gönderi boost'u sorun giderme notu).

Her özellik `{"enroll_status": "OPT_IN" | "OPT_OUT"}` alıyor; bazıları `customizations`.

**Markanın içeriğini değiştirme derecesine göre sınıflandırma** (müşteri onayı için):

| Özellik | Ads Manager adı | Ne yapıyor | AI ile üretim | Markayı değiştirir mi | Varsayılan (belgeye göre) |
|---|---|---|---|---|---|
| `image_uncrop` | Expand image | Görselin kenarlarını yapay zekâ ile UZATIP yeni piksel üretiyor | Evet | **Evet, görselde olmayan içerik çiziliyor** | Belirtilmemiş |
| `video_uncrop` | — | Videoyu kırpmak yerine kenarlarını üreterek genişletiyor | Evet | **Evet** | Belirtilmemiş |
| `image_background_gen` | Generate backgrounds | Ürün görseline farklı arka planlar üretip en iyisini gösteriyor. Şimdilik yalnız katalog reklamı + Mobile Feed | Evet | **Evet, ürünün çevresi değişiyor** | Belirtilmemiş |
| `image_animation` | — | Durağan görseli kısa hareketli videoya çeviriyor | Evet | **Evet** | Belirtilmemiş |
| `image_templates` | Add overlays | Verilen metni görselin üstüne katman olarak ekliyor | Evet | **Evet, görselin üstüne yazı biniyor** | Belirtilmemiş |
| `creative_stickers` | Create sticker CTA | AI çıkartmalar ve CTA çıkartması ekliyor, yerini Meta seçiyor | Belgede "AI-generated" | **Evet** | Belirtilmemiş |
| `text_generation` | (Text generation) | Ana metinden, eski reklamlardan, sayfa içeriğinden YENİ ana metinler üretip `asset_feed_spec.bodies`e ekliyor | Evet | **Evet, markanın yazmadığı cümleler yayınlanıyor** | Belirtilmemiş |
| `text_optimizations` | Text improvements | Verilen metinleri ana metin/başlık/açıklama arasında yer değiştiriyor, başlıktan "giriş" ekleyebiliyor, cümle vurguluyor. `customizations.text_extraction` ile AI'ın bulduğu ifadeler de kullanılıyor | Kısmen | **Evet, metnin yeri ve görünüşü değişiyor** | Belirtilmemiş |
| `enhance_cta` | Enhance CTA | Kaynaklardan anahtar ifadeleri CTA düğmesine iliştiriyor (`text_extraction` ile AI ifadeleri) | Kısmen | **Evet** | Belirtilmemiş |
| `text_translation` | Translate Text | Reklam metnini başka dillere çeviriyor | — | **Evet, onaylanmamış çeviri** | Belirtilmemiş |
| `image_text_translation` | Translate image text | Görselin İÇİNDEKİ yazıyı algılayıp çevrilmiş sürüm üretiyor. Mobile Feed, Mobile Reels; tek görsel | — | **Evet, görsel yeniden üretiliyor** | Belirtilmemiş |
| `translate_voiceover` | Translate voiceover | Videodaki konuşmayı çevirip **orijinal konuşmacıya benzeyen** sesle seslendiriyor. Yalnız İngilizce→İspanyolca. Düzenlenemiyor, yeniden üretilemiyor. Önizleme ilk 6 sn | Evet | **Evet, ses benzetimi** | Belirtilmemiş |
| `music` (`asset_feed_spec.audios`) | Music | Reklama müzik ekliyor. `[{"type": "random"}]` ile açılıyor; KAPATMAK için `audios` boş verilmeli | — | **Evet, ses ekleniyor** | **Belgede belirsiz** — kapatma yolunun "boş gönder" olması varsayılanın açık olabileceğini düşündürüyor ama yazmıyor |
| `image_touchups` | Visual touch-ups | Görseli yerleşimlere uyması için kırpıp genişletiyor | Belirtilmemiş | Evet (kadraj) | Belirtilmemiş |
| `video_auto_crop` | Visual touch-ups | Video için aynısı | Belirtilmemiş | Evet (kadraj) | Belirtilmemiş |
| `adapt_to_placement` | Image touch-ups | Görseli yerleşime oturtuyor; 4:5 ve 9:16 yerleşimleri açık geliyor. `customizations.aspect_ratio_config`, `image_crop_style` ile yönetiliyor | — | Evet (kadraj) | **AÇIK ("Default is opt-in")** |
| `pac_relaxation` | Flex media | Belirli bir oran için seçilen medyayı BÜTÜN yerleşimlerde gösterebiliyor | — | Evet (yerleşim kararı) | Belirtilmemiş |
| `image_brightness_and_contrast` | Adjust brightness and contrast | Parlaklık ve kontrastı değiştiriyor | — | Evet (renk) | Belirtilmemiş |
| `video_filtering` | — | Renk iyileştirme, SDR→HDR | — | Evet (renk) | Belirtilmemiş |
| `inline_comment` | Relevant comments | En alakalı KULLANICI yorumunu reklamın altında gösteriyor | — | Dolaylı: müşterinin seçmediği bir yorum reklamın parçası oluyor | Belirtilmemiş |
| `reveal_details_over_time` | Reveal details over time | Web sitesi / uygulama mağazasından bilgi çekip reklamda gösteriyor | — | Evet (siteden metin) | Belirtilmemiş |
| `site_extensions` | Add site links | Medyanın altında ek bağlantılar (`creative_sourcing_spec.site_links_spec`) | — | Ek içerik | Belirtilmemiş; örnek `OPT_IN` |
| `product_extensions` | (Koleksiyon menüsünde ürün göster) | Katalogdan ürünleri medyanın yanına ekliyor | — | Ek içerik | Belirtilmemiş |
| `description_automation` | Dynamic description | Katalogda açıklamayı kişiye göre seçiyor; durağan karuselde açıklamanın ne zaman gösterileceğini seçiyor | — | Kısmen | Belirtilmemiş |
| `add_text_overlay` | Add dynamic overlays | Katalog bilgisinden görsel katman | — | Evet | Belirtilmemiş |
| `media_type_automation` | Allow product video | Katalog videolarını görsellerle birlikte gösteriyor | — | Medya seçimi | Belirtilmemiş |

Ek kurallar:
- **Uygun olmayan `OPT_IN` sessizce düşüyor** (örnek: videoda `image_templates`). Son
  hâl `GET <CREATIVE_ID>?fields=degrees_of_freedom_spec` ile doğrulanmalı.
- **AI ile üretim içeren özellik varsa reklam `PAUSED` oluşturulmalı**, önizleme alınmalı,
  ancak sonra `ACTIVE`. AI'sız özelliklerde bu adımlar isteğe bağlı.
- Önizlenebilen özellikler: `image_templates`, `image_touchups`, `video_auto_crop`,
  `enhance_cta`, `text_optimizations`, `image_background_gen`, `image_uncrop`,
  `description_automation`, `translate_voiceover`, `image_animation`, `video_filtering`,
  `video_uncrop`. Önizlemesi OLMAYANLAR: `inline_comment`, `creative_stickers`,
  `text_translation`, `image_text_translation`, `reveal_details_over_time`,
  `pac_relaxation`, `adapt_to_placement`, müzik. Bunları açmak "görmeden yayınlamak".
- Önizleme sonucu beğenilmezse özelliği "kapatmak" yok: **özelliksiz YENİ kreatif ya da
  reklam** oluşturulmalı.
- `text_generation`'ın etkisi yalnızca o istekte oluşturulan reklam/kreatife; üretilen
  metinler `asset_feed_spec.bodies`te okunabiliyor ve `optimization_type`
  `DEGREES_OF_FREEDOM` oluyor. Var olan bir kreatifi ilk kez kullanan reklam da elle
  `ACTIVE` yapılmalı.
- `image_uncrop` önizleme yerleşimleri: `INSTAGRAM_STANDARD`, `FACEBOOK_REELS_MOBILE`,
  `INSTAGRAM_REELS`, `MOBILE_FEED_STANDARD`, `INSTAGRAM_STORY`. Önizleme `pending`
  dönerse tekrar istenmeli.
- `image_background_gen` önizlemesi yalnızca `MOBILE_FEED_STANDARD`. Katalog hazır
  değilse **stok bir önizleme** `PENDING` ile dönüyor — yani gösterilen görsel müşterinin
  ürünü olmayabilir.
- **AI etiketi:** AI ile oluşturulan ya da ciddi biçimde düzenlenen görsellerde reklamın
  üç nokta menüsünde ya da "Sponsorlu" yanında "AI info" etiketi çıkabiliyor. Müşteriye
  söylenmeli.
- **Hukuki:** Bu özellikleri API'den kullanmak Ad Creative Generative AI Terms'ü
  ekliyor; Meta üretilen metin/arka plan/genişletmenin doğruluğu için garanti vermiyor.

### Çoklu reklamveren (`contextual_multi_ads`)

- Reklamı, alışverişe devam etme olasılığı yüksek kişilere başka reklamverenlerin
  reklamlarıyla birlikte gösteriyor.
- `enroll_status` `OPT_IN` / `OPT_OUT`. **19 Ağustos 2024 ve sonrası oluşturulan
  reklamlarda alan verilmezse `OPT_IN`.** Bütün hedefler, formatlar, yerleşimler.

### Format otomasyonu (`format_transformation_spec`)

- Tek reklamdan birden çok format teslim ediliyor. Liste: her eleman `{format, data_source}`.
- `format`: `da_collection` (katalog koleksiyonu), `sa_collection` (elle yüklenen
  koleksiyon), `single_media`, `carousel`, `video_slideshow`.
- `data_source`: `none` (kapat), `catalog`, `manual_uploads`, `app_information`,
  `site_links`. **Alanı vermemek ya da boş dizi = bütün kaynaklara opt-in.**
- **Spec hiç verilmezse "varsayılan davranış" — ne olduğu belgede yazmıyor.**
- Dönüşüm çiftleri: katalog karuseli → koleksiyon; giriş kartlı katalog karuseli →
  koleksiyon/tek medya (karuselin küçülmesi kendiliğinden, ayrı satır gerekmiyor); tek
  medya → karusel (`catalog`, `site_links`, `app_information`), → koleksiyon
  (`catalog`, `site_links`), → video slayt (`app_information`, `site_links`); karusel →
  tek medya / koleksiyon / video slayt (`manual_uploads`).
- Katalog örneklerinde `asset_feed_spec.ad_formats: ["CAROUSEL","COLLECTION"]` ve
  `optimization_type: "FORMAT_AUTOMATION"` birlikte veriliyor.
- İzin: `page_manage_ads`.

### Esnek reklam formatı (`creative_asset_groups_spec`)

- Görsel, video ve metinleri gruplayıp formatı dağıtım sistemine bırakıyor.
- **Yalnızca `OUTCOME_SALES` ve `OUTCOME_APP_PROMOTION`.**
- Grup başına en az 1 `image` ya da `video`; bütün `call_to_action`lar aynı `type`;
  `text_type` başına en fazla 5 `texts` (`primary_text`, `headline` örnekte).
- `/ads` çağrısında `creative`ın yanında verilip `creative_asset_groups_spec` ile
  geri okunuyor; videoya küçük resmi Meta ekliyor (`image_hash`).

### Dinamik kreatif ailesi: `asset_feed_spec` + `asset_customization_rules`

Üç API aynı kural yapısını kullanıyor: yerleşime göre özelleştirme, çok dilli reklam ve
(bu grupta olmayan) üçüncüsü. Ortak: varlıklara `adlabels` takılıyor, kurallar etiketlere
bakıyor.

**Yerleşime göre varlık (`optimization_type: "PLACEMENT"`):**
- Her `asset_feed_spec` **birden çok kural** taşımak zorunda.
- Kural: `customization_spec` + format'a göre `image_label` / `video_label` /
  `carousel_label`. Karuselde bütün kartlar spec içinde tanımlanıp etiketle
  referanslanmalı, satır içi kart yok.
- `customization_spec`: `publisher_platforms` (`facebook`, `instagram`, `messenger`,
  `audience_network`, `threads`) ve platform seçildiyse ilgili pozisyonlar:
  `facebook_positions` (`feed`, `right_hand_column`, `marketplace`, `video_feeds`,
  `search`, `story`, `notification`; örnekte `instream_video` de geçiyor),
  `instagram_positions` (`stream`, `story`, `explore`, `explore_home`, `profile_feed`,
  `ig_search`), `messenger_positions`, `audience_network_positions`, `threads_positions`
  (`threads_stream` — yalnızca Instagram `stream` de seçiliyse).
- `explore_home` yalnızca `SINGLE_IMAGE`.
- Bağlantı açıklaması yerleşime göre değişmiyor: tek `descriptions` verilmeli.
- **Var olan gönderiyle yerleşim özelleştirmesi API'de artık desteklenmiyor**, yalnızca
  Ads Manager.
- Instagram alanlarını (`effective_instagram_media_id`, `instagram_permalink_url`)
  okumak için `act_X/ads?fields=creative{...}` yolu öneriliyor.

**Çok dilli reklam (`optimization_type: "LANGUAGE"` otomatik çeviride):**
- Varlık türleri: `images`/`videos` (formata göre zorunlu), `bodies`, `titles`,
  `descriptions` (boş için tek boşluk), `link_urls` (`website_url`, `display_url`,
  `deeplink_url`), `call_to_action_types`, `ad_formats` (`SINGLE_IMAGE`, `SINGLE_VIDEO`
  — spec başına TEK format), `asset_customization_rules`.
- Kural: `customization_spec.locales` (sayısal locale kimlikleri,
  `/search?type=adlocale` ile), `image_label`/`video_label`, `body_label`,
  `title_label`, `description_label`, `link_url_label`, `is_default`.
- **Tam olarak bir varsayılan kural** (`is_default: true`); dili eşleşmeyen kişiye bu
  gösteriliyor.
- Sınırlar: tür başına en fazla 49 varlık; **tam olarak bir** `call_to_action_type`;
  başlık 255, gövde 4.096, açıklama 10.000 karakter; her dil için en az bir metin
  varlığı; bütün metin varlıklarında `adlabels`; etiketsiz en fazla bir görsel/video
  (bütün dillerde ortak).
- `url_tags` verilirse bağlantıya parametre olarak ekleniyor. `APP_INSTALLS`'ta
  `link_url` ad set'in `promoted_object.object_store_url`'i ile aynı olmalı.
- Desteklenen hedefler (eski adlarla): `LINK_CLICKS`, `APP_INSTALLS`, `CONVERSIONS`
  (Messenger yok), `REACH`, `BRAND_AWARENESS`, `VIDEO_VIEWS`. Satın alma: `AUCTION`,
  `REACH` (Reach & Frequency). Bütün yerleşimler.
- Otomatik çeviri: `asset_feed_spec.autotranslate: ["fr_XX", ...]`. Kaynak, varsayılan
  kuraldaki metin. Çevrilenler "Automatically Translated" etiketiyle gösteriliyor.
  **Dil `autotranslate`te kaldıkça elle yapılan düzeltmeler bir sonraki çeviride
  siliniyor** — düzeltme kalıcı olsun isteniyorsa dil listeden çıkarılmalı.
- Çeviri yönleri: İngilizceden 16 dile (aralarında `tr_TR`), 9 dilden İngilizceye
  (`en_XX`). **Türkçeden herhangi bir dile yok.**
- Önizleme: `generatepreviews` + `dynamic_asset_label=<etiket>`.

### Site bağlantıları (Add site links)

- Uygunluk: Trafik, Etkileşim, Potansiyel Müşteri ya da Satış hedefi; dönüşüm yeri web
  sitesi; tek görsel ya da tek video. Yalnızca Facebook akışında, Meta "performansı
  artırır" diye öngördüğünde gösteriliyor.
- `creative_sourcing_spec.site_links_spec`: `site_link_title`, `site_link_url`,
  `site_link_image_hash` / `site_link_image_url` (ikisi birden varsa URL kazanıyor).
- Açmak: `degrees_of_freedom_spec.creative_features_spec.site_extensions.enroll_status:
  "OPT_IN"`.

### Koleksiyon reklamı ve Instant Experience

- Koleksiyon = kahraman görsel/video + altında 3 ürün, dokununca tam ekran Instant
  Experience (eski adı Canvas; API'de hâlâ `canvas`).
- Hedefler: Trafik, Dönüşüm, Katalog Satışı ve Mağaza Ziyareti (ikisi ürün setiyle),
  Marka Bilinirliği, Erişim. Yerleşimler: Facebook Feed, Facebook Reels, Instagram Feed,
  Instagram Stories. **Facebook Stories'te Instant Experience yok.**
- Kreatif: `link_data.link` = `https://fb.com/canvas_doc/<CANVAS_ID>` (ya da
  `video_data.call_to_action.value.link`), `collection_thumbnails` **4 adet zorunlu**
  (`element_id`, ürün etiketli fotoğraf/ürün listesi için `element_child_index`,
  fotoğraf için `element_crops` yalnızca `100x100`). Kahraman görselin element kimliği
  geçersiz.
- Ürün setinden koleksiyon: önce elementler (`/{page_id}/canvas_elements`):
  `canvas_photo` / `canvas_video` / `canvas_template_video`, `canvas_product_set`
  (`show_in_feed: true` ZORUNLU; isteğe bağlı `max_items`, `item_headline`,
  `item_description`, `image_overlay_spec`, `storefront_setting`, `retailer_item_ids`),
  `canvas_button`, `canvas_footer`. Sonra `/{page_id}/canvases` (`body_element_ids`,
  `is_published`, gerekirse `source_template_id`). Sonra kreatif: ilk element fotoğrafsa
  `object_type: SHARE`, videoysa `VIDEO`.
- `storefront_setting.product_set_layout.layout_type`: `GRID_2COL`, `GRID_3COL`,
  `CAROUSEL`, `HSCROLL_LIST`. `customized_section_titles` (`enable_sections: true`
  şart) için `title_id` kapalı sözlüğü: `keep_shopping`, `take_another_look`,
  `you_may_also_like`, `related_products`, `trending`, `popular`, `top_items`,
  `favorites`, `most_viewed`, `top_picks_for_you`, `suggested_for_you`,
  `featured_favorites`, `just_for_you`, `explore_more`, `shop_by_category`.
- Şablonlar: Get New Customers `133471657203838`, Showcase Your Business
  `1063217037112304`, Sell Products (Without Catalog) `424787857903852`, Lifestyle
  `1369752616394017`, Grid / Storefront `1932289657009030`, AR yalnızca Ads Manager.
  Şablonun element türleri: `GET /<TEMPLATE_ID>?fields=document` →
  `GET /<DOCUMENT_ID>?fields=body_elements`.
- **Yalnızca yayınlanmamış Instant Experience güncellenebiliyor.** Yayınlama:
  `is_published=1`.
- Instagram kısıtları: yalnızca Feed ve Stories (Stories seçilirse TEK yerleşim olmalı);
  footer "kaydır" yerine "dokun", karuselde başka IE'ye bağlantı yok ve fit-to-height yok,
  düğme başka IE'ye/App Store'a bağlanamıyor, RTL metin yok, 360 video yok, mağaza
  bulucu yok. Instant Experience API'si Instagram'da "sınırlı" kullanılabilir.
- Hedef katalog (destination) ile kahraman görsel: `canvas_photo.destination_set_id`;
  video desteklenmiyor, yalnızca destinasyon + otel kataloğu birleşimi.
- Etkileşim kitlesi: `customaudiences` `rule` içinde `object_id: <CANVAS_ID>` ve
  `event_name`: `instant_shopping_document_open` (açanlar),
  `instant_shopping_element_click` (bağlantıya tıklayanlar).
- İzinler: `pages_manage_ads`, `pages_read_engagement`, `pages_show_list`, sayfada
  `ADVERTISE` görevi.
- JS SDK diyalogları: `instant_experiences_builder` (koleksiyon için ek `account_id`,
  `template_id`, `product_catalog_id`, `product_set_id`), `instant_experiences_preview`.
  Koleksiyon diyaloğundan dönen kimlik YAYINLANMAMIŞ; düz IE diyaloğu yayınlanmış
  döndürüyor diyor (iki sayfa birbirine zıt; dikkat).

### Video reklamları

- **Yükleme (yeni, devam ettirilebilir protokol):** `POST act_X/video_ads
  upload_phase=start` → `video_id` + `upload_url`
  (`rupload.facebook.com/video-ads-upload/v25.0/<VIDEO_ID>`) → yükle: başlıklar
  `Authorization: OAuth <token>`, `offset`, `file_size`, gövde ikili; ya da
  `file_url` (herkese açık http/https) → `GET /<VIDEO_ID>?fields=status`
  (`video_status`: `ready`/`processing`/`expired`/`error`; `uploading_phase.bytes_transferred`
  ile kaldığı yerden devam) → `POST act_X/video_ads upload_phase=finish video_id=...`.
- Kısıtlar: **sistem kullanıcısıyla business hesabına yükleme desteklenmiyor**, yalnızca
  reklam hesabına; kullanıcı reklam hesabında `CREATE_CONTENT` görevine sahip olmalı;
  izinler `ads_read`, `ads_management`.
- Eski yol: `act_X/advideos` (videoads sayfası hâlâ bunu gösteriyor).
- Video özellikleri (fbvideoads): MP4 önerilir; oran 16:9 ile 9:16 arası; 10 GB'a kadar
  önerilir; **en az 1.200 px genişlik**; 1280×720 önerilir; 24–60 fps; 4:2:0, kapalı GOP
  (2–5 sn), H.264/H.265 (VP9, AV1 da); sabit kare hızı; progressive; ses AAC LC,
  128 kbps+, stereo, 48 kHz.
- Instagram için ayrıca: `is_instagram_eligible` alanı yüklemeden sonra kontrol
  edilebiliyor (`GET /<VIDEO_ID>?fields=is_instagram_eligible`).
- Video CTA'sının kullanılabildiği hedefler (eski adlar): `PAGE_LIKES`,
  `LEAD_GENERATION`, `LOCAL_AWARENESS`, `LINK_CLICKS`, `CONVERSIONS`, `APP_INSTALLS`,
  `VIDEO_VIEWS`, `BRAND_AWARENESS`, mobil uygulama etkileşimi.
- `THRUPLAY` optimizasyonu: `billing_event` `IMPRESSIONS` ya da `THRUPLAY`.
- Video izleyici kitlesi: `subtype=ENGAGEMENT`, `rule` içinde `object_id` (video) ve
  `event_name`: `video_watched` (3 sn), `video_completed` (%95), `video_view_10s`,
  `video_view_15s`, `video_view_25_percent`, `_50_`, `_75_`. `prefill=1` geçmişi doldurur.
- Yalnızca `right_hand_column` seçilmiş ad set'te video formatı desteklenmiyor.

### Karusel (genel)

- `child_attachments` 2–10 eleman (performans için 3+ öneriliyor; uygulama reklamında
  en az 3, tek uygulama, CTA zorunlu, son kart gösterilmiyor).
- Kart alanları: `link` (zorunlu), `picture` ya da `image_hash` (biri zorunlu; 1:1,
  en az 458×458 öneriliyor), `name` (~35 karakterde kesiliyor; kart başına TEKİL olmalı,
  raporlar `name` ile gösteriliyor), `description` (~30 karakter; verilmezse sayfadan
  ÇEKİLİYOR), `call_to_action`, `video_id` (verilirse görsel de zorunlu), `caption`
  (video kartında son ekrandaki adres).
- Facebook Stories'te karusel yok.
- Kart bazında rapor: `action_breakdowns` = `action_carousel_card_id` /
  `action_carousel_card_name`.

### Reels reklamları

- Yerleşim: Instagram `reels`, `profile_reels`; Facebook `facebook_reels`.
- Hedef × `optimization_goal` uyumu sayfada tablo hâlinde var. Yalnızca bir tarafta
  geçerli olanlar: FB Reels'te var IG'de yok → `TWO_SECOND_CONTINUOUS_VIDEO_VIEWS`,
  `QUALITY_CALL`, `EVENT_RESPONSES`, `PAGE_LIKES`; IG Reels'te var FB'de yok →
  `VISIT_INSTAGRAM_PROFILE`, `REMINDERS_SET`.
- Var olan bir Reel'i reklam yapma koşulları: **90 sn'den kısa, 9:16, telif müzik / GIF /
  etkileşimli çıkartma / üçüncü taraf kamera filtresi YOK, Facebook'a paylaşılmamış.**
- Yaratıcı kurallar (öneri): 9:16 video, **alt %35 metin/logo/önemli öğeden boş**
  (arayüz kapatıyor), sesli izlemeye göre kurgu.
- Katalog ürün videosu (allow product video / `media_type_automation`): ürün başına en az
  bir indirilebilir video URL'si, Reels için 9:16 olanı seçiliyor, yoksa ilk video.
  Koleksiyon + katalog videosu Reels'te henüz yok.

### Hatırlatma (reminder) reklamları

- Instagram'da önceden oluşturulmuş "upcoming event" gerekiyor.
- Ad set: `destination_type: ON_REMINDER` (zorunlu), `optimization_goal: REMINDERS_SET`
  (zorunlu), `instagram_positions` `stream`/`story`/`reels`.
- Desteklenen eşleşmeler: `OUTCOME_ENGAGEMENT` + `REMINDERS_SET` / `THRUPLAY`;
  `OUTCOME_AWARENESS` + `THRUPLAY` / `REACH`; `OUTCOME_SALES` + `OFFSITE_CONVERSIONS`.
- Kreatif: `asset_feed_spec.upcoming_events` (`event_id`, `event_title`, `start_time`);
  `link_data.link` zorunlu — bağlantı istenmiyorsa `https://fb.com/` (görünmüyor).
- Ad set bitişi etkinlik başlangıcından sonra olmalı; etkinlik geçince dağıtım duruyor.
- Hatırlatmalı kreatif farklı hedefli kampanyalar arasında her zaman paylaşılamıyor;
  hedef başına ayrı kreatif.

### Markalı içerik (branded content) ve ortaklık

- Sayfa gönderisi: `/{page_id}/feed`, `/photos`, `/videos` ile `sponsor_id`,
  `share_status`, `message`; `direct_share_status=1` marka ortağının gönderiyi DOĞRUDAN
  boost etmesine izin veriyor (`0` engelliyor). Sonradan `POST /{page_post_id}`
  `sponsor_id` ile değiştirilebiliyor (web ve mobilde değil, yalnız API).
- Yorum gizleme: `POST /{comment_id}` `is_hidden=true` — başkasının sayfasındaki
  markalı gönderide de çalışıyor (yalnız sayfa gönderileri).
- Marka izin listesi (yeni API, Graph değil): taban
  `https://api.facebook.com/partnership-ads/fb-branded-content/<PAGE_ID>/`, başlıklar
  `Authorization: Bearer`, `X-API-Version: 1.0.0`, izin
  `facebook_branded_content_ads_brand`. Uçlar: `brand-allowlist-status` (GET, PUT
  `?is_enabled=`), `brand-allowlisted-creators` (GET/POST/DELETE; uygun olmayan eski
  sayfalar `creator_ineligible_for_bc` ile işaretli), `branded-content-posts` (GET
  `start_date`, `end_date` (hariç), `creator_page_ids`, `limit` ≤ 5000, `offset`; DELETE
  `post_ids` = sponsor etiketini kaldır). İzin listesinden çıkarmak var olan gönderileri
  kaldırmıyor. Yanıt istek başına değil **kalem başına durum kodu** taşıyor (kısmi
  başarı mümkün).
- **Instagram ortaklık reklamı (partnership ad) kreatif alanları bu grupta GEÇMİYOR.**

### Instagram hesabı bağlama

Üç yol:

| | Business Manager | Sayfaya bağlı IG | Sayfa destekli IG (PBIA) |
|---|---|---|---|
| Reklamverenin IG hesabı gerekir | Evet | Evet | Hayır ("gölge" hesap) |
| BM gerekir | Evet | Hayır | Hayır |
| Elle adım | Hesabı BM'ye talep etme | Hesabı sayfaya bağlama | Yok |
| Gönderi / yorum yapılabilir | Evet | Evet | **Hayır** (hesaba girilemiyor) |
| Reklam yorumlarını API ile okuma/silme | Evet | Evet | Evet |
| Kişiye ait reklam hesabıyla reklam | Hayır | Evet | Evet |
| Business'a ait reklam hesabıyla reklam | Evet | Evet | Evet |

- BM yolu: IG business hesabı, BM'de talep, ajans "partner" olarak atanıyor, reklam
  hesapları IG hesabına atanıyor: `POST /<IG_USER_ID>/authorized_adaccounts`
  (`business`, `account_id`; business'ta en az `ADMIN`). Kısıt: reklam hesabı ya bu
  business'ın, ya da IG hesabının sahibi business'ın olmalı; **bir müşterinin reklam
  hesabı başka bir müşterinin IG hesabına atanamaz**, ajans ikisine de admin olsa bile.
  Okuma `GET` aynı uç, `business` zorunlu, yalnızca o business'ın hesapları döner.
- Hesap listeleri: `/{business_id}/instagram_accounts` (uygulamada `STANDARD` erişim ya
  da uygulama o business'ın), `act_X/instagram_accounts`, `/{page_id}/instagram_accounts`
  (sayfa token'ı), `act_X/connected_instagram_accounts`,
  `/{business_id}/instagram_business_accounts`, sayfadaki
  `instagram_business_account` alanı. "Connection objects" artık IG için kullanılamıyor.
- Sayfaya bağlı hesap: herkese açık (private değil), profil fotoğrafı olan business
  hesabı; sayfada `advertiser` rolü yetiyor, IG'de rol gerekmiyor. Kreatifte
  `instagram_user_id` bu hesapsa `page_id` O SAYFA olmalı. Sayfa başına bir bağlı hesap
  ve bir PBIA.
- PBIA: `POST /{page_id}/page_backed_instagram_accounts` (varsa var olanı döndürüyor),
  `GET` ile okunuyor (yoksa boş yanıt). Adı ve fotoğrafı sayfadan otomatik eşitleniyor.
  Kişiye ait (BM dışı) reklam hesabında, sayfanın bağlı IG hesabı varsa PBIA
  kullanılamıyor; business'a ait hesapta bu kısıt yok.
- Not: IG hesabına doğrudan yetki verilemiyor; yetki sayfa ya da business üzerinden.
  Reklam hesabıyla ilişkili IG hesabında reklam açabilen herkes o IG hesabıyla reklam
  açabiliyor.
- Belgedeki tek sürüm notu: eski Ads API `InstagramUserID` **uç noktası** v22.0'da
  kaldırıldı, bütün sürümlerde 21 Nisan 2025'te; yerine Instagram Platform'un `IGUserID`
  düğümü.

### Gönderiyi reklam yapma (Instagram ve Facebook)

- **Instagram gönderisi:** tek fotoğraf, video, karusel, reel (etiketli dahil), aktif
  hikâye; ürün etiketli akış görseli/karuseli/videosu. IGTV yok. **Telif müzikli ya da
  filtre gibi etkileşimli öğeli medya boost edilemiyor.**
- Medya kimliği `/{ig_user}/media` (hikâye için `/{ig_user}/stories`); bu kimlik
  `source_instagram_media_id`. Uygunluk `boost_eligibility_info` alanında; geçmiş boost
  bilgisi `boost_ads_list` (3 Haziran 2024'ten beri). Var olan kreatifin kaynak medyası
  `{ad_creative_id}?fields=source_instagram_media_id`.
- Kreatif: `object_id` (**sayfa kimliği**) + `instagram_user_id` +
  `source_instagram_media_id`, isteğe bağlı `call_to_action`.
- Mesaj hedefleri: Instagram DM → `{type: MESSAGE_PAGE, value: {app_destination:
  INSTAGRAM_DIRECT}}`; Messenger → `app_destination: MESSENGER`; çoklu hedef →
  `asset_feed_spec.optimization_type: "DOF_MESSAGING_DESTINATION"` ve
  `call_to_actions` listesi (`MESSAGE_PAGE`/`MESSENGER`, `INSTAGRAM_MESSAGE`/`INSTAGRAM_DIRECT`).
- **Facebook gönderisi Instagram'da:** `GET /<POST_ID>?fields=is_instagram_eligible`;
  kreatif `object_story_id` + `instagram_user_id` (sayfaya bağlı ya da PBIA).
  Facebook + Instagram yerleşimli ad set'te Facebook gönderisini `instagram_user_id` ile
  tanıtınca *"Creative is missing DOF spec"* / *"should have degrees_of_freedom spec for
  multi-destination ads"* gelebiliyor → `asset_feed_spec.optimization_type:
  "DOF_MESSAGING_DESTINATION"`.

### Instagram yerleşimleri

- Değerler: `stream`, `story`, `explore`, `explore_home`, `reels`, `profile_feed`,
  `profile_reels`, `ig_search`.
- **`instagram_positions` verilmezse bütün Instagram yerleşimleri.**
- Bağımlılıklar: Explore için `stream` + `explore`; Explore home için `stream` +
  `explore`; arama sonuçları için `stream`. Yalnız Stories için `story` tek başına ve
  `publisher_platforms: ["instagram"]` tek başına.
- `story` hem masaüstü hem mobil web akışında da gösteriliyor; web akışı `stream`
  üzerinden uygunluk kontrolüyle.
- Yerleşim × hedef tablosu (eski hedef adlarıyla) Get Started sayfasında: ör. Explore
  home'da `POST_ENGAGEMENT` yok; Reels'te `POST_ENGAGEMENT`, `LEAD_GENERATION`,
  `PRODUCT_CATALOG_SALES` yok; Stories'te `POST_ENGAGEMENT` yok. Bu tablo ODAX öncesi
  adlarla yazılmış; Reels sayfasındaki ODAX tablosuyla çelişiyor (ör. Reels
  `OUTCOME_LEADS` + `LEAD_GENERATION` orada var). Yeni tablo esas alınmalı.
- Rapor kırılımı `publisher_platform, platform_position`; Instagram değerleri `feed`,
  `instagram_explore`, `instagram_reels`, `instagram_stories`.

### Instagram metin ve CTA kuralları

- Hangi gövde hangi hedefle (Stream, eski adlar): `LINK_CLICKS`, `MOBILE_APP_INSTALLS`,
  `CONVERSIONS`, `MOBILE_APP_ENGAGEMENT` → `link_data`/`video_data`; `VIDEO_VIEWS` →
  yalnız `video_data`; `POST_ENGAGEMENT` → üçü de.
- CTA verilmezse `LEARN_MORE` + `link_data.link`. **Açık CTA verilirse `value.link`
  `link_data.link` ile AYNI olmalı.** `video_data`'da CTA zorunlu. Uygulama hedeflerinde
  CTA zorunlu ve bağlantı App Store / Google Play (derin bağlantı destekli).
- `POST_ENGAGEMENT` + `link_data` = her zaman bir CTA (verilmezse `LEARN_MORE`);
  CTA istenmiyorsa `photo_data`. Mesajda bağlantı olan `photo_data`/CTA'sız
  `video_data`'da Meta mesajdaki bağlantıdan `LEARN_MORE` CTA'sı ÜRETİYOR.
- Metin: `link_data.message`, `video_data.description`, `photo_data.caption` ≤ 2.200;
  **mesajdaki bağlantılar Instagram'da tıklanamıyor**; en fazla 30 hashtag. Başlık/
  açıklama gibi diğer alanlar yalnızca Facebook'ta.
- `WEBSITE_CLICKS` reklamı Facebook sayfasına ya da Instagram profiline bağlanmamalı
  (API hatası ya da giriş ekranı).
- Görsel katman: `LINK_CLICKS`/`CONVERSIONS` görsel reklamında görsele dokununca sayfa
  adı + görünen adres (`caption` ya da `link`); videoda yok. Uygulama reklamlarında
  "View in App Store/Play Store".
- **Stories:** yalnızca `photo_data` (`REACH`), `link_data` (`LINK_CLICKS`),
  `video_data` (`REACH`, `VIDEO_VIEWS`, `LINK_CLICKS`). Marka hedefli Stories reklamı
  yalnızca hesap adı ve profil fotoğrafını gösteriyor: **mesaj, başlık, bağlantı,
  açıklama alanları yok sayılıyor**. Doğrudan yanıt reklamı CTA gösteriyor ama yine
  mesaj/başlık yok. Stories'te desteklenmeyen CTA'lar: `Donate`, `Donate Now`, `Save`,
  `Call Now`, `Get Directions`.

### Instagram karuseli

- En az 2 kart (uygulama hedeflerinde 3), `instagram_user_id` zorunlu.
- **`multi_share_optimized` ve `multi_share_end_card` Instagram'da etkisiz.** Belgeye
  göre 5'ten fazla kart verilirse Instagram ilk 5'i kullanıyor (aynı sayfanın Stories
  kısmı ise 10'a kadar diyor — belgede çelişkili ya da eski).
- Her kartta `link` zorunlu; CTA verilmezse "Learn more" + kartın `link`'i; `caption`
  görünen adres; kartın `name`'i görselle mesaj arasında görünüyor; `description`
  (hem `link_data` hem kart) YOK SAYILIYOR; tek `message`.
- Görsel kart: `picture` ya da `image_hash` zorunlu, **`link_data`'nın görselinden
  devralınmıyor**; `100x100` kırpma ya da otomatik kırpma; sonuç ≥ 600×600.
- Video kart: **kare**, her kenar ≥ 600 px, ≤ 60 sn, küçük resim zorunlu (`image_hash`
  ya da `picture`), otomatik oynuyor ve döngü.
- Stories karuseli: 10'a kadar kart; varsayılan kart sayısını Meta ayarlıyor
  (kullanıcı 1–3 kart görüp "Expand Story" görüyor). Yalnız Stories yerleşiminde
  `portrait_customizations.carousel_delivery_mode`: `optimal_num_cards` (varsayılan) ya
  da `fixed_num_cards` (en fazla 3 kart önce; **sonuç başına maliyeti artırabilir**;
  Katalog Satışı'nda yok). Yalnız Stories: 9:16 ya da 9:16 olmayan, karışık oran yok;
  kart başına video ≤ 120 sn (sabit kartta ≤ 15 sn). Karışık/otomatik yerleşimde 9:16
  formatı yok. Karuselde Instant Experience öğesi yok.

### Stories arka plan rengi (`portrait_customizations`)

- 9:16 olmayan kreatif tam ekrana dönüştürülünce üst ve alt boşluğun rengi:
  `portrait_customizations.specifications[].background_color.{top_color, bottom_color}`
  (RGB hex, `#` yok). Instagram, Facebook, Messenger hikâyelerinde; tek görsel, video,
  yerleşim özelleştirmeli reklamlarda. Katalog, koleksiyon ve katalog için Advantage+
  creative'de yok.
- Belirtilmezse rengi Meta üretiyor ("generated background colors") — markanın rengi
  olmayabilir.

### Etkileşimli öğeler (ürün etiketi)

- `interactive_components_spec.components[]`: `type: "product_tag"`,
  `product_tag_spec.product_id` (onaylı ürün), `position_spec.{x, y}` (0–1; görselde
  zorunlu, videoda isteğe bağlı). Karuselde `child_attachments[].components`.
- **Otomatik ürün etiketleme varsayılan açık**: görsel katalogla benzeşirse ya da hedef
  adres katalogdaki bir ürünle eşleşirse Meta etiket ekliyor. Kapatmak:
  `{"type": "product_tag", "enroll_status": "opt_out"}`. Elle etiket verilirse otomatik
  kapanıyor. `enroll_status` ile `product_tag_spec` birlikte verilirse hata.
- Hub sayfasında anketten (polling sticker) söz ediliyor ama alt sayfada yalnızca ürün
  etiketi anlatılıyor. Anket alanları belgede geçmiyor.

### Moderasyon ve gönderi bağlantısı

- `instagram_user_id` taşıyan her kreatif o hesapta bir Stream gönderisi oluşturuyor.
- Kreatif alanları: `instagram_permalink_url` (web'de görülen gönderi — "Sponsorlu" ve
  CTA yok, karuselin tamamını göstermiyor), `effective_instagram_media_id`.
- `effective_instagram_media_id/comments` YALNIZCA reklam (organik olmayan) yorumlarını
  veriyor; organik yorumlar için `source_instagram_media_id` üzerinden Graph API.
  Yorum yazma/gizleme/silme Instagram Graph API'den ve ek izin istiyor. Yaş kısıtlı medya
  ve yorumlar Graph API'den alınamıyor.
- Stories'te gönderi ve yorum yok; katalog şablonunda `effective_instagram_media_id` ve
  permalink yok.

### URL etiketleri (`url_tags`)

- Kreatif alanı; `key=value` çiftleri `&` ile. Makrolar: `{{campaign.id}}`,
  `{{adset.id}}`, `{{ad.id}}`, `{{campaign.name}}`, `{{adset.name}}`, `{{ad.name}}`.
  Yerleşimi ayırmak için `SITE_SOURCE_NAME` makrosu anılıyor (biçimi belgede yok).
- **Ad makroları ilk yayındaki ADIN anlık görüntüsünü kullanıyor** — sonradan reklamın
  adı değişirse bağlantıdaki ad değişmiyor.
- Üçüncü taraf izleme için `utm_source=instagram` öneriliyor; görüntülenme etiketleri
  (view tags) herkese açık değil.

### Önizleme

- Üç yol: reklam kimliği (`GET /<AD_ID>/previews`), kreatif kimliği
  (`GET /<CREATIVE_ID>/previews`), kreatif spec'i (`GET act_X/generatepreviews
  creative=<spec>`). Hepsi `ad_format` zorunlu; yanıt **24 saat geçerli bir iframe**.
- Ek parametreler: `creative_feature=<özellik>` (Advantage+ önizlemesi, yanıt
  `transformation_spec.<özellik>[].{body, status}` — `eligible`/`pending`/`ineligible`),
  `dynamic_asset_label=<etiket>` (çok dilli).
- Instagram önizlemesinde `instagram_user_id` ve `page_id` ikisi de zorunlu; Threads'te
  ek `threads_user_id`.
- `ad_format` değerleri (Reels sayfasındaki liste):
  - Facebook: `DESKTOP_FEED_STANDARD`, `FACEBOOK_STORY_MOBILE`,
    `INSTANT_ARTICLE_STANDARD`, `INSTREAM_VIDEO_DESKTOP`, `INSTREAM_VIDEO_MOBILE`,
    `MARKETPLACE_DESKTOP`, `MARKETPLACE_MOBILE`, `MOBILE_FEED_BASIC`,
    `MOBILE_FEED_STANDARD`, `RIGHT_COLUMN_STANDARD`, `SUGGESTED_VIDEO_DESKTOP`,
    `SUGGESTED_VIDEO_MOBILE`, `WATCH_FEED_MOBILE`, `FACEBOOK_REELS_BANNER`,
    `FACEBOOK_REELS_BANNER_DESKTOP`, `FACEBOOK_REELS_MOBILE`, `FACEBOOK_REELS_POSTLOOP`,
    `FACEBOOK_REELS_STICKER`, `FACEBOOK_STORY_STICKER_MOBILE`, `WATCH_FEED_HOME`.
  - Instagram: `INSTAGRAM_STANDARD`, `INSTAGRAM_STORY`, `INSTAGRAM_EXPLORE_CONTEXTUAL`,
    `INSTAGRAM_EXPLORE_IMMERSIVE`, `INSTAGRAM_EXPLORE_GRID_HOME`, `INSTAGRAM_FEED_WEB`,
    `INSTAGRAM_FEED_WEB_M_SITE`, `INSTAGRAM_PROFILE_FEED`, `INSTAGRAM_REELS`,
    `INSTAGRAM_REELS_OVERLAY`, `INSTAGRAM_SEARCH_CHAIN`, `INSTAGRAM_SEARCH_GRID`,
    `INSTAGRAM_STORY_CAMERA_TRAY`, `INSTAGRAM_STORY_WEB`, `INSTAGRAM_STORY_WEB_M_SITE`.
  - Threads: `THREADS_STREAM`.
  - Diğer sayfalarda geçen: `BIZ_DISCO_FEED_MOBILE`, `GROUPS_MOBILE` (koleksiyon şablon
    videosu).
- Katalog reklamında `additional_image_index` önizlemesi için `object_story_spec`'in
  tamamı verilmeli (`object_story_id` yetmiyor).
- **Ad preview plugin** yalnızca bağlantı olarak anılıyor; ayrıntısı bu grupta yok.
- Instant Experience önizlemesi: `GET /<CANVAS_ID>/preview` (iframe) ya da JS diyaloğu.

### Erişim katmanı notu (Reels sayfası)

- "Standard Access" artık **Limited Access**, "Advanced Access" artık **Full Access**.
  Full Access eşiği son 15 günde 500 Marketing API çağrısına indi. Kod değişikliği yok.
  Başkasının reklam hesabını yöneten uygulama için `ads_read` / `ads_management` Full
  (eski Advanced) erişim gerekiyor.

## Giriş anında doğrulama tablosu (medya ve metin)

Panel bu sınırları görsel/video BIRAKILDIĞI anda kontrol etmeli. "Ret" = reklam kurulamaz;
"Uyarı" = kurulur ama Meta kırpar/göstermez.

| Kontrol | Yerleşim / format | Sınır | Davranış | Kaynak |
|---|---|---|---|---|
| Genişlik | Bütün görsel ve video | ≥ 600 px | Ret (kreatif doğrulamada düşüyor) | IG media requirements |
| Önerilen görsel boyutu | Instagram | ≥ 640 px genişlik | Uyarı | aynı |
| Önerilen görsel boyutu | Facebook | ≥ 1080×1080 | Uyarı | aynı |
| Oran | IG akış/Explore görsel-video | 1,91:1 ile 4:5 arası (öneri 1:1) | Dışındaysa görsel kırpılıyor (uyarı), video kırpılamıyor (ret önerilir) | aynı |
| Kırpma sonrası boyut | IG, `100x100` kırpmalı | ≥ 600×600 | Ret | aynı |
| Boyut, kırpmasız | IG 1:1 / 4:5 / 1,91:1 | ≥ 600×600 / ≥ 600×750 / ≥ 600×315 | Ret | aynı |
| Var olan gönderi | IG, oran 1,91:1–4:5 dışında | — | **Geçersiz** (`object_story_id` ile kırpılamıyor) | aynı |
| Oran | IG Stories | 9:16 öneri; 1,91:1–4:5 de destekli | 1,91:1'den geniş → 1,91:1; 4:5–9:16 arası kırpmasız → 4:5'e kırpılıyor | aynı |
| Video oranı | IG Stories | 1,91:1–4:5 ya da 9:16 ve daha uzun | Video kırpılamıyor → arada kalan oran ret | aynı |
| Video süresi | IG akış | 3–60 sn | Ret | aynı |
| Video dosyası | IG | ≤ 2,3 GB; yükleme sonrası `is_instagram_eligible` | Ret / sonradan kontrol | aynı |
| Video küçük resmi | IG `video_data` | Zorunlu, videoyla aynı oran, ≥ 600 px | Ret | aynı |
| Video (genel yükleme özelliği) | Facebook video reklamı | MP4; 16:9–9:16; ≥ 1.200 px genişlik; 24–60 fps; ≤ 10 GB öneri | Belgede "spesifikasyon"; 600 px kuralıyla çelişiyor → en sıkısını uygula ya da uyar | fbvideoads |
| Karusel kartı | IG görsel | Kırpma sonrası ≥ 600×600 | Ret | IG carousel |
| Karusel kartı | IG video | Kare, ≥ 600 px, ≤ 60 sn, küçük resim zorunlu | Ret | IG carousel |
| Karusel kartı | Facebook görsel | 1:1, ≥ 458×458 öneri | Uyarı | videoads |
| Karusel kart sayısı | Genel | 2–10 (uygulama: 3+) | Ret | videoads / IG carousel |
| Stories karuseli videosu | Yalnız IG Stories | ≤ 120 sn/kart; sabit kart modunda ≤ 15 sn | Ret | IG carousel |
| Stories karuseli oranı | Yalnız IG Stories | Bütün kartlar 9:16 ya da bütün kartlar 9:16 değil; karışık yok | Ret | IG carousel |
| Var olan Reel | Reels boost | < 90 sn, 9:16, telif müzik/GIF/çıkartma/3. taraf filtre yok, Facebook'a paylaşılmamış | Ret (`boost_eligibility_info` ile sor) | reels-ads |
| IG gönderisi boost | Genel | Telif müzik ya da filtre yok; IGTV değil | Ret | use-posts-as-ads |
| Reels güvenli alan | Reels 9:16 | Alt %35 metin/logo içermemeli | Uyarı (otomatik ölçülemez; şablon katmanı göster) | reels-ads |
| Katalog ürün görseli | IG katalog | ≥ 600×600 | **Hata yok, IG'de gösterilmiyor** | IG media requirements |
| Ana metin | IG | ≤ 2.200 karakter | Yalnız IG: ret; karışık: **IG'de sessizce gösterilmiyor** | aynı |
| Hashtag | IG | ≤ 30 | Ret önerilir | data-cta |
| Bağlantı mesajda | IG | Tıklanamıyor | Uyarı | data-cta |
| Başlık / gövde / açıklama | Çok dilli `asset_feed_spec` | 255 / 4.096 / 10.000 | Ret | multi-language |
| Varlık sayısı | `asset_feed_spec` (çok dilli) | Tür başına ≤ 49; CTA tipi tam 1 | Ret | multi-language |
| Esnek format metni | `creative_asset_groups_spec` | `text_type` başına ≤ 5; grup başına ≥ 1 medya; tek CTA tipi | Ret | flexible-ad-format |
| Karusel kart başlığı / açıklaması | Facebook | ~35 / ~30 karakterde kesiliyor | Uyarı | videoads |
| Görsel dosya türü | — | **Belgede geçmiyor** (bu grupta JPG/PNG sınırı yazmıyor) | — | — |
| Video kart sayısı/oran (koleksiyon) | Koleksiyon | 4 küçük resim zorunlu, kırpma yalnız `100x100` | Ret | collection-ads |

## API çağrıları

| İş | Uç nokta | Yöntem | Zorunlu / ana alanlar |
|---|---|---|---|
| Kreatif oluştur | `act_X/adcreatives` | POST | `object_story_spec` ya da `object_story_id` ya da IG üçlüsü; isteğe bağlı `degrees_of_freedom_spec`, `asset_feed_spec`, `url_tags`, `platform_customizations`, `portrait_customizations`, `interactive_components_spec`, `contextual_multi_ads`, `creative_sourcing_spec`, `format_transformation_spec`, `object_type`, `product_set_id` |
| Reklam + satır içi kreatif | `act_X/ads` | POST | `adset_id`, `creative` (`{creative_id}` ya da spec), `name`, `status` (varsayılan `PAUSED`); esnek format için `creative_asset_groups_spec` |
| Kreatifi geri oku | `<CREATIVE_ID>?fields=...` | GET | `degrees_of_freedom_spec`, `asset_feed_spec`, `format_transformation_spec`, `instagram_permalink_url`, `effective_instagram_media_id`, `source_instagram_media_id`, `interactive_components_spec`, `portrait_customizations` |
| Önizleme (spec ile) | `act_X/generatepreviews` | GET | `creative`, `ad_format`; isteğe bağlı `creative_feature`, `dynamic_asset_label` |
| Önizleme (var olan) | `<AD_ID>/previews`, `<CREATIVE_ID>/previews` | GET | `ad_format`; isteğe bağlı `creative_feature` |
| Reklamı yayına al | `<AD_ID>` | POST | `status=ACTIVE` |
| Video yükle (başlat) | `act_X/video_ads` | POST | `upload_phase=start` |
| Video yükle (gövde) | `rupload.facebook.com/video-ads-upload/v25.0/<VIDEO_ID>` | POST | başlık `offset`, `file_size` ya da `file_url` |
| Video durumu | `<VIDEO_ID>?fields=status` | GET | — |
| Video yükle (bitir) | `act_X/video_ads` | POST | `upload_phase=finish`, `video_id` |
| Video listesi | `act_X/video_ads` | GET | `since`, `until` |
| IG uygunluğu | `<VIDEO_ID>` / `<POST_ID>?fields=is_instagram_eligible` | GET | — |
| IG hesapları | `{business}/instagram_accounts`, `act_X/instagram_accounts`, `{page}/instagram_accounts`, `act_X/connected_instagram_accounts`, `{business}/instagram_business_accounts` | GET | `fields=id,username,profile_pic` |
| PBIA | `{page}/page_backed_instagram_accounts` | POST / GET | — |
| IG'ye reklam hesabı ata | `{ig_user}/authorized_adaccounts` | POST / GET | `business`, `account_id` |
| Reklam yorumları | `<EFFECTIVE_INSTAGRAM_MEDIA_ID>/comments` | GET | `fields=id,message,instagram_user` |
| Instant Experience elementi | `{page}/canvas_elements` | POST | `canvas_photo` / `canvas_video` / `canvas_template_video` / `canvas_product_set` / `canvas_button` / `canvas_footer` |
| Instant Experience | `{page}/canvases` | POST / GET | `body_element_ids`, `is_published`, `source_template_id` |
| IE güncelle / yayınla / sil | `<CANVAS_ID>` / `<CANVAS_ELEMENT_ID>` | POST / DELETE | yalnızca yayınlanmamışken |
| IE önizleme | `<CANVAS_ID>/preview` | GET | — |
| Dil arama | `/search?type=adlocale&q=` | GET | — |
| Markalı içerik | `api.facebook.com/partnership-ads/fb-branded-content/<PAGE_ID>/...` | GET/PUT/POST/DELETE | `X-API-Version: 1.0.0` |

Kısa örnekler:

```
# Tek görselli, IG + FB, Advantage+ her şey kapalı, çoklu reklamveren kapalı
POST act_X/adcreatives
name=...
object_story_spec={"page_id":"P","instagram_user_id":"IG",
  "link_data":{"link":"https://...","message":"...","name":"...",
    "image_hash":"H","image_crops":{"100x100":[[0,0],[1080,1080]]},
    "call_to_action":{"type":"LEARN_MORE","value":{"link":"https://..."}}}}
degrees_of_freedom_spec={"creative_features_spec":{
  "adapt_to_placement":{"enroll_status":"OPT_OUT"},
  "image_uncrop":{"enroll_status":"OPT_OUT"}, ... }}
contextual_multi_ads={"enroll_status":"OPT_OUT"}
url_tags=utm_source=meta&utm_campaign={{campaign.name}}
```

```
# IG gönderisini reklam yap
POST act_X/adcreatives
object_id=<PAGE_ID>&instagram_user_id=<IG>&source_instagram_media_id=<MEDIA>
```

```
# AI özelliğinin önizlemesi
GET <AD_ID>/previews?ad_format=INSTAGRAM_STANDARD&creative_feature=image_uncrop
→ data[0].transformation_spec.image_uncrop[0].status = eligible | pending | ineligible
```

```
# Yerleşime göre farklı video
asset_feed_spec={"videos":[{"video_id":"V1","adlabels":[{"name":"fb"}]},
                           {"video_id":"V2","adlabels":[{"name":"ig"}]}],
  "bodies":[{"text":"..."}],"titles":[{"text":"..."}],"descriptions":[{"text":"..."}],
  "link_urls":[{"website_url":"https://..."}],"ad_formats":["SINGLE_VIDEO"],
  "call_to_action_types":["LEARN_MORE"],"optimization_type":"PLACEMENT",
  "asset_customization_rules":[
    {"customization_spec":{"publisher_platforms":["facebook"],"facebook_positions":["feed"]},"video_label":{"name":"fb"}},
    {"customization_spec":{"publisher_platforms":["instagram"],"instagram_positions":["stream"]},"video_label":{"name":"ig"}}]}
```

## Tuzaklar ve sessiz hata riskleri

**Varsayılanın sessizce açık olduğu yerler**
- `adapt_to_placement`: alan gönderilmezse açık; görsel 4:5 ve 9:16 yerleşimlere Meta'nın
  seçtiği biçimde uyarlanıyor.
- `contextual_multi_ads`: 19.08.2024'ten beri gönderilmezse `OPT_IN`; müşterinin reklamı
  rakiplerin reklamlarıyla aynı birimde çıkabilir.
- Otomatik ürün etiketleme: varsayılan açık; katalogdaki "en yakın" ürün etiketi
  reklama ekleniyor — yanlış ürün etiketlenirse hata yok.
- `multi_share_optimized`: varsayılan `true`; Facebook karuselinde kart sırası ve hatta
  hangi kartların gösterileceği Meta'nın elinde. Sıra önemliyse `false` gönderilmeli.
- `use_flexible_image_aspect_ratio`: Facebook'ta varsayılan açık; 4:5 görsel ortadan
  1:1'e kırpılıyor.
- Karusel kartında `description` (ve `name`) verilmezse **bağlantılı sayfadan
  çekiliyor** — müşterinin sitesindeki herhangi bir metin reklamda görünebilir.
- Stories arka plan rengi verilmezse Meta üretiyor.
- `instagram_positions` verilmezse bütün IG yerleşimleri; ad set'te yerleşim hiç
  verilmezse otomatik yerleşim.
- Müziğin varsayılanı ve `format_transformation_spec` yokkenki "varsayılan davranış"
  belgede tanımsız → ikisi de açıkça yazılmalı (`audios: []`, ilgili formatlar için
  `data_source: ["none"]`).

**Kabul edip uygulamama**
- Uygun olmayan Advantage+ `OPT_IN` → spec'ten sessizce siliniyor.
- Önizlemede `transformation_spec` yoksa özellik uygulanmayacak, hata yok.
- Instagram `191x100` kırpmayı yok sayıyor (yalnız `platform_customizations`'ta geçerli).
- Instagram'da `description`, başlık, `multi_share_optimized`, `multi_share_end_card`
  yok sayılıyor; Stories marka reklamında mesaj/başlık/bağlantı yok sayılıyor.
- 2.200 karakteri aşan metin karışık yerleşimde reklamı oluşturuyor ama IG'de
  göstermiyor.
- IG katalog reklamında 600 px altı ürün görseli: hata yok, Instagram'da gösterilmiyor.
- Instagram karuselinde 5'ten fazla kart: ilk 5 kullanılıyor (belgeye göre), kalanlar
  sessizce düşüyor.
- `url_tags` ad makroları ilk yayındaki adı donduruyor; sonradan yeniden adlandırma
  raporlarda eski ad olarak görünür.
- `standard_enhancements` geri okumada görünebiliyor ama uygulanmıyor — onu "açık"
  sanmak yanlış alarm, "kapalı" diye silmeye çalışmak gereksiz.

**Markayı değiştiren otomasyonlar**
- AI genişletme/arka plan/animasyon/çıkartma/metin üretimi/çeviri/seslendirme yukarıdaki
  tabloda. Önizlemesi olmayan özellikler (`creative_stickers`, `text_translation`,
  `image_text_translation`, `inline_comment`, `reveal_details_over_time`, müzik)
  yayından önce hiç görülemiyor.
- `image_background_gen` önizlemesi `PENDING` iken stok görsel gösteriyor — onay
  ekranında "bu müşterinin ürünü" sanılabilir.
- `autotranslate`: düzeltilen çeviri, dil listede kaldıkça bir sonraki çeviriyle
  siliniyor.
- `translate_voiceover` düzenlenemiyor ve yeniden üretilemiyor; tam video yayından SONRA
  üretiliyor (önizleme yalnızca ilk 6 sn).

**Belgedeki hatalı/çelişkili örnekler** (kopyalanmamalı)
- Reels sayfasındaki özel kitle örneği `countries: ["US"]` ile `regions` New York'u
  BİRLİKTE gönderiyor — Advetics'in canlıda öğrendiğine göre bu birleşim, yani ABD geneli.
- Reels ad set örneği `instagram_user_id`, `publisher_platforms`, `instagram_positions`
  alanlarını `targeting`in DIŞINDA, ad set'in kök alanı olarak gönderiyor; diğer bütün
  örneklerde yerleşim `targeting` içinde. Kökte gönderilirse kabul edilip yok sayılabilir
  — belgede belirsiz, `targeting` içinde gönderilmeli.
- Reels önizleme örneği `POST act_X/adpreviews` kullanıyor; diğer bütün sayfalar
  `GET act_X/generatepreviews`. Ayrıca o örnekte `page_id` yok (IG önizlemesinde zorunlu).
- IG insights örneği `breakdown=` (tekil) yazıyor; doğru parametre `breakdowns`.
- Add site links örnekleri `instagram_actor_id` kullanıyor (eski ad).
- Etkileşimli öğeler örneğinde `act<AD_ACCOUNT_ID>` (alt çizgisiz) adres var.
- Reminder örneğinde `"objective":""OUTCOME_ENGAGEMENT""` gibi bozuk JSON.
- Video kampanya örneği metinde `VIDEO_VIEWS` diyor, gövdede `OUTCOME_ENGAGEMENT`
  gönderiyor (ODAX geçişi).
- Görsel ölçüsü: IG video için ≥ 600 px, video yükleme özelliği ≥ 1.200 px; dosya
  boyutu 2,3 GB / 10 GB. Hangisinin bugün geçerli olduğu belgede belirsiz.
- Koleksiyon diyaloğu "yayınlanmamış" kimlik döndürüyor, IE diyaloğu "yayınlanmış" —
  iki sayfa farklı söylüyor; dönen kimliğin `is_published`'ı okunmalı.
- `marketing-api/creative` sayfası "Page Post Engagement objective" ve `page_types`
  gibi eski kavramları anlatıyor.

**Diğer**
- `video_id` reklam hesabına bağlı; başka hesabın videosu kullanılamaz (`image_hash`
  kuralının videodaki karşılığı).
- Sistem kullanıcısı business hesabına video yükleyemiyor; yalnızca reklam hesabına.
- Bir müşterinin reklam hesabı başka müşterinin IG hesabına atanamıyor (ajans iki tarafta
  admin olsa bile).
- Önizleme iframe'i 24 saat geçerli; saklanıp sonradan gösterilemez (kreatif görsel
  adresinin ölmesiyle aynı sınıf sorun).
- Karışık yerleşimde Facebook gönderisini IG ile tanıtırken DOF spec hatası →
  `DOF_MESSAGING_DESTINATION`.
- Instant Experience yayınlandıktan sonra güncellenemiyor; düzeltme = yeni IE + yeni
  kreatif.
- Stories karuselinde `fixed_num_cards` maliyeti artırabiliyor.

## Advetics'in canlı bilgisiyle karşılaştırma

| # | Canlı bilgi | Bu gruptaki belge | Sonuç |
|---|---|---|---|
| 1 | Boost'ta `destination_type` yoksa ret; doğrusu `ON_POST` | `ON_POST` geçmiyor. Hatırlatma reklamında `destination_type` ZORUNLU diye yazıyor (`ON_REMINDER`). | Belgede geçmiyor (genel ilkeyle uyumlu: ad set'te hedef türü açık yazılıyor) |
| 2 | `geo_locations` kovaları birleşim | Reels sayfasının örneği `countries: US` + `regions: New York` gönderiyor ve bunu "New York'ta yaşayanlar" diye tarif ediyor | **Çelişiyor** — belgenin örneği, Advetics'in canlıda yanlış bulduğu kurguyu "doğru" gibi sunuyor. `regions` için `{key}` nesne biçimi ise uyuşuyor |
| 3 | IG medyasının üç kimlik uzayı; gönderi `object_id` + `instagram_user_id` + `source_instagram_media_id` ile | Aynı üçlü, `object_id` = sayfa kimliği, `/{ig_user}/media` → `source_instagram_media_id`. `effective_instagram_media_id` reklamın kendi medyası (yalnız reklam yorumları), `source_` organik medya | **Uyuşuyor**; "benzeri benzerle karşılaştır" kuralını da destekliyor (`effective_` ile `source_` farklı nesneler). `ig_id`/`legacy_` bu grupta geçmiyor |
| 4 | `image_url`/`thumbnail_url` imzalı ve ölüyor | Geçmiyor. Benzer: önizleme iframe'i 24 saat geçerli | Belgede geçmiyor |
| 5 | `?ids=` tek kötü kimlik isteği düşürüyor | Geçmiyor | — |
| 6 | Click-to-WhatsApp: `app_destination: 'WHATSAPP'` | WhatsApp geçmiyor; ama Messenger ve IG Direct için aynı desen: `{type: MESSAGE_PAGE, value: {app_destination: MESSENGER / INSTAGRAM_DIRECT}}` | Desen **uyuşuyor**; WhatsApp ayrıntısı bu grupta yok |
| 7 | `limit=500` → "reduce the amount of data" | Geçmiyor | — |
| 8 | Insights'ta atıf ayarları açıkça gönderiliyor | IG insights örneği hiçbirini göndermiyor; karusel kart kırılımı notu `action_report_time=impression/conversion` değerlerini anıyor | Belgede geçmiyor (örnekler varsayılana bırakıyor — Advetics kuralı daha sıkı) |
| 9 | `age_max = 65` = "65 ve üzeri" | Reels ad set örneği `age_max: 65` gönderiyor, anlamını açıklamıyor | Belgede açıklanmıyor |
| 10 | `image_hash` hesap başına; `act_` önekli | `video_id` de reklam hesabıyla ilişkili olmak zorunda. Bütün uçlar `act_<ID>` (bir örnekte yazım hatası) | **Uyuşuyor** ve videoya genişliyor |
| 11 | `/search?type=adinterest` kısa terim | Bu grupta `type=adlocale` (dil kimlikleri) var | Belgede geçmiyor; `adlocale` yeni bilgi |
| 12 | Organik istatistik adları değişti | Geçmiyor | — |
| Ek | Advetics kodu `degrees_of_freedom_spec…enroll_status` için "Creative Must Provide enroll_status" hatasını bekliyor | Belge bu hata metnini birebir anıyor ve Standard Enhancements belgesine yönlendiriyor | **Uyuşuyor**. Hata gelirse `OPT_OUT` eklemek, belgenin kendi "hepsini tek tek yaz" yönüyle tutarlı |
| Ek | Advetics kodu `instagram_actor_id` için "v22.0'da kaldırıldı" diyor | Bu grup alan için tarih VERMİYOR. Tek sürüm notu: Ads API'nin `InstagramUserID` **uç noktası** v22.0'da, bütün sürümlerde 21.04.2025'te kalktı. Add site links örnekleri hâlâ `instagram_actor_id` gösteriyor; geri kalan her yer `instagram_user_id` | Belgede belirsiz — kod yorumundaki sürüm bu grupla doğrulanamıyor; `instagram_user_id` kullanmak her durumda doğru |
| Ek | Advetics Instagram boost'unda `instagram_positions`i açıkça yazıyor ("boş bırakılırsa bütün IG yerleşimleri") | Belge birebir aynısını söylüyor | **Uyuşuyor** |

## Yapay zekâ ile yönetim için çıkarımlar

**Araç olması gerekenler**
- `kreatif_onizle(spec | creative_id | ad_id, yerlesimler[], ozellik?)` — salt okuma,
  onaysız. Yerleşim listesi ad set'in yerleşimlerinden TÜRETİLMELİ, AI seçmemeli.
- `medya_uygunluk_kontrol(asset)` — giriş tablosundaki kuralları çalıştırır; IG için
  `is_instagram_eligible`, gönderi için `boost_eligibility_info`.
- `kreatif_olustur(...)` — her zaman `PAUSED` reklam üretir; ayrı `reklami_yayina_al`
  aracı insan onaylı.
- `kreatif_oku(creative_id)` — `degrees_of_freedom_spec`, `asset_feed_spec`,
  `contextual_multi_ads`, `format_transformation_spec` dahil; "istediğim ile Meta'nın
  kaydettiği aynı mı" karşılaştırmasını yapar (sessiz silinen `OPT_IN`'ler için).
- `ig_hesap_bul(page_id | ad_account_id)` — `instagram_user_id`'yi tahmin değil
  sorguyla bulur; sayfa-hesap eşleşmesini doğrular.
- `ig_gonderi_listele` + `ig_gonderiyi_reklam_yap` — üçlü alanla.

**Kapalı sözlükten seçilecek parametreler**
- `call_to_action.type`, `app_destination`, `ad_format`, `instagram_positions`,
  `facebook_positions`, `format_transformation_spec.format/data_source`,
  `carousel_delivery_mode`, `layout_type`, `title_id`, `autotranslate` dil kodları,
  `locales` (yalnız `/search?type=adlocale` sonucundan), `creative_features_spec`
  anahtarları ve `enroll_status`.
- Advantage+ özelliklerinin AÇIK olanları AI tarafından seçilemez; workspace'in
  kayıtlı onay listesinden gelir.

**Onay gerektirenler**
- Yayın (`ACTIVE`) ve canlı reklamda kreatif değişikliği.
- Herhangi bir Advantage+ özelliğini `OPT_IN` yapmak — müşteri seviyesinde yazılı onay;
  AI onayı ancak önizleme ekranıyla birlikte isteyebilir.
- `contextual_multi_ads` açmak, otomatik ürün etiketlemeyi açık bırakmak,
  `multi_share_optimized: true`.
- Markalı içerik izin listesi değişiklikleri, sponsor etiketi kaldırma, yorum gizleme.
- Instant Experience yayınlama (geri alınamaz, güncellenemez hâle geliyor).
- PBIA oluşturma (sayfa başına bir tane, kalıcı).

**AI'ın asla tahmin etmemesi gereken yerler**
- `instagram_user_id` ↔ `page_id` eşleşmesi (yanlış sayfa = ret ya da başka markanın
  hesabı).
- `source_instagram_media_id` (üç kimlik uzayı; yalnız `/media` sonucundan).
- CTA bağlantısı: `link_data.link` ile aynı olmak zorunda; AI farklı bir adres yazmamalı.
- Görsel kırpma koordinatları: görsel boyutundan hesaplanmalı, AI "uydurmamalı".
- Metin sınırlarına yaklaşan çıktılar: 2.200 sınırı AI'ın ürettiği metne de uygulanmalı;
  aşan metin karışık yerleşimde sessizce IG'yi kaybettirir.
- Çeviri: Türkçe kaynaktan `autotranslate` yok; AI kendi çevirisini yazarsa o da müşteri
  onayı ister.
- Bir özelliğin "varsayılan kapalı" olduğu — belgede söylenmiyorsa açıkça `OPT_OUT`
  yazılmalı.

## Panel kurgusu için çıkarımlar

**Acemi kullanıcıya sorulacaklar** (en az):
- Görsel ya da video (bırakıldığı anda doğrulama, sorun varsa sebebiyle ret).
- Ana metin (karakter sayacı 2.200'de kilit, hashtag sayacı 30'da kilit, "Instagram'da
  bağlantılar tıklanmaz" uyarısı).
- Başlık (Instagram'da görünmeyeceği söylenmeli).
- Hedef adres (CTA bu adresten otomatik; ayrı sorulmaz).
- Paylaşılmış bir gönderiyi mi öne çıkarmak istiyor, yeni reklam mı — gönderi seçilirse
  uygunluk listede baştan gösterilmeli (uygun olmayanlar soluk ve sebebiyle).

**Otomatik karara bağlanacaklar** (`goal-mapping` katmanı):
- CTA türü hedeften (Trafik → `LEARN_MORE`, mesaj → `MESSAGE_PAGE` + `app_destination`).
- Bütün Advantage+ özellikleri `OPT_OUT`, `contextual_multi_ads` `OPT_OUT`, müzik
  `audios: []`, otomatik ürün etiketleme `opt_out`, `multi_share_optimized: false`,
  `format_transformation_spec` kapalı — hepsi AÇIKÇA yazılmış hâlde.
- `instagram_user_id` sayfadan bulunur; kullanıcı IG kimliği görmez.
- Kırpma: kare yerleşimler için `100x100`, Stories için `90x160` merkezden hesaplanır ve
  önizlemede gösterilir; video kırpılamadığı için oran uymuyorsa video reddedilir ya da
  yalnız uyan yerleşimler seçilir (kullanıcıya söylenerek).
- Stories arka plan rengi markanın ana renginden (`portrait_customizations`).
- `url_tags` ajansın standart UTM şablonundan; kampanya/reklam adı makroları kimlik
  makrolarıyla birlikte (ad makrosu donduğu için kimlik raporun anahtarı olmalı).
- Önizleme: yerleşim başına ayrı `ad_format` (en az `MOBILE_FEED_STANDARD`,
  `INSTAGRAM_STANDARD`, `INSTAGRAM_STORY`, `INSTAGRAM_REELS`) her yayından önce
  gösterilir; iframe saklanmaz, her açılışta yeniden istenir.

**Yalnızca Gelişmiş modda**:
- Advantage+ creative özellikleri, her biri ayrı anahtar, yanında "markanın içeriğini
  değiştirir" rozeti ve önizlemesi olmayanlarda "önizlenemez" uyarısı. Açmak workspace
  ayarındaki müşteri onayına bağlı.
- Karusel (kart başına bağlantı, başlık; Instagram'da açıklamanın görünmediği notu,
  5 kart uyarısı), koleksiyon/Instant Experience, yerleşime göre farklı medya
  (`asset_customization_rules` ya da basit hâli `platform_customizations`), çok dilli
  reklam, esnek format (yalnız Satış/Uygulama hedeflerinde görünür), site bağlantıları,
  format otomasyonu, Stories karusel modu, hatırlatma reklamı, ürün etiketleri.
- `contextual_multi_ads` ve otomatik ürün etiketleme anahtarları.

**Kasıtlı olarak panele girmemesi önerilenler** (şimdilik):
- `translate_voiceover` (yalnız EN→ES, Türkiye pazarında karşılığı yok, düzenlenemiyor).
- `image_background_gen` (yalnız katalog + Mobile Feed).
- Markalı içerik izin listesi yönetimi (ayrı API, ayrı izin; ihtiyaç doğarsa).

## Sayfa sayfa dizin

| Dosya | Kaynak URL | Tek satır özet | Önem |
|---|---|---|---|
| `instagram__ads-api__guides.md` | https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/guides | Instagram reklam rehberlerinin dizini; anket çıkartmasından söz ediyor ama alt sayfa yalnız ürün etiketi | Düşük |
| `instagram__ads-api__guides__add-interactive-elements.md` | https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/guides/add-interactive-elements | `interactive_components_spec` ürün etiketi, konum; otomatik etiketleme varsayılan açık, `opt_out` | Orta |
| `instagram__ads-api__guides__advantage-catalog-ads.md` | https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/guides/advantage-catalog-ads | Katalog şablonu IG'de; açıklama görünmüyor, Stories kısıtları, permalink yok | Düşük |
| `instagram__ads-api__guides__call-to-action.md` | https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/guides/call-to-action | CTA verilmezse `LEARN_MORE`; sayfaya/IG profiline bağlanan trafik reklamı yapma | Orta |
| `instagram__ads-api__guides__carousel-ads.md` | https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/guides/carousel-ads | IG karusel farkları, kart kuralları, Stories karuseli ve `carousel_delivery_mode` | Yüksek |
| `instagram__ads-api__guides__customize-stories.md` | https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/guides/customize-stories | `portrait_customizations` üst/alt arka plan rengi | Orta |
| `instagram__ads-api__guides__get-ad-insights.md` | https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/guides/get-ad-insights | Yerleşim kırılımı değerleri, `boost_ads_list`, `utm_source=instagram` | Orta |
| `instagram__ads-api__guides__get-ad-preview.md` | https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/guides/get-ad-preview | IG/Threads `ad_format` değerleri, `generatepreviews` için `instagram_user_id` + `page_id` zorunlu, `instagram_permalink_url` | Yüksek |
| `instagram__ads-api__guides__ig-accounts-with-business-manager.md` | https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/guides/ig-accounts-with-business-manager | BM ile IG hesabı, `authorized_adaccounts`, hesap listeleri, `InstagramUserID` uç noktası kaldırıldı | Yüksek |
| `instagram__ads-api__guides__mixed-placements-ads.md` | https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/guides/mixed-placements-ads | `platform_customizations.instagram` ile IG'ye ayrı medya; IG `191x100`'ü yok sayıyor | Yüksek |
| `instagram__ads-api__guides__pages-ig-account.md` | https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/guides/pages-ig-account | Sayfaya bağlı IG ve PBIA; sayfa-hesap eşleşme kuralı; karşılaştırma tablosu | Yüksek |
| `instagram__ads-api__guides__post-moderation.md` | https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/guides/post-moderation | `effective_instagram_media_id` yorumları (yalnız reklam), organik için `source_` | Orta |
| `instagram__ads-api__guides__url-tags-for-tracking.md` | https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/guides/url-tags-for-tracking | `url_tags` makroları; ad makroları ilk yayında donuyor | Orta |
| `instagram__ads-api__guides__use-posts-as-ads.md` | https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/guides/use-posts-as-ads | IG/FB gönderisini reklam yapma, `boost_eligibility_info`, mesaj CTA'ları, DOF hataları | Yüksek |
| `instagram__ads-api__reference__data-cta-requirements.md` | https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/reference/data-cta-requirements | Hedef × gövde tablosu, CTA kuralları, 2.200/30 hashtag, Stories alan kısıtları | Yüksek |
| `instagram__ads-api__reference__media-requirements.md` | https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/reference/media-requirements | Oran, boyut, video süresi/boyutu, kırpma tabloları; 2.200 sınırının sessiz hâli | Yüksek |
| `instagram__ads-api__requirements.md` | https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/requirements | İki gereksinim sayfasına dizin | Düşük |
| `instagram__marketing-api__guides__reminder-ads.md` | https://developers.facebook.com/documentation/ads-commerce/instagram/marketing-api/guides/reminder-ads | Hatırlatma reklamı: `ON_REMINDER`, `REMINDERS_SET`, `upcoming_events` | Orta |
| `marketing-api__creative.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative | Kreatif nesnesi, okuma kuralı, önizleme üç yol, iframe 24 saat | Orta |
| `marketing-api__creative__advantage-creative.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative/advantage-creative | Advantage+ creative tanımı ve yönlendirme | Düşük |
| `marketing-api__creative__advantage-creative__add-site-links.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative/advantage-creative/add-site-links | `site_links_spec` + `site_extensions`; örnekler eski `instagram_actor_id` | Orta |
| `marketing-api__creative__advantage-creative__get-started.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative/advantage-creative/get-started | Bütün `creative_features_spec` özellikleri, müzik, sesli çeviri, PAUSED→önizleme→ACTIVE | Yüksek |
| `marketing-api__creative__collection-ads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative/collection-ads | Koleksiyon kreatifi, `collection_thumbnails`, ürün setli IE adımları, `object_type` | Orta |
| `marketing-api__creative__format-automation.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative/format-automation | `format_transformation_spec` format ve veri kaynakları; yokken varsayılan tanımsız | Yüksek |
| `marketing-api__creative__generative-ai-features.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative/generative-ai-features | Metin üretimi, görsel genişletme, arka plan üretimi; önizleme; AI etiketi ve sözleşme | Yüksek |
| `marketing-api__creative__multi-advertiser-ads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative/multi-advertiser-ads | `contextual_multi_ads` 19.08.2024'ten beri varsayılan `OPT_IN` | Yüksek |
| `marketing-api__creative__reels-ads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative/reels-ads | Reels yerleşim × hedef × optimizasyon tablosu, Reel boost koşulları, `ad_format` listesi, erişim katmanı adları | Yüksek |
| `marketing-api__dynamic-creative__placement-asset-customization.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/dynamic-creative/placement-asset-customization | Yerleşime göre varlık kuralları, pozisyon sözlükleri, var olan gönderiyle API'de yok | Yüksek |
| `marketing-api__flexible-ad-format.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/flexible-ad-format | `creative_asset_groups_spec`; yalnız Satış ve Uygulama hedefleri | Orta |
| `marketing-api__guides__branded-content-permissions.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/branded-content-permissions | Markalı içerik izin listesi API'si (`api.facebook.com/partnership-ads`) | Düşük |
| `marketing-api__guides__branded-content.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/branded-content | `sponsor_id`, `direct_share_status`, yorum gizleme | Düşük |
| `marketing-api__guides__instagramads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/instagramads | Instagram Ads API dizini | Düşük |
| `marketing-api__guides__instagramads__get-started.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/instagramads/get-started | IG hesap kimliği yolları, yerleşim × hedef tablosu, `instagram_positions` bağımlılıkları | Yüksek |
| `marketing-api__guides__instant-experiences.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/instant-experiences | Instant Experience elementleri, şablon kimlikleri, yayınlama, IG kısıtları, kitleler | Orta |
| `marketing-api__guides__videoads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/videoads | Video reklamı, video CTA hedefleri, izleyici kitlesi, karusel alan tablosu, kart kırılımı | Yüksek |
| `marketing-api__guides__videoads__fbvideoads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/videoads/fbvideoads | Devam ettirilebilir video yükleme (`video_ads`, `rupload`), video teknik özellikleri | Yüksek |
| `marketing-api__multi-language-ads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/multi-language-ads | Çok dilli `asset_feed_spec`, varsayılan kural, sınırlar, `autotranslate` yönleri (TR kaynak yok) | Orta |
