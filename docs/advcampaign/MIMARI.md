# Pilot — yapay zekâ ile hesap yönetimi · Mimari (Ajan 1 çıktısı)

> **Tarih:** 2026-10-07 · **Plan:** [`AJAN-PLANI.md`](AJAN-PLANI.md) · **Sözleşme (kod):**
> `packages/shared/src/pilot/` · **Sözleşme testi:** `apps/api/src/modules/pilot/sozlesme.spec.ts` (62 test)
> · **Kabul listesi:** [`KABUL-LISTESI.md`](KABUL-LISTESI.md) (174 madde) · **Arayüz:** [`pilot-arayuz.html`](pilot-arayuz.html)
>
> Ajan 2 ve Ajan 3 bu belge ile sözleşmeden okur, tip TANIMLAMAZ. Sözleşme değişirse önce burası ve
> `packages/shared/src/pilot/` güncellenir, shared derlemesi ÇIKTISIYLA koşulur.
>
> "Pilot" bu belgede modülün iç adı: AdvStrategy ekranındaki **plan** + AdvCampaign ekranındaki
> **kurulum** ve **öneri kartları**. Menü adları değişmiyor (AdvStrategy, AdvCampaign).

## 0. Kararların sözleşmeye işlenişi

| # | Karar (2026-10-07) | Sözleşmede nerede |
|---|---|---|
| Ç-1 | Bütçe/süre/konum/adres sorulmaz; kaynak genişler, model rakam üretmez | `Kaynakli<T>`, `KAYNAK_TURLERI`, `sayisalKaynakliSchema` (yz_metin sayısal hücrede ret), `yzMetniDenetle`, `degisiklikCumleyleUyumluMu` |
| Ç-2 | Özel kategori workspace başına bir kez | `SatirdanTaslakBaglami.ozelKategoriler` (Marka Merkezi kaynaklı), `pilotTaslakEksikleri` OZK-SORU |
| Ç-3 | Öneri + tek dokunuş; kendiliğinden değişiklik yok | `KENDILIGINDEN_UYGULAMA = false`, `kendiligindenUygulanabilirMi` (açılsa bile artırmaz) |
| Ç-4 | Uyum denetçisi Tur 1'in ilk işi; geçmeden gerçek yayın yok | `uyum.ts` (`uyumDurumu`: denetim yoksa `bagli_degil`), `yayinKipi`, `onayKapisi` |
| Ç-5 | Google duraklatılmış kurulur (K-02) | `PilotTaslak.acilis = 'duraklatilmis_kalir'`, `KURULUM_SATIR_DURUMLARI.duraklatilmis_kuruldu` |
| Ç-6 | Müşteri onayı yayını başlatır; ajansın yayın düğmesi yok | yeni izin `strategy.publish`, `PILOT_PLAN_GECISLERI.kurulum_basla.yazan = ['worker']`, `onayKapisi` |
| Ç-7 | Her şey baştan; canlı dersleri yeniden ödenmez; eski modül silinmez | `KABUL-LISTESI.md`, karar M-1 (§1) |
| Ç-8 | Taslak yönü onaylı | Ajan 3 (§7) |

## 1. Temel kararlar (Ajan 1)

- **M-1 · "Baştan" neyi kapsıyor** (S-2 kararıyla KESİN). Servisler, uçlar, tablolar, kuyruk işleri ve ekranlar YENİ.
  `packages/shared/src/reklam/` altındaki SAF kurallar (para zinciri, `enCokHarcama`, niyet kataloğu,
  `hedeflemeUret`, `derleMeta` + manifesto, yankı/geri okuma, prova gövdesi, form) yeni motorda İÇE
  AKTARILIR, ikinci kopyası yazılmaz. Gerekçe CLAUDE.md "aynı şeyi üreten ikinci fonksiyon doğduğu anda
  ayrışır" + Ç-7'nin "canlıda öğrenilenler yeniden ödenmeyecek" kuralı: o fonksiyonlar kabul listesinin
  71 maddesinin bugünkü, mutasyonla sınanmış hâli.
- **M-2 · Meta bütçesi dönem toplamı (lifetime).** Müşteri onay ekranındaki "en çok" sözü tam tutar
  olsun diye (`META_DONEM_BUTCE_TIPI`). Google günlük (`GOOGLE_DONEM_BUTCE_TIPI`, satır tutarı ÷ kalan
  gün); Google'ın günlük 2 kat esnekliği müşteri özetinde ayrı cümleyle yazılır.
- **M-3 · Plan toplamı = ayın harcanmamış kalanı** (S-7, kullanıcı kararı 2026-10-07): aylık bütçe −
  o ay şimdiye kadar harcanan (`PlanUretGirdisi.ayHarcanan: Kaynakli<bigint> | null`). Harcanan
  bilinmiyorsa (veri yok / senkron eski) toplam BOŞ + `harcanan_bilinmiyor`, gün oranına düşülmez;
  harcanan ≥ bütçe ise toplam 0 değil BOŞ + `ay_butcesi_bitti`. "Senkron eski" eşiğini Ajan 2 belirler
  (öneri: hesabın son metrik işi dünden eski ise `null`). İlk sürümdeki gün oranı kaldırıldı.
- **M-4 · Yuvarlama.** Her pay tam para birimine aşağı; artık en büyük paya; satır toplamı plan
  toplamına TAM eşit (testte, mutasyonla).
- **M-5 · Dönüşümsüz platform.** Başka platform dönüşüm getirirken sıfır dönüşümlü platform plana
  girmez ve `disaridaKalanlar`da nedeniyle yazılır (sessiz sıfır bütçeli satır yok).
- **M-6 · Kitlesiz katman.** Payı yeni kitleye eklenir, satırın notunda yazılır.
- **M-7 · Varlık seçimi.** Ölçülüp sonuç getirenler sonuç başı maliyete göre, sonra hiç ölçülmemişler
  en yeniden; harcayıp sonuç getirmemiş varlık HİÇ seçilmez.
- **M-8 · Yapay zekâ.** Gemini (`apps/api/src/yapay-zeka/gemini.ts`), Anthropic SDK yok. Üç yerde:
  (a) plan gerekçe paragrafı (`yzMetniEkle`, plandaki sayılar dışında sayı getiremez), (b) "değiştir"
  cümlesini `PlanDegisikligi[]`ye çevirme (sayılar cümlede geçmeli), (c) reklam metni (`PilotTaslak.metinler`,
  yasal uyarı kontrolüyle). Model çağrısı düşerse plan yine üretilir; gerekçe `yz_yazmadi`.
- **M-9 · Hash.** `planKanonikIcerik` / `pilotTaslakKanonikIcerik` shared'da, SHA-256 API'de
  (`node:crypto`). Taslak özetine kaynak ZAMANI girmez, kaynak türü ve kimliği girer.

## 2. Veri modeli (Ajan 2 migration'ları)

Hepsi `org_id` + `client_id` taşır (`client_id` denormalize, RLS join'siz), kompozit FK
`(client_id, org_id) → clients(id, org_id)`. **`org_id` HEDEF MÜŞTERİDEN** ("tüm şirketler" modu).
Durum kolonları `VARCHAR + CHECK` (enum değil: yeni durum CHECK değiştirerek eklenir); CHECK listeleri
shared sabitlerinden ve bir spec ikisini karşılaştırır. Para `BIGINT` micros, dönem `CHAR(7)`, tarih `DATE`.

| Tablo | Ana kolonlar | Not |
|---|---|---|
| `pilot_planlari` | `id`, `donem`, `durum` (`PILOT_PLAN_DURUMLARI`), `surum`, `icerik_ozeti CHAR(64)`, `para_birimi`, `toplam_micros`, `aylik_butce_id` (SET NULL), `onaylanan_surum`, `onaylanan_ozet`, `onay_rolu` (`musteri`/`ajans`), `onaylayan_user_id`, `onay_zamani`, `musteri_adina_gerekce`, `yayin_kipi` (`gercek`/`test`/`kapali`, onayda yazılır, sonra değişmez), `musteri_notu` (değişiklik isteği), `created_by`, zamanlar | Kısmi tekil `(client_id, donem) WHERE durum NOT IN ('kuruldu','kapatildi','iptal')`. CHECK: `durum='onaylandi'…` ise onay alanları dolu; `onay_rolu='ajans'` ise gerekçe ≥ 20 |
| `pilot_plan_surumleri` | `plan_id` (CASCADE), `surum`, `icerik JSONB` (`PlanOnerisi`, `planOnerisiSchema` ile yazılır VE okunur), `icerik_ozeti`, `kaynak` (`uretici`/`degisiklik`/`yeniden_hazirla`), `cumle` (değiştir kutusu), `yazan`, `created_at` | DEĞİŞMEZ: içerik kolonları trigger'la kilitli (taslak_surumu deseni), `client_id/org_id` taşınabilir. Tekil `(plan_id, surum)` |
| `pilot_uyum_denetimleri` | `plan_id`, `surum`, `icerik_ozeti`, `katalog_surumu`, `bulgular JSONB`, `an`, `created_at` | Değişmez uyum raporu (TASARIM §10.9). Onay anındaki denetim `onay_denetim_id` ile plana bağlanır |
| `pilot_uyum_isaretleri` | `plan_id`, `surum`, `kural_kimligi`, `mesaj`, `user_id`, `zaman` | Yalnız ajans rolü (servis); tekil `(plan_id, surum, kural_kimligi)` |
| `pilot_kurulum_satirlari` | `plan_id`, `onaylanan_surum`, `satir_anahtari`, `platform`, `durum` (`KURULUM_SATIR_DURUMLARI`), `taslak JSONB` (`PilotTaslak`), `taslak_ozeti`, `prova JSONB`, `platform_mesaji`, `farklar JSONB`, `deneme`, `ad_account_id`, zamanlar | Tekil `(plan_id, onaylanan_surum, satir_anahtari)`: yarıda düşen kurulum tekrar denenince açılmış satır ikinci kez açılmaz |
| `pilot_nesneleri` | `kurulum_satir_id`, `tur` (kampanya/set/kreatif/reklam/form/google_*), `ad`, `platform_kimligi`, `durum` (`NESNE_DURUMLARI` aynen), `derlenmis_govde JSONB` (değişmez), `beklenen_yanki JSONB` | `yayin_nesnesi` deseni; `kayit_belirsiz`te `gonderiliyor` kalır |
| `pilot_taramalari` | `id`, `ad_account_id`, `baslangic`, `bitis`, `taranan JSONB` (reklam/kelime/terim sayıları), `kart_sayisi`, `not` | `succeeded + 0 kart` ile "hiç koşmadı" ayrı (K-05) |
| `pilot_onerileri` | `tarama_id`, `ad_account_id`, `tur` (`ONERI_TURLERI`), `hedef_seviye`, `hedef_nesne_id`, `hedef JSONB`, `neden`, `olculer JSONB`, `beklenen_etki JSONB`, `eylem JSONB`, `geri_alma JSONB`, `durum` (`ONERI_DURUMLARI`), `gecerlilik_sonu`, `platform_mesaji`, `uygulayan`, `uygulama_zamani`, `geri_alan`, `geri_alma_zamani` | Kısmi tekil `(hedef_nesne_id, tur) WHERE durum IN ('yeni','uygulaniyor','sonuc_belirsiz','geri_aliniyor')` (`ONERI_ACIK_DURUMLARI`) |

### Üç durak (CLAUDE.md §3)

| Tablo | `pglite-harness` TRUNCATE | `02_rls.sql` | `WORKSPACE_TABLOLARI` |
|---|---|---|---|
| `pilot_planlari` | ekle | `client_id` SELECT/INSERT/UPDATE; DELETE YOK (iptal edilir) | **taşınır** ("Pilot planı") |
| `pilot_plan_surumleri` | ekle | SELECT/INSERT; UPDATE/DELETE YOK | taşınır |
| `pilot_uyum_denetimleri` | ekle | SELECT/INSERT | taşınır |
| `pilot_uyum_isaretleri` | ekle | SELECT/INSERT | taşınır |
| `pilot_kurulum_satirlari` | ekle | SELECT (müşteri dahil); INSERT/UPDATE yalnız worker (BYPASSRLS) | taşınır |
| `pilot_nesneleri` | ekle | SELECT; yazma yalnız worker | taşınır |
| `pilot_taramalari` | ekle | SELECT; yazma yalnız worker | taşınır |
| `pilot_onerileri` | ekle | SELECT; UPDATE (durum) servis üzerinden; INSERT worker | taşınır |

**Taşınma gerekçesi:** plan workspace'in kararı; kurulum ve nesneler o kararın platformdaki ayakizi.
Geride bırakılsalar RLS onları kimseye göstermez ve satırlar sessizce erişilemez olur.
**Hesap el değiştirirse** (`hesap-verisi-tasima.ts`): `pilot_nesneleri` ve `pilot_kurulum_satirlari`
"platformun aynası" sınıfında TAŞINIR, `pilot_planlari`/`pilot_onerileri` "birinin kararı" sınıfında
kalır ve sayısı söylenir. Ajan 2 iki listeye de karar satırı ekler.

### Eski tablolarla ilişki ve geçiş

- `strateji_*` ve `reklam_taslagi`/`yayin*`/`adv_*` tabloları DOKUNULMADAN durur, veri silinmez.
  Yeni plan eski plana bağlanmaz; aynı ay için hem eski hem yeni plan olabilir (iki ekran da açıkken).
  **S-4 KARARI:** geçiş süresince bir ay için iki plan olabilir; yeni plan açılırken
  aynı ayın açık eski planı varsa ekran bunu söyler; eski plan kendiliğinden iptal EDİLMEZ.
- Okunan eski tablolar: `monthly_budgets` (workspace geneli satır), `insights_daily` (hesap seviyesi,
  90 gün), `client_profiles`, `audience_templates`, `assets` + reklam seviyesi metrikler,
  `strateji_kelimeleri` (kelime fikirleri, varyantları tekilleştirilmiş), `search_term_insights`,
  `asset_platform_refs`, `ajans_ayari` (atıf + yazma kesici).
- Kitle şablonunun katmanı şemada YOK; Ajan 2 `ozelKitleler` alt türünden türetir (WEBSITE → yeniden
  pazarlama, etkileşim → sıcak, yoksa soğuk; türetilemezse `null` ve plana girmez).
- Eski modül, yeni motor canlı turdan geçince TEK commit'te kalkar (kod), tablolar kalır.

## 3. Uçlar

Tek kaynak `PILOT_UCLARI` (`packages/shared/src/pilot/uclar.ts`, 16 uç). Hepsi `withTenant`; platform
çağrıları (prova, kurulum, öneri uygulama) kuyrukta ve transaction DIŞINDA.

| Uç | İzin | Not |
|---|---|---|
| `GET /pilot/planlar` | `strategy.read` | gösterilen/toplam |
| `POST /pilot/planlar/hazirla` | `strategy.write` | `planUret` → sürüm 1 → (ayrı, kısa) Gemini gerekçesi → `yzMetniEkle`; reddedilirse gerekçesiz |
| `GET /pilot/planlar/:id` | `strategy.read` | sürüm + `musteriOzeti` + `uyumDurumu` + yapılabilir eylemler |
| `POST /pilot/planlar/:id/yeniden-hazirla` | `strategy.write` | taze girdiyle; elle değişiklikler varsa önce uyarı (`onay: true` ister) |
| `POST /pilot/planlar/:id/degistir` | `strategy.write` | `planDegistirSchema`; `cumle` varsa `degisiklikCumleyleUyumluMu`; `degisiklikUygula`; 409 bayat sürüm |
| `POST /pilot/planlar/:id/uyum-isaret` | `strategy.write` | yalnız ajans rolü |
| `POST /pilot/planlar/:id/eylem` | `strategy.write` | `musteriye_gonder` (uyum ENGEL/işaretsiz UYARI yoksa ve bütün satırlar kurulabilirse) · `geri_cek` · `yeniden_dene` · `kapat` · `iptal` |
| `POST /pilot/planlar/:id/degisiklik-iste` | `strategy.read` + rol müşteri | not zorunlu; plan `taslak`a döner |
| `POST /pilot/planlar/:id/onayla` | `strategy.publish` | `FOR UPDATE` → TAZE uyum denetimi + TAZE Aylık Bütçe → `onayKapisi` → `onaylandi` + `yayin_kipi` → kurulum işi kuyruğa |
| `GET /pilot/planlar/:id/kurulum` | `strategy.read` | `kurulumOzeti` |
| `GET /pilot/planlar/:id/pdf` | `strategy.read` | rapor PDF altyapısı |
| `GET /pilot/bugun` | `bulk.write` | Pilot açılışı |
| `GET /pilot/oneriler` | `bulk.write` | durum süzgeci, gösterilen/toplam |
| `POST /pilot/oneriler/:id/uygula` | `bulk.publish` | taze hedef okuması → `oneriBayatMi` → kuyruk |
| `POST /pilot/oneriler/:id/gec` | `bulk.write` | |
| `POST /pilot/oneriler/:id/geri-al` | `bulk.publish` | `geriAlma` adımı |

## 4. Yetki

- **Yeni izin `strategy.publish`** (ONAY = YAYIN): `client_viewer`, `ad_manager`, `admin` (ALL).
  `strategy.approve`tan ayrı çünkü o anahtar para harcamıyordu; yeniden anlamlandırmak, override ile
  almış birine sessizce harcama yetkisi verirdi. `rol-yetkileri.spec.ts` müşteri listesine TARİHLİ
  İSTİSNA olarak eklendi (64 test yeşil); `nav-sections`/`nav-routes` (29) yeşil; menü değişmedi.
- **Müşterinin onayı nasıl sınırlı** (`onayKapisi`, sunucu son kapı): yalnız kendi workspace'i (RLS +
  `client_viewer` workspace kapsamlı rol); yalnız `musteride` plan; istek sürüm + içerik özeti taşır ve
  saklananla aynı olmalı; plan toplamı o ayın TAZE okunan Aylık Bütçe'sini aşamaz; kurulamayan satır
  yok; uyum ENGEL/işaretsiz UYARI/bayat denetim yok; aynı sürüm ikinci kez onaylanamaz; plan yazamaz.
  Müşteri ekranı toplam, gün, EN ÇOK tutarı kendi dilinde görür (`musteriOzeti`).
- **Müşteri adına onay** (ajans rolü, S-1 KARARI): gerekçe ≥ 20 karakter, `onay_rolu = 'ajans'`, ekranda,
  PDF'te ve müşterinin plan görünümünde "Ajans müşteri adına onayladı" + gerekçe + zaman AYRI görünür;
  müşteri sonradan görür. Bu ikinci bir "evet" değil, müşterinin yerine geçen tek evet.
- Pilot okuma `bulk.write` (AdvCampaign menü izniyle aynı), uygulama `bulk.publish`. Yeni izin açılmadı.
- `permission_overrides` taşıyan kullanıcılar yeni izni rol tanımından alır (strateji'deki not aynen):
  Ajan 4 üretimde override'lı kullanıcıları listelemeli.

## 5. Durum makineleri (sözleşmede, testte)

- **Plan** (`PILOT_PLAN_GECISLERI`, her geçişte `yazan`): `taslak →(ajans) musteride →(müşteri|ajans)
  onaylandi →(worker) kuruluyor →(worker) kuruldu | kismen_kuruldu`; `kismen_kuruldu →(ajans) kuruluyor |
  kapatildi`; `musteride →(ajans geri_cek | müşteri degisiklik_iste) taslak`; `taslak|musteride|onaylandi
  →(ajans|sistem) iptal`. Son: `kuruldu`, `kapatildi`, `iptal`. Sistem iptali: dönem geçti, onaylanmadı.
- **Kurulum satırı** (`KURULUM_GECISLERI`, `KURULUM_SINIFI satisfies Record`): prova → kuruluyor (PAUSED) →
  geri okuma → açma / duraklatılmış / test kipi / kapalı. `kayit_belirsiz` yeniden kurulmaz. Kapalı kipte
  kurulmayan satır başarı SAYILMAZ (plan `kismen_kuruldu`, uyum bağlanınca `yeniden_dene`).
- **Öneri** (`ONERI_GECISLERI`): `yeni → uygulaniyor → uygulandi → geri_aliniyor → geri_alindi`;
  `yeni → gecildi | bayat`; `uygulaniyor → sonuc_belirsiz → (worker uzlaştırma)`. Son: `gecildi`, `bayat`,
  `geri_alindi`.

### 5.1 Uyum denetçisi (Tur 1, ilk iş)

Sözleşme `pilot/uyum.ts`: `UyumBulgusu`, `UyumDenetimi`, `UyumIsareti`, `uyumDurumu`, `bulgulariSirala`.
Kural kataloğu ve `uyumDenetle` saf fonksiyonu `packages/shared/src/uyum/` altında (TASARIM.md §10.1.3
tarifi; ikinci denetçi yazılmaz). **S-5 KARARI:** katalog shared'da (panel ve API aynı denetçi); Ajan 2 kataloğu VERİ olarak yazar,
tipler bu sözleşmede sabit, Ajan 1 inceler. Katalog yokken `uyumDurumu(null) = 'bagli_degil'` ve gerçek yayın kapalı kalır —
boş bulgu listesi "geçti" sayılmaz (mutasyonla kilitli).

## 6. Ajan 2 iş listesi (sırayla)

**Tur 1**
1. Uyum denetçisi: `packages/shared/src/uyum/katalog/` (GENEL + FORM_KVKK + KONUT + FINANS paketleri
   önce), `uyumDenetle(plan|taslak, profil, katalogSurumu, baglam)`; `pilot_uyum_*` tabloları.
2. Migration'lar (§2) + üç durak + CHECK ↔ sabit spec'i + üretim sırası testi (yeni tablolar).
3. `planUret` girdisini kuran okuyucu (90 gün hesap seviyesi, İstanbul penceresi, atanmış hesaplar,
   kitle katmanı türetme, varlık performansı reklam seviyesinden, kelime fikirleri). Gemini gerekçesi.
4. Plan uçları + `degistir` (Gemini → `PlanDegisikligi[]`, sayı doğrulaması) + eylemler + onay.
5. `satirdanTaslak` bağlamını kuran okuyucu (sayfa, IG, konum kopyası, özel kategori, adres, form,
   taban negatifler) + Gemini reklam metni + `pilotTaslakEksikleri`.
6. Toplu prova + kurulum işçisi: satır başına iş, hesap yazıcı kilidi, prova kotası sırası, yazma
   kesici her POST'tan önce, `derleMeta`/`provaGovdeleri`/`geriOkumaKarsilastir` İÇE AKTARILIR. Plan
   durumu `kurulumOzeti`nden.
7. Controller ↔ `PILOT_UCLARI` kaynak taraması, modül kaydı taraması.

**Tur 2**: tarama işi (günlük, `sync_jobs` deseni), dört karar fonksiyonu (`oneri.ts`), uygula/geri al
işleri (taze okuma, belirsizde uzlaştırma). **Tur 3**: Google kurulum (K-02), Veri adımı → plan girdisi.

## 7. Ajan 3 iş listesi

1. AdvStrategy tek sayfa plan belgesi (`pilot-arayuz.html` "Kasım planı"): özet (toplam · beklenen
   sonuç · kampanya) → bütçe şeridi → kampanya satırları → kelimeler → alt çubuk ("Müşteriye gönder").
   Her sayının yanında kaynak çipi (`Kaynak.tur` → etiket, `aciklama` alt satır, `kimlik` → bağlantı).
   Boş hücre `emptyReason` → "ne yapmalı" cümlesi (`BOS_NEDENLERI` başına bir metin; tablo tek yerde).
2. "Değiştir" kutusu (her ekranın altında).
3. Müşteri görünümü: `musteriOzeti.cumleler`, "Onayla" / "Değişiklik iste". Uyum/test kipi müşteriye
   yazılmaz; ajans görünümünde `ajansNotu` yazılır.
4. AdvCampaign açılışı Pilot (`/pilot/bugun`, öneri kartları, kurulum listesi). Dört hâl ayrı.
5. Eski `reklam/ui.tsx`, `.adv-*` süsleri, strateji matris tablosu: yeni ekran canlıdan geçince kalkar.
Kapı: typecheck, `nav-sections`, `panel-tasarim`, mobilde yatay kaydırma yok, tıklama sayımı ≤ 3+1.

## 8. Ajan 5 ölçüm listesi

| # | Ne | Nasıl | Neyi açar |
|---|---|---|---|
| Ö-1 | Meta toplu prova kotası: 6 satırlık planda 5 dk/2 prova kuralıyla toplam süre | Profaj hesabı, test kipi | Kurulum ekranındaki "tahmini süre" |
| Ö-2 | Meta dönem toplamı (lifetime) bütçenin geri okumada aynı dönmesi + `end_time` zorunluluğu | test kipi, geri okuma | M-2 kararı |
| Ö-3 | Google aylık sınır kuralı (30,4 × günlük) ve kısmi ayda davranış | Google belge + K-01 hesabı | `musteriOzeti` Google en çok formülü |
| Ö-P1 | Harcayıp dönüşmeyen eşiği (7 gün, 2× maliyet) yanlış alarm oranı | son 90 günde geriye dönük tarama, kartları elle değerlendir | `HARCAYIP_DONUSMEYEN` |
| Ö-P2 | Yorulan kreatif (frekans 3,5, CTR −%30, 5.000 gösterim) | aynı | `YORULAN_KREATIF` |
| Ö-P3 | Negatif aday (30 gün, 10 tık, 1× maliyet) | `search_term_insights` | `NEGATIF_ADAY` |
| Ö-P4 | Bütçe hızı (%20, 3 gün) | `monthly_budgets` × `insights_daily` | `BUTCE_HIZI` |
| Ö-4 | Tıklama sayımı: plan + kurulum (hedef 3 + müşteri 1) | panelde gerçek akış | AJAN-PLANI §2 hedefi |

## 9. KARARLAR (2026-10-07; eski "açık sorular")

| # | Karar | Kim | Sözleşmede |
|---|---|---|---|
| S-1 | **Evet:** ajans müşteri adına onaylayabilir; gerekçe zorunlu, kayıtta "ajans onayladı" ayrı görünür, müşteri sonradan görür | kullanıcı | `onayKapisi` GEREKCE, `PILOT_PLAN_GECISLERI.onayla.yazan`, `onay_rolu` |
| S-2 | **Hayır:** derleyici ve saf kurallar içe aktarılır (M-1 aynen) | kullanıcı | §1 M-1; kabul listesinde 71 "YENİDEN KULLANILIR" |
| S-3 | Varsayılan değerler kalır (60/40, 60/25/15), ekranda "ajans kuralı" kaynağıyla | koordinatör | `GECMISSIZ_PLATFORM_PAYI_YUZ`, `META_KATMAN_PAYI_YUZ` |
| S-4 | Geçişte aynı ay için eski + yeni plan olabilir; ekran söyler, eski plan kendiliğinden iptal edilmez | koordinatör | Ajan 2/3 |
| S-5 | Uyum kataloğunu Ajan 2 yazar (`packages/shared/src/uyum/katalog/`, veri), Ajan 1 inceler | koordinatör | `uyum.ts` tipleri sabit |
| S-6 | Uyum sonradan bağlanırsa ajans **"Şimdi kur"** (`yeniden_dene`) ile başlatır; müşteriye yeniden sorulmaz. Plan sürümü ve içerik özeti aynı kaldığı sürece onay geçerli | kullanıcı | `PILOT_PLAN_GECISLERI.yeniden_dene` (ajans); Ajan 2: `yeniden_dene` öncesi `onaylanan_ozet = icerik_ozeti` kontrolü + TAZE `uyumDurumu = 'gecti'` ise `yayin_kipi` `gercek`e güncellenir (onaydan sonra değişen TEK alan, denetim kaydıyla) |
| S-7 | **Değişti:** plan toplamı = ayın harcanmamış kalanı (aylık bütçe − o ay harcanan); bilinmiyorsa boş + neden, bitmişse boş + "bütçe bitti" | kullanıcı | §1 M-3, `ayHarcanan`, `harcanan_bilinmiyor`, `ay_butcesi_bitti` (3 test, 4 mutasyon) |
| M-2 | Meta dönem toplamı bütçe | koordinatör (kabul) | `META_DONEM_BUTCE_TIPI` |
| M-5 | Dönüşümsüz platform plana girmez, nedeni yazılır | koordinatör (kabul) | `disaridaKalanlar` |

**Ajan 2 notu (S-7 × onay):** `onayKapisi` plan toplamını Aylık Bütçe ile karşılaştırıyor (aşamaz).
Onaya kadar geçen sürede o ay harcama sürerse "toplam + taze harcanan > bütçe" olabilir; bu bugün RET
DEĞİL (her cari ay planı birkaç saatte bayatlardı). Ekran onay anında taze kalanı gösterir; fark
plan toplamının %5'ini aşarsa ajans görünümünde "yeniden hazırla" önerisi.

## 10. DEVİR NOTU (Ajan 1 → Ajan 2, 3, 4)

**Yapıldı**
- Sözleşme `packages/shared/src/pilot/`: `kaynak.ts` (Kaynakli/Hucre/şemalar/yz süzgeci), `plan.ts`
  (girdi/çıktı tipleri, şema, adlı sabitler, plan durum makinesi, değişiklik tipi), `plan-uret.ts`
  (`planUret`, `degisiklikUygula`, `yzMetniEkle`, `planKanonikIcerik`), `taslak.ts` (`satirdanTaslak`,
  `pilotTaslakEksikleri`), `uyum.ts`, `onay.ts` (`onayKapisi`, `musteriOzeti`, `yayinKipi`), `kurulum.ts`,
  `oneri.ts` (dört karar fonksiyonu + kart + durum makinesi), `uclar.ts`; `index.ts` dışa aktarımı.
- Yeni izin `strategy.publish` (+ `rol-matrisi` satırı ve müşteri açıklaması), `rol-yetkileri.spec.ts`
  tarihli istisna.
- 60 sözleşme testi; 25 mutasyon, üçü ilk turda BOŞ çıktı (sonuçsuz varlık dolgusu, `kapat` çıkışı,
  Google kısa dönem en çok) → test eklendi, üçü de düşüyor. 25/25 düşüyor.
- `KABUL-LISTESI.md` (174 madde).
- Kapı: shared build temiz (çıktısıyla), API typecheck temiz, web typecheck temiz.

**Ölçülmedi**
- Hiçbir canlı ölçüm (Ö-1…Ö-4, Ö-P1…P4). Eşikler ilk tahmin.
- Google aylık 30,4 kuralının kısmi ayda davranışı; Meta lifetime bütçenin geri okuması.
- `planUret` gerçek bir workspace verisiyle hiç koşmadı (girdi okuyucusu Ajan 2'de).
- API test paketinin tamamı koşulmadı; yalnız ilgili spec'ler (pilot 60, rol-yetkileri + strateji 64,
  web nav 29).

**Güncelleme (2026-10-07, ikinci commit):** §9 kararları işlendi; S-7 için `planUret` girdisine
`ayHarcanan` eklendi, gün oranı kaldırıldı; 62 sözleşme testi, S-7 dört mutasyonu da testi düşürüyor.

**Açık kalan**: uyum kataloğu (S-5, Ajan 2); migration/servis/işçi (Ajan 2); ekranlar (Ajan 3);
kabul listesindeki 67 "AJAN 4" maddesi ve yeni tabloların RLS testleri (Ajan 4).
