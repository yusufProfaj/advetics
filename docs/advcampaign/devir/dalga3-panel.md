# Dalga 3 · Ajan 3 (Panel) devir notu

Dal: `dalga3-panel` (taban `3beb534`). Push edilmedi.

## Ne yapıldı

Kararlar `components/rehber/rehber-mantik.ts` içinde saf fonksiyon, testleri
`rehber-mantik.spec.ts`; bileşenin onları ÇAĞIRDIĞI ayrıca kaynak taramasıyla
kilitli ("Dalga 3 kararları bileşende ÇAĞRILIYOR").

| # | Bulgu | Düzeltme |
|---|---|---|
| 1 | Raydaki alt satır sabit "Meta, Google" | `adimAltMetni`: 1. adım amaç adı, 2. adım açık platformlar |
| 2 | "Türkiye, Türkiye" | `mapGeoLocation` ülke satırında / ad = ülke iken ülkeyi eklemiyor (`meta-targeting-lookup.spec.ts`) |
| 3 | Yalnız Meta açıkken Google metin kuralı; yalnız Google açıkken Meta ipuçları (koordinatör ek bulgusu) | `metinKurali(acik, kurgu)`: soru cümlesi, başlık/açıklama notu, kutu sayısı, "Reklam gücü" yalnız Google Arama'da. Simetri testi dört kurgunun hepsinde |
| 4 | Amaç yokken "hazır" ve tik | `adimBittiMi(..., amacSecili)`, `hazirAdimlar` |
| 5 | Amaç değişince kullanıcının platform seçimi eziliyordu | `amacDegisimi`: kaynak `kullanici` ve yeni amaçta açtığı her platform görünürse korunur, yoksa öneri (`derleyici`) |
| 6 | Anahtar ham seçimi yazıyordu | `platformAnahtari(b.acik, p)` görünen kümeden |
| 7 | Google adımı her kurguda "kelimeler" | `kurulumAdimlari(platform, kurgu)`; Arama dışı Google önizlemesi DOKUNULMADI |
| 8 | G-ASGARI "YouTube reklamı için" | "Google Talep Yaratma reklamı için" (shared `eksikler.ts`, yalnız metin) |
| 9 | Arşivden sonra başlık "Duraklatılmış kuruldu" | `sonEkranOzeti`: karışık hâlde "Meta'daki reklam arşivlendi" + kalanın hâli |
| 10 | Listede arşivlenen reklam "Yayında" | `RehberOzeti.yayinlar` (shared sözleşme alanı, ZORUNLU) + servis `listele` her yayınlanmış satırda `yayinDurumu`; panel `listeDurumu` |
| 11 | İl (Meta region) Google'da eşlenmiyordu | `konumEsle`: il için Google `province` türü ŞART, ad soneki (" Province", " İli") atılarak tam eşleşme; şehirde iki aday varsa il adayı atılıyor (tür `city`ye kısılmadı: ilçeler başka türle gelebilir) |
| 12 | Hazırlık hep ilk sayfayı okuyordu | `GET /reklam/rehber/hazirlik?rehberId=` (isteğe bağlı); seçili hesap/sayfa okunuyor, önbellek okunan kimlikle yazılıyor (`seciliYoksaIlk`) |

Mobil (375 px) CSS statik okundu: açık bir taşma bulunmadı, değişiklik yok.

## Ölçüm

- Panel: typecheck temiz, 102 dosya / 1413 test yeşil.
- API: typecheck temiz, tam paket TEK BAŞINA 323 dosya / 4564 test yeşil.
- Mutasyon: panelde 7, API'de 7 bozma; hepsi en az bir testi düşürdü.

## ÖLÇÜLMEDİ

- Hiçbir ekran tarayıcıda açılmadı (masaüstü/mobil ekran görüntüsü yok).
  Tasarım denetimi (Ajan 6) gerekli.
- Google `geoTargetConstants:suggest` "İzmir, Türkiye" sorgusuna gerçekten
  `targetType = Province` bir aday döndürüyor mu CANLIDA görülmedi. Sorgu
  metni değiştirilmedi (`k.etiket`); dönmüyorsa eşleme yine `null` kalır
  (G-KONUM, sessiz değil).
- Daha önce "Türkiye, Türkiye" etiketiyle KAYDEDİLMİŞ konumlar (Marka
  Merkezi kitlesi, açık taslaklar) düzelmez; yeni aramalar düzelir.
- Liste her yayınlanmış rehber için ayrı `yayinDurumu` sorgusu atıyor
  (N+1). Workspace başına rehber sayısı küçük olduğu için kabul edildi.
- Rehberin kendi `durum`u arşivden sonra `yayinda` kalıyor (bilinçli
  dokunulmadı: Google arşivlenemiyor, karışık hâlde tek değer yanlış olur).

## Kapsam dışı dokunulanlar

- `packages/shared/src/reklam/rehber/api.ts` (`RehberOzeti.yayinlar`),
  `eksikler.ts` (tek metin).
- `apps/api/.../meta.provider.ts#mapGeoLocation`, `oneriler.ts#konumEsle`,
  `hazirlik.service.ts#rehberOku`, `rehber.controller.ts`, `rehber.service.ts`.
- Görülen ama dokunulmayan: `derle-google.ts:225` "YouTube reklamı için en
  az 1 açıklama" mesajı görsel Talep Yaratma'da da çıkıyor (Google ajanının
  dosyası).
