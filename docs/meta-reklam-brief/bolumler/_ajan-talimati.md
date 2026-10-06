# Ajan talimatı — Meta Ads dokümantasyonundan brief bölümü

Kök: `docs/meta-reklam-brief` (depo köküne göre). Bu dosya bölümleri yazan ajanlara verilen ortak
talimat; bölümlerin nasıl üretildiğinin kaydı olarak duruyor.

- `kaynak/` → Meta'nın "Ads and Commerce" dokümantasyonunun her sayfası, sayfanın
  "Copy for LLM" çıktısı (markdown). Her dosyanın ilk satırı kaynak URL'sini taşır.
- `bolumler/_listeler/<GRUP>.txt` → senin okuyacağın dosyaların listesi (her satır
  `kaynak/` altındaki bir dosya adı).

## Bağlam: Advetics nedir, brief ne için

Advetics, Profaj ajansı için yazılmış beyaz etiketli bir AdTech SaaS (NestJS API +
Next.js panel + PostgreSQL). Meta, Google ve LinkedIn reklam hesaplarını izliyor,
raporluyor ve Meta'da reklam oluşturuyor. İki iş planlanıyor:

1. **Reklam oluşturma panelinin baştan yapılması.** Hedef kullanıcı reklamcılık
   BİLMİYOR: *"reklam ile ilgili bilgisi olmayan birisinin bile platformu
   kullanabilmesi"*. Hedef/optimizasyon/yerleşim/teklif soruları kullanıcıya
   sorulmuyor, bir eşleme katmanında karara bağlanıyor. Uzman için ayrı bir
   "Gelişmiş" mod var.
2. **Kampanyaların yapay zekâ ile kurulup yönetilmesi.** Panel içi sohbet,
   Claude tool-calling; araçlar Advetics'in kendi servislerini çağırıyor. Yayın
   ve canlı kampanyaya dokunan her değişiklik insan onaylı.

Bu brief o iki işin girdisi. Senin işin: sana verilen sayfaların HEPSİNİ okuyup,
reklam kurmak ve yönetmek için işe yarayan her bilgiyi Türkçe, kendi
cümlelerinle, bir uygulama brief'i olarak yazmak.

## Projenin ilkeleri (bölümü yazarken bu gözle oku)

- **Sessiz hata baş belası.** Platformun hata vermeden yanlış şey yaptığı her
  durumu (alanı kabul edip görmezden gelme, varsayılana düşme, birleşim/kesişim
  karışıklığı, sessizce genişleyen hedefleme, Advantage+ otomatik açılan
  özellikler) AYRICA işaretle.
- **Platformun varsayılanına güvenme.** Bir alan gönderilmezse ne olduğunu
  (varsayılan değer, hesaba göre değişip değişmediği) yaz.
- **Tahmin etmektense kısıtla.** Bir şeyin belgede belirsiz olduğu yeri açıkça
  "belgede belirsiz" diye yaz; tahminle doldurma.
- Bilgi BELGEDEN okunuyor; canlıda doğrulanmadı. Bunu bölümün başında söyle.

## Advetics'in canlıda (gerçek parayla) öğrendiği Meta gerçekleri

Belgede bunları doğrulayan ya da çürüten bir şey görürsen "Karşılaştırma"
bölümüne yaz:

1. Ad set'te `destination_type` verilmezse gönderi boost'u reddediliyor (subcode
   2446383); doğru değer `ON_POST`.
2. `geo_locations` kovaları BİRLEŞİM: "Türkiye + İzmir" = Türkiye geneli, hata yok.
3. Instagram medyasının üç kimlik uzayı var (`id`, `ig_id`,
   `legacy_instagram_media_id`); IG gönderisi `object_story_id` ile reklama
   çevrilemiyor, `source_instagram_media_id` + `instagram_user_id` + `object_id`.
4. Kreatif `image_url`/`thumbnail_url` imzalı ve ölüyor; kalıcı olan yalnızca
   `AdImage.permanent_url`.
5. `?ids=` çoklu sorguda tek kötü kimlik isteğin tamamını düşürüyor.
6. Click-to-WhatsApp: ad set `destination_type: WHATSAPP` + `promoted_object.page_id`,
   kreatifte `https://api.whatsapp.com/send` ve CTA `{ app_destination: 'WHATSAPP' }`.
7. Büyük hesapta `limit=500` → "Please reduce the amount of data"; limit yarılanmalı.
8. Insights çağrısında `use_unified_attribution_setting` ve `action_report_time`
   açıkça gönderiliyor.
9. Meta'da `age_max = 65` = "65 ve üzeri".
10. `image_hash` reklam hesabı başına; `ad_accounts.external_id` `act_` önekli.
11. `/search?type=adinterest` kısa terimle eşleşiyor; ilgi alanı büyüklüğü dünya geneli.
12. Organik istatistik adları değişti (`post_impressions` reddediliyor).

## Çıktı

Dosya: `bolumler/<NN>-<konu>.md` (dosya adı sana ayrıca verildi). Biçim:

```
# <NN> — <Konu başlığı>

> Kaynak: <N> sayfa (`_listeler/<GRUP>.txt`) · Okunan: <N>/<N> · Bilgi belgeden, canlıda doğrulanmadı.

## Özet: Advetics için ne demek
(5–12 madde, en önemlisi önce)

## Kavramlar, kurallar ve alanlar
(alt başlıklarla; TAM alan adları, enum değerleri, zorunlu/opsiyonel, varsayılanlar,
kısıtlar, sayısal sınırlar, kullanımdan kalkan alanlar ve tarih/sürüm)

## API çağrıları
(uç nokta + yöntem + zorunlu alanlar + kısa örnek gövde; örnekleri KISALT, birebir
kopyalama)

## Tuzaklar ve sessiz hata riskleri

## Advetics'in canlı bilgisiyle karşılaştırma
(uyuşan / çelişen / belgede geçmeyen)

## Yapay zekâ ile yönetim için çıkarımlar
(hangi işlemler araç olmalı, hangi parametreler KAPALI sözlükten seçilmeli, hangi
işlemler onay gerektirmeli, AI'ın asla tahmin etmemesi gereken yerler)

## Panel kurgusu için çıkarımlar
(acemi kullanıcıya ne sorulmalı, ne otomatik kararlaştırılmalı, ne yalnızca
Gelişmiş modda görünmeli)

## Sayfa sayfa dizin
| Dosya | Kaynak URL | Tek satır özet | Önem |
|---|---|---|---|
(LİSTEDEKİ HER DOSYA bir satır — hiçbirini atlama. Önem: Yüksek / Orta / Düşük /
İlgisiz. Boş ya da ölü sayfaysa öyle yaz.)
```

Kurallar:
- Listedeki HER dosyayı oku. Çok büyük referans sayfalarında (ör. bir düğümün
  kenar/edge sayfaları) en azından başlığı, açıklamayı, parametre ve alan
  tablolarını oku. Okumadığın bir şey kalırsa dizinde "okunmadı" yaz ve sayıyı
  başlıkta dürüstçe ver.
- Metni kopyalama; kendi cümlelerinle Türkçe yaz. Alan/uç nokta/enum adları
  olduğu gibi kalır.
- Uzunluk: ilgili içeriğe göre. Reklam kurulumu için kritik konuda ayrıntılı ol;
  ilgisiz konuyu (ör. ödeme/checkout, bulut kurulumu) iki satırla geç.
- Bölümü yazdıktan sonra ajanı çağırana 150 kelimeyi geçmeyen bir özet dön:
  dosya yolu, okunan sayfa sayısı, en kritik 3–5 bulgu (özellikle sessiz hata
  riskleri ve canlı bilgiyle çelişenler).
