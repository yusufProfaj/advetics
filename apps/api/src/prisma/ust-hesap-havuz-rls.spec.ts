import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * ═══ HAVUZ ÜST HESAP (MCC) ALTINDA ORTAK — AMA ATANMIŞLAR DEĞİL ═══
 *
 * Platform bağlantısı AJANSA ait, şirkete değil. Üst hesap katmanıyla bir
 * ajans birden çok şirkete yayılıyor ve tek Meta yetkilendirmesi hepsine
 * hizmet ediyor — şirket başına ayrı bağlantı mümkün değil, çünkü her
 * yetkilendirme aynı Facebook kullanıcısı oluyor ve ikincisi birincinin
 * token'ını koparıyor.
 *
 * BU DEĞİŞİKLİK BİR SINIRI GENİŞLETİYOR ve genişletilen her sınır iki yönde
 * de ölçülmek zorunda:
 *
 *   AÇILMASI GEREKEN: aynı üst hesabın kardeş şirketi havuzu görüyor.
 *   KAPALI KALMASI GEREKEN: kardeş şirketin ATANMIŞ hesapları, başka bir
 *   üst hesabın her şeyi, ve üst hesabı olmayan kullanıcı için eski davranış.
 *
 * PAKET RLS'İ AÇIYOR (`SET ROLE`) — koşum ortamı politikaları kurduktan
 * sonra RLS'i kapatıyor, yani normal testler bir boşluğu göremez.
 */
let h: Harness;

const UST_A = 'a0000000-0000-0000-0000-00000000000a';
const UST_B = 'b0000000-0000-0000-0000-00000000000b';

/** UST_A'nın iki şirketi. */
const ORG_A1 = '11111111-1111-1111-1111-111111111111';
const ORG_A2 = '22222222-2222-2222-2222-222222222222';
/** Başka danışmanlığın şirketi. */
const ORG_B1 = '33333333-3333-3333-3333-333333333333';
/** Hiçbir üst hesaba bağlı OLMAYAN şirket — eski davranışın kontrolü. */
const ORG_YALNIZ = '44444444-4444-4444-4444-444444444444';

const USER = '99999999-9999-9999-9999-999999999999';

const WS_A1 = 'aaaa1111-1111-1111-1111-111111111111';
const WS_A2 = 'aaaa2222-2222-2222-2222-222222222222';
const WS_B1 = 'bbbb1111-1111-1111-1111-111111111111';

const CONN_A1 = 'c0000000-0000-0000-0000-0000000000a1';
const CONN_B1 = 'c0000000-0000-0000-0000-0000000000b1';
const CONN_YALNIZ = 'c0000000-0000-0000-0000-0000000000cc';

const APP_ROLE = 'advetics_havuz_rls_test';

interface Ctx {
  orgId: string;
  ustHesap?: string | null;
  clientIds?: string[];
  isOrgAdmin?: boolean;
  poolYetkisi?: boolean;
}

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  await h.q(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${APP_ROLE}`);

  /*
   * `organizations` DA AÇILIYOR ve bu kritik: `app.ajans_org_idleri()` o
   * tabloyu okuyor. Kapalı bırakmak, testin üretimden farklı bir dünyada
   * koşması demekti.
   */
  for (const t of ['ad_accounts', 'platform_connections', 'social_profiles', 'organizations']) {
    await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  }

  await h.q(`
    INSERT INTO manager_accounts (id, name, slug, status, created_at, updated_at) VALUES
      ('${UST_A}', 'A Danışmanlık', 'a-dan', 'active', now(), now()),
      ('${UST_B}', 'B Danışmanlık', 'b-dan', 'active', now(), now())
  `);
  await h.q(`
    INSERT INTO organizations (id, name, slug, plan, status, manager_account_id, created_at, updated_at) VALUES
      ('${ORG_A1}', 'A1', 'a1', 'starter', 'active', '${UST_A}', now(), now()),
      ('${ORG_A2}', 'A2', 'a2', 'starter', 'active', '${UST_A}', now(), now()),
      ('${ORG_B1}', 'B1', 'b1', 'starter', 'active', '${UST_B}', now(), now()),
      ('${ORG_YALNIZ}', 'Yalnız', 'yalniz', 'starter', 'active', NULL, now(), now())
  `);
  await h.q(`
    INSERT INTO users (id, org_id, email, full_name, password_hash, locale, status, created_at, updated_at)
    VALUES ('${USER}', '${ORG_A1}', 'u@x.com', 'U', 'h', 'tr', 'active', now(), now())
  `);
  await h.q(`
    INSERT INTO clients (id, org_id, name, slug, timezone, reporting_currency, status, contact_emails, created_at, updated_at) VALUES
      ('${WS_A1}', '${ORG_A1}', 'A1 WS', 'a1-ws', 'Europe/Istanbul', 'TRY', 'active', '{}', now(), now()),
      ('${WS_A2}', '${ORG_A2}', 'A2 WS', 'a2-ws', 'Europe/Istanbul', 'TRY', 'active', '{}', now(), now()),
      ('${WS_B1}', '${ORG_B1}', 'B1 WS', 'b1-ws', 'Europe/Istanbul', 'TRY', 'active', '{}', now(), now())
  `);
  await h.q(`
    INSERT INTO platform_connections
      (id, org_id, client_id, platform, external_user_id, account_label, access_token_enc, status, connected_by_user_id, created_at, updated_at) VALUES
      ('${CONN_A1}', '${ORG_A1}', NULL, 'meta', 'fb-1', 'Ajans Meta', '\\x00', 'active', '${USER}', now(), now()),
      ('${CONN_B1}', '${ORG_B1}', NULL, 'meta', 'fb-2', 'B Meta', '\\x00', 'active', '${USER}', now(), now()),
      ('${CONN_YALNIZ}', '${ORG_YALNIZ}', NULL, 'meta', 'fb-3', 'Yalnız Meta', '\\x00', 'active', '${USER}', now(), now())
  `);
  await h.q(`
    INSERT INTO ad_accounts
      (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at) VALUES
      ('a1000000-0000-0000-0000-000000000001', '${ORG_A1}', NULL,      '${CONN_A1}', 'meta', 'act_havuz',  'Havuz hesabı',  'TRY', 'Europe/Istanbul', now()),
      ('a1000000-0000-0000-0000-000000000002', '${ORG_A1}', '${WS_A1}','${CONN_A1}', 'meta', 'act_a1',     'A1 atanmış',    'TRY', 'Europe/Istanbul', now()),
      ('a2000000-0000-0000-0000-000000000003', '${ORG_A2}', '${WS_A2}','${CONN_A1}', 'meta', 'act_a2',     'A2 atanmış',    'TRY', 'Europe/Istanbul', now()),
      ('b1000000-0000-0000-0000-000000000004', '${ORG_B1}', NULL,      '${CONN_B1}', 'meta', 'act_b',      'B havuz',       'TRY', 'Europe/Istanbul', now()),
      ('e0000000-0000-0000-0000-000000000005', '${ORG_YALNIZ}', NULL,  '${CONN_YALNIZ}', 'meta', 'act_y',  'Yalnız havuz',  'TRY', 'Europe/Istanbul', now()),
      ('a1000000-0000-0000-0000-000000000006', '${ORG_A1}', NULL,      '${CONN_A1}', 'meta', 'act_havuz2', 'İkinci havuz', 'TRY', 'Europe/Istanbul', now())
  `);
});

afterAll(async () => {
  await h.close();
});

async function asUser<T = Record<string, unknown>>(sql: string, ctx: Ctx): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id',             '${ctx.orgId}', false),
           set_config('app.current_user_id',            '${USER}', false),
           set_config('app.current_manager_account_id', '${ctx.ustHesap ?? ''}', false),
           set_config('app.current_client_ids',         '${(ctx.clientIds ?? []).join(',')}', false),
           set_config('app.is_org_admin',               '${ctx.isOrgAdmin ? 'on' : 'off'}', false),
           set_config('app.can_manage_pool',            '${ctx.poolYetkisi === false ? 'off' : 'on'}', false),
           set_config('app.current_active_client_id',   '', false)
  `);
  await h.q(`SET ROLE ${APP_ROLE}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

async function gorunenHesaplar(ctx: Ctx): Promise<string[]> {
  const rows = await asUser<{ name: string }>('SELECT name FROM ad_accounts', ctx);
  return rows.map((r) => r.name).sort();
}

/** A1 şirketindeyken (üst hesap A). */
const A1: Ctx = { orgId: ORG_A1, ustHesap: UST_A, clientIds: [WS_A1], isOrgAdmin: true };
/** A2 şirketine geçmiş hâli — kardeş şirket. */
const A2: Ctx = { orgId: ORG_A2, ustHesap: UST_A, clientIds: [WS_A2], isOrgAdmin: true };
/** Başka danışmanlık. */
const B1: Ctx = { orgId: ORG_B1, ustHesap: UST_B, clientIds: [WS_B1], isOrgAdmin: true };
/** Üst hesabı olmayan bağımsız şirket. */
const YALNIZ: Ctx = { orgId: ORG_YALNIZ, ustHesap: null, clientIds: [], isOrgAdmin: true };

describe('havuz ajans genelinde ORTAK', () => {
  it('BOŞA DÜŞME BEKÇİSİ: fikstür gerçekten yazıldı', async () => {
    const rows = await h.q<{ n: string }>('SELECT count(*)::text AS n FROM ad_accounts');
    expect(rows[0]?.n).toBe('6');
  });

  it('KRİTİK: KARDEŞ şirketten havuz görünüyor — bağlantı A1 şirketinde olsa bile', async () => {
    /*
     * Bu değişikliğin var oluş sebebi. A2 şirketinde hiç bağlantı yok;
     * görünmeseydi yeni açılan her şirket kalıcı olarak BOŞ kalırdı ve
     * kullanıcı hesap atayamazdı.
     */
    expect(await gorunenHesaplar(A2)).toContain('Havuz hesabı');
  });

  it('KRİTİK: kardeş şirketin ATANMIŞ hesabı GÖRÜNMÜYOR', async () => {
    /*
     * Sınır genişledi ama yalnızca HAVUZ için. Atanmış satırları
     * `can_access_client(client_id)` süzüyor ve o fonksiyon kullanıcının
     * erişebildiği workspace listesine bakıyor — kardeş şirketin workspace'i
     * orada yok. Bu ayrım olmasaydı bir şirketin müşteri verisi diğerine
     * açılırdı.
     */
    expect(await gorunenHesaplar(A2)).not.toContain('A1 atanmış');
    expect(await gorunenHesaplar(A1)).not.toContain('A2 atanmış');
  });

  it('kendi şirketinin atanmış hesabını görüyor', async () => {
    expect(await gorunenHesaplar(A1)).toContain('A1 atanmış');
  });

  it('KRİTİK: BAŞKA danışmanlığın hiçbir şeyi görünmüyor', async () => {
    const a = await gorunenHesaplar(A1);
    expect(a).not.toContain('B havuz');
    expect(a).not.toContain('Yalnız havuz');
    expect(await gorunenHesaplar(B1)).toEqual(['B havuz']);
  });

  it('KRİTİK: üst hesabı OLMAYAN şirkette davranış DEĞİŞMEDİ', async () => {
    // Üretimdeki mevcut kurulum tam olarak bu; genişleyen sınırın onu
    // etkilememesi gerekiyordu.
    expect(await gorunenHesaplar(YALNIZ)).toEqual(['Yalnız havuz']);
  });

  it('KRİTİK: SAHTE bir üst hesap kimliği başka ajansı açmıyor', async () => {
    /*
     * GUC'u `TenantContextService` yazıyor ve orada doğrulanıyor
     * (`ust-hesap-baglam.spec.ts`). Burada ölçülen: sahte bir değer
     * verilse bile `ajansa_ait_org` yalnızca O ÜST HESABIN şirketlerini
     * döndürüyor — B'nin kimliğini yazan biri B'nin şirketlerini görür,
     * ama o kimliği yazan tek yer sunucu.
     */
    const sahte = await gorunenHesaplar({ ...YALNIZ, ustHesap: UST_A });
    expect(sahte).not.toContain('B havuz');
  });
});

describe('bağlantılar da ajans genelinde', () => {
  it('KRİTİK: kardeş şirket ajansın bağlantısını görüyor', async () => {
    // Görmeseydi "Platform Bağlantıları" ekranı yeni şirkette boş kalırdı
    // ve boş liste, yetki hatasından ayırt edilemeyen sessiz bir arıza.
    const rows = await asUser<{ account_label: string }>(
      'SELECT account_label FROM platform_connections',
      A2,
    );
    expect(rows.map((r) => r.account_label)).toEqual(['Ajans Meta']);
  });

  it('KRİTİK: başka danışmanlığın bağlantısı görünmüyor', async () => {
    const rows = await asUser<{ account_label: string }>(
      'SELECT account_label FROM platform_connections',
      B1,
    );
    expect(rows.map((r) => r.account_label)).toEqual(['B Meta']);
  });
});

describe('şirketler arası ATAMA', () => {
  it('KRİTİK: havuzdaki hesap kardeş şirketin workspace’ine atanabiliyor', async () => {
    /*
     * `ad_accounts_client_org_fkey` kompozit anahtarı `(client_id, org_id)`
     * çiftinin `clients`ta var olmasını istiyor. `org_id` güncellenmezse
     * atama anlaşılmaz bir yabancı anahtar hatasıyla düşerdi — servis onu
     * hedef workspace'in şirketine yazıyor ve bu test o kararı kilitliyor.
     */
    await asUser(
      `UPDATE ad_accounts
         SET client_id = '${WS_A2}', org_id = '${ORG_A2}', sync_enabled = true
       WHERE external_id = 'act_havuz'`,
      A2,
    );

    const rows = await h.q<{ org_id: string; client_id: string }>(
      `SELECT org_id, client_id FROM ad_accounts WHERE external_id = 'act_havuz'`,
    );
    expect(rows[0]?.org_id).toBe(ORG_A2);
    expect(rows[0]?.client_id).toBe(WS_A2);

    // Artık A1'den GÖRÜNMEMELİ: atanmış satır, atandığı workspace'in
    // erişimine bağlı.
    expect(await gorunenHesaplar(A1)).not.toContain('Havuz hesabı');
    expect(await gorunenHesaplar(A2)).toContain('Havuz hesabı');
  });

  it('KRİTİK: `org_id` güncellenmeden atama REDDEDİLİYOR — sessizce geçmiyor', async () => {
    /*
     * Bu testin konusu bir hata değil bir GÜVENCE: servis `org_id`'yi
     * yazmayı unutursa arıza SESSİZ OLMUYOR. İki bekçi birden var ve
     * hangisinin önce konuştuğu önemli değil:
     *
     *   1. RLS WITH CHECK — yeni satırın `client_id`'si dolu, dolayısıyla
     *      `org_id = current_org_id()` isteniyor; eski org kaldığı için
     *      "new row violates row-level security policy".
     *   2. `ad_accounts_client_org_fkey` — `(client_id, org_id)` çifti
     *      `clients`ta yok.
     *
     * Sessizce 0 satır etkilemek DE bir arıza olurdu (CLAUDE.md: politikası
     * olmayan UPDATE hata vermez, sessizce sıfır satır etkiler) — o yüzden
     * iddia "reddedildi", "değişmedi" değil.
     */
    await expect(
      asUser(
        `UPDATE ad_accounts SET client_id = '${WS_A2}' WHERE external_id = 'act_havuz2'`,
        A2,
      ),
    ).rejects.toThrow();

    // Satır GERÇEKTEN değişmemiş — RLS dışından doğrula.
    const rows = await h.q<{ client_id: string | null; org_id: string }>(
      `SELECT client_id, org_id FROM ad_accounts WHERE external_id = 'act_havuz2'`,
    );
    expect(rows[0]?.client_id).toBeNull();
    expect(rows[0]?.org_id).toBe(ORG_A1);
  });
});
