# Paket D: Kreatif zekâsı (Ajan 1 · Mimar)

**Tarih:** 2026-10-12 · **Girdi:** `docs/rakip-analizi/ORPHEX-BOSLUK.md` §1 B-7
ve §2 "Paket D" · **Sözleşme:** `packages/shared/src/kreatif-zeka/` (derleme
çıktısıyla temiz, `apps/api/src/modules/kreatif-zeka/sozlesme.spec.ts` 43 test,
altı kritik kural mutasyonla doğrulandı) · **Taslak:** [`taslak.html`](taslak.html)
· **Durum:** Ajan 1 bitti. Ajan 2-3 sıra kuralına bağlı (Paket A canlıya
alınmadan başlamaz, CLAUDE.md "modüller SIRAYLA").

"Hangi görsel işe yarıyor, bir sonrakini nasıl yaptırayım?" Dört parça:

1. **Etiket**: Gemini görü ile kreatif başına sabit, kapalı bir şema
   (insan, ürün, görseldeki yazı, renk, görselde çağrı, fiyat, logo, görsel
   türü) + platformdan kesin okunan iki alan (biçim, en-boy). Bir kez
   üretilir, İÇERİĞE bağlı saklanır.
2. **Etiket × performans**: "insan olan görsellerde tıklama oranı %12 ile
   %31 arası daha yüksek (23 ve 41 kreatif)". Örneklem ve aralık her zaman
   yazılı; yetersizse "veri yetersiz".
3. **Puan ve kovalar**: 0-100 puan = aynı platform ve amaçtaki benzerler
   içindeki sıra. Yeni kreatifler (ilk 14 gün) üç kovada: iyi gidiyor /
   dikkat / veri yetersiz (eşik ₺1.000 harcama).
4. **Brief**: yalnız anlamlı farklardan; metin Gemini'den, sayı sorgudan.
   Tek tıkla AdvCampaign'e.

> Bu belgede Paket A'nın (`docs/sinyal/MIMARI.md`, dal
> `worktree-agent-a7e00d40b2e7a28e2`, 5ca8fd1) düzeni kullanıldı. Bu dal
> Paket A'yı İÇERMİYOR (a4a7bfa üstünde); birleşmede tek çakışma
> `packages/shared/src/index.ts` sonundaki iki `export *` satırı, ikisi de
> tutulur. Ad çakışması yok (iki modülün dışa aktardıkları karşılaştırıldı).

---

## 0. Çelişki tablosu

Kullanıcı karar yetkisini oturum yöneticisine devretti. "Öneri" varsayılan
kabul; yönetici aksini demedikçe ajanlar öneriyle başlar. Saf arayüz
kararları CLAUDE.md §5 gereği sorulmadı, "Mimar (§5)" diye işaretli.

| # | Brief / Orphex diyor | Depo gerçeği | Öneri | Karar |
|---|---|---|---|---|
| Ç-1 | Workspace'e özel etiket şeması | Tipik workspace'te harcaması olan kreatif onlarla ölçülüyor (ÖLÇÜLECEK, § 9.3). Workspace'e özel etiket birkaç kreatifte kalır, neredeyse her karşılaştırma "yetersiz" olur; şema değişince eski etiketler karşılaştırılamaz | **v1 sabit, kapalı şema** (`GORU_ALANLARI` 8 alan + `KESIN_ALANLAR` 2), her alan en çok 3 değer (testte kilitli). **v2**: workspace'e en çok 3 ek alan, yalnız ≥ 100 etiketli kreatifi olan workspace'te açılır; sürüm `ETIKET_SEMA_SURUMU` ile | Öneri — yönetici onayına |
| Ç-2 | Boşluk analizi: "etiket `creatives` satırına bağlı" | `creatives` platform aynası, yedi upsert onu yazıyor (CLAUDE.md "UPSERT, denormalize kolonu da güncellemek zorunda"); Meta aynı içerikli kreatifi yeniden kullanıyor (N-12); aynı görsel onlarca reklamda | Etiket **içerik özetine** (görsel baytlarının SHA-256'sı) bağlı, `kreatif_etiketleri`nde; kreatif → içerik bağı ayrı tabloda (`kreatif_icerikleri`). `creatives`e kolon eklenmez. İndirmeden tanımak için **kaynak anahtarı** (Meta `image_hash` + hesap, video kimliği, Google varlık kimliği): aynı anahtarlı ikinci kreatif ne indirilir ne etiketlenir | Öneri — yönetici onayına |
| Ç-3 | "Meta + Google (Demand Gen/PMax görselleri)" | Google sağlayıcısı yalnız **Duyarlı Görüntülü Reklam** görsellerini aynalıyor (`gorselKaynakAdlari` → `responsiveDisplayAd.marketingImages`). Demand Gen reklam türlerinin görselleri OKUNMUYOR; PMax'te `ad_group_ad` yok, öğe grupları (`asset_group_asset`) hiç aynalanmıyor | **v1**: Meta + Google Görüntülü + **Demand Gen** (Ajan 2 `gorselKaynakAdlari`yı Demand Gen türleriyle genişletir, canlıda ölçülür). **PMax v2** (öğe grubu aynası ayrı iş, okuma kotası). Ekranda "Performance Max kreatifleri henüz incelenmiyor" açıkça. Arama reklamı metin: `metin_reklami`, etiketlenmez, sayılır | Öneri — yönetici onayına |
| Ç-4 | Google görselleri | Görsel adresi sorgusu yazıldı ama CANLIDA DOĞRULANMADI (CLAUDE.md Google notu) | Ajan 5'in ilk ölçümü; beklenmedik ana makine beyaz listede reddedilir ve adı yazılır | Mimar (§5) |
| Ç-5 | Video kreatifler | Gemini video okuyabiliyor ama kreatif başına maliyet görselin onlarca katı (ÖLÇÜLMEDİ) | **v1 yalnız kapak karesi** (`thumbnail_url`, boyut açıkça istenerek), `kismiEtiket: 'video_kapagi'` ekranda yazılı. Kapak, akışta ilk görülen kare: "durdurma gücü" sorusunun cevabı onda. Tam video v2, ölçümden sonra | Öneri — yönetici onayına |
| Ç-6 | Karusel | Kreatif başına birden çok görsel | İlk kart (`kismiEtiket: 'ilk_kart'`), açıkça | Mimar (§5) |
| Ç-7 | Ekran nerede | Reklam Yöneticisi bir ayna tablosu (izle, durdur); İyileştir "ne yapmalıyım" ekranı ve yorgunluk önerisi orada | **İyileştir › Kreatifler** sekmesi (`?sekme=kreatifler`, Öneriler ve Sinyaller'den sonra). Gerekçe: puan, kova ve brief bir EYLEM üretiyor (yeni görsel yaptır, AdvCampaign'e geç); yorgunlukla aynı ekranda olması çakışmayı tek yerde çözüyor (Ç-10). Reklam Yöneticisi'nde reklam satırına küçük puan rozeti **v1.1** (aynı uçtan okur, yeni hesap yok) | Mimar (§5) |
| Ç-8 | Kova eşiği ₺1.000 | Para hesap ve rapor para biriminde; workspace USD olabilir | Eşik TL; TL dışında o günün kuruyla (`fx_rates`) çevrilir. **Kur yoksa** "veri yetersiz · kur bilinmiyor" (`harcamaEsigiMicros` → `null`); 1.000 USD saymak eşiği 40 kat büyütürdü | Öneri — yönetici onayına |
| Ç-9 | Yetki | İyileştir menüsü `rule.read`; müşteri (`client_viewer`) `sync.trigger` taşıyor | Okuma `rule.read`; elle etiketleme ve brief `rule.write` (Gemini parası harcıyor, müşteri tetikleyemez; ilk sürümde `sync.trigger` yazmıştım, sözleşme testi yakaladı); AdvCampaign'e aktarım `bulk.write` (AdvCampaign sayfasının kapısı) | Mimar (§5) |
| Ç-10 | Yorgunlukla çakışma | İyileştir `kreatif_yorgunlugu` önerisi (Meta, reklam, iki hafta karşılaştırması) | İki ayrı olay: yorgunluk = ZAMANLA düşüş (sahibi İyileştir Öneriler), puan = BENZERLERE göre seviye. Kova yalnız YENİ kreatiflere (ilk 14 gün). Satırın yorgunluk önerisi varsa Kreatifler kendi "dikkat" cümlesini SÖYLEMEZ, önerinin AYNI adıyla ona bağlanır (`kovaCumlesi`, testte kilitli). Sinyaller reklam seviyesinde anomali aramıyor (Paket A Ç-4), üçüncü dil yok | Mimar (§5) |
| Ç-11 | Maliyet bekçisi | Gemini anahtarı tek; AI Asistan ve AdvCampaign aynı kotayı kullanıyor | Workspace günde 40, ayda 400 etiket; ürün geneli günde 1.500; brief workspace başına günde 5 (`ETIKET_SINIRI`). Sayılar başlangıç, § 9.1 ölçümünden sonra güncellenir | Öneri — yönetici onayına |
| Ç-12 | Orphex "lift tahmini" ("bu özellik değişirse beklenen yükseliş") | Elimizdeki veri gözlemsel: insanlı görseller başka kampanyalarda, başka bütçelerle koşmuş olabilir | Dil "beklenen yükseliş" değil, "benzer kreatiflerde ... arası daha yüksek" + örneklem + aralık; aynı küme (platform + amaç) içinde. Ekranda tek satırlık uyarı: "Bu bir ilişki, garanti değil; yeni görselle sınayın". Nedensel tahmin (eşleştirme, regresyon) v2 ve ancak ölçümle | Öneri — yönetici onayına |
| Ç-13 | LinkedIn | Kreatif görsel adresi okunmuyor, yazma yok | Kapsam dışı (`platform_disi`), açıkça | Mimar (§5) |
| Ç-14 | Brief nereye gider | `adv_oturum.hazir_istem` deseni (AdvStrategy, İyileştir asistanı) | "Bu brief ile reklam kur" → AdvCampaign oturumu, brief metni hazır istem. Ayrıca "Kopyala" (tasarımcıya) | Mimar (§5) |
| Ç-15 | Ne zaman etiketlenir | Etiketleme para harcıyor; harcaması olmayan kreatifi etiketlemek boşa | Yalnız son 90 günde harcaması olan ve kümeye giren kreatifler, **harcamaya göre azalan** sırayla (sınır doluysa en önemlileri bitmiş olur). `insights_daily` işinin SONUNA zincir + günlük emniyet süpürmesi (Paket A deseni) | Mimar (§5) |
| Ç-16 | Gemini görü | `reklam-metni.service.ts` görseli `inlineData` ile zaten gönderiyor; `GeminiIstemcisi.govde` `mediaResolution` taşımıyor | Ajan 2 `GeminiIstegi`ne `mediaResolution` ekler, açıkça `MEDIUM` (`GORU_AYARI`); varsayılana bırakmak model değişince maliyeti sessizce değiştirir | Mimar (§5) |

---

## 1. Okunan dosyalar

| Konu | Yer | Paket D'deki rolü |
|---|---|---|
| Kreatif aynası | `creatives` (`asset_urls` JSONB, `raw`, `creative_type`), `ads.creative_id` | Girdi; DEĞİŞTİRİLMEZ |
| Adres süzgeci | `packages/shared/src/kreatif-adres.ts` (`gorselAdresleri`) | Kaynak adını eler; aynı süzgeç |
| Adres tazeleme | `reports/kreatif-adresi.service.ts` (kota önce, önbellek 10 dk, süre bütçesi, yarılama) | Çekirdeği ortak fonksiyona çıkarılır, İKİNCİ tazeleyici yazılmaz |
| Görsel indirme | `reports/kreatif-gorseli.ts` (`adresGuvenliMi` sonek `endsWith`, IP ret, `redirect: 'manual'`, gövdede boyut) | Kabul edilen biçim parametreye çıkar (WebP) |
| Google görselleri | `google.provider.ts#gorselKaynakAdlari`, `gorselVarligiAdresleri` | Demand Gen genişletmesi (Ç-3) |
| Meta thumbnail boyutu | `meta.provider.ts` (~64 px varsayılan, boyut açıkça isteniyor) | Video kapağı |
| Gemini | `yapay-zeka/gemini.ts` (`metinIste`, `jsonSemasi`, ret/kesildi/boş ayrı), `GEMINI_MODEL` | Görü + brief |
| Görsel girdi örneği | `draft-tree/reklam-metni.service.ts` (`inlineData`) | Desen |
| Sıralama dersi | `draft-tree/kreatif-performansi.ts` (`YETERLI_GOSTERIM`, dönüşümsüz hesap) | Eşik ve dönüşüm düşüşü |
| Yorgunluk | `shared/iyilestir` `YORGUNLUK`, `ONERI_TURU_ETIKETI` | Ç-10 |
| Günlük metrik | `insights_daily` (`entity_level='ad'`, `spend_micros_reporting`) | Pencere toplamı |
| Kur | `fx_rates` | Ç-8 |
| Kota | `queue/quota-guard.service.ts` (`report_creative` tavan %50) | Yeni katman |

## 2. Veri modeli (Ajan 2)

Dört tablo; hepsi `client_id` + `org_id`, `(client_id, org_id)` kompozit FK
`clients`a, `org_id` HEDEF müşteriden (`musteriOrgId`). Durumlar **varchar +
CHECK** (liste shared'da kapalı; CHECK ile shared listesi Ajan 4 testinde
iki yönlü karşılaştırılır, `fatura-zip.spec.ts` deseni).

### `kreatif_icerikleri` (kreatif başına, bizim kaydımız)

| Kolon | Tip | Not |
|---|---|---|
| creative_id | uuid PK | FK `creatives` ON DELETE CASCADE |
| org_id, client_id | uuid | |
| ad_account_id | uuid | FK `ad_accounts` |
| platform | `Platform` | |
| kaynak_anahtari | varchar(120) NULL | `KAYNAK_ANAHTARI_DESENI`; indirmeden tanıma |
| icerik_ozeti | char(64) NULL | indirilince dolar |
| kismi | varchar NULL | CHECK `video_kapagi`/`ilk_kart` |
| en_boy | varchar NULL | `KESIN_ALANLAR.en_boy` |
| durum | varchar | CHECK `ICERIK_DURUMLARI`, varsayılan `bekliyor` |
| neden | varchar NULL | CHECK `ETIKETLENEMEZ_NEDENLERI ∪ GECICI_NEDENLER` |
| deneme | smallint default 0 | `icerikGecisi` artırır |
| son_hata | text NULL | platformun/Gemini'nin cümlesi aynen |
| sema_surumu | smallint | |
| son_deneme, created_at, updated_at | timestamptz | |

İndeks: `(client_id, durum)`; `(client_id, kaynak_anahtari)`;
`(client_id, icerik_ozeti)`.

### `kreatif_etiketleri` (içerik başına)

| Kolon | Tip | Not |
|---|---|---|
| id | uuid PK | |
| org_id, client_id | uuid | |
| icerik_ozeti | char(64) | **UNIQUE (client_id, icerik_ozeti, sema_surumu)** |
| sema_surumu | smallint | |
| etiketler | jsonb | `GoruEtiketleri` (yalnız `etiketCoz`dan geçmiş) |
| model | varchar(60) | `GEMINI_MODEL` o anki |
| girdi_token, cikti_token | int | maliyet ölçümü |
| sure_ms | int | |
| created_at | timestamptz | |

Tekillik **workspace** kapsamında, bilerek: ürün geneli bir içerik tablosu
iki müşterinin görselini aynı satırda buluştururdu (RLS'siz paylaşılan
veri). Bedeli, aynı görseli kullanan iki workspace'te iki çağrı; küçük.

### `kreatif_etiket_sayaci` (maliyet bekçisi)

| Kolon | Tip | Not |
|---|---|---|
| org_id, client_id | uuid | |
| gun | date | İstanbul günü; **PK (client_id, gun)** |
| etiket_istek, brief_istek | int default 0 | AYIRMA sayısı (çağrıdan önce) |
| basarili, hata | int default 0 | |
| girdi_token, cikti_token | bigint default 0 | |

Ayırma ATOMİK: `INSERT ... ON CONFLICT (client_id, gun) DO UPDATE SET
etiket_istek = etiket_istek + 1 WHERE kreatif_etiket_sayaci.etiket_istek <
$sinir RETURNING etiket_istek`. Satır dönmezse sınır dolu. Aylık ve küresel
toplam aynı işlemde `SUM` ile okunur (worker BYPASSRLS). `bekciKarari`
cümleyi üretir; yarışı UPDATE önler (concurrency 4). Bağlı sayı parametresi
`${sinir}::int` (CLAUDE.md "bağlı sayı parametresi tipsiz gitmez").

### `kreatif_briefleri`

| Kolon | Tip | Not |
|---|---|---|
| id, org_id, client_id | uuid | |
| kume_anahtari | varchar(40) | |
| girdi_ozeti | char(64) | **UNIQUE (client_id, kume_anahtari, girdi_ozeti)**: aynı bulgu kümesi ikinci kez Gemini'ye gitmez |
| bulgular | jsonb | `BriefBulgusu[]` (sayılar burada) |
| cevap | jsonb | `BriefCevabi` (`briefMetniDenetle`den geçmiş) |
| model, girdi_token, cikti_token | | |
| olusturan_user_id | uuid NULL | `users`a LEFT JOIN (RLS'li tabloya INNER JOIN yasağı) |
| created_at | timestamptz | |

### Üç durak ve taşıma

| Tablo | TRUNCATE (`pglite-harness`) | `02_rls.sql` | `WORKSPACE_TABLOLARI` | Hesap taşıma (`hesap-verisi-tasima.ts`) |
|---|---|---|---|---|
| `kreatif_icerikleri` | ekle | SELECT/INSERT/UPDATE workspace | TAŞINIR | `HESABIN_KENDI_VERISI`: TAŞINIR (kreatifin kendisi taşınıyor) |
| `kreatif_etiketleri` | ekle | SELECT/INSERT workspace; UPDATE yalnız taşıma | TAŞINIR | **Kopyalanır**: taşınan içeriklerin özetleri hedefte yoksa satır kopyalanır (`ON CONFLICT DO NOTHING`), kaynakta kalır. Taşımak, kaynakta aynı görseli kullanan diğer hesabı etiketsiz bırakırdı; kopyalamamak hedefte yeniden ödeme |
| `kreatif_etiket_sayaci` | ekle | SELECT/INSERT/UPDATE workspace | TAŞINIR | hesaba bağlı değil, dokunulmaz (harcanan para kaynakta harcandı) |
| `kreatif_briefleri` | ekle | SELECT/INSERT workspace | TAŞINIR | hesaba bağlı değil, dokunulmaz (birinin kararı) |

Enum `SyncJobType`a `creative_tags`: **AYRI migration**. Kota katmanı
`creative_tag` (tavan %50, `report_creative` ile aynı: kozmetik değil ama
ertelenebilir iş; yapı taramasının nefesini kesemez). Migration öncesi
`git pull`.

## 3. Uçlar

Tek kaynak `ozet.ts#KREATIF_ZEKA_UCLARI`. Davranış:

- `GET /kreatif-zeka?clientId&kume&gorunum&kova&sayfa`: veritabanından,
  platform çağrısı YOK. Sorgu `client_id = ANY($1)` dizisiyle; her sorgu iki
  biçimde ölçülür (CLAUDE.md "her sorguya bak"). Yanıt `KreatifZekaYaniti`:
  kümeler, seçili küme (yoksa en çok harcayan), satırlar (`toplam` ile),
  kova sayıları, anlamlı + belirsiz + yetersiz farklar (üçü de; ekran
  yetersizi katlanmış satırda gösterir), etiketleme özeti, `emptyReason`,
  son brief ya da `briefBosNedeni`. Liste yanıtında görsel ADRESİ YOK.
- `GET .../kreatifler/:creativeId/gorsel`: görseli KULLANIM ANINDA tazeler
  (ortak tazeleme çekirdeği, kota önce, önbellek), `kreatif-gorseli`
  korumalarıyla indirir, `goruBicimi` ile biçimi gövdeden okur ve akıtır.
  Anonim değil (`rule.read`), yine de 10 dk önbellek ve süre bütçesi
  (bir ekran 50 kart açar). Hata durumunda 200 + boş görsel DEĞİL; 502 ve
  nedeni: panel "görsel alınamadı: sunucu 403" yazar.
- `POST /kreatif-zeka/etiketle {clientId}`: workspace hesapları için
  `creative_tags` kuyruğa; yanıt `enqueued` + bekçi durumu ("bugünkü sınır
  doldu, yarın 09:00'da devam") — düğme sınır doluyken de basılabilir,
  sonucu söyler.
- `POST /kreatif-zeka/brief {clientId, kume}`: § 8.
- `POST /kreatif-zeka/brief/:id/advcampaign`: `adv_oturum` açar,
  `hazir_istem = briefIstemi(...)`, oturum kimliğini döner.

## 4. İş zinciri: `creative_tags` (hesap başına)

1. **Tetik**: `insights_daily` başarıyla bitince işin SONUNDA (öncelik
   bariyer değil). Emniyet: `sweep:creative_tags` günde bir (10:15
   İstanbul, sinyal özetinden sonra), bekleyen içeriği olan hesapları
   kuyruğa alır. `sweep-dates.spec.ts` yeni türü görmeli (tarih taşımıyor,
   `datesForJob` dalı açıkça "tarihsiz").
2. **Seçim (sıfır maliyet)**: son `PENCERE_GUN` günde harcaması olan,
   `karsilastirmaKumesi` null olmayan kreatifler; `kreatif_icerikleri`
   satırı yoksa `bekliyor` olarak açılır. Arama/LinkedIn/PMax kalıcı
   nedenle (`metin_reklami`, `platform_disi`, `gorsel_yok`) hemen kapanır,
   Gemini'ye hiç gitmez ve SAYILIR. Bekleyenler harcamaya göre azalan.
3. **Kaynak anahtarı eşleşmesi (sıfır maliyet)**: aynı workspace'te aynı
   kaynak anahtarlı ve etiketli bir içerik varsa özet kopyalanır,
   `etiketlendi` (sayım: `baglandi`).
4. **Bekçi (sıfır maliyet)**: `bekciKarari`; ret → kalanlar `ertelendi`,
   iş biter (tekrar denenmez).
5. **Platform kotası** (`creative_tag` katmanı), sonra **adres tazeleme**
   (Meta: ortak çekirdek, `fetchCreativeImageUrls`, hesap başına toplu;
   Google: `asset_urls` kalıcı). Transaction DIŞINDA.
6. **İndirme**: § 5. Biçim/boyut kalıcı ret; ağ hatası geçici.
7. **Özet eşleşmesi**: `(client_id, icerik_ozeti, sema_surumu)` etiketi
   varsa bağla (`baglandi`), Gemini YOK.
8. **Ayırma** (atomik UPDATE), sonra **Gemini**: `metinIste` +
   `goruJsonSemasi()` + görsel `inlineData`, `GORU_AYARI`. Sonuç:
   `tamam` → `etiketCoz` (şema dışıysa bir kez tekrar, sonra `sema_disi`);
   `ret` → `gemini_ret`; `kesildi/bos` → geçici; `YapayZekaHatasi` 429/5xx
   ya da ağ → `gemini_kota`/`gemini_ulasilamadi` geçici. Sayaçta
   `basarili/hata`, token ve süre yazılır.
9. **Sonuç**: `etiketIsSonucu` (`sync_jobs.rows` + `note`). Hepsi geçici
   hatayla düştüyse `tekrar_dene` → BullMQ yeniden dener; sessiz
   `succeeded + 0` yok (testte kilitli).
10. **Şema sürümü artarsa**: tek seferlik migration `sema_yukseldi` geçişini
    uygular; maliyet sınırları aynen geçerli (yeniden etiketleme günlere
    yayılır, ekranda "etiketler yenileniyor: 120 / 340").

## 5. Görsel indirme güvenliği

- Adres yalnız `gorselAdresleri` süzgecinden (kaynak adı elenir).
- `adresGuvenliMi`: yalnız https, sonek beyaz listesi `endsWith`, IP
  literali ret. Liste rapordakiyle AYNI sabit (`IZINLI_SONEKLER`); ikinci
  liste yazılmaz.
- `redirect: 'manual'`, zaman aşımı `GORU_AYARI.indirmeZamanAsimiMs`,
  boyut GÖVDE OKUNURKEN `GORU_AYARI.maxBayt` (content-length yalan
  söyleyebilir).
- Biçim gövdeden (`goruBicimi`): JPEG, PNG, WebP. `gorselIndir`e
  `kabul: GorselTuru[]` parametresi eklenir, varsayılanı bugünkü
  (`jpg`, `png`) kalır: rapor yolu değişmez.
- Görsel baytları SAKLANMAZ (yalnız özet). Saklamak paylaşımlı VPS'te disk
  ve müşteri görselinin ikinci kopyası demekti; ekran görseli `.../gorsel`
  ucundan anlık alır.

## 6. İstatistik yöntemi (`istatistik.ts`)

- **Birim kreatif.** Gösterim bağımsız örnek değil: aynı kreatifin
  gösterimleri birbirinin kopyası. Binom aralığı milyon gösterimde her farkı
  kesin ilan ederdi.
- **Harcama ağırlıklı ortalama**, verim ölçeğinde (yüksek daha iyi):
  tıklama oranı; dönüşüm / ₺ (gösterilirken dönüşüm başı maliyet);
  gösterim / ₺ (gösterilirken 1.000 gösterim maliyeti). Dönüşüm veriminin
  harcama ağırlıklı ortalaması **tam olarak** Σdönüşüm / Σharcama (testte):
  sıfır dönüşümlü kreatif bölme hatasız gruba girer.
- **Etkin örneklem** `(Σw)² / Σw²`; ekranda "41 kreatif (etkin 12)".
- **Güven aralığı**: ağırlıklı varyans (etkin örneklemle yansızlaştırılmış),
  iki grubun standart hatası kareler toplamı, %95 (z = 1,96). Göreli aralık
  = fark aralığı / karşı grubun ortalaması (karşı grubun belirsizliği yok
  sayılıyor; sade ve bilinçli, alt sınırlar bunu dengeliyor).
- **Üç karar**: `yetersiz` (gruplardan birinde < 5 kreatif ya da etkin < 3),
  `belirsiz` (aralık sıfırı kapsıyor), `anlamli`.
- **Küme**: aynı platform + aynı amaç grubu (`karsilastirmaKumesi`).
  Tanınmayan amaç kümesiz ve sayılır.
- **Ana metrik**: bilinirlikte gösterim verimi; potansiyel/satış/uygulamada
  dönüşüm verimi, kümede < 30 dönüşüm varsa tıklama oranına iner ve
  ekranda söyler (`metrikDusus`); diğerlerinde tıklama oranı.
- **Değer karşılaştırması**: iki değerli alanda değer ↔ diğeri; üç
  değerlide her değer ↔ geri kalan ikisinin birleşimi. Çoklu karşılaştırma
  düzeltmesi YOK (8 alan × ~2 karşılaştırma ≈ 18 test, %95'te biri şans
  eseri "anlamlı" çıkabilir). Bilinçli: ekran yalnız en fazla 5 anlamlı
  farkı gösterir, her birinin örneklemi yazılı, brief yalnız onları kullanır.
  Ölçüm turunda (§ 9.4) yanlış pozitif oranı görülürse güven 1,96 → 2,5.
- **Pencere** 90 gün; yalnız harcama eşiğini geçmiş kreatifler gruba girer.

## 7. Puan, kova, yorgunluk (`puan.ts`)

- **Puan** = benzerler içindeki sıra, eşitlikte orta sıra. Benzer: aynı
  küme, eşiği geçmiş, kendisi HARİÇ, en az 5. Kart: "23 benzerinden 17
  tanesinden iyi". Maliyette ucuz olan yüksek puan alır (verim ölçeği,
  testte).
- **Kova** yalnız yeni kreatiflere (ilk gösterim ≤ 14 gün): eşik yoksa ya da
  puan yoksa `veri_yetersiz` + neden; puan ≥ 50 `iyi_gidiyor`, altı
  `dikkat`.
- **Yorgunluk**: satırın açık `kreatif_yorgunlugu` önerisi varsa cümle
  "Kreatif yorgunluğu önerisi var, İyileştir › Öneriler'de" (adı
  `ONERI_TURU_ETIKETI`ten). Yorgunluğu bu modül HESAPLAMAZ; İyileştir'in
  üreticisini okur.

## 8. Brief (`brief.ts`)

1. Bulgular: seçili kümenin `anlamli` farkları, mutlak göreli farka göre,
   en çok 5. Yoksa brief yok, neden (`anlamli_fark_yok`, `kume_kucuk`,
   `etiket_yok`); Gemini'ye istek gitmez.
2. `girdi_ozeti` = bulguların (alan, değer, yön) SHA-256'sı. Aynı özet
   varsa önbellekten döner, sayaçtan düşmez.
3. Bekçi: `brief_istek < briefGunluk`.
4. Gemini'ye giden: küme adı, bulguların KODU ve YÖNÜ, Türkçe değer adları
   (`ETIKET_ETIKETLERI`). SAYI GİTMEZ. İstem "rakam yazma; oranları
   kelimeyle söyle (kare, dikey)".
5. Cevap `briefCevabiSchema` + `briefMetniDenetle` (rakam → ret; talimat
   alanları bulgularla birebir değilse ret); bir kez tekrar, sonra
   "brief üretilemedi: <sebep>".
6. Ekran ve AdvCampaign metni: sayı taşıyan satırlar `farkCumlesi`
   şablonundan, yön/talimat/kaçın Gemini'den (`briefIstemi`, ≤ 4.000).

## 9. Ölçüm listesi (Ajan 5, canlıda; Ajan 2 betiği yazar)

**9.1 Kreatif başına Gemini görü maliyeti ve süresi.** Betik
`apps/api/scripts/olcum-kreatif-goru.ts` (yazılmadı, tarifi):

- Girdi: `--client <uuid> --adet 20 --tekrar 2 [--cozunurluk LOW|MEDIUM|HIGH]`.
  Yalnız okur; veritabanına YAZMAZ, sayaç tutmaz.
- Seçim: § 4 adım 2 sorgusu (harcamaya göre ilk 20), yarısı Meta yarısı
  Google (varsa); en az 3 video kapağı.
- Her kreatif: ortak tazeleme çekirdeği → indirme (§ 5) → `GeminiIstemcisi.uret`
  aynı istem ve `goruJsonSemasi()` ile. Ölçülen: indirme süresi + bayt,
  Gemini süresi (ms), `girdiToken`, `ciktiToken`, `onbellekToken`, `sebep`,
  `etiketCoz` sonucu.
- `--tekrar 2`: aynı görsel iki kez; alan alan **tutarlılık oranı**
  (iki cevabın aynı olduğu alan yüzdesi). Tutarlılığı < %85 olan alan v1
  şemasından çıkar ya da değer sayısı azalır.
- Çözünürlük karşılaştırması: aynı 20 görsel LOW ve MEDIUM; metin
  yoğunluğu ve fiyat alanlarında fark var mı.
- Çıktı: CSV (`scratchpad`, depoya değil) + özet: ortanca/p95 süre, ortalama
  token, kreatif başına maliyet = token × o günkü Gemini fiyat sayfası
  (fiyat koda gömülmez, betik argüman alır `--fiyat-girdi --fiyat-cikti`),
  ret/boş sayısı. Sonuç `durum.ts#ETIKET_SINIRI` yorumuna YAZILIR.

**9.2 Görsel adresleri.** Google görsel adresi sorgusu canlıda (Ç-4) ve
Demand Gen genişletmesi; Meta video kapağında istenen boyutun gelip
gelmediği; WebP oranı.

**9.3 Tipik workspace'te kreatif sayısı.** Salt okuma SQL (Ajan 5, `advetics`
kullanıcısıyla):

```sql
SELECT c.client_id,
       count(DISTINCT c.id) AS kreatif,
       count(DISTINCT c.id) FILTER (WHERE x.harcama >= 1000) AS esigi_gecen,
       count(DISTINCT coalesce(c.raw->>'image_hash', c.raw->>'video_id', c.id::text)) AS yaklasik_icerik
FROM creatives c
JOIN ads a ON a.creative_id = c.id
JOIN LATERAL (
  SELECT sum(i.spend_micros_reporting) / 1e6 AS harcama
  FROM insights_daily i
  WHERE i.entity_level = 'ad' AND i.entity_id = a.id
    AND i.date >= current_date - 90
) x ON true
WHERE x.harcama > 0
GROUP BY c.client_id ORDER BY kreatif DESC;
```

Ortanca ve p90 workspace'in kreatif sayısı ile `ETIKET_SINIRI` karşılaştırılır
(ilk etiketleme kaç günde biter). `image_hash`/`video_id` yolu `raw`ın
gerçek biçimine göre Ajan 5 düzeltir (ÖLÇÜLMEDİ).

**9.4 İstatistiğin canlıda davranışı.** En büyük üç workspace'te kaç farkın
`yetersiz/belirsiz/anlamli` çıktığı; `anlamli` olanların bir ay sonra hâlâ
`anlamli` olup olmadığı (kararlılık). Hiçbir workspace'te anlamlı fark
çıkmıyorsa `enAzKreatif` ve pencere yeniden düşünülür.

**9.5 Kova sınırı.** Yeni kreatiflerin ilk 14 günde `dikkat` olup sonra
ortancanın üstüne çıkma oranı (öğrenme dönemi). Yüksekse `KOVA_SINIRI`
düşer.

**9.6 Sorgu süresi.** `GET /kreatif-zeka` en büyük workspace'te, iki biçimde
(`ANY` dizisi / alt sorgu), `EXPLAIN ANALYZE`.

## 10. Ekran (Ajan 3), taslak `taslak.html`

- **İyileştir › Kreatifler** (`?sekme=kreatifler`). Üstte küme seçici
  (çip: "Meta · Satış · 64 kreatif"), metrik notu ("dönüşüm az, tıklama
  oranına göre"). Görünüm çipleri: **Yeni kreatifler** (varsayılan, kova
  sekmeleri İyi gidiyor / Dikkat / Veri yetersiz, sayılarla) ve **Tümü**
  (puana göre). Kart: görsel (`.../gorsel`), ad, puan halkası ya da
  "puan yok" nedeni, etiket çipleri, tek satır kova cümlesi, kısmi etiket
  notu.
- **"Ne işe yarıyor"** kartı: anlamlı farklar (`farkCumlesi`, örneklem ve
  aralık çubuğu), altında katlanmış "Belirgin fark yok / veri yetersiz"
  listesi (sessiz kesme yok) ve ilişki uyarısı (Ç-12).
- **Brief** kartı: "Brief hazırla" (birincil), sonuç: sayılı bulgular +
  yön + talimatlar + kaçın, "Bu brief ile reklam kur" (AdvCampaign),
  "Kopyala". Boş hâl nedenli.
- **Etiketleme durumu** satırı: "312 kreatiften 288'i etiketli · 14 bekliyor
  (bugünkü sınır doldu, yarın devam) · 10 incelenemiyor" + açılır neden
  dökümü + "Şimdi etiketle" (`rule.write`).
- Dört hâl ayrı: yükleniyor, hata (sunucu cümlesi), boş + neden, dolu.
  Karar mantığı saf fonksiyonda (`kreatifKutuHali`).

## 11. Ajan görevleri

**Ajan 2 · Arka Plan** (`apps/api/src/modules/kreatif-zeka/` + migration'lar)
- [ ] Migration 1: dört tablo, CHECK'ler, indeksler, kompozit FK. Migration 2
  (ayrı): `SyncJobType.creative_tags`.
- [ ] Üç durak + `HESABIN_KENDI_VERISI` (`kreatif_icerikleri`) + etiket
  kopyalama (§ 2).
- [ ] `KreatifAdresiService` çekirdeğini `ReportData`'dan bağımsız bir
  metoda çıkar (rapor davranışı değişmeden, `kreatif-adresi.spec` yeşil);
  `gorselIndir`e `kabul`; `creative_tag` kota katmanı.
- [ ] `gorselKaynakAdlari` Demand Gen türleri (Ç-3) + kaynak anahtarı
  üretici (Meta `raw`dan `image_hash`/`video_id`; `act_` öneki için
  `actPath` değil HESAP kimliği).
- [ ] `GeminiIstegi.mediaResolution` (Ç-16).
- [ ] `creative_tags` işleyicisi § 4 sırasıyla; zincir (`insights_daily`
  sonu) + `sweep:creative_tags`; `etiketIsSonucu` → `sync_jobs`.
- [ ] Uçlar `KREATIF_ZEKA_UCLARI` ile birebir; brief § 8.
- [ ] Ölçüm betiği § 9.1. Nest kayıtları + kaynak taramasıyla kilit.

**Ajan 3 · Ön Yüz**
- [ ] İyileştir Kreatifler sekmesi (§ 10), sekme rozetinde `dikkat` sayısı.
- [ ] Kart karar mantığı saf fonksiyonlarda; bağlantılar üreticilerden
  (`lib/iyilestir.ts`, `lib/reklam-yoneticisi.ts`).
- [ ] Brief → AdvCampaign yönlendirmesi; `nav-sections`/`panel-tasarim` yeşil.

**Ajan 4 · Test & Güvenlik (kapı)**
- [ ] RLS `SET ROLE` + `RETURNING`: dört tablo, başka workspace okunmuyor,
  taşıma satır SAYIYOR; etiket kopyalama hedefte satır üretiyor.
- [ ] CHECK = shared listeleri (iki yönlü).
- [ ] Sayaç ayırma yarışı: dört paralel ayırma sınırı aşamıyor (gerçek
  veritabanı).
- [ ] İndirme: iç IP'ye çözülen ad ve sonek dışı ana makine reddi (iddia
  SEBEBE çapalı), 3xx izlenmiyor, gövde boyutu.
- [ ] Mutasyonlar: zincir çağrısını sil; bekçiyi Gemini'den SONRA çağır →
  "sınır doluyken Gemini çağrısı yok" testi düşmeli; özet eşleşmesini sil →
  "aynı görsel ikinci kez Gemini'ye gitmez" testi düşmeli; `tekrar_dene`yi
  yok say; `briefMetniDenetle`yi atla.
- [ ] Sessiz hata taraması: `.catch(() => [])` yok; boş liste nedenli;
  `succeeded + 0` notsuz değil; `$queryRaw` sayı parametreleri `::int`.

**Ajan 5 · Canlıya alma**: migration sırası (tablo, sonra enum), ilk gün
`kureselGunluk` düşük (ör. 200) açılıp § 9.1 sonrası yükseltilir, § 9
ölçümleri, `DEVAM.md`.

**Ajan 6 · Tasarım denetimi**: taslakla yan yana, masaüstü + 375 px.

## 12. Neyi ÖLÇMEDİM (Ajan 1)

- Gemini görü maliyetini, süresini, etiket tutarlılığını (§ 9.1); bütün
  `ETIKET_SINIRI` sayıları tahmin.
- Tipik workspace'in kreatif sayısını (§ 9.3) ve `raw` içinde
  `image_hash`/`video_id` yolunu.
- Google görsel adresinin ve Demand Gen görsellerinin canlıda geldiğini.
- İstatistiğin canlı veride kaç anlamlı fark ürettiğini; eşikler (5
  kreatif, etkin 3, ortanca 50, 30 dönüşüm) başlangıç.
- `mediaResolution` alanının kullandığımız model ve uçta kabul edildiğini.
- Meta video `thumbnail_url`ün istenen boyutta geldiğini.
