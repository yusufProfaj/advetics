# PROGRESS — modül modül pazar araştırması ve güncelleme döngüsü

## Döngünün sözleşmesi (kullanıcı kararları, 2026-10-14)

- **Hedef:** her modülü pazar araştırmasıyla güncel konuma getirmek. Advetics'in
  amacı sabit: reklam bilmeyen kullanıcıya en verimli kurulumu yaptıran beyaz
  etiketli panel (CLAUDE.md "Özet").
- **Kemik yapı değişmez:** menü bölümleri, veri modeli, sağlayıcı deseni,
  RLS ve yetki modeli olduğu gibi kalır. Yeni modül ya da menü satırı
  EKLENMEZ (o, beş ajan kuralıyla ayrı iş). Mevcut ekranlara özellik
  eklenebilir.
- **Sıra:** reklam verimliliğine göre (aşağıdaki modül sırası).
- **Bir tur = bir madde.** Turlar iki türlü:
  - *Araştırma turu:* `docs/pazar/<modul>.md` yazılır. Bölümler: platform
    güncellemeleri (Meta, Google Ads, LinkedIn; API sürümü, yeni/kalkan
    özellik), rakipler (AdEspresso, Madgicx, Revealbot, Smartly, Ryze,
    AgencyAnalytics ve modüle göre diğerleri), kullanıcı şikâyetleri
    (Reddit, G2, Capterra), Türkiye pazarı (TL, KDV, Türkçe, yerel
    rakipler). Sonda ÖNCELİKLİ öneri listesi; her öneri bu dosyaya modülün
    altına `- [ ]` olarak eklenir. Kaynak adresi her iddianın yanında;
    belgeden okunan platform davranışı "ölçülmedi" diye işaretlenir
    (CLAUDE.md: canlıda ölçülmeden doğru sayılmaz).
  - *İyileştirme turu:* tek öneri ya da tek açık kapanır; test + mutasyon,
    `./scripts/dogrula.sh` yeşil, tek commit.
- **Onay kapısı:** arayüz ve özellik işleri ONAYSIZ yapılır (kullanıcı
  kararı; CLAUDE.md'deki "önce görsel taslak" kuralı bu döngü için
  askıda). Yalnız şunlar `(onay bekliyor)` olarak işaretlenip SORULUR:
  para harcayan, platforma (Meta/Google/LinkedIn) yazan, reklam yayınlayan,
  canlı veriyi silen ya da kullanıcının önceki bir ürün kararını bozan işler.
- **Döngünün işi DEĞİL:** push, deploy, migration'ı canlıya uygulamak, SSH.
  Migration YAZILABİLİR ama deploy kullanıcıya bırakılır ve maddeye
  "migration var" yazılır.
- **Her tur sonunda:** madde `[x]`, CLAUDE.md "Öğrenilenler"e gerekiyorsa
  tek satır, aynı iş ikinci kez yapıldıysa `.claude/skills/` altına skill.

## 1 · AdvCampaign (`/reklam`)

- [x] Araştırma → `docs/pazar/advcampaign.md` (Meta Advantage+ kampanya yapısı 2026, Google AI Max/PMax/Demand Gen, LinkedIn amaçları; rehberli kurulum sunan rakipler)
- [x] Bilinen açık: taslak tablosu telefonda "Devam et"i ekran dışına itiyor (bütçe/eksik/platform telefonda gizli, ad hücresinde özet; canlıda görülmedi)
- [x] Öneri 1: bekçi testi, derleyici ASC/AAC alanı (`smart_promotion_type`, `AUTOMATED_SHOPPING_ADS`) üretmesin (Meta v26 bunları duraklatıyor)
- [x] Öneri 2 (yalnız yerleşim kaldıracı; bütçe hep CBO, kitle hep 1 yazılıyor, gövdeden söylenecek başka sebep yok): Kontrol ekranında Advantage+ durumu ve eksik kaldıraç (bütçe/kitle/yerleşim), `advantage_state_info`ten sade dille
- [x] Öneri 3: Google Arama kontrolünde "AI Max kapalı" kararının gerekçesi tek cümleyle
- [ ] (onay bekliyor) Öneri 4: Form amacında CRM'e dayalı optimizasyon (Meta Conversion Leads; "müşteri oldu" geri beslemesiyle)
- [ ] (onay bekliyor) Öneri 5: Form amacında 65+ yaş yoğunlaşma koruması (varsayılan üst sınır ya da kurulum sonrası uyarı)

## 2 · Akıllı Boost (`/auto-boost`)

- [x] Araştırma → `docs/pazar/akilli-boost.md` (gönderi öne çıkarma otomasyonu: Meta boost API, IG Partnership/Trial Reels, YouTube Demand Gen; Madgicx/Revealbot otomatik boost)
- [x] Bilinen açık: kartta "Konum 3684" ham kimlik (adsız konum artık sayılıyor + "ön ayarı yeniden kaydet"; adı Meta'dan çözmek ayrı iş)
- [x] Bilinen açık: sayfa ilk yüklemede başka workspace'in kuyruğunu (`fd82…`) sorguluyor → TEŞHİS: hata değil. `clientId` sunucuda tek kaynaktan (`sayfaWorkspaceId`), kuyruk yalnız onunla isteniyor; denetimdeki sıra birkaç gezinmeyi kapsıyordu ve arada workspace Ege Birlik (`fd82`) → Deneme (`1f97`) değişmişti. Kod değişmedi.
- [ ] (onay bekliyor) 12 Facebook kartı: 2026-09-30 kararı yalnız IG + YouTube; eski mi yeni mi ölç, kullanıcıya sor
- [x] Öneri 1: kartta organik performans karşılaştırması (son 10 gönderinin ortalamasına göre erişim/etkileşim; altındaysa "boostlamak genelde verimsiz" notu)
- [x] Öneri 2: kartta boost hedefinin ne ölçtüğü ("etkileşim için; satış/form için AdvCampaign"). BULGU: ön ayardaki "Amaç" (Erişim/Profil ziyareti) Meta'ya HİÇ gitmiyor, boost her zaman `POST_ENGAGEMENT`; kart yazılan hedefi ve farkı söylüyor, form ipucu düzeltildi
- [ ] (onay bekliyor) Ön ayar amacını yayına bağla (Erişim → `REACH`, Profil ziyareti → `PROFILE_VISIT`; Meta'ya yazan değişiklik, canlı prova ister) YA DA iki seçeneği formdan kaldır
- [ ] (onay bekliyor) Öneri 3: organik eşikle otomatik sıralama / otomatik onay (otomatik onay para harcar)
- [ ] (onay bekliyor) Öneri 4: aynı anda boostlu gönderi sınırı

## 3 · İyileştir (`/iyilestir`)

- [x] Araştırma → `docs/pazar/iyilestir.md` (kural motorları: Revealbot, Madgicx, Optmyzr; Meta/Google otomatik kurallar ve öneri API'leri)
- [x] Öneri 1: bütçe değişikliğinde 7 günlük kayan bekleme (ISO-hafta anahtarı pazar→pazartesi ikinci +%20'ye izin veriyor); bekleyen sayısı söylenir
- [ ] (onay bekliyor: canlı Meta okuması) Öneri 2: öğrenmedeki Meta reklam setine bütçe önerisi yok (`learning_stage_info`; önce canlıda alan biçimi ölçülür — ölçülemezse madde "kullanıcıda" kalır)
- [ ] (onay bekliyor) Öneri 3: Meta `/act_X/recommendations` önerilerini İyileştir'de göstermek (okuma onaysız; uygulamak platforma yazar)

## 4 · AdvStrategy (`/strateji`)

- [x] Araştırma → `docs/pazar/advstrategy.md` (medya planı araçları, Meta Reach Planner / Google Performance Planner, müşteri onay akışları)
- [x] Bilinen açık: onay bekleyen strateji varken kart başlığı hâlâ "Strateji oluştur"; "Onay bekleyen strateji var" + "Raporu aç"
- [x] Öneri 3 (panel; girişsiz bağlantı kutusu henüz bütün strateji için): müşteri revizyon isterken kalemi seçebilsin, not kalemin yanında görünsün (önce mevcut revizyon akışı incelenir)
- [ ] (onay bekliyor) Öneri 2: geçmişi olmayan hesapta "tahmin yok" yerine Meta `delivery_estimate` eğrisi, kaynağı "Meta'nın tahmini" (K-3 kararını genişletir; canlı ölçüm ister)

## 5 · Aylık Bütçe (`/butce`)

- [x] Araştırma → `docs/pazar/butce.md` (bütçe ve tempo araçları, hesap harcama limiti, Meta kampanya bütçesi / Google paylaşılan bütçe)
- [x] Bilinen açık: "13 günün 11 günü senkronize" uyarısının sebebini teşhis et (hangi günler, hangi hesap). TEŞHİS (koddan): gün sayısı yalnız metrik SATIRI olan günlerdi; harcamasız günde platform satır döndürmüyor → veri tamken uyarı. Artık başarılı ve satır atlamayan çekimin kapsadığı gün de sayılıyor. Hangi hesap/gün olduğu canlıda ÖLÇÜLMEDİ; düzeltmeden sonra uyarı sürüyorsa gerçek eksik gündür.
- [x] Öneri 2 (müşteri geneli; hesap satırı ayrı adım): yayındaki günlük bütçelerle ay sonu öngörüsü ("bugünkü günlük bütçelerle ay sonunda X, bütçeyi Y aşar")
- [x] Öneri 4: "hızlı" uyarısının yanında platform esnekliği notu (Meta günde %75'e, Google 2 katına kadar)
- [ ] (onay bekliyor) Öneri 5: aylık bütçeyi Meta'da sert tavana çevirmek (`spend_cap`; platforma yazar)

## 6 · Reklam Yöneticisi (`/ads-explorer`)

- [x] Araştırma → `docs/pazar/reklam-yoneticisi.md` (Meta Ads Manager / Google Ads arayüz mantığı, çok hesaplı ajans görünümleri)
- [ ] (onay bekliyor: canlı ölçüm, oturum gerekiyor) Bilinen açık: telefonda sayfa 147 px yana taşıyor. Koddan teşhis edilemedi: tablo `overflow-x-auto` içinde, sayfa içi düzen `grid-cols-1` + `min-w-0`, şeritler `flex-wrap`. Tek aday tarih seçici düğmesi (`whitespace-nowrap`, ~380 px tahmini), ama 147 px'i açıklamıyor. Panelde oturum açıkken tarayıcıda taşan öğe ölçülmeli (betik hazır: genişliği aşan ve kırpılmayan öğeleri listeler).
- [x] Öneri 2: durum sütununda TESLİMAT durumu (`effective_status` + üstten gelen engel: "Duraklatıldı (kampanya)", "Reddedildi"); bugün yalnız kendi `status`ü, set "Yayında" görünüp harcamıyor
- [x] Öneri 3a: Google yapı taraması `campaign.serving_status`ı okuyor ve `effective_status`a yazıyor; teslimat durumu artık ENDED/PENDING/SUSPENDED'ı söylüyor ("Bitti (bitiş tarihi geçti)", "Başlamadı", "Askıya alındı")
- [ ] (onay bekliyor: canlı ölçüm) Öneri 3b: "Bütçeyle sınırlı" `campaign.primary_status` + `primary_status_reasons`ta (BUDGET_CONSTRAINED) ve bu alan OKUNMUYOR. Yeni GAQL alanı = önce `google-check -- --field campaign.primary_status_reasons` ile v25'te ölç (CLAUDE.md: Google alan adlarını sürümler arasında değiştiriyor)

## 7 · Raporlar (`/raporlar`)

- [x] Araştırma → `docs/pazar/raporlar.md` (AgencyAnalytics, Whatagraph, DashThis, Looker Studio şablonları; beyaz etiket rapor beklentileri)
- [x] Bilinen açık: rapor önizlemesi kılavuz dışı slate renkleri ve ikinci `h1` taşıyor. KOD DEĞİŞMEDİ: 33887fb5 (2026-10-14) bunu bilerek KALICI istisna yaptı (`tasarim-sistemi.istisnalar.ts`): önizleme PDF'in aynası, gri tonlar PDF çizicisiyle aynı, panel token'ına çevirmek ekranla PDF'i ayrıştırır ve karanlık temada belgeyi karartırdı.
- [x] Bilinen açık: önizleme telefonda sağdan kesik (dar kenar, kapak başlığı ekrana göre küçülüyor, kapak/bölüm satırları sarılıyor, kap artık kesmiyor kaydırıyor; canlıda telefonla GÖRÜLMEDİ)
- [x] Öneri 2 (ay sonu öngörüsü bu satırda YOK; yalnız bütçe ve dönemde harcanan): özet bölümünde "Aylık bütçe" satırı (tek takvim ayı + bütçe tanımlıysa; `budgets.pacing` ile aynı hesap)
- [ ] (onay bekliyor: yeni tablo = veri modeli değişikliği, döngü sözleşmesi "veri modeli olduğu gibi kalır") Öneri 3: ajans yorumu ve sonraki adımlar alanı (dönem başına düz metin, PDF'te özetin altında; migration var, deploy kullanıcıda)

## 8 · Potansiyel Müşteriler (`/potansiyel-musteriler`)

- [x] Bilinen açık: boş liste yanlış sebep söylüyor; Meta'da `leads_retrieval` izni yoksa bunu yaz (emptyReason + test). Ayrıca son taramanın hatası (`lead_sync_cursors.last_error`) artık "kayıt bulunamadı"dan önce, platformun cümlesiyle.
- [x] Araştırma → `docs/pazar/potansiyel-musteriler.md` (lead form CRM akışları, Meta Conversions API for CRM, Google lead form, Türkiye'de WhatsApp takibi)
- [x] Öneri 1: "Yeni" kaydın bekleme süresi ("3 saattir aranmadı", 1 saati geçen işaretli, sayaç)
- [x] Öneri 2: kayıttan `tel:` ve WhatsApp (`wa.me`) bağlantısı (E.164; `tel:` zaten vardı, WhatsApp eklendi, tanınmayan numarada bağlantı yok)
- [ ] (onay bekliyor) Öneri 3: yeni kayıt e-posta bildirimi (dışarı giden mesaj + ayar)
- [ ] (onay bekliyor) Öneri 4: form oluşturucuda varsayılan "Daha yüksek niyet" + telefon doğrulaması (Meta'ya yazar)

## 9 · Genel Bakış (`/dashboard`)

- [x] Bilinen açık: 1035–1280 px'te sağ sütun sıkışıyor; `xl` altında alta insin (kesme noktası 980 → 1279 px; canlıda bu genişlikte GÖRÜLMEDİ)
- [x] Bilinen açık: Hesaplar ve Kampanyalar tablolarında ad sütunu kesiliyor; en az genişlik (ad hücresi en az 12,5 rem, tablo 640 px; sığmazsa yana kayıyor; tam ad üzerine gelince; canlıda GÖRÜLMEDİ)
- [x] Araştırma → `docs/pazar/genel-bakis.md` (ajans çok müşterili özet ekranları, anomali uyarıları)
- [x] Öneri 1: yasaklı Meta kırılımı bekçisi (`impression_device`, `frequency_value`, kitle saat dilimi saat kırılımı Ağustos 2026'dan beri hesap izni istiyor ve izinsiz SESSİZCE boş dönüyor)
- [ ] (onay bekliyor: canlı ölçüm) Öneri 2: reklamveren saat dilimi saat kırılımı da izin istiyor mu, bir hesapta ölç

## 10 · Marka Merkezi ve Kurulum (`/marka-merkezi`, `/kurulum`)

- [x] Bilinen açık: workspace seçicisinde "şirket geneli" kesiliyor; Marka Merkezi "workspace seçili değil" uyarısıyla çelişiyor ("Şirket geneli · N workspace" sırası, tam metin title'da, ajans öneki kararı korundu; uyarı "Üstte şirket geneli seçili, tek bir workspace değil"; canlıda GÖRÜLMEDİ)
- [x] Bilinen açık: "bu workspace'e geç" uyarısı telefonda 12 satır; düğme alta (ortak `Uyari` bileşeninde metne 16 rem taban: bütün uyarılar düzeldi; canlıda GÖRÜLMEDİ)
- [x] Araştırma → `docs/pazar/kurulum.md` (onboarding sihirbazları, GTM/GA4/CAPI kurulum araçları, Stape, Meta Events Manager kurulum rehberleri)
- [x] Öneri 1: Kurulumda "Çerez onayı" bilgi satırı (KVKK açık rıza + Consent Mode v2 yoksa gelişmiş dönüşümler sessizce çalışmaz; yalnız bilgi)
- [ ] (onay bekliyor: yeni Meta okuma, canlı ölçüm) Öneri 2: Dataset Quality API ile EMQ'yu doğrulama adımında göstermek
- [ ] (onay bekliyor) Öneri 3: Meta tek tıkla CAPI'yi Kurulum'da önermek (Events Manager'a yönlendirme)

## 11 · Varlıklar (`/varliklar`)

- [x] Bilinen açık: süzgeç çiplerinde sayı etikete bitişik ("Tümü21") (ortak `BolumluSecici` düğmesine gap; flex öğesinin sondaki boşluğu atılıyordu; canlıda GÖRÜLMEDİ)
- [x] Araştırma → `docs/pazar/varliklar.md` (kreatif kütüphaneleri, otomatik boyutlandırma, Meta/Google varlık gereksinimleri 2026)
- [x] Öneri 1: Google logo dosya boyutu (150 KB, Demand Gen) uyarısı giriş anında; engel değil uyarı (Marka › Logo sekmesinde seçili logo için)
- [x] Öneri 2: 9:16 önizlemede güvenli alan katmanı (üst ~%14, alt ~%35) (küçük resim 32 px olduğu için katman yerine reklam adımında tek satır not; Meta açık + dikey görsel varken)
- [ ] (onay bekliyor: platform çağrısı) 150 KB üstü logonun Demand Gen'de reddini validateOnly provasıyla ölç

## 12 · Ayarlar (`/ayarlar/*`)

- [x] Bilinen açık: `/ayarlar` markasız İngilizce 404; `/ayarlar/sirketler`e yönlendir + Türkçe markalı `not-found.tsx` (oturumun açabildiği ilk sekmeye; canlıda GÖRÜLMEDİ)
- [x] Bilinen açık: Bağlantılar'da yedi platform sekmesi 1280 px'te sayfayı 214 px taşırıyor (ortak `BolumluSecici` kabını aşmıyor, kendi içinde kayıyor; canlıda GÖRÜLMEDİ)
- [x] Bilinen açık: Hesabım üst yolunda sayfa adı eksik (kırıntı adı menüden buluyordu; Hesabım menüde değil, listeye eklendi; canlıda GÖRÜLMEDİ)
- [x] Araştırma → `docs/pazar/ayarlar.md` (ajans çoklu müşteri yönetimi, rol modelleri, 2FA zorunluluğu)
- [x] Öneri 1: ekip listesinde "uzun süredir giriş yok" işareti (90 gün; hiç giriş yapmamış ayrı)
- [x] Öneri 2: ekip listesinde kişinin iki adımı açık mı (zorunluluk açılmadan kimin takılacağı). ARAŞTIRMA YANLIŞTI: asıl Ekip ekranı (`team-screen.tsx`) "İki adımlı" sütununu zaten gösteriyor. Bunun yerine o ekranda HİÇ olmayan "Son giriş" sütunu + 90 gün işareti eklendi (önceki tur yalnız workspace erişim listesine eklemişti).
- [ ] (onay bekliyor: yeni ekran bölümü + yetki kararı) Öneri 3: Ekip ve güvenlik altında "Son değişiklikler" (audit_logs)

## Ortak (her modülde rastlanırsa)

- [x] API paketinde ara sıra TEK test düşüyor (bu gece iki kez, tekrarında yeşil): tek başına dört koşuda (4 × 6.639) TEKRARLANMADI; en yavaş iki test (strateji PDF 6-12,5 sn, Nest grafiği 7-8 sn) zaten 90/120 sn açık süre sınırlı, yani zaman aşımı değil. Kök sebep bulunamadı; `dogrula.sh` artık düşen testin dosya ve adını + tam çıktı yolunu basıyor (eskiden yalnız `tail -5`), bir dahaki düşüşte iz kalacak. Düşerse buraya yeniden aç.
- [x] Boş durum kutularında ikon yerine "0" yazıyor; `BosDurum` ikonu (varsayılan çizgi "boş kutu" ikonu; canlıda GÖRÜLMEDİ)
- [x] Kenar menüsü 800 px yükseklikte Base bölümünü göstermiyor; etkin satır solmanın altında (adres değişince etkin satır görünür alana kaydırılıyor, solma payı scroll-pb-8; Base'e menü kaydırılarak ulaşılıyor; canlıda GÖRÜLMEDİ)

## Kullanıcıda (döngü dışı)

- [ ] Canlı doğrulama: Ege Birlik'te strateji iptal/sil → "Strateji oluştur" açılıyor mu
- [ ] Canlı doğrulama: Boost kartları ve reklam önizlemelerinde görsel geliyor mu
- [ ] Canlı doğrulama: Kurulum "Değiştir" + aramalı liste, masaüstü + mobil
- [ ] Döngünün biriktirdiği commit'leri push + deploy
