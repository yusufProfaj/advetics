-- Özel reklam kategorileri — MÜŞTERİNİN ÖZELLİĞİ
--
-- Konut, istihdam ve kredi reklamları düzenlemeye tabi. Meta bu kategorilerde
-- hedeflemeyi kısıtlıyor ve kategori BEYAN EDİLMEDEN yayınlanan bir reklam
-- politika ihlali sayılıyor. CEZASI KAMPANYA SEVİYESİNDE DEĞİL, HESAP
-- SEVİYESİNDE: bir müşteri için unutulan beyan, ajansın o reklam hesabındaki
-- bütün kampanyalarını riske atıyor.
--
-- BUGÜNE KADAR SABİT '[]' GİDİYORDU — üç yazma yolunda da. Yani emlak
-- müşterisi olan bir ajans, farkında olmadan her kampanyada ihlal
-- üretiyordu.
--
-- KOLON MÜŞTERİDE, KAMPANYADA DEĞİL. Bir emlak firması her kampanyasında
-- emlakçı; her kampanyada tek tek sormak bir gün unutulacağı anlamına gelir
-- ve o gün pahalı.
ALTER TABLE "clients"
    ADD COLUMN "special_ad_categories" TEXT[] NOT NULL DEFAULT '{}';
