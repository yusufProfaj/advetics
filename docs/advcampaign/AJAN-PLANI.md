# AdvStrategy + AdvCampaign — yapay zekâ ile hesap yönetimi, beş ajan planı

> **Tarih:** 2026-10-07 · **Girdi:** kullanıcının talebi (aşağıda verbatim), iki modülün bugünkü
> hâlinin haritası (bu belgenin §1'i), `CLAUDE.md`, [`../advstrategy/AJAN-PLANI.md`](../advstrategy/AJAN-PLANI.md)
> (şablon), [`TASARIM-PLAN.md`](TASARIM-PLAN.md) (K-01…K-08 hâlâ geçerli).
> **Arayüz taslağı:** [`pilot-arayuz.html`](pilot-arayuz.html).
> **Bu belgede kod yok.**

**Kullanıcının talebi (verbatim):** *"en baştan kurgula olabildiğince az tıklama olmasını istiyorum
amacımı yapay zeka odaklı reklam yönetimi unutma"* · *"strategy modülünde de çok manuel iş var
amacımız müşteriden veri alıp onun reklam hesabını yapay zeka ile yönetebilmek"* · *"tasarıma dikkat
et iki modülün de tasarımlarını beğenmedim"*.

**Tek cümlelik hedef:** Ajans müşterinin verisini bir kez verir; yapay zekâ planı yazar, kampanyaları
kurar, sonuçları izler ve değişiklik önerir. İnsan YALNIZCA para harcayan ya da geri alınamayan
kararlarda "evet" der.

---

## 1. Bugün ne var (ölçüldü, 2026-10-07)

| | AdvStrategy (`/strateji`) | AdvCampaign (`/reklam`) |
|---|---|---|
| Altı satırlık bir plan / bir reklam | **~100+ etkileşim**, ~10 elle yazılan tutar | 10–14 etkileşim, her reklam için ayrı sohbet |
| Elle yapılan | toplam bütçe (Aylık Bütçe tablosu varken), katman bölüşümü, tohum kelimeler (Marka Merkezi kategorileri varken), kelime seçimi (hepsi seçilmemiş gelir), matrisin her satırı (7–15 kontrol), PDF'i müşteriye elle gönderme, aktarılan her oturumu elle gönderme | bütçe, süre, konum, adres yazma; özel kategori; çoklu hesap/sayfa seçimi; prova bitmeden "tekrar bak" mesajı |
| Yapay zekâ | **hiç yok** | sohbet (Gemini), 9 araç, sunucunun ürettiği onay kartı |
| Gerçek yayın | yok (aktarım taslak açıyor) | **kapalı**: uyum denetçisi yazılmadı (`yayin-baslat.ts` her zaman `UYUM` reddi), FORM şablonu yok |
| Google | plan satırı var, aktarılmıyor | fiilen yok |
| Tasarım | tablo ve form alanı yığını, yatay kayan 60rem matris, görsel bütçe yok, sekmeler bağımlı ama yol gösterilmiyor | kart içinde kart, üç telefon çerçevesi yan yana kayıyor, kalıcı kapalı "Yayına al", üç ayrı çıkış iki ekrana, panel kalıbını kullanmayan kendi `ui.tsx`'i |

**Teşhis:** iki modül de "kullanıcı doldurur, sistem doğrular" diye kurulmuş. Hedef tersi: **sistem
doldurur, kullanıcı itiraz eder.** Verinin çoğu zaten depoda duruyor ve okunmuyor
(`ClientProfile.urunKategorileri`, `sikSayfalar`, `varsayilanKitleId`, `MonthlyBudget`,
`SearchTermInsight`, `InsightBreakdown`).

---

## 2. Yeni kurgu: dört adım, üç "evet"

```
 VERİ  ──►  PLAN  ──►  KURULUM  ──►  PİLOT (sürekli)
 bir kez    ayda bir    plan onayında   her gün
 ────────   ────────    ────────────    ─────────────
 site adresi  YZ yazar   YZ her plan     YZ izler, öneri
 + hesaplar   ↓          satırını kurar  kartı üretir
 = Marka      [evet 1]   prova arka      ↓
 Merkezi      müşteri    planda          [evet 3] tek dokunuş
 dolu         onaylar    [evet 2]        (ya da koruma
                         ajans tek       sınırı içinde
                         düğmeyle        kendiliğinden)
                         yayına alır
```

| Adım | Kullanıcı ne yapar | Yapay zekâ ne yapar | Kaynak (uydurmama kuralı) |
|---|---|---|---|
| **Veri** | site adresini yapıştırır, hesapları atar (zaten var) | siteyi okuyup Marka Merkezi'ni doldurur (`bilgi-bankasi-ai` var), eksik 3 soruyu sorar: ana amaç, özel kategori, yasal uyarı | site + kullanıcı cevabı |
| **Plan** | "Ekim planını hazırla" (1 tık) → okur → "Onaya gönder" | toplam bütçe ← Aylık Bütçe; platform payı ← 90 gün dönüşüm; katman payı ← sabit kural + geçmiş; tohum kelime ← ürün kategorileri + arama terimleri; kelime seçimi ← eşik (K-06 `ARAMA_HACMI_ESIGI`); matris ← kitle şablonları × son 90 günün en iyi varlıkları; her rakamın yanında kaynağı | her sayının bir kaynağı var; kaynağı olmayan alan **boş + nedeni** |
| **Kurulum** | müşteri planı panelde onaylar (evet 1) → ajans "Hepsini yayına al" (evet 2) | onaylı planın her satırı için taslak + önizleme + prova kendiliğinden; tek onay kartı bütün satırları listeler | onaylı plan = kullanıcı kararı |
| **Pilot** | öneri kartına "Uygula" / "Geç" | günlük tarama: harcayan ama dönüşmeyen reklam, yorulan kreatif, negatif olması gereken arama terimi, bütçe hızı; her kart neden + beklenen etki + geri alma | `insights_daily`, `search_term_insights`, `monthly_budgets` |

**Sohbet nereye gitti?** Kalkmadı, **ana yol olmaktan çıktı.** Her ekranın altında tek bir "değiştir"
kutusu var ("Google'a 5.000 TL daha ayır", "bu görseli çıkar"): yapay zekâ bunu plana ya da taslağa
sürüm olarak yazar. Yazmak isteğe bağlı; hiç yazmadan baştan sona gidilebiliyor.

**Tıklama hedefi:** altı satırlık bir aylık plan + kurulumu: **bugün ~115 etkileşim → hedef 3**
(Planı hazırla · Müşteriye gönder · [müşteri] Onayla; Ç-6). Ajan 4 bunu ölçer.

---

## 3. Çelişki tablosu — ajanlar başlamadan kullanıcıyla kapanacak

**2026-10-07 kullanıcı kararları:** Ç-3 **öneri + tek dokunuş** (Pilot hiçbir şeyi kendiliğinden
değiştirmez). Ç-6 **müşteri onayı yeter**: müşteri planı onaylayınca kampanyalar kendiliğinden
kurulur ve açılır; ajansın "Hepsini yayına al" düğmesi YOK, ajansın kontrol noktası "Müşteriye
gönder"den önceki plan incelemesi. Ç-7 **her şey baştan**, arka plan dahil. Ç-8 **taslağın yönü
onaylandı**. Ç-1, Ç-2, Ç-4, Ç-5 öneri sütunundaki gibi.

**Bu kararların doğurduğu kurallar (Ajan 1 sözleşmeye işler, Ajan 4 sınar):**
- Ç-6 müşteri rolünün (`client_viewer`) onayını PARA HARCAYAN bir olaya çeviriyor. Onay ucu
  yayını başlatan TEK kapı olur; onaylanan şey plan SÜRÜMÜNÜN özeti (hash), onaydan sonra planda
  değişiklik yeni onay ister. Onay ekranı toplam tutarı, süreyi ve en çok harcanabilecek tutarı
  müşterinin dilinde yazar. Uyum denetçisi geçmeden (Ç-4) onay yayını başlatmaz, test kipinde
  kalır ve bunu müşteriye söylemez, ajansa söyler.
- Ç-7 arka plan baştan yazılıyor ama **canlıda öğrenilenler yeniden ödenmeyecek**: `CLAUDE.md`
  "Canlıda öğrenilen platform gerçekleri" + eski modülün testleri bir KABUL LİSTESİNE çevrilir
  (Ajan 1) ve yeni motor o listenin her maddesini testle taşır (Ajan 4). Eski modül, yeni motor
  canlı turdan geçene kadar SİLİNMEZ (geri dönüş yolu); geçince tek commit'te kalkar. Eski
  tablolardaki veri silinmez.

| # | Talep diyor | Depo gerçeği | Öneri |
|---|---|---|---|
| Ç-1 | "Az tıklama": bütçe, süre, konum, adres sorulmasın | `VARSAYILANSIZ_ALANLAR`: model bu dört alanı UYDURAMAZ, sunucu kullanıcının cümlesiyle karşılaştırıyor. Bu kural para harcayan mükerrer/yanlış kurulumu engelliyor | Kural kalır, **kaynak genişler**: onaylı plan satırı, Aylık Bütçe ve Marka Merkezi (`varsayilanKitleId`, `sikSayfalar`) de "kullanıcı kararı" sayılır. Model hâlâ hiçbir rakam üretmez; her alan bir kaynağa çapalı, ekranda kaynağı yazılı |
| Ç-2 | "Yapay zekâ ile yönetmek" | Özel reklam kategorisi (konut/kredi/istihdam) hukuki beyan; model cevaplayamıyor (bilerek) | Reklam başına değil **workspace başına BİR KEZ** sorulur (Veri adımı), Marka Merkezi'nde saklanır, her taslağa oradan gelir |
| Ç-3 | "Hesabı yapay zekâ yönetsin" | `CLAUDE.md`: para harcayan ve geri alınamayan iş sorulur; kural motoru zaten var | **KAPANDI: öneri + tek dokunuş.** Öneriydi: Pilot önerir, tek dokunuşla uygulanır. İsteğe bağlı "koruma sınırı içinde kendiliğinden": yalnız DURDURMA ve KISMA (bütçe ARTIRMA asla kendiliğinden değil), her işlem geri alınabilir ve günlük özette yazılı |
| Ç-4 | Plan onaylanınca kampanyalar açılsın | Gerçek yayın kapalı: uyum denetçisi (TASARIM bölüm 10) yok, FORM şablonu yok | Uyum denetçisi **Tur 1'in ilk işi**. O yazılmadan "yapay zekâ yönetiyor" denemez; Kurulum adımı test kipinde çalışır ve ekranda bunu söyler |
| Ç-5 | Meta ve Google birlikte | Google yazma yolu canlıda HİÇ denenmedi; K-02: duraklatılmış kurulur, açılmaz | K-02 aynen. Plan Google'ı içerir; Kurulum Google satırını "duraklatılmış kurulacak" diye gösterir. Google canlı ölçümü Tur 3 |
| Ç-6 | Az onay | Müşteri planı onaylıyor (dört ekran kararı). Para harcamayı kim başlatıyor? | **KAPANDI: müşteri onayı yeter** (öneri iki ayrı evetti: müşteri bütçe, ajans yayın). Ajansın kontrolü "Müşteriye gönder"den önce |
| Ç-7 | "En baştan kurgula" | Arka planda mutasyonla sınanmış, canlıda öğrenilmiş katmanlar var: derleyici (`derleMeta`), prova, yayın motoru (PAUSED → geri okuma → açma), tek kullanımlık onay, yazma kesici | **KAPANDI: her şey baştan** (yukarıdaki kurallarla). Öneri: DENEYİM ve EKRANLAR baştan; bu güvenlik katmanları KALIR (yeniden yazmak, canlıda bir kez ödenmiş hataları yeniden ödemek). Silinecekler: `reklam/ui.tsx`, `.adv-*` süsleri, `/reklam/yeni` sihirbazı, strateji matris tablosu |
| Ç-8 | "Tasarımları beğenmedim" | Kurumsal kimlik kararı (2026-10-06): Montserrat/Open Sans, `#ff2400`, `#302e2d`, panel kalıbı | Kimlik KALIR, iki modüldeki kendi süsleri (nokta ızgara, köşe çentiği, yörünge) ve tablo yığını GİDER. Taslak: `pilot-arayuz.html`. Ajan 3 bu taslak onaylanmadan başlamaz |

Benim verdiğim ürün kararları (CLAUDE.md §5, ölçüt kullanım kolaylığı + reklam verimliliği):
sohbet ana yol değil; iki modül menüde ayrı kalır (müşterinin dört ekranı kilitli) ama tek akışın
iki ucu: AdvStrategy "plan", AdvCampaign "kurulum + pilot"; AdvCampaign'in açılış görünümü sohbet
değil **Pilot** (bugün ne oldu, ne bekliyor).

---

## 4. Beş ajan

Sıra `CLAUDE.md` gereği: 1 → (2 ‖ 3) → 4 → 5. Her tur kendi başına canlıya alınır.

### Ajan 1 — Mimar
**Kilit çıktı:** `packages/shared/src/pilot/` (yeni ortak sözleşme) + bu belgenin `MIMARI.md`'si.
1. **Kaynak çapası tipi** (`Kaynakli<T>`: değer + kaynak türü + kaynak kimliği + zaman). Plan
   hücresi, taslak alanı ve öneri kartı aynı tipi taşır; kaynaksız değer derlenemez.
2. **Plan üreticisi sözleşmesi** (`planUret(girdi) → PlanOnerisi`): saf fonksiyon, girdisi Aylık
   Bütçe + 90 günlük özet + Marka Merkezi + kitle/varlık listesi. Yapay zekâ yalnız METİN üretir
   (gerekçe cümlesi, grup adı); sayı üretmez.
3. **Plandan taslak sözleşmesi** (`satirdanTaslak`): plan satırı → `TaslakAlanlari`. Bugünkü
   `aktarimIstemi` (metin üretip sohbete koyan yol) kalkar; aktarım veri olarak yapılır.
4. **Toplu onay kartı**: N taslağı tek kartta, satır başına prova durumu; tek kullanımlık ve
   bayatlama kuralları bugünkü `adv_onay`dan.
5. **Pilot öneri kartı** veri modeli: tür, hedef nesne, neden (ölçülmüş sayılarla), beklenen etki,
   geri alma adımı, durum makinesi (`yeni → uygulandi | gecildi | bayat | geri_alindi`, her son
   durumdan çıkışı kim yazıyor).
6. **Ölçüm listesi** Ajan 5'e: Meta toplu prova kotası, öneri türlerinin eşikleri (kaç gün, kaç TL).
**Kapı:** shared derlemesi ÇIKTISIYLA temiz, Ç-1…Ç-8 sözleşmeye işlenmiş.

### Ajan 2 — Arka Plan
1. **Tur 1:** uyum denetçisi (Ç-4) → `planUret` → `satirdanTaslak` + arka plan provası →
   toplu onay → mevcut yayın motoru.
2. **Tur 2:** Pilot taraması (worker, günlük; `sync_jobs` deseni, `succeeded + 0 kart` ayrı not),
   dört öneri türü: harcayıp dönüşmeyen reklam, yorulan kreatif (frekans + CTR düşüşü), negatif
   aday arama terimi, bütçe hızı sapması.
3. **Tur 3:** Google satırları (K-02), Veri adımında siteden doldurmanın plan girdisine bağlanması.
Kurallar aynen: platform çağrısı transaction dışında, `PlatformApiError` kendi dalında, yeni tabloda
üç durak (TRUNCATE, `02_rls.sql`, `WORKSPACE_TABLOLARI`).

### Ajan 3 — Ön Yüz
1. `pilot-arayuz.html` onaylanınca: AdvStrategy tek sayfa "plan belgesi" (sekme yok, yukarıdan
   aşağı okunur: özet → bütçe şeridi → kampanyalar → kelimeler → onay), AdvCampaign açılışı Pilot.
2. Panel kalıbı ve `components/ui`; modülün kendi `ui.tsx`'i ve `.adv-*` sınıfları silinir.
3. Dört hâl ayrı (istenmedi / çalışıyor / sonuç yok + nedeni / düştü + platform mesajı).
4. Her rakamın yanında kaynak etiketi; tıklayınca kaynağın kendisi.
**Kapı:** typecheck, `nav-sections`, `panel-tasarim`, mobilde yatay kaydırma yok.

### Ajan 4 — Test & Güvenlik
RLS (`SET ROLE` + `RETURNING`), izolasyon (A'nın planı B'nin varlığını seçemez), **kaynaksız değer
testi** (her plan hücresini ve taslak alanını tara: kaynağı yoksa düş), tıklama sayımı (hedef 4),
kendiliğinden uygulamanın bütçe ARTIRAMADIĞI testi, mutasyon.

### Ajan 5 — Canlıya Alma
Tur başına migration sırası, canlı ölçümler, `DEVAM.md`, deploy komutu (elle, `advetics`).

---

## 5. Turlar

| Tur | İçerik | Canlıda değer |
|---|---|---|
| **1** | Uyum denetçisi · Planı hazırla (YZ) · plan belgesi ekranı · plandan toplu taslak + prova · toplu onay (Meta) | Ajansın bugün elle yaptığı aylık plan + kurulum 4 tıklama |
| **2** | Pilot: günlük tarama, dört öneri türü, tek dokunuşla uygula / geri al, günlük özet | Hesap "yönetiliyor" |
| **3** | Google satırları (duraklatılmış), Veri adımı ekranı | Tam döngü |
