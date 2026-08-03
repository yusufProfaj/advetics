#!/usr/bin/env bash
#
# Üretim dağıtım script'i — sunucu üzerinde çalışır.
#
# GitHub Actions bu script'i SSH ile tetikler. Dağıtım mantığının workflow
# YAML'ı içinde değil burada durmasının sebebi: sunucuda elle çalıştırılabilir,
# git geçmişinde izlenebilir ve bir sorun anında adım adım debug edilebilir.
#
# Elle çalıştırma:  cd ~/htdocs/advetics.com && ./scripts/deploy.sh
#
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

API_PORT="${API_PORT:-3599}"
WEB_PORT="${WEB_PORT:-3598}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"

log()  { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[0;32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[0;33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[0;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

PREVIOUS_SHA="$(cat .last-deployed-sha 2>/dev/null || echo '')"
CURRENT_SHA="$(git rev-parse HEAD)"

trap 'on_failure' ERR

on_failure() {
  local code=$?
  printf '\n\033[0;31m✗ Dağıtım başarısız (çıkış kodu %s)\033[0m\n' "$code" >&2

  if [[ -n "$PREVIOUS_SHA" && "$PREVIOUS_SHA" != "$CURRENT_SHA" ]]; then
    cat >&2 <<EOF

  Önceki çalışan sürüm: $PREVIOUS_SHA
  Geri almak için sunucuda:

    cd $APP_DIR
    git reset --hard $PREVIOUS_SHA
    ./scripts/deploy.sh

  DİKKAT: Bu yalnızca KODU geri alır. Uygulanmış veritabanı migration'ları
  geri alınmaz. Şema değişikliği içeren bir sürümden geri dönüyorsan önce
  migration'ın geriye uyumlu olup olmadığını kontrol et.
EOF
  fi
  exit "$code"
}

# -----------------------------------------------------------------------------
log "Ortam kontrolü"
# -----------------------------------------------------------------------------
[[ -f .env ]] || die ".env dosyası yok. docs/DEPLOYMENT.md → '6. Ortam değişkenleri' adımını uygula."

command -v node >/dev/null || die "node bulunamadı"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 22 ]] || die "Node.js 22+ gerekli, kurulu sürüm: $(node -v)"

if ! command -v pnpm >/dev/null; then
  corepack enable pnpm >/dev/null 2>&1 || die "pnpm yok ve corepack ile etkinleştirilemedi"
fi
command -v pm2 >/dev/null || die "pm2 bulunamadı (npm install -g pm2)"

ok "node $(node -v) · pnpm $(pnpm -v) · pm2 $(pm2 -v)"
ok "commit $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s | head -c 60)"

# -----------------------------------------------------------------------------
log "Bağımlılıklar"
# -----------------------------------------------------------------------------
# --frozen-lockfile: lockfile ile package.json uyuşmazsa BAŞARISIZ olur.
# Üretimde sessizce farklı bir sürüm kurulmasındansa dağıtımın durması iyidir.
pnpm install --frozen-lockfile
ok "kuruldu"

# -----------------------------------------------------------------------------
log "Derleme"
# -----------------------------------------------------------------------------
# Sıra önemli: shared paketi diğer ikisinin tip kaynağı.
pnpm --filter @advetics/shared build
pnpm --filter @advetics/api exec prisma generate
pnpm --filter @advetics/api build
# Next.js NEXT_PUBLIC_* değerlerini bu adımda koda gömer — .env doğru olmalı.
pnpm --filter @advetics/web build
ok "api + web derlendi"

# -----------------------------------------------------------------------------
log "Veritabanı"
# -----------------------------------------------------------------------------
# migrate deploy: yeni migration ÜRETMEZ, yalnızca bekleyenleri uygular.
# (migrate dev üretimde asla kullanılmamalı — shadow DB oluşturur ve
#  şema kayması durumunda veri kaybettirebilir.)
pnpm --filter @advetics/api exec prisma migrate deploy
ok "migration'lar uygulandı"

# RLS politikaları Prisma migration'ının parçası DEĞİLDİR. Bu adım atlanırsa
# uygulama sorunsuz çalışır — ta ki bir müşteri diğerinin verisini görene kadar.
pnpm --filter @advetics/api db:rls
ok "RLS politikaları ve kısıtlar uygulandı"

# -----------------------------------------------------------------------------
log "Süreçler yeniden başlatılıyor"
# -----------------------------------------------------------------------------
# startOrReload: süreç yoksa başlatır, varsa sıfır kesintiyle yeniler.
# --update-env: .env'deki değişikliklerin görülmesi için gerekli.
pm2 startOrReload ecosystem.config.js --update-env
pm2 save --force >/dev/null
ok "advetics-api · advetics-web"

# -----------------------------------------------------------------------------
log "Sağlık kontrolü"
# -----------------------------------------------------------------------------
wait_for() {
  local name="$1" url="$2" deadline=$((SECONDS + HEALTH_TIMEOUT))
  while (( SECONDS < deadline )); do
    if curl -fsS --max-time 5 "$url" >/dev/null 2>&1; then
      ok "$name yanıt veriyor"
      return 0
    fi
    sleep 2
  done
  pm2 logs --nostream --lines 40 || true
  die "$name ${HEALTH_TIMEOUT}s içinde yanıt vermedi ($url)"
}

wait_for "API"   "http://127.0.0.1:${API_PORT}/api/health"
wait_for "Panel" "http://127.0.0.1:${WEB_PORT}/login"

# RLS'in gerçekten devrede olduğunu doğrula. /api/health/rls oturum gerektirdiği
# için 401 beklenir — 401 ALMAK BAŞARIDIR: endpoint ayakta ve korunuyor demektir.
RLS_STATUS="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${API_PORT}/api/health/rls" || echo '000')"
if [[ "$RLS_STATUS" == "401" ]]; then
  ok "RLS endpoint'i korunuyor (401)"
else
  warn "RLS endpoint'i beklenmedik durum kodu döndü: $RLS_STATUS (beklenen 401)"
fi

echo "$CURRENT_SHA" > .last-deployed-sha
trap - ERR

printf '\n\033[0;32m✓ Dağıtım tamamlandı\033[0m — %s\n\n' "$(git rev-parse --short HEAD)"
