# Dalga 2 · Ajan 2a: Meta derleyici (TELEFON, WHATSAPP, set kuralı)

Dal: `dalga2-meta-derleyici` (taban `caa7ce8`). Kapsam DALGA-2.md
"Ajan bölüşümü" madde 1.

## Ne yapıldı

1. **TELEFON ve WHATSAPP derleniyor** (`packages/shared/src/reklam/meta/derle.ts`).
   - Yeni `DERLEYICI_NIYETLERI = FORM, SITE, TELEFON, WHATSAPP`: `derleMeta`
     artık `NYT-OLCULMEDI` reddini buna göre veriyor.
   - CTA ve `link_data.link` niyete göre iki küçük fonksiyonda
     (`ctaDegeri`, `kreatifBaglantisi`). SITE dışı bir niyete `{ link:
     hedefAdres }` düşmesi düğmeyi web sayfasına çevirirdi; her dal açıkça
     yazılı.
   - WHATSAPP: CTA `{ type: WHATSAPP_MESSAGE, value: { app_destination:
     'WHATSAPP' } }`, bağlantı sabit `https://api.whatsapp.com/send`
     (`WHATSAPP_BAGLANTISI`, `WHATSAPP_CTA_DEGERI`). Numara gövdeye hiç
     girmiyor. Video fikrinde aynı CTA.
   - TELEFON: CTA `{ type: CALL_NOW, value: { link: 'tel:+90...' } }` (Meta
     Call Ads belgesi), `link_data.link` = `https://facebook.com/<sayfa>`
     (`sayfaAdresi`, bkz. ÖLÇÜLMEDİ). Numara yoksa ya da E.164 değilse ret
     `TEL-YOK`.
   - `DERLEYICI_SURUMU` 1.1.4 → **1.2.0** (eski provalar yeni gövdeyi
     kanıtlamaz).
   - Eski kurucu (`meta.provider.ts#buildCreativeSpec`) ile hizalama: API
     shared'ı okuyabilir, tersi olamaz; o yüzden kurucu değiştirilmedi,
     `derle.spec.ts` eski kurucunun kaynağında aynı sabit bağlantıyı ve CTA
     değerini arıyor. Biri değişirse test kırılıyor.
2. **Telefon numarası uçtan uca.**
   - `TELEFON_E164` tek kalıp (`taslak-alanlari.ts`); rehberin eksik
     listesi, taslağın eksik listesi ve derleyici aynısını okuyor.
   - Taslak şemasına `telefon` (isteğe bağlı, varsayılansız: kayıtlı
     taslakların içerik özeti değişmiyor). İzinli kaynak `kullanici`,
     `marka_merkezi`; `ai_onerisi` KAYNAK eksiği üretir.
   - `taslakEksikleri`: TELEFON niyetinde numara yoksa `TELEFON` eksiği.
   - `rehberdenMeta`: numara YALNIZ TELEFON amacında taslağa yazılıyor.
     Marka Merkezi telefonu her rehberde önden doluyor; site taslağına da
     yazılsaydı kayıtlı site taslaklarının özeti değişir ve
     `metaYayinBaslat`taki hash karşılaştırması (rehber.service.ts ~736)
     "taslak değişmiş" derdi. İki taraf da `rehberdenMeta`dan türediği için
     karşılaştırma tutarlı.
   - `DerlemeGirdisi.telefon: string | null` ZORUNLU alan (formId gibi);
     `taslakDerle` (yayin-baslat.ts) tek satır: `telefon:
     alanlar.telefon?.deger ?? null`.
3. **Banner seti kuralı tek sabitte** (`banner-seti.ts`
   `BANNER_SETI_NIYETLERI = ['SITE']`, `bannerSetiDestekleniyor`).
   Derleyicinin `KRT-SET` reddi ve rehber eksik listesinin yeni
   **`M-SET-AMAC`** engeli ("Bu amaçta Meta'da her reklam tek boyutla
   kurulur. Her sette tek görsel bırak") aynısını okuyor. Derleyici reddi
   kaldı: set + form/arama/WhatsApp ölçülmedi.
4. **Ürün açılışı AYRI tutuldu.** `DERLENEN_NIYETLER` AI taslağının
   (`AI_NIYETLERI`), AdvStrategy aktarımının (`aktarimEngeli`) ve matrisin
   okuduğu liste. Derleyiciye eklenen niyet orada kendiliğinden açılırdı ve
   canlı tur öncesi arama/WhatsApp reklamı sohbetten kurulabilir hâle
   gelirdi. `DERLENEN_NIYETLER` hâlâ `FORM, SITE`; genişletmek canlı turun
   commit'inin işi (REHBER_ACILIS ile birlikte). Test bunu kilitliyor.

## Testler

- `derle.spec.ts`: TELEFON/WHATSAPP altın kreatif gövdeleri, reklam seti
  alanları, atıf (1 gün tıklama), video CTA'sı, `TEL-YOK`, WA'da site
  adresi ve numaranın gövdeye girmemesi, eski kurucuyla hizalama, sürüm,
  açılış ayrımı, manifesto.
- `banner-seti.spec.ts`: `M-SET-AMAC` (FORM/TELEFON/WHATSAPP; açılış tablosu
  test süresince `deneme`, finally ile geri), tek görselli setlerde engel
  yok, derleyici `KRT-SET`; telefon yalnız TELEFON taslağına taşınıyor.
- `eksikler.spec.ts`: taslağın TELEFON eksiği ve kaynak kilidi.
- Hedefli koşum: derleyici dizini + yayin-baslat, yayin-motoru, kategori-prova,
  whatsapp-reklami, ai-taslak, taslak.service, strateji, rehber, google:
  hepsi yeşil. Panel: rehber + strateji testleri yeşil. API ve panel
  typecheck temiz, shared derlemesi çıktısıyla temiz.
- **Mutasyon:** 11 mutasyon (WA CTA, WA bağlantısı, tel: öneki, TELEFON
  bağlantısı, TEL-YOK, derleyici set kuralı, eksik listesi set kuralı,
  türetmede telefon koşulu, taslak TELEFON eksiği, taslak izinli kaynak,
  açılış listesi), her biri shared yeniden derlenerek; hepsi en az bir testi
  düşürdü, test sayısı sabit (77).

## Neyi ÖLÇMEDİM

- **TELEFON `link_data.link`.** Meta'nın Call Ads belgesi örnekte "işletme
  sayfası adresi" yazıyor; `https://facebook.com/<sayfa>` bu yorum. `tel:`
  adresinin `link`te reddedildiği yalnız üçüncü taraf bir kaynakta yazıyor.
  Canlı provada kabul ve reklam görünümü gözle doğrulanmalı (Ç-6).
- **TELEFON kampanya amacı.** Katalog `OUTCOME_LEADS` diyor; Meta'nın Call
  Ads belgesindeki örnek kampanya `OUTCOME_TRAFFIC`. Katalog zaten
  `canliOlculecek: objective (LEADS reddedilirse TRAFFIC)` taşıyor; prova
  ilk bunu gösterecek.
- **TELEFON `promoted_object.page_id`.** Belgenin ad set örneğinde yok; biz
  gönderiyoruz (katalog). Meta reddederse ya da görmezden gelirse provada
  görünür.
- **Belgenin iki kısıtı derleyicide yok:** kitle 18+ (bizde en düşük yaş
  zaten 18-25 arası) ve numaranın hedef kitleyle AYNI ülkeden olması. İkincisi
  kontrol edilmiyor: +90 numara ile yurt dışı konum seçilirse Meta'nın ne
  yaptığı bilinmiyor.
- **WHATSAPP `objective`** (LEADS ↔ ENGAGEMENT): katalogdaki `canliOlculecek`.
- WHATSAPP'ta sayfaya bağlı hat olmadan Meta'nın davranışı (ön koşul Ajan 2b,
  Ç-5).
- Hiçbir gövde Meta'ya gönderilmedi; prova da koşmadı.

## Açık kalan

- **AI taslağı / sohbet yolunda numara sorusu yok.** `DERLENEN_NIYETLER`
  genişletildiğinde AI TELEFON seçebilir; taslakta `telefon` olmadığı için
  `TELEFON` eksiği çıkar ama sohbette onu soracak bir soru yok (`siradakiSoru`
  incelenmedi). Açılış commit'inden önce bakılmalı.
- `REHBER_ACILIS` değişmedi (TELEFON/WHATSAPP Meta `kapali`).
- Panelde (rehber adım 4) telefon alanı zaten var; taslak tarafında bir
  ekran değişikliği gerekmedi. Tasarım denetimi yapılmadı.

## Kapsam dışı dokunulan dosyalar

- `apps/api/src/meta-yerlesim-prova.ts`: `telefon: null` (yeni zorunlu alan,
  derleme için).
- Test fikstürleri: `kategori-prova.spec.ts`, `yayin-baslat.spec.ts`,
  `yayin-motoru.spec.ts`, `ajan4-canli-tur.spec.ts`, `yanki.spec.ts`:
  yalnız `telefon: null` satırı.
- `yayin-baslat.ts`: yalnız `telefon` satırı (`formId` satırına dokunulmadı).
