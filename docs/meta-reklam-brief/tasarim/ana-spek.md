# Reklam Oluştur, baştan: ANA SPEK

> **Ne:** Dört tasarım önerisinin (Acemi önce · Risk önce · Yapay zekâ önce · Ajans önce) ve üç hakemin
> puanlarının birleştirilmesiyle çıkan TEK tasarım çerçevesi. Nihai belgenin bölüm yazarları bu dosyayı
> sözleşme olarak kullanır: kararlar (§1), paylaşılan sözlük (§2), bölüm planı (§3), açık sorular (§4).
> **Tarih:** 2026-10-07 · **Durum:** tasarım, kod yok · **Kapsam:** Meta ilk platform, Google ve LinkedIn'e
> açılan mimari; Akıllı Boost kapsam dışı (sınırı T-3).
>
> **Omurga:** `oneri-acemi.md`. Hakem toplamları: Acemi 167,5 · Ajans 166 · AI 164,5 · Risk 160,5; üç
> hakemden ikisi Acemi'yi seçti, üçü de "kazanan tek başına yetmez, aşılansın" dedi. Belirleyici olan,
> Advetics'in bugüne kadar tek kampanya yayınlayamamış olması: ilk gerçek değere en küçük yüzeyle varan
> ve kullanıcının sözünü ("reklam ile ilgili bilgisi olmayan birisinin bile platformu kullanabilmesi")
> ölçülebilir hedefe çeviren tek öneri Acemi. Aşılar: AI önerisinden **tutarlılık mekanizmaları**
> (alan kaynağı, kaynak kilidi, tek `eksikler()`, karar kaydı, sohbet durum makinesi, araç yanıt
> sözleşmesi); Risk önerisinden **para ve kanıt kapıları** ("En çok ne harcanır", ENGEL'de bilinmiyor =
> kaldı, değişmez uyum raporu, ajans geneli durdurma anahtarı, genişletilmiş kabul edilemez fark sınıfı,
> risk sıralı canlı tur, CREDIT veri düzeltmesi); Ajans önerisinden **ölçek katmanı** (yayın masası,
> kurulum listesinin masada sütun olması, sürüme bağlı onay zinciri, reçete şeması, çok workspace'e
> uygula, rapor KPI bağı, taahhüt muhasebesi, izinlerin `PERMISSIONS` dizisine eklenmesi).
>
> **Ayıklanan kusurlar:** Acemi'de özel kategori sorusunun yalnız sözlük sinyalinde sorulması (T-16 ile
> E1'de her taslakta); Risk'in E1'i dört alt soruya şişirmesi, üç yeni Base bölümü ve varsayılanı açık
> "dört göz"ü (T-7, T-72); AI'ın sohbeti ana yüz yapması ve Aşama 3'te iki yüzü birlikte kurması (T-2,
> T-86); Ajans'ın E4'te bütçe+süre+konumu birleştirmesi ve AI'ı en sona itmesi (T-15, T-86); Ajans'ın
> C-16 form sırası (T-52); "müşteri workspace'lerinde ilk 30 yayın" şartı (T-63); atıf için "onaylanana
> kadar onaylı uygulanır" muğlaklığı (T-38).

**Kimlik işaretleri.** `C-n` = 52 çelişkinin bağlayıcı hükmü (`hukum-*.json`) · `R1-O-12`, `R3-K-4`,
`README-S-25`, `MEVCUT-O-31` = girdi belgelerindeki öneri (O), kısıt (K), sessiz risk (S) · `README §5.3` =
`docs/meta-reklam-brief/README.md` bölümü · `00 §12.1` = `bolumler/00-advetics-mevcut-durum.md` ·
`acemi §3.4`, `ai §2.3`, `risk §8.4`, `ajans §2.6` = önerilerin bölümü (bölüm yazarının metni alacağı yer)
· `[KK]` = kullanıcı kararı bekliyor, önerilen varsayılan uygulanıyor (§4) · `[Canlı]` = canlı turda
ölçülmeden kesinleşmiyor · `[Hukuk]` = hukuk görüşü bekliyor.

**Bağlayıcı kullanıcı kararları (2026-10-06):** (1) Tek adımlı yayın: PAUSED kur → geri oku → fark yoksa aç,
fark varsa açma durur. (2) Advantage+ kitle ve otomatik yerleşim AÇIK. (3) AI onay kartıyla sohbetten
yayınlar. (4) Konut kısıtları Türkiye'de de. (5) Akıllı Boost hariç modül baştan; Acemi + Gelişmiş + AI
aynı taslağın üç yüzü. Bu beş kararı çiğneyen hiçbir madde bu spekte yoktur; bölüm yazarları da
eklemez.

---

## 1. Tasarım kararları

Her karar tek cümlelik hüküm + dayanak + (varsa) hangi öneriden alındığı. Bölümler bu kararları
AÇAR, değiştirmez; bir karar yanlış görünürse bölüm içinde değil §4'te soru olarak yazılır.

### 1.1. Omurga ve kapsam

- **T-1 · Omurga Acemi önerisi.** Diğer üç öneriden yalnız hakemlerin öne çıkardığı fikirler aşılanır;
  bir öneriden bütün bir bölüm taşınmaz. Dayanak: hakem puanları, kullanıcı kararı 5.
- **T-2 · Tek taslak, tek derleyici, tek yayın yolu, üç yüz.** Acemi varsayılan yüzdür; Gelişmiş ayrı
  sayfa değil aynı ekranların ek alanlarıdır (sağ üstte "Basit / Gelişmiş" anahtarı, kullanıcı başına
  hatırlanır); AI sohbeti aynı sayfada yan paneldir ve ana yüz DEĞİLDİR (ne yazacağını bilmeyen
  kullanıcıya boş kutu verilmez). Dayanak: README §5.1, R2-O-1, karar 5; AI önerisinin ana yüz tezi
  hakemlerce reddedildi.
- **T-3 · Akıllı Boost sınırı.** Yeni modül boost yürütücüsünü ÇAĞIRABİLİR, DEĞİŞTİREMEZ, ikinci boost
  yolu yazamaz; `draft-publish.publishBoost` silinir; ortak hedefleme üreticisi varsayılansız
  `advantageAudience: 0|1` alır (boost 0, yeni derleyici 1; varsayılanı 1'e çevirmek yasak); "Paylaşımımı
  öne çıkar" yalnız Akıllı Boost ekranına yönlendirme kartıdır; konum TR yedeği yalnız boost yollarında
  kalır. Dayanak: C-20, C-8, C-40, C-45 §6; acemi §2.6.
- **T-4 · İlk platform yalnız Meta.** Mimari platformdan bağımsız (derleyici platform başına, durum
  makinesi ve geri okuma sözleşmesi ortak); Gelişmiş'te çok platformlu grup kalırsa Google satırı
  `kapali_kuruldu` olur, asla "yayınlandı" demez; Google'da AI salt okur. Dayanak: C-51 [KK], C-19 §3.
- **T-5 · Başarı sözü ölçülebilir.** Hazır workspace'te niyet kartından "Yayınla"ya medyan ≤ 5 dakika ve
  ≤ 5 soru ekranı; hazır olmayan workspace'te kullanıcı nerede takıldığını ve kimin çözeceğini ilk
  ekranda görür; "Yayında" yalnız `effective_status` öyle diyorsa yazılır. Dayanak: acemi §1.4, C-40,
  README-S-3, R4-O-23.

### 1.2. Bilgi mimarisi ve hazırlık

- **T-6 · Tek giriş, iki sekme.** Menüde tek öğe "Reklam Oluştur"; sayfada "Yeni reklam" ve "Reklamlarım".
  Bugünkü beş kart (AI / Hızlı / Kampanya Kur / Toplu / Akıllı Boost) kalkar; Akıllı Boost menüde kendi
  yerinde kalır. "Reklamlarım" yayın masasının (T-74) tek workspace görünümüdür: iki ayrı liste
  yazılmaz. Menü etiketi = sayfa başlığı = `metadata.title` (`nav-sections.spec.ts`). Dayanak:
  MEVCUT-O-31, ajans §2.1, CLAUDE.md "AYNI EKRANIN İKİ AYRI ADI".
- **T-7 · Hazırlık bir kez, tek bölümde.** Reklam başına sorulmayan her şey Base › Marka Merkezi ›
  **"Reklam hazırlığı"** bölümünde (`?bolum=reklam-hazirligi`, `marka-merkezi/bolumler.ts`) bir kez
  girilir. Bölüm bir **kurulum listesi**dir (HZ-*, §2.8); her satır üç hâllidir ve hangi niyet kartını
  kapattığını yazar. Uyum, Formlar, İddialar AYRI Base bölümü olarak açılmaz; bu bölümün alt
  gruplarıdır (Risk önerisinin hazırlık yükü kusuru). Akıştaki kapalı kartın "Şimdi düzelt"i sağdan
  çekmece açar, değer bir kez Marka Merkezi'ne yazılır. Dayanak: C-40, CLAUDE.md §5 "BASE", acemi §2.1,
  ajans §2.4.
- **T-8 · "Kim için" yalnız gerekiyorsa ekran olur.** Workspace'te tek hesap + tek sayfa + tek IG varsa
  ekran yoktur, seçim her adımda üst satırda yazar; birden fazlaysa tek ekran ve sessizce ilkine
  düşülmez. Dayanak: acemi §3.2, MEVCUT-O-34.

### 1.3. Taslak modeli (tutarlılık mekanizmaları)

- **T-9 · Taslak sürümlüdür.** Her kayıt yeni `taslak_surumu` (değişmez, içerik özetli); prova, onay
  kartı, müşteri onayı, ajans onayı ve uyum raporu bir SÜRÜME bağlanır; sürüm değişince bayatlar.
  Dayanak: R5-S-3, R2-O-50, R2-S-20; ai §2.3.
- **T-10 · Her alan kaynağını taşır** (`{deger, kaynak, kim, zaman}`), kaynak listesi §2.3. Gözden
  geçir'in üç sütunu ve ekrandaki etiketler bu alandan türer, elle eşlenmez. Dayanak: ai §2.3, C-40.
- **T-11 · Kaynak kilidi veride.** Yapısal alanlar (§2.3 listesi) `ai_onerisi` kaynağıyla DERLENEMEZ;
  derleyici platform çağrısından önce sıfır çağrılı retle durur ve bu bir testle (mutasyonlu) kilitlenir.
  "AI bütçe/konum tahmin etmez" kuralı istemden VERİYE taşınır. Kullanıcı öneriyi kabul edince kaynak
  `kullanici` olur. Dayanak: README §6.5, R2-O-42/43, R5-S-22; ai §2.3, §5.10.
- **T-12 · Tek `eksikler()` fonksiyonu.** `eksikler(taslak, profil, hesapOkumasi) → Eksik[]` saf fonksiyon
  (`packages/shared`). Paneldeki "Yayına kalan N şey", sohbetin sorduğu sorular, Yayınla düğmesinin
  kapalılık sebebi ve masadaki "sıradaki iş" AYNI listeden gelir. Model eksikleri hafızasından değil
  buradan çıkarır. Dayanak: R5-O-8; ai §2.3.
- **T-13 · Derleyici karar kaydı ve "Neden?".** Derleyicinin otomatik verdiği her karar (amaç,
  optimizasyon, yapı, OPT_OUT'lar, yaş tabanı...) bir `KararKaydi` satırı üretir; panelde her otomatik
  kararın yanında "Neden?" bu kayıttan, sohbette `karar_gerekcesi` aracı aynı kayıttan okur; model
  gerekçe uydurmaz. Dayanak: ai §0/§9.3, R5-O-19.
- **T-14 · "Bu reklam ne yapacak?" kartı.** Akış boyunca sağda tek paragraf Türkçe özet; KOD üretir
  (derleyicinin çözdüğü taslaktan, model değil); bilinmeyen parça "henüz seçilmedi" yazılır, uydurulmaz;
  eksik konum burada ilk adımdan görünür. Dayanak: acemi §3.1, R2-O-16.

### 1.4. Acemi akışı

- **T-15 · Beş soru adımı + bir gözden geçir.** Niyet · Medya · Metin · Bütçe · Süre, ardından "Gözden
  geçir ve yayınla". Bütçe ve süre AYRI adımdır (Ajans'ın E4 birleştirmesi alınmadı: C-40'ın lafzı ve
  ekran yoğunluğu). Sihirbaz kuralları korunur (ilerleme görünür, ileri atlanmaz, kapalı düğmenin
  sebebi yanında, odak taşınır, hata görünen yerde). Dayanak: C-40, 00 §12.1, `sihirbaz.spec.ts`.
- **T-16 · Özel kategori E1'de, her taslakta, tek satır.** Taban kategori (müşteri kartı) kilitli çip
  olarak gelir ("Bu müşteri konut müşterisi olarak kayıtlı. Yaş ve cinsiyet seçilemez."). Altında her
  taslakta, hiçbir şık seçili gelmeden tek satır: "Bu reklam konut, iş ilanı, kredi ya da finans ürünü,
  siyasi ya da toplumsal bir konu içeriyor mu?" (Hayır / hangisi). İçerik sözlüğü (metin, site adresi,
  AI'ın cümlesi) yalnız UYARI üretir ("Metinde 'kiralık daire' geçiyor; Hayır dedin.") ve karar
  VERMEZ. Soru niyet adımının içindedir, soru ekranı sayısını artırmaz. Dayanak: C-7 §3-4, karar 4,
  hakem 2 ve 3'ün düzeltmesi.
- **T-17 · Konumun ayrı adımı yok, varsayılanı da yok.** HZ-08 doluysa "Marka Merkezi'nden: İzmir"
  etiketiyle önden gelir; boşsa `eksikler()` onu ilk adımdan listeler, sağ kart "Konum: henüz
  seçilmedi" yazar, Gözden geçir'de konum satırı düzenleme açık gelir ve düğme kapalıdır. AI işletme
  adresinden konum çıkarmaz. Görev testinde (T-22) kullanıcılar takılırsa niyet adımına "Nerede?"
  satırı eklenir [KK]. Dayanak: C-45, C-40; acemi §3.8 ve açık nokta 24.
- **T-18 · Niyet kartı "Ne alacaksın" satırı taşır;** kapalı kart yalnız kullanıcı onu düzeltebiliyorsa
  soluk ve sebepli görünür, düzeltilemiyorsa hiç görünmez; sağlık kurumu profilinde kartların yerine
  sebep ekranı. Dayanak: acemi §3.3, C-40, C-2.
- **T-19 · Bütçe adımı.** İki sekme (Günlük / Toplam), hiçbiri seçili değil, tutar boş; hazır tutar
  kartı YOK. Alanın yanında etiketli bilgiler: hesabın canlı alt sınırı, aylık bütçe kalanı ve ondan
  hesaplanmış iki seçenek (seçili değil), kendi geçmişinden kaba sonuç aralığı, `reachestimate`.
  Tutarın hemen altında **"En çok ne harcanır"** satırı (koddan: "Günlük 500 TL: bir haftada en çok
  3.500 TL, bir ayda yaklaşık 15.200 TL."). UYARI'lar (ENGEL değil, "Advetics kuralı" etiketli):
  aylık bütçenin kalanını aşan tutar; hesabın son 90 günlük günlük ortalamasının 10 katını aşan tutar.
  Havuz medyanı gösterilmez; `delivery_estimate` hiç kullanılmaz. Dayanak: C-32 [KK], C-33, risk §E4.
- **T-20 · Süre adımı.** Başlangıç "Onaydan hemen sonra" ya da tarih; toplamda bitiş zorunlu ve
  "Süresiz" kapalı, sebebi yazılı; 7 günden kısada öğrenme UYARI'sı; hesap saat dilimi ekranda.
  Dayanak: C-40, R2-O-14, R1-O-22, C-41.
- **T-21 · Kavram sayısı geçmişten.** Geçmiş yoksa 2, haftada ≥ 50 sonuçta 3, ≥ 150'de en çok 5; Acemi
  tavanı 5; eşikler "Advetics kuralı" etiketli; benzer ikinci görselde "Meta ikisini yarıştırmaz, bütçeyi
  böler." Dayanak: C-36, C-35.
- **T-22 · Beş dakika bütçesi ve görev testi.** Adım başına hedef süre tablosu (acemi §3.10) ürün
  ölçütüdür; reklam bilmeyen üç kişiyle, hazır test workspace'inde "form reklamı yayınla" görevi
  (PAUSED kalır) Aşama 3'ün çıkış koşuludur. Dayanak: acemi §3.10, §14.3.

### 1.5. Gözden geçir, yayın düğmesi, sonuç

- **T-23 · Tek "Gözden geçir" bileşeni.** Panel, AI'ın yayın kartı ve müşteri onay sayfası (salt okur
  kip) AYNI bileşeni kullanır. Bloklar: A Meta'nın gözünden (prova) · B Plan üç sütun (Senin
  seçtiklerin / Workspace ayarından / Meta'nın otomatik yaptıkları) · C Kapattıklarımız ve platformun
  dayattıkları · D Yayından sonra değişmez · E Uyum bulguları · F **Para satırı** ("En çok ne harcanır"
  tekrarı + bu ayın taahhüdü). Eksik listesi sıfırken prova kendiliğinden bir kez koşar. Dayanak:
  C-40, C-42, C-43, R2-O-41, R5-O-23; acemi §3.8.
- **T-24 · Düğme ve üstündeki cümle.** "Yayınla" · yetki yoksa "Ajans onayına gönder" · müşteri onayı
  açıksa "Müşteri onayına gönder". Düğmenin üstünde: "Basınca reklam Meta'da duraklatılmış kurulur,
  ayarları kontrol edilir ve fark yoksa açılır." Meta'nın ön kontrolü için "Onaylandı" denmez.
  Dayanak: karar 1, C-17, C-42 §5.
- **T-25 · UYARI tek tek işaretlenir.** "Okudum, sorumluluk bende"; hepsi işaretlenmeden düğme kapalı;
  işaretleyen, zaman, metin uyum raporuna yazılır; AI işaretleyemez; ENGEL'de düğme hiç yok, ajans dahil
  geçilemez. Dayanak: C-14 §5, C-19 §5, R3-O-6.
- **T-26 · Sonuç altı hâl, "kabul et ve aç" YOK.** Temiz · Beklenen normalleştirme (bilgi satırıyla
  açılır) · Fark (alan alan "Gönderdik / Meta'da duran", seçenekler "Düzelt ve yeniden kur" / "Geri al
  (arşivle)") · Doğrulanamadı ("Yeniden kontrol et") · Kısmi kurulum ("Kaldığı yerden devam" ek
  seçeneğiyle) · Sonucu belirsiz ("Yeniden dene" insan basar). Fark metnini sunucu yazar. "Arşivlenen
  kampanya yeniden açılamaz." Dayanak: C-14 [KK], C-15, C-16.

### 1.6. Derleyici ve Meta nesneleri

- **T-27 · Saf derleyici sözleşmesi.** `derle(taslakSurumu, profil, apiSurumu) → { govdeler,
  beklenenYankilar, kararKaydi, kapattiklarimiz, uyumBulgulari }`; platform çağrısı yok; tek modül
  (niyet sözlüğü + eşleme + tek hedefleme üreticisi + tek kreatif kurucu + tek form derleyici); ikinci
  üretici yasak (`goal-mapping.spec.ts` deseni taşınır); sürüm anahtarlı (varsayılan Graph v25, v26 canlı
  turda; sunucu `.env`'i v24 değil). Dayanak: C-14 §1, C-28, MEVCUT-O-12, C-10 §1, R4-O-3.
- **T-28 · Niyet kataloğu kapalı** (§2.1). İlk tur: FORM, WHATSAPP, SITE; SATIS yalnız C-39 hazırlığını
  geçen workspace'te; ONE_CIKAR yönlendirme. Sonuç etiketi `optimization_goal`'dan türer (WhatsApp'ta
  "sohbet başlatan kişi"). Dayanak: C-40 [KK], C-39, C-41, README §5.3.
- **T-29 · Yapı reçetesi.** Bir kampanya + bir reklam seti + kampanya bütçesi (CBO), 1-5 kavram aynı
  reklam setinde; `butce_seviyesi` taslakta tek açık alan ve özet/bekçi/derleyici/geri okuma bundan
  okur; ikinci reklam seti yalnız KESİN kontrol farkında ve tek soruyla (Acemi ilk turda yok); aynı
  hesapta aynı niyetle açık kampanya varsa ilk turda yalnız uyarı, "Mevcut kampanyaya fikir ekle"
  Gelişmiş'te [KK]; adlar otomatik, bekleyen PAUSED ağaçta "[Advetics: açılmadı]" öneki; her nesnede
  `adlabels` (`advetics`, `adv-yayin-<kimlik>`). Dayanak: C-31, C-36, R1-O-1..4, C-16 §6, R4-O-19.
- **T-30 · "Gönderilmeyen alan" manifestosu** acemi §5.4 tablosudur; tek "bilerek boş" satırı yerleşim
  alanlarıdır (karar 2). Manifesto tablo tabanlı testtir, desteklenen her API sürümünde koşar,
  mutasyonla doğrulanır. Dayanak: README §2, C-28, C-8, C-9, C-6, C-22, C-27.
- **T-31 · Beklenen yankı ve normalleştirme tablosu** tek sabit, API sürümüyle anahtarlı, canlı tur
  doldurur; dolana kadar ilk yayınların "fark" ile durması beklenen ve kullanıcıya bu sebeple söylenen
  davranıştır. **Kabul edilemez fark sınıfı** (hiçbir koşulda açılmaz): para (tutar, tip, başlangıç,
  bitiş), özel kategori ve kısıtları, `special_ad_category_country` (küme olarak), `optimization_goal` /
  `destination_type`, yanlış IG medyası, konum genişlemesi, yaş tabanı, hariç tutmalar,
  `attribution_spec`, form KVKK alanları, `status` (PAUSED değilse), Advetics'in açmadığı tanınan bir
  kreatif özelliğin OPT_IN dönmesi. Tanınmayan anahtarın OPT_IN dönmesi ayrı durum: "Meta tanımadığımız
  bir özelliği açtı: <anahtar>". Dayanak: C-14 §3/§7, C-28, C-6 §7; risk §10.4.
- **T-32 · Çok platform mimarisi.** Niyet kataloğu platform arayüzünden türer (`specFor` / `supports`);
  `derleMeta`, `derleGoogle`, `derleLinkedIn` ayrı; LinkedIn seviye eşlemesi Campaign Group → campaign,
  Campaign → ad_group, Creative → ad; `DRAFT_PLATFORMS`, `ASSET_PLATFORMS`, `autoBoostPlatformSchema`
  yazma kodu ve canlı doğrulama gelmeden genişletilmez; platform listeleri elle yazılmaz
  (`PLATFORM_SIRASI` dersi). Dayanak: MEVCUT-O-36, CLAUDE.md "Platform eklemenin gerçek yüzeyi".

### 1.7. Hedefleme, özel kategoriler, bütçe, atıf

- **T-33 · Advantage+ kitle.** `advantage_audience: 1` açıkça (sağlık turizmi dalında 0); `age_max`
  gönderilmez, üst yaş `age_range` ipucu; `age_min` 18 kesin (Acemi'de 18-25 arası kesin tutulabilir);
  `user_age_unknown: false` [Canlı]; kesin / ipucu iki kutu ("Meta bunların dışına çıkabilir"); "Bu
  kişilerle sınırlı kalsın mı?" sorusu YOK; "30+ kesin" isteği yalnız Gelişmiş sapmasıyla [KK]. Kitle
  şablonu taslağa KOPYA; okunamayan kitle varsayılana düşmez. Dayanak: C-8 [KK], C-9, MEVCUT-O-10.
- **T-34 · Konut kısıtları tek fonksiyon, Türkiye dahil.** Yaş 18, `age_max` yok, cinsiyet yok,
  `flexible_spec` yok, benzer/kayıtlı kitle yok, konum hariç tutma yok, alt-şehir türleri yok, yarıçap ≥
  ülke tablosu (TR 17 km, US/CA 25 km); `special_ad_category_country` hedeflenen bütün ülkelerin
  birleşimi, asla boş, asla vergi ülkesi; KKTC CY olarak eklenir ve söylenir; Meta otomatik kitleyi
  sessizce kapatırsa yayın açılır ve kartta yazar, kanıtlı retle aynı yayında bir kez 0 ile kurulur [KK].
  Gerekçe ekranda "Advetics kuralı". Dayanak: C-3 [KK], C-4, C-5, C-6, karar 4.
- **T-35 · CREDIT emekli; veri düzeltmesi ayrı aşama (0b).** Zod + `01_constraints.sql` + veri migration'ı
  aynı commit'te, kısıt önce düşer sonra kurulur, üretim sırası testte elle kurulur; kategoriye özgü kısıt
  haritası `restrictTargetingFor`'un tek setinin yerine; bugünkü yazma yolları
  `special_ad_category_country` göndermediği için yeni derleyiciye kadar konut kampanyası KURULMAZ; boost'a
  etkisi ayrıca bildirilir. Dayanak: C-7 §6/§8, C-6 §8; risk §15 Aşama 0b.
- **T-36 · Sağlık.** Sağlık kurumu / meslek mensubu profilinde Türkiye hedefli ücretli yayın ENGEL, sebep
  ekranı, ajans dahil geçilemez, "Meta onayladı" güvence diye sunulmaz [KK]; sağlık turizmi dalı
  derleyicide hazır (`advantage_audience: 0`, TR hariç, Türkçe metin ENGEL) ama hukuk görüşüne kadar
  KAPALI [KK]. Dayanak: C-2, C-1.
- **T-37 · Para.** Tek zincir: girişte float'sız micros, Meta'ya tek dönüştürücü; AI tutarı insan
  biriminde verir, çarpanı kod uygular; bütçe tipi ve tutarı hiçbir yüzde tahmin edilmez ("ayda 20
  bin" iki hesaplanmış seçeneğe dönüşür); bekçi günlük aşımı alarm saymaz, haftalık tavanla çalışır,
  bir gün 1,75 × günlüğü aşarsa arıza; düşürmede sıfır çağrılı ret yalnız ad set TOPLAM bütçesinde.
  Dayanak: MEVCUT-O-18, R5-O-10, C-33, C-34.
- **T-38 · Atıf.** Advetics'in kurduğu her reklam setinde `attribution_spec` niyet başına açıkça yazılır
  ve geri okunur; farklı ya da boş dönerse açma durur; standart pencere AJANS GENELİ tek karardır
  (`ajans_ayari.atif_standardi`) ve **karar verilene kadar yeni modül yayın yapmaz** (OK-16 ENGEL);
  "onaylanana kadar öneri değeri uygulanır" DENMEZ. Rapor farklı atıflı satırları toplamaz. Dayanak:
  C-22 §2/§3/§5 [KK]; Risk'in muğlaklığı düzeltildi.

### 1.8. Kreatif

- **T-39 · Tek dikey kaynak, Advetics türetir.** Görselden tarayıcıda deterministik 9:16 / 4:5 / 1:1
  (tek saf fonksiyon, `packages/shared`), odak noktası sürüklenir, 1,91:1 üretilmez; 4:5 ya da kare
  yüklenirse 9:16 marka rengiyle dolgulanır ve söylenir; Meta'ya tek `image_hash` + `image_crops`; PAC
  Acemi'de ve AI'da kullanılmaz. Dayanak: C-25, C-26, R6-O-6..8.
- **T-40 · AI medya beyanı.** Yüklenen her medyada tek kutu (Evet / Hayır / Bilmiyorum, sonradan
  değişmez); "Bilmiyorum" yayını kapatır; Evet'te iki takip sorusu (gerçek olmayan insan → görünür ibare
  basılır; gerçek kişinin AI kopyası → ENGEL); Advetics'in ürettiği varlıkta otomatik; `self_ai_disclosure`
  yalnız canlıda kabul edildiği görülürse gönderilir. Dayanak: C-11, R5-O-46.
- **T-41 · Advantage+ creative.** Tanınan her anahtar OPT_OUT (`pac_relaxation` dahil), `contextual_multi_ads`
  OPT_OUT; üretken özellikler hiçbir yüzde açılmaz [KK]; üretken olmayan kadraj uyarlaması yalnız
  Gelişmiş'te müşteri onayıyla ve açılırsa o reklam karar 1'in istisnası (PAUSED + önizleme + ayrı açma
  düğmesi). Dayanak: C-27 [KK], C-28.
- **T-42 · Metin ve zorunlu bilgi.** Sert sınır 1.000 karakter (Threads; sayım kod noktası ile UTF-16'nın
  büyüğü); "burada kesilir" çizgileri bilgi; zorunlu ibare ilk 125 karakterde değilse RET; zorunlu bilgi
  (fiyat, önceki fiyat ve tarih, brüt/net m², yasal uyarı, AI insanı ibaresi) yüklenen görselin içine
  güvenilerek taşınmaz, metnin başında ve gerekiyorsa görselin güvenli bandında basılır [KK]; yasal uyarı
  kutuya yazılmaz, gönderimde tek kapıdan eklenir ve önizlenir; büyük harf `toLocaleUpperCase('tr-TR')`.
  Dayanak: C-29 [KK], C-13 [KK], MEVCUT-O-29.
- **T-43 · Video.** Kırpma yok; 9:16 zorunlu, 4:5 isteğe bağlı ikinci dosya; `video_status=ready` olmadan
  kreatif kurulmaz; sohbetten video ilk sürümde "Taslağı aç, panelden yayınla" devri. Dayanak: C-25,
  C-19 §4, 00 §12.1.
- **T-44 · Önizleme iki katman.** Katman 1 Advetics'in çerçeveleri (anında), katman 2 Meta'nın
  `generatepreviews` çıktısı (provada); farklı kesiyorsa kart kırmızı. Onay kaydında ve müşteri onay
  sayfasında katman 1 PNG'leri saklanır (Meta iframe'i süreli). Dayanak: R6-O-19..22; ajans §2.5.

### 1.9. Ön koşullar, ölçüm, lead

- **T-45 · Ön koşul sırası ve üç hâl.** Sıfır çağrı → ucuz okuma → prova → yazma; her kontrol `gecti |
  kaldi | bilinmiyor`, nerede gösterildiği belli (OK-*, §2.8). **"Bilinmiyor" hiçbir zaman "geçti"
  sayılmaz; ENGEL sınıfı kontrolde "bilinmiyor" = kaldı (ekranda "Doğrulanamadı" etiketiyle), diğer
  sınıflarda düğmeyi KAPATMAZ ama ayrı "Doğrulanamadı" satırı olarak yazılır.** Bu, sağlam kurulumu bozuk
  ilan etmek ile bozuk kurulumu sağlam ilan etmek arasındaki tek denge kuralıdır. Kod 100 "does not exist"
  "silinmiş" diye okunmaz. Dayanak: README §5.4, risk §0, R4-S-1, README-S-45.
- **T-46 · SATIS kartı ölçüm kapısıyla.** Piksel paylaşılmış, `is_unavailable=false`, olay son 7 günde
  gelmiş, açılış alan adında görülmüş; sağlık/finans profilinde veri kaynağı kategorisi; geçmezse kart
  görünmez ya da uyarılı; sessizce üst huni olayına düşülmez; QUALITY_LEAD yalnız CAPI-CRM geçtiyse
  (Gelişmiş). Dayanak: C-39.
- **T-47 · Lead teslimi niyetin sözüdür.** Webhook + günlük çekim; son başarılı çekimin yaşı izlenir, 7.
  gün uyarı, 80. gün kırmızı alarm; `custom_disclaimer_responses` istenir ve rıza kanıtı saklanır; Leads
  Access Manager kısıtı ayrı `emptyReason`; AI lead kişisel verisini görmez; müşteri hesabında lead okuma
  yolu doğrulanana kadar FORM kartı kapalı ve sebepli. Dayanak: C-49, R3-O-27/29.

### 1.10. Uyum

- **T-48 · Tek saf denetçi, sürümlü katalog, uyum paketleri.** `uyumDenetle(taslakSurumu, profil,
  katalogSurumu) → Bulgu[]` (`packages/shared`); üç anda (alan bırakıldığında, provada, Yayınla'da) ve beş
  yerde (Acemi, Gelişmiş, AI kartı, kopyalama, SUNUCUDAKİ yayın servisinin son kapısı) aynı fonksiyon;
  panelde ikinci denetçi yazılmaz. Kurallar **uyum paketlerinde** (§2.7) toplanır; her kural `seviye`,
  `alan`, `mesaj`, `dayanak`, `yururlukTarihi`, `sonKontrol`, `hukukGorusu: gerekli | alindi` taşır.
  Meta'nın onayı uyum değildir. Dayanak: R3-O-4..8, C-2; risk §8.1.
- **T-49 · Değişmez uyum raporu.** Her Yayınla bir `uyum_raporu` üretir: katalog sürümü, bulgular,
  UYARI onayları (kim, ne zaman, hangi metin), profil kanıtlarının o anki değerleri; rapor değişmez,
  katalog sonradan değişirse eski rapor eski sürümle okunur. Raporu olmayan yayın yoktur (ölçüt = 0).
  Dayanak: R3-O-56, TKHK md. 61; risk §8.4.
- **T-50 · Form KVKK.** Aydınlatma adresi müşterinin HTML sayfası (https, SSRF korumalı indirme), Advetics
  adresine düşmek YASAK; Acemi ve AI'da zorunlu onay kutusu hiç yok; pazarlama izni ayrı ve işaretsiz;
  bildirim gövdesinde "onaylıyorum" yok; yasak soru sözlüğü, en çok 15 soru; form şablonu sürümlü,
  yayınlanan form değişmez. Dayanak: C-10 [KK], R3-O-22..24, C-46 [KK].

### 1.11. Yayın motoru

- **T-51 · Tek uç, tek izin.** Panel Yayınla, AI kartının onay ucu, kopya ve toplu yayın aynı sunucu
  ucundan ve `bulk.publish` ile; kontrol TIKLAYANIN tıklama anındaki yetkisi; override testi:
  `bulk.publish:false` olana panelde de sohbette de Yayınla görünmez. Dayanak: C-17 §1.
- **T-52 · Zincir sırası: form ilk.** medya → **form** (yeni form gerekiyorsa; hemen geri okunur; fark
  varsa form ARCHIVED ve başka HİÇBİR nesne kurulmaz) → kampanya → reklam seti → kreatif → reklam; hepsi
  PAUSED, hepsi etiketli. Gerekçe: form silinemeyen ve hukuki içerik taşıyan tek nesne; yanlış rıza
  metniyle lead toplama riski yetim nesne riskinden pahalı. C-16'nın geri alma kuralları (arşiv, yetim
  form listesi) aynen geçerli. Sürümlü form şablonundan kurulmuş ve sözleşmeyle karşılaştırılmış form
  yeniden kullanılırsa adım atlanır. Dayanak: C-10 §5 (seçilen), C-16 §4 (ayrışma) [KK teyit]; risk ve AI
  önerileri, hakemler.
- **T-53 · Yazma disiplini.** Her nesne için ÖNCE satıra `gonderiliyor`, SONRA POST; oluşturma çağrısında
  `fields` yok; platform çağrısı iki kısa transaction arasında (`TxRunner`); taslak başına tek aktif
  yayın (DB tekil kısmi indeks ve o durumdan çıkışı yazan yol gösterilir), reklam hesabı başına tek
  yazıcı (Redis kilidi); yayın sürerken o hesabın senkron işleri açık bayrakla ertelenir; kayıt
  yazılamazsa `kayit_belirsiz`, `failed` değil. Dayanak: R4-O-24..27, R4-O-38, CLAUDE.md.
- **T-54 · Belirsizlik ve tekillik.** `sonuc_belirsiz`: `{tür}bylabels` araması otomatik birkaç kez,
  bulunamazsa otomatik yeniden OLUŞTURMA YOK, insan "Yeniden dene"; `kayit_belirsiz`: otomatik Meta
  çağrısı yok; açmadan önce **tekillik kapısı** (etiket araması tam olarak satırdaki kimlikleri dönmeli,
  ikiz varsa açılmaz). Dayanak: C-15.
- **T-55 · Geri alma = arşiv.** `DELETED` hiçbir yolda yok; kampanya ARCHIVED; arşiv sınırı hatasında
  DELETE'e düşülmez; bekleyen PAUSED ağaç için 3. ve 7. gün hatırlatma, otomatik arşiv varsayılan kapalı
  [KK]; canlı tur ağaçları hemen arşivlenir. Dayanak: C-16.
- **T-56 · Kesiciler.** Prova kotası (yerel doğrulama önce, özet önbelleği, hesap başına 5 dk'da en çok 2,
  yayın için puan rezervi); uygulama geneli hata sayacı (son 500 çağrı) %8 uyarı, %12'de prova ve tekrar
  döngüleri kendiliğinden kapanır; **ajans geneli "Meta'ya yazmayı durdur" anahtarı** (yalnız ajans
  yöneticisi): bütün yeni yayınları ve kural motoru yazmalarını tek noktadan durdurur, sürmekte olan
  yayınlar `bekletildi`'ye geçer, sebep ekranda yazar. Dayanak: C-43, R4-O-40; risk §10.1.
- **T-57 · Tek hata sınıflandırıcı.** Kod/subcode anahtarlı tek tablo, mutasyon testli; Meta'nın
  `error_user_title` + `error_user_msg` + `blame_field_specs` ilgili alanın yanında; `PlatformApiError`
  `AllExceptionsFilter`'da kendi dalında; "Beklenmeyen bir hata oluştu" görülme sayısı ölçüt = 0;
  613/1487632 "bir saat kilitli, 15:10'da yeniden dene". Dayanak: R4-O-41..44, CLAUDE.md.
- **T-58 · Kuyruk kaybına karşı tarayıcı.** `kuruluyor` / `uzlastirma` / `aciliyor`'da X dakikadan eski
  yayın kuyruğa sorulur (`getState`, `prioritized` bekleyen sayılır); yoksa uzlaştırmayla sürdürülür.
  Bir son durum eklenirse onu sayan her yer aynı commit'te güncellenir. Dayanak: R4-O-31, CLAUDE.md
  "NİYET KAYDI", "İKİSİNİ SAYMAK".

### 1.12. AI asistanı

- **T-59 · AI aynı taslağın üçüncü yüzüdür.** Taslağa yazar; Meta gövdesi yazmaz, yalnız niyet kodu,
  kapalı sözlük değeri ve konuşmaya özel **tutamaç** seçer; sorduğu her şey panelin sorduğudur
  (`eksikler()`'den); yaratıcı içerik `ai_onerisi` rozetiyle; panelde değişiklik olursa sohbete fark
  içeren sistem mesajı düşer ve açık kart bayatlar; her an "Taslağı aç". Dayanak: R5-O-4, R5-O-27, R2-O-41/42.
- **T-60 · Sohbet durum makinesi taslakta tutulur** (§2.5); araç listesi önbellek için SABİT; duruma uymayan
  çağrı sunucuda yapılandırılmış hatayla reddedilir; eksiksiz istekte netleştirme atlanır ve istek +
  "Yayınla" = iki tur. Dayanak: R5-O-20, R5-O-26; ai §9.2.
- **T-61 · Araç yanıt sözleşmesi** (§2.6) her araçta aynı; "önce sor" kuralı istemde değil veride; sayısal
  sınırlar sunucuda Zod ile. Dayanak: R5-O-18, R5-K-37.
- **T-62 · Ajans kuralları.** Bir konuşma = bir workspace ("tüm şirketler" modunda ilk araç `musteri_coz`);
  müşteri onayı açık workspace'te model yayın kartı değil `onaya_gonder` kartı üretir; çok workspace işi
  sohbetten başlatılabilir ama çıktı `toplu` kartıdır, sohbette tek "hepsini yayınla" yok. Dayanak:
  ajans §9.3, R5-O-30/31.
- **T-63 · Sohbetten yayının açılışı.** Eval seti 40 Türkçe senaryo × 5 koşu, yasak davranış SIFIR,
  yapısal doğruluk ≥ %90 (C-19 a); sete Risk'in dört uyum tuzağı eklenir ("uyarıyı sen onayla", sağlıkta
  TR isteği, indirim uydurma, "bu konut değil" ısrarı). Bayrak workspace bazlı; ilk açılış ajansın KENDİ
  workspace'inde; müşteri workspace'lerine açılış ajans yöneticisinin workspace başına kararı, ek sayı
  şartı YOK (Ajans'ın "ilk 30 yayın" şartı gerekçesiz bulundu). Bayrak kapalıyken kart "Taslağı aç" ile
  panele gider ve sebebini yazar. Dayanak: C-19 [KK], karar 3; risk §9.5, ajans §9.4.
- **T-64 · Model ve çalışma zamanı.** Derleyici, ön koşul, uyum, kart ve yayın LLM içermez. Sohbet Sonnet
  5.5, metin/kavram önerisi Opus 5.5 (eval ile kesinleşir) [KK]; `tool_choice: auto`; geçmiş yalnız
  eklemeli ve bayt bayt geri yüklenir; güvenilmeyen metin `guvenilmeyen` alanında; dışarıya iletişim
  aracı yok; modele lead, müşteri listesi ve kişisel veri gitmez [Hukuk]. Dayanak: R5-O-35..41, ai §9.10-9.11.

### 1.13. Yayın sonrası

- **T-65 · Durum ekranı.** İlk metrik niyetin sonucu; zaman çizelgesi (Meta'ya iletildi → İncelemede →
  Öğreniyor → Yayında / Sorun var); öğrenme rozeti `learning_stage_info`'dan (SUCCESS'te sayaç gizli);
  ret `ad_review_feedback`'ten, okunamazsa "ret sebebi okunamadı"; `issues_info` SOFT_ERROR satırları;
  üst nesne duruyorsa "Sürdür" başarılı görünmez. Dayanak: C-35, C-44, R2-O-23/28, MEVCUT-O-51.
- **T-66 · Değişiklik ve dış değişiklik.** Tek saf değişiklik sınıflandırıcısı (öğrenmeyi yeniden başlatır
  / büyüklüğe bağlı / etkilemez, her sınıf Meta kaynağıyla); canlı nesneye her yazmada oku-karşılaştır-
  yaz (kart açılırken ve uygulama anında taze okuma); `activities.application_id` Advetics değilse
  "Dışarıdan değişti" rozeti ve o nesnede otomatik işlem durur [KK]. Dayanak: C-35, C-18.
- **T-67 · Yorgunluk ve yenileme.** Tetikleyici yalnız Meta'nın sinyali (sıfır uyarı "yorgunluk yok"
  değildir); `kreatif_ekle` (yeni reklam karar 1 yoluyla, eski açık) ve `kreatif_degistir` (eski kapanır);
  süresi dolan indirim uyarısı + tek tık kapatma kartı. Dayanak: C-37.
- **T-68 · Kopyala = yeni taslak.** Meta `/copies` yok; ters derleme temsil edilemeyen alanları listeler;
  özel kategori, atıf ya da bütçe seviyesiyle ilgili kayıp varsa kopya ENGEL; varsayılan "mevcut gönderiyi
  kullan". Dayanak: C-38.
- **T-69 · Rapor bağı.** Yayın kaydı rapora niyet, sonuç etiketi, birincil KPI (FORM → lead, WHATSAPP →
  `messaging_first_reply`, SITE → `landing_page_view`), proje etiketi, atıf ayarı, kurulum ve son önemli
  değişiklik tarihi verir; "kazanan" kelimesi 7 gün ve yeterli sonuçtan önce yok; "Meta terimleriyle
  dışa aktar" geri okunan hâlden (2027-02-03 öncesi). Dayanak: ajans §11.4, R6-O-34/36, C-22 §3, C-52.
- **T-70 · Öneri hattı.** İlk 7 günde yalnız arıza bildirilir; öğrenmedeki nesneye öneri yok; sinyali KOD
  üretir, AI açıklar; "Advetics'in tespiti" ile "Meta'nın önerisi" ayrı rozet; Meta `/recommendations`
  uygulanmaz; aynı tür öneri üç kez onaylanınca "kural yapalım mı", kural KAPALI doğar. Dayanak:
  R5-O-50..53, R1-O-22.

### 1.14. Ajans katmanı

- **T-71 · Roller değişmez, izinler eklenir.** `Role` enum'u (`admin`, `ad_manager`, `client_viewer`)
  değişmez; kişi = rol × şirket türü (`manager_accounts.ajans_org_id`) × izin seti (§2.4). Yeni izinler
  `PERMISSIONS` dizisine eklenir (enum değil, migration yok): `campaign.deviate`, `recipe.write`,
  `compliance.write`, `publish.halt`. Rol matrisi ekranı ve kaynak taraması aynı commit'te. Dayanak:
  ajans §12.2, CLAUDE.md "ENUM'DAN DEĞER ÇIKARIRKEN", `packages/shared/src/auth/roles.ts`.
- **T-72 · Onay zinciri.** Uyum kapısı → (müşteri onayı: workspace ayarı `zorunlu_musteri_onayi`,
  varsayılan kapalı) → (ajans ikinci göz: workspace ayarı `ajans_ikinci_goz`, varsayılan KAPALI, açılırsa
  yalnız seçilen tetikleyicilerde: ilk yayın, konut/finans) → `bulk.publish` → Yayınla. Bütün onaylar
  yayından ÖNCEKİ kapıdır, sürüme bağlıdır, karar 1'in tek adımı bozulmaz. Fark çıkarsa dördüncü bir onay
  yoktur. Dayanak: C-17 §3, karar 1; Risk'in varsayılanı açık "dört göz"ü ayıklandı [KK].
- **T-73 · Şirket admini ve müşteri onayı.** Şirket admini kendi Meta bağlantısındaki hesapta yayınlar,
  ajansın atadığı hesapta "Ajans onayına gönder" görür; karar verilene kadar bugünkü "admin = doğrudan
  yayın" sessizce sürmez, ekranda belirtilir. Müşteri onayı hesapsız, süreli, alıcı e-postasına bağlı
  bağlantıyla; onaylanan şey taslak sürümü + içerik özetidir; taslak değişince "Onay düştü: bütçe
  değişti"; yayını ajans tek tıkla yapar; bağlantıda iframe değil katman 1 PNG'leri. Dayanak: C-17 [KK],
  R2-O-49..52, R2-S-20; ajans §2.5.
- **T-74 · Yayın masası.** Satır = taslak ya da yayın; sütunlar workspace, hesap, niyet, durum grubu,
  sıradaki iş (`eksikler()`'den), kimde, ne zamandan beri, **kurulum listesi özeti** ("12 workspace'te
  form kapalı: KVKK sayfası eksik"); durum grupları §2.2'deki masa grupları; her liste "N satır
  gösteriliyor, toplam M"; boş grup "bu süzgeçte 0" der; kuyruk durumu ayrıca kuyruğa sorulur; süzgeçler
  URL'de tek üreticiden; ajans rolünde bütün workspace'ler, müşteride kendi şirketi. Dayanak: ajans §2.6,
  CLAUDE.md "sessiz kesme yok", "BAĞLANTIYI ELLE BİRLEŞTİRME".
- **T-75 · Reçete şeması dar.** Reçete sürümlü, ajans yöneticisi yayınlar; yalnız izinli alanlar: niyet
  sırası, "Önerilen" rozeti, form şablonu önerisi, kreatif rehberi, metin kalıpları (iddia kaydına bağlı),
  bütçe TİPİ önerisi (rozet; seçili gelmez). Tutar, konum, kategori düşürme ve Advantage+ sapması
  reçetenin ŞEMASINDA YOKTUR. Reçete alan doldurduğunda kaynak `recete` etiketiyle görünür. Dayanak:
  R2-O-53, README §6.5, ajans §4.2, acemi §2.4.
- **T-76 · Çok workspace'e uygula.** Kaynak reçete ya da taslak; çıktı HER hedef için ayrı taslak; hiçbir
  alan workspace'ler arasında taşınmaz, her hedefin profilinden yeniden çözülür; taşınamayanlar (özel
  kitle, `image_hash`, başka sayfanın gönderisi) listelenir; toplu iş kartı satır başına sonuç yazar
  ("8 hazır · 3 eksik · 1 ENGEL"), sessizce atlanan satır yok; toplu yayında her satır ayrı yayın kaydı,
  hesap başına tek yazıcı; tavan 25 hedef [KK]. Dayanak: ajans §4.4, R5-O-30, R4-O-39.
- **T-77 · Toplu değişiklik taze okumayla.** Bütçe, durdur/sürdür, takvim; her satırda eski değer Meta'dan
  taze okunur, göreli değişiklik taze değerden hesaplanır, uygulama anında farklıysa satır bayatlar.
  Dayanak: C-18 §1, ajans §4.5.
- **T-78 · Taahhüt muhasebesi.** Aylık bütçeden "bu ay taahhüt edilen" (açık yayınların kalan tavanları)
  düşülür; toplu yayında satır satır güncellenir; aşınca UYARI [KK]. Dayanak: C-32 (c), ajans S31.
- **T-79 · "Tüm şirketler" modunda yazma hedefin `org_id`'siyle** (`musteriOrgId`); masa yeni RLS yolu
  açmaz; `client_id` taşıyan tablolarda upsert `client_id`'yi de yazar; yayın yalnız taslağın workspace'ine
  atanmış hesaba (`assertAssigned`); havuzun iki sahibi kuralları aynen. Dayanak: CLAUDE.md.

### 1.15. Erişim, veri, doğrulama, aşamalar

- **T-80 · Meta erişimi.** Canlı tur App Review'u beklemez (ajansın kendi hesabı, rolü olan kimlik, Standard);
  müşteri hesaplarına yazma Advanced Access + Tech Provider gelene kadar kapalı ve ekranda sebepli (OK-15);
  başvuru kapsamı daraltılır, önerilen yol iptal + canlı tur + daraltılmış yeniden başvuru [KK]; Acemi'ye
  tek cümle ("Bu hesapta yayın şu an kapalı: Meta izni bekleniyor"); her çağrıda `appsecret_proof`.
  Dayanak: C-48, C-49, R4-O-5.
- **T-81 · Bağlantı modeli geçişi sıralı.** Onay → sistem kullanıcısı gölge modda (salt okuma, fark raporu)
  → video yolu ölçümü → yazma taşınır → kişisel token kapanır; kasada bağlantı türü
  (`kisisel_kullanici | sistem_kullanicisi | bisu`); aynı hesabı iki bağlantı görürse seçim kuralı testli;
  token süresi `debug_token`'dan. Dayanak: C-50 [KK], R4-O-12, R4-S-20.
- **T-82 · Veri modeli kuralları.** Varlıklar §2.9; `client_id` taşıyan her yeni tablo üç durağa girer
  (`pglite-harness` TRUNCATE, `02_rls.sql`, `WORKSPACE_TABLOLARI` kararı); hesap el değiştirince taslak ve
  yayın kayıtları (birinin KARARI) eski müşteride kalır ve sayısı söylenir; enum ekleme ayrı migration;
  süsleme alanları `LEFT JOIN`; para micros, tarih `YYYY-MM-DD` string. Dayanak: CLAUDE.md.
- **T-83 · Korunan şey davranış.** 00 §12.1'deki her canlı kazanım için kural → eski test → yeni test eşleme
  tablosu; eski dosya silinmeden önce onu tarayan testler listelenir, kural AYNI commit'te yeni teste
  taşınır; "testi sil" ile kapatmak yasak; kritik testler mutasyonla doğrulanır; kaynak taramaları
  yorumsuz kaynakta ve "gövde yakalandı" kontrolüyle; effect içindeki kararlar saf fonksiyona çıkar.
  Dayanak: C-21, CLAUDE.md Test.
- **T-84 · Canlı tur risk sırasıyla.** Önce "yanlışsa para ya da hukuk" olanlar (status, konut, form),
  sonra niyet başına dört nesne ve normalleştirme tablosu, sonra kreatif ve atıf. Her istek/yanıt
  (token'sız), başlıklar ve `fbtrace_id` tutanağa; her "[Belge]" kural "[Canlı]" olur ya da düzeltilir.
  Dayanak: risk §14.2, acemi §14.2, R4-O-59.
- **T-85 · İlk gerçek yayın prosedürü.** Ajansın kendi hesabı ve sayfası; hesap harcama limiti Ads
  Manager'dan İNSAN eliyle; en basit niyet (SITE); CBO, `lifetime_budget` hesap asgarisine yakın, bitiş 24
  saat, konum TR; ürünün göndereceği yapının aynısı; 24 saat yoklama tutanağı; TL tavanı kullanıcıdan
  [KK]. Dayanak: risk §14.3, R4-O-60, C-31.
- **T-86 · Aşamalar.** 0 ön koşul (27 Ekim öncesi) · 0b CREDIT veri düzeltmesi · 1 saf çekirdek · 2 canlı
  tur · 3 Acemi panel + Reklam hazırlığı + Reklamlarım + ilk gerçek yayın + görev testi · 4 AI (bayrak
  ajansın workspace'inde) · 5 ajans katmanı (bütün workspace'ler masası, müşteri onayı, reçete, çok
  workspace, toplu değişiklik, rapor bağı) · 6 Gelişmiş + 2. tur niyetler · 7 temizlik. Aşama 3 tek yüz
  kurar (AI'ın iki yüzü birlikte kurma kusuru ayıklandı); AI Aşama 5'e itilmez (Ajans'ın kusuru
  ayıklandı). Dayanak: acemi §15, risk §15, ajans §15, hakem gerekçeleri.

---

## 2. Paylaşılan sözlük

Bir kavramın tek adı vardır. Kod adı (ASCII, `packages/shared` Zod'u) · ekrandaki adı (iş dili, uzun
tiresiz) · sahibi olan bölüm. Bölümler bu adları değiştirmez; yeni kavram gerekiyorsa sahibi olan bölüm
tanımlar ve başka bölüm yalnız atıf yapar.

### 2.1. Niyet kataloğu (`NiyetKodu`; sahibi bölüm 06)

| Kod | README # | Ekrandaki ad (kart başlığı) | objective | optimization_goal | destination_type | promoted_object | CTA | Tur |
|---|---|---|---|---|---|---|---|---|
| `FORM` | 1 | Form doldursunlar | OUTCOME_LEADS | LEAD_GENERATION | ON_AD | page_id | SIGN_UP + `lead_gen_form_id` (kreatifte) | 1 |
| `WHATSAPP` | 2 | WhatsApp'tan yazsınlar | OUTCOME_LEADS | CONVERSATIONS | WHATSAPP | page_id | WHATSAPP_MESSAGE + `{app_destination:'WHATSAPP'}`, bağlantı `api.whatsapp.com/send` | 1 |
| `SITE` | 3 | Siteme gelsinler | OUTCOME_TRAFFIC | LANDING_PAGE_VIEWS | WEBSITE (açıkça) | — | LEARN_MORE | 1 |
| `SATIS` | 9 | Sitemden satış ya da kayıt gelsin | OUTCOME_SALES / OUTCOME_LEADS | OFFSITE_CONVERSIONS | WEBSITE | pixel_id + custom_event_type | SHOP_NOW / LEARN_MORE | 1, koşullu (OK-09) |
| `ONE_CIKAR` | 8 | Paylaşımımı öne çıkar | — (Akıllı Boost'a yönlendirme; yeni modül yazmaz) | — | — | — | — | yönlendirme |
| `IG_MESAJ` | 5 | Instagram'dan mesaj atsınlar | OUTCOME_ENGAGEMENT | CONVERSATIONS | INSTAGRAM_DIRECT | page_id | INSTAGRAM_MESSAGE | 2 |
| `ARAMA` | 7 | Beni arasınlar | OUTCOME_LEADS (ölçülürse) / OUTCOME_TRAFFIC | QUALITY_CALL | PHONE_CALL | [Canlı] | CALL_NOW | 2 [Canlı] |
| `ERISIM` | 10 | Daha çok kişi görsün | OUTCOME_AWARENESS | REACH (geri okumada IMPRESSIONS beklenir) | — | page_id | LEARN_MORE | 2 |
| `MESSENGER` | 4 | Messenger'dan yazsınlar | OUTCOME_ENGAGEMENT | CONVERSATIONS | MESSENGER | page_id | MESSAGE_PAGE | 3 |
| `COK_KANAL_MESAJ` | 6 | Nereden olursa yazsınlar | OUTCOME_ENGAGEMENT | CONVERSATIONS | MESSAGING_* | page_id | kanal başına | 3 |

Yalnız Gelişmiş: `WHATSAPP_CAGRI` (çağrı istemli WhatsApp, ENGAGEMENT), `SITE_MESAJ` (siteye + mesaj
uzantısı), `YEREL_YARICAP` (yarıçaplı yerel). Kapalı (arayüzde görünmez): profil ziyareti, Messenger lead,
etkinlik, katalog satışı, dinamik kreatif, partnership, omnichannel, uygulama içi olay. Sonuç etiketi
`optimization_goal`'dan türer. `ARAMA` ve `WHATSAPP`'ın amacı C-41'e göre; `ARAMA` canlı ölçümden önce
açılmaz.

### 2.2. Durumlar (sahibi: taslak bölüm 02, yayın bölüm 11, masa bölüm 14)

**Taslak durumu** (`TaslakDurumu`): `taslak` (eksik var) · `hazir` (eksik 0) · `onayda` (alt tür
`onay_turu: ajans | musteri | ajans_ikinci_goz`) · `yayinda` (aktif bir `yayin`'ı var; görünen durum o
yayının durumudur) · `arsivlendi`. Taslak her durumda her yüzden açılır; çıkmaz sokak yok.

**Yayın durumu** (`YayinDurumu`, tek durum makinesi):

| Kod | Grup | Ekrandaki çip | Açıklama |
|---|---|---|---|
| `on_kontrol` | yayın öncesi | Kuruluyor | yetki, kart/sürüm eşleşmesi, OK-*, uyum son kapısı, taze okuma; bayatsa taslağa döner |
| `medya` | kurulum | Kuruluyor | hash önbelleği, video hazır bekleme |
| `kuruluyor` | kurulum | Kuruluyor (3/5 nesne) | form → kampanya → reklam seti → kreatif → reklam, hepsi PAUSED |
| `sonuc_belirsiz` | belirsiz | Sonucu belirsiz | POST sonucu bilinmiyor; otomatik etiket araması, sonra insan |
| `kayit_belirsiz` | belirsiz | Sonucu belirsiz | Meta başarılı, kayıt düştü; otomatik Meta çağrısı yok |
| `uzlastirma` | kurulum | Kuruluyor | belirsizlik ya da kuyruk kaybı sonrası etiketle eşleme |
| `kurulamadi` | yarım | Yarım kaldı | zincirin bir halkası kesin düştü (kısmi kurulum) |
| `geri_okuma` | kontrol | Kontrol ediliyor | alan gruplarıyla ayrı GET'ler |
| `fark_var` | durdu | Durdu: fark var | açma yok |
| `dogrulanamadi` | durdu | Doğrulanamadı | okuma düştü / IN_PROCESS süresi doldu; açma yok |
| `tekillik_kapisi` | kontrol | Kontrol ediliyor | ikiz arama |
| `aciliyor` | açılış | Açılıyor | yukarıdan aşağı ACTIVE |
| `kismen_acik` | yarım | Yarım kaldı | bir kısmı açıldı, "kaldığı yerden aç" |
| `iletildi` | Meta'da | Meta'ya iletildi | açıldı, inceleme başlamadı |
| `incelemede` | Meta'da | İncelemede | `IN_PROCESS`, `PENDING_REVIEW` |
| `ogreniyor` | Meta'da | Öğreniyor | `learning_stage_info` |
| `yayinda` | Meta'da | Yayında | yalnız `effective_status` ACTIVE ise |
| `sorunlu` | Meta'da | Sorun var | ret, ödeme, `WITH_ISSUES`, SOFT_ERROR |
| `bekletildi` | yan | Bekletildi | kota, kesici ya da "Meta'ya yazmayı durdur"; süre/sebep ekranda |
| `durduruldu` | son | Durduruldu | kullanıcı durdurdu |
| `arsivlendi` | son | Arşivlendi | geri alma ya da kullanıcı |
| `kapali_kuruldu` | son | Google'da kapalı kuruldu | yalnız çok platformlu grupta Google satırı (C-51) |

**Geri okuma sonucu** (`GeriOkumaSonucu`): `TEMIZ` · `BEKLENEN_NORMALLESME` · `FARK` · `DOGRULANAMADI`.
**Karşılaştırma türü** (`KarsilastirmaTuru`): `esit` · `normallestir` · `alt_kume` · `meta_turetir`.

**Masa durum grupları** (`MasaGrubu`): `taslak` · `onayda` · `yayina_hazir` · `durdu_fark` (fark_var,
dogrulanamadi) · `durdu_belirsiz` (sonuc_belirsiz, kayit_belirsiz) · `yarim` (kurulamadi, kismen_acik) ·
`incelemede` · `sorun_var` · `disaridan_degisti` · `hatirlatma` (3./7. gün PAUSED ağaç) · `bekletildi`.

### 2.3. Taslak alan kaynakları (`AlanKaynagi`; sahibi bölüm 02)

| Kod | Anlamı | Ekrandaki etiket |
|---|---|---|
| `kullanici` | kullanıcı seçti ya da öneriyi kabul etti | (etiketsiz) |
| `marka_merkezi` | Reklam hazırlığı / kitle şablonundan, önceki karar | "Marka Merkezi'nden" |
| `workspace_profili` | uyum profilinden zorunlu türeyen (ör. konut tabanı) | "Bu müşteri için kayıtlı" + kilit |
| `recete` | reçetenin izinli alanından | "Reçeteden" |
| `derleyici` | Advetics kuralı (manifesto, kısıt) | "Advetics kararı" + "Neden?" |
| `ai_onerisi` | model önerdi, kullanıcı henüz kabul etmedi | "AI önerisi" rozeti |
| `meta_okumasi` | Meta'dan geri okunan değer | "Meta'da duran" |

**Yapısal alanlar** (kaynak kilidi, T-11): workspace, reklam hesabı, sayfa, IG hesabı, niyet, etkin özel
kategori, bütçe tipi, tutar, bütçe seviyesi, başlangıç, bitiş, konum, AI medya beyanı, yasal beyanlar,
form şablonu seçimi. Yaratıcı alanlar (metin, kavram) `ai_onerisi` olarak durabilir ama seçilmeden kesin
metin olmaz.

**Diğer taslak kavramları:** `kesin` / `ipucu` hedefleme kutuları · `etkin_ozel_kategori` = taban ∪ ek ·
`sapma` (Gelişmiş, gerekçe + kim + zaman) · `asil_cumle` (kullanıcının sohbetteki cümlesi, aynen) ·
`Eksik` (alan, soru tipi, seçenekler, neden) · `KararKaydi` (alan, değer, kural kimliği, gerekçe metni,
Meta kaynak bağlantısı) · `kavram` (= bir reklam).

### 2.4. Kişiler, roller ve izinler (sahibi bölüm 14)

| Kişi (ekrandaki ad) | Teknik karşılık | Özet |
|---|---|---|
| Ajans uzmanı | ajans şirketinde `ad_manager` | taslak, Gelişmiş, sapma, yayın, toplu iş |
| Hesap yöneticisi | ajans şirketinde `ad_manager` | onaya gönderir, profili doldurur; `bulk.publish` ajans tercihi [KK] |
| Ajans yöneticisi | ajans şirketinde `admin` | reçete, kural kataloğu, workspace yayın ayarları, özel kategori tabanı, "Meta'ya yazmayı durdur", atıf standardı |
| Şirket admini | müşteri şirketinde `admin` | kendi bağlantısındaki hesapta yayın; ajans hesabında onaya gönderir [KK] |
| Şirket çalışanı | müşteri şirketinde `ad_manager` | Acemi + sohbet; yetkisine göre Yayınla ya da onaya gönder |
| Müşteri izleyici | `client_viewer` | rapor ve durum salt okur; reklam oluşturma ve asistanı görmez |
| Müşteri onaylayıcı | panel hesabı yok | onay bağlantısında Onayla / Değişiklik iste (not zorunlu) |

İzinler: mevcut `bulk.read` (masa, taslak görme) · `bulk.write` (taslak yazma, onaya gönderme) ·
`bulk.publish` (her yayın yolu ve canlı nesnenin Meta'daki durum/takvim/kreatif değişikliği) ·
`budget.write` (canlı bütçe değişikliğinde `bulk.publish`'e EK) · `lead.read` · yeni:
`campaign.deviate` (Gelişmiş sapma), `recipe.write` (reçete yayınlama), `compliance.write` (uyum profili;
özel kategori tabanını değiştirmek yalnız ajans yöneticisi), `publish.halt` ("Meta'ya yazmayı durdur").
AI bir aktör değildir; hiçbir izni yoktur, kartı insan basar.

### 2.5. AI: sohbet durumları, araçlar, kartlar (sahibi bölüm 12)

**Sohbet durumu** (`SohbetDurumu`): `KESIF → NETLESTIRME → PLAN → PROVA → YAYIN_KARTI → YAYINLANIYOR →
SONUC → IZLEME`. Durum taslakta tutulur.

**Araçlar** (ASCII adlar):

| Katman | Araçlar |
|---|---|
| **O · okuma** (onay yok) | `musteri_coz`, `hesap_durumu`, `reklam_yetkisi`, `hazirlik_durumu` (HZ-*), `on_kosul_kontrol` (OK-*), `varliklari_listele(tur: sayfa\|ig\|pixel\|form\|ozel_kitle\|medya\|gonderi)`, `niyetleri_getir`, `konum_ara`, `ilgi_ara` (yalnız Gelişmiş), `marka_kurallari`, `hedefleme_ozeti`, `performans_getir`, `durum_teshis`, `ogrenme_durumu`, `degisiklik_gecmisi`, `taslaklari_listele`, `masa_ozeti`, `uyarilari_getir`, `alan_sozlugu`, `karar_gerekcesi` |
| **T · taslak** (Meta'ya yazmaz, onay yok) | `taslak_olustur`, `taslak_guncelle` (taban sürümle), `metin_oner` (≤ 3 Acemi, ≤ 5 Gelişmiş), `kavram_oner`, `medya_dogrula`, `form_taslagi`, `prova_yap`, `kopyala`, `recete_uygula`, `kural_taslagi` |
| **C · kart üretir** (insan basar) | `yayin_karti`, `onaya_gonder_karti`, `durum_degistir`, `butce_degistir`, `takvim_degistir`, `hedefleme_degistir`, `kreatif_ekle`, `kreatif_degistir`, `arsivle`, `toplu_kart`, `kural_ac` |
| **Hiç verilmez** | silme / `DELETED`, Meta `/recommendations` uygulama, Advantage+ creative açma, atıf değiştirme, hesap harcama limiti, `account_controls` yazma, özel kitle şartları, Business uçları, Meta kural motoru, dışarıya mesaj/e-posta, keyfi URL çekme, lead ve müşteri listesi okuma, sapma, UYARI onayı, fark kabulü, müşteri onayı vermek |

**Kart türleri** (`KartTuru`; çizimi panelin bileşenleri yapar, model HTML üretmez): `soru` · `niyet_secimi` ·
`yayin` (hâller `plan → prova → yayina_hazir`; gövdesi Gözden geçir bileşeni) · `onaya_gonder` ·
`degisiklik` (alt tür `durum | butce | takvim | hedefleme | kreatif_ekle | kreatif_degistir | arsivle`) ·
`toplu` · `fark` (salt gösterir; Düzelt / Geri al insan) · `sonuc` · `uyari` · `dis_degisiklik`. Her kart
taslak sürümü + içerik özeti + prova kimliğine bağlı, süreli, tek kullanımlık; kart olayları:
`gosterildi | onaylandi | reddedildi | bayatladi`.

**Araç yanıt sözleşmesi** (`AracYaniti`): `durum: basarili | basarisiz | kismi | onay_bekliyor` · `veri` ·
`eksikler[]` · `uyarilar[]` · `sonraki_adimlar[]` (`salt_okuma`, `onay_gerekir`, `zorunlu`) ·
`hata{kaynak: meta | advetics | dogrulama, kod, alt_kod, baslik, mesaj, alan, gecici_mi, ne_yapmali}` ·
`bos_neden` · `tazelik` · `guvenilmeyen`. **Tutamaç** (`ai_tutamac`): `sayfa_2` gibi konuşmaya özel ad;
yazan araçlar yalnız bu konuşmada bir okuma aracının verdiği tutamacı kabul eder.

### 2.6. Uyum (sahibi bölüm 10)

**Bulgu seviyesi**: `ENGEL` (düğme yok, kimse aşamaz) · `UYARI` (tek tek işaretlenir, AI işaretleyemez) ·
`BILGI`. **Bulgu**: kural kimliği, seviye, alan, sade Türkçe mesaj, dayanak (madde + tarih), yürürlük
tarihi, paket.

**Sektör sözlüğü** (`UyumSektoru`, kapalı, çoklu seçim; R3-O-1): `KONUT_GELISTIRICI`, `EMLAK_ARACI`,
`SAGLIK_KURULUSU`, `SAGLIK_MESLEK_MENSUBU`, `SAGLIK_TURIZMI`, `OTEL_KONAKLAMA`, `KISA_SURELI_KIRALIK`,
`SEYAHAT_ACENTASI`, `ETICARET`, `B2B_URETICI`, `YEREL_HIZMET`, `EGITIM_MEB`, `EGITIM_DIGER`, `DIGER`.

**Özel kategoriler** (`OzelKategori`): `HOUSING`, `EMPLOYMENT`, `FINANCIAL_PRODUCTS_SERVICES`,
`ISSUES_ELECTIONS_POLITICS` (CREDIT YOK; T-35).

### 2.7. Uyum paketleri (`UyumPaketi`; sahibi bölüm 10)

Paket = bir sektör ya da konu için kural kümesi; denetçi workspace'in sektörlerinden ve taslağın etkin
özel kategorisinden hangi paketlerin koşacağını türetir.

| Paket | Ne zaman koşar | Örnek kurallar |
|---|---|---|
| `GENEL` | her taslak | yaş 18 (ENGEL), AI medya beyanı ve AI insanı ibaresi, üstünlük / garanti / %100 (UYARI), kişisel nitelik kalıbı (UYARI; AI üretiminde engel), fiyat "vergiler dahil" (UYARI), indirim beyanı (yapılandırılmışta ENGEL), kayıt dışı sayı/yüzde dedektörü |
| `FORM_KVKK` | niyet FORM | aydınlatma adresi, zorunlu kutu yok, pazarlama izni ayrı ve işaretsiz, yasak soru sözlüğü, en çok 15 soru |
| `KONUT` | sektör KONUT_* ya da etkin HOUSING | konut kısıtları, yetki belgesi no + işletme adı, brüt/net m², ön ödemeli satışta ruhsat, kredi/vadede maliyet oranı (UYARI) |
| `FINANS` | etkin FINANCIAL_PRODUCTS_SERVICES | kategoriye özgü kısıt haritası, veri kaynağı kategorisi |
| `ISTIHDAM` | etkin EMPLOYMENT | kategoriye özgü kısıt haritası |
| `SAGLIK` | SAGLIK_KURULUSU / SAGLIK_MESLEK_MENSUBU ya da `DIGER`'de medikal sözlük eşleşmesi | TR hedefli ücretli yayın ENGEL (sebep ekranı) |
| `SAGLIK_TURIZMI` | SAGLIK_TURIZMI | dal kapalı [KK]; açılınca Türkçe metin ENGEL, TR hariç, ayrı hesap |
| `KONAKLAMA` | OTEL_KONAKLAMA, KISA_SURELI_KIRALIK, SEYAHAT_ACENTASI | turizm belgesi, vergiler dahil fiyat |
| `ALKOL` | TR hedefli ve alkol beyanı | görsel/metin ENGEL |
| `EGITIM_MEB` | EGITIM_MEB | veli hedefi, öğrenci adı/fotoğrafı/başarısı yok, çocuk verisi sorusu yok, kurum adı |
| `ETICARET` | ETICARET | çerez rızası beyanı (UYARI) |
| `YEREL_HIZMET` | YEREL_HIZMET | medikal sözcük sözlüğü (ikinci ağ) |

### 2.8. Kontrol listesi kimlikleri (sahibi: HZ bölüm 01, OK bölüm 09)

Her kontrol sonucu `KontrolSonucu = gecti | kaldi | bilinmiyor` + sebep + "ne yapmalı" + "kim çözer".
`sinif: ENGEL | UYARI | BILGI` T-45'teki "bilinmiyor" kuralını belirler.

**HZ: Reklam hazırlığı (workspace düzeyi, bir kez girilir, Base bölümünde)**

| Kimlik | Satır | Kapattığı |
|---|---|---|
| HZ-01 | Reklam hesabı atanmış, başka workspace'te kullanılmıyor (Meta 10.5) | her niyet |
| HZ-02 | Facebook sayfası ve Instagram hesabı eşlemesi | her niyet (IG yoksa yalnız Facebook) |
| HZ-03 | İzin üçlüsü: hesap görevi, sayfa görevi, `pages_manage_ads` | her niyet |
| HZ-04 | Hesap durumu ve ödeme yöntemi | yayın (kurulum değil) |
| HZ-05 | Uyum sektörü seçildi | reçete, paketler, özel kategori tabanı |
| HZ-06 | Sektöre özgü uyum kanıtları (yetki belgesi, ruhsat, turizm belgesi, MEB izni) | sektöre özgü niyetler |
| HZ-07 | Özel kategori tabanı (müşteri kartı) | konut/finans/istihdam dalları |
| HZ-08 | Varsayılan kitle (konum dahil) | konumun önden dolması (boşsa kart kapanmaz, konum her taslakta sorulur) |
| HZ-09 | KVKK aydınlatma sayfası + veri sorumlusu + hukuki sebep | FORM |
| HZ-10 | Form şablonu (tür, OTP, sorular, pazarlama izni metni; sürümlü) | FORM |
| HZ-11 | Lead okuma yolu doğrulandı (müşteri hesaplarında) | FORM |
| HZ-12 | Sayfaya bağlı WhatsApp numarası | WHATSAPP |
| HZ-13 | Ölçüm hazırlığı (piksel, olay, alan adı) | SATIS |
| HZ-14 | Yasal uyarı ve zorunlu ibare profili (+ yeri) | uyarılı sektörlerde yayın |
| HZ-15 | Marka kiti (renk, yazı tipi, logo, hitap sen/siz) | dolgu rengi, yazı katmanı, metin tonu |
| HZ-16 | Aylık Meta bütçesi | bütçe adımı bilgi satırı, taahhüt (kapatmaz) |
| HZ-17 | İddia kaydı (fiyat, indirim, garanti; Bilgi Bankası) | AI'ın bu türde metin yazması (kapatmaz) |

**OK: Ön koşul (reklam başına, akış açılırken ve Yayınla'da; `onKosulDenetle`)**

| Kimlik | Kontrol | Sınıf | Nerede görünür |
|---|---|---|---|
| OK-01 | Workspace'e atanmış hesap (`assertAssigned`, sıfır çağrı) | ENGEL | Kim için |
| OK-02 | Hesap tek workspace'te (10.5, sıfır çağrı) | ENGEL | Kim için |
| OK-03 | `account_status`, `disable_reason` | ENGEL | üst satır |
| OK-04 | Ödeme yöntemi, harcama limiti doluluğu | UYARI ("kurulur ama yayınlanmaz") | üst satır |
| OK-05 | İzin üçlüsü (eksik katman adıyla) | ENGEL | Kim için |
| OK-06 | IG ↔ sayfa bağı | UYARI ("yalnız Facebook'ta döner") | Kim için |
| OK-07 | Form hazır: HZ-09/10/11 + form sınırı | ENGEL | niyet kartı |
| OK-08 | WhatsApp numarası okunabildi | ENGEL | niyet kartı |
| OK-09 | SATIS ölçüm kapısı (T-46) | ENGEL (kart görünmez) | niyet kartı |
| OK-10 | Hesap minimumu (`minimum_budgets`) | ENGEL | bütçe adımı |
| OK-11 | `account_controls`, envanter filtresi | BILGI | Gözden geçir Blok C |
| OK-12 | Sayfa reklam sınırı (`ads_volume`, bütün hesaplar) | %80 UYARI, aşacaksa ENGEL | Gözden geçir |
| OK-13 | `deprecatedtargetingadsets`, özel kitle `delivery_status` / `operation_status` | ENGEL ya da UYARI | Gözden geçir |
| OK-14 | Uyum denetçisinde ENGEL yok | ENGEL | alan yanı + Blok E |
| OK-15 | Meta'ya yazma açık: "Meta'ya yazmayı durdur" kapalı, hesap türü için Meta izni var (müşteri hesabı = Advanced Access) | ENGEL | üst satır, sebepli |
| OK-16 | Ajans atıf standardı tanımlı (T-38) | ENGEL | Gözden geçir, ajans yöneticisine yönlendirme |
| OK-17 | Prova (`validate_only`, reklamda `synchronous_ad_review`) geçti | ENGEL | Blok A, Meta'nın metni alan yanında |

### 2.9. Veri modeli varlıkları (sahibi bölüm 16)

`reklam_taslagi` · `taslak_surumu` (alanlar JSONB `{deger, kaynak, kim, zaman}`, içerik özeti, eksikler,
uyum bulguları, karar kaydı) · `kavram` · `medya_varlik` · `medya_turevi` · `workspace_reklam_profili`
(HZ satırlarının verisi: sektörler, kanıtlar, KVKK, özel kategori tabanı, yasal uyarı, varsayılan kitle,
`zorunlu_musteri_onayi`, `ajans_ikinci_goz`, sohbetten yayın bayrağı) · `form_sablonu` (sürümlü) ·
`iddia_kaydi` · `recete` + `recete_surumu` · `prova` · `onay_kaydi` · `musteri_onay_istegi` · `yayin` ·
`yayin_nesnesi` · `geri_okuma` · `uyum_raporu` (değişmez) · `toplu_is` + `toplu_is_kalemi` · `hatirlatma`
· `dis_degisiklik` · `ajans_ayari` (`atif_standardi`, `meta_yazma_durduruldu` + kim/ne zaman/sebep) ·
`ai_konusma` · `ai_mesaj` · `ai_tutamac` · `ai_kart` · `oneri` · mevcut lead tablosuna `riza_kaniti`.
Mevcut `asset_platform_refs` (hesap başına `image_hash`) ve `clients.special_ad_categories` (taban)
yeniden kullanılır. Taahhüt bir tablo değil, açık yayınlardan hesaplanır.

### 2.10. Sabit ekran metinleri (bütün bölümlerde AYNI yazılır)

- Düğmeler: "Yayınla" · "Ajans onayına gönder" · "Müşteri onayına gönder" · "Düzelt ve yeniden kur" ·
  "Geri al (arşivle)" · "Kaldığı yerden devam" · "Yeniden kontrol et" · "Yeniden dene" · "Şimdi düzelt" ·
  "Taslağı aç" · "Meta'ya yazmayı durdur".
- Yayınla üstü: "Basınca reklam Meta'da duraklatılmış kurulur, ayarları kontrol edilir ve fark yoksa
  açılır."
- Prova: "Meta'nın ön kontrolü geçti, asıl inceleme yayından sonra."
- Arşiv: "Arşivlenen kampanya yeniden açılamaz."
- Konut: "Konut reklamlarında yaş ve cinsiyet seçilemez. Bu, Advetics'in Türkiye'de de uyguladığı kural."
- Bütçe: "Meta bazı günler günlük bütçenin %75'ine kadar fazlasını harcayabilir; bir haftada günlük
  bütçenin 7 katını geçmez."
- Yasak: "Beklenmeyen bir hata oluştu", "Onaylandı" (Meta ön kontrolü için), "0 sonuç" (tahmin yokken),
  uzun tire.

---

## 3. Nihai belgenin bölüm planı

18 bölüm. Her kavramın SAHİBİ tek bölümdür; diğer bölümler yalnız atıf yapar ("bkz. bölüm 11 §…").
Bölüm yazarı: (1) bu spekin §1 kararlarını ve §2 sözlüğünü değiştirmez; (2) "girdiler"deki öneri
bölümlerinden metni alır ama sözlükteki adlara çevirir; (3) her maddeye dayanak yazar (C-n / girdi
kimliği / README §); (4) Türkçe, CLAUDE.md tonunda (nedeni ve alternatifin neyi bozacağını anlatan,
somut), ekran metinleri iş dilinde ve uzun tiresiz; (5) kapsamı dışındaki konuyu yazmaz, atıf verir.

Dosyalar: `.../scratchpad/tasarim/bolum-<no>.md`.

| No | Başlık | Sahip olduğu kavramlar |
|---|---|---|
| 00 | Tez, kapsam ve kararların karşılığı | T-1..T-5; kişiler ve işler (J1-J11); Akıllı Boost sınırı |
| 01 | Bilgi mimarisi ve Reklam hazırlığı | menü/sekme/anahtar; HZ-*; `workspace_reklam_profili`'nin ekranı; "Şimdi düzelt" çekmecesi |
| 02 | Taslak modeli | `TaslakDurumu`, sürüm, `AlanKaynagi`, kaynak kilidi, `eksikler()`, `KararKaydi`, "Bu reklam ne yapacak?" kartı |
| 03 | Acemi akışı, ekran ekran | E0 (Kim için) ve beş adım; beş dakika bütçesi; "En çok ne harcanır" satırı; görev testi tarifi |
| 04 | Gözden geçir ve yayınla, sonuç ekranları | Gözden geçir bileşeni (Blok A-F), düğmeler, ilerleme ve altı sonuç hâli |
| 05 | Gelişmiş mod ve sapma | Gelişmiş ek alanları, sapma, `campaign.deviate` kullanımı |
| 06 | Derleyici, niyet kataloğu ve manifesto | `NiyetKodu`, derle() sözleşmesi, yapı reçetesi, manifesto, beklenen yankı ve normalleştirme tablosu, kabul edilemez fark sınıfı, çok platform |
| 07 | Hedefleme, özel kategoriler, bütçe ve atıf | Advantage+ kitle, kesin/ipucu, konum kuralları, konut/finans/istihdam/sağlık dalları, para zinciri, bütçe bekçisi, atıf |
| 08 | Kreatif hattı | oran türetme, `image_crops`, metin sınırları, zorunlu bilgi yeri, AI medya beyanı, kavram, Advantage+ creative, video, önizleme katmanları, saklama |
| 09 | Ön koşullar, ölçüm ve lead teslimi | OK-*, `onKosulDenetle`, "bilinmiyor" kuralı, SATIS kapısı, lead bekçisi, WhatsApp sonrası |
| 10 | Uyum katmanı | `uyumDenetle`, `UyumPaketi`, seviye, sektör sözlüğü, kural kataloğu, uyum raporu, form KVKK, 10.5/10.6.a |
| 11 | Yayın motoru ve durum makinesi | `YayinDurumu`, zincir sırası, kilitler, belirsizlik, tekillik kapısı, geri okuma işleyişi, geri alma, kesiciler ve durdurma anahtarı, prova kotası, hata sınıflandırıcı, kuyruk tarayıcısı |
| 12 | AI asistanı | `SohbetDurumu`, araçlar, `KartTuru`, `AracYaniti`, tutamaç, netleştirme, kapılar, güvenilmeyen metin, model, eval ve açılış, gözlemlenebilirlik |
| 13 | Yayın sonrası | durum ekranı, öğrenme, değişiklik sınıflandırıcısı, dış değişiklik, yorgunluk, kopyala, rapor bağı, öneri hattı |
| 14 | Ajans katmanı | kişiler/izinler, onay zinciri, müşteri onayı bağlantısı, yayın masası, reçete, çok workspace, toplu değişiklik, taahhüt |
| 15 | Erişim, kimlik ve Meta izinleri | App Review, bağlantı modeli geçişi, token, hesap sahipliği |
| 16 | Veri modeli | §2.9 varlıklarının alanları, üç durak, migration'lar, taşıma kararları |
| 17 | Doğrulama, canlı tur, yol haritası ve açık sorular | test sözleşmeleri, kural → test eşlemesi, canlı tur, ilk gerçek yayın, aşamalar, ölçütler, açık sorular |

### Bölüm 00 · Tez, kapsam ve kararların karşılığı

- **Kapsam:** (1) Bakış: "hazırlık bir kez, reklam beş dakika"; Acemi varsayılan yüz, Gelişmiş ve AI aynı
  taslağın iki başka yüzü. (2) Beş bağlayıcı kararın tasarımdaki karşılığı tablosu (karar → nasıl → bölüm
  → hüküm). (3) Kişiler tablosu (§2.4 adlarıyla) ve işler: Acemi'nin işleri (acemi §1.2) + ajansın işleri
  J1-J11 (ajans §1.2), her iş için hangi bölümün karşıladığı. (4) Acemi'nin işi OLMAYANLAR (acemi §1.3).
  (5) Başarı tanımı (T-5) ve ölçütlerin yalnız adları (sayılar bölüm 17'de). (6) Akıllı Boost sınırı
  (T-3) tam metin. (7) Okuma kılavuzu: kimlik işaretleri, [KK]/[Canlı]/[Hukuk].
- **Girdiler:** acemi §0-§1, §2.6; ajans §0-§1; ai §0; risk §0; README karar kutusu, §5.1, §7.1-7.2; C-20,
  C-21, C-40; MEVCUT-O-31; 00 §11.
- **Arayüzler:** Bütün bölümlere giriş; ölçüt sayıları 17'de; Boost'un çağrılma kuralı 06 (varsayılansız
  `advantageAudience`) ve 01 (menüde yeri) ile tutarlı.

### Bölüm 01 · Bilgi mimarisi ve Reklam hazırlığı

- **Kapsam:** (1) Menü ve sayfa: "Reklam Oluştur", sekmeler "Yeni reklam" / "Reklamlarım", yan panel
  sohbet, "Basit / Gelişmiş" anahtarı, bağlamsal girişler (rapordan "Bu kampanyadan yeni", kurulum
  listesinden "İlk reklamı kur", Akıllı Boost bağlantısı). (2) Niyet kartlarının sayfadaki yeri ve iki
  ikincil giriş ("Yapay zekâya anlat", "Önceki bir reklamdan başla"). (3) "Reklam hazırlığı" bölümü:
  HZ-01..HZ-17 her satırın verisi, kim doldurur, üç hâl, hangi kartı kapattığı, "Şimdi düzelt"
  çekmecesinin davranışı (akıştan çıkmadan, bir kez yazar). Alt gruplar: Varlıklar · Uyum · Form ·
  Kitle · Marka ve metin · Bütçe. (4) Sektör seçiminin reçete ve paketlere etkisi (yalnız atıf). (5) Boş
  hâller (`emptyReason`): "Henüz reklam yok" / "Reklam hesabı atanmamış" / "Liste alınamadı: <sebep>".
  (6) `nav-sections.spec.ts`, `marka-merkezi/bolumler.ts` uyumu.
- **Girdiler:** acemi §2.1-2.3; ajans §2.1, §2.4; risk §2.1; ai §2.1-2.2, §2.5; C-10 §3, C-40, C-45 §2, C-46,
  C-49 §2; R3-O-1/2; README §5.4; CLAUDE.md §5 "KURUMSAL KİMLİK VE BASE".
- **Arayüzler:** HZ verisinin tablo alanları 16'da; HZ → OK eşlemesi 09'da; reçete 14'te; masa bileşeni
  14'te ("Reklamlarım" yalnız onun tek workspace görünümü); kart kapanma mantığı 03'te gösterilir ama
  kontrolün kendisi 09'un.

### Bölüm 02 · Taslak modeli

- **Kapsam:** (1) Taslak nedir, nerede yaşar (Advetics'te; Meta'da PAUSED duran yarım nesne taslak
  değildir). (2) `TaslakDurumu` ve geçişleri; "çıkmaz sokak yok". (3) Sürüm ve içerik özeti; neye
  bağlanır (prova, kart, onaylar, uyum raporu), ne zaman bayatlar. (4) `AlanKaynagi` tablosu ve ekran
  etiketleri; yapısal alan listesi; kaynak kilidi ve sıfır çağrılı ret; testi (mutasyonlu). (5)
  `eksikler()` imzası, `Eksik` yapısı, dört tüketicisi (panel listesi, sohbet sorusu, düğme sebebi, masa
  "sıradaki iş"), sıralaması (yapısal önce). (6) `KararKaydi` ve "Neden?"; `karar_gerekcesi` ile ilişki.
  (7) "Bu reklam ne yapacak?" kartının üretim kuralları ve örnek cümleler. (8) Kesin/ipucu, etkin özel
  kategori, sapma, asıl cümle alanlarının taslaktaki yeri. (9) Panel ↔ sohbet eşzamanlılığı: taban sürüm,
  çakışma hatası, sistem mesajı.
- **Girdiler:** ai §2.3, §9.8, §13; risk §2.2; acemi §3.1, §13; ajans §2.2; README §5.1-5.2, §6.5; R5-O-8,
  R5-O-27, R5-S-3, R5-S-22, R2-O-42/43, R2-O-50, MEVCUT-O-30, README-S-46.
- **Arayüzler:** Derleyici (06) kaynak kilidini uygular ve `KararKaydi` üretir; 03/04 kartı ve eksik
  listesini gösterir; 12 araçları `eksikler()` ve sürümü kullanır; 14 onayları sürüme bağlar; tablo
  alanları 16'da.

### Bölüm 03 · Acemi akışı, ekran ekran

- **Kapsam:** Her ekran için aynı şablon: Sorulan · Otomatik ve söylenen · Giriş anı doğrulama · Kapalı
  hâller · Boş/hata hâlleri · Ekran metinleri. (1) Akış iskeleti ve sihirbaz kuralları. (2) E0 Kim için
  (T-8). (3) Adım 1 Niyet: kartlar ve "Ne alacaksın" satırı, özel kategori satırı (T-16, tam metin ve
  sinyal UYARI'sı), site adresi, sağlık sebep ekranı, kapalı kart hâlleri. (4) Adım 2 Medya: üç kapı,
  kavram sayısı (T-21), beyan kutusu (bölüm 08'e atıfla), boş/hata dört hâl. (5) Adım 3 Metin: "AI ile
  yaz", yasal uyarı önizlemesi, sınır çizgileri, uyum denetçisinin yazarken çıktısı. (6) Adım 4 Bütçe
  (T-19, "En çok ne harcanır" ve iki UYARI dahil). (7) Adım 5 Süre (T-20). (8) Konum davranışı (T-17)
  akış boyunca. (9) Beş dakika bütçesi tablosu (T-22). (10) Görev testi tarifi (ölçütü 17'de).
- **Girdiler:** acemi §3.1-3.7, §3.10; risk §3 (E0-E5) ve §E4 "En çok ne harcanır"; ajans §3 (E0-E4);
  ai §3 (E0-E5); C-7, C-11, C-25, C-29, C-30, C-32, C-33, C-36, C-39, C-40, C-45; R2-O-3/14/16/32,
  R6-O-1/2/46, R5-O-41/42/49, MEVCUT-O-2/3/22/34/46, MEVCUT-S-26.
- **Arayüzler:** Gözden geçir 04'te; kontrollerin kendisi 09; uyum kuralları 10; kreatif kuralları 08;
  bütçe hesapları (minimum, tavan, taahhüt) 07 ve 14; eksik listesi 02.

### Bölüm 04 · Gözden geçir ve yayınla, sonuç ekranları

- **Kapsam:** (1) Tek bileşen, üç kullanım (panel, AI `yayin` kartı, müşteri onay sayfası salt okur). (2)
  Blok A Meta'nın gözünden (prova; `targetingsentencelines`, `reachestimate` etiketi, iki katman
  önizleme, ön kontrol cümlesi, bekletme). (3) Blok B üç sütun (`AlanKaynagi`'ndan türetme kuralı; konum
  satırı; form türünün yerleşimi daraltması). (4) Blok C Kapattıklarımız ve platformun dayattıkları. (5)
  Blok D Yayından sonra değişmez. (6) Blok E Uyum bulguları ve UYARI işaretleme (T-25). (7) Blok F Para
  satırı. (8) Düğme ve üstündeki cümle (T-24), onay türüne göre düğme. (9) Yayın ilerlemesi (sunucunun
  yazdığı cümleler) ve altı sonuç hâli (T-26) tablo olarak; fark tablosunun biçimi. (10) Hata dili: Meta
  metni alan yanında.
- **Girdiler:** acemi §3.8-3.9; risk §E6-E7, §2.5; ai §E6-E7, §9.8; ajans §E5-E6; C-14, C-15, C-16, C-40,
  C-42, C-43, C-46, C-47; R2-O-19/41, R5-O-23/24/25, R6-O-19..21.
- **Arayüzler:** Durumlar ve geri okumanın işleyişi 11; kabul edilemez fark sınıfı 06; uyum bulguları
  10; AI kartının bağlanması 12; müşteri onay sayfası 14; prova kotası 11.

### Bölüm 05 · Gelişmiş mod ve sapma

- **Kapsam:** (1) Aynı taslak, ek alanlar; rozetler "Meta seçiyor" / "Sınırladın"; Acemi'ye dönüşte
  Gelişmiş alanının silinmemesi ("Gelişmiş ayar: 3"). (2) Adım adım ek alanlar tablosu: başlangıç
  (yeni / var olan kampanyaya reklam seti / var olan sete reklam / kopyala; kategori ve ülke kümesi aynı
  koşulu), niyet matrisi ve Gelişmiş niyetler, kitle, yerleşim (v26 yasak listesi), bütçe (ABO, teklif,
  COST_CAP kuralı, saat planı), kreatif (PAC kuralları, çok dilli, kadraj uyarlaması), ölçüm, test, dışa
  aktarım. (3) **Sapma** tanımı: derlenmiş gövdeden hesaplanan durum; gerekçe zorunlu; yalnız
  `campaign.deviate`; onay ekranında bedeli; beklenen `advantage_state` tablosu; AI sapma önermez ve
  uygulamaz. (4) Hesap düzeyi kontroller yalnız okunur. (5) "Meta terimleriyle dışa aktar".
- **Girdiler:** acemi §4; ai §4; risk §4; ajans §4.1; C-8, C-26, C-27, C-31, C-39, C-41, C-47, C-52;
  R2-O-1/54, R2-S-6, R4-O-54, R6-O-35..41, R1-O-5, MEVCUT-O-6/52.
- **Arayüzler:** Derleyici dalları 06/07; kadraj uyarlamasının karar 1 istisnası 11'de durum olarak;
  izin 14'te; PAC kuralları 08'de.

### Bölüm 06 · Derleyici, niyet kataloğu ve manifesto

- **Kapsam:** (1) `derle()` sözleşmesi (T-27): girdi, çıktı, saf olma, tek modül, ikinci üretici yasağı,
  sürüm anahtarı. (2) Niyet kataloğu tam tablo (§2.1) + Gelişmiş ve kapalı niyetler + sonuç etiketi
  kuralı. (3) Yapı reçetesi (T-29), adlandırma, `adlabels`. (4) Manifesto tablosu (alan · değer · neden
  açıkça · dayanak; acemi §5.4 + risk/ajans eklemeleri), "kabul edip yok sayma" listesi. (5) Beklenen
  yankı üretimi, `KarsilastirmaTuru`, normalleştirme tablosunun yapısı ve ilk satırları, kabul edilemez
  fark sınıfı (T-31). (6) Kaynak kilidi uygulaması ve sıfır çağrılı retler listesi (ai §5.10). (7)
  `KararKaydi` üretimi. (8) Çok platform mimarisi (T-32) ve platform ekleme yüzeyi.
- **Girdiler:** acemi §5.1-5.4, §10.4; ai §5.1-5.4, §5.9-5.10; risk §5.1-5.4; ajans §5.1-5.3; README §2,
  §5.3, §5.5; C-14, C-20, C-22, C-27, C-28, C-31, C-36, C-39, C-40, C-41, C-51; MEVCUT-O-12/21/36,
  R1-O-1..4/13/32/39/42/47/50, R4-O-19, README-S-1/10/11/15/18/21/24; bolumler/02, 06.
- **Arayüzler:** Hedefleme ve bütçe alanlarının değer kuralları 07; kreatif alanları 08; form derleyici
  alanları 10 (KVKK kuralları) ile ortak, sahibi 06 (gövde) / 10 (kural); geri okumanın çalıştırılması
  11; test sözleşmesi 17.

### Bölüm 07 · Hedefleme, özel kategoriler, bütçe ve atıf

- **Kapsam:** (1) Konum: zorunlu, varsayılansız, kova birleşim kuralları, tanınmayan tür, "Bütün Türkiye"
  açık seçim. (2) Advantage+ kitle ve kesin/ipucu (T-33), ekrandaki cümleler, kitle şablonu kopyası,
  özel kitle adında sağlık-finans sözcüğü ENGEL. (3) Özel kategori modeli: taban ∪ ek, kilit, düşürme
  kuralı [KK], yeniden kullanımda küme eşitliği. (4) Dallar tablosu: HOUSING (TR dahil), HOUSING +
  Meta otomatik kitleyi açmazsa, KKTC, EMPLOYMENT / FINANS kısıt haritası, sağlık kurumu, sağlık
  turizmi. (5) CREDIT emekliliği ve 0b migration kuralı (T-35). (6) Para zinciri, bütçe tipleri,
  minimum, "En çok ne harcanır" hesabının formülü, 10× geçmiş kuralı, bekçi, düşürme kuralı (T-19,
  T-37). (7) Atıf (T-38), ajans standardı, raporda karşılaştırılamaz notu.
- **Girdiler:** acemi §5.5-5.8; risk §5.5-5.7, §E4; ai §5.5-5.8; ajans §5.4-5.7; C-1..C-9, C-22, C-31..C-35,
  C-45, C-47; MEVCUT-O-10/11/18, README-S-25/26/47, R1-O-6/8/20, R2-O-2, R3-O-16, R3-S-1, R5-O-10;
  bolumler/03, 04.
- **Arayüzler:** Gövdeye yazımı 06; ekrandaki yerleri 03/04; konut kurallarının uyum paketi yüzü 10;
  taahhüt 14; geri okumadaki karşılaştırma 06/11.

### Bölüm 08 · Kreatif hattı

- **Kapsam:** (1) Giriş: üç kapı (görsel, video, paylaşılmış gönderi), biçim sihirli bayttan, HEIC/WebP
  dönüşümü. (2) Oran türetme (T-39), odak, dolgu, güvenli alan bandı, giriş eşikleri (C-30). (3) Meta'ya
  bağlama: `image_hash` hesap başına, `image_crops`, PAC kuralları (yalnız Gelişmiş). (4) Yazı katmanı
  ve zorunlu bilgi (T-42), yazı tipi ve Türkçe glif. (5) Metin: tek havuz, sınır sabit tablosu, AI
  üretim hedefleri, politika süzgeci. (6) Kavram tanımı ve AI kavram önerisinin farklılık ekseni. (7)
  AI medya beyanı (T-40). (8) Advantage+ creative (T-41). (9) Video (T-43). (10) Paylaşılmış gönderi:
  uygunluk listesi, tek medya. (11) Önizleme iki katman (T-44). (12) Saklama: orijinal ve türevler
  Advetics'te, Meta adresi saklanmaz.
- **Girdiler:** acemi §3.4-3.5, §6; ai §6; risk §6; ajans §6; C-11, C-13, C-25..C-30, C-36, C-37; R6-O-1..56,
  R6-S-6/12/22/23, R5-O-42/46/49, MEVCUT-O-27/29, MEVCUT-S-3/14; bolumler/05; CLAUDE.md "KREATİF GÖRSEL
  ADRESİ İMZALI", "`pdf-lib` YALNIZCA JPEG ve PNG".
- **Arayüzler:** Kreatif gövde alanları 06; beyan ve ibare kuralları 10; ekrandaki adımlar 03; kreatif
  ekleme/değiştirme sonrası 13; `medya_varlik` tabloları 16.

### Bölüm 09 · Ön koşullar, ölçüm ve lead teslimi

- **Kapsam:** (1) Sıra: sıfır çağrı → ucuz okuma → prova → yazma. (2) `onKosulDenetle` imzası,
  `KontrolSonucu`, `sinif` ve "bilinmiyor" kuralı (T-45) örneklerle. (3) OK-01..OK-17 tam tablo: ne
  zaman koşar, hangi Meta okuması, sonucu nerede gösterilir, kaldıysa ne yazar, kim çözer. (4) HZ → OK
  eşlemesi. (5) İzin üçlüsü teşhisi ve kod 100 tuzağı. (6) SATIS ölçüm kapısı (T-46) ve
  `conversion_domain`. (7) Lead teslimi (T-47): webhook, çekim, yaş bekçisi, rıza kanıtı, Leads Access
  Manager, İYS [KK]. (8) WhatsApp sonrası etiketleme önerisi. (9) Prova (OK-17) burada yalnız sonuç olarak;
  çalıştırılması 11.
- **Girdiler:** acemi §7; ai §7; risk §7; ajans §7; README §5.4; C-39, C-43, C-49; R4-O-43/49/52, R4-S-1,
  R6-O-33, R1-O-40/42, R3-O-27/29/51, README-S-28/29/45, MEVCUT-O-22; bolumler/08, 09.
- **Arayüzler:** HZ satırlarının ekranı 01; kartların kapanması 03; uyum denetçisi (OK-14) 10; prova
  çalıştırma 11; erişim (OK-15) 15.

### Bölüm 10 · Uyum katmanı

- **Kapsam:** (1) Üç parça: profil (verisi 01/16'da, kuralları burada), sürümlü kural kataloğu,
  `uyumDenetle`. (2) Üç an, beş yer; sunucu son kapısı. (3) Seviyeler ve kim aşar. (4) Sektör sözlüğü
  ve `UyumPaketi` tablosu: her paketin kuralları (risk §8.3 tablosu genişletilmiş), seviye, dayanak,
  yürürlük, hukuk görüşü. (5) Özel kategori sorusu ve sinyal sözlüğü (T-16'nın kural tarafı). (6)
  Form KVKK kuralları (T-50). (7) İndirim referans fiyatı, AI medya iki yükümlülük, yaş 18, alkol,
  eğitim, iddia dedektörü. (8) Uyum raporu (T-49): içerik, değişmezlik, 10.6.a dışa aktarımla ilişkisi.
  (9) Meta 10.5 / 10.6.a. (10) "Meta'nın onayı uyum değildir".
- **Girdiler:** risk §8, §0; acemi §8, §5.8; ai §8; ajans §8; C-1, C-2, C-4, C-7, C-9..C-13, C-46, C-52;
  R3-O-1..56, R3-S-1/3/5/6/19, R3-K-30/44/45, R5-O-42/43, R6-O-52; girdi-R3 `uyum_mevzuat` alanı;
  bolumler/03 (özel kategoriler).
- **Arayüzler:** Konut kısıtlarının gövde yüzü 07; ekranda gösterimi 03/04; AI kapıları 12; uyum
  raporunun tablosu 16; `compliance.write` 14.

### Bölüm 11 · Yayın motoru ve durum makinesi

- **Kapsam:** (1) Sunucu sırası: yetki → kart/sürüm eşleşmesi → OK-* → uyum son kapısı → taze okuma. (2)
  `YayinDurumu` diyagramı ve tablo (§2.2), son durumlar ve onları sayan yerler. (3) Zincir sırası (T-52)
  ve form geri okuması. (4) Yazma disiplini ve kilitler (T-53). (5) Belirsizlik, uzlaştırma, tekillik
  kapısı (T-54). (6) Geri okuma işleyişi: alan grupları, IN_PROCESS bekle-yokla, ret alanı yok;
  karşılaştırma 06'nın tablosuyla. (7) Açma yukarıdan aşağı, tekrarlanabilirlik, `kismen_acik`. (8) Geri
  alma ve hatırlatma (T-55). (9) Kesiciler, prova kotası ve "Meta'ya yazmayı durdur" (T-56). (10) Hata
  sınıflandırıcı (T-57), kota başlıkları. (11) Kuyruk tarayıcısı (T-58). (12) `execution_options` tablosu.
  (13) Çok platformda `kapali_kuruldu`.
- **Girdiler:** acemi §10; risk §10; ai §10; ajans §10; README §5.6-5.8; C-10 §5, C-14..C-16, C-18 §2, C-42,
  C-43, C-44, C-51; R4-O-22..44, R4-S-2/5/6/16/17/31; CLAUDE.md "Platform çağrısı transaction'ın İÇİNDE
  olamaz", "Kayıt yazılamazsa", "sync_jobs SATIRI", "KISMİ TEKİL İNDEKS"; bolumler/02.
- **Arayüzler:** Kullanıcıya görünen sonuç ekranları 04; beklenen yankı tablosu 06; masa grupları 14;
  `yayin`, `yayin_nesnesi`, `geri_okuma` tabloları 16; canlı tur ölçümleri 17.

### Bölüm 12 · AI asistanı

- **Kapsam:** (1) Konumu (T-59), yaptığı / yapmadığı tablosu. (2) `SohbetDurumu` ve geçişleri, reddedilen
  çağrı örnekleri. (3) Araç tablosu (§2.5) her araç için ne zaman çağrılır / çağrılmaz. (4) Tutamaç ve
  kimlik güvenliği. (5) Kapalı sözlükler (Zod, tek kaynak). (6) `AracYaniti`. (7) Netleştirme kuralları
  (yapısal önce, ≤ 4 soru demeti, "Sen karar ver" tutarı kapatmaz, konum sorusu). (8) Kartlar ve
  bayatlama, oku-karşılaştır-yaz. (9) Sunucu kapıları. (10) Ajans kuralları (T-62). (11) Güvenilmeyen
  metin. (12) Model ve çalışma zamanı (T-64), önbellek disiplini. (13) Eval seti (bileşim, yasak
  davranışlar, uyum tuzakları) ve açılış (T-63). (14) Gözlemlenebilirlik. (15) Örnek: eksiksiz istekte iki
  tur; belirsiz istekte soru demeti.
- **Girdiler:** ai §9 (tamamı), §2.6; acemi §9; risk §9; ajans §9; README §6; C-10 §6, C-14 §4, C-17 §2,
  C-18, C-19, C-45 §2, C-47 §3; R5-O-1..58, R5-K-37/38/44, R5-S-2/9/10/22/23/31; MEVCUT-O-44/46.
- **Arayüzler:** Kart gövdesi 04'ün bileşeni; `eksikler()` ve sürüm 02; yayın ucu 11; izinler 14; öneri
  hattının sinyal tarafı 13; tablolar 16; eval ölçütü 17.

### Bölüm 13 · Yayın sonrası

- **Kapsam:** (1) Durum ekranı (T-65): ilk metrik, zaman çizelgesi, öğrenme rozeti, ret, SOFT_ERROR,
  "Son önemli değişiklik", 28 gün notu. (2) Değişiklik sınıflandırıcısı ve ekrandaki cümleler (T-66).
  (3) Dış değişiklik: tespit, rozet, otomasyonun durması [KK], `degrees_of_freedom_spec`. (4) Yorgunluk
  ve yenileme (T-67). (5) Kopyala (T-68). (6) Rapor bağı (T-69), haftalık özet, `PLATFORM_SIRASI` dersi.
  (7) Öneri hattı (T-70).
- **Girdiler:** acemi §11; ai §11; risk §11; ajans §11; C-18, C-22 §3, C-24, C-35, C-37, C-38, C-44, C-52;
  R2-O-23/28, R4-O-34, R5-O-50..54, R6-O-28/34/36, R3-O-43, README §5.9, README-S-28, MEVCUT-O-51.
- **Arayüzler:** Değişiklik kartları 12; toplu değişiklik 14; yayın durumları 11; rapor modülüyle bağ
  (mevcut rapor kodu) yalnız alan sözleşmesi olarak.

### Bölüm 14 · Ajans katmanı

- **Kapsam:** (1) Kişiler ve izin matrisi (§2.4), yeni izinlerin `PERMISSIONS`'a eklenmesi, override testi.
  (2) Onay zinciri (T-72) diyagramı; workspace yayın ayarları (`zorunlu_musteri_onayi`,
  `ajans_ikinci_goz`). (3) Şirket admini kuralı ve müşteri onayı bağlantısı (T-73): süre, alıcı, marka,
  "Değişiklik iste", onayın düşmesi. (4) Yayın masası (T-74): sütunlar, gruplar, sıradaki iş, kurulum
  listesi sütunu, sayaçlar, bildirimler [KK]; "Reklamlarım" görünümü. (5) Reçete (T-75): şema, sürüm,
  ilk katalog. (6) Çok workspace'e uygula (T-76). (7) Toplu değişiklik (T-77). (8) Taahhüt muhasebesi
  (T-78). (9) "Tüm şirketler" modunda yazma ve izolasyon (T-79). (10) "Meta'ya yazmayı durdur" ve atıf
  standardının yönetim ekranı (işleyişi 11 ve 07'de).
- **Girdiler:** ajans §1-§2, §4.2-4.5, §9.3, §12.2-12.3, §16 (S26-S32); acemi §2.4-2.5; risk §2.4-2.5;
  ai §2.4, §2.6; C-7 (taban yetkisi), C-17, C-18 §1, C-32 (c), C-47; R2-O-49..53, R2-S-20, R5-O-30/31,
  R4-O-39, MEVCUT-O-35/37/44; CLAUDE.md "HAVUZUN İKİ SAHİBİ VAR", "TÜM ŞİRKETLER MODUNDA",
  `packages/shared/src/auth/roles.ts`.
- **Arayüzler:** Onay düğmeleri 04; taslak sürümü 02; yayın durumları ve kesici 11; AI'ın onaya gönder
  kartı 12; tablolar 16.

### Bölüm 15 · Erişim, kimlik ve Meta izinleri

- **Kapsam:** (1) Bugünkü durum (App Review, BV, `grant_status`). (2) Canlı turun App Review'u beklememesi
  ve ürettiği kanıt. (3) Müşteri hesaplarına yazmanın kapısı (OK-15) ve ekrandaki tek cümle. (4) Başvuru
  kapsamı [KK]. (5) Bağlantı modeli geçişi (T-81), kasada bağlantı türü, iki bağlantının aynı hesabı
  görmesi. (6) Token sağlığı (`debug_token`, izin daralması), `appsecret_proof`. (7) Hesap sahipliği ve
  havuz kurallarının yayına yansıması. (8) Denetim izi: Meta'da aktör hep ajans/sistem, "kim onayladı"
  yalnız Advetics'te.
- **Girdiler:** acemi §12; risk §12; ajans §12.1, §12.3; ai §12; C-48, C-49, C-50; R4-O-1..13, R4-K-1,
  R4-S-1/20/21; bolumler/09; CLAUDE.md "HAVUZUN İKİ SAHİBİ VAR".
- **Arayüzler:** OK-15 tanımı 09; yetki/izin (Advetics tarafı) 14; aşama 0 maddeleri 17.

### Bölüm 16 · Veri modeli

- **Kapsam:** (1) §2.9 varlıklarının her biri: amaç, ana alanlar, `client_id` / `org_id`, sürümlü mü,
  workspace taşınınca ne olur (`WORKSPACE_TABLOLARI` kararı), RLS notu. (2) Tekil kısıtlar (taslak başına
  tek aktif yayın, form şablonu sürümü) ve o durumdan çıkışı yazan yol. (3) Enum/sözlük değişiklikleri ve
  ayrı migration kuralı; CREDIT migration sırası (kısıt düşür → çevir → kur; üretim sırası testi). (4)
  Üç durak (TRUNCATE, `02_rls.sql`, `WORKSPACE_TABLOLARI`). (5) Upsert'te `client_id`; süslemelerde `LEFT
  JOIN`; `$queryRaw<T>` ve `select` disiplini. (6) Saklama süreleri [Hukuk]. (7) Mevcut tablolarla ilişki
  (`clients.special_ad_categories`, `asset_platform_refs`, lead tabloları, `audit_logs`).
- **Girdiler:** ai §13; ajans §13; acemi §13; risk §13; C-7 §6, C-21; R4-O-24, R3-O-56; MEVCUT
  `veri_modeli` alanı; 00; CLAUDE.md §3 tuzaklar (enum, RLS, upsert, INNER JOIN, include).
- **Arayüzler:** Her tablonun kavramsal sahibi ilgili bölüm (02, 10, 11, 12, 14); bu bölüm yalnız alanları
  ve veritabanı kurallarını yazar.

### Bölüm 17 · Doğrulama, canlı tur, yol haritası ve açık sorular

- **Kapsam:** (1) Test sözleşmeleri (kod gelmeden yazılır, mutasyonla sınanır): manifesto, kaynak kilidi,
  `eksikler()`, boş konum gövde üretmez, boost 0 / yeni yol 1, `status: PAUSED`, ret alanı geri okumada yok,
  kök `?ids=` yok, tek uç + `bulk.publish`, tek konut fonksiyonu, form `is_checked_by_default=false`, uyum
  raporu her yayında, durdurma anahtarı. (2) Kural → eski test → yeni test eşleme tablosu (T-83). (3)
  Canlı tur risk sırasıyla (T-84) ve tutanak biçimi. (4) İlk gerçek yayın prosedürü (T-85). (5) Acemi görev
  testi. (6) Aşamalar (T-86) ve her aşamanın çıkış ölçütü; Aşama 0 listesi (27 Ekim). (7) Ölçütler tablosu
  (Acemi, doğruluk "sıfır" listesi, ajans verimi, AI). (8) Açık sorular (bu spekin §4'ü, cevaplandıkça
  güncellenir).
- **Girdiler:** acemi §14-§16; risk §14-§16; ai §14-§16; ajans §14-§16; README §9-§10; C-21, C-23, C-48;
  R4-O-59/60, R5-O-55..57; 00 §12.1, §12.2.
- **Arayüzler:** Her bölümün test edilecek kuralları kendi bölümünde tanımlı; bu bölüm yalnız listeyi,
  sırayı ve ölçütü toplar.

---

## 4. Açık sorular

Önerilen varsayılan uygulanıyor; kullanıcı değiştirene kadar tasarım bu varsayılanla yazıldı.

### 4.1. İlk yayından önce cevaplanması ŞART olan

- **Q-1 · Atıf standardı (C-22).** (a) 7 gün tık + 1 gün görüntüleme (öneri) / (b) + 1 gün etkileşim /
  (c) yalnız 7 gün tık. Alan boş bırakılamadığı ve öneri değeri onaysız uygulanmadığı için cevap gelene
  kadar yeni modül YAYIN YAPAMAZ (OK-16).
- **Q-2 · İlk gerçek harcamanın TL tavanı, hesap ve sayfa** (T-85). Öneri: ajansın kendi hesabı ve
  sayfası, hesap asgarisine yakın tutar, 24 saat.

### 4.2. Kullanıcı kararı (hükümlerden)

| # | Soru | Önerilen varsayılan | Hüküm |
|---|---|---|---|
| Q-3 | Form zincirde nerede (C-10 "kampanyadan önce" ↔ C-16 "reklamdan hemen önce") | C-10: form ilk, geri okunur, farkta başka hiçbir şey kurulmaz; C-16'nın geri alma kuralları geçerli (T-52) | C-10, C-16 |
| Q-4 | İlk tur niyet seti | FORM, WHATSAPP, SITE + hazırsa SATIS; ONE_CIKAR Akıllı Boost'a yönlendirme | C-40, C-20 |
| Q-5 | Konut tabanlı müşteride "bu konut değil" | Taban kilitli; yalnız ajans yöneticisi müşteri kartını gerekçeyle değiştirir | C-7 |
| Q-6 | Şirket admini doğrudan yayın; müşteri onayı modeli | Kendi bağlantısında evet, ajans hesabında onaya gönder; hesapsız bağlantıyla onay, yayını ajans yapar | C-17 |
| Q-7 | Sohbetten yayın açılış eşiği | 40 × 5, yasak 0, ≥ %90; yalnız Meta; video panele; önce ajansın workspace'i, müşteride workspace başına ajans yöneticisi kararı | C-19 |
| Q-8 | Geri okumada tanımsız düşük riskli fark | Durur; "kabul et ve aç" yok | C-14 |
| Q-9 | Kısmi kurulumdan kalan PAUSED nesneler | 3./7. gün hatırlatma; otomatik arşiv yok | C-16 |
| Q-10 | Dışarıdan değişen nesnede otomasyon | Durur, "Dışarıdan değişti, onayla" kartı | C-18 |
| Q-11 | Konutta Meta otomatik kitleyi açmazsa | Açılır ve söylenir; kanıtlı retle aynı yayında bir kez 0 | C-3 |
| Q-12 | Kesin yaş > 25 / kesin cinsiyet; sapma yetkisi; hesap kontrollerine yazma; konut + marka güvenliği | Gelişmiş sapma, yalnız ajans, gerekçeli; hesap kontrolleri yalnız okunur; kampanya düzeyinde hariç tutma + rozet | C-8, C-47 |
| Q-13 | Zorunlu yasal ibarenin yeri | Metin başı + görselin güvenli bandı; hukuk görüşü | C-13, C-29 |
| Q-14 | Üretken Advantage+ creative; kadraj uyarlaması | Üretkenler hiçbir yüzde yok; kadraj yalnız Gelişmiş'te müşteri onayıyla | C-27 |
| Q-15 | Bütçe adımında havuz medyanı | Gösterilmez | C-32 |
| Q-16 | Form türü / OTP varsayılanı | Sektöre göre önden seçili, ajans onaylar | C-46 |
| Q-17 | KVKK form metinleri; İYS kaydı | Ajans hukuk danışmanının tek standart metni; liste + rıza kanıtı müşteriye, 3 iş günü sayacı panelde | C-10, C-49 |
| Q-18 | Sağlık ENGEL'i, istisna modları, Akıllı Boost'un aynı kapıya bağlanması | Ajans da aşamaz; istisna modları kapalı; boost bağlanır (karar 5'e dokunduğu için ayrı onay) | C-2, C-20 |
| Q-19 | Sağlık turizmi | Dal hazır, hukuk görüşüne kadar kapalı | C-1 |
| Q-20 | App Review başvurusu ve kapsamı | İptal, canlı tur, daraltılmış kapsamla yeniden başvuru | C-48, C-49 |
| Q-21 | Bağlantı modeli geçişi; Business Manager'da sistem kullanıcısını kim açacak | Onaydan sonra gölge mod; açacak kişi belirsiz | C-50 |
| Q-22 | Google'da tek adımlı yayın | Yalnız Meta; Google "kapalı kuruldu" | C-51 |
| Q-23 | Meta 10.6.a: ajans ücreti nerede, dışa aktarımı kim alır | 2027-02-03 öncesi karar; şimdilik dışa aktarımı yalnız ajans alır | C-52 |

### 4.3. Kullanıcı kararı (bu tasarımın kendi soruları)

| # | Soru | Önerilen varsayılan | Kaynak |
|---|---|---|---|
| Q-24 | "Ajans ikinci göz" (Risk'in "dört göz"ü) | Workspace ayarı, varsayılan KAPALI; açılırsa tetikleyiciler: workspace'in ilk yayını, konut/finans yayını | T-72, risk §2.4 |
| Q-25 | Hesap yöneticisi `bulk.publish` taşısın mı | Evet (ajans tercihi; rol matrisi ekranından kapatılabilir) | ajans S26 |
| Q-26 | Reçeteyi kim yayınlar; müşteri şirketi kendi reçetesini tutabilir mi | Yalnız ajans yöneticisi | ajans S27 |
| Q-27 | Müşteri onay bağlantısının markası ve süresi | Advetics markası (rapor PDF kuralıyla aynı); 7 gün, tek yanıt, alıcı e-postasına bağlı | ajans S28-S29 |
| Q-28 | Çok workspace'e uygulamada tavan | 25 hedef | ajans S30 |
| Q-29 | Taahhüt aylık bütçeyi aşarsa | UYARI (bütçe müşterinin kararı) | ajans S31 |
| Q-30 | Masa bildirimleri | Yalnız insan kararı gerektirenler (fark, belirsiz, yarım, ret, onay yanıtı); panel + günlük özet e-postası | ajans S32 |
| Q-31 | "Reklam hazırlığı"nı kim doldurur | Ajans ve şirket admini; özel kategori tabanı ve sektör yalnız ajans | acemi 23 |
| Q-32 | Konum boşken niyet adımında ayrı "Nerede?" satırı | Hayır (C-40 lafzı); görev testinde takılma görülürse eklenir | acemi 24, T-17 |
| Q-33 | "Mevcut kampanyaya fikir ekle" ilk turda | Yalnız uyarı; ekleme Gelişmiş'te | acemi 25, T-29 |
| Q-34 | Sohbet modeli tek mi | Sonnet 5.5; Opus yalnız eval kazandırırsa | R5-O-36 |
| Q-35 | "En çok ne harcanır" UYARI eşikleri (10× geçmiş, aylık kalan) | Bu eşikler, "Advetics kuralı" etiketli | T-19, risk §E4 |

### 4.4. Hukuk

- **Q-36** Modele giden veri ve yurt dışı aktarım (KVKK): lead, müşteri listesi ve kişisel veri gitmiyor;
  kalan metinlerin (gönderi metni, site içeriği) aktarımı değerlendirilmeli (R5 açık soru).
- **Q-37** Kart, onay kaydı ve uyum raporunun saklama süresi (R5 açık soru; TKHK md. 61 savunması).
- **Q-38** Advantage+ kitlede genişleyen kitle ile yönetmeliğin "kitlede çocuk varsa profil temelli reklam
  yok" kuralı ve kriter şeffaflığı; bugünkü önlem `age_min 18` kesin + `user_age_unknown=false` (C-9).
- **Q-39** Uyum kataloğundaki `hukukGorusu: gerekli` kuralların ilk listesi (sağlık açılış ayı, Bakanlık
  izinli yöntem, zorunlu ibare yeri, KVKK metinleri).

### 4.5. Canlı ölçüm (karar sorusu değil; ölçülmeden ilgili kural "[Belge]" kalır ve o niyet/alan Acemi'ye açılmaz)

Risk sırasıyla: (1) `status` yazılmadan / yazılarak ad set; (2) HOUSING + `TR` ile yaş ve 5 km: hata mı,
sessiz düzeltme mi; `advantage_audience 1` ve `advantage_state_info`; `special_ad_category_country` geri
dönüşü; GB kabulü; alt-şehir türleri ve yarıçap; (3) form: `is_required` gönderilmeden ve `false`,
`custom_disclaimer` üst seviye, `legal_content` sarmalayıcısı, OTP varsayılanı, test lead +
`custom_disclaimer_responses`; (4) FORM, WHATSAPP, SITE için dört nesne, `validate_only` ile gerçek kurulumun
aynılığı, normalleştirme tablosunun ilk hâli; (5) `age_range` + `age_max`, `individual_setting.geo`,
`user_age_unknown`; (6) kreatif varsayılanları (spec'siz ve hepsi OPT_OUT), `pac_relaxation`, `image_crops`
önizlemeleri, yalnız 9:16 video akışta; (7) `minimum_budgets` birimi; (8) kök `?ids=` v26 hata kodu ve batch
alt yanıtları; (9) atıf: niyet başına `attribution_spec` kabulü; (10) `bylabels` gecikmesi, 613/1487632 kilit
süresi; (11) kasıtlı hatalı kurulumda `error_user_msg` + `blame_field_specs`; (12) Threads 1.000 / 1.001
karakter; (13) pikselsiz LPV, `conversion_domain`; (14) WhatsApp LEADS vs ENGAGEMENT, ARAMA LEADS +
QUALITY_CALL; (15) `self_ai_disclosure` ve `wamo_whatsapp_identity_spec` TR hesabında; (16) sistem kullanıcısı
token'ıyla video yükleme; (17) CBO + `lifetime_budget` + 24 saat ilk gerçek yayın.
