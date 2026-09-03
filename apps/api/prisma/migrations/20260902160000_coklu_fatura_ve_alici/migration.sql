-- ═══ BİRDEN ÇOK FATURA DOSYASI ve BİRDEN ÇOK MAİL ALICISI ═══
--
-- İki ayrı kısıt aynı istekle düştü: bir dönem+platform için tek fatura
-- saklanabiliyordu ve rapor maili tek adrese gidiyordu.

-- ─────────────────────────────────────────────────────────────────────────
-- 1) FATURA: TEKİLLİK KALDIRILMIYOR, DOĞRU ANAHTARA TAŞINIYOR
-- ─────────────────────────────────────────────────────────────────────────
--
-- Eski kısıt (client, platform, donem) ve gerekçesi şuydu: "iki fatura
-- duruyorsa maile hangisinin gireceği belirsiz kalırdı". O gerekçe artık
-- geçersiz — cevap "hepsi". Ama tekilliği tamamen atmak yeni bir sessiz hata
-- açardı: kullanıcı aynı PDF'i iki kez yüklerse müşteriye AYNI fatura iki ek
-- olarak gider ve bunu ilk gören müşteri olur.
--
-- Bu yüzden tekillik dosyanın İÇERİĞİNE taşınıyor: aynı dönem+platform için
-- FARKLI dosyalar serbest, AYNI dosya iki kez değil.
DROP INDEX IF EXISTS "fatura_belgeleri_client_platform_donem_key";

-- SHA-256, 64 hex karakter. Dosya adı YETMEZ: aynı fatura iki kez indirilince
-- "fatura (1).pdf" oluyor ve ada bakan bir kontrol onu farklı sanardı.
--
-- ┌─ BİLİNEN VE KABUL EDİLEN BOŞLUK ──────────────────────────────────────┐
-- │ Bu migration'dan ÖNCE yüklenmiş satırların hash'i NULL kalıyor: dosya  │
-- │ baytları diskte ve SQL içinde okunamıyor. Postgres tekil indekste      │
-- │ NULL'ları farklı saydığı için o satırlar mükerrer bekçisinin DIŞINDA:  │
-- │ aynı PDF tekrar yüklenirse ikinci satır oluşur ve maile aynı belge iki │
-- │ kez girer.                                                             │
-- │                                                                        │
-- │ Kapatılmadı çünkü maruziyet neredeyse sıfır: fatura özelliği bir gün   │
-- │ önce (20260902130000) yayına girdi ve üretimde bir avuç satır var.     │
-- │ Kendiliğinden de kapanıyor — o satırlar silindikçe boşluk yok oluyor.  │
-- │ Bir geri doldurma script'i yazmak, birkaç günlük bir durum için kalıcı │
-- │ bir işletim adımı eklemek olurdu.                                      │
-- └────────────────────────────────────────────────────────────────────────┘
ALTER TABLE "fatura_belgeleri" ADD COLUMN "dosya_hash" VARCHAR(64);

-- YÜKLEM YOK — VE BU BİLİNÇLİ.
--
-- Önce `WHERE dosya_hash IS NOT NULL` yazmıştım: bu migration'dan ÖNCE
-- yüklenmiş satırların hash'i yok (dosyalar diskte, SQL içinde hesaplanamaz)
-- ve onları indeksin dışında tutmak gerektiğini sanıyordum. GEREKMİYOR:
-- Postgres tekil indekste NULL'ları BİRBİRİNDEN FARKLI sayıyor, yani hash'i
-- NULL olan iki eski satır zaten çakışmıyor.
--
-- Yüklemi atmanın bedava olmayan bir faydası var: kısmi indeksi Prisma
-- bildiremiyor ve şema ile veritabanı ayrışıyordu (Prisma yüklemsiz bir
-- tekillik bildirip ona göre `findUnique` üretirken veritabanında başka adlı,
-- kısmi bir indeks duruyordu). Düz indeks ikisini aynı şey yapıyor.
--
-- `ON CONFLICT` de sadeleşiyor: kısmi indeks çakışma hedefi olarak ancak
-- yüklemiyle birlikte tanınıyor ve o yüklemi çağrı yerinde tekrarlamak
-- gerekiyordu.
CREATE UNIQUE INDEX "fatura_belgeleri_ayni_dosya_key"
  ON "fatura_belgeleri" ("client_id", "platform", "donem", "dosya_hash");

-- SIRALAMA İNDEKSİ. Artık dönem başına birden çok satır var ve rapor eki
-- kurarken sıra BELİRLİ olmalı: iki gönderimde ekler farklı sırayla dizilirse
-- aynı raporun iki kopyası farklı görünür.
CREATE INDEX "fatura_belgeleri_client_donem_yuklenme_idx"
  ON "fatura_belgeleri" ("client_id", "donem", "uploaded_at");

-- ─────────────────────────────────────────────────────────────────────────
-- 2) PLANLI RAPOR: TEK ALICI → ALICI LİSTESİ
-- ─────────────────────────────────────────────────────────────────────────
--
-- `TEXT[]` seçildi, JSONB değil: değerler homojen (hepsi adres), sorgulanacak
-- bir iç yapısı yok ve Prisma `String[]` olarak birinci sınıf destekliyor.
-- JSONB, tip güvenliği olmayan bir `unknown` alanı ve her okumada elle
-- süzgeç demekti.
--
-- NOT NULL + varsayılan boş dizi: NULL ile boş dizi arasındaki ayrım burada
-- hiçbir şey anlatmıyor ("alıcı seçilmemiş" ikisinde de aynı) ve iki hâli
-- ayırt etmeyi unutan bir sorgu sessizce yanlış davranırdı.
ALTER TABLE "report_schedules" ADD COLUMN "to_emails" TEXT[] NOT NULL DEFAULT '{}';

-- MEVCUT VERİ TAŞINIYOR. Bu adım atlanırsa her planın alıcısı sessizce
-- silinir ve planlar müşterinin kayıtlı adresine düşer — hata vermeden,
-- yanlış kişiye.
UPDATE "report_schedules"
   SET "to_emails" = ARRAY["to_email"]
 WHERE "to_email" IS NOT NULL AND btrim("to_email") <> '';

ALTER TABLE "report_schedules" DROP COLUMN "to_email";

-- ─────────────────────────────────────────────────────────────────────────
-- 3) MÜŞTERİNİN KAYITLI RAPOR ALICILARI: TEK ADRES → LİSTE
-- ─────────────────────────────────────────────────────────────────────────
--
-- Gönderim ve plan alıcıları çoğullaşınca YEDEK adresin tekil kalması, her
-- gönderimde adresleri elle yazmak demekti: müşteride birden çok yetkili
-- olması kural, istisna değil.
--
-- ALAN ADI DEĞİŞTİ (`contact_email` → `contact_emails`) ve bu bilinçli:
-- kolonu aynı adla çoğullaştırmak, henüz güncellenmemiş bir sorgunun
-- SESSİZCE dizi yerine dizge beklemesi demekti. `$queryRaw` DENETİMSİZ bir
-- dönüşüm — tip yalan söyler, alan `undefined` gelir ve onu kullanan kod
-- sessizce yanlış üretir. Ad değişince o sorgular DERLEME ya da ÇALIŞMA
-- anında patlıyor; sessiz kalmıyor.
ALTER TABLE "clients" ADD COLUMN "contact_emails" TEXT[] NOT NULL DEFAULT '{}';

UPDATE "clients"
   SET "contact_emails" = ARRAY["contact_email"]
 WHERE "contact_email" IS NOT NULL AND btrim("contact_email") <> '';

-- Tekil kolonun CHECK kısıtı da onunla birlikte gidiyor.
ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "clients_contact_email_chk";
ALTER TABLE "clients" DROP COLUMN "contact_email";

-- LİSTENİN HER ELEMANI ADRES OLMAK ZORUNDA. Uygulamada Zod kontrol ediyor
-- ama veritabanı son savunma hattı: buraya sızan bozuk bir eleman, gönderimi
-- SMTP hatasıyla düşürür ve sebebi hiçbir ekranda görünmez.
--
-- ALT SORGU YOK, `unnest` YOK: Postgres CHECK kısıtında ikisine de izin
-- vermiyor (alt sorgu doğrudan reddediliyor, küme döndüren fonksiyon skaler
-- bağlamda geçersiz). Dizi virgülle birleştirilip TAMAMI tek bir düzenli
-- ifadeyle sınanıyor; adreslerin kendisinde virgül ve boşluk zaten yasak
-- olduğu için birleştirme belirsizlik üretmiyor.
ALTER TABLE "clients" ADD CONSTRAINT "clients_contact_emails_chk"
  CHECK (
    cardinality("contact_emails") = 0
    OR array_to_string("contact_emails", ',') ~
       '^[^@,[:space:]]+@[^@,[:space:]]+\.[^@,[:space:]]+(,[^@,[:space:]]+@[^@,[:space:]]+\.[^@,[:space:]]+)*$'
  );
