# Dalga 3 · Google "Vazgeç ve kaldır" — devir notu (Ajan 2)

Dal: `dalga3-google-geri-al` (taban `106ab38`). Push EDİLMEDİ, deploy yok.

## Neden

Rehber sonuç ekranında Meta satırında "Vazgeç ve arşivle" vardı, Google
satırında hiçbir şey yoktu. Duraklatılmış deneme kampanyaları müşterinin
Google Ads hesabında birikiyordu (2026-10-11: 516-174-6317 hesabında
24347958127, 24348033727, 24348046693, üçü de PAUSED) ve Advetics'ten geri
almanın yolu yoktu; sunucu Google geri almasını açıkça reddediyordu.

## Ne yapıldı

- **`googleGeriAlIsle`** (`apps/api/src/modules/reklam/google/google-yayin.ts`):
  - Yalnız `GERI_ALINABILIR_DURUMLAR`ta çalışır (Meta ile AYNI shared liste);
    başka durumda hiçbir şey yapmaz (çift tıklama güvenli).
  - `kurulamadi` + kampanya kimliği yok → Google'a SIFIR çağrı, kayıt kapanır.
  - Hesap kilidi (`<önek>:yazici:<hesap>`), hesap/workspace/platform denetimi,
    **yazma anahtarı** (`googleYazmaAcikMi`) kapalıysa yazma yok, sebep yazılı.
  - Hedef = kayıtlı kampanya ∪ adında `adv-<kimlik>` olan kaldırılmamış her
    kopya (tekillik kapısının bulduğu ikinci kopya, `sonuc_belirsiz`in
    sayamadığı kopyalar). Arama düşerse kaldırma YAPILMAZ.
  - Tek atomik istek: `campaignOperation.remove`, `partialFailure: false`,
    `validateOnly: false` (`googleKaldirmaGovdesi`).
  - **Geri okuma**: `SELECT campaign.id, campaign.resource_name,
    campaign.status FROM campaign WHERE campaign.id IN (…)`; her hedef
    `REMOVED` değilse (satır hiç gelmese de) yayın OLDUĞU YERDE kalır ve
    sebep yazılır (`Kaldırılamadı: 555 (PAUSED) · Google: …`). Kaldırma hata
    verip yine de uygulandıysa karar okumadan: arşivlenir.
  - Başarıda kampanya nesnesi `arsivlendi`, yayın `yayiniSonlandir(…,
    'geri_alindi')` → `arsivlendi`. **Tek durum makinesi**: yeni durum ya da
    geçiş EKLENMEDİ; yedi geri alınabilir durumun hepsinde `→ arsivlendi`
    zaten vardı (testle kilitli). Son durumları sayan yerler değişmedi.
- **Kuyruk**: yeni iş türü `google_geri_al` (`GoogleGeriAlIsi`,
  `ekleGoogleGeriAl`). İş kimliği ZAMAN DAMGALI: sabit kimlik, tamamlanmış
  bir ilk denemeden sonra (kapalı anahtar, düşen arama) kullanıcının
  sonraki basışını sessizce yutardı. Worker yönlendirmesi
  `yayin-isleyici.ts#reklamIsiniIsle`.
- **Uç**: aynı uç (`POST /reklam/yayinlar/:id/geri-al`). `yayin.service.ts
  #adim` platformu hesaptan okuyor (LEFT JOIN): Google + geri al → Google
  işi; Google + devam/yeniden oku → 409 (önceden Meta motoruna gidiyordu);
  hesabı silinmiş yayın → 409, Meta motoruna gitmez.
- **Panel** (`rehber-mantik.ts`, `adim-kontrol.tsx`): `geriAlinabilirMi`
  Google satırında da doğru; metinler `geriAlMetinleri` (Record, platform
  başına). Google: düğme "Vazgeç ve kaldır", onay "Google’daki kampanya
  kaldırılacak; tekrar açılamaz.", eylem "Kaldır". Var olan `GeriAl`
  bileşeni ve onay deseni yeniden kullanıldı; yeni bileşen yok.

## Bilinçli sapma: `update status: REMOVED` DEĞİL `remove`

Görevde `campaignOperation.update` + `updateMask: status` + `status:
REMOVED` istendi. Google Ads API REMOVED'ı durum alanına yazdırmıyor
(REMOVED okunan bir değer; kaldırmanın belgelenmiş yolu
`CampaignOperation.remove`). O biçim büyük olasılıkla `ENUM_VALUE_NOT_PERMITTED`
benzeri bir ret verirdi ve kullanıcı yalnız "kaldırılamadı" görürdü. Hangisi
doğru olursa olsun karar GERİ OKUMADA: kabul edilip uygulanmayan bir istek de
yayını kapatmıyor.

## Testler

- `google-yayin.spec.ts` +17: gövde biçimi, mutlu yol (arşiv + taslak
  serbest), 200-ama-kaldırmadı, okumada satır yok, hata-ama-uygulandı,
  ret, yazma anahtarı, ek kopya, arama düştü, durum okunamadı, kurulamadi
  sıfır çağrı, sonuc_belirsiz (iki dal), açık yayında no-op, ikinci geri al,
  kilit, worker yönlendirmesi, durum makinesi geçişleri.
- `yayin-motoru.spec.ts` kaynak taraması: Google dalı Meta `ekle`sine
  ulaşmadan dönüyor ve yalnız geri al.
- `rehber-mantik.spec.ts`: Google satırında düğme (bütün izinli durumlar),
  metinler.
- Mutasyon: 9 mutasyon (geri okuma, yazma anahtarı, partialFailure,
  kurulamadi kısa yolu, ek kopya, arama hatası, servis dalı, worker
  yönlendirmesi, panel düğmesi) — hepsi düştü, test sayısı sabit.
- API typecheck, web typecheck temiz; web 1.398 test; API tam paket tek başına.

## ÖLÇÜLMEDİ

- **Canlıda kaldırma HİÇ koşmadı.** `remove` gövdesi, `campaign.status`
  okumasının REMOVED kampanyayı döndürmesi (GAQL `campaign` kaynağı
  kaldırılmışları döndürüyor varsayımı) ve `login-customer-id` ile yetki
  ölçülmedi. İlk canlı deneme yukarıdaki üç PAUSED kampanyadan biriyle
  yapılmalı — ama o üçünün Advetics'te yayın kaydı varsa ve durumları
  geri alınabilir listedeyse; değilse Google Ads'ten elle kaldırılmalı.
- Kampanyanın ayrı bütçesi (`CampaignBudget`) kaldırılmıyor; kampanyasız
  bütçe harcamaz ama hesapta adıyla duruyor.
- Panelde Google satırı arşivden sonra "Arşivlendi" rozeti ve "Reklam
  arşivlendi" başlığı gösteriyor ("kaldırıldı" değil). Başlık paralel
  dalda düzeltiliyor; rozet metni platforma göre ayrılmadı.
- Tasarım denetimi (Ajan 6) yapılmadı: ekran görüntüsü yok.
