# Dağıtım Rehberi — Hostinger VPS + CloudPanel

`advetics.com` üretim kurulumu. Üç script sayesinde manuel adım sayısı azdır;
sırayla uygula.

```
1. DNS                    ~2 dk    Hostinger paneli
2. CloudPanel'de site      ~2 dk   CloudPanel arayüzü
3. Sunucu hazırlığı        ~5 dk   scripts/vps-setup.sh      (root)
4. Repo klonla             ~3 dk   deploy key + git clone
5. Uygulama kurulumu       ~5 dk   scripts/site-setup.sh     (site kullanıcısı)
6. SSL                     ~2 dk   CloudPanel arayüzü
7. GitHub Actions          ~5 dk   5 secret
```

Teşhis her aşamada: `./scripts/preflight.sh advetics.com`

---

## 0. Mimari — ve neden vhost'a dokunmuyorsun

Bu monorepo **iki Node süreci** çalıştırıyor. Sen tek port verdin (`3598`);
onu panele ayırdık, API'yi `3599`'a aldık.

```
                 ┌──────────────────────────────────────────────┐
  İnternet       │              Hostinger VPS                   │
     │  :443     │  ┌────────────────────────────────────────┐  │
     └──────────►│  │  Nginx  (CloudPanel yönetiyor)         │  │
 advetics.com    │  └──────────────────┬─────────────────────┘  │
                 │                     │ hepsi :3598            │
                 │            ┌────────▼────────┐               │
                 │            │  advetics-web   │               │
                 │            │  Next.js :3598  │               │
                 │            └────────┬────────┘               │
                 │                     │ /api/* yönlendirmesi   │
                 │            ┌────────▼────────┐               │
                 │            │  advetics-api   │               │
                 │            │  NestJS :3599   │               │
                 │            └────────┬────────┘               │
                 │        ┌────────────┴────────────┐           │
                 │  ┌─────▼──────┐          ┌───────▼──────┐    │
                 │  │ PostgreSQL │          │    Redis     │    │
                 │  │   :5432    │          │    :6379     │    │
                 │  └────────────┘          └──────────────┘    │
                 └──────────────────────────────────────────────┘
```

**Kritik nokta:** Next.js, `/api/*` isteklerini kendi içinden NestJS'e yönlendiriyor
([`apps/web/next.config.ts`](../apps/web/next.config.ts) → `rewrites`). Yani CloudPanel'in
"Node.js Site" tipiyle otomatik ürettiği vhost — tek upstream, `127.0.0.1:3598` — **hiç
düzenlenmeden çalışır.**

> Test edildi: GET, POST, istek gövdesi ve `Set-Cookie` başlığı bu yönlendirmeden
> sorunsuz geçiyor. `Set-Cookie` özellikle önemli — oturum yönetimi buna bağlı.

Adım 7'deki Nginx bloğu **isteğe bağlı bir optimizasyondur**: API trafiğinden bir Node
atlaması siler. İkisi birden yapılandırılmış olması sorun değil — isteği hangi katman
önce görürse o işler.

| Süreç | Port | Dışarı açık |
|---|---|---|
| `advetics-web` (Next.js) | 3598 | Hayır — yalnızca Nginx erişir |
| `advetics-api` (NestJS) | 3599 | Hayır — yalnızca localhost |
| PostgreSQL | 5432 | **Hayır** |
| Redis | 6379 | **Hayır** (Modül 3'te kullanılacak) |

---

## 1. DNS

Hostinger DNS panelinde:

| Tip | İsim | Değer |
|---|---|---|
| A | `@` | VPS IP adresin |
| A | `www` | VPS IP adresin |

VPS IP'sini döndürmeli:

```bash
dig +short advetics.com
```

---

## 2. CloudPanel'de site oluştur

**Sites → Add Site → Create a Node.js Site**

| Alan | Değer |
|---|---|
| Domain Name | `advetics.com` |
| Node.js Version | listedeki en yüksek (adım 3 sistem geneli 22 kuracak) |
| App Port | `3598` |
| Site User | `advetics` |
| Site User Password | güçlü bir şifre üret, sakla |

Bu işlem `advetics` sistem kullanıcısını, `/home/advetics/htdocs/advetics.com` dizinini
ve `3598`'e yönlendiren bir Nginx vhost'u oluşturur.

---

## 3. Sunucu hazırlığı (root)

```bash
ssh root@VPS_IP
```

```bash
curl -fsSL https://raw.githubusercontent.com/KULLANICI/advetics/main/scripts/vps-setup.sh -o /tmp/vps-setup.sh && bash /tmp/vps-setup.sh --site-user advetics
```

> `KULLANICI/advetics` yerine kendi repo yolunu yaz. Repo private ise script'i
> yerelden kopyala: `scp scripts/vps-setup.sh root@VPS_IP:/tmp/`

[`scripts/vps-setup.sh`](../scripts/vps-setup.sh) şunları yapar:

- **Node.js 22** — NodeSource ile **sistem geneli** (`/usr/bin/node`)
- **pnpm 9** ve **pm2** — global
- **PostgreSQL 16** — PGDG deposundan, `listen_addresses = localhost`
- **Veritabanı + üç rol** — şifreler otomatik üretilir
- **Redis 7** — `appendonly yes`
- **UFW** — yalnızca 22/80/443 açık
- **pm2 systemd birimi** — sunucu yeniden başlayınca süreçler kalkar

Idempotenttir; tekrar çalıştırmak zarar vermez.

### Neden nvm değil de sistem geneli Node

nvm yalnızca **interaktif login shell**'lerde PATH'e girer. GitHub Actions SSH ile
**non-interactive** shell açar ve orada `node` bulunamaz — otomatik dağıtımın en sık
takıldığı yer tam olarak budur. `/usr/bin/node` her shell türünde çalışır.

### Script ne üretir

Veritabanı şifreleri iki yere yazılır:

- `/root/advetics-db-credentials.txt` — kalıcı kayıt, **silme**
- `/home/advetics/.advetics-db.env` — site kullanıcısına devir (mod 600)

Adım 5'teki script ikincisini otomatik okur; elle kopyalaman gerekmez.

Script bitiminde `advetics_app` rolünde **BYPASSRLS kapalı** olduğunu doğrular.
Açık olsaydı RLS hiç çalışmazdı — dağıtım orada dururdu.

---

## 4. Repo'yu klonla (site kullanıcısı)

```bash
su - advetics
```

GitHub'a salt-okunur erişim için deploy key üret:

```bash
ssh-keygen -t ed25519 -C "advetics-vps" -f ~/.ssh/id_ed25519 -N "" && cat ~/.ssh/id_ed25519.pub
```

Çıkan anahtarı GitHub'da **repo → Settings → Deploy keys → Add deploy key** altına ekle.
İsim: `Hostinger VPS`. **"Allow write access" İŞARETLEME.**

Bağlantıyı test et (`Hi ...! You've successfully authenticated` görmelisin):

```bash
ssh -T git@github.com
```

Klonla — CloudPanel dizini zaten oluşturduğu için içine klonluyoruz:

```bash
cd ~/htdocs/advetics.com && git clone git@github.com:KULLANICI/advetics.git . && git checkout main
```

> Dizin boş değil hatası alırsan: `rm -rf ~/htdocs/advetics.com/* ~/htdocs/advetics.com/.[!.]*`

---

## 5. Uygulama kurulumu (site kullanıcısı)

```bash
cd ~/htdocs/advetics.com && ./scripts/site-setup.sh --domain advetics.com
```

[`scripts/site-setup.sh`](../scripts/site-setup.sh) şunları yapar:

1. `.env` üretir — DB bilgilerini devir dosyasından alır, JWT sırlarını ve
   AES şifreleme anahtarını `openssl` ile üretir (mod 600)
2. `pnpm install --frozen-lockfile`
3. `prisma migrate deploy` → şema
4. **`db:rls`** → RLS politikaları ve kısıtlar
5. Politika sayısını ve korumasız tablo olmadığını **doğrular** (yoksa durur)
6. API ve paneli derler
7. Owner hesabını oluşturur, şifreyi **bir kez** ekrana yazar ve `.env`'den siler
8. pm2 süreçlerini başlatır, yerel sağlık kontrolü yapar

> **Ekrana yazılan giriş şifresini kaydet.** Bir daha gösterilmez; `.env`'den silinir
> ve veritabanında yalnızca argon2 hash'i kalır. Kaybedersen şifre sıfırlama akışını
> kullanman gerekir.

Mevcut bir `.env` varsa **üzerine yazmaz** — tekrar çalıştırmak güvenlidir.

### 5b. Redis anahtarları (Modül 3 — senkronizasyon kuyruğu)

Modül 3'ün worker'ı Redis olmadan başlamıyor. Anahtarları elle yazmak yerine:

```bash
cd ~/htdocs/advetics.com && ./scripts/add-redis-env.sh
```

Script `REDIS_URL`, `REDIS_DB`, `REDIS_KEY_PREFIX` ve `QUOTA_CALLS_PER_MINUTE`
değerlerini `.env`'e ekler. Tekrar çalıştırmak güvenlidir: mevcut anahtarları
çoğaltmıyor, yanlışsa düzeltiyor.

**Script'in asıl işi anahtar yazmak değil, yazmadan önce kontrol etmek.**
Redis bu sunucuda 11+ siteyle paylaşılıyor. Hedef veritabanı (varsayılan 3)
boş değilse ve içindeki anahtarlar `advetics` önekli DEĞİLSE script duruyor —
başka bir uygulamanın kullandığı bir db'ye BullMQ kurmak o uygulamanın
verisini silebilir. O durumda başka bir numara ver:

```bash
REDIS_DB=4 ./scripts/add-redis-env.sh
```

Redis şifre istiyorsa şifreyi komut geçmişine yazmadan geç:

```bash
read -rs REDIS_PASSWORD && export REDIS_PASSWORD && ./scripts/add-redis-env.sh
```

Script Redis'i yalnızca OKUR. Yapılandırmasına dokunmaz, servisi yeniden
başlatmaz, başka db'lere yazmaz.

`.env` her koşuda `.env.bak-<zaman>` olarak yedekleniyor (son 5 tutulur, izin 600).

**Sıra önemli:** bu script'i `deploy.sh`'den ÖNCE çalıştır. Worker süreci
dağıtımla birlikte geliyor ve ilk açılışında Redis'i bulamazsa ölür.

---

## 5c. YouTube Data API anahtarı (Advetics 1.0 — otomatik boost)

**Bu adım YALNIZCA YouTube otomatik boost kullanılacaksa gerekiyor.** Anahtar
yoksa uygulama normal açılıyor; yalnızca YouTube kartları oluşmuyor ve panel
bunu söylüyor.

### Ne işe yarıyor — ve neden OAuth değil

YouTube bildirimi geldiğinde gövdedeki video kimliği **doğrulanmadan** kart
açılamıyor. Sebebi bir güvenlik incelemesinde ölçüldü: bildirim gövdesindeki
`videoId` doğrulanmazsa, bildirim adresini ele geçiren biri müşterinin
bütçesiyle **başkasının videosunu** tanıtabiliyor — uygunsuz içerik seçilirse
politika ihlali ajansın reklam hesabına işliyor.

Bu yüzden gövde yalnızca **tetikleyici**; başlık, küçük resim ve kanal bilgisi
YouTube Data API'den okunuyor.

**API ANAHTARI YETİYOR, OAUTH GEREKMİYOR.** `videos.list` herkese açık veri
okuyor ve kullanıcı adına işlem yapmıyor. Bu önemli: yeni bir OAuth kapsamı
eklemek canlı Google Ads bağlantısının **yeniden yetkilendirilmesini**
gerektirirdi ve bu projede yeniden yetkilendirme daha önce bağlantıları
koparmıştı.

### Adımlar

1. **Google Cloud Console** → mevcut projeyi seç. Google Ads OAuth istemcisinin
   bulunduğu projeyi kullanmak en temizi; zorunlu değil ama faturalandırma ve
   kota tek yerde durur.

2. **API'yi etkinleştir**: "APIs & Services" → "Enable APIs and services" →
   **YouTube Data API v3** → *Enable*.
   Etkinleştirmeden anahtar üretilse bile çağrılar `403` ile döner.

3. **Anahtarı üret**: "APIs & Services" → "Credentials" → "Create credentials"
   → **API key**. Üretilen değeri kopyala; sonra tekrar gösterilmiyor.

4. **ANAHTARI KISITLA — bu adım atlanmamalı.** Kısıtlanmamış bir anahtar,
   eline geçen herkesin senin kotanı harcamasına izin verir.
   - *Application restrictions* → **IP addresses** → sunucunun çıkış IP'sini
     ekle. Çağrı sunucudan gidiyor, tarayıcıdan değil; bu kısıt anahtarı
     sızsa bile büyük ölçüde işe yaramaz kılıyor.
   - *API restrictions* → **Restrict key** → yalnızca **YouTube Data API v3**.

5. **Depo kökündeki `.env` dosyasına ekle** (API, panel ve script'ler hepsi
   oradan besleniyor):

   ```
   YOUTUBE_API_KEY=AIza...
   ```

6. **Dağıt.** `su - advetics` → `cd ~/htdocs/advetics.com` → `git pull` →
   `./scripts/deploy.sh`

### Kota

Varsayılan günlük kota **10.000 birim**; `videos.list` çağrısı **1 birim**.
Bildirim başına bir çağrı yapılıyor, yani günde 10.000 yeni video yüklenmedikçe
kota engel değil. Kota dolarsa kart oluşmaz ve sebebi kaydedilir — sessizce
atlanmaz.

### Anahtar `.env` dışına ÇIKMAMALI

Depoya yazılmaz, sohbete yapıştırılmaz, log'a düşmez. Sızdığından
şüphelenilirse Google Cloud Console'dan silinip yenisi üretilir; eski anahtar
anında geçersiz olur.

---

## 6. SSL

**Sites → advetics.com → SSL/TLS → New Let's Encrypt Certificate**

Domain listesine `advetics.com` ve `www.advetics.com` ekle → **Create and Install**.
DNS'in yayılmış olması gerekir (adım 1).

Şimdi çalışıyor olmalı:

```bash
curl -s https://advetics.com/api/health
```

```bash
./scripts/preflight.sh advetics.com
```

---

## 7. Nginx optimizasyonu (isteğe bağlı)

Adım 0'da anlatıldığı gibi sistem bu adım olmadan çalışır. Bu blok yalnızca API
trafiğinden bir Node atlaması siler — yükseldiğinde fark eder, MVP'de zorunlu değildir.

**Sites → advetics.com → Vhost**

> ⚠️ Dosyanın tamamını değiştirme. CloudPanel `{{ssl_certificate}}`, `{{root}}`,
> `{{nginx_access_log}}` gibi yer tutucuları kendisi yönetir; silersen SSL yenilemesi
> ve log rotasyonu bozulur. **Yalnızca `location` blokları ekle.**

Mevcut `location / { ... }` bloğunun **ÜSTÜNE**:

```nginx
    # API → NestJS. proxy_pass sonunda eğik çizgi YOK:
    # /api öneki korunmalı, NestJS globalPrefix olarak 'api' kullanıyor.
    location /api/ {
        proxy_pass http://127.0.0.1:3599;

        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Modül 6 PDF üretimi ve Modül 3 toplu senkronizasyon uzun sürer
        proxy_connect_timeout  10s;
        proxy_read_timeout    300s;
        proxy_send_timeout    300s;

        client_max_body_size 25m;
        proxy_buffering off;
    }
```

**Save** de — CloudPanel Nginx'i kendisi yeniden yükler. Doğrula:

```bash
sudo nginx -t && curl -s https://advetics.com/api/health
```

Sorun çıkarsa bloğu sil, kaydet — Next.js yönlendirmesi devralır, sistem çalışmaya
devam eder.

---

## 8. GitHub Actions

Repo → **Settings → Secrets and variables → Actions**

| Secret | Değer |
|---|---|
| `VPS_HOST` | VPS IP adresin |
| `VPS_USER` | `advetics` |
| `VPS_SSH_PORT` | `22` |
| `VPS_SSH_KEY` | Özel anahtarın tamamı (aşağıya bak) |
| `VPS_APP_PATH` | `/home/advetics/htdocs/advetics.com` |

### VPS_SSH_KEY

Adım 4'teki deploy key **GitHub'a erişim** içindi; bu **tersi yönde** — Actions'ın
sunucuya bağlanması için. Ayrı bir çift üret.

**Kendi bilgisayarında:**

```bash
ssh-keygen -t ed25519 -C "github-actions-advetics" -f ~/.ssh/advetics_deploy -N ""
```

```bash
ssh-copy-id -i ~/.ssh/advetics_deploy.pub advetics@VPS_IP
```

```bash
ssh -i ~/.ssh/advetics_deploy advetics@VPS_IP 'echo baglanti-ok'
```

Özel anahtarı `VPS_SSH_KEY` secret'ına yapıştır — `-----BEGIN` / `-----END` satırları
ve sondaki boş satır **dahil**:

```bash
cat ~/.ssh/advetics_deploy
```

### İlk otomatik dağıtım

```bash
git commit --allow-empty -m "chore: dağıtımı tetikle" && git push origin main
```

**Actions** sekmesinden izle. Akış:

1. **Doğrula** (runner) — tip kontrolü, derleme, **RLS kapsama kontrolü**
   (Prisma şemasındaki her tablo `02_rls.sql` içinde tanımlı mı?)
2. **Dağıt** (SSH) — `git reset --hard origin/main` → [`scripts/deploy.sh`](../scripts/deploy.sh)
3. **Doğrula** (dışarıdan) — `/api/health` + `/login`

### Onaylı dağıtım (önerilir)

Repo → **Settings → Environments → New environment → `production`** →
**Required reviewers** ekle. Bütçelere dokunan bir sistemde bu, yanlışlıkla `main`'e
push etmenin maliyetini düşürür.

---

## 9. Doğrulama

```bash
cd ~/htdocs/advetics.com && ./scripts/preflight.sh advetics.com
```

[`scripts/preflight.sh`](../scripts/preflight.sh) hiçbir şeyi değiştirmez; kontrol eder
ve her sorun için düzeltme komutunu yazar:

- Araçlar ve sürümler · **nvm tuzağı** (SSH dağıtımında `node` bulunamaması)
- `.env` — zorunlu anahtarlar, izinler, `ENCRYPTION_KEY_V1` gerçekten 32 byte mı,
  `SEED_ADMIN_PASSWORD` silinmiş mi
- Veritabanı — bağlantı, **`advetics_app` BYPASSRLS kapalı mı**, politika sayısı,
  korumasız tablo, tablo/organizasyon sayısı
- Derleme çıktıları — **`NEXT_PUBLIC_API_URL` gerçekten build'e gömülmüş mü**
- pm2 süreçleri ve systemd birimi
- Yerel portlar, Next.js yedek yönlendirmesi, portların dışarı kapalı olması
- Dışarıdan HTTPS erişimi

Elle son kontrol:

- [ ] `https://advetics.com/login` açılıyor, sertifika geçerli
- [ ] Owner hesabıyla giriş yapılabiliyor
- [ ] Panelde **"Veritabanı satır güvenliği (RLS)"** kartı **yeşil**
- [ ] Kartta "korumasız tablo" uyarısı **yok**
- [ ] Müşteri değiştirici çalışıyor
- [ ] `sudo reboot` sonrası her şey kendiliğinden kalkıyor

---

## 10. Sorun giderme

Önce `./scripts/preflight.sh advetics.com` çalıştır — aşağıdakilerin çoğunu kendi yakalar.

| Belirti | Sebep | Çözüm |
|---|---|---|
| `502 Bad Gateway` | pm2 süreci ölü | `pm2 logs advetics-web --lines 50` |
| Panel açılıyor, `/api/health` 404 | Next.js yönlendirmesi yok **ve** Nginx bloğu yok | `.env`'de `INTERNAL_API_URL` var mı → `pnpm --filter @advetics/web build` |
| Actions: `node: command not found` | nvm ile kurulmuş Node | root: `bash scripts/vps-setup.sh --site-user advetics` |
| `Can't reach database server` | PostgreSQL kapalı / şifre yanlış | `systemctl status postgresql` · `/root/advetics-db-credentials.txt` |
| Giriş yapılıyor, hemen çıkıyor | `AUTH_COOKIE_DOMAIN` veya `AUTH_COOKIE_SECURE` yanlış | `.env` → `advetics.com` / `true` → `pm2 restart all` |
| RLS kartı **sarı** | `db:rls` çalışmamış | `pnpm --filter @advetics/api db:rls` |
| Panel eski API adresine gidiyor | `NEXT_PUBLIC_API_URL` build'e gömülü | `.env` düzelt → `pnpm --filter @advetics/web build` → `pm2 restart advetics-web` |
| `ERR_PNPM_OUTDATED_LOCKFILE` | `package.json` değişti, lockfile commit edilmedi | Yerelde `pnpm install` → `pnpm-lock.yaml` commit |
| Actions `Permission denied (publickey)` | `VPS_SSH_KEY` eksik/bozuk | Anahtarı BEGIN/END dahil yeniden yapıştır |
| Actions "RLS politikası tanımlı değil" | Yeni tablo eklendi, politikası yazılmadı | `apps/api/prisma/sql/02_rls.sql`'e tablo + politika ekle |

```bash
pm2 logs
```

```bash
pm2 monit
```

---

## 11. Geri alma

`scripts/deploy.sh` başarısız olursa ekrana önceki commit'i ve komutu yazar. Elle:

```bash
cd ~/htdocs/advetics.com && git reset --hard $(cat .last-deployed-sha) && ./scripts/deploy.sh
```

> ⚠️ Bu yalnızca **kodu** geri alır; uygulanmış migration'lar geri alınmaz. Bu yüzden
> migration'ları **geriye uyumlu** yaz: kolon silmek yerine önce kullanımdan kaldır,
> bir sonraki sürümde sil.

---

## 12. Bakım

### Veritabanı yedeği

Root olarak `crontab -e`:

```bash
0 3 * * * sudo -u postgres pg_dump -Fc advetics > /var/backups/advetics-$(date +\%F).dump && find /var/backups -name 'advetics-*.dump' -mtime +14 -delete
```

> Yedekleri **sunucu dışına** da kopyala. Aynı diskteki yedek disk arızasına karşı
> koruma sağlamaz.

### Log rotasyonu

pm2 logları sınırsız büyür:

```bash
pm2 install pm2-logrotate && pm2 set pm2-logrotate:max_size 50M && pm2 set pm2-logrotate:retain 14
```

### Sır rotasyonu

`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` değişirse tüm oturumlar düşer — kullanıcılar
yeniden giriş yapar, veri kaybı olmaz.

`ENCRYPTION_KEY_V1` **asla silinmemelidir.** Rotasyon için `ENCRYPTION_KEY_V2` ekle ve
`ENCRYPTION_ACTIVE_KEY_VERSION=2` yap; eski kayıtlar V1 ile açılmaya devam eder
([`crypto.service.ts`](../apps/api/src/crypto/crypto.service.ts) her şifreli değerin
başına anahtar sürümünü yazar). Eski anahtarı silmek, o anahtarla şifrelenmiş **tüm
OAuth token'larını kalıcı olarak okunamaz kılar**.

---

## 13. Modül 3'e geçmeden önce

Sync worker'ları eklendiğinde:

1. **Üçüncü pm2 süreci** — `advetics-worker` (BullMQ tüketicisi), aynı kod tabanı,
   farklı entrypoint. `ecosystem.config.js`'e eklenecek.
2. Worker **cluster modunda çalıştırılmamalı** — zamanlanmış kurallar instance sayısı
   kadar tetiklenir ve bütçeler birden fazla kez değiştirilir. (Mevcut iki süreç de bu
   yüzden `fork` modunda.)

Redis `appendonly` ayarı `vps-setup.sh` tarafından zaten açıldı.
