# Reklam Yöneticisi — pazar araştırması (2026-10-15)

Döngü turu 20 (PROGRESS.md § 6). Bugünkü Reklam Yöneticisi
(`/ads-explorer`): şirket → workspace → hesap → kampanya → set → reklam
iniş tablosu, Meta + Google + LinkedIn tek tabloda, satır içi
durdur/başlat (Google video hariç), Reklam Galerisi ayrı sekme. Platform
iddiaları belgeden; canlıda ölçülmedi.

## 1 · Platform güncellemeleri

- **Meta Ads Manager 2026:** yerleşim reklam düzeyinde seçilebiliyor
  (test); Mart 2026'dan beri Esnek biçim ve Koleksiyon "Reklam kurulumu"
  yerine "Reklam kreatifi"nde; kampanya akışı Şubat'ta birleştirildi,
  hedefleme menüsü Ocak'ta sadeleşti; Meta AI iş asistanı Ads Manager'da
  herkese açık beta; Ads AI Connectors (MCP/CLI) açık beta. Kademeli
  açılım: aynı ekran iki hesapta farklı. Kaynak:
  [tryvizup Mayıs 2026](https://www.tryvizup.com/blog/meta-ads-updates-may-2026),
  [adsuploader](https://adsuploader.com/blog/meta-ads-updates),
  [SocialBee Nisan 2026](https://socialbee.com/blog/social-media-news/april-2026/).
- **Google Ads:** kampanya tablosunun "Durum" sütunu AÇIK/KAPALI değil
  TESLİMAT durumu taşıyor: "Bütçeyle sınırlı", "Uygun (sınırlı)" (politika
  ya da önemli değişiklik sonrası öğrenme, 7-10 gün), "Teklif stratejisiyle
  sınırlı"; yanında bütçe simülatörü. Kaynak:
  [Google yardım — bütçeyle sınırlı](https://support.google.com/google-ads/answer/2616012).

## 2 · Rakipler

Çok müşterili ajans panelleri (Madgicx, AdManage.ai, Atria, Smartly,
Adspirer, SA360): ortak beklenti tek yerde bütün müşteriler, toplu
işlem, rol bazlı erişim. Meta + Google + LinkedIn'i birlikte kapsayan az
(Adspirer, SA360 yalnız arama). Kaynaklar satıcı yazısı. Kaynak:
[Madgicx](https://madgicx.com/blog/best-dashboards-for-managing-multiple-ad-account),
[AdManage.ai](https://admanage.ai/agency),
[Adspirer](https://developer.adspirer.com/agents/multi-account),
[Syntermedia](https://syntermedia.ai/blog/multiple-ad-account-management-tools).

**Konum:** üç platform tek hiyerarşide + beyaz etiket bizim farkımız.
Eksik olan Google/Meta'nın en eyleme dönük sütunu: **neden yayında
değil / neden sınırlı**.

## 3 · Kullanıcı şikâyetleri / bulgu

- **Bizde:** durum sütunu yalnız varlığın KENDİ durumunu (`status`)
  gösteriyor. Kampanyası duraklatılmış bir set, reddedilmiş reklam ya da
  bütçeyle sınırlı bir Google kampanyası "Yayında" görünüyor. `campaigns.
  effective_status` / `ad_groups.effective_status` veritabanında duruyor,
  satıra taşınmıyor (`MetricsBreakdownRow` yalnız `status`). Reklam
  bilmeyen kullanıcı için "Yayında ama harcamıyor" en kafa karıştırıcı
  hâl.
- Bağımsız kullanıcı şikâyeti aramada çıkmadı.

## 4 · Türkiye pazarı

- Ajanslar çok müşterili çalışıyor; Türkçe teslimat durumu (Meta'nın
  Türkçe arayüzündeki karşılıklarıyla) beklenti. Yerel rakip bulunamadı.

## 5 · Öneriler (öncelik sırasıyla)

1. **Bilinen açık (zaten listede):** telefonda sayfa 147 px yana taşıyor.
2. **Teslimat durumu sütunda.** `effective_status`i satıra taşı ve
   üst varlıktan gelen engeli söyle: "Duraklatıldı (kampanya)",
   "Reddedildi", "Yayında, uyarı var", "İncelemede". Etiketler var
   (`reklam-etiketleri.ts`). Onaysız.
3. **Google "Bütçeyle sınırlı" durumu.** Google'ın `campaign.
   primary_status_reasons`/`serving_status`ü yapı taramasında okunuyor
   mu önce bakılmalı; okunmuyorsa yeni alan = canlı ölçüm (onay kapısı).
4. Sonraya: satırdan bütçe simülasyonu (Google `BudgetSimulation`).
