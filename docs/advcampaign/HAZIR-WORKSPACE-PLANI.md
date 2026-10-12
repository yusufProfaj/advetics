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

#### Dalga 2 — uygulamada verilen kararlar (2026-10-12)
- **Teşhis:** `metinOner` görseli hiç göndermiyordu, site ADRESİNİ
  okuyordu, kullanıcının metni her istekte "Kullanıcının yazdığı metin"
  olarak modele girip onu çapalıyordu, `temperature` gönderilmiyordu.
- **Görsel modele gider** (metinden önce, `GORU_AYARI.mediaResolution`
  orta). Görsele özel istekte tek görsel (video için kapak); ortak
  öneride ilk 3 görsel (üretilen boyutlar hariç, fazlası notta). 4 MB
  üstü, desteklenmeyen biçim ve okunamayan görsel atlanır, sebebi
  `notlar`da. Varlık `client_id` süzgeciyle okunur ("tüm şirketler").
- **Site metni elimizde yok** (Ölçüm taraması metni saklamıyor): isteme
  yalnız adres girer ve "sitenin metni okunmadı" yazar. Canlı okuma
  bilerek yapılmadı.
- **Sözleşme:** rehber medyasına isteğe bağlı `metin {anaMetin?,
  basliklar?, aciklamalar?, kaynak}`; ortak metne `gorunenYol?`.
  `metin` alanının izinli kaynaklarına `derleyici` eklendi (görsel
  bırakılınca boş ortak metin de dolar); "Metin öner" hâlâ `ai_onerisi`.
- **Önbellek** `rehber_gorsel_metni` (client + `content_hash` + amaç):
  `yeni` modda yapay zekâya gidilmez; "Yeniden yaz" önbelleği atlar,
  önceki öneriyi "tekrar etme" listesiyle gönderir ve satırı günceller.
- **Çapa** yalnız "Buna göre yeniden yaz" (`buna_gore`). Sıcaklık 0.9.
- **Uydurma kapısı** görselde de geçerli: görseldeki fiyat kaynak
  metinde yoksa atılır, not "görselde X yazıyor, doğrulanamadığı için
  eklenmedi" (model okuduğu yazıyı `gorseldekiYazilar`da söylüyor).
- **Derleyici:** Meta'da fikrin kendi başlığı/metni/açıklaması, boş
  parça ortaktan. Google görsel kurgularında havuz: ortak önce, tekil,
  15 başlık / 4 açıklama, sınırı aşan atılır. Görsel metni olmayan
  rehberin içerik özeti değişmiyor. Eksik listesi ve uyum denetçisi
  görsel metnine de yasal uyarı ve sınır uyguluyor.
- **Google RSA:** öneri 12-15 başlık, 4 açıklama istiyor. Görünen yol
  (path1/path2, 15 karakter) öneriye girdi; adreste ya da anahtar
  kelimede geçmeyen parça atılır. Derleyici gövdeye ve
  `beklenen_yanki.gorunenYol`a yazıyor; geri okuma `ad_group_ad` RSA
  yolunu soruyor (yalnız beklenen taşıyorsa).
- **Başlamayan platformun sebebi kalıcı:** `reklam_rehberi.platform_sebepleri`
  (platform başına sebep + zaman), `yayinDurumu` önce onu gösterir;
  denetim kaydı `reklam.rehber.baslamadi`. Başlayan platformun eski
  sebebi silinir.

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
  Maliyet: görsel başına TEK çağrı (önbellek), ortak öneride en çok 3
  görsel; token sayısı API günlüğünde `metin-oner ... girdi= cikti=`
  satırında ve `rehber_gorsel_metni.girdi_token/cikti_token`da. Canlıda
  ÖLÇÜLMEDİ: orta çözünürlükte görsel başına girdi token'ı, görselde
  okunan fiyatın `gorseldekiYazilar`a gerçekten düşüp düşmediği.
- Görünen yol: Google'ın `path1/path2`yi geri okumada nasıl döndürdüğü
  (boş `path2` hiç gelmiyor mu) CANLIDA ÖLÇÜLMEDİ; beklenen null yazıyor.
- Tag Manager'a otomatik etiket Faz 2'ye bağlı (Google izinleri).

## Dalga 3 — mimari (Ajan 1, 2026-10-12)

**Tetik:** reklam hesabı workspace'e atandığında (`assignAdAccount`, işlem
bittikten SONRA, atamayı bozmadan) ve Marka Merkezi'nde "Yeniden hazırla".
Ayrıca soruların cevabı geldiğinde ilgili adım yeniden koşar.

**Adımlar** (her biri bağımsız; biri düşerse diğerleri sürer, düşenin
platform mesajı adımda kalır):

| Kod | İş | Yazdığı yer | Kural |
|---|---|---|---|
| `site` | Site adresi boşsa Facebook sayfasının `website` alanından | `clients.website` | Dolu adrese dokunulmaz |
| `marka` | Marka bilgileri siteden AI ile (`BilgiBankasiAiService.taslak`) | `client_profiles` | YALNIZ boş alanlar yazılır |
| `olcum` | Site taraması + Google/Meta ölçüm durumu (Ölçüm modülü) | önbellek | Okuma |
| `piksel` | Hesabın pikselleri ∩ sitede görülen piksel; tek eşleşme ya da tek çalışan piksel | `workspace_hazirlama.piksel_id` | İki aday → soru |
| `sayfa` | Workspace'in tek sayfası/Instagram'ı | (rehber zaten tek seçeneği seçiyor) | İki sayfa → soru |
| `kategori` | Özel reklam kategorisi bir kez sorulur | `clients.special_ad_categories` + `kategori_cevaplandi` | Cevapsız → soru |
| `konum` | Varsayılan kitle yoksa konum sorulur; seçilince "Varsayılan" kitle şablonu | `audience_templates` + `client_profiles.varsayilan_kitle_id` | Tahmin yok |
| `butce` | Varsayılan günlük bütçe: Meta asgarisinin ve Google Talep Yaratma asgarisinin üstünde, TRY'de 500 ₺ | `workspace_hazirlama.gunluk_butce_micros` | Kullanıcı değiştirebilir |

**Tablo** `workspace_hazirlama` (client_id PK, org_id, durum, adimlar jsonb,
sorular jsonb, piksel_id, gunluk_butce_micros, kategori_cevaplandi,
son_calisma). RLS (`02_rls.sql`), TRUNCATE listesi, `WORKSPACE_TABLOLARI`
kararı: workspace taşınırsa satır onunla gider (workspace'in kendi ayarı).

**Uçlar:** `GET /clients/:id/hazirlama`, `POST /clients/:id/hazirlama`
(yeniden), `POST /clients/:id/hazirlama/cevap` {soru, cevap}. Okuma
`client.read`, yazma `client.write`.

**Rehber:** hazırlık varsayılanları ön doldurmaya girer (bütçe, yarın
başlangıç, kategori cevabı, piksel). Amaç seçilince engeli olmayan
Nerede/Kime/Bütçe adımları atlanır, Reklam adımında özet satırı ("hazırlıktan
dolu · değiştir") görünür.

## Dalga 3 — uygulamada verilen kararlar (Ajan 2/3, 2026-10-12)

- **Kaynak izinleri genişledi** (`REHBER_IZINLI_KAYNAKLAR`): `butce`,
  `pikselId`, `ekKategoriler` → `workspace_profili`; `takvim` →
  `derleyici`. Para ve hukuk alanı eskiden yalnız `kullanici`ydı; harcama
  kararı artık onay penceresinde (bütçe ve başlangıç açıkça yazıyor).
- **Kategori "yok" yalnız SORULUP cevaplandıysa** önden dolar
  (`kategori_cevaplandi`); sorulmamış beyanı boş saymak konut reklamını
  kategorisiz açardı.
- **Başlangıç yarın, bitiş 30 gün sonra**, gün HESABIN saat diliminde.
- **Kısa akış** (`amactanSonraki`): hazırlık var + Nerede/Kime/Bütçe'de
  engel yok → Reklam adımı. Sunucu listesi bayatsa uzun yol.
- **Tetik**: okumada imza (hesap/sayfa/site). Rehber açılışı da okuyor;
  Şirketler ekranından atayıp doğrudan AdvCampaign'e gelen kullanıcıda
  hazırlık başka türlü hiç başlamıyordu.
- **İş düşerse satır yine yazılır** (`dustu`, imzayla): yazılmasaydı her
  yoklama işi yeniden başlatırdı. Kilit satırdan ÖNCE okunuyor (biten işin
  yoklaması eski satırı görüp işi ikinci kez başlatıyordu; test yakaladı).
- Sayfa olarak değil, **Bağlantılar bölümünde kart**: hazırlık hesap
  atamasıyla başlıyor, sonucu atamanın olduğu yerde.
