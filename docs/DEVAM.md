# Devir belgesi — nerede kaldık

**Son güncelleme:** 2026-08-15 · **Son commit:** `54e4740`

---

## 0. TAMAMLANDI — bağlantı modeli ajans seviyesine çevrildi

**1–6. adımların tamamı bitti** (§0.1 ve §0.2). Bu bölüm işin NEDEN yapıldığını
ve nasıl karara bağlandığını anlatıyor; sonuç ve kalan açıklar §0.1–0.2'de.
Aşağıdaki bölümler (§1 ve sonrası) 13 Ağustos'taki Meta durumunu anlatıyor ve
hâlâ geçerli.

> **Sıradaki iş** artık §3 (bekleyen operasyonel işler — Meta canlı modu, webhook
> token'ı, parola rotasyonu) ve §4 (geliştirme adayları).

### Sorun

Bağlantılar **müşteri bazlı**: `platform_connections.client_id` zorunlu ve
keşfedilen hesap, bağlantının kurulduğu müşteriye yazılıyor
(`connections.service.ts` → `discoverAndStore`, `clientId: conn.clientId`).

Ajansın tek bir Meta kimliği **157**, tek bir Google girişi **127** reklam
hesabına erişiyor. 12 müşteri için bu modelde aynı kimliği 12 kez
yetkilendirmek gerekiyor ve iki şey birden bozuluyor:

- Her müşteri kendi kopyasında yine 157 hesabı görüyor → 12 × 157 satır.
- Aynı kimlik tekrar tekrar yetkilendirildiği için platform tarafında önceki
  token geçersizleşiyor. **Canlıda gözlendi:** bir müşteriye hesap bağlanınca
  diğerinin bağlantısı kopuyor.

Kod bu kopmanın sebebi DEĞİL. Bağlantı `clientId + platform + externalUserId`
üçlüsüyle upsert ediliyor, yani başka müşterinin satırına dokunmuyor; bağlantıyı
iptal eden tek yer elle "Kaldır" akışı. Sorun modelin kendisinde.

### Hedef

Bağlantı **ajansa** ait olur. Meta bir kez bağlanır, 157 hesap havuza düşer,
her müşteriye hangi hesapların ait olduğu panelden seçilir. Tekrar
yetkilendirme yok, dolayısıyla kopma da yok. Bu, Socianty'de çalışan model.

### Neden düşünülenden büyük

**Ne `platform_connections` ne `ad_accounts` tablosunda `org_id` var** — ikisi
de yalnızca `client_id` taşıyor. Yani "ajansa ait bağlantı" ve "henüz
atanmamış hesap" kavramlarının veritabanında tutunacağı bir yer yok.

| # | Adım | Risk | Durum |
|---|---|---|---|
| 1 | İki tabloya `org_id` ekle | Düşük | ✅ bitti |
| 2 | `client_id`'yi nullable yap (atanmamış havuz) | **Yüksek — 125 kod noktası** | ✅ bitti |
| 3 | **RLS politikalarını yeniden yaz** | **Yüksek — 126 politika satırı** | ✅ bitti |
| 4 | Tekillik kısıtı `[clientId,…]` → `[orgId,…]` | Orta | ✅ bitti |
| 5 | Keşif kodu havuza yazsın | Düşük | ✅ bitti |
| 6 | Hesap atama uç noktası + arayüz | Düşük | ✅ bitti |
| ~~7~~ | ~~Mevcut hesapları taşı~~ | **GEREKSİZ — aşağıya bak** | — |

### 2026-08-15: veritabanı sıfırlandı, 7. adım ortadan kalktı

`db:reset-clients` çalıştırıldı. Silinen: 14 müşteri, 8 bağlantı, **1.134
reklam hesabı**, 712 kampanya, 11.222 metrik satırı, müşteriye bağlı 12
üyelik. Kalan: 3 kullanıcı, organizasyon, marka profili, org geneli üyelik.

Migration'ı önemli ölçüde kolaylaştırıyor:

- **7. adım tamamen gereksiz.** Taşınacak veri yok; en riskli ve geri alması
  en zor adım buydu.
- **2. ve 4. adımın VERİ riski sıfır.** Boş tabloda `DROP NOT NULL` ve kısıt
  değişikliği anında ve güvenli.
- Geriye kalan risk tamamen **kod tarafında**.

### Ölçülmüş yayılma alanı (tahmin değil, sayıldı)

```
apps/api/src içinde .clientId erişimi     125 nokta
02_rls.sql içinde client_id geçen satır   126
platform_connections clientId kullanımı     9
```

125 noktanın hepsi kırılmayacak, ama `enqueueSyncJob({ clientId:
account.clientId })` gibi `string` bekleyen yerler `string | null` alınca
derlenmeyecek. Her biri bilinçli bir karar istiyor: bu yol atanmamış hesapla
çalışabilir mi, yoksa erken hata mı vermeli?

**Doğru varsayılan: erken hata.** Atanmamış bir hesap için senkronizasyon
kuyruğa GİRMEMELİ — girerse `client_id`'si NULL bir `sync_jobs` satırı oluşur,
RLS onu kimseye göstermez ve iş sessizce kaybolur. Bu projenin klasik hata
deseninin ta kendisi.

`pnpm typecheck` bu adımda yol gösterici: derleyici nullable'ın dokunduğu her
yeri tek tek söyleyecek. Listeyi baştan çıkarmaya çalışma, derleyiciyi takip
et.

**3. adım neden en kritik:** `client_id` nullable olduğu anda, politikası
yazılmamış her satır KİMSEYE AİT OLMAYAN bir satır. Yanlış yazılan tek bir
politika atanmamış hesapları yanlış kiracıya açar. Beklenen şekil:

```sql
-- bağlantılar: org bazlı
USING (org_id = app.current_org_id())

-- hesaplar: atanmamış olan yalnızca org yöneticisine görünür
USING (
  org_id = app.current_org_id()
  AND (
    CASE WHEN client_id IS NULL
      THEN app.is_org_admin()
      ELSE app.can_access_client(client_id)
    END
  )
)
```

**RLS'i testler yakalamıyor** (CLAUDE.md §3). Koşum ortamı politikaları
kurduktan sonra zorlamayı kapatıyor. `active-client-scope.spec.ts` fonksiyon
mantığını doğrudan çağırarak sınayabiliyor — aynı yöntem buraya da
uygulanmalı — ama tablo politikalarını hiçbir test görmüyor. Politikalar ELLE
gözden geçirilecek.

> **Bu artık geçerli değil** — §0.1'e bak. `SET ROLE` ile politikalar test
> ortamında da uygulanabiliyor ve tablo politikaları test edildi.

**7. adım geri alması zor:** canlı veritabanında 284 satırın sahipliği
değişiyor. Migration'dan önce yedek alınmalı.

### Sıra

1–4 tek migration'da gitmeli (yarım uygulanmış şema = kırık keşif kodu).
5–6 ardından, 7 en son ve ayrı.

---

## 0.1. 1–4. adımlar YAPILDI — ne değişti, sırada ne var

Migration: `20260815120000_agency_connections`. Şema, RLS, kısıtlar ve derleyen
kod tek commit'te. **745 API testi geçiyor** (öncesi 726; 19'u bu işin yeni
testleri). `pnpm typecheck` API ve panelde temiz.

### Ölçülen yayılma tahminden küçük çıktı

125 `.clientId` noktasından **yalnızca 25'i** derleyiciyi düşürdü ve bunlar 8
dosyaya toplanmıştı. Sebebi tipin çoğu yerde `AdAccount`'tan değil, kendi
`client_id`'si NOT NULL olan alt tablolardan (kampanya, metrik, kural) gelmesi.
Planın "listeyi baştan çıkarma, derleyiciyi takip et" tavsiyesi doğru çıktı.

### Kararlar

- **Atanmamış hesap = erken hata.** `assertAssigned()`
  ([ad-account-assignment.ts](../apps/api/src/common/utils/ad-account-assignment.ts))
  yapı ve metrik senkronizasyonunun girişinde duruyor. `setAccountSync` de
  atanmamış hesabın izlemeye alınmasını reddediyor — doğrulama kullanım anında
  değil, GİRİŞ anında.
- **Toplu yollarda atlamak, ama sayarak.** Süpürme işi atanmamış hesabı geçiyor
  ve kaç tane geçtiğini log'a yazıyor. `sync -- portfolio` havuzdaki hesap
  sayısını başta basıyor.
- **`ON DELETE SET NULL`.** Müşteri silinince hesap ve bağlantı ölmüyor,
  havuza dönüyor. `db:reset-clients` buna göre güncellendi: bağlantı ve
  hesabın kalması artık "eksik cascade" alarmı üretmiyor.
- **Kompozit yabancı anahtar** `(client_id, org_id) → clients(id, org_id)`:
  hesap başka organizasyonun müşterisine atanamıyor. RLS'in iki koşulunun
  birbirini doğrulamasını veritabanı garantiliyor.
- **Sosyal profiller kapsam dışı** (`social_profiles.client_id` hâlâ NOT NULL).
  Ajans geneli bağlantıda sayfa keşfi ATLANIYOR; atlandığı log'a ve keşif
  özetine yazılıyor. 5. adımda karara bağlanmalı.

### RLS artık TEST EDİLİYOR

Plan "politikaları testler yakalamıyor, elle gözden geçir" diyordu. Artık
gerek yok: `SET ROLE` ile sahibi olmayan bir role geçince PGlite politikaları
gerçekten uyguluyor. `ad-account-pool-rls.spec.ts` bunu yapıyor — deponun ilk
gerçek tablo politikası testi. Aynı yöntem başka tablolara da uygulanabilir.

### 6. ADIM İÇİN BAĞLAYICI NOT — deneyle bulundu

Atama uç noktası bağlamı **`activeClientId: null`** ile kurmak zorunda:

```ts
this.prisma.withTenant({ ...ctx, activeClientId: null }, (tx) => …)
```

Sebebi Postgres kuralı: bir UPDATE'ten sonra **yeni satır, tablonun SELECT
politikasından da geçmek zorunda**. `can_access_client()` panelde seçili
müşteriye daraltıyor; org yöneticisi A müşterisi seçiliyken havuzdaki bir
hesabı B'ye atamaya çalışırsa satır kendi görüş alanının dışına çıkıyor ve
Postgres reddediyor:

```
new row violates row-level security policy for table "ad_accounts"
```

**WITH CHECK'i gevşetmek çözmüyor** — denendi, engel SELECT politikasında.
SELECT politikasındaki daraltmayı kaldırmak ise ASLA doğru değil: tam olarak o
daraltma, yöneticinin Çiftçi Grup seçiliyken Mirnas'ın verisini görmesi
hatasının düzeltmesiydi. Davranış `ad-account-pool-rls.spec.ts` içinde
kilitli.

---

## 0.2. 5–6. adımlar YAPILDI — model tamamlandı

Migration: `20260815160000_agency_oauth_state`. **757 API testi geçiyor**
(1–4'ten sonra 745'ti). Her iki uygulama da derleniyor.

### Akış artık şöyle

1. **Bağlan** — Platform Bağlantıları ekranı müşteri seçimi İSTEMİYOR.
   `oauth_states.client_id` nullable oldu; ajans geneli akışta NULL yazılıyor.
2. **Keşfet** — erişilen bütün reklam hesapları HAVUZA düşüyor
   (`client_id IS NULL`), varsayılan olarak izleme kapalı.
3. **Ata** — `PATCH /connections/ad-accounts/:id/client`, gövde
   `{ clientId: string | null }`. `null` = havuza geri koy.
4. **İzle** — yalnızca atanmış hesap izlemeye alınabiliyor.

### Kararlar

- **Atama ve bağlantı yönetimi ORG YÖNETİCİSİ işi** (`@RequireOrgAdmin`):
  `authorize`, `reauthorize`, `disconnect`, `ad-accounts/:id/client`. RLS zaten
  aynı şeyi söylüyordu ama decorator olmadan hata "kayıt bulunamadı" ya da ham
  bir politika ihlali olarak çıkıyordu — yetki sorunu olduğu anlaşılmıyordu.
  Panelde de bu düğmeler yalnızca yöneticiye gösteriliyor.
- **Atama kalkınca izleme kapanıyor.** Açık kalsaydı hesap ekranda "izleniyor"
  görünür, süpürme işi onu eler, hiç veri gelmez ve hiçbir hata çıkmazdı.
- **`GET /connections` kapsamı isteğin kendisinden kuruluyor**, oturumdaki
  seçimden değil. Parametresizse daraltma kapalı (havuz görünür); `?clientId=X`
  varsa X'e daraltılıyor — kurallar ekranı adres çubuğundaki müşteriyle
  çalışıyor ve oturumdaki seçim başka biri olabiliyor. Eskiden bu durumda ekran
  sessizce boş bir hesap listesi gösterirdi.
- **Sosyal profiller de `?clientId` ile süzülüyor.** Bağlantı müşteriye aitken
  bu daraltma örtüktü; org geneline çıkınca kayboldu ve formlar ekranı başka
  müşterilerin Facebook sayfalarını listeleyecekti.
- **Yönetici (MCC) hesabı atanamıyor** — reklam yayınlamıyor, atamak boş bir
  senkronizasyon turu ve boşa kota demek.

### Atama iki ekrandan da yapılabiliyor

- **Platform Bağlantıları** — bağlantı bağlantı: "bu Meta kimliği neye
  erişiyor, hangisi kimin".
- **Müşteriler** — müşteri müşteri: her kart kendi reklam hesaplarını ve
  sayfalarını listeliyor, havuzdan arayıp atayabiliyor, "çıkar" ile havuza geri
  koyabiliyor. Ajans müşteri müşteri çalışıyor; havuzda 157 satır varken tek
  bir hesabın kime ait olduğunu bulmanın başka yolu yoktu.

Havuz listesi Müşteriler ekranında **listelenmiyor, aranıyor** — 12 kartın her
birine 157 satır basmak ekranı kullanılamaz hâle getirirdi. Havuz zaten
yalnızca org yöneticisine dönüyor (RLS), yani müşteri düzeyindeki kullanıcı
kendi varlıklarını görüyor ama atama kontrollerini görmüyor.

---

## 0.3. Sosyal profiller de havuz modelinde

Migration: `20260815180000_agency_social_profiles`. **769 API testi geçiyor.**

5–6. adımlarda `social_profiles` kapsam dışı bırakılmıştı ve sonucu somuttu:
ajans geneli bir bağlantıda sayfa keşfi HİÇ YAPILAMIYORDU (kolon zorunluydu,
hangi müşteriye yazılacağı bilinmiyordu). Yani Auto-Boost, lead formları ve
reklam yayını sayfa göremiyordu. Artık reklam hesaplarıyla birebir aynı model.

**Bir yamayı da kaldırdı:** `organic-sync` ve `lead-sync`, org kimliğini müşteri
üzerinden JOIN'leyerek buluyordu ve o yolda bir kez `org_id` kolonuna MÜŞTERİ
kimliği yazılmıştı — RLS hiçbir satırı eşleştirmemiş, gönderiler panelde hiç
görünmemişti. Kolon artık sayfanın kendisinde.

**Tekillik bağlantı bazından org bazına geçti.** Eski kısıt
`(connection_id, external_id)` idi; ikinci bir Meta kimliği bağlandığında aynı
Facebook sayfası iki satır olurdu — reklam hesaplarında tam olarak bu, üretimde
1.134 mükerrer satır üretmişti.

**Atanmamış sayfada ne olur, nerede yazar:**

| Yol | Davranış |
|---|---|
| Organik gönderi senkronizasyonu | Süpürmede atlanır, sayısı log'a yazılır |
| Lead webhook'u | Kayıt YAZILMAZ, `error` seviyesinde loglanır (Meta'ya 200 döner, yoksa abonelik kapanır) |
| Lead formu oluşturma | "Bu sayfa henüz bir müşteriye atanmamış" |
| Reklam taslağı | Aynı mesaj |
| Boost kuralı | Aynı mesaj + organik gönderi çekilmediği uyarısı |

**Sayfanın müşterisi DEĞİŞİRSE geçmiş taşınmıyor** — formlar ve toplanmış
kayıtlar eski müşteride kalıyor. Bir markanın topladığı potansiyel müşteriler
başka bir markanın CRM'ine geçemez. Kaç form kaldığı yanıtta dönüyor ve panelde
uyarı olarak gösteriliyor; söylenmezse kullanıcı formlarını kaybettiğini sanar.

---

Bu belge yeni bir oturumun (ve yeni bir hesabın) kaldığı yerden devam
edebilmesi için. Ayrıntılı durum [`DURUM.md`](DURUM.md) içinde; çalışma
kuralları kök dizindeki [`CLAUDE.md`](../CLAUDE.md) içinde ve her oturumda
otomatik yükleniyor.

---

## 1. Tam olarak nerede durduk

**Meta yayın yolu kodda tamamlandı, platform yapılandırmasında takıldı.**

13 Ağustos'ta arşiv testi sırasında **ilk gerçek Meta yazma çağrısı** yapıldı.
Altı hata çıktı, altısı da düzeltilip teste bağlandı. Yedinci engel kod değil:

```
subcode=1885183 — Reklam kreatif gönderisi, geliştirme modundaki bir uygulama
tarafından oluşturuldu.
```

**Kullanıcının yapması gereken:** Meta uygulamasını developers.facebook.com
üzerinden **Geliştirme → Canlı** moduna almak. Anahtar panelin üstünde, uygulama
adının yanında (ya da sol menüde "Uygulama İncelemesi" sayfasının başında).
Açılmıyorsa Meta şunları istiyor: gizlilik politikası adresi
(`https://advetics.com/gizlilik` — var), uygulama simgesi 1024×1024, kategori,
veri silme geri araması (`POST /connections/meta/data-deletion` — var).

Canlı moda geçince tekrar denenmeli. İki sonuçtan biri gelecek:

- **Reklam oluşur** → kendi ajans hesaplarında canlı mod + standart erişim
  yetiyor demektir.
- **`ads_management` Advanced Access hatası** → App Review gerekiyor; müşteri
  hesaplarına erişim onaya kadar bekler.

> **Uyarı:** Kullanıcı bu ararken uygulama ayarlarındaki *"Native or desktop
> app?"* anahtarını açtı. **Kapalı olmalı** — Advetics sunucuda çalışan bir web
> uygulaması, app secret tarayıcıya gitmiyor. Açık bırakmak OAuth doğrulama
> davranışını değiştirip mevcut bağlantıları bozabilir.

## 2. 13 Ağustos'ta canlıda öğrenilenler

Hiçbiri birim testiyle yakalanamazdı. Hepsi kalıcı teste bağlandı.

| # | Hata | Sessiz miydi |
|---|---|---|
| 1 | 3. adım metinsiz taslak kaydedemiyordu — görsel eklemek taslak gerektiriyor ama metin 4. adımda soruluyor | Hayır |
| 2 | Hata mesajı formun en altında, ekran dışında beliriyordu | **Evet** — "tıkladım, bir şey olmadı" |
| 3 | `act_act_...` çift önek | Hayır ama mesaj *yetki sorunu* gibi okunuyordu |
| 4 | `is_adset_budget_sharing_enabled` eksik (Meta'nın yeni zorunlu alanı) | Hayır |
| 5 | Form kimliği ad set'e konmuş + çok görselli yolda **hiç yok** | **Evet** — buton hiçbir yere gitmeyen reklam |
| 6 | Teklif stratejisi platformun varsayılanına bırakılmış | **Evet** — aynı taslak iki müşteride farklı davranır |

**Ders:** yazma yollarının "test edildi" sayılabilmesi için canlı bir çağrı
şart. Ne kadar birim testi yazılırsa yazılsın bu altısı görünmezdi.

Ayrıca `http.ts` içine **yapılacak iş ipucu** katmanı eklendi: kod
değişikliğiyle çözülemeyen Meta alt kodlarına (şimdilik yalnızca 1885183)
mesajın sonunda ne yapılacağı yazılıyor. Kodla çözülecek hatalara ipucu
eklenmiyor — yanlış yönlendirme olurdu.

## 3. Bekleyen operasyonel işler

Bunlar koda değil, sunucuya/hesaplara ait. Hiçbiri yapılmadı:

- [ ] **`META_WEBHOOK_VERIFY_TOKEN`** sunucuda **depo kökündeki** `.env` içine
      eklenmeli (CLAUDE.md §2 — `apps/api/.env` YOK, o yol bir kez zaten
      yanlış teşhise yol açtı) ve
      Meta uygulama panelinde webhook URL'i `https://advetics.com/api/leads/webhook`
      olarak kaydedilmeli. **Bu yapılmadan hiçbir lead bildirimi gelmez.**
- [ ] **Google hesap listesi bayat** — DB'de 29 hesap, keşifte 129 bulunmuştu.
      Platform Bağlantıları → "Hesapları yenile".
- [ ] **`db:seed-portfolio` çalıştırılmadı.** 12 müşteri + 3 kullanıcı seed'i
      hazır; parolalar ortam değişkeninden okunuyor
      (`SEED_ADMIN_PASSWORD`, `SEED_YUSUF_PASSWORD`, `SEED_ECEM_PASSWORD`).
- [ ] **Parola rotasyonu.** Geliştirme sırasında sohbete yapıştırılan sırlar
      var: site kullanıcısı SSH parolası, üç DB parolası, Meta app secret ve
      üç kullanıcı parolası. Hepsi değiştirilmeli.
- [ ] **Meta Business Verification + App Review** (`ads_management`,
      `leads_retrieval`). Yazma yollarının tamamı buna bağlı.

## 3.5. 14–15 Ağustos'ta yapılanlar

Hepsi canlıda. Doğrulanmayı bekleyenler işaretli.

| Commit | Ne | Canlıda doğrulandı |
|---|---|---|
| `9d1e2d3` | Tanıtım sayfası — kök artık `/login`'e değil ürüne açılıyor | ✅ |
| `1f97b53` | Portföy seed'i `.env`'i yanlış yerden okuyordu | ✅ |
| `a1b4396` | Meta hesapları `act_` öneki yüzünden hiç bulunamıyordu | ✅ |
| `904b939` `3d893d3` | `sync -- portfolio` toplu mod (kapsam zorunlu) | ❌ hiç koşulmadı |
| `159e9a8` | Müşteriler + Ekip ekranları, menüde 9 ölü bağlantı kapatıldı | ✅ |
| `ff20b72` | **Aktif müşteri süzgeci** — seçili müşteri veriyi daraltmıyordu | 🟡 kısmen |
| `dc28f79` | Ekip ekranı: davet, rol değiştirme, yetki kaldırma | ❌ |
| `5b98504` | Bugün ve Son 60 gün pencereleri | ❌ |
| `37a2264` | "Şimdi güncelle" düğmesi | ❌ |
| `54e4740` | Müşteriler ekranı diğer müşterilerin hesaplarını "yok" gösteriyordu | ❌ |

**Üç tuzak burada öğrenildi, üçü de teste bağlandı:**

- Menüde "hazır mı" kararı sayfanın varlığına değil MODÜL NUMARASINA
  bakıyordu; dokuz bağlantı 404 veriyordu (`nav-routes.spec.ts`).
- `prisma/` script'lerinden biri `.env`'i yanlış yoldan okuyordu ve hata
  mesajı ("Environment variable not found") insanı yanlış yere gönderiyordu
  (`seed-env-path.spec.ts`).
- Aktif müşteri seçimi hesaplanıyor ama HİÇBİR YERDE kullanılmıyordu; org
  yöneticisi hangi müşteriyi seçerse seçsin bütün müşterilerin verisini
  görüyordu (`active-client-scope.spec.ts`).

**Bilinen açık:** `mustChangePassword` alanı veritabanına yazılıyor ama
`apps/api/src` ve `apps/web/src` altında onu OKUYAN tek satır yok — zorlama
yazılana kadar seed parolaları süresiz geçerli.

## 4. Sıradaki geliştirme adayları

Kullanıcının onayladığı dört maddelik sıra tamamlandı (formlar → lead CRM →
gelişmiş kampanya oluşturucu → akıllı varlık yönlendirme), ardından varlık
arşivi de yapıldı. Açık kalanlar:

1. **Bilgi bankası ve kitle kütüphanesi** — BASE bölümünün kalan iki parçası,
   hiç başlanmadı.
2. **Bildirim altyapısı** — CENTRAL uyarılarının ve zamanlanmış raporların ön
   koşulu. Şu an hiçbir şey bildirim göndermiyor.
3. **Google yazma yolu** — hiç yazılmadı. Bu bilinçli bir sıra kararıydı:
   okuma tarafı yeni doğrulandı ve Meta'daki deneyim yazma yollarının canlı
   doğrulama olmadan güvenilmez olduğunu gösterdi.
4. **Sunucu tarafı PDF raporu**, sağlık skoru, A/B test motoru — daha sonraya.

Ayrıntılı liste ve gerekçeler: [`DURUM.md`](DURUM.md) § 7.

## 5. Yeni hesabın ihtiyaç duyacağı erişimler

Repo bunları taşıyamaz; `hello@profaj.com` tarafında ayrıca sağlanmalı:

| Ne | Nerede |
|---|---|
| GitHub deposu | `yusufProfaj/advetics` — yeni hesaba erişim verilmeli |
| Sunucu SSH | `advetics` site kullanıcısı, gerekiyorsa root — adres parola yöneticisinde |
| Depo kökündeki `.env` | Sunucuda duruyor, git'te yok. **`apps/api/.env` diye bir dosya yok** — API, panel ve `prisma/` script'leri kökten besleniyor |
| Meta uygulaması | developers.facebook.com — yönetici yetkisi |
| Google Ads | MCC erişimi + developer token |
| Sunucu paneli | CloudPanel — adres parola yöneticisinde |

**Yerel geliştirme için `.env` şart değil:** testler PGlite kullanıyor, gerçek
veritabanı istemiyor. `pnpm install` + `pnpm --filter @advetics/api test`
doğrudan çalışır.

## 6. Günlük akış

```bash
pnpm install
pnpm --filter @advetics/api test          # 705 test
pnpm --filter @advetics/api exec nest build
pnpm --filter @advetics/web exec next build
```

Deploy (sunucuda, **site kullanıcısı olarak**):

```bash
su - advetics
cd ~/htdocs/advetics.com && git pull && ./scripts/deploy.sh
```

`deploy.sh` sırayla: bağımlılıklar → `prisma generate` →
`prisma migrate deploy` → `db:rls` (kısıtlar + RLS) → derleme → pm2 reload →
sağlık kontrolü.
