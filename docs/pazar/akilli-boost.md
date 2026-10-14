# Akıllı Boost — pazar araştırması (2026-10-15)

Döngü turu 6 (PROGRESS.md § 2). Bugünkü Akıllı Boost: Instagram (+ YouTube
Demand Gen) gönderisi yayınlanınca kart oluyor, ön ayardaki bütçe/süre/kitle
ile kullanıcı onaylayınca boostlanıyor. Kart üretiminde ORGANİK PERFORMANS
EŞİĞİ YOK: her yeni gönderi kart oluyor. Meta boost hedefi varsayılanı
`engagement` (`autoboost.schema.ts`). Platform iddiaları belgeden; canlıda
ölçülmedi.

## 1 · Platform güncellemeleri

- **Partnership ads genişledi:** Instagram'da yalnız "ücretli ortaklık"
  etiketli değil, ortak (Collab) gönderiler, bahsetmeler ve etiketler de
  ortaklık reklamı olarak boostlanabiliyor; Ekim 2025'te ortaklık reklamı
  API'sine lead amacı, Advantage+ katalog ve çift yönlü gönderi keşfi geldi.
  Nisan 2026'dan beri "Ücretli ortaklık" etiketi Content Publishing API'den
  yayın anında konabiliyor. Kaynak: [Meta, 2026-04-22](https://developers.facebook.com/blog/post/2026/04/22/instagram-api-updates-for-partnerships-metrics-collaboration-and-engagement/),
  [Meta, 2025-10-03](https://developers.facebook.com/blog/post/2025/10/03/Introducing-new-features-for-instagram-partnership-ads-api/),
  [Meta belge: mevcut IG gönderisini boostla](https://developers.facebook.com/documentation/ads-commerce/marketing-api/ad-creative/partnership-ads/ads-creation/boost-existing-post).
- **Uygunluk kısıtları:** telif müzikli, bazı GIF/çıkartmalı gönderiler
  boostlanamıyordu; Meta bir kısmını açtı ve telif sesini uygun sesle
  değiştirme yolu ekledi (tarihi doğrulanmadı). Kaynak:
  [Lindsey Gamble](https://lindseygamble.com/blog/instagram-now-allows-posts-with-gifs-stickers-to-be-boosted).
- Reels'e özel 2026 boost değişikliği bulunamadı.
- **Bizde:** müzikli/çıkartmalı bir gönderi onaydan sonra Meta'da
  reddedilirse kart "başarısız" oluyor; uygunluk giriş anında sorulmuyor
  (CLAUDE.md: doğrulama kullanım anında değil giriş anında).

## 2 · Rakipler

| Ürün | Otomatik boost | Tetik | Not |
|---|---|---|---|
| Birch (eski Revealbot) | Var, FB ve IG için ayrı kural | Organik gösterim/etkileşim/tıklama oranı EŞİĞİ ya da metinde anahtar kelime | Aynı anda kaç gönderinin boostlu olacağı sınırı; her gönderiye ayrı reklam seti; Slack/e-posta bildirimi |
| Madgicx | Aramada bulunamadı | - | - |
| Meta'nın kendi "otomatik boost"u | Sayfa düzeyinde | Meta seçer | Kontrol yok |

Kaynak: [Birch otomatik boost](https://bir.ch/facebook-ads/auto-boost-facebook-posts),
[Birch kurs](https://bir.ch/facebook-ads-course-automation/auto-boost-your-best-organic-posts),
[Birch duyurusu](https://bir.ch/blog/post-boosting-launch).

**Konum:** Advetics onaylı kartla güvenli tarafta (para onaysız harcanmıyor)
ama hangi kartın onaylanmaya DEĞER olduğunu söylemiyor; Birch bunu eşikle
yapıyor.

## 3 · Kullanıcı şikâyetleri

- Boost, Reklam Yöneticisi reklamına göre sonuç başına daha pahalı olabiliyor
  (kaynaklara göre 2–3 kat); daha az kontrol, sınırlı hedef. Kaynak:
  [Sanctuary MG](https://www.sanctuarymg.com/academy/advertising/problem-with-boosting-posts/),
  [AdMake](https://admakeai.com/blog/how-to-boost-facebook-post).
- Agorapulse testinde boost tıklama oranı yüksek (%1,81 / %1,29) ama tıklama
  başı maliyet Reklam Yöneticisi'nde daha düşük. Kaynak:
  [Agorapulse](https://agorapulse.com/social-media-lab/facebook-boost).
- **Ortak tavsiye:** organikte zaten iyi giden gönderiyi boostla; organikte
  ortalamanın altındaki gönderiyi boostlamak "aynı başarısızlığın büyüğünü
  satın almak". Satış/lead için boost yerine kampanya. Kaynak:
  [AdMake](https://admakeai.com/blog/how-to-boost-facebook-post),
  [Relevant Audience](https://www.relevantaudience.com/facebook-ads/what-is-a-boosted-post/).
- Reddit'e arama üzerinden ulaşılamadı (iki turdur); bu başlık kaynak
  sınırı olarak not edildi.

## 4 · Türkiye pazarı

- TR'de Instagram, KOBİ'nin birincil vitrini; Akıllı Boost'un yalnız IG
  kartı üretmesi (2026-09-30 kararı) pazara uygun. Yerli bir otomatik
  boost rakibi bulunamadı (WASK genel reklam yönetimi).

## 5 · Öneriler (öncelik sırasıyla)

1. **Kartta organik performans karşılaştırması.** "Bu gönderi son 10
   gönderinin ortalamasına göre erişimde %X / etkileşimde %Y" satırı;
   organikte ortalamanın altındaysa "Organik performansı düşük; boostlamak
   genelde verimsiz" notu. Veri `organic_posts`ta zaten var (erişim,
   etkileşim). Para harcamaz, karar vermeyi kolaylaştırır. Onaysız.
2. **Boost hedefinin ne ölçtüğünü kartta söyle.** Varsayılan `engagement`;
   kullanıcı "satış gelir" beklemesin. Kart "Bu boost etkileşim için;
   satış/form için AdvCampaign" desin. Onaysız (metin).
3. **(onay bekliyor) Organik eşikle otomatik öneri sıralaması / otomatik
   onay.** Birch gibi eşik üstündeki gönderiyi öne almak ya da otomatik
   boostlamak. Otomatik onay para harcar → kullanıcı kararı.
4. **(onay bekliyor) Aynı anda boostlu gönderi sınırı.** Birch'teki
   eşzamanlı sınır; harcamayı sınırlar ama kullanıcının onayını
   engelleyebilir → kullanıcı kararı.
5. Sonraya: ortaklık reklamı (içerik üreticisinin gönderisini boostlama),
   giriş anında boost uygunluğu (müzik/çıkartma).
