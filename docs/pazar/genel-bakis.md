# Genel Bakış — pazar araştırması (2026-10-15)

Döngü turu 32 (PROGRESS.md § 9). Bugünkü Genel Bakış: özet kutuları,
performans grafiği, ilk beş hesap/kampanya (iniş Reklam Yöneticisi'nde),
bekleyen işler ve bütçe/dönüşüm kartları; sinyal modülü (`modules/sinyal`)
anomali (sıra dışı artış/düşüş) ve sağlık sinyallerini hesaplayıp
bildirim olarak teslim ediyor.

## 1 · Pazar (rakipler)

- Anomali uyarıları yaygın ve iki tür ayrılıyor: **tempo** (bütçe aşımı
  erken) ve **verim** (CPA artışı, CTR düşüşü, teslimat durması).
  Hesabın KENDİ geçmişine göre taban, sabit eşikten daha az gürültülü;
  uyarı olası sebebiyle gelmeli; otomatik durdurma yanlış tetiklenirse
  para kaybettirir (önce yalnız uyarı). Kaynak:
  [Metrics Watch karşılaştırma](https://www.metricswatch.com/blog/metricswatch-vs-ads-anomaly-guard),
  [The Ad Spend](https://theadspend.com/blog/free-ad-performance-alerting-system),
  [AgencyAnalytics anomali](https://agencyanalytics.com/features/anomaly-detection),
  [TapClicks](https://www.tapclicks.com/blog/ai-anomaly-detection-marketing-dashboards-use-cases).
- **Google "Açıklamalar"** iki dönem arasındaki önemli değişimin sebebini
  (teklif, bütçe, dönüşüm eylemi ayarı) arayüzde söylüyor; API'de olup
  olmadığı bulunamadı. Kaynak:
  [Google yardım](https://support.google.com/google-ads/answer/9000655).
- **Konum:** sinyal modülü hesabın kendi tabanını kullanıyor, otomatik
  eylem yok; pazarla aynı çizgide.

## 2 · Platform: Meta kırılım izni (sessiz boş veri riski)

- **Meta 8 Mayıs 2026 değişiklik notu:** `impression_device` (ve onu
  içeren her kombinasyon), `hourly_stats_aggregated_by_audience_time_zone`
  ve `frequency_value` kırılımları, satış desteği olmayan hesaplarda
  hesap başına İZİN istiyor; izin yoksa senkron istek HATA VERMEDEN boş
  dönüyor (yürürlük 3 ya da 6 Ağustos 2026, kaynaklar ayrışıyor). Kaynak:
  [Meta OCC 2026](https://developers.facebook.com/documentation/ads-commerce/marketing-api/out-of-cycle-changes/occ-2026),
  [Meta kırılımlar](https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights/breakdowns),
  [Fivetran](https://fivetran.com/docs/connectors/applications/facebook-ads/troubleshooting/breakdown-requires-per-account-enablement).
- **Bizde:** saat kırılımı `hourly_stats_aggregated_by_advertiser_time_zone`
  (`meta.provider.ts`); Meta'nın notu yalnız kitle saat dilimi
  varyantını sayıyor, yani bugün ETKİLENMİYORUZ. Bir üçüncü taraf iki
  saat varyantının da etkilendiğini yazıyor; canlıda ölçülmedi. Yerleşim
  kırılımı `impression_device` kullanmıyor. Biri bu üç kırılımdan birini
  eklerse "boş = izin yok" ayrımı yapılmalı (CLAUDE.md: 200 + boş dizi
  hata değil).

## 3 · Türkiye pazarı

- Yerel ajans paneli rakibi bulunamadı; Türkçe "neden değişti"
  açıklaması beklenti.

## 4 · Öneriler (öncelik sırasıyla)

1. **Yasaklı kırılım bekçisi.** Meta'ya `impression_device`,
   `frequency_value`, `hourly_stats_aggregated_by_audience_time_zone`
   gönderen kod olmasın (kaynak taraması); eklenecekse önce "izin yok"
   boş durumu yazılsın. Onaysız, test.
2. **(onay bekliyor: canlı ölçüm)** Reklamveren saat dilimi saat
   kırılımının izin isteyip istemediğini bir hesapta ölç (Kitle Özeti
   "Saat Aralığı" bölümü boş gelirse sebep bu olabilir).
3. Sonraya: Genel Bakış'ta sinyal kartına "olası sebep" satırı (bütçe
   değişti mi, reklam durdu mu; İyileştir kararları ve yapı taramasından).
