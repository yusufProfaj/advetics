#!/usr/bin/env bash
#
# Modül 3 Redis anahtarlarını sunucudaki .env dosyasına ekler.
#
# Kullanım:  cd ~/htdocs/advetics.com && ./scripts/add-redis-env.sh
#
# Bu script SALT OKUNUR biçimde Redis'i sorgular ve YALNIZCA Advetics'in
# .env dosyasına yazar. Redis yapılandırmasına, servislerine veya başka
# sitelerin dosyalarına DOKUNMAZ.
#
# PAYLAŞIMLI SUNUCU: bu makinede 11+ canlı üretim sitesi var ve Redis onlarla
# paylaşılıyor. Script'in en önemli işi bir anahtar yazmak değil, yazmadan
# önce 3 numaralı veritabanının GERÇEKTEN boş olduğunu doğrulamak. Başka bir
# sitenin kullandığı bir db'ye BullMQ kurmak, o sitenin anahtarlarını
# silebilir.
#
set -Eeuo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

log()  { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[0;32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[0;33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[0;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Root yasağı
#
# deploy.sh ile aynı gerekçe: root'un pm2'si başka sitelerin süreçlerini
# yönetiyor. Buradaki ek gerekçe dosya sahipliği — root olarak yazılan bir
# .env, site kullanıcısının okuyamayacağı sahiplikte kalabilir ve uygulama
# sessizce yapılandırmasız açılır.
# ---------------------------------------------------------------------------
if [[ $EUID -eq 0 ]]; then
  die "Bu script root ile çalıştırılamaz. Site kullanıcısına geç:
      su - advetics
      cd ~/htdocs/advetics.com && ./scripts/add-redis-env.sh"
fi

REDIS_HOST="${REDIS_HOST:-127.0.0.1}"
REDIS_PORT="${REDIS_PORT:-6379}"
TARGET_DB="${REDIS_DB:-3}"
KEY_PREFIX="${REDIS_KEY_PREFIX:-advetics}"
CALLS_PER_MINUTE="${QUOTA_CALLS_PER_MINUTE:-60}"

[[ -f .env ]] || die ".env bulunamadı: $APP_DIR/.env
  Önce site kurulumunu tamamla: ./scripts/site-setup.sh"

# ---------------------------------------------------------------------------
log "Redis erişimi"
# ---------------------------------------------------------------------------
command -v redis-cli >/dev/null || die "redis-cli bulunamadı — Redis kurulu değil.
  Bu script Redis KURMAZ (paylaşımlı servis). Sunucu yöneticisiyle konuş."

# Şifreli/şifresiz iki ayrı sarmalayıcı.
#
# Argümanları bir diziye toplayıp `"${ARR[@]}"` ile genişletmek daha kısa
# olurdu ama `set -u` altında BOŞ dizi genişletmesi bash 4.4'ten eskisinde
# "unbound variable" hatası veriyor. Sunucuda bash 5 var; yine de kabuk
# sürümüne bağlı bir kurulum script'i istemiyoruz.
REDIS_PASSWORD="${REDIS_PASSWORD:-}"
if [[ -n "$REDIS_PASSWORD" ]]; then
  redis() { redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" --no-auth-warning "$@"; }
else
  redis() { redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" "$@"; }
fi

PING_OUT="$(redis PING 2>&1 || true)"
if [[ "$PING_OUT" != "PONG" ]]; then
  if [[ "$PING_OUT" == *NOAUTH* || "$PING_OUT" == *WRONGPASS* ]]; then
    die "Redis şifre istiyor. Şifreyi ortam değişkeni olarak ver — komut
  geçmişine yazılmaması için okutarak:

      read -rs REDIS_PASSWORD && export REDIS_PASSWORD
      ./scripts/add-redis-env.sh"
  fi
  die "Redis'e erişilemiyor ($REDIS_HOST:$REDIS_PORT): $PING_OUT"
fi
ok "Redis yanıt veriyor ($REDIS_HOST:$REDIS_PORT)"

# Hedef db numarası sunucunun `databases` ayarının içinde mi?
DB_COUNT="$(redis CONFIG GET databases 2>/dev/null | tail -1 || echo '')"
if [[ -n "$DB_COUNT" ]] && (( TARGET_DB >= DB_COUNT )); then
  die "Redis yalnızca $DB_COUNT veritabanı tanımlı (0..$((DB_COUNT - 1))),
  db $TARGET_DB kullanılamaz. REDIS_DB ile başka bir numara seç."
fi

# ---------------------------------------------------------------------------
log "db $TARGET_DB boş mu (paylaşımlı Redis kontrolü)"
# ---------------------------------------------------------------------------
# Diğer sitelerin hangi db'leri kullandığını göster — bilgi amaçlı, sadece okuma.
printf '  Kullanımdaki veritabanları:\n'
redis INFO keyspace 2>/dev/null | grep -E '^db[0-9]+:' | sed 's/^/    /' || printf '    (hiçbiri)\n'

DBSIZE="$(redis -n "$TARGET_DB" DBSIZE 2>/dev/null || echo 'ERR')"
[[ "$DBSIZE" == "ERR" ]] && die "db $TARGET_DB sorgulanamadı."

if (( DBSIZE > 0 )); then
  # Boş değil. Anahtarlar BİZE mi ait? Kendi önekimizle yazılmış anahtarlar
  # önceki bir kurulumdan kalmış olabilir — o durumda sorun yok.
  #
  # SCAN kullanıyoruz, KEYS DEĞİL: KEYS tüm anahtar alanını tek seferde
  # tarayıp Redis'i bloklar ve paylaşımlı bir sunucuda diğer sitelerin
  # isteklerini bekletir.
  FOREIGN="$(redis -n "$TARGET_DB" --scan --count 100 2>/dev/null \
    | grep -v -E "^(bull:)?${KEY_PREFIX}" | head -5 || true)"

  if [[ -n "$FOREIGN" ]]; then
    printf '\n'
    warn "db $TARGET_DB BOŞ DEĞİL ve içinde bize ait olmayan anahtarlar var:"
    printf '%s\n' "$FOREIGN" | sed 's/^/      /'
    die "Bu db başka bir uygulama tarafından kullanılıyor. Üzerine yazmak
  o uygulamanın verisini bozar.

  Boş bir db numarası seçip tekrar çalıştır:
      REDIS_DB=4 ./scripts/add-redis-env.sh"
  fi

  ok "db $TARGET_DB'de $DBSIZE anahtar var, hepsi \"$KEY_PREFIX\" önekli — bize ait"
else
  ok "db $TARGET_DB boş"
fi

# ---------------------------------------------------------------------------
log ".env güncelleniyor"
# ---------------------------------------------------------------------------
# Yedek: geri dönmek her zaman mümkün olmalı.
BACKUP=".env.bak-$(date +%Y%m%d-%H%M%S)"
cp -p .env "$BACKUP"
# Yedek de sır içeriyor. `cp -p` kaynağın iznini korur ama .env henüz 600
# değilse yedek de gevşek kalır — açıkça daraltıyoruz.
chmod 600 "$BACKUP"
ok "yedek alındı: $BACKUP"

# Eski yedekleri buda: sınırsız birikirse dizin sır dolu dosyalarla şişer.
# Son 5 yedek yeterli; daha eskisine dönmek isteyen git geçmişine bakar.
ls -1t .env.bak-* 2>/dev/null | tail -n +6 | while read -r old; do
  rm -f "$old"
done

REDIS_URL_VALUE="redis://${REDIS_HOST}:${REDIS_PORT}"
if [[ -n "$REDIS_PASSWORD" ]]; then
  # Şifre URL'e girecekse yüzde kodlaması gerekiyor; özel karakterli bir
  # şifre URL'i sessizce bozar ve bağlantı "erişilemiyor" gibi görünür.
  ENCODED="$(REDIS_PASSWORD="$REDIS_PASSWORD" node -e \
    'process.stdout.write(encodeURIComponent(process.env.REDIS_PASSWORD))' 2>/dev/null || true)"
  [[ -z "$ENCODED" ]] && die "Şifre URL kodlaması yapılamadı (node bulunamadı)."
  REDIS_URL_VALUE="redis://:${ENCODED}@${REDIS_HOST}:${REDIS_PORT}"
fi

# Anahtarı ekle veya mevcut değeri değiştir — script tekrar çalıştırılabilir
# olmalı, her koşuda dosyanın sonuna aynı satırları eklememeli.
set_env_key() {
  local key="$1" value="$2"
  if grep -qE "^[[:space:]]*${key}=" .env; then
    local current
    current="$(grep -E "^[[:space:]]*${key}=" .env | head -1 | sed -E "s/^[[:space:]]*${key}=//; s/^\"//; s/\"$//")"
    if [[ "$current" == "$value" ]]; then
      ok "$key zaten doğru"
      return
    fi
    # Değeri değiştirirken sed'in ayırıcısı olarak | kullanıyoruz: değerler
    # eğik çizgi içeriyor (redis://…) ve / ayırıcısı sed'i bozar.
    local tmp
    tmp="$(mktemp)"
    sed -E "s|^[[:space:]]*${key}=.*|${key}=\"${value}\"|" .env > "$tmp"
    cat "$tmp" > .env && rm -f "$tmp"
    ok "$key güncellendi ($current → $value)"
  else
    printf '%s="%s"\n' "$key" "$value" >> .env
    ok "$key eklendi"
  fi
}

# Bölüm başlığı yalnızca ilk kurulumda yazılıyor.
if ! grep -q 'Modül 3 — Kuyruk ve kota' .env; then
  cat >> .env <<'HEADER'

# -----------------------------------------------------------------------------
# Modül 3 — Kuyruk ve kota (Redis)
#
# PAYLAŞIMLI REDIS: bu sunucuda başka uygulamalar da Redis kullanıyor.
# İzolasyon iki katmanlı ve İKİSİ de gerekli:
#   · REDIS_DB        → ayrı veritabanı numarası
#   · REDIS_KEY_PREFIX → BullMQ ve kota anahtarlarının öneki
# -----------------------------------------------------------------------------
HEADER
fi

set_env_key REDIS_URL "$REDIS_URL_VALUE"
set_env_key REDIS_DB "$TARGET_DB"
set_env_key REDIS_KEY_PREFIX "$KEY_PREFIX"
set_env_key QUOTA_CALLS_PER_MINUTE "$CALLS_PER_MINUTE"

# .env sırlar içeriyor: yalnızca sahibi okuyabilmeli.
chmod 600 .env
ok ".env izinleri 600"

# ---------------------------------------------------------------------------
log "Doğrulama"
# ---------------------------------------------------------------------------
# Yazdığımız URL'in gerçekten çalıştığını kanıtla. Yanlış bir REDIS_URL,
# worker açılışta ölerek "sessizce hiç veri gelmiyor" arızasına dönüşür.
if node -e '
  const fs = require("fs");
  const env = Object.fromEntries(
    fs.readFileSync(".env", "utf8").split("\n")
      .map((l) => l.match(/^\s*([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^"|"$/g, "")]),
  );
  for (const k of ["REDIS_URL", "REDIS_DB", "REDIS_KEY_PREFIX"]) {
    if (!env[k]) { console.error("eksik: " + k); process.exit(1); }
  }
  new URL(env.REDIS_URL);
  const n = Number(env.REDIS_DB);
  if (!Number.isInteger(n) || n < 0 || n > 15) { console.error("REDIS_DB geçersiz"); process.exit(1); }
' 2>/dev/null; then
  ok ".env okunabilir ve değerler geçerli"
else
  die ".env doğrulaması başarısız. Yedeği geri yükle:  cp $BACKUP .env"
fi

printf '\n\033[0;32m✓ Redis yapılandırması hazır\033[0m\n\n'
cat <<EOF
  Sıradaki adım — yeni kodu dağıt (worker süreci bu dağıtımla geliyor):

      ./scripts/deploy.sh

  Dağıtımdan sonra worker'ın gerçekten çalıştığını doğrula:

      pm2 list
      pm2 logs advetics-worker --lines 30

  Beklenen log satırları:
      Redis bağlı — db $TARGET_DB, önek "$KEY_PREFIX"
      Worker hazır — kuyruk: sync, eşzamanlılık: 4

  Bir şey ters giderse .env yedeği:  cp $BACKUP .env

EOF
