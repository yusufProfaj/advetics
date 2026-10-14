# Raporlar — pazar araştırması (2026-10-15)

Döngü turu 23 (PROGRESS.md § 7). Bugünkü Raporlar: tek sayfa (rapor,
şablon, faturalar); bölümler `REPORT_SECTIONS` (kapak, özet, Meta/Google
kampanyaları, anahtar kelime, arama terimi, dönüşüm detayı, site ve
dönüşüm, kitle kırılımları, öne çıkan reklamlar, kapanış); PDF kapağında
Advetics logosu; zamanlanmış mail planı ve fatura eki.

## 1 · Pazar (rakipler)

| Ürün | 2026'da öne çıkan |
|---|---|
| AgencyAnalytics | Ask AI 2.0, raporun tamamını özetleyen AI Report Summary (özel istemle), roll-up tablolar (çok müşteri), anomali tespiti ve metrik uyarıları |
| Whatagraph | 3.0 + IQ+: istemle rapor kurma, veriyle sohbet, 18 dilde performans özeti; pahalı (kaynaklar 249 € – 812 $/ay arası, çelişkili) |
| DashThis | AI Insights (eğilim, sorun, kazanım, fırsat), Temmuz 2026 AI Insights Pro (sohbet, panel bağlamı); beyaz etiket tüm ücretli planlarda |

Kaynak: [AgencyAnalytics Ocak 2026 ürün özeti](https://help.agencyanalytics.com/en/articles/13462766-product-roundup),
[AgencyAnalytics AI özetleri](https://agencyanalytics.com/blog/ai-insights-creates-valuable-reports),
[Porter Metrics — Whatagraph](https://portermetrics.com/en/compare/whatagraph-overview/),
[DashThis AI Insights](https://dashthis.com/blog/ai-insights/),
[DashThis — Whatagraph alternatifleri](https://dashthis.com/blog/whatagraph-alternatives/).
Kaynakların çoğu rakip/satıcı yazısı.

**Konum:** Türkçe, beyaz etiket, panel = PDF tek belge ve fatura eki
bizde güçlü. Rakiplerin hepsinde olan, bizde olmayan: **raporun başında
düz dille "bu ay ne oldu" yorumu** ve **hedefe/bütçeye göre durum**.

## 2 · Müşterinin raporda istediği (uygulayıcı rehberleri)

- Jargon ve metrik yığını yerine iş sonucu (harcama → müşteri/gelir).
- Yönetici özeti EN ÜSTTE ve düz dille; hedef hatırlatması (ne
  amaçlanmıştı), önceki döneme göre değişim, bütçe planda mı, birim
  maliyet kabul edilebilir mi; gelecek ay 2-3 eylem.
- Veri tazeliği ("şu tarihe kadar") ve dönüşümün tanımı (platform formu ≠
  satış). Her ay aynı yapı.
Kaynak: [Search Engine Land](https://searchengineland.com/deliver-ppc-reports-clients-love-462484),
[Coupler](https://blog.coupler.io/ppc-client-report/amp/),
[TapClicks](https://www.tapclicks.com/blog/ppc-reports-for-clients),
[DashThis PPC rapor](https://dashthis.com/blog/ppc-client-reports).

**Bizde:** önceki döneme göre değişim, dönüşüm adları (dönüşüm detayı)
ve "gün bitmedi" notu var. Eksik: aylık bütçeye göre durum, ajansın
yorumu/sonraki adımlar.

## 3 · Türkiye pazarı

- Müşteriye giden belge Türkçe ve TL; KDV notu (platform faturası KDV
  ekliyor) raporda bütçe karşılaştırmasında karışıklık yaratabilir. Yerel
  rapor aracı rakibi bulunamadı.

## 4 · Öneriler (öncelik sırasıyla)

1. **Bilinen açıklar (zaten listede):** önizlemede kılavuz dışı renkler ve
   ikinci `h1`; telefonda önizleme sağdan kesik.
2. **Özet bölümünde "Aylık bütçe" satırı.** Dönem tek bir takvim ayıysa
   ve aylık bütçe tanımlıysa: "Bütçe X, harcanan Y (%Z); ay sonu
   öngörüsü …" (Aylık Bütçe ile aynı hesap, `budgets.pacing`). Onaysız.
3. **Ajans yorumu ve sonraki adımlar.** Rapor ekranında düz metin alanı
   (dönem başına), PDF'te özetin altında; boşsa bölüm çizilmiyor. AI
   önerisi sonraya (sayı yasağıyla, AdvStrategy'deki gibi). Onaysız ama
   yeni tablo/migration ister → migration yazılır, deploy kullanıcıda.
4. Sonraya: çok müşterili "roll-up" rapor (ajans geneli), anomali notu.
