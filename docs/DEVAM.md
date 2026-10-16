# Devir — nerede kaldık

> **"advetics projesine devam et" denince okunan İLK dosya bu.** En çok
> ~8 KB: yalnız SON DURUM, SIRADAKİ İŞ, BEKLEYENLER. Her oturum kapanırken
> işin kendi commit'inde güncellenir; biten bir girdi bir sonraki oturumda
> [`arsiv/DEVAM-2026-10.md`](arsiv/DEVAM-2026-10.md) sonuna taşınır (orada
> 7 Ekim → 16 Ekim'in bütün girdileri duruyor; daha eskisi
> [`arsiv/DEVAM-2026-08.md`](arsiv/DEVAM-2026-08.md), geçmiş
> [`DURUM.md` § 8](DURUM.md)). Eski bir işin ayrıntısı gerekiyorsa arşivde
> `grep` ile ara, baştan okuma.

**Son güncelleme:** 2026-10-16 · canlı `70e5dc9a` · bekleyen deploy yok.

## Son durum

**16 EKİM ÖĞLEDEN SONRA — CANLI DENETİM SONRASI (canlı `44716da5`).** Eren Altay'da strateji ÇALIŞIYOR (hesaplar atanmış, TRY; sorun "çok geç açılıyor"du): giriş kartları `useTransition` + örtü, sihirbaz girdileri platform hazırlığı 3 dk önbellek (canlı: ilk 3,9 sn, sonra 0,2 sn). İyileştir öneri kartında kanıt kutuları taşmıyor (masaüstü + 375 px gözle). Hedef kitleler: set dışı harcama notu, toplam satırı, adres çevresi, sütun genişliği (gözle). Ön ayarsız Boost kartları canlıda üretildi (8 workspace, 10:00 UTC); "Boost ayarla" düğmesi ekranda GÖRÜLMEDİ. **KAPANDI (canlı `70e5dc9a`):** Google kategori listesi boş dönüyordu; sebep `launched_to_all` süzgeci (1.008 satırın hiçbiri true değil, `google-check --sorgu` ile ölçüldü). Süzgeç kalktı; Ege Birlik'te öneri 1.008 kategori taradı, "satılık daire" → Residential Properties (For Sale). Zayıf yan: niteleyicisiz kavram ("villa") hem satılık hem kiralık kategoriyi getiriyor, kullanıcı kaldırabiliyor. "Boost ayarla" canlıda Klimar'da gözle görüldü (alanlar açılıyor, yayınlanmadı). CI: `next/font` indirmesi düşerse web derlemesi bir kez yeniden deneniyor (son 6 günün 7 kırmızısından 2'si buydu; diğerleri gerçek ve düzeltilmiş).

**16 EKİM ÖĞLE — BEŞ İŞ: STRATEJİ, BOOST, HEDEF KİTLELER, REKLAM YÖNETİCİSİ (yusuf, dal `yusuf/strateji-reklam-yoneticisi-fd67ff`).** (1) **AdvStrategy Eren Altay'da açılmıyordu** `5186df32`: hesabı atanmamış workspace'te her hedef "hesap atanmadı" ile kapalıydı ve Bütçe adımı "Para birimini seçin" diyordu ama seçici YOKTU. İki platformda da hesap yoksa hedefler açık + not; para birimi seçici (hesap birimleri ya da TRY/USD/EUR/GBP), seçilen birim `paraBirimi` ile gidiyor. Eren Altay'ın canlıdaki hâli ÖLÇÜLMEDİ (sunucu okuması bu oturumda kapalıydı). (2) **Akıllı Boost ön ayara bağlı değil** `e92fc686`: ön ayarsız da kart üretiliyor (son 10 gönderi, ilk doluşta mail yok); Instagram kartında "Boost ayarla" bütçe/süre/kitle alanlarını açıyor, sunucu eksik ayarda nedenini söyleyip reddediyor; YouTube kartında "Boost ayarla" ön ayar penceresini açıyor. (3-5) **Reklam Yöneticisi**: düzey sekmeleri yan menüden tablonun ÜSTÜNE (yatay `Sekmeler`, kapalı sekme nedenli); sağ üstte Oluştur sekmeye göre (Kampanyalar/üst düzey → Yeni kampanya, Reklamlar → Reklam, Hedef kitleler → Hedef kitle = Base › Kitleler yeni form açık); yeni **Hedef kitleler** sekmesi (`GET /metrics/kitleler`: aynı hedeflemeli Meta setleri tek satırda; Google/LinkedIn setleri "hedefleme bilgisi yok" satırında, atılmadan) + satırdan "Kitlelere kaydet" (`POST /audience-templates/setten`, taşınamayan parçalar söyleniyor). **Base › Kitleler Google karşılığı**: şablonda `google_hedefleri` (ilgi + satın alma niyeti kategorileri `user_interest` kimliğiyle, özel segment arama kelimeleri); "Öner" artık Google kategorilerini de buluyor (İngilizce aday → kategori adı, kelime sınırıyla) ve arama kelimeleri üretiyor; yalnız Google'ı olan workspace de öneri alıyor. **Migration:** `20261021100000_kitle_google_karsiligi` (tek kolon, varsayılanlı). **Ölçülmedi:** `user_interest` GAQL sorgusu canlıda (alan adları belgeden); Google karşılığı henüz AdvCampaign kurulumuna GİTMİYOR (yalnız kütüphanede, yazma yolu ayrı iş); ekranlar tarayıcıda görülmedi (yerelde veritabanı yok, canlı oturum yoktu).

**16 EKİM — İKİ DİLLİ ADVETICS, D2 (yusuf, aynı dal, PUSH/DEPLOY YOK).** Panel kabuğu (menü `menuyuCevir`, üst çubuk, kullanıcı menüsü, kapsam seçici, bildirim zili, hata/404/yükleniyor, `components/ui`), Genel Bakış ve Ayarlar'ın dört sekmesi İngilizce. Shared etiketlerinin İngilizcesi `packages/shared/src/dil/etiketler.ts` (`rolEtiketi`, `ayarSekmesiAdi`, `kapiNedeni`…); biçimleyiciler `dil` alıyor (Türkçe çıktı aynı, `₺1,234.50`). Çeviri kuralları `docs/i18n/CEVIRI-REHBERI.md`. **Ölçülmedi:** panel ekranları gözle (yerelde veritabanı yok, canlıda görülmeli). **Kalan:** D3 modül sayfaları (Reklam Yöneticisi, Raporlar, Marka Merkezi, AdvStrategy, AdvCampaign, Akıllı Boost, Kurallar, Bütçe, Potansiyel Müşteriler); İngilizce menüde "Ads Manager" yazarken sayfa başlığı D3'e kadar Türkçe. Shared'da İngilizcesi olmayanlar (D4): `SPECIAL_AD_CATEGORY_META`, `YETKI_GRUPLARI`, `CHANNEL_HINTS`, `donusumBosSebebi`, `HESAP_AJANSTA` (lib), API cümleleri.

## Sıradaki iş

1. **İki dilli D3:** modül sayfalarının İngilizcesi, Reklam Yöneticisi'nden
   başlayarak (Raporlar, Marka Merkezi, AdvStrategy, AdvCampaign, Akıllı
   Boost, Kurallar, Bütçe, Potansiyel Müşteriler). Kurallar
   `docs/i18n/MIMARI.md`, `docs/i18n/CEVIRI-REHBERI.md`. Ardından D4
   (shared'da İngilizcesi olmayanlar, yukarıda).
2. **Onay bekleyenler** `PROGRESS.md`te `(onay bekliyor…)` işaretli (~15
   madde). En önemlisi: Akıllı Boost ön ayarındaki "Amaç" Meta'ya gitmiyor,
   hep POST_ENGAGEMENT.

## Açık, tarihli

- **Meta v26, 2026-10-27:** kök `GET /?ids=` istekleri bütün sürümlerde
  hataya dönüyor (rapor PDF görsel tazeleme, boost özeti). 2026-10-16'da
  `ids=` hâlâ `reklam/meta-graf.ts` ve `meta.provider.ts` içinde; düzeltme
  ayrı oturumda yürütülüyordu, bittiği DOĞRULANMADI. Deploy o tarihten önce.
- App Review başvurusu 2026-10-01'den beri incelemede; ekran kayıtları eksik
  görünüyor.

## Kullanıcı kararı bekleyen

- Açılış sayfası hâlâ "Yalnızca Meta ve Google Ads" diyor; gizlilik politikası
  LinkedIn'den söz etmiyor. **Hukuki metne onaysız dokunulmaz.**
- Hukuk (tanıtım sitesi): KVKK Aydınlatma Metni yok; gizlilikte Gemini ile
  yapay zekâ işlemesi anlatılmıyor; Veri Silme'de LinkedIn iptal yolu yok.

## Araçlar

- "O günden beri ne geldi": `git log --oneline $(git log -1 --format=%h -- docs/DEVAM.md)..origin/main`
- Canlı ölçüm (salt okunur, sunucuda `advetics` kullanıcısıyla):
  `cd ~/htdocs/advetics.com && pnpm --filter @advetics/api olcum-senkron -- --eposta=<kullanıcı e-postası>`
