import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * HAVUZ POLİTİKASI — `ad_accounts` ve `platform_connections` tablo
 * politikalarının GERÇEKTEN uygulandığı test.
 *
 * NEDEN AYRI BİR PAKET: `pglite-harness` politikaları kurduktan sonra RLS'i
 * KAPATIYOR — üretimde worker BYPASSRLS ile bağlandığı için doğru taklit bu.
 * Sonuç olarak normal testler bir RLS boşluğunu göremiyor ve migration planı
 * "politikalar ELLE gözden geçirilecek" diyordu.
 *
 * Elle gözden geçirmek, `client_id` NULL olabilen bir tabloda yeterli değil:
 * yanlış yazılmış tek bir koşul ajansın 157 hesabını yanlış kiracıya açar,
 * ters yönde ise atama ekranını kalıcı olarak boş bırakır. İkisi de sessiz.
 *
 * BU PAKET POLİTİKAYI AÇIYOR. `SET ROLE` ile sahibi olmayan bir role geçmek
 * yeterli: superuser RLS'i atlıyor, sıradan rol atlamıyor. Böylece politikanın
 * KENDİSİ sınanıyor — kopyalanmış bir SQL ifadesi değil.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const ORG_OTHER = '1e1e1e1e-1e1e-1e1e-1e1e-1e1e1e1e1e1e';
const USER = '22222222-2222-2222-2222-222222222222';
const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLIENT_OTHER = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CONN = '33333333-3333-3333-3333-333333333333';
const CONN_OTHER = '3e3e3e3e-3e3e-3e3e-3e3e-3e3e3e3e3e3e';
const ACC_POOL = '44444444-4444-4444-4444-444444444444';
const ACC_ASSIGNED = '55555555-5555-5555-5555-555555555555';
const ACC_OTHER_ORG = '5e5e5e5e-5e5e-5e5e-5e5e-5e5e5e5e5e5e';
const PROFILE_POOL = '66666666-6666-6666-6666-666666666666';
const PROFILE_ASSIGNED = '77777777-7777-7777-7777-777777777777';

/** Politika uygulanan rol. Tabloların sahibi DEĞİL — RLS ancak öyle işliyor. */
const APP_ROLE = 'advetics_rls_test';

beforeAll(async () => {
  h = await createHarness();

  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);

  // Koşum ortamı RLS'i kapatmıştı; bu paketin konusu olan iki tabloda geri
  // açıyoruz. Politikalar zaten `02_rls.sql` ile kuruldu ve silinmedi.
  for (const t of ['ad_accounts', 'platform_connections', 'social_profiles']) {
    await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  }
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
     VALUES ($1, $4, 'A', 'a', now()), ($2, $4, 'B', 'b', now()), ($3, $5, 'C', 'c', now())`,
    [CLIENT_A, CLIENT_B, CLIENT_OTHER, ORG, ORG_OTHER],
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
     VALUES ($1, $3, NULL, 'meta', 'active', 'u1', 'Ajans BM', '\\x00', '{}', $5, now()),
            ($2, $4, NULL, 'meta', 'active', 'u2', 'Başka BM', '\\x00', '{}', $5, now())`,
    [CONN, CONN_OTHER, ORG, ORG_OTHER, USER],
  );
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, updated_at)
     VALUES ($1, $4, NULL,  $6, 'meta', 'act_pool',     'Havuz',    'TRY', 'Europe/Istanbul', now()),
            ($2, $4, $8,    $6, 'meta', 'act_assigned', 'A hesabı', 'TRY', 'Europe/Istanbul', now()),
            ($3, $5, NULL,  $7, 'meta', 'act_other',    'Yabancı',  'TRY', 'Europe/Istanbul', now())`,
    [ACC_POOL, ACC_ASSIGNED, ACC_OTHER_ORG, ORG, ORG_OTHER, CONN, CONN_OTHER, CLIENT_A],
  );
  await h.q(
    `INSERT INTO social_profiles
       (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $3, NULL, $5, 'facebook_page', 'page_pool',     'Havuz sayfası', now()),
            ($2, $3, $4,   $5, 'facebook_page', 'page_assigned', 'A sayfası',     now())`,
    [PROFILE_POOL, PROFILE_ASSIGNED, ORG, CLIENT_A, CONN],
  );
});

interface Ctx {
  clientIds?: string[];
  isOrgAdmin?: boolean;
  activeClientId?: string | null;
  orgId?: string | null;
}

/**
 * Sorguyu politika uygulanan rolle çalıştırır.
 *
 * `set_config(..., false)` — oturum ömrü. Üretimde `SET LOCAL` (transaction
 * ömürlü) kullanılıyor ama burada bağlamı kurmak ile sorgulamak ayrı
 * çağrılar; transaction ömürlü değer ikinciye ulaşmazdı.
 */
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
const CLIENT_USER: Ctx = { clientIds: [CLIENT_A], isOrgAdmin: false };

async function visibleAccounts(ctx: Ctx): Promise<string[]> {
  const rows = await asUser<{ name: string }>('SELECT name FROM ad_accounts ORDER BY name', ctx);
  return rows.map((r) => r.name);
}

describe('ad_accounts — havuz görünürlüğü', () => {
  it('ORG YÖNETİCİSİ havuzu da atanmışı da görüyor', async () => {
    // Atama ekranının çalışması buna bağlı: havuz görünmezse yönetici hiçbir
    // hesabı müşteriye atayamaz ve ekran kalıcı olarak boş kalır.
    expect(await visibleAccounts(ORG_ADMIN)).toEqual(['A hesabı', 'Havuz']);
  });

  it('KRİTİK: müşteri düzeyi kullanıcı HAVUZU GÖRMÜYOR', async () => {
    // Havuz, ajansın erişebildiği TÜM reklam hesaplarının listesi (Meta'da
    // 157) ve çoğu başka müşterilere ait. Tek bir kullanıcıya göstermek,
    // ajansın müşteri portföyünü tek ekranda sızdırmak olurdu.
    expect(await visibleAccounts(CLIENT_USER)).toEqual(['A hesabı']);
  });

  it('BAŞKA ORGANİZASYONUN hesabı hiç kimseye görünmüyor', async () => {
    expect(await visibleAccounts(ORG_ADMIN)).not.toContain('Yabancı');
    expect(await visibleAccounts({ ...ORG_ADMIN, isOrgAdmin: true, clientIds: [CLIENT_OTHER] })).not.toContain(
      'Yabancı',
    );
  });

  it('BAĞLAM KURULMAMIŞSA hiçbir satır görünmüyor', async () => {
    expect(await visibleAccounts({ orgId: null, isOrgAdmin: true })).toEqual([]);
  });

  it('aktif müşteri seçimi ATANMIŞ hesapları daraltıyor, havuzu daraltmıyor', async () => {
    // Seçim bir GÖRÜNÜM süzgeci. B seçiliyken A'nın hesabı düşüyor; havuz ise
    // yöneticinin yönetim yüzeyi olduğu için yerinde kalıyor.
    const names = await visibleAccounts({ ...ORG_ADMIN, activeClientId: CLIENT_B });
    expect(names).toEqual(['Havuz']);
  });
});

describe('ad_accounts — atama yazma yolu', () => {
  it('ORG YÖNETİCİSİ havuzdaki hesabı müşteriye atayabiliyor', async () => {
    await asUser(`UPDATE ad_accounts SET client_id = '${CLIENT_B}' WHERE id = '${ACC_POOL}'`, ORG_ADMIN);
    const rows = await h.q<{ client_id: string | null }>(
      `SELECT client_id FROM ad_accounts WHERE id = '${ACC_POOL}'`,
    );
    expect(rows[0]?.client_id).toBe(CLIENT_B);
  });

  it('KRİTİK: BAŞKA müşteri SEÇİLİYKEN atama REDDEDİLİYOR — atama uç noktası seçimi kapatmalı', async () => {
    /*
     * BU BİR POLİTİKA HATASI DEĞİL, POSTGRES KURALI — ve yazılırken deneyle
     * bulundu.
     *
     * Bir UPDATE'ten sonra YENİ satır, tablonun SELECT politikasından da
     * geçmek zorunda. `can_access_client()` panelde seçili müşteriye
     * daraltıyor; A seçiliyken satırı B'ye taşımak, satırı kendi görüş
     * alanının dışına çıkarıyor ve Postgres UPDATE'i reddediyor.
     *
     * WITH CHECK'i gevşetmek çözmüyor (denendi): engel SELECT politikasında.
     * SELECT politikasındaki daraltmayı kaldırmak ise ASLA doğru değil —
     * tam olarak o daraltma, org yöneticisinin Çiftçi Grup seçiliyken
     * Mirnas'ın verisini görmesi hatasının düzeltmesiydi.
     *
     * Doğru çözüm çağıran tarafta: atama uç noktası bağlamı
     * `activeClientId: null` ile kurmalı. Bu test o gerekliliği kilitliyor —
     * 6. adımda atama ekranı yazılırken "neden 'satır politikayı ihlal
     * ediyor' hatası alıyorum" sorusunun cevabı burada duruyor.
     */
    await expect(
      asUser(`UPDATE ad_accounts SET client_id = '${CLIENT_B}' WHERE id = '${ACC_POOL}'`, {
        ...ORG_ADMIN,
        activeClientId: CLIENT_A,
      }),
    ).rejects.toThrow(/row-level security/i);

    // Seçim kapalıyken aynı atama sorunsuz geçiyor.
    await asUser(`UPDATE ad_accounts SET client_id = '${CLIENT_B}' WHERE id = '${ACC_POOL}'`, {
      ...ORG_ADMIN,
      activeClientId: null,
    });
    const rows = await h.q<{ client_id: string | null }>(
      `SELECT client_id FROM ad_accounts WHERE id = '${ACC_POOL}'`,
    );
    expect(rows[0]?.client_id).toBe(CLIENT_B);
  });

  it('müşteri düzeyi kullanıcı havuzdaki hesaba DOKUNAMIYOR', async () => {
    // Satır zaten görünmüyor; UPDATE hata vermeden 0 satır etkiliyor. Sessiz
    // gibi duruyor ama doğru olan bu: politika satırı yok sayıyor.
    await asUser(`UPDATE ad_accounts SET sync_enabled = true WHERE id = '${ACC_POOL}'`, CLIENT_USER);
    const rows = await h.q<{ sync_enabled: boolean }>(
      `SELECT sync_enabled FROM ad_accounts WHERE id = '${ACC_POOL}'`,
    );
    expect(rows[0]?.sync_enabled).toBe(false);
  });

  it('KRİTİK: kendi hesabını ERİŞEMEDİĞİ müşteriye taşıyamıyor', async () => {
    // USING eski hâli denetliyor, WITH CHECK yenisini. WITH CHECK olmasaydı
    // satır erişilemeyen bir müşteriye TAŞINABİLİRDİ.
    await expect(
      asUser(`UPDATE ad_accounts SET client_id = '${CLIENT_B}' WHERE id = '${ACC_ASSIGNED}'`, CLIENT_USER),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('social_profiles — havuz', () => {
  async function visibleProfiles(ctx: Ctx): Promise<string[]> {
    const rows = await asUser<{ name: string }>(
      'SELECT name FROM social_profiles ORDER BY name',
      ctx,
    );
    return rows.map((r) => r.name);
  }

  it('ORG YÖNETİCİSİ havuzdaki sayfayı da görüyor', async () => {
    expect(await visibleProfiles(ORG_ADMIN)).toEqual(['A sayfası', 'Havuz sayfası']);
  });

  it('KRİTİK: müşteri düzeyi kullanıcı HAVUZDAKİ SAYFAYI GÖRMÜYOR', async () => {
    // Havuz, ajansın Meta kimliğinin eriştiği bütün sayfaların listesi —
    // çoğu başka müşterilere ait. Bir müşteri temsilcisine göstermek, ajansın
    // portföyünü tek ekranda sızdırmak olurdu.
    expect(await visibleProfiles(CLIENT_USER)).toEqual(['A sayfası']);
  });

  it('müşteri düzeyi kullanıcı havuzdaki sayfaya DOKUNAMIYOR', async () => {
    await asUser(
      `UPDATE social_profiles SET client_id = '${CLIENT_A}' WHERE id = '${PROFILE_POOL}'`,
      CLIENT_USER,
    );
    const rows = await h.q<{ client_id: string | null }>(
      `SELECT client_id FROM social_profiles WHERE id = '${PROFILE_POOL}'`,
    );
    expect(rows[0]?.client_id).toBeNull();
  });

  it('ORG YÖNETİCİSİ seçim kapalıyken sayfayı atayabiliyor', async () => {
    await asUser(
      `UPDATE social_profiles SET client_id = '${CLIENT_B}' WHERE id = '${PROFILE_POOL}'`,
      { ...ORG_ADMIN, activeClientId: null },
    );
    const rows = await h.q<{ client_id: string | null }>(
      `SELECT client_id FROM social_profiles WHERE id = '${PROFILE_POOL}'`,
    );
    expect(rows[0]?.client_id).toBe(CLIENT_B);
  });

  it('KRİTİK: sayfayı ERİŞEMEDİĞİ müşteriye taşıyamıyor', async () => {
    await expect(
      asUser(
        `UPDATE social_profiles SET client_id = '${CLIENT_B}' WHERE id = '${PROFILE_ASSIGNED}'`,
        CLIENT_USER,
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});

describe('platform_connections — ajans geneli bağlantı', () => {
  it('aynı organizasyondaki kullanıcı ajans bağlantısını GÖRÜYOR', async () => {
    // Görmeseydi Platform Bağlantıları ekranı manager/analyst için boş
    // kalırdı ve boş liste, yetki hatasından ayırt edilemezdi.
    const rows = await asUser<{ account_label: string }>(
      'SELECT account_label FROM platform_connections ORDER BY account_label',
      CLIENT_USER,
    );
    expect(rows.map((r) => r.account_label)).toEqual(['Ajans BM']);
  });

  it('BAŞKA organizasyonun bağlantısı görünmüyor', async () => {
    const rows = await asUser<{ account_label: string }>(
      'SELECT account_label FROM platform_connections',
      ORG_ADMIN,
    );
    expect(rows.map((r) => r.account_label)).not.toContain('Başka BM');
  });

  it('KRİTİK: ajans geneli bağlantıyı yalnızca ORG YÖNETİCİSİ iptal edebiliyor', async () => {
    // Ajans bağlantısını kaldırmak BÜTÜN müşterilerin senkronizasyonunu
    // birden durdurur; bu bir org yöneticisi kararı.
    await asUser(`UPDATE platform_connections SET status = 'revoked' WHERE id = '${CONN}'`, CLIENT_USER);
    let rows = await h.q<{ status: string }>(
      `SELECT status FROM platform_connections WHERE id = '${CONN}'`,
    );
    expect(rows[0]?.status).toBe('active');

    await asUser(`UPDATE platform_connections SET status = 'revoked' WHERE id = '${CONN}'`, ORG_ADMIN);
    rows = await h.q<{ status: string }>(`SELECT status FROM platform_connections WHERE id = '${CONN}'`);
    expect(rows[0]?.status).toBe('revoked');
  });
});
