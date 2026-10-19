# Devir — nerede kaldık

> **"advetics projesine devam et" denince okunan İLK dosya bu.** En çok
> ~8 KB: yalnız SON DURUM, SIRADAKİ İŞ, BEKLEYENLER. Her oturum kapanırken
> işin kendi commit'inde güncellenir; biten bir girdi bir sonraki oturumda
> [`arsiv/DEVAM-2026-10.md`](arsiv/DEVAM-2026-10.md) sonuna taşınır (orada
> 7 Ekim → 16 Ekim'in bütün girdileri duruyor; daha eskisi
> [`arsiv/DEVAM-2026-08.md`](arsiv/DEVAM-2026-08.md), geçmiş
> [`DURUM.md` § 8](DURUM.md)). Eski bir işin ayrıntısı gerekiyorsa arşivde
> `grep` ile ara, baştan okuma.

**Son güncelleme:** 2026-10-19 · canlı: Google ödeme uyarısı + hesap bütçesi bitmek üzere uyarısı · canlı `32020cf5` (Workspace bilgileri mobil taşma) · bekleyen deploy: yok.

## Son durum

**16 EKİM AKŞAM — İKİ DİLLİ ADVETICS, D3 (yusuf, dal `yusuf/mystifying-nobel-cbb683`, PUSH/DEPLOY YOK).** Modül sayfalarının İngilizcesi: Reklam Yöneticisi + Galeri `aed8a8ec`, Raporlar, Bütçe, Potansiyel Müşteriler, Akıllı Boost, İyileştir, Kurallar, Varlıklar, Marka Merkezi, AdvCampaign, AdvStrategy (`855f3409`..`3fcf7e03`, modül başına bir commit). Sayfa ve sekme başlığı menünün çevirisinden (`menuSatiriEtiketi`, yeni `menuBolumuEtiketi`); ~40 yeni sözlük dosyası (`dil/sozlukler/`), istisna listesi yalnız küçüldü. Son commit'te ağaç `dogrula.sh` ile yeşil (web 2213, API 6738); ARA commit'ler tek tek doğrulanmadı (ortak bekçiler ve istisna listesi son commit'te). Modüllerin çoğu Sonnet alt ajanlarıyla yazıldı; İngilizce yarılarda Türkçe harf ve uzun tire taraması temiz. **Ölçülmedi:** ekranlar tarayıcıda hiç görülmedi (masaüstü + mobil tasarım denetimi yapılmadı); çeviri kalitesini ana dili İngilizce biri okumadı. **Bilerek kalan Türkçe:** rapor belgesinin gövdesi (`report-document`, `kitle-ozeti`, `conversion-chart`, `/r/[token]`) D5'e (PDF Türkçe, rapor dili workspace ayarı); Kurulum sihirbazı (`/kurulum`, `components/kurulum/*`) D3 listesinde yoktu, hâlâ Türkçe; shared sabitleri ve API cümleleri (D4) İngilizce ekranda Türkçe görünüyor: kural metrik/operatör adları, kurulum adım adları, `GOAL_META`, Boost durum/metrik adları, öneri/sinyal adları, fatura sütunları, CTA etiketleri. Tutar girişi (`tutarAyristir`) İngilizcede de Türkçe biçim bekliyor (`200.000`): ürün kararı gerekiyor.

**17 EKİM — /en DÖNGÜSÜ KAPANDI (canlı `ab25ec20`).** D1'den beri canlıda `/en` Türkçe çiziliyor, `en` çerezinden sonra ERR_TOO_MANY_REDIRECTS veriyordu (Next'in vekil isteği middleware'den ikinci kez geçiyordu; `panel-derleme.md`). Deploy sonrası canlıda ölçüldü: çerezli/çerezsiz `/en` 200 ve `lang="en"`, `/en/privacy` yönlendirmesiz 200, `/gizlilik`+en çerezi tek 307 → `/en/privacy`, onay sayfası İngilizce başlıkla (D3 canlıda).

**19 EKİM — GOOGLE OAUTH DOĞRULAMASI REDDİ (yusuf, dal `yusuf/heuristic-blackwell-8198a3`, PUSH/DEPLOY YOK).** 17 Ekim maili: ana sayfa ve gizlilik "yanıt vermiyor", demo videosu scope'ları göstermiyor. Ölçüm: bugün iki adres her user agent'la 200, TLS/robots temiz; en güçlü aday 17 Ekim'de kapanan `/en` döngüsü (İngilizce tarayıcılı inceleyici dil ekranında English deyince döngüye düşüyordu). Bulunup düzeltilen: `www.advetics.com` white-label sayılıp "rapor bulunamadı"ya gidiyordu (→ kök alana 308); dil ekranı botların çizdiği sayfayı kaplıyordu (bot UA'da çizilmiyor). Scope tablosu: altı scope'un hepsi kullanılıyor, gereksiz yok. Belgeler [`google-dogrulama/`](google-dogrulama/BULGULAR.md): bulgular, çekim senaryosu, İngilizce yanıt maili, gizlilik ek bölümü önerisi. **Ölçülmedi:** Google'ın kendi ağından erişim (PageSpeed kotası dolu); nginx kaydında 15–17 Ekim Google istekleri.

**19 EKİM — GOOGLE ÖDEME SORUNU PANELE YANSIYOR (yusuf, CANLIDA `36c59858`, migration `20261022100000_hesap_odeme_durumu` uygulandı).** Sebep: kural yalnız `customer.status = SUSPENDED`a bakıyordu; kartı reddedilen / yöntemi olmayan / hesap bütçesi biten Google hesabı ENABLED kalıyor. v25'te ödeme `billing_setup` + `account_budget`ta, `primary_status_reasons`ta ödeme nedeni YOK (proto'lardan; `platform-google.md`). Nabız saatte bir iki sorgu okuyup `ad_accounts.odeme_durumu`na yazıyor; karar tek yerde (shared `hesapOdemeKarari`, Meta da oradan) ve bant + zil + mail + Reklam Yöneticisi (hesap satırı "Durdu: ödeme sorunu", kampanya/set/reklam "Durdu: hesapta ödeme sorunu") + Veri durumu satırı (sorun / sorun görünmüyor / bilinmiyor) onu okuyor; metin TR/EN sözlükten, "Google Ads'te ödemeyi aç" bağlantısıyla. Okuma düşünce mail damgası silinmiyor (yinelenen mail yok). **Canlı ölçüm (kullanıcı izniyle, salt okuma):** iki sorgu 57/57 atanmış hesapta döndü, alan biçimi koda birebir uydu; bugün HİÇBİR hesap kurala göre ödeme sorunlu değil, yani ekran ödeme sorunlu hesapta gözle GÖRÜLEMEDİ (yerel DB de kapalı). Deploy sonrası ilk nabız 56 hesabı 0 hatayla okudu. Gözle (masaüstü + 375 px): Veri durumu Google satırında "Ödeme: sorun görünmüyor" rozeti ve ipucu ("okundu 5 dk önce"), dar sütunda kendi satırına iniyor; bantta 3 GERÇEK Meta ödeme uyarısı sözlük cümlesiyle ve "Meta’da ödemeyi aç ↗" düğmesiyle. **Önceden var olan mobil taşma:** Workspace bilgileri 375 px’te 780 px çiziliyordu; aşağıdaki girdide düzeltildi. "Hesap bütçesi bitmek üzere" uyarısı (`ed92dfbf`): kalan ≤ 3 günlük ortalama harcama ya da < %5 ise zilde `warn` (mail yok); Tınaztepe canlı yanıtıyla tetikleniyor (%0,8, ~1 gün). Kart reddi API'de yok: panel göremez, ipucunda yazıyor. Ödeme ekranı adresleri (Google özet, Meta `billing_hub?asset_id=`) tıklanıp doğrulanmadı.

**19 EKİM — WORKSPACE BİLGİLERİ TELEFONDA TAŞMIYOR (yusuf, CANLIDA `32020cf5`).** Asıl sebep sütunsuz ızgaralar: `grid gap-4` örtük `auto` sütunu en geniş çocuğun min-content'inden daralmıyor ve `overflow-x-auto` içindeki son işler tablosu (min 46 rem) sayfayı itiyordu. Marka Merkezi'nin bütün ızgaraları ve `SayfaIcDuzen` içerik sütunu `grid-cols-1`; `DetaySatiri` değeri kırılıyor (rapor alıcıları); kanal formu düğmeleri telefonda alt alta ve sarılabilir. Bekçi `marka-merkezi-tasma.spec.ts` (üç mutasyonla düşürüldü), `dogrula.sh` yeşil. **Canlı ölçüm (Ege Birlik Yapı, oturumlu Chrome):** pencere daralmadığı için sayfanın canlı DOM'u aynı sayfada 375 ve 1280 piksellik `srcdoc` çerçevede canlı CSS'le çizildi (sayfa çerçeveye `frame-ancestors` ile yüklenmiyor): 375'te `scrollWidth` 364 (kaydırma çubuğu hariç), taşan öğe yok, son işler tablosu kendi kabında 280/736, "Kaydet ve deneme mesajı gönder" iki satır ve kartın içinde; 1280'de taşma yok. Aynı desen (sütunsuz ızgara) başka sayfalarda da olabilir, taranmadı.

## Sıradaki iş

0. **Google doğrulaması (kullanıcı):** deploy onayı → başvuruda adresleri
   `https://advetics.com/en` ve `/en/privacy` yap → Cloud Console "Data
   access"te yalnız altı scope kalsın → gizlilik ekine karar
   (`GIZLILIK-ONERISI.md`, Gemini katmanı doğrulanmalı) → videoyu
   `CEKIM-SENARYOSU.md` ile çek (demo hesabı, ajans bağlantısına dokunma)
   → `YANIT-MAILI.md`yi gönder.
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
  Google için önerilen ek bölüm (Limited Use + AI + scope listesi):
  [`google-dogrulama/GIZLILIK-ONERISI.md`](google-dogrulama/GIZLILIK-ONERISI.md).
- Yalnız GA4 okuyan kullanıcıya da beş ölçüm scope'u soruluyor; ayrı
  `analytics.readonly` akışı açılsın mı (`BULGULAR.md` § 5).

## Araçlar

- "O günden beri ne geldi": `git log --oneline $(git log -1 --format=%h -- docs/DEVAM.md)..origin/main`
- Canlı ölçüm (salt okunur, sunucuda `advetics` kullanıcısıyla):
  `cd ~/htdocs/advetics.com && pnpm --filter @advetics/api olcum-senkron -- --eposta=<kullanıcı e-postası>`
