# AI Asistan — Aşamalı Plan

Bu belge bir NİYET kaydı değil, bir İŞ SIRASI. Her aşamanın sonunda ekranda
görünen bir şey var ve "bitti" ölçütü yazılı. Sıra değişebilir; ama bir aşama
atlanacaksa neyin ödeneceği burada yazılı olsun.

Kullanıcının cümlesiyle hedef:

> "müşteri ai asistana girip kurmak istediği kampanyayı amacını bütçesini ve
> hedef kitlesini belirledikten sonra sadece onaylayıp yayınlaması lazım"
> … "düşük performans gösteren kampanyaları reklam setlerini reklamlarını
> uyarı şeklinde bildirime iletmesi lazım … reklamı durdur, kreatifi yenileme,
> hedef kitle değiştirme tarzında öneriler sunup müşteriyi yönlendirmesi
> gerekiyor" … "minimum angarya maksimum performans".

---

## 0. Ölçüt — ne zaman başarılı sayılıyor

Üç sayı. Tahmin değil, ölçülecek:

1. **Yayına kadar geçen tur sayısı.** Kullanıcının yazdığı mesaj sayısı.
   Bugün panelde "Hızlı Reklam" formu ~9 alan istiyor; asistan 2 turda
   (istek + onay) yayına gitmiyorsa angaryayı azaltmamış demektir.
2. **Onaysız hiçbir para hareketi.** Yayın, bütçe değişimi ve durdurma
   insan tıklamasıyla. Bu sayı her zaman 0 olmalı.
3. **Uyarı başına yapılan iş.** Üretilen uyarıların kaçı bir aksiyona
   dönüşüyor. Hiçbiri dönüşmüyorsa uyarı gürültüdür ve kapatılmalı —
   `CLAUDE.md`: *"her raporda duran bir uyarı okunmaz hâle gelir"*.

---

## 1. Meta belgelerinden çıkan gerçekler

Kullanıcının işaret ettiği üç kart (`Get Started` → Basic Ad Creation ·
Manage Campaigns · Ad Optimization Basics) okundu. **Bu üç sayfa tanıtım
niteliğinde**: uçları ve akışı veriyor, alan/enum listelerini vermiyor —
onlar Reference altında. Aşağıdaki tablo her maddenin BİZDE nerede karşılığı
olduğunu da söylüyor, çünkü bu projenin çoğu zaten canlıda öğrenildi.

### 1a. Basic Ad Creation — dört adım, dört uç

| Adım | Uç | Bizdeki karşılığı |
|---|---|---|
| Kampanya | `POST /v25.0/act_<HESAP>/campaigns` — `name`, `objective`, `status` | `meta.provider.ts` + `goal-mapping.ts` |
| Reklam seti | `POST /v25.0/act_<HESAP>/adsets` — `name`, `campaign_id`, `daily_budget` (**cent**), `targeting` | `meta-targeting.ts` |
| Kreatif | `POST /v25.0/act_<HESAP>/adcreatives` — `object_story_spec` | `creative-texts.ts`, `ad-publisher.service.ts` |
| Reklam | `POST /v25.0/act_<HESAP>/ads` — `creative`, `adset_id`, `status` | `ad-publisher.service.ts` |

Belgenin kendi vurguları ve bizim notlarımız:

- **`status=PAUSED` ile açmak TAVSİYE EDİLİYOR.** Belge bunu "yapılandırma
  sürerken yayına girmesin" diye söylüyor. Bizde Google yolunda zaten
  duraklatılmış açılıyor ve kullanıcıya söyleniyor; Meta yolunda bu bilinçli
  olarak farklı — asistan akışında da farkı SÖYLEYECEĞİZ (Faz 1).
- **Bütçe CENT.** `daily_budget=1000` = 10,00 birim. Bizde para micros
  (BigInt) taşınıyor; dönüşüm tek fonksiyonda kalmalı, iki yerde yazılırsa
  bir gün biri 100, diğeri 1.000.000 böler.
- **API sürümü v25.0.** `.env.example` içindeki `META_API_VERSION="v25.0"`
  ile aynı; sürüm sabiti tek yerde ve doğru.

### 1b. Manage Campaigns — yalnızca beş işlem var

| İşlem | Çağrı |
|---|---|
| Ayar değiştir | `POST /v25.0/<KAMPANYA_ID>` (`objective`, `daily_budget`, …) |
| Duraklat | `POST /v25.0/<KAMPANYA_ID>` `status=PAUSED` |
| Sürdür | `POST /v25.0/<KAMPANYA_ID>` `status=ACTIVE` |
| Arşivle | `POST /v25.0/<KAMPANYA_ID>` `status=ARCHIVED` |
| Sil | `DELETE /v25.0/<KAMPANYA_ID>` — **geri alınamaz** |

Asistanın "reklamı durdur" önerisi bu tablodaki **PAUSED**'a bağlanıyor.
`ARCHIVED` ve `DELETE` asistana HİÇ verilmeyecek: ikisi de geri alınamaz ve
"durdur" isteyen kullanıcının istediği şey değil. Aynı çağrı reklam seti ve
reklam kimlikleri için de çalışıyor, yani üç seviyede de tek bir araç yeter.

### 1c. Ad Optimization Basics — iki uç

- **`/customaudiences`** — özel ve benzer kitleler.
- **`/insights`** — hesap, kampanya, reklam seti ve reklam seviyesinde;
  `fields` + `breakdowns` + `date_preset`/`time_range` ile.

**Bizim için kritik olan:** performans uyarıları için YENİ bir Meta çağrısına
ihtiyaç yok. `insights_daily` tablosu dört seviyeyi de tutuyor
(`account/campaign/ad_group/ad`) ve gecelik süpürme onu dolduruyor. Uyarı
katmanı tamamen bu veriden okunacak — mevcut uyarı sisteminin başlığındaki
kural: *"ÜRETİLEN HER UYARI MEVCUT VERİDEN OKUNUYOR … uydurulmuş bir uyarı,
hiç uyarı olmamasından kötüdür"*.

**Kaynaklar:**
[Get Started](https://developers.facebook.com/docs/marketing-api/get-started/) ·
[Basic Ad Creation](https://developers.facebook.com/docs/marketing-api/get-started/basic-ad-creation/) ·
[Create an Ad Campaign](https://developers.facebook.com/docs/marketing-api/get-started/basic-ad-creation/create-an-ad-campaign/) ·
[Create an Ad Set](https://developers.facebook.com/docs/marketing-api/get-started/basic-ad-creation/create-an-ad-set/) ·
[Manage Campaigns](https://developers.facebook.com/docs/marketing-api/get-started/manage-campaigns/) ·
[Ad Optimization Basics](https://developers.facebook.com/docs/marketing-api/get-started/ad-optimization-basics/) ·
[Insights API](https://developers.facebook.com/docs/marketing-api/insights/) ·
[Overview](https://developers.facebook.com/docs/marketing-apis/overview)

---

## 2. Bugün elimizde ne var

Sıfırdan başlamıyoruz. Envanter, olduğu gibi:

**Var ve çalışıyor**
- `ai-assistant` modülü: sohbet, Claude tool-calling, 10 araç
  (`resolve_client`, `list_ad_accounts`, `list_draft_campaigns`,
  `list_live_campaigns`, `create_creative`, `create_draft_campaign`,
  `duplicate_draft`, `pause_campaign`, `resume_campaign`, `update_budget`).
- Üç katmanlı araç modeli ve **chat içi tek kullanımlık onay kartı**
  (`onay-karti.tsx`): canlı kampanyaya dokunan her araç için.
- Sistem promptu hedef sözlüğünü `GOAL_META`'dan PROGRAMATİK üretiyor —
  ekranla asistan ayrışamıyor.
- Uyarı sistemi (`uyari-kurallari.ts`): 10 kod, hepsi KURULUM hataları.
- Kampanya aksiyonları (`campaign-actions`): canlı kampanyada pause/resume.
- Kreatif kütüphanesi, kırpma stüdyosu, varlık arşivi.

**Yok**
- Kenar çubuğunda asistan girişi (yalnızca hub kartından ulaşılıyor).
- Meta/Google ayrımı — tek asistan iki platformu birden konuşuyor.
- Sohbetten YAYIN. Bugün asistan taslağa kadar gidiyor, yayın panelden.
- **Performans** uyarısı. On uyarı kodunun hepsi kurulum/bağlantı hatası;
  "bu kampanya kötü gidiyor" diyen tek bir kod yok.
- Uyarıdan asistana köprü.

---

## 3. Kararlar

Bunlar tartışıldı ve karara bağlandı; değişirlerse bu bölüm güncellenecek.

**K1 — Yayın onayı sohbetin İÇİNE giriyor, ama insan onayı KALKMIYOR.**
İlk tasarımda `publish_campaign` diye bir araç YOKTU ve yayın panelin
"Yayınla" düğmesindeydi. Kullanıcının isteği net: *"sadece onaylayıp
yayınlaması lazım"*. Çözüm ikisini de koruyor: yayın hâlâ bir İNSAN
TIKLAMASI, ama tıklanan yer sohbetteki onay kartı. Kart harcanacak parayı,
hesabı, kitleyi ve kreatifi yazıyor. Model kendi başına yayın yapamıyor;
kart tıklanana kadar hiçbir mutasyon koşmuyor.

**K2 — İki ayrı asistan.** Meta ve Google aynı promptla yönetilemez:
hedefleme sözlüğü, bütçe modeli (Google'da bütçe AYRI KAYNAK), seviye
adları ve yazma kısıtları farklı. Tek asistan "ortalama" bir davranış üretir
ve ikisinde de zayıf olur.

**K3 — Google asistanı ÖNCE SALT OKUR.** `CLAUDE.md`: *"Google yazma yolu
canlıda HİÇ denenmedi."* Google AI ilk sürümde plan kurar, taslak yazar,
yayın YAPMAZ; ekranda bunu açıkça söyler. İlk gerçek çağrı en küçük bütçeyle
elle yapılacak (Faz 5).

**K4 — Uyarılar yeni platform çağrısı YAPMAZ.** Hepsi `insights_daily`'den.
Kota harcayan bir uyarı motoru, kotayı asıl işten (senkronizasyon) çalar.

**K5 — Eşik yoksa uyarı yok.** "Kötü performans" mutlak bir sayı değil.
Hedef CPA/ROAS Bilgi Bankası'nda tanımlıysa ona göre, değilse HESABIN KENDİ
geçmişine göre (medyan) karşılaştırılır. İkisi de yoksa o uyarı ÜRETİLMEZ —
uydurulmuş bir eşik, kullanıcıyı çalışan bir kampanyayı kapatmaya gönderir.

**K7 — Uyarı YALNIZCA panel içinde.** Mail ya da telefon bildirimi yok.
Gerekçe kullanıcının kararı; teknik gerekçesi de var: mail altyapısı müşteriye
giden rapor için kurulu ve ajans içi bir uyarıyı oraya bağlamak, bir gün
yanlış alıcıya "kampanyanız kötü gidiyor" maili göndermenin yolunu açardı.

**K8 — Hedef CPA Bilgi Bankası'nda.** Müşterinin genel profilinin parçası
(bütçe hedefiyle aynı raf), asistanın her seferinde sorduğu bir şey değil.
Boş bırakılabilir; boşsa CPA uyarısı hesabın KENDİ medyanına düşer, o da
yoksa üretilmez (K5).

**K9 — Müşteri hesabı (`client_viewer`) asistanı GÖRMÜYOR.** Menüde satır
yok, sayfa yetkiyle kapalı. Gerekçe: asistan yayın yapabiliyor ve müşteri
rolü tanımı gereği reklam yayınlayamıyor. Yetki `bulk.write` — reklam
ekranlarının kapısıyla aynı anahtar, ikinci bir anahtar uydurulmuyor.

**K6 — Asistan öneriyor, kural motoru uyguluyor.** Otomatik aksiyon isteyen
kullanıcı için zaten `kurallar` modülü var. Asistan onun yerine geçmiyor;
öneri sonunda "bunu kural yap" bağlantısı veriyor.

---

## 4. Aşamalar

### FAZ 0 — Kenar çubuğu ve platform ayrımı
*Küçük, görünür, geri kalanının önkoşulu.*

- Kenar çubuğunda `Reklam Oluştur` altına **açılır bir satır**: `AI Asistan`
  → `Meta AI`, `Google Ads AI`.
  `NavEntry` bugün düz bir liste; alt öğe desteği eklenecek
  (`children?: NavEntry[]`), `visibleSections` yetkiyi alt öğelere de
  uygulayacak. `nav-sections.spec.ts` alt öğeleri de kilitliyor.
- Rota: `/reklam-olustur/ai-asistan?platform=meta|google`. Tek sayfa, iki
  bağlam; ayrı sayfa açmak aynı sohbet kodunu ikiye bölerdi.
- Sistem promptu platforma göre dallanıyor: `buildSystemPrompt(platform, …)`.
  Hedef sözlüğü zaten `GOAL_PLATFORM_SUPPORT` okuyor; desteklenmeyen hedef
  o platformun promptuna HİÇ girmiyor.
- Google promptu "yayın yapamam, taslak kurarım" diyor (K3).

**Bitti sayılır:** menüden iki asistan da açılıyor, her biri yalnızca kendi
platformunun hedeflerini ve hesaplarını konuşuyor; `nav-sections.spec.ts`
menü/sayfa adı uyumunu kilitliyor.

---

### FAZ 1 — Canlı kampanyalar panelde
*Kullanıcının cümlesi: "sadece adveticsten yayınladığım reklamlar gözüküyor
… yayında olan kampanyaları da görebilmem düzenleyebilmem lazım … toplu
oluşturda sadece boostlar var ama aktif olan reklam kampanyalarını
seçemiyorum".*

**VERİ ZATEN BİZDE.** Gecelik yapı taraması `campaigns`, `ad_groups`, `ads`
ve `creatives` tablolarını dolduruyor; `ad_groups.targeting` hedeflemeyi
JSONB olarak, `creatives` başlık/metin/adres alanlarını tutuyor. Eksik olan
veri değil EKRAN: panelde kampanya SEVİYESİNDE hiçbir liste yok (Reklam
Keşfi reklam seviyesinde çalışıyor) ve `POST /campaigns/:id/actions` ucu
(duraklat · sürdür · bütçe) yazılmış ama onu çağıran tek yer asistanın onay
kartı. Kendi yorumu bunu zaten söylüyor: *"ileride panelin kendi Duraklat
butonu"*.

**1a — Kampanya listesi ikiye ayrılıyor.** `Reklam Oluştur` sayfasındaki tek
liste yerine iki bölüm:
  · **Yayında olanlar** — platformdan senkronize (`campaigns`)
  · **Advetics'te kurulanlar** — taslak ağacı (`draft_campaigns`)
Ayrım korunuyor çünkü yapabilecekleri farklı: taslak YAYINLANABİLİR, canlı
olan DURDURULABİLİR. Satırda ad, platform, gerçek durum
(`effective_status` — `status` değil: Meta'da kampanya aktif ama seti
duraklatılmış olabiliyor), günlük bütçe, son 7 günün harcaması ve
CTR/CPA'sı (`insights_daily`), son senkron zamanı.

**1b — Aksiyonlar satırda.** Duraklat / Sürdür / Bütçeyi değiştir, var olan
uca bağlı. İkinci bir yazma yolu AÇILMIYOR. Bütçe ve durdurma para kararı
olduğu için tek adımlı onay: eski değer → yeni değer, ve bütçe değişiminin
öğrenme evresini sıfırlayacağı yazılı.

**1c — Toplu Oluştur canlı kampanyaları da kaynak alıyor.** Bugün kaynak
seçici yalnızca `/draft-campaigns` listesinden besleniyor, orada da yalnızca
Advetics'in kurdukları var (pratikte boost'lar). Seçici iki gruplu olacak.
Canlı bir kampanyadan taslak üretmek YENİ platform çağrısı gerektirmiyor:
hedefleme `ad_groups.targeting`, metinler `creatives`, bütçe ve optimizasyon
hedefi kampanya/set satırlarında duruyor.

**1c ÖLÇÜLDÜ VE PLAN DEĞİŞTİ — KOPYAYI BİZ DEĞİL PLATFORM ÇIKARACAK.**

İlk plan "canlı kampanyadan taslak üret, sonra var olan çoğaltma akışını
kullan" diyordu. Kod okunduğunda iki duvar çıktı:

  1. **Çoğaltma SQL seviyesinde taslak tablolarından kopyalıyor**
     (`INSERT ... SELECT FROM draft_campaigns`). Canlı kampanya o tablolarda
     değil; `campaigns`/`ad_groups` satırlarından bir taslak ÜRETMEK gerekiyor.
  2. **Üretilen taslak SADIK OLAMIYOR.** Hedefleme `ad_groups.targeting`
     içinde Meta'nın HAM biçiminde duruyor; bizim uzman yüzeyimizin
     `advanced` şeması bambaşka bir model. Çeviri yazmak, kaynağıyla AYNI
     sanılan ama farklı hedefleyen bir kampanya üretmek demek — bu projenin
     tanımı gereği en pahalı hata türü. Kreatifler de ayrı: taslak reklamı
     `ad_creatives`e bakıyor, senkronize kreatifler `creatives` tablosunda ve
     görselleri platformun imzalı (ölen) adreslerinde.

**META'NIN KENDİ KOPYALAMA UCU VAR:** `POST /v25.0/{campaign_id}/copies`
(`deep_copy`, `status_option` varsayılan PAUSED, `rename_options`). Kampanyayı
Meta kendi kopyalıyor: hedefleme, reklam setleri ve reklamlar aslına SADIK
kalıyor ve biz hiçbir şey çevirmiyoruz. Sınır: eşzamanlı çağrıda 3, asenkron
çağrıda 51 alt reklam.

Bu bir YAZMA yolu ve canlıda hiç denenmedi; `ads_management` istiyor ve
gerçek nesne üretiyor. O yüzden ayrı bir adım olarak ve kullanıcının onayıyla
açılacak. Panel tarafı hazır: liste ve aksiyonlar (1a/1b) bitti.

**TAŞINAMAYAN ALANLAR SÖYLENECEK — sessiz kopya yok.** Ölçülen kısıtlar:
  · Meta'da `image_hash` REKLAM HESABI BAŞINA. Aynı hesaba kopyalamak
    sorunsuz; BAŞKA hesaba kopyalarken görsel yeniden yüklenmek zorunda.
  · Gönderi ve video boost'larında kalıcı bir görsel kimliği HİÇ YOK
    (`CLAUDE.md`). O kampanyalar kaynak seçilebilir ama kreatif yeniden
    kurulur ve ekran bunu SEÇİM ANINDA söyler, yayın anında değil.
  · Google arama reklamının görseli yok; kopya metin ve anahtar kelime
    demek. Google yazma yolu canlıda denenmediği için (K3) Google kaynağı
    ilk sürümde taslak üretir, yayınlamaz.

**Bitti sayılır:** yayında olan bir kampanya panelde görünüyor, oradan
duraklatılabiliyor, bütçesi değiştirilebiliyor (1a/1b ✅) ve Toplu Oluştur'da
kaynak olarak seçilebiliyor (1c — Meta'nın kopyalama ucuyla, onay bekliyor).

**Neden asistandan ÖNCE:** asistanın "bu kampanyayı durdur" önerisi, kullanıcı
o kampanyayı panelde göremiyorken havada kalır. Uyarı da bir canlı kampanyayı
işaret edecek. Bu faz, geri kalanının zeminini kuruyor.

---

### FAZ 2 — Sohbetten yayına (yalnızca Meta)
*Kullanıcının asıl istediği şey bu.*

- Yeni araç: `hazirla_ve_onaya_sun` — taslağı kurar (var olan
  `create_draft_campaign`), sonra **yayın onay kartı** basar. Kart:
  müşteri · hesap · hedef · günlük bütçe ve **süre sonundaki toplam taahhüt**
  · kitle özeti · kreatif önizlemesi · "yayına PAUSED mı ACTIVE mi girecek".
- Onay tıklanınca var olan `ad-publisher.service.ts` koşuyor. **İkinci bir
  yayın yolu açılmıyor** — `CLAUDE.md`'deki "aynı şeyi üreten ikinci
  fonksiyon doğduğu anda ayrışır" dersi.
- Kısmi başarı kartta ayrı ayrı yazılıyor (Meta yayında · Google başarısız).
  `draft-group-list` bunu zaten böyle gösteriyor.
- Yayın sonrası kart "Yayında" durumuna geçiyor ve kampanya bağlantısı
  veriyor. `bildirim-havuzu.tsx`'te öğrenilen ders: onaydan sonra kartta
  HİÇBİR ŞEY değişmezse kullanıcı yayınlandığını göremiyor.

**Riskler:** `ads_management` izni App Review istiyor (`DEPLOYMENT.md` §5e).
İzin yokken kart "yayınlayamıyorum, sebep şu" demeli — sessizce taslakta
bırakmamalı.

**Bitti sayılır:** iki turda (istek + onay) canlı bir Meta kampanyası
açılıyor ve panelde görünüyor.

---

### FAZ 3 — Kreatif angaryasını bitirmek

- Sohbete **görsel bırakma**: yüklenen görsel varlık arşivine yazılıyor,
  gerekirse `crop-studio` oranlarına otomatik kırpılıyor (kare her zaman
  ilk — `CLAUDE.md`).
- **Kütüphaneden öneri:** aynı müşterinin geçmişte EN İYİ performans veren
  kreatifleri (CTR'ye göre) kart olarak sunuluyor. Veri `insights_daily`
  `entity_level='ad'` + `creatives` bağından geliyor.
- **Metin üretimi zaten var** (`create_creative`); Bilgi Bankası'ndaki marka
  bilgisi ve hedef kitle prompta giriyor.
- Meta kısıtı hatırlatması: `image_hash` REKLAM HESABI BAŞINA
  (`asset_platform_refs`), aynı görsel başka hesapta yeniden yüklenir.

**Bitti sayılır:** kullanıcı tek bir görsel bırakıp "bunu kullan" diyerek
yayına gidebiliyor; hiçbir ekrana geçmeden.

**DURUM:** sürükle-bırak, yapıştırma ve "geçmişte işe yarayanlar" ✅.
Görselin platformdan İNDİRİLİP arşive alınması (`kreatif-adresi.service.ts`
taze adresi zaten üretiyor, `kreatif-gorseli.ts` beyaz listeli indirmeyi
yapıyor) henüz bağlanmadı: bugün çalışan bir kreatifin METNİ kopyalanıyor,
görseli kullanıcı kendi seçiyor. Bir sonraki adım bu.

---

### FAZ 4 — Performans uyarıları (veri katmanı)

Yeni uyarı kodları (`UYARI_KODLARI` genişliyor), hepsi `insights_daily`'den
ve hepsi SEVİYE taşıyor (kampanya / reklam seti / reklam):

| Kod | Ne zaman | Neden bu eşik |
|---|---|---|
| `harcama_var_donusum_yok` | N gün harcama var, 0 dönüşüm | En pahalı sessiz hâl |
| `edinme_maliyeti_yuksek` | CPA, Bilgi Bankası'ndaki hedefin ya da hesap medyanının üstünde | K5, K8 |
| `tiklama_orani_dusuyor` | CTR son 7 gün, önceki 7 güne göre düşüşte | Kreatif yorgunluğu |
| `frekans_yuksek` | Frequency eşiği aşıyor | Aynı kişiye tekrar |
| `butce_erken_bitiyor` | Günlük bütçe günün ilk saatlerinde tükeniyor | Kaçan talep |
| `yayin_durdu` | Aktif ama gösterim yok | Reddedilmiş/öğrenmede kalmış |

Hedef CPA alanı Bilgi Bankası'na ekleniyor (K8): müşterinin genel profilinde,
bütçe hedefinin yanında. Para micros ve `clients` tablosunda değil profil
kaydında — orası zaten müşterinin kendi bilgisi ve RLS'i kurulu.

Kurallar SAF FONKSİYONLAR (`performans-kurallari.ts`) ve çalıştırılarak
test ediliyor — kaynak taraması bir eşiği ölçemez. Her uyarı, kararını
verdiği SAYIYI da taşıyor: "CPA 412 ₺ · hedef 250 ₺". Sayısız bir uyarı
tartışılamaz.

**Bitti sayılır:** var olan uyarı ekranında performans uyarıları da
görünüyor ve her biri hangi sayıdan doğduğunu yazıyor.

---

### FAZ 5 — Uyarıdan asistana köprü
*"Müşteriyi yönlendirmesi gerekiyor" maddesi.*

- Her performans uyarısında **"Asistana sor"** düğmesi. Tıklayınca sohbet o
  uyarının bağlamıyla açılıyor: hangi kampanya, hangi sayı, hangi dönem.
- Asistan üç somut seçenek sunuyor, hepsi onay kartıyla:
  1. **Durdur** → `pause_campaign` (kampanya/set/reklam seviyesinde).
  2. **Kreatifi yenile** → kütüphaneden alternatif + yeni taslak reklam.
  3. **Hedef kitle değiştir** → mevcut kitle ile önerilen kitle YAN YANA.
- **ÖĞRENME EVRESİ UYARISI:** bütçe ya da kitle değişikliği reklam setini
  öğrenme evresine geri atıyor. Kart bunu yazmadan onay istemeyecek; yazmazsa
  kullanıcı "iyileştirdim" sanıp performansı düşürür.
- Her önerinin sonunda: *"Bunu her seferinde otomatik yap"* → `kurallar`
  ekranına ön dolu geçiş (K6).

**Bitti sayılır:** bildirimden tek tıkla asistana geçiliyor ve üç aksiyonun
üçü de onay kartıyla uygulanabiliyor.

---

### FAZ 6 — Google Ads AI'yi yazmaya açmak

Ön koşul: Google yazma yolunun canlıda EN KÜÇÜK bütçeyle doğrulanması.
Doğrulanana kadar Faz 1–5 Google'da yalnızca okuma/öneri üretiyor.
Google'a özel farklar prompta giriyor: bütçe ayrı kaynak, kampanya ve bütçe
adları hesapta TEKİL, `partialFailure: false`, video kampanyası API'den
oluşturulamıyor (Demand Gen yolu).

---

### FAZ 7 — Ölçüm

§0'daki üç sayı panele değil, `docs/DURUM.md`'e yazılıyor: kaç turda yayın,
kaç uyarı aksiyona döndü, kaç onay reddedildi. Reddedilen onay en değerli
sinyal: asistan yanlış şey öneriyor demektir.

---

## 5. Cevaplanan sorular

1. **Bildirim nereye düşecek?** → Panel içi uyarı yeterli (K7).
2. **Hedef CPA nereden gelecek?** → Bilgi Bankası'na alan olarak eklenecek
   (K8). Alan boşsa hesabın kendi medyanı, o da yoksa uyarı üretilmez.
3. **Müşteri hesabı asistanı görecek mi?** → Hayır (K9).

Kalan tek belirsizlik: **canlı kampanyada DÜZENLEME nereye kadar gidecek?**
Faz 1 duraklatma, sürdürme ve bütçeyi kapsıyor. Hedefleme ve kreatif
değişikliği platformda çok daha geniş bir yüzey (ve öğrenme evresini
sıfırlıyor); onlar Faz 5'teki "hedef kitle değiştir / kreatifi yenile"
önerileriyle birlikte, taslak üzerinden yürüyecek. Doğrudan canlı kampanyanın
hedeflemesini panelden düzenlemek isteniyorsa ayrıca konuşulmalı.
