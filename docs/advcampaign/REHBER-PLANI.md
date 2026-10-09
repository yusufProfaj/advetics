# AdvCampaign Rehberi — Meta + Google tek panelden, tıklayarak

> **Durum:** TASLAK PLAN, kullanıcı onayı bekliyor (2026-10-10).
> **Kullanıcının hedefi (özet):** Meta Ads ve Google Ads'in reklam oluşturma
> panellerini tek panelde birleştirmek. Amaç bir kez seçilir; Meta ve Google
> kendi doğru kurgusuyla kurulur. Sohbet botu YOK, yalnız tıklama. En basit
> ama en optimize hâli; reklam bilmeyen biri bile kullanabilmeli. Yeri:
> AdvCampaign (`/reklam`).

---

## 0. Çelişki tablosu (ajanlar başlamadan kapanacak)

| # | Depoda bugün | Yeni istek | Önerim |
|---|---|---|---|
| Ç-1 | AdvCampaign 2026-10-07 kararıyla **sohbetle yönetilen** AI akışı; `/reklam` sohbet ekranı, API'de sohbet döngüsü ve araçlar var | Sohbet yok, yalnız tıklama | Sohbet ekranı ve sohbet API'si kaldırılır; tablolar silinmez (veri). CLAUDE.md §5 ve `URUN-YAPISI-PLANI.md` güncellenir |
| Ç-2 | Yapay zekâ taslağı kuruyordu (metin, niyet) | Bot yok | **Yapay zekâ yalnız düğme arkasında yardımcı**: "Metin öner", "Anahtar kelime öner". Kullanıcı tıklamazsa hiç çalışmaz. **Karar sende (K-2)** |
| Ç-3 | Platform seçimi (SENTEZ S-38): CPA bilinmiyorsa **tek platformla başla**, ikinci platform yalnız bütçe eşiği sağlanırsa önerilir | İki platforma birden açmak | İki platform da uygunsa **ikisi de seçili gelir**; bütçe iki platformun alt sınırına yetmiyorsa uyarı + "tek platformla başla" önerisi, karar kullanıcıda. **K-3** |
| Ç-4 *(K-4 ile kapandı: doğrudan yayın, uyum denetçisi yazılacak)* | Meta **gerçek yayın kapalı**: uyum denetçisi yok, konut kategorili provada Meta ret veriyor (`special_ad_categories ... got "2"`) | Reklam açabilmek | İlk sürümde iki platformda da **duraklatılmış kur** (para harcamaz); kullanıcı Reklam Yöneticisi'ndeki **Başlat** düğmesiyle açar (dün canlıya aldık, geri okumalı). Uyum denetçisi şartı bu yolda kalkar. **K-4** |
| Ç-5 | Google **Arama** yazma yolu (`google-write.ts`) var ama canlıda hiç denenmedi; kapatılmıştı. Canlıda doğrulanan tek Google kurulumu Demand Gen (Akıllı Boost, 2026-10-09) | Google'da amaca uygun kurgu | Arama yolu önce `validateOnly` provası, sonra Profaj'ın kendi hesabında en küçük bütçeyle duraklatılmış kurulum, Google Ads'te gözle doğrulama |
| Ç-6 | `/reklam/yeni` tıklamalı "Acemi" akışı var, yalnız Meta, menüde yok | Tek rehber | Arka uç (taslak, sürüm, eksikler, derleyici, yayın motoru, prova) **korunur**, ekran yeni taslaktan **yeniden yazılır** |
| Ç-7 | Menü adı "AdvCampaign" | Mesajında "AdvertX Campaign" geçiyor | Ses-yazı farkı sanıyorum; ad **AdvCampaign** kalır. Değilse söyle |
| Ç-8 | Çalışmayan seçenek gösterilmez (CLAUDE.md) | Bütün amaçlar | Canlıda kanıtlanmamış amaç **görünmez**, "yakında" kartı da yok. Sırayla açılır (§3) |

---

## 1. Ajan 0 — Panelleri gezme (araştırma, yazmadan)

Meta Reklam Yöneticisi ve Google Ads'in "Yeni kampanya" akışları Chrome'da
(senin oturumunla) baştan sona gezilir; **"Yayınla"ya hiç basılmaz.**

Çıktı: `docs/advcampaign/arastirma/A4-panel-turu.md`

- Her amaç için iki panelin adım adım ekranları: hangi sorular soruluyor,
  hangi alan zorunlu, hangisinin varsayılanı ne, hangisi gizli/otomatik.
- **Eşleme tablosu:** Advetics amacı → Meta (amaç · optimizasyon · hedef) →
  Google (kampanya türü · teklif · ağ). Mevcut araştırma (A1 Google, A3 Meta,
  SENTEZ §2) belgeden yazılmıştı; tur onu panelin GERÇEK akışıyla
  karşılaştırır.
- **Sorulmayacaklar listesi:** iki panelin sorduğu ama bizim karar verip
  söyleyeceğimiz alanlar (teklif stratejisi, yerleşim, ağlar, AI Max,
  Advantage+ seçenekleri…), her biri için seçtiğimiz değer ve gerekçesi.

**Dikkat (K-5):** Meta Reklam Yöneticisi açılan her yeni kampanyayı
**otomatik taslak** olarak kaydediyor, Google Ads da yarım kampanyayı taslak
tutuyor. Tur Profaj'ın kendi hesaplarında yapılır, bitince oluşan taslakları
listeleyip silmek için senden onay isterim.

---

## 2. Deneyim: Google Ads mantığında altı adımlık rehber

Görünüş Advetics'in (kurumsal kılavuz, `globals.css` katmanı), akış Google
Ads'in "Yeni kampanya" sihirbazının sadeleştirilmiş hâli: solda adım rayı,
ortada tek soru grubu, sağda canlı özet. Her adımda önerilen değer **dolu
gelir** ve "Önerilen" rozeti taşır; kullanıcı yalnız değiştirmek isterse
dokunur. Hiçbir ekranda "optimizasyon", "teklif", "yerleşim" kelimesi yok.

```
┌ Adım rayı ─────┬ Soru alanı ───────────────────────────┬ Canlı özet ─────────┐
│ ① Amaç       ✓ │  Reklamdan ne bekliyorsun?             │ Meta  ● Google ●    │
│ ② Nerede     ● │  [Siteme gelsinler] [Form doldursunlar]│ Bütçe 500 ₺/gün     │
│ ③ Kime         │  [Videom izlensin] …                   │  Meta 250 · G 250   │
│ ④ Reklam       │                                        │ Eksik: görsel       │
│ ⑤ Bütçe        │  Her kartta: hangi platformda açılır   │                     │
│ ⑥ Kontrol      │                                        │ [Taslağı kaydet]    │
└────────────────┴────────────────────────────────────────┴─────────────────────┘
```

| Adım | Kullanıcı ne yapar | Sistem ne karar verir (sormaz, söyler) |
|---|---|---|
| **① Amaç** | Tek kart seçer: "Siteme gelsinler", "Form doldursunlar", "Videom izlensin"… Her kartta hangi platformda açılacağı yazar | Meta amacı + optimizasyon hedefi; Google kampanya türü + teklif stratejisi (§3 tablosu) |
| **② Nerede** | Workspace ve hesaplar önden seçili; Meta / Google anahtarları | Uygunluk: hesap atanmış mı, yazma kapısı açık mı, amacın o platformda karşılığı var mı. Kapalı platform **sebebiyle** gri ("Bu workspace'e Google hesabı atanmamış · Ata") |
| **③ Kime** | Konum (Marka Merkezi kitlesinden önden dolu), gerekirse yaş. **Özel kategori sorusu** (konut, iş, kredi, siyaset): hiçbir şık seçili gelmez | Meta'da Advantage+ kitle, Google'da konum PRESENCE + Türkçe dil; konut seçilirse iki platformun kısıtları otomatik |
| **④ Reklam** | Görsel/video bırakır; **tek metin seti** yazar (ya da "Metin öner"e basar). Siteye trafikte Google için anahtar kelimeleri tıklayarak seçer (Keyword Planner'dan, aylık arama sayısıyla) | Metin her platformun kalıbına bölünür: Meta ana metin + başlık; Google başlıklar (≤30) + açıklamalar (≤90). Sınır **yazarken** gösterilir. Görsel bırakıldığı anda iki platformun oran/boyut kuralına göre denetlenir |
| **⑤ Bütçe** | Günlük ya da toplam tutar + süre. Platform payı önerilen gelir, kaydırıcıyla değişir | Platform alt sınırları (Google Demand Gen günlük ≥ 5 USD karşılığı, Meta asgari bütçe) ve "bu bütçe iki platforma yetmiyor" uyarısı |
| **⑥ Kontrol** | İki önizleme yan yana (Meta akış/hikâye, Google arama sonucu/YouTube). "Prova et" → "Duraklatılmış kur" | Her platform için `validate_only` / `validateOnly` provası; platformun otomatik yaptıkları listesi; her platform ayrı satır, biri düşerse diğeri geri alınmaz |

**Kurulumdan sonra (rehberin son ekranı):** iki platformda neyin kurulduğu
(kampanya / set / reklam), platformdaki kimlikleri ve "Google Ads'te aç",
"Reklam Yöneticisi'nde başlat" bağlantıları; eksik kalan ölçüm işleri
(piksel, dönüşüm) yapılacaklar listesi olarak.

**Taslak her adımda kaydedilir** (mevcut `reklam_taslagi` + değişmez
`taslak_surumu`): yarıda bırakılan rehber kaldığı yerden açılır.

---

## 3. Amaçlar × platform ve açılış sırası

| Amaç (ekran dili) | Meta kurgusu | Google kurgusu | Bugünkü kanıt | Önerilen tur |
|---|---|---|---|---|
| **Siteme gelsinler** | Trafik · açılış sayfası görüntüleme | Arama · Maksimum tıklama · duyarlı arama reklamı · öbek eşleme anahtar kelime | Meta derleyici var, prova kısmen; Google kod var, **canlı yok** | **1** |
| **Form doldursunlar** | Potansiyel müşteri · anlık form | Arama + form uzantısı | Meta derleyici var; form şablonu ekranı yok. Google ölçülmedi | **1** (Meta), Google 2 |
| **Videom izlensin** | Bilinirlik · ThruPlay | Demand Gen video (YouTube) | Google **canlıda kuruldu** (Akıllı Boost); Meta derlenmiyor | **1** (Google), Meta 2 |
| WhatsApp'tan yazsınlar | Potansiyel müşteri · sohbet · WhatsApp | Yok | Derleyici ret ile duruyor, ölçülmedi | 2 (yalnız Meta) |
| Beni telefonla arasınlar | Arama | Arama + arama uzantısı | Ölçülmedi | 2 |
| Bölgemde çok kişi görsün | Erişim | Demand Gen görsel | Ölçülmedi | 3 |
| Sitemden satış gelsin | Satış · piksel | Performance Max | Ölçüm kapısı gerekli | 3 |

Bir amacın bir platformu kanıtlanmadıysa o platform o amaçta **görünmez**;
kartta yalnız açılabilen platform yazar.

---

## 4. Mimari (Ajan 1'in yazacağı sözleşmenin iskeleti)

- **Tek taslak, platform alt dalları.** `packages/shared/src/reklam/` altına
  `rehber/` sözleşmesi: amaç, kitle, kreatif, metin seti, bütçe + platform
  payları; her platform için türetilmiş alt taslak. Tip yalnız burada.
- **Meta:** mevcut `derleMeta()` + yayın motoru + prova. Değişen: derleme
  çok platformlu taslağın Meta dalından besleniyor.
- **Google:** yeni `derleGoogle()` (shared, saf) → Arama ve Demand Gen
  gövdeleri. `google-write.ts` ve `google-demandgen.ts` kurucuları
  kullanılır, yeni üretici yazılmaz ("aynı şeyi üreten ikinci fonksiyon
  doğduğu anda ayrışır"). Tek atomik `mutate`, geçici kimlikler,
  `partialFailure: false`, önce `validateOnly`.
- **Yazma kapıları:** `metaYazmaAcikMi` + `googleYazmaAcikMi` (ajans
  şalteri) her iki yayında; para harcayan her yol duraklatılmış kurar.
- **Kaldırılanlar:** sohbet ekranı (`apps/web/src/reklam/sohbet`), sohbet
  API'si (`modules/reklam/sohbet`), `ai-taslak` ucu. Tablolar kalır.
- **Yeni tablo gerekirse** üç durak: `pglite-harness` TRUNCATE, `02_rls.sql`,
  `WORKSPACE_TABLOLARI`.

---

## 5. İş sırası (beş ajan + tasarım denetimi)

| Sıra | İş | Kapı |
|---|---|---|
| 0 | **Panel turu** (Ajan 0, §1) | Eşleme tablosu senin onayından geçer |
| T | **HTML taslağı** (masaüstü + mobil, altı adım + son ekran) | **Sen seçmeden koda geçilmez** |
| 1 | Mimar: `rehber/` sözleşmesi + `MIMARI.md` | Shared derlemesi çıktısıyla temiz |
| 2 ‖ 3 | Arka plan (`derleGoogle`, çok platformlu yayın, sohbetin kaldırılması) ‖ Ön yüz (rehber ekranı, taslağın birebir aynısı) | Typecheck + testler |
| 4 | Test ve güvenlik: RLS, yazma kapıları, sessiz hata taraması, mutasyon | Kapıyı bu ajan açar |
| 5 | Canlıya alma + **canlı tur**: Profaj hesabında önce prova, sonra duraklatılmış kurulum, iki platformda gözle doğrulama | "200 döndü" doğrulama değil |
| 6 | Tasarım denetimi: canlı ekran masaüstü + mobil, sana önce/sonra | Sen görmeden bitmiş sayılmaz |

---

## 6. Kararlar

| # | Soru | Karar (2026-10-10) | Sonucu |
|---|---|---|---|
| K-1 | İlk turda hangi amaçlar? | **Hepsi baştan** (yedi amaç) | Yedisi de yazılır. CLAUDE.md "çalışmayan seçenek gösterilmez" kuralı geçerli: bir amacın bir platformu, o platformda canlı turu geçtiği anda ekranda açılır. Canlı tur sırası: Siteme gelsinler → Form → Video → WhatsApp → Telefon → Erişim → Satış (Satış piksel/dönüşüm kapısı ister) |
| K-2 | Yapay zekâ | **Yalnız düğme arkasında** | "Metin öner", "Anahtar kelime öner"; basılmazsa çalışmaz |
| K-3 | İki platform uygunsa | **İkisi de seçili** | Bütçe yetmiyorsa uyarı + "tek platformla başla" önerisi, karar kullanıcıda |
| K-4 | İlk kurulum | **Doğrudan yayına al** | Meta'da gerçek yayının önündeki **uyum denetçisi** (yasal uyarı, özel kategori kısıtları, yasak içerik) Ajan 2'nin kapsamına girer ve yayından ÖNCE çalışır. Kurulum yine "önce duraklatılmış kur → geri oku → aç" sırasıyla yapılır (yarım kalan ağaç para harcamasın); kullanıcı için tek düğme. Her amacın İLK gerçek yayını Profaj hesabında en küçük bütçeyle |
| K-5 | Panel turunda oluşan taslaklar | Açık | Önerim: Profaj hesabında gez, bitince listeleyip onayınla sil |
| K-6 | Canlı tur hesabı ve bütçesi | Açık | Önerim: Profaj'ın kendi Meta + Google hesabı, amaç başına en küçük bütçe |
