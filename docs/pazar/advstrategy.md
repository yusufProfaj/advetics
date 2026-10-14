# AdvStrategy — pazar araştırması (2026-10-15)

Döngü turu 13 (PROGRESS.md § 4). Bugünkü AdvStrategy (v2, 2026-10-13):
strateji = kalem listesi (her kalem bir AdvCampaign rehberi), sayılar
yalnız hesabın kendi verisinden; geçmişi olmayan hesapta "tahmin yok"
(K-3); müşteri girişsiz bağlantıyla da onaylıyor (K-2); PDF'te yalnız
Advetics logosu (K-1). Platform iddiaları belgeden; canlıda ölçülmedi.

## 1 · Platform güncellemeleri

- **Meta Estimated Daily Results (`delivery_estimate`)** belgesi
  21 Mayıs 2026'da güncellendi; hesap ve reklam seti düzeyinde,
  optimizasyon hedefi + hedefleme için **harcama → günlük erişim/sonuç
  eğrisi** veriyor. Tahmin hesabın KENDİ geçmişinden kişiselleşiyor;
  güven düşükse tek sıfır nokta dönüyor ("tahmin yok", sıfır teslimat
  değil). Kademeli açılıyor, her hesapta olmayabilir. Kaynak:
  [Meta belge](https://developers.facebook.com/documentation/ads-commerce/marketing-api/audiences/reference/estimated-daily-results),
  [delivery estimate referansı](https://developers.facebook.com/docs/marketing-api/reference/ad-campaign-delivery-estimate/).
  **Bizde:** rehber `reachestimate` (kitle büyüklüğü) okuyor
  (`platform-okuma.ts`), sonuç eğrisi okunmuyor.
- **Meta Reach & Frequency** (`reachfrequencyprediction`): rezervasyonlu
  erişim alımı; asgari bütçe tahmin başına dönüyor, en fazla 8 hafta
  ileri. Büyük marka bütçesi aracı; KOBİ hedef kitlemize uygun değil.
  Kaynak: [Meta referansı](https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/reach-frequency-prediction).
- **Google Performance Planner** API'de yok (yalnız arayüz); 9 Mart
  2026'dan beri Görüntülü/Video planlaması da kalktı. API'de
  `ReachPlanService.GenerateReachForecast` yalnız YouTube erişimi için.
  Arama için planlama verisi Keyword Planner'dan (erişimimiz ölçüldü,
  CLAUDE.md). Kaynak:
  [ppc.land](https://ppc.land/google-quietly-kills-display-and-video-support-in-performance-planner/),
  [Google yardım](https://support.google.com/google-ads/answer/9229976),
  [ReachPlanService v25](https://developers.google.com/google-ads/api/reference/rpc/v25/ReachPlanService).

## 2 · Rakipler / onay akışları

Medya planı + müşteri onayını tek üründe yapan reklam aracı aramada
çıkmadı; onay araçları (Planable, Kontentino, Filestage, Playbook)
sosyal içerik ve kreatif için. Ortak beklentiler: **girişsiz müşteri
onayı**, **isim + tarihli kayıtlı onay**, **önce iç, sonra müşteri
onayı (iki kademe)**, yoruma öğeye bağlı not. Kaynak:
[Kontentino](https://www.kontentino.com/blog/best-social-media-approval-tools/),
[Ordinal](https://www.tryordinal.com/compare/client-approval-software),
[Playbook](https://www.playbook.com/blog/client-approval-software-for-creative-teams/).

**Konum:** K-2 (girişsiz, adlı, sürüme bağlı onay) pazarın beklentisini
zaten karşılıyor. Eksik olan: kalem düzeyinde revizyon notu (müşteri
"şu kalemi değiştir" diyebiliyor mu) ve iç onay kademesi.

## 3 · Kullanıcı şikâyetleri

- Platform tahminleri yakın vadeli hacim/CPA için kullanışlı, uzun vadeli
  ROAS için değil; Meta etiketi "tahmini ve geliştirilmekte". Kaynak:
  [adadvisor](https://adadvisor.ai/blog/ai-performance-forecasting-meta-ads).
  Bu, "kaynağı söylenmeyen tahmin" yasağımızı (K-3) destekliyor.
- Bağımsız kullanıcı şikâyeti (G2/Reddit) aramada çıkmadı.

## 4 · Türkiye pazarı

- KOBİ'de bütçe TL ve aylık; enflasyonla CPA ay ay kayıyor. Hesabın son
  90 günü (geçmiş verisi) bu yüzden genel sektör ortalamasından daha
  doğru kaynak. Yerel medya planı/onay rakibi bulunamadı.

## 5 · Öneriler (öncelik sırasıyla)

1. **Bilinen açık (zaten listede):** onay bekleyen strateji varken kart
   "Strateji oluştur" yazıyor; "Onay bekleyen strateji var" + "Raporu aç".
2. **(onay bekliyor) Geçmişi olmayan hesapta Meta'nın kendi eğrisi.**
   `delivery_estimate`ın harcama → sonuç eğrisi, kaynağı "Meta'nın
   tahmini" diye açıkça yazılarak "tahmin yok" yerine. K-3 kararını
   genişletir (yeni kaynak türü) → kullanıcı kararı; ayrıca canlı ölçüm
   ister (kademeli açılım, sıfır nokta).
3. **Kalem düzeyinde revizyon notu.** Müşteri "revizyon iste" derken
   hangi kalemi kastettiğini seçebilsin; ajans notu kalemin yanında
   görsün. Var olan revizyon akışında yer olup olmadığı önce
   incelenmeli. Onaysız (arayüz).
4. Sonraya: iç onay kademesi (ajans içi gözden geçirme, sonra müşteri).
