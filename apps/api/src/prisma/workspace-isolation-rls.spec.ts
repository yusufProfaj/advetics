import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * ═══ WORKSPACE İZOLASYONU — POLİTİKANIN KENDİSİ SINANIYOR ═══
 *
 * NEDEN YAZILDI: "Ege Birlik Yapı seçiliyken Fenbay ya da Mirnas'ın kartları
 * görünüyor" diye bir veri sızıntısı bildirildi. Bir sızıntı iddiası
 * güvenceyle değil KANITLA kapanır: bu paket, bildirilen senaryoyu birebir
 * kuruyor ve veritabanının ne gösterdiğini ölçüyor.
 *
 * BU PAKET RLS'İ AÇIYOR. `pglite-harness` politikaları kurduktan sonra RLS'i
 * kapatıyor — üretimde worker BYPASSRLS ile bağlandığı için doğru taklit bu.
 * Dolayısıyla NORMAL testler bir RLS boşluğunu GÖREMEZ. `SET ROLE` ile sahibi
 * olmayan bir role geçmek politikanın kendisini sınamaya yetiyor:
 * superuser RLS'i atlıyor, sıradan rol atlamıyor.
 *
 * İZOLASYON İKİ KATMANLI (`app.can_access_client`):
 *   1. ÜYELİK SINIRI — org yöneticisi değilse yalnızca kendi client_ids'i.
 *      Bu katman AŞILAMAZ; istemciden gelen hiçbir değer onu genişletmiyor.
 *   2. AKTİF MÜŞTERİ DARALTMASI — bir workspace seçiliyse yalnızca o.
 *      Bu katman kullanıcı seçimiyle DARALTIYOR, asla genişletmiyor.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const ORG_BASKA = '1e1e1e1e-1e1e-1e1e-1e1e-1e1e1e1e1e1e';
const USER = '22222222-2222-2222-2222-222222222222';
/** Diğer ajansın kullanıcısı — `connected_by_user_id` NOT NULL. */
const USER_BASKA = '2e2e2e2e-2e2e-2e2e-2e2e-2e2e2e2e2e2e';

/** Bildirilen senaryodaki üç müşteri. */
const EGE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const FENBAY = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MIRNAS = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const BASKA_AJANS_MUSTERISI = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const CONN = '33333333-3333-3333-3333-333333333333';
const CONN_BASKA = '3e3e3e3e-3e3e-3e3e-3e3e-3e3e3e3e3e3e';

const APP_ROLE = 'advetics_workspace_rls_test';

interface Ctx {
  orgId?: string | null;
  clientIds?: string[];
  isOrgAdmin?: boolean;
  activeClientId?: string | null;
}

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);

  for (const t of ['auto_boost_queue_items', 'auto_boost_presets', 'clients', 'social_profiles']) {
    await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  }
});

afterAll(async () => {
  await h.close();
});

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

/** Bildirim havuzunda GÖRÜNEN kartların başlıkları. */
async function havuzdaGorunen(ctx: Ctx): Promise<string[]> {
  const rows = await asUser<{ title: string }>(
    `SELECT title FROM auto_boost_queue_items ORDER BY title`,
    ctx,
  );
  return rows.map((r) => r.title);
}

beforeEach(async () => {
  await h.reset();
  await h.q(
    `INSERT INTO organizations (id, name, slug, updated_at)
     VALUES ($1, 'Profaj', 'profaj', now()), ($2, 'Başka Ajans', 'baska', now())`,
    [ORG, ORG_BASKA],
  );
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $5, 'Ege Birlik Yapı', 'ege', now()),
            ($2, $5, 'Fenbay', 'fenbay', now()),
            ($3, $5, 'Mirnas', 'mirnas', now()),
            ($4, $6, 'Rakip Ajans Müşterisi', 'rakip', now())`,
    [EGE, FENBAY, MIRNAS, BASKA_AJANS_MUSTERISI, ORG, ORG_BASKA],
  );
  await h.q(
    `INSERT INTO users (id, org_id, email, full_name, updated_at)
     VALUES ($1, $3, 'yonetici@advetics.com', 'Yönetici', now()),
            ($2, $4, 'rakip@baska.com', 'Rakip', now())`,
    [USER, USER_BASKA, ORG, ORG_BASKA],
  );
  await h.q(
    `INSERT INTO platform_connections
       (id, org_id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1, $3, NULL, 'meta', 'active', 'u1', 'BM', '\\x00', '{}', $5, now()),
            ($2, $4, NULL, 'meta', 'active', 'u2', 'BM2', '\\x00', '{}', $6, now())`,
    [CONN, CONN_BASKA, ORG, ORG_BASKA, USER, USER_BASKA],
  );

  // Her müşteriye bir sayfa ve bildirim havuzunda BİRER kart.
  const musteriler: Array<[string, string, string, string]> = [
    [EGE, ORG, CONN, 'Ege kartı'],
    [FENBAY, ORG, CONN, 'Fenbay kartı'],
    [MIRNAS, ORG, CONN, 'Mirnas kartı'],
    [BASKA_AJANS_MUSTERISI, ORG_BASKA, CONN_BASKA, 'Rakip kartı'],
  ];
  for (const [client, org, conn, baslik] of musteriler) {
    const profil = `${client.slice(0, 8)}-0000-0000-0000-000000000001`;
    await h.q(
      `INSERT INTO social_profiles
         (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
       VALUES ($1, $2, $3, $4, 'instagram_business', $5, 'Hesap', now())`,
      [profil, org, client, conn, `ig-${client.slice(0, 8)}`],
    );
    await h.q(
      `INSERT INTO auto_boost_queue_items
         (id, org_id, client_id, platform, social_profile_id, external_id, title, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'meta', $3, $4, $5, now())`,
      [org, client, profil, `media-${client.slice(0, 8)}`, baslik],
    );
    await h.q(
      `INSERT INTO auto_boost_presets
         (id, org_id, client_id, platform, social_profile_id, enabled, budget_mode,
          daily_budget_micros, duration_days, settings, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'meta', NULL, true, 'daily', 100000000, 3,
               '{"platform":"meta","goal":"engagement","locations":[],"ageMin":18,"ageMax":65,"genders":"all","savedAudienceId":null}'::jsonb,
               now())`,
      [org, client],
    );
  }
});

describe('BİLDİRİLEN SENARYO — bir workspace seçiliyken diğerleri', () => {
  it('KRİTİK: Ege Birlik Yapı seçiliyken YALNIZCA Ege’nin kartı görünüyor', async () => {
    /*
     * BİLDİRİLEN HATA TAM OLARAK BUYDU. Ajans yöneticisi üç müşterinin
     * hepsine erişebiliyor; aktif workspace seçiliyken veritabanının
     * diğerlerini GÖSTERMEMESİ gerekiyor.
     */
    expect(
      await havuzdaGorunen({
        isOrgAdmin: true,
        clientIds: [EGE, FENBAY, MIRNAS],
        activeClientId: EGE,
      }),
    ).toEqual(['Ege kartı']);
  });

  it('KRİTİK: ön ayarlar (Bilgi Bankası) da yalnızca aktif workspace’in', async () => {
    const rows = await asUser<{ name: string }>(
      `SELECT c.name FROM auto_boost_presets p JOIN clients c ON c.id = p.client_id ORDER BY c.name`,
      { isOrgAdmin: true, clientIds: [EGE, FENBAY, MIRNAS], activeClientId: EGE },
    );
    expect(rows.map((r) => r.name)).toEqual(['Ege Birlik Yapı']);
  });

  it('workspace SEÇİLİ DEĞİLKEN yönetici hepsini görüyor — havuz yönetimi buna bağlı', async () => {
    // Bu bir sızıntı değil, ajans görünümü: müşteri atama ve havuz ekranları
    // seçili müşteri olmadan çalışıyor. Daraltma KULLANICI SEÇİMİYLE oluyor.
    expect(
      await havuzdaGorunen({
        isOrgAdmin: true,
        clientIds: [EGE, FENBAY, MIRNAS],
        activeClientId: null,
      }),
    ).toEqual(['Ege kartı', 'Fenbay kartı', 'Mirnas kartı']);
  });
});

describe('MÜŞTERİ KULLANICISI (client_viewer) — üyelik sınırı AŞILAMAZ', () => {
  /** Yalnızca Ege'ye üye, org yöneticisi DEĞİL. */
  const EGE_MUSTERISI: Ctx = { isOrgAdmin: false, clientIds: [EGE] };

  it('KRİTİK: yalnızca kendi workspace’ini görüyor', async () => {
    expect(await havuzdaGorunen({ ...EGE_MUSTERISI, activeClientId: EGE })).toEqual([
      'Ege kartı',
    ]);
  });

  it('KRİTİK: aktif workspace HİÇ seçili değilken bile başkasını görmüyor', async () => {
    // Daraltma katmanı kapalı; geriye YALNIZCA üyelik sınırı kalıyor ve o
    // yeterli olmak zorunda. İzolasyonun aktif seçime bağlı olması, cookie
    // silen bir kullanıcıya bütün ajansı açardı.
    expect(await havuzdaGorunen({ ...EGE_MUSTERISI, activeClientId: null })).toEqual([
      'Ege kartı',
    ]);
  });

  it('KRİTİK: BAŞKA workspace’i aktif ilan ederse HİÇBİR ŞEY göremiyor', async () => {
    /*
     * YETKİ YÜKSELTME DENEMESİ. `activeClientId` istemciden geliyor; sahte
     * bir değerle Fenbay'a geçmeye çalışmak boş sonuç veriyor — çünkü
     * `can_access_client` iki koşulu VE'liyor ve üyelik koşulu tutmuyor.
     */
    expect(await havuzdaGorunen({ ...EGE_MUSTERISI, activeClientId: FENBAY })).toEqual([]);
  });

  it('KRİTİK: diğer workspace’lerin ADINI bile göremiyor', async () => {
    // Müşteri hesabı diğer markaların varlığını bilmemeli — isim de veridir.
    const rows = await asUser<{ name: string }>(`SELECT name FROM clients ORDER BY name`, {
      ...EGE_MUSTERISI,
      activeClientId: null,
    });
    expect(rows.map((r) => r.name)).toEqual(['Ege Birlik Yapı']);
  });
});

describe('AJANSLAR ARASI — org sınırı', () => {
  it('KRİTİK: başka ajansın müşterisi HİÇBİR bağlamda görünmüyor', async () => {
    const hepsi = await havuzdaGorunen({
      isOrgAdmin: true,
      clientIds: [EGE, FENBAY, MIRNAS],
      activeClientId: null,
    });
    expect(hepsi).not.toContain('Rakip kartı');
  });

  it('KRİTİK: başka ajansın müşteri kimliğini clientIds’e YAZMAK işe yaramıyor', async () => {
    // org_id koşulu ayrı bir katman: erişim listesine yabancı bir kimlik
    // enjekte etmek satırı görünür kılmıyor.
    expect(
      await havuzdaGorunen({
        isOrgAdmin: false,
        clientIds: [EGE, BASKA_AJANS_MUSTERISI],
        activeClientId: BASKA_AJANS_MUSTERISI,
      }),
    ).toEqual([]);
  });
});

describe('BAĞLAM YOKSA HİÇBİR ŞEY', () => {
  it('KRİTİK: kiracı bağlamı kurulmadan hiçbir satır görünmüyor', async () => {
    // `app.has_context()` yanlışsa politika kapalı kalıyor. Bağlam kurmayı
    // unutan bir kod yolu BOŞ liste görüyor — bütün ajansı değil.
    expect(await havuzdaGorunen({ orgId: null, clientIds: [], isOrgAdmin: false })).toEqual([]);
  });
});
