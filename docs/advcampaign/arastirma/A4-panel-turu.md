# A4 — Panel turu: Meta Reklam Yöneticisi + Google Ads "yeni kampanya" akışı

> **Tarih:** 2026-10-10 · **Kim:** Ajan 0 ([`REHBER-PLANI.md`](../REHBER-PLANI.md) §1)
> **Nerede:** Meta → Profaj reklam hesabı (`act_680343622074710`); Google → MCC Profaj
> Reklamcılık altında müşteri hesabı "Profaj (Yeni)" (813-780-6345).
> **Nasıl:** Chrome'da, kullanıcının oturumuyla, iki panelin kendi arayüzü baştan sona
> gezildi. **"Yayınla"ya basılmadı, para harcanmadı.** İki panel de yarım kampanyayı
> kendiliğinden taslak kaydetti (§5).
>
> A1/A3 belgeden yazılmıştı; bu tur **panelin gerçek akışını ve UI varsayılanlarını**
> ölçüyor. API'nin varsayılanı ile panelin varsayılanı aynı değil: panel, alanı biz
> göndermediğimizde platformun ne seçeceğini gösteriyor.

---

## 1. İki panelin ortak iskeleti (rehberin kopyalayacağı şey)

| Ortak desen | Meta | Google | Advetics rehberine çevirisi |
|---|---|---|---|
| **İlk soru amaç** | 6 amaç kartı | 7 hedef kutusu | ① Amaç: tek kart, acemi dili |
| **Amaçtan sonra "nasıl"** | Kurulum: önerilen (sade) / manuel | Kampanya türü + "hedefe nasıl ulaşmak istiyorsunuz" (site / telefon / form / mesaj) | Kullanıcıya sorulmaz: amaç kartı bunu taşır, sistem seçer |
| **Adım rayı** | Sol ağaç: kampanya › set › reklam | Sol ray: Teklif · Kampanya ayarları · AI Max · Anahtar kelimeler ve reklamlar · Bütçe · İncele | Sol ray, Google'ın yapısında ama **iş diliyle** (Amaç · Nerede · Kime · Reklam · Bütçe · Kontrol) |
| **Sağ panel** | Kampanya puanı + "Değişiklikleriniz doğrulanıyor" (canlı hata listesi) + tahmini kitle | Kampanya özeti + tahmini performans | Sağda canlı özet + **eksikler listesi** (bizde zaten `eksikler`) |
| **Otomatik kayıt** | "Tüm düzenlemeler kaydedildi" | "Tüm değişiklikler kaydedildi" | Her adım yeni taslak sürümü (bizde `taslak_surumu`) |
| **"Önerilen" rozeti** | Advantage+ açık, "tavsiye edilir" | "(önerilen)" | Önerilen değer DOLU gelir, rozetiyle |
| **Güç göstergesi** | Kampanya puanı (40–79 arası gördük) | Reklam gücü (Tamamlanmadı → ipuçları) | Reklam adımında Google'ın "reklam gücü" mantığı: başlık sayısı, benzersizlik |
| **Metin kutularında sayaç** | — | `0 / 30`, `0 / 90`, `0 / 15` | Sayaç yazarken, sınır sabitten |

Sonuç: iki panel de **amaç → otomatik çoğu karar → az sayıda alan → canlı doğrulama →
özet** iskeletinde. Rehberin altı adımı bu iskelete oturuyor; fark, bizim panelin
"teklif", "ağ", "AI Max", "dönüşüm konumu" adımlarını kullanıcıya hiç göstermemesi.

---

## 2. Meta akışı (ölçülen)

**Amaç diyalogu:** Satın alma türü (Açık Artırma) + Bilinirlik · Trafik · Etkileşim ·
Potansiyel Müşteriler · Uygulama tanıtımı · Satış.

**Kurulum seçimi** (Trafik'te görüldü): "Instagram reklamverenleri için trafik
kampanyası" (önerilen, basitleştirilmiş) ya da "Manuel". Panelin kendi notu: *öneriler
hesabın son hareketlerine göre değişebilir* — yani aynı amaç iki hesapta farklı açılıyor.

### Amaç × dönüşüm konumu × performans hedefi (yıldız = panelin seçtiği)

| Amaç | Dönüşüm konumu seçenekleri | Performans hedefi seçenekleri |
|---|---|---|
| **Trafik** | IG canlı video · İnternet sitesi · Uygulama · Mesaj yönlendirme · IG/FB profil · Aramalar. **Panel "Mesaj yönlendirme"yi seçili açtı** | Site: Yönlendirme sayfası görüntüleme* / Bağlantı tıklaması / Günlük tekil erişim / Konuşma / Gösterim. Mesaj: Konuşma*. Profil: ziyaret. Aramalar: arama |
| **Bilinirlik** | Konum yok | Erişim* / Gösterim / Reklam hatırlanırlığı / ThruPlay / 2 sn video. **Sıklık: üst sınır, 7 günde 2** (bizim K-06 ile aynı) |
| **Etkileşim** | Açılır liste: IG canlı · Mesaj · **Reklamınızda*** · Aramalar · Site · Uygulama · IG/FB. "Reklamınızda"da etkileşim türü: Video görüntüleme* / Gönderi etkileşimi / Etkinlik yanıtı / Hatırlatma | Video: ThruPlay* / 2 sn |
| **Potansiyel Müşteriler** | Birden fazla: Site+hızlı form · Site+arama · Hızlı form+Messenger. Tek: IG canlı · **Site*** · Hızlı formlar · Messenger · Instagram · WhatsApp · Aramalar · Uygulama. Meta ipucu: "Site + hızlı form ile CPL %14–24 düşebilir" | Site: Potansiyel müşteri (veri seti/piksel ZORUNLU). Hızlı form: Potansiyel müşteri* / Nitelikli potansiyel müşteri (CRM ister) |
| **Satış** | Site* (+ katalog: "Ürün verileri") | Dönüşüm sayısı* (veri seti ZORUNLU), "Müşteri yaşam döngüsü stratejisi" (yeni/mevcut) |

Her amaçta sağda bir Advantage+ rozeti var: "Advantage+ potansiyel müşteri kampanyası:
Açık", "Advantage+ satış kampanyası: Açık".

### Reklam seti ortak alanlar
Facebook sayfası · Teklif: En yüksek hacim* / sonuç başına ücret hedefi · Değer kuralları
· Bütçe ve plan (günlük/toplam, başlangıç bugün GMT+3, bitiş opsiyonel, bütçe planlama,
reklam planlaması) · Hedef kitle: **Advantage+ açık**, kontroller: konum, min. yaş 18,
hariç tutma, diller (tümü) · Reklam şeffaflığı (reklamveren/ödeyen) · Reklam alanları:
**Advantage+ açık** ("WhatsApp Durumu otomatik eklendi") · Marka emniyeti.

### Reklam
Ortaklık reklamı · Reklam oluştur / mevcut gönderi · Format: tek görsel/video, döngü ·
**"Çok reklamverenli reklamlar" İŞARETLİ geliyor** · Kreatif (10 medyaya kadar; "dinamik
kreatif artık yok") · Kreatif testi (7 sürüm) · Takip (dönüşüm veri seti) · Önizleme +
"Varsayılanları gözden geçir".

### Meta'nın canlı doğrulama mesajları (ölçüldü)
- **"Bütçeniz en az 49,34 TL olmalı" (#1885272)** — reklam seti günlük asgarisi bu
  hesapta ~49 TL. Rehberin bütçe adımı bu alt sınırı GİRİŞTE söylemeli. Sabit değil
  (para birimi/hesap), `minimum_budgets` ile okunmalı (SENTEZ Ö-M9).
- "WhatsApp sohbeti açan reklam için WhatsApp Business hesabı gerekli" (#2923012).
- "Bu sayfa için Lead Ads Koşulları kabul edilmedi" — form amacının ön koşulu.

---

## 3. Google akışı (ölçülen)

**MCC'den girince önce müşteri hesabı seçiliyor.** Sonra **"Kampanya hedefiniz nedir?"**:
Satış · Potansiyel müşteriler · Web sitesi trafiği · Uygulama tanıtımı · YouTube erişimi,
görüntülemeleri ve etkileşimleri · Yerel mağaza ziyaretleri ve tanıtımlar · Kılavuz olmadan.

Hedef seçilince **dönüşüm hedefleri tablosu** geliyor: hesabın "hesap varsayılanı"
dönüşümleri (bu hesapta Diğer, Giden tıklamalar, Form gönderimi, Satın alma, Telefon
araması), ⚠ = etkin olmayan işlem. **Kampanyanın neyi "dönüşüm" sayacağına hesap
varsayılanı karar veriyor** — bu bizim SENTEZ'deki "ölçüm kapısı"nın panel karşılığı.

### Hedef → kampanya türü

| Google hedefi | Sunulan türler |
|---|---|
| Satış | Maks. Performans · Arama · Talep Yaratma · Video · Alışveriş |
| Potansiyel müşteriler | Maks. Performans · Arama · Talep Yaratma · Video · Görüntülü Reklam Ağı · Alışveriş |
| Web sitesi trafiği | Maks. Performans · Arama · Talep Yaratma · Video |
| Uygulama tanıtımı | Uygulama |
| YouTube erişimi | **Yalnız Video** — API'den kurulamıyor (CLAUDE.md). Bizde YouTube = Talep Yaratma (Demand Gen) |
| Yerel mağaza | Maks. Performans |

Türden sonra kampanya adı + **"Hedefinize nasıl ulaşmak istiyorsunuz"** (çoklu): Web
sitesi ziyaretleri · Telefon aramaları · Mağaza ziyaretleri · Form gönderimleri ·
Reklamlar üzerinden mesajlar.

### Arama sihirbazı — adım adım

| Adım | İçerik | Panelin varsayılanı |
|---|---|---|
| Teklif verme | "Hangi hedefe odaklanmak istiyorsunuz?" Dönüşüm sayısı* / Hedef EBM / Dönüşüm değeri / Hedef ROAS · "Yeni müşteriler için optimize et" | Dönüşüm sayısı (Potansiyel müşteri hedefinde) |
| Kampanya ayarları | Ağlar · Konumlar · Diller · AB siyasi reklam (zorunlu) · Kitle segmentleri · Diğer ayarlar | **Arama ortakları ✔ + Görüntülü Reklam Ağı ✔ · Konum "Tüm ülkeler ve bölgeler" · Türkçe** |
| AI Max | Metin özelleştirme · Nihai URL genişletmesi (metin özelleştirmeye bağlı) · Markalar; "%14 daha fazla dönüşüm" vaadi | Özet panelinde **"Öğe optimizasyonu: etkin"** |
| Anahtar kelimeler ve reklamlar | Anahtar kelime önerisi (URL + ürün/hizmet) · anahtar kelime kutusu · AI Max reklam grubu ayarları (BETA) · Reklam gücü · Nihai URL · görünen yol 2×15 · başlık 15'e kadar (3 zorunlu, ≤30) · açıklama 4'e kadar (2 zorunlu, ≤90) · "Fikirleri göster" · resim · işletme adı (≤25) · logo · site bağlantıları · diğer öğeler (0/7) | İşletme adı/logo/site bağlantısı hesap düzeyinden geliyor |
| Bütçe | Ortalama günlük* / Toplam kampanya · **"kampanya başladıktan sonra bütçe türü değiştirilemez"** · günde 2 katına kadar harcama | Günlük |
| İncele | Yayın öncesi özet | — |

---

## 4. Rehber için çıkan kararlar

### 4.1 Platformun UI varsayılanı = bizim için tuzak (hepsi açıkça yazılacak)

| Panel varsayılanı | Risk | Advetics'in açıkça yazdığı değer |
|---|---|---|
| Google konum **"Tüm ülkeler ve bölgeler"** | Türk işletmesinin reklamı dünyaya çıkar | Workspace kitlesindeki konum, `PRESENCE` |
| Google Arama ortakları + **Görüntülü Reklam Ağı açık** | Arama bütçesi düşük kaliteli sitelere akar | Yalnız Google Arama |
| Google AI Max / metin özelleştirme / URL genişletme **açık** | Yasal uyarılı sektörde onaysız metin, yanlış sayfaya trafik | Kapalı (S-19) |
| Google dönüşüm hedefi = hesap varsayılanı | Etkin olmayan ⚠ işleme göre teklif → "Dönüşüm sayısını artır" hiç öğrenmez | Teklif, ölçüm kapısına göre: ölçüm yoksa Maksimum tıklama |
| Meta Trafik'te dönüşüm konumu **"Mesaj"** (hesap geçmişinden) | "Siteme gelsinler" reklamı WhatsApp'a yönlenir | `destination_type: WEBSITE` açıkça |
| Meta **Facebook sayfası kendiliğinden başka bir müşterinin sayfası** ("Oran İnşaat") seçildi | Formlar YANLIŞ MÜŞTERİNİN sayfasına gider — sıfır hata | Sayfa her zaman workspace'in sayfasından, açıkça; seçilemezse yayın durur |
| Meta **"Çok reklamverenli reklamlar" işaretli** | Kreatif kırpılır, rakip reklamlarla aynı birimde | Açıkça kapalı (yasal uyarılı workspace'te zorunlu) |
| Meta Advantage+ kitle/yerleşim açık, WhatsApp Durumu otomatik eklendi | Konut/finans kısıtlı kategoride kural ihlali | Kategoriye göre `hedeflemeUret` kararı; yerleşim açıkça |
| Meta günlük bütçe asgarisi (~49 TL) | Altında reklam yayınlanmıyor | Bütçe adımında giriş anında uyarı |

### 4.2 Advetics amacı → iki platform (tur sonrası güncel eşleme)

| Advetics amacı (ekran) | Meta | Google | Not |
|---|---|---|---|
| **Siteme gelsinler** | Trafik · konum İnternet sitesi · Yönlendirme sayfası görüntüleme | Web sitesi trafiği · **Arama** · ulaşma: site ziyareti · Maksimum tıklama (ölçüm yoksa) · ağ yalnız Arama · AI Max kapalı | Panelde Google tekliften "Dönüşüm sayısı" öneriyor; ölçüm yokken bu yanlış |
| **Form doldursunlar** | Potansiyel Müşteriler · **Hızlı formlar** · Potansiyel müşteri | Potansiyel müşteriler · Arama · ulaşma: form gönderimi (form öğesi) | Meta ön koşulları: sayfa açıkça + Lead Ads koşulları kabul |
| **WhatsApp'tan yazsınlar** | Potansiyel Müşteriler ya da Etkileşim · konum WhatsApp · Konuşma | Yok | Ön koşul: WhatsApp Business hesabı (#2923012) |
| **Beni telefonla arasınlar** | Trafik/Potansiyel · konum Aramalar | Potansiyel müşteriler · Arama · ulaşma: telefon araması | — |
| **Videom izlensin** | Etkileşim · Reklamınızda · Video görüntüleme · ThruPlay (ya da Bilinirlik › ThruPlay) | **Talep Yaratma** (panel "YouTube" hedefinde Video sunuyor ama API'den yazılamıyor) | Google'da "görüntüleme başına ödeme" denmez |
| **Bölgemde çok kişi görsün** | Bilinirlik · Erişim · sıklık 7 günde 2 | Talep Yaratma (görsel) | — |
| **Sitemden satış gelsin** | Satış · İnternet sitesi · Dönüşüm sayısı · veri seti zorunlu | Satış · Maks. Performans | İki platformda da ölçüm kapısı |

### 4.3 Rehberin adımlarına etkisi
- **① Amaç**: Meta'nın 6 + Google'ın 7 seçeneği yerine yedi **sonuç** kartı; her kart
  hangi platformda açılacağını yazar.
- **② Nerede**: ön koşul kontrolü burada (sayfa, Lead Ads koşulları, WhatsApp Business,
  piksel/dönüşüm işlemi). Kapalı platform sebebiyle gri.
- **④ Reklam**: Google'ın "reklam gücü" fikri alınır (kaç başlık, benzersiz mi); Meta'nın
  "10 medyaya kadar" kuralı ile tek metin seti iki kalıba bölünür.
- **⑤ Bütçe**: Meta asgarisi (hesaptan okunur) ve Google'ın "bütçe türü sonradan
  değişmez" uyarısı **giriş anında**.
- **⑥ Kontrol**: Meta'nın "Değişiklikleriniz doğrulanıyor" listesi bizim
  prova sonucu + eksikler listesi; Google'ın "İncele" özetinin karşılığı.

---

## 5. Turda oluşan taslaklar — SİLİNDİ (2026-10-10, kullanıcı onayıyla)

| Platform | Hesap | Ad | Kimlik |
|---|---|---|---|
| Meta | Profaj `act_680343622074710` | Yeni Trafik Kampanyası (amaç turda değiştirildi, son hâli Satış) | kampanya `52695100616178` · set `52695100616578` · reklam `52695100616378` |
| Google | Profaj (Yeni) 813-780-6345 | Leads-Search-1 (Arama) | taslak `10217973738` · kampanya `281499320479856` |

İkisi de **taslaktı**: yayınlanmadı, bütçesi yoktu. Meta'da yalnız bu satır seçilip silindi ("Kampanya silindi", 674 → 673); Google'da yalnız `Leads-Search-1` seçilip kaldırıldı, aynı gruptaki iki eski 2024 video taslağına dokunulmadı. Meta'nın üst çubuktaki "Taslakları Sil" düğmesi HESAPTAKİ BÜTÜN taslakları siler — başkasının taslağı da gider, kullanılmadı.

**Turda görülen tuzak:** Meta taslak editöründe **Esc tuşu "Taslak içerikleri
yayınla?" penceresini açtı** (Kapat / Yayınla). Basılmadı, pencere kapandı. Bir sonraki
turda Esc kullanılmamalı.

## 6. Ölçülmeyenler
- Google Talep Yaratma ve Maks. Performans sihirbazlarının adımları gezilmedi (Demand Gen
  API'den canlıda doğrulanmış durumda, CLAUDE.md).
- Meta kreatif editörünün içi (metin alanları, Advantage+ kreatif iyileştirmeleri)
  açılmadı; A3 + canlı prova (7 büyük harfli anahtar) kaynak.
- Meta "önerilen kurulum" yolunun (basitleştirilmiş) içi gezilmedi.
