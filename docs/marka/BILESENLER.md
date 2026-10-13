# Advetics panel bileşenleri

**Tarih:** 2026-10-14 · **Referans (ölçü ve davranış):**
[`tasarim-sistemi.html`](tasarim-sistemi.html), [`menu-sistemi.html`](menu-sistemi.html)
(+ "+ Oluştur" açılır menüsü [`menu-sistemi-b.html`](menu-sistemi-b.html) `#ac-olustur`),
sihirbaz dili [`../advstrategy/simulasyon.html`](../advstrategy/simulasyon.html).
**Kurallar:** [`TASARIM-DILI.md`](TASARIM-DILI.md) § 5–6. **Bekçi:**
`apps/web/src/app/tasarim-sistemi.spec.ts`.

Panelde iki tasarım sistemi vardı (Tailwind + `globals.css` katmanı ve dört CSS
modülünün kendi `--t-*` kopyaları), 22 farklı düğme sınıfı, 6 sekme biçimi,
10'dan fazla elle modal, 9 `Alan` + 3 `Field` kopyası, 7 yerel `Kart`, 6
istatistik kutusu, 10 boş/hata bileşeni, 3 sihirbaz dili ve 7 sayfa genişliği.
Bu belge tek kalıbı anlatıyor. Yeni ekran ve sayfa geçişi YALNIZ
`apps/web/src/components/ui/` bileşenleriyle yazılır.

---

## 1. Token'lar (`apps/web/src/app/globals.css` `:root`)

| Grup | Token | Tailwind |
|---|---|---|
| Renk | `--surface` beyaz, `--surface-muted` zemin (gri %3,5), `--surface-sunken` dolgu (%6), `--border` çizgi (%12), `--border-strong` (%22), `--vurgu` kırmızı %7, `--text` siyah, `--text-muted` (%68), `--text-soluk` (%42), `--brand-primary` kırmızı, `--seri2` siyah | `bg-surface`, `bg-surface-muted`, `bg-surface-sunken`, `border-line`, `border-line-strong`, `bg-vurgu`, `text-ink`, `text-ink-muted`, `text-ink-soluk`, `bg-brand`, `text-brand-strong` |
| Durum | `--ok` YEŞİL (yalnız durum noktası), `--warn`/`--danger` = KIRMIZI, `--info` = GRİ; `-soft`/`-strong` çiftleri kılavuza eşli | `bg-ok`, `text-danger-strong`, `border-l-danger` |
| Yarıçap | 8 alan/küçük öğe, 16 kart/panel, tam yuvarlak düğme/çip/rozet (12 yalnız şerit) | `rounded-alan`, `rounded-kart` (= `rounded-xl`), `rounded-full` |
| Yazı | 11 · 12 · 13 · 14 · 15 · 18 · 24 · 28 (12,5 ve 13,5 yalnız bileşen içinde) | `text-11` … `text-28` |
| Boşluk | 4 · 8 · 12 · 16 · 20 · 24 · 28 · 40 | Tailwind `1 2 3 4 5 6 7 10` |
| Gölge | Kart GÖLGESİZ (`--shadow-card: none`); yalnız açılır menü, pencere, yan panel | `shadow-acilir` |

CSS modülleri (`taslak`, `iyilestir`, `kreatif-zeka`, `rehber`) `--t-*` adlarını
okumaya devam ediyor; adlar `globals.css`te TEK KEZ token'lara bağlı, modül
kendi kopyasını TANIMLAMAZ (bekçi düşer). Modüllerin `.birincil`, `.ikincil`,
`.hap`, `.kart`, `.seg`, `.cip`, `.tablo`, `.perde` sınıfları referans
ölçülerine eşlendi; sayfa ajanı o ekranı bileşene geçirince sınıfı siler.

Karanlık tema: sistem tercihi (`prefers-color-scheme`) ya da kullanıcı
kartındaki "Tema" (`<html data-theme>`); iki blok aynı değerleri taşır.

## 2. Bileşenler (`apps/web/src/components/ui/`)

| Bileşen | Dosya | Props (özet) | Ne zaman |
|---|---|---|---|
| `Dugme`, `dugmeSinifi(ton, boyut)` | `dugme.tsx` | `ton`: `birincil` · `ikincil` · `koyu` · `hayalet` · `tehlike` (`sade` = eski ad); `boyut`: `orta` 40 · `kucuk` 32; `ikon` (metnin solu), `bekliyor`, `disabled` | Her düğme. `<Link>` görünümlü düğme: `className={dugmeSinifi(...)}` |
| `SayfaBasligi` | `sayfa-basligi.tsx` | `baslik` (menü adının AYNISI), `bolum` (kırmızı üst başlık: "Yönet"), `aciklama`, `ust` (hiyerarşi yolu), `eylemler` (sağ), `suzgecler` (alt satır) | Her sayfanın başı |
| `SayfaIskeleti` | `sayfa-basligi.tsx` | `SayfaBasligi` props'u + `genislik`: `genis` (1400, tablo/özet) · `dar` (`max-w-4xl`, form/ayar/sihirbaz) | Yeni sayfanın kökü; iki genişlik dışında genişlik yok |
| `Kart`, `KART_BAGLANTISI` | `kart.tsx` | `baslik`, `baslikEki` (gri "2 / 2"), `eylem` (başlık sağı), `altEylem` (sağ alt TEK eylem), `dolgu` (tablo için `false`) | Her kutu |
| `MetrikKutulari` | `metrik-kutulari.tsx` | `kutular[]`: `anahtar, ad, deger, fark {metin, hal: iyi/kotu/notr}, seri 1/2, ipucu, secilemezNedeni`; `onSec`; `cerceveli` | Performans özetleri (4 kutu, telefonda 2×2) |
| `Grafik` | `grafik.tsx` | `seriler[]` (en çok 2: `ad, degerler, onceki`), `etiketler`, `yukseklik` | Günlük seri; 1. seri kırmızı, 2. seri siyah, önceki dönem kesikli, degrade dolgu YOK |
| `Tablo`, `AracCubugu`, `Cip`, `CipEkle`, `SayfalamaCubugu`, `AdHucresi` | `tablo.tsx` | `sutunlar[]` (`baslik, sayi, hucre, toplam, ikincil`), `satirlar`, `satirAnahtari`, `aracCubugu`, `toplamEtiketi`, `sayfalama {bas, son, toplam, onceki, sonraki}`, `bos` | Her liste/tablo. Başlık 12 px, BÜYÜK HARF YOK; sayı sütunu sağa yaslı; toplam ve "1 - 10 / 37" her zaman |
| `Sekmeler` | `sekmeler.tsx` | `secenekler[]` (`deger, etiket, href, sayi`), `secili`, `onSec`, `etiket` | Sayfanın İÇERİK bölümleri (alt çizgili, seçili kırmızı çizgi; ←/→ klavye) |
| `BolumluSecici` | `sekmeler.tsx` | `secenekler[]`, `secili`, `onSec`, `etiket` | Aynı verinin 2-4 GÖRÜNÜMÜ / süzgeç (Bu ay · 30 gün · Özel; Tümü · Meta · Google) |
| `Rozet`, `DurumNoktasi`, `SayiRozeti` | `rozet.tsx` | `hal`: `ok` yeşil · `dur` gri kare · `taslak` gri · `hata` kırmızı | Durum (yeşil YALNIZ burada); bekleyen iş sayısı |
| `Alan`, `Girdi`, `Secim`, `MetinAlani`, `FormIzgarasi` | `alan.tsx` | `Alan`: `etiket, ipucu, hata, id`, çocuk ya da `(id, aciklamaId, hatali) => …`; alanlar `hatali` | Her form alanı (40 yüksek, 8 yarıçap, hata girişte) |
| `Yukleniyor`, `BosDurum`, `HataDurumu`, `Serit` | `hal.tsx` | `BosDurum`: `baslik, neden` (ZORUNLU), `eylem`; `HataDurumu`: `baslik, mesaj` (platformun metni), `onTekrar`; `Serit`: `baslik, eylemler, ton` | Dört hâl; boş beyaz alan yok |
| `Uyari`, `UyariListesi` | `uyari.tsx` | eski API (`ton: bilgi/uyari/tehlike/basari`), görünüş şerit | Mevcut kullanımlar; yeni kodda `Serit` |
| `Pencere`, `YanPanel` | `pencere.tsx` | `acik, onKapat, baslik, aciklama, altEylemler, genislik` | Pencere: onay/kısa soru. YanPanel: satır DÜZENLEME (sayfadan çıkmadan, sağdan) |
| `AcilirMenu`, `MenuOgesi`, `MenuAyraci`, `MenuBasligi`, `useAcilirMenuKapat`, `IKON_TETIK` | `acilir-menu.tsx` | `tetik({…özellikler})`, `etiket`, `hizala`, `yon`, `genislik`, `rol` (`menu`/`dialog`), denetimli `acik/onAcikDegis`; öğe: `ikon, aciklama, ip, tehlike, secili, href/onClick` | Seçici, "+ Oluştur", kullanıcı menüsü, bildirim zili, satır ⋯ menüleri |
| `IlerlemeRayi`, `Soru`, `SecimKarti`, `BuyukSecim`, `HapSecici`, `AltCubuk` | `sihirbaz.tsx` | ray `parcalar[] {anahtar, etiket, hal}`; `Soru {ust, soru, aciklama}`; `SecimKarti {ikon, kirmizi, baslik, aciklama, alt, secili, onClick}`; `AltCubuk {geri, not, devam, ek}` | Bütün oluşturma akışları (AdvStrategy, AdvCampaign, kurulum) |
| `Ikon` | `ikon.tsx` | `ad` (kabuk ikonları) | Menü ve üst çubuk |

**Davranış (hepsi):** açılıp kapanan öğe DOM'DAN ÇIKMAZ (görünmez + `inert`,
geçişle), Esc kapatır, odak tuzağı (pencere, yan panel), ok tuşları (açılır
menü, sekme), `prefers-reduced-motion` altında hareket yok.

## 3. Yerleşim kuralları

1. **Birincil eylem başlığın SAĞINDA** (`SayfaBasligi eylemler`), ekranda TEK
   kırmızı dolu düğme. En çok bir birincil + iki ikincil.
2. **Sihirbazda birincil `AltCubuk`un sağında**; Geri solda, not ortada
   (Devam kapalıysa nedeni notta).
3. **Kartın eylemi sağ altta** (`Kart altEylem`, bağlantı ya da küçük
   ikincil). Kart içinde kırmızı dolu düğme YOK.
4. **Düzenleme `YanPanel`de**, yeni sayfa açılmaz; Kaydet sağ altta, kapat sağ
   üstte. Onay `Pencere`de.
5. **Süzgeç tablonun üstünde çip** (`AracCubugu` + `Cip`), görünüm değişimi
   `BolumluSecici`, bölüm değişimi `Sekmeler`. Üçü karıştırılmaz.
6. **Tabloda toplam ve sayfalama her zaman**; kesilen liste kaç satırın
   gösterildiğini söyler.
7. **Boş liste nedenini söyler** (`BosDurum neden`), hata platformun mesajını
   gösterir (`HataDurumu mesaj`), yükleniyor iskelet.
8. **Sayılar Montserrat ve hizalı rakam** (`tutar` ya da `font-baslik tabular-nums`).
9. **Sayfa genişliği iki değer**: `genis` ya da `dar`.

## 4. Menü ve kabuk (menü kararı 2026-10-14)

Dört katman, her ekranda aynı yerde:

| Katman | Bileşen | Kural |
|---|---|---|
| Ana menü | `components/kenar-cubugu.tsx` (`KenarIcerigi`), `components/nav.tsx` | Sol sütun 248 px: logo → workspace seçici → "+ Oluştur" → grup başlıklı yedi bölüm (seçili öğe kırmızı zemin + kırmızı ikon, bekleyen iş sayacı `SayiRozeti`) → Ayarlar → sol altta kullanıcı kartı. Mobilde AYNI içerik soldan çekmece (`mobil-menu.tsx`, DOM'da kalır) |
| Workspace seçici | `components/kapsam-secici.tsx` (`AcilirMenu` denetimli, `rol="dialog"`) | Menünün en üstü; arama, şirket grupları, "Tüm şirketler", "Şirketleri yönet" |
| + Oluştur | `components/kabuk-menuleri.tsx` `OlusturMenusu`, liste `lib/olustur-menusu.ts` | "Ne oluşturalım?": Reklam · Strateji · Gönderi öne çıkar, ayraç, Kural · Rapor. Hedefler menü satırlarıyla aynı yollar, YAZMA iznine göre süzülür, müşteri hesabına hiç çıkmaz |
| Kullanıcı menüsü | `KullaniciMenusu` + `TemaOgesi` (`components/tema.tsx`) + `CikisOgesi` | Hesabım · İki adımlı giriş · Tema (Sistem/Açık/Koyu) · ayraç · Çıkış (kırmızı) |
| Üst çubuk | `(dashboard)/layout.tsx` `<header>`, `components/kirinti.tsx`, `YenileIkonu`, `BildirimZili` | Solda kırıntı (şirket › workspace › sayfa adı = menü etiketi), sağda YALNIZ ikon: yenile, bildirim |
| Sayfa alt bölümleri | `Sekmeler` | Başlığın altında alt çizgili sekme, sayı ya da kırmızı nokta. Ayarlar sekmeleri ve Marka Merkezi iç menüsü HENÜZ geçirilmedi (sayfa iç tasarımları ayrıca taslaklanıyor) |
| ⋯ menüleri | `AcilirMenu` + `MenuOgesi` (tehlikeli eylem en altta, `tehlike`) | Satır sonu, kart başlığı, sayfa başlığı; sık kullanılan tek eylem dışarıda düğme |

**Taslaktan bilinçli sapmalar:** üst çubuktaki "Ara" ve "Yardım" ikonları
YOK (panelde genel arama ve yardım sayfası yazılmadı; hiçbir şey yapmayan ikon
çalışmayan bir özelliği vaat eder). Workspace satırındaki "kurulum durum
noktası" YOK (seçicinin verisi kurulum durumunu taşımıyor; eklenmesi API'de
workspace başına kurulum sayacı ister). "Yeni şirket / workspace aç" ayrı satır
değil, seçicinin altındaki "Şirketleri yönet" bağlantısı (aynı sayfa).

## 5. Yasaklar

- Elle `rounded-*` / `bg-brand` / `bg-danger` + `text-white` düğme → `Dugme`.
- Elle modal (`fixed inset-0`) → `Pencere` / `YanPanel` (çekmece istisnası kabukta).
- Elle `<h1>` → `SayfaBasligi`.
- Kılavuz dışı renk: Tailwind ham paleti (`amber-`, `blue-`, `sky-`, `emerald-`,
  `slate-`…), sabit hex (`#dc2626`, `#d97706`, `#0284c7`…), mavi gölge
  (`rgb(16 24 40 …)`). Renk YALNIZ token.
- Degrade (`bg-gradient-to-*`, `linear/radial-gradient`), parıltı gölgesi,
  buğu. İstisna: maske solması (`mask-image`).
- Kartta gölge, kart içinde kırmızı dolu düğme, üçüncü bir sayfa genişliği.
- `.catch(() => setX([]))` (CLAUDE.md §3): boş liste nedeni olmadan çizilmez.

## 6. İstisna listesi ve bekçi

`apps/web/src/app/tasarim-sistemi.istisnalar.ts` bugünkü ihlalleri DOSYA DOSYA
sayıyor (başlangıç 2026-10-14: 86 dosya; düğme 83, modal 11, h1 23, renk 24,
degrade 1). Liste YALNIZ KÜÇÜLÜR: sayı artarsa test düşer, dosya düzelip
listede eski sayı kalırsa da düşer ("LİSTEYİ KÜÇÜLT …"). Sayaç
`tasarim-sistemi.tarama.ts`.

## 7. Geçiş tablosu (eski desen → yeni bileşen)

| Eski | Yeni |
|---|---|
| `className="rounded-lg bg-brand px-3 py-1.5 text-white …"`, modül `.birincil` | `<Dugme>` / `dugmeSinifi('birincil', …)` |
| `border border-line bg-surface … rounded-lg` ikincil düğme, modül `.ikincil`, `.hap` | `<Dugme ton="ikincil">` |
| `bg-danger text-white` silme düğmesi | `<Dugme ton="tehlike">` (dolu değil) |
| `<h1 className="sayfa-baslik">` + elle açıklama + elle eylem satırı | `<SayfaBasligi bolum baslik aciklama eylemler suzgecler>` |
| `max-w-3xl/5xl/6xl/7xl` sayfa kabı | `<SayfaIskeleti genislik="genis" \| "dar">` |
| `rounded-xl border border-line bg-surface p-5`, yerel `Kart`, modül `.kart` | `<Kart baslik altEylem>` |
| Yerel istatistik kutusu, modül `.metrikler/.metrik` | `<MetrikKutulari>` |
| `genel-bakis-parcalari.tsx` `Grafik` | `<Grafik seriler etiketler>` |
| Elle `<table>`, modül `.tablo`, `uppercase tracking-wide` başlık | `<Tablo sutunlar …>` + `AracCubugu`/`Cip` |
| Modül `.seg`, elle hap segment | `<BolumluSecici>` |
| Elle alt çizgili sekme, `ayar-sekmeleri.tsx`, `ic-menu.tsx` | `<Sekmeler>` (sayfa iç taslağı onaylanınca) |
| Yerel `Alan`/`Field`, elle `<label>+<input>` | `<Alan><Girdi/></Alan>` |
| `border-dashed … text-center` boş kutu, yerel "henüz yok" | `<BosDurum baslik neden eylem>` |
| `role="alert"` kırmızı kutu, `bg-danger-soft` | `<HataDurumu mesaj onTekrar>` ya da `<Serit ton="hata">` |
| `bg-warn-soft`/`bg-info-soft` bilgi kutusu, modül `.bildirim` | `<Serit>` / `<Uyari>` |
| `fixed inset-0 bg-black/40` + kutu, modül `.perde/.pencere` | `<Pencere>`; düzenleme formu → `<YanPanel>` |
| Elle açılır menü (`useState` + `mousedown`), ⋯ menüsü (`rehber/set-kartlari.tsx`) | `<AcilirMenu>` + `<MenuOgesi>` |
| `strateji/v2/akis-cerceve.tsx` `IlerlemeRayi/SoruBasligi/AltCubuk/BuyukKart` | `ui/sihirbaz.tsx` `IlerlemeRayi/Soru/AltCubuk/SecimKarti` |
| Elle durum rengi (`text-ok`, yeşil yazı) | `<Rozet hal>` / `<DurumNoktasi>` |

## 8. Sayfa ajanlarının dosya grupları

Sayfa → bileşen haritasından (kapanış envanteri), ortak bileşenler ve kabuk
hariç. Bir bileşen birden çok gruba düşüyorsa İLK grupta. ⚑ = istisna
listesinde ihlali olan dosya. Genel Bakış'ın iç düzeni KALIYOR (kullanıcı
beğendi): yalnız token/düğme görünüşü.

Gruplar dışında kalan istisnalı dosyalar (Grup 4 bunları da alır):
`app/(dashboard)/error.tsx`, `components/auth/*`, `components/login-form.tsx`,
`app/r/[token]/page.tsx`, `app/strateji-onay/[token]/page.tsx`,
`components/report/report-document.tsx` (belge), `components/workspace-gerekli.tsx`.
Tanıtım sitesi (`app/(site)`, `app/(legal)`, `components/landing/*`) panel
dışında; ayrı karar.

CSS modülleri: `taslak/taslak.module.css` → Grup 1 (Genel Bakış, Reklam
Yöneticisi), `rehber/rehber.module.css` → Grup 2 (AdvCampaign),
`taslak/iyilestir.module.css` ve `taslak/kreatif-zeka.module.css` → Grup 3.

#### Grup 1 · Genel Bakış, Yönet, Raporlar (36 dosya)

- `app/(dashboard)/ads-explorer/galeri/page.tsx` ⚑
- `app/(dashboard)/ads-explorer/page.tsx` ⚑
- `app/(dashboard)/dashboard/page.tsx` ⚑
- `app/(dashboard)/potansiyel-musteriler/page.tsx` ⚑
- `app/(dashboard)/raporlar/page.tsx` ⚑
- `components/ad-card.tsx`
- `components/alici-listesi-alani.tsx`
- `components/arama-reklami-onizleme.tsx`
- `components/budget/budget-form.tsx` ⚑
- `components/budget/pacing-bar.tsx` ⚑
- `components/butce/butce-icerik.tsx` ⚑
- `components/genel-bakis/kurulum-seridi.tsx` ⚑
- `components/kreatif-gorsel.tsx`
- `components/leads/geri-besleme-seridi.tsx` ⚑
- `components/leads/gonderimler-sekmesi.tsx`
- `components/leads/lead-table.tsx`
- `components/leads/son-30-gun.tsx`
- `components/reklam-onizleme.tsx`
- `components/report/conversion-chart.tsx` ⚑
- `components/report/faturalar.tsx` ⚑
- `components/report/haftalik-ozet-baglantisi.tsx`
- `components/report/haftalik-ozet.tsx`
- `components/report/kitle-ozeti.tsx` ⚑
- `components/report/mail-govde-editoru.tsx`
- `components/report/rapor-gonder.tsx` ⚑
- `components/report/rapor-planla.tsx` ⚑
- `components/report/rapor-sekmeleri.tsx`
- `components/report/report-document.tsx` ⚑
- `components/report/sablon-secici.tsx`
- `components/report/sablon-yonetimi.tsx` ⚑
- `components/report/share-controls.tsx` ⚑
- `components/suzgec-menusu.tsx`
- `components/taslak/genel-bakis-kartlari.tsx`
- `components/taslak/genel-bakis-parcalari.tsx`
- `components/taslak/reklam-yoneticisi-tablosu.tsx`
- `components/taslak/varlik-eylem-penceresi.tsx`

#### Grup 2 · Planla ve Oluştur (82 dosya)

- `app/(dashboard)/auto-boost/page.tsx` ⚑
- `app/(dashboard)/butce/page.tsx`
- `app/(dashboard)/kurulum/page.tsx` ⚑
- `app/(dashboard)/reklam-olustur/[[...yol]]/page.tsx`
- `app/(dashboard)/reklam/onizleme/page.tsx`
- `app/(dashboard)/reklam/page.tsx`
- `app/(dashboard)/reklam/yeni/page.tsx`
- `app/(dashboard)/strateji/page.tsx`
- `app/(dashboard)/toplu-olustur/[[...yol]]/page.tsx`
- `components/autoboost/bildirim-havuzu.tsx` ⚑
- `components/autoboost/boost-on-ayari.tsx` ⚑
- `components/autoboost/boost-on-ayarlari-formu.tsx` ⚑
- `components/autoboost/google-hedefleme.tsx`
- `components/autoboost/hedefleme-secici.tsx`
- `components/autoboost/kart-duzenle.tsx`
- `components/autoboost/youtube-prova-sonucu.tsx`
- `components/bilgi-bankasi/ai-doldur.tsx` ⚑
- `components/boost/boost-controls.tsx` ⚑
- `components/callback-banner.tsx`
- `components/forms/form-builder.tsx` ⚑
- `components/forms/form-onizleme.tsx` ⚑
- `components/kurulum/baslangic.tsx`
- `components/kurulum/kurulum-sihirbazi.tsx` ⚑
- `components/kurulum/kurulum-sonucu.tsx`
- `components/kurulum/platform-adimi.tsx`
- `components/kurulum/sihirbaz-rayi.tsx` ⚑
- `components/kurulum/sirket-sec.tsx`
- `components/kurulum/tamamlama.tsx`
- `components/marka-merkezi/adim-icerigi.tsx`
- `components/marka-merkezi/beyan-alani.tsx`
- `components/marka-merkezi/bildirimler-bolumu.tsx`
- `components/marka-merkezi/firma-bilgileri.tsx`
- `components/marka-merkezi/hazirlama-karti.tsx`
- `components/marka-merkezi/kurulum-bolumu.tsx`
- `components/marka-merkezi/kurulum-listesi.tsx` ⚑
- `components/marka-merkezi/kurulum-yardimcilari.tsx`
- `components/marka-merkezi/olcum-bolumu.tsx`
- `components/marka-merkezi/workspace-bilgileri.tsx`
- `components/rehber/adim-amac-nerede.tsx`
- `components/rehber/adim-butce.tsx`
- `components/rehber/adim-kime.tsx`
- `components/rehber/adim-kontrol.tsx`
- `components/rehber/adim-ortak.tsx`
- `components/rehber/adim-reklam.tsx`
- `components/rehber/ikonlar.tsx`
- `components/rehber/meta-dalga3.tsx`
- `components/rehber/rehber-ekrani.tsx` ⚑
- `components/rehber/rehber-girisi.tsx` ⚑
- `components/rehber/set-kartlari.tsx`
- `components/rehber/stratejiden-kutusu.tsx`
- `components/strateji/arama-bolumu.tsx`
- `components/strateji/butce-bolumu.tsx`
- `components/strateji/matris-bolumu.tsx`
- `components/strateji/ortak.tsx`
- `components/strateji/plan-ekrani.tsx`
- `components/strateji/sunum-bolumu.tsx`
- `components/strateji/v2/adim-gonder.tsx` ⚑
- `components/strateji/v2/adim-inceleme.tsx` ⚑
- `components/strateji/v2/adim-plan.tsx`
- `components/strateji/v2/adimlar-soru.tsx` ⚑
- `components/strateji/v2/akis-cerceve.tsx`
- `components/strateji/v2/belge.tsx` ⚑
- `components/strateji/v2/giris.tsx`
- `components/strateji/v2/gonder.tsx`
- `components/strateji/v2/kalem-duzenleyici.tsx`
- `components/strateji/v2/kelime-bolumu.tsx`
- `components/strateji/v2/kurulum.tsx`
- `components/strateji/v2/onay-kutusu.tsx`
- `components/strateji/v2/ortak.tsx`
- `components/strateji/v2/rapor-ekrani.tsx`
- `components/strateji/v2/sihirbaz.tsx`
- `components/strateji/v2/tutar.tsx`
- `components/sync/senkron-durumu.tsx`
- `components/tenancy/danisman-ata.tsx` ⚑
- `components/tenancy/iki-adim-sirket-ayari.tsx` ⚑
- `components/tenancy/musteri-bilgi-formu.tsx` ⚑
- `components/tenancy/musteri-detay.tsx` ⚑
- `components/tenancy/special-category-picker.tsx` ⚑
- `components/tenancy/team-manager.tsx` ⚑
- `components/ust-hesap/ust-hesap-karti.tsx`
- `components/ust-hesap/ust-hesap-yonetimi.tsx` ⚑
- `components/workspace-gec.tsx`

#### Grup 3 · İyileştir ve Base (37 dosya)

- `app/(dashboard)/iyilestir/page.tsx` ⚑
- `app/(dashboard)/kurallar/page.tsx`
- `app/(dashboard)/kutuphane/bilgi-bankasi/page.tsx`
- `app/(dashboard)/kutuphane/formlar/page.tsx`
- `app/(dashboard)/kutuphane/gorseller/page.tsx`
- `app/(dashboard)/kutuphane/kreatifler/page.tsx`
- `app/(dashboard)/marka-merkezi/page.tsx`
- `app/(dashboard)/varliklar/page.tsx`
- `components/assets/asset-library.tsx`
- `components/bilgi-bankasi/logo-sekmesi.tsx`
- `components/bilgi-bankasi/marka-sekmesi.tsx`
- `components/bilgi-bankasi/metin-sekmesi.tsx` ⚑
- `components/connections/youtube-kanal-bul.tsx`
- `components/iyilestir/asistan-sekmesi.tsx`
- `components/iyilestir/etki-sekmesi.tsx`
- `components/iyilestir/kreatifler-sekmesi.tsx`
- `components/iyilestir/onay-penceresi.tsx`
- `components/iyilestir/oneri-karti.tsx`
- `components/iyilestir/oneriler-sekmesi.tsx`
- `components/iyilestir/sinyal-pencereleri.tsx`
- `components/iyilestir/sinyaller-sekmesi.tsx`
- `components/marka-merkezi/eski-capa.tsx`
- `components/marka-merkezi/ic-menu.tsx`
- `components/marka-merkezi/ilgi-secici.tsx`
- `components/marka-merkezi/kitleler-bolumu.tsx`
- `components/marka-merkezi/ozel-kitle-secici.tsx`
- `components/marka-merkezi/varliklar/creative-editor.tsx` ⚑
- `components/marka-merkezi/varliklar/creative-library.tsx` ⚑
- `components/marka-merkezi/varliklar/formlar.tsx` ⚑
- `components/marka-merkezi/varliklar/gorseller.tsx`
- `components/marka-merkezi/varliklar/isleyen-kreatifler.tsx`
- `components/marka-merkezi/varliklar/kreatifler.tsx`
- `components/marka-merkezi/veri-kaynaklari.tsx`
- `components/rules/kurallar-icerik.tsx`
- `components/rules/rule-controls.tsx` ⚑
- `components/rules/rule-editor.tsx` ⚑
- `components/tenancy/bagli-kanallar.tsx`

#### Grup 4 · Ayarlar ve hesap (34 dosya)

- `app/(dashboard)/ayarlar/baglantilar/page.tsx`
- `app/(dashboard)/ayarlar/e-posta/page.tsx`
- `app/(dashboard)/ayarlar/ekip/page.tsx`
- `app/(dashboard)/ayarlar/hesabim/page.tsx`
- `app/(dashboard)/ayarlar/musteriler/[id]/ekip/page.tsx`
- `app/(dashboard)/ayarlar/musteriler/[id]/kanallar/page.tsx`
- `app/(dashboard)/ayarlar/musteriler/page.tsx`
- `app/(dashboard)/ayarlar/okuma-api/page.tsx`
- `app/(dashboard)/ayarlar/senkronizasyon/page.tsx`
- `app/(dashboard)/ayarlar/sirketler/page.tsx`
- `app/(dashboard)/ayarlar/ust-hesap/page.tsx`
- `app/(dashboard)/ayarlar/ust-hesaplar/page.tsx`
- `app/(dashboard)/hesabim/page.tsx`
- `components/auth/alan.tsx`
- `components/ayar-kapsam.tsx`
- `components/connections/havuz-kartlari.tsx` ⚑
- `components/connections/izlenen-hesaplar.tsx`
- `components/connections/kanal-kartlari.tsx` ⚑
- `components/connections/toplu-tazeleme.tsx` ⚑
- `components/connections/youtube-kanal-ekle.tsx` ⚑
- `components/email/eposta-ayarlari.tsx` ⚑
- `components/hesap/iki-adim-paneli.tsx` ⚑
- `components/hesap/iki-adim-parcalari.tsx` ⚑
- `components/okuma-api/okuma-api-paneli.tsx` ⚑
- `components/tenancy/arsiv-listesi.tsx`
- `components/tenancy/rol-matrisi.tsx`
- `components/tenancy/team-screen.tsx` ⚑
- `components/tenancy/ust-hesap-ekibi.tsx` ⚑
- `components/tenancy/workspace-bolumu.tsx`
- `components/tenancy/workspace-erisimi.tsx`
- `components/tenancy/workspace-satirlari.tsx`
- `components/ust-hesap/sirket-duzenle.tsx` ⚑
- `components/ust-hesap/sirket-sil.tsx` ⚑
- `components/ust-hesap/ust-hesap-ekrani.tsx` ⚑
