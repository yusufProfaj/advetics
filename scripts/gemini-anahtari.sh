#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# GEMINI API ANAHTARINI SUNUCUYA GİRER (2026-10-08)
#
# Kullanım (advetics kullanıcısı olarak):
#   su - advetics
#   cd ~/htdocs/advetics.com && ./scripts/gemini-anahtari.sh
#
# Ne yapar:
#   1. Anahtarı GİZLİ sorar (ekrana yansımaz, komut geçmişine düşmez).
#   2. Gemini'ye sorup DOĞRULAR: anahtar geçersizse ya da model bu anahtarla
#      kullanılamıyorsa .env'e HİÇBİR ŞEY yazılmaz ve Gemini'nin mesajı
#      gösterilir.
#   3. .env'in yedeğini alır (yalnız sahibi okuyabilir), GEMINI_API_KEY ve
#      GEMINI_MODEL satırlarını yazar; diğer satırlara dokunmaz.
#   4. YALNIZ advetics-api ve advetics-worker süreçlerini yeniden başlatır.
#
# NEDEN .env YÜKLENİP YENİDEN BAŞLATILIYOR: deploy.sh .env'i kabuğa yükleyip
# pm2'ye `--update-env` ile veriyor; süreçler .env'in O ANKİ kopyasını ortam
# değişkeni olarak taşıyor ve uygulama ortamda zaten olan bir değişkeni
# dosyadan yeniden OKUMUYOR. Düz `pm2 restart` eski anahtarla açılırdı ve
# hiçbir hata vermezdi.
#
# PAYLAŞIMLI SUNUCU: root ile çalışmaz (root'un pm2'si başka sitelerin
# süreçlerini yönetiyor). Yalnız bu uygulamanın dizinine ve süreçlerine
# dokunur. Anahtar hiçbir yere yazdırılmaz; curl'e komut satırından değil
# standart girdiden verilir (süreç listesinde görünmesin diye).
# ═══════════════════════════════════════════════════════════════════════════
set -Eeuo pipefail

kirmizi() { printf '\033[0;31m%s\033[0m\n' "$*" >&2; }
yesil() { printf '\033[0;32m%s\033[0m\n' "$*"; }

if [[ $EUID -eq 0 ]]; then
  kirmizi '✗ Bu betik root ile çalıştırılamaz. Önce: su - advetics'
  exit 1
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_DOSYASI="$APP_DIR/.env"
MODEL="${GEMINI_MODEL_SECIMI:-gemini-3.8-flash}"

[[ -f "$ENV_DOSYASI" ]] || { kirmizi "✗ $ENV_DOSYASI yok. Önce docs/DEPLOYMENT.md § 6."; exit 1; }
[[ -w "$ENV_DOSYASI" ]] || { kirmizi "✗ $ENV_DOSYASI yazılamıyor (sahibi advetics olmalı)."; exit 1; }
command -v curl >/dev/null || { kirmizi '✗ curl bulunamadı.'; exit 1; }
command -v node >/dev/null || { kirmizi '✗ node bulunamadı.'; exit 1; }

printf 'Gemini API anahtarını yapıştır (ekranda görünmez) ve Enter’a bas: '
IFS= read -rs ANAHTAR
printf '\n'
# Baştaki/sondaki boşluk ve satır sonu temizlenir; içte boşluk varsa bu bir
# anahtar değil (yanlış yapıştırma).
ANAHTAR="$(printf '%s' "$ANAHTAR" | tr -d '\r\n' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
if [[ -z "$ANAHTAR" ]]; then kirmizi '✗ Anahtar boş.'; exit 1; fi
if [[ "$ANAHTAR" =~ [[:space:]\"\'\\\$\`] ]]; then kirmizi '✗ Anahtarda boşluk ya da tırnak var; yanlış yapıştırılmış olabilir.'; exit 1; fi
if (( ${#ANAHTAR} < 20 || ${#ANAHTAR} > 200 )); then kirmizi "✗ Anahtar uzunluğu beklenmedik (${#ANAHTAR} karakter)."; exit 1; fi

# ─── Doğrulama: modeli bu anahtarla oku ───────────────────────────────────
printf 'Gemini’ye soruluyor (%s)… ' "$MODEL"
GECICI="$(mktemp)"
trap 'rm -f "$GECICI"' EXIT
KOD="$(printf 'x-goog-api-key: %s\n' "$ANAHTAR" \
  | curl -sS -o "$GECICI" -w '%{http_code}' --max-time 20 -H @- \
      "https://generativelanguage.googleapis.com/v1beta/models/${MODEL}" || echo '000')"
if [[ "$KOD" != "200" ]]; then
  printf '\n'
  MESAJ="$(node -e 'try{const j=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(j.error?.message??"")}catch{console.log("")}' "$GECICI")"
  kirmizi "✗ Doğrulanamadı (HTTP $KOD). ${MESAJ:-Gemini’ye ulaşılamadı.}"
  kirmizi '  .env DEĞİŞTİRİLMEDİ.'
  exit 1
fi
yesil 'geçerli.'

# ─── .env: yedek + yalnız iki satır ───────────────────────────────────────
umask 077
YEDEK="$ENV_DOSYASI.yedek.$(date +%Y%m%d%H%M%S)"
cp -p "$ENV_DOSYASI" "$YEDEK"
chmod 600 "$YEDEK"
YENI="$(mktemp "$APP_DIR/.env.yedek.gecici.XXXXXX")"
# Değer ortamdan geçiyor, komut satırından değil.
ANAHTAR="$ANAHTAR" MODEL="$MODEL" node -e '
  const fs = require("fs");
  const [kaynak, hedef] = process.argv.slice(1);
  const satirlar = fs.readFileSync(kaynak, "utf8").replace(/\n+$/, "").split("\n");
  const yaz = { GEMINI_API_KEY: process.env.ANAHTAR, GEMINI_MODEL: process.env.MODEL };
  const yazildi = new Set();
  const cikti = satirlar.map((s) => {
    const m = /^([A-Z_][A-Z0-9_]*)=/.exec(s);
    if (m && m[1] in yaz) { yazildi.add(m[1]); return `${m[1]}="${yaz[m[1]]}"`; }
    return s;
  });
  for (const [k, v] of Object.entries(yaz)) if (!yazildi.has(k)) cikti.push(`${k}="${v}"`);
  fs.writeFileSync(hedef, cikti.join("\n").replace(/\n*$/, "\n"), { mode: 0o600 });
' "$ENV_DOSYASI" "$YENI"
mv "$YENI" "$ENV_DOSYASI"
chmod 600 "$ENV_DOSYASI"
yesil "✓ .env güncellendi (yedek: $(basename "$YEDEK"))."

# ─── Yalnız Advetics süreçleri ────────────────────────────────────────────
if command -v pm2 >/dev/null && pm2 describe advetics-api >/dev/null 2>&1; then
  cd "$APP_DIR"
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
  pm2 restart advetics-api advetics-worker --update-env >/dev/null
  pm2 save --force >/dev/null
  yesil '✓ advetics-api ve advetics-worker yeni anahtarla yeniden başlatıldı.'
else
  kirmizi '! pm2 süreçleri bulunamadı; bir sonraki deploy anahtarı alacak.'
fi
unset ANAHTAR
yesil "Bitti. Model: $MODEL"
