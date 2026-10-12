# Paket E: Lead kalitesini platforma geri besleme (Ajan 1 · Mimar)

**Tarih:** 2026-10-12 · **Girdi:** [`../rakip-analizi/ORPHEX-BOSLUK.md`](../rakip-analizi/ORPHEX-BOSLUK.md)
§1 B-8 ve §2 "Paket E" · **Sözleşme:** `packages/shared/src/geri-besleme/`
(derleme çıktısıyla temiz, `apps/api/src/modules/geri-besleme/sozlesme.spec.ts`
37 test, yedi kural mutasyonla doğrulandı) · **Taslak:** [`taslak.html`](taslak.html)
· **Durum:** Ajan 1 bitti; kararlar "KABUL (yönetici, 2026-10-12)" (kullanıcı karar
yetkisini oturum yöneticisine devretti). Ajan 2-3 sıra kuralına bağlı (Ç-O7:
önceki paket canlıda doğrulanmadan başlanmaz).

"Bu kişi müşteri oldu mu?" Ajans Potansiyel Müşteriler ekranında bir lead'in
sonucunu işaretler; sonuç Meta'nın Conversion Leads modeline gider ve Meta
reklamı FORM DOLDURANA değil MÜŞTERİ OLANA benzeyen kişilere göstermeyi
öğrenir. Reklam verimliliğine doğrudan etkisi olan, kullanıcının tek bir
tıkla beslediği tek sinyal.

Modül adı `geri-besleme`, `leads`in alt parçası DEĞİL (gerekçe
`geri-besleme/index.ts`): lead modülü kaydı ALIYOR, bu modül sonucu
GÖNDERİYOR; kendi kuyruğu, durum makinesi ve platform hata sözlüğü var.

---

## 0. Çelişki tablosu

"Öneri" sütunu Mimar'ın önerisi ve tasarım ona göre tamamlandı. Karar
yöneticinin; reddedilen öneri sözleşmede gösterilen yeri değiştirir.

| # | Brief diyor | Depo / belge gerçeği | Öneri | Karar |
|---|---|---|---|---|
| Ç-1 | Lead'e yeni bir kalite işareti ("ulaşıldı / nitelikli / satışa döndü / uygun değil") | Lead'in durum hattı ZATEN bu: `LEAD_STATUSES` = Yeni · Arandı · Nitelikli · Kazanıldı · Kaybedildi (`lead.schema.ts`), panelde seçici olarak duruyor | Yeni kolon YOK; aşama durumdan türetilir (`LEAD_DURUMU_ASAMASI`, `Record<LeadStatus,…>` derlemeyle kilitli). İki alan olsaydı ajans aynı kişiyi iki yerde işaretler ve Meta'ya hangisinin gittiği ekrandan anlaşılmazdı. Eksik olan GEÇMİŞ: `event_time` "aşamanın değiştiği an" ve bugün değişim anı saklanmıyor → `lead_durum_gecmisi` | KABUL (yönetici, 2026-10-12) |
| Ç-2 | Google Ads offline conversion import (GCLID/GBRAID/WBRAID) | `leads` tablosuna kayıt YALNIZ Meta anlık formundan geliyor (webhook + mutabakat; `manual` kaynağın ucu yok). Hiçbir kayıtta Google tıklama kimliği yok ve olamaz | **v1 yalnız Meta.** Google sözleşmesi hazır ama kapalı (`GOOGLE_GERI_BESLEME_ACIK = false`). Açılma koşulu: tıklama kimliği taşıyan bir lead kaynağı (site formu: GTM `gclidw` çerezi zaten yazılıyor; ya da Google potansiyel müşteri formu öğesi `lead_form_submission_data`, M-9) | KABUL (yönetici, 2026-10-12) |
| Ç-3 | "Enhanced conversions for leads" (hash'li e-posta/telefon) seçeneği | ECL tıklama kimliği OLMADAN da gider. Meta lead'ini Google'a göndermek: kişi aynı dönemde bir Google reklamına da tıkladıysa Google satışı kendine yazar, aynı satış iki platformda sayılır, Google teklif modeli Meta'nın getirdiği müşteriyi kendi başarısı sanar | **Meta'dan gelen lead Google'a HİÇBİR koşulda gitmez** (`googleUygunluk` → `meta_lead`, testte kilitli). ECL yalnız tıklama kimliği olan Google/site lead'inde EK anahtar olarak | KABUL (yönetici, 2026-10-12) |
| Ç-4 | `uploadClickConversions` + CLAUDE.md `partialFailure: false` | (a) Google belgesi: *"Starting June 15, 2026, UploadClickConversions requests will fail if the developer token hasn't previously sent requests to upload offline conversions or enhanced conversions for leads"*; projemiz hiç göndermedi. (b) Eski yolda belge `partial_failure`ın TRUE olmasını şart koşuyor (*"This field must be set to true when importing conversions"*): CLAUDE.md kuralı `mutate` içindi. (c) Yeni yol Data Manager API: kısmi başarı YOK (*"if any event fails validation, the entire request fails"*), ayrı OAuth izni `auth/datamanager` | Google açıldığında yol **Data Manager `events:ingest`**, Meta ile aynı yarılama. İzin, kurulum modülünün izin genişletme akışıyla (`GOOGLE_OLCUM_SCOPES` deseni, kurulum Ç-5). Eski yol bu modülde hiç kullanılmaz | KABUL (yönetici, 2026-10-12) |
| Ç-5 | Orphex taslağı: `Lead` → `QualifiedLead` olayları | Meta CRM belgesi: `event_name` SERBEST, "ham lead dahil bütün aşamalar" gönderilmeli, en az iki aşama | Beş sabit ad (`META_ASAMA_OLAY_ADI`: `ham_lead`, `ulasildi`, `nitelikli`, `satisa_dondu`, `uygun_degil`), yayından sonra DEĞİŞMEZ (Meta huniyi adlarla öğreniyor; testte kilitli). `ham_lead` her yeni lead için kendiliğinden | KABUL (yönetici, 2026-10-12) |
| Ç-6 | "Tek tık kalite seçimi" | CAPI'de olay silme yok; yanlış tıklama Meta'da kalır | İşaret **15 dakika** bekletilir (`GERI_BESLEME_BEKLEME_DK`); pencerede geri alınan aşama `iptal` edilir, gitmez. Atlanan aşamalar doldurulur (Yeni → Kazanıldı = ulaşıldı + ilgili + müşteri oldu). Platforma giden aşama bir daha gitmez (`asamaPlani`) | KABUL (yönetici, 2026-10-12) |
| Ç-7 | "Hangi dataset/piksel" (kurulumla bağ) | Hazırlık bir piksel seçiyor (`workspace_hazirlama.piksel_id`); kurulum `meta_piksel` adımı onu kullanıyor. Meta belgesi "A CRM dataset is required"; pikselin CRM'e açık olup olmadığı `is_crm` alanında | Varsayılan hazırlığın pikseli, ekranda ÖNDEN DOLU ama kayıt kullanıcı onayıyla. `is_crm` okunur (`POST …/ayar/kontrol`): `false` ise gönderim YİNE açılabilir ama ekran "Events Manager'da bu veri kümesinin Conversion Leads bölümünü aç" der (kullanıcıda); etkisi M-2. Piksel yoksa: "Önce Marka Merkezi › Kurulum'da piksel" (açık söylenir, tahmin yok) | KABUL (yönetici, 2026-10-12) |
| Ç-8 | KVKK: hash'lenmiş PII, saklama süresi | Meta belgesinin öncelik sırasında `lead_id` EN YÜKSEK ve tek başına yeterli; kişi formu Meta'da doldurdu, Meta onu zaten tanıyor | **Meta'ya kişisel veri gitmez, hash'li hâli bile:** `user_data` yalnız `lead_id` (tip dar, `em`/`ph` eklemek derlemeyi kırar). Hash hiçbir yerde SAKLANMAZ (ileride Google ECL'de gönderim anında hesaplanır, kuyrukta tutulmaz). Açmak için bir kez "formdaki aydınlatma metni bu kullanımı kapsıyor" onayı (denetim kaydı). Olay satırları lead'le birlikte silinir (`ON DELETE CASCADE`), ayrı saklama süresi yok; `platform_yaniti` kişisel veri taşımaz. **Ek soru:** lead verisinin kendisi bugün süresiz saklanıyor; bu paketin işi değil, ayrı karar | KABUL (yönetici, 2026-10-12) |
| Ç-9 | "Gönderim düşerse sinyal/bildirim" (Paket A bağı) | `BILDIRIM_OLAYLARI` kapalı liste (`sinyal`, `kural`); sinyal Ç-3: teknik/hesap uyarıları v1'de kanala gitmiyor, `uyari` olayı v2 | **Uyarı** (`alerts`, kod `geri_besleme_dusuyor`) + **Genel Bakış bekleyen iş** (`geri_besleme_sorunu`). Slack/Teams/e-posta v1 YOK, sinyal Ç-3'ün `uyari` olayıyla gelir (ikinci bir kanal olayı doğmasın). Ajan 2 iki listeye kendi commit'inde ekler (şimdi eklemek `Record` tüketicilerini kırar, sinyal Ç-13 deseni) | KABUL (yönetici, 2026-10-12) |
| Ç-10 | İzin | Lead ekranı `lead.read/write`; hesap atama `connection.manage` | Okuma `lead.read`; ayar yazma ve kontrol `connection.manage` (workspace verisini bir platforma aktarmayı başlatıyor ve hangi veri kümesini eğiteceğini seçiyor); yeniden dene `lead.write`. Müşteri hesabı hiçbirini görmez (testte kilitli) | KABUL (yönetici, 2026-10-12) |
| Ç-11 | Meta `ads_management` yeterli mi | Bağlantıda `ads_management` isteğe bağlı scope olarak var (`meta.provider.ts`). Meta'nın "platform olarak CRM" belgesi App Review + `ads_management`, `business_management`, `pages_read_engagement`, `pages_show_list`, `ads_read` Advanced/Full erişim ve MBE ya da müşterinin sistem kullanıcısı token'ı diyor | v1 VAR OLAN ajans bağlantısının token'ıyla (müşteri BM'ine partner, piksel paylaşılmış). Çalışmazsa (M-1) ikinci yol: müşterinin Events Manager'da ürettiği sistem kullanıcısı token'ı, şifreli, yalnız POST. `partner_agent` gönderilmez (Meta temsilcisiyle belirlenen bir dize; uydurmak yanlış) | KABUL (yönetici, 2026-10-12) |
| Ç-12 | "Platform algoritması iyi lead'e optimize eder" | Meta Conversion Leads ön koşulları: ayda ≥200 lead, ≥%60 kapsama, ≥7 gün veri, hedef aşama ≤28 gün ve %1-40. Çoğu müşteri bu hacmin altında olabilir (M-8) | Gönderim eşikten BAĞIMSIZ açık (Meta lead kalitesini yine öğreniyor, rapor için de değerli). Ekran eksikleri adıyla söyler (`metaUygunlukEksikleri`). Kampanyayı Conversion Leads optimizasyonuna ÇEVİREN yazma v1'de YOK (AdvCampaign'in işi, ayrı karar; M-11) | KABUL (yönetici, 2026-10-12) |
| Ç-13 | Geçmiş lead'ler | Meta 7 günden eski olayı reddediyor ve tek eski olay partiyi düşürüyor | Açılışta yalnız son 7 günün lead'leri ve 7 gün içindeki işaretleri kuyruğa girer. Daha eskiler için satır ÜRETİLMEZ ve sayısı açılış cevabında ve ekranda yazar ("412 eski kayıt 7 günü geçtiği için gönderilemez"). Gönderim anında da olay başına 7 gün kontrolü (`metaPenceredeMi`, bir saat pay) | Mimar (§5) |
| Ç-14 | Panel dili | Kullanıcı reklam bilmiyor; "Conversion Leads", "CAPI", "dataset" anlamsız | Satırda soru "Bu kişi müşteri oldu mu?", seçenekler Ulaşamadım/Uygun değil · Görüştük · İlgileniyor · Müşteri oldu; ayar başlığı "Sonuçları Meta'ya bildir"; "veri kümesi (piksel)". Rozet yalnız sorun ya da bekleme varken dikkat çeker | Mimar (§5) |

**Yöneticiye açık sorular (öneriyle):**

1. Kalite işareti var olan durum hattı mı (öneri: evet, yeni kolon yok)?
2. v1 yalnız Meta, Google kapalı ve Meta lead'i Google'a asla gitmesin mi (öneri: evet)?
3. Google açıldığında yol Data Manager API mi (öneri: evet; eski yol kapalı)?
4. 15 dakikalık geri alma penceresi uygun mu (öneri: evet)?
5. Meta'ya yalnız `lead_id` gitsin, kişisel veri hiç gitmesin mi (öneri: evet) ve bir kerelik aydınlatma onayı yeterli mi (öneri: evet)?
6. Düşen gönderim uyarı + bekleyen iş olarak görünsün, Slack/Teams v2'de mi (öneri: evet)?
7. Ayar yazma `connection.manage` izniyle mi (öneri: evet)?
8. v1'de kampanyayı Conversion Leads'e çeviren yazma olmasın mı (öneri: evet)?

---

## 1. Neyin nerede olduğu (okunan dosyalar)

| Konu | Yer | Paket E'deki rolü |
|---|---|---|
| Lead kaydı | `leads` (Prisma `Lead`), `lead.schema.ts` (`LEAD_STATUSES`, `LeadRecord`), `leads.service.ts` (`update` yalnız durum + not) | Durum = kalite (Ç-1); `PUT /leads/:id` geçmiş + aşama planı yazar |
| Lead girişi | `queue/lead-sync.service.ts` (`lead_fetch`, `leads_reconcile`), `leadgen-webhook.service.ts` | `ham_lead` olayının doğduğu yer (§ 5.1) |
| Lead kimliği | `leads.external_lead_id` varchar(64) = Meta `leadgen_id` | Meta `user_data.lead_id` (dize, bkz. § 6.1) |
| Piksel | `workspace_hazirlama.piksel_id`, kurulum `meta_piksel` adımı | Varsayılan veri kümesi (Ç-7) |
| Google dönüşüm işlemi | `workspace_kurulum.ads_donusumleri` (form/telefon/WhatsApp, `WEBPAGE`) | v1'de bağ YOK; Google açılınca `UPLOAD_CLICKS` türünde ayrı işlem gerekir (belge: *"The conversion action must have a type of UPLOAD_CLICKS"*) |
| Google izin genişletme | `google.provider.ts` `GOOGLE_OLCUM_SCOPES`, `include_granted_scopes` | `auth/datamanager` aynı yoldan (Ç-4) |
| Meta scope | `meta.provider.ts` (`ads_management`, `business_management`, `leads_retrieval`, `pages_manage_ads`) | Ç-11 |
| HTTP sınıfı | `sinyal/durum.ts#teslimSonucu` (Paket A) | `metaYanitSinifi` onu TÜKETİR |
| Uyarı / bekleyen iş | `uyari.schema.ts#UYARI_KODLARI`, `genel-bakis#BEKLEYEN_IS_TURLERI` | Ç-9 |
| Geri okuma deseni | `campaign-actions` (yaz, platformdan oku, karşılaştır) | CAPI'de geri okuma YOK (olay okunamıyor); karşılığı `events_received` sayısı + Events Manager gözü (M-4) |
| Meta ölçüm araştırması | `docs/meta-reklam-brief/bolumler/08-olcum-pixel-conversions-api.md` § CRM | Belgeyle yeniden doğrulandı (§ 6) |

## 2. Veri modeli (Ajan 2)

Üç yeni tablo; hepsi `client_id` + `org_id` taşır, `(client_id, org_id)`
kompozit FK `clients`a. Durum kolonları **varchar + CHECK** (shared'daki
kapalı listeyle Ajan 4 testinde iki yönlü karşılaştırılır, `fatura-zip.spec`
deseni). `org_id` HEDEF müşteriden (`musteriOrgId`), `ctx`ten değil.

### `lead_durum_gecmisi`

| Kolon | Tip | Not |
|---|---|---|
| id | uuid PK | |
| org_id, client_id | uuid NOT NULL | |
| lead_id | uuid NOT NULL | FK `leads` ON DELETE CASCADE |
| onceki_durum | varchar(16) NULL | NULL = kayıt doğdu |
| yeni_durum | varchar(16) | CHECK `LEAD_STATUSES` |
| degistiren_user_id | uuid NULL | `users`a LEFT JOIN (RLS'li tabloya INNER JOIN yasağı) |
| kaynak | varchar(8) | CHECK `panel`/`sistem` |
| created_at | timestamptz | aşamanın `event_time`ı buradan |

Durum AYNIYSA satır yazılmaz (not güncellemesi geçmiş üretmez). İndeks
`(lead_id, created_at)`. Ayar kapalıyken de yazılır: açılışta 7 gün içindeki
işaretler buradan kuyruğa girer (Ç-13).

### `geri_besleme_ayarlari`

| Kolon | Tip | Not |
|---|---|---|
| client_id, platform | PK (uuid, varchar CHECK `GERI_BESLEME_PLATFORMLARI`) | workspace başına platform başına tek satır |
| org_id | uuid | |
| etkin | boolean default false | |
| dataset_id, dataset_adi | varchar(20), varchar(200) NULL | |
| baglanti_id | uuid NULL | FK `platform_connections` ON DELETE SET NULL; gönderimde kullanılan token |
| dataset_crm | boolean NULL | `is_crm`; NULL = okunamadı |
| son_kontrol | timestamptz NULL | |
| aydinlatma_onaylayan, aydinlatma_zamani | uuid, timestamptz NULL | |
| etkinlestiren, etkinlestirme_zamani | uuid, timestamptz NULL | |
| son_ayar_hatasi, son_ayar_hatasi_zamani | text, timestamptz NULL | platformun cümlesi AYNEN; başarılı gönderim temizler |
| son_basarili_gonderim | timestamptz NULL | |
| created_at, updated_at | | |

Durum SAKLANMAZ, türetilir (`geriBeslemeAyarDurumu`).

### `geri_besleme_olaylari` (gönderim kuyruğu = niyet kaydı)

| Kolon | Tip | Not |
|---|---|---|
| id | uuid PK | |
| org_id, client_id | uuid | |
| lead_id | uuid | FK `leads` ON DELETE CASCADE |
| platform | varchar | CHECK |
| asama | varchar(16) | CHECK `GERI_BESLEME_ASAMALARI` |
| olay_kimligi | varchar(64) | `geriBeslemeOlayKimligi`; Meta `event_id` |
| olay_zamani | timestamptz | `asamaOlayZamani` |
| durum | varchar(16) | CHECK `GERI_BESLEME_OLAY_DURUMLARI` |
| deneme | smallint default 0 | |
| sonraki_deneme | timestamptz NULL | ham: now(); işaret: now() + 15 dk |
| gonderilen_hedef | varchar(20) NULL | gönderildiği andaki dataset (ayar sonradan değişebilir) |
| gonderildi | timestamptz NULL | |
| http_durum | int NULL | |
| hata_kodu | varchar(40) NULL | `code/subcode` |
| hata | text NULL | platformun cümlesi aynen |
| platform_yaniti | jsonb NULL | `events_received`, `fbtrace_id`; KİŞİSEL VERİ YOK |
| created_at, updated_at | | |

- **`UNIQUE (lead_id, platform, asama)`** = idempotensin asıl dayanağı
  (aynı aşama bir lead için bir kez). Satır yeniden açılır, ikincisi açılmaz.
- Kısmi indeks `(sonraki_deneme) WHERE durum IN ('bekliyor','basarisiz')`:
  yüklemdeki iki durumdan çıkışı gönderim işi (`kabul/eslesmedi/…`) ve lead
  güncellemesi (`geri_alindi`) yazıyor; kalıcı kilit yok (testte "her
  gönderilebilir durumdan son duruma yol var").
- `(client_id, durum, updated_at DESC)` liste için.

### Üç durak ve taşıma

| Tablo | `pglite-harness` TRUNCATE | `02_rls.sql` | `WORKSPACE_TABLOLARI` | Hesap taşıma (`hesap-verisi-tasima.ts`) |
|---|---|---|---|---|
| `lead_durum_gecmisi` | ekle | SELECT/INSERT workspace kapsamı; UPDATE yalnız taşıma; DELETE yok | TAŞINIR (lead'le birlikte) | hesaba bağlı değil, dokunulmaz |
| `geri_besleme_ayarlari` | ekle | SELECT/INSERT/UPDATE workspace kapsamı | TAŞINIR, **`etkin = false`a çekilir** (başka şirkete taşınan workspace eski şirketin bağlantısıyla gönderim yapmasın; sayısı taşıma raporunda) | dokunulmaz |
| `geri_besleme_olaylari` | ekle | SELECT/INSERT/UPDATE workspace kapsamı; worker BYPASSRLS | TAŞINIR; bekleyenler `iptal` | dokunulmaz |

Enum `SyncJobType`a bir değer: `lead_feedback_send` — **AYRI migration**.
Migration yazmadan hemen önce `git pull` (iki geliştirici).

## 3. Uçlar

Tek kaynak `packages/shared/src/geri-besleme/uclar.ts` (`GERI_BESLEME_UCLARI`).

- **Kalite işareti yeni uç DEĞİL**: `PUT /leads/:id` (`lead.write`). Aynı
  transaction'da: satırı `FOR UPDATE` oku → durum değiştiyse geçmiş satırı →
  ayar etkinse mevcut olay satırlarını oku → `asamaPlani` → `olustur`
  (INSERT … ON CONFLICT DO NOTHING), `iptal` (`geri_alindi`), `yenidenAc`
  (`yeniden_istendi`, `sonraki_deneme = now()+15dk`). Platform çağrısı YOK.
  `LeadRecord`a isteğe bağlı `geriBesleme?: LeadGeriBeslemeRozeti` (Ajan 2,
  liste sorgusunda tek ek sorgu, `lead_id = ANY($1)`).
- `GET /geri-besleme/ayar?clientId&platform=meta`: `GeriBeslemeAyari`;
  seçenekler hesabın piksel listesinden (`GET act_X/adspixels`, istek anında)
  + hazırlığın pikseli; okunamazsa `secenekNotu` platformun cümlesi.
- `PUT /geri-besleme/ayar`: `geriBeslemeAyarSchema`. Açılışta 7 günlük geri
  doldurma (Ç-13) ve cevapta `{kuyruga, eskiOlduguIcinAtlanan}`. Kapanışta
  bekleyenler `iptal`, sayısı cevapta. Dataset DEĞİŞİRSE ekran önce uyarır
  ("Meta öğrenmeye yeniden başlar") ve `audit.record`.
- `POST /geri-besleme/ayar/kontrol`: `GET /{dataset}?fields=name,is_crm,
  owner_business,is_unavailable`; sonucu ayara yazar. Transaction DIŞINDA.
- `GET /geri-besleme/olaylar`: sayfalı, `toplam` ve `sayilar` ile (sessiz
  kesme yok), `emptyReason`.
- `POST /geri-besleme/olaylar/yeniden-dene`: `vazgecildi/reddedildi` →
  `bekliyor`; 7 günü geçen ve zaten ulaşanlar AYRI sayılır
  (`GeriBeslemeYenidenDeneSonucu`).

## 4. Durum makineleri

### 4.1 Olay (`olay.ts#geriBeslemeGecisi`)

```
            kabul ──────────────► İLETİLDİ        (son, çıkış yok)
            eslesmedi ──────────► EŞLEŞMEDİ       (son, çıkış yok)
 BEKLİYOR ─ olay_hatasi ────────► REDDEDİLDİ ─┐
  │  ▲ │    sure_doldu ─────────► SÜRESİ_DOLDU │ yeniden_istendi
  │  │ └──  geri_alindi ────────► İPTAL ───────┤ (kullanıcı ya da
  │  │                                         │  aşama planı)
  │  └────────────────────────────────────────┘
  └ gecici_hata ► BAŞARISIZ ─(deneme ≥ 5)─► VAZGEÇİLDİ ─ yeniden_istendi ► BEKLİYOR
```

- **İki ayrı "olmadı"** (brief'in açık isteği): `eslesmedi` = platform aldı,
  kişiyi/tıklamayı bulamadı (Google `CLICK_NOT_FOUND`; Meta'da `lead_id` ile
  eşleşme Meta'nın kendi kimliği olduğu için beklenmiyor, M-4). `reddedildi`
  / `vazgecildi` / `suresi_doldu` = platforma HİÇ ULAŞMADI, yapılacak iş var.
  Ekranda ayrı rozet, ayrı cümle.
- **Ayar hatası olay durumu değil**: token/izin/dataset hatasında satırlar
  `bekliyor` kalır, deneme ARTMAZ, ayar `hata`ya düşer (`metaYanitSinifi` →
  `ayar_hatasi`). Aksi hâlde izin düzelince bütün kuyruğu elle yeniden
  denetmek gerekirdi.
- **"200 döndü" kabul değil**: `events_received` gönderilenle aynı değilse
  `uyusmazlik` → geçici say, `hata` kolonuna not.
- Son durumları sayan HER yer `GERI_BESLEME_SON_DURUMLAR`ı okur.

### 4.2 Aşama planı (`asama.ts#asamaPlani`)

Durum değişince: ima edilen aşama satırı yoksa oluştur; iptalse yeniden aç;
ima edilmeyen ve henüz gitmemiş olanı iptal et; gitmiş olana dokunma;
`ham_lead`i asla iptal etme. Atlanan aşamalar doldurulur; `uygun_degil`
hunin dışında bir dal (yalnız ham lead'i ima eder).

### 4.3 Ayar (`ayar.ts#geriBeslemeAyarDurumu`)

`kapali` → `kurulum_eksik` (dataset ya da bağlantı yok) → `bekliyor` (ilk
başarılı gönderim yok) → `calisiyor`; `hata` son gönderimin ayar hatasıyla
girer, bir sonraki başarılı gönderimle çıkar.

## 5. Zincir ve iş zamanlaması

1. **Lead doğunca** (`lead-sync`, worker): lead INSERT'ünün AYNI deyim
   zincirinde, yalnız gerçekten yeni satırda (`ON CONFLICT DO NOTHING …
   RETURNING`): geçmiş satırı (`kaynak = sistem`) ve ayar etkinse ve
   `submitted_at` 7 gün içindeyse `ham_lead` olayı (`sonraki_deneme =
   now()`). Mutabakatla geç gelen eski lead için olay ÜRETİLMEZ (sayısı
   `sync_jobs.note`).
2. **Durum değişince**: § 3 ilk madde.
3. **Süpürme `sweep:lead-feedback`** (5 dakikada bir): vadesi gelmiş satırı
   olan workspace'ler için `lead_feedback_send` (`{clientId}`, kimlik
   `lead_feedback_send__<client>`; takılmış iş kuralı: 30 dk'dan yaşlı
   `active/delayed` iş kaldırılır, `takilmis-is.spec` deseni).
   `sweep-dates.spec.ts` yeni türü ve `datesForJob` dalını (tarih taşımıyor)
   görmeli.
4. **İşin içi**:
   - **Ön koşul ÇAĞRIDAN ÖNCE** (sıfır maliyetli ret): ayar etkin, dataset
     var, bağlantı geçerli (`needs_reauth` değil). Değilse platform çağrısı
     YOK, satırlara dokunulmaz, `rows=0` + not ("ayar kapalı" / "bağlantı
     yeniden yetki istiyor") — `succeeded + rows=0` notsuz olamaz.
   - Olay başına 7 gün kontrolü (`metaPenceredeMi`) → `suresi_doldu`.
   - En çok 50 satır, `partiSirala` (aynı lead'in aşamaları huni sırasıyla),
     `metaGovdeMetni`, transaction DIŞINDA POST, sonuç kısa transaction'da.
   - `olay_hatasi` ve parti > 1 → `partiyiYarila`, iki yarı ayrı istek;
     tek olaya inildiğinde `reddedildi`.
   - `ayar_hatasi` → `son_ayar_hatasi`, satırlar beklemede; işin kalanı
     koşmaz (aynı token aynı hatayı verir).
   - `sync_jobs.note`: sonuç dağılımı (`iletildi: 12, suresi_doldu: 1`).
5. **Kota**: CAPI çağrısı Marketing API çağrısı sayılıyor. Hesap başına
   kota bekçisinin katmanı `rule_action` DEĞİL; Ajan 2 düşük öncelikli ayrı
   katman açar ya da mevcut `sync` katmanını kullanır (M-10'da ölçülür).
   Partiyle 5 dakikada bir workspace başına en çok birkaç çağrı.

## 6. Platform istek biçimleri (resmî belgeden, 2026-10-12)

### 6.1 Meta Conversions API, CRM (Conversion Leads)

Kaynaklar:
- https://developers.facebook.com/docs/marketing-api/conversions-api/conversion-leads-integration/payload-specification
- https://developers.facebook.com/docs/marketing-api/conversions-api/conversion-leads-integration/crm-integration/3-implementing-the-crm-integration
- https://developers.facebook.com/docs/marketing-api/conversions-api/guides/conversions-api-crm-for-platforms
- https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events

```http
POST https://graph.facebook.com/v25.0/{DATASET_ID}/events
Content-Type: application/json

{ "data": [ {
    "event_name": "nitelikli",
    "event_time": 1760263200,
    "action_source": "system_generated",
    "event_id": "adv-<lead-uuid>-nitelikli",
    "user_data": { "lead_id": 123456789012345 },
    "custom_data": { "lead_event_source": "Advetics", "event_source": "crm" }
} ] }
→ { "events_received": 1, "messages": [], "fbtrace_id": "…" }
```

Belgeden kurallar (alıntılar kısa):
- Zorunlu: `event_name`, `event_time`, `action_source`, `user_data`,
  `lead_event_source`, `event_source`. `action_source` = `system_generated`,
  `event_source` = `crm` "for all Conversion Leads events".
- `event_time` *"can be up to 7 days before you send an event"* ve
  *"must occur after the lead generation time or else the event may be
  discarded"* → `asamaOlayZamani`, `metaPenceredeMi`.
- `lead_id` *"a 15-17 digit number"*; geçersizse *"the system will reject
  the event"* → `metaLeadIdGecerli`, gövdeye girmeden.
- *"If there is an error in the batch, the whole batch will be discarded"*;
  parti en çok 1.000 → bizde 50 + yarılama.
- *"Upload data at least once a day"*, gerçek zamanlıya yakın tercih → 5 dk
  süpürme + 15 dk geri alma penceresi.
- Bütün aşamalar, ham lead dahil; en az iki, tercihen üç.
- Tekilleştirme: belge `event_id`+`event_name` için 48 saati TARAYICI-SUNUCU
  eşleşmesi için anlatıyor; aynı kaynaktan tekrarlanan sunucu olayının
  tekilleştirildiği AÇIK DEĞİL (M-6). Bu yüzden idempotens veritabanında.
- **`lead_id` JSON sayısı ama JavaScript sayısına SIĞMAYABİLİR** (17 hane >
  2^53): kimlik dize taşınır, yalnız JSON metninde tırnak atılarak literale
  çevrilir (`metaGovdeMetni`, testte 17 haneli kimlikle kilitli). Dizeyi
  kabul edip etmediği M-3.
- `test_event_code` YOK: Meta test olaylarını atmıyor, üretim verisine
  işliyor (08-olcum § Tuzaklar 1). Ajan 4 kaynak taramasıyla kilitler.

### 6.2 Google Ads (v1 KAPALI, açılınca)

Kaynaklar:
- https://developers.google.com/google-ads/api/docs/conversions/upload-offline
- https://developers.google.com/data-manager/api/devguides/events/google-ads/offline/send-events
- https://developers.google.com/data-manager/api/reference/rest/v1/events/ingest

```http
POST https://datamanager.googleapis.com/v1/events:ingest
Authorization: Bearer <scope https://www.googleapis.com/auth/datamanager>

{ "destinations": [ { "operatingAccount": { "accountType": "GOOGLE_ADS", "accountId": "<müşteri>" },
                      "loginAccount": { … MCC … }, "productDestinationId": "<UPLOAD_CLICKS dönüşüm işlemi>" } ],
  "encoding": "HEX",
  "events": [ { "adIdentifiers": { "gclid": "…" }, "eventTimestamp": "2026-10-12T10:00:00+03:00",
                "transactionId": "adv-<lead-uuid>-satisa_dondu", "conversionValue": …, "currency": "TRY" } ],
  "validateOnly": false }
→ { "requestId": "…" }
```

- *"At most 2000 Event resources can be sent in a single request."*
- Kısmi başarı yok: *"if any event fails validation, the entire request fails"*.
- `transactionId` aynı dönüşüm işleminde kaynaklar arası tekilleştirir.
- ECL'de `userIdentifiers` (e-posta/telefon) SHA-256 + normalleştirme
  (gmail'de nokta ve `+` eki atılır, telefon E.164) → `googleEpostaNormalize`,
  `telefonE164`. Hash gönderim anında, saklanmaz.
- Eski yol `UploadClickConversions` bu modülde KULLANILMAZ (Ç-4).
- `validateOnly` VAR → Google açıldığında ilk canlı tur prova ile başlar
  (Meta'da prova yok, § 10).

## 7. KVKK ve dış istek güvenliği

- Meta'ya giden: `lead_id`, aşama adı, zaman, olay kimliği. Kişisel veri
  (ad, e-posta, telefon) hash'li hâlde bile GİTMEZ (Ç-8).
- Saklanan: olay satırı ve `platform_yaniti` (kişisel veri yok). Lead
  silinince CASCADE. Aydınlatma onayı ve dataset değişikliği `audit_logs`.
- İstek yalnız sabit ana makineye (`graph.facebook.com`,
  `datamanager.googleapis.com`), adres kullanıcıdan gelmiyor; dataset
  kimliği yalnız rakam (`^\d{5,20}$`), yol enjeksiyonu yok.
- Token loglanmaz; hata cümlesi aynen saklanır ama Graph hata gövdesinde
  token yankılanmadığı Ajan 4'te kontrol edilir.

## 8. Paket A ve uyarılarla bağ (Ç-9)

- `alerts`: `geri_besleme_dusuyor` (`warn`; ayar `hata`daysa `error`), istek
  anında, kaynak: ayar + son 24 saatin `GERI_BESLEME_SORUNLU_DURUMLAR`
  satırları. Başlık "Lead sonuçları Meta'ya gitmiyor", detay platformun
  cümlesi + "Potansiyel Müşteriler › Meta'ya bildirim".
- Genel Bakış `geri_besleme_sorunu` (`lead.read`).
- Paket A'nın `teslimSonucu` HTTP sınıflandırıcısı tüketiliyor; Paket A
  shared koduna DOKUNULMADI.

## 9. Ekran (Ajan 3), taslak `taslak.html`

- **Potansiyel Müşteriler** satırı: açılan kartta "Bu kişi müşteri oldu
  mu?" sorusu ve dört tek tık seçenek (Ulaşamadım/Uygun değil · Görüştük ·
  İlgileniyor · Müşteri oldu); seçili olan dolu. Var olan durum `select`i
  bunun yerine geçer (aynı alan). Seçimden sonra 15 dk "Geri al" bağlantısı
  ve "15 dk içinde Meta'ya iletilecek" notu.
- Satır rozeti (`leadRozetTuru`): `iletildi` sessiz (gri onay), `bekliyor`
  gri, `eslesmedi` gri + açıklama, `sorun` kırmızı + neden; `kapali`
  rozetsiz.
- Liste üstünde ayar şeridi: "Sonuçları Meta'ya bildir: Açık · Ege Birlik
  Yapı pikseli · Son gönderim 4 dk önce" ya da kapalıyken tek cümle + "Aç".
- **Ayar penceresi** (sayfada, ayrı sayfa DEĞİL): veri kümesi seçici (önden
  dolu, CRM durumu), aydınlatma onay kutusu, uygunluk eksikleri adıyla,
  açılışta "7 günden eski N kayıt gönderilemez".
- **Gönderimler** sekmesi (aynı sayfa): tablo, durum çipleri, sayılar,
  "Gönderilemeyenleri tekrar dene". Dört hâl ayrı: yükleniyor, hata
  (sunucunun cümlesi), boş + neden (`GERI_BESLEME_BOS_NEDEN_ADI`), dolu.
- Karar mantığı saf fonksiyonda (`leadRozetTuru`, `asamaPlani`), effect
  içinde değil. `nav-sections`/`panel-tasarim` yeşil; yeni menü satırı YOK.

## 10. Ölçüm listesi (Ajan 5, canlıda)

Meta CAPI'de `validate_only` YOK ve `test_event_code` üretime işliyor;
canlı tur gerçek bir lead ister. Yol: Meta **Lead Ads Testing Tool** ile Ege
Birlik Yapı sayfasında test lead'i (gerçek `leadgen_id`), sonra Events
Manager'da gözle.

1. **M-1 Token**: ajansın kullanıcı token'ıyla (`ads_management`,
   `business_management`) müşteri pikseline `/events` POST çalışıyor mu;
   çalışmıyorsa kod/alt kod ve mesaj. Olmazsa Ç-11'in ikinci yolu.
2. **M-2 CRM veri kümesi**: `is_crm` okunuyor mu; `false` pikselde CRM
   olayı kabul ediliyor mu, Events Manager'da Conversion Leads bölümü.
3. **M-3 `lead_id` biçimi**: sayı literali (varsayılan) ve dize; ikisinin
   de kabulü. 17 haneli bir kimlik bulunursa onunla.
4. **M-4 Görünme**: test lead'inde `ham_lead` + `ulasildi` + `nitelikli`;
   Events Manager'da süre (belge ~30 dk) ve huni görünümü. `eslesmedi`
   Meta'da hiç oluşuyor mu.
5. **M-5 Hata gövdeleri**: geçersiz `lead_id`, 8 günlük `event_time`,
   paylaşılmamış piksel, süresi dolmuş token → `metaYanitSinifi` tablosu
   ÖLÇÜMLE güncellenir.
6. **M-6 Tekilleştirme**: aynı `event_id`+`event_name` iki kez → Events
   Manager'da bir mi iki mi.
7. **M-7 `events_received`**: 1 ve 50 olaylık partide sayı.
8. **M-8 Hacim**: workspace başına son 30 gün lead sayısı dağılımı (kaç
   müşteri 200'ü geçiyor) ve işaretleme kapsaması 2 hafta sonra.
9. **M-9 Google kaynağı** (Google açılmadan önce): `lead_form_submission_data`
   GAQL ile okunuyor mu ve `gclid` dolu mu; Data Manager API'nin Google
   Cloud projesinde açılması, `datamanager` scope'u ile `validateOnly`.
10. **M-10 Kota**: CAPI çağrısının hesap kota yüzdesine etkisi.
11. **M-11 Optimizasyon**: Conversion Leads ile optimize edilen ad set'in
    alanları (`optimization_goal`, `promoted_object`), AdvCampaign için
    ayrı karara girdi.

## 11. Ajan görevleri

**Ajan 2 · Arka Plan** (`apps/api/src/modules/geri-besleme/` + migration'lar)
- [ ] Migration 1: üç tablo, CHECK'ler, kısmi indeks, kompozit FK'ler.
  Migration 2 (ayrı): `SyncJobType` += `lead_feedback_send`.
- [ ] `02_rls.sql`, `pglite-harness` TRUNCATE, `WORKSPACE_TABLOLARI`
  (ayar taşınırken `etkin=false`, bekleyenler `iptal`).
- [ ] `leads.service.update`: geçmiş + `asamaPlani` aynı transaction'da;
  `LeadRecord.geriBesleme` (isteğe bağlı) liste sorgusunda.
- [ ] `lead-sync`: yeni lead → geçmiş + `ham_lead` (§ 5.1).
- [ ] `lead_feedback_send` işleyicisi (§ 5.4), `sweep:lead-feedback`,
  `datesForJob` dalı, Meta gönderici (`metaGovdeMetni`, `metaYanitSinifi`,
  `partiyiYarila`), transaction dışında çağrı.
- [ ] Controller `GERI_BESLEME_UCLARI` ile birebir; ayar `audit.record`.
- [ ] `alerts`: `geri_besleme_dusuyor`; `genel-bakis`: `geri_besleme_sorunu`
  (Ç-9). `UYARI_KODLARI` ve `BEKLEYEN_IS_TURLERI` bu commit'te.
- [ ] Modül kayıtları (`app.module`, `queue.module`) + kaynak taramasıyla
  kilit (Nest kaydı açılışta patlar).

**Ajan 3 · Ön Yüz**
- [ ] Lead kartında kalite sorusu (durum `select`inin yerine), "Geri al",
  satır rozeti, ayar şeridi + penceresi, Gönderimler sekmesi (§ 9).
- [ ] Uyarı ve bekleyen iş bağlantıları üreticiden.

**Ajan 4 · Test & Güvenlik (kapı)**
- [ ] RLS `SET ROLE` + `RETURNING`: üç tabloda başka workspace'in satırı
  okunamıyor/güncellenemiyor; `PUT /leads/:id`'in geçmiş + olay yazması
  etkilenen satırı SAYIYOR.
- [ ] CHECK listeleri = shared listeleri (iki yönlü).
- [ ] `test_event_code` kaynakta YOK (yorumsuz kaynakta tarama); gövdede
  `em`/`ph`/`fn` yok.
- [ ] Mutasyonlar: 7 gün ön kontrolünü sil → parti testi düşmeli; ayar
  hatasında deneme artırılırsa düşmeli; `ON CONFLICT` kaldırılırsa çift
  aşama testi düşmeli; `asamaPlani` çağrısı `update`ten silinirse düşmeli
  (fonksiyonun ÇAĞRILDIĞI test edilmeli); ön koşul kontrolü silinirse
  "platform çağrısı sayısı 0" testi düşmeli.
- [ ] Sessiz hata taraması: `.catch(() => [])` yok; `succeeded + rows=0`
  notsuz değil; boş liste `emptyReason` taşıyor.
- [ ] `Prisma.sql` yorum/backtick ve `::int` taramaları.

**Ajan 5 · Canlıya alma**: migration sırası (tablo, sonra enum), § 10
ölçümleri (M-1…M-7 ilk gün), `DEVAM.md`, deploy elle `advetics` kullanıcısıyla.

**Ajan 6 · Tasarım denetimi**: taslakla yan yana, masaüstü + 375 px.

## 12. Neyi ÖLÇMEDİM (Ajan 1)

- Hiçbir Meta çağrısını canlıda yapmadım: token yeterliliği, `is_crm`,
  `lead_id` biçimi, hata kodları, tekilleştirme (M-1…M-7) belgeden.
- `metaYanitSinifi`ndaki kod tablosu Graph'ın genel sözlüğünden; CAPI'ye
  özgü kodlar ölçülmedi.
- Google'ın 15 Haziran 2026 kısıtının bizim Google Cloud projemize
  uygulandığını (önceden hiç offline yükleme yapılmadığını) depodan
  çıkardım (`uploadClickConversions` hiçbir yerde yok); hesap tarafında
  doğrulamadım.
- Müşterilerin aylık lead hacmini ölçmedim (Ç-12'nin ağırlığı buna bağlı).
- Lead kimliklerinin gerçekte kaç haneli geldiğini üretim verisinde saymadım.
