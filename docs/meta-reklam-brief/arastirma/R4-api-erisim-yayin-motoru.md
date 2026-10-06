# R4 — Meta API erişimi, yayın motoru ve canlı doğrulama yolu (teknik)

> **Yöntem:** Önce depodaki `README.md`, `bolumler/01` (yetki, hız sınırı, hata kodları, Ads MCP/CLI),
> `bolumler/09` (Business Manager, izin katmanları), `bolumler/00` (bugünkü kod) ve ilgili ham sayfalar
> (`kaynak/`: authorization, authentication, best-practices, rate-limiting, asyncrequests, advideos,
> ads-webhooks, post-processing, adlabel, ad-activity, ads-volume, ad/adset/campaign/adcreative
> referansları) okundu. Sonra Meta'nın belge araması (Meta Social Technologies MCP `devtools_discovery`)
> ve web ile **v26.0 değişiklik günlüğü, Facebook Login for Business, Tech Provider / erişim doğrulaması,
> App Review rehberi, sandbox, test kullanıcıları, video yükleme, batch, webhook teslim semantiği,
> read-after-write, hız sınırı başlıkları, geliştirici politikası 10.5/10.6** okundu. Endüstri için Meta'nın
> kendi Ads MCP araç tanımları (yalnızca tanım okundu, araç ÇAĞRILMADI), resmî Python SDK kodu, Airbyte'ın
> Facebook bağlayıcısı (2026-09) ve iki topluluk CLI'ı incelendi. Son olarak Advetics uygulamasının
> durumu Meta Social Technologies MCP'nin **salt-okuma** araçlarıyla sorgulandı (`app_list`, `app_review`
> status/privileges/requirements/history, `compliance`, `api_usage`); hiçbir yazma/değiştirme çağrısı
> yapılmadı. Toplam **~60 kaynak**, tarih aralığı 2017–2026-10-06 (eski olanlar ayrıca işaretli).
>
> **Güvenilirlik özeti:** Bulguların büyük çoğunluğu **[Resmî-Meta]**; Meta'nın canlı araçlarından okunan
> durum **[Resmî-Meta · canlı okuma]**, Ads MCP araç şemaları **[Resmî-Meta · canlı şema]** diye ayrı
> işaretli. Endüstri pratiği için **[Sektör]** (Airbyte, sektör yayını) ve **[Topluluk]** (açık kaynak
> CLI'lar) kullanıldı; bunlar yalnızca "başkaları nasıl yapıyor" sorusuna cevap, Meta kuralı değil.
> **Meta'nın kendi sayfaları dört konuda birbiriyle çelişiyor** (sandbox, sürüm tablosu, otomatik sürüm
> yükseltme, `synchronous_ad_review`'ın kapsamı) — ikisi de yazıldı, birleştirilmedi. Yayın motoruna dair
> her şey **belgeden**; Advetics'in Meta'ya yazan hiçbir yolu canlıda doğrulanmadı.

---

## Özet: yeni modül için ne demek (en önemli 12 madde)

1. **Başvuru ZATEN yapılmış ve incelemede — depodaki "başvurulmadı" bilgisi bayat.** Meta'nın salt-okuma
   aracı 2026-10-01 22:23 UTC tarihli bekleyen bir App Review başvurusu gösteriyor: `ads_management`,
   `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`,
   "Marketing API Access Tier", `ads_mcp_management`, `catalog_management`, `read_insights` dahil.
   Business Verification **geçiyor**. Ama aynı araç bu izinlerin çoğunda **"ekran kaydı" ve "API ön
   kontrolü" adımlarını tamamlanmamış** gösteriyor; Meta'nın rehberine göre ekran kaydı olmayan izin
   onaylanmıyor ve "ileride lazım olacak" izin istemek ret sebebi. `DURUM.md` §6 ve `DEVAM.md` bunu
   bilmiyor — iki geliştirici arasında bilgi kopukluğu. [47][16][17]
2. **Üretime çıkmak için üç AYRI kapı var ve biri unutulursa hata yanıltıcı:** (a) izin başına Advanced
   Access (App Review + Business Verification), (b) Marketing API Access Tier = Full (App Review + son
   15 günde ≥500 başarılı çağrı + son 500 çağrıda <%15 hata; **korumak için de** gerekli), (c) Tech
   Provider erişim doğrulaması. (c) eksikse rolsüz kullanıcının çağrısı **hata 100 "nesne yok"** ile
   düşüyor — "silinmiş" sanılır, sessiz yanlış teşhis. [1][9][11][12]
3. **Canlı doğrulama turu App Review'u beklemek zorunda değil.** Standard Access, uygulamada rolü olan
   kişilerin (admin/geliştirici/test kullanıcısı) çağrılarına açık; Limited katman da "uygulama
   admin/geliştiricileri hesap adına çağrı yapabilir" diyor ve kendi hesabını yöneten uygulama için
   Standard yeterli. Yani ajansın KENDİ reklam hesabında tur bugün koşulabilir; koşulması App Review'un
   "her izin için 30 gün içinde ≥1 başarılı çağrı" ön koşulunu da karşılar. [1][9][16]
4. **Kimlik modeli değişmeli:** bugünkü kod ajans çalışanının **60 günlük kişisel kullanıcı token'ını**
   kullanıyor (çalışan ayrılırsa / şifre değişirse 481 hesabın hepsi düşer). Meta'nın önerisi
   sunucudan sunucuya iş için **sistem kullanıcısı token'ı** (süresiz, kişiye bağlı değil — Meta'nın
   kendi Ads CLI'ı YALNIZCA bunu kabul ediyor); müşterinin kendi bağlantısı için **Facebook Login for
   Business + business integration system user (BISU) token'ı** (müşterinin seçtiği varlıklarla sınırlı,
   varsayılan süresiz, müşteri kendi panelinden kaldırabilir). [3][13][59]
5. **v26.0 (2026-07-29) çıktı; brief "güncel v25" diyor.** En acil sonuç: **2026-10-27'den itibaren BÜTÜN
   sürümlerde kök `GET /?ids=` isteği HATA döndürecek** ve ETag/304 kalkıyor. Advetics'te iki kök
   `?ids=` çağrısı var (rapor PDF'inin kreatif görsel tazelemesi, boost'un kampanya özeti) — 21 gün kaldı;
   kırılırsa hata oranı %15 eşiğini de tehdit eder. Ayrıca `delivery_estimate`'in günlük sonuç eğrisi
   (`daily_outcomes_curve`, `estimate_dau`, `budget_guardrail`) aynı tarihte kalkıyor (yerine bir şey yok).
   [21][22][47]
6. **Para harcamadan doğrulamanın güvenilir yolu "validate_only + PAUSED kur → geri oku → arşivle".**
   Sandbox konusunda Meta'nın üç sayfası birbiriyle çelişiyor (bir sayfa "reklam/kreatif oluşturulamaz",
   bir blog "Marketing API'nin bir alt kümesi, insights yok", kurulum sayfası "reklam oluşturmayı ve
   sahte rapor üretmeyi test et" diyor) ve **test kullanıcısı oluşturma 2026-04'ten beri geçici olarak
   kapalı**. Sandbox'a yaslanan bir plan kurulmamalı; önce ölçülmeli. [4][5][6][7][8]
7. **`synchronous_ad_review` yalnızca REKLAM ucunda var** (kampanya/ad set'te `validate_only` +
   `include_recommendations`, kreatifte yalnız `validate_only`). README §3c "dört uçta" diyor — düzeltilmeli.
   Ad set doğrulaması gerçek bir `campaign_id` ya da satır içi `campaign_spec`, reklam doğrulaması
   `adset_id` ya da satır içi `adset_spec` istiyor; tüm ağacı TEK provada doğrulamak belgeye göre mümkün
   görünüyor ama örnek yok → canlıda ölç. [27][28]
8. **Marketing API'de idempotency anahtarı YOK** (Meta'nın resmî SDK'sında da, kendi Ads MCP'sinde de
   yok). Mükerrer kampanyayı önleyecek tek şey Advetics'in kendi **niyet kaydı** + her nesneye yayın
   başına **`adlabels` etiketi** + "sonuç belirsiz" durumunda **önce etiketle ara (`campaignsbylabels`),
   sonra tekrar dene**. Etiket, oluşturma çağrısına adıyla satır içi verilebiliyor (yoksa Meta yaratıyor).
   [29][33][46][48]
9. **read-after-write tuzağı:** oluşturma çağrısına `fields=` eklenirse ve OKUMA kısmı düşerse (ör. yanlış
   alan adı) Graph standart bir hata döndürüyor — yazmanın geri alındığını söylemiyor. Bu, "hata aldık,
   tekrar dene" ile **ikinci kampanya** demek. Oluşturmada `fields` gönderilmez; geri okuma ayrı GET. [31]
10. **Hız sınırı hesap+uygulama başına, ama insights sınırı UYGULAMA genelinde** — bir müşterinin ağır
    raporu bütün müşterilerin raporunu kısar. Kota başlıkları **hata yanıtında da** okunmalı;
    `17/2446079` `is_transient:false` gelmesine rağmen dakikalardan bir saate kadar süren GEÇİCİ bir
    blok (Airbyte bunu 2026-09'da üretimde yaşadı). Yayın ile senkronizasyon aynı hesap kotasını
    paylaşıyor → yayına öncelik. [2][32][49][50]
11. **Video için yeni, kaldığı yerden devam edebilen yükleme yolu var** (`/act_{id}/video_ads` +
    `rupload.facebook.com`; belge sayfası 2026-05-21 güncel); `video_status=ready` olmadan kreatifte kullanılmıyor; video kreatifi
    küçük resim (thumbnail) istiyor. "Sistem kullanıcısıyla işletme hesabına video yükleme henüz yok"
    notu belirsiz → canlıda ölç. [35][46]
12. **Yayın sonrası webhook tetikleyicidir, kaynak değil:** `effective_status` bildirimi yeni değeri
    taşımıyor ve `field_changed` adıyla geliyor; teslim 36 saate kadar tekrar deneniyor, mükerrer
    gelebilir. Hesaba abonelik o hesabın **admin token'ını** istiyor — ajansın yalnız ADVERTISE görevi
    olan müşteri hesaplarında webhook kurulamayabilir → **yoklama yedeği şart**. İnceleme çoğunlukla 24
    saatte bitiyor ama yayından sonra da tekrar inceleme olabiliyor. Politika tarafında: her son
    reklamveren **ayrı reklam hesabında** olmalı (10.5) ve 2027-02-03'ten itibaren reklamveren isterse
    harcama/ücret ve kampanya ayarları **Meta terimleriyle** açıklanmalı (10.6.a). [38][39][45][20]

---

## Bulgular

### 1. Erişim yolu

#### 1.1 Üç ayrı kapı (+ bir yıllık bakım)

| Kapı | Ne açar | Nasıl alınır | Korunması | Kaynak |
|---|---|---|---|---|
| **İzin erişim seviyesi** (Standard → Advanced) | Standard: izin yalnızca uygulamada ROLÜ olan kullanıcılardan istenebilir. Advanced: herkesten | Standard otomatik. Advanced: izin başına App Review + **Business Verification şart** | "Ongoing review" + yıllık veri erişimi yenilemesi | [9][10][13] |
| **Marketing API Access Tier** (Limited → Full; 2026-05'e kadar adı "Ads Management Standard Access", eski seviyeleri Standard/Advanced) | Hız kotası, Business Manager API'lerinin tamamı, sistem kullanıcısı sayısı | App Review + son 15 günde ≥500 başarılı Marketing API çağrısı + son 500 çağrıda hata <%15 (eşik 1.500'den 500'e indi). Use case ekranında "Request higher limit" | Aynı iki eşik **korumak için de** geçerli; düşüş zamanı belgede yok | [1][2][7] |
| **Business Verification** | Advanced Access'in ön koşulu (2023-02-01'den beri); uygulama doğrulanmış bir portföye bağlı olmalı | Business Manager'da admin; belgeler (ticaret sicili/vergi belgesi, işletme banka ekstresi, fatura vb.) | Doğrulama düşerse Tech Provider statüsü de düşer | [10][11][54] |
| **Tech Provider (erişim doğrulaması)** | Bir işletmenin sahiplendiği uygulamayı **başka işletmelerin** kullanabilmesi; listede `ads_management`, `ads_read`, `business_management`, `pages_manage_ads`, `pages_show_list`, `pages_read_engagement`, `leads_retrieval`, `instagram_basic`, `read_insights`… | App Dashboard > Basics > Verifications > Access verification; işletme admini işletmenin başka işletmelerin verisini nasıl kullandığını anlatır; karar ~5 gün. Ön koşul Business Verification ve kısıtsız hesap. App Review'dan **bağımsız** | İşletme doğrulaması düşerse, uygulama işletmeden koparsa ya da işletme kısıtlanırsa statü düşer | [11][12][57] (2022 blogu eski olabilir) |
| **Veri erişimi yenilemesi** (data access renewal) | Advanced Access'i olan uygulamanın yaşaması | Yıllık değerlendirme; bildirimden itibaren 60 gün | Kaçırılırsa uygulama **devre dışı**; uzatma yok. İnceleme çoğunlukla 10–15 iş günü | [19] |

- **Tech Provider eksikken hata yanıltıcı:** rolsüz kullanıcının çağrısı, Tech Provider doğrulaması yoksa
  "Unsupported get request. Object … does not exist, cannot be loaded due to missing permissions…"
  metniyle **kod 100** döndürüyor. Ekranın bunu "nesne silinmiş" diye okuması tam bir sessiz yanlış teşhis
  olur. [11] **[Resmî-Meta]**
- Belge, "yalnız kendi reklam hesabını yöneten" uygulama için Standard Access'i yeterli sayıyor;
  **başkasının** hesabını yönetmek için Advanced istiyor. [1] **[Resmî-Meta]**

#### 1.2 Limited ve Full katmanın sayısal farkı

| | Limited (varsayılan) | Full | Kaynak |
|---|---|---|---|
| Hesap puanı (okuma 1, yazma 3) | tavan 60, sönme 300 sn, aşınca 300 sn blok | tavan 9.000, sönme 300 sn, aşınca 60 sn blok | [2] |
| BUC `ads_management` (hesap başına, 1 saat) | 300 + 40 × aktif reklam | 100.000 + 40 × aktif reklam | [2] |
| BUC `ads_insights` | 600 + 400 × aktif reklam − 0,001 × kullanıcı hatası | 190.000 + … | [2] |
| Mutasyon QPS (hesap+uygulama) | 100 istek/sn (her iki katmanda) | aynı | [2] |
| Business Manager API | hesap, kullanıcı izni, sayfa YÖNETİMİ yok | tamamı | [1] |
| Sistem kullanıcısı | 1 + 1 admin | 10 + 1 admin | [1] |
| Kimin adına | "uygulama admin/geliştiricileri hesap adına çağrı yapabilir"; belge "yalnızca geliştirme, canlı reklamveren için değil" diyor | izin veren herkes adına | [1] |

Pratik sonuç: Limited katmanda tek bir hesapta 5 dakikalık pencerede ~20 yazma yapılabilir (60 / 3).
Dört nesneli bir ağaç + yükleme + geri okuma ≈ 20–35 puan; **canlı tur için yeterli, üretim için değil**. [2]

#### 1.3 App Review: ne isteniyor

- **Use case yapısı (yeni panel):** Marketing API'nin üç use case'i var: "Create & manage ads",
  "Capture & manage ad leads", "Measure ad performance". Üçünde de `ads_management`, `ads_read`,
  `business_management`, `pages_read_engagement`, `pages_show_list`, `public_profile` ve Access Tier
  özelliği zorunlu; `pages_manage_ads` "Create & manage ads"te isteğe bağlı, lead use case'inde zorunlu;
  `leads_retrieval` YALNIZ lead use case'inde. Facebook Login for Business ve Webhooks otomatik eklenir.
  [7] **[Resmî-Meta]** (2025-09-09)
- **API çağrısı ön koşulu:** istenen her izin için başvurudan önceki **30 gün içinde en az 1 başarılı
  çağrı**; çağrı 2 gün içinde kayda geçer; Graph API Explorer da sayılır. Çağrı yoksa "Request advanced
  access" düğmesi gri kalıyor. [16] **[Resmî-Meta]** (2026-06-30)
- **Ekran kaydı:** her izin/özellik için ayrı kayıt; **kaydı olmayan izin onaylanmaz**. Arayüz
  İngilizce olmalı ya da altyazı/ipucu eklenmeli; 1080p; ses dinlenmiyor; giriş akışı baştan sona,
  izin verme ekranı ve iznin uçtan uca kullanımı görünmeli. [16][17] **[Resmî-Meta]**
- **İzin başına ekran kaydı içeriği** (izin referansı): `ads_management` ve `ads_read` için "Facebook
  girişi + işletmenin reklam verisine erişmesi + gösterim/dönüşüm/harcama/tıklama/erişim değerlerinin
  ekranda görünmesi"; kullanım açıklaması "başka işletmeler adına neden reklam yönettiğine somut örnek"
  istiyor. `ads_mcp_management` için ayrıca bir MCP istemcisinin bağlanıp en az bir okuma ve bir yazma
  yaptığı gösterilmeli. [14] **[Resmî-Meta]**
- **Meta'nın kendi tavsiyesi** (BM API ekibi): canlıya geçerken en az `ads_management`,
  `business_management`, `pages_show_list`, `pages_read_engagement` (+ Instagram'da yayın için
  `instagram_basic`) Advanced istenmeli; `business_management`'ın neye bağımlılık olarak istendiği
  açıklamada yazılmalı; kayıtta kullanıcının FBL4B akışında sayfa/IG seçtiği görünmeli. [18] **[Resmî-Meta]**
- **Ret sebepleri** (rehberin listesi): uygulama hâlâ geliştiriliyor görünüyorsa; **şu an kullanılmayan,
  ileride lazım olacak izin isteniyorsa**; Facebook Login bulunamıyor/çalışmıyorsa; sahte hesap
  kullanıldıysa. Karar "bir hafta içinde" bekleniyor. Uygulama ayarları: 1024×1024 ikon, gizlilik
  politikası, "App Purpose = Clients", kategori, iletişim e-postası, veri silme geri çağrısı. [16] **[Resmî-Meta]**

#### 1.4 Advetics uygulamasının bugünkü durumu (2026-10-06, salt-okuma)

| Gözlem | Değer | Yorum | Kaynak |
|---|---|---|---|
| Bekleyen başvuru | `PENDING`, gönderim 2026-10-01 22:23 UTC; daha önce değerlendirilmiş başvuru YOK | Yeni başvuru, bu bitene kadar yapılamıyor (`can_submit:false`) | [47] |
| Başvurudaki ayrıcalıklar | `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_manage_ads`, Marketing API Access Tier, `ads_mcp_management`, `catalog_management`, `read_insights`, `public_profile`, Business Asset User Profile Access | Araç hepsini `access_level: none`, `grant_status: REJECTED` gösteriyor ama ret gerekçesi BOŞ ve geçmiş boş → "henüz verilmemiş" diye okunmalı, "reddedildi" diye değil | [47] |
| Başvuru adımları | `use_case` ✓, `data_use_checkup` ✓; **`screencast` ✗ ve `api_precheck` ✗** (çoğu izin) | Ya başvuru eksik gitti ya da araç yeni taslağı raporluyor — **App Dashboard'da gözle bakılmalı** | [47][16] |
| Business Verification | `business_verification_passes: true`; gizlilik politikası var | `DURUM.md` §6 "Yapılmadı" diyor — **bayat** | [47] |
| Uyum | `compliant`, açık ihlal yok | — | [47] |
| Platformun son sürümü | `v26.0` | Brief v25 diyor | [47][23] |
| Graph uygulama kartı | 15 günde 5 çağrı (kota 240), tek kullanıcı | Marketing API çağrıları Graph sınırına **sayılmıyor** [2]; 500 çağrı eşiği bu karttan okunamaz | [47][2] |

- Başvurudaki `catalog_management` (brief'te katalog satışı "Kapalı") ve `ads_mcp_management` (ürün MCP
  kullanmıyor; kod yalnız token'ı bir AI istemcisine verme imkânı için istiyor) **"ileride lazım"**
  sayılabilir; ikincisi için ekran kaydında MCP istemcisinin bir okuma + bir yazma yapması gerekiyor. [14][16]
  Reklam oluşturma modülü 2026-09-29'dan beri DONUK; `ads_management` kaydı için `DURUM.md` §6'nın
  önerisi (kural motoru: prova → tek düğmeyle gerçek) bugün gösterilebilir tek akış.

#### 1.5 Token türleri ve ajans modeli

| Model | Süre | Kime bağlı | Varlık kapsamı | Gerekenler | Advetics'te yeri | Kaynak |
|---|---|---|---|---|---|---|
| Klasik Facebook Login kullanıcı token'ı (bugünkü kod) | kısa ömürlü 1–2 sa → uzun ömürlü ~60 gün; şifre değişince / izin geri alınınca ölür | çalışana | kullanıcının eriştiği her şey | rolsüz kullanıcı için Advanced | **Bırakılmalı** (kişiye bağımlılık) | [3] |
| **Ajans sistem kullanıcısı** (ajans BM'inde) | "süresiz" (belge); token üretiminde 60 gün seçeneği var | ajansın işletmesine | BM'de ona atanan varlıklar (müşterinin ajansa paylaştığı hesap/sayfa/IG/pixel dahil, görevlerle) | BM'in uygulamaya sahip olması; Limited'de 1+1, Full'de 10+1; işletme başına tek admin sistem kullanıcısı | **Ajans havuzu — önerilen** | [3][58][1][R2] |
| **FBL4B + BISU token** | varsayılan süresiz (60 gün seçeneği) | **müşterinin** iş portföyüne | yalnız müşterinin giriş sırasında seçtiği varlıklar; birden çok "granüler" token mümkün | İşletme tipi uygulama; Advanced Access; Tech Provider; `business_management`; token yönetim API'sinde `appsecret_proof` zorunlu | **Müşterinin kendi bağlantısı** (2026-09-23 kararı) | [13] |
| FBL4B kullanıcı token'ı | kısa | kişiye | kullanıcının varlıkları | aynı | Gerekmiyor | [13] |

- Meta, FBL4B'yi "tech provider'lar için tercih edilen" giriş çözümü olarak tanımlıyor; sistem
  kullanıcısı token'ını sunucudan sunucuya iş için öneriyor; Ads CLI yalnızca sistem kullanıcısı token'ı
  kabul ediyor; Ads MCP ajans/partner kullanımı için `ads_mcp_management` Advanced istiyor. [3][13][26][59]
- **Sistem kullanıcısı müşteri varlığına atanabilir:** `POST /act_{id}/assigned_users` `user` alanına
  sistem kullanıcısı kimliği ve görev listesi alıyor; sistem kullanıcısının hesapları
  `GET /{system_user_id}/assigned_ad_accounts` ile `tasks` alanıyla okunuyor. [42] (sayfalar 2021,
  eski olabilir) **[Resmî-Meta]** Ajans BM'i müşterinin işletmesinde sistem kullanıcısı AÇAMAZ;
  sistem kullanıcısı ajans BM'inde yaşar. [R2]
- **Güvenlik:** sunucudan giden her çağrının `appsecret_proof` (token'ın app secret ile HMAC-SHA256'sı)
  taşıması ve App Dashboard'da "Require App Secret" açılması öneriliyor; yeni sürüm zaman damgalı kanıt
  (`appsecret_time`, 5 dakika geçerli) tarif ediyor. Token geçerliliği **en az günde bir** kontrol
  edilmeli. [44] **[Resmî-Meta]** (2026-06-30)

#### 1.6 Ajans politikası (2026-04-28)

- **10.5 Ayrı reklam hesabı:** birden çok son reklamveren aynı reklam hesabında birleştirilmez (katalog/
  pixel/CAPI'de `vendor_id`/`brand` alanı doğru kurulmadıkça). [20] **[Resmî-Meta]**
- **10.6.a Şeffaflık (2027-02-03'ten itibaren):** son reklamveren isterse ajans (i) onun adına Meta'da
  harcanan tutarı ücretinden AYRI ve ücret yapısını, (ii) kampanya kurulumu/ayarları ve kampanya sonrası
  raporu **Meta terminolojisiyle** açıklamak zorunda; Meta ihlal şüphesinde bu bilgiyi reklamverene
  kendisi verebilir. [20] **[Resmî-Meta]**
- Reklam hesabı düğümünde `agency_client_declaration` (ajansın müşteri adına reklam verdiği beyanı; BM
  admini gerekir) ve `end_advertiser` alanları var. [41] **[Resmî-Meta]**

#### 1.7 Sürüm durumu

- v26.0 2026-07-29'da çıktı. Graph değişiklik günlüğündeki Marketing API tablosu: v26 (bitiş TBD), v25
  (TBD), **v24 bitiş 2026-10-06 (bugün)**. Marketing API'nin kendi "Versions" sayfası v26'yı HENÜZ
  listelemiyor ve "güncel v25" diyor — **[Çelişki]**, iki Meta sayfası. Meta'nın aracı son sürümü `v26.0`
  raporluyor. [21][23][24][47]
- **Otomatik sürüm yükseltme:** sürüm sayfası "2024-05'ten beri etkin" diyor; use case sayfası Ayarlar'da
  "Marketing API version auto-upgrade'i etkinleştir" seçeneğinden söz ediyor — varsayılanın açık mı
  kapalı mı olduğu **[Çelişki]**. Yükseltilen yanıt `X-Ad-Api-Version-Warning` taşıyor; değişen uçlarda
  yükseltme yok, çağrı düşüyor. [25][7][R1]

### 2. Para harcamadan doğrulama

#### 2.1 Sandbox reklam hesabı — Meta'nın üç ifadesi

| Kaynak | Ne diyor | Etiket |
|---|---|---|
| Best Practices (Testing) | Sandbox'ta okuma/yazma var ama **reklam ve kreatif OLUŞTURULAMAZ**; App Review demosunda sabit reklam kimlikleri kullanın | [4] [Resmî-Meta], tarih yok |
| 2017 blogu | Bütün Marketing API çağrıları sandbox'ta çalışır; teslim yok, harcama yok; uygulama başına tek sandbox | [5] [Resmî-Meta], **eski olabilir** |
| 2023-06-21 blogu ("yeniden etkin") | Marketing API'nin bir **alt kümesi**; ödeme yöntemi gerekmez; **Insights desteklenmiyor**; uygulama başına bir sandbox; sayfaya bağlanır; kullanıcı ya da sistem kullanıcısı token'ı | [6] [Resmî-Meta], eski olabilir |
| Marketing API use case Quickstart (2025-09-09) | "Create Sandbox Ad Account": reklam oluşturmayı ve raporlamayı ücretsiz test et; reklamlar yayınlanmaz; **sahte performans raporu** üretilebilir; token 2 ay geçerli | [7] [Resmî-Meta] |
| Keboola wiki | Sandbox'ta kampanya → ad set → görsel → kreatif → reklam akışı yapıldı | [53] [Topluluk], 2018, eski |

Sonuç: sandbox ancak canlıda ölçülürse plana girer (oluşturma, kreatif, insights). App Review demosu için
sandbox önerilmiş olsa da **gerçek reklam akışını göstermek** daha güvenli (ekran kaydı her izni uçtan uca
göstermeli). [4][16]

#### 2.2 Test kullanıcıları

- "Uygulamaların yeni test kullanıcısı oluşturması **geçici olarak kaldırıldı**" (sayfa 2026-04-17).
  Mevcut test kullanıcıları etkilenmiyor; uygulama başına en çok 10; yalnız rol sahipleriyle etkileşir;
  "Live mode" kuralı tüketici uygulamaları için. İşletme tipi uygulamalarda uygulama modu yok, erişim
  seviyeleri var. [8][R-build] **[Resmî-Meta]** Pratikte test, **gerçek rol sahibi kişilerle** (admin/
  geliştirici/tester rolü) yapılacak.

#### 2.3 `execution_options`: uç başına ne var

| Uç | İzinli değerler | Not | Kaynak |
|---|---|---|---|
| `POST /act_{id}/campaigns` | `validate_only`, `include_recommendations` | geçerse `{"success": true}` | [28] |
| `POST /act_{id}/adsets` | `validate_only`, `include_recommendations` | `campaign_id` YA DA satır içi `campaign_spec` (`name`, `objective`, `buying_type`); belgedeki örnek eski `CONVERSIONS` amacını kullanıyor | [28] |
| `POST /act_{id}/adcreatives` | yalnız `validate_only` | | [28] |
| `POST /act_{id}/ads` | `validate_only`, **`synchronous_ad_review`**, `include_recommendations` | `synchronous_ad_review` tek başına kullanılmaz, `validate_only` ile birlikte; reklam bütünlüğü kontrolleri (metin dili, görsel kuralları vb.) + doğrulama. `adset_id` YA DA `adset_spec`; `creative` kimlik YA DA satır içi spec | [27] |
| `POST /{id}/adlabels` | `validate_only` | | [33] |

- **README §3c düzeltmesi:** `synchronous_ad_review` yalnız reklam ucunda. Bütünlük provası reklam
  gövdesiyle (satır içi kreatif + `adset_spec`) yapılmalı. **[Çelişki — brief ile belge]**
- `include_recommendations` öneri bölümünü yalnız öneri varsa döndürüyor. [27]
- Bütünlük provası **onay garantisi değil**: gerçek inceleme reklam oluşunca başlıyor ve yayından sonra da
  tekrar edilebiliyor. [45]

#### 2.4 PAUSED kur → geri oku → arşivle

- Reklam oluşturulunca önce incelemeye giriyor (`PENDING_REVIEW`), sonra seçilen duruma dönüyor; testte
  `PAUSED` önerilir. **PAUSED girilen inceleme PAUSED biter** — yani inceleme sonucu yayından önce
  görülebiliyor. [27][4] **[Resmî-Meta]**
- `ARCHIVED` nesnede yalnız ad ve durum değişir, yalnız `DELETED`'a geçebilir; `DELETED` geri dönmez ve
  silinen reklam 28 gün metrik toplayabilir; arşiv sınırı belgede iki farklı sayı (5.000 / 100.000).
  [4][R1] → Advetics hiçbir zaman silmez, arşivler.
- PAUSED nesneler müşterinin Ads Manager'ında görünür (README §5.1 "çöp" uyarısı) — test ağaçları hemen
  arşivlenmeli; Meta'nın kendi MCP'si bunun yerine Ads Manager **taslağına** yazıyor ama taslak yazma
  ucu genel belgede yok (`addrafts` yalnız okuma). [46][R2]

#### 2.5 Önizleme

- `GET /act_{id}/generatepreviews` kreatif oluşturmadan yerleşim başına önizleme; `GET /{ad_id}/previews`;
  reklamda `preview_shareable_link` alanı. iframe 24 saat geçerli, saklanmaz. [R2][27] **[Resmî-Meta]**

#### 2.6 Hesap düzeyinde güvenlik ağları

- Hesap `spend_cap` yeni değeri **konduğu andan sonraki** harcamaya uygulanır; 0 = limitsiz; API'den
  günde en çok 10 değişiklik. Kampanya `spend_cap` asgarisi ~100 USD karşılığı (küçük test için işe
  yaramaz). [41][R2][2]
- Ödeme yöntemi olmayan hesapta reklam **oluşur ama yayınlanmaz**, hata yok. [R2]
- `GET /act_{id}/minimum_budgets` asgari günlük bütçe; `ads_volume` sayfa başına "yayında ya da
  incelemede" reklam sayısı. [R2][40]

### 3. Yayın motoru — Meta gerçekleri ve endüstri

#### 3.1 İdempotency yok; etiket ve iz araçları var

- Marketing API oluşturma uçlarında idempotency anahtarı yok (Meta'nın belge aramasında "idempotency"
  yalnız Commerce sipariş API'sinde çıktı — o API de v26'da kaldırıldı). Resmî Python SDK'sında otomatik
  tekrar, geri çekilme ya da idempotency YOK; batch sınıfı yalnız düşen çağrıları yeni bir batch olarak
  geri veriyor. Meta'nın kendi Ads MCP araçlarında da anahtar yok; izlenebilirlik
  `client_conversation_id` + `advertiser_request` ile sağlanıyor. [21][48][46]
- **AdLabel:** hesap başına 100.000 silinmemiş etiket; nesne başına 50 etiket. Oluştururken
  `adlabels=[{"name": "…"}]` verilip etiket yoksa Meta **yaratıp bağlıyor**. Sorgu:
  `GET /act_{id}/campaignsbylabels|adsetsbylabels|adsbylabels|adcreativesbylabels` (`ANY`/`ALL`, kısmi
  eşleşme yok) ya da `GET /{label_id}/campaigns|adsets|ads|adcreatives`. [33] **[Resmî-Meta]**
- **Dış değişiklik izi:** `GET /act_{id}/activities` satırında `actor_id/actor_name`,
  `application_id/application_name`, `event_type`, `extra_data` (eski/yeni değer JSON). Reklam düğümünde
  ayrıca `last_updated_by_app_id` var (kampanya/ad set belgelerinde yok). [34][27] **[Resmî-Meta]**

#### 3.2 read-after-write tuzağı

Oluşturma/güncelleme uçları yanıtta `fields` ile nesneyi okumayı destekliyor; **okuma düşerse** (ör.
var olmayan alan) Graph standart hata döndürüyor. [31] **[Resmî-Meta]** Belge yazmanın geri alındığını
söylemiyor → böyle bir hata "sonuç belirsiz" sayılmalı.

#### 3.3 Sıralı mı, batch mi, async mı

| Yol | Sınır | Hata davranışı | Ne zaman | Kaynak |
|---|---|---|---|---|
| Sıralı tek tek çağrı | — | her çağrının kendi hatası | Tek kampanya yayını (zincir zaten doğrusal) | — |
| Graph batch `POST /` `batch=[…]` | 50 istek; reklam oluştururken batch başına ≤10 reklam | her alt istek kotaya ayrı sayılır; biri düşse diğerleri 200; büyük batch **zaman aşımında kısmen tamamlanır, tamamlanmayanlar `null`** (= sonuç belirsiz); bağımlılar sıralı, bağımsızlar paralel; JSONPath ile önceki sonucu kullanma | Tek ad set altında N reklam (≤10/batch) | [29][30] |
| `POST /act_{id}/async_batch_requests` (`adbatch`) | çağrı başına 1.000 | istek başına durum (`initial/in_progress/success/error/canceled`), işlenmemiş istek iptal edilebilir | Toplu kurulum (ileride) | [29] |
| `POST /act_{id}/asyncadrequestsets` (`ad_specs`) | — | reklam başına bir istek; bitince `notification_uri`'ye haber (`ON_COMPLETE`) | Toplu reklam | [29] |

Topluluk araçlarından biri yazma için batch ve async'i **bilerek reddediyor** (koruma kurallarının her
isteğe uygulanabilmesi için). [51] **[Topluluk]**

#### 3.4 Medya yükleme

| Konu | Bilgi | Kaynak |
|---|---|---|
| Görsel | `POST /act_{id}/adimages` (`bytes` base64 ya da dosya); dönüş `hash`; hash hesap başına; hesaplar arası `copy_from`. Tekrar yükleme para riski taşımaz | [R2] |
| Video — eski yol | `POST /act_{id}/advideos`: `source` (multipart), `file_url` ya da parçalı yükleme (`upload_phase` = start/transfer/finish/cancel) | [36] |
| Video — yeni yol (sayfa 2026-05-21 güncel) | 1) `POST /act_{id}/video_ads upload_phase=start` → `video_id` + `upload_url` (`rupload.facebook.com/video-ads-upload/…`); 2) yerel dosya (`offset`, `file_size` başlıkları) ya da `file_url` başlığıyla barındırılan dosya; kesilirse durumdaki `bytes_transferred`'dan devam; 3) `GET /{video_id}?fields=status` → `video_status` ∈ `ready/processing/expired/error` + `uploading_phase`, `processing_phase`, `publishing_phase`; 4) `upload_phase=finish` | [35] |
| Video özellikleri (bu sayfa) | MP4 önerilir; 16:9–9:16; 10 GB'a kadar önerilir; 1280×720 önerilir; asgari genişlik 1200 px yazıyor (05 bölümündeki tabloyla karşılaştırılmalı); 24–60 fps; H.264/H.265/VP9/AV1, AAC 128 kbps+ | [35] |
| Belirsiz not | "İşletme sistem kullanıcısıyla işletme hesaplarına video yükleme henüz desteklenmiyor"; ayrıca uygulama kullanıcısının hesapta `CREATE_CONTENT` görevini yapabilmesi isteniyor (bu görev normalde SAYFA görevi) | [35] — **belgede belirsiz** |
| Kullanılabilirlik | `processing` = yüklendi ama kreatifte kullanılamaz; `ready` beklenmeli. `video_data` küçük resim ister (`image_hash` ya da `image_url`); `link_description` varsa `call_to_action` şart | [46] [canlı şema] |
| İşlenme süresi / webhook | belgede süre yok; reklam videosu için "hazır" webhook'u belgede yok → yoklama | [35] |

#### 3.5 Hız sınırı başlıkları ve geri basınç

| Başlık | Alanlar | Birim | Kaynak |
|---|---|---|---|
| `X-Ad-Account-Usage` | `acc_id_util_pct`, `reset_time_duration`, `ads_api_access_tier` | yüzde; **saniye** | [32] |
| `X-Business-Use-Case-Usage` | hesap kimliği → `[{type, call_count, total_cputime, total_time, estimated_time_to_regain_access}]`; `type` ∈ `ads_management`, `ads_insights`, `custom_audience`, `instagram`, `leadgen`, `messenger`, `pages` | yüzde; **dakika** | [32] |
| `X-App-Usage` | `call_count`, `total_time`, `total_cputime` | yüzde | [32] |
| `X-FB-Ads-Insights-Throttle` | `app_id_util_pct`, `acc_id_util_pct`, `ads_api_access_tier` | yüzde | [R-insights][2] |

- Başlıklar "yeterli çağrıdan sonra çoğu yanıtta" var; hata yanıtında olup olmadığı belgede açık değil.
  [32] Airbyte'ın 2026-09 hatası: başlıklar yalnız BAŞARILI yanıtta okunuyordu, kota sinyalini taşıyan
  ret yanıtları hiç okunmadı; 582 aynı hatada önleyici yavaşlatma hiç devreye girmedi. Düzeltme: hesap
  bloğunu (`17/2446079`) genel geri çekilmeden ayırıp başlıktaki süre kadar bekleme (önce
  `reset_time_duration`, sonra `estimated_time_to_regain_access`, yoksa 10 dakikada bir yeniden
  bakma), toplam bekleme üst sınırı **1 saat** (üretimde görülen en uzun blok), BUC girdilerinin
  hepsini okuyup en kötüsünü seçme. [49][50] **[Sektör]**
- `17/2446079` hatası `is_transient: false` taşıyor ama dakikalardan saatlere kadar süren geçici bir
  blok. **`is_transient` tek başına tekrar kararı veremez.** [49]
- Meta'nın tavsiyesi: patlamayı yay, batch/kimlik listesi, üstel geri çekilme, başlıktaki sıfırlama
  süresi; insights'ta async. [2] Uygulama düzeyi insights sınırına takılınca **uygulamanın bütün
  insights çağrıları** kısılıyor. [2]
- Topluluk eşikleri: %75 uyar, %90 yavaşla, %95 reddet; 5 dakikayı aşan beklemede kontrolü kullanıcıya
  bırak. [52] **[Topluluk]**

#### 3.6 Hata sınıfları (01 bölümünün tablosu + yeni bulgular)

- Tekrar denenebilir: `is_transient:true`; `1`, `2`; hız: `4`, `17`, `613` (subcode'a göre), `80000/80003/
  80004/80014`; `3910001`. Kullanıcıya gösterilecek: yetki (`10`, `190`, `200`, `283`, `294`, `270`),
  sözleşme, bütçe, kurgu, hedefleme, içerik kodları. Ayırt edici tek güvenilir anahtar **kod/subcode**;
  açıklama metni haber vermeden değişebilir; `blame_field_specs` hatalı alanın yolu. [R1]
- **Yeni:** `100/33` (ve genel `100` "nesne yok / izin eksik / desteklenmiyor") üç ayrı durumu
  kapsıyor: nesne gerçekten yok, kimliğin izni yok, uygulamanın Tech Provider doğrulaması yok. [11][R1]
- **Yeni:** `613/1487225` reklam oluşturma sınırı hesabın **günlük harcama limitine** bağlı — yeni ya da
  az harcayan müşteri hesabında erken çıkabilir. [2]
- **Yeni:** kota hatası bile "yazma gerçekleşmedi" diye belgelenmiyor; topluluk araçlarından biri
  uçuşta düşen yazmayı **hiç tekrar oynatmıyor** ve sınıf adı `outcome_unknown`. [51] **[Topluluk]**

#### 3.7 Kısmi başarı ve geri alma

- Kampanya üst nesneyi açmak alttakileri açmaz; alt nesneyi açmak üst kapalıyken teslim etmez. Teslim
  için üç seviye de `ACTIVE` olmalı; yukarıdan aşağı açılır. [46][R1]
- Kreatif içeriği değiştirilemez; ret sonrası düzeltme = yeni kreatif + (Meta MCP'nin seçimi) yeni reklam.
  API reklamın kreatifini değiştirmeye izin veriyor ve webhook sayfası bunu örnek gösteriyor; MCP bunu
  yasaklayıp yeni reklam istiyor. [38][46][R1]
- `IN_PROCESS` nesne güncellenebilir; işlem başarısızsa `WITH_ISSUES` + `issues_info`. [37]

#### 3.8 Yayın sonrası: inceleme, işlem, webhook

- İnceleme otomatik başlıyor, **tipik olarak 24 saat içinde** bitiyor, daha uzun sürebilir; reklam
  yayından sonra da tekrar incelenebilir; otomatik + bazen elle. [45] **[Resmî-Meta]**
- Meta'nın MCP'si: "PUBLISHING" yalnız devredildi demek; yayıncı kendi kontrolleriyle reddedebilir ve
  bunu bildiren araç yok → birkaç dakika sonra yeniden oku. [46] **[canlı şema]**
- Ads webhook'ları: nesne `ad_account`; iki adım iki token — uygulama token'ıyla
  `POST /{app_id}/subscriptions` (alanlar), hesap **admin** token'ıyla (admin kullanıcı ya da sistem
  kullanıcısı) `POST /act_{id}/subscribed_apps` — her hesap için. İkinci adım yoksa olay hiç gelmez.
  [38] **[Resmî-Meta]**
- `effective_status` bildirimi `field_changed` alanıyla gelir, `changed_fields:["effective_status"]`,
  YENİ DEĞER YOK; Meta önerilen okuma: `effective_status, configured_status, review_feedback,
  creative{…}, adset{…}, campaign{…}`. `with_issues_ad_objects` `level` + `error_code/summary/message`
  taşır. [38]
- **[Çelişki]** Webhook sayfaları ret sebebi için `review_feedback` alanını okutuyor; reklam referansında
  alan adı `ad_review_feedback`. Yanlış alan adı istemek okumanın tamamını düşürür → canlıda hangisinin
  döndüğü ölçülmeden yoklama sorgusuna yazılmamalı. [38][27]
- Teslim semantiği (genel webhook belgesi): en çok 1.000 güncellemelik gruplar (garanti değil); düşen
  teslim hemen, sonra azalan sıklıkla **36 saat** tekrar denenir; **mükerrer gelebilir, tekilleştir**;
  36 saatte onaylanmayan düşer; `time` gönderim zamanı, değişiklik zamanı değil; imza
  `X-Hub-Signature-256` ham gövde üzerinden. [39] **[Resmî-Meta]** Meta 2026-07-21'de "yoklama yerine
  webhook" yönünde bir yazı yayımladı. [23]

#### 3.9 Meta'nın kendi araçları ve açık kaynak: nasıl yapılıyor

| Araç | Oluştur | Yayın | Tekrar / idempotency | Not | Kaynak |
|---|---|---|---|---|---|
| Meta Ads MCP | her şey `PAUSED`; taslak modunda Ads Manager taslağına | ayrı araç, **açık kullanıcı onayıyla**; taslakta `object_ids` ile toplu; `ignore_validation_errors` yalnız kullanıcı hataları gördüyse | anahtar yok; `advertiser_request` (asıl cümle), `client_conversation_id` | `PUBLISHING` ≠ yayında; video `ready` beklenir; yeni satır içi kreatifte `contextual_multi_ads` `OPT_OUT` (API varsayılanı farklı) | [46] |
| Meta Ads CLI (2026-04-29) | varsayılan `PAUSED` | üç seviye ayrı `--status ACTIVE` | belgede yok | yalnız sistem kullanıcısı token'ı; çıkış kodları 0–5; `campaign delete` basamaklı | [59][R1] |
| Resmî Python SDK | — | — | otomatik tekrar/geri çekilme/anahtar YOK | batch sınıfı düşenleri geri verir | [48] |
| Airbyte (okuma bağlayıcısı) | — | — | 5 deneme ~75 sn genel geri çekilme + hesap bloğuna ayrı, başlığa dayalı, ≤1 saat bekleme | 2026-09 düzeltmesi | [49][50] |
| Topluluk CLI (Go, ajanlar için) | `status` tam olarak `PAUSED` değilse "harcama" sınıfı | ayrı kapı | **uçuşta düşen yazma asla tekrar oynatılmaz**; okuma ve `validate_only` 3 deneme | bütçe tavanları istekten önce; batch/async yazma reddi; hata türleri `auth/forbidden/not_found/validation/rate_limited/server/transport/outcome_unknown` | [51] |
| Topluluk CLI (Python) | her şey `PAUSED`; yazmalar `--confirm` yoksa `validate_only` provası | `--status ACTIVE --confirm` birlikte | kota eşikleri %75/%90/%95; 5/15/60 sn geri çekilme | v25 | [52] |

#### 3.10 v26'nın motoru etkileyen değişiklikleri

| Değişiklik | Kapsam / tarih | Advetics için | Kaynak |
|---|---|---|---|
| Kök `GET /?ids=` **hata**; `If-None-Match`/ETag/304 kalkıyor; `pretty`, `debug` yok sayılıyor; `date_format` hata | v26'da 2026-07-29; **bütün sürümlerde 2026-10-27** | `meta.provider.ts` içinde iki kök `?ids=` çağrısı (kreatif görsel tazeleme ~1908. satır, kampanya özeti ~2342. satır) kırılacak; yerine nesne başına istek ya da Graph batch (`?ids=`'in "tek kötü kimlik hepsini düşürür" sorunu da biter) | [22] |
| `delivery_estimate`'ten `daily_outcomes_curve`, `budget_guardrail`, `estimate_dau` kalkıyor, yerine bir şey yok | v26; tüm sürümler 2026-10-27 | Brief §5.6/K8'deki "sonuç tahmini" yapılamaz; kitle büyüklüğü (`reachestimate`) kalıyor | [21][22] |
| **Yeni sessiz varsayılan:** mağazası olan reklamverende uygun kreatifler `destination_spec.destination_type = WEBSITE_AND_SHOP`'a düşüyor; çıkış `WEBSITE_AND_SHOP_OPT_OUT` | v26+ | §2 manifestosuna yeni satır (v26'ya geçilirse) | [22] |
| HOUSING / EMPLOYMENT / FINANCIAL'da kısıtlı kurulumlu YENİ ad set için `advantage_audience` açıkça 1 ya da 0 | v26+ | Advetics zaten açıkça `1` yazacak (karar 2); konut kısıtlarıyla birlikte kabul edildiği ölçülmeli | [21][22] |
| Messenger Stories `messenger_positions`'tan **sessizce** siliniyor | v26; tüm sürümler 2026-10-27 | Advantage+ yerleşimde etkisiz; Gelişmiş moddaki elle yerleşimde sözlükten çıkarılmalı | [21][22] |
| Instagram Explore yerleşimi kalktı (belirtilirse hata); anket (poll) kreatifi kalktı; web+app kampanyasında `web_only` kreatif yasak | v26 / 2026-10-27 | Yerleşim ve kreatif sözlüklerinden çıkar | [21][22] |
| WhatsApp Durum: `user_age_unknown` verilmezse `true`; üçüncü taraf çağıranlar `wamo_whatsapp_identity_spec`'i açıkça göndermeli | v26 | Manifesto zaten `user_age_unknown`'ı açıkça yazıyor | [21] |

### 4. Çoklu müşteri / ajans riskleri

#### 4.1 Kota paylaşımı

- Hesap puanı, BUC ve QPS **hesap (+uygulama)** başına: bir müşterinin yayını diğerinin kotasını yemez.
  Ama Advetics'in kendi senkronizasyonu ve yayını **aynı hesap kotasını** paylaşır. [2]
- **Insights sınırı ve genel uygulama sınırı uygulama genelinde:** bir müşterinin ağır raporu bütün
  müşterilerin raporunu kısar ("gürültülü komşu"). [2]
- Hata oranı eşiği (son 500 çağrıda <%15) **uygulama genelinde**: tek bir bozuk döngü (ör. 2026-10-27'den
  sonra kırılan `?ids=` çağrıları, geçersiz token'la saatlik deneme) Full katmanı tehlikeye atar. [1]

#### 4.2 Sayfa başına reklam sınırı

- "Yayında ya da incelemede" reklam sayısı sayfa başına sınırlı ve **o sayfaya bağlı bütün reklam
  hesaplarında toplanıyor**; `GET /act_{id}/ads_volume?page_id=…` sayfa başına sayıyı, `show_breakdown_
  by_actor=true` aktör kırılımını veriyor. Gelecek tarihli ad set'in reklamları sayılmıyor; gün bölmede
  bütün gün sayılıyor. [40] **[Resmî-Meta]**
- Kademeler (aylık en yüksek harcamaya göre): <100 bin USD → 250, <1 milyon → 1.000, <10 milyon →
  5.000, üstü → 20.000. 2026-09-22'den beri bazı hesaplarda "sayfa başına sınır yok" mesajı görülüyor;
  Meta duyurmadı. [55] **[Sektör]** → sınırı sabit kodlama; her yayında `ads_volume` oku.

#### 4.3 Hesap düzeyi bayraklar

- `is_ads_mcp_enabled` yalnız Meta'nın MCP'sinde görülen bir hesap bayrağı; Meta MCP araçlarının hesaplara
  "kademeli" açıldığını söylüyor. Marketing API'de doğrudan karşılığı belgede yok; doğrudan API kullanan
  Advetics'i etkilemez — MCP'ye yazma için yaslanmamak için bir sebep daha. [26][R1]
- Marketing API'de yazmayı belirleyen hesap alanları: `account_status`, `disable_reason`,
  `funding_source_details`, `spend_cap`/`amount_spent`, `capabilities`, `user_tasks` (açıklaması belgede
  boş), `is_prepay_account`, `agency_client_declaration`, `end_advertiser`. [41][R2]

#### 4.4 İzin zinciri API'den nasıl ölçülür

| Katman | Çağrı | Okunacak | "Yok" ne demek | Kaynak |
|---|---|---|---|---|
| Token | `GET /debug_token?input_token=…` (uygulama token'ıyla) | `is_valid`, `scopes`, **`granular_scopes[].target_ids`** (izin yalnız belirli varlıklara verildiyse), `expires_at`, `data_access_expires_at` | `target_ids` yoksa izin "hepsine" | [43] |
| Hesap görevi | `GET /act_{id}?fields=user_tasks` (token sahibinin görevleri — canlıda ölç) ya da `GET /{system_user_id}/assigned_ad_accounts?fields=tasks` ya da `GET /act_{id}/assigned_users?business={ajans_bm}` | `MANAGE/ADVERTISE/ANALYZE/DRAFT/AA_ANALYZE` | `ANALYZE` = yalnız rapor; yazma yolu kapalı | [41][42][R2] |
| Sayfa görevi | `GET /{system_user_id}/assigned_pages?fields=tasks` + `assigned_business_asset_groups?contained_asset_id={page}` | `ADVERTISE` | grup üzerinden gelen izin doğrudan listede görünmez → yalnız doğrudan atamaya bakmak yanlış alarm | [R2] |
| Hesap↔sayfa | `GET /act_{id}/promote_pages` | sayfa listede mi | `pages_show_list` + `pages_manage_ads` ister | [R2] |
| Hesap↔IG | `GET /act_{id}/instagram_accounts` ve `connected_instagram_accounts` | hangisinin reklam kimliği olduğu belgede belirsiz | | [R2] |
| Uygulama statüsü | API'den okunamıyor | Tech Provider doğrulaması | belirti: `100` "nesne yok" | [11] |

- Limited katmanda Business Manager yönetim API'leri kapalı; `assigned_users`/`client_ad_accounts`
  OKUMALARININ çalışıp çalışmadığı belgede belirsiz → canlıda ölç. [1]
- `client_ad_accounts` için "son 30 günde çağırmayan uygulamalar erişimi kaybedebilir" notu var. [R2]

---

## Advetics için tasarım önerileri

### A. Erişim alma planı (adım adım)

| # | Adım | Kim | Bağımlılık | Dayanak |
|---|---|---|---|---|
| A1 | App Dashboard > App Review'da 2026-10-01 başvurusunu aç: hangi izinlerde ekran kaydı/ön kontrol eksik; "ileride lazım" izin (`catalog_management`, `ads_mcp_management`, gerekmiyorsa `read_insights`) var mı. Eksikse **iptal edip daraltılmış başvuru** düşünülmeli (bekleyen varken yenisi yapılamıyor) | Kullanıcı | — | 1.4, [16][47] |
| A2 | Basics > Verifications > **Access verification** (Tech Provider) durumunu gör; yoksa başlat (~5 gün) | Kullanıcı | Business Verification (geçiyor) | [11] |
| A3 | `DURUM.md` §6 ve README §4/§8-1'i düzelt (başvuru incelemede, BV tamam); `DEVAM.md`'ye yaz | Geliştirici | — | 1.4 |
| A4 | Sunucu `.env`'de `META_API_VERSION` v24 değil (v24 bugün bitiyor); v25'te kal, v26'yı canlı turda dene | Geliştirici (deploy kuralları) | — | [24][R4] |
| A5 | **2026-10-27'den önce** iki kök `?ids=` çağrısını nesne başına istek ya da Graph batch'e çevir | Geliştirici | — | [22], 3.10 |
| A6 | `DURUM.md` §7'deki sızmış app secret'ı döndür; sonra `appsecret_proof` + "Require App Secret" | Kullanıcı + geliştirici | Döndürme sonrası tüm token'lar doğrulanmalı | [44] |
| A7 | Ajans BM'inde bir **sistem kullanıcısı** (admin değil, "Employee" yeterli ise o) aç, Advetics uygulamasına ata, müşteri varlıklarını ata (hesap: `ADVERTISE`, sayfa: `ADVERTISE`, IG, pixel), token üret (`ads_management, ads_read, business_management, pages_show_list, pages_read_engagement, pages_manage_ads`; lead için `leads_retrieval` ayrı use case), token kasasına | Kullanıcı (BM admini) | — | [3][58][42] |
| A8 | **Canlı tur** (README §9 + aşağıdaki "Açık sorular" ölçümleri) ajansın KENDİ hesabında, rol sahibi kimlikle; bu tur her izin için "30 gün içinde başarılı çağrı" koşulunu da üretir | Geliştirici + kullanıcı | A4, A7 (ya da admin kullanıcı token'ı) | [1][9][16] |
| A9 | Ekran kayıtları: İngilizce arayüz ya da altyazı; her izin için ayrı uçtan uca kayıt (giriş → izin ekranı → kullanım); `ads_management` için "kural motoru provası → gerçek değişiklik" + "PAUSED kampanya kur ve panelde/Ads Manager'da göster" | Kullanıcı | A8 | [16][17][14] |
| A10 | (A1 sonucuna göre) yeniden başvuru; karar ~1 hafta | Kullanıcı | A8, A9 | [16] |
| A11 | Onay sonrası Access Tier "Request higher limit"; 500 çağrı/15 gün ve <%15 hatayı panelde izle | Kullanıcı + motorun hata oranı sayacı | A10 | [1][7] |
| A12 | Müşterinin kendi bağlantısı için FBL4B yapılandırması (BISU token, varlık seçimi) | Geliştirici | A2, A10 | [13] |
| A13 | Yıllık veri erişimi yenilemesi takvimi (60 gün; kaçırılırsa uygulama kapanır) | Kullanıcı | A10 | [19] |

### B. Kimlik mimarisi

- Token kasasında **bağlantı türü** ayrı tutulur: `kisisel_kullanici` (geçiş dönemi), `sistem_kullanicisi`
  (ajans havuzu), `bisu` (müşterinin kendi bağlantısı). Yazma yolu yalnız son ikisini kabul eder. [3][13]
- Her bağlantı için günlük `debug_token` → `is_valid`, `scopes`, `granular_scopes`; değişince bağlantı
  rozeti ve yazma kapısı güncellenir (sessiz izin kaybı yok). [43][44]
- Yazma çağrıları `appsecret_proof` taşır; app secret yalnız sunucuda. [44]
- Denetim izi: Meta'da aktör her zaman sistem kullanıcısı görünecek; "kim onayladı" Advetics'in kendi onay
  kaydında (asıl cümle + onaylanan plan özeti + zaman) — README §6.3 ile aynı. [34][46]

### C. Yayın akışı: çağrı sırası (tek adımlı yayın onayı kararına göre)

1. **Ön kontrol** (sıfır çağrı önce, sonra ucuz okumalar): taslak sözleşmesi; `debug_token`;
   `act_{id}?fields=account_status,disable_reason,funding_source_details,spend_cap,amount_spent,currency,
   timezone_name,user_tasks,capabilities`; `promote_pages`; `instagram_accounts`; `minimum_budgets`;
   `ads_volume?page_id=`; (video) `GET /{video}?fields=status`. Her madde üç hâlli: geçti / kaldı (sebep)
   / bilinmiyor (neden okunamadı). [R2][R4 §5.4]
2. **Prova**: dört gövdenin `validate_only`'si; reklamda `synchronous_ad_review`; `targetingsentencelines`,
   `reachestimate`, `generatepreviews`. Hata Meta'nın metniyle ve `blame_field_specs` ile ilgili alanın
   yanında. [27][28]
3. **Onay** (panel ya da AI onay kartı — aynı uç): tam plan + taslak sürüm özeti; onay tek kullanımlık,
   taslak değişirse geçersiz. [R4 §6.3]
4. **Yaz** (transaction dışı, sıralı): medya → kampanya → ad set → kreatif → reklam; hepsi `PAUSED`,
   hepsinde `adlabels=[{"name":"advetics"},{"name":"adv-yayin-<yayın kimliği>"}]`; **oluşturmada `fields`
   yok**. [33][31]
5. **Geri oku** (ayrı GET, açık alan listesi; README §5.8 tablosu + `advantage_state_info`,
   `effective_status`, `issues_info`, `ad_review_feedback`); `IN_PROCESS` ise bekle-yokla. Fark varsa
   **açma durur**, fark gösterilir (karar 1). [R4 §5.8][37]
6. **Aç**: kampanya → ad set → reklam(lar) `status=ACTIVE`. [46]
7. **İzle**: webhook + yoklama; "Meta'ya iletildi / incelemede / yayında / sorun var" ayrı etiketler.

### D. Durum makinesi

Her yayının bir **üst durumu**, her Meta nesnesinin bir **satırı** var (`yayin_nesnesi`: tür, sıra,
istek özeti (hash), etiket, `meta_id`, durum, son hata). Platform çağrısı iki kısa transaction arasında
koşar (`CLAUDE.md`: "platform çağrısı transaction'ın içinde olamaz"); taslak başına tek aktif yayın
(DB tekil kısıtı) ve reklam hesabı başına tek yazıcı (Redis kilidi).

| Durum | Giriş | Meta çağrısı | Başarı → | Hata dalları |
|---|---|---|---|---|
| `taslak` | Kullanıcı/AI düzenliyor | yok | `on_kontrol` | — |
| `on_kontrol` | "Meta'ya göster" / "Yayınla" | C-1 listesi (yalnız okuma) | `prova` | `engelli` (kaldı: sebep + ne yapmalı) → `taslak`; `bilinmiyor` maddesi varsa yayın düğmesi kapalı + "doğrulanamadı"; kota → `bekletildi` |
| `prova` | Ön kontrol geçti | `validate_only` ×4 (+`synchronous_ad_review`), `targetingsentencelines`, `reachestimate`, `generatepreviews` | `onay_bekliyor` | `prova_hatasi` (Meta metni + alan) → `taslak` |
| `onay_bekliyor` | Plan ekranda | yok | onay → `medya` | taslak değişti → onay düşer, `taslak` |
| `medya` | Onaylandı | `adimages` (önbellekte hash yoksa); video: `video_ads start` → `rupload` → `status` yoklama → `finish` | `kuruluyor` | geçici → aynı adımda bekle; `video_status=error/expired` → `kurulamadi(medya)`; süre aşımı → `bekletildi` |
| `kuruluyor` | Medya hazır | Sıradaki nesne için ÖNCE satıra `gonderiliyor` yaz, SONRA `POST` (PAUSED + etiket) | satıra `meta_id` + `olusturuldu`; zincir bitince `geri_okuma` | **kesin ret** (doğrulama kodu) → satır `reddedildi`, üst durum `kurulamadi`; **belirsiz** (zaman aşımı, bağlantı kopması, 5xx, kod 1/2, read-after-write hatası, batch'te `null`) → `uzlastirma`; **kota** → başlıktaki süre kadar bekle (deneme sayılmaz, ≤1 saat, sonra `bekletildi`); **kayıt yazılamadı** → satır `gonderiliyor`da kalır, üst durum `kayit_belirsiz` |
| `uzlastirma` | Sonuç belirsiz | `GET /act_{id}/{tür}bylabels` (yayın etiketiyle) + gerekirse `effective_status` süzgeciyle liste | bulundu → kimliği benimse, `kuruluyor`a devam; **bulunamadı ve bekleme penceresi doldu** → aynı adımı AYNI etiketle tekrar | arama da düşerse → `kayit_belirsiz` |
| `geri_okuma` | Zincir kuruldu (hepsi PAUSED) | nesne başına `GET` (açık alanlar), `targetingsentencelines`, `advantage_state_info` | fark yok → `aciliyor` | fark → `fark_var` (açma durur; fark + "kabul et ve aç" ikinci onayı ya da "geri al"); `DISAPPROVED`/`WITH_ISSUES` → `sorunlu` |
| `aciliyor` | Geri okuma temiz (ya da fark kabul edildi) | `POST /{kampanya}` → `/{ad set}` → `/{reklam}` `status=ACTIVE` (her biri niyet satırıyla) | `iletildi` | kısmi → `kismen_acik` ("yayında değil" etiketi + "kaldığı yerden aç"); ret → `sorunlu` |
| `iletildi` | Açıldı | webhook (`field_changed`/`with_issues_ad_objects`/`in_process_ad_objects`) + yoklama 2 dk, 10 dk, 30 dk, 2 sa, 6 sa, 24 sa: `effective_status, configured_status, ad_review_feedback` (ya da `review_feedback` — canlıda hangisi), `issues_info` | üç seviye `ACTIVE` → `yayinda` | `DISAPPROVED` → `sorunlu`; `PENDING_BILLING_INFO` → `sorunlu(odeme)`; 24 sa+ inceleme → kullanıcıya not |
| `yayinda` | Teslim ediliyor | periyodik `effective_status`, `deprecatedtargetingadsets?type=delivery_paused`, `activities` (`application_id` ≠ Advetics → dış değişiklik) | — | `sorunlu`, `durduruldu` |
| `sorunlu` | Ret / sorun | okuma | düzeltme → yeni kreatif + yeni reklam (yalnız o dal) → `prova` | — |
| `kurulamadi` | Kesin hata | — | "düzelt ve kaldığı yerden devam" (açılmış PAUSED kimlikler yeniden kullanılır) → `prova` | "geri al": ters sırada `ARCHIVED` (asla `DELETED`); 7 gün içinde karar verilmezse otomatik arşiv + bildirim |
| `kayit_belirsiz` | Platformda ne olduğu bilinmiyor | **otomatik çağrı YOK** | insan + uzlaştırma aracı | — (`CLAUDE.md`: `failed` değil; ikinci kampanya = para) |
| `bekletildi` | Kota / süre | yok | süre dolunca kaldığı durum | ≥1 saat → kullanıcıya "Meta bu hesap için bekletiyor" |
| `durduruldu` / `arsivlendi` | Kullanıcı | `PAUSED` / `ARCHIVED` | — | — |

Ek kurallar:
- **Kuyruk kaybına karşı tarayıcı:** `kuruluyor`/`uzlastirma`/`aciliyor` durumunda X dakikadan eski
  yayınlar, iş kuyrukta yoksa (BullMQ `getState`, `prioritized` dahil) uzlaştırmayla sürdürülür
  (`CLAUDE.md`: "sync_jobs satırı niyet kaydı, kuyruk gerçek").
- **Son durumu sayan her yer** (`kurulamadi`, `kayit_belirsiz`, `arsivlendi`) aynı commit'te
  güncellenir (`CLAUDE.md`: "bir durum enum'ından ikisini saymak…").
- Yeni bir son durum = durum makinesi testi (her geçiş, mutasyonla).

### E. Hız sınırı yöneticisi

- Her yanıtta (**hata dahil**) üç başlık ayrıştırılır, (hesap, BUC türü) ve (uygulama) anahtarlarıyla
  Redis'e TTL'li yazılır; BUC dizisindeki bütün girdiler okunur, en kötüsü alınır. [32][49][50]
- Politika: <%75 normal; %75–90 arka plan (senkron) yavaşlar; ≥%90 o hesapta arka plan durur, etkileşimli
  yayın sürer; ≥%95 ya da blok → `reset_time_duration` (sn) / `estimated_time_to_regain_access` (dk)
  kadar beklenir, ekranda süre yazılır; toplam bekleme ≤1 saat. [52][49]
- Yayın, senkronizasyonla aynı kotayı paylaştığı için yayın sırasında o hesabın senkron işleri ertelenir
  (BullMQ önceliği bariyer değil → açık "duraklat" bayrağı). [2]
- Hesap başına yazma eşzamanlılığı 1 (QPS 100 sınırı ve sıra). Insights için **uygulama geneli** tek bir
  bütçe (gürültülü komşu). [2]
- Uygulama geneli **hata oranı sayacı** (son 500 Marketing API çağrısı): %8'de uyarı, %12'de tekrar
  döngülerini durdur — Full katman %15'te tehlikede. [1]

### F. Hata sınıflandırıcısı (tek tablo, kod/subcode anahtarlı, testli)

| Sınıf | Kodlar | Okuma | Yazma | Kullanıcıya |
|---|---|---|---|---|
| Geçici | `is_transient:true`, `1`, `2`, `3910001`, HTTP 5xx, ağ hatası | üstel geri çekilme (≤5) | **uzlaştır**, sonra tekrar | yalnız kalıcılaşırsa |
| Uygulama kotası | `4` (+`1504022/1504039`) | uygulama geneli geri çekil | aynı | "Meta yoğun, X dk" |
| Hesap kotası | `17/2446079`, `613/1487742`, `80000/80003/80004/80014` | başlık süresi kadar bekle (`is_transient:false` olsa da) | bekle, sonra uzlaştır | süre |
| QPS | `613/5044001` | yay | hesap başına tek yazıcı | — |
| Bütçe değişiklik sınırı | `613/1487632` | — | bir saat sonraya planla | "Bu saatte bütçe değişiklik hakkı bitti" |
| Reklam oluşturma sınırı | `613/1487225` | — | dur | "Hesabın günlük harcama limiti yeni reklamı sınırlıyor" |
| Kötüye kullanım | `613` (subcode yok), `368` | dur | dur | Meta metni + insan |
| Doğrulama | `100` + `blame_field_specs`, `1487xxx`, `1885xxx`, `1870xxx`, `2446xxx`, `2490xxx` | — | **tekrar yok** | alanın yanında Meta metni |
| Derleyici sözleşmesi | `2446383`, `2446509`, `1885204`, `1487929`, `1885029` | — | dur + geliştirici alarmı (manifestoyu bozan durum) | "Kurulumda hata, ekip haberdar" |
| İzin | `10`, `200`, `283`, `294`, `270` | izin zinciri teşhisi | dur | hangi katman eksik |
| Belirsiz "nesne yok" | `100/33` ve kod 100 "does not exist…" | **izin zinciri + Tech Provider teşhisi**; "silindi" deme | dur | üç hâlli |
| Token | `190`, `102` | bağlantı `needs_reauth` | dur | "Bağlantıyı yenile" |

Her hata kaydı `fbtrace_id`, `x-fb-trace-id`, `X-Ad-Api-Version-Warning` ile saklanır (destek bileti ve
sürüm kayması için). [R1][2][11][49]

### G. Medya hattı

- Görsel: Advetics içerik özetiyle (mevcut `asset_platform_refs`) hesap başına `image_hash` önbelleği;
  yoksa yükle; tekrar yükleme zararsız. [R2][R3]
- Video: büyük ya da kararsız bağlantıda yeni `video_ads` + `rupload` yolu (kesilirse `bytes_transferred`'dan
  devam); küçük dosyada `advideos` + `file_url` (Advetics barındırıyor). `ready` olmadan kreatif kurulmaz;
  yoklama 5 sn → 30 sn → 2 dk, üst sınır 30 dk, sonra `bekletildi`; `error/expired` → kullanıcıya. Video
  kreatifinde küçük resim zorunlu. [35][36][46]
- Sistem kullanıcısı token'ıyla video yolu canlıda ölçülmeden yayın yoluna konmaz. [35]

### H. Yayın sonrası izleme

- Uygulama aboneliği bir kez (`with_issues_ad_objects`, `effective_status`, `in_process_ad_objects`;
  ileride `creative_fatigue`). Hesap aboneliği (`subscribed_apps`) her atanan hesapta denenir; admin token
  yoksa düşer → hesap kartında "Anlık bildirim: yok (yetki)" (`emptyReason`), yalnız yoklama. [38]
- Uç: ham gövdeyle `X-Hub-Signature-256` doğrulama; hızlı 200; kuyruğa al; `entry.id + change.field +
  nesne kimliği + time` ile tekilleştir; `field_changed` dalı ayrı; her bildirim bir okuma işi
  (değer bildirimde yok). [38][39]
- Yoklama her zaman açık (webhook teslimi garanti değil, 36 saatte düşüyor): C-7 takvimi. [39]

### I. Çoklu müşteri korumaları

- **Hesap = müşteri** (10.5): yayın, taslağın workspace'ine atanmamış bir hesaba yazamaz; aynı hesapta
  iki workspace'in reklamı kurulmaz. [20]
- Şeffaflık hazırlığı (2027-02-03): rapor, harcamayı (Meta faturası) ajans ücretinden ayrı ve kampanya
  ayarlarını **Meta terimleriyle** (amaç, optimizasyon, atıf…) dışa aktarabilmeli. [20]
- `ads_volume` her yayında okunur; sınır sabit kodlanmaz. [40][55]
- Hesap yetenekleri üç hâlli (`yazma_acik: true/false/null`) ve sebebiyle tutulur; `null` iken uyarı yok,
  "doğrulanamadı" yazılır (`CLAUDE.md` "görünmeyen satırı yok saymak"). [R2]

### J. "İlk canlı yayına kadar" yapılacaklar

**Bu hafta (yayın motorundan bağımsız, acil)**
1. A1–A3: bekleyen App Review'u gözle incele, Access verification durumunu gör, depo belgelerini düzelt.
2. A4: sunucu `META_API_VERSION` ≠ v24.
3. A5: kök `?ids=` → 2026-10-27'den önce.
4. A6: app secret döndürme + `appsecret_proof`.

**Erişim**
5. A7: ajans sistem kullanıcısı + varlık atamaları + token kasası (bağlantı türü alanı).

**Motor (Aşama 1 — saf fonksiyonlar + testler)**
6. Niyet satırı tablosu (+ TRUNCATE/RLS/`WORKSPACE_TABLOLARI` üç durağı), durum makinesi, etiketleme,
   uzlaştırma, `kayit_belirsiz`.
7. Hata sınıflandırıcı tablosu (kod/subcode) + mutasyon testleri.
8. Hız sınırı yöneticisi (hata yanıtında başlık okuma testi dahil).
9. Geri okuma karşılaştırıcı (README §5.8 alanları + `advantage_state_info`).
10. Medya hattı (`video_ads` yoklaması).
11. Webhook ucu + `subscribed_apps` + yoklama yedeği.

**Canlı tur (ajansın kendi hesabı, rol sahibi kimlik, Limited katman)**
12. README §9 listesi + aşağıdaki ölçümler.
13. Her niyet satırı için PAUSED ağaç → geri oku → önizle → Ads Manager'da gözle karşılaştır → arşivle.

**İlk gerçek yayın (en güvenli prosedür)**
14. Ajansın kendi hesabı ve sayfası; ödeme yöntemi var; hesap harcama limiti (Ads Manager'dan, insan
    eliyle) bugünkü harcamanın biraz üstüne çekilir — yeni limit yalnız sonraki harcamaya uygulanır. [41]
15. En basit niyet (site trafiği); ad set `lifetime_budget` = hesap asgarisine yakın, `end_time` = 24 saat;
    konum TR; Advantage+ kitle ve yerleşim açık (karar 2).
16. Prova → onay → PAUSED kur → geri oku (fark yok) → aç (yukarıdan aşağı).
17. 2 dk / 10 dk / 30 dk aralıkla `effective_status`; inceleme sonucu (çoğu 24 saat); ilk gösterim ve
    harcama görülünce (ya da 24 saatte) `PAUSED` → `ARCHIVED`. [45]
18. Tutanak: her isteğin/yanıtın (token'sız) ve başlıkların kaydı, `fbtrace_id`'ler; README'deki her
    "[Belge]" kuralı "[Canlı]" olur ya da düzeltilir.
19. Aynı kayıtlar ekran kaydı malzemesi ve "30 gün içinde başarılı çağrı" kanıtı olur → A9/A10.

---

## Açık sorular ve doğrulanması gerekenler

**Kullanıcıya sorulacaklar**
1. 2026-10-01 başvurusunu kim, hangi ekran kayıtlarıyla yaptı? İptal edilip daraltılmalı mı
   (`catalog_management`, `ads_mcp_management`)?
2. Ajans BM'inde sistem kullanıcısına geçiş onayı (BM admini gerekiyor); müşteri sayfalarının ajansa
   "reklam" izniyle paylaşılıp paylaşılmadığı.
3. İlk gerçek harcama testi için TL tavanı, hangi hesap ve sayfa.
4. Müşterinin kendi bağlantısı (FBL4B/BISU) hangi aşamada açılacak?
5. Şeffaflık (10.6.a) için ajans ücretinin Advetics'te tutulup tutulmayacağı.

**Canlıda ölçülecekler (nasıl)**
6. **Sandbox:** Marketing API > Tools / Quickstart'ta sandbox hesabı açılıyor mu; o hesapta kreatif ve
   reklam oluşuyor mu; insights dönüyor mu (üç Meta kaynağı çelişiyor).
7. **İç içe prova:** ad set'te `campaign_spec`, reklamda `adset_spec` + satır içi kreatif +
   `synchronous_ad_review` tek çağrıda kabul ediliyor mu; `validate_only` App Review'un "başarılı çağrı"
   sayacına giriyor mu.
8. **read-after-write:** kasıtlı yanlış `fields` ile PAUSED kampanya oluşturma → nesne açıldı mı (uzlaştırma
   gerekçesini kanıtlar; hemen arşivlenir).
9. **Etiket uzlaştırması:** satır içi `adlabels` adla oluşturma; `campaignsbylabels` gecikmesi; PAUSED ve
   ARCHIVED nesneleri döndürüyor mu.
10. **Kota hatası ve mutasyon:** throttle yanıtında nesne açılıyor mu (gözlem); başlıklar hata yanıtında
    geliyor mu.
11. **`user_tasks`** sistem kullanıcısı token'ında ne döndürüyor; Limited katmanda `assigned_users` ve
    `client_ad_accounts` okumaları çalışıyor mu.
12. **Video:** `video_ads` yolu sistem kullanıcısı token'ıyla çalışıyor mu; işlenme süreleri; `advideos`
    `file_url` ile farkı.
13. **Webhook:** yalnız `ADVERTISE` görevli müşteri hesabında `subscribed_apps` reddediliyor mu; bildirim
    gecikmesi; `field_changed` yükünün biçimi.
14. **v26:** mağazası olan hesapta `destination_spec` varsayılanı; HOUSING kurulumunda `advantage_audience:1`
    kabulü; kök `?ids=`'in Marketing API nesnelerinde de 2026-10-27'de düştüğü (test ortamında v26 ile).
15. **`PUBLISHING`/`IN_PROCESS`** sonrası alanların geri okumada ne kadar sürede oturduğu.
16. **İnceleme süresi** Türkiye hesaplarında (24 saat tipik).
17. **Access Tier sayacı:** 500 çağrı ve hata oranının panelde nerede göründüğü (Graph uygulama kartı
    Marketing API çağrılarını saymıyor).
18. **Otomatik sürüm yükseltme** ayarının varsayılanı (iki Meta sayfası çelişiyor).
18a. **Ret sebebi alanı:** `ad_review_feedback` mı `review_feedback` mı döndüğü (webhook sayfası ile
    reklam referansı çelişiyor); kasıtlı reddedilecek bir test reklamıyla değil, ilk doğal retle ölçülür.

**Belgede belirsiz kalanlar**
19. Sistem kullanıcısının Standard Access açısından "uygulamada rolü olan kullanıcı" sayılıp sayılmadığı.
20. Video sayfasındaki "işletme hesaplarına video yükleme henüz yok" ve `CREATE_CONTENT` notunun anlamı.
21. v26 sonrası `delivery_estimate`'te hangi alanların kaldığı.
22. Webhook teslim/yeniden deneme kurallarının `ad_account` nesnesi için de aynı olduğu (genel belge).

---

## Kaynaklar

| # | Başlık | URL | Tarih | Etiket |
|---|---|---|---|---|
| 1 | Marketing API — Authorization | https://developers.facebook.com/documentation/ads-commerce/marketing-api/get-started/authorization | 2026-05-05 | Resmî-Meta |
| 2 | Marketing API Rate Limiting | https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview/rate-limiting | 2026-05-05 | Resmî-Meta |
| 3 | Marketing API — Authentication | https://developers.facebook.com/documentation/ads-commerce/marketing-api/get-started/authentication | tarih yok (2026-10-06 okundu) | Resmî-Meta |
| 4 | Marketing API — Best Practices (Testing) | https://developers.facebook.com/documentation/ads-commerce/marketing-api/best-practices | tarih yok | Resmî-Meta |
| 5 | Developers Sandbox Mode (blog) | https://developers.facebook.com/ads/blog/post/v2/2016/10/19/sandbox-ad-accounts/ | 2017-02-08 | Resmî-Meta (eski olabilir) |
| 6 | Marketing API Sandbox capability now re-enabled | https://developers.facebook.com/blog/post/2023/06/21/marketing-api-sandbox-capability-now-re-enabled/ | 2023-06-21 | Resmî-Meta (eski olabilir) |
| 7 | Marketing API Use Cases (App Dashboard) | https://developers.facebook.com/docs/development/create-an-app/marketing-api-use-cases/ | 2025-09-09 | Resmî-Meta |
| 8 | Test Users | https://developers.facebook.com/documentation/development/build-and-test/test-users | 2026-04-17 | Resmî-Meta |
| 9 | Graph API — Access Levels | https://developers.facebook.com/docs/graph-api/overview/access-levels | tarih yok | Resmî-Meta |
| 10 | Business Verification (geliştirici) | https://developers.facebook.com/documentation/development/release/business-verification | tarih yok | Resmî-Meta |
| 11 | Access Verification | https://developers.facebook.com/documentation/development/release/access-verification | 2024-12-12 | Resmî-Meta |
| 12 | Tech Providers | https://developers.facebook.com/docs/development/release/tech-providers/ | tarih yok | Resmî-Meta |
| 13 | Facebook Login for Business | https://developers.facebook.com/docs/facebook-login/facebook-login-for-business/ | tarih yok | Resmî-Meta |
| 14 | Permissions Reference | https://developers.facebook.com/docs/permissions/ | tarih yok | Resmî-Meta |
| 15 | Features Reference (Marketing API Access Tier) | https://developers.facebook.com/docs/features-reference/ | tarih yok | Resmî-Meta |
| 16 | App Review — Tutorial | https://developers.facebook.com/documentation/resp-plat-initiatives/appreview/tutorial | 2026-06-30 | Resmî-Meta |
| 17 | App Review — Screen Recordings | https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings/ | tarih yok | Resmî-Meta |
| 18 | Pre-app Review Development (2-Tier BM) | https://developers.facebook.com/docs/business-management-apis/2tier-bm-solution/pre-app-review-development/ | tarih yok | Resmî-Meta |
| 19 | Data Access Renewal — FAQ / Tutorial | https://developers.facebook.com/documentation/resp-plat-initiatives/data-access-renewal/faqs | 2024-11-11 | Resmî-Meta |
| 20 | Updating Our Transparency Requirements for Ad-Buying Solutions | https://developers.facebook.com/blog/post/2026/04/28/updating-our-transparency-requirements-for-ad-buying-solutions/ | 2026-04-28 | Resmî-Meta |
| 21 | Introducing Graph API v26.0 and Marketing API v26.0 | https://developers.facebook.com/blog/post/2026/07/29/introducing-graph-api-v26-and-marketing-api-v26/ | 2026-07-29 | Resmî-Meta |
| 22 | Graph API Changelog — v26.0 | https://developers.facebook.com/docs/graph-api/changelog/version26.0/ | 2026-07-29 | Resmî-Meta |
| 23 | Graph API Changelog (sürüm tabloları) + Meta geliştirici blogu dizini | https://developers.facebook.com/docs/graph-api/changelog/ ; https://developers.facebook.com/blog/ | 2026-10-06 okundu | Resmî-Meta |
| 24 | Marketing API Versions | https://developers.facebook.com/documentation/ads-commerce/marketing-api/marketing-api-changelog/versions | 2026-10-06 okundu | Resmî-Meta |
| 25 | Marketing API Versioning (auto-upgrade) | https://developers.facebook.com/documentation/ads-commerce/marketing-api/overview/versioning | tarih yok | Resmî-Meta |
| 26 | Meta's ads MCP server is now available for developers | https://developers.facebook.com/blog/post/2026/07/16/meta-ads-mcp-server/ | 2026-07-16 | Resmî-Meta |
| 27 | Ad / Ad Account Ads referansı (`execution_options`, `status`, alanlar) | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/ads ; …/reference/adgroup | tarih yok | Resmî-Meta |
| 28 | Ad Account Adsets / Campaigns / Adcreatives referansları | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/adsets (ve kardeşleri) | tarih yok | Resmî-Meta |
| 29 | Asynchronous and Batch Requests | https://developers.facebook.com/documentation/ads-commerce/marketing-api/asyncrequests | tarih yok | Resmî-Meta |
| 30 | Graph API — Batch Requests | https://developers.facebook.com/docs/graph-api/batch-requests | tarih yok | Resmî-Meta |
| 31 | Graph API Overview — read-after-write | https://developers.facebook.com/docs/graph-api/overview | tarih yok | Resmî-Meta |
| 32 | Graph API Rate Limiting (başlıklar) | https://developers.facebook.com/docs/graph-api/overview/rate-limiting | tarih yok | Resmî-Meta |
| 33 | Ad Label referansı | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-label | tarih yok | Resmî-Meta |
| 34 | Ad Activity referansı | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-activity | tarih yok | Resmî-Meta |
| 35 | FB Video Ads (`video_ads` + `rupload`) | https://developers.facebook.com/documentation/ads-commerce/marketing-api/guides/videoads/fbvideoads | 2026-05-21 | Resmî-Meta |
| 36 | Ad Account Ad Videos (`/advideos`) | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/advideos | tarih yok | Resmî-Meta |
| 37 | Post-Processing (`IN_PROCESS`, `WITH_ISSUES`) | https://developers.facebook.com/documentation/ads-commerce/marketing-api/using-the-api/post-processing | tarih yok | Resmî-Meta |
| 38 | Ads Webhooks — Get started / Effective status / With-issues | https://developers.facebook.com/documentation/ads-commerce/marketing-api/ads-webhooks/setup/get-started | tarih yok | Resmî-Meta |
| 39 | Webhooks — Getting Started (teslim, 36 saat) | https://developers.facebook.com/docs/graph-api/webhooks/getting-started/ | tarih yok | Resmî-Meta |
| 40 | Ad Volume | https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights-api/ads-volume | tarih yok | Resmî-Meta |
| 41 | Ad Account düğümü | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account | tarih yok | Resmî-Meta |
| 42 | Ad Account Assigned Users / System User Assigned Ad Accounts | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-account/assigned_users ; …/system-user/assigned_ad_accounts | 2021 | Resmî-Meta (eski olabilir) |
| 43 | `debug_token` referansı | https://developers.facebook.com/docs/graph-api/reference/debug_token/ | tarih yok | Resmî-Meta |
| 44 | Login Security / Secure Requests (`appsecret_proof`) | https://developers.facebook.com/documentation/facebook-login/security | 2026-06-30 | Resmî-Meta |
| 45 | Introduction to the Advertising Standards (inceleme süresi) | https://transparency.meta.com/policies/ad-standards/ | tarih yok | Resmî-Meta |
| 46 | Meta Ads MCP canlı araç tanımları (`ads_activate_entity`, `ads_create_ad`, `ads_creative_upload_media`, `ads_get_errors`) | mcp.facebook.com/ads (`tools/list`; araç çağrılmadı) | 2026-10-06 okundu | Resmî-Meta · canlı şema |
| 47 | Meta Social Technologies MCP salt-okuma (`app_list`, `app_review` status/privileges/requirements/history, `compliance`, `api_usage`) | mcp.facebook.com/devtools | 2026-10-06 | Resmî-Meta · canlı okuma |
| 48 | facebook-python-business-sdk `api.py` | https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/api.py | 2026-10-06 okundu | Resmî-Meta (kod) |
| 49 | Airbyte issue #86316 (kod 17/2446079) | https://github.com/airbytehq/airbyte/issues/86316 | 2026-09-15 | Sektör |
| 50 | Airbyte PR #86490 (kota bloğu bekleme) | https://github.com/airbytehq/airbyte/pull/86490 | 2026-09-21 | Sektör |
| 51 | wir-drei-digital/meta-ads-cli | https://github.com/wir-drei-digital/meta-ads-cli | tarih yok | Topluluk |
| 52 | faborsky/meta-ads-app | https://github.com/faborsky/meta-ads-app | tarih yok | Topluluk |
| 53 | Keboola — Sandbox Ad Account Testing Environment | https://github.com/keboola/ex-facebook-graph-api/wiki/Sandbox-Ad-Account-Testing-Environment | 2018-05-22 | Topluluk (eski olabilir) |
| 54 | 360dialog — Meta Business Verification | https://docs.360dialog.com/docs/resources/meta-business-verification | tarih yok | Sektör |
| 55 | PPC Land — Meta drops 250-ad Page cap in some accounts | https://ppc.land/meta-drops-250-ad-page-cap-in-some-accounts-as-286-ads-keep-running/ | 2026-09-23 | Sektör |
| 56 | Meta Social Technologies MCP (belge; salt-okuma araçlarının tanımı) | https://developers.facebook.com/documentation/mcp/devtools-mcp | 2026-09-08 | Resmî-Meta |
| 57 | Launching Access Verification Process for Tech Provider Apps | https://developers.facebook.com/blog/post/2022/06/02/access-verification-process-for-tech-provider-apps/ | 2022-06-02 | Resmî-Meta (eski olabilir) |
| 58 | Create an admin system user (Managed Partner Ads) | https://developers.facebook.com/documentation/ads-commerce/marketing-api/collaborative-ads/managed-partner-ads/api-guide/prerequisites/create-system-user | 2026-06-21 | Resmî-Meta |
| 59 | Ads CLI (get started, tutorials) — `kaynak/ads-ai-connectors__ads-cli__*` | https://developers.facebook.com/documentation/ads-commerce/ads-ai-connectors/ads-cli/ads-cli-overview | 2026-04-29 (tanıtım) | Resmî-Meta |
| R-build | Build and Test (uygulama modları, test API çağrıları) | https://developers.facebook.com/docs/development/build-and-test | 2025-05-05 | Resmî-Meta |
| R-insights | Insights — Limits and Best Practices | https://developers.facebook.com/documentation/ads-commerce/marketing-api/insights/best-practices | 2026-05-05 | Resmî-Meta |
| R1 | `bolumler/01-temel-yapi-ve-ai-baglayicilari.md` | depo | 2026-10-06 | Depo (belgeden derlenmiş) |
| R2 | `bolumler/09-hesap-business-ve-varliklar.md` | depo | 2026-10-06 | Depo (belgeden derlenmiş) |
| R3 | `bolumler/00-advetics-mevcut-durum.md` | depo | 2026-10-06 | Depo (kod okuması) |
| R4 | `README.md` (brief, kullanıcı kararları) | depo | 2026-10-06 | Depo |
