# Dalga 3 · Meta: devir notu (Ajan 2 · Meta)

Dal: `dalga3-meta` (taban `3beb534`). Push YOK, deploy YOK. `REHBER_ACILIS`
DEĞİŞMEDİ: VIDEO/ERISIM/SATIS Meta satırları hâlâ `kapali`; canlı tur
sonrası kullanıcı çevirecek. `DERLENEN_NIYETLER` (AI/AdvStrategy aktarımı)
DEĞİŞMEDİ: `FORM, SITE`.

## Ne yapıldı

| İş | Nerede | Not |
|---|---|---|
| Derleyici VIDEO_IZLENME, ERISIM, SATIS üretiyor | `packages/shared/src/reklam/meta/derle.ts` | `DERLEYICI_NIYETLERI` genişledi, `DERLEYICI_SURUMU` 1.3.0 |
| Video izlenmede her fikir video | derle `KRT-VIDEO-ZORUNLU`, eksik `M-VIDEO-YALNIZ` | Görsel bırakıldığı adımda engel, sayısıyla |
| Video/erişimde bağlantı | `kreatifBaglantisi`, `ctaDegeri` | Site adresi varsa o (LEARN_MORE), yoksa `https://facebook.com/<sayfa>`; `link: null` artık gitmiyor |
| Adres alanı TEK kural | shared `adresAlani()` / `adresGerekliMi()` | Panel (`adim-reklam.tsx`) ve eksik listesi aynı fonksiyonu okuyor; video/erişimde "isteğe bağlı" |
| Erişimde sıklık sınırı | reklam seti `frequency_control_specs` (7 günde 2) | Manifesto `M-11F`, yankıda kabul edilemez ("Sıklık sınırı"), karar tablosunda `SIKLIK` satırı |
| Satışta piksel | `promoted_object: {pixel_id, custom_event_type: 'PURCHASE'}` | Sayfa kimliği yok; manifesto M-10 dallara ayrıldı (`sayfa`/`piksel`/`whatsapp`), `M-10P` |
| Piksel okuyucu | `MetaProvider.fetchAdPixels` + `mapAdPixel`, `pikselSatinAlmaCoz` | `/act_X/adspixels?fields=id,name,last_fired_time,is_unavailable`; piksel başına `/{piksel}/stats?aggregation=event&event=Purchase&start_time=` (en çok 5 piksel) |
| Piksel ucu | `GET /reklam/rehber/pikseller?clientId=&adAccountId=` (`bulk.read`) | Dört hâl: okunamadı 503 + Meta mesajı / boş + neden / liste / okunuyor (panel) |
| Ön koşul | `metaSatisOlcumu` artık dolu (hazırlık: tek piksel ise sinyali, yoksa `false`, çoksa `null`); rehberde `seciliPiksel` | Engel: seçilmedi, hesapta yok, kullanılamaz, hiç çalışmadı. Uyarı: 7 günde veri yok, satın alma yok, satın alma bilinmiyor. Bilinmeyen piksel platforma giderken engel (`platformaGiderken`) |
| Prova/yayın öncesi taze okuma | `sayfaTazele` SATIS dalı | Seçili hesabın pikselleri yeniden okunur |
| WhatsApp numarası | rehber/taslak `whatsappNumarasi`, derle `promoted_object.whatsapp_phone_number`, `WA-NUMARA` | Marka Merkezi telefonu E.164'e çevrilip öneriliyor (`whatsappOnerisi`); numara yazıldıysa "hat okunamadı" uyarısı çıkmıyor |
| Bilinmeyen ön koşulun kendi cümlesi | `onKosul(..., bilinmiyorMetni)` | "Kontrol edilemedi: ... yok" kalıbı kalktı |
| Geri okuma N-17 | `yanki.ts` | WhatsApp numarası `+`/boşluk dışında rakam rakam kıyaslanıyor |
| Panel | yeni `meta-dalga3.tsx` (`PikselSecici`, `WhatsappNumarasi`), `meta-dalga3-mantik.ts` | `adim-reklam.tsx` ve `adim-amac-nerede.tsx`'te yalnız bağlama satırları; Meta video amacında dosya seçici yalnız video, arşivden seçim kapalı ve sebebi yazıyor |
| CLAUDE.md | "CLICK-TO-WHATSAPP'TA NUMARA SORULMAZ" girdisine 2026-10-11 güncellemesi | |

Testler: `derle-dalga3.spec.ts` (altın gövdeler), `dalga3-meta.spec.ts`
(eksik, türetme, karar, yankı, piksel çözümleyiciler, sağlayıcı, kaynak
taraması), web `meta-dalga3-mantik.spec.ts`. Mutasyonla doğrulananlar:
sıklık satırı, piksel `promoted_object`i, video zorunluluğu, sayfa adresi
yedeği, WhatsApp uyarı bastırma, hiç çalışmamış piksel engeli, N-17,
`platformaGiderken` piksel dalı, `pikselSatinAlmaCoz` tanınmayan biçim,
çalışmamış pikselde `false`.

## ÖLÇÜLMEDİ (canlı tur bakmalı)

1. **`promoted_object.whatsapp_phone_number` biçimi** (`+` ile mi) ve Meta'nın
   sayfaya bağlı OLMAYAN numarayı gerçekten reddettiği. Reddetmiyorsa sessiz
   yanlış hat riski geri gelir; turda bilerek yanlış numarayla prova edilmeli.
   Geri okumada alanın nasıl döndüğü (N-17 varsayımı).
2. **`frequency_control_specs`** ERİŞİM'de kabul ediliyor mu ve geri okumada
   aynı mı dönüyor (fark çıkarsa yayın durur; kabul edilemez sınıf).
3. **THRUPLAY ve REACH atıfı** 1 gün tıklama (formdaki gibi gerçek kurulumda
   ret çıkabilir; prova seti tek başına sınamıyor).
4. **`destination_type: ON_VIDEO`** ve VIDEO_IZLENME amacı ENGAGEMENT
   (katalogdaki `canliOlculecek`).
5. **Sayfa adresinin** video/erişim reklamında bağlantı olarak kabul edilmesi
   (`https://facebook.com/<sayfa>`), TELEFON'daki gibi.
6. **Piksel istatistiği** `/{piksel}/stats` yanıt biçimi ve `event=Purchase`
   süzgeci belgeden; biçim tanınmazsa `null` (uyarı), yanlışlıkla `false`
   üretmiyor. Olay adı `Purchase` varsayıldı.
7. **SATIŞ'ta `custom_event_type: 'PURCHASE'`** + `pixel_id` ile kurulum ve
   ajans atıf standardının (7 gün tıklama ± 1 gün görüntüleme) kabulü.
8. Arşivdeki videolar rehberde seçilemiyor (hazırlık listesi yalnız görsel ve
   kapak bilgisi taşımıyor): yalnız yükleme yolu. Kapaklı video listesi ayrı iş.

## Açık / sonraki

- `REHBER_ACILIS`: VIDEO/ERISIM/SATIS Meta `kapali` → canlı tur sonrası
  `deneme` → `acik` (kullanıcı).
- Hazırlık her açılışta ilk Meta hesabının piksellerini okuyor (1 + en çok 5
  çağrı); hesap çoksa ilk hesabınki. Rehberde asıl karar seçili pikselde.
- Kayıt (COMPLETE_REGISTRATION) dalı derlenmiyor; rehber yalnız satın almayı
  soruyor.
- Panel kullanıcı gözünden geçmedi (Ajan 6 tasarım denetimi yapılmadı).
- Kapsam dışı dokunulan dosyalar: `eksikler.ts` içindeki Google
  `G-DONUSUM` satırı yalnız yeni `onKosul` imzası için bir argüman aldı
  (metin: "Google Ads'teki satın alma dönüşümü kontrol edilemedi").
