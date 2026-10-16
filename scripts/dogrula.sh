#!/usr/bin/env bash
# ═══ YEREL DOĞRULAMA — GitHub "Doğrulama" (dogrula.yml) ile AYNI ADIMLAR ═══
#
# Döngü ve geliştirici işin doğru olduğunu tek komutla görebilsin diye.
# `pnpm` her makinede PATH'te değil (2026-10-14: yoktu ve kök betikler
# koşmuyordu); bu yüzden her paket kendi dizininde `npx` ile koşuyor.
#
# SIRA CI ile aynı ve bilinçli:
#   1. shared derlemesi ÇIKTISIYLA (CLAUDE.md: çıktı yutulursa API/panel
#      bayat `dist`i okuyup yeşil geçer, hata deploy'da patlar)
#   2. prisma generate (eski istemci yüzlerce sahte tip hatası üretir)
#   3. tip kontrolü (shared, api, web)
#   4. panel testleri
#   5. API testleri TEK BAŞINA (PGlite paralel koşunca sahte exit=1)
#   6. --derle verilirse derleme (yavaş; next build `.next-derleme`e yazar)
#
# Ağa çıkmaz, veritabanına bağlanmaz, hiçbir şeyi silmez veya göndermez.
# İlk hata durdurur (set -e) ve hangi adımın düştüğü yazar.
set -euo pipefail
# AĞA ÇIKMA: Prisma her koşuda güncelleme kontrolü için dışarı istek atıyor
# ("Update available" kutusu); `npx --no-install` eksik paketi indirmek
# yerine düşer. Döngü bu betiği onaysız koşuyor, dışarıya istek atmamalı.
export CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1
NPX="npx --no-install"
KOK="$(cd "$(dirname "$0")/.." && pwd)"
DERLE=0
[[ "${1:-}" == "--derle" ]] && DERLE=1

adim() { printf '\n\033[1;34m▸ %s\033[0m\n' "$1"; }

# TESTİ KOŞ, ÖZETİ VE DÜŞENİN ADINI YAZ. Eskiden yalnız `tail -5` vardı:
# bir test ara sıra düştüğünde (2026-10-15 gecesi iki kez, tekrarında
# yeşil) HANGİSİ olduğu hiçbir yerde görünmüyordu ve iz kayboluyordu.
# Tam çıktı geçici dosyada; düşen dosya/test satırları ve hata başlıkları
# özetin üstüne basılıyor. Çıkış kodu vitest'in kendisi (pipefail).
test_kos() {
  local cikti
  cikti="$(mktemp -t dogrula-test.XXXXXX)"
  local kod=0
  $NPX vitest run >"$cikti" 2>&1 || kod=$?
  grep -aE '^ FAIL |^ +× |AssertionError|Error: ' "$cikti" | head -20 || true
  tail -5 "$cikti"
  [[ $kod -ne 0 ]] && echo "Tam çıktı: $cikti"
  return $kod
}
# DERLEME ÇIKTISI YALNIZ DÜŞÜNCE. `next build` yeşilde yüzlerce satırlık
# rota tablosu basıyor ve bu betiği koşan ajanın bağlamına giriyordu
# (token düzeni, 2026-10-16). Çıktı YUTULMUYOR: düşerse son 60 satır
# ekranda, tamamı geçici dosyada.
derle_kos() {
  local cikti kod=0
  cikti="$(mktemp -t dogrula-derle.XXXXXX)"
  "$@" >"$cikti" 2>&1 || kod=$?
  if [[ $kod -ne 0 ]]; then tail -60 "$cikti"; echo "Tam çıktı: $cikti"; else echo "tamam ($(wc -l <"$cikti" | tr -d ' ') satır çıktı: $cikti)"; fi
  return $kod
}
trap 'printf "\n\033[0;31m✗ Doğrulama düştü: %s\033[0m\n" "${SON_ADIM:-?}"' ERR

SON_ADIM="shared derlemesi"; adim "$SON_ADIM"
(cd "$KOK" && $NPX tsc -p packages/shared/tsconfig.json)

SON_ADIM="prisma istemcisi"; adim "$SON_ADIM"
(cd "$KOK/apps/api" && $NPX prisma generate >/dev/null && echo "prisma generate tamam")

SON_ADIM="tip kontrolü (api)"; adim "$SON_ADIM"
(cd "$KOK/apps/api" && $NPX tsc --noEmit -p tsconfig.spec.json)
SON_ADIM="tip kontrolü (web)"; adim "$SON_ADIM"
(cd "$KOK/apps/web" && $NPX tsc --noEmit -p tsconfig.json)

SON_ADIM="panel testleri"; adim "$SON_ADIM"
(cd "$KOK/apps/web" && test_kos)

SON_ADIM="API testleri (tek başına)"; adim "$SON_ADIM"
(cd "$KOK/apps/api" && test_kos)

if [[ $DERLE -eq 1 ]]; then
  SON_ADIM="derleme (api)"; adim "$SON_ADIM"
  (cd "$KOK/apps/api" && derle_kos $NPX nest build)
  SON_ADIM="derleme (web)"; adim "$SON_ADIM"
  (cd "$KOK/apps/web" && derle_kos $NPX next build)
fi

printf '\n\033[0;32m✓ Doğrulama geçti\033[0m%s\n' "$([[ $DERLE -eq 1 ]] && echo ' (derleme dahil)' || echo ' (derleme hariç; --derle ile dahil)')"
