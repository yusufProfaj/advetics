# Hedef kitleler: Reklam Yöneticisi'nde yönetim, reklam kurarken seçim

> Ajan 1 (Mimar) çıktısı, 2026-10-20. Kaynak görev (Armağan Bey): Reklam
> Yöneticisi'nde hedef kitle ekle/düzenle; reklam kurarken kayıtlı kitleden
> seç; her kitlenin platformu (Meta / Google) listede belli olsun ve
> süzülebilsin. Kütüphane + raporlama tarafı ayrı görev (#85776).
> Ekran taslağı: [`marka/taslaklar/hedef-kitleler.html`](../marka/taslaklar/hedef-kitleler.html).

## 0. Kullanıcı kararları (2026-10-20)

1. **Her kitle TEK platform.** Kitle kaydedilirken Meta ya da Google seçilir,
   sonra değişmez (ilgi/kitle kimlikleri platforma özel). Bugün iki
   platformun verisini birlikte taşıyan kayıtlar migration'da İKİYE bölünür.
2. **Seçilen kitlenin TAMAMI platforma gider:** konum, yaş, cinsiyet + Meta'da
   ilgi alanları ve özel kitleler, Google'da ilgi/satın alma niyeti
   kategorileri ve arama kelimeleri (özel segment). Bu yeni bir yazma yolu:
   canlıda iki platformda GÖZLE doğrulanmadan bitmiş sayılmaz.

## 1. Bugünkü durum (ölçüldü, kod okundu)

| Parça | Bugün |
|---|---|
| Veri | `audience_templates` (`AudienceTemplate`): ortak konum/yaş/cinsiyet + Meta `interests`, `ozel_kitleler` + Google `google_hedefleri {ilgiler, kelimeler}`. Platform kolonu YOK. Konumlar Meta anahtarı. |
| API | `GET/POST/PUT/DELETE /audience-templates`, `POST /setten`, `PUT /varsayilan` (`tenancy/kitle-sablonu.*`), kapı `kitle.yaz` = `client.write`. |
| Liste/düzenleme ekranı | Base › Varlıklar › Kitleler (`marka-merkezi/kitleler-bolumu.tsx`, `YanPanel` + `KitleFormu`). Platform süzgeci yok. |
| Reklam Yöneticisi | `?seviye=kitle` sekmesi = aynı hedeflemeli setlerin PERFORMANSI (`kitle-performans-tablosu.tsx`, `/metrics/kitleler`); kayıtlı kitleleri listelemiyor, ekleme/düzenleme yok. Yalnız tek workspace seçiliyken. |
| Reklam kurma (AdvCampaign "Kime", `adim-kime.tsx`) | Kitle seçici YOK. Varsayılan kitlenin yalnız KONUMLARI önden dolar (`hazirlik.service.ts` → `rehber-mantik.ts` `onDoldurma`). Rehber alanlarında ilgi/özel kitle/cinsiyet/Google kitlesi YOK. |
| Meta yayını | `hedeflemeUret` (`shared/reklam/meta/hedefleme.ts`): konum, `age_min`, `age_range`, `genders`; `advantage_audience: 1` (rehber). İlgi ve özel kitle yazılmıyor. |
| Google yayını | `derle-google.ts`: SEARCH (anahtar kelime), DEMAND_GEN (reklam grubunda yaş boyutlu tek AUDIENCE), PERFORMANCE_MAX. İlgi kategorisi ve özel segment yazılmıyor. |

## 2. Çelişki tablosu — ajanlar başlamadan kullanıcıyla kapanacak

| # | Brief / karar | Depoyla çelişen yer | Önerilen kapanış |
|---|---|---|---|
| Ç1 | "Hızlı reklam oluşturucu" | Panelde bu adla ekran yok; reklam kurmanın tek yolu AdvCampaign (`/reklam`, ürün kararı). Akıllı Boost ön ayarında şablon seçimi zaten var. | Kitle seçimi AdvCampaign › 3. adım "Kime"ye eklenir. |
| Ç2 | Kitle Reklam Yöneticisi'nde yönetilsin | Bugün evi Base › Varlıklar › Kitleler (ürün kararı: kitle "seçilen malzeme"). İki ekranda iki ayrı form sessizce ayrışır. | Reklam Yöneticisi › Hedef kitleler ana ev olur ("Kayıtlı kitleler" + "Performans" alt sekmeleri); Varlıklar › Kitleler AYNI bileşeni gösterir (tek `KitleFormu`), ayrı kod yok. Menü değişmez. |
| Ç3 | Meta'ya ilgi + özel kitle gitsin | Rehber `advantage_audience: 1` gönderiyor: ilgi alanları ve DAHİL edilen kitleler Meta'da sert sınır değil ÖNERİ olur; kitle dışına çıkılabilir. Kapatmak (sert sınır) verimi düşürür ve bazı amaçlarda Meta reddedebilir. | Advantage+ AÇIK kalır, ekranda "öneri olarak kullanılır" yazar (taslakta var). Hariç tutulan özel kitlenin Advantage+ altında da dışarıda kaldığı CANLIDA ÖLÇÜLECEK; ölçülemezse kısıt kullanıcıya söylenir. |
| Ç4 | Google'a ilgi + kelime gitsin | Arama (SEARCH) kampanyasında kitle yalnız "gözlem"dir, gösterimi daraltmaz; reklamı anahtar kelime gösterir. Kitle kelimeleri (özel segment) ile rehberin arama anahtar kelimeleri farklı şey. | DEMAND_GEN: mevcut yaş AUDIENCE'ına ilgi + özel segment boyutu eklenir. PMAX: asset group kitle sinyali. SEARCH: kitle YAZILMAZ, ekranda söylenir. Kitle kelimeleri arama anahtar kelimelerine kopyalanmaz. |
| Ç5 | Mevcut kayıtları ikiye bölme | Varsayılan kitle (`client_profiles.varsayilan_kitle_id`), Akıllı Boost ön ayarları ve strateji kitle kimliği tutuyor. | Bölmede ESKİ satır Meta kalır (kimlik değişmez, bağlar kırılmaz), Google verisi yeni satıra "· Google" adıyla taşınır. Yalnız Google verisi olan satır (Meta alanı boş) bölünmez, Google olur. Bölünen sayı migration çıktısında yazılır. |
| Ç6 | Kitle seçilince reklam | Kitle sonradan düzenlenirse taslak/yayın sessizce değişmemeli. | Seçim ANINDA değerler rehbere KOPYALANIR (kaynak `kitle`, kitle kimliği + adı saklanır). Kitle sonradan değişirse taslakta "kitle güncellendi, yenile" notu (2. tur, isteğe bağlı). |
| Ç7 | Konum | Kitle konumu Meta anahtarı; Google kitlesinde de aynı uzay. | Google kitlesinin konumu rehberde bugünkü eşleme yolundan Google'a çevrilir (`konum_esle`); eşlenemeyen konum bugünkü gibi yazılır. |
| Ç8 | Özel kitle hesaba bağlı | Meta özel kitlesi tek reklam hesabında geçerli. | Seçim anında rehberin Meta hesabıyla kıyaslanır; uymuyorsa seçilemez ve NEDENİ yazar (taslakta uyarı). Yayında derleyici de reddeder. |
| Ç9 | Rehber iki platforma birden yayın yapabiliyor | Tek kitle tek platform. | Kime adımında açık her platform için ayrı seçici (Meta kitlesi / Google kitlesi). Ortak konum/yaş alanı yerine platforma göre ayrı değer gerekebilir (taslakta "Meta: 30-55 · Google: 25-65+"). Bu, rehber alanlarına platform bazlı yaş/konum eklemek demek: **en büyük kalem**, Ajan 2'den önce kullanıcı onayı. **KAPANDI (2026-10-20, kullanıcı "B"):** `googleKonumlari` + `googleYasAraligi`, isteğe bağlı ve varsayılansız; Google yaşı yalnız Talep Yaratma'da. |

## 3. Sözleşme (Ajan 2 ve 3 buradan okur, tip tanımlamaz)

`packages/shared/src/schemas/kitle-sablonu.schema.ts`:
- `KITLE_PLATFORMLARI = ['meta', 'google'] as const`; giriş şemasına
  `platform` (ZORUNLU yeni kayıtta, güncellemede değiştirilemez).
- `superRefine`: Meta kitlesinde `google` boş olmalı; Google kitlesinde
  `interests` ve `ozelKitleler` boş olmalı (platform dışı alan sessizce
  atılmaz, reddedilir).
- `KitleSablonuRecord.platform`.

`packages/shared/src/reklam/rehber/alanlar.ts` (rehber alanları, isteğe bağlı
ve varsayılansız; kayıtlı rehberlerin özeti değişmez):
- `metaKitlesi: { kitleId, ad, cinsiyet, ilgiler[], ozelKitleler[] } | null`
- `googleKitlesi: { kitleId, ad, ilgiler[], kelimeler[] } | null`
- Ç9 (onaylandı): `googleYasAraligi`, `googleKonumlari` (yoksa Google ortak değerleri kullanır, `googleEtkinKonumlar`).

Derleyiciler:
- `hedeflemeUret`: `flexible_spec[{interests}]`, `custom_audiences`,
  `excluded_custom_audiences`, `genders`. Geri okuma (`yanki.ts`) bu
  anahtarları kıyaslar.
- `derle-google.ts`: DEMAND_GEN kitle boyutları (`userInterest`,
  `customAudience`), PMAX kitle sinyali; özel segment (`CustomAudience`,
  tür SEARCH terimleri) yayından önce oluşturulur ve yeniden kullanılır.
  Geri okuma (`google-yayin.ts`) boyut sayılarını kıyaslar.

API: `GET /audience-templates?clientId&platform=` (süzgeç sunucuda da),
liste yanıtı `{ kayitlar, toplam }` (sessiz kesme yok).

## 4. Yetki ve RLS

Değişmez: okuma `client.read`, yazma `kitle.yaz` (`client.write`).
`audience_templates` RLS politikası aynı; migration yalnız kolon + bölme.
Ajan 4: bölme migration'ının RLS altında başka şirketin satırına
dokunmadığı (`SET ROLE` + `RETURNING`) ve platform dışı alanın reddi.

## 5. Ölçüm listesi (canlıda, Ajan 5)

1. Meta: ilgi + dahil kitle + hariç kitle ile DURAKLATILMIŞ kurulan setin
   `targeting`'i Ads Manager'da ve geri okumada aynı mı; Advantage+ altında
   hariç kitle korunuyor mu.
2. Google DEMAND_GEN: kitlede yaş + ilgi + özel segment boyutları görünüyor mu;
   özel segment ikinci yayında yeniden mi kullanılıyor (çoğalmıyor mu).
3. Google PMAX: kitle sinyali asset group'ta görünüyor mu.
4. Migration: bölünen kayıt sayısı, varsayılan kitle ve Boost ön ayarı bağları.

## 6. Ajan sırası

1 (bu belge + taslak) → kullanıcı onayı (taslak + Ç1–Ç9) → 2 ‖ 3 → 4 → 5 → 6.
Ajan 2 iki parça: (a) platform kolonu + bölme migration + API süzgeci,
(b) rehber alanları + Meta/Google derleyici + geri okuma. (a) tek başına
deploy edilebilir (Reklam Yöneticisi ekranı onunla açılır); (b) canlı ölçüm
ister.
