# Devir — nerede kaldık

> **"advetics projesine devam et" denince okunan İLK dosya bu.** En çok
> ~8 KB: yalnız SON DURUM, SIRADAKİ İŞ, BEKLEYENLER. Her oturum kapanırken
> işin kendi commit'inde güncellenir; biten bir girdi bir sonraki oturumda
> [`arsiv/DEVAM-2026-10.md`](arsiv/DEVAM-2026-10.md) sonuna taşınır (orada
> 7 Ekim → 16 Ekim'in bütün girdileri duruyor; daha eskisi
> [`arsiv/DEVAM-2026-08.md`](arsiv/DEVAM-2026-08.md), geçmiş
> [`DURUM.md` § 8](DURUM.md)). Eski bir işin ayrıntısı gerekiyorsa arşivde
> `grep` ile ara, baştan okuma.

**Son güncelleme:** 2026-10-21 · canlı `c29e02eb` (MCP boost; `a04c299b` hâlâ ayrı dalda).

## Son durum

**21 EKİM — MCP İLE GÖNDERİ BOOST + YAZMA GÜVENLİKLERİ (yusuf, CANLIDA `1ee488b0` + `c29e02eb`).** **Canlı ölçüm (Profaj Reklam Hesabı, `act_680343622074710`):** canlıda 46 araç; `konum_ara` "Aydın" → il merkezi `2289257`; `boost_onizle` Meta kitle tahmini döndü (İzmir 18+: 5,6–6,6 milyon). İlk kurulum (IG fotoğraf, profil ziyareti) Meta'da "link zorunlu" (2061015) ile kreatif adımında düştü, kampanya + ad set geri silindi (günlükte uyarı yok), kayıt `failed` + Meta'nın cümlesi → düzeltme `c29e02eb` (kullanıcı adı kampanyadan ÖNCE okunuyor, `platform-meta.md`). İkinci deneme: boost `17ea6b7d-…`, Meta kampanya `52697795561378` **PAUSED**, ad set ACTIVE, 300 ₺ toplam, geri okuma `VISIT_INSTAGRAM_PROFILE` / `INSTAGRAM_PROFILE` uyuştu; workspace denetim kaydı (`mcp.islem_*`, 12 satır özet) iki denemede de yazıldı. **BAŞLATILMADI** (para harcamıyor; o gönderiye ikinci boost açılmaz, istenmiyorsa Ads Manager'dan silinmeli). **Hâlâ ölçülmedi:** mesaj (INSTAGRAM_MESSAGE düğmesi de link isteyebilir), trafik, erişim, Facebook gönderisi; `boost_baslat` takvimi; panel üst sınır alanı masaüstü + mobil. Kod notu: Görev (Armağan): Claude'dan MCP ile boost açılamıyordu; kullanıcı "MCP'de geliştirilebilecek her şey". Mimari + çelişki tablosu [`okuma-api/MCP-BOOST-MIMARI.md`](okuma-api/MCP-BOOST-MIMARI.md). 11 yeni araç (toplam yazma 37): `boost_gonderileri`, `boost_onizle` (hiçbir şey açmaz; kitle büyüklüğü `reachestimate`, asgari bütçe, `onizleme_kodu`), `boost_olustur` (önizleme kodu ŞART, onaylı, DURAKLATILMIŞ kurar: yeni kampanya PAUSED), `boost_baslat` (hiç başlamamışsa ad set takvimi bugünden yeniden kurulur) / `boost_duraklat` / `boost_butce_degistir` (onaylı, geri okumalı), `boostlar`, `boost_durumu` (Meta'dan anlık), `kitleler`, `konum_ara` (Aydın anahtarı sorunu), `ilgi_ara`. Kurulum panelin elle boost yürütücüsünden (`BoostsService.mcpBoostAc`), ikinci yol yok; panel yolu değişmedi (testle kilitli). Hedefler: etkileşim + erişim (FB+IG), profil ziyareti / mesaj / trafik yalnız IG; eşleme Meta Ads MCP belgesinden, kurulumdan sonra ad set GERİ OKUNUR. Ön ayar yalnız `on_ayar_kullan: true` ile (#85776). **Güvenlik:** anahtar başına tek işlem üst sınırı (`tek_islem_ust_siniri_micros`, boşsa 50.000; rehber yayını, bütçe değişikliği ve boost'ta onay AÇILMADAN ret), panelde yazma anahtarı oluştururken alan + tabloda sınır; bütçe araçlarında "müşteri onayı" açıklaması; workspace'e bağlı denetim kaydı (`mcp.islem_*`, özetle). Migration `20261026100000_mcp_boost` (boosts: hedef, hedef_adres, duraklatilmis_kur, yayin_baslangici; anahtar sınırı; onay CHECK). Bitiş taraması süreyi başlatmadan sayıyor, hiç başlatılmamış boost'u bitirmiyor. Testler: `mcp-boost.spec.ts` (25), `meta-boost-hedefi.spec.ts` (15), `mcp-boost-kurulum.spec.ts` (6, PGlite), `mcp-boost-sorgular.spec.ts` (5, PGlite: servisin ham SQL'i; ilk yazımda olmayan `ad_accounts.deleted_at` kolonu bununla bulundu), `boost-completion` (+3), panel `mcp-mantik` (+3); 22 mutasyonun hepsi düştü. **Ölçülmedi:** canlıda hiçbir şey (MIMARI § 6: beş hedef IG'de duraklatılmış kurulum + geri okuma, `boost_baslat` takvimi, `reachestimate` boost hedeflemesiyle); panel alanı tarayıcıda görülmedi (masaüstü + mobil denetim bekliyor); Claude Code'da yeni araçlar için MCP bağlantısı yenilenmeli.

**20 EKİM — MENÜ SIRASI (yusuf, PUSH/DEPLOY YOK).** Görev (Armağan): Yönet en üste. Yeni sıra Genel Bakış · Yönet · Oluştur · Planla · İyileştir · Raporlar · Base (`lib/nav-sections.ts`, müşteri hesabı da Reklam Yöneticisi'ni AdvStrategy'den önce görüyor). Oluştur'da (kullanıcı kararı) AdvCampaign → **Kampanya Oluştur** (ilk satır, EN "Create Campaign"), Akıllı Boost → **Boost Kampanyası** ("Otomatik" vurgusu kaldı, EN "Boost Campaign"; Genel Bakış kısayolu da); sayfa başlıkları menüden geldiği için onlar da değişti. Kreatif Stüdyo ekranı olmadığından menüde yok. Tanıtım sitesi (`site.*.ts`) ürün adlarına dokunulmadı. `lib/nav-sections.ts` dil bekçisinde kalıcı istisnaya geçti (Türkçe menü anahtarı, çevirisi testle zorunlu). **Ölçülmedi:** menü tarayıcıda görülmedi (canlıda masaüstü + mobil).

**20 EKİM — HEDEF KİTLELER, 2. PARÇA (yusuf, 1. parçanın üstünde, PUSH/DEPLOY YOK).** AdvCampaign › Kime'de açık her platform için ayrı "Kayıtlı kitle" seçicisi (`rehber/kitle-secici.tsx`, dört liste hâli ayrı); seçim ANINDA kopya rehberin `metaKitlesi` / `googleKitlesi` alanına (Ç6, `kitle-secimi.ts`). **Ç9 = B (kullanıcı):** Meta kitlesinin konum/yaşı ortak alanlara, Google kitlesininki `googleKonumlari` / `googleYasAraligi`na (isteğe bağlı, varsayılansız; yoksa Google eskisi gibi ortak konum + en düşük yaş). Google konumu aynı `konum-esle` yolundan (iki liste tek yazmada), istemci karşılık yazamaz; Google yaşı yalnız Talep Yaratma'da, Google yaş gruplarına İÇERİDEN kırpılır (30-55 → 35-54 + not; sığmazsa `G-YAS-ARALIK`); Maks. Performans/Arama'da gitmediği uyarı. Özet kartı "Meta: … · Google: …", Kontrol'de KITLE satırı. **Meta:** `hedeflemeUret` tek `flexible_spec` + `custom_audiences` + `excluded_custom_audiences` + cinsiyet; Advantage+ 1 kalır ("öneri" yazar); kısıtlı kategoride gitmez; başka hesabın özel kitlesi seçimde engel + `KITLE-HESAP` (rehber ve taslak eksikleri, Ç8); geri okuma kimlik kümesiyle. **Google (`g-1.7.0`, eski provalar yeniden prova ister):** Talep Yaratma grubunun TEK kitlesine cinsiyet + `userInterest` + özel segment; Maks. Performans `assetGroupSignal`; Arama'ya kitle YAZILMAZ. Özel segment (`ozel-segment.ts`) atomik isteğin DIŞINDA `customAudiences:mutate`, ad içerikten → yeniden kullanılır; provada yalnız `validateOnly`. Geri okuma boyut sayılarını kıyaslar. Testler `kitle-meta.spec.ts` + `kitle-google.spec.ts` (68) + panel özeti; 31 mutasyonun hepsi düştü. **Ölçülmedi:** canlıda hiçbir şey (MIMARI § 5; `type: SEARCH`, `asset_group_signal` GAQL'i, gender boyutu v25 belgesinden); ekran tarayıcıda görülmedi (masaüstü + mobil denetim bekliyor).

**20 EKİM — HEDEF KİTLELER, CANLIDA `2c50e7f6` (yusuf).** Görev (Armağan Bey): Reklam Yöneticisi'nde kitle ekle/düzenle, reklam kurarken kayıtlı kitle seç, Meta/Google ayrımı + süzgeç. Mimari [`hedef-kitle/MIMARI.md`](hedef-kitle/MIMARI.md), taslak [`marka/taslaklar/hedef-kitleler.html`](marka/taslaklar/hedef-kitleler.html). 1. parça `67fbb1f2`: `audience_templates.platform` + migration `20261025100000_kitle_platformu` (canlıda 6 kitleden 1'i bölündü: "Kuyumcular · Google"), Reklam Yöneticisi › Hedef kitleler'de Kayıtlı kitleler + Performans. 2. parça `dc521ba3`: AdvCampaign Kime'de platform başına kitle seçici, Meta/Google derleyicileri, Ç9 = B (platform bazlı yaş/konum). Canlı denetimde bulunan hata `e7c8f446`: şirket düzeyinde sekme hesap tablosuna düşüyordu → Performans + neden; rozet ve mobil sütun düzeltildi. **Canlıda görüldü (masaüstü):** şirket düzeyi Performans + Kayıtlı kitleler nedeni, workspace'te liste/süzgeç/düzenle/yeni kitle paneli. **Ölçülmedi:** mobil yalnız taşma ölçümü (önizleme 375'e inmedi), AdvCampaign Kime ekranı canlıda açılmadı; Meta+Google'a GERÇEK duraklatılmış kurulumla kitlenin gidişi (MIMARI § 5).

**20 EKİM — MCP'DEN ANLIK FORM (yusuf, CANLIDA `226b5e67`).** Üç araç: `formlar`, `form_olustur` (taslak), `form_yayinla` (onaylı; panelin `FormPublisherService`'i, onay satırı form içerik özetini taşıyor). Migration `20261024100000_mcp_form_yayinla` canlıda. **Canlıda ölçüldü:** Ege Birlik formu `2999249563750186` MCP'den açıldı (geri okuma dil kodunu `tr_TR` döndürdü → yanlış "farklı" alarmı; düzeltme `a04c299b`, PUSH/DEPLOY YOK); rehber `36407cc5-…` ile Meta kampanyası `120252637755120700` DURAKLATILMIŞ kuruldu (21 Ekim → 19 Kasım, 300 TL/gün, İzmir 25+, konut kategorisi kullanıcı kararıyla kapalı). Başlatma ayrı onay (`varlik_etkinlestir`), yapılmadı. Aydın'ın Meta konum anahtarı bulunamadı. Bu oturum araç listesini deploy'dan önce yüklediği için yeni araçlar doğrudan HTTP ile çağrıldı; Claude Code'da yeni araçlar için MCP bağlantısı yenilenmeli.

## Sıradaki iş

00000. **MCP boost (canlıda):** göreve araç listesi + örnek çağrı + test sonucu (oturum sonundaki metin) yazılsın → kalan hedefler (mesaj, trafik, erişim, FB gönderisi) test hesabında duraklatılmış ölçülsün → test boost'u `17ea6b7d-…` silinsin mi kullanıcıya sor → Hesabım › Yapay zekâ bağlantısı masaüstü + mobil.
0000. **Hedef kitleler:** AdvCampaign › Kime canlıda masaüstü + mobil → canlı ölçüm MIMARI § 5 (Meta'da validateOnly YOK: duraklatılmış GERÇEK kurulum, kullanıcı onayıyla).
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
