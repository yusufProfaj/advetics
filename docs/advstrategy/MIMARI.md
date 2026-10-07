# AdvStrategy — Mimari (Ajan 1 çıktısı)

> **Tarih:** 2026-10-08 · **Plan:** [`AJAN-PLANI.md`](AJAN-PLANI.md) · **Sözleşme (kod):**
> `packages/shared/src/strateji/` · **Sözleşme testi:** `apps/api/src/modules/strateji/sozlesme.spec.ts`
>
> Ajan 2 ve Ajan 3 bu belge ile sözleşmeden okur, tip tanımlamaz. Sözleşme değişirse önce burası
> ve `packages/shared/src/strateji/` güncellenir, shared derlemesi ÇIKTISIYLA koşulur.

## 0. Çelişki tablosunun sözleşmeye işlenişi

| # | Karar (2026-10-08) | Sözleşmede nerede |
|---|---|---|
| Ç-1 | PDF kapağında Advetics logosu | `STRATEJI_UCLARI` → `/pdf`; Ajan 2 rapor PDF'inin logo yolunu (`apps/api/assets/marka/`) yeniden kullanır |
| Ç-2 | Plan platforma YAZMAZ, AdvCampaign'de oturum açar | `AktarimSonucu`, `AKTARIM_ATLAMA_NEDENLERI`, matris satırında `niyet` |
| Ç-3 | Arama bileşeni ölçüm kapısının arkasında | `KELIME_ERISIM_DURUMLARI` (`olculmedi` / `var` / `yok`), `GoogleProvider.kelimeFikirleri` |
| Ç-4 | Uydurma yüzde yok; yalnız kendi geçmiş + elle takvim | `SezonUyarisi.gecenYil` (`ozel_gun`da her zaman `null`), `SEZON_EN_AZ_GUN`, `DagilimSatiri.kaynak` |
| Ç-5 | Onay PDF + panel içi; dış bağlantı yok | `strategy.approve` (müşteri + ajans), `onaylayan.rol` |

## 1. Veri modeli

Hepsi `org_id` + `client_id` taşır (ilk dört tablo) ve kompozit yabancı anahtar
`(client_id, org_id) → clients(id, org_id)` kurar; AdvCampaign tablolarıyla aynı desen. Para
`BIGINT` micros, dönem `CHAR(7)` (`YYYY-MM`), tarihler `DATE`.

### `strateji_planlari`
| Kolon | Tip | Not |
|---|---|---|
| `id` | UUID PK | |
| `org_id`, `client_id` | UUID | Kompozit FK. **`org_id` HEDEF MÜŞTERİDEN okunur** ("tüm şirketler" modunda `ctx.orgId` ev şirketi kalıyor, CLAUDE.md) |
| `donem` | CHAR(7) | `monthSchema` |
| `durum` | VARCHAR(10) + CHECK | `PLAN_DURUMLARI`. Enum DEĞİL: yeni durum CHECK değiştirerek eklenir, ayrı migration ve enum takası istemez |
| `surum` | INTEGER | Her taslak yazımında ve `geri_cek`te artar |
| `toplam_butce_micros` | BIGINT | |
| `para_birimi` | CHAR(3) | Verilmezse workspace hesaplarından; karışıksa ret |
| `onaylayan_user_id`, `onay_rolu`, `onay_zamani`, `onaylanan_surum` | | `onay_rolu` CHECK (`musteri`,`ajans`). **`onaylanan_surum`**: aktarım bu sürümü ister, yoksa reddeder |
| `aktarim` | JSONB | `AktarimSonucu` |
| `not`, `created_by`, `created_at`, `updated_at` | | |

**Tekil kısmi indeks:** `(client_id, donem) WHERE durum IN ('taslak','onayda','onaylandi')`. Son
durumlar (`aktarildi`, `iptal`) o ayı yeni plana açar; çıkışı olmayan durum yok (testte kilitli).
Prisma kısmi indeksi bildiremez: indeks migration'da elle, şemada yorumla belirtilir.

### `strateji_dagilimlari`
`plan_id` FK (CASCADE), `platform` CHECK (`meta`,`google`), `katman` CHECK (`HUNI_KATMANLARI`),
`tutar_micros`, `kaynak` CHECK (`gecmis_veri`,`elle`), `gerekce` VARCHAR(500). Tekil
`(plan_id, platform, katman)`. Yazma tek seferde: DELETE + INSERT aynı transaction'da.

### `strateji_matrisi`
`plan_id` FK (CASCADE), `sira` INT, `platform`, `katman`, `niyet` VARCHAR(24) (`NIYET_KODLARI`
CHECK), `kitle_sablonu_id` UUID NULL → `audience_templates` **ON DELETE SET NULL** (silinen
şablon satırı düşürmez, ekran "silinmiş kitle" der), `kelime_grubu` VARCHAR(80), `varlik_idleri`
UUID[] (en çok 10; dizi, çünkü varlık silinince satır kalmalı ve aktarımda `kaynak_silinmis`
sayılmalı), `tutar_micros`, `not`.

### `strateji_kelimeleri`
`plan_id` FK (CASCADE), `kelime` VARCHAR(80), `aylik_arama` BIGINT NULL (**NULL = Google vermedi**),
`rekabet` VARCHAR(8) NULL, `teklif_alt_micros`/`teklif_ust_micros` BIGINT NULL, `grup` VARCHAR(80),
`secili` BOOL, `cekim_zamani` TIMESTAMPTZ, `kaynak_istek` JSONB (tohumlar + dil + konum: aynı
sayıyı yeniden üretmek için). Tekil `(plan_id, lower(kelime))`.

### `ozel_gunler` (müşteriye bağlı DEĞİL)
`id`, `sektor` VARCHAR(120) (`GENEL_SEKTOR = '*'` herkese), `ad`, `baslangic`/`bitis` DATE,
`kaynak` VARCHAR(200) NOT NULL. Seed migration'la ve elle; panelde yazma ekranı yok (Faz 3).

### Üç durak (CLAUDE.md §3)
| Tablo | `pglite-harness` TRUNCATE | `02_rls.sql` | `WORKSPACE_TABLOLARI` |
|---|---|---|---|
| `strateji_planlari` | ekle | `client_id` politikaları (SELECT/INSERT/UPDATE) | **taşınır** ("medya planı") |
| `strateji_dagilimlari` | ekle | aynı | taşınır |
| `strateji_matrisi` | ekle | aynı | taşınır |
| `strateji_kelimeleri` | ekle | aynı | taşınır |
| `ozel_gunler` | ekle | SELECT herkese; yazma politikası YOK (yalnız migration/admin) | yok (`client_id` yok) |

**Taşınma gerekçesi:** plan workspace'in kendi kararı ve kitle şablonları (`audience_templates`)
ile varlıklar zaten taşınıyor; planı geride bırakmak, yeni şirkette kitlesi olup planı olmayan
bir workspace demek. Matris başka workspace'in şablonunu GÖSTEREMEZ: servis şablon ve varlık
kimliklerini plan `client_id`'siyle doğrular (RLS'e ek olarak; "tüm şirketler" modunda RLS
kardeş şirketleri görüyor).

**RLS testi:** `SET ROLE` + `RETURNING` ile etkilenen satır sayılır (sıfır satırlık UPDATE
politikasız da başarılı döner). Ajan 4.

## 2. Akışlar

1. **Plan aç** → `taslak`, `surum = 1`. Para birimi çözülemezse 400 ve neden.
2. **Dağılım öner** → yazmaz, döndürür. Son 90 gün `insights_daily`, kampanya seviyesi değil
   **hesap seviyesi** satırları (`TOTALS_LEVEL`; seviyeler toplanırsa harcama katlanır).
   Öneri `elle` satırların üstüne yazılmaz; panel yalnız `gecmis_veri` satırlarını değiştirir.
3. **Kelime ara** → sunucu önce erişim durumuna bakar. Ölçülmediyse (`olculmedi`) çağrı YAPILMAZ.
   Varsa iş kuyruğa (`strateji_kelime`, 1 QPS) girer; işçi sonuçları `strateji_kelimeleri`ne
   yazar ve `sync_jobs`'a satır sayısıyla not düşer (`succeeded + rows = 0` hata türü).
4. **Onaya gönder** → `onayda`. Bu andan sonra düzenleme yok.
5. **Onayla** (`strategy.approve`) → `onaylandi`, `onaylanan_surum = surum`, rol kaydı.
6. **Aktar** → her matris satırı için AdvCampaign'de `adv_oturum` + ilk `kullanici` mesajı
   (niyet, kitle şablonu, varlıklar, bütçe). Satır başına: niyet `DERLENEN_NIYETLER`de değilse
   `niyet_desteklenmiyor`; Google satırı ve Google kapısı kapalıysa `platform_kapali`; şablon ya
   da varlık silinmişse `kaynak_silinmis`. Platform çağrısı YOK. Oturumlar kısa transaction'larda
   yazılır; yarıda düşerse plan `onaylandi` kalır ve `aktarim` alanı o ana kadar açılanları
   taşır, tekrar denemede açılmış oturumlar ikinci kez açılmaz (satır kimliğiyle eşleşme).
7. **PDF** → rapor PDF'inin kuralları: gömülü DejaVu, `tablo()` çizici, Advetics logosu, panel
   referans görünüm. Sorgu dizesi tek üreticiden (rapordaki "üç tüketici" hatası).

## 3. Kuyruk ve kota

- İş türü `strateji_kelime`; kimlik `strateji_kelime__<planId>__<aramaId>` (ayırıcı `__`).
  `aramaId` her istekte yeni bir UUID ve plan satırında (`kelime_arama_id`) duruyor; işçi plandaki
  kimlik kendisininki değilse HİÇBİR ŞEY yazmıyor. İlk tarif tohum özetiydi; Ajan 4 bayat bir
  işin yeni aramanın sonucunu ezebildiğini gösterdi (2026-10-08).
- Yazım tek gerçek transaction'da: `FOR UPDATE` → durum + arama kimliği kontrolü → DELETE →
  INSERT → plan UPDATE. `onaya_gonder` aynı satırı kilitliyor, yani onaydaki plana sonuç yazılamaz.
- Google kelime çağrıları kendi kota katmanında; yapı ve metrik işlerinin bütçesini yiyemez
  ("bağımlı iş, bağlı olduğu işin kotasını yiyebilir" dersi).
- Ön koşul kontrolü çağrıdan ÖNCE: Google hesabı atanmamışsa sıfır çağrıyla ret.

## 4. Ölçüm listesi (Ajan 5)

| # | Ne | Nasıl | Sonuç neyi açar |
|---|---|---|---|
| Ö-1 | Keyword Planner erişim seviyesi | `pnpm --filter @advetics/api google-check -- --kelime "…"` (salt okunur) | **ÖLÇÜLDÜ 2026-10-08: ERİŞİM VAR** (bkz. §4.1). Bileşen 2 açık |
| Ö-2 | Harcaması olmayan hesapta hacim kesin mi kaba mı | Ö-1 çıktısında aynı tohumu iki hesapta karşılaştır | Ekranda "yaklaşık" etiketi gerekip gerekmediği |
| Ö-3 | `GenerateKeywordForecastMetrics` alanları (v24'te değişti) | Ö-1 olumluysa ayrı sonda | "Gelecek ay ~5.000 tıklama" tahmini (Faz 2) |
| Ö-4 | Meta `reachestimate` ile ülke bazlı kitle büyüklüğü | Ayrı betik (Faz 2) | Matriste kitle büyüklüğü sütunu |

Sonuçlar `CLAUDE.md` "Canlıda öğrenilen platform gerçekleri"ne tarihli satır olarak.

### 4.1 Ö-1 sonucu ve Ajan 2'ye etkisi (2026-10-08)

Polimek - Türkiye hesabı, v25, tohum "filtre kahve, french press", Türkçe + Türkiye:
`generateKeywordIdeas` başarılı, **2.660 fikir tek yanıtta**. Ajan 2 için üç zorunlu kural:

1. **Kesme + toplam.** `pageSize` gönderilmiyor; servis sonucu hacme göre sıralayıp ilk N'i
   (`strateji_kelimeleri`ne) yazar, `toplam`ı `KelimeAramaSonucu`nda döndürür.
2. **Varyant tekilleştirme.** "türk kahve makinesi" / "turk kahve makinesi" aynı 74.000 hacmi ve
   aynı teklif aralığını taşıyor: Google yakın varyantları tek metrikte birleştiriyor. Aynı
   (hacim, rekabet, teklif alt, teklif üst) parmak izini taşıyan ve Türkçe karakterleri
   sadeleştirilince aynı olan kelimeler TEK satır (ilk görülen ad, diğerleri `varyantlar`).
   Grup ya da plan toplamı hesaplanırken ikisi toplanırsa hacim ikiye katlanır.
3. **"Yaklaşık" etiketi.** Hacimler yuvarlanmış kova değerleri (49.500, 33.100, 90.500); ekran
   "ayda yaklaşık 49.500" der. Teklif alanları boş gelebiliyor (`null` korunuyor).

Ayrıca: fikirler tohumun dışına geniş yayılıyor (marka terimleri: "philips kahve makinesi"
165.000). Kelimeler varsayılan olarak SEÇİLİ DEĞİL; kullanıcı işaretler. Ö-2 (harcamasız hesapta
hacmin kabalığı) hâlâ açık.

## 5. Devir notu (Ajan 1 → Ajan 2, 3, 4)

**Yapıldı:** sözleşme (`plan`, `dagilim`, `matris`, `kelime`, `takvim`, `uclar`), üç yeni izin
(`strategy.read|write|approve`) ve rol matrisi satırları, `GoogleProvider.kelimeFikirleri` (salt
okunur) ve `google-check --kelime` ölçüm kipi, 17 sözleşme testi (üç kritik kural mutasyonla
doğrulandı: iptal geçişi, sıfır bütçeli hücre, müşterinin yazma yetkisi).

**Ölçülmedi:** Ö-1…Ö-4 hiçbiri. `kelimeFikirleri` yanıt alanları belgeden yazıldı; Google'ın
gerçek yanıtı görülmedi.

**Açık kalan:**
- Migration, servis, controller, kuyruk işleyicisi: Ajan 2.
- `/strateji` sayfası ve menü satırı (`STRATEJI_SAYFA_IZNI`): Ajan 3.
- Uç listesi ile controller'ın kaynak taramasıyla eşlenmesi, RLS `SET ROLE` testleri: Ajan 4.
- Yeni izinler kullanıcıların `permission_overrides` kayıtlarına dokunmuyor; mevcut roller yeni
  izinleri rol tanımından alıyor. Elle kısıtlanmış bir kullanıcı varsa yeni izinler ona da
  açılır: Ajan 4 üretimde override taşıyan kullanıcıları listelemeli.
