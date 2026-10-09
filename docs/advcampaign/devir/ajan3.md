# Ajan 3 · Ön Yüz — devir notu (AdvCampaign Rehberi, `/reklam`)

> 2026-10-10 · commit EDİLMEDİ · sözleşme `packages/shared/src/reklam/rehber/` (dokunulmadı), `apps/api` dokunulmadı.

## Durum

- `corepack pnpm --filter @advetics/web typecheck` → **temiz**.
- `cd apps/web && npx vitest run` → **1389 / 1390**. Tek kırmızı `src/terminoloji.spec.ts`:
  Ajan 2'nin yeni dosyası `apps/api/src/modules/reklam/derleyici/rehber-sozlesme.spec.ts` içindeki
  `it('... tiresiz müşteri kimliği ...')` cümlesi sınıflandırılmamış "müşteri" sayılıyor. **Ajan 2'ye**: o
  test adını değiştir ya da `terminoloji.spec.ts` listesine sınıflandır. nav-sections, panel-tasarim,
  istemci-siniri, iyilestir yeşil.
- Rehber testleri: `rehber-mantik.spec.ts` (35) + `rehber-kaydedici.spec.ts` (8). Mutasyonla
  doğrulandı (5 mutasyon, hepsi düştü): hata sonrası kuyruğun silinmesi, tek uçuş kuralının kalkması,
  kategori sorusunun "cevaplanmış" gelmesi, bayat provanın "geçti" sayılması, "listenin ilki"nin seçilmesi.

## Dosyalar

Yeni — `apps/web/src/components/rehber/`:

| Dosya | İş |
|---|---|
| `rehber.module.css` | Taslağın CSS'i birebir; `.kok` belirteçleri panel değişkenlerine bağlı, `:where(.kok button)` sıfır özgüllüklü reset. Sapmalar dosya başında yazılı. |
| `rehber-mantik.ts` | Saf kararlar: değişiklik birleştirme, yerel görüntü, öneri dört hâli, görünürlük (`platformGorunurMu` üzerinden), ray, yaş/kategori kilidi, para/tarih, prova bayatlığı, yayın adımları, önden doldurma, konum eşleme imzası. |
| `rehber-kaydedici.ts` | PUT kaydedicisi (600 ms debounce, aynı alan birleşir, tek uçuş, 409 → çatışma, hata kuyruğu korur, `simdi()` prova/yayın öncesi yazar). |
| `rehber-ekrani.tsx` | Odaklı kip kabuğu (fixed katman, `.panel`e portal), ray, mobil ilerleme, özet, "Yayından önce", prova/yayın/yoklama. |
| `adim-ortak.tsx`, `adim-amac-nerede.tsx`, `adim-kime.tsx`, `adim-reklam.tsx`, `adim-butce.tsx`, `adim-kontrol.tsx` | Altı adım + onay penceresi + son ekran. |
| `rehber-girisi.tsx` | Giriş (açık rehberler, "Yeni reklam") ve hata kartı. |
| `ikonlar.tsx` | Taslaktaki çizgi ikonlar. |
| `rehber-mantik.spec.ts`, `rehber-kaydedici.spec.ts` | Testler (saf mantık + kaynak taraması). |

Değişen: `app/(dashboard)/reklam/page.tsx` (giriş / `?rehber=`), `reklam/yeni/page.tsx` ve
`reklam/onizleme/page.tsx` (artık `/reklam`a yönlendirme), `components/iyilestir/asistan-sekmesi.tsx` ve
`lib/iyilestir.ts` (devir kartının metni, aşağıya bkz.).

## Kaldırılanlar

`apps/web/src/reklam/sohbet/`, `reklam/akis/`, `reklam/studyo/`, `reklam/ui.tsx`, `reklam/reklam-modulu.spec.ts`
(`git rm`, index'te). **KALDI:** `reklam/medya.ts` — rehberin yükleme yolu onu kullanıyor (`medyaYukle`,
`medyaOlc`). `lib/sohbet-metni.ts` + spec'i hiçbir yerden kullanılmıyor (kapsam dışıydı, dokunmadım).

## Gözle bakılan / bakılmayan

- **Gözle bakıldı (geçici harness, silindi):** API'siz Next dev sunucusunda sabit veriyle altı adım,
  onay penceresi ve son ekran masaüstünde taslakla YAN YANA karşılaştırıldı; mobil (375px) amaç
  kartları 2 sütun, üstte ilerleme, altta yapışkan Geri/Devam, yatay taşma yok. Prova → Yayınla →
  yoklama → son ekran zinciri `fetch` taklidiyle gezildi. Kayıt hatası göstergesi gerçek ağ
  hatasıyla görüldü.
- **Görülmedi / ölçülmedi:** gerçek API ile hiçbir uç (Ajan 2 paralel yazıyor); gerçek 409; konum
  araması ve `konum-esle`; görsel yükleme; metin/anahtar kelime önerisinin gerçek cevabı; karanlık
  tema; giriş ekranı **taslakta yoktu**, kullanıcı görmedi (Ajan 6'ya).

## Ajan 1'e — ilk turun bulguları ve kapanışları (2. tur, 2026-10-10)

Ajan 1 sözleşmeye ekledi; panel uygulandı:

| # | Bulgu | Durum |
|---|---|---|
| 1 | Form şablonu listesi | **Kapandı.** `RehberHazirligi.formSablonlari` → FORM'da seçici (`FormSecici`). `null` = "okunamadı" (yenile / Bağlantılar), `[]` = "bu sayfada kayıtlı form yok" + Meta'da bir kez oluşturma talimatı. Karar saf: `formSecimi`. |
| 2 | YouTube video listesi | **Kapandı.** `GET /reklam/rehber/youtube-videolari` → `VideoSecici`; dört hâl ayrı (kanal yok / okunuyor / boş + `bosNeden` / düştü + mesaj), kesilirse "N / toplam". Bağlantı yapıştırma yedek yol olarak kaldı. Karar saf: `videoListesiHali`. |
| 3 | `null` = sil karışıklığı | **Kapandı.** `Degisiklik.sil?: true`, `silme()` yardımcısı, adımlarda `sil(b, alan)`. Boşaltılan kutu (telefon, adres, bütçe, takvim, video, zorunlu seçiciler) SİLİYOR; "Instagram olmadan" ve "yaş aralığı yok" null DEĞER yazıyor. Kaydedici + `yerelAlanlar` testli, kaynak taramasıyla kilitli, mutasyonla doğrulandı. Platform kapatılınca hesabın boşaltılması YAPILMADI (geri açınca seçim kaybolurdu; sunucu kapalı platformun hesabını zaten yok sayıyor). |
| 4 | Liste toplamı | **Kapandı.** `RehberListesi`; girişte kesilirse "N / toplam gösteriliyor". |
| 5 | Son prova | **Kapandı.** Açılışta `GET /:id/prova`; bayatsa "yeniden prova et", okunamazsa sebebi yazılıyor. |
| 6 | `metin-oner` kayda yazıyor mu | **Kapandı:** yazmıyor; panel davranışı değişmedi. |
| 7 | Meta hesap numarası | **Kapandı.** `disKimlik` varsa seçicide "ad · numara". |
| 8 | `medyaKontrol` taşındı | **Kontrol edildi.** `reklam/medya.ts` zaten kökten (`@advetics/shared`) alıyordu; typecheck temiz. |
| 9 | İyileştir `advcampaign_devret` aracı (API) | **Açık, karar bekliyor.** Panel tarafı ilk turda düzeltildi. |

Testler 2. turdan sonra: panel 1393 / 1394. Tek kırmızı yine `terminoloji.spec.ts` ve yine API
dosyası: `apps/api/src/modules/reklam/rehber/rehber.service.spec.ts` içindeki
`it('hazırlık: Google hesabı müşteri numarasıyla, ...')` adı (**Ajan 2'ye**). Typecheck temiz.

## Bilinçli sapmalar (taslağa göre)

- Taslaktaki örnek sayılar (aylık 6.000 arama, "+90 507…" WhatsApp hattı) uydurulmuyor; yerine sayısız cümle.
- Konut uyarısı "konum 25 km'ye çekildi" demiyor: bu kural sözleşmede ve derleyicide yok. Yalnız yaş kilidi.
- Taslakta tür değişince tutar ×30 çevriliyordu; tahmin olduğu için çevrilmiyor.
- Hesap/sayfa/Instagram seçicileri ve "Kaldır", "+ Açıklama ekle", "Kendi kelimeni ekle", "Marka
  Merkezi'nden seç" taslakta yoktu; sözleşmenin zorunlu alanları için eklendi, taslağın sınıflarıyla.
- Google görsel rozeti yalnız görsel kullanan kurguda (Talep Yaratma görsel); Arama reklamında görsel yok.
- `deneme` açılışındaki platformda "Kurulacak" kutusu ve onay penceresi kurulumun duraklatılmış kalacağını söylüyor (taslakta yoktu).

## Açık kalanlar

- Gerçek API ile uçtan uca tur (Ajan 2 bitince) ve Ajan 6'nın canlı masaüstü + mobil denetimi.
- 2. turdaki form ve video seçicileri gözle GÖRÜLMEDİ (dev sunucusu kapatıldı); yalnız typecheck + testler.
- `REHBER_ACILIS` bugün her şeyi `deneme`/`kapali` tutuyor: ajans yöneticisi olmayan kullanıcı amaç
  listesini BOŞ görür (sebebi yazılı). Beklenen davranış, ama ilk canlı turda şaşırtmasın.
