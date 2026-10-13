-- PLATFORM BEYANININ İZİ (docs/kurulum-sihirbazi/MIMARI.md § 15, entegrasyon 2026-10-13).
--
-- Sihirbazın son kontrol ekranı her kapsam kararının yanında KİM ve NE ZAMAN
-- yazıyor (MIMARI § 2c). Öğe beyanları (kurulum_beyanlari) bunu taşıyor;
-- "bu platformu kullanmıyoruz" beyanı (workspace_kurulum.kullanilmayan_platformlar)
-- taşımıyordu ve ekran yalnız beyanın kendisini gösterebiliyordu.
--
-- BEYAN kurulum_beyanlari'na TAŞINMADI: anlamı farklı (parça değil adımı
-- bütünüyle düşürüyor), dört okuyucusu var (tamamla süzgeci, şirket
-- kurulumu, panel listesi, kurulum yanıtı) ve taşımak bir veri göçü olurdu.
-- En küçük değişiklik: aynı satıra iki iz kolonu. Servis beyanla AYNI
-- deyimde yazıyor; beyan kalkınca ikisi de NULL.
--
-- EKLEMELİ, GERİYE DOLDURMA YOK: mevcut beyanların izi audit_logs'ta, ama
-- o tablo FORCE RLS altında ve migration rolünün ayarsız bağlamında satır
-- görmeyebilir — doldurma SESSİZCE sıfır satır yapardı. Eski beyanda tarih
-- NULL kalır ve ekran "tarih kaydı yok" der (uydurmaz).
ALTER TABLE "workspace_kurulum"
  ADD COLUMN "platform_beyan_eden" UUID,
  ADD COLUMN "platform_beyan_tarihi" TIMESTAMPTZ(6);

-- Kullanıcı silinince beyan KALIR, adı "bilinmiyor" olur (kurulum_beyanlari ile aynı).
ALTER TABLE "workspace_kurulum" ADD CONSTRAINT "workspace_kurulum_platform_beyan_eden_fkey"
  FOREIGN KEY ("platform_beyan_eden") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
