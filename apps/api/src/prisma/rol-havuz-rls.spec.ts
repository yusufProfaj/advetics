import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * ═══ YENİ ROLLER × RLS ═══
 *
 * "Reklam Yöneticisi" rolü havuzdaki hesabı müşteriye ATAYABİLMELİ. Yetki
 * matrisinde `connection.manage` vermek YETMİYOR: havuz satırlarını
 * (`client_id IS NULL`) RLS uzun süre yalnızca `app.is_org_admin()` olanlara
 * gösteriyordu. Yetkiyi verip veriyi göstermemek panelde ATANABİLECEK HESAP
 * LİSTESİNİN BOŞ GELMESİ demek ve sebebi hiçbir ekranda yazmıyor — bu
 * projenin imza hatası.
 *
 * Bayrağı `isOrgAdmin`e eklemek çözüm DEĞİLDİ: o bayrak kullanıcı
 * oluşturmayı, üyelik vermeyi ve müşteri silmeyi de açıyor.
 *
 * BU PAKET POLİTİKAYI GERÇEKTEN AÇIYOR. `SET ROLE` ile sahibi olmayan bir
 * role geçmek yeterli: superuser RLS'i atlıyor, sıradan rol atlamıyor.
 * Politikanın KENDİSİ sınanıyor, kopyalanmış bir SQL ifadesi değil.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONN = '33333333-3333-3333-3333-333333333333';
const ACC_POOL = '44444444-4444-4444-4444-444444444444';
const PROFILE_POOL = '66666666-6666-6666-6666-666666666666';

const APP_ROLE = 'advetics_rol_rls_test';

/** Oturum bağlamı — panelde bir rolün karşılığı. */
interface Ctx {
  clientIds?: string[];
  isOrgAdmin?: boolean;
  /** `connection.manage` yetkisi (Reklam Yöneticisi, Yönetici, Sahip). */
  canManagePool?: boolean;
  /** `client.write` yetkisi. */
  canCreateClients?: boolean;
}

async function asUser<T = Record<string, unknown>>(sql: string, ctx: Ctx): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id',           '${ORG}', false),
           set_config('app.current_user_id',          '${USER}', false),
           set_config('app.current_client_ids',       '${(ctx.clientIds ?? []).join(',')}', false),
           set_config('app.is_org_admin',             '${ctx.isOrgAdmin ? 'on' : 'off'}', false),
           set_config('app.can_manage_pool',          '${ctx.canManagePool ? 'on' : 'off'}', false),
           set_config('app.can_create_clients',       '${ctx.canCreateClients ? 'on' : 'off'}', false),
           set_config('app.current_active_client_id', '', false)
  `);
  await h.q(`SET ROLE ${APP_ROLE}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

/*
 * ROLLERİN BAĞLAM KARŞILIĞI. `roles.ts` matrisinden TÜRETİLMİYOR, elle
 * yazılıyor ve bu bilinçli: burada sınanan şey "matris ne diyor" değil,
 * "matrisin söylediği bağlamda politika ne yapıyor". Matrisin kendisini
 * `rol-yetkileri.spec.ts` kilitliyor.
 */
const SAHIP: Ctx = { clientIds: [CLIENT_A], isOrgAdmin: true, canManagePool: true, canCreateClients: true };
const REKLAM_YONETICISI: Ctx = { clientIds: [CLIENT_A], canManagePool: true, canCreateClients: true };
const KAMPANYA_YONETICISI: Ctx = { clientIds: [CLIENT_A] };
const MUSTERI_HIZMETLERI: Ctx = { clientIds: [CLIENT_A] };

beforeAll(async () => {
  h = await createHarness();

  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);

  // Koşum ortamı RLS'i kapatmıştı; bu paketin konusu olan tablolarda açıyoruz.
  for (const t of ['ad_accounts', 'social_profiles', 'clients', 'branding_profiles']) {
    await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  }
});

afterAll(async () => h.close());

beforeEach(async () => {
  await h.reset();
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ('${ORG}', 'Ajans', 'ajans', now())`);
  await h.q(
    `INSERT INTO users (id, org_id, email, full_name, updated_at)
     VALUES ('${USER}', '${ORG}', 'a@advetics.com', 'A', now())`,
  );
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ('${CLIENT_A}', '${ORG}', 'A', 'a', now())`,
  );
  await h.q(
    `INSERT INTO platform_connections
       (id, org_id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ('${CONN}', '${ORG}', NULL, 'meta', 'active', 'u1', 'Ajans BM',
             '\\x00', '{}', '${USER}', now())`,
  );
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, updated_at)
     VALUES ('${ACC_POOL}', '${ORG}', NULL, '${CONN}', 'meta', 'act_pool',
             'Havuzdaki Hesap', 'TRY', 'Europe/Istanbul', now())`,
  );
  await h.q(
    `INSERT INTO social_profiles
       (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ('${PROFILE_POOL}', '${ORG}', NULL, '${CONN}', 'facebook_page', 'page_pool',
             'Havuzdaki Sayfa', now())`,
  );
});

describe('havuz görünürlüğü', () => {
  it('Reklam Yöneticisi havuzdaki reklam hesabını GÖRÜYOR', async () => {
    const rows = await asUser('SELECT name FROM ad_accounts WHERE client_id IS NULL', REKLAM_YONETICISI);
    expect(rows.map((r) => r.name)).toEqual(['Havuzdaki Hesap']);
  });

  it('Reklam Yöneticisi havuzdaki sayfayı da GÖRÜYOR', async () => {
    const rows = await asUser('SELECT name FROM social_profiles WHERE client_id IS NULL', REKLAM_YONETICISI);
    expect(rows.map((r) => r.name)).toEqual(['Havuzdaki Sayfa']);
  });

  it('Kampanya Yöneticisi havuzu GÖREMİYOR — yetki genişlemedi', async () => {
    /*
     * Bu iddia yeni rolün DARALTMASINI kilitliyor. `can_manage_pool`
     * yüklemini `app.is_org_admin() OR true` yapmak ilk testi de geçirirdi;
     * ayıran tek şey bu.
     */
    const rows = await asUser('SELECT name FROM ad_accounts WHERE client_id IS NULL', KAMPANYA_YONETICISI);
    expect(rows).toEqual([]);
  });

  it('Müşteri Hizmetleri havuzu GÖREMİYOR', async () => {
    const rows = await asUser('SELECT name FROM ad_accounts WHERE client_id IS NULL', MUSTERI_HIZMETLERI);
    expect(rows).toEqual([]);
  });

  it('Sahip eskisi gibi görüyor — bayrak yazılmasa bile', async () => {
    // GERİYE DÖNÜK UYUMLULUK: yeni değişkeni hiç yazmayan bir çağrı (worker,
    // eski testler) org yöneticisi için eskisi gibi davranmalı.
    const rows = await asUser('SELECT name FROM ad_accounts WHERE client_id IS NULL', {
      clientIds: [CLIENT_A],
      isOrgAdmin: true,
    });
    expect(rows.map((r) => r.name)).toEqual(['Havuzdaki Hesap']);
  });
});

describe('havuzdan atama', () => {
  it('Reklam Yöneticisi havuzdaki hesabı müşteriye ATAYABİLİYOR', async () => {
    /*
     * `RETURNING` ile ETKİLENEN SATIR SAYILIYOR. Sıfır satırlık bir UPDATE
     * politikadan bağımsız olarak BAŞARILI dönüyor: "patlamadı" ile yetinen
     * bir RLS testi hiçbir şey tutmaz.
     */
    const rows = await asUser(
      `UPDATE ad_accounts SET client_id = '${CLIENT_A}' WHERE id = '${ACC_POOL}' RETURNING id`,
      REKLAM_YONETICISI,
    );
    expect(rows).toHaveLength(1);
  });

  it('Kampanya Yöneticisi havuzdaki hesaba DOKUNAMIYOR', async () => {
    const rows = await asUser(
      `UPDATE ad_accounts SET client_id = '${CLIENT_A}' WHERE id = '${ACC_POOL}' RETURNING id`,
      KAMPANYA_YONETICISI,
    );
    expect(rows).toEqual([]);
  });
});

describe('müşteri açma', () => {
  const YENI = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

  it('Reklam Yöneticisi yeni müşteri AÇABİLİYOR', async () => {
    /*
     * INSERT'İN KENDİSİ ZATEN GEÇİYORDU — DÜŞEN `RETURNING`Dİ.
     *
     * Postgres `RETURNING` satırını tablonun SELECT politikasından da
     * geçiriyor ve yeni müşterinin kimliği erişim listesinde olamıyor (liste
     * oturum kurulurken hesaplandı). Prisma her INSERT'i RETURNING ile
     * yaptığı için akış "new row violates row-level security policy" ile
     * düşüyordu; hata mesajı WITH CHECK'i işaret ettiği için sebep yanlış
     * yerde aranıyordu.
     *
     * Çözüm serviste: açılacak kimlik önden üretilip `app.current_client_ids`
     * BU TRANSACTION için o kimlikle genişletiliyor. Test o davranışı taklit
     * ediyor.
     */
    const rows = await asUser(
      `INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ('${YENI}','${ORG}','Yeni','yeni', now()) RETURNING id`,
      { ...REKLAM_YONETICISI, clientIds: [CLIENT_A, YENI] },
    );
    expect(rows).toHaveLength(1);
  });

  it('kimlik genişletilmezse RETURNING DÜŞÜYOR — düzeltmenin sebebi', async () => {
    await expect(
      asUser(
        `INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ('${YENI}','${ORG}','Yeni','yeni', now()) RETURNING id`,
        REKLAM_YONETICISI,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('açtığı müşterinin marka profilini de yazabiliyor', async () => {
    // `ClientsService.create` ikisini aynı transaction'da yazıyor; marka
    // profili politikası sadece org yöneticisi derken akış ikinci adımda
    // düşüyordu ve hata müşteri açmayı değil markayı işaret ediyordu.
    const rows = await asUser(
      `INSERT INTO branding_profiles (id, org_id, client_id, email_from_name, updated_at)
       VALUES (gen_random_uuid(), '${ORG}', '${CLIENT_A}', 'A', now()) RETURNING id`,
      REKLAM_YONETICISI,
    );
    expect(rows).toHaveLength(1);
  });

  it('ORGANİZASYON varsayılan markasına dokunamıyor', async () => {
    // Ajansın beyaz etiket kimliği bütün müşterilerin raporunda görünüyor.
    await expect(
      asUser(
        `INSERT INTO branding_profiles (id, org_id, client_id, email_from_name, updated_at)
         VALUES (gen_random_uuid(), '${ORG}', NULL, 'Ajans', now()) RETURNING id`,
        REKLAM_YONETICISI,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('Kampanya Yöneticisi müşteri AÇAMIYOR', async () => {
    await expect(
      asUser(
        `INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ('${YENI}','${ORG}','Yeni','yeni', now()) RETURNING id`,
        KAMPANYA_YONETICISI,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('Müşteri Hizmetleri müşteri AÇAMIYOR', async () => {
    await expect(
      asUser(
        `INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ('${YENI}','${ORG}','Yeni','yeni', now()) RETURNING id`,
        MUSTERI_HIZMETLERI,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('Sahip eskisi gibi açabiliyor', async () => {
    const rows = await asUser(
      `INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ('${YENI}','${ORG}','Yeni','yeni', now()) RETURNING id`,
      SAHIP,
    );
    expect(rows).toHaveLength(1);
  });
});
