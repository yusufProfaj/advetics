# Devir: Dalga 2c · Google arama öğesi (Telefon · Google)

Dal `dalga2-google-telefon` (taban `caa7ce8`). Push yok, deploy yok.
`REHBER_ACILIS` DEĞİŞMEDİ: Telefon · Google hâlâ `kapali`. Açmak Ajan 5'in
işi ve aşağıdaki "ölçülmedi" listesi kapanmadan açılmamalı.

## Ne yapıldı

1. **Derleyici** (`apps/api/src/modules/reklam/google/derle-google.ts`):
   Arama kurgusunda `ulasma = 'telefon'` artık derleniyor. Numara
   `aramaOgesiTelefonu` ile çözülüyor, olmazsa `G-TELEFON` reddi (numara yok,
   +90 değil, hane sayısı yanlış). `ulasma = 'form'` `G-KURGU-KAPALI`da
   kalıyor ve mesaj SEBEBİ söylüyor: Google formunun içeriği (sorular,
   gizlilik adresi) için kaynak yok. Telefonlu derlemede iki not:
   numara doğrulaması (sitede yazı olarak görünmeli, 3 güne kadar) ve
   saat kısıtı olmadığı.
2. **Gövde** (`connections/providers/google-write.ts#aramaAtomikIstek`):
   `telefon` verilince AYNI atomik isteğin sonuna `assetOperation`
   (`callAsset: { countryCode: 'TR', phoneNumber: <10 hane, 0'sız>,
   callConversionReportingState: 'USE_ACCOUNT_LEVEL_CALL_CONVERSION_ACTION' }`,
   geçici kimlik `assets/-4`) ve `campaignAssetOperation` (`fieldType: 'CALL'`,
   geçici kampanya `campaigns/-2`) ekleniyor. `partialFailure: false`
   değişmedi. `sira.aramaOgesi` bağın indeksi (telefon yoksa null; Demand Gen
   de null).
   - Dönüşüm ayarı AÇIKÇA hesap düzeyi: `DISABLED` telefon amacında teklifi
     kör bırakırdı, kaynak düzeyi ise elimizde olmayan bir dönüşüm işlemi
     kimliği ister.
   - `adScheduleTargets` gönderilmiyor (Marka Merkezi'nde açık saatler yok,
     uydurulmuyor).
   - Ülke kodu tahmin edilmiyor: yalnız `+90` + 10 hane, gerisi açık hata.
3. **Prova**: ayrı yol yok. `rehber.service` provası aynı `derleGoogle`'ı
   `validateOnly: true` ile çağırıyor; öğe işlemleri provada da var (test:
   prova ve yayın gövdeleri eşit).
4. **Geri okuma** (`google-yayin.ts`): `GoogleBeklenen.aramaOgesi`
   (`{countryCode, phoneNumber}` | null, opsiyonel: eski satırların JSON'unda
   yok = null). `googleGeriOku` her kurguda
   `campaign_asset` (field_type CALL, REMOVED değil) + `asset.call_asset.*`
   soruyor. Kıyas: beklenen varsa TAM o tek öğe, yoksa HİÇ öğe (site
   reklamına iliştirilmiş öğe de fark). Numara `ulusalNumara` ile
   normalleştiriliyor (boşluk/parantez, TR'de baştaki `0` ya da `90`); rakam
   farkı fark kalıyor. Onay durumu (`primary_status`) BİLEREK kıyaslanmıyor.
5. **Derleyici sürümü artırılmadı** (`g-1.0.0`): site gövdesi bayt bayt aynı,
   telefon gövdesi önceden hiç `gecti` provası alamazdı. Artırmak bekleyen
   site provalarını boşuna düşürürdü (ve `rehber.service.spec.ts`'i
   kırardı).

## Testler

`npx vitest run` (yalnız hedef dosyalar): `google-write.spec.ts`,
`derle-google.spec.ts`, `google-yayin.spec.ts`, `google-demandgen.spec.ts`,
`google-request.spec.ts`: 102/102. `pnpm --filter @advetics/api typecheck`
temiz. Bütün API paketi KOŞULMADI (talimat).

Mutasyonla doğrulandı (13 mutasyon, hepsi düştü): bağ işlemi silindi,
dönüşüm ayarı silindi, +1'e ülke tahmini, hane kontrolü gevşetildi,
derleyici telefonu geçirmedi, derleyici telefonu reddetti (koleksiyonda
düştü), beklenen öğe null, form sebebi silindi, saat notu silindi, kıyas
silindi, kıyas yalnız beklenince, normalleştirme silindi, okuma boş.

`derle-google.spec.ts` telefon girdisini `girdi('SITE')` üstüne
`ulasma: 'telefon'` koyarak kuruyor: `REHBER_ACILIS.TELEFON.google = 'kapali'`
olduğu için türetme TELEFON+Google'ı reddediyor. Açılış değişince bu testler
`girdi('TELEFON')`a çevrilebilir.

## ÖLÇÜLMEDİ

- **Canlı `validateOnly` provası YAPILMADI.** Alan adları (`callAsset`,
  `countryCode`, `phoneNumber`, `callConversionReportingState`,
  `CampaignAsset.fieldType`, `assetOperation`, `campaignAssetOperation`) v25
  referansından okundu (CallAsset sayfası 2026-07-22 güncel), Google'a hiç
  gönderilmedi.
- **Geçici kimlikli `Asset` + aynı istekte `CampaignAsset`** belgede örnekli
  bir desen ama BU gövdeyle denenmedi.
- **`phoneNumber` biçimi**: 10 hane, `0`'sız gönderiyoruz (Google'ın ABD
  örneği `1234567890`). Google'ın `0532…` ya da `+90…` isteyip istemediği ve
  geri okumada hangi biçimde döndürdüğü ölçülmedi; normalleştirme üç biçimi de
  kabul ediyor.
- **Numara doğrulaması**: politika yardım sayfalarına göre doğrulanmamış
  numara öğeyi REDDETTİRİYOR (onay yok, itiraz yok; düzeltip yeniden
  göndermek gerekiyor). Mutate anında mı reddedildiği, yoksa öğenin kurulup
  `primary_status` ile mi beklediği API'de ÖLÇÜLMEDİ. Mutate reddiyse:
  atomik istek bütün kampanyayı düşürür (kesin hata, `kurulamadi`) ve
  Google'ın `details`/`trigger` alanı mesajda görünür. Politika
  incelemesiyse: kampanya kurulur, geri okuma temiz çıkar ve açılır ama
  arama düğmesi doğrulanana kadar görünmez. Notla söyleniyor; panelde
  `primary_status`ı gösteren bir yer YOK.
- **`campaign_asset` GAQL sorgusu** (`campaign_asset.status != 'REMOVED'`,
  `asset.call_asset.*` alanları) canlıda koşmadı.
- **Hesap düzeyi arama dönüşümü**: `USE_ACCOUNT_LEVEL…` seçildi; hesapta arama
  dönüşümü tanımlı değilse aramalar sayılmaz. Bunu kontrol eden bir yer yok.

## Açık kalanlar

- Telefon · Google'ı açmadan önce bir canlı `validateOnly` provası ve bir
  duraklatılmış kurulum + Google Ads'te gözle kontrol (öğe kampanyada mı,
  numara doğru mu, onay durumu ne).
- Panelde öğenin onay durumunu göstermek (doğrulanmamış numara sessiz kalır:
  kampanya yayında, arama düğmesi yok).
- Açık saatler (`adScheduleTargets`) için bir kaynak (Marka Merkezi).
- Form · Google (LeadFormAsset): içerik kaynağı kararı; ayrı iş.
- `eksikler.ts` E.164 deseni +90 dışını da kabul ediyor, mesajı "+90 ile
  başlamalı" diyor; derleyici ikinci kapı olarak +90 dışını reddediyor.
  Desenin daraltılması shared'da ayrı bir karar (bu ajanın kapsamı değil).
