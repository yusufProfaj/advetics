-- =============================================================================
-- insights_daily — AYLIK PARTITION YÖNETİMİ
-- =============================================================================
-- Bu dosya her dağıtımda çalışır ve idempotenttir.
--
-- Neden partitioning:
--   · Eski ayı arşivlemek `DETACH PARTITION` ile saniyeler sürüyor; 47 milyon
--     satırlı bir tablodan DELETE saatler sürer ve tabloyu şişirir.
--   · Sorgular partition pruning ile yalnızca ilgili ayları tarıyor. "Son 7
--     gün" sorgusu 36 aylık veriye dokunmuyor.
--   · VACUUM ve index bakımı partition başına yapılıyor.
--
-- Neden TimescaleDB değil: yönetilen Postgres sağlayıcılarının çoğunda yok ya
-- da sınırlı (RDS, Neon, Supabase). Declarative partitioning her yerde çalışır.
-- İhtiyaç doğarsa sonra geçilebilir.
-- =============================================================================

-- `app` şemasını KENDİSİ oluşturuyor.
--
-- Bu şema 02_rls.sql'de de oluşturuluyor ve üretimde dosyalar sırayla
-- uygulandığı için orada sorun çıkmıyor. Ama bu dosyanın 02'nin yan etkisine
-- bağımlı olması gizli bir bağlılık: 03'ü tek başına uygulamak (test koşum
-- ortamı, elle onarım, kısmi dağıtım) "schema app does not exist" ile
-- düşüyordu. Aynı hata 02_rls.sql'de de yaşandı.
CREATE SCHEMA IF NOT EXISTS app;

-- -----------------------------------------------------------------------------
-- Belirli bir ay için partition oluşturur.
--
-- Idempotent: partition varsa hiçbir şey yapmaz. Aylık bakım işi ve worker'lar
-- bunu güvenle çağırabilir.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.ensure_insights_partition(target date)
RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  month_start date := date_trunc('month', target)::date;
  month_end   date := (date_trunc('month', target) + interval '1 month')::date;
  part_name   text := 'insights_daily_' || to_char(month_start, 'YYYY_MM');
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = part_name AND n.nspname = 'public'
  ) THEN
    RETURN part_name || ' (mevcut)';
  END IF;

  EXECUTE format(
    'CREATE TABLE public.%I PARTITION OF public.insights_daily FOR VALUES FROM (%L) TO (%L)',
    part_name, month_start, month_end
  );

  -- Partition'a doğrudan erişimde de RLS geçerli olsun.
  --
  -- Uygulama daima ana tablo üzerinden sorguluyor ve orada politikalar zaten
  -- uygulanıyor. Ama bir partition'a DOĞRUDAN yazılan sorgu ana tablonun
  -- politikalarını atlar — ileride biri optimizasyon için öyle bir sorgu
  -- yazarsa izolasyon sessizce kaybolmasın.
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', part_name);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', part_name);

  EXECUTE format(
    'CREATE POLICY adv_insights_part_select ON public.%I FOR SELECT USING (app.can_access_client(client_id))',
    part_name
  );

  -- Roller yoksa GRANT hata verir ve tüm dosya geri alınır — yani partition
  -- hiç oluşmaz. Rol varlığını kontrol etmek, dosyanın rollerden bağımsız
  -- çalışmasını sağlıyor (test ortamları, farklı kurulumlar).
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'advetics_app') THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO advetics_app', part_name);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'advetics_worker') THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO advetics_worker', part_name);
  END IF;

  RETURN part_name || ' (oluşturuldu)';
EXCEPTION
  -- Aynı anda iki worker çağırdıysa ikincisi çakışır; sorun değil.
  WHEN duplicate_table THEN RETURN part_name || ' (yarış — mevcut)';
  WHEN insufficient_privilege THEN RETURN part_name || ' (yetki yok, atlandı)';
  WHEN undefined_object THEN RETURN part_name || ' (rol yok, grant atlandı)';
END
$$;

-- -----------------------------------------------------------------------------
-- Bir aralık için partition'ları hazırlar.
--
-- `months_back` geçmiş veriyi (L7 backfill 90 gün geriye gidiyor),
-- `months_forward` gelecek ayları kapsar. İleriye doğru cömert olmak,
-- bakım işi bir kez kaçtığında yazma hatası almamayı sağlıyor.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.ensure_insights_partitions(
  months_back  int DEFAULT 13,
  months_forward int DEFAULT 24
)
RETURNS TABLE (partition_name text)
LANGUAGE plpgsql AS $$
DECLARE
  m date;
BEGIN
  FOR m IN
    SELECT generate_series(
      date_trunc('month', CURRENT_DATE) - (months_back || ' months')::interval,
      date_trunc('month', CURRENT_DATE) + (months_forward || ' months')::interval,
      '1 month'
    )::date
  LOOP
    RETURN QUERY SELECT app.ensure_insights_partition(m);
  END LOOP;
END
$$;

-- -----------------------------------------------------------------------------
-- Partition'ları oluştur.
--
-- 13 ay geriye + 24 ay ileriye = 38 aylık kapsama. Aylık bakım işi (Modül 3
-- worker'ı) bunu kaydırarak sürdürecek.
-- -----------------------------------------------------------------------------
SELECT app.ensure_insights_partitions();

-- -----------------------------------------------------------------------------
-- SON ÇARE partition'ı.
--
-- Kapsam dışı bir tarih gelirse INSERT hata verir ve worker sessizce veri
-- kaybeder. DEFAULT partition bunu yakalar.
--
-- Bedeli: default'a satır düştüyse o aralık için yeni partition eklemek
-- satırların taşınmasını gerektirir. 38 aylık kapsamla bu olmamalı — default'a
-- satır düşmesi bir alarm sinyalidir, normal durum değil.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'insights_daily_default' AND n.nspname = 'public'
  ) THEN
    CREATE TABLE public.insights_daily_default PARTITION OF public.insights_daily DEFAULT;
    ALTER TABLE public.insights_daily_default ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.insights_daily_default FORCE ROW LEVEL SECURITY;
    CREATE POLICY adv_insights_part_select ON public.insights_daily_default
      FOR SELECT USING (app.can_access_client(client_id));
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- Default partition'a satır düştü mü — sağlık kontrolü bunu okuyacak.
-- Dolu olması, tarihin beklenen kapsamın dışında olduğunu gösterir.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW app.insights_partition_health AS
SELECT
  (SELECT count(*) FROM pg_class c
     JOIN pg_inherits i ON i.inhrelid = c.oid
     JOIN pg_class p ON p.oid = i.inhparent
   WHERE p.relname = 'insights_daily') AS partition_count,
  (SELECT count(*) FROM public.insights_daily_default) AS rows_in_default,
  (SELECT min(c.relname) FROM pg_class c
     JOIN pg_inherits i ON i.inhrelid = c.oid
     JOIN pg_class p ON p.oid = i.inhparent
   WHERE p.relname = 'insights_daily' AND c.relname <> 'insights_daily_default') AS oldest_partition;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['advetics_app', 'advetics_worker'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT ON app.insights_partition_health TO %I', r);
    END IF;
  END LOOP;
END
$$;
