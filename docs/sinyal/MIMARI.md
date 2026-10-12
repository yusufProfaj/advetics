# Paket A: Sinyaller ve bildirim kanalları (Ajan 1 · Mimar)

**Tarih:** 2026-10-12 · **Girdi:** [`../rakip-analizi/ORPHEX-BOSLUK.md`](../rakip-analizi/ORPHEX-BOSLUK.md)
§1 (B-1, B-2, B-4) ve §2 "Paket A" · **Sözleşme:** `packages/shared/src/sinyal/`
(derleme çıktısıyla temiz, `apps/api/src/modules/sinyal/sozlesme.spec.ts` 33 test)
· **Taslak:** [`taslak.html`](taslak.html) · **Durum:** Ajan 1 bitti; Ajan 2-3
kullanıcı kararıyla BEKLİYOR (Ç-O7: devam eden işler canlıda doğrulanınca).

"Bir şey ters gidince haber ver." Üç parça, tamamı VAR OLAN veriden:

1. **Performans anomalisi**: `insights_daily`den beklenen aralık dışı.
2. **Sağlık kontrolleri**: yalnız verisi depoda duran üç kontrol.
3. **Bildirim kanalları**: workspace başına e-posta, Slack, Teams; kural
   motorunun bugün yalnız kayıt yazan `notify` eylemi aynı kanallara bağlanır.

Modül adı `sinyal`, İyileştir'in alt parçası DEĞİL (gerekçe `sinyal/index.ts`):
ekranı İyileştir'in sekmesi, ama veri modeli farklı ve kanalları kural motoru
da kullanıyor.

---

## 0. Çelişki tablosu (ajanlar başlamadan kullanıcıyla kapanmalı)

"Öneri" sütunu Mimar'ın önerisi; **karar kullanıcının**. CLAUDE.md §5 gereği
saf arayüz kararları (sekme yeri, sıralama) sorulmadı, gerekçesiyle yazıldı
ve "Karar" sütununda "Mimar (§5)" diye işaretli.

| # | Taslak / brief diyor | Depo gerçeği | Öneri | Karar |
|---|---|---|---|---|
| Ç-1 | Altı sağlık kontrolü (7 gün sıfır gösterim, reddedilmiş reklam, Meta kitle <1.000, dönüşüm işlemi yok/pasif, GA4 key event yok, PMax asgari varlık) | Yalnız İKİSİNİN verisi depoda: `ads.review_status/disapproval_reasons` ve `insights_daily`. Meta kitleleri istek anında Meta'dan (`listCustomAudiences`), GA4 anahtar etkinlikleri canlı Admin API (`kurulum/ga4.ts`), Google dönüşüm işlemleri Ölçüm ekranında canlı + **sunucu belleğinde** önbellek (`olcum.service` `onbellek`), PMax öğe grubu yalnız AdvCampaign geri okumasında. Ayrıntı `saglik.ts#SAGLIK_DISARIDA` | **v1 üç kontrol:** `sifir_gosterim`, `reklam_onaysiz` ve "dönüşüm işlemi pasif" yerine depodan hesaplanan `donusum_kesildi` ("vardı, kesildi"). Kalan dördü ekranda "Kontrol edilmeyenler" satırında adıyla ve nedeniyle. | **KAPANDI 2026-10-12: öneri kabul** (kullanıcı kararları oturum yöneticisine devretti) |
| Ç-2 | Paket A "ek entegrasyon yok, kota etkisi yok" | Dışarıda kalan dört kontrolü eklemenin tek yolu, canlı okumaları günlük bir işle saklamak (hesap başına günde 1-3 platform çağrısı) | v1'de YOK. Ölçüm modülü canlı okumasını tabloya yazmaya başlarsa (Paket F, GA4 okuma) kontroller o tablodan eklenir; ikinci bir okuyucu yazılmaz. | **KAPANDI 2026-10-12: öneri kabul** (kullanıcı kararları oturum yöneticisine devretti) |
| Ç-3 | Erişim kaybı (Orphex'in 9 kontrolünden biri) | `alerts` modülü bunu ve hesap kapalı, ödeme, veri bayat, iş düşüyor uyarılarını ZATEN üretiyor (`uyari.schema.ts`), istek anında ve saklamadan | Uyarılar AYRI kalır, sinyallerle birleşmez: onlar teknik/hesap hâli, sinyal performans/kurulum gözlemi. Sinyal hesabı veri bayatken SUSAR ve hesap satırında "veri bayat" yazar (aynı olay iki kutuda olmasın, genel-bakis Ç-2 kuralı). **Ek soru:** bağlantı/ödeme uyarıları da Slack/Teams'e gitsin mi? Öneri: v1 hayır (ödeme maili zaten var, `odeme-tetigi`), v2'de `uyari` olayı. | **KAPANDI 2026-10-12: öneri kabul** (kullanıcı kararları oturum yöneticisine devretti) |
| Ç-4 | Taslak: "anomali + sağlık tek tabloda" | İyileştir önerileri SAKLANMIYOR (bayatlar) | Sinyal SAKLANIR: kapatma, kendiliğinden kapanma, yeniden açılma ve "kanala ne gitti" geçmiş ister. Öneri ile sinyal tek tipe zorlanmadı. Kreatif yorgunluğu öneri olarak kalır; anomali reklam seviyesinde ARANMAZ (aynı olay iki ekranda iki dille). | Mimar (§5) |
| Ç-5 | Teams webhook `*.webhook.office.com` | Microsoft eski "Gelen Web Kancası"nı (Office 365 Connectors) emekliye ayırıyor; yeni yol Teams Workflows, adresi `*.logic.azure.com`, gövde Adaptive Card. Hangisinin bugün çalıştığı ÖLÇÜLMEDİ | İki aileyi de kabul et (`WEBHOOK_IZINLI.teams`), gövde aileye göre (`teamsAilesi`). Ajan 5 ikisini de gerçek bir Teams kanalına gönderip GÖZLE doğrular; çalışmayan aile listeden çıkar. | **KAPANDI 2026-10-12: öneri kabul** (kullanıcı kararları oturum yöneticisine devretti) |
| Ç-6 | Kural `notify` "yalnız kayıt" (İyileştir İ-8) | `rule-executor.service.ts` `notify`ı `simulated` yazıyor, hiçbir yere göndermiyor | `notify` eylemine `kanalIdleri` (isteğe bağlı, sözleşmede eklendi). Kanalsız eski kurallar "yalnız kural geçmişine yazılır" der. **Ek öneri:** canlı kuralın platformda BAŞARISIZ olan eylemi de `kural` olayı olarak gitsin (bugün yalnız kural geçmişinde duruyor, sessiz hata). | **KAPANDI 2026-10-12: öneri kabul** (kullanıcı kararları oturum yöneticisine devretti) |
| Ç-7 | "Sabah maili" (Orphex) | Sinyaller gece, her hesabın KENDİ gün dönümünden sonra hesaplanıyor | Sinyal bildirimi her kanala **günlük özet, 09:00 İstanbul** (`SINYAL_OZET_SAATI`). Kural bildirimi **anında**. Gece 03:00'te düşen Slack mesajı sabah diğerlerinin altında kalır. | **KAPANDI 2026-10-12: öneri kabul** (kullanıcı kararları oturum yöneticisine devretti) |
| Ç-8 | E-posta alıcıları | Rapor alıcıları müşteriye gidiyor; ödeme maili yalnız ajansa | Kanal alıcıları serbest liste, varsayılan BOŞ (önden doldurulmaz). Sinyal ajansın iç bilgisi; müşteri adresi yazılırsa form uyarır ama engellemez. Gönderen: org yöneticisinin e-posta kimliği (`OdemeMailiGonderici` deseni); yoksa e-posta kanalı EKLENİRKEN söylenir. | **KAPANDI 2026-10-12: öneri kabul** (kullanıcı kararları oturum yöneticisine devretti) |
| Ç-9 | Yetki | İyileştir menüsü `rule.read`; Uygula `budget.write`; Marka Merkezi workspace ayarları `client.write` | Okuma `rule.read`, kapat/geri aç `rule.write`, Uygula `budget.write`, kanal yazma `client.write` (`SINYAL_UCLARI`). Müşteri hesabı hiçbirini görmez (testte kilitli). | Mimar (§5) |
| Ç-10 | "Dün dönüşüm düştü" | Dönüşümler atıf penceresi yüzünden dün için eksik; `insights_backfill` son 7 günü her gece düzeltiyor | Dönüşüm temelli metrikler 3 gün geriden değerlendirilir (`ANOMALI.donusumGecikmesiGun`), kart "3 gün önceki veri" der. | Mimar (§5) |
| Ç-11 | Orphex "100+ metrik" | Reklam bilmeyen kullanıcı hedefi; her metrik yeni bir yanlış alarm kaynağı | Altı metrik (`ANOMALI_METRIKLERI`), yalnız KÖTÜ yön (maliyet iki yön), hesap + kampanya seviyesi. | Mimar (§5) |
| Ç-12 | Taslak: kapatılan sinyal yalnız kötüleşirse açılır | Tek başına uygulanırsa kalıcı sessizlik: Mart'ta kapatılan sıçrama, Ekim'deki daha küçük yeni sıçramada hiç açılmaz | Olay bitince (koşul görülmeyince) kapatma referansı düşer: `kapatildi + sure_doldu → kendiliginden_kapandi`; sonraki gözlem yeni olay (`durum.ts`, testte kilitli). | Mimar (§5) |
| Ç-13 | Genel Bakış "Bekleyen işler" | `BEKLEYEN_IS_TURLERI` üç ayrı `Record`ı besliyor (sözleşme, API, panel) | `sinyal_acik` türünü Ajan 2 kendi commit'inde ekler (`SINYAL_BEKLEYEN_IS`); şimdi eklemek API ve panel derlemesini kırardı. | Mimar (§5) |
| Ç-14 | "2 hafta sessiz koşum" | Sinyal panelde ve kanalda görünürse yanlış alarm ölçümü kullanıcıyı da etkiler | `SINYAL_SESSIZ_KOSUM=1` ortam değişkeni (deploy'la kontrol): hesaplanır, yalnız org yöneticisine görünür, kanala gitmez; `SinyalListesi.sessizKosum` panelde bant. | Mimar (§5) |

**Açık sorular, öneriyle birlikte (kullanıcıya):**

1. Sağlık kontrolleri v1'de üç tane mi (öneri: evet), dördü "kontrol edilmeyenler" satırında görünsün mü (öneri: evet)?
2. Dışarıda kalanlar için platforma günlük çağrı yapan bir okuyucu açılsın mı? Öneri: hayır, Paket F'yi bekle.
3. Bağlantı/ödeme uyarıları da kanallara gitsin mi? Öneri: v1 hayır.
4. Teams'te iki adres ailesi de kabul edilsin, canlıda ölçülsün mü? Öneri: evet.
5. Başarısız kural eylemi de bildirilsin mi? Öneri: evet.
6. Sinyal özeti 09:00'da günde bir, kural anında? Öneri: evet.
7. Kanal alıcısı serbest ve boş başlasın, müşteri adresi uyarıyla kabul edilsin mi? Öneri: evet.

---

## 1. Neyin nerede olduğu (okunan dosyalar)

| Konu | Yer | Paket A'daki rolü |
|---|---|---|
| Günlük metrik | `insights_daily` (aylık bölümlü, doğal PK, `entity_level` account/campaign/ad_group/ad) | Anomali + `sifir_gosterim` + `donusum_kesildi` girdisi |
| Reklam onayı | `ads.review_status`, `ads.disapproval_reasons` (structure-sync), `ads/review-issues.ts` | `reklam_onaysiz`, Reklam Yöneticisi "Sorunlu" ile AYNI fonksiyon |
| Teknik uyarılar | `alerts/` + `uyari.schema.ts` (istek anında, saklanmaz) | Ayrı kalır (Ç-3) |
| Öneriler | `iyilestir/` (istek anında, karar saklanır) | Ayrı kalır (Ç-4) |
| Kural `notify` | `rules/rule-executor.service.ts` → `simulated` | Kanallara bağlanır (Ç-6) |
| Sistem maili | `alerts/odeme-maili-gonderici.service.ts` + `email/mail-gonderici.ts` (`{kabul, ret}`) | E-posta kanalının gönderim yolu |
| Dış istek koruması | `tenancy/site-oku.ts#ozelAdres` (DNS sonrası iç ağ reddi), `redirect: 'manual'` | Webhook gönderimi |
| Durdur yolu | `campaign-actions` `POST /campaigns/varliklar/:seviye/:id/eylem` (geri okumalı, `budget.write`) | Sinyal "Uygula" bunu servis olarak çağırır |
| Zamanlayıcı | `queue/sync-queue.service.ts` (`sweep:daily` saatlik, hesap TZ'sine göre "dün") | Zincir § 5 |
| Bekleyen işler | `genel-bakis/index.ts` | `sinyal_acik` (Ç-13) |

## 2. Veri modeli (Ajan 2)

Üç yeni tablo; hepsi `client_id` + `org_id` taşır, `(client_id, org_id)`
kompozit FK `clients`a (diğer tablolarla aynı). Durum kolonları **varchar +
CHECK** (enum değil): liste shared'da kapalı ve değer eklemek ayrı migration
istemesin; CHECK listesi ile shared listesi Ajan 4 testinde karşılaştırılır
(`fatura-zip.spec.ts` deseni).

### `sinyaller`

| Kolon | Tip | Not |
|---|---|---|
| id | uuid PK | |
| org_id, client_id | uuid NOT NULL | org_id HEDEF müşteriden (`musteriOrgId`), `ctx`ten değil |
| ad_account_id | uuid NOT NULL | FK `ad_accounts` |
| platform | `Platform` | |
| anahtar | varchar(200) | `sinyalAnahtari`; **UNIQUE (anahtar)**, client_id YOK (§ 3 taşıma) |
| tur, kod, yon | varchar | CHECK: `SINYAL_TURLERI`, `ANOMALI_METRIKLERI ∪ SAGLIK_KONTROLLERI`, `artis/dusus/NULL` |
| seviye | `EntityLevel` | |
| varlik_id | uuid | bizim kimliğimiz |
| varlik_adi, ust_adi | varchar | GÖZLEM ANINDAKİ ad (varlık silinse de kart okunur) |
| gun | date | gözlem günü, `YYYY-MM-DD` |
| gozlenen | numeric NULL | |
| beklenen_alt, beklenen_orta, beklenen_ust | numeric NULL | |
| nokta | smallint NULL | aralığın kaç geçmiş noktadan geldiği |
| z | numeric NULL | işaretli sapma; kötüleşme referansı |
| onem | varchar | `yuksek/orta` |
| para_birimi | char(3) | |
| kanit | jsonb | seri (`SinyalSerisi`), sağlık bulgusunun ayrıntısı (ret nedenleri vb.) |
| durum | varchar | CHECK `SINYAL_DURUMLARI` |
| ilk_gorulme, son_gorulme, son_acilma | timestamptz | `son_acilma` özetin süzgeci |
| acilma_sayisi | int default 1 | |
| kapatma_nedeni | varchar NULL | CHECK `SINYAL_KAPATMA_NEDENLERI` |
| kapatma_z | numeric NULL | kapatma anındaki z (kötüleşme referansı) |
| kapatan_user_id | uuid NULL | `users`a LEFT JOIN (RLS'li tabloya INNER JOIN yasağı) |
| kapatma_zamani, kapatma_notu | | |
| uygulama | jsonb NULL | Uygula sonucu (`dogrulandi/uyusmadi`, platform değeri, kim, ne zaman) |
| created_at, updated_at | timestamptz | |

İndeksler: `UNIQUE (anahtar)`; `(client_id, durum, son_acilma DESC)`;
`(ad_account_id)`; özet için `(client_id, son_acilma) WHERE durum = 'acik'`
(kısmi: yüklemdeki durumdan çıkışı iş `sure_doldu` ile, kullanıcı `kapat` ile
yazıyor, kalıcı kilit yok). Kayıt sayısı sınırı: aynı anahtar tek satır, yani
büyüme varlık × kod ile sınırlı; temizlik GEREKMİYOR, 400 gündür
`son_gorulme`si eski kapalı satırlar için ileride karar.

### `bildirim_kanallari`

| Kolon | Tip | Not |
|---|---|---|
| id, org_id, client_id | uuid | |
| tur | varchar | CHECK `KANAL_TURLERI` |
| ad | varchar(80) | |
| hedef_enc | bytea NULL | webhook adresi, `CryptoService` ile şifreli; e-postada NULL |
| hedef_ipucu | varchar(120) | `webhookIpucu`; e-postada "3 alıcı" |
| alicilar | text[] NULL | yalnız e-posta |
| olaylar | text[] | CHECK her eleman `BILDIRIM_OLAYLARI`ta |
| etkin | boolean default true | |
| dogrulandi | timestamptz NULL | kullanıcının "geldi" cevabı |
| son_ozet_kapsami | timestamptz NULL | son sinyal özetine giren en yeni `son_acilma` |
| created_by | uuid | |
| created_at, updated_at | | |

`hedef_enc` HİÇBİR liste sorgusunda seçilmez: `select` sabiti `satisfies
Prisma.BildirimKanaliSelect` ve tip ondan türetilir (`connections-select.spec`
deseni; şifreli token'ın belleğe alınma dersi).

### `bildirim_gonderimleri` (teslim kaydı)

| Kolon | Tip | Not |
|---|---|---|
| id, org_id, client_id | uuid | |
| kanal_id | uuid NULL | FK ON DELETE SET NULL (kanal silinse de geçmiş kalır) |
| olay | varchar | `sinyal/kural/deneme` |
| anahtar | varchar(160) | `ozet:2026-10-12`, `kural:<rule_run_id>`, `deneme:<uuid>`; **UNIQUE (kanal_id, anahtar)** = idempotent |
| ozet | varchar(200) | tek satır |
| govde | jsonb | gönderilecek içerik (yeniden denemede aynısı) |
| kaynaklar | jsonb | sinyal id'leri / rule_run id |
| durum | varchar | CHECK `TESLIM_DURUMLARI` |
| deneme | smallint default 0 | |
| sonraki_deneme | timestamptz | ilk değer: sinyal → sonraki 09:00, kural → now() |
| http_durum | int NULL, hata text NULL | platformun/SMTP'nin cümlesi aynen |
| reddedilen | text[] NULL | e-postada `mailGonder().ret` (kısmi ret sessiz kalmasın) |
| created_at, gonderildi | | |

İndeks: `(sonraki_deneme) WHERE durum IN ('bekliyor','basarisiz')`;
`(client_id, created_at DESC)`.

### Üç durak (CLAUDE.md) ve iki taşıma kararı

| Tablo | `pglite-harness` TRUNCATE | `02_rls.sql` | `WORKSPACE_TABLOLARI` | Hesap taşıma (`hesap-verisi-tasima.ts`) |
|---|---|---|---|---|
| `sinyaller` | ekle | SELECT/INSERT/UPDATE workspace kapsamı, DELETE yok | TAŞINIR | `HESABIN_KENDI_VERISI`: TAŞINIR (platform aynasından türetilmiş gözlem; tekil anahtarda `client_id` yok, hedefte çakışmaz) |
| `bildirim_kanallari` | ekle | SELECT/INSERT/UPDATE/DELETE workspace kapsamı | TAŞINIR | hesaba bağlı değil, dokunulmaz |
| `bildirim_gonderimleri` | ekle | SELECT + INSERT workspace kapsamı; UPDATE yalnız taşıma için; worker BYPASSRLS | TAŞINIR | hesaba bağlı değil |

Enum `SyncJobType`a iki değer: `signals_evaluate`, `notifications_send` —
**AYRI migration** (`ALTER TYPE ... ADD VALUE`, aynı transaction'da
kullanılmaz). Migration yazmadan hemen önce `git pull` (iki geliştirici).

## 3. Uçlar

Tek kaynak `packages/shared/src/sinyal/uclar.ts` (`SINYAL_UCLARI`, izinleriyle).
Davranış notları:

- `GET /sinyaller`: `clientId` yoksa erişilen bütün workspace'ler (Genel
  Bakış "tüm workspace'ler" kipi). Sorgular `client_id = ANY($1)` dizisiyle
  (CLAUDE.md "ölçerek"). Yanıt `SinyalListesi`: `toplam`, `sayilar`,
  `emptyReason`, hesap başına `hesaplar` (son hesaplama `sync_jobs`
  `signals_evaluate`ten, iş türü başına), `kontrolEdilmeyen`, `hatalar`.
- `POST /sinyaller/:id/uygula {ozet}`: satırı yeniden oku, özet uymuyorsa
  409; `googleYazilamazMi` / LinkedIn → 400 Türkçe sebep, platforma gitmeden;
  `CampaignActionsService` (platform çağrısı transaction DIŞINDA), geri okuma;
  sonra `sinyalGecisi(acik, 'uygulandi')`, `uygulama` kolonu + `audit.record`.
- `POST /bildirim/kanallar`: `kanalOlusturSchema` (webhook `webhookDenetle`).
  Kaydedince otomatik `dene` YOK; ekran "Kaydet ve deneme mesajı gönder"
  ile ikisini sırayla çağırır (kayıt başarılı, gönderim düştü hâli ayrı yazılsın).
- `POST .../dene`: `bildirim_gonderimleri`ne `olay='deneme'` satırı + anında
  gönderim; yanıt teslim sonucu ve platformun cümlesi. `dogrula {geldi}`:
  `true` → `dogrulandi = now()`; `false` → `dogrulandi = NULL` ve ekran
  "kanal adı / adres doğru mu" yönlendirmesi.

## 4. Durum makinesi

`packages/shared/src/sinyal/durum.ts` (`SINYAL_GECISLERI`, testte kilitli).

```
              gozlendi/kotulesti            kullanici_kapatti / uygulandi
   (yok) ──────────────────────► ACIK ─────────────────────────────► KAPATILDI
                                  │ ▲                                  │   │
                     sure_doldu   │ │ gozlendi / kotulesti   kotulesti │   │ sure_doldu
                                  ▼ │                  kullanici_geri_acti │
                      KENDILIGINDEN_KAPANDI ◄──────────────────────────────┘
```

- Kim yazar: `gozlendi`, `kotulesti`, `sure_doldu` → `signals_evaluate` işi;
  `kullanici_kapatti`, `kullanici_geri_acti` → `rule.write`; `uygulandi` →
  `budget.write`.
- `sure_doldu`: anomali 7 gün, sağlık 1 değerlendirme
  (`KENDILIGINDEN_KAPANMA_GUN`).
- Bildirim YALNIZ `bildirilirMi` doğruysa (ilk açılış ya da kapalıdan açığa).
- "Kapalı" sayan her yer `SINYAL_KAPALI_DURUMLARI`nı okur; teslimde son
  durumlar `TESLIM_SON_DURUMLARI` (ikisi birlikte sayılmazsa ilerleme bitmez).

## 5. İş zamanlaması ve zincir

**Platform çağrısı YOK.** Her şey veritabanından; kota etkisi sıfır.

1. **`signals_evaluate` (hesap başına, gün başına)**: `insights_daily` işi
   BAŞARIYLA bittiğinde, işin SONUNDA kuyruğa alınır (`{adAccountId, gun}`,
   kimlik `signals_evaluate__<hesap>__<gün>`). Öncelik bariyer değil (CLAUDE.md):
   yapı ve metrik işleri paralel slotlarda koşabildiği için zincir şart.
   `insights_backfill` bitince de aynı hesap için kuyruğa alınır (dönüşüm
   metrikleri o gün düzeliyor; iş idempotent, upsert).
2. **Ön koşul ÇAĞRIDAN ÖNCE**: o gün için başarılı `insights_daily` yoksa
   iş `rows=0` + not "günlük metrik henüz yok" ile biter ve TEKRAR DENENMEZ
   (sıfır maliyetli ret; "succeeded + rows=0 bir hata türü" dersine göre not
   ZORUNLU, ekranda "hesaplanmadı" olarak görünür).
3. **Emniyet süpürmesi `sweep:signals`** (günde bir, 07:40 İstanbul):
   dünü çekilmiş ama `signals_evaluate` satırı olmayan hesapları kuyruğa
   alır. Zincir kaybolursa (worker deploy'da öldü, `kuyruk_vazgecti`) sinyal
   bir gün gecikir, hiç gelmemezlik olmaz. `sweep-dates.spec.ts` yeni türü
   ve tarih dalını görmeli (`datesForJob`).
4. **İşin içi**: hesap seviyesi + kampanya seviyesi satırları; her metrik
   için gözlenen gün + aynı haftanın günü son 6 hafta (dönüşüm metrikleri
   3 gün geriden); `anomaliDegerlendir`; üç sağlık kontrolü; her bulgu için
   satır upsert + `sinyalGecisi`; bu değerlendirmede görülmeyen açık
   sinyallerde `sure_doldu` kontrolü. Atılan bulgu sayısı ve neden
   dağılımı (`hacim_dusuk: 41, gecmis_yetersiz: 3 ...`) `sync_jobs.note`a.
5. **`notifications_send` (`sweep:notifications`, 5 dakikada bir)**:
   `sonraki_deneme <= now()` olan `bekliyor/basarisiz` satırları gönderir.
   09:00 İstanbul'da her etkin kanal için `ozet:<gün>` satırı üretilir
   (`son_acilma > son_ozet_kapsami` olan açık sinyaller; yoksa satır
   ÜRETİLMEZ, boş özet gitmez). Kural bildirimi `rule-executor` turunun
   sonunda TEK satır (kural başına tur başına), anında.
6. **Sessiz koşum** (Ç-14): `SINYAL_SESSIZ_KOSUM=1` iken 4 çalışır, 5 hiç
   satır üretmez.

## 6. Anomali yöntemi (ilk sürüm, sade)

`packages/shared/src/sinyal/anomali.ts`, bütün sayılar `ANOMALI` sabitinde ve
"ÖLÇÜLECEK" işaretli.

- **Beklenen aralık**: haftanın aynı günü, son 6 hafta (en az 4 nokta);
  ortanca ± 3 × ölçekli MAD; yayılım tabanı ortancanın %5'i; alt sınır 0.
- **Düşük hacim**: GEÇMİŞİN ortanca hacmine bakılır (gösterim 1.000, tıklama
  30, dönüşüm 5), gözlenene değil: sıfıra düşüş tanım gereği düşük hacimdir.
- **Tam durma**: gözlenen 0 ve geçmiş hacimli → her zaman anomali, yüksek
  önem (gürültülü seride alt sınır 0'a kırpılıyor ve sıfır "aralık içi"
  çıkıyordu; testte kilitli).
- **Yön**: yalnız kötü yön; maliyet iki yön.
- **Göreli eşik**: ortancadan %30'dan az sapma elenir. `esikZ × taban`
  bunun altında kalmak zorunda, yoksa kontrol ölü kod (ilk sürümde öyleydi,
  test yakaladı).
- **Önem**: |z| ≥ 5 yüksek.
- **Türetilmiş oranlar** gün toplamlarından (SUM/SUM).
- Para metrikleri hesap para biriminde; karşılaştırma aynı varlığın kendi
  geçmişiyle olduğu için kur çevrimi gerekmiyor.

## 7. Bildirim içeriği

- **E-posta**: konu `Advetics · 4 yeni sinyal · 12 Ekim`; gövde workspace
  başına gruplu satırlar, her satırda panel bağlantısı. Gönderen org
  yöneticisinin kimliği. `mailGonder().ret` boş değilse satır `gonderildi`
  ama `reddedilen` dolu ve ekranda "2 alıcı reddetti" (kısmi ret sessiz kalmaz).
- **Slack**: `text` + `blocks` (bölüm başına bir satır, en çok 10 satır;
  fazlası "ve 7 sinyal daha" + panel bağlantısı, sessiz kesme yok).
- **Teams**: aileye göre MessageCard (bağlayıcı) ya da Adaptive Card
  (Workflows).
- Sayılar ŞABLONDAN; yapay zekâ metin yazmıyor (Paket B kuralıyla aynı:
  model sayı uydurmasın).
- Marka: gövdede ajans adı değil Advetics (beyaz etiket kuralı, rapor kapağı).

## 8. Dış istek güvenliği

- Webhook adresi kayıtta `webhookDenetle` (https, tam/sonek beyaz liste
  `endsWith`, IP literali ret, kullanıcı bilgisi ret, port ret, Slack yol
  öneki) ve **şifreli** saklanır; yanıtta tam adres YOK.
- Gönderimde: DNS çözülür ve `ozelAdres` ile iç ağ reddedilir (adres
  kontrolü `evil.com → 169.254.169.254`ü göremez); `redirect: 'manual'`
  (3xx = kalıcı hata, izlenmez); zaman aşımı 10 sn; yanıt gövdesi en çok
  4 KB okunur (hata cümlesi için); istek gövdesi en çok 40 KB.
- Kalan risk DNS rebinding (logo indirme ile aynı kabul edilen kalıntı).

## 9. Ekran (Ajan 3), taslak `taslak.html`

- **İyileştir › Sinyaller** sekmesi (`?sekme=sinyaller`, Öneriler'den sonra):
  özet şeridi (açık, bu hafta açılan, kapatılan, son hesaplama), süzgeç çipleri
  (Performans/Sağlık, platform), satır listesi (Google Ads "hesap teşhisi"
  düzeni), her satırda kanıt + mini grafik (bant) + tek birincil düğme.
  Hesap durumu satırı ve "Kontrol edilmeyenler" satırı. Dört hâl ayrı:
  yükleniyor, hata (sunucunun cümlesi), boş + neden, dolu.
- **Genel Bakış › Bekleyen işler**: `3 sinyal açık` satırı → Sinyaller.
- **Marka Merkezi › Workspace ayarları › Bildirimler** (`?bolum=` iç menü
  bölümü, ayrı sayfa DEĞİL): kanal listesi, kanal ekleme (tür kartları,
  WhatsApp gri ve nedenli), adres alanı BIRAKILINCA doğrulama, "Deneme
  mesajı geldi mi?", son gönderimler tablosu.
- **Kural sihirbazı › Bildirim adımı**: eylem "Yalnızca bildir" seçilince
  kanal seçimi; kanal yoksa "Kanal yok, bildirim yalnız kural geçmişine
  yazılır · Kanal ekle".

## 10. Ölçüm listesi (Ajan 5, canlıda)

1. **Sessiz koşum, 14 gün**: `SINYAL_SESSIZ_KOSUM=1`. Günde kaç sinyal (hesap
   ve workspace başına), metrik başına dağılım, `hacim_dusuk/gecmis_yetersiz`
   oranı. Org yöneticisi her sinyali "doğru / yanlış alarm" diye işaretler
   (kapatma notu yeterli). **Hedef**: workspace başına günde ≤ 2 açık sinyal,
   yanlış alarm ≤ %30. Tutmazsa `esikZ`, `enAzGoreliSapma`, hacim eşikleri
   ayarlanır ve ölçüm `anomali.ts`e YAZILIR.
2. **Dönüşüm gecikmesi**: Meta ve Google'da "dün"ün dönüşümünün kaç günde
   %95'ine ulaştığı (`insights_backfill` öncesi/sonrası). `donusumGecikmesiGun`.
3. **`sifir_gosterim` doğrulaması**: Meta sıfır teslimli günde satır
   döndürmüyor varsayımı; bir duraklatılmamış ama teslim almayan kampanyada.
4. **Slack**: gerçek kanala özet + deneme; 404/410 cevabının gövdesi.
5. **Teams**: iki aile (Ç-5), hangisi çalışıyor, gövde biçimi gözle.
6. **E-posta**: org yöneticisi kimliğiyle gönderim, kısmi ret.
7. **İş süresi**: en büyük hesapta `signals_evaluate` süresi ve sorgu planı
   (`insights_daily` kısmi indeksleri, `loops=`; CLAUDE.md "ölçerek").
8. **Uygula**: bir sinyalden kampanya durdurma, Meta'da GÖZLE.

## 11. Ajan görevleri

**Ajan 2 · Arka Plan** (`apps/api/src/modules/sinyal/` + migration'lar)
- [ ] Migration 1: üç tablo, CHECK'ler, indeksler, kompozit FK. Migration 2
  (ayrı): `SyncJobType` iki değer.
- [ ] `02_rls.sql`, `pglite-harness` TRUNCATE, `WORKSPACE_TABLOLARI`,
  `HESABIN_KENDI_VERISI` (sinyaller).
- [ ] `signals_evaluate` işleyicisi (§ 5.2-5.4), `datesForJob` dalı, zincir
  (`insights_daily`, `insights_backfill` sonu), `sweep:signals`.
- [ ] Üç sağlık kontrolü saf fonksiyon (`reklam_onaysiz` → `hasReviewIssue`).
- [ ] `notifications_send` + `sweep:notifications`, özet üretimi, üç gönderici
  (e-posta `mailGonder`, Slack, Teams iki aile), § 8 korumaları.
- [ ] `rule-executor`: `notify` + (Ç-6 kabul edilirse) başarısız canlı eylem
  → `kural` gönderim satırı.
- [ ] Controller'lar `SINYAL_UCLARI` ile birebir; Uygula `CampaignActionsService`.
- [ ] `genel-bakis`: `sinyal_acik` türü (Ç-13) + `KAYNAK_HATASI`.
- [ ] `connections.module`/`queue.module` kayıtları + kaynak taramasıyla kilit
  (Nest kaydı açılışta patlar).

**Ajan 3 · Ön Yüz**
- [ ] İyileştir Sinyaller sekmesi, Bekleyen işler satırı, Marka Merkezi
  Bildirimler bölümü (`marka-merkezi/bolumler.ts`), kural sihirbazı adımı.
- [ ] Bağlantılar üreticilerden (`lib/reklam-yoneticisi.ts`, `butce-adresi`),
  elle birleştirme yok. Webhook alanı `webhookDenetle` ile `onBlur`'da.
- [ ] Karar mantığı saf fonksiyonda (`sinyalKutuHali`, `sinyalCumlesi`),
  effect içinde değil. `nav-sections`/`panel-tasarim` yeşil.
- [ ] Kural ekranındaki "Yalnızca bildir" açıklaması: kanalsızsa "yalnız
  kayıt", kanallıysa kanal adları.

**Ajan 4 · Test & Güvenlik (kapı)**
- [ ] RLS `SET ROLE` + `RETURNING`: üç tabloda başka workspace'in satırı
  okunamıyor/güncellenemiyor; kapat UPDATE'i etkilenen satırı SAYIYOR; taşıma
  (`WORKSPACE_TABLOLARI`, `HESABIN_KENDI_VERISI`) sinyaller dahil satır sayıyor.
- [ ] CHECK listeleri = shared listeleri (iki yönlü).
- [ ] `hedef_enc` hiçbir yanıtta ve liste `select`inde yok (kaynak + yanıt).
- [ ] Webhook gönderimi: iç IP'ye çözülen ad reddediliyor (iddia SEBEBE
  çapalı, `kreatif-gorseli.spec` dersi), 3xx izlenmiyor, zaman aşımı.
- [ ] Mutasyonlar: tam durma kuralı, `endsWith`, `kapatildi+sure_doldu`
  (Ajan 1 yaptı, üçü de düşüyor), zincir çağrısını sil → test düşmeli,
  ön koşul kontrolünü sil → platform/sorgu sayısı testi düşmeli, `ret`i
  yok say → kısmi ret testi düşmeli, özet kontrolünü sil → Uygula testi düşmeli.
- [ ] Sessiz hata taraması: `.catch(() => [])` yok; boş liste her yolda
  `emptyReason` taşıyor; `succeeded + rows=0` notsuz değil.
- [ ] `Prisma.sql` yorum/backtick ve bağlı sayı parametresi `::int` taramaları.

**Ajan 5 · Canlıya alma**: migration sırası (önce tablo, sonra enum), sessiz
koşum bayrağı açık deploy, § 10 ölçümleri, `DEVAM.md`.

**Ajan 6 · Tasarım denetimi**: taslakla yan yana, masaüstü + telefon.

## 12. Neyi ÖLÇMEDİM (Ajan 1)

- Hiçbir eşiği canlı veriyle ölçmedim; `ANOMALI` ve `SAGLIK` sayıları başlangıç.
- `insights_daily`de hesap seviyesi (`entity_level='account'`) satırının
  Google ve LinkedIn'de dolu olduğunu ölçmedim (`insights-sync` listesi
  `account`u içeriyor, LinkedIn notu "hesap seviyesi yok" diyor): yoksa hesap
  seviyesi kampanya toplamından hesaplanır.
- Teams'in hangi webhook ailesinin çalıştığını, Slack hata gövdelerini.
- Google'da "sınırlı onay" reklamının `review_status`ta hangi değerle
  geldiğini (`review-issues.ts` ne tanıyorsa o).
- İş süresini ve sorgu planını.
