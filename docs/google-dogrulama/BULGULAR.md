# Google OAuth doğrulaması — ret (2026-10-17) ve bulgular

Cloud projesi `355436290681` · Project ID `advetics-504618`. Ret mailindeki
üç madde: (1) ana sayfa "yanıt vermiyor", (2) gizlilik politikası "yanıt
vermiyor", (3) demo videosu her scope'un gerekçesini ve Google tarafındaki
sonucunu göstermiyor.

Bu klasör: `BULGULAR.md` (bu dosya: ölçüm, sebep, düzeltme, scope tablosu),
[`CEKIM-SENARYOSU.md`](CEKIM-SENARYOSU.md) (video),
[`YANIT-MAILI.md`](YANIT-MAILI.md) (Google'a İngilizce yanıt),
[`GIZLILIK-ONERISI.md`](GIZLILIK-ONERISI.md) (yasal metin önerisi,
**onay bekliyor**).

## 1. Ölçüm (2026-10-19 sabah, dışarıdan, curl)

| Adres | Googlebot | Chrome | Google-Site-Verification | UA yok |
|---|---|---|---|---|
| `https://advetics.com/` | 200, 0,46 sn | 200 | 200 | 200 |
| `https://advetics.com/gizlilik` | 200, 0,29 sn | 200 | 200 | 200 |
| `https://advetics.com/en/privacy` | 200 | 200 | 200 | 200 |
| `http://advetics.com/` | 301 → https | aynı | aynı | aynı |
| `https://www.advetics.com/` | **307 → `/r/bulunamadi`** | aynı | aynı | aynı |

- TLS geçerli (`ssl_verify_result=0`), HTTP/2, IPv6 kaydı (AAAA) yok,
  `www` CNAME → kök. Yanıt süresi 0,2–0,6 sn.
- `robots.txt` 200, `Allow: /`, `/gizlilik` açıkça izinli; yalnız
  `/dashboard`, `/ayarlar/`, `/api/` kapalı. Sebep değil.
- Sunucu HTML'i iki adreste de tam içerik taşıyor (başlık, metin, ana
  sayfada gizlilik bağlantısı). Dil ekranı sunucu HTML'inde yok.
- Çerezli istekler (Accept-Language: en): `adv_dil=en` ile `/` → tek 307
  → `/en` 200; `/gizlilik` → tek 307 → `/en/privacy` 200. Döngü yok.
- PageSpeed Insights (Google altyapısından deneme): anahtarsız API günlük
  kotası dolu, web arayüzü sonuç vermedi. **Google'ın kendi ağından
  ölçülemedi.**

## 2. Sebep

**Bugün iki adres de yanıt veriyor; ret, 17 Ekim'de kapanan `/en`
yönlendirme döngüsü sırasında yapılan incelemeye denk geliyor.** Kanıt
zinciri:

1. D1'den (iki dilli site) 17 Ekim deploy'una kadar (`ab25ec20`) canlıda
   `adv_dil=en` çerezi olan her istek `ERR_TOO_MANY_REDIRECTS` veriyordu
   (Next'in vekil isteği middleware'den ikinci kez geçiyordu,
   `docs/kurallar/panel-derleme.md`).
2. İlk ziyarette ekranı kaplayan dil sorusu ön seçimi tarayıcının dilinden
   yapıyor. İngilizce tarayıcıyla gelen bir inceleyici "English / Continue"
   dediği anda çerez `en` oluyor ve sayfa döngüye giriyordu: hem `/` hem
   `/gizlilik` (o da `/en/privacy`e yönleniyordu). İki adresin birlikte
   "yanıt vermiyor" olması bununla tutarlı.
3. Demo kaydı 15 Ekim, ret maili 17 Ekim: inceleme döngü canlıdayken
   yapıldı.

**Kesin değil:** inceleyicinin ne gördüğü ölçülmedi. Sunucuda
`advetics` kullanıcısıyla nginx erişim kaydında 15–17 Ekim arası Google
isteklerine bakmak (`grep -i google` + durum kodu) bunu kapatır; root
gerektiriyorsa yapılmaz, bildirilir.

Ek iki zayıflık (ret sebebi olabilir, ölçülmedi):

- **`www.advetics.com` kırıktı:** white-label kararı `www`yu müşteri alan
  adı sayıp "rapor bulunamadı"ya atıyordu. Google ya da biri adresi `www`
  ile yazarsa ana sayfa hiç görünmüyordu.
- **Dil ekranı JS çizen botların görüntüsünü kaplıyor:** Googlebot ve
  Google'ın başsız Chrome/Lighthouse araçları sayfayı çizip görüntüsünü
  alıyor; çizilen sayfanın tamamı "Dilinizi seçin".

## 3. Düzeltme (bu dal, PUSH/DEPLOY YOK)

- `middleware.ts`: `www.advetics.com/*` → `https://advetics.com/*` 308
  (sorgu korunuyor). Başka bir `www.` müşteri alan adı olarak kalıyor.
  Test + mutasyon: `middleware.spec.ts`.
- `dil/otomatik-ziyaretci.ts` + `dil/sunucu.ts`: bot user agent'ında
  (Googlebot, Google-Site-Verification, Google-InspectionTool, AdsBot,
  Lighthouse, HeadlessChrome, facebookexternalhit…) dil ekranı çizilmiyor.
  İçerik aynı, dil Türkçe, çerez yazılmıyor. Test + mutasyon:
  `otomatik-ziyaretci.spec.ts`.

## 4. Başvuruda verilecek adresler (öneri)

| Alan | Adres | Neden |
|---|---|---|
| Application home page | `https://advetics.com/en` | İngilizce, dil sorusu çıkmıyor (adres dili zaten söylüyor), alt bilgide `/en/privacy` ve `/en/terms` bağlantısı var |
| Privacy policy | `https://advetics.com/en/privacy` | İngilizce, sorusuz, yönlendirmesiz 200 |
| Terms of service | `https://advetics.com/en/terms` | aynı |
| Authorized domain | `advetics.com` | değişmedi |

Türkçe adresler (`/`, `/gizlilik`) çalışmaya devam ediyor; ikisi de
`Link: hreflang` ile İngilizce karşılığını bildiriyor. Google'ın
inceleyicisi İngilizce okuyor, Türkçe sayfa yerine İngilizceyi vermek
"politika uygulamayı anlatmıyor" türü ikinci bir ret riskini de azaltıyor.

## 5. Scope tablosu (koddan, 2026-10-19)

Tek OAuth istemcisi, tek yetki adresi üreticisi:
`apps/api/src/modules/connections/providers/google.provider.ts:226-242`
(`access_type=offline`, `include_granted_scopes=true`, `prompt=consent`).
İki akış:

- **A — Bağlan** (`/ayarlar/baglantilar`, `/kurulum` platform adımı):
  yalnız `adwords`.
- **B — Ölçüm izinlerini ver** (`/marka-merkezi`, kurulum bölümü ve veri
  kaynakları; `reauthorize?kapsam=olcum`): `adwords` + beş ölçüm scope'u
  (`GOOGLE_OLCUM_SCOPES`, `google.provider.ts:170-176`).

`openid`, `userinfo.*`, `youtube.*` İSTENMİYOR. YouTube Data API API
anahtarıyla, salt okuma (`autoboost/youtube-api.service.ts`); video
yüklenmiyor. Tanımlı ama hiçbir akışta istenmeyen: `webmasters.readonly`,
`content` (Merchant), `datamanager` (yalnız sabit). **Cloud Console'daki
"Data access" listesinde bunlar ya da başka bir scope kayıtlıysa
silinmeli:** istenmeyen scope'u başvuruda tutmak gerekçesiz scope demek.

| Scope | Özellik (ekran) | Çağrılan uç | Okuma / yazma | Google'da görünen sonuç | Daha dar scope? |
|---|---|---|---|---|---|
| `auth/adwords` | Bağlantıda hesap listesi; Genel Bakış, Reklam Yöneticisi, Raporlar senkronu; anahtar kelime ve konum arama | `customers:listAccessibleCustomers`, `googleAds:search`, `:generateKeywordIdeas`, `geoTargetConstants:suggest` | Okuma | — | **Yok.** Google Ads API'nin tek scope'u bu; salt okuma sürümü yok. |
| `auth/adwords` | Kampanya durdur/başlat, bütçe değiştir (Reklam Yöneticisi, kurallar) | `{koleksiyon}:mutate` (`google.provider.ts:2138-2150`) | **Yazma** | Kampanya durumu/bütçesi Google Ads'te değişir, "Değişiklik geçmişi"nde görünür | Yok |
| `auth/adwords` | Akıllı Boost (video), AdvCampaign rehber kampanya | `googleAds:mutate` (`:2508`, `:2807`) | **Yazma** | Yeni kampanya, bütçe, reklam grubu, reklam, YouTube video öğesi | Yok |
| `auth/adwords` | Dönüşüm kurulumu (`/kurulum`) | `createCustomerClient`, `customerClientLinks:mutate`, `conversionActions:mutate` (`kurulum/ads-kurulum.ts`) | **Yazma** | MCC altında yeni hesap / bağlantı daveti / dönüşüm işlemleri | Yok |
| `auth/tagmanager.edit.containers` | `/kurulum` etiket adımı | GTM v2: hesap/konteyner listesi; konteyner POST, `workspaces` POST/DELETE, `variables`/`triggers`/`tags` POST/PUT/DELETE (`kurulum/gtm.ts:462-560`) | Okuma + **yazma** | Yeni konteyner; "Advetics" çalışma alanı; GA4/Ads/Meta etiketleri, tetikleyiciler, değişkenler | `tagmanager.readonly` yalnız okumayı karşılar; etiket yazmak bu scope'u gerektiriyor |
| `auth/tagmanager.edit.containerversions` | `/kurulum` etiket adımı | `:create_version` (`gtm.ts:581`) | **Yazma** | Konteynerde yeni sürüm (Versions listesi) | `edit.containers` sürüm OLUŞTURMAYA yetmiyor |
| `auth/tagmanager.publish` | `/kurulum` etiket adımı | `versions/{id}:publish` (`gtm.ts:587`), `versions:live` okuma | **Yazma** | Sürüm yayına alınır, "Live" olur, etiketler sitede çalışır | Yayınlamanın başka scope'u yok |
| `auth/analytics.edit` | `/kurulum` GA4 adımı | Admin API: `properties` POST, `dataStreams` POST, `googleAdsLinks` POST, `keyEvents` POST (`kurulum/ga4.ts:139-181`) | **Yazma** | Yeni GA4 mülkü, web veri akışı, Google Ads bağlantısı, `generate_lead` önemli etkinliği | `analytics.readonly` yazamaz |
| `auth/analytics.readonly` | GA4 trafiği (Marka Merkezi → Veri kaynakları), takip açığı, kurulum denetimi | Admin `accountSummaries`, `dataStreams`/`googleAdsLinks`/`keyEvents` GET; Data API `:runReport`, `:runRealtimeReport` (`ga4.ts:124-294`) | Okuma | — | En dar. Data API `analytics.edit` kabul etmiyor (yalnız `analytics.readonly` ya da `analytics`), o yüzden ikisi birlikte |

**Gereksiz scope yok:** istenen altı scope'un her biri en az bir gerçek
çağrıda kullanılıyor.

**Daraltma fırsatı (karar kullanıcıda, kod değişmedi):** yalnız GA4
trafiğini okumak isteyen kullanıcıya da B akışı beş ölçüm scope'unu birden
soruyor (`tagmanager.publish`, `analytics.edit` dahil); `veri-kaynagi`
sözleşmesi GA4 için yalnız `analytics.readonly` beyan ediyor. Ayrı bir
"yalnız GA4 okuma" akışı (`kapsam=ga4`) kullanıcıdan daha az izin ister;
doğrulamaya scope eklemiyor, demo videosunu değiştirmiyor.

## 6. Bağlantıyı kaldırma (videoda gösterilecek)

`POST /connections/:id/disconnect` → `token-vault.service.ts:272-305` →
`https://oauth2.googleapis.com/revoke` (yenileme anahtarıyla; erişim
anahtarlarını da düşürür). Revoke düşerse uyarı loglanıyor, bağlantı yine
kaldırılıyor. Sonuç Google tarafında
`https://myaccount.google.com/permissions` listesinden Advetics'in
kalkması.

**Ajansın canlı bağlantısında ASLA denenmez** (15 Ekim olayı); senaryo
ayrı demo şirketi ve ayrı Google hesabıyla (`CEKIM-SENARYOSU.md` § 0).
