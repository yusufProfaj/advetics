# Advetics — AdTech Automation & Reporting Dashboard

Meta (Facebook/Instagram) ve Google Ads için white-label reklam otomasyon ve raporlama paneli.

> **Kapsam kilidi:** Yalnızca **Meta** ve **Google Ads**. TikTok, Snapchat, LinkedIn ve diğer
> platformlar ürün kapsamı dışındadır.

- **Nerede kaldık, sırada ne var:** [`docs/DURUM.md`](docs/DURUM.md) ← buradan başla
- Teknik mimari ve karar gerekçeleri: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Üretim kurulumu (Hostinger VPS + CloudPanel): [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

---

## Durum

| Modül | Kapsam | Durum |
|---|---|---|
| **1** | Auth + multi-tenant iskelet + RLS | ✅ Tamamlandı |
| 2 | Platform bağlantıları (Meta & Google OAuth) | ⏳ |
| 3 | Sync worker'ları + Unified Dashboard | ⏳ |
| 4 | Ads Explorer | ⏳ |
| 5 | Kurallar Motoru | ⏳ |
| 6 | White-Label Raporlama | ⏳ |
| 7 | Auto-Boost (Meta) | ⏳ |
| 8 | Toplu Kampanya Oluşturucu | ⏳ |

---

## Gereksinimler

| Araç | Sürüm | Kurulum |
|---|---|---|
| Node.js | ≥ 22 | [nodejs.org](https://nodejs.org) |
| pnpm | 9.x | `npm install -g pnpm` |
| Docker Desktop | güncel | [docker.com](https://www.docker.com/products/docker-desktop) |

Docker, PostgreSQL 16 ve Redis 7'yi ayağa kaldırmak için gereklidir. Alternatif olarak yerel
bir PostgreSQL kurulumu da kullanılabilir — o durumda [`infra/postgres/init/01-roles.sql`](infra/postgres/init/01-roles.sql)
dosyasını elle çalıştırman gerekir.

---

## Kurulum

```bash
pnpm install
```

```bash
cp .env.example .env
```

```bash
pnpm infra:up
```

```bash
pnpm db:setup
```

`db:setup` üç adımı sırayla çalıştırır:
1. `db:migrate` — Prisma şemasını uygular
2. `db:rls` — **constraint'leri ve RLS politikalarını uygular** (bu adım atlanamaz)
3. `db:seed` — organizasyon, owner kullanıcı ve iki demo müşteri oluşturur

```bash
pnpm dev
```

- Panel: http://localhost:3000
- API: http://localhost:4000/api

Giriş bilgileri `.env` içindeki `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` değerleridir.

### Kurulum doğrulaması

Giriş yaptıktan sonra panelde **"Veritabanı satır güvenliği (RLS)"** kartı yeşil olmalı ve
"korumasız tablo" uyarısı görünmemelidir. Aynı kontrol API'den de yapılabilir:

```bash
curl -s http://localhost:4000/api/health
```

---

## Proje yapısı

```
advetics/
├── apps/
│   ├── api/                    NestJS — REST API + iş mantığı
│   │   ├── prisma/
│   │   │   ├── schema.prisma   Veri modeli
│   │   │   ├── sql/            RLS politikaları + Prisma'nın ifade edemediği kısıtlar
│   │   │   ├── apply-sql.ts    sql/ dosyalarını uygular  (pnpm db:rls)
│   │   │   └── seed.ts         Geliştirme verisi
│   │   └── src/
│   │       ├── config/         Zod ile doğrulanan ortam değişkenleri
│   │       ├── crypto/         AES-256-GCM (Modül 2'de OAuth token'ları için)
│   │       ├── common/         Guard, pipe, filtre, decorator
│   │       ├── prisma/         İki istemci: RLS'li ve RLS'siz
│   │       └── modules/
│   │           ├── auth/       JWT + refresh rotasyonu + tenant bağlamı
│   │           ├── tenancy/    Organizasyon, müşteri, ekip, marka
│   │           ├── audit/      Denetim kaydı
│   │           └── health/     Sağlık + RLS doğrulaması
│   └── web/                    Next.js 15 — panel
├── packages/
│   └── shared/                 Zod şemaları, RBAC matrisi, ortak tipler
├── infra/postgres/init/        Veritabanı rolleri
├── docs/DURUM.md               Güncel durum ve yol haritası
└── docs/ARCHITECTURE.md        Teknik mimari (plan + gerekçeler)
```

---

## Güvenlik mimarisi

Bu ürün müşteri bütçelerine dokunuyor ve birden fazla müşterinin verisini aynı veritabanında
tutuyor. Modül 1'in tamamı bu iki gerçeğin etrafında tasarlandı.

### Üç veritabanı rolü

| Rol | Kullanım | RLS |
|---|---|---|
| `advetics_migrator` | Prisma migrate + seed | Atlar (BYPASSRLS) |
| `advetics_app` | **API runtime — normal istekler** | **Uygulanır** |
| `advetics_worker` | Kimlik doğrulama öncesi akışlar, arka plan işleri | Atlar (BYPASSRLS) |

`advetics_app` tablo sahibi değildir ve `BYPASSRLS` yetkisi yoktur. Uygulama katmanında bir
filtre unutulsa bile başka bir müşterinin satırı veritabanı seviyesinde görünmez.

### İki Prisma istemcisi

- **`PrismaService`** — `advetics_app` ile bağlanır. Tüm tenant verisi `withTenant(ctx, fn)`
  üzerinden okunur/yazılır. Bu metod bir transaction açar ve RLS oturum değişkenlerini
  `set_config(..., is_local => true)` ile kurar; transaction bitince bağlam sıfırlanır,
  connection pool'da bir sonraki isteğe sızmaz.

- **`PrismaAdminService`** — `advetics_worker` ile bağlanır, **RLS'i atlar**. Kullanımı üç
  duruma sınırlıdır: kimlik doğrulama öncesi akışlar (login, davet kabul, şifre sıfırlama),
  `JwtAuthGuard`'ın bağlamı kurmak için yaptığı okuma, ve arka plan worker'ları.
  Bir HTTP endpoint'inin iş mantığında bu istemciyi görüyorsan orada bir hata vardır.

### Varsayılan kilitli

`JwtAuthGuard` global olarak bağlıdır. Bir rotayı açmak `@Public()` ile kasıtlı bir eylem
gerektirir — tersi tasarım, er ya da geç korunmayı unutulmuş bir endpoint üretir.

### Denetim kaydı append-only

`audit_logs` üzerinde UPDATE/DELETE politikası **kasıtlı olarak tanımlı değildir** ve
`advetics_app` rolünün bu yetkileri veritabanı seviyesinde geri alınmıştır. Silinebilen bir
denetim kaydı denetim kaydı değildir.

### Değişmez varsayılanlar

1. Her kural `dry_run` modunda oluşur; `live` moda geçiş ayrı bir yetkidir *(Modül 5)*.
2. Toplu oluşturucu varsayılanı `paused_draft` — asla doğrudan yayına girmez *(Modül 8)*.
3. Auto-Boost'ta günlük ve aylık harcama tavanı zorunludur *(Modül 7)*.
4. OAuth token'ları AES-256-GCM ile şifrelenir, `key_version` ile rotasyona hazırdır *(Modül 2)*.
5. Bayat veriyle otomatik aksiyon alınmaz *(Modül 5)*.

---

## Komutlar

| Komut | Açıklama |
|---|---|
| `pnpm dev` | API + panel birlikte (watch modu) |
| `pnpm build` | Tümünü derle |
| `pnpm typecheck` | Tüm paketleri tip kontrolünden geçir |
| `pnpm infra:up` / `infra:down` | PostgreSQL + Redis |
| `pnpm infra:reset` | **Veritabanını sıfırla** (tüm veri silinir) |
| `pnpm db:migrate` | Prisma migration |
| `pnpm db:rls` | Constraint + RLS politikalarını uygula |
| `pnpm db:seed` | Geliştirme verisi |
| `pnpm db:studio` | Prisma Studio |

## Dağıtım

`main` branch'ine her push, [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
üzerinden otomatik dağıtımı tetikler:

1. **Doğrula** (GitHub runner) — tip kontrolü, derleme, **RLS kapsama kontrolü**
   (Prisma şemasındaki her tablo `02_rls.sql` içinde tanımlı mı?)
2. **Dağıt** (SSH → VPS) — `git reset --hard origin/main` → [`scripts/deploy.sh`](scripts/deploy.sh)
3. **Doğrula** (dışarıdan) — `https://advetics.com/api/health` + `/login`

Sunucuda iki pm2 süreci çalışır ([`ecosystem.config.js`](ecosystem.config.js)):
`advetics-web` (3598) ve `advetics-api` (3599). Next.js `/api/*` isteklerini kendi içinden
API'ye yönlendirdiği için **CloudPanel'in ürettiği varsayılan vhost düzenlenmeden çalışır**;
Nginx'e ayrı bir `/api` bloğu eklemek isteğe bağlı bir optimizasyondur.

### Sunucu script'leri

| Script | Nerede | Ne yapar |
|---|---|---|
| [`scripts/vps-setup.sh`](scripts/vps-setup.sh) | root, **bir kez** | Node 22, pnpm, pm2, PostgreSQL 16 + üç rol, Redis, UFW |
| [`scripts/site-setup.sh`](scripts/site-setup.sh) | site kullanıcısı, **bir kez** | `.env` üretir, şema + RLS, derleme, seed, pm2 |
| [`scripts/deploy.sh`](scripts/deploy.sh) | her dağıtımda (Actions tetikler) | install → build → migrate → **RLS** → reload → health |
| [`scripts/preflight.sh`](scripts/preflight.sh) | ne zaman istersen | Teşhis — hiçbir şeyi değiştirmez, sorunları ve çözümlerini listeler |

Kurulum adımlarının tamamı: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)

> **Yeni tablo eklerken:** `prisma/sql/02_rls.sql` içindeki tablo listesine ekle ve politika
> yaz. `/api/health/rls` endpoint'i korumasız tabloları listeler; panel açılışında da uyarı
> olarak görünür.

---

## API uçları (Modül 1)

| Metod | Yol | Yetki |
|---|---|---|
| `POST` | `/api/auth/register` | Açık |
| `POST` | `/api/auth/login` | Açık |
| `POST` | `/api/auth/refresh` | Refresh cookie |
| `POST` | `/api/auth/logout` · `/logout-all` | — |
| `GET` | `/api/auth/session` | Oturum |
| `POST` | `/api/auth/switch-client` | Oturum |
| `POST` | `/api/auth/invitations/accept` | Açık (davet token'ı) |
| `POST` | `/api/auth/password/reset-request` · `reset-confirm` | Açık |
| `POST` | `/api/auth/password/change` | Oturum |
| `GET`·`PATCH` | `/api/organization` | `org.read` · `org.write` + org admin |
| `GET`·`POST`·`PATCH`·`DELETE` | `/api/clients` | `client.*` |
| `GET` | `/api/members` | `user.read` |
| `GET`·`POST`·`DELETE` | `/api/invitations` | `user.invite` + org admin |
| `PATCH`·`DELETE` | `/api/memberships/:id` | `user.write` + org admin |
| `GET`·`POST` | `/api/branding` | `branding.read` · `branding.write` |
| `GET` | `/api/branding/by-domain` | Açık (yalnızca doğrulanmış domain) |
| `GET` | `/api/audit-logs` | `audit.read` |
| `GET` | `/api/health` · `/api/health/rls` | Açık · Oturum |

Roller ve yetki matrisi: [`packages/shared/src/auth/roles.ts`](packages/shared/src/auth/roles.ts)
