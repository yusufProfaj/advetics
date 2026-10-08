import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * ═══ OKUMA ANAHTARI YALNIZCA SAHİBİNE GÖRÜNÜYOR ═══
 *
 * Satır, platform sahibi adına veri okumaya yarayan bir kimliğin özetini
 * taşıyor. Politika `user_id = app.current_user_id()`: org yöneticisi
 * bile göremiyor ve SAHİBİ başka şirkete geçtiğinde de görüyor (org
 * yüklemi YOK — `eposta-kimligi-rls.spec.ts`'deki hatanın tekrarı olmasın).
 *
 * `SET ROLE` ile sahibi olmayan bir role geçiliyor ve her yazma `RETURNING`
 * ile SAYILIYOR: sıfır satırlık UPDATE politikadan bağımsız başarılı döner.
 */
let h: Harness;

const ORG_AJANS = '11111111-1111-1111-1111-111111111111';
const ORG_SIRKET = '22222222-2222-2222-2222-222222222222';
const SAHIP = 'aaaa0000-0000-0000-0000-00000000000a';
const YONETICI = 'bbbb0000-0000-0000-0000-00000000000b';
const ANAHTAR = 'cccc0000-0000-0000-0000-00000000000c';
const APP_ROLE = 'advetics_okuma_rls_test';

interface Ctx {
  orgId: string;
  userId: string;
}

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  await h.q(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${APP_ROLE}`);
  await h.q(`ALTER TABLE okuma_api_anahtarlari ENABLE ROW LEVEL SECURITY`);

  await h.q(`
    INSERT INTO organizations (id, name, slug, plan, status, created_at, updated_at) VALUES
      ('${ORG_AJANS}',  'Ajans',  'ajans',  'starter', 'active', now(), now()),
      ('${ORG_SIRKET}', 'Şirket', 'sirket', 'starter', 'active', now(), now())
  `);
  await h.q(`
    INSERT INTO users (id, org_id, email, full_name, password_hash, locale, status, platform_admin, created_at, updated_at) VALUES
      ('${SAHIP}',    '${ORG_AJANS}', 'hello@profaj.com', 'Sahip',    'h', 'tr', 'active', true,  now(), now()),
      ('${YONETICI}', '${ORG_AJANS}', 'admin@x.com',      'Yönetici', 'h', 'tr', 'active', false, now(), now())
  `);
  await h.q(`
    INSERT INTO okuma_api_anahtarlari (id, user_id, ad, gorunen_onek, anahtar_ozeti)
    VALUES ('${ANAHTAR}', '${SAHIP}', 'Claude', 'adv_ro_abc123', '${'a'.repeat(64)}')
  `);
});

afterAll(async () => h.close());

async function asUser<T = Record<string, unknown>>(sql: string, ctx: Ctx): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id',  '${ctx.orgId}',  false),
           set_config('app.current_user_id', '${ctx.userId}', false),
           set_config('app.is_org_admin',    'on',            false),
           set_config('app.tum_sirketler',   'off',           false)
  `);
  await h.q(`SET ROLE ${APP_ROLE}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

const SAHIP_AJANSTA: Ctx = { orgId: ORG_AJANS, userId: SAHIP };
const SAHIP_SIRKETTE: Ctx = { orgId: ORG_SIRKET, userId: SAHIP };
const YONETICI_AJANSTA: Ctx = { orgId: ORG_AJANS, userId: YONETICI };

describe('tarama boşa düşmüyor', () => {
  it('RLS gerçekten AÇIK ve tablo politika listesinde', async () => {
    const [row] = await h.q<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'okuma_api_anahtarlari'`,
    );
    expect(row?.relrowsecurity).toBe(true);
    const politikalar = await h.q<{ cmd: string }>(
      `SELECT cmd FROM pg_policies WHERE tablename = 'okuma_api_anahtarlari' ORDER BY cmd`,
    );
    // DELETE YOK — iptal bir UPDATE, satır iz olarak kalıyor.
    expect(politikalar.map((p) => p.cmd)).toEqual(['INSERT', 'SELECT', 'UPDATE']);
  });
});

describe('KRİTİK: yalnızca sahibi', () => {
  it('sahibi görüyor — ajansta da başka şirkette de', async () => {
    expect(await asUser(`SELECT id FROM okuma_api_anahtarlari`, SAHIP_AJANSTA)).toHaveLength(1);
    expect(await asUser(`SELECT id FROM okuma_api_anahtarlari`, SAHIP_SIRKETTE)).toHaveLength(1);
  });

  it('KRİTİK: aynı şirketin YÖNETİCİSİ göremiyor', async () => {
    expect(await asUser(`SELECT id FROM okuma_api_anahtarlari`, YONETICI_AJANSTA)).toHaveLength(0);
  });

  it('KRİTİK: yönetici iptal EDEMİYOR — sıfır satır', async () => {
    const rows = await asUser(
      `UPDATE okuma_api_anahtarlari SET iptal = now() WHERE id = '${ANAHTAR}' RETURNING id`,
      YONETICI_AJANSTA,
    );
    expect(rows).toHaveLength(0);
  });

  it('sahibi iptal edebiliyor — bir satır', async () => {
    const rows = await asUser(
      `UPDATE okuma_api_anahtarlari SET son_kullanim = now() WHERE id = '${ANAHTAR}' RETURNING id`,
      SAHIP_SIRKETTE,
    );
    expect(rows).toHaveLength(1);
  });

  it('KRİTİK: başkası ADINA anahtar yazılamıyor', async () => {
    /*
     * `RETURNING` YOK ve bu kasıtlı. Onunla yazıldığında, INSERT politikası
     * tamamen gevşetilse bile dönen satır SELECT politikasına takılıp aynı
     * hatayı veriyordu — test YANLIŞ SEBEPLE geçiyordu (mutasyonda
     * yakalandı). Sonra satırın gerçekten yazılmadığı yetkili bağlantıyla
     * sayılıyor.
     */
    await expect(
      asUser(
        `INSERT INTO okuma_api_anahtarlari (id, user_id, ad, gorunen_onek, anahtar_ozeti)
         VALUES (gen_random_uuid(), '${SAHIP}', 'sızma', 'adv_ro_zzz', '${'b'.repeat(64)}')`,
        YONETICI_AJANSTA,
      ),
    ).rejects.toThrow(/row-level security/);
    const [say] = await h.q<{ n: number }>(`SELECT count(*)::int AS n FROM okuma_api_anahtarlari WHERE ad = 'sızma'`);
    expect(say?.n).toBe(0);
  });

  it('kendi adına yazabiliyor', async () => {
    const rows = await asUser(
      `INSERT INTO okuma_api_anahtarlari (id, user_id, ad, gorunen_onek, anahtar_ozeti)
       VALUES (gen_random_uuid(), '${SAHIP}', 'ikinci', 'adv_ro_yyy', '${'c'.repeat(64)}') RETURNING id`,
      SAHIP_AJANSTA,
    );
    expect(rows).toHaveLength(1);
  });

  it('silme politikası yok: sahibi bile SİLEMİYOR (iz kalıyor)', async () => {
    const rows = await asUser(
      `DELETE FROM okuma_api_anahtarlari WHERE id = '${ANAHTAR}' RETURNING id`,
      SAHIP_AJANSTA,
    );
    expect(rows).toHaveLength(0);
  });
});
