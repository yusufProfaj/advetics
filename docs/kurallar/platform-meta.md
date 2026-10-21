# Canlıda öğrenilen platform gerçekleri — Meta

> CLAUDE.md'den taşındı (2026-10-16, token düzeni). İçerik DEĞİŞMEDİ, yalnız konuya göre ayrıldı.
> Yeni ders buraya, ilgili konu dosyasına EKLENİR; CLAUDE.md'ye yalnız tek satırlık işaret gider.


Hepsi gerçek para harcanarak ya da bir tur kaybedilerek bulundu. Belgeden
okunup varsayılmadı — canlıda doğrulandı.

**Meta**

- **Ad set'te `destination_type` verilmezse boost REDDEDİLİYOR.** Meta hedefi
  kendi çözüp harici web sitesine düşüyor ve *"Eylem Çağrısı Gerekiyor ·
  Kampanya amacınız için harici bir internet sitesi URL'si gerekiyor"*
  (subcode 2446383) diyor. Gönderi öne çıkarmada doğru değer `ON_POST`.
  Mesajın "reklam kreatifi kısmında" demesi YANILTICI — eksik olan ad set alanı.
- **`geo_locations` kovaları BİRLEŞİM, kesişim değil.** "Türkiye + İzmir"
  göndermek Türkiye geneli demek ve **hiçbir hata vermiyor**. Lokasyon
  seçildiğinde ülke geneli gönderilmemeli.
- **Instagram medyasının ÜÇ kimlik uzayı var:** `/{ig-user}/media` → `id`
  (doğru), `ig_id`, `legacy_instagram_media_id`. Karıştırmak sessiz hata.
- **Instagram gönderisi `object_story_id` ile reklama çevrilemez.** Ayrı bir
  `adcreatives` çağrısı ve kök seviyede üç alan gerekiyor: `object_id`
  (Facebook sayfası), `instagram_user_id`, `source_instagram_media_id`.
- **Kreatif oluştu diye doğru gönderiye bağlandığı anlamına gelmiyor.** Geri
  okuyup karşılaştır — ama BENZERİ BENZERLE: yazdığın alanın yankısıyla.
  `effective_instagram_media_id` başka bir kimlik uzayında olabiliyor ve onu
  engel saymak çalışan bir yolu kapatıyor.
- **KREATİF GÖRSEL ADRESİ İMZALI VE ÖLÜYOR — saklanamaz.** `image_url` geçici
  ve HER Graph çağrısı yenisini üretiyor; `thumbnail_url` için kalıcı bir
  karşılık HİÇ YOK (kalıcı olan tek şey `AdImage.permanent_url` ve o yalnızca
  `image_hash` taşıyan kreatiflerde var — gönderi/video boost'larında yok).
  Bunu DELTA yapı taramasıyla birleştirince adres yazıldığı gün taze, iki
  hafta sonra ölü oluyor: rapor PDF'inde on reklamın hepsi "sunucu 403".
  Adres KULLANILACAĞI ANDA tazeleniyor (`kreatif-adresi.service.ts`), yapı
  taramasında değil — orada tazelemek de işe yaramazdı, çünkü rapor günler
  sonra üretiliyor.
- **`?ids=` ÇOKLU SORGUSUNDA TEK KÖTÜ KİMLİK İSTEĞİN TAMAMINI DÜŞÜRÜYOR.**
  Silinmiş bir kreatif, kalan 23 reklamın da görselini götürüyor. Liste
  yarılanıp tekrar isteniyor; tek kimliğe inildiğinde DÜĞÜM yoluna
  (`/{creative-id}`) geçiliyor — `ids` bir kolaylık, düğüm yolu Graph'in en
  kesin biçimi ve yarılama en sonunda hep bilinen yola düşmeli.

- **KREATİF ÖZELLİK ANAHTARLARI BÜYÜK HARF VE YEDİ TANE — belgeden değil
  Meta'dan.** Ölçüldü (2026-10-07, v25.0, yeni reklam modülünün ilk canlı
  provası): `degrees_of_freedom_spec.creative_features_spec` içinde
  belgedeki küçük harfli anahtarlar (`music`, `adapt_to_placement`,
  `pac_relaxation`...) `(#100) Param key ... must be one of {...}` ile
  reddediliyor ve tek bir yanlış anahtar BÜTÜN kreatifi düşürüyor. Kabul
  edilen küme: `IG_VIDEO_NATIVE_SUBTITLE, IMAGE_ANIMATION, PRODUCT_BROWSING,
  PRODUCT_METADATA_AUTOMATION, PROFILE_CARD, STANDARD_ENHANCEMENTS_CATALOG,
  TEXT_OVERLAY_TRANSLATION`. Hata mesajı kümeyi kendisi veriyor; yeni anahtar
  eklemeden önce prova ile ölç (`TANINAN_OZELLIK_ANAHTARLARI`).

- **GERİ OKUMADA META DÖRT ŞEYİ DEĞİŞTİRİYOR — ölçüldü** (2026-10-10, v25.0,
  AdvCampaign rehberi canlı tur 1, Ege Birlik Yapı, duraklatılmış ağaç):
  (1) `creative_features_spec` anahtarları KÜÇÜK HARFLE dönüyor (biz
  `IMAGE_ANIMATION` gönderiyoruz, `image_animation` okunuyor) ve ~90
  özelliğin HEPSİ `OPT_OUT` — belgenin "kapatılamaz" dediği
  `text_optimizations`, `adapt_to_placement`, `image_touchups` dahil;
  (2) `geo_locations`a `location_types: [home, recent, frequently_in]`
  ekleniyor ("yaşayan ya da yakın zamanda bulunan", seyahat eden YOK);
  (3) `promoted_object`e `smart_pse_enabled: false`; (4) geçmiş
  `start_time` kurulum anına çekiliyor. Dördü de geri okumayı "fark"la
  durdurdu (doğru davranış: bilinmeyen farkta açılmaz). Normalleştirme
  `meta/yanki.ts` (N-07…N-10); her biri DAR: küçük harfli OPT_IN, `travel_in`,
  true değerli ek anahtar, başka güne kayan başlangıç hâlâ durdurur.
  Aynı turda gözle: sayfa doğru (panel turunda Meta başka müşterinin
  sayfasını seçmişti), "çok reklamverenli reklamlar" işaretsiz.

- **YERLEŞİME GÖRE GÖRSEL: PROVA KURALLARIN EKSİKSİZLİĞİNİ DENETLEMİYOR —
  ölçüldü** (2026-10-10, v25.0, `meta-yerlesim-prova`, Ege Birlik Yapı).
  `asset_feed_spec` + `asset_customization_rules` (dört boyut, Advantage+
  yerleşim; 9:16 eksik + elle yerleşim) `/ads` validate_only'den geçti — ama
  yerleşimlerin çoğunu kapsamayan TEK kurallı negatif kontrol de geçti.
  Eksiksizlik derleyicide garanti ediliyor (her açık grup bir kural, SONDA
  varsayılan; `banner-seti.ts`, `banner-seti.spec.ts`). Ayrıca prova reklam
  parçasında `synchronous_ad_review`ı çıkarınca satır içi kampanya
  "Satın Alma Türü eksik" (1815223) ile düşüyor; seçenekle geçiyor. Banner
  seti kararı (kullanıcı): bir tasarımın boyutları TEK reklam, eksik boyutta o
  yerleşim kapanır; dört boyut tamsa Advantage+ yerleşim kalır. Doğru görselin
  doğru yerleşime gittiği HENÜZ duraklatılmış bir kurulumda gözle görülmedi.
  **`/ads` satır içi ölçümü `adcreatives` ucunun kuralını YAKALAMADI:** gerçek
  prova, platformları açıkça sayan varsayılan kuralı *"Boş özelleştirme
  teknik özellikleriyle Varsayılan Varlık Özelleştirmesi Kuralı (en düşük
  öncelikle) gereklidir"* ile reddetti. Varsayılan kural `customization_spec:
  {}` ve EN SONDA. İkinci prova: *"All non-default target rules must contain
  geolocation customization"*; kurala konum eklenince üçüncü: *"(#2715)
  Segment Asset Customization API has been deprecated from v22"*. Sebep
  ikisinde de aynı: `asset_feed_spec.optimization_type: 'PLACEMENT'` yoktu ve
  Meta kuralları HEDEFLEME (segment) kuralı sayıyordu. Hata mesajı çözümü
  değil yanlış yolu tarif ediyordu. Ders: bir biçimi ölçerken yayında
  kullanılacak HER uca sor. **Dördüncü denemede KURULDU** (yayın 3efebf54,
  duraklatılmış, 1 kampanya/1 set/1 kreatif/1 reklam) ve geri okumada iki
  şey daha görüldü: Meta her yerleşim kuralına `age_min: 13, age_max: 65`
  ekliyor (N-14) ve kreatif adının sonuna ` YYYY-MM-DD-<32 hex>` damgası
  koyuyor (N-15; tur 2'deki "yeniden kullanılan kreatif" adında da bu vardı).
  **Önizlemeyle gözle kontrol edildi** (Meta `previews`, 11 yerleşim):
  Hikâye/Reels'te 9:16, akışlarda 4:5, sağ sütunda 1.91:1, Audience
  Network/IG arama/profilde 1:1 doğru; **Marketplace KARE kutu** ve akış
  grubundaydı, 4:5 oraya kırpılarak gitti. Marketplace artık kendi grubunda
  ve yalnız kare alıyor; kare yoksa kapanıyor.

- **GERİ OKUMADA İKİ ŞEY DAHA — ölçüldü** (2026-10-10, canlı tur 2,
  konutlu duraklatılmış ağaç): (1) `adlabels` `{id, name}` ve TERS sırada
  dönüyor; öğeyi bütün kıyaslamak doğru etiketi "fark" yapıyordu — adla
  kıyaslanıyor (N-11). (2) **Meta aynı içerikli kreatifi YENİDEN
  KULLANIYOR**: ilk denemeyle aynı görsel ve metin gönderildi, dört
  kreatifin hepsi ilk denemenin adını ve `adv-yayin-` etiketini taşıyarak
  döndü. Yalnız kreatifte, yalnız ad ve etiket için ve yalnız BAŞKA bir
  Advetics yayınının etiketi varsa bilgi sayılıyor (N-12); içerik alanları
  her zamanki gibi kıyaslanıyor. Sonuç: aynı kreatif birden çok yayına ait
  olabilir — kreatif üzerinden "bu yayının nesnesi" sorgusu yapma.
  Ayrıca tur 1'in "temiz" testi ayna okumayla kurulmuştu ve etiketlere
  kimlik eklemediği için (1)'i hiç göremedi: ayna, Meta'nın değiştirdiği
  her şeyi taklit etmedikçe "temiz" iddiası canlıda doğrulanmış sayılmaz.

- **ŞEMSİYE ÖZELLİK VE YENİ NESNE GECİKMESİ — ölçüldü** (2026-10-11,
  v25.0, WhatsApp canlı turu 2): yeniden kullanılan (N-12) kreatifte Meta
  yedi özellik anahtarının HİÇBİRİNİ döndürmedi, yalnız
  `advantage_plus_creative: OPT_OUT`; yedi "dönmedi" satırı yayını
  "okunamadı"da durdurdu (N-18, dar). Ayrıca geri okuma hatası `catch {}`
  ile yutuluyordu: okuma artık 0/3/10 sn yeniden deneniyor ve mesaj
  `geri_okuma.ham.okuma_hatalari`nda. Rehberin "Yeniden kontrol et"
  düğmesi yoktu ve API yolu durum makinesinde hiç çalışmamıştı
  (`dogrulanamadi` → yalnız `geri_okuma`).

- **ERİŞİM CANLI TURU — ölçüldü** (2026-10-11, v25.0): Meta sıklık
  sınırını `type: "CAP"` ekleyerek döndürüyor (N-19, dar: başka tür fark).
  Ayrıca yerleşim planı ayrı reklamlarda KESİŞİMDİ: 1:1 + 1.91:1 + 4:5
  verilince akış kapanıyordu. Banner seti yoksa birleşim
  (`reklamSetiPlani`); kesişim yalnız iki+ boyutlu set varken.

- **KREATİF ADI 100 KARAKTERDE KESİLİYOR — ölçüldü** (2026-10-11, v25.0,
  satış canlı turu): Meta adı 100. karakterde kesip damgasını (N-15)
  ekliyor; 101 karakterlik ad "fark" ile durdurdu. Derleyici sığdırıyor
  (`kreatifAdi`, amaç adı "…" ile kısalır). Reklam/set adında gözlenmedi.

- **ÖZEL KATEGORİ SATIR İÇİ `campaign_spec`TE SINANAMIYOR — ölçüldü**
  (2026-10-10, v25.0, `meta-kategori-prova`, Ege Birlik Yapı). Konutlu
  provada kampanya kendi ucunda GEÇTİ; reklam seti ve reklamlar (satır içi
  kampanyayla) `special_ad_categories[0] must be one of {...} - got "2"` ile
  düştü. `["HOUSING"]`, ülkeyle birlikte ve düz dize: üçü de aynı ret — Meta
  değeri iç sıra numarasına çevirip kendi listesinde bulamıyor. Gerçek
  kurulum `campaign_id` ile gittiği için etkilenmiyor. Prova kategoriyi
  YALNIZ satır içi kampanyadan çıkarıyor ve geçen parçada bunu söylüyor;
  provanın tamamından atmak yalancı prova olurdu. Ayrıca `/adsets` ucu satır
  içi kampanyayla kategorisiz bile 5xx veriyor (bilinen, `kapsamaUygula`).

- **CLICK-TO-WHATSAPP'TA NUMARA SORULMAZ — META ONU SAYFADAN ALIYOR.**
  Doğru kurulum: ad set'te `destination_type: WHATSAPP` + `promoted_object.
  page_id`, kreatifte SABİT bağlantı `https://api.whatsapp.com/send` ve CTA
  değeri `{ app_destination: 'WHATSAPP' }`. Panel bir süre `wa.me/<numara>`
  kuruyor ve numarayı kullanıcıya elle yazdırıyordu: Meta'da zaten tanımlı
  bir bilgiyi ikinci kez girmek, ve yazılan numara ile sayfaya bağlı numara
  ayrıştığında reklamın BAŞKA BİR HATTA düşmesi — hiçbir hata vermeden.
  CTA değerinde `{ link }` göndermek de belgelenen biçim değil: Meta kabul
  edip butonu tarayıcıya yönlendirebiliyor, yani reklam yayınlanır ve
  tıklayan kişi WhatsApp yerine bir web sayfası görür.
  **GÜNCELLEME 2026-10-11 (Dalga 3) — NUMARA ARTIK SORULUYOR.** Kullanıcı
  numaranın SEÇİLEBİLİR olmasını istedi (birden çok hattı olan işletme) ve
  "Meta sayfadan alır" varsayımı ölçülemiyordu: sayfanın `whatsapp_number`
  alanı canlıda BOŞ döndü, WABA `phone_numbers` ise elimizde olmayan bir izin
  istiyor (`#200`). Yani hangi hattın kullanılacağını okuyamıyoruz ve
  "numara sorulmaz" kuralı kullanıcıya hattı göstermeden bir hatta bağlamak
  demekti. Bugün rehber numarayı açıkça soruyor (E.164 `+90`, Marka
  Merkezi telefonu önden dolar ve kaynağı yazar) ve derleyici onu
  `promoted_object.whatsapp_phone_number` ile gönderiyor; sayfaya bağlı
  OLMAYAN bir numarayı Meta'nın reddetmesi bekleniyor, yani sessizce yanlış
  hatta düşmek açık bir hataya dönüşüyor. Biçim (`+` ile mi) ve Meta'nın
  reddettiği CANLIDA ÖLÇÜLMEDİ; geri okuma yalnız rakamları kıyaslıyor
  (yanki.ts N-17). Bağlantı ve CTA kuralları yukarıdaki gibi.

- **İLGİ ALANI ARAMASI (`/search?type=adinterest`) KISA TERİMLE EŞLEŞİYOR.**
  Ölçüldü (2026-09-29, `meta-ilgi-kontrol`): "lüks otomobil" 0 satır,
  "otomobil" 5, "luxury car" 4, "luxury vehicles" 0, "golf" 5. `locale=tr_TR`
  eşleşmeyi DEĞİŞTİRMİYOR (açık/kapalı aynı sayı); dönen adlar zaten Türkçe
  ("Otomobiller (araçlar)"). HTTP 200 + boş dizi bir HATA DEĞİL, "eşleşme
  yok" — ve sessizce boş bir öneri üretir. Kitle önerisi bu yüzden kavram
  başına 1-4 kısa aday (Türkçe + İngilizce) üretip sırayla deniyor ve hangi
  adayın tuttuğunu yazıyor (genelleşme kullanıcıya görünmeli).

- **ORGANİK GÖNDERİ İSTATİSTİK ADLARI DEĞİŞTİ — ölçüldü** (2026-09-30,
  Graph v25.0, `meta-sayfa-metrik-kontrol`, 3 FB sayfası + 3 IG hesabı).
  Facebook'ta `post_impressions`, `post_impressions_unique` ve `_organic`
  türevleri REDDEDİLİYOR (*"The value must be a valid insights metric"*);
  halefleri `post_media_view` (gösterim) ve `post_total_media_view_unique`
  (erişim), `post_video_views` geçerli. Instagram'da `impressions` v22'den
  beri yok; `reach`, `saved`, `views` geçerli ve gösterimi `views` tutuyor.
  İstatistik gönderiyle AYNI istekte iç içe alan olarak isteniyor: TEK
  geçersiz ad isteğin tamamını düşürüyor ve belirti "sayfada hiç gönderi
  yok". Ret görülürse istek istatistiksiz tekrarlanıyor (`icgoruReddiMi`);
  yeni bir metrik eklemeden önce betikle ölç.
- **İLGİ ALANI BÜYÜKLÜĞÜ DÜNYA GENELİ.** `audience_size_lower/upper_bound`
  ülkeye göre değil: "Golf (spor)" ~264–310 MİLYON. Türkiye hedeflemesinde bu
  sayıyı göstermek kitleyi yüz kat büyük gösterir. Ülkeye göre büyüklük ayrı
  bir çağrı (`delivery_estimate` / `reachestimate`) ister.
- **ÖZEL KİTLE (`/act_X/customaudiences`) ALANLARI DOĞRULANDI** (2026-09-29,
  30 hesap tarandı): `subtype` (CUSTOM, WEBSITE, LOOKALIKE…),
  `approximate_count_lower/upper_bound`, `delivery_status {code, description}`.
  Kod 200 = kullanıma hazır, 300 = "kampanya oluşturmada kullanılmak için çok
  küçük" — Türkçe açıklama Meta'dan geliyor. Küçük kitlelerde büyüklük
  **1000–1000** dönüyor: gerçek sayı değil, Meta'nın TABANI; "tam 1000 kişi"
  diye okunmamalı.

- **`validateOnly` META'DA YOK — "prova" isteği GERÇEKTEN YAZAR (2026-10-19).**
  `CampaignActionsService.uygula(…, { validateOnly: true })` seçeneği
  sağlayıcıya iletiyor; `google.provider.ts` onu `validateOnly` gövdesine
  çeviriyor, `meta.provider.ts` ise HİÇ okumuyor ve durumu/bütçeyi yazıyor.
  MCP onay önizlemesi tam bu tuzağa düşecekti ("önce prova edip kullanıcıya
  sorayım" = onaydan önce kampanyayı durdurmak). Önizleme için
  `onizle` (aynı ön kontrol, platform çağrısı yok). Meta'da gerçek prova
  gerekiyorsa Graph API'nin `execution_options=["validate_only"]` alanı
  canlıda ölçülmeden kullanılmaz.

- **Anlık formun dil kodu geri okunurken küçük harf** (2026-10-20, Ege
  Birlik, form `2999249563750186`): `locale: 'TR_TR'` gönderiliyor, Graph
  `tr_TR` döndürüyor. Harf duyarlı karşılaştırma aynı dildeki formu "Meta'da
  farklı duruyor" diye işaretledi ve MCP `form_yayinla` onayı "başarısız"
  döndü (form açıktı, KVKK kutusu ve sorular uyuşuyordu). Dil karşılaştırması
  `formGeriOkumaDenetimi`nde harf duyarsız; başka bir dil (EN_US) hâlâ fark.

- **Instagram boost'unda `VIEW_INSTAGRAM_PROFILE` düğmesi de `link` ister** (2026-10-21, canlı): `call_to_action: {type}` tek başına "link alanını doldurmak zorunludur" (subcode 2061015) ile kreatif adımında reddediliyor; hata kampanya ve ad set açıldıktan SONRA geldiği için geri alma şart oluyordu. Adres `https://www.instagram.com/<username>/`, kullanıcı adı `GET /{ig-user}?fields=username` ile kampanyadan ÖNCE okunuyor (`MetaProvider.instagramProfilAdresi`). Meta'nın kendi Ads MCP'si bu adresi kendisi kuruyor, belgesi "değer alanı yok" diyor: API'nin kendisi istiyor.
