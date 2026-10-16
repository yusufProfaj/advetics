# Ürün kararları (ayrıntı)

> CLAUDE.md'den taşındı (2026-10-16, token düzeni). İçerik DEĞİŞMEDİ, yalnız konuya göre ayrıldı.
> Yeni ders buraya, ilgili konu dosyasına EKLENİR; CLAUDE.md'ye yalnız tek satırlık işaret gider.

## 5. Ürün kararları

- **ÜRÜN KARARLARINDA ÖLÇÜT: KULLANIM KOLAYLIĞI VE REKLAM VERİMLİLİĞİ**
  (kullanıcı, 2026-10-08: *"ekran kaç tane olması gerekiyorsa sen karar
  verebilirsin benim amacım kullanım kolaylığı ve reklam verimliliği
  maksimum seviyede olması"*). Ekran sayısı, menü yeri, adım sayısı gibi
  arayüz kararlarında sorma; bu iki ölçütle karar ver ve gerekçesini yaz.
  Para harcayan, geri alınamayan ya da başka bir kullanıcı kararını
  bozan şeyler yine sorulur.
- **MENÜ YEDİ BÖLÜM, TÜRKÇE** (kullanıcı kararı, 2026-10-09): Genel Bakış ·
  Planla (AdvStrategy, Aylık Bütçe) · Oluştur (Akıllı Boost, AdvCampaign) ·
  Yönet (Reklam Yöneticisi, Potansiyel Müşteriler) · İyileştir (Kurallar) ·
  Raporlar · Base (Marka Merkezi) + Ayarlar. Yalnızca ekranı olan satır
  menüye girer. Yol haritası `docs/URUN-YAPISI-PLANI.md`.
- **GENEL BAKIŞ ÖZET, İNİŞ REKLAM YÖNETİCİSİ'NDE** (2026-10-09, kullanıcı
  kararı). Şirket → workspace → mecra/hesap → kampanya → reklam seti →
  reklam iniş tablosu Genel Bakış'tan `/ads-explorer`a (Reklam Yöneticisi)
  taşındı; bağlantılar `lib/reklam-yoneticisi.ts`ten. Genel Bakış ilk beşi
  gösterip oraya bağlanıyor ve eski `?kampanya=`/`?hesap=` adreslerini
  oraya yönlendiriyor. Eski reklam kartları ekranı (arama, "Sorunlu")
  `/ads-explorer/galeri` (Reklam Galerisi). Özet kutuları iki sayfada ortak
  (`components/genel-bakis/ozet-parcalari.tsx`).
- **MÜŞTERİ HESABI DÖRT EKRAN GÖRÜR** (2026-10-08): Genel Bakış, Reklam
  Yöneticisi (eski adı Reklam Keşfi), **AdvStrategy**, Raporlar. AdvStrategy'de planı görür ve
  ONAYLAR, yazamaz. Gerekçe: onay panelde alınınca ajans PDF gönderip
  cevap bekleyip elle işlemiyor; plan onaylanır onaylanmaz AdvCampaign'e
  geçebiliyor. `nav-sections.spec.ts` dört ekranı kilitliyor.

- **Hedef kullanıcı reklamcılık bilmiyor.** Kullanıcının verbatim ifadesi:
  *"amacım reklam ile ilgili bilgisi olmayan birisinin bile platformu
  kullanabilmesi"*. Hedef, optimizasyon, yerleşim, teklif stratejisi
  sorulmuyor — hepsi `goal-mapping.ts` içinde karara bağlanıyor.
- **REKLAM KURMANIN TEK YOLU ADVCAMPAIGN (`/reklam`)** (kullanıcı kararı,
  2026-10-07). Eski Reklam Oluştur (Hızlı/Uzman), AI Asistan sohbeti ve Toplu
  Oluştur panelden ve API'den kaldırıldı; eski adresler `/reklam`a
  yönlendiriyor. AdvCampaign sohbetle yönetilen, yapay zekâ odaklı bir akış:
  kullanıcıyı yönlendiriyor, en optimize kurulumu kendisi seçiyor, önizleme
  onaya kalıyor. Eski backend'in Akıllı Boost, varlıklar ve raporların
  kullandığı parçaları (`draft-tree`, `ad-builder`) duruyor.
- **Arayüz Türkçe ve iş dilinde.** "CENTRAL", "OPTIMISE" gibi mimari terimler
  panelde geçmiyor. **2026-10-15'ten beri İKİ DİLLİ (TR/EN, kullanıcı
  kararı):** kaynak dil Türkçe; yorumlar, kod içi adlar ve commit Türkçe
  kalır, ekran metni `apps/web/src/dil/sozlukler/` altındaki sözlükten
  gelir (`useSozluk` / `sozluk()`). Yeni ekran iki dili birden yazar:
  `dil-tarama.spec.ts` elle yazılmış metni dosya dosya sayıyor ve istisna
  listesi YALNIZ KÜÇÜLÜR; `sozluk-anahtarlari.spec.ts` her anahtarın iki
  dilde dolu ve çevrilmiş olduğunu kilitliyor. Dil çerezde (`adv_dil`) ve
  profilde (`users.locale`); ilk ziyarette bir kez sorulur. Rapor ve reklam
  dili kullanıcının değil WORKSPACE'in ayarı. Mimari ve dalgalar
  `docs/i18n/MIMARI.md`, terimler `docs/i18n/SOZLUK.md`.
- Bir müşteri = bir **şirket**; şirketin birden çok projesi/reklam hesabı
  olabilir. Panelde ve raporlarda reklam hesabı süzgeci **her zaman** bulunmalı.
- **WORKSPACE BAŞINA PLATFORM BAĞLANTISI MÜMKÜN DEĞİL — denendi, çürüdü.**
  Müşterilerin kendi Facebook hesabı yok; ajans onların Business Manager'ına
  partner olarak ekleniyor. Yani her yetkilendirme AYNI Facebook kullanıcısı
  oluyor ve `orgId + platform + externalUserId` tekil anahtarında tek satıra
  çakışıyor. "Her workspace kendi hesabıyla bağlansın" modeli bu yüzden
  fiziksel olarak kurulamıyor. Müşteri ayrımı bağlantıda değil hesap
  ATAMASINDA yapılıyor.
- **ATAMA İZLEMEYİ DE AÇIYOR VE GEÇMİŞİ KUYRUĞA ALIYOR.** "Ata → izlemeyi aç
  → bekle" üçlüsü kullanıcının angarya dediği şeydi ve ikinci adımı atlamak
  "atadım ama veri gelmiyor" hâlini üretiyordu. Bir workspace'in verisi
  bağlanınca değil, HESAP ONA ATANINCA başlıyor: `syncEnabled` açılıyor,
  `structure` ve 90 günlük `initial_backfill` kuyruğa giriyor. Sıra önemli —
  metrikler kampanya satırlarına bağlanıyor. `ad-account-assign.spec.ts`
  gerçek veritabanıyla kilitliyor.
- **RAPORLAR TEK SAYFA: rapor, şablon ve faturalar.** Kenar çubuğunda üç ayrı
  bağlantıydı; üçü de aynı belgenin parçası ve ayrılmaları gerçek bir hata
  üretiyordu (yukarıya bkz.). Şablon seçici hem ön ayarları hem kayıtlı
  şablonları listeliyor, düzenleme aynı listenin içinde; faturalar sekme.
  Yetki süzgeci kaybolmadı, sayfanın İÇİNE taşındı: `report.write` şablon
  düzenlemeyi, `report.share` fatura sekmesini açıyor.
- **BÖLÜM SIRASI SÜRÜKLENEREK DEĞİŞİYOR — ama klavye kaybolmadı.** ↑/↓
  düğmelerinin gerekçesi "yedi öğelik listede kazancı yok"tu; liste on dörde
  çıkınca çürüdü. Kütüphane yok (HTML5 olayları). Satır odaklanabilir ve ok
  tuşlarıyla taşınıyor: yalnızca sürükleme koymak, fare kullanamayan için
  özelliği TAMAMEN kapatmak olurdu. Taşıma TAKAS DEĞİL ARAYA SOKMA — takas
  eden bir sürükleme kullanıcının bıraktığı yere koymuyor.
- **KURUMSAL KİMLİK VE "BASE" (kullanıcı kararı, 2026-10-06; Base'in
  yapısı 2026-10-13'te DEĞİŞTİ).** Görünüş Profaj kurumsal kılavuzundan:
  ana başlık Montserrat, gövde Open Sans, kırmızı `#ff2400`, gri
  `#302e2d`. Menü başlığı "Kütüphane" değil **Base**.
  *Eski karar (2026-10-06 → 2026-10-13):* Base'in TEK kapısı Marka
  Merkezi'ydi ve iç menüsü yedi bölüm taşıyordu (Kurulum · Bağlantılar ·
  Marka · Kitleler · Varlıklar · Ölçüm · Workspace ayarları + Bildirimler).
  Gerekçesi kullanıcının *"nereye nereden girdiğimi unutuyorum"*
  şikâyetiydi: dört adrese dağılmış kurulumu tek sayfaya toplamak.
  *Neden değişti (kullanıcının onayladığı yapı, 2026-10-13):* tek sayfa
  yine üç sayaç (hazırlık şeridi, kurulum, hazır workspace kartı), aynı
  alanın üç düzenleme yeri (özel kategori: pencere, Workspace ayarları,
  hazırlama kartı) ve reklam kurarken her gün açılan malzemeyi (görsel,
  kreatif, form, kitle) bir kurulum ekranının iç menüsünde taşıyordu.
  *Yeni yapı (sözleşme 2026-10-13'te yazıldı; sayfalar Ajan 2/3'te — menü
  `nav-sections.ts` geçiş anahtarlarıyla çevrilince bu not silinir):* Base
  İKİ satır — **Marka Merkezi** (YALNIZ seçili workspace;
  başlıkta "Şirket › Workspace"; üç bölüm: Kurulum · Marka · Workspace
  bilgileri) ve **Varlıklar** (`/varliklar`: Görseller · Kreatifler ·
  Formlar · Kitleler). Ayarlar dört sekme: Şirketler ve workspace'ler ·
  Platform bağlantıları · Ekip ve güvenlik · Hesabım. Üç kural: (1) her
  bilginin TEK EVİ var, başka yerde salt okunur + evine bağlantı; (2)
  kapsam ekranın adında (Ayarlar ajans/şirket/kişi, Marka Merkezi tek
  workspace); (3) Kurulum tek liste, tek sayaç, tek "Eksikleri tamamla".
  Şirketler ekranındaki workspace PENCERESİ KALKTI: workspace satırı
  Marka Merkezi'nde açılıyor. Adresler, eski adres eşlemesi ve eylem
  kapıları TEK sözleşmede (`packages/shared/src/panel`, panelde
  `lib/panel-adresleri.ts`); `/ayarlar/…`, `/marka-merkezi?bolum=…`,
  `/varliklar` dizgesini elle yazan dosya kalmamalı
  (`panel-adresleri.spec.ts`). Ayrıntı `docs/panel-sadelestirme/MIMARI.md`.
  **Aylık Bütçe Base'de DEĞİL** — 2026-10-09'dan beri Planla › Aylık
  Bütçe (`/butce`, kullanıcı kararı); eski `?bolum=butce` oraya yönleniyor
  ve bağlantılar `lib/butce-adresi.ts`ten. Workspace'e geçen kullanıcı
  doldurulacak HER ŞEYİ Marka Merkezi'nden yapabilmeli (kullanıcı,
  2026-10-06): iletişim/firma, rapor alıcıları, özel reklam kategorisi,
  hesaplar, ölçüm. Yeni bir workspace kurulum ekranı AYRI SAYFA olarak
  açılmaz, Kurulum listesine ADIM olarak girer. Marka profili
  (`branding_profiles`) CSS'i ezer: renk/yazı tipi varsayılanı değişirse
  eski varsayılanı taşıyan satırlar migration'la güncellenmeli, seçilmiş
  değerlere dokunulmamalı.
- **HER PROJENİN KENDİ HESAPLARI; KURULUM MARKA MERKEZİ'NİN İLK BÖLÜMÜ**
  (kullanıcı kararı, 2026-10-12). Bir şirketin birden çok projesi varsa
  her projenin ayrı Meta reklam hesabı, Google Ads hesabı, Tag Manager ve
  Analytics'i olur. Tag Manager ve Analytics API'si HESAP açamıyor: ayrım
  proje başına KONTEYNER ve GA4 MÜLKÜ ile (aynı hesap altında). Hesaplar
  ajansın BM/MCC'si ya da şirketin kendi bağlantısı altında açılabiliyor;
  ödeme yöntemini hiçbir API eklemiyor. Rehber gerçek hesap açan adımları
  "Eksikleri tamamla"ya ASLA koymuyor; başkasının yayınlanmamış Tag Manager
  sürümünü yayınlamıyor; aynı kategoride birincil Google Ads dönüşümü
  varsa yenisini açmıyor (çift sayım). `docs/kurulum/MIMARI.md`.
- **AKILLI BOOST YALNIZCA INSTAGRAM (+ YOUTUBE) KARTI ÜRETİR — Facebook
  sayfası DEĞİL** (kullanıcı kararı, 2026-09-30). Müşteriler paylaşımı iki
  platforma birden yapıyor (crosspost); Facebook sayfa gönderileri çekilmeye
  başlayınca her Instagram gönderisinin ikizi de kart oldu ve Instagram'da
  yayında olan bir içeriğin Facebook ikizi "Onay bekliyor" duruyordu: onay =
  aynı içerik için ikinci kampanya. İkizleri metinden eşleştirmek tahmin
  olurdu. Facebook gönderileri çekilmeye devam ediyor (elle boost, rapor);
  kart üretimi `AKILLI_BOOST_META_PROFILLERI` kapalı listesinde.
- **AJANSIN BAĞLANTISI BİR KEZ KURULUR; ŞİRKET İSTERSE KENDİ BAĞLANTISINI
  KURAR.** Ajansın Meta/Google kimliği bir kez yetkilendiriliyor ve havuzu
  üst hesabın bütün şirketlerine hizmet ediyor. Ajansın AYNI kimliğini
  şirket başına yeniden yetkilendirmek yok: platform önceki token'ı
  geçersiz kılıyor ve bağlantıları koparıyordu. Ama bir şirket (müşteri)
  kendi kişisiyle kendi Meta'sını bağlayabiliyor ve o hesaplar YALNIZCA o
  şirkette kalıyor (2026-09-23, kullanıcının isteği: *"müşterimiz hesabını
  kendisi yönetmek istediğinde meta bağlantısını kendisi yapıp reklam
  hesaplarının sayısı kadar workspace oluşturabiliyor olması lazım"*).
  Şirket admini kendi bağlantısını ve hesaplarını yönetiyor; ajansın
  atadığını değiştiremiyor. Kurallar aşağıda "HAVUZUN İKİ SAHİBİ VAR".
