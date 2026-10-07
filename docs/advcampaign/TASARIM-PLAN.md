# AdvCampaign — Tasarım ve uygulama planı

> **Tarih:** 2026-10-07 · **Girdi:** [`SENTEZ.md`](SENTEZ.md) (S-01…S-53, D-*, Ö-*, K-*),
> [A1](arastirma/A1-google-ads-api.md) · [A2](arastirma/A2-tek-panel-meta-google.md) ·
> [A3](arastirma/A3-meta-ads-api.md), `CLAUDE.md`, mevcut modül (`apps/web/src/reklam/`,
> `apps/api/src/modules/reklam/`, `packages/shared/src/reklam/`).
> **Arayüz taslağı:** [`advcampaign-arayuz.html`](advcampaign-arayuz.html) (tek dosya, açık/koyu,
> masaüstü + mobil). **Bu belgede kod yok;** kod parçası yalnız bir sözleşmenin adını vermek için.
>
> **Kullanıcının hedefi (verbatim):** *"reklam açmak isteyen ama teknik bilgisi olmayan birisini hem
> yönlendiren hem de en optimize kampanyayı açan yapay zeka odaklı sohbet üzerinden yönetilen bir kurgu
> ve tasarım"* · *"görselleri (ve videoları) atıp 'bu görsellerle form kampanyası oluşturmanı
> istiyorum' dediğimde direkt kampanya taslağı oluşturup bana sadece önizlemesini gösterip onaya
> bırakması lazım"* · *"tek bir panel, bütün reklam hesaplarını oradan yöneteceğim, dashboard gibi
> düşünebilirsin, optimizasyon strateji"* · *"biraz futuristik olması lazım"*.

---

## 0. Varsayılan kararlar (K-01…K-08)

Kullanıcı 2026-10-07'de *"onay almana gerek yok, süreci sana bırakıyorum"* dedi. Aşağıdaki
satırların hepsi **varsayılan, kullanıcı değiştirebilir**. Değişirse bu tabloya tarihli yeni satır
eklenir, eski satır silinmez (SENTEZ son notu).

| # | Varsayılan | Neye dokunuyor | Değişirse ne değişir |
|---|---|---|---|
| K-01 | Google canlı ölçümü **Profaj'ın kendi Google Ads hesabında** | Ö-G0…Ö-G7 | Ölçüm müşteri hesabına taşınırsa yarım deneme iz bırakır; İP-23 öncesi yeniden sorulur |
| K-02 | Google satırı MVP'de **görünür, "kapalı kurulum" kapısının arkasında; yayın kapalı.** Onay kartında Google satırı "Google Ads'te duraklatılmış kurulur, açılmaz" der | İP-23…İP-26 | (b) seçilirse Google satırı tamamen gizlenir, `platformOner` Google'ı `KAPI_KAPALI` ile eler |
| K-03 | Para harcayan ölçüm: **Meta Ö-M12 günlük 100 TL × 24 saat; Google Ö-G7 günlük 50 TL × 48 saat.** Google günlük tutarın 2 katına kadar harcayabildiği için Google tavanı **en çok 200 TL**, Meta en çok 175 TL (%75 esneklik). Toplam ölçüm tavanı **400 TL** | Ö-M12, Ö-G7 | Tutar değişirse yalnız ölçüm betiğinin sabiti değişir |
| K-04 | `ac` kapısı açıldıktan sonra **kampanyayı panel açar**, Meta ile aynı onay kartından | İP-26 | (b) seçilirse Google satırı kalıcı olarak `kapali_kuruldu` ile biter |
| K-05 | Google WhatsApp allowlist'i **istenmez**; WHATSAPP niyeti yalnız Meta | `niyetler.ts` | Faz 3 adayı olur |
| K-06 | Ajans sabitleri SENTEZ önerileriyle: ERISIM frekansı **7 günde 2**, taban negatif liste §4.3, arama hacmi eşiği **ayda 1.000** | `OGRENME_ESIKLERI`, `ARAMA_HACMI_ESIGI`, `TABAN_NEGATIFLER` | Tek sabit değişir; ekran metinleri sabitten türediği için kendiliğinden güncellenir |
| K-07 | Kapatılamayan Meta uyarlamaları (kırpma, rötuş, metin varyasyonu) **yasal uyarısı olmayan workspace'te kabul**, onay kartının "Meta'nın otomatik yaptıkları" bloğunda yazılı. Yasal uyarılı workspace'te ve sağlık/finans/konutta `text_optimizations` OPT_IN ise yayın durur (S-42 madde 3) | İP-02 | (b) seçilirse sınıf 2 de durdurur ve Ö-M2 sonucu beklenir |
| K-08 | İki platformlu planda **tek onay**, karttaki platform satırları ve yazma kayıtları **ayrı**; biri düşerse diğeri geri alınmaz | İP-15, İP-24 | (b) seçilirse kart platform başına ayrı düğme taşır |

---

## 1. Deneyim kurgusu

### 1.1 Tek ekran, dört bölge

`/reklam` tek sayfa. Menü etiketi ve sayfa başlığı **AdvCampaign** kalır (`nav-sections.spec.ts`
etiketin kaynakta ve `metadata.title` içinde geçmesini istiyor). Görünüm adreste: `?gorunum=sohbet`
(varsayılan) ve `?gorunum=kontrol`. Adres `lib/baglanti.ts` üreticisinden kurulur; `musteri`,
`hesap`, `platform`, `oturum` parametreleri iki görünüm arasında taşınır (CLAUDE.md "bağlantıyı
elle birleştirme"). Kontrol Merkezi ayrı sayfa DEĞİL: aynı işin parçası olan ekranı ayrı sayfaya
koymak bu projede iki kez hata üretti (Raporlar, Marka Merkezi).

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ AdvCampaign  [Sohbet | Kontrol Merkezi]   Workspace ▾  Hesap ▾   ● Meta ● G  │  üst şerit
├──────────┬──────────────────────────────────────────┬────────────────────────┤
│ Oturumlar│  SOHBET AKIŞI                            │  CANLI TASLAK           │
│ ──────── │  asistan balonu / kullanıcı balonu       │  Niyet · Platform satırı│
│ ● Kahve  │  araç izi ("Hesap hazırlığına bakıyorum")│  Önizleme (akış/hikâye) │
│   formu  │  soru çipleri (tek soru)                 │  Eksikler (sıralı)      │
│ ○ Bahar  │  ONAY KARTI (sunucunun ürettiği)         │  Prova (platform başına)│
│   trafik │                                          │  Onay kartı özeti       │
│ + Yeni   │  ┌ MEDYA BIRAKMA + YAZMA ALANI ────────┐ │                        │
│          │  │ [görsel][video] "bu görsellerle…" ➤ │ │                        │
└──────────┴──┴─────────────────────────────────────┴─┴────────────────────────┘
```

| Bölge | Ne gösterir | Kimden beslenir |
|---|---|---|
| **Oturum şeridi** (sol, daraltılabilir) | Bu workspace'teki sohbet oturumları, her birinin taslak durumu rozeti (`taslak` / `prova geçti` / `onay bekliyor` / `yayında` / `kapalı kuruldu`), "Yeni oturum" | `adv_oturum` + `reklam_taslagi.durum` |
| **Sohbet akışı** (orta) | Mesajlar, araç izleri, soru çipleri, durum cümleleri, onay kartı | `adv_mesaj` + akış olayları |
| **Medya bırakma + yazma alanı** (orta alt, yapışkan) | Sürükle-bırak, dosya seç, Marka Merkezi varlıklarından seç; her dosyanın kendi satırı (yükleniyor / reddedildi sebebiyle / hazır); örnek cümle çipleri | `POST /reklam/gorseller` (mevcut) |
| **Canlı taslak paneli** (sağ) | Taslağın o anki hâli: niyet + gerekçe, platform satırları + gerekçe kodları, önizleme (mevcut `onizleme.tsx`), eksik alanlar sırasıyla, prova sonucu, "varsayılan" etiketli alanlar düzenlenebilir | `reklam_taslagi` + `taslak_surumu` + `prova` |
| **Kontrol Merkezi** (ikinci görünüm) | Bütün workspace/hesaplar, sinyaller, öneri kartları | §3 |

**Sohbet ile panel aynı taslağı yazar.** Kullanıcı sağ panelde bir alanı elle değiştirirse yeni
sürüm `kaynak: 'kullanici'` ile yazılır ve sohbete tek satırlık sistem notu düşer ("Bütçeyi 250 TL
yaptın"). Model bir sonraki turda taslağın SON sürümünü okur; elle değişikliği ezmesi `taslak_alan_yaz`
aracında sürüm kontrolüyle engellenir (iyimser kilit: araç `beklenenSurum` taşır, uyuşmazsa
`SURUM_ESKI` döner ve model taslağı yeniden okur).

**Panel yolu her zaman açık (C-19 §2).** Model reddettiğinde, kota dolduğunda ya da asistan bağlı
değilken sağ panel tek başına çalışır: alanlar elle doldurulur, prova ve onay kartı aynıdır. AI hiçbir
işin tek yolu değildir.

### 1.2 Sohbet akışının yapısı

Her asistan turu sunucuda bir **tool-use döngüsü**dür (§4.3). Kullanıcı yalnız şunları görür:

1. **Araç izi**: tek satır, ikonlu, Türkçe fiil: "Workspace hazırlığına bakıyorum", "Görselleri
   inceliyorum", "Platform seçiyorum", "Metin yazıyorum", "Provaya gönderiyorum". Araç adı ya da JSON
   görünmez. Biten iz soluklaşır, süresi yazılır ("1,2 sn").
2. **Asistan metni**: akarak gelir. Durum kelimeleri ("hazır", "yayında", "kuruldu") yalnız sunucunun
   durum cümlesinde geçer (S-49); model bunları yazarsa paketleyici o cümleyi değil sunucunun cümlesini
   gösterir (bkz. §4.4 "durum kelimesi süzgeci").
3. **Soru çipi**: mesaj başına TEK soru (S-48). Seçenekli sorularda çipler; serbest cevapta yazma alanı
   odaklanır. Çip metni sunucunun `eksikler` listesindeki alanın etiketinden türer.
4. **Kart**: onay kartı, prova kartı, eksik bağlantı kartı, öneri kartı. Kartın METNİNİ model yazmaz;
   kart sunucunun saf fonksiyonundan gelir (§4.5). Model kartın üstüne en çok iki cümlelik özet yazar.

### 1.3 Soru sırası ve kuralları (SENTEZ §5.3 ile birebir)

Sıra sabittir: **niyet → medya → bütçe (tutar + tip aynı soruda) → süre → konum (marka kitlesi yoksa) →
niyete özgü tek alan (site adresi / form seçimi).** Özel kategori sorusu modelden değil arayüzden gelir
(onay kartından önce, ayrı bir kart olarak).

| Kural | Uygulandığı yer |
|---|---|
| Model yalnız sunucunun `eksikler` listesindeki alanı sorar | `siradakiSoru(eksikler, sorulanlar)` saf fonksiyonu tek alan döndürür; model araç sonucundaki `sor` alanını Türkçeleştirir, başka alan soramaz (araç şeması) |
| Mesaj başına tek soru, önizlemeye kadar en çok 5 soru | `siradakiSoru` 5. sorudan sonra `null` döndürür; kalan varsayılanlı alanlar varsayılanla dolar ve panelde **"varsayılan"** rozetiyle durur |
| Varsayılanı olmayan alan (bütçe, süre, konum, kategori) tahminle dolmaz | `VARSAYILANSIZ_ALANLAR` sabiti; 5 soru dolsa bile bu alanlar panelde **eksik** olarak kalır ve onay kartı açılmaz |
| Ölçülebilen şey sorulmaz | `hazirlik_oku` önce okunur; sonuç `null` ise "kontrol edemedim" denir ve soru ancak o zaman sorulur |
| Belirsizlikte iki seçenek, ikisi de açık yazılır | `belirsizlik_sun` çıktısı iki çip; model birini seçip ilerleyemez (araç sonucu kullanıcı cevabı gelene kadar `bekliyor`) |
| Bütçe/süre yalnız kullanıcının cümlesinden | Mevcut `ai-taslak.ts` kuralı korunur: sunucu rakamın cümlede geçtiğini doğrular |

### 1.4 Üç örnek senaryo

Örnek işletmeler uydurmadır.

#### Senaryo A — "Bu görsellerle form kampanyası oluştur" (Kuzey Kahve Atölyesi)

Hazırlık: workspace'te 1 Meta hesabı, 1 sayfa, 1 IG hesabı, marka kitlesi "İzmir + 15 km", Meta
anlık formu yok, yasal uyarı yok. Google hesabı atanmış, yazma kapısı `kapali_kur`.

| # | Kim | Ekranda |
|---|---|---|
| 1 | Kullanıcı | 3 görsel bırakır (1080×1080, 1080×1350, 1080×1920). Her dosyanın satırı "yükleniyor" → "hazır · 1:1", "hazır · 4:5", "hazır · 9:16". Yazar: *"bu görsellerle form kampanyası oluşturmanı istiyorum"* |
| 2 | Araç izleri | "Workspace hazırlığına bakıyorum" (`hazirlik_oku`) · "Görselleri inceliyorum" · "Taslağı kuruyorum" (`taslak_olustur`, niyet FORM) · "Platform seçiyorum" (`platform_oner`) |
| 3 | Asistan | "Form reklamı kuruyorum: Instagram ve Facebook'ta, İzmir ve 15 km çevresine. Google'ı bu reklamda açmıyorum: form reklamı şimdilik yalnız Meta'da." (gerekçe kodu `KARSILIK_YOK`, S-40) |
| 4 | Canlı panel | Niyet "Form doldursunlar", Meta satırı, 3 kavramın önizlemesi (akış + hikâye), metinler "AI önerisi" rozetiyle; **Eksikler: Bütçe · Süre · Form** |
| 5 | Soru (1/5) | "Ne kadar harcamak istersin?" çipleri: `Günlük …` / `Toplam …` + yazma alanı. Kullanıcı: *"günlük 250"* |
| 6 | Soru (2/5) | "Kaç gün sürsün?" çipleri: `7 gün` `14 gün` `Bitiş yok`. Kullanıcı: *"14 gün"* |
| 7 | Soru (3/5) | "Bu sayfada form yok. Yeni form kuralım mı?" çipleri: `Ad, telefon, e-posta ile yeni form` / `Formu kendim kurarım`. Kullanıcı birinciyi seçer. KVKK aydınlatma adresi Marka Merkezi'nde varsa oradan, yoksa soru 4/5 o olur |
| 8 | Özel kategori kartı | Arayüzden gelir (model sormaz): "Bu reklam konut, iş ilanı, kredi ya da siyaset ile ilgili mi?" `Hayır` / `Evet, şu: …` |
| 9 | Araç izi | "Provaya gönderiyorum" → prova kartı: **Meta · prova geçti** (kampanya + reklam provası), süre, kota "5 dakikada 1/2 prova kullanıldı" |
| 10 | Onay kartı | §1.6. Düğme: **"Onayla ve Meta'da yayınla"** (bayrak açıksa) ya da **"Taslağı panelde aç"** (bayrak kapalıysa, sebebiyle) |

Toplam: 3 soru + 1 kategori kartı. Hiçbir rakam tahmin edilmedi.

#### Senaryo B — Video ile trafik (Mavi Ada Pansiyon)

Hazırlık: Meta hesabı + sayfa, Google hesabı atanmış, Google kapısı `kapali_kur`, marka kitlesi yok,
site adresi Marka Merkezi'nde `https://maviadapansiyon.example`.

| # | Kim | Ekranda |
|---|---|---|
| 1 | Kullanıcı | 1 dikey video (38 sn, 1080×1920) bırakır. Satır: "yükleniyor %62" → "kapak karesi alınıyor" (tarayıcıda) → "hazır · 9:16 · 38 sn". Yazar: *"bu videoyla siteme trafik getir, toplam 3.000 TL, 10 gün"* |
| 2 | Araç izleri | `hazirlik_oku` · `taslak_olustur` (SITE, bütçe toplam 3.000, 10 gün: üçü de cümlede geçiyor) · `arama_hacmi` ("pansiyon bozcaada" vb., 5 terim) · `platform_oner` |
| 3 | Durum A: hacim ölçüldü, 2.400/ay | Asistan: "Bu reklamı Instagram ve Facebook'ta açıyorum; videon oraya uygun. Google'da insanlar bunu ayda yaklaşık 2.400 kez arıyor, ama Google'da video ile site reklamı henüz açık değil. İstersen videoya ek olarak bir Google Arama metin reklamı da hazırlayayım; Google'da duraklatılmış kurulur, açılmaz." Çipler: `Yalnız Meta` / `Google Arama da hazırla` (S-38 adım 5 değil, adım 4: video Meta'yı, hacim Google'ı gösteriyor → iki seçenek, ikisi açık yazılır) |
| 3' | Durum B: hacim ölçülemedi | Asistan: "Google'da ne kadar arandığını ölçemedim (Google anahtar kelime aracına erişim yok). Bu yüzden yalnız Meta'da kuruyorum." Panelde Google satırı gri, sebep kodu `HACIM_BILINMIYOR`, platformun mesajı alt satırda |
| 4 | Soru (1/5) | "Hangi bölgede görünsün? Marka kitlen yok." `Bütün Türkiye` / `Bir il ya da ilçe yaz`. Kullanıcı: *"Çanakkale ve İstanbul"* → `konum_ara` → iki aday + platform kimliği; "eşleşme yok" ile "çağrı düştü" ayrı yazılır |
| 5 | Panel | Video önizlemesi: Reels/hikâye tam ekran, akışta 4:5 kırpma çerçevesi çizili ("Akışta bu kısım görünür"), uyarı "Video 1200 px genişlik önerisinin altında değil" (D-M11 uyarı, ret değil) |
| 6 | Prova | Meta: video `ready` olmadan prova başlamaz; "Meta videoyu işliyor (1/3)" ayrı hâl. `expired` gelirse "Video süresi doldu, yeniden yükle" kesin hata (D-M4) |
| 7 | Onay kartı | Meta satırı + (seçildiyse) Google satırı "duraklatılmış kurulur" |

#### Senaryo C — Belirsiz istek "satışlarım artsın" (Çınar Bahçe Mobilya)

Hazırlık: Meta hesabı + sayfa + piksel; piksel paylaşım durumu `null` (okunamadı). Medya yok.

| # | Kim | Ekranda |
|---|---|---|
| 1 | Kullanıcı | *"satışlarım artsın"* |
| 2 | Araç izleri | `hazirlik_oku` · `niyet_katalogu` |
| 3 | Asistan | "Satışı iki yoldan getirebilirim, ikisi farklı iş:" iki çip, ikisi açık yazılı: `Siteme gelsinler` ("Sitene ziyaretçi getiririm; satışı sitende sen yaparsın") / `Form doldursunlar` ("İletişim bilgisi toplarım, sen ararsın"). Üçüncü satır soluk: "Sitemden satış gelsin: bu amaç henüz açık değil. Sitende satış ölçümünü kontrol edemedim." (S-30: derlenemeyen niyet şemada yok, model en yakın açık niyeti ÖNERİR, sessizce çevirmez) |
| 4 | Kullanıcı | `Siteme gelsinler` |
| 5 | Soru (medya) | "Reklamda hangi görseli kullanayım? Görsel bırak ya da Marka Merkezi'nden seç." Varlık ızgarası (son 12, toplam sayı yazılı: "12 / 47 görsel"). Medya yoksa Google Arama metin reklamı da seçenek olarak yazılır (S-38: yalnız metin → Google), ama Google kapısı `kapali` ise çip soluk ve sebebiyle |
| 6 | Sonra | Senaryo A'nın 5-10. adımları |

Bu senaryo eval setinde "bütçesiz cümle" ve "derlenemeyen niyet" testidir.

### 1.5 Hâller: hiçbiri aynı boş alana düşmez

Her hâl ayrı bileşen, ayrı cümle ve ayrı eylemdir. Hâl saf bir fonksiyondan çıkar:
`sohbetHali(oturum, sonMesaj, akis, hazirlik, kapilar, yetki) → SohbetHali` (§4.6). Arayüz yalnız
bu değeri çizer.

| Hâl kodu | Ne zaman | Ekranda | Eylem |
|---|---|---|---|
| `hazirlik_okunuyor` | Sayfa açılışı | Panel iskelet satırları (gri bloklar, "Workspace okunuyor") | — |
| `hazirlik_okunamadi` | `/reklam/hazirlik` düştü | Tehlike kutusu + sunucunun mesajı | "Yeniden dene" |
| `bos_oturum` | Hiç mesaj yok | Karşılama: "Görselini bırak, ne istediğini tek cümleyle yaz." + 3 örnek çip | — |
| `medya_yukleniyor` | Dosya başına | Satır içi ilerleme yüzdesi, video için "kapak karesi alınıyor" | İptal |
| `medya_reddedildi` | Giriş anında (oran, boyut, biçim, 200 MB) | Satır kırmızı, sebep cümlesi ("9:16 dışında: 16:10. Meta bu oranı akışta kırpar.") | Kaldır / yine de kullan (uyarıysa) |
| `model_dusunuyor` | Araç döngüsü sürüyor | Araç izi satırları + "düşünüyor" göstergesi (§2.3) | "Durdur" |
| `model_yaziyor` | Metin akıyor | Metin harf harf, imleç | "Durdur" |
| `soru_bekliyor` | Son tur soru çıktı | Çipler + odaklı yazma alanı, "Soru 2/5" | — |
| `model_reddetti` | `stop_reason = refusal` | Bilgi kutusu: "Asistan bu isteği yapamadı. Taslağı panelden kurabilirsin." | "Paneli aç" (sağ panel odaklanır) |
| `model_kesildi` | `max_tokens` | Uyarı: "Cevap yarıda kesildi." | "Devam et" (aynı tur yeniden) |
| `model_ulasilamadi` | Anahtar yok / 5xx / zaman aşımı | Uyarı + sağlayıcının mesajı + "Panel çalışıyor" | "Yeniden dene", "Paneli aç" |
| `akis_koptu` | SSE bağlantısı düştü | "Bağlantı koptu. Sunucu cevabı yazmaya devam ediyor olabilir." | Otomatik: `GET /mesajlar/:id` ile durum sorgula; `akista` ise yeniden bağlan |
| `kota_doldu` | Günlük token ya da saatlik mesaj sınırı | "Bugünkü asistan sınırı doldu (yarın 00:00'da yenilenir). Panel çalışıyor." Sayılar sabitten | "Paneli aç" |
| `eksik_baglanti` | Meta hesabı / sayfa yok | Kart: hangi bağlantı eksik, kim kurabilir | "Bağlantılara git" (`/marka-merkezi?bolum=baglantilar`) |
| `yetki_yok_yazma` | `bulk.write` yok | Sayfa açılmaz, mevcut kutu | — |
| `yetki_yok_yayin` | `bulk.publish` yok | Onay kartı açılır, düğme yerine "Yayın yetkisi olan birine gönder" + yetkili listesi | Bağlantıyı kopyala |
| `yazma_kapisi_kapali` | `metaYazmaAcikMi = false` | Kart ajansın sebebiyle: "Meta'ya yazma ajans tarafından durduruldu: …" | — |
| `bayrak_kapali` | Sohbetten yayın bayrağı kapalı (C-19) | Onay kartında düğme "Taslağı panelde aç", sebep: "Sohbetten yayın bu workspace'te henüz açık değil." | Panel |
| `prova_suruyor` | Prova kuyrukta | Platform başına satır: "Meta · prova sürüyor" | — |
| `prova_gecti` | Geçti | Yeşil satır, süre, kota kullanımı | Onay kartı |
| `prova_reddedildi` | Platform reddetti | Platformun kendi metni + Türkçe açıklama + düzeltme önerisi (model açıklar) | "Düzelt" (ilgili alan odaklanır) |
| `prova_belirsiz` | 5xx / zaman aşımı | "Meta cevap vermedi; reddetmedi de." | "Yeniden dene" (kota söylenir) |
| `prova_kota` | Hesap başına 5 dk'da 2 | "5 dakikada 2 prova sınırı: 3 dk 10 sn sonra" sayaç | — |
| `kart_bayat` | Onaydan önce taze okuma farklı (C-18) | Kart soluk, "Bu kart eski: taslak değişti / hesapta değişiklik var" | "Kartı yenile" |
| `yayin_*` | Yayın motoru durumu | Mevcut `YAYIN_DURUMLARI`'nın sunucu cümlesi; `kapali_kuruldu` asla "yayınlandı" demez | Durum makinesine göre |

**Yasak:** `.catch(() => setX([]))`. Araç sonuçları dört hâlli taşınır: `bakilmadi · bakiliyor ·
sonuc_yok{neden} · dustu{platformMesaji}` (S-49). Arayüzdeki her liste (oturumlar, varlıklar,
konumlar, öneriler) "N / toplam" yazar.

### 1.6 Onay kartı

Kart sunucunun `onayKartiUret()` saf fonksiyonundan gelir (§4.5). Bölümler:

1. **Başlık:** "Onaya hazır: Kuzey Kahve · Form · 14 gün"
2. **Platform satırları** (K-08: tek onay, ayrı satır). Her satır: platform rozeti, ne kurulacak
   (kampanya türü, bütçe yeri, günlük tutar, konum kuralı), prova sonucu, satırın son durumu:
   - Meta: "Instagram ve Facebook · günlük 250 TL · İzmir + 15 km · prova geçti · onayla yayınlanır"
   - Google (K-02): "Google Arama · günlük 100 TL · Türkiye, yalnız orada bulunanlar · Türkçe · prova
     geçti · **Google Ads'te duraklatılmış kurulur, açılmaz**"
3. **Bütçe esnekliği** (S-22): "Meta bazı günler 250 TL'nin %75 fazlasına kadar harcayabilir; haftalık
   toplam 1.750 TL'yi geçmez." Google satırında "Google bir günde 2 katına kadar harcayabilir; ay
   toplamı günlük × 30,4'ü geçmez." Rakamlar sabitten türer.
4. **Kapattıklarımız** (yalnız gerçekten gönderilenler, D-M2) ve **Meta'nın otomatik yaptıkları**
   (geri okumadan; okunamadıysa "doğrulayamadık", K-07).
5. **Ölçüm:** "Meta'nın saydığı sonuç · 7 gün tıklama + 1 gün görüntüleme" (S-07 etiketi sabitten).
6. **Uyarılar:** hesap düzeyi Google otomatik öneri uygulama açıksa uyarı (S-45 son paragraf).
7. **Düğmeler:** birincil "Onayla ve yayınla" (bayrak + yetki + kapı açıksa), ikincil "Değiştir"
   (sohbete döner), üçüncül "Taslağı panelde aç". Uyum ENGEL'inde birincil düğme hiç yok (C-19 §5).

Onay **tek kullanımlıktır** ve taslak sürümüne + kart özetinin SHA-256'sına bağlıdır (C-21 madde 5):
`adv_onay` satırı birincil anahtar kilidiyle bir kez `onaylandi` olur; taslak sürümü değiştiyse onay
reddedilir ve kart `bayat` olur. Model onay aracına sahip değildir; onay yalnız kullanıcının
tıklamasıyla gelen HTTP isteğidir (`POST /reklam/onaylar/:id/onayla`, `bulk.publish`).

---

## 2. Görsel dil: "futuristik" ama Profaj

### 2.1 İlkeler

- **Kalıbı bozmadan.** Kart `rounded-xl border border-line bg-surface`, sayfa başlığı `sayfa-baslik`,
  birincil düğme `.panel` katmanından. Futuristik his yeni gölgeden değil, **çizgi, ışık ve tipografi
  detayından** gelir; hepsi yardımcı sınıf ya da `@layer components` altında yeni, adlı kalıp
  (`.adv-*`) olarak yazılır ve katman onu ezmez.
- **Renk:** Kimlik kırmızısı `#ff2400` yalnız dört yerde: birincil düğme, canlı/aktif nokta, asistan
  "düşünüyor" ışığı, onay kartının üst kenar çizgisi. Gri `#302e2d` metin ve koyu temanın zemini için
  temel ton. Marka profili CSS'i ezdiği için (beyaz etiket) kırmızı her zaman `var(--brand-primary)`
  üzerinden yazılır, sabit hex değil.
- **Tipografi:** Montserrat başlık ve **küçük büyük harf etiketler** (`letter-spacing: .12em`, 11 px,
  ör. "CANLI TASLAK", "SİNYAL"); Open Sans gövde; sayılar `font-variant-numeric: tabular-nums`.
- **Futuristik detaylar (hepsi ince):**
  - Sohbet zemininde çok hafif **nokta ızgarası** (radyal gradyan, %4 opaklık), panelin mevcut marka
    ışığının üstünde.
  - Canlı taslak panelinin köşelerinde **köşe çentikleri** (4 adet 10 px L çizgi, `--border` tonunda);
    taslak değiştiğinde çentikler 600 ms marka renginde yanıp söner.
  - Asistan avatarı: dairesel değil, **yörünge**: dış halkada dönen tek kırmızı nokta (düşünürken).
  - Araç izleri: solda 1 px dikey **iz çizgisi**, her adımda küçük düğüm noktası (zaman çizelgesi gibi).
  - Önizleme cihaz çerçevesi: ince, cam etkisi yok; çerçevenin altında platform adı küçük büyük harf.
  - Kontrol Merkezi'nde sinyal hücreleri: sol kenarda 3 px durum çizgisi (yeşil/amber/kırmızı/gri),
    sayılar tabular, mini çizgi grafikler (sparkline) tek renk.
- **Koyu tema** birinci sınıf: mevcut `@media (prefers-color-scheme: dark)` token'ları kullanılır; nokta
  ızgarası koyu temada `rgb(255 255 255 / .05)`, kırmızı ışık `color-mix` ile %35.

### 2.2 Hareket

Hepsi `@media (prefers-reduced-motion: no-preference)` altında. Azaltılmış harekette karşılıkları
statiktir ve BİLGİ KAYBOLMAZ (dönen nokta yerine "düşünüyor…" yazısı; yanıp sönme yerine "güncellendi"
rozeti 3 sn).

| Hareket | Süre | Azaltılmış hâl |
|---|---|---|
| Yörünge noktası (düşünüyor) | 1,6 sn döngü | Sabit nokta + "Düşünüyor" metni |
| Taslak alanı değişti (çentik + alan arka planı) | 600 ms | "Güncellendi" rozeti |
| Araç izi düğümü belirme | 180 ms `--ease-out` | Anında |
| Mesaj akışı imleci | 1 sn | Yok |
| Prova satırı tarama çizgisi | 1,2 sn | "Sürüyor" metni |

### 2.3 Mobil düzen (< 768 px)

- Üstte sayfa başlığı + görünüm sekmesi; altta **üç sekmeli alt çubuk**: `Sohbet` · `Taslak` ·
  `Kontrol`. `Taslak` sekmesinde değişiklik olunca rozet noktası.
- Oturum şeridi açılır çekmece (sol üst ikon).
- Yazma alanı alt çubuğun üstünde yapışkan; medya bırakma yerine "Görsel/video ekle" düğmesi (dokunmatik
  cihazda sürükle-bırak yok), kamera rulosu.
- Onay kartı sohbet içinde tam genişlik; düğmeler alt alta, birincil en altta (başparmak erişimi).
- Önizleme `Taslak` sekmesinde tek cihaz, yerleşim seçici yatay kaydırmalı çipler.
- Kontrol Merkezi'nde tablo yerine kart listesi; süzgeçler üstte yatay çip şeridi; hesap süzgeci her
  zaman görünür (CLAUDE.md §5).
- 16 px yan boşluk, yatay sayfa kaydırması yok.

---

## 3. Kontrol Merkezi

### 3.1 Amaç ve kapsam

*"tek bir panel, bütün reklam hesaplarını oradan yöneteceğim"*. Kontrol Merkezi bir rapor değil, bir
**iş listesi**dir: "şu an neye bakmalıyım". Kapsam süzgeci üstte: `Bu workspace` / `Tüm workspace'ler`
(ajans modu; yalnız yetkisi olanda) · hesap · platform. Süzgeçler adreste taşınır.

### 3.2 Düzen

```
┌ ÜST ŞERİT: Harcama (bugün / 7 gün) · Advetics'in saydığı sonuç · Açık sinyal: 3 kırmızı, 5 amber ┐
├ SÜZGEÇ: [Tüm workspace'ler ▾] [Hesap ▾] [Meta ☑ Google ☑] [Yalnız sorunlu ☐]                    ┤
├ SOL (2/3): HESAP TABLOSU                         │ SAĞ (1/3): ÖNERİ KARTLARI                     ┤
│ Workspace · Hesap · Platform · Durum · Harcama 7g │ [Kırmızı] Reklam reddedildi · kanıt · Düzelt   │
│ · Sonuç · Sonuç başı · Öğrenme · Son okuma        │ [Amber] Bütçe sınırlı ve iyi · kanıt · Öner    │
│ satır tıklanınca: kampanya ağacı + sinyaller      │ [Gri] Bilgi: AI Max'e taşınma tarihi doldu     │
└───────────────────────────────────────────────────┴───────────────────────────────────────────────┘
```

- **Üst şerit** (S-53): toplam harcama + Advetics'in saydığı sonuç. **Platformlar arası dönüşüm toplamı
  hiçbir yerde yok** (S-10). Platform satırları altında: harcama, gösterim, siteye tıklama, platformun
  saydığı sonuç + pencere etiketi.
- **Hesap tablosu:** her satır bir reklam hesabı. Durum sütunu ortak durum sözlüğünden (Meta
  `effective_status`, Google `primary_status`), metin platformdan. "Son okuma" sütunu her zaman dolu ya
  da "hiç okunmadı" (sessiz bayatlık yok). Tablo "12 / 48 hesap" yazar.
- **Satır detayı:** kampanya → set/grup → reklam ağacı, her düğümde rozetler: `öğreniyor`, `öğrenme
  sınırlı`, `sorunlu`, `dışarıdan değişti` (C-18), `Advantage+ kapandı`, `AI Max'e taşındı`.
- **Öneri kartları:** sağ sütun, önem sırasıyla. Boşsa sebebiyle: "Sinyal okuması hiç koşmadı" /
  "Son 7 günde karar için yeterli veri yok" / "Açık öneri yok" (üçü ayrı, `emptyReason`).

### 3.3 Öneri kartı anatomisi

| Parça | İçerik | Kaynak |
|---|---|---|
| Etiket | "Meta'nın teşhisi" ya da "Advetics önerisi" (platform sustuğunda) | S-51 (a) |
| Başlık | Kural tablosundaki durum adı ("Bütçe sınırlı ve iyi gidiyor") | S-51 |
| **Kanıt** | Sinyal değerleri, tarihleriyle: "Son 7 gün: öğrenme tamamlandı (12 Eki) · Meta önerisi BUDGET_LIMITED · sonuç başı 41 TL, önceki 7 gün 46 TL" ve platformun ham metni | `adv_sinyal` satırları |
| Ne yapılır | Tek cümle + tutar ALANI (öneri değeri değil; kullanıcı seçer) | S-51 |
| Uyarı | "Büyük bütçe artışı öğrenmeyi sıfırlayabilir" gibi sabit cümleler | S-51 |
| Düğmeler | Yalnız izinli eylemde birincil düğme; diğerlerinde "Sohbette konuş" ve "Gizle (sebep seç)" | §3.4 |

### 3.4 Tek tıkla uygulama: yalnız izinli eylemler, onaylı

| Eylem | MVP | Nasıl |
|---|---|---|
| Bilgi kartı (AI Max taşındı, otomatik öneri açık, Advantage+ kapandı) | Var | Uygulama yok; "Anladım" kartı kapatır, kayıt kalır |
| Reddedilen reklam için düzeltme **taslağı** | Var | Sohbet oturumu açar, taslak kurar, yayın normal onay kartından |
| Yorgun kreatif için yeni **kavram taslağı** | Var | Aynı |
| Negatif kelime önerisi (Google) | Faz 2 | Onay penceresi: eklenecek kelimeler listesi, tek tık, OKU-KARŞILAŞTIR-YAZ |
| Bütçe artışı / durdurma | Faz 2 | Onay penceresi: taze okunan değer → yeni değer; fark varsa durur (C-18); kural motoru üzerinden yazar ve geri okur |
| Platformlar arası kaydırma | Faz 2 | Yalnız ortak ölçüt varsa, haftada bir, ±%20, iki satır ayrı (S-52) |
| Platform önerisini uygula (`POST /recommendations`, `ApplyRecommendation`), otomatik uygulama, silme | **Hiç** | S-12 |

"Tek tık" her zaman bir **onay penceresi** açar: ne değişecek (eski → yeni, taze okunmuş), hangi hesap,
geri alınamayan kısım ("harcanmış para geri gelmez"). Yetki: bütçe `budget.write`, durdurma
`bulk.publish`; yetki yoksa düğme yerine sebep.

### 3.5 Sohbetle bağ

Her kartta "Sohbette konuş" kartın kimliğiyle yeni oturum açar; ajan `sinyalleri_oku` ve
`performans_oku` araçlarıyla bağlamı okur, `oneri_karti_ac` ile kart TASLAĞI açabilir ama uygulayamaz.

---

## 4. Mimari

### 4.1 Genel akış

```
Panel (Next.js)                       API (NestJS)                                   Kuyruk / Platform
──────────────                        ────────────                                   ─────────────────
POST /reklam/sohbet/oturumlar ──────▶ AdvOturumService.ac  (adv_oturum)
POST …/oturumlar/:id/mesajlar ─────▶ AdvSohbetService.tur
  (SSE yanıt: olaylar)                  1. kota bekçisi (sıfır çağrı)
                                        2. mesajı yaz (adv_mesaj, durum=akista)
                                        3. döngü ≤ 8 adım:
                                             Claude (claude-opus-5-5, stream, araçlar)
                                             └ araç çağrısı → AdvAracKatmani.calistir
                                                 O: DB okuma (+ arama_hacmi, konum_ara)
                                                 T: ReklamTaslakService / ai-taslak.ts
                                                 P: prova kuyruğu ───────────────────▶ prova-isleyici
                                                 K: onayKartiUret (saf)
                                        4. mesajı kapat (tamam/kesildi/ret/hata) + token
POST /reklam/onaylar/:id/onayla ───▶ AdvOnayService (tek kullanımlık, taze okuma)
                                        └ yayin-baslat (mevcut) ────────────────────▶ yayin-isleyici
GET  /reklam/kontrol ──────────────▶ AdvKontrolService (adv_sinyal, adv_oneri_karti)
                                                       ◀── yapı taraması + sinyal okuma işi
```

### 4.2 Yeni tablolar

Hepsi `client_id NOT NULL` + `org_id` (kompozit FK `clients(id, org_id)`), `id` UUID (denetim BIGSERIAL
değil, onlar `audit_logs`'ta kalır). Her yeni tablo için **üç durak aynı commit'te**: `02_rls.sql`
(tablo listesi + politikalar, `rls-coverage.spec.ts`), `test/pglite-harness.ts` TRUNCATE listesi,
`workspace-tasima.ts#WORKSPACE_TABLOLARI` KARARI (`workspace-tasima.spec.ts` şemayı tarıyor).

| Tablo | Amaç | Ana kolonlar | RLS | Workspace taşınınca (karar) |
|---|---|---|---|---|
| `adv_oturum` | Sohbet oturumu | `user_id`, `baslik`, `taslak_id?`, `durum` (`acik/kapali`), `model`, `girdi_token`, `cikti_token`, `onbellek_token` | SELECT: `can_access_client`; INSERT/UPDATE: kendi `user_id`'si; DELETE yok | **Taşınır** (oturum taslağa bağlı, taslak taşınıyorsa sohbeti de gitmeli; yoksa yeni şirkette "bu taslağı kim neden kurdu" kaybolur) |
| `adv_mesaj` | Tur kaydı | `oturum_id`, `sira`, `rol` (`kullanici/asistan/arac/sistem`), `icerik` JSONB (Anthropic biçimi), `arac_adi?`, `arac_sonucu?` JSONB, `durum` (`akista/tamam/kesildi/ret/hata`), `hata_metni?`, token sayıları | SELECT oturumun politikası; UPDATE yalnız `durum=akista` satırda | Taşınır (oturumla) |
| `adv_onay` | Onay kartı ve onay | `oturum_id?`, `taslak_id`, `taslak_surumu`, `kart` JSONB, `kart_ozeti` (SHA-256), `durum` (`gosterildi/onaylandi/bayat/reddedildi/suresi_doldu`), `onaylayan?`, `onay_at?`, `yayin_id?` | INSERT yalnız sunucu; `onaylandi` geçişi tek kez (kısmi tekil indeks `WHERE durum='onaylandi'` + `(taslak_id, taslak_surumu)`); **çıkışı yazan**: yayın motoru `yayin_id` ile bağlar, 24 saat geçen `gosterildi` → `suresi_doldu` (CLAUDE.md "kısmi indeks + son durumu olmayan durum makinesi") | Taşınır |
| `adv_sinyal` | Sinyal aynası (§6.1 SENTEZ) | `ad_account_id`, `platform`, `seviye`, `nesne_external_id`, `tur`, `deger` JSONB, `platform_metni?`, `okundu_at` | `can_access_client` | **Taşınır** (platformun aynası, `hesap-verisi-tasima.ts` kuralı) |
| `adv_oneri_karti` | Öneri kartı | `ad_account_id`, `tur`, `nesne_external_id`, `etiket` (`platform/advetics`), `kanit` JSONB, `durum` (`acik/uygulandi/gizlendi/bayat/suresi_doldu`), `gizleme_sebebi?`, `uygulama_kaydi?` | `can_access_client` | **Kalır, açık olanlar `bayat` olur** (kart bir karar önerisi; yeni sahibin hesabında eski kanıtla durmamalı). Sayısı taşıma raporunda yazılır |
| `ajans_ayari.google_yazma_kapisi` | Kolon (yeni tablo değil) | `VARCHAR(12) DEFAULT 'kapali'` + CHECK (`kapali/kapali_kur/ac`) | Mevcut | — |
| `ajans_ayari.sohbet_yayin_bayragi` | Workspace listesi ya da şirket bayrağı | C-19 bayrağı | Mevcut | — |

**Eski `ai_conversations` / `ai_messages`:** yeniden KULLANILMAZ. `platform` kolonu "Meta ve Google ayrı
asistan" modelini taşıyor ve `@default(meta)`; yeni sohbet platformdan bağımsız, eski tabloya yazmak
her oturumu sessizce "Meta sohbeti" yapar. Tablolar yazmaya kapalı kalır; silinmeleri ayrı veri kararı
(2555cb9 gövdesi).

### 4.3 Tool-use döngüsü (sunucuda)

- **Model:** `claude-opus-5-5` (`REKLAM_AI_MODELI`, mevcut sabit tek kaynak). `effort: medium`,
  sunucu tarafı yedek zinciri (`fallbacks: 'default'`, mevcut desen), sistem istemi + araç tanımları
  `cache_control: ephemeral`. Akış `messages.stream`; araç şemaları `strict`.
- **Döngü sınırları:** kullanıcı mesajı başına en çok **8 araç adımı**; aynı araç aynı girdiyle iki kez
  çağrılırsa ikinci çağrı çalıştırılmaz, `TEKRAR` sonucu döner (döngü bekçisi). 8 dolarsa tur
  `kesildi` ile kapanır ve söylenir.
- **Bağlam:** her tur geçmiş `adv_mesaj`tan kurulur. Görseller yalnız **ilk** göründükleri turda modele
  gider; sonraki turlarda yerine `varliklari_listele` çıktısının kısa metni (ad, oran, süre). Böylece
  uzun oturum görselleri yeniden faturalamaz. 5 MB üstü görsel modele gitmez ve söylenir (mevcut kural).
- **Araç sonucu biçimi:** her araç `{ hal: 'tamam' | 'sonuc_yok' | 'dustu' | 'bekliyor' | 'reddedildi',
  veri?, neden?, platformMesaji?, sor? }`. `sonuc_yok` ve `dustu` hiçbir zaman boş diziye çevrilmez.
- **Güvenilmeyen içerik:** platformdan gelen metinler (reddetme sebebi, sayfa adı, yorum) araç sonucunda
  `guvenilmeyen` alanında taşınır; sistem istemi bunları talimat saymamasını söyler.

### 4.4 Araç katmanları

SENTEZ §5.2 (S-47) aynen. Katman ve kapılar:

| Katman | Araçlar | Kapı (sunucuda, şemada) |
|---|---|---|
| **O** okuma | `hazirlik_oku`, `niyet_katalogu`, `platform_oner`, `arama_hacmi`, `konum_ara`, `varliklari_listele`, `performans_oku`, `sinyalleri_oku` | Hepsi tenant bağlamında; `performans_oku` toplam dönüşüm alanı döndürmez |
| **T** taslak | `taslak_olustur`, `taslak_alan_yaz`, `metin_oner`, `anahtar_kelime_oner`, `belirsizlik_sun` | `taslak_alan_yaz` beyaz liste alan + `beklenenSurum`; bütçe/süre/adres yalnız kullanıcı cümlesinde geçiyorsa (mevcut doğrulama) |
| **P** prova | `prova_baslat`, `prova_sonucu` | Hesap başına 5 dk'da 2 (mevcut); kota bekçisi platform çağrısından ÖNCE |
| **K** kart | `onay_karti_goster`, `oneri_karti_ac` | Kart metni sunucudan; `onay_karti_goster` yalnız `eksikler` boşsa ve prova sonucu varsa kart üretir, yoksa `reddedildi{neden}` |

**Yasaklı araçlar** (hiç tanımlanmaz): `yayinla`, `ac`, `oneri_uygula`, `otomatik_uygulama_ac`,
`politika_muafiyeti_iste`, `sil`/`arsivle`, `butce_degistir`, `atif_degistir`, `kategori_cevapla`,
`hesap_ayari_degistir`. Kaynak taramasıyla kilit: araç kayıt dosyasında bu adlar geçerse test düşer
(yorumsuz kaynakta tarama; "gövde yakalandı" iddiası ile).

**Platform parametresi** `DRAFT_PLATFORMS` gibi bilerek dar listeden (`meta`, `google`); LinkedIn yazma
araçlarına girmez.

**Durum kelimesi süzgeci:** asistan metninde "yayında / yayınlandı / kuruldu / hazır" geçer ve aynı
turda sunucunun durum cümlesi yoksa, metin olduğu gibi gösterilir ama altına sunucunun gerçek durum
satırı eklenir ("Gerçek durum: taslak · prova yok"). Silmek yerine çürütmek: model yanlış söylediğinde
kullanıcı farkı görür.

### 4.5 Onay kapıları

| Kapı | Nerede | Kapalıysa |
|---|---|---|
| `bulk.write` | Sayfa + bütün T/P araçları | Sayfa açılmaz |
| Meta yazma kapısı (`metaYazmaAcikMi`) | Prova + yayın | Kart sebebiyle, düğme yok |
| Google yazma kapısı (`googleYazmaKapisi`, D-G7) | Google prova/kurulum/açma | `kapali` → satır gri; `kapali_kur` → "duraklatılmış kurulur"; okunamazsa `kapali` |
| Sohbetten yayın bayrağı (C-19) | Onay kartının birincil düğmesi | "Taslağı panelde aç" |
| `bulk.publish` | `POST /onaylar/:id/onayla` | "Yetkili birine gönder" |
| Uyum ENGEL / UYARI (C-19 §5) | `onayKartiUret` | ENGEL'de düğme yok; UYARI'yı yalnız kullanıcı onaylar |
| Taze okuma (C-18) | Onay anında | Fark → `bayat`, yazma yok |
| Tek kullanımlık onay | `adv_onay` | İkinci tık `409` + "zaten onaylandı" |

`onayKartiUret(girdi) → OnayKarti` saf fonksiyonu girdisini (taslak, derleme sonucu, prova, kapılar,
hazırlık, yetki, bayrak) alır, kartı ve `dugmeler` listesini üretir. Arayüz ve model aynı kartı görür.

### 4.6 Saf fonksiyonlar (panelde render testi yok)

Panelde bileşen render testi yok; karar veren her şey `packages/shared/src/reklam/sohbet/` altında saf
fonksiyon olur ve API vitest paketinde sınanır. Bileşenler yalnız çizer.

| Fonksiyon | Girdi → çıktı | Ne kilitler |
|---|---|---|
| `siradakiSoru(eksikler, sorulanlar)` | → `{alan, etiket, secenekler} \| null` | S-48 sırası, 5 soru sınırı, varsayılansız alanlar |
| `sohbetHali(…)` | → `SohbetHali` (§1.5 kodları) | Hâllerin ayrışması; her kodun bir ekran cümlesi (`satisfies Record<SohbetHali, …>`) |
| `aracIziMetni(aracAdi, hal)` | → Türkçe tek satır | Her araç için iz metni (`satisfies Record`) |
| `platformOner(sinyaller)` | → birincil, ikincil, gerekçe kodları | S-38 altı adım (D-A3) |
| `gerekceCumlesi(kodlar, olcumler)` | → Türkçe cümle | S-40; ölçülmemiş sayı yazılmaz |
| `onayKartiUret(…)` | → `OnayKarti` | §1.6, §4.5 |
| `esneklikCumlesi(platform, tip, tutar)` | → cümle | S-22, sabitten |
| `medyaKontrol(dosya, olcu)` | → kabul / uyarı / ret + sebep | Giriş anında doğrulama |
| `sinyalKurallari(sinyaller, simdi)` | → `OneriKarti[]` + `emptyReason` | S-51 tablosu |
| `kontrolOzeti(satirlar)` | → üst şerit | Toplam dönüşüm alanı YOK |
| `kotaDurumu(kullanim, sinirlar, simdi)` | → `serbest \| doldu{yenilenme}` | Mesaj/tokens sınırı |

**Shared'a dokunan her İP:** `pnpm --filter @advetics/shared build` ÇIKTISIYLA koşar; mutasyon
`npx tsc -p packages/shared/tsconfig.json` ile yeniden derlenerek yapılır, sonra geri alınıp TEKRAR
derlenir; test SAYISI okunur (CLAUDE.md).

### 4.7 Akış (streaming) protokolü

`POST /reklam/sohbet/oturumlar/:id/mesajlar` yanıtı `text/event-stream`. Olaylar:

| Olay | Yük | Arayüz |
|---|---|---|
| `mesaj_basladi` | `mesajId` | Yer tutucu balon |
| `arac_basladi` / `arac_bitti` | `aracAdi`, `hal`, `sureMs` | Araç izi satırı (`aracIziMetni`) |
| `metin` | parça | Balona ekle |
| `taslak_degisti` | `taslakId`, `surum`, değişen alanlar | Sağ panel yeniden okur, çentik vurgusu |
| `soru` | `siradakiSoru` çıktısı | Çipler |
| `kart` | `OnayKarti` / prova kartı | Kart bileşeni |
| `hata` | `tur` (`ret/kesildi/ulasilamadi/kota`), `mesaj` | §1.5 hâli |
| `bitti` | token sayıları | Durdur düğmesi kalkar |

Sunucu, istemci koptuğunda turu **bitirir** (para harcayan bir şey yapmaz; yapabileceği en ağır şey
prova kuyruğu) ve mesajı kapatır. İstemci yeniden bağlanınca `GET …/mesajlar?sonra=<sira>` ile eksik
olayları okur. Nginx/CloudPanel tamponlaması için yanıt `X-Accel-Buffering: no` taşır (yalnız Advetics
sitesinin kendi yanıt başlığı; sunucu yapılandırmasına dokunulmaz, CLAUDE.md §1).

### 4.8 Mevcut motora bağlantı

| Mevcut parça | Sohbette nasıl kullanılır | Değişiklik |
|---|---|---|
| `ai-taslak.ts` (`aiCiktiSchema`, `aiCiktisiniDogrula`) | `taslak_olustur` aracının içi; tek atışlık çağrı yerine aynı doğrulama araç girdisine uygulanır | D-A1 (niyet listesi türetilir), D-A2 (başlık sınırı paketleyicide) |
| `ReklamTaslakService` | T araçları; `kaynak` alanı `ai_onerisi` / `kullanici` | `beklenenSurum` iyimser kilidi |
| `ReklamHazirlikService` | `hazirlik_oku` | Google hazırlığı + yazma kapıları eklenir |
| `prova-isleyici.ts`, `reklam-kuyrugu.ts` | P araçları kuyruğa atar, sonucu `prova` tablosundan okur | Google prova dalı (İP-08) |
| `yayin-baslat.ts`, `yayin-motoru.ts`, `yayin-isleyici.ts` | Onay sonrası (`AdvOnayService`) | `adv_onay.yayin_id` bağı; platform başına `yayin` satırı (K-08) |
| `studyo/onizleme.tsx` | Sağ panelin önizlemesi | Görünüm prop'u (panel içi / tam), kalıp korunur |
| `studyo/studyo.tsx` | Medya bırakma mantığı (`dosyaYukle`, `kapakKaresi`) | Yazma alanı bileşenine taşınır; `ORNEKLER` çipleri kalır |

### 4.9 Maliyet ve kota

| Sınır | Başlangıç değeri (sabit `ADV_SOHBET_SINIRLARI`) | Aşılınca |
|---|---|---|
| Mesaj başına araç adımı | 8 | `kesildi` |
| Mesaj başına çıktı token | 8.000 | `kesildi` |
| Kullanıcı başına saatlik mesaj | 40 | `kota_doldu` (yenilenme saati yazılı) |
| Workspace başına günlük girdi token (önbellek hariç) | 1.500.000 | `kota_doldu` |
| Oturum başına mesaj | 120 | "Yeni oturum aç" önerisi; eski oturum okunur kalır |
| Görsel modele | yalnız ilk tur, ≤ 5 MB, oturum başına ≤ 10 | Söylenir |

Sayaçlar `adv_mesaj` token kolonlarından sorgu anında toplanır (ayrı sayaç tablosu yok; ikinci kaynak
ayrışır). Kota bekçisi model çağrısından ÖNCE çalışır (sıfır maliyetli ret). Değerler İP-13'te ilk hafta
ölçülüp gözden geçirilir; panelde "bugün kullanılan" ayar ekranında görünür. Platform kotası: Meta prova
sınırı mevcut; Google için hesap başı bekçi D-G8 (İP-25).

### 4.10 Denetim kaydı

Her yazma (taslak sürümü değil, platforma giden her şey ve her onay) `audit_logs`'a satır: kullanıcı,
workspace, `oturum_id`, kullanıcının asıl cümlesi (`adv_mesaj` kimliğiyle), platform, işlem, gövde
özeti SHA-256, prova sonucu, platform yanıtı (kod/alt kod, Google `requestId`), geri okuma farkı,
`adv_onay.id`. Ham gövde saklanmaz; token/şifreli alan içermediği kaynak taramasıyla kilitlenir.
`audit_logs.id` BIGSERIAL, insert'te verilmez.

---

## 5. Uygulama planı

Her İP **tek commit**: kod + testler + (gerekiyorsa) migration + `docs/DEVAM.md` notu. Push öncesi
`typecheck` + testler (API paketi tek başına koşulur, paralel değil). Mutasyon sütunu "hangi satırı bozup
testin düştüğünü göreceğiz" der. "Bağ." = bağımlılık.

### 5.1 Grup A — P0 düzeltmeleri (SENTEZ D-*)

**İP-01 · Niyet listesi türetilir, ARAMA → TELEFON** (D-A1, D-M5)
- Kapsam: `AI_NIYETLERI` derlenebilir ∧ `kanit: 'canli'` niyetlerden türer; `ARAMA` kodu ve ekran adı
  `TELEFON` / "Beni telefonla arasınlar".
- Dosyalar: `apps/api/src/modules/reklam/ai-taslak.ts`, `packages/shared/src/reklam/meta/niyetler.ts`,
  `derle.ts` (`DERLENEN_NIYETLER`), panel etiketleri, `ai-taslak.spec.ts`.
- Test/mutasyon: kaynak taramasıyla `AI_NIYETLERI` elle dizi değil; listeye WHATSAPP eklenince test düşer.
- Kabul: model şemasında yalnız FORM, SITE; "ARAMA" dizgesi yorumsuz kaynakta yok. Bağ.: —

**İP-02 · Kreatif özellik sözlüğü üç sınıflı, ekran metni dürüst** (D-M1, D-M2, K-07)
- Kapsam: `KREATIF_OZELLIK_SINIFLARI`; `yanki.ts` yalnız `uretken_ya_da_tanimsiz` OPT_IN'de durur;
  `text_optimizations` yasal uyarılı ve sağlık/finans/konut workspace'te durur; `kapattiklarimiz`
  yalnız gönderilenler; "Meta'nın otomatik yaptıkları" geri okumadan.
- Dosyalar: `packages/shared/src/reklam/meta/yanki.ts`, `derle.ts`, `onizleme.tsx` metin bloğu.
- Test/mutasyon: üç sınıf ayrı vaka; `adapt_to_placement: OPT_IN` yayını durdurmaz; sınıf kontrolü
  silinince test düşer; ekran metninde "görseli ve metni değiştirmesi kapalı" geçmez.
- Kabul: SENTEZ §4.2 dört madde. Bağ.: —

**İP-03 · Atıf kuralı niyet başına** (D-M3)
- Kapsam: `ATIF_KURALI {hedef → 'ajans_standardi' | 'tik1'}`; rapor ve onay kartı etiketi aynı sabitten.
- Dosyalar: `derle.ts`, `packages/shared/src/reklam/taslak.ts`, etiket üreticisi.
- Test/mutasyon: LPV → `tik1`; FORM → ajans standardı; etiket sabitten türer (sabiti değiştir, etiket
  değişsin). Bağ.: —

**İP-04 · Video `expired` kesin hata** (D-M4)
- Dosyalar: `apps/api/src/modules/reklam/meta-graf.ts`, `meta-graf.spec.ts`.
- Kabul: `expired` → "Video süresi doldu, yeniden yükle"; `processing_phase` hatası ayrı. Bağ.: —

**İP-05 · Google yazma kapısı** (D-G7)
- Kapsam: `ajans_ayari.google_yazma_kapisi` (AYRI migration, CHECK), `googleYazmaKapisi()` tek kapı,
  okunamazsa `kapali`; ajans ayar ekranında üç değerli seçici (yalnız `org.write`).
- Dosyalar: `prisma/schema.prisma`, yeni migration, `yazma-kapisi.ts`, `ajans-ayari.service.ts`, spec.
- Test/mutasyon: okuma hatasında `kapali`; ajans org'u ve kendi org'u birlikte okunuyor (Meta kapısının
  aynı dersi); `OR a.org_id = s.ajans_org_id` silinince test düşer.
- Kabul: varsayılan `kapali`; panelde görünür. Bağ.: —

**İP-06 · Google gövde düzeltmeleri (saf)** (D-G1, D-G2, D-G5, D-G6)
- Kapsam: `startDateTime/endDateTime`, `containsEuPoliticalAdvertising`, `aiMaxSetting.enableAiMax:
  false`, `targetSpend` (SITE), `cpcBidMicros` zorunluluğu kalkar.
- Dosyalar: `connections/providers/google-write.ts`, `google-demandgen.ts`, `google-request.spec.ts`
  ya da yeni `google-govde.spec.ts`.
- Test/mutasyon: alan ADLARI kilitli (`startDate` yorumsuz kaynakta yok); her alan silinince düşer.
- Kabul: SENTEZ S-45 Google satırları gövdede. Bağ.: —

**İP-07 · Atomik Google işlem listesi üreticisi** (D-G3, D-G4)
- Kapsam: `googleAramaIslemleri(taslak, hazirlik) → MutateOperation[]` saf; geçici kimlikler (`-1,-2,-3`),
  bütçe + kampanya + konum + dil + `PRESENCE` + reklam grubu + anahtar kelimeler + negatifler + RSA.
  Eski `publishDraft` yeni modülden çağrılmaz.
- Dosyalar: yeni `apps/api/src/modules/reklam/google/islem-listesi.ts` + spec; `packages/shared/src/
  reklam/google/` (sabitler: `TABAN_NEGATIFLER`, RSA sınırları).
- Test/mutasyon: konum ölçütü yoksa üretici hata fırlatır (sessiz dünya yayını yok); geçici kimlik
  referansları tutarlı; `positiveGeoTargetType` silinince düşer.
- Kabul: S-43 tablosunun her satırı bir iddia. Bağ.: İP-06

**İP-08 · Google prova (validateOnly) dalı**
- Kapsam: prova işleyicisine Google dalı; AYNI liste `validateOnly: true`; yayın öncesi
  `missing_eu_political_advertising_declaration` sorgusu; `PlatformApiError` sınıfları + `requestId`.
- Dosyalar: `prova-isleyici.ts`, `reklam-kuyrugu.ts`, google sağlayıcı istemcisi, spec.
- Test/mutasyon: prova ile kurulum aynı üreticiden (kaynak taraması: ikinci liste kurulmaz).
- Kabul: Ö-G1/Ö-G2 betikle koşabilir. Bağ.: İP-05, İP-07

### 5.2 Grup B — Sohbet çekirdeği

**İP-09 · Sohbet sözleşmesi ve saf fonksiyonlar**
- Kapsam: `packages/shared/src/reklam/sohbet/`: olay tipleri (§4.7), araç sonuç tipi, `siradakiSoru`,
  `sohbetHali`, `aracIziMetni`, `medyaKontrol`, `kotaDurumu`, `ADV_SOHBET_SINIRLARI`.
- Test/mutasyon: S-48 her madde bir test (5. sorudan sonra `null`; bütçe varsayılanla dolmaz); `satisfies
  Record` ile hâl metni eksikse derleme kırılır; shared yeniden derlenerek mutasyon.
- Kabul: §1.3 ve §1.5 tabloları testte. Bağ.: —

**İP-10 · Tablolar: adv_oturum, adv_mesaj, adv_onay**
- Kapsam: migration, RLS, TRUNCATE, `WORKSPACE_TABLOLARI` kararı (taşınır), `adv_onay` kısmi tekil
  indeks ve çıkış yolu (süre dolumu işi).
- Dosyalar: `schema.prisma`, migration, `prisma/sql/02_rls.sql`, `test/pglite-harness.ts`,
  `manager-account/workspace-tasima.ts`.
- Test/mutasyon: `SET ROLE` ile gerçek politika testi (başka kullanıcının oturumu yazılamaz); UPDATE
  testleri `RETURNING` ile etkilenen satırı sayar; onay iki kez `onaylandi` olamaz.
- Kabul: `rls-coverage`, `workspace-tasima` testleri yeşil. Bağ.: —

**İP-11 · platformOner + gerekçe sözlüğü** (D-A3, S-38, S-40)
- Kapsam: saf fonksiyon, altı adım, sebep kodları, `gerekceCumlesi`; `ARAMA_HACMI_ESIGI = 1000` (K-06).
- Test/mutasyon: her adım için vaka; sıra değişince (adım 3 ile 4 yer değiştirince) test düşer;
  `HACIM_BILINMIYOR` iken sayı yazılmaz.
- Kabul: SENTEZ §3.2 her madde. Bağ.: İP-05

**İP-12 · O katmanı araçları**
- Kapsam: `hazirlik_oku` (Google hazırlığı + kapılar), `niyet_katalogu`, `platform_oner`,
  `varliklari_listele`, `konum_ara` (Meta + Google suggest, dört hâl), `performans_oku` (toplam dönüşüm
  alanı yok).
- Dosyalar: `apps/api/src/modules/reklam/sohbet/araclar/okuma.ts` + spec.
- Test/mutasyon: `performans_oku` çıktı tipinde dönüşüm toplamı alanı olmadığı tip testiyle; `konum_ara`
  "eşleşme yok" ile "düştü" ayrı. Bağ.: İP-09, İP-11

**İP-13 · Döngü servisi, SSE ucu, kota, denetim**
- Kapsam: `AdvSohbetService` (döngü ≤ 8, tekrar bekçisi, görsel yalnız ilk tur, durum kelimesi süzgeci),
  `AdvOturumService`, uçlar (`oturumlar`, `mesajlar` SSE, `mesajlar?sonra=`), kota bekçisi, `audit_logs`.
- Dosyalar: `apps/api/src/modules/reklam/sohbet/*`, `reklam.controller.ts` ya da ayrı
  `sohbet.controller.ts`, `reklam.module.ts` (Nest kaydı kaynak taramasıyla kilit).
- Test/mutasyon: sahte model (`modelCagir` deseni) ile: 9. adım çalışmaz; kota dolunca model HİÇ
  çağrılmaz (çağrı sayacı 0); istemci koptuğunda mesaj `tamam`/`kesildi` ile kapanır, `akista` kalmaz.
- Kabul: API testleri; elle `curl -N` ile olay akışı. Bağ.: İP-10, İP-12

**İP-14 · T ve P araçları**
- Kapsam: `taslak_olustur` (ai-taslak doğrulaması), `taslak_alan_yaz` (`beklenenSurum`), `metin_oner`
  (D-A2 paketleyici sınırları), `belirsizlik_sun`, `prova_baslat`, `prova_sonucu`.
- Test/mutasyon: cümlede geçmeyen bütçe yazılamaz; eski sürümle yazım `SURUM_ESKI`; başlık sınırı
  platforma göre (Meta 40, RSA 30). Bağ.: İP-01, İP-13

**İP-15 · Onay kartı ve tek kullanımlık onay**
- Kapsam: `onayKartiUret`, `esneklikCumlesi`, `onay_karti_goster`, `POST /onaylar/:id/onayla` (taze okuma,
  bayat, tek kullanım, `bulk.publish`, bayrak), yayın motoruna bağ, platform başına `yayin` satırı (K-08).
- Test/mutasyon: ENGEL'de `dugmeler` birincil içermez; bayrak kapalıyken "Taslağı panelde aç"; ikinci
  onay `409`; sürüm değişince `bayat`; Google satırı `kapali_kur` iken kart metninde "yayınlanır" geçmez.
- Kabul: §1.6 her bölüm. Bağ.: İP-02, İP-03, İP-14

### 5.3 Grup C — Arayüz

**İP-16 · Ekran iskeleti ve akış istemcisi**
- Kapsam: `/reklam` üç bölge + `?gorunum=`; oturum şeridi; SSE istemcisi (yeniden bağlanma, `sonra=`);
  `sohbetHali` çizimi; `lib/baglanti.ts` parametreleri.
- Dosyalar: `apps/web/src/app/(dashboard)/reklam/page.tsx`, `apps/web/src/reklam/sohbet/*`,
  `lib/baglanti.ts`, `reklam-modulu.spec.ts`.
- Test: kaynak taraması: `.catch(() =>` boş atama yok; her `SohbetHali` kodu bileşende dallanıyor;
  `nav-sections.spec.ts` yeşil. Bağ.: İP-13

**İP-17 · Canlı taslak paneli, medya alanı, kartlar**
- Kapsam: önizleme (mevcut `onizleme.tsx`), eksikler, "varsayılan" rozeti, elle düzenleme → sürüm,
  medya bırakma (`studyo.tsx`'ten taşınır, `medyaKontrol` giriş anında), soru çipleri, prova ve onay
  kartı bileşenleri.
- Test: kaynak taraması + saf fonksiyon testleri; `domaYazilmali` dersi: odaktaki alan ezilmez.
  Bağ.: İP-15, İP-16

**İP-18 · Görsel katman, koyu tema, mobil**
- Kapsam: `.adv-*` kalıpları `globals.css` PANEL TASARIM KATMANI altında; animasyonlar
  `prefers-reduced-motion: no-preference` altında; mobil alt çubuk; `panel-tasarim.spec.ts` genişler
  (yeni animasyon reduced-motion bloğunda olmalı).
- Kabul: 375 px'te yatay kaydırma yok (tarayıcıda elle); koyu temada kontrast. Bağ.: İP-16

**İP-19 · Eval seti ve sohbetten yayın bayrağı** (C-19, SENTEZ §5.5)
- Kapsam: 40 Türkçe senaryo × 5 koşu, sahte platform araçlarıyla; yasak davranış sayacı (yasaklı araç
  denemesi, tahmin bütçe, toplam dönüşüm cümlesi, durum kelimesi); bayrak workspace bazında
  `ajans_ayari`ta.
- Dosyalar: `apps/api/eval/advcampaign/*` (CI'da koşmaz, elle; çıktı rapor dosyası `.gitignore`).
- Kabul: yasak davranış 0, yapısal doğruluk ≥ %90 → bayrak açılabilir. Bağ.: İP-15

### 5.4 Grup D — Meta uyum P1 (MVP bitmeden)

**İP-20 · Meta geri okuma genişlemesi** (D-M8, D-M9, D-M7)
- Kapsam: `advantage_state_info` beklenen durum tablosu; `IN_PROCESS` bekle → `issues_info` →
  `WITH_ISSUES` ayrı sonuç; `/adsets` provası 3 alana iner, Ö-M3 sonucu ile karar.
- Dosyalar: `yanki.ts`, `yayin-motoru.ts`, `prova.ts`. Bağ.: İP-02

**İP-21 · Parçalı video yükleme ve genişlik uyarısı** (D-M10, D-M11)
- Dosyalar: `meta-graf.ts`, `medyaKontrol`. Kabul: 200 MB video zaman aşımsız. Bağ.: İP-04, İP-09

**İP-22 · WHATSAPP derleme** (D-M6; Ö-M7 sonrası)
- Kapsam: derleyici dalı, Türkçe `page_welcome_message` (Marka Merkezi'nden, varsayılan metin), sayfada
  WhatsApp bağlı mı ön kontrolü, `kanit: 'canli'` olunca `AI_NIYETLERI`'ne kendiliğinden girer.
- Bağ.: İP-01, Ö-M7

### 5.5 Grup E — Google kapıları

**İP-23 · Ölçüm betikleri Ö-G0…Ö-G2** (K-01)
- Kapsam: `apps/api/scripts/google-olcum/*` yalnız Profaj hesabında; çıktılar CLAUDE.md "Canlıda öğrenilen"
  bölümüne ve `kanit` alanına. Para harcamaz. Bağ.: İP-08

**İP-24 · Google `kapali_kur` yayın yolu** (Ö-G3, K-02)
- Kapsam: onay sonrası Google satırı aynı işlem listesiyle `validateOnly: false`, PAUSED; geri okuma
  (konum PRESENCE, dil, ağlar, AI Max, teklif, bütçe, tarih, `primary_status`, `policy_summary`); durum
  `kapali_kuruldu`; kayıt yazılamazsa `creating` kalır (mükerrer kampanya yok).
- Test/mutasyon: geri okuma farkında `fark_var`; kart ve durum cümlesinde "yayınlandı" yok.
- Kabul: Ö-G3 Profaj hesabında geçti, kapı `kapali_kur` olarak açılır. Bağ.: İP-15, İP-23

**İP-25 · Arama hacmi, anahtar kelime önerisi, Google kota bekçisi** (D-G8, Ö-G6)
- Kapsam: `arama_hacmi` (KP, 1 QPS, Explorer'da `ERISIM_YOK`), `anahtar_kelime_oner` (ölçülmüş/ölçülmemiş
  etiketi, taban negatifler), hesap başı Google kota bekçisi (prova da sayılır, ön koşul çağrıdan önce).
- Bağ.: İP-11, İP-23

**İP-26 · Google `ac` kapısı** (Ö-G7, K-03, K-04)
- Kapsam: `update` + `updateMask: status`; onay kartı aynı; para harcayan ölçüm günlük 50 TL × 48 saat.
- Kabul: Ö-G7 geçti, `search_term_view` geliyor, kapatıldı; kapı `ac`. Bağ.: İP-24, İP-25

### 5.6 Grup F — Kontrol Merkezi

**İP-27 · Sinyal aynası ve Meta sinyal okuma** (D-M12, S-50)
- Kapsam: `adv_sinyal` tablosu (RLS, TRUNCATE, taşınır kararı); yapı taramasıyla aynı kota katmanında
  `learning_stage_info`, `issues_info`, `effective_status`, `recommendations`, rozetler, yorgunluk,
  `activities` (dışarıdan değişti). Ö-M10 alanları ölçülerek.
- Test/mutasyon: okuma hiç koşmadıysa "hiç okunmadı" (`emptyReason`), koştu ve boşsa "sinyal yok".
- Bağ.: İP-10 (desen)

**İP-28 · Google sinyal okuma**
- Kapsam: `primary_status(_reasons)`, `policy_summary`, `bidding_strategy_system_status`, kayıp gösterim
  payı, `search_term_view`, `optimization_score` ("Google önerilerini uygulama oranı" etiketiyle), AI Max
  taşınma tarihleri, `change_event`. Bağ.: İP-25, İP-27

**İP-29 · Kural fonksiyonları ve öneri kartları** (S-51)
- Kapsam: `sinyalKurallari` saf; `adv_oneri_karti` tablosu (RLS, TRUNCATE, workspace taşımada `bayat`);
  öğrenmedeki nesneye değişiklik önerilmez; minimum veri; platform teşhisi önce.
- Test/mutasyon: S-51 her satır bir vaka; `LEARNING` iken bütçe kartı çıkmaz (koşul silinince düşer).
- Bağ.: İP-27, İP-28

**İP-30 · Kontrol Merkezi ekranı**
- Kapsam: `?gorunum=kontrol`; üst şerit (`kontrolOzeti`, toplam dönüşüm yok), hesap tablosu ("N /
  toplam"), satır detayı ağacı, öneri kartları, "Sohbette konuş", ajans modu süzgeci.
- Test: kaynak taraması (toplam dönüşüm alanı kullanılmıyor; hesap süzgeci her zaman var).
- Bağ.: İP-16, İP-29

**İP-31 · İzinli eylemlerin uygulanması (Faz 2)**
- Kapsam: negatif kelime ekleme, bütçe artışı/durdurma onay penceresi; OKU-KARŞILAŞTIR-YAZ; kural motoru
  üzerinden yazma ve geri okuma; platformlar arası kart (S-52).
- Bağ.: İP-30, ilgili Faz 2 ölçümleri

### 5.7 Sıra ve kritik yol

```
A: İP-01 ─ İP-02 ─ İP-03 ─ İP-04 ─ İP-05 ─ İP-06 ─ İP-07 ─ İP-08
B:            İP-09 ─ İP-10 ─ İP-11 ─ İP-12 ─ İP-13 ─ İP-14 ─ İP-15
C:                                              İP-16 ─ İP-17 ─ İP-18 ─ İP-19
D:  İP-20 (İP-02 sonrası) · İP-21 (İP-04 sonrası) · İP-22 (Ö-M7 sonrası)
E:  İP-23 ─ İP-24 ─ İP-25 ─ İP-26
F:  İP-27 ─ İP-28 ─ İP-29 ─ İP-30 ─ İP-31
```

Kritik yol (ilk kullanılabilir sohbet, yalnız Meta): İP-01 → 02 → 03 → 09 → 10 → 12 → 13 → 14 → 15 → 16 →
17. Google grubu (E) sohbet çekirdeğine paralel ilerleyebilir, yalnız İP-24 İP-15'i bekler. İlk gerçek
Meta yayını (Ö-M12) İP-20 ve İP-15 sonrası, K-03 tavanıyla.

---

## 6. Riskler ve açık noktalar

| # | Risk / açık nokta | Etki | Azaltma |
|---|---|---|---|
| R-1 | Model araç döngüsünde soru kuralını çiğner (iki soru birden, ölçülebilen şeyi sorar) | Acemi kullanıcı yorulur, güven düşer | Soru yalnız `siradakiSoru` çıktısından; eval sayacı; çip metni sunucudan |
| R-2 | Durum kelimesi süzgeci yetmez (eş anlamlı: "açtım", "başladı") | Kullanıcı yayında sanar | Eval'de yasak kelime listesi genişler; kart ve panel durum satırı her zaman sunucudan |
| R-3 | SSE paylaşımlı sunucuda tamponlanır | Akış takılır, "koptu" sanılır | `X-Accel-Buffering: no` yanıt başlığı; çalışmazsa kısa yoklama (`sonra=`) yedeği zaten var. Sunucu yapılandırması DEĞİŞTİRİLMEZ |
| R-4 | LLM maliyeti öngörülenden yüksek | Ajans maliyeti | İlk hafta ölçüm; sınırlar tek sabitte; görsel yalnız ilk turda; önbellek |
| R-5 | Kapatılamayan Meta uyarlamaları (K-07) müşteri şikâyeti üretir | Marka kontrolü | Onay kartında açıkça yazılı; Ö-M2 kapatma yolu bulursa sınıf 2 boşalır |
| R-6 | Google yazma yolu canlıda ilk kez koşacak; A1'de belirsiz 16 madde var | Yarım kampanya, dünya geneli yayın | Atomik liste + validateOnly + PAUSED + geri okuma; kapı kapı; Profaj hesabı (K-01) |
| R-7 | Google AI Max'e açıkça kapalı yazılmış kampanyayı da taşıyabilir (S-19) | Geniş eşleme | Ö-G8 30 gün izleme; Kontrol Merkezi uyarı kartı |
| R-8 | Sinyal okuma kota yer (yapı taraması ile aynı katman) | Yapı taraması reddedilir (kalıcı kilit dersi) | Sinyal okuma yapı taraması BİTTİKTEN sonra zincirlenir; ön koşul çağrıdan önce |
| R-9 | Sohbet ve elle düzenleme yarışır | Model kullanıcının değişikliğini ezer | `beklenenSurum` iyimser kilit |
| R-10 | Eski `ai_conversations` tabloları kafa karıştırır | Yanlış tabloya yazan kod | Kaynak taraması: yeni modülde `aiConversation` geçmez |
| R-11 | Meta MCP ikinci yazma kaynağı (hafıza notu) | Kontrol Merkezi bayat rakamla öneri verir | "Dışarıdan değişti" rozeti; öneri kartı uygulamadan önce taze okuma |
| A-1 | Sohbetten yayın bayrağının eval eşiği (C-19 a) varsayılan alındı | — | Kullanıcı değiştirebilir |
| A-2 | Kullanıcı başına/workspace başına LLM sınır değerleri tahmin | — | İP-13 ilk hafta ölçülür |
| A-3 | Google Explorer/Basic erişim seviyesi bilinmiyor (D-G10) | `arama_hacmi` boş dönebilir | Ö-G0; `HACIM_BILINMIYOR` yolu zaten Meta'ya düşer |
| A-4 | `adv_oturum` workspace taşımada "taşınır" kararı; eski `ai_conversations` için kayıt "asistan sohbeti" etiketiyle zaten listede | — | İP-10'da kararın gerekçesi koda yazılır |
| A-5 | Kontrol Merkezi'nde ajans modu (tüm şirketler) performansı: 481 hesaplık havuz | Yavaş liste | `client_id IS NOT NULL` süzgeci (havuz sayılmaz); sorgu her iki biçimde ölçülür (CLAUDE.md ölçüm dersi) |

---

*Bu belge SENTEZ'in yerini almaz; onu ekrana, tabloya ve iş paketine çevirir. Bir varsayılan (§0)
değişirse tarihli satır eklenir.*
