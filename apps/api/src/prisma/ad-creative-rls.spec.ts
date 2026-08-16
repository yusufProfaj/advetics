import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * KREATİF POLİTİKALARI — gerçekten uygulanıyor mu.
 *
 * `ad-account-pool-rls.spec.ts` deseninin aynısı: koşum ortamı politikaları
 * kurduktan sonra RLS'i kapatıyor (worker'ın BYPASSRLS'ini taklit etmek için),
 * bu yüzden normal testler bir politika boşluğunu GÖREMİYOR. Burada `SET ROLE`
 * ile tabloların sahibi olmayan bir role geçiliyor ve politikanın kendisi
 * sınanıyor.
 *
 * NEDEN BU TABLODA ÖZELLİKLE ÖNEMLİ: kreatif, müşterinin HENÜZ YAYINLAMADIĞI
 * reklam metinleri ve görselleri. Aynı ajansta rakip iki marka olması olağan;
 * birinin diğerinin kampanya metnini görmesi veri sızıntısından öte ticari
 * bir sorun. Ve sızıntı sessiz olurdu — kimse hata görmez, yalnızca liste
 * beklenenden uzun olur.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const ORG_OTHER = '1e1e1e1e-1e1e-1e1e-1e1e-1e1e1e1e1e1e';
const USER = '22222222-2222-2222-2222-222222222222';
const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLIENT_OTHER = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const CREATIVE_A = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
const CREATIVE_B = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';
const CREATIVE_OTHER_ORG = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';

const ASSET_A = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1';
const ASSET_B = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';

const LINK_A = 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1';
const LINK_B = '0f0f0f0f-0f0f-0f0f-0f0f-0f0f0f0f0f0f';

/** Politika uygulanan rol. Tabloların sahibi DEĞİL — RLS ancak öyle işliyor. */
const APP_ROLE = 'advetics_creative_rls_test';

beforeAll(async () => {
  h = await createHarness();

  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);

  // Koşum ortamı RLS'i kapatmıştı; bu paketin konusu olan tablolarda geri
  // açıyoruz. Politikalar `02_rls.sql` ile kuruldu ve silinmedi.
  for (const t of ['ad_creatives', 'ad_creative_assets', 'assets']) {
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
    `INSERT INTO ad_creatives (id, org_id, client_id, name, texts, updated_at)
     VALUES ($1, $4, $5, 'A kreatifi', '{"headlines":["Gizli başlık"]}'::jsonb, now()),
            ($2, $4, $6, 'B kreatifi', '{"headlines":[]}'::jsonb, now()),
            ($3, $7, $8, 'Başka ajans', '{"headlines":[]}'::jsonb, now())`,
    [CREATIVE_A, CREATIVE_B, CREATIVE_OTHER_ORG, ORG, CLIENT_A, CLIENT_B, ORG_OTHER, CLIENT_OTHER],
  );

  await h.q(
    `INSERT INTO assets
       (id, org_id, client_id, kind, name, file_name, mime_type, byte_size,
        width, height, storage_key, content_hash, updated_at)
     -- İçerik özeti en az 16 karakter (assets_hash_chk): boş özet, mükerrer
     -- engelinin sessizce devre dışı kalması demek.
     VALUES ($1, $3, $4, 'image', 'A görseli', 'a.jpg', 'image/jpeg', 100,
             1080, 1080, 'k/a', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', now()),
            ($2, $3, $5, 'image', 'B görseli', 'b.jpg', 'image/jpeg', 100,
             1080, 1080, 'k/b', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', now())`,
    [ASSET_A, ASSET_B, ORG, CLIENT_A, CLIENT_B],
  );

  await h.q(
    `INSERT INTO ad_creative_assets (id, org_id, creative_id, asset_id, position)
     VALUES ($1, $3, $4, $5, 0), ($2, $3, $6, $7, 0)`,
    [LINK_A, LINK_B, ORG, CREATIVE_A, ASSET_A, CREATIVE_B, ASSET_B],
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
const ONLY_A: Ctx = { clientIds: [CLIENT_A], isOrgAdmin: false };

async function visibleCreatives(ctx: Ctx): Promise<string[]> {
  const rows = await asUser<{ name: string }>('SELECT name FROM ad_creatives ORDER BY name', ctx);
  return rows.map((r) => r.name);
}

describe('ad_creatives görünürlüğü', () => {
  it('iki müşteriye yetkili kullanıcı ikisini de görüyor', async () => {
    expect(await visibleCreatives(ORG_ADMIN)).toEqual(['A kreatifi', 'B kreatifi']);
  });

  it('KRİTİK: yalnızca A yetkisi olan kullanıcı B kreatifini GÖRMÜYOR', async () => {
    // Rakip iki marka aynı ajansta olabilir; birinin yayınlanmamış reklam
    // metnini diğerine göstermek ticari bir sorun.
    expect(await visibleCreatives(ONLY_A)).toEqual(['A kreatifi']);
  });

  it('KRİTİK: başka ORGANİZASYONUN kreatifi hiçbir bağlamda görünmüyor', async () => {
    // Org yöneticisi olmak bile yetmiyor — `org_id` koşulu ayrı duruyor.
    const hepsi = await visibleCreatives(ORG_ADMIN);
    expect(hepsi).not.toContain('Başka ajans');
  });

  it('BAĞLAM YOKSA HİÇBİR SATIR — güvenli varsayılan', async () => {
    // Bağlam kurulmadan gelen bir sorgu her şeyi görmemeli. `SET LOCAL`
    // unutulduğunda tablonun tamamının açılması, bu mimarinin en pahalı
    // sessiz hatası olurdu.
    expect(await visibleCreatives({ orgId: null, clientIds: [] })).toEqual([]);
  });
});

describe('ad_creative_assets görünürlüğü', () => {
  it('bağlantı KREATİF üzerinden süzülüyor', async () => {
    /**
     * Satırın kendi `org_id`'si var ama tek başına yetmez: org içindeki başka
     * bir müşterinin kreatifine ait bağlantı görünürdü. Politika bu yüzden
     * `ad_creatives` üzerinden EXISTS ile kuruluyor.
     */
    const rows = await asUser<{ id: string }>('SELECT id FROM ad_creative_assets', ONLY_A);
    expect(rows.map((r) => r.id)).toEqual([LINK_A]);
  });

  it('org yöneticisi iki bağlantıyı da görüyor', async () => {
    const rows = await asUser<{ id: string }>(
      'SELECT id FROM ad_creative_assets ORDER BY id',
      ORG_ADMIN,
    );
    expect(rows).toHaveLength(2);
  });
});

describe('yazma politikaları', () => {
  it('KRİTİK: yetkisi olmayan müşteriye kreatif YAZILAMIYOR', async () => {
    // Okuma engelli ama yazma açık kalsaydı, bir kullanıcı erişemediği bir
    // müşterinin kütüphanesine kayıt bırakabilirdi — kendi göremeden.
    await expect(
      asUser(
        `INSERT INTO ad_creatives (id, org_id, client_id, name, texts, updated_at)
         VALUES (gen_random_uuid(), '${ORG}', '${CLIENT_B}', 'Sızıntı', '{}'::jsonb, now())`,
        ONLY_A,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('KRİTİK: başka müşterinin kreatifi SİLİNEMİYOR', async () => {
    await asUser(`DELETE FROM ad_creatives WHERE id = '${CREATIVE_B}'`, ONLY_A);
    // Politika DELETE'i eşleştirmiyor: hata yok ama satır da gitmiyor.
    // Sessiz görünen bu davranış doğru olan — Postgres görünmeyen satırı
    // silmeye çalışmıyor.
    expect(await visibleCreatives(ORG_ADMIN)).toEqual(['A kreatifi', 'B kreatifi']);
  });

  it('yetkili müşteriye yazılabiliyor', async () => {
    await asUser(
      `INSERT INTO ad_creatives (id, org_id, client_id, name, texts, updated_at)
       VALUES (gen_random_uuid(), '${ORG}', '${CLIENT_A}', 'Yeni', '{}'::jsonb, now())`,
      ONLY_A,
    );
    expect(await visibleCreatives(ONLY_A)).toEqual(['A kreatifi', 'Yeni']);
  });
});
