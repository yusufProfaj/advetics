#!/usr/bin/env bash
#
# ═══ LINKEDIN ÖLÇÜM TURU — kod yazmadan ÖNCE ═══
#
# Bu script HİÇBİR ŞEY YAZMIYOR. Yalnızca GET çağrıları yapıyor ve LinkedIn
# dokümanının KENDİ İÇİNDE ÇELİŞTİĞİ yerleri ölçüyor.
#
# NEDEN VAR: `google-check` ile aynı gerekçe. Google entegrasyonunda tam
# senkronizasyon içinde hangi adımın kırıldığını görmek imkânsızdı ve her alan
# denemesi "kod → commit → deploy → çalıştır" turu demekti. LinkedIn'de durum
# daha kötü: doküman birbiriyle çelişen iki cevap veriyor ve yanlış yarısıyla
# yazılan kodun bedeli bu depoda ölçülmüş durumda.
#
# TOKEN'I BU SCRIPT GÖRMÜYOR, ORTAM DEĞİŞKENİNDEN OKUYOR ve hiçbir yere
# yazmıyor. Çıktıda da yazdırılmıyor.
#
# KULLANIM:
#   export LI_TOKEN='...'          # LinkedIn Developer Portal > OAuth 2.0 tools
#   ./scripts/linkedin-olcum.sh
#
# İsteğe bağlı: bilinen bir reklam hesabı kimliğiyle derin ölçüm
#   export LI_ACCOUNT=123456789
#
set -uo pipefail

VERSIYON="${LI_VERSION:-202608}"
API="https://api.linkedin.com/rest"

if [[ -z "${LI_TOKEN:-}" ]]; then
  echo "LI_TOKEN tanımlı değil."
  echo "LinkedIn Developer Portal > Docs and tools > OAuth 2.0 tools ile token üret."
  exit 1
fi

kirmizi() { printf '\033[0;31m%s\033[0m\n' "$*"; }
yesil()   { printf '\033[0;32m%s\033[0m\n' "$*"; }
baslik()  { printf '\n\033[1;34m▸ %s\033[0m\n' "$*"; }

# Tek bir GET. Gövdeyi ve HTTP kodunu AYRI döndürüyor: LinkedIn hata gövdesini
# 200 ile de döndürebiliyor ve yalnızca koda bakmak yanıltıcı.
li() {
  local yol="$1"; shift
  curl -sS -w '\n__KOD__%{http_code}' \
    -H "Authorization: Bearer ${LI_TOKEN}" \
    -H "LinkedIn-Version: ${VERSIYON}" \
    -H "X-Restli-Protocol-Version: 2.0.0" \
    "$@" \
    "${API}${yol}" 2>&1
}

kod() { sed -n 's/.*__KOD__\([0-9]*\)$/\1/p' <<<"$1"; }
govde() { sed 's/__KOD__[0-9]*$//' <<<"$1"; }

# ─────────────────────────────────────────────────────────────────────────────
baslik "0 · Token kimliği ve scope'lar"
# `/rest/me` bağlantının ADINI üretecek çağrı. Bugün `exchangeCode` tam burada
# duruyor: kimlik çekilemeden bağlantı adsız kaydedilemez.
Y=$(li "/me")
K=$(kod "$Y")
echo "HTTP ${K}"
if [[ "$K" == "200" ]]; then
  govde "$Y" | python3 -c 'import sys,json;d=json.load(sys.stdin);print("  id:",d.get("id","?"));print("  alanlar:",", ".join(sorted(d.keys())))' 2>/dev/null \
    || echo "  (JSON ayrıştırılamadı)"
else
  kirmizi "  /me başarısız — ölçümün geri kalanı anlamsız olabilir"
  govde "$Y" | head -c 400; echo
fi

# ─────────────────────────────────────────────────────────────────────────────
baslik "1 · KRİTİK: 5 HESAP SINIRI OKUMAYI KAPSIYOR MU"
cat <<'ACIKLAMA'
  Developer Portal diyor ki: "The tier assigned to your app defines how many Ad
  Accounts you can MANAGE through the APIs. The maximum is 5."

  "Manage" okumayı da kapsıyor mu, yalnızca yazmayı mı — doküman AYIRMIYOR.
  Ve bu soru Advetics'in havuz modelinin (tek ajans kimliği, yüzlerce hesap)
  Development katmanında raporlama için çalışıp çalışmadığını belirliyor.

  ÖLÇÜM TEMİZ: beyaz liste ŞU AN BOŞ (0/5). Yani —
    · hesap DÖNERSE  → okuma beyaz listeden BAĞIMSIZ, havuz modeli çalışır
    · boş/403 dönerse → sınır okumayı da kapsıyor, plan Aşama 3'te durur
ACIKLAMA
Y=$(li "/adAccountUsers?q=authenticatedUser")
K=$(kod "$Y")
echo "  HTTP ${K}"
if [[ "$K" == "200" ]]; then
  govde "$Y" | python3 -c '
import sys,json
d=json.load(sys.stdin)
els=d.get("elements",[])
print(f"  dönen kayıt: {len(els)}")
print(f"  paging: {d.get(\"paging\",{})}")
for e in els[:5]:
    print(f"    account={e.get(\"account\")} role={e.get(\"role\")}")
' 2>/dev/null || { echo "  ham:"; govde "$Y" | head -c 600; echo; }
else
  govde "$Y" | head -c 600; echo
fi

# ─────────────────────────────────────────────────────────────────────────────
baslik "2 · Sürüm başlığı davranışı"
# Doküman: başlık ZORUNLU, varsayılan YOK, süresi dolmuşsa HTTP 426.
# ARALIK SÜRÜMÜ YOK (…202510, 202511, sonra 202601) — takvimden üreten kod
# her Aralık patlar. Burada eksik ve geçersiz başlığın gerçekten ne döndürdüğü
# ölçülüyor.
echo "  başlıksız:"
curl -sS -o /dev/null -w '    HTTP %{http_code}\n' \
  -H "Authorization: Bearer ${LI_TOKEN}" \
  -H "X-Restli-Protocol-Version: 2.0.0" \
  "${API}/adAccountUsers?q=authenticatedUser"
echo "  geçersiz sürüm (202512 — Aralık sürümü YOK):"
curl -sS -o /dev/null -w '    HTTP %{http_code}\n' \
  -H "Authorization: Bearer ${LI_TOKEN}" \
  -H "LinkedIn-Version: 202512" \
  -H "X-Restli-Protocol-Version: 2.0.0" \
  "${API}/adAccountUsers?q=authenticatedUser"

# ─────────────────────────────────────────────────────────────────────────────
if [[ -n "${LI_ACCOUNT:-}" ]]; then
  baslik "3 · Varlık hiyerarşisi — SEVİYE EŞLEMESİNİN KANITI"
  cat <<'ACIKLAMA'
  Advetics'in eşlemesi: Campaign Group → campaign, Campaign → ad_group,
  Creative → ad. Karar İSME değil ALANLARA dayandı — LinkedIn Campaign
  `targetingCriteria` + `dailyBudget` + `unitCost` taşıyorsa Meta'nın ad set'i
  demektir. Bu blok o alanların GERÇEKTEN geldiğini doğruluyor.
ACIKLAMA
  for u in "adCampaignGroups" "adCampaigns" "creatives"; do
    Y=$(li "/adAccounts/${LI_ACCOUNT}/${u}?q=search&start=0&count=2")
    K=$(kod "$Y")
    echo "  ${u}: HTTP ${K}"
    [[ "$K" == "200" ]] && govde "$Y" | python3 -c '
import sys,json
d=json.load(sys.stdin)
els=d.get("elements",[])
print(f"    kayıt={len(els)}")
if els: print("    alanlar:", ", ".join(sorted(els[0].keys()))[:300])
' 2>/dev/null
  done

  baslik "4 · adAnalytics — GÜNLÜK granülarite ve para BİÇİMİ"
  cat <<'ACIKLAMA'
  Ölçülen üç şey:
   · `timeGranularity=DAILY` gerçekten gün gün satır döndürüyor mu
   · `costInLocalCurrency` STRING mi ve kaç ondalık taşıyor
     (dokümanın örneği "19.91833" — beş ondalık; `parseFloat` kuruş kaydırıyor)
   · yanıtta `paging` görünüyor mu — doküman "Pagination is not supported"
     derken kendi örneklerinde `paging.links[].rel=next` basıyor
ACIKLAMA
  BIT=$(date -u +%Y-%m-%d); BAS=$(date -u -d '7 days ago' +%Y-%m-%d 2>/dev/null || date -u -v-7d +%Y-%m-%d)
  BY=${BAS%%-*}; BA=$(echo "$BAS"|cut -d- -f2); BG=$(echo "$BAS"|cut -d- -f3)
  SY=${BIT%%-*}; SA=$(echo "$BIT"|cut -d- -f2); SG=$(echo "$BIT"|cut -d- -f3)
  Y=$(li "/adAnalytics?q=analytics&pivot=CAMPAIGN&timeGranularity=DAILY&accounts=List(urn%3Ali%3AsponsoredAccount%3A${LI_ACCOUNT})&dateRange=(start:(year:${BY},month:${BA#0},day:${BG#0}),end:(year:${SY},month:${SA#0},day:${SG#0}))&fields=impressions,clicks,costInLocalCurrency,dateRange,pivotValues")
  K=$(kod "$Y")
  echo "  HTTP ${K}"
  govde "$Y" | python3 -c '
import sys,json
d=json.load(sys.stdin)
els=d.get("elements",[])
print(f"  kayıt={len(els)}  paging={\"VAR\" if \"paging\" in d else \"yok\"}")
if els:
    e=els[0]
    c=e.get("costInLocalCurrency")
    print(f"  cost örneği: {c!r}  tip={type(c).__name__}")
    if isinstance(c,str) and "." in c: print(f"  ondalık basamak: {len(c.split(\".\")[1])}")
    print(f"  dateRange taşıyor mu: {\"dateRange\" in e}")
' 2>/dev/null || { echo "  ham:"; govde "$Y" | head -c 700; echo; }
else
  baslik "3-4 · atlandı"
  echo "  LI_ACCOUNT tanımlı değil — hiyerarşi ve adAnalytics ölçümü için"
  echo "  Campaign Manager'daki dokuz haneli hesap kimliğini ver:"
  echo "    export LI_ACCOUNT=123456789"
fi

baslik "Bitti"
echo "Bu çıktıda token YOK. Olduğu gibi paylaşılabilir."
