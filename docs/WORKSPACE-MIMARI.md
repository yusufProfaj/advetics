# Workspace tabanlı mimari — ölçülen durum ve kurgu

Bu belge bir istek listesinin cevabı: panelin "Workspace (Çalışma Alanı)
tabanlı multi-tenant" mimariye dönüştürülmesi. Her bölüm **önce bugünkü
durumu ölçüyor**, sonra kurguyu veriyor.

> Ölçmeden tasarlamamanın sebebi bu turda üç kez ortaya çıktı: istenen üç
> şeyin ikisi zaten vardı ve biri sanılandan tamamen farklı bir hataydı.
> Var olanı ikinci kez yazmak, ayrışacak ikinci bir kopya demek.

**Workspace = mevcut `clients` tablosu.** Yeni bir tablo değil. Bütün RLS
politikaları, `TenantContext` ve `activeClientId` mekanizması zaten bunun
üzerine kurulu.

---

## 1. "Veri sızıntısı" — teşhis farklı çıktı

**Bildirilen:** *"Ege Birlik Yapı seçiliyken yanda Fenbay ve Mirnas'ın
sekmeleri/kartları görünüyor — kritik veri güvenliği ihlali."*

### Ölçüm: sızıntı yok, ve bu kanıtlandı

`app.can_access_client` iki katmanlı ve ikisi de çalışıyor:

```sql
SELECT app.has_context()
   AND (app.is_org_admin() OR target = ANY (app.current_client_ids()))  -- üyelik sınırı
   AND (app.current_active_client_id() IS NULL
        OR target = app.current_active_client_id());                    -- aktif daraltma
```

`apps/api/src/prisma/workspace-isolation-rls.spec.ts` bildirilen senaryoyu
birebir kuruyor (Ege / Fenbay / Mirnas + başka bir ajans) ve **RLS'i açarak**
ölçüyor — normal testler politikayı görmez, çünkü koşum ortamı worker'ı taklit
edip RLS'i kapatıyor. On testin kilitlediği şey:

- Ege seçiliyken havuzda **yalnızca** Ege'nin kartı var
- Müşteri hesabı, aktif workspace hiç seçili değilken bile başkasını görmüyor
- Müşteri hesabı `activeClientId`'yi **sahte** bir değerle Fenbay yapsa
  **hiçbir şey** göremiyor (yetki yükseltme kapalı)
- Diğer workspace'lerin **adını** bile göremiyor
- Başka ajansın müşteri kimliğini erişim listesine enjekte etmek işe yaramıyor

Politikayı iki ayrı yerinden bozdum; her mutasyonda doğru testler düştü.

### Asıl kusur: iki denetimin çakışması

Üst barda bir müşteri değiştirici var (**cookie** yazıyor). Ayrıca üç sayfa —
`auto-boost`, `butce`, `kurallar` — kendi içinde bütün müşterileri listeleyen
**ikinci bir şerit** basıyordu (adrese `?musteri=` yazıyor).

Sayfalar aktif müşteriyi `params.musteri ?? session.activeClientId` sırasıyla
çözüyor: **URL cookie'yi eziyor.**

Sonuç: şeritten Fenbay'a geçip üst bardan Ege'yi seçince üst bar "Ege Birlik
Yapı" yazıyor, gövde Fenbay'ın verisini gösteriyordu. Gösterilen veri gerçekten
URL'deki müşteriye ait — yetkisiz erişim yok — ama **ekranda yazan workspace
ile gövdedeki veri birbirini tutmuyordu.** Sızıntıdan ayırt edilemeyecek kadar
kötü bir hâl.

**Yapıldı:** üç şerit kaldırıldı, tek denetim üst bardaki değiştirici, ve
değiştirici seçim yaparken adresteki `?musteri=`'yi temizliyor.

**Kalan davranış:** `?musteri=` derin bağlantı olarak çalışmaya devam ediyor
ve sayfalar arası geçişte **mevcut** müşteriyi taşıyor (örn.
`/reklam-olustur` → `/reklam-olustur/basit?musteri=...`). Bunlar müşteri
değiştirmiyor, çakışma üretmiyor. Bayat bir yer imi hâlâ başlık≠gövde
üretebilir; değiştiriciye dokunulduğu an düzeliyor.

---

## 2. Sol menü ve RBAC

### Ölçüm

Roller zaten var (`packages/shared/src/auth/roles.ts`): `owner`, `admin`,
`manager`, `analyst`, `client_viewer`. `client_viewer` = *"Müşteri tarafı.
Sadece kendi verisini okur."*

Ama menü **filtresiz** basılıyordu: 7 bölüm / 22 öğe herkese aynı. Bir
`client_viewer` "Çalışma Alanı" kategorisini — Müşteriler, Platform
Bağlantıları, Ekip & Yetkiler — görüyordu.

Veri sızmıyordu (uç noktalar `@RequirePermissions` ile korunuyor, tıklasa 403
alırdı) ama iki gerçek sorun vardı: **tıklanabilir ama çalışmayan bağlantılar**
ve **ajansın iç ekranlarının varlığının müşteriye sızması**. `roles.ts`'in
kendi başlığı bunu zaten yasaklıyor.

### Kurgu — yapıldı

`NavEntry.perm` eklendi, süzme **opt-in**: yetki anahtarı yazılmamış öğe eskisi
gibi görünüyor. Tersi, bir anahtarı atlamanın ajans çalışanından çalışan bir
ekranı sessizce gizlemesi demekti.

| Menü öğesi | Yetki | `client_viewer` |
|---|---|---|
| Müşteriler | `client.write` | görmüyor |
| Platform Bağlantıları | `connection.read` | görmüyor |
| Ekip & Yetkiler | `user.read` | görmüyor |
| Marka | `branding.write` | görmüyor |
| Denetim Kaydı | `audit.read` | görmüyor |

`client.read` **kullanılmadı**: `client_viewer`'da var, kendi müşterisini
okuyabilmeli. Ayırt eden şey yönetim yetkisi.

Bölüm boşalırsa **başlığı da basılmıyor**. Menü verisi `lib/nav-sections.ts`'e
taşındı ve `nav-sections.spec.ts` görünürlüğü kilitliyor (iki yönde mutasyonla
doğrulandı: süzgeci kaldırınca ve her şeyi gizleyince).

### İstenen menü hiyerarşisi — eşleme

İstenen altı kullanıcı ekranının **tamamı zaten var**, farklı adlarla:

| İstenen | Bugünkü |
|---|---|
| Genel Bakış | `/dashboard` — aynı ad |
| Reklam Keşfi | `/ads-explorer` — aynı ad |
| Akıllı Boost | `/auto-boost` — aynı ad |
| Raporlar | `/raporlar` — aynı ad |
| Bilgi Bankası | `/kutuphane/bilgi-bankasi` — aynı ad |
| Görsel Arşiv | `/kutuphane/gorseller` — "Görsel Arşivi" |

### Sadeleştirme — **uygulandı**

Yedi bölüm ve 23 öğe → **iki bölüm ve 15 öğe**.

- **Ekranı olmayan 7 öğe çıkarıldı.** Soluk ve tıklanamaz basılıyorlardı;
  menünün üçte biri ölü satırdı. "Bilgi Bankası" iki kez geçiyordu — biri
  çalışan ekran, diğeri ekranı olmayan bir kalıntı.
- Ayrım artık iş akışına göre değil **yetkiye** göre: `Workspace` (bir
  müşterinin içinde yapılan işler) ve `Çalışma Alanı` (ajans yönetimi).
- İstenen altı ekran başta. **Kalan altısı da çalışan ekranlar** (Reklamlar,
  Potansiyel Müşteriler, Aylık Bütçe, Kurallar, Formlar, Kreatifler) ve bu
  yüzden menüde tutuldu — çalışan bir özelliği menüden düşürmek onu sessizce
  yok etmek olurdu. İstenmiyorlarsa tek tek çıkarılabilir.

---

## 3. Müşteri hesabı izolasyonu

### Ölçüm — üç gerçek boşluk

1. **Ayrı bir "müşteri kullanıcısı oluşturma" akışı yok.** `client_viewer`,
   ekip ekleme formundaki rol listesinin beşinci seçeneği. Kullanıcı ajansın
   `users` tablosunda doğuyor.
2. **"Ekip & Yetkiler" listesi `user.findMany()` — WHERE'i hiç yok.** Süzme
   tamamen RLS'te. Sonuç: müşteri hesapları ajans personeliyle **aynı düz
   listede**, rol dışında hiçbir ayrım yok, üstteki sayaç ikisini tek
   "N kullanıcı" olarak topluyor. **İstenen tam olarak bunun olmaması.**
3. **`mustChangePassword` yazılıyor ama hiçbir kod okumuyor.** Yönetici
   parolayı düz metin yazıp elden iletiyor ve zorunlu değişim uygulanmıyor.
   Bu bir güvenlik açığı ve istek listesinde yok — ayrıca ele alınmalı.

### Kurgu

- `memberships` sorgusuna `role <> 'client_viewer'` süzgeci: ekip listesi
  yalnızca ajans içi. Süzgeç **sorguda**, arayüzde değil — arayüzde süzmek,
  API'yi doğrudan çağıran birine listeyi açık bırakırdı.
- Müşteri hesapları ilgili workspace'in kendi ekranında (Müşteriler →
  workspace detayı) yönetilir.
- `client_viewer` için `availableClients` zaten tek öğeli oluyor ve değiştirici
  o durumda açılır menü değil statik etiket gösteriyor — **bu kısım hazır**.

---

## 4. Platform bağlantıları — workspace bazlı

### Ölçüm: şema zaten destekliyor, ama bir kısıt var

`platform_connections.client_id` **NULLABLE**; NULL = ajans havuzu. `ad_accounts`
ve `social_profiles` de aynı. RLS politikaları NULL / NOT NULL için **ayrı
dallar** taşıyor. Yani workspace bazlı bağlantı için **yapısal bir değişiklik
gerekmiyor**.

**Kısıt:** `@@unique([orgId, platform, externalUserId])` — aynı Meta/Google
kimliği bir org'da tek satır.

Bu, CLAUDE.md'deki karara bağlanıyor: *"platform önceki token'ı geçersiz
kılıyor ve bağlantıları koparıyordu."* Kararın **kapsamı önemli** ve istek
bunu varsaymış olabilir:

- **Aynı** Meta/Google kullanıcısıyla her müşteri için yeniden yetkilendirme
  → önceki token ölür, bağlantılar kopar. Bu yasak ve sebebi bu.
- **Farklı** platform kimlikleriyle (her müşterinin kendi Business
  Manager'ı / kendi Google Ads hesabı) workspace başına bağlantı
  → çalışır, şema destekler, tekil indeks engellemez.

**Yani istenen model mümkün — koşulu şu:** her workspace kendi platform
hesabıyla yetkilendirilecek. Ajans tek bir Facebook hesabıyla bütün
müşterileri bağlıyorsa istenen akış ikinci bağlantıda birincisini koparır.

### Karar: her workspace kendi Meta hesabıyla — **uygulandı**

Alt yapı zaten hazırmış: `state.clientId` bağlantıya, oradan keşfedilen bütün
hesap ve sayfalara akıyordu. Eksik olan tek şey `startOAuth`'un her zaman
`null` yazmasıydı.

- Hedef workspace **üst bardaki değiştiriciden** geliyor; bağlantı ekranında
  ikinci bir seçici yok (bu turda kaldırılan hatanın aynısını üretirdi).
- Workspace seçili değilken bağlanılamıyor ve sebebi ekranda yazılı.
- **Sahiplik değişimi reddediliyor.** Aynı Meta hesabını ikinci bir
  workspace'e bağlamak, upsert'ün `update` dalı `client_id`'ye dokunmadığı
  için sessizce ilk workspace'te bırakırdı ve keşfedilen hesaplar oraya
  düşerdi. Artık hata mesajı hesabın nerede olduğunu ve ne yapılacağını
  söylüyor. `connection-ownership.spec.ts` kilitliyor.
- Havuz yolu API'de duruyor — kaldırmak üretimdeki 157 hesabı kopartırdı.

**Kalan:** bağlantı kurulunca `initial_backfill` işinin tetiklenmesi. İş tipi
var, tetikleyicisi bu akışa bağlanmadı.

---

## 5. Tarih aralığı filtreleme

### Ölçüm: büyük kısmı zaten var

`apps/web/src/lib/date-range.ts` — `RANGE_PRESETS` ve `resolveRange`, kendi
testiyle. Bugünkü kısayollar: **Bugün, Dün, Son 7 gün, Son 30 gün, Son 60 gün,
Son 90 gün.** `/dashboard` ve `/ads-explorer` kullanıyor.

"Bugün"ün ayrı tutulması bilinçli: tamamlanmamış bir günü kayan aralığa
karıştırmak metrikleri düşük gösteriyor.

### Eksik olanlar

- **Son 14 gün** — tek satır.
- **Bu ay / Geçen ay** — takvimsel; `RANGE_PRESETS`'in `days`/`offset` modeli
  bunu ifade edemiyor, ayrı bir tür gerekiyor (`recentMonths` `/raporlar`'da
  zaten var, oradan alınabilir).
- **Özel tarih aralığı** — iki tarih girdisi + doğrulama (bitiş ≥ başlangıç,
  gelecek tarih yok, azami aralık).
- `/raporlar` **kasten takvimsel ay** kullanıyor: *"rapor bir belge"*. Oraya
  kayan aralık eklemek bu kararı bozar — istiyorsan bilerek bozmalıyız.

---

## 6. PDF ve otomatik e-posta

### Ölçüm: hiçbiri yok

Depoda **PDF üreteci yok** (puppeteer/playwright/pdfkit/react-pdf yok) ve
**e-posta altyapısı yok** (Resend/nodemailer/SES/SMTP yok, `.env.example`'da
ilgili değişken yok). Parola sıfırlama e-postası bile gönderilmiyor.

**Bilgi Bankası'nda müşteri iletişim e-postası alanı YOK.** `auto_boost_presets`
yalnızca boost ön ayarı tutuyor. İstenen akışın okuyacağı alan mevcut değil.

### Kurgu

Bu madde tamamen sıfırdan ve **senin iki kararına bağlı**:

1. **E-posta sağlayıcısı**: Resend mi, SMTP mi? Resend daha az kurulum ister
   ama alan adı doğrulaması gerekir; SMTP zaten sahip olduğun bir posta
   kutusuyla çalışır. Hangisi olursa olsun **bir API anahtarı / SMTP parolası
   gerekiyor ve onu ben repoya yazamam** — `.env`'e sen ekleyeceksin.
2. **PDF nasıl üretilecek**: sunucuda başsız tarayıcı (görsel açıdan zengin,
   ama paylaşımlı VPS'te ~300 MB Chromium ve bellek yükü — sunucuda 11+ üretim
   sitesi var, bu bir risk) ya da sunucu tarafı çizim kütüphanesi (hafif, ama
   grafikler daha sade).

Sıra:

1. `clients` tablosuna iletişim alanları (`contact_email`, `contact_name`) —
   Bilgi Bankası ekranından düzenlenir. Ön ayara değil **müşteriye** ait:
   iletişim bilgisi boost ön ayarının parçası değil.
2. Rapor verisi uç noktası (tarih aralığı + workspace → özet metrikler).
3. PDF üretici servis.
4. E-posta servisi + şablon; gönderim **BullMQ işi** olarak — HTTP isteği
   içinde e-posta göndermek, sağlayıcı yavaşladığında paneli kilitler.
5. Gönderim öncesi **önizleme ve açık onay**: müşteriye giden bir e-posta geri
   alınamaz.

---

## Özet — ne yapıldı, ne kaldı

| # | Konu | Durum |
|---|---|---|
| 1 | İzolasyonun kanıtı (10 RLS testi) | **yapıldı** |
| 1 | Müşteri değiştirici çakışması | **yapıldı** |
| 2 | Menü RBAC süzgeci + testler | **yapıldı** |
| 2 | Menünün 2 bölüme sadeleştirilmesi | **yapıldı** |
| 3 | Ekip listesinden müşteri hesaplarının çıkarılması | **yapıldı** |
| 3 | `mustChangePassword` uygulanmıyor | **açık, istek dışı** |
| 4 | Workspace bazlı bağlantı | **yapıldı** |
| 4 | `initial_backfill` tetikleyicisi | kaldı — küçük |
| 5 | 14 gün / bu ay / geçen ay / özel aralık | kaldı — küçük |
| 6 | İletişim e-postası alanı, PDF, e-posta | kaldı — büyük, iki karar + bir sır gerekiyor |

---

## 7. Haritanın bulduğu, istek listesinde OLMAYAN iki açık

Bunlara dokunulmadı; bilinmeleri gerekiyor.

### Mobilde panelde GEZİNME YOK

Kenar çubuğu `hidden ... lg:flex` — 1024px altında tamamen kayboluyor ve
yerine hiçbir şey konmamış: hamburger, çekmece ya da alt gezinme yok. Depo
genelinde `lg:hidden` / `max-lg:` sınıfı **hiç geçmiyor**, yani "yalnızca
mobilde görünen" tek bir öğe bile yazılmamış.

Daha kötüsü: `LogoutButton` ve kullanıcı bloğu da kenar çubuğunun içinde. Yani
mobilde kullanıcı sayfa değiştiremediği gibi **çıkış da yapamıyor**.

### `mustChangePassword` bir koruma DEĞİL

Alan iki yerde yazılıyor (`createMember`, `seed-portfolio`) ve **hiçbir yerde
okunmuyor** — giriş, oturum kurulumu, `SessionResponse` tipi ve panelin hiçbir
yeri. Yöneticinin belirlediği geçici parola, kullanıcı isterse kalıcı.

Zorlamayı yazacak kişi için iki tuzak:

1. Alan hiçbir yerde **temizlenmiyor** de. `changePassword` ve
   `confirmPasswordReset` yalnızca `password_hash` güncelliyor — sıfırlamayı
   iki yola da eklemezsen zorlama bir **kilit döngüsü** olur.
2. Panelde **parola değiştirme ekranı yok.** `POST /auth/password/change` ucu
   var ama `apps/web` içinde onu çağıran tek satır bile yok. Zorlamadan önce
   o ekran yazılmalı, yoksa kullanıcı zorlanır ve yapabileceği bir şey olmaz.

`schema.prisma`'daki yorum "kullanıcı her ekranda uyarı görüyor" diyordu;
yanlıştı ve düzeltildi — olmayan bir korumanın var sanılması, hiç olmamasından
kötü.
