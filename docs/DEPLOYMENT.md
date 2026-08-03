# Dağıtım Rehberi — Hostinger VPS + CloudPanel

`advetics.com` için üretim kurulumu. Bu rehberi **sırayla** uygula; her adım bir öncekine bağlı.

---

## 0. Mimari — neden iki port var

Verdiğin tek port (`3598`) panele ayrıldı. Sebep: bu monorepo **iki ayrı Node süreci**
çalıştırıyor ve ikisi de kendi portuna ihtiyaç duyuyor.

```
                    ┌──────────────────────────────────────────┐
   İnternet         │            Hostinger VPS                 │
      │             │                                          │
      │  :443       │   ┌─────────────────────────────────┐    │
      └────────────►│   │  Nginx (CloudPanel yönetiyor)   │    │
   advetics.com     │   └───────┬──────────────┬──────────┘    │
                    │           │              │               │
                    │      /api │              │ /  (diğer)    │
                    │           ▼              ▼               │
                    │   ┌──────────────┐  ┌──────────────┐     │
                    │   │ advetics-api │  │ advetics-web │     │
                    │   │  NestJS      │  │  Next.js     │     │
                    │   │  :3599       │  │  :3598       │     │
                    │   └──────┬───────┘  └──────────────┘     │
                    │          │                               │
                    │   ┌──────▼───────┐  ┌──────────────┐     │
                    │   │ PostgreSQL 16│  │  Redis 7     │     │
                    │   │  :5432       │  │  :6379       │     │
                    │   └──────────────┘  └──────────────┘     │
                    └──────────────────────────────────────────┘
```

| Süreç | Port | Dışarıya açık | Görev |
|---|---|---|---|
| `advetics-web` | 3598 | Hayır (yalnızca Nginx) | Next.js paneli |
| `advetics-api` | 3599 | Hayır (yalnızca Nginx) | NestJS API |
| PostgreSQL | 5432 | **Hayır** | Veritabanı |
| Redis | 6379 | **Hayır** | Kuyruk (Modül 3'ten itibaren) |

Her iki uygulama da `127.0.0.1` üzerinde dinler. Dışarıya açılan tek şey Nginx'tir.

> **Redis şu an kullanılmıyor** ama Modül 3'te (sync worker'ları) zorunlu hale gelecek.
> Şimdi kurmak, o modülde kurulum adımı ile uğraşmamanı sağlar.

---

## 1. DNS

Hostinger DNS panelinde:

| Tip | İsim | Değer | TTL |
|---|---|---|---|
| A | `@` | VPS IP adresin | 3600 |
| A | `www` | VPS IP adresin | 3600 |

Yayılmayı kontrol et (VPS IP'sini döndürmeli):

```bash
dig +short advetics.com
```

> **White-label custom domain'ler** (Modül 6) müşterinin kendi DNS'inde
> `advetics.com`'a CNAME olarak tanımlanacak. Şimdilik yapılacak bir şey yok.

---

## 2. CloudPanel'de site oluştur

CloudPanel arayüzünde: **Sites → Add Site → Create a Node.js Site**

| Alan | Değer |
|---|---|
| Domain Name | `advetics.com` |
| Node.js Version | 22 (listede yoksa en yükseği seç, adım 3'te düzelteceğiz) |
| App Port | `3598` |
| Site User | `advetics` |
| Site User Password | güçlü bir şifre üret ve sakla |

Bu işlem şunları oluşturur:
- Sistem kullanıcısı: `advetics`
- Uygulama dizini: `/home/advetics/htdocs/advetics.com`
- `3598`'e yönlendiren bir Nginx vhost (adım 10'da düzenleyeceğiz)

Bundan sonraki komutların **tamamı** site kullanıcısı olarak çalıştırılır:

```bash
ssh root@VPS_IP -t 'su - advetics'
```

---

## 3. Node.js 22, pnpm ve pm2

CloudPanel'in verdiği Node sürümü 22'nin altındaysa `nvm` ile kur:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh" && nvm install 22 && nvm alias default 22
```

pnpm (workspace protokolü için zorunlu — `npm install` bu monorepo'da çalışmaz):

```bash
corepack enable pnpm && corepack prepare pnpm@9 --activate
```

pm2:

```bash
npm install -g pm2
```

Doğrula — üçü de sürüm yazdırmalı:

```bash
node -v && pnpm -v && pm2 -v
```

---

## 4. PostgreSQL 16

> CloudPanel MySQL/MariaDB ile gelir, **PostgreSQL gelmez**. Elle kurulacak.
> Bu komutlar `root` gerektirir.

```bash
sudo apt update && sudo apt install -y curl ca-certificates gnupg lsb-release
```

```bash
sudo install -d /usr/share/postgresql-common/pgdg && sudo curl -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc --fail https://www.postgresql.org/media/keys/ACCC4CF8.asc
```

```bash
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
```

```bash
sudo apt update && sudo apt install -y postgresql-16
```

### Veritabanı ve roller

Üç rol oluşturulacak — RLS'in çalışması bu ayrıma bağlı (bkz. `README.md → Güvenlik mimarisi`).

Önce üç güçlü şifre üret ve **sakla**:

```bash
openssl rand -base64 24; openssl rand -base64 24; openssl rand -base64 24
```

```bash
sudo -u postgres psql -c "CREATE DATABASE advetics;"
```

Şimdi rolleri kur. `01-roles.sql` dosyası repodan gelecek, ama repo henüz klonlanmadı —
bu yüzden bu adımı **adım 5'ten sonra** tamamlayacağız. Şimdilik yalnızca servisi doğrula:

```bash
sudo systemctl enable --now postgresql && sudo -u postgres psql -c "SELECT version();"
```

### Redis

```bash
sudo apt install -y redis-server && sudo systemctl enable --now redis-server
```

### Dışarıya kapalı olduklarını doğrula

Her ikisi de yalnızca `127.0.0.1` dinlemeli:

```bash
sudo ss -tlnp | grep -E ':(5432|6379|3598|3599)'
```

`0.0.0.0:5432` görürsen `/etc/postgresql/16/main/postgresql.conf` içinde
`listen_addresses = 'localhost'` yap ve `sudo systemctl restart postgresql` çalıştır.

Güvenlik duvarı (yalnızca 80/443/SSH açık olmalı):

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80,443/tcp && sudo ufw --force enable && sudo ufw status
```

---

## 5. Repo'yu klonla

GitHub'da **deploy key** oluştur (şifre gerektirmeyen, salt-okunur erişim).

Sunucuda, `advetics` kullanıcısı olarak:

```bash
ssh-keygen -t ed25519 -C "advetics-vps-deploy" -f ~/.ssh/id_ed25519 -N ""
```

```bash
cat ~/.ssh/id_ed25519.pub
```

Çıkan anahtarı GitHub'da **repo → Settings → Deploy keys → Add deploy key** altına ekle.
İsim: `Hostinger VPS`. **"Allow write access" işaretleme.**

Bağlantıyı test et (`Hi <repo>! You've successfully authenticated` görmelisin):

```bash
ssh -T git@github.com
```

Klonla — dizin CloudPanel tarafından oluşturulduğu için içine klonluyoruz:

```bash
cd ~/htdocs/advetics.com && git clone git@github.com:KULLANICI_ADIN/advetics.git . && git checkout main
```

> `KULLANICI_ADIN/advetics` yerine kendi repo yolunu yaz.
> Dizin boş değilse önce içini temizle: `rm -rf ~/htdocs/advetics.com/{*,.*} 2>/dev/null`

### Veritabanı rollerini şimdi kur

```bash
sudo -u postgres psql -d advetics -f ~/htdocs/advetics.com/infra/postgres/init/01-roles.sql
```

Şifreleri üretim değerleriyle değiştir (adım 4'te ürettiklerini kullan):

```bash
sudo -u postgres psql -d advetics -c "ALTER ROLE advetics_migrator PASSWORD 'ÜRETTİĞİN_ŞİFRE_1'; ALTER ROLE advetics_app PASSWORD 'ÜRETTİĞİN_ŞİFRE_2'; ALTER ROLE advetics_worker PASSWORD 'ÜRETTİĞİN_ŞİFRE_3';"
```

Üç rolün de doğru yetkilerle oluştuğunu doğrula:

```bash
sudo -u postgres psql -d advetics -c "SELECT rolname, rolbypassrls, rolcreatedb FROM pg_roles WHERE rolname LIKE 'advetics%' ORDER BY 1;"
```

`advetics_app` satırında `rolbypassrls` **f (false)** olmalı. `t` ise RLS hiç çalışmaz.

---

## 6. Ortam değişkenleri

```bash
cd ~/htdocs/advetics.com && cp .env.example .env && chmod 600 .env
```

Sırları üret:

```bash
openssl rand -base64 48   # JWT_ACCESS_SECRET
```

```bash
openssl rand -base64 48   # JWT_REFRESH_SECRET
```

```bash
openssl rand -base64 32   # ENCRYPTION_KEY_V1  (tam 32 byte olmalı)
```

`nano .env` ile aşağıdaki değerleri yaz:

```bash
NODE_ENV=production

# Veritabanı — adım 5'teki şifreler
DATABASE_URL="postgresql://advetics_app:ŞİFRE_2@127.0.0.1:5432/advetics?schema=public&connection_limit=10"
DIRECT_DATABASE_URL="postgresql://advetics_migrator:ŞİFRE_1@127.0.0.1:5432/advetics?schema=public"
WORKER_DATABASE_URL="postgresql://advetics_worker:ŞİFRE_3@127.0.0.1:5432/advetics?schema=public&connection_limit=10"

REDIS_URL="redis://127.0.0.1:6379"

# API — ecosystem.config.js ile aynı port
API_PORT=3599
API_GLOBAL_PREFIX=api
CORS_ORIGINS="https://advetics.com,https://www.advetics.com"

# Auth
JWT_ACCESS_SECRET="<openssl çıktısı>"
JWT_REFRESH_SECRET="<openssl çıktısı>"
JWT_ACCESS_TTL="15m"
JWT_REFRESH_TTL="30d"
AUTH_COOKIE_DOMAIN="advetics.com"
AUTH_COOKIE_SECURE=true

# Şifreleme (Modül 2'de OAuth token'ları için)
ENCRYPTION_KEY_V1="<openssl çıktısı>"
ENCRYPTION_ACTIVE_KEY_VERSION=1

# Frontend
NEXT_PUBLIC_API_URL="https://advetics.com/api"
NEXT_PUBLIC_ROOT_DOMAIN="advetics.com"
INTERNAL_API_URL="http://127.0.0.1:3599/api"

# İlk owner hesabı — seed'den SONRA bu iki satırı sil
SEED_ORG_NAME="Advetics"
SEED_ADMIN_EMAIL="yusuf@profaj.com"
SEED_ADMIN_PASSWORD="<güçlü bir şifre, en az 12 karakter>"
```

> **Üç kritik nokta:**
> 1. `AUTH_COOKIE_SECURE=true` zorunlu — `false` bırakılırsa uygulama üretimde açılmaz
>    (`configuration.ts` bunu kontrol ediyor).
> 2. `NEXT_PUBLIC_*` değerleri **build anında** koda gömülür. Sonradan değiştirirsen
>    `pm2 restart` yetmez, yeniden `pnpm build` almak gerekir.
> 3. `INTERNAL_API_URL` Next.js sunucusunun API'ye Nginx'i atlayarak ulaşmasını sağlar.

---

## 7. İlk kurulum

```bash
cd ~/htdocs/advetics.com && pnpm install --frozen-lockfile
```

```bash
pnpm --filter @advetics/shared build && pnpm --filter @advetics/api exec prisma generate
```

Şemayı oluştur ve **RLS politikalarını uygula**:

```bash
pnpm --filter @advetics/api exec prisma migrate deploy
```

```bash
pnpm --filter @advetics/api db:rls
```

Owner hesabını ve demo müşterileri oluştur (**yalnızca bir kez**):

```bash
pnpm --filter @advetics/api db:seed
```

Seed bittikten sonra `.env` içinden `SEED_ADMIN_PASSWORD` satırını **sil**:

```bash
sed -i '/^SEED_ADMIN_PASSWORD=/d' .env
```

Derle:

```bash
pnpm --filter @advetics/api build && pnpm --filter @advetics/web build
```

---

## 8. pm2 ile başlat

```bash
cd ~/htdocs/advetics.com && mkdir -p logs && pm2 start ecosystem.config.js
```

```bash
pm2 status
```

İki süreç de `online` olmalı. Değilse:

```bash
pm2 logs --lines 50
```

Sunucu yeniden başladığında süreçlerin otomatik kalkması için:

```bash
pm2 save && pm2 startup
```

Son komut ekrana `sudo env PATH=... pm2 startup systemd -u advetics --hp /home/advetics`
benzeri bir satır yazar — **onu kopyalayıp root olarak çalıştır**.

Yerelde çalıştıklarını doğrula (`{"status":"ok",...}` dönmeli):

```bash
curl -s http://127.0.0.1:3599/api/health
```

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3598/login
```

---

## 9. Nginx vhost

CloudPanel arayüzünde: **Sites → advetics.com → Vhost**

> ⚠️ **Dosyanın tamamını benim verdiğimle DEĞİŞTİRME.** CloudPanel `{{ssl_certificate}}`,
> `{{root}}`, `{{nginx_access_log}}` gibi yer tutucuları kendisi yönetir; onları silersen
> SSL yenilemesi ve log rotasyonu bozulur. **Yalnızca `location` bloklarını** düzenle.

Mevcut `location / { ... proxy_pass http://127.0.0.1:3598; }` bloğunu bul ve
**onun ÜSTÜNE** API bloğunu ekle, ardından `location /` bloğunu aşağıdaki gibi güncelle:

```nginx
    # --- API → NestJS (3599) ----------------------------------------------
    # proxy_pass'te sondaki eğik çizgi YOK: /api öneki korunmalı,
    # çünkü NestJS globalPrefix olarak 'api' kullanıyor.
    location /api/ {
        proxy_pass http://127.0.0.1:3599;

        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";

        # Modül 6'da PDF üretimi ve Modül 3'te toplu senkronizasyon
        # uzun sürebilir; varsayılan 60s yetmez.
        proxy_connect_timeout 10s;
        proxy_send_timeout   300s;
        proxy_read_timeout   300s;

        # Logo ve reklam görseli yüklemeleri (Modül 1 marka, Modül 8 toplu yükleme)
        client_max_body_size 25m;

        proxy_buffering off;
    }

    # --- Panel → Next.js (3598) -------------------------------------------
    location / {
        proxy_pass http://127.0.0.1:3598;

        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        "upgrade";

        proxy_connect_timeout 10s;
        proxy_read_timeout    120s;
        client_max_body_size  25m;
    }

    # Next.js statik varlıkları — uzun süreli önbellek.
    # Dosya adlarında içerik hash'i var, bayatlama riski yok.
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3598;
        proxy_set_header Host $host;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
```

**Save** de. CloudPanel Nginx'i kendi yeniden yükler. Elle doğrulamak istersen:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### SSL

**Sites → advetics.com → SSL/TLS → New Let's Encrypt Certificate**

Domain listesine `advetics.com` ve `www.advetics.com` ekle, **Create and Install** de.
DNS'in yayılmış olması gerekir (adım 1).

---

## 10. GitHub Secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**

| Secret | Değer | Nasıl bulunur |
|---|---|---|
| `VPS_HOST` | VPS IP adresin | Hostinger paneli |
| `VPS_USER` | `advetics` | Adım 2'deki site kullanıcısı |
| `VPS_SSH_PORT` | `22` | Değiştirdiysen kendi portun |
| `VPS_SSH_KEY` | Özel anahtarın **tamamı** | Aşağıya bak |
| `VPS_APP_PATH` | `/home/advetics/htdocs/advetics.com` | Adım 5 |

### VPS_SSH_KEY nasıl üretilir

GitHub Actions'ın sunucuya bağlanması için **ayrı** bir anahtar çifti üret
(adım 5'teki deploy key GitHub'a erişim içindi, bu tersi yönde).

**Kendi bilgisayarında:**

```bash
ssh-keygen -t ed25519 -C "github-actions-advetics" -f ~/.ssh/advetics_deploy -N ""
```

Açık anahtarı sunucuya yetkilendir:

```bash
ssh-copy-id -i ~/.ssh/advetics_deploy.pub advetics@VPS_IP
```

Özel anahtarı kopyala ve `VPS_SSH_KEY` secret'ına yapıştır — `-----BEGIN` ve `-----END`
satırları **dahil**, sondaki boş satır dahil:

```bash
cat ~/.ssh/advetics_deploy
```

Bağlantıyı test et:

```bash
ssh -i ~/.ssh/advetics_deploy advetics@VPS_IP 'echo baglanti-ok'
```

### Production environment (opsiyonel ama önerilir)

Repo → **Settings → Environments → New environment → `production`**

**Required reviewers** ekleyerek her dağıtımın senin onayınla gitmesini sağlayabilirsin.
Bütçelere dokunan bir sistemde bu, yanlışlıkla `main`'e push etmenin maliyetini düşürür.

---

## 11. İlk otomatik dağıtım

```bash
git commit --allow-empty -m "chore: ilk dağıtımı tetikle" && git push origin main
```

GitHub → **Actions** sekmesinden izle. Akış:

1. **Doğrula** — runner'da tip kontrolü + derleme + RLS kapsama kontrolü
2. **Sunucuya dağıt** — SSH → `git reset --hard origin/main` → `scripts/deploy.sh`
3. **Dışarıdan doğrula** — `https://advetics.com/api/health` ve `/login`

`scripts/deploy.sh` sunucuda sırasıyla şunları yapar:
bağımlılıklar → derleme → `prisma migrate deploy` → **`db:rls`** → `pm2 startOrReload`
→ sağlık kontrolü.

---

## 12. Doğrulama listesi

```bash
curl -s https://advetics.com/api/health
```

- [ ] `{"status":"ok","database":{"status":"ok",...}}` dönüyor
- [ ] `https://advetics.com/login` açılıyor, sertifika geçerli
- [ ] Owner hesabıyla giriş yapılabiliyor
- [ ] Panelde **"Veritabanı satır güvenliği (RLS)"** kartı **yeşil**
- [ ] Kartta "korumasız tablo" uyarısı **yok**
- [ ] Müşteri değiştirici çalışıyor
- [ ] `pm2 status` → iki süreç de `online`
- [ ] Sunucuyu yeniden başlattıktan sonra süreçler kendiliğinden kalkıyor

RLS'i sunucuda doğrudan doğrula — `advetics_app` satırında `rolbypassrls` **f** olmalı,
politika sayısı **19** olmalı:

```bash
sudo -u postgres psql -d advetics -c "SELECT count(*) AS politika_sayisi FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'adv_%';"
```

Korumasız tablo kalmadığını doğrula — **0 satır** dönmeli:

```bash
sudo -u postgres psql -d advetics -c "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false AND c.relname NOT LIKE '_prisma%';"
```

---

## 13. Sorun giderme

| Belirti | Sebep | Çözüm |
|---|---|---|
| `502 Bad Gateway` | pm2 süreci ölü | `pm2 logs advetics-api --lines 50` |
| Panel açılıyor, API 404 | Nginx `/api/` bloğu eksik veya `proxy_pass` sonunda `/` var | Adım 9'u tekrar oku |
| `Can't reach database server` | Şifre yanlış veya PostgreSQL kapalı | `sudo systemctl status postgresql`, `.env` şifrelerini kontrol et |
| Giriş yapılıyor ama hemen çıkıyor | `AUTH_COOKIE_DOMAIN` yanlış veya `AUTH_COOKIE_SECURE=false` | `.env` → `advetics.com` / `true`, sonra `pm2 restart all` |
| Panelde RLS kartı **sarı** | `db:rls` çalışmamış | `pnpm --filter @advetics/api db:rls` |
| Frontend eski API adresine gidiyor | `NEXT_PUBLIC_API_URL` build'e gömülü | `.env`'i düzelt → `pnpm --filter @advetics/web build` → `pm2 restart advetics-web` |
| `ERR_PNPM_OUTDATED_LOCKFILE` | `package.json` değişti, lockfile commit edilmedi | Yerelde `pnpm install` → `pnpm-lock.yaml`'ı commit et |
| Actions `Permission denied (publickey)` | `VPS_SSH_KEY` eksik/bozuk | Anahtarın tamamını (BEGIN/END dahil) yeniden yapıştır |
| Actions "RLS politikası tanımlı değil" | Yeni tablo eklendi, politikası yazılmadı | `apps/api/prisma/sql/02_rls.sql` içine tablo + politika ekle |

Canlı log:

```bash
pm2 logs
```

Kaynak kullanımı:

```bash
pm2 monit
```

---

## 14. Geri alma (rollback)

`scripts/deploy.sh` başarısız olursa ekrana önceki commit'i ve geri alma komutunu yazar.
Elle geri almak için sunucuda:

```bash
cd ~/htdocs/advetics.com && git reset --hard $(cat .last-deployed-sha) && ./scripts/deploy.sh
```

> ⚠️ Bu yalnızca **kodu** geri alır. Uygulanmış veritabanı migration'ları geri alınmaz.
> Şema değişikliği içeren bir sürümden dönüyorsan, önceki kodun yeni şemayla çalışıp
> çalışmadığını kontrol et. Bu yüzden migration'ları **geriye uyumlu** yazmak önemlidir:
> kolon silmek yerine önce kullanımdan kaldır, bir sonraki sürümde sil.

---

## 15. Bakım

### Veritabanı yedeği

Günlük yedek için cron (root olarak `crontab -e`):

```bash
0 3 * * * sudo -u postgres pg_dump -Fc advetics > /var/backups/advetics-$(date +\%F).dump && find /var/backups -name 'advetics-*.dump' -mtime +14 -delete
```

> Yedekleri **sunucu dışına** da kopyala. Aynı diskteki yedek, disk arızasına karşı koruma sağlamaz.

### Log rotasyonu

pm2 logları sınırsız büyür:

```bash
pm2 install pm2-logrotate && pm2 set pm2-logrotate:max_size 50M && pm2 set pm2-logrotate:retain 14
```

### Sır rotasyonu

`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` değiştirilirse tüm oturumlar düşer — kullanıcılar
yeniden giriş yapar, veri kaybı olmaz.

`ENCRYPTION_KEY_V1` **asla silinmemelidir**. Rotasyon için yeni anahtarı `ENCRYPTION_KEY_V2`
olarak ekle ve `ENCRYPTION_ACTIVE_KEY_VERSION=2` yap; eski kayıtlar v1 ile açılmaya devam
eder (`crypto.service.ts` her şifreli değerin başına anahtar sürümünü yazar). Eski anahtarı
silmek, o anahtarla şifrelenmiş **tüm OAuth token'larını kalıcı olarak okunamaz kılar**.

---

## 16. Modül 3'e geçmeden önce

Sync worker'ları eklendiğinde bu rehbere iki şey eklenecek:

1. **Üçüncü bir pm2 süreci** — `advetics-worker` (BullMQ tüketicisi). API ile aynı kod
   tabanı, farklı entrypoint. `ecosystem.config.js`'e eklenecek.
2. **Redis kalıcılığı** — `appendonly yes` açılmalı, aksi halde sunucu yeniden başladığında
   kuyruktaki işler kaybolur.

Worker **cluster modunda çalıştırılmamalıdır**: zamanlanmış kurallar instance sayısı kadar
tetiklenir ve bütçeler birden fazla kez değiştirilir.
