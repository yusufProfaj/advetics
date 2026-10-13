-- OAuth state HEDEF BAĞLANTIYI taşıyor (connections.service, reauthorize).
--
-- Yeniden yetkilendirme ve "Ölçüm izinlerini ver" bir BAĞLANTIYI tazeliyor
-- ama dönüş o bağlantıyı bilmiyordu: kimlik + başlatanın şirketi ile upsert
-- ediyordu. Ajansın bağlantısı müşteri şirketinden yetkilendirilince tekil
-- anahtar şirket başına olduğu için eşleşmedi ve her denemede o şirkette
-- yeni bir bağlantı açıldı; izin verilen satır kurulumun okuduğu satır
-- değildi ve "Ölçüm izinlerini ver" sonsuz döngüye girdi.
--
-- Nullable: yeni bağlantı akışı hedefsiz. CASCADE: state ömrü dakikalar;
-- bağlantılar silinmiyor (revoked) ama silinirse askıda state kalmasın.
ALTER TABLE "oauth_states" ADD COLUMN "target_connection_id" UUID;

ALTER TABLE "oauth_states"
  ADD CONSTRAINT "oauth_states_target_connection_id_fkey"
  FOREIGN KEY ("target_connection_id") REFERENCES "platform_connections"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
