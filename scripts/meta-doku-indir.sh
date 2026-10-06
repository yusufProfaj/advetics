#!/bin/bash
# Meta "Ads and Commerce" dokümantasyonunu sayfa sayfa "Copy for LLM"
# biçiminde (markdown) indirir: docs/meta-reklam-brief/kaynak/
#
# NEDEN BU YOL: sitedeki "Copy for LLM" düğmesi aynı sayfayı
# `Accept: text/markdown` başlığıyla istiyor. HTML'i kazımak yerine bu
# başlıkla istemek, düğmenin kopyaladığı metnin AYNISINI veriyor.
#
# İki liste birleştiriliyor ve ikisi de gerekli:
#  - /documentation/ads-commerce/llms.txt → yalnızca KILAVUZLARI listeliyor
#    (681 sayfa). Referans sayfaları (Kampanya/Ad set/Reklam alanları) orada YOK.
#  - Gezinme menüsü → referans sayfaları (~390). Menü tarayıcıda kuruluyor,
#    curl ile alınamıyor; listesi bu betiğin yanındaki dosyada sabit duruyor.
#
# Ham sayfalar DEPOYA GİRMİYOR (.gitignore): 10 MB Meta metni ve depo herkese
# açık. Brief'in kendisi (bolumler/, README) depoda.
#
# Bazı sayfaların markdown sürümü yok (Meta'nın sitesinde de boş açılıyor);
# onlar `kaynak/_basarisiz.txt`e yazılıyor, sessizce atlanmıyor.
set -euo pipefail
cd "$(dirname "$0")/.."
HEDEF=docs/meta-reklam-brief/kaynak
REF_LISTE=docs/meta-reklam-brief/referans-sayfalari.txt
mkdir -p "$HEDEF"
: > "$HEDEF/_basarisiz.txt"

{
  curl -s -A "Mozilla/5.0" https://developers.facebook.com/documentation/ads-commerce/llms.txt \
    | grep -oE 'https://developers\.facebook\.com/documentation/ads-commerce/[^)]+\.md' \
    | sed 's/\.md$//'
  cat "$REF_LISTE"
} | sort -u > "$HEDEF/_urller.txt"

indir() {
  u="$1"; hedef="$2"
  f="$hedef/$(echo "$u" | sed 's#https://developers.facebook.com/documentation/ads-commerce/##; s#/#__#g').md"
  [ -s "$f" ] && return 0
  for _ in 1 2 3; do
    kod=$(curl -s -m 40 -H "Accept: text/markdown" -A "Mozilla/5.0" -w "%{http_code}" -o "$f.tmp" "$u" || true)
    # 200 dönüp HTML gövde gelmesi = o sayfanın markdown sürümü yok.
    if [ "$kod" = 200 ] && ! head -c 200 "$f.tmp" | grep -qi '<html'; then
      { echo "<!-- kaynak: $u -->"; cat "$f.tmp"; } > "$f"; rm -f "$f.tmp"; return 0
    fi
    sleep 2
  done
  rm -f "$f.tmp"; echo "$kod $u" >> "$hedef/_basarisiz.txt"
}
export -f indir

# 8 paralel istek: tamamı ~5 dakika. Daha fazlası Meta'yı zorlamaya başlar.
xargs -P 8 -I{} bash -c 'indir "$1" "$2"' _ {} "$HEDEF" < "$HEDEF/_urller.txt"

echo "İndirilen: $(ls "$HEDEF"/*.md | wc -l) · Liste: $(wc -l < "$HEDEF/_urller.txt") · Markdown'ı olmayan: $(wc -l < "$HEDEF/_basarisiz.txt")"
