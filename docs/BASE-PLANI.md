# Marka Merkezi (BASE modülü) planı

Kaynak: kullanıcının "Advetics - BASE Modülü Detaylı Mimari ve Veri Sahaları"
taslağı (2026-09-28). Taslak bir **kurgu**, şartname değil. Kullanıcının
talimatı: *"bundan fikir al ama buna göre hareket etme; daha iyi optimize
edebiliyorsan kendi inisiyatifine göre hareket et"*. Aşağıda her başlık için
taslağın ne istediği, bugün neyin var olduğu ve NE YAPILACAĞI yazıyor.
Taslaktan sapılan yerlerin gerekçesi yanında.

## Tek fikir

Taslağın özü doğru: bir workspace sisteme girdiğinde önce onun "beyni"
dolduruluyor ve reklam oluşturma, AI asistan ve raporlar kararlarını oradan
okuyor. Bugün bu beyin **dokuz ayrı ekrana dağılmış** durumda (Kurulum
Sihirbazı, Şirketler, Platform Bağlantıları, Bağlı Kanallar, Bilgi Bankası,
Görsel Arşivi, Kreatifler, Formlar, Ekip) ve hesap atama bunların dördünde
ayrı ayrı yapılıyor.

**Karar:** workspace başına tek bir sayfa: **Marka Merkezi**. Adı iş dilinde
("BASE" panelde geçmiyor, CLAUDE.md §5). Menüde "Kütüphane" bölümünün yerini
alıyor. Ajansa ait işler (üst hesap, şirketler, ajansın platform kimliği,
havuz, ekip, e-posta) "Sistem Yönetimi"nde kalıyor.

**Taslağa eklenen: Hazırlık listesi.** Sayfanın en üstünde "Bu workspace
reklama hazır mı?" sorusunun cevabı: hesap atandı mı, veri geliyor mu, marka
bilgisi dolu mu, logo var mı… Her satır eksikse neden eksik olduğunu ve
nereden tamamlanacağını söylüyor (`emptyReason` deseni). Taslak "ilk olarak
bu modül doldurulur" diyor; bir kural olarak yazmak kimseyi durdurmaz, görünür
bir liste durdurur. Reklam Oluştur da aynı listeyi okuyup eksik ön koşulu
TIKLAMADAN önce söylüyor (doğrulama giriş anında).

## Sekmeler

### 1. Bağlantılar (taslakta "Hesaplar, Entegrasyonlar ve Yetkiler")

| Taslak | Bugün | Yapılacak |
|---|---|---|
| Meta, Google, LinkedIn reklam hesabı bağlama | Var; atama 4 ayrı ekranda | Tek atama noktası burası; diğer ekranlar buraya bağlanıyor |
| Müşteri kendi BM'indeki hesabı ekler | Var (2026-09-23, "havuzun iki sahibi") | Sahiplik her satırda rozet olarak görünüyor: "Ajans atadı" / "Senin bağlantın" |
| Ajansın atadığını müşteri değiştiremez | Var (K4) | Kural değişmiyor; düğme gizlenmiyor, kilitli ve SEBEBİYLE duruyor |
| Ajansın atadığını müşteri **kaldırabilir** | Kod bunu bilerek YASAKLIYOR (K4) | **Kaldırabilecek, iz bırakacak** (2026-09-28 kararı, aşağıya bkz.) |
| Instagram, Facebook sayfası, YouTube | Var (`social_profiles`, Bağlı Kanallar) | Aynı sekmede, hesapların yanında |
| Meta Pixel / CAPI | Yok | Faz 1: pikseli ve son olay zamanını OKU (mevcut token yetiyor). Yazma yok |
| GA4 | Yok | Son faza: yeni OAuth kapsamı istiyor ve Google uygulama doğrulamasını tetikleyebilir |
| Ajans ekibi atama | Var, iki ayrı arayüzde | Tek arayüz, bu sekmeden |
| Müşteriye "yalnızca rapor" erişimi | Var (`client_viewer`, `/r/[token]`) | Buradan tek düğmeyle |

### 2. Marka (taslakta "Knowledge Base")

Bugün üç serbest metin alanı (her biri 2.000 karakter) ve logo. AI asistan
ve reklam metni servisi bunları okuyor (`musteri-baglami.ts`,
`reklam-metni.service.ts`).

Yapılacak: alanlar **yapılandırılıyor**, çünkü serbest metin ekranda
doldurulmuş görünür ama makine onu kullanamaz:

- Marka adı, sektör, ana ürün/hizmet kategorileri
- Web sitesi ve sık kullanılan sayfalar. Reklam Oluştur'da hedef adres bu
  listeden seçiliyor; elle yazılan adres hatası kalkıyor
- Ana amaç (satış, form, arama, bilinirlik). `goal-mapping.ts`in varsayılanı
  oluyor, kullanıcıya bir daha sorulmuyor
- Üslup, benzersiz vaatler (USP)
- Aylık hedef bütçe **yeni bir alan DEĞİL**: `monthly_budgets` zaten var ve
  kural motoru onu okuyor. İkinci bir kopya iki ayrı rakam demek. Sekme aynı
  kaydı gösteriyor.

"Siteden tek tuşla doldur" (`bilgi-bankasi-ai.service.ts`) yeni alanları da
dolduruyor. Doldurulan her alan kullanıcıya önerildiği gibi gösteriliyor;
onaysız yazılmıyor.

**2a UYGULANDI (2026-09-29):** alanlar, Marka sekmesi, AI bağlamı, hazırlık
listesi, siteden doldur. Plandan iki sapma: web sitesi `clients.website`
olarak kalıyor (ikinci kopya yok) ve ana amaç yalnızca sistemin kurabildiği
üç hedef. Ayrıntı `DURUM.md`. **2b UYGULANDI (2026-09-29):** Hızlı
Reklam ana amaçla açılıyor, hedef adres sayfa listesinden seçiliyor. Uzman
yüzeyi değişmedi. **Bölüm 2 tamam.**

### 3. Kitleler (taslakta "Audience Hub")

Bugün yok. Hedefleme boost ön ayarlarının içinde, ön ayar başına ayrı
duruyor.

- **Temel şablonlar** (yaş, cinsiyet, konum): platformdan bağımsız
  saklanıyor, yayın anında platforma çevriliyor. Meta tarafı TEK üreticiden
  geçiyor (`meta-targeting.ts`, CLAUDE.md: ikinci üretici doğduğu anda
  ayrışıyor). Konum kovalarının birleşim olduğu ("Türkiye + İzmir = Türkiye
  geneli") şablonda da geçerli.
- **Doğal dilden kitle** ("son bir ayda lüks araç arayan erkekler"): AI bir
  ÖNERİ üretiyor, kullanıcı ortaya çıkan somut hedeflemeyi (ilgi alanları,
  yaş) görüp onaylıyor. Taslaktaki "AI çevirir ve pakete koyar" hâli
  sessiz bir tahmin olurdu. Platform bir ilgi alanını kabul edip görmezden
  gelebiliyor.
- **Özel ve benzer kitleler**: Faz 1'de platformdaki mevcut kitleler
  OKUNUYOR (Meta okuma kodu boost için zaten var). Kitle OLUŞTURMAK bir yazma
  yolu ve canlıda gözle doğrulanmadan bitmiş sayılmıyor.

**4a UYGULANDI (2026-09-30):** temel şablonlar Marka Merkezi'nde, Hızlı
Reklam varsayılanı kendiliğinden uyguluyor. Sapma: şablon YALNIZCA META
(konum anahtarları Meta'nın; Google uzayına çevirmek tahmin olurdu). Öncesinde
taslak ağacındaki üçüncü hedefleme üreticisi birleştirildi (şehir + ülke =
ülke geneli hatası).

**4c UYGULANDI (2026-09-30):** ilgi alanları (Meta araması, büyüklükle) ve
doğal dilden öneri: AI yapılandırıyor, sunucu Meta'da çözüyor, kullanıcı
onaylıyor. K16 ("panelde ilgi seçtirmiyoruz") kullanıcı isteğiyle kalktı.
İlgi araması canlıda doğrulanmadı (`meta-ilgi-kontrol`). **Kalan:** 4b
özel/benzer kitleleri okuma; Akıllı Boost ve uzman modun şablonları okuması.

### 4. Koruma kuralları (taslakta "Global Kurallar")

Bugün yok.

- **Marka kelimeleri**: raporda "marka aramaları / marka dışı aramalar"
  ayrımı. Yalnızca okuma, risksiz, ilk yapılacak.
- **Negatif kelime listesi**: Google'da paylaşılan negatif liste
  (SharedSet) olarak, Advetics'in AÇTIĞI kampanyalara yayın anında
  bağlanıyor. Meta'da anahtar kelime yok. Her kampanyada "liste bağlandı /
  bağlanmadı" yazıyor. Google yazma yolu canlıda hiç denenmedi (CLAUDE.md),
  ilk çağrı gözle doğrulanacak.
- **Yerleşim hariç tutma**: Google Display/YouTube yerleşim hariç tutma ve
  Meta engelleme listesi. Negatif listeyle aynı desen.
- **IP hariç tutma: YAPILMIYOR.** Yalnızca Google'da, kampanya başına ve
  500 adres sınırıyla var; Meta'da karşılığı yok. Tek platformda yarım
  çalışan bir koruma, "korunuyorum" sanrısı üretir.

### 5. Varlıklar (taslakta "Brand Asset Management")

Bugün Görsel Arşivi (görsel, video, logo), Kreatifler ve Formlar ayrı menü
satırları.

- Üçü bu sekmenin altına iniyor.
- **Marka renkleri** workspace'e ait yeni alan. DİKKAT: `branding_profiles`
  AJANSIN panel teması (beyaz etiket), müşterinin marka rengi değil. İkisini
  karıştırmak, müşterinin rengini panelin rengi yapar.
- **Metin şablonları** (sık CTA cümleleri) ve **zorunlu yasal uyarı**. Uyarı
  tanımlıysa Reklam Oluştur metne ekliyor ve eksikse yayından ÖNCE
  söylüyor, platformun reddinden sonra değil.

**UYGULANDI (2026-09-29, Bölüm 3a + 3b).** Üç ekran Marka Merkezi'nde
"Varlıklar" bölümünde, menüden kalktı. Metin şablonları ve yasal uyarı
Marka sekmesinde; uyarı yayın öncesi kontrolde ENGEL (yalnızca Meta ana
metni; Google'da uyarı olarak söyleniyor). **Marka renkleri kullanıcı
kararıyla EKLENMEDİ:** okuyacak bir özellik yok. **Bölüm 3 tamam.**

## Bölüm sırası

Sıra bağımlılığa göre: her bölüm bir öncekinin verisini kullanıyor.

1. **İskelet + Bağlantılar.** Marka Merkezi sayfası, hazırlık listesi, tek
   atama noktası, sahiplik rozetleri. Menüden kalkan satırlar buraya
   yönleniyor. Veritabanı değişikliği yok.
2. **Marka.** Yapılandırılmış alanlar (migration), tek tuşla doldurma,
   AI asistan ve Reklam Oluştur'un bu alanları okuması.
3. **Varlıklar.** Menü birleşmesi, marka renkleri, metin şablonları, yasal
   uyarı kontrolü.
4. **Kitleler.** Şablonlar, AI önerisi + onay, mevcut kitleleri okuma.
5. **Koruma kuralları.** Önce marka kelimeleri (okuma), sonra negatif liste
   ve yerleşim (yazma, canlı doğrulamayla).
6. **Ölçüm.** Piksel okuma, sonra GA4 (yeni OAuth kapsamı).

BASE bittikten sonra denetimden kalan işler geliyor, çünkü onlar BASE'i
tüketiyor: taslakları yayınlama ekranı (bugün hiçbir ekrandan
yayınlanamıyor), tek reklam sihirbazı, rapor ve kural dilinin sadeleşmesi.

## Verilen kararlar

- **Müşteri, ajansın atadığı hesabı KALDIRABİLİR, ama iz bırakır**
  (kullanıcı, 2026-09-28). Taslak "kaldırabilir" diyor; kod bunu bilerek
  yasaklıyordu (`hesap-sahipligi.ts`, K4: "ajansın atamasını ajans
  değiştirir"). Yeni kural:
  - Müşteri ajansın atamasını DEĞİŞTİREMEZ (başka workspace'e taşıyamaz),
    yalnızca KALDIRABİLİR. Taşımak ve kaldırmak farklı yetkiler.
  - Kaldırma denetim kaydına yazılıyor (kim, ne zaman, hangi hesap) ve
    ajansa bildirim düşüyor. İz bırakmayan bir kaldırmada ajans, hesabın
    neden veri göndermeyi bıraktığını göremez.
  - Kaldırılan hesap ajansın havuzuna dönüyor (K2 aynen geçerli).
  - **UYGULANDI (2026-09-29, Bölüm 1b).** Karar `hesap-sahipligi.ts` (K4
    istisnası, `iz: 'musteri_ajans_kaldirma'`), yazma dar bir BYPASSRLS
    dalında (`connections.service.ts#musteriAjansAtamasiniKaldir`) çünkü satır
    ajansa dönünce şirket onu göremiyor ve Postgres UPDATE'i reddediyor.
    Denetim kaydı aynı transaction'da, ajansa mail commit'ten sonra; mail
    gitmezse kaldırma geri alınmıyor ama başarısızlık kayda geçiyor ve
    yanıtta (`ajansaBildirildi: false`) dönüyor. Panelde "Ajans atadı"
    rozeti ve onayda "ajansına e-posta gider" cümlesi.
    `musteri-ajans-kaldirma-rls.spec.ts` gerçek politikalara karşı koşuyor.
