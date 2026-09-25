#!/usr/bin/env bash
#
# İkinci geliştiricinin YEREL makinesini sıfırdan kurar. Sunucuya hiçbir şey
# yazmaz; sunucuyla tek teması, istenirse yapılan SALT OKUNUR bir bağlantı
# denemesi.
#
# Kullanım (depo kökünde):
#   ./scripts/ortak-kurulum.sh
#   ADVETICS_SUNUCU=<ip-ya-da-ad> ./scripts/ortak-kurulum.sh     # SSH denemesiyle
#   ./scripts/ortak-kurulum.sh --testler                          # + tam test paketi
#
# Tekrar çalıştırmak güvenli: var olan .env'in, SSH anahtarının ve veritabanının
# ÜZERİNE YAZMAZ. Her adım ya "zaten var" der ya da yapar.
#
# Sunucu adresi bu dosyada BİLEREK yok: depo herkese açık (CLAUDE.md §1).
# Adres parola yöneticisinde; ortam değişkeniyle verilir.
#
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

TESTLER=0
for arg in "$@"; do
  case "$arg" in
    --testler) TESTLER=1 ;;
    *) printf 'Bilinmeyen seçenek: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

log()  { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[0;32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[0;33m!\033[0m %s\n' "$*"; UYARILAR+=("$*"); }
die()  { printf '\n\033[0;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
UYARILAR=()

# Bu script bir GELİŞTİRİCİ makinesi için. Üretim sunucusunda root ile
# koşturulursa docker/pnpm adımları paylaşımlı makinede sistem geneli iz
# bırakır; site kullanıcısıyla koşturulsa bile orada yeri yok (sunucu
# kurulumu site-setup.sh'ın işi).
[[ $EUID -eq 0 ]] && die "root ile çalıştırma. Bu script yerel geliştirici makinesi için."
if [[ -d /home/advetics/htdocs ]]; then
  die "Bu makine üretim sunucusu gibi görünüyor. Burada site-setup.sh / deploy.sh kullanılır."
fi

YUSUF_REPO="https://github.com/yusufProfaj/advetics.git"
PROFAJAI_REPO="https://github.com/Profajai/advetics.git"

# -----------------------------------------------------------------------------
log "1/8 Araçlar"
# -----------------------------------------------------------------------------
# Eksik araç KURULMUYOR, adı ve kurulum komutu söylenip duruluyor: Node ve
# Docker'ın hangi yoldan kurulacağı (brew, nvm, resmi paket) geliştiricinin
# kararı ve yanlış tahmin iki Node'lu bir makine bırakır.
eksik=0
for arac in git openssl docker; do
  if command -v "$arac" >/dev/null 2>&1; then ok "$arac"; else
    printf '  \033[0;31m✗\033[0m %s yok\n' "$arac"; eksik=1; fi
done
if command -v node >/dev/null 2>&1; then
  node_ana="$(node -p 'process.versions.node.split(".")[0]')"
  if (( node_ana >= 22 )); then ok "node $(node -v)"; else
    printf '  \033[0;31m✗\033[0m node %s — en az 22 gerekiyor\n' "$(node -v)"; eksik=1; fi
else
  printf '  \033[0;31m✗\033[0m node yok\n'; eksik=1
fi
if (( eksik )); then
  cat >&2 <<'EOF'

  Eksikleri kur ve script'i tekrar çalıştır. macOS için:
      brew install node@22 git openssl
      Docker Desktop: https://www.docker.com/products/docker-desktop/
EOF
  exit 1
fi
docker info >/dev/null 2>&1 || die "Docker kurulu ama çalışmıyor. Docker Desktop'ı aç, tekrar dene."
ok "docker çalışıyor"

# pnpm sürümü package.json'daki `packageManager` alanından geliyor (9.12.0).
# corepack onu okuyup TAM o sürümü kullanıyor; `npm i -g pnpm` ise en yeniyi
# kurar ve lockfile biçimi ayrışır.
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable pnpm || die "corepack çalışmadı. Elle: corepack enable pnpm"
fi
ok "pnpm $(pnpm -v)"

# -----------------------------------------------------------------------------
log "2/8 Git ayarları"
# -----------------------------------------------------------------------------
# HTTP/2 ile push 'Broken pipe / Failed sending HTTP2 data' ile kopuyordu
# (CLAUDE.md §3 Push). Ayar .git/config'e yazılıyor, yani worktree'ler de alıyor.
git config http.version HTTP/1.1
ok "http.version = HTTP/1.1"

# origin İKİ push adresi taşımalı: tek `git push origin HEAD:main` iki depoya
# birden gidiyor. Yalnızca biri ayarlıysa depolar SESSİZCE ayrışıyor ve bunu
# ancak aylar sonra fark ediyorsun. Önce siliniyor ki tekrar koşunca üçüncü,
# dördüncü kopya birikmesin.
git remote set-url origin "$YUSUF_REPO"
git config --unset-all remote.origin.pushurl 2>/dev/null || true
git remote set-url --add --push origin "$YUSUF_REPO"
git remote set-url --add --push origin "$PROFAJAI_REPO"
if git remote get-url profajai >/dev/null 2>&1; then
  git remote set-url profajai "$PROFAJAI_REPO"
else
  git remote add profajai "$PROFAJAI_REPO"
fi
ok "origin → iki push adresi (yusufProfaj + Profajai)"

# Erişim denemesi YAZMADAN yapılıyor. `ls-remote` okuma iznini sınıyor; yazma
# izni ancak ilk push'ta görülür. Profajai özel: davet kabul edilmediyse
# burada 404/"not found" döner — bu "depo yok" değil "davetin bekliyor" demek.
for depo in "$YUSUF_REPO" "$PROFAJAI_REPO"; do
  if git ls-remote --heads "$depo" main >/dev/null 2>&1; then ok "erişim var: $depo"
  else warn "erişim YOK: $depo — GitHub davetini kabul ettin mi? (github.com/notifications)"; fi
done

if [[ -z "$(git config user.name || true)" || -z "$(git config user.email || true)" ]]; then
  warn "git kimliği eksik. Çalıştır: git config --global user.name \"Ad Soyad\" && git config --global user.email \"sen@ornek.com\""
else
  ok "git kimliği: $(git config user.name) <$(git config user.email)>"
fi

# -----------------------------------------------------------------------------
log "3/8 .env"
# -----------------------------------------------------------------------------
# TEK .env var ve DEPO KÖKÜNDE (CLAUDE.md §2). Var olanın üzerine yazılmıyor:
# içinde elle girilmiş platform anahtarları olabilir.
SEED_PAROLA_YENI=""
if [[ -f .env ]]; then
  ok ".env zaten var — dokunulmadı"
else
  cp .env.example .env
  chmod 600 .env
  # Yerel sırlar HER GELİŞTİRİCİDE AYRI üretiliyor. Yusuf'un yerel .env'ini
  # kopyalamak gerekmiyor ve kopyalanmamalı: şifreleme anahtarı aynı olursa
  # bir makinenin şifreli token'ı diğerinde çözülür sanılır, oysa veritabanları
  # zaten ayrı.
  JWT_A="$(openssl rand -base64 48 | tr -d '\n')"
  JWT_R="$(openssl rand -base64 48 | tr -d '\n')"
  ENC="$(openssl rand -base64 32 | tr -d '\n')"   # tam 32 bayt
  SEED_PAROLA_YENI="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)"
  SEED_EPOSTA="${ADVETICS_EPOSTA:-$(git config user.email || true)}"
  [[ -n "$SEED_EPOSTA" ]] || SEED_EPOSTA="gelistirici@localhost.test"
  # Değerler perl'e ORTAM DEĞİŞKENİYLE veriliyor: base64 '/' ve '+' taşıyor ve
  # sed ifadesinin içine gömülünce ayırıcıyla çakışıp dosyayı bozuyor.
  JWT_A="$JWT_A" JWT_R="$JWT_R" ENC="$ENC" SP="$SEED_PAROLA_YENI" SE="$SEED_EPOSTA" perl -pi -e '
    s/^JWT_ACCESS_SECRET=.*/JWT_ACCESS_SECRET="$ENV{JWT_A}"/;
    s/^JWT_REFRESH_SECRET=.*/JWT_REFRESH_SECRET="$ENV{JWT_R}"/;
    s/^ENCRYPTION_KEY_V1=.*/ENCRYPTION_KEY_V1="$ENV{ENC}"/;
    s/^SEED_ADMIN_PASSWORD=.*/SEED_ADMIN_PASSWORD="$ENV{SP}"/;
    s/^SEED_ADMIN_EMAIL=.*/SEED_ADMIN_EMAIL="$ENV{SE}"/;
  ' .env
  ok ".env üretildi (JWT + şifreleme anahtarı yeni, giriş e-postası: $SEED_EPOSTA)"
  warn "Platform anahtarları (META_*, GOOGLE_*, LINKEDIN_*, SMTP_*) BOŞ. Gerekirse Yusuf parola yöneticisinden paylaşır."
fi
# Prisma CLI kök .env'i kendiliğinden YÜKLEMİYOR (DEPLOYMENT.md §10c).
set -a; # shellcheck disable=SC1091
. ./.env; set +a

# -----------------------------------------------------------------------------
log "4/8 PostgreSQL + Redis (Docker)"
# -----------------------------------------------------------------------------
docker compose up -d
for i in $(seq 1 30); do
  durum="$(docker inspect -f '{{.State.Health.Status}}' advetics-postgres 2>/dev/null || echo yok)"
  [[ "$durum" == healthy ]] && break
  sleep 2
  (( i == 30 )) && die "PostgreSQL 60 sn içinde hazır olmadı: docker logs advetics-postgres"
done
ok "postgres :5433 · redis :6380"

# -----------------------------------------------------------------------------
log "5/8 Bağımlılıklar ve paylaşılan paket"
# -----------------------------------------------------------------------------
pnpm install --frozen-lockfile
# Çıktı YUTULMUYOR. shared'ın derleme hatası yutulduğunda apps/* bayat dist'i
# okuyup yeşil geçiyor ve hata deploy'un ortasında patlıyor (CLAUDE.md §3).
pnpm --filter @advetics/shared build
pnpm --filter @advetics/api exec prisma generate
ok "bağımlılıklar + shared + prisma istemcisi"

# -----------------------------------------------------------------------------
log "6/8 Veritabanı: şema → kısıtlar/RLS → seed"
# -----------------------------------------------------------------------------
# `db:migrate` = `prisma migrate dev` ve şema farkı görürse YENİ migration
# üretmeye kalkıyor; kurulum script'inin işi değil. `db:deploy` yalnızca
# depodaki migration'ları uyguluyor.
pnpm --filter @advetics/api db:deploy
# RLS Prisma migration'ının parçası DEĞİL. Bu adım atlanırsa API açılır ama
# tablolar korumasız kalır.
pnpm --filter @advetics/api db:rls
if [[ -n "$SEED_PAROLA_YENI" ]]; then
  pnpm --filter @advetics/api db:seed
  ok "seed tamam"
else
  ok "seed atlandı (.env önceden vardı — veritabanı muhtemelen dolu)"
fi

# -----------------------------------------------------------------------------
log "7/8 Tip kontrolü"
# -----------------------------------------------------------------------------
pnpm typecheck
ok "typecheck temiz"
if (( TESTLER )); then
  # API paketi PGlite kuruyor ve ~7 dk sürüyor. TEK BAŞINA koşmalı: paralel
  # yük altında vitest işçisi 'Timeout calling onTaskUpdate' ile SAHTE exit=1
  # veriyor, bütün testler geçmiş olsa bile.
  pnpm --filter @advetics/web test
  pnpm --filter @advetics/api test
  ok "testler geçti"
fi

# -----------------------------------------------------------------------------
log "8/8 Sunucu erişimi (SSH anahtarı)"
# -----------------------------------------------------------------------------
# Deploy sunucuda `advetics` kullanıcısıyla yapılıyor ve ROOT'A HİÇ GİRİLMİYOR.
# Bu yüzden ortağın root parolasına ihtiyacı yok: kendi anahtarı advetics
# kullanıcısının authorized_keys'ine eklenince doğrudan o kullanıcıya düşer.
ANAHTAR="$HOME/.ssh/advetics_ed25519"
if [[ -f "$ANAHTAR" ]]; then
  ok "anahtar zaten var: $ANAHTAR"
else
  mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
  ssh-keygen -t ed25519 -C "advetics-$(whoami)@$(hostname -s)" -f "$ANAHTAR" -N "" >/dev/null
  ok "anahtar üretildi: $ANAHTAR"
fi

if [[ -n "${ADVETICS_SUNUCU:-}" ]]; then
  # ~/.ssh/config'e takma ad: deploy komutu her yerde `ssh advetics-prod`
  # olsun, adres komut geçmişine ve sohbetlere yazılmasın.
  if ! grep -q '^Host advetics-prod$' "$HOME/.ssh/config" 2>/dev/null; then
    {
      printf '\nHost advetics-prod\n  HostName %s\n  User advetics\n  IdentityFile %s\n  IdentitiesOnly yes\n' \
        "$ADVETICS_SUNUCU" "$ANAHTAR"
    } >> "$HOME/.ssh/config"
    chmod 600 "$HOME/.ssh/config"
    ok "~/.ssh/config → Host advetics-prod"
  fi
  # SALT OKUNUR deneme: yalnızca sunucudaki commit'i okuyor.
  if ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new advetics-prod \
       'cd ~/htdocs/advetics.com && printf "sunucudaki commit: " && git log -1 --oneline' 2>/dev/null; then
    ok "sunucuya advetics kullanıcısıyla erişim var"
  else
    warn "sunucuya bağlanılamadı — açık anahtarın henüz eklenmemiş olabilir (aşağıda)"
  fi
else
  warn "ADVETICS_SUNUCU verilmedi, sunucu denemesi atlandı."
fi

# -----------------------------------------------------------------------------
printf '\n\033[1;32m━━━ Kurulum bitti ━━━\033[0m\n'
cat <<EOF

  Çalıştır:   pnpm dev
  Panel:      http://localhost:3000
  API:        http://localhost:4000/api/health
EOF
if [[ -n "$SEED_PAROLA_YENI" ]]; then
  printf '\n  Yerel giriş: %s\n  Parola:      %s\n  (Parola .env içinde de duruyor; YALNIZCA yerel veritabanı için.)\n' \
    "$SEED_EPOSTA" "$SEED_PAROLA_YENI"
fi
printf '\n  Yusuf'"'"'a gönder (açık anahtar, gizli DEĞİL):\n\n'
cat "$ANAHTAR.pub"
if (( ${#UYARILAR[@]} )); then
  printf '\n\033[0;33mBakılması gerekenler:\033[0m\n'
  for u in "${UYARILAR[@]}"; do printf '  · %s\n' "$u"; done
fi
echo
