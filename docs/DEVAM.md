# Devir — nerede kaldık

> **"advetics projesine devam et" denince okunan İLK dosya bu.** Kısa kalmak
> zorunda: geçmiş [`DURUM.md` § 8](DURUM.md)'de, plan
> [`BASE-PLANI.md`](BASE-PLANI.md)'de. Buraya yalnızca SON DURUM ve SIRADAKİ
> İŞ yazılır; her oturum kapanırken, işin kendi commit'inde güncellenir.
> 16 Ağustos'a kadarki eski devir belgesi: [`arsiv/DEVAM-2026-08.md`](arsiv/DEVAM-2026-08.md).

**Son güncelleme:** 2026-10-13 (Orphex uyarlaması, A-F + 2FA + site) · 2026-10-12 (kurulum rehberi) · 2026-10-12 (hazır workspace Dalga 3) · 2026-10-11 gece (Dalga 3 canlı tur) · 2026-10-11 (Dalga 2 + set kartı) · 2026-10-10 akşam (AdvCampaign canlı tur 2 + banner seti; canlı `55312f6`) · 2026-10-09: **Canlı `6b51390` (11:43, 81 sn); ondan önce 316be15 (10:30):**
aşağıda "DEPLOY EDİLMEDİ" yazan işlerin HEPSİ artık canlıda (AdvCampaign
sohbeti, AdvStrategy ikinci tur, YouTube Boost Aşama 0–1 + kanal bulma, Okuma
API, Base Aşama 1, LinkedIn para birimi). Ölçüldü: `prisma migrate status`
temiz, 2026-10-07…09 arasındaki dokuz migration uygulanmış, yeni tablolarda
RLS politikası var, platform sahibi yalnız hello@profaj.com.
**Bekleyen deploy:** yok hedefleniyor — Aşama 4 (İyileştir + AI Asistan)
bu commit'le deploy ediliyor; migration `20261009100000_iyilestir` (üç
yeni tablo) + `db:rls`.

**ADVCAMPAIGN "SİTEME GELSİNLER" TURU (2026-10-12/13).** Kullanıcı: bütün
amaçlar tam optimize kurulsun, "Siteme gelsinler"den başla; metin önerisi
görseli okumuyor ve hep aynı; giriş ekranı kirli ve silinmiyor. Yapılanlar:
(1) Görsele özel metin (HAZIR-WORKSPACE-PLANI Dalga 2): görsel Gemini'ye
gidiyor, görsel bırakılınca otomatik, `rehber_gorsel_metni` önbelleği,
çapa kalktı, `temperature` açık, Google 12-15 başlık + görünen yol.
(2) Meta/Google başlamama sebebi kalıcı (`platform_sebepleri`).
(3) Giriş ekranı: Yayındakiler · Taslaklar · Arşiv, ayırt edilebilir satır,
taslağı sil / listeden kaldır (platforma dokunmaz) / geri getir.
(4) Optimizasyon: Meta LPV yalnız piksel aktifse (yoksa LINK_CLICKS), Google
dönüşüm teklifi yalnız 30 günde ≥15 dönüşümde, Google site bağlantısı +
açıklama metni (sitenin gerçek alt sayfalarından; SSRF: port/IP/aynı alan).
(5) Para riski taşıyan eski hata: Meta kurulup Google fırlatınca rehber
taslak kalıyordu → yeniden yayın ikinci Meta kampanyası. Düzeldi.
Migration: `20261015100000_rehber_platform_sebebi`, `20261015100100_rehber_gorsel_metni`.
**Ölçülmedi:** pikselsiz LINK_CLICKS kurulumunun geri okuması; Google
uzantı/teklif/görünen yol geri okuma biçimi; büyük harf bağlantı metni;
Gemini görsel token maliyeti. **Açık not:** uzantı reddi sebebi 15 dk bellek
önbelleğinde (kalıcı yazılmalı). **Sıradaki amaç:** kullanıcıyla sırayla.
**Canlı Google deneme kampanyası 24351543772 yayında, günde 250 ₺** (kullanıcıya söylendi).

**ORPHEX UYARLAMASI (2026-10-12 → 13) — CANLIDA `46b78d0` (2026-10-12 09:29 sunucu saati, 102 sn).**
İlk deploy denemesi panel derlemesinde düştü (canlı `.next/types` eski
sayfaya atıf yapıyordu; canlıya ve veritabanına dokunulmadan) — `deploy.sh`
düzeltildi, ikinci deneme temiz: 12 migration + `db:rls` uygulandı,
`prisma migrate status` temiz, üç süreç ayakta, `.env`'e
`SINYAL_SESSIZ_KOSUM="1"` ve `META_UTM_ETIKETI="0"` eklendi.
Kullanıcı: Orphex'i (orphex.co) incele, eksiklerimizi Advetics'e uyarla,
advetics.com'u reklam bilmeyen kişiye anlatan ürün sitesine çevir; karar
yetkisi oturum yöneticisinde. Analiz ve karar kaydı:
`docs/rakip-analizi/ORPHEX-BOSLUK.md` (Ç-O1…Ç-O9). Her paket beş ajan
düzeninden geçti; **her Ajan 4 kapısı en az bir kez KAPANDI ve düzeltildi**.
Son durum: API 5737/5737, panel 1597/1597, iki derleme temiz, Nest grafiği
açılış testi temiz.

| Paket | Belge | Durum |
|---|---|---|
| A sinyaller (anomali, sağlık, e-posta/Slack/Teams) | `docs/sinyal/` | kapı AÇIK |
| 2FA | `docs/guvenlik/2FA.md` | kapı AÇIK (paralel kaba kuvvet açığı bulundu, kapandı) |
| C değişiklik etkisi | `docs/etki/` | kapı AÇIK |
| F1 GA4 okuma | `docs/veri-kaynagi/` | kapı AÇIK; F2 Search Console + F3 e-ticaret yalnız mimari |
| E lead → Meta CRM olayı | `docs/geri-besleme/` | iki tur düzeltme; Google kapalı (offline import yeni geliştiriciye 2026-06-15'ten beri kapalı) |
| D kreatif zekâsı (Gemini görü) | `docs/kreatif-zeka/` | kapı AÇIK |
| B haftalık özet | `docs/haftalik-ozet/` | Ö-1 (rakam yasağının iki kopyası) yönetici tarafından kapatıldı |
| Tanıtım sitesi | `apps/web/src/app/(site)` | 17 sayfa; uydurma müşteri/sayı/fiyat YOK |

**BU İŞTE BULUNAN ESKİ, CANLI HATALAR (deploy'la düzelir):**
(1) 22 tablo şirket taşımasını kırıyordu: AdvCampaign/strateji/kurulum
verisi olan workspace başka şirkete TAŞINAMIYORDU (CLAUDE.md'ye ders).
(2) `buildJobId` workspace'i ayırıcı yapmıyordu: `leads_reconcile` ve
`boosts_evaluate` süpürmeleri her turda TEK workspace işliyordu, onaylı
Akıllı Boost kartları diğer workspace'lerde kurulmuyordu.

**Deploy (YAPILDI, kayıt için):** 12 migration
(`20261013100000_sinyal` … `20261014500000_haftalik_ozet`) + `db:rls`;
`pnpm install` (yeni bağımlılık `qrcode-generator@1.4.4`); `.env`'e
`SINYAL_SESSIZ_KOSUM=1` (14 gün yalnız yönetici görür, kanala gitmez) ve
`META_UTM_ETIKETI=0` (Meta geri okumada url_tags ölçülene kadar KAPALI,
açılırsa yayın "fark"ta durabilir). Sunucuda `git log --oneline
HEAD..origin/main` ile neyin gittiğine bak.

**Canlıda ÖLÇÜLMEDİ (her MIMARI.md'nin "ölçüm listesi"):** Slack/Teams'e
gerçek gönderim (Teams'in iki adres ailesi); anomali eşikleri (14 gün
sessiz koşum); 2FA'nın gerçek telefonla QR okutulması; Meta CRM olayları
M-1…M-7 (ajans token'ıyla müşteri pikseline POST, `lead_id` biçimi,
tekilleştirme) — ilk tur Lead Ads Testing Tool ile; GA4 Data API'nin Google
Cloud'da açık olması ve kota biçimi; Gemini görü maliyeti
(`apps/api/scripts/olcum-kreatif-goru.ts`); etki ve sinyal sorgularının
`EXPLAIN` süreleri; mail HTML'inin Gmail/Outlook/iOS görünüşü.
**Ajan 6 (tasarım denetimi) HİÇBİR pakette yapılmadı**: ekranlar tarayıcıda
açılmadı (yerelde `.env`/API yok). Deploy sonrası masaüstü + mobil.
**Sıradaki:** canlı ölçümler → Ajan 6 (tasarım denetimi) →
F2/F3 uygulaması.

**KURULUM REHBERİ (2026-10-12, `docs/kurulum/MIMARI.md`, `BAGLANTI.md`).**
Kullanıcı: her projenin ayrı Meta, Google Ads, Tag Manager ve Analytics'i;
ajans atamıyorsa rehber hesapları açar, dönüşümleri kurar ve verinin doğru
geldiğini doğrular; ajans atadıysa eksikler tek tuşla tamamlanır. Kararlar
(kullanıcı): hesaplar ajans ya da şirket adına seçilebilir; GTM/GA4'te
proje başına konteyner + mülk (API hesap açamıyor); site kodu gösterilir +
geliştiriciye e-posta + taramayla doğrulama; deneme için Ege Birlik Yapı
SİLİNMEZ, yeni workspace açılır. Marka Merkezi'nin İLK bölümü "Kurulum".
**Kullanıcıda (koddan yapılamaz):** Google Cloud'da Tag Manager API, Analytics
Admin API, Analytics Data API'yi aç + onay ekranına beş izni ekle
(`BAGLANTI.md` §1); sonra Kurulum'da "Ölçüm izinlerini ver".
**Ölçülmedi:** hiçbir yazma yolu canlıda koşmadı (Meta hesap/piksel açma,
Google Ads hesap/dönüşüm, GTM etiket + yayın, GA4 mülk/akış/bağlantı).
İlk kullanımda platform arayüzünde gözle kontrol.

**HAZIR WORKSPACE + AD + BOYUT (2026-10-12, plan `docs/advcampaign/HAZIR-WORKSPACE-PLANI.md`).**
Kullanıcı: workspace kurulup hesap atanınca her şey hazır olsun, kullanıcı
yalnız kreatifi atsın, prova bitince reklam oluşsun; ad "ADV · tarih · amaç
· kod". Canlıda: **Dalga 1** (`e8d6ae4`) ad biçimi Meta + Google, otomatik
prova, "Siteme gelsinler" `acik` (tek tık onayla yayına; diğer amaçlar
`deneme`); banner seti beş amaçta + eksik boyutların tarayıcıda otomatik
üretimi (`a47bb7f`). **Dalga 3** (bu commit): `workspace_hazirlama` tablosu
(migration `20261012100000_workspace_hazirlama` + `db:rls`), hazırlık servisi
(site Facebook sayfasından, marka bilgileri siteden AI ile YALNIZ boş
alanlara, ölçüm, piksel eşleme, kategori/konum soruları, varsayılan bütçe),
Marka Merkezi › Bağlantılar'da "Reklam hazırlığı" kartı, rehberde ön doldurma
(piksel, bütçe, yarın + 30 gün, kategori beyanı) ve KISA AKIŞ (amaçtan sonra
engel yoksa doğrudan Reklam adımı, üstte "Değiştir"li özet). Tetik okumada
(imza), rehber açılışı da tetikliyor.
**Ajan 4** iki bulguyla kapıyı kapattı, düzeldi: B1 okuma yetkisi işi
tetikliyordu (artık yalnız `client.write`), B2 kategori kararının ana yolu
testsizdi (uçtan uca `calistir` testleri, 8 mutasyon yakalandı). Ö3 bütçe
para birimiyle saklanıyor, Ö4 bayat "yarın" yenileniyor ve geçmiş tarih
"hemen" yazıyor, Ö5 site yazılamazsa kayıttaki adres, Ö6 kategori cevabı
yalnız soru bekliyorsa ve denetim kaydıyla, Ö7 kategori özette ve onay
penceresinde. Açık notlar: konum cevabı iki işlem (N9), okuma/iş bitişi
kalıntı yarışı (N10, tek süreçte ucuz), amaç değişiminde bayat eksik
listesiyle kısa yol (N13, yayın sunucuda yine durur).
**Ölçülmedi:** hazırlığın canlı hesapta koşması (AI taslağı, Facebook sayfa
`website`), "aç" yolunun canlı sonucu, yeni banner setlerinin (FORM/WA/
TELEFON/SATIŞ/ERİŞİM) `call_to_actions` geri okuması.
**Sıradaki:** canlıda bir workspace'te hazırlık + kısa akış turu (giriş
kullanıcıdan) → Dalga 2 (görsele özel metin, Gemini görsel girdisi) →
diğer temiz satırlar `acik` → Ajan 6 (Marka Merkezi kartı + kısa akış,
masaüstü + mobil).

**ÖLÇÜM KURULUMU — Faz 1 (2026-10-11 gece, `docs/olcum/`).** Marka Merkezi ›
Ölçüm: dört ölçüm (site formu, satın alma, arama, reklam içi form/WhatsApp)
Meta ve Google için gerçek durumuyla + tek en uygun öneri; tek yazma
"birincil yap" (Google Ads, geri okumalı, denetim kayıtlı, yalnız aktif
workspace'te). Ajan 4 kapıyı kapattı (B1 gtm.js içerik türü, B2 okunamayan
veride "hepsi hazır", B3 bozuk site adresi panel çökmesi, Ö1–Ö5); hepsi
düzeldi, kanıt testleri yeşil. **Faz 2 (bekliyor, kullanıcı kararı):** Tag
Manager'a otomatik etiket ve Analytics bağlama; Google Cloud OAuth onay
ekranına `tagmanager.edit.containers`, `tagmanager.publish`,
`analytics.edit` izinleri ve uygulama doğrulaması gerekiyor. Canlıda henüz
GÖZLE doğrulanmadı: "birincil yap" yazması.
**Bekleyen karar:** AdvCampaign satırlarını `acik` yapmak (izin sistemi
"özellik bayrağı" diye engelledi; kullanıcı onayı gerekiyor).

**DALGA 3 CANLI TUR (2026-10-11 gece, hepsi duraklatılmış, Ege Birlik Yapı).**
TEMİZ görülenler (kurulum + geri okuma): WhatsApp Meta (N-18 sonrası,
"Yeniden kontrol et" ile), Google Talep Yaratma GÖRSEL (erişim), VİDEO Meta
(ThruPlay, video yükleme + işleme) + Google (YouTube). Google "Vazgeç ve
kaldır" canlıda çalıştı; eski 5 deneme kampanyası KALDIRILDI. Turda bulunan
ve düzelen hatalar: geri okuma hatası yutuluyordu; "Yeniden kontrol et" hiç
çalışmamıştı (durum makinesi) ve ekranda yoktu; insan düğmelerinin iş
kimliği sabit olduğu için ikinci basış sessizce yutuluyordu; Meta şemsiye
özellik (N-18), sıklık sınırında `type: CAP` (N-19), kreatif adı 100
karakterde kesiliyor (`kreatifAdi`); ayrı reklamlarda yerleşim kesişimi
akışı kapatıyordu (`reklamSetiPlani`); metin önerisi 9 başlık yazıp 5'i
kullanılıyordu; satışta dönüşümsüz Google "hazır" sayılıyordu; başlamayan
platform sonsuza kadar "Kuruluyor"; liste/son ekran sözleri; soğuk
önbellekte yalancı "asgari bütçe okunamadı"; yenilemede video bilgisi.
**Sıradaki:** ERİŞİM Meta ve SATIŞ Meta yeniden tur (N-19 ve kreatif adı
deploy'dan sonra) → temiz satırlar `acik` → "aç" yolu → Ajan 6.
Google SATIŞ (Maks. Performans) bu hesapta kurulamaz: satın alma dönüşümü
yok (doğru davranış, engel). Meta video turu için video sunucuda
`gorselKaydet` ile yüklendi (tarayıcı CSP'si yerel dosyayı engelledi).

**ADVCAMPAIGN DALGA 3 + CANLI TUR 2 (2026-10-11 akşam, canlı `b679e13`).**
Kullanıcı: kampanya kurma tarafı Meta + Google'da tamamen çalışsın, karar
bende, sormadan. Bugün canlıda TEMİZ (duraklatılmış kurulum + geri okuma)
görülenler: SITE Meta (4 boyutlu banner seti, konut, şehir) + Google Arama;
FORM Meta (1 gün atıf, 17 km); TELEFON Meta + Google (arama öğesi);
VIDEO Google (rehber yolu). Dalga 3 kodu (canlıda, `deneme`): Meta video
(ThruPlay), erişim (haftada 2 sıklık), satış (piksel seçici, PURCHASE),
WhatsApp numarası (sayfadan okunamıyor → soruluyor, kullanıcı onayı şart);
Google Talep Yaratma GÖRSEL (`demandGenMultiAssetAd`), Maks. Performans
(`google-pmax.ts`, satın alma dönüşümü kapısı); Google "Vazgeç ve kaldır"
(`campaignOperation.remove` + REMOVED geri okuma); prova reklam setini
GEÇİCİ kampanyaya karşı doğruluyor (`setiGeciciKampanyaylaDogrula`,
ölçüldü: satır içi set provası her biçimde 5xx); panel ekran hataları
(12 madde). Ajan 4 iki turda 6 bulgu (F1–F6) buldu, hepsi düzeldi.
**Sıradaki:** Dalga 3 canlı turu (WA numara, Meta video/erişim/satış,
Google görsel/PMax, Google kaldır) → temiz olanlar `acik` → "aç" yolunun
gelecek tarihli canlı denemesi → Ajan 6 tasarım denetimi.
Google'da duran deneme kampanyaları (PAUSED): 24347958127, 24348033727,
24348046693, 24336868059 — yeni kaldır yoluyla temizlenecek.
WhatsApp turu 2: prova GEÇTİ (geçici kampanyayla gerçek set denetimi),
kurulum geri okumada "okunamadı" ile durdu (Meta kampanya 120252522495370700,
duraklatılmış). Aynı alanlar dakikalar sonra 200 döndü → yeni setin görünür
olma gecikmesi; hata `catch {}` ile yutuluyordu. Artık 0/3/10 sn yeniden
deneniyor ve Meta'nın mesajı `geri_okuma.ham.okuma_hatalari`nda.

**DALGA 2 CANLI TUR 1 (2026-10-11, Ege Birlik Yapı, hepsi duraklatılmış,
konut kategorisi).** `deneme` kipinde canlıda (`7598dee`). Sonuçlar:
FORM · Meta: form listesi Meta'dan geldi (`privacy_policy_url` kabul), seçili
form kontrolü temiz, prova geçti; kurulumda set **atıf (1, 0)** ile reddedildi
→ form artık 1 gün tıklama (`e738ae5`). TELEFON: iki prova da geçti (Google
CallAsset alanları doğru); Meta set **konutlu şehirde 17 km yarıçap**
(#2909052) ile düştü → kısıtlı kategoride yarıçapsız şehre taban yazılıyor;
Google kampanyası **24347958127 KURULDU (PAUSED, Google Ads'te duruyor, geri
alma yolu yok)** ama arama öğesi geri okuması `campaign.id` SELECT'te yok diye
reddedildi → düzeltildi (`aa75cda`). WHATSAPP: ağacın tamamı kuruldu, tek
fark konum etiketi (Meta ile `name`/`country` ekliyor) → N-16. Arşivlenen
Meta kampanyaları: 120252521557960700, 120252521610050700, 120252521633420700.
**DÜZELTMELER DEPLOY EDİLMEDİ.** Sıradaki: deploy → tur 2 (üç amaç yeniden,
"temiz" görülene kadar) → Google'da arama öğesi ve numara doğrulamasını gözle.
**Prova boşluğu:** satır içi `/adsets` 5xx yüzünden set alanları (atıf,
yarıçap) provada HİÇ sınanmıyor; üç ret de yalnız kurulumda göründü.
Ekran notları: "İzmir, Türkiye" (Meta ili) Google'da eşlenmiyor; WhatsApp ön
koşul metni "Kontrol edilemedi: ... yok" çelişkili; Nerede rayı alt yazısı
tek platformda da "Meta, Google"; amaç kartı listesinde arşivlenenler
"Yayında" görünüyor.

**ADVCAMPAIGN DALGA 2 + BANNER SETİ KARTI (2026-10-11, DEPLOY EDİLMEDİ,
migration YOK).** Kullanıcı: *"kampanya modülünde diğer amaçları da yazmaya
başlayalım sonra konudan sapma"*. Plan + çelişki tablosu
`docs/advcampaign/DALGA-2.md`, devir notları `devir/dalga2-*.md`.
(1) **Set kartı** (taslak onaylı; kararlar: düğmeler degradeli, metin bütün
setlerde ortak, uyarı marka kırmızısı) `components/rehber/set-kartlari.tsx`:
yuvalı setler, sürükle/⋯ ile taşıma, ayrım shared `setlereAyir`dan. Set
yalnız SITE'de (`BANNER_SETI_NIYETLERI`); Form/Telefon/WhatsApp'ta her görsel
kendi reklamı. (2) **Meta Telefon + WhatsApp derleniyor** (CALL_NOW `tel:`,
WHATSAPP_MESSAGE `app_destination`), numara taslağa taşınıyor, yalnız +90.
(3) **Meta Form**: form kimliği artık derleyiciye ulaşıyor; liste SEÇİLİ
sayfanın Meta'daki ACTIVE formları (`GET reklam/rehber/form-sablonlari`);
gizlilik formun kendi adresinden. (4) **Google Telefon**: Arama
kampanyasına CallAsset aynı atomik istekte, geri okuma kıyaslıyor. Google
Form sonraya (içerik kaynağı yok). Ajan 4 beş bulgu buldu (eski taslak yolu
açılış tablosuna bakmıyordu, bilinmeyen form provada uyarıydı, yeni sete
çok dosya, telefon kalıbı, amaç değişince form) — hepsi düzeldi, altı
mutasyon düştü. **`REHBER_ACILIS` DEĞİŞMEDİ:** üçü de `kapali`.
`DERLEYICI_SURUMU` 1.2.0: deploy sonrası SITE rehberlerinde "Prova et" bir
kez yeniden gerekiyor. **Sıradaki:** deploy → Profaj hesabında canlı tur
(prova + duraklatılmış kurulum + gözle): ölçülecekler Meta form
`privacy_policy_url` alanı, Telefon `link_data.link` ve kampanya amacı,
WhatsApp amacı, Google numara doğrulamasının davranışı (ret mi, inceleme
mi) → geçen satır KENDİ commit'inde `deneme` → Ajan 6 tasarım denetimi
(set kartı ekranı henüz tarayıcıda görülmedi). Açık: sohbet/AdvStrategy
aktarımında numara sorusu yok (`DERLENEN_NIYETLER` bilerek dar), Google
arama öğesinin onay durumu panelde görünmüyor, açık saat kaynağı yok.

**ADVCAMPAIGN REHBERİ (2026-10-10) — SOHBET KALKTI, TIKLAMALI REHBER.**
Kullanıcı isteği: Meta + Google tek panelden, tıklayarak, reklam bilmeyen
biri bile kullanabilsin. Plan/kararlar `docs/advcampaign/REHBER-PLANI.md`
(K-1 yedi amaç baştan, K-2 yapay zekâ yalnız düğme arkasında, K-3 iki
platform uygunsa ikisi seçili, K-4 doğrudan yayın + uyum denetçisi), panel
turu `arastirma/A4-panel-turu.md` (Google konumu "tüm ülkeler", ağlar/AI Max
açık; Meta sayfayı BAŞKA MÜŞTERİNİN sayfası seçti — hepsi açıkça yazılıyor),
onaylı taslak `rehber-taslak.html`, mimari `MIMARI-REHBER.md`, devir notları
`devir/ajan2-3-4.md`. Beş ajan: sözleşme `packages/shared/src/reklam/rehber/`,
API `modules/reklam/rehber/` + `modules/reklam/google/`, panel
`components/rehber/` + `/reklam`. Ajan 4 iki turda 5 bulgu buldu (uyum kapısı
delinebiliyordu, bütçe iki yerde farklı bölünüyordu, konum eşlemesini istemci
yazabiliyordu, Instagram sözü, panel/sunucu görünürlük kuralı ayrışması);
hepsi düzeldi, mutasyonla doğrulandı, kapı açıldı. MIGRATION VAR:
`20261010120000_reklam_rehberi`, `20261010130000_strateji_video_izlenme`.
**AÇILIŞ (`REHBER_ACILIS`):** Dalga 1 = SITE (Meta + Google Arama), VIDEO
(Google Talep Yaratma) — `deneme`: yalnız üst hesabın admin üyesi görür,
kurulum DURAKLATILMIŞ kalır (Reklam Yöneticisi'nden Başlat). FORM Dalga 2'ye
kaydı (Meta zinciri form kimliğini boş geçiyor, gizlilik adresi alanı yok).
**CANLI TUR (Ege Birlik Yapı, hepsi DURAKLATILMIŞ kuruldu ve ARŞİVLENDİ):**
Ö-1 Google Arama GEÇTİ (gözle doğrulandı). Ö-7 konutlu Meta provası
çözüldü (satır içi kampanyada kategori sınanamıyor, `KATEGORI_PROVA_NOTU`).
Geri okumada N-07…N-15 normalleştirmeleri canlıdan öğrenildi (CLAUDE.md
"Meta"). **BANNER SETİ (kullanıcı kararı):** bir tasarımın boyutları TEK
reklam (`banner-seti.ts`, `asset_feed_spec` + `optimization_type:
PLACEMENT`), eksik boyutta o yerleşim kapanır; dört boyut tamsa Advantage+.
Dört prova reddinden sonra kuruldu (yayın 3efebf54), gerçek dönüşte kalan
fark 0 ama uçtan uca "temiz" henüz yeni bir kurulumda GÖRÜLMEDİ.
**Sıradaki:** (1) kullanıcı yerleşim önizlemelerini Reklam Yöneticisi'nde
gözle kontrol ediyor (arşivdeki reklam 120252510003750700); (2) ~~set kartı taslağı onay bekliyor~~ (onaylandı ve yazıldı, 2026-10-11);
(3) yeni bir duraklatılmış kurulumla uçtan uca "temiz"; (4) sonra
SITE.meta'yı `acik` yapma kararı (para/ürün kararı, sorulacak); (5) Ajan 6
tasarım denetimi. Ekran düzeltme listesi: konum "Türkiye, Türkiye" çift
yazıyor; yenileyince soldaki adımlara tıklanamıyor; yalnız Meta'da Google
metinleri görünüyor; amaç seçilmeden "hazır" yazıyor; seçili amaç kartına
tekrar tıklamak platform önerisini sıfırlıyor; Meta'nın İngilizce hata
metni prova notunda ham görünüyor; fark_var'da yalnız önemsiz farklar
varken bile tek çıkış arşiv; ~~rehber ekranında "geri al" düğmesi yok~~
(yazıldı: "Vazgeç ve arşivle", duraklatılmış kurulumda da);
`api.ts` açıklaması `yayinla {ozet}` diyor, gövde `icerikOzeti`.
Açık: AdvStrategy → AdvCampaign aktarımı hâlâ sohbet tablosuna yazıyor
(okuyan ekran yok, ürün kararı); Google yayını için geri al yok; yayına
alınmış rehber düzenlenemiyor.

**OTURUM DÜŞMESİ — REFRESH YARIŞI (2026-10-10, DEPLOY EDİLMEDİ).**
Üretimde 2026-10-09 20:44 çok sekmeli kullanıcı "olası hırsızlık" ile
düştü. `token.service.ts`: rotasyon iptali koşullu (`revokedAt: null`),
yeni döndürülmüş token'ın 30 sn içinde AYNI User-Agent'tan tekrarı yeni
çift alıyor; pencere dışı / başka tarayıcı / kapatılmış aile (çıkış,
şifre değişimi) / pasif kullanıcı hâlâ aileyi iptal ediyor.
`refresh-yarisi.spec.ts` (PGlite) eski kodda arızayı üretiyor, altı
mutasyon düşüyor. Migration yok. Kök sebep ÖLÇÜLMEDİ: aday iki yol
(`advetics.com`/`www` sekmeleri çerezi paylaşıp kilidi paylaşmıyor;
yanıtı kaybolan istek). Canlıda log'da "tolerans içinde tekrar sunuldu"
uyarısı görülürse bu yol çalışıyor demek.

**AŞAMA 4 — İYİLEŞTİR v1 + AI ASİSTAN v1 (2026-10-09).** Plan, çelişki
tablosu, mimari: `docs/iyilestir/`. `/iyilestir` üç sekme (Öneriler, AI
Asistan, Kurallar; `/kurallar` yönleniyor). Uygula Meta VE Google'da
(kullanıcı kararı), yazdıktan sonra platformdan geri okuma, özet
uyuşmazlığında ret, ajans acil şalteri iki yazma yolunda da (Ajan 4
bulgusu). **GOOGLE YAZMA YOLU CANLIDA HİÇ DENENMEDİ:** ilk adım
`?prova=true` (validateOnly) ile, sonra kullanıcının seçtiği en küçük
değişiklik + Google Ads'te gözle doğrulama. Ölçülmedi: Google
`explicitly_shared` alanı geliyor mu (gelmezse her bütçe paylaşımlı
sayılıp reddedilir), asistanın gerçek Gemini akışı. Kural motoru artık
Google'a yazmıyor (kasıtlı; eskiden "henüz yazılmadı" ile düşüyordu).

**AŞAMA 3 — REKLAM YÖNETİCİSİ + GENEL BAKIŞ DÜZENİ (2026-10-09).** Kullanıcı
iki HTML taslağını onayladı ("mükemmel olmuş"). İniş tablosu Genel
Bakış'tan Reklam Yöneticisi'ne (`/ads-explorer`) taşındı, menü adı
değişti, eski kart ekranı Reklam Galerisi (`/ads-explorer/galeri`).
Reklam düzeyinde "Önizlemeler" anahtarı: açıkken hepsi açık, kapalıyken
eski kural (tek önizleme). Genel Bakış: solda Performans tek kart (kutular +
grafik + ikincil şerit) ve şirket/workspace/hesap + en çok harcayan 5
kampanya; sağda bekleyen işler, bütçe, dönüşümler. VERİ EKSİLMEDİ.
İLK SÜRÜM REDDEDİLDİ ("taslağın aynısını istiyorum"): taslağı eski
bileşenlerle yaklaşık kurmuştu. İkinci sürüm taslağın KENDİ CSS'i
(`components/taslak/`). Canlı denetimde bulunanlar düzeltildi: bekleyen
işler kartı boştu (istemci dosyasından sabit aktarımı; `istemci-siniri.
spec.ts`), kapsam geçişinde yükleme katmanı takılıyordu, büyük tutar
kırpılıyordu, çift sayaç, sağ sütunda boşluk. ÖLÇÜLMEDİ: telefon
genişliği (Chrome penceresi küçülmedi). **Eski bileşenler SİLİNDİ
(2026-10-09 gece, DEPLOY EDİLMEDİ, migration yok):** SirketTablosu,
MusteriTablosu, HesapKirilimi, BreakdownTable, MetricsChart, MetricCard,
MetricStrip, DonusumDetay, DeltaRozeti, budget/ButceKarti. Kuralları yeni
bileşenlere taşındı ve mutasyonla doğrulandı; yeni kartlarda kaybolmuş beş
kural geri kondu (iyi/kötü tek fonksiyonda `lib/degisim.ts`, "kampanyalar
durmuş olabilir", dönüşümde adlandırılmış/toplam + Meta notu, bütçede ayın
ilk günü ve dolan bütçede "0 ₺/gün" yok). **Açık:** Reklam Yöneticisi
sıralaması istemcide ve adresteki `sirala`yı ezip yok sayıyor (mecraya göre
sıralama da kalktı); terim sözlüğü (`lib/terimler.ts`, `ui/terim.tsx`) ve
`tempoCumleleri` hiçbir ekranda kullanılmıyor.
Sonra: satır içi durdur/başlat/bütçe (Aşama 3'ün kalanı), grafikte metrik
seçimi (taslakta vardı, kodda yok: grafik hâlâ harcama + dönüşüm).

**ÜRÜN YAPISI PLANI (2026-10-09, kullanıcı isteği):** panel yedi bölüme
geçiyor: Genel Bakış · Planla · Oluştur · Yönet · İyileştir · Raporlar ·
Base. Bu adlar Türkçe, AI Asistan İyileştir altında geri geliyor ve reklam
kurmuyor. Orphex'ten farkımız "söyler değil, yapar". Plan ve aşamalar
[`URUN-YAPISI-PLANI.md`](URUN-YAPISI-PLANI.md). Kod yazılmadı.
Ç-3 kapandı: bütçe Planla'da. **Açık kararlar:** Ç-4 Hesap Oluştur, Ç-5
tanıtım sitesi.

**AŞAMA 0 — CANLI TURLAR (2026-10-09).** Düzeltmeler CANLIDA
(`6b51390`, 11:43 deploy, 81 sn, migration yok).

1. **YouTube "Prova et": GEÇTİ** (250 ₺/gün, kullanıcı kararı). Üç ret
   düzeltildi ve Google'da doğrulandı (CLAUDE.md "Demand Gen — prova").
   K3 KAPANDI: ilk yayın DURAKLATILMIŞ kurulacak (kullanıcı). Doğru adres
   `https://gardenvillaskusadasi.com/` (çift l; sayfa başlığı "EGE BİRLİK
   YAPI – GARDEN VİLLAS"). Adres ön ayardan/workspace'ten geliyordu ve
   workspace'te iki proje var: kart düzenlemesine **Hedef adres** alanı
   eklendi, prova ve yayın aynı alanı kullanıyor (canlı `dd21dc2`).
   **İLK GERÇEK GOOGLE YAZMASI YAPILDI (2026-10-09 12:17):** Garden Villas
   kartı DURAKLATILMIŞ kuruldu, Google kampanya kimliği `24336100271`, kart
   `launched`, ikinci kurulum engeli devrede. Google'da PAUSED olduğunu
   KULLANICI GÖZLE DOĞRULADI (2026-10-09); panel duraklatılmış kampanyayı
   okuyamıyor (canlı liste yalnız yayındakileri gösteriyor). Başlatmak
   kullanıcıda, Google Ads'ten. Küçük not: kartın "tekrar boost" engeli
   "hâlâ yayında" diyor, kampanya duraklatılmış. K4 (token seviyesi) açık.
2. **AdvCampaign site taslağı:** dört ekran hatası düzeltildi ve canlıda
   doğrulandı (amaç tekrar sorulmuyor, ekran takılmıyor, görsel balonda).
   Konut beyanı yapıldı (kullanıcı), öneriler onaylandı, **Meta provası
   REDDETTİ**: kampanya ve kreatif geçti; reklam seti ve reklam
   `special_ad_categories[0] ... got "2"` ile düştü. Gönderilen değer
   `["HOUSING"]`; kampanya tek başına geçiyor, satır içi `campaign_spec`
   içinde Meta değeri kendi iç sayısına çevirip reddediyor gibi. Gerçek
   kurulum `campaign_id` ile ve bu yoldan geçmiyor ama prova bunu
   kanıtlayamıyor. ÇÖZÜM ÖLÇÜLMELİ (kategoriyi provadan atmak konut
   kısıtlarının denetimini de susturur — yalancı prova). Ayrıca:
   araç retlerinin SEBEBİ artık ekranda (önceden yalnız modele gidiyordu);
   özel kategori sorusu yalnız Taslak sekmesinde, dar ekranda görünmüyor.
3. **AdvStrategy aktarımı: ÇALIŞIYOR** (kutu dolu, görsel modele ulaşıyor).
4. **Okuma API:** kullanıcı anahtar oluşturacak.

**AŞAMA 1 — MENÜ (2026-10-09), CANLIDA (`6e18a40`, 12:47, 104 sn).**
Yedi bölüm: Genel Bakış · Planla (AdvStrategy, Aylık Bütçe) · Oluştur
(Akıllı Boost, AdvCampaign) · Yönet (Reklam Keşfi, Potansiyel Müşteriler) ·
İyileştir (Kurallar) · Raporlar · Base (Marka Merkezi) + Ayarlar. Aylık
Bütçe Marka Merkezi'nden `/butce` sayfasına döndü (eski adres yönleniyor).
İkon rayı yapılmadı, Ekip Base'e taşınmadı — gerekçeler
[`URUN-YAPISI-PLANI.md`](URUN-YAPISI-PLANI.md) Aşama 1. Müşteri hesabı yine
dört ekran. Canlıda kontrol edildi: menü yedi bölüm, `/butce` açılıyor,
`/marka-merkezi?bolum=butce&ay=…` ayı taşıyarak yönleniyor.
**Sıradaki: Aşama 2 (Genel Bakış karar ekranı).**

**AŞAMA 2 — GENEL BAKIŞ (2026-10-09), CANLIDA (`68ca513`, 13:48, 79 sn).** Bekleyen işler kutusu (Boost onayı, strateji onayı,
aktarılmamış plan, bütçesiz harcama) + ay temposu cümleleri + hızlı
erişim. Mimari ve ajan notları [`genel-bakis/MIMARI.md`](genel-bakis/MIMARI.md).
Ajan 4: RLS SET ROLE testi (15), mutasyonlar; Aşama 2'de bulgu yok.
Önceden var olan bütçe bulgusu DÜZELTİLDİ ve CANLIDA (`5860460`): bütçe servisi "tüm şirketler" kipinde `ctx.orgId` ile
okuyup yazıyordu; okuma artık `ctx.clientIds` + RLS, yazma `org_id`yi
hedef workspace'ten okuyor ve ON CONFLICT org'u da düzeltiyor. **Açık:**
üretimde `monthly_budgets`te TEK satır var (`pg_stat_user_tables`), ama
org'u doğru mu ÖLÇÜLMEDİ: `advetics_app` RLS'e tabi ve bağlamsız sorgu onu
göremiyor (0 satır döndü, anlamı yok). BYPASSRLS bir rolle bakılmalı. Varsa o satır kardeş şirketin İÇİNDEN güncellenemiyor
(RLS reddi, testte ölçüldü); veri düzeltmesi önerildi, onay bekliyor:
`UPDATE monthly_budgets b SET org_id = c.org_id FROM clients c
WHERE c.id = b.client_id AND b.org_id <> c.org_id`.
CANLIDA ÖLÇÜLDÜ: Ege Birlik kutu 14 Boost = ekranda 14 `pending` (0
`kontrol`); uç 88 ms (tüm) / 83 ms (tek). Ekranda kutu, tempo cümleleri ve
kısayollar gözle görüldü. Ölçülmedi: 52 workspace'li "tüm şirketler"
kipinde süre (oturum tek workspace'li şirketteydi).
**Sonra: Aşama 3 (Reklam Yöneticisi, kullanıcının tarifi planda).**

**Karar bekleyen kullanım sorunu:** asistan kullanıcının AÇIKÇA söylediği
alanları da "öneri" diye yazıyor ve onay kartında yeniden onaylatıyor.

Ardından Aşama 1 (menü ve görsel düzen).

**SUNUCU 2026-10-09 (Hostinger yeniden başlattı) — TARİHÇE, 10:30 deploy'u
bunu kapattı:** yarım kalan deploy API'yi
ve paneli `703b2a2` ile derleyip `20261008170000_google_yazma_kesici`
migration'ını uyguladı, sonra durdu. 07:32'de sunucu yeniden başlatıldı ve
pm2 açılışta kalkmadı; site 08:03'e kadar `502` verdi. Süreçler elle
açıldı, yani **canlıda `703b2a2`** (YouTube Aşama 0 + 1, kanal arama). Bu
sürümde `db:rls` koşmadı ama `02_rls.sql` değişmemişti. `.last-deployed-sha`
hâlâ `143c2b8`: bir sonraki deploy bunu düzeltecek ve yeni `deploy.sh`'ı
(kilit, düşük öncelik, `.next-derleme`) devreye alacak. Açılışta kalkma artık
`advetics` crontab'ındaki `@reboot` satırıyla (DEPLOYMENT.md §10e).
Deploy'un 40 dk sürmesinin sebebi bizim yükümüz değildi: `vmstat` steal
time (`st`) %83–90. `st` 20'nin altındayken deploy et.

**YOUTUBE KANALINI BUL (2026-10-08, kullanıcı isteği), DEPLOY EDİLMEDİ:**
adres yapıştırmadan kanal ekleme. Marka Merkezi › Bağlantılar › YouTube ›
"Kanalı bul": workspace sitesindeki kanal bağlantısı / gömülü video ve
Google Ads hesabında reklamı yapılmış videolardan kanıtlı öneri, isimle
YouTube araması (100 kota birimi; 24 saat önbellek, kişi başı saatte 20).
"Bu kanal" havuza ekleyip mevcut atama ucundan bu workspace'e bağlıyor;
başka workspace'teki kanal eklenemiyor. Havuz ekranında (Platform
Bağlantıları) yalnızca isimle arama → havuz. Migration YOK. Canlıda
ölçülmedi: Google Ads `asset.youtube_video_asset` sorgusu.

**AKILLI BOOST · YOUTUBE CANLIYA (2026-10-08, kullanıcı kararı):** yeni
format yok, var olan YouTube → Demand Gen yolu canlıya oturtuluyor. Plan ve
bulgular: [`akilli-boost/YOUTUBE-CANLI-PLAN.md`](akilli-boost/YOUTUBE-CANLI-PLAN.md).
**Aşama 0 (para güvenliği) yazıldı, DEPLOY EDİLMEDİ.** MIGRATION VAR:
`20261008170000_google_yazma_kesici`. Bulunan iki gerçek hata kapandı:
yayındaki YouTube kartı tekrar onaylanıp İKİNCİ kampanya açabiliyordu;
kart kampanya kimliğini kaynak adı olarak yazdığı için harcama kartta HİÇ
görünmüyordu. **Aşama 1 de yazıldı (2026-10-08), DEPLOY EDİLMEDİ, migration yok:**
kurulum tek atomik istek, kartta "Prova et" (para harcamaz) ve
"Duraklatılmış kur". **Sıradaki:** deploy → Ege Birlik Yapı kartında
prova (canlıda ölçülmemiş alanların cevabı) → Aşama 2 (kartta ön kontrol). İlk canlı deneme **Ege Birlik Yapı** kanalıyla
(K1); bütçe/süre (K2), duraklatılmış ilk yayın (K3) ve geliştirici token
seviyesi (K4) Aşama 3'ten önce kullanıcıya sorulacak.

**OKUMA API / MCP (2026-10-08, kullanıcı isteği), DEPLOY EDİLMEDİ:**
platform sahibi (`hello@profaj.com`) için salt okunur yapay zekâ kapısı.
Panel: Ayarlar › Okuma API (menü + sayfa yalnız `platformAdmin`), anahtar
oluştur / bir kez göster / iptal. API: `POST /api/mcp` (durumsuz MCP,
Streamable HTTP, SDK yok) + aynı araçlar REST `GET /api/okuma/araclar/:ad`;
dokuz araç `MetricsService`in okuma yollarını çağırıyor, yeni SQL yok.
Anahtar YALNIZ `@OkumaAnahtariyla()` uçlarında geçiyor, o uçlar YALNIZ
anahtarla (çerez reddediliyor). MIGRATION VAR: `20261008160000_okuma_api`
(yeni tablo `okuma_api_anahtarlari`) + `db:rls`. Bağlantı belgesi ve hazır
istemler: [`okuma-api/MCP-BAGLANTI.md`](okuma-api/MCP-BAGLANTI.md).
**Deploy sonrası:** `db:platform-admin -- --liste` ile yalnız hello'nun sahip
olduğunu doğrula (ekranı her platform sahibi görür), anahtar oluştur, curl
ile `tools/list` dene, Claude Code'dan `metrik_ozeti` çağır. Canlıda HİÇ
denenmedi; Claude Desktop (`mcp-remote`) yolu ölçülmedi.

**YAPAY ZEKÂ GEMINI (2026-10-08, kullanıcı kararı):** Anthropic tamamen
kaldırıldı (SDK dahil). Tek istemci `apps/api/src/yapay-zeka/gemini.ts`
(düz REST, anahtar `x-goog-api-key` başlığında), model
`GEMINI_MODEL="gemini-3.8-flash"` (fiyat/performans; giriş fiyatı
31 Aralık 2026'ya kadar, sonra iki katı). Anahtar sunucuda
`./scripts/gemini-anahtari.sh` ile giriliyor (gizli sorar, Gemini'ye sorup
doğrular, .env yedeği alır, yalnız Advetics süreçlerini yeniden başlatır).
Sohbet kaydı Gemini'nin kendi biçiminde: düşünce imzaları aynen geri gidiyor.

**ADVSTRATEGY (2026-10-08, yeni modül):** aylık medya planı (bütçe dağılımı,
Google arama kurgusu, kitle × kreatif matrisi, sezon, PDF + AdvCampaign'e
aktarım), yalnız Meta + Google. Plan beş ajana bölündü:
[`advstrategy/AJAN-PLANI.md`](advstrategy/AJAN-PLANI.md). Kararlar: PDF'te
Advetics logosu, onay PDF + panel içi (dış link yok), aktarım platforma
DEĞİL AdvCampaign'e taslak. **Ajan 1 BİTTİ (2026-10-08):** sözleşme
`packages/shared/src/strateji/`, veri modeli ve devir notu
[`advstrategy/MIMARI.md`](advstrategy/MIMARI.md), yeni izinler
`strategy.read|write|approve` (müşteri hesabı okur + onaylar), salt okunur
`GoogleProvider.kelimeFikirleri` + `google-check --kelime` ölçüm kipi.
**Ö-1 ÖLÇÜLDÜ (2026-10-08): Keyword Planner ERİŞİMİ VAR** (2.660 fikir,
yakın varyantlar aynı metrik, hacim yuvarlanmış; kurallar MIMARI §4.1).
**Ajan 2 + 3 BİRLEŞTİ (2026-10-08), DEPLOY EDİLMEDİ:** MIGRATION VAR
(`20261008120000_advstrategy`, beş yeni tablo) + `db:rls` + worker'da yeni
`strateji-kelime` kuyruğu (1 istek/sn). Ekran `/strateji`: plan listesi,
Bütçe · Arama · Matris, durum düğmeleri. Bu turda YOK: PDF, sezon,
AdvCampaign'e aktarım (ekranda da görünmüyor). Müşteri hesabının menüsü
dörde çıktı (AdvStrategy): kullanıcı onayı bekleniyor.
**Ajan 4 kapısı AÇIK (2026-10-08):** iki kırmızı (kelime işçisi gerçek
transaction açmıyordu; BIGINT taşan bütçe) ve üç düşük bulgu Ajan 2'de
kapandı. Deploy sonrası Ajan 4'ün salt okunur SQL kontrolleri (yetki
override'ı taşıyan üyelikler, RLS politika sayıları, takılmış arama).
**Birinci tur CANLIDA (2026-10-08).** Müşteri hesabı dört ekran görür
(kullanıcı kararı, CLAUDE.md §5).
**İkinci tur yazıldı, DEPLOY EDİLMEDİ:** AdvCampaign'e aktarım (hazır
doldurulmuş oturum: `adv_oturum.hazir_istem/hazir_medyalar`, yalnız Meta),
deterministik kelime gruplama (`grup_elle` korunur), PDF medya planı +
Sunum bölümü. MIGRATION VAR: `20261008140000_advstrategy_aktarim` (var
olan `adv_oturum`a kolon). Ajan 4 kapısı AÇIK (bulgu: hazır metin yanlış
oturuma düşebiliyordu, deploy'dan önce düzeltildi). **Sıradaki:** deploy → canlı
kontrol (aktarılan oturumda giriş kutusu dolu mu, gönderince görseller
modele ulaşıyor mu). Üçüncü tur: sezon/takvim (özel gün listesini kimin
dolduracağı belirsiz), PDF indirme denetim kaydı.

**ADVCAMPAIGN (2026-10-07, kullanıcı kararı):** eski Reklam Oluştur, AI
Asistan ve Toplu Oluştur KALDIRILDI (panel + API `ai-assistant` sohbeti ve
`bulk` modülü); menüde tek satır **AdvCampaign → `/reklam`**. Hedef:
teknik bilgisi olmayan kullanıcıyı sohbetle yönlendiren, Meta ve Google'da
en optimize kampanyayı kuran yapay zekâ odaklı akış. Araştırma ve tasarım
`docs/advcampaign/` altında (A1 Google, A2 tek panel, A3 Meta, sentez,
tasarım/plan). DB'deki eski AI sohbet tabloları silinmedi (veri).
Plan: [`TASARIM-PLAN.md`](advcampaign/TASARIM-PLAN.md) (31 iş paketi,
İP-01…31; ilk çalışan Meta sohbetine giden yol İP-09 → 10 → 12 → 13 → 14 →
15 → 16 → 17). Kullanıcı kararları K-01…K-08 varsayılanla kapatıldı (§0).
Arayüz taslağı: `advcampaign/advcampaign-arayuz.html`. P0 bitti: İP-01…04
(Meta) ve İP-06 + eski Google arama yolu kapatıldı.
**Sohbet MVP'si yazıldı (2026-10-08):** İP-09 (sözleşme), İP-10 (tablolar,
MIGRATION `20261008100000_advcampaign_sohbet`), İP-12…15 (araçlar, döngü,
SSE ucu, tek kullanımlık onay), İP-16…18 (ekran: oturumlar · sohbet ·
canlı taslak paneli, mobilde sekmeli). `/reklam` artık sohbet ekranı; eski
tek atışlık stüdyo silindi (`POST /reklam/ai-taslak` ucu duruyor, ekran
çağırmıyor; 2026-10-08'de kaldırıldı). Canlıda HİÇ denenmedi. Bilinen açıklar: (a) FORM niyeti form şablonu olmadığı için
tamamlanamıyor; (b) onay anında öneriler kullanıcı kararına çevrilirken yeni
sürüm doğuyor ve prova o sürüme ait sayılmıyor; gerçek yayın açılırken
prova eşleşmesi kaynaktan bağımsız özetle yapılmalı; (c) akış (SSE) vekil
sunucuda tamponlanırsa ekran 3 sn'lik yoklamaya düşer.
**Sıradaki:** canlı tur (sohbetle SITE taslağı → prova → test kipi), sonra
Kontrol Merkezi (İP-27…30), form şablonu, Google kapıları (İP-05, 07, 08).

**Reklam oluşturma (2026-10-07): AYRI MODÜL olarak kuruluyor.**
Kararlar [`bekleyen-kararlar.md`](meta-reklam-brief/tasarim/bekleyen-kararlar.md)
başında: 25 sorunun hepsinde önerilen seçenek + ikinci tur kapsam kararları
(tamamen ayrı modül; Akıllı Boost yeni motora taşınır ama kuralları korunur;
raporda sonuç adları ve atıf). Arayüz taslağı:
[`reklam-olustur-arayuz.html`](meta-reklam-brief/tasarim/reklam-olustur-arayuz.html).
Modülün yeri: `packages/shared/src/reklam/` (niyet kataloğu, adlandırma,
hazırlık tipi), `apps/api/src/modules/reklam/` (`GET /reklam/hazirlik`),
`apps/web/src/reklam/` + `/reklam/yeni` (Acemi akışı önizlemesi, menüde
YOK, Meta'ya yazmıyor). Eski modüllerden içe aktarma iki tarafta testle
yasak. **Derleyici çekirdeği yazıldı** (`packages/shared/src/reklam/`):
para zinciri (`tutarAyristir`, `microsToMinor` kırpmadan hata), bütçe
(`enCokHarcama` tasarımdaki 12.250 TL örneğiyle sınandı), tek hedefleme
üreticisi (`hedeflemeUret`, varsayılansız `advantageAudience`, konut kısıt
haritası, ülke kümesi), `derleMeta()` + manifesto (FORM ve SITE; WHATSAPP
ve diğerleri canlı ölçüm olmadan retle duruyor). Hepsi mutasyonla sınandı.
Ayrıca: geri okuma karşılaştırıcısı (`beklenenYankilar`,
`geriOkumaKarsilastir`), form derleyicisi (KVKK kutuları açıkça false,
yasak soru sözlüğü), taslak tabloları (**MIGRATION VAR**:
`20261007120000_reklam_taslak_cekirdegi` → `reklam_taslagi`,
`taslak_surumu` [değişmez, trigger], `ajans_ayari`) ve uçlar
(`/reklam/taslaklar`, `/reklam/ajans-ayari/atif`). Prova yazılmadığı için
taslak hiçbir zaman `hazir` olmuyor (OK-17 eksiği bilerek).
Panel `/reklam/yeni` artık taslağa bağlı: açık taslak listesi, her seçim
yeni sürüm, eksikler sunucudan, konum Marka Merkezi kitlesinden önden
dolu, özel kategori sorusu (hiçbir şık seçili gelmez, taban kilitli),
bütçe Türkçe tutar girişiyle, süre hesabın saat diliminde, Gözden
geçir'de atıf standardı seçimi (yalnız yönetici). Canlıda tıklanarak
denenmedi (worktree'de `.env` yok).
**Yayın motoru çekirdeği yazıldı** (`modules/reklam/yayin-motoru.ts`,
MIGRATION VAR: `20261007140000_reklam_yayin_motoru` → `yayin`,
`yayin_nesnesi`, `geri_okuma`): medya → form → ağaç PAUSED zincir, her
nesne için önce niyet kaydı; kesin ret / belirsiz sonuç / kayıt düşüşü
ayrı yollar; uzlaştırma (etiket + ad); geri okuma; tekillik kapısı; açma
yukarıdan aşağı; geri alma = arşiv. Meta bir port arkasında; sahte Meta
ile 19 test, mutasyonla sınandı. **Henüz bir uca bağlı DEĞİL.**
Gerçek Graph istemcisi yazıldı (`meta-graf.ts`: kesin/belirsiz hata
ayrımı, oluşturmada `fields` yok, form sayfa token'ıyla, etiket kimliği →
bylabels, token yalnız graph.facebook.com'a) ve erişim katmanı
(`meta-erisim.ts`: token, sayfa token'ı, görsel baytı, hash önbelleği;
eski servisler kullanılmıyor, token YENİLENMİYOR). Kullanıcı kararı:
eski panel/kod referans değil, tek kaynak tasarım belgeleri.
"Meta'ya yazmayı durdur" anahtarı da kuruldu (MIGRATION:
`20261007160000_reklam_yazma_kesici`; tek kapı `metaYazmaAcikMi`, ajans
şirketinin anahtarı müşteri şirketlerini de durduruyor, okunamazsa kapalı;
motorda her yazma kapılı sarmalayıcıdan; uç `PUT /reklam/ajans-ayari/meta-yazma`).
**Motor uca bağlandı — yalnız TEST KİPİYLE.** `POST /reklam/taslaklar/:id/yayinla`
(`bulk.publish`): sıfır çağrılı ön kontrol (sürüm/özet eşleşmesi, taze
eksikler, OK-15 anahtar, OK-16 atıf, OK-01 hesap, tanınmayan kategori
tabanı), derleme, yayın kaydı, kendi kuyruğu `reklam-yayin` (deneme 1),
worker'da işleyici (hesap başına Redis yazıcı kilidi, dolu ise ertele).
Meta provası (OK-17) olmadığı için GERÇEK yayın reddediliyor; test kipi
yalnız ajans yöneticisi ve ajansın kendi şirketindeki hesapta: kurar, geri
okur, AÇMADAN arşivler. Panelde Gözden geçir'in sonunda "Test kipinde
dene" + canlı durum + fark tablosu + "Kaldığı yerden devam / Yeniden
kontrol et / Geri al".
**Meta provası yazıldı** (MIGRATION: `20261007180000_reklam_prova`):
`validate_only` ile, nesne açmadan, her gövde ayrı soruluyor; reklam seti
satır içi kampanyayla, reklam satır içi reklam seti + kreatifle. Hesap
başına 5 dk'da 2. Geçen prova taslağı "hazır" yapıyor; gerçek yayında
OK-17'yi taze (30 dk) prova kaldırıyor. **Gerçek yayın hâlâ kapalı:
uyum denetçisi (bölüm 10) yok** — `yayinBaslat` "UYUM" retiyle duruyor.
Panelde Gözden geçir'in başında prova bloğu (eksik bitince bir kez
kendiliğinden).
**Canlı tur 1 (2026-10-07, v25.0, prova):** kreatif özellik anahtarları
reddedildi — Meta yalnız 7 BÜYÜK HARFLİ anahtar kabul ediyor; derleyici
düzeltildi. "Kitle ve bütçe" provası Meta 5xx ("unexpected error") döndü;
kreatif düzeldikten sonraki provada yeniden bakılacak (satır içi
`campaign_spec` şekli şüpheli).
**Reklam Stüdyosu (kullanıcı kararı 2026-10-07):** `/reklam` — görselleri
bırak, tek cümle yaz; asistan (Opus 5.5, yapılandırılmış çıktı, görseller
modele gidiyor) taslağı kurar, `/reklam/onizleme`de telefon çerçeveli
önizleme + satır içi eksikler + "Onayla" (öneri → kullanıcı kararı), sonra
prova ve test kipi. Model bütçe/süre/adres UYDURAMIYOR (sunucu cümleyle
karşılaştırıyor), kategori sorusunu cevaplayamıyor. `GEMINI_API_KEY`
sunucuda tanımlı olmalı. Menüde değil; eski Reklam Oluştur'un üstünde kart.
**Video (2026-10-07):** Stüdyo MP4/MOV kabul ediyor (en çok 200 MB).
Kapak karesi TARAYICIDA alınıyor (sunucuya video programı kurulmuyor) ve
ayrı görsel olarak yükleniyor; asistan kapağı görüyor. Derleyici video
fikrini `video_data` ile kuruyor (kapak `image_hash`); motor videoyu
yükleyip Meta "hazır" diyene kadar bekliyor (15 dk sınır), prova da öyle.
Migration YOK. Google için sürüm kararı: **v25**.
**Canlı tur 2:** "Kitle ve bütçe" provası satır içi kampanyayla `/adsets`e
sorulunca Meta her seferinde 5xx veriyor; aynı reklam seti reklam
provasının içinde geçiyor. Kapsama kuralı (`kapsamaUygula`): yalnız
belirsiz sonuç ve bütün reklamlar geçtiyse "geçti" + ekranda not.
**Sıradaki:** (1) CANLI TUR devam: ajansın kendi Meta hesabında
SITE niyetiyle test kipi — Meta'nın gerçekte neyi farklı döndürdüğü
normalleştirme tablosunu dolduracak (ilk denemelerin "fark" ile durması
BEKLENEN davranış); (2) uyum katmanı (bölüm 10: profil, katalog, denetçi, değişmez uyum raporu) → gerçek yayın; (3) kuyruk tarayıcısı (§ 11.12: worker ölürse `kuruluyor`da kalan
yayın); (4) form şablonu ekranı. Boost taşıması ve rapor sonuç adları
ondan sonra.
**Acil, bu işten bağımsız:** Meta v26 kuralı 2026-10-27'de bütün sürümlerde
kök `GET /?ids=` isteklerini hataya çeviriyor (rapor PDF görsel tazeleme,
boost özeti) — ayrı oturumda düzeltiliyordu; deploy o tarihten önce.
App Review başvurusu 2026-10-01'den beri incelemede, BV geçiyor
(`DURUM.md` §6'daki "yapılmadı" bayat); ekran kayıtları eksik görünüyor.

"O günden beri ne geldi" sorusunun başlangıç noktası bu belgeyi DEĞİŞTİREN
SON COMMIT — hash buraya elle yazılmıyor (yazılan hash kendi commit'ini
gösteremez ve kayar):
`git log --oneline $(git log -1 --format=%h -- docs/DEVAM.md)..origin/main`.

---

## Son oturumda biten

- **Marka Merkezi Bölüm 1 bitti** (`/marka-merkezi`): hazırlık listesi (6 madde),
  bağlantılar, iki adımlı kaldırma, havuz araması; şirket admini ajansın
  atadığını kaldırabiliyor ama taşıyamıyor, denetim kaydı + ajansa mail,
  "Ajans atadı" rozeti.
- Panel: ortak `components/ui/` bileşenleri; workspace seçilmemişse 13 sayfa
  artık soruyor; Genel Bakış kısaltmalarına Türkçe açıklama.
- Canlı düzeltmeler: "Tüm şirketler" modunda Uyarılar/Senkronizasyon 500'ü;
  Google için yanlış "yetki doluyor" alarmı (`authorization_expires_at`,
  migration); Senkronizasyon sayaçları 1.536 → 457 ms; sayaçlar son 7 gün.
- **LinkedIn'e yapılamayacak işler artık gönderilmiyor** (`queue/platform-isleri.ts`):
  kırılım işi hiç açılmıyor; günlük/gün içi metrik işi LinkedIn'de hesap
  seviyesini atlıyor. İkincisi LinkedIn günlük metriğinin HİÇ gelmemesinin
  sebebiydi. Deploy sonrası bakılacak: son 7 günün düşen iş sayısı inmeli,
  LinkedIn `insights_daily` işleri `succeeded` olmalı.
- **Google kotası ölçüldü: sebep hacim, günlük tavan.** "Günlük" metrik işi
  hesap başına günde ~11 kez koşuyordu; artık dün bir kez çekiliyor.
  Kota dolunca bütün Google işleri Google'ın söylediği süre kadar bekliyor
  (önce yalnızca çarpan hesap 15 dk duruyordu, 1.521 iş düşmüştü).
- **Bölüm 2 bitti:** Marka sekmesi yapılandırılmış alanlarla (sektör,
  kategoriler, sık sayfalar, ana amaç, üslup, vaatler); AI asistan, reklam
  metni ve Hızlı Reklam okuyor (amaç seçili açılıyor, adres listeden).
- **Bölüm 3 bitti:** Görsel Arşivi, Kreatifler, Formlar Marka Merkezi'nde
  "Varlıklar"da (menüden kalktı). Metin şablonları ve zorunlu yasal uyarı:
  uyarı Meta ana metninde yoksa yayın duruyor. Marka renkleri eklenmedi
  (kullanıcı kararı: okuyan özellik yok).
- **Bölüm 4a:** kitle şablonları (yalnızca Meta) Marka Merkezi'nde; Hızlı
  Reklam varsayılanı seçili açıyor. Öncesinde taslak ağacının hedefleme
  üreticisi birleştirildi: şehir seçilince ülke de gidiyordu (= ülke geneli).
- **Bölüm 4c:** ilgi alanları + "Kitleyi tarif et" önerisi (AI yapılandırıyor,
  Meta'da çözülüyor, kullanıcı onaylıyor). Canlıda doğrulanmadı.
- **Bölüm 4b:** Meta özel/benzer kitleler şablonda (dahil/hariç); kitle hesaba
  bağlı, uyuşmazlık yayını durduruyor. Canlıda doğrulanmadı.
- Açık ayrı iş: eski tek reklam yayın yolu özel kategori kısıtını uygulamıyor
  (panel çağırmıyor, uç açık) — işaretlendi.
- Testler: API ve panel yeşil (sayılar son commit mesajında).

Ayrıntı: `DURUM.md` 2026-09-28 ve 2026-09-29 girdileri.

## Sıradaki iş (sırayla)

**Base yeniden düzeni** (kullanıcıyla aşama aşama; taslak tuvali:
claude.ai/artifact/95HsewpAuEupEZ74zoYnyC). Aşama 1 bitti (kimlik + iskelet,
`DURUM.md` 2026-10-06); ardından hazırlık şeridi, Aylık Bütçe Base'e ve
Genel Bakış bütçe kartı; Bağlantılar iki karta (reklam hesapları / sayfalar)
indi, Aylık Bütçe tablosu mecraya göre gruplu, giriş ekranı yeni logoda.
Marka, Kitleler ve Varlıklar bölümleri tarayıcıda gezilip düzeltilecek
(oturum kapalıydı). Deploy sonrası gezilip kullanıcıdan revize alınacak;
sonra **Aşama 2: Marka bölümü** (gruplanmış kartlar, "Siteden doldur" alan
alan, kaydedilmemiş değişiklik çubuğu), Aşama 3: Varlıklar/Kitleler, Aşama 4:
Bağlantılar + ekip kartı, Aşama 5: Koruma kuralları.

**Rapor maili "Doğrulama hatası":** deploy sonrası yeniden denenince ekran
reddedilen alanı yazacak; ona göre kök düzeltme.

**Rapor yavaşlığı:** kök düzeltme yazıldı (rapor sorguları dizi süzgecine
geçti; dailySeries 6,4 sn → 0,6 sn ölçüldü). Deploy sonrası: Raporlar ekranı
açılmalı; `olcum-rapor` arka planda (`nohup ... > /tmp/olcum-rapor.txt &`)
yeniden koşturulup topAds'in süresine bakılmalı.

**BASE brief (`Advetics-Marka-Merkezi-BASE-gelistirme-brief.pdf`, 7 aşama):
Aşama 0 sürüyor.** Ajans yöneticisi turu yapıldı, 6 hata düzeltildi
(`DURUM.md` 2026-10-05). Kitle önerisi canlıda çalışıyor (sebep şemaydı). Kalan: (b) reklam
yöneticisi ve müşteri rolleri — kullanıcı giriş yapınca; (c) yazma
kontrolleri (Marka kaydet, siteden doldur, kitle şablonu, varlık yükleme,
hesap ekle/kaldır) — test workspace'i ve onay bekliyor. Aşama 1'in test
şartı (testing-library) depo kararıyla çelişiyor: **kullanıcı kararı bekliyor.**

0. **Genel Bakış "Reklam Hesapları" deploy sonrası gözle:** bir workspace
   aç → Reklam Hesapları (mecra ikonu + workspace adı) → hesap → kampanya →
   set → reklam; ekmek kırıntısıyla geri çık. LinkedIn hesabı satırının
   rakamlı geldiğine, izlenmeyen hesabın "İzlenmiyor" yazdığına bak.
1. **Google kota doğrulaması GEÇTİ** (2026-10-01): günlük iş hesap başına
   1/gün, kota hatası 0. Çağrıların %84'ü gün içi işiydi; kullanıcı kararıyla
   Google'da **saatlik** (deploy bekliyor). Deploy'dan bir gün sonra
   `olcum-google-kota -- --gun=1`: `insights_realtime` hesap başına ~24/gün,
   toplam ~7.000. `rateScope` gövde kontrolü kota hatası görülünce yapılacak.
2. ~~İlgi alanı büyüklüğü dünya geneli~~ **etiketlendi** (2026-09-29, deploy
   bekliyor). Ülkeye göre sayı (`delivery_estimate`) istenirse ayrı iş.
3. **Tasarım deploy sonrası:** gerçek sayfaları gez (pencereler, yoğun
   tablolar, Genel Bakış, Raporlar, Akıllı Boost) ve kullanıcının beğenisini
   al; sonraki tur buna göre.
   4d deploy sonrası: şablonlu ön ayarla ilk boost Ads Manager'da ilgi ve
   hariç kitleyle GÖZLE kontrol. Bölüm 4'ün kalanı (uzman mod, çok hesaplı
   kitle seçici) reklam oluşturmaya ait → dondu.
4. **Bölüm 5 — Koruma kuralları** (`BASE-PLANI.md`).
5. Açık ayrı iş (öneri kartı açıldı): eski tek reklam yayın yolu
   (`ad-publisher.service.ts`) özel kategori kısıtını uygulamıyor.

Bölüm 2, 3, 4 ekranları **tarayıcıda açılıp bakılmadı** — bir sonraki oturumun
başında kullanıcıya Marka sekmesi, Varlıklar, Kitleler ve "Kitleyi tarif et"
için bir göz attırmak iyi olur.

## Kullanıcı kararı bekleyen

- Açılış sayfası hâlâ "Yalnızca Meta ve Google Ads" diyor; gizlilik politikası
  LinkedIn'den söz etmiyor. **Hukuki metne onaysız dokunulmaz.**

## Araçlar

- Canlı ölçüm (salt okunur, sunucuda `advetics` kullanıcısıyla):
  `cd ~/htdocs/advetics.com && pnpm --filter @advetics/api olcum-senkron -- --eposta=<kullanıcı e-postası>`
