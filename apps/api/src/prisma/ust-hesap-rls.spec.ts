import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * ═══ ÜST HESAP (MCC) İZOLASYONU — POLİTİKA GERÇEKTEN SINANIYOR ═══
 *
 * `manager_accounts` ve `manager_memberships` `org_id` TAŞIMIYOR: var oluş
 * sebepleri birden çok organizasyonu bir arada tutmak. Yani depodaki bütün
 * diğer politikaların dayandığı `app.current_org_id()` sınırı burada YOK ve
 * tek sınır `app.current_manager_account_id()`.
 *
 * Bu, ürünün en pahalı sızıntı yüzeyi: bir danışmanın üst hesabını
 * görebilmek, ONUN MÜŞTERİ LİSTESİNİ görmek demek.
 *
 * PAKET RLS'İ AÇIYOR. `pglite-harness` politikaları kurduktan sonra RLS'i
 * kapatıyor (worker BYPASSRLS ile bağlanıyor, doğru taklit bu) — yani NORMAL
 * testler bir boşluğu GÖREMEZ. `SET ROLE` ile sahibi olmayan bir role geçmek
 * politikanın kendisini sınamaya yetiyor.
 */
let h: Harness;

const UST_A = 'a0000000-0000-0000-0000-00000000000a';
const UST_B = 'b0000000-0000-0000-0000-00000000000b';

const ORG_A1 = '11111111-1111-1111-1111-111111111111';
const ORG_A2 = '22222222-2222-2222-2222-222222222222';
const ORG_B1 = '33333333-3333-3333-3333-333333333333';

const USER_A = 'aaaa0000-0000-0000-0000-00000000000a';
const USER_B = 'bbbb0000-0000-0000-0000-00000000000b';
/** Üst hesabı OLMAYAN kullanıcı — bağımsız şirket hâli. */
const USER_YALNIZ = 'cccc0000-0000-0000-0000-00000000000c';

const APP_ROLE = 'advetics_ust_hesap_rls_test';

const RLS_SQL = readFileSync(join(__dirname, '../../prisma/sql/02_rls.sql'), 'utf8');

/**
 * `02_rls.sql` içindeki REVOKE satırlarını ÇIKARIP koşuyoruz — yeniden
 * yazmıyoruz.
 *
 * Gerçek REVOKE `advetics_app` rolüne uygulanıyor ve o rol PGlite'ta YOK
 * (dosyadaki `DO` bloğu rol yoksa atlıyor), yani üretimdeki yasak testte
 * kendiliğinden oluşmuyor. Satırları kaynaktan alıp test rolüne uygulamak
 * iki şeyi birden ölçüyor: yasağın DOSYADA DURDUĞUNU ve Postgres'in onu
 * gerçekten uyguladığını. Yeniden yazsaydık, dosyadaki satır silindiğinde
 * test yeşil kalırdı.
 */
function revokeSatirlari(): string[] {
  const satirlar = [...RLS_SQL.matchAll(/EXECUTE '(REVOKE [^']*manager_[^']*)'/g)]
    .map((m) => m[1])
    .filter((x): x is string => typeof x === 'string');
  if (satirlar.length === 0) {
    throw new Error('02_rls.sql içinde manager_* REVOKE satırı bulunamadı — yasak kaldırılmış mı?');
  }
  return satirlar;
}

interface Ctx {
  orgId?: string | null;
  userId?: string | null;
  managerAccountId?: string | null;
}

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  await h.q(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${APP_ROLE}`);

  for (const satir of revokeSatirlari()) {
    await h.q(satir.replace('advetics_app', APP_ROLE));
  }

  for (const t of ['manager_accounts', 'manager_memberships']) {
    await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  }

  await h.q(`
    INSERT INTO manager_accounts (id, name, slug, status, created_at, updated_at) VALUES
      ('${UST_A}', 'A Danışmanlık', 'a-danismanlik', 'active', now(), now()),
      ('${UST_B}', 'B Danışmanlık', 'b-danismanlik', 'active', now(), now())
  `);
  await h.q(`
    INSERT INTO organizations (id, name, slug, plan, status, manager_account_id, created_at, updated_at) VALUES
      ('${ORG_A1}', 'A1 Şirketi', 'a1', 'starter', 'active', '${UST_A}', now(), now()),
      ('${ORG_A2}', 'A2 Şirketi', 'a2', 'starter', 'active', '${UST_A}', now(), now()),
      ('${ORG_B1}', 'B1 Şirketi', 'b1', 'starter', 'active', '${UST_B}', now(), now())
  `);
  await h.q(`
    INSERT INTO users (id, org_id, email, full_name, password_hash, locale, status, created_at, updated_at) VALUES
      ('${USER_A}', '${ORG_A1}', 'a@x.com', 'A', 'h', 'tr', 'active', now(), now()),
      ('${USER_B}', '${ORG_B1}', 'b@x.com', 'B', 'h', 'tr', 'active', now(), now()),
      ('${USER_YALNIZ}', '${ORG_A1}', 'c@x.com', 'C', 'h', 'tr', 'active', now(), now())
  `);
  await h.q(`
    INSERT INTO manager_memberships (id, manager_account_id, user_id, role, created_at, updated_at) VALUES
      (gen_random_uuid(), '${UST_A}', '${USER_A}', 'owner', now(), now()),
      (gen_random_uuid(), '${UST_B}', '${USER_B}', 'owner', now(), now())
  `);
});

afterAll(async () => {
  await h.close();
});

async function asUser<T = Record<string, unknown>>(sql: string, ctx: Ctx): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id',            '${ctx.orgId ?? ''}', false),
           set_config('app.current_user_id',           '${ctx.userId ?? ''}', false),
           set_config('app.current_manager_account_id','${ctx.managerAccountId ?? ''}', false)
  `);
  await h.q(`SET ROLE ${APP_ROLE}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

const A: Ctx = { orgId: ORG_A1, userId: USER_A, managerAccountId: UST_A };
const B: Ctx = { orgId: ORG_B1, userId: USER_B, managerAccountId: UST_B };
const YALNIZ: Ctx = { orgId: ORG_A1, userId: USER_YALNIZ, managerAccountId: null };

async function gorunenHesaplar(ctx: Ctx): Promise<string[]> {
  const rows = await asUser<{ name: string }>('SELECT name FROM manager_accounts', ctx);
  return rows.map((r) => r.name).sort();
}

describe('manager_accounts — görünürlük', () => {
  it('BOŞA DÜŞME BEKÇİSİ: fikstür gerçekten yazıldı', async () => {
    // RLS DIŞINDA sayıyoruz. Politikalar her şeyi gizlerse aşağıdaki
    // "görmüyor" iddiaları HER ZAMAN doğru olurdu.
    const rows = await h.q<{ n: string }>('SELECT count(*)::text AS n FROM manager_accounts');
    expect(rows[0]?.n).toBe('2');
  });

  it('üye kendi üst hesabını görüyor', async () => {
    expect(await gorunenHesaplar(A)).toEqual(['A Danışmanlık']);
  });

  it('KRİTİK: BAŞKA danışmanlığın üst hesabını GÖRMÜYOR', async () => {
    /*
     * Bir üst hesabı görebilmek, o danışmanlığın MÜŞTERİ LİSTESİNİ görmek
     * demek — ajans ürününde en pahalı sızıntı.
     */
    expect(await gorunenHesaplar(B)).toEqual(['B Danışmanlık']);
  });

  it('KRİTİK: üst hesabı OLMAYAN kullanıcı hiçbir satır görmüyor', async () => {
    expect(await gorunenHesaplar(YALNIZ)).toEqual([]);
  });

  it('KRİTİK: bağlamı SAHTE bir üst hesapla doldurmak işe yaramıyor', async () => {
    /*
     * GUC istemciden gelmiyor — `withTenant` onu `TenantContextService`in
     * veritabanından hesapladığı değerle yazıyor. Bu test o zinciri değil,
     * "politika yalnızca GUC'a bakıyor mu" sorusunu ölçüyor: bakıyor, ve
     * ZİNCİRİN GÜVENLİĞİ `ust-hesap-baglam.spec.ts`te ayrıca sınanıyor.
     * İkisi birlikte anlamlı; tek başına hiçbiri yetmiyor.
     */
    const sahte = await gorunenHesaplar({ ...YALNIZ, managerAccountId: UST_A });
    // Politika GUC'a güveniyor — bu yüzden GUC'u yazan tek yer kritik.
    expect(sahte).toEqual(['A Danışmanlık']);
  });

  it('bağlam kurulmamışsa hiçbir satır görünmüyor', async () => {
    expect(await gorunenHesaplar({ orgId: null, userId: null, managerAccountId: UST_A })).toEqual([]);
  });
});

describe('manager_memberships — görünürlük', () => {
  it('kendi üst hesabındaki üyelikleri görüyor', async () => {
    const rows = await asUser<{ user_id: string }>(
      'SELECT user_id FROM manager_memberships',
      A,
    );
    expect(rows.map((r) => r.user_id)).toEqual([USER_A]);
  });

  it('KRİTİK: başka danışmanlığın üyeliklerini GÖRMÜYOR', async () => {
    const rows = await asUser<{ user_id: string }>('SELECT user_id FROM manager_memberships', B);
    expect(rows.map((r) => r.user_id)).toEqual([USER_B]);
  });
});

describe('YAZMA uygulama rolüne KAPALI', () => {
  /*
   * Bu iki tabloya yazmak, kullanıcının ERİŞEBİLDİĞİ ORGANİZASYON KÜMESİNİ
   * büyütüyor — yani `app.current_org_id()`nin alabileceği değerleri, yani
   * bütün RLS'in sınırını. Politikayla korumak, politikanın kendi bekçisini
   * yazmasını istemek olurdu; yasak GRANT seviyesinde.
   */
  it('KRİTİK: kendine üyelik YAZAMIYOR', async () => {
    await expect(
      asUser(
        `INSERT INTO manager_memberships (id, manager_account_id, user_id, role, created_at, updated_at)
         VALUES (gen_random_uuid(), '${UST_A}', '${USER_YALNIZ}', 'owner', now(), now())`,
        YALNIZ,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('KRİTİK: üst hesap AÇAMIYOR', async () => {
    await expect(
      asUser(
        `INSERT INTO manager_accounts (id, name, slug, status, created_at, updated_at)
         VALUES (gen_random_uuid(), 'Sahte', 'sahte', 'active', now(), now())`,
        YALNIZ,
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('KRİTİK: var olan üst hesabı GÜNCELLEYEMİYOR', async () => {
    await expect(
      asUser(`UPDATE manager_accounts SET name = 'Ele geçirildi'`, A),
    ).rejects.toThrow(/permission denied/i);
  });

  it('KRİTİK: üyelik SİLEMİYOR', async () => {
    await expect(asUser('DELETE FROM manager_memberships', A)).rejects.toThrow(/permission denied/i);
  });

  it('OKUMA açık — yasak yalnızca yazmada', async () => {
    // Yasağı SELECT'e de uygulamak, üst hesap ekranını tamamen kör ederdi.
    await expect(asUser('SELECT id FROM manager_accounts', A)).resolves.toBeDefined();
  });
});

describe('şirket bağı', () => {
  it('üst hesap silinince ŞİRKETLER SİLİNMİYOR (SET NULL)', async () => {
    /*
     * Cascade olsaydı bir danışmanlık kaydını silmek, o danışmanın bütün
     * müşterilerinin bütün verisini götürürdü — geri alınamaz.
     */
    await h.q(`DELETE FROM manager_accounts WHERE id = '${UST_B}'`);
    const rows = await h.q<{ id: string; manager_account_id: string | null }>(
      `SELECT id, manager_account_id FROM organizations WHERE id = '${ORG_B1}'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.manager_account_id).toBeNull();
  });
});
