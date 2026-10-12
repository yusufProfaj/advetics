# Paket F: Dış veri kaynakları (Ajan 1 · Mimar)

**Tarih:** 2026-10-12 · **Girdi:** `docs/rakip-analizi/ORPHEX-BOSLUK.md`
(commit 1453d58) B-9, B-12, B-13 ve karar Ç-O3 (e-ticaret KAPSAMDA) ·
**Sözleşme:** `packages/shared/src/veri-kaynagi/` (derleme çıktısıyla temiz) ·
**Testler:** `apps/api/src/modules/veri-kaynagi/sozlesme.spec.ts` (42 test,
dört kritik kural mutasyonla doğrulandı) · **Taslak:** [`taslak.html`](taslak.html)
· **Şablon:** `docs/sinyal/MIMARI.md` (Paket A, commit 5ca8fd1).

Üç alt paket, sırayla:

| Dalga | Paket | Ne | Kimlik | Ön koşul (kullanıcıda) |
|---|---|---|---|---|
| 1 | **F1 GA4 okuma** | Site trafiği, anahtar etkinlik, gelir; platform dönüşümü ile site dönüşümü farkı (takip açığı) | Var olan Google bağlantısı, izin `analytics.readonly` (zaten `GOOGLE_OLCUM_SCOPES` içinde) | Google Cloud'da **Analytics Data API** açık (BAGLANTI.md §1) |
| 2 | **F2 Search Console** | Organik arama + ücretli arama örtüşmesi | Aynı Google bağlantısı, YENİ izin `webmasters.readonly` | Onay ekranına izin + **Search Console API** açık |
| 3a | **F3 ürün reklamı** | Google `shopping_performance_view`, Meta `product_id` kırılımı | Var olan platform bağlantıları (reklam hesabı işi) | Yok |
| 3b | **F3 ürün listesi** | Merchant API, Meta kataloğu | Google (YENİ izin `content`) / Meta | Onay ekranı + Merchant API + `registerGcp` |
| 3c | **F3 mağaza** | ikas / Ticimax / Shopify sipariş ve iade | Mağaza panelinde üretilen kimlik | Altyapı sırası ölçümle (Ç-12) |

Bir dalga canlıya alınmadan diğeri başlamaz (CLAUDE.md beş ajan düzeni).

---

## 0. Çelişki tablosu

Kullanıcı karar yetkisini oturum yöneticisine devretti; her satırda öneri
var ve **varsayılan olarak kabul**. Saf arayüz kararları CLAUDE.md §5 gereği
"Mimar (§5)" diye işaretli.

| # | Brief / varsayım | Depo / platform gerçeği | Öneri | Karar |
|---|---|---|---|---|
| Ç-1 | GA4, SC, mağazalar "yeni platform" gibi eklenebilir | `Platform` değeri 29 metotlu sağlayıcıyı, `Record<Platform>` kayıtlarını, `PLATFORM_SIRASI`nı ve 47 elle yazılmış listeyi devreye sokuyor; GA4'ün kampanyası/bütçesi/reklamı yok | **Ayrı kavram: veri kaynağı** (`KAYNAK_TURLERI`, kapalı liste). `enum Platform`a ve `insights_daily`ye GİRMEZ; testte kilitli (`PLATFORMS` ile kesişim boş). İstisna: ürün bazında REKLAM verisi platform işi (`urun_performansi`), çünkü reklam hesabının kendi verisi | Öneri — yönetici onayına |
| Ç-2 | GA4/SC için ayrı bağlantı mı | Aynı Google kimliğini ikinci kez yetkilendirmek önceki token'ı geçersiz kılıyor (CLAUDE.md §5) | **Var olan Google bağlantısı**, izin `include_granted_scopes` ile genişler (kurulum rehberinin "Ölçüm izinlerini ver" akışı). Kaynak başına TEK izin aranır (`eksikKaynakIzni`): GA4 okumak için Tag Manager yayın izni istenmez | Öneri — yönetici onayına |
| Ç-3 | Kaynak da havuzda dursun mu (hesaplar gibi) | Havuz modeli reklam hesabı keşfinden doğdu; GA4 mülk listesi zaten Admin API'den istek anında geliyor (`Ga4Istemcisi.hesaplar`) | **Havuz YOK.** Bağlantı (Google kimliği) ajansın ya da şirketin havuzunda, mülk ise doğrudan workspace'e BAĞLANIR (`veri_kaynaklari.client_id NOT NULL`). Hangi Google bağlantısının kullanılacağı `kurulum.service#baglantiSec` kuralıyla aynı (hesap sahibi kararı); ikinci bir seçici yazılmaz, fonksiyon ortak yere taşınır | Öneri — yönetici onayına |
| Ç-4 | Bir mülk iki workspace'te olabilir mi | Ajansın "tüm workspace'ler" toplamında aynı mülk iki kez sayılır (çift sayım) | `UNIQUE (org_id, tur, dis_kimlik)` (`ad_accounts` deseni). İkinci workspace bağlamak isterse "bu mülk X workspace'ine bağlı" cevabı | Öneri — yönetici onayına |
| Ç-5 | Kurulum rehberi zaten `workspace_kurulum.ga4_mulk_id` yazıyor | Aynı mülk iki tabloda = ayrışma riski | İkisi de kalır (kurulduğu ile okunduğu farklı şeyler); kurulum mülkü kurunca GA4 kaynağı **otomatik bağlanır** (salt okuma, geri alınabilir). Sonradan ayrışırlarsa ekranda `kurulumUyusmazligi` yazar, sessizce biri seçilmez | Öneri — yönetici onayına |
| Ç-6 | Meta kampanya eşlemesi "utm_campaign adıyla" | Meta kampanya adı değişince ad eşlemesi kopar; aynı adlı iki kampanya belirsiz | Eşleme sırası: Google otomatik etiket kimliği → `utm_campaign` = kampanya kimliği → normalleştirilmiş ad (TEK eşleşmede) → eşlenemedi + neden. Bulanık eşleşme YOK. **AdvCampaign** Meta reklamlarına `utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.id}}` yazar (Ajan 2, `reklam/` modülünde ayrı küçük iş; kimlik adla değişmez) | Öneri — yönetici onayına |
| Ç-7 | "Tracking gap" tek yüzde | İki sayı hiç tutmaz (görüntüleme sonrası, modellenmiş dönüşüm, pencereler); küçük hacimde %300 fark 1'e 4 | `takipAcigi()` beş etiket, hacim eşiği (10 dönüşüm, 100 tık) altında `veri_yetersiz`; son 2 gün kıyasa girmez (GA4 işleniyor). Eşikler ÖLÇÜLECEK | Mimar (§5) |
| Ç-8 | Yetki | Hesap ataması `connection.manage`, izlemeyi aç/kapat `connection.write` | Bağla/kaldır `connection.manage`, seçenekler/yenile/duraklat `connection.write`, rapor okuma `insights.read` (müşteri hesabı da görür), liste `client.read` (`KAYNAK_UCLARI`) | Mimar (§5) |
| Ç-9 | Paket A: "GA4 key event yok" | Paket A bunu `SAGLIK_DISARIDA`ya koydu (veri depoda yok) | F1'in `kaynak_yapi` işi anahtar etkinlik listesini günde bir saklar; kontrol oradan. Yeni kontroller: `ga4_veri_gelmiyor`, `takip_acigi`, `utm_eksik`, (F2) `search_console_yok`, (F3) `urun_onaysiz`. `meta_kitle_kucuk`, `donusum_islemi_pasif`, `pmax_varlik_eksik` F'ye bağlı DEĞİL (`PAKET_A_DISARIDA_KALAN`) | Öneri — yönetici onayına |
| Ç-10 | GA4 kotası "bizim" kotamız | Mülk kotası (200.000 jeton/gün, 40.000/saat) müşterinin Looker Studio'su ve araçlarıyla PAYLAŞILIYOR | Her istekte `returnPropertyQuota`; kalan < %50 geçmiş çekimi, < %20 günlük çekim durur (`ga4KotaIzni`). Geçmiş 90 gün, 30 günlük parçalar. Kotayı bitirip müşterinin panosunu kırmak, sebebi onun ekranında hiç görünmeyen bir arıza | Öneri — yönetici onayına |
| Ç-11 | Merchant Center için Content API | Content API for Shopping **2026-08-18'de emekliye ayrıldı**, eylülden beri aralıklı 410 | Yalnız **Merchant API**. İzin `content` YAZMA da veriyor (salt okuma izni yok): istemcide yazma ucu olmadığı kaynak taramasıyla kilitlenir | Öneri — yönetici onayına |
| Ç-12 | Yerli altyapılar (ikas, Ticimax, Shopify) birlikte | Ticimax'in kimlik/WSDL/hız sınırı belgede yok; Shopify'da 2026-01-01'den beri panelde özel uygulama açılmıyor, farklı organizasyondaki mağaza için App Store onayı gerekebilir; ikas özel uygulama + client_credentials belgeli | **Sıra müşteri tabanından**: site taraması altyapıyı zaten tanıyor (hazırlık); workspace'lerde kaç ikas/Ticimax/Shopify olduğu sayılır, en çok olandan başlanır. Varsayılan öneri sırası ikas → Shopify → Ticimax (belge olgunluğu). Ticimax için önce mağaza/destekten WSDL ve kimlik belgesi istenir | Öneri — yönetici onayına |
| Ç-13 | Sipariş verisi | Sipariş müşteri adı, e-posta, telefon, adres taşıyor (KVKK) | **Kişisel veri İSTENMEZ ve SAKLANMAZ**: kapalı alan listesi (`SIPARIS_SAKLANAN_ALANLAR`), sorgu bu listeden üretilir, yasak alan taraması Ajan 4'te. Hukuki değerlendirme bu belgenin konusu değil | Öneri — yönetici onayına |
| Ç-14 | "Organik ilk sıradaysa reklamı kapat" önerisi | Yamyamlaşma iddiası ölçülmeden doğru değil (marka aramasında rakip reklamı üste çıkabiliyor) | F2 yalnız yan yana gösterir, ÖNERİ ÜRETMEZ | Mimar (§5) |
| Ç-15 | Ekran yeri | Marka Merkezi iç menüsü, Raporlar tek sayfa, Reklam Yöneticisi | Bağlama: **Marka Merkezi › Bağlantılar** altında "Veri kaynakları" kartları (ayrı sayfa değil). Okuma: **Raporlar** yeni bölüm "Site ve dönüşüm" + **Reklam Yöneticisi** kampanya satırında "Sitede" sütunu (yalnız GA4 bağlıysa). Genel Bakış'a kutu EKLENMEZ, sinyal Paket A'dan gelir | Mimar (§5) |

**Açık sorular, öneriyle (yöneticiye):** (1) Ç-1 ayrı kavram: evet. (2) Ç-5
otomatik bağlama: evet. (3) Ç-6 AdvCampaign utm şablonu: evet, F1 ile aynı
dalgada. (4) Ç-10 kota eşikleri: evet. (5) Ç-12 altyapı sırası ölçümle:
evet. (6) Ç-13 kişisel veri yok: evet.

---

## 1. Resmî kaynaklar (doğrulandı 2026-10-12)

| Konu | Bulgu | Kaynak |
|---|---|---|
| GA4 runReport izni | `analytics.readonly` yeterli | https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport |
| GA4 boyut/metrik | `sessionSourceMedium`, `sessionCampaignName`, `sessionCampaignId`, `sessionGoogleAdsCampaignId`, `sessions`, `totalUsers`, `keyEvents`, `totalRevenue`, `ecommercePurchases`, `itemId`, `itemRevenue` var. **`keyEvents:<olay>` YOK**, olay başına sayım `eventName` + `keyEvents`. `conversions` şemada yok | https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema |
| GA4 kota | Standard: 200.000 jeton/gün, 40.000/saat, proje×mülk 14.000/saat, eşzamanlı 10; gün Pasifik gece yarısı sıfırlanır; `returnPropertyQuota` | https://developers.google.com/analytics/devguides/reporting/data/v1/quotas |
| GA4 satır | Varsayılan 10.000, en çok 250.000, `offset` | (runReport) |
| GA4 kalite | `dataLossFromOtherRow`, `subjectToThresholding`, `samplingMetadatas` | https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/ResponseMetaData |
| SC izin ve düzey | `webmasters.readonly`; `siteOwner/siteFullUser/siteRestrictedUser/siteUnverifiedUser` | https://developers.google.com/webmaster-tools/v1/sites |
| SC sorgu | `rowLimit` ≤ 25.000, `startRow`, `dataState final/all`, `aggregationType`; gün×tür başına en çok 50.000 satır; sorgu satırları toplamı tutmaz | https://developers.google.com/webmaster-tools/v1/searchanalytics/query · https://developers.google.com/webmaster-tools/v1/how-tos/all-your-data |
| SC kota | Site ve kullanıcı başına 1.200/dk, proje 40.000/dk, 30M/gün + "load" kotası | https://developers.google.com/webmaster-tools/limits |
| Content API emekliliği | 2026-08-18 sunset, 2026-09-01'den beri aralıklı 410 | https://developers.google.com/shopping-content/guides/sunset |
| Merchant Reports | `POST merchantapi.googleapis.com/reports/v1/accounts/*/reports:search`, izin `content`, sayfa ≤ 100.000 | https://developers.google.com/merchant/api/reference/rest/reports_v1/accounts.reports/search |
| Merchant GCP kaydı | `developerRegistration:registerGcp` zorunlu | https://developers.google.com/merchant/api/guides/quickstart/direct-api-calls |
| Google ürün raporu | `shopping_performance_view` PMax perakendeyi kapsıyor | https://developers.google.com/google-ads/api/performance-max/reporting |
| Meta `product_id` | Meta içi metriklerle (gösterim, tık, harcama) belgeli; site dönüşümleri kırılım değeri OLMADAN dönebilir | https://developers.facebook.com/docs/marketing-api/insights/breakdowns |
| Meta katalog | `/{catalog_id}/products`: `retailer_id`, `price`, `availability`, `review_status`, `errors` | https://developers.facebook.com/docs/marketing-api/reference/product-catalog/products/ |
| ikas | `POST api.myikas.com/api/v1/admin/graphql`, token `<mağaza>.myikas.com/api/admin/oauth/token` client_credentials | https://ikas.dev/docs/api/getting-started/authentication |
| Ticimax | Servis listesi var; kimlik/WSDL/hız sınırı belgede YOK | https://www.ticimax.com/web-servis-api/ |
| Shopify dağıtım | 2026-01-01'den beri panelde yeni özel uygulama yok; Dev Dashboard; custom dağıtım tek mağaza/aynı organizasyon | https://shopify.dev/docs/apps/launch/distribution |
| Shopify sipariş | `read_orders` son 60 gün, `read_all_orders` onayı; `customerJourneySummary`, `refunds` | https://shopify.dev/docs/api/admin-graphql/latest/objects/Order |
| Shopify kişisel veri | Korunan müşteri verisi seviyeleri | https://shopify.dev/docs/apps/launch/protected-customer-data |

**Bayatlık notu:** Meta belgesi örnekte Graph v26.0 gösteriyor; depo v25.0
kullanıyor. Paket F'yi etkilemiyor ama sürüm takvimi ayrıca kontrol edilmeli.

---

## 2. Ortak çatı (üç paket)

### 2.1 Bağlantı modeli

- **Google kaynakları** (GA4, SC, Merchant): `veri_kaynaklari.connection_id`
  var olan `platform_connections` satırını gösterir (platform `google`).
  Bağlantının seçimi kurulum rehberindeki kuralla AYNI
  (`baglantiSec`: atanmış Google hesabının bağlantısı, yoksa hesap sahibi
  kararı şirket → şirketin bağlantısı, ajans → ajans havuzu). Ajan 2 bu
  fonksiyonu `connections/` altına taşır, iki modül aynısını çağırır.
- **Meta katalog**: aynı desen, platform `meta`.
- **Mağaza**: bağlantı yok; `kimlik_enc` (CryptoService, `hedef_enc` deseni),
  `kimlik_ipucu` son 4 karakter. Liste sorgusu `kimlik_enc` SEÇMEZ (`select`
  sabiti `satisfies Prisma.VeriKaynagiSelect`, tip ondan türetilir).
- Bağlantı koparsa (token iptal) kaynak `izin_eksik`/`erisim_yok` olur ve
  ekranda platformun cümlesiyle yazar; veri silinmez.

### 2.2 `veri_kaynaklari`

| Kolon | Tip | Not |
|---|---|---|
| id | uuid PK | |
| org_id, client_id | uuid NOT NULL | org_id HEDEF müşteriden (`musteriOrgId`), `ctx`ten değil; `(client_id, org_id)` kompozit FK |
| tur | varchar(30) | CHECK = `KAYNAK_TURLERI` (enum değil: değer eklemek ayrı migration istemesin; CHECK ile shared listesi Ajan 4 testinde karşılaştırılır) |
| dis_kimlik | varchar(300) | `disKimlikDenetle` çıktısı; UNIQUE `(org_id, tur, dis_kimlik)` |
| ad | varchar(200) | mülk/mağaza adı |
| connection_id | uuid NULL | FK `platform_connections` ON DELETE SET NULL |
| kimlik_enc | bytea NULL | yalnız mağaza |
| kimlik_ipucu | varchar(20) NULL | |
| saat_dilimi, para_birimi | varchar / char(3) NULL | `kaynak_yapi` doldurur (GA4 mülk ayarı); SC için sabit `America/Los_Angeles` (ÖLÇÜLECEK) |
| durum | varchar | CHECK `KAYNAK_DURUMLARI` |
| son_hata | text NULL | platformun cümlesi aynen |
| yapi | jsonb | `kaynak_yapi` çıktısı (GA4: anahtar etkinlik listesi; SC: izin düzeyi) + `yapi_zamani` |
| son_basarili_cekim | timestamptz NULL | |
| created_by | uuid | |
| created_at, updated_at | timestamptz | |

İndeks: `(client_id, durum)`. Üç durak + taşıma kararı her tablo için
`tablolar.ts#KAYNAK_TABLOLARI`da (testte kilitli).

### 2.3 Kuyruk

- `SyncJobType`a dört değer (**AYRI migration**): `kaynak_yapi`,
  `kaynak_gunluk`, `kaynak_gecmis`, `urun_performansi`. `sync_jobs`a
  `veri_kaynagi_id uuid NULL` (FK SET NULL). Kaynak işinde `client_id` DOLU,
  `ad_account_id` NULL. `assertAssigned()` karşılığı: `client_id`si olmayan
  kaynak satırı olamaz (NOT NULL).
- Kuyruk kimliği `kaynak_gunluk__<kaynakId>__<from>` (ayırıcı `__`).
- **Zincir:** bağlantıda `kaynak_yapi`; yapı BAŞARIYLA bitince işin SONUNDA
  `kaynak_gecmis` (yalnız hiç veri yoksa, `yapi-sonrasi-gecmis` dersi) ya da
  `kaynak_gunluk`. Öncelik bariyer değil.
- **Ön koşul ÇAĞRIDAN ÖNCE:** `kaynak_gunluk` yapının son 36 saatte
  başarıyla koşmadığını görürse platforma gitmeden `rows=0` + not "yapı
  taraması henüz koşmadı" ile biter ve TEKRAR DENENMEZ (yapı bitince
  zincir yeniden kuyruğa alır). `succeeded + rows=0` notsuz kalmaz.
- **Tarih:** `datesForJob`a `kaynak_gunluk` dalı, kaynağın saat diliminde
  `kaynakGunlukPencere`; geçmiş `kaynakGecmisParcalari` (yeniden eskiye,
  her parça hemen yazılır). `sweep-dates.spec.ts` yeni türleri görmeli.
- **Kota bekçisi:** `QuotaGuardService` anahtarı `(platform, adAccountId)`;
  kaynak için yeni anahtar `kaynak:<tur>:<dis_kimlik>` ve iki katman
  (`kaynak_gunluk` sınır %80 kullanım, `kaynak_gecmis` %50). GA4'te
  platformun bildirdiği kalan jeton `ga4KotaIzni` ile değerlendirilir.
- **Takılan iş / vazgeçti:** `sync_jobs` yeniden kullanıldığı için
  `kuyruk_vazgecti` ve takılmış iş kontrolleri kendiliğinden geçerli; teşhis
  ekranı iş TÜRÜ başına satır gösterir.

### 2.4 Dış istek güvenliği

- Google/Meta uçları sabit ana makine; `platformFetch` (var olan).
- Shopify/ikas: alan adı `endsWith` (`disKimlikDenetle`, testte kilitli).
- **Ticimax mağazanın kendi alan adında**: DNS çözülür, `ozelAdres` ile iç
  ağ reddedilir (`169.254.169.254` dahil), `redirect: 'manual'`, zaman aşımı
  15 sn, yanıt gövdesi akış hâlinde en çok 20 MB. Kalan risk DNS rebinding
  (logo indirme ile aynı kabul edilen kalıntı).
- Mağaza kimliği yanıtta, logda, `sync_jobs.note`ta ASLA yok.

---

## 3. F1 · GA4 okuma (Dalga 1, tam sözleşme)

### 3.1 Veri modeli

**`ga4_gunluk`** (trafik raporu, `GA4_RAPORLARI.trafik`)

| Kolon | Tip | Not |
|---|---|---|
| veri_kaynagi_id, client_id, org_id | uuid | |
| gun | date | `ga4Tarih` |
| satir_hash | char(64) | SHA-256(kaynak/ortam ‖ kampanya adı ‖ kampanya kimliği ‖ Ads kampanya kimliği); PK'da metin yerine (btree sınırı, `search_term_insights` dersi) |
| kaynak_ortam | varchar(300) | |
| kampanya_adi, kampanya_kimligi, ads_kampanya_kimligi | varchar(300) NULL | ham değer; "(not set)" olduğu gibi |
| oturum, etkilesimli_oturum, kullanici, anahtar_etkinlik, satin_alma | int / numeric | `kullanici` TOPLANAMAZ |
| gelir_mikro | bigint | mülk para biriminde |
| para_birimi | char(3) | |
| cekildi | timestamptz | |

PK `(gun, veri_kaynagi_id, satir_hash)`; indeks `(client_id, gun DESC)`.

**`ga4_anahtar_etkinlik_gunluk`**: aynı anahtar + `etkinlik varchar(100)`,
yalnız `anahtar_etkinlik numeric`. PK `(gun, veri_kaynagi_id, satir_hash,
etkinlik)`. `ga4_gunluk` ile JOIN edilip TOPLANMAZ (satır çoğaltır, testte
rapor tanımı kilitli).

Günlük çekim penceresindeki günler önce SİLİNİP yeniden yazılır (aynı
transaction): GA4'te bir kampanya satırı ertesi gün "(other)" kovasına
geçebiliyor ve upsert eski satırı yetim bırakırdı (çift sayım).

### 3.2 İş içi (Ajan 2)

1. `kaynak_yapi`: Admin API `keyEvents` listesi (`Ga4Istemcisi.anahtarEtkinlikler`,
   var olan) + mülk ayarı (`timeZone`, `currencyCode`) → `veri_kaynaklari.yapi`.
2. `kaynak_gunluk`: iki `runReport` (`trafik`, `anahtarEtkinlik`),
   `returnPropertyQuota: true`, `limit` 100.000, `offset` ile sayfalı (sonda
   `rowCount` ile kıyas; eksikse not). Metrik filtresi: anahtar etkinlik
   raporunda `keyEvents > 0`.
3. Kalite bayrakları (`ga4Kalite`) ve atılan satırlar `sync_jobs.note`a.
4. Platform çağrısı transaction DIŞINDA; yazma kısa transaction.

### 3.3 Okuma

- `GET /veri-kaynaklari/ga4/trafik`: dönem, kaynak/ortam ve kampanya başına
  oturum + anahtar etkinlik + gelir; her satırda `kampanyaEsle` sonucu.
- `GET /veri-kaynaklari/takip-acigi`: platform tarafı `insights_daily`
  (kampanya seviyesi, dönüşüm + tık), site tarafı anahtar etkinlik raporu
  (yalnız kullanıcının "dönüşüm sayılır" dediği etkinlikler; varsayılan:
  bütün anahtar etkinlikler), `takipAcigi`, `eslenemeyenPay`.
  `TakipAcigiYaniti.emptyReason` dört hâli ayırır (`kaynak_yok`,
  `izin_eksik`, `cekim_kosmadi`, `veri_yok`). Uyarılar: saat dilimi farkı
  ("günlük kıyas kayabilir, dönem toplamı geçerli"), para birimi farkı
  (gelir/ROAS kıyası YAPILMAZ, kur tahmini yok).
- Sorgular `client_id = ANY($1::uuid[])` dizisiyle; ölçmeden alt sorgu yok.

### 3.4 Ekran (Ajan 3, taslak `taslak.html`)

- **Marka Merkezi › Bağlantılar › Veri kaynakları**: kaynak kartları
  (GA4, Search Console, Merchant Center, Meta katalog, mağaza). Her kart:
  durum, son çekim, eksik izin varsa "İzni ver" (var olan reauthorize
  akışı), mülk seçici (bırakınca doğrulama), "Kurulumdaki mülk farklı"
  uyarısı. Yapılmamış dalga kartı gri ve "Yakında" değil, NEDENİ yazar.
- **Raporlar › Site ve dönüşüm** bölümü: kampanya tablosu (platform
  dönüşümü, site dönüşümü, etiket), eşlenemeyen pay satırı, kalite
  bayrakları.
- **Reklam Yöneticisi**: kampanya satırında "Sitede" sütunu (anahtar
  etkinlik + etiket rozeti); GA4 bağlı değilse sütun yok.

### 3.5 Rapor PDF (`rapor-pdf.service.ts`)

**`PLATFORM_SIRASI` TUZAĞI:** GA4 bir platform değil, o döngü onu GEZMEZ.
Bölüm, rapor şablonunun BÖLÜM listesine (`rapor-bolumleri`) yeni kod olarak
girer ve PDF bölüm döngüsünde çizilir. Ajan 4 testi: bölüm kodu panel
şablon listesinde VE PDF çizicisinde (kaynak taraması + bölümü içeren
fixture ile `metinler()` üzerinden "Site ve dönüşüm" başlığının belgede
olduğu). Tablo `tablo()` çiziciden (üç tablo dersi), sütunlar tek listeden
(`rapor-sutunlari` deseni), toplanamayan "kullanıcı" sütunu YOK.

### 3.6 Ölçüm listesi (Ajan 5, canlıda)

1. Analytics Data API'nin Google Cloud'da açık olduğu (ilk çağrı 403 mü).
2. `date` boyutunun `YYYYMMDD` döndüğü; `sessionGoogleAdsCampaignId`nin
   Ege Birlik'te dolu geldiği (Ads ↔ GA4 bağlı).
3. Jeton maliyeti: bir günlük iki rapor kaç jeton (`propertyQuota`); 90
   günlük geçmişin toplamı. Eşikler buna göre `GA4_KOTA`ya yazılır.
4. GA4'ün dünü kaç saatte kesinleştirdiği (`gunlukGeri: 3` doğru mu).
5. Eşleme payı: Ege Birlik'te ücretli anahtar etkinliklerin yüzde kaçı
   eşlendi; Meta'da utm şablonu öncesi/sonrası.
6. Takip açığı eşikleri: 14 gün sessiz koşum, etiket dağılımı; yanlış alarm
   ≤ %30 hedefi (Paket A ile aynı ölçüt).
7. Eşikleme (`subjectToThresholding`) ve "(other)" görülüyor mu.

### 3.7 Ajan görevleri (F1)

**Ajan 2 · Arka Plan** (`apps/api/src/modules/veri-kaynagi/` + migration'lar)
- [ ] `git pull` → Migration 1: `veri_kaynaklari`, `ga4_gunluk`,
  `ga4_anahtar_etkinlik_gunluk`, `sync_jobs.veri_kaynagi_id`; CHECK'ler
  shared listelerinden. Migration 2 (AYRI): `SyncJobType` dört değer.
- [ ] Üç durak: `pglite-harness` TRUNCATE, `02_rls.sql` (SELECT/INSERT/
  UPDATE workspace kapsamı; DELETE yok, kaldırma durum değişikliği),
  `WORKSPACE_TABLOLARI` (taşınır). `HESABIN_KENDI_VERISI`ne GİRMEZ.
- [ ] `baglantiSec`i `kurulum.service`ten `connections/` altına taşı, iki
  modül ondan çağırsın (davranış değişmez, kurulum testleri yeşil kalır).
- [ ] `Ga4Istemcisi`ne `runReport` (sayfalı, `returnPropertyQuota`) ve
  mülk ayarı okuma; `kurulum/ga4.ts`ten `connections/providers/` altına ya
  da ortak yere taşı (ikinci GA4 istemcisi YAZILMAZ).
- [ ] `kaynak_yapi`, `kaynak_gunluk`, `kaynak_gecmis` işleyicileri (§2.3,
  §3.2), `datesForJob` dalı, `KAYNAK_SUPURMELERI`, zincir, ön koşul.
- [ ] Kota bekçisine kaynak anahtarı ve iki katman; `ga4KotaIzni`.
- [ ] Controller `KAYNAK_UCLARI` ile birebir (F1 satırları); bağlama
  `kaynakBaglaSchema` + `disKimlikDenetle`; aynı mülk başka workspace'te ise
  409 + workspace adı.
- [ ] Kurulum rehberi `ga4_mulk` adımı tamamlanınca kaynak otomatik bağlanır (Ç-5).
- [ ] AdvCampaign Meta reklamlarında `url_tags` utm şablonu (Ç-6), geri okumada kıyas.
- [ ] Nest kaydı (`queue.module`, yeni modül) + kaynak taramasıyla kilit.

**Ajan 3 · Ön Yüz**
- [ ] Bağlantılar bölümüne "Veri kaynakları" kart grubu (`marka-merkezi/
  bolumler.ts` içinde, yeni bölüm DEĞİL), mülk seçici, izin düğmesi.
- [ ] Raporlar "Site ve dönüşüm" bölümü; Reklam Yöneticisi "Sitede" sütunu.
- [ ] Dört hâl ayrı (yükleniyor, hata + platformun cümlesi, boş + neden,
  dolu); `.catch(() => setX([]))` yok. Karar mantığı saf fonksiyonda.
- [ ] Bağlantılar `lib/baglanti.ts` üreticisinden; `nav-sections`,
  `panel-tasarim` yeşil.

**Ajan 4 · Test & Güvenlik (kapı)**
- [ ] RLS `SET ROLE` + `RETURNING`: üç tabloda başka workspace satırı
  okunamıyor/güncellenemiyor, sayılarak.
- [ ] CHECK listeleri = shared listeleri (iki yönlü); `KAYNAK_TABLOLARI` =
  TRUNCATE/RLS/`WORKSPACE_TABLOLARI` kayıtları.
- [ ] `kimlik_enc` hiçbir yanıtta ve liste `select`inde yok.
- [ ] Mutasyon: ön koşul kontrolünü sil → çağrı sayısı testi düşmeli;
  zinciri sil → düşmeli; pencere sil-yeniden-yaz yerine upsert → "(other)"a
  geçen satır testi düşmeli; kota katmanı sil → geçmiş testi düşmeli.
- [ ] `PLATFORMS` ile kaynak türleri kesişimi boş (Ajan 1 yaptı); PDF bölüm
  testi (§3.5).
- [ ] `Prisma.sql` yorum/backtick ve `::int` taramaları yeni dosyalarda yeşil.

**Ajan 5 · Canlıya alma:** Google Cloud'da Data API açık mı (kullanıcı),
migration sırası (tablo → enum), §3.6 ölçümleri, `DEVAM.md`.

**Ajan 6 · Tasarım denetimi:** Bağlantılar kartları ve rapor bölümü,
masaüstü + telefon, taslakla yan yana.

---

## 4. F2 · Search Console (Dalga 2, iskelet)

- **İzin:** `webmasters.readonly` `optionalScopes`a eklenir; onay ekranına
  eklenmesi ve Search Console API'nin açılması kullanıcıda (BAGLANTI.md'ye
  satır). Bağlanan Google kimliği mülkte en az kısıtlı kullanıcı
  (`SC_OKUYABILEN`); `siteUnverifiedUser` "bu hesabın mülke erişimi yok".
- **Mülk seçimi:** `sites.list`; site adresi workspace'in `website`
  alanıyla eşleşen mülk önden seçili gelir (alan adı mülkü tercih).
- **Tablolar:** `sc_gunluk` (boyutsuz toplam), `sc_sorgu_gunluk` (gün ×
  sorgu hash + metin). Konum `konum × gösterim` olarak saklanır
  (`agirlikliKonum`). Sayfa boyutu v1'de YOK (load kotası ve satır sayısı).
- **Çekim:** `dataState: final`, pencere 5 gün geriden 2 gün geriye;
  `rowLimit` 25.000 + `startRow`; gün başı 50.000 sınırı aşılırsa not.
- **Örtüşme:** `aramaOrtusmesi` (organik sorgu × `search_term_insights`),
  ekran Raporlar'da "Arama: organik ve reklam" bölümü + Reklam Yöneticisi
  arama terimleri ekranında "Organik sıra" sütunu. Öneri üretmez (Ç-14).
- **Saat dilimi:** SC tarihlerinin Pasifik olduğu ÖLÇÜLECEK; ekran "Search
  Console günleri Pasifik saatine göre" der.
- **Sağlık:** `search_console_yok` (arama kampanyası harcıyorsa).
- **Ajan 2-6:** F1 listesinin aynısı, tablolar ve iş türü `search_console`
  dalı; Ajan 5 ölçümü: izin düzeyleri, Pasifik gün sınırı, anonim sorgu payı
  (toplam − sorgu toplamı).

## 5. F3 · E-ticaret ve ürün performansı (Dalga 3, iskelet)

- **3a ürün reklamı (platform işi):** `urun_performansi` iş türü,
  `urun_performansi_gunluk` (`ad_account_id` taşır, hesapla TAŞINIR).
  Google: `shopping_performance_view` (`segments.product_item_id`,
  `segments.product_title`, `metrics.cost_micros/clicks/conversions/
  conversions_value`; ALAN ADLARI Query Validator ile ölçülecek). Meta:
  `product_id` kırılımı, önce yalnız harcama/gösterim/tık; satın alma
  değerinin ürün başına gelip gelmediği ölçülecek, gelmiyorsa ekran
  "Meta ürün başına gelir vermiyor" der. `PLATFORMUN_YAPAMADIGI_ISLER.linkedin`e
  eklenir. Kırılım ayrı tablo: `insights_daily`ye yazılmaz (katlanma).
- **3b ürün listesi:** Merchant API `products` + `reports:search`
  (`product_view` onay durumu), `registerGcp` bir kez; Meta
  `/{catalog_id}/products` (`review_status`, `errors`). Tablo `urun_katalogu`.
- **3c mağaza:** `magaza_siparisleri` + `magaza_siparis_kalemleri`, kişisel
  veri yok (Ç-13), iade/iptal için 14 gün geri pencere, Shopify 60 gün
  sınırı. Durum eşlemesi altyapı başına tablo; bilinmeyen durum gelire
  girmez ve sayılır.
- **Ürün anahtarı:** `googleUrunKimligi` (önekli biçim çözülür), Meta
  `retailer_id`, mağaza SKU. Eşlenemeyen harcama payı ekranda.
- **Görünüm:** Raporlar "Ürünler" bölümü + Reklam Yöneticisi'nde ürün
  sekmesi (yalnız ürün verisi varsa): ürün, harcama, platform değeri,
  mağaza net geliri, gelir/harcama, etiket (`urunEtiketi`). "Kâr değil,
  gelir/harcama" açıkça yazar (marj bilinmiyor).
- **Ölçüm (Ajan 5):** `shopping_performance_view` alanları ve ürün kimliği
  biçimi; Meta `product_id` + `actions`; Merchant izin ve kayıt; altyapı
  dağılımı (Ç-12); ikas hız sınırı; Shopify dağıtım türü.

---

## 6. Neyi ÖLÇMEDİM (Ajan 1)

- Hiçbir API'ye canlı istek atmadım; bütün sayılar (`TAKIP_ACIGI`,
  `GA4_KOTA`, pencereler) başlangıç.
- GA4 `date` boyutunun adı/biçimi şema sayfasında açıkça okunamadı.
- GA4'ün işlenme gecikmesi (24-48 saat) resmî sayfada bulunamadı.
- Search Console tarihlerinin Pasifik saatinde olduğu, 16 ay saklama,
  `sc-domain:` biçiminin `sites.list`te nasıl döndüğü.
- `shopping_performance_view` alan adları (belge kırpıldı), Merchant
  `product_view` alanları ve kotası.
- Meta katalog okuma izninin adı; `product_id` ile `actions` birlikteliği.
- ikas hız sınırı ve App Store şartı; Ticimax'in kimlik, WSDL ve hız sınırı.
- OAuth izinlerinin hassasiyet sınıfı (Google Cloud konsolunda görülecek).
- Workspace'lerdeki e-ticaret altyapısı dağılımı.
