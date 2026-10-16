# LinkedIn Ads gerçekleri

> CLAUDE.md'den taşındı (2026-10-16, token düzeni). İçerik DEĞİŞMEDİ, yalnız konuya göre ayrıldı.
> Yeni ders buraya, ilgili konu dosyasına EKLENİR; CLAUDE.md'ye yalnız tek satırlık işaret gider.

**LinkedIn Ads** (2026-09-08 ÖLÇÜM TURU — canlı token, gerçek hesaplar)

- **"5 HESAP" SINIRI YALNIZCA YAZMAYI KAPSIYOR, OKUMAYI DEĞİL.** Developer
  Portal *"how many Ad Accounts you can MANAGE"* diyor ve "manage" belirsiz.
  Ölçüldü: beyaz listede 5 hesap varken `adAccountUsers?q=authenticatedUser`
  **9 hesap** döndürdü — dördü listede yok. Havuz modeli (tek ajans kimliği,
  çok hesap) LinkedIn'de ÇALIŞIYOR. Beyaz liste yalnızca kampanya/kreatif
  yazmak için gerekiyor.
- **PARA ONDALIK STRING VE ONSEKİZ ONDALIK GELEBİLİYOR.** Doküman beş
  ondalıklı örnek veriyor (`"19.91833"`); canlıda gelen
  `"539.700000000000192784"`. Kayan noktanın seri hâli. `parseFloat(...) * 1e6`
  = 539700000.0000002 ve `BigInt()` bunu REDDEDİYOR — kayan noktalı bir
  çözümleyici çalışma anında patlıyor. `linkedin-para.ts` string üzerinden tam
  sayı aritmetiği kullanıyor ve altıncı basamaktan sonrasını kırpıyor.
  micros GÖNDERMEK bütçeyi 1.000.000 katına çıkarır ve API bunu GEÇERLİ sayar.
- **SEVİYE EŞLEMESİ ALANLARLA KANITLANDI.** LinkedIn Campaign şunları taşıyor:
  `targetingCriteria`, `dailyBudget`, `unitCost` (teklif), `costType`,
  `optimizationTargetType` ve `campaignGroup` referansı. Campaign Group ise
  yalnızca `account, name, status, runSchedule, buyingType` — hedefleme YOK,
  bütçe YOK. Yani LinkedIn Campaign = Meta'nın ad set'i.
  **Campaign Group → `campaign`, Campaign → `ad_group`, Creative → `ad`.**
  İsme bakarak eşlemek dört seviyeyi üçe sıkıştırır ve metrikler eşlenemez.
- **`LinkedIn-Version` BAŞLIĞI: eksikse 400, ölü sürümse 426.** Ölçüldü.
  Ve **ARALIK SÜRÜMÜ YOK** — `202512` gönderildiğinde 426 döndü. Takvim
  ayından sürüm üreten bir kod HER ARALIK bütün istekleri düşürür.
- **REFRESH TOKEN VERİLİYOR, DÖNMÜYOR, VE TTL'İ UZAMIYOR.** İki resmî sayfa
  çelişiyordu ("all approved MDP partners" / "limited set"); ölçüldü, veriliyor.
  Yenilemede AYNI refresh token dönüyor (rotasyon yok). `expires_in` = 5.183.999
  sn (60 gün), `refresh_token_expires_in` = 31.535.790 sn — SANİYE, 365 gün.
  Doküman örnekleri dakika gibi görünüyordu, değil. TTL geri sayımı İLK
  YETKİLENDİRMEDEN işliyor: yenilemeden sonra 213 saniye AZALMIŞTI. Yani
  bağlantı bir yıl sonra, hiçbir şey bozulmadan, KESİN olarak ölüyor ve üyenin
  yeniden yetkilendirmesi gerekiyor. **O tarih artık
  `platform_connections.authorization_expires_at`ta** (2026-09-28; önceden
  kolon yoktu ve uyarılar 60 günlük ERİŞİM token'ına bakıyordu). Karar
  `connections/yetki-bitisi.ts`: yenileme yoksa erişim bitişi, varsa
  platformun bildirdiği yenileme bitişi, bildirmiyorsa NULL = süresiz
  (Google). `token_expires_at` yalnızca token kasasının yenileme zamanı.
- **INTROSPECTION "active: true" DER AMA TOKEN KULLANILAMAZ OLABİLİR.**
  Refresh token'ı `introspectToken`e verdiğimizde `active: true, auth_type: 3L`
  döndü; aynı token `Authorization: Bearer` olarak 401 INVALID_ACCESS_TOKEN
  aldı. Teşhiste ikisini karıştırmak yarım gün yakar. Ayırt edici: refresh
  token ~350 karakter ve TTL'i 365 gün, access token ~403 karakter ve 60 gün.
- **`creatives` uç noktası `q=criteria` istiyor, `q=search` DEĞİL** (404
  "No virtual resource found"). Kampanya ve kampanya grubu ise `q=search`
  kullanıyor — aynı API'de iki farklı sorgu adı. Ayrıca creatives yanıtı
  `paging.links[].rel=next` TAŞIYOR; `adAnalytics` taşımıyor (`links: []`).
- **`/rest/me` `r_basicprofile` İSTİYOR ve token generator onu vermiyor.**
  403 `ACCESS_DENIED: partnerApiMe.GET`. Bağlantının ADI oradan çekilecekse
  scope listesine eklenmeli — yoksa `exchangeCode` bağlantıyı adsız bırakır.
