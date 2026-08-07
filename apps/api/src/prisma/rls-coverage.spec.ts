import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * RLS KAPSAMA KAPISI — her tablonun politikası var mı?
 *
 * NEDEN TEST ZAMANINDA: politikasız bir tablo eklemek SESSİZ. Prisma
 * migration'ı çalışıyor, uygulama çalışıyor, testler geçiyor — ve tablo bütün
 * kiracılara açık duruyor. Bu yalnızca `scripts/preflight.sh` ile, yani
 * SUNUCUYA ÇIKTIKTAN SONRA yakalanıyordu.
 *
 * Bu paket `02_rls.sql`in tablo listesi ile şemadaki tabloları karşılaştırıyor.
 * Yeni bir modül tablo eklediğinde listeye eklemeyi unutursa burada düşüyor.
 *
 * NOT: koşum ortamı politikaları uyguladıktan SONRA RLS zorlamasını kapatıyor
 * (BYPASSRLS rolünü taklit etmek için). `DISABLE ROW LEVEL SECURITY` politikayı
 * SİLMİYOR, yalnızca uygulamayı durduruyor — bu yüzden `pg_policies` hâlâ
 * doğru cevabı veriyor.
 */

let h: Harness;

/**
 * Politikası KASITLI olarak olmayan tablolar.
 *
 * Her biri gerekçesiyle burada; listeye eklemek bilinçli bir karar olmalı,
 * kolay bir kaçış yolu değil.
 */
const INTENTIONALLY_UNPROTECTED = new Set([
  // Meta'nın veri silme geri çağrısı OTURUMSUZ geliyor: kiracı bağlamı yok,
  // dolayısıyla hiçbir politika eşleşemezdi. Yönetim bağlantısı üzerinden
  // ve yalnızca doğrulanmış imzayla okunuyor.
  'data_deletion_requests',
  // OAuth akışı henüz kimliği bilinmeyen bir kullanıcıyla başlıyor.
  'oauth_states',
  // Prisma'nın kendi defteri.
  '_prisma_migrations',
]);

beforeAll(async () => {
  h = await createHarness();
});

afterAll(async () => {
  await h.close();
});

describe('RLS kapsaması', () => {
  it('POLİTİKASIZ TABLO YOK', async () => {
    const rows = await h.q<{ tablename: string }>(`
      SELECT c.relname AS tablename
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        -- Partition'lar politikalarını üst tablodan miras almıyor; onların
        -- kendi politikaları 03_partitions.sql ile kuruluyor ve ayrı ayrı
        -- listelemek gürültü olurdu.
        AND NOT c.relispartition
        AND NOT EXISTS (
          SELECT 1 FROM pg_policies p
          WHERE p.schemaname = 'public' AND p.tablename = c.relname
        )
      ORDER BY 1
    `);

    const unexpected = rows
      .map((r) => r.tablename)
      .filter((t) => !INTENTIONALLY_UNPROTECTED.has(t));

    // Hata mesajı tablo adlarını gösteriyor: "0 bekleniyordu, 1 geldi" demek
    // hangi tablonun açık kaldığını söylemezdi.
    expect(unexpected).toEqual([]);
  });

  it('monthly_budgets dört işlem için de politikaya sahip', async () => {
    // Modül 5'in tablosu. SELECT politikası olup UPDATE olmaması, bütçeyi
    // görünür ama başka kiracıdan değiştirilebilir bırakırdı.
    const rows = await h.q<{ cmd: string }>(
      `SELECT DISTINCT cmd FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'monthly_budgets'
       ORDER BY 1`,
    );
    expect(rows.map((r) => r.cmd).sort()).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
  });

  it('monthly_budgets UPDATE politikasının WITH CHECK yüklemi VAR', async () => {
    // Yalnızca USING olsaydı satırın client_id'si erişilemeyen bir müşteriye
    // TAŞINABİLİRDİ: USING eski hâli, WITH CHECK yeni hâli denetliyor.
    const rows = await h.q<{ with_check: string | null }>(
      `SELECT with_check FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'monthly_budgets' AND cmd = 'UPDATE'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.with_check).toBeTruthy();
  });
});
