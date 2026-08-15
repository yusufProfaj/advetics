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
- **`ad_accounts`, `platform_connections` ve `social_profiles` içinde
  `client_id` NULLABLE.** NULL = ajansın havuzunda, müşteriye atanmamış.
  Sahiplik `org_id`'de. Bu satırlar için senkronizasyon kuyruğa GİRMEMELİ —
  `client_id`'si NULL bir `sync_jobs` satırını RLS kimseye göstermez ve iş
  sessizce kaybolur (`assertAssigned()` kullan).

### Test

- `pnpm --filter @advetics/api test` — vitest. Şu an **783 API testi**.
- Veritabanına dokunan testler **PGlite** kullanıyor (gerçek Postgres, WASM).
  Şema üretim migration'larından kuruluyor — el yazımı test şeması yok.
- **RLS testlerde varsayılan olarak KAPALI** (worker rolü BYPASSRLS'i taklit
  ediyor). Ama kapatılabilir bir varsayılan: `SET ROLE` ile sahibi olmayan bir
  role geçen bir test politikaları GERÇEKTEN sınayabiliyor — örnek
  `ad-account-pool-rls.spec.ts`. Kritik bir politika yazıyorsan elle gözden
  geçirmekle yetinme, o deseni kullan.
- Bazı testler **kaynak taraması** yapıyor (`meta-account-path.spec.ts`,
  `google-request.spec.ts`). Canlıda öğrenilen ve birim testiyle
  yakalanamayacak kuralları böyle kilitliyoruz.

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
