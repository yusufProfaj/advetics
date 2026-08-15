import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * AJANS BAĞLANTISI ŞEMASI — migration'ın kilitlediği dört kural.
 *
 * Hepsi veritabanı seviyesinde ve hiçbiri TypeScript'in göreceği bir şey
 * değil. Üçü de üretimde yaşanmış bir arızanın karşılığı:
 *
 *   1. Aynı reklam hesabı organizasyonda TEK satır. Müşteri bazlı modelde
 *      ajansın 157 hesabı her müşteriye ayrı yazılıyordu ve üretimde 1.134
 *      mükerrer satır birikti.
 *   2. Aynı platform kimliği organizasyonda TEK bağlantı. Her yeni
 *      yetkilendirme öncekinin token'ını geçersiz kılıyordu.
 *   3. Müşteri silinince hesap HAVUZA DÖNÜYOR, silinmiyor.
 *   4. Atanan müşteri hesabın KENDİ organizasyonundan olmak zorunda.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const ORG_OTHER = '1e1e1e1e-1e1e-1e1e-1e1e-1e1e1e1e1e1e';
const CLIENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_OTHER = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER = '22222222-2222-2222-2222-222222222222';
const CONN = '33333333-3333-3333-3333-333333333333';

beforeAll(async () => {
  h = await createHarness();
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await h.q(
    `INSERT INTO organizations (id, name, slug, updated_at)
     VALUES ($1, 'Ajans', 'ajans', now()), ($2, 'Başka', 'baska', now())`,
    [ORG, ORG_OTHER],
  );
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $3, 'Müşteri', 'musteri', now()), ($2, $4, 'Yabancı', 'yabanci', now())`,
    [CLIENT, CLIENT_OTHER, ORG, ORG_OTHER],
  );
  await h.q(
    `INSERT INTO users (id, org_id, email, full_name, updated_at)
     VALUES ($1, $2, 'a@advetics.com', 'A', now())`,
    [USER, ORG],
  );
  await h.q(
    `INSERT INTO platform_connections
       (id, org_id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1, $2, NULL, 'meta', 'active', 'meta-user-1', 'Ajans BM', '\\x00', '{}', $3, now())`,
    [CONN, ORG, USER],
  );
});

async function insertAccount(opts: {
  id: string;
  orgId?: string;
  clientId?: string | null;
  externalId?: string;
}): Promise<void> {
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, updated_at)
     VALUES ($1, $2, $3, $4, 'meta', $5, 'Hesap', 'TRY', 'Europe/Istanbul', now())`,
    [opts.id, opts.orgId ?? ORG, opts.clientId ?? null, CONN, opts.externalId ?? 'act_1'],
  );
}

describe('tekillik — organizasyon bazında', () => {
  it('AYNI reklam hesabı organizasyonda iki kez eklenemiyor', async () => {
    await insertAccount({ id: '44444444-4444-4444-4444-444444444444' });
    await expect(
      insertAccount({ id: '55555555-5555-5555-5555-555555555555' }),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('havuzdaki hesap ATANDIKTAN sonra da mükerrer eklenemiyor', async () => {
    // Tekillik `client_id` üzerinde olsaydı NULL'lar birbirine eşit
    // sayılmadığı için havuzda aynı hesap defalarca birikirdi — kısıt
    // sessizce hiçbir şey yapmazdı.
    await insertAccount({ id: '44444444-4444-4444-4444-444444444444' });
    await h.q(`UPDATE ad_accounts SET client_id = $1`, [CLIENT]);
    await expect(
      insertAccount({ id: '55555555-5555-5555-5555-555555555555' }),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('BAŞKA organizasyon aynı reklam hesabını ekleyebiliyor', async () => {
    // Ajanslar arası izolasyon: aynı Meta hesabına iki ajans da erişebilir.
    await insertAccount({ id: '44444444-4444-4444-4444-444444444444' });
    await h.q(
      `INSERT INTO platform_connections
         (id, org_id, client_id, platform, status, external_user_id, account_label,
          access_token_enc, granted_scopes, connected_by_user_id, updated_at)
       VALUES ($1, $2, NULL, 'meta', 'active', 'meta-user-2', 'Başka BM', '\\x00', '{}', $3, now())`,
      ['3e3e3e3e-3e3e-3e3e-3e3e-3e3e3e3e3e3e', ORG_OTHER, USER],
    );
    await h.q(
      `INSERT INTO ad_accounts
         (id, org_id, client_id, connection_id, platform, external_id, name, currency,
          timezone, updated_at)
       VALUES ($1, $2, NULL, $3, 'meta', 'act_1', 'Hesap', 'TRY', 'Europe/Istanbul', now())`,
      ['5e5e5e5e-5e5e-5e5e-5e5e-5e5e5e5e5e5e', ORG_OTHER, '3e3e3e3e-3e3e-3e3e-3e3e-3e3e3e3e3e3e'],
    );
    const rows = await h.q<{ n: string }>(`SELECT count(*) AS n FROM ad_accounts`);
    expect(Number(rows[0]!.n)).toBe(2);
  });

  it('AYNI platform kimliği organizasyonda iki bağlantı açamıyor', async () => {
    // Kopma sorununun kaynağı buydu: aynı kimlik müşteri başına yeniden
    // yetkilendiriliyor ve platform öncekini geçersiz kılıyordu.
    await expect(
      h.q(
        `INSERT INTO platform_connections
           (id, org_id, client_id, platform, status, external_user_id, account_label,
            access_token_enc, granted_scopes, connected_by_user_id, updated_at)
         VALUES ($1, $2, $3, 'meta', 'active', 'meta-user-1', 'İkinci', '\\x00', '{}', $4, now())`,
        ['3d3d3d3d-3d3d-3d3d-3d3d-3d3d3d3d3d3d', ORG, CLIENT, USER],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });
});

describe('müşteri silinmesi', () => {
  it('KRİTİK: hesap SİLİNMİYOR, havuza dönüyor', async () => {
    // Cascade bıraksaydık bir müşteriyi silmek ajansın reklam hesabı kaydını
    // da götürürdü — oysa hesap ajansa ait ve başka müşteriye atanabilir.
    await insertAccount({ id: '44444444-4444-4444-4444-444444444444', clientId: CLIENT });
    await h.q(`DELETE FROM clients WHERE id = $1`, [CLIENT]);

    const rows = await h.q<{ client_id: string | null; org_id: string }>(
      `SELECT client_id, org_id FROM ad_accounts`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.client_id).toBeNull();
    expect(rows[0]!.org_id).toBe(ORG);
  });

  it('müşteriye özel bağlantı da hayatta kalıyor, ajans geneline dönüyor', async () => {
    await h.q(`UPDATE platform_connections SET client_id = $1 WHERE id = $2`, [CLIENT, CONN]);
    await h.q(`DELETE FROM clients WHERE id = $1`, [CLIENT]);

    const rows = await h.q<{ client_id: string | null }>(
      `SELECT client_id FROM platform_connections`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.client_id).toBeNull();
  });
});

describe('sosyal profiller — aynı havuz kuralları', () => {
  const PROFILE = '66666666-6666-6666-6666-666666666666';

  async function insertProfile(id: string, externalId = 'page-1', clientId: string | null = null) {
    await h.q(
      `INSERT INTO social_profiles
         (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
       VALUES ($1, $2, $3, $4, 'facebook_page', $5, 'Sayfa', now())`,
      [id, ORG, clientId, CONN, externalId],
    );
  }

  it('AYNI sayfa organizasyonda iki kez eklenemiyor', async () => {
    // Tekillik eskiden BAĞLANTI bazındaydı: ikinci bir Meta kimliği
    // bağlandığında aynı sayfa iki satır olurdu ve Auto-Boost hangisini
    // kullanacağını bilemezdi.
    await insertProfile(PROFILE);
    await expect(insertProfile('67676767-6767-6767-6767-676767676767')).rejects.toThrow(
      /duplicate key|unique/i,
    );
  });

  it('müşteri silinince sayfa HAVUZA dönüyor, silinmiyor', async () => {
    await insertProfile(PROFILE, 'page-1', CLIENT);
    await h.q(`DELETE FROM clients WHERE id = $1`, [CLIENT]);

    const rows = await h.q<{ client_id: string | null; org_id: string }>(
      `SELECT client_id, org_id FROM social_profiles`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.client_id).toBeNull();
    expect(rows[0]!.org_id).toBe(ORG);
  });

  it('sayfa BAŞKA organizasyonun müşterisine atanamıyor', async () => {
    await insertProfile(PROFILE);
    await expect(
      h.q(`UPDATE social_profiles SET client_id = $1`, [CLIENT_OTHER]),
    ).rejects.toThrow(/foreign key|violates/i);
  });
});

describe('organizasyon tutarlılığı', () => {
  it('KRİTİK: hesap BAŞKA organizasyonun müşterisine atanamıyor', async () => {
    /*
     * Kompozit yabancı anahtar (client_id, org_id) → clients(id, org_id).
     * Olmasaydı RLS'in iki koşulu — org_id eşleşmesi ve can_access_client() —
     * birbirini doğrulamak yerine ayrı ayrı eşleşirdi: atama uç noktasındaki
     * tek bir hata satırı iki organizasyona birden yarı görünür yapardı.
     */
    await insertAccount({ id: '44444444-4444-4444-4444-444444444444' });
    await expect(
      h.q(`UPDATE ad_accounts SET client_id = $1`, [CLIENT_OTHER]),
    ).rejects.toThrow(/foreign key|violates/i);
  });
});
