#!/usr/bin/env bash
#
# Advetics — kurulum teşhisi.
#
# "Neden çalışmıyor?" sorusunun cevabını tek komutta verir. Sunucuda site
# kullanıcısı olarak çalıştır:
#
#   cd ~/htdocs/advetics.com && ./scripts/preflight.sh
#
# Hiçbir şeyi DEĞİŞTİRMEZ, yalnızca kontrol eder ve ne yapılması gerektiğini yazar.
#
set -uo pipefail   # -e YOK: bir kontrol başarısız olsa da diğerleri çalışsın

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

DOMAIN="${1:-}"
PASS=0; FAIL=0; WARN=0

hdr()  { printf '\n\033[1;34m── %s %s\033[0m\n' "$*" "$(printf '─%.0s' $(seq 1 $((46 - ${#1}))))"; }
ok()   { printf '  \033[0;32m✓\033[0m %s\n' "$*"; PASS=$((PASS+1)); }
bad()  { printf '  \033[0;31m✗\033[0m %s\n' "$*"; FAIL=$((FAIL+1)); }
warn() { printf '  \033[0;33m!\033[0m %s\n' "$*"; WARN=$((WARN+1)); }
fix()  { printf '      \033[0;90m→ %s\033[0m\n' "$*"; }

envval() { grep -E "^$1=" .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"'; }

# -----------------------------------------------------------------------------
hdr "Araçlar"
# -----------------------------------------------------------------------------
for c in node pnpm pm2 git curl; do
  if command -v "$c" >/dev/null; then ok "$c $( "$c" --version 2>/dev/null | head -1 | tr -d 'v' )"
  else bad "$c yok"; fix "root olarak: bash scripts/vps-setup.sh --site-user \$(whoami)"; fi
done

if command -v node >/dev/null; then
  NM="$(node -p 'process.versions.node.split(".")[0]')"
  [[ "$NM" -ge 22 ]] && ok "Node sürümü yeterli ($NM ≥ 22)" || bad "Node $NM — 22+ gerekli"
fi

# nvm tuzağı: interaktif shell'de çalışıp SSH dağıtımında bulunamama durumu.
if [[ ! -x /usr/bin/node && -s "$HOME/.nvm/nvm.sh" ]]; then
  warn "node yalnızca nvm üzerinden geliyor (/usr/bin/node yok)"
  fix "GitHub Actions non-interactive shell açar; orada bulunamayabilir."
  fix "root olarak sistem geneli kur: bash scripts/vps-setup.sh --site-user \$(whoami)"
fi

# -----------------------------------------------------------------------------
hdr ".env"
# -----------------------------------------------------------------------------
if [[ -f .env ]]; then
  ok ".env mevcut ($(stat -c '%a' .env 2>/dev/null || stat -f '%Lp' .env))"
  [[ "$(stat -c '%a' .env 2>/dev/null || stat -f '%Lp' .env)" == "600" ]] || { warn ".env izinleri 600 değil"; fix "chmod 600 .env"; }

  for k in DATABASE_URL DIRECT_DATABASE_URL WORKER_DATABASE_URL JWT_ACCESS_SECRET \
           JWT_REFRESH_SECRET ENCRYPTION_KEY_V1 API_PORT NEXT_PUBLIC_API_URL INTERNAL_API_URL; do
    [[ -n "$(envval "$k")" ]] && ok "$k tanımlı" || { bad "$k eksik"; fix "nano .env"; }
  done

  [[ "$(envval NODE_ENV)" == "production" ]] || { warn "NODE_ENV=$(envval NODE_ENV) (production olmalı)"; }
  [[ "$(envval AUTH_COOKIE_SECURE)" == "true" ]] || { bad "AUTH_COOKIE_SECURE=true olmalı"; fix "üretimde false ise uygulama hiç açılmaz"; }

  ENC="$(envval ENCRYPTION_KEY_V1)"
  if [[ -n "$ENC" ]]; then
    LEN="$(printf '%s' "$ENC" | base64 -d 2>/dev/null | wc -c | tr -d ' ')"
    [[ "$LEN" == "32" ]] && ok "ENCRYPTION_KEY_V1 32 byte" || bad "ENCRYPTION_KEY_V1 $LEN byte (32 olmalı) — openssl rand -base64 32"
  fi

  grep -q '^SEED_ADMIN_PASSWORD=' .env && { warn "SEED_ADMIN_PASSWORD hâlâ .env'de"; fix "seed çalıştıysa sil: sed -i '/^SEED_ADMIN_PASSWORD=/d' .env"; }

  NPU="$(envval NEXT_PUBLIC_API_URL)"
  [[ "$NPU" == https://* ]] || { warn "NEXT_PUBLIC_API_URL https değil: $NPU"; fix "değiştirdikten sonra YENİDEN BUILD gerekir"; }
else
  bad ".env yok"; fix "./scripts/site-setup.sh --domain <alan-adı>"
fi

API_PORT="$(envval API_PORT)"; API_PORT="${API_PORT:-3599}"
WEB_PORT=3598

# -----------------------------------------------------------------------------
hdr "Veritabanı"
# -----------------------------------------------------------------------------
DIRECT_URL="$(envval DIRECT_DATABASE_URL)"
if command -v psql >/dev/null && [[ -n "$DIRECT_URL" ]]; then
  if psql "$DIRECT_URL" -tAc 'SELECT 1' >/dev/null 2>&1; then
    ok "bağlantı kuruldu (migrator)"

    BYPASS="$(psql "$DIRECT_URL" -tAc "SELECT rolbypassrls FROM pg_roles WHERE rolname='advetics_app'" 2>/dev/null)"
    if [[ "$BYPASS" == "f" ]]; then ok "advetics_app → BYPASSRLS kapalı"
    elif [[ "$BYPASS" == "t" ]]; then bad "advetics_app RLS'i ATLIYOR — izolasyon yok!"; fix "ALTER ROLE advetics_app NOBYPASSRLS;"
    else bad "advetics_app rolü bulunamadı"; fix "root: bash scripts/vps-setup.sh --site-user \$(whoami)"; fi

    N="$(psql "$DIRECT_URL" -tAc "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'adv_%'" 2>/dev/null)"
    [[ "${N:-0}" -ge 19 ]] && ok "$N RLS politikası aktif" || { bad "yalnızca ${N:-0} politika (19 bekleniyor)"; fix "pnpm --filter @advetics/api db:rls"; }

    U="$(psql "$DIRECT_URL" -tAc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity=false AND c.relname NOT LIKE '_prisma%'" 2>/dev/null)"
    [[ "${U:-1}" == "0" ]] && ok "korumasız tablo yok" || { bad "$U tablo RLS olmadan duruyor"; fix "psql \"\$DIRECT_DATABASE_URL\" -c \"SELECT relname FROM pg_class WHERE relrowsecurity=false AND relkind='r'\""; }

    T="$(psql "$DIRECT_URL" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null)"
    [[ "${T:-0}" -ge 9 ]] && ok "$T tablo mevcut" || { bad "yalnızca ${T:-0} tablo"; fix "pnpm --filter @advetics/api exec prisma migrate deploy"; }

    O="$(psql "$DIRECT_URL" -tAc "SELECT count(*) FROM organizations" 2>/dev/null)"
    [[ "${O:-0}" -ge 1 ]] && ok "$O organizasyon (seed çalışmış)" || { warn "organizasyon yok"; fix "pnpm --filter @advetics/api db:seed"; }
  else
    bad "veritabanına bağlanılamadı"
    fix "systemctl status postgresql · .env şifrelerini kontrol et"
  fi
elif [[ -z "$DIRECT_URL" ]]; then
  warn "DIRECT_DATABASE_URL yok, veritabanı kontrolleri atlandı"
else
  warn "psql bulunamadı, veritabanı kontrolleri atlandı"
fi

# -----------------------------------------------------------------------------
hdr "Derleme çıktıları"
# -----------------------------------------------------------------------------
[[ -f apps/api/dist/main.js ]] && ok "api/dist/main.js" || { bad "API derlenmemiş"; fix "pnpm --filter @advetics/api build"; }
JSN="$(find apps/api/dist -name '*.js' 2>/dev/null | wc -l | tr -d ' ')"
[[ "${JSN:-0}" -ge 30 ]] && ok "api/dist $JSN dosya" || { bad "api/dist eksik görünüyor ($JSN dosya)"; fix "rm -rf apps/api/dist && pnpm --filter @advetics/api build"; }
[[ -d apps/web/.next ]] && ok "web/.next" || { bad "Panel derlenmemiş"; fix "pnpm --filter @advetics/web build"; }

# NEXT_PUBLIC_API_URL build'e gömülür; derlenmiş çıktıda gerçekten var mı?
if [[ -d apps/web/.next && -n "${NPU:-}" ]]; then
  if grep -rqs "$NPU" apps/web/.next/static 2>/dev/null; then
    ok "NEXT_PUBLIC_API_URL build'e gömülü ($NPU)"
  else
    warn "derlenmiş panelde $NPU bulunamadı — .env build'den sonra mı değişti?"
    fix "pnpm --filter @advetics/web build && pm2 restart advetics-web"
  fi
fi

# -----------------------------------------------------------------------------
hdr "Süreçler"
# -----------------------------------------------------------------------------
if command -v pm2 >/dev/null; then
  for p in advetics-api advetics-web; do
    S="$(pm2 jlist 2>/dev/null | node -e "
      let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
        try{const a=JSON.parse(d).find(x=>x.name==='$p');
        console.log(a? a.pm2_env.status+' restart='+a.pm2_env.restart_time : 'yok')}catch{console.log('yok')}})" 2>/dev/null)"
    case "$S" in
      online*) ok "$p → $S" ;;
      yok)     bad "$p çalışmıyor"; fix "pm2 startOrReload ecosystem.config.js --update-env" ;;
      *)       bad "$p → $S"; fix "pm2 logs $p --lines 50" ;;
    esac
  done
  systemctl list-unit-files 2>/dev/null | grep -q "pm2-$(whoami)" \
    && ok "pm2 systemd birimi kayıtlı (yeniden başlatmada kalkar)" \
    || { warn "pm2 açılışta başlamayacak"; fix "pm2 startup  → çıkan komutu root olarak çalıştır"; }
fi

# -----------------------------------------------------------------------------
hdr "Yerel bağlantı"
# -----------------------------------------------------------------------------
A="$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 "http://127.0.0.1:${API_PORT}/api/health" 2>/dev/null || true)"
[[ "$A" == "200" ]] && ok "API :${API_PORT}/api/health → 200" || { bad "API :${API_PORT} → $A"; fix "pm2 logs advetics-api --lines 50"; }

W="$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 "http://127.0.0.1:${WEB_PORT}/login" 2>/dev/null || true)"
[[ "$W" == "200" ]] && ok "Panel :${WEB_PORT}/login → 200" || { bad "Panel :${WEB_PORT} → $W"; fix "pm2 logs advetics-web --lines 50"; }

# Yedek yol: Next.js üzerinden /api erişimi (Nginx bloğu yoksa devreye girer)
R="$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 "http://127.0.0.1:${WEB_PORT}/api/health" 2>/dev/null || true)"
[[ "$R" == "200" ]] && ok "Next.js yedek yönlendirmesi çalışıyor (:${WEB_PORT}/api → :${API_PORT})" \
  || warn "Next.js /api yönlendirmesi yanıt vermedi ($R) — Nginx bloğu şart olur"

# Portlar dışarı kapalı mı?
if command -v ss >/dev/null; then
  ss -tln 2>/dev/null | grep -qE "0\.0\.0\.0:(${API_PORT}|${WEB_PORT}|5432|6379)" \
    && { bad "uygulama/veritabanı portu tüm arayüzlerde dinliyor"; fix "yalnızca 127.0.0.1 dinlemeli — ufw status ve postgresql.conf kontrol et"; } \
    || ok "uygulama portları yalnızca localhost"
fi

# -----------------------------------------------------------------------------
if [[ -n "$DOMAIN" ]]; then
hdr "Dışarıdan erişim"
# -----------------------------------------------------------------------------
  H="$(curl -s -o /tmp/pf.json -w '%{http_code}' --max-time 12 "https://${DOMAIN}/api/health" 2>/dev/null || true)"
  if [[ "$H" == "200" ]]; then ok "https://${DOMAIN}/api/health → 200"
  elif [[ "$H" == "000" ]]; then bad "https://${DOMAIN} erişilemedi"; fix "DNS · SSL sertifikası · CloudPanel vhost"
  else bad "https://${DOMAIN}/api/health → $H"; fix "Nginx 'location /api/' bloğu eksik olabilir — docs/DEPLOYMENT.md adım 9"; fi

  L="$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "https://${DOMAIN}/login" 2>/dev/null || true)"
  [[ "$L" == "200" ]] && ok "https://${DOMAIN}/login → 200" || { bad "panel dışarıdan → $L"; fix "CloudPanel vhost 'location /' → 127.0.0.1:${WEB_PORT}"; }
else
  hdr "Dışarıdan erişim"
  warn "alan adı verilmedi, atlandı"
  fix "./scripts/preflight.sh advetics.com"
fi

# -----------------------------------------------------------------------------
printf '\n\033[1m%s\033[0m\n' "$(printf '═%.0s' $(seq 1 50))"
printf '  \033[0;32m%d geçti\033[0m · \033[0;33m%d uyarı\033[0m · \033[0;31m%d başarısız\033[0m\n\n' "$PASS" "$WARN" "$FAIL"
[[ "$FAIL" -eq 0 ]] && printf '  Kurulum sağlıklı.\n\n' || printf '  Yukarıdaki ✗ satırlarını sırayla çöz.\n\n'
exit $(( FAIL > 0 ? 1 : 0 ))
