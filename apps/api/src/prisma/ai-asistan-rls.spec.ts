import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * AI ASİSTANI SOHBET GEÇMİŞİ — politikaların GERÇEKTEN uygulandığı test.
 *
 * `pglite-harness` politikaları kurduktan sonra RLS'i kapatıyor (BYPASSRLS
 * worker'ı taklit etmek için); bu paket `SET ROLE` ile sahibi olmayan bir
 * role geçip politikanın KENDİSİNİ sınıyor — bkz. `ad-account-pool-rls.spec.ts`.
 *
 * EN KRİTİK İDDİA: `ai_conversations.client_id` NULLABLE ve görünürlük
 * kuralı iki katmanlı — SAHİBİ (client seçilmemiş olsa bile) VE o müşteriye
 * erişimi olan personel. Yanlış yazılmış tek bir koşul ya sohbet
 * geçmişini bütün ajansa açar ya da sahibini kendi geçmişinden mahrum
 * bırakır.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const ORG_OTHER = '1e1e1e1e-1e1e-1e1e-1e1e-1e1e1e1e1e1e';
const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_A = '22222222-2222-2222-2222-222222222222';
const USER_B = '33333333-3333-3333-3333-333333333333';
const USER_C = '44444444-4444-4444-4444-444444444444';

const CONV_NULL = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
const CONV_A = 'c2c2c2c2-c2c2-c2c2-c2c2-c2c2c2c2c2c2';
const CONV_B = 'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3';
const CONV_OTHER_ORG = 'c4c4c4c4-c4c4-c4c4-c4c4-c4c4c4c4c4c4';
const MSG_A = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1';

/** Politika uygulanan rol. Tabloların sahibi DEĞİL — RLS ancak öyle işliyor. */
const APP_ROLE = 'advetics_rls_test';

beforeAll(async () => {
  h = await createHarness();

  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);

  for (const t of ['ai_conversations', 'ai_messages']) {
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
     VALUES ($1, $3, 'A', 'a', now()), ($2, $3, 'B', 'b', now())`,
    [CLIENT_A, CLIENT_B, ORG],
  );
  await h.q(
    `INSERT INTO users (id, org_id, email, full_name, updated_at)
     VALUES ($1, $4, 'a@advetics.com', 'A', now()),
            ($2, $4, 'b@advetics.com', 'B', now()),
            ($3, $4, 'c@advetics.com', 'C', now())`,
    [USER_A, USER_B, USER_C, ORG],
  );

  await h.q(
    `INSERT INTO ai_conversations (id, org_id, client_id, user_id, title, created_at, updated_at)
     VALUES ($1, $5, NULL,     $6, 'Workspace seçilmedi', now(), now()),
            ($2, $5, $7,       $6, 'Sabancı — form kampanyası', now(), now()),
            ($3, $5, $8,       $9, 'B sohbeti', now(), now()),
            ($4, $10, NULL,    $6, 'Başka ajans', now(), now())`,
    [CONV_NULL, CONV_A, CONV_B, CONV_OTHER_ORG, ORG, USER_A, CLIENT_A, CLIENT_B, USER_B, ORG_OTHER],
  );
  await h.q(
    `INSERT INTO ai_messages (id, conversation_id, role, content, created_at)
     VALUES ($1, $2, 'user', '{"text":"form kampanyası aç"}'::jsonb, now())`,
    [MSG_A, CONV_A],
  );
});

interface Ctx {
  userId: string;
  clientIds?: string[];
  isOrgAdmin?: boolean;
  orgId?: string | null;
}

async function asUser<T = Record<string, unknown>>(sql: string, ctx: Ctx): Promise<T[]> {
  const orgId = ctx.orgId === undefined ? ORG : (ctx.orgId ?? '');
  await h.q(`
    SELECT set_config('app.current_org_id',     '${orgId}', false),
           set_config('app.current_user_id',    '${orgId ? ctx.userId : ''}', false),
           set_config('app.current_client_ids', '${(ctx.clientIds ?? []).join(',')}', false),
           set_config('app.is_org_admin',       '${ctx.isOrgAdmin ? 'on' : 'off'}', false)
  `);
  await h.q(`SET ROLE ${APP_ROLE}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

const ORG_ADMIN: Ctx = { userId: USER_A, clientIds: [CLIENT_A, CLIENT_B], isOrgAdmin: true };
const OWNER_A: Ctx = { userId: USER_A, clientIds: [CLIENT_A] };
const OWNER_B: Ctx = { userId: USER_B, clientIds: [CLIENT_B] };
/** C, A'nın müşterisine erişebiliyor ama SAHİBİ değil — "yönetici sorusu" senaryosu. */
const STAFF_ON_A: Ctx = { userId: USER_C, clientIds: [CLIENT_A] };

/**
 * Görünen sohbet başlıkları — SIRALAMA TESTİN KONUSU DEĞİL.
 *
 * `ORDER BY title` yalnızca sonucu deterministik yapmak için; bu dosya
 * GÖRÜNÜRLÜĞÜ sınıyor. Bir fikstür adı değiştiğinde (ör. "Müşteri seçilmedi"
 * → "Workspace seçilmedi") alfabetik sıra kayıyor ve sıraya çapalanmış bir
 * iddia, RLS politikası KUSURSUZ çalışırken kırmızı veriyor. Bu gerçekten
 * oldu; iddia artık KÜME olarak kuruluyor.
 */
async function visibleTitles(ctx: Ctx): Promise<Set<string>> {
  const rows = await asUser<{ title: string }>(
    'SELECT title FROM ai_conversations ORDER BY title',
    ctx,
  );
  return new Set(rows.map((r) => r.title));
}

describe('ai_conversations — görünürlük', () => {
  it('SAHİBİ workspace seçilmemiş sohbeti de görüyor', async () => {
    // Aksi halde kullanıcı kendi geçmişine devam edemezdi — client_id NULL
    // demek "henüz seçilmedi", "kimsenin değil" değil.
    expect(await visibleTitles(OWNER_A)).toEqual(
      new Set(['Workspace seçilmedi', 'Sabancı — form kampanyası']),
    );
  });

  it('KRİTİK: BAŞKA kullanıcı workspace’siz sohbeti GÖRMÜYOR', async () => {
    // client_id NULL olan bir satır yalnızca sahibi ve org yöneticisine açık
    // — audit_logs'un aynı kuralı.
    expect((await visibleTitles(STAFF_ON_A)).has('Workspace seçilmedi')).toBe(false);
  });

  it('MÜŞTERİYE ERİŞİMİ OLAN PERSONEL sahibi olmadığı sohbeti görüyor — "yönetici sorusu"', async () => {
    // "Bu taslağı hangi promptla oluşturdu" sorusunun cevabı bu satır.
    expect((await visibleTitles(STAFF_ON_A)).has('Sabancı — form kampanyası')).toBe(true);
  });

  it('ERİŞİMİ OLMAYAN kullanıcı ne sahibi olduğu ne erişemediği sohbeti görmüyor', async () => {
    expect(await visibleTitles(OWNER_B)).toEqual(new Set(['B sohbeti']));
  });

  it('ORG YÖNETİCİSİ aynı organizasyondaki her şeyi görüyor', async () => {
    expect(await visibleTitles(ORG_ADMIN)).toEqual(
      new Set(['B sohbeti', 'Workspace seçilmedi', 'Sabancı — form kampanyası']),
    );
  });

  it('BAŞKA ORGANİZASYONUN sohbeti hiç kimseye görünmüyor', async () => {
    expect((await visibleTitles(ORG_ADMIN)).has('Başka ajans')).toBe(false);
  });

  it('BAĞLAM KURULMAMIŞSA hiçbir satır görünmüyor', async () => {
    expect(await visibleTitles({ userId: USER_A, orgId: null, isOrgAdmin: true })).toEqual(
      new Set(),
    );
  });
});

describe('ai_conversations — yazma', () => {
  it('SAHİBİ kendi sohbetinin başlığını güncelleyebiliyor', async () => {
    await asUser(`UPDATE ai_conversations SET title = 'Güncellendi' WHERE id = '${CONV_A}'`, OWNER_A);
    const rows = await h.q<{ title: string }>(`SELECT title FROM ai_conversations WHERE id = '${CONV_A}'`);
    expect(rows[0]?.title).toBe('Güncellendi');
  });

  it('KRİTİK: SAHİBİ OLMAYAN — görebilse bile — başlığı DEĞİŞTİREMİYOR', async () => {
    // SELECT görünürlüğü UPDATE yetkisi anlamına gelmiyor: görme "yönetici
    // sorusu" için geniş, yazma yalnızca sahibine ait.
    await asUser(`UPDATE ai_conversations SET title = 'Ele geçirildi' WHERE id = '${CONV_A}'`, STAFF_ON_A);
    const rows = await h.q<{ title: string }>(`SELECT title FROM ai_conversations WHERE id = '${CONV_A}'`);
    expect(rows[0]?.title).toBe('Sabancı — form kampanyası');
  });

  it('KRİTİK: BAŞKASININ ADINA sohbet açılamıyor — sahiplik SAHTECİLİĞİ engelleniyor', async () => {
    await expect(
      asUser(
        `INSERT INTO ai_conversations (id, org_id, client_id, user_id, updated_at)
         VALUES (gen_random_uuid(), '${ORG}', NULL, '${USER_B}', now())`,
        OWNER_A,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('KRİTİK: ERİŞİLMEYEN MÜŞTERİNİN kimliğiyle sohbet AÇILAMIYOR', async () => {
    // Politika bir süre yalnızca org_id + user_id denetliyordu ve yazma yolu
    // da client_id'ye bakmıyordu. Sonuç: kendi adına sohbet açan herkes
    // gövdeye İSTEDİĞİ müşterinin kimliğini yazabiliyordu ve o satır
    // SELECT'in "client_id IS NOT NULL AND can_access_client" dalıyla O
    // MÜŞTERİNİN personeline görünüyordu — saldırgan, erişemediği bir
    // müşterinin denetim izine kendi metnini yerleştiriyor. Tablonun varlık
    // sebebi tam olarak o denetim izi.
    await expect(
      asUser(
        `INSERT INTO ai_conversations (id, org_id, client_id, user_id, title, updated_at)
         VALUES (gen_random_uuid(), '${ORG}', '${CLIENT_B}', '${USER_A}', 'Zehirli', now())`,
        OWNER_A,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('ERİŞİLEN workspace’in kimliğiyle sohbet açılabiliyor', async () => {
    await asUser(
      `INSERT INTO ai_conversations (id, org_id, client_id, user_id, title, updated_at)
       VALUES (gen_random_uuid(), '${ORG}', '${CLIENT_A}', '${USER_A}', 'A için yeni', now())`,
      OWNER_A,
    );
    const rows = await h.q(`SELECT id FROM ai_conversations WHERE title = 'A için yeni'`);
    expect(rows).toHaveLength(1);
  });

  it('MÜŞTERİSİZ (NULL) sohbet açılabiliyor — kontrol NULL değeri kapatmıyor', async () => {
    // client_id NULL "henüz seçilmedi" demek. NULL'ı da can_access_client'a
    // sokmak (fonksiyon NULL için false döner) müşteri seçmeden sohbet
    // başlatmayı tamamen kapatırdı — asistanın ilk ekranı budur.
    await asUser(
      `INSERT INTO ai_conversations (id, org_id, client_id, user_id, title, updated_at)
       VALUES (gen_random_uuid(), '${ORG}', NULL, '${USER_A}', 'Yeni workspace’siz', now())`,
      OWNER_A,
    );
    const rows = await h.q(`SELECT id FROM ai_conversations WHERE title = 'Yeni workspace’siz'`);
    expect(rows).toHaveLength(1);
  });

  it('DELETE politikası yok — komut hata vermeden SESSİZCE sıfır satır etkiliyor', async () => {
    // `ad-account-pool-rls.spec.ts`teki aynı desen: politikasız bir komut
    // istisna fırlatmıyor, satırı görünürlük düzeyinde eleyip 0 satır
    // etkiliyor. Sahibi bile taslak sohbeti silemiyor — audit_logs'un
    // "denetim kaydı silinebiliyorsa denetim kaydı değildir" kuralı.
    await asUser(`DELETE FROM ai_conversations WHERE id = '${CONV_A}'`, OWNER_A);
    const rows = await h.q<{ id: string }>(`SELECT id FROM ai_conversations WHERE id = '${CONV_A}'`);
    expect(rows).toHaveLength(1);
  });
});

describe('ai_messages — üst sohbetten miras alınan görünürlük', () => {
  async function visibleMessageCount(ctx: Ctx): Promise<number> {
    const rows = await asUser<{ n: string }>('SELECT count(*) AS n FROM ai_messages', ctx);
    return Number(rows[0]!.n);
  }

  it('SAHİBİ kendi sohbetinin mesajını görüyor', async () => {
    expect(await visibleMessageCount(OWNER_A)).toBe(1);
  });

  it('workspace’e erişimi olan personel mesajı görüyor', async () => {
    expect(await visibleMessageCount(STAFF_ON_A)).toBe(1);
  });

  it('KRİTİK: erişimi olmayan kullanıcı mesajı GÖRMÜYOR', async () => {
    expect(await visibleMessageCount(OWNER_B)).toBe(0);
  });

  it('BAŞKASININ sohbetine mesaj eklenemiyor', async () => {
    await expect(
      asUser(
        `INSERT INTO ai_messages (id, conversation_id, role, content)
         VALUES (gen_random_uuid(), '${CONV_A}', 'user', '{}'::jsonb)`,
        OWNER_B,
      ),
    ).rejects.toThrow(/row-level security/i);
  });
});
