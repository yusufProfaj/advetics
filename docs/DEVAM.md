# Devir — nerede kaldık

> **"advetics projesine devam et" denince okunan İLK dosya bu.** Kısa kalmak
> zorunda: geçmiş [`DURUM.md` § 8](DURUM.md)'de, plan
> [`BASE-PLANI.md`](BASE-PLANI.md)'de. Buraya yalnızca SON DURUM ve SIRADAKİ
> İŞ yazılır; her oturum kapanırken, işin kendi commit'inde güncellenir.
> 16 Ağustos'a kadarki eski devir belgesi: [`arsiv/DEVAM-2026-08.md`](arsiv/DEVAM-2026-08.md).

**Son güncelleme:** 2026-09-29 · **Canlı:** `9782f2b` dahil evet. "Dün bir
kez" düzeltmesi push edildi, DEPLOY BEKLİYOR.

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
- Testler: API 3.528, panel 1.108, yeşil.

Ayrıntı: `DURUM.md` 2026-09-28 ve 2026-09-29 girdileri.

## Sıradaki iş (sırayla)

1. **Google kotası — kalan iki karar** (ölçüm ve ilk düzeltme `DURUM.md`
   2026-09-29'da). Deploy sonrası `olcum-google-kota -- --gun=1` ile
   doğrula: `insights_daily` hesap başına ~1/gün, kota hatası saat
   tablosunda azalmalı. Sonra:
   a. **Kota dolunca bütün Google işlerini 10:00'a kadar durdur** (devre
      kesici bugün hesap başına 15 dk). 1.521 iş veri kaybına düştü. Karar
      gerekmiyor, sıradaki kod işi.
   b. **Gün içi metrik 30 dk'da bir** (~4.800 çağrı/gün). Sıklık bir ürün
      kararı — **kullanıcıya sorulacak.**
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
