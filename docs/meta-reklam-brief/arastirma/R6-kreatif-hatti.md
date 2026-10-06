# R6 — Kreatif üretim hattı ve kreatif testleri

> **Yöntem:** Önce depodaki `README.md` (özellikle §2 manifesto, §5.6 prova, §7.3–7.4), `bolumler/05`
> (kreatif, Advantage+ creative, giriş anı medya tablosu), `bolumler/06` (reklam türleri, yerleşim
> değiştiricileri), `bolumler/04`'ün A/B kısmı ve `kaynak/` altındaki 23 ham Meta geliştirici sayfası okundu
> (split test / `SPLIT_TEST_V2`, `creative_fatigue` webhook'u, yerleşim varlık özelleştirmesi, varlık
> özelleştirme kuralları, çoklu medya reklamları, yerleşim hedefleme, Advantage+ creative, üretken AI
> özellikleri, Instagram medya gereksinimleri, Reels, esnek format, dinamik kreatif, performans önerileri,
> reklam hacmi, `image_crops` sözlüğü, v24/v25 değişiklik günlükleri). Meta İşletme Yardım Merkezi
> sayfaları tarayıcıda JavaScript ile açıldığı için WebFetch boş döndü; bu sayfalar oturuma bağlı **Meta Ads
> MCP'sinin salt okuma `ads_get_help_article` aracıyla** çekildi (≈40 resmî makale). Hesaba dokunan hiçbir
> araç çağrılmadı; A/B test ve önizleme araçlarının yalnızca **şeması** okundu. Meta Ads Guide'dan 8 özellik
> sayfası, Meta'nın 4 kurumsal yazısı (mühendislik blogu, işletme haberi, Performance 5, Reels sayfası),
> Türkiye mevzuatından 3 birincil metin (Resmî Gazete 12.11.2025 sağlık tanıtım yönetmeliği, 2015 Ticari
> Reklam Yönetmeliği, Ticaret Bakanlığı broşürü — PDF yerelde metne çevrilerek), AB AI Act m.50, Canva /
> Adobe / Google belgeleri ve ~15 sektör yazısı okundu. Jon Loomer gibi bazı sitelere erişim 403 verdi; o
> bilgiler arama özetinden alındı ve öyle işaretlendi. Toplam **≈95 kaynak**, tarih aralığı 2015–2026-10-06,
> ağırlık 2025–2026.
>
> **Güvenilirlik özeti:** Oranlar, güvenli alanlar, yerleşim davranışı, reklam hacmi, öğrenme aşaması,
> yorgunluk, test kuralları ve politika maddeleri **[Resmî-Meta]**; mevzuat **[Resmî-diğer]**. Sektörde
> dolaşan "ad set başına 8–15 / 10+ / 20–30 kreatif", "%70 görsel fark", "Entity ID", "güvenli alan Mart
> 2026'da birleştirildi", "geliştirmeler Şubat'tan beri varsayılan açık" iddiaları **Meta belgesine
> bağlanamadı** ve öyle yazıldı. **Meta'nın kendi metinleri dört yerde çelişiyor** (esnek formatın
> kullanılabildiği amaçlar; Facebook akışında 4:5 görselin kırpılması; Instagram akışı için önerilen oran;
> yerleşim kuralının "en az iki kural" şartı) — ikisi de yazıldı, birleştirilmedi. Buradaki her yazma kuralı
> **belgeden**; Advetics'te canlıda denenmedi (README §4).
>
> **Gösterim:** `[12 · Resmî-Meta]` = iddianın kaynağı (numara en alttaki tabloda; URL ve tarih orada) ve
> güvenilirlik etiketi. `D1–D5` = depodaki belgeler (README, bölüm 04, 05, 06, `CLAUDE.md`).

---

## Özet: yeni modül için ne demek (en önemli 12 madde)

1. **Meta kreatifi dört oranla düşünüyor; API'de eksik oranı kimse tamamlamıyor.** Ads Manager 2026'da kare
   (1:1), portre (4:5), dikey (9:16) ve yatay (1,91:1 / 16:9) varyasyon istiyor ve eksik olanı dolgu, kırpma,
   genişletme ve yapay zekâ ile kendisi dolduruyor [3, 4 · Resmî-Meta]. Advetics bu geliştirmeleri kapalı
   tuttuğu için (karar, D1 §2) eksik oran Meta tarafından tamamlanmaz; geriye Meta'nın eski kırpma kuralları
   ve Hikâye'de Meta'nın seçtiği boşluk rengi kalır [60, 12 · Resmî-Meta]. **Acemi'de 4:5 + 9:16 zorunlu,
   1:1 türetilir.**
2. **Tek kaynak yüklenecekse dikey iste.** Güvenli alana göre tasarlanmış 9:16 görselin içinden 4:5 ve 1:1
   kırpım bilgi kaybetmeden çıkıyor; 4:5'ten 9:16 ise yalnızca dolgu ya da AI genişletmeyle yapılabiliyor
   (Advetics hesabı, §1.6; güvenli alan değerleri [41, 42 · Resmî-Meta]).
3. **9:16 güvenli alan: üst %14, alt %35, yanlar %6.** Ads Guide bugün Hikâye ve Reels için aynı sayıyı
   veriyor; yasal uyarı taşıyan Reels'te alt %40 boş kalmalı; 9:16'dan uzun ekranlarda Meta görseli
   yakınlaştırıp güvenli alan dışını kesebiliyor [10, 41, 42, 45, 46 · Resmî-Meta].
4. **Kırpmak teslimatı kısıtlamaz; "esnek medya" varsayılan açık gelebilir.** Bir medyanın hangi yerleşime
   gideceği ayrıca yazılmazsa Meta onu başka yerleşimlerde de kullanabiliyor [3, 4, 8 · Resmî-Meta].
   Manifestoya `pac_relaxation: OPT_OUT` eklenmeli, yerleşim eşlemesi açıkça yazılmalı, önizlemeyle
   doğrulanmalı.
5. **"Hangi oran hangi yerleşime" için API'de dört yol var ve hiçbiri Reels'i kesin adlandırmıyor:**
   `image_crops`, `platform_customizations`, yerleşim varlık özelleştirmesi (`asset_customization_rules`;
   belgedeki pozisyon listesinde `reels` ve WhatsApp `status` yok) ve yeni çoklu medya
   (`placement_exclusions`) [53, 55, 64 · Resmî-Meta]. Seçim canlıda ve bedava (`validate_only` +
   `generatepreviews`) yapılmalı.
6. **Çeşitlilik resmî, sayı resmî değil.** Meta çeşitlendirmeyi ve "farklı müşteri tipleri için geniş varlık
   portföyü"nü öneriyor ama ad set başına sayı vermiyor [48, 49 · Resmî-Meta; 82 · Sektör]. Resmî olan karşı
   yöndeki uyarı: fazla reklam öğrenmeyi bozar; reklam sayısını azalt, reklam başına çeşitli varlık tut
   (10'a kadar); sayfa başına 250 reklam sınırı bütün hesapların toplamıdır [21, 22 · Resmî-Meta].
7. **"Farklı kavram" = farklı kişi, vaat, kanıt ya da biçim.** Meta yorgunlukta "malzemece farklı"
   görsel/video istiyor; aynı varlığı paylaşan reklamlar açık artırmada birbirini dışarıda bırakıyor;
   yorgunluk hesabı aynı görselin sayfadaki diğer kampanyalardaki gösterimini de sayıyor
   [25, 26 · Resmî-Meta].
8. **Yenileme öğrenmeyi sıfırlar; tetikleyici Meta'nın kendi sinyali olmalı.** Ad set'e reklam eklemek
   "önemli düzenleme" (~50 sonuç/hafta) [23, 24 · Resmî-Meta]. Yorgunluk için Meta'nın durumları ("creative
   limited" < 2×, "creative fatigue" ≥ 2× sonuç başı maliyet) ve 2026'da gelen `creative_fatigue`
   webhook'u (LOW/MEDIUM/HIGH) var [25, 52 · Resmî-Meta]; uydurma eşiğe gerek yok.
9. **Yerleşik kreatif testinin API karşılığı var ama Meta'nın "kazanan" eşiği düşük.** `ad_studies` +
   `type=SPLIT_TEST_V2` + `creative_test_config`, 2–5 hücre, hücre başına tek reklam [51 · Resmî-Meta];
   Meta'nın MCP'sinde varsayılan bütçe payı %20 (ömür boyu bütçeli kampanyada), süre 7 gün, kazanan = sonuç
   başı maliyet [66 · Resmî-Meta].
   Meta A/B testte **%65 güveni "kazanan"** sayıyor (lift'te %90) [29 · Resmî-Meta] → Advetics daha sıkı
   göstermeli; bütçe yetmiyorsa testi hiç önermemeli.
10. **Video ve Reels önerileri resmî ve net:** 9:16, sesli, mesaj güvenli alanda; marka ve mesaj ilk 3
    saniyede; 6–15 sn; sessiz izlemeye göre ekranda yazı/altyazı. Meta'nın otomatik altyazısı **yalnız
    İngilizce** → Türkçe altyazı Advetics'in işi; Reels'te lisanslı müzik yasak [15, 17, 18 · Resmî-Meta].
11. **Meta'nın üretken AI'ı marka için riskli ve her yerde açık değil:** ayrı sözleşme, doğruluk garantisi
    yok, "AI info" etiketi; sağlık/ilaç, finans, konut-istihdam-kredi ve siyasette ve bazı ülkelerde erişim
    olmayabilir [33, 34, 59 · Resmî-Meta]; performans önerileri API'sinde "yorgunluğu düzelt" önerisi AI ile
    varyasyon üretebiliyor [63 · Resmî-Meta]. → AI dönüşümü yalnız workspace onayıyla; görselin içine AI'a
    Türkçe yazı yazdırılmaz, yazı katmanı deterministik şablonla basılır.
12. **Türkiye mevzuatı kreatifi doğrudan kısıtlıyor.** 12.11.2025 sağlık tanıtım yönetmeliği yurt içine
    sponsorlu sağlık tanıtımını genel kural olarak yasaklıyor (istisna: açılıştan sonraki ilk ay, Bakanlık
    onaylı yeni teknoloji, Türkçe dışı dillerde sağlık turizmi); fiyat/indirim, "en iyi/tek", hasta teşekkürü
    ve AI ile düzeltilmiş önce/sonra yasak [68 · Resmî-diğer]. İndirim reklamında önceki fiyat = son 30 günün
    en düşüğü + tarih; konut fiyatında brüt ve net alan [69, 70 · Resmî-diğer]. AB'yi hedefleyen reklamda
    gerçekçi sentetik içerik beyanı 2.8.2026'dan beri ajansın yükümlülüğü [72 · Resmî-diğer].

---

## Bulgular

### 1. Advantage+ yerleşimde kreatif (Advantage+ creative kapalıyken)

#### 1.1 Yerleşim evreni geniş ve değişiyor

- Advantage+ yerleşim bugün Facebook, Messenger, Instagram, WhatsApp, Audience Network ve Threads'i
  kapsıyor. Meta'nın 30.08–07.09.2025 arasında 147 bin kampanyada yaptığı bütçe kontrollü deneyde manuel
  yerleşime göre ortalama **%11,7 daha düşük CPA** [1 · Resmî-Meta].
- Yerleşim alanları boş bırakıldığında Meta bütün varsayılan pozisyonları **ve ileride eklenecekleri**
  kullanabilir [56 · Resmî-Meta]. Kreatif, bugün bilinmeyen bir yerleşime de gidebilir; oran seti dar
  tutulmamalı.
- Son değişiklikler: Facebook "video akışları" yerleşimi v24'te kaldırıldı, harcama başka yerleşimlere
  kaydırıldı (önerilen yerine geçen: Facebook Reels) [57 · Resmî-Meta]; Reels "post-loop" reklamları Kasım
  2025'te bitti, Reels üstü bant ("overlay") sürüyor [14 · Resmî-Meta]; hariç tutulan yerleşime %5'e kadar
  harcama izni veren `placement_soft_opt_out` geldi [56, 57 · Resmî-Meta]; Mart 2026'dan beri Facebook akışı
  "Arkadaşlar" sekmesini de kapsıyor [19 · Resmî-Meta]; "Sponsorlu" etiketi yerine "Reklam" etiketi
  kademeli geliyor [10 · Resmî-Meta].

#### 1.2 Meta'nın "dört oran" modeli ve kendiliğinden tamamlama

- Ads Manager Eylül 2024'ten beri yüklenen görseli kendiliğinden 1:1, 4:5, 9:16 ve 16:9'a kırpıyor;
  özelleştirilen oran setinden üretilen boyutları **varsayılan olarak performans getirebileceği her
  yerleşimde** kullanıyor; bir medyayı bir yerleşimden çıkarmak ayrı bir yerleşim tercihi [4 · Resmî-Meta].
- 2026 metni: dört varyasyonun hepsi verilmezse sistem boşluğu **dolgu (padding), medya genişletme, kırpma
  ve ek AI özellikleriyle** dolduruyor; her ayar tek tek kapatılabiliyor; aynı orana birden çok varyasyon
  eklenebiliyor [3 · Resmî-Meta].
- Kritik cümle: *"Cropping alone won't restrict delivery."* Bir medyayı yalnız belirli yerleşimlere
  göndermek için kırpmaya ek olarak yerleşim hariç tutma gerekiyor [3 · Resmî-Meta].
- **Esnek medya** (API'de `pac_relaxation`, Ads Manager'da "Flex media") bir oran için seçilen medyayı başka
  yerleşimlerde de kullanıyor; **varsayılan açık gelebilir**; görselde önemli bilginin kesileceğini sezerse
  o yerleşime göndermiyor, videoda bunu sezemiyor; Satış, Trafik, Uygulama ve Etkileşim'de Advantage+
  creative'in içine taşınıyor [8, 58 · Resmî-Meta].
- Önerilen oranlar: Facebook akışı 4:5; Instagram akışı için iki resmî metin farklı — Ads Guide 4:5
  [40 · Resmî-Meta], yardım makalesi tek görselde 1:1 [3 · Resmî-Meta] (**çelişki**); Hikâye, Durum ve Reels
  9:16; karusel 1:1 ya da 4:5 (hepsi aynı oranda, aksi hâlde otomatik düzeltme); in-stream video 16:9;
  Audience Network 9:16 [3, 39 · Resmî-Meta].

#### 1.3 Geliştirmeler kapalıyken yerleşim başına ne oluyor

`adapt_to_placement` alan gönderilmezse açık geliyor ("Default is opt-in") [58 · Resmî-Meta]; diğer
geliştirmelerin varsayılanı yazmıyor; karar: hepsi açıkça `OPT_OUT` (D1 §2, D3). Bu durumda kalan davranış:

| Yerleşim | Meta'nın önerisi | Uymayan medyaya ne oluyor (geliştirmeler kapalı) | Kaynak |
|---|---|---|---|
| Facebook akışı | 4:5, 1440×1800; görsel en az 600×750 | API tablosu: kırpma spec'i yoksa varsayılan "esnek oran" 4:5 görseli **merkezden 1:1'e** kırpar. Tablo 2019 tarihli bir blog yazısına dayanıyor; 2026 Ads Guide 4:5 öneriyor → **çelişki, önizlemeyle ölçülmeli**. Masaüstünde video 1:1 gösteriliyor, yanlarda siyah şerit. Bilinirlik ve bazı etkileşim hedeflerinde mobilde başlık, açıklama ve düğme gizli | 39, 44, 60, 13 · Resmî-Meta |
| Instagram akışı | 4:5 (Ads Guide) / 1:1 (yardım) | Kırpma yoksa 4:5'ten uzun görsel 4:5'e, 1,91:1'den geniş görsel 1,91:1'e merkezden kırpılır. 4:5'ten uzun **video** 2024 sonundan beri kırpılmıyor; organik gibi tam boy, üstüne başlık biniyor → Reels güvenli alanı | 40, 3, 60, 18 · Resmî-Meta |
| IG / FB Hikâye | 9:16, 1440×2560; görsel 5–16 sn görünür | 1,91:1–4:5 medya tam ekrana çevrilirken üst/alt boşluk kalır; renk verilmezse Meta üretir (`portrait_customizations`). 4:5 ile 9:16 arası kırpmasız görsel 4:5'e kırpılır. Video kırpılamaz | 41, 11, 12 · Resmî-Meta; D3 |
| IG / FB Reels | 9:16, 1440×2560; ana metinde ilk 44 karakter | Destek tablosu 1,91:1'den 9:16'ya kadar bütün oranları kabul ediyor. 9:16 olmayan medyanın Reels'te API ile nasıl çizildiği belgede yok; Ads Manager'da "Hikâye ve Reels arka plan rengi" aracı var. Uzun ekranlarda yakınlaştırma (güvenli alan dışı kesilir) ya da siyah boşluk | 2, 6, 10, 42, 45 · Resmî-Meta |
| WhatsApp Durum | 9:16 | Yalnız tek görsel/video; IG Hikâye de seçili olmalı; kimliksiz kreatifte "bazı reklamlar teslim edilmeyebilir" | 2 · Resmî-Meta; D4 |
| Sağ sütun | 1:1; en az 1080×1080 (Ads Guide) ya da 1200×1200 (yardım), minimum 254×133; başlık 40 | Görsele yazı önerilmiyor; yalnız sağ sütun seçilmişse video yok | 43, 20, 56 · Resmî-Meta |
| Marketplace | 1:1, 1200×1200 | — | 2, 20 · Resmî-Meta |
| Arama sonuçları | Akış medyası | — | 2 · Resmî-Meta |
| Reels içi (in-stream) / Reels üstü bant | 16:9 (video) | Post-loop Kasım 2025'te kalktı | 3, 14 · Resmî-Meta |
| Audience Network | 9:16; en az 398×208 | Karuselde yalnız ilk 2 kart | 3, 20 · Resmî-Meta; D4 |
| Threads | 1,91:1–9:16, en az 500 px | 4:5'ten uzun görsel 4:5'e, karuselde 1:1 dışı 1:1'e kırpılır; metin 1.000'i aşarsa Threads'e hiç gitmez | D4 |
| Messenger | Gelen kutusu 1200×1200; Hikâye 9:16 | — | 20, 2 · Resmî-Meta |

#### 1.4 Hata vermeden gösterilmeme ya da başka şey gösterme

- **Metin sınırı:** Threads'te 1.000'i aşan metin reklamı Threads'e hiç götürmüyor; karışık yerleşimde 2.200'ü
  aşan metin Instagram'da gösterilmiyor (D3, D4). Advantage+ yerleşim ikisini de kapsıyor [1 · Resmî-Meta].
- **Biçim uyumsuzluğu:** karusel Facebook Hikâye ve WhatsApp Durum'da yok; Instant Experience Facebook
  Hikâye'de yok; yalnız sağ sütunda video yok (D3, D4) [56 · Resmî-Meta].
- **Esnek medyanın kırpma sezgisi:** önemli bilgi kesilecekse o yerleşime göndermiyor; bu bir "gösterilmeme"
  ve ekranda iz bırakmıyor [8 · Resmî-Meta].
- **Boş metin:** başlık ya da açıklama boş bırakılırsa metin hedef siteden çekilebiliyor; önizlemede
  görünüyor ama kullanıcı yazmadığı bir cümleyi yayınlamış oluyor [5, 6 · Resmî-Meta].
- **Kırpma ≠ kısıt:** kırpılan oran, Meta'nın o medyayı başka yerleşimde kullanmasını engellemiyor
  [3 · Resmî-Meta].
- **Uzun ekran:** 9:16'dan uzun ekranlarda yakınlaştırma güvenli alan dışını kesebiliyor [2, 10 · Resmî-Meta].

#### 1.5 Hangi oran hangi yerleşime: API'deki dört yol

| Yol | Ne yapıyor | Güçlü yanı | Sorunu | Kaynak |
|---|---|---|---|---|
| `image_crops` (tek görsel) | Aynı görselin oran başına kırpım koordinatı. Sözlük: `100x100` (1:1), `400x500` (4:5), `90x160` (9:16), `300x400` (3:4), `191x100` (1,91:1), `600x360`, `400x150`, `100x72` | Tek medya, tek `image_hash`; koordinatı Advetics hesaplar | Kırpım kaynağın içinde olmalı (4:5 kaynaktan 9:16 çıkmaz); Instagram `191x100`'ü yok sayıyor; her anahtarın hangi yerleşimde kullanıldığı yazılı değil; kırpma teslimatı kısıtlamaz; video kırpılamaz | 64, 60, 3 · Resmî-Meta; D3 |
| `platform_customizations.instagram` | Instagram'a ayrı medya | Basit | Yerleşim değil platform ayrımı; metin değişmiyor | D3 |
| Yerleşim varlık özelleştirmesi (`asset_feed_spec`, `optimization_type: PLACEMENT`, `asset_customization_rules`) | Kural = platform + pozisyon → etiketli medya | Ads Manager'ın klasik özelliği; Meta resmî olarak "Advantage+ yerleşim + varlık özelleştirmesi"ni öneriyor | Belgedeki pozisyon listesinde `reels`, `facebook_reels`, `profile_reels` ve WhatsApp `status` **yok**; Threads örneğinde boş `customization_spec: {}` kuralı "geri kalan her yer" gibi kullanılıyor ama tanımlı değil; "her spec en az iki kural" ↔ tek kurallı Explore örneği (**çelişki**); desteklenen amaç tablosu ODAX öncesi adlarla; mevcut gönderiyle API'de yok; esnek format, dinamik kreatif ve katalogla birlikte kullanılamıyor; "API ile oluşturulan reklamların bazı sınırları var" | 53, 54, 7, 22 · Resmî-Meta |
| Çoklu medya (`media_sourcing_spec`, satır içi `POST /ads`) | 10'a kadar medya; medya başına metin, hedef, kırpma (`manual`, `auto_crop`, `smart_crop`, `super_crop`) ve `placement_customizations.placement_exclusions` | "Bu medya şu yerleşime gitmesin" açıkça yazılıyor; Ads Manager'ın yeni akışı buna geçiyor | `opt_in_status: "opt_in"` "ilgili medya özelliklerini" açıyor, neyi açtığı yazmıyor; `auto/smart/super_crop` tanımsız (genişletme içeriyor olabilir) | 55, 5, 6 · Resmî-Meta |

Meta'nın kendi reklam hacmi rehberi ayrı ad set'ler yerine **"Advantage+ yerleşim + varlık özelleştirmesi"**
kullanmayı öneriyor [22 · Resmî-Meta] — bağlayıcı karar (Advantage+ yerleşim açık) ile yerleşime göre medya
birlikte kullanılabilir.

#### 1.6 Güvenli alan ve görünen metin

- **Ads Guide (okunma 2026-10-06):** Instagram Reels ve Instagram Hikâye için görselde de videoda da üst ~%14,
  alt ~%35, yanlar ~%6 boş [41, 42, 45, 46 · Resmî-Meta]; Reels geliştirici sayfası alt %35'i yazıyor
  [61 · Resmî-Meta].
- **Yardım makalesi:** 9:16 reklamlarda (Hikâye, Reels, akış, Facebook Reels içi) kenarlar boş kalmalı;
  Instagram akışında 1:1 ve 4:5'te alt ve yan kenarlar boş; 9:16 video Instagram akışında Reels güvenli
  alanını kullanıyor; **yasal uyarı taşıyan Reels'te alt %40** boş; Ads Manager'da sarı güvenli alan
  kılavuzu var [10 · Resmî-Meta].
- **Sektör:** Meta'nın Mart 2026'da Hikâye ve Reels güvenli alanını tek kurala birleştirdiği yazılıyor
  [88 · Sektör]; Ads Guide'ın bugün ikisine aynı sayıyı vermesi bununla uyumlu, ama birleşme tarihi resmî
  metinde görülmedi.
- **Görünen metin önerileri (kesme noktası, sınır değil):** Facebook akışı ana metin 50–150, başlık 27;
  Instagram akışı ana metin 125, başlık 40, en çok 30 hashtag; Instagram Hikâye ana metin 125; **Instagram
  Reels ana metin 44**; sağ sütun başlık 40; açıklama 30 [39–45, 96 · Resmî-Meta]. Sert sınırlar Instagram
  2.200 ve Threads 1.000 (D3, D4).

**Advetics hesabı — 9:16 kaynaktan kırpım** (1080×1920; güvenli bant y 269–1248, x 65–1015):

| Kırpım | Bant ortasına yerleştirilince | Güvenli içerik kırpımın içinde mi |
|---|---|---|
| 1:1 (1080×1080) | y 219–1299 | Evet |
| 4:5 (1080×1350) | y 84–1434 | Evet |
| 1,91:1 (1080×565) | — | Hayır (bant 979 px yüksek) |

Sonuç: güvenli alana göre tasarlanmış 9:16 kaynak akış oranlarına kayıpsız kırpılır; 1,91:1 türetilmemeli.
Ters yön: 4:5 görsel (1440×1800) 9:16 tuvale (1440×2560) **tam genişlikte** konursa görselin ~%27–29'u
Reels arayüzünün altında kalır (güvenli bant 1.306 px); her şeyin güvenli alanda kalması için görsel
genişliğin ~%72'sine küçültülüp ortalanmalı. (Hesap Advetics'in; yüzdeler [41, 42 · Resmî-Meta].)

#### 1.7 Meta'nın 2025–2026 kreatif önerileri

- **Instagram video (resmî, 2025):** video Instagram reklam gösterimlerinin yaklaşık yarısı; akışta 15 sn
  altı, Hikâye'de 10 sn altı daha iyi; **marka ve ana mesaj ilk 3 saniyede**; 6–15 sn; ilk karede hareket;
  sessiz izlemeye göre tasarım (altyazı, ekranda yazı) ama ses açıkken akış video reklamlarında düğme
  tıklama oranı 2,25×; organik gibi görünen, "reklam kokmayan" kreatif; ad set başına 10'a kadar kreatifle
  başlayıp en iyi 5'ini tutmak, testleri en az 4 gün koşmak; video ile durağanı karıştırmak yorgunluğu
  azaltıyor [18 · Resmî-Meta].
- **Reels (resmî):** 9:16, sesli, mesaj güvenli alanda; Meta'nın 15 çalışmalık iç analizinde durağan görsele
  göre %34,5 düşük sonuç başı maliyet (veri 05.2022–04.2023, **eski olabilir**) [50 · Resmî-Meta]; video
  15 dk'ya kadar; müzik ya da ses önerilir; **lisanslı müzik yasak** (orijinal ses ya da Sound Collection);
  yüz/kamera efekti, GIF ve ürün etiketi olmamalı [15, 45 · Resmî-Meta]. Ads Manager'ın müzik eklemesi
  Meta Sound Collection'dan, yalnız Instagram Reels/Hikâye/akış tek görselde [16 · Resmî-Meta].
- **Aralık 2025 ipuçları (Meta'nın blogundan aktarım):** kanca ilk saniyelerde; üç kanca tipi (fayda vaadi,
  ne göreceğini söyleme, soru/davet); müzik ya da seslendirmeli kampanyalarda %13'e kadar artımlı dönüşüm;
  Meta'nın görsel üretimiyle +%11 CTR / +%7,6 CVR, metin üretimiyle +%3 CTR (Meta'nın kendi rakamları);
  farklı müşteri tipleri için geniş varlık portföyü [82 · Sektör, Meta'yı aktarıyor].
- **Ses çelişkisi:** "sessiz izlemeye göre tasarla" [18] ↔ "Reels'te ses açık varsayılan, sesli kurgu"
  [50, 61]. Çözüm ikisi birden: sesli kurgu + ekranda yazı/altyazı.
- **UGC:** resmî metinlerde "UGC" geçmiyor; Meta "platforma özgü, aşırı reklam gibi olmayan" kreatif diyor
  [18 · Resmî-Meta]; UGC tarzını sektör öne çıkarıyor [85 · Sektör]. Türkiye'de içerik üreticisi
  işbirliğinin "reklam olduğu ilk bakışta anlaşılacak" biçimde belirtilmesi isteniyor (2021, eski olabilir)
  [71 · Resmî-diğer].
- **Altyazı:** Meta'nın otomatik altyazısı **yalnız İngilizce**; Türkçe için `dosyaadi.tr_TR.srt` yükleniyor;
  altyazı reklama değil **videoya** bağlı, aynı videoyu kullanan bütün reklamlarda ortak değişiyor
  [17 · Resmî-Meta].
- Meta'nın öneri API'si "tam ekran 9:16 video" ve "Reels yerleşimi ekle" önerileri taşıyor
  [63 · Resmî-Meta]: Meta'nın yönü dikey video.

### 2. Kreatif çeşitliliği (Andromeda sonrası)

#### 2.1 Resmî olan

- **Andromeda** (Meta Engineering, 02.12.2024): reklam seçiminin ilk aşaması (on milyonlarca adaydan birkaç
  bine); Advantage+ ve üretken AI'ın ürettiği çok daha büyük kreatif hacmini işlemek için kuruldu; +%6 recall,
  belirli kesimlerde +%8 reklam kalitesi; ileride "daha çeşitli aday" hedefi [47 · Resmî-Meta].
- **27.03.2025:** GEM (Reels'te %5'e kadar dönüşüm artışı), Lattice, Andromeda (+%8 kalite); reklamverenler
  çeşitlendirme stratejisiyle daha çok kreatif yükledikçe sistemin her kişiye doğru kreatifi seçmesi
  [48 · Resmî-Meta].
- **Performance 5:** "kreatif çeşitleri geliştir, AI doğru mesajı ilgilenecek kişiye götürsün"; sayı ya da
  biçim reçetesi yok [49 · Resmî-Meta].
- **Aralık 2025:** sabit bir sayıyı inceltmek yerine farklı müşteri tipleri (persona) için geniş varlık
  portföyü [82 · Sektör, Meta'yı aktarıyor].

#### 2.2 Meta'ya bağlanamayan sayılar

Sektör yazılarında "Meta'nın iç rehberi ad set başına en az 8–15" (86, arama özetinden), "kampanya başına
10+ ve her kreatifin ~%70'i görsel olarak farklı" (83 — yazı kaynak göstermiyor), "ad set başına 20–30",
"benzer reklamlar tek Entity ID altında toplanır, 50 varyasyon tek bilet alır" (87) gibi iddialar dolaşıyor;
Andromeda'nın "küresel yayılma" tarihi yazıdan yazıya Temmuz ya da Ekim 2025 [83, 86, 87 · Sektör]. **Hiçbiri
Meta belgesinde görülmedi**; tasarımda sayı olarak kullanılmamalı.

#### 2.3 Resmî sayılar ve sınırlar

- Ad set başına 50 reklam (D1 §1).
- **Sayfa başına çalışan ya da incelemedeki reklam sınırı:** en yüksek aylık harcaması 100 bin $ altı → 250;
  1 milyon $ altı → 1.000; 10 milyon $ altı → 5.000; üstü → 20.000. Sınır **sayfanın bütün reklam
  hesaplarının toplamı** (ajans, müşterinin kendi Ads Manager'ı, MCP); aşılınca yeni reklam ve var olan
  reklamdaki düzenleme yayınlanamıyor (hata 3253001); dinamik kreatif, Advantage+ yerleşim ve katalog reklamı
  çok kreatif taşısa da **tek reklam** sayılıyor; sayfa yöneticisi ortaklara alt sınır koyabiliyor
  [21 · Resmî-Meta]. API'de `act_X/ads_volume?page_id=` ve `show_breakdown_by_actor` ile sayılabiliyor; gün
  içi zamanlamalı reklam bütün gün sayılıyor [65 · Resmî-Meta].
- **Reklam hacmi:** aynı anda çok reklam → her reklam daha az gösterilir, daha az reklam öğrenmeden çıkar;
  öneri: ad set'leri birleştir, Advantage+ yerleşim + varlık özelleştirmesi kullan, **ad set başına reklamı
  azalt ama çeşitli varlığı koru — bir reklam 10'a kadar varlık taşır**, çoklu metin [22 · Resmî-Meta].
- **Öğrenme:** son önemli düzenlemeden sonraki haftada ~50 sonuç; "yüksek reklam hacminden kaçın"
  [23 · Resmî-Meta].
- **Instagram video rehberi:** 10'a kadar kreatifle başla, en iyi 5'ini tut [18 · Resmî-Meta].

Resmî iki mesaj birbirini dengeliyor: çeşitlendir, ama reklam sayısını şişirme. Uzlaştıran yol: **az reklam,
reklam başına çok oran/varlık, kavramlar arasında gerçek fark.**

#### 2.4 "Farklı kavram" ne demek

- **Resmî dayanak:** yorgunlukta "malzemece farklı" yeni görsel/video [25 · Resmî-Meta]; **açık artırma
  çakışması** — aynı reklamverenin aynı kitleyi ya da **aynı varlıkları** paylaşan reklamlarından yalnız
  toplam değeri en yüksek olan açık artırmaya giriyor, diğerleri o açık artırmada hiç değerlendirilmiyor;
  ayrı hesaplardan yayınlamak bunu çözmüyor [26 · Resmî-Meta]; yorgunluk hesabı görselin/videonun
  **sayfadaki diğer kampanyalardaki** son gösterimlerini de sayıyor [25 · Resmî-Meta].
- **Sektör uzlaşısı:** kavram = kime (kişi tipi) + hangi vaat ya da sorun + hangi kanıt + hangi biçim
  (konuşan kişi, ürün gösterimi, öncesi-sonrası, müşteri yorumu, durağan teklif). Arka plan rengi, başlığın
  yeri, düğme, 2 saniyelik kırpma ve aynı görselin oran kırpımları yeni kavram sayılmıyor [83, 87 · Sektör].

#### 2.5 Yorgunluk ve yenileme

- **Ads Manager:** yalnız tek kreatifli ad set'lerde (katalog, dinamik kreatif, Advantage+ uygulama hariç);
  Satış amacında ad set yayına girmeden yok; yayından önce ilk 7 günde yorgunluk öngörülürse uyarı; yayında
  sonuç başı maliyet geçmiş reklamlara göre yüksek ama 2 katından az → **"creative limited"**, 2 katı ve
  üstü → **"creative fatigue"**; öneriler: malzemece farklı yeni reklam (eskisini açık tutmak sonucu
  artırabilir), kitleyi büyütmek, Advantage+ creative [25 · Resmî-Meta].
- **Webhook (2026):** `creative_fatigue` alanı (`ad_account` nesnesi; uygulama token'ıyla abonelik + her hesap
  için `subscribed_apps`); yük `adgroup_id`, `creative_fatigue_level` (LOW/MEDIUM/HIGH) ve Meta'nın İngilizce
  mesajı; teşhis için 7 günlük günlük frekans, CTR ve sonuç başı maliyet okuması öneriliyor. Belgedeki örnek
  "çözüm" kreatifi değiştirip `status=ACTIVE` yapıyor — Advetics'in onaylı yayın kuralıyla çelişir,
  kopyalanmamalı [52 · Resmî-Meta].
- **Performans önerileri API'si:** `CREATIVE_FATIGUE` ve `CREATIVE_LIMITED`; bir bölümde "uygulanınca üretken
  AI ile yeni varyasyonlar", başka bölümde "verilen yeni kreatifle reklamın kopyası" yazıyor (**belgede
  çelişkili**); ayrıca `UNCROP_IMAGE`, `GEN_AI_MVP`, `MULTI_TEXT` önerileri var [63 · Resmî-Meta].
- **Önemli düzenleme:** hedefleme, kreatif ya da optimizasyon olayı değişikliği, **ad set'e yeni reklam
  eklemek**, 7+ gün durdurma ve teklif stratejisi değişikliği öğrenmeyi sıfırlıyor [24 · Resmî-Meta];
  yayındaki reklamı düzenlemek yeniden incelemeye sokuyor [38 · Resmî-Meta].
- **Sektör kadansı:** sinyale bağlı 7–14 günde bir, her döngüde aktiflerin %20–30'u yeni [84 · Sektör];
  "yorgunluk penceresi 6+ haftadan 2–3 haftaya indi" [85 · Sektör]. Meta'ya bağlanamadı.

### 3. Kreatif testi

#### 3.1 Yerleşik kreatif testi ve API karşılığı

- **Ads Manager (2025):** bir kampanya ya da ad set içinde 2–5 test reklamı; test bütçesi kampanya
  bütçesinden ayrılıyor (en çok %20 öneriliyor); her kişi tek reklam görüyor; Meta erken performansa göre
  dağıtmıyor; sonuçlar Deneyler bölümünde; **yalnız "en yüksek hacim" teklif stratejisiyle**
  [80, 81 · Sektör]. Resmî yardım makalesi MCP aramasında çıkmadı.
- **API:** `POST /{business_id}/ad_studies`, `type=SPLIT_TEST_V2`, `creative_test_config` (`daily_budget` ya
  da `lifetime_budget_percentage`); 2–5 hücre, hücre başına **tam bir reklam**, yüzdelerin toplamı 100;
  `cooldown_start_time = start_time`, `observation_end_time = end_time`; örnek istek Mart 2026 tarihli
  [51 · Resmî-Meta]. `SPLIT_TEST_V2` ad study referansının `type` listesinde yok (D2, **çelişki**).
- **Meta'nın Ads MCP aracı (oturumda okunan şema):** kampanya (L3), ad set (L2) ve **kreatif (L1)** seviyesinde
  test; hücrede tek varlık, aynı hesap; tarih `YYYY-MM-DD`, başlangıç en erken yarın; varsayılan süre 7 gün;
  ömür boyu bütçeli kampanyada kreatif testi bütçe payı varsayılan %20; birincil KPI varsayılan
  `cost_per_result` (kazananı o belirliyor), ikincil KPI'lar kazananı etkilemiyor; ayrıca uygunluk kontrolü
  aracı var [66, 67 · Resmî-Meta].

#### 3.2 A/B test kuralları (resmî)

- A/B test herkese açık, **en çok 5 sürüm**, kitle rastgele ve çakışmasız bölünüyor; kazanan = seçilen
  metrikte en düşük sonuç başı maliyet. Lift testleri son 90 günde **≥120.000 $** harcama ve yüksek kaliteli
  dönüşüm kaynağı istiyor [27 · Resmî-Meta].
- En az 7 gün öneriliyor, en çok 30; Ads Manager 1–30 gün kabul ediyor; test kitlesi aynı anda başka
  kampanyada kullanılmamalı; tek değişken; ölçülebilir hipotez [28, 51 · Resmî-Meta].
- Kazanan, gözlenen sonuçların on binlerce kez simülasyonuyla "test tekrarlanırsa kazanma olasılığı" olarak
  hesaplanıyor; **A/B'de %65+ güven "kazanan", lift'te %90+**; test öncesi güç %80+ öneriliyor; kısa süre ve
  az sonuçta kazanan daha pahalı çıkabiliyor [29, 30 · Resmî-Meta].
- Advantage+ creative varyasyonlarının biçim ya da varyasyon kırılımı yok; Meta genel etkiyi split testle
  ölçmeyi öneriyor [16 · Resmî-Meta].
- Değerlendirme: %65, birbirinin aynısı iki kreatiften birinin sık sık "kazanan" ilan edilmesine izin veren
  düşük bir eşik. Acemi kullanıcı Meta'nın "kazanan" etiketini kesin sonuç sanır.

#### 3.3 Dinamik kreatif, esnek format, çoklu medya

- **Dinamik kreatif:** Ads Manager'da Haziran 2024'ten beri Satış ve Uygulama amaçlarında yeni ad set'te
  kullanılamıyor, yerine esnek format öneriliyor [22 · Resmî-Meta]; API'de duruyor ama ad set başına tek
  reklam, reklam silinemiyor, kombinasyon kırılımı API'de yok (D4).
- **Esnek format:** Ads Manager'da Trafik (site), Etkileşim (site ya da mesaj), Satış (site, uygulama, mesaj)
  ve Uygulama'da seçilebiliyor [9 · Resmî-Meta] ↔ API'de **yalnız `OUTCOME_SALES` ve
  `OUTCOME_APP_PROMOTION`** [62 · Resmî-Meta] → **çelişki**. Aynı yardım metni "erişimin kalmadıysa çoklu
  medyaya bak" diyor [9]; yerini çoklu medya alıyor.
- **Çoklu medya:** 10 medya + kökte en çok 5 başlık / 5 gövde (Meta kombinasyon dener) + medya başına
  özelleştirme [55 · Resmî-Meta].
- Bunlar **test değil optimizasyon**: Meta harcamayı kendi tahminine göre dağıtıyor; adil karşılaştırma
  vermiyor; varlık kırılımı sınırlı [31 · Resmî-Meta; D4].

#### 3.4 Sektör yöntemleri (birbiriyle çelişiyor)

- Ana ad set içinde sürekli test: 4–6 kanıtlanmış + 3–5 orta + 2–3 yeni kreatif; 7 gün dolmadan kapatma yok;
  karar sonuç başı maliyet ve ROAS ile [84 · Sektör].
- Ayrı test kampanyası (ad set bütçeli): 8–12 kavram, ad set başına tek kreatif, kreatif başına 100–150 $,
  7–14 gün, 1.000–3.000 gösterim [85 · Sektör] — Türkiye'deki KOBİ bütçelerine uymuyor.
- Meta'nın yerleşik aracı (§3.1).

#### 3.5 Acemi için en basit doğru yöntem (bulgulardan çıkan)

- Gerçek karşılaştırma yalnızca çakışmasız testte mümkün (A/B ya da kreatif testi) [27–30 · Resmî-Meta]. Aynı
  ad set'te yan yana koymak "Meta'nın tercihini" gösterir, hangisinin daha iyi olduğunu değil.
- Testin anlamı sonuç sayısına bağlı (öğrenme ~50/hafta; kısa ve az sonuçlu testte "pahalı kazanan")
  [23, 30 · Resmî-Meta]. Küçük bütçede doğru davranış çoğu zaman **test etmemek**: çeşitli başlamak ve Meta'nın
  dağıtımını açıkça "test değil" diye raporlamak.

### 4. Üretim araçları

#### 4.1 Meta'nın kendi üretken araçları

- **API'de:** `text_generation`, `image_uncrop`, `image_background_gen` (katalog), `image_animation`,
  `video_uncrop`, `text_translation`, `translate_voiceover` (yalnız İngilizce→İspanyolca) vb. (D3)
  [58 · Resmî-Meta]. Reklamveren AI kreatifini yayından önce önizlemekle yükümlü; Meta üretilen metin, arka
  plan ve genişletmenin doğruluğu için garanti vermiyor; "Ad Creative Generative AI Terms" ek sözleşmesi
  devreye giriyor; metin üretiminde reklam `PAUSED` geliyor, beğenilmezse özelliksiz yeni reklam gerekiyor
  [59 · Resmî-Meta].
- **Ads Manager'da:** görsel varyasyonu üretimi (en az 320×320, öneri ≥1000×1000; Advantage+ satış, uygulama ve
  katalog kampanyalarında yok); görsel animasyonu (2 sn, 8 sn'ye döngü, 16 kare/sn; **yalnız Instagram
  Reels'e** gidiyor; yerleşim özelleştirmeli reklamda yok; yoğun yazı, insan, 4+ odak ve logo önerilmiyor);
  "AI info" etiketi üç nokta menüsünde ya da "Reklam" etiketinin yanında [33, 34 · Resmî-Meta]. Ek
  sözleşme 06.05.2024'te yürürlüğe girdi [33 · Resmî-Meta].
- **Erişim kısıtı:** finans, ilaç/sağlık, konut-istihdam-kredi, siyaset dikeylerinde ve bazı ülkelerde bütün AI
  özelliklerine hemen erişim olmayabilir [33, 34 · Resmî-Meta]; siyaset reklamlarında Meta'nın AI araçları
  kapalı [32 · Resmî-Meta]. Advetics'in iki tipik sektörü (özel klinik, inşaat/konut) bu listede.
- **Cannes 2025:** marka kitiyle (logo, yazı tipi, renk) AI metin ve görsel, görsel setinden çok sahneli video
  ("Video Generation 2.0"), sanal deneme [92 · Sektör, arama özetinden].
- **Varsayılan açık gelen geliştirmeler:** Ads Manager'da bazı amaçlarda geliştirmelerin önceden seçili geldiği,
  kopyalamada yeniden açıldığı şikâyetleri var [89, 90 · Topluluk]; resmî karşılığı esnek medyanın "varsayılan
  açık olabilir" notu [8 · Resmî-Meta]. Advetics için anlamı: müşteri Advetics'in kurduğu reklamı Ads
  Manager'da kopyalar ya da düzenlerse kapalı özellikler açılabilir — "iki yazma kaynağı" sorunu (D1 §4).

#### 4.2 Dış araçlar

- **Şablon — Canva Connect:** şablondan otomatik doldurma Pro, Teams ya da Enterprise + çok adımlı doğrulama
  istiyor; kullanıcı başına dakikada 60 iş; kullanım tavanı "ileride" gelecek; şablon alanlarına yalnız metin
  ve görsel (video yok); kullanıcının kendi Canva hesabıyla OAuth [73, 74 · Resmî-diğer]. Lisans: reklamda
  kullanım serbest; içerik logo/marka olarak kullanılamaz; tanınabilir kişi, mekân ya da logo içeren
  içerikte ticari izin garanti edilmiyor [75 · Resmî-diğer, arama özetinden]. Beyaz etiket açısından müşteri
  Canva'yı görür.
- **Görsel üretim modelleri:** Adobe Firefly lisanslı ve kamu malı veriyle eğitildiğini ve seçili kurumsal
  akışlarda telif tazminatı sunduğunu söylüyor (kapsam plana göre değişiyor) [77 · Resmî-diğer, arama
  özetinden]; Google'ın görsel modelleri görünmez SynthID ve C2PA taşıyor [76 · Resmî-diğer, arama özetinden];
  OpenAI görsel çıktıları C2PA bildirimi taşıyor [95 · Sektör]. Meta siyaset reklamlarında üçüncü taraf AI'ı
  "sektör standardı" işaretlerle otomatik algılıyor [32 · Resmî-Meta] → harici üretimin Meta'da "AI" diye
  işaretlenme ihtimali var.
- **Görsele yazı:** ticari modeller İngilizce dışı dillerde görsele yazı yazdırmada zayıf (2025 akademik
  tarama) [94 · Sektör]; Türkçe karakterler için ölçülmüş bir oran bulunamadı.
- **Video:** Reels şablon araçlarında müzik ve şablon lisansı araç başına ayrı kontrol edilmeli; Meta Reels'te
  lisanslı müziği kabul etmiyor [15 · Resmî-Meta]. Sunucuda programatik video render'ı paylaşımlı VPS'te ağır
  (D5 §1: sistem geneli kurulum ve yük yasak).

#### 4.3 Telif, lisans, marka güvenliği

- **FSEK:** eser sahibi gerçek kişi; tamamen AI üretimi çıktı "sahibinin hususiyetini taşıma" şartını
  karşılamayabilir; insan katkısı olan kısım korunur; yasada AI'a özel hüküm yok [93 · Sektör, arama
  özetinden]. Pratik sonuç: ajansın AI ile ürettiği görsel üzerinde müşteriye münhasır hak vaadi zayıf.
- **AB AI Act m.50:** 2.8.2026'dan beri gerçekçi kişi ya da olay gösteren sentetik/değiştirilmiş görüntü, video
  ya da ses yayan **uygulayıcı** (ajans dahil) bunu beyan ediyor; açıkça sanatsal/kurgusal işlerde hafif beyan
  [72 · Resmî-diğer]. Türkiye AB'de değil ama AB'yi hedefleyen reklam (ör. sağlık turizmi) kapsama girebilir.
- **Meta'da AI beyanı:** zorunluluk yalnız sosyal konu, seçim ve siyaset reklamlarında [32 · Resmî-Meta];
  "Mart 2026'dan beri bütün reklamlarda zorunlu" iddiası doğrulanamadı [90 · Topluluk]. `self_ai_disclosure`
  sonradan değişmediği için yine kullanıcıya sorulmalı (D1 §2).
- **Meta politikaları:** izleyicinin kişisel özelliğini (ırk, din, yaş, cinsel yönelim, engellilik, sağlık,
  finansal zorluk, sabıka, ad…) ima eden ya da soran metin yasak — "Kanser teşhisi mi kondu?" türü sorular
  dahil [35 · Resmî-Meta]; sağlık ve zindelikte görünüşü aşağılayan ifade, tedavisi olmayan hastalıklara
  (diyabet, kanser, Alzheimer…) iyileşme iddiası, süre vaadi ve tıklama tuzağı yasak; estetik işlem ve
  öncesi-sonrası yalnız 18+ hedeflemede serbest [36 · Resmî-Meta]; tekrar eden ihlal ya da düşük kalite
  sayfa, alan adı ve hesap genelinde "düşük kalite" sayılabiliyor [37 · Resmî-Meta]; onaylanmış reklam
  şikâyet üzerine yeniden incelenip durdurulabiliyor [38 · Resmî-Meta]; %20 görsel yazı kuralı 2020'de kalktı,
  az yazı hâlâ öneriliyor [91 · Sektör, eski olabilir].

#### 4.4 Türkiye mevzuatı (kreatife dokunan)

- **Sağlık tanıtımı** (Resmî Gazete 12.11.2025, sayı 33075, yayımında yürürlükte) [68 · Resmî-diğer;
  78, 79 · Sektör]: m.5(1) açık ya da örtülü reklam yasak; m.5(1-j) sponsorlu tanıtım yalnız yeni açılan
  kuruluşta ilk ay ve Bakanlık onaylı yeni tıbbi teknolojide; sağlık turizminde Türkçe dışı dillerde ayrı
  platformdan; m.5(1-h) "en iyi", "tek" gibi üstünlük yok; m.5(1-m) ücret, indirim, kampanya ve promosyon
  bilgisi yok; m.7 öncesi-sonrası aynı koşulda, tarihli, **AI ya da teknolojik düzeltmesiz**; hasta görseli
  yazılı onamla; hasta memnuniyeti paylaşımında yorum, beğeni ve paylaşım kapalı.
- **Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği** (RG 10.01.2015, asıl metin; sonraki değişiklikler
  bu metinde yok, eski olabilir) [70 · Resmî-diğer]: m.27/5 konut ya da tatil taşınmazı reklamında fiyat varsa
  **brüt ve net alan**; m.8 karşılaştırma nesnel ve aynı nitelikteki mallar arasında; m.9 iddialar
  ispatlanmalı; m.19 ve m.21 yazı boyutu ve zemin karşıtlığı okunabilir olmalı.
- **İndirim** (m.14, sonradan değişmiş hâli; Bakanlık broşürü 2022, eski olabilir) [69 · Resmî-diğer]:
  indirim ibareli reklamda önceki fiyat, başlangıç ve bitiş tarihi ve sınırlı miktar açıkça yazılır; **önceki
  fiyat = indirimden önceki 30 günün en düşük fiyatı**; ispat reklamverende; "…'e varan" okunur boyutta;
  gerçeğe aykırı aciliyet yasak.
- **Etkileyici içerik:** reklam olduğu ilk bakışta anlaşılacak, zeminden ayrışan ve okunur biçimde (2021,
  eski olabilir) [71 · Resmî-diğer].

### 5. Giriş anında doğrulama — D3'teki tabloya eklenecekler

D3'teki "Giriş anında doğrulama tablosu" duruyor; aşağıdakiler eksik olanlar. "Ret" = ilerletme; "Uyarı" =
söyle ama izin ver; "Dönüştür" = sistem düzeltir ve **ne yaptığını söyler** (sessiz dönüşüm yok).

| # | Kontrol | Kural / sınır | Davranış | Kaynak |
|---|---|---|---|---|
| 1 | Görsel dosya türü | JPG ya da PNG. Tür uzantıdan değil sihirli bayttan | HEIC, WebP, AVIF tarayıcıda JPG'ye çevrilir ve söylenir | 39–43 · Resmî-Meta; D5 |
| 2 | Görsel dosya boyutu | ≤30 MB | Sıkıştır, olmazsa ret | 39–42, 11 · Resmî-Meta |
| 3 | EXIF yönü, renk profili, saydamlık | Belgede yok | Yön piksele işlenir, sRGB'ye çevrilir, saydam alan marka rengine düzleştirilir (Advetics önlemi; Meta'nın davranışı belgede yok) | — |
| 4 | Görsel çözünürlüğü | API en az 600 px (FB akış 600×750); Ads Guide Instagram 500 px; önerilen 1440×1800 (4:5), 1440×2560 (9:16), sağ sütun 1200×1200 | 600 altı ret; kısa kenar 1080 altı uyarı | 39–43, 20 · Resmî-Meta; D3 |
| 5 | Oran seti tamlığı | 4:5 ve 9:16 hazır mı, 1:1 türetildi mi | Kullanıcı üç görünümü görmeden ilerleyemez | 3, 4 · Resmî-Meta |
| 6 | Oran toleransı | Instagram ±%1, Facebook akış 4:5 ±%3 | Kırpma motoru tam oran üretir | 39–42 · Resmî-Meta |
| 7 | Güvenli alan | 9:16'da üst %14, alt %35, yan %6; yasal uyarılı Reels'te alt %40; IG akışında 1:1/4:5'te alt ve yan kenar | Şablonla basılan yazıda koordinat bilindiği için ret; yüklenen hazır tasarımda uyarı (yazı tespiti OCR ister) | 10, 41–46 · Resmî-Meta |
| 8 | Görselde yazı yoğunluğu | Kural yok, az yazı öneriliyor; sağ sütunda görsele yazı önerilmiyor | Şablon yazısı görselin belirgin kısmını kaplarsa uyarı (eşik Advetics'in) | 43 · Resmî-Meta; 91 · Sektör |
| 9 | Video kapsayıcı ve kodek | MP4/MOV (FB akış ve IG Hikâye'de GIF de); H.264, AAC ≥128 kbps stereo, sabit kare hızı, progresif, edit list yok. Bir sayfa H.265/VP9/AV1'i de sayıyor (**çelişki**) | Tarayıcıda okunur; uymayana uyarı | 44–46 · Resmî-Meta; D3 |
| 10 | Video dosya boyutu | Meta ≤4 GB | Advetics'in sınırı ayrı ve daha dar (paylaşımlı VPS; öneri Acemi ≤500 MB, akışlı yükleme, belleğe alma yok) | 44 · Resmî-Meta; D5 |
| 11 | Video süresi | FB akış 1 sn–241 dk; IG Reels ≤15 dk; IG Hikâye ≤60 dk (16 sn üstü kartlara bölünür); IG akış 3–60 sn (IG API sayfası) ↔ IG rehberi 60 dk'ya kadar (**çelişki**); bir yardım metni FB Hikâye için 1–15 sn diyor | Acemi: 3–60 sn sert, 6–15 sn önerisi | 44–46, 18, 5 · Resmî-Meta; D3 |
| 12 | Video oranı | Video API'de kırpılamaz | 9:16 zorunlu (Hikâye, Reels, Durum); akış için 4:5 önerilir; yalnız 9:16 verilirse akış önizlemesi gösterilir | 60, 18 · Resmî-Meta |
| 13 | Video en küçük genişlik | IG Reels 500 (30 sn ve üstü) ya da 250; IG Hikâye 250; FB akış 120; video yükleme sayfası 1.200 (**çelişki**) | Öneri ≥1080, altı uyarı | 44–46 · Resmî-Meta; D3 |
| 14 | Video ses ve müzik | Reels'te ses öneriliyor; lisanslı müzik yasak; yüz/kamera efekti, GIF, ürün etiketi yok | Lisans otomatik tespit edilemez: kullanıcıya "lisanslı müzik var mı?" beyanı + Sound Collection önerisi | 15, 45 · Resmî-Meta |
| 15 | Altyazı | Meta'nın otomatik altyazısı yalnız İngilizce | Türkçe konuşma varsa Türkçe altyazı önerilir (SRT `tr_TR` ya da gömülü); altyazının videoya bağlı olduğu söylenir | 17, 18 · Resmî-Meta |
| 16 | Ana metin | IG 2.200 sert; Threads 1.000 (aşarsa Threads'e gitmez); görünür kısım IG 125, Reels 44, FB 50–150 | Advantage+ yerleşim Threads'i kapsadığı için Acemi'de 1.000 sert; görünür sınırlarda "burada kesilir" çizgisi | 1, 40–42 · Resmî-Meta; D3, D4 |
| 17 | Başlık ve açıklama | FB akış başlık 27, IG ve sağ sütun 40, açıklama 30; açıklama IG'de görünmez; boş bırakılırsa siteden metin çekilebilir | Başlık boş geçilemez; açıklama marka cümlesiyle doldurulur | 39, 40, 43, 96, 5 · Resmî-Meta |
| 18 | Kişisel özellik | "sen/siz" + hastalık, din, yaş, cinsel yönelim, engellilik, finansal zorluk, sabıka; bunları soran soru | AI metninde engel, kullanıcı metninde uyarı | 35 · Resmî-Meta |
| 19 | Sağlık ve zindelik (Meta) | Estetik işlem ve öncesi-sonrası yalnız 18+; tedavisi olmayan hastalığa iyileşme iddiası; görünüşü aşağılama; süre vaadi | En düşük yaş 18 kesin (Advantage+ kitlede kesin kalan alan, D1 §2); iddia sözlüğü | 36 · Resmî-Meta |
| 20 | Sektör: sağlık (Türkiye) | Yurt içine sponsorlu tanıtım genel kural yasak; fiyat, indirim, kampanya, "en iyi/tek", hasta teşekkürü yok; öncesi-sonrası onamlı, tarihli, AI'sız | Ön koşul: istisna beyanı yoksa yayın kapalı (ürün ve hukuk kararı); metin sözlüğü | 68 · Resmî-diğer |
| 21 | İndirim iddiası (Türkiye) | Önceki fiyat (son 30 günün en düşüğü), başlangıç-bitiş, sınırlı miktar; "…'e varan" okunur | Metinde ya da şablonda indirim ibaresi varsa zorunlu alanlar açılır | 69 · Resmî-diğer |
| 22 | Konut fiyatı (Türkiye) | Brüt ve net alan | Fiyat varsa iki alan zorunlu; `HOUSING` beyanı ayrıca (D1 karar 4) | 70 · Resmî-diğer |
| 23 | Üstünlük ve karşılaştırma (Türkiye) | İspat yükü reklamverende | "en", "tek", "1 numara" uyarısı + kanıt alanı | 70 · Resmî-diğer |
| 24 | Yapay zekâ içeriği | Gerçekçi sentetik kişi/olay; AB hedefi; siyaset | Kullanıcı beyanı (`self_ai_disclosure`); AB hedefliyse beyan zorunlu uyarısı | 32 · Resmî-Meta; 72 · Resmî-diğer; D1 |
| 25 | Benzer kreatif | Aynı ya da çok benzer görsel bu sayfada son 30 günde kullanılmış | Algısal özetle uyarı: "aynı fikir sayılır, daha hızlı yorulur" (Advetics yöntemi) | 25, 26 · Resmî-Meta |
| 26 | Sayfa reklam sınırı | 250 (KOBİ), çalışan + incelemedeki, bütün hesaplar | `ads_volume?page_id=` ön koşulu; %80 üstünde uyarı, aşacaksa yayın kapalı | 21, 65 · Resmî-Meta |
| 27 | Mevcut gönderi | IG'de 1,91:1–4:5 dışı geçersiz; telif müzik, filtre, efekt | D3'teki satırlar + `boost_eligibility_info` | D3 |

---

## Advetics için tasarım önerileri

### Ö1. Kreatif adımı — kullanıcı ne yükler

- **Üç kapı:** "Görsel yükle", "Video yükle", "Paylaşılmış gönderini kullan" (karusel ikinci turda ve
  Gelişmiş'te). [§1.3, §1.4]
- **Görselde rehber cümle:** "En iyi sonuç için dikey (9:16) görsel yükle. Diğer görünümleri biz çıkarırız."
  Kare ve portre de kabul edilir. [§1.6 hesap]
- **Videoda:** "Dikey (9:16) video yükle. 6 ile 15 saniye arası en iyisi." + isteğe bağlı ikinci dosya "Akış
  için 4:5".
  [§1.7, §5 #11–12]
- **Metin:** ana metin ve başlık zorunlu; açıklama marka cümlesiyle önceden dolu ve düzenlenebilir (boş alan
  = Meta'nın siteden çektiği cümle). [§1.4, §5 #16–17]
- **Marka kiti** Base / Marka Merkezi'nden gelir (logo, renk, yazı tipi); kullanıcı yeniden girmez.

### Ö2. Sistem ne üretir

- **Oran seti üç kart:** Akış (4:5), Tam ekran (9:16 — Hikâye, Reels, Durum), Küçük alanlar (1:1 — sağ sütun,
  Marketplace, karusel, Audience Network). 1,91:1 üretilmez: güvenli içerik sığmıyor ve onu isteyen yerleşim
  1:1'i de kabul ediyor. [§1.2, §1.3, §1.6]
- **Türetme (deterministik, tarayıcıda, AI yok):**
  - kaynak 9:16 → 4:5 ve 1:1 güvenli bandın ortasından kırpılır; kullanıcı odak noktasını sürükler;
  - kaynak 4:5 → 1:1 kırpım; 9:16 için varsayılan **"küçült ve ortala, marka rengi zemin"** (her şey güvenli
    alanda); seçenekler "bulanık arka plan" ve "tam genişlik" (uyarıyla: alt kısım düğmelerin altında
    kalır);
  - kaynak 1:1 → 4:5 ve 9:16 dolguyla;
  - **"Yapay zekâ ile genişlet"** Acemi'de yok; Gelişmiş'te ancak workspace'in kayıtlı müşteri onayı varsa,
    önizlemeyle ve "AI info" etiketi notuyla (Meta `image_uncrop` ya da harici model). [§1.2, §4.1]
- **Video:** oran dönüştürme yok (API kırpamıyor, paylaşımlı VPS'te render yok); eksik oran için önizleme +
  kullanıcı kararı; tarayıcıda (WebCodecs / ffmpeg.wasm) kırpma ileride Gelişmiş'te. [§1.5, §5 #12]
- **Yazı katmanı (isteğe bağlı şablon):** Advetics'in tarayıcı içi şablon motoru; marka yazı tipleri gömülü,
  Türkçe glif zorunlu; yazı tipi yüklenmeden rasterleştirme yapılmaz (`document.fonts.load` beklenir,
  yüklenemezse açıkça hata) — `CLAUDE.md`'deki "PDF'te Türkçe gömülü yazı tipi" dersinin aynısı: sessizce
  başka yazı tipine düşmek en kötü davranış. **AI görselin içine yazı yazmaz.** [§4.2]
- **Metin önerileri (AI, Advetics'te):** 3–5 ana metin + başlık; marka sesiyle; görünür uzunluklara göre;
  politika süzgecinden geçmiş (§5 #18–23); her öneri "AI önerisi" işaretli, kullanıcı seçer ya da düzenler.
  Meta'nın `text_generation`'ı kapalı kalır. [§4.1, §4.3]
- **Türkçe altyazı:** video sesinden otomatik döküm (dış hizmet) → kullanıcı düzeltir → SRT `tr_TR` (API'den
  yüklenebiliyorsa) ya da videoya gömülü (açık soru 9). [§1.7]
- **Tek türetme fonksiyonu `packages/shared`'da:** panel önizlemesi, derleyici (`image_crops` koordinatları)
  ve onay kaydı aynı fonksiyondan beslenir — `CLAUDE.md`: "aynı şeyi üreten ikinci fonksiyon doğduğu anda
  ayrışır" ve "önizleme eklemek, onu doğru tutma borcu". Orijinal ve türevler Advetics'te saklanır, Meta'nın
  adresine güvenilmez (imzalı adres ölüyor); `image_hash` reklam hesabı başına (`asset_platform_refs`). [D5]

### Ö3. Zorunlu oranlar (karar önerisi)

| Mod | Görsel | Video |
|---|---|---|
| Acemi | 4:5 + 9:16 zorunlu (biri yüklenir, diğeri türetilir ve **kullanıcı görür**); 1:1 türetilir | 9:16 zorunlu; 4:5 önerilir; yoksa akış önizlemesi gösterilir ve kullanıcı onaylar |
| Gelişmiş | + ayrıca yüklenen 1:1 ya da 1,91:1; yerleşim başına farklı medya; onaylı AI genişletme | + ayrı 4:5 / 1:1 dosyalar; in-stream için 16:9 |

Gerekçe: §1.2–1.4; README karar 2 ("medya yerleşimleri karşılamalı: kare + dikey") bu araştırmayla
"**portre (4:5) + dikey (9:16), kare türetilir**" olarak inceltiliyor, çünkü Meta iki akış yerleşiminde 4:5
öneriyor ve 4:5'ten 1:1 kayıpsız kırpılıyor.

### Ö4. Önizleme nasıl gösterilir

- **Katman 1 — anında, sıfır çağrı (Advetics):** Instagram akış, Instagram Reels, Instagram Hikâye, Facebook
  akış, sağ sütun ve WhatsApp Durum çerçeveleri; güvenli alan katmanı; "devamı" kesilme noktası; Meta
  arayüzü taklidi ("Reklam" etiketi). Başlıkta "Taslak görünümü".
- **Katman 2 — prova adımı (D1 §5.6):** `generatepreviews` ile `MOBILE_FEED_STANDARD`, `INSTAGRAM_STANDARD`,
  `INSTAGRAM_STORY`, `INSTAGRAM_REELS`, `FACEBOOK_STORY_MOBILE`, `FACEBOOK_REELS_MOBILE`,
  `RIGHT_COLUMN_STANDARD`, `MARKETPLACE_MOBILE`, `MOBILE_NATIVE` (Audience Network), `THREADS_STREAM` ve Durum
  açıksa `WHATSAPP_STATUS_MEDIA` (D3, D4). Her kart dört ayrı hâl: istenmedi / isteniyor / **bu yerleşimde
  gösterilmez + sebebi** (`emptyReason`) / istek düştü + Meta'nın kendi mesajı. `.catch(() => [])` yok
  (`CLAUDE.md`). iframe 24 saat geçerli, saklanmaz (D3).
- **Fark denetimi:** Katman 1 ile Katman 2 aynı yerleşimde farklı kesiyorsa (ör. Facebook akışında 4:5'in
  1:1'e kesilmesi) kart kırmızı: "Meta bu alanda görseli farklı kesiyor." Açık soru 1'in canlı cevabı da
  buradan gelir.
- **Onay kaydı (D1 §6.3):** Katman 1 PNG'leri + Meta'ya gönderilen kreatif gövdesi + önizleme isteklerinin
  parametreleri ve dönen durumlar. iframe değil.
- **Sessiz olanı söyleyen cümleler (panel diliyle):** "Reklamın Meta'nın bütün alanlarında gösterilebilir.
  Her alanın görünümü aşağıda." · "Bu alanda yazının bir kısmı düğmelerin altında kalıyor." · "Bu amaçta
  Facebook'ta telefonda başlık ve düğme görünmez." · "Altyazı bu videoyu kullanan bütün reklamlarda değişir."

### Ö5. Manifestoya (D1 §2) eklenecek satırlar

| Alan | Gönderilmezse Meta ne yapıyor | Advetics ne yazmalı | Bulgu |
|---|---|---|---|
| `creative_features_spec.pac_relaxation` | "Varsayılan açık olabilir"; medya başka yerleşimlere gider | `OPT_OUT` | §1.2 |
| Bilinmeyen özellik anahtarı | Yeni özellik sessizce açılabilir | Geri okumada listede olmayan bir `OPT_IN` → yayın durur, kullanıcıya gösterilir | §4.1 |
| Yerleşim eşlemesi | Kırpma teslimatı kısıtlamaz | Seçilecek tek yolla açıkça (açık soru 2–4); önizlemeyle doğrulanır | §1.5 |
| `portrait_customizations.background_color` | Meta renk üretir | Marka rengi | §1.3 |
| `link_data.description` ve başlık | Siteden metin çekilebilir | Dolu | §1.4 |
| Video altyazısı | Türkçe otomatik altyazı yok | Türkçe SRT ya da gömülü | §1.7 |
| `creative_test_config` | — | Açıkça; %20 varsayılanı kullanıcıya rakamla gösterilir | §3.1 |
| Yayındaki reklamın `degrees_of_freedom_spec`'i | Ads Manager'da kopyalama/düzenleme özellikleri açabilir | Periyodik geri okuma; fark → uyarı | §4.1 |

### Ö6. Çeşitlilik kuralı (Advetics önerisi; Meta'nın sayısı değil)

- **Reklam = kavram.** Oranlar ve metin seçenekleri reklamın içinde (yerleşim eşlemesi, çoklu metin); aynı
  fikrin başka kırpımı ayrı reklam yapılmaz. [§2.3, §2.4]
- **Kavram kartı dört soru:** Kime? Ne vaat ediyorsun? Neyle kanıtlıyorsun? Hangi biçimde (konuşan kişi, ürün
  gösterimi, müşteri yorumu, teklif)? [§2.4]
- **Kavram sayısı haftalık beklenen sonuca göre** (hesabın geçmiş sonuç başı maliyetinden; geçmiş yoksa
  "bilinmiyor" sayılır ve 2 ile başlanır): haftada 50'den az sonuç → 2; 50–150 → 3; 150'den fazla → 4–5
  (Acemi tavanı 5). Gerekçe: öğrenme ~50/hafta/ad set [23], hacim uyarısı [22], Instagram rehberinin "10 ile
  başla, 5'i tut"u büyük bütçe varsayımıyla [18]. **Eşikler Advetics'in**, canlı veriyle ayarlanmalı.
- **Benzerlik uyarısı** (algısal özet; §5 #25) ve **sayfa reklam sınırı göstergesi** (§5 #26).
- **Tekrar kullanım uyarısı:** "Bu görsel son 30 günde 3 reklamda kullanıldı; daha hızlı yorulabilir." [25]

### Ö7. Kreatif test stratejisi

1. **Varsayılan: "Çeşitli başla".** Her yeni kampanyada Ö6 kuralıyla 2–5 kavram, tek ad set; Meta dağıtır.
   Rapor dili: "Meta bütçenin %62'sini A fikrine verdi. Bu bir test sonucu değil, Meta'nın tahmini." 7 gün ve
   yeterli sonuç olmadan "kazanan" kelimesi kullanılmaz. [§3.3, §3.5]
2. **"Hangisi daha iyi? Test et"** (Acemi'de tek düğme, ön koşullu):
   - Altyapı: Meta kreatif testi (`SPLIT_TEST_V2`, 2–5 hücre, hücre başına tek reklam). [§3.1]
   - **Sıfır çağrılı ön koşullar:** reklamlar aynı ad set'te; teklif stratejisi "en yüksek hacim" (sektör
     kaynağı, canlıda doğrulanacak); bu kitle başka aktif kampanyada kullanılmıyor; hücre başına beklenen
     sonuç eşiğin üstünde (öneri: 7 günde ≥30, Advetics eşiği). Yetmiyorsa düğme kapalı ve sebebi yazılı:
     "Bu bütçeyle test 7 günde sonuç vermez. Günlük X TL ya da Y gün gerekir." (tahmin etmektense kısıtla)
     [§3.2, §3.5]
   - **Varsayılanlar:** bütçenin %20'si (Meta'nın varsayılanı, kullanıcıya rakamla), 7 gün (en çok 30),
     birincil KPI niyet satırının sonucu — form → `cost_per_action_type:lead`, WhatsApp/mesaj →
     `cost_per_action_type:onsite_conversion.messaging_first_reply`, site →
     `cost_per_action_type:landing_page_view`, satış → `cost_per_action_type:omni_purchase` (Meta MCP'nin KPI
     listesi [66]).
   - **Sonuç dili:** Meta'nın güven yüzdesi açıkça gösterilir; Advetics etiketi ≥%80 "Net kazanan", %65–80
     "Eğilim var, kesin değil", %65 altı "Fark yok". Meta %65'te "kazanan" dediği için farkı açıklayan not.
     [§3.2]
   - **Sonrası (onaylı):** kaybedenler durdurulur, kazanan kalır; sonraki test yeni kavramla. Ad set'e reklam
     eklemek öğrenmeyi sıfırladığı için değişiklikler toplu ve en sık haftada bir. [§2.5]
3. **Ne test edilir (Acemi rehberi):** önce fikir (vaat / kişi tipi), sonra biçim (video ↔ görsel), sonra ilk 3
   saniye, en son metin. Renk ya da düğme testi önerilmez. [§1.7, §2.4]
4. **Yorgunluk döngüsü:** `creative_fatigue` webhook'u + Ads Manager durumları → AI'ın yenileme kartı (T
   katmanı: yeni kavram taslağı) → kullanıcı onayı (C katmanı). Meta'nın `CREATIVE_FATIGUE` önerisi "uygula"
   ile çağrılmaz (AI üretimini tetikleyebilir). Eski reklam kapatılmaz, yenisi eklenir (Meta'nın önerisi).
   [§2.5]
5. **Gelişmiş:** ad set seviyesinde A/B (kitle, yerleşim, optimizasyon; "tek değişken" araçta zorunlu); esnek
   format yalnız Satış'ta (API kısıtı); dinamik kreatif ve lift testleri gösterilmez (lift 120 bin $ eşiği).
   [§3.2, §3.3]
6. **AI araçları (D1 §6.2 katmanlarına):** O: `kreatif_dogrula`, `yorgunluk_durumu`, `test_sonucu_oku`,
   `sayfa_reklam_siniri`; T: `oran_seti_uret`, `kavram_oner`, `metin_oner`; C: `kreatif_testi_kur`,
   `kreatif_yenile`. AI kavram sayısını, test eşiğini ve AI dönüşümünü kendisi seçemez; hepsi veride.

### Ö8. Üretim aracı kararları

- **İlk sürüm:** Advetics'in kendi şablon + kırpma/dolgu motoru (tarayıcıda; VPS'e yük yok), politika
  süzgeçli AI metin önerisi, Türkçe altyazı. Canva, harici AI görsel/video üretimi ve Meta'nın üretken
  özellikleri ilk sürümde yok. [§4.1–4.3]
- **Sonra / Gelişmiş:** (a) "Canva'dan içe aktar" — kullanıcının kendi hesabıyla; dışa aktarılan PNG/MP4
  Advetics doğrulamasından geçer. (b) AI görsel/genişletme için sağlayıcı ölçütleri: ticari kullanım ve
  tazminat yazılı; köken işareti (C2PA/SynthID) korunur; görsele Türkçe yazı yazdırılmaz; sağlık, konut ve
  finans workspace'lerinde kapalı; AB hedefli reklamda beyan uyarısı; müşteriye FSEK notu. (c) Meta'nın
  üretken özellikleri workspace onayıyla, `PAUSED` + önizleme + geri okumayla (D3).
- **Sektör kapıları:** sağlık workspace'inde §4.4 yönetmelik kapısı; konut workspace'inde brüt/net alan +
  `HOUSING`; indirim içeren metinlerde zorunlu alanlar.

---

## Açık sorular ve doğrulanması gerekenler

### Canlıda ölçülecek (çoğu `PAUSED` / `validate_only` / `generatepreviews` ile bedava)

1. Facebook akışında kırpma spec'siz 4:5 görsel 4:5 mi, 1:1 mi görünüyor? (`MOBILE_FEED_STANDARD` önizlemesi;
   [60] ↔ [39])
2. Yerleşim özelleştirme kuralında `instagram_positions: ["reels"]`, `facebook_positions: ["facebook_reels"]`,
   `whatsapp_positions: ["status"]` kabul ediliyor mu; boş `customization_spec` "geri kalan her yer" mi; tek
   kurallı spec kabul mü?
3. Yerleşim özelleştirmesi ya da çoklu medya her Acemi niyet satırında (WhatsApp, form, site, Messenger)
   `validate_only`'den geçiyor mu? (Belgedeki amaç tablosu eski adlarla.)
4. Çoklu medyada `opt_in_status: "opt_in"` ve `auto_crop` / `smart_crop` / `super_crop` ne yapıyor;
   `placement_exclusions` 9:16 medyayı akıştan gerçekten uzak tutuyor mu?
5. 9:16 olmayan görsel Reels'te nasıl çiziliyor; `portrait_customizations` Reels'i etkiliyor mu?
6. Hiçbir özellik göndermeden ve hepsini `OPT_OUT` göndererek kurulan iki kreatifte `pac_relaxation`,
   `adapt_to_placement`, `image_touchups`, `video_auto_crop` geri okuması (D1 §9-5'in genişletilmesi).
7. `SPLIT_TEST_V2` + `creative_test_config` gerçekten kabul ediliyor mu (referans enum'unda yok); hücrelerin
   aynı ad set'te olma şartı; Advantage+ kampanya bütçesiyle uyumu; teklif stratejisi şartı; `PAUSED`
   reklamlarla kurulup sonra açılabiliyor mu; `business_id` için gereken izin.
8. Tek 9:16 video Facebook ve Instagram akışında nasıl görünüyor (Instagram'da kırpılmıyor deniyor) — videoda
   4:5 zorunlu olmalı mı?
9. Reklam videosuna API'den Türkçe SRT yüklenebiliyor mu; yoksa altyazı gömülü mü olmalı?
10. Meta'nın üretken özellikleri Türkiye'deki hesaplarda ve Türkçe metinde açık mı; sağlık ve konut
    hesaplarında kapalı mı?
11. `creative_fatigue` webhook'u ajans havuzundaki her hesap için `subscribed_apps` ile açılabiliyor mu;
    mesaj dili ne?
12. 3:4 (`300x400`) kırpım anahtarı hangi yerleşimde kullanılıyor (API sözlüğünde var, Ads Guide'da yok)?
13. Facebook Hikâye video süresi (bir yardım metninde 1–15 sn) bugün geçerli mi?

### Kullanıcıya sorulacak (ürün ve hukuk kararları)

14. Sağlık sektöründe yurt içi sponsorlu reklam: modül tamamen kapatsın mı, istisna beyanıyla (açılıştan
    sonraki ilk ay, onaylı yeni teknoloji, Türkçe dışı sağlık turizmi) mı açılsın? Hukuk görüşü şart.
15. 9:16 dolgu varsayılanı: marka rengi mi, bulanık arka plan mı? AI genişletme hiç mi, Gelişmiş'te onaylı mı?
16. Ana metin sert sınırı: 1.000 (Threads'te güvenli) mi, 2.200 mi?
17. Test sonucu eşiği (öneri %80) ve hücre başına en az sonuç (öneri 7 günde 30).
18. İlk sürümde Canva ya da AI görsel üretimi olacak mı?
19. AI ile üretilen görsellerin telif durumu (FSEK) müşteri sözleşmesinde nasıl yazılacak?
20. Ana metnin sonundaki yasal uyarı Reels'te 44 karakterden sonra kesiliyor; görünmesi şart uyarılar görselin
    üstüne mi (güvenli alanda, alt %40 kuralıyla) yoksa metnin başına mı konacak?

---

## Kaynaklar

| # | Başlık | URL | Tarih | Etiket |
|---|---|---|---|---|
| 1 | About Advantage+ placements | https://www.facebook.com/business/help/196554084569964 | deney 30.08–07.09.2025; okunma 2026-10-06 | Resmî-Meta |
| 2 | Aspect ratios supported by placements in Meta Ads Manager | https://www.facebook.com/business/help/682655495435254 | tarihsiz; okunma 2026-10-06 | Resmî-Meta |
| 3 | Best practices for aspect ratios | https://www.facebook.com/business/help/103816146375741 | tarihsiz (2026 içeriği) | Resmî-Meta |
| 4 | Edit aspect ratios for your ad creative in Meta Ads Manager | https://www.facebook.com/business/help/923747721335004 | Eylül 2024 güncellemesi | Resmî-Meta |
| 5 | About asset customization for placements | https://www.facebook.com/business/help/1044825198987622 | tarihsiz | Resmî-Meta |
| 6 | Customize your ad creative for placements | https://www.facebook.com/business/help/127128577862845 | tarihsiz | Resmî-Meta |
| 7 | Troubleshoot asset customization for placements | https://www.facebook.com/business/help/307085233096381 | tarihsiz | Resmî-Meta |
| 8 | About flexible media in Meta Ads Manager | https://www.facebook.com/business/help/1126725172362626 | tarihsiz | Resmî-Meta |
| 9 | About the flexible ad format | https://www.facebook.com/business/help/835561738423867 | tarihsiz | Resmî-Meta |
| 10 | About text overlays and the safe zone for ads | https://www.facebook.com/business/help/980593475366490 | tarihsiz | Resmî-Meta |
| 11 | Design requirements for Instagram Stories ads | https://www.facebook.com/business/help/2222978001316177 | tarihsiz | Resmî-Meta |
| 12 | Adjust background colors for Stories ads | https://www.facebook.com/business/help/266481863999300 | tarihsiz | Resmî-Meta |
| 13 | Crop media for a video ad | https://www.facebook.com/business/help/268849943715692 | tarihsiz | Resmî-Meta |
| 14 | About ads on Reels | https://www.facebook.com/business/help/437348354643456 | Kasım 2025 notu | Resmî-Meta |
| 15 | Create Instagram Reels ads in Meta Ads Manager | https://help.instagram.com/546362593027755 | tarihsiz | Resmî-Meta |
| 16 | How to add music to ads using Ads Manager | https://help.instagram.com/759279452000505 | tarihsiz | Resmî-Meta |
| 17 | Add captions to your video ad | https://www.facebook.com/business/help/1675722002698686 | tarihsiz | Resmî-Meta |
| 18 | Best practices for Instagram video ads | https://www.facebook.com/business/help/188534925073536 | 2025 (2024 sonu değişikliğini anıyor) | Resmî-Meta |
| 19 | Video ad playing specifications by placement | https://www.facebook.com/business/help/2013114112289197 | Mart 2026 notu | Resmî-Meta |
| 20 | Recommended minimum image pixel requirements across placements | https://www.facebook.com/business/help/469767027114079 | tarihsiz | Resmî-Meta |
| 21 | Ad limits per Page | https://www.facebook.com/business/help/766697140509126 | tarihsiz | Resmî-Meta |
| 22 | About managing ad volume | https://www.facebook.com/business/help/2720085414702598 | Haziran 2024 notu | Resmî-Meta |
| 23 | About the learning phase | https://www.facebook.com/business/help/112167992830700 | tarihsiz | Resmî-Meta |
| 24 | Significant edits and learning phase | https://www.facebook.com/business/help/316478108955072 | tarihsiz | Resmî-Meta |
| 25 | About creative fatigue recommendations in Meta Ads Manager | https://www.facebook.com/business/help/1346816142327858 | tarihsiz | Resmî-Meta |
| 26 | Understand auction overlap | https://www.facebook.com/business/help/537699989762051 | tarihsiz | Resmî-Meta |
| 27 | About experiments | https://www.facebook.com/business/help/1915029282150425 | tarihsiz | Resmî-Meta |
| 28 | Best practices for A/B testing | https://www.facebook.com/business/help/290009911394576 | tarihsiz | Resmî-Meta |
| 29 | About confidence in your tests and experiments | https://www.facebook.com/business/help/239549606692303 | tarihsiz | Resmî-Meta |
| 30 | How winning campaigns are determined in A/B tests without a holdout | https://www.facebook.com/business/help/166313650471318 | tarihsiz | Resmî-Meta |
| 31 | View ad creative performance | https://www.facebook.com/business/help/325150884947303 | tarihsiz | Resmî-Meta |
| 32 | About media created or edited with AI (sosyal konu, seçim, siyaset) | https://www.facebook.com/business/help/1486382031937045 | tarihsiz | Resmî-Meta |
| 33 | Add animation to an image in Meta Ads Manager | https://www.facebook.com/business/help/1766652437485798 | AI şartları 06.05.2024 | Resmî-Meta |
| 34 | Generate image variations in Meta Ads Manager | https://www.facebook.com/business/help/1684513971952814 | tarihsiz | Resmî-Meta |
| 35 | About Meta's privacy violations and personal attributes advertising policy | https://www.facebook.com/business/help/2557868957763449 | tarihsiz | Resmî-Meta |
| 36 | About Meta's health and wellness advertising policy | https://www.facebook.com/business/help/2489235377779939 | tarihsiz | Resmî-Meta |
| 37 | About ad quality | https://www.facebook.com/business/help/423781975167984 | tarihsiz | Resmî-Meta |
| 38 | Why some ads are approved, then rejected | https://www.facebook.com/business/help/133691315402558 | tarihsiz | Resmî-Meta |
| 39 | Meta Ads Guide — Facebook akışı, görsel | https://www.facebook.com/business/ads-guide/update/image | okunma 2026-10-06 | Resmî-Meta |
| 40 | Meta Ads Guide — Instagram akışı, görsel | https://www.facebook.com/business/ads-guide/update/image/instagram-feed | okunma 2026-10-06 | Resmî-Meta |
| 41 | Meta Ads Guide — Instagram Hikâye, görsel | https://www.facebook.com/business/ads-guide/update/image/instagram-story | okunma 2026-10-06 | Resmî-Meta |
| 42 | Meta Ads Guide — Instagram Reels, görsel | https://www.facebook.com/business/ads-guide/update/image/instagram-reels | okunma 2026-10-06 | Resmî-Meta |
| 43 | Meta Ads Guide — Facebook sağ sütun, görsel | https://www.facebook.com/business/ads-guide/update/image/facebook-right-hand-column | okunma 2026-10-06 | Resmî-Meta |
| 44 | Meta Ads Guide — Facebook akışı, video | https://www.facebook.com/business/ads-guide/update/video/facebook-feed | okunma 2026-10-06 | Resmî-Meta |
| 45 | Meta Ads Guide — Instagram Reels, video | https://www.facebook.com/business/ads-guide/update/video/instagram-reels | okunma 2026-10-06 | Resmî-Meta |
| 46 | Meta Ads Guide — Instagram Hikâye, video | https://www.facebook.com/business/ads-guide/update/video/instagram-story | okunma 2026-10-06 | Resmî-Meta |
| 47 | Meta Andromeda: Advantage+ automation's next-gen personalized ads retrieval engine | https://engineering.fb.com/2024/12/02/production-engineering/meta-andromeda-advantage-automation-next-gen-personalized-ads-retrieval-engine/ | 2024-12-02 | Resmî-Meta |
| 48 | AI innovation in Meta's ads ranking driving advertiser performance | https://www.facebook.com/business/news/ai-innovation-in-metas-ads-ranking-driving-advertiser-performance | 2025-03-27 | Resmî-Meta |
| 49 | Performance marketing on Meta (Performance 5) | https://www.facebook.com/business/ads/performance-marketing | tarihsiz | Resmî-Meta |
| 50 | Instagram & Facebook Reels ads | https://www.facebook.com/business/ads/facebook-instagram-reels-ads | veri 05.2022–04.2023 (eski olabilir) | Resmî-Meta |
| 51 | Split testing (`SPLIT_TEST_V2`, `creative_test_config`) — `kaynak/marketing-api__guides__split-testing.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/split-testing | örnek Mart 2026 | Resmî-Meta |
| 52 | Ads webhooks — creative fatigue | https://developers.facebook.com/documentation/ads-commerce/marketing-api/ads-webhooks/creative-fatigue | 2026 (örnek yük) | Resmî-Meta |
| 53 | Placement asset customization | https://developers.facebook.com/documentation/ads-commerce/marketing-api/dynamic-creative/placement-asset-customization | tarihsiz | Resmî-Meta |
| 54 | Asset customization rules | https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/asset-feed-spec/asset-customization-rules | tarihsiz | Resmî-Meta |
| 55 | Multi-media ads | https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/multi-media-ads | tarihsiz (v25 örnekleri) | Resmî-Meta |
| 56 | Placement targeting | https://developers.facebook.com/documentation/ads-commerce/marketing-api/audiences/reference/placement-targeting | tarihsiz | Resmî-Meta |
| 57 | Marketing API v24.0 changelog | https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog/version24.0 | 2025-10-08 | Resmî-Meta |
| 58 | Advantage+ creative — get started | https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative/advantage-creative/get-started | tarihsiz (v22+) | Resmî-Meta |
| 59 | Generative AI features | https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative/generative-ai-features | tarihsiz (v19 örnekleri) | Resmî-Meta |
| 60 | Instagram ads API — media requirements | https://developers.facebook.com/documentation/ads-commerce/instagram/ads-api/reference/media-requirements | kırpma tablosu 2019 blog yazısına dayanıyor (eski olabilir) | Resmî-Meta |
| 61 | Reels ads | https://developers.facebook.com/documentation/ads-commerce/marketing-api/creative/reels-ads | tarihsiz | Resmî-Meta |
| 62 | Flexible ad format | https://developers.facebook.com/documentation/ads-commerce/marketing-api/flexible-ad-format | tarihsiz | Resmî-Meta |
| 63 | Performance recommendations | https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview/performance-recommendations | tarihsiz | Resmî-Meta |
| 64 | Ad creative reference (`image_crops` sözlüğü) | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-creative | tarihsiz | Resmî-Meta |
| 65 | Ad volume (`ads_volume`) | https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights-api/ads-volume | tarihsiz | Resmî-Meta |
| 66 | Meta Ads MCP — `ads_experiment_abtest_create_test` araç şeması (oturumda okundu, araç çağrılmadı) | Meta Ads MCP sunucusu | 2026-10-06 | Resmî-Meta · canlı şema |
| 67 | Ads MCP server — A/B tests and conversion lift studies tools | https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-mcp-server/ads-mcp-server-tools-abtests-and-conversion-lift-studies | tarihsiz | Resmî-Meta |
| 68 | Sağlık Hizmetlerinde Tanıtım ve Bilgilendirme Faaliyetleri Hakkında Yönetmelik (RG 33075) | https://www.resmigazete.gov.tr/eskiler/2025/11/20251112-2.htm | 2025-11-12 | Resmî-diğer |
| 69 | Ticaret Bakanlığı — Fiyat bilgisi içeren reklamlar ile indirimli satış reklamları broşürü | https://tuketici.ticaret.gov.tr/data/6287a2b713b8768c50e1e27c/ticaret%20bakanl%C4%B1%C4%9F%C4%B1%20bro%C5%9F%C3%BCr.pdf | 2022-05-10 (eski olabilir) | Resmî-diğer |
| 70 | Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği (RG 29232, asıl metin) | https://www.resmigazete.gov.tr/eskiler/2015/01/20150110-5.htm | 2015-01-10 (sonraki değişiklikler yok; eski olabilir) | Resmî-diğer |
| 71 | Ticaret Bakanlığı — sosyal medya etkileyicileri kılavuzu | https://ticaret.gov.tr/haberler/ticaret-bakanligi-sosyal-medya-etkileyicileri-icin-kilavuz-yayimladi | 2021 (eski olabilir) | Resmî-diğer |
| 72 | AI Act Service Desk — Article 50: Transparency obligations | https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-50 | uygulama 2026-08-02 | Resmî-diğer |
| 73 | Canva Connect — Create design autofill job | https://www.canva.dev/docs/connect/api-reference/autofills/create-design-autofill-job/ | okunma 2026-10-06 | Resmî-diğer |
| 74 | Canva Connect — Autofill guide | https://www.canva.dev/docs/connect/autofill-guide/ | okunma 2026-10-06 | Resmî-diğer |
| 75 | Canva — Content License Agreement | https://www.canva.com/policies/content-license-agreement/ | arama özetinden | Resmî-diğer |
| 76 | Google DeepMind — Identifying AI-generated images with SynthID | https://deepmind.google/blog/identifying-ai-generated-images-with-synthid/ | arama özetinden | Resmî-diğer |
| 77 | Adobe — Firefly business AI approach | https://business.adobe.com/products/firefly-business/firefly-ai-approach.html | arama özetinden | Resmî-diğer |
| 78 | Sağlıkta Tanıtım ve Bilgilendirme Yönetmeliği 2025 (Kazdal Hukuk) | https://kazdal.av.tr/blog/saglikta-tanitim-ve-bilgilendirme-yonetmeligi-2025/ | 2025 | Sektör |
| 79 | Yeni sağlık tanıtım yönetmeliği (Mondaq) | https://www.mondaq.com/turkey/healthcare/1705684/ | 2025 | Sektör |
| 80 | Meta's update: a new way to test creatives (EasyInsights) | https://easyinsights.ai/blog/metas-update-a-new-way-to-test-creatives-from-a-b-to-ai-led-optimization/ | 2025-10-17 | Sektör |
| 81 | Meta's Creative Testing Tool (Jon Loomer) | https://www.jonloomer.com/meta-creative-testing/ | 2025 (403; arama özetinden) | Sektör |
| 82 | Meta shares tips on Reels hooks, creative diversification in ads and Threads (Social Media Today) | https://www.socialmediatoday.com/news/meta-shares-tips-on-reels-hooks-creative-diversification-in-ads-and-threa/808182/ | 2025-12-17 | Sektör (Meta'yı aktarıyor) |
| 83 | What does Meta mean by creative diversification? (Excite Media) | https://www.excitemedia.com.au/blog/meta-creative-diversification/ | 2026-04-15 | Sektör (Meta'ya atıf yok) |
| 84 | Testing Meta Ads creatives in 2026 (Affect Group) | https://affectgroup.com/blog/how-to-test-creatives-in-meta-ads-in-2026-a-working-system-in-the-era-of-advantage-and-andromeda/ | 2026-05-20 | Sektör |
| 85 | How to test ad creatives after Meta's Andromeda update (TheOptimizer) | https://theoptimizer.io/blog/how-to-test-ad-creatives-on-meta-after-the-andromeda-update-2026-playbook | 2026-05-23 | Sektör |
| 86 | Meta's Andromeda update: creative diversity (The MTM Agency) | https://themtmagency.com/blog/meta-andromeda-october-2025-update-why-creative-diversity-now-defines-ad-performance | 2025 (arama özetinden) | Sektör |
| 87 | Meta Andromeda explained: Entity IDs vs creative volume (Adsuploader) | https://adsuploader.com/blog/meta-andromeda | 2026 (arama özetinden) | Sektör |
| 88 | Meta Reels safe zone 14% / 35% / 6% (Behaviour Digital); Meta Ads safe zones (Billo) | https://behaviour.digital/post/meta-reels-safe-zone-14-top-35-bottom-6-sides-the-2026-official-guide ; https://billo.app/blog/meta-ads-safe-zones/ | 2026 (arama özetinden) | Sektör |
| 89 | Meta is changing your ads without asking (NiCreated) | https://www.nicreated.com.au/meta-ads-updates-2026-ai-creative | 2026-04-22 | Topluluk |
| 90 | Meta Advantage+ Creative in 2026: default-on AI enhancements (Leapbuzz) | https://leapbuzz.com/blog/meta-advantage-plus-creative-ai/ | 2026 (arama özetinden) | Topluluk |
| 91 | Facebook removes the 20% text limit on ad images (Search Engine Journal) | https://www.searchenginejournal.com/facebook-removes-the-20-text-limit-on-ad-images/381844/ | 2020 (eski olabilir) | Sektör |
| 92 | Meta announces generative AI advances for advertisers at Cannes Lions (PPC Land) | https://ppc.land/meta-announces-generative-ai-advances-for-advertisers-at-cannes-lions/ | 2025-06 (arama özetinden) | Sektör |
| 93 | Yapay zekâ tarafından oluşturulan eserlerde telif hakkı sorunu | https://yadigargediktoy.av.tr/2025/08/08/yapay-zeka-tarafindan-olusturulan-eserlerde-telif-hakki-sorunu/ | 2025-08-08 (arama özetinden) | Sektör |
| 94 | From Fragment to One Piece: A Survey on AI-Driven Graphic Design (arXiv 2503.18641) | https://arxiv.org/pdf/2503.18641 | 2025-03 (arama özetinden) | Sektör (akademik) |
| 95 | OpenAI says DALL·E 3 to adopt C2PA standard (Maginative) | https://www.maginative.com/article/openai-says-dall-e-3-to-adopt-c2pa-standard-for-image-metadata/ | 2024-02 (arama özetinden) | Sektör |
| 96 | Design specifications for lead ads with instant form | https://www.facebook.com/business/help/908491205873167 | tarihsiz (Instagram video "120 sn" ifadesi eski olabilir) | Resmî-Meta |
| D1 | `README.md` (brief; kullanıcı kararları, §2 manifesto, §5.6 prova, §6 AI katmanları) | depo | 2026-10-06 | Depo |
| D2 | `bolumler/04-butce-teklif-advantage-olcum.md` (A/B ve `ad_studies`) | depo | 2026-10-06 | Depo (belgeden derlenmiş) |
| D3 | `bolumler/05-kreatif-ve-instagram.md` (Advantage+ creative, giriş anı tablosu) | depo | 2026-10-06 | Depo (belgeden derlenmiş) |
| D4 | `bolumler/06-reklam-turleri-ve-hedef-yollari.md` (Threads, Durum, AN, dinamik kreatif) | depo | 2026-10-06 | Depo (belgeden derlenmiş) |
| D5 | `CLAUDE.md` (canlı kurallar: biçim gövdeden, paylaşımlı VPS, Türkçe yazı tipi, ikinci fonksiyon) | depo | 2026-10-06 | Depo |
