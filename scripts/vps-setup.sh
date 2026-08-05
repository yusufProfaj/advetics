#!/usr/bin/env bash
#
# Hostinger VPS (CloudPanel) — bir kerelik sunucu hazırlığı.
#
# ROOT olarak çalıştırılır. DEPLOYMENT.md'deki 3–5. adımları otomatikleştirir:
# Node.js 22, pnpm, pm2, PostgreSQL 16 (+ üç rol), Redis ve güvenlik duvarı.
#
# CloudPanel PostgreSQL ile GELMEZ (MySQL/MariaDB ile gelir) — bu script onu kurar.
#
# Kullanım (CloudPanel'de siteyi oluşturduktan SONRA):
#
#   ssh root@VPS_IP
#   curl -fsSL https://raw.githubusercontent.com/KULLANICI/advetics/main/scripts/vps-setup.sh -o vps-setup.sh
#   bash vps-setup.sh --site-user advetics
#
# Idempotenttir: tekrar çalıştırmak zarar vermez, eksikleri tamamlar.
# Şifreler yalnızca ilk çalıştırmada üretilir; sonraki çalıştırmalar korur.
#
set -Eeuo pipefail

SITE_USER=""
DB_NAME="advetics"
CRED_FILE="/root/advetics-db-credentials.txt"
SKIP_FIREWALL=0
NODE_MAJOR=22
PG_MAJOR=16

while [[ $# -gt 0 ]]; do
  case "$1" in
    --site-user) SITE_USER="${2:-}"; shift 2 ;;
    --db-name)   DB_NAME="${2:-}"; shift 2 ;;
    # Güvenlik duvarına hiç dokunma. CloudPanel kendi UFW kurallarını yönetiyorsa
    # veya özel bir ağ yapılandırman varsa kullan.
    --skip-firewall) SKIP_FIREWALL=1; shift ;;
    -h|--help)
      sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "Bilinmeyen argüman: $1" >&2; exit 1 ;;
  esac
done

# psql'i postgres kullanıcısı olarak çalıştırır.
#
# CloudPanel kurulu sistemlerde `sudo` genelde vardır, ama minimal Debian
# imajlarında bulunmayabilir. Zaten root olduğumuz için `su` ile geri düşmek
# güvenli — sadece kullanıcı değiştiriyoruz, yetki yükseltmiyoruz.
as_postgres() {
  if command -v sudo >/dev/null 2>&1; then
    sudo -u postgres "$@"
  else
    su -s /bin/sh postgres -c "$(printf '%q ' "$@")"
  fi
}

log()  { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[0;32m✓\033[0m %s\n' "$*"; }
skip() { printf '  \033[0;90m·\033[0m %s\n' "$*"; }
warn() { printf '  \033[0;33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[0;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Bu script root olarak çalıştırılmalı:  sudo bash $0 --site-user <kullanıcı>"
[[ -n "$SITE_USER" ]] || die "--site-user zorunlu. CloudPanel'de siteyi oluştururken belirlediğin kullanıcı adı (örn: advetics)."
id "$SITE_USER" >/dev/null 2>&1 || die "'$SITE_USER' kullanıcısı yok. Önce CloudPanel'de Node.js sitesini oluştur (DEPLOYMENT.md adım 2)."

command -v apt-get >/dev/null || die "Bu script Debian/Ubuntu içindir. CloudPanel zaten bu dağıtımlarda çalışır."

export DEBIAN_FRONTEND=noninteractive

# -----------------------------------------------------------------------------
log "Sistem bilgisi"
# -----------------------------------------------------------------------------
. /etc/os-release
ok "$PRETTY_NAME"
ok "site kullanıcısı: $SITE_USER (home: $(getent passwd "$SITE_USER" | cut -d: -f6))"

apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg lsb-release ufw >/dev/null

# -----------------------------------------------------------------------------
log "Node.js ${NODE_MAJOR}"
# -----------------------------------------------------------------------------
# nvm YERİNE NodeSource ile sistem geneli kurulum.
#
# Sebep: nvm yalnızca interaktif login shell'lerde PATH'e girer. GitHub Actions
# SSH ile non-interactive shell açıyor ve orada `node` bulunamıyor — dağıtımın
# en sık takıldığı yer burasıdır. Sistem geneli kurulum /usr/bin'e yazar ve
# her shell türünde çalışır.
if command -v node >/dev/null && [[ "$(node -p 'process.versions.node.split(".")[0]')" -ge "$NODE_MAJOR" ]]; then
  skip "zaten kurulu: $(node -v)"
else
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null 2>&1
  apt-get install -y -qq nodejs >/dev/null
  ok "kuruldu: $(node -v)"
fi

# -----------------------------------------------------------------------------
log "pnpm ve pm2"
# -----------------------------------------------------------------------------
if command -v pnpm >/dev/null; then
  skip "pnpm zaten kurulu: $(pnpm -v)"
else
  npm install -g pnpm@9 >/dev/null 2>&1
  ok "pnpm $(pnpm -v)"
fi

if command -v pm2 >/dev/null; then
  skip "pm2 zaten kurulu: $(pm2 -v)"
else
  npm install -g pm2 >/dev/null 2>&1
  ok "pm2 $(pm2 -v)"
fi

# -----------------------------------------------------------------------------
log "PostgreSQL ${PG_MAJOR}"
# -----------------------------------------------------------------------------
if command -v psql >/dev/null && psql --version | grep -qE "\s${PG_MAJOR}\."; then
  skip "zaten kurulu: $(psql --version)"
else
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    https://www.postgresql.org/media/keys/ACCC4CF8.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -qq
  apt-get install -y -qq "postgresql-${PG_MAJOR}" >/dev/null
  ok "kuruldu: $(psql --version)"
fi

systemctl enable --now postgresql >/dev/null 2>&1
ok "servis aktif"

# Yalnızca localhost dinlesin — veritabanı asla internete açılmamalı.
PG_CONF="/etc/postgresql/${PG_MAJOR}/main/postgresql.conf"
if [[ -f "$PG_CONF" ]]; then
  if grep -qE "^\s*listen_addresses\s*=\s*'localhost'" "$PG_CONF"; then
    skip "listen_addresses = localhost"
  else
    sed -i "s/^#\?\s*listen_addresses\s*=.*/listen_addresses = 'localhost'/" "$PG_CONF"
    systemctl restart postgresql
    ok "listen_addresses = localhost olarak ayarlandı"
  fi
fi

# -----------------------------------------------------------------------------
log "Veritabanı ve roller"
# -----------------------------------------------------------------------------
# Şifreler yalnızca İLK çalıştırmada üretilir. Sonraki çalıştırmalarda mevcut
# dosyadan okunur — aksi halde her çalıştırma .env'i geçersiz kılardı.
if [[ -f "$CRED_FILE" ]]; then
  skip "mevcut şifreler kullanılıyor ($CRED_FILE)"
  # shellcheck disable=SC1090
  . "$CRED_FILE"
else
  PW_MIGRATOR="$(openssl rand -base64 24 | tr -d '/+=' | head -c 28)"
  PW_APP="$(openssl rand -base64 24 | tr -d '/+=' | head -c 28)"
  PW_WORKER="$(openssl rand -base64 24 | tr -d '/+=' | head -c 28)"
  umask 077
  cat > "$CRED_FILE" <<EOF
# Advetics veritabanı şifreleri — $(date -Iseconds)
# Bu dosyayı SİLME. .env yeniden oluşturulurken gerekir.
PW_MIGRATOR='${PW_MIGRATOR}'
PW_APP='${PW_APP}'
PW_WORKER='${PW_WORKER}'
EOF
  ok "şifreler üretildi → $CRED_FILE"
fi

if as_postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" | grep -q 1; then
  skip "veritabanı '${DB_NAME}' mevcut"
else
  as_postgres psql -qc "CREATE DATABASE ${DB_NAME};"
  ok "veritabanı '${DB_NAME}' oluşturuldu"
fi

# Üç rol. RLS'in çalışması bu ayrıma bağlı:
#   migrator → tablo sahibi, BYPASSRLS  (migration + seed)
#   app      → BYPASSRLS YOK            (API runtime — politikalar buna uygulanır)
#   worker   → BYPASSRLS                (auth öncesi akışlar, arka plan işleri)
as_postgres psql -q -v ON_ERROR_STOP=1 -d "$DB_NAME" <<EOF
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='advetics_migrator') THEN
    CREATE ROLE advetics_migrator LOGIN BYPASSRLS CREATEDB;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='advetics_app') THEN
    CREATE ROLE advetics_app LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='advetics_worker') THEN
    CREATE ROLE advetics_worker LOGIN BYPASSRLS;
  END IF;
END
\$\$;

ALTER ROLE advetics_migrator PASSWORD '${PW_MIGRATOR}';
ALTER ROLE advetics_app      PASSWORD '${PW_APP}';
ALTER ROLE advetics_worker   PASSWORD '${PW_WORKER}';

ALTER DATABASE ${DB_NAME} OWNER TO advetics_migrator;
ALTER SCHEMA public OWNER TO advetics_migrator;
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION advetics_migrator;

GRANT USAGE ON SCHEMA public, app TO advetics_app, advetics_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO advetics_app, advetics_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO advetics_app, advetics_worker;

ALTER DEFAULT PRIVILEGES FOR ROLE advetics_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO advetics_app, advetics_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE advetics_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO advetics_app, advetics_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE advetics_migrator IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO advetics_app, advetics_worker;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM advetics_app, advetics_worker;
EOF
ok "üç rol hazır"

# En kritik doğrulama: advetics_app RLS'i ATLAYAMAMALI.
APP_BYPASS="$(as_postgres psql -tAc "SELECT rolbypassrls FROM pg_roles WHERE rolname='advetics_app'")"
[[ "$APP_BYPASS" == "f" ]] || die "advetics_app rolünde BYPASSRLS açık — RLS hiç çalışmaz. Elle düzelt: ALTER ROLE advetics_app NOBYPASSRLS;"
ok "advetics_app → BYPASSRLS kapalı (RLS uygulanacak)"

# Site kullanıcısına devir.
#
# $CRED_FILE yalnızca root tarafından okunabilir; site kullanıcısı .env'i
# oluştururken bu değerlere ihtiyaç duyuyor. Elle kopyala-yapıştır yerine
# yalnızca o kullanıcının okuyabileceği bir dosyaya yazıyoruz — böylece
# şifreler shell geçmişine veya terminal kaydına düşmez.
SITE_HOME="$(getent passwd "$SITE_USER" | cut -d: -f6)"
HANDOFF="${SITE_HOME}/.advetics-db.env"
umask 077
cat > "$HANDOFF" <<EOF
DATABASE_URL="postgresql://advetics_app:${PW_APP}@127.0.0.1:5432/${DB_NAME}?schema=public&connection_limit=10"
DIRECT_DATABASE_URL="postgresql://advetics_migrator:${PW_MIGRATOR}@127.0.0.1:5432/${DB_NAME}?schema=public"
WORKER_DATABASE_URL="postgresql://advetics_worker:${PW_WORKER}@127.0.0.1:5432/${DB_NAME}?schema=public&connection_limit=10"
REDIS_URL="redis://127.0.0.1:6379"
EOF
chown "${SITE_USER}:${SITE_USER}" "$HANDOFF"
chmod 600 "$HANDOFF"
ok "bağlantı bilgileri devredildi → $HANDOFF (yalnızca $SITE_USER okuyabilir)"

# -----------------------------------------------------------------------------
log "Redis"
# -----------------------------------------------------------------------------
if command -v redis-server >/dev/null; then
  skip "zaten kurulu: $(redis-server --version | grep -oE 'v=[0-9.]+')"
else
  apt-get install -y -qq redis-server >/dev/null
  ok "kuruldu"
fi
# appendonly: sunucu yeniden başladığında kuyruktaki işler kaybolmasın (Modül 3).
if ! grep -qE '^appendonly yes' /etc/redis/redis.conf 2>/dev/null; then
  sed -i 's/^appendonly no/appendonly yes/' /etc/redis/redis.conf 2>/dev/null || true
fi
systemctl enable --now redis-server >/dev/null 2>&1
ok "servis aktif"

# -----------------------------------------------------------------------------
log "Güvenlik duvarı"
# -----------------------------------------------------------------------------
# 3598/3599/5432/6379 KASITLI olarak açılmıyor — hepsi yalnızca localhost.
#
# DİKKAT: UFW'yi yanlış kurallarla açmak seni sunucudan KİLİTLER. Bu yüzden
# sabit port varsaymıyoruz; gerçekte dinlenen SSH ve CloudPanel portlarını
# sistemden okuyup açıyoruz.
if [[ "$SKIP_FIREWALL" -eq 1 ]]; then
  skip "--skip-firewall verildi, dokunulmuyor"
else
  # SSH portu: sshd_config'te değiştirilmiş olabilir. 22 varsayıp UFW açmak,
  # özel port kullanan bir sunucuda oturumu anında keser.
  # awk kullanıyoruz (grep değil): varsayılan sshd_config'te Port satırı
  # yorumlanmış olduğu için grep hiç eşleşme bulamaz, 1 döner ve `set -e`
  # script'i tam burada öldürür. awk eşleşme bulamasa da 0 döner.
  SSH_PORTS="$(awk '/^[[:space:]]*Port[[:space:]]+[0-9]+/ {print $2}' \
      /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null | sort -u || true)"
  [[ -z "$SSH_PORTS" ]] && SSH_PORTS="22"
  # Şu an bağlı olduğumuz oturumun portu — en güvenilir kaynak.
  if [[ -n "${SSH_CONNECTION:-}" ]]; then
    ACTIVE_SSH_PORT="$(awk '{print $4}' <<< "$SSH_CONNECTION")"
    [[ -n "$ACTIVE_SSH_PORT" ]] && SSH_PORTS="$(printf '%s\n%s\n' "$SSH_PORTS" "$ACTIVE_SSH_PORT" | sort -u)"
  fi
  for p in $SSH_PORTS; do
    ufw allow "${p}/tcp" >/dev/null 2>&1 || true
    ok "SSH portu açıldı: ${p}"
  done

  # CloudPanel yönetim arayüzü (varsayılan 8443). Kapatmak paneli erişilemez kılar.
  ufw allow 8443/tcp >/dev/null 2>&1 || true
  ok "CloudPanel portu açıldı: 8443"

  ufw allow 80,443/tcp >/dev/null 2>&1 || true

  if ufw status 2>/dev/null | grep -q "Status: active"; then
    skip "UFW zaten aktifti — kurallar eklendi, yeniden etkinleştirilmedi"
  else
    ufw --force enable >/dev/null 2>&1 || warn "UFW etkinleştirilemedi"
    ok "UFW etkinleştirildi"
  fi
  ok "açık: SSH(${SSH_PORTS//$'\n'/,}), 80, 443, 8443 · uygulama ve DB portları kapalı"
fi

# -----------------------------------------------------------------------------
log "pm2 açılışta başlatma"
# -----------------------------------------------------------------------------
SITE_HOME="$(getent passwd "$SITE_USER" | cut -d: -f6)"
if systemctl list-unit-files 2>/dev/null | grep -q "pm2-${SITE_USER}"; then
  skip "systemd birimi zaten kayıtlı"
else
  env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$SITE_USER" --hp "$SITE_HOME" >/dev/null 2>&1 || true
  ok "pm2-${SITE_USER} systemd birimi kaydedildi"
fi

# -----------------------------------------------------------------------------
log "Hazır"
# -----------------------------------------------------------------------------
cat <<EOF

  Kurulanlar
  ──────────────────────────────────────────────────────────
    Node.js       $(node -v)
    pnpm          $(pnpm -v)
    pm2           $(pm2 -v)
    PostgreSQL    $(as_postgres psql -tAc 'SHOW server_version' | xargs)
    Redis         $(redis-server --version | grep -oE 'v=[0-9.]+' | cut -d= -f2)

  .env için veritabanı satırları (kopyala)
  ──────────────────────────────────────────────────────────
DATABASE_URL="postgresql://advetics_app:${PW_APP}@127.0.0.1:5432/${DB_NAME}?schema=public&connection_limit=10"
DIRECT_DATABASE_URL="postgresql://advetics_migrator:${PW_MIGRATOR}@127.0.0.1:5432/${DB_NAME}?schema=public"
WORKER_DATABASE_URL="postgresql://advetics_worker:${PW_WORKER}@127.0.0.1:5432/${DB_NAME}?schema=public&connection_limit=10"
REDIS_URL="redis://127.0.0.1:6379"

  Bu satırlar $CRED_FILE dosyasından her zaman yeniden üretilebilir.

  Sıradaki adım
  ──────────────────────────────────────────────────────────
    su - ${SITE_USER}
    cd ~/htdocs/<domain> && git clone git@github.com:KULLANICI/advetics.git .
    ./scripts/site-setup.sh

EOF
