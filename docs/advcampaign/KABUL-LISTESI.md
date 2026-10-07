# Pilot yeni motoru — KABUL LİSTESİ

> **Tarih:** 2026-10-07 · **Sahibi:** Ajan 1 (yazdı), Ajan 4 (sınar) · **Bağlı:** [`AJAN-PLANI.md`](AJAN-PLANI.md) §3
> "Ç-7 kuralları", [`MIMARI.md`](MIMARI.md).
>
> **Kural:** Ç-7 kararıyla arka plan baştan yazılıyor ama canlıda bir kez ödenmiş hatalar YENİDEN
> ÖDENMEYECEK. Aşağıdaki her madde yeni motorda (`apps/api/src/modules/pilot/`, `packages/shared/src/pilot/`)
> bir testle taşınmadan yeni motor bitmiş sayılmaz ve eski modül (`reklam/`, `strateji/`) silinmez.
>
> **Sütunlar:** *Kaynak* = kuralın bugün kilitlendiği yer (`R/` = `apps/api/src/modules/reklam`, `S/` =
> `apps/api/src/modules/strateji`, `SH/` = `packages/shared/src/reklam`, `SS/` = `packages/shared/src/strateji`,
> CLAUDE = `CLAUDE.md` "Canlıda öğrenilen platform gerçekleri" başlığı). *Taşıyan test* = yeni motorda
> hangi spec'in kilitleyeceği. **TAŞINDI** = `apps/api/src/modules/pilot/sozlesme.spec.ts` içinde bugün
> var. **YENİDEN KULLANILIR** = kural `packages/shared/src/reklam/` içindeki saf bir fonksiyonda ve yeni motor
> onu içe aktarıyor (MIMARI §1 karar M-1); taşıyan test eski spec'in ta kendisi, yeni motorun spec'i yalnız
> "çağırıyor mu" sınar (mutasyon: çağrıyı sil, test düşmeli). **AJAN 4** = test yeni motorla birlikte yazılacak.
>
> **Durum sayımı (2026-10-07):** 174 madde; "Taşıyan test" sütununun BAŞINDAKİ etikete göre TAŞINDI 36 · YENİDEN KULLANILIR 71 · AJAN 4 67 (birçok satır ikinci bir etiket de taşıyor: "+ AJAN 4").

---

## A. Para ve bütçe

| # | Kural | Kaynak | Taşıyan test |
|---|---|---|---|
| A-01 | Türkçe tutar: nokta binlik, virgül ondalık; "1.5" ve "1,500.50" belirsiz, reddedilir | `R/derleyici/para-butce.spec.ts:15,22` · `SH/para.ts#tutarAyristir` | YENİDEN KULLANILIR (plan "değiştir" elle girişi `tutarAyristir`ten geçer) |
| A-02 | Para biriminin ondalığından fazla basamak ret (TRY 2, JPY 0, KWD 3); boş/sıfır/eksi ret | `para-butce.spec.ts:27,33` | YENİDEN KULLANILIR |
| A-03 | micros → Meta en küçük birim; tam bölünmeyen micros KIRPILMAZ, hata | `para-butce.spec.ts:39,45` · `microsToMinor` | YENİDEN KULLANILIR + AJAN 4: kurulum derleyicisi `microsToMinor` çağırıyor (kaynak taraması) |
| A-04 | micros → minor → micros gidiş-dönüş tam eşit | `para-butce.spec.ts:49` | YENİDEN KULLANILIR |
| A-05 | Gösterim BigInt'ten ("1.500,50 TL"), `Number/1e6` yok | `para-butce.spec.ts:55` · `tutarGoster` | YENİDEN KULLANILIR (müşteri özeti cümlesi: TAŞINDI, `120.000,00 TL`) |
| A-06 | Meta günlük bütçede en çok = haftalık tavanlı 1,75 × günlük; toplam bütçede T | `para-butce.spec.ts:62,72,85` · `enCokHarcama` | YENİDEN KULLANILIR; Pilot Meta'yı dönem toplamıyla kuruyor → en çok = T: TAŞINDI (`müşteri özeti — Meta en çok = toplam`) |
| A-07 | Gün sayısı yaz saati geçişinde kaymaz (UTC öğlesi) | `para-butce.spec.ts:91` | AJAN 4: `planUret` takvimi Mart/Ekim geçişli dönemle |
| A-08 | Aylıktan günlüğe AŞAĞI yuvarlama | `para-butce.spec.ts:101` | TAŞINDI (`Google günlük = tutar ÷ gün`, tam birime aşağı) |
| A-09 | 10 kat bütçe uyarısı harcamasız günleri saymaz, <7 gün geçmişte koşmaz | `para-butce.spec.ts:105` · `onKatKontrolu` | AJAN 4: plan satırı geçmişin 10 katıysa ajans incelemesinde uyarı |
| A-10 | Bütçe kampanyada (CBO) kuruş dizgesi; reklam setinde bütçe alanı yok | `R/derleyici/derle.spec.ts:58` | YENİDEN KULLANILIR (`derleMeta`) |
| A-11 | Toplam bütçede bitiş yoksa BTC-02 | `derle.spec.ts:189`, `eksikler.spec.ts:33` | TAŞINDI dolaylı: Pilot takvimi her zaman bitişli; AJAN 4: `pilotTaslakEksikleri` bitişsiz toplamı reddeder |
| A-12 | Kullanıcının yazmadığı bütçe/süre yazılmaz; sayı cümlede geçmeli ("1.500 TL" = 1500) | `R/sohbet/araclar.spec.ts:79,188`, `R/ai-taslak.spec.ts:51,60` | TAŞINDI (`cümledeki sayı değişikliği karşılamalı`, `yapay zekâ metni plandaki sayıların dışında sayı getiremez`) |
| A-13 | BIGINT'i aşan tutar veritabanı taşması değil anlamlı 400 | `S/strateji-guvenlik.spec.ts:276` | AJAN 4: `/pilot/planlar/:id/degistir` 19 haneli tutar |
| A-14 | Para birimi karışık hesaplarda ret (kur çevrimi yok) | `S/strateji.service.spec.ts:97` | TAŞINDI (`karisik_birim`) |
| A-15 | Yuvarlama artığı en büyük paya; toplam TAM | `S/strateji.service.spec.ts:334` | TAŞINDI (`satırların toplamı plan toplamına TAM eşit`) |
| A-16 | Dağılım toplamı plan toplamını aşamaz | `S/sozlesme.spec.ts:65` | TAŞINDI (`toplamı aşan değişiklik reddedilir`) |
| A-17 | Öneri penceresi İstanbul takvimiyle dünden geriye 90 gün; hesap seviyesi satırlar (seviyeler toplanmaz) | `S/strateji.service.spec.ts:269,350` | AJAN 4: `planUret` girdisini kuran servis (`TOTALS_LEVEL`) |

## B. Hedefleme, konum, yaş, özel kategori

| # | Kural | Kaynak | Taşıyan test |
|---|---|---|---|
| B-01 | Boş konum gövde üretmez (KNM-01); TR yedeği yok | `R/derleyici/hedefleme.spec.ts:27` | YENİDEN KULLANILIR + TAŞINDI (`pilotTaslakEksikleri` KNM-01) |
| B-02 | `geo_locations` BİRLEŞİM: il seçilince `countries` gönderilmez; regions `{key}` | `hedefleme.spec.ts:31,36` · CLAUDE Meta | YENİDEN KULLANILIR |
| B-03 | Nokta yarıçapında `distance_unit: kilometer` açıkça | `hedefleme.spec.ts:42` | YENİDEN KULLANILIR |
| B-04 | UK → GB | `hedefleme.spec.ts:51` | YENİDEN KULLANILIR |
| B-05 | `age_max` hiç yok (65 = "65+"); `user_age_unknown` false; yaş/cinsiyet yalnız ipucu | `hedefleme.spec.ts:57`, `derle.spec.ts:152` | YENİDEN KULLANILIR |
| B-06 | En düşük yaş 18–25 dışı KTL-01 | `hedefleme.spec.ts:70` | YENİDEN KULLANILIR |
| B-07 | `advantageAudience` varsayılansız | `hedefleme.spec.ts:75` | YENİDEN KULLANILIR |
| B-08 | Etkin kategori = taban ∪ ek; taban düşürülemez | `hedefleme.spec.ts:88` | AJAN 4: `satirdanTaslak` bağlamı tabanı Marka Merkezi'nden alıyor |
| B-09 | Konutta yaş 18, cinsiyet/yaş aralığı gitmez; TR'de yarıçap ≥17 km (OZK-06) | `hedefleme.spec.ts:93,111` | YENİDEN KULLANILIR |
| B-10 | Özel kategoride ülkesi okunamayan nokta engel (OZK-04) | `hedefleme.spec.ts:121` | YENİDEN KULLANILIR |
| B-11 | Siyasi kategori kurulmaz (OZK-SIYASI) | `hedefleme.spec.ts:126` | TAŞINDI dolaylı (`pilotTaslakEksikleri` OZK-SIYASI kodu); AJAN 4 testle |
| B-12 | Konutta `special_ad_category_country` kampanyada açıkça | `derle.spec.ts:146` | YENİDEN KULLANILIR |
| B-13 | Özel kategori SORULMADIYSA yayın yok; boş dizi "Hayır" | `R/derleyici/eksikler.spec.ts:45` | TAŞINDI (`özel kategori sorulmadıysa kurulum yok`) |
| B-14 | Özel kategori modelin sorusu değil (hukuki beyan) | `R/sohbet/sozlesme.spec.ts:51` | TAŞINDI (`IZINLI_KAYNAKLAR.ozelKategoriler` yz_metin içermez; `KAYNAK` testi) |
| B-15 | Eski `CREDIT` → `FINANCIAL_PRODUCTS_SERVICES`; tanınmayan düşürülmez, ayrı söylenir | `R/hazirlik.service.spec.ts:124` | AJAN 4: Pilot hazırlık okuyucusu |
| B-16 | Konum anahtarı yalnız platformdan dönen sonuçlardan (uydurma `key` yok) | `araclar.spec.ts:95`, `dongu.spec.ts:215` | AJAN 4: konumlar YALNIZ kitle şablonundan kopya (`satirdanTaslak`), "değiştir" kutusu konum yazamaz |
| B-17 | Geri okumada konumu GENİŞLETEN yanıt fark; daraltan geçer | `R/derleyici/yanki.spec.ts:98` | YENİDEN KULLANILIR |
| B-18 | Konutta `advantage_audience` 0 dönerse bilgi; kategorisizde fark (N-06) | `yanki.spec.ts:154` | YENİDEN KULLANILIR |
| B-19 | Kategori ülkesi küme karşılaştırması | `yanki.spec.ts:141` | YENİDEN KULLANILIR |

## C. Niyet kataloğu ve Meta derleyicisi

| # | Kural | Kaynak | Taşıyan test |
|---|---|---|---|
| C-01 | Her niyet kendi katalog satırını taşır; Meta alan değeri üretilmez, katalogdan | `R/derleyici/niyetler.spec.ts:23` | YENİDEN KULLANILIR |
| C-02 | FORM: OUTCOME_LEADS, LEAD_GENERATION, ON_AD, promoted_object yalnız page_id, CTA SIGN_UP | `niyetler.spec.ts:52` | YENİDEN KULLANILIR |
| C-03 | WHATSAPP: `app_destination` WHATSAPP, numara alanı yok (sayfadan) | `niyetler.spec.ts:62` · CLAUDE Meta "click-to-WhatsApp" | YENİDEN KULLANILIR; plan WHATSAPP satırı `niyet_derlenmiyor` ile kurulmaz: TAŞINDI |
| C-04 | SITE: `destination_type` açıkça WEBSITE | `niyetler.spec.ts:69` | YENİDEN KULLANILIR |
| C-05 | "potansiyel müşteri" sözlükte yok; sonuç etiketi niyetten | `niyetler.spec.ts:75,81,90` | YENİDEN KULLANILIR |
| C-06 | Kampanya adı biçimi, saatli tarih reddi, adlabels (`advetics`, `adv-yayin-<id>`) | `niyetler.spec.ts:104-127` | YENİDEN KULLANILIR; AJAN 4: Pilot satır adı (`kitle · katman`) kampanya adına GİRER ama biçimi `kampanyaAdi`ndan |
| C-07 | Zincir sırası kampanya → set → kreatif:n → reklam:n | `derle.spec.ts:45` | YENİDEN KULLANILIR |
| C-08 | M-01: her nesne PAUSED ve "açılmadı" önekli kurulur | `derle.spec.ts:51` | YENİDEN KULLANILIR |
| C-09 | Determinizm: aynı girdi aynı bayt | `derle.spec.ts:65` | YENİDEN KULLANILIR + TAŞINDI (`planUret deterministik`) |
| C-10 | CTA her kavramda | `derle.spec.ts:69` | YENİDEN KULLANILIR |
| C-11 | FORM'da form kimliği yalnız CTA değerinde | `derle.spec.ts:77` | YENİDEN KULLANILIR |
| C-12 | Kreatif özellik anahtarları BÜYÜK HARF yedi küme; tek yanlış anahtar bütün kreatifi düşürür | `derle.spec.ts:86` · CLAUDE Meta "kreatif özellik anahtarları" | YENİDEN KULLANILIR |
| C-13 | Tanınan her Advantage+ creative anahtarı ve `contextual_multi_ads` OPT_OUT | `derle.spec.ts:93` | YENİDEN KULLANILIR |
| C-14 | Video fikri `video_data` (kapak hash'i, title, aynı CTA); FORM videosunda `lead_gen_form_id` | `derle.spec.ts:103,116` | YENİDEN KULLANILIR |
| C-15 | Manifesto beş dalda açık | `derle.spec.ts:133` | YENİDEN KULLANILIR |
| C-16 | Atıf niyet başına açıkça yazılır; standart seçilmeden yayın yok (OK-16) | `derle.spec.ts:159,179` · CLAUDE §3 "atıf/raporlama ayarları açıkça" | YENİDEN KULLANILIR; AJAN 4: plan onayı atıf seçilmemişse KURULAMAYAN_SATIR |
| C-17 | Ekran yalnız gerçekten kapattığını "kapalı" der | `derle.spec.ts:170` | YENİDEN KULLANILIR |
| C-18 | Ölçülmemiş niyet derlenmez (`DERLENEN_NIYETLER`) | `derle.spec.ts:185` | TAŞINDI (`derlenmeyen niyet satırı kurulamaz yapar`) |
| C-19 | http adres SITE-ADRES; kavramsız gövde KRT-SAYI | `derle.spec.ts:189` | TAŞINDI dolaylı (`pilotTaslakEksikleri` SITE-ADRES, KRT-SAYI); AJAN 4 test |
| C-20 | Takvim hesabın saat diliminde ofsetli (İstanbul +0300) | `R/yayin-baslat.spec.ts:137` | AJAN 4: Pilot kurulum takvimi |
| C-21 | Kapak verilmiş ama medya video değilse KRT-VIDEO | `yayin-baslat.spec.ts:187` | YENİDEN KULLANILIR |
| C-22 | Desteklenmeyen Meta sürümüyle istemci kurulmaz | `R/meta-graf.spec.ts:81` | YENİDEN KULLANILIR (istemci) |
| C-23 | `ad_accounts.external_id` `act_` önekli; önek elle eklenmez | CLAUDE §3 · `meta-graf.spec.ts:203` | YENİDEN KULLANILIR |
| C-24 | Ad set'te `destination_type` boşsa boost reddedilir (subcode 2446383) | CLAUDE Meta | YENİDEN KULLANILIR (katalog) |
| C-25 | Instagram üç kimlik uzayı; IG gönderisi `object_story_id` ile reklam olmaz | CLAUDE Meta | AJAN 4: Pilot "var olan gönderi" kullanmıyor (Tur 1); kullanırsa Akıllı Boost yolunun testleri |

## D. Form

| # | Kural | Kaynak | Taşıyan test |
|---|---|---|---|
| D-01 | Form gövdesi TR_TR, aydınlatma işletmenin adresi, hedef dışına kapalı, uç `<sayfa>/leadgen_forms` | `R/derleyici/form.spec.ts:45` | YENİDEN KULLANILIR |
| D-02 | FRM-03/04: `custom_disclaimer` üst seviyede, kutular açıkça false; nötr bildirimde "onay/kabul" yok | `form.spec.ts:63,80,84` | YENİDEN KULLANILIR |
| D-03 | FRM-01: aydınlatma adresi yok/https değil/Advetics'e ait → ret | `form.spec.ts:88` | YENİDEN KULLANILIR |
| D-04 | FRM-05/06/07/09 soru ve metin sınırları, yasak sorular | `form.spec.ts:94,100` | YENİDEN KULLANILIR |
| D-05 | Form geri okumasında kutuyu zorunlu yapmak/adres değişmesi kabul edilemez fark | `form.spec.ts:121-137` | YENİDEN KULLANILIR |
| D-06 | Form sayfa token'ıyla kurulur, okunur, arşivlenir | `meta-graf.spec.ts:101` | YENİDEN KULLANILIR |
| D-07 | FORM niyetinde form yoksa FORM-YOK | `eksikler.spec.ts:38` | TAŞINDI dolaylı (`pilotTaslakEksikleri`); AJAN 4 test |
| D-08 | Form zinciri motor seviyesinde (form önce, geri okuma, farkta başka nesne yok) — eskide TESTSİZ | `SH/meta/form.ts:5` | AJAN 4 (yeni test; eski boşluk) |

## E. Yankı, geri okuma, prova

| # | Kural | Kaynak | Taşıyan test |
|---|---|---|---|
| E-01 | Gönderilen her yaprak alana bir yankı; bütçe ve konum kabul edilemez sınıf | `yanki.spec.ts:64` | YENİDEN KULLANILIR |
| E-02 | Sayı/dizge farkı fark değil; bütçe farkı durdurur | `yanki.spec.ts:83,89` | YENİDEN KULLANILIR |
| E-03 | Kabul edilemez alan dönmezse doğrulanamadı | `yanki.spec.ts:112,206` | YENİDEN KULLANILIR |
| E-04 | Eksik adlabel fark, fazla kabul | `yanki.spec.ts:133` | YENİDEN KULLANILIR |
| E-05 | Tanınan özellik OPT_IN dönerse fark; kapatılamayan bilinen uyarlama bilgi (S-42); yasal uyarılı workspace'te `text_optimizations` durdurur | `yanki.spec.ts:167,181,194` | YENİDEN KULLANILIR |
| E-06 | "Kreatif oluştu" ≠ doğru gönderiye bağlandı; geri oku, benzeri benzerle | CLAUDE Meta | YENİDEN KULLANILIR |
| E-07 | Prova nesne açmaz; her gövde `validate_only`; retler birlikte söylenir | `yayin-baslat.spec.ts:203,215` | AJAN 4: Pilot toplu prova (satır başına) |
| E-08 | Kapsama kuralı dar (set 5xx + reklamlar geçti → geçti, notla) | `yayin-baslat.spec.ts:226,238` | YENİDEN KULLANILIR (`kapsamaUygula` taşınır) + AJAN 4 |
| E-09 | Hesap başına 5 dk'da en çok 2 prova; aşınca ertelenir, Meta'ya gidilmez | `yayin-baslat.spec.ts:267` | AJAN 4: TOPLU kurulumda N satır → kota sırası (Ö-5 ölçümü) |
| E-10 | Prova tazeliği 30 dk; bayat prova kurulumun gerekçesi değil | `yayin-baslat.spec.ts:277` · `PROVA_TAZELIK_MS` | AJAN 4 |
| E-11 | Sonuçlanmış prova değişmez; aynı sürüme ikinci bekleyen prova açılmaz | `yayin-baslat.spec.ts:286` | AJAN 4 (yeni tablo trigger'ı) |
| E-12 | Prova gövdesi satır içi spec, GERÇEK hash, `execution_options` uç başına izinli küme | `yayin-baslat.spec.ts:294`, `meta-graf.spec.ts:157` · `prova.ts` | YENİDEN KULLANILIR |
| E-13 | Prova kimlik döndürürse geçti sayılmaz | `meta-graf.spec.ts:168` | YENİDEN KULLANILIR |
| E-14 | Eksik varken prova başlamaz (kota boşa gitmez) | `araclar.spec.ts:147` | AJAN 4: `pilotTaslakEksikleri` doluysa satır `taslak`ta kalır, prova çağrısı yok |

## F. Yayın motoru ve kurulum durum makinesi

| # | Kural | Kaynak | Taşıyan test |
|---|---|---|---|
| F-01 | PAUSED kur → geri oku → yukarıdan aşağı aç → öneki kaldır | `R/yayin-motoru.spec.ts:133` | AJAN 4 (`KURULUM_GECISLERI` `kuruluyor → geri_okundu_ayni → aciliyor`) |
| F-02 | Test kipi açmaz, arşivler | `yayin-motoru.spec.ts:151` | TAŞINDI kip kararı (`uyum bağlı değilse gerçek yayın YOK`); AJAN 4 motor |
| F-03 | Video işlenene kadar beklenir; 15 dk / "expired" ayrı hâl | `yayin-motoru.spec.ts:164-186`, `meta-graf.spec.ts:58,66` | AJAN 4 |
| F-04 | Kesin ret: kurulamadı, sonraki halkalar kurulmaz | `yayin-motoru.spec.ts:196` | AJAN 4 |
| F-05 | Belirsiz sonuç: uzlaştırma (etiketle ara), ikinci POST YOK | `yayin-motoru.spec.ts:206-223` | AJAN 4 |
| F-06 | Meta başarılı ama kayıt düştü → `kayit_belirsiz`, yeniden denenmez | `yayin-motoru.spec.ts:231` · CLAUDE §3 "creating kalmalı" | TAŞINDI (`kayıt belirsizse yeniden kurulum yok`) + AJAN 4 motor |
| F-07 | Tekillik kapısı ikiz kampanya görürse açmaz | `yayin-motoru.spec.ts:270` | AJAN 4 |
| F-08 | Açma yarıda → kısmen açık; ACTIVE okunursa açılmış | `yayin-motoru.spec.ts:280` | AJAN 4 |
| F-09 | Taslak/satır başına tek aktif kurulum (unique + ön kontrol) | `yayin-motoru.spec.ts:367` | AJAN 4 (`pilot_kurulum_satirlari` tekil anahtarı) |
| F-10 | Geçiş tablosu dışı geçiş FIRLATIR; sonlandıran her durum ulaşılabilir | `yayin-motoru.spec.ts:379,390` | TAŞINDI (`kurulum: son olmayan her durumun çıkışı var`) + AJAN 4 |
| F-11 | CHECK listeleri shared sabitleriyle aynı | `yayin-motoru.spec.ts:396`, `taslak.service.spec.ts:169` | AJAN 4 (`PILOT_PLAN_DURUMLARI`, `KURULUM_SATIR_DURUMLARI`, `ONERI_DURUMLARI` ↔ migration) |
| F-12 | Meta'ya yazan çağrılar yalnız kapılı sarmalayıcıda; DELETED hiçbir yolda yok | `yayin-motoru.spec.ts:430,440` | AJAN 4 (kaynak taraması, yorumsuz kaynakta) |
| F-13 | Hata sınıflandırma: ağ/5xx/kod 1-2/is_transient belirsiz, doğrulama kesin | `meta-graf.spec.ts:41,50,111,119` | YENİDEN KULLANILIR |
| F-14 | Başka hesap için kurulmuş istemci reddeder; token Meta dışına taşınmaz | `meta-graf.spec.ts:124,141` | YENİDEN KULLANILIR |
| F-15 | `image_hash` hesap başına (`asset_platform_refs`) | `meta-graf.spec.ts:147,230` · CLAUDE §3 | YENİDEN KULLANILIR |
| F-16 | `success:false` başarı değil | `meta-graf.spec.ts:173` | YENİDEN KULLANILIR |
| F-17 | Başka workspace'e geçmiş hesapta / aktif olmayan bağlantıda yazma yok | `meta-graf.spec.ts:203-215` | YENİDEN KULLANILIR + AJAN 4 |
| F-18 | Hesap yazıcı kilidi doluysa ertele | `yayin-baslat.spec.ts:164` | AJAN 4 (toplu kurulumda AYNI hesaba N satır: sıra) |
| F-19 | Bağlantı `needs_reauth` ise ön kontrolde sebebiyle | `yayin-baslat.spec.ts:173` | AJAN 4 |
| F-20 | Platform çağrısı transaction İÇİNDE olamaz (5 sn sınırı) | CLAUDE §3 | AJAN 4 (kaynak taraması: `withTenant` içinde provider çağrısı yok) |
| F-21 | `PlatformApiError` kendi dalında; "Beklenmeyen bir hata" yok, platform mesajı ekranda | CLAUDE §3 | AJAN 4 (`KurulumSatiri.platformMesaji`, `OneriKarti.platformMesaji`) |
| F-22 | Kuyruk önceliği bariyer değil; bağımlı iş zincirle | CLAUDE §3 | AJAN 4 (kurulum işi provadan SONRA zincirlenir) |
| F-23 | `sync_jobs` niyet kaydı ≠ kuyruk; takılan parti `kuyruktaMi` ile | CLAUDE §3 | AJAN 4 (kurulum ve tarama işleri) |
| F-24 | Bir durum enum'undan bazılarını saymak kalıcı açık bırakır | CLAUDE §3 | TAŞINDI (`sayım bütün son durumları kapsar`) |
| F-25 | Kısmi tekil indeks + çıkışsız durum = kalıcı kilit | CLAUDE §3 | TAŞINDI (plan, kurulum, öneri durum makineleri; `kapat` çıkışı mutasyonla) |

## G. Onay, yazma kapısı, test kipi

| # | Kural | Kaynak | Taşıyan test |
|---|---|---|---|
| G-01 | Gerçek yayın uyum denetçisi bağlanmadan YOK; kart sebebini yazar | `R/sohbet/onay.spec.ts:36`, `yayin-baslat.spec.ts:103` | TAŞINDI (`uyum bağlı değilse gerçek yayın YOK`, `denetim yoksa geçti DEĞİL`) |
| G-02 | Test kipi yalnız ajans yöneticisi + ajansın KENDİ şirketi (eskide ikinci yarısı TESTSİZ) | `yayin-baslat.spec.ts:121` · `yayin-baslat.ts:113` | TAŞINDI (`yayinKipi`: müşteri şirketinde `kapali`) |
| G-03 | Eksik/geçmemiş prova varken düğme yok | `onay.spec.ts:49` | AJAN 4 (kurulum ekranı) |
| G-04 | Meta yazma kapısı kapalıysa sebebi ekranda; okunamazsa KAPALI; ajansın durdurması bağlı şirketlerde geçerli | `onay.spec.ts:56`, `yayin-motoru.spec.ts:337` · `yazma-kapisi.ts` | YENİDEN KULLANILIR (`metaYazmaAcikMi`) + AJAN 4: kurulum işçisi her POST'tan önce sorar |
| G-05 | Kurulum ortasında kapı basılırsa bir sonraki POST'tan önce durur; devam elle | `yayin-motoru.spec.ts:301,324` | AJAN 4 |
| G-06 | Onay tek kullanımlık; aynı sürüm ikinci kez onaylanamaz | `onay.spec.ts:142`, `tablolar.spec.ts:104` | AJAN 4 (`pilot_planlari.onaylanan_surum` + `FOR UPDATE`) |
| G-07 | Onaydan sonra içerik değiştiyse onay reddedilir (bayat) | `onay.spec.ts:150` | TAŞINDI (`sürüm ya da içerik özeti farklıysa ret`) |
| G-08 | Kartta/akışta olmayan eylem doğrudan istekle yapılamaz | `onay.spec.ts:157` | AJAN 4 (`/eylem` ucu müşteri rolünde `onayla`yı kabul etmez) |
| G-09 | Kart özeti saklanıp onayda KARŞILAŞTIRILMALI (eskide yalnız sürüm no; TESTSİZ boşluk) | `onay.service.ts:159` | TAŞINDI (mutasyon M7: özet karşılaştırması silinince test düştü) |
| G-10 | Sonuçlanmış onay ve içerik değişmez (trigger); onaylandi CHECK'i onaylayan+zaman ister | `tablolar.spec.ts:113,120` | AJAN 4 (`pilot_plan_surumleri` trigger, `pilot_planlari` CHECK) |
| G-11 | Kanonik özet: kim/zaman girmez, anahtar sırası değiştirmez; kaynak değişince özet değişir | `eksikler.spec.ts:65,72` | TAŞINDI (`içerik özetine kaynak zamanı girmez, kaynak türü girer`) |
| G-12 | Yapay zekâ önerisi kabul edilmeden yapısal alan derlenmez (KAYNAK kilidi) | `ai-taslak.spec.ts:87,173` | TAŞINDI (`bütçenin kaynağı yapay zekâ olamaz`) |
| G-13 | Atıf standardını yalnız yönetici seçer; seçim denetime yazılır; anahtar atıfı silmez | `R/ajans-ayari.service.spec.ts:31-59` | YENİDEN KULLANILIR (`ajans_ayari`) |
| G-14 | Sebepsiz durdurma veritabanında reddedilir | `yayin-motoru.spec.ts:357` | YENİDEN KULLANILIR |
| G-15 | Plan onayında müşteri ile "ajans müşteri adına" ayrı kaydedilir ve ayrı yazılır | `S/strateji.service.spec.ts:221` | TAŞINDI (`ajans müşteri adına gerekçesiz onaylayamaz`) + AJAN 4 (`onay_rolu`) |

## H. Yapay zekâ ve sohbet

| # | Kural | Kaynak | Taşıyan test |
|---|---|---|---|
| H-01 | Model bütçe/süre/konum/kategori UYDURAMAZ (`VARSAYILANSIZ_ALANLAR`; eskide yalnız dolaylı test) | `SH/sohbet/soru.ts:44` | TAŞINDI (sayısal hücrede `yz_metin` reddi; `yzMetniDenetle`) |
| H-02 | Adres Marka Merkezi'nde ya da kullanıcının cümlesinde yoksa uydurulamaz | `araclar.spec.ts:103`, `ai-taslak.spec.ts:65` | AJAN 4 (`satirdanTaslak` adresi yalnız bağlamdan; "değiştir" adres yazamaz) |
| H-03 | Durum kelimesi süzgeci ("yayında", "kuruldu" yalnız sunucunun cümlesinde) | `sozlesme.spec.ts:159`, `dongu.spec.ts:163` | AJAN 4 (Pilot gerekçe paragrafı ve öneri açıklaması) |
| H-04 | Eski sürüme göre yazım SURUM_ESKI | `araclar.spec.ts:109` | AJAN 4 (`/degistir` 409) |
| H-05 | Başka workspace'in hesabı/medyası yazılamaz | `araclar.spec.ts:116`, `dongu.spec.ts:185` | AJAN 4 (izolasyon) |
| H-06 | Bilinmeyen araç / şema dışı girdi reddedilir | `araclar.spec.ts:134` | AJAN 4 (`planDegistirSchema` strict) |
| H-07 | Konum araması "eşleşme yok" ile "çağrı düştü"yü ayrı döndürür | `araclar.spec.ts:140` | AJAN 4 (dört hâl kuralı) |
| H-08 | Araç katmanı yayın başlatamaz | `araclar.spec.ts:182` | TAŞINDI (`ajansın yayın düğmesi yok — kurulumu yalnız worker başlatır`) |
| H-09 | Kota doluysa model çağrılmaz; tur başına adım sınırı; aynı araç aynı girdiyle iki kez yok | `dongu.spec.ts:108-131` · `sinirlar.ts` | AJAN 4 ("değiştir" kutusu ve plan gerekçesi Gemini çağrısı) |
| H-10 | Model düşerse "hata" ile kapanır; ret ≠ kesilme ≠ boş | `dongu.spec.ts:140,147` | AJAN 4 (gerekçe yazılamazsa `ozetMetni` boş + `yz_yazmadi`; plan yine üretilir) |
| H-11 | Düşünce imzası geçmişte aynen; cevapsız yarım tur atılır | `dongu.spec.ts:193,202` | YENİDEN KULLANILIR (`apps/api/src/yapay-zeka/gemini.ts`) |
| H-12 | Yapay zekâ başlık kısaltma / yasal uyarı ekleme / görsel atlamayı söyler | `ai-taslak.spec.ts:75` | AJAN 4 (metin üretimi) |
| H-13 | Medya girişte denetlenir: oran, biçim, boyut; WebP/GIF/<600 px ret | `sozlesme.spec.ts:170-185`, `ai-taslak.spec.ts:107-137` | YENİDEN KULLANILIR (`gorsel-yukle.ts`) |
| H-14 | Aynı görsel ikinci kez yeni satır açmaz | `ai-taslak.spec.ts:183` | YENİDEN KULLANILIR |

## I. Plan (eski AdvStrategy kuralları)

| # | Kural | Kaynak | Taşıyan test |
|---|---|---|---|
| I-01 | Son olmayan her plan durumunun çıkışı var | `S/sozlesme.spec.ts:33` | TAŞINDI |
| I-02 | Yalnız taslak düzenlenir; onaydaki plan değişmez | `S/sozlesme.spec.ts:53`, `strateji.service.spec.ts:204` | TAŞINDI |
| I-03 | Aynı ay için ikinci açık plan 409; iptal edilen ay yeniden açılır (kısmi tekil indeks) | `strateji.service.spec.ts:112,120` | AJAN 4 (`pilot_planlari` indeksi) |
| I-04 | Bayat sürümle yazım 409; yazım sürümü artırır | `strateji.service.spec.ts:193` | AJAN 4 |
| I-05 | Yeniden öneri elle değişikliği ezmez | `strateji.service.spec.ts:307` | AJAN 4 (`yeniden-hazirla` elle değişiklikleri UYARIR; sessizce ezmez) |
| I-06 | Boş öneri nedenini söyler (hesap_yok, veri_yok, donusum_yok, karisik_birim) | `strateji.service.spec.ts:320` | TAŞINDI (`plan seviyesi ön koşullar ayrı nedenlerle`) |
| I-07 | B workspace'inin kitlesi/varlığı A'nın planına giremez ("tüm şirketler" modunda da) | `strateji.service.spec.ts:392,401`, `strateji-guvenlik.spec.ts:198` | AJAN 4 (planUret girdisi `client_id` ile süzülür) |
| I-08 | Silinen kitle/görsel satırı düşürmez, söylenir | `strateji.service.spec.ts:426`, `aktarim.spec.ts:181` | AJAN 4 (onay anında plan kaynakları taze doğrulanır) |
| I-09 | Kelime varyantları tekilleşir (aynı metrik + sadeleştirilmiş metin); hacimler ikiye katlanmaz | `S/kelime-tekil.spec.ts:17-56` · CLAUDE Google "Keyword Planner" | YENİDEN KULLANILIR (`kelime-tekil.ts`) |
| I-10 | Gruplama deterministik, en uzun tohum; eşik altı "Diğer" | `kelime-tekil.spec.ts:75-95` | YENİDEN KULLANILIR |
| I-11 | Sıfır fikir başarı değil; Google yetki reddi erişimi "yok" yapar; bayat iş yazmaz | `S/kelime-isleyici.spec.ts:87-174` | YENİDEN KULLANILIR (kelime işçisi aynen) |
| I-12 | Ön koşul platform çağrısından ÖNCE (Google hesabı yoksa sıfır çağrıyla ret) | `strateji.service.spec.ts:439` · CLAUDE §3 "önce kontrol" | AJAN 4 (planUret Google'ı hesap yoksa dışarıda bırakır: TAŞINDI kısmen) |
| I-13 | Eşik altı kelime seçilmez (K-06 `ARAMA_HACMI_ESIGI` tek kaynak) | `SS/kelime.ts#AYRI_GRUP_HACIM_ESIGI` | TAŞINDI (`Google eşik altı kelimeleri almaz`) |
| I-14 | "Tüm şirketler" modunda `org_id` HEDEF MÜŞTERİDEN | `strateji-guvenlik.spec.ts:172`, `aktarim.spec.ts:209` · CLAUDE §3 | AJAN 4 (bütün yeni tablolar) |
| I-15 | PDF: gömülü yazı tipi, TASLAK damgası, onay rolü ayrı, sessiz kesme yok, emoji üretimi düşürmez, 5 MB / 15 sn | `S/medya-plani-pdf.spec.ts:109-174`, `strateji-guvenlik-2.spec.ts:174,192` | AJAN 4 (`/pilot/planlar/:id/pdf` aynı altyapı) |
| I-16 | Dosya adı başlığa tırnak/satır sonu sızdırmaz | `medya-plani-pdf.spec.ts:174` | YENİDEN KULLANILIR |

## J. RLS, izolasyon, modül kaydı

| # | Kural | Kaynak | Taşıyan test |
|---|---|---|---|
| J-01 | RLS testi `SET ROLE` + `RETURNING` ile etkilenen satırı sayar | CLAUDE §3, `S/strateji-rls.spec.ts` | AJAN 4 (yedi yeni tablo) |
| J-02 | Plan silinemez, iptal edilir (DELETE politikası yok) | `strateji-rls.spec.ts:110` | AJAN 4 |
| J-03 | Kolon okumayan UPDATE/DELETE ve WITH CHECK ayrı sınanır | `S/strateji-rls-ek.spec.ts:97-156` | AJAN 4 |
| J-04 | Başka org bağlamı aynı client kimliğiyle görmez; kompozit FK çocuk satırı başka workspace'e bağlatmaz | `strateji-rls-ek.spec.ts:166`, `strateji.service.spec.ts:158` | AJAN 4 |
| J-05 | IDOR: başka workspace'in kimliğiyle her uç 404, satırlar dokunulmadan | `strateji-guvenlik.spec.ts:113` | AJAN 4 |
| J-06 | Controller ↔ uç listesi birebir; her uçta izin dekoratörü | `S/strateji-kayit.spec.ts:44-59`, `strateji-guvenlik.spec.ts:238` | AJAN 4 (`PILOT_UCLARI`) |
| J-07 | Nest modül kaydı açılışta patlar: providers/imports kaynak taraması | `S/strateji-kayit.spec.ts:69`, `R/hazirlik.service.spec.ts:154,175` · CLAUDE §3 | AJAN 4 |
| J-08 | Yeni modül eski reklam modüllerini içe aktarmaz (yalnız shared saf fonksiyonları) | `hazirlik.service.spec.ts:164` | AJAN 4 (pilot modülü `modules/reklam`ı içe aktarmaz) |
| J-09 | Müşteri hesabı yazma uçlarında reddedilir; yalnız okur, itiraz eder, onaylar | `strateji-guvenlik.spec.ts:247` | TAŞINDI (`müşteri onaylar ama hiçbir yazma ucunu açamaz`) |
| J-10 | Havuz satırları (`client_id IS NULL`) müşteri kapsamlı sayıma ve senkrona girmez | CLAUDE §3 | AJAN 4 (planUret `hesaplar` yalnız atanmış) |
| J-11 | Üç durak: TRUNCATE, `02_rls.sql`, `WORKSPACE_TABLOLARI` | CLAUDE §3 | AJAN 4 (`rls-coverage`, `workspace-tasima` mevcut taramalar) |
| J-12 | RLS'li tabloya INNER JOIN satırı sessizce süzer (ad/etiket LEFT JOIN) | CLAUDE §3 | AJAN 4 (plan listesi "hazırlayan/onaylayan" adı) |
| J-13 | `include` yerine `select`; şifreli token belleğe alınmaz | CLAUDE §3 | AJAN 4 |

## K. Pilot öneri kartı (yeni; eski karşılığı kural motoru dersleri)

| # | Kural | Kaynak | Taşıyan test |
|---|---|---|---|
| K-01 | Kendiliğinden uygulama kapalı; açılsa bile bütçe ARTIRAMAZ | Ç-3 · `pilot/oneri.ts` | TAŞINDI |
| K-02 | Her eylemin geri alma adımı var | `pilot/oneri.ts#geriAlmaAdimi` | TAŞINDI |
| K-03 | Uygula anında hedef taze okunur; başka yerden (MCP/Ads Manager) değişmişse kart bayat | hafıza "Meta hesapları MCP ile yönetiliyor" | TAŞINDI |
| K-04 | Belirsiz sonuçta yeniden çağrı yok, uzlaştırma | F-05 dersi | TAŞINDI (geçiş tablosu) + AJAN 4 worker |
| K-05 | Tarama `succeeded + 0 kart` ayrı not; "hiç taranmadı" ile "öneri yok" ayrı | CLAUDE §3 `succeeded + rows = 0` | AJAN 4 (`pilot_taramalari.not`) |
| K-06 | Kural motorunun bütçe bekçisinde her dal aynı `client_id` süzgecini taşır | CLAUDE §3 "aynı sorgudaki her dal" | AJAN 4 (bütçe hızı sorgusu) |
| K-07 | Google dönüşüm segmenti satırı çoğaltır: ana metrik sorgusuna eklenmez | CLAUDE §3 · `google-donusum-segmenti.spec.ts` | AJAN 4 (negatif aday sorgusu) |
| K-08 | Eşikler adlı sabit; ekran metni sabitten türer | K-06 TASARIM-PLAN | TAŞINDI (eşik testleri) |

---

**Bakım:** Ajan 4 her maddeyi taşıdığında "Taşıyan test" sütununa spec dosyası:satır yazar ve sayımı
günceller. Yeni bir canlı ders (`CLAUDE.md`'ye eklenen) aynı commit'te buraya madde olarak girer.
