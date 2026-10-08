# Advetics Okuma API: yapay zekâya MCP sunucusu olarak bağlanma

Advetics'in reklam verisini (Meta, Google, LinkedIn) Claude, Cursor gibi yapay
zekâ araçlarına **salt okunur** bir MCP sunucusu olarak açar. Yapay zekâ
ajansın bütün üst hesaplarını, şirketlerini ve workspace'lerini okuyabilir;
**hiçbir şeyi değiştiremez** (kampanya açamaz, durduramaz, bütçe değiştiremez).

- Yalnızca **platform sahibi** hesap (`hello@profaj.com`) anahtar
  oluşturabilir. Ekran: **Ayarlar › Okuma API** (başka hiçbir hesapta görünmez).
- MCP adresi: **`https://advetics.com/api/mcp`**
- REST adresi (aynı araçlar): `https://advetics.com/api/okuma/araclar/<araç>`

---

## 1. Önce bir kez: sunucu kurulumu

Bu özellik bir migration ve RLS güncellemesi taşıyor. Deploy her zamanki gibi
(`CLAUDE.md` §1): `advetics` kullanıcısıyla, `git pull` → `./scripts/deploy.sh`
(migration + `db:rls` script'in içinde).

`hello@profaj.com` platform sahibi değilse (sunucuda, `advetics` kullanıcısı,
depo kökünde):

```bash
pnpm --filter @advetics/api db:platform-admin -- --liste
```

```bash
pnpm --filter @advetics/api db:platform-admin -- --eposta=hello@profaj.com
```

İlk komut bugünkü platform sahiplerini listeler. **Okuma API ekranını, platform
sahibi olan HER hesap görür**; yalnızca hello'nun görmesini istiyorsan listede
başka hesap kalmamalı (`--eposta=... --kaldir`).

## 2. Anahtar oluştur

1. `hello@profaj.com` ile panele gir → **Ayarlar › Okuma API**.
2. Ad ver (örn. "Claude Desktop, dizüstü"), geçerlilik seç (30 / 90 / 365 gün
   ya da süresiz) → **Anahtar oluştur**.
3. Anahtar (`adv_ro_…`) **yalnızca bir kez** gösterilir. Sunucu yalnızca
   özetini saklar; kaybedersen iptal edip yenisini oluştur.
4. Aynı ekrandaki **Bağlan** bölümü aşağıdaki komutları anahtarla doldurulmuş
   olarak verir; kopyala-yapıştır yeterli.

Her araç / bilgisayar için **ayrı anahtar** oluştur: biri sızarsa yalnızca onu
iptal edersin. Tabloda her anahtarın son kullanım zamanı ve IP'si görünür.

## 3. Yapay zekâya bağla

Aşağıda `adv_ro_ANAHTARINIZ` yerine kendi anahtarını yaz.

### Claude Code (terminal / masaüstü uygulamasının Code sekmesi)

```bash
claude mcp add --transport http --scope user advetics https://advetics.com/api/mcp --header "Authorization: Bearer adv_ro_ANAHTARINIZ"
```

Kontrol: Claude Code içinde `/mcp` yaz; `advetics` bağlı ve 9 araç görünmeli.
`--scope user` bütün projelerde kullanılabilir yapar; yalnız bu klasör için
`--scope local` kullan. Kaldırmak için:

```bash
claude mcp remove advetics
```

### Claude Desktop

Claude Desktop yerel (stdio) sunucuları çalıştırır; uzak sunucuya
`mcp-remote` köprüsüyle bağlanılır. Bilgisayarda **Node.js** kurulu olmalı.

1. Claude Desktop → **Ayarlar › Geliştirici › Yapılandırmayı düzenle**
   (`claude_desktop_config.json` açılır).
2. Şunu ekle (dosyada başka sunucular varsa `mcpServers` içine birleştir):

```json
{
  "mcpServers": {
    "advetics": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://advetics.com/api/mcp",
        "--header",
        "Authorization:${ADVETICS_YETKI}"
      ],
      "env": {
        "ADVETICS_YETKI": "Bearer adv_ro_ANAHTARINIZ"
      }
    }
  }
}
```

3. Claude Desktop'ı tamamen kapatıp yeniden aç. Sohbet kutusundaki araç
   simgesinde `advetics` görünmeli.

> Başlık `Authorization:${ADVETICS_YETKI}` biçiminde, boşluksuz yazılıyor ve
> değer ortam değişkeninden geliyor: bazı sistemler (özellikle Windows)
> argümandaki boşluğu bölüp başlığı bozuyor.

### Cursor

`~/.cursor/mcp.json` (ya da proje içinde `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "advetics": {
      "url": "https://advetics.com/api/mcp",
      "headers": { "Authorization": "Bearer adv_ro_ANAHTARINIZ" }
    }
  }
}
```

Uzak HTTP MCP sunucusunu **özel başlıkla** destekleyen diğer istemciler
(Windsurf, VS Code, n8n'in MCP düğümü…) aynı adres ve başlıkla bağlanır.

### claude.ai web ve mobil "Özel bağlayıcı"

**Desteklenmiyor.** claude.ai'nin özel bağlayıcıları kimlik doğrulama için
OAuth istiyor; bu sunucu sabit bir Bearer anahtarıyla çalışıyor. Web ve
mobilde kullanmak istersen Claude Desktop ya da Claude Code kullan.

## 4. Bağlantıyı test et

```bash
curl -s https://advetics.com/api/mcp -H "Authorization: Bearer adv_ro_ANAHTARINIZ" -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Araç listesi (JSON) dönüyorsa her şey doğru. Hata cümleleri:

| Yanıt | Anlamı | Yapılacak |
|---|---|---|
| `Okuma anahtarı tanınmadı` | Anahtar eksik/yanlış kopyalanmış | Tekrar kopyala; olmuyorsa yenisini oluştur |
| `Okuma anahtarı iptal edilmiş` | Panelden iptal edilmiş | Yeni anahtar oluştur |
| `Okuma anahtarının süresi dolmuş` | Geçerlilik bitti | Yeni anahtar oluştur |
| `...artık platform sahibi değil` | Hesabın platform sahipliği kaldırılmış | §1'deki komutla geri ver |
| `Bu uç yalnızca okuma anahtarıyla çağrılır` | Bearer başlığı yok ya da `adv_ro_` ile başlamıyor | Başlığı kontrol et |
| HTTP 404 `/api/mcp` | Sunucu bu sürüme güncellenmemiş | Deploy (§1) |

## 5. Araçlar

| Araç | Ne verir |
|---|---|
| `kapsam` | **İlk bu.** Üst hesaplar, şirketler, workspace'ler ve kimlikleri |
| `sirket_kirilimi` | Üst hesabın bütün şirketleri, şirket başına performans |
| `workspace_kirilimi` | Bir şirketin (ya da `sirket_id="all"` ile hepsinin) workspace'leri |
| `hesap_kirilimi` | Bir workspace'in reklam hesapları ve izleme durumu |
| `metrik_ozeti` | Kapsamın dönem toplamları + önceki eşit dönem |
| `gunluk_seri` | Gün gün metrikler (trend) |
| `varlik_kirilimi` | Kampanya / reklam grubu / reklam satırları (en çok 200) |
| `donusum_detayi` | Dönüşümlerin hangi eylemden geldiği |
| `veri_kapsami` | Verinin bulunduğu ilk ve son gün |

Ortak parametreler:

- **Kapsam:** `ust_hesap_id`, `sirket_id` (`"all"` = bütün şirketler),
  `workspace_id`. Verilmezse varsayılan kapsam. Yanlış bir kimlik
  **sessizce varsayılana düşmez, hata verir**: yapay zekâ bir workspace'in
  verisi diye ajansın toplamını okumasın diye.
- **Dönem:** `baslangic`, `bitis` (YYYY-MM-DD). Verilmezse dün dahil son
  30 gün. En çok 400 gün. `karsilastirma_baslangic` / `karsilastirma_bitis`
  isteğe bağlı.
- **Süzgeç:** `platform` (`meta`, `google`, `linkedin`), `reklam_hesabi_id`,
  `kampanya_id`, `reklam_grubu_id` (Advetics kimlikleri, platformun kendi
  numaraları değil).
- **Para:** `...Micros` alanları micros (1.000.000 = 1 birim) ve string. Para
  birimi `currency` alanında; farklı para birimleri toplanmaz.

Tanımadığı bir parametreyi (`start_date` gibi) sessizce yok saymaz, hata verir.

### REST ile (betik, n8n, Google Sheets…)

Aynı araçlar düz GET olarak da çağrılabilir; parametreler sorgu dizesinde:

```bash
curl -s "https://advetics.com/api/okuma/araclar/metrik_ozeti?sirket_id=all&baslangic=2026-09-01&bitis=2026-09-30" -H "Authorization: Bearer adv_ro_ANAHTARINIZ"
```

Araç listesi ve şemaları: `GET https://advetics.com/api/okuma/araclar`.

## 6. Güvenlik

- Anahtar **yalnızca okur** ve yalnızca okuma uçlarında (`/api/mcp`,
  `/api/okuma/...`) geçer. Panelin diğer uçlarına anahtarla gidilirse 403.
- Okuma uçları tarayıcı oturumuyla (çerezle) çağrılamaz, yalnızca anahtarla.
- Anahtar veritabanında düz değil, SHA-256 özeti olarak durur.
- Anahtar, sahibinin platform sahipliği kaldırıldığı anda çalışmayı bırakır.
- Anahtar ajansın **bütün** müşteri verisini okuyabilir. Bir yapılandırma
  dosyasına yazılmış anahtar o bilgisayara erişen herkese açıktır: dosyayı
  paylaşma, depoya koyma, ekran görüntüsünde gösterme. Şüphe varsa panelden
  **İptal et** (anında etkili).
- Oluşturma ve iptal denetim kaydına (`audit_logs`) yazılır.

---

## 7. Hazır istemler (prompt)

Bağlandıktan sonra sohbete yapıştır. İlk istem, yapay zekâya veriyle nasıl
çalışacağını söyler; Claude Desktop'ta bir **Proje**nin talimatına, Claude
Code'da `CLAUDE.md`'ye koyarsan her sohbette geçerli olur.

### Ana istem (sistem talimatı)

```text
Sen Profaj ajansının kıdemli performans pazarlama analistisin. "advetics" MCP
sunucusu üzerinden ajansın Meta, Google ve LinkedIn reklam verisine SALT OKUNUR
erişimin var.

Çalışma kuralların:
1. Her yeni soruda önce `kapsam` aracını çağır; üst hesap, şirket ve workspace
   kimliklerini oradan al. Kimlik uydurma, isimden tahmin etme.
2. Tarih vermezsem dün dahil son 30 günü kullan ve hangi aralığa baktığını
   cevabın başında yaz. Karşılaştırma için bir önceki eşit dönemi kullan.
3. Para alanları micros: 1.000.000'a böl. Para birimini her rakamın yanına
   yaz; farklı para birimlerini asla toplama.
4. Bir araç boş dönerse "veri yok" deme: önce `veri_kapsami` ile verinin hangi
   tarihlerde olduğuna, sonra `hesap_kirilimi` ile hesabın izlenip
   izlenmediğine bak ve sebebi söyle.
5. Bir araç hata dönerse mesajı oku ve argümanı düzelterek tekrar dene.
6. Türetilmiş metrikleri (TBM, BGM/CPM, TO/CTR, dönüşüm başı maliyet, ROAS)
   kendin hesapla ve formülü bir kez göster.
7. Sonuçta önce 3-5 maddelik özet ver, sonra tabloyu, en sonda somut ve
   önceliklendirilmiş önerileri (ne, neden, beklenen etki). Veride olmayan bir
   şeyi varsayma; emin olmadığın yerde bunu açıkça söyle.
8. Hiçbir şeyi değiştiremezsin. Bir değişiklik önerirken bunun Advetics
   panelinden ya da reklam platformundan elle yapılacağını belirt.

Yanıtların Türkçe, kısa ve iş dilinde olsun.
```

### Örnek sorular

```text
Ajans genelinde geçen ayın şirket bazında harcama, dönüşüm ve dönüşüm başı
maliyet tablosunu çıkar; bir önceki ayla karşılaştır ve en çok kötüleşen üç
şirketi açıkla.
```

```text
3A Makina workspace'inde son 14 günde dönüşüm başı maliyeti en çok artan
kampanyaları bul, günlük seriye bakarak artışın hangi gün başladığını söyle ve
reklam seviyesinde sorumlu reklamları göster.
```

```text
Bütün workspace'lerde son 7 günde harcaması olan ama dönüşüm getirmeyen
kampanyaları listele. Her biri için harcamayı ve dönüşüm eylemi detayını ver.
```

```text
Bu ayın ilk yarısını geçen ayın aynı dönemiyle platform bazında (Meta, Google,
LinkedIn) karşılaştır ve bütçenin hangi platforma kaydırılması gerektiğini
gerekçesiyle öner.
```

```text
Her workspace için bir paragraflık aylık performans özeti yaz (müşteriye
gidecek dilde), sonunda ajans içi notlar bölümünde riskli hesapları belirt.
```
