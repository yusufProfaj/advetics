# Aşama 4 — İyileştir v1 + AI Asistan v1

**Tarih:** 2026-10-09 · **Durum:** taslak kullanıcıya gösterildi, onay bekliyor
(kod yazılmadı). Çerçeve: [`URUN-YAPISI-PLANI.md`](../URUN-YAPISI-PLANI.md) §2
"AI Asistan geri geliyor" ve Aşama 4. Düzen CLAUDE.md "Beş ajan, modül modül"
(+ 6 · Tasarım Denetimi).

## Ekran (taslak: [`taslak.html`](taslak.html), Genel Bakış ile aynı dil)

Menü İyileştir → tek sayfa `/iyilestir`, üç sekme:

1. **Öneriler** — sistemin bulduğu işler, kart başına kanıt (sayılar + mini
   grafik), tek cümle neden, tek düğme. Onay penceresi: şimdi → sonra,
   adımlar (Meta'ya gönder → **Meta'dan geri oku** → kaydet). Uygulanan kart
   "Uygulandı · Meta'da doğrulandı" olur. Uydurma "optimizasyon puanı" YOK;
   üstte gerçek sayılar (uygulanabilir öneri, etkilenen harcama, yalnız
   bilgi, bu ay uygulanan).
2. **AI Asistan** — sohbet; araç izleri görünür ("Reklam kırılımı okundu"),
   gerekirse sohbet içinde Uygula kartı (aynı onay penceresi), reklam kurma
   isteği AdvCampaign'e devir kartı (`hazir_istem`, gönder düğmesine
   kullanıcı basar).
3. **Kurallar** — bugünkü `/kurallar` ekranı buraya taşınır (yeni ekran
   yazılmaz), görünüşü aynı dile çekilir; `/kurallar` yönlenir.

## Çelişki tablosu (brief ↔ depo)

| # | Brief / plan | Depoda gerçek | Karar |
|---|---|---|---|
| İ-1 | "Uygulayan `campaign-actions`" | Yalnız **Meta** yazıyor; Google `applyAction` "henüz yazılmadı", LinkedIn `canWrite=false` | v1'de Uygula yalnız Meta. Google/LinkedIn önerisi **bilgi kartı**: kısıt yazılı, "Google Ads'te aç" (tahmin etmektense kısıtla) |
| İ-2 | "200 döndü doğrulama değil" (CLAUDE.md) | `campaign-actions` yazdıktan sonra platformdan OKUMUYOR; `after` gönderilen değer | Ajan 2: yazmadan sonra Meta'dan geri oku, eşleşmezse "uygulanamadı" + platformun değeri |
| İ-3 | Yorgun kreatifi durdur | `campaign-actions` yalnız `level: 'campaign'` gönderiyor; sağlayıcı tipi `ad_group`/`ad` alıyor | Ajan 2: reklam (ve reklam seti) seviyesine genişlet |
| İ-4 | Kreatif yorgunluğu sinyali | Sıklık/erişim reklam seviyesinde yalnız **Meta**'da (Google/LinkedIn erişim 0); `breakdown` sıklık döndürmüyor | v1 yorgunluk yalnız Meta, ekranda söyleniyor. Yeni okuyucu (Ajan 1 sözleşme, Ajan 2 SQL). **Eşikler canlı veriyle ÖLÇÜLECEK** (Ajan 1), tahmin edilmeyecek |
| İ-5 | Bütçeyi verimli kampanyaya kaydır | Meta'da bütçe kampanyada (CBO) ya da reklam setinde (ABO) olabilir | Öneri bütçenin GERÇEKTEN durduğu seviyeyi hedefler; bilinmiyorsa öneri üretilmez |
| İ-6 | Bütçe adımı | — | **KAPANDI (kullanıcı): tek öneride en fazla %20**; aylık bütçeye sığmıyorsa öneri yok |
| İ-7 | Uygula yetkisi | `campaign.*` yetkisi yok; `campaign-actions` `budget.write` istiyor | **KAPANDI (kullanıcı): `budget.write`** (yönetici, reklam yöneticisi). Müşteri hesabı İyileştir'i görmez |
| İ-8 | Kurallar İyileştir'e | Kural yürütücü `campaign-actions`'ı ATLIYOR, `notify` gerçekte bildirim göndermiyor | v1 kapsam DIŞI; ekranda "bildir" eylemi "yalnız kayıt" diye doğru adlandırılır |
| İ-9 | AI Asistan modeli | Gemini (`yapay-zeka/gemini.ts`) araç çağırma + akış destekliyor; AdvCampaign sohbet altyapısı (`adv_oturum/mesaj/onay`) var | Asistan Gemini; kendi tabloları (eski `ai_conversations` kullanılmaz). Okuma araçları `MetricsService` (Okuma API'nin dokuz aracıyla aynı yol) + yorgunluk okuyucu + Uygula kartı üretici. Doğrudan yazma aracı YOK |

## Ajanlar

1. **Mimar** — `packages/shared/src/iyilestir/` (öneri türleri, kart, onay,
   asistan mesajı/araç sözleşmesi) + `docs/iyilestir/MIMARI.md`. **Canlı
   ölçüm:** reklam seviyesi `frequency` dolu mu, dağılımı; yorgunluk
   eşiği ölçümden.
2. **Arka Plan** — öneri üretici (yorgunluk, bütçe verimi, tempo), onay
   tablosu, `campaign-actions` ad/ad_group + geri okuma, asistan sohbet ucu.
3. **Ön Yüz** — `/iyilestir` üç sekme, onay penceresi, `/kurallar` yönlenme,
   menü.
4. **Test & Güvenlik** — RLS (`SET ROLE` + `RETURNING`), onay kartının tek
   kullanımlık ve özetin değişmemiş olması (hash), geri okuma mutasyonu,
   sessiz hata taraması.
5. **Canlıya Alma** — migration, ilk Uygula'nın canlıda GÖZLE doğrulanması
   (en küçük değişiklikle, Meta'da).
6. **Tasarım Denetimi** — taslakla yan yana, masaüstü + telefon.
