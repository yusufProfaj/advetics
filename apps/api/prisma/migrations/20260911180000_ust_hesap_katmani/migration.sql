-- =============================================================================
-- ÜST HESAP KATMANI — çoklu üyelik, platform sahibi ve paket
-- =============================================================================
--
-- Üç değişiklik, üçü de aynı isteğin parçası: Advetics'i kuran ekip (Profaj)
-- üst hesap SATACAK. Yani `hello@profaj.com` birden çok üst hesap kurup
-- aralarında geçiş yapabilmeli ve her birinin bir paketi olmalı.
--
-- ═══ 1. BİR KULLANICI ARTIK BİRDEN ÇOK ÜST HESABA ÜYE OLABİLİYOR ═══
--
-- `manager_memberships.user_id` TEKİLDİ ve bu bilinçli bir kilitti. Şemadaki
-- gerekçe şuydu:
--
--   "Çoklu üyeliğe izin vermek, 'hangi üst hesap geçerli' sorusunu açık
--    bırakırdı ve kod sessizce ilkini seçerdi; sessiz seçim bu projede bir
--    hata türü. Gerçekten gerekirse ikinci bir DEĞİŞTİRİCİ (üst hesap
--    seçici) yazılmak zorunda — o zamana kadar belirsizlik şemada kapalı."
--
-- Değiştirici artık yazılıyor (`adv_mgr` çerezi + `/auth/switch-manager`),
-- yani kilidin şartı karşılandı. Belirsizlik açılmıyor: aktif üst hesap
-- ÇEREZDEN geliyor ve üyelik listesine karşı doğrulanıyor — `resolve` hiçbir
-- yerde "ilkini seç" demiyor, seçim yoksa AÇIKÇA ilk üyeliğe düşüyor ve bu
-- oturum yanıtında görünüyor.
--
-- ═══ 2. PLATFORM SAHİBİ ═══
--
-- Üst hesabı SATAN taraf, henüz üyesi olmadığı bir üst hesabı kurabilmeli ve
-- içine girebilmeli. Bunu bir role sıkıştırmak yanlış olurdu: roller bir
-- organizasyonun ya da bir üst hesabın İÇİNDE anlamlı, bu yetki ise ikisini
-- de AŞIYOR.
--
-- RLS DEĞİŞMİYOR ve bu kasıtlı. Platform sahibinin gücü politikalarda değil
-- BAĞLAM ÇÖZÜMÜNDE: hangi üst hesaba geçebileceğini belirliyor. Geçtikten
-- sonra bütün politikalar bugünkü gibi çalışıyor — yani otuz politikanın
-- hiçbirine yeni bir dal eklenmiyor. Politikaya dokunmayan bir yetki,
-- izolasyonu delme riski taşımıyor.
--
-- ═══ 3. PAKET ═══
--
-- Üst hesap bir ÜRÜN olarak satılıyor ve paket kısıtları belirliyor.
-- Kısıtların SAYILARI koda yazılıyor (`PAKET_SINIRLARI`), veritabanına
-- değil: sayıyı iki yerde tutmak, birini güncelleyip diğerini unutmak
-- demekti ve fark yalnızca kısıtın yanlış uygulanmasıyla görünürdü.
-- =============================================================================

-- Varsayılan `ajans` DEĞİL `baslangic`: var olan tek üst hesap (Profaj'ın
-- kendisi) aşağıda açıkça yükseltiliyor. Varsayılanı sınırsız yapmak, sonra
-- açılacak her üst hesabın sessizce sınırsız doğması demekti.
CREATE TYPE "ManagerAccountPaket" AS ENUM ('baslangic', 'buyume', 'ajans');

ALTER TABLE "manager_accounts"
  ADD COLUMN "paket" "ManagerAccountPaket" NOT NULL DEFAULT 'baslangic';

-- VAR OLAN ÜST HESAPLAR AJANS PAKETİNE ALINIYOR.
--
-- Bu migration koştuğu anda üretimde tek bir üst hesap var (Profaj) ve
-- altında 49 şirket duruyor. Varsayılanda bırakmak, bir sonraki "şirket ekle"
-- tıklamasında kısıta takılması demekti — çalışan bir kurulumun sessizce
-- bozulması.
UPDATE "manager_accounts" SET "paket" = 'ajans';

ALTER TABLE "users"
  ADD COLUMN "platform_admin" BOOLEAN NOT NULL DEFAULT false;

-- TEKİLLİK KULLANICIDAN (KULLANICI, ÜST HESAP) ÇİFTİNE GEÇİYOR.
--
-- Kaldırmak DEĞİL, DARALTMAK: aynı kullanıcının aynı üst hesapta iki üyeliği
-- olması hâlâ imkânsız. O çift kalkarsa "hangi rol geçerli" sorusu doğar ve
-- kod sessizce birini seçer.
DROP INDEX IF EXISTS "manager_memberships_user_id_key";
CREATE UNIQUE INDEX "manager_memberships_user_id_manager_account_id_key"
  ON "manager_memberships" ("user_id", "manager_account_id");
