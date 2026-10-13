# Birleşik kurulum sihirbazı — mimari (Ajan 1)

**Tarih:** 2026-10-13 · **Durum:** taslak ([`taslak.html`](taslak.html))
KULLANICI TARAFINDAN ONAYLANDI; sözleşme YAZILDI (Ajan 1 ikinci tur, § 6),
shared derlemesi temiz, API + panel typecheck ve testleri yeşil. Sıradaki:
Ajan 2 ‖ Ajan 3 (§ 9). **Bu sözleşme commit'i API'siz CANLIYA ALINMAZ**
(§ 6 "Geçiciler": yeni hazırlık maddeleri sunucuda yokken Marka Merkezi
üç adımı "okunamadı" gösterir).

**İstek (kullanıcı, aynen):** *"kurulum sihirbazı yapmanı istiyorum senden
hepsini birleştir bu sihirbazı çalıştırdığımızda şirketin ve workspacein hiç
bi eksiği kalmasın"*.

**Bugün parçalı olan:** `/kurulum` (Yeni şirket / workspace aç: üst hesap,
şirket, bağlantılar, workspace, hesaplar), Marka Merkezi › Kurulum (7 adım,
`KURULUM_LISTESI`), Workspace bilgileri (firma, iletişim, rapor alıcıları,
adres + konum), Ekip, Bağlantılar, hazırlama (AI ile marka), "Eksikleri
tamamla". Bir workspace'in "bitti" olup olmadığını hiçbir ekran bütünüyle
söylemiyor: Marka Merkezi'nin sayacı "7 / 7" derken rapor alıcısı boş,
bildirim kanalı yok ve hiç veri gelmemiş olabiliyor.

**Ana karar:** sihirbaz YENİ BİR TANIM DEĞİL. Tanım tek: `KURULUM_LISTESI`
(workspace) genişler + yeni `SIRKET_KURULUM_LISTESI` (şirket). Sihirbaz bu
iki listenin **adım adım yürütücüsü**, Marka Merkezi › Kurulum aynı listenin
**liste görünümü**. Sayaç (`kurulumSayaci`) ikisinde de aynı fonksiyon. İki
ekranın ayrı tanım taşıması, bu modülün çözmek için doğduğu üç-sayaç
hatasının (panel-sadeleştirme Ç-6) dördüncü kopyası olurdu.

---

## 0. Kullanıcı kararları 2026-10-13

1. **Taslak onaylandı** (üç ekran: başlangıç, ortadaki adım, son kontrol).
2. **"Web sitemiz yok" beyanı VAR** — Dönüşüm ölçümü ve Meta pikseli
   adımlarını kapsam dışı bırakır; o workspace'te AdvCampaign'in site
   isteyen amaçları kapanır. Sözleşmede TEK yardımcı:
   `packages/shared/src/kurulum/site-yok.ts` (`siteYokMu`,
   `siteYokRehberKapisi`, `SITE_YOK_KAPSAM_DISI_ADIMLAR`). "Site isteyen"
   ikinci kez yazılmadı: rehberin kendi adres kuralı (`adresAlani`)
   "zorunlu" diyorsa kapalı — bugün Meta'da SITE ve SATIS, Google'da
   karşılığı olan HER amaç (Google'ın her kurgusu nihai adres istiyor).
   Site adresi ve site taraması parçaları da kapsam dışı; "Eksikleri
   tamamla" site işlerine (konteyner, mülk, etiket, piksel) dokunmaz —
   beyan OKUNAMADIYSA da dokunmaz (belirsizde Tag Manager kurmak
   pahalı). AdvCampaign tarafı Ajan 3'te (§ 9).
3. **İki adımlı doğrulama: yöneticinin "zorunlu tutmuyoruz" beyanı
   yeterli** (`SIRKET_BEYAN_OGELERI = ['iki_adim']`).

## 1. Çelişki tablosu (istek ↔ depo kuralları) ve önerilen kararlar

| # | İstek | Depo gerçeği / kuralı | Önerilen karar |
|---|---|---|---|
| Ç-1 | "Hiç eksiği kalmasın" | Ödeme yöntemini Meta da Google da API'den EKLEMİYOR (kurulum Ç-2) | Ödeme adımı `kullanicida`: sihirbaz platformun ödeme sayfasını açar, döndüğünde "Kontrol et" ile durumu OKUR. Okunmadan "tamam" denmez; **beyanla da kapatılamaz** (ödemesiz hesapta reklam yayınlanmaz, "kapsam dışı" demek yalan olur). |
| Ç-2 | Şirket kurulumunda platformlar bağlansın | "AJANSIN BAĞLANTISI BİR KEZ KURULUR": aynı ajans kimliğini şirket başına yeniden yetkilendirmek önceki token'ı geçersiz kılıp bağlantıları koparıyor. RLS (`adv_connections_select` → `app.havuz_kapsaminda`) ajans havuzunu bütün kardeş şirketlere zaten açıyor | Şirket adımı ajans bağlantısını GÖRÜYORSA "Ajansın bağlantısı kullanılıyor · tamam" der ve **"Bağla" düğmesi çizilmez**. "Bağla" yalnız iki hâlde: hiç görünür bağlantı yoksa ya da şirket kendi bağlantısını kurmayı SEÇERSE (`hesap_sahibi = 'sirket'`). Yetkisi düşmüş ajans bağlantısında şirket ekranı yeniden yetkilendirme sunmaz, ajansa yönlendirir. **KESİNLEŞTİ (2026-10-13, kaynak okundu, HEAD a11ca4a6):** `ConnectionsService.list` PARAMETRESİZ çağrıda yalnız `status <> 'revoked'` süzüyor, şirket süzgeci RLS'te (`havuz_kapsaminda` = kendi + ajans şirketi) → ajansın bağlantısı müşteri şirketinde GÖRÜNÜYOR, `sahip: 'ajans'` ile. `/kurulum` sayfası zaten parametresiz çağırıyor. Aynı kimliği müşteri şirketinde yeniden bağlamak artık sunucuda REDDEDİLİYOR (`ayniKimlikBaskaSatirda`), "Ölçüm izinlerini ver" hedefli `reauthorize` ile ajansın satırını tazeliyor (`oauth_states.target_connection_id`). Kalan iki tuzak sözleşmede yazılı (`sirket-kurulum-listesi.ts`): (a) `?clientId=` dalı yeni workspace'te ajans bağlantısını GİZLER (bağlantıyı "atanmış hesabı olan" diye süzüyor) — S1 girdisi parametresiz listeden; (b) üst hesap üyeliği olmayan kullanıcıda `sahip` hep `'sirket'` — TAMAM kararı `sahip`e bakmıyor. `kurulum-akisi.ts`teki "yeni şirkette yeniden bağlanmak zorunda" yorumu ESKİDİ; Ajan 3 düzeltir. |
| Ç-3 | Ölçüm tamamen kurulsun | Başkasının yayınlanmamış Tag Manager sürümü YAYINLANMAZ (kurulum § Güvenlik); site koduna Advetics yazamaz | Etiket adımı bu hâlde `hata` + platformun/konteynerin durumu ("Default Workspace'te 3 yayınlanmamış değişiklik var") + "Tag Manager'da aç" + "Tekrar dene". Site kodu `kullanicida`: kod gösterilir, geliştiriciye e-posta, "Siteyi tekrar tara". Yayın asla zorlanmaz. |
| Ç-4 | Her şey otomatik | Gerçek hesap AÇMAK, Google Ads birincil dönüşüm (harcamalı hesapta), Tag Manager YAYINI geri dönüşsüz/para etkili | Bu üçü hiçbir "Otomatik yap"ta yok; kendi onay penceresiyle (ne olacağı, geri alınamadığı yazılı). Otomatik kapsam `eksikleriTamamlaKapsami`ndan gelir, genişlemez. |
| Ç-5 | Veri senkronu başladı mı kontrol edilsin | Panel-sadeleştirme Ç-7 `veri_akisi`ni sayaçtan bilerek çıkardı ("bir durum, iş değil") | **Kısmi tersine çevirme:** `veri` adımı sayaca girer. Gerekçe değişti: atama izlemeyi otomatik açıyor (§5 "ATAMA İZLEMEYİ DE AÇIYOR"); hesap atanmışken veri yoksa bu bir ARIZA ve "atadım, veri gelmiyor" bu projenin en sık sessiz hatası. İlk çekim sürerken `bekliyor` (eksik değil, nedeni yazılı). `aylik_butce` için Ç-7 AYNEN geçerli: sayaca girmez (her ayın 1'inde bütün workspace'ler "eksik" derdi); son ekranda isteğe bağlı bağlantı. |
| Ç-6 | Rapor gönderen e-posta | `user_email_accounts` KİŞİYE ait ve RLS satırı yalnız sahibine gösteriyor; "satır yok" ≠ "göremiyorum" | Sayaca GİRMEZ. Son ekranda yalnız sihirbazı kullanan kişi için üç hâlli bilgi satırı (`true` doğrulanmış / `false` yok / `null` bilinmiyor) + Hesabım bağlantısı. Başkasının durumu için uyarı üretilmez. |
| Ç-7 | Açılış sihirbazı hesap atıyor (`/clients/setup` `adAccountIds`) | "HER PROJENİN KENDİ HESAPLARI": workspace başına bir Meta + bir Google hesabı; kurulumun `meta_hesap`/`google_hesap` adımları zaten mevcut ata / yeni aç yapıyor | Açılış artık yalnız şirket ve workspace AÇAR (`/clients/setup`, `adAccountIds: []`, kategori dahil); hesaplar kurulum adımlarından tek yoldan atanır. İki atama yolu ayrışırdı. Ek hesap/kanal (LinkedIn, YouTube, ikinci hesap) Marka Merkezi › Kurulum `#kanallar` bloğunda kalır, sayaca girmez. **Ölçülmedi:** kurulumun `sayfa` adımı sayfaya boost hesabını bağlıyor mu (açılışın `boostKarari` mantığı); bağlamıyorsa Ajan 2 ekler, yoksa Akıllı Boost "bağlı reklam hesabı yok" der. |
| Ç-8 | Mevcut workspace'i tamamla | Kurulum yazmaları aktif workspace şartı (`kurulum.service.ts#erisim`), ve otomatik `switch-client` YASAK (B1: seçim bütün sekmeleri etkiler) | Başlangıç ekranında workspace'i SEÇMEK açık bir geçiş eylemidir; düğme "Ege Birlik Yapı · Narlıdere'ye geç ve tamamla" der. Sihirbaz adresteki workspace oturumdakinden farklıysa içerik okumaz, `WorkspaceGec` gösterir (mevcut desen). Açılışta yeni workspace kurulunca `switch-client` HER YAZMADAN ÖNCE (14d'deki `AiDoldur` kalanı burada kapanır). |
| Ç-9 | `/kurulum` adı | Ç-17 adı "Yeni şirket / workspace aç" yaptı, "Kurulum" ile karışmasın diye | Ad **"Kurulum sihirbazı"** (`SIHIRBAZ_ADI`). Karışma sebebi kalktı: iki ekran artık AYNI listenin iki görünümü. "Yeni şirket / workspace aç" (`ACILIS_ADI`) başlangıç ekranındaki kartın adı olarak kalır. Adres `/kurulum` değişmez. |
| Ç-10 | Bunu kullanmıyorum | Bugün yalnız platform beyanı var (`kullanilmayan_platformlar`) | Yeni, DAR beyan listesi (§ 5): yalnız iş için gerçekten isteğe bağlı olan öğeler. Ödeme, hesap, piksel, ölçüm, marka, varsayılanlar, veri BEYANLA KAPANMAZ. |

---

## 2. "Hiç eksiği kalmaması"nın TAM TANIMI

Lejant — **Yapan:** `oto` sistem tek tıkla / "Otomatik yap" yapar · `ai` hazırlama
(site taraması + AI) doldurur, kullanıcı onaylar · `seç` kullanıcı seçer ·
`kul` kullanıcı platformda yapar (sistem okuyup doğrular) · `gir` kullanıcı
yazar. **⚠** para harcar ya da geri dönüşsüz → onay penceresi, hiçbir
otomatikte yok. **Sayaç:** `S` sayaca girer, `B` beyanla kapsam dışı
bırakılabilir, `—` sayaca girmez (gösterilir).

### 2a. ŞİRKET (`SIRKET_KURULUM_LISTESI`, 2 adım)

| Adım · parça | Tamam koşulu (nasıl ölçülür) | Yetki (panel kapısı) | Yapan | ⚠ / platform dışı | Sayaç |
|---|---|---|---|---|---|
| **S1 Platform bağlantıları** · Meta | Şirkette görünen `status = 'active'` bir Meta bağlantısı var (ajansın ya da şirketin kendi; `platformDurumu`'nun `bagli` hâli). `ayarsiz` → hata ("Advetics ekibine haber ver"), `yeniden` → hata (sahibine göre metin, Ç-2), `yok` → eksik | `baglanti.yetkilendir` | `seç` (ajans mı kendi mi) + OAuth | OAuth (platform sayfası) | S (Meta kullanılıyorsa) |
| S1 · Google | Aynısı Google için. Ölçüm izni (Tag Manager + Analytics kapsamı) burada DEĞİL, workspace'in `google_izin` parçasında (izin workspace'in SEÇİLİ bağlantısına artımlı eklenir — paralel ajanın düzeltmesi varsayıldı) | `baglanti.yetkilendir` | aynı | OAuth | S (Google kullanılıyorsa) |
| S1 · LinkedIn | Gösterilir, sayılmaz (kurulum listesi Meta/Google; LinkedIn'de yazma yolu yok) | — | — | — | — |
| **S2 Ekip ve güvenlik** · İki adımlı doğrulama | Şirkette 2FA zorunluluğu AÇIK, ya da yönetici "zorunlu tutmuyoruz" diye beyan etti (açık soru 2) | `ikiAdim.sirketZorunlulugu` | `seç` | — | S, B |
| S2 · Ekip daveti | Gösterilir: şirketteki kişi sayısı + "Kişi ekle" (Ayarlar › Ekip). Tek kişilik şirket meşru; sayılmaz | `ekip.yonet` | `gir` | — | — |
| S2 · Rapor gönderen e-posta | Ç-6: yalnız sihirbazı kullanan kişinin kendi hesabı, üç hâlli | herkes (kendi) | `gir` | SMTP doğrulama | — |

Şirket adı ve kısa adı şirket VARSA zaten doludur (açılış zorunlu alan);
ayrı adım değil, başlıkta yazar.

### 2b. WORKSPACE (`KURULUM_LISTESI`, 7 → 10 adım)

Yeni adımlar **kalın**. Var olan yedi adımın parçaları DEĞİŞMİYOR
(`packages/shared/src/panel/kurulum-listesi.ts`).

| # | Adım · parça (kaynak:kod) | Tamam koşulu | Yetki | Yapan | ⚠ / platform dışı | Sayaç |
|---|---|---|---|---|---|---|
| 1 | **Workspace bilgileri** (`bilgiler`) · hazırlık:`site_adresi` (YENİ) | `clients.website` dolu ve `https` (`siteAdresiDuzelt` girişte) | `firma.yaz` | `gir` | — | S |
| | · hazırlık:`iletisim` (YENİ) | `contact_name` ve `contact_phone` dolu (telefon WhatsApp/arama dönüşümü ve rehberin önden doldurması için) | `firma.yaz` | `gir`, `ai` öneri (ölçülmedi) | — | S |
| | · hazırlık:`rapor_alicisi` (YENİ) | `contact_emails` en az 1 adres | `firma.yaz` | `gir` | — | S |
| | · hazırlık:`adres` (YENİ) | `address` + `address_coordinates` dolu (rehberin "adres konumu" eksiği bununla kapanır) | `firma.yaz` | `gir` (harita) | — | S, **B** ("fiziksel adresimiz yok") |
| | · vergi dairesi / no, IBAN, notlar | Gösterilir, sayılmaz (fatura belgesinde gerekiyorsa orada sorulur) | `firma.yaz` | `gir` | — | — |
| 2 | Meta reklam hesabı ve ödeme (`meta`) · `meta_hesap`, `meta_odeme` | Hesap atanmış; ödeme: `account_status` aktif + `funding_source_details` dolu (okunarak) | `kurulum.hesap` | `seç` ⚠ (yeni hesap açmak) ; ödeme `kul` | ⚠ hesap açma · ödeme platform dışı | S (Meta) |
| 3 | Facebook sayfası ve Instagram (`sayfa`) · `sayfa` | Sayfa atanmış (+ bağlı IG); sayfa API ile AÇILAMAZ | `kurulum.hesap` | `seç` (tek sayfa varsa `oto`, havuzda asla) | sayfa açma platform dışı | S (Meta) |
| 4 | Meta pikseli (`piksel`) · `meta_piksel`, hazırlama:`piksel` | Piksel seçili/açık; iki aday varsa soru cevaplı | `kurulum.yaz` | `oto` / `seç` | — | S (Meta) |
| 5 | Google Ads hesabı ve ödeme (`google`) · `google_hesap`, `google_odeme` | Hesap atanmış; `billing_setup` onaylı (okunarak). Davet yolunda şirketin kabulü beklenir (`kul`) | `kurulum.hesap` | `seç` ⚠ ; ödeme `kul` | ⚠ hesap açma · ödeme ve davet kabulü platform dışı | S (Google) |
| 6 | Dönüşüm ölçümü (`olcum`) · `google_izin`, `gtm_konteyner`, `ga4_mulk`, `ads_donusum`(G), `ga4_ads_bag`(G), `gtm_etiket`, `site_kodu`, `dogrulama`, hazırlama:`olcum` | Her parça `tamam`; `dogrulama` = canlı olay GA4 anlık rapor + Meta piksel istatistiğinde görüldü | `kurulum.yaz` (izin: `baglanti.yetkilendir`) | izin OAuth; konteyner/mülk/dönüşüm/bağ `oto`; etiket yayını ⚠ onaylı; site kodu `kul`; doğrulama `kul` (formu bir kez doldur) | ⚠ GTM yayını, harcamalı hesapta birincil dönüşüm · site kodu platform dışı | S |
| 7 | Marka bilgileri ve logo (`marka`) · hazırlama:`site`, `marka`; hazırlık:`marka_bilgisi`, `logo` | Bugünkü kural (sektör, kategoriler, ana amaç, **kime satıyoruz**, vaatler; amaç web ise sık sayfalar) + logo yüklü. "Markayı anlat" serbest metni SAYILMAZ (zaten öyle, `hazirlik.ts`) | `marka.yaz`, `logo.yaz` | `ai` (siteden doldurur, kullanıcı onaylar) | — | S |
| 8 | Reklam varsayılanları (`varsayilanlar`) · hazırlama:`kategori`, `konum`, `butce` | Kategori beyanı verilmiş ("hiçbiri" de beyan), varsayılan konum/kitle, varsayılan günlük bütçe | `kurulum.yaz` | `gir`/`seç`; `ai` öneri | — | S |
| 9 | **Bildirimler ve erişim** (`bildirimler`) · hazırlık:`bildirim` (YENİ) | En az bir ETKİN bildirim kanalı (`/bildirim/kanallar`) | `bildirim.yaz` | `gir` | — | S, **B** ("bildirim istemiyorum") |
| | · hazırlık:`erisim` (YENİ) | Workspace'e atanmış en az bir sorumlu kişi (org yöneticisi dışında üyelik) ya da beyan "yalnız şirket yöneticileri yönetiyor" | `ekip.yonet` | `seç` (`DanismanAta`) | — | S, **B** |
| | · Müşteriye panel girişi | Gösterilir, sayılmaz (açılıştaki `clientUser` buraya taşınır) | `ekip.yonet` | `gir` | — | — |
| 10 | **Veri akışı** (`veri`) · hazırlık:`veri_akisi` (var olan madde) | Atanmış hesap(lar)da yapı + metrik işi başarılı (bugünkü madde mantığı). İlk çekim sürüyorsa `bekliyor` + "N dk önce başladı"; iş düştüyse `hata` + işin notu; izleme kapalıysa `eksik` | `kurulum.yaz` (yeniden kuyruk: `veri.guncelle`) | `oto` ("Şimdi güncelle") | — | S (Ç-5) |
| — | Aylık bütçe | Sayaca girmez (Ç-7 aynen); son ekranda "Bu ayın bütçesini planla" bağlantısı | `butce.yaz` | `gir` | — | — |
| — | Ek hesap/kanallar, diğer veri kaynakları | Marka Merkezi `#kanallar`, `#veri-kaynaklari`; sayılmaz | mevcut | mevcut | — | — |

### 2c. "Hiç eksik yok" (`bitti`)

`bitti = şirketSayaci.bitti && workspaceSayaci.bitti`, her sayaçta: sayılan
her adım `tamam`; `kullanilmiyor` (platform beyanı) ve `kapsam_disi`
(öğe beyanı) toplamdan düşer ama son ekranda **kim, ne zaman, ne gerekçeyle**
beyan ettiği yazılır; `bilinmiyor` bir adım varken ASLA `true` (bugünkü
kural). Şirket listesi yalnız `kurulum` sihirbazının son ekranında ve
Şirketler'de görünür; Marka Merkezi rozeti yalnız workspace sayacını
gösterir (şirket işi workspace'in sayfasında yapılamaz — yetki farklı).

---

## 3. Akış

### 3a. Girişler ve adres

| Adres | Ne |
|---|---|
| `/kurulum` | **Başlangıç**: "Var olan workspace'i tamamla" (şirketin workspace'leri, eksik sayısına göre sıralı, her satırda sayaç) · "Yeni workspace aç" · (yetkiliyse) "Yeni şirket" / "Yeni üst hesap" |
| `/kurulum?tur=ust-hesap\|sirket\|workspace&adim=…` | **Açılış** (bugünkü merdiven, `hesaplar` adımı ÇIKAR, Ç-7). Son adımı yeni workspace'e `switch-client` → tamamlama modu |
| `/kurulum?musteri=<id>&adim=<kod>` | **Tamamlama**: solda 2 + 10 adım, sağda geçerli adım. `adim` yoksa `ilkEksikAdim` |

Tek üretici: shared `sihirbazAdresi({ musteri, adim })` (CLAUDE.md "bağlantıyı
elle birleştirme"); OAuth dönüşünün `redirectTo`su da bundan kurulur, yoksa
platform bağlandıktan sonra kullanıcı başlangıca düşer.

**Girişler:** Şirketler › "Yeni workspace" → `/kurulum?tur=workspace`;
Şirketler › workspace satırında sayaç eksikse "Kurulumu tamamla (7 / 10)" →
`sihirbazAdresi`; Marka Merkezi › Kurulum başlığında "Sihirbazla tamamla"
(sayaç bitmemişse birincil, bitmişse yok); Genel Bakış'ta bildirim şeridi
(TASARIM-DİLİ 2.1): yalnız `kurulum.yaz` olan, müşteri hesabı olmayan
kullanıcıya, aktif workspace `bitti` değilse: "Kurulum eksik: 3 adım ·
Sihirbazla tamamla". **Kapat** o workspace için 7 gün gizler (yerel tercih;
CLAUDE.md "her raporda duran uyarı okunmaz hâle gelir").

### 3b. Adım sırası ve bağımlılıklar

```
Şirket:   S1 Bağlantılar ─► S2 Ekip ve güvenlik
Workspace: 1 Bilgiler (site!) ─► 2 Meta hesap+ödeme ─► 3 Sayfa+IG ─► 4 Piksel
                         └────► 5 Google hesap+ödeme ─────────────┐
           6 Ölçüm (izin → konteyner/mülk → dönüşüm/bağ → etiket ─► site kodu ─► doğrulama)
           7 Marka (hazırlama site'den, 1'den sonra arka planda başlar)
           8 Varsayılanlar ─► 9 Bildirim+erişim ─► 10 Veri ─► Son kontrol
```

- **Bilgiler İLK:** site adresi ölçümün (konteyner tespiti, site taraması)
  ve hazırlamanın (AI marka) girdisi. Kaydedildiği an hazırlama okunur ve
  arka planda başlar; kullanıcı 7'ye geldiğinde marka çoğunlukla dolu.
- **Bağımlılık engeli** = sözleşmedeki `bekliyor` (kurulumun `atlandi`):
  adım açılabilir, içinde "Önce Meta reklam hesabı" + oraya git düğmesi.
  Sıra ZORLANMAZ (kullanıcı Google'ı önce yapabilir); bekleyen parça
  tıklanamaz değil, sebebini söyler.
- **Tamamlanan adımlar atlanır ama gösterilir:** "Devam" bir sonraki
  bitmemiş adıma gider; raydaki tamam adım tıklanınca açılır, sonucunu ve
  "Değiştir"i gösterir.
- **Platform beyanı** başlangıçta bir kez sorulur ("Bu workspace'te hangi
  platformlarda reklam vereceğiz? Meta / Google / ikisi") ve sonra raydaki
  adımlar `Kullanılmıyor` olarak soluk kalır (gizlenmez — geri açılabilir).

### 3c. Her adımın iskeleti (Google Ads kurulum akışı)

Başlık + tek cümle "bu neden gerekli" (reklam bilmeyen kullanıcının dili:
"Reklamdan gelen formları sayabilmemiz için") → parça satırları (durum
ikonu, ad, kısa sonuç, NEDEN, tek eylem) → alt çubuk: **Geri** · **Otomatik
yap** (sistemin yapabileceği parça yoksa PASİF ve yanında sebebi yazar —
bugünkü `dugmeNedeni` kuralı; kaybolan düğme "nereye gitti" sorusu doğurur) ·
(beyan edilebilirse) **Bunu kullanmıyorum** · **Devam**. "Devam" bitmemiş
adımda da çalışır ("Sonra yapacağım"): adım raydaki rozetiyle eksik kalır,
sihirbaz kilitlemez.

### 3d. Durum makinesi (panel; HER ŞEY CANLI DURUMDAN TÜRETİLİR)

İlerleme saklanmaz: hangi adımda olunduğu adresten (`adim`), adımların hâli
üç (+ şirket) uçtan. Saklanan tek yeni şey beyanlar (§ 5). Gerekçe: saklanan
bir "adım 6'dayız" kaydı, kullanıcı aynı işi Marka Merkezi'nden bitirdiğinde
bayatlar ve sihirbaz bitmiş işi yeniden ister — bir niyet kaydının gerçekten
ayrışması (`sync_jobs` dersi).

Adım hâlleri (sözleşme sözlüğü + bir yeni): `tamam` · `hata` · `soru` ·
`eksik` · `kullanicida` · `bilinmiyor` · `bekliyor` · `kullanilmiyor` ·
**`kapsam_disi`** (YENİ; parça beyanla kapandı; adımın bütün parçaları öyleyse
adım `kapsam_disi`, toplamdan düşer). Öncelik sırası değişmez; `kapsam_disi`
parça birleşik durumda `tamam` gibi davranır.

Ekran-içi geçici hâller (yalnız istemcide):

```
bosta ──(Otomatik yap / Seç / Kaydet)──► isleniyor
isleniyor ──200──► yeniden_oku ──► bosta
isleniyor ──409 "kurulum sürüyor"──► bekliyor_yoklama (3 sn aralık, hazırlamanın YOKLAMA_SINIRI kadar)
isleniyor ──zaman aşımı / ağ──► bekliyor_yoklama   (işlem sunucuda sürüyor olabilir; "düştü" DENMEZ)
bekliyor_yoklama ──kilit kalktı──► yeniden_oku ──► bosta
bekliyor_yoklama ──sınır aşıldı──► bosta + "Hâlâ sürüyor olabilir; sayfayı yenile" (hata değil)
isleniyor ──4xx/5xx platform hatası──► bosta + parçada platformun MESAJI (adım nedeni)
dis_sayfa (ödeme, Tag Manager, OAuth) ──sekmeye dönüş (visibilitychange)──► yeniden_oku
```

Hesap taraması (`/connections/:id/refresh-accounts`) ve GTM yayını aynı
desenle; ekranda "Yapılıyor… genelde 30 sn" ve iptal yok (yarıda kesmek
yarım konteyner bırakırdı).

### 3e. Son kontrol ekranı

Üstte tek hüküm: **"Hiç eksik yok"** / **"2 iş kaldı"**. Altında iki grup
(Şirket, Workspace), her adım bir satır: tamam ✓ + kısa sonuç; kapsam dışı
+ beyan (kim, tarih, gerekçe, "Geri al"); kalan iş + NEDENİ
(`kullaniciyaKalan`) + oraya git. Kişisel bilgi satırı (Ç-6) ve isteğe bağlı
öneriler (aylık bütçe, müşteri girişi, ek kanallar) ayrı, sayaç dışında ve
bunu başlığında söyler. `bitti` iken birincil eylem "İlk reklamı kur"
(AdvCampaign), ikincil "Marka Merkezi'ne dön".

---

## 4. Mevcut parçalarla ilişki

| Parça | Ne olur |
|---|---|
| `KURULUM_LISTESI`, `kurulumListesi`, `kurulumSayaci`, `eksikleriTamamlaKapsami` | **Tek kaynak, genişler** (§ 6). Marka Merkezi rozeti 7 → 10 olur — bilinçli, aynı tanım |
| Marka Merkezi › Kurulum (`kurulum-listesi.tsx`) | Liste görünümü olarak KALIR; adım içerikleri (`ParcaPaneli` vb.) ortak `AdimIcerigi`ne çıkar ve sihirbaz AYNI bileşeni çizer. İki ayrı içerik yazmak, aynı adımı iki ekranda ayrıştırırdı |
| `kurulum-bolumu.tsx` (`AdimSatiri`, `SecimPaneli`, `TetikFormu`, `SiteKodu`), `olcum-bolumu.tsx`, `hazirlama-karti.tsx` (`Soru`, `ButceDegistir`), `kurulum-yardimcilari.tsx`, `SpecialCategoryPicker` | Aynen yeniden kullanılır (import; taşınmaz) |
| `firma-bilgileri.tsx` / `MusteriBilgiFormu`, `bildirimler-bolumu.tsx`, `DanismanAta`, `AiDoldur`, `LogoSekmesi` | Yeni adımların içeriği; sihirbazda "kompakt" prop'la yalnız eksik alanlar öne |
| `kurulum-sihirbazi.tsx`, `kurulum-akisi.ts`, `PlatformAdimi`, `SirketSec`, `KurulumSonucu` | Açılış merdiveni KALIR; `hesaplar` adımı ve `HesapSecimi`/`BoostHesabi` açılıştan çıkar (Ç-7; dosyalar `#kanallar` kullanıyorsa kalır, kullanmıyorsa Ajan 3 siler ve söyler). `bitti` adımı tamamlama moduna geçişe döner. `PlatformAdimi` S1'in içeriği olur, Ç-2 kuralıyla |
| `/clients/:id/kurulum/tamamla` | Opsiyonel `kodlar` filtresi alır (adım başına "Otomatik yap") |
| `/clients/:id/hazirlik` | Yeni maddeler (§ 6); şerit kalktığı için tek tüketicisi liste |
| `/kurulum` sayfası | Başlangıç + açılış + tamamlama; ad `SIHIRBAZ_ADI` |

---

## 5. Veri modeli

**Tek yeni tablo** — `kurulum_beyanlari` (AYRI migration, eklemeli):

```
id uuid PK · org_id uuid NOT NULL · client_id uuid NULL (NULL = şirket düzeyi)
oge text NOT NULL CHECK (oge IN ('site_yok','adres','bildirim','erisim','iki_adim'))
  -- liste shared KURULUM_BEYAN_OGELERI; spec iki listeyi karşılaştırır
gerekce text NULL (≤ 300) · beyan_eden uuid NULL → users(id) ON DELETE SET NULL
created_at timestamptz
FK (client_id, org_id) → clients ON UPDATE CASCADE ON DELETE CASCADE
CHECK ((oge = 'iki_adim') = (client_id IS NULL))
tekil: (org_id, oge) WHERE client_id IS NULL  +  (client_id, oge) WHERE client_id IS NOT NULL
```

- İki kısmi tekil indeks, çünkü Postgres tekil indekste NULL'ları farklı
  sayıyor ve tek `(org_id, client_id, oge)` indeksi şirket düzeyi beyanı
  çoğaltırdı. (Kısmi indeksi Prisma bildiremiyor — `@@ignore` değil, şemada
  indeks yok + `01_constraints.sql`; CLAUDE.md'deki bedel bilinerek.)
- Beyan GERİ ALINABİLİR (satır silinir; denetim kaydı `audit_logs`).
- `beyan_eden` adı ekranda `LEFT JOIN users` ile (INNER JOIN satırı RLS'le
  süzer — `rapor-listeleri-rls` dersi).
- Durak listesi: `02_rls.sql` (select: `org_kapsaminda` + client varsa
  `can_access_client`; yazma: aynı + `client.write`), `pglite-harness`
  TRUNCATE, `workspace-tasima.ts`: kompozit FK `ON UPDATE CASCADE` olduğu için
  **`CASCADE_ILE_TASINANLAR`** (2026-10-12 dersi), şirket satırları
  (`client_id NULL`) workspace'le gitmez.
- Platform beyanı `workspace_kurulum.kullanilmayan_platformlar`ta KALIR
  (anlamı farklı: adımı bütünüyle düşürür; taşımak veri göçü demek).
- Sihirbaz ilerlemesi SAKLANMAZ (§ 3d).

## 6. Sözleşme (YAZILDI — Ajan 1 ikinci tur, 2026-10-13)

| Dosya | İçerik |
|---|---|
| `packages/shared/src/panel/kurulum-listesi.ts` | `KURULUM_LISTESI` **10 adım** (`bilgiler` · meta · sayfa · piksel · google · olcum · marka · varsayilanlar · `bildirimler` · `veri`); parça `beyan?`; girdi `beyanlar?`; durum `kapsam_disi`; `birlesikDurum` kapsam dışı parçayı yok sayar; `kurulumSayaci` + `kapsamDisi` (TEK sayaç, şirket listesi de kullanıyor); `ilkEksikAdim`; `siteYokKurulumKodlari` (API `tamamla` için, listeden türetilmiş); `eksikleriTamamlaKapsami(g, adim?)` + `HESAP_ACAN_KODLAR` sert süzgeci (sunucu `otomatik` dese bile gerçek hesap açan kod düğmeye girmez) |
| `packages/shared/src/panel/sirket-kurulum-listesi.ts` (YENİ) | `SIRKET_KURULUM_LISTESI` (bağlantılar, güvenlik), `sirketKurulumListesi`, eylem sözlüğü (`bagla` / `yeniden_yetkilendir` / `ajansa_haber` / `advetics_ekibine` / `zorunlu_ac`), `hicEksikYok` |
| `packages/shared/src/kurulum/beyan.ts` (YENİ) | `WORKSPACE_BEYAN_OGELERI` (site_yok, adres, bildirim, erisim), `SIRKET_BEYAN_OGELERI` (iki_adim), `KURULUM_BEYAN_OGELERI` (CHECK listesi), `kurulumBeyaniSchema`, `sirketKurulumBeyaniSchema`, `KurulumBeyani` (yanıt tipi), `beyanVarMi` (üç hâlli) |
| `packages/shared/src/kurulum/site-yok.ts` (YENİ) | § 0 karar 2 |
| `packages/shared/src/schemas/hazirlik.schema.ts` | `HAZIRLIK_SIHIRBAZ_KODLARI` (site_adresi, iletisim, rapor_alicisi, adres, bildirim, erisim); `HazirlikDurumu` + `bekliyor` |
| `packages/shared/src/panel/adresler.ts` | `SIHIRBAZ_ADI`, `sihirbazAdresi(musteri, adim?)`; Kurulum çapalarına `bilgiler`, `bildirimler`, `veri` |
| `packages/shared/src/panel/kapilar.ts` | `kurulum.beyan` (`client.write`), `sirketKurulum.beyan` (org yöneticisi) |
| `apps/web/src/lib/panel-adresleri.ts` | yeni dışa aktarımlar |
| `apps/web/src/lib/kurulum-sihirbazi-sozlesmesi.spec.ts` (YENİ) | 35 test; 9 mutasyonla ölçüldü (her biri `tsc` ile derlenip koşuldu, hepsi düştü, geri alındı ve yeniden derlendi) |

Uyum için dokunulan Ajan 3 dosyaları (yalnız derlemenin ve testlerin yeşil
kalması için, görünüş kararı DEĞİL): `kurulum-listesi-mantik.ts`
(`LISTE_DURUMU.kapsam_disi`, yeni parça adları, sayaç cümlesinde "N kapsam
dışı"), `kurulum-listesi-mantik.spec.ts`, `bolumler.spec.ts` (adım kümesi
artık listeden türüyor), `panel-adresleri.spec.ts` (10 adım; veri akışı
artık sayıyor).

### Geçiciler (silinecek — Ajan 2/3 işi bitince)

- **`HAZIRLIK_SIHIRBAZ_KODLARI` ayrı liste.** API (`tenancy/hazirlik.ts`)
  bu maddeleri henüz üretmiyor ve `hazirlik.spec.ts` ürettiği kodları
  `HAZIRLIK_KODLARI` ile birebir karşılaştırıyor. Ajan 2 maddeleri yazınca
  liste `HAZIRLIK_KODLARI`na katılır, sabit silinir. O güne kadar
  Marka Merkezi › Kurulum'da `bilgiler` ve `bildirimler` adımları
  "okunamadı" görünür → **canlıya alınmaz**.
- **`KurulumListesiGirdisi.beyanlar` İSTEĞE BAĞLI.** `undefined` = çağıran
  beyanları henüz okumuyor ("beyan yok" sayılır, bugünkü davranış); `null`
  = okunamadı. Ajan 3 bütün çağıranları (Marka Merkezi sayfası + liste,
  sihirbaz) bağlayınca alan ZORUNLU olur; API'deki `platform-beyani.spec.ts`
  de verir.
  **AJAN 3 BAĞLADI (2026-10-13):** panelde `kurulumListesi(` çağıran beş
  yerin beşi de (`marka-merkezi/page.tsx`, `kurulum-listesi.tsx`,
  `kurulum/tamamlama.tsx`, `kurulum/baslangic.tsx`,
  `genel-bakis/kurulum-seridi.tsx`) `beyanlar: beyanGirdisi(...)` veriyor;
  `sihirbaz-akisi.spec.ts` kaynak taramasıyla kilitliyor. **Mimar alanı
  ZORUNLU yapabilir** (API tarafı: `platform-beyani.spec.ts`).
- ~~`tamamla` ucunun `kodlar` süzgeci yokken panel adım başına "Otomatik yap"ı
  `kurulumAdimlari`nı `/kurulum/adim` ile tek tek yürütür.~~ YAPILAMADI:
  `/kurulum/adim` seçim isteyen kodlarda (sayfa, piksel, konteyner, mülk)
  gövdede seçim bekliyor, "otomatik" yolu yalnız `tamamla`da. Panel bugün
  `POST /clients/:id/kurulum/tamamla` gövdesine `{ kodlar: [...] }` koyuyor;
  sunucu süzgeci tanımayana kadar gövdeyi yok sayıp `OTOMATIK_SIRA`nın
  tamamını yapar (hesap açmaz; yalnız daha geniş). Gövde biçimi sözleşmede
  YOK — Ajan 1 `kurulumTamamlaSchema` eklemeli.

### Ajan 3'ün sözleşmede bulduğu boşluklar (Ajan 1 / Ajan 2)

- **Beyanların okunuşu iki biçime de hazır** (`lib/kurulum-beyanlari.ts`):
  `/kurulum` yanıtında `beyanlar` dizisi VARSA o, yoksa
  `GET /clients/:id/kurulum/beyanlar` (dizi ya da `{ beyanlar }`). Okunamazsa
  `null` → beyanlı bitmemiş parça "Okunamadı". Ajan 2 hangisini seçtiyse
  sözleşmeye yazılmalı.
- **`SirketKurulumYaniti` tipi shared'da YOK** (§ 7 adını veriyor). Panel
  şirket listesini var olan uçlardan kuruyor (`/connections` parametresiz,
  `/connections/availability`, `/auth/2fa` → `secilenSirket.zorunlu`) ve
  `GET /kurulum/sirket` yanıtından YALNIZ `beyanlar` alanını okuyor; alan
  yoksa şirket beyanları "okunamadı".
- **Şirket beyanı ucu** `PUT /kurulum/sirket/beyan` gövdesi
  `sirketKurulumBeyaniSchema`; workspace beyanı `PUT /clients/:id/kurulum/beyan`
  `kurulumBeyaniSchema`. Panel yanıt gövdesine güvenmiyor, yazdıktan sonra
  sunucuyu yeniden çiziyor.
- **409'un iki anlamı** (`kilitli` "sürüyor" ve "önce bu workspace'i seç")
  panelde MESAJLA ayrılıyor (`istekSonucu`). Sunucu ayrı `code` verirse
  ayrım koda taşınmalı.
- **Şirketin kullandığı platformlar** sözleşmede "en az bir workspace"; panel
  bütün workspace'leri okumamak için AKTİF workspace'in platform beyanını
  veriyor (bkz. `tamamlama.tsx` yorumu). Başlangıç ekranında iki platform da
  sayılıyor (workspace seçilmedi).

## 7. Uçlar

| Uç | Yeni mi | Kapı | Not |
|---|---|---|---|
| `GET /clients/:id/kurulum`, `/hazirlama`, `/hazirlik` | var (hazırlık genişler) | `client.read` | Liste girdisi |
| `GET /clients/:id/kurulum/beyanlar` | YENİ | `client.read` | Ya da `/kurulum` yanıtına `beyanlar` alanı (Ajan 2 seçer; ikisi birden değil) |
| `PUT /clients/:id/kurulum/beyan` | YENİ | `client.write` | `kurulumBeyaniSchema`; `iki_adim` reddedilir |
| `GET /kurulum/sirket` | YENİ | `client.read` | `SirketKurulumYaniti`: bağlantı özetleri (sahip ajans/şirket), 2FA, beyanlar, şirketin workspace'leri + her birinin sayacı İÇİN GEREKEN GİRDİ DEĞİL, yalnız ad/id (sayaçlar başlangıçta tembel okunur) |
| `PUT /kurulum/sirket/beyan` | YENİ | org yöneticisi | `iki_adim` |
| `POST /clients/:id/kurulum/tamamla` | var | `client.write` | + `kodlar` süzgeci; platform beyanını okuyor (bugün), **site_yok beyanını da okumalı** (`siteYokKurulumKodlari()`, `kullanilmayanAdimlar` deseni) ve beyan okunamazsa site işlerini yapmamalı |
| `POST /clients/:id/kurulum/adim`, `GET …/secenekler` | var | `client.write` (+ hesap: `connection.manage`) | |
| `POST /clients/setup` | var | `client.write` | sihirbaz `adAccountIds: []` gönderir |
| `PATCH /clients/:id`, `/bildirim/kanallar`, `/memberships`, `PATCH /auth/2fa/sirket`, `/connections/authorize`, `/reauthorize?kapsam=olcum`, `/hazirlama/cevap`, `/client-profile` | var | mevcut | Adım içerikleri |

Kilit: kurulum servisi zaten 409 dönüyor (`kilitli`); panel bunu
`bekliyor_yoklama`ya çevirir, hata olarak göstermez.

## 8. Yetki

Sayfa kapısı `client.read` (tamamlama görünür, yazamayan "Bunu yöneticin
yapar" görür); her eylem `PANEL_KAPILARI` aynası; elle `hasPermission` yok.
Müşteri hesabı (rol `client`) sihirbazı GÖRMEZ (dört ekran kuralı, § 5
ürün kararları) — `/kurulum` müşteri hesabına `/dashboard`a yönlenir,
Genel Bakış şeridi müşteriye çizilmez.

## 9. Dosya sahipliği (Ajan 2 ‖ Ajan 3) — SON HÂL

Shared sözleşme dosyaları (§ 6) **Ajan 1'in**; Ajan 2/3 tip TANIMLAMAZ.
Sözleşmede eksik görürlerse devir notuna yazar, Ajan 1 ekler.

**Ajan 2 (API + veritabanı):**
- Migration `kurulum_beyanlari` (AYRI dosya, eklemeli; § 5) +
  `prisma/schema.prisma` modeli, `prisma/sql/01_constraints.sql` (CHECK,
  iki kısmi tekil indeks), `02_rls.sql`, `test/pglite-harness.ts` TRUNCATE,
  `workspace-tasima.ts` (`CASCADE_ILE_TASINANLAR`). CHECK listesi ↔
  `KURULUM_BEYAN_OGELERI` spec'i.
- `apps/api/src/modules/kurulum/**`: `PUT /clients/:id/kurulum/beyan`,
  beyanların okunması (`/kurulum` yanıtına alan ya da ayrı uç — biri),
  `GET /kurulum/sirket` + `PUT /kurulum/sirket/beyan` (yeni
  `kurulum-sirket.ts`), `tamamla`ya `kodlar` + site_yok süzgeci,
  `kullanilmayanAdimlar` yanına `siteYokKurulumKodlari`.
- `apps/api/src/modules/tenancy/hazirlik.ts` (+ spec): altı yeni madde,
  `veri_akisi` için `bekliyor`; sonra `HAZIRLIK_SIHIRBAZ_KODLARI`nı
  `HAZIRLIK_KODLARI`na katması için Ajan 1'e haber (shared'a kendisi
  dokunmaz).
- `connections.service.ts`e DOKUNMAZ (Ç-2 kapandı; OAuth işi a11ca4a6'da).
- `nest-grafigi` (yeni servis varsa).

**Ajan 3 (panel):**
- `app/(dashboard)/kurulum/page.tsx`, `components/kurulum/**`: başlangıç,
  tamamlama modu (`?musteri=&adim=`), son kontrol; `sihirbaz-akisi.ts` saf
  karar dosyası + spec (409/zaman aşımı → yoklama, 4xx → platform mesajı);
  açılıştan `hesaplar` adımının çıkması (Ç-7); `kurulum-akisi.ts`teki eskimiş
  "yeni şirkette yeniden bağlanmak zorunda" yorumu ve S1'in Ç-2 kuralı;
  sekme başlığı `SIHIRBAZ_ADI`.
- `components/marka-merkezi/**`: `kurulum-listesi.tsx` (`AdimIcerigi`
  çıkarımı, "Sihirbazla tamamla", `beyanlar` girdisi, `kapsam_disi`
  görünüşü), `kurulum-listesi-mantik.ts`, `app/(dashboard)/marka-merkezi/page.tsx`
  (sayaç girdisine `beyanlar`); `firma-bilgileri`, `bildirimler-bolumu`
  yalnız `kompakt` için; `components/tenancy/danisman-ata.tsx` aynı.
- **AdvCampaign site-yok kapısı** (kullanıcı kararı 2): `components/reklam/**`
  (rehberin amaç ve platform seçimi) `siteYokRehberKapisi`ni okur; kapalı
  kart ÜSTÜ ÇİZİLİ ve `SITE_YOK_SEBEBI` ile görünür (gizlenmez — çalışmayan
  seçenek gösterilmez kuralı "neden yok"u söylemeyi yasaklamıyor). Sunucu
  tarafının aynası (rehberin eksik listesi / yayın kapısı,
  `apps/api/src/modules/reklam/**`) **Ajan 2'nin**: aynı yardımcıyı yayın
  kapısına ekler — panel süzgeci tek başına koruma değil.
- Şirketler workspace satırı ("Kurulumu tamamla" → `sihirbazAdresi`),
  Genel Bakış şeridi (`components/genel-bakis/**` tek yeni dosya).

## 10. Testler (Ajan 4 mutasyonla doğrular)

Shared (her mutasyonda `tsc` ile yeniden derle, test SAYISINI oku):
`kapsam_disi` toplamdan düşer ama `bitti`yi tek başına sağlamaz; beyanlar
`null` iken beyanlı parça `bilinmiyor`; `meta_odeme`/`google_odeme` beyan
şemasında REDDEDİLİR; `eksikleriTamamlaKapsami(g, adim)` hiçbir girdide
`meta_hesap`/`google_hesap` içermez; `sirketKurulumListesi` ajans bağlantısı
görünürken "bağla" eylemi üretmez (Ç-2'nin kilidi); `ilkEksikAdim`
`kullanilmiyor`/`kapsam_disi`yi atlar; `sihirbazAdresi` tek üretici (kaynak
taraması: `/kurulum?` elle yazan dosya yok).

API: beyan ucu RLS — `SET ROLE` + `RETURNING` ile etkilenen satır sayılır,
başka workspace'in beyanı yazılamaz; şirket beyanı yalnız org yöneticisi;
kısmi tekil indeks şirket düzeyi beyanı çoğaltmaz; `workspaceTasi` beyanı
taşır (CASCADE listesi spec'i); hazırlık yeni maddeleri PGlite ile (boş
e-posta dizisi `eksik`, koordinatsız adres `eksik`, beyanlı adres
`kapsam_disi`); `tamamla` + `kodlar` yalnız o kodları koşar ve kullanılmayan
platformu yine atlar; üretim sırası elle kurulmuş migration testi
(`roller-uce-indi` deseni: önceki migration → `01_constraints` → eski veri →
yeni migration).

Panel: `sihirbaz-akisi.ts` saf (409 → yoklama, ağ hatası → yoklama, 4xx →
mesaj; dört hâl ayrı); `.catch(() => set…([]))` taraması; `panel-tasarim`,
`nav-sections`, eski ekran adları taraması; sekme başlığı `SIHIRBAZ_ADI`dan.

## 11. Canlıda ölçülecekler (Ajan 5)

1. Yeni müşteri şirketinde ajans Meta/Google bağlantısı S1'de "kullanılıyor"
   görünüyor mu, "Bağla" çizilmiyor mu (Ç-2).
2. "Ölçüm izinlerini ver" sihirbazdan dönünce workspace'in seçili Google
   bağlantısında Tag Manager/Analytics kapsamı (paralel ajanın sonucu) ve
   dönüş adresi sihirbazın aynı adımına mı.
3. `tamamla` (GTM yazma + yayın) gerçek süresi ve nginx zaman aşımı; aşıyorsa
   yoklama yolunun çalıştığı gözle.
4. Ödeme okumasının yeni açılmış hesapta (Meta `funding_source_details`,
   Google `billing_setup`) ödeme eklendikten kaç dakika sonra döndüğü.
5. Genel Bakış şeridinin ek okuma maliyeti (dört uç); >300 ms ise istemcide
   tembel.
6. Kurulum `sayfa` adımının boost hesabını bağladığı (Ç-7).

## 12. Açık sorular

İki soru da kullanıcıyla kapandı (§ 0). Açık ürün sorusu yok.

## 13. Bu turda ÖLÇMEDİKLERİM

- ~~`/connections` servis sorgusu (Ç-2)~~ — 2026-10-13 okundu, kapandı.
- Ajans bağlantısının kardeş şirketten görünmesi RLS + kaynak okumasıyla
  kuruldu; kardeş şirket oturumuyla CANLIDA görülmedi (Ajan 5, § 11/1).
- Kurulum `sayfa` adımının boost hesabı davranışı (Ç-7).
- AI hazırlamanın telefon/adres önerip öneremediği (`iletisim` için `ai`
  işareti varsayım).
- Bildirim kanallarının bir "varsayılan e-posta" kanalı olup olmadığı;
  varsa `bildirim` parçası her workspace'te kendiliğinden tamam olur ve
  beyana gerek kalmaz — Ajan 2 ilk iş bakar.
- Sunucudaki Postgres sürümü (`NULLS NOT DISTINCT` yerine iki kısmi indeks
  bu yüzden seçildi; sürüm ≥15 ise tek indeks de olur).

## 14. Ajan 2 (Arka Plan) — yapılanlar ve sapmalar (2026-10-13)

**Uçlar** (hepsi `apps/api/src/modules/kurulum/`):

| Uç | Kapı | Not |
|---|---|---|
| `GET /clients/:id/kurulum/beyanlar` → `KurulumBeyani[]` | `client.read` | § 7'deki "biri" seçimi: **ayrı uç**. Panel girdisi beyanları üç hâlli istiyor; kurulum okuması düşünce beyanlar ayrıca okunabilmeli. Bağlam o workspace'e daraltılıyor (hazırlık servisiyle aynı). |
| `PUT /clients/:id/kurulum/beyan` (`kurulumBeyaniSchema`) → güncel liste | `client.write` + aktif workspace | Yeniden beyan üzerine yazar (tek satır); geri al siler; denetim kaydı AYNI transaction'da (`kurulum.beyan` / `kurulum.beyan_geri_alindi`). Görünen ama silinemeyen satır 403. |
| `GET /kurulum/sirket` → `SirketKurulumYaniti` | `client.read` | Şirket = `ctx.orgId`; seçim katmanı bu okuma için kapalı (bütün workspace'ler). Workspace yoksa iki platform da "kullanılıyor". |
| `PUT /kurulum/sirket/beyan` (`sirketKurulumBeyaniSchema`) | `@RequireOrgAdmin()` | `kurulum.sirket_beyan` denetimi; RLS de yalnız `current_org_id` + yönetici. |
| `POST /clients/:id/kurulum/tamamla` gövde `{ kodlar? }` (`kurulumTamamlaSchema`) | `client.write` | Gövdesiz = bugünkü davranış. İstenen ama otomatik olmayan kod sessiz atlanmıyor (`atlandi` + neden; hesap açan kodlar adıyla). "Site yok" beyanında `siteYokKurulumKodlari()` koşmuyor; beyan **okunamazsa** da koşmuyor ve her site adımı için "okunamadı" sonucu dönüyor. |

**Hazırlık** (`tenancy/hazirlik.ts`): altı yeni madde (`site_adresi`, `iletisim`,
`rapor_alicisi`, `adres`, `bildirim`, `erisim`) — hiçbiri `zorunlu` değil
(`hazir` bayrağı anlamını korusun). Maddeler BEYANI UYGULAMIYOR, gerçeği
söylüyor; beyanı `kurulumListesi` uygular. `erisim`: workspace'e ÖZEL
`admin`/`ad_manager` üyeliği; yönetici olmayan kişi sıfır görüyorsa
`bilinmiyor` (memberships politikası). `bildirim`: varsayılan kanal YOK
(§ 13'teki soru — kaynak okundu); "kanal var ama etkin değil" ayrı cümle.
`veri_akisi` → `bekliyor`: hesabın son yapı/metrik işi `queued`/`running`/
`throttled` ve 3 saatten genç (`ILK_CEKIM_BEKLEME_SINIRI_MS`); daha yaşlıysa
`eksik` + "takılmış olabilir", düşmüşse `eksik` + işin hata metni.

**→ Ajan 1'e:** API altı maddeyi ÜRETİYOR; `HAZIRLIK_SIHIRBAZ_KODLARI`
artık `HAZIRLIK_KODLARI`na katılabilir (API sırası: önce eski yedi, sonra
bu altı — `hazirlik.spec.ts` "her kod tam bir kez" testi tek listeye
dönecek). Shared'a bu yüzden dokunmadım.

**AdvCampaign site-yok sunucu aynası** (`reklam/rehber/yayin-kapilari.ts`):
yeni kapı `SITE` (özet kapısından hemen sonra, sıfır platform çağrısı);
`siteYokEngelleri(amac, platformlar, siteYok)` shared `siteYokRehberKapisi`
ile. Prova da tazeleme ve platform çağrısından ÖNCE reddediyor (400,
`kapi: 'SITE'`, Türkçe `SITE_YOK_SEBEBI`). Beyan okunamazsa (null) kapı
açık — rehberin adres kuralı zaten durduruyor (yardımcının sözleşmesi).

**Ç-7 kapandı (ölçüldü, kaynak):** kurulumun `sayfa` adımı boost hesabını
BAĞLAMIYORDU. Artık sayfa atanınca (ve Meta hesabı sayfadan sonra atanınca)
workspace'in Meta hesabı yalnız BOŞ boost bağlarına `setProfileAdAccount`
ile yazılıyor; düşerse adım düşmüyor, sebep sonuç cümlesinde.

### Ajan 2 sapmaları

1. **Kısıtlar 01_constraints.sql'de DEĞİL migration'da** (§ 5, § 9). Üretim
   sırası testleri önceki migration'ların üstüne BUGÜNKÜ `prisma/sql`i
   koşuyor; tabloyu adıyla anan bir 01_constraints satırı o testlerin
   hepsini "relation does not exist" ile düşürürdü. Tablo yeni, çakışma
   yok (`workspace_kurulum`, `sinyaller` de böyle).
2. **Shared'a iki küçük ekleme** (sözleşmede uç vardı, tip yoktu):
   `SirketKurulumYaniti` (`panel/sirket-kurulum-listesi.ts`) ve
   `kurulumTamamlaSchema` / `KurulumTamamlaIstegi` (`kurulum/index.ts`).
   Bağlantılar `SirketKurulumYaniti`nda YOK: girdi parametresiz
   `/connections`tan (sözleşmedeki tuzak), ikinci özet aynı soruya iki cevap olurdu.
3. **RLS UPDATE politikası var** (§ 5 yalnız select/yazma diyordu): yeniden
   beyan `ON CONFLICT DO UPDATE` ile yazılıyor ve o yol UPDATE politikası
   istiyor. Kural INSERT ile aynı.
4. Şirket satırı yazma kuralı `org_kapsaminda` DEĞİL `org_id =
   current_org_id() AND is_org_admin()`: "tüm şirketler" modunda bir
   şirketin güvenlik kararı kardeş şirketten yazılamasın.

### Ölçmediklerim

- Canlı veritabanında migration (Postgres sürümü dahil) — Ajan 5.
- `ILK_CEKIM_BEKLEME_SINIRI_MS` = 3 saat tahmin: büyük hesapta 90 günlük
  reklam seviyesi geçmişinin gerçek süresi görülmedi.
- `tamamla` + `kodlar`ın gerçek platformda süresi (§ 11/3).
- Boost bağının canlıda Akıllı Boost kartında "bağlı hesap yok"u
  kaldırdığı gözle görülmedi (§ 11/6).
- `erisim`: org geneli `ad_manager` (client_id NULL) sorumlu SAYILMIYOR —
  "workspace'e atanmış" okuması; ürün olarak tersi istenirse tek satır.
