# Workspace kurulum rehberi (mimari)

**Tarih:** 2026-10-12 · **İstek (kullanıcı):** bir şirket gelip bir ya da
birden çok projesi için reklam vermek istediğinde her projenin AYRI Meta
reklam hesabı, Google Ads hesabı, Tag Manager ve Analytics'i olmalı. Ajans
hesap atamıyorsa workspace'te kurulum rehberi: önce reklam hesapları, sonra
dönüşüm kurulumu ve verinin doğru ölçüldüğüne dair KESİN bir doğrulama, en
son reklam açmak için gereken her şeyin Marka Merkezi'nde dolu olması. Ajans
atadıysa workspace'e girince eksikler görünür ve TEK TUŞLA tamamlanır.

## Çelişki tablosu (kullanıcıyla kapandı, 2026-10-12)

| # | Brief | Gerçek | Karar |
|---|---|---|---|
| Ç-1 | "İki ayrı GTM hesabı, iki ayrı GA hesabı" | Tag Manager API'si HESAP açamıyor; Analytics hesabı ancak tarayıcıda şartlar kabul edilerek açılıyor | **Proje başına ayrı KONTEYNER + ayrı GA4 MÜLKÜ** (ajansın ya da şirketin hesabı altında). Ayrı kod, ayrı veri; ayrım tam |
| Ç-2 | Hesapları kimin adına açalım | Meta: Business Manager altında API ile açılıyor. Google Ads: yalnız yönetici hesap (MCC) altında API ile açılıyor. Ödeme yöntemini İKİSİ DE API'den eklemiyor | **İkisi de seçilebilir**: ajansın BM/MCC'si ya da şirketin kendi bağlantısı. Ödeme yöntemi şirketin işi; rehber platformun ödeme sayfasına götürür ve durumu okur |
| Ç-3 | Kodu siteye kur | Advetics sitenin içine yazamaz | Kod gösterilir, tek tıkla geliştiriciye e-postayla gönderilir (`mailto:`), site taranarak kurulduğu OTOMATİK doğrulanır |
| Ç-4 | Deneme için workspace sil | Şirkette yalnız Ege Birlik Yapı var (bütün canlı tur geçmişi) | **Silinmez**; denemek için yeni bir workspace açılır |
| Ç-5 | Google Tag Manager/Analytics izni | Google bağlantısının tek izni `adwords` | İzin GENİŞLETME akışı: "Ölçüm izinlerini ver" aynı Google kimliğini ek izinlerle yeniden onaylatır (`include_granted_scopes`). Google Cloud'da onay ekranına izinlerin eklenmesi ve üç API'nin açılması kullanıcının işi (`BAGLANTI.md`) |

## Adımlar

Üç grup, sırayla. Her adım `{durum, neden, eylem}` taşır; durum
`tamam | eksik | kullanicida | hata | atlandi`. **Kullanıcıda**: sistemin
yapamayacağı, kullanıcının platformda yapması gereken iş (ödeme yöntemi,
site kodu). Eylem türleri: `otomatik` (tek tık), `secim` (mevcut seç ya da
yeni aç), `dis` (platformun sayfası), `izin` (OAuth), `girdi`.

| Kod | Grup | İş | "Eksikleri tamamla" yapar mı |
|---|---|---|---|
| `meta_hesap` | hesaplar | Meta reklam hesabı: mevcut ata / BM altında yeni aç | Hayır (gerçek hesap açar, seçim ister) |
| `meta_odeme` | hesaplar | Ödeme yöntemi (`account_status`, `funding_source_details`) | Hayır (kullanıcıda) |
| `sayfa` | hesaplar | Facebook sayfası (+ bağlı Instagram) ata. Sayfa API ile AÇILAMIYOR | Tek sayfa varsa evet |
| `google_hesap` | hesaplar | Google Ads: mevcut ata / MCC altında yeni aç / mevcut hesaba MCC bağlantı daveti | Hayır |
| `google_odeme` | hesaplar | Faturalandırma (`billing_setup`) | Hayır (kullanıcıda) |
| `google_izin` | olcum | Tag Manager + Analytics izinleri | Hayır (OAuth onayı) |
| `gtm_konteyner` | olcum | Proje konteyneri: sitede görülen konteyner erişilebiliyorsa o, değilse yeni | Evet (tek GTM hesabı varsa) |
| `ga4_mulk` | olcum | GA4 mülkü + web veri akışı: sitedeki G- kimliği erişilebiliyorsa o, değilse yeni | Evet (tek GA hesabı varsa) |
| `meta_piksel` | olcum | Hesabın pikseli (hazırlığın seçtiği) ya da yeni piksel | Evet |
| `ads_donusum` | olcum | Google Ads dönüşüm işlemleri: form, telefon tıklaması, WhatsApp. Aynı kategoride BİRİNCİL işlem varsa açılmaz (çift sayım) | Evet |
| `ga4_ads_bag` | olcum | GA4 ↔ Google Ads bağlantısı + `generate_lead` anahtar etkinliği | Evet |
| `gtm_etiket` | olcum | Etiketler (Google etiketi, Meta pikseli, Ads dönüşümleri, dönüşüm bağlayıcı, form/telefon/WhatsApp olayları) + yayın | Form tetiği seçildiyse evet |
| `site_kodu` | olcum | Sitede konteyner kodu görülüyor mu (tarama) | Hayır (kullanıcıda) |
| `dogrulama` | olcum | Canlı olay: GA4 anlık rapor + Meta piksel istatistiği | Hayır (kullanıcı formu bir kez doldurur) |
| `marka` | marka | Hazır workspace hazırlığı (`workspace_hazirlama`) | Var olan kart |

## Güvenlik kararları (sessiz hata ve çift sayım)

- **Başkasının konteynerini yayınlamak**: yayından önce son sürüm ile canlı
  sürüm karşılaştırılır; farklıysa (yayınlanmamış başka değişiklik var)
  YAYINLANMAZ, kullanıcıya söylenir. Bizim değişikliklerimiz ayrı bir
  çalışma alanında (`Advetics`) yapılır.
- **Çift sayım**: konteynerde aynı G- kimliğine bakan Google etiketi, aynı
  pikseli başlatan HTML ya da sitede zaten yüklü piksel/GA4 varsa o parça
  eklenmez ve adımın nedeninde yazar. Etiket adları `Advetics · …`; yeniden
  koşunca güncellenir, çoğaltılmaz.
- **Google Ads birincil dönüşüm**: kategoride birincil işlem varsa yenisi
  açılmaz.
- **Gerçek hesap açan adımlar** (`meta_hesap`, `google_hesap`) asla
  "Eksikleri tamamla"ya girmez; seçim ve onay ister.
- **Yetki**: okuma `client.read`, yazma `client.write`; hesap açma ve
  atama ayrıca `connection.write`.

## Veri modeli

`workspace_kurulum` (client_id PK, org_id, hesap_sahibi, meta_business_id,
google_mcc_id, gtm_hesap_id, gtm_konteyner_yolu, gtm_kimligi (GTM-…),
gtm_calisma_alani_yolu, gtm_yayin (jsonb), ga4_hesap_id, ga4_mulk_id,
ga4_akis_yolu, ga4_olcum_kimligi (G-…), ga4_ads_bagli, ads_donusumleri
(jsonb), donusum_tetigi (jsonb), adim_notlari (jsonb: son hata/atlanan
parça), son_dogrulama (jsonb), created/updated). RLS, TRUNCATE, workspace
taşıma kararı: workspace'le gider.

## Uçlar

- `GET /clients/:id/kurulum` → `KurulumYaniti` (veritabanından, ucuz).
- `GET /clients/:id/kurulum/secenekler?kod=` → seçim listesi (BM'ler, MCC'ler,
  GTM/GA hesapları, sayfalar) — platforma gider.
- `POST /clients/:id/kurulum/adim` → tek adım (`kurulumIstegiSchema`).
- `POST /clients/:id/kurulum/tamamla` → otomatik adımlar sırayla; ilk
  kullanıcı işi gerektiren adımda durmaz, onu atlar ve sonuç listesinde söyler.
- `POST /connections/:id/reauthorize?platform=google&kapsam=olcum` → izin.

## Ölçülmeyen (canlıda ilk kullanımda gözle)

Hiçbir yazma yolu henüz canlıda koşmadı. Özellikle: Meta `/{bm}/adaccount`
(uygulamanın Business Management erişim düzeyi), Google
`createCustomerClient`, GTM etiket parametre adları (`googtag`, `gaawe`,
`awct`, `gclidw`, `linkClick` filtresi), GA4 `googleAdsLinks` için
kullanıcının Ads hesabında yönetici olması şartı, Google Ads
`tag_snippets` biçimi. Meta saat dilimi kimliği tahmin edilmez: aynı
BM'deki İstanbul saatli bir hesaptan okunur, yoksa adım nedeniyle durur.

## Ajan 4 (2026-10-12) — kapıyı kapatan bulgular ve kararlar

- **B1** ödeme kontrolünün sonucu başarıda siliniyordu → sonucu not olan
  adımlarda not korunur.
- **B2** tek platform hatası adımı kalıcı kilitliyordu → hata hücresi
  eylemini ve otomatikliğini korur, mesaj nedene yazılır.
- **B3** açılan hesap atanmadan düşerse ikinci hesap açılıyordu → açılan
  kimlik hemen yazılır (`meta_acilan_hesap`, `google_acilan_hesap`),
  yeniden denemede yalnız bul-ata; workspace başına tek işlem kilidi.
- **B4** iki workspace aynı konteyneri paylaşınca birbirinin etiketini
  eziyordu → `gtm_konteyner_yolu` tekil.
- **B5** okunamayan site "kod yok" sayılıyordu → otomatik konteyner/mülk
  açılmaz, etiket yayınlanmaz; karar kullanıcıda.
- Ö: piksel ve Google etiketi sayfa başına bir kez (`oncePerLoad`); yazarken
  yeni sürüm oluşursa yayın yok, yarım kalan kendi sürümümüz engel değil;
  kimliği okunamayan dönüşüm "tamam" değil; harcamalı hesapta birincil
  dönüşüm yalnız düğmeyle; havuzdaki tek sayfa asla otomatik atanmaz; ajans
  havuzu ile şirket havuzu `org_id` ile ayrılır; seçenek listesi yazma
  yetkisi ister; `end_advertiser` sayfa kimliği ya da NONE; Türkçe karakterli
  teşekkür yolu yüzde kodlu da eşleşir; konteynerde başkasının Lead/GA4
  form etiketi varsa ikincisi eklenmez.
- Açık: bölge cevabı iki işlem (hazırlık modülü), eski konteynere geçince
  eski konteynerdeki `Advetics ·` etiketleri yayında kalır (uyarı yok).
