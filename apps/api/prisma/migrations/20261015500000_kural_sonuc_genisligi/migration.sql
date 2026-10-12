-- rule_action_logs.outcome VARCHAR(24) idi; TELEFON turunda eklenen
-- skipped_no_conversion_signal 28 karakter. CHECK listesi genişletilmiş ama
-- kolon genişletilmemişti: arama kampanyası olan ilk müşteride kural kaydı
-- "value too long" ile düşer, transaction iptal olur ve o turda platformda
-- uygulanmış eylemler kayıtsız kalırdı (Ajan 4, B-1). VARCHAR genişletmesi
-- tabloyu yeniden yazmaz.
ALTER TABLE rule_action_logs ALTER COLUMN outcome TYPE VARCHAR(40);
