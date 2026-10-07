# A2 — Meta ve Google'ı tek panelden, tek sohbetten yönetmek

> **Kapsam:** AdvCampaign modülü için "iki platform, bir panel, bir sohbet" sorusu: piyasa nasıl
> çözüyor, iki platformun kavramları tek modele nasıl iner, acemi bir işletmenin bütçesi platformlar
> arasında nasıl bölünür, sohbet ajanı iki platformun API'sini nasıl güvenle sürer.
>
> **R2 ve R5'in üstüne kurulu, tekrar etmez.** R2 (`docs/meta-reklam-brief/arastirma/R2-urun-ux-kiyaslama.md`)
> tek platformlu akışları ve UX desenlerini, R5 (`.../R5-yapay-zeka-kampanya.md`) sohbet ajanının O/T/C
> araç katmanlarını, tutamaç desenini, onay kartını, model seçimini ve eval planını zaten anlatıyor. Bu
> belge yalnızca **ikinci platformun eklediği** soruları ele alıyor; R5'in bir kuralı geçerliyse
> "R5 B3.4" gibi atıfla geçiliyor.
>
> **Yöntem:** 2026-10-07'de ~35 web araması, 14 sayfa doğrudan okundu (WebFetch), geri kalanı arama
> özetinden. Depoda `apps/api/src/modules/reklam/`, `packages/shared/src/reklam/`,
> `apps/api/src/modules/connections/providers/google-write.ts`, `meta.provider.ts`, `platforms.ts` ve
> `TASARIM.md`'nin Google satırları okundu (kod yazılmadı). Hiçbir şey canlıda denenmedi.
>
> **Etiketler:** **[belge]** iddia bir kaynağın metninde var (resmî belge, haber, ürün sayfası ya da
> depo dosyası; köşeli kod sondaki kaynak listesindeki URL'ye gider). **[çıkarım]** iddia kaynaklardan
> benim çıkarımım ya da tasarım önerim. Kaynak yalnız arama özetinden okunduysa listede **(özet)**
> yazıyor. Rakip ürünlerin kendi sayfaları ve "inceleme" yazıları çıkar çatışması taşıyor; o satırlar
> düşük güvenilirlik.

---

## Özet: AdvCampaign için ne demek

1. **"Aynı sohbetten iki platformda kampanya aç ve onaylı yayınla" yapan olgun bir ürün yok.**
   Çok platformlu araçlar ya Meta'da derin, Google'da raporlama düzeyinde (Madgicx), ya kural motoru
   (Bïrch), ya analiz ajanı + dar yazma (Optmyzr: yalnızca anahtar kelime, sohbet içi önizlemeyle), ya
   da onaysız otonom (Albert). Platformların kendi ajanları tek platformlu. Türkçe + iki platform +
   onay kartı bugün boş bir alan [çıkarım; §1].
2. **Platformların kendi MCP'leri asimetrik:** Meta Ads AI Connectors (2026-04-29, açık beta) yazabiliyor
   ve her şeyi `PAUSED` kuruyor; Google'ın resmî MCP'si **salt okur** (`search`, `list_accessible_customers`,
   `get_resource_metadata`). Google'a yazma için doğrudan Ads API'ye gitmek gerekiyor; Advetics'in
   bugünkü durumu (Google yazma kodu var ama canlıda hiç koşmadı) piyasanın da sınırı [belge; [S1][S1],
   [S2][S2], [S3][S3]].
3. **Ortak model "amaç → platform reçetesi" düzeyinde kurulmalı, nesne düzeyinde değil.** Hiyerarşi
   adları benzer (kampanya / reklam seti ↔ reklam grubu / reklam) ama anlamları ayrışıyor: bütçe Google'da
   AYRI bir kaynak ve yalnızca kampanyada; Meta'da kampanyada ya da sette; Google'da PMax'in "reklam
   grubu" yok, varlık grubu var; Arama'da hedefleme anahtar kelime, Meta'da kişi [belge; depo
   `google-write.ts`, [S20][S20]]. → Kullanıcıya ortak gösterilen tek şey **niyet, bütçe toplamı, süre,
   konum, kreatif fikri ve durum**; gerisi platform satırının içinde [çıkarım].
4. **Dönüşüm sayıları platformlar arasında TOPLANAMAZ ve doğrudan kıyaslanamaz.** Google varsayılanı
   veri odaklı atıf + 30 gün tıklama, Meta'da 7 gün tıklama + 1 gün görüntüleme; Meta 2026-01-12'de 7 ve
   28 günlük görüntüleme pencerelerini API'den kaldırdı ve eski parametre HATA DEĞİL BOŞ VERİ döndürüyor;
   iki platform aynı satışı ayrı ayrı sahipleniyor. Google bile Demand Gen için ayrı bir
   "Platform Comparable" sütunu açmak zorunda kaldı [belge; [S12][S12], [S13][S13], [S14][S14]].
   → Panelde "toplam dönüşüm" satırı olmaz; çapraz doğruluk yalnızca Advetics'in kendi sayabildiği
   sonuçtan (lead tablosu, CRM) gelir [çıkarım].
5. **Platform seçimi modelin değil kodun kararı olmalı, model gerekçeyi anlatır.** Kural seti kısa:
   arama hacmi varsa Google Arama, yoksa Meta; görsel ürün ve talep yaratma Meta; WhatsApp/DM/form Meta;
   telefon ve "yakınımdaki" Google Arama; video Meta Reels + (bütçe yeterse) Demand Gen. Hacim sorusu
   Keyword Planner ile ölçülerek cevaplanır, tahminle değil [çıkarım; §3.1].
6. **Acemi bütçesi çoğu zaman İKİ platformu taşımaz.** Platformların kendi eşikleri: Meta reklam seti
   başına 7 günde ~50 optimizasyon olayı; PMax günlük bütçe ≥ 3 × CPA; Demand Gen (tCPA) ≥ 10 × CPA
   (2026-08'de 15×'ten indi). Eşiğin altındaki bütçeyi ikiye bölmek iki platformu da öğrenmeden bırakır
   [belge; [S15][S15], [S16][S16], [S17][S17]]. → Varsayılan "tek platform, eşik aşılınca ikincisi" [çıkarım].
7. **Platformlar arası otomatik bütçe kaydırma yapılmamalı.** Albert bunu onaysız yapıyor; ama karar
   verdiği rakam platformun kendi bildirdiği ROAS/CPA ve bu iki platform arasında kıyaslanamıyor (madde
   4). Madgicx ve Optmyzr bile "co-pilot, autopilot değil" diyor [belge; [S6][S6], [S8][S8]]. →
   Advetics öneri kartı üretir, kaydırmayı kullanıcı onaylar, haftada bir kereden sık önermez [çıkarım].
8. **Prova iki platformda da var ama farklı.** Meta `execution_options=['validate_only']` nesne başına
   doğrular (Advetics'te çalışıyor); Google `validate_only=true` bütün ağacı tek `mutate` isteğinde
   doğrular ve yalnızca hata döndürür. Google'da geçici kaynak adlarıyla bütçe → kampanya → grup →
   reklam tek atomik istekte provalanabilir [belge; [S18][S18], [S19][S19], depo `meta-graf.ts`].
9. **Google'ın sessiz varsayılanları Meta'nınkiler kadar uzun ve 2026'da büyüdü:** konum "bulunan ya da
   ilgilenen" (PRESENCE_OR_INTEREST) varsayılan; 1 Eylül 2026'dan beri bazı Arama kampanyaları AI Max'e
   otomatik geçiyor; Arama'da kitle varsayılan "gözlem"; PMax ve Demand Gen kitleleri sinyal, sınır
   değil; günlük bütçe 2 katına kadar aşılabilir [belge; [S21][S21], [S22][S22], [S23][S23], [S24][S24],
   [S25][S25]]. → Google derleyicisi bunların HER BİRİNİ açıkça yazmalı (CLAUDE.md "platformun
   varsayılanına güvenme") [çıkarım].
10. **Ad çakışması var: Advetics'in `ARAMA` niyeti "Beni arasınlar" (telefon) demek, Google'ın
    "Arama kampanyası" ise Search.** Tek panelde ikisi aynı ekranda görününce acemi kullanıcı ve model
    karıştırır [belge; depo `packages/shared/src/reklam/meta/niyetler.ts`; çıkarım]. Ayrıca Google'a
    dokunan her yeni kod, Google'ın 2026-09-10'da geliştirici token'ından Cloud projesine geçtiği
    erişim modeline göre kurulmalı [belge; [S26][S26]].

---

## 1. Piyasa kıyası: iki platformu tek panelde kim, nasıl birleştiriyor

### 1.1 Karşılaştırma tablosu

R2 ve R5'te olanlar (AdEspresso onay bağlantısı, Madgicx AI Marketer, Google sohbetli kurulum, Ads
Advisor, Amazon Ads Agent, Meta AI business assistant) yeniden anlatılmıyor; burada yalnızca **çok
platform** ekseni ve 2026'daki yenilikler var.

| Ürün | İki platformu nasıl birleştiriyor | Sohbet / ajan | Onay akışı | Otomatik yaptığı | Kaynak |
|---|---|---|---|---|---|
| **Madgicx** | Meta'da derin (kitle, kreatif, kural); Google, TikTok, Shopify, GA4 verisi "tek katmanda" raporlama + kısıtlı Google kuralı/bütçe | AI Marketer (7/24 denetim), **Madgicx MCP for Claude** (2026-04) | "Her optimizasyon gözden geçirip onayladığınız tek tıklık eylem"; "co-pilot, autopilot değil" | Bulgu üretimi; uygulama kullanıcıda | [S6][S6] [belge, satıcı], [S7][S7] (özet) |
| **Bïrch (eski Revealbot)** | Meta, Google, TikTok, Snapchat, Pinterest üstünde AYNI kural motoru; ~15 dakikada bir | Yok (kural tanımı) | Kural bir kez yazılır, sonra onaysız koşar; her tetiklenme günlüğe yazılır | Kural eylemleri (durdur, bütçe ±%) | [S9][S9] (özet) [belge, ikincil] |
| **AdEspresso** | Kurulum ve bölünmüş test; Google kapsamı kaynaklarda çelişkili (R2 U1) | Yok | Markalı müşteri onay bağlantısı (R2) | Varyant kombinasyonu | R2 K97–K98 |
| **Smartly.io** | Kurumsal sosyal (Meta, TikTok, Snap, Pinterest) + 2023'ten beri Google (YouTube, Display, Gmail, Search adı geçiyor) | AI stüdyosu | Ürün beslemesinden üretilen değişikliklerde inceleme aşaması (R2 U4) | "Öngörücü bütçe dağıtımı": kanallar arası harcamayı kaydırma | [S10][S10] [belge], [S11][S11] (özet) |
| **Optmyzr Sidekick 5.0 + Optmyzr MCP** | Google, Microsoft, Amazon, Meta, LinkedIn, Yahoo Japan için analiz; yazma yalnızca Google/Microsoft anahtar kelimesi | Panel içi sohbet + MCP (Claude/ChatGPT) | **Sohbet içinde önizleme → düzenle → onayla**; kampanya önizlemesi "siz açıkça uygulayana kadar taslakta" | Yok; analiz ve öneri | [S8][S8] [belge] |
| **Adzooma** | Google, Microsoft, Facebook tek panelde; "fırsatlar" + tek tıkla uygulama | Yok | Tek tık | Kurallı otomasyon | [S27][S27] (özet, eski) |
| **Albert.ai** | Google Arama/programatik, Facebook, Instagram, YouTube, Bing; kanallar, kitleler ve taktikler arasında bütçeyi **kendisi** dağıtıyor | Ajan (sohbet değil) | "Korkuluk ve hedefler kurulduktan sonra otonom çalışır"; insan yalnızca kreatif ve huni kararında | Teklif, bütçe, kitle, kreatif rotasyonu | [S5][S5] [belge, satıcı] |
| **Pencil (Brandtech)** | Kreatif orkestrasyon; Meta, TikTok, YouTube, Google Display, DV360, LinkedIn'e yayın | Üretken kreatif hattı | Marka kılavuzu + açık onay (R2 U6) | Kreatif üretimi ve puanlama | [S28][S28] (özet) |
| **Google Ads Advisor / Ask Advisor** | Yalnızca Google (Ask Advisor: Ads + Analytics + Merchant Center) | Gemini sohbeti | Değişiklik kullanıcı onayıyla; Temmuz 2026 koşulları üretilen içeriğin incelenmesini reklamverene yüklüyor | Teşhis, öneri, politika düzeltmesi | [S4][S4] (özet), R5 B1.2 |
| **Google Ads MCP (resmî)** | Yalnızca Google, **salt okuma** | Dış ajan (Claude vb.) | — (yazma yok) | — | [S2][S2] [belge], [S3][S3] |
| **Meta Ads AI Connectors (MCP + CLI)** | Yalnızca Meta; 29 araç (kampanya 5, katalog 10, varlık 3, teşhis 4, içgörü 7) | Dış ajan | Her şey `PAUSED`; yayın ayrı araç ve açık onay (R5 B1.3) | — | [S1][S1] [belge], [S29][S29] (özet) |
| **MCP toplayıcıları (Adspirer, MCPBundles, Markifact…)** | Google + Meta + LinkedIn + TikTok + Amazon tek MCP'de | Dış ajan | Adspirer: yeni kampanya `PAUSED`; mevcut kampanyayı silme/durdurma ve kurulu bütçeyi değiştirme yapısal olarak kapalı | Kurulum (duraklatılmış) | [S3][S3] [belge, satıcı], [S30][S30] (özet) |

### 1.2 Altı birleştirme deseni

1. **Ana platform + ikinci platform raporlaması** (Madgicx). Ortak katman veri; yazma ana platformda.
   Dürüst ama "tek panel" vaadinin yarısı [belge; [S7][S7] özet: "Google'da kısıtlı işlev"].
2. **Platformdan bağımsız kural motoru** (Bïrch, Adzooma). Ortak dil "metrik eşiği → eylem". Kural
   Google ve Meta'da aynı yazılıyor ama metriklerin anlamı aynı değil: "CPA > 50" iki platformda farklı
   atıf penceresiyle hesaplanıyor [belge [S9][S9]; çıkarım].
3. **Analiz ajanı + dar yazma** (Optmyzr). Yazma tek bir dar işlemle başlıyor (anahtar kelime) ve
   sohbetin içinde önizleme + onayla. Advetics'in O/T/C katmanlarının en yakın akrabası [belge [S8][S8]].
4. **Onaysız otonom dağıtım** (Albert). Platformlar arası bütçe kaydırmayı kendisi yapan tek örnek;
   gerekçesini kendi kanal kıyasına dayandırıyor [belge [S5][S5]]. Advetics'in ilkesiyle (R5 özet 1:
   "otomatik uygula yok") doğrudan çelişiyor.
5. **Kreatif orkestrasyon** (Pencil, Smartly). Birleşen şey kreatif varlık ve şablon; kampanya
   kurgusu platform başına ayrı [belge [S28][S28], [S10][S10]].
6. **Protokol katmanı** (platform MCP'leri + toplayıcılar). Birleştirmeyi ajanın kendisi yapıyor;
   kavram eşlemesi, atıf farkı, bütçe eşiği bilgisi modelin bağlamında kalıyor, yani **her sohbette
   yeniden ve denetimsiz** [çıkarım]. Meta'nın kendi duyurusunda bile ajanların öğrenme aşamasını
   bozabileceği ayrıca hatırlatılıyor [belge [S1][S1]].

**Ders [çıkarım]:** Kimse "Meta ve Google'da aynı niyetten iki kampanya derle, ikisini de provala,
tek kartla onaylat, ayrı ayrı geri oku" zincirini kurmamış. Yazma yapan çok platformlu araçlar
(Adspirer, Albert) ya onayı atlıyor ya da işi "duraklatılmış kur, gerisini sen yap"a indiriyor.
Advetics'in derleyici + prova + geri okuma omurgası bu boşluğa oturuyor; ama Google tarafında
omurganın hiçbir halkası canlıda doğrulanmadı (depo `google-write.ts` başlığı: "bu kod CANLI API'DE
HİÇ ÇALIŞTIRILMADI").

### 1.3 R2/R5'ten sonra değişenler (2026)

| Tarih | Değişiklik | AdvCampaign'e etkisi | Kaynak |
|---|---|---|---|
| 2026-01-12 | Meta Insights API'den 7 gün ve 28 gün görüntüleme pencereleri ve bunları içeren birleşik pencereler kalktı; eski parametre **boş veri** döndürüyor | Rapor ve ajan karşılaştırmaları yalnızca 1g görüntüleme / 1-7-28g tıklama ile; boş dönüşü "dönüşüm yok" diye okumamak | [S12][S12] [belge, ikincil] |
| 2026-04-29 | Meta Ads AI Connectors açık beta | Ajan Meta'ya Advetics'i atlayarak da yazabilir; MCP'den değişen bütçe Advetics aynasında gecikmeli (kullanıcı hafızası "Meta hesapları artık MCP ile yönetiliyor") | [S1][S1] |
| 2026 başı | Google Ads MCP (resmî) salt okuma | Google'a yazma için hazır bir protokol yolu yok | [S2][S2] |
| 2026-08-18 | Demand Gen tCPA bütçe önerisi 15× → 10× | Eşik tablosu (§3.2) | [S17][S17] (ikincil) |
| 2026-09-01 | Otomatik oluşturulan öğe ya da kampanya düzeyinde geniş eşleme kullanan Arama kampanyaları AI Max'e otomatik yükseltiliyor; arama terimi eşleme ve metin özelleştirme varsayılan açık | Google derleyicisi AI Max'i açıkça kapatmalı ya da açmalı; kararı varsayılana bırakmamalı | [S22][S22] (ikincil) |
| 2026-09-10 | Google Ads API erişimi geliştirici token'ından Google Cloud projesine taşındı; yeni Basic/Standard başvurusunda marka doğrulaması; "entegrasyon başına bir Cloud projesi" | Advetics'in Google erişimi yeni modele göre yeniden başvuru isteyebilir; ajans aracı olarak tek proje | [S26][S26] (ikincil) |

---

## 2. Ortak soyutlama: iki platformun kavramlarını tek modele indirmek

### 2.1 Kavram eşleme tablosu

Sütun "Ortak mı?": **O** = ekranda ortak gösterilir, **Ç** = ortak alan + platforma çeviri, **P** =
yalnızca platform satırında.

| Kavram | Meta | Google | Ortak mı? | Not |
|---|---|---|---|---|
| Amaç | Kampanyanın `objective`i: 6 sonuç odaklı amaç (Awareness, Traffic, Engagement, Leads, App Promotion, Sales) [belge [S31][S31] özet; [S29][S29]] | Kampanya hedefi (Satış, Potansiyel müşteri, Web sitesi trafiği, Bilinirlik, Mağaza ziyareti, Uygulama) **ayrı bir alan değil**, kampanya türünü ve dönüşüm hedeflerini seçtiren sihirbaz adımı [belge [S20][S20]] | Ç | Advetics niyeti (`NiyetKodu`) ortak dil; platform karşılığı reçetede [çıkarım] |
| Kampanya türü | Tek tür + Advantage+ anahtarları | Search, PMax, Demand Gen, Display, Video, Shopping, App; Video API'den oluşturulamıyor, Smart API'den yeni kurulmuyor [belge [S20][S20]; CLAUDE.md; R2 K51] | P | Acemiye "kampanya türü" sorulmaz |
| Seviye 1 | Kampanya | Kampanya | O | `ENTITY_LEVELS.campaign` [belge depo `platforms.ts`] |
| Seviye 2 | Reklam seti (hedefleme, bütçe/teklif, yerleşim, optimizasyon) | Reklam grubu (Arama: anahtar kelime + reklamlar); **PMax'te reklam grubu yok, varlık grubu var**; Demand Gen'de türsüz reklam grubu | Ç | Adı `ENTITY_LEVEL_LABELS`ten; anlamı farklı: Meta'da hedefleme burada, Google'da çoğu ayar kampanyada [belge depo `google-demandgen.ts`; çıkarım] |
| Seviye 3 | Reklam + kreatif | RSA (Arama), varlık grubu öğeleri (PMax), Demand Gen reklamı | Ç | |
| Bütçe yeri | Kampanyada (Advantage+ campaign budget) ya da sette | Ayrı `CampaignBudget` kaynağı, kampanya ona bağlı; reklam grubu bütçesi yok; ortak bütçe birden çok kampanyaya bağlanabilir [belge depo `google-write.ts`; [S32][S32]] | Ç | Ortak alan: "günlük/toplam + tutar"; derleyici yeri seçer |
| Bütçe esnekliği | Günlük bütçe bazı günler %75'e kadar aşılabilir (R5 Ö4) | Günlük bütçe 2 katına kadar; aylık sınır günlük × 30,4 [belge [S25][S25] ikincil] | P (uyarı metni ortak kalıp) | Onay kartında platform başına cümle |
| Teklif | Optimizasyon hedefi + teklif stratejisi (çoğu zaman en düşük maliyet) | Akıllı teklif (Maksimum dönüşüm, tCPA, tROAS, Maksimum tıklama) | P | Acemide sorulmaz, reçetede [çıkarım] |
| Konum | `geo_locations` kovaları BİRLEŞİM (CLAUDE.md) | Konum ölçütü + **PRESENCE_OR_INTEREST varsayılan** (konumda bulunan ya da konumla ilgilenen) [belge [S21][S21], [S33][S33]] | Ç | Ortak "nerede" alanı; Google'da PRESENCE açıkça yazılmalı (yerel işletme için) [çıkarım] |
| Kitle | Advantage+ kitle: yaş/cinsiyet öneri, en düşük yaş/konum/dil kesin (R2 özet 3) | Arama'da kitle varsayılan **gözlem**; PMax'te kitle "sinyal", dışına çıkabilir; Demand Gen'de optimize hedefleme açıkken kitle sinyal [belge [S23][S23], [S24][S24]] | P | "Kesin sınır / öneri" iki kutusu iki platformda da geçerli ama kutuların içeriği farklı |
| Niyet sinyali | Davranış, ilgi alanı, benzer kitle | **Anahtar kelime** (Arama); AI Max açıksa anahtar kelimesiz eşleme | P | Arama kampanyasının kalbi; Meta'da karşılığı yok |
| Yerleşim / ağ | Advantage+ yerleşim (FB, IG, Messenger, Audience Network, Threads) | Arama ağı + arama ortakları (varsayılan dahil, R2 K65), Display ağı, YouTube, Discover, Gmail | P | |
| Kreatif birimi | Görsel/video + ana metin + başlık; reklam başına | RSA: 15'e kadar başlık (≤30 kr), 4'e kadar açıklama (≤90 kr, en az 2); PMax: varlık grubu (metin + görsel + video + logo); Demand Gen: görsel/video | Ç | Ortak "kreatif fikri"; paketleyici platform başına (TASARIM satır 5080: metin havuzu platformdan bağımsız) [belge [S34][S34]; depo] |
| Telefon araması | `OUTCOME_LEADS` + `QUALITY_CALL` + `CALL_NOW` (Advetics `ARAMA` niyeti, kanıt: belge) | Arama kampanyasında arama öğesi (call asset) | Ç | Ad çakışması: `ARAMA` ≠ Google Arama [belge depo `niyetler.ts`] |
| Ölçüm etiketi | Meta Pixel (veri kümesi) | Google etiketi / GTM + dönüşüm işlemi (conversion action) | P | |
| Sunucu tarafı | Conversions API; piksel ile `event_id` + `event_name` eşleşirse 48 saat içinde tekilleştirme | Gelişmiş dönüşümler (hash'lenmiş birinci taraf veri) + çevrim dışı yükleme; tekilleştirme `gclid` / sipariş kimliğiyle | P | [belge [S35][S35] (Meta resmî), [S36][S36] (özet)] |
| Dönüşüm tanımı | Optimizasyon olayı reklam setinde seçiliyor | Dönüşüm işlemleri hesap/kampanya düzeyinde "birincil/ikincil"; `metrics.conversions` yalnızca birincil olanları sayıyor | P | Depo: `google.provider.ts` `metrics.conversions` tek sayı, eylem kırılımı ayrı sorguda (CLAUDE.md "segment eklemek satırı çoğaltıyor") |
| Atıf modeli | Son dokunuş (Meta içi) | **Veri odaklı atıf varsayılan**; dönüşümü Google içi temas noktalarına paylaştırıyor [belge [S13][S13] ikincil] | P | |
| Atıf penceresi | Varsayılan 7g tıklama + 1g görüntüleme; 28g tıklama yalnız raporlama; 7g/28g görüntüleme 2026-01'den beri yok [belge [S12][S12]] | Tıklama varsayılan 30 gün (1–90), görüntüleme 1 gün, etkileşimli izleme 3 gün [belge [S13][S13]] | P | Ekranda her platform satırının yanında yazılı [çıkarım] |
| Raporlama günü | Advetics `action_report_time=impression` gönderiyor (gösterim günü) [belge depo `meta.provider.ts:1085`] | `metrics.conversions` etkileşim (tıklama) gününe; dönüşüm gününe göre ayrı metrik `conversions_by_conversion_date` [belge [S37][S37]] | P | İkisi de "temas günü"ne yakın ama aynı değil: Meta gösterim, Google tıklama [çıkarım] |
| Öğrenme | Reklam setinde ~50 optimizasyon olayı / 7 gün; önemli düzenleme sıfırlar [belge [S15][S15] ikincil] | Akıllı teklif öğrenmesi; PMax 1–6 hafta (R2 B2) | P | "Öğreniyor" rozeti ortak kalıp, sebep metni platform başına |
| Prova | `execution_options: ['validate_only']` (+ `include_recommendations`) [belge [S19][S19]] | Her `mutate` isteğinde `validate_only: true`; yalnızca hata döner [belge [S18][S18]] | Ç | §4.2 |
| Atomiklik | Nesne nesne (kampanya → set → kreatif → reklam) | Tek `GoogleAdsService.Mutate` isteğinde geçici kaynak adlarıyla bütün ağaç; `partialFailure: false` ile ya hepsi ya hiçbiri [belge [S18][S18]; CLAUDE.md] | P | |
| Durum | `status` + `effective_status` (`IN_PROCESS`, `PENDING_REVIEW`…) | `status` (ENABLED/PAUSED/REMOVED) + `primary_status` ve sebepleri | Ç | Ortak durum sözlüğü TASARIM §11'de; Google için `kapali_kuruldu` |
| Silme | Arşivle / sil | `REMOVED` (geri alınamaz) | P | Ajana ikisi de verilmez (R5 Ö3) |
| Değişiklik geçmişi | `activities` uç noktası | `change_event`: son 30 gün, sorgu başına 10.000 satır, `client_type` (API/web) ve önceki/sonraki değer [belge [S38][S38]] | Ç | "Advetics dışından değişti" işareti iki platformda da kurulabilir |
| Kota | Hesap başına BUC (depo kota bekçisi) | Basic: 15.000 işlem/gün; Standard: sınırsız işlem; 2026-09'dan beri Cloud projesine bağlı [belge [S39][S39], [S26][S26]] | P | |
| Para | Hesap para birimi, alt birim | micros (BigInt) | O | Depo zaten micros (CLAUDE.md §4) |

### 2.2 Niyetten platform reçetesine

Advetics'te Meta reçetesi zaten tek kaynakta (`packages/shared/src/reklam/meta/niyetler.ts`: her satır
`objective` + `optimizationGoal` + `destinationType` + `promotedObject` + CTA'yı birlikte belirliyor).
Önerim: **aynı satıra bir `google` alt nesnesi**, Meta'daki gibi kanıt etiketiyle [çıkarım].

| `NiyetKodu` | Ekran adı | Meta (bugün) | Google karşılığı (öneri) | Google kanıtı |
|---|---|---|---|---|
| `FORM` | Form doldursunlar | LEADS + Lead form | Arama + potansiyel müşteri formu öğesi ya da siteye form; dönüşüm işlemi şart | yok; canlı ölçüm |
| `WHATSAPP` | WhatsApp'tan yazsınlar | WhatsApp hedefi (CLAUDE.md) | **Karşılığı yok** (TASARIM satır 3972 örneği: "Google'da WhatsApp gibi") → `hic_olmayacak` | [belge depo] |
| `SITE` | Siteye gelsinler | TRAFFIC | Arama + Maksimum tıklama | belge (`google-write.ts` Arama gövdesi) |
| `SATIS` | Satış | SALES + piksel | PMax ya da Arama + dönüşüm işlemi; **dönüşüm takibi yoksa PMax açılmaz** (depo `google-write.ts` başlığındaki K14 gerekçesi) | [belge depo] |
| `ARAMA` | Beni arasınlar | LEADS + QUALITY_CALL | Arama + arama öğesi; ekran adı Google satırında "Telefon araması" yazılmalı | yok |
| `ERISIM` | Çok kişi görsün | AWARENESS | Demand Gen ya da Video (API'den Video kurulamaz → yalnız Demand Gen) | [belge CLAUDE.md] |
| `ONE_CIKAR`, `IG_MESAJ`, `MESSENGER`, `COK_KANAL_MESAJ` | Meta'ya özgü | — | `hic_olmayacak` | — |

Kural [çıkarım]: Google sütunu boş olan niyet tek platformlu doğar ve sohbet bunu **ilk turda**
söyler ("WhatsApp mesajı yalnız Meta'da olur"). Kullanıcı Google'ı açıkça isterse niyet değişikliği
önerilir, sessizce başka bir Google ürününe çevrilmez.

### 2.3 Ortak gösterilecek olan, platforma özel kalacak olan

**Ortak (tek kart, tek alan):** niyet; toplam bütçe ve süre; konum (insan dilinde); dil; kreatif
fikri ve metin havuzu; yasal uyarı ve uyum paketi; durum (ortak sözlükten); harcama; gösterim;
"platformun bildirdiği sonuç" (yanında platform adı ve pencere); Advetics'in kendi saydığı sonuç
(lead, WhatsApp konuşması değil, form kaydı) [çıkarım].

**Ortak alan + platforma çeviri (kullanıcı tek değer girer, derleyici iki gövde üretir):** bütçe
(Google'da ayrı kaynak, Meta'da kampanya/set), konum (Google'da PRESENCE açıkça), kreatif
(RSA paketleyici / Meta paketleyici), takvim (Google kampanya başlangıç-bitiş, Meta set takvimi) [çıkarım].

**Yalnızca platform satırında (Gelişmiş'te açılır):** anahtar kelimeler ve eşleme türü, negatif
kelimeler, arama ortakları, AI Max, teklif stratejisi; Meta'da Advantage+ anahtarları, yerleşim,
optimizasyon olayı, ilgi alanları; iki tarafta da atıf ayarı ve dönüşüm işlemi seçimi [çıkarım].

### 2.4 Metriklerin karşılaştırılabilirliği

| Metrik | Kıyaslanabilir mi? | Neden | Panelde |
|---|---|---|---|
| Harcama | Evet | İki platform da para birimi + micros; vergi/KDV hariç | Toplanabilir |
| Gösterim | Kısmen | İkisi de "gösterildi"; ama Google Arama gösterimi bir sorguya cevap, Meta akış gösterimi değil [çıkarım] | Toplanabilir, yanında "farklı anlam" notu yok (gürültü olur) |
| Erişim | Hayır | Google Arama'da erişim metriği yok; iki platform aynı kişiyi ayrı sayar | Platform başına |
| Tıklama | Dikkatle | Meta'da "tüm tıklamalar" ile "bağlantı tıklaması" ayrı; Google `clicks` reklam tıklaması [çıkarım] | Meta'da bağlantı tıklaması seçilmeli; ortak sütun "Siteye tıklama" |
| TBM / EBM | Dikkatle | Tıklama tanımına bağlı | Platform başına |
| Dönüşüm | **Hayır** | Atıf modeli (veri odaklı ↔ son dokunuş), pencere (30g tık ↔ 7g tık + 1g gör), görüntüleme dahil mi, tarih ekseni (tıklama ↔ gösterim günü), aynı satışın iki kez sahiplenilmesi [belge [S12][S12], [S13][S13], [S14][S14], [S37][S37]] | **Asla toplanmaz**; platform adıyla ayrı satır |
| CPA / ROAS | **Hayır** | Payda/pay dönüşüme bağlı | Platform başına; "hangisi daha iyi" cümlesi kurulmaz |
| Advetics'in kendi saydığı lead / form / çağrı kaydı | **Evet** | Tek kaynak, tek tanım | Çapraz doğruluk buradan |

Google'ın kendi itirafı önemli: Demand Gen için açtığı "Conversions (Platform Comparable)" sütunu
yalnız Demand Gen'i alıyor, son Demand Gen temasına tam kredi veriyor (tıklama > etkileşimli izleme >
görüntüleme) ve **geçmiş verisi yok** [belge [S14][S14]]. Yani Google bile kendi standart sütununun
Meta ile kıyaslanamadığını kabul ediyor. Ayrıca sektör analizi Advantage+'ta bildirilen ROAS sabitken
yeni müşteri edinme maliyetinin bir yılda iki katına çıktığını yazıyor [belge [S40][S40] özet, satıcı
dışı ama ikincil] → platformun bildirdiği getiri artımsal etki değil [çıkarım].

**Öneri [çıkarım]:** Ortak raporun üst satırı "Toplam harcama" ve "Advetics'in saydığı sonuç"tan,
altı platform satırlarından oluşur. Platform satırında dönüşüm sayısının yanında sabit bir etiket:
"Meta'nın saydığı · 7 gün tıklama + 1 gün görüntüleme" / "Google'ın saydığı · 30 gün tıklama, veri
odaklı". Bu metin `ATIF_SECENEKLERI` gibi **tek bir sabitten** türetilir (CLAUDE.md "kullanıcıya
gösterilen sınır sabitten türemeli"). Meta satırındaki pencere Advetics'in bütün müşterilerde
dayattığı standarttan (`ATIF_STANDARTLARI`) okunur; Google'ın penceresi dönüşüm işleminden okunup
gösterilir, çünkü Google'da atıf kampanyada değil dönüşüm işleminde [belge depo `taslak.ts`; çıkarım].

---

## 3. Platform seçimi ve platformlar arası bütçe dağıtımı

### 3.1 "Bu amaç hangi platforma uygun": acemi için kurallar

Kurallar **kod** (saf fonksiyon, örneğin `platformOner(niyet, sinyaller)`), model değil; model yalnızca
çıktıyı Türkçe gerekçeyle anlatır ve kullanıcının itirazını kaydeder (R5 B3.1 "sohbet kabuğu olan iş
akışı") [çıkarım].

| # | Koşul (ölçülen sinyal) | Öneri | Gerekçe | Etiket |
|---|---|---|---|---|
| K1 | Niyetin Google karşılığı yok (WhatsApp, IG mesaj, gönderi öne çıkarma) | Yalnız Meta | §2.2 | [belge depo] |
| K2 | Ürün/hizmet için Türkiye'de anlamlı arama hacmi var (Keyword Planner ile ölçülür) ve niyet SITE/FORM/ARAMA/SATIS | Google Arama birincil | Google beyan edilmiş niyeti yakalar; Arama "ürününüzü aktif olarak arayanlara" gösterir | [belge [S20][S20], [S41][S41] özet] |
| K3 | Arama hacmi yok ya da çok düşük (yeni kategori, dürtüsel ürün) | Meta birincil | Arama yalnızca var olan talebi yakalar; talep yaratma akışta olur | [belge [S41][S41] özet; çıkarım] |
| K4 | Görsel ağırlıklı ürün (moda, yemek, dekor, kozmetik), görsel/video var | Meta birincil | Meta "çıkarılmış davranış" ile hedefler; kreatif taşıyıcı | [çıkarım; [S41][S41]] |
| K5 | "Telefonum çalsın", "yakınımdaki" yerel hizmet (tesisatçı, klinik dışı servis) | Google Arama + arama öğesi, konum PRESENCE | Acil niyet aramada | [çıkarım] |
| K6 | Dönüşüm takibi yok (ne piksel ne Google etiketi) | Satış/PMax önerilmez; SITE/FORM (Meta lead formu) ya da Arama + Maksimum tıklama | Takipsiz PMax öğrenmez (depo K14) | [belge depo `google-write.ts`] |
| K7 | Video var ve niyet ERISIM | Meta (Reels) birincil; Google Demand Gen yalnız bütçe K9 eşiğini geçerse | Video API'den kurulamaz; Demand Gen bütçe eşiği yüksek | [belge CLAUDE.md, [S17][S17]] |
| K8 | Hassas/özel kategori (konut, istihdam, finans, sağlık) | İki platform da ayrı kural paketiyle; yurt içi sağlık ENGEL (hükümler C-2) | Meta özel kategori; Google kişiselleştirilmiş reklam politikası | [belge depo `hukumler.md`; çıkarım] |
| K9 | Toplam bütçe ikinci platformun eşiğini (§3.2) karşılamıyor | Tek platform; ikinci platform "eşik aşılınca" önerisi olarak bekler | İki platformu da öğrenmeden bırakmamak | [çıkarım; [S15][S15], [S16][S16]] |

**Arama hacmi sinyali [çıkarım]:** Google Ads API'deki anahtar kelime fikir servisi
(`KeywordPlanIdeaService.GenerateKeywordIdeas`) Türkiye + Türkçe için aylık arama aralığı veriyor;
modelin "insanlar bunu arar" tahmini yerine bu ölçüm kullanılmalı. Bu çağrının Basic erişimde ve
müşteri hesabında çalıştığı, kota maliyeti ve Türkçe sonuç kalitesi **canlıda ölçülmedi** (Açık soru 3).
CLAUDE.md'deki Meta ilgi alanı dersi burada da geçerli: boş sonuç "hacim yok" ile "terim eşleşmedi"
arasında ayırt edilmeli (`bos_neden`).

### 3.2 En düşük anlamlı bütçe: platformların kendi eşikleri

| Platform / tür | Platformun eşiği | Örnek (hedef sonuç başı maliyet 200 TL) | Kaynak |
|---|---|---|---|
| Meta reklam seti | 7 günde ~50 optimizasyon olayı | 50 × 200 / 7 ≈ **1.430 TL/gün** (her reklam seti için) | [S15][S15] [belge, ikincil; Meta Yardım Merkezi ifadesi] |
| Google PMax | Günlük bütçe ≥ 3 × CPA | **600 TL/gün** | [S16][S16] [belge, Google API rehberi] |
| Google Demand Gen (tCPA) | Günlük ≥ 10 × CPA (2026-08'e kadar 15×) | **2.000 TL/gün** | [S17][S17] [belge, ikincil] |
| Google Arama (Maksimum tıklama) | Resmî taban yok | Tıklama başı maliyet × anlamlı tıklama sayısı | [çıkarım] |

Sonuçlar [çıkarım]:
- Eşikler sonuç başı maliyete bağlı ve acemi o maliyeti bilmiyor. İlk kurulumda kullanılacak maliyet
  ya Advetics'te aynı müşterinin geçmiş verisinden ya da sektör ön ayarından gelir; ikisi de yoksa
  eşik hesabı **gösterilmez**, "ilk iki hafta tek platformda veri toplayalım" denir. Uydurma bir CPA
  ile hesaplanmış eşik, yanlış bir rakamı kesinlik gibi sunar.
- Meta eşiği **reklam seti başına**: Advetics'in tek set reçetesi bunu zaten koruyor; Google'da
  eşik kampanya başına. İki platforma bölünen bütçe her iki eşiği ayrı ayrı karşılamalı.
- Eşik "öneri" değil "uyarı" olarak gösterilir; kullanıcı altında kalmayı seçebilir ama kart
  "bu bütçeyle Meta öğrenme aşamasından çıkamayabilir" der (R2 Ö6 "Yayına engel / Uyarı / Öneri").

### 3.3 Dağıtım kuralları

1. **Başlangıç:** K1–K9'dan çıkan birincil platform bütçenin tamamını alır. İkinci platform yalnızca
   kalan bütçe onun eşiğini karşılıyorsa önerilir; öneri hiçbir zaman seçili gelmez (README §6.5
   ilkesi) [çıkarım].
2. **İki platform birlikte açılırsa** bölüşüm sabit oranla değil "her platforma kendi eşiği, artanı
   birincile" mantığıyla yapılır; oran ekranda gerekçesiyle yazılır [çıkarım].
3. **Yeniden dağıtım** öneri kartıdır, otomatik değil; en sık haftada bir; tek seferde ±%20'yi
   geçmez, çünkü Meta'da büyük bütçe değişikliği öğrenmeyi sıfırlayan "önemli düzenleme" sayılıyor
   [belge [S15][S15] ikincil; çıkarım].
4. **Karar ölçütü** platformun bildirdiği CPA/ROAS değil (kıyaslanamaz, §2.4); Advetics'in saydığı
   sonuç başına maliyet (lead tablosundaki form, `leads` modülü). O yoksa kart "platformları
   karşılaştıracak ortak bir sayı yok" der ve kaydırma önermez [çıkarım].
5. **Büyük müşteride** artımsallık için MMM (Google Meridian 2025-01'den beri açık kaynak ve genel
   kullanımda; Meta Robyn) ya da platformların lift testleri; bu AdvCampaign'in ilk sürümünün işi
   değil [belge [S42][S42], [S43][S43]; çıkarım].
6. **Albert tarzı onaysız kaydırma yok.** Gerekçe: karar verdiren sayı kıyaslanamaz; iki platformda
   öğrenmeyi sıfırlar; ve R5'in belgelediği başarısızlıkların hepsi onaysız uygulamada [belge
   [S5][S5]; R5 özet 1].

---

## 4. Sohbet ajanı mimarisi: ikinci platformun eklediği

R5'in O/T/C sınıfları, tutamaç deseni, onay kartının sunucu kapısı olması, `strict` şema + Zod
sınırları, `guvenilmeyen` alanı ve eval planı aynen geçerli. Aşağıdakiler iki platformun eklediği.

### 4.1 Araç katmanı: platformdan bağımsız yüz, platforma özgü iç

- **Araçlar platform adı taşımaz, parametre taşır** (`platform: 'meta' | 'google'` enum'u, `strict`).
  `meta_butce_degistir` ve `google_butce_degistir` diye ikiye bölmek araç sayısını ikiye katlar ve
  modele yanlış aracı seçme fırsatı verir; Anthropic'in araç rehberi ilgili işlemleri tek araçta
  birleştirmeyi öneriyor (R5 B3.2) [çıkarım].
- **Ama `platform` enum'u `PLATFORMS` sabitinden türetilmez.** Yazma araçlarının enum'u
  `DRAFT_PLATFORMS` gibi **bilerek dar** bir listeden gelir; LinkedIn'in okuma platformu olması onu
  yazma aracına sokmamalı (CLAUDE.md "kasıtlı olarak DAR kalan listeler") [belge depo; çıkarım].
- **Yeni okuma araçları:** `platform_oner` (§3.1 fonksiyonunun çıktısı + gerekçe + ölçülen sinyaller),
  `arama_hacmi` (Keyword Planner; `bos_neden`li), `donusum_kurulumu` (iki platformda ölçüm durumu:
  piksel/CAPI sağlığı, Google dönüşüm işlemleri ve birincil/ikincil, son dönüşüm zamanı) [çıkarım].
- **Taslak tek, platform satırları çok:** `taslak_olustur` bir niyet ve bir bütçe alır; derleyici
  platform başına satır üretir. Model platform gövdesi yazmaz; R5 B3.3'ün "model seçer, yazmaz"
  kuralı Google'da daha da önemli, çünkü Google gövdesinde `updateMask` gibi unutulunca SESSİZCE
  yok sayılan alanlar var [belge depo `google-write.ts`].
- **Okuma Advetics veritabanından.** Ajan performans sorusunda platform API'sine gitmez (R5 K4);
  canlı okuma yalnızca prova, geri okuma ve onaydan hemen önceki "taze değer" için [çıkarım].

### 4.2 Prova: iki platformda aynı söz, farklı mekanizma

| | Meta | Google |
|---|---|---|
| Mekanizma | `execution_options: ['validate_only']`; Advetics ayrıca `synchronous_ad_review` gönderiyor [belge depo `yayin-baslat.spec.ts:310`, [S19][S19]] | Her mutate isteğinde `validate_only: true` [belge [S18][S18]] |
| Kapsam | Nesne başına; Advetics nesne açmadan satır içi kampanya/set ile provalıyor (commit 3e507da) [belge depo] | Bütçe + kampanya + grup + reklam tek `GoogleAdsService.Mutate` isteğinde geçici kaynak adlarıyla [belge [S18][S18]] |
| Başarı yanıtı | `{"success": true}`; Advetics kimlik dönerse nesne açılmış sayıp alarm veriyor [belge depo `meta-graf.ts:185`] | "Yalnızca hatalar döner, sonuç dönmez" [belge [S18][S18]] |
| Ek | `include_recommendations` Meta'nın önerilerini döndürür | — |
| Bilinen boşluk | Meta 5xx'i (son commit) | Prova politika incelemesini kapsamaz [çıkarım]; canlıda hiç denenmedi |

Kural [çıkarım]: **"Prova geçti" platform başına yazılır.** İki satırlı bir planda "hazır" yalnızca
iki satır da geçtiyse; biri geçip diğeri düşerse kart iki satırı ayrı gösterir ve kullanıcı "yalnız
geçeni yayınla"yı seçebilir. Ama varsayılan bu değil: kullanıcı iki platformlu plan onayladıysa yarım
yayın onun kararı olmalı.

### 4.3 Onay kartı ve yayın

- Kart **platform başına bir satır**: platform, ne kurulacak (tür, bütçe yeri, günlük tutar, konum
  kuralı), platformun otomatik yaptıkları (Meta: Advantage+ listesi; Google: AI Max, arama ortakları,
  konum "ilgilenen" dahil mi, bütçe 2× esnekliği), prova sonucu [çıkarım].
- **Google satırı TASARIM'a göre `kapali_kuruldu` ile biter**: geri okuma ve açma yok, düğme "Meta'da
  yayınla · Google'da kapalı kur", "hepsi yayında" özeti yalnız bütün satırlar ACTIVE ise [belge depo
  `TASARIM.md` satır 3989, 6857–6864]. Ajan bunu "Google'da yayınlandı" diye özetleyemez; durum cümlesini
  sunucu yazar (R5 B3.7).
- **Tek onay iki platformu kapsar ama iki ayrı işlem kaydı üretir** (`yayinlar` satırı platform başına)
  [çıkarım]. Kısmi başarısızlıkta bir platformdaki para harcayan kurulum diğerinin hatasıyla geri
  alınmaz: kart iki sonucu ayrı yazar (CLAUDE.md "kayıt yazılamazsa `creating` kalmalı" ilkesinin çok
  platformlu hâli).

### 4.4 Geri alma

- Reklamda gerçek "geri alma" yok, **ters işlem** var: durdur, bütçeyi eski değere döndür, arşivle.
  Harcanmış para geri gelmez; kart bunu söyler [çıkarım].
- Ters işlem için eski değer **işlemden önce taze okunup** kaydedilir (R5 Ö3 `butce_degistir`: "eski →
  yeni, taze okunmuş"). Google'da `change_event` son 30 günün önceki/sonraki değerini tutuyor ve
  `client_type` ile değişikliğin API'den mi web arayüzünden mi geldiğini ayırıyor; bu, "Advetics dışından
  değişti, geri alma eski değeri ezer" uyarısının kaynağı olabilir [belge [S38][S38]; çıkarım].
- Meta'da aynı iş `activities` ile (R5 Ö3 `degisiklik_gecmisi`). Kullanıcı hafızası Meta hesaplarının
  artık MCP ile de yönetildiğini söylüyor: geri alma kartı, Advetics'in kaydettiği "eski" değerin
  platformdaki gerçek değerle aynı olduğunu kontrol etmeden uygulanmamalı [çıkarım].
- Google `REMOVED` ve Meta silme geri alınamaz; ajana verilmez (R5 Ö3 "hiç verilmez").

### 4.5 Denetim kaydı

Her yazma için platform başına bir satır [çıkarım]: kullanıcı, workspace, konuşma kimliği, kullanıcının
asıl cümlesi (Meta MCP'nin `advertiser_request` alanı gibi; R5 B3.10), platform, işlem, gövdenin özeti
(SHA-256), prova sonucu, platform yanıtı (hata kod/alt kod), geri okuma farkı, onay kimliği. `audit_logs`
BIGSERIAL (CLAUDE.md); ham gövde saklanırsa token/şifreli alan içermediği kaynak taramasıyla kilitlenmeli.

### 4.6 Maliyet ve kota

- **Google:** Basic erişim 15.000 işlem/gün (kayan 24 saat) [belge [S39][S39]]; bu sınır geliştirici
  token'ı başınaydı, 2026-09-10'dan beri Cloud projesine bağlı ve "entegrasyon başına bir proje"
  kuralı var [belge [S26][S26] ikincil]. Ajansın bütün müşterileri tek projeyi paylaşır; bir müşterinin
  toplu işi diğerlerinin provasını tüketebilir → Google için de hesap başı kota bekçisi gerekir
  (Meta'daki gibi) [çıkarım].
- **Meta:** BUC hesap başına (depo kota bekçisi); CLAUDE.md "bağımlı iş bağlı olduğu işin kotasını
  yiyebilir" dersi prova için de geçerli: başarısız prova tekrarı kota harcar, ön koşul kontrolü
  (sıfır çağrı) önce yapılır.
- **LLM:** R5 B3.11'deki sohbet başı maliyet; iki platform bağlamı araç tanımlarını ve sözlüğü büyütür.
  Platforma özgü sözlük (`alan_sozlugu`) ancak istenince yüklenmeli (R5 "araç arama" önerisi) [çıkarım].

### 4.7 Hatalı tavsiye riskleri (iki platforma özgü)

| Risk | Nasıl oluşur | Engel | Etiket |
|---|---|---|---|
| Dönüşümleri toplamak | Model "toplam 120 dönüşüm" der | Performans aracı platformlar arası toplam dönüşüm alanı **döndürmez**; yalnız platform satırları + Advetics sayımı | [çıkarım] |
| Platform ROAS'ına göre bütçe kaydırma | "Meta'nın ROAS'ı daha yüksek, bütçeyi oraya alalım" | §3.3 kural 4: kaydırma kartı yalnız ortak ölçüt varsa üretilir | [çıkarım] |
| Pencere kayması | Meta 7g görüntüleme isteyen eski bir sorgu boş döner, model "dönüşüm yok" der | Pencere sabitten; boş dönüş `bos_neden` taşır | [belge [S12][S12]] |
| Arama hacmi uydurmak | "Bu ürünü çok arıyorlar" | `arama_hacmi` aracı; ölçüm yoksa cümle kurulmaz | [çıkarım] |
| Sessiz Google varsayılanı | Konum "ilgilenen" dahil, AI Max açık, arama ortakları dahil; yerel işletmenin parası şehir dışına gider | Derleyici her birini açıkça yazar ve geri okur; kartta "Google'ın otomatik yaptıkları" listesi | [belge [S21][S21], [S22][S22]; R2 K65] |
| Kitleyi sınır sanmak | Kullanıcı "yalnız kadınlar" der; PMax/Demand Gen sinyali dışına çıkar, Arama'da kitle gözlem | Kartta "kesin sınır / öneri" ayrımı Google satırında da | [belge [S23][S23], [S24][S24]] |
| Eşik altı bütçeyi bölmek | İki platform da öğrenemez | §3.2 eşik uyarısı | [çıkarım] |
| Takipsiz PMax | Öğrenmeyen kampanya para harcar | K6; `donusum_kurulumu` ön koşulu | [belge depo] |
| Aynı müşteriyi iki kez satın almak | Marka araması PMax'te + Meta yeniden hedefleme aynı kişiye | İlk sürümde yeniden hedefleme yalnız bir platformda; marka kelimesi Arama'da ayrı | [çıkarım] |
| Ad çakışması | "Arama kampanyası kur" isteği `ARAMA` (telefon) niyetine eşlenir | Ekran adları platform satırında ayrı; niyet kodu kullanıcıya gösterilmez; eval senaryosu | [belge depo; çıkarım] |
| Türkçe metin sınırları | RSA başlık 30 karakter; Türkçe ekler uzun | Paketleyici karakter sayısını giriş anında söyler | [belge [S34][S34]] |
| MCP'den yapılan değişiklik | Aynı hesap Meta MCP'den de değiştiriliyor; Advetics eski rakamla karar verir | Onaydan önce taze okuma; `degisiklik_gecmisi` | [belge [S1][S1]; kullanıcı hafızası] |

### 4.8 Mevcut kodla temas noktaları (KOD YAZILMADI, gözlem)

- `apps/api/src/modules/reklam/ai-taslak.ts`: `AI_NIYETLERI = ['FORM','WHATSAPP','SITE','SATIS']` ve
  `aiCiktiSchema` platform alanı taşımıyor; model yalnızca niyet seçiyor. İki platformlu akışta da
  modelin seçmesi gereken şey bu kalmalı; platform kararı §3.1 fonksiyonuna ait [belge depo; çıkarım].
  Şemadaki "bütçe yalnız cümlede yazıyorsa" kuralı iki platformda daha da önemli: bölüşüm oranını model
  önermemeli.
- `packages/shared/src/reklam/meta/niyetler.ts`: Google alt nesnesi için doğal yer; `kanit: 'belge'`
  satırlarının Acemi'ye gösterilmemesi kuralı Google'a da uygulanırsa ilk günde Google satırının
  tamamı Acemi'de kapalı olur. Bu tutarlı (Google yazma yolu canlıda hiç denenmedi) [belge depo].
- `apps/api/src/modules/connections/providers/google-write.ts` ve `google-demandgen.ts`: Arama ve
  Demand Gen gövdeleri saf fonksiyon olarak var, `partialFailure: false` ve PAUSED kuruluyor; prova
  (`validate_only`) bu dosyalarda görülmedi [belge depo; tarama `validate_only` yalnız Meta tarafında
  eşleşti].
- `meta.provider.ts`: `use_unified_attribution_setting=true` ve `action_report_time=impression`
  açıkça yazılıyor; Google tarafında `metrics.conversions` etkileşim gününe göre. İki ekseni tek
  grafikte üst üste çizmek gün kaymasına yol açabilir; grafik başlığında yazılmalı [belge depo; çıkarım].
- `TASARIM.md`: "AI: Google'da salt okur" [T-4] ve "AI ASİSTAN SATIRI · iki alt öğe, Meta ve Google
  ayrı" kararları var. AdvCampaign'in "aynı sohbetten iki platform" hedefi bu kararla **çelişiyor**;
  hangisinin geçerli olduğu kullanıcı kararı (Açık soru 1) [belge depo].

---

## 5. AdvCampaign için öneriler

| # | Öneri | Dayanak |
|---|---|---|
| Ö1 | Ortak model **niyet + bütçe toplamı + süre + konum + kreatif fikri**; derleyici platform başına satır üretir (`derleMeta`, `derleGoogle` zaten ayrı, TASARIM satır 3979) | §2.1, §2.3 |
| Ö2 | Niyet kataloğuna `google` alt nesnesi ve kanıt etiketi; karşılığı olmayan niyet `hic_olmayacak` ve ilk turda söylenir | §2.2 |
| Ö3 | `ARAMA` niyetinin ekran adı ve iç adı Google "Arama" ile çakışmayacak biçimde ayrılır (ör. iç kod korunur, ekran ve model sözlüğünde "Telefon araması") | Özet 10 |
| Ö4 | Platform seçimi saf fonksiyon (`platformOner`), girdileri ölçülmüş sinyaller (arama hacmi, ölçüm kurulumu, kreatif türü, bütçe eşiği); model gerekçeyi anlatır | §3.1 |
| Ö5 | Eşik tablosu tek sabitte; eşik altı bütçe ikinci platformu açmaz, uyarı gösterir | §3.2 |
| Ö6 | Rapor üst satırı: toplam harcama + Advetics'in saydığı sonuç; dönüşüm hiçbir zaman toplanmaz; platform satırında pencere etiketi sabitten | §2.4 |
| Ö7 | Google derleyicisi şu alanları **her zaman açıkça** yazar ve geri okuma listesine koyar: konum türü, arama ortakları, Display genişletmesi, AI Max durumu, teklif stratejisi, bütçe kaynağı ve teslim yöntemi | §4.7, CLAUDE.md |
| Ö8 | Google provasını `validate_only` ile tek atomik istekte kur; Meta'daki "validate_only olmadan gönderilmez" kilidinin aynısını Google'a da koy | §4.2 |
| Ö9 | Yeniden dağıtım yalnız öneri kartı, haftada en çok bir, ±%20 sınırlı, ortak ölçüt yoksa hiç | §3.3 |
| Ö10 | Google kota bekçisi hesap başına; Cloud projesi geçişi (2026-09-10) Advetics'in Google erişimi için ayrıca kontrol edilir | §4.6 |
| Ö11 | Eval setine iki platforma özgü senaryolar: "WhatsApp'tan yazsınlar ama Google'da da olsun", "arama kampanyası kur" (telefon değil), "toplam kaç dönüşüm aldık", eşik altı bütçeyle iki platform isteği, "Meta daha iyi, bütçeyi oraya kaydır" | §4.7, R5 B3.9 |

---

## Açık sorular

1. **TASARIM T-4 ("AI Google'da salt okur") ile AdvCampaign hedefi ("aynı sohbetten Meta ve Google'a
   kurulum") çelişiyor.** İlk sürümde Google'da ajan yalnız okur mu, yoksa "kapalı kur" (`kapali_kuruldu`)
   kartını da açabilir mi? (Kullanıcı kararı.)
2. **Google yazma yolu canlıda hiç denenmedi.** İlk canlı tur hangi niyetle (öneri: SITE → Arama +
   Maksimum tıklama, en küçük bütçe, PAUSED) ve hangi hesapta yapılacak? `validate_only` ile prova
   ondan önce ölçülmeli.
3. **Keyword Planner** Advetics'in erişim düzeyinde ve müşteri hesabında çalışıyor mu, Türkçe sorgu
   kalitesi ve kota maliyeti ne? Ölçülmeden K2/K3 kuralları "belge" seviyesinde kalır.
4. **2026-09-10 Cloud projesi geçişi** Advetics'in mevcut Google erişimini etkiledi mi; marka
   doğrulaması ve yeniden başvuru gerekiyor mu? (Kaynak ikincil; Google'ın kendi duyurusundan
   doğrulanmalı.)
5. **Ortak ölçüt:** Advetics'in kendi saydığı sonuç bugün yalnızca Meta lead formu için var mı?
   Google'dan gelen form/çağrı ve site formu nasıl sayılacak? Bu yoksa §3.3 kural 4 hiçbir zaman
   kaydırma önermez.
6. **Google atıf penceresi** dönüşüm işleminde duruyor ve müşteriden müşteriye değişebiliyor. Meta'da
   olduğu gibi ajans standardı dayatılacak mı (dönüşüm işlemine yazma = hesap ayarı değiştirmek;
   ajana verilmiyor), yoksa yalnızca okunup gösterilecek mi?
7. **Demand Gen eşiği** (10× / 15×) kaynaklarda çelişiyor; Google'ın güncel yardım sayfasından
   doğrulanmalı.
8. **AI Max** yeni Arama kampanyalarında API'den kurulurken varsayılan açık mı, yalnız arayüzde mi?
   Kaynak 1 Eylül otomatik yükseltmesini anlatıyor; API davranışı canlıda geri okunmalı.
9. **Ajans–müşteri onayı** iki platformlu planda tek onay mı, platform başına onay mı? (R2 Ö9'un çok
   platformlu hâli.)
10. **Rakip araç iddiaları** (Albert'in otonom dağıtımı, Madgicx'in Google kapsamı, Bïrch'in Google
    kuralları) satıcı sayfası ya da ikincil kaynaktan; hiçbiri denenmedi.

---

## Kaynaklar

Okunma tarihi hepsi 2026-10-07. "(özet)" = yalnız arama özetinden okundu.

| Kod | Kaynak | Tür |
|---|---|---|
| S1 | PPC Land, Meta Ads AI Connectors (2026-04-29) | Sektör, okundu |
| S2 | github.com/googleads/google-ads-mcp | Resmî, okundu |
| S3 | Adspirer, "Why not official Google Ads MCP" | Satıcı, okundu |
| S4 | Google Ads Advisor yardım sayfası + ppc.land + blog.google | Resmî/sektör (özet) |
| S5 | albert.ai/faq | Satıcı, okundu |
| S6 | Madgicx, "Agentic advertising platforms" (2026-06-26) | Satıcı, okundu |
| S7 | groas.com, Madgicx vs groas (2026-05) | Rakip yazısı (özet) |
| S8 | Optmyzr, "What's new July 2026" + Sidekick sayfası | Satıcı, okundu |
| S9 | dupple.com Bïrch incelemesi | Sektör (özet) |
| S10 | Marketech APAC, Smartly Google genişlemesi (2023-06-15) | Sektör, okundu |
| S11 | toolradar Smartly | Sektör (özet) |
| S12 | Dataslayer, Meta atıf penceresi kaldırılması (2026-01-12) | Sektör (özet) |
| S13 | Google Ads dönüşüm penceresi yardım sayfası | Resmî (özet) |
| S14 | Google, Conversions (Platform Comparable) | Resmî, okundu |
| S15 | PPC Land, öğrenme aşaması | Sektör (özet) |
| S16 | Google Ads API, PMax bütçesi | Resmî (özet) |
| S17 | PPC News Feed, Demand Gen 10× (2026-08-18) | Sektör, okundu |
| S18 | Google Ads API, MutateGoogleAdsRequest | Resmî (özet) |
| S19 | Meta Marketing API, kampanya referansı (`execution_options`) | Resmî (özet) |
| S20 | Google Ads, kampanya türü seçimi | Resmî, okundu |
| S21 | Google Ads, gelişmiş konum seçenekleri | Resmî (özet) |
| S22 | PPC News Feed, AI Max varsayılan (2026-08) | Sektör, okundu |
| S23 | Google Ads, PMax kitle sinyalleri | Resmî (özet) |
| S24 | Google Ads, optimize hedefleme | Resmî (özet) |
| S25 | Search Engine Land, günlük bütçe 2× | Sektör (özet) |
| S26 | PPC Land, geliştirici token'ı → Cloud projesi (2026-09-10) | Sektör, okundu |
| S27 | martech.zone, Adzooma | Sektör (özet, eski) |
| S28 | superscale.ai, Pencil incelemesi 2026 | Sektör (özet) |
| S29 | pasqualepillitteri.it, Meta Ads MCP 29 araç | Sektör (özet) |
| S30 | Adspirer, otomatik reklam yönetimi | Satıcı (özet) |
| S31 | influee.co, Meta 6 ODAX amacı | Sektör (özet) |
| S32 | Google Ads, ortak bütçeler | Resmî (özet) |
| S33 | Google Ads API, PositiveGeoTargetType | Resmî (özet) |
| S34 | Google Ads, duyarlı arama reklamları | Resmî (özet) |
| S35 | Meta, piksel ve CAPI tekilleştirme | Resmî (özet) |
| S36 | Cometly, tekilleştirme | Satıcı (özet) |
| S37 | Google Ads API, dönüşüm raporlama | Resmî (özet) |
| S38 | Google Ads API, Change Event | Resmî (özet) |
| S39 | Google Ads API, erişim düzeyleri | Resmî (özet) |
| S40 | pixis.ai, Advantage+ vs PMax 2026 | Satıcı (özet) |
| S41 | Search Engine Land, Meta'dan Google'a genişleme + echai.ventures | Sektör (özet) |
| S42 | blog.google, Meridian herkese açık | Resmî (özet) |
| S43 | github.com/facebookexperimental/Robyn | Resmî (özet) |

Depo girdileri: `docs/meta-reklam-brief/arastirma/R2-urun-ux-kiyaslama.md`, `R5-yapay-zeka-kampanya.md`,
`docs/meta-reklam-brief/tasarim/TASARIM.md` (satır 142–144, 3972–3992, 6850–6915),
`packages/shared/src/reklam/meta/niyetler.ts`, `packages/shared/src/reklam/taslak.ts`,
`packages/shared/src/constants/platforms.ts`, `apps/api/src/modules/reklam/ai-taslak.ts`,
`apps/api/src/modules/reklam/meta-graf.ts`, `apps/api/src/modules/reklam/yayin-baslat.spec.ts`,
`apps/api/src/modules/connections/providers/google-write.ts`, `google-demandgen.ts`, `google.provider.ts`,
`meta.provider.ts`, `CLAUDE.md`.

[S1]: https://ppc.land/meta-opens-its-ad-system-to-claude-and-chatgpt-with-new-ai-connectors/
[S2]: https://github.com/googleads/google-ads-mcp
[S3]: https://www.adspirer.com/docs/knowledge-base/why-not-official-google-ads-mcp
[S4]: https://support.google.com/google-ads/answer/16574983
[S5]: https://albert.ai/faq/
[S6]: https://madgicx.com/blog/agentic-advertising-platforms
[S7]: https://www.groas.com/post/madgicx-vs-groas-2026-meta-first-ai-tool-vs-autonomous-google-ads-management
[S8]: https://help.optmyzr.com/en/articles/15886123-what-s-new-in-optmyzr-july-2026
[S9]: https://dupple.com/reviews/birch
[S10]: https://marketech-apac.com/smartly-io-expands-campaign-management-solutions-to-include-googles-ads-suite
[S11]: https://toolradar.com/tools/smartly-io
[S12]: https://dataslayer.ai/blog/meta-ads-attribution-window-removed-january-2026
[S13]: https://support.google.com/adwords/answer/6394265?hl=en-GB
[S14]: https://support.google.com/google-ads/answer/15299024?hl=en
[S15]: https://ppc.land/learning-phase/
[S16]: https://developers.google.com/google-ads/api/performance-max/create-budget?hl=en
[S17]: https://ppcnewsfeed.com/ppc-news/2026-08/google-lowers-demand-gen-budget-10x/
[S18]: https://developers.google.com/google-ads/api/reference/rpc/v21/MutateGoogleAdsRequest
[S19]: https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/campaigns
[S20]: https://support.google.com/google-ads/answer/2567043
[S21]: https://support.google.com/google-ads/answer/1722038?hl=en
[S22]: https://ppcnewsfeed.com/ppc-news/2026-08/ai-max-becoming-default-more-search-campaigns/
[S23]: https://support.google.com/google-ads/answer/14530785?hl=en
[S24]: https://support.google.com/google-ads/answer/12463119
[S25]: https://searchengineland.com/?p=283897
[S26]: https://ppc.land/google-drops-developer-tokens-from-ads-api-access-decisions/
[S27]: https://martech.zone/adzooma-ad-management-for-google-microsoft-facebook
[S28]: https://superscale.ai/alternatives/pencil/review
[S29]: https://pasqualepillitteri.it/en/news/1707/official-meta-ads-mcp-claude-29-tools-2026
[S30]: https://www.adspirer.com/blog/automated-ad-management
[S31]: https://influee.co/blog/meta-campaign-objectives
[S32]: https://support.google.com/google-ads/answer/10487241
[S33]: https://developers.google.com/google-ads/api/reference/rpc/v22/PositiveGeoTargetTypeEnum.PositiveGeoTargetType
[S34]: https://support.google.com/google-ads/answer/7684791?hl=en-GB
[S35]: https://developers.facebook.com/documentation/ads-commerce/conversions-api/deduplicate-pixel-and-server-events.md
[S36]: https://www.cometly.com/post/how-do-i-deduplicate-conversions-between-pixel-and-server-side-tracking
[S37]: https://developers.google.com/google-ads/api/docs/conversions/reporting
[S38]: https://developers.google.com/google-ads/api/docs/change-event
[S39]: https://developers.google.com/google-ads/api/docs/access-levels
[S40]: https://pixis.ai/blog/advantage-vs-performance-max-head-to-head-2026/
[S41]: https://searchengineland.com/meta-ads-expand-google-ads-453402
[S42]: https://blog.google/products/ads-commerce/meridian-marketing-mix-model-open-to-everyone/
[S43]: https://github.com/facebookexperimental/Robyn
