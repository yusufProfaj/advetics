# Devir — nerede kaldık

> **"advetics projesine devam et" denince okunan İLK dosya bu.** En çok
> ~8 KB: yalnız SON DURUM, SIRADAKİ İŞ, BEKLEYENLER. Her oturum kapanırken
> işin kendi commit'inde güncellenir; biten bir girdi bir sonraki oturumda
> [`arsiv/DEVAM-2026-10.md`](arsiv/DEVAM-2026-10.md) sonuna taşınır (orada
> 7 Ekim → 16 Ekim'in bütün girdileri duruyor; daha eskisi
> [`arsiv/DEVAM-2026-08.md`](arsiv/DEVAM-2026-08.md), geçmiş
> [`DURUM.md` § 8](DURUM.md)). Eski bir işin ayrıntısı gerekiyorsa arşivde
> `grep` ile ara, baştan okuma.

**Son güncelleme:** 2026-10-17 · canlı `ab25ec20` (D3 + /en düzeltmesi) · bekleyen deploy yok.

## Son durum

**16 EKİM ÖĞLEDEN SONRA — CANLI DENETİM SONRASI (canlı `44716da5`).** Eren Altay'da strateji ÇALIŞIYOR (hesaplar atanmış, TRY; sorun "çok geç açılıyor"du): giriş kartları `useTransition` + örtü, sihirbaz girdileri platform hazırlığı 3 dk önbellek (canlı: ilk 3,9 sn, sonra 0,2 sn). İyileştir öneri kartında kanıt kutuları taşmıyor (masaüstü + 375 px gözle). Hedef kitleler: set dışı harcama notu, toplam satırı, adres çevresi, sütun genişliği (gözle). Ön ayarsız Boost kartları canlıda üretildi (8 workspace, 10:00 UTC); "Boost ayarla" düğmesi ekranda GÖRÜLMEDİ. **KAPANDI (canlı `70e5dc9a`):** Google kategori listesi boş dönüyordu; sebep `launched_to_all` süzgeci (1.008 satırın hiçbiri true değil, `google-check --sorgu` ile ölçüldü). Süzgeç kalktı; Ege Birlik'te öneri 1.008 kategori taradı, "satılık daire" → Residential Properties (For Sale). Zayıf yan: niteleyicisiz kavram ("villa") hem satılık hem kiralık kategoriyi getiriyor, kullanıcı kaldırabiliyor. "Boost ayarla" canlıda Klimar'da gözle görüldü (alanlar açılıyor, yayınlanmadı). CI: `next/font` indirmesi düşerse web derlemesi bir kez yeniden deneniyor (son 6 günün 7 kırmızısından 2'si buydu; diğerleri gerçek ve düzeltilmiş).

**16 EKİM AKŞAM — İKİ DİLLİ ADVETICS, D3 (yusuf, dal `yusuf/mystifying-nobel-cbb683`, PUSH/DEPLOY YOK).** Modül sayfalarının İngilizcesi: Reklam Yöneticisi + Galeri `aed8a8ec`, Raporlar, Bütçe, Potansiyel Müşteriler, Akıllı Boost, İyileştir, Kurallar, Varlıklar, Marka Merkezi, AdvCampaign, AdvStrategy (`855f3409`..`3fcf7e03`, modül başına bir commit). Sayfa ve sekme başlığı menünün çevirisinden (`menuSatiriEtiketi`, yeni `menuBolumuEtiketi`); ~40 yeni sözlük dosyası (`dil/sozlukler/`), istisna listesi yalnız küçüldü. Son commit'te ağaç `dogrula.sh` ile yeşil (web 2213, API 6738); ARA commit'ler tek tek doğrulanmadı (ortak bekçiler ve istisna listesi son commit'te). Modüllerin çoğu Sonnet alt ajanlarıyla yazıldı; İngilizce yarılarda Türkçe harf ve uzun tire taraması temiz. **Ölçülmedi:** ekranlar tarayıcıda hiç görülmedi (masaüstü + mobil tasarım denetimi yapılmadı); çeviri kalitesini ana dili İngilizce biri okumadı. **Bilerek kalan Türkçe:** rapor belgesinin gövdesi (`report-document`, `kitle-ozeti`, `conversion-chart`, `/r/[token]`) D5'e (PDF Türkçe, rapor dili workspace ayarı); Kurulum sihirbazı (`/kurulum`, `components/kurulum/*`) D3 listesinde yoktu, hâlâ Türkçe; shared sabitleri ve API cümleleri (D4) İngilizce ekranda Türkçe görünüyor: kural metrik/operatör adları, kurulum adım adları, `GOAL_META`, Boost durum/metrik adları, öneri/sinyal adları, fatura sütunları, CTA etiketleri. Tutar girişi (`tutarAyristir`) İngilizcede de Türkçe biçim bekliyor (`200.000`): ürün kararı gerekiyor.

**17 EKİM — /en DÖNGÜSÜ KAPANDI (canlı `ab25ec20`).** D1'den beri canlıda `/en` Türkçe çiziliyor, `en` çerezinden sonra ERR_TOO_MANY_REDIRECTS veriyordu (Next'in vekil isteği middleware'den ikinci kez geçiyordu; `panel-derleme.md`). Deploy sonrası canlıda ölçüldü: çerezli/çerezsiz `/en` 200 ve `lang="en"`, `/en/privacy` yönlendirmesiz 200, `/gizlilik`+en çerezi tek 307 → `/en/privacy`, onay sayfası İngilizce başlıkla (D3 canlıda).

## Sıradaki iş

1. **D3 tasarım denetimi:** İngilizce panelde her modül masaüstü + mobil
   (canlıya alındıktan sonra; taşan İngilizce düğme/etiket aranacak).
2. **İki dilli D4:** shared etiketleri + API cümleleri (liste yukarıda ve
   D3 commit gövdelerinde), ardından Kurulum sihirbazı. Kurallar
   `docs/i18n/MIMARI.md`, `CEVIRI-REHBERI.md`.
3. **Onay bekleyenler** `PROGRESS.md`te `(onay bekliyor…)` işaretli (~15
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
