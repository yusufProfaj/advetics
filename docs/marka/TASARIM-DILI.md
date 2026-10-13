# Advetics tasarım dili

**Tarih:** 2026-10-09 · **Kaynaklar:** Profaj kurumsal kılavuzu
([`profaj-kurumsal-kilavuz.jpg`](profaj-kurumsal-kilavuz.jpg)) ve Google Ads
panelinin canlı incelemesi (Profaj Reklamcılık MCC + Atahan Kız Öğrenci Yurdu
hesabı; yalnız bakıldı, hiçbir şey değiştirilmedi).

Kullanıcının çerçevesi: *"Google Ads'in basitleştirilmiş ve genele uyarlanmış
hâlini yapıyoruz. Bu sistemin dışına çıkma. Google yıllardır test etmiş;
mantığını ve basitliğini tut. Kendi marka kimliğimizde ona benzetmek için her
değişikliği yapabilirsin."*

İki kaynak, iki ayrı iş: **görünüş ADVETICS'İN KENDİ DİLİ, kullanım mantığı
Google Ads'ten.** Kullanıcı (2026-10-09): *"Advetics'in tasarım dilini bırakma,
sadece kullanım açısındaki mantığı istiyorum. Görüntüler, şemalar, tablolar
Advetics dilinde, Google Ads paneline benzer şekilde. Animasyonları bırakma,
en ufak animasyon hatası da istemiyorum."* Yani `globals.css` tasarım
katmanı (kılavuz renkleri, degrade ikon karoları, buzlu cam üst çubuk, kart
kalıbı, geçişler) aynen kalır; Google'dan iskelet, akış ve sadelik alınır.
Google'ın renkleri, yazı tipi ve logosu ALINMAZ.

> **GÜNCELLENDİ 2026-10-14 (§ 5):** degrade ikon karoları, birincil düğmenin
> degradesi ve parıltısı, zemindeki marka ışığı ve kart gölgeleri KALKTI
> (kullanıcı kararı, birleşik tasarım sistemi). Animasyon ve geçişler kalıyor.
> Yukarıdaki cümle geçmiş olarak duruyor.

**Yeşil:** yalnız DURUM göstergesi için onaylandı (kullanıcı, 2026-10-09):
yayında = yeşil. Başka hiçbir yerde kullanılmaz.

**Animasyon:** her geçiş `prefers-reduced-motion` altında kapanır; açılıp
kapanan öğe DOM'dan çıkmaz, görünürlüğü geçişle değişir (yarım kalan ya da
bir karede yok olan animasyon yok). Örnek: `components/rehber/set-kartlari.tsx` (⋯ menüsü).

---

## 1. Kılavuzdan: kesin kurallar

| Öğe | Kural |
|---|---|
| Renk | YALNIZ dört renk: beyaz `#ffffff`, siyah `#000000`, gri `#302e2d`, kırmızı `#ff2400` |
| Nötr tonlar | Zemin ve çizgi için gerekiyorsa YALNIZ kurumsal grinin saydam tonları (`#302e2d` %4 zemin, %12 çizgi, %60 ikincil metin). Yeni bir ton (mavi-gri, pembe, pastel) YOK |
| Gradyan, buğu | ~~Advetics'in mevcut dili (marka → aksan degradesi, buzlu cam) KALIR; yeni bir pastel ton eklenmez~~ (2026-10-09). **2026-10-14'ten beri DEGRADE YOK** (§ 5): birincil düğme düz kırmızı, ikon karoları düz, zemin düz. Yalnız yapışkan üst çubukta okunabilirlik için hafif bulanıklık kalıyor (referans) |
| Durum renkleri | **2026-10-14:** hata ve uyarı = marka kırmızısı (ikon + sol çizgi, metin siyah), bilgi = gri. Turuncu uyarı, mavi bilgi, ikinci kırmızı (`#dc2626`) YOK. Yeşil YALNIZ durum noktası |
| Ana başlık | Montserrat (kalın). Sayfa başlığı, büyük sayılar, kart içi ana sayı |
| Üst başlık, alt başlık, gövde | Open Sans |
| Kırmızının rolü | Vurgu: birincil eylem, seçili durum, önemli sayı. Kılavuz örneğinde ("Bu İşte / **Beraberiz!**") kırmızı tek vurgu, gerisi siyah. Ekranda kırmızı az ve anlamlı |
| Logo | Üç zeminde: beyaz zemin + renkli, gri zemin + beyaz yazı, kırmızı zemin + beyaz. İkon tek başına kare kutuda |

## 2. Google Ads'ten: ekran iskeleti

### 2.1 Kabuk (her ekranda aynı)

- **Üst çubuk:** solda logo ve **hesap kırıntısı** (`Profaj Reklamcılık ›
  Atahan Kız Öğrenci Yurdu  188-533-3011 ▾`); sağda **etiketli ikonlar**
  (Arama, Görünüm, Yenile, Yardım, Bildirimler) ve kullanıcı.
- **Sol ray (dar, ~72px):** en üstte yuvarlak **+ Oluştur**, altında ikon +
  altında kısa ad: Kampanyalar, Hedefler, Araçlar, Faturalandırma, Yönetici.
  Seçili öğe ikonun arkasında **hap biçimli vurgu**.
- **İkinci panel (flyout):** raydaki ikonun üstüne gelince/tıklayınca açılan
  dikey liste; içinde bölümün alt sayfaları, açılır gruplar. Ray dar kalıyor,
  alt sayfalar gerekince görünüyor.
- **Sayfa başlığı solda, tarih aralığı sağ üstte** (`Son 7 gün | 2 - 8 Eki
  2026 ▾ | ‹ › | Son 30 günü göster`). Tarih seçici: solda hazır aralıklar
  (Bugün, Dün, Son 7 gün, Bu ay, Geçen ay…), sağda iki tarih kutusu ve kayan
  takvim, altta **Karşılaştır** anahtarı.
- **Bildirim şeridi** sayfanın üstünde: ikon + kalın başlık + tek cümle +
  "Kapat" ve **"Sorunu çöz"** düğmesi; birden çoksa `‹ 1/2 ›`.

### 2.2 Performans ekranı (Genel bakış, hesaplar, kampanyalar, reklamlar…)

Her düzey AYNI iskeleti taşıyor; tutarlılık buradan geliyor:

1. **Metrik kutuları** yan yana (4 tane). Seçili olanlar dolu renkli ve
   grafikte çizgi oluyor; değerin altında önceki döneme göre fark (`↓ -1.099.465`).
   Sağda "Metrikler / Ayarla / İndir / Genişlet".
2. **Çizgi grafik** (en çok iki seri).
3. **Tablo araç çubuğu:** solda süzgeç ikonu + **süzgeç çipleri**
   (`Hesap durumu: Etkin, Taslak`) + "Filtre ekle"; sağda etiketli ikonlar
   (Ara, Segment, Sütunlar, Raporlar, İndir, Genişlet, Diğer).
4. **Tablo:** onay kutusu, **durum ikonu** (yeşil nokta etkin, duraklat ikonu,
   kırmızı x hata), **tür ikonu** (arama, video, görüntülü), ad bağlantı ve
   altında kimlik, sayılar sağa yaslı. **Durum sütunu nedeni söylüyor**
   ("Duraklatıldı · Tüm reklam grupları duraklatılmış"). Yönetici hesapta alt
   hesap simgesi: hiyerarşi tabloda iniyor.
5. **Toplam satırları:** "Toplam: mevcut görünüm" ve "Toplam: hesap";
   "Filtrelenen toplam: 4 Yönetici, 3 Hesap".
6. **Sayfalama:** `Gösterilecek satır sayısı 10 ▾ · 1 - 10 / 37 · |‹ ‹ › ›|`.
7. Sağ sütunda (yer varsa) **öneri kartı**: kazanç rozeti, tek cümle, birincil
   eylem ("Tümünü uygula").

### 2.3 Reklam satırında önizleme

Reklam düzeyinde önizleme SATIRIN İÇİNDE: görselde küçük resim ve "+5
resim", arama reklamında başlık · görünen adres · açıklama arama sonucu
düzeninde; altında "Öğe ayrıntılarını görüntüleyin · Reklamları önizle".

### 2.4 Genel bakış (hesap)

İki sütunlu kart ızgarası: performans (metrik kutuları + grafik), **Hesap
teşhisi** ("Hesapta ilgilenilmesi gereken sorunlar var" + her sorunda
"Sorunu çöz"), öneriler (optimizasyon puanı ve kampanya bazında puan),
kampanyalar özeti (maliyete göre renk yoğunluklu küçük tablo), **en büyük
değişiklikler**, cihazlar. Üstte birincil eylem: **+ Yeni kampanya** (hap).

### 2.5 Öneriler

Üstte **optimizasyon puanı** (yüzde + ilerleme çubuğu + değişim), altında
**"Sizin için en uygun öneri"** tek büyük kart ve tek düğme, sonra kategori
çipleri (her birinde kazanç `+%7`) ve öneri kartları ızgarası. Her kartta:
kazanç rozeti, **öngörülen etki** (`+3,36 dönüşüm`), kısa neden, gerekirse
telefon önizlemesi, "Tümünü uygula / N öneriyi göster".

### 2.6 Bütçe / faturalandırma

Kartlar: **Hesap bütçeleri** (durum, tarih, ilerleme çubuğu, sağda büyük
harcanan tutar), altında işlemler ve ayarlar kartları; her kartın sağ altında
TEK eylem bağlantısı.

### 2.7 Oluşturma (sihirbaz)

**Odaklı kip:** ray yok, sol üstte yalnız kapat (X). Tek soru başlığı
("Kampanya hedefiniz nedir?"), cevaplar ikon + başlık + açıklama taşıyan
kart ızgarası, sağ altta yalnız **İptal / Devam**. + Oluştur menüsü kısa:
Kampanya, Reklam grubu, Öğe grubu, Anahtar kelimeler, Dönüşüm işlemi, Öğe.

### 2.8 Ayarlar

Etiket | değer satırları, tıklanınca satır açılıyor; ayrı form sayfası yok.

## 3. Çeviri: Google Ads → Advetics

| Google Ads | Advetics |
|---|---|
| Mavi vurgu (seçili ray öğesi, birincil düğme, bağlantı) | **Kırmızı** `#ff2400`: seçili ray hapı, birincil düğme. Tablo içi bağlantılar **siyah**, üzerine gelince kırmızı ve altı çizili (her satırı kırmızı yapmak vurguyu öldürür) |
| Dört renkli metrik kutuları | En çok iki seçili seri: 1. seri **kırmızı**, 2. seri **siyah**. Seçili olmayan kutu beyaz |
| Yeşil "etkin" noktası | **Kapandı (K-1):** yeşil yalnız durum için serbest. Yayında = yeşil nokta, Duraklatıldı = gri duraklat ikonu, Hata = kırmızı x; şekil + metin her zaman yanında |
| Google Sans / Roboto | Montserrat (başlık, büyük sayı) + Open Sans (gövde, etiket, tablo) |
| Açık gri zemin `#f8f9fa`, beyaz kart | Zemin `#302e2d` %4, kart beyaz, çizgi `#302e2d` %12 |
| Ray: Kampanyalar, Hedefler, Araçlar… | **GERİ ALINDI (kullanıcı, 2026-10-11):** 2026-10-09'da dar ikon rayına geçilmişti; kullanıcı geniş menüye (`components/kenar-cubugu.tsx`, bölüm başlıklı tam liste) döndürdü. Workspace seçici menünün EN ÜSTÜNDE, logonun altında. Telefonda tam liste çekmecede, seçici üst barda |
| Hesap kırıntısı + kimlik | Workspace seçici masaüstünde menünün başında (2026-10-11), telefonda üst barda |
| Hesap teşhisi + "Sorunu çöz" | Genel Bakış › **Bekleyen işler** (satır içi eylem düğmesi) |
| Öneriler + "Tümünü uygula" | İyileştir (Aşama 4), Orphex'ten farkımızın ekranı |
| Hesaplar tablosu (yönetici → alt hesap) | **Reklam Yöneticisi**: genel → şirket → workspace → hesap → mecra → kampanya → reklam seti → reklam → önizleme |

## 4. Uygulama sırası

1. Bu belge + **kabuk ve Genel Bakış taslağı** (tarayıcıda açılan HTML).
   Kullanıcı onaylamadan kod yok.
2. Onaydan sonra `globals.css` tasarım katmanı (renk/yazı/zemin token'ları)
   ve kabuk (üst çubuk, ray, flyout) — bütün ekranlar birden değişir.
3. Reklam Yöneticisi (Aşama 3) taslağı, sonra kodu.
4. Her işin sonunda tasarım denetimi (CLAUDE.md §3 "Tasarım").

---

## 5. Birleşik tasarım sistemi (kullanıcı kararları, 2026-10-14)

Genel uygulama denetimi (`docs/DENETIM-2026-10.md`) panelde İKİ tasarım
sistemi buldu: Tailwind + `globals.css` panel katmanı ve dört CSS modülünün
(`taslak`, `iyilestir`, `kreatif-zeka`, `rehber`) kendi `--t-*` token
kopyaları. Sonuç 22 farklı düğme biçimi, 6 sekme biçimi, 10'dan fazla elle
modal, 3 sihirbaz dili, 7 sayfa genişliğiydi. Kararlar:

1. **Onaylı referans uygulanır:** [`tasarim-sistemi.html`](tasarim-sistemi.html)
   ölçü ve davranışta BİREBİR. Bileşenler `apps/web/src/components/ui/`,
   kullanım kuralları [`BILESENLER.md`](BILESENLER.md).
2. **Birincil düğme DÜZ KIRMIZI.** Markadan aksana degrade ve marka tonunda
   parıltı HER YERDEN kalkar (düğme, ikon karosu, zemin ışığı, boş durum
   kutusu, grafik dolgusu). Kart gölgesi de kalkar; kartlar çizgiyle ayrılır,
   gölge yalnız açılır menü, pencere ve yan panelde.
3. **YALNIZ kılavuz renkleri.** Hata ve uyarı = marka kırmızısı (ikon + sol
   çizgi, metin siyah), bilgi = gri. Turuncu `warn`, mavi `info`, ikinci
   kırmızı `danger #dc2626` kalkar; token ADLARI duruyor (sayfalar kırılmasın)
   ama değerleri kılavuza eşli. Yeşil YALNIZ durum noktası. Karanlık tema
   siyah zemin, `#0d0d0d` yüzey, beyaz metin (eski mavi-gri `#13151c` kalktı).
4. **Ölçüler:** yarıçap 8 / 16 / tam yuvarlak; yazı 11 · 12 · 13 · 14 · 15 ·
   18 · 24 · 28; sayfa genişliği iki değer (`genis` 1400, `dar` 4xl); düğme
   iki boy (40 / 32), hepsi hap.
5. **Bekçi:** `apps/web/src/app/tasarim-sistemi.spec.ts`. Elle düğme, elle
   modal, elle `h1`, degrade ve kılavuz dışı renk dosya dosya sayılıyor ve
   liste YALNIZ KÜÇÜLÜYOR (`tasarim-sistemi.istisnalar.ts`).

Bilinçli küçük sapma: ikincil metin grinin %68'i (referans %64). %64 beyazda
4,3:1 kontrast veriyor ve 12 piksellik ipucunda 4,5 eşiğinin altında kalıyor.

## 6. Menü sistemi (kullanıcı kararı, 2026-10-14)

**Seçenek A uygulanır:** [`menu-sistemi.html`](menu-sistemi.html). Tek fark
"+ Oluştur" açılır menüsü Seçenek B'deki gibi
([`menu-sistemi-b.html`](menu-sistemi-b.html) `#ac-olustur`).

- **Sol sidebar (248 px):** logo → en üstte workspace seçici (arama, şirket
  grupları, "Tüm şirketler", şirketleri yönet) → altında kırmızı hap
  **"+ Oluştur"** → grup başlıklı yedi bölüm listesi (seçili öğe kırmızı
  zemin + kırmızı ikon, bekleyen iş sayacı) → Ayarlar → sol altta kullanıcı
  kartı (Hesabım, iki adımlı giriş, tema, çıkış). Mobilde aynı içerik soldan
  çekmece.
- **"+ Oluştur":** "Ne oluşturalım?" başlığı; her seçenek ikon + ad + bir
  satır açıklama (Reklam · "Yedi amaçtan biriyle, adım adım"; Strateji ·
  "Plan, rapor ve müşteri onayı"; Gönderi öne çıkar · "Instagram gönderisini
  boostla"; ayraç; Kural; Rapor). Hedefler menü satırlarıyla aynı adresler,
  yetkiye göre süzülür, müşteri rolüne düğme hiç çıkmaz.
- **Üst çubuk:** kırıntı (şirket › workspace › sayfa) + sağda yalnız ikon.
- **Tek açılır menü bileşeni** (`AcilirMenu`): seçici, kullanıcı menüsü,
  bildirim zili, ⋯ menüleri. DOM'da kalır, geçişle açılır, Esc kapatır, ok
  tuşları gezer, hareket azaltmada animasyon yok.
- **Sayfa içi alt bölümler** başlığın altında alt çizgili `Sekmeler` (sayı ya
  da kırmızı nokta). Ayarlar sekmeleri ve Marka Merkezi iç menüsü sayfa iç
  tasarımları taslaklandıktan sonra geçirilir. Genel Bakış'ın iç düzeni
  KALIYOR (kullanıcı beğendi), yalnız token ve düğme görünüşü değişir.

Uygulamada taslaktan sapmalar (`BILESENLER.md` § 4): üst çubukta "Ara" ve
"Yardım" ikonları yok (hedefleri yazılmadı; işlevsiz ikon gösterilmez),
workspace satırında kurulum durum noktası yok (seçicinin verisi taşımıyor).
