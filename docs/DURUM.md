# Advetics — Durum ve Yol Haritası

> **Son güncelleme:** 2026-08-11
> **Kaynak:** Bu belge koddan doğrulanarak yazıldı, hafızadan değil. Her iddia
> için dosya yolu verilmiştir; şüphe duyduğun satırı açıp bakabilirsin.
>
> `ARCHITECTURE.md` **planı** anlatıyor (2026-08-03'te yazıldı). Bu belge
> **gerçekte ne olduğunu** anlatıyor. İkisi çeliştiğinde bu belge geçerli.

---

## 1. Tek bakışta

| | |
|---|---|
| Veritabanı tablosu | **41** |
| Migration | **21** |
| API testi | **684** |
| Web testi | **20** |
| Panel sayfası | **12** |
| API controller | **19** |

**İki cümlelik özet:**

**Okuma tarafı iki platformda da canlı.** Meta zaten çalışıyordu; Google Basic
Access 11 Ağustos'ta alındı ve aynı gün baştan sona doğrulandı — 129 hesap
keşfi, yapı senkronizasyonu, metrikler. Hesap toplamı kampanya toplamına
kuruşuna kadar eşit çıktı.

**Yazma tarafı hiçbir platformda canlıda çalıştırılmadı.** Kural aksiyonları,
boost oluşturma, toplu reklam ve Reklam Oluşturucu — dördü de `ads_management`
onayı olmadan çalıştırılamazdı. Bkz. § 5.

---

## 2. Workspace mimarisine göre kapsama

Senin paylaştığın 7 parçalı mimariye göre. ✅ tamam · 🟡 kısmi · ❌ yok

### 1 — WORKSPACE & AGENCY MANAGEMENT ✅

| Yetenek | Durum | Nerede |
|---|---|---|
| Çoklu kiracı (org → müşteri → kullanıcı) | ✅ | `prisma/schema.prisma` |
| Rol ve yetki matrisi | ✅ | `packages/shared/src/auth/roles.ts` |
| RLS — 60+ politika, `FORCE` edilmiş | ✅ | `prisma/sql/02_rls.sql` |
| Beyaz etiket (logo, renk, font) | ✅ | `branding_profiles` |
| Denetim kaydı (append-only) | ✅ | `audit_logs` |
| Davet akışı | ✅ | `invitations` |
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
| Yazdırma | 🟡 | Tarayıcı yazdırma; sunucu PDF'i yok |
| **Zamanlanmış PDF/Excel** | ❌ | **E-posta altyapısı yok** |
| Anahtar kelime raporu | 🟡 | Veri hattı yazıldı, canlı doğrulanmadı |

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

## 4. Plandan sapmalar

`ARCHITECTURE.md` şu tabloları öngörmüştü; gerçekte farklı çıktılar:

| Planlanan | Gerçek | Neden |
|---|---|---|
| `rule_executions` | `rule_runs` | Aynı şey, ad kısaldı |
| `rule_actions` (kural tanımı) | `rules.action` (JSONB) | Tek aksiyon var, tablo gereksiz |
| `boost_executions` | `boosts` | Aday + onay + oluşturma tek tabloda |
| `bulk_jobs` / `bulk_variants` | `bulk_batches` / `bulk_items` | Aynı yapı |
| `reports` (üretilmiş rapor) | — | Rapor **anlık** üretiliyor, saklanmıyor |
| `report_schedules` | — | Zamanlanmış rapor yazılmadı |
| `notifications` | — | Bildirim altyapısı yazılmadı |
| `bulk_assets` | — | Varlık arşivi (BASE) yazılmadı |

Plandan **fazla** çıkanlar: `monthly_budgets` (planda yoktu, dört özelliğin
temeli oldu), `organic_posts` (planda vardı ama alan seti genişledi).

---

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

### Onay beklerken (kod tarafı)

4. **Bildirim altyapısı.** Uyarıların gerçekten gitmesi için gereken tek şey.
   Bütçe uyarısı, kural aksiyonu, senkronizasyon hatası — üçü de eşiği zaten
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

Pratik sonuç: **yeni bir özellik "çalışıyor gibi görünüyor" ile kabul
edilmiyor.** Sayının doğru olduğunu gösteren bir test ya da canlı doğrulama
olmadan tamamlanmış sayılmıyor. PGlite koşum ortamı (`test/pglite-harness.ts`)
bu yüzden var: gerçek Postgres motoruna karşı çalışıyor ve TypeScript'in
göremediği SQL hatalarını yakalıyor.
