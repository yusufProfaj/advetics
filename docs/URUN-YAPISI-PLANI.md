# Ürün yapısı planı — yedi bölüm, müşteriye hazır panel

**Başlangıç:** 2026-10-09 · **Durum:** plan, hiçbir aşama başlamadı.
**Kaynak:** kullanıcının ekran listesi (Genel Bakış · Plan · Manage · Create ·
Optimise · Report · Base) ve Orphex (orphex.co) karşılaştırması.

Bu belge NE yapılacağını ve HANGİ SIRAYLA yapılacağını tutuyor. Her aşama
CLAUDE.md'deki beş ajan düzeniyle yürür; aşama başlarken kendi
`docs/<modül>/` klasörü ve MIMARI.md'si açılır, burası yalnızca yol haritası.

---

## 1. Neden bu yapı — Orphex'ten farkımız

Orphex bir **analiz katmanı**: kreatif performans ve yorgunluk, bütçe
dağıtımı önerisi, tempo bazlı KPI takibi, kitle içgörüsü, görsel öğe
etiketleyen Creative AI, MCP (Claude/ChatGPT/Gemini), Slack uyarıları,
ajans için otomatik rapor. **Reklam kurmuyor ve değiştirmiyor**: ne
yapılacağını söylüyor, yapmayı kullanıcıya bırakıyor.

Advetics'in farkı tek cümle: **"Orphex söyler, Advetics yapar."**

- Her içgörünün yanında onaylı bir **"Uygula"** var. Altyapı zaten duruyor:
  `campaign-actions` (`pause`, `resume`, `set_budget`, `copy`), Kurallar,
  Akıllı Boost, AdvCampaign.
- **Beyaz etiketli ajans ürünü:** müşteri kendi panelini görüyor, planı
  panelin içinde onaylıyor (AdvStrategy), rapor ajansın adına gidiyor.
- **Türkçe ve reklamcılık bilmeyen kullanıcı için:** hedef, optimizasyon,
  teklif soruları sorulmuyor (CLAUDE.md §5).

Orphex'ten **işlev** olarak esinleniyoruz; metin, görsel ve marka
kopyalanmıyor. Görsel dil Google Ads'in bilgi mimarisinden (ikonlu sol ray,
bölüm → alt sayfa) ama **kimlik Profaj'ın** (kırmızı `#ff2400`, Montserrat /
Open Sans, CLAUDE.md §5 "Kurumsal kimlik").

---

## 2. Hedef menü (Türkçe — kullanıcı kararı 2026-10-09)

| Bölüm | İçerik | Bugün var olan | Eksik |
|---|---|---|---|
| **Genel Bakış** | Pano, modül kartları, bekleyen işler, Akıllı Boost'a tek tık | `/dashboard` | Modül kartları, bekleyen işler kutusu, KPI tempo |
| **Planla** | Strateji (AdvStrategy), bütçe planı, pazarlama planı | `/strateji`, Aylık Bütçe (Base'te) | KPI tempo hedefleri |
| **Oluştur** | Reklam (AdvCampaign), Akıllı Kampanya Sihirbazı, Akıllı Boost (Meta + YouTube Shorts), Kreatif, Anahtar Kelime Listesi, Hesap | `/reklam`, `/auto-boost`, Keyword Planner erişimi (AdvStrategy) | Sihirbaz görünümü, Kreatif Oluştur, ayrı kelime listesi kapısı, Hesap Oluştur |
| **Yönet** | Reklam Yöneticisi (kampanya → grup → reklam), Potansiyel Müşteriler | Reklam Keşfi (salt okuma), `campaign-actions` API, `/potansiyel-musteriler` | **Reklam Yöneticisi ekranı yok** |
| **İyileştir** | A/B testi, kreatif yorgunluğu, otomatik teklif, dönüşüm iyileştirici, Kurallar, **AI Asistan** | `/kurallar` | Diğerlerinin hepsi |
| **Raporlar** | Standart ve özelleştirilebilir raporlar, faturalar | `/raporlar` (güçlü) | Yalnızca yeni görsel düzene uyum |
| **Base** | Marka, logo, kreatif örnekleri, workspace bilgileri, kullanıcılar (ekip) | Marka Merkezi (Bağlantılar · Marka · Aylık Bütçe · Kitleler · Varlıklar · Workspace) | Ekip bugün Ayarlar'da; Aylık Bütçe Planla'ya gidiyor (Ç-3) |

"Base" Türkçe kuralının onaylanmış istisnası olarak kalıyor (2026-10-06).

### Akıllı Kampanya Sihirbazı = AdvCampaign'in ikinci yüzü

Kullanıcının tarifi: *amacı seç → kreatifleri seç → mecra ve kampanya tipi
önerisi → metin → hedefleme → planla, bas*. Bu akış AdvCampaign'in
yaptığı işin TA KENDİSİ. **İkinci bir motor yazılmaz**: aynı taslak ve aynı
derleyici üzerine adım adım bir görünüm kurulur, sohbet ile sihirbaz aynı
taslağı düzenler. Gerekçe CLAUDE.md'de: "AYNI ŞEYİ ÜRETEN İKİNCİ FONKSİYON,
DOĞDUĞU ANDA AYRIŞIR" — Meta hedeflemesinde üç üretici vardı.

### AI Asistan geri geliyor (kullanıcı kararı 2026-10-09)

2026-10-07'de eski AI Asistan sohbeti reklam KURMA yolu olduğu için
kaldırıldı ("reklam kurmanın tek yolu AdvCampaign", CLAUDE.md §5). Yeni
asistan **İyileştir** altında ve o kuralı bozmuyor:

- **Okur ve önerir.** Araçları Okuma API'nin dokuz aracı (`MetricsService`
  okuma yolları, yeni SQL yok) + yorgunluk/tempo sinyalleri. Model Gemini
  (`apps/api/src/yapay-zeka/gemini.ts`).
- **Yapacağı iş "Uygula" kartı olarak çıkar** ve onay ister; uygulayan
  `campaign-actions`. Asistan doğrudan platforma yazmaz.
- **Reklam kurmaz:** "yeni kampanya aç" isteği AdvCampaign'e hazır
  doldurulmuş oturumla devredilir (AdvStrategy aktarımındaki
  `hazir_istem` deseni).
- Eski AI sohbet tabloları veritabanında duruyor (veri); yeni asistan
  onları kullanmaz, kendi tablolarını açar.

---

## 3. Müşteri hesabı

Bugün dört ekran görüyor: Genel Bakış, Reklam Keşfi, AdvStrategy, Raporlar
(CLAUDE.md §5, `nav-sections.spec.ts`). Yeni yapıda:

| Bölüm | Müşteri ne görür |
|---|---|
| Genel Bakış | Pano (bekleyen işlerde yalnızca kendi onayları) |
| Planla | Strateji: okur ve onaylar, yazamaz |
| Yönet | Reklam Yöneticisi'nin **salt okunur** hâli (bugünkü Reklam Keşfi) |
| Raporlar | Raporlar |

Oluştur, İyileştir ve Base müşteriye görünmez. Ekran sayısı DEĞİŞMİYOR
(dört); değişen yalnızca bölüm başlıkları. Reklam Keşfi'nin adı Aşama 3'te
Reklam Yöneticisi'ne dönerse `nav-sections.spec.ts`'teki kilitli liste aynı
commit'te güncellenir.

---

## 4. Aşamalar

Her aşama canlıya alınmadan sonrakine geçilmez (CLAUDE.md "Beş ajan, modül
modül").

### Aşama 0 — Bekleyen deploy'u bitir

Canlıda olmayan iş: AdvCampaign sohbeti, AdvStrategy ikinci tur, YouTube
Boost Aşama 0–1, Okuma API, Base Aşama 1, LinkedIn para birimi (DEVAM.md).
Dört+ migration. Yeni görsel düzen bunun üstüne kurulursa hangi hatanın
nereden geldiği ayrılamaz. **Çıkış:** DEVAM.md'de "bekleyen deploy" boş,
canlı turlar (AdvCampaign SITE taslağı → prova, AdvStrategy aktarımı)
yapılmış.

### Aşama 1 — Menü ve görsel düzen

- `nav-sections.ts` yedi bölüme; sol ikon rayı + bölüm başlıkları.
- Ekip Base'e (`/ayarlar/ekip` → Marka Merkezi bölümü, eski adres
  yönlenir — `bolumler.ts` deseni).
- Aylık Bütçe Base'ten Planla'ya (Ç-3); Marka Merkezi iç menüsünden
  kalkar, eski adres yönlenir.
- Var olan ekranlar yeni bölümlere taşınır, **yeni ekran yazılmaz**.
  Henüz ekranı olmayan alt başlık menüye KONMAZ (2026-09'da 7 ölü satır
  "tıklanamaz soluk satır" olarak temizlendi; geri getirilmez).
- `panel-tasarim.spec.ts` ve `nav-sections.spec.ts` yeşil; müşteri
  menüsü dört ekran.
- **Çıkış:** panel yeni yapıda, işlev değişmedi.

### Aşama 2 — Genel Bakış karar ekranı

- **KPI tempo**: "ayın %60'ı geçti, harcama hedefin %48'inde" — tamamlanma
  değil tempo. Yön metriğe göre (CPA'da düşük iyi). Aylık bütçe verisi
  hazır; CPA/ROAS hedefi için yeni alan gerekebilir (Planla'da girilir).
- **Bekleyen işler**: Akıllı Boost onay kartları, strateji onayları,
  bağlantı/ödeme uyarıları (`alerts` modülü). Her satır işin yapılacağı
  ekrana götürür.
- Modül kartları + Akıllı Boost kısayolu.
- **Çıkış:** müşteri ve ajans panoyu açınca "bugün ne yapmalıyım"ı görüyor.

### Aşama 3 — Yönet: Reklam Yöneticisi

- Google Ads tarzı tablo, üç seviye (kampanya → reklam grubu → reklam),
  platform ve hesap süzgeci HER ZAMAN (CLAUDE.md §5).
- Satır içi: durdur / başlat / bütçe / kopyala — `campaign-actions`
  hazır. Her yazma onay ister ve sonuç platformdan GERİ OKUNUR ("200
  döndü" doğrulama değil).
- Panel gecikmeli bir ayna (Meta hesapları MCP'den de yönetiliyor):
  her satırda "son eşitleme" zamanı görünür, eski veriyle karar
  verdirilmez.
- "+" düğmesi Oluştur'a.
- **Çıkış:** reklamı platforma girmeden yönetmek mümkün.

### Aşama 4 — İyileştir v1

- **Kreatif yorgunluğu**: `insights_daily` reklam seviyesinde
  `frequency`, CTR, CPC tutuyor. Sinyal: sıklık artarken CTR düşüşü.
  Eşikler canlı veriyle ölçülüp kararlaştırılır, tahmin edilmez.
- **Kurallar** buraya taşınır (Aşama 1'de menü yeri, burada içerik).
- **"Öneri → Uygula" kartları**: yorgun kreatifi durdur, bütçeyi
  verimli kampanyaya kaydır. Uygulayan `campaign-actions`.
- **AI Asistan v1**: okur, önerir, Uygula kartı üretir (§2).
- **Çıkış:** Orphex'in söylediği şeyi söylüyor VE yapıyoruz.

### Aşama 5 — Oluştur'u tamamla

- AdvCampaign canlı tur + Google kapıları (TASARIM-PLAN İP-05/07/08).
- Akıllı Kampanya Sihirbazı (aynı taslak, adım görünümü).
- Kreatif Oluştur (yapay zekâ ile görsel; boyut ve politika denetimi
  giriş anında).
- Anahtar Kelime Listesi: AdvStrategy kelime motoruna ayrı kapı, yeni
  motor değil.
- Hesap Oluştur: açık karar (§5).

### Aşama 6 — İyileştir v2 ve dış bağlantılar

- A/B testi (Meta'nın kendi deney altyapısı mı, kendi bölmemiz mi — ölçülüp
  karar verilecek).
- Otomatik teklif yöneticisi, dönüşüm iyileştirici.
- AI Asistan v2: onaylı aksiyon zincirleri.
- MCP dış kullanım (Okuma API'yi platform sahibinden ajans kullanıcısına
  açma), Slack/mail özetleri.

---

## 5. Çelişki tablosu

| # | Konu | Durum |
|---|---|---|
| Ç-1 | Menü adları İngilizce mi Türkçe mi | **KAPANDI (2026-10-09): Türkçe.** Genel Bakış · Planla · Oluştur · Yönet · İyileştir · Raporlar · Base |
| Ç-2 | AI Asistan 2026-10-07'de kaldırıldı | **KAPANDI (2026-10-09): geri geliyor**, İyileştir altında, reklam kurmaz (§2) |
| Ç-3 | Bütçe hem Planla'da hem Base'te listelenmiş | **KAPANDI (2026-10-09): Planla'da.** Aylık Bütçe Marka Merkezi'nden Planla'ya taşınır (Aşama 1), Base'te bütçe yok; eski `?bolum=butce` adresi yönlenir. İki yerden yazılan aynı ayar ayrışır |
| Ç-4 | "Hesap Oluştur" | **AÇIK — Aşama 5'ten önce.** Google'da MCC altında alt hesap API'den açılabiliyor; Meta'da reklam hesabı açmak ciddi kısıtlı. İkisi de canlıda ölçülmedi |
| Ç-5 | Orphex gibi bir tanıtım sitesi (ana sayfa, fiyat, demo) kapsamda mı | **AÇIK.** Bu plan yalnızca paneli kapsıyor |
| Ç-6 | Müşteri hesabı bölüm başlıklarını görüyor | Varsayılan: dört ekran korunur, yalnız başlıklar değişir (§3) |
