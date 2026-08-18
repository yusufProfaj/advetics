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

- **`Prisma.sql` şablonu içindeki SQL yorumlarında backtick KULLANMA.** Şablonu
  ortasından kapatıyor; hata `TS1005: ';' expected` ve sebebi hiç belli olmuyor.
  `sql-template.spec.ts` bunu tarıyor.
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

- `pnpm --filter @advetics/api test` — vitest. Şu an **789 API testi**.
- Veritabanına dokunan testler **PGlite** kullanıyor (gerçek Postgres, WASM).
  Şema üretim migration'larından kuruluyor — el yazımı test şeması yok.
- **RLS testlerde varsayılan olarak KAPALI** (worker rolü BYPASSRLS'i taklit
  ediyor). Ama kapatılabilir bir varsayılan: `SET ROLE` ile sahibi olmayan bir
  role geçen bir test politikaları GERÇEKTEN sınayabiliyor — örnek
  `ad-account-pool-rls.spec.ts`. Kritik bir politika yazıyorsan elle gözden
  geçirmekle yetinme, o deseni kullan.
- **MUTASYON DİSİPLİNİ: kritik bir test, kodu bozarak doğrulanmadan yazılmış
  sayılmaz.** Bu oturumda üç test mutasyonla BOŞ çıktı — hepsi geçiyordu ama
  hiçbir şey tutmuyordu: (1) bir fonksiyon test edilmişti ama ÇAĞRILDIĞI test
  edilmemişti, (2) kırpma testi kırpmanın OLDUĞUNU değil yalnızca sonucun
  şeklini kontrol ediyordu, (3) ad set adının hiç testi yoktu. Testi yazdıktan
  sonra ilgili satırı boz, düştüğünü gör, geri al.
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
- **Platform bağlantısı AJANSA ait, müşteriye değil.** Meta/Google bir kez
  yetkilendiriliyor; erişilen bütün reklam hesapları VE sayfalar havuza düşüyor
  ve müşteriye panelden atanıyor. Müşteri başına yeniden yetkilendirme yok —
  platform önceki token'ı geçersiz kılıyor ve bağlantıları koparıyordu.
  Bağlantı kurmak/kaldırmak ve atama yapmak org yöneticisi işi.
