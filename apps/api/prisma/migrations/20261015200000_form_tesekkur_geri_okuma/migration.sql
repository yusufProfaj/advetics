-- FORM: TEŞEKKÜR DÜĞMESİNİN TÜRÜ VE GERİ OKUMA UYARISI (2026-10-12).
--
-- thank_you_cta_type: düğme türü önceden adresten türetiliyordu (adres varsa
-- site, yoksa düğme yok) ve "Bizi ara" (CALL_BUSINESS) seçeneği yoktu. NULL
-- = eski satır; okuma eski kuralla türetir, satırlar geri yazılmaz.
-- thank_you_phone: CALL_BUSINESS numarası, E.164.
-- readback_warning: yayından sonra Meta'dan geri okunan form gönderilenden
-- farklıysa (KVKK kutusu, dil, niyet adımı) ya da doğrulanamadıysa. error
-- kolonuna yazılmıyor: form Meta'da AÇIK, "yayınlanamadı" hatası değil.
--
-- KISITLAR BURADA, 01_constraints.sql'de DEĞİL: o dosya üretim sırasını
-- sınayan testlerde (`*-uretim-sirasi.spec.ts`) bu migration'dan ÖNCEKİ
-- şemaya da uygulanıyor ve henüz olmayan kolona bakan kısıt orada
-- "column does not exist" ile düşüyordu.
ALTER TABLE "lead_forms" ADD COLUMN "thank_you_cta_type" VARCHAR(16);
ALTER TABLE "lead_forms" ADD COLUMN "thank_you_phone" VARCHAR(20);
ALTER TABLE "lead_forms" ADD COLUMN "readback_warning" VARCHAR(2000);

-- TEŞEKKÜR DÜĞMESİ: tür listeden, "Bizi ara" numarasız olamaz.
--
-- Numarasız CALL_BUSINESS, Meta'da numarası olmayan bir "Ara" düğmesi ya da
-- yayın anında gelen bir ret demek; ülke kodsuz numara başka ülkeye çalar.
ALTER TABLE lead_forms ADD CONSTRAINT lead_forms_ty_type_chk
  CHECK (thank_you_cta_type IS NULL OR thank_you_cta_type IN ('VIEW_WEBSITE', 'CALL_BUSINESS', 'NONE'));

ALTER TABLE lead_forms ADD CONSTRAINT lead_forms_ty_phone_chk
  CHECK (thank_you_cta_type IS DISTINCT FROM 'CALL_BUSINESS' OR thank_you_phone ~ '^\+90[0-9]{10}$');

