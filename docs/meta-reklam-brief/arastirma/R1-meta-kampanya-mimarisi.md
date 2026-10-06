# R1 — Meta'nın 2025–2026 kampanya mimarisi ve performans ilkeleri

> **Yöntem:** 2026-10-06'da yapıldı. Meta İşletme Yardım Merkezi sayfaları JavaScript ile yüklendiği için
> tarayıcıda açılıp metinleri (kapalı akordiyon bölümleri dahil) okundu; Meta for Business sayfaları, Meta for
> Developers blogu, sürüm sayfası ve referansları okundu; depodaki indirilmiş Marketing API sayfaları
> (`kaynak/`, 2026-10-06 kopyası) ve brief (`README.md`, `bolumler/00, 02, 03, 04, 05, 06, 08`) ile
> karşılaştırıldı. **Okunan:** 49 resmî Meta yardım/iş sayfası + 6 resmî geliştirici sayfası + 16 depodaki ham
> Meta belgesi tam metin; 3 sektör yazısı tam metin; ~8 sektör/topluluk kaynağı yalnız arama özeti düzeyinde
> (tabloda ayrıca işaretli). Oturumun web araması sınırı (200) doldu; son doğrulamalar resmî sayfalar doğrudan
> açılarak yapıldı.
>
> **Güvenilirlik özeti:** Bulguların büyük çoğunluğu **[Resmî-Meta]**. Yardım merkezi sayfalarında yayın
> tarihi yok; "2026-10-06'da canlı okundu, o gün geçerli" diye kabul edildi. Meta'nın kendi sayfaları dört
> yerde birbiriyle çelişiyor (özel kategori + Advantage+ kitle, Instagram akış görsel oranı, zamanlama + günlük
> bütçe, WhatsApp Durum kimliği); hiçbiri tahminle birleştirilmedi, hepsi "Açık sorular"da canlı ölçüm olarak
> duruyor. "%x daha düşük maliyet" türü sayılar Meta'nın KENDİ deney iddiaları; bağımsız doğrulaması yok.
> Bilgi canlı hesapta doğrulanmadı.

## Özet: yeni modül için ne demek

1. **Meta'nın 2025–2026 önerisi bağlayıcı kararlarla aynı yönde:** niyet başına az kampanya, az ad set,
   kampanya bütçesi, Advantage+ kitle ve Advantage+ yerleşim. Satış/lead/uygulama için "Advantage+ kampanya"
   bir alan değil SONUÇ (kampanya bütçesi + yerleşim kısıtı yok + en az bir ad set'te Advantage+ kitle).
   Tek ad set'li kampanyada kampanya bütçesi ad set bütçesiyle aynı çalışıyor → Advetics her zaman kampanya
   bütçesi kullanabilir. [Resmî-Meta · K12, K13, K16, K52]
2. **Öğrenme: son önemli değişiklikten sonraki haftada ~50 sonuç** ve sonuç ATIF PENCERESİ İÇİNDE sayılıyor.
   Brief'in "öğrenmeyi sıfırlayan değişiklik listesi belgede yok" notu yalnız Marketing API için doğru —
   **Yardım Merkezi'nde liste VAR** (hedefleme, kreatif, optimizasyon olayı, yeni reklam, 7+ gün duraklatma,
   teklif stratejisi; bütçe/teklif tutarı büyüklüğe bağlı). API'deki `learning_stage_info` "dinamik eşik"
   alanları taşıyor: 50 sabit kodlanmamalı. [Resmî-Meta · K1, K2, K45, K51]
3. **Bütçede Meta'nın tek sayısal kuralı:** maliyet hedefi kullanılıyorsa günlük bütçe hedefin en az 5 katı.
   Öğrenme dostu bütçe ≈ sonuç başı maliyet × 50 ÷ 7 (türetme). TL için resmî tablo yok; hesabın
   `minimum_budgets` değeri canlı okunmalı (birimi belgede yazmıyor). [Resmî-Meta · K31, K50]
4. **Advantage+ kitle açıkken kesin kalanlar:** konum, en düşük yaş (≤25), dil, özel kitle hariç tutma.
   Yaş/cinsiyet/ilgi/özel kitle dahil etme ÖNERİ. "Yanıt verme olasılığı yüksek daha fazla kişiye ulaş"
   seçeneği konumu da genişletiyor — sessiz genişleme adayı. [Resmî-Meta · K11, K15, K53]
5. **Hesap kontrolleri (`account_controls`)** hesaptaki bütün yeni VE mevcut kampanyalara görünmeden
   uygulanıyor, Advantage+'ı kapatmıyor — ama **konut/istihdam/finans ve siyasi kampanyalara UYGULANMIYOR.**
   [Resmî-Meta · K20, K12]
6. **HOUSING + Advantage+ kitle için Meta'nın kaynakları çelişiyor** (yardım: "erişemez"; API SSS: "kademeli
   açılıyor"; en yeni tarihli v26 blogu: özel kategoride `advantage_audience` açıkça yazılmalı). İki bağlayıcı
   kararın birlikte çalıştığı canlıda ölçülmeden kesin değil. Ayrıca **Türkiye, Meta'nın kısıt uygulanan
   Avrupa ülkeleri listesinde YOK** (17 km listesi); özel kategoride `subcity` türü konum desteklenmiyor.
   [Resmî-Meta · K11, K30, K48, K52, K55]
7. **Medya iki oranda istenmeli:** akış için 4:5, Stories/Reels/WhatsApp Durum için 9:16. Ads Manager'da
   yerleşime göre medya özelleştirmesi lead/WhatsApp/arama için var; API'deki karşılığının (PAC) desteklediği
   amaç listesi eski adlarla ve mesajlaşmasız yazılmış → WhatsApp niyetinde canlı doğrulama şart. [Resmî-Meta ·
   K24, K26, K27, K57]
8. **Kreatif sayısı:** Meta resmî olarak "az reklam, çeşitli varlık" diyor; Andromeda'yı anlatan resmî
   kaynaklar sayı vermiyor; sektörde "ad set başına 8–20+ kreatif" ile "Andromeda yetenektir, şart değil"
   görüşleri çatışıyor. Acemi varsayılanı için öneri: 3–5 farklı fikir, her biri iki oranda. [Resmî-Meta · K4,
   K8, K9; Sektör · K69, K71]
9. **Lead:** form türü "Daha fazla hacim" (varsayılan) / "Daha yüksek niyet" (onay ekranı, yalnız mobil
   FB/IG akışı). **Nisan 2026'dan beri "nitelikli lead" hedefi CAPI CRM entegrasyonu olmadan yeni kampanyada
   seçilemiyor**, mevcutlar Ağustos 2026'dan beri etkileniyor. [Resmî-Meta · K32, K35]
10. **WhatsApp:** lead amacında varsayılan hedef "konuşma"; "mesajlaşmayla lead" hedefi 30 günde ≥10 etiketli
    lead/satın alma (WhatsApp Business etiketleri ya da CAPI) istiyor; en az 7 gün çalıştırma ve karşılama
    mesajı Meta'nın önerisi. [Resmî-Meta · K37, K38, K39, K41]
11. **Ölçüm 2025–2026'da değişti:** AEM sadeleşti (8 olay, olay için alan adı doğrulama ve kampanyada dönüşüm
    alan adı seçimi artık yok); tık atfı yalnız BAĞLANTI tıklaması, yeni "etkileşim" (engage-through) 1 gün
    penceresi var; LPV Temmuz 2025'ten beri pikselsiz de kullanılabiliyor. [Resmî-Meta · K43, K46, K47]
12. **Marketing API v26.0 2026-07-29'da çıktı** (brief "güncel v25.0" diyor). 27 Ekim 2026'da IG Explore
    yerleşimi, Messenger Stories (sessizce), anket reklamları ve `web_only` kısıtı BÜTÜN sürümlere
    uygulanıyor; WhatsApp Durum için üçüncü taraf kreatifte kimlik alanı açıkça isteniyor. [Resmî-Meta · K48]

---

## Bulgular

### 1. Hesap ve kampanya yapısı

#### 1.1 Meta'nın çerçevesi: "Performance 5" ve hesap sadeleştirme

- Meta for Business'ın performans çerçevesi beş başlık: **hesap sadeleştirme, otomasyon, kreatif
  çeşitlendirme, veri kalitesi (CAPI), sonuçları doğrulama (test).** Sadeleştirmenin gerekçesi öğrenme
  aşaması; Meta'nın iddiası: harcamasının %20'den azını öğrenme aşamasında tutan reklamverenler satın alma
  başı maliyeti %68'e kadar düşürebiliyor. [Resmî-Meta · K7]
- Yardım merkezi bunu pratik kurallara çeviriyor: benzer ad set'leri birleştir (aynı amaç ve kreatifle
  ilgi alanına göre bölmek kitleyi ve öğrenmeyi parçalıyor); raporlama için bölmek yerine kırılım kullan;
  küçük coğrafyaları birleştir; yerleşime göre ayrı ad set açma (Advantage+ yerleşim + varlık özelleştirmesi);
  dile göre ayrı ad set açma (tek ad set'te çok dil). [Resmî-Meta · K4, K6]
- **Fazla reklam kötü performans:** her reklam daha seyrek gösteriliyor, daha az reklam öğrenmeden çıkıyor.
  Sayfa başına "yayında ya da incelemede" reklam sınırı var: en yoğun ayında 100 bin $'ın altında harcayan
  sayfa için 250 reklam (1 M$ altı 1.000; 10 M$ altı 5.000; üstü 20.000). Sınır sayfaya bağlı, kaç reklam
  hesabının kullandığından bağımsız. [Resmî-Meta · K4, K5]
- Meta, Account Overview'da "ad set birleştir" önerileri (opportunity score) ve parçalanma algılanınca
  birleştiren otomatik kural sunuyor. [Resmî-Meta · K6]

#### 1.2 Advantage+ kampanya deneyimi (satış / lead / uygulama)

- Ads Manager'da satış, uygulama ya da lead amacı seçildiğinde kurulum "Advantage+ açık" başlıyor. "Manuel"
  ayrı bir yol değil: bütçe, kitle ya da yerleşim fazla daraltılınca o bölüm "Advantage+ kapalı" oluyor; manuel
  özelliklerin hepsi hâlâ kullanılabiliyor. [Resmî-Meta · K13, K14]
- API'de durum bir alan değil SONUÇ: kampanya bütçesi (desteklenen teklif stratejisiyle) + hiçbir ad set'te
  yerleşim kısıtı yok + en az bir ad set'te Advantage+ kitle → `advantage_state` =
  `ADVANTAGE_PLUS_SALES / _APP / _LEADS`. POST ile yazılamıyor; `smart_promotion_type` `GUIDED_CREATION`
  oluyor. Eski ASC/AAC oluşturma v25.0'dan beri her sürümde hata. [Resmî-Meta · K52; depo 04]
- Advantage+'ı açık tutan / kapatan kurallar (Ads Manager): [Resmî-Meta · K12, K14, K15, K16]
  - **Bütçe:** kampanya bütçesi (tek ya da çok ad set) ve isteğe bağlı ad set harcama limitleri açık tutar;
    çok ad set + ad set bütçesi kapatır.
  - **Kitle:** öneriler kullanıldığı sürece açık; "öneri olarak kullan" işareti kaldırılırsa kapanabilir;
    en düşük yaşı 25'e kadar yükseltmek ya da özel kitle hariç tutmak kapatmıyor.
  - **Yerleşim:** herhangi bir ad set'te yerleşim hariç tutmak ya da mobil/masaüstünden çıkmak kapatıyor.
    Hariç tutulan yerleşime bütçenin %5'ine kadar "sınırlı harcama" izni verilebiliyor.
  - **Hesap düzeyi kontroller kapatmıyor.**
- "Mevcut müşteri bütçe tavanı" kalktı; Meta elle taklidi öneriyor: biri mevcut müşteri kitlesini
  gevşetmesiz dahil edip harcama limitiyle sınırlanan, diğeri aynı kitleyi hariç tutan iki ad set.
  [Resmî-Meta · K14, K52]
- Lead tarafında Advantage+ "farklı hedefleme ve kreatifle çok sayıda kampanya çalıştırma ihtiyacını
  kaldıran" kurulum olarak tanımlanıyor; anlık form, site formu, arama ve mesajlaşma dahil bütün dönüşüm
  konumları ve "lead / nitelikli lead" hedefleri kullanılabiliyor. [Resmî-Meta · K17]
- Meta'nın kendi performans iddiaları: Advantage+ lead kampanyaları erken testte lead başı %14, nitelikli lead
  başı %10 daha düşük maliyet; Advantage+ satış kampanyaları yardım sayfasında "dönüşüm başı maliyette %9
  iyileşme", Meta for Business sayfasında "%20 daha düşük sonuç başı maliyet" — aynı ürün için Meta'nın iki
  farklı sayısı. [Resmî-Meta · K17, K18, K19]
- Satış sayfası dördüncü bir kaldıraç adı veriyor: **"Advantage+ destination"** (otomatik hedef seçimi).
  API belgesinde `advantage_state` kriteri değil; v26'daki `web_only` kısıtı (§7) bu yöne işaret ediyor.
  [Resmî-Meta · K19, K48]

#### 1.3 Kampanya / ad set / reklam sayısı — Meta ne diyor, sektör ne diyor

- **Meta (resmî):** ad set başına reklam sayısını azalt ama ad set başına çeşitli kreatif varlıkları koru;
  bir reklam 10'a kadar varlık taşıyabilir. Metin varyantı için çoklu metin, kreatif varyantı için tek
  reklamda esnek/dinamik kreatif öneriliyor. [Resmî-Meta · K4]
  - **API sınırı:** esnek format (`creative_asset_groups_spec`) yalnız `OUTCOME_SALES` ve
    `OUTCOME_APP_PROMOTION`'da. Lead, trafik ve WhatsApp niyetlerinde "tek reklamda 10 varlık" API'den
    kurulamıyor; çeşitlilik birden çok reklamla sağlanmak zorunda. [Resmî-Meta · depo 05]
- **Andromeda (resmî):** Meta'nın reklam getirme (retrieval) katmanı; on milyonlarca adaydan birkaç bin
  aday seçiyor, sıralama/açık artırma bundan sonra. Mühendislik yazısı (2024-12-02) ve Meta for Business
  haberi (2025-03-27) **reklam sayısı önermiyor**; haber "işletmeler çeşitlendirme için daha çok kreatif
  yükledikçe Andromeda doğru kreatifi seçmeye yardım ediyor" çerçevesini kuruyor ve reklam kalitesinde +%8
  iddia ediyor. [Resmî-Meta · K8, K9]
- **Sektör — iki zıt görüş:**
  - "Ad set başına 8–15, hatta 20–30 kavramsal olarak farklı kreatif"; "görsel benzerliği yüksek varyasyonlar
    tek varlık sayılıyor". Birkaç ajans/araç blogunda "Meta önerir" diye sunuluyor ama resmî bir Meta
    kaynağına bağlanmıyor. [Topluluk/Sektör · K71, yalnız arama özeti, 2025–2026]
  - Jon Loomer (2025-11-10): Andromeda "yetenek, şart değil"; Meta eski "ad set başına en fazla 6 reklam"
    önerisini kaldırdı ama daha çok reklam kendiliğinden daha iyi sonuç getirmiyor; kalite nicelikten önemli,
    tek görselli eski reklamlar hâlâ çalışabiliyor. [Sektör · K69]
- **Sınırlar:** ad set başına 50 reklam, kampanya başına 200 ad set (brief §1); sayfa başına 250 aktif
  reklam (küçük sayfa). [Resmî-Meta · K5; depo README §1]
- **Belge içi çelişki:** Marketing API'nin "Optimization Tips" sayfası demografiye göre segmentlemeyi ve
  kampanya ortasında hedefleme değiştirmeyi öneriyor — Yardım Merkezi'nin "birleştir, önemli değişiklikten
  kaçın" ilkesine ters. Tarihsiz, genel bir sayfa; esas alınmamalı. [Resmî-Meta · K63 ↔ K2, K6]

### 2. Öğrenme aşaması

#### 2.1 Eşik

- Ad set, son önemli değişiklikten sonraki haftada **yaklaşık 50 sonuç** alınca genelde öğrenmeden çıkıyor.
  Shops reklamlarında 17 site + 5 Meta içi satın alma. Ads Manager'da "Son önemli değişiklik" sütunu var.
  [Resmî-Meta · K1]
- **Sayılan sonuç atıf penceresi içinde olmalı:** 1 günlük tık atfında üç gün sonra gelen satın alma 50'ye
  sayılmıyor. Kısa atıf penceresi öğrenmeyi yavaşlatır. [Resmî-Meta · K45 — sayfanın bazı kısımları eski
  olabilir (Audience Insights gibi kalkmış araçlardan söz ediyor)]
- API: `learning_stage_info` → `status` (`LEARNING`, `SUCCESS`, `FAIL`), `conversions` (öğrenmeden çıkınca
  sıfır döner), `last_sig_edit_ts`, `attribution_windows` ve **`dynamic_lp_conversions_threshold`,
  `dynamic_lp_days_threshold`, `dynamic_lp_status`** ("dinamik öğrenme aşaması"). Yani eşik ad set'e göre
  50/7 gün olmayabilir; değer okunmalı, sabit kodlanmamalı. [Resmî-Meta · K51]
- Değer optimizasyonu: son 14 günde 100+ dönüşüm, olay başına en az 5 farklı değer, en az 3 hafta
  çalıştırma, haftada 50+ dönüşümü karşılayan bütçe; en iyi performans genelde 2 hafta sonra. [Resmî-Meta ·
  K32]

#### 2.2 Öğrenmeyi yeniden başlatan değişiklikler — liste VAR

- **Kesin önemli değişiklik:** hedeflemede her değişiklik; kreatifte her değişiklik; optimizasyon olayı
  değişikliği; ad set'e yeni reklam eklemek; ad set'i 7 gün ya da daha uzun duraklatmak (açınca öğrenmeye
  girer); teklif stratejisi değişikliği. [Resmî-Meta · K2]
- **Büyüklüğe bağlı:** ad set harcama limiti; teklif kontrolü / sonuç başı maliyet hedefi / ROAS hedefi
  tutarı; bütçe tutarı. Meta'nın örneği: 100 $ → 101 $ muhtemelen değil, 100 $ → 1.000 $ muhtemelen evet.
  Sayısal eşik verilmiyor. [Resmî-Meta · K2]
- **Kampanya bütçesinde:** bütçe ya da teklif stratejisi değişikliği birden çok ad set'i öğrenmeye
  sokabilir; bütçenin ad set'ler arasında dağıtılması sokmaz; bir ad set'te yapılan değişiklik diğerlerini
  sokmaz; yeni ad set eklemek diğerlerini sokmaz. Siyasi reklam beyanını değiştirmek önemli değişiklik.
  [Resmî-Meta · K2]
- "Bütçeyi bir seferde en çok %20 artır" kuralı Meta'nın sözü değil, sektör geleneği. Jon Loomer
  (2026-04-07) artık bunu önermiyor: teslimat eskisi kadar hassas değil, 50 sonuç kaba bir kural, pahalı
  üründe öğrenmeden hiç çıkamayıp yine iyi sonuç alınabiliyor. [Sektör · K68] Sektör kaynakları Ads Manager'ın
  ad set başına "öğrenmeye girmeden günlük bütçeyi X'e kadar artırabilirsiniz" ipucu gösterdiğini aktarıyor;
  API karşılığı bulunamadı. [Sektör, arama özeti, doğrulanmadı]

#### 2.3 "Learning limited" ve küçük bütçe

- **Tanım:** son önemli değişiklikten sonraki haftada ~50 optimizasyon olayına ulaşması olası değil. Ceza
  değil; mevcut kurulumla bütçenin etkin harcanamadığının göstergesi. Sebepler: küçük kitle, düşük bütçe,
  düşük teklif/maliyet kontrolü, yüksek açık artırma çakışması, seyrek olay, aynı anda çok reklam.
  [Resmî-Meta · K3]
- **Meta'nın çözümleri:** ad set/kampanya birleştir → kitleyi genişlet → bütçeyi artır → teklif/maliyet
  kontrolünü yükselt → daha sık gerçekleşen optimizasyon olayı seç (ör. satın alma yerine sepete ekleme).
  [Resmî-Meta · K3]
- Dönüşüm olayı haftada ~50 değilse ya da alt huni olayı kurulmamışsa **açılış sayfası görüntüleme (LPV)**
  iyi bir alternatif. [Resmî-Meta · K44]
- Öğrenme sırasında: öğrenmeden çıkana kadar düzenleme yapma; gereksiz önemli değişiklikten kaçın; yüksek
  reklam hacminden kaçın; gerçekçi bütçe (çok küçük de şişkin de sistemi yanıltır); sık bütçe değişikliğinden
  kaçın. Öğrenmeden tamamen kaçınmaya çalışma — test şart. [Resmî-Meta · K1]
- Mesajlaşma reklamlarında kararlı sonuç ve haftalık dalgalanma için **en az 7 gün** çalıştırma.
  [Resmî-Meta · K38, K41]

### 3. Bütçe

#### 3.1 Meta'nın kuralları

- **Maliyet hedefi (cost per result goal, `COST_CAP`) kullanılıyorsa günlük bütçe hedefin en az 5 katı**
  (5 $ hedef → en az 25 $ günlük). [Resmî-Meta · K31]
- Toplam bütçe düşürülürken yeni tutar = şimdiye kadar harcanan + son 2 günde harcananın %10'u kadar fazla.
  Gün sonuna yakın günlük bütçe düşürmek riskli: sistem yeni sınırı uygulayamadan eski tutarı harcamış
  olabilir. [Resmî-Meta · K31]
- Minimum bütçe sabit bir sayı değil: sektör, bütçe tipi, satın alma tipi, teklif stratejisi, optimizasyon,
  para birimi ve takvime göre belirleniyor; Ads Manager altında kalınca uyarıyor, "yeterli ama optimal değil"
  durumunda öneri gösteriyor. Kampanya bütçesinde düşük teslimat riski daha düşük. [Resmî-Meta · K31]
- Daha zor olay (satın alma) daha çok bütçe ister; bütçe artırılamıyorsa daha kolay olaya optimize et.
  [Resmî-Meta · K31]
- **API:** `GET /act_{id}/minimum_budgets` → `currency`, `min_daily_budget_imp` (gösterim),
  `min_daily_budget_high_freq` (tıklama/beğeni gibi sık eylem), `min_daily_budget_low_freq` (uygulama
  yükleme, teklif talebi gibi seyrek eylem), `min_daily_budget_video_views`. **Değerin birimi (kuruş mu, TL
  mi) referansta yazmıyor.** [Resmî-Meta · K50]

#### 3.2 Türkiye'de TL ile pratikte

- Meta'nın para birimine göre güncel bir minimum bütçe tablosu yok; yardım sayfası "ABD doları kullanır,
  ülke ve amaca göre değişir" diyor. [Resmî-Meta · K31]
- Topluluk kaynakları "küçük işletme için günde 50–100 TL, orta ölçek 200–500 TL" gibi sabit sayılar veriyor;
  tarihleri belirsiz ve TL'nin değer kaybı nedeniyle **eski olabilir**; Advetics'te kullanılmamalı.
  [Topluluk · K73]
- **Öğrenme dostu bütçe (türetme):** günlük ≈ beklenen sonuç başı maliyet × 50 ÷ 7 ≈ 7 × sonuç başı maliyet.
  Meta'nın "haftada ~50 sonuç" kuralından çıkıyor; sektörde yaygın formül. [Resmî-Meta kuralından türetme ·
  K1; Topluluk · K73]
- **Varsayımsal aritmetik (piyasa verisi DEĞİL):** sonuç başı 40 TL → günlük ≈ 285 TL; sonuç başı 200 TL →
  günlük ≈ 1.430 TL. Sonuç: küçük bütçeli KOBİ, pahalı ve seyrek bir olaya (satın alma, form) optimize
  ettiğinde çoğu zaman "learning limited" kalacak; daha sık olay (konuşma, LPV) ya da kabul edilmiş
  "learning limited" pratik yol.

#### 3.3 Kampanya bütçesi (CBO) mi, ad set bütçesi mi

- Satış/uygulama/lead'de bütçe stratejisi kampanya düzeyinde seçiliyor. **Kampanya bütçesi** bütçeyi ad
  set'ler arasında otomatik dağıtıyor; **tek ad set'li kampanyada ad set bütçesiyle aynı çalışıyor.** Ad set
  bütçesi yalnız farklı teklif stratejisi ya da farklı bütçe takvimi gerektiğinde. [Resmî-Meta · K16]
- Kampanya bütçesinde ad set başına alt/üst harcama limiti (`daily_min_spend_target`, `daily_spend_cap`)
  Advantage+'ı kapatmıyor; ama "en iyi çaba", garanti değil. [Resmî-Meta · K16, K56]
- Kampanya bütçesi kısıtları: otomatik teklifte ad set'lerin optimizasyon hedefi aynı olmalı ve **reklam
  yayınlandıktan sonra optimizasyon hedefi değiştirilemez**; min ROAS'tan başka stratejiye geçilemez; 70'ten
  fazla ad set'te strateji değişmez/kampanya bütçesi kapanmaz. [Resmî-Meta · K56]
- API sadeliği: kampanya bütçesi verilince v24+'ın zorunlu `is_adset_budget_sharing_enabled` alanı
  gerekmiyor (yalnız ad set bütçesinde zorunlu). [Resmî-Meta · depo 04]

### 4. Advantage+ kitle ve Advantage+ yerleşim açıkken

#### 4.1 Kontroller ve öneriler

| Katman | İçerik | Meta'nın tanımı | API karşılığı |
|---|---|---|---|
| **Kitle kontrolleri (kesin)** | Konum, en düşük yaş, hariç tutulacak özel kitleler, dil | Reklamı kimin görebileceğini sınırlar; öneriler bu sınırın dışına çıkmaz | `geo_locations`, `age_min` (Advantage+ açıkken yalnız 18–25), `excluded_custom_audiences`, `locales` |
| **Kitle önerileri (yumuşak)** | Yaş, cinsiyet, ayrıntılı hedefleme, dahil edilecek özel kitleler | Performansı artıracaksa öneri dışındaki kişilere de gösterilir | `age_range`, `genders`, `flexible_spec`, `custom_audiences` |
| **Reklam hesabı ayarları** | Ülke dahil/hariç, en düşük yaş, marka koruması için ayrıntılı hariç tutma, kendi çalışanlarını hariç tutma, yerleşim hariç tutma | "Bazı kitleler hesabın reklamlarını hiç görmemeli" durumu için | `/act_{id}/account_controls` |

[Resmî-Meta · K11, K15, K20, K53, K54]

- **Konum bir kontrol — ama koşullu.** Konum seçildiğinde Meta sınırın dışına çıkmıyor; **"reklamlarınıza
  yanıt verme olasılığı yüksek daha fazla kişiye ulaşın" seçilirse çıkabiliyor.** [Resmî-Meta · K11] API'de
  en yakın karşılık `targeting_automation.individual_setting.geo` (seçili şehir/bölgeye ilgi gösteren aynı
  ülkedeki kişilere genişletme); **varsayılanı belgede yok.** [Resmî-Meta · depo 03] → Sessiz konum
  genişlemesi adayı; geri okumayla doğrulanmalı.
- Özel kitle hariç tutma, "öneri olarak kullan" işaretli olsa bile her zaman kontrol. [Resmî-Meta · K15]
- Advantage+ açıkken API `age_min`/`age_max`'ı varsayılana sıfırlıyor; `age_min` yalnız 18–25, `age_max`
  sabit 65; yaş tercihi `age_range` ile öneri olarak gider. v23+'ta "varsayılan" ya da "gevşetilmiş" kurulumda
  bayrak yazılmazsa `1`; diğerlerinde yazılmazsa hata. [Resmî-Meta · K53]
- Meta Advantage+ kitleyi **yeniden hedefleme (retargeting) dışındaki** neredeyse bütün kampanya türleri
  için öneriyor. İddia: bilinirlikte %14,8; trafik/etkileşim/lead'de %9,7; satış/uygulamada %7,2 daha düşük
  sonuç başı maliyet. [Resmî-Meta · K10]

#### 4.2 Hesap düzeyi kontroller (`account_controls`)

- Hesaptaki **yeni ve mevcut bütün kampanyalara** uygulanıyor; mevcutlara yansıması 48 saate kadar
  sürebiliyor; Ads Manager'da kampanya oluştururken "uygulandı" diye görünüyor ve orada değiştirilemiyor.
  Özellik kademeli açılıyor. [Resmî-Meta · K20]
- Advantage+ durumunu **kapatmıyor** (kampanyadaki yerleşim hariç tutmanın aksine). [Resmî-Meta · K12, K52]
- **Konut, istihdam, finans ve siyasi reklamlara UYGULANMIYOR.** [Resmî-Meta · K20] → HOUSING kampanyasında
  hesap düzeyi "en düşük yaş" ya da "ülke hariç" güvencesi yok; ekran bunu söylemezse sessiz boşluk.
- API'de yerleşim hariç tutma yalnız beş değer: `AUDIENCE_NETWORK_CLASSIC`,
  `AUDIENCE_NETWORK_REWARDED_VIDEO`, `AUDIENCE_NETWORK_INSTREAM_VIDEO`, `FACEBOOK_MARKETPLACE`,
  `FACEBOOK_RIGHT_HAND_COLUMN`. Okuma ve oluşturma var, silme yok. [Resmî-Meta · K54]

#### 4.3 Marka güvenliği

- Envanter filtresi (FB/IG akış, Reels akışı, Threads akışı; akış içi; Audience Network): **Genişletilmiş /
  Orta / Sınırlı; varsayılan Genişletilmiş.** Orta ve Sınırlı erişimi düşürüp maliyeti artırabiliyor; akış
  filtresi Türkçe içerikte çalışıyor. Topluluk Standartlarını ihlal eden içerik her durumda hariç.
  [Resmî-Meta · K28] (Sektörde görülen "varsayılan Standart" bilgisi eski adlandırma.)
- Filtre yayıncı engellemiyor; yayıncı/içerik engel listeleri ayrı ve API'de Meta'nın "capability grant"
  iznini istiyor. [Resmî-Meta · K28; depo 03]
- Meta: sabit bir kısıt varsa yerleşim hariç tutmayı **hesap düzeyinde** yap; bunun Advantage+ yerleşimin
  etkinliğini sınırlayabileceği uyarısıyla. [Resmî-Meta · K23]
- **Sessiz yan etki:** son 12 ayda Facebook, Instagram ya da Threads'te marka güvenliği/uygunluk kontrolü
  kullanan reklamverenler **WhatsApp Durum yerleşiminden otomatik çıkarılıyor.** [Resmî-Meta · K36]

#### 4.4 Advantage+ yerleşim

- Meta önerisi: Facebook, Instagram, Messenger, Threads ve Audience Network'ün tamamında kal; Advantage+
  creative ve yerleşime göre varlık özelleştirmesiyle birleştir. İddia: deneyde %11,7 daha düşük CPA.
  Sistem yerleşim başına değil TOPLAM en düşük ortalama maliyeti arıyor; bir yerleşimi "pahalı görünüyor"
  diye kapatmak toplamı kötüleştirebilir (Meta'nın sayısal örneği: 9 sonuç 27 $ → kapatınca 8 sonuç 26 $).
  [Resmî-Meta · K21, K22, K23]
- Meta for Business'ın kreatif sayfası "6 ya da daha fazla yerleşim seçin" diyor. [Resmî-Meta · K45b]
- API: Advantage+ yerleşim, yerleşim alanları **gönderilmeyerek** tanımlanıyor (brief §2'nin "bilerek boş"
  satırı). v26'dan itibaren IG Explore akış yerleşimi kalktı, Messenger Stories hedeflemeden sessizce
  düşüyor (§7). [Resmî-Meta · K48; depo README §2]
- **WhatsApp Durum:** yalnız IG Stories de seçiliyken; yalnız tek görsel / tek video; **özel kategoriler
  (finans, istihdam, konut, siyaset) uygun değil**; ilaç/sağlık hariç; A/B test, dinamik kreatif ve
  Advantage+ creative yok; AB, İngiltere, İran, Küba, Suriye, Rusya ve Kuzey Kore dışında global (Türkiye
  dahil görünüyor). Yaşı bilinmeyenler varsayılan dahil. [Resmî-Meta · K64, K48]

#### 4.5 Medya oranları ve yerleşim varlık özelleştirmesi

Meta'nın yerleşime göre önerdiği oranlar: [Resmî-Meta · K24]

| Yerleşim | Görsel önerisi | Video önerisi |
|---|---|---|
| Facebook akış | 4:5 | 4:5 |
| Instagram akış | **4:5** (K24) — başka bir Meta sayfasında **1:1** (K26): çelişki | 9:16 |
| Instagram Explore ana sayfa, IG arama sonuçları | 4:5 | 9:16 |
| FB/IG Stories, FB/IG Reels, WhatsApp Durum, Messenger Stories | 9:16 | 9:16 |
| Facebook Marketplace | 1:1 | 1:1 |
| Facebook sağ sütun | 1,91:1 | — |
| Facebook akış içi Reels | 1:1 | 4:5 |

- Asgari piksel önerisi: FB akış 1:1 için 1080×1080, 4:5 için 1440×1800; IG akış/Stories/Reels 1080×1080;
  WhatsApp Durum 500×320; "en yüksek çözünürlüğü kullan". API'nin asgari değerleri (600 px) daha düşük →
  giriş doğrulamasında API sınırı RET, yardım merkezi önerisi UYARI olmalı. [Resmî-Meta · K25; depo 05]
- Masaüstü Facebook akışında video 1:1 gösteriliyor; 4:5 videoda yanlarda siyah bant çıkabiliyor.
  [Resmî-Meta · K24]
- Karusel: 1:1 ya da 4:5 ve kartlarda TUTARLI oran (otomatik düzeltmeyi önler). Akış içi video 16:9.
  Audience Network 9:16. [Resmî-Meta · K26]
- **Yerleşim varlık özelleştirmesi:** tek reklamda yerleşim grubuna göre farklı kırpma, medya, metin ve
  bağlantı. Meta: Stories önemliyse 9:16 yükle; otomatik kırpmaları yayından önce kontrol et. Uyumsuz:
  Advantage+ katalog, mevcut gönderiden reklam, esnek format, dinamik kreatif; API ile oluşturulan
  reklamlarda "bazı sınırlamalar". Yeni akışta bir reklama 10'a kadar görsel/video. [Resmî-Meta · K26]
- Ads Manager'da medya özelleştirmesinin desteklendiği amaç/konumlar: Lead → anlık form ✔, WhatsApp ✔,
  Messenger ✔, arama ✔, site ✔; Trafik → site ✔, mesaj ✔, arama ✔; Satış → site ✔, mesaj ✔. Desteklenmeyen:
  Lead → "site ve anlık form", "site ve arama"; Satış → "site ve mağaza". [Resmî-Meta · K27]
- **API tarafı belirsiz:** PAC (`asset_feed_spec` + `asset_customization_rules`, her kreatifte en az iki
  kural) desteklenen amaçları ESKİ adlarla sayıyor (`APP_INSTALLS, BRAND_AWARENESS, CONVERSIONS,
  LEAD_GENERATION, LINK_CLICKS, REACH, VIDEO_VIEWS`) — mesajlaşma yok; `instagram_positions` listesinde
  `reels` yok; mevcut gönderiyle PAC artık API'de desteklenmiyor. WhatsApp niyetinde PAC'ın kabul edilip
  edilmediği belgeden çıkmıyor. [Resmî-Meta · K57]

#### 4.6 Özel reklam kategorisi (HOUSING) + Advantage+ kitle

- **Meta'nın kaynakları çelişiyor:**
  - Yardım merkezi (kontroller/öneriler sayfası, Türkçe ve İngilizce): finans, istihdam, konut özel kategori
    kampanyaları ve siyasi reklamlar **Advantage+ kitleye erişemeyecek.** [Resmî-Meta · K11]
  - Advantage+ kampanya deneyimi sayfaları yalnız siyasi ve ilaç kampanyalarını kısıtlı sayıyor; "Advantage+'ı
    ne açar/kapatır" sayfası "özel kategori ve ilaç kampanyaları bütün özelliklere erişemeyebilir ya da farklı
    deneyim görebilir" diyor. [Resmî-Meta · K12, K13, K14]
  - Marketing API Advantage+ SSS: konut/istihdam/finansta Advantage+ kitle, Advantage custom audience ve
    Advantage detailed targeting **kademeli açılıyor**; uygun değilse kampanya "geniş hedeflemeli benzer
    yapıya" taşınıyor. [Resmî-Meta · K52]
  - Marketing API özel kategori sayfası: `tune_for_category` sonrası desteklenen özellikler arasında Advantage+
    kitle sayılıyor. [Resmî-Meta · K55]
  - **En yeni tarihli resmî kaynak (v26 blogu, 2026-07-29):** konut/istihdam/finans kampanyalarında kısıtlı
    hedeflemeyle yeni ad set açarken `advantage_audience` 1 ya da 0 olarak AÇIKÇA yazılmalı; varsayılan ya da
    gevşetilmiş kurulumda 1'e düşüyor. Parametrenin özel kategoride kabul edildiğini gösteriyor.
    [Resmî-Meta · K48]
  - **Sonuç:** "HOUSING + `advantage_audience: 1`" API'de büyük olasılıkla kabul ediliyor; ama gerçek etkisi
    (genişleme mi, Meta'nın sessizce kapatması mı) belgeden çıkmıyor → canlı ölçüm (Açık soru 1).
- **Konut kısıtları** (ABD merkezli ya da ABD/Kanada/belirli Avrupa ülkelerine ulaşan reklamveren): yaş 18–65+
  sabit; cinsiyet seçilemez; posta kodu yok; hariç tutma hedeflemesi yok; benzer kitle ve kayıtlı kitle yok;
  bazı ilgiler yok; şehir/adres/iğnede genişletilmiş yarıçap. [Resmî-Meta · K29, K30]
- **Yarıçap ve ülke listesi:** ABD ve Kanada 15 mil (25 km); 10 mil (17 km) gereken Avrupa ülkeleri tek tek
  sayılmış: AB'nin 27 ülkesinin tamamı, Norveç, İsviçre, İngiltere, İzlanda, Lihtenştayn, Monako, San Marino,
  Vatikan, Andorra, Man Adası ve Manş Adaları ile bazı denizaşırı bölgeler. **Türkiye listede yok.**
  [Resmî-Meta · K30]
  - Brief'teki "belge Avrupa 15 km / MCP 17 km" çelişkisi yardım merkezi lehine **17 km** olarak çözülüyor.
  - API sayfasına göre ABD/Kanada/Avrupa dışı işletme ve kitle, alanı göndermek zorunda ama kısıtlara
    katılıp katılmamayı seçebiliyor; Türkiye'de kısıtlar Meta için ZORUNLU DEĞİL, gönüllü katılım.
    [Resmî-Meta · K55]
- Özel kategoride desteklenmeyen konum türleri: `subcity`, `neighborhood`, `metro_area`, `small_geo_area`,
  `subneighborhood`, `electoral_district`, `zips`. [Resmî-Meta · K55] → Türkiye ilçeleri aramada `subcity`
  ya da `*_geo_area` dönerse HOUSING'de kullanılamaz (depo 03 ilçe türünün belirsiz olduğunu yazıyor).
- `special_ad_category_country` verilmezse vergi ülkesine düşüyor (sessiz varsayılan). [Resmî-Meta · K55]
- Özel kategoride hesap kontrolleri uygulanmıyor (§4.2), WhatsApp Durum yok (§4.4).

### 5. Hedefe göre en iyi kurulum

#### 5.1 Potansiyel müşteri — anlık form

- **Form türü:** [Resmî-Meta · K35; API: depo K65]
  - *Daha fazla hacim* (varsayılan): mobilde hızlı gönderim.
  - *Daha yüksek niyet:* iletişim alanlarının altında "işletme sizinle iletişime geçebilir" bağlamı +
    gönderimden önce bilgileri onaylama ekranı. **Yalnız mobil Facebook ve Instagram akışında gösteriliyor.**
    Meta: her lead'in takibi/nitelemesi gerekiyorsa daha mantıklı. API: `is_optimized_for_quality: true`.
  - *Zengin kreatif:* marka renkleri, görseller, ek metin; giriş bölümü zorunlu.
- **Kalite özellikleri:** özel sorular, koşullu cevaplar, koşullu mantık (çoktan seçmeli cevaba göre sonraki
  soru ya da sayfa), kapılı içerik (≤10 MB), Messenger'da sohbet, **telefon doğrulama (tek kullanımlık kod)**,
  iş e-postası doğrulama. Bunlar yalnız Ads Manager'da oluşturulan formda (Business Suite'te yalnız basit
  form). **En çok 100 kayıtlı form; 100'e ulaşıldıktan sonra yeni form oluşturulunca yalnız en yeni 100
  saklanıyor** — eskiler hatasız düşüyor; Advetics formu yeniden kullanmadan önce varlığını okumalı ve
  sayıyı izlemeli. [Resmî-Meta · K34] Bir topluluk kaynağı "yüksek niyet formu
  tek kullanımlık kod ister" diyor; resmî sayfa telefon doğrulamayı AYRI özellik sayıyor. [Topluluk · K72 ↔
  K34]
- **En iyi uygulamalar:** giriş bölümü; az soru; önceden dolan sorular; nitelemek için çoktan seçmeli (az
  çoktan seçmeli = daha çok gönderim, çok = daha nitelikli); kısa cevaplı soruyu sınırla; bitiş ekranı; form
  uzunluğunu A/B testle; formu açıp bitirmeyenlere etkileşim kitlesiyle yeniden ulaş; satış ekibini boğmamak
  için zamanlama; Advantage+ yerleşim (FB, IG, WhatsApp). [Resmî-Meta · K36]
- **Performans hedefleri:** lead sayısı; nitelikli lead sayısı; mesajlaşmayla lead (kademeli); dönüşüm
  değeri. **Nisan 2026'dan beri nitelikli lead hedefi CAPI entegrasyonu olmadan yeni kampanyada yok; mevcut
  kampanyalar Ağustos 2026'dan itibaren etkileniyor.** İddia: CAPI CRM + nitelikli lead, anlık formda %21,
  site formunda %9,5 daha düşük nitelikli lead başı maliyet. Yeni: anlık form + "Meta kaynağı" sinyalinde
  takip olayı olarak "WhatsApp konuşmalarıyla lead" seçilebiliyor (form sonrası WhatsApp sohbeti; WhatsApp
  sinyaliyle optimize). [Resmî-Meta · K32]
- **CRM (Conversion Leads) uygunluğu:** anlık form; 15–17 haneli Meta lead kimliğinin CRM'de saklanması;
  ayda en az 200 lead; en az günde bir yükleme; optimize edilen aşama 28 gün içinde ve %1–40 oranında;
  ~3–4 hafta kurulum + 1–2 ay eğitim dönemi. API: `optimization_goal: QUALITY_LEAD` (+ isteğe bağlı
  `promoted_object.pixel_id`). [Resmî-Meta · K33, K60, K65]
- Organik (reklamsız paylaşımdan gelen) lead'leri süzmek için `block_display_for_non_targeted_viewer: true`.
  [Resmî-Meta · K65]

#### 5.2 Click-to-WhatsApp

- **Ön koşul:** WhatsApp Business uygulaması ya da API; numara Facebook sayfasına ya da işletme portföyüne
  bağlı. Amaçlar: bilinirlik, trafik, etkileşim, lead, satış. **Lead amacında WhatsApp seçilince varsayılan
  hedef "konuşma sayısını en üst düzeye çıkar"** ve kitle/yerleşimde Advantage+ açık. Mesaj şablonu: "Sohbet
  başlat" (karşılama + önerilen sorular/mesajlar) ya da "WhatsApp'ta formla bilgi topla" (WhatsApp Flows;
  herkeste yok). [Resmî-Meta · K37]
- **API:** `destination_type: WHATSAPP`, `promoted_object.page_id` (numara isteğe bağlı);
  `OUTCOME_LEADS` için yalnız `CONVERSATIONS`; `OUTCOME_ENGAGEMENT` için `CONVERSATIONS` ya da
  `LINK_CLICKS`. Karşılama `page_welcome_message` içinde (otomatik dolan mesaj ya da `ice_breakers`);
  verilmezse İngilizce varsayılan karşılama. Ad set `status` verilmezse `ACTIVE`. [Resmî-Meta · K58]
- **Meta'nın en iyi uygulamaları:** reklamda tıklayınca sohbet açılacağını açıkça söyle; kare ya da dikey
  görsel/video; "Mesaj gönder" / "Şimdi sohbet et" gibi net CTA; karşılama mesajı ya da otomatik yanıt
  (çalışma saatleri, sık sorulanlar); **en az 7 gün** ve rekabetçi bütçe; Advantage+ kampanya bütçesi; birden
  çok mesaj hedefi (Messenger/IG/WhatsApp) — Meta'nın 2024 2. yarı deneyinde mesaj başı %9 daha düşük ücret,
  %11 daha yüksek dönüşüm oranı. [Resmî-Meta · K41, K38]
- Reklamdan başlayan konuşmaya **7 güne kadar uzayabilen ücretsiz mesajlaşma süresi** (Business Platform
  kullananlar; herkeste yok). [Resmî-Meta · K38]
- **Mesajlaşmayla lead hedefi (WhatsApp):** son 30 günde WhatsApp Business uygulamasında ya da CAPI for
  Business Messaging ile **en az 10 lead/satın alma olayı**; sohbet reklamdan gelmiş ve tıklamadan sonraki
  7 gün içinde lead olarak etiketlenmiş olmalı; uygulamada "müşteri etkinliklerini Meta ile paylaş" açık ve
  önceden tanımlı etiketler kullanılmış olmalı (Lead, Yeni müşteri, Takip; Yeni sipariş, Ödeme bekliyor,
  Ödendi, Sipariş tamamlandı) — özel etiket sayılmayabilir. Her sayfa ayrı uygun olmalı; WhatsApp içeren
  çok hedefli kombinasyonda henüz yok. İddia: konuşmaya göre %24 daha düşük lead başı maliyet. [Resmî-Meta ·
  K39]
- **CAPI for Business Messaging:** olaylar Purchase, LeadSubmitted, QualifiedLead, InitiateCheckout,
  AddToCart, ViewContent, Order* vb.; `action_source: business_messaging`, `messaging_channel: whatsapp`,
  webhook referral'dan gelen `ctwa_clid` zorunlu; `whatsapp_business_manage_events` için gelişmiş erişim.
  [Resmî-Meta · K59]
- **Bölge kısıtı:** "Avrupa, Japonya ve Güney Kore'ye/oradan" bazı mesajlaşma metrikleri, kampanyaları ve
  özellikleri yok. Türkiye'nin bu "Avrupa" içinde sayılıp sayılmadığı sayfada tanımsız. [Resmî-Meta · K37,
  K39]
- "Türkiye'de en yaygın yol" iddiası için bu araştırmada resmî ya da güvenilir bir kaynak bulunamadı (arama
  kotası doldu); talimattaki çerçeve olarak not edildi.

#### 5.3 Trafik (açılış sayfası görüntüleme)

- Belirli sayfalara trafik için LPV, bağlantı tıklamasına tercih ediliyor (Meta daha kaliteli tıklamaları
  önceliklendirebiliyor). Dönüşüm hedefi haftada ~50 olmuyorsa ya da alt huni olayı kurulmamışsa LPV iyi
  alternatif. Teklif/Messenger gibi Facebook içine götüren biçimlerde "sayfa ziyareti" hedefi. [Resmî-Meta ·
  K44]
- **Uygunluk: işleyen bir web sayfası yeterli. Temmuz 2025'ten beri piksel paylaşım sorunu olan
  reklamverenlere de açık; eksik veride istatistiksel modelleme kullanılabiliyor.** [Resmî-Meta · K43]
  → Depodaki "piksel yoksa Meta `LINK_CLICKS`'e düşüyor" varsayımı (00) resmî bilgiyle desteklenmiyor.

#### 5.4 Satış (site)

- Advantage+ satış en iyi uygulamaları: birinci taraf verisini bağla (Pixel + CAPI), çok çeşitli kreatif,
  değer araçları, yeni/ilgili/mevcut kitle segmentleri (rapor kırılımı için). [Resmî-Meta · K18]
- CAPI: Pixel ile **yedekli** kurulum; aynı `event_name` + `event_id` (ya da `external_id` + `fbp`);
  tekilleştirme penceresi 48 saat; `action_source`, `event_source_url`, `client_user_agent` zorunlu;
  eşleşmeyen olay atıf ve optimizasyonda kullanılmıyor; EMQ yalnız web olayında. Hesap yapısı için de
  "öğrenme aşaması, önemli değişiklikten kaçın, açık artırma çakışmasını azalt, otomatik yerleşim ve kampanya
  bütçesi" öneriliyor. [Resmî-Meta · K61, K62]
- Satın alma haftada ~50 değilse daha sık olay (sepete ekleme, sayfa görüntüleme) ya da LPV.
  [Resmî-Meta · K3, K45]

#### 5.5 Arama ("Beni arasınlar")

- Trafik, etkileşim, lead ya da satış amacında ad set düzeyinde "Aramalar" dönüşüm konumu; bilinirlik amacında
  reklam düzeyinde "Ara" hedefi. **Trafik, etkileşim, lead ve satışta reklam 60 saniyelik aramalara optimize
  ediliyor.** Lead/satışta Advantage+ kurulum açık
  başlıyor. Meta mesai saatine zamanlamayı öneriyor (deneyde %25,4 daha fazla arama dönüşümü); Messenger
  üzerinden geri arama isteği isteğe bağlı. [Resmî-Meta · K42]
- **Zamanlama çelişkisi:** yardım sayfası zamanlamayı "toplam ya da günlük bütçe" ile anlatıyor; API belgesi
  `adset_schedule`'ı yalnız ömür boyu bütçeyle tanımlıyor (depo 04). Canlı ölçüm gerekli.
- Arama metrikleri (yapılan, 20/60 sn arama) 20 Haziran 2025 öncesi kampanyalarda belirli ülkeler dışında
  yok; sonrası global. [Resmî-Meta · K42]

#### 5.6 Yerel işletme

- Meta'nın yerel işletme için ayrı bir amaç önerisi bu araştırmada bulunamadı; yardım sayfaları küçük
  coğrafyaları birleştirmeyi, çok mağazalı bilinirlikte mağaza konumu özelliklerini öneriyor. [Resmî-Meta ·
  K4] Pratikte yerel işletme = WhatsApp / arama / form niyeti + işletme çevresi konumu (`custom_locations`
  1–80 km, `distance_unit` açıkça km; özel kategoride ≥17 km). [Resmî-Meta · depo 03, K30]

### 6. Ölçüm

- **AEM (2025–2026):** web dönüşüm kampanyalarında artık yapılacak adım yok — alan adı başına 8 olay
  önceliklendirmesi yok, değer optimizasyonu için değer setleri gerekmiyor, Events Manager'daki AEM sekmesi
  kalktı, olay yapılandırması için alan adı doğrulama gerekmiyor (başka sebeplerle gerekebilir), Ads
  Manager'da kampanya oluştururken **dönüşüm alan adı seçmek gerekmiyor.** CAPI olayları da AEM sınırlarına
  tabi olabilir. [Resmî-Meta · K47]
- **Atıf (standart model):** [Resmî-Meta · K46]
  - Tık: 1 ya da 7 gün — **artık yalnız bağlantı tıklaması.**
  - Görüntüleme: 1 gün.
  - **Etkileşim (engage-through): 1 gün** — bağlantı dışı tıklama ya da videonun 5 saniye (5 saniyeden kısa
    videoda %97) izlenmesi.
  - Bazı hesaplar geçişte eski tanımları kullanıyor olabilir.
  - Ayrıca "artımlı" (incremental) ve "özel" (custom) atıf modelleri var; **farklı modelli ad set'lerin
    sonuçları karşılaştırılamaz.**
  - 7 ve 28 günlük görüntüleme pencereleri insights'tan 2026-01-12'de kalktı (depo README §3b).
- **Veri kalitesi:** EMQ (1–10, hedef ≥6, yalnız web), olay kapsaması hedefi %75, tekilleştirme anahtarları,
  tazelik (gerçek zamanlı / saatlik); çevrimdışı veride bileşik puan ≥8,5 omnichannel kapısı. Ayrıntı depo
  08. [Resmî-Meta · K62; depo 08]
- **Lead kalitesi** artık CAPI'ye bağlı (§5.1). [Resmî-Meta · K32]
- **Atıf önerisi:** standart model + **7 gün tık + 1 gün görüntüleme**, Advetics standardı olarak açıkça
  yazılır (brief §8-7 ile aynı). Etkileşim (1 gün) penceresinin `attribution_spec`'te nasıl ifade edildiği
  depo belgelerinde YOK → canlıda okunmalı. Kısa pencere 50 sonuç eşiğini zorlaştırır (§2.1).

### 7. API sürümü: v26.0 ve 27 Ekim 2026

- **Graph API v26.0 ve Marketing API v26.0 2026-07-29'da yayımlandı** (Meta for Developers blogu). Graph API
  sürüm sayfası v26.0'ı gösteriyor; aynı sayfanın Marketing API tablosu ve depoya 2026-10-06'da indirilen
  changelog hâlâ en yeni olarak v25.0 gösteriyor — Meta'nın kendi sayfaları arasında tutarsızlık. Marketing
  API v24.0'ın son günü 2026-10-06. [Resmî-Meta · K48, K49, K67]
- Advetics'i ilgilendiren v26 değişiklikleri; **27 Ekim 2026'da desteklenen BÜTÜN sürümlere uygulanıyor:**
  [Resmî-Meta · K48; Sektör teyidi · K70]
  - IG Explore akış yerleşimi kaldırıldı — belirtilirse hata.
  - Messenger Stories (`messenger_positions: story`) hedeflemeden **sessizce** çıkarılıyor.
  - Anket (poll) reklamı oluşturma ve reklamı ankete çevirme reddediliyor.
  - Site + uygulama dönüşüm konumlu kampanyalarda `applink_treatment: web_only` kreatif reddediliyor.
  - Özel kategori (konut/istihdam/finans) kısıtlı kurulumda `advantage_audience` açıkça yazılmalı.
  - WhatsApp Durum: **üçüncü taraf çağıranlar kreatifte `wamo_whatsapp_identity_spec`'i açıkça göndermeli**;
    Durum seçiliyken `user_age_unknown` yazılmazsa `true`; satış/lead/etkileşimde dönüşüm optimizasyonu ve
    LPV; karusel 10 kart.
- **Çelişki:** depodaki v25 belgesi WhatsApp kimliği için "verilmezse Facebook sayfası kimliği varsayılan"
  diyor. [Resmî-Meta · K64] Advetics'in Advantage+ yerleşimli kreatiflerinde bu alan yazılmazsa ne olacağı
  (hata mı, Durum'dan sessiz çıkarılma mı) belgeden çıkmıyor.

### 8. Brief (README §2/§3 ve ilgili bölümler) ile çelişen ya da onu güncelleyen bulgular

1. **"Öğrenmeyi sıfırlayan değişiklik listesi belgede YOK"** (README §6.6, bölüm 04): Marketing API için
   doğru; Meta Yardım Merkezi'nde liste VAR (K2). AI kural uydurmamalı ama bu listeyi Meta'nın sözü olarak
   gösterebilir; bütçe/teklif tutarı için yalnız "büyüklüğe bağlı" denmeli.
2. **"Güncel sürüm v25.0"** (README §1): v26.0 2026-07-29'da çıktı; 27 Ekim 2026'da kaldırmalar bütün
   sürümlere uygulanacak (K48). Derleyiciye yasak listesi ve WhatsApp kimlik alanı eklenmeli.
3. **Özel kategori yarıçapı "belge Avrupa 15 km / MCP 17 km"** (README §3c): yardım merkezi Avrupa için
   17 km ve ülke listesi veriyor; **Türkiye yok** (K30). 17 km doğru; Türkiye'de kısıtlar Meta için zorunlu
   değil, gönüllü katılım. Bağlayıcı karar 4 bunu yine "uygula" diyor — artık "belgede belirsiz" değil,
   "Meta zorunlu tutmuyor, biz kısıtlıyoruz" diye kaydedilmeli.
4. **Bağlayıcı karar 2 (Advantage+ kitle) × karar 4 (HOUSING Türkiye'de):** Meta kaynakları çelişiyor
   (§4.6); birlikte uygulanabilirlik canlıda ölçülmeden kesin değil. Ek olarak HOUSING'de hesap kontrolleri
   devre dışı (K20), `subcity` türü konum yok (K55), WhatsApp Durum yok (K64).
5. **`conversion_domain` "bağlantıdan türet, kullanıcıya göster"** (README §2): Ads Manager artık dönüşüm
   alan adı istemiyor (K47). API'de alanın hâlâ okunup okunmadığı doğrulanmadan zorunlu adım yapılmamalı.
6. **Site niyetinde "piksel yoksa `LINK_CLICKS`'e düşer" varsayımı** (bölüm 00): LPV Temmuz 2025'ten beri
   pikselsiz de kullanılabiliyor, modellenebiliyor (K43).
7. **"Dayparting yalnız toplam bütçede"** (README §6.6, bölüm 04): arama reklamı yardım sayfası günlük
   bütçeyle zamanlamadan söz ediyor (K42) — canlı ölçüm.
8. **Advantage+ creative "hepsi `OPT_OUT`"** (README §2, §8-6 — bağlayıcı kararlar kutusunda değil, öneri):
   Meta, Advantage+ yerleşimle birlikte Advantage+ creative kullanmayı öneriyor (K23); sektörün önde gelen
   kaynağı 2026'da çoğu iyileştirmeyi açık tuttuğunu yazıyor (K68). Marka metnini/görselini ÜRETEN
   özellikler ile kadraj UYARLAMA özelliği ayrılarak yeniden değerlendirilebilir. Brand kontrolünü
   bozmadan en temiz yol, 4:5 + 9:16 varlıkları kullanıcıdan almak (Tasarım B4).
9. **Atıf standardı "7g tık + 1g görüntüleme"** (README §8-7): yeni "etkileşim (engage-through) 1 gün"
   ayarı var ve tık tanımı yalnız bağlantı tıklamasına daraldı (K46). Karar "etkileşim dahil mi" sorusuyla
   genişletilmeli; tanım değişikliği eski raporlarla kıyası bozar.
10. **"Ad set başına 50 reklam"** (README §1): sınır doğru ama Meta'nın önerisi az reklam/çok varlık (K4);
    sayfa başına 250 aktif reklam sınırı (K5) brief'te yok.
11. **WhatsApp niyetinin amacı [Karar]** (README §5.3, §8-8): Ads Manager akışında Lead + WhatsApp →
    varsayılan "konuşma" ve Advantage+ açık (K37); "mesajlaşmayla lead" lead ya da etkileşim amacıyla (K39).
    Advantage+ lead durumu yalnız lead amacında tanımlı (K52) → bağlayıcı karar 2 ile uyumlu seçim
    `OUTCOME_LEADS`.
12. **Arama niyetinin amacı [Karar]** (README §8-9): yardım merkezi trafik/etkileşim/lead/satışın hepsini
    destekliyor ve hepsinde 60 sn aramaya optimize ediyor (K42); `OUTCOME_LEADS` Advantage+ lead durumunu
    da açtığı için önerilir.
13. **`user_age_unknown`** (README §2): v26 ile "Durum seçiliyken varsayılan `true`" resmîleşti (K48) —
    brief'le uyumlu; ek olarak Durum özel kategoride hiç yok (K64).
14. **Belge içi:** Marketing API "Optimization Tips" (K63) segmentasyon ve kampanya ortası hedefleme
    değişikliğini öneriyor; Yardım Merkezi tersini (K2, K6). Yardım Merkezi esas alınmalı.

---

## Advetics için tasarım önerileri

### A. Reçete — reklamcılık bilmeyen kullanıcı için varsayılan kurulum

**Bütün niyetlerde ortak:**

| Katman | Varsayılan | Dayandığı bulgu |
|---|---|---|
| Kampanya sayısı | Niyet başına hesapta **1 aktif kampanya.** Aynı niyetle ikincisi açılmak istenirse uyarı ("Meta iki reklamınızı aynı kişiler için yarıştırır") + "mevcut kampanyaya yeni fikir ekle" seçeneği | K3, K4, K6 |
| Ad set sayısı | **1.** İkincisi yalnız KESİN kontrol farklıysa (ör. iki ayrı şehirde iki proje); dil, yerleşim ya da ilgi alanına göre bölme yok | K4, K6 |
| Bütçe yeri | **Kampanya bütçesi (CBO), günlük.** Çok ad set'te ad set alt/üst harcama limiti, "garanti değil" notuyla | K12, K16, K56 |
| Teklif | `LOWEST_COST_WITHOUT_CAP`. Maliyet hedefi yalnız Gelişmiş'te ve "günlük ≥ 5 × hedef" kuralıyla | K31, K52 |
| Kitle | `advantage_audience: 1` açıkça. **Kontroller:** konum (zorunlu), en düşük yaş 18 (sektör gerektirirse en çok 25), müşteri listesi hariç (isteğe bağlı). **Öneriler:** yaş aralığı (`age_range`), cinsiyet, ilgi | K11, K15, K53 |
| Konum genişletme | Kapalı ve açıkça yazılır (alan canlıda doğrulanınca) | K11, depo 03 |
| Dil | Gönderilmez (Türkçe reklam, Türkiye kitlesi); Gelişmiş'te kontrol | K11 |
| Yerleşim | Advantage+ (yerleşim alanı gönderilmez); `user_age_unknown` açıkça; hesap kontrolleri okunup gösterilir | K20, K21–K23, K48 |
| Reklam sayısı | **3–5 farklı FİKİR, en az 2** (Advetics sentezi: Meta'nın "az reklam, çeşitli varlık" önerisi ile KOBİ üretim kapasitesi; sektörün 8–20+ iddiası resmî değil) | K4, K5, K69, K71 |
| Medya | Her fikir **4:5 + 9:16** (video için 9:16 öncelikli); tek oran yüklenirse uyarı | K24, K26 |
| Atıf | Standart model, 7 gün tık + 1 gün görüntüleme (+ etkileşim kararı), açıkça | K46 |
| Süre | **En az 7 gün;** ilk 7 günde AI "iyileştirme" önermez, yalnız arıza (ret, harcamama, bozuk form) bildirir | K1, K38, K41 |
| Bütçe alt sınırı | Hesabın `minimum_budgets` değeri RET sınırı; "öğrenme dostu" tahmin UYARI | K31, K50, §3.2 |

**Niyete göre:**

| Niyet | Kampanya | Ad set | Reklam / kreatif | Niyete özel ayar | Uyarı |
|---|---|---|---|---|---|
| 1 · Form doldursunlar | `OUTCOME_LEADS`, CBO | `LEAD_GENERATION`, `ON_AD`, `page_id` | 3–5 fikir, aynı form; CTA `SIGN_UP` (ya da `GET_QUOTE`/`APPLY_NOW`) | Form türü TEK soruyla: "Gelen kişileri tek tek arayacak mısınız?" Evet → daha yüksek niyet (`is_optimized_for_quality: true`), Hayır → daha fazla hacim. En çok 3 çoktan seçmeli soru; ad ve telefon önceden dolar; gizlilik politikası adresi Marka Merkezi'nden zorunlu; `block_display_for_non_targeted_viewer: true` | Yüksek niyet yalnız mobil FB/IG akışında gösterilir (yerleşim fiilen daralır). CRM bağlı + ayda ≥200 lead → "nitelikli lead" (`QUALITY_LEAD`, CAPI şart) önerisi |
| 2 · WhatsApp'tan yazsınlar | `OUTCOME_LEADS`, CBO | `CONVERSATIONS`, `WHATSAPP`, `page_id` | 3–5 fikir; kare/dikey; "WhatsApp'tan yaz" vurgusu; CTA `WHATSAPP_MESSAGE` + `app_destination` | Türkçe `page_welcome_message` + 3 hızlı soru (`ice_breakers`) ZORUNLU alan; yayından sonra "WhatsApp Business'ta konuşmaları etiketle, müşteri etkinliği paylaşımını aç" görevi; 30 günde ≥10 etiket → "mesajlaşmayla lead" hedefine YENİ ad set ile geçiş önerisi | CBO'da yayından sonra hedef değişmez, değişiklik öğrenmeyi sıfırlar |
| 3 · Siteme gelsinler | `OUTCOME_TRAFFIC`, CBO | `LANDING_PAGE_VIEWS`, `WEBSITE` | 3–5 fikir; CTA `LEARN_MORE` | UTM şablonu; piksel varsa izleme, şart değil | Advantage+ kampanya durumu bu amaçta tanımlı değil |
| 4 · Sitemden satış/kayıt | `OUTCOME_SALES` (ya da `OUTCOME_LEADS` + site), CBO | `OFFSITE_CONVERSIONS` + `pixel_id` + `custom_event_type` | Satışta esnek biçim (bir reklamda ≤10 medya) mümkün; diğerinde 3–5 fikir | Yalnız ölçüm hazırsa (depo 08 listesi) VE seçilen olay atıf penceresi içinde haftada ~50'ye yakınsa; değilse daha sık olay ya da LPV önerisi | Değer optimizasyonu Gelişmiş (14 günde 100+, ≥5 farklı değer) |
| 5 · Beni arasınlar | `OUTCOME_LEADS`, CBO | `QUALITY_CALL`, `PHONE_CALL` | 2–4 fikir; CTA `CALL_NOW`; numara Marka Merkezi'nden | Mesai saatine zamanlama (toplam bütçe + `adset_schedule`; günlük bütçeyle canlıda doğrulanırsa onunla); "60 sn'lik aramalara optimize edilir" notu | Zamanlamasız kampanya mesai dışında açılmayan aramaya para harcar |
| 6 · Daha çok kişi görsün | `OUTCOME_AWARENESS` | `REACH` (geri okumada `IMPRESSIONS`) | 3–5 fikir | 2. tur | — |
| **Ek katman: konut (HOUSING)** | + `special_ad_categories: ["HOUSING"]`, `special_ad_category_country: ["TR"]` | Yaş 18–65+ sabit, cinsiyet yok, konum hariç tutma yok, il/şehir + ≥17 km; `subcity`/`*_geo_area` yok; benzer kitle yok; Advantage+ kitle canlı doğrulamaya bağlı | — | WhatsApp Durum'a gitmez; hesap kontrolleri uygulanmaz — ekranda yazılır | Meta Advantage+ kitleyi reddederse sessizce `0`'a düşülmez; kullanıcıya "Meta bu kategoride otomatik kitleyi kapatıyor" denir |

### B. Ekran, akış ve kural önerileri

1. **Derleyicinin varsayılanı "tek kampanya + tek ad set + kampanya bütçesi".** Advantage+ durumunu
   korur, `is_adset_budget_sharing_enabled` gerektirmez, Meta'nın sadeleştirme önerisine uyar. Birden çok
   proje/şehir varsa kullanıcıya TEK soru: "Her proje için ayrı bütçe garanti edilsin mi?" — Hayır: tek
   kampanya, proje başına ad set; Evet: ad set alt/üst limiti ("garanti değil" notuyla), yine olmazsa ayrı
   kampanya. [K16, K56, K6]
2. **Yinelenen niyet bekçisi:** aynı hesapta aynı niyetle aktif kampanya varsa yeni kampanya yerine
   "mevcut kampanyaya fikir ekle" önerilir; ekrandaki not: "Yeni reklam eklemek o reklam setinin öğrenmesini
   yeniden başlatır." [K2, K3, K6]
3. **Değişiklik sınıflandırıcısı (panel + AI ortak, saf fonksiyon):** her düzenleme K2 listesine göre üç
   sınıftan birine düşer — *öğrenmeyi yeniden başlatır* (hedefleme, kreatif, optimizasyon olayı, yeni reklam,
   7+ gün duraklatma, teklif stratejisi) / *büyüklüğüne bağlı* (bütçe, harcama limiti, teklif tutarı —
   yüzde değişim gösterilir, eşik uydurulmaz) / *etkisiz*. Onay kartı sınıfı yazar. Kaynak: "Meta Yardım
   Merkezi". README §6.6'daki "AI kural uydurmaz" ilkesi korunur, çünkü liste Meta'nın kendisinden.
4. **Kreatif adımı iki oran ister:** her fikir için 4:5 (akış) ve 9:16 (Stories/Reels/Durum) yükleme alanı;
   giriş anında oran ve piksel doğrulaması (API alt sınırı ret, yardım merkezi önerisi uyarı). Tek oran
   yüklenirse: "Hikâye ve Reels'te kenarlı görünebilir — dikey sürüm ekleyin." İki oran PAC kurallarıyla
   bağlanır; WhatsApp niyetinde PAC'ın API'de kabul edildiği canlıda görülene kadar `validate_only` ile prova
   edilir, reddedilirse sessizce tek orana düşülmez, kullanıcıya söylenir. [K24, K25, K26, K27, K57]
5. **Bütçe ekranında "öğrenme dostu bütçe" göstergesi:** Advetics aynı hesabın (yoksa aynı workspace'in)
   son 90 gününde aynı optimizasyon olayının sonuç başı maliyetini insights'tan okur ve
   "Bu bütçeyle haftada ~N sonuç; Meta öğrenmek için haftada ~50 ister" der. Geçmiş yoksa sayı uydurulmaz:
   "Geçmiş veri yok; ilk hafta gözlenecek." Tutarı AI seçmez (README §6.5). [K1, K31, K50]
6. **Öğrenme rozeti `learning_stage_info`'dan:** "Meta öğreniyor (12/50 sonuç)" — eşik
   `dynamic_lp_conversions_threshold` doluysa onun değeri; `FAIL` = "Sınırlı öğrenme: sebep ve Meta'nın
   önerdiği çözümler" (K3 sırasıyla). Ceza olmadığı ve iyi sonuçla birlikte görülebileceği yazılır. [K3, K51,
   K68]
7. **İlk 7 gün kilidi (öneri):** yayından sonraki 7 günde AI proaktif "iyileştirme" önermez; yalnız arıza
   (ret, harcamama, `WITH_ISSUES`, form/WhatsApp bağlantı sorunu). Kullanıcı yine de değişiklik isterse onay
   kartı sınıflandırıcıyı gösterir. [K1, K38, K41]
8. **Kitle ekranı iki kutu:** "Kesin sınırlar" (konum — zorunlu; en düşük yaş 18–25; hariç tutulacak müşteri
   listesi; dil — Gelişmiş) ve "Meta'ya ipuçları" (yaş aralığı, cinsiyet, ilgi, dahil edilecek müşteri
   listesi) — altında "Meta bu ipuçlarının dışına çıkabilir." Yaş ipucu `age_range` olarak gider; `age_min`
   yalnız kesin alt sınır. Konum genişletme kapalı ve geri okumada (`targetingsentencelines`) gösterilir.
   [K11, K15, K53]
9. **Hesap kontrollerini OKU ve göster:** workspace/hesap açılırken `GET /act_{id}/account_controls`;
   panelde "Bu hesapta Meta tarafında şu sınırlar var: en düşük yaş 21, Audience Network hariç" (sessiz kural
   görünür olur). Yazma yalnız ajans yöneticisi ve Gelişmiş/ayarlar ekranında; AI asla (README §6.2 "Hiç
   verilmez" satırıyla uyumlu). HOUSING kampanyasında "hesap sınırları bu kampanyaya uygulanmaz" notu.
   [K12, K20, K54]
10. **Marka güvenliği bilgi satırı:** hesabın envanter filtresi seviyesi okunur ve gösterilir (varsayılan
    "Genişletilmiş"); değiştirmek isteyene iki not: erişim düşer/maliyet artabilir ve marka güvenliği kontrolü
    kullanmak WhatsApp Durum'dan 12 ay otomatik çıkarılmaya yol açar. [K28, K36]
11. **HOUSING akışı:** kategori seçilince yaş/cinsiyet alanları kilitlenir (18–65+, herkes), konum hariç tutma
    ve ilçe (`subcity` vb.) seçimi kapanır, yarıçap ≥17 km zorlanır, benzer kitle listeden çıkar. Derleyici
    `advantage_audience` için önce `1`'i `validate_only` ile prova eder; geri okumada `advantage_state_info`
    ve `targeting_automation` karşılaştırılır. Meta `1`'i reddeder ya da sessizce kapatırsa yayın durur ve
    fark gösterilir (README §5.8 ilkesi). [K11, K30, K48, K52, K55]
12. **Form niyeti:** form türü teknik adla değil iş sorusuyla seçilir (Tablo A, satır 1); en çok 3 çoktan
    seçmeli soru sınırı ve "her soru form doldurma oranını düşürür" notu; nitelikli lead seçeneği yalnız CRM
    bağlıyken ve CAPI durumu "geçti" iken görünür (Nisan 2026 kuralı). [K32, K34, K35, K36, K60]
13. **WhatsApp niyeti:** Türkçe karşılama ve 3 hızlı soru zorunlu alan (boş bırakılırsa Meta İngilizce
    varsayılanı gösterir — sessiz hata); yayın sonrası "etiketleme" kontrol listesi; Advetics 30 günlük
    uygunluğu ölçemiyorsa ("bilinmiyor") "mesajlaşmayla lead" önerisi gösterilmez. [K37, K39, K58]
14. **Ölçüm standardı workspace'te tek:** atıf modeli standart, pencere açıkça; farklı modelli ad set'ler
    raporda yan yana toplanırsa "karşılaştırılamaz" uyarısı (`emptyReason` deseni). Dönüşüm alan adı adımı
    zorunlu yapılmaz. [K46, K47]
15. **v26 hazırlığı (27 Ekim 2026'dan önce):** derleyicide yasak listesi (`explore` yerleşimi, Messenger
    `story`, `poll_spec`, site+uygulama kampanyasında `web_only`); WhatsApp Durum'a gidebilecek her kreatifte
    `wamo_whatsapp_identity_spec` açıkça (sayfa kimliği ya da bağlı WhatsApp numarası) — eksikse Meta'nın ne
    yaptığı canlıda ölçülene kadar. [K48]
16. **Kreatif yorgunluğu:** `creative_fatigue` webhook'u (hesap aboneliği) → AI "yeni fikir ekle" önerisi;
    öneri kartı "yeni reklam = öğrenme yeniden başlar" notunu taşır. [K66, K2]

### C. AI araç katmanına eklenecekler (README §6.2'ye ek)

| Katman | Araç | Ne yapar |
|---|---|---|
| O | `ogrenme_durumu(adset)` | `learning_stage_info` (dinamik eşik dahil) + "Sınırlı öğrenme" sebepleri ve Meta'nın çözüm sırası |
| O | `degisiklik_etkisi(nesne, alan, eski, yeni)` | K2'ye göre sınıf; yüzde değişim; Meta'nın sözü kaynaklı |
| O | `hesap_kontrolleri_oku(act)` | `account_controls` + envanter filtresi; özel kategoride uygulanmadığı notu |
| O | `butce_onerisi(niyet, hesap)` | Geçmişten sonuç başı maliyet; yoksa "bilinmiyor" (uydurma yok) |
| T | `form_taslagi(sektor_cevabi)` | Form türü + ≤3 soru + gizlilik URL kontrolü |
| Sıfır çağrılı ret | — | CBO'da yayından sonra optimizasyon hedefi değişikliği; v26 yasak listesi; HOUSING'de konum hariç tutma ve `subcity` |

---

## Açık sorular ve doğrulanması gerekenler

**Canlıda ölçülmeli (ajansın kendi hesabında, `validate_only` ve `PAUSED` kurulum + geri okuma):**

1. **HOUSING + `advantage_audience: 1` + `special_ad_category_country: ["TR"]`:** kabul ediliyor mu;
   `advantage_state_info.advantage_audience_state` ne dönüyor; yaş/cinsiyet/yarıçap kısıtları TR'de
   uygulanıyor mu, yarıçap alt sınırı kaç km; `targetingsentencelines` ne diyor.
2. Türkiye il/ilçe aramasında dönen türler (`city`, `subcity`, `*_geo_area`) — HOUSING'de hangileri geçerli.
3. Etkileşim (engage-through) penceresinin `attribution_spec`'teki karşılığı ve Advetics hiç yazmazsa geri
   okunan varsayılan.
4. `minimum_budgets` alanlarının birimi (kuruş mu, TL mi) ve TRY hesaplarda değerleri (optimizasyon türüne
   göre).
5. `learning_stage_info.dynamic_lp_*` alanlarının gerçek hesaplarda dolu olup olmadığı ve değerleri.
6. PAC (`asset_customization_rules`) API'de `OUTCOME_LEADS` + `WHATSAPP` / `ON_AD` / `PHONE_CALL` ile
   kabul ediliyor mu; `instagram_positions: reels` kural içinde geçerli mi.
7. WhatsApp Durum kimliği: Advantage+ yerleşimli kreatifte `wamo_whatsapp_identity_spec` yokken hata mı,
   sayfa kimliği mi, Durum'dan sessiz çıkarılma mı (v25 belgesi ↔ v26 blogu).
8. Türkiye, Meta'nın mesajlaşma kısıtlarında (CTWA metrikleri/özellikleri) "Avrupa" sayılıyor mu.
9. "Daha yüksek niyet" formu Advantage+ yerleşim durumunu kapatıyor mu (teslimat yalnız mobil FB/IG akışı).
10. WhatsApp için "mesajlaşmayla lead" hedefinin API değerleri (`optimization_goal` / `destination_type`).
11. `adset_schedule` günlük bütçeyle kabul ediliyor mu (arama niyeti).
12. Pikselsiz `LANDING_PAGE_VIEWS` API'de kuruluyor mu, geri okunan hedef ne.
13. `conversion_domain` API'de hâlâ okunuyor/zorunlu mu (AEM değişikliği sonrası).
14. Konum genişletme ("daha fazla kişiye ulaş") alanı: `individual_setting.geo` mi, varsayılanı ne,
    `advantage_audience: 1` ile birlikte yazılabiliyor mu.
15. Müşteri hesaplarında `account_controls` gerçekten dolu mu (havuzdaki hesaplar için tek seferlik okuma).
16. v26 yasak listesinin Advetics'in bugünkü gönderdiği alanlarla kesişimi (27 Ekim 2026 öncesi).

**Kullanıcıya sorulmalı:**

a. **HOUSING'de Meta Advantage+ kitleyi kabul etmezse hangi karar önce gelir?** Öneri: özel kategori
   kısıtları (karar 4) kazanır, o kampanyada Advantage+ kitle kapanır ve ekranda söylenir.
b. **Advantage+ creative:** "hepsi kapalı" önerisi korunacak mı; yoksa marka varlığını ÜRETEN özellikler
   kapalı, kadraj uyarlaması müşteri onayıyla açık mı? (Meta ve sektör açık tutmayı öneriyor.)
c. **Atıf standardına "etkileşim 1 gün" dahil edilecek mi?**
d. **Çok projeli müşteride** tek kampanya + proje başına ad set (Meta'nın önerisi) mi, proje başına ayrı
   bütçe garantisi mi?
e. **Form türü varsayılanı** sektöre göre mi ("tek tek arayacak mısınız" sorusu) yoksa her zaman "daha
   yüksek niyet" mi?
f. **v26 geçişi:** 27 Ekim 2026 öncesi derleyici/yayın yolunda yasak listesi kimin işi ve ne zaman?

---

## Kaynaklar

Yardım Merkezi sayfalarında yayın tarihi gösterilmiyor; "tarihsiz" yazılanlar 2026-10-06'da canlı okundu.
"Depo" = `docs/meta-reklam-brief/kaynak/` altındaki, 2026-10-06'da indirilmiş resmî Meta belgesi.

| # | Başlık | URL | Tarih | Etiket |
|---|---|---|---|---|
| K1 | About the learning phase | https://www.facebook.com/business/help/112167992830700 | tarihsiz | Resmî-Meta |
| K2 | Significant edits and learning phase | https://www.facebook.com/business/help/316478108955072 | tarihsiz | Resmî-Meta |
| K3 | About learning limited | https://www.facebook.com/business/help/269269737396981 | tarihsiz | Resmî-Meta |
| K4 | About managing ad volume | https://www.facebook.com/business/help/2720085414702598 | tarihsiz (Haziran 2024 notu taşıyor) | Resmî-Meta |
| K5 | Ad limits per Page | https://www.facebook.com/business/help/766697140509126 | tarihsiz | Resmî-Meta |
| K6 | Combine ad sets and campaigns to reduce audience fragmentation | https://www.facebook.com/business/help/2419480091640105 | tarihsiz | Resmî-Meta |
| K7 | Performance Marketing on Meta (Performance 5) | https://www.facebook.com/business/ads/performance-marketing | tarihsiz | Resmî-Meta |
| K8 | AI Innovations in Meta's Ad Ranking Driving Advertiser Performance | https://www.facebook.com/business/news/ai-innovation-in-metas-ads-ranking-driving-advertiser-performance | 2025-03-27 | Resmî-Meta |
| K9 | Meta Andromeda: Supercharging Advantage+ automation… (Engineering at Meta) | https://engineering.fb.com/2024/12/02/production-engineering/meta-andromeda-advantage-automation-next-gen-personalized-ads-retrieval-engine/ | 2024-12-02 | Resmî-Meta |
| K10 | About Advantage+ audience | https://www.facebook.com/business/help/273363992030035 | tarihsiz | Resmî-Meta |
| K11 | About Audience controls and Audience suggestions in Advantage+ audience (TR + EN okundu) | https://www.facebook.com/business/help/938372127764391 | tarihsiz | Resmî-Meta |
| K12 | What turns Advantage+ on and Advantage+ off | https://www.facebook.com/business/help/906206294602874 | tarihsiz | Resmî-Meta |
| K13 | About the Advantage+ campaign experience | https://www.facebook.com/business/help/1292656978738967 | tarihsiz | Resmî-Meta |
| K14 | Create a campaign in the Advantage+ campaign experience | https://www.facebook.com/business/help/830005979993164 | tarihsiz | Resmî-Meta |
| K15 | Choose audience settings in Advantage+ campaigns | https://www.facebook.com/business/help/25941857932125812 | tarihsiz | Resmî-Meta |
| K16 | Choose your budget strategy for Advantage+ campaigns | https://www.facebook.com/business/help/1602924913861363 | tarihsiz | Resmî-Meta |
| K17 | About Advantage+ leads campaigns | https://www.facebook.com/business/help/992035952809423 | tarihsiz | Resmî-Meta |
| K18 | About Advantage+ sales campaigns | https://www.facebook.com/business/help/1362234537597370 | tarihsiz | Resmî-Meta |
| K19 | Meta Advantage+ sales campaigns (Meta for Business) | https://www.facebook.com/business/ads/meta-advantage-plus/sales-campaigns | tarihsiz | Resmî-Meta |
| K20 | Set audience and placement controls for your ad account | https://www.facebook.com/business/help/1438478636941047 | tarihsiz | Resmî-Meta |
| K21 | About Advantage+ placements | https://www.facebook.com/business/help/196554084569964 | tarihsiz | Resmî-Meta |
| K22 | How the Meta delivery system works using Advantage+ placements | https://www.facebook.com/business/help/965529646866485 | tarihsiz | Resmî-Meta |
| K23 | Best practices for placements | https://www.facebook.com/business/help/23942209872116948 | tarihsiz | Resmî-Meta |
| K24 | Aspect ratios supported by placements in Meta Ads Manager | https://www.facebook.com/business/help/682655495435254 | tarihsiz | Resmî-Meta |
| K25 | Recommended minimum image pixel requirements across placements | https://www.facebook.com/business/help/469767027114079 | tarihsiz | Resmî-Meta |
| K26 | About placement asset customization | https://www.facebook.com/business/help/1044825198987622 | tarihsiz | Resmî-Meta |
| K27 | Supported ad objectives and conversion locations for media customization | https://www.facebook.com/business/help/1001112308024751 | tarihsiz | Resmî-Meta |
| K28 | About inventory filter in Meta Ads Manager | https://www.facebook.com/business/help/3001448133206080 | tarihsiz | Resmî-Meta |
| K29 | How to choose a Special Ad Category | https://www.facebook.com/business/help/298000447747885 | tarihsiz (Ocak 2025 notu) | Resmî-Meta |
| K30 | About audiences for housing, employment or financial products and services campaigns | https://www.facebook.com/business/help/2220749868045706 | tarihsiz | Resmî-Meta |
| K31 | Best practices for minimum budgets | https://www.facebook.com/business/help/203183363050448 | tarihsiz | Resmî-Meta |
| K32 | About performance goals for lead ads | https://www.facebook.com/business/help/782657799338685 | tarihsiz (Nisan/Ağustos 2026 notu) | Resmî-Meta |
| K33 | Set up your CRM for qualified leads | https://www.facebook.com/business/help/279369167153556 | tarihsiz | Resmî-Meta |
| K34 | About lead ads with instant form | https://www.facebook.com/business/help/761812391313386 | tarihsiz | Resmî-Meta |
| K35 | About instant form types | https://www.facebook.com/business/help/252352181957512 | tarihsiz | Resmî-Meta |
| K36 | Best practices to create lead ads | https://www.facebook.com/business/help/435270316658768 | tarihsiz | Resmî-Meta |
| K37 | Create ads that click to WhatsApp in Ads Manager | https://www.facebook.com/business/help/447934475640650 | tarihsiz | Resmî-Meta |
| K38 | Best practices for ads that click to message | https://www.facebook.com/business/help/269324800441478 | tarihsiz | Resmî-Meta |
| K39 | About maximizing number of leads using ads that click to message | https://www.facebook.com/business/help/575610661605746 | tarihsiz | Resmî-Meta |
| K40 | About lead generation in Instagram Direct, Messenger and WhatsApp | https://www.facebook.com/business/help/734075733714274 | tarihsiz | Resmî-Meta |
| K41 | Mesaja yönlendiren reklamlar (Meta for Business, Türkçe) | https://www.facebook.com/business/ads/click-to-message-ads | tarihsiz (2024 2. yarı deneyi) | Resmî-Meta |
| K42 | Create a call ad from Meta Ads Manager | https://www.facebook.com/business/help/604687010451937 | tarihsiz (Haziran 2025 notu) | Resmî-Meta |
| K43 | About landing page view optimization | https://www.facebook.com/business/help/417293491972212 | tarihsiz (Temmuz 2025 notu) | Resmî-Meta |
| K44 | Best practices for landing page view optimization | https://www.facebook.com/business/help/203012060587398 | tarihsiz | Resmî-Meta |
| K45 | Best practices guide: predicted zero conversions | https://www.facebook.com/business/help/197634954160445 | tarihsiz — bazı kısımları eski olabilir | Resmî-Meta |
| K45b | Expand your ad creative strategy (Meta for Business) | https://www.facebook.com/business/ads/ad-creative | tarihsiz | Resmî-Meta |
| K46 | About attribution models and attribution settings | https://www.facebook.com/business/help/460276478298895 | tarihsiz | Resmî-Meta |
| K47 | About Meta's Aggregated Event Measurement | https://www.facebook.com/business/help/721422165168355 | tarihsiz (Ekim 2024 notu) | Resmî-Meta |
| K48 | Introducing Graph API v26.0 and Marketing API v26.0 | https://developers.facebook.com/blog/post/2026/07/29/introducing-graph-api-v26-and-marketing-api-v26/ | 2026-07-29 | Resmî-Meta |
| K49 | Graph API and Marketing API versions | https://developers.facebook.com/docs/graph-api/changelog/versions/ | 2026-10-06 okundu | Resmî-Meta |
| K50 | MinimumBudget (Marketing API reference) | https://developers.facebook.com/docs/marketing-api/reference/minimum-budget/ | tarihsiz | Resmî-Meta |
| K51 | AdCampaignLearningStageInfo (Marketing API reference) | https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-learning-stage-info/ | tarihsiz | Resmî-Meta |
| K52 | Advantage+ Campaign Experience for Sales, App, and Leads (depo) | `kaynak/marketing-api__advantage-campaigns.md` | v25 dönemi | Resmî-Meta |
| K53 | Advantage+ audience (depo) | `kaynak/marketing-api__audiences__reference__targeting-expansion__advantage-audience.md` | v25 dönemi | Resmî-Meta |
| K54 | Ad Account Account Controls (depo) | `kaynak/marketing-api__reference__ad-account__account_controls.md` | v25 dönemi | Resmî-Meta |
| K55 | Special Ad Categories (depo) | `kaynak/marketing-api__audiences__special-ad-category.md` | v25 dönemi | Resmî-Meta |
| K56 | Advantage Campaign Budget (depo) | `kaynak/marketing-api__bidding__guides__advantage-campaign-budget.md` | v25 dönemi | Resmî-Meta |
| K57 | Placement Asset Customization + Asset Customization Rules (depo) | `kaynak/marketing-api__dynamic-creative__placement-asset-customization.md`, `kaynak/marketing-api__ad-creative__asset-feed-spec__asset-customization-rules.md` | v25 dönemi | Resmî-Meta |
| K58 | Ads that Click to WhatsApp (depo) | `kaynak/marketing-api__ad-creative__messaging-ads__click-to-whatsapp.md` | v25 dönemi | Resmî-Meta |
| K59 | Conversions API for Business Messaging (depo) | `kaynak/conversions-api__business-messaging.md` | v25 dönemi | Resmî-Meta |
| K60 | Conversions API for CRM Integration + FAQ (depo) | `kaynak/conversions-api__conversion-leads-integration.md`, `…__faq.md` | v25 dönemi | Resmî-Meta |
| K61 | Best Practices — Conversions API (depo) | `kaynak/conversions-api__best-practices.md` | v25 dönemi | Resmî-Meta |
| K62 | Omni Optimal Technical Setup Guide (depo) | `kaynak/marketing-api__best-practices__omni-optimal-setup-guide.md` | v25 dönemi | Resmî-Meta |
| K63 | Optimization Tips (depo) | `kaynak/marketing-api__get-started__ad-optimization-basics__optimization-tips.md` | tarihsiz, genel | Resmî-Meta |
| K64 | Ads in WhatsApp Status + WhatsApp identity (depo) | `kaynak/marketing-api__ads-in-whatsapp-status.md`, `…__whatsapp-identity.md` | v25 dönemi | Resmî-Meta |
| K65 | Lead ads — create (depo) | `kaynak/marketing-api__guides__lead-ads__create.md` | v25 dönemi | Resmî-Meta |
| K66 | Creative fatigue webhook (depo) | `kaynak/marketing-api__ads-webhooks__creative-fatigue.md` | v25 dönemi | Resmî-Meta |
| K67 | Marketing API changelog / versions (depo) | `kaynak/marketing-api__marketing-api-changelog.md`, `…__versions.md` | 2026-10-06 indirildi | Resmî-Meta |
| K68 | I Was Wrong: How My Approach to Meta Ads Changed (Jon Loomer) | https://www.jonloomer.com/meta-ads-approach-changed/ | 2026-04-07 | Sektör |
| K69 | The Truth About Meta Andromeda and Ad Retrieval (Jon Loomer) | https://www.jonloomer.com/meta-andromeda-ad-retrieval/ | 2025-11-10 | Sektör |
| K70 | Meta blocks 47 commerce endpoints as Graph API v26.0 lands today (PPC Land) | https://ppc.land/meta-blocks-47-commerce-endpoints-as-graph-api-v26-0-lands-today/ | 2026-07-30 | Sektör |
| K71 | Andromeda "ad set başına 8–15 / 20–30 kreatif" iddiaları — yalnız arama özeti | https://confect.io/tactics/meta-andromeda-2026 · https://pipeboard.co/guides/creative-volume-andromeda · https://www.usewonderful.com/blog/meta-andromeda-creative-strategies | 2025–2026 | Topluluk/Sektör |
| K72 | "Yüksek niyet formu tek kullanımlık kod ister" iddiası — yalnız arama özeti | https://adsuploader.com/blog/facebook-instant-form | 2026 | Topluluk |
| K73 | TL bütçe önerileri ve "CPA × 50 ÷ 7" formülü — yalnız arama özeti | https://www.crabsmedia.com/en/meta-ad-management-turkey/ · https://peretz.agency/blog/media-strategy-generates-leads-2026 | tarih belirsiz — eski olabilir | Topluluk |

Depodaki iç girdiler (karşılaştırma için): `README.md` (§1, §2, §3, §5.3, §6, §8), `bolumler/00`
(goal-mapping tablosu), `02`, `03` (hedefleme, Türkiye il/ilçe, marka güvenliği), `04` (bütçe, Advantage+),
`05` (kreatif, medya tablosu, esnek format), `06` (niyet sözlüğü), `08` (ölçüm kontrol listesi).
