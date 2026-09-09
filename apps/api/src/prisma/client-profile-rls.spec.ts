import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * BİLGİ BANKASI — `client_profiles` politikalarının GERÇEKTEN uygulandığı
 * test. `ad-account-pool-rls.spec.ts` ile aynı desen: `SET ROLE` ile sahibi
 * olmayan bir role geçip politikanın KENDİSİNİ sınıyor.
 *
 * `draft_campaigns` deseniyle aynı (`client_id` NULLABLE DEĞİL), yani en
 * kritik iddia BAŞKA MÜŞTERİNİN profilinin hiç görünmemesi/yazılamaması —
 * `branding_profiles`ın aksine burada "org varsayılanı" diye bir kaçış yolu
 * yok, karışıklık riski daha düşük ama testin kendisi aynı titizlikte olmalı.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const ORG_OTHER = '1e1e1e1e-1e1e-1e1e-1e1e-1e1e1e1e1e1e';
const USER = '22222222-2222-2222-2222-222222222222';
const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLIENT_OTHER_ORG = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PROFILE_A = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1';
const PROFILE_OTHER_ORG = 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2';

/** Politika uygulanan rol. Tabloların sahibi DEĞİL — RLS ancak öyle işliyor. */
const APP_ROLE = 'advetics_rls_test';

beforeAll(async () => {
  h = await createHarness();

  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  await h.q(`ALTER TABLE client_profiles ENABLE ROW LEVEL SECURITY`);
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await h.q(
    `INSERT INTO organizations (id, name, slug, updated_at)
     VALUES ($1, 'Ajans', 'ajans', now()), ($2, 'Başka Ajans', 'baska', now())`,
    [ORG, ORG_OTHER],
  );
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $3, 'A', 'a', now()), ($2, $3, 'B', 'b', now()), ($4, $5, 'Yabancı', 'yabanci', now())`,
    [CLIENT_A, CLIENT_B, ORG, CLIENT_OTHER_ORG, ORG_OTHER],
  );
  await h.q(
    `INSERT INTO users (id, org_id, email, full_name, updated_at)
     VALUES ($1, $2, 'a@advetics.com', 'A', now())`,
    [USER, ORG],
  );
  await h.q(
    `INSERT INTO client_profiles (id, org_id, client_id, hedef_kitle, updated_at)
     VALUES ($1, $3, $4, 'A''nın hedef kitlesi', now()),
            ($2, $5, $6, 'Yabancı ajansın profili', now())`,
    [PROFILE_A, PROFILE_OTHER_ORG, ORG, CLIENT_A, ORG_OTHER, CLIENT_OTHER_ORG],
  );
});

interface Ctx {
  clientIds?: string[];
  isOrgAdmin?: boolean;
  activeClientId?: string | null;
  orgId?: string | null;
}

async function asUser<T = Record<string, unknown>>(sql: string, ctx: Ctx): Promise<T[]> {
  const orgId = ctx.orgId === undefined ? ORG : (ctx.orgId ?? '');
  await h.q(`
    SELECT set_config('app.current_org_id',           '${orgId}', false),
           set_config('app.current_user_id',          '${orgId ? USER : ''}', false),
           set_config('app.current_client_ids',       '${(ctx.clientIds ?? []).join(',')}', false),
           set_config('app.is_org_admin',             '${ctx.isOrgAdmin ? 'on' : 'off'}', false),
           set_config('app.current_active_client_id', '${ctx.activeClientId ?? ''}', false)
  `);
  await h.q(`SET ROLE ${APP_ROLE}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

const ORG_ADMIN: Ctx = { clientIds: [CLIENT_A, CLIENT_B], isOrgAdmin: true };
const CLIENT_A_USER: Ctx = { clientIds: [CLIENT_A], isOrgAdmin: false };
const CLIENT_B_USER: Ctx = { clientIds: [CLIENT_B], isOrgAdmin: false };

async function visibleTargets(ctx: Ctx): Promise<string[]> {
  const rows = await asUser<{ hedef_kitle: string }>(
    'SELECT hedef_kitle FROM client_profiles ORDER BY hedef_kitle',
    ctx,
  );
  return rows.map((r) => r.hedef_kitle);
}

describe('client_profiles — görünürlük', () => {
  it('ORG YÖNETİCİSİ erişebildiği workspace’in profilini görüyor', async () => {
    expect(await visibleTargets(ORG_ADMIN)).toEqual(["A'nın hedef kitlesi"]);
  });

  it('KRİTİK: erişimi olmayan workspace’in profili GÖRÜNMÜYOR', async () => {
    expect(await visibleTargets(CLIENT_B_USER)).toEqual([]);
  });

  it('KRİTİK: BAŞKA ORGANİZASYONUN profili hiç kimseye görünmüyor', async () => {
    expect(await visibleTargets(ORG_ADMIN)).not.toContain('Yabancı ajansın profili');
  });

  it('BAĞLAM KURULMAMIŞSA hiçbir satır görünmüyor', async () => {
    expect(await visibleTargets({ orgId: null, isOrgAdmin: true })).toEqual([]);
  });

  it('aktif workspace seçimi görünürlüğü daraltıyor', async () => {
    expect(await visibleTargets({ ...ORG_ADMIN, activeClientId: CLIENT_B })).toEqual([]);
  });
});

describe('client_profiles — yazma', () => {
  it('ORG YÖNETİCİSİ mevcut profili güncelleyebiliyor', async () => {
    await asUser(
      `UPDATE client_profiles SET hedef_kitle = 'Güncellendi' WHERE id = '${PROFILE_A}'`,
      ORG_ADMIN,
    );
    const rows = await h.q<{ hedef_kitle: string }>(
      `SELECT hedef_kitle FROM client_profiles WHERE id = '${PROFILE_A}'`,
    );
    expect(rows[0]?.hedef_kitle).toBe('Güncellendi');
  });

  it('KRİTİK: erişimi olmayan kullanıcı DOKUNAMIYOR — satır zaten görünmüyor', async () => {
    await asUser(
      `UPDATE client_profiles SET hedef_kitle = 'Ele geçirildi' WHERE id = '${PROFILE_A}'`,
      CLIENT_B_USER,
    );
    const rows = await h.q<{ hedef_kitle: string }>(
      `SELECT hedef_kitle FROM client_profiles WHERE id = '${PROFILE_A}'`,
    );
    expect(rows[0]?.hedef_kitle).toBe("A'nın hedef kitlesi");
  });

  it('KRİTİK: erişimi olmayan workspace için yeni profil AÇILAMIYOR', async () => {
    await expect(
      asUser(
        `INSERT INTO client_profiles (id, org_id, client_id, hedef_kitle, updated_at)
         VALUES (gen_random_uuid(), '${ORG}', '${CLIENT_B}', 'Sahte', now())`,
        CLIENT_A_USER,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('erişimi olan kullanıcı kendi workspace’i için profil açabiliyor', async () => {
    await asUser(
      `INSERT INTO client_profiles (id, org_id, client_id, hedef_kitle, updated_at)
       VALUES (gen_random_uuid(), '${ORG}', '${CLIENT_B}', 'B için yeni', now())`,
      CLIENT_B_USER,
    );
    const rows = await h.q<{ hedef_kitle: string }>(
      `SELECT hedef_kitle FROM client_profiles WHERE client_id = '${CLIENT_B}'`,
    );
    expect(rows[0]?.hedef_kitle).toBe('B için yeni');
  });

  it('DELETE politikası yok — komut hata vermeden SESSİZCE sıfır satır etkiliyor', async () => {
    // Politikasız bir komut Postgres'e göre HATA DEĞİL: satırı görünürlük
    // düzeyinde eleyip 0 satır etkiliyor ve "sildim" diyen çağrı hiçbir şey
    // silmiyor. Bu testin varlığı, aşağıdaki REVOKE'un neden gerektiğini
    // gösteriyor — yetki geri alınınca aynı çağrı AÇIKÇA düşüyor.
    await asUser(`DELETE FROM client_profiles WHERE id = '${PROFILE_A}'`, ORG_ADMIN);
    const rows = await h.q<{ id: string }>(
      `SELECT id FROM client_profiles WHERE id = '${PROFILE_A}'`,
    );
    expect(rows).toHaveLength(1);
  });
});

/**
 * `advetics_app` ROLÜ BU KOŞUM ORTAMINDA YOK — `02_rls.sql` onu bulamayınca
 * yetki adımlarını uyarıyla atlıyor, yani REVOKE'un etkisi çalıştırılarak
 * sınanamıyor. Kalan tek kanıt kaynağın kendisi.
 *
 * TARAMA YORUMSUZ KAYNAKTA: aynı satırı ANLATAN yorum da o dosyada duruyor
 * ve `toContain` ikisini ayırt etmiyor — REVOKE silinse bile yorum eşleşip
 * test yeşil kalırdı.
 */
describe('client_profiles — DELETE yetkisi uygulama rolünden geri alınıyor', () => {
  const KAYNAK = readFileSync(join(__dirname, '..', '..', 'prisma', 'sql', '02_rls.sql'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--[^\n]*/g, '');

  it('taranan kaynak GERÇEKTEN yakalandı', () => {
    // Dosya yolu değişirse ya da yorum temizleyici her şeyi silerse aşağıdaki
    // iddia "yasak dizge yok" gibi BOŞA DÜŞERDİ.
    expect(KAYNAK).toContain('CREATE POLICY adv_client_profiles_select');
  });

  it('REVOKE DELETE ON client_profiles yazılı', () => {
    expect(KAYNAK).toContain("REVOKE DELETE ON client_profiles FROM advetics_app");
  });
});
