# Senkronizasyon, kuyruk ve platform veri çekimi tuzakları

> CLAUDE.md'den taşındı (2026-10-16, token düzeni). İçerik DEĞİŞMEDİ, yalnız konuya göre ayrıldı.
> Yeni ders buraya, ilgili konu dosyasına EKLENİR; CLAUDE.md'ye yalnız tek satırlık işaret gider.

- **Meta `image_hash` REKLAM HESABI BAŞINA.** Bir hesabın hash'i diğerinde
  çalışmaz; `asset_platform_refs` bunu tutuyor.
- **`ad_accounts.external_id` Meta'da `act_` önekiyle geliyor.** Önek elle
  eklenmez, `actPath()` kullanılır.
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
- **`sync_jobs` SATIRI BİR NİYET KAYDI, KUYRUK İSE GERÇEK — İKİSİ AYRIŞIYOR.**
  Satır `queued`/`running` yazıyorken BullMQ işi Redis'te olmayabiliyor:
  worker deploy sırasında öldürülüp iş `stalled` sayılıyor ve
  `maxStalledCount` (varsayılan 1) aşılınca atılıyor. İşleyici o sırada HİÇ
  koşmadığı için tabloya tek satır bile yazılmıyor ve kayıt sonsuza kadar
  açık kalıyor. Toplu tazeleme çubuğu `1259 / 1266`da saatlerce durdu, ekran
  "İşleniyor" yazdı, hiçbir log yoktu. Tabloya bakan hiçbir kontrol bunu
  göremez — soru KUYRUĞA sorulmalı (`kuyruktaMi`). İki düzeltme birden
  gerekti: worker'ın `failed` dinleyicisi nihai düşüşte satırı kapatıyor
  (`kuyruk_vazgecti`) ve panel duran bir partide kayıp işleri geri koyabiliyor.
  `getState()` OKURKEN `prioritized` DE BEKLEYEN SAYILIYOR: bu ürün her işi
  öncelikle ekliyor, yalnızca `waiting` arayan bir kontrol normal bekleyen
  işlerin TAMAMINI kayıp sayardı. `takilan-parti.spec.ts`.
- **BİR DURUM ENUM'INDAN İKİSİNİ SAYMAK, KALANLARI SONSUZA KADAR AÇIK
  BIRAKIYOR.** İlerleme yüzdesi `succeeded` + `failed` sayıyordu; `cancelled`
  hiç sayılmıyordu ve o durumdaki tek bir satır `bitti`yi kalıcı olarak
  `false` yapıyordu. Payda parti açılışında sabit, yani eksik kalan her satır
  çubuğu durduruyor. Bir durum makinesine yeni bir SON durum eklerken onu
  sayan yerleri de aynı commit'te güncelle.
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
- **AYNI SÜZGECİ İKİ YERDE YAZMA.** Zamanlanmış süpürme hesabın platform
  durumuna bakıyordu, elle tetikleyen uç bakmıyordu; belirtisi "elle basınca
  geliyor, kendiliğinden gelmiyor" ve hiçbir ekranda görünmüyordu. Süzgeç tek
  sabitte (`SUPURME_HESAP_KOSULU`) ve teşhis ekranı da onu okuyor.
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
- **ÖZYİNELEMENİN DURMA KOŞULUNU SUNUM DEĞİŞKENİNE BAĞLAMA.** Meta kreatif
  adresi çekiminde liste hatada yarılanıyor ve durma koşulu `tekli`ye
  bağlıydı — o değişken URL BİÇİMİNİ seçiyor (`?ids=` mi düğüm yolu mu), uzunluğu
  değil. Biri onu sabitlerse `Math.floor(1 / 2) = 0` yüzünden `slice(0)` aynı
  tek elemanlı listeyi veriyor ve fonksiyon kendini sonsuza çağırıyor;
  mutasyon testinde süreç BELLEK TAŞMASIYLA düştü. Durma koşulu doğrudan
  `idler.length === 1` olmalı.
- **SEGMENT EKLEMEK SATIRI ÇOĞALTIYOR — AYNI SORGUYA KOYMA.** Google'da
  dönüşüm eylemi kırılımı `segments.conversion_action_name` ile geliyor ve o
  segment satırı EYLEM BAŞINA çoğaltıyor: gösterim, tıklama ve HARCAMA her
  satırda tekrar ediyor. Ana metrik sorgusuna eklemek toplamı eylem sayısı
  kadar katlardı ve hiçbir hata düşmezdi — müşteriye yanlış harcama. Segment
  AYRI sorguda ve o sorgu YALNIZCA dönüşüm metriklerini seçiyor. Simetrik
  tehlike de geçerli: segmentli sorguya gösterim eklemek, o satırların bir
  gün toplamlara karışması demek. `google-donusum-segmenti.spec.ts` ikisini
  de tarıyor.
- **YAN ÖZELLİĞİN HATASI ANA ÇEKİMİ DÜŞÜRMEMELİ — AMA SESSİZ DE KALMAMALI.**
  Dönüşüm detayı bir EK: bir müşteride alan reddedilse bile günlük metrikler
  gelmeye devam etmeli. Hata `raw_metrics` içine yazılıyor
  (`conversionActionsError`) ve okuma katmanı "dönüşüm yok" ile "detay
  alınamadı"yı ayırt ediyor. İkisini aynı boş listeye çevirmek, kullanıcıyı
  sebebi kendi platform kurulumunda aramaya gönderir.
- **TEK SEFERLİK BİR DAMGA, "YAPACAK İŞ YOKKEN" BASILIRSA FIRSAT SESSİZCE
  HARCANIYOR.** Akıllı Boost ilk çekimi `seed_at`i KOŞULSUZ basıyordu:
  deploy'dan sonraki ilk süpürme, gönderileri henüz çekilmemiş bir sayfada
  koştu, sıfır kart üretti ve damgayı bastı. Gönderiler ertesi saat geldi ama
  ön ayar artık "tohumlandı" sayıldığı için son 10 gönderi BİR DAHA HİÇ
  çekilmedi ve hiçbir yerde tek kelime yazmadı. Damganın koşulu "kaç satır
  yazıldı" DEĞİL "yapılacak iş gerçekten var mıydı" olmalı ve kontrol AYNI
  DEYİMDE durmalı. Üretimde zaten harcanmış damgaları geri almak ayrı bir
  migration istedi.
- **YOUTUBE KANALI GOOGLE BAĞLANTISININ ALTINDA YAŞIYOR — "bu bağlantının
  sosyal profilleri" SORGUSU ONU DA GETİRİYOR.** `social_profiles` üç tür
  taşıyor ve `youtube_channel` kendi OAuth'u olmadığı için ajansın Google
  bağlantısına iliştiriliyor. Organik gönderi süpürmesi Meta'nın uçlarını
  çağırıyor: kanal oraya düştüğünde iş KALICI olarak düşüyor ve panelde
  sebebi yazmayan başarısız bir iş kalıyor. Profil türüne göre süzmek
  ZORUNLU ve süzgeç AÇIK UÇLU OLMAMALI (`{ in: [...] }`, `{ not: ... }`
  değil): yeni bir tür eklendiğinde varsayılan DIŞARIDA kalmalı, yanlış uca
  gitmek eksik çekimden pahalı. Zamanlanmış süpürme bunu `connection.platform
  = 'meta'` ile zaten yapıyordu; atama yolundaki ikinci sorgu yapmıyordu —
  aynı süzgeci iki yerde yazmanın klasik sonucu.
- **OKUMADA TETİKLENEN ARKA PLAN İŞİ: KİLİDİ SATIRDAN ÖNCE OKU, DÜŞERSE DE
  SATIR YAZ.** Hazır workspace işi okumada imzaya bakıp kendini başlatıyor
  ve bellek içi bir kilit (`calisan`) taşıyor. İki tuzak testte yakalandı:
  (1) iş satırı yazıp SONRA kilidi bırakıyor; yoklama önce satırı sonra
  kilidi okursa eski satırı ve boş kilidi görüp işi İKİNCİ KEZ başlatıyor
  (site taraması + AI çağrısı). (2) İş tamamen düşüp satır yazmazsa imza
  hiç eşleşmiyor ve panelin HER yoklaması işi yeniden başlatıyor — sebep
  ekranda yok. Düşen iş de imzasıyla `eksik` satırı yazıyor (`dustu`).
  Ayrıca işin KENDİ yazdığı alan (site adresi) imzaya giriyorsa saklanan
  imza iş sonunda yeniden hesaplanmalı. `hazirlama.spec.ts`.
