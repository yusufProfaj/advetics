# Potansiyel Müşteriler — pazar araştırması (2026-10-15)

Döngü turu 27 (PROGRESS.md § 8). Bugünkü modül: Meta anlık form kayıtları
(webhook + 15 dakikalık uzlaştırma taraması), durum = kalite işareti
(Yeni · Arandı · Nitelikli · Kazanıldı · Kaybedildi), durum değişikliği
Meta'ya geri besleme olarak gidiyor (Paket E, Conversion Leads
hazırlığı); form oluşturucuda "Daha yüksek niyet" form tipi var. Boş liste
sebebi artık izin ve son tarama hatasını da söylüyor (turu 26). Platform
iddiaları belgeden; canlıda ölçülmedi.

## 1 · Platform güncellemeleri

- **Conversion Leads + Conversions API for CRM:** Meta form doldurmayı
  değil sonradan nitelenen/satışa dönen kaydı ödüllendiren hedefi
  öne çıkarıyor; CRM aşama değişikliği ayrı bir CAPI entegrasyonuyla
  gönderiliyor. Satıcı iddiası: nitelikli kayıt başına maliyet ortalama
  %21 daha düşük. Offline Conversions API'nin Mayıs 2025'te kapandığı
  iddiası Meta belgesinde doğrulanmadı. Kaynak:
  [Make (satıcı)](https://www.make.com/en/blog/meta-make-conversions-api-for-crm),
  [Click Here Digital](https://www.clickheredigital.com/insights/meta-shift-to-lead-optimization),
  [leadjourney](https://leadjourney.io/blog/meta-ads-lead-quality-fix).
  **Bizde:** geri besleme yolu (Paket E) var; Form amacında Conversion
  Leads optimizasyonu AdvCampaign Öneri 4 olarak onay bekliyor.
- **Anlık form "Daha yüksek niyet":** gönderimden önce gözden geçirme
  adımı; yeni seçenek **telefon numarasını SMS koduyla doğrulama**. Meta
  form öğelerini kendi optimizasyonuyla değiştirebiliyor; niteleme
  sorusu kilitlenmeli. Yapay zekâyla siteden form üretme (yaygınlığı
  doğrulanmadı). Kaynak:
  [benly.ai](https://benly.ai/learn/meta-ads/lead-ads-guide),
  [tryvizup Mayıs 2026](https://www.tryvizup.com/blog/meta-ads-updates-may-2026),
  [embryo](https://embryo.com/?p=92831).

## 2 · Sektör dersi: ilk temas hızı

- 5 dakika kuralı eski çalışmalara dayanıyor (MIT/InsideSales: 5 dk içinde
  aramak 30 dakikaya göre temas olasılığını çok artırıyor; Velocify: 60 sn
  içinde temas edilen kayıt 30 dakikadakinin %391'i oranında dönüşüyor).
  2026'da şeffaf yöntemli tek anket (NP Digital, 500 pazarlamacı): yalnız
  %3'ü 5 dakika içinde, %9'u bir saat içinde dönüyor. Rakamlar eski ve
  tekrar ediliyor; yön tutarlı: dakikalar önemli. Kaynak:
  [Neil Patel](https://neilpatel.com/marketing-stats/response-time-new-leads/),
  [Perspective](https://getperspective.ai/blog/lead-response-time-2026-benchmarks-and-what-actually-converts),
  [Aloware](https://aloware.com/blog/lead-response-time-benchmarks).
- **Bizde:** yeni kayıt geldiğinde kimseye bildirim gitmiyor; liste
  "Yeni" rozetini gösteriyor ama kaydın KAÇ SAATTİR beklediğini
  söylemiyor. Reklam bilmeyen müşteri için en büyük kayıp burada: form
  doldu, kimse aramadı.

## 3 · Türkiye pazarı

- Türkiye'de form kaydının ardından ilk temas çoğunlukla WhatsApp'tan;
  kaydı listeden WhatsApp'a tek tıkla açmak (`wa.me/<telefon>`) yerel
  beklenti. Yerel rakip (CRM eklentileri) incelenmedi.

## 4 · Öneriler (öncelik sırasıyla)

1. **"Yeni" kaydın bekleme süresi.** Listede "3 saattir aranmadı"; bir
   saati geçen yeni kayıt kırmızı işaretli; sayaç "N kayıt 1 saati geçti".
   `submitted_at` var, veri modeli değişmiyor. Onaysız.
2. **Kayıttan WhatsApp/arama bağlantısı.** Telefon alanından `tel:` ve
   `wa.me` bağlantısı (numara E.164'e çevrilerek). Onaysız.
3. **(onay bekliyor) Yeni kayıt bildirimi** (e-posta, workspace'in rapor
   alıcılarına ya da ayrı listeye): dışarı giden mesaj + ayar alanı.
4. **(onay bekliyor) Form oluşturucuda varsayılan "Daha yüksek niyet" ve
   telefon doğrulaması:** Meta'ya yazan form ayarı; canlıda ölçülmeli.
