# Ayarlar ve Marka Merkezi sadeleştirme — mimari (Ajan 1)

**Tarih:** 2026-10-13 · **Durum:** sözleşme yazıldı, sayfalar Ajan 2 ‖ Ajan 3'te ·
**Kullanıcı onayı:** yapı aynen onaylandı (*"eksiksiz hatasız tamamlanmalı"*),
soru sorulmadan karar verildi; ölçüt kullanım kolaylığı + reklam verimliliği
(CLAUDE.md §5). Para harcayan ya da geri dönüşsüz bir karar **⚠** ile işaretli.

**Sözleşme kodu (yazıldı, derleniyor, testli):**

| Dosya | İçerik |
|---|---|
| `packages/shared/src/panel/adresler.ts` | Yollar, Ayarlar sekmeleri, Marka Merkezi bölümleri, Varlıklar sekmeleri, çapalar, `ayarlarAdresi` · `markaMerkeziAdresi` · `varliklarAdresi` · `acilisAdresi` · `hesaplarAdresi` · `veriDurumuAdresi` · `platformBaglantilariAdresi` |
| `packages/shared/src/panel/eski-adresler.ts` | `ESKI_ADRESLER` + `eskiAdresYonu`, `eskiMarkaMerkeziYonu` (eski `?bolum=`), `eskiCapaYonu` (eski `#çapa`, istemcide) |
| `packages/shared/src/panel/kapilar.ts` | `PANEL_KAPILARI` (her eylemin TEK kapısı = API kapısının aynası) + `kapiAcikMi` |
| `packages/shared/src/panel/kurulum-listesi.ts` | Kurulum'un tek listesi (`KURULUM_LISTESI`, 7 adım), `kurulumListesi`, `kurulumSayaci`, `eksikleriTamamlaKapsami` |
| `packages/shared/src/kurulum/index.ts` | + `KURULUM_PLATFORMLARI`, `kurulumPlatformBeyaniSchema`, `KurulumYaniti.kullanilmayanPlatformlar` |
| `apps/web/src/lib/panel-adresleri.ts` | Panelin tek içe aktarma kapısı (shared'dan yeniden dışa aktarım) + `kapi(session, anahtar)` |
| `apps/web/src/lib/nav-sections.ts` | `BASE_SATIRLARI_YENI`, `AYARLAR_SATIRLARI_YENI`, `HESABIM_SATIRI`, `SECTIONS_HEDEF`, geçiş anahtarları, `ayarSekmeleri` |
| `apps/web/src/lib/panel-adresleri.spec.ts`, `nav-hedef.spec.ts` | Birim testleri + mandal (ratchet) kaynak taramaları |

**Neden shared:** API de panel adresi yazıyor (`uyari-kurallari.ts` bildirim
zilinin bağlantısı, `connections.service.ts` OAuth dönüşü). Panelde sayfa
taşınınca API'deki elle yazılmış yol ölü adrese gönderir. `rapor-sorgusu.ts`
aynı sebeple shared'da.

---

## 1. Çelişki tablosu (yapı ↔ depo) ve kararlar

| # | Onaylı yapı | Depoda gerçek | Karar |
|---|---|---|---|
| Ç-1 | Hesabım = Ayarlar'ın 4. sekmesi | Müşteri hesabı (client_viewer) Ayarlar'ı GÖRMÜYOR (dört ekran kilidi, `nav-sections.spec.ts`); 2FA ise herkes için | `/ayarlar/hesabim` HERKESE açık; Ayarlar **menü satırı** yalnız yönetim sekmesi görene. Hesabım menü bölümüne girmiyor (`HESABIM_SATIRI` ayrı), sekme çubuğuna `ayarSekmeleri` ekliyor. Müşteri hesabı Hesabım'a kenar çubuğundaki ad kartından girer; tek sekme olduğu için sekme çubuğu çizilmez. |
| Ç-2 | Şirketler ve workspace'ler: liste, ekle… | Sayfa `org.write` istiyor; Reklam Yöneticisi `client.write` ile workspace AÇABİLİYOR (rolün tanımı) ama listeye giremiyordu | Sekme kapısı **`client.write`**. Şirket kartları ve şirket işlemleri sekme İÇİNDE `sirket.yonet` (`org.write` + org yöneticisi). Reklam Yöneticisi aktif şirketin workspace'lerini görür, ekler, Marka Merkezi'nde açar. |
| Ç-3 | Üst hesaplar yalnız platform yöneticisine | Bugün ajans yöneticisi (`managerAccount.yonetebilir`) kendi üst hesabının adını değiştirebiliyor; silme zaten yalnız Advetics | Kart (`#ust-hesaplar`, Şirketler sekmesi) YALNIZ platform sahibine (`ustHesap.yonet`). Kapsam seçicideki "Üst hesaplar" bağlantısı da öyle. Ajans yöneticisi üst hesap ADINI panelden değiştiremez (API ucu duruyor; geri alınabilir karar). **Üst hesap EKİBİ** Ekip sekmesinde ajans yöneticisinde kalır (`ustHesapEkibi.yonet`). |
| Ç-4 | Arşivle **ve geri al** | Geri alma ucu YOK; `GET /clients` arşivlileri döndürmüyor; pencere "geri almak için durumu aktif yap" diyor ama o ekran yok. Ayrıca `PATCH /clients/:id` `status` alanını `client.write` ile kabul ediyor → arşiv kapısı (`client.delete` + org yöneticisi) arka kapıdan aşılabiliyor | **Ajan 2 (API):** arşivlileri listeleyen okuma (`GET /clients?arsiv=1`, `client.read`) + `POST /clients/:id/geri-al` (`client.delete` + `@RequireOrgAdmin`, denetim kaydı). `PATCH`te `status` alanı `client.delete` + org yöneticisi yoksa **403** (sessizce yok sayma değil). Panel: `#arsiv` kartı, her satırda "Geri al". Veri silinmez. |
| Ç-5 | "sil" | Workspace KALICI silme panelde de API'de de yok; şirket silme var (silme özeti + ad onayı) | "Sil" = **şirket silme** (mevcut akış, aynen). Workspace için yalnız arşiv. **⚠ geri dönüşsüz:** şirket silme metrik geçmişini götürür — iki adımlı onay korunur, yeni bir silme yolu AÇILMAZ. |
| Ç-6 | Kurulum tek sayaç | Üç kaynak (hazırlık 7, kurulum 15, hazırlama 7+soru) ve Meta ya da Google'ı HİÇ kullanmayan workspace sonsuza kadar "eksik" derdi | Birleştirici (`kurulumListesi`, § 7). Yeni beyan: **kullanılmayan platform** (`kurulumPlatformBeyaniSchema`, `KurulumYaniti.kullanilmayanPlatformlar`). Sistem TAHMİN ETMEZ. **Ajan 3:** `workspace_kurulum.kullanilmayan_platformlar text[] NOT NULL DEFAULT '{}'` (AYRI migration, eklemeli, veri silmez) + `PUT /clients/:id/kurulum/platformlar` (`client.write`) + `oku`/`tamamla` beyanı okur. API bugün `[]` döndürüyor (= beyan yok, bugünkü davranış). |
| Ç-7 | Kurulum listesi | Hazırlıkta `aylik_butce` ve `veri_akisi` var | Sayaca **girmez**: aylık bütçe her ay yenilenen plan kararı (her ayın 1'inde bütün workspace'ler "eksik" derdi; evi Planla › Aylık Bütçe), veri akışı bir durum (evi Workspace bilgileri › Veri durumu). |
| Ç-8 | GA4 tek kayıt | `workspace_kurulum.ga4_mulk_id` + `veri_kaynaklari` GA4 satırı (kurulum `kurulumdanBagla` ile bağlıyor) ve Bağlantılar'da ayrı bir GA4 bağlama formu | Evi **Kurulum › Dönüşüm ölçümü** (`ga4_mulk`). Veri kaynaklarının GA4 bağlama formu panelde GÖSTERİLMEZ; GA4 satırının durumu (son çekim, hata) ölçüm adımının içinde salt okunur. Diğer kaynaklar (Search Console, e-ticaret) Kurulum'un altında isteğe bağlı blok (`#veri-kaynaklari`), sayaca girmez. İki kaydın mülkü ayrışıyorsa (eski veri) adımda AÇIKÇA yazılır — **ölçülmedi**, Ajan 3 iki yanıtı karşılaştırır. Veri birleştirme/silme YOK. |
| Ç-9 | Reklam varsayılanları: konum/varsayılan kitle | Varsayılan kitle iki yerden değişiyor: hazırlama cevabı (`konum`) ve Kitleler'deki "Varsayılan yap" | Evi **Kurulum › Reklam varsayılanları**: mevcut şablondan seç (`PUT /audience-templates/varsayilan`) ya da yeni konum (`POST /clients/:id/hazirlama/cevap {kod:'konum'}`). Varlıklar › Kitleler'de "Varsayılan" rozeti SALT OKUNUR + "Kurulum'da değiştir" bağlantısı; "Varsayılan yap" düğmesi kalkar. |
| Ç-10 | Özel reklam kategorisi | ÜÇ düzenleyici: workspace penceresi (`SpecialCategoryPicker`, `PATCH /clients`), Workspace ayarları (aynı), hazırlama kartı (`/hazirlama/cevap`) | Evi **Kurulum › Reklam varsayılanları**, yazma TEK uçtan: `/hazirlama/cevap {kod:'kategori'}` (beyan + "cevaplandı" bayrağı + denetim kaydı birlikte; `PATCH` bayrağı basmıyor ve hazırlık soruyu yeniden sorardı). Seçici bileşeni görünüş olarak kullanılabilir, kaydı bu uca gider. Sihirbazın kategori adımı (varsa) aynı uca gitmeli — **ölçülmedi**, Ajan 2 kontrol eder. |
| Ç-11 | Varlıklar'daki logo süzgeci kalkar | `ASSET_KINDS` `logo` içeriyor; görsel arşivi logo yükleyebiliyor | Logonun evi **Marka › Logo**. Görseller listesi logo türünü listelemez ve yükleme türlerinde logo yok; sayaç satırı "N logo Marka'da" + bağlantı (sessiz kesme yok, `initial.byKind.logo`). Eski `?tur=logo` bağlantıları Marka › Logo'ya yönlenir. Logo kayıtları silinmez. |
| Ç-12 | Veri durumu Workspace bilgileri'nde | `/sync/status` OTURUMDAKİ aktif workspace'i okuyor; Marka Merkezi adresteki (`?musteri=`) workspace'i gösteriyor → başka sekmede seçim değişmişse yanlış workspace'in verisi | **Ajan 3 (API):** `GET /sync/status?clientId=` (`ctx.clientIds` ile doğrulanır, yetkisizse 404). Panel adresteki workspace'i geçirir. |
| Ç-13 | Bildirimler Workspace bilgileri'nde | Ayrı alt bölüm, görünme kapısı `rule.read`, sayfa kapısı `client.write` | Kart (`#bildirimler`), kart kapısı `bildirim.gor`, yazma `bildirim.yaz`. |
| Ç-14 | Ekip TEK yer (Ayarlar) | Workspace ayarları'nda tam `TeamManager` + `DanismanAta`; ayrıca `/ayarlar/musteriler/[id]/ekip` | Workspace bilgileri › **Erişim** salt okunur liste (`erisim.gor`) + "Ayarlar › Ekip'te yönet" (`ayarlarAdresi('ekip', {workspace})`). Ekip sekmesine **workspace süzgeci** (`?workspace=`) — Ajan 2. |
| Ç-15 | Ekip ve güvenlik: şirket 2FA zorunluluğu | `IkiAdimSirketAyari` Ekip sayfasının üstünde | Kart `#iki-adim-zorunlulugu`, kapı `ikiAdim.sirketZorunlulugu` (yalnız org yöneticisi). Kişisel 2FA Hesabım `#guvenlik`. |
| Ç-16 | Saat dilimi / para birimi | Düzenlenemiyor; firma kartında salt okunur | **Salt okunur kalır** (Workspace bilgileri › firma). **⚠ değiştirmek geçmişi bozar:** metrik günleri ve tutarlar o dilim/birimle yazıldı; değişiklik raporları sessizce kaydırır. Ekranda "Reklam hesabının ayarından gelir" notu. |
| Ç-17 | `/kurulum` → "Yeni şirket / workspace aç", sonunda Marka Merkezi › Kurulum | Başlık "Açılış", sonda `/dashboard` | Adres `/kurulum` KALIR (yer imleri). Ad `ACILIS_ADI`. "Workspace'e geç" → `switch-client` + `markaMerkeziAdresi('kurulum', yeniId)`. Sihirbazın son adımındaki "Bilgi bankası" adı → "Marka". |
| Ç-18 | Okuma API Hesabım'da | Sayfa platform sahibi değilse `notFound()`; `nav-sections.spec.ts` bunu tarıyor | Hesabım `#okuma-api` kartı yalnız `okumaApi.yonet` ile çizilir. Eski `/ayarlar/okuma-api` herkesi `/ayarlar/hesabim#okuma-api`ya yönlendirir (sahip değilse kart yok — varlık sızmaz). `nav-sections.spec` testini Ajan 2 Hesabım kaynağına taşır. |
| Ç-19 | Dış bağlantılar tek üreticiden | Genel Bakış / Reklam Yöneticisi "Bağlantılara git" müşteri hesabına da görünüyor (hedefi 403) | `hesaplarAdresi(musteri)` + bağlantı yalnız hedef kapısı açıksa (`markaMerkezi.gor` ya da `baglantilar` sekmesi); değilse "ajansınıza yazın" metni. Ajan 2. |
| Ç-20 | Hesap ataması tek kapı | Havuz `connection.write+manage`; kurulum ucu `client.write`; YouTube kanal ataması yalnız `connection.write` | Panel: `hesap.ata` / `kurulum.hesap`. API hizalaması: YouTube (`PATCH /autoboost/youtube/channels/:id/client`) → Ajan 2; kurulum `meta_hesap/google_hesap/sayfa` → Ajan 3 (`connection.manage` ek kontrol). **⚠ para:** kurulumun "yeni hesap aç"ı GERÇEK reklam hesabı açar — onay penceresi şart, "Eksikleri tamamla"da ASLA yok. |
| Ç-21 | Kurulum 7 adım | Workspace'e bağlı LinkedIn, YouTube, çoklu hesap, "Kaldır" 7 adıma sığmıyor (`BagliKanallar`) | Kurulum içinde blok **"Bu workspace'in hesapları ve kanalları"** (`#kanallar`), sayaca girmez. Atama YİNE Kurulum'da (kural 1). |
| Ç-22 | Hazırlık şeridi | Her bölümün üstündeydi | Kalkar. İç menüde Kurulum rozeti `kurulumSayaci` ("5 / 7"). `/clients/:id/hazirlik` ucu KALIR (listenin girdisi). |
| Ç-23 | Workspace penceresi kalkar | `MusteriKarti` + `MusteriDetay` + `ClientAssets` + `ClientActions` + `SpecialCategoryPicker` | Şirketler'de workspace **satırı**: ad, kısa ad, hesap / izlemede sayısı, ekip sayısı, durum; eylemler "Marka Merkezi'nde aç" (`switch-client` → `markaMerkeziAdresi('kurulum', id)`; şirket değişiyorsa sihirbazdaki `SirketSec` deseni), "Taşı", "Arşivle". `MusteriDetay` SİLİNMEZ: `DanismanAta` onu panel olarak kullanıyor. |
| Ç-24 | Marka Merkezi başlığı "Şirket › Workspace" | Başlık "Marka Merkezi" + açıklamada workspace adı | Kırıntı: `Base › Marka Merkezi › <bölüm>`; başlık satırı **`<Şirket> › <Workspace>`** (şirket adı oturumdaki `organization.name`; "tüm şirketler" modunda workspace'in şirketi `managerAccount.organizations`tan). Workspace seçili değilse `WorkspaceGerekli`. |
| Ç-25 | "Base tek kapısı Marka Merkezi" | CLAUDE.md §5 | Güncellendi (eski karar ve değişme sebebi korunarak). Varlıklar ayrı satır. |
| Ç-26 | Kitleler nereye | Marka Merkezi bölümü | **Varlıklar'ın 4. sekmesi** (`?sekme=kitleler`): AdvCampaign'de görsel ve form gibi SEÇİLEN malzeme; malzemenin yarısı bir ekranda yarısı diğerinde olmasın. |
| Ç-27 | Sekme adları | "Platform Bağlantıları", "Ekip & Yetkiler" | Kullanıcının yazdığı biçim: **"Platform bağlantıları"**, **"Ekip ve güvenlik"**, **"Şirketler ve workspace’ler"** (U+2019). Menü etiketi = sayfa başlığı = `metadata.title` (`nav-sections.spec.ts`). |

---

## 2. Yeni rota ağacı

```
Ayarlar (menüde tek satır; sekme çubuğu)
├── /ayarlar/sirketler            Şirketler ve workspace’ler   kapı client.write
│     #sirketler #workspaceler #arsiv #ust-hesaplar(platform sahibi)
├── /ayarlar/baglantilar          Platform bağlantıları        kapı connection.read
│     #kanallar #havuz #youtube #izlenen #tazeleme
├── /ayarlar/ekip[?workspace=]    Ekip ve güvenlik             kapı user.read
│     #kisiler #workspace-erisimi #ust-hesap-ekibi #roller #iki-adim-zorunlulugu
└── /ayarlar/hesabim[?kurtarma=1] Hesabım                      herkes (menüde değil)
      #guvenlik #e-posta(report.share) #okuma-api(platform sahibi)

Base
├── /marka-merkezi?musteri=&bolum=   Marka Merkezi             kapı client.write (tek)
│   ├── kurulum    #meta #sayfa #piksel #google #olcum #marka #varsayilanlar #kanallar #veri-kaynaklari
│   ├── marka      #marka-bilgileri #markayi-anlat #kime-satiyoruz #logo
│   └── workspace  #firma #erisim #bildirimler #veri-durumu
└── /varliklar?musteri=&sekme=[&tur=][&form=]  Varlıklar      kapı bulk.read
      gorseller · kreatifler · formlar · kitleler(client.read)

/kurulum?tur=&adim=   Yeni şirket / workspace aç (menüde yok; Şirketler'den)
```

Bilinmeyen `?bolum=` → önce `eskiMarkaMerkeziYonu` (eski kod mu?), değilse
Kurulum. `?bolum=butce` sayfada `butceAdresi`ne (değişmedi). Bilinmeyen
`?sekme=` → Görseller.

---

## 3. Eski adres → yeni adres

Kaynak: `ESKI_ADRESLER` (tek eşleme). Her eski sayfa SİLİNMEZ, tek satıra iner:
`redirect(eskiAdresYonu('<anahtar>', { musteri, aktifMusteri, id, sorgu }))`.

| Eski | Yeni |
|---|---|
| `/ayarlar/ust-hesap` | `/ayarlar/sirketler` |
| `/ayarlar/ust-hesaplar` | `/ayarlar/sirketler#ust-hesaplar` |
| `/ayarlar/musteriler` | `/ayarlar/sirketler#workspaceler` |
| `/ayarlar/musteriler/[id]/ekip` | `/ayarlar/ekip?workspace=<id>#workspace-erisimi` |
| `/ayarlar/musteriler/[id]/kanallar` | `/marka-merkezi?musteri=<id>&bolum=kurulum#kanallar` |
| `/ayarlar/senkronizasyon` | `/marka-merkezi?musteri=<adres ya da aktif>&bolum=workspace#veri-durumu` |
| `/ayarlar/e-posta` | `/ayarlar/hesabim#e-posta` |
| `/ayarlar/okuma-api` | `/ayarlar/hesabim#okuma-api` |
| `/hesabim[?kurtarma=1]` | `/ayarlar/hesabim[?kurtarma=1]` |
| `/kutuphane/bilgi-bankasi?sekme=butce` | `butceAdresi(musteri)` (sayfa önce yakalar) |
| `/kutuphane/bilgi-bankasi?sekme=logo` | `…bolum=marka#logo` |
| `/kutuphane/bilgi-bankasi?sekme=bilgi-bankasi` | `…bolum=marka#markayi-anlat` |
| `/kutuphane/bilgi-bankasi?sekme=hedef-kitle` | `…bolum=marka#kime-satiyoruz` |
| `/kutuphane/bilgi-bankasi` (diğer) | `…bolum=marka` |
| `/kutuphane/gorseller[?tur=&form=]` | `/varliklar?sekme=gorseller[&tur=&form=]`; `tur=logo` → `…bolum=marka#logo` |
| `/kutuphane/kreatifler`, `/kutuphane/formlar` | `/varliklar?sekme=kreatifler|formlar` (+ `tur`, `form`) |
| `/marka-merkezi?bolum=kurulum` | aynı |
| `?bolum=baglantilar` | `?bolum=kurulum#kanallar` |
| `?bolum=olcum` | `?bolum=kurulum#olcum` |
| `?bolum=marka` | aynı |
| `?bolum=kitleler` | `/varliklar?sekme=kitleler` |
| `?bolum=varliklar&varlik=x[&tur=&form=]` | `/varliklar?sekme=x[…]`; `tur=logo` → Marka › Logo |
| `?bolum=ayarlar` | `?bolum=workspace` |
| `?bolum=bildirimler` | `?bolum=workspace#bildirimler` |
| `?bolum=butce[&ay=]` | `butceAdresi` (değişmedi) |
| `#bilgi` (marka) | `#markayi-anlat` — **istemcide** `eskiCapaYonu` |
| `#kategori` (eski ayarlar → workspace) | `?bolum=kurulum#varsayilanlar` — istemcide |
| `#ekip` (eski ayarlar → workspace) | `#erisim` — istemcide |
| `#firma`, `#logo`, `#marka-bilgileri` | DEĞİŞMEDİ (kimlik bilerek korundu) |

**Parça (`#…`) sunucuya gitmez.** Sunucu yönlendirmesi kendi Location'ında
parça taşıyorsa o geçerli; taşımıyorsa tarayıcı eskisini korur. Bu yüzden
Marka Merkezi sayfası küçük bir istemci bileşeni taşır: `location.hash`i
`eskiCapaYonu(bolum, hash, musteri)`dan geçirir, sonuç varsa
`router.replace` (Ajan 3).

---

## 4. Her alanın TEK evi

| Alan | Ev (bileşen) | API ucu | Yazma kapısı |
|---|---|---|---|
| Şirket adı / kısa ad, şirket ekle, taşı | Ayarlar › Şirketler `#sirketler` (`SirketDuzenle`, `ust-hesap-ekrani`) | `/manager-account/organizations…`, `PATCH /organization` | `sirket.yonet` |
| Şirket silme ⚠ | aynı (`SirketSil`) | `DELETE /manager-account/organizations/:id` | `sirket.sil` |
| Workspace açma | Şirketler `#workspaceler` → sihirbaz | `POST /clients/setup` | `workspace.ekle` |
| Workspace taşıma | Şirketler | `POST /manager-account/workspaces/move` | `workspace.tasi` |
| Arşivle / geri al | Şirketler `#workspaceler` / `#arsiv` | `DELETE /clients/:id`, yeni `POST /clients/:id/geri-al` | `workspace.arsivle` / `workspace.geriAl` |
| Üst hesap (ad, paket, silme) | Şirketler `#ust-hesaplar` (`UstHesapYonetimi`) | `/manager-account/:id…` | `ustHesap.yonet` |
| Platform OAuth (bağla, yeniden yetkilendir, kaldır) | Bağlantılar `#kanallar` (`KanalKartlari`) | `/connections/authorize`, `:id/reauthorize`, `:id/disconnect` | `baglanti.yetkilendir` / `baglanti.kaldir` |
| Atanmamış hesap havuzu (toplu atama) | Bağlantılar `#havuz` (`HavuzKartlari`) | `PATCH /connections/ad-accounts/:id/client`, `social-profiles/:id/client` | `hesap.ata` |
| YouTube kanal ekleme | Bağlantılar `#youtube` | `POST /autoboost/youtube/channels` | `youtube.ekle` |
| Tüm verileri güncelle | Bağlantılar `#tazeleme` (`TopluTazeleme`) | `POST /sync/bulk-refresh` | `veri.topluGuncelle` |
| Kişiler, roller, workspace erişimi | Ekip `#kisiler` `#workspace-erisimi` (`TeamScreen`, `DanismanAta`) | `/members`, `/memberships` | `ekip.yonet` |
| Üst hesap ekibi | Ekip `#ust-hesap-ekibi` | `/manager-account/members` | `ustHesapEkibi.yonet` |
| Şirket 2FA zorunluluğu | Ekip `#iki-adim-zorunlulugu` | `PATCH /auth/2fa/sirket` | `ikiAdim.sirketZorunlulugu` |
| Kişisel 2FA | Hesabım `#guvenlik` (`IkiAdimPaneli`) | `/auth/2fa…` | herkes (kendi) |
| Rapor gönderen e-posta + imza | Hesabım `#e-posta` (`EpostaAyarlari`) | `PUT /me/email-account` | `eposta.duzenle` |
| Okuma API anahtarları | Hesabım `#okuma-api` (`OkumaApiPaneli`) | `/okuma-api/anahtarlar` | `okumaApi.yonet` |
| Meta/Google hesabı seç / aç ⚠ | Kurulum `#meta` `#google` (`KurulumBolumu` parçası) | `POST /clients/:id/kurulum/adim` | `kurulum.hesap` |
| Sayfa + Instagram | Kurulum `#sayfa` | aynı | `kurulum.hesap` |
| Piksel (aday sorusu dahil) | Kurulum `#piksel` | `/kurulum/adim`, `/hazirlama/cevap {piksel}` | `kurulum.yaz` |
| Ölçüm (GTM, GA4 tek kayıt, dönüşümler, birincil) | Kurulum `#olcum` (`OlcumBolumu` buraya katlanır) | `/kurulum/adim|tamamla`, `POST /olcum/birincil-yap`, `/connections/:id/reauthorize?kapsam=olcum` | `kurulum.yaz` (izin: `baglanti.yetkilendir`) |
| Workspace'in bütün hesap ve kanalları, izleme | Kurulum `#kanallar` (`BagliKanallar`) | havuz uçları + `PATCH ad-accounts/:id/sync` | `hesap.ata` / `hesap.izleme` |
| Diğer veri kaynakları | Kurulum `#veri-kaynaklari` (`VeriKaynaklari`, GA4 formu hariç) | `/veri-kaynaklari` | `veriKaynagi.yonet` / `veriKaynagi.yaz` |
| Kullanılmayan platform beyanı | Kurulum başlığı | yeni `PUT /clients/:id/kurulum/platformlar` | `kurulum.yaz` |
| Özel reklam kategorisi | Kurulum `#varsayilanlar` | `POST /clients/:id/hazirlama/cevap {kategori}` | `kurulum.yaz` |
| Varsayılan konum / kitle | Kurulum `#varsayilanlar` | `/hazirlama/cevap {konum}`, `PUT /audience-templates/varsayilan` | `kurulum.yaz` |
| Varsayılan günlük bütçe | Kurulum `#varsayilanlar` | `/hazirlama/cevap {butce}` | `kurulum.yaz` |
| Marka bilgileri, "Markayı anlat", "Kime satıyoruz", AI doldur | Marka `#marka-bilgileri` `#markayi-anlat` `#kime-satiyoruz` (`MarkaSekmesi`, `MetinSekmesi`, `AiDoldur`) | `POST /client-profile`, `.../ai-taslak` | `marka.yaz` |
| Logo | Marka `#logo` (`LogoSekmesi`) | `/assets` | `logo.yaz` |
| Firma, iletişim, rapor alıcıları, adres + harita konumu, vergi, IBAN, notlar | Workspace bilgileri `#firma` (`FirmaBilgileri` + `MusteriBilgiFormu`) | `PATCH /clients/:id` | `firma.yaz` |
| Bildirim kanalları | Workspace bilgileri `#bildirimler` (`BildirimlerBolumu`) | `/bildirim/kanallar…` | `bildirim.yaz` |
| Görseller, kreatifler, formlar | Varlıklar | `/assets`, `/forms…` | `varlik.yaz` |
| Kitle şablonları, özel kitleler | Varlıklar › Kitleler (`KitlelerBolumu`) | `/audience-templates` | `kitle.yaz` |

## 5. Salt okunur gösterimler → evine bağlantı

| Nerede | Ne gösterir | Bağlantı |
|---|---|---|
| Şirketler › workspace satırı | hesap/izleme sayısı, ekip sayısı, durum | "Marka Merkezi'nde aç" → `markaMerkeziAdresi('kurulum', id)` |
| Workspace bilgileri › Erişim | bu workspace'i görenler (ad, rol) | `ayarlarAdresi('ekip', { workspace: id, capa: 'workspace-erisimi' })` |
| Workspace bilgileri › firma | saat dilimi, para birimi (Ç-16) | yok (platform hesabından gelir; metin söyler) |
| Workspace bilgileri › Veri durumu | eski Senkronizasyon (`SenkronDurumu`) | hesap atanmamışsa `markaMerkeziAdresi('kurulum', id, 'kanallar')` |
| Kurulum › Marka bilgileri ve logo adımı | parçaların durumu | `markaMerkeziAdresi('marka', id, 'marka-bilgileri' | 'logo')` |
| Kurulum › kanallar bloğu | platform bağlantısı yok/yetkisi düştü | `platformBaglantilariAdresi()` |
| Varlıklar › Kitleler | "Varsayılan" rozeti | `markaMerkeziAdresi('kurulum', id, 'varsayilanlar')` |
| Varlıklar › Görseller | "N logo Marka'da" | `markaMerkeziAdresi('marka', id, 'logo')` |
| Bağlantılar › İzlenen hesaplar | atanmış hesap → workspace | `markaMerkeziAdresi('kurulum', clientId, 'kanallar')` (eski `/ayarlar/musteriler/[id]/kanallar`) |
| Genel Bakış / Reklam Yöneticisi / rehber / İyileştir / sinyal | "hesap izlenmiyor", "veri yok", "hesap ata" | `hesaplarAdresi(musteri)` |
| Bildirim zili, kanal sağlığı | yetki düştü | `platformBaglantilariAdresi()` |
| "Şimdi güncelle" düşen iş | ayrıntı | `veriDurumuAdresi(aktifMusteri)` |
| Haftalık özet, kural editörü | bildirim kanalı yok | `markaMerkeziAdresi('workspace', id, 'bildirimler')` |
| Rehber (AdvCampaign) eksikleri | hesap / logo / ölçüm / adres konumu | `hesaplarAdresi` · `…('marka', id, 'logo')` · `…('kurulum', id, 'olcum')` · `…('workspace', id, 'firma')` |

---

## 6. Yetki kapıları — bölüm başına TEK

- **Görünme kapısı (bölüm/sekme başına bir tane):** Ayarlar sekmeleri
  `AYARLAR_SEKMELERI[].izin`; Marka Merkezi'nin üç bölümü TEK kapı
  `MARKA_MERKEZI_IZNI` (`client.write`) — sayfa kapısı da bu, eskisi gibi
  bölüm bazlı farklı kapı YOK; Varlıklar `VARLIKLAR_IZNI` (`bulk.read`),
  sekmeleri `VARLIKLAR_SEKMELERI[].izin`.
- **Kart kapıları** (bölümün içinde ayrıca hassas): `erisim.gor`,
  `bildirim.gor`, `veriDurumu.gor`, `ustHesap.yonet`, `okumaApi.yonet`,
  `eposta.duzenle`.
- **Eylem kapıları:** `PANEL_KAPILARI` — her satır API ucunun
  `@RequirePermissions` + `@RequireOrgAdmin` kapısının aynası. Panelde
  `kapi(session, '…')` ile okunur; bu modülün dosyalarında
  `hasPermission(session, '…')` ya da `session.isOrgAdmin` ile elle yazılmış
  kapı KALMAZ (Ajan 4 taraması).
- **Düzeltilen uyumsuzluklar:** firma formu (`isOrgAdmin` → `firma.yaz`);
  logo (`bulk.write`, marka formundan ayrı `logo.yaz`); Bağlantılar
  `client.write` vs Kurulum `client.read` (tek sayfa kapısı); Arşivle
  (herkese görünüyordu → `workspace.arsivle`); `PATCH status` arka kapısı
  (Ç-4); YouTube ve kurulum ataması (Ç-20).
- Kapı kapalıysa düğme gizlenmez değil **gizlenir**; kartın yerinde
  `PANEL_KAPILARI[k].neden` küçük metin olarak yazar (boş alan değil).

---

## 7. Kurulum — tek sıralı liste, tek sayaç

Sıra (`KURULUM_LISTESI`) ve parçaları:

| # | Adım (`kod`) | Platform | Parçalar (kaynak:kod) |
|---|---|---|---|
| 1 | Meta reklam hesabı ve ödeme (`meta`) | meta | kurulum:`meta_hesap`, kurulum:`meta_odeme` |
| 2 | Facebook sayfası ve Instagram (`sayfa`) | meta | kurulum:`sayfa` |
| 3 | Meta pikseli (`piksel`) | meta | kurulum:`meta_piksel`, hazırlama:`piksel` |
| 4 | Google Ads hesabı ve ödeme (`google`) | google | kurulum:`google_hesap`, kurulum:`google_odeme` |
| 5 | Dönüşüm ölçümü (`olcum`) | — | kurulum: `google_izin`, `gtm_konteyner`, `ga4_mulk`, `ads_donusum`(google), `ga4_ads_bag`(google), `gtm_etiket`, `site_kodu`, `dogrulama`; hazırlama:`olcum` |
| 6 | Marka bilgileri ve logo (`marka`) — Marka'ya götürür | — | hazırlama:`site`, hazırlama:`marka`, hazırlık:`marka_bilgisi`, hazırlık:`logo` |
| 7 | Reklam varsayılanları (`varsayilanlar`) | — | hazırlama:`kategori`, `konum`, `butce` |

**Parça durumu** → birleşik sözlük: kurulum `atlandi` → `bekliyor`;
hazırlama satırı yoksa `bekliyor` (hazırlık oraya gelmedi); kaynak
okunamadıysa ya da parça yanıtta yoksa `bilinmiyor`.

**Adım durumu** (öncelik): `hata` > `soru` > `eksik` > `kullanicida` >
`bilinmiyor` > `bekliyor`; hepsi `tamam` ise `tamam`; platform beyanla
kapalıysa `kullanilmiyor`. Boş parça listesi `bilinmiyor` (asla sessiz
"tamam").

**Sayaç** (`kurulumSayaci`): `tamam` = tamam adım sayısı; `toplam` =
`kullanilmiyor` dışındaki adımlar; `bilinmiyor` AYRI yazılır ("5 / 7 · 1
okunamadı"); `bitti` = toplam > 0 ve tamam = toplam (okunamayan adım varken
asla). İç menü rozeti, Kurulum başlığı ve (ileride) Genel Bakış AYNI
fonksiyonu okur.

**"Eksikleri tamamla"** (`eksikleriTamamlaKapsami`) — tek düğme, iki uç,
sırayla: `POST /clients/:id/kurulum/tamamla` (yalnız `otomatik: true` ve
kullanılan platformun adımları), ardından hazırlama `eksik` ise
`POST /clients/:id/hazirlama`. **Asla:** gerçek hesap açmak, ödeme, OAuth,
site kodu, doğrulama, soruları cevaplamak. Düğmenin yapamadığı her bitmemiş
adım `kullaniciyaKalan` listesinde NEDENİYLE yazılır. `yapacakVar` false ise
düğme pasif ve sebebi yazılı. **Ajan 3 (API):** `tamamla` beyanı okuyup
kullanılmayan platformun adımlarını atlar (bugün atlamıyor; panel süzgeci tek
başına koruma değil).

**Ekran düzeni (Ajan 3, Google Ads "kurulum rehberi" mantığı):** başlıkta
sayaç + "Eksikleri tamamla" + "Kullanmadığım platform" seçimi; altında yedi
satır (numara, ad, durum rozeti, kısa sonuç, tek birincil eylem); satır
açılınca parçalar ve nedenleri. Altında `#kanallar` ve `#veri-kaynaklari`
blokları (sayaca girmez, başlıkta bunu söyler).

---

## 8. Kaldırılacak dosyalar / korunacak bileşenler

**Kaldırılacak** (hiçbir veri silinmez; yalnız panel kodu):

| Dosya | Neden | Sahip |
|---|---|---|
| `components/tenancy/yonetim-paneli.tsx` | ölü kod (hiçbir yerde çizilmiyor); `musteri-arama.spec.ts` ve `musteri-detay-alanlari.spec.ts` onu okuyor → testler de güncellenir | Ajan 2 |
| `components/tenancy/musteri-karti.tsx` | workspace penceresi kalkıyor | Ajan 2 |
| `components/tenancy/client-assets.tsx` | pencerenin üçüncü atama arayüzü (kural 1) | Ajan 2 |
| `components/tenancy/client-actions.tsx` | yerine workspace satırı eylemleri | Ajan 2 |
| `components/marka-merkezi/hazirlik-listesi.tsx` | şerit kalkıyor (Ç-22); `HAZIRLIK_MADDE_TANIMI` testlerdeyse taşınır | Ajan 3 |
| `components/marka-merkezi/varliklar.ts` (+ spec) | `/kutuphane/*` linkli eski varlık listesi; Base geçişiyle | Ajan 3 |
| `components/marka-merkezi/workspace-ayarlari.tsx` | yerine Workspace bilgileri bölümü (yeni dosya) | Ajan 3 |
| `bolumler.ts`ın eski içeriği (`MM_BOLUMLERI`, `mmAdresi`, `varlikYonu`, `bilgiBankasiYonu`, `MM_VARLIKLARI`) | sözleşmeye taşındı | Ajan 3 |
| `nav-sections.ts` `BASE_SATIRLARI_ESKI` / `AYARLAR_SATIRLARI_ESKI` / `AYAR_KISA_AD_ESKI` | geçiş sonrası | Ajan 3 / Ajan 2 |
| `app/(dashboard)/ayarlar/ust-hesap|ust-hesaplar|musteriler/**|senkronizasyon|e-posta|okuma-api/page.tsx`, `app/(dashboard)/hesabim/page.tsx`, `kutuphane/**/page.tsx` | SİLİNMEZ — tek satırlık yönlendirmeye iner | Ajan 2 / Ajan 3 |

**Korunacak** (yerini değiştirir, içeriği aynı): `UstHesapEkrani`,
`SirketDuzenle`, `SirketSil`, `UstHesapYonetimi`, `WorkspaceBolumu` (satır
listesine sadeleşir), `MusteriArama`, `MusteriDetay` (`DanismanAta` ve
`DetaySatiri` için), `MusteriBilgiFormu`, `TeamScreen`, `TeamManager`,
`DanismanAta`, `RolMatrisi`, `UstHesapEkibi`, `IkiAdimSirketAyari`,
`IkiAdimPaneli`, `EpostaAyarlari`, `OkumaApiPaneli`, `KanalKartlari`,
`HavuzKartlari`, `YouTubeKanalEkle`, `YouTubeKanalBul`, `IzlenenHesaplar`,
`TopluTazeleme`, `BagliKanallar`, `KurulumBolumu`, `OlcumBolumu`,
`HazirlamaKarti` (soruları Kurulum adımlarına dağılır), `VeriKaynaklari`,
`FirmaBilgileri`, `BildirimlerBolumu`, `SenkronDurumu`, `MarkaSekmesi`,
`MetinSekmesi`, `LogoSekmesi`, `AiDoldur`, `KitlelerBolumu`, `IlgiSecici`,
`OzelKitleSecici`, `GorsellerIcerik`, `KreatiflerIcerik`, `FormlarIcerik`,
`AssetLibrary` (logo süzgeci çıkar), `SpecialCategoryPicker` (görünüş;
kaydı `/hazirlama/cevap`a, Ç-10), `KurulumSihirbazi`, `HesapSecimi`.

---

## 9. Dosya sahipliği (Ajan 2 ‖ Ajan 3 — çakışmasın)

**ORTAK — Ajan 1 yazdı.** Değişiklik gerekiyorsa Ajan 1'e (orkestratöre) döner:
`packages/shared/src/panel/**`, `packages/shared/src/kurulum/index.ts`
(platform beyanı kısmı), `apps/web/src/lib/panel-adresleri.ts`,
`apps/web/src/lib/nav-hedef.spec.ts`. **İzinli tek dokunuşlar:**

- `apps/web/src/lib/nav-sections.ts`: Ajan 2 YALNIZ `const AYARLAR_SATIRLARI`
  satırını `_YENI`ye çevirir, `AYARLAR_SATIRLARI_ESKI` ve `AYAR_KISA_AD_ESKI`yi
  siler; Ajan 3 YALNIZ `const BASE_SATIRLARI` satırını çevirir,
  `BASE_SATIRLARI_ESKI`yi ve `VARLIK_YOLLARI` içe aktarımını siler.
- `apps/web/src/lib/panel-adresleri.spec.ts`: her ajan mandal listelerinden
  (`ELLE_ADRES_GECIS_ISTISNASI`, `ESKI_URETICI_GECIS_ISTISNASI`,
  `API_GECIS_ISTISNASI`, `YONLENDIRME_BEKLEYEN`) YALNIZ kendi dosyasının
  satırını siler. Ajan 3 `MM_ESKI_BOLUM_BEKLIYOR`u `false` yapar.
- `apps/web/src/lib/nav-sections.spec.ts`: Ajan 2 Ayarlar'a özgü blokları
  (`korumali` listesindeki `/ayarlar/*`, "Okuma API" describe'ı, "Üst Hesaplar
  üyelikle" describe'ı, AJANS ROLLERİ ve MÜŞTERİ HESABI'ndaki eski etiketler)
  yeni yapıya çevirir; Ajan 3 Base'e özgü iki testi ("Base bölümünün TEK
  kapısı", Marka Merkezi kapısı) çevirir.

**AJAN 2 — Ayarlar tarafı (panel + API):**

- `app/(dashboard)/ayarlar/**` (layout, yeni `sirketler/`, yeni `hesabim/`,
  `baglantilar/`, `ekip/` ve bütün eski sayfaların yönlendirmesi),
  `app/(dashboard)/hesabim/page.tsx`, `app/(dashboard)/kurulum/page.tsx`
- `components/tenancy/**` **hariç** `bagli-kanallar.tsx`,
  `musteri-bilgi-formu.tsx`, `special-category-picker.tsx` (bunlar Ajan 3)
- `components/ust-hesap/**`, `components/kurulum/**`, `components/connections/**`,
  `components/email/**`, `components/okuma-api/**`, `components/hesap/**`,
  `components/ayar-sekmeleri.tsx`, `components/kapsam-secici.tsx`,
  `components/kenar-cubugu.tsx`, `components/nav.tsx` (gerekirse),
  `components/auth/iki-adim-giris.tsx`, `components/workspace-gerekli.tsx`,
  `components/bildirim/bildirim-zili.tsx`, `components/refresh-button.tsx`,
  `components/report/rapor-gonder.tsx` (metin)
- `app/(dashboard)/dashboard/page.tsx`, `app/(dashboard)/ads-explorer/page.tsx`
  (Ç-19), `app/(legal)/veri-silme/page.tsx` (metin)
- API: `modules/tenancy/clients.controller.ts` + `clients.service.ts`
  (Ç-4), `modules/alerts/uyari-kurallari.ts` ve
  `modules/connections/connections.service.ts` (shared üretici),
  `modules/autoboost/autoboost.controller.ts` (YouTube atama kapısı, Ç-20),
  metinler: `common/utils/ad-account-assignment.ts`,
  `modules/autoboost/autoboost-read.service.ts`,
  `modules/autoboost/gecmis-icerik.service.ts`, `modules/forms/forms.service.ts`,
  `queue/lead-sync.service.ts`, `google-check.ts` ("Platform bağlantıları")

**AJAN 3 — Marka Merkezi + Varlıklar tarafı (panel + API + migration):**

- `app/(dashboard)/marka-merkezi/page.tsx`, yeni `app/(dashboard)/varliklar/`,
  `app/(dashboard)/kutuphane/**` (yönlendirme)
- `components/marka-merkezi/**`, `components/bilgi-bankasi/**`,
  `components/assets/**`, `components/sync/**`,
  `components/tenancy/bagli-kanallar.tsx`, `musteri-bilgi-formu.tsx`,
  `special-category-picker.tsx`
- Dış tüketiciler: `components/rehber/adim-amac-nerede.tsx`, `adim-kime.tsx`,
  `rehber-ekrani.tsx`, `components/iyilestir/kreatifler-sekmesi.tsx`,
  `sinyaller-sekmesi.tsx`, `components/report/haftalik-ozet.tsx`,
  `components/rules/rule-editor.tsx`, `lib/sinyal.ts`, `lib/veri-kaynagi.ts`
  (metin), `components/strateji/matris-bolumu.tsx` (metin),
  `components/autoboost/boost-on-ayarlari-formu.tsx` (metin)
- API: `modules/sync/sync.controller.ts` (`status?clientId=`, Ç-12),
  `modules/kurulum/**` (platform beyanı ucu, `oku`/`tamamla` beyanı okur,
  hesap kapısı Ç-20), yeni migration `workspace_kurulum.kullanilmayan_platformlar`
  (AYRI dosya, migration yazmadan hemen önce `git pull`), metinler:
  `modules/tenancy/hazirlik.ts` ("Hedef kitle" → "Kime satıyoruz",
  "Bağlantılar’daki hazırlık kartında" → "Kurulum'da"),
  `modules/autoboost/youtube-otomatik.service.ts` (`LOGO_YERI` → "Marka
  Merkezi › Marka › Logo"), `modules/autoboost/youtube-kanal-bul.service.ts`
  ("Workspace ayarları" → "Workspace bilgileri")

Paylaşılan tip GEREKİRSE (ör. `/clients?arsiv=1` satırı, `/sync/status`
gövdesi değişirse) ajan kendisi tanımlamaz, Ajan 1'e döner.

---

## 10. Testler

**Mevcut, yeşil kalmalı:** `nav-sections.spec.ts` (sayfa/başlık taraması
geçişle yeni satırları otomatik kapsar), `panel-tasarim.spec.ts` (kart kalıbı,
`sayfa-baslik`), `marka-merkezi.spec.ts`, `bolumler.spec.ts`,
`varliklar.spec.ts`, `kurulum.spec.ts`, `sinyal.spec.ts`,
`bilgi-bankasi/sekmeler.spec.ts`, `musteri-arama.spec.ts`,
`musteri-detay-alanlari.spec.ts` — eski yapıya özgü iddiaları SAHİBİ çevirir
(silmez: aynı kararın yeni hâlini kilitler).

**Yeni (Ajan 1, yazıldı):**

- `panel-adresleri.spec.ts` — üreticiler (sıra, boş değer, çapa, kodlama),
  eski adreslerin tamamı (13 sayfa + 6 `?bolum=` + 3 `#çapa`), parametre
  kaybı (`kurtarma`, `tur`, `form`, `tur=logo`), kapılar (rol matrisiyle),
  Kurulum listesi/sayaç/düğme kapsamı, platform beyanı şeması, ve MANDAL
  taramaları: (a) panelde elle `'/ayarlar…'`, `'/marka-merkezi…'`,
  `'/varliklar…'`, `'/kutuphane/'`, `'/hesabim'`, `'/kurulum…'` yazan dosya,
  (b) eski üretici (`mmAdresi`/`varlikYonu`/`bilgiBankasiYonu`) çağıran dosya,
  (c) API'de panel yolu yazan dosya, (d) eski sayfanın `eskiAdresYonu('<anahtar>'`
  çağırması, (e) Marka Merkezi'nin `eskiMarkaMerkeziYonu(` çağırması. Mandal:
  liste yalnız küçülür; düzeltilen dosya listede kalırsa da düşer.
- `nav-hedef.spec.ts` — hedef menü: Base iki satır, Ayarlar üç satır +
  Hesabım menü dışında, müşteri hesabı tam dört ekran, Reklam Yöneticisi
  Şirketler'i görür, eski satırlar yok, geçiş anahtarlarının biçimi.
- Mutasyonla doğrulandı: istisna satırı silinince "yeni ihlal", sahte satır
  eklenince "bayat istisna", sayfa `eskiAdresYonu` çağırınca "bekleyen bayat",
  shared'da öncelik sırası / platform süzgeci / org yöneticisi kontrolü
  bozulunca ilgili testler düştü (shared her mutasyonda yeniden derlendi).

**Ajan 2/3 yazacak:**

- Her yeni sayfa: kart çapaları `AYARLAR_CAPALARI` / `MARKA_MERKEZI_CAPALARI`
  ile birebir (`id="…"` kaynak taraması; çapa listede var, sayfada yok =
  kırık bağlantı).
- Bu modülün dosyalarında `hasPermission(session, '` / `session.isOrgAdmin`
  kalmadığı (kapılar `kapi(…)` ile) — kaynak taraması.
- Ajan 2: `/clients?arsiv=1`, `POST /clients/:id/geri-al` ve `PATCH status`
  kapısı — PGlite, `SET ROLE` + `RETURNING` (CLAUDE.md RLS deseni), mutasyon.
- Ajan 3: platform beyanı ucu + kolon (migration ÜRETİM SIRASIYLA,
  `pglite-harness` uyarısı), `tamamla`nın beyanı okuduğu, `/sync/status?clientId`
  başka workspace'i reddettiği (izolasyon).

**Ajan 4'ün kapısı:** dört mandal listesi BOŞ ve `MM_ESKI_BOLUM_BEKLIYOR =
false`; iki geçiş anahtarı `_YENI`; `_ESKI` sabitleri yok; panel ve API
typecheck, web ve API testleri yeşil; shared derlemesi ÇIKTISIYLA temiz.

---

## 11. Kullanıcıya görünen eski adlar (metin)

"Workspace ayarları" → **Workspace bilgileri**; "Bilgi bankası" / "Hedef
kitle" (Marka'da) → **Markayı anlat** / **Kime satıyoruz**; "Marka Merkezi ›
Bağlantılar" → **Marka Merkezi › Kurulum**; "Marka Merkezi › Kitleler /
Varlıklar" → **Varlıklar › Kitleler / Görseller**; "Ölçüm'de kur" →
**Kurulum › Dönüşüm ölçümü**; "Senkronizasyon Durumu" → **Veri durumu**;
"E-posta Ayarları" → **Hesabım › E-posta**; "Platform Bağlantıları" →
**Platform bağlantıları**; "Ekip & Yetkiler" → **Ekip ve güvenlik**;
"Açılış" → **Yeni şirket / workspace aç**. Dosyalar § 9'daki sahipte; tam
liste `grep -rnE "Workspace ayarlar|Bilgi [bB]ankası|Senkronizasyon Durumu|E-posta Ayarları|Ekip &|Platform Bağlantıları|Marka Merkezi › (Bağlantılar|Kitleler|Varlıklar|Ölçüm)"`.

## 12. Tasarım (Ajan 6 denetler)

Önce görsel: Ajan 3 Kurulum listesi ve Workspace bilgileri için, Ajan 2
Şirketler satırı için tarayıcıda taslak gösterir (CLAUDE.md "Önce görsel,
sonra kod"). Kart `rounded-xl border border-line bg-surface`, sayfa başlığı
`sayfa-baslik`, renkler kılavuzun dördü; durum rozetleri yeşil yalnız durum
için. Google Ads mantığı: Ayarlar = Google Ads "Yönetici" ekranları (sekme
çubuğu); Marka Merkezi Kurulum = Google Ads kurulum kontrol listesi (numaralı,
tek birincil eylem); Varlıklar = "Öğe kitaplığı" (sekmeler). Mobilde sekme
çubuğu yatay kayar, sayfa kaymaz.

## 13. Ölçmediklerim / açık kalanlar

- Next `redirect()` hedefindeki `#parça`nın istemci tarafı gezinmede (RSC)
  korunduğu **gözle ölçülmedi**; düşerse yalnız çapa kaybolur, sayfa doğru.
- GA4 iki kaydının (kurulum ↔ veri kaynağı) ayrışan mülk taşıyıp taşımadığı
  (Ç-8) üretimde sayılmadı.
- Sihirbazın özel kategoriyi `PATCH` ile yazıp "cevaplandı" bayrağını basmadığı
  (Ç-10) — kod okunarak çıkarıldı, çalıştırılmadı.
- `TeamScreen`'de workspace süzgecinin maliyeti (üye sayısı) ölçülmedi.
- Hazırlama `konum` cevabının her seferinde YENİ bir "Varsayılan" şablon
  açtığı (`hazirlama.service.ts`) — mevcut davranış; Kurulum'da "Değiştir"
  sık kullanılırsa Kitleler'de aynı adlı şablonlar birikir. Ajan 3 ya mevcut
  varsayılanı günceller ya da ekranda yazar.

---

## 14. Sapmalar ve devir notları (Ajan 2 ‖ Ajan 3, 2026-10-13)

İki ajan aynı sözleşmeden (9a85bb0c) paralel çalıştı; notları birleştirmede
yan yana bırakıldı. Birleştirmenin kapattığı maddeler 14c'de.

### 14a. Ajan 2 devir notu (Ayarlar tarafı)

**Yapılan:** dört sekme (`/ayarlar/sirketler`, `/baglantilar`, `/ekip[?workspace=]`,
`/hesabim`), başlıkta kapsam satırı (`components/ayar-kapsam.tsx`: Ajans / Şirket /
Kişisel), `AYARLAR_SATIRLARI` → `_YENI` (`_ESKI` ve `AYAR_KISA_AD_ESKI` silindi),
workspace penceresi kalktı (satır + "Marka Merkezi'nde aç" / "Taşı" / "Arşivle"),
`#arsiv` kartı + `GET /clients?arsiv=1` + `POST /clients/:id/geri-al`
(`client.delete` + org yöneticisi, `client.restored` denetim kaydı), `PATCH
/clients/:id` `status` → 403 (`durumYazabilirMi`), Üst hesaplar kartı ve kapsam
seçicideki bağlantı yalnız platform sahibine, Ekip tek yer (`WorkspaceErisimi`),
YouTube kanal ataması `connection.write + connection.manage`, eski Ayarlar
adreslerinin dokuzu `eskiAdresYonu` ile yönleniyor, `yonetim-paneli.tsx`,
`musteri-karti.tsx`, `client-assets.tsx`, `client-actions.tsx` silindi, API'nin
panel yolları shared üreticiden (`uyari-kurallari.ts` uyarının workspace'ini
taşıyor, `connections.service.ts#VARSAYILAN_DONUS`). Mandal listelerinde Ajan 2
dosyası KALMADI (`ELLE_ADRES`, `API_GECIS`, `YONLENDIRME_BEKLEYEN`).

**Ajan 2 sapmaları:**

| # | Sapma | Neden |
|---|---|---|
| S2-1 | Shared'a `ArsivWorkspaceSatiri` (tenant.schema.ts) eklendi | `?arsiv=1` satırının sözleşmede tipi yoktu; en küçük ekleme |
| S2-2 | `app/(dashboard)/layout.tsx` iki satır: `yonetimGorunur: ayarSekmesiAcik(session,'sirketler')`, `ustHesaplarGorunur: kapi(session,'ustHesap.yonet')` | Ç-3'ün kapsam seçici kısmı layout'tan prop ister; dosya § 9'da kimseye verilmemişti |
| S2-3 | `MusteriArama` silindi; arama `WorkspaceSatirlari`nın içinde | Kart → satır geçişiyle bileşenin tek tüketicisi kalmadı; `musteri-arama.spec.ts` yeni dosyaya çevrildi (silinmedi) |
| S2-4 | Şirket panelindeki "Workspace taşı" kaldırıldı, taşıma SATIRIN eylemi (hedef: diğer şirketler) | Ç-23 satırda "Taşı" istiyor; iki yol aynı işi ters yönden yapıyordu |
| S2-5 | Sihirbazda "Yeni üst hesap" kartı `sirket.yonet` (org yöneticisi) istiyor | Eski kart yalnız `org.write` sınıyordu, servis `assertOrgAdmin` ile reddediyordu |
| S2-6 | `KanalKartlari`na `kaldirabilir` (`baglanti.kaldir`) | "Kaldır" tek bayrakla (`connection.manage`) çiziliyordu, API org yöneticisi istiyor |
| S2-7 | `components/marka-merkezi/marka-merkezi.spec.ts` (Ajan 3) bir iddia: eski kanallar sayfası artık yönlendiriyor | Sayfa Ajan 2'nin; iddia yalnız o satırda değişti |
| S2-8 | `ust-hesap-ekrani` şirkete geçiş hatasını yutuyordu (`.catch(() => setGecis(false))`) → satırın altında yazıyor | `ayarlar.spec.ts` taraması buldu |
| S2-9 | Yeni yardımcılar: `lib/ayar-kapilari.ts` (`ayarSekmesiAcik`, `hesaplarHedefi`, `HESAP_AJANSTA`) | Sekme kapısı ve Ç-19 kararı tek yerde |

**Ölçülmeyen / açık kalan:**

- Ekranlar tarayıcıda GÖZLE görülmedi (MIMARI § 12 "önce görsel"): Şirketler
  satır tablosu, Hesabım üç kartı, Ekip workspace süzgeci. Derleme (`next build`)
  ve kaynak taramaları yeşil; tasarım denetimi Ajan 6'da.
- Ç-10 kontrol edildi, KAPANMADI: sihirbaz kategoriyi `POST /clients/setup`
  gövdesinde yazıyor, hazırlamanın "cevaplandı" bayrağını basmıyor. Kategori
  SEÇİLDİYSE hazırlama onu cevaplanmış sayıyor (`c.kategoriler.length > 0`);
  "hiçbiri" seçildiyse soru Kurulum'da bir kez daha soruluyor. Düzeltme
  `hazirlama.service.ts`te (kimseye verilmemiş modül) — orkestratör kararı.
- `lib/nav-sections.ts` `ELLE_ADRES_GECIS_ISTISNASI`nda kalıyor: içindeki
  elle yol `BASE_SATIRLARI_ESKI` (Ajan 3 silince liste satırı da silinmeli).
- API'de "Platform Bağlantıları" eski adı bu modülün dışındaki altı dosyada
  duruyor (`leads.service.ts`, `leadgen-webhook.service.ts`, `draft-tree.service.ts`,
  `ad-builder.service.ts`, `geri-besleme.service.ts`, `boosts/*`): § 9'da sahibi yok.
- Arşiv kartı yalnız `workspace.geriAl` kapısında (org yöneticisi) listeyi
  çekiyor; RLS arşivliyi zaten yalnız ona gösteriyor. Diğerlerine kapının
  sebebi yazıyor.

### 14b. Ajan 3 sapmaları (Marka Merkezi + Varlıklar)

- **Ç-10 özel kategori — yazma İKİ uçtan, ekran TEK.** İlk beyan (soru
  bekliyorsa) `/hazirlama/cevap {kategori}`; beyan verildikten sonra
  değiştirmek `PATCH /clients/:id` (`SpecialCategoryPicker`). Sebep:
  hazırlama ucu bekleyen soru yokken cevabı BİLEREK reddediyor (Ajan 4 Ö6,
  "konut beyanı ayar ekranı dışından sessizce silinmesin") ve
  `modules/hazirlama/**` § 9'da kimseye verilmemiş. Ekran tek (Kurulum ›
  Reklam varsayılanları); "cevaplandı" bayrağı ilk beyanla zaten basılı.
  Ölçülmedi: PATCH'ten sonra hazırlama adımının `baslik`ı eski kategoriyi
  "Yeniden hazırla"ya kadar gösterebilir (adım listesinde, panelde
  seçicinin değeri doğru).
- **Ç-9 varsayılan konum.** Soru bekliyorsa `/hazirlama/cevap {konum}`;
  değilse MEVCUT şablondan seçim (`PUT /audience-templates/varsayilan`),
  yeni konum Varlıklar › Kitleler'de şablon olarak. § 13'teki "her
  Değiştir'de yeni Varsayılan şablonu" birikmesi böylece kapandı.
- **`/kurulum` sihirbazının adı ve son adımı YAPILMADI**: `app/(dashboard)/
  kurulum/page.tsx` ve `components/kurulum/**` § 9'da Ajan 2'nin; paralel
  çakışmamak için dokunulmadı (görev listesinde Ajan 3'e de yazılıydı).
- **`panel-adresleri.spec.ts` › eski üretici taraması**: liste BOŞALINCA
  "en az bir ihlal var" iddiası imkânsız oldu; yerine desenin kendisi
  sınanıyor (boşa düşme bekçisi korunarak).
- **Kurulum yazmaları aktif workspace şartı** (mevcut API kuralı,
  `kurulum.service.ts#erisim`): adresteki workspace oturumdakinden farklıysa
  liste bunu önceden söylüyor; platform beyanı da aynı kurala bağlı.
- **Sözleşme eki YOK**: `KurulumListesiParcasi` tipi panel kapısından
  (`panel-adresleri.ts`) yeniden dışa aktarılmıyordu; doğrudan
  `@advetics/shared`tan okunuyor, ortak dosyaya dokunulmadı.
- **§ 9 dışı iki spec**: `autoboost/boost-yonlendirme-metni.spec.ts` ve
  `youtube-otomatik.spec.ts` `LOGO_YERI` metnini kilitliyordu; metin
  değişince (Ajan 3'ün dosyası) iddialar yeni ada çevrildi.

### 14c. Birleştirme (Ajan 2 ‖ Ajan 3, 2026-10-13)

- `lib/nav-sections.ts`: iki geçiş anahtarı da `_YENI`
  (`BASE_SATIRLARI_YENI`, `AYARLAR_SATIRLARI_YENI`); her iki taraf kendi
  `_ESKI` sabitini silmişti, birleşik dosyada hiç `_ESKI` yok.
- Bu yüzden `lib/nav-sections.ts` `ELLE_ADRES_GECIS_ISTISNASI`ndan çıktı.
  Mandal listelerinin HEPSİ boş (`ELLE_ADRES_GECIS_ISTISNASI`,
  `ESKI_URETICI_GECIS_ISTISNASI`, `API_GECIS_ISTISNASI`,
  `YONLENDIRME_BEKLEYEN`); kalıcı istisna yalnız `app/robots.ts`.
- `marka-merkezi.spec.ts`: Ajan 2'nin eski kanallar sayfasının yönlendirdiği
  iddiası (S2-7) korundu.
- **Ç-17 doğrulandı:** `/kurulum` adı `ACILIS_ADI`; sekme başlığı artık
  sabitten türüyor (elle dize yoktu ama ayrışabilirdi), "Workspace'e geç"
  önce `switch-client`, sonra `markaMerkeziAdresi('kurulum', yeniId)`.
  İkisi `kurulum.spec.ts`te kilitli (mutasyonla ölçüldü).
- **Ç-10 KAPANDI:** beyan yolu hazırlamadan `hazirlama/kategori-beyani.ts`e
  çıkarıldı (sütun + `client.updated` denetim kaydı + `kategori_cevaplandi`
  bayrağı, tek işlemde); hazırlama cevabı ve açılış sihirbazı İKİSİ de onu
  çağırıyor. `clientSetupSchema.specialAdCategories` varsayılansız:
  sihirbaz her zaman gönderiyor (boş liste = "hiçbiri" beyanı), Bağlantılar'daki
  toplu açılış göndermiyor ve beyan sayılmıyor. Yazılamazsa kurulum geri
  alınmıyor, `failures`ta `kind: 'kategori'` ile yazıyor. Shared sözleşmesine
  iki küçük ek: alanın varsayılanı kalktı, `failures.kind`e `'kategori'`.
  § 13'teki Ç-10 maddesi bununla kapandı. Ölçülmedi: canlıda sihirbazla
  açılan bir workspace'in Kurulum'unda sorunun çıkmadığı gözle görülmedi.
