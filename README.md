# Advetics

Meta (Facebook/Instagram) ve Google Ads için beyaz etiketli reklam otomasyon ve
raporlama paneli. Profaj ajansı için yazıldı.

> **Kapsam kilidi:** Yalnızca **Meta** ve **Google Ads**. TikTok, Snapchat, LinkedIn ve
> diğer platformlar ürün kapsamı dışında — istenmedi ve eklenmemeli.

**Nereden başlamalı:**

| Belge | Ne anlatıyor |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | **Çalışma kuralları.** Sunucu kısıtları, kod tarzı, canlıda öğrenilen platform tuzakları. Koda dokunmadan önce oku. |
| [`docs/DURUM.md`](docs/DURUM.md) | **Gerçekte ne olduğu.** Nerede kalındı, ne çalışıyor, ne çalışmıyor. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Mimari **planı** (2026-08-03). Bu belgeyle DURUM.md çelişirse DURUM.md geçerli. |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Üretim kurulumu. |

---

## Ne yapıyor

Sekiz modülün hepsi yazılmış durumda:

| # | Modül | Ne yapıyor |
|---|---|---|
| 1 | Auth + çok kiracılık | JWT + refresh rotasyonu, 7 rol, 34 yetki anahtarı, PostgreSQL RLS |
| 2 | Platform bağlantıları | Meta & Google OAuth, reklam hesabı havuzu ve müşteriye atama |
| 3 | Senkronizasyon + panel | BullMQ worker'ları, kampanya/metrik/kırılım çekimi, birleşik gösterge paneli |
| 4 | Ads Explorer | Reklam seviyesinde arama, kreatif önizleme, red sebepleri |
| 5 | Kurallar motoru | Bütçe ve durum otomasyonu; `dry_run` varsayılan |
| 6 | Beyaz etiketli raporlama | PDF üretimi, mail gönderimi, planlı raporlar, platform faturaları |
| 7 | Auto-Boost | Yeni Instagram/Facebook gönderilerini ve YouTube videolarını (WebSub → Demand Gen) onaydan geçirip boostlama |
| 8 | Toplu kampanya oluşturucu | Taslak ağacı, çoklu kreatif, `paused_draft` varsayılan |

**Ayrım "yazıldı mı" değil, "CANLIDA çalıştırıldı mı":** okuma tarafı iki platformda da
canlı doğrulandı (Google Basic Access, 2026-08-11). **Yazma tarafı hiçbir platformda canlı
doğrulanmadı** — Meta'da `ads_management` onayı yok, Google'da istek gövdeleri bilgiden
yazıldı ve ilk gerçek çağrı en küçük bütçeyle yapılmalı. Kural motorunun Google'a yazan
yolu (`applyAction`) ve toplu oluşturmanın Google dalı (`createAd`) henüz yazılmadı ve
çağrıldıklarında açık bir hata fırlatıyorlar — sessizce başarılı dönmüyorlar.
Ayrıntı: [`CLAUDE.md`](CLAUDE.md) → "Canlıda öğrenilen platform gerçekleri".

---

## Yığın

| Katman | Ne |
|---|---|
| API | NestJS 11 — REST + BullMQ worker (ayrı süreç) |
| Panel | Next.js 15 App Router |
| Ortak | `packages/shared` — Zod şemaları, RBAC, tarih ve biçimlendirme yardımcıları |
| Veritabanı | **PostgreSQL** 16 + satır güvenliği (RLS), Prisma 6 ile erişiliyor |
| Kuyruk | Redis 7 + BullMQ (db `3`, önek `advetics`) |
| Testler | Vitest; veritabanına dokunanlar **PGlite** (gerçek Postgres, WASM) |

Platform SDK'sı **kullanılmıyor** — Meta ve Google'a düz REST ile gidiliyor. Gerekçe:
SDK'lar kota başlıklarını soyutlayıp gizliyor, biz onları ham okumak zorundayız.

---

## Kurulum

**Gereksinimler:** Node ≥ 22, pnpm 9.12, Docker (PostgreSQL + Redis için).

```bash
pnpm install
```

```bash
cp .env.example .env
```

`.env` **depo kökünde ve tek** — API, panel ve bütün `prisma/` script'leri oradan
besleniyor. **Zorunlu olan yalnızca altı değişken**: `DATABASE_URL`,
`DIRECT_DATABASE_URL`, `WORKER_DATABASE_URL`, `JWT_ACCESS_SECRET`,
`JWT_REFRESH_SECRET`, `ENCRYPTION_KEY_V1`. Platform kimlik bilgileri (`META_*`,
`GOOGLE_*`, `YOUTUBE_API_KEY`) ve Redis **bilinçli olarak opsiyonel** — panel
platform onayı beklenirken de ayağa kalkabilsin diye. `SEED_*` yalnızca
`db:seed` adımında isteniyor.

```bash
pnpm infra:up      # PostgreSQL 16 + Redis 7
pnpm db:setup      # migrate → RLS → seed
pnpm dev           # API + panel birlikte
```

`db:setup` üç adımı sırayla koşuyor ve **ikincisi atlanamaz**:

1. `db:migrate` — Prisma şemasını uygular
2. `db:rls` — **kısıtları ve RLS politikalarını uygular**; bunlar Prisma migration'ının
   parçası DEĞİL, `prisma/sql/*.sql` dosyalarından geliyor
3. `db:seed` — organizasyon, yönetici kullanıcı ve demo müşteriler

- Panel: http://localhost:3000
- API: http://localhost:4000/api

Giriş bilgileri `.env` içindeki `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.

### Kurulum doğrulaması

Panelde **"Veritabanı satır güvenliği (RLS)"** kartı yeşil olmalı ve "korumasız tablo"
uyarısı görünmemeli. Aynısı uçtan:

```bash
curl -s http://localhost:4000/api/health
```

---

## Testler

```bash
pnpm --filter @advetics/api test     # 2.253 test
pnpm --filter @advetics/web test     # 417 test
pnpm typecheck                        # tüm paketler
```

**Typecheck kırmızı bırakılmıyor.** Vitest tip denetimi yapmıyor: eksik bir fixture
alanı testleri yeşil geçirip özelliği hiç üretmeden bırakabiliyor — bu depoda tam
olarak yaşandı (Kitle Özeti sayfası hiç çizilmeden 259 test geçiyordu).

Veritabanına dokunan testler **PGlite** kullanıyor ve şema **üretim
migration'larından** kuruluyor; el yazımı bir test şeması yok. Yani bir migration
bozuksa testler de düşüyor.

**Mutasyon disiplini:** kritik bir test, kodu bozup düştüğü görülmeden yazılmış
sayılmıyor. Gerekçesi ve bu depoda boşa düşmüş test örnekleri: [`CLAUDE.md`](CLAUDE.md).

---

## Proje yapısı

```
advetics/
├── apps/
│   ├── api/                      NestJS — REST API + worker
│   │   ├── prisma/
│   │   │   ├── schema.prisma     54 model
│   │   │   ├── migrations/       55 migration
│   │   │   ├── sql/              RLS politikaları + Prisma'nın ifade edemediği kısıtlar
│   │   │   └── seed.ts
│   │   └── src/
│   │       ├── modules/          21 modül (aşağıya bkz.)
│   │       ├── queue/            BullMQ işleri, kota bekçisi, toplu yazma
│   │       ├── prisma/           İKİ istemci: RLS'li ve RLS'siz
│   │       ├── storage/          Dosya arşivi (kreatif, fatura)
│   │       ├── crypto/           AES-256-GCM — OAuth token'ları
│   │       └── worker.ts         Worker süreci — API'den AYRI
│   └── web/                      Next.js 15 — 28 panel sayfası
├── packages/shared/              Zod şemaları, RBAC, ortak yardımcılar
├── infra/postgres/init/          Veritabanı rolleri
├── scripts/                      Kurulum ve dağıtım
└── docs/                         Durum, mimari, dağıtım
```

**API modülleri:** `ad-builder` · `ads` · `alerts` · `assets` · `audit` · `auth` ·
`autoboost` · `boosts` · `budgets` · `bulk` · `connections` · `draft-tree` · `email` ·
`forms` · `health` · `leads` · `metrics` · `reports` · `rules` · `sync` · `tenancy`

---

## Mimarinin bilmen gereken kararları

### İki Prisma istemcisi

- **`PrismaService.withTenant(ctx, fn)`** — `advetics_app` rolüyle bağlanır, **RLS
  uygulanır**. Bir transaction açıp oturum değişkenlerini `is_local` ile kurar;
  transaction bitince bağlam sıfırlanır ve bağlantı havuzunda sonraki isteğe sızmaz.
- **`PrismaAdminService`** — `advetics_worker` rolüyle bağlanır, **RLS'i atlar**.
  Yalnızca kimlik doğrulama öncesi akışlar, guard'ın bağlam kurma okuması ve arka plan
  worker'ları. Bir HTTP ucunun iş mantığında bunu görüyorsan orada hata var.

### Üç veritabanı rolü

| Rol | Kullanım | RLS |
|---|---|---|
| `advetics_migrator` | migrate + seed | Atlar |
| `advetics_app` | **API runtime** | **Uygulanır** |
| `advetics_worker` | Kimlik doğrulama öncesi + arka plan | Atlar |

`advetics_app` tablo sahibi değil ve `BYPASSRLS` yetkisi yok. Uygulama katmanında bir
filtre unutulsa bile başka müşterinin satırı veritabanı seviyesinde görünmüyor —
159 RLS politikası son savunma hattı.

### Varsayılan kilitli

`JwtAuthGuard` global. Bir rotayı açmak `@Public()` ile **kasıtlı** bir eylem gerektiriyor;
tersi tasarım er ya da geç korunmayı unutulmuş bir uç üretir. Bugün 17 açık uç var:
giriş/kayıt/refresh/çıkış, parola sıfırlama, OAuth callback, platform webhook'ları, Meta
veri silme, paylaşılan rapor bağlantısı, doğrulanmış domain için marka bilgisi ve sağlık.

**`POST /auth/register` bilerek açık ve bu bir borç:** tek organizasyon varsayımıyla
yazıldı, kaynağında da öyle yazıyor. Çok kiracılı satışa geçilirken bu rota kapatılmalı
ya da davete bağlanmalı, yoksa herkes kendine organizasyon açabiliyor. Uygulama
seviyesinde hız sınırı da yok (`@nestjs/throttler` kurulu değil).

### Denetim kaydı append-only

`audit_logs` üzerinde UPDATE/DELETE politikası **kasıtlı olarak tanımlı değil** ve
`advetics_app`in bu yetkileri veritabanı seviyesinde geri alınmış. Silinebilen bir
denetim kaydı denetim kaydı değildir.

### Sağlayıcı deseni

`IAdPlatformProvider` → `meta.provider.ts`, `google.provider.ts`. Üst katmanlar hangi
platformla konuştuklarını bilmiyor. Kapsam kilidi iki yerde yazılı ve ikisi de dar:
`PLATFORMS` sabiti (`packages/shared/src/constants/platforms.ts`) ve Prisma'daki
`Platform` enum'ı yalnızca `meta` ve `google` taşıyor.

### Değişmez varsayılanlar

1. Her kural `dry_run` doğar; `live` moda geçiş ayrı bir yetki.
2. Toplu oluşturucu `paused_draft` üretir — asla doğrudan yayına girmez.
3. Auto-Boost'ta günlük ve aylık harcama tavanı zorunlu.
4. OAuth token'ları AES-256-GCM ile şifreli, `key_version` ile rotasyona hazır.
5. Bayat veriyle otomatik aksiyon alınmıyor.
6. Para **micros** (BigInt), tarihler **`YYYY-MM-DD` string** — `Date`e çevirmek saat
   dilimi kayması üretiyor.

---

## Komutlar

| Komut | Ne yapıyor |
|---|---|
| `pnpm dev` | API + panel (watch) |
| `pnpm build` | Tümünü derle |
| `pnpm typecheck` · `pnpm test` | Tip kontrolü · testler |
| `pnpm infra:up` / `infra:down` | PostgreSQL + Redis |
| `pnpm infra:reset` | **Veritabanını sıfırlar — tüm veri gider** |
| `pnpm db:migrate` · `db:rls` · `db:seed` | Tek tek kurulum adımları |
| `pnpm db:studio` | Prisma Studio |

---

## Dağıtım

Üretim, **paylaşımlı** bir VPS'te duruyor: aynı makinede ajansın ve müşterilerinin
başka canlı siteleri var. Bu, dağıtımın en önemli kısıtı.

> ### Kural: dağıtım ASLA root ile yapılmaz
>
> `git pull` da dahil. Root ile çekilen dosyalar root'a ait kalıyor ve sonraki
> dağıtımlar "Permission denied" veriyor; root'un pm2'si ise **başka sitelerin canlı
> süreçlerini** yönetiyor. `scripts/deploy.sh` root'u zaten reddediyor ve sebebi
> dosyanın başında yazılı — bir kez yaşandı.
>
> Sistem geneli hiçbir şey değiştirilmez: `/usr/bin/node`, `redis.conf`,
> `postgresql.conf`, `systemctl restart`, `npm install -g`, UFW kuralları. Eksik bir
> bileşen varsa **bildir ve dur**.

Bugün dağıtım **elle** yapılıyor:

```bash
cd ~/htdocs/advetics.com && git pull && ./scripts/deploy.sh
```

`deploy.sh` sırayla: bağımlılık kurulumu → derleme → `migrate` → **`db:rls`** →
pm2 reload → sağlık kontrolü. Üç pm2 süreci var: **`advetics-api`**, **`advetics-web`**
ve **`advetics-worker`** ([`ecosystem.config.js`](ecosystem.config.js)).

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) bir otomatik dağıtım akışı
tanımlıyor (doğrulama + SSH ile dağıtım) **ama pratikte çalışmıyor**: `main`'e push
edildikten sonra sunucu eski commit'te kalıyor (2026-09-07'de ölçüldü). Akış duruyor,
sebebi araştırılmadı — dağıtım yukarıdaki komutla elle yapılıyor.

| Script | Kim çalıştırır | Ne yapar |
|---|---|---|
| [`scripts/vps-setup.sh`](scripts/vps-setup.sh) | root, **bir kez** | Node, pnpm, pm2, PostgreSQL + roller, Redis |
| [`scripts/site-setup.sh`](scripts/site-setup.sh) | site kullanıcısı, **bir kez** | `.env`, şema + RLS, derleme, seed, pm2 |
| [`scripts/deploy.sh`](scripts/deploy.sh) | her dağıtımda | install → build → migrate → RLS → reload → health |
| [`scripts/preflight.sh`](scripts/preflight.sh) | ne zaman istersen | Teşhis — hiçbir şeyi değiştirmez |

> **Yeni tablo eklerken:** `prisma/sql/02_rls.sql` içindeki listeye ekle ve politika yaz;
> `test/pglite-harness.ts` içindeki `TRUNCATE` listesine de ekle. Birincisi
> `rls-coverage.spec.ts` ile, ikincisi testler arası veri sızıntısıyla kendini gösteriyor.

Kurulumun tamamı: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

---

## Depo

Kod **iki uzak depoya** gidiyor. `origin` iki push adresi taşıyor:

```bash
git push origin HEAD:main
```

Çıktıda **iki sonuç bloğu** görünmeli. Tek blok, ikinci adresin düştüğü ve depoların
sessizce ayrışmaya başladığı anlamına geliyor.

Dağıtım yalnızca `yusufProfaj/advetics` üzerinden — sunucudaki klon oradan çekiyor.

---

## Gizli bilgiler

- **Parolalar, token'lar ve app secret'lar depoya yazılmaz.** `.env` git'te yok ve
  olmamalı.
- **Sunucu adresi, ana makine adı ve aynı makinedeki diğer sitelerin listesi bu depoda
  bilerek yok** — hem saldırı yüzeyi hem üçüncü tarafların iş bilgisi. Erişim bilgileri
  parola yöneticisinde.
- Seed script'leri parolayı yalnızca ortam değişkeninden okuyor, koda gömmüyor.

---

## API uçları

25 controller var; taban yollar:

| Alan | Taban yol |
|---|---|
| Kimlik ve oturum | `/api/auth` |
| Organizasyon, ekip, marka | `/api/organization` (üyeler ve davetler burada) · `/api/branding` |
| Müşteriler | `/api/clients` |
| Platform bağlantıları ve senkronizasyon | `/api/connections` · `/api/sync` |
| Metrikler, reklamlar, kreatifler | `/api/metrics` · `/api/ads` · `/api/creatives` |
| Kurallar, bütçeler, uyarılar | `/api/rules` · `/api/budgets` · `/api/alerts` |
| Raporlama | `/api/reports` |
| Auto-Boost ve boost | `/api/autoboost` · `/api/boosts` |
| Taslak ve toplu oluşturma | `/api/ad-drafts` · `/api/draft-campaigns` · `/api/bulk` · `/api/assets` |
| Form ve potansiyel müşteri | `/api/lead-forms` · `/api/leads` |
| Mail hesabı | `/api/me/email-account` |
| Denetim kaydı | `/api/audit-logs` |
| Webhook | `/api/webhooks/youtube` |
| Sağlık | `/api/health` · `/api/health/rls` |

Roller ve yetki matrisi: [`packages/shared/src/auth/roles.ts`](packages/shared/src/auth/roles.ts)
