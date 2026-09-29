# Devir — nerede kaldık

> **"advetics projesine devam et" denince okunan İLK dosya bu.** Kısa kalmak
> zorunda: geçmiş [`DURUM.md` § 8](DURUM.md)'de, plan
> [`BASE-PLANI.md`](BASE-PLANI.md)'de. Buraya yalnızca SON DURUM ve SIRADAKİ
> İŞ yazılır; her oturum kapanırken, işin kendi commit'inde güncellenir.
> 16 Ağustos'a kadarki eski devir belgesi: [`arsiv/DEVAM-2026-08.md`](arsiv/DEVAM-2026-08.md).

**Son güncelleme:** 2026-09-29 · **Son iş commit'i:** `4fedef3` · **Canlı:** evet
(`4fedef3` dahil, kullanıcı deploy etti)

Bu satırdaki commit, "o günden beri ne geldi" sorusunun başlangıç noktası:
`git log --oneline 4fedef3..origin/main`. Öbür geliştiricinin işi orada görünür.

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
- Testler: API 3.501, panel 1.108, yeşil.

Ayrıntı: `DURUM.md` 2026-09-28 ve 2026-09-29 girdileri.

## Sıradaki iş (sırayla)

1. **LinkedIn'e yapılamayacak işler gönderiliyor.** Hesap seviyesi metrik ve
   kırılım (yaş, cinsiyet) işleri LinkedIn'de her seferinde kalıcı hatayla
   düşüyor; son 7 günde 865 işin 549'u düştü, büyük kısmı bu. Bu işler hiç
   kuyruğa girmemeli. Küçük iş, **kullanıcı onayı bekliyor.**
2. **Google kotası doluyor** (3A Makina, "Resource has been exhausted").
   Önce ölç: kotayı tekrar denemeler mi, gerçekten fazla istek mi yiyor.
3. **Bölüm 2 — Marka.** Bilgi bankasındaki üç serbest metin alanı
   yapılandırılmış alanlara dönüşüyor (sektör, web sitesi + sık sayfalar, ana
   amaç, üslup, öne çıkan vaatler); Reklam Oluştur ve AI asistan bunları
   okuyacak. Migration var.
4. Sonrası `BASE-PLANI.md` sırasıyla: Varlıklar, Kitleler, Koruma kuralları, Ölçüm.

## Kullanıcı kararı bekleyen

- Açılış sayfası hâlâ "Yalnızca Meta ve Google Ads" diyor; gizlilik politikası
  LinkedIn'den söz etmiyor. **Hukuki metne onaysız dokunulmaz.**

## Araçlar

- Canlı ölçüm (salt okunur, sunucuda `advetics` kullanıcısıyla):
  `cd ~/htdocs/advetics.com && pnpm --filter @advetics/api olcum-senkron -- --eposta=<kullanıcı e-postası>`
