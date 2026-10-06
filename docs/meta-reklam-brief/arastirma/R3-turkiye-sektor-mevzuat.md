# R3 — Türkiye'de sektör kullanım senaryoları ve reklam mevzuatı

> **Yöntem:** Meta'nın Yardım Merkezi makaleleri (Meta Ads MCP'nin salt okuma `ads_get_help_article`
> aracıyla, makalenin kendi metni; hiçbir reklam hesabına dokunulmadı), Meta Şeffaflık Merkezi reklam
> standartları, Graph API `leadgen_forms` referansı ve depodaki `kaynak/` + `bolumler/` okundu. Türk
> mevzuatı **resmî metinden** okundu: mevzuat.gov.tr konsolide PDF'leri ve Resmî Gazete sayfaları
> indirilip metin çıkarıldı (KVKK, TKHK, 4250, Taşınmaz Ticareti, Turizm Tesisleri, Seyahat Acentaları,
> 2025 sağlık tanıtım yönetmeliği, 2026 ticari reklam değişikliği); konsolide yönetmelik metinlerinin
> ikisi (Ticari Reklam, Ticari İletişim) bir hukuk veritabanının (lexpera) konsolide metninden okundu.
> Sektör verisi We Are Social/Meltwater ve DataReportal; Reklam Kurulu örnekleri AA haberlerinden.
> **Okunan: 60 kaynak açıldı ve okundu, 7 kaynak yalnız arama özetinden** (tabloda işaretli).
> Tarih: 2026-10-06. Araştırmanın ortasında oturumun WebSearch kotası doldu (200/200); sonraki bütün
> doğrulamalar doğrudan resmî metin indirilerek yapıldı, bu yüzden "Türkiye ajans pratiği" tarafı
> resmî kaynaklara göre zayıf.
>
> **Güvenilirlik özeti:** Meta politikası ve mevzuat maddeleri yüksek (birincil metin). Türkiye'ye
> özgü bütçe/maliyet kıyası **bulunamadı** (kamuya açık güvenilir veri yok; uydurulmadı). "Bugün
> Türkiye'de geçerli mi" sorusunun Meta tarafındaki iki cevabı (alt huni veri kısıtı, HOUSING) Meta'nın
> kendi belgesinde ülke düzeyinde **tanımsız ya da Türkiye'yi kapsamıyor** — canlıda ölçülmeli.
>
> **Hukuk notu:** Bu belge hukuki görüş değildir. Her mevzuat bulgusu "metin ne diyor" olarak
> yazıldı; **[HD]** işaretli her yer uygulama/yorum için hukuk danışmanına sorulmalı. Kaynak
> etiketleri: **[Resmî-Meta]**, **[Resmî-diğer]** (mevzuat, resmî kurum), **[Sektör]**, **[Topluluk]**;
> köşeli parantezdeki `K#` sondaki kaynak tablosuna işaret eder.

---

## Özet: yeni modül için ne demek

1. **Yurt içi sağlık hizmeti için Meta'da ücretli reklam, mevzuat metnine göre KAPALI.** 12 Kasım
   2025 tarihli yeni sağlık tanıtım yönetmeliği reklamı yasaklıyor ve sosyal medyaya kaydı yalnız
   "ücretli sponsorlu ve öne çıkmaya yönelik olmamak" şartıyla tanıyor; tek istisnalar açılışı izleyen
   ilk ay ve Bakanlığın kabul ettiği yeni tıbbi yöntemler. Klinik/estetik/obezite müşterisi için
   "Reklam Oluştur" Türkiye hedefinde varsayılan olarak kapalı olmalı. [K45, Resmî-diğer] **[HD]**
2. **Sağlık turizmi (yurt dışı) açık ama dar ve bağlayıcı karar 2 ile ÇELİŞİYOR.** Yönetmelik
   Türkçe dışında, ayrı bir yurt dışı hesabıyla, Türkiye hedeflenmeden ve "otomatik hedef kitle
   tanımlamaları" kapatılarak sponsorlu yayına izin veriyor. "Advantage+ kitle AÇIK" kararı bu modda
   uygulanamaz; kullanıcı istisna kararı vermeden bu niyet açılmamalı. [K45]
3. **HOUSING: Meta'nın zorunlu ülke listesinde Türkiye YOK** (ABD, Kanada ve 49 Avrupa ülke/bölgesi
   sayılıyor). Türkiye'de uygulamak bizim bilinçli kısıtımız (karar 4). Yabancı alıcıya (AB, İngiltere,
   İsviçre, Norveç, Kıbrıs) giden konut reklamında ise Meta'nın kendisi şart koşuyor. Kısa süreli
   kiralık daire konut sayılıyor, otel ve tatil köyü sayılmıyor. [K11, K12, Resmî-Meta]
4. **Emlak aracısının ilanında yetki belgesi numarası zorunlu; fiyatlı konut reklamında brüt ve net
   alan zorunlu.** İlki Taşınmaz Ticareti Yönetmeliği md. 14/2-i (yalnız aracılık eden işletmeler),
   ikincisi Ticari Reklam Yönetmeliği md. 27/5 (herkes). İkisi de makineyle denetlenebilir → giriş
   anında engel. [K47, K43]
5. **Lead formunda KVKK'nın en tehlikeli tuzağı bir API varsayılanı:** Instant Form onay kutusunun
   `is_required` değeri belirtilmezse **`true`**. Yani "isteğe bağlı pazarlama izni" diye kurulan kutu
   sessizce formun ön şartına dönüşüyor; KVKK Kurulu tam bu kalıp için (tanıtım iznini randevunun
   ön şartı yapan sağlık kuruluşu) 300.000 TL ceza verdi. Advetics değeri açıkça `false` yazmalı ve
   geri okumalı. [K29, K39]
6. **Meta'nın yasak form soruları, Türk kliniklerinin ve kursların en sık sorduğu soruları
   kapsıyor:** sağlık durumu/tedavi, sigorta bilgisi (ör. hangi sigortası olduğu), gelir/borç, kimlik numarası,
   **çocuğun doğum tarihi** ve prefill alanını taklit eden özel soru. Form ihlalde hiç yayınlanmıyor.
   Giriş anında engel. [K16]
7. **Sağlık/finans çağrıştıran özel kitle ve özel dönüşüm (`471`) yeni kampanyada kullanılamıyor, ama
   API onları içeren ad set'in kurulmasını ENGELLEMİYOR — nesne hatasız kurulur, teslimat sessizce
   bozulur** (2 Eylül 2025'ten beri; belge coğrafi sınır koymuyor → Türkiye dahil sayılmalı).
   Alt huni olay kısıtı (veri kaynağı kategorisi) ise Meta'ya göre ülkeye özgü ya da küresel olabiliyor
   ve ülke listesi yayımlanmıyor → Türkiye için cevap "bilinmiyor"; ön koşul üç hâlli döner. [K2, K5, K6]
8. **1 Ağustos 2026'dan beri geçerli ticari reklam değişikliği yeni modülün dört kuralını doğrudan
   belirliyor:** indirim öncesi fiyat = son 10 günün en düşük fiyatı (mal); influencer içeriğinde
   "Reklam"/"Tanıtım" ibaresi; insan gibi görünen yapay zekâ karakterlerinin beyanı ve gerçek kişinin
   dijital kopyası yasağı; çocuk olduğu bilinene profillemeyle hedefli reklam yasağı. [K44]
9. **Ajans da sorumlu:** TKHK md. 61/7 reklam veren, **reklam ajansı** ve mecrayı birlikte sayıyor;
   sağlık yönetmeliği reklamın "yaptırılmasını" yasaklıyor ve paylaşanı "aynı derecede sorumlu"
   tutuyor. Uyum denetimi bir kolaylık değil, ajansın (Profaj) korunması; her yayında uyum raporu
   kayda geçmeli. [K48, K45]
10. **Türkiye'de WhatsApp birinci sınıf kanal, Messenger değil:** 16+ internet kullanıcılarında aylık
    kullanım Instagram %89,5, WhatsApp %88,9, Messenger %41 (Ekim 2025). WhatsApp niyeti ilk tura
    girmeli; ikinci turda Messenger yerine Instagram mesajı öncelikli olmalı. Reklamdan açılan WhatsApp
    sohbetinde 72 saat mesajlar ücretsiz. [K54, K32]
11. **Lead verisi 90 gün sonra Meta'dan indirilemiyor ve onay kutusu cevapları `field_data`'da
    gelmiyor:** senkronizasyon bozulursa veri ve rıza kanıtı sessizce kaybolur. Ticari ileti onayı
    3 iş günü içinde İYS'ye kaydedilmezse geçersiz. [K27, K36, K42]
12. **Bütçe için Türkiye'ye özgü güvenilir kamuya açık kıyas yok.** Elde olan kesin kural Meta'nın:
    ad set'in öğrenmeden çıkması için haftada ~50 optimizasyon olayı. Panel bütçeyi bu formülle ve
    Advetics'in kendi havuzundaki sektör medyanıyla "beklenti" olarak göstermeli; rakam uydurmamalı.
    [K33]

---

## Bulgular

### 1. Ortak zemin: Türkiye'de kanal ağırlığı ve Meta'nın kurulum gerçekleri

**Platform kullanımı.** We Are Social/Meltwater'ın Türkiye raporu (veri Ekim 2025; Türkçe çevirisi
BTK'nın Güvenli Web sitesinde): aylık kullanan 16+ internet kullanıcısı oranı Instagram %89,5,
WhatsApp %88,9, YouTube %78, Facebook %68,6, X %58,7, Telegram %53,9, TikTok %48,4, Messenger %41.
Mobil "aktif kullanıcı endeksinde" WhatsApp ilk sırada (100), Messenger 20,4. [K54, Sektör]
Raporlanan reklam erişimi Ekim 2025'te Instagram'da 62,3 milyon, Facebook'ta 34,7 milyon; web
trafiğinin %76,6'sı cep telefonundan. [K54, K55, Sektör — iki rapor aynı rakamları veriyor]
→ Kreatif varsayılanı dikey + kare (Advantage+ yerleşim kararıyla da uyumlu); mesaj niyetinde
WhatsApp ve Instagram önde, Messenger geride.

**WhatsApp'a tıklama (CTWA) — Meta'nın resmî bilgisi.**
- Reklamdan gelen kişi yazınca **72 saatlik ücretsiz pencere** açılıyor (bu sürede her kategoride
  mesaj ücretsiz; reklamın kendisi ücretli). [K32, Resmî-Meta]
- "Mesajla gelen lead sayısını en üst düzeye çıkar" hedefi WhatsApp'ta, son 30 günde en az **10**
  lead/satın alma olayının paylaşılmasını istiyor: sohbetin reklamdan başlamış ve tıklamadan sonraki
  **7 gün içinde** WhatsApp Business uygulamasının hazır etiketleriyle (lead, yeni müşteri, takip;
  sipariş etiketleri) işaretlenmiş olması ya da mesajlaşma için Conversions API. Meta kendi deneyinde
  bu hedefin "sohbet" hedefine göre ortalama %24 daha düşük lead maliyeti verdiğini söylüyor (Meta'nın
  iddiası, garanti değil). [K30, Resmî-Meta]
- Ads Manager'da LEADS amacıyla WhatsApp seçilince varsayılan hedef "sohbet sayısını en üst düzeye
  çıkar" ve kitle/yerleşimde Advantage+ açık geliyor; WhatsApp içi form (WhatsApp Flows) da var.
  [K31, Resmî-Meta]
- Teknik kurulum kuralları (numara sorulmaz, sabit bağlantı, `app_destination`) depoda canlı
  doğrulanmış hâliyle duruyor; bu hat onları tekrar etmiyor. [K36]

**Instant Form (potansiyel müşteri formu) — Meta'nın resmî bilgisi.**
- Üç tür: **daha fazla hacim** (varsayılan), **daha yüksek niyet** (gönderimden önce gözden geçirme
  ekranı + "işletme sizinle iletişime geçebilir" satırı; yalnız mobil Facebook ve Instagram
  akışında gösteriliyor), **zengin kreatif**. [K19]
- **Telefon doğrulaması (OTP):** kod önce WhatsApp'tan, gelmezse SMS'le gidiyor; doğrulamadan form
  gönderilemiyor; uygun reklamverende **varsayılan olarak açık gelebiliyor**; açıkken reklam yalnız
  mobil Facebook/Instagram yerleşimlerine gidiyor; lead sayısını ve maliyetini değiştiriyor; indirilen
  dosyada `phone_number_verified` sütunu var ama CRM entegrasyonunda görünmeyebilir. Türkiye
  hizmet dışı ülke listesinde değil. [K20]
- En fazla 15 soru (bir Meta sayfası "toplam 15 soru", diğeri "15 özel soru" diyor — çelişki; küçük
  okuma esas alınmalı); koşullu cevaplar (CSV ile); randevu (tarih/saat) sorusu; prefill alanları
  arasında WhatsApp numarası, şirket adı, iş e-postası, unvan var. [K21, K22, K24, K25, K29]
- **Yayınlanan form düzenlenemiyor**; çalışan bir forma sonradan özel bildirim eklenemiyor (kopyalanıp
  yenisi kurulmalı). [K18, K21]
- Meta'nın sektör örnek soruları (emlak "gösterim/ziyaret": e-posta, telefon, posta kodu + "ne zaman
  satın almayı düşünüyorsunuz"; B2B: iş e-postası, unvan, şirket + çalışan sayısı, değerlendirme
  zamanı). [K23]

**Bütçe ve beklenti — tek kesin kural.** Bir ad set son büyük düzenlemeden sonraki bir hafta içinde
yaklaşık **50 optimizasyon olayı** alamayacaksa "öğrenme sınırlı" oluyor; Meta'nın önerileri ad
set'leri birleştirmek, kitleyi genişletmek, bütçeyi artırmak ya da daha sık gerçekleşen bir olaya
optimize etmek. [K33, Resmî-Meta] Buradan çıkan kaba alt sınır: **günlük bütçe ≈ 50 × beklenen
sonuç maliyeti / 7 ≈ 7 × sonuç maliyeti** (ad set başına). Türkiye için sektör bazlı güvenilir maliyet
kıyası bulunamadı; Meta'nın asgari günlük bütçe tablosunda da Türkiye yok, değer hesabın
`min_daily_budget` / `minimum_budgets` alanından okunmalı. [K36 (02)]

### 2. Sektör reçeteleri

Niyet numaraları `README.md` §5.3'teki kapalı sözlüğe göre: #1 Form, #2 WhatsApp, #3 Site, #4
Messenger, #5 Instagram mesajı, #7 Arama, #8 Paylaşımı öne çıkar, #9 Siteden satış/kayıt, #10 Erişim.
Tablo, bulgulardan çıkan **önerilen varsayılandır**; Türk ajans pratiğine dair iddialar zayıf
kaynaklı (aşağıda ayrıca işaretli).

| Sektör | Birincil niyet | İkincil | Kreatif | Form soru seti (yasak sorular hariç) | Mevzuat kilidi (ayrıntı §4) |
|---|---|---|---|---|---|
| Konut projesi / emlak | **#1 Form** — yüksek niyet + OTP | #2 WhatsApp; #7 Arama (emlak ofisi) | Dikey video tur (Reels) + kare; daire tipi karuseli; temsili görsel işaretli | Ad soyad, telefon (OTP), e-posta (ops.), daire tipi (koşullu), satın alma zamanı, ofis/şantiye ziyareti randevusu | HOUSING (karar 4); aracıda yetki belgesi; fiyat varsa brüt/net m²; ön ödemeli satışta yapı ruhsatı |
| Özel klinik / estetik / obezite — **yurt içi** | **Kapalı** (ücretli tanıtım yasak) | İstisna modları: açılışın ilk ayı; Bakanlık izinli yeni yöntem | Fiyat/indirim, hasta yorumu, öncesi-sonrası sponsorlu yok | — | 2025 sağlık tanıtım yönetmeliği md. 5, 7 |
| Sağlık turizmi — **yurt dışı** | **#2 WhatsApp** | #1 Form (genel; işlem/teşhis sorusu yok) | Türkçe olmayan dil; HealthTürkiye logosu; belgeli onamlı hasta hikâyesi | Ad, ülke, WhatsApp numarası, uygun arama zamanı | md. 8: TR hedeflenemez, otomatik kitle kapalı, ayrı yurt dışı hesap; GDPR md. 3/2 |
| Otel / konaklama | **#3 Site** (rezervasyon motoru); ölçüm hazırsa **#9** | #2 WhatsApp rezervasyon; #1 Form (grup, düğün, toplantı) | Reels oda/tesis; erken rezervasyon kampanyası kurallı | (Grup formu) ad, telefon, tarih aralığı, kişi sayısı | Belge türü/sınıfı; alkol yok; fiyat vergiler dahil; hizmette indirim = bir önceki fiyat |
| E-ticaret (giyim vb.) | **#9 Siteden satış** (Advantage+ satış) | #3 Site (ölçüm yoksa, uyarıyla); #8 | Çok sayıda farklı kreatif; UGC/Reels; karusel | — | İndirim: son 10 gün en düşük fiyat; fiyat vergiler dahil; influencer etiketi; çerez rızası |
| Yapı malzemesi / B2B üretici | **#1 Form** — yüksek niyet | #3 Site (teknik katalog); LinkedIn ile birlikte | Uygulama videosu, referans proje karuseli | İş e-postası, şirket, unvan (prefill) + proje türü, ihtiyaç zamanı, tahmini miktar | Teknik/performans iddiasının kanıtı; KVKK (iş kişisi de kişisel veri); İYS'de tacir istisnası |
| Yerel hizmet işletmesi | **#7 Arama** / **#2 WhatsApp** | #10 Erişim (yarıçap); #8 | Kısa dikey video; fiyat vergiler dahil | (Gerekirse) ad, telefon, hizmet, ilçe | Sağlık-komşu meslek → sağlık kuralları; güzellik merkezinde medikal işlem iddiası |
| Eğitim (MEB kurumu) | **#1 Form** — veliye, OTP | #2 WhatsApp | Kurum/kadro tanıtımı; öğrenci fotoğrafı/adı/başarısı yok; MEB karekodu | Veli adı, telefon, çocuğun sınıf düzeyi, program, arama zamanı (**çocuk doğum tarihi yasak**) | 18 yaş altı hedeflenemez; MEB ek md. 4; bursluluk sınavı valilik izni |

Sektör notları:

- **Konut / emlak.** Meta'nın emlak için verdiği form örneği iletişim + "ne zaman satın almayı
  düşünüyorsunuz" sorusu [K23]. HOUSING açıkken yaş 18–65+ sabit, cinsiyet yok, benzer kitle yok,
  konum hariç tutma yok, yarıçap alt sınırlı; Advantage+ kitle ve ayrıntılı hedefleme genişletmesi
  serbest [K36 (03, 07)]. Yüksek bedelli üründe haftada 50 lead çoğu bütçede gerçekçi değil →
  tek ad set, "öğrenme sınırlı" durumunu kullanıcıya önceden söylemek (§1). Türk ajans yazıları emlakta
  form + video tur + karusel öneriyor [K67, Topluluk — arama özeti, zayıf].
- **Sağlık.** Ayrıntı §3.2 ve §4.4. Meta tarafında sağlık standartları ayrıca: kilo verme ürünü ve
  estetik işlem reklamı 18+; diyabeti "tedavi eden/ortadan kaldıran" iddiası yasak (diyabet Meta'nın
  kapalı listesinde; belirti yönetimi iddiası hariç) — metabolik/obezite cerrahisi metinlerinde sık
  görülen kalıp; süre vaadi açıklamasız yasak [K8, K9]. Yurt dışı hedefte AB/İngiltere'de
  sağlık veri kaynağı kısıtı beklenmeli → site dönüşümü yerine platform içi form/WhatsApp (§3.2).
- **Otel.** Meta'ya göre otel ve tatil köyü konut reklamı değil; **kısa süreli kiralık daire/konut
  ilanı ise konut** [K11]. Meta Türkiye'de alkol reklamına hiç izin vermiyor [K13]; "her şey dahil"
  görselinde içki → Türkiye hedefinde ret riski ve 4250 md. 6 (§4.6).
- **E-ticaret.** Meta: Advantage+ satış kampanyası, kitle + yerleşim + bütçe Advantage+ olduğunda en
  gelişmiş optimizasyonu açıyor; çeşitli kreatif ve birinci taraf veri (CAPI) öneriliyor; Meta'nın
  kendi testinde dönüşüm başına maliyette ortalama %9 iyileşme (Meta'nın iddiası) [K34]. Reklam Kurulu
  Mart 2025'te hazır giyimde şişirilmiş fiyattan "sahte indirim" için 8 dosyada 4,8 milyon TL ceza
  verdi [K58].
- **B2B.** Meta'nın B2B için önerdiği olay seti (nitelikli lead, teklif istendi/gönderildi, kayıp vb.
  özel olaylar, `lead_score`, `fb_lead_id`) CRM'den kaliteye optimize etmenin yolu [K35]. Meta'nın
  "B2B'ye özel finansal ürün" finans özel kategorisine girmiyor (konu dışı ama sınıflandırmada önemli)
  [K12].
- **Eğitim.** 18 yaş altı içeren kitlede Meta lead, sohbet ve açılış sayfası optimizasyonunu
  kapatıyor; cinsiyet, ayrıntılı hedefleme, her tür özel/benzer kitle kullanılamıyor [K15]. Türk
  hukukunda da 2026'dan beri çocuğa profillemeyle hedefli reklam yasak [K44] → veliyi hedefle (18+).

### 3. Meta politikası

#### 3.1. Özel reklam kategorisi — konut (HOUSING) ve Türkiye

- Meta'nın Yardım Merkezi: konut reklamında kategori seçmek **ABD'de reklamverense** ya da **hedef
  kitle ABD, Kanada veya Avrupa'nın belirli bölgelerindeyse** gerekiyor; seçilmezse reklam
  reddedilebiliyor. Listelenen bölgeler: Andorra, Avusturya, Azorlar, Belçika, Bulgaristan, Kanarya
  Adaları, Manş Adaları (Guernsey, Jersey), Hırvatistan, **Kıbrıs**, Çekya, Danimarka, Estonya,
  Finlandiya, Fransa, Fransız Guyanası, Almanya, Yunanistan, Guadeloupe, Macaristan, İzlanda, İrlanda,
  Man Adası, İtalya, Letonya, Lihtenştayn, Litvanya, Lüksemburg, Madeira, Malta, Martinik, Mayotte,
  Monako, Hollanda, Norveç, Polonya, Portekiz, Réunion, Romanya, Saint-Martin, San Marino, Slovakya,
  Slovenya, İspanya, İsveç, İsviçre, Birleşik Krallık, İngiliz üsleri (Kıbrıs), Vatikan. **Türkiye
  listede yok.** [K11, K12, Resmî-Meta]
  - Depodaki brief "Türkiye'nin Avrupa'ya dahil olup olmadığı belgede belirsiz" diyordu [K36 (03, 07)];
    Yardım Merkezi'nin bu listesi belirsizliği kapatıyor: Türkiye Meta'nın zorunlu kapsamında değil.
    Karar 4 (Türkiye'de de uygula) geçerli, ama artık "Meta istiyor" değil "biz kısıtlıyoruz" diye
    gerekçelendirilmeli. Türkiye kodu ile kurulan HOUSING'de Meta'nın hangi kısıtı fiilen uyguladığı
    yine canlıda ölçülmeli (Açık sorular 1).
- **Konut reklamı nedir (Meta):** satılık, kiralık ya da **geçici** konut ilanları; konut sigortası;
  konut kredisi dahil finansman; ekspertiz; emlak ve ev arama hizmetleri; toplayıcı siteler. **Değil:**
  otel, tatil köyü, inziva yerleri, ev alma ipuçları. [K11]
- Finans kategorisi (FINANCIAL_PRODUCTS_SERVICES) 21 Ocak 2025'ten beri ABD için zorunlu; kredi alt
  kümesi ABD/Kanada/Avrupa listesinde. Finans reklamveren doğrulaması isteyen ülkeler: Avustralya,
  Hong Kong, Hindistan, İrlanda, İsrail, İspanya, Tayvan, Tayland, İngiltere, ABD — **Türkiye yok.**
  [K12, K14, Resmî-Meta]
- Not: Bugünkü koddaki `special-category.schema.ts` hâlâ `CREDIT` değerini taşıyor; Meta onu
  `FINANCIAL_PRODUCTS_SERVICES` ile değiştirdi [K36 (03)]. Yeni modülün kapalı sözlüğü (README §6.4)
  zaten doğru değeri kullanıyor.

#### 3.2. Sağlık ve wellness: 2025 veri kısıtları — bugün Türkiye'de geçerli mi?

Üç ayrı mekanizma var ve "geçerli mi" cevabı her birinde farklı:

| Mekanizma | Ne yapıyor | Kapsam | Türkiye için cevap |
|---|---|---|---|
| **Özel kitle / benzer kitle işareti (`operation_status = 471`)** | Sağlık durumu ya da finansal durum çağrıştıran kitle (ad, açıklama, kural) yeni kampanyada kullanılamıyor | Belgede coğrafi sınır yok; 2 Eylül 2025'ten beri | **Geçerli sayılmalı** (küresel okunuyor) [K5, K6] |
| **Özel dönüşüm işareti** | Sağlık/finans çağrıştıran özel dönüşüm düzenlenemiyor; kullanan ad set'te sorun kaydı | Aynı | **Geçerli sayılmalı** [K6] |
| **Veri kaynağı kategorisi** (sağlık ve wellness, finans…) | Core Setup (özel parametre ve alan adından sonraki URL kısmı kesilir), **orta ve alt huni standart olaylarının kısıtlanması**, tam kısıt | Meta: ülkeye/bölgeye özgü **ya da** küresel olabilir; ülke listesi yayımlanmıyor | **Bilinmiyor** — veri kaynağı başına Events Manager'da ve Meta'nın e-posta bildiriminde görünüyor [K1, K2] |

- **Sessiz hata (1):** İşaretli kitle/dönüşüm içeren ad set'in **oluşturulması ve düzenlenmesi
  engellenmiyor**; teslimat ve performans etkileniyor, `issues_info` her işaretli öğe için bir
  "SOFT_ERROR" satırı taşıyor (`2460003` kitle engellendi, `2460004` özel dönüşüm engellendi). Panel
  `issues_info`'yu okumazsa reklam "yayında" görünüp harcamaz. [K6, Resmî-Meta]
- **Sessiz hata (2):** Kısıtlı veri kaynağında **özel olaylar inceleyip onaylanana kadar otomatik
  engelleniyor**; Core Setup'ta URL parametresi ve yol kesildiği için o kurallara dayanan site
  kitleleri dolmuyor ya da güncellenmiyor. [K2, K4]
- **Sınıflandırmayı Meta da yapıyor ve Meta'nın atadığı kategori reklamverence değiştirilemiyor**
  (yalnız yeniden inceleme istenebiliyor). [K1]
- **Yasaklı bilgi tanımı geniş:** hastalıklar, tıbbi işlemler ve tedaviler, beden ölçüleri, sağlık
  durumunu belli eden tedavi yeri konumu dahil; olay/dönüşüm/kitle **adları ve kuralları** da bunu ima edemez;
  UTM parametreleri de yasaklı bilgi taşıyabilir diye özellikle anılıyor. [K3]
- Sektör yazıları alt huni kısıtının Ocak 2025'te ABD, AB ve İngiltere'de başladığını yazıyor
  [K62, K63, Sektör — arama özeti]; Meta'nın kendi metni ülke vermiyor. Çelişki değil ama boşluk:
  Türkiye'deki bir sağlık/wellness sitesinin kategorisi tek tek bakılmadan bilinemez.
- **Advetics için anlamı:** (a) yurt içi klinikte ücretli reklam zaten mevzuatla kapalı (§4.4) → bu
  kısıt asıl olarak **wellness e-ticareti** (takviye, spor, kozmetik) ve **sağlık turizminin AB/İngiltere
  hedefi** için önemli; (b) sağlık turizminde site dönüşümüne optimize etmek varsayılan olmamalı,
  platform içi form ya da WhatsApp tercih edilmeli; (c) "ölçüm hazır" ön koşulu (README §5.4-4) bu
  kategori için "bilinmiyor" dönebilmeli.

#### 3.3. Kişisel nitelik ima eden metin yasağı

- Meta reklam standardı (güncelleme 26 Haziran 2024): reklam kişinin ya da ailesinin kişisel
  niteliğini **sormaz, bildiğini ima etmez**; tıbbi bilgi, finansal durum, yaş, din, cinsel yönelim vb.
  "Sen/senin" dili nitelikle birleşince yasak; nitelik içermeyen "sen" dili serbest. Meta'nın
  örneklerinde okuyucuya diyabeti olup olmadığını soran cümle yasak, yeni bir diyabet tedavisini
  duyuran cümle serbest. [K7, Resmî-Meta]
- Türkçe karşılıkları (bu hattın örnekleri, Meta'nın değil): "Kilo mu vermek istiyorsun?",
  "Fazla kilolarından kurtul", "Saçların mı dökülüyor?", "Borçların mı var?", "Kredi notun düşük mü?"
  → ret riski. Serbest biçim: hizmeti/ürünü anlatan, okuyucuya nitelik yüklemeyen cümle.
- Ayrıca sağlık standardı: fiziksel görünüm hakkında aşağılayıcı ifade, yağ tutan el yakın çekimi,
  sonucun yalnız giyilebilir bir ürünle alınacağı iddiası yasak. [K8, K9]

#### 3.4. Önce/sonra görselleri, estetik içerik, çıplaklık

- Meta sağlık standardı **22 Temmuz 2026'da güncellendi**. Resmî metin 18+ hedeflemede genel
  kozmetik ürün, işlem ve ameliyatların **önce/sonra dönüşümünü gösterebileceğini** söylüyor ve izinli
  işlemleri sayıyor (meme büyütme/küçültme, karın germe, burun, göz kapağı, yüz germe, saç ekimi,
  dolgu, enjeksiyon, kimyasal soyma, lazer…). Kilo verme ürünlerinde kullanımın etkisi ve sonuca kadar
  geçen süre gösterilebiliyor ama önce/sonra ifadesi açıkça yalnız kozmetik için geçiyor.
  [K8, K9, Resmî-Meta]
- **Çelişki:** Sektör yazıları kilo verme ürünlerinde ve yaşlanma karşıtı tedavilerde önce/sonranın
  yasak kaldığını yazıyor [K64, Topluluk — arama özeti]. Resmî metin kozmetiği açıkça serbest
  bırakıyor, kiloyu açıkça serbest bırakmıyor → **kilo/obezite için yasak say** (tahmin etmektense
  kısıtla).
- Çıplaklık politikası ayrıca: kasık, kalça, kadın göğsü gibi **tek bir vücut bölgesine odaklanan
  görüntü** ve dijital örtüyle kapatılmış çıplaklık yasak [K10] → meme/karın estetiği görsellerinin çoğu
  Meta'da bu yüzden reddedilebilir.
- **Türk hukuku Meta'dan sıkı:** yurt içi sağlık tanıtımında önce/sonra ancak aynı ortam/teknik
  koşul, tarih, kaynak ve hasta onamıyla; paylaşılan görsel **sponsorlu yayınlatılamaz** (§4.4). Yani
  Meta'nın 2026 gevşemesi Türkiye hedefli klinik reklamında kullanılamaz.

#### 3.5. Lead formu politikaları ve veri

- **Gizlilik politikası bağlantısı lead reklamı için zorunlu** (Yardım Merkezi); bağlantı **PDF, görsel
  ya da doğrudan indirme olamaz**. [K17] API referansı `privacy_policy`'yi zorunlu işaretlemiyor → iki
  resmî kaynak ayrışıyor; Advetics girişte zorunlu tutmalı. [K29]
- **Özel bildirim (custom disclaimer):** başlık + metin + isteğe bağlı onay kutuları; birden çok kutu;
  her kutu "isteğe bağlı" işaretlenebiliyor; özel bildirim **eklenince form gönderimi kabule
  bağlanıyor**; karakter sınırı yok. API'de kutu alanları: `is_required` (**varsayılan true**),
  `is_checked_by_default` (varsayılan false), `text`, `key`. [K18, K21, K29]
- **Yasak sorular** (reklam standardının parçası; ihlalde lead reklamı yayınlanmıyor): hesap
  numaraları; sabıka; finansal bilgi (kart, banka, kredi notu, net servet, **gelir**, iflas, **borç**);
  devletin verdiği kimlik numaraları (pasaport, ehliyet vb.; TC kimlik numarası bu sınıfa girer);
  **sağlık bilgisi** (kişinin ya da ailesinin geçmiş/şimdiki rahatsızlığı, **tıbbi tedaviler**, ilaç yan
  etkisi, engellilik);
  **sigorta bilgisi**; siyasi görüş; ırk/etnik köken; din/felsefe; cinsel yönelim/yaşam; sendika;
  kullanıcı adı/parola; **çocuğun doğum tarihi**; **prefill alanıyla aynı ya da çok benzer özel soru**.
  [K16, Resmî-Meta]
- **Veri sorumluluğu:** Meta, lead reklamında (GDPR çerçevesinde) **Meta'nın ve reklamverenin ikisinin
  de veri sorumlusu** olduğunu yazıyor; lead verisi Meta'nın farklı coğrafyalardaki veri merkezlerinde
  tutuluyor; Meta veriyi kendi veri politikasına göre (örneğin gelecekteki formları önceden doldurmak
  için) kullanabiliyor. [K26, Resmî-Meta] → KVKK aydınlatmasında yer almalı **[HD]** (§4.1).
- **90 gün:** lead verisi gönderimden itibaren 90 gün indirilebiliyor, sonra kalıcı olarak
  indirilemiyor; Ads Manager'daki sayı ile indirilen sayı bu yüzden ayrışabiliyor. Lead erişim
  yetkileri özelleştirilmişse sayfa yöneticisi bile indiremiyor. Meta konum hedeflemesinin kesin
  olmadığını, hedef dışından az sayıda gösterim/lead gelebileceğini ayrıca yazıyor. [K27, K28]
- **Onay kutusu cevapları** lead okumasında `field_data` içinde değil, ayrı `custom_disclaimer_responses`
  alanında geliyor. [K36 (06)]

#### 3.6. Gençler, alkol, finans, şans oyunları

- **18 yaş altı içeren kitle (dünya geneli):** cinsiyet, şehirden küçük konum (yarıçap, iğne),
  ayrıntılı hedefleme, dil, her tür özel ve benzer kitle kapalı; Advantage+ katalog kapalı; **lead,
  sohbet, açılış sayfası görüntüleme** optimizasyonları kapalı; AB/AEA/İsviçre'de 18 altına hiç
  teslim yok (Kasım 2023'ten beri). [K15, Resmî-Meta]
- **Alkol:** Meta'nın standardı (26 Haziran 2024) Türkiye'yi alkol reklamının **hiç yayınlanamadığı**
  ülkeler arasında sayıyor. [K13]
- **Finans:** Türkiye'de Meta'nın finans doğrulaması ve finans özel kategorisi zorunluluğu yok (§3.1);
  Türk hukukunda kredi reklamı aylık ve yıllık maliyet oranını gösterir (§4.3).
- **Şans oyunları:** Meta'da ayrı özel kategori ve yazılı izin rejimi var [K36 (03)]; ajansın müşteri
  tiplerinde yok, bu hatta Türk mevzuatı doğrulanmadı (kapsam dışı bırakıldı).

### 4. Türk mevzuatı (resmî metinden)

#### 4.1. KVKK — lead formu, aydınlatma, açık rıza, yurt dışına aktarım

**Metin ne diyor:**
- **Açık rıza** belirli bir konuya ilişkin, bilgilendirmeye dayanan ve özgür iradeyle açıklanan rıza
  (md. 3/1-a). Kişisel veri açık rıza olmadan işlenemez; ancak sözleşmenin kurulması/ifası, hukuki
  yükümlülük, meşru menfaat gibi şartlardan biri varsa açık rıza aranmaz (md. 5). [K37]
- **Sağlık verisi özel nitelikli** (md. 6/1); 2024 değişikliğiyle işleme şartları md. 6/3'te sayılı
  (açık rıza; sır saklama yükümlülüğü altındakilerin teşhis/tedavi amaçlı işlemesi vb.). Reklam/
  pazarlama amacı bu listede ayrıca sayılmıyor. [K37]
- **Aydınlatma (md. 10):** veri sorumlusunun kimliği, işleme amacı, kimlere ve hangi amaçla
  aktarılabileceği, toplama yöntemi ve **hukuki sebep**, md. 11'deki haklar. [K37] Aydınlatma
  Tebliği md. 5: açık rızaya dayalı işlemde aydınlatma ile açık rıza alma **ayrı ayrı** yapılır;
  hukuki sebep belirtilir; eksik, yanıltıcı, yanlış bilgi verilemez. [K38, Resmî-diğer, 2018 — eski
  olabilir, yürürlükte]
- **Yurt dışına aktarım (md. 9, 7499 sayılı Kanunla 2024'te değişti):** sırayla (1) md. 5/6
  şartlarından biri + yeterlilik kararı; (2) yoksa uygun güvencelerden biri — **Kurul'un ilan ettiği
  standart sözleşme** (imzadan itibaren **5 iş günü** içinde Kurum'a bildirilir), bağlayıcı şirket
  kuralları, Kurul izinli taahhütname; (3) ikisi de yoksa **yalnız "arızi"** aktarımda istisnalar —
  biri, riskler anlatılarak alınan açık rıza. [K37] Standart sözleşmeyi bildirmemenin ayrı bir idari
  para cezası var (md. 18/1-d; tutarlar yıllık yeniden değerlenir). [K37] Usul yönetmeliği RG
  10.07.2024'te yayımlandı; Kurum standart sözleşmelerde dikkat edilecek hususlara dair ayrıca duyuru
  yaptı. [K41, K66, arama özeti]
- **Kurul kararları:**
  - 2023/692 (02.05.2023): özel sağlık kuruluşu, sitesinde randevuyu tanıtım iletisi iznine
    bağlamıştı (kutu işaretlenmeden "ileri" çalışmıyordu) → açık rıza hizmetin ön şartı yapılamaz;
    "okudum, onaylıyorum" diyen aydınlatma kutusu aydınlatma ile rızayı karıştırıyor; **300.000 TL**
    ceza + ayrı açık rıza metni talimatı. [K39, Resmî-diğer, 2023 — eski olabilir, ilke güncel]
  - 2023/787 (11.05.2023): hastane, hastalarının görüntü ve sağlık bilgisini reklamda kullanmak için
    açık rıza formu almıştı → **sektör mevzuatının yasakladığı işleme açık rıza meşruluk
    kazandırmaz**; ölçülülük ihlali; **250.000 TL** ceza + verilerin silinmesi. [K40, Resmî-diğer]

**Instant Form'da nasıl karşılanır (öneri; her satır [HD]):**
1. **Gizlilik politikası bağlantısı** = müşterinin KVKK aydınlatma metni sayfası (HTML; PDF değil —
   Meta reddediyor). [K17]
2. **Aydınlatma özeti** formun giriş/bağlam alanında ya da özel bildirimin metninde, "bilgilendirme"
   diliyle; "onaylıyorum" kelimesi aydınlatma metnine bağlanmaz (2023/692). Meta özel bildirimi
   gönderimi kabule bağladığı için aydınlatmanın özel bildirime konması bu karışıklığı doğurabilir →
   canlıda nasıl göründüğü ölçülmeli (Açık sorular 6). [K18, K39]
3. **Pazarlama izni (ticari elektronik ileti) ayrı bir kutu, `is_required: false` açıkça**, önceden
   işaretsiz. Kutunun metni hangi kanal(lar) olduğunu söyler (SMS, e-posta, arama, WhatsApp). [K29, K42]
4. **Sağlık verisi formda sorulmaz** (Meta yasaklıyor; KVKK'da özel nitelikli; 2023/787) → teşhis,
   işlem, kilo, BMI, ilaç, sigorta yok. [K16, K40]
5. **Yurt dışına aktarım:** Form verisi doğrudan Meta'nın yurt dışı sunucularına giriyor ve Meta
   kendini ayrı veri sorumlusu sayıyor [K26]. Bu akışın KVKK md. 9'da kimin aktarımı sayılacağı, hangi
   güvenceye dayanacağı ve Meta'nın KVKK standart sözleşmesi sunup sunmadığı bu araştırmada
   **bulunamadı** → **[HD]**. Not: 2024 öncesi yaygın "yurt dışına aktarıma açık rıza veriyorum" kutusu,
   yeni md. 9'da yalnız **arızi** aktarımın dayanağı; düzenli lead akışına tek başına yetmeyebilir. [K37]
6. **Advetics'in kendi rolü:** Lead'ler Advetics'te saklanacaksa Profaj/Advetics müşteri adına veri
   işleyen olur; sunucu yurt dışındaysa ikinci bir md. 9 aktarımı doğar; yapay zekâ katmanına (yurt
   dışı model sağlayıcısı) lead kişisel verisi gönderilirse üçüncüsü. **[HD]** (Açık sorular 10, 16)

#### 4.2. Ticari elektronik ileti ve İYS (lead'i aramak, WhatsApp'tan yazmak)

**Metin ne diyor** (Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik, konsolide):
- Ticari elektronik ileti; telefon, çağrı merkezi, faks, otomatik arama, akıllı ses kaydedici,
  e-posta, kısa mesaj "gibi vasıtalarla" ticari amaçla gönderilen veri, ses, görüntü. [K42]
- Onaysız gönderilebilenler: alıcı iletişim bilgisini kendisi vermişse **temin edilen** mal/hizmetin
  değişiklik, kullanım ve bakımına ilişkin iletiler; tacir ve esnafa (ret hakkı saklı); bazı
  bilgilendirmeler — ve bunlarda mal/hizmet özendirilemez (md. 6). [K42]
- Onay yazılı ya da elektronik alınır; **İYS dışında alınan onay 3 iş günü içinde İYS'ye kaydedilir,
  kaydedilmeyen onay geçersiz**; ret talebi 3 iş günü içinde uygulanır; ileti gönderecek gerçek/tüzel
  kişiler İYS'ye kaydolur. [K42, Resmî-diğer — konsolide metin, hukuk veritabanı]
- Sağlıkta ayrıca: kişilerin bilgi ve rızası olmadan telefonla arama, SMS, e-posta, sosyal medya
  mesajıyla tanıtım yapılamaz (2025 yön. md. 5/1-k). [K45]

**Yorum gerektiren boşluk [HD]:** Form dolduran kişiyi talebiyle ilgili **bir kez** geri aramak
"temin edilen mal/hizmet" istisnasına girmiyor (henüz alım yok); ama kişinin kendi talebine cevap
olduğu için ticari elektronik ileti sayılıp sayılmayacağı yoruma açık. Sonraki kampanya
iletileri (SMS, WhatsApp şablon mesajı) için onay + İYS kaydı metnin açık şartı. WhatsApp'ın
"gibi vasıtalar" kapsamında olduğu metinde adıyla yazmıyor.

#### 4.3. TKHK ve Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği

**Kanun (6502):**
- Ticari reklam doğru ve dürüst olur; tüketiciyi aldatan, hastaları/yaşlıları/çocukları istismar
  eden reklam yapılamaz; **örtülü reklam yasak**; karşılaştırmalı reklam yapılabilir; reklam veren
  iddiasını ispatla yükümlü; **reklam verenler, reklam ajansları ve mecra kuruluşları bu kurallara
  uymakla yükümlü** (md. 61). [K48]
- Yaptırım: durdurma, aynı yöntemle düzeltme, idari para cezası, 3 aya kadar tedbiren durdurma;
  internetteki aykırılıkta içerik çıkarma/erişim engeli. Kanundaki internet bandı 600 bin–6 milyon TL
  (2024 değişikliği) ve tutarlar her yıl yeniden değerleniyor; 2026 için ~1,08–10,84 milyon TL
  aktarılıyor [K48; 2026 tutarı K65, Topluluk — arama özeti, resmî duyuruyla doğrulanmadı].
- Ön ödemeli konut: **yapı ruhsatı alınmadan tüketiciyle ön ödemeli konut satış sözleşmesi
  yapılamaz** (md. 40/3). [K48] Reklamın kendisine dair ayrı bir hüküm Ön Ödemeli Konut Satışları
  Yönetmeliği'nde (2014) bulunamadı. **[HD]**: ruhsatsız projede "satışa başladık" reklamı.

**Yönetmelik (konsolide metin; madde numaraları resmî metinle bir kez daha karşılaştırılmalı):** [K43]
- Doğruluk ve ispat: iddialar ispatlanır; kıyas/üstünlük iddiaları üniversite ya da akredite/bağımsız
  kuruluş raporuyla desteklenir (md. 7, 9). "En", "tek", "lider" için ayrı bir madde yok; genel
  doğruluk ve ispat kuralına giriyor.
- Karşılaştırmalı reklam aynı ihtiyacı karşılayan rakiplerle ve nesnel verilerle (md. 8).
- **Fiyat:** tüm vergiler dahil toplam satış fiyatı; taksitte toplam fiyat, taksit sayısı ve tutarı;
  koşullu fiyatta koşullar açık (md. 13).
- **Sağlık meslek mensubu:** reklamda doktor, diş hekimi, veteriner, eczacı ya da sağlık kuruluşunun
  bir ürüne sağlık beyanında bulunduğu izlenimi veren görüntü/beyan olamaz (md. 16/3).
- **Kredi reklamı:** kredinin toplam maliyetinin aylık ve yıllık yüzde değeri (md. 25/2).
- **Konut:** konut ya da tatil amaçlı taşınmaz reklamında fiyat varsa bağımsız bölümün **brüt ve
  net alanı** da gösterilir (md. 27/5).
- **Örtülü reklam** tanımı ve yasağı (md. 4, 22).

**2026 değişikliği** (RG 01.07.2026 sayı 33297, **yürürlük 01.08.2026**): [K44, Resmî-diğer]
- **İndirim:** indirim öncesi fiyat, malda **indirimden önceki 10 gün içinde uygulanan en düşük
  fiyat**; çabuk bozulan mal ve hizmette indirimden bir önceki fiyat; çok kanallı satışta yalnız
  indirimin yapıldığı kanalın fiyatı (md. 14/3, 14/5). (Önceki dönemde 30 gündü [K61, Sektör].)
- **Sosyal medya etkileyicisi (md. 23/A):** reklam açık, anlaşılır, ayırt edilebilir; **"Reklam" ya da
  "Tanıtım" ifadesi zorunlu**; arka plandan ayırt edilebilir, ekranı kaydırmadan görülür, bir yazı ya
  da simgeyle örtüşmez, **her paylaşımda** yer alır. (2021 tarihli Reklam Kurulu kılavuzu artık
  yönetmelik maddesi.)
- **Yapay zekâ (md. 18/8):** tüketicinin ekonomik davranışını önemli ölçüde etkileyecek biçimde yapay
  zekâ kullanılması ya da **insandan ayırt edilemeyen dijital karakter** kullanılması açık ve ayırt
  edilebilir biçimde belirtilir. Gerçek bir kişinin yapay zekâ ile üretilmiş dijital kopyasının ürünü
  kullanmış/önermiş gibi gösterildiği reklam yasak (md. 27/12).
- **Hedefli reklam (md. 25/A):** kriterlerin ve nasıl değiştirileceğinin tüketiciye doğrudan ve kolay
  erişilebilir biçimde sunulması şartıyla yapılabilir; **tüketicinin çocuk olduğu biliniyorsa ya da
  makul olarak bilinmesi gerekiyorsa profillemeyle hedefli reklam yapılamaz**. [HD]: Meta'nın "bu
  reklamı neden görüyorum" ekranının md. 25/A-2'yi karşılayıp karşılamadığı.
- **Yasak ürünler (md. 27/11):** beşeri tıbbi ürün, e-sigara, tütün, **alkollü içki** reklamı yapılamaz.
  Takviye edici gıda normal beslenmenin yerine geçiyormuş gibi gösterilemez (md. 27/10).

#### 4.4. Sağlık hizmetlerinde reklam yasağı — 2025 yönetmeliği

**Yürürlükteki metin:** Sağlık Hizmetlerinde Tanıtım ve Bilgilendirme Faaliyetleri Hakkında
Yönetmelik, RG 12.11.2025 sayı 33075, yayımında yürürlüğe girdi ve 29.07.2023 tarihli aynı adlı
yönetmeliği kaldırdı. 2026 içinde değişiklik bulunamadı (resmî kaynakta arama, 2026-10-06). Kapsam:
sağlık meslek mensupları (1219 ek md. 13'teki meslekler dahil), özel sağlık kuruluşları, uluslararası
sağlık turizmi aracı kuruluşları. [K45, Resmî-diğer]

**"Tanıtım" ile "reklam" ayrımı (md. 4):**
- **Reklam:** ürünü, hizmeti, kişiyi ya da kurumu ön plana çıkaran ve tanıtım-bilgilendirme sınırını
  aşan her türlü faaliyet.
- **Tanıtım ve bilgilendirme:** kurum için adres, iletişim, çalışma gün/saatleri, hasta kabul edilen
  uzmanlık dalları, çalışanların unvanları ve sağlığı koruyucu-geliştirici bilgi; hekim için ana/yan
  dal uzmanlığı, akademik unvan, hasta kabul zamanı/yeri ve aynı türden bilgi.

**Temel ilkeler (md. 5) — Meta reklamını doğrudan ilgilendirenler:**
- Örtülü ya da açık reklam yapılması **ve yaptırılması** yasak; tanıtım ilkelere uyularak yapılabilir.
- 1219'daki ana/yan dal dışında sertifikaya dayalı uzmanlık unvanı kullanılamaz.
- Hasta/yakın teşekkür ve memnuniyet ifadesi üzerinden reklam niteliğinde paylaşım yok; hastayı
  doğrudan ya da dolaylı yönlendiren içerik yok; üstünlük algısı yok; firma/ürün/marka tanıtımı ve
  bağlantı verme yok.
- **Md. 5/1-i:** sağlık tesisleri ve meslek mensupları, **ücretli sponsorlu ve öne çıkmaya yönelik
  olmamak şartıyla** sosyal medya platformlarında ya da arama motorlarında kayıt yaptırabilir.
- **Md. 5/1-j (istisna):** sağlık tesisleri, **açılış tarihini izleyen ilk bir ay** tüm platformlarda
  yönetmeliğe uygun **sponsorlu** tanıtım yapabilir; Bakanlıkça tıbben kabul edilen yeni tıp teknolojisi
  ve yöntemleri için de bu bent kapsamında izin verilebilir.
- Rıza olmadan arama/SMS/e-posta/sosyal medya mesajıyla tanıtım yok (md. 5/1-k); özendirme, çekiliş,
  hediye yok (5/1-l); **ücret, indirim, kampanya, promosyon bilgisi yok** (5/1-m).
- Kural ihlal eden içeriği **paylaşanlar da aynı derecede sorumlu** (md. 5/2).

**Görsel içerik (md. 7):** sağlığı koruyucu-geliştirici görsel kullanılabilir; hasta görseli için
Ek-1 onam formuyla açık rıza; hasta önceden görür ve her an geri çeker; izin karşılığı ödeme/indirim/
hediye yok; sonradan düzeltme/filtre yok; **önce-sonra aynı ortam ve teknik koşulda, işlem ve çekim
tarihi yazılı**; görselin kime ait/alıntı olduğu yazılı; ameliyat esnası görüntü yok; mahrem bölge
yok; paylaşımlar **yorum, beğeni ve yeniden paylaşıma kapalı**; görseli tesis/hekim kendisi paylaşır;
**paylaşılan görsel içerikler sponsorlu ya da ücret verilerek yayınlatılamaz** (md. 7/1-j); yurt içi
görselde iki cümlelik uyarı zorunlu — "Her cerrahi veya girişimsel işlemde sonuçlar kişiden kişiye
değişiklik gösterebilir." ve "İşlem öncesinde hekiminizden detaylı görüş almanız önerilir." (md. 7/1-k).

**Uluslararası sağlık turizmi (md. 8)** — Bakanlık yetki belgeli tesis ve aracı kuruluşlar için:
- Yurt dışına yönelik **ayrı** sosyal medya hesabı/site, sağlık turizmi hizmeti verildiği açıkça
  beyan edilerek, **Türkçe hariç** resmî dillerde sponsorlu tanıtım yapılabilir.
- Yetki belgesi sitede/hesapta yayımlanır; **"HealthTürkiye" logosu** tüm mecralarda kullanılır.
- **Türkiye'de yaşayanlarda talep yaratmak yasak; sosyal medyada hedef kitle olarak yurt içi
  seçilemez ve otomatik hedef kitle tanımlamalarının devre dışı bırakılması zorunlu.**
- Yurt dışı hesapta, açık rıza belgelenerek hasta hikâyesi/yorumu paylaşılabilir; Türkiye'de izni
  olmayan işlem tanıtılamaz; **indirim, kampanya ve rekabetçi fiyat duyurusu bu kapsamda serbest**
  (md. 8/3); geri kalan hükümler (md. 7 dahil) burada da uygulanır (md. 8/4).

**Yaptırım (md. 12):** tesis ve aracı kuruluşa 3359 ek md. 11/5'e dayanan Ek-2 formundaki idari
yaptırımlar; hekime 1219 md. 27/44; yetkisiz sağlık hizmeti tanıtımında Reklam Kurulu bildirimi ve suç
duyurusu; KVKK ihlalinde md. 17-18. [K45] (2023 yönetmeliğinde tesis için iki uyarı + 3 gün faaliyet
durdurma, sağlık turizminde 1–3 ay durdurma kademesi vardı [K46]; 2025 metni yaptırımı Ek-2 forma
taşıdı — formun içeriği bu turda okunmadı.)

**Yorum gerektirenler [HD]:** (a) Md. 5/1-i'nin yurt içi her türlü Meta reklamını (yalnız metinli,
yalnız adres/branş bilgisi veren reklam dahil) kapattığı okuması; (b) açılış ayında sponsorlu
tanıtımda görsel kullanımının md. 7/1-j ile nasıl bağdaştığı; (c) md. 8/1-c'deki "otomatik hedef kitle
tanımlamaları"nın Meta'da hangi ayarlara karşılık geldiği (Advantage+ kitle, özel kitle/benzer kitle
genişletmesi, ayrıntılı hedefleme genişletmesi); (d) Meta'nın konum hedeflemesinin kesin olmaması
[K28] karşısında "yurt içi seçilemez" şartının nasıl belgeleneceği; (e) diyetisyen, psikolog,
fizyoterapist gibi meslek mensuplarının kendi reklamları.

#### 4.5. Emlak ve konut

**Taşınmaz Ticareti Hakkında Yönetmelik** (konsolide; son değişiklik RG 01.10.2026): [K47, Resmî-diğer]
- Kapsam **aracılık:** "taşınmaz ticareti" alım, satım, **pazarlama** ve kiralamaya aracılık faaliyeti
  (md. 4/1-k). Kendi projesini doğrudan satan geliştirici bu tanımda değil; projeyi pazarlayan aracı
  şirket ve emlak ofisi tanımda. **[HD]**: geliştiricinin satış ofisi ve "pazarlama" ortaklığı.
- **İlan kuralları (md. 14/2):** ilanlarda **yetki belgesi numarası, yetki belgesindeki işletme adı/
  unvanı, adres hariç il-ilçe-mahalle-ada-parsel, md. 15/3'teki diğer bilgiler, iletişim bilgisi ve
  varsa enerji kimlik bilgisi** "kolay okunabilir şekilde" (i); yetkilendirme sözleşmesine aykırı ilan
  yok (ı); yetkisi olmayan taşınmaz için ilan yok (j); satış/kiralama/fesih halinde **3 gün içinde**
  ilan faaliyeti biter (h).
- İnternette ilan veren işletmeler bu bentlere ve yanıltmama kuralına uyar (md. 12/1); ilan platformu
  yükümlülükleri (sahiplik doğrulaması vb.) Meta'ya değil ilan sitelerine yönelik (md. 12/2) **[HD]**;
  2025 eki: internet ilanında genel ekonomik verilerle uyumsuz, haklı sebebe dayanmayan fiyat artışı
  yapılamaz (md. 12/3).
- Md. 15/3: yetkilendirme sözleşmesinde imar/iskan durumu, tapu, büyüklük, yaş, kat/cephe/manzara,
  toplu taşıma ve sosyal mekânlara mesafe, oda/banyo sayısı gibi bilgiler.
- Konu dışı ama yeni: konut satışında güvenli ödeme sistemi; 1 Aralık 2026'ya kadar zorunlu değil.
- **Ticari Reklam Yönetmeliği md. 27/5:** fiyatlı konut/tatil konutu reklamında brüt + net alan (§4.3).
- **Kredi/faiz kampanyası** ("%0 faiz, 24 ay vade") md. 25'e girer; Reklam Kurulu sıfır faiz
  reklamında gizlenen peşin faizi ve eksik maliyet oranını cezalandırdı (otomotiv, Mart 2025) [K58].
- "Temsili görsel", "metroya 5 dakika" gibi iddialar için ayrı madde yok; genel doğruluk/ispat (md. 7)
  ve yetkilendirme sözleşmesindeki mesafe bilgisi. **[HD]**

#### 4.6. Turizm, otel ve alkol

- **Turizm tesisi tanıtımı:** Bakanlıktan alınan belgeye uygun yapılır; belgedeki isim ve tür esas
  alınır; yanıltıcı tanıtım yok; **belgelendirildiği sınıfın dışında algı yaratan yıldız çağrışımlı
  simge** kullanılamaz; "yıldız" sınıflandırma terimi Bakanlığa ait (Turizm Tesislerinin
  Niteliklerine İlişkin Yönetmelik md. 4, 16/2). [K50, Resmî-diğer, 2019 — eski olabilir, yürürlükte]
- **Seyahat acentası:** online satış kanalının ilk açılış sayfasında **işletme belgesi numarası ve
  unvan**, diğer sayfaların altında; 26.07.2024'ten beri pazarlama ve satışta konaklama tesislerinin ve
  turizm amaçlı kiralanan konutların **belge numaralarına** Bakanlık veri tabanından doğrulanarak yer
  verilir; belgesiz tesis/konut pazarlanamaz (Seyahat Acentaları Yönetmeliği md. 17/3). [K51]
- **Alkol:** 4250 sayılı Kanun md. 6 — alkollü içkilerin **her ne surette olursa olsun reklamı ve
  tüketiciye yönelik tanıtımı** yapılamaz; özendiren kampanya/promosyon yok; **11.06.2026 değişikliği
  (7584)** üretici/ithalatçı/pazarlayanın her tür mecradaki yayın ve paylaşıma marka/logoyla destek
  olmasını da kapsıyor. [K49] Ticari Reklam Yönetmeliği md. 27/11 aynı yasağı tekrarlıyor [K44];
  Meta da Türkiye'de alkol reklamını kabul etmiyor [K13]. **[HD]**: otel reklamında "her şey dahil"
  içinde içki görseli/ifadesi.
- Fiyat vergiler dahil (md. 13); hizmet indiriminde indirimden bir önceki fiyat (md. 14/3). [K43, K44]

#### 4.7. Eğitim

- **MEB Özel Öğretim Kurumları Yönetmeliği (ek md. 4):** reklam/ilanlarda **öğrenci resimleri, isimleri
  ve başarı durum bilgileri kullanılamaz**; reklam, ilan ve her türlü tanıtıcı faaliyette **kurumu
  tanıtan bilgilerin bulunduğu karekod** yer alır. Kurum tabela/reklam/ilanlarında yalnız kurum açma
  izni ve ruhsattaki adı/kısaltmasını kullanır (md. 4'e ek fıkra). Bursluluk sınavı Ocak–Mart, valilik
  izniyle; reklamı ek md. 4 çerçevesinde. [K52, Resmî-diğer, 2025 derlemesi]
- Çocuk: 18 altı hedefleme Meta'da kısıtlı (§3.6) ve Türk hukukunda profillemeyle yasak (§4.3);
  Meta formda **çocuğun doğum tarihini** sormayı yasaklıyor (§3.5).

#### 4.8. Reklam Kurulu kararlarından örnekler (internet/sosyal medya)

| Tarih (haber) | Sektör / uygulama | Sonuç | Kaynak |
|---|---|---|---|
| 20.01.2025 | 10 bankanın "yeşil konut/taşıt kredisi" reklamı: çevre vurgusu, gizlenen gerçek koşul | Durdurma | [K56] |
| 21.02.2025 | E-ticarette doğrulanmamış yorumların (Google vb.) yayımlanması; abonelik iptalinde karanlık tasarım; bankada "size özel" kampanya | 30,2 milyon TL toplam | [K57] |
| 22.03.2025 | **Hazır giyim:** şişirilmiş fiyattan sahte indirim (8 dosya, 4,8 milyon TL); "%0 faiz"le peşin faizi gizleme | 32,5 milyon TL toplam | [K58] |
| 18.05.2025 | E-ticaret arayüz manipülasyonu, sahte değerlendirme/indirme sayısı; "ücretsiz deneme"de kart zorunluluğu | 125,3 milyon TL (5 ay) | [K59] |
| 22.07.2026 | Bilimsel olmayan saç ürünü iddiası; vize hizmetinde "%100 garanti"; dini duyguların istismarı | 185 milyon TL (7 ay), 3 aya kadar tedbiren durdurma | [K60] |

[Sektör — haber; Bakanlık açıklamalarına dayanıyor.] Sağlık sektörü için Kurul uygulamasına dair
birincil karar metni bu turda okunamadı (Bakanlık sitesindeki karar sayfası hata verdi); KVKK 2023/787
kararı, Reklam Kurulu'nun 2019/2602 sayılı kararına atıfla hasta hikâyesi ve tedavi sonucu kullanımının
yasak reklam olduğunu aktarıyor [K40].

### 5. Bu hattın sessiz hata listesi

| # | Sessiz davranış | Sonuç | Kaynak |
|---|---|---|---|
| 1 | İşaretli (471) kitle / özel dönüşüm ile ad set kurulumu engellenmiyor | "Yayında" görünür, teslimat bozuk; yalnız `issues_info` söyler | K6 |
| 2 | Kısıtlı veri kaynağında özel olaylar incelenene kadar otomatik engelli; Core Setup URL'yi kesiyor | Dönüşüm kampanyası olaysız kalır, site kitlesi dolmaz | K2, K4 |
| 3 | Form onay kutusu `is_required` varsayılanı `true` | İsteğe bağlı rıza zorunlu olur → KVKK ihlali (2023/692 kalıbı) | K29, K39 |
| 4 | OTP "uygun reklamverende" varsayılan açık gelebiliyor | Lead sayısı düşer, teslimat yalnız mobil FB/IG'ye daralır | K20 |
| 5 | Lead 90 gün sonra indirilemiyor | Senkron kırılırsa veri kalıcı kaybolur | K27 |
| 6 | Onay kutusu cevapları `field_data`'da yok | Rıza kanıtı ve İYS kaydı kaybolur | K36 (06) |
| 7 | HOUSING'de `special_ad_category_country` verilmezse vergi ülkesine düşüyor | Yabancı alıcı hedefinde yanlış kısıt seti | K36 (03, 07) |
| 8 | Yayınlanan form düzenlenemiyor, çalışan forma özel bildirim eklenemiyor | Yanlış kurulan form ancak yenisiyle düzelir | K18, K21 |
| 9 | Kitlede 18 altı varsa lead/sohbet/açılış sayfası optimizasyonları yok | Eğitimde form/WhatsApp niyeti çalışmaz | K15 |
| 10 | Konum hedeflemesi kesin değil | Sağlık turizminde "yurt içi seçilmedi" ama yurt içine az da olsa gösterim | K28 |
| 11 | Lead erişim yetkisi özelleştirilmişse sayfa yöneticisi bile indiremiyor | "Lead yok" ile "göremiyorum" karışır | K28 |
| 12 | WhatsApp'ta lead optimizasyonu etiket şartı (10 olay / 30 gün, 7 gün içinde etiket) | Etiketlenmezse hedef hiç açılmaz, sebebi görünmez | K30 |

---

## Advetics için tasarım önerileri

Her öneri bağlayıcı kararlarla uyumlu yazıldı; çeliştiği tek yer (sağlık turizmi × karar 2) açıkça
işaretli. Parantezdeki § bu belgenin bulgu bölümünü gösterir.

### A. "Uyum profili" — sektör serbest metin değil, kapalı sözlük (Marka Merkezi)

- Bugün `ClientProfile.sektor` serbest metin; kural süremez (kod tabanının kendi ilkesi: serbest metni
  makine kullanamaz). Yeni modül workspace başına **kapalı bir uyum sektörü** ister: `KONUT_GELISTIRICI`,
  `EMLAK_ARACI`, `SAGLIK_KURULUSU`, `SAGLIK_MESLEK_MENSUBU`, `SAGLIK_TURIZMI`, `OTEL_KONAKLAMA`,
  `KISA_SURELI_KIRALIK`, `SEYAHAT_ACENTASI`, `ETICARET`, `B2B_URETICI`, `YEREL_HIZMET`, `EGITIM_MEB`,
  `EGITIM_DIGER`, `DIGER`. Bir workspace birden çok seçebilir (otel + seyahat acentası). (§2, §4)
- Profil, kanıt alanlarını taşır: belge türü ve numarası (yetki belgesi, turizm belgesi + sınıf,
  seyahat acentası işletme belgesi, sağlık turizmi yetki belgesi, MEB kurum açma izni adı, sağlık
  tesisi ruhsatı + açılış tarihi), KVKK aydınlatma URL'si, veri sorumlusu unvanı, İYS kaydı var mı,
  "son doğrulama tarihi". Boş kanıt = ilgili niyet kapalı + sebebi yazılı (`emptyReason` deseni).
- Profilden **türeyen** kararlar (kullanıcıya sorulmaz): özel kategori (konut → HOUSING, karar 4),
  açık niyet satırları, zorunlu ibareler, kapalı özellikler. Mevcut "kategori müşterinin özelliği,
  kampanyanın değil" ilkesi (bugünkü `special-category.schema.ts` yorumu) aynen korunur.

### B. Uyum denetçisi — tek saf fonksiyon, kapalı kural kataloğu

- `uyumDenetle(taslak, profil) → Bulgu[]`; her bulgu: `kural`, `seviye` (`ENGEL` | `UYARI` | `BILGI`),
  `alan` (hangi giriş alanının yanında görünecek), `mesaj` (Türkçe, sade), `dayanak` (mevzuat/Meta
  maddesi + tarih), `hukukGorusu` (`gerekli` | `alindi`), `durum` (`gecti` | `kaldi` | `bilinmiyor`).
- **Aynı fonksiyon üç yerde koşar:** alan bırakıldığında (giriş anında), "Meta'ya göster" provasında,
  "Yayınla"da. Panel, AI asistanı ve onay kartı aynı listeyi gösterir (README §7.6).
- **ENGEL** kullanıcı arayüzünden geçilemez (müşteri admini de ajans da). Kural yanlışsa katalog
  güncellenir — "tahmin etmektense kısıtla". **UYARI** açık onay ister; onaylayan, zaman ve uyarının
  metni yayın kaydına yazılır (TKHK md. 61/7 ajans sorumluluğu; §4.3). **BİLGI** yalnız gösterilir.
- Katalog `packages/shared`'da; her kuralın `yururlukTarihi` ve `sonKontrol` alanı var. Bu belgede
  2025-11-12 sağlık yönetmeliği, 2026-08-01 ticari reklam değişikliği, 2026-06-11 alkol değişikliği
  gibi tarihli maddeler var → üç ayda bir gözden geçirme hatırlatıcısı.
- Denetçi yalnız kural kataloğunu bilir; Meta'nın provası (`validate_only`, README §5.6) ayrı adımdır.
  İkisi birbirinin yerine geçmez: Meta Türk mevzuatını denetlemez, Advetics Meta'nın politika
  incelemesini taklit edemez.

### C. Sektör seçilince açılan zorunlu alanlar ve engel/uyarı listesi

**Tüm sektörler**

| Kontrol | Ne zaman | Seviye | Dayanak |
|---|---|---|---|
| Hedef kitle en düşük yaşı 18 (Advantage+ açıkken de en düşük yaş kesin kalıyor) | Hedefleme | ENGEL | K15, K36 (03), K44 md. 25/A-3 |
| Ana metinde kişisel nitelik kalıbı ("…mısın?", "…ın mı var?" + sağlık/finans/görünüm sözcüğü) | Metin yazılırken | UYARI (+ AI ile yeniden yazım önerisi) | K7 |
| "En", "tek", "lider", "garanti", "%100" iddiası | Metin | UYARI: kanıt belgesi yükle ya da ifadeyi değiştir | K43 md. 7, 9 |
| Fiyat var, "vergiler dahil" değil / taksitte toplam yok | Metin | UYARI | K43 md. 13 |
| Yapılandırılmış "indirim" alanı kullanıldıysa önceki fiyat + başlangıç/bitiş zorunlu; serbest metinde "%… indirim" | Metin/alan | Alanda ENGEL, serbest metinde UYARI | K44 md. 14 |
| Kreatifte insan benzeri yapay zekâ karakteri / yapay zekâ ile üretim → hem Meta `self_ai_disclosure` hem görünür beyan metni | Kreatif | Beyan yoksa ENGEL | K44 md. 18/8; README §6.5 |
| Gerçek bir kişinin yapay zekâ dijital kopyası | Kreatif (beyan) | ENGEL | K44 md. 27/12 |
| Ortaklık/influencer reklamı (ilk turda kapalı) açılırsa "Reklam"/"Tanıtım" ibaresi | Kreatif | ENGEL | K44 md. 23/A |
| Özel kitle / özel dönüşüm / olay adında sağlık-finans sözcüğü | Kitle/olay oluşturma | ENGEL (Meta oluşturmayı engellemiyor) | K3, K5, K6 |
| UTM şablonunda kampanya/işlem adı yerine nötr kimlik (sağlık/finans profillerinde) | Derleyici | Varsayılan | K3 |
| Görselde/metinde alkollü içki (Türkiye hedefi) | Kreatif beyanı | ENGEL | K13, K49 |

**Lead formu (her sektör)**

| Kontrol | Seviye | Dayanak |
|---|---|---|
| Gizlilik/aydınlatma URL'si var, HTML (PDF/görsel/indirme değil) | ENGEL | K17 |
| `locale: TR_TR` açıkça yazılır (belgede varsayılan yok) | Varsayılan | K29 |
| Pazarlama izni kutusu: `is_required: false`, `is_checked_by_default: false` açıkça; geri okunur | ENGEL (yazılmazsa yayın yok) | K29, K39 |
| Aydınlatma metni "onaylıyorum" diliyle yazılmaz; açık rıza ayrı kutu | ENGEL (şablon dışı metinde UYARI) | K38, K39 |
| Yasak soru sınıfları (sağlık, sigorta, gelir/borç, kimlik no, çocuk doğum tarihi, din, siyaset…) — özel soru metni sözlükle taranır | ENGEL | K16 |
| Prefill alanını taklit eden özel soru ("Telefon numaranız?") | ENGEL — prefill kullanılır | K16 |
| En fazla 15 soru (prefill dahil toplam — iki Meta sayfası ayrışıyor, dar okuma) | ENGEL | K21, K24 |
| OTP ve "yüksek niyet" açıkça yazılır (Meta varsayılanı değil, sektör varsayılanı) | Varsayılan + BİLGI ("yalnız mobil FB/IG") | K19, K20 |

**Sektöre özel**

| Sektör | Zorunlu alan / kontrol | Seviye | Dayanak |
|---|---|---|---|
| Konut geliştirici, emlak aracı, kısa süreli kiralık | HOUSING + `special_ad_category_country` = hedeflenen bütün ülkeler (TR dahil) | ENGEL (otomatik uygulanır) | Karar 4; K11; K36 |
| Aynı | HOUSING kısıtları (yaş 18–65+, cinsiyet yok, benzer kitle yok, konum hariç tutma yok, yarıçap ≥ 17 km) derleyicide | ENGEL | K36 (03, 07); README §5.5 |
| Emlak aracı | Yetki belgesi no + yetki belgesindeki işletme adı → ana metinde var mı | ENGEL (tek tıkla ekle) | K47 md. 14/2-i |
| Emlak aracı (ilan bazlı reklam) | İl/ilçe/mahalle/ada/parsel, iletişim, varsa enerji kimlik belgesi | UYARI (metin sınırı nedeniyle görselde/açılışta olabilir) **[HD]** | K47 md. 14/2-i |
| Konut, tatil konutu | Metinde fiyat kalıbı (TL, ₺, "…'den başlayan") varsa brüt **ve** net m² | ENGEL (metin düzeltilerek aşılır) | K43 md. 27/5 |
| Konut (ön ödemeli) | Satış tipi "ön ödemeli/projeden" seçilirse yapı ruhsatı tarih/no profilde | ENGEL (kayıt amaçlı) **[HD]** reklamda yazma şartı bulunamadı | K48 md. 40/3 |
| Konut | "%0 faiz", "vade", "kredi" → aylık + yıllık maliyet oranı | UYARI | K43 md. 25; K58 |
| Konut | "Temsili görsel" işareti beyanı | UYARI **[HD]** | K43 md. 7 |
| Sağlık kurumu / meslek mensubu (yurt içi) | Türkiye hedefli ücretli kampanya | **ENGEL**, yalnız iki mod açılabilir: "Açılış ayı" (metinde yalnız **sağlık tesisleri** için; açılış tarihi ≤ 1 ay; ad set `end_time` açılış + 1 ayı geçemez; meslek mensubunun kendi adına **[HD]**) ve "Bakanlık izinli yeni yöntem" (izin belgesi) | K45 md. 5/1-i, 5/1-j |
| Aynı, açık modlarda | Fiyat/indirim/kampanya yok; hasta teşekkürü yok; üstünlük yok; sertifikaya dayalı unvan yok | ENGEL (sözlük) + UYARI (yorum) | K45 md. 5 |
| Aynı, hasta görseli | Ek-1 onam beyanı; çekim/işlem tarihi; uyarı cümlesi görselde; yorumlar kapalı; **sponsorlu görsel ayrıca [HD]** | ENGEL (beyan) | K45 md. 7 |
| Sağlık turizmi | Yetki belgesi no; hesap "yurt dışı" işaretli; metin Türkçe değil (Türkçe karakter/sözcük tespiti); `excluded_geo_locations` TR; HealthTürkiye logosu beyanı | ENGEL | K45 md. 8 |
| Sağlık turizmi | Otomatik hedef kitle kapalı → `advantage_audience: 0`, genişletmeler kapalı | **Karar 2 ile çelişki — kullanıcı istisna kararı verene kadar niyet KAPALI** | K45 md. 8/1-c, d |
| Sağlık (her mod) | Formda işlem/teşhis/sigorta sorusu | ENGEL | K16, K40 |
| Sağlık (her mod) | "Tedavi eder" (diyabet vb. listedeki hastalıklar), süre vaadi | ENGEL / UYARI | K8, K9 |
| Wellness e-ticareti (takviye, spor, kozmetik) | Veri kaynağı kategorisi: kullanıcı Events Manager'da gördüğünü işaretler; işaretlenmeden "ölçüm hazır" **bilinmiyor** | UYARI | K1, K2 |
| Otel / konaklama | Turizm belgesi türü + sınıfı; yıldız ifadesi belgeyle uyumlu | UYARI | K50 md. 16/2 |
| Seyahat acentası, kısa süreli kiralık | Acenta işletme belgesi no açılış sayfasında; tesis/konut belge no | UYARI | K51 md. 17/3 |
| E-ticaret | Site pikselinin çerez rızasıyla çalıştığı beyanı | UYARI **[HD]** (KVKK çerez rehberi bu turda okunmadı) | K37 |
| B2B | Teknik/performans iddiasına belge | UYARI | K43 md. 7, 9 |
| Yerel hizmet | Profilde "sağlık meslek mensubu" seçildiyse (1219 ek md. 13 meslekleri; listenin kapsamı **[HD]**) sağlık kuralları uygulanır | ENGEL | K45 md. 2, 4/1-f |
| Yerel hizmet (güzellik merkezi) | Medikal işlem sözcüğü (botoks, dolgu, mezoterapi…) → yetkisiz sağlık hizmeti tanıtımı riski; gri alanlar (ör. lazer) | Medikal sözlükte ENGEL, gri alanda UYARI **[HD]** | K45 md. 12/1-d |
| Eğitim (MEB) | Kurum açma izni adı; karekod görseli; öğrenci fotoğrafı/adı/başarısı yok beyanı; bursluluk sınavında valilik izni | ENGEL (beyan) | K52 |

### D. Lead formu kurucusu (KVKK + Meta)

- **Form bir taslak nesnesi**, Meta'ya yayın onayında gider (README §5.1). Yayınlanınca değişmez
  [K21] → Advetics formları **sürümlü** tutar; düzeltme = yeni sürüm + eski formun arşivi (silme yok).
- **Şablonlar sektör profilinden üretilir** (§2 tablosu): soru seti, form türü, OTP, koşullu cevaplar.
  Kullanıcı soru ekleyebilir; her özel soru yasak-soru sözlüğünden geçer (giriş anında).
- **Aydınlatma bloğu** profilden doldurulur (veri sorumlusu, amaç, hukuki sebep alanı **boş bırakılmaz,
  tahmin edilmez** — müşterinin hukuk birimi seçer, Meta'nın ayrı veri sorumlusu olduğu ve yurt dışı
  sunucu bilgisi, md. 11 hakları, başvuru yolu). Metin "bilgilendirme" dilinde, onay fiili yok.
- **Geri okuma** (README §5.8 tablosuna ek satır): formun `privacy_policy`, `locale`, `questions`,
  `custom_disclaimer.checkboxes[].is_required` ve OTP ayarı gönderilenle karşılaştırılır; fark varsa
  yayın durur.
- **Lead alımı:** webhook + günlük çekim; çekimde `custom_disclaimer_responses` **açıkça** istenir;
  her lead için rıza kanıtı (form sürümü, kutu metninin özeti, zaman, `phone_number_verified`) saklanır.
  Son çekimin üzerinden 7 gün geçerse uyarı, 80. günde kırmızı alarm (90 gün sınırı) [K27].
- **İYS kuyruğu:** pazarlama izni verilen lead'ler müşteri adına İYS'ye aktarılmak üzere listelenir;
  3 iş günü sayacı ekranda [K42]. Advetics İYS'ye doğrudan yazmıyorsa bunu açıkça söyler.
- **Yapay zekâ katmanı lead kişisel verisini hiç görmez** (araç şeması lead alanlarını döndürmez):
  hem KVKK md. 9 hem özel nitelikli veri riski. [K37]

### E. Sağlık akışı (yurt içi + turizm)

- Sağlık profili seçili workspace'te "Reklam Oluştur" niyet kartları yerine **sebep ekranı** açılır:
  "Türkiye'de sağlık tesisleri için sponsorlu tanıtım yönetmelikle sınırlı (12.11.2025)" + açılabilecek
  iki mod + organik tanıtım için içerik kontrol listesi (md. 4/ğ'deki izinli bilgiler). [K45]
- "Açılış ayı" modu (yalnız sağlık tesisi profilinde; metin istisnayı tesislere tanıyor): açılış tarihi
  profilden; ad set bitişi açılış + 1 ay ile sınırlı ve **geri okunur**; metin sözlüğü fiyat/indirim/
  kampanya/teşekkür/üstünlük kalıplarını ENGEL'e çevirir.
- "Sağlık turizmi" modu: yalnız profilde yetki belgesi ve yurt dışı hesap varsa; dil Türkçe değilse;
  TR hariç tutulmuşsa; **ve kullanıcı karar 2 için istisna onayı vermişse** (onaya kadar kapalı).
  `targetingsentencelines` ile "Türkiye" geçmediği doğrulanır (README §5.6). Optimizasyon varsayılanı
  platform içi (form/WhatsApp); site dönüşümü AB/İngiltere'de sağlık veri kaynağı kısıtı nedeniyle
  önerilmez [K2, K62]. GDPR uyarısı (AB'deki kişilere hizmet sunan Türk tesisi GDPR kapsamına
  girebilir — md. 3/2) **[HD]** [K53].
- AI asistanı sağlık profilinde Türkiye hedefli reklam **önermez**; kullanıcı isterse sebep ekranının
  aynısını sohbet içinde gösterir.

### F. Konut / emlak akışı

- Konut profili → HOUSING kampanyada her zaman yazılır; `special_ad_category_country` hedeflenen
  bütün ülkeler (TR + yabancı alıcı ülkeleri) → geri okunur (README §2). Panel cümlesi: "Konut
  reklamlarında yaş ve cinsiyet seçilemez; bu Advetics'in Türkiye için de uyguladığı kural.
  Avrupa ve İngiltere'ye giden reklamlarda Meta'nın da kuralı."
- **"Satışı kim yapıyor?"** tek sorusu (geliştirici / emlak işletmesi / pazarlama şirketi) → aracıysa
  yetki belgesi zorunlu, ibare ana metne tek tıkla eklenir ve yayından önce varlığı denetlenir.
- Fiyat yazılırsa brüt/net m² alanları açılır (ENGEL); "ön ödemeli satış" seçilirse yapı ruhsatı alanı.
- Önerilen varsayılan reçete: #1 Form (yüksek niyet + OTP) + dikey video + daire tipi karuseli;
  bütçe ekranında "bu tutarla haftada ~N form; öğrenme için ~50 gerekir" beklenti satırı (§1, K33).

### G. Mesaj niyetleri (WhatsApp önce)

- İlk tur (README §8-14) önerisi bu bulguyla netleşiyor: **Form, WhatsApp, Site, Paylaşımı öne çıkar**
  kesin; ikinci turda **Instagram mesajı (#5) Messenger'dan (#4) önce** — Türkiye'de Messenger aylık
  kullanımı %41, Instagram %89,5 [K54].
- WhatsApp niyetinde panel, "mesajla lead" optimizasyonunun açılması için sohbetlerin 7 gün içinde
  WhatsApp Business'ın hazır etiketleriyle işaretlenmesi gerektiğini söyler ve son 30 gündeki etiketli
  olay sayısını (okunabiliyorsa) gösterir; okunamıyorsa "bilinmiyor" [K30].
- Karşılama mesajı Türkçe ve kısa bir aydınlatma bağlantısı içerir (WhatsApp Flow kullanılırsa onay
  kutusu grubu flow'da) **[HD]**; kampanya iletisi gönderimi için ayrı onay + İYS (§4.2).

### H. AI asistanı kuralları (karar 3 ile)

- AI kreatif üretirken uyum denetçisini **kendi çıktısına** uygular; kişisel nitelik, tedavi iddiası,
  fiyat/indirim (sağlık), alkol, üstünlük kalıplarını üretmez; ürettiğinde denetçi yakalar.
- Onay kartı uyum raporunu taşır: ENGEL varsa kart "Yayınla" yerine sebebi gösterir; UYARI'lar tek
  tek kullanıcı onayı ister. AI bir uyarıyı kullanıcı adına onaylayamaz.
- AI hukuki soruya "metin şunu söylüyor" + madde + "hukuki görüş değildir" ile cevap verir; [HD]
  işaretli kurallarda karar vermez.

### I. Kayıt ve mevzuat güncelliği

- Yayın kaydına (README §5.2 "Kanıt") eklenir: uyum raporunun anlık görüntüsü, kural kataloğu sürümü,
  UYARI onayları (kim, ne zaman, hangi metin), profil kanıtlarının o anki değerleri.
- Kural kataloğu her kuralın kaynağını ve tarihini taşır; tarihli bir kural (ör. 1 Aralık 2026'da
  zorunlu olacak konut ödeme sistemi gibi) yaklaştığında ajans yöneticisine bildirim.

### J. Bütçe ve beklenti

- Bütçe ekranı **tutarı önermez** (README §6.5: AI bütçe tahmin etmez); beklentiyi gösterir:
  "Bu sektörde Advetics havuzundaki benzer hesapların son 90 gün medyan form maliyeti X TL (n hesap);
  bu bütçeyle haftada ~N sonuç; öğrenme için ~50/hafta gerekir." Havuz verisi yoksa satır "bilinmiyor"
  der, rakam uydurmaz. [K33]
- Medyan, workspace'lerin uyum sektörüyle (§A) hesaplanır; tek bir müşteriyi teşhis edecek kadar
  küçük kümelerde (ör. n < 5) gösterilmez.

---

## Açık sorular ve doğrulanması gerekenler

**Canlıda ölçülecek (README §9 canlı turuna eklenecek):**
1. `special_ad_categories=["HOUSING"]` + `special_ad_category_country=["TR"]` ile `PAUSED` ad set:
   yaş 25–45 ve 5 km yarıçapla hata mı (`2909035`), sessiz düzeltme mi, kabul mü? Meta'nın listesinde
   Türkiye yok [K11]; TR'de kısıtların fiilen uygulanıp uygulanmadığı bilinmiyor.
2. Instant Form: `custom_disclaimer` kutusunu `is_required` göndermeden kur → geri oku (varsayılan
   gerçekten `true` mu); `false` ile kur → formda kutu isteğe bağlı mı görünüyor?
3. `privacy_policy` göndermeden form oluşturma: API kabul ediyor mu, reklam incelemesi mi reddediyor?
4. OTP ve "yüksek niyet": API'de hangi alanlar, Meta'nın "varsayılan açık" davranışı API'de de var mı?
5. Bir sağlık turizmi senaryosunda `advantage_audience: 0` + `excluded_geo_locations` TR +
   `targeting_relaxation_types` kapalı → geri okumada hangi otomasyon alanları hâlâ açık
   (`targeting_optimization_types`)? (Brief 03 Özet 5: bazı hedeflerde genişleme zorunlu.)
6. Özel bildirimli formun telefonda nasıl göründüğü: kullanıcı "kabul" düğmesine mi basıyor? (KVKK
   2023/692'deki "okudum-onaylıyorum" karışıklığı riski.)
7. Lead okumada `custom_disclaimer_responses` ve `phone_number_verified` gerçekten geliyor mu
   (API ve CRM yolu ayrı ayrı)?
8. Bir wellness e-ticaret sitesinin veri kaynağı kategorisi ve kısıtı API'den okunabiliyor mu (Meta
   Ads MCP'nin dataset araçları dahil), yoksa yalnız Events Manager'da mı?

**Kullanıcıya sorulacak (ürün kararı):**
9. **Sağlık turizmi × karar 2:** Yönetmelik otomatik hedef kitlenin kapatılmasını istiyor; bu modda
   Advantage+ kitle istisnası onaylanıyor mu? Onaylanmazsa niyet kapalı kalır.
10. Advetics lead kişisel verisini saklayacak mı (yoksa yalnız CRM'e aktarıp sayısını mı tutacak)?
    Saklayacaksa: sunucunun ülkesi (yurt dışındaysa KVKK md. 9), saklama süresi, müşteriyle veri işleme
    sözleşmesi şablonu.
11. İYS: Advetics müşteri adına İYS'ye onay yazacak mı, yoksa liste mi verecek?
12. Konut profili "kurumsal marka reklamı" (proje ilanı değil) için de HOUSING uygulansın mı? Öneri:
    evet (kısıtla), ama bu bilinçli bir seçim.
13. Devre mülk/devre tatil satan müşteri konut sayılsın mı? Meta'nın listesinde açık değil [K11].
14. Sektör medyanı (§J) için havuz verisinin ajans içi kullanımı müşterilere bildirilecek mi?

**Hukuk danışmanına [HD]:**
15. 2025 sağlık yönetmeliği md. 5/1-i'nin yurt içi her türlü ücretli Meta reklamını kapattığı okuması;
    açılış ayında görsel kullanımı (md. 5/1-j ile 7/1-j); diyetisyen/psikolog gibi meslek mensupları.
16. Instant Form verisinin KVKK md. 9 bakımından niteliği (kişi veriyi Meta'ya kendisi giriyor, Meta
    kendini ayrı veri sorumlusu sayıyor); dayanak (standart sözleşme / arızi istisna); Meta'nın KVKK
    standart sözleşmesi sunup sunmadığı (bu araştırmada bulunamadı).
17. Formla gelen kişiyi talebine dair bir kez aramak / WhatsApp'tan yazmak ticari elektronik ileti mi;
    WhatsApp'ın yönetmelikteki "gibi vasıtalar" kapsamı.
18. Lead formundaki hukuki sebep seçimi (md. 5/2-c sözleşme öncesi / 5/2-f meşru menfaat / açık rıza).
19. Ticari Reklam Yönetmeliği md. 25/A-2 (hedefleme kriterlerinin tüketiciye sunulması) Meta'nın kendi
    "neden görüyorum" ekranıyla karşılanıyor mu; yükümlülük reklamverende mi?
20. Taşınmaz Ticareti md. 14/2-i bilgilerinin sosyal medya reklamında nereye yazılacağı (ana metin /
    görsel / açılış sayfası); geliştiricinin kendi satış ofisinin "aracı" sayılıp sayılmadığı.
21. Otel reklamında "her şey dahil" kapsamında içki görseli/ifadesi (4250 md. 6, 11.06.2026 değişikliği).
22. KVKK çerez rehberi (bu turda metni okunamadı) — site pikseli için rıza şartı ve yurt dışına aktarım.

---

## Kaynaklar

| # | Başlık | URL | Tarih | Etiket |
|---|---|---|---|---|
| K1 | About data source categories in Meta Events Manager | https://www.facebook.com/business/help/1402913027039332 | okundu 2026-10-06 | Resmî-Meta |
| K2 | Understand data sharing restrictions based on data source categories | https://www.facebook.com/business/help/511197658391698 | okundu 2026-10-06 | Resmî-Meta |
| K3 | About prohibited information | https://www.facebook.com/business/help/361948878201809 | okundu 2026-10-06 | Resmî-Meta |
| K4 | About Core Setup | https://www.facebook.com/business/help/124742407297678 | okundu 2026-10-06 | Resmî-Meta |
| K5 | Custom Audiences overview (471 uyarısı) — depo `kaynak/marketing-api__audiences__overview.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/audiences/overview | indirildi 2026-10-06 | Resmî-Meta |
| K6 | Ad Set referansı (işaretli kitle/dönüşüm, `issues_info`, 2460003/2460004) — depo `kaynak/marketing-api__reference__ad-campaign.md` | https://developers.facebook.com/documentation/ads-commerce/marketing-api/reference/ad-campaign | indirildi 2026-10-06 | Resmî-Meta |
| K7 | Privacy Violations and Personal Attributes (reklam standardı) | https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes/ | güncelleme 2024-06-26 | Resmî-Meta |
| K8 | Health and Wellness (reklam standardı) | https://transparency.meta.com/policies/ad-standards/restricted-goods-services/health-wellness/ | güncelleme 2026-07-22 | Resmî-Meta |
| K9 | About Meta's health and wellness advertising policy | https://www.facebook.com/business/help/2489235377779939 | okundu 2026-10-06 | Resmî-Meta |
| K10 | About Meta's adult nudity & sexual activity advertising policy | https://www.facebook.com/business/help/819870269165994 | okundu 2026-10-06 | Resmî-Meta |
| K11 | About ads for housing (ülke listesi, konut tanımı) | https://www.facebook.com/business/help/1198401317374558 | okundu 2026-10-06 | Resmî-Meta |
| K12 | About ads for housing, employment or financial products and services | https://www.facebook.com/business/help/399587795372584 | okundu 2026-10-06 | Resmî-Meta |
| K13 | Alcohol (reklam standardı) | https://transparency.meta.com/policies/ad-standards/restricted-goods-services/alcohol/ | güncelleme 2024-06-26 | Resmî-Meta |
| K14 | About verification requirements that may impact financial services advertisers | https://www.facebook.com/business/help/719892839342050 | okundu 2026-10-06 | Resmî-Meta |
| K15 | About advertising to teens | https://www.facebook.com/business/help/229435355723442 | okundu 2026-10-06 | Resmî-Meta |
| K16 | Questions prohibited on your instant form | https://www.facebook.com/business/help/219356599612120 | okundu 2026-10-06 | Resmî-Meta |
| K17 | About privacy policies for lead ads | https://www.facebook.com/business/help/1247534515288168 | okundu 2026-10-06 | Resmî-Meta |
| K18 | Add a custom disclaimer to your lead ads with instant form | https://www.facebook.com/business/help/1550411888622740 | okundu 2026-10-06 | Resmî-Meta |
| K19 | About instant form types | https://www.facebook.com/business/help/252352181957512 | okundu 2026-10-06 | Resmî-Meta |
| K20 | Enable the SMS verification feature (OTP) | https://www.facebook.com/business/help/898260175547909 | okundu 2026-10-06 | Resmî-Meta |
| K21 | Create a lead ad with instant form from Meta Business Suite | https://www.facebook.com/business/help/179258984144385 | okundu 2026-10-06 | Resmî-Meta |
| K22 | About prefill questions on your lead ads with instant form | https://www.facebook.com/business/help/438193446367413 | okundu 2026-10-06 | Resmî-Meta |
| K23 | Ask the right questions on your lead ads with instant form | https://www.facebook.com/business/help/1607931762802448 | okundu 2026-10-06 | Resmî-Meta |
| K24 | Add custom questions to your lead ads with instant form | https://www.facebook.com/business/help/774623835981457 | okundu 2026-10-06 | Resmî-Meta |
| K25 | Add conditional answers to your lead ad with instant form | https://www.facebook.com/business/help/154286325106161 | okundu 2026-10-06 | Resmî-Meta |
| K26 | About lead ads terms and security (veri sorumluluğu, saklama) | https://www.facebook.com/business/help/829597887147190 | okundu 2026-10-06 | Resmî-Meta |
| K27 | About expired leads (90 gün) | https://www.facebook.com/business/help/1526849577619206 | okundu 2026-10-06 | Resmî-Meta |
| K28 | Download or retrieve your leads data from Meta | https://www.facebook.com/business/help/734933888443065 | okundu 2026-10-06 | Resmî-Meta |
| K29 | Graph API — Page `leadgen_forms` (POST parametreleri) | https://developers.facebook.com/docs/graph-api/reference/page/leadgen_forms/ | okundu 2026-10-06 | Resmî-Meta |
| K30 | About maximizing number of leads using ads that click to message | https://www.facebook.com/business/help/575610661605746 | okundu 2026-10-06 | Resmî-Meta |
| K31 | Create ads that click to WhatsApp in Ads Manager | https://www.facebook.com/business/help/447934475640650 | okundu 2026-10-06 | Resmî-Meta |
| K32 | WhatsApp Business Platform message-based pricing insights glossary (72 saat) | https://www.facebook.com/business/help/563317871449819 | okundu 2026-10-06 | Resmî-Meta |
| K33 | About learning limited (~50 olay/hafta) | https://www.facebook.com/business/help/269269737396981 | okundu 2026-10-06 | Resmî-Meta |
| K34 | About Advantage+ sales campaigns | https://www.facebook.com/business/help/1362234537597370 | okundu 2026-10-06 | Resmî-Meta |
| K35 | Recommended Meta pixel events and parameters for B2B advertisers | https://www.facebook.com/business/help/502347657043574 | okundu 2026-10-06 | Resmî-Meta |
| K36 | Depo brief bölümleri 02, 03, 06, 07 (Meta belgesinden derleme) | `docs/meta-reklam-brief/bolumler/` | 2026-10-06 | Resmî-Meta (derleme) |
| K37 | 6698 sayılı KVKK (konsolide; 7499 ile 2024 değişiklikleri) | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6698.pdf | okundu 2026-10-06 | Resmî-diğer |
| K38 | Aydınlatma Yükümlülüğünün Yerine Getirilmesinde Uyulacak Usul ve Esaslar Hakkında Tebliğ | https://www.resmigazete.gov.tr/eskiler/2018/03/20180310-5.htm | 2018-03-10 (eski olabilir, yürürlükte) | Resmî-diğer |
| K39 | KVKK Kurul Kararı 2023/692 (hizmetin açık rızaya bağlanması, sağlık kuruluşu) | https://www.kvkk.gov.tr/Icerik/7691/2023-692 | 2023-05-02 (eski olabilir) | Resmî-diğer |
| K40 | KVKK Kurul Kararı 2023/787 (hastanenin reklamda hasta verisi kullanması) | https://www.kvkk.gov.tr/Icerik/7692/2023-787 | 2023-05-11 (eski olabilir) | Resmî-diğer |
| K41 | Kişisel Verilerin Yurt Dışına Aktarılmasına İlişkin Usul ve Esaslar Hakkında Yönetmelik | https://www.resmigazete.gov.tr/eskiler/2024/07/20240710-2.htm | 2024-07-10 (yalnız arama özeti) | Resmî-diğer |
| K42 | Ticari İletişim ve Ticari Elektronik İletiler Hakkında Yönetmelik (konsolide) + Ticaret İl Müdürlüğü yayını | https://www.lexpera.com.tr/mevzuat/yonetmelikler/ticari-iletisim-ve-ticari-elektronik-iletiler-hakkinda-yonetmelik · https://kayseri.ticaret.gov.tr/yayinlar/tuketici/ticari-iletisim-ve-ticari-elektronik-iletiler-hakkinda-yonetmelik | okundu 2026-10-06 | Resmî-diğer |
| K43 | Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliği (konsolide) | https://www.lexpera.com.tr/mevzuat/yonetmelikler/ticari-reklam-ve-haksiz-ticari-uygulamalar-yonetmeligi | okundu 2026-10-06 | Resmî-diğer |
| K44 | Ticari Reklam ve Haksız Ticari Uygulamalar Yönetmeliğinde Değişiklik (RG 33297) | https://www.resmigazete.gov.tr/eskiler/2026/07/20260701-9.htm | 2026-07-01, yürürlük 2026-08-01 | Resmî-diğer |
| K45 | Sağlık Hizmetlerinde Tanıtım ve Bilgilendirme Faaliyetleri Hakkında Yönetmelik (RG 33075) | https://www.resmigazete.gov.tr/eskiler/2025/11/20251112-2.htm | 2025-11-12 | Resmî-diğer |
| K46 | (Mülga) aynı adlı yönetmelik (RG 32263) | https://www.resmigazete.gov.tr/eskiler/2023/07/20230729-29.htm | 2023-07-29 (yürürlükten kalktı) | Resmî-diğer |
| K47 | Taşınmaz Ticareti Hakkında Yönetmelik (konsolide; son değişiklik RG 01.10.2026) | https://www.mevzuat.gov.tr/File/GeneratePdf?mevzuatNo=24645&mevzuatTur=KurumVeKurulusYonetmeligi&mevzuatTertip=5 | okundu 2026-10-06 | Resmî-diğer |
| K48 | 6502 sayılı Tüketicinin Korunması Hakkında Kanun (konsolide) | https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6502.pdf | okundu 2026-10-06 | Resmî-diğer |
| K49 | 4250 sayılı İspirto ve İspirtolu İçkiler İnhisarı Kanunu (konsolide; 11.06.2026 değişikliği) | https://www.mevzuat.gov.tr/MevzuatMetin/1.3.4250.pdf | okundu 2026-10-06 | Resmî-diğer |
| K50 | Turizm Tesislerinin Niteliklerine İlişkin Yönetmelik | https://www.mevzuat.gov.tr/MevzuatMetin/21.5.1134.pdf | 2019-06-01 (eski olabilir, yürürlükte) | Resmî-diğer |
| K51 | Seyahat Acentaları Yönetmeliği (konsolide; 2021 ve 2024 ekleri) | https://www.mevzuat.gov.tr/File/GeneratePdf?mevzuatNo=11648&mevzuatTur=KurumVeKurulusYonetmeligi&mevzuatTertip=5 | okundu 2026-10-06 | Resmî-diğer |
| K52 | MEB Özel Öğretim Kurumları Yönetmeliği (derleme) | https://ookgm.meb.gov.tr/meb_iys_dosyalar/2025_01/03163146_mebozelogretimkurumlariyonetmeligi03012025.pdf | 2025-01-03 | Resmî-diğer |
| K53 | GDPR md. 3 (ülke dışı kapsam) — üçüncü taraf metin barındırma | https://gdpr-info.eu/art-3-gdpr/ | okundu 2026-10-06 | Resmî-diğer |
| K54 | We Are Social & Meltwater, Dijital 2025 Türkiye (Türkçe çeviri, Güvenli Web) | https://www.guvenliweb.org.tr/dosya/h3ubY.pdf | veri Ekim 2025 | Sektör |
| K55 | DataReportal, Digital 2026: Turkey | https://datareportal.com/reports/digital-2026-turkey | 2025 sonu | Sektör |
| K56 | AA — Reklam Kurulu 29,1 milyon lira ceza | https://www.aa.com.tr/tr/ekonomi/reklam-kurulundan-tuketiciyi-aldatan-reklamlara-29-1-milyon-lira-ceza/3455762 | 2025-01-20 | Sektör (haber) |
| K57 | AA — Reklam Kurulu 30,2 milyon lira ceza | https://www.aa.com.tr/tr/gundem/reklam-kurulu-tuketiciyi-yaniltici-reklamlar-icin-30-2-milyon-lira-ceza-verdi/3488673 | 2025-02-21 | Sektör (haber) |
| K58 | AA — Reklam Kurulu 32,5 milyon lira ceza (hazır giyim sahte indirim, %0 faiz) | https://www.aa.com.tr/tr/ekonomi/reklam-kurulu-yaniltici-reklamlara-yaklasik-32-5-milyon-lira-ceza-kesti/3517028 | 2025-03-22 | Sektör (haber) |
| K59 | AA — Reklam Kurulu 5 ayda 125,3 milyon lira | https://www.aa.com.tr/tr/ekonomi/reklam-kurulu-yaniltici-reklamlara-5-ayda-yaklasik-125-3-milyon-lira-ceza-kesti/3572147 | 2025-05-18 | Sektör (haber) |
| K60 | AA — Reklam Kurulu 7 ayda 185 milyon lira | https://www.aa.com.tr/tr/ekonomi/reklam-kurulu-yaniltici-reklamlara-7-ayda-yaklasik-185-milyon-lira-ceza-kesti/4005381 | 2026-07-22 | Sektör (haber) |
| K61 | Erdem & Erdem — Ticari Reklam Yönetmeliği'nde kapsamlı değişiklikler | https://www.erdem-erdem.av.tr/bilgi-bankasi/ticari-reklam-ve-haksiz-ticari-uygulamalar-yonetmeliginde-kapsamli-degisiklikler-yapildi | 2026 | Sektör |
| K62 | Foley Hoag — Meta's new advertising rules for health and wellness businesses | https://foleyhoag.com/news-and-insights/blogs/security-privacy-and-the-law/2025/january/meta-s-new-advertising-rules-key-considerations-for-health-and-wellness-businesses/ | 2025-01 (yalnız arama özeti) | Sektör |
| K63 | Polar Analytics / Triple Whale — Meta sağlık izleme kısıtları | https://www.polaranalytics.com/post/2025-metas-tracking-restrictions-for-health-wellness-are-here----heres-how-to-fix-it · https://www.triplewhale.com/blog/meta-health-and-wellness-brands | 2025 (yalnız arama özeti) | Sektör |
| K64 | Zappush / AuditSocials — önce/sonra kuralları (kilo, yaşlanma) | https://www.zappush.com/blog/why-meta-doesnt-allow-before-and-after-images-in-health-ads | 2026 (yalnız arama özeti) | Topluluk |
| K65 | Hukukçular Evi — Reklam Kurulu ceza aralığı 2026 | https://hukukcularevi.com/yaniltici-reklam-reklam-kurulu-sikayet/ | 2026 (yalnız arama özeti) | Topluluk |
| K66 | KVKK — standart sözleşmelerde dikkat edilecek hususlar duyurusu | https://www.kvkk.gov.tr/Icerik/8170/Yurt-Disina-Kisisel-Veri-Aktariminda-Kullanilacak-Standart-Sozlesmelerde-Dikkat-Edilmesi-Gereken-Hususlara-Iliskin-Kamuoyu-Duyurusu | 2024 (yalnız arama özeti) | Resmî-diğer |
| K67 | Türk ajans yazıları (klinik ve emlak için Meta reklam önerileri) | https://www.onuroztr.com/blog/klinikler-icin-facebook-reklamlari/ · https://gezginajans.com/facebook-ve-instagramda-potansiyel-musteri-reklamlari/ | 2026 (yalnız arama özeti) | Topluluk |
