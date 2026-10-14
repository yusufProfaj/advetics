# İyileştir — pazar araştırması (2026-10-15)

Döngü turu 11 (PROGRESS.md § 3). Bugünkü İyileştir: öneriler istek anında
hesaplanıyor (kreatif yorgunluğu, bütçe artır/azalt, dönüşüm
optimizasyonu), yalnız KARAR saklanıyor; uygulama tek yoldan gidiyor ve
platformdan geri okunuyor (`docs/iyilestir/MIMARI.md`). Kurallar ekranı
ayrı bir motor (`rules/rule-evaluator.ts`). Platform iddiaları belgeden;
canlıda ölçülmedi.

## 1 · Platform güncellemeleri

- **Meta kural motoru (`adrules_library`)** belgesi Haziran 2026'da
  güncellendi; v25.0 örnekli. Zamanlı ve tetikli kural, `evaluation_spec` +
  `execution_spec`, `CHANGE_BUDGET`/`CHANGE_BID`. Bizim motor kendi
  değerlendiriyor, Meta'nın kural nesnesini kullanmıyor; bu doğru (çok
  platformlu tek mantık). Hesap başına 250 kural sınırı ve siyasi
  reklamlarda kural yasağı üçüncü taraf iddiası, Meta belgesinde
  doğrulanmadı. Kaynak:
  [Meta ad rules](https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-rules),
  [ad rule specs](https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-rules/ad-rules-specs),
  [cropink](https://cropink.com/meta-automated-rules).
- **Meta Opportunity Score API:** Kasım 2025'te hesap düzeyi 0–100 puan
  ve API'deki öneri sayısı 14'ten 40+'ya çıktı; `GET /act_X/recommendations`.
  Belge, API'nin Ads Manager'dan AZ öneri dönebileceğini söylüyor. Puan
  performans değil "Meta'nın önerilerine uyum" ölçüyor. Kaynak:
  [Meta blog 2025-11-10](https://developers.facebook.com/blog/post/2025/11/10/unlock-peak-performance-with-new-opportunity-score-features-in-the-marketing-api/),
  [Meta belge](https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview/performance-recommendations),
  [RedTrack](https://www.redtrack.io/blog/?p=13116).
- **Meta Ads AI Connectors (Nisan 2026, açık beta):** MCP/CLI ile yazma
  yetkili ajanlar; Meta iş ortağı uyarısı: sık düzenleme öğrenmeyi
  tekrar tekrar sıfırlıyor. Kaynak:
  [adsuploader changelog](https://adsuploader.com/blog/meta-ads-updates-2026),
  [Pixis](https://pixis.ai/blog/ai-learning-phases-why-advertisers-kill-campaigns-too-early/).
- **Google öneriler:** 26 Ocak 2026'dan beri "Duyarlı arama reklamı ekle"
  önerisi otomatik uygulanmıyor ve Auto Apply sayfasından kalktı.
  Otomatik uygulama bütçe ARTIRMIYOR. v25 `Recommendation` kaynağı
  okunabilir; yeni tür listesi changelog'da bulunamadı. Kaynak:
  [Google yardım](https://support.google.com/google-ads/answer/10279006),
  [API referansı](https://developers.google.com/google-ads/api/reference/rpc/v24/Recommendation.TextAdRecommendation).

## 2 · Rakipler

| Ürün | Model | Güvenlik | Not |
|---|---|---|---|
| Birch (Revealbot) | Açık kural, ~15 dk döngü, Meta/Google/TikTok/Snap | Kural tamamen kullanıcının | Kurallar Pro ($99/ay); 60–90 gün ayar süresi iddiası |
| Madgicx | Meta odaklı, otonom optimizasyon | Kara kutu eleştirisi | Fiyat uygulama içinde |
| Optmyzr | Kodsuz kural motoru, 6 ağ | Varsayılan ÖNİZLEME, "yalnız bildir" modu, otomatik uygulama bilinçli açılıyor | Temmuz 2026: denetim önerisi sonuç sayfasından tek tıkla; AI asistanı her değişikliği onaya sunuyor |

Kaynak: [superscale Birch inceleme](https://superscale.ai/alternatives/revealbot/review),
[Ryze karşılaştırma](https://www.get-ryze.ai/blog/madgicx-vs-birch-revealbot-2026),
[Optmyzr kural motoru](https://www.optmyzr.com/solutions/rule-engine/),
[Optmyzr Temmuz 2026](https://help.optmyzr.com/en/articles/15886123-what-s-new-in-optmyzr-july-2026),
[Capterra Optmyzr](https://www.capterra.co.uk/software/156308/optmyzr).
Kaynakların çoğu rakip/satıcı yazısı; bağımsız kullanıcı şikâyeti
(G2/Reddit) aramada çıkmadı.

**Konum:** Advetics'in "öneri + onay + geri okuma" modeli Optmyzr'in
güvenli varsayılanıyla aynı çizgide ve reklam bilmeyen kullanıcıya
Birch'ün boş kural tuvalinden uygun.

## 3 · Kullanıcı şikâyetleri / sektör dersleri

- **Öğrenme aşaması:** ~%20 üstü bütçe değişikliği öğrenmeyi sıfırlıyor
  (kural-of-thumb, Meta resmî eşik yayınlamıyor). **Aynı hafta içindeki
  küçük artışlar BİRİKİYOR:** üç kez %10 tek seferde %20'yi aşmasa da
  sıfırlayabiliyor. Kurallar öğrenmedeki sete dokunmamalı; uzun geriye
  bakış penceresi. Kaynak:
  [jetfuel](https://jetfuel.agency/what-is-the-meta-ads-learning-phase-how-to-exit-it-faster-in-2026/),
  [webtonic](https://www.webtonic.io/blog/campaign-re-entered-learning-phase-causes),
  [Rocketship](https://www.rocketshiphq.com/?p=5713).
- **Bizde:** `butce_artir` tek adımda ≤%20 doğru. AMA karar ISO-hafta
  anahtarında: pazar günü uygulanan +%20'nin ardından pazartesi yeni
  hafta başlıyor ve aynı varlık için ikinci +%20 önerisi gelebiliyor
  (iki günde ~%44). Öğrenme durumu (Meta `learning_stage_info`)
  okunmuyor.

## 4 · Türkiye pazarı

- TL'de enflasyon bütçeleri her ay yukarı itiyor; "aylık bütçeye sığmıyorsa
  öneri yok" kapısı (`budgets/pacing`) bu yüzden önemli ve duruyor. Yerel
  bir kural motoru rakibi bulunamadı.

## 5 · Öneriler (öncelik sırasıyla)

1. **Bütçe değişikliğinde 7 günlük bekleme.** Bir varlıkta son 7 günde
   (takvim haftası değil, kayan pencere) uygulanmış bir bütçe kararı varsa
   aynı varlık için yeni bütçe önerisi üretme; kartta değil, sayaçta
   "N öneri bekleme süresinde" diye söyle. Para harcamaz, öneriyi
   AZALTIR. Onaysız.
2. **Öğrenmedeki sete bütçe önerisi yok.** Meta `learning_stage_info`
   (ad set) okunup `LEARNING` ise bütçe önerisi bastırılır, sebep yazılır.
   Yeni alan okuma: önce betikle canlıda ölçülmeli (alan adı/biçim).
   Onaysız (salt okuma) ama ölçüm ister.
3. **(onay bekliyor) Meta önerilerini (`/recommendations`) göstermek.**
   Meta'nın kendi 40+ önerisini İyileştir listesine "Meta öneriyor"
   olarak eklemek; uygulamak platforma yazar. Okuma onaysız, uygulama
   kullanıcı kararı.
4. Sonraya: Google `Recommendation` okuma (aynı desen), Opportunity Score'u
   Genel Bakış'ta göstermek.
