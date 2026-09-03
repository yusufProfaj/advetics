# Advetics — Durum ve Yol Haritası

> **Son güncelleme:** 2026-09-02
> **Kaynak:** Bu belge koddan doğrulanarak yazıldı, hafızadan değil. Her iddia
> için dosya yolu verilmiştir; şüphe duyduğun satırı açıp bakabilirsin.
>
> `ARCHITECTURE.md` **planı** anlatıyor (2026-08-03'te yazıldı). Bu belge
> **gerçekte ne olduğunu** anlatıyor. İkisi çeliştiğinde bu belge geçerli.

---

## 1. Tek bakışta

| | 2026-08-11 | 2026-09-02 |
|---|---|---|
| Veritabanı tablosu | 37 | **53** |
| Migration | 17 | **54** |
| API testi | 694 ¹ | **2.225** |
| Web testi | 20 ¹ | **392** |
| Panel sayfası | 16 | **29** |
| API controller | 17 | **25** |
| RLS politikası | 95 | **155** |
| Rol | 5 | **7** |
| Yetki anahtarı | — | **34** |
| Zamanlanmış süpürme | 8 | **14** |

Sol sütun 11 Ağustos'taki commit'ten (`b5a0acc`) SAYILDI, sağ sütun bugünkü
koddan — ikisi de hafızadan değil. ¹ İşaretli iki satır belgenin o günkü kendi
metninden: test sayısı koşmadan ölçülemiyor.

**Belgenin kendi sayısı da kaymıştı:** "41 tablo" yazıyordu, o commit'te 37
vardı. Bu satırlar elle güncellendiğinde kayıyor; bir sonraki güncellemede de
ölçerek yaz.

**Üç cümlelik özet:**

**Okuma tarafı iki platformda da canlı.** Meta zaten çalışıyordu; Google Basic
Access 11 Ağustos'ta alındı ve aynı gün baştan sona doğrulandı — 129 hesap
keşfi, yapı senkronizasyonu, metrikler. Hesap toplamı kampanya toplamına
kuruşuna kadar eşit çıktı.

**Yazma tarafı hiçbir platformda canlıda çalıştırılmadı.** Kural aksiyonları,
boost oluşturma, toplu reklam ve Reklam Oluşturucu — dördü de `ads_management`
onayı olmadan çalıştırılamazdı. Bkz. § 5.

**Rapor ve panel tarafı 11–28 Ağustos arasında büyük ölçüde yeniden yazıldı:**
sunucu PDF'i, e-posta gönderimi, üç varsayılan şablon, kitle kırılımları, iki
yeni rol, MCC müşteri görünümü, uyarı bandı ve toplu veri tazeleme. Ayrıntı
§ 3.6'da.

---

## 2. Workspace mimarisine göre kapsama

Senin paylaştığın 7 parçalı mimariye göre. ✅ tamam · 🟡 kısmi · ❌ yok

### 1 — WORKSPACE & AGENCY MANAGEMENT ✅

| Yetenek | Durum | Nerede |
|---|---|---|
| Çoklu kiracı (org → müşteri → kullanıcı) | ✅ | `prisma/schema.prisma` |
| Rol ve yetki matrisi — **7 rol, 34 yetki** | ✅ | `packages/shared/src/auth/roles.ts` |
| RLS — **151 politika**, `FORCE` edilmiş | ✅ | `prisma/sql/02_rls.sql` |
| Beyaz etiket (logo, renk, font) | ✅ | `branding_profiles` |
| Denetim kaydı (append-only) | ✅ | `audit_logs` |
| ~~Davet akışı~~ | ❌ **KALDIRILDI** | Token üretilip hash'leniyor ve düz metni ATILIYORDU; e-posta altyapısı olmadığı için üretimde kimse daveti kabul edemiyordu. Kullanıcı artık doğrudan oluşuyor, parolayı yönetici belirleyip elden iletiyor. `invitations` tablosu şemada YOK — bu satır 17 gün boyunca yanlış duruyordu |
| Müşteri altında **çoklu proje/hesap** | ✅ | Bütçe ve kurallar hesap bazlı ayrışıyor |

### 2 — BASE (Bilgi Bankası, Kitle, Anahtar Kelime, Varlık) ❌

| Yetenek | Durum | Not |
|---|---|---|
| Bilgi bankası (marka sesi, ürün bilgisi) | ❌ | Hiç başlanmadı |
| Kitle kütüphanesi | ❌ | Meta'da `custom_audiences` çekilmiyor |
| Anahtar kelime kütüphanesi | ❌ | Performans verisi geliyor; kütüphane (kayıtlı liste) yok |
| **Görsel/video varlık arşivi** | 🟡 | `/kutuphane/gorseller` — görsel + logo, mükerrer engeli, hesap başına hash önbelleği; reklam oluşturucu ve toplu oluşturucuya bağlı |
| **Form kütüphanesi (Anlık Form)** | 🟡 | `/kutuphane/formlar` — sürümleme çalışıyor, Meta yayını doğrulanmadı |

**Bu bölümün ilk parçası doldu.** Formlar kütüphanesi 12 Ağustos'ta yazıldı;
geri kalanı (bilgi bankası, kitle, varlık arşivi) hâlâ boş. Modül 8'in (toplu
oluşturucu) gerçek verimi varlık arşivine bağlı: şu an her satıra `image_hash`
elle giriliyor.

**Formlar kütüphanesindeki tasarım problemi ve çözümü:** Meta'da yayınlanmış
form DEĞİŞTİRİLEMİYOR — kullanıcı belirli bir onay metnini kabul ederek veri
verdi ve o metnin sonradan değişmesi onayı geçersiz kılar. "Düzenle" bu yüzden
yeni bir satır (yeni sürüm) üretiyor; `root_id` zinciri, `superseded_by_id`
ileri bağlantıyı tutuyor ve kütüphane yalnızca zincirin son halkasını
listeliyor. Form ADI bunun dışında: yalnızca panelde görünüyor, Meta'ya
gitmiyor, bu yüzden değişmesi yeni sürüm gerektirmiyor — aksi hâlde yazım
hatası düzeltmek Meta'da çöp form biriktirirdi.

**Arayüzün açıkça söylediği ve kolay gözden kaçan şey:** yeni sürüm YAYINDAKİ
REKLAMLARI DEĞİŞTİRMİYOR. Meta çalışan bir reklamın kreatifindeki form
kimliğini değiştirmiyor; yeni formu kullanmak için yeni bir reklam gerekiyor.

### 3 — CENTRAL (All-in-One Panel) 🟡

| Yetenek | Durum | Nerede |
|---|---|---|
| Birleşik panel (Meta + Google tek ekran) | ✅ | `/dashboard` — canlı veriyle doğrulandı |
| Platform sekmeleri (Tümü / Meta / Google) | ✅ | Filtre özet, grafik ve tabloya birlikte gidiyor |
| İzlenmeyen hesapları gizleme | ✅ | Kapatılan hesap panelden ve rapordan çıkıyor, verisi silinmiyor |
| Ads Explorer (reklam seviyesi keşif) | ✅ | `/ads-explorer` |
| Bütçe pacing | ✅ | `/butce` |
| Trend izleyici | ❌ | — |
| Sağlık skoru | ❌ | Girdileri hazır (bütçe, kural, bayatlık) |
| Uyarılar / bildirimler | ❌ | **E-posta altyapısı hiç yok** |

Uyarı eşiği (`alert_threshold_pct`) bütçe tablosunda **saklanıyor** ve panelde
gösteriliyor, ama kimseye **bildirim gitmiyor**.

### 4 — CREATE (Reklam Üretici, Akıllı Boost) 🟡

| Yetenek | Durum | Nerede |
|---|---|---|
| **Reklam Oluşturucu** (form/WhatsApp/site) | 🟡 | `/reklam-olustur` — yayın yolu doğrulanmadı |
| **Gelişmiş Kampanya Oluşturucu** | 🟡 | Aynı ekranda ikinci mod — hedef, teklif, kitle, yerleşim; yayın doğrulanmadı |
| Görsel yükleme (3 oran) + boyut doğrulama | ✅ | `image-probe.ts`, `asset-storage.service.ts` |
| Toplu reklam oluşturucu | 🟡 | `/toplu-olustur` — yayın yolu doğrulanmadı |
| Yayın öncesi doğrulama | ✅ | Karakter sınırı, URL, CTA, mükerrer ad |
| Auto-Boost (organik → reklam) | 🟡 | `/auto-boost` — oluşturma yolu doğrulanmadı |
| Organik gönderi senkronizasyonu | ✅ | `queue/organic-sync.service.ts` |
| Görsel/video yükleme | 🟡 | Reklam Oluşturucu'da var; kalıcı arşiv (BASE) hâlâ yok |
| **Akıllı varlık yönlendirme** | ✅ | Meta + Google PMax yuva kapsaması, kırpma yüzdesi, eksik yuva tespiti |
| **Anlık form oluşturucu** | 🟡 | `/kutuphane/formlar` — 5 bölüm + canlı önizleme; yayın doğrulanmadı |
| **Potansiyel Müşteriler (Lead CRM)** | 🟡 | `/potansiyel-musteriler` — webhook + mutabakat; canlı doğrulanmadı |

**Varlık arşivi (BASE) — 13 Ağustos.** `/kutuphane/gorseller`. Üç somut
sorunu çözüyor: aynı görseli her kampanyada yeniden yüklemek, toplu
oluşturucuda `image_hash` değerini ELLE yazmak (o değeri bulmak için Ads
Manager'a gitmek gerekiyordu) ve Google PMax logosunun yerinin olmaması.

**Modülün merkezindeki gerçek: Meta'nın `image_hash` değeri REKLAM HESABI
BAŞINA üretiliyor.** Aynı görsel iki hesapta kullanılıyorsa iki ayrı hash var.
Tek kolonda tutmak, A hesabının hash'ini B hesabında kullanmak demek — Meta
bunu ya "Invalid parameter" ile reddediyor ya da kreatifi GÖRSELSİZ
oluşturuyor. İkincisinde reklam yayınlanıyor, para harcıyor ve boş görünüyor.
Bu yüzden `asset_platform_refs` tablosu (varlık, hesap) çiftini tekil tutuyor
ve önbellek isabet ederse Meta'ya hiç gidilmiyor.

Mükerrer yükleme içerik özetiyle engelleniyor ve kontrol DİSKE YAZMADAN ÖNCE
yapılıyor — sonra yapmak her tekrar yüklemede yetim bir dosya bırakırdı;
paylaşımlı sunucuda bu, diğer siteleri de etkileyen sessiz bir disk dolması.
Tekil kısıt MÜŞTERİ BAZLI: iki müşterinin aynı stok fotoğrafı yüklemesi meşru
ve Meta'ya zaten ayrı ayrı yüklenmeleri gerekiyor.

Kullanımdaki varlık silinemiyor: silmek, Meta'da çalışmaya devam eden bir
reklamın kaydını koparmak demek. Logo ayrı bir tür ve alt sınırı daha düşük
(128 piksel) — reklam görselinin sınırını uygulamak Google'ın kabul ettiği bir
logoyu reddetmek olurdu.

Yapı gereği bir düzeltme: depolama katmanı `StorageModule`'e taşındı. Arşiv
reklam oluşturucunun depolamasını, yayıncı da arşivin önbelleğini kullanıyor;
iki modül birbirini içe aktarırdı. `forwardRef` ihtiyacı genelde yanlış
yerleştirilmiş bir bağımlılığın işareti ve depolama ikisinin de ALTINDA duran
bir altyapı parçası.

**Toplu oluşturucuda arşiv (13 Ağustos).** `image_hash` elle yazma derdi
bitti: satırda ham hash yerine **arşiv görselinin adı** yazılıyor. Ad →
varlık çözümlemesi DOĞRULAMA anında yapılıyor, yayın anında değil — "bu ada
sahip görsel yok" hatası 60 satırlık parti yayına verildikten sonra değil,
satır kaydedilirken görünmeli.

Üç karar:

  · **Ham hash ile arşiv adı birlikte olamaz.** Hangisinin kazandığı belirsiz
    kalırsa yanlış görselle yayınlanan bir reklam sessizce yanlış olur.
  · **Çift ad belirsizlik hatası.** Arşivde adlar tekil değil; birini sessizce
    seçmek yine yanlış görsel demek. Satır geçersiz işaretleniyor ve kaç
    eşleşme olduğu yazılıyor.
  · **Ad küçük harfe indirgenerek eşleşiyor.** Kullanıcı Excel'den
    yapıştırıyor; "Yaz-1" ile "yaz-1" farkının eşleşmeyi bozması, sebebi gözle
    görülmeyen bir hata olurdu.

Yayın anında `asset_id` hesaba özel hash'e çevriliyor (`ensureExternalRef`) —
arşivde saklanan bir hash'i başka hesapta kullanmak Meta tarafından ya
reddediliyor ya da kreatifi görselsiz oluşturuyor.

Yazarken çıkan tasarım çelişkisi: veritabanı kısıtını "ikisi birden olamaz"
diye koymak, geçersiz satırın KAYDEDİLMESİNİ de engelliyordu ve 60 satırlık
bir partide tek hatalı satır partinin tamamını ham bir veritabanı hatasıyla
düşürüyordu — kullanıcı hangi satırın sorunlu olduğunu öğrenemezdi. Kısıt
`status = 'pending'` ile sınırlandı: geçersiz satırlar gerekçeleriyle
saklanıyor, yayına yalnızca `pending` olanlar gidiyor.

**Akıllı varlık yönlendirme — 13 Ağustos.** `asset-routing.schema.ts`.
Tek görsel seti, iki platform, çakışmayan oranlar. Asıl mesele "her oran farkı
sorundur" değil, farkın NE KADAR olduğunu hesaplamak — kimse hesaplamıyor,
platformlar sessizce kırpıyor.

  · Meta Hikâye 9:16 ile Google dikey 4:5 ikisi de "dikey" ama hikâye görseli
    Google yuvasına konursa alanın yalnızca %30'u kalıyor. Kullanılamaz;
    yönlendirme o görseli o yuvaya HİÇ atamıyor.
  · Meta yatay 16:9 ile 1.91:1 arasındaki fark ise %7. Tolerans bunu bilerek
    yutuyor: daraltmak 1920×1080 gibi yaygın bir boyutu sebepsiz reddetmek
    olurdu. Test bu kararı kilitliyor.

Yönlendirme ÖLÇÜLEN BOYUTA göre yapılıyor, `matchRatio` kovasına göre değil —
kova %8 tolerans taşıyor ve 1080×1080 ile 1200×628'i aynı sayardı. Korunan
alan = küçük oran / büyük oran; %80 üstü kabul edilebilir kırpma, %50 altı
atama yok. Her yuvaya EN İYİ görsel atanıyor (ilk uyan değil), böylece aynı
set farklı sırada yüklendiğinde aynı sonucu veriyor.

Google PMax bloğu YAYINI ENGELLEMİYOR ve arayüz bunu yazıyor: Google yazma
yolu henüz yok, onun engellerini Meta yayınının önüne koymak çalışan bir akışı
yazılmamış bir özellik yüzünden durdurmak olurdu. **Kare logo eksikliği** ayrı
bir engel olarak sürekli görünüyor — PMax varlık grubu logosuz oluşturulmuyor
ve logo yükleme akışı henüz yok.

**Potansiyel Müşteriler (Lead CRM) — 12 Ağustos.** `/potansiyel-musteriler`.
Anlık form kayıtları iki ayrı yoldan geliyor ve bu, yedeklilik değil
ZORUNLULUK: Meta webhook teslimini garanti etmiyor, sunucu bir dakika yanıt
vermezse o bildirim kayboluyor ve bir daha gelmiyor. Kaçan kayıt hiçbir yerde
hata üretmiyor — panel "0 potansiyel müşteri" diyor ve bu ya "kimse
doldurmadı" ya da "sistem çalışmıyor" demek.

  · **Webhook** — anlık. İmza `X-Hub-Signature-256` ile HAM GÖVDE üzerinden,
    sabit sürede. Uç nokta Graph API'ye HİÇ çağrı yapmadan 200 dönüyor: Meta
    birkaç saniyede yanıt bekliyor ve gecikme tekrar denemeye, tekrarlar da
    aboneliğin kapatılmasına yol açıyor (kapalı abonelik = sessiz durma).
  · **Mutabakat taraması** — periyodik. Form başına imleçle, kaçanları alıyor.

İkisi `ON CONFLICT DO NOTHING` ile buluşuyor; örtüşme ENGELLENMİYOR çünkü
birinin sessizce ölmesine karşı tek korumamız o. `source` alanı hangi yoldan
geldiğini tutuyor ve panel **mutabakat oranını** gösteriyor: kayıtlar taramayla
geliyorsa webhook o sayfa için ölmüş demektir — başka hiçbir yerde görünmeyecek
bir arıza.

Dışa aktarma AYRI YETKİ (`lead.export`): okumak kişisel veriyi ekranda
göstermek, dışa aktarmak onu sistemden ÇIKARMAK. CSV denetim kaydına yazılıyor,
BOM ile başlıyor (Excel Türkçe karakterleri bozmasın) ve formül enjeksiyonuna
karşı korunuyor — ad alanı reklamla gelen bir yabancının yazdığı metin.

**"Tek giriş, iki mod" kararı ve gerekçesi (12 Ağustos).** Spec'teki tam
kontrollü kampanya kurucusu, ürünün kurucu vaadiyle çelişiyordu: *"reklam ile
ilgili bilgisi olmayan birisinin bile platformu kullanabilmesi"*. Ayrı bir
"gelişmiş" sayfası açmak iki sorun üretirdi — hızlı modda başlayan taslak
gelişmişe geçemez (kullanıcı her şeyi baştan yazar) ve iki ayrı yayın yolu
oluşur (birinde düzeltilen hata diğerinde kalır, fark ancak canlıda görülür).

Bunun yerine aynı ekranda mod: aynı taslak, aynı görseller, aynı yayın yolu.
`resolveSpec()` iki modu tek yola bağlıyor. Mod seçici bütçeden SONRA duruyor
— en başta olsaydı, reklamcılık bilmeyen kullanıcı "gelişmiş" seçeneğini görüp
kendini yetersiz hissederdi; orada ise gelişmiş mod bir ek, ön koşul değil.

**Uyumluluk matrisi (`objective-matrix.ts`) bu modülün asıl işi.** Meta'da
hedef × optimizasyon × varış tipi × faturalama birbirine bağlı ve geçersiz
kombinasyonun kötü sonucu Meta'nın REDDETMESİ değil, KABUL ETMESİ: ad set
"aktif" görünür, harcama sıfır kalır, hata mesajı yoktur. Matris "izin
verilenler listesi" olarak yazıldı — bilinmeyen kombinasyon geçersiz sayılıyor.
Arayüzde uyumsuz seçenek hiç görünmüyor; sonradan uyarmak, kullanıcının o
hatayı yapmasına izin vermek demek.

Hızlı modun üç eşlemesi `GOAL_SPEC` ile tek kaynağa bağlandı: sunucudaki
`campaignSpec` ve arayüzdeki "gelişmişe geç" varsayılanı aynı tablodan
besleniyor. Ayrı yazılsalardı kullanıcı hızlı modda kaydedip gelişmişe
geçtiğinde bambaşka bir ayar bulurdu.

### 5 — MANAGE (Bütçe, Kill-Switch, Teklif) 🟡

| Yetenek | Durum | Nerede |
|---|---|---|
| Aylık bütçe + pacing | ✅ | `monthly_budgets` |
| Şemsiye bütçe (Google + Meta birlikte) | ✅ | `budgets.service.ts` |
| Kural motoru (duraklat/başlat/bütçe) | ✅ | `/kurallar` |
| Kill-switch | ✅ | Kural motorunun `pause` aksiyonu |
| Günlük sert limit | 🟡 | `daily_cap_micros` **saklanıyor, uygulanmıyor** |
| Otomatik durdurma eşiği | 🟡 | `auto_pause_at_pct` **saklanıyor, uygulanmıyor** |
| Teklif (bid) yönetimi | ❌ | Teklif **okunuyor**, hiç yazılmıyor |
| ROI takibi | 🟡 | ROAS hesaplanıyor; gelir kaynağı yok |

İki alan bilinçli olarak "saklanıyor ama uygulanmıyor": kullanıcının açık
bıraktığı bir korumanın çalıştığını sanması, hiç olmamasından kötü — bu yüzden
arayüzde de böyle yazıyor.

### 6 — OPTIMISE (Yorgunluk, A/B Test) 🟡

| Yetenek | Durum | Not |
|---|---|---|
| Reklam yorgunluğu tespiti | 🟡 | `frequency` metriği kuralda var; özel dedektör yok |
| A/B test motoru | ❌ | Hiç başlanmadı |
| Kreatif performans kırılımı | 🟡 | Ads Explorer gösteriyor, öneri üretmiyor |

Bugün "frekans > 3 ise duraklat" kuralı yazılabiliyor. Eksik olan, yorgunluğu
**kendiliğinden** bulup öneren katman.

### 7 — REPORT 🟡

| Yetenek | Durum | Nerede |
|---|---|---|
| Canlı online rapor | ✅ | `/raporlar` + `/r/[token]` |
| Beyaz etiket rapor | ✅ | Referans PDF'ten çıkarıldı |
| Paylaşım linki (hash'li token) | ✅ | `share.service.ts` |
| **Sunucu PDF'i** | ✅ | `rapor-pdf.service.ts` — `pdf-lib`, gömülü DejaVu Sans (Türkçe + ₺ için ZORUNLU), vektörel grafik |
| **E-posta ile gönderim** | ✅ | `rapor-gonder.service.ts` + `email/mail-gonderici.ts`; SMTP kimliği kullanıcı başına (`user_email_accounts`) |
| **Üç varsayılan şablon** | ✅ | Genel · Google Ads · Meta Ads — `VARSAYILAN_SABLONLAR`, kodda (veritabanında değil: silinen varsayılan geri gelmezdi) |
| **Kitle kırılımı** — yaş, cinsiyet, yerleşim, saat, şehir | ✅ | `insight_breakdowns` tablosu + `kirilim-sync.service.ts` |
| **Kitle Özeti sayfası** | ✅ | Kartlar + 4 halka + günlük form eğrisi; panel ve PDF AYNI sayfayı çiziyor |
| Anahtar kelime raporu | ✅ | Veri hattı canlı; "Şimdi güncelle" de tetikliyor |
| Arama terimleri | ✅ | `search_term_insights`; "Eşleşen Kelime" sütunu raporun en eyleme dönük bilgisi |
| **Zamanlanmış (otomatik) rapor gönderimi** | ✅ | `report_schedules` + `rapor-plani.service.ts`; panelde "Planla" düğmesi. Haftada 1 / ayda 1, dönem ön ayarlı |
| **İlgi alanı kırılımı** | ❌ **OLAMAZ** | Meta Ads Insights API'sinde ilgi alanı bir KIRILIM değil, hedefleme girdisi. Google'da yalnızca kriter olarak eklenmiş kitleler için kısmi. Tek platformda yarım çalışan bir bölüm raporda "Meta'da neden boş" sorusunu doğurur |

---

## 3. Orijinal 8 modül

| Modül | Kapsam | Durum |
|---|---|---|
| 1 | Auth + çok kiracılı iskelet + RLS | ✅ |
| 2 | Platform bağlantıları (OAuth) + adapter | ✅ Meta canlı · ✅ **Google canlı doğrulandı** (2026-08-11) |
| 3 | Sync worker + birleşik panel | ✅ |
| 4 | Ads Explorer | ✅ |
| 5 | Kural motoru | ✅ prova doğrulandı · 🟡 canlı yazma doğrulanmadı |
| 6 | Beyaz etiket raporlama | ✅ |
| 7 | Auto-Boost | 🟡 seçim doğrulandı · oluşturma doğrulanmadı |
| 8 | Toplu oluşturucu | 🟡 doğrulama tamam · yayın doğrulanmadı |

---

## 3.5. Canlı doğrulama günlüğü — Google (2026-08-11)

Google tarafı o güne kadar **hiç** canlı API görmemişti. Üç turda çözüldü ve
her tur tek bir net hata verdi. Bu sıra, benzer bir entegrasyonda tekrar
edilebilir:

| Tur | Hata | Sebep |
|---|---|---|
| 1 | `PAGE_SIZE_NOT_SUPPORTED` | İstek gövdesinde `pageSize` — Google artık reddediyor, sabit 10.000 kullanıyor |
| 2 | `UNRECOGNIZED_FIELD` | `campaign.start_date`, `campaign.end_date`, `metrics.video_views` v25'te yok |
| 3 | — | Zincir baştan sona çalıştı |

**Doğrulama:** hesap seviyesi toplamı 3.889,31 = kampanya seviyesi toplamı
3.889,31. Meta'da güven veren aynı iç tutarlılık kontrolü.

**Bu turda ortaya çıkan üç araç:**

- `google-check` — zinciri adım adım yürüten tanı. Tam senkronizasyon içinde
  hangi adımın kırıldığını görmek imkânsızdı.
- `google-check -- --field a,b,c` — GAQL alan sondası. Her alan denemesi
  aksi hâlde "kod → commit → deploy → çalıştır" turu demekti.
- Google hata zenginleştirme — `sync_jobs.error_message` her Google
  hatasında birebir aynı satırı yazıyordu; gerçek sebep
  `details[].errors[].errorCode` altındaydı ve mesaja hiç girmiyordu.

**Kaybedilenler (bilinçli):** kampanya başlangıç/bitiş tarihi ve video
görüntüleme Google tarafında boş kalıyor. Doğru alan adlarını tahmin etmek her
denemede bir canlı tur yakacaktı; alan sondası artık var, gerektiğinde
saniyeler içinde bulunur.

---

## 3.6. 11–28 Ağustos: rapor ve panel yeniden yazımı

30 commit. Okuma/yazma dengesi değişmedi — bu dönemde **hiçbir platform yazma
yolu canlıda denenmedi**; iş rapor, panel ve senkronizasyon tarafındaydı.

### Rapor

| Ne | Nerede | Neden dikkat |
|---|---|---|
| Sunucu PDF'i | `rapor-pdf.service.ts`, `pdf-cizim.ts` | `pdf-lib` + gömülü DejaVu Sans. **Font gömülmezse `ğ ş ı ₺` sessizce düşüyor** ve bunu ilk gören müşteri oluyor; font bulunamazsa AÇIKÇA patlıyor |
| PDF = panel | `report-document.tsx` referans | PDF'e kendi görsel dilimi kurmuştum ("çok pastel boya çizimi gibi olmuş"). `rapor-pdf.service.spec.ts` regresyon bekçisi taşıyor: `payCubugu`, `altbilgi(`, `acikTon(`, `const BANT` kaynakta geçerse düşüyor |
| Üç varsayılan şablon | `VARSAYILAN_SABLONLAR` | **Kodda, veritabanında değil**: seed'le yazılan üç satır, kullanıcı birini silince geri gelmeyen bir varsayılan demekti |
| Platform daraltması | `platformFiltresi()` | Şablon platformu daraltıyorsa ÖZET KARTLARI ve günlük seri de daralmalı; yalnızca bölüm listesini süzmek aynı belgede iki farklı gerçek üretiyordu |
| Kitle Özeti | `kitle-ozeti.tsx` + `kitleOzeti()` | Halkalar **çokgenle** çiziliyor, yay komutuyla değil: `pdf-lib`in SVG ayrıştırıcısına `A` vermek sürüme bağlı bir bahis ve tek dilim %100 olduğunda yay dejenere olup HİÇBİR ŞEY çizmiyor |
| Ekranda bölüm ayrımı | `.rpt-page + .rpt-page` | Yazdırmada sayfa sonu vardı, **ekranda hiçbir ayrım yoktu** |

### Veri

| Ne | Nerede | Neden dikkat |
|---|---|---|
| Kitle kırılımı toplanıyor | `insight_breakdowns`, `kirilim-sync.service.ts` | `insights_daily.breakdown_key` kolonu ve `insights_breakdown` kota katmanı hazır duruyordu ama **hiçbir şey onları doldurmuyordu** |
| Kırılım AYRI tabloda | — | `insights_daily`ye yazmak teknik olarak mümkün ama mevcut toplama sorgularının hiçbiri `breakdown_key`i süzmüyor: satırlar oraya yazıldığı an **her harcama rakamı kırılım sayısı kadar katlanır** ve hiçbir hata düşmez |
| Reklam seviyesi geçmiş | `insights-sync.service.ts` | `initial_backfill` artık `['campaign','ad_group','ad']`. Derin seviyeler 15 günlük parçalar hâlinde: `time_increment=1` ile yanıt GÜN × VARLIK satırı taşıyor ve 90 gün × reklam tek istekte "reduce the amount of data" ile düşüyor |

### Yetki

**Org geneli VERİ erişimi ile org YÖNETİCİLİĞİ ayrıldı** — bu dönemin en
yapısal değişikliği. `isOrgAdmin` iki işi birden yapıyordu: (1) org'daki
bütün müşterilerin verisini görmek, (2) kullanıcı açma / üyelik verme /
müşteri silme kapılarını açmak.

- `ORG_SCOPED_ROLES` = veri kapsamı (owner, admin, **ad_manager**)
- `ORG_ADMIN_ROLES` = yetki demeti (owner, admin)

Yeni roller: **Reklam Yöneticisi** (`ad_manager`) ve **Müşteri Hizmetleri**
(`customer_service`). Reklam Yöneticisi'ni çalışır hâle getirmek YETKİ
MATRİSİNDEN İBARET DEĞİLDİ — dört katman birden gerekti:

1. Yetki matrisi + yeni `connection.manage` yetkisi
2. RLS: havuz görünürlüğü `app.is_org_admin()`e bağlıydı → `app.can_manage_pool()`
3. `INSERT ... RETURNING` SELECT politikasından da geçiyor; yeni açılan
   müşterinin kimliği erişim listesinde olamadığı için çağrı düşüyordu.
   Kimlik önden üretilip kapsam O TRANSACTION için genişletiliyor
4. Marka profili aynı transaction'da yazılıyor ve politikası yalnızca org
   yöneticisi diyordu

### Panel

| Ne | Neden dikkat |
|---|---|
| MCC müşteri görünümü | "Tüm müşteriler" seçiliyken kampanya değil MÜŞTERİ listesi; satıra tıklayınca o workspace'e geçiliyor. Seviye filtresi olmadan harcama 4× çıkıyor — `TOTALS_LEVEL` sabiti |
| Uyarı bandı | Ödeme sorunu, hesap kapalı, bağlantı yetkisi, veri gelmiyor. Her uyarı verinin OKUNMA ANINI taşıyor: hesap durumu günde iki kez tazeleniyor ve tarihi göstermeyen uyarı düzelmiş bir sorunu ekranda tutar |
| Bekleme göstergesi | Eksik olan yalnızca görsel değildi: `router.refresh()` beklenebilir bir şey döndürmüyor ve `finally` içindeki `setPending(false)` asıl beklemenin BAŞINDA koşuyordu. `startTransition` doğru mekanizma |
| Toplu danışman ataması | İki yönde: workspace → danışmanlar, danışman → workspace'ler. Karar tek fonksiyonda (`atamaEngeli`), cümle her ekranın kendi yönünden |

### Senkronizasyon

| İş | Zaman | Not |
|---|---|---|
| `sweep:breakdowns` | 05:32 (UTC) | Kitle kırılımları |
| `sweep:account-status` | **08:05 ve 13:05 (Europe/Istanbul)** | Hesap durumu + ödeme maili. **Tek `tz` istisnası**: diğer süpürmeler veri PENCERESİ hakkında ve UTC doğru; bu iş İNSANIN OKUDUĞU mail üretiyor |

- **"Şimdi güncelle" artık raporun bütün bölümlerini kapsıyor**: yapı,
  metrik, kırılım, organik gönderi, anahtar kelime, arama terimi. Düğme
  raporun bir bölümüne dokunmuyorsa adı ile yaptığı iş ayrışıyor.
- **"Tüm verileri güncelle"** (`sync_batches`): seçili workspace'lerin 2
  yıllık geçmişi, 90 günlük pencerelere bölünmüş, ilerleme çubuğu + tahmini
  süre. Tahmin eş zamanlılığa (4) bölünüyor ve örnek yetersizken VERİLMİYOR.

### Güvenlik

`.env.example`'da **somut bir varsayılan parola** duruyordu ve depo herkese
açık. Değer boşaltıldı, `ornek-env-sir.spec.ts` bekçisi eklendi. **Git
geçmişinde hâlâ duruyor** — `SEED_ADMIN_EMAIL` hesabının parolası
döndürülmeli.

---

## 4. Plandan sapmalar

`ARCHITECTURE.md` şu tabloları öngörmüştü; gerçekte farklı çıktılar:

| Planlanan | Gerçek | Neden |
|---|---|---|
| `rule_executions` | `rule_runs` | Aynı şey, ad kısaldı |
| `rule_actions` (kural tanımı) | `rules.action` (JSONB) | Tek aksiyon var, tablo gereksiz |
| `boost_executions` | `boosts` | Aday + onay + oluşturma tek tabloda |
| `bulk_jobs` / `bulk_variants` | `bulk_batches` / `bulk_items` | Aynı yapı |
| `reports` (üretilmiş rapor) | — | Rapor **anlık** üretiliyor, saklanmıyor |
| `report_schedules` | `report_schedules` | ✅ 2026-09-02'de yazıldı — plandaki adıyla |
| `notifications` | — | Bildirim altyapısı yazılmadı |
| `bulk_assets` | — | Varlık arşivi (BASE) yazılmadı |

Plandan **fazla** çıkanlar: `monthly_budgets` (planda yoktu, dört özelliğin
temeli oldu), `organic_posts` (planda vardı ama alan seti genişledi).

---

### İlk canlı yazma denemesinden çıkanlar (13 Ağustos)

Arşiv testi sırasında yayın denendi ve **yazma yolunun ilk gerçek Meta
çağrısı** yapıldı. Üç hata çıktı, üçü de yalnızca canlıda görülebilecek türden:

1. **3. adım hiç çalışmıyormuş.** Görseller 3. adımda ama taslak şeması
   `primaryText`'i zorunlu tutuyordu ve metinler 4. adımda soruluyor. Görsel
   eklemek taslak gerektirdiği için adım tamamen ölüydü — sürükle-bırak dahil.
   Kanıt elimizdeydi ve okumamışız: `/home/advetics/uploads` dizini hiç
   oluşmamıştı, bunu "kimse yüklememiş" diye yorumlamıştık; doğrusu "kimse
   yükleyememiş"ti.

2. **Hata mesajı formun en altındaydı.** Uzun formda 3. adımdaki bir hatanın
   mesajı 7. adımın altında beliriyor ve ekrana hiç girmiyordu — sessiz
   hatanın arayüz karşılığı.

3. **`act_` öneki iki kez ekleniyordu.** `ad_accounts.external_id` Meta'dan
   önekli geliyor; yazma yolları körlemesine bir önek daha ekleyip
   `act_act_1602474151544739` üretiyordu. Meta bunu *"does not exist, cannot
   be loaded due to missing permissions"* diye reddediyor — **mesaj yetki
   sorunu gibi okunuyor** ve bu projede `ads_management` zaten beklendiği için
   yanlış teşhise son derece müsait. Tuzağa okuma yolunda bir kez düşülmüş ve
   koruma yalnızca oraya konmuştu; artık tek bir `actPath()` yardımcısı var ve
   kaynak taraması yeni bir körlemesine öneki test hatası yapıyor.

**Çıkarılan ders:** bu üç hatanın hiçbirini birim testleri yakalayamazdı —
biri adım sırasıyla şemanın çelişmesi, biri CSS/yerleşim, biri de yalnızca
gerçek API yanıtında görünen bir dize birleştirme hatası. Yazma yollarının
"test edildi" sayılabilmesi için canlı bir çağrı şart.

## 5. Doğrulanmamış olan — en kritik bölüm

Bunlar **yazıldı, test edildi, ama canlı Meta API'sinde bir kez bile
çalıştırılmadı.** Sebep: `ads_management` onayı yok.

| Yol | Dosya | Risk |
|---|---|---|
| Kampanya duraklat/başlat | `meta.provider.ts` → `applyAction` | Orta — tek alan yazıyor |
| Bütçe değiştirme | aynı | **Yüksek** — para birimi çevrimi hatası bütçeyi 1.000.000 katına çıkarır |
| Boost oluşturma | `meta.provider.ts` → `createBoost` | **Yüksek** — 3 varlık, geri alma yolu var ama denenmedi |
| Toplu reklam oluşturma | `meta.provider.ts` → `createAd` vb. | **Yüksek** — kısmi başarı yönetimi denenmedi |
| Reklam Oluşturucu yayını | `meta.provider.ts` → `publishDraft` | **Yüksek** — 4 varlık + anlık form; `asset_feed_spec` yerleşim kuralları hiç denenmedi |
| **Arşiv hash önbelleği** | `asset-uploader.service.ts` | **Orta** — hesap başına hash mantığı doğru ama tek bir gerçek yükleme yapılmadı; `uploadAdImage` zaten `ads_management` bekliyor |
| **Google PMax varlık gereksinimleri** | `asset-routing.schema.ts` | **Orta** — oranlar, en küçük/önerilen boyutlar ve logo zorunluluğu Google belgelerinden çıkarıldı; Google yazma yolu hiç yazılmadı, tek bir varlık grubu oluşturulmadı |
| **Leadgen webhook + lead çekme** | `leadgen-webhook.service.ts`, `lead-sync.service.ts` | **Yüksek** — imza doğrulaması, `field_data` biçimi, `filtering` zaman kısıtı ve sayfalama belgeden çıkarıldı; `leads_retrieval` izni yok, gerçek bildirim hiç alınmadı |
| **Gelişmiş mod yayını** | `meta.provider.ts` → `publishDraft` (teklif/bütçe/takvim alanları) | **Yüksek** — `bid_strategy`, `bid_amount`, `lifetime_budget`, `start_time` alanları hiç gönderilmedi. Uyumluluk matrisi de belgeden çıkarıldı, canlıda sınanmadı |
| **Kütüphane formu yayını** | `meta.provider.ts` → `createLeadForm` | **Yüksek** — geri alınamaz; `legal_content`, `context_card`, `thank_you_page` eşlemeleri belgeden çıkarıldı, gerçek yanıt görülmedi. `is_optimized_for_quality` eşlemesi (= "daha nitelikli") de doğrulanmadı |

Google yazma yolu **hiç yazılmadı** ve bu artık bilinçli bir sıra kararı:
okuma tarafı yeni doğrulandı, yazma bir sonraki adım. Meta'daki üç turluk
deneyim gösterdi ki yazma yolları okuma yollarından daha kırılgan ve her biri
canlı doğrulama istiyor.

**Birim testleri hata yollarını ve para birimi çevrimini kilitliyor**
(`meta-write.spec.ts`, `meta-organic.spec.ts`), ama gerçek API yanıtını
kimse görmedi.

### İlk canlı deneme için önerilen sıra

1. **Kural motoru — `notify` aksiyonuyla.** Platforma hiç dokunmaz, tüm zinciri
   (zamanlanmış iş → değerlendirme → kayıt) canlıda doğrular.
2. **Kural motoru — tek bir test kampanyasında `pause`.** En basit yazma.
3. **Bütçe değiştirme — düşük bütçeli tek kampanyada, ±%10.** Sonucu Ads
   Manager'dan gözle doğrula; para birimi çevrimi burada anlaşılır.
4. **Boost — tek bir gönderi, düşük bütçe.** Üç varlığın da oluştuğunu ve
   bitiş zamanının doğru olduğunu kontrol et.
5. **Toplu oluşturucu — 2 satırlık parti.** Kısmi başarı yönetimini görmek için
   bilerek bir satırı bozuk bırak.

Google tarafında yazma **hiç yazılmadı** ve bu bilinçli: okuma tarafı bile
canlıda doğrulanmadı, test edilmemiş kodun müşteri kampanyasını değiştirmesi
kabul edilemez.

---

## 6. Platform onayları

| Onay | Durum | Neyi açar |
|---|---|---|
| Meta `ads_read` + `business_management` | Kullanılıyor (Dev Tier) | Panel, explorer, rapor, bütçe |
| Meta `ads_management` | **Başvurulmadı** | Kural yazma, boost, toplu oluşturma |
| Meta `pages_read_engagement` + `instagram_manage_insights` | **Başvurulmadı** | Auto-Boost'un organik verisi |
| Meta Business Verification | **Yapılmadı** | App Review ön koşulu |
| Meta Tech Provider | **Başvurulmadı** | Müşteri hesaplarını yönetmek |
| Google Ads Basic Access | ✅ **Alındı ve doğrulandı** (2026-08-11) | 129 hesap keşfedildi; yapı ve metrik sorguları çalışıyor |

`ads_management` **zorunlu scope listesinden çıkarıldı** ve isteğe bağlıya
alındı ([meta.provider.ts](apps/api/src/modules/connections/providers/meta.provider.ts)).
Böylece onay gelmeden de bağlantı sağlıklı görünüyor ve okuma tarafı çalışıyor —
aşamalı başvurunun ön koşulu buydu.

### App Review demosu için

`ads_management` üç akışta demo edilebilir. En anlaşılırı **kural motoru**:
prova modunda "canlıda şunu yapardım" listesi gösteriliyor, sonra tek düğmeyle
gerçek. Ekran kaydı için doğal bir anlatı.

---

## 7. Sıradaki adımlar

Öncelik sırasına göre. Her madde neyi açtığıyla birlikte.

### Hemen (başvuru öncesi)

1. **Business Verification'ı başlat.** App Review'un ön koşulu ve en uzun süren
   adım — kod yazmayı beklemesine gerek yok.
2. **Sızmış kimlik bilgilerini döndür.** Sohbete yapıştırılan SSH parolası, üç
   veritabanı parolası ve Meta app secret.
3. **İzlenecek hesapları seç.** Google 129 hesap getirdi ve izlenen her hesap
   her gün kota tüketiyor. Bağlantı sayfasındaki arama + izlenenler bloğu bu
   iş için var.

### 2026-08-28 deploy'u sonrası doğrulama — TAMAMLANDI (2026-08-31)

Sunucuya SSH ile bağlanılıp veritabanından koddan doğrulanarak kontrol edildi.

| # | Ne | Sonuç |
|---|---|---|
| 1 | Kırılım tabloları kendi boyutunu gösteriyor mu | ✅ 5 boyut (age/gender/placement/hour/city) birbirine karışmıyor; `b80f132` tuttu |
| 2 | `SEED_ADMIN_EMAIL` (yusuf@profaj.com) hesabının parolası | ❌ **HÂLÂ DÖNDÜRÜLMEDİ** — sohbete yapıştırılan eski varsayılan git geçmişinde duruyor. `pnpm --filter @advetics/api db:set-password -- --email yusuf@profaj.com` sunucuda ELLE çalıştırılmalı (parola bir kez ekrana basılır, kaydedilmez) |
| 3 | hello@profaj.com SMTP kimliği tanımlı ve doğrulanmış mı | ✅ `verified_at: 2026-08-24 06:10`, hata yok |
| 4 | Kitle kırılımı gecelik toplanıyor mu | ✅ veri 2026-08-30'a kadar geliyor |
| 5 | "Tüm verileri güncelle" denendi mi | ✅ denendi (1 workspace, 38 iş) — **iki gerçek hata ortaya çıkardı, bkz. §3.7** |

### 3.7. 31 Ağustos: deploy doğrulaması iki sessiz hata buldu, ikisi de düzeltildi ve dağıtıldı

`sync_jobs` içinde 72 satır `insights_breakdowns` işi 3+ gündür `running`
durumunda takılıydı ve `insights_backfill` işlerinde tekrarlayan bir hata
vardı: *"too many bind variables in prepared statement, expected maximum of
32767, received 48816"* (sistemde toplam 19 kez görülmüş).

### 2026-09-03 — Birden çok fatura ve birden çok mail alıcısı

Kullanıcının isteği: *"birden fazla fatura dosyası ve birden fazla kişiye mail
gönderimi yapabiliyo olmamız lazım"*. İki ayrı kısıt vardı.

**1 — Bir döneme tek fatura.** `fatura_belgeleri` üzerinde
`(müşteri, platform, dönem)` tekildi ve ikinci yükleme öncekini EZİYORDU;
ajans ikisini de yükledim sanıyor, müşteriye tek belge gidiyordu. Tekillik
KALDIRILMADI, dosyanın İÇERİĞİNE (SHA-256) taşındı: aynı döneme farklı
faturalar serbest, aynı dosya iki kez değil — o da müşteriye aynı belgenin iki
kopyası olarak giderdi.

Çoğullaşma üç yeni karar getirdi: ek adları çakışmasın diye ikinciden itibaren
numaralanıyor (`MetaAds-Fatura-2026-08-2.pdf`); toplam ek bütçesi 15 MB ham
(base64 şişmesiyle ~20 MB — Gmail'in 25 MB sınırının altında) ve sınıra
takılan fatura sebebiyle bildiriliyor; giriş anında dönem+platform başına en
fazla 10 fatura.

**2 — Tek alıcı.** Alıcı üç yerde tekildi: gönderim formu, plan kaydı ve
`clients.contact_email`. Üçü de liste oldu (`TEXT[]`) ve çözüm kuralı — "form
doluysa o, boşsa müşterinin kayıtlı listesi" — tek fonksiyona çekildi
(`nihaiAlicilar`); dört ayrı yerde elle yazılıydı ve hata mesajları bile
farklıydı.

**EN ÖNEMLİ AYRINTI — çoklu alıcı yeni bir sessiz hata açıyor.** nodemailer
tek alıcıda ret = "hepsi reddedildi" olduğu için fırlatıyor; birden çok
alıcıda bazıları reddedilse bile `sendMail` BAŞARIYLA dönüyor ve ret yalnızca
dönüş nesnesinde duruyor. `mailGonder` artık `{ kabul, ret }` döndürüyor, iki
gönderim yolu da reddi ekrana/plan notuna taşıyor ve denetim kaydına İSTENEN
değil KABUL EDİLEN adresler yazılıyor.

Panelde alıcı alanı tek bir paylaşılan bileşen (`alici-listesi-alani.tsx`) —
rapor gönderme, plan ve müşteri formu aynı ayrıştırma kurallarını kullanıyor
ve ekran "hepsi birbirinin adresini görecek" uyarısını yazıyor (tek mail,
herkes `To:` alanında).

**Bilinen ve kabul edilen boşluk:** migration'dan önce yüklenmiş faturaların
hash'i NULL ve mükerrer bekçisinin dışında. Maruziyet neredeyse sıfır (fatura
özelliği bir gün önce yayına girdi) ve o satırlar silindikçe kendiliğinden
kapanıyor.

**Test:** 43 yeni test; beş mutasyonun beşi de yakalandı.

---

### 2026-09-02 — Müşteriye giden PDF'te iki görsel hata (`3dda604`)

Kullanıcı Çiftçi Grup raporunun PDF'ini açtı; iki ayrı arıza vardı ve **ikisi
de sessizdi**: hata yok, log yok, ikisini de ilk gören müşteriye giden belge
oldu.

**1 — Kitle Özeti sayfasında halkalar sayfanın altında.** Dört halka
grafiği, başlıklarının ve lejantlarının yanında değil sayfanın alt çeyreğinde
çiziliyordu. Sebep `pdf-lib`in `drawSvgPath`i: `translate(x, y)` sonrası
`scale(1, -1)` yayınlıyor, yani mutlak PDF koordinatı verilince grafik yatay
eksende aynalanıyor (merkez 609,89 yerine 232,00). Yol noktaları artık merkeze
göre üretiliyor.

Bu hatanın **neden kaçtığı** ayrıca kayda değer: `rapor-pdf.service.spec.ts`
fixture'ında `breakdowns` alanı hiç yoktu, TypeScript bunu `TS2741` ile
söylüyordu ama vitest tip denetimi yapmıyor ve 259 test o sayfa **hiç
üretilmeden** yeşil geçiyordu. Fixture tamamlandı; `reports/` typecheck'i
artık temiz ve sayfayı gerçekten üreten dört test eklendi.

**2 — "Öne Çıkan Reklamlar"da on reklamın görseli "sunucu 403".**
`creatives.asset_urls` içindeki Meta CDN adresi imzalı ve süresi doluyor;
Meta `image_url`ün geçici olduğunu, `thumbnail_url` için kalıcı bir karşılık
bulunmadığını söylüyor. Yapı taraması delta çalıştığı için değişmemiş bir
reklamın adresi aylarca tazelenmiyordu. Adres artık rapor üretilirken
platformdan (`?ids=` ile tek istekte) ve **transaction kapandıktan sonra**
tazeleniyor; düzeltme `build()` içinde olduğu için PDF, panel ve paylaşım
bağlantısı birlikte düzeliyor.

Bu yol `GET /reports/shared/:token` üzerinden **anonim tetiklenebiliyor**, o
yüzden üç koruma var: kota bekçisi (yeni `report_creative` katmanı, tavan %50
— en düşük), 10 dakikalık önbellek ve 12 saniyelik toplam süre bütçesi.
Paylaşım linkini tarayan bir bot hesabın kotasını %90'ın üstüne çıkarsaydı
yapı taraması da reddedilir ve hesap kalıcı kilide girerdi.

**Yol boyunca çıkan üçüncü hata (düzeltmesi YARIM):** Google sağlayıcısı
`asset_urls`'e adres değil Google Ads **kaynak adı** yazıyor
(`customers/…/assets/…` — okuduğu alan `AdImageAsset.asset` ve o bir URL
değil). Değer string olduğu için süzgeçten geçip `imageUrl`e yazılıyor ve
TRUTHY oluyordu: PDF metin önizlemesi yerine "görsel alınamadı" dalına
giriyor ve dipnottaki sayaç şişip gerçek arızayı gizliyordu. Süzgeç artık tek
kaynakta (`gorselAdresleri`) ve kaynak adını eliyor. Kalan yarısı — gerçek
adresi çekmek — aşağıdaki maddede tamamlandı. Google **arama** reklamlarının
görselsiz olması hata değil: onlar metin önizlemesiyle çiziliyor ve doğru
çalışıyor.

**Test:** 38 yeni test, on mutasyonun onu da yakalandı. Bir mutasyon gerçek
bir kırılganlık ortaya çıkardı: yarılamanın durma koşulu URL biçimini seçen
`tekli` değişkenine bağlıydı ve sabitlenirse özyineleme sonsuza gidiyordu
(süreç bellek taşmasıyla düştü). Durma koşulu artık liste uzunluğuna bağlı.

**Hata 1 — `insights_breakdowns` dalı `markSucceeded`/`recordFailure`
çağırmıyordu.** [sync-processor.service.ts:633](../apps/api/src/queue/sync-processor.service.ts)
diğer bütün iş türlerinin sarıldığı `try/catch` deseninden yoksundu; satır
BAŞARIYLA bitse bile `sync_jobs.status` sonsuza dek `'running'` kalıyordu —
worker hiç çökmese bile. Bu bir çökme yan etkisi değil, dalın doğuştan
eksik olan parçasıydı. Düzeltme diğer dallarla AYNI desene sokuldu.
Kaynak taraması testi: `insights-breakdowns-durum.spec.ts`.

**Hata 2 — `insights_backfill` büyük hesaplarda deterministik çöküyordu.**
[insights-sync.service.ts:360](../apps/api/src/queue/insights-sync.service.ts)
`writeRows()` bütün satırları chunk'sız TEK `$executeRaw` çağrısında
yazıyordu. Satır başına 18 parametre; `ad` seviyesinde 7 günlük pencerede
~13.300 satır × 18 ≈ 240.000 parametre, Postgres/Prisma'nın 32.767
sınırının çok üzerinde. Chunk'sızken retry İŞE YARAMAZ — satır sayısı
değişmediği için her deneme aynı hatayla düşer. 1000'lik parçalara bölündü.

İkisi de mutasyonla doğrulandı (düzeltme geri alınınca ilgili test
gerçekten düşüyor — chunk testi PGlite'ın kendi mesaj protokolünde gerçek
bir `RangeError` üretti, üretimdeki hatanın güçlü bir analogu). Commit
`1f8ce7c`, main'e push edildi, sunucuya dağıtıldı (health check'ler yeşil).
Eski 72+2 takılı `sync_jobs` satırı `failed` + açıklayıcı not ile
işaretlendi; gecelik süpürme veriyi zaten ayrıca tazeliyor, elle yeniden
tetiklemek gerekmiyor.

### 2026-09-02 — Google Display görselinin gerçek adresi çekiliyor

Yukarıdaki üçüncü hatanın kalan yarısı. Süzgeç kaynak adını eliyordu, yani
rapor artık YANLIŞ bir sebep ("görsel alınamadı") göstermiyordu — ama Google
görüntülü reklamlarının görseli hâlâ hiçbir yerde yoktu, çünkü elimizde bir
adres yoktu.

**Adres ikinci bir GAQL sorgusundan geliyor.** `ad_group_ad` yanıtındaki
`marketing_images[].asset` yalnızca bir referans; adres `asset` kaynağında:
`SELECT asset.resource_name, asset.image_asset.full_size.url FROM asset
WHERE asset.type = 'IMAGE' AND asset.id IN (…)`. Sorgu kaynak adlarıyla
**süzülüyor** — süzgeçsiz bir `FROM asset` hesaba bir kez yüklenmiş her
görseli döndürürdü. Kimlikler sorgu metnine gömüldüğü için (GAQL'de bağlı
parametre yok) yalnızca rakam kabul ediliyor ve liste 500'lük parçalara
bölünüyor.

**Sorgu, kaynak adı toplanmamış hesapta HİÇ atılmıyor.** Hesapların çoğu
yalnızca arama reklamı taşıyor ve orada bu çağrı bedava değil, kotadan
yeniyor — CLAUDE.md'nin "ÖNCE KONTROL, SONRA ÇAĞRI" kuralı. Parça başına bir
çağrı `apiCalls`a sayılıyor; sayılmayan bir çağrı, kota bekçisinin kendi
ürettiği trafiği görmemesi demek.

**Hata yapı taramasını düşürmüyor ama sessiz de değil.** Kampanya/ad
group/reklam satırları her şeyin ön koşulu; kozmetik bir görsel adresi için o
zinciri kaybetmek çok daha pahalı. Bunun yerine `PlatformStructure.notes`
alanı eklendi ve `sync_jobs.note` üzerinden **senkron durumu ekranında**
görünüyor: sebep platformun kendi cümlesiyle yazılıyor ve kaç adresin
çözüldüğü sayılıyor (`görsel adresi: 3/7 çözüldü`). O sayaç aynı zamanda
canlı doğrulama aracı — "0/7", sorgunun hiç çalışmadığını ilk bakışta
söylüyor.

**CANLIDA DOĞRULANMADI.** Dönen adresin `https://tpc.googlesyndication.com/
simgad/…` biçiminde olduğu iddiası Google'ın forum kayıtlarından geliyor,
resmi bir referans sayfasından değil. Beyaz listeye (`kreatif-gorseli.ts`)
`tpc.googlesyndication.com` **tam ana makine** olarak eklendi —
`.googlesyndication.com` soneki `pagead2`/`googleads` gibi reklam sunucusu
alt alanlarını da açardı. Tahmin yanlışsa belirti teşhis edilebilir bir
cümle: rapor indirmeyi reddedip gördüğü ana makine adını yazıyor. Adresin
ömrü de gözlenmeli: imza parametresi taşımıyor, yani Meta'nın imzalı
adresleri gibi çürümüyor GÖRÜNÜYOR ama Google bunu yazılı olarak garanti
etmiyor. Çürürse karşılığı Meta'daki gibi rapor anında tazelemedir
(`kreatif-adresi.service.ts`).

**Test:** 22 yeni test (16'sı yeni `google-gorsel-adresi.spec.ts`, 3'ü beyaz
liste, 3'ü `reports.service.spec.ts` içinde gerçek veritabanına karşı).
On iki mutasyonun on ikisi de yakalanıyor, ama oraya iki düzeltmeyle gelindi:

1. **`assetUrls` boş mu diye bakan iddia yetmiyordu.** Haritaya çöp girmesini
   engelleyen kontrol silindiğinde de geçiyordu, çünkü `mapGoogleCreative`in
   daraltma süzgeci onu yine eliyor. İddia sayaç notuna da çapalandı: not
   "1/1 çözüldü" derse harita çöp taşıyor demek.
2. **Ön koşulun erken dönüşü silindiğinde** sorgu yine atılmıyordu (kimlik
   listesi boş kalıyor) ama arama-only her hesapta anlamsız bir not
   beliriyordu; "not YAZILMIYOR" iddiası eklendi.

Beyaz liste tarafında görev tarifinde bildirilen boşluk doğrulandı:
`.gstatic.com` ve `.ggpht.com` silinse hiçbir test düşmüyordu. Artık her sonek
için elle yazılmış bir örnek adres var ve örnek listesinin beyaz listeyle
birebir aynı olduğu AYRICA sınanıyor — `IZINLI_SONEKLER` üzerinde döngü kuran
bir test, girdi silindiğinde kısalıp yine geçerdi.

Bilerek kilitlenmemiş tek nokta: `mapGoogleCreative`teki `gecerliGorselAdresi`
süzgeci TEK BAŞINA mutasyonlandığında hiçbir test düşmüyor, çünkü haritanın
girişindeki kontrol zaten yeterli. Süzgeç daraltma için ZORUNLU olduğu ve bu
listeye ikinci bir kaynak (kare görsel, logo) eklenirse doğrulamanın
unutulacağı yer tam orası olduğu için duruyor; ikisi birden silinince dört
test düşüyor.

### 2026-09-02 — Şablon değişince PDF değişmiyordu + Raporlar tek sayfada

Kullanıcının bildirdiği hâl: *"ben şablonu değiştirdiğimde pdf
oluşturamıyorum"*.

**Hata sessizdi ve klasikti.** Aynı raporu isteyen ÜÇ yol vardı ve her biri
sorgu dizesini ELLE kuruyordu:

| yol | taşıdığı |
|---|---|
| `/reports/preview` (önizleme) | `clientId, from, to, sablon` ✅ |
| `/reports/pdf` (indirme) | `clientId, from, to` ❌ |
| `/reports/mail-draft` + `/reports/send` | `clientId, from, to` ❌ |

Hiçbiri hata vermiyor — şablonsuz istek de geçerli bir istek ve sunucu
varsayılanı üretiyor. Yani ekranda "Google Ads Şablonu" raporunu gören
kullanıcı **Genel raporu** indiriyor, bunu ancak PDF'i AÇINCA anlıyor;
müşteriye maille giden belge de aynı şekilde yanlış şablondan gidiyordu ve onu
yalnızca alıcı görüyordu. CLAUDE.md'deki *"BAĞLANTIYI ELLE BİRLEŞTİRME —
SÜZGEÇ DÜŞÜYOR"* kuralı bire bir bu; orada panel süzgeçleri kayboluyordu,
burada şablon. Sorgu artık tek üreticiden (`packages/shared/src/rapor-sorgusu.ts`)
geliyor ve `rapor-sorgusu.spec.ts` kaynak taramasıyla bunu kilitliyor.

**İKİNCİ VE DAHA SİNSİ YARISI: kayıtlı şablonlar rapor ekranında HİÇ YOKTU.**
Seçici yalnızca üç ön ayarı tanıyordu; kullanıcı `/raporlar/sablonlar`
sayfasında bölüm sırasını düzenleyip rapora dönüyor, seçiciden bir şey seçiyor
ve düzenlemesi kayboluyordu — çünkü `sablon` parametresi konduğu anda sunucu
ön ayarı uygulayıp kayıtlı şablonun bölüm listesini atıyor
(`reports.service.ts`: `params.templateId || !params.sablon ? null : …`).
Şablonun ayrı bir sayfada olması hatanın sebebiydi, dekoru değil.

**Raporlar artık tek sayfa.** Kenar çubuğundaki üç bağlantı (Raporlar, Rapor
Şablonları, Faturalar) bire indi:

- Şablon seçici hem ön ayarları hem **kayıtlı şablonları** listeliyor;
  düzenleme ve "yeni şablon" aynı açılır listenin içinde, kaydedilen şablon
  hemen seçiliyor.
- Ekran URL'de **tek** `sablon` parametresi taşıyor; UUID mi ön ayar kodu mu
  olduğu tek yerde (`sablonAlanlari`) ayrılıyor. İki ayrı parametre taşımak,
  dallardan birinin birini düşürmesi demekti — düzeltilen hatanın kendisi.
- Faturalar sekme oldu. Yetki süzgeci kaybolmadı, sayfanın içine taşındı:
  `report.write` şablon düzenlemeyi, `report.share` fatura sekmesini açıyor.

**Bölüm sırası artık sürüklenerek değişiyor.** Satır başına ↑/↓ düğmeleri
vardı ve gerekçesi kaynakta yazılıydı: *"yedi öğelik bir listede kazancı yok"*.
Liste **on dörde** çıkınca o gerekçe çürüdü — bir bölümü en alttan en üste
almak on üç tıklama demek. Kütüphane eklenmedi (tarayıcının kendi HTML5
olayları); **klavye desteği korundu** — satır odaklanabilir ve ok tuşlarıyla
taşınıyor, yoksa özellik fareyi kullanamayan için tamamen kapanırdı. Taşıma
**takas değil araya sokma**: takas eden bir sürükleme kullanıcının bıraktığı
yere koymaz, iki öğeyi yer değiştirir.

**Bilinen kısıt — sessiz değil, ekranda yazıyor:** paylaşım bağlantısı ön
ayarları taşıyamıyor (`report_shares.template_id` bir UUID, ön ayarların
UUID'si yok). Ön ayar seçiliyken Paylaş menüsünde bunun ne anlama geldiği
yazıyor ve kullanıcı görünümü şablon olarak kaydetmeye yönlendiriliyor.

**Test:** 24 yeni test; 11 mutasyonun 11'i de yakalandı — ama üçü ancak
testler DÜZELTİLDİKTEN sonra:

1. `onDragOver`dan `preventDefault` silmek testi düşürmüyordu: dilim
   `indexOf(ad) + 400 karakter`di ve pencere KOMŞU işleyicinin
   (`onDrop`) içindeki `preventDefault`a kadar uzanıyordu. Sabit uzunluklu
   dilim, kilitlediğini sandığın şeyi kilitlemiyor — gövde artık süslü
   parantez sayılarak çıkarılıyor.
2. "Elle kurulmuş sorgu kalmadı" iddiası ilk yazımda **kırmızı verdi**: kod
   zaten düzeltilmişti, iddia o sorguyu ANLATAN yoruma eşleşiyordu. Taramalar
   artık yorumsuz kaynakta yapılıyor — tuzağın tehlikeli yönü ters yönde,
   pozitif bir `toContain` kod silinse bile yorumla eşleşip geçer.
3. `paylas-menusu.spec.ts` `<RaporGonder clientId={clientId}` arıyordu ve
   bileşene prop eklenip satır bölününce düştü; kilitlenmek istenen şey
   elemanın YERİ, prop'larının yazımı değil.

### 3.8. 31 Ağustos: Auto-Boost'un Bildirim Havuzu hiç dolmuyordu

Kullanıcı panelde fark etti: `/auto-boost` sayfasında "Bildirim Havuzu"
her zaman "Onay bekleyen içerik yok" gösteriyordu — Ege Birlik Yapı'da 22
organik gönderi doğru senkronize olmuş, ön ayar 24 Ağustos'tan beri açıktı,
ama kuyrukta (`auto_boost_queue_items`) tek satır bile yoktu.

**Sebep:** `AutoBoostQueueService.enqueueForProfile` — organik gönderiyi
onay kuyruğuna yazan fonksiyon — uzun süredir vardı ama **hiçbir yerden
çağrılmıyordu**. `autoboost.module.ts`'in kendi yorumu bile "organik
gönderi süpürmesi (Instagram yolu) onu çağırıyor" diyordu; yorum niyeti
anlatıyordu, kod hiç yazılmamıştı. `organic-sync.service.ts` gönderiyi
`organic_posts`a doğru yazıyor, iş `succeeded` kapanıyordu — hata yok, log
yok, yalnızca hiç dolmayan bir kuyruk.

**Düzeltme:** [sync-processor.service.ts](../apps/api/src/queue/sync-processor.service.ts)'in
`organic_posts` dalına eksik çağrı eklendi. Aynı oturumda ikinci bir istek
daha vardı: yeni içerik kuyruğa düştüğünde hello@profaj.com'dan, o
müşteriye atanmış danışmanlara VE hello@profaj.com'a bildirim maili
gitsin. `enqueueForProfile` artık `INSERT ... RETURNING` ile yazıyor (yeni
kart başlığı/bağlantısı maile taşınsın diye) ve YouTube WebSub yolu
(`enqueueOne`) da AYNI bildirim fonksiyonundan geçiyor — iki kaynak, tek
davranış. `client_viewer` (müşterinin kendi girişi) alıcı listesinden
bilinçli dışlandı: onay kuyruğu ajansın iç iş akışı.

Kaynak taraması testiyle kilitlendi (mutasyonla doğrulandı):
`organic-posts-kuyruk-baglantisi.spec.ts`. Commit `447d0fc`, deploy edildi.
`sweep:organic` saatte bir (`41 * * * *`) çalışıyor — Ege Birlik Yapı'nın
3 bekleyen Instagram gönderisi bir sonraki turda ya da elle "Şimdi
güncelle" ile kuyruğa düşüp mail tetikleyecek.

### 3.9. 2 Eylül: zamanlanmış rapor gönderimi

`ARCHITECTURE.md`'nin öngördüğü ama hiç yazılmayan `report_schedules` bu
oturumda yazıldı. Panelde `/raporlar` ekranında "PDF indir"in solunda
**Planla** düğmesi: haftada 1 / ayda 1, gün ve saat (İstanbul), rapor dönemi
ön ayarlı. Kurulu planlar aynı modalde listeleniyor, duraklatılabiliyor.

**En büyük risk mükerrer gönderim** — müşteriye aynı raporun iki kez gitmesi
geri alınamıyor ve worker `concurrency: 4` ile koşup pm2 tarafından sık
yeniden başlatılıyor. İki koruma birlikte:

  · **Koşullu UPDATE** (`WHERE id = $ AND next_run_at <= now()`): iki worker
    aynı satırı görürse ikincisinin claim'i SIFIR satır etkiliyor.
  · **Önce ileri at, sonra gönder**: sıra tersine olsaydı, gönderimle
    güncelleme arasında ölen worker'dan sonraki tur aynı raporu tekrar
    gönderirdi. Bu sırayla en kötü ihtimal bir dönemin ATLANMASI — atlanan
    rapor kurtarılabilir, mükerrer olan kurtarılamaz. Aynı gerekçeyle
    **otomatik tekrar deneme YOK**.

**Test yanlış sebeple geçti ve mutasyon bunu gösterdi.** "Aynı plan iki tur
üst üste koşarsa bir kez gönderilir" testi, claim'deki koşul SİLİNDİĞİNDE de
geçiyordu: ardışık çağrıda ikinci turu zaten `SELECT` süzgeci eliyordu, atomik
claim hiç sınanmıyordu. Gerçek yarış `Promise.all` ile iki eşzamanlı
`calistir()` çağrısıyla kuruldu (her `await` olay döngüsüne yer verdiği için
iki SELECT, sonra iki UPDATE sırası gerçekten oluşuyor) ve mutasyon artık
yakalanıyor. CLAUDE.md'deki "mutasyon komutu tutmadı ve test boşuna geçti"
desenin bir örneği daha.

**Pencere hesabı `packages/shared`a taşındı.** `date-range.ts` `apps/web`
altındaydı ve worker ona erişemiyor; kalan seçenek hesabı ikinci kez yazmaktı.
`raporPenceresi()` artık tek tanım ve panel de onu kullanıyor;
`pencere-uyumu.spec.ts` ikisinin aynı sonucu ürettiğini beş farklı tarihte
kilitliyor ("bugün rapora girmiyor" kırpması dahil).

**Sıklık × pencere bir uyumluluk matrisi.** Haftalık planda "Geçen ay" YOK
(aynı rapor ayda dört kez giderdi), aylık planda "Bu ay" YOK (ayın 1'inde
dönem henüz başlamamış olur ve `raporPenceresi` null döner). `objective-matrix`
dersi: uyumsuz seçenek arayüzde hiç görünmüyor, sunucu da reddediyor.

**Ayın günü 1–28 ile sınırlı** ve sebebi ekranda yazıyor: 29/30/31 her ayda
yok ve "ayın 31'i" seçen bir plan Şubat'ta sessizce atlanırdı.

**Gönderen, planı KURAN kullanıcı.** Elle gönderimde rapor danışmanın kendi
adresinden gidiyor; zamanlanmışta oturum olmadığı için `created_by_user_id`
saklanıyor. Kimlik bozulursa BAŞKA BİR GÖNDERİCİYE DÜŞÜLMÜYOR — müşteriye
tanımadığı birinden mail gitmesi, hiç gitmemesinden kötü. Panel `senderReady`
ile bunu satırın üstünde yazıyor.

**Dönemde veri yoksa gönderilmiyor** (`last_status = 'skipped'`, sebebiyle):
sıfırlarla dolu otomatik bir mail müşteriye "sistem bozulmuş" diye okunuyor.
Atlama sessiz değil, listede görünüyor.

`Prisma.sql` şablonu içindeki yorumda backtick tuzağına **bu oturumda da bir
kez düşüldü** (`TS1005`), CLAUDE.md'de yazılı olmasına rağmen.

### 3.10. 2 Eylül: toplu yazmanın iki hatası — ALTI SERVİSTE BİRDEN

Kullanıcı Kaşkaloğlu Göz Hastanesi'nde "veriler çekilemedi" bildirdi. Teşhis
ekranında aynı anda dört iş kırmızıydı ve hepsinin kökü İKİ hataydı:

| İş | Hata |
|---|---|
| Yapı taraması | `too many bind variables … received 84093` |
| Arama terimleri | `too many bind variables … received 123615` |
| Anahtar kelime | `ON CONFLICT … cannot affect row a second time` |
| Kırılımlar | `ON CONFLICT … cannot affect row a second time` |

**① BAĞLI PARAMETRE SINIRI (32.767).** Toplu `INSERT` elindeki BÜTÜN satırları
tek sorguya koyuyordu; sınır hesabın büyüklüğüne bırakılmıştı. Hata
DETERMİNİSTİK — satır sayısı değişmediği için beş deneme de aynı yerde düşüyor
ve iş kalıcı `failed` oluyor.

**② AYNI PARTİDE AYNI ÇAKIŞMA ANAHTARINDAN İKİ SATIR.** Postgres komutun
TAMAMINI reddediyor; iki mükerrer satır yüzünden binlerce satır kayboluyor.

**ZİNCİRLEME ETKİSİ ASIL BEDELDİ.** Yapı düşünce kampanya satırı oluşmuyor ve
bütün metrik işleri — doğru davranarak — "yapı taraması hiç koşmadı" deyip
düşüyor. Kullanıcının gördüğü şey "yeni müşteride hiç veri gelmiyor" oluyordu;
sebep yalnızca `sync_jobs` içinde yazılıydı.

**NOKTA DÜZELTMENİN BEDELİ.** Bu hata sınıfı 31 Ağustos'ta `insights-sync`
içinde düzeltilmişti — ve yalnızca orada. Aynı hata beş serviste daha
duruyordu ve üretimde patlayana kadar görünmedi. Düzeltme artık TEK KAPIDA
(`queue/toplu-yazma.ts`): parçalama + mükerrer temizliği, altı servisin
hepsi oradan geçiyor. Parça boyu satır başına GERÇEK parametre sayısından
ölçülüyor (`Prisma.Sql.values.length`), elle yazılmıyor — bir kolon
eklendiğinde kendiliğinden küçülüyor.

`toplu-yazma.spec.ts` bir KAYNAK TARAMASI taşıyor: toplu yazan bir servis
paylaşılan yardımcıyı kullanmıyorsa ya da `Prisma.join(values)` ile doğrudan
yazıyorsa test düşüyor. Tarama işini hemen gördü — `insights-sync`'in kendi
ayrı chunk'lama döngüsünü yakaladı (iki farklı uygulama, tam da kaçınılmak
istenen şey).

**AYRI BİR EKSİKLİK: arama terimi ve anahtar kelime GEÇMİŞİ hiç çekilmiyordu.**
Kullanıcının ikinci bildirimi ("raporda geçen ay'a tıkladığımda arama
terimleri listelenmiyor") bir hata değil bir boşluktu: bu iki tabloyu yalnızca
gecelik süpürme dolduruyor ve o da SON 7 GÜNÜ çekiyor. Ne `initial_backfill`
ne "Tüm verileri güncelle" kapsıyordu — 8 günden eski hiçbir arama terimi
hiçbir zaman oluşmuyordu. `toplu-tazeleme.ts` artık ikisini de planlıyor,
YALNIZCA Google hesaplarında (Meta'da bu iki tablo yok; iş açmak her turda
kesin düşecek bir iş üretmek olurdu).

**CANLIDA DOĞRULANDI (2026-09-02 08:18 UTC).** Kaşkaloğlu'nun Google hesabı
düzeltme öncesi 07:07–08:07 arasında dört kez `failed` olmuştu. Deploy sonrası
elle tetiklenen tur:

| İş | Sonuç |
|---|---|
| `structure` | ✅ **14.926 satır** (önce: `received 84093` ile düşüyordu) |
| `initial_backfill` | ✅ **9.959 satır**, 2026-06-04 … 2026-09-02 |

Yazılan: 78 kampanya · 840 reklam grubu · 7.004 reklam. Sistem genelinde son
20 dakikada bind/`ON CONFLICT` hatası: **0**.

İKİNCİ ŞEY DE KANITLANDI: `initial_backfill` ELLE TETİKLENMEDİ. Yapı taraması
başarılı olunca `yapiSonrasiGecmisiKuyrukla` devreye girip 90 günlük geçmişi
yeniden kuyruğa aldı — "yeni müşteride 90 gün kendiliğinden gelsin" isteğinin
karşılığı bu zincir ve artık çalışıyor.

**HENÜZ CANLIDA GÖRÜLMEYEN:** `ON CONFLICT` mükerrer düzeltmesi (anahtar
kelime ve kırılım). O işler gecelik koşuyor (04:47 / 05:07 / 05:32 UTC);
şimdilik yalnızca mutasyonla doğrulanmış birim testleri var. İlk gece
sonrası `sync_jobs` kontrol edilmeli.

**Panel:** rapor şablonu modalı 14 bölümde ekranı aşıyor ve "Kaydet"
görünmüyordu (kullanıcı tarayıcıyı %67'ye küçültmek zorunda kalıyordu).
Kart artık ekran yüksekliğiyle sınırlı; gövde ve bölüm listesi kendi içinde
kaydırılıyor, başlık ve düğmeler sabit.

### 3.11. 2 Eylül: Auto-Boost paneli — üç düzeltme ve bir keşif

**KEŞİF: istenen "boost ön ayarı ekranı" ZATEN YAZILMIŞTI** — `/kutuphane/
bilgi-bankasi` altında, menünün bambaşka bir bölümünde. Kullanıcının iki ayrı
gibi görünen isteği ("Bilgi Bankası'nı Auto-Boost tarafına taşı" + "ön ayar
ekranı yap") aslında aynı şeyin iki yarısıydı. Şema da her şeyi baştan
destekliyordu (`savedAudienceId`, `locations`, workspace bazlı kayıt); eksik
olan yalnızca paneldi.

**① KAYITLI KİTLE UCU ÜRETİMDE BOZUKTU.** `meta.provider.ts` `approximate_count`
alanını istiyordu; Meta onu Marketing API v17'de (2023) kaldırıp
`approximate_count_lower_bound`/`_upper_bound` çiftiyle değiştirmiş, v25'te
çoktan yok. Sonuç `(#100) Tried accessing nonexisting field` → 502.

BELİRTİSİ ÇOK YANILTICIYDI: panel hatayı YUTUP "Ads Manager'da kayıtlı kitle
bulunamadı" yazıyordu — kullanıcı KENDİ Meta kurulumunu eksik sanıyordu. Bu,
CLAUDE.md'nin açıkça yasakladığı `.catch(() => setX([]))` deseninin ta
kendisiydi ve aynı dosyadaki lokasyon araması onu zaten doğru yapıyordu:
iki bitişik çağrı, iki farklı standart.

İki incelik daha: Meta pasif lookalike'larda bu alanları **-1** döndürüyor
(panelde "~-1 kişi" yazardı; `typeof === 'number'` -1'i geçerli sayıyor) ve
`limit=100` sayfalaması hiç izlenmiyordu — 100'den fazla kitlesi olan hesapta
liste SESSİZCE kesiliyordu.

**② "YAYINLANDI" KARTTA GÖRÜNMÜYORDU — iki ayrı sebep.**
`router.refresh()` istemci bileşeninin state'ini tazelemiyor: `BildirimHavuzu`
`use client` ve listeyi kendi `useEffect`'inde çekiyor, bağımlılığı
`[clientId]` ve o değişmiyor. Sunucuda kart `launched` olmasına rağmen
ekranda `pending` çizimi duruyordu. Doğru desen AYNI SAYFADA vardı
(`manual-boost.tsx` → `onYayinlandi={gonderileriYukle}`).

İkinci yarısı: başarı hâli kartta HİÇ çizilmiyordu, yalnızca hata çiziliyordu.
`OnayDugmesi` onaydan sonra `return null` ile kayboluyor, yerine hiçbir şey
konmuyordu. Kullanıcının gördüğü tek iz sayfanın en altındaki "Geçmiş"
satırıydı — tarifi birebir buydu. `externalCampaignId` şemada vardı, API
dolduruyordu, panelde tek referansı yoktu ("veride duran alan,
kullanılmıyorsa yoktur").

**③ ÖN AYAR EKRANI AUTO-BOOST'A GELDİ + iki eksik alan eklendi.**
"Boost ön ayarı" düğmesi başlıkta, modal olarak açılıyor (portal — CLAUDE.md'de
üç kez düşülen `backdrop-filter` tuzağı). Forma **şehir seçimi** ve
**kayıtlı/özel hedef kitle** eklendi; ikisi de gövdeye SABİT boş yazılıyordu.

Reklam hesabı bileşenin içinde çözülüyor ve EKRANDA YAZIYOR: Meta'da kayıtlı
kitle REKLAM HESABI BAŞINA tanımlı, ön ayar ise müşteri bazında. Yazmasaydı
iki hesaplı bir müşteride kullanıcı yanlış hesabın kitlesini seçip yayında
"kitle bulunamadı" alırdı.

KAYITLI KİTLE SEÇİLİYSE ŞEHİR/YAŞ/CİNSİYET GÖNDERİLMİYOR ve ekranda yazıyor:
Meta lokasyon kovalarını BİRLEŞİM olarak uyguluyor, "İzmir + kitle" sessizce
kitleden geniş bir kümeye çıkardı.

**Panel:** aynı kartta üst üste duran iki başlık kaldırıldı (dış sarmalayıcı
"Otomatik boost" h2'si + `BildirimHavuzu`nun kendi h2'si). **Menü:** Bilgi
Bankası Kütüphane'den Akıllı Boost'un altına taşındı.

**BEŞ YAYIN YOLU İKİYE İNDİ — form kaldırıldı (aynı gün, ikinci tur).**

`manual-boost` listesinde yan yana duran iki yol asıl karmaşıklıktı: satıra
tıklamak beş adımlı formu besliyor (`POST /boosts/manual`, FORM ayarı),
satırın SAĞINDAKİ "Yayınla" ise formu tamamen atlayıp ön ayarla yayınlıyordu
(`POST /autoboost/posts/:id/launch`). Aynı gönderi, hangi düğmeye basıldığına
göre FARKLI BÜTÇEYLE para harcıyordu.

Kullanıcının kararı: **ön ayar geçerli, form kalksın.** `manual-boost.tsx`
1.190 → 409 satır. Kaldırılanlar: bütçe/süre girdileri, kampanya seçimi,
hedefleme bloğu (`ManualTargeting`), `KampanyaSecim`, `SpendLine`, `Blok`,
`PRESETS` ve `/boosts/manual` çağrısı. Gönderi satırı `<button>` iken `<div>`
oldu — tıklamanın tek işlevi kaldırılan formu beslemekti ve tıklanan ama
hiçbir şey yapmayan bir satır, çalışmayan bir düğme göstermekle aynı şey.

Kaldırmak yetenek kaybı DEĞİL: ön ayar aynı turda şehir ve kayıtlı kitle de
kazandı, yani formun sorduğu her şeyi kapsıyor. Ön ayar artık bir ÖN KOŞUL
ve yokluğu bantta sebebiyle yazıyor.

`on-ayar-tek-kaynak.spec.ts` kararı kaynak taramasıyla kilitliyor (mutasyonla
doğrulandı): panel `/boosts/manual` çağırırsa ya da bir bütçe/hedefleme
girdisi geri gelirse test düşüyor.

**AÇIK KALAN:** `POST /boosts/manual` ucu sunucuda DURUYOR ama panelden
çağrılmıyor. Doğrudan çağrılırsa ön ayarı yok sayıp gövdedeki bütçeyle para
harcar. Kaldırılması ayrı bir tur — `boosts.service.ts` mantığı ve testleri
buna bağlı.

### 3.12. 2 Eylül: platform faturaları rapora ek — ve API'nin ÇIKMAZI

İstek: "Meta ve Google Ads faturalarını rapora ek PDF olarak ekle."
Kullanıcının asıl derdi net: *"müşteri her şeyi tek pakette görsün"* ve
**belgenin resmi olması şart**.

**ÖNCE OLABİLİRLİK ARAŞTIRILDI VE İKİ PLATFORMDA DA DUVARA ÇARPILDI.**

| Platform | Durum |
|---|---|
| Google | `InvoiceService.ListInvoices` VAR, `pdf_url` alanı VAR, erişim seviyemiz (Basic) YETERLİ — ama **yalnızca aylık faturalama (kredi hattı) hesaplarında** çalışıyor |
| Meta | Fatura PDF'i döndüren uç **YOK**. `business_invoices` yalnızca metadata veriyor |

Google kısıtı iki bağımsız kaynakla doğrulandı: resmi doküman (*"otomatik
kredi kartı ödemeleri bu programatik faturalama akışlarıyla uyumlu değil"*)
ve Google ürün ekibinin forum yanıtı (*"Automatic Payments is currently not
supported by the API"*). Kartla ödeyen hesapta çağrı
`Cannot request invoices for a billing setup that is not on monthly
invoicing` ile düşüyor. Bu projedeki müşteriler kendi kartlarıyla ödüyor.

Meta tarafında insanların kullandığı `act_<id>/transactions` ucu
**DOKÜMANTE DEĞİL** — Ads Manager arayüzünün içsel çağrısı. Bu projede
dokümante olmayan uca bağlanmak daha önce pahalıya patladı; kullanılmadı.

**Kendi harcama dökümümüzü üretmek de cevap değildi:** sayılar doğru olurdu
ama muhasebeye gitmezdi ve fatura yerine sunmak yanlış olurdu.

**Kalan tek dürüst yol elle yükleme** ve kullanıcı bunu onayladı. Ajans
faturayı platformdan indirip panele yüklüyor, rapor maili o dönemin
faturalarını **AYRI EK** olarak taşıyor (rapor PDF'ine birleştirilmiyor:
fatura resmi bir belge ve başka bir belgenin arkasına eklemek bütünlüğünü
tartışmalı yapardı).

**Tasarım kararları:**

  · **Dönem `YYYY-MM`, tarih aralığı değil.** Fatura bir aya ait; aralık
    tutmak hiç kullanılmayacak bir ayrım üretirdi.
  · **Bir dönem + bir platform = bir fatura** (kısmi tekil indeks). İkinci
    yükleme öncekini DEĞİŞTİRİYOR; iki fatura dursaydı maile hangisinin
    gireceği belirsiz kalırdı.
  · **Ayın bir kısmını kapsayan rapor da o ayı sayıyor** — fatura ayın
    tamamına ait. Yalnızca tam ayları saymak, "1–15 Ağustos" raporunda
    faturayı sessizce düşürürdü.
  · **PDF olduğu GÖVDEDEN doğrulanıyor** (`%PDF-` sihirli baytları),
    `content-type`tan değil: tarayıcı MIME'ı uzantıdan tahmin ediyor.
  · **Eksik dönem SESSİZ kalmıyor** ama gönderimi de DURDURMUYOR (kullanıcı
    kararı): panelde uyarı, `sync_jobs` notunda ve denetim kaydında iz.
  · **Eksik PLATFORM başına aranmıyor, DÖNEM başına.** Müşterinin yalnızca
    Meta'da reklamı olabilir; "Google faturası eksik" her ay yanlış bir
    uyarı üretir ve okunmaz hâle gelen uyarı, hiç olmayandan kötü.

Ekran iki yerde, TEK bileşenle: rapor sayfasında (dönem hazır seçili, yanlış
aya yükleme riski düşük) ve `/raporlar/faturalar`ta (toplu yönetim). Ayrı
yazılsalardı biri PDF doğrulamasını ya da çoklu yükleme kuralını
kaybederdi.

`fatura.spec.ts` dönem eşleştirmesini ve **maile GERÇEKTEN eklendiğini**
kilitliyor — ikinci tarama mutasyonla doğrulandı: planlı gönderimden ek
kaldırılınca test düşüyor. O tarama şart, çünkü `raporEkleri()` doğru
çalışsa bile ÇAĞRILMAZSA hiçbir birim testi yakalamazdı; Bildirim Havuzu
aylarca tam bu yüzden boş kaldı.

**AÇIK KALAN:** bir müşterinin Google hesabı aylık faturalamadaysa orada
otomatik çekme yazılabilir (`pdf_url` + aynı OAuth jetonu). Kullanıcı
hesapların ödeme yöntemini kontrol edecek.

**Deploy script'i SSH bağlantısı kesilirse yarıda kalabiliyor.** Build
adımı (`nest build` + `next build`) birkaç dakika sürüyor ve bu sırada
sessiz kalabiliyor; bir SSH oturumu (ör. uzun bir inaktivite zaman aşımı)
düşerse `deploy.sh` `pm2 restart`a hiç ulaşmadan ölüyor — ki bu ZARARSIZ
(canlı süreçler eski koda devam eder), ama `.last-deployed-sha`
GÜNCELLENMEMİŞ görünür ve bu kafa karıştırır. Elle deploy ederken
`nohup ./scripts/deploy.sh > deploy-run.log 2>&1 < /dev/null &` ile
oturumdan bağımsız çalıştırmak ve `.last-deployed-sha` ile bitişi
doğrulamak daha güvenilir.

### Onay beklerken (kod tarafı)

4. ~~**Bildirim altyapısı.**~~ ✅ **YAPILDI** (2026-08-27/28): panel geneli
   uyarı bandı (`/alerts`), günde iki kez hesap durumu kontrolü ve ödeme
   sorunu maili. Kalan: bütçe ve kural aksiyonu uyarıları hâlâ bandın
   dışında; eşiği zaten
   hesaplıyor, gönderecek kanal yok. *Açtığı: CENTRAL uyarıları, zamanlanmış
   rapor.*
5. **Sunucu tarafı PDF (Playwright).** Zamanlanmış raporun diğer yarısı.
   *Açtığı: REPORT'un eksik kalan tek maddesi.*
6. **BASE — varlık arşivi.** Toplu oluşturucunun `image_hash` elle girme
   sorununu çözer. *Açtığı: CREATE'in gerçek verimi.*
7. **Sağlık skoru.** Girdileri hazır: bütçe pacing, kural tetiklenmeleri, veri
   bayatlığı, frekans. Yeni veri gerekmiyor, yalnızca birleştirme.

### Onay geldikten sonra

8. **Canlı yazma doğrulaması** (yukarıdaki 5 adımlı sıra).
9. **Günlük sert limit ve otomatik durdurmayı uygula.** Alanlar hazır, yalnızca
   kural motoruna bağlanacak.
10. **Google yazma yolu.** Okuma canlıda doğrulandı; kampanya oluşturma,
    duraklatma ve bütçe değiştirme yazılmadı. Meta'daki deneyim, her yazma
    yolunun ayrı canlı doğrulama istediğini gösterdi.

### Sonraya bırakılanlar

- A/B test motoru (OPTIMISE)
- Teklif yönetimi
- Kitle ve anahtar kelime kütüphanesi (BASE)
- `fx_rates` çevrimi — ikinci para birimli müşteri çıkana kadar gereksiz

---

## 8. Bu projede tekrar eden hata deseni

Kayda değer: bugüne kadar yakalanan hataların **neredeyse tamamı sessizdi.**
Hiçbiri hata fırlatmadı, log üretmedi; yalnızca yanlış sayı gösterdiler ya da
hiç çalışmadılar.

Örnekler: dönüşümlerin üç kez sayılması · panelin bugünü dışlayıp raporun
içine alması · `dry_run` karşılaştırmasının her düzenlemede kuralı provaya
döndürmesi · denetim kaydının `BIGSERIAL` yüzünden düşüp başarılı yazmayı
"başarısız" göstermesi · `org_id` kolonuna müşteri kimliği yazılması.

**11–28 Ağustos'ta eklenenler** — deseni doğruluyor, hepsi sessizdi:

| Hata | Belirtisi | Nasıl görünmedi |
|---|---|---|
| Kırılım sorgusunda `dimension` süzgeci yok | Beş tablo da aynı satırları gösteriyor, toplamlar 5× | Boyut yalnızca bloğun ETİKETİNDE kullanılıyordu, sorguya hiç girmiyordu — TypeScript susuyordu |
| `platformFiltresi` iki metotta ÇİFT | — | SQL zararsız (aynı koşul iki kez) ama **testi bozuyordu**: "en az yedi yerde geçsin" iddiası tam da kopyalar sayesinde tutuyordu. Test hatayı DOĞRULUYORDU |
| Alt sorgular `platform` alanını hiç okumuyordu | Şablon daraltması sessizce etkisiz | Nesneye fazladan alan eklemek TypeScript'te hata değil |
| `share.service.ts` bağlamı `permissions` taşımıyordu | Her paylaşılan rapor bağlantısı çalışma anında düşecekti | `as TenantContext` cast'i denetimsiz |
| `router.refresh()` beklenmiyor | Bekleme göstergesi tam bekleme başlarken sönüyor | Bayrak vardı, yanlış pencerede açıktı |
| `backdrop-filter` kapsayıcı blok üretiyor | Tam ekran pencere üst bara sıkışıyor | **ÜÇ KEZ** düşüldü: yönetim paneli, müşteri detayı, bekleme örtüsü |
| `.env.example`'da gerçek parola | Depoyu okuyan herkes girebilir | Diğer sır alanları yer tutucuydu; bir satır kaçmıştı ve 17 gün durdu |

**Testin kendisi de sessizce boşa düşebiliyor.** Bu dönemde yaşananlar:

- İddia yoruma çapalandı, koda değil (kuralı ANLATAN yorum `toContain`'i geçirdi)
- İddia `import` satırına çapalandı, çağrıya değil (`createPortal` adı import'ta da var)
- İddia metodun tamamına çapalandı, ilgili sorguya değil (aynı dize ikinci sorguda da vardı)
- İddia sayıma dayandı ve sayı kopyalanmış satırlar sayesinde tutuyordu
- **Mutasyon komutu tutmadı ve test boşuna "geçti"** — iki kez: bir kez yanlış
  girinti hedeflendi, bir kez iki uçta aynı desen olduğu için yanlış uca
  uygulandı. **Mutasyonun GERÇEKTEN uygulandığı doğrulanmadan "test tuttu"
  denemez.**

Pratik sonuç: **yeni bir özellik "çalışıyor gibi görünüyor" ile kabul
edilmiyor.** Sayının doğru olduğunu gösteren bir test ya da canlı doğrulama
olmadan tamamlanmış sayılmıyor. PGlite koşum ortamı (`test/pglite-harness.ts`)
bu yüzden var: gerçek Postgres motoruna karşı çalışıyor ve TypeScript'in
göremediği SQL hatalarını yakalıyor.
