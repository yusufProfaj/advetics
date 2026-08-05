#!/usr/bin/env bash
#
# Advetics — site kullanıcısı kurulumu (bir kerelik).
#
# vps-setup.sh çalıştırıldıktan ve repo klonlandıktan SONRA, SİTE KULLANICISI
# olarak çalıştırılır. .env dosyasını üretir, şemayı kurar, RLS'i uygular,
# derler ve pm2 süreçlerini başlatır.
#
#   su - advetics
#   cd ~/htdocs/advetics.com
#   ./scripts/site-setup.sh --domain advetics.com
#
# Idempotenttir. Mevcut bir .env varsa ÜZERİNE YAZMAZ.
#
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

DOMAIN=""
WEB_PORT=3598
API_PORT=3599
DO_SEED=1
HANDOFF="$HOME/.advetics-db.env"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)   DOMAIN="${2:-}"; shift 2 ;;
    --web-port) WEB_PORT="${2:-}"; shift 2 ;;
    --api-port) API_PORT="${2:-}"; shift 2 ;;
    --no-seed)  DO_SEED=0; shift ;;
    -h|--help)  sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Bilinmeyen argüman: $1" >&2; exit 1 ;;
  esac
done

log()  { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[0;32m✓\033[0m %s\n' "$*"; }
skip() { printf '  \033[0;90m·\033[0m %s\n' "$*"; }
warn() { printf '  \033[0;33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[0;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -ne 0 ]] || die "Bu script root ile ÇALIŞTIRILMAMALI. Site kullanıcısına geç:  su - <site-user>"
[[ -n "$DOMAIN" ]] || die "--domain zorunlu (örn: --domain advetics.com)"

# -----------------------------------------------------------------------------
log "Ön kontroller"
# -----------------------------------------------------------------------------
for c in node pnpm pm2 git; do
  command -v "$c" >/dev/null || die "$c bulunamadı. Önce root olarak scripts/vps-setup.sh çalıştır."
done
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 22 ]] || die "Node.js 22+ gerekli, kurulu: $(node -v)"
ok "node $(node -v) · pnpm $(pnpm -v) · pm2 $(pm2 -v)"

[[ -f package.json && -d apps/api ]] || die "Repo kökünde değilsin. cd ~/htdocs/${DOMAIN} yap."
ok "repo: $APP_DIR ($(git rev-parse --short HEAD 2>/dev/null || echo 'git yok'))"

# -----------------------------------------------------------------------------
log "Ortam değişkenleri"
# -----------------------------------------------------------------------------
if [[ -f .env ]]; then
  skip ".env zaten var — dokunulmuyor"
  warn "Değer değiştirmen gerekiyorsa elle düzenle: nano .env"
else
  [[ -f "$HANDOFF" ]] || die "$HANDOFF bulunamadı. Önce root olarak scripts/vps-setup.sh çalıştır."
  # shellcheck disable=SC1090
  . "$HANDOFF"

  JWT_ACCESS="$(openssl rand -base64 48 | tr -d '\n')"
  JWT_REFRESH="$(openssl rand -base64 48 | tr -d '\n')"
  ENC_KEY="$(openssl rand -base64 32 | tr -d '\n')"   # tam 32 byte olmalı
  SEED_PW="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)"

  umask 077
  cat > .env <<EOF
# Advetics — üretim ortamı
# Üretildi: $(date -Iseconds) · scripts/site-setup.sh
# Bu dosya git'e GİRMEZ ve dağıtımlarda korunur.

NODE_ENV=production

# --- Veritabanı (vps-setup.sh tarafından üretildi) ---
DATABASE_URL="${DATABASE_URL}"
DIRECT_DATABASE_URL="${DIRECT_DATABASE_URL}"
WORKER_DATABASE_URL="${WORKER_DATABASE_URL}"
REDIS_URL="${REDIS_URL}"

# --- API ---
API_PORT=${API_PORT}
API_GLOBAL_PREFIX=api
CORS_ORIGINS="https://${DOMAIN},https://www.${DOMAIN}"

# --- Auth ---
JWT_ACCESS_SECRET="${JWT_ACCESS}"
JWT_REFRESH_SECRET="${JWT_REFRESH}"
JWT_ACCESS_TTL="15m"
JWT_REFRESH_TTL="30d"
AUTH_COOKIE_DOMAIN="${DOMAIN}"
AUTH_COOKIE_SECURE=true

# --- Şifreleme (Modül 2: OAuth token'ları) ---
# ENCRYPTION_KEY_V1 ASLA SİLİNMEMELİ. Rotasyon için V2 ekle,
# ACTIVE_KEY_VERSION'ı artır; eski kayıtlar V1 ile açılmaya devam eder.
ENCRYPTION_KEY_V1="${ENC_KEY}"
ENCRYPTION_ACTIVE_KEY_VERSION=1

# --- Frontend ---
# DİKKAT: NEXT_PUBLIC_* değerleri BUILD ANINDA gömülür.
# Değiştirirsen pm2 restart yetmez — yeniden build gerekir.
NEXT_PUBLIC_API_URL="https://${DOMAIN}/api"
NEXT_PUBLIC_ROOT_DOMAIN="${DOMAIN}"
INTERNAL_API_URL="http://127.0.0.1:${API_PORT}/api"

# --- İlk owner hesabı (seed sonrası SEED_ADMIN_PASSWORD satırı silinir) ---
SEED_ORG_NAME="Advetics"
SEED_ADMIN_EMAIL="yusuf@profaj.com"
SEED_ADMIN_PASSWORD="${SEED_PW}"
EOF
  chmod 600 .env
  ok ".env oluşturuldu (600)"
  ok "sırlar üretildi: JWT ×2, şifreleme anahtarı ×1"
fi

# -----------------------------------------------------------------------------
log "Bağımlılıklar"
# -----------------------------------------------------------------------------
pnpm install --frozen-lockfile
ok "kuruldu"

# -----------------------------------------------------------------------------
log "Veritabanı şeması"
# -----------------------------------------------------------------------------
pnpm --filter @advetics/shared build >/dev/null
pnpm --filter @advetics/api exec prisma generate >/dev/null
ok "prisma istemcisi üretildi"

pnpm --filter @advetics/api exec prisma migrate deploy
ok "migration'lar uygulandı"

# RLS politikaları Prisma migration'ının parçası DEĞİLDİR.
pnpm --filter @advetics/api db:rls
ok "RLS politikaları ve kısıtlar uygulandı"

# Gerçekten uygulandığını doğrula — sessizce atlanması en pahalı hatadır.
if command -v psql >/dev/null; then
  DIRECT_URL="$(grep -E '^DIRECT_DATABASE_URL=' .env | cut -d'"' -f2 || true)"
  N="$(psql "$DIRECT_URL" -tAc "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'adv_%'" 2>/dev/null || echo '?')"
  U="$(psql "$DIRECT_URL" -tAc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false AND c.relname NOT LIKE '_prisma%'" 2>/dev/null || echo '?')"
  if [[ "$N" == "?" ]]; then
    warn "politika sayısı okunamadı (psql erişimi yok) — panelden doğrula"
  elif [[ "$U" != "0" ]]; then
    die "$U tablo RLS olmadan duruyor. apps/api/prisma/sql/02_rls.sql içindeki tablo listesini kontrol et."
  else
    ok "$N politika aktif · korumasız tablo yok"
  fi
fi

# -----------------------------------------------------------------------------
log "Derleme"
# -----------------------------------------------------------------------------
pnpm --filter @advetics/api build
pnpm --filter @advetics/web build
ok "api + web derlendi"

# -----------------------------------------------------------------------------
if [[ "$DO_SEED" -eq 1 ]]; then
log "İlk hesap"
# -----------------------------------------------------------------------------
  if grep -q '^SEED_ADMIN_PASSWORD=' .env; then
    ADMIN_EMAIL="$(grep -E '^SEED_ADMIN_EMAIL=' .env | cut -d'"' -f2 || true)"
    ADMIN_PW="$(grep -E '^SEED_ADMIN_PASSWORD=' .env | cut -d'"' -f2 || true)"
    pnpm --filter @advetics/api db:seed
    # Şifre artık argon2 hash olarak veritabanında; düz metin .env'de kalmamalı.
    sed -i '/^SEED_ADMIN_PASSWORD=/d' .env
    ok "owner hesabı oluşturuldu, .env'den düz metin şifre silindi"
    printf '\n  \033[1;33m╭─ GİRİŞ BİLGİLERİ — şimdi kaydet, bir daha gösterilmeyecek\033[0m\n'
    printf '  \033[1;33m│\033[0m  E-posta : %s\n' "$ADMIN_EMAIL"
    printf '  \033[1;33m│\033[0m  Şifre   : %s\n' "$ADMIN_PW"
    printf '  \033[1;33m╰─\033[0m\n'
  else
    skip "seed daha önce çalıştırılmış"
  fi
fi

# -----------------------------------------------------------------------------
log "Süreçler"
# -----------------------------------------------------------------------------
pm2 startOrReload ecosystem.config.js --update-env
pm2 save --force >/dev/null
ok "advetics-api · advetics-web"

sleep 4
API_OK="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "http://127.0.0.1:${API_PORT}/api/health" || true)"
WEB_OK="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "http://127.0.0.1:${WEB_PORT}/login" || true)"
[[ "$API_OK" == "200" ]] && ok "API  :${API_PORT} → 200" || warn "API  :${API_PORT} → $API_OK  (pm2 logs advetics-api)"
[[ "$WEB_OK" == "200" ]] && ok "Panel :${WEB_PORT} → 200" || warn "Panel :${WEB_PORT} → $WEB_OK  (pm2 logs advetics-web)"

git rev-parse HEAD > .last-deployed-sha 2>/dev/null || true

# -----------------------------------------------------------------------------
log "Sıradaki adım — Nginx"
# -----------------------------------------------------------------------------
cat <<EOF

  Uygulama ayakta ama henüz dışarıdan erişilemiyor. CloudPanel'de:

    Sites → ${DOMAIN} → Vhost

  içindeki 'location /' bloğunun ÜSTÜNE aşağıdaki bloğu ekle:

    location /api/ {
        proxy_pass http://127.0.0.1:${API_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
        client_max_body_size 25m;
        proxy_buffering off;
    }

  'location /' bloğundaki proxy_pass zaten 127.0.0.1:${WEB_PORT} olmalı.
  Ardından SSL: Sites → ${DOMAIN} → SSL/TLS → New Let's Encrypt Certificate

  Tam adımlar ve doğrulama: docs/DEPLOYMENT.md
  Sorun teşhisi:              ./scripts/preflight.sh

EOF
