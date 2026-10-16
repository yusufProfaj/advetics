# Veritabanı, Prisma, migration, RLS ve sahiplik tuzakları

> CLAUDE.md'den taşındı (2026-10-16, token düzeni). İçerik DEĞİŞMEDİ, yalnız konuya göre ayrıldı.
> Yeni ders buraya, ilgili konu dosyasına EKLENİR; CLAUDE.md'ye yalnız tek satırlık işaret gider.

- **`Prisma.sql` YORUMUNUN İÇİNDE İNTERPOLASYON DA KULLANMA.** Backtick
  tuzağının kardeşi: etiketli şablonda yorumun içindeki `${...}` metin değil
  BAĞLI PARAMETRE oluyor ve sorgunun ortasına yerleşip onu bozuyor. Bir
  sabitin DEĞERİNİ yoruma yazma, ADINI yaz. (Bu tuzağı *anlatan* yorumun
  kendisi de aynı sebeple patladı — açıklama kelimeyle yapılmalı.)
- **`Prisma.sql` şablonu içindeki SQL yorumlarında backtick KULLANMA.** Şablonu
  ortasından kapatıyor; hata `TS1005: ';' expected` ve sebebi hiç belli olmuyor.
  `sql-template.spec.ts` bunu tarıyor. **Kural `--` satırlarıyla sınırlı DEĞİL:
  `/* */` blok yorumu ve sorgunun üstündeki JSDoc de aynı şablonun içinde.**
  Bu oturumda dört kez aynı yere düşüldü ve tarama yalnızca `--` baktığı için
  hiçbirini yakalamadı; TypeScript'in gösterdiği satır her seferinde kusursuz
  görünen SQL'di. `sql-template.spec.ts` artık yorum biçimine HİÇ bakmayan
  ikinci bir dedektör taşıyor (`erkenKapananSablonlar`): bir `Prisma.sql`
  şablonu kapandıktan sonra gelen ilk anlamlı karakter SQL gibi görünüyorsa
  şablon ortasından kapanmış demektir.
- **BAĞLI SAYI PARAMETRESİ POSTGRES FONKSİYONUNA TİPSİZ GİTMEZ.** `$queryRaw`
  içinde `${sayi}` bağlı parametre ve Prisma onu `bigint` gönderiyor;
  `make_interval(mins => bigint)` diye bir aşırı yükleme YOK. Üretimde
  "42883 function does not exist" ile Akıllı Boost listesinin tamamı açılmadı
  (2026-10-09). **PGlite bunu YAKALAYAMIYOR**: parametre tipini sorgudan
  kendisi çıkarıyor, test yeşil. `${x}::int` yaz ya da sabitse `Prisma.raw`
  (`metrik-isleri.ts`). `fonksiyon-parametre-tipi.spec.ts` tarıyor.
- **Yeni tablo ekleyince `test/pglite-harness.ts` içindeki `TRUNCATE` listesine
  ekle.** Yoksa testler arası veri sızar — en yanıltıcı test hatası türü.
- **Yeni tablo ekleyince `prisma/sql/02_rls.sql` içindeki tablo listesine ve
  politikalara ekle.** `rls-coverage.spec.ts` eksikse düşer.
- **`client_id` taşıyan yeni tablo `workspace-tasima.ts#WORKSPACE_TABLOLARI`
  içinde bir KARAR ister** (workspace başka şirkete taşınınca ne olacağı).
  `workspace-tasima.spec.ts` şemayı tarayıp eksikse düşüyor — Bölüm 4'te
  `audience_templates` için tam böyle yakalandı. TRUNCATE ve RLS listesiyle
  birlikte üçüncü durak.
  **AMA `(client_id, org_id)` KOMPOZİT ANAHTARI `ON UPDATE CASCADE` İLE
  BAĞLI TABLO ELLE TAŞINMAZ** (2026-10-12, Paket A kapısında bulundu):
  `workspaceTasi` önce listedeki tabloların `org_id`sini yazıyor,
  `clients.org_id` EN SONDA değişiyor; arada satır, `clients`ta henüz
  olmayan bir (workspace, yeni şirket) çiftine bakıyor ve kompozit anahtar
  ihlaliyle transaction geri alınıyor. 22 tablo (AdvCampaign, rehber,
  strateji, kurulum, hazırlama, iyilestir…) listedeydi: o tablolardan
  birinde tek satırı olan her workspace şirket DEĞİŞTİREMİYORDU. Bu tablolar
  `CASCADE_ILE_TASINANLAR`ta — Postgres kendisi taşıyor; spec migration'daki
  kompozit anahtarları tarayıp iki listeyi karşılaştırıyor.
- **Enum'a değer eklemek AYRI migration dosyası ister.** `ALTER TYPE ... ADD
  VALUE` ile eklenen değer aynı transaction içinde kullanılamıyor.
- **ENUM'DAN DEĞER ÇIKARIRKEN O TİPE BAKAN KISITLARI ÖNCE DÜŞÜR.** Postgres'te
  `DROP VALUE` yok; tip yeniden kuruluyor (`RENAME` → `CREATE` → `ALTER COLUMN
  ... USING`). Ama bir CHECK kısıtının yüklemindeki literal, kısıt KURULDUĞU
  ANDAKİ tipe çivili: kolon yeni tipe geçerken Postgres kısıtı yeniden
  doğruluyor ve `ERROR: operator does not exist: "Role" <> "Role_eski"` (42883)
  ile düşüyor. Kısıt tip takasından ÖNCE düşürülüp SONRA geri kurulmalı —
  `db:rls` zaten kuracak olsa bile, o adım migrate'ten SONRA koşuyor ve arada
  veritabanı kısıtsız kalır.
- **`pglite-harness` VAR OLAN BİR KISITLA ÇAKIŞAN MIGRATION'I YAKALAYAMAZ.**
  Koşum ortamı şemayı önce BÜTÜN migration'lardan kuruyor, `01_constraints.sql`
  ve `02_rls.sql`i EN SON uyguluyor. Üretimde sıra tam tersi: kısıtlar bir
  önceki deploy'dan beri duruyor. Yani şema nesnelerine dokunan bir migration
  testte yeşil geçip deploy'un ortasında düşebiliyor — ve düştü. Böyle bir
  migration yazarken üretim sırasını ELLE kur: önceki migration'lar → `01_
  constraints.sql` → ESKİ VERİ → sınanan migration. Örnek:
  `roller-uce-indi.spec.ts`.
- **`audit_logs.id` BIGSERIAL**, UUID değil — insert'te `id` verme.
- **UPDATE sonrası YENİ satır, tablonun SELECT politikasından da geçmek
  zorunda.** Bir satırı, kendi görüş alanının DIŞINA taşıyan bir UPDATE
  reddediliyor: `new row violates row-level security policy`. WITH CHECK'i
  gevşetmek çözmüyor, engel SELECT politikasında. Çözüm çağıran tarafta:
  bağlamı daraltan değeri (örneğin `activeClientId`) o istek için kapat.
  `ad-account-pool-rls.spec.ts` bunu kilitliyor.
- **AYNI SQL DESENİ BİR SORGUDA ARIZA, DİĞERİNDE BEDAVA — ÖLÇMEDEN TAŞIMA.**
  `ad_account_id IN (SELECT id FROM ad_accounts WHERE sync_enabled)` panelde
  yavaşlığın TAMAMIYDI (`loops=8054`, 1.630 ms) ve diziye çevrilerek
  düzeltildi. Aynı desen `reports.service.ts` içinde de duruyor ve orada
  düzeltme ZARAR EDİYOR: rapor TEK workspace kapsamında koşuyor, yani
  `ad_account_id` bir avuç ayrı değer alıyor, Postgres `Memoize` koyuyor
  (`Cache Key: i.ad_account_id · Hits: 44996 Misses: 4`) ve politika 45 bin
  kez değil DÖRT kez değerlendiriliyor. Düzeltmenin bedeli ise satır sayısına
  değil HAVUZ BÜYÜKLÜĞÜNE bağlı — listeyi önden çekmek 481 hesabı politikadan
  geçirmek demek, rapor başına ~100 ms SABİT. Ayıran şey desen değil
  **süzülen kolonun kaç ayrı değer aldığı**; ölçüm aracı `olcum-rapor.ts`,
  bakılacak sayı `ad_accounts` düğümündeki `loops=`.
  **GÜNCELLEME 2026-10-05 — BU YARGI YANLIŞ ÇIKTI, raporlar da diziye geçti.**
  Yukarıdaki ölçüm sentetik veriyle ve sorguların toplamına bakılarak
  yapılmıştı. Üretimde sorgu sorgu ölçüldü: `Memoize` gerçekten çalışıyordu
  (Hits 580 / Misses 2) ama `dailySeries` alt sorguyla 6.356 ms, diziyle
  604 ms — kova CTE'sini yeniden birleştiren sorguda alt sorgu PLANIN
  ŞEKLİNİ bozuyor, maliyet `ad_accounts` düğümünde görünmüyor. Raporlar
  5–42 sn sürüp transaction sınırında düşüyordu. DERS: `loops=` tek başına
  karar verdirmez; sorguyu iki biçimde de ÖLÇ ve TOPLAMA değil HER SORGUYA
  bak.
- **PRISMA `include` İLİŞKİNİN BÜTÜN KOLONLARINI ÇEKİYOR — `select` KULLAN.**
  `/connections` listesi `include` ile kuruluydu ve havuzda 481 reklam hesabı
  varken her satırın `raw` (tam platform yanıtı, JSONB), `rate_limit_state` ve
  `page_access_token_enc` (ŞİFRELİ SAYFA TOKEN'I) kolonlarını da okuyordu;
  hepsi `toSummary` içinde atılıyordu. Yük YANITTA GÖRÜNMÜYOR — yanıt zaten
  doğru, pahalı olan ona giden yol. Panelde "yavaş" olarak bildirilen şeyin
  ölçülebilir kısmı buydu ve şifreli token'ın belleğe alınması ayrı bir
  sorundu. Alan listesini `satisfies Prisma.XSelect` ile sabit tut ve satır
  tipini `GetPayload<{ select: typeof SABIT }>` ile ONDAN TÜRET: ayrı
  yazılırsa biri güncellenmediğinde TypeScript susar.
  `connections-select.spec.ts` bunu kilitliyor.
- **`$queryRaw<T>` DENETİMSİZ bir dönüşüm — tip yalan söyleyebilir.** Satır
  tipine alan eklerken SELECT'e de eklemeyi unutma; TypeScript hiçbir şey
  demiyor, alan `undefined` geliyor ve onu kullanan kod sessizce yanlış üretiyor.
  Aynı boşluk `serverApiFetch<T>` için de geçerli.
- **Platform çağrısı transaction'ın İÇİNDE olamaz.** `withTenant` etkileşimli
  bir transaction açıyor ve Prisma'nın sınırı 5 saniye; Meta'ya üç-dört çağrı
  üretimde 12,5 saniye sürdü. Transaction ölünce hata bile kaydedilemedi.
  Yürütücüye hazır bir `tx` değil bir ÇALIŞTIRICI ver, platform çağrısı iki
  kısa transaction'ın arasında kalsın.
- **Kayıt yazılamazsa satır `failed` DEĞİL `creating` kalmalı.** `failed`
  yazmak satırı yeniden denenebilir yapar ve platformda İKİNCİ bir kampanya
  açar — para harcayan mükerrerlik.
- **ÇOK ADIMLI SİLMEDE RİSKLİ ADIM ÖNCE, PAHALI ADIM SONRA.** `reset-clients`
  önce 4.340 metrik satırını siliyor, sonra müşterileri siliyordu. Müşteri
  silme `draft_ads_creative_id_fkey` (`onDelete: Restrict`) engeline takıldı ve
  script düştü: **metrik verisi gitti, müşteriler durdu** — en pahalı yarısı
  yapıldı, işe yarayan yarısı yapılmadı. Metrik Meta'da 37 aylık sınıra
  takılıyor ve Google'da yeniden çekmek kota harcıyor; müşteri satırı ucuz.
  Sıra tersine çevrildi. Ayrıca `Restrict` taşıyan bağın işaret ettiği satırlar
  cascade'den ÖNCE elle silinmeli: müşteri silinince iki cascade dalı birden
  işliyor (`ad_creatives` ve `draft_campaigns`) ve Postgres kreatifi silmeye
  kalkınca taslak reklam engeli tetikliyor. `reset-clients-guards.spec.ts`
  sırayı kilitliyor.
- **TEKİL ANAHTARIN KAPSAMI, SAHİPLİĞİ GÜNCELLEYEN KODUN KAPSAMIYLA AYNI
  OLMAK ZORUNDA.** `ad_accounts` tekil anahtarı `(platform, external_id,
  org_id)` — BAĞLANTIYA bağlı değil. Yani aynı reklam hesabı ikinci bir
  bağlantıyla keşfedilince İKİNCİ SATIR AÇMIYOR, var olan satır güncelleniyor
  ve `connection_id` yeni bağlantıya geçiyor. Ama upsert `client_id`'yi
  bilerek güncellemiyordu (havuz modelinde doğruydu: "Hesapları yenile"
  atamaları sıfırlamamalı). Sonuç yarım bir satırdı: BAĞLANTISI yeni
  workspace'i, ATAMASI hâlâ boşu gösteriyor. Bu satır `{ connectionId,
  clientId }` ile arayan hiçbir sorguya düşmüyor — izleme açılmıyor, geçmiş
  veri gelmiyor, ekran "bağlandı" diyor. Sahiplenme YALNIZCA `client_id IS
  NULL` satırlarda yapılıyor; başka müşteriye atanmış bir hesabı taşımak,
  gerçek bir belirsizliği sessizce çözmek olurdu. `hesap-sahiplenme.spec.ts`
  bunu kilitliyor.
- **KISMİ TEKİL İNDEKS + SON DURUMU OLMAYAN DURUM MAKİNESİ = KALICI KİLİT.**
  `boosts_active_post_uniq` `'active'` durumunu kapsıyordu ama hiçbir kod yolu
  bir boost'u o durumdan ÇIKARMIYORDU — durum listesinde "bitti" karşılığı
  yoktu. Sonuç: bir gönderi bir kez boostlandıktan sonra BİR DAHA ASLA
  boostlanamıyordu ve belirtisi kodda değil arayüzde görünüyordu ("düğme hep
  kapalı"). Kampanya Meta'da çoktan durmuştu; eksik olan yalnızca bizim
  kaydımızdı. Kısmi indeksin yüklemine bir durum yazarken **o durumdan çıkışı
  kimin yazdığını** göster. `boost-completion.spec.ts` bunu kilitliyor.
- **DENORMALİZE EDİLMİŞ SAHİPLİK KOLONU, SAHİP DEĞİŞİNCE KENDİLİĞİNDEN
  TAŞINMIYOR.** `client_id` on beş tabloda BİLEREK denormalize (RLS
  politikaları join'siz yazılabilsin diye). `assignAdAccount` yalnızca
  `ad_accounts.client_id`'yi güncelliyordu: hesap A'dan B'ye geçince A'nın
  raporunda ARTIK ONA AİT OLMAYAN harcama görünmeye devam ediyor, B hiçbir
  geçmiş göremiyor ve bir sonraki senkronizasyon yeni satırları B'ye yazıp
  eskileri A'da bırakarak geçmişi İKİYE BÖLÜYOR. Üçü de sessiz. Ayrım tek
  yerde: `hesap-verisi-tasima.ts`. Platformun aynası ve ölçülmüş metrik
  TAŞINIYOR (kampanya, grup, reklam, kreatif, metrikler, `sync_jobs`);
  birinin KARARI olan kayıt kalıyor (bütçe, kural, boost, taslak, toplu
  işlem) ve sayısı kullanıcıya söyleniyor. Süzgeç `ad_account_id` — panelde
  atama iki adımlı yapılıyor (önce "Kaldır", sonra "Ata") ve ikinci adımda
  önceki müşteri artık bilinmiyor.
- **UPSERT, DENORMALİZE SAHİPLİK KOLONUNU DA GÜNCELLEMEK ZORUNDA.** Yedi
  `ON CONFLICT DO UPDATE` bloğunun hiçbiri `client_id` yazmıyordu; `creatives`
  upsert'i `ad_account_id = EXCLUDED.ad_account_id` yazıp `client_id`'yi
  atlıyordu. Sonuç: satır yarım — hesabı doğru, müşterisi eski — ve "yeniden
  senkronize et" tavsiyesi de işe yaramıyor. `upsert-client-id.spec.ts`.
- **RLS'Lİ BİR TABLOYA YAPILAN `INNER JOIN` ANA SATIRI SESSİZCE SÜZÜYOR.**
  Rapor planı ve fatura listeleri `JOIN users` taşıyordu (planı kuranın /
  faturayı yükleyenin adı için) ve İKİSİ DE BOŞ DÖNÜYORDU. `users` politikası
  kasıtlı olarak dar: `org_kapsaminda(org_id) AND (is_org_admin() OR id =
  current_user_id())`. Ajans yöneticisi KARDEŞ bir şirkete geçtiğinde
  `ctx.orgId` o şirket oluyor ama `users.org_id` EV şirketi olarak kalıyor
  (`tenant-context.service.ts` bunu bilerek ayırıyor) — kullanıcı KENDİ
  satırını bile okuyamıyor ve join plan/fatura satırlarının TAMAMINI eliyor.
  Belirti kullanıcının cümlesiyle: *"planladığımda planlanan bilgiler
  gözükmüyor, fatura eklediğimde eklenen fatura gözükmüyor ama tekrar
  eklemeye çalıştığımda bu zaten yüklü diyor"*. O son cümle teşhisin anahtarı:
  **mükerrer engeli TABLO seviyesinde bir tekil indeks ve indeks RLS'e TABİ
  DEĞİL** — yani satır yazılmış, SELECT onu görmüyor. KURAL: bir satırın
  görünürlüğüne YALNIZCA kendi politikası karar verir; ad/etiket gibi süsleme
  alanları `LEFT JOIN` ile alınır. `rapor-listeleri-rls.spec.ts` servisin
  GERÇEK sorgusunu kaynaktan çıkarıp çalıştırıyor (kopyalanan bir sorgu
  düzeltilmiş hâli taşır ve servis eski kalsa bile yeşil geçerdi).
- **GÖRÜNMEYEN SATIRI "YOK" SAYMAK YANLIŞ ALARM ÜRETİYOR.** Aynı ekranda
  `sender_ready` alanı `ea.id IS NOT NULL` ile hesaplanıyordu ama
  `user_email_accounts` politikası satırı YALNIZCA sahibine gösteriyor. Yani
  meslektaşın planında cevap her zaman "kimlik doğrulanmamış" çıkıyor ve panel
  ÇALIŞAN bir planı "çalışmayacak" diye işaretliyordu. RLS'li bir tabloda
  "satır yok" ile "satırı göremiyorum" AYNI ŞEY DEĞİL; ayırt edilemiyorsa
  alan üç hâlli olmalı (`true` / `false` / `null` = bilinmiyor) ve arayüz
  yalnızca KESİN bilgide uyarmalı. Yanlış alarm, kullanıcıyı sağlam bir
  kurulumu bozmaya gönderiyor.
- **POLİTİKASI OLMAYAN UPDATE HATA VERMEZ, SESSİZCE SIFIR SATIR ETKİLER.**
  `sync_jobs`'ta yalnızca SELECT ve INSERT politikası vardı; taşıma sekiz
  tablodan yedisini taşıyıp sekizincisini sessizce atlıyordu ve belirtisi
  yeni müşteride "Yapı: hiç · Metrik: hiç" oluyordu — düzeltilen hatanın ta
  kendisi. **Bir RLS testi "patlamadı" ile yetinemez: `RETURNING` ile ETKİLENEN
  SATIRI say.** İlk yazdığım test sekiz tabloyu saydığını sanıyordu ama
  yalnızca ikisine satır yazıyordu; sıfır satırlık UPDATE politikadan bağımsız
  olarak başarılı dönüyor ve test yeşildi. `hesap-tasima-rls.spec.ts`.
  RLS politikaları Prisma migration'ının parçası DEĞİL: `02_rls.sql`
  `deploy.sh` içindeki `db:rls` ile uygulanıyor.
- **AYNI SORGUDAKİ HER DAL AYNI SÜZGECİ TAŞIMALI.** Kural motorunun bütçe
  bekçisinde `spend`, `umbrella` ve `ad_accounts` `client_id` ile süzülüyordu,
  yalnızca `monthly_budgets` join'i atlanmıştı. Hesap el değiştirdiğinde
  bütçe eski müşteride kalıyor (kasıtlı) ve o satır B'nin harcamasına
  bölünüyor — `budget_spent_ratio` koşulu B'nin kampanyalarını DURDURUYOR.
  İki müşterinin de satırı varsa join iki satır üretiyor ve hangisinin
  kazandığı belirsiz.
- **HAVUZ SATIRLARI MÜŞTERİ-KAPSAMLI SAYIMA GİRMEZ — VE RLS SENİ KORUMUYOR.**
  Genel Bakış'taki "N hesap izlenmiyor" sayacı `ad_accounts WHERE sync_enabled
  = false` diyordu. Keşif her hesabı `false` ile yazıyor ve ajansın tek Meta
  kimliği yüzlerce hesap görüyor; `adv_ad_accounts_select` politikası da
  havuzu (`client_id IS NULL`) org yöneticisine BİLEREK açıyor (atama
  ekranının çalışması buna bağlı). Sonuç: her müşterinin panelinde "481 hesap
  izlenmiyor" yazıyordu — uyarı hiçbir zaman sıfıra inmiyor, okunmaz hâle
  geliyor ve GERÇEK bir kapalı hesap aynı cümlenin içinde kayboluyor. Sayım
  `client_id IS NOT NULL` demek zorunda; ekrandaki süzgeç (hesap, platform)
  sayıma da uygulanmalı.
- **TEKİL İNDEKSTE `WHERE ... IS NOT NULL` GENELDE GEREKSİZ.** Postgres tekil
  indekste NULL'ları birbirinden FARKLI sayıyor, yani hash'i olmayan eski
  satırlar yüklem olmadan da çakışmıyor. Yüklemin bedeli var: kısmi indeksi
  Prisma bildiremiyor (şema ile veritabanı ayrışıyor) ve `ON CONFLICT`
  hedefinde yüklemin tekrarlanması gerekiyor.
- **HESABA BAĞLI OLMAYAN KAYIT, HESABA GÖRE SAYAN RAPORA GİRMİYOR.** Şemsiye
  bütçe `ad_account_id IS NULL` ile duruyor; "kalanları say" sorgusu
  `WHERE ad_account_id = $1` dediği için o satır HİÇ görünmüyordu. Oysa
  taşımadan en çok o etkileniyor: ay ortasında hesap gidince eski müşterinin
  harcaması düşüyor, bütçe bekçisi olmayan bir boşluk görüyor ve kuralların
  bütçe ARTIRMASINA izin veriyor. Ayrı sorulup ayrı söyleniyor.
- **"TÜM ŞİRKETLER" MODUNDA `ctx.orgId` EV ŞİRKETİ KALIYOR — YAZMA YOLLARI
  BUNU BİLMEK ZORUNDA.** `tenant-context.service.ts` okuma kapsamını
  `app.tum_sirketler()` ile genişletiyor ama `ctx.orgId`'yi bilerek ev
  şirketinde bırakıyor. Atama yolları `org_id` kolonuna `ctx.orgId` yazıyordu
  ve gerekçe olarak *"clientId doğrulandı, yani hedef workspace AKTİF
  şirkette"* yazılıydı; o cümle bu modda YANLIŞ — `ctx.clientIds` bütün
  kardeş şirketlerin workspace'lerini taşıyor. Sonuç `(client_id, org_id)`
  kompozit yabancı anahtarının ihlali ve panelde TEK BİR CÜMLE: "İlişkili
  kayıt geçersiz". Kompozit anahtarın istediği şey zaten çiftin `clients`ta
  VAR OLMASI, yani `org_id` HEDEF MÜŞTERİDEN okunmalı (`musteriOrgId`).
  Aynı kural türev kayıtlar için de geçerli: abonelik ve kart satırları
  profilin org'undan besleniyor — `ctx`ten yazmak yabancı anahtarı geçer ama
  RLS o satırları workspace'in kullanıcısına HİÇ göstermez.
- **`pglite-harness` TAKLİTLERİ ALANLARI AYRI DEYİMLERE BÖLMEMELİ.** Kompozit
  yabancı anahtar HER DEYİMİN sonunda doğrulanıyor. Gerçek Prisma `client_id`
  ve `org_id`'yi tek UPDATE ile yazıyor; taklit ikiye bölünce ara durum
  oluşuyor ve kısıt patlıyor — yani taklit ÇALIŞAN kodu düşürüyordu. Bir
  testin "gerçek veritabanı" kullanması, gerçek sorguyu kurduğu anlamına
  gelmiyor.
- **HAVUZUN İKİ SAHİBİ VAR — SAHİPLİK BAĞLANTIDAN GELİR, ATAMA ÖDÜNÇ
  VERİR.** Müşteri kendi Meta'sını bağlayınca ikinci bir havuz doğdu ve
  havuz politikası (`org_id = ANY (app.ajans_org_idleri())`) onu da bütün
  kardeş şirketlere açıyordu: Profaj Biltaş'ın içindeyken 3A'nın kendi
  hesabını Biltaş'a atayabiliyor, 3A'nın bağlantısını koparabiliyordu. Sıfır
  hata. Bugün havuz yalnızca KENDİ şirketinde ve AJANS şirketinde görünüyor
  (`app.havuz_kapsaminda`, `manager_accounts.ajans_org_id`). Ajans
  bilinmiyorsa KAPALI düşüyor. Dört kural `hesap-sahipligi.ts` içinde ve
  ikisi RLS'in göremediği yerde: (K1) "tüm şirketler" modunda ATANMIŞ satır
  `org_kapsaminda` ile bütün şirketlere açık, yani bir şirketin atanmış
  hesabı moddayken başka şirkete taşınabiliyordu; tek kapı servis. (K3)
  keşif upsert'i atanmış satırın `connection_id`sini yeni bağlantıya
  geçiriyordu; müşteri bağlantısını kaldırınca AJANSIN atadığı hesabın verisi
  duruyordu. (K2) atama kalkınca satır bağlantısının şirketine dönüyor. (K4)
  şirket admini ajansın atamasını değiştiremiyor. "Ajans" bir tahmin değil,
  kolon: kod bir süre ajansı "en eski şirket" sayıyordu ve o artık RLS'in
  sınırı olamazdı. `musteri-sirketi-izolasyon.spec.ts`,
  `hesap-sahipligi.spec.ts`.
- **`ad_accounts`, `platform_connections` ve `social_profiles` içinde
  `client_id` NULLABLE.** NULL = ajansın havuzunda, müşteriye atanmamış.
  Sahiplik `org_id`'de. Bu satırlar için senkronizasyon kuyruğa GİRMEMELİ —
  `client_id`'si NULL bir `sync_jobs` satırını RLS kimseye göstermez ve iş
  sessizce kaybolur (`assertAssigned()` kullan).
