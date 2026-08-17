# Devir belgesi — nerede kaldık

**Son güncelleme:** 2026-08-16 · **Son commit:** `7a68840` · **Canlı:** EVET —
`64fe10c` elle dağıtıldı ve doğrulandı. Sonraki commit'ler yalnızca belge.

---

## SIRADAKİ İŞ — 1. ELLE BOOST (yeni istek, kod yazılacak)

Önceki oturum "Oluştur" bölümünün yeniden tasarımını bitirdi (§A) ve kod
2026-08-16'da üretime çıktı (§B). Kullanıcının yeni isteği:

> "auto boost kısmında manuel boost olması da gerekiyor yani girdiğimde
> instagram gönderisini seçip hangi lokasyona gösterileceğini ya da hedef
> kitleye gösterileceğini seçip direkt boost'u yayınlayabilmem lazım"

Yani Akıllı Boost bugün **yalnızca kuralla** çalışıyor: kural koş → aday üret →
onayla → yayınla. Kural kurmadan, gönderiyi elle seçip hemen yayınlamanın yolu
yok.

**KARARLAR KAPANDI — 2026-08-16.** K16–K18 tartışıldı, tartışma sırasında
kodda çıkan iki açık için K19 ve K20 eklendi. Beşi de
[`TASARIM-OLUSTUR.md` §10](TASARIM-OLUSTUR.md) içinde gerekçeleriyle yazılı;
akış ve engeller §7.2'de. Özeti:

| | Karar |
|---|---|
| **K16** hedefleme | Şehir + yaş + cinsiyet + **kayıtlı kitleler**. İki yeni uç: coğrafi arama ve kayıtlı kitle listesi. Kitle tabloya yazılmıyor, ekran açılırken çekiliyor. Liste boşsa boş açılır liste değil, "kayıtlı kitle bulunamadı" |
| **K17** Instagram | Profil türüne göre dallan. Deneme sırası: **doğrudan IG** (FB turu atlanıyor). Hata gelirse ayırt etmenin yolu aynı hesapta tek bir FB çağrısı |
| **K18** bütçe | Toplam göster, **toplam gönder** (`lifetime_budget`). `BoostRequest` iki kipli olacak; **kural yolu günlük kalıyor** |
| **K19** emniyet | Sert tavan yok. Yayın düğmesinin üstünde toplam tutar + aylık bütçe uyarısı. Ara ekran değil, aynı ekranın son satırı |
| **K20** tekrar boost | Elle yolda **uyarı, blok değil**. Kısmi tekil indeks canlı ikinci boost'u engellemeye devam ediyor |

**Bugün kodda ne var, ne yok** (yeni oturum buradan başlamalı):

| | Durum |
|---|---|
| `organic_posts` tablosu ve senkronizasyonu | VAR — Instagram dahil (`queue/organic-sync.service.ts:97`) |
| Gönderi listeleme UCU | VAR — `GET /boosts/posts` |
| Boost yayın yolu | VAR — `createBoost` + ağaç kaydı (§7.1). **Canlıda hiç çalıştırılmadı** |
| Hedefleme alanı | VAR — `BoostRequest.targeting`, verilmezse ülke geneli TR. **Ekran hâlâ yok** |
| Şehir arama ucu | VAR — `GET /connections/targeting/locations`. **Canlıda denenmedi** |
| Kayıtlı kitle ucu | VAR — `GET /connections/targeting/saved-audiences`. **Canlıda denenmedi** |
| IG profilinin ana sayfası | VAR — `social_profiles.parent_page_external_id`. **Mevcut satırlarda NULL**, bir kez "Hesapları yenile" gerekiyor |
| Elle boost ekranı | VAR — Akıllı Boost sayfasında "Gönderi öne çıkar". **Canlıda denenmedi** |
| Elle boost yayın ucu | VAR — `POST /boosts/manual` (`boost.approve`) |

**BEŞ TUZAK — kod yazmadan önce oku:**

1. ~~**HEDEFLEME ŞU AN SABİT.**~~ **ÇÖZÜLDÜ** (3. adım). `BoostRequest.targeting`
   eklendi; verilmezse `DEFAULT_BOOST_TARGETING` (ülke geneli TR) uygulanıyor
   ve kural yolu tam da bunu kullanıyor. Kalan iş ekranda: seçilen değeri bu
   alana yazmak.

2. **INSTAGRAM GÖNDERİSİ FACEBOOK GİBİ BOOST EDİLEMEZ — VE BU AÇIK BUGÜN DE
   VAR.** Bugünkü kod reklamı `object_story_id: "{sayfa}_{gönderi}"` ile
   kuruyor; bu Facebook sayfa gönderisi biçimi. `boost-executor.service.ts:167`
   profil türüne hiç bakmadan `sp.external_id`'yi `pageExternalId` diye
   geçiyor — IG profilinde bu değer **IG kullanıcı kimliği**.

   Bunun elle boost'u beklemesi gerekmiyor: aday seçicide de profil türü
   süzgeci yok (`boosts.service.ts:276`), yani `social_profile_id` boş
   bırakılan bir kural IG gönderisini bugün aday yapabilir. **İlk commit bu
   olmalı ve hiçbir karara bağlı değil:** IG profili görüldüğünde erken hata.

3. **ÖZEL KATEGORİ HEDEFLEMEYİ KISITLIYOR.** Kısıtın kendisi 3. adımda
   sağlayıcıya kondu — `buildBoostAdSetParams` yaş ve cinsiyeti düşürüyor,
   yani çağıran unutsa bile Meta'ya yanlış alan gitmiyor. **Ekran tarafı hâlâ
   yapılmadı:** alanları gösterip sessizce düşürmek yerine kapatmalı ve
   sebebini yazmalı. K16 gereği **kayıtlı kitle de kapatılmalı** — kitlenin
   kendisi yaş/cinsiyet daraltması taşıyabilir.

4. ~~**IG PROFİLİNİN ANA FACEBOOK SAYFASI SAKLANMIYOR.**~~ **ÇÖZÜLDÜ** (2.
   adım). Kolon eklendi ve keşif dolduruyor. Kalan tek iş operasyonel:
   üretimdeki satırlarda NULL, bir kez "Hesapları yenile" gerekiyor.
   **K17'nin dalı yazıldığında NULL bir değerle boost DENENMEMELİ** — erken
   hata verilmeli, yoksa yine yanlış kimlik gönderilir.

5. ~~**`lifetime_budget` KURAL YOLUNU BOZMAMALI**~~ **ÇÖZÜLDÜ** (3. adım).
   Kural yolu günlük kipte kalıyor ve iki test bunu kilitliyor
   (`boost-executor-tree.spec.ts` → "yeni alanlar sızmıyor").

   > **CANLIDA DOĞRULANMAMIŞ DÖRT ŞEY — ilk gerçek çağrıda sırayla bakılacak:**
   >
   > 1. `lifetime_budget` + `start_time` ikilisi Meta tarafından kabul
   >    ediliyor mu.
   > 2. Kayıtlı kitlenin `targeting` alanı gerçekten dönüyor mu ve gönderilen
   >    hâliyle kabul ediliyor mu.
   > 3. Coğrafi arama sonucundaki `key` biçimi ad set hedeflemesinde çalışıyor
   >    mu (panelde "İzmir" seçip Ads Manager'da İzmir göründüğü GÖZLE
   >    doğrulanacak — "200 döndü" bu projede doğrulama sayılmıyor).
   > 4. Özel kategori müşterisinde Meta alanları reddediyor mu, yoksa kabul
   >    edip sessizce yok mu sayıyor.

**Sıra:**

1. ✅ **BİTTİ** — IG gönderisinde erken hata. Üç katman: kural kaydı
   (`assertProfile`), aday üretimi (sayarak atlıyor) ve yürütücü (kota
   alınmadan önce). Karşılaştırma ve metin tek yerde:
   `instagram-boost-guard.ts` — K17 dalı yazılınca **bu dosya silinecek** ve
   derleyici üç çağrı yerini gösterecek. **999 API testi** (öncesi 987).
2. ✅ **BİTTİ** — IG profilinin ana Facebook sayfası saklanıyor.
   `social_profiles.parent_page_external_id`, migration
   `20260816230000_social_profile_parent_page`. Eşleme döngüden çıkarıldı
   (`mapPageProfiles`) ki sınanabilsin. CHECK kısıtı `01_constraints.sql`'de:
   Facebook satırında dolu olamıyor. **1009 API testi** (öncesi 999).

   > **DAĞITIMDAN SONRA PANELDEN "HESAPLARI YENİLE" ÇALIŞTIRILMALI.** Kolon
   > mevcut satırlar keşfedildikten sonra eklendi; üretimdeki bütün Instagram
   > satırlarında NULL ve değer Meta'da, veritabanında değil — geriye dönük
   > doldurulamıyor. Keşif kolonu her turda güncelliyor, yani tek bir yenileme
   > yetiyor. Yapılmazsa K17'nin Instagram dalı yazıldığında hiçbir Instagram
   > hesabı boost edilemez.
3. ✅ **BİTTİ** — `BoostRequest`'e `targeting` + iki kipli bütçe.
   `BoostBudget` ayrık birleşim (`daily` | `lifetime`), ad set gövdesi
   sınanabilir bir saf fonksiyona çıkarıldı (`buildBoostAdSetParams`). Özel
   kategori kısıtı SAĞLAYICIDA uygulanıyor, çağıranda değil. `publishBoost`
   artık `budget_mode`'u ağaçtan okuyor — bugüne kadar koşulsuz günlük
   sayıyordu. **1030 API testi** (öncesi 1009).
4. ✅ **BİTTİ** — üç uç nokta yazıldı. **1053 API testi** (öncesi 1030).

   | Uç | Ne döner |
   |---|---|
   | `GET /boosts/posts` | Öne çıkarılabilir gönderiler. Engelli olanlar **gizlenmiyor**, `blockedReason` ile dönüyor; `warning` engel değil (K20). Liste `total` + `limit` taşıyor |
   | `GET /connections/targeting/locations` | Şehir/il/ülke yazarken-arama. `key` hedeflemeye giden değer |
   | `GET /connections/targeting/saved-audiences` | Ads Manager'daki kayıtlı kitleler. **Boş liste geçerli cevap** — ekran "bulunamadı" yazmalı |

   Üçü de `connection.read` / `boost.read` ile okunuyor; hiçbiri yazma
   yetkisi istemiyor. Kitle ve lokasyon listeleri **tabloya yazılmıyor**,
   ekran açılırken çekiliyor.

5. ✅ **BİTTİ** — ekran ve yayın ucu. **1074 API testi** (öncesi 1053), 59 panel
   testi, iki derleme de temiz.

   `POST /boosts/manual` taslağı yazıp **aynı istekte** yayınlıyor ve kural
   yolunun `BoostExecutorService`'inden geçiyor — dördüncü bir yazma yolu
   açılmadı. Ekran Akıllı Boost sayfasında, ayrı sayfa değil: dört adım
   (gönderi → bütçe/süre → kime → yayınla), ara onay yok.

   Şema tarafında `boosts` üç kolon kazandı: `budget_mode`,
   `total_budget_micros`, `targeting` + `saved_audience_id`.
   `daily_budget_micros` NULLABLE oldu — toplam bütçeli boost'ta günlük
   bütçe diye bir sayı yok ve türetilmiş bir değer yazmak uydurma kesinlik
   olurdu. Migration `20260817090000_manual_boost`; kipe göre tam bir bütçe
   kolonunu zorunlu kılan CHECK `01_constraints.sql`'de.

5b. ✅ **BİTTİ** — sayfa izleme anahtarı (canlıda çıkan engel).

   **NASIL BULUNDU:** panelde elle boost denenmek istendi, gönderi listesi
   boştu. Üretim sorgusu sebebi gösterdi: **199 sosyal profilin hepsi
   `client_id = NULL` ve `sync_enabled = false`.** Ajans geneli havuz
   modeline geçilirken (§0.2–0.3) reklam hesaplarına yazılan izleme anahtarı
   **sayfalara yazılmamıştı** — `sync_enabled` alanını değiştirebilecek tek
   bir uç nokta ya da düğme yoktu. Yani sayfa atansa bile organik gönderi
   asla çekilmiyordu ve bunun hiçbir yerde karşılığı görünmüyordu.

   Eklenenler: `PATCH /connections/social-profiles/:id/sync` + Müşteriler
   ekranında sayfa satırında "izlemeye al / izlemeyi durdur", atanmamış
   sayfada erken hata, denetim kaydı. Atanmış ama izlemesi kapalı sayfa
   satırda **"gönderiler çekilmiyor"** diye işaretleniyor.

   Ayrıca gönderi listesi artık **boş dönerken sebebini söylüyor**
   (`emptyReason`): sayfa atanmamış / izleme kapalı / süpürme koşmamış —
   üçü de yapılacak işi farklı, oysa üçü de boş liste olarak görünüyordu.

   **1082 API testi** (öncesi 1074).

6. ✅ **KOD BİTTİ** — K17'nin Instagram dalı yazıldı. **1112 API testi.**

   Alan seti iki bağımsız kaynaktan çapraz doğrulandı (ayrıntı
   [`TASARIM-OLUSTUR.md` K17](TASARIM-OLUSTUR.md)): Instagram gönderisi
   `object_story_id` ile değil, **ayrı bir `adcreatives` çağrısıyla** ve kök
   seviyede üç alanla reklama çevriliyor — `object_id` (Facebook sayfası),
   `instagram_user_id`, `source_instagram_media_id`.

   `BoostRequest.source` artık ayrık birleşim: Instagram dalı sayfa kimliğini
   AYRICA istiyor, yani IG kullanıcı kimliğini sayfa kimliği sanmak derleyici
   seviyesinde imkânsız. Kreatif oluştuktan sonra geri okunup gönderdiğimiz
   kimlikle karşılaştırılıyor; eşleşmezse reklam hiç açılmıyor — "Meta kabul
   edip yanlış gönderiyi gösterir" riskinin kod karşılığı. (Bu kontrolün ilk
   hâli yanlış alanı karşılaştırıyordu; 6d'ye bak.)

   **Kural yolu bilerek kapalı kaldı:** Instagram elle boost'ta açık, kuralda
   değil. Kural otomatik ve tekrar tekrar harcıyor; doğrulanmamış bir yol ilk
   kez otomasyona verilmiyor. İlk gerçek çağrı gözle doğrulanınca
   `instagram-boost-guard.ts` silinecek.

6b. ✅ **BİTTİ** — boost faturalandırma hesabı eşleştirilebiliyor.

   **NASIL BULUNDU:** ekran düzeldi, gönderiler görselleriyle listelendi ve her
   satırda tek bir engel kaldı: "bu sayfaya bağlı bir reklam hesabı yok".
   `social_profiles.linked_ad_account_id` **sekiz yerde okunuyor, hiçbir yerde
   yazılmıyordu** — ne uç nokta ne düğme. `sync_enabled` ile birebir aynı
   boşluk ve ikisi de aynı gün bulundu. Zod şeması bile vardı
   (`linkBoostAccountSchema`), yalnızca ucu yazılmamış.

   `PATCH /connections/social-profiles/:id/ad-account` + Müşteriler ekranında
   sayfa satırının altında "Boost hesabı" seçicisi. Müşteri ve platform
   eşleşmesi **sunucuda** doğrulanıyor: başka müşterinin hesabından
   faturalandırmak, harcanan parayı geri getirmeyen bir karışıklık. Google
   hesabı seçeneklere hiç girmiyor.

   **Test harness'inde de bir tuzak çıktı:** `socialProfile.update` taklidi
   yalnızca üç alanı tanıyor ve **bilmediğini sessizce yok sayıyordu** — gerçek
   kod doğru çalışırken test "güncellenmedi" diyordu. Artık tanımadığı alanda
   hata fırlatıyor; tersi (taklit atlarken testin geçmesi) daha kötü olurdu.

   **1118 API testi.**

6c. ✅ **BİTTİ** — ilk canlı çağrılar üç hata çıkardı, üçü de düzeltildi.

   **(1) Lokasyon türü taşınmıyordu.** Meta: *"integer türü bekleniyor, ancak
   TR değeriyle bir string alındı"* (subcode 1885097) ve *"Şehir Hedeflemesi
   Desteklenmiyor"* (1487479). Seçilen her şey şehir sanılıyordu; ülke kodu iki
   harf, şehir anahtarı sayısal. Artık `locations: [{key, type}]` ve üç kova
   (`countries` / `regions` / `cities`).

   **Aynı düzeltmede hata VERMEYEN bir hata da kapandı:** lokasyon seçilse bile
   ülke geneli gönderilmeye devam ediyordu ve Meta bu kovaları BİRLEŞİM olarak
   uyguluyor — "Türkiye + İzmir" = Türkiye geneli. Yani İzmir seçilen bir boost
   bütün Türkiye'ye gidiyordu, sessizce.

   **(2) MİMARİ: platform çağrısı transaction'ın içindeydi.** `withTenant` RLS
   bağlamı için etkileşimli transaction açıyor ve Prisma'nın sınırı **5 saniye**;
   Meta'ya üç-dört çağrı üretimde **12,5 saniye** sürdü. Sonuç çift sessiz hata:
   transaction ölünce `fail()` bile yazamadı (Meta'nın mesajı kayboldu, kullanıcı
   "beklenmeyen bir hata" gördü) ve kayıt `approved`'da kaldı — oysa kampanya
   Meta'da oluşmuş olabilir.

   Yürütücü artık hazır bir `tx` değil bir **çalıştırıcı** (`TxRunner`) alıyor;
   her DB adımı kendi kısa transaction'ında, platform çağrısı ikisinin arasında.
   Kayıt düşerse boost `failed` DEĞİL `creating` kalıyor ve dış kimlikler log'a
   yazılıyor: `failed` yazmak satırı yeniden denenebilir yapar ve İKİNCİ bir
   kampanya açardı.

   Üç test bu kuralı doğrudan kodluyor (çağrı anında açık transaction yok; DB işi
   en az üç turda; kayıt düşerse `creating` kalıyor) ve mutasyonla doğrulandı.

   **1125 API testi.**

6d. ✅ **BİTTİ** — kreatif doğrulaması **kendi kontrolüm** yüzünden boost'u
   reddetti; karşılaştırma yanlış alanları eşleştiriyordu.

   **NASIL BULUNDU:** ilk canlı Instagram boost'u şu mesajla düştü —
   *"Instagram kreatifi YANLIŞ gönderiye bağlandı: gönderilen
   18090331100389207, Meta'nın kullandığı 18117166231898791."* Kontrolün amacı
   doğruydu ve **para harcanmadı**, ama karşılaştırması yanlıştı: bizim
   yazdığımız `source_instagram_media_id` ile Meta'nın türettiği
   `effective_instagram_media_id` **aynı kimlik uzayında olmak zorunda değil**
   — K17 üç ayrı uzay olduğunu tam bu yüzden sayıyor. Kontrol "Meta yanlış
   gönderiyi kullandı" ile "Meta aynı gönderiyi başka kimlikle raporluyor"
   arasını ayırt edemiyordu ve ikinci durumda **çalışan bir yolu kapatıyordu**.

   Artık benzeri benzerle: yazdığımız alanı geri okumak aynı uzayda kalmak
   demek, farklıysa gerçekten yanlış medya kaydedilmiş → **reddet**.
   `effective` farkı **uyarı** (engel değil), yankı hiç dönmezse de uyarı.

   **Karar saf bir fonksiyona çıkarıldı** (`decideInstagramCreativeCheck`):
   metodun içindeyken test edilemez durumdaydı ve bütün özelliğin en kritik
   kararı bu. Beş test mutasyonla doğrulandı — canlıda beni yanıltan hatayı
   (yankı yerine `effective` ile karşılaştırmak) geri koymak üçünü düşürüyor.

   **Sonraki oturum için açık kalan tek soru:** `18117166231898791` gerçekten
   başka bir gönderi mi, yoksa aynı gönderinin başka kimliği mi? Kesin cevap
   Ads Manager'da **gözle** bakmak (7. adımın önkoşulu zaten bu). Veritabanı
   tarafı da bir ipucu veriyor:

   ```
   SELECT external_id, left(message,60), published_at FROM organic_posts
   WHERE external_id IN ('18090331100389207','18117166231898791');
   ```

   İki satır dönerse Meta gerçekten başka bir gönderi kullanmış demektir ve
   **gönderdiğimiz kimliğin kaynağı** (`/{ig-user}/media` → `id`) sorgulanır.
   Tek satır dönerse kimlik uzayı farkı — bugünkü uyarı yolu doğru.

   **1130 API testi.**

7. **CANLI ÇAĞRI — tek kalan adım ve kodla değil elle yapılıyor.**

   > Ajansın kendi hesabında, **en küçük bütçeyle**, tek bir Instagram
   > gönderisiyle. Sonra Ads Manager'da reklam açılıp **doğru gönderiyi
   > gösterdiği gözle görülecek** — "200 döndü" bu projede doğrulama değil.
   >
   > Hata gelirse `boosts.error` kolonunda tam metniyle duruyor. İki bilinen
   > olasılık: `enroll_status` istenirse `OPT_OUT` eklenecek; medya kimliği
   > reddedilirse kimlik uzayı sorunu demektir ve `/{ig-user}/media` → `id`
   > dışında bir yol denenmeyecek, önce hata gövdesi okunacak.
   >
   > Facebook tarafı ayrı ve **App Review'a bağlı** — `pages_read_engagement`
   > için Advanced Access. Instagram bunu beklemiyor.
   >
   > **ÖNCE TEMİZLİK — 6c'nin transaction hatasından kalan iki artık var:**
   > (a) Ads Manager'da **"Öne çıkarılan gönderi — …"** adlı bir kampanya
   > kalmış olabilir (1000 ₺ / 14 gün denemesi): transaction 12,5 saniyede
   > ölünce kayıt yazılamadı ama kampanya Meta'da oluşmuş olabilir. Varsa elle
   > silinmeli — duraklatılmış değil, **silinmeli**; aksi halde harcamaya
   > başlar. (b) `boosts` tablosunda `approved`'da takılı kalan satır
   > (`a3e20f76-9e77-47c2-b9a0-832f9aa1c83a`) temizlenmeli, yoksa "onaylananları
   > oluştur" onu yeniden denemeye çalışır.
   >
   > **Dağıtımdan sonra panelde sırasıyla:** (1) "Hesapları yenile" — IG
   > satırlarının ana sayfa kimliğini doldurur (2. adım), (2) Müşteriler
   > ekranından ilgili sayfayı müşteriye **ata**, (3) aynı satırda
   > **"izlemeye al"**, (4) "Şimdi güncelle" ile süpürmeyi öne al. Bu dördü
   > yapılmadan gönderi listesi boş kalır — ve artık boş kalırsa hangisinin
   > eksik olduğunu ekran yazıyor.

---

## SIRADAKİ İŞ — 2. İLK GERÇEK YAZMA ÇAĞRISI (hiç yapılmadı)

**Bu oturumda yazılan hiçbir yayın yolu canlıda denenmedi.** Ne yeni Meta yolu,
ne Google. 13 Ağustos'taki ilk gerçek Meta çağrısında altı hata çıkmıştı ve
üçü sessizdi (§2); Google'ın kendi altısı olacak ve o kod tamamen
doğrulanmamış — istek gövdeleri bilgiden yazıldı, tek bir canlı çağrı gitmedi.

**Nasıl yapılmalı:** ajansın KENDİ hesabında, en küçük bütçeyle.

- **Meta:** Advanced Access hâlâ yok; müşteri hesapları App Review'a bağlı,
  ajansın kendi hesabında çalışabilir.
- **Google:** kampanya zaten DURAKLATILMIŞ açılıyor ve öyle kalıyor — para
  harcamadan Google Ads'te gövdenin doğru oturup oturmadığı görülebilir.
  Alan doğrulaması için `pnpm --filter @advetics/api google-check`.
- Google denemesi için kreatifin **en az 3 başlık ve 2 açıklama** taşıması
  gerekiyor (RSA sınırı). Kütüphane → Kreatifler ekranından düzenlenebiliyor.

Hata mesajı geldiğinde tam metniyle getir; kod tarafı ona göre düzeltilecek.

**Bu iki iş birleştirilebilir:** elle boost, ajansın kendi Instagram hesabında
en küçük bütçeyle denenirse hem yeni ekran hem de ilk gerçek yazma çağrısı aynı
anda doğrulanmış olur.

---

## A. TAMAMLANDI — "Oluştur" bölümü yeniden kuruldu

20 commit, `afc173e..64fe10c`. Tasarım kararları ve gerekçeleri
[`TASARIM-OLUSTUR.md`](TASARIM-OLUSTUR.md) içinde; **yirmi karardan on dördü
kapalı, altısı açık** (K2, K3, K8, K10, K12, K15). Elle boost'un K16–K18'i
16 Ağustos'ta kapandı ve yanlarına K19 ile K20 eklendi. Kapanmış kararların
gerekçesi belgede yazılı ve geri alınabilir.

### Ne değişti

| Önce | Sonra |
|---|---|
| Meta'ya yazan ÜÇ ayrı yol, ortak kodu yok | Tek ağaç: `draft_campaigns` → `draft_ad_groups` → `draft_ads`, tek yayın yolu |
| Tek sihirbaz, "basit/gelişmiş" anahtarı | İKİ AYRI YÜZEY: `/reklam-olustur/basit` ve `/reklam-olustur/uzman` |
| Metinler `ad_drafts`'ın üç sütununda | Kreatif kütüphanesi: metin havuzu + görsel havuzu (`/kutuphane/kreatifler`) |
| Üç oran kutusu, "kırp ve yeniden yükle" | Tarayıcıda kırpma: tek görselden üç oran, odak noktalı |
| Toplu = Excel/TSV yapıştırma + ham Meta kimlikleri | Kampanya çoğaltma: kaynağı seç, yalnızca DEĞİŞENİ yaz |
| Boost ayrı ada | Boost ağaçta: aday da, yayınlanan da aynı listede |
| Google yazma yolu YOK | Google arama kampanyası yazıldı (PAUSED açılıyor) |
| `special_ad_categories` sabit `[]` | Müşteri kartında beyan + hedefleme kısıtı |
| Menüde üç madde | Tek giriş: "Reklamlar" + "Akıllı Boost" |

**987 API testi, 59 panel testi.** Öncesi 789 API testiydi.

### Bilinen ve KABUL EDİLMİŞ sınırlar

Bunlar eksik değil, bilinçli kısıt — her biri "tahmin etmektense kısıtla"
kuralının sonucu ve kullanıcıya açıkça söyleniyor:

- **Çoklu ad set yayınlanmıyor.** Ağaç taşıyor ama `publishDraft` tek ad set
  yazıyor ve ikincisini açmanın yolu canlıda hiç denenmedi.
- **Google'da yalnızca Arama.** PMax dönüşüm takibi istiyor ve bu üründe
  piksel/etiket hikâyesi hiç yok (K14).
- **Bütçe tahmini yok.** `delivery_estimate` hiç çağrılmadı; tutmayan bir
  tahmin hiç göstermemekten kötü (K8, açık).
- **Boost varyantı yok** — aynı gönderi ikinci kez öne çıkarılmıyor.
- **`ad_drafts` emekli ama SİLİNMEDİ.** Üretimde 0 satır olduğu 16 Ağustos'ta
  ölçüldü (§B), yani tablonun düşürülmesi artık güvenli — ama ayrı bir iş ve
  bu oturumda yapılmadı (K11).

### Bu oturumda çıkan ve düzeltilen üç sessiz hata

Hiçbiri aranan şey değildi; başka bir işi yaparken ortaya çıktılar:

1. **Kural özeti olmayan adayları sayıyordu.** `INSERT ... ON CONFLICT DO
   NOTHING` `$executeRaw` ile çağrılıyordu ve çakışan (hiç yazılmayan) tur da
   `created++` sayıyordu.
2. **Kreatifte yanlış teşhis.** Aynı görsel iki kez seçilince SQL tekrarları
   tekilleştirdiği için "1 görsel arşivde bulunamadı" diyordu; görsel arşivde
   duruyordu, sorun tekrarın kendisiydi.
3. **Google hata metinleri bayattı.** "Basic Access onayı bekleniyor" diyordu;
   erişim 16 Ağustos'ta alınmıştı ve mesaj kullanıcıyı çözülmüş bir sorunu
   çözmeye gönderiyordu.

### Tekrar edilmemesi gereken iki tuzak (bu oturumda ikisine de düşüldü)

- **`Prisma.sql` şablonu içindeki SQL yorumunda BACKTICK KULLANMA.** Şablonu
  ortasından kapatıyor; hata `',' expected` ya da `Expected ")"` diyor ve
  sebebi hiç belli olmuyor. Bu oturumda İKİ KEZ oldu.
- **Belgeyi script'le düzenlerken "sonraki açık satıra kadar" deseni
  kullanma.** Aradaki kapalı bölümleri yutuyor; TASARIM-OLUSTUR.md'de K5 ve
  K6 böyle silindi ve tesadüfen fark edildi.

---

## B. DAĞITILDI — 2026-08-16, ELLE

`64fe10c` sunucuya elle çıktı. Otomatik dağıtım **hâlâ çalışmıyor** (§0'daki
uyarı geçerli); bu deploy `su - advetics` → `git pull` → `./scripts/deploy.sh`
ile yapıldı. Beş migration, ardından `01_constraints` / `02_rls` /
`03_partitions` sorunsuz uygulandı; üç süreç de `advetics` kullanıcısı altında
`online` döndü.

Doğrulandı: `/api/draft-campaigns` ve `/api/creatives` artık **401** (deploy
öncesi 404'tü — rota var, kimlik istiyor), `/api/health` 200 ve veritabanı
gecikmesi 2 ms.

**`ad_drafts` ÜRETİMDE BOŞ — 0 satır.** Eski oluşturucunun emekliye ayrılması
hiçbir şeyi kilitlemedi, taşınacak veri yok ve panelde "eski taslaklar" bölümü
hiç görünmüyor. Bu, K11'in bekleyen tek koşuluydu: **tablo artık güvenle
düşürülebilir.** Düşürülürken `ad_draft_assets`, `02_rls.sql`'deki politikalar
ve `pglite-harness.ts`'nin `TRUNCATE` listesi birlikte temizlenmeli.

Kullanılan sorgu — `psql -d advetics` ÇALIŞMIYOR (rol adı işletim sistemi
kullanıcısından alınıyor, oysa roller `advetics_*`) ve bağlantı dizesindeki
`?schema=public` libpq tarafından reddediliyor, o yüzden kesiliyor:

```
cd ~/htdocs/advetics.com
export DB_URL="$(grep -m1 '^DIRECT_DATABASE_URL=' .env | sed -e 's/^[^=]*=//' -e 's/^["'"'"']//' -e 's/["'"'"']$//' -e 's/?.*$//')"
psql "$DB_URL" -c "SELECT status, count(*) FROM ad_drafts GROUP BY status;"
```

`.env` **`set -a` ile alınmamalı** — `NODE_ENV=production`'ı kabuğa sokuyor ve
`deploy.sh`'ı `prisma: not found` ile düşürüyor. Yukarıdaki tek değişkeni
okuyor.

---

## 0. TAMAMLANDI VE CANLIDA — bağlantı modeli ajans seviyesine çevrildi

**1–6. adımların tamamı bitti** (§0.1–0.3) ve **2026-08-15'te üretime çıktı**
(`ade9f33`). Üç migration uygulandı, `db:rls` geçti, üç süreç de ayakta.
Veritabanı deploy anında boştu (0 müşteri / 0 hesap / 0 sayfa), yani yeni
tekillik kısıtları hiçbir mükerrer satıra takılmadı.

**Sıradaki iş kodda değil panelde:** müşterileri oluştur → Meta ve Google'ı
BİRER KEZ bağla → havuza düşen hesapları ve sayfaları müşterilere ata. Atama
iki ekrandan da yapılabiliyor (Platform Bağlantıları / Müşteriler).

Bu bölüm işin NEDEN yapıldığını ve nasıl karara bağlandığını anlatıyor; sonuç
ve kalan açıklar §0.1–0.3'te. Aşağıdaki bölümler (§1 ve sonrası) 13 Ağustos'taki
Meta durumunu anlatıyor ve hâlâ geçerli.

> **DİKKAT — OTOMATİK DAĞITIM HÂLÂ ÇALIŞMIYOR (2026-08-16 tespiti).**
>
> Aşağıdaki "artık otomatik" iddiası YANLIŞ ve bu satır düzeltilmeden
> bırakılmamalı: GitHub Actions'ta **30 koşunun 30'u başarısız, hiç başarılı
> koşu yok** — `13fa58e`'nin "düzeltildi ve doğrulandı" dediği koşu dahil.
>
> `13fa58e` gerçekten bir şeyi düzeltti: iş akışı dosyası artık GEÇERLİ ve
> job'lar başlıyor. **Doğrulama işi tamamen yeşil** (typecheck, testler,
> derleme, RLS kapsaması). Düşen adım bir sonraki: **"SSH ile dağıt"**.
>
> Yani tablo şu: eskiden dağıtım HİÇ BAŞLAMIYORDU, şimdi başlıyor, kodu
> doğruluyor ve son adımda sunucuya bağlanamadan düşüyor. İkisi de aynı sonucu
> veriyor — sunucuda eski kod — ama ikincisi daha sinsi, çünkü ekranda çalışan
> bir iş akışı görünüyor.
>
> **Bakılacak yer:** adım beş sırra bağlı — `VPS_HOST`, `VPS_USER`,
> `VPS_SSH_KEY`, `VPS_SSH_PORT`, `VPS_APP_PATH`. Öncesindeki her şey yeşilken
> orada düşmesi, sırların eksik/yanlış olduğuna ya da anahtarın sunucuda
> yetkili olmadığına işaret ediyor. Log'u okumak depo yönetici yetkisi
> istiyor.
>
> **O düzelene kadar dağıtım ELLE yapılmalı** (aşağıdaki yol geçerli).

> ~~**DAĞITIM ARTIK OTOMATİK.**~~ `main`'e her push GitHub Actions üzerinden
> sunucuya deploy ediyor — **etmesi gerekiyordu.** Bu üç ay boyunca ÖLÜYDÜ: 2026-08-03'te iş akışı
> dosyasında boş bir `with:` kaldı, Actions dosyayı geçersiz sayıp hiçbir job
> çalıştırmadı ve kimse fark etmedi — çünkü ortada başarısız bir dağıtım değil,
> hiç başlamamış bir dağıtım vardı. Sunucu `37a2264`'te takılı kaldı ve
> deploy'lar elle yapılmaya devam etti. Düzeltildi (`13fa58e`) ve doğrulandı.
> Elle dağıtım yolu hâlâ geçerli (`git pull` + `./scripts/deploy.sh`), ama
> artık istisna.
>
> **Deploy sırasında iki tuzak daha çıktı, ikisi de düzeltildi ve depoda duruyor:**
> `preflight.sh` veritabanını "kapalı" gösteriyordu (`?schema=public`
> parametresini libpq reddediyor) — paylaşımlı sunucuda PostgreSQL'i kurcalamaya
> gönderebilecek bir yanlış teşhis. `deploy.sh` ise ortamda `NODE_ENV=production`
> varsa devDependencies'i atlayıp `prisma: not found` ile düşüyordu; artık
> `--prod=false` ile kuruyor. **`.env`'i kabuğa `set -a` ile almak** bu ikincisini
> tetikleyen şeydi — teşhis için yaparsan sonra yeni bir kabuk aç.

### 2026-08-16: kurulum canlıda tamamlandı

Panelden yapılan ve DOĞRULANAN adımlar:

- Meta bağlandı, **157 hesap havuza düştü** — tek yetkilendirme, kopma yok.
  Modelin canlıdaki ilk sınavı ve geçti.
- Müşteriler oluşturuldu, hesaplar atandı ve izlemeye alındı.
- Metrikler akıyor. `insights_daily` 2026-07-23 → bugün, 1.222 satır.

**Geçmiş veri konusunda çıkan soru ve cevabı:** 90 gün çekildi ama yalnızca ~24
günlük veri geldi. 180 gün denendi, **tek satır bile değişmedi**. `sync_jobs`
kayıtları işlerin doğru aralıkla (2026-05-17 ve 2026-02-16) gittiğini,
`succeeded` bittiğini ve kısmi gelmediğini gösteriyor. Yani Meta'da o reklam
hesapları için 2026-07-23'ten eski veri YOK. Kod tarafında sorun değil.

> **KONU KAPALI — yapılacak bir şey yok.** Kullanıcının kararı: veri
> gerçekten yok, kod tarafında da panelde de bir iş açılmayacak. Bu satır
> tekrar araştırılmasın diye duruyor: aynı soru yeniden gelirse cevabı
> yukarıdaki `sync_jobs` kanıtı.
>
> Yalnızca şu not kalsın: metrik işinin ürettiği `"N satır · M atlandı"`
> özeti tabloya YAZILMIYOR, yalnızca worker log'una düşüyor. Bugün bunu
> sorgulayamadık. Başka bir sebeple metrik eksikliği araştırılırsa ilk
> bakılacak yer burası olmayacak — akılda tutulmalı.

### 2026-08-16'da yapılan diğer işler

- **Davet akışı kaldırıldı**, kullanıcı doğrudan ekleniyor (§3.6).
- **Kullanıcı kartında "+ Yetki ekle"** — mevcut kullanıcıya parola sormadan
  müşteri yetkisi (`POST /memberships`).
- **Panelde "Geçmiş veriyi çek"** — 7/30/90/180 gün, kuru çalışma + onay
  (`POST /sync/backfill`). Sunucudaki `sync-cli` hâlâ duruyor ve çok müşterili
  toplu iş için daha pratik.
- **CI düzeltildi** — otomatik dağıtım 3 Ağustos'tan beri ölüydü.

### Sorun

Bağlantılar **müşteri bazlı**: `platform_connections.client_id` zorunlu ve
keşfedilen hesap, bağlantının kurulduğu müşteriye yazılıyor
(`connections.service.ts` → `discoverAndStore`, `clientId: conn.clientId`).

Ajansın tek bir Meta kimliği **157**, tek bir Google girişi **127** reklam
hesabına erişiyor. 12 müşteri için bu modelde aynı kimliği 12 kez
yetkilendirmek gerekiyor ve iki şey birden bozuluyor:

- Her müşteri kendi kopyasında yine 157 hesabı görüyor → 12 × 157 satır.
- Aynı kimlik tekrar tekrar yetkilendirildiği için platform tarafında önceki
  token geçersizleşiyor. **Canlıda gözlendi:** bir müşteriye hesap bağlanınca
  diğerinin bağlantısı kopuyor.

Kod bu kopmanın sebebi DEĞİL. Bağlantı `clientId + platform + externalUserId`
üçlüsüyle upsert ediliyor, yani başka müşterinin satırına dokunmuyor; bağlantıyı
iptal eden tek yer elle "Kaldır" akışı. Sorun modelin kendisinde.

### Hedef

Bağlantı **ajansa** ait olur. Meta bir kez bağlanır, 157 hesap havuza düşer,
her müşteriye hangi hesapların ait olduğu panelden seçilir. Tekrar
yetkilendirme yok, dolayısıyla kopma da yok. Bu, Socianty'de çalışan model.

### Neden düşünülenden büyük

**Ne `platform_connections` ne `ad_accounts` tablosunda `org_id` var** — ikisi
de yalnızca `client_id` taşıyor. Yani "ajansa ait bağlantı" ve "henüz
atanmamış hesap" kavramlarının veritabanında tutunacağı bir yer yok.

| # | Adım | Risk | Durum |
|---|---|---|---|
| 1 | İki tabloya `org_id` ekle | Düşük | ✅ bitti |
| 2 | `client_id`'yi nullable yap (atanmamış havuz) | **Yüksek — 125 kod noktası** | ✅ bitti |
| 3 | **RLS politikalarını yeniden yaz** | **Yüksek — 126 politika satırı** | ✅ bitti |
| 4 | Tekillik kısıtı `[clientId,…]` → `[orgId,…]` | Orta | ✅ bitti |
| 5 | Keşif kodu havuza yazsın | Düşük | ✅ bitti |
| 6 | Hesap atama uç noktası + arayüz | Düşük | ✅ bitti |
| ~~7~~ | ~~Mevcut hesapları taşı~~ | **GEREKSİZ — aşağıya bak** | — |

### 2026-08-15: veritabanı sıfırlandı, 7. adım ortadan kalktı

`db:reset-clients` çalıştırıldı. Silinen: 14 müşteri, 8 bağlantı, **1.134
reklam hesabı**, 712 kampanya, 11.222 metrik satırı, müşteriye bağlı 12
üyelik. Kalan: 3 kullanıcı, organizasyon, marka profili, org geneli üyelik.

Migration'ı önemli ölçüde kolaylaştırıyor:

- **7. adım tamamen gereksiz.** Taşınacak veri yok; en riskli ve geri alması
  en zor adım buydu.
- **2. ve 4. adımın VERİ riski sıfır.** Boş tabloda `DROP NOT NULL` ve kısıt
  değişikliği anında ve güvenli.
- Geriye kalan risk tamamen **kod tarafında**.

### Ölçülmüş yayılma alanı (tahmin değil, sayıldı)

```
apps/api/src içinde .clientId erişimi     125 nokta
02_rls.sql içinde client_id geçen satır   126
platform_connections clientId kullanımı     9
```

125 noktanın hepsi kırılmayacak, ama `enqueueSyncJob({ clientId:
account.clientId })` gibi `string` bekleyen yerler `string | null` alınca
derlenmeyecek. Her biri bilinçli bir karar istiyor: bu yol atanmamış hesapla
çalışabilir mi, yoksa erken hata mı vermeli?

**Doğru varsayılan: erken hata.** Atanmamış bir hesap için senkronizasyon
kuyruğa GİRMEMELİ — girerse `client_id`'si NULL bir `sync_jobs` satırı oluşur,
RLS onu kimseye göstermez ve iş sessizce kaybolur. Bu projenin klasik hata
deseninin ta kendisi.

`pnpm typecheck` bu adımda yol gösterici: derleyici nullable'ın dokunduğu her
yeri tek tek söyleyecek. Listeyi baştan çıkarmaya çalışma, derleyiciyi takip
et.

**3. adım neden en kritik:** `client_id` nullable olduğu anda, politikası
yazılmamış her satır KİMSEYE AİT OLMAYAN bir satır. Yanlış yazılan tek bir
politika atanmamış hesapları yanlış kiracıya açar. Beklenen şekil:

```sql
-- bağlantılar: org bazlı
USING (org_id = app.current_org_id())

-- hesaplar: atanmamış olan yalnızca org yöneticisine görünür
USING (
  org_id = app.current_org_id()
  AND (
    CASE WHEN client_id IS NULL
      THEN app.is_org_admin()
      ELSE app.can_access_client(client_id)
    END
  )
)
```

**RLS'i testler yakalamıyor** (CLAUDE.md §3). Koşum ortamı politikaları
kurduktan sonra zorlamayı kapatıyor. `active-client-scope.spec.ts` fonksiyon
mantığını doğrudan çağırarak sınayabiliyor — aynı yöntem buraya da
uygulanmalı — ama tablo politikalarını hiçbir test görmüyor. Politikalar ELLE
gözden geçirilecek.

> **Bu artık geçerli değil** — §0.1'e bak. `SET ROLE` ile politikalar test
> ortamında da uygulanabiliyor ve tablo politikaları test edildi.

**7. adım geri alması zor:** canlı veritabanında 284 satırın sahipliği
değişiyor. Migration'dan önce yedek alınmalı.

### Sıra

1–4 tek migration'da gitmeli (yarım uygulanmış şema = kırık keşif kodu).
5–6 ardından, 7 en son ve ayrı.

---

## 0.1. 1–4. adımlar YAPILDI — ne değişti, sırada ne var

Migration: `20260815120000_agency_connections`. Şema, RLS, kısıtlar ve derleyen
kod tek commit'te. **745 API testi geçiyor** (öncesi 726; 19'u bu işin yeni
testleri). `pnpm typecheck` API ve panelde temiz.

### Ölçülen yayılma tahminden küçük çıktı

125 `.clientId` noktasından **yalnızca 25'i** derleyiciyi düşürdü ve bunlar 8
dosyaya toplanmıştı. Sebebi tipin çoğu yerde `AdAccount`'tan değil, kendi
`client_id`'si NOT NULL olan alt tablolardan (kampanya, metrik, kural) gelmesi.
Planın "listeyi baştan çıkarma, derleyiciyi takip et" tavsiyesi doğru çıktı.

### Kararlar

- **Atanmamış hesap = erken hata.** `assertAssigned()`
  ([ad-account-assignment.ts](../apps/api/src/common/utils/ad-account-assignment.ts))
  yapı ve metrik senkronizasyonunun girişinde duruyor. `setAccountSync` de
  atanmamış hesabın izlemeye alınmasını reddediyor — doğrulama kullanım anında
  değil, GİRİŞ anında.
- **Toplu yollarda atlamak, ama sayarak.** Süpürme işi atanmamış hesabı geçiyor
  ve kaç tane geçtiğini log'a yazıyor. `sync -- portfolio` havuzdaki hesap
  sayısını başta basıyor.
- **`ON DELETE SET NULL`.** Müşteri silinince hesap ve bağlantı ölmüyor,
  havuza dönüyor. `db:reset-clients` buna göre güncellendi: bağlantı ve
  hesabın kalması artık "eksik cascade" alarmı üretmiyor.
- **Kompozit yabancı anahtar** `(client_id, org_id) → clients(id, org_id)`:
  hesap başka organizasyonun müşterisine atanamıyor. RLS'in iki koşulunun
  birbirini doğrulamasını veritabanı garantiliyor.
- **Sosyal profiller kapsam dışı** (`social_profiles.client_id` hâlâ NOT NULL).
  Ajans geneli bağlantıda sayfa keşfi ATLANIYOR; atlandığı log'a ve keşif
  özetine yazılıyor. 5. adımda karara bağlanmalı.

### RLS artık TEST EDİLİYOR

Plan "politikaları testler yakalamıyor, elle gözden geçir" diyordu. Artık
gerek yok: `SET ROLE` ile sahibi olmayan bir role geçince PGlite politikaları
gerçekten uyguluyor. `ad-account-pool-rls.spec.ts` bunu yapıyor — deponun ilk
gerçek tablo politikası testi. Aynı yöntem başka tablolara da uygulanabilir.

### 6. ADIM İÇİN BAĞLAYICI NOT — deneyle bulundu

Atama uç noktası bağlamı **`activeClientId: null`** ile kurmak zorunda:

```ts
this.prisma.withTenant({ ...ctx, activeClientId: null }, (tx) => …)
```

Sebebi Postgres kuralı: bir UPDATE'ten sonra **yeni satır, tablonun SELECT
politikasından da geçmek zorunda**. `can_access_client()` panelde seçili
müşteriye daraltıyor; org yöneticisi A müşterisi seçiliyken havuzdaki bir
hesabı B'ye atamaya çalışırsa satır kendi görüş alanının dışına çıkıyor ve
Postgres reddediyor:

```
new row violates row-level security policy for table "ad_accounts"
```

**WITH CHECK'i gevşetmek çözmüyor** — denendi, engel SELECT politikasında.
SELECT politikasındaki daraltmayı kaldırmak ise ASLA doğru değil: tam olarak o
daraltma, yöneticinin Çiftçi Grup seçiliyken Mirnas'ın verisini görmesi
hatasının düzeltmesiydi. Davranış `ad-account-pool-rls.spec.ts` içinde
kilitli.

---

## 0.2. 5–6. adımlar YAPILDI — model tamamlandı

Migration: `20260815160000_agency_oauth_state`. **757 API testi geçiyor**
(1–4'ten sonra 745'ti). Her iki uygulama da derleniyor.

### Akış artık şöyle

1. **Bağlan** — Platform Bağlantıları ekranı müşteri seçimi İSTEMİYOR.
   `oauth_states.client_id` nullable oldu; ajans geneli akışta NULL yazılıyor.
2. **Keşfet** — erişilen bütün reklam hesapları HAVUZA düşüyor
   (`client_id IS NULL`), varsayılan olarak izleme kapalı.
3. **Ata** — `PATCH /connections/ad-accounts/:id/client`, gövde
   `{ clientId: string | null }`. `null` = havuza geri koy.
4. **İzle** — yalnızca atanmış hesap izlemeye alınabiliyor.

### Kararlar

- **Atama ve bağlantı yönetimi ORG YÖNETİCİSİ işi** (`@RequireOrgAdmin`):
  `authorize`, `reauthorize`, `disconnect`, `ad-accounts/:id/client`. RLS zaten
  aynı şeyi söylüyordu ama decorator olmadan hata "kayıt bulunamadı" ya da ham
  bir politika ihlali olarak çıkıyordu — yetki sorunu olduğu anlaşılmıyordu.
  Panelde de bu düğmeler yalnızca yöneticiye gösteriliyor.
- **Atama kalkınca izleme kapanıyor.** Açık kalsaydı hesap ekranda "izleniyor"
  görünür, süpürme işi onu eler, hiç veri gelmez ve hiçbir hata çıkmazdı.
- **`GET /connections` kapsamı isteğin kendisinden kuruluyor**, oturumdaki
  seçimden değil. Parametresizse daraltma kapalı (havuz görünür); `?clientId=X`
  varsa X'e daraltılıyor — kurallar ekranı adres çubuğundaki müşteriyle
  çalışıyor ve oturumdaki seçim başka biri olabiliyor. Eskiden bu durumda ekran
  sessizce boş bir hesap listesi gösterirdi.
- **Sosyal profiller de `?clientId` ile süzülüyor.** Bağlantı müşteriye aitken
  bu daraltma örtüktü; org geneline çıkınca kayboldu ve formlar ekranı başka
  müşterilerin Facebook sayfalarını listeleyecekti.
- **Yönetici (MCC) hesabı atanamıyor** — reklam yayınlamıyor, atamak boş bir
  senkronizasyon turu ve boşa kota demek.

### Atama iki ekrandan da yapılabiliyor

- **Platform Bağlantıları** — bağlantı bağlantı: "bu Meta kimliği neye
  erişiyor, hangisi kimin".
- **Müşteriler** — müşteri müşteri: her kart kendi reklam hesaplarını ve
  sayfalarını listeliyor, havuzdan arayıp atayabiliyor, "çıkar" ile havuza geri
  koyabiliyor. Ajans müşteri müşteri çalışıyor; havuzda 157 satır varken tek
  bir hesabın kime ait olduğunu bulmanın başka yolu yoktu.

Havuz listesi Müşteriler ekranında **listelenmiyor, aranıyor** — 12 kartın her
birine 157 satır basmak ekranı kullanılamaz hâle getirirdi. Havuz zaten
yalnızca org yöneticisine dönüyor (RLS), yani müşteri düzeyindeki kullanıcı
kendi varlıklarını görüyor ama atama kontrollerini görmüyor.

---

## 0.3. Sosyal profiller de havuz modelinde

Migration: `20260815180000_agency_social_profiles`. **769 API testi geçiyor.**

5–6. adımlarda `social_profiles` kapsam dışı bırakılmıştı ve sonucu somuttu:
ajans geneli bir bağlantıda sayfa keşfi HİÇ YAPILAMIYORDU (kolon zorunluydu,
hangi müşteriye yazılacağı bilinmiyordu). Yani Auto-Boost, lead formları ve
reklam yayını sayfa göremiyordu. Artık reklam hesaplarıyla birebir aynı model.

**Bir yamayı da kaldırdı:** `organic-sync` ve `lead-sync`, org kimliğini müşteri
üzerinden JOIN'leyerek buluyordu ve o yolda bir kez `org_id` kolonuna MÜŞTERİ
kimliği yazılmıştı — RLS hiçbir satırı eşleştirmemiş, gönderiler panelde hiç
görünmemişti. Kolon artık sayfanın kendisinde.

**Tekillik bağlantı bazından org bazına geçti.** Eski kısıt
`(connection_id, external_id)` idi; ikinci bir Meta kimliği bağlandığında aynı
Facebook sayfası iki satır olurdu — reklam hesaplarında tam olarak bu, üretimde
1.134 mükerrer satır üretmişti.

**Atanmamış sayfada ne olur, nerede yazar:**

| Yol | Davranış |
|---|---|
| Organik gönderi senkronizasyonu | Süpürmede atlanır, sayısı log'a yazılır |
| Lead webhook'u | Kayıt YAZILMAZ, `error` seviyesinde loglanır (Meta'ya 200 döner, yoksa abonelik kapanır) |
| Lead formu oluşturma | "Bu sayfa henüz bir müşteriye atanmamış" |
| Reklam taslağı | Aynı mesaj |
| Boost kuralı | Aynı mesaj + organik gönderi çekilmediği uyarısı |

**Sayfanın müşterisi DEĞİŞİRSE geçmiş taşınmıyor** — formlar ve toplanmış
kayıtlar eski müşteride kalıyor. Bir markanın topladığı potansiyel müşteriler
başka bir markanın CRM'ine geçemez. Kaç form kaldığı yanıtta dönüyor ve panelde
uyarı olarak gösteriliyor; söylenmezse kullanıcı formlarını kaybettiğini sanar.

---

Bu belge yeni bir oturumun (ve yeni bir hesabın) kaldığı yerden devam
edebilmesi için. Ayrıntılı durum [`DURUM.md`](DURUM.md) içinde; çalışma
kuralları kök dizindeki [`CLAUDE.md`](../CLAUDE.md) içinde ve her oturumda
otomatik yükleniyor.

---

## 1. Tam olarak nerede durduk

**Meta yayın yolu kodda tamamlandı, platform yapılandırmasında takıldı.**

13 Ağustos'ta arşiv testi sırasında **ilk gerçek Meta yazma çağrısı** yapıldı.
Altı hata çıktı, altısı da düzeltilip teste bağlandı. Yedinci engel kod değil:

```
subcode=1885183 — Reklam kreatif gönderisi, geliştirme modundaki bir uygulama
tarafından oluşturuldu.
```

> **2026-08-16: YAPILDI.** Uygulama Canlı moda alındı ve `subcode=1885183`
> engeli kalktı. Aşağıdaki talimat tarihsel kayıt olarak duruyor.

**Kullanıcının yapması gereken:** Meta uygulamasını developers.facebook.com
üzerinden **Geliştirme → Canlı** moduna almak. Anahtar panelin üstünde, uygulama
adının yanında (ya da sol menüde "Uygulama İncelemesi" sayfasının başında).
Açılmıyorsa Meta şunları istiyor: gizlilik politikası adresi
(`https://advetics.com/gizlilik` — var), uygulama simgesi 1024×1024, kategori,
veri silme geri araması (`POST /connections/meta/data-deletion` — var).

Canlı moda geçince tekrar denenmeli. İki sonuçtan biri gelecek:

- **Reklam oluşur** → kendi ajans hesaplarında canlı mod + standart erişim
  yetiyor demektir.
- **`ads_management` Advanced Access hatası** → App Review gerekiyor; müşteri
  hesaplarına erişim onaya kadar bekler.

> **Uyarı:** Kullanıcı bu ararken uygulama ayarlarındaki *"Native or desktop
> app?"* anahtarını açtı. **Kapalı olmalı** — Advetics sunucuda çalışan bir web
> uygulaması, app secret tarayıcıya gitmiyor. Açık bırakmak OAuth doğrulama
> davranışını değiştirip mevcut bağlantıları bozabilir.

## 2. 13 Ağustos'ta canlıda öğrenilenler

Hiçbiri birim testiyle yakalanamazdı. Hepsi kalıcı teste bağlandı.

| # | Hata | Sessiz miydi |
|---|---|---|
| 1 | 3. adım metinsiz taslak kaydedemiyordu — görsel eklemek taslak gerektiriyor ama metin 4. adımda soruluyor | Hayır |
| 2 | Hata mesajı formun en altında, ekran dışında beliriyordu | **Evet** — "tıkladım, bir şey olmadı" |
| 3 | `act_act_...` çift önek | Hayır ama mesaj *yetki sorunu* gibi okunuyordu |
| 4 | `is_adset_budget_sharing_enabled` eksik (Meta'nın yeni zorunlu alanı) | Hayır |
| 5 | Form kimliği ad set'e konmuş + çok görselli yolda **hiç yok** | **Evet** — buton hiçbir yere gitmeyen reklam |
| 6 | Teklif stratejisi platformun varsayılanına bırakılmış | **Evet** — aynı taslak iki müşteride farklı davranır |

**Ders:** yazma yollarının "test edildi" sayılabilmesi için canlı bir çağrı
şart. Ne kadar birim testi yazılırsa yazılsın bu altısı görünmezdi.

Ayrıca `http.ts` içine **yapılacak iş ipucu** katmanı eklendi: kod
değişikliğiyle çözülemeyen Meta alt kodlarına (şimdilik yalnızca 1885183)
mesajın sonunda ne yapılacağı yazılıyor. Kodla çözülecek hatalara ipucu
eklenmiyor — yanlış yönlendirme olurdu.

## 3. Bekleyen operasyonel işler

Bunlar koda değil, sunucuya/hesaplara ait.

- [ ] **`META_WEBHOOK_VERIFY_TOKEN`** sunucuda **depo kökündeki** `.env` içine
      eklenmeli (CLAUDE.md §2 — `apps/api/.env` YOK, o yol bir kez zaten
      yanlış teşhise yol açtı) ve
      Meta uygulama panelinde webhook URL'i `https://advetics.com/api/leads/webhook`
      olarak kaydedilmeli. **Bu yapılmadan hiçbir lead bildirimi gelmez.**
- [x] ~~**Google hesap listesi bayat**~~ — veritabanı sıfırlandı, konu kalmadı.
- [x] ~~**`db:seed-portfolio`**~~ — GEREKSİZ. Müşteriler 16 Ağustos'ta panelden
      elle oluşturuldu ve davet akışı kaldırıldığı için seed'in kullanıcı
      kısmı da geçersiz. Script duruyor ama çalıştırılmamalı.
- [ ] **Parola rotasyonu.** Geliştirme sırasında sohbete yapıştırılan sırlar
      var: site kullanıcısı SSH parolası, üç DB parolası, Meta app secret ve
      üç kullanıcı parolası. Hepsi değiştirilmeli.
- [ ] **Meta Business Verification + App Review** (`ads_management`,
      `leads_retrieval`). Canlı mod alındı ama Advanced Access YOK: kendi
      ajans hesaplarında yayın çalışabilir, MÜŞTERİ hesapları onaya bağlı.
- [x] ~~**Google'ı bağla.**~~ **2026-08-16: YAPILDI.** Erişim alındı, hesaplar
      bağlandı, veri akıyor. Yani okuma tarafı artık canlıda doğrulanmış
      durumda ve developer token engeli kalktı.
- [ ] **Google yazma yolu — erişim var, KOD YOK.** `google.provider.ts`'te
      `publishDraft`, `createAd`, `uploadAdImage` ve `applyAction` hâlâ kalıcı
      hata fırlatıyor. Bu doğru davranış, ama **hata metinleri artık yanlış**:
      dört kullanıcıya görünen mesaj "Basic Access onayı bekleniyor" diyor ve
      kullanıcıyı çözülmüş bir sorunu çözmeye gönderiyor. `preflight.sh`'ın
      veritabanını "kapalı" göstermesiyle aynı sınıf yanlış teşhis. Metinler
      "henüz yazılmadı"ya çevrilmeli — yeniden tasarımı beklemeden.
      Ayrıntı: [`TASARIM-OLUSTUR.md`](TASARIM-OLUSTUR.md) §9.1.

## 3.5. 14–15 Ağustos'ta yapılanlar

Hepsi canlıda. Doğrulanmayı bekleyenler işaretli.

| Commit | Ne | Canlıda doğrulandı |
|---|---|---|
| `9d1e2d3` | Tanıtım sayfası — kök artık `/login`'e değil ürüne açılıyor | ✅ |
| `1f97b53` | Portföy seed'i `.env`'i yanlış yerden okuyordu | ✅ |
| `a1b4396` | Meta hesapları `act_` öneki yüzünden hiç bulunamıyordu | ✅ |
| `904b939` `3d893d3` | `sync -- portfolio` toplu mod (kapsam zorunlu) | ❌ hiç koşulmadı |
| `159e9a8` | Müşteriler + Ekip ekranları, menüde 9 ölü bağlantı kapatıldı | ✅ |
| `ff20b72` | **Aktif müşteri süzgeci** — seçili müşteri veriyi daraltmıyordu | 🟡 kısmen |
| `dc28f79` | Ekip ekranı: davet, rol değiştirme, yetki kaldırma (davet 16 Ağustos'ta kaldırıldı — §3.6) | ❌ |
| `5b98504` | Bugün ve Son 60 gün pencereleri | ❌ |
| `37a2264` | "Şimdi güncelle" düğmesi | ❌ |
| `54e4740` | Müşteriler ekranı diğer müşterilerin hesaplarını "yok" gösteriyordu | ❌ |

**Üç tuzak burada öğrenildi, üçü de teste bağlandı:**

- Menüde "hazır mı" kararı sayfanın varlığına değil MODÜL NUMARASINA
  bakıyordu; dokuz bağlantı 404 veriyordu (`nav-routes.spec.ts`).
- `prisma/` script'lerinden biri `.env`'i yanlış yoldan okuyordu ve hata
  mesajı ("Environment variable not found") insanı yanlış yere gönderiyordu
  (`seed-env-path.spec.ts`).
- Aktif müşteri seçimi hesaplanıyor ama HİÇBİR YERDE kullanılmıyordu; org
  yöneticisi hangi müşteriyi seçerse seçsin bütün müşterilerin verisini
  görüyordu (`active-client-scope.spec.ts`).

**Bilinen açık:** `mustChangePassword` alanı veritabanına yazılıyor ama
`apps/api/src` ve `apps/web/src` altında onu OKUYAN tek satır yok — zorlama
yazılana kadar seed parolaları süresiz geçerli.

> Bu açık **2026-08-16'da büyüdü**: davet akışı kaldırıldı ve kullanıcı artık
> doğrudan ekleniyor, parolayı da ekleyen yönetici belirliyor. Yani her yeni
> kullanıcının parolası, onu ekleyen kişi tarafından biliniyor ve kullanıcı
> kendi değiştirmedikçe öyle kalıyor. Bilinçli bir karardı (zorlama ayrı bir
> iş: login yanıtı + panel yönlendirmesi + parola değiştirme sayfası) ama
> **açıldığı gün geriye dönük tarama gerekmiyor** — `createMember` alanı zaten
> `true` yazıyor.

### 3.6. Davet akışı kaldırıldı (2026-08-16)

Davet üretimde ÇALIŞMIYORDU ve bu tasarımdan değil eksiklikten geliyordu:
token üretiliyor, SHA-256 hash'i saklanıyor ve **düz metni atılıyordu** —
yalnızca `NODE_ENV !== 'production'` iken log'a düşüyordu. E-posta altyapısı
da hiç yazılmadığı için kimse daveti kabul edemiyordu; panel bunu ekranda
itiraf ediyordu bile.

Yerine **doğrudan kullanıcı ekleme** geldi (`POST /members`, org yöneticisi).
`invitations` tablosu ve `InvitationStatus` enum'u düşürüldü,
`/auth/invitations/accept` kaldırıldı, `user.invite` yetkisi silindi (ekleme
artık `user.write` altında).

İki davranış kilitlendi (`members-create.spec.ts`):

- Parola **hash'lenerek** yazılıyor — düz metin yazan bir regresyon hiçbir
  testte, hiçbir logda görünmezdi.
- **Mevcut kullanıcının parolasına dokunulmuyor.** Aynı e-posta zaten kayıtlıysa
  yalnızca yeni yetki ekleniyor ve yanıt `created: false` dönüyor; panel de
  "yazdığın parola kullanılmadı" diye uyarıyor. Aksi hâlde "ekip ekle"
  ekranından yapılan masum bir işlem çalışan bir hesabın parolasını sessizce
  sıfırlardı.

**Kalıntı:** `UserStatus` enum'unda `invited` değeri ve `users.status`
varsayılanı hâlâ `invited`. Artık bu değeri ÜRETEN kod yok (hem kayıt hem
ekleme `active` yazıyor), ama varsayılan olarak dururken statüsü açıkça
verilmeyen bir kullanıcı oluşturulursa o kullanıcı giriş yapamaz
(`tenant-context.service` `status !== 'active'` ise reddediyor). Temizlemek
ayrı bir migration ister.

## 4. Sıradaki geliştirme adayları

Kullanıcının onayladığı dört maddelik sıra tamamlandı (formlar → lead CRM →
gelişmiş kampanya oluşturucu → akıllı varlık yönlendirme), ardından varlık
arşivi de yapıldı. Açık kalanlar:

1. **Bilgi bankası ve kitle kütüphanesi** — BASE bölümünün kalan iki parçası,
   hiç başlanmadı.
2. **Bildirim altyapısı** — CENTRAL uyarılarının ve zamanlanmış raporların ön
   koşulu. Şu an hiçbir şey bildirim göndermiyor.
3. ~~**Google yazma yolu**~~ — **YAZILDI** (2026-08-16, arama kampanyası).
   Ama CANLIDA HİÇ ÇALIŞTIRILMADI; ilk gerçek çağrı sıradaki işlerden biri.
   PMax hâlâ yok ve dönüşüm takibine bağlı.
4. **Dönüşüm takibi (piksel/etiket)** — Google PMax'in ve Meta'da
   `OUTCOME_SALES`'in ön koşulu. Bu üründe hiç yok ve iki platformda da
   tavanı o belirliyor.
5. **Sunucu tarafı PDF raporu**, sağlık skoru, A/B test motoru — daha sonraya.

Ayrıntılı liste ve gerekçeler: [`DURUM.md`](DURUM.md) § 7.

## 5. Yeni hesabın ihtiyaç duyacağı erişimler

Repo bunları taşıyamaz; `hello@profaj.com` tarafında ayrıca sağlanmalı:

| Ne | Nerede |
|---|---|
| GitHub deposu | `yusufProfaj/advetics` — yeni hesaba erişim verilmeli |
| Sunucu SSH | `advetics` site kullanıcısı, gerekiyorsa root — adres parola yöneticisinde |
| Depo kökündeki `.env` | Sunucuda duruyor, git'te yok. **`apps/api/.env` diye bir dosya yok** — API, panel ve `prisma/` script'leri kökten besleniyor |
| Meta uygulaması | developers.facebook.com — yönetici yetkisi |
| Google Ads | MCC erişimi + developer token |
| Sunucu paneli | CloudPanel — adres parola yöneticisinde |

**Yerel geliştirme için `.env` şart değil:** testler PGlite kullanıyor, gerçek
veritabanı istemiyor. `pnpm install` + `pnpm --filter @advetics/api test`
doğrudan çalışır.

## 6. Günlük akış

```bash
pnpm install
pnpm --filter @advetics/api test          # 705 test
pnpm --filter @advetics/api exec nest build
pnpm --filter @advetics/web exec next build
```

Deploy (sunucuda, **site kullanıcısı olarak**):

```bash
su - advetics
cd ~/htdocs/advetics.com && git pull && ./scripts/deploy.sh
```

`deploy.sh` sırayla: bağımlılıklar → `prisma generate` →
`prisma migrate deploy` → `db:rls` (kısıtlar + RLS) → derleme → pm2 reload →
sağlık kontrolü.
