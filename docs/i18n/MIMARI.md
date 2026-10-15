# İki dilli Advetics (Türkçe / English) — MİMARİ

Durum: **Ajan 1 taslağı, 2026-10-15. Çelişki tablosu kullanıcıyla
kapanmadan koda geçilmez.**

Kullanıcının isteği (verbatim): *"advetics in ingilizceye dönen halini
yapacağız baştan sona her giriş yaparken siteye girerken dil soracak
Türkçe - İngilizce"*. Tetikleyici: Google OAuth doğrulaması 2026-10-15'te
başvuruldu; demo video İngilizce anlatımlı ama ekranlar Türkçeydi.

## 0. Ölçülen yüzey (2026-10-15, yorumlar ayıklanmış kaynakta, Türkçe harf
taşıyan dizge sayısı; Türkçe harfi olmayan dizgeler sayılmadı, gerçek
sayı daha yüksek)

| Yer | Dosya | Türkçe dizge ≈ |
|---|---:|---:|
| `app/(site)` tanıtım | 9 | 80 (+ `components/landing/site-icerik.ts`) |
| `app/(legal)` yasal | 5 | 92 (1.480 satır metin) |
| `app/(auth)` giriş | 3 | 11 (+ `components/auth/*`) |
| `app/(dashboard)` sayfalar | 41 | 267 |
| `apps/web/src/components` | 242 | **3.584** |
| `apps/web/src/lib` | 44 | 388 |
| `apps/api/src` (hata, mail, PDF, AI istemi) | 386 | **3.812** |
| `packages/shared/src` (etiketler, Zod mesajları) | 174 | **1.983** |
| `tr-TR` biçimlendirme çağrısı | 118 dosya | 124 |

**≈10.000 dizge.** Tek commit'te yapılamaz; §6'daki dalgalarla, her dalga
yeşil ve kendi başına canlıya alınabilir. Dalgalar arasında "yarı İngilizce
panel" görünür olur — §5'teki bekçi bunu SAYAR, gizlemez.

Mevcut zemin: `users.locale VARCHAR(10) DEFAULT 'tr'` zaten var (hiç
okunmuyor, `auth.service.ts` kayıtta sabit `'tr'` yazıyor). API hata gövdesi
zaten `{ code, message }` taşıyor (`all-exceptions.filter.ts`).

## 1. Çelişki tablosu — KULLANICIYLA KAPATILACAK

| # | Konu | Brief / depo | Öneri (gerekçe) |
|---|---|---|---|
| Ç1 | **Dil ne zaman sorulur** | Brief: "her giriş yaparken siteye girerken dil soracak". Her girişte engelleyici soru = her gün bir tıklama angarya (§5 ölçüt: kullanım kolaylığı) | **İlk ziyarette bir kez** tam ekran seçim (çerezi olmayan herkes). Giriş ekranında dil seçici HER ZAMAN görünür (üstte TR · EN), ama soru olarak değil. Hesabım'dan değişir. Seçim hiç yapılmadıysa tarayıcı diline göre ÖN SEÇİLİ gelir, ama yine sorulur. |
| Ç2 | **URL'de dil öneki** (`/en/...`) | Panel yolları Türkçe (`/raporlar`, `/marka-merkezi`), 30+ elle yazılı yol listesi (middleware, `panel-adresleri`) | **Önek YOK.** Dil çerezde (`adv_dil`) ve profilde. Paylaşılabilir bağlantı için `?dil=en` çerezi kurup kendini temizliyor (Google incelemecisine verilecek link: `advetics.com/?dil=en`, `/gizlilik?dil=en`). Bedeli: İngilizce sitenin ayrı arama motoru dizini olmaz (hreflang yok). Önek istenirse yalnız `(site)`+`(legal)` için sonradan eklenebilir; panelde hiçbir zaman. |
| Ç3 | **Yol adları** | Yollar Türkçe (`/gizlilik`, `/kosullar`, `/veri-silme`). Google Cloud konsoluna verilen gizlilik/koşullar adresleri bunlar | **Yollar Türkçe kalır**, İngilizce takma ad (`/privacy`, `/terms`, `/data-deletion`, `/cookies`) aynı sayfaya `?dil=en` ile yönlenir. OAuth başvurusundaki adresler değişmez (değişirse inceleme yeniden başlayabilir). |
| Ç4 | **Kütüphane** | Panelde bağımlılık 7 tane, bilinçli az (`next-intl` yok) | **Kendi sözlüğümüz** (~150 satır): `tr` sözlüğü tek kaynak, `en` onun TİPİNİ karşılamak zorunda → eksik anahtar DERLEMEDE kırılır. `next-intl`'in getirdiği şeylerin (yol öneki, ICU çoğul) çoğuna ihtiyaç yok; Türkçe/İngilizce çoğulu tek kural (`{n} hesap` / `{n} account(s)`) ve `Intl.PluralRules` ile çözülüyor. |
| Ç5 | **Metinler nerede** | Shared hem panelin hem API'nin etiketlerini taşıyor (`ENTITY_LEVEL_LABELS`, Zod mesajları) | Üç ev: **`packages/shared/src/dil/`** (iki tarafın ortak etiketleri: platform, seviye, durum, Zod hata mesajları), **`apps/web/src/dil/`** (panel ekran metni, ad alanı başına dosya: `menu`, `raporlar`, `strateji`...), **`apps/api/src/dil/`** (hata, mail, PDF). Bir dizge İKİ evde olamaz (bekçi tarar). |
| Ç6 | **API hata dili** | API ~3.800 dizge, `message` alanında Türkçe | API **istek dilini** okur: panel her istekte `Accept-Language: tr|en` gönderir (`serverApiFetch`/istemci aynı üreticiden), yoksa `users.locale`, yoksa `tr`. `code` değişmez (panel davranışı koda bağlı kalır, dile değil). Kuyruktaki işler (worker) istek taşımadığı için dili kaydın sahibinden okur. |
| Ç7 | **Platformdan gelen ham mesaj** | Meta/Google hatası kendi dilinde geliyor (`PLATFORM_*`) | **Çevrilmez.** Bizim cümlemiz çevrilir, platform cümlesi tırnak içinde aynen kalır ("Meta: …"). Çevirmek teşhisi bozar (Meta kataloğunda aranan metin o). |
| Ç8 | **Rapor PDF'i ve rapor maili dili** | Müşteriye giden belge; gönderen ajans kullanıcısı, okuyan müşteri | **Alıcı belirler:** workspace'e yeni alan `rapor_dili` (`tr` varsayılan), Marka Merkezi › Workspace bilgileri'nde, rapor alıcılarının yanında. Panelde önizleme de o dille çizilir (önizleme yalan söylemesin). Zamanlanmış gönderim de onu okur. Migration gerekiyor. |
| Ç9 | **İşlem mailleri** (davet, şifre sıfırlama, 2FA, uyarı) | | **Kişinin dili** (`users.locale`). Davet edilen henüz kullanıcı değil → davet edenin seçtiği dil (davet formunda TR/EN, varsayılan davet edenin dili). |
| Ç10 | **Yapay zekâ çıktısı** (AdvStrategy planı, AdvCampaign sohbeti, reklam metni, kitle önerisi) | Gemini istemleri Türkçe; çıktı veritabanına yazılıyor ve müşteri de okuyor | İkiye ayrılır: (a) **reklam metni** = reklamın HEDEF KİTLESİNİN dili, arayüz dili DEĞİL (İngilizce panel kullanan ajans Türk pazarına Türkçe reklam yazar) → workspace'te `reklam_dili` (`tr` varsayılan). (b) **açıklama/gerekçe metni** (plan anlatımı, sohbet) = üretildiği andaki kullanıcının dili, kayıtla saklanır; sonradan dil değişince eski plan yeniden üretilmez, üstünde "Türkçe üretildi" rozeti çıkar. |
| Ç11 | **Kullanıcının girdiği veri** (kampanya adı, workspace adı, kural adı) | | Çevrilmez. |
| Ç12 | **Sayı/tarih/para biçimi** | 124 `tr-TR` çağrısı elle | Tek biçimleyici `bicim(dil)` (shared): `tr-TR`/`en-US` sayı ve tarih. **Para birimi hesabın birimi kalır** (TRY hesap İngilizcede de ₺ ve `₺1,234.50`); dile göre çevrilmez. Tarih giriş alanları: İngilizcede de GG.AA.YYYY mı? → öneri: `en` = `Oct 15, 2026` gösterim, giriş alanı tarayıcının yerel tarih seçicisi. `YYYY-MM-DD` saklama kuralı değişmez. |
| Ç13 | **Yasal metinlerin İngilizcesi** | Gizlilik/koşullar hukuki belge | İngilizce çeviri + üstte "Türkçe sürüm esastır" notu. **Hukukçu gözden geçirmesi kullanıcının işi**; çeviriyi biz yapıyoruz, bağlayıcılığını iddia etmiyoruz. (Google incelemesi İngilizce gizlilik politikası okumak isteyebilir; bu ilk dalgada.) |
| Ç14 | **Terim sözlüğü** | Ürün adları ve Türkçe iş terimleri | AdvStrategy, AdvCampaign, Advetics, Base **çevrilmez**. Marka Merkezi → *Brand Center*, Genel Bakış → *Overview*, Reklam Yöneticisi → *Ads Manager*, Akıllı Boost → *Smart Boost*, Potansiyel Müşteriler → *Leads*, İyileştir → *Optimize*, Planla/Oluştur/Yönet → *Plan/Create/Manage*, workspace → *workspace*, şirket → *company*. Google Ads'in kendi İngilizce terimleri tercih edilir (kullanım mantığı Google Ads). Tam sözlük `docs/i18n/SOZLUK.md`, kullanıcı onaylar. |
| Ç15 | **CLAUDE.md "Arayüz Türkçe ve iş dilinde"** | Kural | Genişler: "Arayüz Türkçe VE İngilizce; kaynak dil Türkçe; yorumlar, kod içi adlar, commit Türkçe kalır." Ayrıca yeni ekran yazan herkes iki dili birden yazar (bekçi zorlar). |

## 2. Dil nasıl belirlenir (sıra)

1. `?dil=tr|en` sorgusu → çerezi yazar, adresten silinir (yönlendirme).
2. Giriş yapmış kullanıcı → `users.locale` (giriş anında çereze kopyalanır;
   başka cihazdaki seçim taşınır).
3. `adv_dil` çerezi (1 yıl, birinci taraf, zorunlu kategori — çerez
   politikasındaki `CEREZLER` listesine eklenir; `cerez-politikasi`
   bekçisi zaten listeyi tarıyor).
4. Hiçbiri yoksa: **seçim ekranı** (Ç1), `Accept-Language` ön seçim için.

Çerez ile profil ayrışırsa (girişsiz EN seçti, profili TR) **giriş anında
seçilen** kazanır ve profile yazılır: kişinin son eylemi.

Sunucu bileşeni dili `cookies()`'ten okur; istemci bileşeni kök
`<DilSaglayici>` bağlamından. `<html lang>` dile göre (bugün sabit `tr`).

## 3. Sözlük biçimi

```ts
// apps/web/src/dil/menu.ts
export const tr = {
  genelBakis: 'Genel Bakış',
  hesapSayisi: (n: number) => `${n} hesap`,
} as const;
export const en: Sozluk<typeof tr> = {
  genelBakis: 'Overview',
  hesapSayisi: (n) => (n === 1 ? '1 account' : `${n} accounts`),
};
```

- Anahtar Türkçe kod adı (proje dili), değer metin. Fonksiyon değer
  interpolasyon ve çoğul için; ICU dizgesi yok (çalışma anında
  çözümleyici = sessiz hata yüzeyi).
- `Sozluk<T>` aynı anahtar kümesini ve aynı fonksiyon imzalarını şart
  koşar → eksik/fazla anahtar `tsc`'de kırılır.
- Kullanım: `const d = useDil('menu'); d.genelBakis` (istemci),
  `const d = await dilAl('menu')` (sunucu). Anahtar adı hiçbir zaman ekrana
  düşmez: eksik anahtar derlenmez, çalışma anında `undefined` gelirse
  **Türkçe değere düşer ve geliştirmede konsola yazar** (boş alan yerine).

## 4. API tarafı

- `DilInterceptor`: `Accept-Language` → `istek.dil`; `users.locale` geri
  dönüş. `AllExceptionsFilter` mesajı koddan sözlükte arar; servislerde
  `new BadRequestException('…')` dizgeleri dalga dalga
  `hata('baglantilar.sahipDegil', istek.dil)` biçimine çevrilir.
- Zod şema mesajları shared'da: `z.string().min(1, m('zorunlu'))` yerine
  hata haritası (`z.setErrorMap`) dile göre — şema dosyaları dokunulmadan.
- PDF: `rapor-pdf.service.ts` sabit başlıkları sözlükten, dil
  parametreyle (Ç8). DejaVu Sans İngilizceyi zaten kapsıyor.
- Mail: `rapor-mail.ts` ve işlem mailleri sözlükten (Ç8/Ç9).

## 5. Bekçiler (sessiz hata kuralları)

| Test | Ne kilitler | Mutasyon |
|---|---|---|
| `dil-anahtarlari.spec.ts` | Her ad alanında `tr` ve `en` anahtar kümesi eşit, hiçbir değer boş dizge değil, `en` değeri `tr` ile aynı değil (çevrilmemiş kopya) — istisna listesi: marka adları | bir `en` anahtarını sil, düşsün |
| `dil-tarama.spec.ts` (`tasarim-sistemi.spec.ts` deseni) | `apps/web/src/{app,components,lib}` yorumsuz kaynağında JSX metni ve dizge içinde Türkçe harf sayısı DOSYA DOSYA; istisna listesi (`dil-tarama.istisnalar.ts`) YALNIZ KÜÇÜLÜR (sayı artarsa da, istisnadaki dosya temizlenip listede kalırsa da düşer) | yeni bir dosyaya `'Kaydet'` yaz, düşsün |
| aynı tarama, `apps/api/src` için | `*Exception('…')` ve mail/PDF dizgeleri | |
| `dil-belirleme.spec.ts` | §2 sırası (sorgu > profil > çerez > seçim) saf fonksiyonda | |
| `cerez-politikasi` mevcut bekçisi | `adv_dil` listede | |
| `rapor-dili.spec.ts` | PDF ve mail aynı dili kullanıyor (önizleme ≠ ek hatası, bkz. CLAUDE.md "aynı belgeyi isteyen her yol aynı sorguyu kurmalı") | |

Taramanın Türkçe harfe dayanması bilinçli bir kısıt: "Kaydet", "Ekle" gibi
Türkçe harfsiz dizgeleri kaçırır. Ek olarak sözlüksüz JSX metin düğümü
sayılır (`>Kaydet<`); ikisi birlikte istisna listesine girer.

## 6. Dalgalar (her biri ayrı commit seti, ayrı tasarım denetimi)

| Dalga | Kapsam | Neden bu sırada |
|---|---|---|
| D0 | Altyapı: sözlük tipi, `DilSaglayici`, çerez, `?dil=`, `<html lang>`, bekçiler (istisna listesi bugünkü hâlin TAMAMI), **dil seçim ekranı**, Hesabım'da dil, giriş ekranında TR·EN | Her şey buna bağlı |
| D1 | Tanıtım sitesi + yasal 4 sayfa + giriş/şifre ekranları + çerez bildirimi | Google OAuth incelemesi bunlara bakıyor |
| D2 | Panel kabuğu: menü (`nav-sections`), üst çubuk, `components/ui/*`, boş/hata durumları, Genel Bakış, Ayarlar (bağlantı ekranı — OAuth demosunun gösterdiği yer) | Her sayfada görünen yüzey |
| D3 | Modül modül: Reklam Yöneticisi → Raporlar → Marka Merkezi/Varlıklar → AdvStrategy → AdvCampaign → Akıllı Boost → Kurallar/İyileştir → Bütçe → Potansiyel Müşteriler | Kullanım sıklığına göre |
| D4 | Shared etiketleri + Zod hata haritası + API hata mesajları (`AllExceptionsFilter` ve servisler) | Panel ekranları hazırken hata cümleleri hâlâ Türkçe kalmasın |
| D5 | Rapor PDF'i + rapor maili + işlem mailleri + `rapor_dili`/`reklam_dili` migration'ı + AI istemleri | Migration ve müşteriye giden belge: en riskli, en son |

Her dalganın sonunda: `./scripts/dogrula.sh` yeşil, istisna listesi
küçülmüş, iki dilde masaüstü + mobil ekran görüntüsü.

## 7. ÖLÇÜLMEYEN / açık

- Çeviri kalitesi: çeviriyi Claude yapıyor; reklamcılık terimleri §1 Ç14
  sözlüğüyle sabitleniyor. Ana dili İngilizce olan biri gözden
  geçirmedi.
- Gemini'nin İngilizce istemle aynı kalitede strateji üretip üretmediği
  ölçülmedi (D5'te tek workspace'te karşılaştırılacak).
- Google OAuth incelemecisinin İngilizce ekran isteyip istemediği
  bilinmiyor; D1 bu varsayımla öne alındı.
