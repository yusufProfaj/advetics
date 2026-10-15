# Marka Merkezi ve Kurulum — pazar araştırması (2026-10-15)

Döngü turu 36 (PROGRESS.md § 10). Bugünkü Kurulum: tek liste, tek sayaç
(`packages/shared/src/kurulum`): hesap sahibi, Meta hesabı, sayfa, Google
hesabı, Tag Manager konteyneri, GA4 mülkü, Meta piksel, ödeme yöntemleri
(kullanıcıda), Google Ads dönüşümü, GA4–Ads bağı, GTM etiketi, site kodu,
doğrulama. Gerçek hesap açan adımlar "Eksikleri tamamla"ya girmiyor.
Platform iddiaları belgeden; canlıda ölçülmedi.

## 1 · Platform güncellemeleri

- **Meta tek tıkla Conversions API (Meta-enabled CAPI):** 15 Nisan 2026
  duyuruldu, Events Manager'da ~27 Nisan; geliştiricisiz, sunucusuz;
  pikselin gönderdiğini sunucudan AYNEN yansıtıyor (ek parametre yok);
  yalnız web. Meta'nın iddiası: CAPI'siz kurulumlara göre sonuç başına
  ortalama %17,8 düşük maliyet. Eleştiri: teslimatı iyileştiriyor, veri
  kalitesini değil (EMQ ~6,5 civarında kalıyor iddiası, satıcı görüşü).
  Kaynak (üçüncü taraf; Meta'nın yardım sayfası bulunamadı):
  [WeltPixel](https://weltpixel.com/blogs/news/metas-one-click-conversions-api-what-it-does-and-what-it-leaves-out),
  [1ClickReport](https://www.1clickreport.com/blog/meta-one-click-capi-broken-pixel-2026),
  [Elevarus](https://elevarus.com/meta-capi-easy-button-lead-gen-analysis/).
- **Dataset Quality API** (belge 28 Haziran 2026): Etkinlik Eşleşme
  Kalitesi (EMQ, 0-10), kapsama, tekilleştirme metriklerini programla
  ve TOPLU okumayı sağlıyor; "ajans ve iş ortakları kalite paneli kursun"
  diye tasarlanmış; yeni: etkinlik başına harcama ve reklam seti kırılımı.
  Kaynak: [Meta belge](https://developers.facebook.com/documentation/ads-commerce/conversions-api/dataset-quality-api).
- **Google Consent Mode v2 / gelişmiş dönüşümler:** dört sinyal
  (`ad_storage`, `analytics_storage`, `ad_user_data`, `ad_personalization`)
  etiketlerden ÖNCE varsayılanla; `ad_user_data` yoksa gelişmiş dönüşümler
  SESSİZCE çalışmıyor; banner tercihi topluyor ama Google'a iletmiyorsa
  dönüşümlerin büyük kısmı bir gecede kayboluyor (Nisan 2026 vakası,
  satıcı). 2026'da sertifikalı CMP'lerin Google Tag Gateway'i desteklemesi
  şart. Kaynak:
  [CookieChimp](https://cookiechimp.com/blog/google-consent-mode-v2-implementation-guide),
  [googlewatchblog](https://www.googlewatchblog.de/2026/06/consent-mode-v2-und-enhanced-conversions-was-sich-2026-fuer-google-ads-im-datenschutzkonformen-tracking-aendert/),
  [Rezolve destek](https://support.rezolve.com/hc/en-us/articles/36946335178013).

## 2 · Türkiye pazarı (KVKK)

- KVKK Kurumu'nun 2022 çerez rehberi reklam/pazarlama çerezleri için
  AÇIK RIZA bekliyor (önceden işaretli kutu, kaydırma rıza sayılmıyor);
  rıza kaydı tutulmalı; 2024 değişikliğiyle yurt dışına aktarım (madde 9)
  yeniden düzenlendi; VERBİS kaydı. Hukuki görüş değildir. Kaynak:
  [FlexyConsent KVKK](https://flexyconsent.com/blog/turkey-kvkk-cookie-consent-guide/),
  [CookieScript](https://cookie-script.com/guides/practical-guide-to-kvkk-compliance),
  [ConsentStack](https://www.consentstack.io/regulations/tr-kvkk).
- **Bizde:** Kurulum GTM etiketini ve site kodunu kuruyor ama rıza
  (consent) hakkında tek kelime söylemiyor. Türkiye'de rızasız
  pazarlama çerezi hukuki risk; Consent Mode'suz kurulum ise gelişmiş
  dönüşümleri sessizce kapatıyor.

## 3 · Rakipler

Stape (sunucu taraflı GTM, CAPI Gateway barındırma), Meta'nın kendi
Events Manager rehberi ve CMP'ler (Cookiebot, CookieHub, yerli
FlexyConsent) kurulumu parçalı veriyor; tek listede "reklam ölçümü
hazır mı" diyen yerli rakip bulunamadı.

## 4 · Öneriler (öncelik sırasıyla)

1. **Kurulumda "Çerez onayı" bilgi satırı.** GTM/site kodu adımının
   yanında: "Türkiye'de reklam çerezleri açık rıza ister; sitende
   Consent Mode v2 destekli bir onay aracı yoksa gelişmiş dönüşümler
   çalışmaz." Yalnız bilgi (kullanıcıda), hukuki tavsiye değil. Onaysız.
2. **(onay bekliyor: yeni Meta okuma + izin)** Dataset Quality API ile
   piksel/CAPI EMQ'sunu Kurulum'un "doğrulama" adımında göstermek
   (ajans paneli tam bu kullanım için). Canlıda ölçülmeli.
3. **(onay bekliyor)** Meta tek tıkla CAPI'yi Kurulum'da önermek
   (Events Manager'da açılır; bizim yazma yolumuz yok, yönlendirme).
