# Devir — nerede kaldık

> **"advetics projesine devam et" denince okunan İLK dosya bu.** Kısa kalmak
> zorunda: geçmiş [`DURUM.md` § 8](DURUM.md)'de, plan
> [`BASE-PLANI.md`](BASE-PLANI.md)'de. Buraya yalnızca SON DURUM ve SIRADAKİ
> İŞ yazılır; her oturum kapanırken, işin kendi commit'inde güncellenir.
> 16 Ağustos'a kadarki eski devir belgesi: [`arsiv/DEVAM-2026-08.md`](arsiv/DEVAM-2026-08.md).

**Son güncelleme:** 2026-09-29 · **Canlı:** `f7a408d` dahil evet (Google
platform kesicisi). Bölüm 2 (2a + 2b) push edildi, DEPLOY BEKLİYOR —
MIGRATION VAR (`20260929120000_marka_alanlari`).

"O günden beri ne geldi" sorusunun başlangıç noktası bu belgeyi DEĞİŞTİREN
SON COMMIT — hash buraya elle yazılmıyor (yazılan hash kendi commit'ini
gösteremez ve kayar):
`git log --oneline $(git log -1 --format=%h -- docs/DEVAM.md)..origin/main`.

---

## Son oturumda biten

- **Marka Merkezi Bölüm 1 bitti** (`/marka-merkezi`): hazırlık listesi (6 madde),
  bağlantılar, iki adımlı kaldırma, havuz araması; şirket admini ajansın
  atadığını kaldırabiliyor ama taşıyamıyor, denetim kaydı + ajansa mail,
  "Ajans atadı" rozeti.
- Panel: ortak `components/ui/` bileşenleri; workspace seçilmemişse 13 sayfa
  artık soruyor; Genel Bakış kısaltmalarına Türkçe açıklama.
- Canlı düzeltmeler: "Tüm şirketler" modunda Uyarılar/Senkronizasyon 500'ü;
  Google için yanlış "yetki doluyor" alarmı (`authorization_expires_at`,
  migration); Senkronizasyon sayaçları 1.536 → 457 ms; sayaçlar son 7 gün.
- **LinkedIn'e yapılamayacak işler artık gönderilmiyor** (`queue/platform-isleri.ts`):
  kırılım işi hiç açılmıyor; günlük/gün içi metrik işi LinkedIn'de hesap
  seviyesini atlıyor. İkincisi LinkedIn günlük metriğinin HİÇ gelmemesinin
  sebebiydi. Deploy sonrası bakılacak: son 7 günün düşen iş sayısı inmeli,
  LinkedIn `insights_daily` işleri `succeeded` olmalı.
- **Google kotası ölçüldü: sebep hacim, günlük tavan.** "Günlük" metrik işi
  hesap başına günde ~11 kez koşuyordu; artık dün bir kez çekiliyor.
  Kota dolunca bütün Google işleri Google'ın söylediği süre kadar bekliyor
  (önce yalnızca çarpan hesap 15 dk duruyordu, 1.521 iş düşmüştü).
- **Bölüm 2 bitti:** Marka sekmesi yapılandırılmış alanlarla (sektör,
  kategoriler, sık sayfalar, ana amaç, üslup, vaatler); AI asistan, reklam
  metni ve Hızlı Reklam okuyor (amaç seçili açılıyor, adres listeden).
- Testler: API 3.567, panel 1.121, yeşil.

Ayrıntı: `DURUM.md` 2026-09-28 ve 2026-09-29 girdileri.

## Sıradaki iş (sırayla)

1. **Google kotası — doğrulama + bir karar.** Deploy'dan SONRAKİ ilk
   geceden sonra `olcum-google-kota -- --gun=1`: `insights_daily` hesap
   başına ~1/gün olmalı, `kuyruk_vazgecti` sayısı düşmeli, kota hatası
   mesajlarında `rateScope=` görünmeli (görünmüyorsa gövde biçimi
   belgeden farklı — `googleKotaAyrintisi`). Worker log'unda
   "PLATFORM kotası doldu" satırı gecede bir-iki kez olmalı, yüzlerce değil.
   Kalan karar: **gün içi metrik 30 dk'da bir** (~4.800 çağrı/gün) —
   saatliğe inmek ürün kararı, **kullanıcıya soruldu, cevap bekleniyor.**
2. **Bölüm 3 — Varlıklar** (`BASE-PLANI.md`): menü birleşmesi, marka
   renkleri, metin şablonları, yasal uyarı kontrolü. Başlamadan önce
   deploy sonrası Marka sekmesine ve Hızlı Reklam'a tarayıcıdan bir göz
   (ikisi de tarayıcıda açılıp bakılmadı).
3. Sonrası `BASE-PLANI.md` sırasıyla: Kitleler, Koruma kuralları, Ölçüm.

## Kullanıcı kararı bekleyen

- Açılış sayfası hâlâ "Yalnızca Meta ve Google Ads" diyor; gizlilik politikası
  LinkedIn'den söz etmiyor. **Hukuki metne onaysız dokunulmaz.**

## Araçlar

- Canlı ölçüm (salt okunur, sunucuda `advetics` kullanıcısıyla):
  `cd ~/htdocs/advetics.com && pnpm --filter @advetics/api olcum-senkron -- --eposta=<kullanıcı e-postası>`
