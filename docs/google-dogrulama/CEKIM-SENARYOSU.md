# Google OAuth demo videosu — çekim senaryosu

Ret gerekçesi: video her scope'un uygulamadaki işlevini, neden daha dar bir
scope'un yetmediğini ve yazma izinlerinde sonucun kullanıcının Google
hesabında göründüğünü göstermiyordu. Bu senaryo altı scope'u tek tek,
"Advetics'te yap → Google'da gör" çiftleriyle gösteriyor. Scope gerekçeleri
[`BULGULAR.md` § 5](BULGULAR.md).

## 0. Çekimden önce (ATLAMA)

**Ajansın canlı bağlantısına dokunulmaz.** 15 Ekim'de demo kaydı sırasında
ajansın Google bağlantısı kaldırıldı. Google'ın "staging/test ortamı kullan"
uyarısına uygun düzen:

- **Ayrı Google hesabı** (örn. Profaj'ın demo Gmail'i). Bu hesabın erişimi:
  küçük bir Google Ads hesabı (gerçek hesap; Google Ads "test hesabı"
  üretim geliştirici anahtarıyla açılmıyor), bir demo GTM hesabı, bir demo
  GA4 hesabı. Ajansın MCC'sine ve müşteri hesaplarına erişimi OLMASIN.
- **Ayrı demo şirketi/workspace** Advetics'te (örn. "Demo Co"); bağlantıyı
  orada kur. Videonun sonundaki "bağlantıyı kaldır" sahnesi YALNIZ bu
  bağlantıda. Kaldırmadan önce önizleme penceresindeki hesap listesini oku:
  yalnız demo hesapları olmalı.
- **Demo site:** GTM yayını gerçek bir sitede etiketi canlıya alır. Profaj'a
  ait, müşterisi olmayan bir alan (örn. demo alt alan adı) kullan.
- **Kurulumda Google Ads için "mevcut hesap" seç**, "yeni hesap aç"ı SEÇME:
  `createCustomerClient` MCC altında geri alınamayan bir hesap açar.
- Kampanya yazma sahnesinde demo Ads hesabındaki DURAKLATILMIŞ bir
  kampanyayı kullan; bütçe değişikliği küçük ve geri alınacak.
- Panel dili **English** (Hesabım → dil); tarayıcı İngilizce. Kurulum
  sihirbazı (`/kurulum`) henüz Türkçe: o sahnelerde ekrana İngilizce alt
  yazı koy ya da sesli anlat.
- Tarayıcı adres çubuğu her sahnede GÖRÜNÜR olmalı; tam ekran yok.
- Önce `https://myaccount.google.com/permissions` sayfasından demo hesabının
  Advetics iznini kaldır: onay ekranı baştan, bütün scope'larla çıksın.
- Kayıt 1080p, sesli anlatım ya da alt yazı İngilizce. Video YouTube'a
  **Unlisted** yüklenir.

## 1. Sahneler

Her sahnede alt yazı kalıbı: **"Scope: … — Used for: … — Why not narrower: …"**

### Sahne 1 — Uygulama ve adresler (0:00–0:30)

1. `https://advetics.com/en` aç; ana sayfayı kaydır, alt bilgide
   **Privacy Policy** bağlantısına tıkla → `https://advetics.com/en/privacy`.
2. Alt yazı: "Advetics is a reporting and management panel for advertising
   agencies. Home page and privacy policy are publicly accessible."

### Sahne 2 — OAuth onay ekranı, akış A (0:30–1:15)

1. `https://advetics.com/login` → demo kullanıcısıyla giriş.
2. Settings → Connections (`/ayarlar/baglantilar`) → Google kartı →
   **Connect**.
3. Google hesap seçici → demo hesabı. Adres çubuğunu yakınlaştır:
   `client_id=355436290681-…` ve `scope=…adwords` görünsün.
4. Onay ekranında uygulama adı "Advetics" ve "See, edit, create and delete
   your Google Ads accounts and data" satırı → **Allow**.
5. Advetics'e dönüş: bağlantı kartında demo Ads hesabı listede.

### Sahne 3 — `adwords` OKUMA (1:15–2:00)

1. Workspace'e demo Ads hesabını ata (izleme açılır, geçmiş kuyruğa
   girer); ardından **Ads Manager** (`/ads-explorer`): kampanyalar,
   harcama, tıklama.
2. Yan sekmede `ads.google.com` → aynı hesap → aynı tarih aralığı: aynı
   kampanyalar ve sayılar.
3. Alt yazı: "adwords: read campaigns and metrics via
   GoogleAdsService.search. Google Ads API has a single scope; there is no
   read-only Ads scope."

### Sahne 4 — `adwords` YAZMA (2:00–3:00)

1. Ads Manager'da duraklatılmış demo kampanyasını **Enable** et
   (ya da etkin kampanyayı **Pause**). Bütçeyi değiştir (örn. 50 → 55).
2. `ads.google.com` → kampanya listesini yenile: durum ve bütçe değişmiş.
3. Tools → **Change history**: değişiklik "Advetics" API kullanıcısı / demo
   hesabıyla ve saatle görünüyor.
4. Advetics'te geri al (eski durum ve bütçe); Google'da yine görünsün.
5. Alt yazı: "adwords (write): CampaignService / CampaignBudgetService
   mutate. Change is visible in Google Ads change history."

### Sahne 5 — Akış B: ölçüm izinleri (3:00–3:45)

1. **Brand Center** (`/marka-merkezi`) → Data sources → **Grant Analytics
   access** (kurulum bölümündeki ölçüm izni düğmesi de aynı akışı açar).
2. Google onay ekranı: Tag Manager ve Analytics satırları listelenir
   (incremental authorization; daha önce verilen Ads izni korunur).
   Adres çubuğunda beş scope okunacak kadar yakınlaştır. Google her izni
   ayrı kutuyla soruyor: **bütün kutuları işaretle** (biri boş kalırsa
   Advetics "Ölçüm izinleri eksik" der) → **Continue**.
3. Alt yazı: "Measurement scopes are requested only when the user starts
   conversion tracking setup, not at first connection."

### Sahne 6 — `tagmanager.edit.containers` (3:45–4:45)

1. Setup wizard (`/kurulum`) → demo site adresi → Google Ads: **existing
   account** → Tag Manager: demo konteyner (ya da "new container") →
   Analytics: "new property" → başlat.
2. Etiket adımı bitince `tagmanager.google.com` → demo konteyner →
   Workspaces: **"Advetics"** çalışma alanı; içinde Tags (GA4, Google Ads
   conversion), Triggers, Variables.
3. Alt yazı: "tagmanager.edit.containers: create the workspace, tags,
   triggers and variables. tagmanager.readonly cannot write tags."

### Sahne 7 — `tagmanager.edit.containerversions` (4:45–5:15)

1. GTM → **Versions**: Advetics'in oluşturduğu yeni sürüm (ad/açıklama ve
   saat).
2. Alt yazı: "tagmanager.edit.containerversions: create a container
   version from the workspace. edit.containers does not allow creating
   versions."

### Sahne 8 — `tagmanager.publish` (5:15–5:50)

1. GTM → Versions: aynı sürüm **Live / Published**; Overview'da "Live
   version" numarası aynı.
2. Demo siteyi aç → Tag Assistant ya da sayfa kaynağı: `GTM-XXXX` yüklü.
3. Alt yazı: "tagmanager.publish: publish the version so the tags go live.
   Publishing has no narrower scope."

### Sahne 9 — `analytics.edit` (5:50–6:40)

1. `analytics.google.com` → Admin → demo hesap: Advetics'in açtığı yeni
   **property**; Data streams → web akışı (demo site); Product links →
   **Google Ads links** → demo Ads hesabı; Events → Key events →
   `generate_lead`.
2. Alt yazı: "analytics.edit: create the GA4 property, web data stream,
   Google Ads link and key event. analytics.readonly cannot create or
   link."

### Sahne 10 — `analytics.readonly` (6:40–7:20)

1. Advetics → Brand Center → Data sources → GA4 kartı: oturum/kullanıcı
   sayıları (Data API `runReport`).
2. `analytics.google.com` → aynı mülk → Reports → aynı tarih aralığı: aynı
   sayılar. (Yeni mülkte veri yoksa: veri içeren eski demo mülkünü göster.)
3. Alt yazı: "analytics.readonly: read reports with the GA4 Data API. The
   Data API accepts analytics.readonly, not analytics.edit; it is the
   narrowest scope for reading."

### Sahne 11 — İzni geri alma (7:20–8:00)

1. Settings → Connections → **demo** Google bağlantısı → Disconnect →
   önizlemede yalnız demo hesapları → onayla.
2. `https://myaccount.google.com/permissions` → Advetics listede YOK
   (Advetics token'ı `oauth2.googleapis.com/revoke` ile geri aldı).
3. Alt yazı: "On disconnect Advetics revokes the token; access disappears
   from the user's Google Account."

## 2. Çekim sonrası

- Sahne 4'teki kampanya durumu ve bütçesi eski hâlinde mi: Google Ads'te
  kontrol et.
- Demo GTM'deki "Advetics" etiketleri demo sitede kalabilir; müşteri
  sitesinde olmadığından zararsız.
- Video bağlantısını [`YANIT-MAILI.md`](YANIT-MAILI.md) içindeki yere yaz.
