# Google Ads gerçekleri

> CLAUDE.md'den taşındı (2026-10-16, token düzeni). İçerik DEĞİŞMEDİ, yalnız konuya göre ayrıldı.
> Yeni ders buraya, ilgili konu dosyasına EKLENİR; CLAUDE.md'ye yalnız tek satırlık işaret gider.

**Google Ads** (2026-08 araştırması, resmi dokümandan)

- **`AdImageAsset.asset` BİR ADRES DEĞİL, KAYNAK ADI.** Değeri
  `customers/{id}/assets/{id}` biçiminde ve `asset_urls`'e onu yazmak üç katlı
  bir arıza üretiyor: `new URL()` düşüyor, PDF metin önizlemesi yerine "görsel
  alınamadı" dalına giriyor (değer string olduğu için TRUTHY) ve dipnottaki
  sayaç şişip GERÇEK arızayı gizliyor. Adresi almak ayrı bir sorgu istiyor:
  `SELECT asset.image_asset.full_size.url FROM asset` — ana makine
  `tpc.googlesyndication.com`. **SORGU 199a0b4'te YAZILDI**
  (`google.provider.ts:1120`) ama CANLIDA DOĞRULANMADI — burada bir süre
  "henüz yazılmadı" yazıyordu ve o cümle, işi yapılmış sanılan bir şeyi
  yeniden yaptırır. Arama reklamlarının görseli yok ve olmayacak; onlar metin
  önizlemesiyle geliyor ve o DOĞRU davranış. `gorselAdresleri()` süzgeci
  kaynak adını eliyor, böylece yanlış dalı ve yalancı sayacı üretmiyor.
- **VIDEO KAMPANYASI API'DEN DEĞİŞTİRİLEMİYOR DA — ölçüldü (2026-10-10).**
  Reklam Yöneticisi'nin satır içi "Durdur"u bir YouTube kampanyasına
  (`objective = VIDEO`) gitti ve Google `MUTATE_NOT_ALLOWED · Mutates are
  not allowed for the requested resource · reddedilen değer=VIDEO` ile
  reddetti. Yalnız oluşturma değil durum değişikliği de kapalı; set ve
  reklam düzeyi de bu kampanyaya bağlı. Kural tek yerde
  (`googleYazilamazMi`, shared): düğme o satırlarda çıkmıyor, sunucu
  platforma gitmeden Türkçe sebeple reddediyor. Akıllı Boost'un eski
  YouTube kampanyaları bu tipte; yenileri Demand Gen.
- **`advertising_channel_type = VIDEO` kampanya API'DEN OLUŞTURULAMIYOR.**
  Google Ads API video kampanyalarında yalnızca okuma ve raporlama yapıyor.
  Enum'da `VIDEO_ACTION` gibi değerlerin durması oluşturulabilir olduğunu
  GÖSTERMİYOR — şema doğrulamasından geçer, iş mantığı reddeder. YouTube
  video reklamı API'den yönetilecekse yol **Demand Gen** (`DEMAND_GEN`,
  alt tip verilmez).
- **Bütçe AYRI BİR KAYNAK** (`CampaignBudget`) ve kampanya ona referans
  veriyor — Meta'daki gibi ad set'in alanı değil. Bütçe kampanya altındaki
  bütün reklam gruplarınca PAYLAŞILIYOR.
- **Kampanya ve bütçe adları hesapta TEKİL olmalı** (`DUPLICATE_NAME`);
  bu yüzden bütçe adına zaman damgası ekleniyor.
- **`partialFailure: false` şart.** `true` olsaydı Google geçersiz işlemleri
  atlayıp kalanları uygular ve yanıt "başarılı" görünürdü.
- **GOOGLE ARAMA ATOMİK KURULUMU CANLIDA ÇALIŞTI — ölçüldü** (2026-10-10,
  v25, AdvCampaign rehberi, Ege Birlik Yapı 516-174-6317, kampanya
  24337936076, duraklatılmış). Google Ads'te GÖZLE: yalnız Google Arama Ağı,
  konum seçeneği "Varlık" (PRESENCE), AI Max kapalı, metin özelleştirme ve
  URL genişletme devre dışı, otomatik öğeler kapalı, dil Türkçe, 5 öbek
  eşleme kelime + kampanya düzeyi 9 geniş negatif. Geri okuma temiz çıktı.
  Panelin "yeni kampanya" varsayılanları (tüm ülkeler, Görüntülü Reklam Ağı,
  AI Max açık) gövdede açıkça yazıldığı için hiçbiri devreye girmedi.
- **DEMAND GEN — `validateOnly` PROVASIYLA ÖLÇÜLDÜ (2026-10-09, v25).**
  İlk prova üç ret verdi, düzeltilince ikinci prova geçti:
  (1) **`Ad.name` ZORUNLU** — belge yalnız `businessName`/`videos`/
  `logoImages` için "zorunlu" diyor; ret `fieldError=REQUIRED`.
  (2) **Konum KAMPANYA seviyesinde REDDEDİLİYOR**, hem de v25'in tanımadığı
  bir kodla (`requestError=UNKNOWN` · "The error code is not in this
  version"). Kabul edilen: kampanyada `demandGenCampaignSettings:
  { upgradedTargeting: true }` AÇIKÇA + konum `adGroupCriterion` olarak.
  (3) **Asgari günlük bütçe 5 USD karşılığı** (Google 2026-04-01'den beri,
  sürümsüz kural; `BUDGET_BELOW_PER_DAY_MINIMUM`); 50 ₺ reddedildi, 250 ₺
  geçti. Tutar yalnız hatanın `details` alanında geliyor — ayrıştırıcı onu
  ATIYORDU ve hata ekrandan teşhis edilemedi; hatanın `details`/`trigger`
  alanlarını asla atma (`googleHataAyrintisi`).
- **KEYWORD PLANNER ERİŞİMİ VAR — ölçüldü** (2026-10-08, v25,
  `google-check --kelime`, Polimek hesabı). Belge Explorer'da yasak diyordu
  ve seviyemiz bilinmiyordu; `generateKeywordIdeas` 200 döndü. Üç tuzak:
  (1) `pageSize` gönderilmeden iki tohum **2.660 fikir** getirdi, tek
  yanıtta: kesme çağıranda, toplam söylenerek. (2) **Yakın varyantlar
  AYNI metriği taşıyor**: "türk kahve makinesi" ve "turk kahve makinesi"
  ikisi de 74.000 arama, aynı teklif aralığı. İki satır toplanırsa hacim
  İKİYE KATLANIR, hata vermeden. (3) Hacim YUVARLANMIŞ kova değeri
  (49.500, 33.100, 90.500), kesin sayı değil; ekranda "yaklaşık". Teklif
  alanları düşük hacimde boş gelebiliyor ("mini french press", 30 arama).
  Harcaması olmayan hesapta hacmin daha kaba gelip gelmediği ÖLÇÜLMEDİ.
