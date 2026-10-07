# AdvStrategy — ajanlara bölünmüş geliştirme planı

> **Tarih:** 2026-10-08 · **Girdi:** kullanıcının "Strateji ve Planlama Modülü" brief'i
> (5 bileşen), "Modül Geliştirme Yaşam Döngüsü" görseli (5 aşama), `CLAUDE.md`,
> [`advcampaign/arastirma/A1-google-ads-api.md`](../advcampaign/arastirma/A1-google-ads-api.md).
> **Kapsam:** Meta Ads ve Google Ads. LinkedIn bu modülde YOK (kullanıcı: "google ads ve meta ads
> için aktif olacak").
> **Bu belgede kod yok.** Ajanların ne üreteceğini, kime devredeceğini ve neyin kapı olduğunu yazar.

**Modülün işi (brief'ten):** "Gelecek ay ne yapacağız?" sorusunun cevabı. Bütçe dağılımı, Google
arama kurgusu, kitle × kreatif matrisi ve sezon uyarıları tek bir **aylık medya planında**
birleşir. Müşteri onaylayınca plan AdvCampaign'e taşınır.

---

## 0. Ajanlara bölmeden önce: brief'te bu depoyla çelişen beş yer

Ajanlar işe başlamadan bunlar kapanmalı. **2026-10-08 kullanıcı kararı: beşi de öneri
sütunundaki gibi kapandı** (Ç-1 Advetics logosu, Ç-2 AdvCampaign'e taslak, Ç-5 PDF + panel içi
onay; Ç-3 ve Ç-4 öneri olarak kabul).

| # | Brief diyor | Depo gerçeği | Öneri |
|---|---|---|---|
| Ç-1 | "Ajans logolu PDF" | `CLAUDE.md`: müşteriye giden belgede **Advetics logosu** basılıyor (bilinçli karar) | **Kullanıcı kararı.** Varsayılan: rapordaki kuralın aynısı (Advetics). |
| Ç-2 | "Tek tıkla Google ve Meta'da taslak **API üzerinden kurulsun**" | Reklam kurmanın TEK yolu AdvCampaign; platforma yazma onay kartı + prova ile. Google yazma yolu canlıda hiç denenmedi, `ac` kapısı kapalı. | Plan platforma YAZMAZ; AdvCampaign'de **hazır doldurulmuş oturumlar** açar. Yazma, onay ve prova AdvCampaign'de kalır. İkinci bir yazma yolu doğduğu anda ayrışır. |
| Ç-3 | "Google Keyword Planner API" | `KeywordPlanIdeaService` **Explorer erişiminde yasak**, Basic istiyor, sınırı 1 QPS. Projenin gerçek erişim seviyesi canlıda hiç ölçülmedi (A1 §11.2). | Arama bileşeni bir **ölçüm kapısının** arkasında. İlk iş, gerçek bir çağrıyla seviyeyi ölçmek. Yasaksa bileşen açıkça "erişim yok" der, uydurma hacim göstermez. |
| Ç-4 | "Sektörel benchmark", "Anneler Günü'nde TBM'nin %30 artması bekleniyor", "Google Trends" | Depoda sektör benchmark verisi YOK. Google Trends'in genel kullanıma açık resmî API'si yok. | Tahmin YALNIZ **kendi verimizden**: aynı hesabın geçen yıl aynı haftası (`insights_daily`). Veri yoksa "geçmiş veri yok" yazar, yüzde uydurmaz. Özel günler elle tutulan bir takvim tablosundan gelir, kaynağı yazılır. |
| Ç-5 | "Linkle müşteriye onaya sunulması" | Panelde oturumsuz açılan bir sayfa yok. Bu, kimlik doğrulaması olmayan **ilk dış yüzey** olur. | **Kullanıcı kararı.** Varsayılan: MVP'de yalnız PDF ve panel içi onay (`client_viewer` rolü). Tokenlı dış bağlantı Faz 2'de, ayrı güvenlik incelemesiyle. |

---

## 1. Beş ajan — görseldeki aşamaların bu projeye uyarlanmış hâli

Görseldeki araçların bir kısmı bu depoda yok ve olmamalı: Docker/Kubernetes yok (paylaşımlı VPS +
pm2), GitHub Actions kullanıcı kararıyla kapalı (2026-10-06), Java/Go yok (NestJS + Next.js).
Uyarlama aşağıda her ajanın "araçlar" satırında.

```
 Ajan 1 Mimar ──► SÖZLEŞME KAPISI ──┬──► Ajan 2 Arka Plan ──┐
                                    │                         ├──► Ajan 4 Test & Güvenlik ──► Ajan 5 Canlıya Alma
                                    └──► Ajan 3 Ön Yüz ───────┘        (sürekli + kapı)
```

Ajan 2 ve 3 **aynı sözleşmeden paralel** çalışır. Ajan 4 iki ajanın her teslimini sınar, kapıyı o
açar. Ajan 5 tek kişi, tek seferde, elle deploy (`CLAUDE.md` §1).

### Ajan 1 — Mimar (Yazılım Mimarı · Tech Lead)

**Kilit çıktı:** API sözleşmesi ve veri modeli. Kod olarak `packages/shared/src/strateji/`
(Zod şemaları + tipler), belge olarak `docs/advstrategy/MIMARI.md`.

**Araçlar:** Zod, Prisma şeması (taslak), mevcut modüllerin okunması. OpenAPI yok, sözleşme shared.

**Görevler:**
1. **Veri modeli.** Önerilen tablolar (hepsi `client_id` taşır):
   - `strateji_planlari`: dönem (`YYYY-MM` string), durum (`taslak → onayda → onaylandi →
     aktarildi`, **iptal** son durumu dahil), toplam bütçe (micros), para birimi, sürüm.
   - `strateji_dagilimlari`: platform × huni katmanı (soğuk / sıcak / yeniden pazarlama), tutar,
     **kaynak** (`gecmis_veri` | `elle`), gerekçe metni.
   - `strateji_kelimeleri`: kelime, aylık hacim, rekabet, teklif aralığı, önerilen grup,
     **çekim zamanı**, kaynak çağrı.
   - `strateji_matrisi`: kitle şablonu (`audience_templates`) × varlık (`assets`) × platform × bütçe.
   - `ozel_gunler`: sektör × tarih × ad, **kaynak** sütunu. Elle tutulur, müşteriye bağlı değil.
2. **Her tablo için üç durak** (`CLAUDE.md` §3): `pglite-harness` TRUNCATE listesi, `02_rls.sql`
   politikaları, `WORKSPACE_TABLOLARI` kararı. Durum enum'u eklenecekse **ayrı migration**.
3. **Durum makinesi:** her durumdan çıkışı kimin yazdığı (kısmi indeks varsa son durum şart).
4. **Uç listesi:** `GET/POST /strateji/planlar`, `POST .../dagilim-oner`, `POST .../kelime-ara`,
   `POST .../onaya-gonder`, `POST .../aktar`, `GET .../pdf`. Her uç için yetki anahtarı.
5. **Yetki kararı:** yeni bir `strategy.*` izni mi, mevcut bir izin mi? `nav-sections.spec.ts`
   sayfa kapısıyla menü izninin aynı olmasını istiyor.
6. **Ölçüm listesi** Ajan 5'e: Keyword Planner erişim seviyesi, `GenerateKeywordForecastMetrics`
   alanları (v24'te değişti), Meta `reachestimate` ile ülke bazlı kitle büyüklüğü.

**Kapı (Sözleşme Kapısı):** shared derlemesi ÇIKTISIYLA temiz ve `MIMARI.md` beş çelişkinin
kararını (yukarıdaki tablo) sözleşmeye işlemiş.

### Ajan 2 — Arka Plan (Backend · Veri Mühendisi)

**Kilit çıktı:** `apps/api/src/modules/strateji/` (iş mantığı ve REST uçları) + migration'lar.

**Araçlar:** NestJS 11, Prisma (`withTenant`), `$queryRaw` + `Prisma.sql`, BullMQ, `pdf-lib`
(`pdf-cizim.ts` yeniden kullanılır), vitest + PGlite.

**Görevler (brief bileşenlerine göre):**
1. **Bütçe dağılımı (bileşen 1).** Geçmiş 90 günün `insights_daily` verisinden platform başına
   sonuç başı maliyet ve pay. Öneri **gerekçesiyle** dönüyor ("son 90 günde dönüşümlerin %68'i
   Meta'dan"). Geçmişi olmayan workspace'te öneri YOK, eşit dağılım uydurulmaz: `emptyReason`.
   Para micros/BigInt. Kur farkı varsa toplam üretilmez (karışık para birimi kuralı).
2. **Arama kurgusu (bileşen 2).** `google.provider.ts`'e `kelimeFikirleri()` ve `kelimeTahmini()`.
   1 QPS için kuyruk. Sonuçlar `strateji_kelimeleri`'ne çekim zamanıyla yazılır, ekran ham API'yi
   değil tabloyu okur. Gruplama önce **kurala dayalı** (ortak kök + hacim eşiği `ARAMA_HACMI_ESIGI`,
   AdvCampaign K-06 ile aynı sabit). Gemini yalnız grup ADI önerir, hacim üretmez.
3. **Matris (bileşen 3).** Kitle şablonu ve varlık kimliklerini doğrular (başka workspace'in
   şablonu seçilemez: RLS + servis kontrolü). Satır bütçeleri toplamı, platform bütçesini aşamaz.
4. **Sezon (bileşen 4).** `ozel_gunler` + aynı hesabın geçen yıl aynı haftasındaki TBM değişimi.
   Geçmiş yoksa yüzde YOK. Uyarı metni sayının nereden geldiğini yazar.
5. **PDF (bileşen 5a).** Rapor PDF'inin kuralları aynen: gömülü DejaVu, panel referans görünüm,
   tek `tablo()` çizici, Türkçe karakter testi.
6. **Aktarım (bileşen 5b).** Onaylı plan → AdvCampaign'de platform × satır başına **hazır
   doldurulmuş oturum**. Platforma çağrı YOK (Ç-2). Aktarılan satır sayısı ve atlananların nedeni
   döner.
7. **Kurallar:** platform çağrısı transaction'ın içinde olamaz; `PlatformApiError` filtrede kendi
   dalında; Meta insights'a atıf ayarları açıkça yazılır.

**Teslim:** Uçlar sözleşmeyle aynı şemayı döndürür, API typecheck temiz, yeni testler mutasyonla
doğrulanmış.

### Ajan 3 — Ön Yüz (Frontend · Design System)

**Kilit çıktı:** `/strateji` sayfası ve kenar çubuğunda **AdvStrategy** satırı (AdvCampaign'in
yanında, aynı bölümde).

**Araçlar:** Next.js 15 App Router (sunucu bileşeni + gereken yerde istemci), Tailwind, panel
tasarım katmanı (`globals.css` → `.panel`), `lib/baglanti.ts`.

**Görevler:**
1. **Tek sayfa, iç menü** (Marka Merkezi deseni): `?bolum=butce|arama|matris|takvim|sunum`.
   Bölümleri ayrı sayfaya bölme: ayrılık bu projede iki kez hata üretti.
2. **Menü ve başlık aynı ad:** "AdvStrategy", hem `nav-sections.ts`'te hem sayfanın
   `metadata.title`'ında. Menü izni sayfa kapısıyla aynı anahtar.
3. **Dört hâl ayrı yazılır:** henüz istenmedi / yükleniyor / sonuç yok (nedeniyle) / çağrı düştü
   (platform mesajıyla). `.catch(() => setX([]))` yasak.
4. **Kelime tablosu** çekim zamanını ve kaynağı gösterir. Erişim yoksa bölüm "Google Keyword
   Planner bu hesapta açık değil" der, boş tablo göstermez.
5. **Matris** tablo olarak: Kitle → Kreatif → Platform → Bütçe. Satır toplamı ile platform
   bütçesi farkı her an görünür. Klavyeyle düzenlenebilir.
6. **Sunum:** PDF önizleme, PDF ile aynı sorgu üreticisinden (rapordaki "üç tüketici" hatası).
7. **Metin dili:** kısa, sade, uzun tire yok. Kısaltmalar sözlükten (`terimler.ts`).

**Teslim:** Panel typecheck temiz, `nav-sections.spec.ts` ve `panel-tasarim.spec.ts` yeşil,
mobilde yatay kaydırma yok.

### Ajan 4 — Test & Güvenlik (QA · Güvenlik Mühendisi)

**Kilit çıktı:** Test raporu ve güvenlik taraması. Kapıyı bu ajan açar.

**Araçlar:** vitest + PGlite (gerçek Postgres), `SET ROLE` ile RLS sınaması, kaynak taramaları,
mutasyon disiplini, `/security-review`. Selenium/JMeter yok; yük için `olcum-rapor.ts` deseni.

**Görevler:**
1. **RLS:** her yeni tablo için `SET ROLE` testi, `RETURNING` ile ETKİLENEN SATIR sayılır
   (sıfır satırlık UPDATE politikasız da başarılı döner).
2. **İzolasyon:** A workspace'i B'nin kitle şablonunu, varlığını, planını göremez ve aktaramaz.
   "Tüm şirketler" modunda `org_id` hedef müşteriden okunur.
3. **Para:** micros zinciri, kırpma yok, karışık para biriminde toplam yok.
4. **Sessiz hata taraması:** boş öneri nedenini söylüyor mu, kelime çağrısı düştüğünde ekran
   platform mesajını gösteriyor mu, aktarımda atlanan satır sayılıyor mu.
5. **Kaynak taramaları:** `Prisma.sql` yorumunda backtick ve interpolasyon yok, menü/başlık adı,
   PDF sorgu üreticisi tek.
6. **Mutasyon:** her KRİTİK test kodu bozarak doğrulanır, test sayısı okunur.
7. **Ç-5 kabul edilirse** tokenlı bağlantı için ayrı inceleme: tahmin edilemez token, süre, iptal,
   salt okunur, oran sınırlama.

**Kapı:** API ve panel paketleri yeşil (API paketi tek başına koşulur), typecheck temiz,
güvenlik bulgusu açık değil.

### Ajan 5 — Canlıya Alma & İzleme (Sunucu sorumlusu)

**Kilit çıktı:** Doğrulanmış deploy ve canlı ölçüm sonuçları. Docker/K8s/CI yok: deploy elle,
`advetics` kullanıcısıyla, `./scripts/deploy.sh`.

**Görevler:**
1. **Migration sırası:** üretim sırasını elle kur (önceki migration'lar → `01_constraints.sql` →
   eski veri → yeni migration). Enum değeri ayrı dosyada. Push'tan hemen önce pull.
2. **Canlı ölçüm (Ajan 1'in listesi):** Keyword Planner erişim seviyesi (Profaj'ın kendi hesabında),
   tahmin alanları, Meta `reachestimate`. Sonuçlar `CLAUDE.md` "Canlıda öğrenilen platform
   gerçekleri"ne tarihli satır olarak.
3. **İzleme:** kelime çekimi `sync_jobs`'a satır yazar, `succeeded + rows = 0` hata sayılır,
   kota bekçisi kelime işini ayrı katmanda tutar.
4. **Devir:** `DEVAM.md` (biten, sıradaki, bekleyen karar, deploy durumu) ve `DURUM.md` girdisi,
   işin kendi commit'inde.
5. **Sınır:** sunucuda yalnız `/home/advetics/**`; sistem geneli hiçbir şey; eksik bileşen varsa
   bildir ve dur.

---

## 2. İş paketleri ve sahipleri

| Faz | Paket | Sahip | Bağımlılık |
|---|---|---|---|
| 0 | Ç-1…Ç-5 kararları | Kullanıcı | **Kapandı (2026-10-08)** |
| 0 | Keyword Planner erişim ölçümü (tek çağrı, yazmasız) | Ajan 5 | — (hemen yapılabilir) |
| 1 | Sözleşme + veri modeli | Ajan 1 | Faz 0 |
| 1 | Menü satırı + boş durum ekranı ("plan yok, ilk planı oluştur") | Ajan 3 | Sözleşme |
| 1 | Plan CRUD + bütçe dağılımı (geçmiş veriden) | Ajan 2 | Sözleşme |
| 1 | Bütçe bölümü ekranı | Ajan 3 | Sözleşme |
| 1 | Matris (servis + ekran) | Ajan 2 + 3 | Sözleşme |
| 1 | PDF medya planı | Ajan 2 | Bütçe + matris |
| 1 | Aktarım → AdvCampaign oturumları | Ajan 2 | AdvCampaign canlı turu |
| 2 | Kelime fikirleri + tahmin + gruplama | Ajan 2 + 3 | Erişim ölçümü olumlu |
| 2 | Tokenlı onay bağlantısı | Ajan 2 + 3 + 4 | Ç-5 |
| 3 | Özel gün takvimi + geçen yıl kıyası | Ajan 2 + 3 | 12 aylık veri olan hesap |
| her faz | Test, güvenlik, kapı | Ajan 4 | Her teslim |
| her faz | Deploy + ölçüm + devir | Ajan 5 | Kapı |

**Faz 1 tek başına değer üretiyor:** bütçe dağılımı + matris + PDF, ajansın bugün elle yaptığı
"gelecek ay medya planı"nı panelden çıkarır. Arama ve sezon bileşenleri, verisi kanıtlanınca gelir.

---

## 3. Ajanlar arası kurallar

- **Sözleşme tek yerde:** `packages/shared/src/strateji/`. Ajan 2 ve 3 tip tanımlamaz, oradan
  okur. Shared değişince derleme ÇIKTISIYLA koşulur.
- **Devir notu:** her ajan teslimde ne yaptığını, neyi ölçmediğini ve açık kalanı yazar. "200
  döndü" doğrulama sayılmaz.
- **Ajan 4 bulgusu kapıyı kapatır;** düzeltmeyi bulguyu üreten ajan yapar.
- **İki geliştirici kuralı:** push'tan önce `git pull --rebase`, force push yok, deploy öncesi
  haber.
