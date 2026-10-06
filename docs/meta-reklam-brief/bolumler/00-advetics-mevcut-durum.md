# 00 — Advetics'te bugün ne var: reklam oluşturma ve AI asistan haritası

> Kaynak: depo kodu (`c14a103`, 2026-10-06) + `docs/AI-ASISTAN-PLANI.md`, `docs/TASARIM-OLUSTUR.md`,
> `docs/DURUM.md`, `docs/DEVAM.md`, `docs/arsiv/DEVAM-2026-08.md`, ilgili commit gövdeleri.
> Kod OKUNDU, hiçbir şey çalıştırılmadı. **`[KOD OKUMASI]`** etiketli maddeler bu harita yazılırken
> kaynağı okuyarak bulundu; belgelerde geçmiyor ve canlıda gözlenmedi.
>
> **En önemli bağlam:** Meta'ya yazan HİÇBİR yol canlıda bir kez bile çalıştırılmadı. `ads_management`
> izni için başvuru yapılmadı (`docs/DURUM.md` § 5, § 6). Aşağıdaki "Meta'ya şu alanlar gidiyor"
> tabloları kodun NE GÖNDERECEĞİNİ anlatıyor, Meta'nın ne kabul ettiğini değil. Tek istisna 13 Ağustos'ta
> ajansın kendi hesabında yapılan ilk deneme (altı hata çıktı, § 10.2).
>
> **Kullanıcı kararı (2026-09-29):** reklam oluşturma sistemi DONDU — kullanıcı onu "karmakarışık" buldu
> ve baştan düzenleyecek (*"reklam oluşturma sistemini istemiyorum şu anlık ... orayı tekrardan
> düzenleyeceğimiz için şimdilik kurgu yapma"*). Bu belge o yeniden yapımın "bugün ne var" girdisi.

---

## Özet: baştan yapım için ne demek

1. **İki kuşak yan yana duruyor.** Eski tek-sihirbaz (`ad_drafts` + `ad-publisher.service.ts`) emekli
   ama silinmedi; yeni "taslak ağacı" (`draft_campaigns → draft_ad_groups → draft_ads`, kreatif ayrı
   varlık) aktif. Eski yolun yazma uçları 410 dönüyor; servis kodu ölü ama derleniyor.
2. **Meta'ya yazan kod yolu sayısı hâlâ yedi** (`publishDraft`, ağaçta `createAd`, `boost-executor` →
   `createBoost`, `draft-publish` → doğrudan `createBoost`, `applyAction`, `copyCampaign`,
   `createLeadForm`) + toplu modülün yetim `createAd` yolu. Tasarım belgesinin "tek yayın yolu" hedefi
   kısmen tuttu.
3. **Çekirdek eşleme sağlam ve korunmalı:** `goal-mapping.ts` + `GOAL_SPEC` + `objective-matrix.ts` +
   tek hedefleme üreticisi `metaTargetingFrom`. Hepsi testlerle kilitli ve canlı derslerin karşılığı.
4. **Hızlı Reklam yalnızca üç amaç biliyor** (form / WhatsApp / site); hepsi Meta biçimli. Google'a
   çıkan tek yol uzman modun arama kampanyası (PAUSED açılır, canlıda hiç denenmedi).
5. **Taslak bir çıkmaz sokak.** Kurulan ama o ekranda yayınlanmayan taslağı açacak, yayınlayacak ya da
   yeniden deneyecek bir ekran YOK. AI asistan "Taslakları incele ve yayınla" diye `/reklam-olustur`a
   yolluyor; oradaki liste salt okunur `[KOD OKUMASI]`.
6. **Kod okumasıyla bulunan sessiz hata adayları (yeni yapımda kapanmalı):** çoklu kreatifte 2.+ reklam
   CTA'sız ve PAUSED kuruluyor (form/WhatsApp kampanyasında form/WhatsApp bağı kayboluyor); uzman modun
   "Başlangıç" alanı Meta'ya hiç gitmiyor; çok görselli kreatifte `asset_customization_rules` boş
   gidiyor; kayıt yazılamazsa taslak `failed` olup yeniden yayınlanabiliyor (mükerrer kampanya riski);
   toplam bütçede özet "günde X × gün" diye yanlış toplam yazıyor. Ayrıntı § 11.
7. **AI asistan çalışıyor ama taslakta duruyor.** 14 araç, tek kullanımlık chat-içi onay kartı (canlı
   mutasyonlar için), Meta/Google ayrı sistem istemi. Plandaki "sohbetten yayına" (FAZ 2) yazılmadı;
   kodun kendi yorumu hâlâ "`publish_campaign` BİLEREK YOK" diyor ve plan ile çelişiyor.
8. **AI'nın ikinci ve üçüncü kullanımı tek atış:** "Kitleyi tarif et" (yapılandırılmış çıktı → Meta
   aramasıyla gerçek kimliğe çözme) ve "AI ile yaz" (görsele bakarak üç metin alanı). İkisi de
   `claude-sonnet-5` (yapılandırılabilir) çağırıyor.
9. **Marka Merkezi reklam oluşturmayı besliyor:** ana amaç, sık sayfalar, yasal uyarı (yayını
   durduruyor), metin şablonları, varsayılan kitle şablonu (konum/yaş/cinsiyet/ilgi/özel kitle). Ama AI
   asistanın taslak aracı kitle şablonunu okumuyor `[KOD OKUMASI]`.
10. **Yeni yapımın en büyük borcu doğrulama:** canlı bir yazma çağrısı olmadan hiçbir yol "çalışıyor"
    sayılamaz; ilk denemede altı hata çıkmıştı ve üçü sessizdi.

---

## 1. Genel resim

### 1.1. Meta'ya (ve Google'a) yazan yollar — bugünkü hâl

| # | Kim tetikliyor | Servis | Sağlayıcı metodu | Durum |
|---|---|---|---|---|
| 1 | Hızlı Reklam, Kampanya Kur, AI taslağı (panelden yayınlanırsa) | `draft-publish.service.ts:401` `publish` | `publishDraft` (`meta.provider.ts:2799`) | Aktif, canlıda denenmedi |
| 2 | Aynı ağaçta 2.+ kreatif | `draft-publish.service.ts:658` | `createAd` (`meta.provider.ts:2532`) | Aktif, canlıda denenmedi |
| 3 | Kural boost'u, Akıllı Boost kartı onayı, AI `boost_post` onayı | `boost-executor.service.ts:358` `createOne` | `createBoost` (`meta.provider.ts:2157`) | Aktif, canlıda denenmedi |
| 4 | Ağaçta `organic_post_id` taşıyan reklam `/draft-campaigns/:id/publish`'e gelirse | `draft-publish.service.ts:699` `publishBoost` | `createBoost` doğrudan | Kod var, panelde onu çağıran düğme yok |
| 5 | Yayındaki kampanya: duraklat / sürdür / bütçe (panel + AI onay kartı + kural motoru) | `campaign-actions.service.ts:302` | `applyAction` (`meta.provider.ts:1419`) | Aktif, canlıda denenmedi |
| 6 | Toplu Oluştur → yayındaki kampanyayı kopyala | aynı | `applyAction` → `copyCampaign` (`:1504`, `POST /{id}/copies`) | Aktif, canlıda denenmedi |
| 7 | Formlar kütüphanesi | `forms.controller.ts:130` | `createLeadForm` (`:3001`) | Aktif, geri alınamaz, denenmedi |
| 8 | YouTube yeni video → Google Demand Gen | `autoboost-launch.service.ts:588` | Google `createVideoBoost` | Aktif, denenmedi |
| 9 | Eski toplu tablo (`bulk_batches`) | `bulk.service.ts:359` | `createAd` | API uçları açık, panel bileşeni (`bulk-composer.tsx`) hiçbir yerden import edilmiyor — yetim `[KOD OKUMASI]` |
| — | Eski sihirbaz | `ad-publisher.service.ts` `publish` | `publishDraft` | **Ölü**: `POST /ad-drafts/:id/publish` 410 dönüyor (`ad-builder.controller.ts:208-216`) |

> `DEVAM.md` "eski tek reklam yayın yolu özel kategori kısıtını uygulamıyor ... uç açık" diyor. Uç
> açık değil: `b7f0301`'den beri `GoneException` fırlatıyor `[KOD OKUMASI]`. Ölü kod, risk değil;
> silinmeli.

### 1.2. Menü ve girişler

- Kenar çubuğu (`apps/web/src/lib/nav-sections.ts:67-113`): **Akıllı Boost** (`/auto-boost`),
  **Reklam Oluştur** (`/reklam-olustur`, izin `bulk.write`), altında **AI Asistan** → **Meta AI**
  (`?platform=meta`) ve **Google Ads AI** (`?platform=google`). Marka Merkezi (`/marka-merkezi`) "Base"
  başlığı altında.
- `/reklam-olustur` beş kart gösteriyor; AI Asistan hem menüde hem kartta (sayfanın kendi yorumu
  "ayrı bir menü öğesi değil" diyor — `reklam-olustur/page.tsx:131-136` — ama menüde var).

---

## 2. Panel ekranları

### 2.1. `/reklam-olustur` — giriş kapısı

Dosya: `apps/web/src/app/(dashboard)/reklam-olustur/page.tsx`

| Bölüm | İçerik | Satır |
|---|---|---|
| Workspace zorunlu | `?musteri=` yoksa `WorkspaceGerekli` (sessizce ilk workspace'e düşmüyor) | 49-59 |
| "Sıfırdan kampanya" | AI Asistan (vurgulu) · Hızlı Reklam · Kampanya Kur | 128-154 |
| "Var olandan üret" | Toplu Oluştur · Akıllı Boost | 156-174 |
| Yayında olanlar | `CanliKampanyalar` (`GET /campaigns`): durum, bütçe, 7 günlük harcama; satırda duraklat/sürdür/bütçe/kopyala (izin `budget.write`) | 189-207 |
| Kurulan kampanyalar | `DraftGroupList` — son 10, toplam yazılı. **Salt okunur**: ne açma, ne yayınlama, ne yeniden deneme | 209-229 |
| Eski oluşturucu | `ad_drafts` salt okunur (boşsa görünmüyor). Okuma hatası `[]`'e yutuluyor (`:91`) `[KOD OKUMASI]` | 231, 272-299 |

### 2.2. Hızlı Reklam — `/reklam-olustur/basit`

Sayfa: `apps/web/src/app/(dashboard)/reklam-olustur/basit/page.tsx` · Bileşen:
`apps/web/src/components/ad-builder/simple-builder.tsx` (1.592 satır) · Sihirbaz kabuğu:
`components/ad-builder/sihirbaz.tsx`

Sunucu tarafı veri (hepsi `Promise.allSettled`, hata yutulmuyor): bağlantılar (hesap + sayfa), arşiv
görselleri (60), videolar (30), taslak listesi, `/clients` (site adresi), `/client-profile` (Marka),
`/audience-templates` (kitleler).

**Akış (2026-09-22'den beri adım adım sihirbaz, `simple-builder.tsx:501`):**

| Adım | Soru | Alanlar | Not |
|---|---|---|---|
| 1 Hedef | "Ne olsun?" | 3 kart: Form doldursunlar / WhatsApp'tan yazsınlar / Siteme gelsinler. Altında platform SONUÇ olarak yazıyor | Marka Merkezi'ndeki `anaAmac` seçili açılıyor ve bunu söylüyor |
| (Ayarlar bloğu) | yalnızca gerekirse | Reklam hesabı (>1 ise), Sayfa (>1 ise), Web sitesi adresi (site amacında; sık sayfalardan liste + serbest kutu) | Varsayılan hesap/sayfa `accounts[0]`/`pages[0]` |
| WhatsApp | — | Numara SORULMUYOR; sayfaya bağlı numara okunup gösteriliyor (`GET /connections/social-profiles/:id/whatsapp`), üç hâl ayrı (geldi / okunamadı / çağrı düştü) | Okunamaması yayını engellemiyor |
| 2 Görsel | "Reklamda ne görünsün?" | Arşivden seçim, ekranda yükleme (`POST /assets`, yüklenen otomatik seçilir), tarayıcıda kırpma (`crop-studio.tsx`, tek görselden üç oran), video seçimi (görselle karışık seçilemez) | En az bir görsel |
| 3 Metin | "Ne yazalım?" | Ana metin, Başlık, Açıklama; metin şablonları tek tıkla; **"AI ile yaz"** (`POST /creatives/metin-onerisi`, seçili ilk 3 görsel modele gidiyor, yazılanı EZİYOR ve bunu söylüyor) | Yasal uyarı kutuya yazılmıyor, gönderirken sona ekleniyor |
| 4 Bütçe | "Günde ne kadar harcayalım?" | Hazır kartlar 100 / 250 / 500 + serbest tutar; süre 7 / 14 / 30 gün / Süresiz; **"Kime gösterilsin"** (kitle şablonu seçimi, varsayılan seçili) | Kampanya adı otomatik (hedef + tarih) |
| 5 Özet | "Son bir kez bakalım" | Kurulacak şeyin özeti | Eksik varsa sebebi yazılı |

**Çağrı sırası** (`simple-builder.tsx:391-470`):
1. `POST /creatives` — kreatif kütüphaneye yazılıyor (metin havuzu + görseller).
2. `POST /draft-campaigns/simple` — `targets: [{ platform: 'meta', adAccountId, dailyBudget }]`,
   `socialProfileId`, `creativeIds: [id]`, `durationDays`, `linkUrl`, `kitle` (şablonun KOPYASI).
3. `GET /draft-campaigns/:id/check` — kendiliğinden; engeller ve uyarılar ayrı.
4. Kullanıcı "Yayınla" → `POST /draft-campaigns/:id/publish-group`.

Sonuç ekranı (`Sonuc`, `:1099`) platform başına durumu ayrı yazıyor. Kullanıcı bu ekrandan ayrılırsa
taslağa geri dönüş yolu yok.

### 2.3. Kampanya Kur (uzman) — `/reklam-olustur/uzman`

Sayfa: `apps/web/src/app/(dashboard)/reklam-olustur/uzman/page.tsx` · Bileşenler:
`components/ad-builder/expert-builder.tsx` (583), `advanced-panel.tsx` (552), `coverage-panel.tsx`

- Sayfa üç veriyi `.catch(() => [])` ile alıyor (`uzman/page.tsx:50-52`) — bağlantı isteği düşerse ekran
  "Bu workspace'e henüz reklam hesabı atanmamış" yazıyor. Aynı hata Hızlı Reklam'da düzeltilmişti,
  burada kaldı `[KOD OKUMASI]`.
- Tek ekran, adım yok. Alanlar: Kampanya adı, **Platform** (Meta / Google — ilk soru), Reklam hesabı,
  Sayfa (Meta), Hedef URL, Bütçe, Kreatifler (kütüphaneden, en fazla 10, sıra anlamlı), Form
  (kütüphaneden), Anahtar kelimeler (Google, virgülle).
- **Gelişmiş panel** (yalnız Meta, `advanced-panel.tsx`), Meta terimleri olduğu gibi görünüyor:
  Kampanya hedefi (`OUTCOME_*`) · Neyi optimize edelim (`objective-matrix` ile süzülmüş) · Hangi form ·
  Piksel kimliği + Dönüşüm olayı · Bütçe tipi (günlük/toplam) · Teklif stratejisi + Tavan · Başlangıç ·
  Bitiş · Yaş alt/üst ("65 = 65 ve üzeri") · Cinsiyet · Ülkeler · Yerleşim (otomatik / elle; Facebook ve
  Instagram konumları). Varsayılan değerler `advancedDefaultsFor('whatsapp')`.
- Çağrılar: `POST /draft-campaigns/expert` → `GET /:id/check` → `POST /draft-campaigns/:id/publish`
  (`expert-builder.tsx:130, 163`).
- Kitle şablonu, ilgi alanı ve özel kitle bu ekranda YOK (Bölüm 4 "dondu" kararıyla bekletildi).

### 2.4. AI Asistan — `/reklam-olustur/ai-asistan?platform=meta|google`

Sayfa: `reklam-olustur/ai-asistan/page.tsx` · Bileşenler: `components/ai-asistan/ai-asistan-sohbeti.tsx`
(444), `onay-karti.tsx`, `sohbet-balonu.tsx`, `sohbet-listesi.tsx`.

- Aynı anda en fazla 3 kalıcı sohbet (`SOHBET_SINIRI`), sayfa yenilenince geçmiş ve açık onay kartı geri
  geliyor.
- Sohbete görsel sürükle-bırak / yapıştır; "geçmişte işe yarayan kreatifler" (`list_top_creatives`).
- Taslak üreten bir araç başarılı olunca kart: "Taslak hazır — platforma henüz yayınlanmadı ·
  **Taslakları incele ve yayınla**" → `/reklam-olustur` (`ai-asistan-sohbeti.tsx:322-331`). Orada
  yayınlama düğmesi yok `[KOD OKUMASI]` — AI ile kurulan taslak panelden yayınlanamıyor.
- Canlı mutasyon (duraklat/sürdür/bütçe/boost) için sohbet içinde tek kullanımlık onay kartı.
- Video bırakan kullanıcıya "video reklamları henüz desteklenmiyor" deniyor (plan § 4b).

### 2.5. Toplu Oluştur — `/toplu-olustur`

`apps/web/src/app/(dashboard)/toplu-olustur/page.tsx`: tablo/TSV modeli 2026-08-16'da kalktı. İki ayrı
çoğaltma mekanizması aynı sayfada:
- `DuplicatePanel` (`components/ad-builder/duplicate-panel.tsx`) → `POST /draft-campaigns/duplicate`:
  Advetics taslağını SQL ile kopyalıyor (`draft-tree.service.ts:274`), değişen alan yazılıyor.
- `CanliKampanyalar` "Kopyala" → Meta'nın `/copies` ucu (`deep_copy`, `status_option=PAUSED`), izin
  `budget.write`.

### 2.6. Akıllı Boost — `/auto-boost`

Sayfa: `apps/web/src/app/(dashboard)/auto-boost/page.tsx` · Bileşenler: `components/autoboost/`
(`bildirim-havuzu.tsx` 1.337, `boost-on-ayarlari-formu.tsx` 820, `kart-duzenle.tsx` 546,
`hedefleme-secici.tsx`, `google-hedefleme.tsx`). API: `modules/autoboost/`, `modules/boosts/`.

- Kullanıcı "çok karışık ve kullanışsız" dedi; beş eylem yüzeyinden üçü kaldırıldı ("Gönderi öne
  çıkar" elle boost'u havuzla aynı işi yapan ikinci yayın yolu olduğu için gitti). Tek eylem yüzeyi
  **yeni içerik kartları** (bildirim havuzu): yeni IG gönderisi / YouTube videosu → kart → onay → yayın.
- **Ön ayar** (Meta): bütçe kipi (günlük/toplam), tutar, süre, yaş, cinsiyet, konum, "Kitle şablonundan
  doldur" (ilgi + özel kitle KOPYALANIYOR), kayıtlı kitle. YouTube: günlük bütçe, süre.
- Kart başına düzenleme ("sadece bu gönderi için"): kitle/şehir, bütçe/süre, YouTube reklam metni.
- Kartlar YALNIZCA Instagram (+YouTube) için üretiliyor; Facebook crosspost ikizi kart olmuyor
  (`AKILLI_BOOST_META_PROFILLERI`, kullanıcı kararı 2026-09-30).
- Kural motoru adayları, kurallar ve geçmiş havuzun altında, okunacak şeyler olarak.

### 2.7. Marka Merkezi'nin reklam oluşturmayı besleyen kısımları

`/marka-merkezi?bolum=...`, iç menü `components/marka-merkezi/bolumler.ts:23-45`: Bağlantılar · Marka ·
Aylık Bütçe · Kitleler · Varlıklar (Görseller / Kreatifler / Formlar).

| Bölüm | Alanlar (`client-profile.schema.ts:98-120`, `kitle-sablonu.schema.ts`) | Reklam oluşturmada kim okuyor |
|---|---|---|
| Marka | `markaAdi`, `sektor`, `urunKategorileri`, `sikSayfalar` (ad+url), `anaAmac` (form/whatsapp/website), `uslup`, `vaatler`, `metinSablonlari`, `yasalUyari` (≤300), serbest `bilgiBankasi`/`hedefKitle`/`markaBilgileri` | Hızlı Reklam (amaç, adres, şablon, uyarı), "AI ile yaz" ve AI asistan (`musteriBaglamiKur`), yayın kontrolü (yasal uyarı) |
| Kitleler | Şablon: ad, konumlar (Meta geo anahtarı + `countryCode`, ≤25), yaş, cinsiyet, ilgiler (≤25, Meta kimliği), özel/benzer kitleler (≤10, dahil/hariç, `hesapId` taşıyor). Workspace varsayılan şablonu (`client_profiles.varsayilan_kitle_id`). "Kitleyi tarif et" (AI) | Hızlı Reklam (kopya), Akıllı Boost ön ayarı (kopya). Uzman mod ve AI asistan OKUMUYOR |
| Varlıklar | Görsel arşivi (JPEG/PNG, min kenar 600, ≤30 MB; logo ayrı tür, min 128), video (MP4/MOV, `video-probe.ts`), kreatifler (metin havuzu + görseller), formlar | Bütün yazma yolları |
| Müşteri kartı | `special_ad_categories` (K9) | Bütün Meta yazma yolları (`restrictTargetingFor`) |

Kurallar: ülke + aynı ülkenin ili birlikte REDDEDİLİYOR (`konumCakismasi`); özel kitle yalnızca kendi
hesabında, uyuşmazlık yayını durduruyor; yayına hazır olmayan özel kitle (`delivery_status.code !== 200`)
seçilemiyor; kitle seçici workspace'in İLK izlenen Meta hesabını kullanıyor (çok hesaplı workspace'te
sınır).

---

## 3. API: veri modeli, şemalar, uçlar

### 3.1. Tablolar (`apps/api/prisma/schema.prisma`)

| Model (satır) | Rol | Önemli alanlar |
|---|---|---|
| `DraftCampaign` (2873) | Ağacın kökü = bir platform kampanyası | `groupId` (çok platformlu niyet), `platform`, `adAccountId`, `surface` simple/expert, `goal` (uzmanda NULL), `settings` JSONB (objective, bidStrategy…), `budgetMode` none/daily/lifetime, `budgetAmountMicros`, `startAt`, `endAt`, `status` draft/publishing/published/failed, `source` manual/boost_rule/duplicate, `sourceCampaignId`, `boostRuleId`, `externalCampaignId`, `error` |
| `DraftAdGroup` (2970) | Ad set / reklam grubu | `socialProfileId`, `leadFormId`, `settings` JSONB (optimizationGoal, billingEvent, destinationType, linkUrl, kitle, targeting, placement, startAt, keywords…), `externalAdSetId`, `error` |
| `DraftAd` (3016) | Reklam | `creativeId` XOR `organicPostId`, `position`, `externalAdId`, `externalCreativeId`, `error` |
| `AdCreative` (2773) + `AdCreativeAsset` (2816) | Kreatif kütüphanesi | `texts` JSONB (primaryText, headlines[], longHeadlines[], descriptions[]), sıralı varlıklar |
| `Asset` (2689) + `AssetPlatformRef` (2739) | Arşiv + hesap başına `image_hash` önbelleği | `kind` image/logo/video, `contentHash` (mükerrer engeli, müşteri bazlı), `externalRef` per (asset, adAccount) |
| `AudienceTemplate` (586) | Kitle şablonu | `locations`, `ageMin/Max`, `genders`, `interests`, `ozelKitleler` |
| `Boost` (1890) | Boost onay kuyruğu + tavan muhasebesi | `status` (…approved/creating/active/failed…), `budgetMode`, günlük/toplam micros, `targeting`, `savedAudienceId`, `targetCampaignExternalId` (K21), `draftCampaignId` |
| `AdDraft` (2108) | ESKİ düz taslak — emekli | Üretimde 0 satır ölçüldü (2026-08-16); tablo düşürülmedi |

Para micros (BigInt), Meta'ya giderken `toMinorUnits` ile en küçük birime (`meta.provider.ts:4427`).

### 3.2. Zod şemaları ve saf üreticiler (`packages/shared/src/schemas/`)

| Dosya:satır | Ne |
|---|---|
| `ad-builder.schema.ts:34` | `CAMPAIGN_GOALS = ['form','whatsapp','website']`; `GOAL_META` (:49) etiket/vaat/ipucu/gereksinim; oranlar, `MIN_IMAGE_EDGE=600`, `MAX_IMAGE_BYTES=30MB`, `ACCEPTED_MIME` |
| `campaign-advanced.schema.ts:35-215` | Kapalı sözlükler: `OBJECTIVES` (5), `OPTIMIZATION_GOALS` (11), `BILLING_EVENTS` (3), `DESTINATION_TYPES` (ON_AD/WEBSITE/WHATSAPP/MESSENGER), `BID_STRATEGIES` (3, risk metinleriyle), `advancedSettingsSchema` |
| `campaign-advanced.schema.ts:259` | `GOAL_SPEC` — hızlı mod eşlemesinin TEK kaynağı (sunucu + uzman varsayılanı) |
| `draft-tree.schema.ts:67` | `GOAL_PLATFORM_SUPPORT` — amaç × platform: yes / not_yet / never |
| `draft-tree.schema.ts:128, 244` | `simpleDraftInputSchema` + `buildDraftTree` (saf) |
| `draft-tree.schema.ts:378, 476` | `expertDraftInputSchema` (platforma göre `superRefine`: Meta'da advanced+sayfa, Google'da anahtar kelime+URL zorunlu) + `buildExpertTree` |
| `draft-tree.schema.ts:338, 352` | `endTimeFor`, `moneyToMicros` (float'sız) |
| `creative.schema.ts:41-180` | Metin havuzu sınırları, `FORMAT_TEXT_SPEC` (Meta 1 başlık/1 açıklama; Google RSA 3-15 başlık ≤30, 2-4 açıklama ≤90), `packTextsFor` |
| `kitle-sablonu.schema.ts` | Şablon, `kitleHedefiSchema` (taslağa yazılan kopya), öneri isteği/yanıtı |
| `special-category.schema.ts:25, 79` | `SPECIAL_AD_CATEGORIES`, `restrictTargetingFor` |
| `ai-assistant.schema.ts` | Platformlar, mesaj/onay girdisi, `SOHBET_SINIRI = 3` |

### 3.3. Uçlar

| Uç | İzin | Not |
|---|---|---|
| `POST /draft-campaigns/simple`, `/expert`, `/duplicate` | `bulk.write` | Taslak kurar, platforma gitmez |
| `GET /draft-campaigns/:id/check` | `bulk.read` | Engeller / uyarılar / özet / kapsama |
| `POST /draft-campaigns/:id/publish`, `/publish-group` | **`bulk.write`** | Rol matrisinde "Reklam oluşturma ve yayınlama" için ayrı `bulk.publish` anahtarı var ama yeni yol onu kullanmıyor `[KOD OKUMASI]` |
| `POST /creatives`, `PUT`, `/:id/duplicate`, `GET /performans` | bulk.* | Kreatif kütüphanesi |
| `POST /creatives/metin-onerisi` | `bulk.write` | AI metin |
| `POST /assets` (multipart, `kind`) | `bulk.write` | Arşiv yükleme |
| `GET /campaigns`, `POST /campaigns/:id/actions` | `bulk.read` / `budget.write` | Canlı liste + pause/resume/set_budget/copy |
| `POST /audience-templates/ai-oneri` | `client.write` | Kitle önerisi |
| `POST /ai-assistant/messages`, `/conversations/:id/confirm` | `bulk.read` / `budget.write` | Sohbet + onay |
| `/ad-drafts/*` yazma uçları | — | 410 Gone |

---

## 4. Eşleme katmanı — `goal-mapping.ts` ve çevresi (TAMAMI)

Dosya: `apps/api/src/modules/ad-builder/goal-mapping.ts` (433 satır). Saf fonksiyonlar.

### 4.1. Amaç → Meta eşlemesi (`GOAL_SPEC` + `campaignSpec`, `goal-mapping.ts:43-120`)

| Amaç (panel etiketi) | `objective` | `optimization_goal` | `billing_event` | `destination_type` | `promoted_object` | CTA | Gerekçe (koddan) |
|---|---|---|---|---|---|---|---|
| `form` (Form doldursunlar) | `OUTCOME_LEADS` | `LEAD_GENERATION` | `IMPRESSIONS` | `ON_AD` | `{ page_id }` | `SIGN_UP` | `LINK_CLICKS` forma tıklayıp doldurmayanı optimize ederdi; lead başı faturalama küçük hesapta yok |
| `whatsapp` (WhatsApp'tan yazsınlar) | `OUTCOME_LEADS` | `CONVERSATIONS` | `IMPRESSIONS` | `WHATSAPP` | `{ page_id }` | `WHATSAPP_MESSAGE` | Gerçekten yazanı optimize ediyor; numara sayfadan |
| `website` (Siteme gelsinler) | `OUTCOME_TRAFFIC` | `LANDING_PAGE_VIEWS` | `IMPRESSIONS` | — (gönderilmiyor) | — | `LEARN_MORE` | Tıklamayı değil sayfanın açılmasını sayar; piksel yoksa Meta'nın `LINK_CLICKS`e düştüğü varsayılıyor; `OUTCOME_SALES` piksel/olay olmadığı için kullanılmıyor |

> Açık soru: `website` amacında `destination_type` gönderilmiyor — "platformun varsayılanına güvenme"
> ilkesiyle çelişiyor; belgeden doğrulanmalı.

### 4.2. Uzman modu çözümü (`resolveSpec`, `:271-322`)

- Basit modda `campaignSpec`; uzman modda kullanıcının `objective/optimization/billing/destination`'ı.
- `promoted_object`: piksel varsa `{ pixel_id, custom_event_type: conversionEvent ?? 'LEAD' }`; yoksa
  `OUTCOME_LEADS` / `OUTCOME_ENGAGEMENT` için `{ page_id }`; diğerlerinde yok. İkisi birden gönderilmiyor.
- CTA kullanıcıya sorulmuyor (`ctaFor`): `ON_AD`→`SIGN_UP`, `WHATSAPP`→`WHATSAPP_MESSAGE`,
  `MESSENGER`→`MESSAGE_PAGE`, diğer: `OUTCOME_SALES`→`SHOP_NOW`, kalanı `LEARN_MORE`.

### 4.3. Uyumluluk matrisi (`objective-matrix.ts:45-128`) — izin listesi, bilinmeyen = geçersiz

| `objective` | İzinli `optimization_goal` | İzinli `destination_type` | Sayfa |
|---|---|---|---|
| `OUTCOME_LEADS` | LEAD_GENERATION, QUALITY_LEAD, CONVERSATIONS, OFFSITE_CONVERSIONS, LINK_CLICKS | ON_AD, WEBSITE, WHATSAPP, MESSENGER | Evet |
| `OUTCOME_TRAFFIC` | LANDING_PAGE_VIEWS, LINK_CLICKS, REACH, IMPRESSIONS | WEBSITE | Hayır |
| `OUTCOME_ENGAGEMENT` | POST_ENGAGEMENT, THRUPLAY, REACH, IMPRESSIONS, CONVERSATIONS | WHATSAPP, MESSENGER | Evet |
| `OUTCOME_AWARENESS` | REACH, IMPRESSIONS, AD_RECALL_LIFT, THRUPLAY | — | Hayır |
| `OUTCOME_SALES` | OFFSITE_CONVERSIONS, LANDING_PAGE_VIEWS, LINK_CLICKS | WEBSITE | Hayır |

Faturalama: `LINK_CLICKS` → IMPRESSIONS|LINK_CLICKS; `THRUPLAY` → IMPRESSIONS|THRUPLAY; diğerleri yalnız
IMPRESSIONS. `OFFSITE_CONVERSIONS` piksel ister; `LEAD_GENERATION`/`QUALITY_LEAD` form ister. Engelleyici
ile uyarı ayrı. Matris belgeden çıkarıldı, canlıda sınanmadı. (Not: `OUTCOME_LEADS` etiketi "Potansiyel
workspace" — "Müşteri→Workspace" toplu yeniden adlandırmasının yan etkisi, `objective-matrix.ts:47`
`[KOD OKUMASI]`.)

### 4.4. Amaç × platform (`GOAL_PLATFORM_SUPPORT`, `draft-tree.schema.ts:67`)

| Amaç | Meta | Google |
|---|---|---|
| form | yes | never — "lead form uzantısı ayrı kavram" |
| whatsapp | yes | never |
| website | yes | not_yet — "reklam oluşturma henüz yazılmadı" (oysa uzman modda Google arama yazma yolu var; tablo onu bilmiyor) |

### 4.5. Yerleşim

- **Basit mod** (`placementsFor`, `:156`): her zaman `publisher_platforms: [facebook, instagram]`,
  `facebook_positions: [feed]`, `instagram_positions: [stream]`; dikey görsel varsa + `story`,
  `facebook_reels` / `story`, `reels`; yatay varsa + `right_hand_column`, `video_feeds`. Gerekçe: otomatik
  yerleşim kare görseli Hikâyeler'e kırpıyor.
- **Görsel–yerleşim kuralları** (`customizationRules`, `:188`): dikey → story/reels, yatay → sağ sütun/
  video akışı, kare → VARSAYILAN kural EN SONDA. Etiket `advetics_<oran>`. Her yerleşimin bir kuralda
  karşılığı olmalı, yoksa "reklam hiç gösterilmiyor ve Meta hata bildirmiyor".
- **Uzman mod** (`placementsFrom`, `:409`): otomatikte HİÇBİR alan gönderilmiyor (boş
  `publisher_platforms` = hiçbir platform = sessiz sıfır harcama); elle modda seçilenler.

### 4.6. Hedefleme — tek üretici

`apps/api/src/modules/boosts/meta-targeting.ts`:

- `metaTargetingFrom` (`:61`): konumlar türüne göre ayrı kovalara (`countries` düz kod; `regions` ve
  `cities` `{ key }` nesnesi); **lokasyon seçildiyse ülke geneli eklenmiyor** (kovalar birleşim); hiç
  konum yoksa `countries: ['TR']` (boş = dünya geneli); `age_min` her zaman; `age_max` yalnızca < 65;
  cinsiyet yalnızca erkek `[1]`/kadın `[2]` ("hepsi" = alan yok); ilgiler TEK `flexible_spec` grubunda
  (birleşim); özel kitle `custom_audiences` / `excluded_custom_audiences`; boş dizi hiç gönderilmiyor.
- `advantageIsaretiyle` (`:157`): `targeting_automation.advantage_audience: 0` açıkça (canlıda subcode
  1870227 ile öğrenildi); kayıtlı kitle kendi değerini taşıyorsa ezilmiyor.

`goal-mapping.ts` sarmalayıcıları: `defaultTargeting` (`:139`, TR 18+), `targetingFrom` (`:340`,
uzman ayarı; şehir varsa ülke gitmiyor; `locales` ek), `grupHedeflemesi` (`:365`) — öncelik **uzman
ayarı > taslaktaki kitle kopyası (`settings.kitle`) > TR 18+**; okunamayan kitle ya da başka hesabın
özel kitlesi varsayılana DÜŞMÜYOR, `hata` dönüyor ve yayın duruyor. Özel kategori kısıtı en son
`restrictTargetingFor` ile (yaş/cinsiyet/ilgi/özel kitle düşüyor, kontrol ekranı söylüyor).

Boost yolunun ayrı varsayılanı: `DEFAULT_BOOST_TARGETING = { geo_locations: { countries: ['TR'] } }`
(`meta.provider.ts:3926`, yaş alanı yok) — kural boost'unda hedefleme NULL ise bu gidiyor.

### 4.7. Süre ve taahhüt

`endTimeFor` (0 = süresiz, `end_time` gönderilmiyor) — **iki kopya**: `goal-mapping.ts:238` ve
`draft-tree.schema.ts:338` (yorumları "ikisi ayrışırsa..." diyor). `totalCommitmentMicros` (`:249`):
süresizde `null`.

---

## 5. Yayın yolu — `draft-publish.service.ts`

Dosya: `apps/api/src/modules/draft-tree/draft-publish.service.ts` (1.186 satır).

### 5.1. `check()` (`:90-378`) — engeller ve uyarılar ayrı

Engeller: zaten yayınlanmış; reklam grubu sayısı ≠ 1 ("şimdilik tek gruplu"); grupta reklam yok;
hedefleme `hata`sı; `validateAdvanced` engelleri; uzman ayarları okunamadı; Meta'da sayfa yok; Google'da
anahtar kelime / URL yok; bütçe yok; site amacında adres yok; HER varyant için: metin paketleme
engelleri, Meta'da ana metin boş, **yasal uyarı ana metinde yok**, Meta görsel kapsaması (kare yuva
vb.). Uyarılar: Google yolu canlıda hiç çalışmadı; başlık boş; kırpma oranları; özel kategori beyanı ve
düşecek daraltmalar; süresiz kampanya. Özet: "Meta · günde X · N gün · toplam Y" ya da "süresiz".

### 5.2. `publish()` sırası (`:401-695`)

1. `check()` — geçmezse satır `failed` + 400.
2. `grupHedeflemesi` — hata varsa 400.
3. Reklam bir organik gönderiyse → `publishBoost` (§ 5.4).
4. Kreatif ve yetki (`resolveAuth`: bağlantı, hesap/sayfa dış kimlikleri, form, para birimi, özel
   kategoriler).
5. `provider.canWrite(grantedScopes)` — `ads_management` yoksa `failed` + "Meta onayı gelene kadar
   reklam yayınlanamaz".
6. Kota kapısı `quota.acquire({ layer: 'interactive' })` (`:455`) — doluysa 400, satıra yazılmıyor.
7. Durum `publishing` (`:467`). Token kasadan.
8. Görseller: `uploadImages` (`:799`) — oran kovasına oturmayan atlanıp LOG'a yazılıyor; hash
   `AssetUploaderService.ensureExternalRef` ile hesap başına önbellekten; **kare her zaman ilk**.
9. Video varsa `uploadAdVideo` (`:514`); hazır doğrulanamazsa uyarı log'u, yayın yine deneniyor.
10. `packTextsFor('meta_single_image' | 'google_rsa')`.
11. `provider.publishDraft(...)` (`:538`) — spec (basitte `campaignSpec`, uzmanda `resolveSpec`),
    metinler, `linkUrl`, `dailyBudgetMicros` (adı "daily" ama lifetime'da toplam), `endTime`,
    `startTime: campaign.startAt` (`:572`), `budgetMode`, form, para birimi, görseller, video,
    Google başlık/açıklama/anahtar kelime, özel kategoriler, `targeting` (kısıtlanmış), yerleşim,
    teklif, **`customizationRules: null`** (`:619`).
12. `markPublished` (`:622`) — kampanya/grup/ilk reklam dış kimlikleri, `published`.
13. Kalan varyantlar: her biri için görseller yüklenip `provider.createAd` (`:658`) aynı ad set'e;
    düşen varyantın hatası kendi satırına, kampanya düşmüyor.
14. Herhangi bir hata (`:675-686`): satır `failed`, mesaj `PlatformApiError.kind: mesaj`, 400.

`publishGroup` (`:381`) gruptaki her platform kampanyasını bağımsız yayınlıyor, hata fırlatmıyor (K13:
"Meta çıktı, Google düştü" normal sonuç).

### 5.3. Transaction dışı çalıştırıcı deseni ve `creating` durumu

- **Desen** `boost-executor.service.ts:48` `TxRunner`: platform çağrısı transaction'ın DIŞINDA; çağıran
  "şu işi kısa bir transaction'da koştur" diyen bir fonksiyon veriyor (kiracı yolu
  `prisma.withTenant(ctx, fn)`, worker yolu admin istemci). Gerekçe: `withTenant` 5 sn sınırı; Meta'ya
  3-4 çağrı üretimde 12,5 sn sürdü, transaction ölünce hata bile yazılamadı. Kullanan yerler:
  `boosts.service.ts:869`, `boosts.controller.ts:203`, `autoboost-launch.service.ts:277`.
- **`creating`** yalnızca `boosts` tablosunda (`boost-executor.service.ts:436`): platform çağrısından
  önce `approved → creating`; kayıt yazılamazsa `failed` DEĞİL `creating` kalıyor ve `pending()` onu
  tekrar almıyor (para harcayan mükerrer kampanyayı önlemek için).
- **Taslak ağacında bu koruma YOK** `[KOD OKUMASI]`: `draft-publish` her `withTenant`'ı kısa tutuyor
  (platform çağrıları dışarıda — desen doğru), ama durum makinesinde `creating` yok; `markPublished`
  (`:622`) platform başarısından sonra düşerse catch bloğu satırı `failed` yapıyor ve `check()` yalnızca
  `published`'ı engellediği için (`:95`) aynı taslak ikinci kez yayınlanabiliyor. `publishing` durumu da
  engellenmiyor (çift tıklama / eşzamanlı istek).

### 5.4. Ağaçtaki boost (`publishBoost`, `:699-784`)

`createBoost`'u doğrudan çağırıyor: kota kapısı yok, `boosts` satırı/tavan muhasebesi yok, hedefleme
gönderilmiyor (sağlayıcı varsayılanı TR), ad K22 fonksiyonundan değil `campaign.name`'den
`[KOD OKUMASI]`. Panelde bu yolu tetikleyen düğme yok; ama uç açık. Boost'un asıl yolu § 6.3.

---

## 6. `meta.provider.ts` yazma metotları — Meta'ya giden alanlar

Dosya: `apps/api/src/modules/connections/providers/meta.provider.ts` (4.517 satır). Graph API sürümü
`META_API_VERSION` (`v25.0`). Bütün yollarda `actPath()` (`:140`, `act_` öneki çift eklenmesin),
`toMinorUnits` (`:4427`, ISO 4217 sıfır/üç ondalık istisnaları), form-urlencoded `graphPost`.

### 6.1. `publishDraft` (`:2799-2955`) — kampanya + ad set + kreatif + reklam

| Sıra | Uç | Alanlar |
|---|---|---|
| 0 | `POST /{page_id}/leadgen_forms` (yalnız `ON_AD` ve kütüphaneden form yoksa, `createEmbeddedLeadForm` `:2958`) | `name`, `privacy_policy {url: linkUrl ?? advetics.com/gizlilik}`, `questions [FULL_NAME, EMAIL, PHONE]`, `follow_up_action_url`. Geri alma listesine girmiyor |
| 1 | `POST /act_X/campaigns` | `name`, `objective`, `status: PAUSED`, `special_ad_categories` (müşteri beyanı), `is_adset_budget_sharing_enabled: 'false'` (`:165`). **Kampanya bütçesi YOK** |
| 2 | `POST /act_X/adsets` | `name` ("— ad set"), `campaign_id`, `billing_event`, `optimization_goal`, `targeting` (= hedefleme ⊕ yerleşim ⊕ `advantage_audience: 0`), `status: ACTIVE`, `daily_budget` YA DA `lifetime_budget` (minor unit), `bid_strategy` HER ZAMAN (varsayılan `LOWEST_COST_WITHOUT_CAP`; subcode 2490487 dersi), tavanlıda `bid_amount`, `start_time`?, `destination_type`?, `promoted_object`? (form kimliği buraya GİRMİYOR), `end_time`? |
| 3 | `POST /act_X/adcreatives` (`buildCreativeSpec` `:4264`) | **Video**: `object_story_spec.video_data {video_id, message, title?, link_description?, call_to_action}` (küçük resim Meta'ya bırakıldı). **Tek görsel ya da form**: `link_data {message, name?, description?, link, image_hash?, call_to_action}`. **Çok görsel (form değil)**: `asset_feed_spec {images[{hash, adlabels}], bodies, titles?, descriptions?, link_urls, call_to_action_types, ad_formats: [SINGLE_IMAGE], asset_customization_rules}` |
| 3a | CTA değeri | form → `{ lead_gen_form_id }`; WhatsApp → `{ app_destination: 'WHATSAPP' }` ve `link = https://api.whatsapp.com/send`; diğer → `{ link }`. Link yoksa `facebook.com/{page}` |
| 4 | `POST /act_X/ads` | `name`, `adset_id`, `creative {creative_id}`, `status: ACTIVE` |
| 5 | `POST /{campaign_id}` | `status: ACTIVE` (kampanya en son açılıyor) |
| Hata | `DELETE /{id}` ters sırada | En iyi çaba; silinemeyen log'a |

Bütçe ad set'te (ABO). Taslak ağacı yorumu "BÜTÇE KAMPANYADA (Meta'da CBO)" diyor
(`draft-tree.schema.ts`, `buildDraftTree`) — model ile gönderilen ayrışıyor (para hatası değil, kavram
karışıklığı) `[KOD OKUMASI]`.

### 6.2. `createAd` (`:2532`) — var olan ad set'e reklam

`POST /act_X/adcreatives`: `object_story_spec.link_data {image_hash | video_id (32 hex değilse), link
(linkUrl ?? facebook.com/page), message, name?, description?, call_to_action? {type, value: {link}}}`.
`POST /act_X/ads`: `adset_id`, `creative`, **`status: PAUSED`** (`:2574`). Reklam düşerse kreatif
siliniyor. **Form ve WhatsApp CTA'sını bilmiyor** (her zaman `{link}`); ağaç yolu `callToAction` hiç
geçmiyor `[KOD OKUMASI]`.

### 6.3. `createBoost` (`:2157-2306`) — organik gönderiyi öne çıkarma

| Sıra | Uç | Alanlar |
|---|---|---|
| 1a | Yeni kampanya (`createBoostCampaign`) | `name` (K22: `… - Boost - Kampanya`), `objective` (satırdan; ağaçta varsayılan `OUTCOME_ENGAGEMENT`), `status: PAUSED`, `special_ad_categories`, `is_adset_budget_sharing_enabled: false` |
| 1b | Var olan kampanya (K21, yalnız elle boost) | `assertReusableCampaign` (`:2432`) denetimi |
| 2 | `POST /act_X/adsets` (`buildBoostAdSetParams` `:3941`) | `name`, `campaign_id`, `billing_event: IMPRESSIONS`, `optimization_goal: POST_ENGAGEMENT`, **`destination_type: ON_POST`**, `bid_strategy: LOWEST_COST_WITHOUT_CAP`, `end_time` (gün sayısından), `targeting` (özel kategori kısıtlı; IG'de `publisher_platforms: [instagram]` + `instagram_positions: reels|stream`; `advantage_audience: 0`), `status: ACTIVE`, `daily_budget` YA DA `lifetime_budget` + `start_time` |
| 3 | Kreatif | **Instagram**: `POST /act_X/adcreatives {name, object_id: <ana FB sayfası>, instagram_user_id, source_instagram_media_id}` (`instagramCreativeBody` `:3884`) + geri okuyup doğrulama (`assertInstagramCreative` `:2486`). **Facebook**: kreatif yok, reklama `object_story_id: "{page}_{post}"` (`:2243`) |
| 4 | `POST /act_X/ads` | `name`, `adset_id`, `creative`, `status: ACTIVE` |
| 5 | Yeni kampanyadaysa `status: ACTIVE` | |
| Hata | Ters sırada `DELETE`; hata hangi adımda düştüğüyle etiketleniyor | |

`createVideoBoost` Meta'da açık hata (YouTube/Google'a özgü).

### 6.4. Yükleme

- `uploadAdImage` (`:2632`): `POST /act_X/adimages` `bytes` (base64), 120 sn; yanıttaki ilk `hash`;
  hash yoksa kalıcı hata. Hash hesap başına → `asset_platform_refs`.
- `uploadAdVideo` (`:2688`): `POST /act_X/advideos` multipart `source` + `title`, 600 sn; sonra
  `GET /{video_id}?fields=status` ile `video_status` yoklaması (2→15 sn geri çekilme, 120 sn sınır);
  `error` → kalıcı hata; zaman aşımı "hazır diyemedik" notu, hata değil.

### 6.5. Canlı kampanya aksiyonları (`applyAction` `:1419`, `copyCampaign` `:1504`)

| Aksiyon | Çağrı |
|---|---|
| pause | `POST /{id}` `status=PAUSED` |
| resume | `POST /{id}` `status=ACTIVE` (üst seviye duraklıysa yayına çıkmaz; `effective_status` farkı) |
| set_budget | `POST /{id}` `daily_budget` ya da `lifetime_budget` (minor; ≤0 reddediliyor) |
| copy | `POST /{campaign_id}/copies` `deep_copy`, `status_option=PAUSED`; ad verilmişse ikinci çağrıyla `name` (düşerse kopya duruyor, `renameError`) |

ARCHIVED ve DELETE bilerek yok (AI planı § 1b).

### 6.6. `createLeadForm` (`:3001`)

Kütüphane formu, sayfa üzerinden; geri alınamaz (Meta formu güncellemiyor). Alan eşlemeleri
(`legal_content`, `context_card`, `thank_you_page`, `is_optimized_for_quality`) belgeden, denenmedi.

---

## 7. `IAdPlatformProvider` yazma metotları (`connections/provider.types.ts:951-1371`)

| Metot | Meta | Google | LinkedIn |
|---|---|---|---|
| `canWrite(scopes)` | `ads_management` | var | — |
| `publishDraft` | ✔ (§ 6.1) | Arama kampanyası (`google-write.ts`), canlıda hiç çalışmadı | açık hata |
| `createAd` | ✔ (§ 6.2) | "henüz uygulanmadı" hata | açık hata |
| `uploadAdImage` | ✔ | "henüz uygulanmadı" (PMax'te gerekecek) | — |
| `uploadAdVideo?` | ✔ | — (opsiyonel) | — |
| `applyAction` | ✔ pause/resume/set_budget/copy | "yazılmadı" hata | — |
| `createBoost` | ✔ | "karşılığı yok — Meta özelliği" | — |
| `createVideoBoost` | hata | Demand Gen (`google-demandgen.ts`), denenmedi | — |
| `createLeadForm` | ✔ | "karşılığı yok" | — |
| Okuma yardımcıları | `searchGeoLocations`, `searchInterests`, `listSavedAudiences`, `listCustomAudiences`, `getSavedAudienceTargeting`, `fetchPageWhatsapp` | çoğu açık hata | — |

Yazılmayan yollar sessizce başarılı dönmüyor: `PlatformApiError('permanent')`. "Henüz yok" / "hiç
olmayacak" / "yapacak iş yok" üçlü ayrımı `GOAL_PLATFORM_SUPPORT`'a taşındı.

## 8. Google yazma yolu (kısa)

`google-write.ts` (saf gövde üreticileri): bütçe AYRI kaynak (`campaignBudgetBody`, `explicitlyShared:
false`) → kampanya (arama, PAUSED) → reklam grubu → anahtar kelimeler → RSA (3-15 başlık, 2-4 açıklama).
Hepsi `partialFailure: false`; adlar zaman damgalı (`DUPLICATE_NAME`). `google-demandgen.ts`: YouTube
video → Demand Gen (görsel/video varlığı, varsayılan konum TR `geoTargetConstants/2792`, yaş
segmentleri), en son yayına alma. VIDEO kampanyası API'den kurulamıyor. Testler gövdenin ŞEKLİNİ
kilitliyor (`google-write.spec.ts`, `google-demandgen.spec.ts`); canlı çağrı yok.

---

## 9. AI tarafı

### 9.1. `docs/AI-ASISTAN-PLANI.md` özeti

Hedef (kullanıcı): *"müşteri ai asistana girip kurmak istediği kampanyayı amacını bütçesini ve hedef
kitlesini belirledikten sonra sadece onaylayıp yayınlaması lazım"* + düşük performansta uyarı ve öneri
("durdur, kreatifi yenile, kitle değiştir"), *"minimum angarya maksimum performans"*.

Ölçütler: yayına kadar tur sayısı (hedef 2: istek + onay), onaysız para hareketi = 0, uyarı başına
yapılan iş.

| Karar | İçerik |
|---|---|
| K1 | Yayın onayı sohbetin İÇİNE giriyor (onay kartı), insan tıklaması kalkmıyor |
| K2 | Meta ve Google iki ayrı asistan (sözlük, bütçe modeli, seviye adları farklı) |
| K3 | Google asistanı önce salt okur |
| K4 | Uyarılar yeni platform çağrısı yapmaz, `insights_daily`'den |
| K5 | Eşik yoksa uyarı yok (hedef CPA ya da hesabın kendi medyanı) |
| K6 | Asistan önerir, kural motoru uygular ("bunu kural yap") |
| K7 | Uyarı yalnızca panel içinde (mail yok) |
| K8 | Hedef CPA Bilgi Bankası'nda |
| K9 | `client_viewer` asistanı görmez (yetki `bulk.write`) |

| Faz | Kapsam | Durum (koda göre) |
|---|---|---|
| 0 | Menüde Meta AI / Google Ads AI, platforma göre prompt | Yapıldı (`3d9ba15`) |
| 1a/1b | Yayındaki kampanyalar panelde, satırda duraklat/sürdür/bütçe | Yapıldı (`9ddff99`) |
| 1c | Toplu Oluştur'da canlı kampanyayı kaynak al → Meta `/copies` | Kod yazıldı (`d876bf2`), canlıda denenmedi |
| 2 | Sohbetten yayın (`hazirla_ve_onaya_sun` + yayın onay kartı) | **Yazılmadı**; kodda iz yok |
| 3 | Kreatif angaryası: sürükle-bırak, geçmişte işe yarayanlar | Kısmen (görseli platformdan arşive indirme bağlanmadı) |
| 4 | Performans uyarıları (6 kod: harcama var dönüşüm yok, CPA yüksek, CTR düşüyor, frekans, bütçe erken bitiyor, yayın durdu) | Yazılmadı |
| 5 | Uyarıdan asistana köprü, üç aksiyon, öğrenme evresi uyarısı | Yazılmadı |
| 6 | Google AI'yi yazmaya açmak | Yazılmadı (önkoşul canlı doğrulama) |
| 7 | Ölçüm | Yazılmadı |
| 4b | Video reklamı | Planda "yok" diyor; panelde `c9ab7c6` ile eklendi, sohbette hâlâ yok |

Plan metni bayat yerler taşıyor: FAZ 2 "onay tıklanınca var olan `ad-publisher.service.ts` koşuyor"
diyor — o servisin yayın ucu 410; bugünkü yol `draft-publish` `[KOD OKUMASI]`.

### 9.2. `docs/TASARIM-OLUSTUR.md` özeti (2026-08-16, "inşaat sürüyor" — üst bilgisi bayat)

**Teşhis (§ 2):** "Basit/Gelişmiş" bir anahtar, iki mantık değil; modüller kullanıcıya göre değil
tekniğe göre bölünmüş (elle mi, kuraldan mı, tablodan mı); elle "şu gönderiyi öne çıkar" yolu yoktu;
yayın tek yönlü kapı (yayınlanan taslak açılamıyor, kopyalanamıyor, durdurulamıyor); arayüze sızmış
dört sessiz hata (metin kaydedilmiyor, pasif düğmenin sebebi yok, sessiz `accounts[0]`, toplam bütçede
"günde" etiketi).

**Omurga (§ 4):** veri modeli tek (kampanya → ad set(ler) → reklam(lar)), yüzeyler iki (basit / uzman),
girişler üç-dört (basit, uzman, kural, tablo), tek yayın çekirdeği. Basit yüzey "Google akıllı
kampanya" gibi: 4-6 soru, platform soru değil SONUÇ, bütçe kartları + tahmini sonuç aralığı (K8 açık),
yayın sonrası ekran. Uzman yüzey: Meta terimleri aynen; dört başlangıç (yeni / mevcut kampanyaya ad
set / mevcut ad set'e reklam / kopyala) — bugün yalnız ilki var.

**Değişmeyecekler (§ 3):** `goal-mapping.ts`'in tamamı; tek yayın yolu (`resolveSpec`); kapsama paneli;
engelleyen/uyaran ayrımı; giriş anında doğrulama; boost'un taahhüt bazlı tavanı ve "kısmi boost yok";
toplu yayında PAUSED; kampanya PAUSED açılıp en sonda ACTIVE; `special_ad_categories` bilinçli.

| Karar | Sonuç |
|---|---|
| K1 tek veri modeli | Kapandı: tek ağaç |
| K2 kim hangi yüzeyi görür | **Açık** |
| K3 müşterinin yayını doğrudan mı onaya mı | **Açık** |
| K4 uzman ilk tur kapsamı | Kapandı: tek reklam grubu, çoklu kreatif (şema çoklu grubu taşıyor) |
| K5 kreatif ayrı varlık | Kapandı: evet (metin havuzu + görsel havuzu) |
| K6 menü | Kapandı: tek giriş (`/reklam-olustur`) + Akıllı Boost |
| K7 kırpma nerede | Kapandı: tarayıcıda, odak noktalı |
| K8 bütçe tahmini | **Açık** (`delivery_estimate` hiç çağrılmadı) |
| K9 `special_ad_categories` | Kapandı: müşteri kartında |
| K10 yayın sonrası | **Açık** |
| K11 eski `ad_drafts` | Emekli, silinmedi (0 satır) |
| K12 dört sessiz hatanın zamanı | **Açık** |
| K13 taslak kaç platform | Kapandı: bir taslak = bir platform, ortak grup kimliği |
| K14 Google kampanya tipi | Kapandı: Arama; PMax sonra |
| K15 desteklenmeyen hedef arayüzde | **Açık** |
| K16 elle boost hedeflemesi | Kapandı: şehir + yaş + cinsiyet + kayıtlı kitle (sonra ilgi alanı da açıldı, 2026-09-30) |
| K17 IG gönderisi boost | Kapandı: profil türüne göre dallan, doğrudan IG |
| K18 elle boost bütçesi | Kapandı: toplam göster, `lifetime_budget` gönder |
| K19 harcama emniyeti | Kapandı: aynı ekranın son satırında uyarı |
| K20 aynı gönderiye ikinci boost | Kapandı: elle yolda uyarı, canlı boost'ta kısmi tekil indeks blok |
| K21 var olan boost kampanyasına ekleme | Kapandı: yalnız elle boost'ta |
| K22 boost varlık adları | Kapandı: tek fonksiyon (`boostNameBase`/`boostNameWithLabel`) |

Google (§ 9): basit yüzeyde platform çıktı; "çeviri provider'a taşınır" (`specFor`/`supports` önerisi,
yazılmadı); kreatif birleşir kampanya birleşmez; kısmi başarı satır başına; toplanamayan metrikler
(erişim, dönüşüm) toplanmaz.

### 9.3. Kodda mevcut AI özellikleri

Model: `ANTHROPIC_MODEL` varsayılan **`claude-sonnet-5`** (`apps/api/src/config/configuration.ts:235`),
anahtar `ANTHROPIC_API_KEY` (yoksa açık 503 mesajı). İstemci `ai-assistant/anthropic-client.provider.ts`,
düz `messages.create`.

**(a) Asistan sohbeti** — `apps/api/src/modules/ai-assistant/ai-assistant.service.ts` (982)
- Tur döngüsü en fazla 8 araç turu (`MAX_TOOL_TURNS`, `:155`), `max_tokens` 8192; `max_tokens` /
  `refusal` durma sebepleri ayrı ele alınıyor.
- Sistem istemi `system-prompt.ts`: hedef sözlüğü `GOAL_META` + `GOAL_PLATFORM_SUPPORT`'tan PROGRAMATİK
  (desteklenmeyen hedef o platformun istemine hiç girmiyor); Google istemi "bugün yazma yapamıyorsun".
- Müşteri bağlamı enjeksiyon (`musteri-baglami.ts`): workspace, site, telefon (aday), Bilgi Bankası,
  marka alanları, yasal uyarı ("kelimesi kelimesine sona ekle"), metin şablonları — sordurulmuyor.
- Araç sonucu yapılandırılmış (`tool-types.ts`): `success | failed | partial | pending_confirmation`;
  model yalnız `success` görünce başarı iddia ediyor.
- Onay (`confirm`, `:413`): tek kullanımlık `confirmationId`; çift tıklamaya karşı kilit
  `ai_messages.id` birincil anahtarı (tablo append-only).

| Araç (`tools.ts`) | Katman | İzin | Çağırdığı |
|---|---|---|---|
| `resolve_client` | okuma | client.read | ClientsService |
| `list_ad_accounts` | okuma | connection.read | ConnectionsService |
| `list_draft_campaigns` | okuma | bulk.read | DraftTreeService |
| `list_live_campaigns` | okuma | bulk.read | CampaignActionsService |
| `campaign_performance` | okuma (`insights_daily`) | insights.read | — |
| `list_top_creatives` | okuma | bulk.read | CreativeService.performans |
| `list_boostable_posts` | okuma | boost.read | BoostsService |
| `boost_post` | **onay kartı** (para) | boost.approve | BoostsService → boost-executor |
| `create_creative` | yazma, platforma gitmez | bulk.write | CreativeService |
| `create_draft_campaign` | yazma, platforma gitmez | bulk.write | `DraftTreeService.createFromSimple` |
| `duplicate_draft` | yazma, platforma gitmez | bulk.write | DraftTreeService.duplicate |
| `pause_campaign` / `resume_campaign` | **onay kartı** | budget.write | CampaignActionsService |
| `update_budget` | **onay kartı** (eski → yeni) | budget.write | CampaignActionsService |

`create_draft_campaign` `kitle` geçmiyor → AI taslağı her zaman TR 18+; Marka Merkezi varsayılan
kitlesi uygulanmıyor (Hızlı Reklam uyguluyor) `[KOD OKUMASI]`. `boost_post` şehir adlarını kabul ediyor
(çözüp anahtarları saklıyor), toplam bütçe ≥ 20, 1-30 gün.

**(b) "Kitleyi tarif et"** — `ai-assistant/kitle-onerisi.service.ts` (342), uç `POST
/audience-templates/ai-oneri`. İki aşama: model metni YAPILANDIRIYOR (`output_config.format`
json_schema; `tool_choice` zorunlu değil — yeni modellerde 400), alanlar `konumlar`, `yasMin/Max`,
`cinsiyet`, `ilgiler` (kavram başına 1-4 kısa aday, TR+EN), `uygulanamayan`; sunucu her terimi Meta'nın
`adgeolocation`/`adinterest` aramasıyla gerçek kimliğe çözüyor, ilk tutan aday alınıyor ve genelleşme
yazılıyor ("lüks otomobil → otomobil"); `eslesmeyen` ve `uygulanamayan` ekranda. KAYDETMİYOR. Şemada
`minItems/maxItems` yok (canlıda 500'e yol açmıştı, 2026-10-05), sınırlar Zod'da. Meta hesabı yoksa
modele gidilmiyor. İlgi büyüklüğü "dünya geneli" etiketli.

**(c) "AI ile yaz" (reklam metni)** — `draft-tree/reklam-metni.service.ts` (282), uç `POST
/creatives/metin-onerisi`, `max_tokens` 1024. Üç alan BİRLİKTE; seçili ilk 3 görsel (JPEG/PNG/GIF/WebP,
≤4 MB) metinden ÖNCE base64; bağlam asistanla aynı kurucudan; okunabilirlik sınırları (ana metin 125,
başlık ~40); uydurma yasağı (fiyat/indirim/garanti Bilgi Bankası'nda yoksa yok); yanıt etiketli
satırlardan çözülüyor (JSON değil).

### 9.4. Plan ↔ kod çelişkileri

| Plan / belge | Kod |
|---|---|
| AI planı K1: yayın onayı sohbet içinde | `tools.ts:21` "`publish_campaign` BİLEREK YOK — yayın yalnızca panelin kendi butonundan" |
| Asistan tasarım notu: "taslak ekranına link ile yönlendirir" | Taslak ekranı yok; link salt okunur listeye gidiyor |
| AI planı FAZ 2: `ad-publisher.service.ts` koşar | O yol 410; aktif yol `draft-publish` |
| AI planı § 4b: video yok | Panelde video var (`c9ab7c6`), sohbette yok |
| DEVAM: eski yayın ucu açık | 410 |

---

## 10. `DURUM.md` ve geçmişten: bilinen sorunlar, yarım işler, kullanıcı şikâyetleri

### 10.1. Kullanıcının cümleleri (kronolojik)

- 2026-08-16: *"bu reklam oluştur mantığını tekrardan kurmamız gerekiyor böyle çok karışık, müşteri için
  ve reklamı bilen dijital pazarlama uzmanı için 2 ayrı mantık olması gerekiyor ve (google akıllı
  kampanya gibi basit) … auto boost ve toplu oluştur mantığını da değiştireceğiz"* (TASARIM-OLUSTUR).
- 2026-08-16: *"toplu oluşturma … excel dosyası tablo falan olmaz daha optimize kullanışlı olması
  gerekiyor"* → kampanya çoğaltma.
- 2026-08-16: elle boost: *"instagram gönderisini seçip hangi lokasyona … gösterileceğini seçip direkt
  boost'u yayınlayabilmem lazım"*.
- 2026-09-21: *"whatsapp - form - websitesi seçersin, sonra görselleri yüklersin, başlık ve ana metin
  girersin (ya da … yapay zekanın yazması için butona tıklarsın), bütçeyi girersin, süresiz mi belirli
  bir süre mi … seçersin ve yayınlarsın. Başka herhangi bir bilgi doldurmak istemiyorum."* (`ece6e49`)
- 2026-09-21: *"illa arşive yüklemem gerekiyorsa sekme değiştirmeyim"*; *"metinleri oluşturmak istersem
  de yapay zeka ile doldur diyeyim"* (`016e3fc`).
- 2026-09-22: *"reklam oluştur kısmı tasarım açısından çok kötü gözüküyor, … kurulum sihirbazıymış gibi
  aşama aşama ilerlememiz gerekiyor"*; WhatsApp numarasını teyit etmek istiyor (`5429f7e`).
- Asistan: *"bu asistanı yapma amacımız olabildiğince uğraşı azaltmak çok uğraştırıyor"*
  (`musteri-baglami.ts`).
- Akıllı Boost: "çok karışık ve kullanışsız" (`auto-boost/page.tsx` başlığı).
- 2026-09-29: sistemi "karmakarışık" bulup dondurdu.

### 10.2. 13 Ağustos — ilk ve tek canlı yazma denemesi (`docs/arsiv/DEVAM-2026-08.md` § 2)

| # | Hata | Sessiz mi |
|---|---|---|
| 1 | 3. adım metinsiz taslak kaydedemiyordu (görsel adımı ölü) | Hayır |
| 2 | Hata mesajı formun en altında, ekran dışında | **Evet** |
| 3 | `act_act_…` çift önek (mesaj yetki sorunu gibi okunuyor) | Hayır ama yanıltıcı |
| 4 | `is_adset_budget_sharing_enabled` eksik | Hayır |
| 5 | Form kimliği ad set'e konmuş + çok görselli yolda hiç yok — "buton hiçbir yere gitmeyen reklam" | **Evet** |
| 6 | Teklif stratejisi hesap varsayılanına bırakılmış | **Evet** |

### 10.3. Canlıda doğrulanmamış yollar (`DURUM.md` § 5)

Kampanya duraklat/başlat (orta), bütçe değiştirme (yüksek — birim hatası 1.000.000×), boost (yüksek),
toplu reklam (yüksek), Reklam Oluşturucu yayını (yüksek — `asset_feed_spec` yerleşim kuralları hiç
denenmedi), arşiv hash önbelleği (orta), Gelişmiş mod (yüksek — `bid_strategy`, `bid_amount`,
`lifetime_budget`, `start_time` hiç gönderilmedi; matris canlıda sınanmadı), kütüphane formu (yüksek,
geri alınamaz), Google arama + Demand Gen (hiç), IG boost (K17), `flexible_spec` + `advantage_audience:
0` birleşimi, kitleyle ad set kurma, şablonlu ön ayarla ilk boost.

### 10.4. Bilinen ve kabul edilmiş sınırlar

Çoklu ad set yayınlanmıyor (ağaç taşıyor, `check` engelliyor); Google'da yalnız arama; bütçe tahmini yok;
boost varyantı yok; kitle seçici ilk Meta hesabını kullanıyor; uzman mod kitle şablonu okumuyor; IG
profilinin ana sayfası eski satırlarda boş (bir kez "Hesapları yenile").

---

## 11. "Karmakarışık" — kanıtlar

| # | Kanıt | Nerede | Tür |
|---|---|---|---|
| 1 | Meta'ya yazan 7 canlı yol + 1 yetim + 1 ölü yol (§ 1.1). İki ayrı boost yolu: `boost-executor` (kota, `creating`, tavan, K22 adı, hedefleme) ve `draft-publish.publishBoost` (hiçbiri yok) | `draft-publish.service.ts:699`, `boost-executor.service.ts:358` | Aynı işi yapan iki yol `[KOD OKUMASI]` |
| 2 | Kreatif kurma mantığı iki yerde ayrışmış: `buildCreativeSpec` form/WhatsApp CTA'sını biliyor, `createAd` her zaman `{link}` ve ağaç `callToAction` geçmiyor → çoklu kreatifli form/WhatsApp kampanyasında 2.+ reklam form/WhatsApp'a bağlanmıyor, link `facebook.com/<sayfa>`; üstelik `PAUSED` açılıyor (ilki ACTIVE). 13 Ağustos'un 5. hatasının (sessiz) yeniden doğması | `meta.provider.ts:2532-2574`, `draft-publish.service.ts:658-668` | Ayrışan üretici, sessiz `[KOD OKUMASI]` |
| 3 | Görsel–yerleşim kuralları eski yolda hesaplanıyor, yeni yolda `null` → çok görselli kreatifte `asset_customization_rules: []` (görseller etiketli ama kural yok) | `ad-publisher.service.ts:148`, `draft-publish.service.ts:619`, `meta.provider.ts:4392` | Taşınırken kaybolan karar `[KOD OKUMASI]` |
| 4 | Uzman "Başlangıç" alanı ad set ayarına yazılıyor, `draft_campaigns.start_at` hiç doldurulmuyor, yayın `campaign.startAt` okuyor → `start_time` Meta'ya gitmiyor; kampanya hemen başlıyor. Test yok | `draft-tree.schema.ts` (`buildExpertTree`, `startAt` grup ayarında), `draft-tree.service.ts:178`, `draft-publish.service.ts:572` | Sessiz `[KOD OKUMASI]` |
| 5 | Toplam bütçeli uzman kampanyada kontrol özeti "günde X · N gün · toplam X×N" yazıyor (TASARIM K12 #4'ün yeni yolda sürmesi) | `draft-publish.service.ts` `check()` özet bölümü | Yalan söyleyen etiket `[KOD OKUMASI]` |
| 6 | Taslakta `creating` yok; `markPublished` düşerse `failed` → yeniden yayınlanabilir; `publishing` engellenmiyor | `draft-publish.service.ts:95, 622, 683` | Mükerrer kampanya riski `[KOD OKUMASI]` |
| 7 | Taslak çıkmaz sokak: liste salt okunur; AI "incele ve yayınla" diyor; düşen taslak yeniden denenemiyor | `draft-group-list.tsx`, `ai-asistan-sohbeti.tsx:322` | Ayrı sayfa / kopuk akış `[KOD OKUMASI]` |
| 8 | Hedeflemenin üç üreticisi vardı (boost, ön ayar, taslak); 2026-09-29'da teke indi. Ama varsayılanlar hâlâ iki: `defaultTargeting` (TR 18+) ve `DEFAULT_BOOST_TARGETING` (yalnız TR) | `meta-targeting.ts`, `meta.provider.ts:3926` | Ayrışan üretici |
| 9 | `endTimeFor` iki kopya; `toMicros`/`moneyToMicros` iki kural | `goal-mapping.ts:238`, `draft-tree.schema.ts:338, 352` | Kopya |
| 10 | Bütçe modeli: ağaç "kampanyada (CBO)" diyor, Meta'ya ad set bütçesi (ABO) gidiyor | `buildDraftTree`, `meta.provider.ts:2850-2858` | Kavram ayrışması `[KOD OKUMASI]` |
| 11 | İki çoğaltma: taslağı SQL ile kopyala (`/draft-campaigns/duplicate`) ve canlı kampanyayı Meta `/copies` ile kopyala — aynı sayfada iki panel | `toplu-olustur/page.tsx` | Aynı işi yapan iki yol |
| 12 | Beş giriş kartı (AI, Hızlı, Kampanya Kur, Toplu, Akıllı Boost) + menüde ayrıca AI Asistan alt öğeleri; Akıllı Boost'un kendisi beş yüzeyden bire indirildi | `reklam-olustur/page.tsx:128-174`, `nav-sections.ts:96-113` | Tekniğe göre bölünmüş girişler |
| 13 | Kitle şablonu: Hızlı Reklam ve boost ön ayarı okuyor; uzman mod ve AI taslak aracı okumuyor | `tools.ts` `create_draft_campaign`, `expert-builder.tsx` | Yarım entegrasyon `[KOD OKUMASI]` |
| 14 | Yetki: `bulk.publish` rol matrisinde "yayınlama" diye duruyor ama yeni yayın uçları `bulk.write` istiyor; AI taslak `bulk.write`, boost `boost.approve`, canlı aksiyon `budget.write` | `draft-tree.controller.ts:152, 169`, `rol-matrisi.ts:89` | Kapı ayrışması `[KOD OKUMASI]` |
| 15 | Hata yutma: uzman sayfası `.catch(() => [])` ×3 ("hesap atanmamış" yanlış teşhisi — Hızlı Reklam'da düzeltilmişti); giriş sayfası eski taslak listesi | `uzman/page.tsx:50-52`, `reklam-olustur/page.tsx:91` | Projenin yasakladığı desen `[KOD OKUMASI]` |
| 16 | `GOAL_PLATFORM_SUPPORT.website.google = not_yet` ama uzman modda Google arama yayını var | `draft-tree.schema.ts:87-95` | Bayat tablo |
| 17 | Ölü/yetim kod: `ad-publisher.service.ts` yayın metodu (410), `ad_drafts` (0 satır), `bulk-composer.tsx` (import yok) + `bulk` modülü uçları | § 1.1 | Kalıntı |
| 18 | Belgeler bayat: TASARIM-OLUSTUR "inşaat sürüyor 2026-08-16" ve artık olmayan `ad-wizard.tsx`'e satır numarası veriyor; AI planı ve DEVAM yukarıdaki çelişkiler | § 9.4 | Yanlış yere başlatan belge |
| 19 | Etiket hatası: `OUTCOME_LEADS` = "Potansiyel workspace" | `objective-matrix.ts:47` | Toplu yeniden adlandırma yan etkisi `[KOD OKUMASI]` |

---

## 12. Sonuç

### 12.1. Baştan yapımda korunması gereken kazanımlar

| Kazanım | Neden | Kilitleyen test |
|---|---|---|
| Amaç → objective/optimization/destination/CTA eşlemesi (§ 4.1) ve `GOAL_SPEC` tek kaynak | `LINK_CLICKS` yerine `LEAD_GENERATION`/`CONVERSATIONS`/`LANDING_PAGE_VIEWS`: sessiz para yakan seçimlerin düzeltmesi | `ad-builder/goal-mapping.spec.ts` |
| İzin listesi matrisi; uyumsuz seçenek arayüzde hiç görünmüyor; engelleyen/uyaran ayrı | Meta uyumsuz kombinasyonu KABUL edip dağıtmıyor | `ad-builder/objective-matrix.spec.ts` |
| Tek hedefleme üreticisi: konum kovaları birleşim (ülke + il yok), boş geo = TR, `age_max` 65 gönderilmez, "hepsi" cinsiyet gönderilmez, ilgiler tek `flexible_spec`, boş dizi yok | Hepsi canlıda ya da kodda yakalanmış sessiz hatalar | `boosts/meta-targeting.spec.ts`, `goal-mapping.spec.ts`, `tenancy/kitle-sablonu.service.spec.ts` |
| `advantage_audience: 0` açıkça, var olan değer ezilmez | subcode 1870227 | `boosts/advantage-isareti.spec.ts` |
| `bid_strategy` her zaman açık; `is_adset_budget_sharing_enabled` | subcode 2490487; zorunlu alan | `providers/meta-account-path.spec.ts` |
| `act_` öneki yalnız `actPath()` | Çift önek yetki hatası gibi okunuyor | `providers/meta-account-path.spec.ts` |
| Micros → minor unit tek fonksiyon (ISO istisnaları) | 1.000.000× bütçe | `providers/meta-write.spec.ts` |
| Form kimliği kreatifte `call_to_action.value.lead_gen_form_id`, ad set'te değil; form kampanyasında tek görselli kreatif | 13 Ağustos 5. hata | `providers/meta-account-path.spec.ts` (kaynak taraması: `promoted_object` form taşımıyor, CTA'da taşıyor, form → tek görsel) |
| WhatsApp: numara sorulmaz, link `api.whatsapp.com/send`, CTA `{ app_destination: 'WHATSAPP' }`, numara yayından önce gösterilir | Başka hatta düşen reklam, tarayıcıya giden buton | `providers/whatsapp-reklami.spec.ts`, panel `kampanya-kurulumu.spec.ts` |
| Kampanya PAUSED açılıp en sonda ACTIVE; hata olursa ters sırada geri alma | Yarım yapı, eksik yapılandırma reddi | Boost tarafında `providers/meta-campaign-reuse.spec.ts`; `publishDraft` sırası için ayrı test bulunamadı — yeni yapımda yazılmalı |
| Boost: `destination_type: ON_POST`; IG için `object_id` + `instagram_user_id` + `source_instagram_media_id` ve geri okuma; var olan kampanyaya ekleme denetimi; K22 ad fonksiyonu | subcode 2446383; üç kimlik uzayı | `meta-boost-adset.spec.ts`, `meta-instagram-creative.spec.ts`, `boosts/instagram-boost-guard.spec.ts`, `meta-campaign-reuse.spec.ts`, `boosts/boost-naming.spec.ts` |
| Platform çağrısı transaction dışında (`TxRunner`), `creating` ara durumu, boost'un bitiş durumu | 5 sn sınırı, mükerrer kampanya, kalıcı kilit | `boosts/boost-executor-tree.spec.ts`, `boosts/boost-completion.spec.ts`, `boosts/canli-boost.spec.ts` |
| `image_hash` hesap başına (`asset_platform_refs`), kare her zaman ilk, mükerrer yükleme içerik özetiyle diskten önce | Görselsiz reklam; yanlış oran akışta | `draft-tree/expert-tree.spec.ts`, `assets/assets.service.spec.ts` |
| Kapsama (ölçülen boyutla yuva ataması, kırpma yüzdesi), tarayıcıda kırpma | "Kırp ve yeniden yükle" deliği | `ad-builder/asset-routing.spec.ts`, `draft-tree/crop.spec.ts` |
| Video yolu: `/advideos` multipart, işlenme yoklaması, `video_data` ile `link_data` birlikte değil, giriş anında süre/ölçü, `assets_kind_chk` | Üç sessiz adım | `providers/video-reklami.spec.ts`, `ad-builder/video-probe.spec.ts`, `assets/varlik-turleri.spec.ts` |
| Metin havuzu + platform paketleme (sığmayan elenir, sebebi uyarı) | Google RSA ile Meta'nın birleştiği yer | `ad-builder/creative-texts.spec.ts`, `draft-tree/creative.service.spec.ts` |
| Özel reklam kategorisi müşteri kartında; hedefleme kısıtı tek yerde ve kontrolde söyleniyor | Hesap seviyesinde politika cezası | `draft-tree/special-category.spec.ts` |
| Zorunlu yasal uyarı tek kapıdan, kutuya yazılmadan gönderimde ekleniyor | Kullanıcı/AI silemesin | `tenancy/yasal-uyari.spec.ts` |
| Kitle şablonu: taslağa KOPYA, okunamayan kitle varsayılana düşmez, özel kitle hesabına bağlı, RLS | "İzmir" yazıp Türkiye'ye çıkmak | `prisma/kitle-sablonu-rls.spec.ts`, `providers/meta-ozel-kitle.spec.ts` |
| Çok platformlu niyet: bir taslak = bir platform, grup yayını hata fırlatmaz, düşen taraf tek başına | Kısmi başarıyı gizlememek | `draft-tree/build-draft-tree.spec.ts`, `draft-publish.service.spec.ts` |
| Ağaç RLS ve şema | Kiracı izolasyonu | `prisma/draft-tree-rls.spec.ts`, `prisma/ad-creative-rls.spec.ts`, `prisma/draft-tree-schema.spec.ts` |
| AI: araç = var olan servisin ince sarmalayıcısı; yapılandırılmış sonuç; tek kullanımlık onay kartı + PK kilidi; platforma göre süzülmüş sözlük; bağlam enjeksiyonu; 3 sohbet sınırı | "200 döndü" LLM'e karşı; çift yazma | `ai-assistant/ai-assistant.service.spec.ts`, `asistan-platformu.spec.ts`, `musteri-baglami.spec.ts`, `sohbet-sinirlari.spec.ts`, `gonderi-reklami.spec.ts`, `prisma/ai-asistan-rls.spec.ts` |
| Kitle önerisi: model kimlik üretmez, Meta'da çözülür, eşleşmeyen/uygulanamayan ekranda, kısa aday dizisi | Uydurma kimlik; sıfır eşleşme | `ai-assistant/kitle-onerisi.service.spec.ts`, `providers/meta-ilgi-alani.spec.ts` |
| Reklam metni: üç alan birlikte, görsel önce, uydurma yasağı, etiketli satır çözümü | Her işe uyan boş metin | `draft-tree/reklam-metni.spec.ts` |
| Sihirbaz UX kuralları: ilerleme görünür, ileri atlanamaz, kapalı düğmenin sebebi yazılı, odak taşınır | Erişilebilirlik, "bozuk düğme" | `components/ad-builder/sihirbaz.spec.ts` |
| Marka varsayılanları saf fonksiyonda, kullanıcının sonraki seçimini ezmez | | `components/ad-builder/marka-varsayilanlari.spec.ts` |
| Canlı kampanya listesi + satır aksiyonları, Meta `/copies` | Platformun kendi kopyası sadık | `components/ad-builder/canli-kampanyalar.spec.ts`, `providers/meta-kampanya-kopyala.spec.ts`, `campaign-actions/campaign-actions.service.spec.ts` |
| Google yazma gövdeleri: ayrı bütçe kaynağı, `partialFailure: false`, tekil adlar, PAUSED | Canlıda denenmedi ama şekil doğru | `providers/google-write.spec.ts`, `google-demandgen.spec.ts` |

### 12.2. Atılabilecek ya da birleştirilmesi gereken parçalar

**Atılabilir (ölü / yetim):**
- `ad-builder/ad-publisher.service.ts` yayın metodu, `/ad-drafts` yazma uçları, `AdDraft`/`AdDraftAsset`
  tabloları (0 satır) ve giriş sayfasındaki "Eski oluşturucu" bölümü. `goal-mapping.ts` ve
  `objective-matrix.ts` aynı klasörde duruyor — taşınmalı, silinmemeli.
- `components/bulk/bulk-composer.tsx` ve `bulk` modülünün TSV yolu (`bulk_batches`/`bulk_items`),
  `bulk-validator.ts`'in kuralları korunacaksa çoğaltma doğrulamasına taşınarak.
- `draft-publish.publishBoost` — boost'un tek yolu `boost-executor` olmalı.

**Birleştirilmeli:**
- **Kreatif kurucu tek olmalı:** `buildCreativeSpec` (form/WhatsApp/video/çok görsel) ile `createAd`
  aynı spec'ten beslenmeli; varyant reklamlar ilk reklamla aynı CTA ve durumla kurulmalı.
- **Yayın durum makinesi:** taslak yayınında da `creating` (ya da eşdeğeri) + `publishing`'i engelleyen
  kontrol + kayıt düşerse yeniden denenemez hâl; boost-executor'daki desenle aynı.
- **Hedefleme varsayılanı tek:** `defaultTargeting` ve `DEFAULT_BOOST_TARGETING` birleşmeli; kitle
  şablonu her girişte (hızlı, uzman, AI, boost) aynı fonksiyonla uygulanmalı (`grupHedeflemesi`).
- **Zaman ve para yardımcıları tek kopya:** `endTimeFor`, micros dönüşümleri.
- **Takvim/bütçe alanları tek seviyede:** başlangıç/bitiş ve bütçe kipinin modelde nerede durduğu
  (kampanya mı ad set mi) ile Meta'ya nereye yazıldığı aynı olmalı; özet metni toplam/günlük ayrımını
  doğru yazmalı.
- **Çoğaltma tek kavram:** taslak kopyası ve canlı kampanya kopyası kullanıcıya iki ayrı panel olarak
  değil, "kaynaktan yeni" tek akışı olarak.
- **Girişler:** beş kart + menü alt öğeleri yerine niyet bazlı tek giriş; AI sohbeti, Hızlı ve Uzman
  aynı taslağın üç yüzü olmalı ve taslak her yüzeyden açılıp yayınlanabilmeli (bugün bu ekran yok).
- **Yayın yetkisi:** `bulk.publish` ya kullanılmalı ya kaldırılmalı.
- **Eşleme platform arayüzüne:** TASARIM § 9.4'ün `specFor` / `supports` önerisi;
  `GOAL_PLATFORM_SUPPORT` elle tutulan bir tablo olarak bayatladı.

### 12.3. Baştan yapımdan önce cevaplanması gerekenler

- Açık tasarım kararları: K2 (kim hangi yüzeyi), K3 (müşteri yayını doğrudan mı onaya mı), K8 (bütçe
  tahmini — `delivery_estimate`), K10 (yayın sonrası ekran), K12, K15.
- AI planı K1 ile kod çelişkisi: sohbetten yayın yapılacak mı (FAZ 2), yapılacaksa hangi izinle.
- `ads_management` başvurusu ve Business Verification: hiçbir yazma yolu bunlar olmadan canlıda
  doğrulanamaz; ilk çağrı ajansın kendi hesabında, en küçük bütçeyle.
- `website` amacında `destination_type`'ın gönderilmemesi; çok görselli `asset_feed_spec`'te kural
  listesi; form kampanyasında `asset_feed_spec` içinde form alanı — üçü de belgeden kesinleşmeli.
- Kullanıcı Meta hesaplarını 2026-09-23'ten beri Meta'nın kendi Ads MCP bağlayıcısıyla da yönetiyor;
  Advetics paneli o değişiklikleri gecikmeli görüyor (bütçe bekçisi eski rakamla karar verebilir). Panel
  içi AI asistanı bunun yerine geçmiyor ama iki yazma kaynağı olduğu yeni tasarımda hesaba katılmalı.
