# Genel uygulama denetimi — 2026-10 (HEAD 4b5aed2a)

Altı salt okuma denetimi (AdvCampaign, rapor/kural, bağlantılar/kuyruk, panel,
güvenlik, AdvStrategy/Boost/Leads/Bütçe) + canlı veritabanı okuması. Hiçbir
bulgu düzeltilmedi; her biri kullanıcı onayıyla tek tek ele alınacak.
Güven: (k) kesin, (o) olası. Yollar kaynak dosyasıyla birlikte; ayrıntılı
senaryolar denetim raporlarında.

## A · KRİTİK — para, veri kaybı, güvenlik

| No | Bulgu | Yer | Güven |
|---|---|---|---|
| A1 | Lead mutabakatı hiç zamanlanmamış; kaçan potansiyel müşteri kalıcı kaybolur | `queue/sync-queue.service.ts` `installSchedules` (`leads_reconcile` yok) | k |
| A2 | Aynı onaylı boost iki yoldan eşzamanlı işlenirse Meta'da çift kampanya, çift harcama | `boosts/boost-executor.service.ts:316-353, 434-438` | o |
| A3 | Kural "bütçe artır" 6 saatlik bayat ayna bütçesinden hesaplanıyor (500→100 indirilmiş bütçeye +%20 = 600) | `rules/rules.service.ts:431-447, 534`, `meta.provider.ts:1574` | k |
| A4 | Kurallarda "Şimdi çalıştır" platform yazmasını transaction içinde yapıyor; 5 sn aşılınca eylem yapılmış, kayıt silinmiş, saatlik tur tekrarlar | `rules/rules.controller.ts:137` | k |
| A5 | Herkese açık `POST /auth/register`: başkasının e-postasıyla şirket açılıp kurbanın girişi kilitlenir, parola sıfırlama saldırgana gidebilir | `auth/auth.controller.ts:75`, `auth.service.ts:90-166` | k |
| A6 | Üst hesapta yönetici olmayan ama ev şirketinde admin olan çalışan, kardeş şirketlerde kendini admin yapıp workspace taşıyıp şirket silebilir | `tenancy/members.service.ts:379-495`, `manager-account.service.ts:697,775,840,1027` | o |
| A7 | Giriş/kayıt/parola sıfırlamada hız sınırı yok (parola deneme, mail bombardımanı) | `app.module.ts:108`, `auth.controller.ts` | k |
| A8 | SMTP ayarı ile iç ağ/VPS portu tarama (müşteri rolü dahil), hata metni ekrana dönüyor | `email/email-account.controller.ts`, `email-account.service.ts:203-237` | k |
| A9 | Bütçe ve harcama para birimine bakılmadan bölünüyor/toplanıyor (USD hesaba TRY bütçe: kural hiç tetiklenmez ya da yanlış durdurur; şemsiye bütçe karışık toplar) | `budgets.service.ts:161,351,378`, `rules.service.ts:713-740` | k |
| A10 | Rapor aynı platformdaki USD+TRY hesapları topluyor, `MAX(currency)` ile yanlış toplam müşteriye gidiyor | `reports/reports.service.ts:1144-1160` | k |
| A11 | Stratejiden aktarımda bütçe para birimi taşınmıyor: TRY planı USD Meta hesabına aynen gider (10.000 ₺ → 10.000 $) | `strateji/v2/rehber-esleme.ts`, `rehber/alanlar.ts:210` | o |

## B · YÜKSEK — özellik çalışmıyor ya da yanlış sonuç

| No | Bulgu | Yer | Güven |
|---|---|---|---|
| B1 | Kural, bütçe ayı, zamanlanmış rapor UTC gününden: TR 00–03 arası yanlış gün/ay; ayın 1'inde önceki ayın oranıyla kampanya durdurma, "geçen ay" raporu iki ay önceyi gönderir | `rules.service.ts:134,706,913`, `rapor-plani.service.ts:395`, `budgets.service.ts:236`, `genel-bakis.service.ts:298`, `leads.service.ts:322` | k |
| B2 | Kural ROAS'ı yer tutucu değeri ayıklamıyor; panel "—" derken kural 0,01 görüp sağlıklı kampanyayı durdurur | `rules/rule-evaluator.ts:173` vs `deriveRoas` | k |
| B3 | Kural tur sınırı yazılamayan Google/LinkedIn eylemlerine harcanıyor; durdurulması gereken Meta kampanyası atlanır | `rules.service.ts:425-559` | k |
| B4 | Bağlantı `error` durumuna düşünce kendiliğinden düzelmiyor (token geçerliyken de düşebiliyor); bağlantıdaki tüm hesapların verisi kalıcı durur | `token-vault.service.ts:246,306`, `connections.service.ts:1526` | k |
| B5 | Boost `creating`te kalırsa çıkış yok: gönderi bir daha boostlanamaz | `boost-executor.service.ts:429,590` | k |
| B6 | AdvCampaign yayını worker ölünce "Sürüyor"da sonsuza kadar kalır (Meta/Google'da PAUSED kampanya olabilir) | `reklam/yayin-motoru.ts:221`, `google-yayin.ts:1062`, `worker.ts:262` | k |
| B7 | `kayit_belirsiz` durumundan çıkış yok, panelde düğme yok | `yayin-motoru.ts:269,309`, `yayin.ts:123` | k |
| B8 | `bekletildi` panelde ölü uç; Google'da sunucu da devam etmeyi reddediyor (kalıcı kilit) | `adim-kontrol.tsx:655`, `yayin.service.ts:23`, `google-yayin.ts:1210` | k |
| B9 | Meta veri silme geri çağrısı ajans bağlantısını silip bütün şirketlerin reklam verisini zincirleme silebilir (ÜRÜN KARARI gerekir) | `connections/meta-webhook.service.ts` `handleDataDeletion` | o |
| B10 | Leadgen webhook sayfayı şirketten bağımsız buluyor: kişisel veri yanlış workspace'e ya da düşer | `leads/leadgen-webhook.service.ts:225-233` | o |
| B11 | Lead mutabakat imleci sayfa sınırında eski kayıtların üstünden atlıyor | `queue/lead-sync.service.ts:333-360` | o |
| B12 | Kota reddi `lead_fetch` denemelerini tüketiyor; kampanya başında lead kalıcı `failed` | `lead-sync.service.ts:599-611` | o |
| B13 | "Takılmış iş" değiştirilince eski `sync_jobs` satırı sonsuza açık kalıyor, toplu tazeleme çubuğu durur; canlıda 85 satır Eylül'den beri açık | `sync-queue.service.ts:157-180` + üretim verisi | k |
| B14 | Rapor: LinkedIn özet kartı "Google Ads" etiketiyle; LinkedIn kampanyaları hiçbir tabloya girmiyor | `reports.service.ts:1176, 642` | k |
| B15 | Girişte açık yönlendirme (`next` süzülmüyor) | `login-form.tsx:14,65`, `iki-adim-giris.tsx:76,185` | k |
| B16 | "Beni hatırla" fiilen 15 dk: sekme kapalıyken oturum yenilenmiyor, giriş sayfası yenileme çerezini denemiyor | `middleware.ts:136`, `oturum-tazeleyici.tsx` | o |
| B17 | Workspace değişince eski `plan`/`hesap`/`kampanya` adreste kalıyor; AdvStrategy eski workspace'in planını açık tutuyor | `kapsam-secici.tsx:235`, `strateji/page.tsx:109`, `ads-explorer/page.tsx:162` | k |

## C · ORTA

| No | Bulgu | Yer |
|---|---|---|
| C1 | "Sitemiz yok" kapısı panelde var, sunucu eksik listesinde yok: kullanıcı görmediği Google yüzünden kilitlenir | `rehber-mantik.ts:358`, `hazirlik.ts:288`, `rehber.service.ts:1707` |
| C2 | Form geri okuması "okunamadı" çıkarsa kurulum hiç tamamlanmıyor | `yayin-motoru.ts:277,323` |
| C3 | Panel `kismen_acik`/`sonuc_belirsiz`/`kayit_belirsiz`e "Kurulamadı" deyip "Aynı içerikle yeniden kur" sunuyor (mükerrer kampanya) | `rehber-mantik.ts:713`, `adim-kontrol.tsx:666` |
| C4 | Meta geri alma kopyaları aramıyor (Google arıyor) | `yayin-motoru.ts:404` |
| C5 | "7 gün"/"30 gün" seçeneği 8/31 gün kuruyor | `adim-butce.tsx:32`, `butce.ts:49` |
| C6 | Video durumu hatası yutuluyor, mesaj olmayan düğmeyi tarif ediyor | `yayin-motoru.ts:141,257` |
| C7 | Panel `iletildi`yi "Yayında" gösteriyor, sonrası izlenmiyor | `rehber-mantik.ts:718` |
| C8 | Boost "sonraki turda denenecek" diyor, hiç denenmiyor | `boost-executor.service.ts:400` |
| C9 | Meta erken yenileme pencerede her çağrıda tekrarlanabilir | `token-vault.service.ts:135` |
| C10 | 90 günlük geçmiş, gün içi metrik damgası yüzünden yeniden kuyruğa girmiyor | `sync-processor.service.ts:1155` |
| C11 | Meta 90 günlük veri erişimi bitişi izlenmiyor | `meta.provider.ts:472` |
| C12 | Akıllı Boost ilk çekim damgası ön ayar başına; ikinci profil ilk çekimi almıyor, yeni profilde mail selâsı | `autoboost-queue.service.ts:190` |
| C13 | Strateji kaynak rozetleri kaydedilince "ajans"a dönüyor | `strateji-v2.service.ts:704,1336` |
| C14 | Strateji öğrenme tabanı kontrolü platform payını hesaba katmıyor | `strateji/v2/motor.ts:419` |
| C15 | Revizyon sürüm artırmadan aynı belge yeniden onaylanabiliyor | `strateji/v2/durum.ts:39` |
| C16 | Aktarımda başlangıç kayınca toplam bütçe kısalan döneme sıkışıyor | `rehber-esleme.ts:203` |
| C17 | "Tüm şirketler" modunda kardeş şirketin lead'leri boş | `leads.service.ts:203,232,246,315` |
| C18 | Hazırlamanın AI ile doldurduğu marka alanları işletme beyanı gibi görünüyor | `hazirlama.service.ts:296` |
| C19 | Bütçe ekranı workspace'ten ayrılan hesabın bütçesini sayısını söylemeden gizliyor | `budgets.service.ts:378` |
| C20 | Rapor, izlemesi kapatılmış hesabın geçmişini sessizce dışarıda bırakıyor | `reports.service.ts:548` |
| C21 | İyileştir yorgunluk önerisinde frekans şişebiliyor | `iyilestir/oneri-hesap.ts:95` |
| C22 | Rapor paylaşım ve onay bağlantısı token'ı log'a maskesiz düşüyor | `common/mask-path.ts` |
| C23 | `siteOku` portu denetlemiyor (sunucunun yönetim portlarına istek) | `tenancy/site-oku.ts:39` |
| C24 | `?musteri=` seçiciyle çelişince sayfalar farklı davranıyor | `lib/sayfa-workspace.ts` ve 7 sayfa |
| C25 | Uyarı bandı ve zil müşteri rolüne yetkisi olmayan eylem bağlantıları gösteriyor | `alerts/uyari-kurallari.ts`, `uyari-bandi.tsx:298`, `bildirim-zili.tsx:271` |
| C26 | Genel Bakış bütçe kartı müşteriyi kaydedemeyeceği Aylık Bütçe'ye gönderiyor | `genel-bakis-kartlari.tsx:184` |
| C27 | Hesap listesi okunamazken "Kural ekle" açık, kural bütün hesaplara uygulanır | `kurallar-icerik.tsx:68` |
| C28 | Yutulan hatalar: Akıllı Boost abonelik sağlığı, Potansiyel Müşteriler form/kayıt listesi, Reklam Yöneticisi "Tüm zamanlar" | `bildirim-havuzu.tsx:224`, `potansiyel-musteriler/page.tsx:69,85`, `ads-explorer/page.tsx:136` |
| C29 | Reklam Galerisi bağlantısı tarih ve platform süzgecini düşürüyor | `ads-explorer/page.tsx:570` |
| C30 | Üst bar ve kenar çubuğunda ev şirketi yazıyor, aktif şirket değil | `(dashboard)/layout.tsx:134,216` |
| C31 | Oturum adresi sorgu dizesini kaybediyor (bağlantıdan gelen plan açılmıyor) | `middleware.ts:136` |
| C32 | Geçersiz çerezle `/login`↔`/dashboard` yönlendirme döngüsü (olası) | `lib/session.ts`, `middleware.ts` |
| C33 | Canlıda 23 izlenen hesapta 3 gündür metrik yok (5 Meta, 15 Google, 3 LinkedIn) — kopuk mu harcamasız mı ayrılmalı | üretim verisi |

## D · DÜŞÜK

| No | Bulgu |
|---|---|
| D1 | Bağlantı kaldırma yalnız aktif workspace'in hesaplarını kapatıyor (`connections.service.ts:3065`) |
| D2 | `recordFailure` sayacı yarışa açık (`token-vault.service.ts:233`) |
| D3 | Taşıma sırasında koşan metrik işi eski müşteriye yazabilir (`insights-sync.service.ts:136`) |
| D4 | Kurulum ve hazırlama kilidi süreç içi (`kurulum.service.ts:508`, `hazirlama.service.ts`) |
| D5 | Müşteri rolü 90 günlük backfill'i tekrar tekrar tetikleyip kota yakabilir (`sync.controller.ts:752`) |
| D6 | `GET /health/rls` her oturuma şema bilgisi dönüyor |
| D7 | 200 MB yüklemeler belleğe alınıyor (paylaşımlı VPS) |
| D8 | Strateji: başlamamış kalem "yayına alınmadı"; panel onayı açık bağlantıyı iptal etmiyor; tanıtım tabanı yanlış gerekçe |
| D9 | Lead: iletişimsiz kayda yanlış not |
| D10 | Kırılımlarda izlenmeyen hesap süzgeci yok; video hata listesi elle yazılmış |
| D11 | Yetkisiz Ayarlar sayfaları açıklamasız Genel Bakış'a atıyor |
| D12 | Marka Merkezi bölümü şirket değişiminde korunmuyor |
| D13 | Üst barda paket kodu İngilizce ("enterprise") |
| D14 | Panel metinlerinde uzun tire ve teknik terim (webhook, token) |
| D15 | Rapor bileşenlerinde kılavuz dışı renk (amber, slate) |
| D16 | Ölü genel yol `/davet`; `/cozumler` liste sayfası yok |
| D17 | "Yeni workspace kur" düğmesi farklı izin okuyor |
| D18 | Strateji görsel seçicisi VİDEO kalemine görsel ekletiyor |
| D19 | Canlıda Meta organik gönderi çekimi birkaç sayfada sürekli "unexpected error" |
