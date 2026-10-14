# Aylık Bütçe — pazar araştırması (2026-10-15)

Döngü turu 16 (PROGRESS.md § 5). Bugünkü Aylık Bütçe (`/butce`):
workspace (ve hesap) için aylık bütçe; tempo = harcanan ÷ geçen gün, ±5
puan bant (`budget-pacing.ts`); ay sonu tahmini GEÇMİŞ harcama hızından
(takvim günü). Platform iddiaları belgeden; canlıda ölçülmedi.

## 1 · Platform gerçekleri

- **Google:** günlük harcama ortalama günlük bütçenin en fazla **2 katı**,
  takvim ayında en fazla **30,4 katı**; aşan kısım kredi olarak iade.
  Google yoğun günlere harcamayı kaydırıyor. Kaynak:
  [Google yardım](https://support.google.com/google-ads/answer/2375423).
  "Mart 2026'dan beri Google aylık sınırın %100'ünü agresif hedefliyor"
  iddiası tek satıcı kaynaklı, doğrulanmadı
  ([AdPacer](https://chromewebstore.google.com/detail/mfgliiabejphemhkhlnapbebmkfhfjfm)).
- **Meta:** iyi günlerde günlük bütçenin **%75 fazlası** harcanabilir;
  haftalık tavan günlük bütçenin 7 katı. Kampanya `spend_cap` (ömür
  boyu sert tavan, teslimat temposunu değiştirmiyor) ve hesap harcama
  limiti (ömür boyu, aylık sıfırlanmıyor) var. Kaynak (üçüncü taraf,
  Meta belgesinde doğrulanmadı):
  [Jon Loomer — %75](https://www.jonloomer.com/qvt/increased-budget-flexibility/),
  [Jon Loomer — limitler](https://www.jonloomer.com/campaign-spending-limits-account-spending-limits-daily-spending-limits/),
  [Orbee](https://kb.orbee.com/meta-ads-spending-limit).
- **Sonuç:** günlük bütçe bir TAVAN değil. Ay sonu riski geçmiş hızdan
  değil, **yayındaki günlük bütçelerin ayın kalanındaki toplamından**
  okunur; aylık bütçeyi bunlar belirliyor.

## 2 · Rakipler

| Ürün | Ne yapıyor |
|---|---|
| Optmyzr Budget Monitors | 6 ağ; uyarı varsayılan, otomatik duraklatma/ayar bilinçli açılıyor; Mayıs 2026: Meta için mevsimselliği hesaba katan ay sonu tahmini; her sabah günlük bütçeyi hedefe göre ayarlama (eşit / haftanın günü / öne yüklü) |
| Pace | 5 dakikada bir sert tavan bekçisi, ajans portföyü |
| AgencyAnalytics | Özel hedefle pacing izleme (yalnız rapor) |
| Windsor.ai | Ücretsiz Sheets pacing şablonu (Google/Facebook/LinkedIn) |

Kaynak: [Optmyzr Mayıs 2026](https://help.optmyzr.com/en/articles/15022029-what-s-new-in-optmyzr-may-2026),
[Optmyzr bütçe araçları](https://help.optmyzr.com/en/articles/5789938-overview-budget-management-tools-and-alerts),
[Pace G2](https://www.g2.com/products/pace-2025-12-10/reviews),
[AgencyAnalytics](https://help.agencyanalytics.com/en/articles/6091249-track-budget-pacing-with-custom-goals),
[Windsor.ai](https://windsor.ai/google-sheets-budget-pacing-google-facebook-linkedin/).
Kaynaklar satıcı yazısı.

**Konum:** tempo ve uyarı var; eksik olan "bugünkü günlük bütçelerle ay
sonunda nereye varırız" sorusu ve "kalan bütçeye göre günlük ne olmalı"
cevabı.

## 3 · Kullanıcı şikâyetleri

- "Günlük bütçemi aştı" en sık şikâyet; iki platform da bunu belgeli
  davranış sayıyor (2× / %75). Kullanıcıya önceden söylenmezse panel
  "hızlı" uyarısını hata gibi gösterir. Kaynak:
  [HawkSEM](https://hawksem.com/blog/google-ads-daily-budget-overspend/),
  [megadigital](https://megadigital.ai/en/blog/google-ads-daily-budget-overspend/).

## 4 · Türkiye pazarı

- TL bütçeler; Meta ve Google faturalarına KDV ekleniyor (aylık bütçe
  KDV'siz mi KDV'li mi sorusu raporda karışıklık yaratır). Yerel tempo
  aracı bulunamadı.

## 5 · Öneriler (öncelik sırasıyla)

1. **Bilinen açık (zaten listede):** "13 günün 11 günü senkronize"
   uyarısının sebebini teşhis et.
2. **Yayındaki günlük bütçelerle ay sonu öngörüsü.** Harcanan + (yayındaki
   kampanya/set günlük bütçelerinin toplamı × kalan gün); aylık bütçeyi
   aşıyorsa "Bugünkü günlük bütçelerle ay sonunda X, bütçeyi Y aşar".
   Veri (`ad_groups`/`campaigns` bütçe kolonları) panelde var. Onaysız.
3. **Kalan bütçeye göre önerilen günlük toplam** (yalnız gösterim; uygulama
   İyileştir'in bütçe önerisiyle). Onaysız.
4. **Panelde platform esnekliği notu:** "Meta bir günde %75'e kadar, Google
   2 katına kadar fazla harcayabilir; ay toplamı sınırlı" — "hızlı"
   uyarısının yanında. Onaysız (metin).
5. **(onay bekliyor)** Aylık bütçeyi Meta'da sert tavana çevirmek
   (`spend_cap`); platforma yazar.
