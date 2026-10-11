# Devir: Dalga 3 · Google görsel kurguları (Erişim = Talep Yaratma görsel, Satış = Maks. Performans)

Dal `dalga3-google` (taban `3beb534`). Push yok, deploy yok.
**`REHBER_ACILIS` DEĞİŞMEDİ**: ERISIM ve SATIS Google satırları hâlâ `kapali`.
Testler satırı test süresince `deneme`ye çekip geri alıyor. Açmak Ajan 5'in
işi ve aşağıdaki "ölçülmedi" listesindeki validateOnly provası olmadan
açılmamalı.

**CANLIDA HİÇBİR ŞEY ÖLÇÜLMEDİ.** Bu oturumda tek bir validateOnly provası
bile yapılmadı; alan adları v25 referansından ve Google'ın resmî
`AddPerformanceMaxCampaign` örneğinden (2026-10-11 okundu).

## Ne yapıldı

### 1. Erişim · Google = Talep Yaratma GÖRSEL (`TALEP_YARATMA_GORSEL`)

- **Gövde** (`connections/providers/google-demandgen.ts`):
  `demandGenGorselAtomikIstek` (yeni, video fonksiyonuna DOKUNULMADI —
  Akıllı Boost'un canlıda doğrulanmış gövdesi aynı kalsın). Sıra: bütçe →
  kampanya (video ile aynı gövde: PAUSED, PRESENCE, `upgradedTargeting`,
  `targetSpend`) → grup → konum (grupta) → [yaş kitlesi] → YENİ görseller →
  [logo] → `demandGenMultiAssetAd`.
  - v25 `DemandGenMultiAssetAdInfo`: `businessName` DÜZ DİZGE (video
    reklamında `AdTextAsset`), başlık ≤ 30 × 5, açıklama ≤ 90 × 5,
    `marketingImages` (1.91:1), `squareMarketingImages` (1:1),
    `portraitMarketingImages` (4:5). `tallPortraitMarketingImages` (9:16)
    VAR ama gönderilmiyor (ölçülmedi). `callToActionText` gönderilmiyor
    (rehberde kaynağı yok, Google otomatik seçiyor).
  - **Kanallar** (`DEMAND_GEN_GORSEL_KANALLARI`): YouTube akışı + Shorts,
    Gmail, Keşfet AÇIK; YouTube video arası (görsel orada gösterilmez),
    Görüntülü Reklam Ağı, Haritalar (`maps`, v25'te yeni) KAPALI — yedisi
    açıkça. Video grubunun bloğu (yalnız YouTube) görselde envanter
    bulamazdı.
  - **Reklam otomasyonları** (`adGroupAdAssetAutomationSettings`):
    `GENERATE_VIDEOS_FROM_OTHER_ASSETS`, `GENERATE_DESIGN_VERSIONS_FOR_IMAGES`,
    `GENERATE_ANIMATED_IMAGES_FROM_OTHER_ASSETS` OPTED_OUT (enum belgesi üçü
    de bu reklam türünde varsayılan AÇIK diyor; kullanıcının görmediği
    yaratıcı içerik, yasal uyarılı sektörde risk).
- **Teklif**: her zaman Maksimum tıklama. `googleTeklifi` (shared, `turet.ts`)
  TEK kural; karar tablosu ve servis de onu okuyor. **Ek düzeltme**: VIDEO
  kurgusunda tablo dönüşüm ölçümü etkinken "En çok dönüşüm" diyordu, gövde
  ise her zaman `targetSpend` gönderiyordu (ekran yalan). Artık iki Talep
  Yaratma kurgusunda da tablo "En çok tıklama" diyor.
- **Görseller**: `rehberdenGoogle` artık yalnız bu iki kurguda
  `gorseller: [{varlikId, oran}]` yazıyor (Arama/video girdisine eklenmedi:
  içerik özetleri değişip kayıtlı provalar bayatlamasın). Videolar Google'a
  gitmiyor (Google videoyu YouTube'dan istiyor) → uyarı. Oranı bilinmeyen
  görsel türetmeyi durdurur (`G-GORSEL-ORAN`).

### 2. Satış · Google = Maks. Performans (`MAKS_PERFORMANS`)

- **Gövde** (`connections/providers/google-pmax.ts`, yeni): `pmaxAtomikIstek`.
  Sıra (resmî örnekle aynı): bütçe (paylaşımsız) → kampanya → kampanya
  ölçütleri (konum + Türkçe) → VARLIK GRUBU (ENABLED, verilen adres) →
  [metin/görsel/video varlığı + `assetGroupAsset` bağı]… → işletme adı ve
  logo + `campaignAsset` bağları.
  - Kampanya: `PERFORMANCE_MAX`, alt tipsiz, `maximizeConversions`,
    `brandGuidelinesEnabled: true` (v21+ varsayılanı; açıkça, çünkü alan
    değiştirilemez ve iki hâlde marka FARKLI yere bağlanıyor), PRESENCE,
    AB beyanı.
  - Otomasyon (`assetAutomationSettings`): `FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION`
    OPTED_OUT (trafik verilen sayfada kalsın; v25'te eski
    `url_expansion_opt_out` Campaign'de YOK), `TEXT_ASSET_AUTOMATION`
    OPTED_OUT, `GENERATE_IMAGE_EXTRACTION` OPTED_OUT (siteden görsel çekme),
    `GENERATE_IMAGE_ENHANCEMENT` OPTED_IN (aynı görselin kırpılması).
  - Aynı metin TEK varlık; aynı alana aynı varlık bir kez bağlanıyor.
  - Reklam nesnesi YOK: `sira.reklam = null`, yayın nesneleri
    `kampanya` + `varlik_grubu` (tür `reklam_seti`).
- **Uzun başlık** (`pmaxUzunBaslik`, shared): ana metin ≤ 90 ise O; değilse
  ve 3+ açıklama varsa SONUNCUSU (açıklamalardan çıkar); ikisi de yoksa
  `G-UZUN-BASLIK` engeli. Açıklamanın kendisini hem açıklama hem uzun başlık
  olarak bağlamak ölçülmedi, kırpmak yarım cümle — ikisi de yapılmadı.
- **Satın alma ölçümü** (`googleSatisOlcumu`): hazırlıkta ve prova/yayın
  ÖNCESİ TAZE (`googleSatisTazele`) GAQL: `conversion_action` ENABLED +
  `primary_for_goal = TRUE` + `category = 'PURCHASE'`, WHERE'deki her alan
  SELECT'te. Üç hâl: `false` engel (`G-DONUSUM`), `null` düzenlemede uyarı,
  prova/yayında `platformaGiderken` ile ENGEL. Türetme de `satisOlcumu !==
  true` ise `G-DONUSUM` ile durur (ikinci kapı).
- Retler (derleyicide, eksik listesinde de): yatay VE kare zorunlu, 3+
  başlık, 2+ açıklama, en az biri ≤ 60 (`SHORT_DESCRIPTION_REQUIRED`),
  işletme adı ≤ 25 (kırpılmıyor), yaş > 18 (`G-PMAX-YAS`, gövde yaş ölçütü
  taşımıyor).

### 3. Ortak

- **Google görsel kuralları TEK dosyada** (`packages/shared/src/reklam/rehber/google-gorsel.ts`):
  oran payı ±%1 (Meta'nın `oranBul`u %3; 1200×640 orada "yatay", Google'da
  `ASPECT_RATIO_NOT_ALLOWED`), en az boyutlar, 5.120.000 bayt. Eksik listesi
  (`googleGorselOlculeri` ile GİRİŞ ANINDA) ve derleyici aynı fonksiyonu
  okuyor. 9:16 ve videolar UYARI (Meta için gerekebilirler; engel kullanıcıyı
  Meta'nın en iyi yerleşimini kapatmaya zorlardı).
- **Görsel kaynakları** (`RehberService.googleGorselKaynaklari`):
  `asset_platform_refs` önbelleği (logo ile aynı), yoksa arşivden bayt.
  Yayında yeni yüklenen görsellerin kaynak adı önbelleğe yazılıyor
  (`sira.gorseller`).
- **Logo** artık Maks. Performans için de okunuyor; `G-LOGO` ön koşulu PMax'i de kapsıyor.
- **Karar tablosu** (`kararlar.ts`): PMax "Bütün Google…", "Otomatik metin
  ve sayfa genişletme kapalı" (not: video yoksa Google video üretebilir);
  Talep Yaratma görsel "YouTube akışı ve Shorts, Gmail, Keşfet",
  "Görsellerinden video ve yeni tasarım üretme kapalı". Her söz
  `derle-google-dalga3.spec.ts`te gövdeyle eşleniyor.
- **Geri okuma** (`google-yayin.ts`): `GoogleBeklenen` yalnız yeni
  kurgularda `teklif`, `gorselReklam` (görsel sayıları, logo, yedi kanal,
  otomasyon), `varlikGrubu` (grup sayısı, adres, alan sayıları, kampanya
  marka bağları, marka kuralları, otomasyon) taşıyor; eski satırlarda alan
  yok = bakılmıyor. Google'ın KENDİ ürettiği varlıklar (`source =
  AUTOMATICALLY_CREATED`) sayılmıyor. Proto3 JSON'da gelmeyen `false`
  kanal kapalı sayılıyor. Kıyas artık anahtar sırasından bağımsız.
- **Uzlaştırma/tekillik**: PMax'te `ad_group_ad` YOK → arama `asset_group`'tan.
- **GAQL kuralı**: sahte port (`google-yayin.spec.ts#gaqlKurali`) artık
  BÜTÜN sorgularda "WHERE'deki iliştirilmiş kaynak alanı SELECT'te" kuralını
  dayatıyor. Mevcut iki kriter sorgusuna ve ad aramasına `campaign.id` /
  `campaign.name, campaign.status` eklendi (zararsız; canlıda seçilmeden de
  geçmişti).

## Testler

- `derle-google-dalga3.spec.ts` (38): iki altın gövde, karar tablosu ↔ gövde,
  sesli retler, saf bulgu fonksiyonları.
- `google-yayin.spec.ts` (+10): iki kurgunun kur → geri oku → aç yolu,
  kanal/otomasyon/varlık farkları, otomatik varlık, PMax uzlaştırma, önbellek.
- `rehber-google-dalga3.spec.ts` (5): servis düzeyi — ölçüm yok / okunamadı /
  var, giriş anında ±%1.
- Mutasyonla doğrulandı: otomatik varlık süzgeci, GAQL SELECT (iki sorgu),
  PMax tekillik dalı, varlık grubu kıyası, `reklam` yokken kimlik kabulü
  (ilk hâlinde mutasyon YAŞADI — uzlaştırmaya düşüp yine "iletildi"
  diyordu; test ad aramasının TEK olduğunu iddia edecek şekilde
  sıkılaştırıldı), görsel önbelleği, shared `GOOGLE_ORAN_PAYI` ve türetmenin
  `G-DONUSUM`u (dist yeniden derlenerek), `platformaGiderken` eşlemesi.

## ÖLÇÜLMEDİ (açmadan önce validateOnly provası şart)

1. **PMax metin varlıkları aynı istekte**: Google'ın örneği başlık ve
   açıklamaları AYRI bir önceki istekte kuruyor ("repeated assets ... be
   created before the campaign"). Burada geçici kimlikle aynı istekte. Prova
   reddederse ikinci yol: metin varlıklarını önce GERÇEK bir istekle kur
   (metin varlığı para harcamaz, Google aynı metni tekilleştirir) — ama
   prova o zaman iki adımlı olur (validateOnly kaynak adı döndürmüyor).
2. `adGroupAdAssetAutomationSettings`'in Talep Yaratma çoklu varlık
   reklamında kabulü ve GERİ OKUMADA yankılanıp yankılanmadığı. Yankılanmazsa
   geri okuma her yayını `fark_var`da durdurur (bilinmeyen = fark).
3. `campaign.asset_automation_settings`in PMax'te dört türün de kabulü
   (`GENERATE_IMAGE_EXTRACTION`, `GENERATE_IMAGE_ENHANCEMENT` dahil) ve
   geri okumada aynen dönmesi.
4. `maps: false` alanının v25 Talep Yaratma grubunda kabulü.
5. Görsel varlık adlarının (`<ad> <id son 8> <damga>`) tekilliği; aynı
   baytlı görselde Google'ın var olan varlığı döndürmesi.
6. `conversion_action.category = 'PURCHASE'` süzgeci — etkin ama hiç
   tetiklenmeyen etiket "var" görünür; son 30 günde dönüşüm sayısı
   sorulmuyor.
7. PMax kampanya hedeflerinin (`CampaignConversionGoal`) yalnız satın alma
   olmadığı: Google hesaptaki BÜTÜN birincil dönüşümlerden öğrenir (notla
   söyleniyor, kurulmuyor).
8. PMax'te YouTube videosu yokken Google'ın otomatik video üretmesini
   kapatacak API anahtarı bulunamadı (enumdaki
   `GENERATE_VIDEOS_FROM_OTHER_ASSETS` Talep Yaratma'ya özgü). Not olarak
   söyleniyor.
9. Talep Yaratma görselinde günlük asgari bütçe: video ile aynı (`G-ASGARI`,
   5 USD karşılığı) varsayıldı. PMax için asgari kontrol YOK.
10. 9:16 (`tallPortraitMarketingImages`) — alan v25'te var, ölçülmedi;
    gönderilmiyor.
11. GAQL'de seçilen yeni alanların (`ad_group_ad.ad_group_ad_asset_automation_settings`,
    `campaign.asset_automation_settings`, `asset_group_asset.source`,
    `demand_gen_multi_asset_ad.*`) gerçekten seçilebilir olduğu ve yanıt
    biçimi (sahte port yalnız şekli taklit ediyor).
12. Görseller base64 olarak atomik isteğin ve `yayin.derlenmis_govde`nin
    İÇİNDE (logo yolunun deseni). 10 görsel × 5 MB'a yaklaşan bir istek
    gövdesinin Google'da ve JSONB'de sorunsuz geçtiği ölçülmedi; önbellek
    (`asset_platform_refs`) ikinci yayından itibaren baytı taşımıyor.

## Açık / sonraki

- Panel: rehber adım 4'te Google görsel kurgusu için `G-GORSEL-*`,
  `G-UZUN-BASLIK`, `G-KISA-ACIKLAMA` eksikleri sunucudan geliyor; panelin
  kendi rozeti (`googleGorselUygunMu`) ±%1'i bilmiyor (panel ajanının dosyası,
  dokunulmadı).
- `REHBER_ACILIS` ERISIM/SATIS Google → `deneme`: Ajan 5, yukarıdaki 1-4
  validateOnly provasıyla kapandıktan sonra.
- Kapsam dışı dokunulan dosyalar: `rehber.service.ts` (Meta ajanı da
  düzenliyor olabilir — `onKosullar` bloğu ve `baglam` ölçü sorgusu),
  `hazirlik.service.ts` (okuyucu arayüzüne `googleSatisOlcumu`),
  `eksikler.ts` (Google bloğu ayrı ve işaretli), `hazirlik.service.spec.ts`
  (modül sınırı izin listesine `google-pmax`).
