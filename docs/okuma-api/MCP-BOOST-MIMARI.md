# MCP ile gönderi boost (öne çıkarma) ve yazma güvenlikleri

> 2026-10-21, görev (Armağan): "Armağan Bey Claude üzerinden Advetics MCP ile
> gönderi reklamı (boost) açamıyor". Kullanıcı: "sadece bunu değil MCP
> tarafında geliştirilebilecek her şeyi geliştir". Yazma katmanının temeli
> [`MCP-YAZMA-MIMARI.md`](MCP-YAZMA-MIMARI.md) (anahtar, onay satırı, denetim);
> bu belge onun üstüne gelenleri anlatıyor.

## 0. Çelişki tablosu (görev ↔ depo)

Kullanıcıya sorulmadan kapatılanlar ürün kuralına göre ("ölçüt kullanım
kolaylığı ve reklam verimliliği; para harcayan ya da geri alınamayan şey
sorulur"). Para harcayan her adım yine onaylı ve duraklatılmış.

| # | Görev / depo | Karar | Neden |
|---|---|---|---|
| Ç-B1 | Panelin elle boost'u kampanyayı hemen YAYINA alıyor | MCP boost'u DURAKLATILMIŞ kurar (yeni kampanya PAUSED kalır, ad set ve reklam ACTIVE altında, harcama yok); başlatma ayrı onaylı `boost_baslat` | Görev "varsayılan duraklatılmış olsun, ayrıca başlat aracı olsun". Panel yolu değişmedi: seçenek yalnız MCP'den geliyor. |
| Ç-B2 | Panel boost'u tek amaçlı (etkileşim, `ON_POST`) | MCP beş hedef: etkileşim, erişim, profil ziyareti, mesaj, trafik | Eşlemeler Meta'nın kendi Ads MCP'sinin `ads_boost_ig_post` belgesinden (§ 2). **Yalnız etkileşim canlıda doğrulandı**; diğerleri duraklatılmış kurulup geri okunarak ölçülecek (§ 6). Facebook gönderisinde yalnız etkileşim ve erişim: mevcut gönderiye (`object_story_id`) düğme eklenemiyor, mesaj/trafik/profil isteyen kullanıcıya bu SÖYLENİYOR. |
| Ç-B3 | Panel elle boost'u yalnız konum/yaş/cinsiyet + Meta kayıtlı kitlesi | MCP Advetics kayıtlı kitlesini (Hedef kitleler, `audience_templates`, platform `meta`) de alır: konum, yaş, cinsiyet, ilgi, özel kitle | Görev "kayıtlı kitlelerden seçim". Kitle aynı üreticiden (`metaTargetingFrom`) Meta nesnesine çevriliyor; başka hesabın özel kitlesi engel (rehberdeki `KITLE-HESAP` kuralı). |
| Ç-B4 | Panel yalnız TOPLAM bütçe (K18) | MCP günlük ya da toplam | Görev "günlük ya da toplam". `boosts` tablosu iki kipi zaten taşıyor (kural yolu günlük). Günlükte Meta'nın hesap asgarisi (`minimum_budgets`) okunuyor; okunamazsa uyarı, sayı uydurulmuyor. |
| Ç-B5 | Panel var olan boost kampanyasının altına ekleyebiliyor (K21) | MCP'de her boost kendi kampanyası | Duraklatılmış kurulumun durumu kampanyada tutuluyor; paylaşılan bir kampanyayı MCP'nin başlatıp durdurması başka gönderinin boost'unu etkilerdi. |
| Ç-B6 | Görev "yerleşim" seçimi | Yerleşim seçilmiyor, önizlemede YAZIYOR (Facebook: Meta otomatik; Instagram: medya türüne göre IG yerleşimleri) | Boost yolunun yerleşim kararı canlıda bir kez düzeltildi (`instagramPlacements`); ikinci bir seçenek o kararı bozabilirdi. |
| Ç-B7 | Görev "tek seferde üst bütçe sınırı" | ANAHTARDA: `tek_islem_ust_siniri_micros` (boşsa 50.000 birim), hesabın para biriminde | Sınırı Claude değil anahtarı kuran kişi koyuyor. § 4. |
| Ç-B8 | Görev "müşteri hesabında bütçe değişikliği müşteri onayıyla" | Bütçe araçlarının açıklamasında VE onay özetinde yazıyor | Sunucu müşterinin onayını ölçemez; kapı kullanıcının kendisi. |
| Ç-B9 | Görev "boost ön ayarı yoksa manuel" (#85776) | Ön ayar varsa `on_ayar_kullan: true` eksik alanları ondan doldurur; yoksa alanlar elle (eksikse araç SORMASINI söyler) | Ön ayar hiç zorunlu değil. |

## 1. Araçlar

Okuma (yazma anahtarına):

| Araç | Ne |
|---|---|
| `boost_gonderileri` | Workspace'in (isteğe bağlı tek sayfa) son gönderileri: kimlik, tarih, metin, görsel, bağlantı, etkileşim, canlı boost var mı, ön ayar var mı; boşsa NEDEN (`emptyReason`), toplam yazılı. |
| `boost_onizle` | Gönderi + hedef + kitle + bütçe + süre → özet, toplam tutar, günlük karşılığı, kitle büyüklüğü (Meta `reachestimate`), uyarılar, engeller ve `onizleme_kodu`. Hiçbir şey açmaz. |
| `boostlar` | Workspace'in boost'ları (durum, platformda duraklatılmış mı, bütçe, süre, kampanya kimliği, hata); toplam yazılı. |
| `boost_durumu` | Tek boost'un Meta'daki ANLIK durumu ve bütçesi (geri okuma) + aynadaki son 30 gün sonucu. |
| `kitleler` | Advetics kayıtlı kitleleri (platformuyla); `reklam_hesabi_id` verilirse Meta'daki kayıtlı kitleler de. |
| `konum_ara` | Meta konum anahtarı arama (rehberin `konumlar` alanı ve boost kitlesi). Aydın'ın anahtarının bulunamaması (2026-10-20) bu yüzdendi. |
| `ilgi_ara` | Meta ilgi alanı arama. |

Onaylı (HEMEN YAPMAZ, `onayla` ister):

| Araç | Altındaki yol |
|---|---|
| `boost_olustur` | `onizleme_kodu` ister (önizleme yapılmadan ve argümanlar değişmişse ret) → `BoostsService.mcpBoostAc` → panelin elle boost'uyla AYNI yürütücü (`BoostExecutorService`), `duraklatilmis: true` |
| `boost_baslat` | Kampanya ACTIVE; boost hiç başlatılmadıysa ad set'in başlangıç/bitişi BUGÜNDEN yeniden kurulur (toplam bütçe süreye yeniden yayılsın) |
| `boost_duraklat` | Kampanya PAUSED |
| `boost_butce_degistir` | Ad set bütçesi (kipi değişmez) |

Hepsi yazma şalterinden, kotadan, bağlantı durumundan geçer ve platformdan
GERİ OKUNUR; "uyuşmadı" başarı sayılmaz.

## 2. Hedef eşlemesi (`boostHedefiParametreleri`, saf)

| Hedef | Kampanya amacı | `destination_type` | `optimization_goal` | Düğme | Yüzey |
|---|---|---|---|---|---|
| etkileşim | OUTCOME_ENGAGEMENT | ON_POST | POST_ENGAGEMENT | — | FB + IG (canlıda doğrulandı) |
| erişim | OUTCOME_AWARENESS | UNDEFINED (açıkça) | REACH | — | FB + IG |
| profil ziyareti | OUTCOME_TRAFFIC | INSTAGRAM_PROFILE | VISIT_INSTAGRAM_PROFILE | VIEW_INSTAGRAM_PROFILE | IG |
| mesaj | OUTCOME_ENGAGEMENT | INSTAGRAM_DIRECT | CONVERSATIONS | INSTAGRAM_MESSAGE | IG |
| trafik | OUTCOME_TRAFFIC | WEBSITE | LINK_CLICKS | LEARN_MORE + `hedef_adres` | IG |

`promoted_object.page_id` mesaj ve profil ziyaretinde ana sayfa. Kurulumdan
sonra ad set'in `optimization_goal` ve `destination_type`'ı geri okunuyor;
farklıysa sonuç "uyuşmadı" (Meta bir alanı kabul edip yok sayabiliyor).

## 3. Veri modeli (migration `20261026100000_mcp_boost`)

```
boosts + hedef VARCHAR(20) NOT NULL DEFAULT 'etkilesim' CHECK (5 değer)
       + hedef_adres VARCHAR(2000) NULL           -- yalnız trafik
       + duraklatilmis_kur BOOLEAN NOT NULL DEFAULT false
       + yayin_baslangici TIMESTAMPTZ NULL        -- harcamanın başladığı an
okuma_api_anahtarlari + tek_islem_ust_siniri_micros BIGINT NULL CHECK (> 0)
mcp_onaylari.islem CHECK + boost_olustur, boost_baslat, boost_duraklat, boost_butce
```

Bitiş taraması (`completeEndedBoosts`): süre `COALESCE(yayin_baslangici,
created_on_platform_at)`tan sayılıyor ve DURAKLATILMIŞ KURULUP HİÇ
BAŞLATILMAMIŞ boost bitirilmiyor (gönderi kilitli kalır; araç "başlat ya da
Ads Manager'dan sil" der). Eski satırlar: `duraklatilmis_kur = false`,
davranış aynı.

## 4. Tek işlem üst sınırı

İşlemin TAAHHÜDÜ hesabın para biriminde: toplam bütçede tutarın kendisi,
günlük bütçede günlük × gün (boost: süre; rehber: takvim, bitiş yoksa 30;
bütçe değişikliği: 30). Sınırı aşan işlem onay satırı AÇILMADAN reddedilir
ve sınır hata metninde yazar. Sınır anahtarda; panelde yazma anahtarı
oluşturulurken girilir, boşsa `MCP_VARSAYILAN_UST_SINIR_BIRIM` (50.000; 10.000 denendi, 750 ₺/gün bütçe değişikliğini bile reddediyordu).

## 5. Denetim

Onay satırının denetim kayıtları (`mcp.onay_ac`, `mcp.onayla`,
`mcp.uygulandi`/`basarisiz`) artık workspace'i (`client_id`) ve özetin
kendisini taşıyor: kim (kullanıcı), ne zaman, hangi hesap ve tutar (özet
satırları) Denetim kaydında süzülebiliyor. Boost yazmaları ayrıca
`boost.*` eylemleriyle (`yol: mcp`) kaydediliyor.

## 6. Ölçülecekler (canlıda, test hesabında)

- Beş hedefin her biriyle Instagram gönderisinde duraklatılmış boost; geri
  okunan `optimization_goal` / `destination_type`; Ads Manager'da PAUSED.
- `boost_baslat`: kampanya ACTIVE, ad set `start_time`/`end_time` yeni.
- `reachestimate` boost hedeflemesiyle sayı dönüyor mu.
- `konum_ara` "Aydın" için il anahtarı.
