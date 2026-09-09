-- "Beni hatırla" — oturumun KALICI olup olmadığı satırda duruyor.
--
-- Cookie'nin `maxAge`ı tarayıcıdan geri gelmiyor; bilgi burada durmazsa ilk
-- token rotasyonu kalıcı olmayan bir oturumu sessizce kalıcıya çevirir.
--
-- VARSAYILAN `true`: bu kolondan önce açılmış bütün oturumlar kalıcıydı
-- (cookie her zaman `maxAge` ile yazılıyordu). `false` vermek, canlıdaki
-- herkesi bir sonraki tarayıcı kapanışında dışarı atardı.
ALTER TABLE "refresh_tokens"
  ADD COLUMN "persistent" BOOLEAN NOT NULL DEFAULT true;
