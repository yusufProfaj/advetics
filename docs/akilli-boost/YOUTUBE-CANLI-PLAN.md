# Akıllı Boost · YouTube'u canlıya oturtma planı

**Tarih:** 2026-10-08 · **Durum:** Aşama 0 ve 1 bitti (aşağıda); sıradaki Aşama 2 (kartta ön kontrol), sonra canlı prova

**Kullanıcı kararı:** yeni bir YouTube reklam türü eklenmeyecek. Var olan yol
(YouTube videosu → kart → Google Ads Demand Gen) gerçek bir videoyla uçtan uca
çalıştırılacak.

## 0. Bugün ne var

- Kanal bağlanınca yeni video WebSub ile kart oluyor. Ayrıca son 5 video
  ve elle "geçmiş içerik" ile 10 video kart olabiliyor.
- Onaylanınca sırayla şunlar kuruluyor: bütçe, kampanya (PAUSED), konum,
  reklam grubu, (yaş kitlesi), video varlığı, reklam. En sonda kampanya
  ENABLED yapılıyor.
- Ön ayar yalnızca bütçe istiyor. Marka adı, logo, adres ve metinler
  otomatik geliyor.
- Canlıda Google'a tek bir kez ulaşıldı. O istek logo yüklemesinde
  `login-customer-id` eksikliği yüzünden düştü (düzeltildi, `7489428`).
  **Hiçbir kampanya kurulmadı.**

## 1. Bulgular (kod okunarak, `dosya:satır`)

### Para kaybettirebilecekler (canlıdan ÖNCE kapanmalı)

| # | Bulgu | Yer |
|---|---|---|
| P1 | **Aynı video için ikinci kampanya.** "Tekrar yayınla", kampanyanın hâlâ yayında olup olmadığını yalnızca `boosts` tablosuna bakarak anlıyor. YouTube oraya hiç satır yazmıyor, bu yüzden yayındaki bir kart tekrar onaylanabiliyor. Sonuç: aynı video için iki kampanya aynı anda para harcıyor. | `autoboost-launch.service.ts:886-899`, `autoboost-read.service.ts:200-208` |
| P2 | **Kampanya yayında, kart "başarısız".** Google başarılı dönüp `launched` yazımı düşerse kampanya kimlikleri kayboluyor ve kart `failed` oluyor. Bu kart yeniden boostlanabiliyor (P1 ile aynı sonuç). | `autoboost-launch.service.ts:609-636` |
| P3 | **Prova yok ve kampanya kendiliğinden açılıyor.** İlk gerçek çağrı doğrudan para harcayan bir kampanya. Yanlış ya da sessizce yok sayılan bir alan ancak yayındayken görülür. | `google.provider.ts:2079` |
| P4 | **Zincir ortasında kota biterse yarım kampanya kalıyor.** Geri alma da aynı kotayı kullanıyor ve düşüyor. Kota her gece doluyor (2026-09-29 olayı). | `google.provider.ts:2082-2100` |
| P5 | **Panelden durdurma yok, Google yazma kesici yok.** Harcama yalnızca Google Ads'ten durdurulabiliyor. | `boost-kontrol.service.ts:216-228` |
| P6 | **`launching`te takılan kart.** Kart bir daha işlenemiyor, kapatılamıyor ve temizleyen bir iş de yok. | `autoboost-launch.service.ts:965,1000` |

### Yayın başarılı olsa bile "bozuk" görünecekler

| # | Bulgu | Yer |
|---|---|---|
| G1 | **Kartta harcama HİÇ görünmüyor.** Kuyruk kampanya kimliğini kaynak adı olarak (`customers/X/campaigns/Y`) saklıyor. Senkron ise yalın sayıyı (`Y`) saklıyor ve aradaki birleştirme hiç tutmuyor. Kart sonsuza dek "henüz senkronize edilmedi" yazıyor. | `google.provider.ts:2081` ↔ `:879`, `autoboost-read.service.ts:178` |
| G2 | **Kart sonsuza dek "Yayında".** Kampanya bitiş tarihinde dursa da kart bitmiş durumuna geçmiyor. | durum makinesinde son durum yok |
| G3 | **Kampanya 6 saate kadar panelde görünmüyor.** Yayından sonra yapı taraması tetiklenmiyor. Hesabın izlemesi kapalıysa kampanya hiç görünmüyor. | `sync-queue.service.ts`, `youtube-hesabi.ts` |
| G4 | **İzlenme verisi yok.** v25 `metrics.video_views` alanını reddettiği için alan kaldırıldı ve izlenme sabit 0. | `google.provider.ts:1041-1058,1108` |
| G5 | **Uygulanan ayar kaydedilmiyor.** Ön ayar değişince kart, kampanyanın kurulduğu hedeflemeyi değil yeni ön ayarı gösteriyor. | `applied_settings` yazılmıyor |

### Yayın anında reddedilebilecekler

| # | Bulgu |
|---|---|
| R1 | **Video hazır mı bakılmıyor.** Gizlilik, işlenme, canlı yayın, gömülebilirlik, çocuklara yönelik olma hiç kontrol edilmiyor (`part=snippet` ile yetiniliyor). Zamanlanmış ya da önce gizli yüklenip sonra yayınlanan video HİÇ kart olmuyor: ilk bildirim "bulunamadı" sayılıyor, ikincisi "düzenleme". |
| R2 | **Logo kare mi, ≥144 px mi bakılmıyor.** Logo hesaba bir kez yüklenip önbelleğe alındığı için kötü bir logo sonraki HER yayını aynı yerde düşürür. |
| R3 | **Site ya da logo eksikse kart yine de onaylanabilir görünüyor.** Hata ancak tıklayınca çıkıyor. |
| R4 | **Canlıda hiç denenmemiş alanlar:** `startDateTime`/`endDateTime`, Demand Gen için `targetSpend`, konumun kampanya seviyesinde verilmesi, birer adet başlık/uzun başlık/açıklama, CTA'nın verilmemesi, `youtubeVideoTitle` alanı. |

## 2. Plan

İki geliştirici kuralına uygun: her aşama ayrı commit, test ve mutasyon
kontrolüyle. Aşama 0 ile 1 bitmeden **para harcayan hiçbir çağrı yapılmaz**.

### Aşama 0 · Para güvenliği (kod, para harcamaz) ✅ 2026-10-08

Yapılan: tekrar kilidi (`youtube-yayin-durumu.ts`), yalın kimlik ve eski
satırların migration'ı, yeni `kontrol` durumu (takılan / yarım kalan /
kaydı düşen yayın; tekrar yalnızca kullanıcı onayıyla), Google yazma
kesicisi (`ajans_ayari.google_yazma_durduruldu`, `PUT
/reklam/ajans-ayari/google-yazma`), kilitten önce kota bekçisi, uygulanan
ayar kaydı (G5, plan dışı eklendi: tekrar kilidi süreyi oradan okuyor).
MIGRATION: `20261008170000_google_yazma_kesici`. Testler:
`youtube-canli-guvenlik.spec.ts` (27 test, 11 mutasyonun hepsi yakalandı).
Plandan sapma: takılan kart zamanlanmış işle değil, liste okunurken
işaretleniyor (gerekçe `takilanlariIsaretle`).

1. **Tekrar kilidi (P1).** Yayındaki bir YouTube kartı için "Tekrar yayınla",
   `launched_at + duration_days` geçene kadar kapalı olacak. Kartta açıklama
   yazacak: "Kampanya 14 Ekim'e kadar yayında". Kontrol sunucuda da yapılacak.
2. **Kimlik düzeltmesi (G1).** Yeni kayıtlarda yalın sayı saklanacak. Eski
   satırlar migration ile düzeltilecek. Birleştirmeyi kilitleyen bir test
   eklenecek.
3. **Kayıt düşerse "kontrol gerekli" (P2, P6).** Kampanya kimlikleri, kampanya
   açılmadan HEMEN önce yazılacak. 15 dakikadan uzun `launching`te kalan kart
   `kontrol_gerekli` olacak ve kartta "Google Ads'te bak" yazacak. Bu durumdaki
   kart tekrar boostlanamayacak.
4. **Google yazma kesici (P5).** Meta'daki `yazma-kapisi`nın karşılığı, ortam
   bayrağıyla. Bir sorun çıkarsa tek satırla bütün Google yazmalarını kapatır.
5. **Kota bekçisi (P4).** Yayından önce hesabın kota durumu okunacak. Kota
   doluysa kart kilitlenmeden "Google kotası dolu, X'ten sonra dene" yazılacak.

### Aşama 1 · Atomik istek ve kuru prova (kod, para harcamaz) ✅ 2026-10-08

Yapılan: kurulum tek `googleAds:mutate` isteği (`demandGenAtomikIstek`,
geçici kimlikler -1…-6, `partialFailure: false`); elle geri alma ve
`YarimKurulumHatasi` kalktı. Kampanya doğrudan AÇIK kuruluyor (yarım hâl
yok), istenirse DURAKLATILMIŞ (K3 için kartta "Duraklatılmış kur").
Logo hesapta yoksa AYNI istekte oluşuyor ve yayın sonrası önbelleğe
yazılıyor; prova logoyu da sınıyor. Belirsiz cevap (zaman aşımı, 5xx,
eksik yanıt) kartı `kontrol` yapıyor. Prova: `POST
/autoboost/queue/:id/prova` ve kartta "Prova et"; yayınla AYNI hazırlık
(`googleHazirla`) ve AYNI gövde, yalnızca `validateOnly`. Google reddi
alan alan Türkçe ("Reklam › başlık"). Sunucu betiği (`google-check
--demandgen-prova`) YAZILMADI: kart düğmesi aynı işi görüyor.
**Canlıda ölçülmedi:** `audienceOperation`ın atomik istekte kabulü,
`validateOnly`ın varlık oluşturmayı kapsaması, v25 alan adları. İlk iş:
Ege Birlik Yapı kartında "Prova et".

6. **Tek atomik istek (P3, P4, R4).** Sekiz ayrı çağrı tek bir
   `googleAds:mutate` isteğine iniyor. Ya hepsi kurulur ya hiçbiri:
   - Kaynaklar geçici (eksi sayılı) kimliklerle birbirine bağlanıyor.
   - Yarım kampanya ve elle geri alma ortadan kalkıyor.
   - Aynı gövde `validateOnly: true` ile **gerçek bir prova** oluyor.
   - Bu, `docs/advcampaign/SENTEZ.md` D-G4'ün ve TASARIM-PLAN İP-08'in
     önerdiği yol.
   - Logo ve video varlığının atomik isteğe girip giremediği provada ölçülecek.
     Giremiyorsa yalnızca o ikisi önden ayrı yüklenir; varlık para harcamaz.
7. **Prova kipi.** İki yerden çalışacak:
   - Kartta "Prova et" düğmesi: Google'a soruyor, hiçbir şey kurmuyor ve
     sonucu Türkçe gösteriyor.
   - Sunucuda `google-check --demandgen-prova` betiği.
   - R4'teki bilinmeyenler bununla para harcamadan cevaplanacak. Sonuç
     CLAUDE.md "Google Ads" bölümüne yazılacak.

#### Canlı prova 1 — 2026-10-09 (Ege Birlik Yapı, "Garden Villas" kartı, v25)

İlk kez canlıda koştu, `validateOnly`, hiçbir şey kurulmadı. Google
**üç** hata döndürdü:

| Hata | Teşhis | Düzeltme (bu commit, DEPLOY BEKLİYOR) |
|---|---|---|
| `campaignBudgetError=BUDGET_BELOW_PER_DAY_MINIMUM` | Google 2026-04-01'den beri Demand Gen'de **günde en az 5 USD karşılığı** istiyor (sürümsüz kural). Ön ayar 50 ₺. Dünkü gerçek yayın denemesi (kart `1feff0fe`, 08.10 18:24) de bununla düşmüş; atomik istek olduğu için hiçbir şey kurulmamış. | Ön ayar formunda ipucu. **TL karşılığı bilinmiyor:** prova artık `details` alanını gösteriyor, asgari tutar bir sonraki provada ekranda. K2 buna göre güncellenmeli. |
| `requestError=UNKNOWN` · "The error code is not in this version" (konum ölçütü) | Kampanya seviyesindeki konum reddedildi. Google belgesi Demand Gen'de reklam grubu seviyesini `upgraded_targeting` için anıyor; destek cevabına göre o ayar açıkken kampanya seviyesi reddediliyor ve ayar değiştirilemiyor. | Konum reklam grubuna (`adGroupCriterion`) taşındı, kampanyada `demandGenCampaignSettings.upgradedTargeting: true` AÇIKÇA. **Ölçülmedi** — alan adı yanlışsa prova yüksek sesle reddeder. |
| `fieldError=REQUIRED` · "Reklam › ad" | Etiket tablosu yalnız `name`i "ad" diye çeviriyor: eksik alan `ad.name`. Belge zorunlu demiyor. | Reklama zaman damgalı ad. |

Ayrıca: prova hataları `details`/`trigger` ve ham alan yolunu ATIYORDU,
bu yüzden iki hata ekrandan teşhis edilemedi. Artık ikisi de kartta
görünüyor. Prova isteği Google'dan doğrulama cevabı aldı, yani geliştirici
token'ı bu hesapta en az doğrulama yapabiliyor (K4'ün seviyesi hâlâ
okunmadı).

**Sıradaki:** deploy → aynı kartta yeniden "Prova et" → asgari TL tutarı ve
konumun yeni hâli. Bütçe K2 kapanmadan prova geçmez.

### Aşama 2 · Kartta ön kontrol (kod)

8. **Video uygunluğu (R1).** `part=status,contentDetails` okunacak. Gizli,
   işlenmemiş, canlı, gömülemez ya da çocuklara yönelik video kartta engel
   olarak yazacak. Zamanlanmış video için kart "yayınlanınca açılacak"
   durumunda bekleyecek; bildirim sınıflaması düzeltilecek.
9. **Logo (R2).** Kare olmayan logo otomatik olarak beyaz zeminle kareye
   tamamlanacak. 144 px altı logo engel olacak ve kart nedenini yazacak.
10. **Eksikler kartta (R3).** Site, logo, hesap ve hesap izlemesi kartın
    `blockedReason`'ına girecek. "Yayınla" düğmesi tıklanmadan önce kapalı
    görünecek.

### Aşama 3 · İlk canlı yayın (seninle birlikte, para harcar)

11. Önce o videoyla prova yapılacak ve yeşil çıkması beklenecek.
12. **İlk yayın DURAKLATILMIŞ kurulacak.** Tek seferlik "kur ama açma" kipi.
13. Google Ads'te gözle kontrol listesi:
    - kampanya türü Demand Gen
    - bütçe
    - başlangıç ve bitiş tarihi
    - konum (Türkiye, "bulunan" mı "ilgilenen" mi)
    - yaş
    - kanallar (In-Stream, In-Feed, Shorts)
    - video, logo, marka adı, metinler, adres
    - reklam onay durumu
14. Kontrol uygunsa panelden **Başlat**. 24 saat sonra harcama, gösterim ve
    onay durumu panelle karşılaştırılacak.

### Aşama 4 · Yayın sonrası (kod)

15. **Durdur / devam / bitir panelden (P5).** Google kampanya durumu
    güncellenecek; Meta'daki düğmeler YouTube kartında da çalışacak.
16. **Yayından hemen sonra yapı taraması (G3).** Kart birkaç dakika içinde
    harcamayı göstermeye başlayacak.
17. **Kart bitiyor (G2).** Bitiş tarihi geçince kart "Tamamlandı" durumuna
    geçecek ve tekrar kilidi açılacak.
18. **Reklam onayı kartta.** Reklam reddedilirse kart Google'ın sebebiyle
    birlikte kırmızıya dönecek.
19. **İzlenme (G4).** v25'teki doğru alan adı betikle ölçülecek
    (`video_trueview_views` olduğu tahmin ediliyor, doğrulanmadı). Kartta ve
    raporda izlenme ile izlenme oranı gösterilecek.
20. **Uygulanan ayar kaydı (G5).** Kart, kampanyanın kurulduğu hedeflemeyi
    gösterecek.

### Sonra (bu planın dışında)

- Teklif stratejisi seçimi (bugün hep Maksimum Tıklama).
- Dil hedeflemesi.
- TRY dışı para birimi.
- Bekleyen kart tavanına (50) takılan bildirimlerin görünür olması.

## 3. Senden gereken kararlar

| # | Soru | Önerim |
|---|---|---|
| K1 | İlk canlı denemede hangi workspace ve hangi video kullanılsın? | **Kapandı: Ege Birlik Yapı** (kanal bağlı). Video Aşama 3'te seçilecek |
| K2 | İlk deneme için günlük bütçe ve süre ne olsun? | ~~100 ₺/gün~~ — Google'ın asgarisi günde 5 USD karşılığı (prova 1). Asgari TL tutarı yeni provada görünecek; önerim asgarinin biraz üstü, 3 gün |
| K3 | İlk yayın duraklatılmış kurulup Google Ads'te gözle kontrol edildikten sonra mı açılsın? | Evet, yalnız ilk yayında |
| K4 | Google Ads API Center'daki geliştirici token erişim seviyesi nedir (Explorer / Basic / Standard)? | Ekrandan okuyup bana söyle. Explorer ise günlük işlem kotası 2.880 ve gece senkronuyla çakışır |

## 4. Sıra ve tahmin

Aşama 0 → 1 → 2 → 3 (birlikte) → 4. Aşama 0 ile 1 bu planın çekirdeği: para
güvenliği ve prova bitmeden canlı deneme yapılmayacak.
