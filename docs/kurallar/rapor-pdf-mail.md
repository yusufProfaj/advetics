# Rapor, PDF, mail, dosya yükleme ve dış istek tuzakları

> CLAUDE.md'den taşındı (2026-10-16, token düzeni). İçerik DEĞİŞMEDİ, yalnız konuya göre ayrıldı.
> Yeni ders buraya, ilgili konu dosyasına EKLENİR; CLAUDE.md'ye yalnız tek satırlık işaret gider.

- **KULLANICI HTML'İ ÜÇ YERDE BİRDEN GÖRÜNÜYOR: SAKLA, ÖNİZLE, GÖNDER.**
  Danışman imzası panelde önizleniyor ve müşteriye giden maile gömülüyor;
  ikisi de saldırı yüzeyi. Temizlik GİRİŞTE yapılıyor ve TEMİZLENMİŞ hâl
  saklanıyor — çıkışta temizlemek, kayıtlı hâl ile gönderilen hâli ayrıştırır
  ve önizleme yalan söyler. Beyaz liste kullanılıyor; kara liste her yeni
  etikette güncellenmek zorunda. `script`/`style` GÖVDESİYLE atılıyor.
  Atılanlar kullanıcıya raporlanıyor. `imza-temizle.spec.ts`.
- **GMAIL İMZASI SMTP İLE GİDEN MAİLE OTOMATİK EKLENMİYOR** — onu Gmail'in
  arayüzü ekliyor. Ayrıca Gmail'den kopyalanan HTML görselleri kendi
  önbelleğine yönlendiriyor (`ci3.googleusercontent.com/...#gerçek/adres`);
  o adres Gmail dışında çalışmıyor ve mailde görsel KIRIK çıkıyor. `#`
  sonrası gerçek kaynak, otomatik çevriliyor.
- **PDF'TE TÜRKÇE GÖMÜLÜ YAZI TİPİ İSTİYOR.** PDF'in standart yazı tipleri
  WinAnsi kullanıyor: `ğ ş ı` orada YOK, `₺` (U+20BA) hiç yok. Gömmeden
  üretilen belgede karakterler sessizce düşüyor ya da kutu oluyor ve bunu ilk
  gören müşteri oluyor. `apps/api/assets/fonts` altında DejaVu Sans
  (normal + bold, ~1,4 MB) DEPODA duruyor — npm paketi 22 font taşıyor ve
  paylaşımlı sunucuda gereksiz yük. Font bulunamazsa AÇIKÇA patlıyor; sessizce
  standart yazı tipine düşmek en kötü davranış. `pdf-yazi-tipi.spec.ts` hem
  cmap kapsamını hem "standart yazı tipi bunu ÇİZEMİYOR" kanıtını tutuyor.
- **AYNI GÖRSEL ÖĞE İKİ KEZ ÇİZİLİYORSA ÜÇÜNCÜSÜNDE AYRIŞIR.** PDF'te üç
  tablo vardı: kampanya düzgün bir tabloydu, anahtar kelime ve arama terimi
  ise DÜZ LİSTEYDİ (solda terim, sağda birleştirilmiş metrik dizesi).
  Panelde üçü de sütunlu tablo; kullanıcının tarifi *"birbirleriyle alakası
  yok"*. Üçü artık tek çiziciden geçiyor (`tablo()` — `pdf-cizim.ts`).
  Arama terimlerinde **"Eşleşen Kelime" sütunu PDF'te hiç yoktu** ve o,
  raporun en eyleme dönük bilgisi: bir sorgu yanlış anahtar kelimeyle
  eşleşiyorsa para oraya akıyor.
- **TABLODA TAŞMA KIRPMADAN KÖTÜDÜR.** Gövde hücreleri kısaltılırken toplam
  satırı ham çiziliyordu: uzun bir toplam sütunundan taşıp komşusunun üstüne
  biniyor ve iki sayı üst üste okunmaz hâle geliyordu. Kırpma en azından
  görünür. Ayrıca para sütunu diğerlerinden GENİŞ olmak zorunda — eşit
  paylaştırmada tutar kırpılıyor ve kırpılmış bir para tutarı yanlış sayı
  göstermekle aynı şey.
- **KIRPILAN METİN ARADIĞIN İŞARETİ DE KAYBEDER.** "₺ içeren dizelerin
  hiçbirinde `…` yok" iddiası HİÇBİR ZAMAN DÜŞMÜYOR: tutar kırpılınca
  sondaki `₺` de gidiyor ve süzgeç onu zaten dışarıda bırakıyor. Bir sonraki
  denemede "beklenen tam dizeyi içeriyor" da geçti, çünkü satır kırpılırken
  TOPLAM satırındaki aynı dize kırpılmıyordu. Doğru iddia: tabloda hiçbir
  kırpma işareti olmamalı (fixture'da meşru kırpma bırakma).
- **METİN REKLAMININ "KREATİFİ" METNİDİR.** Google arama reklamının görseli
  yok ve olmayacak; yerine boş bir gri kutu koymak "burada bir görsel
  olacaktı" izlenimi bırakıyor ve raporu okuyan reklamın NE DEDİĞİNİ
  göremiyor. `creatives.description` ve `display_url` veritabanında zaten
  duruyordu ama rapora hiç taşınmıyordu. Önizleme gerçek arama sonucunun
  yapısını taklit ediyor (Reklam rozeti · görünen adres · başlık · açıklama)
  ve UYDURMUYOR: olmayan alan çizilmiyor. Metin önizlemesi görselden daha
  GENİŞ alan istiyor — 52 puntoda başlık ortasından kırpılıyor ve kırpılmış
  bir önizleme reklamı göstermek yerine gizliyor.
- **RAPOR KAPAĞINDA AJANSIN DEĞİL ADVETICS LOGOSU BASILIYOR.** Bilinçli bir
  sapma: beyaz etiketli üründe müşteriye giden belgede ajansın markası
  görünmüyor. `branding.logoUrl` panel arayüzünde kullanılmaya devam ediyor.
  Dosya DEPODA (`apps/api/assets/marka/`, `apps/web/public/`), indirilmiyor:
  uzaktan çekmek belgenin üretimini ağa bağımlı yapardı ve adres cevap
  vermediğinde rapor logosuz çıkardı. İKİ KOPYA AYRIŞAMAZ — `marka-logosu.
  spec.ts` SHA-256'larını karşılaştırıyor; biri güncellenip diğeri
  unutulursa PDF ile ekran farklı logo gösterir. Eksik logo PATLATMIYOR
  (eksik yazı tipinin aksine): kapak sadeleşiyor, rapor üretiliyor.
- **`__dirname`'e göre çözülen varlık yolu, `src` ve `dist` DERİNLİĞİNE
  BAĞLI.** Dosya bir alt dizine taşınırsa geliştirmede hiçbir şey olmuyor
  (testler `src` altından koşuyor), üretimde varlık bulunamıyor. Derinliği
  testte sabitle. `process.cwd()` de kullanılamaz: pm2 altında çalışma dizini
  garanti değil.
- **TABLO BAŞLIĞI, GÖVDESİ, TOPLAMI VE DİPNOTU TEK LİSTEDEN TÜRETİLİR.**
  Rapor kampanya tablosunda dördü ayrı ayrı elle eşleniyordu ve tek bir
  bayrakla (`showBuckets`) iki sabit sete dallanıyordu. Bir sütun eklenip
  toplamı eklenmediğinde tablo sessizce kayıyor ve TypeScript hiçbir şey
  demiyor — hepsi ayrı JSX blokları. Her sütun BİR KEZ tanımlanmalı: nasıl
  okunacağı, nasıl toplanacağı (toplanamıyorsa `null`), dipnot gerektirip
  gerektirmediği. `rapor-sutunlari.spec.ts`.
- **AYNI BELGEYİ İSTEYEN HER YOL AYNI SORGUYU KURMALI.** Rapor ekranı şablonu
  URL'de taşıyor ve üç tüketicisi vardı: önizleme, PDF indirme, mail. Üçü de
  sorgu dizesini ELLE kuruyordu ve yalnızca önizleme `sablon`u taşıyordu.
  Hiçbiri hata vermiyor — şablonsuz istek de geçerli ve sunucu varsayılanı
  üretiyor. Belirti kullanıcının cümlesiyle *"şablonu değiştirdiğimde pdf
  oluşturamıyorum"*: ekranda Google raporunu görüp Genel raporu indiriyor,
  müşteriye giden maildeki eki ise yalnızca ALICI görüyor. Tek üretici
  (`rapor-sorgusu.ts`) ve `rapor-sorgusu.spec.ts` kaynak taraması. Ayrıca
  EKRAN TEK PARAMETRE taşımalı: API `templateId` (UUID) ile `sablon` (ön ayar
  kodu) alanlarını haklı olarak ayırıyor ama ikisini URL'de ayrı taşımak,
  dallardan birinin birini düşürmesi demek.
- **SUNUCUDAN DIŞARI GİDEN HER İSTEK BEYAZ LİSTEYLE KAPATILIR.** Rapor
  PDF'i kreatif görselini platform CDN'inden indiriyor ve adres
  VERİTABANINDAN geliyor. "Platformdan geldi" güvenli demek değil: o alan bir
  gün başka bir şey taşırsa sunucu onu ÇEKER ve paylaşımlı VPS'te bu, iç ağa
  ya da bulut metadata ucuna (`169.254.169.254`) yapılmış bir istek olur.
  Kontrol: yalnızca `https`, yalnızca bilinen CDN SONEKLERİ (`endsWith` —
  `includes` kullanmak `x.fbcdn.net.evil.com`'u geçiriyor), IP literali ret,
  `redirect: 'manual'` (izlenirse beyaz liste anlamsızlaşıyor), boyut sınırı
  GÖVDE OKUNURKEN (`content-length` yalan söyleyebiliyor) ve zaman aşımı.
  `kreatif-gorseli.spec.ts` — mutasyon testi burada iki kez boşa düştü:
  `127.0.0.1` zaten sonek listesinde olmadığı için "reddedildi" iddiası IP
  kontrolü SİLİNDİĞİNDE de geçiyordu; iddia SEBEBE çapalanmak zorunda.
- **SERBEST URL İNDİRİLECEKSE KORUMA ADRESTE DEĞİL ÇÖZÜLEN IP'DE.** Kreatif
  görseli platform CDN'inden geliyor ve orada beyaz liste işe yarıyor; LOGO
  ise ajansın kendi alan adında ve liste tutmak her yeni müşteride kod
  değişikliği demek. `logoIndir` DNS'i çözüp iç ağ aralıklarını
  (`127/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16` = bulut metadata,
  `100.64/10`, `::1`, `fc00::/7`, `fe80::/10`) reddediyor — `evil.com` pekâlâ
  `169.254.169.254`e çözülebilir ve adres DİZGESİNE bakan hiçbir kontrol bunu
  göremez. Kalan risk DNS rebinding; `redirect: 'manual'` ve kısa zaman
  aşımıyla kabul edilen kalıntı.
- **AYNI RAPORUN İKİ GÖSTERİMİ VARSA REFERANS BİRİ OLMALI — ve o panel.**
  PDF'i "daha görsel" yapmaya çalışırken kendi dilimi kurdum: tam sayfa marka
  bandı, dolgulu tablo başlığı, zebra satır, veri çubuğu, pay çubuğu, sayfa
  altbilgisi. Kullanıcının tarifi *"çok pastel boya çizimi gibi olmuş"*.
  Referans `apps/web/src/components/report/report-document.tsx`: beyaz zemin,
  ince slate kuralları, çerçeveli kartlar ve marka rengi YALNIZCA üç yerde
  (bölüm alt başlığı, TOPLAM kartı dolgusu, kapaktaki kısa çizgi). Aynı
  ayrışma metinde de vardı: PDF "Harcama"/"Ort. TBM", panel "Maliyet"/"EBM"
  yazıyordu. `rapor-pdf.service.spec.ts` artık bir REGRESYON BEKÇİSİ taşıyor
  — `payCubugu`, `altbilgi(`, `acikTon(`, `const BANT` kaynakta geçerse
  düşüyor.
- **VERİDE DURAN ALAN, KULLANILMIYORSA YOKTUR.** Rapor PDF'i `branding` ve
  `daily` alanlarını HİÇ okumuyordu (servis içinde sıfır referans): marka
  rengi kullanılmıyor, panelde grafik olarak görünen günlük seri belgeye hiç
  çizilmiyordu. Kullanıcının bildirdiği hâli *"pdf çok kötü, grafikleri yok,
  boş text gibi geldi"*. Beyaz etiketli bir üründe markanın rengi müşteriye
  giden belgede görünmüyorsa ürünün ana vaadi orada yok demektir. Grafik
  VEKTÖREL çiziliyor (`pdf-cizim.ts`) — sunucuda görsel üretmek paylaşımlı
  VPS'te yeni bir ikili bağımlılık demek ve `pdf-lib` tam olarak ondan
  kaçınmak için seçildi.
- **PDF TESTİNDE METİN DÜZ ARANAMAZ — ama karakter numarasına da mahkûm
  değilsin.** Yazı tipi ALT KÜME gömülüyor, çizilen metin belgede glif
  kimliği olarak duruyor. `rapor-pdf.service.spec.ts` içindeki `metinler()`
  ToUnicode haritalarını okuyup gerçek dizgeyi çıkarıyor, böylece
  `toContain('TOPLAM')` denebiliyor. HER haritayla çözüp adayların tamamını
  döndürüyor: pdf-lib kaynak adını `DejaVuSans-9742682568` gibi ürettiği
  için hangi haritanın hangi fonta ait olduğu addan çıkarılamıyor ve yanlış
  haritayı seçmek metni sessizce kaçırıyor. Ayrıca `pdf-lib` dikdörtgeni
  `re` ile DEĞİL `m`/`l` yol komutlarıyla çiziyor — ` re` arayan bir iddia
  hiçbir zaman tutmaz.
- **`pdf-lib` YALNIZCA JPEG ve PNG gömüyor.** Meta thumbnail'ları sık sık
  WebP dönüyor ve `embedJpg` anlaşılmaz bir hata fırlatıp PDF üretiminin
  TAMAMINI düşürüyor. Biçim GÖVDEDEN anlaşılıyor (sihirli baytlar), uzantıdan
  ya da `content-type`tan değil. `embedJpg`/`embedPng` ASYNC: çizim döngüsü
  senkron olduğu için gömme önden yapılmalı — bir `as` cast'i çözülmemiş
  Promise'i `drawImage`e sokuyor ve hata yalnızca belgede, boş kutu olarak
  görünüyor.
- **`drawSvgPath` KOORDİNATI TERS ÇEVİRİYOR — çizim başarılı, yer yanlış.**
  `pdf-lib` bu çağrıda `translate(x, y)` uyguladıktan SONRA `scale(1, -1)`
  yayınlıyor (1.17.1 `operations.js`: *"SVG path Y axis is opposite
  pdf-lib's"*), yani çizilen nokta `y - pathY`. Yol noktaları MUTLAK PDF
  koordinatıyla yazılıp `y: sayfaYuksekligi` verilirse grafik sayfanın yatay
  orta ekseninde AYNALANIYOR: Kitle Özeti'ndeki dört halka merkezi 609,89
  yerine 232,00'ye, sayfanın alt çeyreğine düşüyordu ve HİÇBİR hata
  düşmüyordu. Yol noktalarını MERKEZE GÖRE yaz ve merkezi `{x: cx, y: cy}`
  olarak ver: ters çevirme o zaman işe yarıyor (SVG'nin -π/2'si PDF'te saat
  12) ve sayfa yüksekliği hesaba hiç girmiyor. Bu ters çevirme `pdf-lib`de
  YALNIZCA `drawSvgPath`te var; `drawRectangle`/`drawCircle`/`drawLine`/
  `drawText` normal PDF koordinatı kullanıyor. `halka-konumu.spec.ts`
  dönüşümü kütüphanenin kendi kaynağından da doğruluyor.
- **BİR ÇİZİMİN YAPILDIĞINI DOĞRULAMAK, NEREYE YAPILDIĞINI DOĞRULAMIYOR.**
  `rapor-sablonlari.spec.ts` `halka()`nın `drawSvgPath` kullandığını zaten
  kontrol ediyordu ve hatalı sürümde de GEÇTİ. Konum iddiası, dönüşümü
  uygulayıp sonucu ÖLÇMEK zorunda.
- **ÖNİZLEME EKLEMEK, ONU DOĞRU TUTMA BORCU YÜKLENMEK DEMEK.** Mail gövdesi
  ham HTML olarak `<textarea>`da duruyordu; render edilmiş bir kutuya
  çevirmek "bu kod" sözünü "müşterinin göreceği bu" sözüne dönüştürüyor. O
  yüzden temizleyici (`imzaTemizle`) `packages/shared`a taşındı ve panelde de
  AYNISI koşuyor — ikinci bir temizleyici doğduğu anda ayrışır ve önizleme
  sessizce yalan söylemeye başlar. Aynı sebeple `blob:`, `file:` ve `cid:`
  şemaları kara listeye eklendi: üçü de ekranda ÇALIŞIYOR, mailde ÖLÜ.
- **DOSYA TÜRÜ SAKLANMAK ZORUNDA, DOSYA ADINDAN TÜRETİLEMEZ.** Fatura PDF ya
  da ZIP olabiliyor ve tür ÜÇ yerde kullanılıyor: diskteki uzantı, mail
  ekinin `contentType`ı, panelden açarken `Content-Type` başlığı. Dosya adı
  kullanıcının verdiği ad ve gövdeyle uyuşmak zorunda değil. Biçim sihirli
  baytlardan okunuyor; okunan şey `mime_type` kolonuna yazılıyor ve kabul
  listesi veritabanında da CHECK ile dayatılıyor (`fatura-zip.spec.ts` iki
  listeyi karşılaştırıyor — ayrışırlarsa INSERT üretimde patlardı).
- **ZIP'İN ÜÇ İMZASI VAR ve ikisi kabul edilmiyor.** `PK\x03\x04` normal
  arşiv, `PK\x05\x06` BOŞ arşiv, `PK\x07\x08` çok parçalı. Son ikisi
  reddediliyor ama AYRI cümlelerle: "ZIP değil" demek, doğru dosyayı
  indirdiğini bilen kullanıcıyı olmayan bir arızayı aramaya gönderir.
  Parola korumalı arşivi sihirli bayttan ayırt etmek İMKÂNSIZ ve kurumsal
  mail sunucuları onları koşulsuz engelliyor — arayüzde açıkça yazılı.
- **YÜKLEME UCUNDA MULTER SINIRI, SERVİSTEKİ KONTROLDEN ÖNCE GELİR.** Fatura
  ucunda `FileInterceptor('file')` sınırsızdı: servisin `FATURA_MAX_BAYT`
  kontrolüne gelene kadar dosya BELLEĞE ALINMIŞ oluyordu. Diğer iki yükleme
  ucu sınırı zaten koyuyordu; paylaşımlı VPS'te bu diğer siteleri de etkiler.
- **ÇOKLU ALICI, KISMİ REDDİ SESSİZ BİR HATAYA ÇEVİRİYOR.** nodemailer tek
  alıcıda ret = "hepsi reddedildi" olduğu için FIRLATIYOR; birden çok alıcıda
  bazıları reddedilse bile `sendMail` BAŞARIYLA dönüyor ve ret yalnızca dönüş
  nesnesindeki `rejected` alanında duruyor (9.0.5 `smtp-connection/index.js`:
  `if (rejected.length < to.length)`). Yani çoklu alıcıya geçmek bu sessiz
  hatayı KENDİ ELİMİZLE açıyor. `mailGonder` artık `{ kabul, ret }` döndürüyor
  ve iki gönderim yolu da `ret`i ekrana/nota taşıyor.
  `mail-gonderici.spec.ts` davranışı kütüphanenin kendi kaynağından da
  doğruluyor.
- **TEKİLLİĞİ KALDIRMADAN ÖNCE NEYİ KORUDUĞUNU SOR.** `fatura_belgeleri`
  `(müşteri, platform, dönem)` tekildi; "bir döneme birden çok fatura" isteği
  gelince onu atmak akla yakın görünüyordu. Atmak YENİ bir sessiz hata açardı:
  aynı PDF iki kez yüklenince müşteriye aynı belge iki ek olarak gider.
  Tekillik kaldırılmadı, dosyanın İÇERİĞİNE (SHA-256) taşındı.
- **MAİL SAĞLAYICISININ SINIRI HAM BOYUTA BAKIYOR, KODLANMIŞ BOYUTA DEĞİL.**
  Burada tersini yazmıştım: "25 MB sınırı telden geçen boyuta bakıyor, base64
  %33 şişiriyor, o yüzden ham bütçe 15 MB olmalı". Google'ın kendi dokümanı
  sınırların *"the total size of the message content and attachments BEFORE
  ENCODING"* için yazıldığını söylüyor — yani 25 MB HAM. Kendi kendime koyduğum
  sınır gereksizce dardı ve kullanıcının arşivi maile hiç girmiyordu. Bugün
  dosya başına 20 MB, toplam mesaj bütçesi 22 MB.
- **BÜTÇE TOPLAM OLMAK ZORUNDA — TEK BİR EK TÜRÜNÜ SAYMAK YETMİYOR.** Fatura
  bütçesi rapor PDF'inin payını hesaba katmıyordu: 22 MB fatura + 3 MB PDF,
  sağlayıcının sınırını tam üstünden aşıyor ve mail SUNUCUDA reddediliyordu.
  `raporEkleri` artık kullanılmış baytı parametre alıyor. PARAMETRENİN
  VARSAYILANI 0 olduğu için çağıranın onu geçirmemesi hem derlemede hem
  servis testinde SESSİZ — iki gönderim yolunu kaynak taramasıyla kilitle
  (`fatura.spec.ts`), mutasyonla ölçüldü.
- **KULLANICIYA GÖSTERİLEN SINIR SABİTTEN TÜREMELİ.** Panelde "Üst sınır
  10 MB" ELLE yazılıydı; sınır 20 MB'a çıkınca mesaj kullanıcıya YANLIŞ sayıyı
  söylemeye başladı ve hiçbir test bunu görmedi.
