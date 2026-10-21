# Advetics — çalışma kuralları

Bu dosya her oturumda otomatik yükleniyor. Projeye dair **durum** bilgisi burada
değil, [`docs/DURUM.md`](docs/DURUM.md) içinde; burası **nasıl çalışılacağı**.

## Özet — döngü için (2026-10-14)

**Amaç.** Advetics, Profaj ajansının beyaz etiketli reklam paneli: Meta,
Google ve LinkedIn hesaplarını tek yerde izler, raporlar ve reklam
bilmeyen kullanıcıya strateji (AdvStrategy) ve kurulum (AdvCampaign) yaptırır.
Hedef: sessiz hata olmadan, ölçülmüş platform davranışıyla çalışan bir panel.

**Başarı ölçütü.** `./scripts/dogrula.sh` yeşil (GitHub `dogrula.yml` ile aynı
adımlar: shared derlemesi → prisma generate → tip kontrolü api+web → panel
testleri → API testleri tek başına; `--derle` ile derleme de). Kritik testte
mutasyon: satırı boz, düştüğünü gör, geri al (§3 "Test"). Arayüz işi ayrıca
canlıda masaüstü + mobil görülmeden bitmiş sayılmaz (§3 "Tasarım").

**Kendini geliştirme kuralı.**
- Bir hata yaptığında ya da bir şeyi zor yoldan öğrendiğinde aşağıdaki
  "Öğrenilenler"e TEK SATIR ekle. Kalıcı ve ayrıntılı ders `docs/kurallar/` altındaki konu dosyasına gider.
- Aynı türde işi 2. kez yapıyorsan onu `.claude/skills/` altında skill yap.
- Bu özeti kısa tut; eskiyen ya da yanlış çıkan maddeyi sil. Dosyanın geri
  kalanı İKİ GELİŞTİRİCİNİN ORTAK kuralları: kısaltma, öbür tarafın yazdığını
  silme (§3 "İKİ GELİŞTİRİCİ VAR").
- Döngü sırası `PROGRESS.md`; push, deploy, veri silme ve platforma yazma
  döngünün işi DEĞİL, kullanıcıya sorulur.

**Öğrenilenler.**

- `derleMeta` rehber amaç kodunu değil kendi niyet kodunu alır (`VIDEO` değil `VIDEO_IZLENME`; liste `DERLEYICI_NIYETLERI`); yanlış kod `ret` değil TypeError fırlatır.
- Bir ekranı ya da "panelde yok" iddiasını değiştirmeden önce menünün açtığı GERÇEK bileşeni bul: `team-manager.tsx` yalnız workspace erişim listesi, asıl Ekip ekranı `team-screen.tsx` (route `page.tsx`'ten izle, dosya adından tahmin etme).
- CSS modülündeki eleman sıfırlaması (`:where(.kok a)`) `@layer base` içinde olmalı: katmansız kural, özgüllüğü sıfır olsa bile bütün Tailwind sınıflarını eziyor (koyu düğme siyah üstüne siyah çıktı; `css-modul-katmani.spec.ts`).
- Bir bağlantının BÜTÜN satırlarına karar veren yazma (`disconnect`) `withTenant` altında koşamaz: RLS başka şirkete ödünç verilmiş hesapları gizler ve UPDATE sessizce yarım kalır (2026-10-15: 56 hesabın 1'i kapandı); kapı servis kararında, yazma yönetim istemcisiyle ve RETURNING ile sayılır (`baglanti-kaldirma-rls.spec.ts`).
- PDF'in BAYT boyutunu testte karşılaştırma: aynı içerik CI'da 2 bayt farklı çıktı (43014/43016) ve ilgisiz push kırmızı oldu; "sayfa açılmadı" iddiası sayfa sayısıyla (`PDFDocument.load(...).getPageCount()`).
- Middleware'in `rewrite`ı canlıda Next'in kendine vekil isteğine dönüyor (sunucu 127.0.0.1, `nextUrl` localhost) ve middleware İKİ KEZ koşuyor: `/en` döngüsü yerelde görünmedi. Yeniden yazımı `next start --hostname 127.0.0.1` ile dene (`panel-derleme.md`).
- Worktree'nin `node_modules`ı bayat olabiliyor (`tsc` her modülü "bulunamadı" diye düşürür): `COREPACK_ENABLE_NETWORK=0 corepack pnpm install --offline --frozen-lockfile` ağa çıkmadan kuruyor.
- `npx prisma format` şema dosyasının TAMAMINI yeniden hizalıyor (bir kolon eklemek 270 satırlık fark üretti); kolonu elle ekle, format koşma.
- Google'da ödeme sorunu `customer.status`ta yok (kartı reddedilen hesap ENABLED kalıyor); `billing_setup` + `account_budget` okunuyor, kart reddi API'de hiç yok (`platform-google.md`).
- `www.advetics.com` middleware'de white-label müşteri alan adı sayılıp `/r/bulunamadi`ye gidiyordu (Google OAuth "ana sayfa yanıt vermiyor"); alan adı kararı veren her yerde `www.` kökünü ayrıca düşün (`middleware.spec.ts`).
- Sütunsuz `grid` (`grid gap-4`) en geniş çocuğun min-content'inden daralmıyor: `overflow-x-auto` içindeki tablo telefonda SAYFAYI 780 piksele itti; atalara `grid-cols-1`, ölçüm `scrollWidth` (`panel-derleme.md`).
- `uygula(…, { validateOnly })` yalnız Google'da prova: Meta sağlayıcısı seçeneği tanımıyor ve GERÇEKTEN yazıyor; önizleme için `CampaignActionsService.onizle` (platforma gitmez, `platform-meta.md`).
- Reklam Yöneticisi'nde şirket düzeyi ("Tüm workspace'ler") `activeClientId` BOŞ ama `ajansGorunumu`/`mcc` değil: görünümü `activeClientId`'ye bağlamak sekmeyi seçili gösterip altına hesap tablosu çizdi (`hedef-kitleler.spec.ts`).
- Mutasyonu `git checkout -- dosya` ile geri alma: commit'lenmemiş düzeltmeyi de siler; dosyanın yedeğinden dön.
- Panelin terminoloji bekçisi (`apps/web/src/terminoloji.spec.ts`) API kaynağını da tarıyor: MCP araç açıklamasına ya da onay özetine yazılan "müşteri" de sınıflandırılmalı (dar desenle izin listesine).

## 0. "advetics projesine devam et" denince

Hafızaya değil DEPOYA bak: iki geliştirici var ve hafıza paylaşılmıyor.
Sırayla, başka bir şey okumadan önce:

1. **Kurulum var mı?** Depo kökünde `.env` ve `node_modules` yoksa DUR ve
   kullanıcıyı yönlendir: yerel makine için `./scripts/ortak-kurulum.sh`
   (adımlar README § Kurulum), sunucu için `docs/DEPLOYMENT.md`. Kurulumu
   kendin tahminle tamamlamaya çalışma.
2. **Depo güncel mi?** `git fetch origin` → `git status -sb` →
   `git log --oneline $(git log -1 --format=%h -- docs/DEVAM.md)..origin/main`
   (DEVAM.md'yi değiştiren son commit'ten bu yana gelenler). Worktree'de
   dal geride kaldıysa `sync_with_base_branch` ile güncelle. Öbür tarafın
   commit'leri varsa gövdelerini oku: sıradaki iş onlarla değişmiş olabilir.
3. **[`docs/DEVAM.md`](docs/DEVAM.md) oku** — son durum ve sıradaki iş orada,
   kısa. `DURUM.md`'yi baştan okuma (2.000 satır); yalnızca işin ilgili girdisini.
4. Kullanıcıya **en fazla beş satır** yaz: nerede kalındı, öbür taraftan ne
   geldi, sıradaki iş. "Onay bekliyor" işaretli bir işe onaysız başlama;
   işaretsizse doğrudan başla.

**Oturum kapanırken `DEVAM.md`yi güncelle** (biten, sıradaki, bekleyen
karar, deploy durumu) ve işin KENDİ commit'ine koy. Güncellenmeyen devir belgesi
yanlış yere başlatır — eski sürüm 16 Ağustos'ta donmuş, 6 hafta geride
kalmıştı.

Advetics, Profaj ajansı için yazılan beyaz etiketli bir AdTech SaaS'ı.
**Meta (Facebook/Instagram), Google Ads ve LinkedIn Ads** destekleniyor.

Yeni bir platform kendiliğinden eklenmiyor (LinkedIn 2026-09-07'de açık
talebiyle geldi). Eklenecekse önce
[`docs/kurallar/platform-ekleme.md`](docs/kurallar/platform-ekleme.md):
elle yazılmış platform listeleri üçüncü platformu SESSİZCE kaybediyor.
Kasıtlı DAR kalan listeler genişletilmez: `DRAFT_PLATFORMS`,
`ASSET_PLATFORMS`, `autoBoostPlatformSchema` (yazma yolları, LinkedIn'de
yazma kodu yok).

### Geliştirme düzeni: BEŞ AJAN, MODÜL MODÜL (kullanıcı kararı, 2026-10-08)

Yeni bir modül ya da bir modülün büyük bir parçası **beş ajanla** yürütülür
ve modüller SIRAYLA ilerler (biri canlıya alınmadan diğerine geçilmez).
İlk uygulaması ve şablonu: [`docs/advstrategy/AJAN-PLANI.md`](docs/advstrategy/AJAN-PLANI.md).

| Ajan | Kilit çıktı | Kapı |
|---|---|---|
| 1 · Mimar | `packages/shared/src/<modül>/` sözleşmesi + `docs/<modül>/MIMARI.md` (veri modeli, uçlar, yetki, durum makinesi, ölçüm listesi) | Shared derlemesi ÇIKTISIYLA temiz; brief'in depoyla çelişen yerleri kullanıcıyla kapanmış |
| 2 · Arka Plan | `apps/api/src/modules/<modül>/` + migration'lar | API typecheck temiz, sözleşmeyle aynı şema |
| 3 · Ön Yüz | Panel sayfası + menü satırı | Panel typecheck temiz, `nav-sections`/`panel-tasarim` yeşil |
| 4 · Test & Güvenlik | RLS (`SET ROLE` + `RETURNING`), izolasyon, sessiz hata taraması, mutasyon | **Kapıyı bu ajan açar**; bulgu kapıyı kapatır, düzeltmeyi bulguyu üreten ajan yapar |
| 5 · Canlıya Alma | Migration sırası, canlı ölçümler, devir notu (`DEVAM.md`), deploy komutu | Deploy elle, `advetics` kullanıcısıyla (§1) |
| 6 · Tasarım Denetimi | Canlı ekranın masaüstü + mobil ekran görüntüsü, kılavuz ve Google Ads kontrol listesi (§3 "Tasarım"), kullanıcıya gösterilen önce/sonra | **Kullanıcı görmeden iş bitmiş sayılmaz**; revize gelirse aynı modülde döngü |

- **Sıra:** 1 → (2 ‖ 3, aynı sözleşmeden paralel) → 4 → 5 → 6. Ajan 2 ve 3 tip
  TANIMLAMAZ, sözleşmeden okur.
- **Her ajan teslimde devir notu yazar:** ne yaptı, neyi ÖLÇMEDİ, ne açık kaldı.
- **Her modül planı başta bir "çelişki tablosu" taşır:** brief'in bu depoyla
  çeliştiği yerler, ajanlar başlamadan kullanıcıyla kapatılır.
- **Görseldeki genel araçlar bu depoya uyarlanır:** Docker/Kubernetes YOK
  (paylaşımlı VPS, sistem geneli kurulum yasak, §1), Java/Go YOK. GitHub
  Actions YALNIZCA doğrulama (`dogrula.yml`, Ajan 4'ün push sonrası bekçisi);
  dağıtım yok. Ajan 5 = iş yeşilse elle `deploy.sh`.

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

### Tasarım: kılavuz + Google Ads mantığı, HER İŞİN SONUNDA DENETİM

Kullanıcı kararı (2026-10-09), sebebiyle: *"ui/ux'e hiç bakmıyorsun …
çok saçma tasarım yapıyorsun"*. Ekranlar doğrudan koda yazılıyor,
kullanıcının gözünden hiç geçmiyordu ve kimliğin yalnız dört değeri
(iki yazı tipi, iki renk) kullanılıyordu.

- **GÖRÜNÜŞ ADVETICS'İN, KULLANIM MANTIĞI GOOGLE ADS'İN** (kullanıcı,
  2026-10-09): görüntü, şema ve tablolar Advetics'in kendi dilinde
  (`globals.css` katmanı, degrade ikon karoları, animasyonlar), düzen ve
  akış Google Ads'e benzer. Yeni modül de bu dilde. Yeşil yalnız durum
  göstergesi için serbest. Animasyon kalır ama HATASIZ: açılıp kapanan öğe
  DOM'dan çıkmaz, görünürlük geçişle değişir, `prefers-reduced-motion`
  altında kapanır (`components/rehber/set-kartlari.tsx` menüsü).
- **İki kaynağın dışına çıkılmaz.** Görsel kimlik:
  [`docs/marka/profaj-kurumsal-kilavuz.jpg`](docs/marka/profaj-kurumsal-kilavuz.jpg)
  — renkler YALNIZ beyaz `#ffffff`, siyah `#000000`, gri `#302e2d`,
  kırmızı `#ff2400`; ana başlık Montserrat, üst başlık ve gövde Open Sans;
  logo kılavuzdaki üç zeminde. Gradyan, pastel ton, buğu, kılavuzda
  olmayan renk YOK. Ekran mantığı: **Google Ads**, sadeleştirilmiş ve
  reklam bilmeyen kullanıcıya uyarlanmış ("Google yıllardır test ediyor;
  mantığını ve basitliğini tut", kullanıcı). Ayrıntılı kurallar
  `docs/marka/TASARIM-DILI.md` (yazıldıkça).
- **Önce görsel, sonra kod.** Yeni ekran ya da büyük değişiklikte önce
  tarayıcıda açılan taslak; kullanıcı seçmeden koda geçilmez.
- **Her modülün / güncellemenin SON adımı tasarım denetimi** (beş ajan
  tablosunda 6): canlı ekranın masaüstü ve mobil görüntüsü alınır, kılavuz
  ve Google Ads mantığına göre kontrol edilir, kullanıcıya gösterilir.
  Testler yeşil ve deploy başarılı diye iş bitmiş sayılmaz.

- **BİRLEŞİK TASARIM SİSTEMİ (kullanıcı kararı 2026-10-14).** Onaylı referans
  [`docs/marka/tasarim-sistemi.html`](docs/marka/tasarim-sistemi.html) ölçü ve
  davranışta birebir; menü [`menu-sistemi.html`](docs/marka/menu-sistemi.html).
  Bileşenler `apps/web/src/components/ui/` (`Dugme`, `SayfaBasligi`/
  `SayfaIskeleti`, `Kart`, `MetrikKutulari`, `Grafik`, `Tablo`, `Sekmeler`,
  `BolumluSecici`, `Rozet`, `Alan`, `BosDurum`/`HataDurumu`/`Serit`,
  `Pencere`/`YanPanel`, `AcilirMenu`, sihirbaz parçaları); kullanım ve geçiş
  tablosu [`docs/marka/BILESENLER.md`](docs/marka/BILESENLER.md). Birincil
  düğme DÜZ KIRMIZI, degrade ve parıltı hiçbir yerde yok; hata ve uyarı =
  kırmızı (ikon + sol çizgi, metin siyah), bilgi = gri, yeşil yalnız durum
  noktası; turuncu/mavi/ikinci kırmızı token'ları kılavuza eşli. Elle düğme,
  modal, `h1`, degrade ve kılavuz dışı renk `tasarim-sistemi.spec.ts`
  bekçisinde dosya dosya sayılıyor ve istisna listesi YALNIZ KÜÇÜLÜR.

### Panel görünüşü kalıba bağlı

`globals.css` → "PANEL TASARIM KATMANI": kart, birincil düğme, tablo satırı,
form alanı ve pencere görünüşü `.panel` altındaki SINIF KALIBINA bağlı
(`@layer components`). Yeni ekranda kart için ayrı gölge/animasyon yazma,
kalıbı kullan (`rounded-xl border border-line bg-surface`); ekrana özel bir
karar gerekiyorsa yardımcı sınıfla yaz, katman onu ezmiyor. Sayfa başlığı
`sayfa-baslik`. Animasyon eklersen `prefers-reduced-motion` altına koy.
`panel-tasarim.spec.ts`.

### Konu dosyaları — İŞE BAŞLAMADAN İLGİLİ OLANI OKU

Ayrıntılı dersler (canlıda, para harcanarak ya da bir tur kaybedilerek
öğrenilenler) 2026-10-16'dan beri `docs/kurallar/` altında; her oturumda
yüklenmiyor, konuya dokunurken okunuyor. **Dokunduğun alanın dosyasını
okumadan kod yazma**: oradaki her madde bir kez sessiz hata olarak yaşandı.

| İşin konusu | Oku |
|---|---|
| Prisma, `$queryRaw`/`Prisma.sql`, migration, enum, yeni tablo, RLS politikası, `client_id`/`org_id` sahipliği, havuz, workspace taşıma, PGlite | [`veritabani.md`](docs/kurallar/veritabani.md) |
| Senkronizasyon, BullMQ işleri, `sync_jobs`, süpürme, kota, geçmiş çekimi, Meta sayfa boyutu | [`senkron-kuyruk.md`](docs/kurallar/senkron-kuyruk.md) |
| Rapor ekranı/PDF (`pdf-lib`), mail, imza HTML'i, fatura/dosya yükleme, dışarı giden istek (SSRF) | [`rapor-pdf-mail.md`](docs/kurallar/rapor-pdf-mail.md) |
| Panel bileşeni, React effect, URL/süzgeç, menü adı, shared derlemesi, `.next/types`, Nest modül kaydı, hata filtresi | [`panel-derleme.md`](docs/kurallar/panel-derleme.md) |
| Meta Graph API'ye yazan ya da okuyan kod (kreatif, hedefleme, geri okuma N-xx, Instagram, WhatsApp, ilgi alanı) | [`platform-meta.md`](docs/kurallar/platform-meta.md) |
| Google Ads API (GAQL, Demand Gen, video, Keyword Planner, bütçe) | [`platform-google.md`](docs/kurallar/platform-google.md) |
| LinkedIn Ads (para, sürüm başlığı, token ömrü, seviye eşlemesi) | [`platform-linkedin.md`](docs/kurallar/platform-linkedin.md) |
| Webhook (Meta imzası, YouTube WebSub, Instagram yeni gönderi) | [`platform-webhook.md`](docs/kurallar/platform-webhook.md) |
| Test yazma: RLS testi, mutasyon, kaynak taraması | [`test.md`](docs/kurallar/test.md) |
| Ekran, menü, akış, kim neyi görür (ürün kararı) | [`urun-kararlari.md`](docs/kurallar/urun-kararlari.md) |
| Yeni platform | [`platform-ekleme.md`](docs/kurallar/platform-ekleme.md) |

Ders yazma kuralı: yeni kalıcı ders ilgili konu dosyasına EKLENİR; burada
yalnız "Öğrenilenler"e tek satır. Bu dosyayı ~25 KB altında tut: her oturumda
ve her mesajda yükleniyor.

### Token düzeni (kullanıcı kararı, 2026-10-16)

Kullanıcı: *"aynı tempoda çalışıyorum ama tokenlarım eskiye göre hızlı
bitiyor"*. Ölçüldü: bu dosya 119 KB, `DEVAM.md` 91 KB idi; her oturum
konuşmadan önce ~80 bin token harcıyordu. Kurallar:

- **Her işe yeni oturum.** Bir iş (commit'lenmiş bir parça) bitince yeni
  oturum açılır; uzun oturumda bütün geçmiş her mesajda yeniden okunuyor.
  Devir `DEVAM.md`den. Oturum kapanırken `DEVAM.md` güncellenir (§0).
- **Mekanik iş ucuz modelde.** Geniş arama, tarama, çeviri anahtarı
  çıkarma, test koşturup özet getirme gibi işler alt ajana (`Explore` ya da
  `model: sonnet`/`haiku`) verilir; sonucu tek paragraf döner. Tasarım,
  mimari karar ve kritik kod ana modelde.
- **Beş ajan yalnız BÜYÜK işte**: yeni modül ya da bir modülün büyük
  parçası. Küçük düzeltme, tekrarlı iş (örn. i18n D3 sayfa sayfa) tek
  oturumda, ajansız.
- **Çıktıyı kısa tut.** `dogrula.sh` testlerde yalnız özet ve düşenleri,
  derlemede yalnız düşünce son 60 satırı basar (tamamı geçici dosyada,
  yolu yazılı); tek dosyanın testi için
  `npx --no-install vitest run <dosya>` kullan, bütün paketi değil.
  Büyük dosyayı baştan sona okuma: `grep -n` ile yeri bul, `sed -n a,bp`
  ile o dilimi oku.
- **`DEVAM.md` ~8 KB'ı geçmez**; biten girdi arşive taşınır.

### Test

- `pnpm --filter @advetics/api test` (vitest). PGlite = gerçek Postgres,
  şema üretim migration'larından. RLS testlerde varsayılan KAPALI; kritik
  politikada `SET ROLE` + `RETURNING` deseni.
- **Mutasyon disiplini:** kritik test, kodu bozarak doğrulanmadan yazılmış
  sayılmaz (satırı boz, düştüğünü gör, geri al). `packages/shared`
  mutasyonunda önce yeniden derle (testler `dist` okuyor); mutasyon sonrası
  test SAYISINI da oku.
- Kaynak taramasını yorumsuz kaynakta yap ve iddiayı koda çapala; dilim
  boşalırsa HATA FIRLAT. Ayrıntı ve örnekler
  [`docs/kurallar/test.md`](docs/kurallar/test.md).

### Commit

Türkçe, ne yapıldığını değil **neden** yapıldığını anlatan gövde. Son satır:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

### Push İKİ DEPOYA gidiyor — deploy YALNIZCA birinden

2026-09-07'den beri iki uzak depo var:

| Depo | Rol |
|---|---|
| `yusufProfaj/advetics` | `origin` — **sunucunun çektiği depo**, deploy buradan |
| `Profajai/advetics` | `profajai` — ikinci kopya |

`origin` İKİ push adresi taşıyor, yani tek bir `git push origin HEAD:main`
ikisine birden gidiyor ve çıktıda **iki ayrı sonuç bloğu** görünüyor. Tek blok
görüyorsan ikinci adres düşmüş demektir — kontrol et, yoksa depolar sessizce
ayrışır ve bunu ancak aylar sonra fark edersin.

**Deploy DEĞİŞMEDİ.** Sunucudaki klon `git@github.com:yusufProfaj/advetics.git`
adresinden SSH ile çekiyor; yerel push yapılandırması sunucuyu etkilemiyor.
Deploy hâlâ `advetics` kullanıcısıyla ve eski depodan.

**HTTP/2 İLE PUSH KOPUYOR.** İlk push `RPC failed ... Broken pipe / Failed
sending HTTP2 data` ile üç kez düştü; `git config http.version HTTP/1.1`
çözdü. Ayar `.git/config`te (bütün worktree'ler paylaşıyor). Yeni bir klonda
aynı hata görülürse sebebi budur — depo boyutu değil (6 MB).

### İKİ GELİŞTİRİCİ VAR — ve ikisi de `main`e push ediyor

2026-09-25'ten beri projede ikinci bir geliştirici (ve onun Claude hesabı)
çalışıyor. Yeni makine `./scripts/ortak-kurulum.sh` ile kuruluyor. Bu dosya
iki tarafta da otomatik yükleniyor; **hafıza (`~/.claude/.../memory`)
YÜKLENMİYOR**, yani kalıcı bir kural yalnızca birinin hafızasındaysa diğeri
onu bilmiyor. İki tarafı ilgilendiren kural BURAYA yazılır.

- **Push'tan önce `git pull --rebase origin main`.** Force push YASAK: öbür
  tarafın commit'ini sessizce siler ve sunucu bir sonraki deploy'da onu kaybeder.
- **Deploy tek kişi, tek seferde.** `deploy.sh` migration uyguluyor; iki deploy
  üst üste binerse biri yarım şemayla derler. Deploy etmeden önce öbür tarafa
  haber ver ve sunucuda `git log --oneline HEAD..origin/main` ile NEYİ
  çektiğine bak: `git pull` yalnızca senin commit'lerini değil, öbür tarafın
  henüz doğrulamadığı işini de canlıya alır.
- **Push deploy DEĞİL.** GitHub Actions (`dogrula.yml`) YALNIZCA doğruluyor:
  tip, panel testleri, API testleri (ayrı adımda, tek başına), derleme, RLS
  kapsaması. Secret kullanmıyor, sunucuya dokunmuyor. Geçmişi: 2026-10-06'da
  tamamen kaldırıldı (hata maillerinin kaynağı hiç çalışmamış SSH dağıtım
  işiydi), 2026-10-08'de yalnız doğrulama olarak geri kuruldu (kullanıcı
  kararı). Dağıtım işi geri GELMEZ: paylaşımlı VPS'in SSH anahtarı GitHub'da
  durmamalı. İş kırmızıysa sunucuda deploy ETME. Push'tan önce yerelde de
  koş: kırmızı iş öbür tarafa da mail atıyor. Sunucu ancak elle deploy edilince güncelleniyor. "Push ettim,
  canlıda" demek bu depoda iki kez yanlış çıktı.
- **Migration yazmadan hemen önce pull.** İki kişi aynı gün migration açarsa
  zaman damgası sırası ile uygulama sırası ayrışabilir; üretimde
  `P3018` (DEPLOYMENT.md §10c).
- **`docs/DURUM.md` ve bu dosya ORTAK.** Yeni kaydı EKLE, öbür tarafın
  yazdığını yeniden yazma; çakışmada ikisini de tut.

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

Ayrıntı ve gerekçeler [`docs/kurallar/urun-kararlari.md`](docs/kurallar/urun-kararlari.md);
ekran/menü/akış işine başlamadan oku. Özet:

- **Ölçüt kullanım kolaylığı ve reklam verimliliği**: arayüz kararlarını
  sormadan bu ikisiyle ver, gerekçesini yaz; para harcayan, geri alınamayan
  ya da başka kullanıcı kararını bozan şey sorulur.
- Hedef kullanıcı reklamcılık bilmiyor; hedef/optimizasyon/yerleşim/teklif
  sorulmuyor (`goal-mapping.ts`).
- Menü yedi bölüm, Türkçe (Genel Bakış · Yönet · Oluştur · Planla ·
  İyileştir · Raporlar · Base + Ayarlar; Yönet 2026-10-20'den beri üstte);
  yalnız ekranı olan satır menüde.
- Reklam kurmanın tek yolu AdvCampaign (`/reklam`, menüde "Kampanya Oluştur"
  2026-10-20'den beri; Akıllı Boost menüde "Boost Kampanyası"). Genel Bakış özet, iniş
  tablosu Reklam Yöneticisi'nde. Müşteri hesabı dört ekran görür.
- Arayüz iki dilli (TR/EN, 2026-10-15): ekran metni sözlükten
  (`apps/web/src/dil/sozlukler/`, `useSozluk`/`sozluk()`), yeni ekran iki
  dili birden yazar; rapor/reklam dili workspace ayarı. `docs/i18n/MIMARI.md`.
- Bir müşteri = bir şirket, birden çok proje/hesap; hesap süzgeci her zaman.
  Müşteri ayrımı bağlantıda değil hesap ATAMASINDA; atama izlemeyi açar ve
  geçmişi kuyruğa alır. Ajansın bağlantısı bir kez kurulur, şirket isterse
  kendi bağlantısını kurar (havuzun iki sahibi).
- Raporlar tek sayfa (rapor + şablon + faturalar). Base = Marka Merkezi
  (tek workspace) + Varlıklar; Ayarlar dört sekme; adresler tek üreticiden
  (`packages/shared/src/panel`). Aylık Bütçe Planla altında.
- Akıllı Boost yalnız Instagram (+ YouTube) kartı üretir, Facebook değil.
