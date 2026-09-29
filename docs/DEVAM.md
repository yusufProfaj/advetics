# Devir — nerede kaldık

> **"advetics projesine devam et" denince okunan İLK dosya bu.** Kısa kalmak
> zorunda: geçmiş [`DURUM.md` § 8](DURUM.md)'de, plan
> [`BASE-PLANI.md`](BASE-PLANI.md)'de. Buraya yalnızca SON DURUM ve SIRADAKİ
> İŞ yazılır; her oturum kapanırken, işin kendi commit'inde güncellenir.
> 16 Ağustos'a kadarki eski devir belgesi: [`arsiv/DEVAM-2026-08.md`](arsiv/DEVAM-2026-08.md).

**Son güncelleme:** 2026-09-29 · **Canlı:** `2682fae` dahil evet (LinkedIn
kuyruk düzeltmesi deploy edildi). Google kota ölçüm aracı push edildi,
ÇALIŞTIRILMADI.

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
- Testler: API 3.510, panel 1.108, yeşil.

Ayrıntı: `DURUM.md` 2026-09-28 ve 2026-09-29 girdileri.

## Sıradaki iş (sırayla)

1. **Google kotası doluyor** (3A Makina, "Resource has been exhausted").
   Ölçüm aracı YAZILDI, sonuç bekleniyor: sunucuda
   `pnpm --filter @advetics/api olcum-google-kota` (salt okunur). Çıktı
   gelmeden düzeltme yazılmıyor — iki cevabın düzeltmesi zıt. Koddan görülen
   ama ÖLÇÜLMEMİŞ üç aday: (a) devre kesici HESAP başına, Google'ın günlük
   tavanı geliştirici token'ı başınaysa öbür hesaplar vurmaya devam eder;
   (b) Google sağlayıcısı `api_usage_log`a hiç yazmıyor, kota görünmüyor;
   (c) kota hatasında BullMQ 5 sn'den başlayan üstel geri çekilmeyle
   deniyor, Google'ın bildirdiği bekleme süresi değil.
2. **Bölüm 2 — Marka.** Bilgi bankasındaki üç serbest metin alanı
   yapılandırılmış alanlara dönüşüyor (sektör, web sitesi + sık sayfalar, ana
   amaç, üslup, öne çıkan vaatler); Reklam Oluştur ve AI asistan bunları
   okuyacak. Migration var.
3. Sonrası `BASE-PLANI.md` sırasıyla: Varlıklar, Kitleler, Koruma kuralları, Ölçüm.

## Kullanıcı kararı bekleyen

- Açılış sayfası hâlâ "Yalnızca Meta ve Google Ads" diyor; gizlilik politikası
  LinkedIn'den söz etmiyor. **Hukuki metne onaysız dokunulmaz.**

## Araçlar

- Canlı ölçüm (salt okunur, sunucuda `advetics` kullanıcısıyla):
  `cd ~/htdocs/advetics.com && pnpm --filter @advetics/api olcum-senkron -- --eposta=<kullanıcı e-postası>`
