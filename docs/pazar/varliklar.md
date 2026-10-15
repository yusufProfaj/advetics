# Varlıklar — pazar araştırması (2026-10-15)

Döngü turu 39 (PROGRESS.md § 11). Bugünkü Varlıklar (`/varliklar`):
Görseller · Kreatifler · Formlar · Kitleler; görsel türü süzgeci, Meta
`image_hash` hesap başına (`asset_platform_refs`), rehberde boyut üretici
(`boyut-uret.ts`, güvenli alan payıyla kırpma). Platform iddiaları
belgeden; canlıda ölçülmedi.

## 1 · Platform gereksinimleri 2026

- **Meta:** Reels/Hikâye 9:16 (1080×1920; 1440×2560 öneriliyor), Akış
  4:5 (1080×1350), karusel 1:1; yükleme akışı 1:1 / 9:16 / 1.91:1
  istiyor ama yerleşim rehberi akış için 4:5 diyor. **Mart 2026'da
  Facebook/Instagram Hikâye ve Reels TEK 9:16 güvenli alanda
  birleşti** (üst ~%14, alt ~%35, yanlar ~%6 metin/logo dışı; rakamlar
  kaynaklarda çelişiyor). %20 metin kuralı uygulanmıyor ama az metin
  daha geniş teslimat. Görsel en çok 30 MB. Ads Manager'da "Safe Zone
  Guardrail" katmanı. Kaynak (üçüncü taraf; Meta'nın sayfası açılmadı):
  [Billo güvenli alan](https://billo.app/blog/meta-ads-safe-zones),
  [Superscale](https://superscale.ai/learn/meta-ad-sizes),
  [adsuploader](https://adsuploader.com/blog/meta-ads-aspect-ratios),
  [Hootsuite](https://blog.hootsuite.com/facebook-ad-sizes/).
- **Google (Demand Gen / PMax):** kare logo en az 128×128 (öneri
  1200×1200), dikey 4:5 en az 480×600 (öneri 960×1200), kare görsel en az
  300×300; Google'ın Demand Gen sayfası dipnotu **logo dosyası en çok
  150 KB**, görsel 5 MB (başka rehberler 5120 KB diyor; dar olanı esas).
  Yatay logo 4:1 isteğe bağlı. Kaynak:
  [Google Demand Gen görsel öğeleri](https://support.google.com/google-ads/answer/17140672),
  [Google yardım](https://support.google.com/google-ads/answer/13676244?hl=en-GB),
  [tryvizup](https://www.tryvizup.com/blog/google-ads-specs-2026-image-video-and-youtube-ad-sizes).
- **Bizde:** Google logo kuralı yalnız piksel ve oran (`google-ogeler.ts`:
  kare ±%1, ≥128); **dosya boyutu (150 KB) bakılmıyor**. Akıllı Boost
  YouTube Demand Gen kurulumu logoyu `logoImages`e gönderiyor; 150 KB
  üstü logo reddedilirse hata kullanım anında çıkar (CLAUDE.md: doğrulama
  giriş anında). Canlıda hangi boyutta reddedildiği ÖLÇÜLMEDİ.

## 2 · Rakipler

Kreatif kütüphaneleri (Madgicx, Smartly, AdCreative, Canva) otomatik
yeniden boyutlandırma ve güvenli alan katmanı sunuyor; bizde boyut
üretici var, güvenli alan önizlemede gösterilmiyor. Kaynak:
[thebrief](https://www.thebrief.ai/blog/meta-ad-specs/),
[moda](https://moda.app/resources/sizes/meta-reels-ad).

## 3 · Türkiye pazarı

- KOBİ'ler çoğunlukla tek kare görsel yüklüyor; eksik 9:16/4:5 nedeniyle
  yerleşim kapanması (banner seti kararı) kullanıcıya söylenmeli; bu
  zaten rehberde var.

## 4 · Öneriler (öncelik sırasıyla)

1. **Google logo boyutu uyarısı giriş anında.** Logo yüklendiğinde /
  Marka Merkezi logosunda dosya 150 KB'ı aşıyorsa "Google Demand Gen
  logosu en çok 150 KB; YouTube boost'unda reddedilebilir" uyarısı
  (`byteSize` zaten saklanıyor). Engel değil uyarı (canlıda ölçülmedi).
  Onaysız.
2. **9:16 önizlemede güvenli alan katmanı** (üst %14, alt %35 soluk bant):
  metin/logonun Reels arayüzünün altında kalacağı yerde olduğunu
  gösterir. Onaysız (yalnız görünüm).
3. Sonraya: Demand Gen provasında (validateOnly) 150 KB üstü logonun
  reddini ölçmek (onay: platform çağrısı).
