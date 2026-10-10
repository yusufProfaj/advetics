# Ajan 4 · Test & Güvenlik — devir notu (AdvCampaign Rehberi, 2026-10-10)

> İncelenen: `bab2e2d` (Ajan 1 sözleşme) + `3eea3b4` (Ajan 2 arka plan, Ajan 3 panel).
> Ürün koduna DOKUNULMADI; yalnız bir test dosyası eklendi. Commit EDİLMEDİ.

## 3. TUR — CANLI TUR NORMALLEŞTİRMELERİ (N-07…N-10, çalışma ağacı)

İncelenen: `packages/shared/src/reklam/meta/yanki.ts` (commit'siz dört normalleştirme),
`rehber/kararlar.ts` Meta KONUM metni. Test: `apps/api/src/modules/reklam/derleyici/ajan4-canli-tur.spec.ts`
(21 test: 15 KORUMA + 5 BULGU + ön koşul). Ürün koduna dokunulmadı.

### KAPI KARARI: **AÇIK.** Dört gevşetmenin hiçbiri para açan kapıyı delmiyor.

Bütçe, ülke/bölge genişlemesi, sayfa değişikliği, `true` ek anahtar, erkene/ertesi güne kayma,
kapattığımız özelliğin OPT_IN dönmesi hâlâ `fark` + `kabulEdilemez`; alanın dönmemesi hâlâ
`dogrulanamadi`. Aşağıdaki beş bulgu para açmıyor; 6 ve 9 ikinci canlı turdan ÖNCE kapatılmalı.

| Soru | Sonuç |
|---|---|
| (1) N-10 başka yolu harf duyarsız yapıyor mu | Hayır: önek dışında (ör. `DAILY_BUDGET`) bulunamıyor → `donmedi` → doğrulanamadı. Küçük harfli OPT_IN `fark`. Tanımsız özellik döngüsü anahtarı zaten küçültüyordu, etkileşim yok; ama bkz. BULGU-6/7 |
| (2) N-08 başka genişlemeyi maskeliyor mu | Hayır: `location_types` ayıklandıktan SONRA `kapsar` koşuyor; `countries` ya da ek bölge `fark`. `travel_in`, bilinmeyen tür, dizi olmayan değer `fark` |
| (3) N-07 sayfa/true | Sayfa değişir, düşer, ek anahtar `true`/`0`/`"false"` → `fark`. Eski `esit`ten tek gevşeme false/null ek anahtar; bkz. BULGU-8 |
| (4) N-09 saat dilimi | `+0300`, `+03:00`, `Z` çözülüyor; ertesi gün, erkene kayma (başka ofsetle de) `fark`; `end_time` etkilenmiyor. Bkz. BULGU-9/10 |
| (5) `kabulEdilemez` / `donmedi` | Bozulmamış: dört yolda da alan silinince doğrulanamadı (M7 altı testi düşürüyor) |
| (6) Rehber dışı yollar | `geriOkumaKarsilastir` yalnız `reklam/yayin-motoru.ts` (AdvCampaign yayını) çağırıyor; Akıllı Boost ve eski Meta motoru bu dosyayı kullanmıyor. `kararlar.ts` metni yalnız Meta hücresi; Google hücresi ve `derle-google.spec` aynı |

### Bulgular

- **BULGU-6 · ORTA** — `yanki.ts:406` tanımsız özellik döngüsü DEĞERİ harf duyarlı okuyor
  (`enroll_status !== 'OPT_IN'`). `music: { enroll_status: 'opt_in' }` dönerse üretken özellik açık
  olduğu hâlde yayın **temiz**. Önceden de vardı; N-10 Meta'nın bu yanıtta harf değiştirdiğini
  gösterdi. Öneri: üretken/tanımsız sınıfta harf duyarsız "OPT_OUT değilse durdur".
- **BULGU-7 · DÜŞÜK** — Aynı özellik iki biçimle dönerse (`IMAGE_ANIMATION: OPT_OUT` +
  `image_animation: OPT_IN`) ilk döngü tam eşleşeni alıyor, ikinci döngü `kapatildi` sınıfını
  atlıyor → **temiz**. Gözlenmedi. Öneri: ikinci döngüde `kapatildi` OPT_IN de durdursun.
- **BULGU-8 · DÜŞÜK** — `yanki.ts:288` ek anahtarda `false` VE `null` genel kabul. Canlıda yalnız
  `smart_pse_enabled: false` görüldü; `null` hesap varsayılanı olabilir, yeni bir `xxx_only: false`
  daraltmayı kapatabilir. Öneri: yalnız `smart_pse_enabled` ve yalnız `false`.
- **BULGU-9 · ORTA** — `yanki.ts:298-304` kabul "aynı gün ve dönen ≥ gönderilen"; gönderilenin
  GEÇMİŞTE, dönenin KURULUM ANI olduğuna bakmıyor. İleri tarihli başlangıç (`10-15 00:00`) aynı
  günün akşamına (`21:00`) kayarsa **temiz** ve ekrana yanlış sebep ("geçmişte kalmıştı") yazılıyor.
  Para artmaz (gecikir) ama söz yanlış. Öneri: karşılaştırıcıya `simdi` geçir; gönderilen < simdi
  ve dönen ≤ simdi + birkaç dakika şart.
- **BULGU-10 · DÜŞÜK** — Aynı gün METİN olarak, her dizgenin kendi ofsetinde (`slice(0,10)`).
  `2026-10-10T22:00-0300` (= hesabın 11'i 04:00) kabul. Meta bugün hesabın ofsetini döndürüyor.
  Öneri: günü gönderilenin ofsetinde hesapla ya da ofset farklıysa kabul etme.

BULGU testleri bugünkü (kusurlu) davranışı kilitliyor; düzelten ajan onları TERS ÇEVİRİR.

### Mutasyon sonuçları (her biri shared yeniden derlenip, test sayısı okunarak; dosya kendi yedeğinden geri yüklendi)

| Mutasyon | Sonuç |
|---|---|
| M1 önek kontrolü kaldır | **Eşdeğer** (kısa yolda `anahtar` boş kalıyor); yerine M1b |
| M1b her yolda harf duyarsız `al` | ✓ 2 test düşüyor |
| M2 konum türü beyaz listesi kalkar | ✓ 2 |
| M3 `location_types` varsa kabul (maskeleme) | ✓ 2 (ülke + bölge KORUMA) — mevcut spec'te karşılığı YOKTU |
| M4 ek anahtar değeri ne olursa kabul | ✓ 2 |
| M5 aynı gün şartı kalkar | ✓ 2 |
| M6 `d >= g` kalkar | İlk koşuda **BOŞ** (rehber 00:00 gönderiyor, aynı gün erken metinde imkânsız) → başka ofsetli erken an testi eklendi, ✓ 1 |
| M7 `donmedi` hep bilgi | ✓ 6 |
| M8 promoted_object'te sayfaya bakılmaz | ✓ 2 |
| M9 `end_time` da başlangıç kuralıyla | ✓ 1 — mevcut spec'te karşılığı YOKTU |
| F6/F8/F10 bulgu düzeltme simülasyonu | Her biri yalnız kendi BULGU testini düşürüyor (6, 8, 10) |

Koşular: `npx tsc -p packages/shared/tsconfig.json` çıktısız, exit 0 · `vitest run src/modules/reklam`
24 dosya / 383 test yeşil · `pnpm --filter @advetics/api typecheck` exit 0.

## 2. TUR — YENİDEN DENETİM (0c5e299 + çalışma ağacındaki "ajans yöneticisi" kuralı)

### KAPI KARARI: **KAPALI — tek bulgu (BULGU-5), küçük.**

İlk turun dört bulgusu **düzeldi ve doğrulandı**. Yeni bir para/uyum açığı yok. Kapıyı
yalnız BULGU-5 tutuyor: deneme görünürlüğü kuralı sunucuda düzeldi ama panel hâlâ ESKİ
kuralı okuyor. **Açılma koşulu:** `hazirlik.service.ts` sunucuyla aynı kuralı (tek yardımcı)
kullanır, `ajan4-yeniden-denetim.spec.ts` içindeki BULGU-5a/5b ters çevrilip yeşil olur ve
aşağıdaki terminoloji kırmızısı giderilir. Bu üç koşul sağlanınca kapı açıktır; ayrıca bir
denetim turu gerekmez.

### Düzeltmelerin denetimi

| Bulgu | Düzeltme | Durum | Kanıt (mutasyon) |
|---|---|---|---|
| BULGU-2 | `metaYayinBaslat` çocuğu rehberden yeniden türetip `taslakKanonikIcerik` özetiyle karşılaştırıyor; eski 5 uç `rehbereBagliysaReddet` çağırıyor | **Kapandı** | Özet kontrolü kaldırılınca BULGU-2 düşüyor (N1); `oneriyi-onayla` kontrolü silinince kaynak taraması düşüyor (N6). Uç kontrolü bir kontrol-sonra-eylem; asıl koruma yayındaki özet karşılaştırması ve o yarışı da kapatıyor |
| BULGU-1 | `rehberdenMeta/Google(a, acik, …)` | **Kapandı** | Saf testte doğru; ama servisin ona HAM seçimi verdiği mutasyon (N2) ilk turda **BOŞ** çıktı → yeni servis testi (VIDEO, ham seçim iki platform, Google çocuk sürümü 500 ₺) yazıldı, N2 artık düşüyor. Meta tarafı (N3) **bugün eşdeğer mutasyon**: `REHBER_ACILIS`'ta Meta'sı görünür Google'ı görünmez bir amaç yok; tablo değişirse test eklenmeli |
| BULGU-4 | `googleKarsiliginiKoru` istemcinin `google` alanını atıyor, aynı (`tur`,`key`) için sunucu eşlemesini koruyor; `konumlariEsle` `yaz(…, true)` | **Kapandı** | İstemci ataması düşüyor (ilk tur testi); **koruma** (N4) ilk turda BOŞ çıktı → yeni test (eşlenmiş İzmir'e Ankara eklenince İzmir korunur, Ankara'nın istemci karşılığı atılır), N4 artık düşüyor. `konumlariEsle` istemci yolundan yazsa (N5) 7 test düşüyor. Not: panel `custom` konum üretmiyor; üretirse anahtarları tekil olmalı, yoksa `tur|key` eşlemesi iki noktayı karıştırır |
| BULGU-3 | `kararTablosu(…, instagramVar)` | **Kapandı** | Servis hep `true` geçse (N9) BULGU-3 düşüyor |
| Ajans kuralı (çalışma ağacı) | `ctx.platformAdmin \|\| EXISTS(manager_memberships … role='admin')`, `managerAccountId` yoksa false | **Sunucuda doğru** | `managerAccountId` yokken true (N7b) 3 test düşürüyor; `role = 'admin'` şartı kaldırılınca (N7a) ilk koşuda **BOŞ** çıktı → yeni test (üst hesabın `ad_manager` üyesi deneme görmez), N7a artık düşüyor. `managerAccountId` sunucuda çözülüyor ve üyelik listesine karşı doğrulanıyor (`tenant-context.service.ts`), istemci taşıyamaz |

**Başka üst hesabın yöneticisi (ör. EMRE AJANS) kendi bağlamında deneme görür — kabul
edilebilir.** Deneme kurulumu duraklatılmış kalır, harcama yok; kendi müşterisinin hesabına
kurar (aitlik denetimi bağlamdaki workspace). Tek gereken: `REHBER_ACILIS` yorumundaki
"YALNIZ ajans yöneticisi görür" cümlesi "üst hesap yöneticisi (ya da platform sahibi) görür"
olarak güncellenmeli; yoksa sonraki okuyan kuralı yanlış anlar.

### BULGU-5 · ORTA — Deneme görünürlüğü iki kaynakta, iki ayrı kuralla

- **Yer:** `apps/api/src/modules/reklam/hazirlik.service.ts:208-209, 266` hâlâ
  `isOrgAdmin && (ma.ajans_org_id IS NULL OR ma.ajans_org_id = o.id)`. Panel görünürlüğü
  bundan okuyor (`rehber-ekrani.tsx:87` `acikPlatformlar(a, hazirlik.ajansYoneticisi)`,
  `adim-amac-nerede.tsx:23,70,113`). Sunucunun eksik/prova/yayın kararı ise
  `rehber.service.ts` `baglam()`'daki YENİ kuraldan.
- **Senaryo 5a:** ajans çalışanı kardeş/müşteri şirketine geçiyor → sunucu denemeyi açık
  sayıyor, panel amaç kartını GİZLİYOR. Ana oturumun düzeltmek istediği belirti ("ajans
  çalışanı müşteri şirketine geçince deneme amaçları kayboluyordu") **panelde düzelmedi**.
- **Senaryo 5b:** üst hesabı olmayan şirketin admini → panel kartı ve "Deneme açılışı"
  düğmesini gösteriyor, sunucu "En az bir platform açık olmalı" (PLT-YOK) diyor: yanlış sebep.
- Para yok (sunucu kapalı yöne düşüyor); ama CLAUDE.md "AYNI SÜZGECİ İKİ YERDE YAZMA"nın
  tam örneği ve düzeltmenin hedefini boşa çıkarıyor.
- **Kanıt:** `ajan4-yeniden-denetim.spec.ts` › BULGU-5a, BULGU-5b (bugünkü davranışı kilitler).
  Hazırlık kuralını sunucununkine eşitleyen mutasyon (N13) ikisini de düşürüyor.
- **Öneri:** kuralı tek yardımcıya çıkar (`ajansYoneticisiMi(tx, ctx)`), `hazirlik.service`
  ve `rehber.service` ikisi de onu çağırsın; 5a/5b'yi ters çevir.

### Ayrıca düzeltilmesi gereken (kapı koşulu)

- **Terminoloji kırmızısı (çalışma ağacında, commit'lenmemiş):** `rehber.service.spec.ts`
  sonundaki yeni test adı *"…admin üyesi müşteri şirketine geçmişken…"* panelin
  `src/terminoloji.spec.ts`'ini düşürüyor (panel 1394/1395). Adı "workspace/şirket" diliyle
  değiştir ya da terminoloji listesinde sınıflandır. Benim dosyamdaki iki benzer satırı düzelttim.

### Düşük gözlemlerin değerlendirmesi (kapıyı kapatmıyor)

| Gözlem | Önem | Gerekçe ve ne zaman |
|---|---|---|
| UPDATE'lerde etkilenen satır sayılmıyor (`prova_ozeti`, `cocukBagla`, Google çocuk bağı) | Düşük | Üçü de güvenli yöne düşüyor (kapı yeniden prova ister / yetim taslak). Sessiz ama para ya da yanlış yayın üretmiyor. Bir sonraki dokunuşta `RETURNING` sayılmalı |
| `formSablonuId` aitlik denetiminde yok | Düşük **bugün**, FORM açılmadan **ZORUNLU** | FORM kapalı ve derleyici `formId: null` geçiyor. FORM'u açan commit aynı anda aitliği eklemeli; Dalga 2 ön koşulu olarak yazılmalı |
| `GoogleDerlemeGirdisi.kategoriler` yorumu "Google'da derlenir" diyor, derleyici okumuyor | Kozmetik | Kısıtlı kategoride yaş daraltması uyum denetçisinde duruyor; yalnız yorum yanıltıcı |
| Meta "Yalnız bu bölgede bulunanlar" ayrı alanla yazılmıyor | Ölçüm işi | Meta `location_types`'ı kaldırdı, tek seçenek kalıyor; Ö-2'de Ads Manager'da gözle doğrulanmalı. Kod bulgusu değil |
| `baglam()` içinde yerel `acik` `ajans_mi && isOrgAdmin`, dönen `ajansYoneticisi` `platformAdmin \|\| ajans_mi` | Düşük (YENİ) | Yerel `acik` yalnız `paraBirimi` seçimine giriyor; iki para birimi farklıysa zaten PARA-BIRIMI engeli var. Yine de tek ifade olmalı (BULGU-5 düzeltmesiyle birlikte) |

### 2. turun mutasyon özeti

N1 ✓, N2 ✓ (yeni testle), N3 eşdeğer (bugün ulaşılamaz), N4 ✓ (yeni testle), N5 ✓, N6 ✓,
N7a ✓ (yeni testle), N7b ✓, N9 ✓, N13 ✓ (BULGU-5 düzeltme simülasyonu). Her mutasyon
sonrası test sayısı okundu.

**Süreç notu:** mutasyon betiğim ilk koşularda geri almayı `git checkout --` ile yapıyordu ve
bu, ana oturumun **commit'lenmemiş** `rehber.service.ts` değişikliğini bir kez geri aldı. Fark
edildi ve değişiklik birebir geri kuruldu (dosyanın git özeti `1c4dd08`, ana oturumun bıraktığı
hâlle aynı); etkilenen mutasyonlar yeniden koşuldu. Betik artık dosyanın kendi yedeğinden
geri yüklüyor.

### Eklenen/değişen test dosyaları (2. tur)

- YENİ `apps/api/src/modules/reklam/rehber/ajan4-yeniden-denetim.spec.ts` — 6 test: BULGU-1
  kablosu, BULGU-4 koruması, ajans bilinmiyorsa kapalı, `ad_manager` üyesi görmez, BULGU-5a, BULGU-5b.
- `ajan4-denetim.spec.ts` — BULGU-1 testindeki bayat yorum düzeltildi (davranış değişmedi).

### 2. tur tam doğrulama (çalışma ağacı: 0c5e299 + ana oturumun commit'lenmemiş değişikliği + benim testlerim)

| Adım | Sonuç |
|---|---|
| shared build | exit 0 |
| API typecheck | temiz |
| Web typecheck | temiz |
| Panel testleri | **1394 / 1395** — tek kırmızı yukarıdaki terminoloji (ana oturumun test adı) |
| API testleri (tek başına) | **4425 / 4425** (320 dosya) |
| API build / web build | exit 0 / exit 0 |

### 2. turda ÖLÇEMEDİKLERİM

- Panelde BULGU-5'in görsel etkisi (yalnız kaynak ve hazırlık ucunun dönüşü üzerinden kanıtlandı).
- Gerçek Postgres'te `manager_memberships` RLS'inin bağlamdaki üst hesabı gösterdiği (PGlite'ta
  RLS kapalı koşuyor; politika gözle okundu, `SET ROLE` testiyle sınanmadı).
- İlk turun "NEYİ ÖLÇEMEDİM" listesi aynen geçerli (hiçbir platforma gidilmedi).

---

# 1. TUR (2026-10-10, ilk denetim — kayıt için korunuyor)

## 1. tur KAPI KARARI: **KAPALI** (dört bulgu — hepsi 2. turda kapandı)

Dört bulgu var; ikisi doğrudan "kapılar" ve "bütçe" maddelerine dokunuyor. Bugün bütün
açılışlar `deneme` (kurulum duraklatılmış kalıyor) olduğu için **hiçbir bulgu bugün para
harcatmıyor**; ama ikisi bir satır `acik` yapıldığı gün para ve uyum sözü üzerinden çalışır.
Düzeltmeler küçük (BULGU-2'nin önerilen düzeltmesi mutasyon olarak denendi: normal akışı
bozmuyor, saldırı senaryosunu durduruyor).

Düzeltmeyi bulguyu üreten ajan yapar: BULGU-1/3 Ajan 1 (shared), BULGU-2/4 Ajan 2 (API).
Her bulgunun testi `ajan4-denetim.spec.ts` içinde BUGÜNKÜ (kusurlu) davranışı kilitliyor;
düzeltme o testi kırmızıya çevirir ve düzelten ajan iddiayı TERS ÇEVİRİR (bilerek `it.fails`
kullanılmadı: kurulum düşse de "geçti" sayardı).

---

## Bulgular (önem sırasıyla)

### BULGU-2 · YÜKSEK — Rehber yayını, Meta çocuk taslağının rehberden türediğini doğrulamıyor (uyum kapısı delinebiliyor)

- **Yer:** `apps/api/src/modules/reklam/rehber/rehber.service.ts:695-705` (`metaYayinBaslat`) —
  çocuğun O ANKİ aktif sürümünü (`t.aktif_surum_no`, `s.icerik_ozeti`) yayınlıyor; o sürümün
  `rehberdenMeta(rehber)` ile aynı içerik olduğu hiçbir yerde sorulmuyor. Kapılar
  (`yayin-kapilari.ts`) rehber özetini ve çocuğun provasını AYRI AYRI doğruluyor, ikisinin
  BAĞINI değil.
- **Senaryo:** rehber provası geçer → aynı kullanıcı HÂLÂ AÇIK eski uçlarla
  (`reklam.controller.ts:107` `PUT /reklam/taslaklar/:id/surum`, `:215` `POST …/prova`) Meta
  çocuğunun hedef adresini / metnini değiştirir ve yeniden prova ettirir → rehber özeti
  değişmediği için `POST /reklam/rehberler/:id/yayinla` geçer → uyum denetçisi REHBERİ
  denetleyip "geçti" der, karar `yayin.uyum_sonucu`na DEĞİŞMEZ yazılır, Meta'ya ise
  denetlenmemiş çocuk içeriği gider. Kullanıcının onay penceresinde gördüğü ile kurulan ayrışır.
  Eski panel ekranları kalktığı için bugün yalnız elle API çağrısıyla erişilebilir (aynı yetki:
  `bulk.write` + `bulk.publish`); ama K-4'ün "uyum = gerçek yayının tek kapısı" sözü delik.
- **Kanıt:** `ajan4-denetim.spec.ts` › "BULGU-2" (gerçek servisler, PGlite): kurulan kreatifin
  `link`'i `https://baska-site.example.com/`, rehber `https://ornek.com.tr/` diyor, `uyum_sonucu.tur = gecti`.
- **Öneri:** `yayinla` Meta dalında, çocuğun aktif `icerik_ozeti` ile
  `sha256(taslakKanonikIcerik(rehberdenMeta(a, …).deger))` eşit değilse yayın yok (409,
  "yeniden prova et"). Mutasyon M5 bunu birebir denedi: SÖZ testlerinin hepsi (normal akış)
  yeşil kaldı, BULGU-2 testi kırmızıya döndü. Ek olarak (tercihen) eski iki uç rehber çocuğu
  olan taslakta reddetmeli (`reklam_rehberi.meta_taslak_id = t.id` ise 409). Google dalı bugün
  korunuyor (prova `derleyici_surumu = 'g-1.0.0'` şartı eski uçla üretilemiyor) ama aynı bağ
  kontrolü oraya da konmalı.

### BULGU-1 · ORTA — Bütçe bölmesi: ekran ve eksik listesi AÇIK platformla, yayına giden türetme HAM seçimle

- **Yer:** `packages/shared/src/reklam/rehber/turet.ts:50` (Meta) ve `:164` (Google) `butceBol(…, p, …)`
  — `p = a.platformlar.deger` (kullanıcının ham seçimi). Buna karşılık
  `eksikler.ts:221` (asgari kontrolü) ve `apps/web/src/components/rehber/adim-butce.tsx:69`
  (pay çubuğu) `acikPlatformlar(a, …)` (seçim ∩ görünürlük) ile bölüyor.
- **Senaryo:** ham seçim `{meta: true, google: true}` ama amacın bir platformu görünmez
  (ör. VIDEO: Meta `kapali`, Google `deneme`; ya da bir deploy bir satırı `kapali`ya çeker;
  ya da istemci PUT'u). Ekran "Google 500 ₺", asgari kontrolü 500 ₺ ile geçer; Google'a
  **250 ₺** gider, Meta hiç kurulmaz. Para fazla harcanmıyor ama kullanıcının tutarının yarısı
  sessizce kayboluyor ve ekran yalan söylüyor (CLAUDE.md "iki ayrı bölme yazılsaydı…" dersinin ta kendisi).
  Sunucu kapalı platformu seçili yazan PUT'u reddetmiyor; tek koruma panelin `disabled` düğmesi.
- **Kanıt:** "BULGU-1" iki test (saf türetme + sunucunun PUT'u kabul etmesi).
- **Öneri:** iki türetme fonksiyonu da `acikPlatformlar` ile aynı kümeyi bölmeli (görünürlük
  türetmeye parametre olarak girsin ya da çağıran `acik`ı versin). `derle-google.spec.ts`
  içindeki "500 ₺ × %50 = 250 ₺" testi de iki platformun açık olduğu bir amaçla yeniden kurulmalı.

### BULGU-4 · ORTA-DÜŞÜK — Konumun Google eşlemesi istemcinin PUT'undan kabul ediliyor

- **Yer:** `packages/shared/src/reklam/rehber/alanlar.ts:42` (`rehberKonumuSchema.google`
  istemci yazabilir) + `apps/api/src/modules/reklam/rehber/rehber-kayit.ts:64` (değer olduğu gibi yazılıyor).
- **Senaryo:** etiket "İzmir", `google.kaynak = geoTargetConstants/2840` (ABD) içeren PUT kabul
  ediliyor; `G-KONUM` eksiği kapanıyor; `konumEsle`'nin "YALNIZ tam ad eşleşmesi" kuralı hiç
  koşmuyor. Onay penceresi "İzmir" der, Google ABD'ye çıkar. Panelde bu yolu açan bir akış
  bulamadım (yalnız API).
- **Kanıt:** "BULGU-4".
- **Öneri:** `guncelle` istemciden gelen `konumlar[].google`'ı yok saysın; yalnız aynı
  (`tur`,`key`,`etiket`) için kayıtlı eşleme korunur, yeni eşlemeyi yalnız `konumlariEsle` yazar.
  Mutasyon M7 (eşlemeyi atmak) testi kırmızıya çevirdi.

### BULGU-3 · DÜŞÜK-ORTA — Karar tablosu Instagram'sız rehberde de "Instagram ve Facebook" diyor

- **Yer:** `packages/shared/src/reklam/rehber/kararlar.ts:52` (`kararTablosu` `instagramId`'yi okumuyor).
- **Senaryo:** kullanıcı "Instagram olmadan" seçer (`instagramId = null`); gövdede
  `instagram_user_id` yok. Derleyicinin kendi yorumu (`packages/shared/src/reklam/meta/derle.ts:342`):
  "IG seçiliyse daima: yoksa Instagram'da HİÇ yayın olmaz, hata da yok". Tablo yine
  "Instagram ve Facebook, otomatik yerleşim" yazıyor — söz verip tutmayan satır.
- **Kanıt:** "BULGU-3" (gerçek yayın yolundan derlenen gövde + aynı rehberin `kararlar`ı).
- **Öneri:** `kararTablosu` Instagram seçimini parametre alsın; yoksa "Facebook, otomatik
  yerleşim (Instagram seçilmedi)".

### Düşük / gözlem (kapıyı tek başına kapatmazdı)

1. **`ajans_mi` bilinmeyen ajansta AÇIK düşüyor:** `rehber.service.ts:819`, `hazirlik.service.ts:209`
   `ma.ajans_org_id IS NULL OR …`. Üst hesabı olmayan ya da üst hesabında ajans tanımsız bir
   şirketin admini `deneme` amaçlarını görür ve duraklatılmış kurulum yapabilir. Para harcamaz;
   ama CLAUDE.md'nin "ajans bilinmiyorsa KAPALI" kuralının tersi. Karar gerekli.
2. **Sıfır satırlık UPDATE sayılmıyor:** `rehber.service.ts:452` (`prova_ozeti`), `cocukBagla`
   (`:870-876`), `googleCocukYaz` içindeki `google_taslak_id` UPDATE'i `RETURNING` sonucunu
   okumuyor. Güvenli yöne düşüyor (kapı yeniden prova ister / yetim çocuk taslak kalır) ama
   sessiz. Eşzamanlı iki ilk prova iki Meta çocuk taslağı açabilir (yetim, para yok).
3. **`aitlikDenetle` `formSablonuId`'yi denetlemiyor** (`rehber.service.ts:1008-1032`). FORM bugün
   kapalı ve derleyici `formId: null` geçiyor; FORM açılmadan önce eklenmeli.
4. **`GoogleDerlemeGirdisi.kategoriler` yorumu yanıltıcı** (`turet.ts:128` "Google'da kendi kural
   paketiyle derlenir"): `derleGoogle` alanı hiç okumuyor. Kısıtlı kategoride yaş daraltması
   uyum denetçisinde durduğu için bugün zararı yok; yorum düzeltilmeli.
5. **Meta "Konum: Yalnız bu bölgede bulunanlar"** gövdede ayrı bir alanla yazılmıyor (Meta
   `location_types`'ı kaldırdı; davranış Meta'nın tek seçeneği). Ö-2'de Ads Manager'da gözle bakılmalı.

---

## Temiz çıkan maddeler ve kanıtları

| # | Madde | Sonuç | Kanıt |
|---|---|---|---|
| 1a | `deneme` hiçbir yolda ENABLE/ACTIVE yapılmıyor | Temiz | Meta: `yayin-motoru.ts:361` `kapali_kalacak` → `kapaliBirak`, `aciliyor`a tek geçiş `:362` ondan sonra; `devam()` yalnız `bekletildi` + önceki `aciliyor`. Google: `google-yayin.ts:384` açma öncesi. Testler: `rehber-meta-yayin.spec.ts` "tek bir ACTIVE nesne yok", `google-yayin.spec.ts` "deneme açılışı … AÇMAZ" |
| 1b | Prova nesne açmıyor | Temiz | Google prova gövdesi `validateOnly: true` (`rehber.service.spec.ts` "mutate:true"); yayın işleyicisi `validateOnly !== false` ise fırlatıyor (`google-yayin.ts:299`). Meta prova mevcut zincir |
| 1c | Sonucu bilinmeyen istek tekrarlanmıyor; kayıt yazılamazsa yeniden denenebilir değil | Temiz | `platformFetch` tekrar denemiyor; kuyruk deneme 1; Google işi `on_kontrol` dışında hiçbir şey göndermiyor; belirsizde yalnız arama; kayıt yazılamazsa `kayit_belirsiz` (`google-yayin.ts:486-503`). `google-yayin.spec.ts` "YENİDEN POST YOK" |
| 1d | Taslak başına tek aktif yayın | Temiz | `yayin_taslak_aktif_key` (Meta ve Google aynı tablo); rehber `durum='taslak'` şartı |
| 1e | micros: payların toplamı = tutar; Google'a giden Google payı | **BULGU-1 hariç** temiz | `butceBol` kuruş kaybı yok; Google günlük tutar aşağı yuvarlanıyor (`derle-google.ts`) |
| 2 | Kapı sırası, sıfır platform çağrısı, kesiciler, uyum reti yalnız rehberde | **BULGU-2 hariç** temiz | `rehber-saf.spec.ts` kapı sırası; YENİ: eski `yayinla` ucunun şeması `rehber` taşıyamıyor (`ajan4-denetim.spec.ts` › KAPI, kaynak taraması + boşa düşme bekçisi) |
| 3 | Karar tablosu ↔ derlenmiş gövde | Google temiz (Ajan 2'nin testi); **Meta YENİ test**, BULGU-3 hariç temiz | `ajan4-denetim.spec.ts` › SÖZ: TUR, TEKLIF (`LOWEST_COST_WITHOUT_CAP`, tavan yok), NEREDE (`contextual_multi_ads: OPT_OUT` her kreatifte, `publisher_platforms` yok), KONUM (yalnız şehir, ülke kovası yok), OTOMATIK_METIN (7 anahtar OPT_OUT), SAYFA (iki `page_id`), `destination_type: WEBSITE`, OLCUM, "bütün Meta satırları eşlendi" |
| 4 | RLS, aitlik, org_id, izinler | **BULGU-4 hariç** temiz | `rehber.service.spec.ts` RLS (SET ROLE + RETURNING, WITH CHECK, DELETE yok); aitlik hesap/sayfa/IG/kanal/medya+kapak; org_id hedef müşteriden; `client_viewer` rolünde `bulk.*` yok (`roles.ts`); uçlar ↔ api.ts (`rehber-modulu.spec.ts`) |
| 5 | Sessiz hata | Temiz | Panelde `.catch(() => setX([]))` yok, her `catch` mesajı ekrana yazıyor; ön koşullar `uc()` ile düşerse `null` + log (`hazirlik.service.ts`); YouTube hatası boş listeye çevrilmiyor; platform çağrıları transaction dışında |
| 6 | Teknik tuzaklar | Temiz | `sql-template.spec`, `fonksiyon-parametre-tipi.spec` yeşil; `$queryRaw<T>` alanları SELECT'te; RLS'li tabloya INNER JOIN yok (LEFT JOIN); Nest kaydı kaynak taramalı; üç durak (TRUNCATE, `02_rls.sql`, `WORKSPACE_TABLOLARI`) var; `REHBER_DURUMLARI` ↔ CHECK ve strateji niyet CHECK'i spec'li; `yayin_govde_degismez` başka bir SQL dosyasında yeniden tanımlanmıyor (migration'ın genişlettiği tanım `db:rls` ile ezilmez) |

## Eklenen test dosyası

`apps/api/src/modules/reklam/rehber/ajan4-denetim.spec.ts` — 16 test (gerçek servisler,
PGlite, sahte kuyruk; Google sağlayıcısı çağrılırsa patlayan Proxy):
SÖZ ×10 (BULGU-3 dahil), BULGU-2 ×1, BULGU-1 ×2, BULGU-4 ×1, KAPI ×2.

## Mutasyon sonuçları (her biri sonrası test sayısı 16 okundu; shared'dakiler `tsc -p` ile derlenip geri alınıp YENİDEN derlendi)

| Mut. | Bozulan satır | Sonuç |
|---|---|---|
| M1 | `derle.ts` `contextual_multi_ads` → OPT_IN | NEREDE düştü (1/16) |
| M2 | `bid_strategy` satırı silindi | 11/16 düştü (derleme manifestosu beforeEach'i düşürüyor) |
| M2b | `bid_strategy` → `COST_CAP` | TEKLIF düştü (1/16) |
| M3 | SITE `destinationType` boş | `destination_type` testi düştü |
| M9 | bir kreatif özellik anahtarı OPT_IN | OTOMATIK_METIN düştü |
| M11 | `geo_locations`'a ülke kovası eklendi | KONUM düştü |
| M12 | kreatif `page_id` boş | SAYFA düştü |
| M4 | BULGU-1 düzeltmesi (Google açık kümeyle bölünür) | BULGU-1 testi düştü — düzeltme ölçülebilir |
| M5 | BULGU-2 düzeltmesi (çocuk özeti ≠ türetilen özet → 409) | BULGU-2 düştü, SÖZ testleri yeşil kaldı — düzeltme normal akışı bozmuyor |
| M6 | BULGU-3 düzeltmesi (tablo metni) | BULGU-3 düştü |
| M7 | BULGU-4 düzeltmesi (istemcinin `google` eşlemesi atılır) | BULGU-4 düştü |
| M8 | `yayinlaSchema` `.passthrough()` | KAPI düştü |
| M10 | `yayinlaSchema`ya `rehber` alanı | KAPI düştü |

Bütün mutasyonlardan sonra çalışma ağacı temiz (`git status`: yalnız yeni spec).

## Tam doğrulama (dogrula.yml'nin yerel karşılığı)

| Adım | Sonuç |
|---|---|
| `corepack pnpm --filter @advetics/shared build` | exit 0 |
| `pnpm --filter @advetics/api exec prisma generate` | exit 0 |
| API typecheck | temiz (exit 0), yeni spec dahil |
| Web typecheck | temiz (exit 0) |
| Kök `pnpm typecheck` | yerelde `pnpm` PATH'te yok (`sh: pnpm: command not found`); üç paket ayrı ayrı temiz |
| Panel testleri `cd apps/web && npx vitest run` | **1395 / 1395** (101 dosya) — yeni spec sonrası tekrar koşuldu, `terminoloji.spec` yeşil |
| API testleri tek başına `cd apps/api && npx vitest run` | ilk koşu **4400 / 4400** (318 dosya); yeni spec ile tekrar **4416 / 4416** (319 dosya), exit 0 |
| `pnpm --filter @advetics/api build` | exit 0 |
| `pnpm --filter @advetics/web build` (CI'nin NEXT_PUBLIC_* değerleriyle) | exit 0; `/reklam` 29,1 kB |
| RLS kapsama kontrolü (CI'deki bash döngüsü) | eksik tablo yok |

## NEYİ ÖLÇEMEDİM

- **Hiçbir platforma gidilmedi.** Google atomik isteği, GAQL geri okuma alan adları,
  `geoTargetConstants:suggest`, Meta `minimum_budgets`, `leadgen_tos_accepted` ve Demand Gen
  `geoTargetTypeSetting` hâlâ yalnız belgeden (Ajan 2'nin listesi, Ö-1…Ö-7 aynen açık).
- Meta'nın Instagram kimliği verilmeyen kreatifi Instagram'da gerçekten göstermediği (BULGU-3)
  derleyicinin yorumuna dayanıyor; canlıda ölçülmedi. Bulgu yine geçerli: tablo ile derleyicinin
  kendi sözü çelişiyor.
- Gerçek Postgres'te (PGlite değil) `yayin_taslak_aktif_key` yarışının iki eşzamanlı istekte
  ikinci INSERT'i düşürdüğü; worker'ın gerçek BullMQ `stalled` davranışı.
- Panelin gerçek API ile uçtan uca turu ve tasarım denetimi (Ajan 6).
- `hazirlik` önbelleğinin pm2 çoklu süreçte davranışı (süreç içi; en kötü hâl uyarı).
