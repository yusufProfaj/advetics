# Devir — nerede kaldık

> **"advetics projesine devam et" denince okunan İLK dosya bu.** En çok
> ~8 KB: yalnız SON DURUM, SIRADAKİ İŞ, BEKLEYENLER. Her oturum kapanırken
> işin kendi commit'inde güncellenir; biten bir girdi bir sonraki oturumda
> [`arsiv/DEVAM-2026-10.md`](arsiv/DEVAM-2026-10.md) sonuna taşınır (orada
> 7 Ekim → 16 Ekim'in bütün girdileri duruyor; daha eskisi
> [`arsiv/DEVAM-2026-08.md`](arsiv/DEVAM-2026-08.md), geçmiş
> [`DURUM.md` § 8](DURUM.md)). Eski bir işin ayrıntısı gerekiyorsa arşivde
> `grep` ile ara, baştan okuma.

**Son güncelleme:** 2026-10-19 · canlı `32020cf5` · bekleyen deploy: MCP yazma (dal `yusuf/mcp-reklam-yayinlama-5dc541`, migration `20261023100000_mcp_yazma`, PUSH YOK).

## Son durum

**20 EKİM — HEDEF KİTLELER, AJAN 1 (yusuf, KOD YOK).** Görev (Armağan Bey): Reklam Yöneticisi'nde kitle ekle/düzenle, reklam kurarken kayıtlı kitle seç, Meta/Google ayrımı + süzgeç. Kullanıcı kararı: her kitle TEK platform (iki platformlu kayıtlar migration'da bölünür); seçilen kitlenin TAMAMI (ilgi, özel kitle, Google ilgi + kelime) platforma gider = yeni yazma yolu. Mimari + çelişki tablosu Ç1–Ç9 [`hedef-kitle/MIMARI.md`](hedef-kitle/MIMARI.md), taslak [`marka/taslaklar/hedef-kitleler.html`](marka/taslaklar/hedef-kitleler.html) (masaüstü + 375 px taşmasız). **Kullanıcı onayı bekliyor:** taslak ve Ç1–Ç9 (en büyüğü Ç9: platform bazlı yaş/konum).

**20 EKİM — MCP'DEN ANLIK FORM (yusuf, CANLIDA `226b5e67`).** Üç araç: `formlar`, `form_olustur` (taslak), `form_yayinla` (onaylı; panelin `FormPublisherService`'i, onay satırı form içerik özetini taşıyor). Migration `20261024100000_mcp_form_yayinla` canlıda. **Canlıda ölçüldü:** Ege Birlik formu `2999249563750186` MCP'den açıldı (geri okuma dil kodunu `tr_TR` döndürdü → yanlış "farklı" alarmı; düzeltme `a04c299b`, PUSH/DEPLOY YOK); rehber `36407cc5-…` ile Meta kampanyası `120252637755120700` DURAKLATILMIŞ kuruldu (21 Ekim → 19 Kasım, 300 TL/gün, İzmir 25+, konut kategorisi kullanıcı kararıyla kapalı). Başlatma ayrı onay (`varlik_etkinlestir`), yapılmadı. Aydın'ın Meta konum anahtarı bulunamadı. Bu oturum araç listesini deploy'dan önce yüklediği için yeni araçlar doğrudan HTTP ile çağrıldı; Claude Code'da yeni araçlar için MCP bağlantısı yenilenmeli.

**19 EKİM — MCP İLE REKLAM KURMA VE YÖNETME, ARKA PLAN (yusuf, dal `yusuf/mcp-reklam-yayinlama-5dc541`, PUSH/DEPLOY YOK).** Kararlar ve çelişki tablosu [`okuma-api/MCP-YAZMA-MIMARI.md`](okuma-api/MCP-YAZMA-MIMARI.md): yazma anahtarı `adv_rw_` (≤ 90 gün, yalnız platform sahibi), 23 yazma aracı rehber akışını sürüyor (panelin servisleri, yeni yazma yolu yok); platforma dokunan dört işlem (yayınla, durdur, başlat, bütçe) önce `mcp_onaylari`na özetle satır açıyor, yalnız `onayla` uyguluyor; yayın her zaman duraklatılmış (`RehberService.yayinla` `hepsiKapali`); görsel `yukleme_adresi` jetonu + curl ile Varlıklar'a. Etki yolu `mcp`. Testler: `mcp-yazma.spec.ts` (31), `mcp-onay-rls.spec.ts` (10, SET ROLE); 15 mutasyonun hepsi düştü. **Panel (aynı dal, ikinci commit):** taslak [`marka/taslaklar/mcp-yazma-ayarlari.html`](marka/taslaklar/mcp-yazma-ayarlari.html) kullanıcı onaylı; Hesabım › "Yapay zekâ bağlantısı": yetki seçimi (varsayılan okuma, yazmada süre ≤ 90), yetki rozeti, "Claude'un işlemleri" tablosu (`GET /okuma-api/onaylar`, N / toplam), `onayla` uyarısı, yazma araçları listesi; TR/EN. Gerçek bileşen + derlenmiş CSS ile durağan çizimde masaüstü ve 375 px ölçüldü (taşma yok); **çalışan panelde görülmedi** (yerelde DB yok). **Ölçülmedi:** canlıda hiçbir şey; nginx gövde sınırı (yükleme), Claude Code'un `onayla` izin sorusu, Meta+Google `kapali_kuruldu`. Bütçe aracı İyileştir'in %20 sınırını uygulamıyor (kullanıcı kararı, özet uyarıyor).

**19 EKİM — SÜTUNSUZ IZGARA TARAMASI, 2. TUR (PUSH/DEPLOY YOK).** Taşan: Ekip (rol matrisi sarmalayıcısı, 662→375) ve Okuma API (`pre` + MCP adresi, 409→375); `SayfaIskeleti` kökü önlem. E-posta imzası taşmıyor, dokunulmadı. Ölçüm canlıya girilemediği için gerçek sınıf dizgileriyle 375 piksel çerçevede yapıldı; **canlıda Ekip ve Okuma API (ayarlar/hesabim) masaüstü + mobil `scrollWidth` ile teyit edilmeli**. Ölçülmeyen: veri kadar geniş `Dugme` etiketleri (`whitespace-nowrap`). Ayrıntı `kurallar/panel-derleme.md`.

**16 EKİM AKŞAM — İKİ DİLLİ ADVETICS, D3 (yusuf, dal `yusuf/mystifying-nobel-cbb683`, PUSH/DEPLOY YOK).** Modül sayfalarının İngilizcesi: Reklam Yöneticisi + Galeri `aed8a8ec`, Raporlar, Bütçe, Potansiyel Müşteriler, Akıllı Boost, İyileştir, Kurallar, Varlıklar, Marka Merkezi, AdvCampaign, AdvStrategy (`855f3409`..`3fcf7e03`, modül başına bir commit). Sayfa ve sekme başlığı menünün çevirisinden (`menuSatiriEtiketi`, yeni `menuBolumuEtiketi`); ~40 yeni sözlük dosyası (`dil/sozlukler/`), istisna listesi yalnız küçüldü. Son commit'te ağaç `dogrula.sh` ile yeşil (web 2213, API 6738); ARA commit'ler tek tek doğrulanmadı (ortak bekçiler ve istisna listesi son commit'te). Modüllerin çoğu Sonnet alt ajanlarıyla yazıldı; İngilizce yarılarda Türkçe harf ve uzun tire taraması temiz. **Ölçülmedi:** ekranlar tarayıcıda hiç görülmedi (masaüstü + mobil tasarım denetimi yapılmadı); çeviri kalitesini ana dili İngilizce biri okumadı. **Bilerek kalan Türkçe:** rapor belgesinin gövdesi (`report-document`, `kitle-ozeti`, `conversion-chart`, `/r/[token]`) D5'e (PDF Türkçe, rapor dili workspace ayarı); Kurulum sihirbazı (`/kurulum`, `components/kurulum/*`) D3 listesinde yoktu, hâlâ Türkçe; shared sabitleri ve API cümleleri (D4) İngilizce ekranda Türkçe görünüyor: kural metrik/operatör adları, kurulum adım adları, `GOAL_META`, Boost durum/metrik adları, öneri/sinyal adları, fatura sütunları, CTA etiketleri. Tutar girişi (`tutarAyristir`) İngilizcede de Türkçe biçim bekliyor (`200.000`): ürün kararı gerekiyor.

**19 EKİM — GOOGLE OAUTH DOĞRULAMASI REDDİ (yusuf, dal `yusuf/heuristic-blackwell-8198a3`, PUSH/DEPLOY YOK).** 17 Ekim maili: ana sayfa ve gizlilik "yanıt vermiyor", demo videosu scope'ları göstermiyor. Ölçüm: bugün iki adres her user agent'la 200, TLS/robots temiz; en güçlü aday 17 Ekim'de kapanan `/en` döngüsü (İngilizce tarayıcılı inceleyici dil ekranında English deyince döngüye düşüyordu). Bulunup düzeltilen: `www.advetics.com` white-label sayılıp "rapor bulunamadı"ya gidiyordu (→ kök alana 308); dil ekranı botların çizdiği sayfayı kaplıyordu (bot UA'da çizilmiyor). Scope tablosu: altı scope'un hepsi kullanılıyor, gereksiz yok. Belgeler [`google-dogrulama/`](google-dogrulama/BULGULAR.md): bulgular, çekim senaryosu, İngilizce yanıt maili, gizlilik ek bölümü önerisi. **Ölçülmedi:** Google'ın kendi ağından erişim (PageSpeed kotası dolu); nginx kaydında 15–17 Ekim Google istekleri.

## Sıradaki iş

0000. **Hedef kitleler (onay bekliyor):** taslak + Ç1–Ç9 onayı → Ajan 2(a) platform kolonu + bölme migration ‖ Ajan 3 ekranlar → 2(b) derleyiciler → 4 → 5 (canlı ölçüm MIMARI § 5).
000. **MCP form:** `a04c299b` (dil kodu) push + deploy → Ege Birlik kampanyası `120252637755120700` başlatma kararı kullanıcıda (Aydın eklenecek mi, konut kategorisi).
00. **MCP yazma:** push + deploy (migration `20261023100000_mcp_yazma`) → canlıda Hesabım › Yapay zekâ bağlantısı masaüstü + mobil → yazma anahtarıyla Claude Code'dan canlı ölçüm (MIMARI § 6: /mcp araç sayısı, `onayla` izin sorusu, yükleme sınırı, Meta+Google `kapali_kuruldu`).
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
