#!/usr/bin/env bash
# =============================================================================
# CLAUDE'UN DEPLOY İÇİN SSH ERİŞİMİ — BU MAC'TE BİR KEZ ÇALIŞTIRILIR
# =============================================================================
#
# Kural (2026-10-09): Claude commit + push yapıyor, "Sunucuya deploy edelim
# mi?" diye soruyor, "evet" gelirse deploy'u SSH ile kendisi yapıyor. Bu
# betik o erişimi kuruyor ve bilgileri TEK TEK soruyor.
#
# NEDEN ANAHTAR, NEDEN PAROLA DEĞİL: parola sohbete yazılmamalı ve Claude
# parolayla giriş yapmamalı. Parolayı burada SEN, bir kez, kendi terminalinde
# giriyorsun (ekranda görünmez); sonrası anahtarla.
#
# SUNUCU ADRESİ DEPOYA YAZILMIYOR: yalnızca bu Mac'in ~/.ssh/config dosyasına
# (`Host advetics-sunucu`). Depo herkese açık ve adres saldırı yüzeyi
# (CLAUDE.md §1).
#
# ROOT REDDEDİLİYOR: deploy yalnızca `advetics` kullanıcısıyla (CLAUDE.md §1).
#
# Geri almak: sunucuda ~/.ssh/authorized_keys içindeki `claude-deploy@…`
# satırını sil.
set -euo pipefail

ANAHTAR="$HOME/.ssh/advetics_claude"
TAKMA_AD="advetics-sunucu"
CONFIG="$HOME/.ssh/config"

renk() { printf '\033[%sm%s\033[0m\n' "$1" "$2"; }
adim() { printf '\n'; renk '1;34' "▸ $1"; }
tamam() { renk '0;32' "  ✓ $1"; }
hata() { renk '0;31' "  ✗ $1" >&2; exit 1; }

mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"

adim "1/5 · Anahtar"
if [[ -f "$ANAHTAR" ]]; then
  tamam "Var: $ANAHTAR"
else
  ssh-keygen -q -t ed25519 -N "" -C "claude-deploy@$(hostname -s)-$(date +%Y%m%d)" -f "$ANAHTAR"
  tamam "Üretildi: $ANAHTAR"
fi
# Sunucuya eklenecek satır: yönlendirme ve tünel kapalı, yalnızca giriş.
SATIR="no-port-forwarding,no-agent-forwarding,no-X11-forwarding $(cat "$ANAHTAR.pub")"

adim "2/5 · Sunucu bilgileri"
read -r -p "  Sunucu adresi (IP ya da alan adı, yalnızca adres): " ADRES
ADRES="${ADRES// /}"
# "kullanici@adres" yazıldıysa ikiye ayır: alışkanlıkla `ssh` komutundaki
# biçim yazılıyor ve olduğu gibi kaydedilince adres çözülemiyordu.
ONERILEN_KULLANICI="advetics"
if [[ "$ADRES" == *@* ]]; then
  ONERILEN_KULLANICI="${ADRES%%@*}"
  ADRES="${ADRES#*@}"
  echo "  (adres '$ADRES', kullanıcı '$ONERILEN_KULLANICI' olarak ayrıldı)"
fi
# "adres:port" yazıldıysa portu da ayır.
ONERILEN_PORT=22
if [[ "$ADRES" =~ ^([^:]+):([0-9]+)$ ]]; then
  ADRES="${BASH_REMATCH[1]}"
  ONERILEN_PORT="${BASH_REMATCH[2]}"
fi
[[ -n "$ADRES" ]] || hata "Adres boş olamaz."

read -r -p "  SSH portu [$ONERILEN_PORT]: " PORT
PORT="${PORT:-$ONERILEN_PORT}"
[[ "$PORT" =~ ^[0-9]+$ ]] || hata "Port yalnızca rakam olmalı."

read -r -p "  Kullanıcı adı [$ONERILEN_KULLANICI]: " KULLANICI
KULLANICI="${KULLANICI:-$ONERILEN_KULLANICI}"
[[ "$KULLANICI" != "root" ]] || hata "root ile deploy YASAK (sunucu paylaşımlı). advetics kullanıcısını gir."

adim "3/5 · SSH ayarı (~/.ssh/config)"
touch "$CONFIG" && chmod 600 "$CONFIG"
if grep -qE "^Host[[:space:]]+$TAKMA_AD\$" "$CONFIG"; then
  read -r -p "  '$TAKMA_AD' kaydı zaten var. Üzerine yazılsın mı? [e/H]: " CEVAP
  [[ "$CEVAP" =~ ^[eE] ]] || hata "Değiştirilmedi. Çıkılıyor."
  # Eski bloğu sil: Host satırından bir sonraki Host satırına kadar.
  awk -v ad="$TAKMA_AD" '
    $1=="Host" { atla = ($2==ad) }
    !atla { print }
  ' "$CONFIG" > "$CONFIG.yeni" && mv "$CONFIG.yeni" "$CONFIG" && chmod 600 "$CONFIG"
fi
cat >> "$CONFIG" <<EOF

Host $TAKMA_AD
  HostName $ADRES
  Port $PORT
  User $KULLANICI
  IdentityFile $ANAHTAR
  IdentitiesOnly yes
  ServerAliveInterval 30
EOF
tamam "Kaydedildi (Host $TAKMA_AD)"

adim "4/5 · Anahtar sunucuya ekleniyor"
if ssh -o BatchMode=yes -o ConnectTimeout=10 "$TAKMA_AD" true 2>/dev/null; then
  tamam "Anahtar zaten tanımlı; parola gerekmedi."
else
  echo "  İlk bağlantıda sunucunun parmak izi sorulabilir: 'yes' yaz."
  echo "  Ardından $KULLANICI kullanıcısının PAROLASI sorulacak (yazarken ekranda görünmez)."
  # Satır zaten varsa ikinci kez eklenmiyor.
  printf '%s\n' "$SATIR" | ssh -o PreferredAuthentications=keyboard-interactive,password -o PubkeyAuthentication=no "$TAKMA_AD" '
    set -e
    mkdir -p ~/.ssh && chmod 700 ~/.ssh
    touch ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys
    read -r satir
    grep -qxF "$satir" ~/.ssh/authorized_keys || printf "%s\n" "$satir" >> ~/.ssh/authorized_keys
  ' || hata "Anahtar eklenemedi. Parola yanlış olabilir ya da sunucu parolayla girişe kapalı (o durumda CloudPanel > site kullanıcısı > SSH anahtarlarına şu satırı ekle: cat $ANAHTAR.pub)."
  tamam "Eklendi"
fi

adim "5/5 · Deneme (parolasız)"
SONUC="$(ssh -o BatchMode=yes -o ConnectTimeout=10 "$TAKMA_AD" 'whoami; test -d ~/htdocs/advetics.com && echo klasor-var || echo klasor-yok')" \
  || hata "Anahtarla giriş olmadı."
KIM="$(printf '%s\n' "$SONUC" | sed -n 1p)"
KLASOR="$(printf '%s\n' "$SONUC" | sed -n 2p)"
[[ "$KIM" == "advetics" ]] || hata "Giriş '$KIM' olarak yapıldı; advetics olmalı."
[[ "$KLASOR" == "klasor-var" ]] || hata "~/htdocs/advetics.com bulunamadı."
tamam "Giriş: $KIM · ~/htdocs/advetics.com mevcut"

printf '\n'
renk '1;32' "Hazır. Claude'a 'hazır' yazabilirsin."
