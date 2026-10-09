# Devir — nerede kaldık

> **"advetics projesine devam et" denince okunan İLK dosya bu.** Kısa kalmak
> zorunda: geçmiş [`DURUM.md` § 8](DURUM.md)'de, plan
> [`BASE-PLANI.md`](BASE-PLANI.md)'de. Buraya yalnızca SON DURUM ve SIRADAKİ
> İŞ yazılır; her oturum kapanırken, işin kendi commit'inde güncellenir.
> 16 Ağustos'a kadarki eski devir belgesi: [`arsiv/DEVAM-2026-08.md`](arsiv/DEVAM-2026-08.md).

**Son güncelleme:** 2026-10-09 · **Canlı `6b51390` (11:43, 81 sn); ondan önce 316be15 (10:30):**
aşağıda "DEPLOY EDİLMEDİ" yazan işlerin HEPSİ artık canlıda (AdvCampaign
sohbeti, AdvStrategy ikinci tur, YouTube Boost Aşama 0–1 + kanal bulma, Okuma
API, Base Aşama 1, LinkedIn para birimi). Ölçüldü: `prisma migrate status`
temiz, 2026-10-07…09 arasındaki dokuz migration uygulanmış, yeni tablolarda
RLS politikası var, platform sahibi yalnız hello@profaj.com.
**Bekleyen deploy:** yok (canlı `6e18a40`, 2026-10-09 12:47).

**ÜRÜN YAPISI PLANI (2026-10-09, kullanıcı isteği):** panel yedi bölüme
geçiyor: Genel Bakış · Planla · Oluştur · Yönet · İyileştir · Raporlar ·
Base. Bu adlar Türkçe, AI Asistan İyileştir altında geri geliyor ve reklam
kurmuyor. Orphex'ten farkımız "söyler değil, yapar". Plan ve aşamalar
[`URUN-YAPISI-PLANI.md`](URUN-YAPISI-PLANI.md). Kod yazılmadı.
Ç-3 kapandı: bütçe Planla'da. **Açık kararlar:** Ç-4 Hesap Oluştur, Ç-5
tanıtım sitesi.

**AŞAMA 0 — CANLI TURLAR (2026-10-09).** Düzeltmeler CANLIDA
(`6b51390`, 11:43 deploy, 81 sn, migration yok).

1. **YouTube "Prova et": GEÇTİ** (250 ₺/gün, kullanıcı kararı). Üç ret
   düzeltildi ve Google'da doğrulandı (CLAUDE.md "Demand Gen — prova").
   K3 KAPANDI: ilk yayın DURAKLATILMIŞ kurulacak (kullanıcı). Doğru adres
   `https://gardenvillaskusadasi.com/` (çift l; sayfa başlığı "EGE BİRLİK
   YAPI – GARDEN VİLLAS"). Adres ön ayardan/workspace'ten geliyordu ve
   workspace'te iki proje var: kart düzenlemesine **Hedef adres** alanı
   eklendi, prova ve yayın aynı alanı kullanıyor (canlı `dd21dc2`).
   **İLK GERÇEK GOOGLE YAZMASI YAPILDI (2026-10-09 12:17):** Garden Villas
   kartı DURAKLATILMIŞ kuruldu, Google kampanya kimliği `24336100271`, kart
   `launched`, ikinci kurulum engeli devrede. Google'da PAUSED olduğunu
   KULLANICI GÖZLE DOĞRULADI (2026-10-09); panel duraklatılmış kampanyayı
   okuyamıyor (canlı liste yalnız yayındakileri gösteriyor). Başlatmak
   kullanıcıda, Google Ads'ten. Küçük not: kartın "tekrar boost" engeli
   "hâlâ yayında" diyor, kampanya duraklatılmış. K4 (token seviyesi) açık.
2. **AdvCampaign site taslağı:** dört ekran hatası düzeltildi ve canlıda
   doğrulandı (amaç tekrar sorulmuyor, ekran takılmıyor, görsel balonda).
   Konut beyanı yapıldı (kullanıcı), öneriler onaylandı, **Meta provası
   REDDETTİ**: kampanya ve kreatif geçti; reklam seti ve reklam
   `special_ad_categories[0] ... got "2"` ile düştü. Gönderilen değer
   `["HOUSING"]`; kampanya tek başına geçiyor, satır içi `campaign_spec`
   içinde Meta değeri kendi iç sayısına çevirip reddediyor gibi. Gerçek
   kurulum `campaign_id` ile ve bu yoldan geçmiyor ama prova bunu
   kanıtlayamıyor. ÇÖZÜM ÖLÇÜLMELİ (kategoriyi provadan atmak konut
   kısıtlarının denetimini de susturur — yalancı prova). Ayrıca:
   araç retlerinin SEBEBİ artık ekranda (önceden yalnız modele gidiyordu);
   özel kategori sorusu yalnız Taslak sekmesinde, dar ekranda görünmüyor.
3. **AdvStrategy aktarımı: ÇALIŞIYOR** (kutu dolu, görsel modele ulaşıyor).
4. **Okuma API:** kullanıcı anahtar oluşturacak.

**AŞAMA 1 — MENÜ (2026-10-09), CANLIDA (`6e18a40`, 12:47, 104 sn).**
Yedi bölüm: Genel Bakış · Planla (AdvStrategy, Aylık Bütçe) · Oluştur
(Akıllı Boost, AdvCampaign) · Yönet (Reklam Keşfi, Potansiyel Müşteriler) ·
İyileştir (Kurallar) · Raporlar · Base (Marka Merkezi) + Ayarlar. Aylık
Bütçe Marka Merkezi'nden `/butce` sayfasına döndü (eski adres yönleniyor).
İkon rayı yapılmadı, Ekip Base'e taşınmadı — gerekçeler
[`URUN-YAPISI-PLANI.md`](URUN-YAPISI-PLANI.md) Aşama 1. Müşteri hesabı yine
dört ekran. Canlıda kontrol edildi: menü yedi bölüm, `/butce` açılıyor,
`/marka-merkezi?bolum=butce&ay=…` ayı taşıyarak yönleniyor.
**Sıradaki: Aşama 2 (Genel Bakış karar ekranı).**

**Karar bekleyen kullanım sorunu:** asistan kullanıcının AÇIKÇA söylediği
alanları da "öneri" diye yazıyor ve onay kartında yeniden onaylatıyor.

Ardından Aşama 1 (menü ve görsel düzen).

**SUNUCU 2026-10-09 (Hostinger yeniden başlattı) — TARİHÇE, 10:30 deploy'u
bunu kapattı:** yarım kalan deploy API'yi
ve paneli `703b2a2` ile derleyip `20261008170000_google_yazma_kesici`
migration'ını uyguladı, sonra durdu. 07:32'de sunucu yeniden başlatıldı ve
pm2 açılışta kalkmadı; site 08:03'e kadar `502` verdi. Süreçler elle
açıldı, yani **canlıda `703b2a2`** (YouTube Aşama 0 + 1, kanal arama). Bu
sürümde `db:rls` koşmadı ama `02_rls.sql` değişmemişti. `.last-deployed-sha`
hâlâ `143c2b8`: bir sonraki deploy bunu düzeltecek ve yeni `deploy.sh`'ı
(kilit, düşük öncelik, `.next-derleme`) devreye alacak. Açılışta kalkma artık
`advetics` crontab'ındaki `@reboot` satırıyla (DEPLOYMENT.md §10e).
Deploy'un 40 dk sürmesinin sebebi bizim yükümüz değildi: `vmstat` steal
time (`st`) %83–90. `st` 20'nin altındayken deploy et.

**YOUTUBE KANALINI BUL (2026-10-08, kullanıcı isteği), DEPLOY EDİLMEDİ:**
adres yapıştırmadan kanal ekleme. Marka Merkezi › Bağlantılar › YouTube ›
"Kanalı bul": workspace sitesindeki kanal bağlantısı / gömülü video ve
Google Ads hesabında reklamı yapılmış videolardan kanıtlı öneri, isimle
YouTube araması (100 kota birimi; 24 saat önbellek, kişi başı saatte 20).
"Bu kanal" havuza ekleyip mevcut atama ucundan bu workspace'e bağlıyor;
başka workspace'teki kanal eklenemiyor. Havuz ekranında (Platform
Bağlantıları) yalnızca isimle arama → havuz. Migration YOK. Canlıda
ölçülmedi: Google Ads `asset.youtube_video_asset` sorgusu.

**AKILLI BOOST · YOUTUBE CANLIYA (2026-10-08, kullanıcı kararı):** yeni
format yok, var olan YouTube → Demand Gen yolu canlıya oturtuluyor. Plan ve
bulgular: [`akilli-boost/YOUTUBE-CANLI-PLAN.md`](akilli-boost/YOUTUBE-CANLI-PLAN.md).
**Aşama 0 (para güvenliği) yazıldı, DEPLOY EDİLMEDİ.** MIGRATION VAR:
`20261008170000_google_yazma_kesici`. Bulunan iki gerçek hata kapandı:
yayındaki YouTube kartı tekrar onaylanıp İKİNCİ kampanya açabiliyordu;
kart kampanya kimliğini kaynak adı olarak yazdığı için harcama kartta HİÇ
görünmüyordu. **Aşama 1 de yazıldı (2026-10-08), DEPLOY EDİLMEDİ, migration yok:**
kurulum tek atomik istek, kartta "Prova et" (para harcamaz) ve
"Duraklatılmış kur". **Sıradaki:** deploy → Ege Birlik Yapı kartında
prova (canlıda ölçülmemiş alanların cevabı) → Aşama 2 (kartta ön kontrol). İlk canlı deneme **Ege Birlik Yapı** kanalıyla
(K1); bütçe/süre (K2), duraklatılmış ilk yayın (K3) ve geliştirici token
seviyesi (K4) Aşama 3'ten önce kullanıcıya sorulacak.

**OKUMA API / MCP (2026-10-08, kullanıcı isteği), DEPLOY EDİLMEDİ:**
platform sahibi (`hello@profaj.com`) için salt okunur yapay zekâ kapısı.
Panel: Ayarlar › Okuma API (menü + sayfa yalnız `platformAdmin`), anahtar
oluştur / bir kez göster / iptal. API: `POST /api/mcp` (durumsuz MCP,
Streamable HTTP, SDK yok) + aynı araçlar REST `GET /api/okuma/araclar/:ad`;
dokuz araç `MetricsService`in okuma yollarını çağırıyor, yeni SQL yok.
Anahtar YALNIZ `@OkumaAnahtariyla()` uçlarında geçiyor, o uçlar YALNIZ
anahtarla (çerez reddediliyor). MIGRATION VAR: `20261008160000_okuma_api`
(yeni tablo `okuma_api_anahtarlari`) + `db:rls`. Bağlantı belgesi ve hazır
istemler: [`okuma-api/MCP-BAGLANTI.md`](okuma-api/MCP-BAGLANTI.md).
**Deploy sonrası:** `db:platform-admin -- --liste` ile yalnız hello'nun sahip
olduğunu doğrula (ekranı her platform sahibi görür), anahtar oluştur, curl
ile `tools/list` dene, Claude Code'dan `metrik_ozeti` çağır. Canlıda HİÇ
denenmedi; Claude Desktop (`mcp-remote`) yolu ölçülmedi.

**YAPAY ZEKÂ GEMINI (2026-10-08, kullanıcı kararı):** Anthropic tamamen
kaldırıldı (SDK dahil). Tek istemci `apps/api/src/yapay-zeka/gemini.ts`
(düz REST, anahtar `x-goog-api-key` başlığında), model
`GEMINI_MODEL="gemini-3.8-flash"` (fiyat/performans; giriş fiyatı
31 Aralık 2026'ya kadar, sonra iki katı). Anahtar sunucuda
`./scripts/gemini-anahtari.sh` ile giriliyor (gizli sorar, Gemini'ye sorup
doğrular, .env yedeği alır, yalnız Advetics süreçlerini yeniden başlatır).
Sohbet kaydı Gemini'nin kendi biçiminde: düşünce imzaları aynen geri gidiyor.

**ADVSTRATEGY (2026-10-08, yeni modül):** aylık medya planı (bütçe dağılımı,
Google arama kurgusu, kitle × kreatif matrisi, sezon, PDF + AdvCampaign'e
aktarım), yalnız Meta + Google. Plan beş ajana bölündü:
[`advstrategy/AJAN-PLANI.md`](advstrategy/AJAN-PLANI.md). Kararlar: PDF'te
Advetics logosu, onay PDF + panel içi (dış link yok), aktarım platforma
DEĞİL AdvCampaign'e taslak. **Ajan 1 BİTTİ (2026-10-08):** sözleşme
`packages/shared/src/strateji/`, veri modeli ve devir notu
[`advstrategy/MIMARI.md`](advstrategy/MIMARI.md), yeni izinler
`strategy.read|write|approve` (müşteri hesabı okur + onaylar), salt okunur
`GoogleProvider.kelimeFikirleri` + `google-check --kelime` ölçüm kipi.
**Ö-1 ÖLÇÜLDÜ (2026-10-08): Keyword Planner ERİŞİMİ VAR** (2.660 fikir,
yakın varyantlar aynı metrik, hacim yuvarlanmış; kurallar MIMARI §4.1).
**Ajan 2 + 3 BİRLEŞTİ (2026-10-08), DEPLOY EDİLMEDİ:** MIGRATION VAR
(`20261008120000_advstrategy`, beş yeni tablo) + `db:rls` + worker'da yeni
`strateji-kelime` kuyruğu (1 istek/sn). Ekran `/strateji`: plan listesi,
Bütçe · Arama · Matris, durum düğmeleri. Bu turda YOK: PDF, sezon,
AdvCampaign'e aktarım (ekranda da görünmüyor). Müşteri hesabının menüsü
dörde çıktı (AdvStrategy): kullanıcı onayı bekleniyor.
**Ajan 4 kapısı AÇIK (2026-10-08):** iki kırmızı (kelime işçisi gerçek
transaction açmıyordu; BIGINT taşan bütçe) ve üç düşük bulgu Ajan 2'de
kapandı. Deploy sonrası Ajan 4'ün salt okunur SQL kontrolleri (yetki
override'ı taşıyan üyelikler, RLS politika sayıları, takılmış arama).
**Birinci tur CANLIDA (2026-10-08).** Müşteri hesabı dört ekran görür
(kullanıcı kararı, CLAUDE.md §5).
**İkinci tur yazıldı, DEPLOY EDİLMEDİ:** AdvCampaign'e aktarım (hazır
doldurulmuş oturum: `adv_oturum.hazir_istem/hazir_medyalar`, yalnız Meta),
deterministik kelime gruplama (`grup_elle` korunur), PDF medya planı +
Sunum bölümü. MIGRATION VAR: `20261008140000_advstrategy_aktarim` (var
olan `adv_oturum`a kolon). Ajan 4 kapısı AÇIK (bulgu: hazır metin yanlış
oturuma düşebiliyordu, deploy'dan önce düzeltildi). **Sıradaki:** deploy → canlı
kontrol (aktarılan oturumda giriş kutusu dolu mu, gönderince görseller
modele ulaşıyor mu). Üçüncü tur: sezon/takvim (özel gün listesini kimin
dolduracağı belirsiz), PDF indirme denetim kaydı.

**ADVCAMPAIGN (2026-10-07, kullanıcı kararı):** eski Reklam Oluştur, AI
Asistan ve Toplu Oluştur KALDIRILDI (panel + API `ai-assistant` sohbeti ve
`bulk` modülü); menüde tek satır **AdvCampaign → `/reklam`**. Hedef:
teknik bilgisi olmayan kullanıcıyı sohbetle yönlendiren, Meta ve Google'da
en optimize kampanyayı kuran yapay zekâ odaklı akış. Araştırma ve tasarım
`docs/advcampaign/` altında (A1 Google, A2 tek panel, A3 Meta, sentez,
tasarım/plan). DB'deki eski AI sohbet tabloları silinmedi (veri).
Plan: [`TASARIM-PLAN.md`](advcampaign/TASARIM-PLAN.md) (31 iş paketi,
İP-01…31; ilk çalışan Meta sohbetine giden yol İP-09 → 10 → 12 → 13 → 14 →
15 → 16 → 17). Kullanıcı kararları K-01…K-08 varsayılanla kapatıldı (§0).
Arayüz taslağı: `advcampaign/advcampaign-arayuz.html`. P0 bitti: İP-01…04
(Meta) ve İP-06 + eski Google arama yolu kapatıldı.
**Sohbet MVP'si yazıldı (2026-10-08):** İP-09 (sözleşme), İP-10 (tablolar,
MIGRATION `20261008100000_advcampaign_sohbet`), İP-12…15 (araçlar, döngü,
SSE ucu, tek kullanımlık onay), İP-16…18 (ekran: oturumlar · sohbet ·
canlı taslak paneli, mobilde sekmeli). `/reklam` artık sohbet ekranı; eski
tek atışlık stüdyo silindi (`POST /reklam/ai-taslak` ucu duruyor, ekran
çağırmıyor; 2026-10-08'de kaldırıldı). Canlıda HİÇ denenmedi. Bilinen açıklar: (a) FORM niyeti form şablonu olmadığı için
tamamlanamıyor; (b) onay anında öneriler kullanıcı kararına çevrilirken yeni
sürüm doğuyor ve prova o sürüme ait sayılmıyor; gerçek yayın açılırken
prova eşleşmesi kaynaktan bağımsız özetle yapılmalı; (c) akış (SSE) vekil
sunucuda tamponlanırsa ekran 3 sn'lik yoklamaya düşer.
**Sıradaki:** canlı tur (sohbetle SITE taslağı → prova → test kipi), sonra
Kontrol Merkezi (İP-27…30), form şablonu, Google kapıları (İP-05, 07, 08).

**Reklam oluşturma (2026-10-07): AYRI MODÜL olarak kuruluyor.**
Kararlar [`bekleyen-kararlar.md`](meta-reklam-brief/tasarim/bekleyen-kararlar.md)
başında: 25 sorunun hepsinde önerilen seçenek + ikinci tur kapsam kararları
(tamamen ayrı modül; Akıllı Boost yeni motora taşınır ama kuralları korunur;
raporda sonuç adları ve atıf). Arayüz taslağı:
[`reklam-olustur-arayuz.html`](meta-reklam-brief/tasarim/reklam-olustur-arayuz.html).
Modülün yeri: `packages/shared/src/reklam/` (niyet kataloğu, adlandırma,
hazırlık tipi), `apps/api/src/modules/reklam/` (`GET /reklam/hazirlik`),
`apps/web/src/reklam/` + `/reklam/yeni` (Acemi akışı önizlemesi, menüde
YOK, Meta'ya yazmıyor). Eski modüllerden içe aktarma iki tarafta testle
yasak. **Derleyici çekirdeği yazıldı** (`packages/shared/src/reklam/`):
para zinciri (`tutarAyristir`, `microsToMinor` kırpmadan hata), bütçe
(`enCokHarcama` tasarımdaki 12.250 TL örneğiyle sınandı), tek hedefleme
üreticisi (`hedeflemeUret`, varsayılansız `advantageAudience`, konut kısıt
haritası, ülke kümesi), `derleMeta()` + manifesto (FORM ve SITE; WHATSAPP
ve diğerleri canlı ölçüm olmadan retle duruyor). Hepsi mutasyonla sınandı.
Ayrıca: geri okuma karşılaştırıcısı (`beklenenYankilar`,
`geriOkumaKarsilastir`), form derleyicisi (KVKK kutuları açıkça false,
yasak soru sözlüğü), taslak tabloları (**MIGRATION VAR**:
`20261007120000_reklam_taslak_cekirdegi` → `reklam_taslagi`,
`taslak_surumu` [değişmez, trigger], `ajans_ayari`) ve uçlar
(`/reklam/taslaklar`, `/reklam/ajans-ayari/atif`). Prova yazılmadığı için
taslak hiçbir zaman `hazir` olmuyor (OK-17 eksiği bilerek).
Panel `/reklam/yeni` artık taslağa bağlı: açık taslak listesi, her seçim
yeni sürüm, eksikler sunucudan, konum Marka Merkezi kitlesinden önden
dolu, özel kategori sorusu (hiçbir şık seçili gelmez, taban kilitli),
bütçe Türkçe tutar girişiyle, süre hesabın saat diliminde, Gözden
geçir'de atıf standardı seçimi (yalnız yönetici). Canlıda tıklanarak
denenmedi (worktree'de `.env` yok).
**Yayın motoru çekirdeği yazıldı** (`modules/reklam/yayin-motoru.ts`,
MIGRATION VAR: `20261007140000_reklam_yayin_motoru` → `yayin`,
`yayin_nesnesi`, `geri_okuma`): medya → form → ağaç PAUSED zincir, her
nesne için önce niyet kaydı; kesin ret / belirsiz sonuç / kayıt düşüşü
ayrı yollar; uzlaştırma (etiket + ad); geri okuma; tekillik kapısı; açma
yukarıdan aşağı; geri alma = arşiv. Meta bir port arkasında; sahte Meta
ile 19 test, mutasyonla sınandı. **Henüz bir uca bağlı DEĞİL.**
Gerçek Graph istemcisi yazıldı (`meta-graf.ts`: kesin/belirsiz hata
ayrımı, oluşturmada `fields` yok, form sayfa token'ıyla, etiket kimliği →
bylabels, token yalnız graph.facebook.com'a) ve erişim katmanı
(`meta-erisim.ts`: token, sayfa token'ı, görsel baytı, hash önbelleği;
eski servisler kullanılmıyor, token YENİLENMİYOR). Kullanıcı kararı:
eski panel/kod referans değil, tek kaynak tasarım belgeleri.
"Meta'ya yazmayı durdur" anahtarı da kuruldu (MIGRATION:
`20261007160000_reklam_yazma_kesici`; tek kapı `metaYazmaAcikMi`, ajans
şirketinin anahtarı müşteri şirketlerini de durduruyor, okunamazsa kapalı;
motorda her yazma kapılı sarmalayıcıdan; uç `PUT /reklam/ajans-ayari/meta-yazma`).
**Motor uca bağlandı — yalnız TEST KİPİYLE.** `POST /reklam/taslaklar/:id/yayinla`
(`bulk.publish`): sıfır çağrılı ön kontrol (sürüm/özet eşleşmesi, taze
eksikler, OK-15 anahtar, OK-16 atıf, OK-01 hesap, tanınmayan kategori
tabanı), derleme, yayın kaydı, kendi kuyruğu `reklam-yayin` (deneme 1),
worker'da işleyici (hesap başına Redis yazıcı kilidi, dolu ise ertele).
Meta provası (OK-17) olmadığı için GERÇEK yayın reddediliyor; test kipi
yalnız ajans yöneticisi ve ajansın kendi şirketindeki hesapta: kurar, geri
okur, AÇMADAN arşivler. Panelde Gözden geçir'in sonunda "Test kipinde
dene" + canlı durum + fark tablosu + "Kaldığı yerden devam / Yeniden
kontrol et / Geri al".
**Meta provası yazıldı** (MIGRATION: `20261007180000_reklam_prova`):
`validate_only` ile, nesne açmadan, her gövde ayrı soruluyor; reklam seti
satır içi kampanyayla, reklam satır içi reklam seti + kreatifle. Hesap
başına 5 dk'da 2. Geçen prova taslağı "hazır" yapıyor; gerçek yayında
OK-17'yi taze (30 dk) prova kaldırıyor. **Gerçek yayın hâlâ kapalı:
uyum denetçisi (bölüm 10) yok** — `yayinBaslat` "UYUM" retiyle duruyor.
Panelde Gözden geçir'in başında prova bloğu (eksik bitince bir kez
kendiliğinden).
**Canlı tur 1 (2026-10-07, v25.0, prova):** kreatif özellik anahtarları
reddedildi — Meta yalnız 7 BÜYÜK HARFLİ anahtar kabul ediyor; derleyici
düzeltildi. "Kitle ve bütçe" provası Meta 5xx ("unexpected error") döndü;
kreatif düzeldikten sonraki provada yeniden bakılacak (satır içi
`campaign_spec` şekli şüpheli).
**Reklam Stüdyosu (kullanıcı kararı 2026-10-07):** `/reklam` — görselleri
bırak, tek cümle yaz; asistan (Opus 5.5, yapılandırılmış çıktı, görseller
modele gidiyor) taslağı kurar, `/reklam/onizleme`de telefon çerçeveli
önizleme + satır içi eksikler + "Onayla" (öneri → kullanıcı kararı), sonra
prova ve test kipi. Model bütçe/süre/adres UYDURAMIYOR (sunucu cümleyle
karşılaştırıyor), kategori sorusunu cevaplayamıyor. `GEMINI_API_KEY`
sunucuda tanımlı olmalı. Menüde değil; eski Reklam Oluştur'un üstünde kart.
**Video (2026-10-07):** Stüdyo MP4/MOV kabul ediyor (en çok 200 MB).
Kapak karesi TARAYICIDA alınıyor (sunucuya video programı kurulmuyor) ve
ayrı görsel olarak yükleniyor; asistan kapağı görüyor. Derleyici video
fikrini `video_data` ile kuruyor (kapak `image_hash`); motor videoyu
yükleyip Meta "hazır" diyene kadar bekliyor (15 dk sınır), prova da öyle.
Migration YOK. Google için sürüm kararı: **v25**.
**Canlı tur 2:** "Kitle ve bütçe" provası satır içi kampanyayla `/adsets`e
sorulunca Meta her seferinde 5xx veriyor; aynı reklam seti reklam
provasının içinde geçiyor. Kapsama kuralı (`kapsamaUygula`): yalnız
belirsiz sonuç ve bütün reklamlar geçtiyse "geçti" + ekranda not.
**Sıradaki:** (1) CANLI TUR devam: ajansın kendi Meta hesabında
SITE niyetiyle test kipi — Meta'nın gerçekte neyi farklı döndürdüğü
normalleştirme tablosunu dolduracak (ilk denemelerin "fark" ile durması
BEKLENEN davranış); (2) uyum katmanı (bölüm 10: profil, katalog, denetçi, değişmez uyum raporu) → gerçek yayın; (3) kuyruk tarayıcısı (§ 11.12: worker ölürse `kuruluyor`da kalan
yayın); (4) form şablonu ekranı. Boost taşıması ve rapor sonuç adları
ondan sonra.
**Acil, bu işten bağımsız:** Meta v26 kuralı 2026-10-27'de bütün sürümlerde
kök `GET /?ids=` isteklerini hataya çeviriyor (rapor PDF görsel tazeleme,
boost özeti) — ayrı oturumda düzeltiliyordu; deploy o tarihten önce.
App Review başvurusu 2026-10-01'den beri incelemede, BV geçiyor
(`DURUM.md` §6'daki "yapılmadı" bayat); ekran kayıtları eksik görünüyor.

"O günden beri ne geldi" sorusunun başlangıç noktası bu belgeyi DEĞİŞTİREN
SON COMMIT — hash buraya elle yazılmıyor (yazılan hash kendi commit'ini
gösteremez ve kayar):
`git log --oneline $(git log -1 --format=%h -- docs/DEVAM.md)..origin/main`.

---

## Son oturumda biten

- **Marka Merkezi Bölüm 1 bitti** (`/marka-merkezi`): hazırlık listesi (6 madde),
  bağlantılar, iki adımlı kaldırma, havuz araması; şirket admini ajansın
  atadığını kaldırabiliyor ama taşıyamıyor, denetim kaydı + ajansa mail,
  "Ajans atadı" rozeti.
- Panel: ortak `components/ui/` bileşenleri; workspace seçilmemişse 13 sayfa
  artık soruyor; Genel Bakış kısaltmalarına Türkçe açıklama.
- Canlı düzeltmeler: "Tüm şirketler" modunda Uyarılar/Senkronizasyon 500'ü;
  Google için yanlış "yetki doluyor" alarmı (`authorization_expires_at`,
  migration); Senkronizasyon sayaçları 1.536 → 457 ms; sayaçlar son 7 gün.
- **LinkedIn'e yapılamayacak işler artık gönderilmiyor** (`queue/platform-isleri.ts`):
  kırılım işi hiç açılmıyor; günlük/gün içi metrik işi LinkedIn'de hesap
  seviyesini atlıyor. İkincisi LinkedIn günlük metriğinin HİÇ gelmemesinin
  sebebiydi. Deploy sonrası bakılacak: son 7 günün düşen iş sayısı inmeli,
  LinkedIn `insights_daily` işleri `succeeded` olmalı.
- **Google kotası ölçüldü: sebep hacim, günlük tavan.** "Günlük" metrik işi
  hesap başına günde ~11 kez koşuyordu; artık dün bir kez çekiliyor.
  Kota dolunca bütün Google işleri Google'ın söylediği süre kadar bekliyor
  (önce yalnızca çarpan hesap 15 dk duruyordu, 1.521 iş düşmüştü).
- **Bölüm 2 bitti:** Marka sekmesi yapılandırılmış alanlarla (sektör,
  kategoriler, sık sayfalar, ana amaç, üslup, vaatler); AI asistan, reklam
  metni ve Hızlı Reklam okuyor (amaç seçili açılıyor, adres listeden).
- **Bölüm 3 bitti:** Görsel Arşivi, Kreatifler, Formlar Marka Merkezi'nde
  "Varlıklar"da (menüden kalktı). Metin şablonları ve zorunlu yasal uyarı:
  uyarı Meta ana metninde yoksa yayın duruyor. Marka renkleri eklenmedi
  (kullanıcı kararı: okuyan özellik yok).
- **Bölüm 4a:** kitle şablonları (yalnızca Meta) Marka Merkezi'nde; Hızlı
  Reklam varsayılanı seçili açıyor. Öncesinde taslak ağacının hedefleme
  üreticisi birleştirildi: şehir seçilince ülke de gidiyordu (= ülke geneli).
- **Bölüm 4c:** ilgi alanları + "Kitleyi tarif et" önerisi (AI yapılandırıyor,
  Meta'da çözülüyor, kullanıcı onaylıyor). Canlıda doğrulanmadı.
- **Bölüm 4b:** Meta özel/benzer kitleler şablonda (dahil/hariç); kitle hesaba
  bağlı, uyuşmazlık yayını durduruyor. Canlıda doğrulanmadı.
- Açık ayrı iş: eski tek reklam yayın yolu özel kategori kısıtını uygulamıyor
  (panel çağırmıyor, uç açık) — işaretlendi.
- Testler: API ve panel yeşil (sayılar son commit mesajında).

Ayrıntı: `DURUM.md` 2026-09-28 ve 2026-09-29 girdileri.

## Sıradaki iş (sırayla)

**Base yeniden düzeni** (kullanıcıyla aşama aşama; taslak tuvali:
claude.ai/artifact/95HsewpAuEupEZ74zoYnyC). Aşama 1 bitti (kimlik + iskelet,
`DURUM.md` 2026-10-06); ardından hazırlık şeridi, Aylık Bütçe Base'e ve
Genel Bakış bütçe kartı; Bağlantılar iki karta (reklam hesapları / sayfalar)
indi, Aylık Bütçe tablosu mecraya göre gruplu, giriş ekranı yeni logoda.
Marka, Kitleler ve Varlıklar bölümleri tarayıcıda gezilip düzeltilecek
(oturum kapalıydı). Deploy sonrası gezilip kullanıcıdan revize alınacak;
sonra **Aşama 2: Marka bölümü** (gruplanmış kartlar, "Siteden doldur" alan
alan, kaydedilmemiş değişiklik çubuğu), Aşama 3: Varlıklar/Kitleler, Aşama 4:
Bağlantılar + ekip kartı, Aşama 5: Koruma kuralları.

**Rapor maili "Doğrulama hatası":** deploy sonrası yeniden denenince ekran
reddedilen alanı yazacak; ona göre kök düzeltme.

**Rapor yavaşlığı:** kök düzeltme yazıldı (rapor sorguları dizi süzgecine
geçti; dailySeries 6,4 sn → 0,6 sn ölçüldü). Deploy sonrası: Raporlar ekranı
açılmalı; `olcum-rapor` arka planda (`nohup ... > /tmp/olcum-rapor.txt &`)
yeniden koşturulup topAds'in süresine bakılmalı.

**BASE brief (`Advetics-Marka-Merkezi-BASE-gelistirme-brief.pdf`, 7 aşama):
Aşama 0 sürüyor.** Ajans yöneticisi turu yapıldı, 6 hata düzeltildi
(`DURUM.md` 2026-10-05). Kitle önerisi canlıda çalışıyor (sebep şemaydı). Kalan: (b) reklam
yöneticisi ve müşteri rolleri — kullanıcı giriş yapınca; (c) yazma
kontrolleri (Marka kaydet, siteden doldur, kitle şablonu, varlık yükleme,
hesap ekle/kaldır) — test workspace'i ve onay bekliyor. Aşama 1'in test
şartı (testing-library) depo kararıyla çelişiyor: **kullanıcı kararı bekliyor.**

0. **Genel Bakış "Reklam Hesapları" deploy sonrası gözle:** bir workspace
   aç → Reklam Hesapları (mecra ikonu + workspace adı) → hesap → kampanya →
   set → reklam; ekmek kırıntısıyla geri çık. LinkedIn hesabı satırının
   rakamlı geldiğine, izlenmeyen hesabın "İzlenmiyor" yazdığına bak.
1. **Google kota doğrulaması GEÇTİ** (2026-10-01): günlük iş hesap başına
   1/gün, kota hatası 0. Çağrıların %84'ü gün içi işiydi; kullanıcı kararıyla
   Google'da **saatlik** (deploy bekliyor). Deploy'dan bir gün sonra
   `olcum-google-kota -- --gun=1`: `insights_realtime` hesap başına ~24/gün,
   toplam ~7.000. `rateScope` gövde kontrolü kota hatası görülünce yapılacak.
2. ~~İlgi alanı büyüklüğü dünya geneli~~ **etiketlendi** (2026-09-29, deploy
   bekliyor). Ülkeye göre sayı (`delivery_estimate`) istenirse ayrı iş.
3. **Tasarım deploy sonrası:** gerçek sayfaları gez (pencereler, yoğun
   tablolar, Genel Bakış, Raporlar, Akıllı Boost) ve kullanıcının beğenisini
   al; sonraki tur buna göre.
   4d deploy sonrası: şablonlu ön ayarla ilk boost Ads Manager'da ilgi ve
   hariç kitleyle GÖZLE kontrol. Bölüm 4'ün kalanı (uzman mod, çok hesaplı
   kitle seçici) reklam oluşturmaya ait → dondu.
4. **Bölüm 5 — Koruma kuralları** (`BASE-PLANI.md`).
5. Açık ayrı iş (öneri kartı açıldı): eski tek reklam yayın yolu
   (`ad-publisher.service.ts`) özel kategori kısıtını uygulamıyor.

Bölüm 2, 3, 4 ekranları **tarayıcıda açılıp bakılmadı** — bir sonraki oturumun
başında kullanıcıya Marka sekmesi, Varlıklar, Kitleler ve "Kitleyi tarif et"
için bir göz attırmak iyi olur.

## Kullanıcı kararı bekleyen

- Açılış sayfası hâlâ "Yalnızca Meta ve Google Ads" diyor; gizlilik politikası
  LinkedIn'den söz etmiyor. **Hukuki metne onaysız dokunulmaz.**

## Araçlar

- Canlı ölçüm (salt okunur, sunucuda `advetics` kullanıcısıyla):
  `cd ~/htdocs/advetics.com && pnpm --filter @advetics/api olcum-senkron -- --eposta=<kullanıcı e-postası>`
