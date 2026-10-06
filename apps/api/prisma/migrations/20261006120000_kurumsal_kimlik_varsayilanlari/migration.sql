-- KURUMSAL KİMLİK: MARKA PROFİLİ VARSAYILANLARI (2026-10-06).
--
-- Panelin rengi ve gövde yazı tipi yalnızca CSS'ten değil, beyaz etiketli
-- marka profilinden de geliyor ve profil CSS'i eziyor. Satırlar eski
-- varsayılanlarla (#E11D2E, #F97316, Inter) yazılmıştı; yalnızca CSS'i
-- değiştirmek Profaj kimliğini hiçbir panelde göstermezdi.
--
-- YALNIZCA ESKİ VARSAYILANI TAŞIYAN DEĞER DEĞİŞİYOR. Bir ajans rengini ya
-- da yazı tipini bilerek seçtiyse ona dokunulmuyor — beyaz etiketin vaadi
-- bu. Üç alan ayrı ayrı: rengini değiştirip yazı tipini bırakmış bir
-- profilde yalnızca yazı tipi güncelleniyor.
ALTER TABLE branding_profiles ALTER COLUMN primary_color SET DEFAULT '#FF2400';
ALTER TABLE branding_profiles ALTER COLUMN accent_color SET DEFAULT '#D21D00';
ALTER TABLE branding_profiles ALTER COLUMN font_family SET DEFAULT 'Open Sans';

UPDATE branding_profiles SET primary_color = '#FF2400' WHERE upper(primary_color) = '#E11D2E';
UPDATE branding_profiles SET accent_color = '#D21D00' WHERE upper(accent_color) = '#F97316';
UPDATE branding_profiles SET font_family = 'Open Sans' WHERE font_family = 'Inter';
