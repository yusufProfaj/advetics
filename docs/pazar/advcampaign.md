# AdvCampaign — pazar araştırması (2026-10-15)

Döngü turu 1 (PROGRESS.md § 1). Kaynaklar her iddianın yanında. Platform
davranışı BELGEDEN okundu; canlıda ölçülmeden doğru sayılmaz (CLAUDE.md
"Canlıda öğrenilen platform gerçekleri"). Bugünkü AdvCampaign: yedi amaç
(Site, Form, WhatsApp, Telefon, Video, Erişim, Satış), Meta + Google,
rehberli tek akış, önizleme + geri okuma.

## 1 · Platform güncellemeleri

**Meta — Advantage+ tek yapı.**
- Ayrı Advantage+ Shopping (ASC) ve App (AAC) kampanyaları kalkıyor. v25.0
  ile API'den oluşturma/güncelleme durdu, 2026-05-19'dan beri bütün
  sürümlerde kapalı; v26.0'da (tahmini Eylül 2026) kalan ASC/AAC
  kampanyaları DURAKLATILIYOR. Kaynak: [Meta geliştirici blogu, 2026-02-13](https://developers.facebook.com/blog/post/2026/02/13/asc-and-aac-deprecation-mapi-v25/).
- "Advantage+" artık kampanya türü değil, üç kaldıracın birlikte açık
  olduğu DURUM: kampanya düzeyinde bütçe (desteklenen teklif stratejisiyle),
  kitle yalnız coğrafya ya da `targeting_automation.advantage_audience: 1`,
  yerleşimde hiçbir kısıt/hariç tutma yok. Okuma alanı `advantage_state_info`
  (ADVANTAGE_PLUS_SALES / _APP / _LEADS / DISABLED). Kaynak:
  [PPC Land](https://ppc.land/meta-launches-unified-api-structure-for-advantage-campaigns/),
  [PPC Land, eski API'ler](https://ppc.land/meta-deprecates-legacy-campaign-apis-for-advantage-structure/).
- Advantage+ Leads, Sales'in teknolojisini lead amacına taşıyor; Meta erken
  testte nitelikli lead başına %10 daha düşük maliyet diyor (Meta'nın kendi
  rakamı, bağımsız doğrulanmadı). Kaynak: [Jon Loomer](https://www.jonloomer.com/qvt/advantage-plus-leads-improvement/).
- **Bizde:** derleyici ASC/AAC alanı (`smart_promotion_type`) üretmiyor
  (kaynak taraması, 0 eşleşme) → v26 duraklatmasından etkilenmiyoruz.
  `advantage_state_info` zaten okunuyor (geri okumada bilgi satırı, 1b2671e8).

**Google — AI Max, Performance Max, Demand Gen üçlüsü.**
- AI Max for Search: sorgu eşleşmesini genişletiyor, reklam metnini ve açılış
  sayfasını kendisi seçiyor; Google'ın en hızlı büyüyen Arama ürünü.
  Kaynak: [Google Ads 2025 öne çıkanlar](https://support.google.com/google-ads/answer/16756291?hl=en),
  [Vaizle](https://insights.vaizle.com/google-ads-updates/).
- Demand Gen: Video Action ve Discovery'nin yerini aldı; hedef TBM teklifi,
  "yalnız yeni müşteri" modu, YouTube için görüntüleme sonrası dönüşüm,
  platformlar arası karşılaştırılabilir dönüşüm sütunu eklendi. Google
  dönüşüm/dolar artışını %26 diyor (kendi rakamı). Aynı kaynaklar.
- PMax: varlık deneyleri ve ikinci başarı ölçütü.
- **Bizde:** Arama kurulumunda AI Max BİLEREK kapalı (`enableAiMax: false`,
  canlıda gözle doğrulandı 2026-10-10); kullanıcıya bu kararın gerekçesi
  ekranda söylenmiyor. Yeni müşteri modu yok.

**LinkedIn:** AdvCampaign LinkedIn'e yazmıyor (kasıtlı, CLAUDE.md
`DRAFT_PLATFORMS`). Bu turda araştırılmadı.

## 2 · Rakipler

| Ürün | Odak | Rehberli kurulum | Fiyat (satıcı beyanı) |
|---|---|---|---|
| AdEspresso | KOBİ, yalnız Meta | Var, en bilinen yanı; "yeni AI araçlarından geride" yorumu | 49 $ (1.000 $ harcamaya kadar), 99 $, 259 $+ |
| Madgicx | Meta optimizasyonu | Zayıf; veri geçmişi olan hesaba uygun | 45–55 $ (kaynaklar çelişiyor) |
| Ryze | Ajan tarzı, Meta + Google + LinkedIn | Kendi etiketiyle ayrı kampanya kurar, onay ister | 89 $; Ajans 279 $ |
| Birch (eski Revealbot) | Kural otomasyonu | Yok | 49 $+ |
| WASK | Meta + Google, TR kökenli | Var | 25 $ (2.500 $ harcamaya kadar) |

Kaynaklar: [fueler](https://fueler.io/blog/best-ai-tools-for-automated-social-media-advertising),
[Ryze](https://www.get-ryze.ai/ai-meta-ads-tool),
[Madgicx](https://madgicx.com/blog/ai-powered-campaign-management-for-meta-ads),
[AdStellar](https://www.adstellar.ai/blog/best-meta-ads-tool-for-small-business).
Fiyatlar satıcı sayfalarından ve çelişiyor; karar için doğrudan kontrol gerekir.

**Konum:** rehberli kurulum + Meta ve Google tek akışta + geri okumayla
doğrulama, bu listede yalnız Ryze ve WASK'a yakın. Advetics'in ayırt edici
yanı geri okuma ve "ölçülmemiş varsayım yok" disiplini; ekranda görünür
kılınmalı.

## 3 · Kullanıcı şikâyetleri

- **Otomasyon bütçe yakıyor:** Advantage+ kampanyalarında hızlı harcama,
  düşük getiri, bazı ajanslarda CPM 3–4 kat; destek ulaşılmaz.
  Kaynak: [eMarketer](https://www.emarketer.com/content/meta-faces-backlash-automated-ad-system-drains-budgets-with-little-payoff).
- **Lead KALİTESİ en tutarlı şikâyet:** algoritma lead sayısını
  maksimize ediyor, kaliteye bakmıyor; bütçeyi ucuz ama nitelikşiz
  lead'lere (sık sık 65+ yaş) yığıyor. Bir testte Advantage+ lead'i %20
  ucuz ama nitelikli lead başına maliyet ~2 kat. Öneri: CRM sonucunu
  Meta'ya geri besle, sayıyı değil CRM'deki kaliteyi izle.
  Kaynak: [Jon Loomer](https://www.jonloomer.com/qvt/advantage-plus-leads-improvement/),
  [Growthspree](https://www.growthspreeofficial.com/blogs/meta-advantage-plus-b2b),
  [SEO Works](https://www.seoworks.co.uk/avoid-wasting-meta-ads-budget/).
- Reddit'e doğrudan ulaşılamadı (arama sonuç vermedi); sonraki modülde
  r/PPC ve r/FacebookAds ayrıca taranmalı.

## 4 · Türkiye pazarı

- Bilinen yerli/TR kökenli rakip WASK (Meta + Google, yapay zekâ iddiası,
  2,4 M$ yatırım, Akbank KOBİ kampanyasında %30 indirim). Güncel fiyat
  sayfasına ulaşılamadı. Kaynak: [Para Dergi](https://www.paradergi.com.tr/girisimcilik/2023/03/29/dijital-pazarlama-yazilimi-wask-24-milyon-dolar-yatirim-aldi),
  [Wikipedia](https://en.wikipedia.org/wiki/Wask).
- TR'de WhatsApp en güçlü dönüşüm kanalı; AdvCampaign'de WhatsApp ve
  Telefon amaçları zaten var. Bu bir rakip açığı değil, korunacak avantaj.

## 5 · Öneriler (öncelik sırasıyla)

1. **Bekçi testi: ASC/AAC alanı üretilmesin.** Meta v26'da bu kampanyalar
   duraklatılıyor; derleyici bugün üretmiyor ama kilit yok. Kaynak taraması
   (`smart_promotion_type`, `AUTOMATED_SHOPPING_ADS`). Onaysız, küçük.
2. **Kontrol ekranında Advantage+ durumu ve eksik kaldıraç.** `advantage_state_info`
   zaten okunuyor; kullanıcıya "Advantage+ Satış açık" ya da "kapalı: yerleşim
   elle kısıtlı" gibi sade bir satır. Reklam bilmeyen kullanıcı neden
   otomasyonun dışında kaldığını görsün. Onaysız (salt okuma, arayüz).
3. **Google Arama kontrolünde "AI Max kapalı" gerekçesi.** Karar doğru ve
   ölçüldü ama kullanıcıya söylenmiyor; Google'ın en çok pazarladığı
   özelliğin neden kapalı olduğu (sorgu genişlemesi, metin/sayfa kontrolünün
   kaybı) tek cümleyle yazılsın. Onaysız.
4. **(onay bekliyor) Form amacında CRM'e dayalı optimizasyon (Meta Conversion
   Leads).** Potansiyel Müşteriler'deki "müşteri oldu" geri beslemesi
   (Paket E) varken, yeterli veri olan hesapta optimizasyonu lead SAYISINDAN
   lead KALİTESİNE çevirmek. Platforma farklı kurulum yazar ve harcamanın
   yönünü değiştirir → kullanıcı onayı.
5. **(onay bekliyor) Form amacında 65+ yaş yoğunlaşma koruması.** Şikâyetlerin
   ortak noktası; varsayılan yaş üst sınırı ya da kurulum sonrası uyarı.
   Hedeflemeyi değiştirir → kullanıcı onayı.
6. Sonraya: Demand Gen "yalnız yeni müşteri" modu (Satış amacı), PMax varlık
   deneyleri.
