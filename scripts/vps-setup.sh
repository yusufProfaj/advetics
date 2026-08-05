#!/usr/bin/env bash
#
# Hostinger VPS (CloudPanel) — Advetics için sunucu hazırlığı.
#
# ╔══════════════════════════════════════════════════════════════════════════╗
# ║  BU SUNUCU PAYLAŞIMLIDIR.                                                ║
# ║                                                                          ║
# ║  Aynı makinede başka canlı üretim siteleri çalışıyor ve bunlar sistem     ║
# ║  geneli kaynakları paylaşıyor: /usr/bin/node, PostgreSQL, Redis, Nginx,   ║
# ║  root'un pm2'si, UFW.                                                    ║
# ║                                                                          ║
# ║  Bu script VARSAYILAN OLARAK paylaşılan hiçbir şeyi değiştirmez ve        ║
# ║  hiçbir paylaşılan servisi yeniden başlatmaz. Yalnızca Advetics'e ait     ║
# ║  olanı kurar:                                                            ║
# ║    · `advetics` veritabanı ve `advetics_*` rolleri                        ║
# ║    · site kullanıcısının kendi home'una nvm + Node                        ║
# ║                                                                          ║
# ║  Eksik bir sistem bileşeni varsa KURMAZ — bildirir ve durur. Kararı       ║
# ║  sen verirsin.                                                           ║
# ╚══════════════════════════════════════════════════════════════════════════╝
#
# Kullanım:
#   ssh root@VPS_IP
#   bash vps-setup.sh --site-user advetics
#
# Idempotenttir. Şifreler yalnızca ilk çalıştırmada üretilir.
#
set -Eeuo pipefail

SITE_USER=""
DB_NAME="advetics"
CRED_FILE="/root/advetics-db-credentials.txt"
NODE_MAJOR=22

while [[ $# -gt 0 ]]; do
  case "$1" in
    --site-user) SITE_USER="${2:-}"; shift 2 ;;
    --db-name)   DB_NAME="${2:-}"; shift 2 ;;
    -h|--help)   sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Bilinmeyen argüman: $1" >&2; exit 1 ;;
  esac
done

log()  { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[0;32m✓\033[0m %s\n' "$*"; }
skip() { printf '  \033[0;90m·\033[0m %s\n' "$*"; }
warn() { printf '  \033[0;33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[0;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

as_postgres() {
  if command -v sudo >/dev/null 2>&1; then sudo -u postgres "$@"
  else su -s /bin/sh postgres -c "$(printf '%q ' "$@")"; fi
}

[[ $EUID -eq 0 ]] || die "root olarak çalıştır: sudo bash $0 --site-user <kullanıcı>"
[[ -n "$SITE_USER" ]] || die "--site-user zorunlu (CloudPanel'deki Site User, örn: advetics)"
id "$SITE_USER" >/dev/null 2>&1 || die "'$SITE_USER' kullanıcısı yok. Önce CloudPanel'de siteyi oluştur."

SITE_HOME="$(getent passwd "$SITE_USER" | cut -d: -f6)"
[[ -d "$SITE_HOME" ]] || die "$SITE_USER kullanıcısının home dizini bulunamadı"

# -----------------------------------------------------------------------------
log "Paylaşımlı sunucu taraması"
# -----------------------------------------------------------------------------
# Bu bölüm hiçbir şey yapmaz — sadece neyi riske attığımızı görünür kılar.
# Kör gitmek bir kez pahalıya geldi.
OTHER_USERS="$(find /home -maxdepth 2 -type d -name htdocs 2>/dev/null \
  | sed 's#/home/\([^/]*\)/htdocs#\1#' | grep -vx "$SITE_USER" | sort || true)"

if [[ -n "$OTHER_USERS" ]]; then
  warn "Bu sunucuda BAŞKA siteler var — hiçbirine dokunulmayacak:"
  while read -r u; do [[ -n "$u" ]] && printf '        · %s\n' "$u"; done <<< "$OTHER_USERS"
else
  skip "başka site kullanıcısı bulunamadı"
fi

ROOT_PM2_COUNT=0
if command -v pm2 >/dev/null 2>&1 && [[ -f /root/.pm2/dump.pm2 ]]; then
  ROOT_PM2_COUNT="$(pm2 jlist 2>/dev/null | grep -o '"name"' | wc -l | tr -d ' ' || echo 0)"
fi
if [[ "${ROOT_PM2_COUNT:-0}" -gt 0 ]]; then
  warn "root'un pm2'sinde ${ROOT_PM2_COUNT} süreç var — bu script ona DOKUNMAZ"
  warn "Advetics daima '$SITE_USER' kullanıcısının pm2'si altında çalışır"
fi

# -----------------------------------------------------------------------------
log "Sistem bileşenleri (yalnızca kontrol — kurulum YOK)"
# -----------------------------------------------------------------------------
# Eksik bir bileşeni kurmak apt deposu eklemek, paket yüklemek ve servis
# başlatmak demek — hepsi paylaşılan alanda. Bu yüzden kurmuyoruz, bildiriyoruz.
MISSING=""

if command -v psql >/dev/null 2>&1; then
  ok "PostgreSQL: $(psql --version | awk '{print $3}')"
else
  MISSING+="  · PostgreSQL — kur: apt install postgresql-16\n"
fi

if systemctl is-active --quiet postgresql 2>/dev/null; then
  ok "PostgreSQL servisi çalışıyor"
else
  MISSING+="  · PostgreSQL servisi çalışmıyor — systemctl start postgresql\n"
fi

# listen_addresses'i DEĞİŞTİRMİYORUZ, yalnızca rapor ediyoruz. Bu ayar tüm
# veritabanlarını etkiler; değiştirip servisi yeniden başlatmak başka sitelerin
# bağlantılarını keser.
PG_LISTEN="$(as_postgres psql -tAc 'SHOW listen_addresses' 2>/dev/null || echo '?')"
if [[ "$PG_LISTEN" == "localhost" || "$PG_LISTEN" == "127.0.0.1" ]]; then
  ok "PostgreSQL yalnızca localhost dinliyor"
else
  warn "PostgreSQL listen_addresses = '$PG_LISTEN' (yalnızca localhost olması önerilir)"
  warn "DEĞİŞTİRMEDİM — bu ayar tüm veritabanlarını etkiler, servisi yeniden başlatmak gerekir"
fi

if command -v redis-server >/dev/null 2>&1; then
  ok "Redis: $(redis-server --version | grep -oE 'v=[0-9.]+' | cut -d= -f2)"
  systemctl is-active --quiet redis-server 2>/dev/null \
    && ok "Redis servisi çalışıyor" \
    || MISSING+="  · Redis servisi çalışmıyor — systemctl start redis-server\n"
else
  MISSING+="  · Redis — kur: apt install redis-server  (Modül 3'te gerekli olacak)\n"
fi

if [[ -n "$MISSING" ]]; then
  printf '\n\033[0;31m✗ Eksik sistem bileşenleri var. Bunları KURMUYORUM — paylaşılan alanda değişiklik yapmak senin kararın.\033[0m\n\n' >&2
  printf "$MISSING" >&2
  printf '\n  Kurduktan sonra bu script’i tekrar çalıştır.\n\n' >&2
  exit 1
fi

# -----------------------------------------------------------------------------
log "Node.js ${NODE_MAJOR} — yalnızca $SITE_USER için (nvm)"
# -----------------------------------------------------------------------------
# Sistem Node'una KESİNLİKLE dokunmuyoruz: /usr/bin/node başka sitelerin
# runtime'ı ve majör sürüm değişikliği onların native modüllerini (bcrypt,
# sharp, canvas...) ABI uyumsuzluğuyla kırar. Bir kez oldu, dört site düştü.
#
# Advetics kendi Node'unu site kullanıcısının nvm'inde tutar. İzole ve geri
# alınabilir: /home/$SITE_USER/.nvm silinince eski hale döner.
SYS_NODE_V="$(/usr/bin/node -v 2>/dev/null || echo 'yok')"
skip "sistem node'u: ${SYS_NODE_V} — DOKUNULMUYOR (diğer sitelerin runtime'ı)"

SITE_NODE_MAJOR="$(su - "$SITE_USER" -c '
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" 2>/dev/null
  command -v node >/dev/null 2>&1 && node -p "process.versions.node.split(\".\")[0]" || echo 0
' 2>/dev/null || echo 0)"

if [[ "${SITE_NODE_MAJOR:-0}" -eq "$NODE_MAJOR" ]]; then
  skip "$SITE_USER zaten Node ${NODE_MAJOR} kullanıyor"
else
  echo "  $SITE_USER için nvm + Node ${NODE_MAJOR} kuruluyor (yalnızca $SITE_HOME altına)"
  su - "$SITE_USER" -c "
    set -e
    export NVM_DIR=\"\$HOME/.nvm\"
    if [ ! -s \"\$NVM_DIR/nvm.sh\" ]; then
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash >/dev/null 2>&1
    fi
    . \"\$NVM_DIR/nvm.sh\"
    nvm install ${NODE_MAJOR} >/dev/null 2>&1
    nvm alias default ${NODE_MAJOR} >/dev/null 2>&1
  " || die "nvm/Node kurulumu başarısız"

  INSTALLED="$(su - "$SITE_USER" -c 'export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; node -v' 2>/dev/null || echo '?')"
  ok "kuruldu: ${INSTALLED} (yalnızca $SITE_USER)"
fi

# pnpm ve pm2: sistem geneli kurulum YAPMIYORUZ (npm install -g root'a yazar ve
# diğer sitelerin sürümünü değiştirebilir). Site kullanıcısının nvm'i içine
# kuruyoruz — orası yalnızca ona ait.
su - "$SITE_USER" -c "
  export NVM_DIR=\"\$HOME/.nvm\"
  [ -s \"\$NVM_DIR/nvm.sh\" ] && . \"\$NVM_DIR/nvm.sh\"
  command -v pnpm >/dev/null 2>&1 || npm install -g pnpm@9 >/dev/null 2>&1
  command -v pm2  >/dev/null 2>&1 || npm install -g pm2  >/dev/null 2>&1
" 2>/dev/null || warn "pnpm/pm2 kurulumu kısmen başarısız — elle kontrol et"

TOOLS="$(su - "$SITE_USER" -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; echo "node $(node -v 2>/dev/null) · pnpm $(pnpm -v 2>/dev/null) · pm2 $(pm2 -v 2>/dev/null)"' 2>/dev/null || echo '?')"
ok "$SITE_USER araçları → $TOOLS"

# -----------------------------------------------------------------------------
log "Veritabanı: '$DB_NAME' ve advetics_* rolleri"
# -----------------------------------------------------------------------------
# Buradaki her şey isim bazında Advetics'e özgü. Başka veritabanına, role veya
# şemaya dokunulmaz.
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

REVOKE CREATE ON SCHEMA public FROM advetics_app, advetics_worker;
EOF
ok "üç rol hazır (yalnızca '${DB_NAME}' veritabanında)"

APP_BYPASS="$(as_postgres psql -tAc "SELECT rolbypassrls FROM pg_roles WHERE rolname='advetics_app'")"
[[ "$APP_BYPASS" == "f" ]] || die "advetics_app rolünde BYPASSRLS açık — RLS çalışmaz. ALTER ROLE advetics_app NOBYPASSRLS;"
ok "advetics_app → BYPASSRLS kapalı (RLS uygulanacak)"

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
ok "bağlantı bilgileri devredildi → $HANDOFF"

# -----------------------------------------------------------------------------
log "pm2 açılışta başlatma — yalnızca $SITE_USER"
# -----------------------------------------------------------------------------
# Bu, /etc/systemd/system/pm2-$SITE_USER.service dosyasını oluşturur. Eklemeli
# bir işlem: mevcut pm2-root veya başka bir birimi değiştirmez, devre dışı
# bırakmaz.
if systemctl list-unit-files 2>/dev/null | grep -q "pm2-${SITE_USER}.service"; then
  skip "pm2-${SITE_USER}.service zaten kayıtlı"
else
  SITE_PATH="$(su - "$SITE_USER" -c 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; echo "$PATH"' 2>/dev/null || echo "$PATH")"
  su - "$SITE_USER" -c "export NVM_DIR=\"\$HOME/.nvm\"; . \"\$NVM_DIR/nvm.sh\"; pm2 startup systemd -u ${SITE_USER} --hp ${SITE_HOME}" 2>/dev/null \
    | grep -E '^sudo env' | bash >/dev/null 2>&1 \
    || env PATH="$SITE_PATH" pm2 startup systemd -u "$SITE_USER" --hp "$SITE_HOME" >/dev/null 2>&1 \
    || warn "pm2 systemd birimi kaydedilemedi — elle: su - $SITE_USER -c 'pm2 startup'"
  systemctl list-unit-files 2>/dev/null | grep -q "pm2-${SITE_USER}.service" \
    && ok "pm2-${SITE_USER}.service kaydedildi" \
    || warn "birim doğrulanamadı"
fi

# -----------------------------------------------------------------------------
log "Güvenlik duvarı — yalnızca rapor"
# -----------------------------------------------------------------------------
# UFW kurallarını DEĞİŞTİRMİYORUZ. Kuralları eklemek/etkinleştirmek tüm
# sunucuyu etkiler; yanlış bir kural SSH'ı veya CloudPanel'i (8443) keser.
if command -v ufw >/dev/null 2>&1; then
  UFW_STATE="$(ufw status 2>/dev/null | head -1 || echo 'okunamadı')"
  skip "$UFW_STATE — DEĞİŞTİRİLMEDİ"
  if ss -tln 2>/dev/null | grep -qE '0\.0\.0\.0:(5432|6379|3598|3599)'; then
    warn "Bir uygulama/DB portu tüm arayüzlerde dinliyor — yalnızca 127.0.0.1 olmalı"
  else
    ok "Advetics portları ve DB yalnızca localhost"
  fi
fi

# -----------------------------------------------------------------------------
log "Hazır"
# -----------------------------------------------------------------------------
cat <<EOF

  DEĞİŞTİRİLENLER (hepsi Advetics'e özgü)
  ──────────────────────────────────────────────────────────
    · '${DB_NAME}' veritabanı + advetics_* rolleri
    · ${SITE_HOME}/.nvm  (Node ${NODE_MAJOR}, pnpm, pm2)
    · ${HANDOFF}
    · /etc/systemd/system/pm2-${SITE_USER}.service

  DOKUNULMAYANLAR
  ──────────────────────────────────────────────────────────
    · /usr/bin/node (${SYS_NODE_V}) ve diğer tüm sistem paketleri
    · PostgreSQL / Redis / Nginx yapılandırmaları ve servisleri
    · root'un pm2'si ve diğer site kullanıcıları
    · UFW kuralları

  Sıradaki adım
  ──────────────────────────────────────────────────────────
    su - ${SITE_USER}
    cd ~/htdocs/<domain> && ./scripts/site-setup.sh --domain <domain>

EOF
