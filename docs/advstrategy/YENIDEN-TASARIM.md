# AdvStrategy — Yeniden tasarım (Ajan 1 · Mimar, denetim + plan)

> **Tarih:** 2026-10-13 · **HEAD:** b4e39f1e · **Görsel taslak:** [`taslak.html`](taslak.html)
> (tarayıcıda aç; üç ekran sekmeyle) · **Önceki mimari:** [`MIMARI.md`](MIMARI.md) (v1,
> 2026-10-08) · **Sözleşme (kod):** `packages/shared/src/strateji/v2/` · **Sözleşme testi:**
> `apps/api/src/modules/strateji/sozlesme-v2.spec.ts`
>
> Birinci tur (denetim + plan + taslak) 2026-10-13'te kullanıcı tarafından ONAYLANDI; üç ürün
> kararı § 00'da. İkinci tur (sözleşme kodu, ölü aktarımın kapatılması, yazı tipi ölçümü) § 9.
> Ajan 2 ve Ajan 3 bu belge + sözleşmeden okur, tip tanımlamaz.
>
> **Kullanıcının isteği (aynen):** *"şimdi AdvStrategy tarafını geliştireceğiz bu hem kurumsal
> kimliğimizi içeren bir rapor olucak hemde arka tarafta adv campaign kısmıyla tam entegre olucak
> şekilde ayarlamanı istiyorum. yani ben bu modüle girip çok güzel bir strateji oluşturduğumda
> (burada şu an aktif olan strateji modülünü hiç beğenmedim ne tasarım ne backend ne de çıktı
> sonuç açısından) tam optimize bir şekilde adv campaign kısmına aktarabilmesi lazım".*

---

## 00. Kullanıcı kararları 2026-10-13 (taslak onaylandı)

| # | Karar | Sözleşmede |
|---|---|---|
| K-1 | Rapor kapağında **YALNIZ Advetics logosu** (bugünkü beyaz etiket kuralıyla aynı); renk ve yazı tipi Profaj kılavuzundan | PDF: `logoOku()` (rapor PDF'iyle aynı dosya); kapakta Profaj logosu YOK |
| K-2 | Müşteri onayı **girişsiz bağlantıyla da** verilebilir; onaylayanın adı ve e-postası kayda alınır; bağlantı tek plana ve tek sürüme bağlı, süreli, iptal edilebilir; sürüm değişince eski bağlantıyla onay verilemez | `v2/paylasim.ts` (§ 9.3), `STRATEJI_ONAY_ROLLERI` += `baglanti` |
| K-3 | Geçmiş verisi olmayan hesapta beklenen sonuç **HİÇ gösterilmez** ("tahmin yok"); ajansın elle girdiği varsayım aralığı YOK | `STRATEJI_KAYNAKLARI`ta `varsayim` yok (test); `KalemTahmini` yalnız `veri` ya da `yok` |
| K-4 | v1'in ölü `aktar`ı (adv_oturum'a yazan) yeni tasarımı beklemeden kapatılsın | commit `ff83c662` (§ 9.1) |

Taslak (`taslak.html`) bu kararlarla güncellendi: "Varsayım" rozetli erişim tahmini "Tahmin yok"
oldu; kapakta yalnız Advetics; onay kutusuna bağlantıyla onay için ad + e-posta alanı eklendi.

## 0. Tek paragrafta

Bugünkü modül bir **strateji değil, bir bütçe tablosu**: ajans dağılımı, kelimeleri ve "kitle ×
görsel" satırlarını ELLE giriyor; analiz, hedef, tahmin, mesaj ve gerekçe yok. Daha kötüsü,
**onaylı planın AdvCampaign'e aktarımı 2026-10-10'dan beri hiçbir yere gitmiyor**: kaldırılmış
sohbetin tablosuna (`adv_oturum`) yazıyor, plan geri dönüşsüz `aktarildi` oluyor ve `/reklam`da
tek bir taslak görünmüyor — hata yok, log yok (§1.1). Yeni tasarımda strateji **kalem** listesi
(kalem = bir AdvCampaign rehberi: amaç × Meta/Google payı × bütçe × tarih × bölge × yaş × kreatif
yönergesi × metin × kelime) etrafında kuruluyor; sayılar yalnız hesabın kendi verisinden ya da
verisi yoksa "tahmin yok" yazılarak, metinler yapay zekâdan (sayı yasağıyla); müşteri aynı belgeyi Profaj
kimliğiyle panelde ve PDF'te görüp **onaylıyor ya da revizyon istiyor**; onaylı kalemler tek
tıkla **rehber taslağı** olarak açılıyor ve kalemin durumu (taslakta / yayında / gerçekleşen)
rapora geri akıyor.

---

## 1. DENETİM — mevcut modül neden kötü

Kapsam: `packages/shared/src/strateji/*` (9 dosya, ~740 satır), `apps/api/src/modules/strateji/*`
(~2.200 satır kod + 2.300 satır test), `apps/web/src/components/strateji/*` + sayfa (~3.900
satır), üç migration (`20261008120000_advstrategy`, `20261008140000_advstrategy_aktarim`,
`20261010130000_strateji_video_izlenme`).

### 1.1 Çıktı: aktarım ölü bir tabloya yazıyor (KRİTİK, sessiz)

| Kanıt | Ne diyor |
|---|---|
| `apps/api/src/modules/strateji/strateji.service.ts:266` | `INSERT INTO adv_oturum (…, hazir_istem, hazir_medyalar, strateji_matris_id)` |
| `apps/api/src/modules/reklam/reklam.module.ts:21-24` | *"AdvCampaign SOHBETİ 2026-10-10'da API'den kaldırıldı … Tabloları (`adv_oturum` …) SİLİNMEDİ: veri."* |
| `apps/api/src/modules/iyilestir/asistan/araclar.ts:207-211` | Aynı sebeple İyileştir asistanı `adv_oturum` açmayı bıraktı: *"açılan bir `adv_oturum` satırını artık hiçbir ekran okumuyor"* |
| `apps/web/src/app/(dashboard)/reklam/page.tsx:14-18` | `/reklam` artık rehber; `hazir_istem` okuyan ekran yok |
| `packages/shared/src/strateji/plan.ts:45` | `PLAN_SON_DURUMLARI = ['aktarildi', 'iptal']` — aktarılan plan geri dönmez |
| `docs/DEVAM.md:491` | *"Açık: AdvStrategy → AdvCampaign aktarımı hâlâ sohbet tablosuna yazıyor (okuyan ekran yok, ürün kararı)"* |

Sonuç: kullanıcı "Aktar"a basıyor, ekran "Plan AdvCampaign'e aktarıldı" diyor
(`plan-ekrani.tsx:39`), plan kalıcı olarak `aktarildi`, AdvCampaign'de hiçbir şey yok. Bu
projenin "200 döndü doğrulama değil" dersinin birebir örneği. (Bu tasarımı beklemeden de
`aktar` eyleminin panelde kapatılması önerilir; bkz. §8 "ilk iş".)

### 1.2 Backend: aktarımın kapısı ESKİ derleyiciye bağlı

- `packages/shared/src/strateji/aktarim.ts:2,60` niyeti `DERLENEN_NIYETLER`le süzüyor;
  `packages/shared/src/reklam/meta/derle.ts:429` → `['FORM', 'SITE']`. Bu sohbetin Meta
  derleyicisi; rehberin yedi amacı (`reklam/rehber/amaclar.ts:16`) ve açılış tablosu
  (`REHBER_ACILIS`, aynı dosya :130) ayrı bir sabit. Yani "aktarım dar" sorusunun cevabı
  `DERLENEN_NIYETLER`i genişletmek DEĞİL, bağımlılığı tamamen kaldırıp rehberin kendi kapısını
  (`platformGorunurMu`, `siteYokKapisi`) okumak.
- `aktarim.ts:36` `AKTARILABILIR_PLATFORMLAR = ['meta']` — rehberde `SITE` Google 2026-10-12'den
  beri `acik`. İkinci bir açılış listesi doğmuş ve ayrışmış.
- **Matris modeli rehberle eşleşmiyor.** `strateji_matrisi` satırı tek platform + huni katmanı +
  `audience_templates` şablonu taşıyor (`matris.ts:26-46`). Rehber ise **bir amaç, iki platform,
  tek bütçe + Meta payı** (`rehber/alanlar.ts:210-212`) ve **kitle şablonu ya da yeniden pazarlama
  kitlesi alanı YOK** (yalnız `konumlar`, `enDusukYas`, `yasAraligi`). Yani `yeniden_pazarlama`
  katmanlı ya da ilgi alanlı bir satır hiçbir zaman birebir kurulamazdı.

### 1.3 Backend: bütçe önerisi karşılaştırılamayan sayıları topluyor

`apps/api/src/modules/strateji/strateji.service.ts:822-832` iki platformun `conversions`
toplamını alıyor; `dagilim-oneri.ts:79-124` bütçeyi **Meta dönüşümü + Google dönüşümü** payına
göre bölüyor. İki sorun:
1. Meta ve Google dönüşümleri farklı tanım ve atıf penceresiyle sayılıyor (Meta 7 gün tıklama +
   1 gün görüntüleme, Google kendi penceresi; Google'da `cta_click` gibi tıklamalar da dönüşüm,
   `olcum/index.ts:33-36`). Toplamak elmayla armudu toplamak; "Meta %68" cümlesi
   (`dagilim-oneri.ts:116-120`) gerçek bir verimlilik iddiası değil.
2. Amaçtan bağımsız: form, satın alma ve "tıklama dönüşümü" aynı kovada.
Ayrıca öneri tutarın TAMAMINI "Yeni kitle"ye yazıyor (`dagilim-oneri.ts:21`, `ONERI_KATMANI`),
yani huni kırılımı hiçbir zaman öneriden gelmiyor.

### 1.4 Ürün: içinde strateji yok

- Yapay zekâ hiç kullanılmıyor (`strateji.service.ts:184` model adı yalnız `adv_oturum`
  satırına yazılmak için okunuyor). İşletme/pazar analizi, hedef, KPI, kreatif yön, mesaj
  önerisi, risk, takvim yok.
- Marka Merkezi (`client_profiles`: sektör, ürün kategorileri, vaatler, hedef kitle, üslup,
  `schema.prisma:542-600`), hazır workspace site taraması (`hazirlama`), ölçüm durumu
  (`olcum`), kurulum beyanları (`kurulum/site-yok.ts`) — hiçbiri girdi değil. "Sitemiz yok"
  diyen workspace'e site amaçlı satır yazılabiliyor.
- Sezon: sözleşmede `GET …/sezon` ucu var (`uclar.ts:27`), controller'da yok
  (`strateji.controller.ts:31` "bu turda yok"), `ozel_gunler` tablosu boş. Ölü sözleşme.
- Ufuk tek ay (`plan.ts:115`, `(client_id, donem)` tekil). Strateji 1–3 aylık düşünülür.

### 1.5 Tasarım: ajansın iç tabloları müşteriye gösteriliyor

- Dört sekme (`apps/web/src/components/strateji/hesap.ts:54-59`): "Bütçe dağılımı · Google arama
  · Kitle ve kreatif · Sunum". Hepsi düzenleme ekranı; müşteri (`client_viewer`, `roles.ts:283`)
  AYNI ekranları salt okunur görüyor. Okunacak bir belge yok: "Sunum" sekmesi yalnız bir
  "PDF indir" düğmesi (`sunum-bolumu.tsx`).
- Dil teknik: "huni katmanı", "Etkileşim kuranlar / Siteyi ziyaret edenler" (`plan.ts:83-87`),
  "matris". Hedef kullanıcı reklam bilmiyor (CLAUDE.md §5).
- Reklam bilmeyen kullanıcının yapacağı iş sırası tersten: önce bütçeyi bölüyor, sonra
  kampanyaları buluyor. Google Ads planlayıcısının mantığı tersi: hedef + bütçe ver, plan önerilsin,
  sonra kalem kalem düzelt.

### 1.6 Çıktı: PDF kurumsal değil, içeriksiz

`apps/api/src/modules/strateji/medya-plani-pdf.ts`:
- Renkler `SLATE` (mavi-gri; `:133-161`, `reports/pdf-cizim.ts:20-26`) — kılavuzda yok.
- Yazı tipi yalnız DejaVu; kılavuz Montserrat başlık + Open Sans gövde istiyor.
- Sayfalar: kapak + dağılım tablosu + matris tablosu + kelime listesi (`:105-109`). Özet,
  gerekçe, grafik, takvim, KPI, onay alanı yok; görseller gömülmüyor (`:22-25`).

### 1.7 Onay akışı yarım

`plan.ts:55-61`: müşteri yalnız **onaylayabiliyor**. Revizyon isteme ve yorum yok; itirazı olan
müşteri panel dışında (telefon, mail) konuşuyor ve plan `onayda` bekliyor. Ajans `geri_cek` ile
geri alıyor ama NEDEN'i kayıtta yok.

### 1.8 Korunacaklar / atılacaklar

| Korunur (iyi ve test edilmiş) | Neden |
|---|---|
| `strateji_planlari` + iyimser kilit (`surum`) + `onaylanan_surum` + onaylayanın rolü (`musteri`/`ajans`) | Onaylanan belge = aktarılan belge kuralı doğru |
| İzinler `strategy.read/write/approve`, müşteri rolünde `read + approve` | §5 "müşteri planı görür ve ONAYLAR" |
| Üç durak (TRUNCATE, `02_rls.sql`, `WORKSPACE_TABLOLARI`/`CASCADE_ILE_TASINANLAR`) ve RLS testleri | Desen aynen yeni tablolara |
| Kelime araması: `strateji_kelimeleri`, kuyruk (`kelime-kuyrugu.ts`, 1 QPS, arama kimliği), varyant tekilleştirme (`kelime-tekil.ts`), deterministik gruplama | Keyword Planner canlıda ölçüldü; gruplama Google reklam grubuna birebir |
| PDF altyapısı: `yaziTipiOku`, `logoOku`, `tablo()`, `metinler()` test deseni | Rapor dersleri |
| `dagilimToplamDenetimi`, `tutarGirdisiSchema`, micros-dizge | Para kuralları |

| Atılır / dondurulur | Yerine |
|---|---|
| `strateji_matrisi`, `strateji_dagilimlari` (yazma) | `strateji_kalemleri` (dağılım kalemlerden TÜRER, ayrı tablo yok) |
| `aktarim.ts` (`aktarimIstemi`, `DERLENEN_NIYETLER` bağı), `adv_oturum` yazımı | Kalem → `reklam_rehberi` taslağı |
| Huni katmanı (`soguk/sicak/yeniden_pazarlama`) | Aşama (Tanıtım / İlgi / Dönüşüm) AMAÇTAN türer |
| `GET …/sezon` sözleşmesi | Takvim kalem tarihlerinden; özel gün tablosu dolunca eklenir |
| `aktarildi` plan son durumu | Aktarım KALEM düzeyinde, tekrarlanabilir |
| Dönüşüm toplamına göre platform bölüşümü | Amaç × platform başına KENDİ sonuç başı maliyeti, toplanmaz |

Eski planlar (v1) silinmez: `bicim = 1` olarak salt okunur listede ve PDF'iyle kalır. Kaç tane
olduğu üretimde ölçülecek (Ö-1); sıfır ya da yalnız deneme planları ise liste satırı da kaldırılır.

---

## 2. YENİ ÜRÜN TANIMI — iyi bir dijital reklam stratejisi ne içerir

Strateji bir **belge** ve bir **kalem listesi**. Belge müşteriye anlatır, kalemler AdvCampaign'e
gider; ikisi aynı veriden üretilir (tek kaynak — CLAUDE.md "tablo tek listeden türetilir").

### 2.1 Kaynak etiketi: her sayının ve cümlenin yanında

| Kaynak | Ekranda | Ne olabilir | Ne olamaz |
|---|---|---|---|
| `veri` | "Hesabınızın verisi · son 90 gün" | `insights_daily`'den harcama, sonuç, sonuç başı maliyet; Keyword Planner hacmi ("yaklaşık") | — |
| `marka` | "Marka Merkezi" / "Site taraması" | Sektör, ürün, vaat, hedef kitle metni, site adresi, telefon | Sayı uydurma |
| `kural` | "Advetics kuralı" + gerekçe | Platform asgarisi, Meta öğrenme tabanı (haftada ~50 sonuç, Meta'nın kendi rehberi), varsayılan %50 pay (`VARSAYILAN_META_PAYI`) | Getiri iddiası |
| `ai` | "Yapay zekâ önerisi" | Analiz metni, kitle tarifi, kreatif yönergesi, mesaj önerisi | **Rakam/oran** (`sayiTasiyor`, `packages/shared/src/sayi-yasagi.ts`); reddedilen metin bir kez yeniden istenir, yine düşerse alan boş kalır ve ekranda "öneri üretilemedi" yazar |
| `ajans` | "Ajans yazdı" (kişi + zaman) | Elle her şey | — |

`ai` kaynaklı bir metin, ajans "Kullan" diyene kadar **öneri**; müşteriye giden belgeye girmez
(rehberdeki `ai_onerisi` kuralının aynısı).

### 2.2 Belgenin bölümleri (panel ve PDF AYNI sırada, aynı listeden)

| # | Bölüm | İçerik | Kaynak |
|---|---|---|---|
| 0 | Kapak | Logo (soru 1), "Dijital Reklam Stratejisi", workspace, dönem, sürüm, durum ("Taslak" filigranı / "Müşteri onayladı · tarih") | — |
| 1 | Özet | Üç cümle (ne yapacağız, neden, ne bekliyoruz) + dört kutu: toplam bütçe, dönem, kalem sayısı, beklenen sonuç ARALIĞI (yalnız veri varsa) | ai + veri |
| 2 | İşletme ve pazar | Ne satıyor, kime, vaatleri, sitenin durumu; bilinmeyen alan "Marka Merkezi'nde boş" diye yazılır, uydurulmaz | marka + ai |
| 3 | Bugüne kadar | Platform × amaç: harcama, sonuç, sonuç başı maliyet. Platformlar TOPLANMAZ; "toplam sonuç" satırı yok | veri |
| 4 | Hedefler ve ölçütler | Kalem başına tek ölçüt (form, mesaj, arama, satın alma, ThruPlay, erişim, site ziyareti) ve aralık; veri yoksa "tahmin yok" | veri |
| 5 | Yol haritası | Aşamalar: **Tanıtım** (ERISIM, VIDEO) → **İlgi** (SITE) → **Dönüşüm** (FORM, WHATSAPP, TELEFON, SATIS). Amaçtan türer, kullanıcı seçmez | kural |
| 6 | Bütçe dağılımı | Aşama × platform çubuk + platform halkası; asgari altı kalan platform kırmızı notla | kural + veri |
| 7 | Kampanyalar (kalemler) | Kalem kartı: amaç (rehberdeki kart adı), platformlar ve pay, bütçe, tarih, bölge, yaş, kreatif yönergesi, örnek metin, kelime grubu (Google Arama) | hepsi |
| 8 | Kitle ve bölge | Konumlar (harita yok, liste), yaş; "kime anlatıyoruz" tarifi (kreatife yön, hedefleme DEĞİL — rehber ilgi alanı taşımıyor) | marka + ai |
| 9 | Kreatif ve mesaj | Genel yön + kalem başına görsel/video ihtiyacı (boyutlar banner setinden) + 3 başlık önerisi | ai (+ kreatif zekâ brief'i varsa) |
| 10 | Takvim | Hafta hafta kalem çubukları; başlangıçlar; özel gün yalnız tablo doluysa | ajans |
| 11 | Ölçüm | Her kalemin ölçütü sayılıyor mu (`olcum` hücresi): "Hazır / Kurulmalı / Bilinmiyor" + Kurulum sihirbazı adımına bağlantı | veri |
| 12 | Riskler | Deterministik liste (§2.5) + tek cümle açıklama | kural |
| 13 | Onay | Onayla · Revizyon iste · yorumlar | — |
| 14 | Plan ve gerçekleşen | (Onaydan sonra) kalem başına: durum, harcanan/plan, sonuç/hedef aralığı | veri |

### 2.3 Strateji motoru — sayılar deterministik, metinler AI

"Strateji öner" düğmesi iki katman çalıştırır:

**A. Motor (saf fonksiyon, `packages/shared/src/strateji/motor.ts`)** — girdi: toplam bütçe,
dönem, Marka Merkezi `anaAmac`, kurulum beyanları (`siteYokMu`), ölçüm satırları
(`olcumSatirlari`), atanmış hesaplar, rehber açılışı (`platformGorunurMu` — çağıranın ajans
yöneticisi olup olmadığıyla), platform asgarileri (rehber hazırlığından), geçmiş (amaç × platform
sonuç başı maliyet, aylık). Kurallar:
1. **Dönüşüm amacı önce.** `anaAmac` (`form`→FORM, `whatsapp`→WHATSAPP, `website`→SITE) yoksa
   ölçümü HAZIR olan ilk dönüşüm amacı; site yoksa SITE/SATIS önerilmez; ölçüm yoksa dönüşüm
   kalemi önerilmez, risk satırı yazılır (kullanıcı elle ekleyebilir, rozetiyle).
2. **Öğrenme tabanı.** Geçmiş sonuç başı maliyet varsa: dönüşüm kalemine haftada ~50 sonuç
   alacak tutar (yoksa platform asgarisi × gün). Bütçe yetmiyorsa platform sayısı azalır
   (önce Google Talep Yaratma, sonra ikinci kalem) ve sebep yazılır — iki yarım kampanya yerine
   bir tam kampanya.
3. **Tanıtım kalemi** yalnız dönüşüm tabanı karşılandıktan sonra kalanla; video varlığı varsa
   VIDEO, yoksa ERISIM (adres konumu varsa "işletme çevresi" önerisi).
4. **Meta/Google payı** aynı amacın iki platformda KENDİ sonuç başı maliyeti varsa ona ters
   orantılı, 30–70 aralığına kırpılmış (`kural`); yoksa 50 (`VARSAYILAN_META_PAYI`). Rehber
   10–90 kabul ediyor; kırpma gerekçeli.
5. **Asgari kontrolü** `gunlukEsdeger` + hazırlığın asgarisiyle (rehberle AYNI fonksiyon); altında
   kalan platform kapatılır, cümlesi yazılır.
6. **Tahmin** = kalem bütçesi ÷ [en iyi ay, en kötü ay] sonuç başı maliyet (aynı amaç, aynı
   platform, son 3 ay). Tek ay varsa tek nokta ve "tek ay verisi"; hiç yoksa **tahmin yok**
   (kullanıcı kararı 3). ± yüzde uydurulmaz.

**B. Yapay zekâ (yalnız metin)** — girdisi kodlar ve metinler (sayı GİTMEZ, kreatif zekâ brief'i
deseni `kreatif-zeka/brief.ts:7-18`): marka alanları, site taraması özeti, kalemlerin amaç kodları,
geçmişte iyi giden amaç (kod). Çıktısı JSON: özet (3 cümle), işletme analizi, kitle tarifi, genel
kreatif yön, kalem başına kreatif yönergesi. Her alan `sayiTasiyor` ile süzülür. **Reklam metni**
(başlık/ana metin) bu çağrıdan DEĞİL, rehberin var olan metin önerisi motorundan
(`POST /reklam/rehberler/:id/metin-oner` ile aynı servis fonksiyonu) gelir — reklam metninde
"2+1" gibi meşru sayılar olabilir ve iki ayrı metin motoru ayrışır.

### 2.4 Varsayım tablosu — KALDIRILDI (kullanıcı kararı 3, 2026-10-13)

Geçmiş verisi olmayan hesapta beklenen sonuç HİÇ gösterilmez; ajansın elle girdiği bir
varsayım aralığı da yok. `varsayim` kaynağı ve `strateji_varsayimlari` tablosu sözleşmeden
çıkarıldı (`STRATEJI_KAYNAKLARI`, testte kilitli).

### 2.5 Riskler — deterministik

| Kod | Koşul | Cümle (örnek) |
|---|---|---|
| R-OLCUM | Kalemin ölçütü `olcum` hücresinde hazır değil | "Form gönderimi sayılmıyor; reklam kişiye değil tıklamaya optimize olur." |
| R-ASGARI | Platform payı günlük asgari altında | "Google payı günlük asgarinin altında; Google bu kalemde kapatıldı." |
| R-OGRENME | Tahmini haftalık sonuç < 50 | "Haftada az sonuç bekleniyor; Meta öğrenme dönemini geç bitirebilir." |
| R-SITE | Site yok beyanı ve site amacı | Kalem önerilmez; elle eklenirse engel |
| R-DENEME | Amaç × platform `deneme` | "Bu kurgu ajansın deneme listesinde; ilk kurulum duraklatılmış yapılır." |
| R-KATEGORI | Özel reklam kategorisi beyanı | "Konut kategorisinde yaş ve bölge daraltılamaz." |
| R-HESAP | Platformun hesabı atanmamış | "Google Ads hesabı atanmadı; Kurulum › Hesaplar." |
| R-VERI | Hiçbir kalemde veriden tahmin çıkmadı | "Tahmin verilmedi: hesabın geçmiş verisi yok." |

---

## 3. KURUMSAL RAPOR

- **Görünüş:** kılavuz (`docs/marka/profaj-kurumsal-kilavuz.jpg`): yalnız `#ffffff #000000
  #302e2d #ff2400` ve `#302e2d`'nin saydam tonları; Montserrat (ana başlık, büyük sayı), Open Sans
  (üst başlık, gövde). Kırmızı yalnız vurgu: kapaktaki kısa çizgi, bölüm numarası, birincil eylem,
  Google serisi. Meta serisi gri `#302e2d`. Yeşil yalnız durum noktası ("Yayında", "Hazır").
- **Panel referans, PDF ikizi** (CLAUDE.md "AYNI RAPORUN İKİ GÖSTERİMİ VARSA REFERANS BİRİ
  OLMALI — ve o panel"). Bölüm listesi tek sabitte (`STRATEJI_BOLUMLERI`, shared); iki tüketici
  onu okur; `rapor-pdf.service.ts`'teki `PLATFORM_SIRASI` dersi: döngünün gezmediği bölüm hiç
  çizilmez → test bölüm listesini PDF metinleriyle karşılaştırır.
- **PDF:** pdf-lib + `pdf-cizim.ts#tablo()`; yeni `MARKA` renk sabiti (`SLATE` yerine, yalnız
  dört renk). Yazı tipi: Montserrat Bold + Open Sans Regular/SemiBold TTF `apps/api/assets/fonts`
  altına (OFL; lisans dosyasıyla). **`₺` ve `ğ ş ı İ` kapsamı ölçülecek** (`pdf-yazi-tipi.spec.ts`
  deseni); bir glif yoksa o dize için DejaVu'ya AÇIK yedek (glif kontrolü dize başına), sessiz
  düşme yok. Grafikler vektör (halka için `drawSvgPath` + merkez göreli yol, `halka-konumu.spec.ts`
  dersi). Görsel varlıklar küçük resim olarak gömülür (JPEG/PNG; WebP sihirli bayttan reddedilip
  "görsel gömülemedi" notu).
- **Onay akışı:** müşteri panelde belgeyi okur; altta **Onayla** · **Revizyon iste** (yorum
  zorunlu) · kalem başına yorum. Ajans onayı "müşteri adına" ayrı cümleyle (v1 kuralı korunur).
- **Paylaşım:** (1) panel — müşteri hesabı Planla › AdvStrategy'de yalnız belge görünümünü
  görür; (2) PDF indir; (3) **Müşteriye gönder** — rapor gönderim altyapısı
  (`reports/rapor-gonder.service.ts`: `mailGonder` `{kabul, ret}`, alıcı listesi, temizlenmiş imza,
  toplam ek bütçesi) yeniden kullanılır; mail gövdesi girişsiz onay bağlantısı + PDF eki.
- **Girişsiz onay bağlantısı** (kullanıcı kararı 2): kurallar §9.3 ve
  `packages/shared/src/strateji/v2/paylasim.ts`.

---

## 4. ADVCAMPAIGN TAM ENTEGRASYON

### 4.1 Birim: 1 kalem = 1 rehber

Rehber bir amaç + iki platform + tek bütçe + Meta payı taşıyor (`rehber/alanlar.ts`). Kalem
aynı biçimde kurulur; aktarımda dönüşüm yok, eşleme birebir. "Amaç × platform" satırı yerine
"amaç + platform payı" seçilmesinin sebebi bu: iki satıra bölmek iki rehber, iki bütçe ve iki
kez görsel/metin girişi demek.

### 4.2 Alan eşleme tablosu (strateji kalemi → `RehberAlanlari`)

`strateji` YENİ bir `ALAN_KAYNAGI` (`packages/shared/src/reklam/taslak.ts:26`; JSONB, DB CHECK
yok — ölçüldü: migration'larda `ai_onerisi` geçmiyor). `ISTEMCI_YAZAMAZ`a eklenir: yalnız
aktarım servisi basar. Kullanıcı rehberde dokununca `kullanici` olur.

| Strateji alanı | Rehber alanı | Kaynak | `REHBER_IZINLI_KAYNAKLAR` değişikliği | Not |
|---|---|---|---|---|
| `amac` | `amac` | `strateji` | `['kullanici','strateji']` | Plan onaylı = amaç kararı verilmiş |
| `metaAcik/googleAcik` | `platformlar` | `strateji` | `+ 'strateji'` | Aktarım anında `platformGorunurMu(amac, p, aktaranAjansYoneticisi)` ile süzülür; düşen platform aktarım sonucunda yazılır |
| `metaPayiYuzde` | `metaPayiYuzde` | `strateji` | `+ 'strateji'` | Yalnız iki platform açıkken; 10–90 |
| `butceMicros` | `butce {tip:'toplam', micros}` | `strateji` | `+ 'strateji'` | Kalemin TOPLAM tutarı, kalem tarihleriyle; günlüğe rehber çevirir |
| `baslangic/bitis` | `takvim` | `strateji` | `+ 'strateji'` | Başlangıç geçmişteyse YARIN yazılır ve sonuçta söylenir (N-09: Meta geçmiş başlangıcı kurulum anına çekiyor) |
| `konumlar` | `konumlar` | `strateji` | `+ 'strateji'` | Aynı şema (`rehberKonumuSchema`); Google karşılığı aktarımda sunucunun `konumlariEsle` yoluyla, eşlenemeyen Google'ı durdurur (rehberin kuralı) |
| `yasMin/yasMax` | `enDusukYas`, `yasAraligi` | `strateji` | `yasAraligi` listede yok (serbest); `enDusukYas += 'strateji'` | Özel kategoride rehber zaten kısıtlıyor |
| `metin` (ajansın "Kullan" dediği) | `metin` | `strateji` | `+ 'strateji'` | "Kullan" denmemiş öneri `ai_onerisi` olarak gider ve rehberde onay bekler |
| seçili kelimeler (kalemin grubu) | `anahtarKelimeler` | `strateji` | `['kullanici','strateji']` | Yalnız Google Arama kurgulu amaçlar (SITE, FORM, TELEFON); `aylikArama` taşınır, en çok 50 |
| `varlikIdleri` | `medya[].varlikId` | — | (medyada kaynak kuralı yok) | Aitlik `aitlikDenetle` ile yeniden; silinmiş varlık kalemi `kaynak_silinmis` yapar |
| `kreatifYonergesi`, `kitleTarifi` | — (rehber alanı DEĞİL) | — | — | Rehber ekranında "Stratejiden" kutusu kalemi okuyarak gösterir |
| — | `metaHesabiId`, `googleHesabiId`, `sayfaId`, `instagramId`, `youtubeKanaliId`, `telefon`, `whatsappNumarasi`, `hedefAdres`, `pikselId`, `formSablonuId` | rehberin var olan önden doldurması (`workspace_profili`, `marka_merkezi`) | değişmez | Strateji bunları taşımaz; aktarım ekranı eksik olacakları önceden gösterir |
| — | `ekKategoriler`, `satissizPikselOnayi`, `googlePromosyon`, `googleFiyatListesi` | — | **değişmez** | Hukuk ve para sözü: yalnız kullanıcı, rehberde |

### 4.3 Kapı ve sonuç

Kalem başına `aktarimEngeli2(kalem, baglam)` (SAF, shared; panel önizlemesi ve servis aynısını
koşar):

| Neden | Koşul |
|---|---|
| `onaysiz` | Plan `onaylandi` değil ya da `onaylanan_surum ≠ surum` |
| `amac_kapali` | `amacGorunurMu(amac, ajansYoneticisi)` false |
| `site_yok` | `siteYokKapisi` kapalı ve amaç site istiyor |
| `butce_sifir` | Açık platformların payı sıfır |
| `kaynak_silinmis` | Varlık silinmiş |
| `zaten_aktarildi` | Kalemin `rehber_id`'si dolu (atlanmaz, "Rehberde aç" döner) |

Bir platformun düşmesi engel değil: kalem diğer platformla aktarılır, sonuç "Google bu
hesapta kapalı, yalnız Meta açıldı" der. **Hiçbir kalem aktarılamazsa** 400 ve nedenler (v1
kuralı korunur: boş aktarım "aktarıldı" sayılmaz).

Yazım: kalem başına kısa transaction — `reklam_rehberi` INSERT (rehber servisinin `olustur`
fonksiyonu, `org_id` hedef workspace'ten) + `strateji_kalemleri.rehber_id` UPDATE, `WHERE
rehber_id IS NULL` + `RETURNING` (yarışta ikinci rehber açılmaz; açılmışsa sonradan oluşturulan
rehber arşivlenir ve sayı söylenir). Platform çağrısı YOK (konum eşleme ayrı, transaction dışı).

### 4.4 Geri bağ (rapora geri besleme)

- Kalem durumu TÜRETİLİR (saklanmaz): `aktarilmadi` → `taslakta (N eksik)` (rehber
  `eksikler`) → `yayinda` / `duraklatilmis` / `durdu` (rehberin platform `yayin` durumları,
  `RehberOzeti.yayinlar`) → `arsivlendi`.
- Gerçekleşen: rehberin yayın nesneleri (`yayin_nesnesi` → kampanya dış kimliği → `campaigns` →
  `insights_daily`, kampanya seviyesi) kalem tarih aralığında: harcanan / plan, sonuç / tahmin
  aralığı, platform başına ayrı. Rapor bölüm 14 ve aktarım ekranı okur.
- Rehber ekranı: `rehber_id` ile kalemi bulan tek okuma → "Stratejiden: Kasım planı · Kalem 2"
  kutusu, kreatif yönergesi ve kitle tarifi.
- Rehberde değişen bütçe/tarih stratejiyi DEĞİŞTİRMEZ; rapor "plan" ile "kurulan"ı ayrı sütunda
  gösterir (sapma görünür, sessizce ezilmez).

### 4.5 Onaysız aktarım — karar önerisi

**Onay şart (müşteri ya da ajans "müşteri adına", rol kayıtlı).** Gerekçe: aktarım para harcamaz
(rehber taslağı açar; yayın rehberin onay penceresinde) ama stratejinin vaadi "onaylanan plan
kurulur"; onaysız kurulan kalem müşterinin görmediği bir kampanyayı taslağa koyar. Müşterisi
panele girmeyen workspace için ajans onayı zaten var (v1). Ajans onaysız denemek isterse
doğrudan AdvCampaign'de rehber açar — ikinci bir yol gerekmiyor.

### 4.6 Kurulum sihirbazı eksikleri → strateji girdisi

| Sihirbaz/ölçüm durumu | Strateji davranışı |
|---|---|
| "Sitemiz yok" beyanı | SITE, SATIS önerilmez; elle eklenemez (`site_yok` engeli, sebep `SITE_YOK_SEBEBI`) |
| Ölçüm türü hazır değil (`olcum`) | O türü kullanan amaç (`OLCUM_TURU_AMACLARI`) önerilmez; R-OLCUM + "Kurulum › Ölçüm" bağlantısı |
| Platform "kullanmıyorum" beyanı | O platform kalemlerde kapalı, belgede "kullanılmıyor" |
| Hesap atanmamış | Platform kapalı, R-HESAP |
| Konum (adres) girilmemiş | ERISIM'in "işletme çevresi" seçeneği yok, il/ilçe ile önerilir |
| Özel kategori beyanı | R-KATEGORI; yaş/bölge alanları kilitli gösterilir |

Okuma `?tetikle=hayir` yolundan (`hazirlamaSayacYolu`): strateji ekranı AI hazırlık işi
BAŞLATMAZ.

---

## 5. ÇELİŞKİ TABLOSU (istek ↔ depo kuralları)

| # | İstek | Depo kuralı | Önerilen karar |
|---|---|---|---|
| Ç-1 | "kurumsal kimliğimizi içeren rapor" | CLAUDE.md: müşteriye giden belgede **Advetics** logosu (beyaz etiket); kılavuz Profaj'ın | **KARAR (kullanıcı):** yalnız Advetics logosu; renk ve yazı tipi Profaj kılavuzundan |
| Ç-2 | Kılavuz yazı tipleri PDF'te | PDF yalnız gömülü DejaVu (Türkçe + ₺ kanıtlı) | Montserrat/Open Sans gömülür; kapsam testle ölçülür; eksik glifte AÇIK DejaVu yedeği |
| Ç-3 | "tam optimize aktar" | Reklam kurmanın tek yolu AdvCampaign; yayın onay penceresi + prova | Aktarım rehber TASLAĞI açar; yayın rehberde. "Tek tık" = taslaklar, para değil |
| Ç-4 | "7 amacın hepsi" | `REHBER_ACILIS`: çoğu `deneme`, Google FORM/WHATSAPP yok | Kalem yedi amacı da taşır; aktarım açılış tablosunu okur; `deneme` yalnız ajans yöneticisine, R-DENEME rozetiyle |
| Ç-5 | `DERLENEN_NIYETLER` genişletilsin mi | Eski sohbet derleyicisinin listesi | **Genişletilmez; bağımlılık kaldırılır** (§1.2) |
| Ç-6 | Huni + yeniden pazarlama | Rehberde yeniden pazarlama kitlesi ve ilgi alanı YOK | Aşama amaçtan türer; yeniden pazarlama kalemi yazılamaz (aktarılamayan seçenek gösterilmez); belgede "sonraki adım" metni olarak |
| Ç-7 | "gerçekçi KPI" | Uydurma rakam yasağı, `sayiTasiyor` | **KARAR (kullanıcı):** yalnız hesabın kendi aralığı; yoksa "tahmin yok" |
| Ç-8 | "sektör varsayımı" | Depoda sektör verisi yok; AI sayı üretemez | **KARAR:** varsayım yok; sektör sayısı hiçbir kaynaktan gösterilmez |
| Ç-9 | Platformlar arası "en verimli" | Meta ve Google dönüşümü toplanamaz (atıf farkı) | Mevcut bölüşüm atılır; pay aynı amacın platform başına maliyetinden |
| Ç-10 | Müşteri onayı (link) | v1 Ç-5: dış yüzey yok; ama rapor paylaşım bağlantısı (`reports/share.service.ts`) var — emsal | **KARAR (kullanıcı):** girişsiz onay bağlantısı VAR (§9.3); panel + PDF + mail de |
| Ç-11 | Plan "aktarıldı → yayında" | v1 `aktarildi` son durum, kısmi aktarımı kilitliyor | Plan durumu 6 değer, aktarım/yayın KALEM düzeyinde türetilir |
| Ç-12 | Aylık plan | `(client_id, donem)` tekil | Dönem 1–3 ay (başlangıç ayı + süre); açık plan workspace başına tek; onaylı planlar çakışamaz (servis kontrolü) |

### Kullanıcıya sorulan üç karar — CEVAPLANDI (2026-10-13), bkz. § 00

1. Logo: **yalnız Advetics** (bugünkü beyaz etiket kuralı); renk ve yazı tipi Profaj kılavuzundan.
2. Girişsiz onay bağlantısı: **evet**; ad + e-posta kayda alınır, tek plan + tek sürüm, süreli,
   iptal edilebilir, tek kullanımlık karar (§9.3).
3. Geçmiş verisi olmayan hesapta beklenen sonuç: **hiç gösterilmez** ("tahmin yok"); varsayım
   aralığı yok.

---

## 6. MİMARİ

### 6.1 Veri modeli (yeni migration'lar; v1 migration'larına dokunulmaz)

Migration'lar ayrı dosya (CHECK değişikliği + yeni tablolar + kolon ekleri). Üretim sırası
testi zorunlu (CLAUDE.md "pglite-harness var olan kısıtla çakışan migration'ı yakalayamaz";
`roller-uce-indi.spec.ts` deseni): v1 verisi duran bir veritabanında CHECK ve kısmi indeks
değişikliği.

**M1 `20261018100000_advstrategy_v2`**

`strateji_planlari` (ALTER):
| Kolon | Tip | Not |
|---|---|---|
| `bicim` | SMALLINT NOT NULL DEFAULT 1, CHECK (1,2) | 1 = eski medya planı (salt okunur), 2 = strateji |
| `baslangic`, `bitis` | DATE NULL | v2'de dolu (CHECK `bicim = 1 OR (baslangic IS NOT NULL AND bitis >= baslangic AND bitis - baslangic <= 92)`); v1 `donem` kalır |
| `bolumler` | JSONB NOT NULL DEFAULT '{}' | Bölüm metinleri `{kod: {metin, kaynak, kim, zaman}}` |
| `oneri_imzasi` | CHAR(64) NULL | Son "Strateji öner" girdisinin özeti (aynı girdiyle AI ikinci kez çağrılmaz) |
| `revizyon_notu` | VARCHAR(2000) NULL | Son revizyon isteğinin özeti (yorum tablosunda tam hâli) |
| durum CHECK | `taslak, onayda, revizyon, onaylandi, aktarildi, iptal, kapandi` | `aktarildi` yalnız v1 (CHECK: `bicim = 1 OR durum <> 'aktarildi'`) |

Kısmi tekil indeks yeniden: `(client_id) WHERE bicim = 2 AND durum IN ('taslak','onayda','revizyon')`
— workspace başına tek AÇIK strateji. Onaylı planların tarih çakışması servis kontrolü + test.

`strateji_kalemleri` (yeni):
| Kolon | Tip | Not |
|---|---|---|
| `id`, `org_id`, `client_id`, `plan_id` | UUID | Kompozit FK `(client_id, org_id) → clients ON UPDATE CASCADE` (→ `CASCADE_ILE_TASINANLAR`); `plan_id` CASCADE |
| `sira` | SMALLINT | |
| `amac` | VARCHAR(12) + CHECK `REHBER_AMAC_KODLARI` | |
| `meta_acik`, `google_acik` | BOOL; CHECK en az biri | |
| `meta_payi` | SMALLINT NULL, CHECK 10..90 | Yalnız ikisi açıkken |
| `butce_micros` | BIGINT CHECK > 0 | |
| `baslangic`, `bitis` | DATE | Plan aralığında (servis) |
| `konumlar` | JSONB | `rehberKonumuSchema[]` |
| `yas_min`, `yas_max` | SMALLINT NULL | |
| `metin` | JSONB NULL | `{anaMetin, basliklar, aciklamalar, kaynak}` |
| `kreatif_yonergesi`, `kitle_tarifi` | JSONB NULL | `{metin, kaynak, kim, zaman}` |
| `kelime_grubu` | VARCHAR(80) NULL | `strateji_kelimeleri.grup` |
| `varlik_idleri` | UUID[] (≤10) | |
| `tahmin` | JSONB NULL | `{olcut, altMicros?, ustMicros?, altSonuc, ustSonuc, kaynak: 'veri'}` ya da `{tur:'yok', neden}` — motor yazar, istemci yazamaz |
| `kaynaklar` | JSONB | alan → kaynak (§2.1) |
| `rehber_id` | UUID NULL UNIQUE → `reklam_rehberi(id)` ON DELETE SET NULL | Geri bağ |
| `aktaran_id`, `aktarim_zamani` | | |
| `not`, `created_at`, `updated_at` | | |

`strateji_yorumlari` (yeni): `id, org_id, client_id, plan_id, kalem_id NULL (SET NULL), surum,
user_id, rol ('musteri'|'ajans'), tur ('yorum'|'revizyon'|'onay'), metin VARCHAR(2000),
created_at`. Yalnız INSERT + SELECT politikası (yorum değiştirilemez; kayıt).

`strateji_varsayimlari`: **YOK** (kullanıcı kararı 3).

`strateji_kelimeleri`: değişmez (kalem `kelime_grubu` ile bağlanır).
`strateji_matrisi`, `strateji_dagilimlari`: değişmez, v2 yazmaz.

Üç durak her yeni tabloda: `test/pglite-harness.ts` TRUNCATE, `prisma/sql/02_rls.sql`
(SELECT/INSERT/UPDATE `can_access_client`; yorumlar UPDATE yok), `workspace-tasima.ts`
(`strateji_kalemleri`, `strateji_yorumlari` → `CASCADE_ILE_TASINANLAR`).

**Shared:** `ALAN_KAYNAKLARI += 'strateji'`, `ISTEMCI_YAZAMAZ += 'strateji'`,
`REHBER_IZINLI_KAYNAKLAR` §4.2'deki satırlar. Shared derlemesi ÇIKTISIYLA.

### 6.2 Durum makinesi

```
 taslak ──onaya_gonder──► onayda ──onayla──► onaylandi ──kapat──► kapandi
   ▲   ▲                   │   │                │
   │   └──geri_cek─────────┘   └─revizyon_iste─► revizyon ──(düzenleme)──► taslak*
   │                                             │
 (taslak|onayda|revizyon|onaylandi) ──iptal──► iptal
```
\* `revizyon` düzenlenebilir; ilk kayıt durumu `taslak`a çeker ve `surum` artar.

| Eylem | Kaynak | Hedef | İzin | Not |
|---|---|---|---|---|
| `onaya_gonder` | taslak, revizyon | onayda | write | Engel: kalem yok, R-SITE/kapalı amaç |
| `geri_cek` | onayda | taslak | write | |
| `onayla` | onayda | onaylandi | approve | Rol kaydı, `onaylanan_surum` |
| `revizyon_iste` | onayda | revizyon | approve | Yorum zorunlu (`strateji_yorumlari`) |
| `kapat` | onaylandi | kapandi | write | Dönem bitince elle; tekil indeks onu kapsamıyor zaten |
| `iptal` | taslak, onayda, revizyon, onaylandi | iptal | write | Aktarılmış kalemin rehberi ETKİLENMEZ (söylenir) |
| aktarım | onaylandi | (plan durumu değişmez) | write + bulk.write | Kalem düzeyinde, tekrarlanabilir |

Son durumlar `kapandi`, `iptal`: tekil indeks yalnız açık durumları kapsar, her durumdan çıkış var
(boost `active` dersi; `sozlesme.spec.ts`).

### 6.3 Uçlar (`STRATEJI_UCLARI` v2)

| Yöntem | Yol | İzin | Ne |
|---|---|---|---|
| GET | `/strateji/planlar?clientId=` | read | Liste (v1 + v2, `bicim` ile) |
| POST | `/strateji/planlar` | write | `{clientId, baslangicAyi, sureAy 1-3, toplamButce}` |
| GET | `/strateji/planlar/:id` | read | Plan + kalemler + bölümler + türetilmiş kalem durumları + riskler |
| GET | `/strateji/planlar/:id/girdiler` | write | Motor girdisi (marka, beyan, ölçüm, hesap, açılış) — ekranın sol sütunu |
| POST | `/strateji/planlar/:id/oner` | write | Motor + AI; YAZMAZ, `StratejiOnerisi` döndürür (imza aynıysa önbellek) |
| PUT | `/strateji/planlar/:id/kalemler` | write | Tek seferde, `surum` ile (409) |
| PUT | `/strateji/planlar/:id/bolumler` | write | Bölüm metinleri (`ai` → "Kullan" = `ajans`) |
| POST | `/strateji/planlar/:id/kalemler/:kalemId/metin-oner` | write | Rehberin metin motoru |
| POST | `/strateji/planlar/:id/kelime-ara` · PATCH `…/kelimeler` | write | v1 aynen |
| POST | `/strateji/planlar/:id/eylem` | write | onaya_gonder, geri_cek, kapat, iptal |
| POST | `/strateji/planlar/:id/onayla` | approve | |
| POST | `/strateji/planlar/:id/revizyon` | approve | `{yorum}` |
| GET/POST | `/strateji/planlar/:id/yorumlar` | read / approve∨write | |
| GET | `/strateji/planlar/:id/aktarim-onizleme` | read | Kalem başına engel, düşecek platform, rehberde eksik kalacak alanlar |
| POST | `/strateji/planlar/:id/aktar` | write + bulk.write | `{surum, kalemIdleri?}` → `AktarimSonucu2` |
| GET | `/strateji/planlar/:id/gerceklesen` | read | Kalem başına harcanan/sonuç |
| GET | `/strateji/planlar/:id/pdf` | read | Sorgu dizesi tek üreticiden |
| POST | `/strateji/planlar/:id/gonder` | write + report.share | Mail (PDF eki + panel bağlantısı), `{kabul, ret}` |
| GET | `/reklam/rehberler/:id/strateji` | bulk.read | Rehberin bağlı olduğu kalem (rehber ekranının kutusu) |

Müşteri (`client_viewer`): read + approve uçları; düzenleme ekranını hiç görmez, yalnız belge.
Denetim kaydı: onay, revizyon, aktarım, PDF indirme, mail (v1'de PDF kaydı yoktu).

### 6.4 Ajan 2 / Ajan 3 dosya sahipliği

| Ajan | Sahip | Okur, yazmaz |
|---|---|---|
| 1 | **Son hâli § 9.5.** | — |
| 2 | `apps/api/src/modules/strateji/**` (servis, controller, `strateji-pdf.ts` yeni, AI istemi), migration M1, `prisma/sql/02_rls.sql`, `test/pglite-harness.ts`, `workspace-tasima.ts`, `apps/api/assets/fonts/{Montserrat,OpenSans}*`, `reports/pdf-cizim.ts`e `MARKA` sabiti (ekleme), `reklam/rehber/rehber.service.ts`e `stratejiKalemi` okuması | shared, rehber servisinin `olustur` / `konumlariEsle` |
| 3 | `apps/web/src/app/(dashboard)/strateji/page.tsx`, `apps/web/src/components/strateji/**` (yeniden), rehber ekranında "Stratejiden" kutusu (`components/rehber/` içinde tek yeni bileşen) | shared |

Ajan 2 ve 3 tip tanımlamaz. Rehber dosyalarına dokunuş yalnız tablodaki iki nokta; geri kalan
rehber kodu AdvCampaign'in sahipliğinde.

### 6.5 Test listesi (Ajan 4 kapısı)

1. **Ölü yol bekçisi:** `strateji` modülü kaynağında `adv_oturum` geçmez (yorumsuz kaynak
   taraması + "gövde yakalandı" testi).
2. **Eşleme tablosu kilidi:** §4.2'deki her satır için kalem → `rehberAlanlariSchema.parse` +
   `rehberEksikleri` çağrısı; `strateji` kaynaklı alan eksik listesinde "kaynak izinsiz" ÜRETMEZ;
   `ekKategoriler`, `satissizPikselOnayi`, promosyon, fiyat `strateji` ile yazılamaz (mutasyon:
   izin listesine ekle → düşmeli).
3. **Açılış kapısı:** `deneme` amaç ajans yöneticisi olmayana aktarılmaz; Google kapalı amaçta
   kalem yalnız Meta ile; tablo tek kaynaktan (`REHBER_ACILIS`), `AKTARILABILIR_PLATFORMLAR`
   gibi ikinci liste kaynakta yok.
4. **Mükerrer yok:** iki eşzamanlı aktarımda kalem başına tek rehber (`RETURNING` sayımı).
5. **Motor (saf, çalıştırılarak):** site yok → SITE/SATIS yok; ölçüm yok → dönüşüm önerisi yok +
   R-OLCUM; bütçe asgari altı → platform düşer ve cümle var; pay 30–70 kırpması; platform
   dönüşümleri HİÇBİR yerde toplanmaz (kaynak taraması + birim testi); tahmin yalnız veri.
6. **Sayı yasağı:** AI bölümlerinde rakam/oran taşıyan cevap reddedilir; ikinci ret alanı boş
   bırakır ve neden döner (mutasyon: süzgeci kaldır → düşmeli).
7. **Durum makinesi:** her durumdan çıkış; `revizyon` yorum zorunlu; onaydaki plan yazılamaz;
   `onaylanan_surum ≠ surum` aktarımı reddeder; v1 `aktarildi` yalnız `bicim = 1`.
8. **RLS (`SET ROLE` + `RETURNING`):** kalem/yorum tablolarında başka workspace'e yazma 0 satır;
   müşteri yorum yazar, kalem yazamaz; "tüm şirketler" modunda `org_id` hedef workspace'ten.
9. **Üretim sırası:** M1, v1 verisi ve `01_constraints.sql` duran veritabanında uygulanır.
10. **Workspace taşıma:** yeni tablolar `CASCADE_ILE_TASINANLAR`ta (`workspace-tasima.spec.ts`).
11. **PDF:** bölüm listesi = PDF'teki bölüm başlıkları (`metinler()`); `SLATE` strateji PDF'inde
    geçmez; yalnız dört renk sabiti; Montserrat/Open Sans cmap'inde `ğ ş ı İ ₺` (yoksa yedek
    yolu sınanır); halka konumu dönüşümle ölçülür; taslakta filigran.
12. **Geri bağ:** rehber yayın durumu kalem durumuna doğru türer; gerçekleşen sorgusu kalemin
   kampanyalarını kalem tarih aralığında süzer, platformları toplamaz.
13. **Nest grafiği:** strateji modülü rehber servisini kullanınca `nest-grafigi.spec.ts`.
14. **Panel:** `nav-sections` (menü adı = sayfa başlığı "AdvStrategy"), `panel-tasarim`,
    `.catch(() => setX([]))` yok; müşteri görünümünde düzenleme bileşeni monte edilmez.

### 6.6 Canlıda ölçülecekler (Ajan 5)

| # | Ne | Nasıl |
|---|---|---|
| Ö-1 | Üretimde kaç v1 planı var, kaçı `aktarildi` (ölü oturumlu) | Salt okunur SQL, `advetics` kullanıcısıyla |
| Ö-2 | Montserrat/Open Sans TTF'lerinde `₺` ve Türkçe glifler | `pdf-yazi-tipi.spec.ts` deseni + üretilen PDF'i gözle |
| Ö-3 | Aktarılan kalemin rehberde eksik sayısı (gerçek workspace) | Ege Birlik Yapı'da bir plan → aktar → rehberi aç |
| Ö-4 | Geçmiş sonuç başı maliyetin amaç eşlemesi (kampanya amacı → rehber amacı) gerçek hesapta tutuyor mu | Ölçüm betiği: son 3 ay, amaç başına satır sayısı ve "eşlenemeyen" harcama payı (eşlenemeyen büyükse tahmin gösterilmez) |
| Ö-5 | Gerçekleşen sorgusu süresi (kalem × kampanya × gün) | `olcum-rapor.ts` ile, her sorgu ayrı |
| Ö-6 | Mail: PDF eki boyutu (gömülü görsellerle) ve 22 MB bütçesi | Gönderim |
| Ö-7 | Tasarım denetimi (Ajan 6): masaüstü + mobil, müşteri ve ajans görünümü | Canlı ekran görüntüsü, kullanıcıya önce/sonra |

### 6.7 Faz sırası

1. **İlk iş (tasarımdan bağımsız, küçük):** v1 `aktar` eylemini panelde ve sunucuda kapat
   (`AKTARIM_KAPALI_SEBEBI`), ekran "AdvCampaign rehberine aktarım yeniden yazılıyor" desin.
   Ölü yol bugün de para değil ama güven yakıyor.
2. Faz A: veri modeli + motor + kalem düzenleme + belge görünümü (panel) + onay/revizyon/yorum.
3. Faz B: aktarım + geri bağ + rehberde "Stratejiden" kutusu.
4. Faz C: PDF (kılavuz yazı tipleri) + mail + girişsiz onay bağlantısı.

---

## 7. Görsel taslak

[`taslak.html`](taslak.html) — tek dosya, Google Fonts (Montserrat, Open Sans), açık/koyu tema
token'ları, 760 px altında tek sütun. Üç sekme:

- **(a) Strateji oluştur** — Google Ads planlayıcı mantığı: solda girdiler (dönem, bütçe,
  Marka Merkezi / ölçüm / beyan durumu kaynak rozetleriyle), sağda "Önerilen strateji": özet
  kutuları, aşama × platform bütçe çubuğu, kalem tablosu (durum, amaç, platform payı, bütçe,
  tarih, bölge, tahmin + kaynak), satıra tıklayınca kalem düzenleyici (amaç, pay kaydırıcısı,
  bütçe, takvim, bölge, yaş, kreatif yönergesi, metin önerisi "Kullan", kelimeler) ve riskler.
- **(b) Kurumsal rapor** — müşterinin gördüğü: kapak, özet, bugüne kadar, hedefler, bütçe
  dağılımı (halka + çubuk), kampanyalar, takvim, ölçüm, riskler, onay kutusu (Onayla / Revizyon
  iste / yorum).
- **(c) AdvCampaign'e aktar** — kalem → rehber taslağı: hazır / eksik kalacaklar / aktarılamaz
  (nedeniyle), seçili kalem için alan alan eşleme ve kaynak, aktarım sonrası durum ve plan /
  gerçekleşen.

Örnek içerik Ege Birlik Yapı (konut); **bütün rakamlar "örnek"** işaretli, gerçek veri değil.

---

## 8. Devir notu (Ajan 1, bu tur)

**Yapıldı:** denetim (dosya:satır), ürün tanımı, rapor yapısı, rehber eşleme tablosu, çelişki
tablosu, veri modeli/durum makinesi/uçlar/sahiplik/test/ölçüm listesi, görsel taslak.

**Ölçmedim:** üretimdeki v1 plan sayısı (Ö-1); kılavuz yazı tiplerinin `₺` kapsamı (Ö-2);
`campaigns` amacından rehber amacına eşlemenin gerçek hesapta ne kadar harcamayı kapsadığı (Ö-4);
rehber `olustur` fonksiyonunun dışarıdan (strateji servisinden) çağrıldığında önden doldurmanın
(hesap, sayfa) çalışıp çalışmadığı — bugün önden doldurma panelin açılışında mı sunucuda mı,
okumadım; Ajan 2 ilk iş bakmalı. Shared derlemesi koşulmadı (kod yok).

**Açık:** üç soru (§5). Kullanıcı taslaktan seçim yapmadan Ajan 2/3 başlamaz. Sözleşme kodu
(`packages/shared/src/strateji/` v2) bir sonraki Ajan 1 turunda, soruların cevabıyla.

---

## 9. İkinci tur (Ajan 1, 2026-10-13) — sözleşme, ölü aktarımın kapatılması, yazı tipi ölçümü

### 9.1 Commit'ler

| Commit | Ne |
|---|---|
| `ff83c662` | **fix(strateji):** v1 aktarımı kapatıldı. `V1_AKTARIM_ACIK = false` (shared), servis `aktar()` ilk satırda 400 + sebep, `yapilabilir`e `aktar` girmiyor, panel ayrıca süzüyor, onaylı planda "AdvCampaign'e aktarım şu an kapalı" kutusu, eski `aktarildi` planın kutusu ölü `?oturum=` bağlantıları yerine "AdvCampaign'de bu plandan taslak yok" diyor. Mutasyon: 4 ayrı bozma, hepsi düştü. |
| (bu commit) | **feat(strateji):** v2 sözleşmesi + `strateji` alan kaynağı + bu bölüm + taslak güncellemesi |

### 9.2 Sözleşme dosyaları (`packages/shared/src/strateji/v2/`)

| Dosya | İçerik |
|---|---|
| `kaynak.ts` | `STRATEJI_KAYNAKLARI` (veri, marka, kural, ai, ajans — **varsayım yok**), etiketler, `BELGEYE_GIREN_METIN_KAYNAKLARI` (ai yok: "Kullan" denmeden belgeye girmez), `kaynakliMetinSchema`, `stratejiMetniDenetle` (sayı yasağı) |
| `durum.ts` | v2 durum makinesi (`STRATEJI_DURUMLARI/EYLEMLERI/GECISLERI`), eylem izinleri, `STRATEJI_ACIK_DURUMLAR` (tekil indeks yüklemi), `YORUM_ZORUNLU_EYLEMLER`, `STRATEJI_ONAY_ROLLERI` (musteri, ajans, baglanti) + cümleleri, `stratejiYapilabilir`. v1 adları değişmedi (aynı tablo, `bicim` ile ayrılır) |
| `kalem.ts` | Aşama ve ölçüt amaçtan (`AMAC_ASAMASI`, `AMAC_OLCUTU`, `Record` eksiksiz), sınırlar, `stratejiOlusturSchema` + `stratejiDonemi` (1-3 ay), `stratejiKalemiGirdiSchema` (pay yalnız iki platformda, yaş iki uç birlikte, 18-65 ipucu), `kalemTarihHatasi`, `kalemTahmini` (yalnız veri; ± yüzde yok), `YAYIN_KALEM_DURUMU` (22 yayın durumu → 7 kalem hâli, eksiksiz), `kalemDurumu`, `StratejiKalemi` yanıt tipi |
| `rehber-esleme.ts` | `STRATEJI_REHBER_ESLEMESI` (§ 4.2 tablosunun kodu), `REHBERDE_TAMAMLANAN_ALANLAR`, `STRATEJIDEN_YAZILMAYAN_ALANLAR`, `kalemAktarimEngeli` (rehberin KENDİ kapıları: `amacGorunurMu`, `platformGorunurMu`, `siteYokRehberKapisi`; düşen platform sebebiyle), `kalemdenRehberAlanlari` |
| `paylasim.ts` | Girişsiz onay bağlantısı (§ 9.3) |
| `adresler.ts` | `stratejiPanelAdresi` (`?musteri=&plan=&gorunum=`), `stratejiGorunumKapisi` (müşteri hesabı her istekte `belge`), `onayBaglantisiYolu` (`/strateji-onay/<token>`), `STRATEJI_V2_UCLARI` (oturumsuz uç yalnız ikisi), `stratejiUcYolu` (eksik parametre hata), `stratejiPdfYolu` (sürüm zorunlu) |
| `belge.ts` | `STRATEJI_BELGE_BOLUMLERI` (panel + PDF tek liste), `AI_METIN_BOLUMLERI`, `stratejiRiskleri` (deterministik; `null` = bilinmiyor risk üretmez) |

Rehber tarafında: `ALAN_KAYNAKLARI += 'strateji'`, `ISTEMCI_YAZAMAZ += 'strateji'`,
`REHBER_IZINLI_KAYNAKLAR`a `strateji`: amac, platformlar, konumlar, metin, anahtarKelimeler,
butce, metaPayiYuzde, takvim. **Eklenmedi:** ekKategoriler, satissizPikselOnayi, googlePromosyon,
googleFiyatListesi, hesap/sayfa/telefon/piksel/form alanları. Bu değişiklik JSONB'de, DB CHECK'i
yok (migration'larda `ai_onerisi` bile geçmiyor; ölçüldü).

**§ 4.2'den sapma:** yaş ipucu (`yasMin/yasMax`, 18-65) rehberde `yasAraligi`ya gider;
`enDusukYas` (rehberin 18-25 SERT alt sınırı) stratejiden YAZILMAZ — ipucunu sert sınıra
çevirmek kitleyi sessizce daraltırdı. Bir platform düşerse kalemin bütçesinin tamamı kalan
platforma yazılır ve bu bir NOT olarak döner (rehberde görünür).

**Testler:** `sozlesme-v2.spec.ts`, 26 test. Mutasyonla doğrulandı (12 bozma, her biri ≥ 1
testi düşürdü): `varsayim` eklemek, `ISTEMCI_YAZAMAZ`dan `strateji`yi çıkarmak, ekKategoriler'e
`strateji` izni, bağlantının sürüm kontrolünü silmek, aktarımın onaylanan sürüm kontrolünü
silmek, `ai` metni `strateji` diye yazmak, görünüm kapısını açmak, ölçüm "bilinmiyor"u risk
saymak, tahminde sıfır sonuçlu ayı süzmemek, açılış kapısını kapatmak, Google konum karşılığını
taşımak, revizyonu yazma iznine bağlamak.

### 9.3 Girişsiz onay bağlantısı — güvenlik tanımı (K-2)

Emsal: `reports/share.service.ts` + `apps/web/src/app/r/[token]`. Fark: bu bağlantı bir KARAR
yazıyor ve o karar ajansın kampanya kurmasının kapısı.

| Kural | Nasıl |
|---|---|
| Token | 32 bayt `randomBytes` → base64url (43 karakter, `ONAY_TOKEN_DESENI`). DB'de YALNIZ SHA-256 (`token_hash CHAR(64) UNIQUE`). Ham token yalnız oluşturma yanıtında; log, denetim kaydı ve DB'de yok |
| Biçim kontrolü | `onayTokenBicimiGecerli` DB'ye sormadan önce: biçimsiz token sorgu harcatmaz |
| Ayırt etmeme | Bulunamadı / iptal / süresi doldu → AYNI cevap ("Bağlantı geçersiz"); var olanı tahmin ettirmez |
| Tek plan, tek sürüm | `(plan_id, surum)` bağlı. `baglantiHali`: sürüm değiştiyse okunamaz ve karar verilemez (müşteri gördüğünden farklı belgeyi onaylamasın). Karar gövdesi de ekranın sürümünü taşır |
| Süre | 1-30 gün, varsayılan 14 (`ONAY_BAGLANTISI_*`). Süresiz bağlantı YOK |
| Plan başına tek açık bağlantı | Yenisi oluşturulurken eskileri aynı transaction'da iptal; kısmi tekil indeks `(plan_id) WHERE iptal_at IS NULL AND kullanildi_at IS NULL` |
| Tek kullanımlık karar | Koşullu UPDATE: `SET kullanildi_at = now(), karar = … WHERE token_hash = $1 AND kullanildi_at IS NULL AND iptal_at IS NULL AND son_gecerlilik > now() AND surum = (plan.surum) RETURNING` + aynı transaction'da plan `UPDATE … WHERE durum = 'onayda' AND surum = $s`. İki eşzamanlı karardan yalnız biri satır döndürür (Ajan 4: `RETURNING` sayımıyla sına) |
| Kimlik beyanı | Ad (3-120) + e-posta ZORUNLU (`baglantiKarariSchema`), `onaylayan_ad`, `onaylayan_eposta`, `onay_rolu = 'baglanti'`. Belge "Onay bağlantısıyla onaylandı · Ad (e-posta)" yazar: doğrulanmış kimlik değil, beyan |
| Revizyon | Yorum zorunlu; `strateji_yorumlari`na `rol = 'baglanti'` satırı |
| Kötüye kullanım | IP başına `ONAY_BAGLANTISI_DENEME_SINIRI` (30 istek / 15 dk) okuma + karar; sayfa `noindex, nocache`, `Referrer-Policy: no-referrer`; yanıtta ajans iç notu, ajans içi yorumlar, kişi e-postaları YOK; IP ve tarayıcı yalnız `audit_logs`a |
| DB erişimi | Anonim yol `PrismaAdminService` ile TEK satır (share deseni: RLS bağlamı yok, erişim kararı token); panel yönetimi (oluştur, listele, iptal) RLS'li bağlantıyla |
| İptal | Panelden (`strategy.write`), plan iptal edilince bağlantı da ölü (`baglantiHali`) |

**Veri modeli eki (M1'e):**
- `strateji_onay_baglantilari`: `id, org_id, client_id, plan_id (CASCADE), surum, token_hash
  CHAR(64) UNIQUE, olusturan_id, created_at, son_gecerlilik TIMESTAMPTZ NOT NULL, iptal_at,
  kullanildi_at, karar VARCHAR(16) CHECK (onayla, revizyon_iste), karar_ad VARCHAR(120),
  karar_eposta VARCHAR(254)`; CHECK: `kullanildi_at IS NULL OR (karar, karar_ad, karar_eposta)
  hepsi dolu`. Üç durak: TRUNCATE, RLS (`can_access_client`; anonim yol admin bağlantısı),
  `CASCADE_ILE_TASINANLAR` (kompozit anahtar).
- `strateji_planlari`: `onay_rolu` CHECK += `baglanti`; `onaylayan_ad VARCHAR(120)`,
  `onaylayan_eposta VARCHAR(254)` (yalnız `baglanti`ta dolu; CHECK). Durum CHECK: v1 ∪ v2 =
  `taslak, onayda, revizyon, onaylandi, aktarildi, kapandi, iptal` (`aktarildi` yalnız `bicim = 1`).
- `strateji_yorumlari.rol` CHECK: `musteri, ajans, baglanti`.
- `strateji_varsayimlari`: YOK (K-3).

### 9.4 Yazı tipi ölçümü — Montserrat / Open Sans `cmap` (K-1, PDF)

Ölçüm `@pdf-lib/fontkit` ile (PDF'i çizecek kütüphanenin kendisi), aranan karakterler
`ğ Ğ ş Ş ı İ ç Ç ö Ö ü Ü ₺`:

| Dosya | Sürüm | Sonuç |
|---|---|---|
| Montserrat Regular / Medium / Bold, tam TTF (yerel kopya, `reklam-kampanyası/…/marka/`) | 9.000 | **Hepsi var, `₺` (U+20BA) dahil**; 1.313 glif |
| Montserrat, panelin `next/font` woff2 alt kümeleri (`apps/web/.next/static/media`) | 9.000 | `₺` latin-ext alt kümesinde var |
| Open Sans, panelin `next/font` woff2 alt kümeleri (bütün alt kümeler birlikte) | 3.003 | Türkçe harflerin hepsi var; **`₺` YOK** — U+20A0-20C0 aralığında yalnız `₣ ₤ ₧ ₪ ₫ €` |
| DejaVu Sans (depoda) | 2.37 | Hepsi var |

Open Sans'ın tam TTF'i depoda ve makinede yok; Google Fonts'un sunduğu 3.003'ün bütün alt
kümelerinde `₺` olmaması, sürümde olmadığını gösteriyor (alt kümeler birleşimi = Google'ın
sunduğu glif kümesi). Tam dosya Ajan 2'nin indirmesinde AYRICA ölçülecek (Ö-2 açık kalıyor,
ama karar ona bağlı değil).

**Karar:**
1. PDF'te başlıklar ve BÜTÜN SAYILAR/TUTARLAR Montserrat (kılavuz da "büyük sayılar Montserrat"
   diyor; `₺` orada var). Gövde metni Open Sans.
2. Open Sans ile çizilecek bir dize `₺` (ya da yazı tipinde olmayan başka bir glif) taşıyorsa
   o dize Montserrat'la çizilir; Montserrat'ta da yoksa DejaVu'ya AÇIK yedek. Karar dize başına
   `font.hasGlyphForCodePoint` ile; sessiz düşme yok (CLAUDE.md "PDF'TE TÜRKÇE GÖMÜLÜ YAZI TİPİ
   İSTİYOR"). Test: `pdf-yazi-tipi.spec.ts` deseniyle iki yazı tipinin cmap kapsamı + "Open Sans
   `₺` çizemiyor" kanıtı (o gün Open Sans güncellenip `₺` eklerse test düşer ve kural gevşetilir).
3. TTF'ler `apps/api/assets/fonts/` altına (OFL lisans dosyasıyla, Montserrat Bold + SemiBold,
   Open Sans Regular + SemiBold; ~1 MB). İndirme Ajan 2'nin işi ve kullanıcı izni ister.
4. **Yan bulgu (panel):** Open Sans `₺` taşımadığı için panelde gövde metnindeki `₺` tarayıcının
   yedek yazı tipiyle çiziliyor (görsel tutarsızlık, veri hatası değil). Ajan 6 denetimine not.

### 9.5 Dosya sahipliği — son hâli

| Ajan | Sahip | Okur, yazmaz |
|---|---|---|
| 1 | `packages/shared/src/strateji/v2/**`, `reklam/taslak.ts` (`strateji` kaynağı), `reklam/rehber/alanlar.ts` (izin satırları), bu belge, `taslak.html`. Sözleşme değişirse önce burası, shared derlemesi ÇIKTISIYLA | — |
| 2 | `apps/api/src/modules/strateji/**` (v2 servis + controller + `strateji-pdf.ts` + onay bağlantısı servisi + motor sorguları + AI istemi), migration M1 (ayrı dosya, üretim sırası testiyle), `prisma/sql/02_rls.sql`, `test/pglite-harness.ts`, `workspace-tasima.ts`, `apps/api/assets/fonts/{Montserrat,OpenSans}*` + lisans, `reports/pdf-cizim.ts`e `MARKA` renk sabiti (EKLEME; `SLATE` rapor PDF'inde kalır), `reklam/rehber/rehber.service.ts`e iki dokunuş: aktarımın çağıracağı `olustur(…, { alanlar })` girişi ve `GET /reklam/rehberler/:id/strateji` | shared; rehberin `konumlariEsle` ve `aitlikDenetle` fonksiyonları |
| 3 | `apps/web/src/app/(dashboard)/strateji/page.tsx` (üç görünüm, `stratejiGorunumKapisi`), `apps/web/src/components/strateji/**` (v2; v1 bileşenleri `bicim = 1` planların salt okunur görünümü olarak kalır), `apps/web/src/app/strateji-onay/[token]/page.tsx` (oturumsuz; `noindex`, `referrer: 'no-referrer'`) + `middleware.ts` genel erişim listesine `/strateji-onay`, rehber ekranında tek yeni bileşen ("Stratejiden" kutusu) ve `kaynak === 'strateji'` için "Stratejiden" rozeti (bugün `adim-butce.tsx` vb. `kullanici` dışını "Önerilen" diye gösteriyor) | shared |
| 4 | `sozlesme-v2.spec.ts`e ekleme, RLS (`SET ROLE` + `RETURNING`), onay bağlantısı eşzamanlılık + tek kullanım, controller ↔ `STRATEJI_V2_UCLARI` kaynak taraması | hepsi |

v1 kodu (`strateji.service.ts`'in v1 yolları, `medya-plani-pdf.ts`, `components/strateji/*`)
v2 ekranı canlıya çıkıp v1 planlar salt okunur görünümde doğrulanana kadar SİLİNMEZ.

### 9.6 Devir notu (Ajan 1, ikinci tur)

**Yapıldı:** ölü aktarım kapatıldı (`ff83c662`); v2 sözleşmesi + 26 test (12 mutasyon);
`strateji` alan kaynağı ve rehber izinleri; yazı tipi ölçümü ve karar; kullanıcı kararları
belgeye ve taslağa işlendi. Shared derlemesi çıktısıyla temiz, API + panel typecheck temiz,
panel testleri ve API paketi (tek başına) yeşil.

**Ölçmedim:** Open Sans'ın tam TTF'i (yalnız Google'ın 3.003 alt kümeleri); üretimdeki v1 plan
sayısı (Ö-1); rehberin önden doldurmasının (hesap, sayfa) sunucudan açılan rehberde çalışıp
çalışmadığı — `rehber.service.ts#olustur` alanları boş açıyor, önden doldurma panelde
(`rehber-mantik.ts`) görünüyor: Ajan 2 ilk iş bunu okusun, sunucu tarafında yoksa aktarım
hesap/sayfa alanlarını boş bırakır ve rehber eksik listesi gösterir (sessiz değil ama bir adım
fazla). Motorun sorguları (amaç × platform aylık sonuç başı maliyet; kampanya amacının rehber
amacına eşlenmesi, Ö-4) sözleşmede yalnız girdi tipi olarak var.

**Açık:**
- Motor (`motor.ts`: dönüşüm önce, öğrenme tabanı, pay kırpması) bu turda kod olarak yazılmadı;
  kuralları § 2.3'te. Ajan 2'nin servisi ihtiyaç duyduğunda Ajan 1 saf fonksiyon olarak ekler
  (girdi: `kalemTahmini`nin aylık dizisi + asgariler + açılış).
- Yapay zekâ cevap şeması (özet, işletme, kitle, kreatif yön) `AI_METIN_BOLUMLERI` + `stratejiMetniDenetle`
  ile tanımlı; istem metni Ajan 2'de.
- v1 `aktarildi` planları üretimde varsa panel artık "eski aktarım, taslak yok" diyor; o
  oturumlar (`adv_oturum`) veri olarak duruyor, silinmedi.


---

## 9.7 Ajan 2 (Arka Plan) — devir notu ve sapmalar (2026-10-13)

### Yapıldı

| Parça | Dosya |
|---|---|
| Migration M1 (ayrı dosya) | `apps/api/prisma/migrations/20261018100000_advstrategy_v2/` — `strateji_planlari` (bicim, baslangic/bitis, bolumler, riskler, olcum_ozeti, oneri_imzasi, revizyon_notu, onaylayan_ad/eposta; `onay_rolu` VARCHAR(8) + `baglanti`; durum CHECK v1 ∪ v2; v1 açık plan indeksi yalnız `bicim = 1`, v2'de workspace başına tek açık), `strateji_kalemleri`, `strateji_yorumlari`, `strateji_onay_baglantilari` |
| Üç durak | `test/pglite-harness.ts` TRUNCATE · `prisma/sql/02_rls.sql` (kalem dört işlem, yorum YALNIZ INSERT+SELECT, bağlantı SELECT/INSERT/UPDATE) · `workspace-tasima.ts` → `CASCADE_ILE_TASINANLAR` |
| Motor (saf) | `apps/api/src/modules/strateji/v2/motor.ts` (+ `motor.spec.ts`, çalıştırılarak) |
| Geçmiş / gerçekleşen | `v2/gecmis.ts` — kampanya amacı → rehber amacı eşlemesi (kısıt; eşlenemeyen harcama ayrı satır), son üç TAM ay, platformlar ayrı |
| Girdiler | `v2/girdiler.ts` — Marka Merkezi, `workspace_hazirlama` site adımı (tetiklemeden), kurulum beyanları, `OlcumService.durum` (10 dk önbellek), rehber hazırlığı |
| Yapay zekâ | `v2/strateji-ai.ts` — istem RAKAMSIZ (girdideki rakamlar bile süzülüyor), çıktı `stratejiMetniDenetle`, bir kez yeniden, yine düşerse alan boş + neden |
| Servisler | `v2/strateji-v2.service.ts`, `v2/onay-baglantisi.service.ts`, `v2/belge-verisi.ts` (müşteriye giden belgenin TEK üreticisi: panel müşteri görünümü, PDF, bağlantı), `v2/yorumlar.ts`, `v2/satirlar.ts` |
| Uçlar | `v2/strateji-v2.controller.ts` — `STRATEJI_V2_UCLARI` ile kaynak taramasıyla eş (`strateji-v2-saf.spec.ts`); oturumsuz yalnız iki onay ucu (`noindex`, `no-store`, `no-referrer`) |
| PDF | `v2/strateji-pdf.ts` — yalnız `MARKA` (dört renk + gri saydamlığı), bölümler `STRATEJI_BELGE_BOLUMLERI` sırasıyla, kapakta yalnız Advetics logosu, taslakta filigran, glif yoksa dize başına DejaVu, yazı tipi yoksa açık hata |
| Mail | `RaporGonderService.ozetGonder`e isteğe bağlı `ekler` (aynı çekirdek: imza, doğrulanmamış kimlik reddi, kısmi ret) |
| v1 → v2 | v1 servis sorguları `bicim = 1` ile süzülüyor (v2 planı v1 yolunda "bulunamadı"); v1 `POST /strateji/planlar` NEDENİYLE 400 (`V1_OLUSTURMA_KAPALI`); v1 planlar v2 listesinde `bicim: 1`, v2 detayında 409 |

### İlk iş — rehber önden doldurma ÖLÇÜLDÜ

`rehber.service.ts#olustur` alanları sunucuda doldurmuyor; önden doldurma
panelin açılış etkisinde (`rehber-ekrani.tsx` → `rehber-mantik.ts#onDoldurma`)
ve **her rehber açılışında, yalnız BOŞ alana, yalnız TEK seçenekten** yazıyor.
Sonuç: aktarımla açılan rehber ilk açılışta hesap/sayfa/hedef adres/telefonu
rehberin kendi yoluyla alıyor; aktarımın yazdığı bütçe, takvim, konum
(`strateji` kaynaklı) ezilmiyor. Düzeltme gerekmedi; ikinci bir doldurma
yazılmadı (ayrışırdı). Aktarım önizlemesi bunu söylüyor: tek seçenekli alan
`notlar`a ("rehber açılınca kendiliğinden seçilir"), birden çok seçenekli ya da
boş alan `rehberdeTamamlanacak`a. Kalan boşluk: sunucunun "N eksik" sayısı
rehber İLK AÇILANA kadar hesap/sayfa satırlarını da sayar.

### Sapmalar (sözleşmeden ya da § 9.5 sahipliğinden)

1. **Yanıt ve gövde tipleri shared'a eklendi** (`packages/shared/src/strateji/v2/yanit.ts`).
   Ajan 3'ün panel dosyasındaki şekiller BİREBİR alındı; farklar:
   - `OlcumSatiri` → `StratejiOlcumSatiri`, `AktarimSonucu` → `StratejiAktarimSonucu` (shared'daki `olcum/index.ts` ve v1 `plan.ts` adlarıyla çakışıyordu).
   - `GonderimSonucu.ret` `string[]` değil `Array<{adres, sebep}>` + `baglanti` (rapor gönderim deseni; sebepsiz ret listesi teşhis ettirmez).
   - `StratejiPlani.guncelleyen` = planı OLUŞTURANIN adı (son değiştireni tutan kolon yok).
   - `YorumGovdesi`, `GonderGovdesi`, `BolumlerGovdesi` zod şemalarıyla; gönderide `konu`/`html` isteğe bağlı (yoksa sunucu şablonu), bölümlerde kaynak `ai` da kabul.
   - Ek alanlar (`EK:` notlu): `StratejiDetayi.yapilabilir/kelimeler`, `StratejiGirdileri.acilis`, `StratejiOnerisi.riskler/onbellekten`, önizlemede `rehberId`, gerçekleşende `planMicros/sonucNedeni/tahmin`, liste satırında `kalemSayisi`, yorumlarda `toplam`.
2. **`TAHMIN_YOK_NEDENLERI` += `eslenemedi`, `toplanamaz`** (kalem.ts): eşlenemeyen geçmişe "geçmiş yok" demek yalan; erişim günlerden toplanamaz.
3. **`STRATEJI_V2_UCLARI` += kelime uçları** (`POST …/kelime-ara`, `PATCH …/kelimeler`): § 6.3 "v1 aynen" diyordu ama v1 uçları v1 detayını döndürür.
4. **Motor `apps/api` içinde** (`v2/motor.ts`), shared'da değil: panel motoru koşmuyor; kapıların hepsi shared'daki TEK fonksiyonlar.
5. **Rehber dosyalarına dokunuş üç** (§ 9.5 iki diyordu): `rehberSatiriEkle` (olustur'un yazımı, çağıranın transaction'ında — aktarım kalemi kilitleyip rehberi AYNI kısa transaction'da açıyor), `metinOnerAlanlardan` (metinOner'ın gövdesi satırsız; kalem metni rehberin motorundan, ikinci motor yok), `rehber.module.ts` `exports: [RehberService]`. `GET /reklam/rehberler/:id/strateji` strateji modülünde (`RehberStratejiController`): rehber stratejiyi tanımıyor, bağımlılık tek yönlü. Bağlı kalem yoksa boş gövde (`null`).
6. **Aktarım yarışı GERİ ALMA ile**: § 4.3 "sonradan açılan rehber arşivlenir" diyordu; tek transaction'da koşullu UPDATE sıfır satır dönerse transaction geri alınıyor, arşivlenecek rehber hiç oluşmuyor (`strateji-v2.service.spec.ts` yarış testi).
7. **Riskler ve ölçüm SNAPSHOT** (`riskler`, `olcum_ozeti` kolonları): kalem kaydında ve onaya gönderimde yazılıyor; müşteri onayladığı belgenin hâlini görür, her okuma platform okumasına bağlanmaz.
8. **PDF gövdesi Montserrat Regular** — Open Sans tam TTF yok ve indirmek kullanıcı izni istiyor (ajan izni geçerli değil). `assets/fonts/NEDEN.md`. Montserrat'ta ligatür kapalı (`fl` tek glif olup metin aramasında "Hedefer" oluyordu).
9. **Onay bağlantısı deneme sınırı BELLEKTE** (API pm2'de tek süreç, fork); yeniden başlatmada sıfırlanır.
10. Bulunan ve düzeltilen: CHECK'te `NULL BETWEEN` NULL döner ve GEÇER — pay, yaş ve beyan kısıtları `IS NOT NULL`/`IS NOT DISTINCT FROM` ile (üretim sırası testi yakaladı).

### Ölçülmedi

- Ö-4: kampanya amacı → rehber amacı eşlemesinin gerçek hesaplarda harcamanın ne kadarını kapsadığı (`eslenemeyenHarcama` ekranda söylüyor). Google'da yalnız SİTE (arama tıklaması) eşleniyor.
- Ö-5: geçmiş ve gerçekleşen sorgularının üretim süresi.
- Ö-6: gömülü yazı tipleriyle PDF boyutu (~3 alt küme Montserrat + DejaVu) ve mail bütçesi.
- `rehber.hazirlik` (Meta asgari okuması) "Strateji öner"de canlı platformda; testlerde sahte.
- Mail bağlantısının kökü `config.mail.appUrl`: üretimde bunun KÖK alan adı olduğu doğrulanmalı (beyaz etiket alan adında `/strateji-onay` panel middleware'inde açılmıyor). CORS: onay sayfası çerezsiz istek atıyor; kök alan adı `CORS_ORIGINS`te ise ek ayar gerekmiyor (kod değişmedi).
- Canlı platform çağrısı yapılmadı; push/deploy yok.

### Testler

`motor.spec.ts` (18), `strateji-v2.service.spec.ts` (25, gerçek BEGIN/ROLLBACK), `strateji-v2-rls.spec.ts` (SET ROLE + RETURNING), `strateji-v2-saf.spec.ts` (geçmiş eşlemesi, sayı yasağı, uç taraması, ölü yol bekçisi), `strateji-pdf.spec.ts`, `src/prisma/advstrategy-v2-uretim-sirasi.spec.ts`. Mutasyon: 14 bozma, 14'ü de yakalandı (pay kırpması, site yok kapısı, ölçüm şartı, karışık birim, yapay zekâ yeniden isteği, aktarımın koşullu UPDATE'i, bağlantı sürüm kontrolü, ayırt etmeme, müşteri görünümü süzgeci, geri çekmede bağlantı iptali, PDF bölüm atlama, yorum UPDATE politikası, deneme sınırı, platform tahmininin karışması).

---

## 9.8 Entegrasyon + Ajan 4 (Test & Güvenlik) — devir notu (2026-10-13)

### Entegrasyon: panel çağrısı ↔ controller

Panelin `components/strateji/v2/yanit.ts` dosyası SİLİNDİ; bütün ekranlar yanıt
tiplerini `@advetics/shared`ten (`strateji/v2/yanit.ts`) okuyor ve controller
dönüşleri aynı tiplere bağlı. `strateji-v2-sayfa.spec.ts` panelde yerel yanıt
tipi tanımını yasaklıyor.

| Uç | Panel çağrısı (gövde) | Controller | Sonuç |
|---|---|---|---|
| GET planlar | page.tsx `?clientId` | `StratejiListesi` | uyumlu |
| POST planlar | plan-secici (`stratejiOlusturSchema`) | `StratejiDetayi` | panel `{id}` dalı atıldı (tip yalanı) |
| GET planlar/:id, girdiler, yorumlar, aktarim-onizleme, gerceklesen | page.tsx | aynı adlar | uyumlu |
| POST oner (`{}`) | duzenleyici | `StratejiOnerisi` | uyumlu |
| PUT kalemler | duzenleyici (`stratejiKalemleriKaydetSchema`) | uyumlu | — |
| PUT bolumler | duzenleyici | `stratejiBolumleriKaydetSchema` | **BULGU-A1** düzeltildi |
| POST metin-oner (`{}`) | kalem-duzenleyici | `KalemMetinOnerisi` (⊇ `KalemMetni`) | uyumlu |
| POST eylem / onayla / revizyon / yorumlar | duzenleyici, onay-kutusu | şemalar | uyumlu |
| POST onay-baglantisi, GET onay-baglantilari, POST …/iptal | gonder.tsx | uyumlu | — |
| POST gonder | gonder.tsx `{surum, alicilar}` | `GonderimSonucu` | **BULGU-A2** düzeltildi |
| POST aktar | aktarim.tsx | `StratejiAktarimSonucu` | ad değişti, uyumlu |
| GET onay/:token, POST …/karar | onay sayfası, onay-kutusu | `BaglantiBelgesi` | **BULGU-G1** düzeltildi |
| GET pdf | `stratejiPdfYolu` | ham bayt | uyumlu |
| GET rehberler/:id/strateji | stratejiden-kutusu | `RehberinStratejisi \| null` | uyumlu |
| POST kelime-ara, PATCH kelimeler | **panel ÇAĞIRMIYOR** | var | **AÇIK-1** |

`guncelleyen` (= oluşturan) panelde hiç gösterilmiyor; etiket gerekmedi.
v1 uçlarının 400'ü paneli kırmıyor: eski plan yalnız `GET /strateji/planlar/:id`
ile salt okunur açılıyor, `POST /strateji/planlar` (400) panelde monte edilmeyen
`plan-listesi.tsx`te.

Mail kökü `config.mail.appUrl` = `APP_URL ?? OAUTH_REDIRECT_BASE_URL`;
DEPLOYMENT.md üretimde `APP_URL=https://advetics.com` (kök) diyor. Onay sayfası
kararı tarayıcıdan `NEXT_PUBLIC_API_URL`e atıyor; üretimde bu aynı kökün
`/api`si (aynı köken, CORS gerekmez). `site-setup.sh` `CORS_ORIGINS`e kökü ve
`www`yi yazıyor. Sunucudaki gerçek değerler ÖLÇÜLMEDİ.

### Bulgular ve düzeltmeler

| # | Bulgu | Düzeltme | Test (mutasyonla) |
|---|---|---|---|
| G1 | **Onay sayfası okumaları tek IP'den.** Belge Next SUNUCUSUNDAN okunuyor; deneme sınırı her okumayı sayıyordu → 30 sayfa açılışından sonra 15 dk BÜTÜN müşterilerin bağlantısı "Çok fazla deneme". Sessiz: ajansın oturumu bunu görmez | Sınır yalnız BAŞARISIZ okumayı + her kararı sayıyor; onay sayfası iç adresten (`INTERNAL_API_URL`) istemci IP'sini `X-Forwarded-For` son elemanıyla iletiyor (`trust proxy 1` onu okuyor) | service spec "GEÇERLİ token okuması sayılmaz" + sayfa taraması (M1, M2, M10) |
| A1 | **Önerinin bölümleri kaydedilemiyordu.** Panel yalnız `kaynak: 'ajans'` bölümleri gönderiyordu; "Strateji öner" uygulanınca gövde boş → 400 "En az bir bölüm"; silinen bölüm hiç gönderilmiyordu | `bolumKayitGovdesi` (kayıtlıdan FARK: değişen, silinen = null, `ai` aynen) | hesap.spec (M7, M8) |
| A2 | Mail reddi `ret.join` ile "[object Object]" yazıyordu; mailin açtığı yeni bağlantı eskisini iptal ediyor ama liste tazelenmiyordu | Sebepli satır + liste tazeleme | sayfa taraması (M9) |
| G2 | Gönderimde bağlantı PDF'ten ÖNCE açılıyordu: PDF düşerse müşterinin elindeki çalışan bağlantı iptal, yenisi hiç gönderilmemiş | PDF önce | service spec (M12) |
| G3 | İki `catch { siteYok = null }` TRANSACTION İÇİNDE: Postgres düşen sorgudan sonra tx'i iptal ediyor, gerçek sebep yutulup sonraki sorgu "transaction is aborted" veriyordu | catch kaldırıldı | — (davranış hatayı yüzeye çıkarmak) |

Ek testler (hepsi mutasyonla): eski sürümün açık bağlantısı yeniden onaya
gönderimden sonra karar yazamaz; karar yarışı (araya giren tüketim → 0 satır,
plan yazılmaz; M3); başka workspace'in planı/kalemi/bağlantısı kimlikle
okunamaz, aktarılamaz, iptal edilemez (M4); `deneme` amaç ajans yöneticisi
olmayana sunucuda aktarılmaz (M5); rehberde kullanıcı değiştirince alan
`kullanici` olur, dokunulmayan `strateji` kalır. Shared mutasyonu (onaylanan
sürüm kontrolü, tsc ile derle → test → geri al → derle) `sozlesme-v2.spec.ts`te
yakalandı.

### Kontrol edilip temiz bulunanlar

Token 256 bit, DB'de SHA-256, biçimsiz token sorgu harcatmıyor, bulunamadı /
iptal / süresi doldu aynı 404; karar `FOR UPDATE OF b, p` + iki koşullu UPDATE;
sürüm bağı hem `baglantiHali`nde hem SQL'de; XSS: panel ve onay sayfası React
kaçışıyla, `dangerouslySetInnerHTML` yok, mail `kacis` + `imzaTemizle`, PDF
metin çizimi; RLS dört tablo `SET ROLE` + `RETURNING` ile; "tüm şirketler"
modunda `org_id` hedef workspace'ten (plan, kalem, rehber); migration CHECK'leri
`IS NOT NULL`/`IS NOT DISTINCT FROM`, eski satırlar `bicim = 1`, üretim sırası
testi yeşil; platform çağrıları (ölçüm, rehber hazırlığı) transaction DIŞINDA.

### Açık (kapıyı tutan)

- **AÇIK-1 (Ajan 3):** v2'de kelime araması ekranı YOK. Uçlar var ama panel
  çağırmıyor; kalem düzenleyici "Bu stratejide kelime araması yapılmadı" diyor
  ve araması için bir yol göstermiyor. Onaylanan taslakta kalemde kelime
  çipleri var. Sonuç: Google Arama kalemi kelimesiz aktarılıyor, rehber
  kelimeyi eksik olarak soruyor (sessiz değil, ama tasarlanan akış eksik).
  v1'in `arama-bolumu.tsx`i uç adresi parametreleştirilerek v2 detayıyla
  kullanılabilir (aynı `kelimeler` şekli); yoklama da gerekir.

### Ölçülmedi

Gerçek eşzamanlı iki karar (PGlite tek bağlantı; yarış araya girerek
sınandı); sunucudaki Nginx'in `X-Forwarded-For` ayarı ve `INTERNAL_API_URL`
(yoksa okuma ortak IP'ye düşer ama G1'in birinci yarısı yine korur);
üretimde `APP_URL`/`CORS_ORIGINS` değerleri; `next build` dışında tarayıcıda
onay sayfası; PDF'te uzun tutarın tablo hücresinde kırpılması (ortak `tablo()`
çizicisinden geliyor, strateji PDF'ine özel test yok).

---

## 9.9 Adım adım akış (Ajan 3 + küçük Ajan 2 eklemeleri, 2026-10-13)

Kullanıcı sekmeli v2 ekranını (düzenleyici / belge / aktarım) *"çok karışık ve
tasarım açısından çok kötü"* buldu; onaylanan taslak `simulasyon.html`
(tıklanabilir prototip). Panel o akışa çevrildi.

### Yapıldı

| Parça | Dosya |
|---|---|
| Sözleşme | `packages/shared/src/strateji/v2/sihirbaz.ts` (yedi adım, sihirbaz durumu şeması, `oncelikPaylari`, `amacGunlukAsgari` TEK kural, `sihirbazButceKontrolu`, inceleme parçaları, imza); `adresler.ts`: üç görünüm KALKTI → `STRATEJI_EKRANLARI` + `stratejiEkranKapisi` + `eskiGorunumEkrani`; `stratejiPanelAdresi` `adim/kalem/amaclar` taşıyor; dört yeni uç |
| Migration | `20261019100000_advstrategy_sihirbaz` — `strateji_planlari.sihirbaz JSONB` (NULL'lı; kısıt/RLS değişikliği yok) |
| Motor | `secimliMotor` (seçilen hedefler sırasıyla, öncelik bölmesi, kurulamayan hedef NEDENİYLE "plana alınmadı"), `amacPlatformlari` (hedef kartının kapısı = motorun kapısı), `kalemKur`: iki platformun payı da asgari altındaysa bütçenin tamamı asgarisi karşılanan platforma |
| Servis/uçlar | `GET sihirbaz-girdileri` (plan doğmadan), `PUT planlar/:id/sihirbaz` (sürüm; bütçe/dönem değişince kayıtlı kalemler silinir; onaylanan kitle → belge "Kitle" bölümü, `ajans`), `POST planlar/:id/kitle-oner` (YAZMAZ), `GET planlar/:id/inceleme/:parca` (tek satır, gerçek okuma); `oner` sihirbaz durumunu okuyor; `POST planlar` ilk durumu aynı istekte alıyor; `onayla` ajans rolünde yalnız ajans yöneticisi |
| Panel | `page.tsx` ekran kapısıyla; `giris.tsx` (iki kart + strateji listesi), `sihirbaz.tsx` + `akis-cerceve.tsx` + `adimlar-soru.tsx` (Hedef, Bütçe, Bölge, Kime) + `adim-inceleme.tsx` + `adim-plan.tsx` + `adim-gonder.tsx`, `rapor-ekrani.tsx`, `kurulum.tsx` (tek tek); saf kararlar `akis.ts` (+ `akis.spec.ts`). Silinen: `duzenleyici.tsx`, `gorunumler.tsx`, `aktarim.tsx`, `plan-secici.tsx`. `kalem-duzenleyici.tsx` sadeleşti (amaç ve kitle yok) |

### Taslaktan sapmalar

1. **Plan bütçe adımında doğuyor.** Oluşturma toplam bütçe istiyor; hedef adımında kaydedilecek plan yok. Hedef seçimi plan doğana kadar adreste (`?amaclar=`), bütçenin "Devam"ında AYNI istekte plana yazılıyor. Hedef/bütçe adımında "Kaydet ve çık" yerine "Çık" (bütçe geçerliyse plan açılıp kaydedilir).
2. **Bütçe bölmesi bir kural, örnekteki oranlar değil.** Taslaktaki `.55/.3` örnekti; gerçek kural öncelik ağırlığı (n…1), "Advetics kuralı" diye yazılıyor ve bütçe adımı ile motor aynı fonksiyonu kullanıyor. Asgari: Meta hesaptan okunan, Google Arama sınırsız, Talep Yaratma 5 USD karşılığı; okunamazsa "kontrol edilemedi" ve ilerler.
3. **Kaydırıcı aralığı** arayüz denetimi (1.000 ₺ - en az 1.000.000 ₺, yazılan tutarla büyür); taslaktaki 15.000-600.000 örnekti.
4. **"Planı onayla" yapay zekâ metinlerini kabul ediyor** (özet, işletme, kreatif ve kalem yönergeleri `ajans` olur). Taslakta bu metinler görünmüyordu; Plan adımına "Rapordaki metinler" kutusu eklendi ki kullanıcı onayladığını görsün. Kabul edilmemiş öneri belgeye girmiyordu ve onaysız belge boş özetle giderdi.
5. **İnceleme bir kez koşar.** Plan'dan "Geri" ile dönülürse ve girdiler değişmediyse (imza `incelenen`) yeniden koşmaz; "Yeniden incele" bilerek koşar. İncelemenin notları (`notlar`, "plana alınmadı") sihirbaz durumunda saklanıyor: öneri yanıtı yazılmıyordu ve sayfa yenilenince kaybolurdu.
6. **"Müşteriye gönder" kartında alıcı kutusu** (boş = kayıtlı rapor alıcıları); taslakta sabit bir adres vardı ve panel o adresi bilmiyor. Gönderim düşerse strateji onayda kalır ve rapor ekranında onay bağlantısı paneli açılır.
7. **"Müşteri adına onayla" ikinci tıklamayla** ("Onayladım, kuruluma geç").
8. **Rapor ekranında ajans eylemleri:** taslakta "Düzenle", onaydaysa "Geri çek ve düzenle" + onay bağlantısı paneli; onaylıysa "Kampanyaları kur".

### Bulunan ve düzeltilen

- **`bolumleriOku` testte HER ZAMAN `{}` dönüyordu.** `z.record(z.string(), kaynakliMetinSchema)`: API'nin `zod`u (vite ESM) ile shared dist'inin `zod`u (CJS) testte iki kopya; `z.record` ikinci argümanın kendi `ZodType`ı olduğunu `instanceof` ile anlayamayınca ilk argümanı değer şeması sanıyor ve her bölüm "string bekleniyor" diye düşüyor. Hiçbir test bölüm okumasını sınamıyordu. Üretimde (CJS tek kopya) muhtemelen çalışıyordu, ÖLÇÜLMEDİ. Bölümler artık tek tek shared şemasıyla doğrulanıyor.

### Ölçülmedi

- **Ekran tarayıcıda GÖRÜLMEDİ** (worktree'de `.env`, API ve veritabanı yok). `next build` temiz. Ajan 6 denetimi (masaüstü + mobil ekran görüntüsü) bekliyor.
- `sihirbaz-girdileri` Meta asgarisini platformdan okuyor (rehber hazırlığı): adım açılışında süresi ölçülmedi.
- `history.pushState` ile istemci geçişi Next 15'te `useSearchParams` kullanan başka bileşenleri etkilemiyor varsayıldı (sayfada yok).
- Kitle tarifi yapay zekâ çağrısı canlıda; "Yeniden yaz"ın farklı tarif ürettiği ölçülmedi.
