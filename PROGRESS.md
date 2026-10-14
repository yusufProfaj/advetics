# PROGRESS — modül modül pazar araştırması ve güncelleme döngüsü

## Döngünün sözleşmesi (kullanıcı kararları, 2026-10-14)

- **Hedef:** her modülü pazar araştırmasıyla güncel konuma getirmek. Advetics'in
  amacı sabit: reklam bilmeyen kullanıcıya en verimli kurulumu yaptıran beyaz
  etiketli panel (CLAUDE.md "Özet").
- **Kemik yapı değişmez:** menü bölümleri, veri modeli, sağlayıcı deseni,
  RLS ve yetki modeli olduğu gibi kalır. Yeni modül ya da menü satırı
  EKLENMEZ (o, beş ajan kuralıyla ayrı iş). Mevcut ekranlara özellik
  eklenebilir.
- **Sıra:** reklam verimliliğine göre (aşağıdaki modül sırası).
- **Bir tur = bir madde.** Turlar iki türlü:
  - *Araştırma turu:* `docs/pazar/<modul>.md` yazılır. Bölümler: platform
    güncellemeleri (Meta, Google Ads, LinkedIn; API sürümü, yeni/kalkan
    özellik), rakipler (AdEspresso, Madgicx, Revealbot, Smartly, Ryze,
    AgencyAnalytics ve modüle göre diğerleri), kullanıcı şikâyetleri
    (Reddit, G2, Capterra), Türkiye pazarı (TL, KDV, Türkçe, yerel
    rakipler). Sonda ÖNCELİKLİ öneri listesi; her öneri bu dosyaya modülün
    altına `- [ ]` olarak eklenir. Kaynak adresi her iddianın yanında;
    belgeden okunan platform davranışı "ölçülmedi" diye işaretlenir
    (CLAUDE.md: canlıda ölçülmeden doğru sayılmaz).
  - *İyileştirme turu:* tek öneri ya da tek açık kapanır; test + mutasyon,
    `./scripts/dogrula.sh` yeşil, tek commit.
- **Onay kapısı:** arayüz ve özellik işleri ONAYSIZ yapılır (kullanıcı
  kararı; CLAUDE.md'deki "önce görsel taslak" kuralı bu döngü için
  askıda). Yalnız şunlar `(onay bekliyor)` olarak işaretlenip SORULUR:
  para harcayan, platforma (Meta/Google/LinkedIn) yazan, reklam yayınlayan,
  canlı veriyi silen ya da kullanıcının önceki bir ürün kararını bozan işler.
- **Döngünün işi DEĞİL:** push, deploy, migration'ı canlıya uygulamak, SSH.
  Migration YAZILABİLİR ama deploy kullanıcıya bırakılır ve maddeye
  "migration var" yazılır.
- **Her tur sonunda:** madde `[x]`, CLAUDE.md "Öğrenilenler"e gerekiyorsa
  tek satır, aynı iş ikinci kez yapıldıysa `.claude/skills/` altına skill.

## 1 · AdvCampaign (`/reklam`)

- [x] Araştırma → `docs/pazar/advcampaign.md` (Meta Advantage+ kampanya yapısı 2026, Google AI Max/PMax/Demand Gen, LinkedIn amaçları; rehberli kurulum sunan rakipler)
- [ ] Bilinen açık: taslak tablosu telefonda "Devam et"i ekran dışına itiyor; telefonda kart düzeni
- [ ] Öneri 1: bekçi testi, derleyici ASC/AAC alanı (`smart_promotion_type`, `AUTOMATED_SHOPPING_ADS`) üretmesin (Meta v26 bunları duraklatıyor)
- [ ] Öneri 2: Kontrol ekranında Advantage+ durumu ve eksik kaldıraç (bütçe/kitle/yerleşim), `advantage_state_info`ten sade dille
- [ ] Öneri 3: Google Arama kontrolünde "AI Max kapalı" kararının gerekçesi tek cümleyle
- [ ] (onay bekliyor) Öneri 4: Form amacında CRM'e dayalı optimizasyon (Meta Conversion Leads; "müşteri oldu" geri beslemesiyle)
- [ ] (onay bekliyor) Öneri 5: Form amacında 65+ yaş yoğunlaşma koruması (varsayılan üst sınır ya da kurulum sonrası uyarı)

## 2 · Akıllı Boost (`/auto-boost`)

- [ ] Araştırma → `docs/pazar/akilli-boost.md` (gönderi öne çıkarma otomasyonu: Meta boost API, IG Partnership/Trial Reels, YouTube Demand Gen; Madgicx/Revealbot otomatik boost)
- [ ] Bilinen açık: kartta "Konum 3684" ham kimlik; konum adını göster
- [ ] Bilinen açık: sayfa ilk yüklemede başka workspace'in kuyruğunu (`fd82…`) sorguluyor; teşhis ve tek kaynak
- [ ] (onay bekliyor) 12 Facebook kartı: 2026-09-30 kararı yalnız IG + YouTube; eski mi yeni mi ölç, kullanıcıya sor
- [ ] Araştırmanın 1. önerisi
- [ ] Araştırmanın 2. önerisi

## 3 · İyileştir (`/iyilestir`)

- [ ] Araştırma → `docs/pazar/iyilestir.md` (kural motorları: Revealbot, Madgicx, Optmyzr; Meta/Google otomatik kurallar ve öneri API'leri)
- [ ] Araştırmanın 1. önerisi
- [ ] Araştırmanın 2. önerisi

## 4 · AdvStrategy (`/strateji`)

- [ ] Araştırma → `docs/pazar/advstrategy.md` (medya planı araçları, Meta Reach Planner / Google Performance Planner, müşteri onay akışları)
- [ ] Bilinen açık: onay bekleyen strateji varken kart başlığı hâlâ "Strateji oluştur"; "Onay bekleyen strateji var" + "Raporu aç"
- [ ] Araştırmanın 1. önerisi
- [ ] Araştırmanın 2. önerisi

## 5 · Aylık Bütçe (`/butce`)

- [ ] Araştırma → `docs/pazar/butce.md` (bütçe ve tempo araçları, hesap harcama limiti, Meta kampanya bütçesi / Google paylaşılan bütçe)
- [ ] Bilinen açık: "13 günün 11 günü senkronize" uyarısının sebebini teşhis et (hangi günler, hangi hesap)
- [ ] Araştırmanın 1. önerisi

## 6 · Reklam Yöneticisi (`/ads-explorer`)

- [ ] Araştırma → `docs/pazar/reklam-yoneticisi.md` (Meta Ads Manager / Google Ads arayüz mantığı, çok hesaplı ajans görünümleri)
- [ ] Bilinen açık: telefonda sayfa 147 px yana taşıyor
- [ ] Araştırmanın 1. önerisi
- [ ] Araştırmanın 2. önerisi

## 7 · Raporlar (`/raporlar`)

- [ ] Araştırma → `docs/pazar/raporlar.md` (AgencyAnalytics, Whatagraph, DashThis, Looker Studio şablonları; beyaz etiket rapor beklentileri)
- [ ] Bilinen açık: rapor önizlemesi kılavuz dışı slate renkleri ve ikinci `h1` taşıyor
- [ ] Bilinen açık: önizleme telefonda sağdan kesik; genişliğe ölçeklensin
- [ ] Araştırmanın 1. önerisi

## 8 · Potansiyel Müşteriler (`/potansiyel-musteriler`)

- [ ] Bilinen açık: boş liste yanlış sebep söylüyor; Meta'da `leads_retrieval` izni yoksa bunu yaz (emptyReason + test)
- [ ] Araştırma → `docs/pazar/potansiyel-musteriler.md` (lead form CRM akışları, Meta Conversions API for CRM, Google lead form, Türkiye'de WhatsApp takibi)
- [ ] Araştırmanın 1. önerisi

## 9 · Genel Bakış (`/dashboard`)

- [ ] Bilinen açık: 1035–1280 px'te sağ sütun sıkışıyor; `xl` altında alta insin
- [ ] Bilinen açık: Hesaplar ve Kampanyalar tablolarında ad sütunu kesiliyor; en az genişlik
- [ ] Araştırma → `docs/pazar/genel-bakis.md` (ajans çok müşterili özet ekranları, anomali uyarıları)
- [ ] Araştırmanın 1. önerisi

## 10 · Marka Merkezi ve Kurulum (`/marka-merkezi`, `/kurulum`)

- [ ] Bilinen açık: workspace seçicisinde "şirket geneli" kesiliyor; Marka Merkezi "workspace seçili değil" uyarısıyla çelişiyor
- [ ] Bilinen açık: "bu workspace'e geç" uyarısı telefonda 12 satır; düğme alta
- [ ] Araştırma → `docs/pazar/kurulum.md` (onboarding sihirbazları, GTM/GA4/CAPI kurulum araçları, Stape, Meta Events Manager kurulum rehberleri)
- [ ] Araştırmanın 1. önerisi

## 11 · Varlıklar (`/varliklar`)

- [ ] Bilinen açık: süzgeç çiplerinde sayı etikete bitişik ("Tümü21")
- [ ] Araştırma → `docs/pazar/varliklar.md` (kreatif kütüphaneleri, otomatik boyutlandırma, Meta/Google varlık gereksinimleri 2026)
- [ ] Araştırmanın 1. önerisi

## 12 · Ayarlar (`/ayarlar/*`)

- [ ] Bilinen açık: `/ayarlar` markasız İngilizce 404; `/ayarlar/sirketler`e yönlendir + Türkçe markalı `not-found.tsx`
- [ ] Bilinen açık: Bağlantılar'da yedi platform sekmesi 1280 px'te sayfayı 214 px taşırıyor
- [ ] Bilinen açık: Hesabım üst yolunda sayfa adı eksik
- [ ] Araştırma → `docs/pazar/ayarlar.md` (ajans çoklu müşteri yönetimi, rol modelleri, 2FA zorunluluğu)

## Ortak (her modülde rastlanırsa)

- [ ] Boş durum kutularında ikon yerine "0" yazıyor; `BosDurum` ikonu
- [ ] Kenar menüsü 800 px yükseklikte Base bölümünü göstermiyor; etkin satır solmanın altında

## Kullanıcıda (döngü dışı)

- [ ] Canlı doğrulama: Ege Birlik'te strateji iptal/sil → "Strateji oluştur" açılıyor mu
- [ ] Canlı doğrulama: Boost kartları ve reklam önizlemelerinde görsel geliyor mu
- [ ] Canlı doğrulama: Kurulum "Değiştir" + aramalı liste, masaüstü + mobil
- [ ] Döngünün biriktirdiği commit'leri push + deploy
