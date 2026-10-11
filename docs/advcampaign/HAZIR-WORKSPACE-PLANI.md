# Hazır workspace → kreatif at, reklam çıksın (plan)

**Tarih:** 2026-10-12 · **İstek (kullanıcı):** workspace kurulup reklam hesabı
atanınca hesaplar reklama TAMAMEN hazır olsun (site, Meta pikseli, sayfa,
ölçüm); AdvCampaign'de kullanıcı yalnız kreatifi atsın, simülasyon (prova)
bitince reklam oluşsun. Görsel atılınca metin o görsele özel olsun. Meta ve
Google'da kampanya adı: Advetics kısaltması + tarih + amaç.

## Kullanıcı kararları (2026-10-12, soru turu)

| Konu | Karar |
|---|---|
| Kampanya adı | `ADV · 12.10.2026 · Siteme gelsinler · 4F2A` — kod 4 karakter, yayın kaydıyla eşleşiyor; Google'ın `DUPLICATE_NAME` kuralına takılmıyor |
| Prova geçince | **Tek tık onayla yayına**: onay penceresinde bütçe ve tarih görünür, "Onayla" platformda AÇIK kurar |
| Otomatik hazırlık | Hepsi: hesap–sayfa–Instagram–piksel eşleme; site taraması ve ölçüm kontrolü; marka bilgilerini siteden AI ile doldurma; varsayılan hedefleme ve bütçe |
| Kreatif metni | **Her görsele kendi metni**: yapay zekâ her görseli okuyup ona özel başlık ve ana metin yazar; banner setinde set başına tek metin |

## Dalgalar (sırayla; biri canlıya alınmadan diğerine geçilmez)

### Dalga 1 — Ad ve yayın
1. **Adlandırma** (`adlandirma.ts`, `derle-google.ts`): kampanya, set,
   reklam ve Google bütçe/grup adları yeni biçimde. Amaç adı REHBERİN ekran
   adı (kullanıcının seçtiği söz), niyet kataloğununki değil. "açılmadı"
   öneki kurulum sırasında kalıyor, açılınca kalkıyor (güvenlik: yarım
   kalan ağaç Ads Manager'da elle açılmasın).
2. **Yayına açma**: canlıda temiz görülen satırlar `REHBER_ACILIS`te `acik`.
   Önce açma yolu canlıda İLERİ TARİHLİ başlangıçla sınanır (harcama yok)
   ve hemen durdurulur. Google Satış (Maks. Performans) canlıda kurulamadı
   (satın alma dönüşümü olan hesap yok): `deneme` kalır.
3. **Otomatik prova**: Kontrol adımına gelindiğinde engel yoksa prova
   kendiliğinden başlar; kullanıcının işi yalnız "Yayınla → Onayla".

### Dalga 2 — Görsele özel metin
- Görsel bırakıldığı an yapay zekâ (Gemini, görsel girdisi) görseli,
  marka profilini ve site metnini okuyup o görsele başlık + ana metin
  (+ Google için açıklama) yazar; kaynak `derleyici`, kullanıcı kartta
  düzeltebilir. Uydurma yok: görselde ve markada olmayan fiyat/tarih/vaat
  yazılmaz (bugünkü metin önerisinin "yazılmadı" notları korunur).
- Derleyici her fikre kendi metnini koyar; Google kurgularında (Talep
  Yaratma, Maks. Performans) başlıklar fikirlerden toplanır, sınırlar
  (`oneriyiSigdir`) uygulanır.

### Dalga 3 — Hazır workspace
- Hesap atandığı an (ve Marka Merkezi'nde "Yeniden hazırla"): site
  taraması (Ölçüm), Meta hesabının pikselleriyle sitede görülen pikselin
  eşlenmesi, sayfa ve Instagram'ın hesaptan seçilmesi, Google dönüşüm
  durumu, marka bilgilerinin siteden AI ile doldurulması (boş alanlara;
  dolu alana dokunulmaz), varsayılan konum/yaş/günlük bütçe önerisi.
- Sonuç workspace varsayılanı olarak saklanır; rehber açıldığında amaç
  dışındaki her şey dolu gelir. Belirsizlikte (iki piksel, iki sayfa)
  tahmin yok: kullanıcıya tek soru.

## Ölçülecek / açık
- Açma yolunun canlı sonucu (Dalga 1 adım 2).
- Gemini'nin Türkçe görsel okumasının kalitesi ve maliyeti (Dalga 2).
- Tag Manager'a otomatik etiket Faz 2'ye bağlı (Google izinleri).
