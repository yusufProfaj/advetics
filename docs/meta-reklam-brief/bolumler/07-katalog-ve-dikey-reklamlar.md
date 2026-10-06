# 07 — Katalog ve dikey reklamlar

> Kaynak: 255 sayfa (`_listeler/G-katalog.txt`) · Okunan: 255/255 (dokuz ajan, notlardan derlendi) · Bilgi belgeden, canlıda doğrulanmadı.
>
> Derleme notu: Bölüm, grubu dokuz parçada okuyan ajanların notlarından birleştirildi. Notlarda
> çelişki ya da belirsizlik olan yerlerde kaynak sayfaya yeniden bakıldı (media_titles fiyat
> biçimi, Shops ads `promoted_object`, ürün videosu varsayılanı, `items_batch` alan sınırları,
> HOUSING kısıtlarındaki "Avrupa" tanımı). Grubun DIŞINDA iki sayfa yalnızca çapraz kontrol için
> okundu ve metinde etiketlendi: **[SAC sayfası]** = `marketing-api__audiences__special-ad-category.md`
> (emlak sayfaları HOUSING kısıtlarını oraya havale ediyor), **[kampanya referansı]** =
> `marketing-api__reference__ad-campaign-group.md` (eski `PRODUCT_CATALOG_SALES` hedefinin ODAX
> karşılığı).
>
> Örneklerin çoğu Graph `v25.0`; seyahat, rezervasyon ve bazı commerce örnekleri v2.10–v20.0 arası
> eski sürümlerle yazılmış ve birebir kopyalanmamalı. Belge birçok yerde kendi içinde ÇELİŞİYOR;
> hiçbiri tahminle çözülmedi. Toplu liste: "Tuzaklar → Belge çelişkileri".

## Özet: Advetics için ne demek

1. **Katalog reklamı, ön koşullarından biri eksikken HATASIZ kurulup HİÇ teslim edilmeyen bir
   ürün.** Zincir: katalog → öğeler → ürün seti → katalog ile pixel arasındaki bağ → pixel
   olaylarında `content_ids` = katalog `id` → (dikey reklamlarda) event source group + dinamik
   kitle → kampanya. Boş ürün seti oluşturulabiliyor ama "sete bağlı reklam yayınlanmaz"; kitle 20
   kişinin altındaysa reklam yayınlanmıyor; eşleşmeyen `content_ids` yalnızca istatistikte
   görünüyor. Panel ve AI bu halkaları platform çağrısından ÖNCE tek tek kontrol edip eksik olanı
   NEDENİYLE söylemeli (`emptyReason` deseni).
2. **Emlak için kalıp: `home_listings` kataloğu + HOUSING özel kategorisi.** Emlak sayfaları konut
   reklamında `special_ad_categories=["HOUSING"]` beyanını zorunlu sayıyor ama kendi kampanya
   örneği alanı HİÇ göndermiyor. HOUSING açıkken [SAC sayfası]: yaş 18–65+ sabit, cinsiyet yok,
   posta kodu/mahalle/metro hedefi yok, konum hariç tutma yok, şehir/pin yarıçapı en az 15 km
   (Avrupa) ya da 25 km (ABD-Kanada), lookalike yok, ilgi alanı önceden onaylı listeden; ihlal
   sert hata (2909035). **Türkiye'nin "Avrupa" sayılıp sayılmadığı belgede tanımsız**; ABD
   dışındaki ve ABD/Kanada/Avrupa dışına ulaşan işletme alanı yine göndermek zorunda ama
   kısıtlara `NONE` ile hiç girmeyebiliyor. TR'de ne olduğu canlıda ölçülmeli.
   `special_ad_category_country` verilmezse hesabın VERGİ ÜLKESİNE düşüyor.
3. **Feed varsayılanları yıkıcı.** `update_only` varsayılanı `false` (REPLACE: dosyada olmayan öğe
   SİLİNİR); adı masum görünen `schedule` replace, `update_schedule` yalnız güncelleme;
   `deletion_enabled` bir kez açılınca kapatılamıyor. Kısmi bir dosya kataloğu ve ona bağlı ürün
   setlerini sessizce boşaltır. Ayrıca `country="US"`, `default_currency=USD` ve takvim saat
   dilimi America/Los_Angeles varsayılan; TL'li katalogda üçü de açıkça yazılmalı.
4. **Asenkron yazmada "200 döndü" hiçbir şey kanıtlamıyor.** `items_batch` yalnızca `handles`
   döndürüyor (boş dizi = hiçbir şey alınmadı ve bu HTTP hatası değil); tanınmayan alan adı YALNIZ
   uyarı; zorunlu alan eksikliği bile örnek yanıtta `warnings` içinde; `allow_upsert` varsayılanı
   `true` olduğu için kimliği yanlış yazılmış bir UPDATE yeni ve yarım bir öğe yaratıyor;
   `check_batch_request_status`, `load_ids_of_invalid_requests` verilmezse geçersiz kimlik
   listesini HER ZAMAN boş döndürüyor. Feed'de `warning` önemli alan atılıp öğe yine yazılıyor;
   `/errors` yalnızca örneklem.
5. **Fiyat biçimi uca göre değişiyor; 100 kat hata sessiz.** Feed ve `items_batch`: `"9.99 USD"`
   dizesi. Tekil `POST /{catalog}/products`: tamsayı KURUŞ + ayrı `currency`. `/home_listings`:
   float + `currency`. Ürün seti filtresi: `price_amount` = fiyat × 100. Eski `/batch`: kuruş.
   media_titles: belge iki biçimi birden yazıyor. Advetics parayı micros (BigInt) tutuyor; her uç
   için ayrı, string aritmetiğiyle çalışan bir dönüştürücü gerekecek.
6. **Kreatifte varsayılan AÇIK gelenler gönderilmezse sessizce devreye giriyor:** katalog ürün
   videosu (`media_type_automation`), `adapt_to_placement` (4:5 ve 9:16 kırpma/doldurma),
   koleksiyon kapağında Meta'nın kendi ürettiği "Advantage catalog video",
   `multi_share_end_card=true`; `force_single_link` yoksa format karusel ve kart sayısını Meta
   seçiyor; `custom_event_type` yoksa `PURCHASE`. Ayrıca `template_data.link` HER ZAMAN öğenin
   feed bağlantısıyla değiştiriliyor ve `description` Instagram'da görünmüyor.
7. **Ürün seti hem sessizce genişliyor hem sessizce boşalıyor.** Boş `filter` = katalogun TAMAMI;
   hiçbir öğeyle eşleşmeyen filtre seti oluşturuyor ama reklam yayınlanmıyor; etiket
   filtrelerinde İngilizce dışı Unicode YASAK ("Kiralık", "İzmir" gibi etiketlerle kurulan set boş
   kalabilir); `contains` enum alanda çalışmıyor; `internal_label` küçük harfe çevrilip
   saklanıyor ve `contains` eşleşmesi garanti değil; `custom_label` değiştirmek öğeyi yeniden
   politika incelemesine sokuyor.
8. **Katalogda da birden fazla kimlik uzayı var.** Feed `id` (= `retailer_id`, pixel `content_ids`
   ile BİREBİR), Meta'nın sayısal ürün kimliği (Graph tekil çağrısı), önizleme jetonu
   `catalog:{catalog_id}:{base64url(retailer_id)}`. Aynı `id` iki kez geçerse kopyaların HEPSİ yok
   sayılıyor; kimlik değiştirmek (ör. varyanta geçiş) Advantage+ ürün sıralamasını sıfırlıyor,
   pixel `content_type=product` ise sıralama hiç geri gelmiyor. Event source group paylaşımı
   reklam hesabını `act_` ÖNEKİ OLMADAN istiyor.
9. **Hedef adı `OUTCOME_SALES` olmalı.** Katalog sayfalarının çoğu (get-started, emlak, otomotiv,
   seyahat, Collaborative Ads) eski `PRODUCT_CATALOG_SALES` ile yazılmış. [kampanya referansı] eski
   hedeflerin v17.0'da kullanımdan kalktığını ve karşılığın `OUTCOME_SALES` +
   `destination_type=WEBSITE` + kampanyada `product_catalog_id` + ad set'te `product_set_id` /
   `custom_event_type` olduğunu yazıyor. Katalog ad set örneklerinin hiçbiri `destination_type`
   göndermiyor; otomotiv sayfası alan verilmezse katalogdaki web adresine gidildiğini söylüyor.
   Advetics değeri açıkça yazmalı.
10. **Grubun büyük kısmı Advetics'in müşterisine uymuyor.** Commerce Platform'un sipariş, iade,
    kargo ve finans sayfaları tarihî: Meta içi Shops checkout 4 Eylül 2025'te kalktı. Shops ads'te
    Meta kişiyi siteye mi mağazaya mı göndereceğini kendisi seçiyor. MPA en az 20.000 satıcılı
    pazar yeri istiyor. Ürün seti optimizasyonu beta ve perakende reklam ağlarına özel.
    Reservation en az 200 bin–1 milyon erişimli, TV benzeri bir alım. Seyahat ve otomotivde bugün
    müşteri yok. Bunlar panelde seçenek olmamalı; bazıları için yalnız okuma aracı yeterli.
11. **Türkiye'ye özgü sessiz riskler:** feed kodlaması beklenmeyen bir baytta LATIN1'e düşüyor
    (ğ ş ı İ bozuk görünür, hata yok); emlakta metrekare (`area_size`) Advantage+ katalog reklamında
    "uygulanmıyor" ve şablon etiketi yok; `neighborhood` Advantage+ için zorunlu; şablon fiyat
    etiketinin TL'yi nasıl biçimlendirdiği belgede yok (`round` YUKARI yuvarlıyor); dinamik tarih
    etiketlerinde saat dilimi verilmezse UTC.

## Kavramlar, kurallar ve alanlar

### Kapsam: grubun hangi parçası neye yarıyor

| Alt grup | Sayfa | Advetics için önem | Neden |
|---|---|---|---|
| Katalog temelleri ve rehberler | 33 | Yüksek | Katalog reklamının veri katmanı: feed, batch, set, teşhis |
| Katalog referansı, yeni öğe türleri | 22 | Orta | Alan sınırları; hizmet/etkinlik dikeyleri |
| Commerce Platform | 90 | Düşük | Mağaza işletilmiyor; Meta içi checkout 2025-09-04'te kalktı |
| Advantage+ catalog ads, ürün seti optimizasyonu | 17 | Yüksek | Kampanya, ad set, kreatif kurulumu |
| Otomotiv ve emlak | 16 | Emlak yüksek, otomotiv düşük | İnşaat/emlak müşterileri |
| Collaborative Ads/MPA, Reservation, Shops ads | 20 | Düşük | Pazar yeri, büyük bütçe, mağaza ürünleri |
| Seyahat (otel, uçuş, destinasyon) | 15 | Düşük | Dikey reklamın şablonu olarak öğretici |
| ProductCatalog API referansı | 42 | Yüksek | Uçların gerçek parametreleri ve varsayılanları |

### Katalog nesnesi ve erişim

- Katalog, bir işletmeye (Business) ait öğe listesi: her satır bir öğe, her beden/renk ayrı satır.
  Kullanım yerleri: Advantage+ catalog ads (eski adıyla dynamic ads / DPA), Collection,
  Instagram ürün etiketleri, Shops/Marketplace, WhatsApp. Belge, müşterinin var olan kataloğunu
  yeniden kullanmayı öneriyor (reklam ve commerce için tek katalog).
- **API ile atlanamayan ön koşul:** uygun Marketing API erişim düzeyi + katalog hizmet şartlarının
  kabulü. Şartlar ancak ilk katalog Business Manager / Commerce Manager arayüzünde ELLE
  oluşturulunca kabul edilmiş sayılıyor. Kabul etmemiş işletmede API'yle ilk katalog düşebilir;
  hata kodu belgede yok.
- İzinler: `catalog_management` (oluştur/oku/güncelle/sil), katalog güncellemek için ayrıca
  `business_management`, reklam için `ads_management`. Geliştirme modundaki uygulama yalnızca
  uygulamanın admin/geliştiricilerine ait katalogları görür; başka işletmenin kataloğu listede hiç
  çıkmaz. Uygulama kataloğun sahibi işletmeye bağlı değilse: *"Cannot access an object not
  managed by the business owning this app"* (Business Settings > Account > Apps).
- Okunabilen alanlar: `id`, `name` (varsayılan), `business`, `vertical`, `product_count`,
  `feed_count`, `is_catalog_segment` (segmentten dinamik reklam kurmadan ÖNCE okunmalı, yoksa
  reklam oluşturma hata veriyor), `is_local_catalog`, `da_display_settings`, `default_image_url`
  (görseli yüklenemeyen öğenin yer tutucusu; öğe görseli buna eşitse "görsel alınamadı" demek),
  `fallback_image_url` (otomatik üretilen öğelerin görseli).
- **`vertical`** (oluşturmada): `adoptable_pets, apps_and_software, articles_and_publications,
  commerce, destinations, flights, generic, home_listings, hotels, local_service_businesses,
  media_titles, offer_items, services, offline_commerce, transactable_items, vehicles`. Rehberler
  ayrıca `vehicle_offers` ve `activities` kullanıyor; referans enum'unda ikisi yok (belgede
  çelişkili). **Varsayılan `commerce` ve `vertical` güncellenebilir alanlar arasında YOK:** değer
  gönderilmeden açılan emlak kataloğu e-ticaret kataloğu olur ve yeniden kurulmak zorunda.
- Dikey ve öğe türü eşleşmesi (uyumsuz tür eklenemez, ör. `HOTEL` commerce kataloğuna):

| `vertical` | `item_type` (`items_batch`) | Advetics'te karşılığı |
|---|---|---|
| `commerce` | `PRODUCT_ITEM`, `STORE_PRODUCT_ITEM` | e-ticaret müşterisi olursa |
| `home_listings` | `HOME_LISTING` | **emlak/inşaat** |
| `vehicles` / `vehicle_offers` | `VEHICLE` / `VEHICLE_OFFER` | bayi / marka teklifi |
| `hotels` | `HOTEL`, `HOTEL_ROOM` | yok |
| `flights` / `destinations` | `FLIGHT` / `DESTINATION` | yok |
| `services`, `activities`, `media_titles`, `apps_and_software`, `articles_and_publications` | `SERVICE`, `ACTIVITY`, `MEDIA_TITLE`, `APP_AND_SOFTWARE`, `ARTICLE_AND_PUBLICATION` | hizmet işletmesi (`services`) olası |

- Oluşturma `POST /{business_id}/owned_product_catalogs`: `name` (zorunlu), `vertical`,
  `additional_vertical_option` (`LOCAL_DA_CATALOG` | `LOCAL_PRODUCTS`), `business_metadata`,
  `parent_catalog_id` + `catalog_segment_filter` (katalog segmenti), `da_display_settings`,
  `destination_catalog_settings.generate_items_from_pages` (vars. false),
  `flight_catalog_settings.generate_items_from_events` (vars. false), `store_catalog_settings`,
  `partner_integration`. Hatalar: 804 (nesne zaten var), 2310019 (işletme Collaborative Ads'e
  alınmamış). Referansın örnek çağrısı `/{business_id}/product_catalogs` kullanıyor, tablosu
  `/owned_product_catalogs` diyor (belgede çelişkili; tablo esas alınmalı).
- `da_display_settings`: `carousel_ad.transformation_type` ve `single_ad.transformation_type`
  (ikisi de zorunlu) ∈ `background_cropping_and_padding | background_padding | none`; dinamik
  reklamda öğe görselinin kırpılıp doldurulmasını belirler.
- Sayfaya ait katalog (sınırlı erişim, kademeli yayın): `POST /{page_id}/owned_product_catalogs`;
  yalnız `commerce` (başka dikey görünür hata verir); ajans paylaşımı
  `business_metadata.agency.{business_id, permitted_tasks}` sayısal görev kimlikleriyle.
- Güncelleme `POST /{catalog_id}`: `name`, `da_display_settings`, `default_image_url`,
  `fallback_image_url`, `*_catalog_settings`, `partner_integration`.
- Silme `DELETE /{catalog_id}`: geri alınamaz; canlı ürün seti olan katalog
  `allow_delete_catalog_with_live_product_set=true` olmadan silinmez (vars. false); 3970 = katalog
  admini değilsin. Katalog başka BM'ye taşınamaz. Commerce tarafında kataloğu işletmeden
  kaldırmak commerce hesabını da siliyor.
- Yetki: `GET|POST|DELETE /{catalog_id}/assigned_users` (`business` okumada zorunlu; `user` +
  `tasks` ∈ `MANAGE, ADVERTISE, MANAGE_AR, AA_ANALYZE`; 415 = iki adımlı doğrulama gerekli).
  `GET /{catalog_id}/dpa_eligible_ad_accounts` ÇAĞIRAN kullanıcının bu katalogla reklam
  verebileceği hesapları döndürüyor (`limit` vars. 1000) — sistem kullanıcısının listesi insan
  kullanıcınınkinden farklı olabilir. **Bir reklam hesabına katalog yetkisi veren yazma ucu bu
  grupta yok.** `connected_businesses` yetkili işletmeleri `role` süzgeciyle okur.

### Ürün öğesi (commerce) alanları

Alan ADLARI ABD İngilizcesi, değerler herhangi bir dilde olabilir. Belge, Shops için asgari
setin Advantage+ catalog ads ile AYNI olduğunu söylüyor. Zorunlu alanlar:

| Alan | Kural |
|---|---|
| `id` | ≤100, SKU önerilir. Katalogda TEKİL: **aynı `id` birden çok kez geçerse kopyaların HEPSİ yok sayılır.** Pixel `content_ids` ile BİREBİR; ek ve yerelleştirme feed'lerinde de aynı değer |
| `title` | Feed referansı ≤200 (kesilmemesi için ≤65 öneriliyor); `items_batch` tablosu ≤100. Belgede çelişkili, ≤100 güvenli |
| `description` | Düz metin; HTML, bağlantı ve tamamı büyük harf yok; başlıktan farklı. Feed ≤9999, `items_batch` ≤5000 (çelişkili) |
| `availability` | Feed referansı `in stock`, `out of stock`; `items_batch` ve OpenGraph ayrıca `available for order`, `discontinued`; partner sayfasındaki hata mesajı `preorder`, `pending` de sayıyor. Tam liste belgede belirsiz |
| `condition` | `new`, `refurbished`, `used` |
| `price` | `"9.99 USD"`: sayı + boşluk + ISO 4217; ondalık ayırıcı nokta, binlik ayırıcı ve para simgesi yok. Fiyatsız öğe `fatal` |
| `link` | http(s); işletmenin KENDİ alan adında (Facebook adresi olamaz); HTTP 200 dönmeli |
| `image_link` / `image` | JPEG/PNG, ≥500×500, ≤8 MB. `items_batch`'te `image` dizisi (≤21 `{url, tag[]}`) önerilen; `image` verilince `image_link` ve `additional_image_link` YOK SAYILIYOR. **Görsel değişince adres de değişmeli**, aynı adrese yeni dosya koymak algılanmıyor |
| `brand` | ≤100 (yanında `gtin` ya da `mpn` öneriliyor) |
| `size` | Yalnız Shops'ta giyim/ayakkabı gibi kategorilerde |

Reklam için önemli opsiyonel alanlar:
- `sale_price` (fiyattan düşük, aynı biçim) + `sale_price_effective_date` (iki ISO-8601 zaman
  `/` ile: `2014-11-01T12:00-0300/2014-12-01T00:00-0300`). **Tarih verilmezse indirim SÜRESİZ.**
- `status`: `active` | `archived` (vars. `active`; eski adı `visibility`, hâlâ kabul). Başka
  sayfalar `visibility` için `published`/`hidden`/`staging`/`whitelist_only` kullanıyor ve bir
  örnek CSV `status` sütununa `published` yazıyor (belgede çelişkili). Kullanımdan kalkan öğeyi
  silmek yerine `staging`/`archived` öneriliyor: silme aylar sonra gerçekleşiyor, ürün etiketleri
  ve görseller kaybolabiliyor.
- `item_group_id` (≤100, varyant grubu); `additional_variant_attribute` (`Scent:Fruity, Flavor:Apple`;
  çekirdek varyant nitelikleri buraya yazılmaz).
- `additional_image_link`: 10 (katalog best-practices), 20 (alan referansı), 50 (`items_batch`
  JSON dizisi) — belgede çelişkili.
- `internal_label` (eski adı `product_tags`): yalnız reklamverenin gördüğü, set süzmeye yarayan
  etiket; `['summer','trending']` biçimi (CSV'de bütün liste çift tırnakta); öğe başına 5.000
  etiket, etiket ≤110 karakter; **küçük harfe çevrilerek saklanıyor**; değiştirmek politika
  incelemesine SOKMUYOR.
- `custom_label_0..4` (≤100): kreatifte (başlık vb.) gösterilebilen metin; **her değişiklik öğeyi
  yeniden politika incelemesine sokuyor**, teslimat etkilenebiliyor; commerce için konulmuş iç
  bilgi reklam metnine sızabilir.
- `custom_number_0..4`: 0–4294967295 tam sayı (ondalık/virgül yok); sette aralık süzgeci.
- `rich_text_description`: HTML; verilirse `description` yerine gösterilir ama `description` yine
  zorunlu; **reklamlarda desteklenmiyor**; `style` vb. öznitelikler atılıyor.
- `google_product_category` (en az 2 seviye; yol ya da ID, ör. `212`) ve `fb_product_category`
  (yol ya da ID; 3. seviyesi olan kategoride en az 3 seviye): ikisi de opsiyonel; verilmezse Meta
  başlık/açıklamadan otomatik kategori atıyor (vergi amaçlı, ABD); kategoriye özgü alan
  kullanılıyorsa biri zorunlu; set süzmek için faydalı. Kategori yalnız e-ticaret kataloglarında
  anlamlı (emlak, araç, otel, uçuşta değil). GPC→FPC eşlemesi bire-çok; otomatik türetmek tahmin
  olur. Yol ayırıcısı tabloda `//`, açıklamada `>`; ID kullanmak güvenli.
- `video[0..19].url` (doğrudan dosya, YouTube bağlantısı değil, ≤200 MB), `shipping`
  (`ÜLKE:BÖLGE:SERVİS:FİYAT`, çoklu giriş virgülle; fiyat `0.0` → reklamda "ücretsiz kargo"
  bindirmesi), `expiration_date` (`YYYY-MM-DD`, geçmişse gösterilmez), `applink.*` (feed değeri
  sitedeki App Links verisini EZER; Android'de `applink.android_package` zorunlu),
  `disabled_capabilities`, `quantity_to_sell_on_facebook` (eski adı `inventory`, yalnız Shops),
  `gtin` (UPC/EAN/JAN/ISBN-13/ITF-14; tire/boşluk yok; emin değilsen verme), `mpn`, `color`
  (kelime, hex değil), `gender`, `age_group`, `material`, `pattern`, `unit_price`,
  `product_type` (≤750), `vendor_id`.
- Makine-okunur alan şeması: `facebook.com/cdn/cacheable/products/schema` (`?subverticals=true`)
  her alan için `type`, `required`, `recommended`, `example` veriyor. Yüklenebilir feed değil;
  doğrulama kurallarını elle ikinci bir listeye yazmak yerine buradan türetmek mümkün.

**Varyantlar:** gruptaki HER varyant her varyant alanını (beden, renk, cinsiyet, desen)
doldurmalı, stokta olmayanlar dahil; ebeveyn için ayrı satır açılmaz; başlık bütün varyantlarda
aynı, görsel ve bağlantı renge uygun olmalı. **Advantage+ catalog ads gruptan, pixel/uygulama
sinyaline göre YALNIZCA BİR öğe seçiyor.**

**Kimlik değişimi reklam öğrenmesini siliyor:** varyantsız feed'i (`10024`) varyantlı feed'le
(`10024_1_000`…) değiştirmek eski `id`'yi siler ve Advantage+ ürün sıralamasını sıfırlar (günler
ile haftalar arası). Pixel `content_type: 'product'` gönderiyorsa sıralama HİÇ yeniden kurulmaz.
Çözüm: bir varyanta eski `id`'yi bırakmak ya da `previous_id` (erken erişimde
`Previous_Retailer_ID` sütunu) doldurmak ve pixel'i `content_type: 'product_group'`'a çevirmek.

### Öğenin reklamda kullanılabilirlik koşulları

| # | Koşul | Bozulursa | Nereden görülür |
|---|---|---|---|
| 1 | Zorunlu alanlar tam, biçimler doğru | `fatal` → öğe hiç alınmaz, dosyanın geri kalanı yüklenir | Upload `/errors` (örneklem), `error_report`, `product_count` |
| 2 | `id` katalogda tekil | Kopyaların HEPSİ yok sayılır | Belge ayrı bir hata türü vermiyor; yüklemeden önce tekillik kontrolü |
| 3 | `availability = in stock` (araçta `available`) | Reklamda HİÇ görünmez (stokta yok işaretli öğe otomatik durur) | `error_type=PRODUCT_OUT_OF_STOCK` |
| 4 | `status`/`visibility` yayında (`archived`, `staging`, `hidden` değil) | Reklamdan sessizce çıkar | Set filtresi `visibility` |
| 5 | `disabled_capabilities` içinde `da` yok | Katalogda var, reklamda yok | `DA_DISABLED_BY_USER` |
| 6 | `expiration_date` geçmemiş | Gösterilmez | `PRODUCT_EXPIRED` |
| 7 | Politika incelemesi onaylı | `rejected` → reklamda yok | `review_status`, `PRODUCT_NOT_APPROVED`, `DA_POLICY_VIOLATION`; itiraz `additional_reviews` (istek başı ≤100 öğe, katalog başı günde 10 çağrı, öğe başı bir kez) |
| 8 | Uyarının "yeteneği engelliyor" sütunu `da` için `false` | Öğe yüklü ama dinamik reklamda yok | `error_report` CSV |
| 9 | Görsel kalıcı ve herkese açık adreste, ≥500×500 | `IMAGE_FETCH_FAILED_*`, `IMAGE_RESOLUTION_LOW`; oran 4:5–1.91:1 dışındaysa en yakın sınıra kırpılır, karusel 1:1'e kırpılır | Öğe `errors` alanı |
| 10 | `link` çalışıyor | `QUALITY_ITEM_LINK_BROKEN` | Öğe `errors` alanı |
| 11 | Öğe ürün setinin filtresine düşüyor | Set boş → sete bağlı reklam yayınlanmaz | `GET /{product_set_id}/products?summary=true` |
| 12 | (Yeniden hedeflemede) olayın `content_ids`'i öğenin `id`'siyle eşleşiyor | Kitle boş ya da küçük; **kitle < 20 → yayın yok** | `event_stats` (unmatched), `INVALID_CONTENT_ID`, `NO_CONTENT_ID` |

Ek kurallar:
- **Advantage+ catalog ads stok SAYISINI kullanmıyor:** `quantity_to_sell_on_facebook=0` ama
  `availability=in stock` ise öğe reklamda kalır ve tükenmiş ürüne para harcanır. Reklamdan
  düşürmenin yolu `availability`, `status` ya da `disabled_capabilities`.
- Öğeyi silmek yerine `out of stock` işaretlemek öneriliyor (Meta kişiyi benzer ürünlerle yeniden
  hedefleyebiliyor). Silinen öğe sitede yaşamaya devam ederse eşleşme oranı düşüyor
  (`DELETED_ITEM`).
- Kanal görünürlüğü `disabled_capabilities`: `mini_shops`, `marketplace_shops`,
  `ig_product_tagging`, `da` (Advantage+ catalog ads); geri açmak için boş dize `""`. Bir sayfa
  değerleri büyük harfle (`SHOPS`, `DA`) yazıyor (belgede çelişkili).

### Feed'ler

- **Biçimler:** CSV, TSV, RSS XML, ATOM XML, Google Sheets (XLSX ve TXT de anılıyor; zip/gzip/bz2
  sıkıştırma). CSV'de ilk satır alan adları; virgül/boşluk içeren alan çift tırnakta; iç içe
  alanlar JSON değer ya da `image[0].url`, `image[0].tag[0]` gibi düzleştirilmiş sütunlar (ikisi
  aynı dosyada karışabilir). XML `<?xml` ile başlamalı ve **tek satır en çok 5.242.880 bayt**
  (sıkıştırılmış tek satırlık XML reddediliyor); Google Merchant ad alanındaki alanlar `g:`
  önekli. Ayırıcı TAB (vars.), PIPE, TILDE. Feed başına 5 milyondan az öğe öneriliyor; Business
  Manager'dan yüklenen dosya ≤100 MB. Google Merchant feed'i doğrudan yüklenebiliyor ama
  `link`'teki Google UTM'leri temizlenmeli.
- **Kodlama:** UTF-8/16/32 otomatik algılanıyor; beklenmeyen bir baytta LATIN1'e düşülüyor
  (emlak ve seyahat sayfaları). `product_feeds.encoding` ile açıkça verilebilir (vars.
  AUTODETECT).
- **Oluşturma** `POST /{catalog_id}/product_feeds`:
  - `name` (zorunlu); `schedule` {`url`, `interval` (`HOURLY`/`DAILY`/`WEEKLY`) zorunlu; `hour`,
    `day_of_week`, `minute`, `interval_count`, `timezone`, `username`/`password`}; `update_schedule`.
  - `update_only` (vars. `false`); `deletion_enabled` (tablo varsayılanı `true`, açıklaması "false,
    v2.5'ten itibaren true" diyor; **bir kez açılınca kapatılamaz**, açıkken feed'de olmayan öğeler
    silinir).
  - `ingestion_source_type` (`PRIMARY_FEED` | `SUPPLEMENTARY_FEED`), `primary_feed_ids`;
    `override_type` (`language` | `country` | `language_and_country`), `override_value`;
    `feed_type` (`PRODUCTS`, `HOME_LISTING`, `VEHICLES`, `VEHICLE_OFFER`, `HOTEL`, `HOTEL_ROOM`,
    `LOCAL_INVENTORY`, `OFFER`, `PRODUCT_RATINGS_AND_REVIEWS`, `MEDIA_TITLE`…).
  - `country` (vars. "US"), `default_currency` (vars. USD; dosyada para birimi yoksa), `delimiter`,
    `encoding`, `quoted_fields_mode`, `file_name`, `migrated_from_feed_id` (feed bölerken öğe
    sahipliğini yeni feed'e taşır), `rules`, `selected_override_fields`.
  - Yanıt `{id, errors[]}`: **oluşturma başarılı olsa da `errors` dolu dönebilir.** Feed ID
    saklanmalı (durum, hata ve takvim değişikliği için).
  - `schedule`'ın zorunluluğu belgede çelişkili: feed-api tablosu "Required", supported-products
    sayfası "doğrudan yüklemede atla" diyor.
- **İki takvim türü:** `schedule` = REPLACE (dosyada olmayan öğe SİLİNİR, olan güncellenir, yeni
  eklenir); `update_schedule` = UPDATE (yalnız ekle/güncelle). Yaygın desen: günde bir replace +
  saatlik update. **Takvimli feed saatte birden sık çalışmıyor** (bir commerce sayfası "15
  dakikada bir" diyor; belgede çelişkili). Saat dilimi verilmezse America/Los_Angeles. Feed
  dosyası sunucu/CDN'de önbelleklenmemeli (Meta eski dosyayı çeker).
- **Doğrudan yükleme:** `POST /{feed_id}/uploads` (`url` ya da multipart `file`; `update_only=true`
  ile yalnız `id` + değişen alanlar yeter; basic auth için `username`/`password`).
- **Bir öğe aynı anda yalnızca BİR feed'de** bulunabilir; aynı `id` iki feed'e konursa hangisinin
  kazandığı belgede yok. Feed'in yönettiği öğeyi tekil API ile değiştirmek yasak sayılmalı: Meta
  bunları feed'le izlemiyor, sonraki replace üzerine yazabilir ya da silebilir.
- **Hızlı değişen alanlar:** statik alanlar takvimli feed'de, stok/fiyat gibi değişkenler YALNIZ
  Batch API'de. İkisinde birden olursa feed eski değeri geri yazar.
- **Ek (supplementary) feed:** yalnız VAR OLAN öğeleri günceller; ekleyemez, silemez. Birincil
  kaynak `GET /{catalog_id}/data_sources?ingestion_source_type=PRIMARY` ile bulunur
  (`data_sources` varsayılanı da PRIMARY; ek feed'ler listede görünmez). Bir birincil kaynağa en
  fazla 1 ek feed; bir ek feed birden çok birincile bağlanabilir. Desteklenen alanlar listesinde
  `price`, `availability`, `link`, `brand` için not yok (belgede belirsiz). Shopify'ın update-only
  feed'inde Shopify aynı alanı güncellerse senin değerin ezilir.
- **Yerelleştirme (override) feed'leri:** yalnız değişen alanlar + `id` + `override` (dil kodu
  `fr_XX`, ülke kodu `US` ya da ikisi dikey çizgiyle) + ops. `delete`. `price`, `sale_price`,
  `unit_price`, `base_price`, `status`, `availability` YALNIZ ülke feed'inde. `image_link`
  yerelleştirilemez (`image[0].url` kullanılır); `applink` alanlarından biri yerelleştirilecekse
  HEPSİ. Öncelik: dil+ülke > dil > ülke. Dil+ülke feed'i yalnız API ile; öğe başına ≤350 çift;
  100 bin üstü öğede dil/ülke başına ayrı feed zorunlu. Ana feed'de öğe silinirse bütün
  override'ları silinir. **Bir ülke için override verip bazı öğelerin override'ını unutmak o
  öğeleri o ülkede GİZLİYOR.** Toplu yolu `localized_items_batch`.
- **Feed kuralları:** `GET|POST /{feed_id}/rules` (`attribute`, `rule_type`, `params`):
  `mapping_rule` (`map_from`, sütun adı düzeltme), değer eşleme (en çok 10 eşleme, dize ≤20
  karakter), `letter_case_rule` (`capitalize_first`, `capitalize_all`, `to_upper`, `to_lower`).
  Öneriler `GET /{upload_error_id}/suggested_rules`. Güncellemede yalnız `params` değişir.
  **Kurallar Batch API'ye uygulanmıyor.**
- **Hata okuma zinciri:** `GET /{feed_id}/uploads` → `GET /{upload_session_id}/errors` (yalnız
  ÖRNEKLEM; `error_priority` high/medium/low; `severity`: `fatal` = öğe alınmadı, `warning` =
  önerilen alan eksik/bozuk, **Meta o alanı atlayıp gerisini yazıyor**) → tam rapor
  `POST /{upload_session_id}/error_report`, ardından `GET /{upload_session_id}?fields=error_report`.
  `report_status`: `NOT_REQUESTED`, `REQUESTED`, `CREATED`, `WRITE_FINISHED` (yalnız bunda
  `file_handle` = indirilebilir CSV), `SESSION_DATA_NOT_FOUND` (yüklemede hiç öğe işlenmedi;
  "boş feed" işareti), `ERROR_REPORT_OUTDATED` (30 günden eski), `FATAL_ERROR` (yeniden iste).
  CSV sütunları: `retailer_id`, mesaj, önem (`FATAL`/`WARNING`), alan, etkilenen yetenekler (`da`
  = Advantage+ catalog ads) ve yeteneği engelleyip engellemediği.

### Toplu öğe yazma: `items_batch`

- `POST /{catalog_id}/items_batch`: `item_type` (zorunlu), `requests` (zorunlu; kayıt başına
  `method` CREATE | UPDATE | DELETE + `data`; CREATE bütün zorunlu alanları, DELETE yalnız kimlik
  alanlarını ister), `allow_upsert` (**vars. `true`**: UPDATE olmayan öğeyi OLUŞTURUR),
  `item_sub_type`.
- Sınırlar: istek başına ≤5000 kayıt (önerilen <3000), gövde ≤28 MB, katalog başına dakikalık
  "Catalog Batch" sınırı. Bir düzineden fazla öğe için Batch, daha azı için tekil çağrı (çok
  sayıda tekil çağrı hız sınırına takılır). Partner sayfası: işleme ~2 dakika, aynı istekteki iki
  güncellemenin sırası garanti değil ("value flapping").
- Yanıt `{handles:[...], validation_status:[{retailer_id, errors[], warnings[]}]}`. `handles` 0 ya
  da 1 eleman: **boş dizi = hiçbir şey alınmadı.** Tanınmayan alan YALNIZ uyarı ("Unrecognised
  field").
- Sonuç: `GET /{catalog_id}/check_batch_request_status?handle=…` (sonuç dizisi tek eleman).
  Örnek alan seti `handle,status,warnings,errors_total_count,ids_of_invalid_requests`;
  `load_ids_of_invalid_requests` vars. `false` ve false iken geçersiz kimlik dizisi HER ZAMAN boş.
  `status` örnekte `finished`; diğer değerler bu grupta listelenmiyor. Örnek yanıtta "A required
  field is missing" mesajları `warnings` içinde, `errors_total_count: 6` ile birlikte.
- DELETE kimlik alanları: `PRODUCT_ITEM` → `id`; `HOME_LISTING` → `home_listing_id`; `VEHICLE` →
  `vehicle_id`; `VEHICLE_OFFER` → `vehicle_offer_id`; `HOTEL` → `hotel_id`; `HOTEL_ROOM` →
  `hotel_retailer_id` + `hotel_room_id`; `FLIGHT` → `origin_airport` + `destination_airport`;
  `DESTINATION` → `destination_id`; `STORE_PRODUCT_ITEM` → `retailer_item_id` + `store_code`.
- Hız sınırı kodları: 80014 (toplu yükleme fazla, bekle), 80009 (okuma/sorgu fazla). Yerelleştirme
  ucunda **kod 1 + "Please reduce the amount of data you're asking for…" = gövde çok büyük, kayıt
  sayısını azalt.**
- `items_batch`'teki `video` listesinden çıkarılan video SİLİNİYOR, `[]` bütün videoları siliyor
  (katalog başına 30.000 video).
- **Eski `POST /{catalog_id}/batch`:** yeni entegrasyon yapılmamalı (yalnız commerce, bakım yok,
  kaldırma tarihi yok). Geçişte değişenler: `retailer_id` istek kökünden `data.id`'ye; fiyat kuruş
  tamsayı + `currency` → `"14 GBP"` dizesi; `name`→`title`, `url`→`link`, `image_url`→`image_link`,
  `category`→`google_product_category`, `retailer_product_group_id`→`item_group_id`,
  `manufacturer_part_number`→`mpn`, `additional_image_urls`→`additional_image_link`,
  `sale_price_start_date/end_date`→`sale_price_effective_date`. Eski uç tanınmayan alanlı isteği
  TAMAMEN yok sayıyordu.
- **Tekil yollar:** `POST /{catalog_id}/products` (`name`, `retailer_id`, `image_url` ve `price`
  **int64 kuruş** ("599" = 5.99) + `currency` zorunlu; `availability` vars. `in stock`,
  `condition` vars. `new`, `visibility` vars. `published`, `allow_upsert` v24+ vars. true; hata
  10800/10801). Meta ürün kimliğiyle `POST /{FACEBOOK_PRODUCT_ID}`. Gerçek zamanlı tek öğe:
  `POST https://graph.facebook.com/catalog:{CATALOG_ID}:{base64url(retailer_id)}`.

### Ürün setleri

- `POST /{catalog_id}/product_sets`: `name` (zorunlu), `filter` (JSON, ≤500 KiB), `retailer_id`,
  `metadata` {`cover_image_url` (≥600×600, önerilen 1080×1080, ≤8 MB), `description` (≤200),
  `external_url` (tüketiciye gösterilmez ama **bu seti tanıtan reklamın VARSAYILAN adresi** olur),
  `external_url_handle`}, `publish_to_shops` (boş dizi = bütün mağazalardan kaldır). Yanıt `{id}`.
  `application/json` ile göndermek öneriliyor.
- Hatalar: **10803 = aynı filtreli set zaten var** (ad farklı olsa bile), 415 (2FA), 368, 80009.
  Güncelleme `POST /{product_set_id}`, silme `DELETE /{product_set_id}`: aktif reklamdaki set
  varsayılan olarak silinemiyor; `allow_live_product_set_deletion=true` bu korumayı kaldırıyor.
- Okuma: `GET /{catalog_id}/product_sets` (`parent_id`, `ancestor_id`, `has_children`,
  `retailer_id`; `summary.total_count`). `latest_metadata` (son gönderilen) ile `live_metadata`
  (yayında olan) ayrı; `integrity_review_status` `APPROVED`/`REJECTED`/`PENDING`. Üçü de
  varsayılan değil, `fields=` ile istenmeli: POST yanıtı "yayında" anlamına gelmiyor.
- Kapak görseli çekilemezse hata dönüyor AMA set oluşmuş olabiliyor: körlemesine yeniden denemek
  mükerrer set üretir; önce liste okunmalı.
- **Filtre kuralları:**
  - Boş `filter` (boş değer ya da `{}`) = katalogun TAMAMI.
  - Filtre hiçbir öğeyle eşleşmezse set oluşur, sete bağlı reklamlar YAYINLANMAZ.
  - Operatörler: `and`, `or`, `eq`, `neq`, `is_any`, `is_not_any`, `contains`, `not_contains`,
    `i_contains`, `i_not_contains`, `lt`, `lte`, `gt`, `gte` (sayısal), `starts_with` (artık yalnız
    ürün kategorisi alanında).
  - `contains` yalnız dize eşleşmesi içindir; enum alanda `eq` kullanılmalı.
  - Büyük/küçük harf duyarlılığı çelişkili: referans "operatörler duyarsız" diyor; emlak sayfası
    `contains`/`not_contains` için "duyarlı"; otomotiv ve seyahat sayfaları "duyarsız". Güvenli
    yol: `i_contains` ya da `eq`.
  - **Etiket filtrelerinde İngilizce dışı Unicode karakter kullanılamıyor.**
  - `internal_label` süzgeci `is_any` ile kurulmalı (küçük harf saklama; `contains` garanti değil).
  - 3 Mart 2022'de `contains, not_contains, lt, gt, lte, gte, starts_with` davranışı değişti;
    1 Haziran 2022'den sonra eski filtreli setlerin içeriği haber vermeden değişmiş olabilir.
  - `or`'un tarifi çelişkili ("yalnız biri, ikisi birden değil" yazıyor; örnek normal VEYA).
  - Fiyat süzgeci: `price_amount` / `sale_price_amount` = fiyat × 100; seyahatte `price`,
    `base_price_amount` de sent cinsinden. Feed'deki `"99.99 USD"` ile karıştırılırsa set 100 kat
    kayar ve sessizce boşalır ya da her şeyi alır.
  - Süzülebilir alanlar (seçme): `retailer_id`, `product_type`, `category`, `brand`,
    `availability`, `condition`, `custom_label_0..4` (araç ve emlakta yalnız `custom_label_0`),
    `custom_number_*`, `internal_label`, `price_amount`, `currency`, `city`, `region`, `country`,
    `postal_code`, `neighborhood`, `listing_type`, `property_type`, `num_beds`, `num_baths`,
    `num_rooms`, `num_units`, `days_on_market`, `furnish_type`, `review_status` (`rejected`,
    `pending`, `approved`), `visibility` (`published`, `staging`, `hidden`, `whitelist_only`),
    `product_feed_id`, `product_group_id`, araç/otel/uçuş alanları.
  - Örnekler: `{"retailer_id":{"is_any":["sku1","sku2"]}}`, `{"availability":{"eq":"for_sale"}}`,
    `{"or":[{"product_type":{"i_contains":"shirt"}},{"retailer_product_group_id":{"eq":"g1"}}]}`.
- **Set boyutunu oluşturmadan önce görmek:** `GET /{catalog_id}/products?filter=<aynı JSON>&summary=true`
  → `total_count`. Oluşturduktan sonra `GET /{product_set_id}/products?summary=true` (yeni
  dikeylerde `/{product_set_id}/{tür}?summary=true`). Set ve feed kenarlarında `filter` parametresi
  yok; süzgeç yalnız katalog kenarında.
- Offers API'de `target_filter` var olan bir setle birebir eşleşmezse Meta YENİ bir set yaratıyor
  (sessiz set çoğalması).

### Pixel ile katalog eşleşmesi ve katalog sağlığı

- **Bağlama:** `POST /{catalog_id}/external_event_sources` (`external_event_sources=[<PIXEL_ID>,<APP_ID>]`),
  okuma `GET` (+ `summary.total_count`). Kaldırma için `DELETE` yalnız düğüm sayfasının örneğinde
  var, kenar sayfasının silme bölümü BOŞ. Bağ yoksa olaylar akar ama katalogla eşlenmez
  (`CATALOG_NOT_CONNECTED_TO_EVENT_SOURCE`).
- **Eşleşme anahtarı:** olaydaki `content_ids` ile öğe `id`'si (retailer id), BİREBİR.
  `content_type` = `product` | `product_group` ve `content_ids` tipine uymalı; dikeylerde
  `home_listing`, `vehicle`, `vehicle_offer`, `hotel`, `flight`, `destination`. Çoklu kimlik JSON
  dizisi dizesi olarak gider (`'["1","2"]'`); virgülle birleştirmek yasak (tek, var olmayan bir
  kimlik gibi okunabilir).
- **`GET /{catalog_id}/event_stats`:** son ~28 gün, gün gün; DA olayı (`ViewContent`,
  `AddToCart`, `Purchase`) × kaynak (`PIXEL`/`APP`) için `total_matched_content_ids`,
  `total_unmatched_content_ids`, `total_content_ids_matched_other_catalogs` ve `unique_*`
  karşılıkları; `breakdowns=["device_type"]`. **Yalnız çağıranın erişebildiği olay kaynakları
  dönüyor**: sistem kullanıcısının pixel erişimi yoksa "eşleşme yok" ile "göremiyorum" ayırt
  edilemez. 270 = geliştirme erişimindeki uygulamaya izin yok. `matched_other_catalogs > 0` →
  pixel birden çok kataloğa bağlı, olaylar başka kataloğa düşüyor.
- **`GET /{PIXEL_ID}/da_checks`** (ve `/{APP_ID}/da_checks`): `pixel_missing_dpa_event` (son 24
  saatte ViewContent/AddToCart/Purchase'tan biri yok), `pixel_missing_param_in_events`,
  `pixel_decline` (haftalık ortalamanın yarısının altı), `app_missing_dpa_event`,
  `app_missing_param_in_events`; `checks=[…]` ile seçilir, verilmezse hepsi. `result` ∈ `passed` |
  `failed` | `unavailable` — **`unavailable` başarısızlık değil, şu an ölçülemiyor.** Katalog
  düzeyinde ayrıca `GET /{catalog_id}/da_checks` (`checks`, `connection_method` ALL | APP |
  BROWSER | SERVER); DACheck yanıt alanları bu grupta yok.
- **`GET /{catalog_id}/diagnostics`:** süzgeçler `affected_channels` (`da` dahil),
  `affected_entities`, `affected_features`, `severities`, `types` (`DA_VISIBILITY_ISSUES`,
  `EVENT_SOURCE_ISSUES`, `ATTRIBUTES_INVALID`, `ATTRIBUTES_MISSING`, `IMAGE_QUALITY`,
  `POLICY_VIOLATION`, `LOW_QUALITY_TITLE_AND_DESCRIPTION`, `CATEGORY`…). `EVENT_SOURCE_ISSUES`
  alt türleri (günlük güncellenir): `APP_HAS_NO_AEM_SETUP`, `CATALOG_NOT_CONNECTED_TO_EVENT_SOURCE`,
  `DELETED_ITEM`, `INVALID_CONTENT_ID`, `MISSING_EVENT` (7 gündür satın alma yok),
  `NO_CONTENT_ID`. Önem değerleri çelişkili: süzgeç tablosu `MUST_FIX | OPPORTUNITY`, rehberin yanıt
  örneği `MUST_FIX | WARNING`. Rehber tablosu `action_url`, örnek yanıt `action_uri` yazıyor;
  ikisi de okunmalı. Yanıt sayılı: `number_of_affected_items`, `sample_affected_items[]`.
- **Öğe düzeyi:** `GET /{catalog_id}/products?fields=id,errors&error_priority=HIGH&error_type=…`
  (`error_type` örnekleri: `CATALOG_NOT_CONNECTED_TO_EVENT_SOURCE`, `UNMATCHED_EVENTS`,
  `NO_CONTENT_ID`, `INVALID_CONTENT_ID`, `IMAGE_FETCH_FAILED*`, `IMAGE_RESOLUTION_LOW`,
  `EMPTY_PRICE`, `EMPTY_AVAILABILITY`, `DA_POLICY_VIOLATION`, `DA_DISABLED_BY_USER`,
  `PRODUCT_NOT_APPROVED`, `PRODUCT_EXPIRED`, `PRODUCT_OUT_OF_STOCK`, `QUALITY_ITEM_LINK_BROKEN`,
  `PROPERTY_PRICE_TOO_HIGH`/`_LOW`, `INVALID_RANGE_FOR_NUM_OF_BEDS`/`_BATHS`/`_ROOMS`,
  `PURCHASE_RATE_BELOW_VIEWCONTENT`, `NOT_ENOUGH_UNIQUE_PRODUCTS`). `GET /{item_id}?fields=errors`
  yalnız ölümcül OLMAYAN hataları verir (ölümcül olan zaten alınmamıştır). Olası hata türleri
  listesi `GET /catalog_all_errors?locale=…`. Partner sayfası teşhisin saatlik yoklanmasını
  öneriyor.
- **Pixel tabanlı katalog (microdata):** OpenGraph, Schema.org ya da JSON-LD ürün etiketleri; yalnız
  e-ticaret kataloğu; alan başına ≤500 karakter. Öğe ancak o ürün sayfasında pixel EN AZ BİR KEZ
  tetiklenince güncelleniyor: trafiği olmayan ürünün fiyatı ve stoğu katalogda eski kalır.
  OpenGraph'ta `product:gender` büyük harfli (`Female`), feed'de küçük harfli.

### Advantage+ catalog ads: uçtan uca kurulum

**Ön koşul zinciri** (her halka ayrı kontrol edilmeli; biri eksikken kurulum hatasız geçer):
1. Facebook Sayfası (Instagram hesabı opsiyonel) ve ödeme yöntemi tanımlı reklam hesabı.
2. Doğru `vertical` ile katalog, hizmet şartları kabul edilmiş, uygulama kataloğun işletmesine
   bağlı; hedef reklam hesabı `dpa_eligible_ad_accounts` içinde; katalog segmentiyse
   `is_catalog_segment` okunmuş.
3. Öğeler yüklü (`product_count` > 0, ölümcül hata yok).
4. Pixel/uygulama olayları: e-ticarette `ViewContent`, `AddToCart`, `Purchase` (mobilde
   `fb_mobile_content_view`, `fb_mobile_add_to_cart`, `fb_mobile_purchase` + `fb_content_type`,
   `fb_content_id`); `content_ids` öğe `id`'siyle birebir.
5. Katalog ile olay kaynağı arasındaki bağ (`external_event_sources`).
6. Ürün seti, `total_count` > 0.
7. Dikey dinamik kitlesinde: event source group + hesaba paylaşım + CLAIM kitlesi.

**Kampanya** — `POST /act_{id}/campaigns`:
- `objective`: belge sayfaları karışık. get-started eski adları sayıyor (`PRODUCT_CATALOG_SALES`
  önerilen; `CONVERSIONS`, `LINK_CLICKS`, `APP_INSTALLS` da destekli ve bunlarda kampanyada
  `promoted_object` zorunlu değil). Yeni sayfalar (ürün seti optimizasyonu, Shops ads)
  `OUTCOME_SALES` + `promoted_object={"product_catalog_id":"…"}`'i ikisi de zorunlu diye
  işaretliyor. Lead formlu katalog reklamı `OUTCOME_LEADS` (kampanyada katalog kimliği yok).
  [kampanya referansı]: eski hedefler v17.0'da kullanımdan kalktı; `PRODUCT_CATALOG_SALES` →
  `OUTCOME_SALES`, `destination_type=WEBSITE`, kampanyada `product_catalog_id`, ad set'te
  `product_set_id` + `custom_event_type`. Eski hedefli kampanyayı yeni hedefe kopyalamak hata
  verebiliyor.
- `special_ad_categories`: her kampanyada zorunlu dizi (`[]` dahil) [SAC sayfası]; emlakta
  `["HOUSING"]` + `special_ad_category_country`.
- `status=PAUSED`. Lead örneği ayrıca `is_adset_budget_sharing_enabled=0` gönderiyor (kampanya
  bütçesi yoksa v24'ten beri zorunlu; bkz. bölüm 04).

**Ad set** — `POST /act_{id}/adsets`:
- `promoted_object.product_set_id` **zorunlu**: ad set altındaki bütün reklamlar bu setin
  öğelerini tanıtır.
- `promoted_object.custom_event_type`: yalnız `optimization_goal=OFFSITE_CONVERSIONS` iken
  anlamlı; **gönderilmezse `PURCHASE`.** Örnek değer `ADD_TO_CART`; kitleyi o olayı yapmış
  kişilere yöneltiyor. Bu enum yazımı (`PURCHASE`, `ADD_TO_CART`); kitle kuralları ise pixel
  yazımı (`Purchase`, `ViewContent`) kullanıyor.
- `optimization_goal` / `billing_event` örnek çiftleri: `OFFSITE_CONVERSIONS` / `IMPRESSIONS`
  (dönüşüm; hem pixel hem uygulama olayı), `LINK_CLICKS` / `LINK_CLICKS` (yeniden hedefleme ve
  çapraz satış örnekleri), `LEAD_GENERATION` / `IMPRESSIONS` (lead). Geçerli çiftlerin tamamı başka
  sayfada (bkz. bölüm 04). Çapraz satışın ilk örneği `optimization_goal`'u hiç göndermiyor;
  varsayılanı belgede yok.
- `destination_type`: normal katalog ad set örneklerinin hiçbirinde YOK. Otomotiv: verilmezse
  katalogdaki web adresine gider; Facebook içi ürün sayfası için `FACEBOOK` (yalnız otomotiv
  kataloğu). Shops ads'te `WEBSITE` zorunlu. [kampanya referansı] eşlemesi `WEBSITE`. Sonuç:
  açıkça `WEBSITE` gönderilmeli.
- Örneklerde `daily_budget=15000`, `bid_amount=3000` (hesap para biriminin en küçük biriminde);
  `bid_strategy` ana örneklerde gönderilmiyor ve bu grupta varsayılanı yazmıyor.

**Hedefleme** — iki yol:
1. `targeting.dynamic_audience_ids:["<id>"]` — önceden kurulmuş dinamik kitle (opsiyonel).
   Seyahat ve otomotiv envanter (AIA) ad set'leri SATIR İÇİ kitle tanımını desteklemiyor; kitle
   önce ayrı kurulmalı.
2. `targeting.product_audience_specs` / `targeting.excluded_product_audience_specs` — satır içi,
   e-ticarette önerilen:

| Alan | Durum | Not |
|---|---|---|
| `product_set_id` | zorunlu | kitlenin HANGİ setteki olaylara bakacağı (gösterilen set değil) |
| `inclusions[]` | zorunlu, en az 1 | her inclusion TEK olay taşır |
| `inclusions[].retention_seconds` | zorunlu | kişinin kitlede kalma süresi |
| `inclusions[].rule` | zorunlu | site kitlesi kuralı; `event` alanı `eq` ile üst seviyede ya da üst seviyedeki `and` içinde olmalı |
| `exclusions[]` (`retention_seconds`, `rule`) | opsiyonel | kişiyi çıkaran olaylar |

Üç strateji:
- **Yeniden hedefleme:** belge örneği son 5 gün (`432000` sn) `ViewContent` yapıp `Purchase`
  yapmayanları alıyor, son 3 gün (`259200`) bakanları `excluded_product_audience_specs` ile
  çıkarıyor (= 3–5 gün önce bakanlar).
- **Çapraz/üst satış:** kitle BİR setin olaylarından (`product_audience_specs[].product_set_id =
  SET_2`), gösterilen öğeler BAŞKA setten (ad set `promoted_object.product_set_id = SET_1` ve
  kreatif `product_set_id = SET_1`). İki alanın farklı olması bilerek; yanlış kopyalanırsa hata
  çıkmadan yanlış kitle ya da yanlış ürün.
- **Geniş kitle:** demografik hedefleme + `OFFSITE_CONVERSIONS` + güçlü olay (`Purchase`,
  `InitiateCheckout`); son 10 günde satın alanlar `excluded_product_audience_specs` ile
  çıkarılıyor. Metin "customOptimize ekle" diyor; böyle bir alan yok, kastedilen `custom_event_type`.
- Kitle boyutu 0 sebepleri (SSS): çakışan dahil/hariç kuralı, setin pixel'in bağlı olduğu kataloğa
  ait olmaması, düşük trafik. **Kitle 20 kişiden küçükse reklam yayınlanmıyor.**

**Kreatif** — `POST /act_{id}/adcreatives`: `object_story_spec.template_data` + **kreatifin üst
seviyesinde** `product_set_id` (object_story_spec'in içinde değil). Katalog şablonları satır içi
sayfa gönderisi kullanıyor. Kreatif `/ads` çağrısında satır içi de verilebiliyor (`name`,
`object_story_spec`, `product_set_id`, `use_page_actor_override`).

| `template_data` alanı | Şablon etiketi | Davranış |
|---|---|---|
| `message` | evet | gövde metni; Instagram'da görünür |
| `name` | evet | başlık; Instagram'da görünür |
| `description` | evet | **Instagram'da GÖRÜNMEZ** |
| `link` | hayır | **her zaman öğenin feed `link`'iyle değiştirilir**; yalnız karusel bitiş kartı bu adrese gider; Facebook adresi olamaz |
| `call_to_action` | hayır | ör. `{"type":"SHOP_NOW"}`; `value` gönderilmez (lead formu istisna) |
| `force_single_link` | hayır | `true` = tek ürünlü reklam; **gönderilmezse karusel ve kart sayısını Meta seçer** |
| `multi_share_end_card` | hayır | **vars. `true`** (sayfa ikonlu bitiş kartı); `false` kaldırır |
| `show_multiple_images` | hayır | tek ürünün görselleri karuselde; `force_single_link=true` + `multi_share_end_card=false` şart |
| `child_attachments` | hayır | statik kart(lar), `static_card: true`, kendi `image_hash`, `link`, CTA; dinamik kartların önüne ya da arkasına |
| `format_option` | hayır | görülen değerler `carousel_images_multi_items`, `carousel_slideshows`, `single_image`, `single_video`, `collection_video` (tam liste yok) |
| `preferred_image_tags` / `preferred_video_tags` | hayır | etiketli medya seçimi; hiçbiri tutmazsa İLK görsel/video; video etiketi yalnız ürün videosu açıkken |
| `image_overlay_spec` / `image_layer_specs` | hayır | dinamik bindirme / katmanlı şablon (sınırlı erişim) |
| `automated_product_tags` | hayır | `true` = otomatik ürün etiketi (opt-in) |

Format tarifleri: karusel = varsayılan; tek ürün = `force_single_link:true`; tek ürün çok görsel =
aynı bayrakla birlikte `show_multiple_images:true` ve `multi_share_end_card:false`; slayt gösterisi =
`format_option:"carousel_slideshows"`; statik + dinamik kart = `child_attachments`; koleksiyon =
`format_option:"collection_video"` + `link: https://fb.com/canvas_doc/<CANVAS_ID>` (Instant
Experience). Yerelleştirilmiş katalog sayfası koleksiyon şablonunun yalnız Facebook mobil akışında
teslim edildiğini yazıyor (diğer yerleşimler sessizce yok); bunun bütün katalog koleksiyonları için
geçerli olup olmadığı belgede belirsiz.

**Şablon etiketleri** (`{{product.<alan>}}`): `name` (= feed `title`), `description`,
`short_description`, `brand`, `price` (biçimli; örnek `$1,234.56`), `current_price` (tarihi geçerli
indirim varsa indirimli fiyat, yoksa `price`), `retailer_id` (= feed `id`), `url` (= feed `link`),
`custom_label_0..4`. Seçenekler: `raw` (simgesiz), `strip_zeros`, `round` (kuruşu YUKARI
yuvarlar). Dönüşümler boru ile: `titleize`, `number_format`, `urlencode` (iki kez zincirlenebilir).
Birlikte kullanılamayan çiftler: `price` + `current_price`; `description` + `short_description`
(dikeylerde `hotel.base_price`/`sale_price`/`total_price`, `vehicle.price`/`sale_price`,
`vehicle_offer.amount`/`price`). Kategori etiketleri: `category.name`, `.description`,
`.destination_uri`, `.min_price`. **TL'nin (₺, ondalık ayırıcı) nasıl biçimlendiği belgede yok.**

**Bağlantı ve uygulama:** `template_url_spec` (kreatifin üst seviyesi: `web.url`, `ios.url`,
`ios.app_store_id`, `config.app_id`) etiketli izleme adresi kurar
(`{{product.retailer_id | urlencode}}`); verilmezse ya da gösterim anında türetilemezse KATALOG
adresine sessizce düşülür. `applink_treatment`: `web_only`, `deeplink_with_web_fallback`,
`deeplink_with_appstore_fallback`; varsayılan çelişkili (get-started: öğede app link varsa
`deeplink_with_appstore_fallback`; mobile-apps sayfası: web). `url_tags` reklam/kreatif
seviyesinde. Derin bağlantı önceliği: reklamın `template_url_spec`'i > feed `applink` > sitedeki
App Links etiketleri.

**Advantage+ creative özellikleri** (`degrees_of_freedom_spec.creative_features_spec.<özellik>.enroll_status`
= `OPT_IN` | `OPT_OUT`; kreatif ve reklam uçlarının ikisinde de çalışıyor):

| Özellik | Varsayılan | Etki |
|---|---|---|
| `media_type_automation` ("Allow product video") | **AÇIK** (allow-product-video sayfası; creative-for-catalog sayfası "isteğe bağlı opt-in" diyor — çelişkili; örnekler yine de `OPT_IN` gönderiyor) | katalogda videosu olan öğede görsel yerine video gösterebilir |
| `adapt_to_placement` ("Image touch-ups") | **AÇIK**; 4:5 ve 9:16 açık | kırpma/doldurma; 9:16 tam ekran için şart; Stories tam ekranında başlık ve açıklama görünmez |
| `add_text_overlay` | belgede yok | katalog bilgisinden dinamik bindirme |
| `dynamic_partner_content` | belgede yok | başka kampanyalardaki partnership reklamları bu reklamın koleksiyonunda görünür |
| `product_extensions` | v20.0'dan beri uygun reklamda alan ZORUNLU | tek görsel/video reklamın altına katalog öğeleri |
| `standard_enhancements` (paket) | **v22.0'dan beri yok**, önizlemesi de kalktı | alt özellikler tek tek: `image_template`, `image_touchups`, `text_optimizations`, `inline_comment`, `video_auto_crop`; varsayılanları bu grupta yazmıyor |

Alt ayarlar: `media_type_automation.customizations.video_crop_style` (`AUTO`/`NONE`, varsayılan
belgede belirsiz); `adapt_to_placement.customizations`: `image_crop_style`,
`aspect_ratio_config.ar_4_5` / `ar_9_16.enroll_status`, `showcase_card_display` (`AUTO`/`NONE`; IG
Stories'te 4 ürünlü vitrin kartı yerine ilk ürünü tam ekran gösterme).

**Katalog için Advantage+ kreatif (format otomasyonu):** zorunlu alanlar `product_set_id`,
`object_story_spec.template_data` (`multi_share_end_card`, `link`, `call_to_action` zorunlu; `name`
tek etiket, `message` opsiyonel) ve `asset_feed_spec` (`optimization_type:"FORMAT_AUTOMATION"`,
`ad_formats:["CAROUSEL","COLLECTION"]` zorunlu; `descriptions`, `images:[{hash}]`,
`videos:[{video_id}]` opsiyonel). Format ve açıklamayı her gösterimde Meta seçiyor. Açıklama
sınırları: en çok 3 seçenek, her biri tek etiket, en çok 1 serbest metin, aynı etiket iki kez
kullanılamaz. **Koleksiyon kapağı verilmezse Meta'nın kişiye göre ürettiği "Advantage catalog
video" kullanılıyor** (özel görsel, özel video ya da otomatik video; yalnız biri).

**Çok oranlı görseller:** feed'de öğe başına çok görsel; otomatik eşleşen etiketler
`INSTAGRAM_PREFERRED`, `STORY_PREFERRED`, `REELS_PREFERRED`, `ASPECT_RATIO_4_5_PREFERRED`,
`ASPECT_RATIO_9_16_PREFERRED`. Oran bazlı `preferred_image_tags` dizi öğesi kaçışlı JSON dizesi
(`{"DEFAULT":"t","4_5":"t45","9_16":"t916"}`). İndeksle görsel seçme "kaldırılacak" (tarihsiz).
Karuseldeki hiçbir öğede 9:16 yoksa varsayılan görünüm; en az birinde varsa diğerlerinin boşluğu
arka plan rengiyle dolduruluyor. get-started'daki "IG Stories'te katalog reklamı 1:1'e kırpılır"
notu bununla çelişiyor (eski bilgi olabilir).

**Ürün videosu:** feed `video[n].url`, JSON `video` sütunu, XML `<video>`, `items_batch` `video`
dizisi; ≤200 MB; ürün başına video sayısı çelişkili (get-started "şu an yalnız bir", SSS "20 URL");
videolu en az 20 ürün öneriliyor. Meta videoyu ancak öğe için pixel/uygulama olayı gelince ya da
öğe reklam önerisine girince indiriyor: reklamdan önce `video_fetch_status` = `NO_STATUS` normal
(diğer değerler `NO_URL`, `NOT_FETCHED`, `DIRECT_UPLOAD`, `FETCHED`, `FETCH_FAILED`, `OUTDATED`,
`PARTIAL_FETCH`). Teşhis `VIDEO_FETCH_FAILED_*` (`_FORBIDDEN` için `facebookcatalog/1.0` user
agent'ı beyaz listeye alınmalı). Okuma `GET /{product_item_id}?fields=videos,video_fetch_status`
(v23+ `videos`, öncesi `videos_metadata`). Hangi öğenin görselle, hangisinin videoyla gösterildiği
ve sıralamaya videonun etkisi raporlanmıyor: **görsel/video dağılımı raporda YOK.**

**Kategori reklamları:** öğe yerine kategori görseli (karar sürecinin başındaki kişiler için).
Kategori anahtarı `categorization_criteria` (`brand`, `product_type`, `google_product_category`) +
feed'deki değer; referans enum'u `BRAND|CATEGORY|PRODUCT_TYPE` yazıyor (çelişkili). Varlıklar
KATALOG seviyesinde, aynı kataloğu kullanan bütün reklamlar paylaşıyor: `name` (≤40), `description`
(≤20), `destination_uri`, `image_url` (yoksa en iyi öğelerden 2×2 kolaj). Okuma
`GET /{catalog_id}/categories?categorization_criteria=…` (öğe sayısına göre en çok 1.000
kategori); yazma `POST /{catalog_id}/categories data=[…]` (dönüş `{updated, skipped, total,
details}`). İlk güncellemede `destination_uri` zorunlu; boş `destination_uri` kategoriyi yayından
çıkarır; **kategori silinemez.** Kreatif: normal şablon + `categorization_criteria` +
`category_media_source` (`mixed` vars., `category`, `products_collage`, `products_slideshow`).
Adı ya da adresi olmayan kategoriler sessizce eleniyor (`category` modunda görselsizler de); **en
az 4 uygun kategori yoksa kreatif oluşturma düşüyor.**

**Lead formlu katalog reklamı (emlak için güçlü aday):** kampanya `OUTCOME_LEADS`; ad set
`optimization_goal=LEAD_GENERATION`, `billing_event=IMPRESSIONS`,
`promoted_object={"product_set_id":"…","page_id":"…"}`; kreatif
`template_data.call_to_action={"type":"SIGN_UP","value":{"lead_gen_form_id":"<FORM_ID>"}}` +
`multi_share_end_card:false` (genel "`value` gönderme" kuralının istisnası). Kişi bir öğeye tıklayınca
form açılıyor; lead verisindeki `retailer_item_id` formun hangi öğe için doldurulduğunu söylüyor
(`GET /{lead_id}?fields=field_data,retailer_item_id`, `GET /{form_id}/leads`, `GET /{ad_id}/leads`).
Belge yalnız "Facebook'ta" lead topladığını yazıyor; Instagram geçmiyor. Örnek kampanya
`special_ad_categories=[]` gönderiyor; emlakta HOUSING olmalı.

**Ürün uzantıları:** tek görsel/video reklamın altına katalog öğeleri ("Add catalog items");
uygunluk `SALES` ya da `TRAFFIC` hedefi + tek medya + katalog. Alanlar
`creative_sourcing_spec.associated_product_set_id` +
`creative_features_spec.product_extensions={"enroll_status":"OPT_IN","action_metadata":{"type":"MANUAL"}}`.
**v20.0'dan beri uygun her reklam isteğinde `enroll_status` zorunlu**; gönderilmezse ne olduğu
belgede yok.

**Yerelleştirilmiş şablon:** `template_data.customization_rules_spec[]`; her öğe `customization_spec`
(zorunlu, `{language:'fr_XX'}`) + opsiyonel `message`, `link`, `name`, `description`,
`template_url_spec` (yalnız web), `video_id`/`picture` (yalnız koleksiyon). Dizide TAM BİR öğe
yalnız `customization_spec` taşımalı (şablonun varsayılan dili). Önizleme
`dynamic_customization={"language":"fr_XX","country":"FR"}`.

**Mobil uygulama:** zorunlu olaylar ve `fb_content_type` (`product`/`product_group`), `fb_content_id`
(JSON dizi dizesi); `tracking_spec` anahtarı belgede çelişkili (`fb_pixel` / `offsite_pixel`).
Advantage+ app campaigns'te dinamiklik yalnız kreatifte: `POST /act_{id}/ads` +
`creative={name, object_story_spec, product_set_id}`; oluşturmada `status` yalnız `ACTIVE`/`PAUSED`.

**Önizleme, doğrulama, rapor:**
- `GET /{creative_id}/previews?ad_format=…&product_item_ids=[…]` — `ad_format` örnekleri
  `DESKTOP_FEED_STANDARD`, `MOBILE_FEED_STANDARD`, `INSTAGRAM_STANDARD`; `product_item_ids` FBID ya
  da `catalog:{catalog_id}:{base64url(retailer_id)}` jetonu; birden çok öğe = karusel önizlemesi.
- `execution_options` (reklam ucu): `validate_only` (hiçbir şey değiştirmeden doğrular),
  `synchronous_ad_review` (yalnız `validate_only` ile; dil ve bütünlük kontrolleri),
  `include_recommendations`; başarıda `{"success": true}`. Para harcamadan Meta doğrulaması.
- Ürün kırılımı `GET /act_{id}/insights?breakdowns=["product_id"]&action_breakdowns=["action_type"]`.
  Belge örneği atıf parametresi göndermiyor.
- Yorum/beğeni: `GET /{effective_object_story_id}/dynamic_posts` — Instagram yorumlarını
  DÖNDÜRMÜYOR; Placement Asset Customization reklamları da dönmüyor.
- Video metrikleri eşlemesi: `video_continuous_2_sec_watched_actions`, `actions:video_view` (3 sn),
  `video_thruplay_watched_actions`, `video_p25…p100_watched_actions`, `cost_per_thruplay`.

### Emlak: `home_listings` ve HOUSING

#### HOUSING özel reklam kategorisi

Emlak sayfasının söylediği: konut pazarlayan kampanya `HOUSING`'i özel kategori olarak bildirmek
ZORUNDA ve bildirince hedefleme seçenekleri daralıyor; Home Listing kataloglu Advantage+ catalog
ads bu kısıtlara tabi; gerekçe 2019 ABD uzlaşması. **Hangi kısıtların, hangi ülkelerde geçerli
olduğu emlak sayfalarında YOK**; yalnız SAC sayfasına bağlantı var. Kampanya örneği
(`real-estate-ads__ads-management.md`) `special_ad_categories`'i hiç göndermiyor.

[SAC sayfası] çapraz kontrol:
- Her yeni ya da düzenlenen kampanyada `special_ad_categories` zorunlu dizi (`[]` ya da `NONE`
  dahil; 2020-03-31'den beri API'de herkes için). Değerler: `HOUSING`, `EMPLOYMENT`,
  `FINANCIAL_PRODUCTS_SERVICES` (`CREDIT` 14 Ocak 2025'te bununla değiştirildi),
  `ISSUES_ELECTIONS_POLITICS`.
- `special_ad_category_country` (ISO alpha-2 dizi): HOUSING/EMPLOYMENT/FINANCIAL için verilmezse
  reklam hesabının VERGİ ÜLKESİNE düşüyor.
- Kısıtlar ABD merkezli ya da ABD, Kanada veya Avrupa'ya ulaşan reklamverenler için:

| Boyut | HOUSING açıkken |
|---|---|
| Yaş | 18–65+ sabit; özel yaş → 2909035 |
| Cinsiyet | seçilemez; `genders` hiç gönderilmemeli (varsayılan hepsi) |
| Konum | hariç tutma yok; seçilen şehir/adres/pin çevresinde yarıçap en az 15 mil / 25 km (ABD-Kanada), 15 km (Avrupa); `zips`, `subcity`, `neighborhood`, `metro_area`, `small_geo_area`, `subneighborhood`, `electoral_district` desteklenmiyor |
| Detaylı hedefleme | davranış ve demografi yok; ilgi alanı hariç tutma yok; ilgi alanları önceden onaylı listeden |
| Benzer kitle | lookalike yok (dahil etmek de hariç tutmak da hata); Saved Audiences kalkıyor; Special Ad Audience v15.0'dan beri oluşturulamıyor |
| Serbest | Custom Audience dahil/hariç, Custom Audience genişletme, Advantage+ Audience, Detailed Targeting Expansion |

- Müşteri listesi kitlesinin uygunluğu: `is_eligible_for_sac_campaigns` (+ `special_ad_categories`,
  `special_ad_category_countries` parametreleri).
- `tune_for_category` kullanılırsa yaş, yarıçap ve cinsiyet OTOMATİK düzeltiliyor (hedefleme
  sessizce genişler).
- Kısıt ihlali sert hata (2909035). Kategorisiz açılan konut reklamı ise sonradan incelemeyle
  durdurulabiliyor (gecikmeli hata: yayın başlar, sonra kesilir).

**Türkiye belirsizliği:** [SAC sayfası] "ABD dışındaki ve ABD, Kanada, Avrupa DIŞINDAKİ kitlelere
ulaşan işletmeler alanı yine göndermeli ama kısıtlara opt-in ya da `NONE` ile opt-out yapabilir"
diyor. "Europe" hiçbir yerde tanımlanmıyor (AB mi, AEA mı, coğrafi Avrupa mı); kredi kuralında
"Avrupa'nın bazı bölgeleri" ifadesi bile geçiyor. Buna göre:
- TR hedefli emlak reklamında HOUSING beyanının zorunlu mu tercihe bağlı mı olduğu belgede belirsiz.
- Beyan edilirse hangi yarıçap sınırının uygulandığı (15 km, 25 km ya da hiçbiri) belgede belirsiz.
- Vergi ülkesi TR olan hesapta `special_ad_category_country` verilmezse TR'ye düşüyor.
- Ölçüm önerisi: TR hedefli, HOUSING'li `PAUSED` bir taslak ad set'i yaş 25–45 ve küçük bir
  yarıçapla kurmayı denemek; sonuç hata mı (2909035), sessiz düzeltme mi (nesne geri okunarak),
  kabul mü. (`validate_only` bu grupta yalnız reklam ucunda belgelenmiş; ad set ucunda çalışıp
  çalışmadığı burada yazmıyor.)

#### Katalog, feed ve alanlar

- Katalog: `POST /{business_id}/owned_product_catalogs` `name`, `vertical=home_listings` (açıkça;
  varsayılan commerce, sonradan değişmez).
- Feed: Advantage+ için XML (`<listings>` kökü, `<listing>` öğeleri), CSV, TSV; Commerce
  (Marketplace emlak) yalnız XML. Alan adları İngilizce, değerler her dilde. Tek feed ya da
  acenta/şube başına feed. LATIN1 düşüşüne dikkat. Tekil yükleme `POST /{feed_id}/uploads url=…`.
- Zorunlu alanlar (Advantage+ catalog ads):

| Alan | Kural |
|---|---|
| `home_listing_id` | en ayrıntılı tekil kimlik; pixel `content_ids` ile eşleşir |
| `name` | ilan başlığı |
| `availability` | `for_sale`, `for_rent`, `sale_pending`, `recently_sold`, `off_market`, `available_soon` (Commerce'te yalnız `for_rent`). Hangilerinin reklamdan düştüğü belgede yazmıyor |
| `address` | `addr1` (zorunlu), `city`, `region`, `country` (zorunlu), `postal_code` (posta kodu sistemi olan ülkede zorunlu); konuma çözülebilmeli. Tekil `/home_listings` ucu `street_address` diyor (çelişkili) |
| `latitude`, `longitude` | emlak rehberinde zorunlu, `items_batch` tablosunda opsiyonel (çelişkili; gönder) |
| `neighborhood` | rehberde Advantage+ için zorunlu, en çok 20 (`neighborhood[0]`, `neighborhood[1]`…); `items_batch`'te opsiyonel (çelişkili; gönder) |
| `price` | "tutar boşluk ISO kodu". Rehber örneği `13,999 USD` (binlik VİRGÜLLÜ), `items_batch` örneği `4000000 JPY`, tekil uç float + ayrı `currency` (biçim çelişkili; binlik ayırıcısız yazmak güvenli) |
| `image` | en çok 20 (`items_batch` 21), her biri ≤4 MB; `image[n].url` (JPG/GIF/PNG), `image[n].tag` (`INSTAGRAM_STANDARD_PREFERRED` Instagram'ın varsayılan görselini seçer, büyük/küçük harf duyarlı). Karusel/koleksiyon 1:1, en az 500×500 (önerilen 1024×1024 ya da 600×600, çelişkili); tek görsel 1.91:1 (1200×628 ya da 1200×630) |
| `url` | ilan sayfası |

- Opsiyonel (Advantage+): `description` (≤5000), `num_beds` (stüdyo 0), `num_baths`, `num_units`,
  `year_built` (YYYY; tekil uçta zorunlu), `property_type` (`apartment`, `condo`, `house`, `land`,
  `manufactured`, `other`, `townhouse`), `listing_type` (`for_rent_by_agent`, `for_rent_by_owner`,
  `for_sale_by_agent`, `for_sale_by_owner`, `foreclosed`, **`new_construction`**, `new_listing`),
  `status` (`active`/`archived`; ortakların `staging` değeri archived gibi davranıyor), `applink`,
  `available_dates_price_config`, `video`. Commerce'in `property_type` listesi farklı
  (`builder_floor`, `house_in_condominium`, `house_in_villa`, `loft`, `penthouse`, `studio` ekli).
- **Advantage+ katalog reklamında UYGULANMAYAN (yalnız Commerce):** `area_size`, `area_unit`
  (`sq_ft` | `sq_m`), `num_rooms`, `home_listing_group_id`, `ac_type`, `furnish_type`,
  `heating_type`, `laundry_type`, `parking_type`, `pet_policy`, `partner_verification`. Metrekare
  reklamda yapısal alan olarak yok ve şablon etiketi yok; başlığa ya da açıklamaya yazılmalı. (Set
  filtresi listesi `num_rooms` ve `furnish_type` sayıyor; tutarsız.)
- `available_dates_price_config`: `start_date` (dahil), `end_date` (hariç), `rate` (tam sayı kuruş:
  `10000` = 100.00), `currency` (`rate` varsa zorunlu), `interval` (`nightly`, `weekly`, `monthly`,
  `sale`). Yalnız `start_date` verilirse `end_date` = +1 yıl; yalnız `end_date` verilirse
  `start_date` = bugün. **Pixel olaylarında `lease_start_date` ve `lease_end_date` gönderilmezse
  özellik çalışmıyor** (alan katalogda durur, hata yok).
- Liste seti: `POST /{catalog_id}/product_sets` `name`, `filter={"availability":{"eq":"for_sale"}}`;
  emlak rehberindeki filtre alanları `availability`, `listing_type`, `property_type`, `price`,
  `name`, `city`, `region`, `country`, `postal_code`, `num_beds`, `num_baths` (referans ayrıca
  `neighborhood`, `days_on_market`, `num_units`, `home_listing_id`, `custom_label_0` sayıyor).
- Emlağa özgü öğe hata türleri: `PROPERTY_PRICE_TOO_HIGH`, `PROPERTY_PRICE_TOO_LOW`,
  `INVALID_RANGE_FOR_NUM_OF_BEDS` / `_BATHS` / `_ROOMS`.
- Marketplace emlak (Commerce yolu): işletme doğrulaması, yalnız bazı ülkeler, partner listesi;
  lead'ler Messenger yerine formla partnere gidiyor. Advetics için ilgisiz.

#### Olaylar ve anlamları

Dört olay da "◉ zorunlu: olmadan reklam çalışmaz" işaretli:

| Pixel | Uygulama | Emlakta ANLAMI |
|---|---|---|
| `Search` | `fb_mobile_search` | ilan araması |
| `ViewContent` | `fb_mobile_content_view` | bir ilanı görüntüleme |
| `InitiateCheckout` | `fb_mobile_initiated_checkout` | ilanı kaydetme / beğenme / özel ilgi |
| `Purchase` | `fb_mobile_purchase` | ilan hakkında emlakçıyla İLETİŞİME geçme |

- `content_ids` zorunlu (string ya da string[]; Search'te en üst sonuçların kimlikleri;
  `home_listing_id` ile eşleşmeli). `content_type` tabloda "gerekmez" ama örneklerin hepsi
  `home_listing` gönderiyor (dizi de olabilir: `['home_listing','product']`).
- Önerilen: `lease_start_date`, `lease_end_date` (`YYYY-MM-DD`), `preferred_baths_range`,
  `preferred_beds_range` (`[min,max]` tam sayı), `preferred_price_range` (`[min,max]` float),
  `currency`, `property_type`, `listing_type`, `availability` (katalogla aynı enum), `city`,
  `neighborhood`, `region`, `country`. Search örneği `city`/`region`/`country` için "zorunlu"
  diyor, tablo "önerilen" (çelişkili; gönder). Uygulamada parametreler `fb_` önekli; `lease_*`,
  `preferred_*`, `property_type` için mobil adlar verilmemiş (belgede belirsiz).
- Çevrimdışı dönüşümler (opsiyonel; günlük, olaydan sonra 48 saat içinde): hash'li eşleşme
  anahtarları (`email`, `phone`, `fn`, `ln`, `zip`, `ct`, `st`, `country`, `dob`, `gen`…) + `lead_id`;
  `content_ids` = `home_listing_id`, `content_type` = `home_listing`; `event_time`, `value` (kira
  değeri, kira dışı olaylarda 0), `currency` zorunlu. **Olay adlarının anlamı pixel'dekinden
  FARKLI:** `Lead` = telefon/nitelikli lead, `CompleteRegistration` = randevu, `InitiateCheckout` =
  ACENTA ZİYARETİ, `AddPaymentInfo` = mülk gezisi, `Purchase` = KİRA SÖZLEŞMESİ İMZALANDI.

#### Kitle ve event source group

- Event source group (bir İŞLETME ADMİNİ kurmalı): `POST /{business_id}/event_source_groups`
  `name`, `event_sources=[<PIXEL_ID>,<APP_ID>]`; reklam hesaplarıyla paylaşım
  `POST /{esg_id}/shared_accounts` `accounts=["<HESAP_ID>"]` — **`act_` ÖNEKİ OLMADAN.** Kataloğu
  olay kaynağına bağlamaktan AYRI ve ek bir zorunluluk.
- Dinamik kitle `POST /act_{id}/customaudiences`: zorunlu `name`, `subtype=CLAIM`,
  `claim_objective=HOME_LISTING`, `event_source_group`, `inclusions[]` (her biri `event` ∈
  `Search` | `ViewContent` | `InitiateCheckout` | `Purchase` + `retention {min_seconds,
  max_seconds}`, **en az 4 saat**; opsiyonel `count`, ör. `{"gt":0}`). Opsiyonel
  `content_type=HOME_LISTING`, `description`, `exclusions[]`, `rule` (site kitlesi sözdizimi,
  inclusion/exclusion'dan ÖNCE uygulanır; `home_listing_set_id: {"eq":"<SET>"}`). Örnek: son 14
  gün (`1209600`) `ViewContent` ya da `Purchase`. Dönen kimlik ad set'in `dynamic_audience_ids`'ine.
- `subtype=CLAIM` gönderiliyor ama seyahat kitlesi sayfası `subtype`'ın bu tür kitlelerde 2018'den
  beri desteklenmediğini yazıyor (belgede çelişkili).

#### Kampanya kurulumu (emlak sayfasının kalıbı)

- Kampanya: `objective=PRODUCT_CATALOG_SALES` (→ `OUTCOME_SALES`), `promoted_object.product_catalog_id`,
  `status=PAUSED` + örnekte OLMAYAN `special_ad_categories=["HOUSING"]` ve
  `special_ad_category_country`.
- Ad set: `optimization_goal=OFFSITE_CONVERSIONS`, `billing_event=IMPRESSIONS`, `bid_amount=3000`,
  `daily_budget=15000`, `targeting={"geo_locations":{…},"dynamic_audience_ids":[…]}`,
  `promoted_object={"product_set_id":"…","custom_event_type":"PURCHASE"}` — emlakta `PURCHASE` =
  emlakçıyla iletişim.
- Kreatif: `object_story_spec={"page_id":…, "template_data":{"description","link","message","name"}}`
  ve üst seviyede `product_set_id`; `template_url` / `template_url_spec` kurulamazsa KATALOG adresine
  düşülüyor.
  Tek ilan ya da karusel; tek ilanda aynı ilanın çok görseli; statik + dinamik kart karışımı.
  Şablon etiketleri: `home_listing.name`, `.description`, `.price`, `.city`, `.region`, `.country`,
  `.street_address`, `.num_beds`, `.num_baths`, `.num_units`, `.year_built` (`titleize`,
  `strip_zeros`; örnekte `strip_zeros` boru olmadan yazılmış, tutarsız).
- Reklam: `tracking_specs=[{"action.type":["offsite_conversion"],"fb_pixel":[…]},{"action.type":["post_engagement"],"page":[…],"post":[…]}]`.
- Alternatif: yukarıdaki lead formlu katalog reklamı. Hangisinin uygun olduğu müşterinin sitesinde
  ilan kimlikli pixel olaylarının olup olmamasına bağlı; HOUSING ikisinde de geçerli.

### Otomotiv (kısa)

- İki ürün. **Envanter reklamı (AIA)** stoktaki tekil araçları tanıtıyor (katalog `vertical`'ı bu
  sayfalarda yazmıyor; `vehicles` bekleniyor, doğrulanmadı). **Model/teklif reklamı** (adresi hâlâ
  `aoa`) modelleri ve kiralama/kredi/nakit tekliflerini tanıtıyor: `vertical=vehicle_offers`, tek
  feed; bölgesel teklifte zorunlu `comscore_market_codes` ABD pazar kodu, TR karşılığı yok.
- AIA zorunlu alanlar: `vehicle_id` (mükerrerde HEPSİ yok sayılır; VIN kullanılabilir), `title`,
  `description`, `url`, `make`, `model`, `year`, `mileage.value` + `mileage.unit` (`MI` | `KM`),
  `image[0].url`, `body_style` (`CONVERTIBLE`, `COUPE`, `HATCHBACK`, `MINIVAN`, `TRUCK`, `SUV`,
  `SEDAN`, `VAN`, `WAGON`, `CROSSOVER`, `SMALL_CAR`, `OTHER`), `price` (`"18000 USD"`),
  `exterior_color`, `state_of_vehicle` (`New`, `Used`, `CPO`); bayi için `address` JSON'u YA DA
  `address.*` sütunları (**ikisi birden hata**), `latitude`, `longitude`. `availability=not_available`
  reklamda gösterilmiyor. Enum'lar büyük/küçük harf duyarsız ama değer kümeleri sayfadan sayfaya
  farklı (drivetrain katalogda `4X4`, olay sayfasında `FOUR_WD`).
- Olaylar: AIA `Search`, `ViewContent`, `AddToWishlist` (`content_type=vehicle`); model reklamında
  bunlara `Lead` ekleniyor (`content_type=vehicle_offer` zorunlu; pixel örneği zorunlu
  `content_ids`'i göndermiyor). Kitle: `claim_objective=VEHICLE` (satır içi `event_sources`) ya da
  `VEHICLE_OFFER` (`event_source_group`); AIA ad set'inde satır içi kitle yok.
- `destination_type` verilmezse katalog web adresi; Facebook içi ürün sayfası için `FACEBOOK` +
  izin listesindeki katalog ve `fb_page_id` (Meta temsilcisi onayı olmadan sayfa kimliği içe
  alınmıyor). Tekil `POST /{catalog_id}/vehicles`'ta `mileage.unit` vars. MILES.

### Seyahat: otel, uçuş, destinasyon (kısa)

Üç dikey aynı iskeleti kullanıyor ve dikey reklam mimarisinin iyi bir şablonu: katalog (`vertical`
= `hotels` | `flights` | `destinations`) → feed → en az bir set (zorunlu) → `external_event_sources`
→ olaylar (`Search`, `ViewContent`, `InitiateCheckout`, `Purchase`) → event source group +
`claim_objective=TRAVEL` kitlesi → `PRODUCT_CATALOG_SALES` kampanyası (ad set'te satır içi kitle yok).

| | Destinasyon | Uçuş | Otel |
|---|---|---|---|
| Öğe kimliği | `destination_id` | yok; rota = `origin_airport` + `destination_airport` (IATA) | `hotel_id` (+ `room_id`) |
| Olay eşleşmesi | `content_ids` | IATA çifti (olay tablosunda HİÇ yok, yalnız kod örneklerinde "REQUIRED") | `content_ids` |
| Kitle `content_type` | `DESTINATION` | `FLIGHT` (`flight_set_id` zorunlu denmiş, örnekler göndermiyor) | `HOTEL` |
| Insights `product_id` | `destination_id` | `origin:destination` dizesi | `hotel_id` |

- Kitle: `inclusions` (`event`, `retention` ≥4 saat, `booking_window`, `count`), `exclusions`,
  `rule` (set kimlikleri, `length_of_stay`, `num_travelers`, tarih alanları,
  `itinerary_contains_date`). **Birden çok inclusion BİRLEŞİM (VEYA).**
- **Şablon etiketleri veri yokken sessiz varsayılana düşüyor:** giriş/gidiş tarihi YARIN,
  çıkış/dönüş YARINDAN SONRAKİ GÜN, `num_adults` 1 (belge "değişebilir" diyor),
  `trip.currency_code` feed'in para birimi; deep link kullanıcının hiç seçmediği tarihlerle açılır.
  Dinamik tarih `{{date.today date_offset:+12d}}`; saat dilimi verilmezse UTC; birim harfleri
  sayfada tutarsız (`+12d`/`+3m` ile `+14D`/`-3W`).
- Uçuş: olaylardan otomatik rota üretimi (`flight_catalog_settings.generate_items_from_events`) +
  görselsiz rotalar için `fallback_image_url`. Otel: dinamik fiyat (`hotel_rooms_batch`,
  `pricing_variables_batch`; ≤50 MB, `Nights` ≤14, giriş ≤180 gün); `hotel.guest_rating` ve
  `star_rating` etiketleri öğelerin en az %30'unda dolu değilse kullanılamıyor. Fiyat bindirmesi
  otelde `price`, `strikethrough`, `% off`, diğerlerinde yalnız `price`.

### Yeni dikeyler: hizmet, etkinlik, medya, uygulama, yayın (kısa)

- Beş tür, aynı şablon: `professional_services` (vertical `services`), `activities`, `media_titles`,
  `apps_and_software`, `articles_and_publications`. Düğüm `GET|PUT|DELETE /{öğe_id}` (**`PUT` kısmi
  güncelleme**, Graph'in olağan POST'u değil); katalog kenarı `GET|POST /{catalog_id}/{tür}`
  (`filter`, `summary=true`); feed ve set kenarları yalnız okuma.
- Ortak alanlar: `id`, `retailer_id`, `name` (≤200), `description`, `image_url` (≥500×500), `url`,
  `price`/`sale_price` (`"150.00 USD"`), `custom_label_0..4`, `custom_number_0..4`; derin bağlantı
  alanları ALT ÇİZGİYLE (`applink_ios_url`), ürün feed'inde NOKTAYLA (`applink.ios_url`).
- Hizmetler (Advetics için olası tek kullanım): `service_category` SERBEST metin (tanınan değerler
  belgede yok; yanlış yazım hata vermez), `hours_available` (`["Mo-Fr 08:00-18:00"]`), `address`,
  hizmet alanı (daire, poligon ya da posta kodu). Oluşturmada zorunlu `retailer_id`, `name`,
  `image_url`, `url`. Silme yolu çelişkili (giriş "yok", düğüm `DELETE`, kenar Items Batch).
- Etkinlikte yarıçap 1–255 km ve öğe başına tek alan türü; dizi alanları tabloda dizi, örneklerde
  virgüllü dize. **media_titles fiyatı çelişkili:** alan tablosu ve örnek `"9.99 USD"` dizesi, AYNI
  sayfanın güncelleme tablosu "en küçük para biriminde tam sayı (cent)".

### Collaborative Ads ve Managed Partner Ads (kısa)

- **Collaborative Ads:** perakendeci kataloğundan bir segment (`parent_catalog_id` +
  `catalog_segment_filter`) çıkarıp `POST /{segment_id}/agencies` (`business`, `permitted_tasks` ⊂
  `ADVERTISE`/`MANAGE`, ops. `utm_settings`, `enabled_collab_terms`) ile markayla paylaşıyor;
  katılım ve kabul ARAYÜZDE. Marka segment kimliğini kampanyanın `product_catalog_id` alanına
  koyuyor; perakendeci başına ayrı reklam hesabı öneriliyor. Segmentte ayarlanamayanlar:
  `multi_share_end_card` (hep `false`), `template_data.description`, satıcı sitesine bağlı
  `template_url_spec`, özel izleme spec'leri (gönderilirse ne olduğu belgede yok). Raporlar
  "estimated" (`catalog_segment_value`, `catalog_segment_actions`, `*_purchase_roas`,
  `converted_product_value`); `action_converted_product_id` hesap seviyesinde yok.
- **MPA:** pazar yerinin ≥20.000 satıcısı adına reklam; onboarding tek asenkron çağrıyla child BM +
  sayfa + reklam hesabı + kredi + segment kuruyor (parametre bölümü sayfada boş). Ek bilgi: erişim
  katmanları "Standard → Limited", "Advanced → Full" diye yeniden adlandırıldı; Full için son 15
  günde 500 Marketing API çağrısı yetiyor. Advetics'e uygulanamıyor.

### Shops ads (kısa)

- Site trafiği/satış kampanyasına ek: alıcı FB/IG'de sepet kuruyor, ödeme reklamverenin sitesinde.
  **Kişiyi siteye mi mağazaya mı göndereceğini Meta seçiyor** ve seçim raporlanmıyor.
- Kampanya `OUTCOME_SALES` (katalog tabanlıda `product_catalog_id`); ad set `destination_type=WEBSITE`
  ZORUNLU, katalog tabanlıda `promoted_object={product_set_id, custom_event_type}`. **Pixel
  tabanlıda belge çelişkili:** metin "offsite checkout açık commerce hesabı", örnekler `pixel_id`.
  `optimization_goal` yalnız `OFFSITE_CONVERSIONS` | `VALUE`; `custom_event_type` ∈
  `ADD_TO_WISHLIST`, `ADD_TO_CART`, `INITIATE_CHECKOUT`, `PURCHASE`, `VIEW_CONTENT`.
- Kreatif: `destination_spec={"destination_type":"WEBSITE_AND_SHOP"}` +
  `asset_feed_spec.onsite_destinations` (`storefront_shop_id` | `shop_collection_product_set_id` |
  `details_page_product_id`). Collection ve mesajlaşma CTA'ları desteklenmiyor (ama Advantage+
  örneğinin `ad_formats`'ında `COLLECTION` var); örnek `standard_enhancements`'ı açıkça `OPT_OUT`
  gönderiyor.
- Uygunluk `GET /{page_id}/commerce_merchant_settings?fields=cta,offsite_iab_checkout_enabled_countries,shops{…}`:
  `cta=OFFSITE_IAB_CHECKOUT` + en az bir ülke; uygunluk zamanla `OFFSITE_LINK`'e düşebiliyor.

### Reservation — Reach & Frequency (kısa)

Sabit CPM'li, tahmin edilebilir erişimli alım (`buying_type=RESERVED`); hesapta
`CAN_USE_REACH_AND_FREQUENCY` ve `rf_spec` sınırları; tek ülke, kitle ≥300 bin, erişim ≥200 bin.
Akış: `POST /act_{id}/reachfrequencypredictions` (asenkron tahmin) → `action=reserve` (envanter
kilitlenir) → ~1 saat içinde ad set'e `rf_prediction_id`; ad set'te hedefleme, tarih, bütçe ve
teklif verilmez. Reklamsız başlangıçta rezervasyon siliniyor, 30 dakikadan uzun duraklatma garantiyi
düşürüyor; belge kendi içinde çelişkili ve örnekleri eski API biçiminde. Katalogla ilgisi yok.

### Ürün seti optimizasyonu (beta, kısa)

Perakende reklam ağları için, Meta temsilcisi onayıyla: `OUTCOME_SALES` + ad set
`promoted_object.product_set_optimization:"enabled"`, `budget_source=RMN`, `start_time` ≥72 saat
sonra; **`product_set_optimization` ve `product_set_id` sonradan değiştirilemez**; marka başına
bütçe bölme (`budget_split_set`) toplamı ad set bütçesine eşit olmalı. Advetics'in iş modeline uymuyor.

### Commerce Platform (birkaç satır)

90 sayfanın çoğu Meta içi ödeme dönemine ait: **Shops checkout 4 Eylül 2025'te FB ve IG'den
kalktı**; sipariş, iade, kargo, finans sayfaları bu uyarıyı taşımıyor ve reklam atfı içermiyor
(kargo yalnız ABD). Reklamla kesişen kurallar (alanlar, `disabled_capabilities`, set metadata,
varyant geçişi) yukarıya taşındı. Akılda kalacaklar: Shop'tan siteye geçişte Meta sabit
`utm_source=IGShopping` + `utm_medium=Social` ekliyor, kampanya UTM'si yalnız reklamda tanımlıysa
geliyor; `commerce_eligibility` örneği anahtarı `is_elibile` diye yazıyor (tablo `is_eligible`);
`email_remarketing_option=false` alıcının e-postası pazarlamada kullanılamaz; FBE/OBO süresiz sistem
kullanıcısı token'ı üretiyor (`appsecret_proof` zorunlu) — Advetics'in erişim modeline uygulanması
ayrı bir kullanıcı kararı.

## API çağrıları

Örnekler kısaltıldı; değerler yer tutucu. Yorum satırları belgede olmayan ama Advetics'in açıkça
göndermesi gereken alanları işaretliyor.

```
# --- Katalog ---
POST   /{business_id}/owned_product_catalogs     name, vertical=home_listings   # vertical HER ZAMAN açık
GET    /{catalog_id}?fields=name,vertical,product_count,feed_count,is_catalog_segment
GET    /{catalog_id}/dpa_eligible_ad_accounts     # çağıran kullanıcıya göre
POST   /{catalog_id}/assigned_users               user=<SU_ID>, tasks=["ADVERTISE"]   # 415 = 2FA

# --- Öğe yazma (asenkron) ---
POST   /{catalog_id}/items_batch
  item_type=HOME_LISTING, allow_upsert=false,                                 # güncellemede açıkça false
  requests=[{"method":"UPDATE","data":{"home_listing_id":"ilan-42","price":"8500000 TRY"}}]
  → {"handles":["…"],"validation_status":[{"retailer_id":"…","errors":[],"warnings":[]}]}
GET    /{catalog_id}/check_batch_request_status?handle=<H>&load_ids_of_invalid_requests=true
       &fields=handle,status,warnings,errors_total_count,ids_of_invalid_requests
POST   /{catalog_id}/products                     name, retailer_id, image_url, price=599, currency=TRY  # KURUŞ
POST   /{catalog_id}/home_listings                # tekil; price float + currency, year_built zorunlu

# --- Feed ---
POST   /{catalog_id}/product_feeds
  name, update_only=true, country=TR, default_currency=TRY,                   # üçü de açıkça
  update_schedule={"interval":"HOURLY","url":"https://…/ilanlar.csv"}         # timezone biçimi belgede yok
POST   /{feed_id}/uploads                         url=…, update_only=true
GET    /{feed_id}/uploads  →  GET /{upload_session_id}/errors?error_priority=high   # örneklem
POST   /{upload_session_id}/error_report  →  GET /{upload_session_id}?fields=error_report
GET    /{catalog_id}/data_sources?ingestion_source_type=ALL

# --- Ürün seti ---
GET    /{catalog_id}/products?filter={"availability":{"eq":"for_sale"}}&summary=true   # önce say
POST   /{catalog_id}/product_sets                 name=Satilik, filter={"availability":{"eq":"for_sale"}}
GET    /{product_set_id}/products?summary=true    # total_count 0 ise reklam yayınlanmaz
GET    /{product_set_id}?fields=latest_metadata,live_metadata,integrity_review_status

# --- Eşleşme ve teşhis ---
POST   /{catalog_id}/external_event_sources       external_event_sources=[<PIXEL_ID>]
GET    /{catalog_id}/event_stats                  # son ~28 gün; yalnız erişilen kaynaklar
GET    /{pixel_id}/da_checks                      # passed | failed | unavailable
GET    /{catalog_id}/diagnostics?severities=["MUST_FIX"]&types=["EVENT_SOURCE_ISSUES","DA_VISIBILITY_ISSUES"]
GET    /{catalog_id}/products?fields=id,errors&error_priority=HIGH

# --- Dikey dinamik kitle ---
POST   /{business_id}/event_source_groups         name, event_sources=[<PIXEL_ID>]
POST   /{esg_id}/shared_accounts                  accounts=["<HESAP_ID>"]        # act_ ÖNEKSİZ
POST   /act_{id}/customaudiences
  name, subtype=CLAIM, claim_objective=HOME_LISTING, content_type=HOME_LISTING,
  event_source_group=<ESG>,
  inclusions=[{"event":"ViewContent","retention":{"min_seconds":0,"max_seconds":1209600}}]
```

E-ticaret kataloğu için Advantage+ catalog ads zinciri:

```
# 1) Kampanya
POST /act_{id}/campaigns
  name, objective=OUTCOME_SALES, special_ad_categories=[],
  promoted_object={"product_catalog_id":"<CAT>"}, status=PAUSED

# 2) Ad set (yeniden hedefleme: 5 gün içinde bakıp almayanlar)
POST /act_{id}/adsets
  campaign_id, daily_budget=15000, billing_event=IMPRESSIONS,
  optimization_goal=OFFSITE_CONVERSIONS,
  destination_type=WEBSITE,                         # belge örneğinde yok; açıkça
  promoted_object={"product_set_id":"<PS>","custom_event_type":"PURCHASE"},   # açıkça
  targeting={"geo_locations":{"countries":["TR"]},
    "product_audience_specs":[{"product_set_id":"<PS>",
      "inclusions":[{"retention_seconds":432000,"rule":{"event":{"eq":"ViewContent"}}}],
      "exclusions":[{"retention_seconds":432000,"rule":{"event":{"eq":"Purchase"}}}]}]},
  status=PAUSED

# 3) Kreatif
POST /act_{id}/adcreatives
  name, product_set_id=<PS>,
  object_story_spec={"page_id":"<PAGE>","template_data":{
    "call_to_action":{"type":"SHOP_NOW"},"link":"<SITE>",
    "message":"{{product.name | titleize}}","name":"{{product.price}}",
    "multi_share_end_card":false}},                  # varsayılan true
  degrees_of_freedom_spec={"creative_features_spec":{
    "media_type_automation":{"enroll_status":"OPT_OUT"},     # varsayılan AÇIK
    "adapt_to_placement":{"enroll_status":"OPT_OUT"}}}       # varsayılan AÇIK

# 4) Önce doğrula, sonra oluştur
POST /act_{id}/ads  adset_id, creative={"creative_id":"<CR>"}, status=PAUSED,
                    execution_options=["validate_only","synchronous_ad_review"]
POST /act_{id}/ads  adset_id, creative={"creative_id":"<CR>"}, status=PAUSED

# 5) Önizleme ve ürün kırılımı
GET /{creative_id}/previews?ad_format=MOBILE_FEED_STANDARD&product_item_ids=["catalog:<CAT>:<b64url(id)>"]
GET /act_{id}/insights?breakdowns=["product_id"]&fields=spend,actions   # ana metrik sorgusundan AYRI
```

Emlak için lead formlu katalog reklamı (HOUSING'in TR davranışı ölçülmedi):

```
POST /act_{id}/campaigns
  name, objective=OUTCOME_LEADS, special_ad_categories=["HOUSING"],
  special_ad_category_country=["TR"], status=PAUSED
POST /act_{id}/adsets
  campaign_id, optimization_goal=LEAD_GENERATION, billing_event=IMPRESSIONS,
  promoted_object={"product_set_id":"<PS>","page_id":"<PAGE>"},
  targeting={"geo_locations":{"countries":["TR"]}},     # yaş/cinsiyet GÖNDERME; mahalle/posta kodu YOK
  status=PAUSED
POST /act_{id}/adcreatives
  name, product_set_id=<PS>,
  object_story_spec={"page_id":"<PAGE>","template_data":{
    "call_to_action":{"type":"SIGN_UP","value":{"lead_gen_form_id":"<FORM>"}},
    "multi_share_end_card":false,
    "message":"{{home_listing.name}}","name":"{{home_listing.price}}"}}
GET  /{lead_id}?fields=field_data,retailer_item_id      # formun hangi ilan için doldurulduğu
```

## Tuzaklar ve sessiz hata riskleri

Ayrıntısı yukarıda olanlar burada tek satırla anılıyor; amaç kontrol listesi.

**Katalog ve feed**
- Replace feed siler: `update_only` vars. `false`, `schedule` = replace, `deletion_enabled` geri
  alınamaz. Kısmi dosya kataloğu, setleri ve Advantage+ sıralama geçmişini götürür.
- `country="US"`, `default_currency=USD`, saat dilimi America/Los_Angeles varsayılan; TL'li dosyada
  para birimi yoksa USD sayılır.
- `warning` önemli alan atılıp öğe yine yazılıyor; `/errors` örneklem; "yeteneği engelliyor: `da`"
  uyarısında öğe katalogda var, reklamda yok; `product_feeds` yanıtı `id` ile birlikte `errors[]`
  taşıyabilir.
- Aynı `id` iki kez → kopyaların HEPSİ yok sayılır (`vehicle_id` için de); Commerce sayfasının kendi
  örneği bu tuzağa düşüyor.
- Görsel aynı adreste değişirse algılanmaz; beklenmeyen baytta LATIN1'e düşüş Türkçe karakterleri
  hatasız bozar; XML'de tek satır 5 MB'ı geçemez.
- Feed'in yönettiği öğeyi tekil API ile değiştirmek, aynı değişken alanı hem feed'de hem Batch'te
  tutmak ya da aynı `id`'yi iki feed'e koymak: sonraki feed ezer ya da kazananı belgede yok.
- Feed kuralları Batch'e uygulanmıyor (feed'den Batch'e geçişte düzeltilen hatalar geri döner); ek
  feed öğe yaratmıyor (ana feed'de olmayan `id`'li satır etkisiz).
- Yerelleştirmede override'ı unutulan öğe o ülkede gizleniyor; ana öğeyi silmek override'ları
  siliyor; dil feed'ine fiyat/stok, `image_link` ya da eksik `applink` yazmanın sonucu belgede yok.
- Microdata kataloğu pixel tetiklenmeden güncellenmiyor; kategori verilmezse Meta otomatik
  atıyor; `sale_price_effective_date` yoksa indirim süresiz; `rich_text_description` reklamda yok.

**Toplu yazma**
- `items_batch` 200 + `handles` ≠ yazıldı (`[]` = hiçbir şey alınmadı); tanınmayan alan, hatta
  zorunlu alan eksikliği bile `warnings` içinde; `load_ids_of_invalid_requests` vars. false iken
  geçersiz kimlik dizisi hep boş.
- `allow_upsert` vars. true: kimliği yanlış UPDATE yarım öğe yaratır. `image` verilince
  `image_link` ve `additional_image_link` yok sayılır. Aynı istekteki güncellemelerin sırası garanti
  değil.
- `items_batch` `video` listesinden çıkarılan video siliniyor, `[]` hepsini siliyor.
- Fiyat birimi uca göre değişiyor (dize / kuruş / float / ×100) ve 100 kat kayma hata vermiyor;
  `vehicles` `mileage.unit` vars. MILES; otelde `currency` vars. USD;
  `hotel_rooms_batch`/`pricing_variables_batch` `update_only` vars. false → eksik satır silinir.

**Ürün seti**
- Boş filtre = bütün katalog; hiçbir öğeyle eşleşmeyen filtre = set var, reklam yok.
- Etiket filtresinde Türkçe karakter yasak; `contains` enum alanda çalışmıyor ve duyarlılığı
  sayfadan sayfaya farklı; `internal_label` küçük harfe çevriliyor (`is_any` kullan); `custom_label`
  değişikliği politika incelemesini tetikleyip teslimatı etkileyebiliyor.
- 2022 filtre değişikliği eski setlerin içeriğini haber vermeden değiştirmiş olabilir; 10803 aynı
  filtreli ikinci seti engelliyor; kapak görseli hatası set oluşmuşken de dönebilir (körlemesine
  tekrar = mükerrer set); Offers `target_filter` sessizce yeni set yaratıyor.
- `latest_metadata` ≠ `live_metadata`; `external_url` reklamın varsayılan adresi olur ve eskimiş
  adres reklama taşınır; `allow_live_product_set_deletion=true` aktif reklamın setini siler.

**Eşleşme ve kitle**
- `content_ids` ≠ `id`: Events Manager olayı "aldı" der ama kitle öğeyi bilmez, yalnız
  `event_stats`'ta görünür; kitle < 20 → yayın yok; virgülle birleştirilmiş kimlik (`"1,2"`) tek ve
  var olmayan bir kimlik gibi okunabilir.
- Olay adı iki yazımda (kuralda `Purchase`, `custom_event_type`'ta `PURCHASE`); kitle
  `content_type` büyük harf (`HOME_LISTING`), olay `content_type` küçük harf (`home_listing`);
  yanlış yazım eşleşmeyen kural, yani boş kitle demek.
- `event_stats` yalnız erişilen kaynakları sayar; `da_checks` üç hâlli (`unavailable` ≠ `failed`);
  `matched_other_catalogs > 0` = pixel birden çok kataloğa bağlı; silinen ürün sitede yaşıyorsa
  eşleşme düşer (`DELETED_ITEM`).
- `id` değişimi Advantage+ sıralamasını sıfırlar (pixel `content_type=product` ise geri gelmez);
  varyant grubundan yalnız bir öğe gösterilir.
- Katalog–pixel bağı ve event source group paylaşımı iki ayrı unutma noktası (paylaşım `act_`
  öneksiz); `retention` en az 4 saat; kitle `rule`'unda tanınmayan alanın (seyahat örneğindeki
  `destination`) etkisi belgede yok.

**Kampanya ve kreatif**
- `custom_event_type` yoksa `PURCHASE` (lead ya da sepete optimize etmek isteyen kurulum hata
  almadan satın almaya optimize olur); `destination_type` yoksa Meta kendisi çözüyor;
  `template_data.link` her zaman öğe linkiyle değişiyor; `description` Instagram'da görünmüyor.
- `force_single_link` yoksa karusel; `multi_share_end_card` vars. true; ürün videosu ve
  `adapt_to_placement` vars. açık (Stories tam ekranında başlık yok); koleksiyon kapağı yoksa
  müşterinin görmediği otomatik video; `FORMAT_AUTOMATION` formatı garanti etmiyor;
  `dynamic_partner_content` başka kampanyaların reklamlarını koleksiyona sokuyor.
- `standard_enhancements` v22'de kalktı (eski alanı göndermenin etkisi belgede yok, alt özelliklerin
  varsayılanı da); v20+ ürün uzantısına uygun reklamda `enroll_status` zorunlu (Advetics'in tek
  görselli satış reklamı, hesapta katalog varsa bu alana takılabilir).
- `template_url_spec` türetilemezse katalog adresine düşülür (UTM sessizce kaybolur);
  `applink_treatment` varsayılanı çelişkili (uygulamalı müşteride tıklayan App Store'a gidebilir);
  `preferred_*_tags` tutmazsa ilk medya; ad set ve kreatifteki `product_set_id` ayrı alanlar.
- `round` YUKARI yuvarlıyor, TL biçimi belgede yok; kategori reklamında adı/adresi olmayan kategori
  elenir, kalan 4'ün altına inerse oluşturma düşer, boş `destination_uri` yayından çıkarır.
- Reklam öncesi `video_fetch_status=NO_STATUS` normal ("yüklenmedi" alarmı yanlış olur);
  görsel/video dağılımı raporda yok; `dynamic_posts` Instagram yorumlarını vermiyor.

**Emlak ve HOUSING**
- Emlak kampanya örneği HOUSING'i atlıyor (kategorisiz konut reklamı sonradan durdurulabilir);
  `special_ad_category_country` vergi ülkesine düşüyor; `tune_for_category` hedeflemeyi sessizce
  düzeltiyor; TR'nin "Avrupa" sayılıp sayılmadığı tanımsız.
- HOUSING'de mahalle/posta kodu/metro hedefi, konum hariç tutma ve benzer kitle yok, ilgi alanı
  onaylı listeden: panel önceden kısıtlamazsa kullanıcı bunu yayın anında 2909035 ile öğrenir;
  Advetics'in kısa terimli ilgi alanı adayları onaysız alan üretebilir.
- Olay adı ≠ anlam: pixel `Purchase` = iletişim, çevrimdışı `Purchase` = kira sözleşmesi. Raporda
  "satın alma" yazmak yanlış; ikisi aynı veri kümesine akarsa farklı şeyler toplanır.
- `content_type` "gerekmez" deniyor ama eşleşme ona bağlı olabilir; `available_dates_price_config`
  `lease_*` tarihleri olmadan ölü; `area_size` reklamda uygulanmıyor; `neighborhood` zorunlu.

**Diğer dikeyler ve ürünler**
- Seyahat şablon etiketleri veri yokken yarın/öbür gün ve 1 yetişkine düşüyor; uçuşta eşleşme
  anahtarı (IATA çifti) parametre tablosunda yok ve otomatik rota üretimi yanlış koddan rota
  ekleyebiliyor; `{{flight.price source:event}}` kişinin günler önce gördüğü fiyatı gösterebilir.
- Otomotivde Facebook içi hedef, izin listesine alınmamış `fb_page_id` ile sessizce çalışmıyor.
- Collaborative Ads metrikleri "estimated"; MPA asenkron `result` dize, `code` benzersiz değil,
  `lifetime_budget` krediyi aşabiliyor, biçimli tutar dizesini (`"5,000.00"`) `parseFloat` 5 okur;
  partner premium options çağrısı TAM durum yazıyor.
- Shops ads'te site/mağaza seçimi Meta'da ve raporlanmıyor; uygun olmayan ülke/yerleşimde mağaza
  yolu sessizce kapanabiliyor; shop uygunluğu zamanla düşebiliyor.
- Reservation gerçek envanter kilitliyor; başlangıçta reklam yoksa rezervasyon siliniyor; sıralama
  kırpılıyor; 30 dakikalık duraklatma garantiyi düşürüyor.

### Belge çelişkileri (canlıda ölçülmeden yazma yolu açılmamalı)

| Konu | Bir yer | Öbür yer | Güvenli davranış |
|---|---|---|---|
| Katalog hedefi | Çoğu sayfa `PRODUCT_CATALOG_SALES` | PSO, Shops ads `OUTCOME_SALES`; [kampanya referansı] eskisi v17'de kalktı | `OUTCOME_SALES` + `destination_type=WEBSITE` |
| media_titles fiyatı | Alan tablosu ve örnek `"9.99 USD"` | Aynı sayfanın güncelleme tablosu tam sayı cent | Yazma yolu ölçülmeden açılmamalı |
| Shops ads pixel tabanlı ad set | Metin: commerce hesabı | Örnekler `pixel_id` | Ölçülmeden yazılmamalı |
| Shops ads Collection | "Desteklenmiyor" | Advantage+ örneğinde `COLLECTION` var | Yalnız `CAROUSEL` |
| Ürün videosu varsayılanı | allow-product-video: açık | creative-for-catalog: isteğe bağlı opt-in | Her zaman açıkça `OPT_IN`/`OPT_OUT` |
| Ürün başına video | get-started: 1 | SSS: 20 URL | 1 varsay, fazlasını ölç |
| `applink_treatment` varsayılanı | app link varsa `deeplink_with_appstore_fallback` | web | Açıkça gönder |
| `schedule` zorunlu mu | feed-api: zorunlu | supported-products: doğrudan yüklemede atla | Takvimli feed'de ver |
| Takvim sıklığı | Feed sayfaları: en sık saatlik | Platform best-practices: 15 dakikada bir | Saatlik; daha sık değişen alan Batch'le |
| `deletion_enabled` varsayılanı | Tablo `true` | Açıklama "false, v2.5'ten itibaren true" | Kalıcı sayıp uyar |
| Hata raporu tetiklemesi | `POST …/error_report` | `GET …?fields=error_report` ile "iste" | Önce POST, sonra GET |
| `title` / `description` sınırı | Feed 200 / 9999 | `items_batch` 100 / 5000 | 100 / 5000 |
| `additional_image_link` | 10 | 20 ve 50 (`items_batch`) | 10 |
| `rich_text_description` | 9999 | 5000 | 5000 |
| `availability` (ürün) | `in stock`, `out of stock` | + `available for order`, `discontinued`, `preorder`, `pending` | İlk ikisi; diğerleri ölçülerek |
| `status` / `visibility` | `active`/`archived` | `published`/`hidden`/`staging`/`whitelist_only`; HOTEL_ROOM `published` | Dikeyin referans tablosuna göre |
| `disabled_capabilities` | Küçük harf (`da`) | Büyük harf (`DA`) | Ölç |
| `contains` duyarlılığı | Emlak: duyarlı | Referans, otomotiv, seyahat: duyarsız | `i_contains` / `eq` |
| `or` operatörü | "Yalnız biri" | Örnek normal VEYA | Kullanmadan önce ölç |
| Diagnostics önem değerleri | `MUST_FIX`/`OPPORTUNITY` | `MUST_FIX`/`WARNING`; `action_url`/`action_uri` | İkisini de tanı |
| Katalog oluşturma ucu | `/owned_product_catalogs` | Örnek `/product_catalogs` | `/owned_product_catalogs` |
| `vertical` enum | Referans listesi | Rehberlerde `vehicle_offers`, `activities` ek | Dikey rehberine göre, ölç |
| Kategori ölçütü | `brand`, `product_type`, `google_product_category` | `BRAND`, `CATEGORY`, `PRODUCT_TYPE` | Ölç |
| Emlak adresi | `addr1` | `/home_listings` `street_address` | Uca göre ayrı eşleme |
| Emlak `latitude`/`neighborhood` | Rehber: zorunlu | `items_batch`: opsiyonel | Gönder |
| Emlak fiyatı | `13,999 USD` | `4000000 JPY`; float + currency | Binlik ayırıcısız |
| Emlak görsel boyutu | 1024×1024; 1200×628 | 600×600; 1200×630 | En katısı |
| Emlak Search olayı konumu | Örnek: zorunlu | Tablo: önerilen | Gönder |
| Kitle `subtype` | Örnekler `CLAIM` | "2018'den beri desteklenmiyor" | Ölç |
| `flight_set_id` | Zorunlu | Örnekler göndermiyor | Gönder |
| Tracking spec anahtarı | `fb_pixel` | `offsite_pixel` | Ölç |
| Instagram kimlik alanı | `instagram_actor_id` | `instagram_user_id` | Tek ad seç, ölç |
| IG Stories kırpma | 1:1'e kırpılır | `adapt_to_placement` ile 9:16 | Açıkça ayarla |
| Hizmet silme | Yok | Düğüm `DELETE` / Items Batch | Ölç |
| `commerce_eligibility` | `is_eligible` | Örnek `is_elibile` | İkisini oku |
| Reservation | Duraklatılamaz / reklamsız ad set'e atanabilir / `rf_prediction_id=0` | 30 dk kuralıyla duraklatılır / 1487583 / "null ile ayır" | Kullanılmamalı |

## Advetics'in canlı bilgisiyle karşılaştırma

| # | Canlı bilgi | Bu sayfalarda | Durum |
|---|---|---|---|
| 1 | Ad set'te `destination_type` verilmezse boost reddediliyor; doğru değer `ON_POST` | Katalog ad set örneklerinde alan yok; otomotiv: verilmezse katalog web adresi; Facebook içi ürün sayfası `FACEBOOK`; Shops ads `WEBSITE` zorunlu; [kampanya referansı] eşleme `WEBSITE` | **UYUŞUYOR (desen):** alan yoksa Meta kendisi çözüyor. `ON_POST`'u ne doğruluyor ne çürütüyor; katalogda `WEBSITE` açıkça yazılmalı |
| 2 | `geo_locations` kovaları birleşim | Doğrudan geçmiyor. Benzer birleşimler: seyahat kitlesinde çoklu `inclusions` = VEYA; override'ı olmayan öğe küresel görünüyor. Reservation tek ülke istiyor | **Belgede geçmiyor** (aynı aileden desenler var) |
| 3 | IG medyasının üç kimlik uzayı | Katalogda `id`/`retailer_id`, Meta ürün FBID'si ve `catalog:` jetonu ayrı; IG alan adı `instagram_actor_id` / `instagram_user_id` tutarsız; FBE `profiles[]` / `instagram_profiles[]`; `dynamic_posts` IG yorumu vermiyor | **UYUŞUYOR** (aynı sınıf risk) |
| 4 | `image_url`/`thumbnail_url` imzalı ve ölüyor | Katalog görselini Meta reklamverenin adresinden çekiyor; adres önbellek anahtarı; `IMAGE_FETCH_FAILED_*`; video Meta'da saklanıyor. `permanent_url` geçmiyor | **Belgede geçmiyor.** Komşu gerçek: katalog görsel adresi kalıcı ve herkese açık olmalı, imzalı/süreli adres verilmemeli |
| 5 | `?ids=` çoklu sorguda tek kötü kimlik isteği düşürüyor | Geçmiyor. Tersi desen: feed ve batch kısmi başarıya izin veriyor (kötü satır atılıyor, gerisi yazılıyor) | **Belgede geçmiyor**; kısmi başarı ayrı bir sessiz kabul riski |
| 6 | Click-to-WhatsApp kurulumu | Shops ads mesajlaşma CTA'larını desteklemiyor; AIA `dealer_communication_channel` `CHAT`/`LEAD_FORM` (Marketplace) | **Belgede geçmiyor** |
| 7 | `limit=500` → "Please reduce the amount of data"; limit yarılanmalı | `localized_items_batch`: kod 1 + aynı mesaj = gövde büyük, kayıt sayısını azalt; `items_batch` ≤5000 kayıt / 28 MB | **UYUŞUYOR** (başka uçta aynı mesaj, aynı çözüm; ayıran şey mesaj) |
| 8 | Insights'ta atıf parametreleri açıkça gönderiliyor | Ürün kırılımı örneği göndermiyor; Commerce içgörüleri 28 gün tıklama / 1 gün görüntüleme ve "ads preferred" kullanıyor | **Destekliyor** (yüzeyler farklı varsayılan kullanıyor). Bölüm 04'teki not: Insights sayfası bu parametrelerin 2025-06-10'dan beri yok sayıldığını yazıyor |
| 9 | `age_max = 65` = "65 ve üzeri" | Geniş kitle örneği `age_max:65` gönderip "30–65" diye anlatıyor; [SAC sayfası] HOUSING yaşı "18 ile 65+" sabit | **Dolaylı uyuşuyor**, çürütmüyor |
| 10 | `image_hash` hesap başına; `act_` önekli kimlik | Statik kart `image_hash`, `frame_image_hash`, `asset_feed_spec.images[].hash` hesap düzeyinde. ESG `shared_accounts` hesabı ÖNEKSİZ istiyor; FBE `fbe_installs` öneksiz döndürüyor; MPA örnekleri karışık | **UYUŞUYOR + YENİ:** `actPath()` yalnız yol için; gövde parametresinde öneki söken ayrı bir yardımcı gerekecek |
| 11 | `adinterest` araması kısa terimle eşleşiyor; büyüklük dünya geneli | HOUSING'de ilgi alanları önceden onaylı listeden; çapraz satış örneği `interests` kullanıyor | **Yeni kısıt:** HOUSING'de aday üretimi onaylı listeyle sınırlanmalı |
| 12 | Organik istatistik adları değişti | Geçmiyor (yalnız reklam video metrikleri eşlemesi var) | **Belgede geçmiyor** |
| — | Para micros (BigInt) | Katalogda dize `"9.99 USD"`, kuruş tamsayı, float, ×100 filtre | **Yeni:** uç başına ayrı dönüştürücü, kayan noktasız |

## Yapay zekâ ile yönetim için çıkarımlar

**Kapsam kararı.** Katalog YAZMA araçları, katalog reklamının yazma yolu canlıda gözle
doğrulanana kadar AI'a açılmamalı (çalışmayan seçeneği göstermemek; dar liste ilkesi). İlk
açılacak dikey emlak (`home_listings` + lead formu ya da `OFFSITE_CONVERSIONS`). Okuma araçları ise
şimdiden değerli: müşterinin var olan kataloğunun sağlığını göstermek için.

**Okuma araçları (onaysız):**
- `katalog_listele(isletme)` → `name`, `vertical`, `product_count`, `feed_count`,
  `is_catalog_segment`; "gösterilen N / toplam M".
- `katalog_saglik(katalog)` → diagnostics (`MUST_FIX` önce), `da_checks`, öğe hataları
  (`error_priority=HIGH`), son feed yüklemesi (`fatal` ve `warning` ayrı sayılı; "örneklem, toplam
  değil" notu; gerekirse `error_report` durumu).
- `katalog_pixel_eslesme(katalog)` → `event_stats` eşleşme oranı = matched / (matched + unmatched +
  other_catalogs); "erişilemeyen kaynaklar sayılmaz" notu; `da_checks` üç hâlli.
- `urun_seti_listele(katalog)` her set için `total_count`; `urun_seti_onizle(filtre)` →
  `GET /products?filter=…&summary=true` (set kurmadan kaç öğe düşeceği).
- `dpa_hesaplari(katalog)`, `batch_durumu(handle)` (`load_ids_of_invalid_requests=true` SABİT),
  `kreatif_onizle(kreatif, product_item_ids)`, `kategori_listele(katalog, olcut)`,
  `sac_uygunluk(kitle)` (`is_eligible_for_sac_campaigns`).
- Düşük öncelik: `shop_uygunlugu(sayfa)`, `rf_spec_oku(hesap)`.

**Yazma araçları (insan onaylı; hepsi `PAUSED` açar):**
- `katalog_olustur(vertical)` — `vertical` kapalı sözlükten ve her zaman gönderilir.
- `feed_olustur` / `feed_yukle` — `update_only` her zaman açık; replace seçilirse "dosyada olmayan
  N öğe silinecek" önceden hesaplanıp onay ekranında; `deletion_enabled` kalıcılık uyarısı;
  `country`, `default_currency`, saat dilimi açık.
- `oge_toplu_yaz` (`items_batch`) — güncellemede `allow_upsert=false`; iş ancak `handle` yoklanınca
  "bitti" sayılır; sonuç "N gönderildi / M kabul / K uyarı / L geçersiz" ve uyarı metinleriyle.
- `urun_seti_olustur` — önce önizleme sayısı; 0 ise araç REDDETMELİ; boş filtre "bütün katalog"
  diye ayrıca onaylatılmalı; önce aynı filtreli set var mı bakılmalı (10803); hata dönse bile liste
  geri okunmalı.
- `katalogu_pixele_bagla`, `esg_olustur` + `esg_paylas` (öneksiz hesap kimliği araç içinde
  üretilir), `dinamik_kitle_olustur` (`claim_objective` dikeyden türetilir).
- `katalog_kampanyasi_kur` — kampanya + ad set + kreatif + reklam; önce `validate_only` +
  `synchronous_ad_review`, sonra oluşturma; hepsi `PAUSED`.
- `kategori_guncelle` — silme yok; boş `destination_uri` yayından düşürür, onay ekranında söylenmeli.

**AI'a hiç verilmemeli:** katalog silme (`allow_delete_catalog_with_live_product_set` dahil),
`allow_live_product_set_deletion`, eski `/batch`, `hotel_rooms_batch` / `pricing_variables_batch`,
sohbetten replace modda feed yükleme, Commerce sipariş/iade/kargo/finans uçları, MPA satıcı silme,
Reservation `action=reserve`, Shops ads kurulumu.

**Kapalı sözlükler (serbest metin kabul edilmez):** `vertical`; `item_type`; `availability`
(dikeye göre ayrı liste: ürün, emlak altılısı, araç `available`/`not_available`); `condition`;
`listing_type`; `property_type`; `status`; set filtre operatörleri (alan tipine göre `eq` ya da
`i_contains`'i araç seçer); `tasks`; `objective` (`OUTCOME_SALES`, `OUTCOME_LEADS`);
`optimization_goal`/`billing_event` çiftleri; `custom_event_type`; `format_option`;
`call_to_action.type` (`SHOP_NOW`, `SIGN_UP`, `LEARN_MORE`, `BOOK_TRAVEL`); `applink_treatment`;
`categorization_criteria`; `category_media_source`; `enroll_status`; `special_ad_categories`;
`claim_objective` (`HOME_LISTING`, `VEHICLE`, `VEHICLE_OFFER`, `TRAVEL`); kitle `content_type`;
olay adları (pixel yazımıyla, dikeye göre). Şablon etiketleri dikeye göre beyaz liste; birlikte
kullanılamayan çiftler (`price` + `current_price` vb.) ve açıklama sınırları (3 seçenek, 1 serbest,
etiket başına tek) şemada reddedilir. Alan sınırları elle ikinci bir listeye yazılmak yerine Meta'nın
JSON şema dışa aktarımından türetilebilir.

**Her istekte açıkça yazılacaklar (varsayılana bırakılmaz):** `vertical`, `update_only`, `country`,
`default_currency`, takvim saat dilimi, `allow_upsert`, `load_ids_of_invalid_requests`,
`custom_event_type`, `destination_type`, `special_ad_categories` (+ ülke), `force_single_link`,
`multi_share_end_card`, `applink_treatment`, `creative_features_spec` altındaki bütün
`enroll_status`'lar (video, `adapt_to_placement`, `add_text_overlay`, `dynamic_partner_content`,
`product_extensions`), koleksiyonda kapak medyası, olaylarda `content_type`, araçta `mileage.unit`.

**Önce kontrol, sonra çağrı (sıfır maliyetli ret):** katalog var ve `vertical` doğru;
`is_catalog_segment`; hesap `dpa_eligible_ad_accounts` içinde; katalog pixel'e bağlı
(`external_event_sources` boş değil); `event_stats`'ta son günlerde eşleşen olay var; set
`total_count` sıfırdan büyük; dinamik kitle türü set türüyle aynı; HOUSING bayrağı açıksa hedefleme
kısıtları giriş anında uygulanmış; kategori reklamında en az 4 uygun kategori.

**Yazma sonrası doğrulama ("200 döndü" yetmez):** kreatif geri okunup `product_set_id`,
`template_data`, `degrees_of_freedom_spec` yankısı karşılaştırılır; setin `live_metadata`'sı ve
`integrity_review_status`'ü okunur; `effective_status` izlenir; `product_item_ids` ile önizleme
üretilip kullanıcıya gösterilir; batch sonucu `handle` ile okunur.

**AI'ın asla tahmin etmemesi gerekenler:** HOUSING'in TR'de zorunlu olup olmadığı (ölçülene kadar
workspace ayarı ve insan kararı); hangi `vertical`'ın seçileceği (müşteri türünden eşleme katmanı
seçer); GPC→FPC eşlemesi; `service_category` değerleri; TL fiyat biçimi ve fiyat birimi (dize mi
kuruş mu); filtrede `contains` mı `eq` mi; emlak olay adlarının anlamı.

**Raporlama:** `product_id` kırılımı AYRI sorgu olmalı (kırılım satırı çoğaltır); uçuşta kırılım
anahtarı dize. Emlakta `Purchase` = "iletişim", `InitiateCheckout` = "ilan kaydetme"; çevrimdışı
dönüşümdeki aynı adlar "sözleşme" ve "ofis ziyareti" — ayrı kaynak, toplanmaz. Collaborative Ads
metrikleri "tahmini" etiketiyle ayrı sütunda. Görsel/video ayrımının raporlanamadığı kullanıcıya
söylenmeli.

## Panel kurgusu için çıkarımlar

**Genel karar.** Katalog reklamı ilk sürümde panelde seçenek olarak YOK; yazma yolu doğrulanınca ilk
açılacak akış emlak müşterisi için "İlanlarım". Commerce, Shops ads, Collaborative Ads, MPA,
Reservation, ürün seti optimizasyonu, seyahat ve otomotiv panelde gösterilmez.

**Workspace ayarı (her kampanyada soru değil):** sektör "konut/emlak" ise HOUSING bayrağı açılır ve
her kampanya `special_ad_categories=["HOUSING"]` + `special_ad_category_country` ile açılır. Acemiye
bir kez sorulabilir: "Konut satış ya da kiralama reklamı mı veriyorsunuz?" (inşaat ile konut
arasındaki ilişki kullanıcıya açık değil).

**Acemiye sorulacaklar (emlak akışı, iş dilinde):**
- İlan bilgileri: başlık, adres (il, ilçe, mahalle; mahalle zorunlu), konum, fiyat ve para birimi
  (varsayılana bırakılmaz), durum (satılık, kiralık, yakında…), tür (daire, müstakil, arsa…),
  oda/banyo sayısı, yapım yılı, görseller, ilan bağlantısı. Metrekare başlığa ya da açıklamaya
  otomatik eklenir (reklamda ayrı alan yok).
- "Hangi ilanları öne çıkaralım?" → set (satılık / kiralık / şehir); seçicide eşleşen ilan sayısı ve
  örnekler görünür.
- "Kime?" → "İlanlarınıza bakmış kişiler" ya da "Yeni kişiler". Gün sayıları eşleme katmanında sabit.
- Bütçe.

**Otomatik kararlaştırılacaklar:** `vertical`, `objective`, `optimization_goal`, `billing_event`,
`custom_event_type`, `destination_type`, format (karusel), CTA, kitle süreleri, Advantage+ creative
bayrakları (başlangıç `OPT_OUT`), hazır listeden şablon etiketli başlık seçenekleri, `url_tags`
(UTM), feed modu.

**HOUSING açıkken giriş anında kısıtla:** yaş seçici kilitli (18–65+), cinsiyet gizli, posta
kodu/mahalle/metro hedefi gizli, konum hariç tutma gizli, yarıçap alt sınırı TR davranışı ölçülene
kadar en katı değerde (25 km), benzer kitle ile davranış/demografi hedeflemesi menüde yok, ilgi
alanı önerisi yalnız onaylı listeden. Kullanıcıya tek cümle: "Konut reklamlarında Meta bazı hedefleme
seçeneklerini kapatıyor."

**Gelişmiş mod:** set filtresi düzenleme (önizleme sayısıyla), format seçimi, statik kart, bindirme,
oran bazlı görsel etiketleri, video tercihleri, çapraz satış (kitle seti ≠ gösterilen set), kategori
reklamı, `template_url_spec`, `custom_event_type`, kitle süreleri ve kuralları, yerelleştirme feed'i,
feed kuralları, ek feed.

**Boş ya da sorunlu durumun NEDENİ ayrı ayrı yazılmalı:** "Katalog yok", "Katalog yanlış türde
açılmış", "Set boş: filtre eşleşmedi / ilanlar yayında değil / dinamik reklam kapalı / etikette
Türkçe karakter var", "Site takibi kataloğa bağlı değil", "Site olaylarında ilan kimliği yok ya da
eşleşmiyor (%X)", "Kitle 20 kişinin altında", "Son yüklemede N ilan alınamadı (örnek gösteriliyor),
M alan atlandı", "Çözülmesi gereken sorunlar", "Video henüz indirilmedi, bu normal", "Şu an
ölçülemiyor".

**Uyarı metinleri (kısa, sade, uzun tiresiz):** "Bu ilan yayında değil, reklamda gösterilmez."
"İndirim bitiş tarihi yok, süresiz görünür." "Görsel adresi aynı kaldı, Meta yeni görseli almaz."
"Bu kimlik iki kez geçiyor, ikisi de yok sayılır." "Reklama tıklayan kişi ilanın kendi sayfasına
gider." "Instagram'da açıklama satırı görünmez." "Meta, videosu olan ürünlerde görsel yerine video
gösterebilir." (yalnız açıkken) "Kapak seçmezseniz Meta otomatik video kullanır."

**Rapor etiketleri:** emlak hesaplarında "Satın alma" yazılmaz; `Purchase` sütunu "İletişim",
`InitiateCheckout` "İlan kaydetme" olarak gösterilir; çevrimdışı dönüşümler ayrı kaynak olarak
"Sözleşme" ve "Ofis ziyareti" adıyla durur ve toplanmaz.

## Sayfa sayfa dizin

| Dosya | Kaynak URL | Tek satır özet | Önem |
|---|---|---|---|
| `catalog.md` | https://developers.facebook.com/documentation/ads-commerce/catalog | Katalog bölümünün giriş sayfası: katalog tanımı, kullanım alanları (Collection, Commerce, Advantage+ catalog ads, IG Shopping, WhatsApp) ve alt sayfa bağlantıları | Orta |
| `catalog__best-practices.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/best-practices | Commerce kataloğu kontrol listesi: zorunlu/önerilen alanlar, biçim kuralları, takvimli feed saatlik sınırı, link 200, fatal/warning ve rejected | Yüksek |
| `catalog__get-started.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/get-started | Başlangıç: catalog_management/business_management izinleri, Batch API ToS ön koşulu, feed kurma, kategori seçimi, takvim | Orta |
| `catalog__get-started__integrate-via-meta-sdk.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/get-started/integrate-via-meta-sdk | Business SDK (PHP/Node) ile items_batch create/update/delete ve ürün okuma örnekleri | Düşük |
| `catalog__get-started__supported-products-services.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/get-started/supported-products-services | Yeni vertical'lar (media_titles, apps_and_software, articles_and_publications, services, activities): katalog/feed/item_type değerleri, product set süzgeç alanları; yasaklı kategori bilgisi YOK | Yüksek |
| `catalog__guides.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides | Rehberler dizini (kategoriler, varyantlar, envanter, feed API, deep link, takvim, microdata, metadata, yerelleştirme) | Düşük |
| `catalog__guides__cat-signals-quality.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/cat-signals-quality | event_stats ile pixel/app content_ids katalog eşleşme sayıları ve da_checks (pixel/app) kontrolleri, üç hâlli sonuç | Yüksek |
| `catalog__guides__catalog-item-types.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/catalog-item-types | Öğe türü ↔ katalog vertical eşleme tablosu (PRODUCT_ITEM, HOME_LISTING, VEHICLE, HOTEL…) | Yüksek |
| `catalog__guides__commerce-merchant-settings-api.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/commerce-merchant-settings-api | Commerce merchant settings okuma/güncelleme (durum, gizlilik politikası, Kore FTC, checkout config) | İlgisiz |
| `catalog__guides__diagnostics-api.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/diagnostics-api | Katalog diagnostics EVENT_SOURCE_ISSUES: alt türler, MUST_FIX/WARNING, yanıt alanları | Yüksek |
| `catalog__guides__feed-api.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/feed-api | Feed oluşturma (update_only replace tuzağı, supplementary), doğrudan yükleme, upload oturumu hata örneklemi ve tam hata raporu | Yüksek |
| `catalog__guides__generic-feed-files-api.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/generic-feed-files-api | Commerce partner'lar için promosyon/kargo profili/değerlendirme/navigasyon feed'i yükleme ve hata okuma | İlgisiz |
| `catalog__guides__inventory.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/inventory | inventory → quantity_to_sell_on_facebook, stok yaşam döngüsü, aşırı satış, staging, feed+batch stratejisi, FB ID vs retailer_id | Düşük |
| `catalog__guides__localized-catalog.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/localized-catalog | Yerelleştirilmiş katalog genel tanıtımı ve bağlantılar | Düşük |
| `catalog__guides__localized-catalog__supported-fields.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/localized-catalog/supported-fields | Öğe türüne göre yerelleştirilebilir alanlar; fiyat/stok yalnızca ülke feed'inde, image_link yerelleştirilemez, applink hepsi ya da hiç | Orta |
| `catalog__guides__manage-catalog-items.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/manage-catalog-items | Öğe yönetiminin üç yolu: tekil, Feed API, Batch API ve farkları | Orta |
| `catalog__guides__manage-catalog-items__catalog-batch-api.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/manage-catalog-items/catalog-batch-api | Batch uç noktaları: items_batch, localized_items_batch, check_batch_request_status, eski /batch | Yüksek |
| `catalog__guides__manage-catalog-items__catalog-batch-api__migrate-to-items-batch.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/manage-catalog-items/catalog-batch-api/migrate-to-items-batch | /batch → /items_batch geçişi: alan adı eşlemeleri, fiyat kuruş→string, bilinmeyen alan davranışı | Yüksek |
| `catalog__guides__metadata-tags.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/metadata-tags | Feed dosyasına ref_application_id/ref_asset_id meta etiketleri ve örnek TSV/XML | Düşük |
| `catalog__guides__microdata-tags.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/microdata-tags | Pixel tabanlı katalog için OpenGraph/Schema.org/JSON-LD ürün etiketleri; güncelleme pixel tetiklenince | Orta |
| `catalog__guides__offers-api.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/offers-api | Teklif feed'i alanları (application_type, kuponlar, hedef ürünler, BXGY, kargo, birleştirme kuralları) | Düşük |
| `catalog__guides__page-owned-product-catalog-api.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/page-owned-product-catalog-api | Sayfaya ait katalog oluşturma (sınırlı erişim), ajans paylaşımı permitted_tasks | Düşük |
| `catalog__guides__product-categories.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/product-categories | google_product_category ve fb_product_category, otomatik kategori, kategoriye özgü alanlar | Orta |
| `catalog__guides__product-deep-links.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/product-deep-links | applink.* deep link alanları, feed'in App Links'i ezmesi, gruptan tek öğe seçimi | Orta |
| `catalog__guides__product-variants.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/product-variants | item_group_id ile varyant gruplama, doğru/yanlış örnek, her varyant alanının dolu olması | Orta |
| `catalog__guides__ratings-and-reviews-api.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/ratings-and-reviews-api | Ürün değerlendirme feed'i oluşturma ve CSV yükleme (<100 MB) | İlgisiz |
| `catalog__guides__scheduled-feeds.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/scheduled-feeds | schedule (replace) ve update_schedule (update) takvimleri, schedule nesnesi alanları, tekil öğe güncellemesi ve feed/API karıştırma uyarısı | Yüksek |
| `catalog__guides__supplementary-feeds.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/guides/supplementary-feeds | Ek feed: yalnızca var olanı günceller, data_sources ile birincil kaynak bulma, 1 birincil → en fazla 1 ek feed | Orta |
| `catalog__localized-catalog-da.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/localized-catalog-da | Advantage+ catalog ads için çok dilli şablon (customization_rules_spec), collection örnekleri, dinamik önizleme | Orta |
| `catalog__localized-catalog-ig.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/localized-catalog-ig | Instagram ürün etiketlerinde yerelleştirme ve ülke feed'ine bağlı görünürlük | Düşük |
| `catalog__localized-catalog__localized-catalog-setup.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/localized-catalog/localized-catalog-setup | Dil/ülke/dil+ülke override feed'leri: biçim, öncelik sırası, override_type ile yükleme, delete, 350 çift sınırı | Orta |
| `catalog__localized-catalog__localized-catalog-setup__overrides-api.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/localized-catalog/localized-catalog-setup/overrides-api | GET /{item_id}/override_details ile öğenin override'larını okuma (keys/type süzgeci) | Düşük |
| `catalog__overview.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/overview | Katalog genel bakış: öznitelikler, veri kaynakları, replace/update takvimi, tek feed kuralı, gerçek zamanlı batch, diagnostics yolları | Yüksek |
| `catalog__reference.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference | Katalog ana referansı: feed biçimleri, ürün zorunlu/opsiyonel alanları ve sınırları, Hindistan alanları, yerelleştirme feed'i, OG/Schema.org/JSON-LD pixel etiketleri, JSON şema dışa aktarımı | Orta |
| `catalog__reference__activities.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/activities | Etkinlik (konser, tur, spor) katalog öğesi düğümü: alanlar, enum'lar, hizmet alanı (1–255 km), PUT güncelleme, DELETE | Düşük |
| `catalog__reference__activities__catalog-edge.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/activities/catalog-edge | Katalogdaki etkinlikleri listeleme (filter/summary) ve POST ile oluşturma; zorunlu alanlar ve opsiyonel alanlı örnek | Düşük |
| `catalog__reference__activities__feed-edge.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/activities/feed-edge | Bir feed'in içe aldığı etkinlikleri salt okuma listeleme (şablon kenar sayfası) | Düşük |
| `catalog__reference__activities__product-set-edge.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/activities/product-set-edge | Ürün setindeki etkinlikleri salt okuma listeleme, total_count (şablon kenar sayfası) | Düşük |
| `catalog__reference__apps-and-software.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/apps-and-software | Uygulama/yazılım katalog öğesi düğümü: app_category ve operating_system enum'ları, PUT/DELETE | İlgisiz |
| `catalog__reference__apps-and-software__catalog-edge.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/apps-and-software/catalog-edge | Katalogdaki uygulama/yazılım öğelerini listeleme ve POST ile oluşturma | İlgisiz |
| `catalog__reference__apps-and-software__feed-edge.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/apps-and-software/feed-edge | Feed'den gelen uygulama/yazılım öğelerini salt okuma listeleme (şablon kopya) | İlgisiz |
| `catalog__reference__apps-and-software__product-set-edge.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/apps-and-software/product-set-edge | Ürün setindeki uygulama/yazılım öğelerini salt okuma listeleme (şablon kopya) | İlgisiz |
| `catalog__reference__articles-and-publications.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/articles-and-publications | Makale/yayın (e-kitap, dergi, rapor) katalog öğesi düğümü: publication_category enum'u, 30 öğe sınırlı diziler, PUT/DELETE | İlgisiz |
| `catalog__reference__articles-and-publications__catalog-edge.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/articles-and-publications/catalog-edge | Katalogdaki makale/yayın öğelerini listeleme ve POST ile oluşturma | İlgisiz |
| `catalog__reference__articles-and-publications__feed-edge.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/articles-and-publications/feed-edge | Feed'den gelen makale/yayın öğelerini salt okuma listeleme (şablon kopya) | İlgisiz |
| `catalog__reference__articles-and-publications__product-set-edge.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/articles-and-publications/product-set-edge | Ürün setindeki makale/yayın öğelerini salt okuma listeleme (şablon kopya) | İlgisiz |
| `catalog__reference__media-titles.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/media-titles | Medya başlığı (film, dizi, müzik) katalog öğesi düğümü; güncelleme tablosunda fiyatın cent tam sayı olduğu çelişkisi | Düşük |
| `catalog__reference__media-titles__catalog-edge.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/media-titles/catalog-edge | Katalogdaki medya başlıklarını listeleme ve POST ile oluşturma | İlgisiz |
| `catalog__reference__media-titles__feed-edge.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/media-titles/feed-edge | Feed'den gelen medya başlıklarını salt okuma listeleme (şablon kopya) | İlgisiz |
| `catalog__reference__media-titles__product-set-edge.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/media-titles/product-set-edge | Ürün setindeki medya başlıklarını salt okuma listeleme (şablon kopya) | İlgisiz |
| `catalog__reference__professional-services.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/professional-services | Profesyonel hizmet katalog öğesi düğümü: service_category (serbest), çalışma saatleri, adres, hizmet alanı; silme konusunda çelişkili | Orta |
| `catalog__reference__professional-services__catalog-edge.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/professional-services/catalog-edge | Katalogdaki hizmetleri listeleme ve POST ile oluşturma; description zorunlu değil, silme Items Batch'e yönlendiriliyor | Orta |
| `catalog__reference__professional-services__feed-edge.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/professional-services/feed-edge | Feed'den gelen hizmet öğelerini salt okuma listeleme (şablon kopya) | Düşük |
| `catalog__reference__professional-services__product-set-edge.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/reference/professional-services/product-set-edge | Ürün setindeki hizmet öğelerini salt okuma listeleme, boş set kontrolü için total_count (şablon kopya) | Düşük |
| `catalog__support.md` | https://developers.facebook.com/documentation/ads-commerce/catalog/support | Feed sorun giderme: önerilen/eşleme/harf kuralları, eksik öğe sebepleri, hata raporu isteme ve durum değerleri, upload hata örnekleme | Orta |
| `commerce-platform.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform | Commerce Platform giriş sayfası; Shops ads'in artık offsite checkout kullandığı notu ve rehber bağlantıları | Düşük |
| `commerce-platform__api-setup.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/api-setup | Commerce API kurulumu: system user, varlık atama, token izinleri (catalog_management vb.), app–shop bağlama | Düşük |
| `commerce-platform__app-dashboard.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/app-dashboard | App Dashboard'da Commerce ürünü, test commerce hesabı ve Developer Performance Dashboard | İlgisiz |
| `commerce-platform__best-practices.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/best-practices | Commerce best practices içindekiler sayfası (entegrasyon, envanter, sipariş, kargo, satış sonrası) | İlgisiz |
| `commerce-platform__best-practices__integration.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/best-practices/integration | Entegrasyon planlama: system user görevleri, erişim seviyesine göre system user sayısı, token rotasyonu/iptali | Düşük |
| `commerce-platform__best-practices__inventory.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/best-practices/inventory | Envanter best practices: tek katalog, yerelleştirme, feed replace/update, ürünün reklamda görünmeme koşulları, kategori, varyant, custom_label | Orta |
| `commerce-platform__best-practices__orders.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/best-practices/orders | Sipariş yönetimi best practices: ön ödemeli sipariş, onay akışı, idempotency key, hata toleransı, Unicode | İlgisiz |
| `commerce-platform__best-practices__platform.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/best-practices/platform | Platform partner entegrasyonu: MBE, CMS, satıcı kataloğunu bulma, ürün yükleme/güncelleme ritmi, sipariş senkronu | Düşük |
| `commerce-platform__best-practices__post-purchase.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/best-practices/post-purchase | Satış sonrası: iade/iptal API, e-posta allowlist, Commerce içgörüleri (28g tık/1g görüntüleme), SSS | İlgisiz |
| `commerce-platform__best-practices__ship-fulfillment.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/best-practices/ship-fulfillment | Kargo profilleri, iade penceresi, takip numarası kuralları, tahmini/kesin vergi, Tax Override, finans mutabakatı | İlgisiz |
| `commerce-platform__best-practices__test-plan.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/best-practices/test-plan | Instagram checkout için kara kutu kabul testi planı | İlgisiz |
| `commerce-platform__catalog.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog | Katalog ve Envanter rehberlerinin içindekiler sayfası | Düşük |
| `commerce-platform__catalog__batch-api.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/batch-api | Catalog Batch API uçları: /batch, /items_batch, /check_batch_request_status ve farkları | Orta |
| `commerce-platform__catalog__best-practices.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/best-practices | Commerce katalog kalite kontrol listesi: feed ID saklama, batch sınırları, alan biçimleri, kategori derinliği, reklam/commerce ürün ayrımı | Orta |
| `commerce-platform__catalog__categories.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/categories | Ürün kategorileri: GPC vs FPC, kullanım amaçları, vergi, kategoriye özgü alanlar için kategori zorunluluğu | Orta |
| `commerce-platform__catalog__categories__baby.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/categories/baby | Bebek & Çocuk kategorisine özgü önerilen/ek nitelikler tablosu (nursery, oyuncak, beslenme, taşıma, bez) | Düşük |
| `commerce-platform__catalog__categories__cloth-access.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/categories/cloth-access | Giyim, Ayakkabı & Aksesuar kategorisine özgü önerilen/ek nitelikler tablosu | Düşük |
| `commerce-platform__catalog__categories__electronics.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/categories/electronics | Elektronik kategorisine özgü önerilen/ek nitelikler tablosu (telefon, bilgisayar, TV, kamera vb.) | Düşük |
| `commerce-platform__catalog__categories__google-product-category-to-facebook-product-category.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/categories/google-product-category-to-facebook-product-category | GPC→FPC bire-çok eşleme tablosu (~508 satır) ve katalog subvertical→GPC tablosu | Düşük |
| `commerce-platform__catalog__categories__health-beauty.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/categories/health-beauty | Sağlık & Güzellik kategorisine özgü önerilen/ek nitelikler tablosu | Düşük |
| `commerce-platform__catalog__categories__home.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/categories/home | Ev Dekor & Mobilya kategorisine özgü önerilen/ek nitelikler tablosu (mobilya, yatak, beyaz eşya, temizlik) | Düşük |
| `commerce-platform__catalog__categories__jewelry.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/categories/jewelry | Takı & Saat kategorisine özgü önerilen/ek nitelikler tablosu | Düşük |
| `commerce-platform__catalog__collections.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/collections | Product Set Collection API: ürün setine metadata (kapak, açıklama, reklamda varsayılan external_url), shop'a yayın, latest/live metadata | Orta |
| `commerce-platform__catalog__commerce-merchant-settings.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/commerce-merchant-settings | CMS altındaki shop'ları listeleme (GET /{CMS_ID}/shops) | İlgisiz |
| `commerce-platform__catalog__feed.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/feed | Feed API: product_feeds oluşturma (update_only varsayılan replace), schedule, tek seferlik yükleme, hata örneklemi ve tam hata raporu | Orta |
| `commerce-platform__catalog__fields.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/fields | Katalog alanları: reklam+commerce zorunlu alanlar, opsiyonel alanlar (internal_label, custom_label, shipping overlay vb.), Hindistan alanları, CSV/XML örnekleri | Yüksek |
| `commerce-platform__catalog__fields__product-visibility-per-channel.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/fields/product-visibility-per-channel | disabled_capabilities ile kanal başına görünürlük (mini_shops, marketplace_shops, ig_product_tagging, da) | Orta |
| `commerce-platform__catalog__flexify-integration-guide.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/flexify-integration-guide | Shopify Flexify uygulamasıyla kategori niteliklerini toplu ekleme (çok kısa) | İlgisiz |
| `commerce-platform__catalog__get-started.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/get-started | Katalog başlangıç: izinler (catalog_management, business_management), feed kurulumu, kategori seçimi, zamanlama | Düşük |
| `commerce-platform__catalog__inventory.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/inventory | Kullanımdan kalkan inventory alanı: stok dalgalanması, durdurulan ürün (staging), aşırı satış, batch ile güncelleme stratejileri | Düşük |
| `commerce-platform__catalog__localized.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/localized | Instagram ürün etiketleme için yerelleştirilmiş katalog: ülke/dil override ve etiketlerin kimlere görüneceği | Düşük |
| `commerce-platform__catalog__multiplatform.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/multiplatform | Reklam, Instagram ve commerce için tek katalog önerisi; birden çok sağlayıcının çakışmadan güncellemesi | Düşük |
| `commerce-platform__catalog__overview.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/overview | Katalog genel bakış: veri kaynakları, replace/update zamanlama, ürün tek feed'de, gerçek zamanlı batch, tanı API'leri | Orta |
| `commerce-platform__catalog__quantity-to-sell.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/quantity-to-sell | quantity_to_sell_on_facebook alanı (inventory'nin yerine), stok yaşam döngüsü, items_batch ile güncelleme | Düşük |
| `commerce-platform__catalog__shop.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/shop | Shop API: fb_sales_channel / ig_sales_channel durumları (ENABLED/DISABLED/STAGING) | İlgisiz |
| `commerce-platform__catalog__supplementary-feeds.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/supplementary-feeds | Supplementary feed entegrasyonu: yalnızca güncelleme, birincil kaynak bulma, ingestion_source_type/primary_feed_ids, 1-çok ilişki | Orta |
| `commerce-platform__catalog__update-only-feed.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/update-only-feed | Shopify feed'ine update-only ek feed ekleme; Shopify güncellerse değerin ezildiği uyarısı | Düşük |
| `commerce-platform__catalog__updating.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/updating | Reklam kataloğunu commerce'e yükseltme: varyant ekleme, kimlik değişiminin Advantage+ sıralamasını sıfırlaması, Pixel content_type | Orta |
| `commerce-platform__catalog__variants.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/catalog/variants | Ürün varyantları: item_group_id, tüm varyant alanlarının doldurulması, doğru/yanlış örnek | Orta |
| `commerce-platform__communication.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/communication | Müşteri iletişimi (4 Eylül 2025'te kalkacağı yazılı): destek/claim e-postaları, Purchase Protection, e-posta teslimi, iade | İlgisiz |
| `commerce-platform__concepts.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/concepts | Kavramlar içindekiler sayfası (üç bağlantı) | İlgisiz |
| `commerce-platform__concepts__architecture.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/concepts/architecture | Commerce hesabı varlıkları (Business, Commerce Account, Page, IG, Catalog) ve ilişkileri; checkout kaldırılma notu | Düşük |
| `commerce-platform__concepts__data-exchange.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/concepts/data-exchange | Satıcı görevlerinin API ile otomasyonu; sipariş ve ödeme akışı özeti | İlgisiz |
| `commerce-platform__concepts__user-experience.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/concepts/user-experience | Alıcı ve satıcı yolculuğu; checkout'un satıcı sitesinde yapılması | İlgisiz |
| `commerce-platform__enable-subscriptions.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/enable-subscriptions | Shops ads için abonelik ürünleri: subscription_plans katalog alanı ve checkout URL parametreleri | Düşük |
| `commerce-platform__get-started.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/get-started | Test commerce hesabı açma (yalnızca ABD, IG kanalı yok, gerçeğe çevrilemez), test ürünü ve test siparişi | Düşük |
| `commerce-platform__order-management.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/order-management | Sipariş yönetimi alt sayfalarının dizini | İlgisiz |
| `commerce-platform__order-management__acknowledgement-api.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/order-management/acknowledgement-api | Siparişi ACK'lama (tekli/100'lük toplu), CMS'i uygulamaya bağlama (`order_management_apps`) | İlgisiz |
| `commerce-platform__order-management__associate-shipping-profiles.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/order-management/associate-shipping-profiles | Katalog ürünlerine `shipping_profile_reference_id` güncelleme feed'iyle kargo profili atama (`-1` kaldırır) | İlgisiz |
| `commerce-platform__order-management__cancellation-refund-api.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/order-management/cancellation-refund-api | Sipariş iptali ve iadesi uçları, neden kodu enum'ları | İlgisiz |
| `commerce-platform__order-management__carrier-codes.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/order-management/carrier-codes | Desteklenen kargo taşıyıcı kodlarının alfabetik listesi (Türkiye'den yalnızca PTT_POSTA) | İlgisiz |
| `commerce-platform__order-management__error-codes.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/order-management/error-codes | Sipariş/onboarding hata kodları ve önerilen eylem | İlgisiz |
| `commerce-platform__order-management__fulfillment-api.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/order-management/fulfillment-api | Gönderi ekleme/güncelleme/listeleme, takip bilgisi ve gönderim adresi | İlgisiz |
| `commerce-platform__order-management__legacy-api.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/order-management/legacy-api | Kullanımdan kalkmış v3.2 sipariş API referansı (12 saatlik ACK SLA notu) | İlgisiz |
| `commerce-platform__order-management__order-api.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/order-management/order-api | Sipariş listeleme/detay/kalem/ürün detayı alanları; `email_remarketing_option` kuralı | Düşük |
| `commerce-platform__order-management__order-lifecycle.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/order-management/order-lifecycle | Sipariş durumları ve geçiş akışları | İlgisiz |
| `commerce-platform__order-management__order-snapshot-api.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/order-management/order-snapshot-api | Siparişi tek çağrıda anlık görüntüyle güncelleyen `item_updates` uç noktası | İlgisiz |
| `commerce-platform__order-management__returns-api.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/order-management/returns-api | İade talebi sorgulama/oluşturma/güncelleme, iade nedeni enum'ları | İlgisiz |
| `commerce-platform__order-management__shipping-profiles-api.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/order-management/shipping-profiles-api | Kargo profili CRUD (yalnızca US/NA, ≤10 gün) | İlgisiz |
| `commerce-platform__order-management__using-api.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/order-management/using-api | Sipariş API temelleri: sayfa token'ı, `fields` varsayılanı ezer, değişken sayfa boyu, idempotency anahtarı | Düşük |
| `commerce-platform__partners.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/partners | Partner entegrasyonu rehberinin dizini | Düşük |
| `commerce-platform__partners__build-offers-integration.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/partners/build-offers-integration | Teklif/indirim senkronu; Shops ads iki hedefe gittiği için promosyon tutarlılığı ROAS'ı etkiler; kuponlu teklif varsayılan görünmez | Düşük |
| `commerce-platform__partners__catalog-integration.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/partners/catalog-integration | Katalog senkronu, teşhis uçları, ürün seti, varyant `previous_id`, silmenin reklam öğrenmesine etkisi, Pixel/CAPI şartı | Orta |
| `commerce-platform__partners__glossary.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/partners/glossary | Commerce terimleri sözlüğü (CMS, katalog, OMS) | Düşük |
| `commerce-platform__partners__onboarding-integration.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/partners/onboarding-integration | FBE/MBE ile satıcı onboarding, `fbe_install` webhook'u, gizli sistem kullanıcısı token'ı, kaldırma | Düşük |
| `commerce-platform__partners__order-integration.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/partners/order-integration | Sipariş alma/ACK ve OMS'ten iptal-gönderim-iade senkronu (kalite çıtası) | İlgisiz |
| `commerce-platform__partners__overview.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/partners/overview | Partner geliştirici akışı ve kalite çıtası tablosu; Shop Ads için asgari şart Pixel | Düşük |
| `commerce-platform__platforms__automate-seller-analysis.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/platforms/automate-seller-analysis | Puan/yorum programı için satıcı listesi JSON'u ve eşleşme dönüşü | İlgisiz |
| `commerce-platform__platforms__distribution.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/platforms/distribution | Marketplace ve IG Shopping with Checkout dağıtımı için izin listesi süreci | İlgisiz |
| `commerce-platform__platforms__distribution__MPApprovalAPI.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/platforms/distribution/MPApprovalAPI | Marketplace onay talebi ve durum/sorun enum'ları | İlgisiz |
| `commerce-platform__platforms__feed-schema-csv.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/platforms/feed-schema-csv | Ürün yorumu feed şeması (CSV sütunları) | İlgisiz |
| `commerce-platform__platforms__feed-schema.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/platforms/feed-schema | Ürün yorumu feed şeması (JSON) | İlgisiz |
| `commerce-platform__platforms__onboarding.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/platforms/onboarding | Satıcı onboarding yollarının özeti (MBE, manuel, CM yönlendirme + OBO) | Düşük |
| `commerce-platform__platforms__onboarding__cmredirect.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/platforms/onboarding/cmredirect | Commerce Manager'a yönlendirip `cms_id` ile dönüş, gerekli izinler, CMS'e tek uygulama | Düşük |
| `commerce-platform__platforms__onboarding__fbe.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/platforms/onboarding/fbe | MBE kurulum akışı, `fbe_installs` yanıtı (reklam hesabı/piksel/katalog kimlikleri), sistem kullanıcısı token'ı | Düşük |
| `commerce-platform__platforms__onboarding__obo.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/platforms/onboarding/obo | Business On Behalf Of: müşteri BM'inde süresiz sistem kullanıcısı token'ı alma ve varlık atama | Orta |
| `commerce-platform__platforms__onboarding__page-elibility.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/platforms/onboarding/page-elibility | Sayfanın offsite/onsite Shop uygunluğu (`commerce_eligibility`), red kodları; örnekte anahtar yazım hatası | Orta |
| `commerce-platform__platforms__onboarding__troubleshooting.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/platforms/onboarding/troubleshooting | CMS/sayfa/katalog/BM kimliklerini bulma, kanal ve `setup_status` enum'ları | Düşük |
| `commerce-platform__platforms__support.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/platforms/support | Satıcı destek kaynakları ve müşteri iletişimi seçenekleri | İlgisiz |
| `commerce-platform__platforms__validation.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/platforms/validation | Entegrasyonu doğrulama kontrol listesi (onboarding, katalog, sipariş, ödeme) | İlgisiz |
| `commerce-platform__project-guide.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/project-guide | Satıcı entegrasyon proje rehberi; 4 Eylül 2025'te Meta içi Shops checkout'un kalktığını bildiriyor | Düşük |
| `commerce-platform__reporting.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/reporting | Finans raporlama API'si özeti (payout, transaction, payment/promotion); reklam atfı yok | İlgisiz |
| `commerce-platform__reporting__finance-tax.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/reporting/finance-tax | Ödeme alma süresi, satış vergisi ve chargeback süreci (ABD) | İlgisiz |
| `commerce-platform__reporting__payments.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/reporting/payments | Sipariş başına ödeme, vergi ve işlem detayı uç noktası | İlgisiz |
| `commerce-platform__reporting__payouts.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/reporting/payouts | Zaman aralığına göre payout geçmişi (`commerce_payouts`) | İlgisiz |
| `commerce-platform__reporting__promotions.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/reporting/promotions | Sipariş/kalem seviyesinde uygulanan promosyon detayları (`campaign_name` promosyon adı, reklam değil) | İlgisiz |
| `commerce-platform__reporting__transactions.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/reporting/transactions | Payout'a bağlı işlem ve sipariş detayları (`commerce_transactions`) | İlgisiz |
| `commerce-platform__setup-checkout-url.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/setup-checkout-url | Shop sepetini sitedeki ödemeye taşıyan URL (`products`, `coupon`), otomatik eklenen UTM ve `cart_origin` parametreleri, test adımları | Orta |
| `commerce-platform__shops-ads-heavyweight-bopis.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/shops-ads-heavyweight-bopis | Shops ads mağazadan teslim (ağır): mağaza konumu, ayrı yerel envanter kataloğu, checkout'ta `products_json`; reklam API alanı yok | Orta |
| `commerce-platform__shops-ads-lightweight-bopis.md` | https://developers.facebook.com/documentation/ads-commerce/commerce-platform/shops-ads-lightweight-bopis | Shops ads mağazadan teslim (hafif): mağaza konumu + katalogda `product_delivery_methods`; reklam API alanı yok | Orta |
| `marketing-api__advantage-catalog-ads-for-leadgen.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-catalog-ads-for-leadgen | Katalog reklamıyla lead formu: OUTCOME_LEADS, LEAD_GENERATION, CTA'da lead_gen_form_id, leadlerde retailer_item_id | Yüksek |
| `marketing-api__advantage-catalog-ads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-catalog-ads | Advantage+ katalog reklamlarına kısa giriş: feed, Pixel/App Events, şablon reklam | Düşük |
| `marketing-api__advantage-catalog-ads__advantage-app-campaigns.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-catalog-ads/advantage-app-campaigns | Advantage+ app campaigns ile katalog kreatifi; ads uç noktası parametreleri, validate_only/synchronous_ad_review | Orta |
| `marketing-api__advantage-catalog-ads__allow-product-video.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-catalog-ads/allow-product-video | Katalog ürün videosu: media_type_automation varsayılan açık, format seçenekleri, video_crop_style, feed/batch ile video | Yüksek |
| `marketing-api__advantage-catalog-ads__allow-product-video__faq.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-catalog-ads/allow-product-video/faq | Ürün videosu SSS: ürün başına 20 URL, video_fetch_status, teşhis hata kodları, tercih edilen oranlar | Orta |
| `marketing-api__advantage-catalog-ads__creative-preview.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-catalog-ads/creative-preview | Standart iyileştirme önizlemesi; v22.0'dan itibaren kaldırıldı, desteklenen ad_format'lar | Düşük |
| `marketing-api__advantage-catalog-ads__faq.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-catalog-ads/faq | Katalog/feed sınırları, Pixel–katalog kimlik eşleşmesi, kitle 0 nedenleri, 20 altı kitle yayınlanmaz | Orta |
| `marketing-api__advantage-catalog-ads__get-started.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-catalog-ads/get-started | Katalog reklamı uçtan uca: objective, ad set promoted_object, product_audience_specs, template_data, etiketler, kategori reklamı, önizleme | Yüksek |
| `marketing-api__advantage-catalog-ads__mobile-apps.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-catalog-ads/mobile-apps | Mobil uygulama için katalog reklamı: zorunlu app event'ler, MMP, deep link, applink_treatment, tracking_spec | Düşük |
| `marketing-api__advantage-catalog-ads__multi-ratio-images.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-catalog-ads/multi-ratio-images | Çok oranlı görseller: otomatik eşleşen etiketler, 9:16 için adapt_to_placement, oran bazlı preferred_image_tags | Orta |
| `marketing-api__advantage-catalog-ads__on-facebook-destination.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-catalog-ads/on-facebook-destination | Facebook içi ürün sayfasına giden katalog reklamı; yalnızca otomotiv katalogu, destination_type=FACEBOOK | Düşük |
| `marketing-api__advantage-catalog-ads__product-extensions.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-catalog-ads/product-extensions | Tek medya reklamın altına katalog ürünleri; v20.0+ uygun reklamda enroll_status zorunlu | Yüksek |
| `marketing-api__advantage-catalog-ads__standard-enhancements.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-catalog-ads/standard-enhancements | Standart iyileştirmeler paketi v22.0'da kaldırıldı; alt özellikler ve degrees_of_freedom_spec | Orta |
| `marketing-api__advantage-creative-for-catalog.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/advantage-creative-for-catalog | Katalog için Advantage+ kreatif: FORMAT_AUTOMATION, karusel/koleksiyon, varsayılan açık adapt_to_placement, açıklama sınırları, etiketler | Yüksek |
| `marketing-api__auto-ads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/auto-ads | Otomotiv reklamları giriş sayfası: envanter (AIA) ve model/teklif reklamları ne zaman kullanılır, alt sayfa bağlantıları | Düşük |
| `marketing-api__auto-ads__get-started.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/auto-ads/get-started | Otomotiv kurulum adımları özeti: katalog, olaylar, kitle, reklam; destination_type ve alan referans bağlantıları | Düşük |
| `marketing-api__auto-ads__guides.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/auto-ads/guides | Otomotiv rehberlerinin bağlantı dizini (AIA, model reklamları, katalog, olaylar, kitle, reklam yönetimi) | Düşük |
| `marketing-api__auto-ads__guides__ads-mgmt.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/auto-ads/guides/ads-mgmt | AIA kampanya/ad set/kreatif/reklam kurulumu: PRODUCT_CATALOG_SALES, destination_type varsayılanı (katalog URL), FACEBOOK hedefi, vehicle template tag'leri, önizleme | Orta |
| `marketing-api__auto-ads__guides__aia.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/auto-ads/guides/aia | Otomotiv envanter reklamı tanımı ve izlenecek rehber bağlantıları; içerik yok denecek kadar az | Düşük |
| `marketing-api__auto-ads__guides__aoa.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/auto-ads/guides/aoa | Otomotiv model/teklif reklamları: vehicle_offers kataloğu, zamanlı feed, teklif seti, vehicle_offer pixel olay/parametreleri, event source group, VEHICLE_OFFER kitlesi | Orta |
| `marketing-api__auto-ads__guides__audience-mgmt.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/auto-ads/guides/audience-mgmt | Pixel'i araç kataloğuna bağlama ve CLAIM/VEHICLE yeniden hedefleme kitlesi; page olay kaynağı yalnız on-Facebook hedefte | Orta |
| `marketing-api__auto-ads__guides__catalog.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/auto-ads/guides/catalog | Araç kataloğu kurma, feed zamanlama, araç seti (product set) filtre operatörleri | Orta |
| `marketing-api__auto-ads__guides__events.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/auto-ads/guides/events | Otomotiv pixel/Android/iOS olayları (Search, ViewContent, AddToWishlist) ve araç parametreleri, enum değerleri | Orta |
| `marketing-api__auto-ads__overview.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/auto-ads/overview | Otomotiv reklamlarının çalışma mantığı ve başarı ölçümü, Help Center bağlantıları | Düşük |
| `marketing-api__auto-ads__reference.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/auto-ads/reference | Araç ve bayi feed alanları (zorunlu/opsiyonel, enum'lar, sınırlar), model/teklif feed alanları, feed biçimleri, vehicle_offers katalog oluşturma | Orta |
| `marketing-api__collaborative-ads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads | Collaborative Ads: perakendecinin katalog dilimini markayla paylaşması, dilim oluşturma/paylaşma uçları, markanın PRODUCT_CATALOG_SALES kampanyası, dilimde kısıtlı alanlar, catalog_segment_* metrikleri | Orta |
| `marketing-api__collaborative-ads__managed-partner-ads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads/managed-partner-ads | MPA tanıtımı: pazar yerinin satıcıları adına reklam çalıştırması, faydalar, parent/child terimleri, üç adımlı başlangıç | Düşük |
| `marketing-api__collaborative-ads__managed-partner-ads__api-guide.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads/managed-partner-ads/api-guide | MPA API rehberi içindekiler: ön koşullar, satıcı yönetimi, reklam yönetimi, async, hata sayfalarına bağlantılar | Düşük |
| `marketing-api__collaborative-ads__managed-partner-ads__api-guide__async-api-user-guide.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads/managed-partner-ads/api-guide/async-api-user-guide | Async oturum yoklama: GET {ASYNC_SESSION_ID} id,status,result; durum enum'u; yoklama rate limit'e sayılıyor, üstel geri çekilme | Orta |
| `marketing-api__collaborative-ads__managed-partner-ads__api-guide__error-handling-guide.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads/managed-partner-ads/api-guide/error-handling-guide | MPA async hata zarfı; code benzersiz değil, error_subcode varsa error_user_msg okunmalı | Orta |
| `marketing-api__collaborative-ads__managed-partner-ads__api-guide__mpa-ads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads/managed-partner-ads/api-guide/mpa-ads | MPA reklam yönetimi süreç tarifi (onboarding, şablon, satıcı arayüzü, faturalama, Collaboration Center); kampanya oluşturma çağrısı İÇERMİYOR | Düşük |
| `marketing-api__collaborative-ads__managed-partner-ads__api-guide__prerequisites.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads/managed-partner-ads/api-guide/prerequisites | MPA ön koşulları: admin system user oluştur, yetki ver, token üret (yalnızca bağlantı listesi) | Düşük |
| `marketing-api__collaborative-ads__managed-partner-ads__api-guide__prerequisites__assign-permissions-to-system-user.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads/managed-partner-ads/api-guide/prerequisites/assign-permissions-to-system-user | Admin system user'a Finance editor, Manage App, Manage Catalog yetkilerinin arayüzden atanması | Düşük |
| `marketing-api__collaborative-ads__managed-partner-ads__api-guide__prerequisites__create-system-user.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads/managed-partner-ads/api-guide/prerequisites/create-system-user | Admin system user oluşturma; işletme başına yalnızca bir admin system user uyarısı | Düşük |
| `marketing-api__collaborative-ads__managed-partner-ads__api-guide__prerequisites__generate-access-token-system-user.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads/managed-partner-ads/api-guide/prerequisites/generate-access-token-system-user | System user token'ı (ads_management, business_management, catalog_management); arayüzde bir kez gösteriliyor | Düşük |
| `marketing-api__collaborative-ads__managed-partner-ads__api-guide__seller.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads/managed-partner-ads/api-guide/seller | Satıcı/managed partner terimleri ve onboarding için gereken bilgiler (sayfa/BM, site, vendor ID) | Düşük |
| `marketing-api__collaborative-ads__managed-partner-ads__api-guide__seller__deletion.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads/managed-partner-ads/api-guide/seller/deletion | Satıcı silme (asyncbatch DELETE managed_partner_businesses): hesabı kapatır, BM/sayfa/dilim/system user siler; aktif kampanya/bakiye engelleri ve hata kodları | Düşük |
| `marketing-api__collaborative-ads__managed-partner-ads__api-guide__seller__eligibility.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads/managed-partner-ads/api-guide/seller/eligibility | Satıcı uygunluk sorgusu (collaborative_ads_managed_partner_eligibility), 28 günlük satın alma kriterleri, hata kodları | Düşük |
| `marketing-api__collaborative-ads__managed-partner-ads__api-guide__seller__onboarding.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads/managed-partner-ads/api-guide/seller/onboarding | Seller Business Creation API: child BM+sayfa+hesap+kredi+dilim otomatik kurulumu, async yanıt; istek/parametre bölümleri BOŞ | Düşük |
| `marketing-api__collaborative-ads__managed-partner-ads__faq.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads/managed-partner-ads/faq | MPA SSS: sayfa seçenekleri, aams_seller_businesses örneği, spend_cap, lifetime_budget kredi aşımı, USD kredi, inceleme süresi, insights sıklığı | Orta |
| `marketing-api__collaborative-ads__managed-partner-ads__integration.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads/managed-partner-ads/integration | MPA entegrasyonu: ≥20.000 satıcı şartı, varsayılan şablon (catalog sales, 2 ad set, carousel), faturalama/invoice group, Access Tier yeniden adlandırması (500 çağrı) | Düşük |
| `marketing-api__collaborative-ads__managed-partner-ads__reference.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads/managed-partner-ads/reference | MPA referansı: satıcı arama, meta veri, child token, satıcı yapılandırma güncelleme ve hata kodları, varsayılan/özel şablonlar ve template JSON | Orta |
| `marketing-api__collaborative-ads__partner-premium-options.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads/partner-premium-options | Perakendecinin markaya premium seçenekleri (kategori retargeting, basket insights, retailer custom audiences) okuma/yazma uçları | Düşük |
| `marketing-api__destination-ads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/destination-ads | Destinasyon reklamlarının 5 adımlı kurulum haritası (katalog, olay, kitle, reklam, template tag); içerik yok, bağlantı listesi | Düşük |
| `marketing-api__destination-ads__catalog.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/destination-ads/catalog | `vertical=destinations` katalog, feed alanları (destination_id, address, image, type, price_change…), feed yükleme, set filtresi, external_event_sources bağı | Orta |
| `marketing-api__destination-ads__events.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/destination-ads/events | Destinasyon için Search/ViewContent/InitiateCheckout/Purchase pixel+SDK örnekleri ve parametreleri (content_ids, travel_start/end, city/region/country); örneklerde ad ve zorunluluk tutarsızlıkları | Orta |
| `marketing-api__destination-ads__template-tags.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/destination-ads/template-tags | Destinasyon template tag'leri (trip.*, destination.*) ve veri yokken varsayılanları (tarih yarın/öbür gün, yetişkin 1) | Orta |
| `marketing-api__flight-ads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/flight-ads | Uçuş reklamlarının 5 adımlı kurulum haritası; bağlantı listesi | Düşük |
| `marketing-api__flight-ads__catalog.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/flight-ads/catalog | `vertical=flights` katalog; IATA rota tabanlı feed alanları, olaylardan otomatik rota üretimi (generate_items_from_events, fallback_image_url), set filtresi, olay kaynağı bağı | Orta |
| `marketing-api__flight-ads__events.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/flight-ads/events | Uçuş olayları; eşleşme content_ids değil origin/destination_airport ile ama bu ikisi parametre tablosunda yok; travel_class enum'u, currency katalogla aynı olmalı | Orta |
| `marketing-api__flight-ads__template-tags.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/flight-ads/template-tags | Uçuş template tag'leri (trip.departing/returning_departure_date, flight.*), flight.price source:feed/event ve type:one_way seçenekleri | Orta |
| `marketing-api__hotel-ads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/hotel-ads | Otel reklamlarının kurulum haritası + dinamik fiyatlandırma bağlantısı | Düşük |
| `marketing-api__hotel-ads__catalog.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/hotel-ads/catalog | `vertical=hotels` katalog; otel ve oda feed alanları (hotel_id, room_id, checkin_date ≤180 gün, fiyat/vergi/ücret, guest_rating), Hotel API, set filtresi (fiyat sent cinsinden) | Orta |
| `marketing-api__hotel-ads__dynamic-pricing.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/hotel-ads/dynamic-pricing | Tarihe göre otel fiyatı: hotel_rooms_batch ve pricing_variables_batch XML yüklemesi, 50 MB sınırı, Nights ≤14, parametre listesi | Düşük |
| `marketing-api__hotel-ads__events.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/hotel-ads/events | Otel olayları; content_ids = hotel_id (Search dışında zorunlu), checkin/checkout tarihleri, city/region/country Search'te zorunlu, tercih parametreleri | Orta |
| `marketing-api__hotel-ads__template-tags.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/hotel-ads/template-tags | Otel template tag'leri, dinamik tarih söz dizimi (date.today, date_offset, date_timezone; birimler tutarsız), %30 kapsama eşiği, fiyat tag'lerinin dinamik/statik geri düşüşü | Orta |
| `marketing-api__product-set-optimization__budget-splits.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/product-set-optimization/budget-splits | Beta RMN: çok markalı katalog kampanyasında marka başına bütçe bölme, budget_split_set CSV ve durum sorgusu | Düşük |
| `marketing-api__product-set-optimization__product-set-optimization-overview.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/product-set-optimization/product-set-optimization-overview | Beta ürün seti optimizasyonu önkoşulları (eşleşme oranı, izinler, sistem kullanıcısı) ve product_sets CRUD | Düşük |
| `marketing-api__product-set-optimization__promoted-products-optimization.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/product-set-optimization/promoted-products-optimization | Beta tek markalı tanıtılan ürün optimizasyonu: OUTCOME_SALES, budget_source=RMN, 72 saat, alanlar sonradan değişmez | Düşük |
| `marketing-api__real-estate-ads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/real-estate-ads | Emlak reklamları giriş: home listing kataloğu, Marketplace ülke sınırı, konut reklamında HOUSING özel kategorisinin zorunluluğu | Yüksek |
| `marketing-api__real-estate-ads__ads-management.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/real-estate-ads/ads-management | Emlak katalog reklamı kurulumu: kampanya (HOUSING'siz örnek), ad set (custom_event_type PURCHASE), şablon kreatif, home_listing template tag'leri, tracking_specs | Yüksek |
| `marketing-api__real-estate-ads__audience.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/real-estate-ads/audience | Emlak olayları (Search/ViewContent/InitiateCheckout/Purchase) ve parametreleri, kataloğa bağlama, event source group paylaşımı, HOME_LISTING dinamik kitle; Special Ad Audience v15.0'da kalktı | Yüksek |
| `marketing-api__real-estate-ads__get-started.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/real-estate-ads/get-started | home_listings kataloğu, feed biçimleri, home listing alanları ve enum'ları, available_dates_price_config, liste seti filtreleri, çevrimdışı dönüşüm olay anlamları | Yüksek |
| `marketing-api__real-estate-ads__guides.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/real-estate-ads/guides | Emlak rehberlerinin iki bağlantılık dizini (kitle, reklam oluşturma) | Düşük |
| `marketing-api__reference__product-catalog.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog | ProductCatalog düğümü: alanlar (vertical, product_count, is_catalog_segment, da_display_settings), owned_product_catalogs ile oluşturma, güncelleme, silme, pixel bağlama örnekleri | Yüksek |
| `marketing-api__reference__product-catalog__additional_reviews.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/additional_reviews | Reddedilen ürün için ek inceleme (itiraz); istek başı 100 öğe, katalog başı günde 10 çağrı, ürün başı bir kez; parametre tablosu yok | Düşük |
| `marketing-api__reference__product-catalog__assigned_users.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/assigned_users | Kataloğa kullanıcı atama/okuma/kaldırma; tasks enum, business zorunlu, ads_management + catalog_management izinleri, 415 2FA | Yüksek |
| `marketing-api__reference__product-catalog__automotive_models.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/automotive_models | Otomotiv modellerini salt okuma (filter, bulk_pagination, total_count) | İlgisiz |
| `marketing-api__reference__product-catalog__batch.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/batch | Eski /batch ucu; yeni entegrasyon yasak, items_batch'e geçilmeli; allow_upsert vars. true, 80014 | Orta |
| `marketing-api__reference__product-catalog__bundle_folders.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/bundle_folders | Dinamik öğe paket klasörlerini salt okuma; parametresiz | İlgisiz |
| `marketing-api__reference__product-catalog__bundles.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/bundles | Dinamik öğe paketlerini salt okuma; parametresiz | İlgisiz |
| `marketing-api__reference__product-catalog__catalog_segments.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/catalog_segments | Katalogdan türetilen segmentleri (ProductCatalog düğümleri) listeleme, total_count | Düşük |
| `marketing-api__reference__product-catalog__catalog_store.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/catalog_store | Mağaza katalogu ayarı oluşturma (page zorunlu); okuma yok | İlgisiz |
| `marketing-api__reference__product-catalog__categories.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/categories | Katalog kategorileri okuma (BRAND/CATEGORY/PRODUCT_TYPE) ve kategori varlığı yazma; dönüş updated/skipped/total | Düşük |
| `marketing-api__reference__product-catalog__check_batch_request_status.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/check_batch_request_status | Toplu yazma handle durumunu okuma; load_ids_of_invalid_requests vars. false (boş dizi), errors_total_count, uyarılar, 80009 | Yüksek |
| `marketing-api__reference__product-catalog__check_marketplace_partner_sellers_status.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/check_marketplace_partner_sellers_status | Marketplace ortak satıcı durumu (session_id zorunlu) | İlgisiz |
| `marketing-api__reference__product-catalog__collaborative_ads_share_settings.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/collaborative_ads_share_settings | Katalog segmentinin işbirlikli reklam paylaşım ayarlarını salt okuma | Düşük |
| `marketing-api__reference__product-catalog__connected_businesses.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/connected_businesses | Katalogda yetkisi olan işletmeleri role süzgeciyle okuma | Orta |
| `marketing-api__reference__product-catalog__da_checks.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/da_checks | Dinamik reklam kontrollerini çalıştırma (checks, connection_method); DACheck alanları bu sayfada yok | Yüksek |
| `marketing-api__reference__product-catalog__data_sources.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/data_sources | Katalog veri kaynakları; ingestion_source_type vars. PRIMARY (ek beslemeler görünmez) | Orta |
| `marketing-api__reference__product-catalog__destinations.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/destinations | Seyahat destinasyonlarını salt okuma (filter, total_count) | İlgisiz |
| `marketing-api__reference__product-catalog__diagnostics.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/diagnostics | Katalog teşhis grupları; channels/entities/severities (MUST_FIX/OPPORTUNITY)/types süzgeçleri | Yüksek |
| `marketing-api__reference__product-catalog__dpa_eligible_ad_accounts.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/dpa_eligible_ad_accounts | Geçerli kullanıcının katalogla reklam verebileceği reklam hesapları (limit vars. 1000, search) | Yüksek |
| `marketing-api__reference__product-catalog__event_stats.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/event_stats | Pixel/uygulama olaylarının katalogla eşleşme istatistiği, son 28 gün, DA olayı+kaynak kırılımı; yalnız erişilen kaynaklar; 270 | Yüksek |
| `marketing-api__reference__product-catalog__external_event_sources.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/external_event_sources | Kataloğa pixel/uygulama bağlama (POST) ve listeleme; silme bölümü boş | Yüksek |
| `marketing-api__reference__product-catalog__facets.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/facets | Filtreye göre katalog yüzeyleri (facets) okuma | Düşük |
| `marketing-api__reference__product-catalog__flights.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/flights | Uçuş öğelerini salt okuma (filter, total_count) | İlgisiz |
| `marketing-api__reference__product-catalog__home_listings.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/home_listings | Emlak ilanlarını okuma ve tekil oluşturma; zorunlu alanlar (adres, fiyat+currency, görsel, year_built) | Yüksek |
| `marketing-api__reference__product-catalog__hotel_rooms_batch.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/hotel_rooms_batch | Otel odası dosya toplu yükleme; update_only vars. false (eksik satırlar silinir) | İlgisiz |
| `marketing-api__reference__product-catalog__hotels.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/hotels | Otelleri okuma/oluşturma; filtre örneği i_contains, currency vars. USD | Düşük |
| `marketing-api__reference__product-catalog__items_batch.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/items_batch | Asenkron toplu öğe CREATE/UPDATE/DELETE; 5000 kayıt/28 MB, handles+validation_status, item_type başına alan tabloları, tanınmayan alan yalnız uyarı | Yüksek |
| `marketing-api__reference__product-catalog__local_service_businesses.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/local_service_businesses | Yerel hizmet işletmelerini salt okuma | Düşük |
| `marketing-api__reference__product-catalog__localized_items_batch.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/localized_items_batch | Var olan öğelerin dil/ülke yerelleştirmesi toplu yazma; fiyat/stok yalnız ülke beslemesinde; kod 1 "reduce the amount of data" | Orta |
| `marketing-api__reference__product-catalog__marketplace_partner_signals.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/marketplace_partner_signals | Marketplace ortak dönüşüm sinyali gönderme (mp_clid) | İlgisiz |
| `marketing-api__reference__product-catalog__pricing_variables_batch.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/pricing_variables_batch | Otel fiyat değişkenleri XML toplu yükleme; fiyatsız Result siler, update_only vars. false | İlgisiz |
| `marketing-api__reference__product-catalog__product_feeds.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/product_feeds | Besleme listeleme/oluşturma; schedule (LA saat dilimi), country US/USD varsayılanları, deletion_enabled geri alınamaz, migrated_from_feed_id | Yüksek |
| `marketing-api__reference__product-catalog__product_groups.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/product_groups | Ürün gruplarını (varyant grupları) salt okuma | Düşük |
| `marketing-api__reference__product-catalog__product_sets.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/product_sets | Ürün seti okuma/oluşturma ve filtre sözdizimi; boş filtre = tüm katalog, boş set yayınlanmaz, Unicode etiket yasağı, 2022 operatör değişikliği, 10803 | Yüksek |
| `marketing-api__reference__product-catalog__product_sets_batch.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/product_sets_batch | Ürün seti toplu işlem durumunu handle ile okuma | Düşük |
| `marketing-api__reference__product-catalog__products.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/products | Ürün okuma (filter, error_type/error_priority, öğe errors) ve tekil oluşturma (price kuruş int64, varsayılanlar, allow_upsert v24+) | Yüksek |
| `marketing-api__reference__product-catalog__smart_pixel_settings.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/smart_pixel_settings | Akıllı pixel ayarlarını salt okuma; açıklama yok | Düşük |
| `marketing-api__reference__product-catalog__update_generated_image_config.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/update_generated_image_config | Boş sayfa (yalnız başlıklar, içerik yok) | İlgisiz |
| `marketing-api__reference__product-catalog__user_tasks.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/user_tasks | Katalog kullanıcı görevlerini salt okuma; parametresiz | Düşük |
| `marketing-api__reference__product-catalog__vehicle_offers.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/vehicle_offers | Araç tekliflerini salt okuma | İlgisiz |
| `marketing-api__reference__product-catalog__vehicles.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/vehicles | Araçları okuma ve tekil oluşturma; mileage.unit vars. MILES | İlgisiz |
| `marketing-api__reference__product-catalog__videos.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/product-catalog/videos | Boş sayfa (yalnız başlıklar, içerik yok) | İlgisiz |
| `marketing-api__reservation.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reservation | Reach & Frequency rezervasyonu: buying_type RESERVED, rf_spec sınırları, reachfrequencypredictions tahmin/rezerv/iptal, durum kodları, ad set atama/ayırma, düzenleme kısıtları, creative_sequence, hata kodları | Orta |
| `marketing-api__shops-ads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/shops-ads | Shops ads: OUTCOME_SALES katalog/pixel tabanlı kurgu, ad set WEBSITE + promoted_object, WEBSITE_AND_SHOP ile Meta'nın site/mağaza seçimi, onsite_destinations, uygunluk (OFFSITE_IAB_CHECKOUT) | Yüksek |
| `marketing-api__travel-ads.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/travel-ads | Üç dikey için ortak kampanya kurulumu: PRODUCT_CATALOG_SALES + promoted_object, dynamic_audience_ids (inline kitle yok), template_data kreatif, template_url_spec geri düşüşü, overlay, önizleme, product_id kırılımı | Yüksek |
| `marketing-api__travel-ads__audience-management.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/travel-ads/audience-management | Seyahat kitleleri: event source group + act_'siz hesap paylaşımı, claim_objective=TRAVEL, inclusions/exclusions/retention (≥4 saat)/booking_window/rule; subtype kalkma notu ve örnek çelişkileri | Yüksek |
