# AdvCampaign — SENTEZ: tek, çelişkisiz karar seti

> **Tarih:** 2026-10-07 · **Sürümler:** Meta Graph/Marketing **v25.0**, Google Ads API **v25**
> · **Girdi:** [A1 Google](arastirma/A1-google-ads-api.md), [A2 Tek panel](arastirma/A2-tek-panel-meta-google.md),
> [A3 Meta](arastirma/A3-meta-ads-api.md), `CLAUDE.md` (özellikle "Canlıda öğrenilen platform
> gerçekleri" ve "Sessiz hata" ilkeleri), [`hukumler.md`](../meta-reklam-brief/tasarim/hukumler.md),
> mevcut kod (`packages/shared/src/reklam/`, `apps/api/src/modules/reklam/`,
> `apps/api/src/modules/connections/providers/google-write.ts`, `google-demandgen.ts`,
> `google.provider.ts`). **Kod yazılmadı.**
>
> **Okuma kuralı.** Her karar `S-NN` numarası taşır ve kaynağına atıf yapar: `A1 §7.1`,
> `A2 §3.2`, `A3 Ç-3`, `CL` (CLAUDE.md), `C-27` (hukumler.md), `KOD` (dosya:satır, bu turda
> okundu). Öncelik sırası çelişkide: **canlı-depo > en güncel resmî rehber > resmî tablo/referans >
> ikincil kaynak > çıkarım.** "Belgede var" ile "canlıda çalışıyor" aynı şey değil; Google yazma
> yolu canlıda HİÇ koşmadı (CL, A1 §7).
>
> Yalnız gerçekten iş kararı olanlar sonda "Kullanıcı kararı gerektirenler" bölümünde; geri
> kalan her teknik soru burada karara bağlandı.

---

## 0. Özet (en kritik 14 karar)

1. **S-01 · Model karar vermez, kod verir.** Platform, bütçe yeri, teklif, atıf, kategori ve
   bölüşüm saf fonksiyonlardan gelir; model niyeti kapalı listeden seçer, metni yazar, gerekçeyi
   anlatır, eksik alanı sorar. (A2 §3.1, §4.1; `ai-taslak.ts` sözleşmesi korunur.)
2. **S-02 · Varsayılan TEK platform.** İkinci platform yalnız sonuç başı maliyet BİLİNDİĞİNDE ve
   iki platformun da öğrenme eşiği karşılanıyorsa önerilir; hiçbir zaman seçili gelmez. (A2 §3.2–3.3)
3. **S-03 · Google üç kapılı açılır:** `kapali` → `kapali_kur` (PAUSED kur + geri oku) → `ac`.
   Her kapı bir canlı ölçümle açılır (§8). AdvCampaign'in "aynı sohbetten Meta ve Google" hedefi
   C-19 §3 / C-51'in "Google'da AI salt okur" hükmünü KALDIRMAZ, onu bir açılış koşuluna çevirir.
4. **S-04 · Mevcut Google yazma kodu olduğu gibi çalışamaz:** iki kesin kırılma (`startDate/endDate`
   v23'te kalktı; `containsEuPoliticalAdvertising` zorunlu) ve bu turda bulunan üçüncü: **Arama
   kampanyası konum ve dil ölçütü olmadan kuruluyor → bütün dünyada yayın** (`google.provider.ts`
   `publishDraft`, bkz. D-G3). Google yolu tek atomik `googleAds:mutate` ile yeniden yazılır.
5. **S-05 · Google'da her sessiz varsayılan açıkça yazılır:** konum `PRESENCE`, dil Türkçe, ağ
   ayarları, AI Max kapalı, AB siyasi beyan, teklif, bütçe teslimi. (A1 §2.2, §4.2; A2 Ö7)
6. **S-06 · Meta'da kapatamadığımız Advantage+ creative özellikleri dürüstçe söylenir.** "Görseli
   ve metni değiştirmesi kapalı" cümlesi kaldırılır; geri okuma bu özellikleri "bilinen,
   kapatılamayan" sınıfına ayırır ve yalnız ÜRETKEN/tanımsız `OPT_IN` yayını durdurur. (A3 Ç-1, Ç-2)
7. **S-07 · Atıf penceresi niyet başına.** Dönüşüm/lead optimizasyonunda ajans standardı; LPV,
   sohbet, arama ve erişimde açıkça `1 gün tıklama`. (A3 §2.3, Ç-3; C-22 §2)
8. **S-08 · "ARAMA" niyeti `TELEFON` olarak yeniden adlandırılır** (iç kod + ekran adı); "arama"
   kelimesi yalnız Google Arama'yı anlatır. Tablolar henüz deploy olmadığı için bedeli sıfıra yakın
   (`niyet_kodu` VARCHAR, enum değil). (A2 Özet 10, Ö3)
9. **S-09 · "Sitemden satış ya da kayıt" ikiye bölünür:** `SATIS` (OUTCOME_SALES, PURCHASE ailesi)
   ve `SITE_KAYIT` (OUTCOME_LEADS + OFFSITE_CONVERSIONS + LEAD ailesi). (A3 §2.2, Ç-4)
10. **S-10 · Dönüşüm sayıları platformlar arasında asla toplanmaz;** ortak tek sayı Advetics'in
    kendi saydığı sonuçtur. (A2 §2.4)
11. **S-11 · Platformlar arası bütçe kaydırma OTOMATİK değil;** yalnız öneri kartı, haftada en çok
    bir, ±%20, ortak ölçüt yoksa hiç. (A2 §3.3)
12. **S-12 · Ajana uygulayan araç verilmez:** Meta `POST /recommendations`, Google
    `ApplyRecommendation`, otomatik uygulama aboneliği, politika muafiyeti, silme/REMOVED. (A3 §5.2,
    A1 §5.3, §6.1; R5 B5.3)
13. **S-13 · Prova iki platformda aynı söz, ayrı mekanizma;** "hazır" platform başına yazılır. Google
    provası yayınla AYNI işlem listesinin `validateOnly: true` hâlidir. (A1 §5.1, A2 §4.2)
14. **S-14 · MVP:** Meta FORM + SITE (görsel ve video) + WHATSAPP (ölçüm sonrası); Google SITE
    (Arama + Maksimum tıklama) kapı kapı. PMax, Demand Gen, Google lead form, telefon, erişim,
    otomatik kaydırma MVP'de yok (§9).

---

## 1. Çelişki çözümleri

### 1.1 Araştırmalar arası (A1 ↔ A2 ↔ A3)

| No | Çelişki | Kaynaklar | Hüküm | Gerekçe |
|---|---|---|---|---|
| S-15 | Google'da WhatsApp: A2 "karşılığı yok → `hic_olmayacak`", A1 "`BusinessMessageAsset` var ama allowlist arkasında" | A1 §4.4, A2 §2.2 | **Koşullu-kapalı.** MVP'de Google WhatsApp yok; niyet tek platformlu (Meta) doğar ve sohbet bunu ilk turda söyler. Allowlist alınırsa (kullanıcı kararı K-05) Faz 3 adayı. `wa.me` son URL'li Arama reklamı **asla** kurulmaz. | Allowlist ürün dışı bir izin; varsayılan akışa konamaz. `wa.me` yolu Meta'da öğrenilen "yazılan numara ile sayfadaki numara ayrışır, başka hatta düşer" hatasını Google'a taşır (CL CTWA). |
| S-16 | Google lead form: A2 "kanıt yok", A1 "`LeadFormAsset` var, uygunluk eşiği var", `createLeadForm` yorumu "karşılığı YOK" | A1 §4.3, §7.5; A2 §2.2 | **Koşullu-var, MVP dışı.** FORM niyeti MVP'de yalnız Meta. Google lead form Faz 2'de, yalnız (a) hesap uygunluğu okunursa ya da oluşturma hatası teşhis edilebilirse ve (b) dönüşüm teklifiyle; uygun değilse `emptyReason` ile "Google bu hesapta form reklamına izin vermiyor: <sebep>". `createLeadForm` yorumu düzeltilir (D-G9). | Uygunluk ≥1.000 USD harcama + politika geçmişi istiyor; manual CPC ile çalışmıyor; Türkiye desteği belgede yok (A1 §11 S6). |
| S-17 | Demand Gen bütçe eşiği: A1 "günlük ≥ 15 × tCPA", A2 "10× (2026-08)" | A1 §2.4, A2 §3.2 | **15× kullanılır** (uyarı eşiği). Google'ın güncel yardım sayfasından doğrulanınca sabit tek yerden değişir. | Resmî rehber (A1) ikincil haberden (A2 S17) önce gelir; ayrıca yüksek eşik "öğrenemeyen kampanya açma" riskini küçültür. DG zaten MVP dışı. |
| S-18 | `positive_geo_target_type` varsayılanı: A2 "PRESENCE_OR_INTEREST varsayılan", A1 "belge iki yerde iki şey diyor" | A1 §4.2, §11 S9; A2 §2.1 | Fark etmez: **her Google kampanyasına `PRESENCE` açıkça yazılır ve geri okunur.** Mevcut kampanyaları okurken değer raporlanır. | "Platformun varsayılanına güvenme" (CL). Yerel işletmenin parası "İzmir'e ilgi duyan Almanya'daki kullanıcı"ya gider; Meta'daki kova birleşimi hatasının kardeşi. |
| S-19 | AI Max: A2 "2026-09-01'den beri bazı Arama kampanyaları otomatik geçiyor", A1 "`enable_ai_max` alanı; `aca_migration_date_time`" | A1 §2.2, §9.2; A2 §1.3 | **`aiMaxSetting.enableAiMax = false` açıkça yazılır,** geri okunur; yönetim ekranı `aca_migration_date_time` ve `broad_match_migration_date_time`'ı izler ve dolarsa uyarı kartı açar. | Açıkça kapalı yazılmış kampanyanın da taşınıp taşınmadığı bilinmiyor (A1 §11 S13) → izleme şart. |
| S-20 | Prova: A2 "Meta nesne başına, Google tek istek", A3 "`/adsets` + `campaign_spec` 5xx" | A2 §4.2, A3 §4.1, KOD `prova.ts:79` | Meta: kampanya provası + **reklam provası (`adset_spec` içinde)**; ayrı `/adsets` provası 3 alana indirilip ölçülür (Ö-M3), 5xx sürerse KALDIRILIR. Google: tek `googleAds:mutate` + `validateOnly`. | `/ads` + `adset_spec` belgelenmiş yol (A3 D10) ve canlıda geçiyor (513926a). Satır içi `campaign_spec` belgede yalnız `name/objective/buying_type`. |
| S-21 | Lead formu Google'da uygunluk sinyali yok; Meta'da `QUALITY_LEAD` CAPI istiyor | A1 §4.3; A3 §2.2 | FORM'da Meta optimizasyonu **`LEAD_GENERATION`** (CAPI'siz çalışan); `QUALITY_LEAD` Faz 3 (CRM→CAPI kurulunca). | Nisan 2026'dan beri CAPI'siz yeni kampanyada `QUALITY_LEAD` seçilemiyor (A3 §2.2). |
| S-22 | Meta günlük bütçe esnekliği: eski belgeler %25, A3 %75 | A3 §1.4, C-33 | **%75** ve haftalık tavan 7×. Onay kartı bunu cümleyle söyler. | v24 changelog (A3 D4) en güncel resmî kaynak. |
| S-23 | Atıf: Meta 7g tık + 1g gör; Google 30g tık veri odaklı; Meta 7g/28g görüntüleme 2026-01'de kalktı | A2 §2.1, §2.4; A3 §2.3 | Atıf **platform başına ayrı gösterilir**, sabitten türeyen etiketle; Meta'da niyet başına (S-07), Google'da dönüşüm işleminden OKUNUR ve gösterilir, yazılmaz (dönüşüm işlemine yazmak hesap ayarı değiştirmektir). | A2 Açık soru 6'nın teknik cevabı: hesap ayarı ajana/sisteme verilmez. |

### 1.2 Belge ↔ canlı-depo

| No | Çelişki | Hüküm | Kaynak |
|---|---|---|---|
| S-24 | Advantage+ creative: belge ~15 küçük harfli özellik (`adapt_to_placement` varsayılan açık), canlı yalnız 7 BÜYÜK HARFLİ anahtar kabul ediyor | **Canlı kazanır**: `TANINAN_OZELLIK_ANAHTARLARI` aynen kalır. Ama belgenin "varsayılan açık" dediği özellikler kapatılamıyor kabul edilir ve S-41 sınıflandırmasıyla yönetilir. Küçük harfli anahtarın bağımsız `/adcreatives` ucunda kabul edilip edilmediği ayrıca ölçülür (Ö-M2); kabul edilirse kapatılır. | A3 §1.5, Ç-1, Ç-2; CL; f6e7f70 |
| S-25 | `PHONE_CALL` `destination_type` yazma enum'unda yok, ODAX tablosu ve Arama rehberi kullanıyor | Canlıda `validate_only` ile denenmeden `TELEFON` niyeti derlenmez (zaten tur 2). Rehberin `bid_amount` ve elle yerleşim örneği bağlayıcı sayılmaz; önce yerleşimsiz + `LOWEST_COST_WITHOUT_CAP` denenir, reddedilirse sebep kaydedilir. | A3 §2.2, Ç-5, Ö-4; C-41 |
| S-26 | Instagram mesaj ve çok kanallı mesaj Lead amacında var mı | **Yok** (yalnız Etkileşim/Satış/Trafik). Katalog zaten Etkileşim'de; Lead'e taşınmaz. | A3 §2.2, Ç-6 |
| S-27 | WhatsApp için Lead amacında hangi hedef | **Yalnız `CONVERSATIONS`.** Katalog doğru; `advantage_state_info` `ADVANTAGE_PLUS_LEADS` dönüyor mu ölçülür (Ö-M6). | A3 §2.2, C-41 |
| S-28 | `learning_stage_info` belgesi varsayılan atıfı "1g gör + 28g tık" diyor | Bayat; yok sayılır. Atıf geri okumada `attribution_spec`'ten okunur. | A3 §2.3 |
| S-29 | PAC belgesi `reels` içermiyor, `video_feeds` (v24'te kalktı) içeriyor | Acemi'de/AI'da PAC yok (C-26 güçlendi). Video tek dosya: 9:16 önerilir, akıştaki kırpma önizlemede gösterilir. | A3 §3.3 |

### 1.3 Mevcut kod ↔ belge/karar

| No | Çelişki | Hüküm | Kaynak |
|---|---|---|---|
| S-30 | `ai-taslak.ts` `AI_NIYETLERI = FORM, WHATSAPP, SITE, SATIS`, derleyici yalnız FORM ve SITE derliyor | Modelin seçebileceği niyet listesi **derlenebilir niyetlerden TÜRETİLİR** (tek kaynak). Derlenemeyen niyet modelin şemasında olmaz; kullanıcı onu isterse model "bu amaç henüz açık değil" der ve en yakın açık niyeti ÖNERİR (sessizce çevirmez). | KOD `ai-taslak.ts:33`, `derle.ts` `DERLENEN_NIYETLER`; CL "aynı süzgeci iki yerde yazma" |
| S-31 | Model sistem istemi "Meta (Facebook/Instagram) reklam taslağı" diyor | İki platformlu akışta da model **platform seçmez**; istem platformdan bağımsız kalır, platform `platform_oner` çıktısı olarak bağlama girer. Başlık sınırı platforma göre (Meta 40, Google RSA 30) paketleyicide uygulanır, modelde değil. | A2 §4.8; A1 §2.2 |
| S-32 | `google-write.ts` başlığı "PAUSED açılıyor ve PAUSED kalıyor; açmak ajansın işi" | S-03'ün `kapali_kur` kapısı tam bu davranış; `ac` kapısı ölçüm sonrası ayrı uçla gelir (`status` + `updateMask`). | A1 §5.2; C-51 |
| S-33 | `google-write.ts` `manualCpc` + reklam grubunda `cpcBidMicros` zorunlu | Acemiye tavan teklif sorulmaz. SITE için **Maksimum tıklama (`targetSpend`)**, tavan ancak Gelişmiş'te (`cpcBidCeilingMicros`). | A1 §3; CL "hedef kullanıcı reklamcılık bilmiyor" |
| S-34 | TASARIM T-4 "AI Google'da salt okur" ↔ AdvCampaign "aynı sohbetten iki platform" | Daha yeni kullanıcı kararı (2026-10-07) kazanır; T-4'ün gerekçesi (canlıda doğrulanmamış yazma) S-03 kapılarıyla korunur. | A2 Açık soru 1; C-19, C-51 |

---

## 2. Niyet kataloğu v2

### 2.1 İlkeler

- **S-35** Katalog tek kaynak (`niyetler.ts`); her satıra `google` alt nesnesi eklenir, Meta'daki gibi
  `kanit: 'belge' | 'canli'` ve `tur` taşır. Acemi'de yalnız `kanit: 'canli'` satır görünür (mevcut
  kural Google'a da uygulanır). (A2 §2.2, §4.8)
- **S-36** Her satırın üç kovası var: **açık** (canlıda doğrulandı), **koşullu** (ön koşul
  sağlanırsa açılır; sağlanmıyorsa kart görünür ama kapalıdır ve sebebini yazar), **hiç** (o
  platformda karşılığı yok; sohbet ilk turda söyler). (A2 §2.2 kural)
- **S-37** Sonuç etiketi `objective`'ten değil optimizasyon hedefinden (Meta) / kampanya
  türü+teklifinden (Google) türer. (C-41, `sonucEtiketi`)

### 2.2 Acemi niyetleri × platform

Tur: **1** = MVP (canlı ölçülür, düşük risk) · **2** = Faz 2 · **3** = Faz 3 · **hiç**.

| Kod (v2) | Ekran adı (acemi dili) | Meta | Tur M | Google | Tur G | Ön koşul |
|---|---|---|---|---|---|---|
| `FORM` | Form doldursunlar | `OUTCOME_LEADS` · `LEAD_GENERATION` · `ON_AD` · `page_id` · CTA `SIGN_UP` + `lead_gen_form_id` | **1** | Arama + `LeadFormAsset`, MaxConv (lead form hedefi) | 2 (koşullu) | Meta: sayfa, KVKK aydınlatma adresi (C-10). Google: uygunluk + gizlilik URL'si + dönüşüm teklifi |
| `WHATSAPP` | WhatsApp'tan yazsınlar | `OUTCOME_LEADS` · `CONVERSATIONS` · `WHATSAPP` · `page_id` · CTA `WHATSAPP_MESSAGE` + `app_destination: WHATSAPP`, bağlantı sabit `https://api.whatsapp.com/send`, **Türkçe `page_welcome_message`** | **1** (Ö-M7 sonrası) | `BusinessMessageAsset` | **hiç** (K-05'e kadar) | Sayfaya bağlı WhatsApp numarası; numara SORULMAZ (CL CTWA) |
| `SITE` | Siteme gelsinler | `OUTCOME_TRAFFIC` · `LANDING_PAGE_VIEWS` · `WEBSITE` · CTA `LEARN_MORE` | **1** | Arama · Maksimum tıklama · RSA · PHRASE anahtar kelime · konum PRESENCE | **1** (kapı kapı, S-03) | https adres; Google'da ≥1 anahtar kelime (anahtar kelimesiz Arama hiç harcamaz, CL) |
| `SATIS` | Sitemden satış gelsin | `OUTCOME_SALES` · `OFFSITE_CONVERSIONS` · `WEBSITE` · `pixel_id` + `PURCHASE` (ya da `INITIATE_CHECKOUT`/`ADD_TO_CART` alt basamak) · reklamda **`conversion_domain`** | 2 | PMax (feed yoksa standart) · MaxConv/MaxConvValue | 3 | Meta: C-39 üç katlı kapı (piksel paylaşılmış, olay son 7 gün, alan adı). Google: birincil dönüşüm işlemi + son 7 günde dönüşüm |
| `SITE_KAYIT` *(yeni)* | Sitemden başvuru/kayıt gelsin | `OUTCOME_LEADS` · `OFFSITE_CONVERSIONS` · `WEBSITE` · `pixel_id` + `LEAD`/`COMPLETE_REGISTRATION`/`CONTACT`/`SCHEDULE`/`SUBMIT_APPLICATION` · `conversion_domain` | 2 | Arama · MaxConv (dönüşüm işlemi "lead" kategorisinde) | 3 | Aynı ölçüm kapısı |
| `TELEFON` *(eski `ARAMA`)* | Beni telefonla arasınlar | `OUTCOME_LEADS` · `QUALITY_CALL` · `PHONE_CALL` (ölçülecek) · CTA `CALL_NOW` + `tel:+90…` | 2 | Arama + `CallAsset` · Maksimum tıklama | 2 | Numara Marka Merkezi'nde bir kez; hedef ülkeyle aynı ülke kodu (A3 Ç-5); Meta kitle 18+ |
| `ERISIM` | Bölgemde çok kişi görsün | `OUTCOME_AWARENESS` · `REACH` · `frequency_control_specs` açıkça | 2 | Demand Gen görsel · Maksimum tıklama | 3 | Google: DG eşiği (S-17), logo + işletme adı |
| `VIDEO_IZLENME` *(yeni)* | Videom izlensin | `OUTCOME_AWARENESS` · `THRUPLAY` | 3 | Demand Gen video (YouTube kimliği; `YouTubeVideoUpload`) | 3 | Video; Google'da "görüntüleme başına ödeme" denmez (A1 §4.1) |
| `IG_MESAJ` | Instagram'dan mesaj atsınlar | `OUTCOME_ENGAGEMENT` · `CONVERSATIONS` · `INSTAGRAM_DIRECT` | 2 | — | hiç | Bağlı IG profesyonel hesap |
| `MESSENGER` | Messenger'dan yazsınlar | `OUTCOME_ENGAGEMENT` · `CONVERSATIONS` · `MESSENGER` | 3 | — | hiç | — |
| `COK_KANAL_MESAJ` | Nereden olursa yazsınlar | `OUTCOME_ENGAGEMENT` · `CONVERSATIONS` · `MESSAGING_*` + `asset_feed_spec.optimization_type = DOF_MESSAGING_DESTINATION` | 3 | — | hiç | Kanal başına bağlı hesap |
| `ONE_CIKAR` | Paylaşımımı öne çıkar | Akıllı Boost'a yönlendirme | yönl. | — | hiç | — |

Gelişmiş-yalnız satırlar (`WHATSAPP_CAGRI` Etkileşim zorunlu, `SITE_MESAJ` `message_extensions`,
`YEREL_YARICAP`) değişmez; `SITE_MESAJ` eklenti alanı katalogda olmadan derlenmez (A3 Ç-8).

### 2.3 Google satırlarının ayrıntısı (MVP: yalnız SITE)

| Alan | SITE (Faz 1) | TELEFON (Faz 2) | FORM (Faz 2, koşullu) |
|---|---|---|---|
| `advertisingChannelType` | `SEARCH` | `SEARCH` | `SEARCH` |
| Teklif | `targetSpend: {}` (Maksimum tıklama) | `targetSpend` → dönüşüm gelince öneri kartıyla MaxConv | `maximizeConversions` (lead form hedefi) |
| Ağ | `targetGoogleSearch: true`, ortaklar/Display/partner `false` | aynı | aynı |
| Anahtar kelime | 5–20, `PHRASE`; taban negatif liste | aynı | aynı |
| Reklam | RSA: 8–15 başlık (≤30 kr, en az 3), 4 açıklama (≤90 kr, en az 2), `path1/path2` ≤15 | RSA + `CallAsset` (`country_code: TR`) | RSA + `LeadFormAsset` |
| Zorunlu | konum + dil ölçütü, `PRESENCE`, AI Max `false`, AB siyasi beyan, `startDateTime` | + numara | + `privacy_policy_url`, uygunluk |

### 2.4 Atıf niyet başına (S-07)

| Optimizasyon hedefi (Meta) | Yazılan `attribution_spec` | Raporda etiket | Not |
|---|---|---|---|
| `OFFSITE_CONVERSIONS` (SATIS, SITE_KAYIT) | Ajans standardı (`tik7_gor1` / `tik7`) | "Meta'nın saydığı · <standart>" | Referans tablo bu birleşimi açıkça destekliyor (A3 D7) |
| `LEAD_GENERATION` (FORM) | Ajans standardı | aynı | Prova canlıda geçti ama normalleştirme bilinmiyor → Ö-M4 ile doğrulanır; reddedilir/normalleşirse `tik1`e düşer ve söylenir |
| `LANDING_PAGE_VIEWS`, `CONVERSATIONS`, `QUALITY_CALL`, `REACH`, `THRUPLAY` | **`tik1` açıkça** (`CLICK_THROUGH 1`) | "Meta'nın saydığı · 1 gün tıklama" | Belge: "diğer bütün birleşimlerde yalnız 1 gün tık" (A3 §2.3). Ölçüm Ö-M4 gönderilmeme seçeneğini de dener; ret görülürse alan bu satırlarda gönderilmez ve manifesto satırı "platform belirliyor" olarak işaretlenir |

`tik1` ajansın seçebileceği bir standart DEĞİL; `ATIF_STANDARTLARI` yerine niyet satırına bağlı
`ATIF_KURALI` sabiti gelir: `{ hedef → 'ajans_standardi' | 'tik1' }`. Rapor etiketi bu sabitten
türer (CL "kullanıcıya gösterilen sınır sabitten türemeli").

---

## 3. Platform seçim algoritması

### 3.1 Girdi sinyalleri (hepsi ölçülür, model tahmin etmez)

| Sinyal | Nereden | Bilinmiyor hâli |
|---|---|---|
| `hesaplar` | Workspace'e atanmış Meta/Google reklam hesabı + `sync_enabled` | Hesap yok = platform uygun değil |
| `yazmaKapisi` | `metaYazmaAcikMi`, (yeni) `googleYazmaKapisi` ∈ `kapali / kapali_kur / ac` | Okunamazsa `kapali` (mevcut kural) |
| `niyetKarsiligi` | Katalog `tur` + `kanit` | — |
| `olcum` | Meta: piksel paylaşımı, `event_last_fired_time`; Google: birincil dönüşüm işlemi + son dönüşüm tarihi | Üç hâlli (`true/false/null`); `null` = "kontrol edemedik" (CL RLS üç hâl dersi) |
| `aramaHacmi` | `KeywordPlanIdeaService.GenerateKeywordIdeas` (TR, `languageConstants/1037`) | Erişim Explorer ise ya da çağrı düştüyse `bilinmiyor` + `bos_neden` |
| `kreatif` | Taslak: görsel / video / yalnız metin | — |
| `cpa` | Advetics geçmişi: aynı workspace, aynı niyet, aynı platform, son 90 gün, ≥ 20 sonuç | Yoksa `null` (sektör ön ayarı KULLANILMAZ: uydurma CPA eşiği kesinlik gibi sunar, A2 §3.2) |
| `butce` | Kullanıcının yazdığı tutar | — |
| `kullaniciPlatformu` | Kullanıcı açıkça "Google'da" / "Instagram'da" dedi mi (model çıkarır, `ai_onerisi` kaynağıyla) | — |

### 3.2 Kurallar (S-38) — saf fonksiyon `platformOner()`

A2'nin K1–K9'u altı adıma indi; sıra bağlayıcıdır, ilk sonuç veren adım kazanır.

1. **Uygunluk süzgeci.** Platform uygun = hesap var ∧ yazma kapısı `kapali` değil ∧ niyetin o
   platformda karşılığı açık (tur ≤ mevcut faz, `kanit: canli`) ∧ ölçüm ön koşulu `true`.
   Her elenen platform için sebep kodu üretilir (`HESAP_YOK`, `KAPI_KAPALI`, `KARSILIK_YOK`,
   `OLCUM_YOK`, `OLCUM_BILINMIYOR`). (A2 K1, K6)
2. **Tek uygun platform** → o. Sıfır uygun → taslak açılır ama yayın kapalı, sebepler listelenir.
3. **Kullanıcı açıkça platform istediyse** ve uygunsa → o. Uygun değilse → sebebi söyle, uygun
   olanı öner; **sessizce başka platforma ya da başka niyete çevirme.** (A2 §2.2 kural)
4. **Niyete göre birincil** (iki platform da uygunsa):
   - Meta-only niyetler (WHATSAPP, IG_MESAJ, …) zaten 1. adımda tek platforma düşer.
   - `TELEFON` ve sektör bayrağı "acil yerel hizmet" → **Google** (A2 K5).
   - `SITE`, `FORM`, `SATIS`, `SITE_KAYIT`: `aramaHacmi` ölçüldü ve eşik üstü → **Google**;
     ölçüldü ve eşik altı → **Meta**; `bilinmiyor` → **Meta** + not "Google için arama hacmi
     ölçülemedi" (A2 K2, K3). Gerekçe: Meta yolu canlıda doğrulanmış tek yol; bilinmeyen sinyalle
     doğrulanmamış yola gitmek iki riski üst üste koyar.
   - Kreatif yalnız metin (görsel/video yok) → **Google** (Arama metin reklamı), Meta'ya görsel
     gerekir (A2 K4'ün tersi).
   - `ERISIM`, `VIDEO_IZLENME` → **Meta** (A2 K7).
5. **İkinci platform önerisi** yalnız: `cpa` iki platform için de biliniyor ∧ `butce ≥
   esik(birincil) + esik(ikincil)` (§3.3). Öneri seçili gelmez; kart "iki platformu birden açarsan
   ikisi de öğrenme aşamasından çıkamayabilir" cümlesini eşik sağlanmadıysa yazar. (A2 K9, §3.3)
6. **Hassas kategori** (konut, istihdam, finans, sağlık): platform seçimini değiştirmez; her platform
   kendi kural paketiyle derlenir, yurt içi sağlık iki platformda da ENGEL (C-2). (A2 K8)

Arama hacmi eşiği: **ayda ≥ 1.000 toplam arama (ilk 20 fikrin toplamı, TR, Türkçe)** başlangıç
değeri; tek sabitte, ölçüm turunda (Ö-G6) gözden geçirilir. Teknik bir eşik: yanlışsa yalnız
varsayılanı değiştirir, kullanıcı 3. adımla her zaman ezer.

### 3.3 Bütçe eşikleri (S-39)

| Platform / tür | Eşik (sabit `OGRENME_ESIKLERI`) | Kaynak |
|---|---|---|
| Meta reklam seti | günlük ≥ 50 × CPA / 7 | A2 §3.2 (S15) |
| Google Arama · Maksimum tıklama | resmî taban yok → eşik uygulanmaz | A1 §3, A2 §3.2 |
| Google PMax | günlük ≥ 3 × CPA | A2 §3.2 (S16) |
| Google Demand Gen (tCPA) | günlük ≥ 15 × CPA | S-17 |
| Platformun kendi alt sınırı | Meta `GET /act_X/minimum_budgets` (para birimine göre; ölçülecek, Ö-M9) · Google bilinmiyor (A1 §11 S16) | — |

`cpa = null` iken eşik **hesaplanmaz ve gösterilmez**; tek platformla başlanır ve kart "iki hafta
sonra ilk sonuçlarla ikinci platformu birlikte değerlendirelim" der. Eşik "uyarı"dır, "engel"
değil; kullanıcı altında kalmayı seçebilir (R2 Ö6).

### 3.4 Kullanıcıya anlatım (S-40)

- Cümle **sunucunun ürettiği gerekçe kodlarından** kurulur; model yalnız akıcılaştırır, yeni gerekçe
  ekleyemez. Kalıp: *"Bu reklamı Instagram ve Facebook'ta açıyorum. Sebep: <gerekçe>. Google'ı
  şimdilik açmıyorum çünkü <sebep>."*
- Gerekçe sözlüğü örnekleri: `HACIM_YUKSEK` "İnsanlar bunu Google'da arıyor (ayda yaklaşık N
  arama)", `HACIM_BILINMIYOR` "Google'da ne kadar arandığını ölçemedim", `META_ONLY` "WhatsApp
  mesajı yalnız Meta reklamlarında olur", `ESIK_YOK` "Bütçe iki platformu birden öğretmeye
  yetmiyor", `OLCUM_YOK` "Sitende satış ölçümü kurulu görünmüyor".
- Arama hacmi sayısı yalnız ölçüldüyse yazılır; "çok aranıyor" gibi ölçüsüz cümle yasak (A2 §4.7).

---

## 4. "En optimize kurulum" varsayılanları

### 4.1 Meta (S-41)

| Katman | Varsayılan | Kaynak |
|---|---|---|
| Yapı | 1 kampanya · 1 reklam seti · 1–5 reklam (kavram) | A3 §1.6; C-36 |
| Bütçe | Kampanyada (CBO), `daily_budget` ya da `lifetime_budget` (toplamda bitiş zorunlu); `is_adset_budget_sharing_enabled` GÖNDERİLMEZ | C-31; A3 §1.4 |
| Teklif | `bid_strategy: LOWEST_COST_WITHOUT_CAP` açıkça | A3 §1.1 |
| `billing_event` | `IMPRESSIONS` | A3 §2.2 |
| Kitle | `advantage_audience: 1` açıkça; konum zorunlu (C-45); `age_min: 18`, `user_age_unknown: false`; `age_max` yazılmaz; yaş/cinsiyet tercihi öneri | A3 §1.2; C-8, C-9 |
| Yerleşim | Alan gönderilmez (Advantage+ yerleşim) | A3 §1.3 |
| Kreatif otomasyonu | 7 tanınan anahtar `OPT_OUT`; `contextual_multi_ads: OPT_OUT`; kapatılamayanlar §4.2 | C-27; S-24 |
| Atıf | Niyet başına (§2.4) | S-07 |
| Takvim | `start_time` hesabın saat dilimi ofsetiyle; toplam bütçede `end_time` | `derle.ts` |
| Durum | `PAUSED` kur → geri oku (`advantage_state_info`, `IN_PROCESS` bekle, `issues_info`) → aç | A3 §4.1, Ç-9, Ç-14 |
| Beklenen Advantage+ durumu | FORM/WHATSAPP/SITE_KAYIT/TELEFON → `ADVANTAGE_PLUS_LEADS`; SATIS → `ADVANTAGE_PLUS_SALES`; diğerleri karşılaştırılmaz, rozet gösterilmez | A3 §1.1, §1.6 |
| Konum AB ise | MVP'de sıfır çağrılı RET ("AB'de yayın için DSA alanları henüz yok") | A3 §4.2 |

### 4.2 Meta'da kapatılamayan kreatif özellikleri — çözüm (S-42)

Sorun: belge `adapt_to_placement`, `text_optimizations`, `image_touchups`, `inline_comment`,
`video_auto_crop`, `image_template` özelliklerini varsayılan açık sayıyor; canlıda bunları kapatan
anahtarı gönderemiyoruz. Bugün iki ayrı hata var: (a) `derle.ts` kullanıcıya "kapalı" diyor (yalan
olabilir), (b) `yanki.ts` tanınmayan herhangi bir `OPT_IN`'de yayını durduruyor (her yayın
kilitlenebilir). (A3 Ç-1, Ç-2)

Çözüm dört parçalı:

1. **Üç sınıflı anahtar sözlüğü** (`KREATIF_OZELLIK_SINIFLARI`, tek sabit):
   - `kapatildi`: 7 tanınan anahtar (gönderiyoruz, geri okumada `OPT_OUT` beklenir; değilse FARK).
   - `bilinen_kapatilamayan`: üretken OLMAYAN uyarlama (`adapt_to_placement`, `image_touchups`,
     `video_auto_crop`, `inline_comment`, `text_optimizations`*). Geri okumada `OPT_IN` dönerse
     yayın DURMAZ; kayda ve onay kartının "Meta'nın otomatik yaptıkları" bloğuna yazılır.
   - `uretken_ya_da_tanimsiz`: diğer her anahtar (`add_text_overlay`, `creative_stickers`,
     arka plan/genişletme/müzik/metin üretimi ve listede olmayan her şey). `OPT_IN` → yayın DURUR
     (bugünkü davranış bu sınıfa daralır).
2. **Ekran metni dürüst olur:** "Kapattıklarımız: başka markalarla yan yana gösterim, görseli
   hareketlendirme, metin çevirisi, …" (yalnız gerçekten gönderdiklerimiz) + "Meta'nın otomatik
   yaptıkları: görseli yerleşime göre kırpabilir, parlaklık/kontrast düzeltmesi yapabilir, metnin
   farklı varyasyonlarını gösterebilir." İkinci liste geri okunan değerden üretilir; okunamadıysa
   "Meta'nın şunları yapıp yapmadığını doğrulayamadık" yazılır.
3. **`text_optimizations`\* özel kuralı:** workspace'te zorunlu yasal uyarı varsa (C-13) ve geri
   okumada bu özellik `OPT_IN` dönerse yayın **durur** (`uretken_ya_da_tanimsiz` gibi davranır):
   Meta'nın metin varyasyonu uyarıyı düşürebilir ve bunu ilk gören müşteri olur. Sağlık, finans ve
   konut workspace'lerinde koşulsuz.
4. **Ölçüm** (Ö-M2): küçük harfli anahtarlar bağımsız `/adcreatives` ucunda `OPT_OUT` ile
   kabul ediliyorsa (ret satır içi kreatifteyse) bu uca geçilir ve sınıf 2 boşalır. Geçilmezse
   sözlük olduğu gibi kalır.

### 4.3 Google Arama — SITE (S-43)

| Katman | Varsayılan | Kaynak |
|---|---|---|
| İstek | Tek `POST /v25/customers/{id}/googleAds:mutate`, geçici kimlikler (`campaignBudgets/-1`, `campaigns/-2`, `adGroups/-3`), `partialFailure: false`; önce `validateOnly: true` | A1 §5.1 |
| Bütçe | Ayrı `CampaignBudget`, `explicitlyShared: false`, `deliveryMethod: STANDARD`, ad tekil (zaman damgası) | KOD `google-write.ts`; A1 §2.1 |
| Kampanya | `status: PAUSED`, `advertisingChannelType: SEARCH`, `targetSpend: {}`, `containsEuPoliticalAdvertising: DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING`, `startDateTime` (`yyyy-MM-dd HH:mm:ss`, hesap saat dilimi), toplam/bitişte `endDateTime` | A1 §7.1, §7.2 |
| Ağ | `targetGoogleSearch: true`, `targetSearchNetwork: false`, `targetContentNetwork: false`, `targetPartnerSearchNetwork: false` | KOD; A1 §2.2 |
| Konum | `CampaignCriterion` konum (Marka Merkezi kitlesinden, `geoTargetConstants:suggest`), `geoTargetTypeSetting.positiveGeoTargetType: PRESENCE` | S-18 |
| Dil | `CampaignCriterion` `languageConstants/1037` | A1 §4.2 |
| AI Max | `aiMaxSetting.enableAiMax: false` | S-19 |
| Kitle | Kitle ölçütü YOK (Arama'da kitle "gözlem"; acemiye "sınır" izlenimi verir) | A2 §2.1 |
| Reklam grubu | `SEARCH_STANDARD`, `ENABLED` (kampanya PAUSED olduğu için güvenli) | A1 §2.2 |
| Anahtar kelime | 5–20 öbek eşleme (`PHRASE`); kaynak: Keyword Planner varsa ondan, yoksa modelin önerisi "ölçülmedi" etiketiyle ve kullanıcı onayıyla | A1 §4.5; KOD |
| Negatif | Kampanya seviyesi taban Türkçe liste (`ücretsiz`, `bedava`, `nasıl yapılır`, `iş ilanı`, `staj`, `pdf`, `indir`, `ikinci el`*) — sektör profiline göre süzülür | A1 §4.5 |
| Reklam | RSA, `PAUSED`; başlık/açıklama sınırı GİRİŞ anında; sabitleme yok | A1 §2.2 |
| İzleme | `finalUrlSuffix` ile UTM (Meta'daki `url_tags` karşılığı) | [çıkarım] |
| Açma | Ayrı istek: `update` + `updateMask: "status"` → `ENABLED` (yalnız `ac` kapısında) | A1 §5.2 |

\* `ikinci el` gibi sektöre göre ters etki yapan kelimeler taban listede değil sektör listesindedir.

### 4.4 Google PMax / Demand Gen (Faz 3, kayıt için) (S-44)

- PMax yalnız `olcum = true` iken; MaxConv (tCPA'sız başlar); marka yönergeleri açık →
  `BUSINESS_NAME` ve `LOGO` **CampaignAsset**; bütün ağaç tek istekte; görsel en-boy oranı panelde
  bırakıldığı anda doğrulanır (Google bağlamada reddediyor, yüklemede değil). `FINAL_URL_EXPANSION`
  ve otomatik video tarama açıkça kapalı yazılır (ölçülerek). (A1 §2.3, §9.2)
- Demand Gen: bütçe paylaşımsız; konum/dil REKLAM GRUBU seviyesinde; kanal kontrolü açıkça; video
  YouTube kimliği ister, `YouTubeVideoUpload` durumu `PROCESSED` görülmeden reklam kurulmaz
  (Meta'daki "hazır olmadan kurma" dersi). `REJECTED` platform mesajıyla gösterilir. (A1 §2.4, §2.6)

### 4.5 Açıkça yazılacak sessiz varsayılanlar — tam liste (S-45)

| Platform | Alan | Yazılan değer | Yazılmazsa ne olur |
|---|---|---|---|
| Google | `containsEuPoliticalAdvertising` | `DOES_NOT_CONTAIN_…` | `FieldError.REQUIRED`; hesapta beyansız eski kampanya varsa BÜTÜN mutate'ler düşer |
| Google | `positiveGeoTargetType` | `PRESENCE` | "İlgilenenler" de hedeflenir |
| Google | konum + dil ölçütü | Marka kitlesi + Türkçe | Bütün dünya / bütün diller |
| Google | `networkSettings.*` | dört alan açıkça | Ortaklar ve Display açık gelir |
| Google | `aiMaxSetting.enableAiMax` | `false` | Geniş eşleme + anahtar kelimesiz eşleme |
| Google | teklif stratejisi | `targetSpend` | Hesap varsayılanı |
| Google | `deliveryMethod`, `explicitlyShared` | `STANDARD`, `false` | Paylaşımlı bütçe riski |
| Google | `startDateTime` | açıkça | Bugün başlar (kabul edilebilir ama yazılır) |
| Meta | `bid_strategy` | `LOWEST_COST_WITHOUT_CAP` | Hesap varsayılanı |
| Meta | `advantage_audience` | `1` | Oluşturmada açık, güncellemede belirsiz; v26'da HEF'te hata |
| Meta | `attribution_spec` | niyet başına | Hesap varsayılanı; iki müşteride iki pencere |
| Meta | `special_ad_categories` (+ ülke) | açıkça (boş dizi dahil) | Vergi ülkesine düşer |
| Meta | `destination_type` | her niyette (ERISIM hariç) | Meta tahmin eder; boost'ta canlı ret üretti |
| Meta | `page_welcome_message` (WHATSAPP) | Türkçe | İngilizce "Hello! Can I get more info on this?" |
| Meta | `conversion_domain` (SATIS, SITE_KAYIT) | açılış sayfasının alan adı | Piksel paylaşan kampanyada zorunlu |
| Meta | `frequency_control_specs` (ERISIM) | ajans sabiti (ör. 7 günde 2) | Meta'nın varsayılanı |
| Meta | `instagram_user_id` | IG seçiliyse | Instagram'da hiç yayın yok, hata da yok |
| Meta | `contextual_multi_ads` | `OPT_OUT` | Başka markalarla yan yana |

Google'ın **hesap düzeyi** ayarları (otomatik uygulanan öneriler, otomatik oluşturulan öğeler) bizim
yazdığımız alan değil; okunur ve açıksa onay kartında uyarı olur: *"Bu Google hesabında
otomatik öneri uygulama açık; Google kampanyayı bizden habersiz değiştirebilir."* Ayarı
değiştirmek ajana ya da sisteme verilmez (hesap ayarı). (A1 §6.1, A2 §1.3)

---

## 5. Sohbet ajanı sözleşmesi

### 5.1 Model ne yapar / ne yapamaz (S-46)

| Yapar | Yapamaz |
|---|---|
| Kullanıcının cümlesinden niyeti **kapalı listeden** seçer ve gerekçesini yazar | Platform seçmek (yalnız `platform_oner` çıktısını anlatır) |
| Görsel/video için başlık ve metin yazar (platform paketleyicisi sınırlar) | Bütçe, süre, adres, numara uydurmak (sunucu cümleyle karşılaştırır, mevcut kural) |
| Sunucunun `eksikler` listesindeki SIRAYLA soru sorar | Özel kategori sorusunu cevaplamak (kart kullanıcıya sorar) |
| Prova sonucunu ve platform mesajını Türkçe açıklar | İki platforma bölüşüm oranı önermek |
| Durum ve performansı **sunucunun cümlesiyle** özetler | Dönüşümleri platformlar arası toplamak; "Google daha iyi" demek |
| Öneri kartı TASLAĞI açar (bütçe, durdur, yeni kreatif) | Yayınlamak, açmak, uygulamak, silmek |
| "Bu neden yok" sorusuna `KAPALI_NIYETLER` / sebep kodlarından cevap verir | Atıf, Advantage+ creative, kategori, hesap ayarı değiştirmek |

### 5.2 Araç katmanları (S-47)

Araçlar platform adı taşımaz; `platform` parametresi `DRAFT_PLATFORMS` gibi **bilerek dar** bir
listeden gelir (LinkedIn yazma araçlarına girmez). Şema `strict`, sınırlar Zod'da. (A2 §4.1, CL)

| Katman | Araç | Girdi (kabaca) | Çıktı | Not |
|---|---|---|---|---|
| **O** okuma | `hazirlik_oku` | workspaceId | hesaplar, sayfalar, IG, piksel/dönüşüm durumu (üç hâlli), marka kitlesi, yasal uyarı, yazma kapıları | Sıfır platform çağrısı; DB'den |
| O | `niyet_katalogu` | — | açık niyetler + kapalılar ve sebepleri | Fazdan türetilir |
| O | `platform_oner` | taslakId | birincil, ikincil öneri, gerekçe kodları, ölçülen sinyaller | §3 saf fonksiyonu |
| O | `arama_hacmi` | terimler (≤20), konum | aylık aralık, rekabet ya da `bos_neden` | Keyword Planner; 1 QPS; Explorer'da `ERISIM_YOK` |
| O | `konum_ara` | metin, platform | aday konumlar + platform kimliği | Meta + Google `suggest`; "eşleşme yok" ≠ "çağrı düştü" |
| O | `varliklari_listele` | workspaceId | görsel/video, oran, uygunluk | Oran uyarısı giriş anında |
| O | `performans_oku` | kapsam, tarih | platform satırları + Advetics sayımı; **toplam dönüşüm alanı yok** | DB'den, canlı API'den değil |
| O | `sinyalleri_oku` | kampanya/hesap | öğrenme, sorunlar, öneriler, skorlar (§6) | Önbellekli tablodan |
| **T** taslak | `taslak_olustur` | niyet, varlıklar, cümle | taslakId, eksikler | Platform satırlarını derleyici üretir |
| T | `taslak_alan_yaz` | taslakId, alan (beyaz liste), değer | yeni sürüm, eksikler | Her yazım `ai_onerisi` kaynağıyla; kullanıcı onaylamadan derlenmez |
| T | `metin_oner` | taslakId, kavram | başlık/metin adayları + sınır ihlalleri | Sınırı paketleyici uygular |
| T | `anahtar_kelime_oner` | taslakId | kelimeler (ölçülmüş/ölçülmemiş etiketli) + taban negatifler | Google satırı için |
| **P** prova | `prova_baslat` | taslakId | işlem kimliği | Platform başına; hesap başına 5 dk'da 2 (mevcut); para harcamaz |
| P | `prova_sonucu` | işlem kimliği | platform başına geçti/kaldı/belirsiz + platform mesajı | — |
| **K** kart | `onay_karti_goster` | taslakId | sunucunun ürettiği kart (platform satırları, otomatik yaptıkları, prova, bütçe esnekliği) | Düğme kullanıcıda; model kartın metnini yazamaz |
| K | `oneri_karti_ac` | tür, nesne, gerekçe kodu | kart taslağı | Uygulama kullanıcı onayıyla, OKU-KARŞILAŞTIR-YAZ (C-18) |

**Yasaklı (hiç verilmez):** `yayinla`, `ac`, `oneri_uygula` (Meta `POST /recommendations`, Google
`ApplyRecommendation`), `otomatik_uygulama_ac` (`RecommendationSubscription`),
`politika_muafiyeti_iste`, `sil` / `arsivle` / `REMOVED`, `butce_degistir` (doğrudan),
`atif_degistir`, `kategori_cevapla`, `hesap_ayari_degistir`. Gerekçe: Meta öneri uygulaması Hizmet
Şartları kabulü sayılıyor ve üretken özellikleri açıyor (C-27'yi arka kapıdan deler); Google
muafiyeti hesabın politika geçmişini riske atar (lead form uygunluğunun şartı). (A3 §5.2, A1 §5.3)

### 5.3 Soru kuralı (S-48)

1. Model yalnız sunucunun `eksikler` listesindeki alanları sorar; **sıra sabit**: niyet → medya →
   bütçe (tutar + tip aynı soruda) → süre → konum (marka kitlesi yoksa) → niyete özgü tek alan
   (site adresi / form seçimi). Özel kategori sorusu modelden değil arayüzden gelir. (C-40)
2. **Mesaj başına tek soru**, önizlemeye kadar **en çok 5 soru.** Cevaplanmayan ve varsayılanı
   olan her alan varsayılanla dolar, önizlemede "varsayılan" etiketiyle durur ve düzenlenebilir.
3. Varsayılanı OLMAYAN alanlar (bütçe, süre, konum, kategori) hiçbir zaman tahminle dolmaz;
   önizleme bunları eksik olarak gösterir.
4. Ölçülebilen bir şey sorulmaz: "Sitenizde satış ölçümü var mı?" yerine `hazirlik_oku` okunur;
   sonuç `null` ise "kontrol edemedim" denir ve soru o zaman sorulur.
5. Belirsizlikte iki seçenek sunulur, ikisi de açık yazılır; model birini "en iyisi" diye seçip
   sessizce ilerlemez.

### 5.4 Hata ve belirsizlik dili (S-49)

- Dört hâl ayrı yazılır: **henüz bakmadım · bakıyorum · sonuç yok (sebebi) · çağrı düştü
  (platformun mesajı).** `.catch(() => [])` deseni sohbet araçlarında da yasak. (CL)
- Platform hatası **platformun kendi metniyle** + Türkçe açıklama + ne yapılacağı; "Beklenmeyen
  bir hata" yasak. `PlatformApiError` → kesin / geçici / kimlik / yetki / politika sınıfı;
  Google'da `requestId` kayda yazılır. (A1 §5.4; CL)
- "Hazır", "yayında", "kuruldu" kelimelerini **yalnız sunucunun durum cümlesi** kullanır.
  Google `kapali_kur` satırı asla "yayınlandı" demez. (C-51)
- Boş öneri: Google `GenerateRecommendations` ve Meta `/recommendations` boş dönerse "platform bu
  kurulum için öneri vermedi" denir; "en iyisi bu" denmez. (A1 §6.1)

### 5.5 Eval senaryoları (yayın bayrağının açılış koşulu, C-19 §1)

"WhatsApp'tan yazsınlar ama Google'da da olsun" · "arama kampanyası kur" (Google Arama, telefon
DEĞİL) · "beni arasınlar" (TELEFON) · "toplam kaç dönüşüm aldık" · eşik altı bütçeyle iki platform
· "Meta daha iyi, bütçeyi oraya kaydır" · bütçesiz cümle · uydurma adres tuzağı · konut ilanı ·
yurt içi sağlık · video + SITE · Google erişimi `kapali` iken Google isteği. (A2 Ö11)

---

## 6. Yönetim (dashboard): optimizasyon sinyalleri ve kurallar

### 6.1 Okunacak sinyaller (S-50)

Sinyaller yapı taramasıyla birlikte (aynı kota katmanı) ayna tablosuna yazılır; ajan ve panel
tablodan okur. Seviye başına "son okuma zamanı" gösterilir.

| Platform | Sinyal | Seviye | Kullanım |
|---|---|---|---|
| Meta | `effective_status` (`IN_PROCESS`, `WITH_ISSUES`, `PENDING_REVIEW`, `DISAPPROVED`…) | hepsi | Ortak durum sözlüğü |
| Meta | `issues_info`, `ad_review_feedback` | hepsi / reklam | "Neden yayında değil" — Meta'nın cümlesiyle |
| Meta | `learning_stage_info` (`LEARNING/SUCCESS/FAIL`, `conversions`, `last_sig_edit_ts`) | reklam seti | Öğrenme rozeti; değişiklik önerisini kilitler |
| Meta | `advantage_state_info` | kampanya | Advantage+ kapandı uyarısı |
| Meta | `recommendations` (nesne) + `/act/recommendations` + `opportunity_score` | nesne / hesap | Öneri kartı kaynağı (uygulanmaz) |
| Meta | `results`, `cost_per_result`, `frequency`, sıralama rozetleri | reklam seti / reklam | Kreatif/sayfa teşhisi |
| Meta | `creative_fatigue_summary`, `creative_fatigued_ads` | reklam | Yorgunluk (yapısı Ö-M10 ile ölçülür) |
| Meta | `deduping_ratio` | hesap | Parçalanma |
| Meta | `activities` / `last_updated_by_app_id` | nesne | "Dışarıdan değişti" rozeti (C-18) |
| Google | `campaign.primary_status` + `primary_status_reasons`, `serving_status` | kampanya | Ortak durum sözlüğü |
| Google | `ad_group_ad.policy_summary` (`approval_status`, `review_status`, `policy_topic_entries` ham metin) | reklam | Politika; konu listesi enum gibi ele alınmaz |
| Google | `bidding_strategy_system_status` | kampanya | Öğrenme rozeti |
| Google | `search_budget_lost_impression_share` | kampanya | Bütçe sınırlı |
| Google | `search_term_view` | reklam grubu | Negatif kelime önerisi |
| Google | `quality_info.*` | anahtar kelime | Kalite |
| Google | `recommendation` (GAQL) | hesap/kampanya | Öneri kartı kaynağı |
| Google | `optimization_score` | hesap/kampanya | **Başarı olarak gösterilmez** ("Google önerilerini uygulama oranı") |
| Google | `aca_migration_date_time`, `broad_match_migration_date_time` | kampanya | AI Max'e taşınma uyarısı |
| Google | `missing_eu_political_advertising_declaration` | kampanya | Hesap kilidi teşhisi (yayın öncesi de sorulur) |
| Google | `change_event` (`client_type`, eski/yeni değer) | hesap | Dışarıdan değişti rozeti |

### 6.2 Kurallar (S-51)

Genel ilkeler: (a) **Platformun kendi teşhisi önce gelir;** Advetics eşiği yalnız platform
sustuğunda ve "Advetics önerisi" etiketiyle. (b) Öğrenmedeki nesneye değişiklik önerilmez, yalnız
bilgi verilir. (c) Her kuralın minimum verisi var; yetmezse "henüz karar için veri yok"
(`emptyReason`). (d) Her kart OKU-KARŞILAŞTIR-YAZ ile uygulanır (C-18). (A3 §5.4)

| Durum | Sinyal | Kart | Uygulayan |
|---|---|---|---|
| Yayında değil | Meta `issues_info`/`WITH_ISSUES`/`DISAPPROVED`; Google `primary_status` NOT_ELIGIBLE / `DISAPPROVED` | Sebep (platform metni) + düzeltme taslağı | Kullanıcı |
| Öğrenme sınırlı | Meta `FAIL` ≥ 7 gün; Google `bidding_strategy_system_status` sınırlı | Birleştir / bütçe / daha sık olay | Kullanıcı |
| Bütçe sınırlı ve iyi | Meta `SUCCESS` + öneri `BUDGET_LIMITED`/`SCALE_GOOD_CAMPAIGN`; Google kayıp gösterim payı > %20 ve CPA hedefte | Bütçe artışı; tutarı kullanıcı seçer; Meta'da büyük artışın öğrenmeyi sıfırlayabileceği yazılır | Kullanıcı → kural motoru → geri oku |
| Kreatif yorgun | `CREATIVE_FATIGUE` önerisi / yorgunluk alanı / frekans eşiği | Yeni KAVRAM taslağı (AI yazar), eski açık kalabilir (C-37) | AI taslak, kullanıcı onay |
| Sıralama düşük | `BELOW_AVERAGE_*` (UNKNOWN değil) | Kalite → kreatif; dönüşüm → sayfa/form | Bilgi + taslak |
| Alakasız arama terimi | `search_term_view`: harcama > 0, dönüşüm 0, taban/sektör listesine benzer | Negatif kelime önerisi | Kullanıcı |
| AI Max'e taşındı | migration tarihleri dolu | "Google kampanyayı genişletecek" + kapatma talimatı | Kullanıcı |
| Dışarıdan değişti | `activities` / `change_event` | Rozet; kural motoru o nesnede karar vermeden yapı taraması ister | Sistem (okuma) |
| Advantage+ kapandı | alt durum `DISABLED` | Sebep (bütçe/kitle/yerleşim) | Bilgi |
| Google otomatik öneri uygulama açık | hesap aboneliği | Uyarı kartı | Bilgi |

### 6.3 Platformlar arası bütçe önerisi (S-52)

1. Kart yalnız **ortak ölçüt** varken üretilir: Advetics'in kendi saydığı sonuç (Meta lead formu,
   ileride Google lead form webhook'u ve site form kaydı). Yoksa kart "platformları karşılaştıracak
   ortak bir sayı yok" der ve kaydırma önermez. (A2 §3.3 k.4)
2. En sık **haftada bir**, tek seferde **±%20**; iki platform da `LEARNING` değilse.
3. Hedef platformun eşiği (§3.3) kaydırma sonrası da karşılanmalı; aksi hâlde kart üretilmez.
4. Kart iki satırı ayrı ayrı gösterir (platform, mevcut, önerilen, gerekçe); onay sonrası iki ayrı
   yazma kaydı; biri düşerse diğeri geri alınmaz, iki sonuç ayrı yazılır. (A2 §4.3)
5. Platformun bildirdiği CPA/ROAS karar ölçütü değildir; kartta bilgi olarak, pencere etiketiyle.

### 6.4 Raporlama yüzeyi (S-53)

Üst satır: toplam harcama + Advetics'in saydığı sonuç. Altında platform satırları: harcama,
gösterim, tıklama ("siteye tıklama": Meta'da bağlantı tıklaması), platformun saydığı sonuç +
sabitten türeyen pencere etiketi. Erişim yalnız platform başına. Meta ve Google günlük seri aynı
grafikte üst üste çizilirse başlıkta tarih ekseni farkı yazılır (Meta gösterim günü, Google
tıklama günü). (A2 §2.4, §4.8)

---

## 7. Mevcut kod için düzeltme listesi

P0 = ilk gerçek yayından ÖNCE şart · P1 = MVP bitmeden · P2 = ilgili niyet/faz açılırken.
Dosya yolları depo köküne göre; "M" Meta, "G" Google, "A" ajan/ortak.

| # | Öncelik | Dosya | Sorun | Düzeltme | Kaynak |
|---|---|---|---|---|---|
| D-G1 | **P0** | `apps/api/src/modules/connections/providers/google-write.ts:108-125`, `google-demandgen.ts:109-122` | `startDate/endDate` v23'te kaldırıldı; DG yolu her çağrıda düşer | `startDateTime/endDateTime` (`yyyy-MM-dd HH:mm:ss`, hesap saat dilimi); testte alan ADI kilitlenir | A1 §7.1 |
| D-G2 | **P0** | aynı iki dosya, `campaignBody`, `demandGenCampaignBody` | `containsEuPoliticalAdvertising` yok → `FieldError.REQUIRED` | Açıkça `DOES_NOT_CONTAIN_…`; manifesto satırı; yayın öncesi `missing_eu_political_advertising_declaration` sorgusu, varsa "hesapta beyansız eski kampanya var" ret | A1 §2.1, §7.2 |
| D-G3 | **P0** | `google.provider.ts` `publishDraft` (~2029–2110), `google-write.ts` | **Arama kampanyası konum ve dil ölçütü olmadan kuruluyor** (yalnız DG yolunda `campaignCriteria` var) → bütün dünya, bütün diller; hata yok | Konum + dil `CampaignCriterion` + `geoTargetTypeSetting.positiveGeoTargetType: PRESENCE`; manifesto ile kilit | Bu tur KOD okuması; S-18 |
| D-G4 | **P0** | `google.provider.ts` `publishDraft`, `createVideoBoost` | Sıralı çağrı + elle geri alma → yarım kampanya | Yeni modülde tek `googleAds:mutate` üreticisi (geçici kimlik), prova = `validateOnly: true` aynı liste; eski yol yeni modülden çağrılmaz | A1 §5.1, §7.3 |
| D-G5 | **P0** | `google-write.ts` `campaignBody` | AI Max alanı yazılmıyor | `aiMaxSetting.enableAiMax: false` + geri okuma | S-19 |
| D-G6 | **P0** | `google-write.ts:116`, `adGroupBody` | `manualCpc` + zorunlu `cpcBidMicros` acemiye teklif sorduruyor | SITE için `targetSpend`; tavan Gelişmiş'te | S-33 |
| D-G7 | **P0** | (yeni) Google yazma kapısı | Meta'daki `metaYazmaAcikMi` karşılığı yok | `googleYazmaKapisi` ∈ `kapali/kapali_kur/ac`, varsayılan `kapali`, okunamazsa `kapali` | S-03 |
| D-G8 | P1 | Google kota bekçisi | Tek Cloud projesi bütün müşterileri paylaşıyor | Hesap başı bütçe; prova da sayılır; ön koşul kontrolü çağrıdan önce | A2 §4.6; CL |
| D-G9 | P2 | `google.provider.ts` `createLeadForm` | "Karşılığı YOK" yorumu yanlış | "Koşullu var; uygunluk + dönüşüm teklifi" ve `emptyReason` | A1 §4.3, §7.5 |
| D-G10 | P1 | `google.provider.ts:75` yorumu, ARCHITECTURE | "Basic Access" varsayımı | Gerçek seviye Ö-G0 ile ölçülüp yazılır | A1 §7.6 |
| D-M1 | **P0** | `packages/shared/src/reklam/meta/yanki.ts:300-318` | Tanınmayan her `OPT_IN` yayını durduruyor; belge `adapt_to_placement`ı varsayılan açık diyor → her yayın kilitlenebilir | Üç sınıflı sözlük (§4.2); yalnız `uretken_ya_da_tanimsiz` durdurur; `text_optimizations` yasal uyarılı workspace'te durdurur | A3 Ç-1; S-42 |
| D-M2 | **P0** | `packages/shared/src/reklam/meta/derle.ts` `kapattiklarimiz` | "Meta'nın yapay zekâyla görseli ve metni değiştirmesi kapalı" kanıtsız söz | Gerçekten gönderilenleri say; ayrı "Meta'nın otomatik yaptıkları" (geri okumadan) | A3 Ç-2 |
| D-M3 | **P0** | `derle.ts` `ATIF_SPEC`, `packages/shared/src/reklam/taslak.ts:38` | Her niyete aynı pencere; LPV'de geçersiz olabilir (SITE MVP'de) | `ATIF_KURALI` niyet başına; `tik1` iç değer; rapor etiketi aynı sabitten | A3 Ç-3; S-07 |
| D-M4 | **P0** | `apps/api/src/modules/reklam/meta-graf.ts:152-155` | `video_status = expired` "işleniyor" sayılıyor → 15 dk sessiz bekleme, yanlış teşhis | `expired` kesin hata ("video süresi doldu, yeniden yükle"); `processing_phase` hatası ayrı | A3 Ç-10 |
| D-M5 | **P0** | `packages/shared/src/reklam/meta/niyetler.ts` + `ai-taslak.ts` + panel | `ARAMA` ↔ Google Arama ad çakışması | `TELEFON` olarak yeniden adlandır (deploy öncesi: migration gerekmez, `niyet_kodu` VARCHAR) | S-08 |
| D-A1 | **P0** | `apps/api/src/modules/reklam/ai-taslak.ts:33` | `AI_NIYETLERI` derlenemeyen niyetleri içeriyor (WHATSAPP, SATIS) | Derlenebilir ∧ canlı niyetlerden TÜRET; kaynak taramasıyla kilit | S-30 |
| D-M6 | P1 | `derle.ts`, `niyetler.ts` | WHATSAPP derlenmiyor; `page_welcome_message` yok | Derleyici dalı + Türkçe karşılama (Marka Merkezi'nden, varsayılan Türkçe metin) + manifesto satırı; sayfada WhatsApp bağlı mı ön kontrolü | A3 Ç-15; S-45 |
| D-M7 | P1 | `packages/shared/src/reklam/meta/prova.ts:79` | Satır içi `campaign_spec` belgelenmemiş alan taşıyor; `/adsets` provası 5xx | 3 alana indir (Ö-M3); 5xx sürerse `/adsets` provasını kaldır, `adset_spec` yeterli | A3 Ç-11; S-20 |
| D-M8 | P1 | geri okuma (`yanki.ts` + yayın motoru) | `advantage_state_info` okunmuyor | Beklenen durum tablosu (§4.1) | A3 Ç-9; C-31 |
| D-M9 | P1 | yayın motoru geri okuma | `IN_PROCESS` / kreatif `IN-PROCESS` ayrı hâl değil | Bekle → `issues_info` oku → `WITH_ISSUES` ayrı sonuç | A3 Ç-14 |
| D-M10 | P1 | `meta-graf.ts` `videoYukle` | Tek istekte `source`; büyük dosyada zaman aşımı | Parçalı `/advideos` (`upload_phase` start/transfer/finish); 200 MB üst sınırı için yeterli | A3 §3.1, Ç-10 |
| D-M11 | P1 | panel/Stüdyo video girişi | "En az 1200 px genişlik" ölçülmedi | Giriş anında RET değil UYARI (Ö-M8 bitene kadar) | A3 §3.1 |
| D-M12 | P1 | sinyal okuma (yeni) | `learning_stage_info`, `issues_info`, öneriler, rozetler, yorgunluk okunmuyor | §6.1 ayna tablosu | A3 Ç-13 |
| D-M13 | P2 | `niyetler.ts` `SATIS` | Satış ve kayıt tek satır, Satış amacında | `SATIS` + `SITE_KAYIT`; `conversion_domain` manifestosu; C-39 kapısı | A3 Ç-4, Ç-12; S-09 |
| D-M14 | P2 | `niyetler.ts` `TELEFON` | `PHONE_CALL` yazma enum'unda yok; `tel:+` biçimi ve ülke kuralı yok | Ö-M11; numara giriş anında doğrulanır | A3 Ç-5 |
| D-M15 | P2 | `niyetler.ts` `ERISIM` | `frequency_control_specs` yok | Manifesto satırı + ajans sabiti | A3 Ç-7 |
| D-M16 | P2 | `SITE_MESAJ`, `COK_KANAL_MESAJ` | Mesaj eklentisi / `DOF_MESSAGING_DESTINATION` derleyicide yok | Faz 3; o güne kadar derlenmez | A3 Ç-6, Ç-8 |
| D-A2 | P1 | `ai-taslak.ts` `BASLIK_SINIRI = 40`, sistem istemi | Sınır tek platforma göre; istem "Meta" diyor | Sınır platform paketleyicisinde (Meta 40, RSA 30, uzun başlık 90); istem platformdan bağımsız | S-31 |
| D-A3 | P1 | (yeni) `platformOner()` + gerekçe sözlüğü | Yok | §3 saf fonksiyon, mutasyonla sınanır | S-38 |

---

## 8. Canlı ölçüm planı

Kurallar: hepsi **ajansın kendi hesabında**; sıra bağlayıcı (önceki geçmeden sonraki başlamaz);
para harcayan adımlar ayrıca işaretli ve kullanıcı onayıyla (K-03). "200 döndü" doğrulama değildir;
her ölçüm GERİ OKUMA ile biter. Sonuçlar CLAUDE.md "Canlıda öğrenilen platform gerçekleri"ne ve
katalog `kanit: 'canli'` alanına yazılır.

### 8.1 Meta (devam eden tur)

| Sıra | Kod | Ne | Nasıl | Başarı ölçütü |
|---|---|---|---|---|
| 1 | Ö-M1 | D-M1/D-M2 sonrası SITE provası | `validate_only`, görsel | Kampanya + reklam provası geçer |
| 2 | Ö-M3 | `/adsets` + 3 alanlı `campaign_spec` | prova | Geçerse alan fazlalığıydı; 5xx sürerse `/adsets` provası kaldırılır (karar her iki sonuçta da kesin) |
| 3 | Ö-M2 | Kreatif özellik varsayılanları | Test kipi: PAUSED kur → `degrees_of_freedom_spec` geri oku → arşivle; ayrıca küçük harfli anahtarla bağımsız `/adcreatives` `validate_only` | Hangi anahtarlar dönüyor, değerleri ne → §4.2 sözlüğü kesinleşir |
| 4 | Ö-M4 | Atıf niyet başına | SITE ve FORM için `tik7_gor1`, `tik7`, `tik1`, gönderilmemiş → prova + PAUSED geri oku | Kabul / ret / normalleştirme tablosu; `ATIF_KURALI` kesinleşir |
| 5 | Ö-M5 | SITE test kipi uçtan uca | Kur → geri oku → fark tablosu → arşivle | Fark yok ya da her fark normalleştirme tablosunda sebepli |
| 6 | Ö-M6 | `advantage_state_info` | Ö-M5 ve FORM geri okumasında | FORM → `ADVANTAGE_PLUS_LEADS`; SITE'de alanın ne döndüğü kayıtlı |
| 7 | Ö-M8 | Video | 1080×1920 ve 1920×1080 MP4; parçalı yükleme; `expired` gözlemi | `ready` süresi, genişlik kuralı, `expired` tetikleyicisi kayıtlı |
| 8 | Ö-M7 | WHATSAPP | Prova + PAUSED geri oku, Türkçe `page_welcome_message`; WhatsApp'sız sayfada hata imzası | Karşılama Türkçe geri okunur; bağsız sayfa hatası giriş anında yakalanabilir |
| 9 | Ö-M9 | Asgari bütçe | `GET /act_X/minimum_budgets` | TRY değerleri okunur ya da uç yoksa kayıtlı |
| 10 | Ö-M10 | Sinyaller | `/act/recommendations` (`pre_create_guidance`), yorgunluk/çeşitlilik alanları, ajans portföyünde işletme düzeyi çağrı | Hangi alanlar dolu dönüyor; ajans modelinde müşteri hesapları görünüyor mu |
| 11 | Ö-M12 | İlk GERÇEK yayın (SITE) | Uyum katmanı bittikten sonra, en küçük bütçe, 24 saat | Açıldı, teslim başladı, ilk günün metrikleri senkronda; kapatıldı |
| sonra | Ö-M11, Ö-M13 | TELEFON (`PHONE_CALL`), SATIS/SITE_KAYIT (`conversion_domain`) | prova + PAUSED | Faz 2 açılış koşulu |

### 8.2 Google (sıfırdan)

| Sıra | Kod | Ne | Nasıl | Başarı ölçütü | Kapı |
|---|---|---|---|---|---|
| 1 | Ö-G0 | Erişim | Cloud projesi geçişi (2026-09-10) sonrası `listAccessibleCustomers` + bir `GenerateKeywordIdeas` çağrısı | Seviye (Explorer/Basic) ve KP erişimi kayıtlı; `CLOUD_PROJECT_NOT_APPROVED_FOR_PRODUCTION` yok | — |
| 2 | Ö-G1 | Atomik prova, DÜZELTMESİZ | Mevcut alanlarla `googleAds:mutate` `validateOnly: true` | Kaldırılmış `startDate` 400 mü sessiz mi; EU beyanı hatası görülür (A1 §11 S1) | — |
| 3 | Ö-G2 | Atomik prova, düzeltilmiş | D-G1…D-G6 ile aynı liste | Hata yok; politika bulgusu varsa ham metin kayıtlı | — |
| 4 | Ö-G3 | PAUSED kurulum | Aynı liste `validateOnly: false`, en küçük bütçe | Geri okuma: konum PRESENCE, dil, ağlar, AI Max false, teklif, bütçe, tarih, `primary_status`, `policy_summary` hepsi yazılanla aynı | `kapali_kur` açılır |
| 5 | Ö-G4 | Kota sayımı | Ö-G3 öncesi/sonrası günlük işlem sayısı | Tek kurulum kaç işlem düşüyor (A1 §11 S11) | — |
| 6 | Ö-G5 | Öneri servisi | `GenerateRecommendations` (SEARCH, bütçe + kelime) | Ne dönüyor; boşsa boş olarak kayıtlı | — |
| 7 | Ö-G6 | Arama hacmi | 10 sektör × Türkçe terim | Eşik (§3.2) gözden geçirilir; boş dönüş sebebi ayrılabiliyor | — |
| 8 | Ö-G7 | İlk açma (para harcar) | `update` + `updateMask: status`, en küçük bütçe, 24–48 saat | Teslim başladı, `search_term_view` geliyor, AI Max'e taşınma tarihi boş; kapatıldı | `ac` açılır (K-03 onayıyla) |
| sonra | Ö-G8 | AI Max taşınma | Ö-G3 kampanyası 30 gün izlenir | `enableAiMax=false` kampanyası taşınıyor mu | — |
| Faz 2 | Ö-G9 | CallAsset, LeadFormAsset uygunluğu | prova + PAUSED | Türkiye/hesap uygunluğu sinyali | — |

---

## 9. Fazlar

### 9.1 Faz 1 — MVP

| Alan | Var | Yok |
|---|---|---|
| Meta niyetleri | FORM, SITE (görsel + video), WHATSAPP (Ö-M7 sonrası) | SATIS, SITE_KAYIT, TELEFON, ERISIM, IG_MESAJ, mesaj eklentileri |
| Google | SITE: Arama + Maksimum tıklama + PHRASE + RSA, kapı kapı (`kapali` → `kapali_kur` → `ac`) | PMax, Demand Gen, Display, lead form, CallAsset, WhatsApp, video |
| Platform seçimi | `platformOner()`, tek platform varsayılan, gerekçe sözlüğü | İki platform aynı anda (eşik ve CPA bilinmediği için pratikte çıkmaz; kod hazır) |
| Sohbet | O/T/P/K araçları, soru kuralı, önizleme, prova, onay kartı; yayın bayrağı eval ile açılır | Sohbetten yayın düğmesi bayrak kapalıyken (panelden yayın her zaman açık, C-19 §2) |
| Kreatif | Görsel, tek video (9:16 önerilen), AI metni, Advantage+ creative dürüst liste | PAC, multi-media, üretken özellikler |
| Yönetim | §6.1 sinyalleri okuma + durum/sorun/öğrenme rozetleri + "dışarıdan değişti" + öneri kartları (yalnız bilgi ve taslak) | Öneri uygulama, otomatik kaydırma, kural motoru üzerinden bütçe yazma (Faz 2) |
| Raporlama | Platform satırları + pencere etiketi + Advetics sayımı (Meta lead formu) | Çapraz ROAS, MMM |

### 9.2 Faz 2

Meta SATIS + SITE_KAYIT (C-39 kapısıyla), TELEFON (iki platform), ERISIM; Google lead form
(koşullu), CallAsset; bütçe/durdur kartlarının kural motoru üzerinden uygulanması; platformlar arası
öneri kartı (ortak ölçüt varsa); Google `ac` kapısı açıldıysa iki platformlu plan.

### 9.3 Faz 3

PMax (ölçüm şartlı), Demand Gen görsel/video + `YouTubeVideoUpload`, VIDEO_IZLENME, IG_MESAJ,
MESSENGER, COK_KANAL_MESAJ, SITE_MESAJ; `QUALITY_LEAD` (CRM → CAPI); Google WhatsApp (K-05);
MMM/lift testi yalnız büyük müşteride.

---

## 10. Kullanıcı kararı gerektirenler

Yalnız iş kararları. Teknik olanlar yukarıda karara bağlandı; her birinde önerilen seçenek ilk sırada.

| # | Karar | Seçenekler | Neden iş kararı |
|---|---|---|---|
| K-01 | **Google canlı ölçümü hangi hesapta?** | (a) Profaj'ın kendi Google Ads hesabı; (b) gönüllü bir müşteri hesabı | Ölçüm müşteri hesabında yapılırsa yarım kalan bir deneme müşterinin hesabında iz bırakır |
| K-02 | **Google satırı MVP'de görünsün mü?** | (a) Görünsün, kapı kapı açılsın (`kapali_kur` aşamasında "Google Ads'te duraklatılmış kuruldu, açmak ajansın işi"); (b) Google tamamen Faz 2'ye kalsın | Ürün vaadi ("Meta ve Google aynı panelden") ile ilk sürümün güvenilirliği arasındaki tercih |
| K-03 | **Canlı ölçümde gerçek para harcanması** (Ö-M12, Ö-G7) | (a) Her platformda en küçük bütçeyle 24–48 saat, toplam tavan kullanıcı belirler; (b) yalnız PAUSED kurulum, açma ilk müşteri yayınında | Bütçe ve sorumluluk ajansın |
| K-04 | **Google'da açmayı kim yapar** (`ac` kapısı açıldıktan sonra) | (a) Panelde aynı onay kartı (Meta ile aynı); (b) her zaman Google Ads arayüzünden ajans | Ajansın Google hesap disiplini ve müşteri onay modeli |
| K-05 | **Google WhatsApp (Click-to-Message) allowlist'i istenecek mi?** | (a) Hayır, WhatsApp yalnız Meta; (b) Google hesap yöneticisinden talep edilsin | Google ile ticari ilişki gerektiriyor |
| K-06 | **Ajans sabitleri:** ERISIM frekans tavanı, taban negatif kelime listesi, arama hacmi eşiği başlangıç değeri | (a) Bu belgedeki başlangıç değerleri (7 günde 2; §4.3 listesi; ayda 1.000), ölçümle gözden geçirilsin; (b) ajans kendi değerlerini verir | Müşteri deneyimi ve harcama verimliliği tercihi |
| K-07 | **Meta'nın kapatılamayan kreatif uyarlamaları** (kırpma, rötuş, metin varyasyonu) yasal uyarısı olmayan workspace'lerde kabul mü? | (a) Kabul, onay kartında açıkça yazılsın; (b) Ö-M2 kapatma yolu bulamazsa bu workspace'lerde de yayın dursun | Marka kontrolü ile erişim/performans arasında ajansın müşteriye verdiği söz |
| K-08 | **İki platformlu planda müşteri onayı** | (a) Tek onay iki platformu kapsar, sonuçlar ayrı satır; (b) platform başına ayrı onay | Ajans–müşteri sözleşme modeli (A2 Açık soru 9) |

---

*Bu belge A1/A2/A3'ün yerini almaz; onların çelişkilerini kapatır. Bir karar değişirse buraya tarihli
yeni satır eklenir, eski satır silinmez (bekleyen-kararlar.md deseni).*
