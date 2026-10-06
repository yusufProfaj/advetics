# Kullanıcı kararları (25) — KAPANDI 2026-10-07

> **2026-10-07, kullanıcı:** *"benden beklenen kararları sen biliyorsun zaten doğru olan
> şeyleri seç ve ona göre ilerleyelim"*. Bu cümleyle 25 sorunun TAMAMINDA her alt
> maddenin **önerilen (ilk sıradaki) seçeneği** kabul edildi. Tasarım belgesi zaten
> önerilen seçeneklerle yazılmıştı; yani TASARIM.md değişmeden geçerli. Aşağıdaki
> metin karar kaydı olarak duruyor. Bir kararı değiştirmek isteyen bu dosyaya yeni
> bir tarihli satır ekler, eski satırı silmez.
>
> Dikkat edilecek iki sonuç: C-1'de sağlık turizmi niyeti yönetmeliğin kısıtlarıyla
> AÇIK (yurt dışı, Türkçe dışı dil, ayrı Sayfa/IG, Advantage+ kitle kapalı); C-2 §3'te
> "açılış ayı" ve "Bakanlık izinli yöntem" hukuk görüşü gelene kadar KAPALI.

## (Eski başlık) Kullanıcı kararı bekleyen sorular (25)
> Hükümlerin kullanıcıya bıraktığı iş kararları. Her birinde önerilen seçenek ilk sırada; tasarım belgesi şimdilik ÖNERİLEN seçenekle yazıldı. Ayrıntı: [hukumler.md](hukumler.md).

## C-1. Sağlık turizmi modunda Advantage+ kitle kapalı: karar 2'nin mevzuattan gelen dar istisnası

Sağlık turizmi reklamları yalnız yurt dışına, Türkçe dışı dilde ve ayrı bir yurt dışı Sayfa/IG hesabından, otomatik kitle kapalı olarak yayınlanabiliyor. Seçenekler: (a) Bu kısıtlarla sağlık turizmi niyetini açalım (Advantage+ kitle yalnız bu niyette kapalı); (b) Hukuk görüşü gelene kadar niyet tamamen kapalı kalsın; (c) Sağlık turizmini hiç sunmayalım.

*Tasarımdaki varsayılan:* Karar 2 (Advantage+ kitle AÇIK) sağlık turizmi niyetinde UYGULANMAZ; bu, mevzuatın kararı daralttığı bir kapsamdır ve kullanıcıya ekranda sebebiyle söylenir ('Sağlık turizmi reklamlarında yönetmelik (12.11.2025, md. 8/1-c) Meta'nın otomatik kitle genişletmesini kapatmayı zorunlu tutuyor'). Derleyici sözleşmesinde 'advantage_audience: 1' sabit satırı 'niyet modundan türeyen değer' olur. Sağlık turizmi dalı: advantage_audience 0 açıkça; targeting_relaxation_types desteklenen her türde 0; targeting…

## C-2. Yurt içi sağlık reklamı ENGEL; ajans onayıyla aşılamaz; boost yolları da aynı kapıdan geçer

1) Sağlık profilinde Türkiye hedefli reklam ENGEL'inin ajans (Profaj) tarafından da aşılamaması onaylıyor musunuz? (a) Evet, hiç aşılamasın; (b) Hayır, yalnız ajans yöneticisi gerekçe yazarak aşabilsin (sorumluluk ajansta). 2) Akıllı Boost ve elle boost sağlık profilinde: (a) Kart üretimi ve boost yayını kapatılsın (karar 5'in kapsamına bu tek kapı eklenir); (b) Akıllı Boost'a dokunulmasın, risk kabul edilsin. 3) 'Açılış ayı' ve 'Bakanlık izinli yöntem' modları: (a) Hukuk görüşü gelene kadar kapalı; (b) Şimdi açılsın.

*Tasarımdaki varsayılan:* Sağlık kurumu / meslek mensubu profilli workspace'te Türkiye hedefli ücretli yayın ENGEL'dir ve ajans onayıyla AŞILAMAZ (R5'in 'uyarı + ajans onayı' modeli reddedilir). Niyet kartlarının yerine sebep ekranı açılır; ekran yönetmeliği söyler, 'Meta onayladı' bilgisini güvence gibi sunmaz. Kapı packages/shared'da tek saf fonksiyon uyumDenetle; Acemi, Gelişmiş, AI onay kartı, kopyalama ve SUNUCUDAKİ yayın servisinin son kapısında aynı fonksiyon koşar (panelde ikinci kontrol yazılmaz). #8 'Paylaşımım…

## C-3. Konut (HOUSING) ile Advantage+ kitle: 1 açıkça yazılır, geri okunur, Meta kapatırsa karar daralır ve söylenir

Konut reklamında Meta otomatik kitleyi o hesapta açmazsa (geri okumada kapalı döner ya da 1'i reddeder) ne olsun? (A, önerilen) Bilinen platform kısıtı sayılır. Reklam onayladığınız sınırların içinde kaldığı için yayın açılır ve kartta sebebi yazılır. Meta reddettiyse reklam aynı yayın içinde bir kez otomatik kitle kapalı olarak yeniden kurulur. (B) Fark sayılır. Yayın PAUSED kalır, kullanıcı açıklamayı görüp ikinci kez 'Yayınla' der. Bu, karar 1'in katı okuması ve o hesaptaki her konut yayınında bir tıklama fazlası demek. (C) Konut dalında baştan 0 yazılır. Karar 2 konutta askıya alınır; ölçüm gerekmez ama Meta'nın kademeli açılımından yararlanılmaz.

*Tasarımdaki varsayılan:* 1) Derleyici HOUSING dalında da (EMPLOYMENT ve FINANCIAL_PRODUCTS_SERVICES dahil) targeting_automation.advantage_audience: 1 değerini AÇIKÇA yazar. Bu hem karar 2 hem v26'nın şartı, ve 2026-10-27'den itibaren bütün sürümlerde geçerli. Alan hiçbir dalda boş bırakılmaz. Konut dalında yaş 18 ve 65+ sabittir, cinsiyet yoktur (C-4); Advantage+ bu sınırların İÇİNDE çalışır. 2) R2/E2'deki kesin 'Bu kategoride Meta'nın otomatik kitlesi kullanılamaz' cümlesi ve 'karar 2 konutta askıya alınır' önerisi KAL…

## C-7. Özel kategori beyanı: müşteri kartı TABAN, taslak EK, soru E1'de; CREDIT emekli

Kartında 'Konut' kayıtlı bir müşteri için tek bir reklam, 'bu konut reklamı değil' denerek konut beyanı olmadan gönderilebilsin mi? (A, önerilen) Hayır. Taban kilitli; kaldırmak yalnız ajans yöneticisinin müşteri kartını gerekçe yazarak değiştirmesiyle mümkün. Bedeli: bu müşterinin işe alım ya da marka reklamları da konut kısıtlarıyla gider. (B) Evet, ama yalnız kapalı bir listeden gerekçe seçilerek (örneğin otel ya da tatil konaklaması, işe alım ilanı ki o zaman İstihdam eklenir) ve kayda yazılarak. Bu seçimi yalnız ajans rolü yapabilir, AI yapamaz. 'Kurumsal marka reklamı' listede yer almaz, çünkü Meta onu da konut sayabilir. (C) Evet, gerekçe istenmeden serbestçe.

*Tasarımdaki varsayılan:* 1) İki katmanlı model kurulur. Müşteri kartı (clients.special_ad_categories) TABANI tutar ve korunur. Akıllı Boost (karar 5 gereği yeniden tasarımın dışında) beyanını buradan okumaya devam eder. ETKİN beyan taslakta ve kampanya kaydında tutulur, çünkü Meta'da alan kampanya başına ve 'konut reklamı' tanımı reklamverene değil içeriğe bakıyor (Yardım Merkezi 1198401317374558). 2) Etkin beyan = taban ∪ taslağın ekleri. Taslak kategori EKLEYEBİLİR: örneğin konut müşterisinin işe alım reklamına EMPLOY…

## C-8. Advantage+ kitle açıkken kesin sınır ve öneri ayrımı; age_max kuralı ve 'sınırlı kalsın mı' sorusu

Müşteri '30 yaş üstü kesin' ya da 'yalnız kadınlar kesin' isterse ne yapalım? (a) Sapma yok: her zaman ipucu olarak gönderilir ve ekranda sebebi yazılır. Karar 2'nin lafzına en uygun seçenek, ama bazı müşteriler (ör. yaş sınırlı ürün, kadın kliniği) memnun kalmayabilir. (b) Gelişmiş'te, gerekçe yazılarak 'Meta'nın otomatik kitlesini kapat' (Sınırladın rozeti, onay ekranında 'Kapattıklarımız'), yalnız ajans kullanıcısı yapabilir. (c) Aynısı, ama şirket admini de yapabilir. Öneri: (b).

*Tasarımdaki varsayılan:* KURAL: Yeni modülde Advantage+ kitle varsayılan olarak AÇIK (karar 2) ve hedefleme ekranda İKİ KUTU olarak gösterilir. 'Kesin sınırlar' kutusunda konum (zorunlu), en düşük yaş (yalnız 18-25) ve hariç tutulan müşteri listesi yer alır; dil Gelişmiş'te. 'Meta'ya ipuçları' kutusunda yaş aralığı, cinsiyet, ilgi alanları ve dahil edilen kitle yer alır, altında 'Meta bunların dışına çıkabilir' yazar. Acemi'deki 'Bu kişilerle sınırlı kalsın mı?' sorusu KALDIRILIR: 'Evet' cevabı ya karar 2'yi deler ya hi…

## C-10. Lead formu: KVKK onay kutuları, aydınlatma adresi, geri okuma ve AI aracı

Lead formundaki KVKK metinleri (bildirim gövdesindeki nötr cümle, pazarlama izni kutusunun metni, aydınlatma bağlantı metni) nasıl belirlensin? (a) Ajansın hukuk danışmanı bir kez standart metin yazsın, bütün workspace'ler onu kullansın (önerilen); (b) her müşteri kendi metnini Marka Merkezi'ne girsin, Advetics yalnız yapısal kuralları (zorunlu kutu yok, 'onaylıyorum' fiili yok) denetlesin; (c) şimdilik Advetics'in önerdiği taslak metin kullanılsın, hukuk görüşü sonradan alınsın.

*Tasarımdaki varsayılan:* 1) Form yeni tasarımda TEK bir form derleyicisinden geçer (bugünkü gömülü yol createEmbeddedLeadForm ile kütüphane yolu createLeadForm birleşir); Acemi, Gelişmiş ve AI aynı derleyiciyi kullanır. 2) README §2 manifestosuna ve §5.8 geri okuma tablosuna FORM SATIRI eklenir ve şu alanlar HER formda açıkça yazılıp geri okunur: privacy_policy.url, privacy_policy.link_text (en çok 70 karakter; form.schema'daki 80 sınırı 70'e iner), locale=TR_TR, questions, ÜST SEVİYE custom_disclaimer {title, body.text…

## C-13. Zorunlu uyarının yeri: metne eklemek görünürlüğü garanti etmiyor; görsele basma ve yerleşim önizlemesi

Zorunlu yasal uyarısı olan müşterilerde uyarı nereye konsun? (a) Hem metne hem görsele (önerilen; video ve gönderi öne çıkarma bu müşterilerde beyan şartına bağlanır); (b) Yalnız metnin başına (Reels ve bazı yerleşimlerde uyarı görünmeyebilir, sağlık müşterilerinde mevzuatı karşılamaz); (c) Zorunlu uyarılı müşterilerde video ve 'paylaşımı öne çıkar' tamamen kapalı olsun.

*Tasarımdaki varsayılan:* Kural kataloğunda her uyarı TÜRÜ bir 'yer' özelliği taşır (metin / görsel / ikisi). Zorunlu uyarılı workspace'lerde: (a) Ana metne ekleme SÜRER (kayıt ve Reklam Kitaplığı için); uyarı 44 karakteri aşmıyorsa metnin BAŞINA konur, aşıyorsa yeri sonda kalabilir ama tek başına yeterli sayılmaz. yasalUyariEkle ve AI talimatındaki 'SONUNA' buna göre değişir; kapı (yasalUyariVar) konumdan bağımsız olduğu için yalnız üretici değişir. (b) Sağlıkta (md. 7/1-k 'görsel içeriklerde') ve 44 karakteri aşan her …

## C-14. Geri okumada fark: açma durur; ikinci onay yalnız düşük riskli sınıfta ve kullanıcı izin verirse

Geri okumada fark çıkınca yayın durur. Kabul edilemez sınıf (para, konut kısıtı, hedef, konum, yaş, yanlış gönderi) için yalnız 'düzelt' ve 'geri al' kalır. Tabloda henüz tanımlı olmayan DÜŞÜK riskli farklar (ör. Meta'nın bir yerleşimi kendisi kaldırması) için ne olsun? (a) Önerilen: onlar da durur, 'kabul et ve aç' hiç yok; tablo canlı turla genişletilir. (b) Ajans rolündeki kullanıcıya 'kabul et ve aç' ikinci onayı açılır, kabul eden ve fark metni kayda yazılır; Acemi yüzde ve sohbette yine yok.

*Tasarımdaki varsayılan:* 1) Karşılaştırıcı derleyici sözleşmesinin parçasıdır: derleyici gönderdiği her alan için 'beklenen yankı' ve karşılaştırma türünü (eşit / normalleştir / alt küme / Meta türetir) üretir. Beklenen normalleştirmeler API sürümüyle anahtarlı TEK bir sabit tabloda durur (REACH->IMPRESSIONS; Advantage+ açıkken age_min/max yerine age_range ve 65 tavanı; v26'da messenger story yerleşiminin sessizce silinmesi; user_age_unknown varsayılanı; advantage_state_info). Karşılaştırıcısı olmayan alan manifesto tes…

## C-16. Kısmi kurulum ve fark sonrası kalan nesneler: DELETE yok, kampanya arşivi, karar insanda

Yayın yarım kaldığında ya da fark yüzünden durduğunda Meta'da duraklatılmış nesneler kalıyor. Kimse karar vermezse ne olsun? (a) Önerilen: hiçbir şey; 3. ve 7. gün hatırlatma, karar hep insanda. (b) 7. gün, harcama sıfırsa ve kimse elle dokunmadıysa, 48 saat önce haber verilerek otomatik arşiv (workspace ayarı, varsayılan kapalı). (c) (b) ile aynı ama varsayılan açık.

*Tasarımdaki varsayılan:* 1) Sistem hiçbir yolda status=DELETED kullanmaz (bugünkü ters sıralı DELETE kaldırılır). 2) 'Geri al' = kampanyayı ARCHIVED yap (alt nesneler miras alır, tek çağrı); kampanyaya bağlanmamış kreatif/görsel teslim almadığı için bırakılır. Arayüz arşivi 'geri alınabilir' diye sunmaz: ARCHIVED yalnız DELETED'a geçebilir, 'kaldığı yerden devam' arşivden sonra mümkün değildir ve bu düğmenin yanında yazar. 3) Kısmi kurulumda ve fark_var'da aynı karar ekranı: 'Kaldığı yerden devam' / 'Düzelt ve yeniden k…

## C-17. Yayın yetkisi: tek uç, tek izin (bulk.publish); K3 ve müşteri onayı modeli kullanıcı kararı

İki karar: (1) Şirket admini doğrudan yayınlayabilsin mi? (a) Önerilen: şirketin KENDİ Meta bağlantısındaki hesapta evet; ajansın atadığı hesapta hayır, 'Ajans onayına gönder' görür. (b) Her hesapta evet. (c) Hiçbir hesapta hayır, yayın hep ajansta. (2) Müşteri onayı nasıl işlesin? (a) Önerilen: müşteri hesapsız bir bağlantıdan planı onaylar, yayını ajans tek tıkla yapar. (b) Müşterinin onayı yayını kendisi başlatır. (c) Müşteri onayı yok.

*Tasarımdaki varsayılan:* 1) Bütün yayın yolları (panel Yayınla, AI onay kartının onay ucu, toplu/kopya yayın) TEK sunucu ucundan ve TEK izinle (bulk.publish; rol matrisi ekranının gösterdiği izin) geçer. Taslak yolundaki bulk.write ve AI onayındaki budget.write yayın için kullanılmaz. Yetki kartı açanın değil TIKLAYANIN tıklama anındaki yetkisiyle kontrol edilir. Kaynak taramasıyla kilitlenir; override testi: bulk.publish:false verilen kişiye panelde de sohbette de Yayınla görünmez (bugünkü MEVCUT-S-22 açığı kapanır). 2…

## C-18. Sohbetten yayın ve bütçe kararı bayat aynaya dayanıyor (Meta MCP ikinci yazma kaynağı)

Bir kampanya/reklam seti Advetics dışından (Meta MCP, Ads Manager) son 24 saatte değiştirildiyse otomatik kurallar ve bütçe bekçisi ne yapsın? (a) O nesnede otomatik işlem durur, panelde 'dışarıdan değişti, onayla' kartı çıkar (önerilen); (b) taze değerle otomatik devam eder, yalnız rozet gösterilir; (c) yalnız bütçe artırma kuralları durur, durdurma/azaltma kuralları devam eder.

*Tasarımdaki varsayılan:* Bütün canlı yazmalar (Acemi, Gelişmiş, AI onay kartı, kural motoru) OKU-KARŞILAŞTIR-YAZ deseniyle çalışır. (1) Kart açılırken hedef değer Meta'dan taze okunur, 'Uygula/Yayınla' anında yeniden okunur; karttaki değerden farklıysa yazma DURUR, kart 'bayat' işaretlenir ve yeni değerle fark kartı açılır. Göreli değişiklik ('%20 artır') ASLA veritabanındaki aynadan hesaplanmaz, taze okunan değerden hesaplanır. Okuma ile yazma arasındaki birkaç saniyelik pencere kabul edilen kalıntıdır ve belgeye yazıl…

## C-19. Sohbetten yayın: koşulsuz karar, açılış koşulları ve dar ilk kapsam

Sohbetten yayın şu koşullarla açılsın mı? (a) Önerilen: 40 Türkçe senaryo × 5 koşuda yasak davranış SIFIR ve yapısal doğruluk en az %90 olunca workspace bazında açılır; ilk sürüm yalnız Meta; video ilk sürümde panele devredilir. (b) Aynı eşik, ama video da ilk sürümde sohbette. (c) Eşik daha sıkı: set büyütülür (200 koşuda sıfır yasak davranış kabaca %1,5 üst sınır demek). (d) Eşik yok, karar 3 doğrudan açılır.

*Tasarımdaki varsayılan:* 1) Karar 3 geri alınmaz; belgelerin eklediği koşullar AÇILIŞ KOŞULU olarak uygulanır: sohbetten yayın workspace bazlı özellik bayrağıyla gelir ve bayrak eval seti geçince açılır. Bayrak kapalıyken kart 'Taslağı aç' ile panele gider ve sebebi yazar. 2) Panel yolu her zaman açık: model reddinde ya da kapsam dışı istekte 'Asistan bunu yapamadı, panelden devam et' + Taslağı aç; AI hiçbir işin tek yolu olmaz. 3) İlk kapsam yalnız Meta. Google'da AI salt okur; Google yazma yolu canlıda en küçük bütçey…

## C-20. Akıllı Boost karar 5 gereği kapsam dışı; yeni modülle sınırı

1) Acemi'deki 'Paylaşımımı öne çıkar' (niyet 8) nasıl çalışsın? (a) Kart olmasın; Akıllı Boost/elle boost ekranına yönlendirsin (önerilen, karar 5'e en uyumlu); (b) Kart olsun ama bugünkü boost kurallarıyla (yalnız Instagram, Advantage+ kitle kapalı, onaysız hemen yayın) ve bu kurallar kartta yazsın; (c) Kart olsun ve yeni modülün kurallarıyla (Advantage+ açık, otomatik yerleşim, PAUSED-geri oku-aç) ayrı bir yoldan yayınlasın (boost'tan farklı ikinci bir boost davranışı doğar). 2) Sağlık sektörü workspace'lerinde Akıllı Boost kart üretimi ve elle boost: (a) kapatılsın (hukuk görüşü gelene kadar önerilen); (b) açık kalsın, ekranda mevzuat uyarısı çıksın; (c) hukuk görüşü beklensin, o zamana kadar bugünkü hâl.

*Tasarımdaki varsayılan:* Sınır yazılı ve kilitli olur: (1) Akıllı Boost ve elle boost yolu (otomatik kartlar, boost-executor, buildBoostAdSetParams, IG yerleşimi, advantage_audience 0, doğrudan ACTIVE kurulum) yeni modülün DIŞINDA kalır; yeni modül boost-executor'ı ÇAĞIRABİLİR, DEĞİŞTİREMEZ, kendi boost kodunu yazamaz. README §5.1'deki 'tek yayın yolu, boost dahil' cümlesi, §7.2-1 ve §10 aşama 3/6 düzeltilir: tek durum makinesi yeni modülün İÇİNDE; boost korunan ikinci yol. draft-publish.publishBoost yeni modülün parças…

## C-22. Atıf kuralı: iki insights parametresi 2025-06-10'dan beri yok sayılıyor

Advetics'in kurduğu reklam setlerinde standart atıf penceresi ne olsun? (a) 7 gün tıklama + 1 gün görüntüleme (Meta varsayılanına en yakın, önerilen); (b) (a) + 1 gün etkileşim (engaged view; Ads Manager'da kurulan kampanyalarla daha karşılaştırılabilir, ama CPA daha iyimser görünür); (c) yalnız 7 gün tıklama (en temkinli, görüntüleme dönüşümleri sayılmaz). Not: pencere bir hedefte desteklenmiyorsa o niyet için desteklenen en yakın pencere yazılır ve ekranda söylenir.

*Tasarımdaki varsayılan:* (1) Koruma istekten KURULUMA taşınır. CLAUDE.md maddesi şöyle yeniden yazılır: 'Meta 2025-06-10'dan beri use_unified_attribution_setting ve action_report_time'ı yok sayıyor; atıf ad set'in attribution_spec'inden gelir, rapor zamanı her durumda mixed; 7d_view ve 28d_view 2026-01-12'den beri boş. Advetics kurduğu her ad set'e attribution_spec'i AÇIKÇA yazar ve geri okur; raporda her satırın attribution_setting'i gösterilir.' (2) attribution_spec niyet satırı başına tanımlanır, çünkü desteklenen pe…

## C-27. Advantage+ creative kapsamı

Meta'nın yapay zekâyla metin ya da görsel ÜRETEN Advantage+ creative özellikleri (metin varyasyonu, görseli genişletme, arka plan üretme, görsel içi metni yeniden yazma) için hangisi? (a) Hiçbir yüzde açılmasın: en güvenlisi; marka metnini yalnız müşteri ve Advetics yazar, 'Yayınla' her zaman tek adım kalır. (b) Yalnız Gelişmiş'te, müşterinin kayıtlı onayıyla açılabilsin; bu reklamlarda 'Yayınla' iki adım olur (Meta'nın ürettiğini gör, sonra aç), çünkü Meta bunu zorunlu tutuyor. Konut, sağlık ve finans müşterilerinde iki seçenekte de kapalı kalır. Ayrıca: üretim YAPMAYAN kadraj uyarlaması (Meta'nın görseli yerleşime göre kendisinin kırpması) Gelişmiş'te müşteri onayıyla açılabilsin mi, yoksa kırpımı her zaman Advetics mi yapsın?

*Tasarımdaki varsayılan:* Karar 2 Advantage+ KİTLE ve YERLEŞİMİ kapsıyor; Advantage+ CREATIVE'i kapsamıyor. Varsayılan: creative_features_spec içinde tanınan her anahtar açıkça OPT_OUT gönderilir. adapt_to_placement da buna dahil, çünkü gönderilmezse opt-in geliyor. Özellikler iki sınıfa ayrılır. (A) Üretken olmayan uyarlama (adapt_to_placement aspect_ratio_config ile sınırlı, image_touchups): Acemi'de ve AI'da kapalıdır. Gelişmiş'te workspace'te kayıtlı müşteri onayıyla açılabilir ve karar 1'in tek adımlı yolunda kalır.…

## C-29. Ana metin sınırı

Zorunlu yasal ibareler (indirimde önceki fiyat ve tarih, konutta brüt/net alan, yasal uyarı) Reels'te metnin ilk 44 karakterinde görünmüyor. Bunlar nerede taşınsın? (a) Ana metnin başında (ilk 125 karakter) zorunlu olsun; Reels'te 'devamı' altında kalabileceği kabul edilir. (b) Ana metnin başında VE Advetics'in şablonuyla görselin güvenli bandında (yasal uyarılı Reels'te alt %40) basılsın; en güvenlisi ama tasarıma yazı eklenir. (c) Yalnızca görselin üzerinde basılsın. Bu seçim için bir hukuk görüşü de alınması önerilir.

*Tasarımdaki varsayılan:* Tek sabit tablosu (packages/shared) üç ayrı katman taşır ve sayaç, derleyici reddi ve AI istemi bu tablodan türetilir. (1) SERT SINIR: etkin yerleşimlerin en küçüğü. Advantage+ yerleşim açıkken (karar 2: Acemi, AI ve Gelişmiş varsayılanı) Threads de kapsandığı için sınır 1.000 karakter. Derleyici aşan metni yayına almaz; sayaç 'Threads'te 1.000 karakteri aşan reklam gösterilmez' cümlesiyle kilitlenir. Yalnızca Gelişmiş'te Threads elle çıkarıldıysa sınır 2.200 olur. (2) GÖRÜNÜR KESME NOKTALARI: e…

## C-32. Bütçe adımı: hazır kartlar, tahmin ve havuz medyanı

Bütçe adımında, başka müşterilerinizin (Advetics havuzundaki benzer hesapların) son 90 günlük sonuç başı maliyetini isimsiz bir medyan olarak göstermek ister misiniz? (A) Hayır, yalnızca o müşterinin kendi hesabı ve workspace'inin geçmişi kullanılsın; geçmiş yoksa 'veri yok' yazsın (önerilen). (B) Evet, ama önce hukuk görüşü alınsın (müşteri sözleşmesi, KVKK, Meta Platform Şartları), müşterilere bildirim maddesi eklensin ve yalnızca aynı sektörde en az 5 farklı şirket varsa gösterilsin. (C) Yalnızca ajansın kendi iç kullanımı için (Gelişmiş mod), müşteri şirketlerin kullanıcılarına hiç gösterilmeden.

*Tasarımdaki varsayılan:* Bütçe adımı Meta'nın sonuç tahminine (delivery_estimate: daily_outcomes_curve, estimate_dau, budget_guardrail) HİÇ bağlanmaz, çünkü bu alanlar 2026-10-27'de bütün sürümlerde kalkıyor ve yerine bir şey gelmiyor. Sabit 100/250/500 TL kartları kaldırılır. Tutar alanı boş gelir, hiçbir seçenek seçili gelmez (README §6.5). Alanın yanında yalnızca hesaplanmış ve etiketli bilgiler durur: (a) hesabın canlı minimum_budgets değerinden gelen alt sınır (birimi canlıda ölçülene kadar gösterilmez); (b) reache…

## C-40. İlk tur niyet seti ve Acemi akışının uzunluğu

İlk turda Acemi'de hangi niyet kartları olsun? (a) Yalnız Form, WhatsApp ve Site; 'Sitemden satış' ölçümü hazır workspace'lerde kendiliğinden eklensin; 'Paylaşımımı öne çıkar' yeni akışa hiç girmesin, Akıllı Boost ve mevcut boost ekranı olduğu gibi kalsın (önerilen); (b) (a) + 'Paylaşımımı öne çıkar' kartı yalnız ELLE öne çıkarma olarak yeni akışa girsin, Akıllı Boost'a dokunulmasın; (c) README'deki gibi 6 niyet (Messenger ve arama canlı doğrulama sonrası) ve Akıllı Boost yeni akışın otomatik hâli olarak bağlansın.

*Tasarımdaki varsayılan:* Kural: SORU sayısı azalır, KARAR sayısı azalmaz. Her karar ya kullanıcıdan, ya workspace profilinden ya da derleyiciden gelir ve 'Gözden geçir ve yayınla' ekranında üç blokta görünür: 'Senin seçtiklerin', 'Workspace ayarından', 'Meta'nın otomatik yaptıkları'. Acemi'de reklam başına SORU kullanıcının 2026-09-21 tarifindeki beş adımla sınırlıdır: (1) niyet, (2) görsel / video, (3) metin ('AI ile yaz' dahil), (4) bütçe: tutar ve tip aynı adımda iki sekme ('Günlük / Toplam'), tip tahmin edilmez, 'Sü…

## C-46. Form türü ve OTP varsayılanı; otomatik yerleşime etkisi

Workspace form şablonunda form türü ve telefon doğrulaması (OTP) varsayılanı ne olsun? (a) Sektöre göre önden seçili gelsin, ajans onaylasın: konut ve eğitimde yüksek niyet + OTP; B2B'de yüksek niyet, OTP kapalı; diğer sektörlerde hacim (önerilen); (b) Her zaman 'hacim', OTP kapalı; yüksek niyet ve OTP yalnız ajans elle açarsa; (c) Varsayılan olmasın, her workspace kurulumunda ajans form türünü ve OTP'yi açıkça seçmek zorunda olsun.

*Tasarımdaki varsayılan:* Form türü ve telefon doğrulaması (OTP) Acemi reklam akışında SORULMAZ; workspace'in Base / Marka Merkezi'ndeki FORM ŞABLONUNUN ayarıdır ve bir kez seçilir (C-40 ile tutarlı). Seçim ekranında sonuçlar kullanıcının dilinde yazılır: yüksek niyet ve OTP için 'Reklamınız yalnız telefonda Facebook ve Instagram'da görünür; başvuru sayısı düşer, başvuru başı maliyet artabilir'; OTP için ayrıca 'Sabit hat ya da iş telefonu yazan kişi formu gönderemez ve başvuru sayılmaz'. Varsayılan politika kullanıcı ka…

## C-47. Karar 2'den sapma: tek bir anahtar değil, derlenmiş gövdeden hesaplanan durum; yetki kullanıcı kararı

Üç karar gerekiyor. 1) Gelişmiş'te karar 2'den sapmayı (otomatik kitle ya da yerleşimi kapatma, gerekçe zorunlu) kim yapabilir? (a) yalnız ajans kullanıcıları, (b) ajans + müşteri şirketinin admini, (c) hiç kimse; sapma yalnız platform dayattığında olur. Öneri: (a). 2) Hesap düzeyi Meta kontrollerini (yerleşim hariç tutma, envanter filtresi; hesaptaki BÜTÜN kampanyaları etkiler) Advetics yazabilsin mi? (a) Hayır, yalnız okur ve gösterir; ayar Ads Manager'dan yapılır. (b) Evet, yalnız ajans yöneticisi ve kayıtlı müşteri onayıyla. (c) Evet, hesabın sahibi şirketin admini de. Öneri: ilk sürümde (a). 3) Konut reklamı veren ve marka güvenliği isteyen müşteride (hesap kontrolleri konutta işlemiyor) ne yapalım? (a) Kampanya düzeyinde yerleşim hariç tutulur, Advantage+ yerleşim kapanır, sapma rozeti gösterilir. (b) Marka güvenliği isteği konutta kabul edilmez, ekranda sebebi yazılır. Öneri: (a), gerekçe zorunlu.

*Tasarımdaki varsayılan:* KURAL: (1) SAPMA HESAPLANIR, BEYAN EDİLMEZ. Karar 2'nin bölüm bölüm durumu (kitle: 'Meta seçiyor' / 'Sınırladın'; yerleşim: 'Meta seçiyor' / 'Sınırladın') DERLENMİŞ gövdeden saf bir fonksiyonla hesaplanır. Rozet, onay ekranındaki 'Kapattıklarımız' bloğu, AI onay kartındaki aynı blok ve geri okuma beklentisi bu tek fonksiyondan türer. Sapma yalnız Gelişmiş anahtarından doğmuyor; şunlar da kararı delen girdilerdir ve fonksiyona girer: konut kategorisi, yalnız mobil akış isteyen 'daha yüksek niyet'…

## C-48. App Review ve Business Verification durumu

Bekleyen App Review başvurusu (2026-10-01, ekran kayıtları araçta eksik görünüyor) için: (a) Başvuru iptal edilsin; canlı tur koşup 30 günlük çağrı koşulu ve ekran kayıtları hazırlandıktan sonra C-49'daki daraltılmış kapsamla yeniden başvurulsun (önerilen); (b) Sonuç beklensin (yaklaşık bir hafta), bu arada canlı tur koşsun, ret gelirse daraltılmış kapsamla yeniden başvurulsun; (c) Önce öbür geliştiriciye başvuruyu kimin yaptığı ve App Dashboard'da ekran kayıtlarının yüklenip yüklenmediği sorulsun, karar ondan sonra verilsin.

*Tasarımdaki varsayılan:* (1) Gerçek durum (2026-10-06 canlı salt okuma): App Review başvurusu 2026-10-01 22:23 UTC'den beri PENDING, Business Verification geçiyor, istenen izinlerin hiçbirinde ekran kaydı tamamlanmamış görünüyor, çoğunda api_precheck eksik; başvuru sürerken yeni başvuru yapılamıyor. `grant_status: REJECTED` (gerekçesiz) 'henüz verilmedi', `is_approved: true` ise onay DEĞİL; ikisi de panelde ya da belgede onay/ret diye okunmaz. (2) DURUM.md §6 ('Başvurulmadı/Yapılmadı') ve §7'deki 'BV'yi başlat' maddesi,…

## C-49. App Review kapsamı modülün ihtiyacıyla örtüşmüyor

1) Yeniden başvuru kapsamı: (a) Önerilen liste (ads_management, ads_read, business_management, pages_show_list, pages_read_engagement, pages_manage_ads, read_insights, instagram_basic, instagram_manage_insights, leads_retrieval, Access Tier; catalog_management ve ads_mcp_management çıkarılır); (b) İlk başvuru yalnız reklam yönetimi, lead ve Instagram izinleri ikinci başvuruya (form niyeti o zamana kadar müşteri hesaplarında kapalı kalır); (c) Mevcut kapsam korunur, yalnız eksikler eklenir (catalog_management ret riski sürer). 2) Formdan gelen kişilerin İYS kaydı: (a) Advetics İYS'ye kendisi yazsın (entegrasyon gerekir, hukuk görüşü şart); (b) Advetics yalnız listeyi ve rıza kanıtını müşteriye versin, kaydı müşteri yapsın, panel 3 iş günü sayacı göstersin (önerilen); (c) Hukuk görüşü gelene kadar form niyeti yalnız ajansın kendi hesabında açık.

*Tasarımdaki varsayılan:* (1) Başvuru TERS kapsanmış: bugün kullanılan leads_retrieval, instagram_basic ve instagram_manage_insights dışarıda; hiç istenmeyen catalog_management (OAuth'ta bile yok, api_precheck karşılanamaz) ve hiçbir kod yolunu beslemeyen ads_mcp_management içeride. Yeni başvuru kapsamı: 'Create & manage ads' use case'i (ads_management, ads_read, business_management, pages_show_list, pages_read_engagement, pages_manage_ads, read_insights, Access Tier) + 'Capture & manage ad leads' use case'i (leads_retri…

## C-50. Sistem kullanıcısı token'ına geçiş ve bağlantı modeli

Bağlantı modeline geçiş ne zaman olsun? (a) App Review (Advanced Access + Tech Provider) onaylandıktan sonra: önce sistem kullanıcısı gölge modda, ölçüm temizse yazma taşınır, sonra kişisel token kapatılır (önerilen); (b) Yeni modül kişisel token'la çıkar, geçiş ayrı bir proje olarak sonra yapılır (çalışan ayrılırsa 481 hesap aynı anda düşme riski sürer); (c) Yalnız müşterinin kendi bağlantısı (FBL4B+BISU) önce gelir, ajans havuzu kişisel token'da kalır. Ayrıca: Business Manager'da sistem kullanıcısını hangi admin, ne zaman oluşturacak?

*Tasarımdaki varsayılan:* (1) Kişisel token'dan sistem kullanıcısına (ajans havuzu) ve FBL4B+BISU'ya (müşterinin kendi bağlantısı) geçiş sıralıdır ve hiçbir adım atlanmaz: Advanced Access + Tech Provider onayı → sistem kullanıcısı bağlantısı GÖLGE modda (yalnız okuma; hesap listesi ve görevler mevcut bağlantıyla karşılaştırılır, fark ekranda raporlanır) → canlı turda video yolları ölçülür → yazma yolu taşınır → kişisel token kapatılır. Onay gelmeden yapılan geçiş 481 hesabın okumasını düşürebilir; Tech Provider eksikliği…

## C-51. Çok platformlu grup yayını: karar 1 yalnız Meta; Google satırı asla 'yayınlandı' demez

Tek adımlı yayın kararı (kur, kontrol et, aç) Google için de geçerli mi? (a) Önerilen: şimdilik yalnız Meta; Google kampanyaları duraklatılmış kurulur ve ekranda 'Google'da açmak ajansın işi' yazar; Google yolu ajans hesabında en küçük bütçeyle doğrulanınca ayrı iş olarak eklenir. (b) Yeni modülün ilk sürümünden Google tamamen çıkarılır, yalnız Meta. (c) Google'a da hemen uygulanır (önerilmez: yazma yolu canlıda hiç çalışmadı).

*Tasarımdaki varsayılan:* 1) Karar 1 (kur, geri oku, aç) yalnız Meta'ya uygulanır. Google yazma yolu ajansın kendi hesabında en küçük bütçeyle canlıda doğrulanana ve Google için ayrı geri okuma listesi yazılana kadar Google'da geri okuma ve açma YOK. 2) Yeni modülün ilk aşaması yalnız Meta; Acemi yüzde ve sohbette çok platformlu grup yayını yok. 3) Gelişmiş yüzde grup kalırsa düğme tek anlam taşır: 'Meta'da yayınla · Google'da kapalı kur'. Sonuç platform başına ayrı satır: Meta 'kuruldu, kontrol edildi, açıldı / inceleme…

## C-52. Meta 10.6.a: arayüz iş dilinde kalır; Meta terimleriyle dışa aktarım geri okunan hâlden üretilir

Meta 2027-02-03'ten itibaren müşteri isterse Meta harcamasını ajans ücretinden AYRI ve ücret yapısıyla göstermenizi istiyor. (a) Ajans ücreti Advetics'te workspace başına 'ücret yapısı' olarak tutulsun ve dışa aktarıma eklensin; (b) Ücret Profaj sözleşmesinden ayrıca verilsin, Advetics yalnız Meta harcamasını ve ayarlarını dışa aktarsın. Ayrıca: müşteri (şirket admini) dışa aktarımı panelden kendisi alabilsin mi, yoksa yalnız ajans mı alsın?

*Tasarımdaki varsayılan:* Gerçek çelişki yok: 10.6.a arayüz dilini değil, son reklamveren İSTERSE sunulacak bir çıktıyı şart koşuyor (yürürlük 2027-02-03). Acemi yüz iş dilinde kalır (karar 5 değişmez). Yayın kaydı her sürümde derleyicinin gönderdiği gövdeyi, Meta'dan GERİ OKUNAN değerleri (objective, optimization_goal, billing_event, bid_strategy, destination_type, attribution_spec, targeting dahil targeting_automation, etkin yerleşimler, bütçe) ve niyet→Meta eşleme tablosunun sürümünü saklar (karar 1'in geri okuması bu…
