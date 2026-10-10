# AdvCampaign Rehberi — Mimari (Ajan 1 teslimi)

> **Tarih:** 2026-10-10 · **Girdi:** [`REHBER-PLANI.md`](REHBER-PLANI.md) (kararlar K-1…K-4),
> [`arastirma/A4-panel-turu.md`](arastirma/A4-panel-turu.md), onaylı taslak
> [`rehber-taslak.html`](rehber-taslak.html) ("onaylıyorum, koda başla").
> **Sözleşme:** `packages/shared/src/reklam/rehber/` — Ajan 2 ve 3 tip TANIMLAMAZ, buradan okur.
> Sözleşmede değişiklik gerekiyorsa Ajan 1'e (ana oturum) döner; shared'ı ajanlar değiştirmez.

---

## 1. Ana fikir: rehber ORTAK GİRDİ, platform taslakları TÜRETİLİR

```
reklam_rehberi (YENİ)            ← kullanıcının yarım işi, her adımda kaydedilir
   alanlar JSONB (RehberAlanlari)
   │  prova / yayın anında türetilir (saf: rehberdenMeta / rehberdenGoogle)
   ├─► reklam_taslagi platform=meta   → taslak_surumu → derleMeta → prova → yayın motoru (MEVCUT, değişmez)
   └─► reklam_taslagi platform=google → taslak_surumu → derleGoogle (YENİ, API) → validateOnly prova → Google yayın işleyicisi (YENİ)
```

Gerekçe: Meta zinciri (değişmez sürüm, prova, 22 durumlu yayın makinesi, geri okuma,
yazma kapısı) yazıldı ve testli. Rehberin onu yeniden yazması değil BESLEMESİ gerekiyor.
Meta'nın kendi eksik listesi (`taslakEksikleri`) türetilmiş taslağa ayrıca uygulanır:
rehber bir şeyi atlarsa motor yine durdurur.

## 2. Veri modeli (Ajan 2, migration)

### 2.1 `reklam_rehberi` (yeni tablo)

| Kolon | Tip | Not |
|---|---|---|
| id | UUID PK | |
| org_id, client_id | UUID NOT NULL | kompozit FK `(client_id, org_id) → clients(id, org_id)`; `org_id` HEDEF MÜŞTERİDEN (`musteriOrgId`), `ctx.orgId`'den değil (CLAUDE.md "tüm şirketler") |
| durum | VARCHAR(12) | CHECK `REHBER_DURUMLARI` ('taslak','yayinda','arsivlendi'); spec iki listeyi karşılaştırır |
| surum | INTEGER NOT NULL DEFAULT 0 | iyimser kilit; her PUT `WHERE surum = $beklenen` ve +1, 0 satır → 409 |
| alanlar | JSONB NOT NULL DEFAULT '{}' | `rehberAlanlariSchema` ile doğrulanır (strict) |
| meta_taslak_id, google_taslak_id | UUID NULL | FK → reklam_taslagi ON DELETE SET NULL |
| olusturan_id | UUID NOT NULL | FK users RESTRICT |
| created_at, updated_at, arsivlendi_at | TIMESTAMPTZ | CHECK `(durum='arsivlendi') = (arsivlendi_at IS NOT NULL)` |

Üç durak (CLAUDE.md): `test/pglite-harness.ts` TRUNCATE listesi · `prisma/sql/02_rls.sql`
(tablo listesi + politikalar, `reklam_taslagi` ile aynı desen) · `workspace-tasima.ts#WORKSPACE_TABLOLARI`
kararı (**taşınır**: rehber workspace'in yarım işi, şirket değişince onunla gider).

### 2.2 Var olan tablolar
- `reklam_taslagi.platform` zaten var (`Platform` enum). Google çocuğu `platform='google'` ile açılır.
  `niyet_kodu` Google çocuğunda rehber amacının kodu (`SITE`…) — Meta niyetiyle karışmasın diye
  `olusturan_yuz = 'acemi'` yerine **yeni değer gerekmez**; ayırt edici `platform`.
- Google çocuğunun `taslak_surumu.alanlar`ı `GoogleDerlemeGirdisi` (bigint → dizge). Meta'nın strict
  şeması Google çocuğuna UYGULANMAZ: `taslak.service` şema seçimini `platform`a göre yapmalı.
- `yayin` tablosu Google için de kullanılır (durum makinesi `YAYIN_DURUMLARI` ortak). Google'da
  kullanılan alt küme: `on_kontrol → kuruluyor → geri_okuma → (fark_var | tekillik_kapisi) →
  aciliyor → iletildi`, `deneme` açılışında `geri_okuma → kapali_kuruldu`. `atif_standardi` NOT NULL:
  Google satırında `'platform'` (Google'ın kendi sayımı) — CHECK varsa genişlet, YOKSA dokunma; spec yaz.
- `DRAFT_PLATFORMS`, `ASSET_PLATFORMS`, `autoBoostPlatformSchema` GENİŞLETİLMEZ (CLAUDE.md).

## 3. Uçlar ve yetki

Tam liste `rehber/api.ts` başındaki yorumda. Hepsi `/reklam` altında, `ReklamController`'dan
AYRI bir `RehberController` (dosya: `apps/api/src/modules/reklam/rehber/`). Yetkiler mevcut
reklam uçlarıyla aynı: okuma `bulk.read`, yazma `bulk.write`, yayın `bulk.publish`.
Müşteri hesabı (dört ekran) bu uçlara erişmez.

| Uç | Davranış ve tuzak |
|---|---|
| `PUT /rehberler/:id` | `degisiklikler[]` birleştirilir, `kim`/`zaman` sunucu basar, `ISTEMCI_YAZAMAZ` kaynaklar ret, birleşik sonuç `rehberAlanlariSchema` ile doğrulanır. Cevap: `RehberKaydi` (eksikler + kararlar + içerik özeti taze). |
| `GET /rehber/hazirlik` | Mevcut `hazirlik.service` GENİŞLETİLİR (yeni servis yazılmaz). Ön koşullar üç hâlli; okuma düşerse `null` + log, asla `false`. Meta asgari: `GET /act_X/minimum_budgets` (okunamazsa `null`). Google Talep Yaratma asgari: TRY için **250 ₺** (canlıda 250 geçti, 50 reddedildi — CLAUDE.md), diğer para birimlerinde `null`. |
| `POST /:id/konum-esle` | Her konumun `etiket`i için `geoTargetConstants:suggest` (locale tr, country TR); YALNIZ tam ad eşleşmesi yazılır, belirsizse `google: null` kalır ve eksik listesi `G-KONUM` der. En yakını tahmin etmek reklamı başka şehre götürür. |
| `POST /:id/anahtar-kelime-oner` | `google.provider.kelimeFikirleri` (Keyword Planner erişimi ölçüldü). `pageSize` gönder; **yakın varyantlar aynı metriği taşır** — aynı (arama, teklif) ikilisini tekilleştir, toplamı ikiye katlama; `toplam` gerçek fikir sayısı; boşsa `bosNeden`. |
| `POST /:id/metin-oner` | Mevcut model sarmalayıcısı (Gemini, `sohbet/model.ts` ya da `ai-taslak` içindeki istemci — hangisi kalıyorsa). Girdi: amaç, site adresi, marka profili, yasal uyarı. Çıktı `METIN_SINIRLARI`na göre KIRPILMAZ, sınırı aşan satır atılır ve `notlar`a yazılır. Model fiyat/kampanya/indirim UYDURAMAZ (istemde yasak + çıktıda rakam taraması). Yanıt `ai_onerisi`; panel kabul edince `kullanici` olarak yazar. |
| `POST /:id/prova` | 1) `rehberEksikleri` engel varsa prova YOK (400, liste). 2) Türet → çocuk taslakları oluştur/güncelle + yeni sürüm. 3) Meta: mevcut prova işleyicisi. Google: `derleGoogle` + `validateOnly: true`. 4) Sonuç rehberin `icerikOzeti`ne bağlanır. |
| `POST /:id/yayinla` | Kapılar sırayla, hepsi SIFIR platform çağrısı: özet eşleşmesi (409) → eksik yok → prova taze (30 dk) ve aynı özet → yazma kapıları (`metaYazmaAcikMi`, `googleYazmaAcikMi`) → `uyumDenetle` geçti. Sonra platform başına bağımsız iş (kuyruk `reklam-yayin`). Biri düşerse öbürü geri alınmaz (K-08). |

## 4. Google derleyici ve yayın işleyicisi (Ajan 2, YENİ)

**Yer:** `apps/api/src/modules/reklam/google/`. **Üretici yasağı:** gövdeler `google-write.ts`
(`campaignBudgetBody`, `campaignBody`, `adGroupBody`, `keywordsBody`, `responsiveSearchAdBody`) ve
`google-demandgen.ts` (`demandGenAtomikIstek`) kurucularından; yeni kurucu yazmak yerine eksik alanı
O dosyaya ekle.

ARAMA kurgusu (SENTEZ S-43 + A4):
- Tek `googleAds:mutate`, geçici kimlikler, `partialFailure: false`, önce `validateOnly`.
- Kampanya `PAUSED`, `SEARCH`, `targetGoogleSearch: true`, `targetSearchNetwork: false`,
  `targetContentNetwork: false`, `targetPartnerSearchNetwork: false`, AB siyasi beyan,
  `geoTargetTypeSetting.positiveGeoTargetType: PRESENCE`, AI Max / metin özelleştirme / URL
  genişletme **açıkça kapalı**, dil `languageConstants/1037`, konumlar `CampaignCriterion`.
- Teklif `GoogleDerlemeGirdisi.teklif` (MAKS_TIKLAMA = `targetSpend`, MAKS_DONUSUM = `maximizeConversions`).
- Bütçe ayrı `CampaignBudget`, `explicitlyShared: false`, ad tekil (zaman damgası).
- Reklam grubu + öbek eşleme anahtar kelimeler + kampanya düzeyi negatifler (`TABAN_NEGATIFLER`) + RSA.
- `ulasma = 'telefon'` → CallAsset (`country_code` numaradan); `'form'` → LeadFormAsset (Dalga 2,
  `REHBER_ACILIS.FORM.google = 'kapali'`; yazılmadan açılmaz).
- `kararTablosu` sözünü tutar: Ajan 4 her satırı derlenmiş gövdeyle karşılaştıran test yazar.

TALEP_YARATMA_VIDEO: `demandGenAtomikIstek` (Akıllı Boost'ta canlıda kuruldu). Konum REKLAM GRUBU
seviyesinde, `upgradedTargeting: true` (CLAUDE.md Demand Gen dersleri).

Yayın işleyicisi: kur (PAUSED, atomik) → geri oku (GAQL: durum, bütçe, ağ bayrakları, geo hedef türü,
anahtar kelime sayısı) → beklenenle karşılaştır → `platformAcilabilirMi` ise `ENABLED` yap ve tekrar
oku, değilse `kapali_kuruldu`. Kayıt yazılamazsa satır `failed` DEĞİL `kuruluyor` kalır (mükerrer
kampanya). Platform çağrısı transaction İÇİNDE değil.

## 5. Uyum denetçisi bağlantısı

`yayin-baslat.ts` bugün gerçek Meta yayınını `UYUM` retiyle durduruyor. Rehberden gelen yayın
`uyumDenetle` sonucunu taşır (`yayin` satırına `uyum_surumu`, sonuç JSON); `gecti` ise UYUM reti
kalkar. Rehber dışı (eski akış) yollarda ret DEĞİŞMEZ. `deneme` açılışında yayın test kipi gibi
davranır ama arşivlemez: kurulur, geri okunur, `kapali_kuruldu` (duraklatılmış) kalır; kullanıcı
Reklam Yöneticisi'nden Başlat ile açar (onaylı yol, geri okumalı).

## 6. Sohbetin kaldırılması (K-2: yapay zekâ yalnız düğme arkasında)

- API: `modules/reklam/sohbet/` (controller, servis, döngü, araçlar, onay) modülden çıkarılır ve silinir.
  `packages/shared/src/reklam/sohbet/` başka yerden kullanılmıyorsa silinir — kullanılıyorsa Ajan 1'e.
  Tablolar (`adv_oturum`, `adv_mesaj`…) SİLİNMEZ (veri).
- Panel: `/reklam` rehber ekranı olur; `apps/web/src/reklam/sohbet/`, eski `/reklam/yeni` (Acemi)
  ve `/reklam/onizleme` kaldırılır, eski adresler `/reklam`a yönlenir.
- Nest modül kaydı açılışta patlar: sağlayıcı/`imports` listesi kaynak taramasıyla kilitlenir.

## 7. Ön yüz (Ajan 3)

- **Taslağın AYNISI**: `rehber-taslak.html`'in CSS'i CSS modülüne taşınır (Genel Bakış/Reklam
  Yöneticisi'nde yapılan gibi, `components/taslak/` deseni). "Yaklaşık" kurulum reddedildi
  (2026-10-09: *"taslağın aynısını istiyorum"*).
- Odaklı kip: menü rayı yok, sol üstte kapat. Sayfa başlığı ve menü etiketi **AdvCampaign**
  (`nav-sections.spec.ts`).
- Giriş: açık rehberler listesi ("Devam et") + "Yeni reklam". Rehber adreste (`?rehber=`).
- Her alan değişikliği `PUT` (debounce 600 ms), 409'da "Başka bir sekmede değişti, yenile".
- Eksikler, kararlar, açılış görünürlüğü SUNUCUDAN (`RehberKaydi`); panel kendi listesini yazmaz.
- `.catch(() => setX([]))` YASAK; anahtar kelime/metin önerisinde dört hâl ayrı (hiç istenmedi,
  isteniyor, boş + `bosNeden`, düştü + platformun mesajı).
- Animasyon: DOM'dan çıkarma yok, `prefers-reduced-motion`. Mobil: üstte ilerleme, altta sabit Devam.

## 8. Ölçüm listesi (Ajan 5, canlı tur — Profaj hesabı)

| # | Ne | Nasıl doğrulanır |
|---|---|---|
| Ö-1 | Google Arama atomik kurulum (validateOnly → PAUSED) | Google Ads'te gözle: ağlar kapalı, konum PRESENCE, AI Max kapalı, negatifler |
| Ö-2 | Meta SITE gerçek kurulum (deneme: duraklatılmış) | Ads Manager'da gözle: sayfa doğru, çok reklamverenli kapalı, hedef WEBSITE |
| Ö-3 | Meta `minimum_budgets` TRY değeri | panel turundaki 49,34 ₺ ile karşılaştır |
| Ö-4 | `geoTargetConstants:suggest` İzmir/İstanbul/Ankara tam eşleşme | dönen kaynak adları |
| Ö-5 | Meta FORM (anlık form, yeni şablon) | Lead Ads koşulu olan sayfada |
| Ö-6 | Google Talep Yaratma video (rehber yolundan) | Akıllı Boost'taki gibi PAUSED |
| Ö-7 | Konut kategorisinde Meta provası (`special_ad_categories ... got "2"` sorunu) | **ÖLÇÜLDÜ 2026-10-10** (`meta-kategori-prova`): satır içi `campaign_spec`te kategori HİÇBİR biçimde kabul edilmiyor. Kampanya provası kategoriyi taşıyor, satır içi kampanya kategorisiz ve geçen parça `KATEGORI_PROVA_NOTU`nu ekranda gösteriyor (`meta/prova.ts`). Meta'nın kendi konut denetimi kurulumda. |

**Canlı tur 1 sonuçları (2026-10-10, Ege Birlik Yapı, rehber "Siteme gelsinler", 500 ₺ %50/%50):**
- Ö-1 Google Arama: **GEÇTİ** — kuruldu (PAUSED), geri okuma temiz, Google Ads'te gözle doğrulandı (CLAUDE.md).
- Ö-2 Meta SITE: kuruldu (PAUSED, 4 görsel/1 set/4 reklam), sayfa ve çok reklamverenli birim gözle doğru; geri okuma
  dört normalleştirme eksiği yüzünden `fark_var`da durdu → `yanki.ts` N-07…N-10. Düzeltme sonrası YENİ bir deneme
  yayınıyla "temiz" görülmeden Meta satırı açılmaz.
- Rehberde kategori sorusuna "Hayır" denmişti; Garden Villas konut. Gerçek yayında "Konut" seçilmeli (Ö-7 o zaman ölçülür).

Her ölçüm geçince `REHBER_ACILIS` satırı güncellenir (commit gövdesinde kanıt).

## 9. Dalga planı

| Dalga | Amaç × platform | Durum |
|---|---|---|
| 1 | SITE (Meta + Google Arama), FORM (Meta), VIDEO (Google Talep Yaratma) | bu modül |
| 2 | VIDEO (Meta), TELEFON (iki platform), FORM (Google form uzantısı), WHATSAPP (Meta) | sözleşmede hazır, derleyici + ölçüm |
| 3 | ERISIM (iki platform), SATIS (iki platform, ölçüm kapısı) | sözleşmede hazır |

## 10. Ajan 1'in ÖLÇMEDİKLERİ / açık bıraktıkları
- `reklam_taslagi`'nın `platform='google'` ile hiç satır açılmadı; `taslak.service`'in Meta şemasını
  koşulsuz uygulayıp uygulamadığı Ajan 2'de kontrol edilecek.
- `yayin.atif_standardi` için CHECK olup olmadığı okunmadı (migration'ın 70. satırından sonrası).
- Meta `VIDEO_IZLENME` için `destination_type: ON_VIDEO` belgeden; `derleMeta` bu niyeti henüz derlemiyor
  (`DERLENEN_NIYETLER` = FORM, SITE) ve Dalga 2'ye kadar retle durur — doğru davranış.
- Google `LeadFormAsset` ve `CallAsset` kurucuları `google-write.ts`'te yok.
