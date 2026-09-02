# Advetics — çalışma kuralları

Bu dosya her oturumda otomatik yükleniyor. Projeye dair **durum** bilgisi burada
değil, [`docs/DURUM.md`](docs/DURUM.md) içinde; burası **nasıl çalışılacağı**.

Advetics, Profaj ajansı için yazılan beyaz etiketli bir AdTech SaaS'ı.
**Yalnızca Meta (Facebook/Instagram) ve Google Ads** destekleniyor — başka
platform eklenmesi istenmedi ve eklenmemeli.

---

## 1. Sunucu: ASLA ihlal edilmeyecek kurallar

Üretim sunucusu (Hostinger VPS, CloudPanel) **paylaşımlı**. Advetics'in
yanında **11+ canlı üretim sitesi** barındırıyor — bir kısmı ajansın kendi
müşterilerine ait. Sunucu paneli de aynı makinede ve root'un pm2'si diğer
sitelerin süreçlerini yönetiyor.

> Sunucu adresi, ana makine adı ve diğer sitelerin listesi **bu depoda bilerek
> yok**: depo herkese açık ve o bilgiler hem saldırı yüzeyi hem de üçüncü
> tarafların iş bilgisi. Erişim bilgileri parola yöneticisinde.

Kullanıcının açık talimatı:

> "advetics projesi dışında diğer projelere hiçbir şekilde DOKUNMAYACAKSIN,
> öyle bir kod YAZMAYACAKSIN."

Bundan türeyen kesin kurallar:

- **Dosya işlemleri yalnızca `/home/advetics/**` altında.** Başka bir site
  kullanıcısının dizinine yazma, okuma bile gereksizse yapma.
- **Sistem geneli hiçbir şey değiştirilmez**: `/usr/bin/node`, `redis.conf`,
  `postgresql.conf`, `systemctl restart`, `npm install -g`, UFW kuralları.
  Eksik bir bileşen varsa **bildir ve dur**, kendi başına kurma.
- **Veritabanı**: yalnızca `advetics` DB ve `advetics_*` rolleri.
- **pm2**: yalnızca `advetics` kullanıcısı olarak, yalnızca `advetics-api`,
  `advetics-web`, `advetics-worker`. Root altında **asla** `pm2 save`,
  `pm2 kill`, `pm2 delete all`.
- **Deploy asla root ile yapılmaz.** `git pull` da dahil — root ile çekilen
  dosyalar root'a ait kalıyor ve sonraki deploy'lar "Permission denied" veriyor.
  Doğrusu: `su - advetics` → `cd ~/htdocs/advetics.com` → `git pull` →
  `./scripts/deploy.sh`. Script root'u zaten reddediyor.
- **Yıkıcı bir şey gerekiyorsa önce sor.**

**Neden bu kadar katı:** 2026-08-05'te `vps-setup.sh`'ın ilk sürümü sistem
Node'unu düşürdü, Redis ve PostgreSQL config'lerini değiştirip servisleri
yeniden başlattı; `deploy.sh` root ile koşunca root'un pm2 dump'ı yalnızca
Advetics'in süreçleriyle kaldı ve sunucu yeniden başlasa altı site
kalkmayacaktı. Advetics henüz canlı değilken başkasının üretimi riske girdi.

## 2. Gizli bilgiler

- **Parolalar, token'lar, app secret'lar repoya YAZILMAZ** ve sohbete geri
  yansıtılmaz. Kullanıcı geçmişte sohbete parola yapıştırdı; bunlar tekrar
  edilmemeli.
- Seed script'leri parolayı **yalnızca ortam değişkeninden** okur
  (`SEED_ADMIN_PASSWORD` vb.), koda gömülmez.
- `.env` dosyaları git'te yok ve olmamalı. **Tek bir `.env` var ve DEPO
  KÖKÜNDE** — API, panel ve bütün `prisma/` script'leri oradan besleniyor
  (`resolve(__dirname, '../../../.env')`). Burada bir süre "sunucuda
  `apps/api/.env` altında" yazıyordu; yanlıştı ve `seed-portfolio.ts` tam da
  o yanlış yolu okuduğu için "Environment variable not found: DATABASE_URL"
  ile düşüyordu. `seed-env-path.spec.ts` artık yolu kilitliyor.

## 3. Kod yazarken

### Yorumlar Türkçe ve NEDENİ anlatıyor

Bu kod tabanının ayırt edici özelliği bu. Yorum "ne yaptığını" değil **neden
öyle yapıldığını** ve **alternatifin neyi bozacağını** yazıyor. Örnek:

```ts
// KARE HER ZAMAN İLK. Kreatif tek görselli yolda ilk elemanı kullanıyor
// ve orada kare olmalı; sıra veritabanından rastgele gelirse dikey görsel
// akışta çıkardı.
```

Yeni kod da bu tonda olmalı. Süslü değil, somut: neyin yanlış gideceğini söyle.

### Sessiz hata bu projenin baş belası

Bu projede çıkan hataların neredeyse tamamı **sessizdi**: hata yok, log yok,
sadece yanlış bir sayı ya da hiçbir şey yapmayan bir özellik. Tasarım kararları
buna göre veriliyor:

- **Sessiz kesme yok.** Her listede kaç kayıt gösterildiği ve toplamın kaç
  olduğu yazılıyor.
- **Platformun varsayılanına güvenme.** Meta'ya bir alanı göndermemek, kararı
  hesabın ayarına bırakmak demek — aynı kod iki müşteride farklı davranır.
- **Tahmin etmektense kısıtla.** Bir API alanının nereye yazılacağı canlıda
  doğrulanamıyorsa, platformun *kabul edip görmezden gelme* ihtimali var
  demektir; bilinen yola düş ve kısıtı kullanıcıya **söyle**.
- **Doğrulama kullanım anında değil, giriş anında.** Kullanıcı yüklediği
  görselin kullanılamayacağını tıkladığında değil bıraktığında öğrenmeli.
- **`.catch(() => setX([]))` YASAK.** Arayüzde hatayı yutmak, "henüz
  aramadım", "arıyorum", "sonuç yok" ve "çağrı düştü" hâllerini AYNI boş alana
  çeviriyor. Dördü farklı iş ve dördü ayrı yazılmalı; hata durumunda platformun
  kendi mesajı ekranda görünmeli. Lokasyon aramasının neden boş döndüğü tam
  bu yüzden teşhis edilemedi.
- **Boş liste NEDENİNİ söylesin.** "Sayfa atanmamış", "izleme kapalı",
  "süpürme koşmadı" üçü de boş liste olarak görünüyordu ama üçünün yapılacak
  işi farklı (`emptyReason` deseni).
- **"200 döndü" doğrulama değil.** Yazma yolları platformda GÖZLE
  doğrulanmadan bitmiş sayılmıyor.

### Tekrar eden teknik tuzaklar

- **`Prisma.sql` YORUMUNUN İÇİNDE İNTERPOLASYON DA KULLANMA.** Backtick
  tuzağının kardeşi: etiketli şablonda yorumun içindeki `${...}` metin değil
  BAĞLI PARAMETRE oluyor ve sorgunun ortasına yerleşip onu bozuyor. Bir
  sabitin DEĞERİNİ yoruma yazma, ADINI yaz. (Bu tuzağı *anlatan* yorumun
  kendisi de aynı sebeple patladı — açıklama kelimeyle yapılmalı.)
- **`Prisma.sql` şablonu içindeki SQL yorumlarında backtick KULLANMA.** Şablonu
  ortasından kapatıyor; hata `TS1005: ';' expected` ve sebebi hiç belli olmuyor.
  `sql-template.spec.ts` bunu tarıyor. **Kural `--` satırlarıyla sınırlı DEĞİL:
  `/* */` blok yorumu ve sorgunun üstündeki JSDoc de aynı şablonun içinde.**
  Bu oturumda dört kez aynı yere düşüldü ve tarama yalnızca `--` baktığı için
  hiçbirini yakalamadı; TypeScript'in gösterdiği satır her seferinde kusursuz
  görünen SQL'di. `sql-template.spec.ts` artık yorum biçimine HİÇ bakmayan
  ikinci bir dedektör taşıyor (`erkenKapananSablonlar`): bir `Prisma.sql`
  şablonu kapandıktan sonra gelen ilk anlamlı karakter SQL gibi görünüyorsa
  şablon ortasından kapanmış demektir.
- **Yeni tablo ekleyince `test/pglite-harness.ts` içindeki `TRUNCATE` listesine
  ekle.** Yoksa testler arası veri sızar — en yanıltıcı test hatası türü.
- **Yeni tablo ekleyince `prisma/sql/02_rls.sql` içindeki tablo listesine ve
  politikalara ekle.** `rls-coverage.spec.ts` eksikse düşer.
- **Enum'a değer eklemek AYRI migration dosyası ister.** `ALTER TYPE ... ADD
  VALUE` ile eklenen değer aynı transaction içinde kullanılamıyor.
- **`audit_logs.id` BIGSERIAL**, UUID değil — insert'te `id` verme.
- **Meta `image_hash` REKLAM HESABI BAŞINA.** Bir hesabın hash'i diğerinde
  çalışmaz; `asset_platform_refs` bunu tutuyor.
- **`ad_accounts.external_id` Meta'da `act_` önekiyle geliyor.** Önek elle
  eklenmez, `actPath()` kullanılır.
- **UPDATE sonrası YENİ satır, tablonun SELECT politikasından da geçmek
  zorunda.** Bir satırı, kendi görüş alanının DIŞINA taşıyan bir UPDATE
  reddediliyor: `new row violates row-level security policy`. WITH CHECK'i
  gevşetmek çözmüyor, engel SELECT politikasında. Çözüm çağıran tarafta:
  bağlamı daraltan değeri (örneğin `activeClientId`) o istek için kapat.
  `ad-account-pool-rls.spec.ts` bunu kilitliyor.
- **KUYRUK ÖNCELİĞİ BİR BARİYER DEĞİL.** `structure` (öncelik 4) ile
  `initial_backfill` (10) art arda, gecikmesiz kuyruğa giriyordu ve sıranın
  "garanti" olduğu sanılıyordu. Worker `concurrency: 4` ile çalışıyor: yapı
  işi hâlâ koşarken metrik işi ikinci bir slotta başlayabiliyor. Kampanya
  satırı henüz yokken gelen metrikler eşlenemeyip atlanıyor. Bağımlılık
  isteniyorsa ya işin SONUNDA zincirle ya da başarısızlığı tekrar denenebilir
  yap; öncelik yalnızca sıralama ipucu.
- **`succeeded` + `rows = 0` BU PROJEDE BİR HATA TÜRÜ.** Metrik işi hiçbir
  satır yazamadığında başarılı sayılıyordu ve BİR DAHA denenmiyordu; belirtisi
  "atadım, veri gelmiyor" ve teşhisi yalnızca worker log'unda. İki durum
  ayrılmak zorunda: yapı taraması HİÇ koşmadıysa geçici (tekrar denenmeli),
  koştuysa varlık gerçekten yok (arşivlenmiş kampanya — tekrar denemek beş kez
  kota harcar). Atılan satır sayısı ve not artık `sync_jobs`'a yazılıyor.
- **BAĞIMLI İŞ, BAĞLI OLDUĞU İŞİN KOTASINI YİYEBİLİR — ÖNCE KONTROL, SONRA
  ÇAĞRI.** Yapı taraması hiç koşmamış bir hesapta metrik işi 3.151 satır
  çekip hiçbirini yazamıyor, tekrar denenebilir sayılıp beş kez daha aynı
  şeyi yapıyor, hesabın kota yüzdesini %90'ın üstüne çıkarıyor ve kota
  bekçisi bundan sonra YAPI TARAMASINI DA reddediyor (`structure` katmanının
  sınırı da %90). Yapı koşamadığı için metrikler hiç eşlenemiyor — kalıcı
  kilit. Ön koşul kontrolü platform çağrısından ÖNCE yapılmalı: maliyeti
  sıfır çağrı olan bir ret, bağımlılığına nefes alacak yer bırakıyor.
- **YAVAŞ BİR ÖN KOŞUL, BAĞIMLI İŞİN DENEMELERİNİ TÜKETİYOR.** Büyük bir
  hesapta yapı taraması dakikalarca sürüp birkaç kez düşerken, geçmiş çekimi
  beş denemesini de "yapı hiç koşmadı" diyerek harcıyor — her seferinde
  doğru davranarak. Yapı sonunda başarıyor ama geçmiş çekimi kalıcı `failed`
  ve kendiliğinden bir daha denenmiyor (gecelik süpürme yalnızca son 7 gün).
  Panelde "Yapı: 13:06 · Metrik: hiç". Ön koşul BİTTİĞİNDE bağımlı işi
  yeniden kuyruğa al; koşulu dar tut (yalnızca hiç metrik yoksa), yoksa 6
  saatte bir 90 günlük çekim tetiklenir. `yapi-sonrasi-gecmis.spec.ts`.
- **META SAYFA BOYUTU SABİT OLAMAZ: "reduce the amount of data".** Büyük bir
  reklam hesabında `limit=500` ile yapı taraması HTTP 500 ve *"Please reduce
  the amount of data you're asking for"* ile düşüyor. Kabul edilen boyutun
  sabit eşiği yok — hesabın büyüklüğüne, alan setine ve o anki yüke göre
  değişiyor, yani aynı istek bir hesapta çalışıp diğerinde düşüyor. Sabit
  küçük limit koymak bütün hesaplarda 10× çağrı demek; doğrusu hatayı görünce
  limiti YARILAYIP AYNI SAYFAYI tekrar istemek. Küçültülen limit sonraki
  sayfalarda da korunmalı (Meta'nın `paging.next` bağlantısı kendi limitini
  taşıyor). Hata kod/subcode ile ayırt edilemiyor (çoğu zaman kod 1 =
  "unknown"); ayıran tek şey mesaj. `meta-sayfa-boyutu.spec.ts`.
- **MÜKERRER ENGELİ KALICI KİLİT ÜRETEBİLİYOR — VE İZ BIRAKMIYOR.** Tarih
  taşımayan işlerde (`structure`) kuyruk kimliği sabit; `enqueue` aynı
  kimlikli bir iş görünce `enqueued: false` dönüyordu ve bu, `sync_jobs`
  satırı YAZILMADAN ÖNCE oluyordu. Kotaya takılıp `delayed`e düşmüş bir yapı
  taraması, kullanıcının bastığı her "Şimdi güncelle"yi sessizce yutuyor,
  panelde "Yapı: hiç" yazıyor ve o hesaba ait tek bir yapı satırı bile
  görünmüyordu. Artık `active`/`delayed` iş yaşlıysa (30 dk) ya da kullanıcı
  ekranda bekliyorsa (interactive) takılmış sayılıp kaldırılıyor; işler
  upsert olduğu için tekrar koşmak güvenli. `takilmis-is.spec.ts`.
- **TEŞHİS EKRANI "SON İŞ" GÖSTERİYORSA ARIZAYI GİZLER.** Daha yeni bir
  metrik işi, kotaya takılmış yapı taramasını görünmez yapıyordu. İş TÜRÜ
  başına satır göster: bir tür hiç görünmüyorsa o iş hiç kuyruğa girmemiş
  demek ve bu da bir cevap.
- **ZAMANLANMIŞ İŞ, İHTİYACI OLAN PARAMETREYİ ÜRETEN DALLA BİRLİKTE
  EKLENİR.** `sweep:keywords` her gece `keyword_insights` kuyruğa atıyordu
  ama `datesForJob` o tür için dal taşımıyordu; iş her gün
  `[missing_dates]` ile düşüyor ve Google anahtar kelime verisi HİÇ
  toplanmıyordu. Tek iz `sync_jobs`'taydı, okuyan yoktu.
  `sweep-dates.spec.ts` zamanlayıcı listesiyle türeticiyi karşılaştırıyor.
- **PLATFORMA GİDEN İSTEKTE ATIF/RAPORLAMA AYARLARI AÇIKÇA YAZILIR.** Meta
  insights çağrısı `use_unified_attribution_setting` ve `action_report_time`
  göndermiyordu; karar hesabın varsayılanına kalıyordu ve iki müşteride farklı
  pencere = karşılaştırılamayan CPA/ROAS, sıfır hata mesajı. Varsayılanı bile
  olsa açıkça yaz: varsayılan değiştiğinde rakam haber vermeden kayar.
  `meta-attribution.spec.ts` bunu tarıyor.
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
- **BAĞLANTIYI ELLE BİRLEŞTİRME — SÜZGEÇ DÜŞÜYOR.** Panel süzgeçleri URL'de
  taşıyor ve her sekme kendi bağlantısını elle kuruyordu; kırılım sekmesi
  `platform`ı düşürüyordu, yani "Meta" seçip seviye değiştiren kullanıcı
  sessizce bütün platformlara dönüyordu. Özel tarih aralığı gelince taşınacak
  anahtar sayısı üçten beşe çıktı. Tek üretici (`lib/baglanti.ts`) ve taşınan
  parametreleri tek yerde kur. Belirti "aralık/süzgeç bazen kayboluyor" ve
  hiçbir ekranda görünmüyor.
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
- **AYNI İŞİN PARÇASI OLAN EKRANI AYRI SAYFAYA KOYMAK HATA ÜRETİYOR.** Şablon
  düzenleme ayrı sayfadaydı: kullanıcı bölüm sırasını düzenleyip rapora
  dönüyor, seçiciden bir ön ayar seçiyor ve düzenlemesi kayboluyordu — seçici
  yalnızca ön ayarları tanıyordu ve `sablon` parametresi kayıtlı şablonu
  eziyordu. Ayrılık dekor değil, hatanın SEBEBİYDİ.
- **AYNI SÜZGECİ İKİ YERDE YAZMA.** Zamanlanmış süpürme hesabın platform
  durumuna bakıyordu, elle tetikleyen uç bakmıyordu; belirtisi "elle basınca
  geliyor, kendiliğinden gelmiyor" ve hiçbir ekranda görünmüyordu. Süzgeç tek
  sabitte (`SUPURME_HESAP_KOSULU`) ve teşhis ekranı da onu okuyor.
- **PRISMA `include` İLİŞKİNİN BÜTÜN KOLONLARINI ÇEKİYOR — `select` KULLAN.**
  `/connections` listesi `include` ile kuruluydu ve havuzda 481 reklam hesabı
  varken her satırın `raw` (tam platform yanıtı, JSONB), `rate_limit_state` ve
  `page_access_token_enc` (ŞİFRELİ SAYFA TOKEN'I) kolonlarını da okuyordu;
  hepsi `toSummary` içinde atılıyordu. Yük YANITTA GÖRÜNMÜYOR — yanıt zaten
  doğru, pahalı olan ona giden yol. Panelde "yavaş" olarak bildirilen şeyin
  ölçülebilir kısmı buydu ve şifreli token'ın belleğe alınması ayrı bir
  sorundu. Alan listesini `satisfies Prisma.XSelect` ile sabit tut ve satır
  tipini `GetPayload<{ select: typeof SABIT }>` ile ONDAN TÜRET: ayrı
  yazılırsa biri güncellenmediğinde TypeScript susar.
  `connections-select.spec.ts` bunu kilitliyor.
- **`$queryRaw<T>` DENETİMSİZ bir dönüşüm — tip yalan söyleyebilir.** Satır
  tipine alan eklerken SELECT'e de eklemeyi unutma; TypeScript hiçbir şey
  demiyor, alan `undefined` geliyor ve onu kullanan kod sessizce yanlış üretiyor.
  Aynı boşluk `serverApiFetch<T>` için de geçerli.
- **Platform çağrısı transaction'ın İÇİNDE olamaz.** `withTenant` etkileşimli
  bir transaction açıyor ve Prisma'nın sınırı 5 saniye; Meta'ya üç-dört çağrı
  üretimde 12,5 saniye sürdü. Transaction ölünce hata bile kaydedilemedi.
  Yürütücüye hazır bir `tx` değil bir ÇALIŞTIRICI ver, platform çağrısı iki
  kısa transaction'ın arasında kalsın.
- **Kayıt yazılamazsa satır `failed` DEĞİL `creating` kalmalı.** `failed`
  yazmak satırı yeniden denenebilir yapar ve platformda İKİNCİ bir kampanya
  açar — para harcayan mükerrerlik.
- **`PlatformApiError` bir `HttpException` DEĞİL.** `AllExceptionsFilter`'da
  kendi dalı olmazsa son dala düşüyor ve "izin yok", "kota doldu", "hesap
  bulunamadı", "geçersiz alan" hepsi panelde **"Beklenmeyen bir hata oluştu"**
  oluyor. Bu cümle bu projede bir turu tamamen kaybettirdi.
- **ÇOK ADIMLI SİLMEDE RİSKLİ ADIM ÖNCE, PAHALI ADIM SONRA.** `reset-clients`
  önce 4.340 metrik satırını siliyor, sonra müşterileri siliyordu. Müşteri
  silme `draft_ads_creative_id_fkey` (`onDelete: Restrict`) engeline takıldı ve
  script düştü: **metrik verisi gitti, müşteriler durdu** — en pahalı yarısı
  yapıldı, işe yarayan yarısı yapılmadı. Metrik Meta'da 37 aylık sınıra
  takılıyor ve Google'da yeniden çekmek kota harcıyor; müşteri satırı ucuz.
  Sıra tersine çevrildi. Ayrıca `Restrict` taşıyan bağın işaret ettiği satırlar
  cascade'den ÖNCE elle silinmeli: müşteri silinince iki cascade dalı birden
  işliyor (`ad_creatives` ve `draft_campaigns`) ve Postgres kreatifi silmeye
  kalkınca taslak reklam engeli tetikliyor. `reset-clients-guards.spec.ts`
  sırayı kilitliyor.
- **TEKİL ANAHTARIN KAPSAMI, SAHİPLİĞİ GÜNCELLEYEN KODUN KAPSAMIYLA AYNI
  OLMAK ZORUNDA.** `ad_accounts` tekil anahtarı `(platform, external_id,
  org_id)` — BAĞLANTIYA bağlı değil. Yani aynı reklam hesabı ikinci bir
  bağlantıyla keşfedilince İKİNCİ SATIR AÇMIYOR, var olan satır güncelleniyor
  ve `connection_id` yeni bağlantıya geçiyor. Ama upsert `client_id`'yi
  bilerek güncellemiyordu (havuz modelinde doğruydu: "Hesapları yenile"
  atamaları sıfırlamamalı). Sonuç yarım bir satırdı: BAĞLANTISI yeni
  workspace'i, ATAMASI hâlâ boşu gösteriyor. Bu satır `{ connectionId,
  clientId }` ile arayan hiçbir sorguya düşmüyor — izleme açılmıyor, geçmiş
  veri gelmiyor, ekran "bağlandı" diyor. Sahiplenme YALNIZCA `client_id IS
  NULL` satırlarda yapılıyor; başka müşteriye atanmış bir hesabı taşımak,
  gerçek bir belirsizliği sessizce çözmek olurdu. `hesap-sahiplenme.spec.ts`
  bunu kilitliyor.
- **KISMİ TEKİL İNDEKS + SON DURUMU OLMAYAN DURUM MAKİNESİ = KALICI KİLİT.**
  `boosts_active_post_uniq` `'active'` durumunu kapsıyordu ama hiçbir kod yolu
  bir boost'u o durumdan ÇIKARMIYORDU — durum listesinde "bitti" karşılığı
  yoktu. Sonuç: bir gönderi bir kez boostlandıktan sonra BİR DAHA ASLA
  boostlanamıyordu ve belirtisi kodda değil arayüzde görünüyordu ("düğme hep
  kapalı"). Kampanya Meta'da çoktan durmuştu; eksik olan yalnızca bizim
  kaydımızdı. Kısmi indeksin yüklemine bir durum yazarken **o durumdan çıkışı
  kimin yazdığını** göster. `boost-completion.spec.ts` bunu kilitliyor.
- **AYNI ŞEYİ ÜRETEN İKİNCİ FONKSİYON, DOĞDUĞU ANDA AYRIŞIR.** Meta hedefleme
  nesnesini üreten iki fonksiyon vardı; ikisi de derleniyor, ikisi de
  "çalışıyordu". Farklar: biri `regions`/`cities` kovalarına `{ key }` nesnesi
  koyuyordu (canlıda öğrenilmiş doğru biçim), diğeri DÜZ STRING; biri
  `age_max = 65`'i göndermiyordu (Meta'da 65 = "65 ve üzeri"), diğeri her
  zaman gönderiyordu. Yani ön ayarında il seçen müşterinin reklamı ya
  reddedilecek ya da sessizce ülke geneline çıkacaktı. Bugün tek dosyada:
  `meta-targeting.ts`, ve `meta-targeting.spec.ts` yayın yollarının kendi
  `geo_locations` nesnesini kurmasını yasaklıyor.
- **DENORMALİZE EDİLMİŞ SAHİPLİK KOLONU, SAHİP DEĞİŞİNCE KENDİLİĞİNDEN
  TAŞINMIYOR.** `client_id` on beş tabloda BİLEREK denormalize (RLS
  politikaları join'siz yazılabilsin diye). `assignAdAccount` yalnızca
  `ad_accounts.client_id`'yi güncelliyordu: hesap A'dan B'ye geçince A'nın
  raporunda ARTIK ONA AİT OLMAYAN harcama görünmeye devam ediyor, B hiçbir
  geçmiş göremiyor ve bir sonraki senkronizasyon yeni satırları B'ye yazıp
  eskileri A'da bırakarak geçmişi İKİYE BÖLÜYOR. Üçü de sessiz. Ayrım tek
  yerde: `hesap-verisi-tasima.ts`. Platformun aynası ve ölçülmüş metrik
  TAŞINIYOR (kampanya, grup, reklam, kreatif, metrikler, `sync_jobs`);
  birinin KARARI olan kayıt kalıyor (bütçe, kural, boost, taslak, toplu
  işlem) ve sayısı kullanıcıya söyleniyor. Süzgeç `ad_account_id` — panelde
  atama iki adımlı yapılıyor (önce "Kaldır", sonra "Ata") ve ikinci adımda
  önceki müşteri artık bilinmiyor.
- **UPSERT, DENORMALİZE SAHİPLİK KOLONUNU DA GÜNCELLEMEK ZORUNDA.** Yedi
  `ON CONFLICT DO UPDATE` bloğunun hiçbiri `client_id` yazmıyordu; `creatives`
  upsert'i `ad_account_id = EXCLUDED.ad_account_id` yazıp `client_id`'yi
  atlıyordu. Sonuç: satır yarım — hesabı doğru, müşterisi eski — ve "yeniden
  senkronize et" tavsiyesi de işe yaramıyor. `upsert-client-id.spec.ts`.
- **POLİTİKASI OLMAYAN UPDATE HATA VERMEZ, SESSİZCE SIFIR SATIR ETKİLER.**
  `sync_jobs`'ta yalnızca SELECT ve INSERT politikası vardı; taşıma sekiz
  tablodan yedisini taşıyıp sekizincisini sessizce atlıyordu ve belirtisi
  yeni müşteride "Yapı: hiç · Metrik: hiç" oluyordu — düzeltilen hatanın ta
  kendisi. **Bir RLS testi "patlamadı" ile yetinemez: `RETURNING` ile ETKİLENEN
  SATIRI say.** İlk yazdığım test sekiz tabloyu saydığını sanıyordu ama
  yalnızca ikisine satır yazıyordu; sıfır satırlık UPDATE politikadan bağımsız
  olarak başarılı dönüyor ve test yeşildi. `hesap-tasima-rls.spec.ts`.
  RLS politikaları Prisma migration'ının parçası DEĞİL: `02_rls.sql`
  `deploy.sh` içindeki `db:rls` ile uygulanıyor.
- **AYNI SORGUDAKİ HER DAL AYNI SÜZGECİ TAŞIMALI.** Kural motorunun bütçe
  bekçisinde `spend`, `umbrella` ve `ad_accounts` `client_id` ile süzülüyordu,
  yalnızca `monthly_budgets` join'i atlanmıştı. Hesap el değiştirdiğinde
  bütçe eski müşteride kalıyor (kasıtlı) ve o satır B'nin harcamasına
  bölünüyor — `budget_spent_ratio` koşulu B'nin kampanyalarını DURDURUYOR.
  İki müşterinin de satırı varsa join iki satır üretiyor ve hangisinin
  kazandığı belirsiz.
- **HAVUZ SATIRLARI MÜŞTERİ-KAPSAMLI SAYIMA GİRMEZ — VE RLS SENİ KORUMUYOR.**
  Genel Bakış'taki "N hesap izlenmiyor" sayacı `ad_accounts WHERE sync_enabled
  = false` diyordu. Keşif her hesabı `false` ile yazıyor ve ajansın tek Meta
  kimliği yüzlerce hesap görüyor; `adv_ad_accounts_select` politikası da
  havuzu (`client_id IS NULL`) org yöneticisine BİLEREK açıyor (atama
  ekranının çalışması buna bağlı). Sonuç: her müşterinin panelinde "481 hesap
  izlenmiyor" yazıyordu — uyarı hiçbir zaman sıfıra inmiyor, okunmaz hâle
  geliyor ve GERÇEK bir kapalı hesap aynı cümlenin içinde kayboluyor. Sayım
  `client_id IS NOT NULL` demek zorunda; ekrandaki süzgeç (hesap, platform)
  sayıma da uygulanmalı.
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
- **REKLAM SEVİYESİ GEÇMİŞ ARTIK ÇEKİLİYOR — ama pencere PARÇALANARAK.**
  `initial_backfill` uzun süre 90 günü yalnızca kampanya seviyesinde
  çekiyordu; gerekçe kotaydı, bedeli üretimde görüldü: temmuz raporunun
  "Öne Çıkan Reklamlar" sayfasında dört Google arama reklamı vardı, tek Meta
  reklamı yoktu — reklam kırılımı yalnızca gecelik `insights_daily` (dün) ve
  7 günlük `insights_backfill`ten geliyordu, yani o dönemde gecelik
  senkronize etmeyen hesabın reklam verisi HİÇ oluşmuyordu. Kullanıcı kota
  maliyetini bilerek reklam seviyesini istedi; liste artık
  `['campaign', 'ad_group', 'ad']`.
  **Meta insights `time_increment=1` ile gidiyor, yani yanıt GÜN × VARLIK
  satırı taşıyor: 90 gün × reklam seviyesi tek istekte "reduce the amount of
  data" ile düşüyor ve sayfa yarılama bunu KURTARMIYOR** (gövde zaten çok
  büyük). Derin seviyeler (`ad_group`, `ad`) 15 günlük parçalar hâlinde
  isteniyor, sığ seviyeler tek istekte. Her parça HEMEN yazılıyor: sonda
  toplu yazmak, doksan günlük çekimin son adımdaki bir hatayla tamamen boşa
  gitmesi demekti. Parçalama matematiği saf bir fonksiyonda
  (`istekPencereleri`) ve ÇALIŞTIRILARAK sınanıyor — bir günlük boşluk
  sessizce eksik veri, bir günlük örtüşme boşa çağrı ve ikisi de kaynak
  taramasıyla görünmüyor.
  Değişiklik İLERİYE DÖNÜK: `initial_backfill` yalnızca hesap ilk atandığında
  kuyruğa giriyor, geçmiş dönemler kendiliğinden dolmuyor.
  `topAdsMissingPlatforms` yine de duruyor ve gerekli: harcaması olan ama
  `entity_level = 'ad'` satırı bulunmayan platformları hem PDF hem panel
  LİSTENİN ÜSTÜNDE yazıyor. Hiç harcamamış platform bildirilmiyor — her
  raporda duran bir uyarı okunmaz hâle gelir.
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
- **ZORUNLU ALANI EKSİK BIRAKAN FIXTURE, EKSİK KAPSAMIN KENDİSİDİR.**
  `rapor-pdf.service.spec.ts` fixture'ında `breakdowns` hiç yoktu; TypeScript
  bunu `TS2741` ile söylüyordu ama **vitest tip denetimi yapmıyor** ve 259
  test, Kitle Özeti sayfası HİÇ ÜRETİLMEDEN yeşil geçiyordu. Kırmızı bir
  typecheck kimseyi uyarmıyor — `pnpm --filter @advetics/api typecheck`
  temiz tutulmalı, yoksa gerçek uyarı gürültünün içinde kayboluyor.
- **NEST MODÜL KAYDI DERLEMEDE DEĞİL AÇILIŞTA PATLIYOR.** Depoda bağımlılık
  grafiğini ayağa kaldıran bir test yok: `nest build` başarılı olur, grafik
  çözülemez ve hata deploy'un ortasında görünür. Yeni bir servis eklerken
  sağlayıcı listesini ve `imports`u kaynak taramasıyla kilitle
  (`kreatif-adresi.spec.ts` sonundaki blok).
- **ÖZYİNELEMENİN DURMA KOŞULUNU SUNUM DEĞİŞKENİNE BAĞLAMA.** Meta kreatif
  adresi çekiminde liste hatada yarılanıyor ve durma koşulu `tekli`ye
  bağlıydı — o değişken URL BİÇİMİNİ seçiyor (`?ids=` mi düğüm yolu mu), uzunluğu
  değil. Biri onu sabitlerse `Math.floor(1 / 2) = 0` yüzünden `slice(0)` aynı
  tek elemanlı listeyi veriyor ve fonksiyon kendini sonsuza çağırıyor;
  mutasyon testinde süreç BELLEK TAŞMASIYLA düştü. Durma koşulu doğrudan
  `idler.length === 1` olmalı.
- **HESABA BAĞLI OLMAYAN KAYIT, HESABA GÖRE SAYAN RAPORA GİRMİYOR.** Şemsiye
  bütçe `ad_account_id IS NULL` ile duruyor; "kalanları say" sorgusu
  `WHERE ad_account_id = $1` dediği için o satır HİÇ görünmüyordu. Oysa
  taşımadan en çok o etkileniyor: ay ortasında hesap gidince eski müşterinin
  harcaması düşüyor, bütçe bekçisi olmayan bir boşluk görüyor ve kuralların
  bütçe ARTIRMASINA izin veriyor. Ayrı sorulup ayrı söyleniyor.
- **`ad_accounts`, `platform_connections` ve `social_profiles` içinde
  `client_id` NULLABLE.** NULL = ajansın havuzunda, müşteriye atanmamış.
  Sahiplik `org_id`'de. Bu satırlar için senkronizasyon kuyruğa GİRMEMELİ —
  `client_id`'si NULL bir `sync_jobs` satırını RLS kimseye göstermez ve iş
  sessizce kaybolur (`assertAssigned()` kullan).

### Canlıda öğrenilen platform gerçekleri

Hepsi gerçek para harcanarak ya da bir tur kaybedilerek bulundu. Belgeden
okunup varsayılmadı — canlıda doğrulandı.

**Meta**

- **Ad set'te `destination_type` verilmezse boost REDDEDİLİYOR.** Meta hedefi
  kendi çözüp harici web sitesine düşüyor ve *"Eylem Çağrısı Gerekiyor ·
  Kampanya amacınız için harici bir internet sitesi URL'si gerekiyor"*
  (subcode 2446383) diyor. Gönderi öne çıkarmada doğru değer `ON_POST`.
  Mesajın "reklam kreatifi kısmında" demesi YANILTICI — eksik olan ad set alanı.
- **`geo_locations` kovaları BİRLEŞİM, kesişim değil.** "Türkiye + İzmir"
  göndermek Türkiye geneli demek ve **hiçbir hata vermiyor**. Lokasyon
  seçildiğinde ülke geneli gönderilmemeli.
- **Instagram medyasının ÜÇ kimlik uzayı var:** `/{ig-user}/media` → `id`
  (doğru), `ig_id`, `legacy_instagram_media_id`. Karıştırmak sessiz hata.
- **Instagram gönderisi `object_story_id` ile reklama çevrilemez.** Ayrı bir
  `adcreatives` çağrısı ve kök seviyede üç alan gerekiyor: `object_id`
  (Facebook sayfası), `instagram_user_id`, `source_instagram_media_id`.
- **Kreatif oluştu diye doğru gönderiye bağlandığı anlamına gelmiyor.** Geri
  okuyup karşılaştır — ama BENZERİ BENZERLE: yazdığın alanın yankısıyla.
  `effective_instagram_media_id` başka bir kimlik uzayında olabiliyor ve onu
  engel saymak çalışan bir yolu kapatıyor.
- **KREATİF GÖRSEL ADRESİ İMZALI VE ÖLÜYOR — saklanamaz.** `image_url` geçici
  ve HER Graph çağrısı yenisini üretiyor; `thumbnail_url` için kalıcı bir
  karşılık HİÇ YOK (kalıcı olan tek şey `AdImage.permanent_url` ve o yalnızca
  `image_hash` taşıyan kreatiflerde var — gönderi/video boost'larında yok).
  Bunu DELTA yapı taramasıyla birleştirince adres yazıldığı gün taze, iki
  hafta sonra ölü oluyor: rapor PDF'inde on reklamın hepsi "sunucu 403".
  Adres KULLANILACAĞI ANDA tazeleniyor (`kreatif-adresi.service.ts`), yapı
  taramasında değil — orada tazelemek de işe yaramazdı, çünkü rapor günler
  sonra üretiliyor.
- **`?ids=` ÇOKLU SORGUSUNDA TEK KÖTÜ KİMLİK İSTEĞİN TAMAMINI DÜŞÜRÜYOR.**
  Silinmiş bir kreatif, kalan 23 reklamın da görselini götürüyor. Liste
  yarılanıp tekrar isteniyor; tek kimliğe inildiğinde DÜĞÜM yoluna
  (`/{creative-id}`) geçiliyor — `ids` bir kolaylık, düğüm yolu Graph'in en
  kesin biçimi ve yarılama en sonunda hep bilinen yola düşmeli.

**Webhook'lar** (2026-08 araştırması, iki bağımsız sınayıcıyla)

- **Instagram'da "yeni gönderi" WEBHOOK'U YOK.** Abone olunabilir alanlar
  yorum/bahsetme/mesajlaşma etrafında; medya yayınını bildiren alan yok ve
  changelog o yönde hazırlık göstermiyor. Tespit yalnızca
  `/{ig-user-id}/media` yoklamasıyla. Facebook Sayfa `feed` alanı da
  KULLANILMAZ: crosspost açık müşteride tetiklenir, IG-only paylaşanda hiç —
  aynı kod iki müşteride farklı davranır.
- **Gönderi süpürmesinde `media_product_type = 'AD'` FİLTRELENMELİ.** Yoksa
  sistemin kendi ürettiği reklam kreatifleri "yeni gönderi" sanılır ve geri
  besleme döngüsü oluşur.
- **Medya kimliklerinin zamana göre arttığı GARANTİ DEĞİL** ve `/media` liste
  sırası da garanti edilmiyor (sabitlenmiş gönderi başa geçebiliyor). Tespit
  `timestamp` ile görülen kimlik kümesini BİRLİKTE kullanmalı, sıralama kendi
  tarafımızda yapılmalı.
- **YouTube WebSub SESSİZCE ÖLÜYOR:** kiralama ~10 günde doluyor ve hub haber
  vermiyor; `hub.mode=denied` daha hızlı bir ölüm yolu ve işlenmesi
  spesifikasyonda MUST. Yenileme işinin kendisi de tek noktalı arıza — ölü
  adam düğmesi şart. Hub URL'si sabit yazılmalı: YouTube feed'i `Link:`
  başlığında hub'ı ilan etmiyor.
- **İKİ WEBHOOK İÇİN TEK DOĞRULAMA FONKSİYONU YAZILAMAZ.** Meta
  `X-Hub-Signature-256` (sha256) + JSON; WebSub `X-Hub-Signature` (sha1) +
  Atom XML. Önek parse edilmeli, algoritma sabit varsayılmamalı.
- **NestJS `rawBody` XML ucunda ÇALIŞMIYOR** — kanca yalnızca `json` ve
  `urlencoded` parser'lara takılı. İmza ham gövde istediği için YouTube
  ucunda ham gövde elle toplanmalı.
- **Meta'da tekilleştirme `entry`/`change` seviyesinde**, istek seviyesinde
  değil: tek istekte 1000'e kadar olay gelebiliyor.

**Google Ads** (2026-08 araştırması, resmi dokümandan)

- **`AdImageAsset.asset` BİR ADRES DEĞİL, KAYNAK ADI.** Değeri
  `customers/{id}/assets/{id}` biçiminde ve `asset_urls`'e onu yazmak üç katlı
  bir arıza üretiyor: `new URL()` düşüyor, PDF metin önizlemesi yerine "görsel
  alınamadı" dalına giriyor (değer string olduğu için TRUTHY) ve dipnottaki
  sayaç şişip GERÇEK arızayı gizliyor. Adresi almak ayrı bir sorgu istiyor:
  `SELECT asset.image_asset.full_size.url FROM asset` — ana makine
  `tpc.googlesyndication.com`. **BU SORGU HENÜZ YAZILMADI**, yani Google
  Display reklamlarının görseli raporda hâlâ yok (arama reklamlarınınki
  metin önizlemesiyle geliyor ve o DOĞRU davranış). `gorselAdresleri()`
  süzgeci kaynak adını eliyor, böylece en azından yanlış dalı ve yalancı
  sayacı üretmiyor.
- **`advertising_channel_type = VIDEO` kampanya API'DEN OLUŞTURULAMIYOR.**
  Google Ads API video kampanyalarında yalnızca okuma ve raporlama yapıyor.
  Enum'da `VIDEO_ACTION` gibi değerlerin durması oluşturulabilir olduğunu
  GÖSTERMİYOR — şema doğrulamasından geçer, iş mantığı reddeder. YouTube
  video reklamı API'den yönetilecekse yol **Demand Gen** (`DEMAND_GEN`,
  alt tip verilmez).
- **Bütçe AYRI BİR KAYNAK** (`CampaignBudget`) ve kampanya ona referans
  veriyor — Meta'daki gibi ad set'in alanı değil. Bütçe kampanya altındaki
  bütün reklam gruplarınca PAYLAŞILIYOR.
- **Kampanya ve bütçe adları hesapta TEKİL olmalı** (`DUPLICATE_NAME`);
  bu yüzden bütçe adına zaman damgası ekleniyor.
- **`partialFailure: false` şart.** `true` olsaydı Google geçersiz işlemleri
  atlayıp kalanları uygular ve yanıt "başarılı" görünürdü.
- **Google yazma yolu canlıda HİÇ denenmedi.** İstek gövdeleri bilgiden
  yazıldı. İlk gerçek çağrı en küçük bütçeyle yapılmalı.

### Test

- `pnpm --filter @advetics/api test` — vitest. Şu an **2.164 API testi**.
- Veritabanına dokunan testler **PGlite** kullanıyor (gerçek Postgres, WASM).
  Şema üretim migration'larından kuruluyor — el yazımı test şeması yok.
- **RLS testlerde varsayılan olarak KAPALI** (worker rolü BYPASSRLS'i taklit
  ediyor). Ama kapatılabilir bir varsayılan: `SET ROLE` ile sahibi olmayan bir
  role geçen bir test politikaları GERÇEKTEN sınayabiliyor — örnek
  `ad-account-pool-rls.spec.ts` ve `hesap-tasima-rls.spec.ts` (ikincisi
  taşımanın sekiz tabloda da politikalardan geçtiğini ve `activeClientId`
  kapatılmazsa REDDEDİLDİĞİNİ kilitliyor). Kritik bir politika yazıyorsan elle gözden
  geçirmekle yetinme, o deseni kullan.
- **MUTASYON DİSİPLİNİ: kritik bir test, kodu bozarak doğrulanmadan yazılmış
  sayılmaz.** Bu oturumda üç test mutasyonla BOŞ çıktı — hepsi geçiyordu ama
  hiçbir şey tutmuyordu: (1) bir fonksiyon test edilmişti ama ÇAĞRILDIĞI test
  edilmemişti, (2) kırpma testi kırpmanın OLDUĞUNU değil yalnızca sonucun
  şeklini kontrol ediyordu, (3) ad set adının hiç testi yoktu. Testi yazdıktan
  sonra ilgili satırı boz, düştüğünü gör, geri al.
- **SABİT UZUNLUKLU DİLİM KOMŞUYU YAKALIYOR.** `indexOf('onDragOver') + 400
  karakter` diliminde `preventDefault` aramak, o çağrıyı SİLDİĞİNDE de
  geçiyordu: pencere komşu işleyicinin (`onDrop`) içindeki aynı çağrıya kadar
  uzanıyor. Dilim, sınırlanmak istenen şeyin GERÇEK sınırıyla çıkarılmalı
  (süslü parantez sayarak); "yakınında geçiyor" bir iddia değil.
- **TARAMAYI YORUMSUZ KAYNAKTA YAP.** `KAYNAK.replace(/\/\*[\s\S]*?\*\//g, '')`.
  Bir kuralı ANLATAN yorum aynı dosyada duruyor ve `toContain` ikisini ayırt
  etmiyor; kural silinse bile yorum eşleşip test yeşil kalıyor. Bu oturumda
  ters yönde de yakalandı: "şu desen KALMADI" iddiası, deseni anlatan yoruma
  eşleşip kod DOĞRUYKEN kırmızı verdi.
- **KAYNAK TARAMASINDA İDDİA YORUMA DEĞİL KODA ÇAPALANIR.** Bir kuralı test
  ederken o kuralı ANLATAN yorum da aynı dosyada duruyor ve `toContain` ikisini
  ayırt etmiyor: `inverse` propunu silmek testi düşürmüyordu, çünkü iki satır
  yukarıdaki *"CPA'da ARTIŞ KÖTÜ — `inverse`"* yorumu eşleşiyordu. Bu oturumda
  dört ayrı testte oldu (`showBuckets`, `process.cwd()`, `ad.platform ===
  'google'`, `inverse`). Dilimi tanımın/elemanın kendisinden başlat
  (`lastIndexOf('<Delta', i)`) ya da eşleşmeyi tek bir satıra sabitle.
- Bazı testler **kaynak taraması** yapıyor (`meta-account-path.spec.ts`,
  `google-request.spec.ts`). Canlıda öğrenilen ve birim testiyle
  yakalanamayacak kuralları böyle kilitliyoruz. **Tarama BOŞA DÜŞEBİLİR:**
  metot adı değişince dilim boşalıyor ve "yasak dizge yok" iddiası her zaman
  doğru oluyor. Her taramaya "gövde gerçekten yakalandı" testi ekle ve dilim
  bulunamazsa HATA FIRLAT.

### Commit

Türkçe, ne yapıldığını değil **neden** yapıldığını anlatan gövde. Son satır:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

## 4. Mimari — hızlı harita

pnpm workspace monorepo:

| Yol | İçerik |
|---|---|
| `apps/api` | NestJS 11 — REST API + BullMQ worker |
| `apps/web` | Next.js 15 App Router — panel |
| `packages/shared` | Zod şemaları, RBAC, ortak tipler (iki taraf da kullanıyor) |

- **PostgreSQL + RLS** son savunma hattı. İki Prisma istemcisi:
  `PrismaService.withTenant(ctx, fn)` (RLS uygulanır) ve `PrismaAdminService`
  (BYPASSRLS — yalnızca worker ve webhook).
- **BullMQ + Redis** (db `3`, önek `advetics`). İş kimliğinde ayırıcı `__`,
  `:` değil — BullMQ reddediyor.
- **Sağlayıcı deseni**: `IAdPlatformProvider` → `meta.provider.ts`,
  `google.provider.ts`. SDK yok, düz REST.
- Para **micros** (BigInt), tarihler **`YYYY-MM-DD` string** (Date'e çevirmek
  saat dilimi kayması üretiyor).
- Türetilmiş metrikler (CPA, ROAS…) sorgu anında hesaplanıyor, saklanmıyor.

Detay: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## 5. Ürün kararları

- **Hedef kullanıcı reklamcılık bilmiyor.** Kullanıcının verbatim ifadesi:
  *"amacım reklam ile ilgili bilgisi olmayan birisinin bile platformu
  kullanabilmesi"*. Hedef, optimizasyon, yerleşim, teklif stratejisi
  sorulmuyor — hepsi `goal-mapping.ts` içinde karara bağlanıyor.
- **Uzman için ikinci mod var**, ayrı sayfa değil: `/reklam-olustur` üzerinde
  "Gelişmiş" modu. Aynı taslak, aynı görseller, aynı yayın yolu.
- **Arayüz Türkçe ve iş dilinde.** "CENTRAL", "OPTIMISE" gibi mimari terimler
  panelde geçmiyor.
- Bir müşteri = bir **şirket**; şirketin birden çok projesi/reklam hesabı
  olabilir. Panelde ve raporlarda reklam hesabı süzgeci **her zaman** bulunmalı.
- **WORKSPACE BAŞINA PLATFORM BAĞLANTISI MÜMKÜN DEĞİL — denendi, çürüdü.**
  Müşterilerin kendi Facebook hesabı yok; ajans onların Business Manager'ına
  partner olarak ekleniyor. Yani her yetkilendirme AYNI Facebook kullanıcısı
  oluyor ve `orgId + platform + externalUserId` tekil anahtarında tek satıra
  çakışıyor. "Her workspace kendi hesabıyla bağlansın" modeli bu yüzden
  fiziksel olarak kurulamıyor. Müşteri ayrımı bağlantıda değil hesap
  ATAMASINDA yapılıyor.
- **ATAMA İZLEMEYİ DE AÇIYOR VE GEÇMİŞİ KUYRUĞA ALIYOR.** "Ata → izlemeyi aç
  → bekle" üçlüsü kullanıcının angarya dediği şeydi ve ikinci adımı atlamak
  "atadım ama veri gelmiyor" hâlini üretiyordu. Bir workspace'in verisi
  bağlanınca değil, HESAP ONA ATANINCA başlıyor: `syncEnabled` açılıyor,
  `structure` ve 90 günlük `initial_backfill` kuyruğa giriyor. Sıra önemli —
  metrikler kampanya satırlarına bağlanıyor. `ad-account-assign.spec.ts`
  gerçek veritabanıyla kilitliyor.
- **RAPORLAR TEK SAYFA: rapor, şablon ve faturalar.** Kenar çubuğunda üç ayrı
  bağlantıydı; üçü de aynı belgenin parçası ve ayrılmaları gerçek bir hata
  üretiyordu (yukarıya bkz.). Şablon seçici hem ön ayarları hem kayıtlı
  şablonları listeliyor, düzenleme aynı listenin içinde; faturalar sekme.
  Yetki süzgeci kaybolmadı, sayfanın İÇİNE taşındı: `report.write` şablon
  düzenlemeyi, `report.share` fatura sekmesini açıyor.
- **BÖLÜM SIRASI SÜRÜKLENEREK DEĞİŞİYOR — ama klavye kaybolmadı.** ↑/↓
  düğmelerinin gerekçesi "yedi öğelik listede kazancı yok"tu; liste on dörde
  çıkınca çürüdü. Kütüphane yok (HTML5 olayları). Satır odaklanabilir ve ok
  tuşlarıyla taşınıyor: yalnızca sürükleme koymak, fare kullanamayan için
  özelliği TAMAMEN kapatmak olurdu. Taşıma TAKAS DEĞİL ARAYA SOKMA — takas
  eden bir sürükleme kullanıcının bıraktığı yere koymuyor.
- **Platform bağlantısı AJANSA ait, müşteriye değil.** Meta/Google bir kez
  yetkilendiriliyor; erişilen bütün reklam hesapları VE sayfalar havuza düşüyor
  ve müşteriye panelden atanıyor. Müşteri başına yeniden yetkilendirme yok —
  platform önceki token'ı geçersiz kılıyor ve bağlantıları koparıyordu.
  Bağlantı kurmak/kaldırmak ve atama yapmak org yöneticisi işi.
