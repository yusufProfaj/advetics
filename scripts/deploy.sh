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

# ROOT İLE ÇALIŞTIRMA YASAK.
#
# Bu sunucu paylaşımlıdır ve root'un pm2'si başka sitelerin canlı süreçlerini
# yönetir. Bu script root olarak çalışırsa `pm2 startOrReload` ve `pm2 save`
# root'un süreç listesine ve /root/.pm2/dump.pm2 dosyasına yazar — yani
# başkasının üretimine. Bir kez oldu: root'un dump'ı yalnızca Advetics'in iki
# süreciyle kaldı, sunucu yeniden başladığında diğer 6 site kalkmayacaktı.
if [[ $EUID -eq 0 ]]; then
  printf '\n\033[0;31m✗ Bu script root ile çalıştırılamaz.\033[0m\n' >&2
  cat >&2 <<'EOF'

  Sunucu paylaşımlı: root'un pm2'si başka sitelerin süreçlerini yönetiyor.
  Root olarak çalıştırmak onların süreç listesini ve kayıtlı dump'ını bozar.

  Site kullanıcısına geç:
      su - advetics
      cd ~/htdocs/advetics.com && ./scripts/deploy.sh

EOF
  exit 1
fi

# nvm ile kurulmuş Node'u yükle.
#
# Sistem Node'u diğer sitelere ait; Advetics kendi sürümünü site kullanıcısının
# nvm'inde tutuyor. nvm yalnızca interaktif login shell'de PATH'e girer, oysa
# GitHub Actions SSH ile non-interactive shell açar — bu yüzden burada açıkça
# yüklüyoruz.
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
fi

API_PORT="${API_PORT:-3599}"
WEB_PORT="${WEB_PORT:-3598}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"

# ADIM SÜRELERİ LOG'A YAZILIYOR. 40 dakika süren bir deploy'da hangi adımın
# uzadığı bilinmiyordu; `log` yeni adımı açarken bir öncekinin süresini basıyor.
DEPLOY_BAS=$SECONDS
ADIM_ADI=""
ADIM_BAS=$SECONDS
adim_kapat() {
  [[ -n "$ADIM_ADI" ]] && printf '  \033[2m⏱ %s: %ss\033[0m\n' "$ADIM_ADI" "$((SECONDS - ADIM_BAS))"
  return 0
}
log()  { adim_kapat; ADIM_ADI="$*"; ADIM_BAS=$SECONDS; printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }
ok()   { printf '  \033[0;32m✓\033[0m %s\n' "$*"; }
warn() { printf '  \033[0;33m!\033[0m %s\n' "$*"; }
die()  { printf '\n\033[0;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ─── AYNI ANDA İKİ DEPLOY YOK ───────────────────────────────────────────────
#
# İki geliştirici var ve ikisi de deploy edebiliyor. İki deploy üst üste
# binince yük iki katına çıkıyor, ikisi aynı `.next`e yazıyor ve migration
# yarım şemayla derlenen bir sürüme denk gelebiliyor. Kilit /home/advetics
# altında, yani yalnızca bizim kullanıcımızı ilgilendiriyor. `flock` çekirdek
# kilidi: süreç ölünce kendiliğinden bırakılıyor, elle silinecek bayat dosya
# yok. Dosya tanıtıcısı alt süreçlere de geçiyor; deploy öldürülüp `next build`
# yetim kaldıysa o da bitene kadar kilit tutuluyor ve bu doğru: derleme
# hâlâ makineyi yoruyor.
KILIT="$HOME/.advetics-deploy.lock"
if command -v flock >/dev/null; then
  exec 9>"$KILIT"
  if ! flock -n 9; then
    printf '\n\033[0;31m✗ Başka bir deploy zaten çalışıyor.\033[0m\n' >&2
    printf '  Görmek için:  ps -u %s -o pid,etime,cmd | grep -E "deploy|next build" | grep -v grep\n' "$(id -un)" >&2
    exit 1
  fi
else
  printf '  \033[0;33m!\033[0m flock yok, eşzamanlı deploy kilidi devre dışı\n'
fi

# ─── DERLEME DÜŞÜK ÖNCELİKLE ────────────────────────────────────────────────
#
# Sunucu paylaşımlı. Next.js derlemesi bütün çekirdekleri dakikalarca
# dolduruyor ve diğer sitelerin istekleri onun arkasında bekliyordu.
# Yalnızca DERLEME ve KURULUM komutları sarılıyor; pm2 ve migration değil.
# Bütün script'i `renice` etmek pm2 daemon'ı (çalışmıyorsa bu script
# başlatıyor) ve dolayısıyla CANLI süreçleri de düşük öncelikte bırakırdı.
# ionice sınıf 3 (idle) kullanılmıyor: meşgul bir diskte derlemeyi hiç
# bitirmeyebilir, sınıf 2 en düşük seviye yeterli.
DUSUK=(nice -n 10)
command -v ionice >/dev/null && DUSUK+=(ionice -c2 -n7)
dusuk() {
  local ad="$1" bas=$SECONDS
  shift
  "${DUSUK[@]}" "$@"
  printf '  \033[2m⏱ %s: %ss\033[0m\n' "$ad" "$((SECONDS - bas))"
}

PREVIOUS_SHA="$(cat .last-deployed-sha 2>/dev/null || echo '')"
CURRENT_SHA="$(git rev-parse HEAD)"

trap 'on_failure' ERR

on_failure() {
  local code=$?
  adim_kapat
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

# ─── .env SHELL İLE OKUNUYOR: TIRNAKSIZ BOŞLUK DEPLOY'U DÜŞÜRÜYOR ───────────
#
# Aşağıda "Derleme" adımında `. ./.env` var (Prisma CLI'ın doğru veritabanına
# bağlanması için). Yani her DEĞER shell-güvenli olmak zorunda: tırnaksız bir
# değerdeki boşluk, shell için değerin BİTTİĞİ yer. `SMTP_PASS=abcd efgh`
# satırı `abcd` atamasını yapıp `efgh`yi KOMUT olarak çalıştırıyor.
#
# Canlıda tam olarak bu oldu; Google uygulama şifresini `abcd efgh ijkl mnop`
# diye boşluklu gösteriyor ve olduğu gibi yapıştırıldı. Geriye kalan tek iz:
#
#     ./.env: line 97: ncrj: command not found
#     ✗ Dağıtım başarısız (çıkış kodu 127)
#
# Satır numarası var ama HANGİ ANAHTAR olduğu yok, "ncrj" şifrenin ortasından
# bir parça ve mesaj `.env`i suçlu göstermiyor. Kontrol burada — `pnpm install`
# ve derlemeden ÖNCE: bedeli iki dakika değil bir saniye.
#
# DEĞER ASLA YAZDIRILMIYOR (`cut -d= -f1`): `.env` parola taşıyor ve deploy
# çıktısı ekran görüntüsüyle paylaşılıyor.
#
# Yüklem: satır bir anahtarla başlıyor, değeri TIRNAKLA BAŞLAMIYOR ve içinde
# ardından başka karakter gelen bir boşluk var. Sondaki tek bir boşluk
# (`FOO=bar `) shell için zararsız, o yüzden `[^[:space:]]` şart.
env_bozuk_satirlar="$(grep -nE "^[A-Za-z_][A-Za-z0-9_]*=[^\"']*[[:space:]]+[^[:space:]]" .env | cut -d= -f1 || true)"
if [[ -n "$env_bozuk_satirlar" ]]; then
  printf '\n\033[0;31m✗ .env: tırnaksız değer içinde boşluk\033[0m\n' >&2
  printf '  Aşağıdaki satırların DEĞERİ tırnak içine alınmalı (değerler gizli tutuldu):\n' >&2
  printf '    %s\n' $env_bozuk_satirlar >&2
  printf '\n  Örnek:  SMTP_PASS=abcd efgh   →   SMTP_PASS="abcdefgh"\n' >&2
  printf '  Gmail uygulama şifresindeki BOŞLUKLARI SİL, sonra tırnağa al.\n' >&2
  exit 1
fi
ok ".env shell-güvenli"

command -v node >/dev/null || die "node bulunamadı"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 22 ]] || die "Node.js 22+ gerekli, kurulu sürüm: $(node -v)"

if ! command -v pnpm >/dev/null; then
  corepack enable pnpm >/dev/null 2>&1 || die "pnpm yok ve corepack ile etkinleştirilemedi"
fi
command -v pm2 >/dev/null || die "pm2 bulunamadı (npm install -g pm2)"

ok "node $(node -v) · pnpm $(pnpm -v) · pm2 $(pm2 -v)"

# BELLEK UYARISI. Derleme belleğe sığmayınca swap'a düşüyor ve dakikalar
# saatlere dönüyor; dışarıdan bakınca "CPU %65, hâlâ çalışıyor" gibi
# görünüyor. Durdurmuyor (bellek dalgalanıyor), ama log'da sebebi baştan
# yazıyor.
if [[ -r /proc/meminfo ]]; then
  BOS_MB=$(awk '/^MemAvailable:/ {print int($2/1024)}' /proc/meminfo)
  SWAP_TOPLAM=$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)
  SWAP_BOS=$(awk '/^SwapFree:/ {print $2}' /proc/meminfo)
  ok "kullanılabilir bellek: ${BOS_MB} MB"
  if (( BOS_MB < 1500 )); then
    warn "Kullanılabilir bellek ${BOS_MB} MB. Panel derlemesi swap'a düşüp çok uzayabilir."
    warn "Yük düşükken çalıştırmayı düşün:  free -m && cat /proc/loadavg"
  fi
  if (( SWAP_TOPLAM > 0 && SWAP_BOS * 2 < SWAP_TOPLAM )); then
    warn "Swap yarıdan fazla dolu ($(( (SWAP_TOPLAM - SWAP_BOS) / 1024 )) / $(( SWAP_TOPLAM / 1024 )) MB)."
  fi
fi
ok "commit $(git rev-parse --short HEAD) — $(git log -1 --pretty=%s | head -c 60)"

# -----------------------------------------------------------------------------
log "Bağımlılıklar"
# -----------------------------------------------------------------------------
# --frozen-lockfile: lockfile ile package.json uyuşmazsa BAŞARISIZ olur.
# Üretimde sessizce farklı bir sürüm kurulmasındansa dağıtımın durması iyidir.
#
# --prod=false: devDependencies ZORUNLU, çünkü DERLEME SUNUCUDA YAPILIYOR.
# prisma CLI, @nestjs/cli, typescript, tailwind — hepsi devDependency.
#
# Bayrak olmadan pnpm kararı `NODE_ENV`e bakarak veriyor ve ortamda
# `NODE_ENV=production` varsa devDependencies'i ATLIYOR. Sonuç, sebebini hiç
# anlatmayan bir hata:
#
#     apps/api postinstall$ prisma generate
#     sh: 1: prisma: not found
#
# Bu üretimde yaşandı ve tetikleyicisi masum bir teşhis komutuydu:
# `set -a && . ./.env && set +a` — sunucudaki `.env` `NODE_ENV=production`
# taşıyor (bkz. site-setup.sh) ve o satır kabuğa sızınca bir sonraki deploy
# düşüyor. Aynı dosyayı bu script de aşağıda okuyor, yani tuzak kendi
# içimizde duruyordu.
#
# Bayrak kararı ortamdan alıp BURAYA taşıyor: ne kurulacağı dağıtımın kendi
# bilgisi, kabuğun değil.
dusuk "pnpm install" pnpm install --frozen-lockfile --prod=false
ok "kuruldu (devDependencies dâhil — derleme sunucuda yapılıyor)"

# -----------------------------------------------------------------------------
log "Derleme"
# -----------------------------------------------------------------------------
# Kök .env'i ortama aktar — Prisma CLI kendi dizinindeki .env'i yükler ve
# apps/api/.env ile ayrışırsa yanlış veritabanına bağlanır. Ortam değişkeni
# dosyadan önce geldiği için export etmek tek doğruluk kaynağını dayatır.
set -a
# shellcheck disable=SC1091
. ./.env
set +a

# Sıra önemli: shared paketi diğer ikisinin tip kaynağı.
dusuk "shared" pnpm --filter @advetics/shared build
dusuk "prisma generate" pnpm --filter @advetics/api exec prisma generate
dusuk "api" pnpm --filter @advetics/api build

# Next.js NEXT_PUBLIC_* değerlerini bu adımda koda gömer — .env doğru olmalı.
#
# PANEL AYRI KLASÖRE DERLENİYOR (`next.config.ts` → `distDir`). Canlı süreç
# `.next`i okumaya devam ediyor; yer değiştirme süreçler yeniden başlamadan
# HEMEN ÖNCE yapılıyor. Derleme ya da migration düşerse canlı panele
# dokunulmamış oluyor. Önceki yarım bir derlemenin artığı önce siliniyor:
# Next eski dosyaların üstüne yazar ama silinmiş sayfaların çıktısını bırakır.
WEB_DIR="apps/web"
rm -rf "$WEB_DIR/.next-derleme"
NEXT_DIST_DIR=.next-derleme dusuk "web" pnpm --filter @advetics/web build
# Next derleme sırasında `tsconfig.json`a ve `next-env.d.ts`e KENDİ klasör
# adını yazıyor (`.next-derleme/types`). İkisi de depoda izleniyor: geri
# alınmazsa sunucudaki çalışma ağacı kirli kalıyor ve bir sonraki `git pull`
# "local changes would be overwritten" ile düşüyor. Yerelde ölçüldü.
git checkout -- "$WEB_DIR/tsconfig.json" "$WEB_DIR/next-env.d.ts"
[[ -f "$WEB_DIR/.next-derleme/BUILD_ID" ]] || die "panel derlemesi BUILD_ID üretmedi ($WEB_DIR/.next-derleme)"
ok "api + web derlendi (panel $WEB_DIR/.next-derleme içinde bekliyor)"

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
# Panelin yeni derlemesi şimdi devreye giriyor. Önceki `.next` bir deploy
# boyunca `.next-eski` olarak duruyor (elle geri dönüş için), sonrakinde
# siliniyor. İki `mv` arasındaki pencere milisaniye; pm2 zaten hemen ardından
# süreci yeniden başlatıyor.
rm -rf "$WEB_DIR/.next-eski"
[[ -d "$WEB_DIR/.next" ]] && mv "$WEB_DIR/.next" "$WEB_DIR/.next-eski"
mv "$WEB_DIR/.next-derleme" "$WEB_DIR/.next"
ok "panel derlemesi devreye alındı ($(cat "$WEB_DIR/.next/BUILD_ID"))"

pm2 startOrReload ecosystem.config.js --update-env
pm2 save --force >/dev/null
ok "advetics-api · advetics-web · advetics-worker"

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

# Worker HTTP dinlemiyor — sağlığı pm2 durumundan okunuyor.
#
# Redis eksik veya erişilemezse worker kasıtlı olarak ölüyor (Redis'siz worker
# hiçbir iş almaz; sessizce ayakta durup boş beklemesi en zor teşhis edilen
# arıza olurdu). API böyle davranmıyor — o Redis olmadan da çalışır.
WORKER_STATUS="$(pm2 jlist 2>/dev/null \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{const a=JSON.parse(d).find(x=>x.name==="advetics-worker");console.log(a?a.pm2_env.status:"yok")}catch{console.log("okunamadı")}})' \
  || echo 'okunamadı')"
if [[ "$WORKER_STATUS" == "online" ]]; then
  ok "Worker çalışıyor (senkronizasyon kuyruğu aktif)"
else
  warn "advetics-worker durumu: $WORKER_STATUS"
  warn "Senkronizasyon işleri ÇALIŞMIYOR. Log: pm2 logs advetics-worker --lines 40"
  # En sık nedeni bu, kontrol etmek ucuz.
  if ! grep -qE '^\s*REDIS_URL\s*=\s*".+"' .env 2>/dev/null; then
    warn ".env dosyasında REDIS_URL yok — worker Redis olmadan başlayamaz."
    warn "Örnek satırlar için: .env.example (Modül 3 bölümü)"
  fi
fi

# RLS'in gerçekten devrede olduğunu doğrula. /api/health/rls oturum gerektirdiği
# için 401 beklenir — 401 ALMAK BAŞARIDIR: endpoint ayakta ve korunuyor demektir.
RLS_STATUS="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${API_PORT}/api/health/rls" || true)"
if [[ "$RLS_STATUS" == "401" ]]; then
  ok "RLS endpoint'i korunuyor (401)"
else
  warn "RLS endpoint'i beklenmedik durum kodu döndü: $RLS_STATUS (beklenen 401)"
fi

echo "$CURRENT_SHA" > .last-deployed-sha
trap - ERR

adim_kapat
printf '\n\033[0;32m✓ Dağıtım tamamlandı\033[0m — %s · toplam %ss\n\n' "$(git rev-parse --short HEAD)" "$((SECONDS - DEPLOY_BAS))"
