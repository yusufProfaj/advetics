# "Oluştur" bölümünün yeniden tasarımı — tasarım belgesi

**Durum:** İNŞAAT SÜRÜYOR · **Tarih:** 2026-08-16 · **9 karar kapandı, 6 açık**

İki yüzey de yazıldı: `/reklam-olustur/basit` ve `/reklam-olustur/uzman`.

Bu belge bir plan değil, bir **karar zemini**. §1–§9 bugünkü durumu ve önerilen
omurgayı anlatıyor, §10 kararları taşıyor.

İnşaat için zorunlu olan dört karar (K1, K4, K5, K13) kapatıldı, ardından
K7 (kırpma) da yazıldığı gün kapandı. **Kalan on karar için varsayım
yapılmayacak** — o
alanlara gelindiğinde karar sorulacak. Kapanmış kararlar da kesin değil:
sıra, en riskli adımı sona bırakacak şekilde kuruldu ki fikir değişirse
atılan şey veri değil kod olsun.

Kullanıcının talebi, kendi ifadesiyle: *"bu reklam oluştur mantığını tekrardan
kurmamız gerekiyor böyle çok karışık, müşteri için ve reklamı bilen dijital
pazarlama uzmanı için 2 ayrı mantık olması gerekiyor ve (google akıllı kampanya
gibi basit) … auto boost ve toplu oluştur mantığını da değiştireceğiz"*.

Yani kapsam tek ekran değil: **`/reklam-olustur` + `/auto-boost` +
`/toplu-olustur` birlikte.**

---

## 1. Bugün ne var — ölçülmüş, tahmin değil

### Meta'ya reklam yazan üç ayrı yol

| Yol | Model | Doğrulama | Ne oluşturuyor | Provider metodu |
|---|---|---|---|---|
| `/reklam-olustur` | `ad_drafts` + orana bağlı görsel | `publishCheck` + `objective-matrix` | Yeni kampanya + ad set + **1 reklam** | `publishDraft` ([meta.provider.ts:1407](../apps/api/src/modules/connections/providers/meta.provider.ts:1407)) |
| `/auto-boost` | Kural → aday → onay | `boost-selector` | Organik gönderiden yeni kampanya | `createBoost` ([:1167](../apps/api/src/modules/connections/providers/meta.provider.ts:1167)) |
| `/toplu-olustur` | TSV yapıştırma | `bulk-validator` | **Mevcut** ad set'e N reklam (PAUSED) | `createAd` ([:1260](../apps/api/src/modules/connections/providers/meta.provider.ts:1260)) |

**Üç yolun ortak kodu yok.** Provider'da üç ayrı yazma metodu, üç ayrı
doğrulama, üç ayrı hata yolu.

Bunun bedeli somut: 13 Ağustos'ta canlıda öğrenilen altı hata
([DEVAM.md §2](DEVAM.md)) yalnızca `publishDraft` yolunda düzeltildi. Örneğin
`is_adset_budget_sharing_enabled` `createBoost`'a da eklenmiş ama form kimliği,
teklif stratejisi ve çok görselli yol yalnızca bir yolda öğrenildi.
`createAd` ve `createBoost` **hiç canlı yazma testi görmedi.**

### Satır sayıları

| Katman | Dosya | Satır |
|---|---|---|
| Sihirbaz | `apps/web/src/components/ad-builder/ad-wizard.tsx` | 927 |
| Gelişmiş panel | `apps/web/src/components/ad-builder/advanced-panel.tsx` | 552 |
| Taslak servisi | `apps/api/src/modules/ad-builder/ad-builder.service.ts` | 772 |
| Yayınlayıcı | `apps/api/src/modules/ad-builder/ad-publisher.service.ts` | 360 |
| Hedef eşlemesi | `apps/api/src/modules/ad-builder/goal-mapping.ts` | 381 |
| Amaç matrisi | `apps/api/src/modules/ad-builder/objective-matrix.ts` | 383 |
| Boost servisi + seçici + yürütücü | `apps/api/src/modules/boosts/` | 942 |
| Toplu servis + doğrulayıcı | `apps/api/src/modules/bulk/` | 809 |
| Toplu besteci | `apps/web/src/components/bulk/bulk-composer.tsx` | 385 |

### ZATEN VAR AMA KULLANILMIYOR: senkronize edilmiş ağaç

Şemada okuma tarafı için **tam hiyerarşi** duruyor:

```
Campaign → AdGroup → Ad → Creative        (prisma/schema.prisma:714, 760, 801, 838)
```

`AdGroup` üzerinde `targeting Json?` alanı var ve şemadaki yorumu şunu diyor:

> `/// Hedefleme spec'i — Modül 8 toplu oluşturucuda şablon olarak kullanılacak.`

Yani "mevcut yapıdan şablon üret" fikri bir kez düşünülmüş, sonra
kullanılmamış. Toplu oluşturucu bugün kullanıcıdan **elle Meta ad set kimliği
ve sayfa kimliği yapıştırmasını** istiyor
([bulk-composer.tsx:117-138](../apps/web/src/components/bulk/bulk-composer.tsx:117))
— oysa o ad set zaten veritabanımızda, adıyla birlikte.

### Yazma tarafında ağaç YOK

`ad_drafts` düz bir tablo: bir taslak = bir kampanya + bir ad set + bir reklam.
Görseller taslağa bağlı (`ad_draft_assets.draft_id`), yani bir kreatif kendi
başına var olamıyor.

---

## 2. Teşhis — karışıklık nereden geliyor

### 2.1. "Basit/Gelişmiş" bir anahtar, iki mantık değil

Aynı taslağın üzerinde duruyor, dolayısıyla ikisi de aynı kalıba sıkışmış:
tek kampanya, tek ad set, tek reklam. Sonuç iki tarafı da tatmin etmiyor.

**Acemi için hâlâ karmaşık:** 7 blok, kampanya adı, reklam hesabı seçimi, üç
ayrı oran kutusu, mod seçici ve sonda bir "Kontrol et" kapısı.

**Uzman için yetersiz:** ikinci bir kreatif eklenemiyor, iki kitle
karşılaştırılamıyor, kayıtlı kitle yok, yayınlanan reklam kopyalanamıyor,
mevcut kampanyaya ad set eklenemiyor. "Gelişmiş" panel yalnızca **aynı tek ad
set'in** alanlarını açıyor.

### 2.2. Modüller kullanıcıya göre değil, tekniğe göre bölünmüş

Kullanıcı "reklam vereceğim" diye geliyor; biz "elle mi, kuraldan mı, tablodan
mı" diye soruyoruz. Menüde üç ayrı yer, üç ayrı zihinsel model.

### 2.3. Elle "şu gönderiyi öne çıkar" yolu hiç yok

Boost adayları yalnızca kuraldan doğuyor: `boosts.controller.ts` içinde aday
üreten tek uç `POST rules/:id/run`. Oysa reklamcılık bilmeyen birinin anladığı
en net eylem budur — "reklam oluştur"dan çok daha net.

### 2.4. Yayın tek yönlü kapı

Yayınlanan taslak açılamıyor bile
([page.tsx:120](<../apps/web/src/app/(dashboard)/reklam-olustur/page.tsx>:120)),
kopyalanamıyor, durdurulamıyor. `ad_drafts.external_campaign_id` ile
senkronize `campaigns.external_id` arasında panelde hiçbir bağ yok. "Geçen
ayki kampanyayı yeniden ver" bir ajansın en sık yapacağı iş ve yolu yok.

### 2.5. Arayüze geri sızmış sessiz hatalar

Yeniden tasarımdan bağımsız, her hâlükârda düzeltilecek dört madde:

| # | Sorun | Yer |
|---|---|---|
| 1 | Yazılan metin kaydedilmiyor — taslak yalnızca görsel yükleme / kontrol / yayın anında yazılıyor | [ad-wizard.tsx:140](../apps/web/src/components/ad-builder/ad-wizard.tsx:140) |
| 2 | "Kontrol et" ad veya metin boşken pasif, sebebini söylemiyor | [:580](../apps/web/src/components/ad-builder/ad-wizard.tsx:580) |
| 3 | Reklam hesabı sessizce `accounts[0]`; hangi müşteri için çalışıldığı ekranda yazmıyor | [:61](../apps/web/src/components/ad-builder/ad-wizard.tsx:61) |
| 4 | Gelişmiş modda `budgetMode: 'lifetime'` seçilince 5. adımın "Günde ne kadar" etiketi yalan söylüyor | [ad-publisher.service.ts:128](../apps/api/src/modules/ad-builder/ad-publisher.service.ts:128) |

1 numara veri kaybı, 2 ve 3 bu projenin klasik sessiz hata deseni.

---

## 3. DEĞİŞMEYECEKLER

Bunlar tartışmaya açık değil — her biri bir kazanın karşılığı ve yeniden
kurarken taşınmak zorunda.

| Ne | Neden |
|---|---|
| `goal-mapping.ts`'in tamamı | Ürünün çekirdeği. `LEAD_GENERATION` yerine `LINK_CLICKS`, `LANDING_PAGE_VIEW` kararı, otomatik yerleşimde alanın **hiç** gönderilmemesi — üçü de sessiz para yakan hataların düzeltmesi |
| Tek yayın yolu (`resolveSpec`) | İki mod, tek boru hattı. Yeni tasarımda **üç modüle** genişliyor |
| Kapsama paneli (%kırpma) | "Kırpılabilir" bilgi değil, "%36'sı kırpılacak" karar verdiriyor |
| Engelleyen / uyaran ayrımı | Birleştirmek, "başlığın kısaltılacak" notunu yayını durduran hataya çevirir |
| Giriş anında doğrulama | Kullanıcı görselin kullanılamayacağını tıkladığında değil bıraktığında öğrenmeli |
| Boost'un taahhüt bazlı tavanı + "kısmi boost yok" | Harcanan üzerinden saymak ay sonunda tavanın iki katına izin verirdi |
| `bulk-validator.ts` | 60 satırlık partide 41. satırın hatasını platforma gitmeden yakalıyor |
| Toplu yayında PAUSED açma + onay metni | 60 reklam ACTIVE açılsa hepsi anında harcamaya başlar |
| Kampanya PAUSED açılıp en sonda ACTIVE'e alınması | Ad set hazır olmadan kampanya yayına girerse Meta eksik yapılandırma diye reddedebiliyor |
| `special_ad_categories` kararının bilinçli olması | Bugün her üç yolda da sabit `[]` — bkz. §10 K9, bu bir açık |

---

## 4. Önerilen omurga

**Tek cümle: veri modeli tek olsun (kampanya → ad set(ler) → reklam(lar)),
yüzeyler ikiye ayrılsın, girişler üç kalsın.**

```
   GİRİŞLER                    TEK MODEL                  TEK YAYIN
   ────────                    ─────────                  ─────────

   Basit yüzey ─┐
   (müşteri)    │
                ├──►  Kampanya taslağı ağacı  ──►  Yayın çekirdeği  ──►  Meta
   Uzman yüzey ─┤      campaign                     · goal-mapping
   (ajans)      │       └ ad set(ler)               · objective-matrix
                │           └ reklam(lar)           · kapsama
   Kural ───────┤               └ kreatif           · PAUSED→ACTIVE sırası
   (auto-boost) │                                   · geri alma
                │
   Tablo ───────┘
   (toplu)
```

### Neden tek model

- **Tek yayın yolu, projenin kendi dersi.** `resolveSpec` iki modu tek boruya
  soktu ve bunun gerekçesi kodda yazılı: iki ayrı yayın yolu olsaydı birinde
  düzeltilen hata diğerinde kalırdı ve fark ancak canlıda görülürdü. Bugün
  **üç** ayrı yol var ve bu tam olarak yaşandı — altı hatanın düzeltmesi
  diğer iki yola gitmedi.
- **Devir mümkün olur.** Müşteri basit yüzeyde kurar, ajans uzman yüzeyde
  devralır. Bugün imkânsız: basit modda kurulan şey yalnızca tek bir reklam.
- **Yayın sonrası bağ kurulur.** Ağaç yayınlandıktan sonra senkronize
  `Campaign/AdGroup/Ad` satırlarına bağlanır; "durumu ne, durdur, kopyala"
  aynı ekrandan çalışır.

### Neden iki yüzey (bir anahtar değil)

İkisi farklı **iş** yapıyor, aynı işin iki zorluk seviyesi değil:

| | Basit yüzey | Uzman yüzey |
|---|---|---|
| Kullanıcı | Reklamcılık bilmiyor | Ads Manager kullanıyor |
| Soru sayısı | 4–5 | Sınırsız |
| Meta terminolojisi | **Hiç geçmez** | **Aynen geçer** (`LEAD_GENERATION`, `OUTCOME_LEADS`) |
| Ağaç | Görünmez, üretici kurar | Doğrudan düzenlenir |
| Kararlar | Bizde (`goal-mapping`) | Kullanıcıda (`objective-matrix` yine doğrular) |
| Hata toleransı | Yanlış seçim imkânsız olmalı | Yanlış seçim uyarılır, engellenmez |

Terminoloji kuralı simetrik: uzman "Neyi optimize edelim → Form dolduranlar"
görmek istemiyor, `LEAD_GENERATION` görmek istiyor — çünkü Ads Manager'la
eşleştirmek zorunda. Bugünkü gelişmiş panel Meta'nın dilini gizliyor ve bu
uzmana zarar veriyor.

---

## 5. Basit yüzey — "Google akıllı kampanya" karşılığı

Google'ın akıllı kampanyasını çalıştıran şey ekranın kısalığı değil, **her
sorunun sonucunun anında görünmesi.** Karşılığı:

| # | Soru | Not |
|---|---|---|
| 1 | **Ne olsun?** | Form / WhatsApp / Site + **"Gönderiyi öne çıkar"** (yeni) |
| 2 | **Nereye?** | Müşteriye tek hesap ve tek sayfa atanmışsa **hiç sorulmaz**. Bugün sessizce `accounts[0]` seçiliyor — daha kötüsü |
| 3 | **Görsel** | **Tek görsel yeter.** Kırpılıp üç orana çoğaltılır (bkz. K7) |
| 4 | **Metin** | Sabit canlı önizleme yanında |
| 5 | **Bütçe** | **Üç hazır kart + tahmini sonuç aralığı** (bkz. K8) |
| 6 | **Yayınla** | "Kontrol et" kapısı yok; engeller yazarken canlı güncellenir |

Üç nokta ayrıca vurgulanmalı:

**Bugünkü en sert duvar görselde.** Kare yuva zorunlu
([asset-routing.schema.ts:83](../packages/shared/src/schemas/asset-routing.schema.ts:83))
ve kırpma aracı yok. Telefonundan 4:3 fotoğrafla gelen kullanıcı — yani tipik
kullanıcı — bunu **son adımda** öğreniyor ve verdiğimiz talimat "kırp ve
yeniden yükle". Kırpacak yerin biz olmamamız, ürünün vaadindeki en büyük
delik.

**Bütçe rakamı bugün anlamsız.** "Günde 200 ₺" hiçbir şey ifade etmiyor;
"günde 200 ₺ ≈ ayda 40–70 form" karar verdiriyor. Basit yüzeyin tek en büyük
kazancı bu olabilir.

**Yayın sonrası ekran gerekiyor.** Bugün "Reklamın yayında" deyip kapanıyoruz.
`Ad.effectiveStatus` senkronize ediliyor; Meta incelemesinin sonucu aynı
ekranda gösterilebilir.

---

## 6. Uzman yüzeyi

Başlangıç noktası dört tane olmalı — bugün yalnızca birincisi var:

1. Yeni kampanya kur
2. **Mevcut kampanyaya ad set ekle** (kampanyalar senkronize, listeden seçilir)
3. **Mevcut ad set'e reklam ekle** (bugün bu, toplu oluşturucunun ham kimlik
   isteyen hâli)
4. **Var olanı kopyala** (yayınlanmış taslaktan yeni taslak)

Ağaç düzenleyici:

```
Kampanya   objective · bütçe modu (CBO/ABO) · special_ad_categories · takvim
  └ Ad set  hedefleme · yerleşim · optimizasyon · teklif · bütçe
      └ Reklam  kreatif (görsel + metin + CTA) · form
```

Uzman yüzeyinin ihtiyaç duyduğu ama **bugün olmayan** iki şey:

- **Kayıtlı kitle.** BASE bölümünün "kitle kütüphanesi" parçası hiç
  yazılmadı ([DEVAM.md §4](DEVAM.md)). Uzman aynı kitleyi her kampanyada elle
  kurmak istemez. Bağımlılık burada adlandırılıyor; kapsama alınıp
  alınmayacağı K4.
- **`special_ad_categories`.** Üç yazma yolunda da sabit `[]` gidiyor. Emlak,
  istihdam ve kredi müşterileri için bu bir politika ihlali ve Meta bunu
  hesap seviyesinde cezalandırıyor. Bugün panelde sorulmuyor bile — K9.

---

## 7. Auto-Boost bu modelde

Kuralın işi **"hangi gönderi" ve "ne kadar"** demek; oradan sonrası aynı yayın
çekirdeği. Yani `boost-selector.ts` ve tavan muhasebesi olduğu gibi kalıyor,
`createBoost` ise yayın çekirdeğine katılıyor.

Eklenecek: **elle boost.** Gönderi listesinden "öne çıkar" → basit yüzeyin üç
soruluk hâli. Kural motoru kalıyor, tek yol olmaktan çıkıyor.

### 7.1. Nasıl bağlandı (2026-08-16)

**`boosts` tablosu kaldı ve işi değişmedi:** onay kuyruğu ve aylık tavan
muhasebesi. Ağaç "hangi kampanyalar var", `boosts` "hangi boost onaylandı ve
ne kadar taahhüt edildi" sorusunun cevabı. İkisi birbirinin yerini almıyor.

**Yazma noktası:** `boost-executor` boost'u oluşturduğu transaction'da ağaç
satırlarını da yazıyor. Bu YENİ BİR GÜVENLİK KARARI DEĞİL — o servis zaten
`tx` üzerinden kiracı tablolarına yazıyor (`boosts`, `organic_posts`). Ayrı
bir yola çıkarmak, boost oluşup ağaç satırının yazılamadığı bir aralık
bırakırdı ve o boost panelde hiç görünmezdi.

**Şema tarafında iki ekleme gerekti:** `draft_ads.creative_id` nullable oldu
ve yanına `organic_post_id` geldi (ikisinden tam biri dolu), çünkü boost
edilen gönderinin metni ve görseli zaten Meta'da. Ayrıca `draft_campaigns`
artık kökenini taşıyor (`source`, `boost_rule_id`) — beklenmedik bir
harcamanın hangi kuraldan doğduğunu bulmanın tek yolu bu.

**Ağaç yazılamazsa boost yine oluşmuş sayılıyor.** Hata fırlatmak, platformda
çoktan oluşmuş ve para harcayan bir boost'u "başarısız" göstermek olurdu — ve
bir sonraki tur onu ikinci kez oluşturmayı denerdi. Log'a yazılıp devam
ediliyor.

**Aday üretimi de taşındı (2026-08-16).** Bir aday oluşurken kampanya taslağı
da yazılıyor (`status = 'draft'`) ve `boosts.draft_campaign_id` ikisini
bağlıyor. Onaylanan boost platformda oluşunca AYNI satır `published` oluyor —
ikinci bir kampanya doğmuyor. Reddedilen adayın taslağı siliniyor: bırakmak,
listede asla yayınlanmayacak bir taslak bırakmak olurdu.

Bunu yaparken `runRule` içinde bir sayım hatası da düzeldi: `INSERT ... ON
CONFLICT DO NOTHING` `$executeRaw` ile çağrılıyordu ve çakışan (yani hiç
yazılmayan) tur da `created++` sayıyordu. `RETURNING` ile çakışma artık ayırt
ediliyor.

### 7.2. ELLE BOOST — istendi, HENÜZ YAZILMADI (2026-08-16)

Kullanıcının ifadesi: *"girdiğimde instagram gönderisini seçip hangi lokasyona
gösterileceğini ya da hedef kitleye gösterileceğini seçip direkt boost'u
yayınlayabilmem lazım"*.

Bugün Akıllı Boost **yalnızca kuralla** çalışıyor. Kural, ölçüt ve aylık tavan
kurmayı gerektiriyor; "şu gönderi iyi gidiyor, bunu öne çıkar" demek isteyen
kullanıcı için bu üç adım fazla. Üstelik kuralın doğası gereği **geçmişe
bakıyor** — daha yeni yayımlanmış bir gönderi hiçbir eşiği geçemediği için
kuralla asla boost edilemiyor.

**Akış:** gönderi seç → bütçe ve süre → nereye/kime → yayınla. Dört adım, tek
ekran, ara onay yok. Kural yolundaki "aday → onay" adımı burada yok, çünkü
kararı zaten kullanıcı veriyor.

**Ayrı bir yol DEĞİL, üçüncü üretici.** Ağacın kuralı bu (§4): üç üretici
(elle / kural / çoğaltma), tek yayın yolu. Elle boost da `draft_campaigns`
satırı yazıyor — `source = 'manual_boost'` — ve aynı `publishBoost()`
üzerinden gidiyor. Doğrudan `createBoost` çağırmak dördüncü bir yazma yolu
açardı ve bu belgenin bütün teşhisi (§2) tam olarak buydu.

"Direkt yayınla" ile "ağaca yaz" çelişmiyor: taslak yazılıyor ve **aynı istek
içinde** yayınlanıyor. Kullanıcı ara ekran görmüyor, boost yine Reklamlar
listesinde diğerleriyle birlikte duruyor.

**Üç engel — hiçbiri bugün çözülmüş değil:**

**(1) Hedefleme sabit kodlanmış.** `meta.provider.ts` içinde `createBoost` her
boost'a `{"geo_locations":{"countries":["TR"]}}` yolluyor ve `BoostRequest`'te
`targeting` alanı yok. Ekrandan lokasyon seçtirip bu satırı bırakmak, panelde
"İzmir" gösterip Meta'ya "Türkiye" göndermek demek: kullanıcı yanlış kitleye
harcadığını hiçbir yerde göremez. Alan eklenmeli; kural yolunun bugünkü
davranışı varsayılan kalmalı (§3 — çalışan davranış bozulmuyor).

**(2) Instagram gönderisi Facebook gibi boost edilemez.** Bugünkü kod
`object_story_id: "{sayfa}_{gönderi}"` kuruyor; bu Facebook sayfa gönderisi
biçimi. Instagram için Meta ayrı alanlar istiyor. `boost-executor.service.ts`
profil türüne hiç bakmıyor, sayfa kimliğini koşulsuz geçiyor. İstenen şey tam
olarak Instagram olduğu için ilk iş bu — ve canlıda hiç denenmediği için
"hata mı veriyor, yoksa sessizce yanlış reklam mı üretiyor" bilinmiyor.

> **BU BUGÜN DE AÇIK — elle boost'u beklemiyor (2026-08-16 tespiti).** Aday
> seçicide profil türü süzgeci YOK
> ([boosts.service.ts](../apps/api/src/modules/boosts/boosts.service.ts)):
> `social_profile_id` boş bırakılan bir kural müşterinin bütün profillerini
> tarıyor, Instagram dahil. Organik senkronizasyon IG gönderilerini zaten
> çekiyor, yani bugün kurulabilecek bir kural IG gönderisini aday yapabilir ve
> yürütücü Meta'ya `object_story_id: "<ig_user_id>_<media_id>"` yollar — iki
> parçası da yanlış uzaydan gelen bir kimlik.
>
> **Karar beklemeyen tek iş bu:** IG profili görüldüğünde erken hata. K16–K20'
> nin hiçbirine bağlı değil ve tek başına gönderilebilir.

**(3) Özel kategori hedeflemeyi kısıtlıyor.** Konut/istihdam/kredi beyanı olan
müşteride yaş ve cinsiyet daraltması gönderilemiyor (`restrictTargetingFor`).
Ekran bu alanları gösterip sessizce düşürmemeli — "doğrulama kullanım anında
değil giriş anında" kuralı.

**(4) IG profilinin ana Facebook sayfası SAKLANMIYOR.** `listSocialProfiles`
IG satırını yazarken `raw` alanına yalnızca IG nesnesini koyuyor
([meta.provider.ts](../apps/api/src/modules/connections/providers/meta.provider.ts));
sayfanın kimliği kayboluyor, geriye yalnızca sayfanın token'ı kalıyor. Meta'da
her reklam bir Facebook sayfasına bağlı, yani K17 hangi alan setinde karar
kılarsa kılsın **ana sayfa kimliği gerekecek.** Keşif döngüsünde değer zaten
elin altında (sayfanın kendi `id`'si), ama saklanması migration + mevcut
satırların yeniden keşfi demek. Elle boost'tan önce çözülmeli.

**(5) Şehir seçiminin veri kaynağı yok.** Ayrıntı K16'da: `cityKeys` şemada ve
`targetingFrom`'da var, onu dolduran hiçbir şey yok.

Kararlar: **K16** (hedefleme kapsamı), **K17** (Instagram yolu ve deneme
sırası), **K18** (bütçe kipi), **K19** (harcama emniyeti), **K20** (aynı
gönderinin tekrar boost'u) — **beşi de 2026-08-16'da kapandı.**

---

## 8. Toplu oluştur bu modelde

Toplu oluşturma ayrı bir modül değil, **uzman yüzeyinin tablo girişi**.

| Bugün | Öneri |
|---|---|
| Elle Meta ad set kimliği yapıştırılıyor | Senkronize ad set listesinden seçiliyor |
| Elle Facebook sayfa kimliği yapıştırılıyor | Müşteriye atanmış sayfalardan seçiliyor |
| Yalnızca mevcut ad set'e reklam eklenebiliyor | Ad set de üretilebiliyor (aynı ağaç) |
| `bulk-validator` ayrı doğrulama | Aynı doğrulayıcı, tablo girişine bağlı |

> **BU ÖNERİ 2026-08-16'DA DEĞİŞTİ — kullanıcının kararı.** Verbatim: *"toplu
> oluşturma sistemni düzeltmemiz gerekiyor excel dosyası tablo falan olmaz
> daha optimize kullanışlı olması gerekiyor."*
>
> Belgede "TSV korunmalı" yazıyordu; gerekçesi "ajans metinleri Sheets'te
> hazırlıyor" idi. Kullanıcı bunu reddetti ve haklı: tablonun kurtardığı iş,
> aynı yapının farklı denemelerini kurmak — ve o iş bir tabloyu doldurmayı
> gerektirmiyor.
>
> **Yerine gelen model: KAMPANYA ÇOĞALTMA.** Çalışan bir kampanyayı seç, N
> varyasyon üret; yazmadığın her alan kaynaktan gelir. Kazancı yalnızca
> kullanışlılık değil: kaynak zaten DOĞRULANMIŞ bir ağaç, yani
> hesap-sayfa-platform uyumu bir kez kontrol edildi ve kopyalar o kontrolleri
> yeniden geçmiyor. Ham Meta kimlikleri de tamamen kalktı.

---

## 9. Google Ads bu modelde nereye oturuyor

### 9.1. Bugünkü gerçek — 2026-08-16'da DEĞİŞTİ

**Google erişimi alındı, hesaplar bağlandı ve veri akıyor.** Yani bu belgenin
ilk hâlindeki iki engel de kalktı: developer token onayı ve "okuma tarafı
canlıda hiç doğrulanmadı".

**Ama yazma yolu hâlâ sıfır satır.** Erişim açıldı, kod yazılmadı. Bu ayrım
korunmalı; karıştırmak "yayınlayabiliyoruz" sanıp boş bir düğme koymak demek.

`google.provider.ts` her yazma metodunda kalıcı hata fırlatıyor ve — belgenin
en önemli tespiti bu — **üç ayrı gerekçe ayırt ediyor:**

| Gerekçe | Metotlar | Anlamı |
|---|---|---|
| **"Henüz uygulanmadı"** | `publishDraft`, `createAd`, `uploadAdImage`, `applyAction` | Karşılığı var, **yazılmayı bekliyor** (erişim engeli kalktı) |
| **"Karşılığı YOK — bu bir Meta özelliği"** | `createBoost`, `createLeadForm`, `fetchLead` | Asla olmayacak |
| **Hata değil, boş dönüyor** | `fetchOrganicPosts` | Yapacak iş yok; "başarısız" saymak yanlış olurdu |

Bu üçlü ayrım, "iki platformu nasıl birleştiririz" sorusunun cevabının
yarısını zaten veriyor. **Yeni arayüz bu üç durumu üç ayrı cümleyle
göstermeli.** "Henüz yok" ile "hiç olmayacak"ı aynı göstermek, kullanıcının
asla gelmeyecek bir şeyi beklemesi demek.

> **BAYAT HATA MESAJLARI — küçük ama acil.** Kodda en az beş yerde
> *"Basic Access onayı bekleniyor"* yazıyor ve bunların dördü **kullanıcıya
> görünen hata metni**
> ([google.provider.ts:964, 1003, 1028, 1036](../apps/api/src/modules/connections/providers/google.provider.ts:964)),
> biri de yorum ([:953](../apps/api/src/modules/connections/providers/google.provider.ts:953)).
> Artık yanlış: kullanıcıyı çözülmüş bir sorunu çözmeye gönderiyorlar.
> `preflight.sh`'ın veritabanını "kapalı" göstermesiyle aynı sınıf — yanlış
> teşhis. Doğru metin: *"Google Ads reklam oluşturma henüz yazılmadı."*
> Bu, yeniden tasarımı beklemeden düzeltilmeli.

### 9.1.1. Erişim açılınca ortaya çıkan YENİ risk

Google engelliyken, yazılmamış yazma yolu zararsızdı. Artık değil: **kod
yazıldığı anda gerçek bir müşteri hesabında gerçek para harcayabilir.**

Meta'nın dersi burada birebir geçerli — ilk gerçek yazma çağrısında **altı
hata** çıktı ve üçü sessizdi ([DEVAM.md §2](DEVAM.md)). Google'ın kendi altısı
olacak ve API biçimi Meta'dan daha farklı: her şey `mutate` işlemleriyle,
kaynak adlarıyla ve — Meta'dan yapısal olarak ayrılan nokta — **bütçe ayrı bir
kaynak** (`CampaignBudget`), kampanya ona referans veriyor. Meta'da bütçe ad
set'te (ya da CBO'da kampanyada) duruyor. Ortak ağaç bu farkı taşımak zorunda.

Bu yüzden Google'ın ilk canlı yazma çağrısı da Meta'daki gibi olmalı:
**ajansın kendi hesabında, en küçük bütçeyle, hemen duraklatılarak.**

### 9.2. Hangi katman birleşir, hangisi birleşmez

| Katman | Birleşir mi | Not |
|---|---|---|
| Müşteri, hesap havuzu, yetki, RLS | **Zaten birleşik** | Havuz modeli platformdan bağımsız |
| Para (micros), tarih, metrikler, rapor | **Zaten birleşik** | `insights_daily`, FX, türetilmiş metrikler |
| Varlık arşivi + kapsama | **Zaten birleşik** | `coverageFor('google' \| 'meta')` yazılmış ve çalışıyor — PMax yuvaları ve logo zorunluluğu dahil |
| Niyet (kullanıcının hedefi) | **Birleşir** | Tek soru; çeviri platform başına ayrı |
| Metin alanları | **Kısmen** | Meta 1 birincil + 1 başlık + 1 açıklama; Google RSA 15 başlık + 4 açıklama. Ortak **metin havuzu**, ayrı **paketleme** |
| Kampanya ağacı | **Birleşmez** | Meta ad set ≠ Google ad group ≠ PMax varlık grubu |
| Teklif, yerleşim, optimizasyon | **Birleşmez** | Uzman zaten platformun dilini istiyor; birleştirmek zarar |
| Yayın çağrısı | **Birleşmez, SIRALANIR** | Bkz. K13 |

### 9.3. Ana fikir: basit yüzeyde platform bir GİRDİ değil, ÇIKTI

Reklamcılık bilmeyen kullanıcı Meta'nın ne, Google'ın ne yaptığını da bilmez.
Ona "hangi platform" diye sormak, cevabını bilmediği bir soruyu sormaktır —
tam da bu ürünün kaçındığı şey.

Doğrusu: **hedefi sorarız, platformu biz söyleriz.**

| Hedef | Meta | Google | Not |
|---|---|---|---|
| WhatsApp'tan mesaj | ✅ tek | ❌ karşılığı yok | Google'da böyle bir reklam tipi yok |
| Anlık form | ✅ | ⚠️ farklı kavram | Google'ın lead form uzantısı ayrı bir model — provider zaten bunu söylüyor |
| Siteye trafik / satış | ✅ | ✅ | **"Her ikisi" seçeneğinin anlamlı olduğu tek yer burası** |
| Aramada bulunmak | ❌ karşılığı yok | ✅ tek | Meta'da arama talebi yok |
| Gönderiyi öne çıkar | ✅ tek | ❌ | Google'da organik gönderi kavramı yok |

Bu tablo bir şeyi açığa çıkarıyor: **bugünkü üç hedefin üçü de Meta biçiminde.**
Google'ı gerçekten eklemek, en az bir Google biçimli hedef eklemek demek
("insanlar seni Google'da arıyor"). Aksi hâlde Google'ı bağlar, hiçbir hedefte
kullanamayız.

### 9.4. Mimari kural: çeviri provider'a taşınır

`goal-mapping.ts` bugün ad-builder modülünde duruyor ama içeriği tamamen
Meta'ya özgü (`OUTCOME_LEADS`, `destination_type`, `promoted_object`).
Google eklendiğinde bu dosyanın yanına ikinci bir dosya değil, **provider
arayüzüne bir metot** gelmeli:

```
provider.specFor(goal, context)   →  platforma özgü kampanya spec'i
provider.supports(goal)           →  'yes' | 'not_yet' | 'never'
```

Böylece yeni platform eklemek ad-builder'a dokunmadan mümkün olur ve §9.1'deki
üçlü ayrım tip seviyesinde zorunlu hâle gelir — bir provider "bu hedefi
destekliyor muyum" sorusuna cevap vermeden derlenemez.

### 9.5. Somut birleşme noktası: KREATİF

Tek cümle: **kreatif birleşir, kampanya birleşmez.**

Kreatif = **metin havuzu + görsel havuzu**. Paketleme platformun işi:

| | Meta (tek görselli) | Google RSA (Arama) | Google PMax |
|---|---|---|---|
| Başlık | 1 | **15'e kadar**, 30 karakter | birkaç kısa + birkaç uzun |
| Açıklama | 1 | **4'e kadar**, 90 karakter | birkaç |
| Ana metin | 1 (birincil metin) | yok | yok |
| Görsel | kare (zorunlu) · 9:16 · 16:9 | yok | 1.91:1 · 1:1 · 4:5 + **logo** |

Bugün bu iki dünya iki ayrı yerde yaşıyor: metin `ad_drafts` sütunlarında
(`primary_text`, `headline`, `description`), görsel `ad_draft_assets`'te ve
ikisi de tek bir taslağa çivili. Google eklenince bu model çöküyor — 15
başlığı üç sütuna sığdıramazsın.

**Öneri:** kreatif kendi varlığı olsun (K5), içinde **etiketli** metin
parçaları (`kısa_başlık` / `uzun_başlık` / `açıklama` / `ana_metin`) ve
görseller dursun. Her platform kendi paketini bu havuzdan kursun. Kazancı
somut: kullanıcı bir kez yazar, Meta bir başlık alır, Google on beş
başlığın en iyisini kendi seçer.

Görsel tarafında birleşme zaten **yarı yarıya hazır**: `coverageFor` iki
platformun yuvalarını da biliyor ve K7'deki kırpma aracı tek görselden hem
Meta'nın hem Google'ın oranlarını üretebilir. Eksik olan tek şey **logo** —
PMax onsuz varlık grubu oluşturmuyor ve bugün yükleme akışında hiç yok
([asset-routing.schema.ts:166](../packages/shared/src/schemas/asset-routing.schema.ts:166)).

### 9.6. Basit yüzeyde kullanıcı ne görüyor

Platform bir soru olarak hiç geçmiyor; hedef kartının **altında sonuç
olarak** yazıyor:

```
┌────────────────────────────┐  ┌────────────────────────────┐
│ WhatsApp'tan mesaj gelsin  │  │ Siteme ziyaretçi gelsin    │
│ Facebook · Instagram       │  │ Facebook · Instagram·Google│
└────────────────────────────┘  └────────────────────────────┘
```

**Ek soru YALNIZCA iki platformun da anlamlı olduğu hedefte çıkıyor** ve
platform seçimi olarak değil, **bütçe sorusu** olarak:

> Bütçeni nasıl kullanalım?
> · Önce Meta'da deneyelim · İkisini de deneyelim · Yalnızca Google

Kaydırıcı YOK. "Yüzde kaçı Google'a" sorusu, cevabını bilmeyen bir kullanıcıya
sorulmuş bir uzman sorusudur; üç hazır seçenek aynı kararı verdiriyor.

### 9.7. EN KRİTİK DETAY: kısmi başarı

Meta çıktı, Google düştü. Bu **normal** bir sonuç, istisna değil — iki ayrı
API, iki ayrı onay süreci, iki ayrı politika motoru.

Bugünkü model bunu ifade **edemiyor**: `ad_drafts.status` tek alan ve tek
`error` sütunu var. Tek satırla iki gerçeği taşımaya çalışmak, ya "başarısız"
deyip yayında olan Meta reklamını gizlemek ya da "yayında" deyip hiç
oluşmamış Google kampanyasını var göstermek demek. İkisi de bu projenin
klasik sessiz hatası.

K13'ün (bir taslak = bir platform) asıl gerekçesi bu. Ekranda karşılığı:

```
Yaz Kampanyası
  ├ Meta    · yayında            · günde 120 ₺
  └ Google  · başarısız          · [Yeniden dene]   ← tek başına
```

Düşen taraf **tek başına** tekrar denenebilmeli. Bütün grubu yeniden
yayınlamak, çalışan Meta kampanyasının ikinci bir kopyasını açmak olurdu.

### 9.8. Raporda birleşme — iki tuzak

Grup kimliği "bu kampanyanın toplam sonucu"nu mümkün kılıyor ama **her metrik
toplanamıyor** ve bunu bilmeden toplamak sessiz bir yanlış sayı üretir:

| Metrik | Toplanır mı | Neden |
|---|---|---|
| Harcama | ✅ | Para paradır |
| Gösterim | ✅ | Olay sayısı |
| Tıklama | ✅ | Olay sayısı |
| **Erişim** | ❌ | Tekil KİŞİ sayısı. Aynı insan iki platformda da görüldüyse iki kez sayılır; toplam gerçek erişimden büyük çıkar |
| **Dönüşüm** | ⚠️ | İki platform da kendi atıf penceresiyle sahipleniyor. Meta reklamını görüp Google'dan dönen kişiyi ikisi birden yazabiliyor |
| CPA / ROAS | ⚠️ | Payda dönüşüme bağlı; dönüşüm çift sayılıyorsa bunlar da yanlış |

Kural: **toplanamayan metrik toplanmaz, platform kırılımıyla yan yana
gösterilir.** Erişim için tek doğru cümle "Meta 40.000 · Google 25.000",
"65.000" değil.

---

## 10. KARARLAR

> **2026-08-16 — DÖRT KARAR KAPANDI, ON BİRİ AÇIK.** Kullanıcının ifadesi:
> *"başlayalım daha sonra mantığıma uymazsa düzeltiriz"*. Buna göre inşaata
> başlamak için **zorunlu olan** dört karar (K1, K4, K5, K13) önerilen
> seçenekle kapatıldı; diğerleri açık kaldı ve kod yazılırken varsayım
> yapılmayacak.
>
> **Bu dördü geri alınabilir kalsın diye sıra böyle kuruldu:** ilk iş kreatif
> tablosu — hiçbir mevcut tabloyu değiştirmiyor, yalnızca ekliyor. Yani
> "bu mantık bana uymadı" cevabı gelirse atılacak şey yeni bir tablo olur,
> göç etmiş veri değil. En riskli adım (mevcut `ad_drafts`'ın yerini alacak
> ağaç) bilerek sonraya bırakıldı.

Her biri tartışılacak. `Karar:` satırları oturumda doldurulacak.

> **2026-08-16, ikinci tur — ELLE BOOST'UN BEŞ KARARI KAPANDI.** K16, K17, K18
> tartışıldı ve kapatıldı; tartışma sırasında kodda çıkan iki açık için **K19**
> (harcama emniyeti) ve **K20** (aynı gönderinin tekrar boost'u) eklendi.
> Toplam **yirmi karardan on dördü kapalı, altısı açık** (K2, K3, K8, K10,
> K12, K15) — açık kalanların hiçbiri elle boost'u engellemiyor.
>
> **İkisi önerilen seçenekten farklı kapandı** ve gerekçeleri kendi
> bölümlerinde yazılı: K16 (c) seçildi — "hedef kitle" istemi kayıtlı
> kitlelerle karşılanıyor; K17'de deneme sırası doğrudan Instagram.

---

### K1 — Tek veri modeli mi, iki ayrı model mi?

- **(a)** Tek ağaç, iki yüzey. Basit yüzey ağacı bir üreticiyle kurar.
- **(b)** İki ayrı model: basit yüzey bugünkü düz `ad_drafts`'ta kalır, uzman
  yüzeyi yeni bir ağaç tablosuna yazılır.

**Öneri: (a).** (b) ikinci bir yayın yolu demek ve bu projenin en pahalı hata
deseni tam olarak bu — bugün üç yol var ve altı hatanın düzeltmesi ikisine hiç
gitmedi. (b)'nin tek avantajı ilk turda daha az iş; bedeli her Meta kuralını
iki yerde öğrenmek.

**Karar: (a) — TEK AĞAÇ.** 2026-08-16'da kapandı. Gerekçe belgede: iki
model = iki yayın yolu ve bu projede altı hatanın düzeltmesi zaten üç yoldan
yalnızca birine gitmişti.

---

### K2 — Kim hangi yüzeyi görüyor?

- **(a)** Rolden türer: müşteri seviyesindeki kullanıcı yalnızca basit yüzeyi
  görür, ajans ikisini de.
- **(b)** Herkes seçebilir, varsayılan rolden gelir.
- **(c)** Müşteri bazında ayar: bu müşteri uzman yüzeyini görebilir/göremez.

**Öneri: (a).** Beyaz etiketli üründe müşteriye teklif stratejisi göstermek
hem korkutucu hem riskli. (b) bugünkü mod anahtarının aynısı ve aynı sorunu
üretir: acemi "gelişmiş"i görüp kendini yetersiz hisseder.

**Karar:** _(açık)_

---

### K3 — Müşterinin yayını doğrudan mı çıksın, onaya mı düşsün?

- **(a)** Doğrudan yayın, müşteri başına **günlük bütçe tavanı** ile
  sınırlanır.
- **(b)** Ajans onayına düşer. Auto-Boost'ta onay kuyruğu **zaten var ve
  çalışıyor** (`candidate → decision → create-approved`); müşteri modundaki
  reklamlar da aynı kuyruğa girebilir.
- **(c)** Müşteri bazında ayar: bu müşteri onaysız yayınlayabilir.

**Öneri: (c), varsayılan (b).** Ajansın müşterisi ajansın reklam hesabında
para harcıyor; ilk kurulumda onay doğru varsayılan. Ama her müşteri için onay
beklemek ajansı yavaşlatır, bu yüzden kapatılabilir olmalı.

**Karar:** _(açık)_

---

### K4 — Uzman yüzeyinin ilk tur kapsamı

- **(a)** Tek ad set + çoklu kreatif (A/B).
- **(b)** Çoklu ad set + çoklu kreatif (tam ağaç).
- **(c)** (b) + kayıtlı kitle kütüphanesi.

**Karar: (a) — TEK REKLAM GRUBU, ÇOKLU KREATİF.** 2026-08-16'da kapandı ve
yazıldı. Şema çoklu grubu taşıyor, arayüz tek grup gösteriyor; şemayı
sonradan çoğaltmak migration demek, arayüzü açmak bir ekran işi.

**Uygulamada çıkan iki şey:**

1. **Çoklu kreatif yeni bir eşleme gerektirmedi.** İlk reklam `publishDraft`
   ile kampanyayı ve ad set'i kuruyor, kalanlar `createAd` ile aynı ad set'e
   ekleniyor — ikisi de mevcut kod ve `createAd`'i toplu oluşturucu zaten
   kullanıyor.
2. **Bir varyantın düşmesi kampanyayı düşürmüyor.** Kampanya ve ad set çoktan
   açıldı ve para harcamaya başladı; hepsini geri almak, çalışan bir yapıyı
   bir varyant yüzünden yıkmak olurdu. Düşen varyantın sebebi kendi satırına
   yazılıyor.

**Kalan kısıt çoklu AD SET.** `publishDraft` tek ad set yazıyor ve ikincisini
açmanın yolu canlıda hiç denenmedi; ağaç taşıyor ama yayınlamıyor ve bu
kullanıcıya açıkça söyleniyor.

Kayıtlı kitle (c) hâlâ kapsam dışı — BASE'e ait.

---

### K5 — Kreatif ayrı bir varlık mı olsun?

Bugün görseller taslağa bağlı (`ad_draft_assets.draft_id`).

- **(a)** Kreatif kendi tablosu olur; bir kreatif birden çok reklamda
  kullanılır.
- **(b)** Bugünkü gibi kalır; ad set başına N reklam olunca her reklam kendi
  görsel kümesini taşır.

**Öneri: (a).** (b) ile "aynı görselle iki metin dene" senaryosu görseli iki
kez yüklemek demek ve arşivin varlık sebebini yeniden deler — arşiv tam da
bunun için yazılmıştı.

**Karar: (a) — KREATİF AYRI VARLIK.** 2026-08-16'da kapandı ve inşaatın ilk
adımı bu. §9.5'teki metin havuzu bunu zorunlu kılıyor: Google RSA'nın on beş
başlığı `ad_drafts`'ın üç metin sütununa sığmıyor.

---

### K6 — Menü ve bilgi mimarisi

- **(a)** Tek "Reklamlar" girişi, altında dört başlangıç: hızlı reklam /
  kampanya kur / gönderiyi öne çıkar / toplu.
- **(b)** Bugünkü üç ayrı sayfa kalır, içleri değişir.
- **(c)** İki sayfa: "Reklam Oluştur" (basit) ve "Kampanya Yönetimi" (uzman +
  toplu), Auto-Boost ayrı kalır.

**Öneri: (a).** Kullanıcı "reklam vereceğim" diye geliyor; giriş kapısı tek
olmalı. Auto-Boost'un **kural yönetimi** yine ayrı bir sayfada kalabilir —
orası reklam oluşturma değil, otomasyon ayarı.

**Karar: (a) — TEK GİRİŞ.** 2026-08-16'da kapandı. `/reklam-olustur` artık bir
giriş kapısı: dört başlangıç noktası (Hızlı Reklam, Kampanya Kur, Toplu
Oluştur, Gönderiyi Öne Çıkar) ve kampanya listesi.

Menüde üç madde yerine iki: **Reklamlar** ve **Akıllı Boost**. Boost menüde
kaldı çünkü orada yapılan iş reklam oluşturmak değil OTOMASYON AYARI — kural
kurmak ve onay kuyruğunu yönetmek. Kuralın ürettiği kampanyalar zaten
Reklamlar listesinde görünüyor. Toplu oluşturma menüden çıktı; giriş
kapısından açılıyor.

---

### K7 — Görsel kırpma nerede yapılacak?

- **(a)** Tarayıcıda: kullanıcı odak noktasını sürükler, üç oran canvas'ta
  üretilip yüklenir.
- **(b)** Sunucuda: tek görsel yüklenir, merkez kırpma ile üç oran üretilir,
  kullanıcı sonucu görür ve isterse odak noktasını değiştirir.
- **(c)** Yalnızca öneri: kırpmayı yapmayız, hangi oranın eksik olduğunu daha
  erken söyleriz.

**Karar: (a) — TARAYICIDA, ODAK NOKTALI.** 2026-08-16'da kapandı ve yazıldı.
Sunucuda kırpma yeni bir görüntü işleme bağımlılığı demekti (bugün yalnızca
`image-probe.ts` var ve o sadece başlık okuyor); canvas bunu bağımlılıksız
yapıyor ve kullanıcı sonucu anında görüyor.

**Uygulamada çıkan üç şey:**

1. **Kırpılan görsel arşive yazılıyor** ve mükerrer kontrolü işi kendiliğinden
   çözüyor: aynı kaynak + aynı odak = aynı baytlar = mevcut kayıt dönüyor.
   Arşiv şişmiyor, ama kullanıcıya "zaten vardı" diye söyleniyor.
2. **Çözünürlük sınırı gerçek bir kısıt.** 800×600'den 9:16 kırpmak 338×600
   üretiyor ve `MIN_IMAGE_EDGE`'in altına düşüyor. Üretilemeyen oran sessizce
   atlanmıyor; kaçının neden üretilemediği yazıyor.
3. **Canvas kirlenmesi tuzağı.** Görseli `<img src>` ile çizmek tuvali
   kirletiyor ve `toBlob` SecurityError fırlatıyor — üstelik SESSİZ bir tuzak:
   önizleme çalışır, kullanıcı odağı ayarlar, "üret" der ve ancak o an patlar.
   Baytlar `fetch` + `createImageBitmap` ile alınıyor.

---

### K8 — Bütçe tahmini ilk turda mı?

Meta'nın `delivery_estimate` ucu var ama **bu projede hiç çağrılmadı**; dönen
aralığın Türkiye'deki küçük hesaplarda ne kadar anlamlı olduğu
doğrulanmadı.

- **(a)** İlk turda gelsin — basit yüzeyin en büyük kazancı bu.
- **(b)** Sonraya. Üç bütçe kartı yine olur ama altında tahmin yerine düz
  açıklama yazar ("küçük başla, sonuçları gör").
- **(c)** Kendi verimizden tahmin: `insights_daily` dolu, aynı müşterinin
  geçmiş CPA'sından aralık üretilir.

**Öneri: önce (b), aynı turda (a) denenir.** Tahmin gösterip tutmaması,
hiç göstermemekten kötü — bu ürünün müşterisi o sayıya inanır.
(c) cazip ama 2026-07-23'ten eski veri yok
([DEVAM.md](DEVAM.md)), yani çoğu müşteride hesaplanacak geçmiş yok.

**Karar:** _(açık)_

---

### K9 — `special_ad_categories`

Bugün üç yazma yolunda da sabit `[]`.

- **(a)** Müşteri kartına bir alan: bu müşteri özel kategori mi (emlak /
  istihdam / kredi / sosyal-siyasi). Kampanyaya oradan geçer.
- **(b)** Kampanya kurarken sorulur.
- **(c)** Şimdilik dokunulmaz.

**Karar: (a) — MÜŞTERİ KARTINDA.** 2026-08-16'da kapandı ve yazıldı.
Kategori müşterinin özelliği, kampanyanın değil; her kampanyada sormak bir gün
unutulacağı anlamına gelir ve o gün pahalı.

**Bugünkü cevap (c)'yi de destekliyordu ve yine de yazıldı:** kullanıcı
izlenen iki inşaat müşterisinin konut reklamı VERMEDİĞİNİ doğruladı. Ama bu
"bugün" bilgisi — ajans yeni müşteri ekleyecek ve alan yoksa beyan
edilemeyecek. Varsayılan boş ve çoğu müşteride doğru cevap bu.

**Uygulamada ortaya çıkan asıl mesele HEDEFLEME KISITI.** Meta özel
kategorilerde yaş, cinsiyet ve ayrıntılı hedeflemeyi kapatıyor. Alanları yine
göndermek isteğin reddedilmesi demek — ya da daha kötüsü, Meta kabul edip
sessizce yok sayıyor ve kullanıcı 25-44 yaş kadın hedeflediğini sanıyor.
Kısıtı `restrictTargetingFor` uyguluyor, ne düştüğünü sayıyor ve yayın
kontrolü bunu yayından ÖNCE söylüyor.

**Google kapsam dışı:** orada da benzer kategoriler var ama beyan kampanya
API'sinde değil, hesap seviyesinde ve panel üzerinden. Uydurma bir eşleme,
beyan edildiği sanılan ama hiçbir yere gitmeyen bir alan olurdu.

---

### K10 — Yayın sonrası

- **(a)** Yayınlanan ağaç senkronize `Campaign/AdGroup/Ad` satırlarına
  bağlanır; oluştur ekranı durum, harcama, durdur ve kopyala gösterir.
- **(b)** Bugünkü gibi: yayınlanınca Genel Bakış'a yönlendirilir.

**Öneri: (a) ama kademeli** — ilk turda yalnızca **durum + kopyala**. Durdurma
zaten Kurallar modülünde var ve iki yerden durdurmak çakışma üretebilir.

**Karar:** _(açık)_

---

### K11 — Mevcut `ad_drafts` verisi ne olacak?

Üretimdeki taslak sayısı karar anında **bilinmiyordu** — 16 Ağustos'ta deploy
sonrası ölçüldü: **0 satır**. Veritabanı 15 Ağustos'ta sıfırlanmıştı.

- **(a)** Taşınır (düz satır → tek düğümlü ağaç).
- **(b)** Yayınlanmışlar okunur kalır, yayınlanmamışlar silinir.
- **(c)** Sayı sıfır ya da ihmal edilebilirse tablo bırakılır, yenisi kurulur.

**Karar: EMEKLİ AMA SİLİNMEDİ.** 2026-08-16'da kapandı.

Karar verilirken sayı bilinmiyordu ve tam da bu yüzden veri taşınmadı ya da
düşürülmedi. Yapılan: eski akışın yazma yolları kapatıldı (uçlar 410 dönüyor), yeni bir
taslak oluşturmanın yolu kalmadı; mevcut kayıtlar Reklamlar ekranında SALT
OKUNUR bir bölümde duruyor ve bölüm boşsa hiç görünmüyor.

**Taşıma sayıdan bağımsız olarak da doğru değildi:** eski taslakların
görselleri taslağa özel dosyalar (`ad_draft_assets`) ve bir kısmının arşivde
karşılığı yok — kreatif kütüphanesine dönüştürülemiyorlar. Taşıma "yarısı
çalışan" bir sonuç üretirdi.

**Yazma neden kapatıldı:** arayüzden erişilemiyor olması yetmez. Açık bir uç
bir gün başka bir ekrandan ya da bir betikten sessizce yeniden kullanılır ve o
taslak yeni akışın hiçbir kontrolünden geçmez — özel reklam kategorisi beyanı
dahil. `retired.spec.ts` kilitliyor.

**Tablonun düşürülmesi ayrı bir iş.** Sayı artık biliniyor (0) ve düşürme
güvenli; yapılırken `ad_draft_assets`, `02_rls.sql` politikaları ve
`pglite-harness.ts`'nin `TRUNCATE` listesi birlikte temizlenmeli. Salt okunur
uçlar ve `retired.spec.ts` de o zaman kaldırılır.

---

### K12 — §2.5'teki dört sessiz hata ne zaman düzeltilecek?

- **(a)** Hemen, yeniden tasarımdan önce, ayrı bir commit'te.
- **(b)** Yeni yüzeylerle birlikte — yeni kodda zaten olmayacaklar.

**Öneri: (a) yalnızca 1 numara için** (metin kaybı — veri kaybı ve bugün
canlıda), gerisi (b). Yeniden tasarım haftalar sürebilir ve o süre boyunca
kullanıcı yazdığını kaybetmeye devam eder.

**Karar:** _(açık)_

---

### K13 — Bir taslak kaç platform taşısın?

- **(a)** Bir taslak = **bir platform**. "Her ikisinde yayınla" ikinci bir
  taslak üretir; ikisi ortak bir **grup kimliğiyle** bağlanır ve raporlama o
  kimlik üzerinden birleşir.
- **(b)** Bir taslak = N platform. Yayınlayıcı ikiye dağıtır.

**Öneri: (a).** Üç gerekçe, üçü de bu projenin bilinen hata desenleri:

1. **Yarım durum.** Meta başarılı, Google düştü — tek satır iki gerçeği
   taşıyamaz. `createBoost` yarım kalan varlıkları geri alıyor
   ([meta.provider.ts:1155](../apps/api/src/modules/connections/providers/meta.provider.ts:1155))
   ama iki **platform** arasında atomik geri alma diye bir şey yok.
2. **Bütçe.** "Günde 200 ₺" ikiye nasıl bölünecek? Bu kullanıcının kararı;
   bizim uydurmamız, hesabın ayarına güvenmekle aynı hata sınıfı.
3. **Sonradan evrim.** İki platform bağımsız değişiyor; tek satır ikisini
   birden temsil edemez ve zamanla hangisinin doğru olduğu bilinmez.

Grup kimliği (b)'nin tek gerçek faydasını — birleşik raporlama — zaten
veriyor.

**Karar: (a) — BİR TASLAK = BİR PLATFORM, ortak grup kimliği.** 2026-08-16'da
kapandı. Belirleyici olan §9.7: bugünkü tek `status`/`error` alanı "Meta çıktı,
Google düştü" durumunu ifade edemiyor.

---

### K14 — Google için hangi kampanya tipi?

- **(a)** **Performance Max.** Varlık ver, gerisini Google karara bağlasın.
  Ürünün felsefesine en yakın olan bu ve kapsama sistemi zaten PMax
  yuvalarına göre yazılmış.
- **(b)** **Arama (Search).** Anahtar kelime gerekiyor ama niyet en net olan
  kanal ve "aramada bulunmak" hedefinin tek karşılığı.
- **(c)** İkisi de, hedefe göre.

**Karar: (b) — ARAMA. PMax sonraya.** 2026-08-16'da kapandı ve yazıldı.
Sıra ters görünüyor ama gerekçesi `goal-mapping.ts`'in kendi mantığı: PMax
dönüşüm takibi olmadan öğrenmiyor ve bu üründe piksel/etiket hikâyesi hiç yok
— Meta tarafında `OUTCOME_SALES` tam bu yüzden kullanılmıyor.

**Aramanın beklenmedik faydası:** arama reklamı METİNSEL. Görsel yükleme,
kırpma ve kapsama makinesinin hiçbiri gerekmiyor; `uploadAdImage`
uygulanmamış kalabildi. Yüzey alanı ve dolayısıyla risk belirgin küçüldü.

**Uygulamada verilen dört karar:**

1. **Kampanya PAUSED açılıyor ve PAUSED KALIYOR** — Meta yolundan bilerek
   farklı. Orada kampanya en sonda ACTIVE'e alınıyor çünkü o yol canlıda bir
   kez çalıştı; burası hiç çalışmadı ve ilk gerçek çağrının sonucunu bir
   insan görmeden para harcanmamalı.
2. **Arama ağı ortakları ve Görüntülü Reklam Ağı açıkça KAPALI.** Google'ın
   varsayılanı ikisini de açık getiriyor; alanı göndermemek, arama kampanyası
   kurduğunu sanan kullanıcının bütçesinin bir kısmının bambaşka bir
   envantere gitmesi olurdu.
3. **`partialFailure: false`.** Açık olsaydı Google geçersiz işlemleri atlayıp
   kalanları uygular ve yanıt "başarılı" görünürdü — üç anahtar kelimeden
   ikisi eklenmiş bir kampanya, hiçbir hata olmadan.
4. **Teklif `manualCpc`.** `MaximizeConversions` dönüşüm takibi istiyor.

**BU YOL CANLIDA HİÇ ÇALIŞTIRILMADI.** Yayın kontrolü bunu kullanıcıya uyarı
olarak söylüyor. İlk çağrı ajansın kendi hesabında, en küçük bütçeyle
yapılmalı — kampanya zaten duraklatılmış açılıyor.

**Bağlı soru hâlâ açık — dönüşüm takibi.** PMax'i istiyorsak Google etiketi ve
dönüşüm tanımı bu ürüne girmek zorunda; o iş yazılmadı.

---

### K15 — Desteklenmeyen hedef arayüzde ne olsun?

- **(a)** Seçenek gösterilir, **sebebiyle** pasif: "henüz yok" ile "hiç
  olmayacak" farklı cümleler.
- **(b)** Gizlenir.

**Öneri: (a).** Provider zaten üç ayrı gerekçe üretiyor (§9.1) ve bu bilgi
bugün hiçbir yere ulaşmıyor. Gizlemek, kullanıcının Google bağlayıp neden
hiçbir şey yapamadığını anlamaması demek — sessiz hata deseninin arayüz
karşılığı.

**Karar:** _(açık)_

---

### K16 — Elle boost'ta hedefleme ne kadar açılsın?

Kullanıcı "lokasyon **ya da** hedef kitle" dedi — ikisi de olabilir demek, ama
"hedef kitle" panelde henüz hiçbir şeye karşılık gelmiyor.

- **(a) Yalnızca lokasyon.** Ülke/şehir seç, gerisi geniş kalsın. Boost'un
  amacı zaten mevcut ilgiyi büyütmek; dar hedefleme onu zaten gören kitleye
  tekrar göstermek olur (bugünkü sabit kodun gerekçesi de bu).
- **(b) Lokasyon + yaş + cinsiyet.** Meta'nın en anlaşılır üç alanı; hedef
  kullanıcı reklamcılık bilmese de bu üçünü kurabiliyor.
- **(c) (b) + Meta'daki kayıtlı kitleler.** Ajans Ads Manager'da kitle
  kurmuşsa panelden seçilebilir. Kurulu kitle yoksa liste boş görünür ve
  kullanıcı eksik bir şey olduğunu sanar.

**Öneri: (b), (c) sonraya.** İlgi/davranış hedeflemesi hedef kullanıcının
bilmediği bir dil ve yanlış kullanıldığında sessizce erişimi öldürüyor —
"hedefleme sorulmuyor" ilkesinin (§3) sınırı burada. Kayıtlı kitleler ayrı bir
senkronizasyon işi.

**Karar: (c) — ŞEHİR + YAŞ + CİNSİYET + KAYITLI KİTLELER.** 2026-08-16'da
kapandı, önerinin bir adım ötesinde. Gerekçe kullanıcının kendi cümlesinde:
*"hangi lokasyona gösterileceğini **ya da hedef kitleye** gösterileceğini"* —
"hedef kitle"nin panelde bir karşılığı olacaksa, ilgi alanı listesi değil
**ajansın Ads Manager'da zaten kurduğu kitle** olmalı. İlgi/davranış seçtirmeme
gerekçesi (§3) aynen geçerli; kayıtlı kitlede seçimi yapan zaten ajans ve
seçim panelde değil Meta'da kurulmuş oluyor.

Bu kararın bedeli iki yeni uç nokta ve ikisi de bu işin asıl maliyeti:

- **Coğrafi arama** (`/search?type=adgeolocation`). `cityKeys` şemada VAR
  ([campaign-advanced.schema.ts](../packages/shared/src/schemas/campaign-advanced.schema.ts))
  ve `targetingFrom` onu Meta'ya çeviriyor, ama **onu dolduran hiçbir şey
  yok** — ne arayüz, ne uç nokta. Uzman panelinde bile şehir alanı yok. Şehir
  olmadan "lokasyon seç" bugünkü sabit `TR`'nin adının değişmesinden ibaret
  kalırdı.
- **Kayıtlı kitleler.** Ekran açılırken çekiliyor, **tabloya yazılmıyor**: yeni
  tablo `02_rls.sql` politika listesi ve `pglite-harness.ts` TRUNCATE listesi
  demek (CLAUDE.md §3), oysa bu veri hiçbir yerde saklanmak zorunda değil.

**Kitle listesi boşsa boş bir açılır liste GÖSTERİLMEZ** — "Ads Manager'da
kayıtlı kitle bulunamadı" yazılır. K16'nın (c) maddesindeki itiraz buydu ve
karşılığı "sessiz kesme yok" kuralının kendisi: boş liste, kullanıcıya kendi
kurulumunda bir şey eksik olduğunu düşündürür.

**Özel kategoride kayıtlı kitle de kapalı.** `restrictTargetingFor` bugün yaş
ve cinsiyeti düşürüyor; kategori kısıtı kayıtlı kitleleri de kapsıyor olmalı,
çünkü kitlenin kendisi yaş/cinsiyet daraltması taşıyabilir. Ekran üçünü birden
kapatmalı ve sebebini yazmalı. **Bu canlıda doğrulanmadı:** Meta reddedebilir
de, kabul edip sessizce yok sayabilir de — ikincisi olursa kullanıcı
uygulanmayan bir kitleye reklam verdiğini sanır. İlk gerçek çağrıda bakılacak
ve sonuç buraya yazılacak.

---

### K17 — Instagram gönderisi nasıl boost edilecek?

Bugünkü `object_story_id` yolu Facebook sayfa gönderisine göre yazılmış (§7.2).

- **(a)** Profil türüne göre dallan: Facebook'ta bugünkü yol, Instagram'da
  IG'ye özel alanlar.
- **(b)** Instagram gönderisini de Facebook sayfası üzerinden yayınla.
- **(c)** Önce yalnızca Facebook desteklensin, Instagram sonra.

**Öneri: (a).** (b) çalışmıyor — IG medyasının sayfa gönderisi karşılığı yok.
(c) istenen şeyin ta kendisini dışarıda bırakıyor. **Ama bu kod canlıda
doğrulanmadan yazılamaz:** alan adları belgeden okunup yazılırsa Meta'nın
*kabul edip görmezden gelme* ihtimali var ve o zaman boost oluşur, para harcar,
yanlış gönderiyi gösterir. Ajansın kendi hesabında tek bir gerçek çağrı, bu
kararın önkoşulu.

**Karar: (a) — PROFİL TÜRÜNE GÖRE DALLAN. Denemede sıra: DOĞRUDAN IG.**
2026-08-16'da kapandı.

(a) tartışmalı değildi. Kapatılan asıl soru **denemenin sırası**: önce
bugünkü Facebook yolunu canlıda doğrulayıp sonra IG'ye geçmek önerilmişti,
kullanıcının kararı doğrudan IG'yi denemek. Gerekçesi de yerinde — istenen şey
IG ve Facebook turu bir ara adım.

**Bunun bedeli açıkça yazılsın:** boost yolu (FB dahil) canlıda HİÇ
çalıştırılmadı. Yani ilk IG çağrısı hata verirse iki ihtimal birden açık kalır:
IG alanları mı yanlış, yoksa boost yolunun kendisi mi. Ayırt etmenin yolu
peşinen bellidir ve hata gelirse ilk yapılacak şey budur: **aynı hesapta bir
Facebook sayfa gönderisiyle tek bir çağrı.** Yeşilse sorun IG dalında, o da
düşerse sorun ortak yolda.

**Deneme kuralları:** ajansın kendi hesabı, en küçük bütçe, Meta'nın dönen
hata gövdesi TAM METNİYLE kaydedilir (`code`/`subcode` dahil — §2'de altı
hatanın beşi bu metinden çözüldü).

**Doğrulanacak somut belirsizlik:** `/{ig-user}/media` uçunun döndürdüğü `id`
ile reklam API'sinin kabul ettiği IG medya kimliği aynı olmayabilir; Meta'nın
iki ayrı kimlik uzayı var. Alan adları belgeden yazılıp geçilmeyecek — çağrı
başarılı dönse bile **oluşan reklam Ads Manager'da açılıp doğru gönderiyi
gösterdiği gözle görülecek.** "200 döndü" bu projede doğrulama sayılmıyor.

---

### K18 — Elle boost'ta bütçe ve süre nasıl sorulacak?

- **(a) Toplam tutar + süre.** "300 TL, 5 gün." Kullanıcı ne harcayacağını
  bilir; günlük bütçe arkada hesaplanır.
- **(b) Günlük bütçe + süre.** Meta'nın ve bugünkü `createBoost`'un dili.

**Öneri: (a) gösterilsin, (b) gönderilsin.** "Günlük 60 TL" diyen bir ekranda
kullanıcı 5 günde 300 TL harcayacağını çıkarmak zorunda kalıyor; boost'ta
merak edilen şey toplam. Ekranda ikisi birden yazılmalı ki sürpriz olmasın.
Tamsayıya bölünmeyen tutarlarda **yukarı değil aşağı** yuvarlanmalı — beklenen
tutarı aşan bir harcama, eksik harcamadan çok daha kötü karşılanır.

**Karar: TOPLAM GÖSTER, TOPLAM GÖNDER.** 2026-08-16'da kapandı; önerinin
(a göster / b gönder) yerine üçüncü bir yol seçildi. Ekranda "300 TL, 5 gün",
Meta'ya ad set seviyesinde `lifetime_budget`.

Gerekçe: (a)/(b) ikilisi çeviriyi ekranın arkasına saklıyor ve **çeviri tam
oturmuyor**. Günlük bütçe Meta'da sert bir tavan değil — günü aşabiliyor ve
dengelemeyi hafta içine yayıyor. Yani "300 TL harcayacaksın" yazan bir ekranın
altından 5 × 60 TL göndermek, panelde yazan sayı ile hesaptan çıkan sayının
ayrışması demek. Bu üründe kabul edilmeyen hata sınıfı tam olarak bu. Toplam
gönderildiğinde yuvarlama sorunu da ortadan kalkıyor: kullanıcının yazdığı sayı
Meta'nın gördüğü sayının kendisi oluyor.

`lifetime_budget` bitiş zamanı zorunlu kılıyor — `createBoost` zaten süreden
bir `end_time` türetiyor, yani yeni bir alan gerekmiyor.

**KURAL YOLU GÜNLÜK KALIYOR.** `boost_rules.daily_budget_micros` günlük
düşünüyor ve doğrusu da bu: kural süresiz çalışıyor, tavanı ayrıca
`monthly_cap_micros` tutuyor. Yani `BoostRequest` **iki kipli** olacak (günlük
| toplam) ve kuralın bugünkü davranışı varsayılan kalacak — §3'ün "çalışan
davranış bozulmuyor" kuralı.

---

### K19 — Elle boost'un harcama emniyeti ne olsun?

Kuralın aylık sert tavanı (`boost_rules.monthly_cap_micros`) **kuralın
üzerinde**. Elle boost'ta `boost_rule_id` NULL, yani ne tavan var, ne onay
kuyruğu, ne kural. İstenen "direkt yayınla" bu — ama boost özelliğinin tek
emniyeti de buydu.

- **(a) Onay satırı + aylık bütçe uyarısı.** Sert tavan yok; yayın düğmesinin
  üstünde toplam tutar ve "bu ay boost'a ne gitti / müşterinin aylık bütçesinin
  ne kadarı" yazıyor.
- **(b) Hiçbir şey.** En az sürtünme; yanlış yazılan bir sıfır anında gidiyor.
- **(c) Elle boost için ayrı aylık tavan.** Müşteri kartında yeni bir ayar.

**Karar: (a).** 2026-08-16'da kapandı. (c) kurulması gereken yeni bir ayar ve
kullanıcı kurmadıkça ya sıfır ya sınırsız davranmak gerekiyor — ikisi de kötü
varsayılan. (b) ise kararı kullanıcının verdiği doğru ama **tutarı görmeden**
verdiği bir karara dönüşüyor.

**Ara ekran DEĞİL, aynı ekranın son satırı** (§7.2: "ara onay yok"). Uyarı
yayını engellemiyor, yalnızca sayıyı gösteriyor.

---

### K20 — Elle boost aynı gönderiyi ikinci kez öne çıkarabilsin mi?

`organic_posts.boosted_at` kalıcı ve kısmi tekil indeks canlı ikinci boost'u
engelliyor. Kural yolu için doğru: kural aynı gönderiye ikinci kez para
harcamamalı.

**Karar: elle yolda UYARI, blok değil.** 2026-08-16'da kapandı. Gönderiyi
seçen kullanıcının kendisi; "bu gönderi 4 gün önce öne çıkarıldı" demek
bilgilendirme, reddetmek ise kullanıcının verdiği kararı geri çevirmek olur.
Kısmi tekil indeks **canlı** boost'u engellemeye devam ediyor — aynı gönderi
için aynı anda iki boost, para harcayan bir mükerrerlik.

---

## 11. Sıra ve riskler

Kararlar kapandıktan sonra önerilen sıra:

| # | Adım | Neden bu sırada |
|---|---|---|
| 1 | Yayın çekirdeği: ağaç şeması + tek publisher | Çekirdek önce gitmezse üç yolu ayrı ayrı yazmış oluruz — bugünkü durumu daha büyük ölçekte tekrarlarız |
| 2 | Basit yüzey | Vaadin sahibi bu; en çok kullanıcıya dokunuyor |
| 3 | Uzman yüzey (tek ad set) | Ajansın günlük işi |
| 4 | Toplu = uzmanın tablo girişi | Ham kimlikler kalkar |
| 5 | Auto-Boost = ağaç üreticisi + elle boost | En az riskli, en son |

**Google yazma yolu bu sıranın neresinde?** Erişim açıldığına göre artık
"sonra" demenin teknik gerekçesi kalmadı; karar ürünsel. Önerim: **1. adımda
yalnızca arayüz sözleşmesi** (`specFor` / `supports`, §9.4) — Google'ın
gerçek yazma kodu 3. adımdan sonra, ayrı bir iş olarak. Gerekçe: Google'ın
kendi "altı hatası" Meta'nınkiyle aynı anda çıkarsa hangisinin ne olduğu
ayırt edilemez. Ama sözleşme 1. adımda girmezse sonradan geriye dönük
takılır — asıl maliyet orada.

### Riskler

- **Meta'da Advanced Access hâlâ yok.** Yeni çekirdeği Meta tarafında yalnızca
  ajansın kendi hesaplarında canlı sınayabiliriz. §2'nin dersi: canlı çağrı
  olmadan bir yazma yolu "test edildi" sayılmıyor. Yani 1. adım bitince
  **hemen** bir gerçek yayın denenmeli, beş adımın sonunda değil.
- **Google'da engel kalktı, tehlike başladı.** Yazma kodu artık gerçek bir
  müşteri hesabında gerçek para harcayabilir (§9.1.1). İlk canlı çağrı ajansın
  kendi hesabında, en küçük bütçeyle ve hemen duraklatılarak yapılmalı.
- **Birleştirmenin kendisi riskli.** Altı hatayı kilitleyen testler
  `publishDraft` yolunu hedefliyor; birleşme sonrası hepsi yeşil kalmalı. O
  testler bu işin şartnamesi.
- **CLAUDE.md tuzakları geçerli:** yeni tablo → `02_rls.sql` politika listesi
  + `test/pglite-harness.ts` TRUNCATE listesi; enum'a değer eklemek ayrı
  migration; `Prisma.sql` yorumlarında backtick yok.
- **RLS elle değil testle doğrulanacak.** `ad-account-pool-rls.spec.ts`
  deseni (`SET ROLE`) yeni tablolara uygulanmalı.

## 12. Doğrulanması gerekenler

Belgede varsayım olarak duran, canlıda ya da veriyle sınanacak maddeler:

- `delivery_estimate` Türkiye'deki küçük hesaplarda anlamlı aralık dönüyor mu
  (K8).
- ~~Üretimde kaç `ad_drafts` satırı var (K11).~~ **CEVAPLANDI 2026-08-16: 0
  satır.** Emekliye ayırma hiçbir taslağı kilitlemedi.
- Ajansın emlak / istihdam / kredi kategorisinde müşterisi var mı (K9).
- **Instagram gönderisi bugünkü boost yoluyla ne yapıyor** (K17): Meta hata mı
  veriyor, yoksa isteği kabul edip yanlış/boş bir reklam mı üretiyor? Kod
  profil türüne hiç bakmıyor ve bu yol canlıda hiç denenmedi.
- Ajansın Meta hesabında kayıtlı kitle var mı (K16 (c) buna bağlı).
- Tarayıcıda kırpılmış görselin Meta'nın minimum kenar kuralını
  (`MIN_IMAGE_EDGE`) her oranda geçtiği — kırpma çözünürlük düşürüyor.
- **Google erişim seviyesi Basic mi Standard mı** (K14). Basic'te günlük işlem
  sınırı var ve toplu oluşturmada ilk çarpılacak yer orası. **Kısmen
  cevaplandı:** 127 gerçek hesap geldiğine göre token en azından Basic — test
  token'ı yalnızca test hesaplarını görüyor
  ([google.provider.ts:204](../apps/api/src/modules/connections/providers/google.provider.ts:204)).
  Standard olup olmadığı hâlâ bilinmiyor.
- **Google RSA ve PMax'in tam metin kotaları** (§9.5). RSA'nın 15 başlık / 4
  açıklama sınırı belgelenmiş; PMax'in kısa–uzun başlık dağılımı sürüme göre
  değişiyor ve canlıda doğrulanmalı. Metin havuzunun etiket şeması buna göre
  kesinleşecek.
- ~~**Google'da kaç hesap havuza düştü**~~ — **CEVAPLANDI (2026-08-16,
  panelden):** 127 hesap keşfedildi, **2'si atanmış ve izleniyor** (Ege Birlik
  Yapı · 1695129827, Fenbay İnşaat Mühendislik · 2020193566 — ikisi de TRY /
  Europe/Istanbul), **125'i havuzda**. Meta'da 157 hesap vardı.
  İki sonuç: (1) Google verisi akıyor ama **yalnızca iki müşteri için** —
  "veri geliyor" ifadesi dar; (2) K14'ün canlı sınaması bu iki hesapta
  yapılabilir.

### 12.1. Panelden çıkan yeni bulgu — "28 hesap" etiketi

Bağlantı kartının başlığı **"Google Ads · Google Ads (28 hesap)"** diyor;
hemen altındaki blok **"2 / 127"**, onun da altı **"Havuzdaki 125 hesap"**.
Aynı kartta üç sayı ve hiçbiri diğerini açıklamıyor.

Sayılar yanlış değil, **etiket yanıltıcı**:

| Sayı | Kaynak | Ne sayıyor |
|---|---|---|
| 28 | `listAccessibleCustomerIds` ([:269](../apps/api/src/modules/connections/providers/google.provider.ts:269)) | Doğrudan erişilen **kök** müşteri kimliği — çoğu MCC, reklam hesabı değil |
| 127 | `listAdAccounts` ([:336](../apps/api/src/modules/connections/providers/google.provider.ts:336)) | O köklerin altındaki, yönetici olmayan, `ENABLED` **reklam** hesapları |
| 125 | `accounts.filter(clientId === null)` ([account-picker.tsx:91](../apps/web/src/components/account-picker.tsx:91)) | Havuzda bekleyen (atanmamış) |

İki sorun:

1. **"hesap" kelimesi iki farklı şeyi anlatıyor.** 28'in çoğu yönetici hesabı
   ve `listAdAccounts` onları bilerek eliyor — "yönetici hesapları listeye
   alınmaz, reklam yayınlamazlar". Yani kart, kullanıcıya reklam
   veremeyeceği şeyleri "hesap" diye sayıyor.
2. **Etiket DONMUŞ.** `accountLabel` yalnızca yetkilendirme anında yazılıyor
   ([connections.service.ts:429, 512, 523](../apps/api/src/modules/connections/connections.service.ts:429));
   `refreshAccounts` ([:663](../apps/api/src/modules/connections/connections.service.ts:663))
   ona hiç dokunmuyor. "Hesapları yenile" 127'yi günceller, 28'i güncellemez —
   zamanla iki sayı birbirinden uzaklaşır ve kimse fark etmez.

Doğrusu: başlık ya reklam hesabı sayısını göstermeli ya da ne saydığını
yazmalı ("28 yönetici hesabı üzerinden 127 reklam hesabı"). Bu, yeniden
tasarımı beklemeden düzeltilebilir.

---

Çalışma kuralları [`CLAUDE.md`](../CLAUDE.md), durum
[`DURUM.md`](DURUM.md), devir [`DEVAM.md`](DEVAM.md).
