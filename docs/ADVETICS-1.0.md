# Advetics 1.0 — Otomatik Boost (Instagram + YouTube)

Akış: yeni gönderi/video yayınlanır → onay kuyruğuna kart düşer → kullanıcı
**tek tıkla** onaylar → reklam kayıtlı ön ayarla yayına girer. Form yok.

Bu belge **doğrulanmış kısıtları** taşıyor. Her madde resmî dokümandan okundu
ve çoğu ayrıca çürütülmeye çalışıldı; "muhtemel" ve "doğrulanmadı" etiketleri
kasıtlı.

---

## 0. Spec'ten sapmalar ve gerekçeleri

Üç istek yazıldığı gibi yapılamıyor. Üçünün de sebebi platform, tercih değil.

| İstenen | Durum | Yerine |
|---|---|---|
| Google Ads API **v16+** | Sürüm kapandı | **v25** (22 Tem 2026). v21 Ağustos, v22 Ekim'de kapanıyor |
| **YouTube Video Views** + CPV | API'den oluşturulamıyor | **Demand Gen** |
| Instagram **yeni gönderi webhook'u** | Böyle bir alan yok | Mevcut gönderi süpürmesi (polling) |

---

## 1. Instagram: "yeni gönderi" webhook'u YOK

**Karar: yapılamaz.** Meta'nın `instagram` webhook nesnesinde medya yayınını
bildiren abone olunabilir hiçbir alan yok. Beş resmî Meta sayfası ve v26.0
webhook referansı kontrol edildi; iki bağımsız sınayıcı alan listesinin
ayrıntılarını düzeltti ama **yük taşıyan olumsuz sonucu ikisi de doğruladı**.

Abone olunabilir alanlar yorum, bahsetme, canlı yayın ve mesajlaşma etrafında
(`comments`, `live_comments`, `mentions`, `story_insights`, `messages`…).
2025–2026'da eklenen tek yeni alan `message_edit`; changelog yayın webhook'u
yönünde bir hazırlık göstermiyor.

> **Doğrulanmadı:** App Dashboard'ın alan seçicisi açılmadı. Sonuç dokümana
> dayanıyor ve doküman listelerinin eksik olabildiğini `message_edit` örneği
> gösteriyor. Kesinleştirmek isteyen App Dashboard'dan bakmalı.

**Facebook Sayfa webhook'undaki `feed` alanı kullanılmayacak.** Instagram'dan
çapraz paylaşılan içeriğin sayfa gönderisi olarak `feed`'i tetiklemesi olası
ama **belgelenmemiş**: crosspost açık müşteride çalışır, IG-only paylaşanda hiç
çalışmaz. Aynı kod iki müşteride farklı davranır — bu projenin klasik tuzağı.

### Yerine: mevcut gönderi süpürmesi

Advetics 2.0'da `SyncJobType.organic_posts` zaten `/{ig-user-id}/media`
uçlarını süpürüyor ve **canlıda çalışıyor**. 1.0 yeni bir mekanizma kurmuyor;
süpürmenin bulduğu yeni gönderiyi onay kuyruğuna yazıyor.

**Kullanıcı açısından fark yok** — kart yine beliriyor. Fark gecikmede:
webhook anında, süpürme tur aralığı kadar.

#### Süpürmede uyulacak dört kural

1. **`media_product_type = 'AD'` FİLTRELENECEK.** Aksi hâlde sistemin kendi
   ürettiği reklam kreatifleri "yeni gönderi" sanılır ve **geri besleme
   döngüsü** oluşur: reklam → yeni gönderi sanılır → yeni reklam.
2. **Tespit `timestamp` İLE `id` kümesini BİRLİKTE kullanacak.** Medya
   kimliklerinin zamana göre arttığına dair resmî garanti yok; yalnızca
   `timestamp > sonKontrol` ise aynı saniyedeki iki gönderiden biri düşer.
3. **Liste sırasına GÜVENİLMEYECEK.** "En yeni önce" yazıyor ama garanti
   verilmiyor; sabitlenmiş gönderi başa geçebiliyor. İlk N kayıt çekilip
   `timestamp`'e göre KENDİ tarafımızda sıralanacak.
4. **Kota engel değil.** Formül `4800 × gösterim / 24 saat`; 5 dakikada bir
   yoklama günde 288 çağrı.

> **Doğrulanmadı:** gösterimi sıfır olan hesapta kotanın ne olduğu dokümanda
> yazmıyor.

#### Gözden kaçmış iki kısıt (sınayıcıların bulduğu)

- **Collaborative Media (22 Nis 2026):** co-authored gönderiye API'den
  yalnızca YAYINLAYAN hesap erişebiliyor. Müşteri bir collab gönderisi
  paylaşırsa ve yayınlayan taraf o değilse gönderi listeye hiç düşmez.
- **Trial Reels (3 Ara 2025):** yalnızca takipçi olmayanlara gösterilen
  reel'ler `/media`'da normal REELS gibi görünüyor. Boost edilmesi istenir mi,
  karara bağlanmalı.

---

## 2. YouTube: WebSub çalışıyor ama SESSİZCE ÖLÜYOR

PubSubHubbub (WebSub) gerçek bir webhook ve kullanılacak. Ama üç ayrı sessiz
ölüm yolu var ve üçü de kod tarafında karşılanmak zorunda.

1. **Kiralama (lease) doluyor ve hub HABER VERMİYOR.** Azami süre ~10 gün.
   Gelen `hub.lease_seconds`'ın **%80'inde** yenilenecek. Sabit bir süre
   varsayılmayacak; alan hiç gelmezse "süresiz" değil, kısa bir varsayılan
   kabul edilecek.
2. **`hub.mode=denied` İŞLENECEK** (spesifikasyonda MUST). Kiralama
   dolmasından çok daha hızlı bir ölüm yolu ve işlenmezse abonelik sessizce
   biter.
3. **Yenileme işinin kendisi tek noktalı arıza.** BullMQ tekrarlı işi sessizce
   ölürse (Redis temizlenir, tekrarlı iş kaybolur) bildirim durur ve panelde
   "hiç video gelmiyor" diye görünür. **Ölü adam düğmesi gerekiyor:** en son
   ne zaman bildirim/yenileme olduğu kaydedilecek ve eşiği aşınca panelde
   uyarı çıkacak.

**Hub URL'si SABİT YAZILACAK.** YouTube feed'i `Link:` başlığında hub'ı ilan
etmiyor — WebSub keşfi imkânsız.

> **İş riski:** `pubsubhubbub.appspot.com` bir YouTube Data API uç noktası
> değil, Google'ın ücretsiz bir App Engine uygulaması ve YouTube'un
> kullanımdan kaldırma politikasının kapsamında **değil**. Kapanırsa haber
> verilmeyebilir. Ölü adam düğmesi bu riski de karşılıyor.

---

## 3. İki ucun GÜVENLİĞİ — aynı fonksiyon KULLANILAMAZ

Uçlar kimlik doğrulamasız ve internete açık; tetikledikleri şey **para
harcayan** bir reklam yayını.

| | Meta | YouTube WebSub |
|---|---|---|
| Başlık | `X-Hub-Signature-256` | `X-Hub-Signature` |
| Algoritma | HMAC-SHA256 | HMAC-**SHA1** (WebSub 0.4) |
| Gövde | JSON | Atom **XML** |

**Tek bir ortak doğrulama fonksiyonu sessiz düşüş üretir.** Başlık adı ve
algoritma farklı; önek (`sha1=` / `sha256=`) parse edilecek, sabit
varsayılmayacak.

### NestJS tuzağı — kod yazılmadan bilinmesi gereken

**`rawBody` YouTube ucunda ÇALIŞMIYOR.** Nest ham gövde kancasını yalnızca
`json` ve `urlencoded` parser'lara takıyor; YouTube Atom XML gönderiyor.
İmza ham gövde üzerinden hesaplandığı için o uçta ham gövde **elle**
toplanmak zorunda.

### Diğer kararlar

- **Meta'da tekilleştirme `entry`/`change` seviyesinde**, istek seviyesinde
  değil: tek istekte 1000'e kadar olay gelebiliyor.
- **İmza geçersizken hangi HTTP kodu döneceği kritik.** Meta için 2xx dışı
  her yanıt teslim başarısızlığı sayılıyor ve tekrarlanıyor; yanlış seçim
  webhook'u kalıcı olarak devre dışı bırakabiliyor.
- **Uç hızlı cevap verecek:** iş kuyruğa atılıp hemen 200 dönülecek.

---

## 4. Veritabanı — ne eklendi, ne EKLENMEDİ

Spec beş model istedi; **iki tablo** eklendi. Üçünün karşılığı zaten vardı ve
kopyasını açmak onları anında ayrıştırırdı:

| Spec | Karşılığı |
|---|---|
| `Workspace` | mevcut `clients` (RLS'li kiracı, `app.can_access_client`) |
| `ReportingMetric` | mevcut `insights_daily` (normalize metrik + döviz) |
| `PlatformConnection` | mevcut |
| 90 günlük ingest | mevcut `sync_jobs` + `initial_backfill` |

Yeni: `auto_boost_presets`, `auto_boost_queue_items`. Hiçbir tablo
düşürülmedi — 2.0'ın verisi yerinde ve `arsiv/advetics-2.0` dağıtılabilir.

**En kritik kısıt:** kuyrukta `(social_profile_id, external_id)` tekil.
Mükerrer bildirim aynı karta düşer, ikinci kart açmaz — yoksa aynı içerik için
**iki reklam** yayınlanır.
