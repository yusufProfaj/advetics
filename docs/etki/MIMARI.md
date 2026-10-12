# Paket C: Değişiklik etkisi (Ajan 1 · Mimar)

**Tarih:** 2026-10-12 · **Girdi:** [`../rakip-analizi/ORPHEX-BOSLUK.md`](../rakip-analizi/ORPHEX-BOSLUK.md)
§1 B-6 ve §2 "Paket C" · **Sözleşme:** `packages/shared/src/etki/`
(derleme çıktısıyla temiz, `apps/api/src/modules/etki/sozlesme.spec.ts` 34 test,
8 kritik kural mutasyonla doğrulandı) · **Taslak:** [`taslak.html`](taslak.html)
· **Kardeş:** [`../haftalik-ozet/MIMARI.md`](../haftalik-ozet/MIMARI.md) (Paket B
bu modülü okuyor) · **Durum:** Ajan 1 bitti; Ajan 2-3 Paket A canlıya alındıktan
sonra (modüller sırayla, CLAUDE.md "beş ajan").

"Uyguladık, işe yaradı mı?" Advetics'ten yapılan her değişiklik (durdurma,
bütçe) için, değişiklikten 7 gün sonra: değişiklik öncesi 14 gün ile sonrası
arasındaki fark, aynı hesabın DEĞİŞMEYEN varlıklarının aynı dönemdeki farkından
çıkarılarak (fark içinde fark). Hacim yetmezse "Henüz belli değil" ve pencere
14, sonra 28 güne uzar. Ağır istatistik yok, platform çağrısı yok.

---

## 0. Çelişki tablosu

Kullanıcı karar yetkisini oturum yöneticisine devretti (2026-10-12). "Öneri"
sütunu Mimar'ın önerisi ve tasarım ONU varsayarak tamamlandı. **"Öneri,
yönetici onayına"** işaretli satırlar yöneticinin onayını bekliyor; reddedilirse
değişecek sözleşme yeri satırda yazılı. "Mimar (§5)" saf arayüz/teknik karar.

| # | Brief diyor | Depo gerçeği | Öneri | Karar |
|---|---|---|---|---|
| Ç-C1 | Üç kaynak: `campaign-actions` geri okuması, `RuleActionLog`, `IyilestirOneriKarar` | (a) `CampaignActionsService`in İKİ yolu da (`applyAction`, `uygula`) her yazmada `audit_logs`a `action='<seviye>.<tip>'`, `target_id = bizim UUID` yazıyor; İyileştir, Reklam Yöneticisi, asistan, (Paket A) Sinyal Uygula hepsi bu servisten geçiyor. (b) `IyilestirOneriKarar` AYNI değişikliğin gerekçesi, ayrı değişiklik değil. (c) Kural motoru `audit_logs`a da yazıyor ama `target_id`ye PLATFORM kimliğini koyuyor (`rule-executor.service.ts#writeAudit`) | İki kaynak: `audit_logs` (kampanya eylemi, `actor_type <> 'rule'`) + `rule_action_logs` (`outcome='applied'`, `entity_id` UUID). İyileştir kararı ikinci kaynak DEĞİL (her uygulama iki kez ölçülürdü), yalnız `yol` eşlemesi için okunur (`DEGISIKLIK_KAYNAKLARI`, testte `rule.*` reddi kilitli) | Mimar (depodan doğrulandı) |
| Ç-C2 | "Uygula kartının altında" | `audit_logs` değişikliğin HANGİ ekrandan geldiğini taşımıyor | `CampaignActionsService`e isteğe bağlı `iz {yol, ref}`; denetim `after.iz`ine yazılır (`DENETIM_IZ_ANAHTARI`). Eski İyileştir satırları `iyilestir_oneri_karar` ile BİR KEZ eşlenir (aynı varlık, ±10 dk); eşleşmeyen `bilinmiyor` ("Panel") kalır, tahmin edilmez | Mimar (§5) |
| Ç-C3 | "Değişiklik öncesi N gün vs sonrası, 7 gün sonra" (Orphex: 60 gün önce / 7 gün sonra, ≥200 tık) | Dönüşümler 3 gün geç oturuyor (Paket A `ANOMALI.donusumGecikmesiGun`); 60 günlük öncesi mevsimselliği (bayram, ay başı) kıyasa sokar | Öncesi **14 gün**, sonrası **7 gün**; ilk sonuç değişiklikten **11 gün** sonra (7 + 3 gün dönüşüm bekleme + 1). Hacim yetmezse pencere **14**, sonra **28** güne uzar; 28'de de yetmezse "Belli olmadı" ve kapanır. Ekran ilk gün "Etki 23 Ekim'de ölçülecek" der | **KABUL (yönetici, 2026-10-12).** Ret hâlinde: `ETKI.oncesiGun`, `olcumNoktalariGun` |
| Ç-C4 | "Her değişikliğin etkisi" | Durdurulan varlığın kendi metriği sıfıra iner: "durunca maliyeti düştü" ölçüm değil tanım | **Bütçede varlığın kendisi, durdurmada ÜSTÜ** ölçülür (reklam → reklam seti, set → kampanya). Kampanya durdurmanın üstü hesap ve kontrol grubu kurulamaz: "Ölçülemedi · karşılaştırma grubu yok" + GÖZLEM ("durmadan önce günde 420 ₺ harcıyordu, sonra 0 ₺"), hüküm yok (`olcumKapsami`) | **KABUL (yönetici, 2026-10-12).** Ret hâlinde (kampanya durdurmaya da hüküm): hesap seviyesinde düz önce/sonra, kontrolsüz ve "mevsimden de olabilir" uyarılı |
| Ç-C5 | "Kontrol grubu aynı hesabın değişmeyen kampanyaları" | Meta CBO'da bir reklam setini durdurmak bütçeyi KARDEŞ setlere aktarıyor | Kontrol = aynı hesap, aynı seviye, pencerede bizim değişikliğimiz olmayan ve iki pencerede de harcaması olan varlıklar. Reklam seti kapsamında **aynı kampanyanın setleri kontrolden çıkar** (`kontroldenCikar`); kontrole koymak etkiyi yarıya indirirdi, hata vermeden | Mimar (§5) |
| Ç-C6 | "Yetersiz hacimde Henüz belli değil; eşikler sabit dosyada ölçülecek" | (yeni) | Hüküm metriği dönüşüm başı maliyet (her pencerede ≥15 dönüşüm), yetmezse tıklama başı maliyet (≥200 tık, Orphex) ve ekran bunu söyler. Etki ≥%15 ve **plasebo** farkının 2 katı olmalı: aynı hesaplama değişiklikten ÖNCEKİ iki pencere arasında yapılır, hesabın olağan gürültüsünü verir. Gürültülü hesapta %25 "henüz belli değil · dalgalanma", sakin hesapta %5 "belirgin fark yok". Hepsi `ETKI` sabitinde "ÖLÇÜLECEK" | Mimar (§5) |
| Ç-C7 | Platform dışı değişiklikler ikinci adım | Meta arayüzünden ya da MCP'den yapılan bütçe değişikliği bizim penceremize düşerse sonuç onu da içerir ve bunu göremiyoruz | v1 yalnız kendi kayıtlarımız; ekranda "Ölçülmeyen değişiklikler" satırı (`OLCULMEYEN_DEGISIKLIKLER`) ve her sonuçta "Meta/Google arayüzünden aynı dönemde değişiklik yaptıysanız sonuç onu da içerir" notu. v2: Meta `activities`, Google `change_event` aynı tabloya `kaynak='platform'` ile | Mimar (brief kararı) |
| Ç-C8 | Sonuç Paket B özetinde | Müşteri hesabı İyileştir'i görmüyor (`rule.read` yok) | Etki ekranı ajansın (`rule.read`). Müşteri, haftalık özetin "Bu hafta yaptıklarımız" ve "Ölçülen etkiler" bölümlerinde görür; **kötüleşen sonuçlar dahil, hepsi**: seçerek göstermek beyaz etiketli raporda güveni bozar | **KABUL (yönetici, 2026-10-12).** Ret hâlinde: müşteri özetinde yalnız `iyilesti` + `fark_yok` (Paket B `OZET_BOLUM_KITLESI`e süzgeç) |
| Ç-C9 | Ekran yeri | İyileştir önerileri haftalık yeniden hesaplanıyor; uygulanmış kart o hafta görünür, sonra kaybolur | **İyileştir › Etkisi** sekmesi (kalıcı liste) + o hafta görünen uygulanmış kartın altında tek satır ("Etki 23 Ekim'de ölçülecek" / sonuç). Ayrı sayfa yok | Mimar (§5) |
| Ç-C10 | (yeni) Hesap başka workspace'e taşınırsa | `hesap-verisi-tasima.ts`: karar kaydı kalır, platform aynası taşınır | Etki satırı karar kaydı gibi **KALIR** (`HESABIN_KENDI_VERISI`ne girmez). Ölçüm penceresinde taşındıysa "Ölçülemedi · hesap taşındı" | Mimar (§5) |
| Ç-C11 | (yeni) Geçmiş değişiklikler | `audit_logs` ve `rule_action_logs` geriye dönük duruyor | Keşif ilk koşuda **60 gün** geriye bakar: deploy günü ilk sonuçlar görünür, ekran boş başlamaz | Mimar (§5) |
| Ç-C12 | (yeni) Doğrulanmamış değişiklik | `uygula` geri okuması `uyusmadi` yazabiliyor | "Ölçülemedi · platformda doğrulanmadı"; olmamış olabilecek bir değişikliğin etkisini ölçmek uydurma olurdu. `applyAction` yolu (geri okumasız) platformun döndürdüğü `afterState` ile doğrulanmış sayılır | Mimar (§5) |
| Ç-C13 | Paket sırası (Ç-O2: A → B → C) | Paket B özeti Paket C'nin etkilerini okuyor | **A → C → B.** C yalnız veritabanı okuyor ve A'ya bağlı değil; B hem A'yı hem C'yi okuyor. B önce gelirse "etkiler" bölümü ilk sürümde boş ve neden'siz kalır | **KABUL (yönetici, 2026-10-12).** |

---

## 1. Neyin nerede olduğu (okunan dosyalar)

| Konu | Yer | Rolü |
|---|---|---|
| Kampanya eylemi kaydı | `campaign-actions.service.ts` `applyAction` (`audit.record`, `before {status, budgetMode, budgetAmountMicros}`, `after = afterState`) ve `uygula` (`after {istenen, dogrulama, platformDegeri}`) | Kaynak 1 |
| Kural eylemi | `rule_action_logs` (`entity_id` UUID, `before_state/after_state`, `outcome='applied'`), `rules.client_id` | Kaynak 2 |
| Kuralın denetim satırı | `rule-executor.service.ts#writeAudit` (`target_id = entityExternalId`, `actor_type='rule'`) | Keşifte DIŞARIDA |
| İyileştir kararı | `iyilestir_oneri_karar` (`anahtar`, `eylem.varlik.id`, `durum='uygulandi'`, `sonuc.durum`) | Yalnız `yol` eşlemesi |
| Günlük metrik | `insights_daily` (hesap TZ'sinde `date`, `spend_micros`, `clicks`, `conversions`) | Ölçüm |
| Yazılamayan | `googleYazilamazMi` (Google VIDEO), LinkedIn (yazma yok), Google kural (`GOOGLE_KURAL_KAPALI`) | Bu yollar satır üretmez, ölçülecek bir şey yok |

## 2. Veri modeli (Ajan 2)

### `degisiklik_etkileri`

Durum kolonları **varchar + CHECK** (enum değil; liste shared'da kapalı, Ajan 4
CHECK ile shared listesini iki yönlü karşılaştırır, `fatura-zip.spec.ts` deseni).

| Kolon | Tip | Not |
|---|---|---|
| id | uuid PK | |
| org_id, client_id | uuid NOT NULL | org_id HEDEF müşteriden (`musteriOrgId`), `ctx`ten değil; kompozit FK `clients` |
| ad_account_id | uuid NOT NULL | FK `ad_accounts` |
| platform | `Platform` | |
| kaynak | varchar(20) | CHECK `DEGISIKLIK_KAYNAKLARI` |
| kaynak_id | varchar(64) | `audit_logs.id` (bigint, metin) ya da `rule_action_logs.id`; **UNIQUE (kaynak, kaynak_id)** = keşif idempotent |
| yol, yol_ref | varchar(20), varchar(200) NULL | CHECK `DEGISIKLIK_YOLLARI` |
| kim | varchar(255) NULL | Keşif anında KOPYA (kural adı / kullanıcı adı); `users`a INNER JOIN yasak (RLS dersi) |
| tur | varchar(16) | CHECK `DEGISIKLIK_TURLERI` |
| seviye | `EntityLevel` | değişen varlık |
| varlik_id | uuid | |
| varlik_adi, ust_adi | varchar(300) | KOPYA (varlık silinse de okunur, `rule_action_logs` deseni) |
| kapsam_seviye | `EntityLevel` | `olcumKapsami` |
| kapsam_id | uuid | durdurma + kampanya: ad_account id |
| kapsam_adi | varchar(300) | |
| once_deger, sonra_deger | jsonb | bütçe micros STRING, mod; durdurmada durum |
| degisiklik_zamani | timestamptz | |
| degisiklik_gunu | date | HESAP saat diliminde (`insights_daily.date` ile aynı) |
| birlikte_olculen | smallint default 0 | `birlikteOlculenler` |
| durum | varchar(12) | CHECK `ETKI_DURUMLARI` |
| sonuc | varchar(20) NULL | CHECK `ETKI_SONUCLARI` |
| neden | varchar(20) NULL | CHECK `ETKI_NEDENLERI` |
| metrik | varchar(30) NULL | |
| etki_orani | numeric NULL | |
| nokta_gun | smallint NULL | |
| sonraki_olcum | date NULL | `etkiPencereleri(...).hesaplanabilir` |
| olcum | jsonb NULL | KANIT: dört/altı pencere toplamı, kontrol varlık sayısı, eşik, plasebo (ekran ve denetim için) |
| gozlem | jsonb NULL | `EtkiGozlemi` (kontrolsüz durdurma) |
| created_at, updated_at | timestamptz | |

İndeksler: `UNIQUE (kaynak, kaynak_id)`; `(client_id, degisiklik_zamani DESC)`;
`(sonraki_olcum) WHERE durum IN ('bekliyor','olcumde')` (kısmi: çıkışı iş
yazıyor ve son nokta SONLU, testte kilitli); `(ad_account_id, kapsam_id,
degisiklik_gunu)` (karışıklık sorgusu).

### Üç durak + taşıma

| Tablo | TRUNCATE | `02_rls.sql` | `WORKSPACE_TABLOLARI` | Hesap taşıma |
|---|---|---|---|---|
| `degisiklik_etkileri` | ekle | SELECT workspace kapsamı; INSERT/UPDATE YOK (yalnız worker, BYPASSRLS) | TAŞINIR | KALIR (karar kaydı, Ç-C10) |

Enum `SyncJobType`a `impact_evaluate`: **AYRI migration**. Migration yazmadan
hemen önce `git pull` (iki geliştirici).

## 3. Uçlar ve izinler

Tek kaynak `ETKI_UCLARI` (okuma-yalnız; yazan iş). Okuma `rule.read`
(İyileştir menüsü). Müşteri hesabı görmez (testte kilitli); etkiyi Paket B
özetinde görür.

- `GET /etki?clientId&durum&varlikId&yol&sayfa` → `EtkiListesi`: `toplam`,
  `sayilar` (durum başına), `emptyReason` (`degisiklik_yok` /
  `kesif_kosmadi` / `suzgec_bos`), `olculmeyen` her yanıtta, `sonHesaplama`
  (`sync_jobs` `impact_evaluate`), `hatalar`. Sorgu `client_id = ANY($1)`
  değil tek workspace (İyileştir de tek workspace).
- `GET /etki/:id` → `EtkiAyrintisi` (günlük hüküm metriği, deney ve kontrol,
  değişiklik günü çizgisi).

## 4. Durum makinesi

`packages/shared/src/etki/durum.ts` (`etkiGecisi`, testte kilitli).

```
            ön koşul düştü (doğrulanmadı / taşındı / veri yok / karışık)
            ya da kontrol grubu yok
 BEKLIYOR ────────────────────────────────────────────────► OLCULEMEDI (son)
    │  nokta geldi, hüküm "henüz belli değil" (7. gün)
    ▼
 OLCUMDE ──(14. gün, yine belli değil)──► OLCUMDE
    │ hüküm: iyileşti / kötüleşti / fark yok          son nokta (28) → "belirsiz"
    ▼                                                 ▼
 SONUCLANDI (son) ◄──────────────────────────────────┘
```

- Hepsini `impact_evaluate` yazar; kullanıcı yazmaz.
- Son nokta SONLU: `etkiHukmu(sonNokta=true)` "henüz" üretmez; gelirse
  `etkiGecisi` yine kapatır ve `belirsiz` yazar (sonsuz tarama yok).
- Kapanmış satır yeniden değerlendirilmez (`etkiGecisi` patlar: tarama
  sorgusu açık durumları süzmüyorsa hemen görünür).
- "Son durum" sayan her yer `ETKI_SON_DURUMLARI`nı okur.

## 5. İş zamanlaması

**Platform çağrısı YOK**, kota etkisi sıfır.

`sweep:impact` (günde bir, **07:20 İstanbul**, `impact_evaluate`, küresel tarama
`report_schedule` gibi): Paket A sinyallerinden (07:40) ve Paket B özetinden
(09:00) önce biter.

1. **Keşif**: `audit_logs` (`action ~ '^(campaign|ad_group|ad)\.(pause|set_budget)$'`,
   `actor_type <> 'rule'`) ve `rule_action_logs` (`outcome='applied'`,
   `action_type IN ('pause','adjust_budget')`) son keşiften (ilk koşuda 60 gün)
   bu yana; `denetimEylemi` + `degisiklikTuru` (`null` → atlanır, sayısı notta);
   `ON CONFLICT (kaynak, kaynak_id) DO NOTHING`. `dogrulama='uyusmadi'` ise
   doğrudan `olculemedi/dogrulanmadi`.
2. **Değerlendirme**: `durum IN ('bekliyor','olcumde') AND sonraki_olcum <= hesabın bugünü`.
   Ön koşullar ÖNCE (sıfır maliyetli ret, CLAUDE.md): `onKosulNedeni`
   (doğrulandı, taşındı mı: `ad_accounts.client_id` ≠ satırın `client_id`si,
   veri var mı, `karisikMi(noktaGun)`). Sonra pencere toplamları (`SUM/SUM`,
   deney + kontrol, plasebo dahil), `etkiHukmu`, `etkiGecisi`, satır UPDATE.
3. **Not ZORUNLU** (`succeeded + rows=0` bir hata türü): `keşif: 4 yeni (2
   ölçülmez) · değerlendirme: 7 (3 sonuçlandı, 2 henüz, 1 karışık, 1 kontrol yok)`.
4. Kontrol sorgusunda `ad_account_id = ANY(dizi)` biçimi ve tek hesap süzgeci;
   sorgu planı ölçülecek (§ 10).

## 6. Yöntem (sade, `yontem.ts`)

- **Fark içinde fark, oranların oranı**: `(dS/dÖ)/(kS/kÖ) − 1`. Mutlak fark
  değil: deney 200 ₺/gün, kontrol 5.000 ₺/gün olabilir.
- Günlük sayımlar pencere gün sayısına bölünür (öncesi 14, sonrası 7).
- Değişiklik günü iki pencereye de girmez (yarım gün).
- **Plasebo**: aynı hesaplama `[-28,-15]` ile `[-14,-1]` arasında; eşik
  `max(%15, 2 × |plasebo|)`. Plasebo pencereleri hacim eşiğini geçmiyorsa
  plasebo yok, eşik %15.
- Karışıklık: aynı kapsamda plasebo başından o anki noktanın sonuna kadar başka
  değişikliğimiz → ölçülemedi. **İstisna**: aynı gün aynı tür (iki yorgun
  reklamı aynı gün durdurmak) birlikte ölçülür.
- Hüküm sırası: kontrol → hacim → gürültü → önem → yön. Ekrandaki "neden" bu
  sıradan.

## 7. Ekran (Ajan 3), taslak `taslak.html`

- **İyileştir › Etkisi** sekmesi (`?sekme=etki`, Öneriler ve Sinyaller'den
  sonra): özet şeridi (sonuçlanan, iyileşen, kötüleşen, ölçülüyor), süzgeç
  (Hepsi / Ölçülüyor / Sonuçlanan), satır listesi: değişiklik, nereden
  (`DEGISIKLIK_YOLU_ADI`), tarih, kapsam, sonuç rozeti (yeşil yalnız "iyileşti"
  durum noktası), tek cümle (`etkiCumlesi`), "Ayrıntı" ile mini grafik (deney
  ve kontrol, değişiklik günü çizgisi), kanıt (öncesi/sonrası, kontrol
  değişimi, eşik). "Ölçülmeyen değişiklikler" satırı her zaman.
- **İyileştir kartı** (uygulanmış): altında tek satır, `GET /etki?varlikId=`.
- Dört hâl ayrı: yükleniyor, hata (sunucu cümlesi), boş + neden, dolu.
- Karar mantığı saf fonksiyonda (`etkiCumlesi` shared'da), effect içinde değil.

## 8. Güvenlik

- Okuma-yalnız uçlar, RLS workspace; kullanıcı yazma yolu yok.
- `kim` kopya alan: `users` JOIN yok (RLS'li tabloya INNER JOIN satırı süzer).

## 9. Paket B'ye verdiği

`OzetDegisikligi` (bu hafta yapılanlar: `degisiklik_zamani` hafta içinde) ve
`OzetEtkisi` (bu hafta `sonuclandi`ya geçenler). `etkiCumlesi` iki yerde aynı.

## 10. Ölçüm listesi (Ajan 5, canlıda)

1. **Geçmiş keşif**: deploy günü 60 gün geriye kaç değişiklik, kaçı hangi
   sonuçla. Hedef: sonuçlananların ≥%50'si "henüz/belirsiz" DEĞİL. Tutmazsa
   `enAzTiklama`, `enAzDonusum`, `olcumNoktalariGun` ayarlanır, ölçüm `yontem.ts`e yazılır.
2. **Plasebo dağılımı**: hesap başına |plasebo| ortancası; %15 tabanı anlamlı mı.
3. **Elle doğrulama**: 5 sonuçlanan değişikliği Meta/Google arayüzünde aynı
   pencerelerle elle hesapla, sayı tutuyor mu.
4. **Kontrol grubu**: kaç değişiklikte kontrol kurulamadı (tek kampanyalı hesap).
5. **Sorgu süresi ve planı** en büyük hesapta (`loops=`, her sorgu ayrı, CLAUDE.md).
6. **`iz` alanı**: İyileştir, Sinyal, Reklam Yöneticisi yollarından birer
   değişiklik, `audit_logs.after.iz` dolu mu.

## 11. Ajan görevleri

**Ajan 2 · Arka Plan** (`apps/api/src/modules/etki/` + migration'lar)
- [ ] Migration 1: `degisiklik_etkileri`, CHECK'ler, indeksler, kompozit FK. Migration 2 (ayrı): `impact_evaluate`.
- [ ] `02_rls.sql`, `pglite-harness` TRUNCATE, `WORKSPACE_TABLOLARI` (taşınır), `HESABIN_KENDI_VERISI`ne EKLEME (Ç-C10, yorumla).
- [ ] `CampaignActionsService.applyAction/uygula`: isteğe bağlı `iz`; İyileştir, Reklam Yöneticisi, asistan çağrıları iz gönderir (Paket A Sinyal Uygula da).
- [ ] Keşif + değerlendirme işi (§ 5), `sweep:impact`, `datesForJob` dalı (`sweep-dates.spec.ts`).
- [ ] Eski İyileştir eşlemesi (tek seferlik, keşifte).
- [ ] Uçlar `ETKI_UCLARI` ile birebir; `etki.module` + `queue.module` kaydı, kaynak taramasıyla kilit.

**Ajan 3 · Ön Yüz**
- [ ] İyileştir Etkisi sekmesi, uygulanmış kart altı satırı. `nav-sections`/`panel-tasarim` yeşil.
- [ ] Bağlantılar üreticiden (`lib/reklam-yoneticisi.ts`).

**Ajan 4 · Test & Güvenlik (kapı)**
- [ ] RLS `SET ROLE` + `RETURNING`: başka workspace satırı okunamıyor; kullanıcı rolüyle INSERT/UPDATE reddediliyor.
- [ ] CHECK listeleri = shared listeleri (iki yönlü).
- [ ] Keşif: kural değişikliği İKİ KEZ satır üretmiyor (`audit_logs` rule satırı + `rule_action_logs`); İyileştir uygulaması tek satır.
- [ ] Mutasyonlar: keşifte `actor_type <> 'rule'` süzgecini sil → çift satır testi düşmeli; ön koşul sırasını boz; kontrol sorgusundan "aynı kampanyanın setleri" çıkarmasını sil → CBO testi düşmeli; `sonraki_olcum` süzgecini sil → erken ölçüm testi düşmeli.
- [ ] Sessiz hata: `succeeded + rows=0` notsuz değil; boş liste her yolda `emptyReason`.
- [ ] `Prisma.sql` yorum/backtick, bağlı sayı `::int` taramaları.

**Ajan 5 · Canlıya alma**: migration sırası (tablo, sonra enum), § 10 ölçümleri, `DEVAM.md`.

**Ajan 6 · Tasarım denetimi**: taslakla yan yana, masaüstü + telefon.

## 12. Neyi ÖLÇMEDİM (Ajan 1)

- Hiçbir eşiği canlı veriyle ölçmedim (`ETKI` başlangıç değerleri).
- Üretimde `audit_logs`ta kaç `campaign.*`/`ad_group.*`/`ad.*` satırı olduğunu
  ve `before.budgetAmountMicros`un hepsinde dolu olduğunu ölçmedim
  (`applyAction` yolu `afterState`i platformdan alıyor; alan adı sağlayıcıya göre
  değişebilir, Ajan 2 Meta ve Google `afterState`ini okuyup eşlemeli).
- `rule_action_logs.before_state/after_state` bütçe alan adlarını ölçmedim.
- Hesap TZ'sinin `ad_accounts`ta hangi kolonda durduğunu bu iş için doğrulamadım
  (Paket A `sweep:daily` aynı bilgiyi kullanıyor).
- Kontrol sorgusunun süresini ölçmedim.
