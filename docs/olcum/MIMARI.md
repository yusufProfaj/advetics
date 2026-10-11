# Ölçüm Kurulumu — mimari (Ajan 1)

**Tarih:** 2026-10-11 · **Taslak:** [`taslak.html`](taslak.html) (kullanıcı onayladı:
*"beğendim koda geç"*) · **Yer:** Base › Marka Merkezi › **Ölçüm** (`?bolum=olcum`)

Amaç: reklamların neyi saydığını (site formu, satın alma, arama, mesaj)
platform başına GERÇEK durumuyla göstermek ve eksik olanı en temiz yoldan
kurdurmak. AdvCampaign'in "Google Ads'te satın alma dönüşümü etkin değil"
engeli kullanıcıyı Google Ads'e yolluyordu; bu ekran o engelin çözüldüğü yer.

## Çelişki tablosu (taslak ↔ depo ↔ platform)

| # | Taslakta | Gerçek (ölçüldü 2026-10-11) | Karar |
|---|---|---|---|
| Ç-1 | Tag Manager'a etiket ekle + yayınla | Google bağlantımızın tek izni `adwords`. Tag Manager (`tagmanager.edit.containers`, `tagmanager.publish`) ve Analytics (`analytics.edit`) izinleri Google Cloud'daki OAuth onay ekranına eklenmeli; hassas izin → uygulama doğrulaması (haftalar). Bu Google Cloud projesinin sahibinin işi, koddan yapılamaz | **Faz 1 izinsiz çalışan her şey**; Tag Manager ile otomatik etiket **Faz 2**, izinler eklenince. Ekranda "Tag Manager'a otomatik ekleme için izin gerekiyor" açıkça yazar, düğme sahte çalışmaz |
| Ç-2 | Analytics'i bağla | Ege Birlik'te Analytics ZATEN Google Ads'e bağlı ve olaylar içe aktarılmış (`GOOGLE_ANALYTICS_4_*` türleri). Bağlılık Google Ads API'sinden okunabiliyor: içe aktarılmış işlem varsa bağlıdır | Faz 1: içe aktarılmış işlemlerden "Analytics bağlı" çıkarılır; bağlama Faz 2 |
| Ç-3 | Teşekkür sayfası / olay adı taramadan bulunur | `gtm.js` olay adlarını DEĞİŞKENLE taşıyor (`"vtp_eventName":["macro",1]`); sayfa adresinden tetikleyici tahmini sessiz hata üretir | Taramada YALNIZ kimlikler (GTM, G-, AW-, Meta pikseli) ve altyapı imzası. Tetikleyici seçimi Faz 2'de kullanıcıya |
| Ç-4 | "Platform sayıyor": Google'da arama | Google aramayı ancak `PHONE_CALL_LEAD` kategorili bir işlem varsa dönüşüm sayıyor | Google arama hücresi veriden (işlem varsa durumu, yoksa "tanım yok") |
| Ç-5 | Örnek: Google formu görmüyor | Ege Birlik'te `generate_lead` BİRİNCİL ve son 30 günde 4 sayım; `click_to_call` 69; `purchase` GİZLİ (HIDDEN), 0 | Taslak örnekti; hücreler veriden |

## Ölçülen platform gerçekleri (bu modülün dayanağı)

- **`conversion_action` + `metrics.all_conversions` seçilebiliyor,
  `metrics.conversions` SEÇİLEMİYOR** (`PROHIBITED_METRIC_IN_SELECT_OR_WHERE_CLAUSE`).
  Sayım `all_conversions` (birincil olmayanları da sayar; birincil ayrıca
  `primary_for_goal`). Metrik sorgusu `segments.date DURING LAST_30_DAYS` ile
  AYRI sorgu: sayımı olmayan işlem o sorguda satır döndürebilir ya da
  döndürmeyebilir, liste ayrı sorgudan.
- `customer.conversion_tracking_setting.conversion_tracking_id` = `AW-` kimliği
  (Ege Birlik: 18409398361).
- Durumlar: `ENABLED`, `HIDDEN` (Analytics'ten gelip içe aktarılmamış),
  `REMOVED`. HIDDEN "tanım var ama kullanılmıyor".
- Site: `sayfaHtmlGetir` (iç ağ korumalı, 512 KB) ana sayfayı okuyor (Ege Birlik
  289 KB). `https://www.googletagmanager.com/gtm.js?id=GTM-…` HERKESE AÇIK
  (375 KB) ve içindeki etiketler kimlik taşıyor: `G-YWXPLS3GT2` ve Meta pikseli
  `fbq("init","1781886293257274")` (özel HTML etiketi).
- Meta `/{piksel}/stats?aggregation=event&start_time=` saatlik kovalar,
  `data[].data[] = {value, count}`; olay adları `PageView`, `Lead`, eklenti
  adları da gelebiliyor ("Click to Chat by HoliThemes").

## Satırlar (ölçüm türleri)

| Tür | Meta hücresi | Google hücresi | Kullanan amaçlar |
|---|---|---|---|
| `site_formu` | Pikselde `Lead`/`CompleteRegistration`/`Contact`/`SubmitApplication` (7 gün) | Kategori `SUBMIT_LEAD_FORM`, `REQUEST_QUOTE`, `BOOK_APPOINTMENT`, `SIGNUP` | SITE |
| `satin_alma` | Pikselde `Purchase` (7 gün) | Kategori `PURCHASE` | SATIS |
| `arama` | Meta arama reklamı kendi sayıyor (`platform_sayiyor`) | Kategori `PHONE_CALL_LEAD` | TELEFON |
| `mesaj_ve_form` | Reklam içi form ve WhatsApp: Meta sayıyor | Google'da yok (`platformda_yok`) | FORM, WHATSAPP |

Hücre durumu (her zaman bir `neden` cümlesiyle):
`kaydediliyor` · `ikincil` (sayıyor ama birincil değil: teklif kullanmıyor) ·
`sinyal_yok` (tanım var, dönemde 0) · `tanim_yok` · `platform_sayiyor` ·
`platformda_yok` · `hesap_yok` (bu workspace'e hesap atanmamış) ·
`bilinmiyor` (okunamadı; platformun mesajı `ayrinti`de).

Google'da bir türün birden çok işlemi varsa hücre EN İYİSİNİ gösterir
(birincil+sayım > birincil > ikincil+sayım > diğer) ve kaç işlem olduğunu söyler.
Sessiz kesme yok: işlem listesinin tamamı `googleIslemleri` alanında.

## Öneri (tek, en uygun)

Saf fonksiyon `enUygunOneri` — sıra (ilk tutan kazanır):

1. `HESAP_ATA` — workspace'e Meta ya da Google hesabı atanmamış.
2. `BIRINCIL_YAP` — bir türde birincil işlem yok ama sayım alan ikincil işlem
   var (Google teklifi o sayımı kullanmıyor). **Faz 1'de tek tıkla**: Google
   Ads API `conversionActions:mutate`, `updateMask: primary_for_goal`.
3. `SITE_ADRESI` — `clients.website` boş ya da okunamadı (tarama yapılamaz).
4. `GOOGLE_KURULUM` — site formu / satış Google'da `tanim_yok`/`sinyal_yok`:
   adımlar (Google Ads'te işlem, Tag Manager'da etiket, yayın); Faz 1'de
   otomatik değil, Tag Manager izni gerektiği SÖYLENİR. Satış önerisi YALNIZ
   sitede satış imzası (altyapı ya da Meta `Purchase`) varsa: emlak sitesine
   "satış kur" denmez.
5. `META_OLAY` — site formu Meta'da yok ama Google'da var: pikselde `Lead`
   olayı yok.
6. `HEPSI_HAZIR`.

## Uçlar

| Uç | Yetki | Not |
|---|---|---|
| `GET /olcum?clientId=&yenile=0\|1` | `client.read` | Tarama + Google + Meta, paralel; her parça kendi hatasıyla (`okumaHatalari`). Önbellek workspace başına 10 dk, `yenile=1` atlar. Google isteği kota bekçisinden geçer |
| `POST /olcum/birincil-yap` `{clientId, donusumId}` | `client.write` | Yalnız bu workspace'e ATANMIŞ Google hesabında, yalnız `ENABLED` ve sayım alan işlem; geri okuma: `primary_for_goal` true dönmeli. `audit_logs`a yazılır. Önbellek düşer |

Tablo yok (migration yok): durum her seferinde platformdan okunuyor; Faz 2'de
Tag Manager yazması gelince yayın kaydı için tablo gerekecek.

## Ölçülmeyen / açık

- `BIRINCIL_YAP` yazmasının canlı doğrulaması (Ajan 5): ilk kullanımda gözle.
- Meta pikseli GTM dışında başka bir yükleyiciyle (ör. eklenti) yükleniyorsa
  taramada görünmez; tablo pikseli zaten reklam hesabından okuyor, tarama yalnız
  "sitede görüldü" bilgisi.
- Faz 2: Tag Manager/Analytics izinleri (Ç-1).
