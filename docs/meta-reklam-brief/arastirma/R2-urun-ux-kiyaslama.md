# R2 — Reklam oluşturma ürünlerinin kıyaslaması (UX ve akış)

> **Yöntem:** Meta (Ads Manager'ın birleşik Advantage+ kurulumu, Facebook Sayfası ve Business Suite'te
> öne çıkarma, Instagram'da öne çıkarma, "otomatik reklamlar", AI iş asistanı), Google (Smart kampanya,
> Performance Max, Gemini destekli sohbetli kurulum, AI Max, Ads Advisor / Ask Advisor), TikTok (Promote,
> Smart+, Symphony), LinkedIn (Accelerate), site ve e-ticaret platformları (Shopify, Wix, Squarespace,
> HubSpot, Mailchimp, Canva Grow) ve uzman/ajans araçları (AdEspresso, Madgicx, Bïrch, Smartly.io,
> AdCreative.ai, Pencil, SOCi/Vendasta) için resmî yardım sayfaları, ürün duyuruları ve inceleme yazıları
> tarandı. Yaklaşık 60 web araması yapıldı ve **91 sayfanın metni okundu:** 33'ü Meta yardım merkezi
> makalesi (sayfalar JavaScript ile yüklendiği için WebFetch boş döndü; oturumdaki Meta Ads MCP'sinin salt
> okuma `ads_get_help_article` aracıyla okundu), 58'i WebFetch ile. Kaynak tablosunda atıf yapılan **108
> kaynak** var: 83'ü tam metin, 2'si depo bölümü, 1'i yalnız başlık/etiket, **22'si yalnız arama özeti**
> (tabloda "özet" diye işaretli). Tarih aralığı 2020–2026-10-06, ağırlık 2025–2026.
> API düzeyindeki Meta bilgisi yeniden aranmadı; `bolumler/01` ve `bolumler/04`ten alındı. Oturumun ortak
> web arama kotası araştırmanın sonunda doldu; son birkaç doğrulama doğrudan sayfa okumayla yapıldı.
> Hiçbir akış ilk elden (ekran ekran) denenmedi: adım sayıları yardım sayfalarındaki numaralı listelerden.
>
> **Güvenilirlik özeti:** Meta ve Google akışları resmî metinden (yüksek). TikTok ve LinkedIn'de
> varsayılanlar resmî, akış ayrıntıları kısmen sektör yazısından (orta). Shopify, Wix, HubSpot, Squarespace
> resmî yardım sayfalarından (yüksek). Uzman araçlarında kaynakların çoğu ürünün kendi sayfası ya da
> **rakip firmaların "inceleme" yazıları** (çıkar çatışması; düşük-orta).
>
> **Etiketler:** [Resmî-Meta] Meta'nın kendi metni · [Resmî-diğer] ürünün kendi resmî sayfası (Google,
> TikTok, LinkedIn, Shopify, Wix, HubSpot…) · [Sektör] uzman, ajans, haber ya da rakip ürün yazısı ·
> [Topluluk] forum/kişisel. Metinde `(K12 · Resmî-Meta)` biçimi kaynak tablosundaki satıra gider; URL ve
> tarih orada.

---

## Özet: yeni modül için ne demek

1. **Sektör "tek akış, otomasyon açık, bölüm bölüm geri alınır" modeline geçti.** Meta satış, potansiyel
   müşteri ve uygulama amaçlarında manuel/Advantage+ çatalını kaldırdı; her bölümde "Advantage+
   açık/kapalı" etiketi gösteriyor ve aynı "önerilen kurulumu" diğer amaçlara yayıyor (K10, K11, K17 ·
   Resmî-Meta). TikTok Smart+ Ekim 2025'ten beri kitle, bütçe, yerleşim ve kreatifi modül modül otomatik
   ya da manuel yapıyor (K67, K68 · Resmî-diğer). → Acemi ve Gelişmiş ayrı sayfa değil, **aynı taslağın
   aynı ekranları**; her bölümde otomasyonun durumu yazılı (Ö1).
2. **En sade akışlar "ne istiyorsun?" ile açılıyor; hedefi sistemin seçmesi ise bir anti-desen.**
   Instagram 3, Google Smart 4, TikTok Promote 5–6, Wix 2–3 hedef soruyor (K04, K48, K69, K88, K89). Meta
   Business Suite'te öne çıkarmada **"Otomatik" hedef varsayılan seçili gelebiliyor** ve Meta geçmiş
   etkinliğe bakıp hedefi kendisi seçiyor (K03 · Resmî-Meta). → Niyet kartı zorunlu seçim; "otomatik niyet"
   yok.
3. **Advantage+ kitle açıkken kesin sınır ile öneri ekranda ayrılmazsa kullanıcı yanılır.** Meta yaş ve
   cinsiyeti varsayılan olarak "öneri" sayıyor, önerinin dışına çıkabiliyor (örnek: "kadın" önerisi
   erkeklere de gidebilir); yalnız en düşük yaş, konum, dil ve hariç tutulan özel kitle kesin (K19, K20 ·
   Resmî-Meta). → Kitle ekranında **"Kesin sınırlar"** ve **"Meta'ya öneriler"** iki ayrı kutu; bağlayıcı
   karar 2'nin ekran karşılığı (Ö2).
4. **Konut (özel kategori) ile Advantage+ kitle aynı kampanyada olamıyor.** Meta konut, istihdam, finans
   ve siyasi kategorilere Advantage+ kitleyi açmıyor (K19) ve bu kampanyalarda yaş, cinsiyet, konum
   alanlarının **seçilebilir görünüp sonra hata ve ret getirebildiğini** yazıyor (K17 · Resmî-Meta). →
   Özel kategori sorusu niyet ekranına taşınmalı (README §7.3'te 6. adımdaydı); kararlar 2 ve 4'ün
   kesişimi kullanıcıya yeniden sorulmalı (Açık soru 1).
5. **Başarılı ürünlerde bütçe boş kutu değil: önerilen tutar + tahmini sonuç + gerekçe.** Meta öne
   çıkarma ve otomatik reklam "önerilen bütçe ve o bütçenin tahmini sonucu" (K01, K08), Meta Başarı
   Merkezi her önerinin yanında "neden bu bütçe? neden 7 gün?" (K09), Google Smart işletme türü ve konuma
   göre öneri (K50), Wix üç hazır seçenek + tahmini tık (K89), LinkedIn canlı tahmin paneli (K79). Ama
   Meta'nın kitle tahmini Advantage+ genişlemesini ve WhatsApp'ta yaşı bilinmeyenleri kapsamıyor (K27). →
   Öneri kartları gösterilir ama **hiçbiri seçili gelmez** (README §6.5), her kartta gerekçe ve "Meta'nın
   tahmini, garanti değil" (Ö4, Ö5).
6. **URL'den taslak üreten yapay zekâ standart oldu; büyük ürünlerin hiçbiri sessiz yayınlamıyor.** Google
   sohbetli kurulum (K45), LinkedIn Accelerate (K80, K81), Wix (K89), Canva Grow (K95) "öner → düzenle →
   onayla" ile bitiyor; Google'ın Ads/Ask Advisor'ı ve Shopify Autopilot her değişikliği insan onayına
   bağlıyor (K61, K62, K84). → AI taslağa yazar, panel aynı taslağı açar; onay kartı panelin onay ekranının
   aynısı (bağlayıcı karar 3, Ö8).
7. **"Yayın oranı" ya da "puan" başarı ölçüsü değil.** Google'ın sohbetli kurulum iddiası "KOBİ'ler
   İyi/Mükemmel reklam gücüyle yayın yapmaya %63 daha yatkın" (2024 duyurusunda aynı ölçü %42) (K45, K46);
   oysa ~20 bin hesaplık bağımsız analizde reklam gücü performansla ilişkili çıkmadı, "Mükemmel" reklamlar
   en kötü CPA'yı verdi (K66 · Sektör, Nisan 2026). Meta da kampanya ve fırsat puanının performansı
   yansıtmadığını kendisi yazıyor (K16, K24). → Advetics puan göstermez; **"Yayına engel / Uyarı / Öneri"**
   listesi (Ö6).
8. **Türkçe boşluk gerçek.** Google'ın sohbetli kurulumu İngilizce, Fransızca, İspanyolca, Almanca (K45);
   Ads Advisor ve Ask Advisor yalnız İngilizce (K61, K62); Meta AI iş asistanında kampanya kurma "2026
   içinde" geliyor, Türkçe desteği doğrulanamadı (K32–K34). → Türkçe, onay kartlı, panelle aynı taslağı
   paylaşan bir AI yüzü bugün piyasada karşılığı olmayan bir fark (Ö14).
9. **Ajans–müşteri onayı ayrı bir ürün katmanı olarak çözülmüş.** AdEspresso: markalı onay bağlantısı,
   onaylayanın hesabı gerekmiyor, onaylayan her ayarı ve önizlemeyi görüp tek tıkla yayınlıyor ya da notla
   reddediyor, "zorunlu onay" seçeneği var (K97). Shopify Autopilot: her "taktik" tek tek onaylanıyor ya da
   reddediliyor, üstünde aylık harcama hedefi ve korkuluklar (K84–K86). → TASARIM K3 kararı için hazır
   kalıp; onay yayından ÖNCEKİ kapı olduğu için tek adımlı yayın kararıyla çelişmez (Ö9).
10. **Sessiz varsayılanlar listesi uzun ve büyüyor.** Advantage+ creative'in bazı iyileştirmeleri
    varsayılan açık ve bir kısmı yalnız "gelişmiş önizleme"de kapatılabiliyor (K22, K23); görsel içindeki
    başlığı yeniden yazma 27 Temmuz 2026'dan beri varsayılan açık (K35 · Sektör); hariç tutulan yerleşime
    bütçenin %5'ine kadar harcama seçeneği var (K21); çoğaltma manuel kampanyayı Advantage+ açık kopyalıyor
    ve önerileri kendiliğinden uyguluyor (K29, K30); Google'da arama ortakları varsayılan dahil (K65),
    Smart kampanyada ağlardan çıkmak için destekle konuşmak gerekiyor (K49), AI Max sabitlenmiş öğeleri yok
    sayabiliyor (K59), DSA zorla AI Max'e taşınıyor (K60); LinkedIn kitle genişletme varsayılan açık (K77).
    → Her biri derleyici manifestosuna (README §2) ve onay ekranındaki "Meta'nın otomatik yaptıkları"
    listesine girer (Ö7).
11. **Yayın sonrası ekranın işi "durum + sebep + ne yapmalı".** Meta "Öğreniyor / Öğrenme sınırlı" +
    sebep ipucu + "son önemli düzenleme" sütunu (K25, K26); öne çıkarmada yayından sonra metin ve görsel
    değişmiyor, Instagram'da bütçe yalnız artırılabiliyor (K02, K06); öneriler "uygula / reddet" ile
    ilerliyor (K24, K84). → Durum çizelgesi + Türkçe sebep + eylem; öneri kartları; "yayından sonra
    değişmez" listesi onaydan önce (Ö7, Ö10).
12. **"Kolay ürünler" kapanıyor; sade akış ana nesnelerin üstüne kurulmalı.** Meta'nın anketli "otomatik
    reklamları" 2026'da kalkıyor (K07); Google 3 Ağustos 2026'dan beri API ile yeni Smart kampanya
    kurdurmuyor ve Wix akışını PMax'e taşıdı (K51, K52, K89). → Advetics'in Acemi yüzü platformun "basit
    ürününe" değil, kampanya / reklam seti / reklam + Advantage+ nesnelerine kurulmalı (README'nin yolu
    doğru). LinkedIn de Ekim 2025'te arayüz adlarını Meta'ya hizaladı (K83).

---

## Bulgular

### B1. Ürün kartları

Her kartta: adım sayısı · sorulanlar · otomatik/varsayılan · bütçe · önizleme · ön ayar · yapay zekâ ·
onay · yayın sonrası · şikâyetler. Uygulanmayan alan yazılmadı.

#### Meta

**M1 · Ads Manager, birleşik Advantage+ kurulumu (2025–2026)**
- **Adım:** amaç → kampanya → reklam seti → reklam → yayın; üç ekran, her birinde çok bölüm. Satış,
  potansiyel müşteri ve uygulama amaçlarında Advantage+ kurulumu kendiliğinden geliyor; "manuel özellikler
  hâlâ var" (K10 · Resmî-Meta). Trafik, bilinirlik ve etkileşime aynı "önerilen kurulum" yayılıyor (K17).
  Baştaki "otomatik mi manuel mi" çatalı Mayıs 2025'te kalktı (K106 · Sektör, özet; API tarafı K44).
- **Sorulan:** amaç; bütçe stratejisi (kampanya bütçesi önerili); satışta katalog; dönüşüm konumu ve olay;
  kitle kontrolleri (konum, en düşük yaş, dil, hariç özel kitle) ve kitle önerileri (yaş, cinsiyet,
  ayrıntılı hedefleme, dahil edilecek özel kitle); yerleşim; reklam biçimi, medya, metin, CTA, hedef adres,
  izleme (K15, K18, K19 · Resmî-Meta). Uygulama amacında kurulum daha da daraltılmış: hedefleme yalnız
  ülke, dil ve uygulama mağazası (cinsiyet, ilgi, özel kitle dahil etme yok), tek seferde 50 reklam (K14).
- **Otomatik / varsayılan:** Advantage+ kitle "uygunsa kendiliğinden" uygulanıyor; yaş ve cinsiyet
  varsayılan olarak öneri (K18, K20). Advantage+ yerleşim varsayılan (K21). Bölüm etiketi kuralları:
  kampanya bütçesi Advantage+'ı açık tutar; birden çok reklam setinde reklam seti bütçesi kapatır; öneri
  kutucuğunu kaldırıp "kitleyi sınırla" kapatır; yerleşim ya da cihaz hariç tutmak kapatır; en düşük yaşı
  25'e kadar yükseltmek ya da özel kitle hariç tutmak kapatmaz; hesap düzeyi kontroller durumu etkilemez.
  Sağ üstte ve akış boyunca açılan öneri pencereleri var (K11 · Resmî-Meta).
- **Bütçe:** kampanya bütçesi önerili. Ads Manager'daki günlük erişim ve sonuç eğrisi `delivery_estimate`
  ucundan (K28). Tahmini kitle büyüklüğü canlı güncelleniyor, ama "görecek kişi sayısı değil" ve Advantage+
  genişlemesini, WhatsApp'ta yaşı bilinmeyenleri kapsamıyor (K27 · Resmî-Meta).
- **Önizleme:** reklam önizlemesi + "gelişmiş önizleme": yerleşim sekmesi ve Advantage+ creative
  varyantlarının kartları (K23).
- **Ön ayar ve puan:** "önerilen kurulum"; taslak sırasında 0–100 **kampanya puanı** (öneri uyguladıkça
  artar, hata/uyarı düşürür); Meta'nın kendi notu: puan performansı yansıtmaz (K16).
- **Yapay zekâ:** kitle, yerleşim ve bütçe dağıtımı; Advantage+ creative: görselden animasyon, yapay zekâ
  müziği, metin bindirme, görsel ve arka plan üretimi, görsel üstündeki metni yeniden yazma, CTA'yı Meta'nın
  hazır ifadeleriyle değiştirip kaynaktan promosyon ifadesi ekleme (K22). Meta'nın kendi testlerinde
  satışta %9, potansiyel müşteride %14 maliyet iyileşmesi (K12, K13).
- **Onay:** yok; yayınlayan kişi tek.
- **Yayın sonrası:** inceleme → "Öğreniyor" (son önemli düzenlemeden sonraki haftada ~50 sonuç) →
  çıkamazsa **"Öğrenme sınırlı" + sebep ipucu** (küçük kitle, düşük bütçe, düşük teklif, açık artırma
  çakışması, seyrek olay, çok sayıda reklam) ve "son önemli düzenleme" sütunu (K25, K26). Hesap düzeyinde
  0–100 **fırsat puanı** ve öneriler; reddedilenler ayrı sekmede; "düşük puanlı kampanyayı kapatmayın" notu
  (K24).
- **Şikâyetler:** kara kutu, mevcut müşteriye harcama (K107 · Sektör, özet); yaş önerisinin aşılması
  (K41 · Sektör, özet); hariç tutulan yerleşime harcama (K21, K40); görsel metninin varsayılan olarak
  yeniden yazılması (K35).

**M2 · Facebook gönderisi öne çıkarma (Sayfa ve Business Suite)**
- **Adım:** gönderiyi seç → tek form → yayınla; Business Suite'te ek "zamanla" adımı (K01, K03 ·
  Resmî-Meta).
- **Sorulan:** Advantage+ creative (aç/kapa), ek iletişim yolu, özel reklam kategorisi, hedef, kitle
  (önerilen ya da yeni; Advantage+ kitle aç/kapa), reklam şeffaflığı (ödeyen/yararlanan), başlangıç, süre
  (önerilen süreler / bitiş tarihi / "sürekli"), günlük bütçe (önerilen ya da özel), yerleşim, ödeme.
- **Otomatik / varsayılan:** görsel ve metin gönderiden. **Hedefte "Otomatik" varsayılan seçili
  gelebiliyor; Meta geçmiş etkinliğe göre seçiyor** (K03). iOS uygulamasından öne çıkarmada Şubat 2024'ten
  beri %30 Apple hizmet ücreti (K01).
- **Yayın sonrası:** kitle, bitiş tarihi ve bütçe değişebilir; metin, görsel, video değişmez (yeni gönderi
  + yeni öne çıkarma). Oluştururken "günlük bütçe", düzenlerken "ömür boyu bütçe" (iki sayfa iki birim)
  (K01, K02).
- **Şikâyetler:** satış ve form için optimize edemiyor; bir sektör testinde Ads Manager'a göre tık başına
  ~3 kat pahalı (tek test, ticari çıkarlı kaynak, doğrulanmadı) (K38 · Sektör).

**M3 · Instagram'da öne çıkarma**
- **Adım:** gönderi → "Öne çıkar" → hedef → kitle → bütçe ve süre → ödeme → gözden geçir (K04, K05 ·
  Resmî-Meta).
- **Sorulan:** 3 hedef (profil ziyareti, site ziyareti, mesaj); kitle "Otomatik" (takipçilere benzer
  kişiler) ya da "Kendin oluştur" (konum, yaş, cinsiyet, ilgi); günlük ortalama bütçe; süre "ben durdurana
  kadar" ya da gün sayısı (K04, K05).
- **Otomatik:** akış ve hikâye dağıtımı kendiliğinden, biçim hikâyeye uyarlanıyor (K05).
- **Bütçe:** tahmini erişim gösteriliyor; Meta'nın önerisi en az 5 $ ve 6 günden uzun (K05).
- **Yayın sonrası:** çoğu reklam bir saat içinde incelenip başlıyor (K04). Hedef, kitle, kreatif
  değişmez; **bütçe yalnız artırılabilir**, azaltmak için reklamı bitirip yeniden kurmak gerekiyor (K06).
- **Şikâyetler:** "Otomatik" kitlenin konumdan bağımsız çalıştığı, yerel işletmenin reklamının başka
  eyalette gösterildiği örnek (2020, eski olabilir; bugünkü resmî metin konumdan söz etmiyor) (K39 ·
  Sektör).

**M4 · Otomatik reklamlar ("automated ads"), 2026'da kalkıyor**
- **Akış:** sayfadan "Reklam ver" → işletme ve müşteri sorularından oluşan anket → Meta'nın önerdiği hedef
  → 6'ya kadar reklam sürümü (metin ve CTA sayfadan önerilir) → "akıllı kitle" (işletmenin yakını + sayfayla
  ilgili ilgi alanları) → önerilen günlük bütçe ve tahmini sonucu → yerleşim → ödeme → "Planı başlat".
  **Bitiş tarihi yok**, sürekli çalışır; bildirimlerle "görseli yenile" gibi öneriler (K07, K08 ·
  Resmî-Meta).
- **Durum:** Meta 2026'da kaldırıyor, yeni oluşturma kapanıyor (K07, K08). Anketle niyet çıkarma ve
  bitişsiz çalıştırma deseni Meta'nın kendisi tarafından terk edildi; yerini ana akıştaki Advantage+ aldı.
- **Başarı Merkezi varyantı:** "işletme hedefini seç" → erişim, bütçe, süre önerisi; her önerinin yanında
  "neden?" bağlantısı (kitle çok mu büyük, neden 7 gün, neden bu bütçe). Bütçe dayanağı Ocak 2023 iç
  analizi (eski olabilir) (K09).

**M5 · Meta AI iş asistanı ve Ads MCP**
- Ekim 2025'te ABD'deki küçük işletmelerde başladı, Nisan 2026'da bütün reklamveren ve ajanslara beta
  (Ads Manager, Business Suite, destek merkezi). Yapabildikleri: soru-cevap, rapor, hesap sorunu çözme,
  harcama sınırı güncelleme, fırsat puanı önerileri; pilotta öneriyi uygulayanlarda sonuç başına maliyet
  %12 düşük (Meta'nın iddiası). Meta'nın Ocak 2026 yol haritası asistanı optimizasyon ve hesap desteği
  için anlatıyor (K31 · Resmî-Meta); Nisan 2026 açıklamasını aktaran haber **kampanya planlama ve
  kurmanın "2026 içinde" geleceğini** yazıyor (K32 · Sektör). Bazı sektör yazıları Mart 2026'da Ads
  Manager'a kampanya kuran ajanların geldiğini iddia ediyor (K109 · Sektör, özet). İkisi çelişiyor; Meta'yı
  aktaran Nisan haberi esas alındı, kurma özelliğinin Türkiye'de açılıp açılmadığı Açık soru 6.
- **Dil:** "yerel dil desteği" deniyor; resmî liste bulunamadı, ikincil kaynaklar İngilizce, İspanyolca,
  Fransızca, Almanca, Portekizce, Mandarin sayıyor. **Türkçe doğrulanamadı** (K33, K34 · Sektör).
- **Ads MCP:** oluşturma PAUSED, yayın ayrı araç ve açık onay; Instagram öne çıkarma aracının
  varsayılanları ABD hedefleme, ~5 $/gün, 6 gün, trafik amacı (K43 · Resmî-Meta, depo).
- **Yön:** Meta Haziran 2025'te 2026 sonuna kadar "ürün görseli ve bütçe ver, gerisini yapay zekâ yapsın"
  hedefini açıkladı (K42 · Sektör, haber, özet).

#### Google

**G1 · Smart kampanya (Akıllı mod)**
- **Adım:** resmî sayfada 22 numaralı tıklama, ~8 ekran: işletme profili ya da işletme adı → site
  (taranıyor) → hedef → reklam metni → (isteğe bağlı) arama düğmesi → anahtar kelime temaları → konum →
  bütçe → gözden geçir → dönüşüm etiketi → yayın (K48 · Resmî-diğer).
- **Sorulan:** 4 hedef (arama, site satışı ya da potansiyel müşteri, mağaza ziyareti, YouTube izlenme);
  metin siteden üretilir (3 başlık, 2 açıklama; sonradan 3–15 / 2–4) (K48, K49).
- **Otomatik / varsayılan:** yeni hesaplar Akıllı modda açılıyor, Uzman moda geçiş tek yönlü (2021, eski
  olabilir) (K53 · Sektör). Reklamlar Arama, Haritalar, YouTube, ortak siteler ve Görüntülü Reklam
  Ağı'nda; **ağlardan çıkmak için Google desteğiyle görüşmek gerekiyor** (K49 · Resmî-diğer). Konum:
  bölgedekiler + konuma özgü arama yapanlar (K49). Site bağlantıları ve varyant testi otomatik.
- **Bütçe:** işletme türü ve konumdaki ortalama tık hacmine göre öneri; aylık tavan günlük × 30,4; az tık
  gelirse yalnız gelen tık ödenir (K50 · Resmî-diğer, özet).
- **Durum:** 3 Ağustos 2026'dan itibaren API ile yeni Smart kampanya kurulamıyor; mevcutlar çalışıyor,
  önerilen yol PMax, Arama, Demand Gen (K51 · Resmî-diğer; K52 · Sektör, özet). Wix yeni Smart kampanya
  açmayı kapattı (K89).
- **Şikâyetler:** anahtar kelime ve arama terimi kontrolü zayıf (2021, eski olabilir) (K53).

**G2 · Performance Max**
- **Adım:** resmî 6 adım: hedef ve dönüşüm hedefleri → teklif → kampanya ayarları → öğe grubu → bütçe →
  gözden geçir ve yayınla (K55 · Resmî-diğer). Hesap hedefleri kendiliğinden dolduruluyor (K55). Öğe
  grubunda 15 başlık, 5 açıklama, görsel, logo, video; video verilmezse Google üretebiliyor (K57 · Sektör).
  Yalnız otomatik teklif.
- **Ortak platformlarda** (Shopify, WooCommerce, GoDaddy, BigCommerce, PrestaShop) akış birkaç alana
  iniyor: kampanya adı + günlük bütçe, bazı platformlarda kitle ve ürün (K56 · Resmî-diğer).
- **Yayın sonrası:** otomatik teklifin oturması 1–2 hafta, bazen 6 hafta (K54). 2025'te kampanya düzeyi
  negatif kelime, kanal raporu, marka hariç tutma eklendi (K57).
- **Şikâyetler:** kara kutu (kısmen giderildi) (K57).

**G3 · Gemini destekli sohbetli kurulum (Arama kampanyası)**
- **Akış:** yeni Arama kampanyası, reklam grubu ya da RSA düzenlerken açılıyor → açılış sayfası URL'si →
  yapay zekânın iş özeti (düzenlenir) → reklam grupları ve anahtar kelimeler, başlık ve açıklamalar, site
  bağlantıları ve görseller → kullanıcı her öneriyi onaylar ya da değiştirir → normal kampanya ekranları
  (K45 · Resmî-diğer).
- **Başarı ölçüsü ve çelişki:** güncel yardım sayfası "KOBİ'ler İyi/Mükemmel reklam gücüyle yayına %63 daha
  yatkın" diyor; Ocak 2024 duyurusunda aynı ölçü %42; Google ayrıca Zayıf'tan Mükemmel'e geçişi ortalama
  %12 daha fazla dönüşümle ilişkilendiriyor (K45, K46). Bağımsız analiz bunu desteklemiyor: reklam gücü
  performansla ilişkisiz, "Ortalama" reklamlar en düşük CPA'yı, "Mükemmel"ler en yükseğini verdi (K66 ·
  Sektör). Yani ölçülen "yayın oranı + puan", sonuç değil.
- **Dil ve kapsam:** İngilizce, Fransızca, İspanyolca, Almanca; hassas sektörlerde yok; Google önerilerin
  yanlış olabileceğini, doğrulamanın reklamverende olduğunu yazıyor (K45). Türkçe yok (K47 · Sektör, 2024).

**G4 · AI Max for Search**
- **Akış:** Arama kampanyasında isteğe bağlı tek anahtar; açılınca arama terimi eşleme + öğe optimizasyonu
  (metin özelleştirme + nihai URL genişletme) birlikte açılır, tek tek kapatılabilir. Kontroller: marka
  dahil/hariç, ilgi konumları, URL hariç tutma (K58 · Resmî-diğer).
- **Sessiz davranış:** URL genişletme açıkken **sabitlenmiş RSA öğeleri, daha ilgili bir URL seçilirse
  kullanılmıyor** (K59).
- **Zorla geçiş:** DSA, otomatik oluşturulan öğeler ve kampanya düzeyi geniş eşleme kullananlar AI Max'e
  otomatik yükseltiliyor (ACA ve geniş eşleme Eylül 2026; DSA Şubat 2027'ye ertelendi); DSA'da üç özellik de
  açık geliyor (K60 · Resmî-diğer).
- **Rapor:** arama terimleri raporunda "AI Max" eşleme türü ve kaynak sütunu (K58).

**G5 · Ads Advisor ve Ask Advisor**
- Ads Advisor Aralık 2025'te bütün **İngilizce** hesaplarda: öneri, anahtar kelime ve öğe üretimi, düşüş
  teşhisi, politika reddi çözümü; **değişiklik kullanıcı onayıyla** (K61 · Resmî-diğer).
- Ask Advisor (20 Mayıs 2026): Ads, Analytics, Merchant Center ve DV360 tek ajanda; kampanya kurabiliyor
  (ör. Merchant Center'dan ürün bilgisini çekip yeni kampanya); her değişiklik insan onayıyla; beta, yalnız
  İngilizce (K62 · Sektör).

**G6 · Otomatik uygulanan öneriler**
- Hesap düzeyinde; reklam/öğe, teklif, anahtar kelime/hedefleme ve ölçüm önerileri otomatik
  uygulanabiliyor (K63 · Resmî-diğer). Resmî sayfa yeni hesaplardaki varsayılanı yazmıyor; sektör yazıları
  reklamverenlerin önemli kısmının farkında olmadan açık bıraktığını ve özelliğin e-postayla yeniden
  açılabildiğini söylüyor (K64 · Sektör, özet).

#### TikTok

**T1 · Promote (uygulama içi öne çıkarma)**
- **Adım:** 5: video seç → hedef → kitle → bütçe ve süre → öde ve başlat (K69 · Resmî-diğer).
- **Sorulan:** hedef: video izlenme, takipçi, site ziyareti, profil ziyareti, mesaj, LIVE izleyici; kitle:
  TikTok'un varsayılanı ya da özel (konum, ilgi, yaş, cinsiyet) (K69; profil, mesaj ve konum 2023'te
  eklendi, K70).
- **Bütçe:** günlük; en az ~3 $/gün (hedefe göre değişiyor), 1–7 gün; ödemeden önce **özet ekranı**: hedef,
  kitle, bütçe, süre ve tahmini erişim (K71 · Sektör). iPhone'da ödeme TikTok jetonuyla (2021, eski
  olabilir) (K73).
- **Yayın sonrası:** inceleme genelde 24, en çok 48 saat (K71); sonuç ekranında izlenme, beğeni, yorum,
  paylaşım, site tıklaması, kitle dağılımı (K73).
- **Şikâyetler:** dönüşüm optimizasyonu yok; izlenme sayısı sonucu gölgeliyor (K72 · Sektör, Ekim 2026).

**T2 · Smart+ ve Symphony**
- Smart+ Ekim 2025'ten beri tam / kısmi / manuel; kitle, bütçe, yerleşim ve kreatif **modül modül**
  açılıp kapanıyor (K67 · Resmî-diğer). Mayıs 2026: tek birleşik kreatif onay akışı, kreatif düzeyinde
  rapor, yapay zekâ "Özet"i (K68 · Resmî-diğer). Sektör yazıları kreatif kombinasyonlarının yayından önce
  önizlenebildiğini de yazıyor (özet; resmî duyuruda geçmiyor).
- Symphony: metinden, görselden ya da referanstan video; avatar; çeviri ve dudak senkronu; Smart+ içinde
  otomatik iyileştirmeler (yeniden boyutlandırma, müzik yenileme, çeviri, seslendirme) (K67, K76).
  Symphony Agent (Haziran 2026): marka hedefini sohbete yaz, reklam üretilsin; yapay zekâ etiketi ve
  görünmez filigran (K75 · Sektör, özet).
- Ads Manager'da "Basit mod / Özel mod" iki ayrı yüz olarak duruyordu; uzmanlar özel modu öneriyordu
  (2022, eski olabilir) (K74).

#### LinkedIn

**L1 · Accelerate**
- **Akış:** amaç + "Accelerate mi Klasik mi" → ürün URL'si → yapay zekâ site, şirket sayfası ve hesabın
  geçmiş reklamlarından kreatif, kitle ve teklif önerir → kullanıcı metin, görsel ve hedeflemeyi
  (coğrafya, şirket hariç tutma) düzenler → yayın; "5 dakikada" (K80 · Resmî-diğer, özet; K81 · Sektör,
  2024). 2026 incelemesi dört girdi sayıyor: URL, hedef, kitle tarifi, bütçe (K82 · Sektör).
- **Varsayılan:** kitle genişletme uygun reklam setlerinde **kendiliğinden açık** (K77 · Resmî-diğer).
  Audience Network'ün varsayılanı resmî sayfada yazmıyor (K78); sektör yazısı Accelerate'te açık geldiğini
  ve kontrolün sınırlı olduğunu söylüyor (K82). Teklif: en çok teslimat ya da maliyet tavanı (K80).
- **Bütçe:** Campaign Manager'da kurulum boyunca **canlı tahmin paneli**: kitle büyüklüğü, segment
  dağılımı, 1/7/30 günlük öngörülen harcama, en çok harcama, ana sonuç ve maliyeti; "tahmin garanti değil"
  (K79 · Resmî-diğer, özet).
- **İddia ve eleştiri:** LinkedIn'e göre %52 düşük eylem başı maliyet (2024); bağımsız 2026 incelemesi B2B'de
  nitelikli lead başına %20–40 daha pahalı ve hesap bazlı pazarlamaya uygun değil diyor (K81, K82).
- **Terminoloji:** Ekim 2025'ten beri arayüzde "Kampanya grubu" → "Kampanya", "Kampanya" → "Reklam seti";
  API değişmedi (K83 · Sektör, özet).

#### Site ve e-ticaret platformları

**P1 · Shopify: Campaign Autopilot (Haziran 2026), Google & YouTube, Audiences**
- **Autopilot:** kanalları bağla (Meta, Shop Campaigns, Shopify Messaging; Microsoft eklendi; Google yok)
  ve korkulukları koy (aylık harcama hedefi; marjlı getiri hesabı için ürün maliyetleri; kanal başına en az
  günlük bütçe; sektör yazılarına göre bir de ROAS hedefi) → sistem
  "taktik" önerir → **her taktik tek tek onaylanır ya da reddedilir** → Meta'da Advantage+ kampanya kurulur,
  ürünler ayrı bir Meta kataloğuna tek yönlü senkronlanır, ölçüm CAPI ile → bütçe performansa göre kanallar
  arasında taşınır (K84, K85 · Resmî-diğer; K86 · Sektör). Resmî sayfa Autopilot'un **aylık bütçeyi bazı
  durumlarda aşabileceğini** yazıyor (K84). Rapor Autopilot panosunda, ayrıntı Ads Manager'da; kreatif
  üretmiyor, rapor kanal düzeyinde; erken erişim, ücretli planlarda ücretsiz (K86).
- **Google & YouTube:** PMax, Merchant Center akışında ödeme + günlük bütçe + kampanya adı (K56).
- **Audiences:** yalnız Plus + Shopify Payments + ABD/Kanada; alıcı listeleri reklam hesaplarına kendiliğinden
  aktarılıyor, ~24 saatte hazır (K87 · özet).

**P2 · Wix: Facebook & Instagram Reklamları ve Google Ads**
- **Meta (5 adım):** hedef (satışları artır / mağaza satışı / potansiyel müşteri; seçenekler kurulu
  uygulamalara göre değişiyor) → varlık bağlantısı (Sayfa, Business hesabı, Pixel/CAPI, aynı sayfaya bağlı
  Instagram) → hedef sayfa + hedefleme ("Yapay zekâ hedefleme (önerilen)": yalnız ülke seçilir; ya da özel:
  konum, cinsiyet, yaş, ilgi) → içerik (mağaza kataloğundan otomatik karusel ya da tek görsel/video; metin
  sınırları; canlı önizleme) → hazır ya da özel günlük bütçe; aylık abonelikle reklam kredisi, içinde
  Wix'in %15 ücreti → Wix ve Meta incelemesi 72 saat (K88 · Resmî-diğer).
- **Google (7 adım, PMax):** hedef (lead / satış) → hedef sayfa, tek dil, konum (en çok 10 şehir/posta kodu
  ya da adres + yarıçap), zamanlama ("her zaman" önerili), arama düğmesi → en çok 10 arama teması (yapay
  zekâ üretebilir) → metinler (yapay zekâ önerir) → görseller (yükle ya da yapay zekâyla üret) → **3 hazır
  bütçe seçeneği: ortalama günlük harcama + tahmini tık**, özel tutarda da tahmin → ödeme. Düzenlemeler
  arasında 14 gün beklenmesi öneriliyor; ücret bir önceki ayın tıklarına göre, aylık tavan günlük × 30,4
  (K89 · Resmî-diğer).
- **Ders:** kullanıcıya platformun dilini değil kendi işinin dilini (satış, lead) soruyor; eksik bağlantıyı
  akışın içinde çözüyor.

**P3 · Squarespace:** yerleşik reklam kurucu yok; ürün senkronu ve Meta katalog reklamı bağlantısı var;
pazarlama panosu Şubat 2025'te kaldırıldı (K90 · Resmî-diğer).

**P4 · HubSpot Ads:** reklam türü (etkileşim, site ziyareti, lead) → hesap ve sayfa → kreatif (yapay
zekâyla metin ve başlık) → hedefleme (CRM listeleri, benzer kitle, yeniden hedefleme, hariç tutma, özel
kategori) → bütçe (günlük/toplam) ve takvim → **CRM otomasyonu** (lead'i listeye ekle, iç bildirim, iş akışı)
→ yayınla; taslak kaydedilip sürdürülebiliyor; lead reklamı için birincil bağlı kullanıcının Meta
şartlarını kabul etmiş olması ön koşul (K91 · Resmî-diğer, Eylül 2026). Farkı, reklamdan CRM'e kapanan
döngü.

**P5 · Mailchimp:** Facebook/Instagram ve Google yeniden pazarlama reklamı satın alma şartları hâlâ
yürürlükte (Ağustos 2024), ama ürün sayfası bugün yalnız "Meta Lead Ads" bağlantısını gösteriyor;
özelliğin bugünkü durumu doğrulanamadı (K92, K93 · Resmî-diğer).

**P6 · Canva Grow (Ekim 2025; 2.0 Haziran 2026):** URL ya da istem + marka bilgisi → statik ve video reklam
varyantları → **toplu yayın: kreatifi Meta, TikTok ve LinkedIn'deki mevcut kampanyalara basıyor; amaç,
bütçe, kitle kurmuyor** → çok platformlu içgörü, yapay zekâ reklam etiketleme (yalnız Business/Enterprise)
→ performansa göre "otomatik tazeleme" varyantları (K95, K96 · Sektör). Eleştiri: etiketler korelasyon
gösterir, nedensellik değil; tek tedarikçiye bağımlılık (K96).

#### Uzman ve ajans araçları

- **U1 · AdEspresso (Hootsuite):** bölünmüş test için değişkenler seçilir, kombinasyonlar otomatik üretilir.
  **Kampanya onayı:** 5. adımda "onay iste" → bağlantı ya da e-posta (ajansın logosu, şirket ve isteyen
  adıyla markalı; onaylayanın hesabı gerekmez) → onaylayan hedeflemeden takvime, bütçeden reklam
  önizlemesine her şeyi görür → **tek tıkla yayınlar** ya da notla reddeder → reddedilen kampanya
  düzenlenip yeniden onaya gider; "zorunlu onay" belirli bir kişinin onayını şart koşar (K97 ·
  Resmî-diğer). Kapsam çelişkili: bir 2026 incelemesi "yalnız Meta" diyor, başka sektör yazıları Google'ı
  da sayıyor (K98 · Sektör).
- **U2 · Madgicx:** Meta üstünde "yapay zekâ medya alıcısı": hazır kitle kümeleri, günlük öneriler ve tek
  tıkla uygulama, kreatif üretici (K100 · Sektör, özet).
- **U3 · Bïrch (eski Revealbot, Ekim 2024'te ad değiştirdi):** 15 dakikada bir koşan kural motoru; toplu
  başlatıcı (reklam seti başına 50 reklam, UTM makroları, **yayın öncesi reddedilme riski uyarısı**); eşik
  tabanlı gönderi öne çıkarma kuralları (K101 · Sektör, özet).
- **U4 · Smartly.io:** şablon, dinamik görsel, yapay zekâ stüdyosu; ürün beslemesinden otomatik üretilen
  kampanya değişiklikleri için **inceleme aşaması**; kurumsal yönetişim (K102 · Sektör, özet).
- **U5 · AdCreative.ai:** kreatif üretip "dönüşüm olasılığı puanı" veriyor (iddia %90+ doğruluk); bağımsız
  yorum: varyant sıralamaya yarar, A/B testinin yerini tutmaz (K103 · Sektör, özet).
- **U6 · Pencil (Brandtech):** marka kılavuzu belgelerini içe alıyor (logo yeri, kaçınılacak kelimeler),
  tahmini performans puanı veriyor; bir ya da birden çok kişinin açık onayı olmadan çıkış yok (K104 ·
  Sektör, özet).
- **U7 · Çok lokasyonlu ve beyaz etiketli araçlar (SOCi, Vendasta, PromoRepublic):** merkezin onayladığı
  şablon ve kreatif kütüphanesi, yerel ekip bu sınırlar içinde kendi yayınlıyor; SOCi'nin önerdiği politika
  şablonunda fiyat, güvenlik ya da rakip içeren içerik bölge yöneticisinin onayına gidiyor; markalı müşteri
  portalı (K99, K105 · Sektör).

### B2. Yan yana: akış özellikleri

| Ürün | İlk soru | Ekran/adım | Bütçe nasıl soruluyor | Tahmin | Yapay zekâ nerede | Onay | Yayından sonra |
|---|---|---|---|---|---|---|---|
| Meta Ads Manager (Advantage+) | Amaç | 3 ekran, çok bölüm | Kampanya bütçesi önerili | Günlük sonuç eğrisi, kitle büyüklüğü | Kitle, yerleşim, bütçe, kreatif iyileştirme | Yok | Öğrenme durumu + sebep, fırsat puanı |
| Facebook öne çıkarma | (Gönderi) → hedef | 1 form | Önerilen günlük ya da özel | Var | "Otomatik" hedef, Advantage+ creative | Yok | Kitle/bütçe/bitiş değişir, kreatif değişmez |
| Instagram öne çıkarma | (Gönderi) → 3 hedef | 4 ekran | Günlük ortalama; ≥5 $ ve >6 gün önerisi | Tahmini erişim | "Otomatik" kitle | Yok | Yalnız bütçe artışı ve süre |
| Meta otomatik reklam (kalkıyor) | Anket | Anket + 1 form | Önerilen + tahmin | Var | Hedef, metin, kitle önerisi | Yok | Bitişsiz, bildirimli |
| Google Smart | İşletme + site | ~8 ekran | İşletme türü + konuma göre öneri | Tık | Metin, site bağlantısı, varyant | Yok | Otomatik yönetim |
| Google PMax | Hedef | 6 adım | Günlük | Simülatörler | Öğe üretimi, teklif, yerleşim | Yok | Öğrenme 1–6 hafta |
| Google sohbetli kurulum | URL | Sohbet + ekranlar | — | — | Özet, kelime, metin, görsel | Kullanıcı her öneriyi onaylar | — |
| TikTok Promote | (Video) → hedef | 5 adım | Günlük, ~3 $ taban, 1–7 gün | Tahmini erişim | Varsayılan kitle | Yok | Basit metrikler |
| TikTok Smart+ | Amaç | Tek akış, modül anahtarları | — | — | Kitle, bütçe, yerleşim, kreatif | Kreatif onay akışı | Yapay zekâ özeti |
| LinkedIn Accelerate | Amaç + URL | ~4 girdi | Bütçe girdisi | Canlı tahmin paneli | Kreatif, kitle, teklif | Kullanıcı düzenler | Otomatik optimizasyon |
| Shopify Autopilot | Kanal + korkuluk | Kurulum + sürekli | Aylık harcama hedefi | — | Taktik önerisi, bütçe taşıma | **Her taktik onay/ret** | Taktik akışı |
| Wix (Meta / Google) | İşin hedefi | 5 / 7 adım | Hazır ya da özel; Google'da **3 seçenek + tahmini tık** | Google'da var | Hedefleme, tema, metin, görsel | Meta'da Wix + Meta incelemesi | Düzenleme arası 14 gün |
| HubSpot Ads | Reklam türü | ~6 bölüm | Günlük ya da toplam | — | Metin | Yok (taslak var) | CRM otomasyonu |
| Canva Grow | URL ya da istem | 4 aşama | **Sormuyor** (mevcut kampanya) | — | Kreatif, etiketleme, tazeleme | — | Tazeleme önerileri |
| AdEspresso | Kampanya kurulumu | 5 adım | Kurulumda | — | Varyant üretimi | **Markalı müşteri onayı** | Test raporu |

### B3. Desen kütüphanesi (iyi desenler)

Biçim: **ad** · nerede görüldü · neden işe yarıyor · Advetics'e uyarlama.

- **D1 · Niyetle aç, tekniği sakla.** Instagram (3 hedef), Smart (4), TikTok Promote (5–6), Wix (2–3), Meta
  Başarı Merkezi "işletme hedefini seç" (K04, K48, K69, K88, K89, K09). Kullanıcı kendi işinin sonucunu
  seçiyor; amaç–optimizasyon–hedef eşlemesi sistemde kalıyor. → README §5.3 niyet sözlüğü; en sade ürünler
  3–5 seçenek gösteriyor, ilk turda 6'yı geçmemek yerinde.
- **D2 · Bölüm başına otomasyon anahtarı ve görünür durum.** Meta'nın bölüm etiketi (K11), TikTok Smart+
  modülleri (K67, K68), LinkedIn Accelerate/Klasik (K80). "Hepsi ya da hiç" kararını yerelleştiriyor;
  kullanıcı neyi otomasyona bıraktığını her bölümde görüyor. → Acemi ve Gelişmiş aynı ekran; her bölümde
  "Meta seçiyor" / "Sınırladın" durumu.
- **D3 · Kesin sınır ile öneriyi ayıran dil.** Meta'nın "kitle kontrolleri" ve "kitle önerileri" ayrımı
  (K19, K20). Hangi seçimin bağlayıcı olduğunu söylüyor; Advantage+ kitle açıkken tek dürüst anlatım. → İki
  kutu (Ö2).
- **D4 · URL'den taslak, kullanıcı editör.** Google sohbetli kurulum (K45), LinkedIn Accelerate (K80, K81),
  Smart'ın site taraması (K48), Wix (K89), Canva Grow (K95). Boş form yerine düzeltilecek bir taslak; ilk
  dakikadaki terk etmeyi azaltıyor. → Marka Merkezi + site adresi → metin önerisi; her öneri "öneri"
  rozetli, kullanıcı kabul etmeden kesinleşmiyor.
- **D5 · Önerilen bütçe + tahmini sonuç + "neden?".** Meta öne çıkarma ve otomatik reklam (K01, K08),
  Başarı Merkezi'nin "neden bu bütçe?" bağlantıları (K09), Smart (K50), Wix'in üç seçeneği (K89),
  Instagram'ın ≥5 $ / 6 gün önerisi (K05). Bütçeyi bilmeyen için çapa; gerekçe güven veriyor. → Üç kart
  (Meta tahmini + gerekçe), hiçbiri seçili gelmez.
- **D6 · Canlı tahmin paneli.** LinkedIn tahmin paneli (K79), Meta günlük sonuç eğrisi ve kitle büyüklüğü
  (K27, K28). Her seçimin etkisi anında görünüyor. → Sağda kalıcı "Plan ve tahmin" paneli; tahmin yoksa
  "Meta tahmin vermedi"; kapsamadıkları yazılı.
- **D7 · Yayından önce eksik listesi.** Meta kampanya puanının hata/uyarı kısmı (K16), Bïrch'ün yayın öncesi
  ret uyarısı (K101). Sorun yayından önce düzeltiliyor. Ama puan biçimi yanıltıcı (A10). → "Yayına engel /
  Uyarı / Öneri" üç seviye, puan yok.
- **D8 · Ödemeden önce tek ekranda tam özet.** TikTok Promote'un özet ekranı (K71), AdEspresso'nun
  onaylayan görünümü (K97), Smart'ın "gözden geçir"i (K48). → README §6.3-1 "tam plan", çözülmüş
  varsayılanlar dahil.
- **D9 · Yerleşim başına gerçekçi önizleme, varyantlar görünür.** Meta gelişmiş önizleme (K23), Wix canlı
  önizleme (K88), TikTok Smart+ kreatif onayı (K68). → `generatepreviews` ile akış, hikâye, Reels; yapay
  zekâ varyantları tek tek gösterilir.
- **D10 · Hesapsız, markalı onay bağlantısı.** AdEspresso (K97); Pencil'ın açık onayı (K104); Smartly'nin
  inceleme aşaması (K102). Ajans–müşteri yazışmasını sistemin içine alıyor, iz bırakıyor, müşteriye panel
  öğretmeyi gerektirmiyor. → TASARIM K3 için hazır kalıp (Ö9).
- **D11 · Korkuluklu otomasyon.** Shopify Autopilot'un aylık harcama hedefi, kanal tabanı ve marj verisi
  (K84, K86); Meta'nın
  hesap kontrolleri (en düşük yaş, hariç konum, yerleşim; Advantage+ durumunu bozmuyor) (K11, K21); merkezin
  onaylı şablonları (K105). Otomasyon serbest, sınırı insan koyuyor. → Workspace düzeyinde "değişmez
  kurallar" (en düşük yaş, hariç bölgeler, yasal uyarı) ve bekçi.
- **D12 · Öneriyi "taktik" olarak sun: onayla / reddet / neden.** Shopify (K84), Google Ads Advisor (K61),
  Meta fırsat puanının reddedilenler sekmesi (K24), Madgicx'in tek tıkla uygulaması (K100). Optimizasyonu
  küçük kararlara bölüyor; reddedilen kaybolmuyor. → Yayın sonrası öneri kartı; T katmanı hazırlar, C
  katmanı onaylar (README §6.2).
- **D13 · Durum + sebep + yapılacak iş.** Meta "Öğrenme sınırlı" ipucu ve "son önemli düzenleme" sütunu
  (K25, K26). "Neden sonuç yok?" sorusuna ekran cevap veriyor. → README §7.5 ve `emptyReason` deseni.
- **D14 · Önce organikte kanıtla, sonra öne çıkar.** Instagram'ın "önce organik kitle" tavsiyesi (K04),
  TikTok'ta "kazananı öne çıkar" (K71), Bïrch'ün eşik kuralları (K101). → Akıllı Boost'un mantığı; niyet 8.
- **D15 · Taslak her zaman sürdürülür.** HubSpot taslağı (K91), Ads Manager'da "kapat, sonra bitir" (K15). →
  README §7.2-7.
- **D16 · Eksik bağlantıyı akışın içinde çöz.** Wix'in 2. adımı (K88), HubSpot'ta lead şartı ön koşulu
  (K91), Shopify'da Business Manager gereksinimi (K84). Kullanıcı akıştan atılmıyor, eksik olan
  isteniyor. → README §5.4 ön koşulları ilk ekranda, üç hâlli.
- **D17 · Platformlar arası ortak ad.** LinkedIn'in Ekim 2025'te Meta'ya hizalanması (K83). Platform
  değiştiren kullanıcı aynı kelimeyi görüyor. → LinkedIn etiketleri arayüzün bugünkü adlarıyla ("Kampanya /
  Reklam seti") kontrol edilmeli (Açık soru 8).
- **D18 · Kreatif tazeleme döngüsü.** Canva Grow'un otomatik tazelemesi (K95), Meta otomatik reklamlarındaki
  "görseli yenile" bildirimi (K07), Bïrch'ün yorgunluk tespiti (K101). → `creative_fatigue` sinyali gelince
  "yeni varyant taslağı" önerisi; yayın yine onaylı.

### B4. Anti-desenler (sessiz varsayılanlar ve yanıltan sadeleştirmeler)

- **A1 · Hedefi sistem seçer.** Meta öne çıkarmada "Otomatik" hedef varsayılan seçili gelebiliyor (K03 ·
  Resmî-Meta). Kullanıcı neyin optimize edildiğini bilmiyor; aynı içerik iki müşteride farklı hedefe
  gidiyor, hata yok. **Kural:** niyet zorunlu, "otomatik niyet" yok.
- **A2 · Konumu belirsiz varsayılan kitle.** Meta Ads MCP'de Instagram öne çıkarma varsayılanı ABD (K43);
  Instagram "Otomatik" kitlesinin konumdan bağımsız çalıştığı yerel işletme örneği (2020, eski olabilir;
  K39); Smart'ta "bölgede olan + konumla ilgilenen" (K49). **Kural:** konum boş geçilemez; "Bütün Türkiye"
  bile açık bir seçim.
- **A3 · Öneriyi kontrol sanmak.** Advantage+ kitlede yaş ve cinsiyet varsayılan öneri, Meta önerinin
  dışına çıkabiliyor (K19, K20); sektör örneği: yaş üst sınırı önerisinin aşılması (K41). **Kural:**
  kesin/öneri ayrımı ekranda; yaş kesin olmak zorundaysa "en düşük yaş" kontrolü, gerekirse Gelişmiş'te
  Advantage+ kitle kapatılır ve rozet "Sınırladın" olur.
- **A4 · Kreatifi varsayılan olarak değiştiren yapay zekâ.** Advantage+ creative'in bazı iyileştirmeleri
  varsayılan açık, medya ve metin "ayarlanabilir"; bazı iyileştirmeler yalnız gelişmiş önizlemede
  kapatılabiliyor, yani ayar iki yerde (K22, K23 · Resmî-Meta). Katalogla ürün etiketi varsayılan açık
  olabiliyor; CTA'ya kaynaktan promosyon ifadesi eklenebiliyor (K22). Görsel içindeki başlığı yeniden
  yazma 27 Temmuz 2026'dan beri varsayılan açık, 8'e kadar varyant, test yayından sonra (K35 · Sektör;
  K36). **Kural:** README §2 "her özellik açıkça OPT_OUT" + geri okuma; açmak müşteri onayıyla.
- **A5 · "Hariç tuttum" sanılan yerleşime harcama.** "Hariç tutulan yerleşimlere sınırlı harcama"
  seçeneği yerleşim başına bütçenin %5'ine kadar (K21 · Resmî-Meta); sektör yazısı satış ve lead
  kampanyalarında kutunun varsayılan işaretli geldiğini söylüyor (K40 · Sektör). **Kural:** Gelişmiş'te
  manuel yerleşim seçilirse bu alan açıkça yazılır ve ekranda gösterilir.
- **A6 · Çoğaltma kopya değil.** Manuel kurulmuş kampanyalar Advantage+ açık çoğaltılıyor; "önerilerle
  çoğalt" kampanya yapısını (reklam setlerini birleştirme, zayıf reklamı kapatma), kitleyi, kreatifi,
  yerleşimi, teklifi ve takvimi kendiliğinden değiştiriyor, geliştirme aşamasındaki öneriler de
  uygulanabiliyor; çoğaltılan reklama sonradan eklenen yerleşimler de geliyor (K29, K30 · Resmî-Meta).
  Advantage+ kitlesi olmayan kampanya çoğaltılınca kitle kendiliğinden açılıyor (K18). **Kural:** Advetics'te
  "kaynaktan yeni" farkları ekranda listeler; Meta'nın çoğaltma ucu kullanılırsa geri okuma zorunlu.
- **A7 · Sessiz ağ ve kitle genişlemesi.** Google Arama'da arama ortakları varsayılan dahil ve site düzeyinde
  rapor yok (K65 · Resmî-diğer); Görüntülü Reklam Ağı kutusunun da işaretli geldiğini sektör yazıyor (K108 ·
  özet); Smart'ta ağlardan çıkmak için destekle görüşmek gerekiyor (K49); LinkedIn kitle genişletme
  varsayılan açık (K77), Audience Network sektöre göre açık (K82); Meta'da Advantage+ yerleşim varsayılan
  (K21). **Kural:** her "dahil" ekranda yazılır; Advetics'in açtığı nesnede kararlar açıkça gönderilir.
- **A8 · Onaysız uygulanan öneri ve zorla yükseltme.** Google'ın otomatik uygulanan önerileri (K63, K64);
  DSA, otomatik öğe ve geniş eşlemenin AI Max'e zorla taşınması (K60); Meta'nın "önerilerle çoğalt"ı (K29).
  **Kural:** Advetics hiçbir öneriyi onaysız uygulamaz; Meta'nın kural motoruna yazmaz (README §6.8).
- **A9 · Kullanıcının kilidini ezen otomasyon.** AI Max URL genişletmesinde sabitlenmiş öğeler yok sayılıyor
  (K59); Advantage+ kitlede öneri aşılıyor (K19). **Kural:** kullanıcının sabitlediği her şey "kontrol"dür;
  otomasyon onu ezecekse ekranda söylenir ya da o otomasyon kapatılır.
- **A10 · Puanı başarı sanmak.** Google sohbetli kurulumun başarı ölçüsü "iyi reklam gücüyle yayın" (K45),
  reklam gücü performansla ilişkisiz (K66); Meta kampanya ve fırsat puanı performansı yansıtmıyor (K16, K24);
  kreatif "dönüşüm puanı" (K103). **Kural:** Advetics puan göstermez; ölçü niyet satırının sonucu.
- **A11 · Tahmini gerçek sanmak.** Meta kitle tahmini görecek kişi sayısı değil; Advantage+ genişlemesini ve
  WhatsApp'ta yaşı bilinmeyenleri kapsamıyor (K27, K20). **Kural:** "Meta'nın tahmini, garanti değil" +
  kapsamadıkları; tahmin yoksa boş alan değil "tahmin yok".
- **A12 · Yayından sonra değişmeyeni önceden söylememek.** Instagram'da hedef, kitle, kreatif değişmez, bütçe
  yalnız artar (K06); Facebook'ta metin ve görsel değişmez (K02). **Kural:** onay ekranında "Yayından sonra
  değişmez" listesi.
- **A13 · Aynı işin dört girişi, dört kuralı.** Meta'da öne çıkarma Sayfa'dan, Business Suite'ten,
  Instagram uygulamasından ve Ads Manager'dan yapılıyor; oluştururken günlük, düzenlerken ömür boyu bütçe;
  Instagram'da bütçe azaltılamıyor, Facebook'ta azaltılabiliyor; Facebook'un iOS uygulamasından reklam
  düzenlenemiyor (K01, K02, K06).
  **Kural:** tek giriş, tek derleyici, tek kural (README §5.1, §7.2-1).
- **A14 · Tavanı aşabilen otomasyon.** Shopify Autopilot aylık bütçeyi bazı durumlarda aşabiliyor (K84);
  Meta'da günlük bütçe %75 esnek (README §3b-4). **Kural:** tavanın sert mi esnek mi olduğu ekranda; bekçi
  haftalık/aylık toplamla.
- **A15 · Seçilebilir görünüp reddedilen alan.** Özel kategori kampanyalarında yaş, cinsiyet ve konum
  seçilebilir görünüp hata ve ret getirebiliyor (K17 · Resmî-Meta). **Kural:** kısıt girişte uygulanır; alan
  ya hiç gösterilmez ya kilitli ve gerekçeli.
- **A16 · Kolay ürüne bağlanmak.** Meta otomatik reklamları kalkıyor (K07); Smart kampanya API ile yeni
  kurulamıyor (K51, K52); Wix akışını PMax'e taşımak zorunda kaldı (K89). **Kural:** Acemi yüzü ana nesnelere
  kurulur.
- **A17 · Görünürlüğü sonuç diye sunmak.** Promote ve öne çıkarma araçlarında izlenme ve etkileşim öne
  çıkıyor, dönüşüm optimizasyonu yok (K72, K38). **Kural:** raporun ilk satırı niyetin sonucu.

**Sessiz varsayılanlar matrisi**

| Konu | Meta | Google | TikTok | LinkedIn |
|---|---|---|---|---|
| Hedef | Öne çıkarmada "Otomatik" (K03) | Smart'ta açık seçim (K48) | Promote'ta açık seçim (K69) | Açık seçim (K80) |
| Kitle | Advantage+ kitle kendiliğinden; yaş/cinsiyet öneri (K18, K20) | Smart: bölgede + ilgilenen (K49) | Promote'ta varsayılan kitle (K69) | Kitle genişletme açık (K77) |
| Ağ / yerleşim | Advantage+ yerleşim; hariç tutulana %5 seçeneği (K21) | Arama ortakları dahil (K65); Smart'ta GDN, çıkış destekle (K49) | Smart+ otomatik yerleşim (TikTok, Pangle, Lemon8…) (K68) | Audience Network (sektöre göre açık, K82) |
| Kreatif | Bazı Advantage+ creative iyileştirmeleri açık; görsel metni yeniden yazma (K22, K35) | AI Max metin özelleştirme + URL genişletme (açılınca) (K58, K59); PMax video üretimi (K57) | Smart+ otomatik iyileştirmeler (K67) | Accelerate kreatif üretir (K80) |
| Öneri uygulama | "Önerilerle çoğalt"ta kendiliğinden (K29) | Otomatik uygulanan öneriler (K63) | — | — |
| Zorla geçiş | Manuel kampanya Advantage+ açık çoğaltılır (K30) | DSA/ACA/geniş eşleme → AI Max (K60) | — | — |

### B5. Bağlayıcı kararlarla temas noktaları

- **Karar 1 (tek adımlı yayın):** incelenen ürünlerin hiçbiri "kur, geri oku, aç" yapmıyor; Meta'nın kendi
  MCP'si PAUSED kurup ayrı onayla açıyor (K43). Müşteri onayı (D10) yayından önceki bir kapı olarak
  eklenirse karar bozulmuyor.
- **Karar 2 (Advantage+ kitle ve yerleşim açık):** sektörün varsayılanı da bu (K18, K21). Ekrandaki
  karşılıkları D3 (kesin/öneri) ve A11 (tahmin kapsamı); A5 (%5) Gelişmiş'e ait.
- **Karar 3 (sohbetten yayın):** Google (K45, K61, K62), Shopify (K84) ve Meta MCP (K43) insan onayıyla
  yayınlıyor; sessizce yayınlayan büyük ürün yok. Onay kartı panelin onay ekranıyla aynı plan ve aynı
  "otomatik olanlar" listesini taşımalı.
- **Karar 4 (konutta kısıtlar):** Meta özel kategoride Advantage+ kitleyi açmıyor (K19) ve kısıtlı alanların
  seçilebilir görünüp ret getirebildiğini yazıyor (K17). Konut niyetinde Acemi ekranı "Meta'nın otomatik
  kitlesi açık" diyemez: karar 2 bu dalda uygulanamıyor. Bir sektör kaynağı v26'da özel kategoride
  `advantage_audience` alanının açıkça gönderilmesinin zorunlu olduğunu yazıyor (K37) — Açık soru 1.
- **Karar 5 (sıfırdan):** A16 ve Özet 12; kolay ürünlerin kapanması sıfırdan tasarımın ana nesnelere
  kurulmasını destekliyor.

---

## Advetics için tasarım önerileri

### Öneri listesi

| # | Öneri | Dayanak |
|---|---|---|
| Ö1 | Tek sayfa, tek taslak; Acemi varsayılan, Gelişmiş aynı ekranlarda açılır; her bölümde otomasyon durumu ("Meta seçiyor" / "Sınırladın") | D2, K11, K67 |
| Ö2 | Kitle ekranında "Kesin sınırlar" ve "Meta'ya öneriler" iki ayrı kutu | D3, A3, K19 |
| Ö3 | Özel kategori sorusu niyetle aynı ekranda (README §7.3'te 6. adımdaydı); evet denirse sonraki ekranlar kısıt moduna geçer | A15, K17, K19 |
| Ö4 | Bütçe: tip zorunlu, 3 öneri kartı seçili gelmez, her kartta gerekçe ve tahmin aralığı; tahmin yoksa kart yok | D5, A11, README §6.5 |
| Ö5 | E2'den (kitle ekranı) itibaren sağda kalıcı "Plan ve tahmin" paneli, "Meta'nın tahmini" etiketiyle | D6, D8 |
| Ö6 | Puan yok; "Yayına engel / Uyarı / Öneri" listesi, düğme kapalıysa sebebi yazılı | D7, A10 |
| Ö7 | Onay ekranında dört blok: "Senin seçtiklerin", "Meta'nın otomatik yaptıkları", "Kapattıklarımız", "Yayından sonra değişmez" | D8, A7, A12 |
| Ö8 | AI onay kartı = onay ekranı; sohbetin sonunda gerçekten düzenlenebilir "Taslağı aç" | Karar 3, D4 |
| Ö9 | Müşteri onayı seçeneği: markalı bağlantı, hesapsız görüntüleme, "Onayla / Değişiklik iste" + not; onaydan sonra değişen taslak onayı düşürür | D10, K97 |
| Ö10 | Yayın sonrası: durum çizelgesi + sebep + eylem; öneri kartları "Onayla / Reddet", reddedilenler listede | D12, D13 |
| Ö11 | Çoğaltma "kaynaktan yeni"; kaynakla farkı listelenir; Meta'nın "önerilerle çoğalt"ı kullanılmaz | A6 |
| Ö12 | Kreatifte "Meta'nın otomatik değişiklikleri kapalı" bilgisi; açmak workspace onayıyla, özellik özellik, önizlemeli | A4 |
| Ö13 | Sektör ön ayarı görünür ve onaylı: ör. inşaat/konut workspace'inde konut beyanı önden işaretli gelir ama kullanıcı onaylar; ön ayar hiçbir alanı sessizce doldurmaz | D11, A15 |
| Ö14 | Türkçe AI yüzü: yapısal kararları sorar, yaratıcı içeriği üretir | Özet 8, README §7.6 |
| Ö15 | Raporun ve durum ekranının ilk metriği niyetin sonucu (form, mesaj, ziyaret); görünürlük ikinci planda | A17 |

### (d) Üç yüz için akış taslağı

**Ortak çerçeve.** Üç yüz README §5.1'deki omurgayı paylaşır: tek taslak → ön koşul → derleyici → prova →
onay → PAUSED kur → geri oku → aç. Ekranlar sıralı ama geri dönülebilir, üstte ilerleme (E0–E6 için "3/7"
gibi; E7 yayından sonraki durum ekranı). Sağdaki
"Plan ve tahmin" paneli seçilenleri, Meta'nın otomatik yaptıklarını, tahmini ve eksik listesini taşır. Taslak
her değişiklikte kaydedilir ve liste sayfasından açılır. Panel metinleri kısa, uzun tire yok (proje kuralı).

#### Acemi (varsayılan yüz)

| Ekran | Başlık (panel metni) | Ne sorulur | Açıkça söylenen varsayılan | Giriş anında doğrulama | Dayanak |
|---|---|---|---|---|---|
| E0 | "Reklam kimin için?" | Şirket (workspace), reklam hesabı, Facebook sayfası, Instagram hesabı (tekse seçili gelir ve yazılır) | Hesabın durum rozeti ("Ödeme yöntemi var" vb.) | Hesap durumu, ödeme yöntemi, izin üçlüsü; sorun varsa ilerleme kapalı + sebep + düzeltme yolu | D16, README §5.4/1–3 |
| E1 | "Bu reklamdan ne istiyorsun?" | 6 niyet kartı (form, WhatsApp, site, gönderi öne çıkar; canlı doğrulanırsa Messenger ve arama). Altında zorunlu soru: "Konut, iş ilanı, kredi/finans ya da siyasi konu var mı?" | Yok: niyet seçilmeden devam yok | Seçilemeyen kartta sebep ("Sayfaya bağlı WhatsApp numarası yok"); "Evet" denirse kategori seçimi | D1, A1, A15, Ö3 |
| E2 | "Kime, nerede?" | Konum (il/ilçe ara, "Bütün Türkiye" düğmesi). **Kesin sınırlar:** en düşük yaş, dil, hariç tutulacak kitle. **Meta'ya öneriler:** yaş aralığı, cinsiyet, kitle şablonu | "Meta reklamı benzer kişilere de gösterebilir." "Otomatik yerleşim açık: Facebook, Instagram, Messenger, WhatsApp ve diğerleri." | Konum boş geçilemez; il + ilçe çakışması uyarısı. Özel kategoride öneri kutusu yerine kısıt listesi (yaş 18–65+, cinsiyet yok, yarıçap en az 17 km) ve "Bu kategoride Meta'nın otomatik kitlesi kullanılamaz" | D2, D3, A2, A3, karar 2 ve 4 |
| E3 | "Ne kadar, ne zaman?" | Bütçe tipi (Günlük / Toplam, zorunlu); tutar: 3 öneri kartı ya da özel tutar; başlangıç ("Onaydan hemen sonra" ya da tarih); bitiş (toplamda zorunlu; günlükte "Ben durdurana kadar" açık seçenek) | Hiçbir kart seçili gelmez. "Meta bazı günler günlük bütçeyi %75'e kadar aşabilir, haftalık toplam korunur." | Hesap minimumu canlı; toplam bütçede bitiş tarihi; tahmin yoksa "Meta tahmin vermedi" | D5, D6, A11, A14 |
| E4 | "Reklamda ne görünecek?" | Paylaşılmış gönderi seç ya da görsel/video bırak; ana metin, başlık; buton (niyetten gelir, kısa listeden değiştirilebilir); hedef adres (site niyetinde); "Yapay zekâ ile yaz" (3 öneri); yapay zekâ içerik beyanı | "Meta'nın otomatik kreatif değişiklikleri kapalı." Yasal uyarı metne eklenmiş hâliyle görünür | Medya bırakıldığı anda boyut ve oran (kare + dikey), metin sayaçları; uygun olmayan gönderi soluk + sebep | D4, D9, A4, Ö12 |
| E5 | "Meta'nın gözünden" | Soru yok. Meta'nın hedefleme cümlesi, tahmini kitle (kapsamadıklarıyla), yerleşim önizlemeleri (akış, hikâye, Reels), Meta'nın doğrulama sonucu | "Yayından sonra değişmez: görsel ve metin. Değiştirmek yeni reklam demek." | Meta'nın hata metni ilgili alanın yanında; "Beklenmeyen bir hata" yok | D8, D9, A12, README §5.6 |
| E6 | "Gözden geçir ve yayınla" | Tam plan (Ö7'nin dört bloğu). Tek düğme: "Yayınla" (müşteri onayı açıksa "Onaya gönder") | — | Engel listesi boş değilse düğme kapalı + sebep | D8, D10, Ö7, karar 1 |
| E7 | "Reklamın durumu" | — | Çizelge: Meta'ya iletildi → İncelemede → Öğreniyor → Yayında / Sorun var; her durumda sebep + yapılacak iş | Geri okumada fark varsa açma durur, fark gösterilir | D12, D13, README §5.8 |

Notlar: (1) Toplam 8 ekran; README §7.3'teki 9 adımdan farkı, "Beyanlar" ayrı ekran olmaktan çıktı (özel
kategori E1'e, yapay zekâ beyanı E4'e, yasal uyarı E4'te görünür). (2) "Gönderimi öne çıkar" niyetinde E4
gönderi seçimiyle E2'den önce gelir (Instagram, Facebook ve TikTok'un sırası; içerik zaten var). (3) Site
niyetinde adres E1'de alınır ve E4'teki metin önerisine kaynak olur (D4).

#### Gelişmiş (aynı ekranlarda açılan alanlar)

| Ekran | Gelişmiş'te açılan | Not |
|---|---|---|
| E1 | Amaç, optimizasyon hedefi, hedef türü (izin listesiyle); README §5.3 sonundaki Gelişmiş niyetler | Niyet satırının dışına çıkan seçim "Gelişmiş" rozetiyle kaydedilir |
| E2 | Ayrıntılı hedefleme (VE/VEYA), dil, cihaz/işletim sistemi, yarıçap (km), konum hariç tutma, benzer kitle; "Meta'nın otomatik kitlesini kapat" | Kapatınca bölüm durumu "Sınırladın" olur (D2); Meta'nın kuralı: en düşük yaşı 25'e kadar yükseltmek ve özel kitle hariç tutmak otomatik kitleyi kapatmaz (K11) |
| E2 (yerleşim) | Manuel yerleşim listesi; "Hariç tutulana sınırlı harcama" açık/kapalı, açıkça yazılır | A5 |
| E3 | Kampanya ya da reklam seti bütçesi, teklif stratejisi ve tutar, harcama sınırları, gün/saat planı (toplam bütçede) | README §7.4 |
| E4 | Çoklu medya, yerleşime göre medya, çok dilli metin, Meta kreatif iyileştirmeleri (workspace onayı varsa, özellik özellik, önizlemeli) | A4 |
| E4 (ölçüm) | Olay ya da özel dönüşüm, değer optimizasyonu, atıf ayarı, UTM şablonu | README §7.4 |
| E6 | A/B test, kopya sayısı, etiketler | — |

#### Yapay zekâ (sohbet) yüzü

| Tur | Yapay zekâ ne yapar | Kullanıcıya sorulan | Taslağa yazılan | Dayanak |
|---|---|---|---|---|
| S1 | Kullanıcının asıl cümlesini kaydeder; bağlamdan şirket ve hesabı okur | Birden çoksa şirket ve hesap | E0 | README §6.3-3 |
| S2 | Cümleden niyet satırı önerir (numarayla) | Kapalı soru ("Form mu, WhatsApp mı?"); özel kategori sinyali görürse beyan sorusu | E1 | D1, A1, A15 |
| S3 | Konum ve kitle önerir, kesin/öneri ayrımını söyler | Konum (boşsa mutlaka); yaş sınırının kesin olup olmadığı | E2 | A2, A3 |
| S4 | Bütçeyi ASLA tahmin etmez; Meta'nın tahminini gösterir | Tip, tutar, başlangıç, bitiş | E3 | README §6.5 |
| S5 | Marka Merkezi ve siteden metin/görsel önerisi üretir (öneri rozetli) | Hangisi, değişiklik, yapay zekâ beyanı | E4 | D4 |
| S6 | Provayı özetler: hedefleme cümlesi, tahmin, önizleme bağlantısı, Meta'nın hata metni | Düzeltme gerekiyorsa | — | README §5.6 |
| S7 | Onay kartı: E6'nın aynısı + kullanıcının asıl cümlesi | "Yayınla" | — | Karar 3, Ö8 |
| S8 | Yayın sonrası proaktif: durum değişikliği, öneri kartı, kreatif yorgunluğu | "Onayla / Reddet" | Yeni varyant taslağı | D12, D18 |

Kurallar: yapay zekânın sorduğu her şey panelin sorduğu şeydir (README §7.6); sohbet her an "Taslağı aç"
ile panele geçer; yapısal kararlar (şirket, hesap, niyet, özel kategori, bütçe tipi ve tutarı, konum, tarih)
sorulmadan geçilmez; yaratıcı içerik üretilip taslağa "öneri" olarak konur; dil Türkçe (Ö14).

#### Ajans iş akışı (müşteri onayı; TASARIM K3 kararına bağlı)

1. Ajans taslağı hazırlar (Acemi, Gelişmiş ya da sohbet).
2. "Onaya gönder" → müşteriye bağlantı (e-posta ya da mesajla paylaşılabilir); hesap gerekmez; sayfa E5 ve
   E6'nın içeriğini gösterir: önizlemeler, hedefleme cümlesi, bütçe, tarih, Meta'nın otomatik yaptıkları,
   yayından sonra değişmeyenler (K97 deseni).
3. Müşteri "Onayla" ya da "Değişiklik iste" (not zorunlu). Onay, taslağın o andaki sürümüne bağlı; sonra
   değişen taslak onayı düşürür (README §6.3-2).
4. Yayın, workspace ayarına göre: (a) onaydan sonra ajans tek adımla yayınlar ya da (b) müşterinin onayı
   yayını başlatır (AdEspresso modeli). İkisinde de yayın aynı tek adımlı yol (karar 1).
5. Denetim izi: kim, ne zaman, hangi sürüm, hangi not.
6. "Zorunlu onay" workspace ayarı: açıkken onaysız yayın düğmesi görünmez.

#### Yayın sonrası ekran ve optimizasyon döngüsü

- **Durum çizelgesi** (E7) + "son önemli değişiklik" tarihi; öğrenme sürerken düzenleme yapılırsa uyarı
  ("Bu değişiklik teslimatı geçici etkileyebilir"). Öğrenmeyi sıfırlayan değişiklik listesi belgede yok,
  kural uydurulmaz (README §6.6).
- **Öneri kartları:** ne, neden, varsa Meta'nın beklediği etki, "Onayla / Reddet"; reddedilenler gerekçesiyle
  ayrı listede (D12).
- **Kreatif yorgunluğu** gelince "Yeni varyant hazırla" (taslak; yayın yine onaylı) (D18).
- **Haftalık özet** (sohbet ya da e-posta): ilk satır niyetin sonucu, görünürlük metrikleri sonra (Ö15).

---

## Açık sorular ve doğrulanması gerekenler

1. **Konut + Advantage+ kitle (karar 2 × karar 4).** Meta özel kategoride Advantage+ kitleyi açmıyor (K19).
   Konut niyetinde `advantage_audience` hangi değerle yazılacak, v26'da açık gönderim zorunlu mu (K37,
   sektör)? Kullanıcıya: karar 2 konut dalında askıya alınıyor mu? Canlı turda ölçülmeli.
2. **Müşteri onayı (TASARIM K3).** Model (a) mı (b) mi? Onay sayfasında hangi marka görünür (Advetics mi
   ajans mı)? `CLAUDE.md`'deki "rapor kapağında Advetics logosu" kuralıyla tutarlılık.
3. **Bütçe öneri kartlarının verisi.** Türkiye hesaplarında `delivery_estimate` ve `reachestimate` TRY'de
   anlamlı aralık döndürüyor mu? Dönmüyorsa kartlar gösterilmemeli ("tahmin yok"); hesap minimumu tek
   referans kalır.
4. **Hariç tutulan yerleşime %5.** Türkiye hesaplarında manuel yerleşimde kutunun varsayılanı ne (resmî
   sayfa söylemiyor, sektör "işaretli" diyor); API'de karşılığı (`placement_soft_opt_out`) geri okunmalı.
5. **Görsel metnini yeniden yazma.** Hangi `creative_features_spec` anahtarına karşılık geliyor; OPT_OUT
   gönderildiğinde geri okumada gerçekten kapalı mı (K35; canlı).
6. **Meta AI iş asistanı.** Türkçe destekliyor mu ve kampanya kurma özelliği Türkiye'de açıldı mı (K32–K34)?
   Ajans hesabında bakılmalı; açıldıysa AI yüzünün farkı yeniden değerlendirilmeli.
7. **Google sohbetli kurulum** Türkçe hesaplarda görünüyor mu (K45'e göre hayır)? Advetics'in Google yazma
   yolu yok; bilgi amaçlı.
8. **LinkedIn etiketleri.** Ekim 2025'teki arayüz adları ("Kampanya / Reklam seti") `ENTITY_LEVEL_LABELS` ile
   uyumlu mu (K83)?
9. **Sürüm çelişkisi (kapsam dışı ama kritik).** Bir sektör kaynağı Temmuz 2026'da Marketing API v26.0'ın
   çıktığını ve süresi dolan sürümün hatasız yükseltildiğini yazıyor (K37); README güncel sürümü v25.0
   diyor. Meta changelog'u ile doğrulanmalı.
10. **Sektör ön ayarları.** Hangi sektörler (inşaat/konut, özel klinik, e-ticaret), hangi alanları önden
    işaretler: kullanıcı kararı.
11. **Adım sayıları ilk elden doğrulanmadı.** Facebook/Instagram öne çıkarma ve Ads Manager akışı ajansın
    kendi hesabında ekran ekran kaydedilmeli (yayınlamadan, para harcamadan).
12. **Sektör iddiaları** (öne çıkarmanın tık maliyeti farkı K38, Accelerate'in B2B maliyeti K82, Autopilot
    ayrıntıları K86) kendi verimizle sınanmadı; karar gerekçesi yapılmamalı.

---

## Kaynaklar

Etiketten sonraki not okuma biçimidir: **tam** = sayfanın metni okundu; **özet** = yalnız arama sonucu özetinden; **MCP** = Meta
yardım merkezi makalesi, Meta Ads MCP'sinin salt okuma yardım aracıyla okundu. Tarihi yazmayan sayfalar
2026-10-06'da okundu.

| # | Başlık | URL | Tarih | Etiket |
|---|---|---|---|---|
| K01 | Boost a post from your Facebook Page | https://www.facebook.com/business/help/347839548598012 | — | Resmî-Meta · MCP |
| K02 | How to edit boosted posts from a Facebook Page | https://www.facebook.com/business/help/426406490782216 | — | Resmî-Meta · MCP |
| K03 | Boost a post or reel in Meta Business Suite on desktop | https://www.facebook.com/business/help/1445506849122224 | — | Resmî-Meta · MCP |
| K04 | Get started boosting content on Instagram | https://www.facebook.com/business/help/2200821926641066 | — | Resmî-Meta · MCP |
| K05 | Setting a budget for Instagram ads | https://www.facebook.com/business/help/1514927061975521 | — | Resmî-Meta · MCP |
| K06 | Edit an Instagram ad | https://www.facebook.com/business/help/380757175862444 | — | Resmî-Meta · MCP |
| K07 | About automated ads | https://www.facebook.com/business/help/223852498347426 | — | Resmî-Meta · MCP |
| K08 | Create automated ads from your Facebook Page | https://www.facebook.com/business/help/439409766471774 | — | Resmî-Meta · MCP |
| K09 | Advertiser Success Center: ad auction hub | https://www.facebook.com/253117663402488 | veri Ocak 2023 (eski olabilir) | Resmî-Meta · MCP |
| K10 | About the Advantage+ campaign experience | https://www.facebook.com/business/help/1292656978738967 | — | Resmî-Meta · MCP |
| K11 | What turns Advantage+ on and Advantage+ off | https://www.facebook.com/business/help/906206294602874 | — | Resmî-Meta · MCP |
| K12 | About Advantage+ sales campaigns | https://www.facebook.com/business/help/1362234537597370 | test Aralık 2024 | Resmî-Meta · MCP |
| K13 | About Advantage+ leads campaigns | https://www.facebook.com/business/help/992035952809423 | testler Kasım 2024–Ocak 2025 | Resmî-Meta · MCP |
| K14 | About Advantage+ app campaigns | https://www.facebook.com/business/help/309994246788275 | — | Resmî-Meta · MCP |
| K15 | Create Meta Advantage+ catalog ads | https://www.facebook.com/business/help/1132465490107046 | — | Resmî-Meta · MCP |
| K16 | About campaign score during campaign creation | https://www.facebook.com/business/help/3864826443789572 | — | Resmî-Meta · MCP |
| K17 | How to create a campaign using value rules | https://www.facebook.com/business/help/1035626911721747 | — | Resmî-Meta · MCP |
| K18 | Create a campaign using Advantage+ audience | https://www.facebook.com/business/help/793748385630490 | — | Resmî-Meta · MCP |
| K19 | About audience controls and audience suggestions in Advantage+ audience | https://www.facebook.com/business/help/938372127764391 | — | Resmî-Meta · MCP |
| K20 | Age and gender targeting | https://www.facebook.com/business/help/151999381652364 | — | Resmî-Meta · MCP |
| K21 | Choose ad placements in Meta Ads Manager | https://www.facebook.com/business/help/175741192481247 | — | Resmî-Meta · MCP |
| K22 | About Advantage+ creative | https://www.facebook.com/business/help/297506218282224 | — | Resmî-Meta · MCP |
| K23 | Turn off Advantage+ creative enhancements | https://www.facebook.com/business/help/1082295769403815 | — | Resmî-Meta · MCP |
| K24 | About opportunity score in Meta Ads Manager | https://www.facebook.com/business/help/804913634782260 | — | Resmî-Meta · MCP |
| K25 | About the learning phase | https://www.facebook.com/business/help/112167992830700 | — | Resmî-Meta · MCP |
| K26 | About learning limited | https://www.facebook.com/business/help/269269737396981 | — | Resmî-Meta · MCP |
| K27 | About estimated audience size | https://www.facebook.com/business/help/1665333080167380 | — | Resmî-Meta · MCP |
| K28 | Estimated daily results (Marketing API) | https://developers.facebook.com/docs/marketing-api/audiences/reference/estimated-daily-results | — | Resmî-Meta · MCP |
| K29 | About duplicating an ad campaign with recommendations | https://www.facebook.com/business/help/244031778000649 | — | Resmî-Meta · MCP |
| K30 | How to duplicate ad campaigns in Meta Ads Manager | https://www.facebook.com/business/help/209669919072999 | — | Resmî-Meta · MCP |
| K31 | 2026: AI Drives Performance (Meta Newsroom) | https://about.fb.com/news/2026/01/2026-ai-drives-performance/ | 2026-01-28 | Resmî-Meta · tam |
| K32 | Meta Rolls Out AI Business Assistant To All Advertisers, Agencies (MediaPost) | https://www.mediapost.com/publications/article/414547/meta-rolls-out-ai-business-assistant-to-all-advert.html | 2026-04-23 | Sektör · tam |
| K33 | Meta expands access to AI business assistant (Social Media Today) | https://www.socialmediatoday.com/news/meta-expands-access-to-ai-business-assistant/818263/ | 2026-04-22 | Sektör · tam |
| K34 | Meta AI business assistant expands globally (Mediabrief) | https://mediabrief.com/meta-ai-business-assistant-expands-globally-more-languages/ | 2026-04-24 | Sektör · tam |
| K35 | Meta Is Rewriting Your Ad Images by Default (Common Thread) | https://commonthreadco.com/blogs/coachs-corner/meta-advantage-plus-creative-image-text-rewriting-ecommerce-2026 | 2026-08-18 | Sektör · tam |
| K36 | Meta Can Now Rewrite the Text on Your Ad Images (Jon Loomer) | https://www.jonloomer.com/meta-rewrite-text-ad-images/ | 2026-07 | Sektör · özet (sayfa 403) |
| K37 | Meta Ads Updates: August 2026 Changelog (AdMake) | https://admakeai.com/blog/meta-ads-updates-august-2026 | 2026-08 | Sektör · tam |
| K38 | How to Boost a Facebook Post in 2026 (AdMake) | https://admakeai.com/blog/how-to-boost-facebook-post | 2026-05-22 | Sektör (ticari çıkar) · tam |
| K39 | A Local Business Guide to Boosted Instagram Posts (Seer Interactive) | https://www.seerinteractive.com/insights/local-business-guide-to-instagram-posts | 2020-04-21 (eski olabilir) | Sektör · tam |
| K40 | Meta Ads Placement Control 2026 (TheOptimizer) | https://theoptimizer.io/blog/meta-ads-placement-control-in-2026-how-to-actually-block-placements-its-not-as-simple-anymore | 2026-06-06 | Sektör · tam |
| K41 | Does Meta Ignore Audience Suggestions? (Jon Loomer) | https://www.jonloomer.com/qvt/does-meta-ignore-audience-suggestions/ | — | Sektör · özet (sayfa 403) |
| K42 | Meta looking to fully automate ad creation by 2026-end (Yahoo Finance / WSJ aktarımı) | https://finance.yahoo.com/news/meta-looking-fully-automate-ad-113056107.html | 2025-06 | Sektör (haber) · özet |
| K43 | Depo: `bolumler/01-temel-yapi-ve-ai-baglayicilari.md` §2 (Meta Ads MCP araç envanteri) | depo içi | 2026-10-06 | Resmî-Meta (depo) · tam |
| K44 | Depo: `bolumler/04-butce-teklif-advantage-olcum.md` (`advantage_state_info`) | depo içi | 2026-10-06 | Resmî-Meta (depo) · tam |
| K45 | About conversational experience in Google Ads | https://support.google.com/google-ads/answer/14145186?hl=en | — | Resmî-diğer · tam |
| K46 | Gemini-powered chat comes to Google Ads | https://blog.google/products/ads-commerce/put-google-ai-to-work-with-search-ads/ | 2024-01-23 | Resmî-diğer · tam |
| K47 | Google Ads Expands AI Campaign Tools To More Languages (SEJ) | https://www.searchenginejournal.com/google-ads-expands-ai-campaign-tools-to-more-languages/527311/ | 2024-09-18 | Sektör · tam |
| K48 | Create a Smart Search campaign | https://support.google.com/google-ads/answer/7459814?hl=en | — | Resmî-diğer · tam |
| K49 | How Smart campaigns work | https://support.google.com/google-ads/answer/7652860?hl=en | — | Resmî-diğer · tam |
| K50 | Clicks and costs in Smart campaigns | https://support.google.com/google-ads/answer/9833508?hl=en | — | Resmî-diğer · özet |
| K51 | Changes to Support for Smart Campaigns in the Google Ads API (Ads Developer Blog) | https://ads-developers.googleblog.com/2026/06/changes-to-support-for-smart-campaigns.html | 2026-06-23 | Resmî-diğer · başlık ve etiketler (gövde yüklenmedi) |
| K52 | Google Ads API to stop supporting new Smart Campaign creation (Search Engine Land) | https://searchengineland.com/google-ads-api-to-stop-supporting-new-smart-campaign-creation-480999 | 2026 | Sektör · özet (sayfa 403) |
| K53 | Why is Smart Mode the Worst Way to Run Google Ads? (Snap Agency) | https://www.snapagency.com/why-is-smart-mode-the-worst-way-to-run-google-ads/ | 2021-02-02 (eski olabilir) | Sektör · tam |
| K54 | Create a Performance Max campaign | https://support.google.com/google-ads/answer/10724896?hl=en | — | Resmî-diğer · tam |
| K55 | Step 1: Create a campaign and choose a goal (Performance Max) | https://support.google.com/google-ads/answer/13717300?hl=en | — | Resmî-diğer · tam |
| K56 | Create and manage Performance Max campaigns with Shopify, Woo, GoDaddy, BigCommerce, PrestaShop | https://support.google.com/google-ads/answer/10431635?hl=en | — | Resmî-diğer · tam |
| K57 | Performance Max 2026: Setup Guide (Dataslayer) | https://www.dataslayer.ai/blog/google-ads-performance-max-complete-guide-2025 | 2025-12-18 | Sektör · tam |
| K58 | How AI Max for Search campaigns works | https://support.google.com/google-ads/answer/15910187?hl=en | — | Resmî-diğer · tam |
| K59 | About Final URL expansion in Search | https://support.google.com/google-ads/answer/16230205?hl=en | — | Resmî-diğer · tam |
| K60 | Google's Dynamic Search Ads are upgrading to AI Max | https://blog.google/products/ads-commerce/dsa-upgrade-to-ai-max-2026/ | 2026-04-15 (güncelleme 2026-06-11) | Resmî-diğer · tam |
| K61 | Ads & Analytics Advisors: Google AI Advisors | https://business.google.com/us/accelerate/announcements/google-ai-advisors-agentic-tools-to-drive-impact-and-insights/ | 2025-12 | Resmî-diğer · tam |
| K62 | Google's Ask Advisor unifies ads, analytics, and commerce (PPC Land) | https://ppc.land/googles-ask-advisor-unifies-ads-analytics-and-commerce-in-one-ai-agent/ | 2026-05-20 | Sektör · tam |
| K63 | About applying recommendations automatically | https://support.google.com/google-ads/answer/10279006?hl=en | — | Resmî-diğer · tam |
| K64 | The truth about Google Ads recommendations (and auto-apply) (Search Engine Land) | https://searchengineland.com/google-ads-recommendations-auto-apply-465909 | — | Sektör · özet |
| K65 | About the Google Search Network | https://support.google.com/google-ads/answer/1722047?hl=en | — | Resmî-diğer · tam |
| K66 | What Actually Drives RSA Performance (Optmyzr) | https://www.optmyzr.com/blog/google-rsa-performance-study/ | 2026-04-06 | Sektör · tam |
| K67 | TikTok Announces New Automation Updates for Advertisers (Newsroom) | https://newsroom.tiktok.com/tiktok-announces-new-automation-updates-for-advertisers?lang=en | 2025-10-07 | Resmî-diğer · tam |
| K68 | How To Build Campaigns Your Way With Smart+ (TikTok for Business) | https://ads.tiktok.com/business/en-US/blog/smart-plus-ai-performance-solution | 2026-05-13 | Resmî-diğer · tam |
| K69 | Introducing TikTok Promote | https://ads.tiktok.com/business/en-US/promote-101 | — | Resmî-diğer · tam |
| K70 | TikTok Promote: Four New Tools | https://ads.tiktok.com/business/en-US/blog/tiktok-promote-new-features | 2023-02-07 (eski olabilir) | Resmî-diğer · tam |
| K71 | TikTok Promotion (Sprout Social) | https://sproutsocial.com/insights/tiktok-promotion/ | 2025-09-08 | Sektör · tam |
| K72 | How Does TikTok Promote Work? (Darkroom) | https://www.darkroomagency.com/observatory/how-does-tiktok-promote-work | 2026-10-06 | Sektör · tam |
| K73 | How to Use TikTok Promote (Social Media Examiner) | https://www.socialmediaexaminer.com/how-to-use-tiktok-promote-to-reach-new-audiences/ | 2021-09-14 (eski olabilir) | Sektör · tam |
| K74 | TikTok Ads Manager walkthrough (Demand Curve) | https://www.demandcurve.com/playbooks/tiktok-ads-manager-walkthrough | 2022-05-09 (eski olabilir) | Sektör · tam |
| K75 | TikTok Debuts New Agentic AI Tools for Marketers (ANA) | https://www.ana.net/magazines/show/id/news-2026-06-25-tik-tok-symphony-agent | 2026-06-25 | Sektör · özet |
| K76 | About Symphony Creative Studio (TikTok Ads Help) | https://ads.tiktok.com/help/article/about-symphony-creative-studio?lang=en | — | Resmî-diğer · özet |
| K77 | Audience Expansion (LinkedIn Help) | https://www.linkedin.com/help/lms/answer/a418929 | ~2026-08 | Resmî-diğer · tam |
| K78 | LinkedIn Audience Network (LinkedIn Help) | https://www.linkedin.com/help/lms/answer/a423409 | ~2026-08 | Resmî-diğer · tam |
| K79 | Forecasted results in Campaign Manager (LinkedIn Help) | https://www.linkedin.com/help/lms/answer/a427257 | — | Resmî-diğer · özet |
| K80 | Create LinkedIn lead generation ad sets (Accelerate tanımı) | https://www.linkedin.com/help/lms/answer/a423173 | ~2025-12 | Resmî-diğer · özet (Accelerate paragrafı sayfa gövdesinde görünmedi) |
| K81 | LinkedIn is officially rolling out its own AI-campaign tool (Digiday) | https://digiday.com/marketing/linkedin-is-officially-rolling-out-its-own-ai-campaign-tool/ | 2024-07-11 | Sektör · tam |
| K82 | LinkedIn Accelerate Campaigns: Honest Review (Optimize LinkedIn Ads) | https://www.optimizelinkedinads.com/blogs/linkedin-accelerate-review | 2026-10-01 | Sektör · tam |
| K83 | LinkedIn Renames Ad Campaign Elements (Social Media Today) | https://www.socialmediatoday.com/news/linkedin-updates-advertising-campaign-naming-conventions/761534/ | 2025-10 | Sektör · özet |
| K84 | Campaign Autopilot: Meta ads (Shopify Help) | https://help.shopify.com/en/manual/promoting-marketing/autopilot/meta-ads | — | Resmî-diğer · tam |
| K85 | Campaign Autopilot (Shopify Help) | https://help.shopify.com/en/manual/promoting-marketing/autopilot | — | Resmî-diğer · tam |
| K86 | Shopify Campaign Autopilot: An Honest Look (WRKNG Digital) | https://wrkngdigital.com/post/shopify-campaign-autopilot-honest-review | 2026-06-23 | Sektör · tam |
| K87 | Shopify Audiences: generate audiences (Shopify Help) | https://help.shopify.com/en/manual/promoting-marketing/shopify-audiences/generate-audiences | — | Resmî-diğer · özet |
| K88 | Facebook & Instagram Ads: Creating a Campaign (Wix Help) | https://support.wix.com/en/article/facebook-instagram-ads-creating-a-campaign | ekran görüntüleri 2024-09 | Resmî-diğer · tam |
| K89 | Google Ads with Wix: Creating and Managing Your Campaign (Wix Help) | https://support.wix.com/en/article/google-ads-with-wix-creating-a-campaign | — | Resmî-diğer · tam (Smart notu özetten) |
| K90 | Marketing your Squarespace site (Squarespace Help) | https://support.squarespace.com/hc/en-us/articles/360002098187-Marketing-your-Squarespace-site | — | Resmî-diğer · tam |
| K91 | Create Facebook and LinkedIn lead ads in HubSpot | https://knowledge.hubspot.com/ads/create-facebook-and-linkedin-lead-ads-in-hubspot | 2026-09-07 | Resmî-diğer · tam |
| K92 | Mailchimp Additional Terms (Ad Buying Feature) | https://mailchimp.com/legal/additional-terms/ | yürürlük 2024-08-26 | Resmî-diğer · tam |
| K93 | Mailchimp: Facebook ads özellik sayfası | https://mailchimp.com/features/facebook-ads/ | — | Resmî-diğer · tam |
| K95 | Introducing Canva Grow 2.0 (MarTech Series, basın bülteni) | https://martechseries.com/content/introducing-canva-grow-2-0-create-launch-and-optimize-ads-in-one-place/ | 2026-06-25 | Sektör · tam |
| K96 | Canva Grow 2.0: Agentic Paid Media (Digital Applied) | https://www.digitalapplied.com/blog/canva-grow-2-agentic-paid-media | 2026-07-09 | Sektör · tam |
| K97 | Campaign Approvals (AdEspresso) | https://adespresso.com/tour/campaign-approvals/ | — | Resmî-diğer · tam |
| K98 | AdEspresso Review 2026 (Ryze; rakip içerik) | https://www.get-ryze.ai/blog/adespresso-review-2026 | 2026-08-22 | Sektör · tam |
| K99 | 10 Best White-Label Meta Ad Platforms (Madgicx; rakip içerik) | https://madgicx.com/blog/white-label-meta-ad-platforms | 2025-12-12 | Sektör · tam |
| K100 | Madgicx incelemesi (SaaSworthy) | https://www.saasworthy.com/product/madgicx | 2026-09 | Sektör · özet |
| K101 | Revealbot (Birch) Review 2026 (Superscale) | https://superscale.ai/alternatives/revealbot/review | 2026 | Sektör · özet |
| K102 | Smartly.io Review 2026 (AdLibrary) | https://adlibrary.com/posts/smartly-io-review-2026 | 2026 | Sektör · özet |
| K103 | AdCreative.ai reviews 2026 (Tools for Humans) | https://www.toolsforhumans.ai/ai-tools/adcreative-ai | 2026 | Sektör · özet |
| K104 | Introducing Pencil and Pencil Pro (Jellyfish) | https://www.jellyfish.com/en-us/news/book-a-demo-of-pencil-pro/ | — | Sektör · özet |
| K105 | Social Media Policy Template for Multi-Location Teams (SOCi) | https://www.soci.ai/blog/social-media-policy-templates-for-multi-location-teams/ | 2026 | Sektör · özet |
| K106 | Meta launches unified API structure for Advantage+ campaigns (PPC Land) | https://ppc.land/meta-launches-unified-api-structure-for-advantage-campaigns/ | 2025 | Sektör · özet |
| K107 | More Performance, Less Transparency: Inside Meta's Advantage+ Shopping Black Box (AdExchanger) | https://www.adexchanger.com/commerce/more-performance-less-transparency-inside-metas-advantage-shopping-black-box/ | tarih okunamadı (eski olabilir) | Sektör · özet |
| K108 | 9 Default Settings in Google Ads to Avoid (Marlin SEM) | https://marlinsem.com/bad-default-settings-google-ads/ | — | Sektör · özet |
| K109 | Meta Just Launched AI Agents Inside Ads Manager (Future Factors) | https://futurefactors.ai/meta-just-launched-ai-agents-inside-ads-manager/ | 2026 | Sektör · özet |

Not: K94 kullanılmadı; metindeki atıflar kaymasın diye numaralar yeniden dizilmedi.
