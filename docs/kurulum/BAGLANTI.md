# Kurulum rehberi: izinler ve bağlantı (bir kez yapılır)

Kurulum rehberi (Marka Merkezi › Kurulum) Meta ve Google'da hesap açıyor,
Tag Manager'a etiket yazıp yayınlıyor ve Analytics mülkü kuruyor. Bunun için
platformlarda BİR KEZ yapılacak ayarlar aşağıda. Kod bunları yapamaz:
Google Cloud ve Meta uygulama ayarları uygulama sahibinin hesabında.

## 1. Google Cloud (Advetics'in OAuth uygulaması)

`GOOGLE_CLIENT_ID`'nin bulunduğu Google Cloud projesinde:

1. **API'leri aç** — APIs & Services › Library, üçünü ara ve **Enable**:
   - Tag Manager API
   - Google Analytics Admin API
   - Google Analytics Data API
2. **İzinleri onay ekranına ekle** — Google Auth Platform › Data access
   (eski adı OAuth consent screen › Scopes) › Add or remove scopes, şu beşini
   ekle ve kaydet:
   - `https://www.googleapis.com/auth/tagmanager.edit.containers`
   - `https://www.googleapis.com/auth/tagmanager.edit.containerversions`
   - `https://www.googleapis.com/auth/tagmanager.publish`
   - `https://www.googleapis.com/auth/analytics.edit`
   - `https://www.googleapis.com/auth/analytics.readonly`
3. **Uygulama durumu** — Audience sayfası:
   - *Testing* ise: izni verecek Google hesabını (ajansın Google Ads'e bağlı
     hesabı) **Test users** listesine ekle. Testing'de yenileme token'ı 7
     günde düşer; kalıcı kullanım için *In production*.
   - *In production* ise: hassas izinler Google doğrulaması ister (haftalar
     sürebilir). Doğrulanana kadar onay ekranında "Google bu uygulamayı
     doğrulamadı" uyarısı çıkar: **Gelişmiş › Advetics'e git** ile geçilir,
     100 kullanıcı sınırı vardır. Ajansın kendi kullanımı için yeterli.

## 2. Advetics'te izni vermek

1. Workspace'i seç › **Marka Merkezi › Kurulum**.
2. "Tag Manager ve Analytics izni" satırında **Ölçüm izinlerini ver**.
3. Google'da Advetics'e bağlı OLAN hesabı seç (Bağlantılar'daki Google
   bağlantısının hesabı) ve bütün kutuları işaretle. Google Ads izni korunur
   (`include_granted_scopes`), bağlantı kopmaz.
4. Kurulum sayfasına dönülür; satır "İzin verildi" olur.

Bu Google hesabının:
- Tag Manager'da konteyner açılacak hesapta **Yönetici** ve yayın yetkisi,
- Analytics'te mülk açılacak hesapta **Düzenleyici** ya da **Yönetici**,
- Google Ads'te bağlanacak hesapta **Yönetici** (Analytics ↔ Ads bağlantısı
  için) erişimi olmalı.

Tag Manager ve Analytics'te HESAP API'den açılamıyor: ajansın bir Tag
Manager hesabı ve bir Analytics hesabı yoksa tagmanager.google.com ve
analytics.google.com'da bir kez açılır (şartlar tarayıcıda kabul ediliyor).
Proje başına konteyner ve mülkü rehber açar.

## 3. Google Ads'te yeni hesap açmak

- Yalnız **yönetici hesap (MCC)** altında açılabiliyor. Bağlı Google hesabı
  MCC'de kullanıcı olmalı; rehberin listesi Advetics'in keşfettiği MCC'lerden.
- Geliştirici token'ı en az **Basic access** olmalı (test token'ı gerçek
  hesap açamaz).
- Ödeme yöntemini API ekleyemiyor: şirket Google Ads › Faturalandırma'dan
  ekler, rehberde **Kontrol et**.
- Şirketin kendi hesabı varsa **Davet gönder**: şirket Google Ads › Yönetici
  hesaplar'dan kabul eder.

## 4. Meta'da yeni reklam hesabı açmak

- Bağlı Facebook kullanıcısı, hesabın açılacağı **Business Manager'da
  yönetici** olmalı.
- Uygulamanın `business_management` ve `ads_management` izinleri var
  (Bağlantılar'da eksik izin görünmüyor). Meta yine de BM başına açılabilecek
  reklam hesabı sayısını harcamaya göre sınırlıyor; sınırdaysa Meta'nın mesajı
  adımın altında görünür.
- Saat dilimi: aynı BM'de İstanbul saatli bir hesap olmalı (kimlik oradan
  okunuyor, tahmin edilmiyor). Yoksa hesabı Meta'da açıp "mevcut" seçin.
- Ödeme yöntemi şirketin işi: Meta Faturalandırma, sonra **Kontrol et**.
- Facebook sayfası API ile açılamıyor: sayfayı Facebook'ta açıp BM'e ekleyin,
  Bağlantılar'da **Hesapları yenile**, sonra rehberde seçin.

## 5. Şirket kendi hesaplarıyla kuruyorsa

Kurulum'da "Şirketin kendi hesaplarında"yı seçin; şirket Bağlantılar'dan
kendi Meta ve Google'ını bağlar. Hesaplar onun Business Manager'ında açılır;
Google Ads'te MCC'si yoksa hesabı ads.google.com'da açıp rehberde seçer.
