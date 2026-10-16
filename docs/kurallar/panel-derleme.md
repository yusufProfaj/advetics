# Panel, React, derleme ve Nest tuzakları

> CLAUDE.md'den taşındı (2026-10-16, token düzeni). İçerik DEĞİŞMEDİ, yalnız konuya göre ayrıldı.
> Yeni ders buraya, ilgili konu dosyasına EKLENİR; CLAUDE.md'ye yalnız tek satırlık işaret gider.

- **BAĞLANTIYI ELLE BİRLEŞTİRME — SÜZGEÇ DÜŞÜYOR.** Panel süzgeçleri URL'de
  taşıyor ve her sekme kendi bağlantısını elle kuruyordu; kırılım sekmesi
  `platform`ı düşürüyordu, yani "Meta" seçip seviye değiştiren kullanıcı
  sessizce bütün platformlara dönüyordu. Özel tarih aralığı gelince taşınacak
  anahtar sayısı üçten beşe çıktı. Tek üretici (`lib/baglanti.ts`) ve taşınan
  parametreleri tek yerde kur. Belirti "aralık/süzgeç bazen kayboluyor" ve
  hiçbir ekranda görünmüyor.
- **AYNI İŞİN PARÇASI OLAN EKRANI AYRI SAYFAYA KOYMAK HATA ÜRETİYOR.** Şablon
  düzenleme ayrı sayfadaydı: kullanıcı bölüm sırasını düzenleyip rapora
  dönüyor, seçiciden bir ön ayar seçiyor ve düzenlemesi kayboluyordu — seçici
  yalnızca ön ayarları tanıyordu ve `sablon` parametresi kayıtlı şablonu
  eziyordu. Ayrılık dekor değil, hatanın SEBEBİYDİ.
- **`PlatformApiError` bir `HttpException` DEĞİL.** `AllExceptionsFilter`'da
  kendi dalı olmazsa son dala düşüyor ve "izin yok", "kota doldu", "hesap
  bulunamadı", "geçersiz alan" hepsi panelde **"Beklenmeyen bir hata oluştu"**
  oluyor. Bu cümle bu projede bir turu tamamen kaybettirdi.
- **AYNI ŞEYİ ÜRETEN İKİNCİ FONKSİYON, DOĞDUĞU ANDA AYRIŞIR.** Meta hedefleme
  nesnesini üreten iki fonksiyon vardı; ikisi de derleniyor, ikisi de
  "çalışıyordu". Farklar: biri `regions`/`cities` kovalarına `{ key }` nesnesi
  koyuyordu (canlıda öğrenilmiş doğru biçim), diğeri DÜZ STRING; biri
  `age_max = 65`'i göndermiyordu (Meta'da 65 = "65 ve üzeri"), diğeri her
  zaman gönderiyordu. Yani ön ayarında il seçen müşterinin reklamı ya
  reddedilecek ya da sessizce ülke geneline çıkacaktı. Burada bir süre
  "bugün tek dosyada" yazıyordu ve YANLIŞTI: taslak ağacının
  `goal-mapping.ts#targetingFrom`u üçüncü bir üreticiydi ve şehir seçilince
  `countries`i de gönderiyordu (birleşim → ülke geneli). Panel şehir
  göndermediği için tetiklenmedi ve bir test o hâli "doğru" diye
  kilitlemişti. 2026-09-29'dan beri `targetingFrom` da `metaTargetingFrom`a
  çeviriyor; `goal-mapping.spec.ts` ikinci nesne kurulmasını yasaklıyor.
- **`apps/*` TYPECHECK'İ TEMİZ OLMASI, `packages/shared`İN DERLENDİĞİ
  ANLAMINA GELMİYOR.** İkisi de `@advetics/shared`ı DERLENMİŞ `dist`ten
  okuyor; kaynakta bir tip hatası varsa panel ve API typecheck'i ESKİ
  bildirimleri görüp yeşil geçiyor. Bu oturumda tam olarak bu oldu:
  `draft-tree.schema.ts`e `Platform` tipi kullanan bir arayüz eklendi ama
  import edilmedi; `pnpm --filter @advetics/shared build` çıktısı ÇIKTI
  YUTULARAK (`>/dev/null 2>&1`) koşturulduğu için hata görünmedi, sonraki
  bütün kontroller bayat `dist`i okudu ve hata DEPLOY'un ortasında,
  sunucudaki derlemede patladı (`TS2304: Cannot find name 'Platform'`).
  KURAL: shared'a dokunan her değişiklikten sonra derlemeyi ÇIKTISIYLA
  birlikte koş; bir komutun çıktısını yutmak, bu depoda hata gizlemenin en
  hızlı yolu.
- **SAYFA TAŞIMAK DEPLOY'U DÜŞÜRÜYORDU — CANLI `.next/types`.** Panel
  `.next-derleme`ye derleniyor ama `tsconfig.json` `.next/types/**`u da
  içeriyor ve Next tip denetiminde CANLI klasörün eski tiplerini okuyor.
  Tanıtım sitesi `src/app/page.tsx`ten `(site)/`ye taşınınca (2026-10-13)
  üretim derlemesi `Cannot find module '../../../src/app/page.js'` ile düştü;
  yerelde de aynısı vardı ve yalnızca yerel `.next/types` silinip geçilmişti
  — ders üretime taşınmadı. `deploy.sh` artık derlemeden önce `.next/types`ı
  siliyor (çalışan süreç onu okumuyor). Yerelde aynı hata görülürse sebep bu.
- **AYNI EKRANIN MENÜDE VE SAYFADA İKİ AYRI ADI OLUYOR.** Kenar çubuğu
  "Akıllı Boost" derken sayfa "Auto-Boost", "Reklam Oluştur" derken sayfa
  "Reklamlar" başlığıyla açılıyordu; kullanıcı yanlış sayfaya düştüğünü
  sanıyor. TypeScript göremiyor (ikisi de düz dize) ve iki kez üst üste
  oldu. `nav-sections.spec.ts` artık her menü öğesi için sayfanın KAYNAĞINDA
  ve `metadata.title` içinde etiketin geçtiğini kilitliyor. Tarama YORUMSUZ
  kaynakta yapılıyor: ilk yazımda ham kaynağa bakıyordu ve mutasyon testinde
  boş çıktı, çünkü kuralı ANLATAN yorum eşleşiyordu.
- **ZORUNLU ALANI EKSİK BIRAKAN FIXTURE, EKSİK KAPSAMIN KENDİSİDİR.**
  `rapor-pdf.service.spec.ts` fixture'ında `breakdowns` hiç yoktu; TypeScript
  bunu `TS2741` ile söylüyordu ama **vitest tip denetimi yapmıyor** ve 259
  test, Kitle Özeti sayfası HİÇ ÜRETİLMEDEN yeşil geçiyordu. Kırmızı bir
  typecheck kimseyi uyarmıyor — `pnpm --filter @advetics/api typecheck`
  temiz tutulmalı, yoksa gerçek uyarı gürültünün içinde kayboluyor.
- **NEST MODÜL KAYDI DERLEMEDE DEĞİL AÇILIŞTA PATLIYOR.** `nest build`
  başarılı olur, grafik çözülemez ve hata deploy'un ortasında görünür.
  2026-10-13'ten beri grafiği GERÇEKTEN çözen bir test var:
  `src/nest-grafigi.spec.ts` (+ `test/nest-grafigi-calistir.cjs`). Ayrı
  süreçte TypeScript'in kendi derleyicisiyle koşuyor, çünkü vitest'in
  esbuild'i kurucu tip bilgisini (`design:paramtypes`) üretmiyor ve orada
  her sınıf düşerdi; `init()` çağırmıyor, veritabanına/Redis'e bağlanmıyor
  (~1,5 sn). `@Optional()` bağımlılık eksik kalınca DI HATA VERMİYOR, sessizce
  `undefined` — test bunları ayrıca soruyor; yeni bir `@Optional` eklersen
  oraya ekle. Kaynak taraması (`kreatif-adresi.spec.ts` sonu) da duruyor.
- **`contentEditable` KONTROLLÜ OLAMAZ — ama KONTROLSÜZ de bırakılamaz.**
  Her tuş vuruşunda DOM'a geri yazmak imleci metnin başına atıyor; hiç
  yazmamak ise SONRADAN gelen değeri kaçırıyor. Rapor mail editörü üretimde
  BOŞ göründü çünkü effect'in bağımlılığı `[taslakAnahtari, kodModu]` idi:
  editör, taslak sunucudan gelmeden monte oluyor ve bir daha dolmuyordu.
  İkinci adım daha kötüydü — kullanıcı boş alana tıklayıp çıkınca `onBlur`
  boşluğu state'e GERİ YAZIP taslağı da siliyordu; iki belirti, tek sebep.
  Doğrusu: değer bağımlılıkta OLACAK, yazma kararı ise "alan odaktaysa VE
  içi doluysa dokunma" olacak. Odakta ama BOŞ olan alan yazılmalı, yoksa
  "kullanıcı taslak gelmeden tıkladı" hâli kutuyu kalıcı boş bırakıyor.
- **BİR BAĞIMLILIK LİSTESİNİ TEST HÂLİNE GETİRMEDEN ÖNCE HANGİ SIRAYI
  VARSAYDIĞINI SOR.** Yukarıdaki hatayı ben KİLİTLEMİŞTİM:
  `expect(govde).toContain('[taslakAnahtari, kodModu]')` yazıp yanlış
  davranışı doğru sanmıştım. Test yazmak, davranışın doğru olduğunu
  KANITLAMIYOR — yalnızca değişmeyeceğini garanti ediyor.
- **REACT EFFECT'İNİN İÇİNDEKİ KARAR TEST EDİLEMİYOR — DIŞARI ÇIKAR.** Panelde
  bileşen render eden bir test altyapısı yok (`vitest.config.ts` bunu bilinçli
  reddediyor), yani effect içindeki mantık yalnızca kaynak taramasıyla
  sınanabiliyor ve o tarama yanlış şeyi kilitleyebiliyor. "DOM'a yazmalı mıyız"
  kararı saf bir fonksiyona (`domaYazilmali`) çıkarıldı ve üç hâl ayrı ayrı
  test edildi.
- **BİR KEZ ÇEKİLEN TASLAK, KOŞULU DEĞİŞTİĞİNDE BAYAT KALIYOR.** Rapor mail
  taslağı `if (!acik || taslak !== null) return;` ile bir kez çekiliyordu:
  kullanıcı pencereyi kapatıp tarih aralığını değiştirip yeniden açtığında
  mail METNİ eski dönemi anlatıyor, PDF EKİ yeni dönem için üretiliyordu —
  aynı mailde iki farklı gerçek ve farkı yalnızca ALICI görür. Koşul artık
  taslağın KİMLİĞİNE bakıyor; "yazdığının üzerine yazma" kaygısı da korunuyor
  çünkü aynı kimlikte yeniden çekilmiyor.
- **ÇİFT CAST (`as unknown as X`) EKSİK ALAN DENETİMİNİ TAMAMEN KAPATIYOR.**
  `rapor-plani.service.spec.ts` mock'ları böyle kuruluyordu; `zamanlanmisGonder`
  dönüşü `to: string` → `to: string[]` olunca TypeScript hiçbir şey demedi ve
  testler çalışma anında `to.join is not a function` ile düştü — sebep testin
  kendisinde sanılıyor. Mock'un dönüş tipini imzadan TÜRET
  (`Awaited<ReturnType<X['metot']>>`); alan eklenince derleme kırılsın.

## Middleware yeniden yazımı canlıda "dış adres" sayılıyor (2026-10-16)

Sunucu `next start --hostname 127.0.0.1` ile kalkıyor; Next'in iç adresi
`http://127.0.0.1:3598`. `req.nextUrl` ise döngü adreslerini `localhost`a
çeviriyor (`NextURL`, `REGEX_LOCALHOST_HOSTNAME`). `NextResponse.rewrite(req.nextUrl.clone())`
hedefinin kökeni bu yüzden iç adresle TUTMUYOR, Next onu dış adres sayıp
kendine HTTP vekil isteği atıyor (`resolve-routes.js` → `getRelativeURL`)
ve istek middleware'den İKİNCİ KEZ geçiyor (Host = `localhost:3598`). `/en`
D1'den beri canlıda ilk ziyarette Türkçe çiziliyor, `en` çerezinden sonra
`ERR_TOO_MANY_REDIRECTS` veriyordu; yerelde (`next dev`, iç adres zaten
localhost) hiç görünmedi. Çözüm middleware'de ikinci geçişi tanımak
(`vekilIstek`). Yeniden yazım ya da istek başlığı ekleyen her middleware
değişikliği canlı benzeri koşulla denenir:
`NEXT_PUBLIC_ROOT_DOMAIN=advetics.com NEXT_DIST_DIR=.next-yerel next build`,
`next start --port 3598 --hostname 127.0.0.1`, `curl -H 'Host: advetics.com' -H 'Cookie: ...'`
(derleme `tsconfig.json`/`next-env.d.ts`'e dokunuyor, geri al).
