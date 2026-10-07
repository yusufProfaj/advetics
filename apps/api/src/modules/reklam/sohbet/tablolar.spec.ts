import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../../test/pglite-harness';

/**
 * AdvCampaign sohbet tabloları (İP-10): tetikleyiciler ve RLS GERÇEK
 * politikalarla (`SET ROLE`). Her UPDATE iddiası `RETURNING` ile etkilenen
 * satırı sayıyor: politikası tutmayan UPDATE hata vermez, sıfır satır
 * etkiler ve "patlamadı" yeşil görünür (CLAUDE.md).
 */

const ROL = 'adv_sohbet_test';
const ARKADAS = '66666666-6666-6666-6666-666666666666';
let h: Harness;
let taslakId: string;

beforeAll(async () => {
  h = await createHarness();
  await h.q(`DO $$ BEGIN CREATE ROLE ${ROL} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${ROL}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL}`);
}, 60_000);
afterAll(async () => h?.close());

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at)
     VALUES ($1, $2, 'arkadas@advetics.com', 'x', 'Ekip Arkadaşı', now())`,
    [ARKADAS, IDS.org],
  );
  const [t] = await h.q<{ id: string }>(
    `INSERT INTO reklam_taslagi (org_id, client_id, platform, olusturan_yuz, olusturan_id)
     VALUES ($1, $2, 'meta', 'acemi', $3) RETURNING id::text`,
    [IDS.org, IDS.client, IDS.user],
  );
  taslakId = t!.id;
});

async function oturumAc(sahip = IDS.user): Promise<string> {
  const [o] = await h.q<{ id: string }>(
    `INSERT INTO adv_oturum (org_id, client_id, user_id, baslik, taslak_id, model)
     VALUES ($1, $2, $3, 'Form', $4, 'claude-opus-5-5') RETURNING id::text`,
    [IDS.org, IDS.client, sahip, taslakId],
  );
  return o!.id;
}

async function mesaj(oturum: string, sira: number, durum = 'tamam', kim = IDS.user): Promise<string> {
  const [m] = await h.q<{ id: string }>(
    `INSERT INTO adv_mesaj (oturum_id, org_id, client_id, user_id, sira, rol, icerik, durum)
     VALUES ($1, $2, $3, $4, $5, 'asistan', '[]', $6) RETURNING id::text`,
    [oturum, IDS.org, IDS.client, kim, sira, durum],
  );
  return m!.id;
}

async function kullaniciOlarak<T = Record<string, unknown>>(kim: string, sql: string, params: unknown[] = []): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id', '${IDS.org}', false),
           set_config('app.current_user_id', '${kim}', false),
           set_config('app.current_client_ids', '${IDS.client}', false),
           set_config('app.is_org_admin', 'off', false),
           set_config('app.current_active_client_id', '', false)`);
  for (const t of ['adv_oturum', 'adv_mesaj', 'adv_onay']) await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  await h.q(`SET ROLE ${ROL}`);
  try {
    return await h.q<T>(sql, params);
  } finally {
    await h.q('RESET ROLE');
  }
}

describe('adv_mesaj — kapanmış mesaj değişmez', () => {
  it('KRİTİK: akıştaki mesaj kapanır; kapanmış mesajın içeriği ve durumu değişmez', async () => {
    const o = await oturumAc();
    const m = await mesaj(o, 1, 'akista');
    await h.q(`UPDATE adv_mesaj SET durum = 'tamam', icerik = '[{"type":"text","text":"x"}]' WHERE id = $1`, [m]);
    await expect(h.q(`UPDATE adv_mesaj SET icerik = '[]' WHERE id = $1`, [m])).rejects.toThrow(/kapanmis mesaj degismez/);
    await expect(h.q(`UPDATE adv_mesaj SET durum = 'hata' WHERE id = $1`, [m])).rejects.toThrow(/kapanmis mesaj degismez/);
    // Taşımada sahiplik kolonu değişebilmeli.
    expect(await h.q(`UPDATE adv_mesaj SET org_id = org_id WHERE id = $1 RETURNING id`, [m])).toHaveLength(1);
  });

  it('aynı oturumda aynı sıra iki kez yazılamaz', async () => {
    const o = await oturumAc();
    await mesaj(o, 1);
    await expect(mesaj(o, 1)).rejects.toThrow(/adv_mesaj_sira_key/);
  });
});

describe('adv_onay — tek kullanımlık', () => {
  async function kart(surum = 1): Promise<string> {
    const [k] = await h.q<{ id: string }>(
      `INSERT INTO adv_onay (org_id, client_id, taslak_id, taslak_surum_no, kart, kart_ozeti)
       VALUES ($1, $2, $3, $4, '{}', $5) RETURNING id::text`,
      [IDS.org, IDS.client, taslakId, surum, 'a'.repeat(64)],
    );
    return k!.id;
  }
  const onayla = (id: string) =>
    h.q(`UPDATE adv_onay SET durum = 'onaylandi', onaylayan_id = $2, onay_at = now() WHERE id = $1 RETURNING id`, [id, IDS.user]);

  it('KRİTİK: aynı taslak sürümü İKİNCİ kez onaylanamaz (iki kart olsa bile)', async () => {
    const a = await kart();
    const b = await kart();
    await onayla(a);
    await expect(onayla(b)).rejects.toThrow(/adv_onay_tek_onay_key/);
    // Yeni sürüm yeni onay alabilir: indeks kalıcı kilit üretmiyor.
    expect(await onayla(await kart(2))).toHaveLength(1);
  });

  it('KRİTİK: sonuçlanmış onay değişmez; kart içeriği hiç değişmez', async () => {
    const a = await kart();
    await expect(h.q(`UPDATE adv_onay SET kart = '{"x":1}' WHERE id = $1`, [a])).rejects.toThrow(/onay karti degismez/);
    await onayla(a);
    await expect(h.q(`UPDATE adv_onay SET durum = 'bayat' WHERE id = $1`, [a])).rejects.toThrow(/sonuclanmis onay degismez/);
  });

  it('onaylanan durum onaylayan ve zaman olmadan yazılamaz', async () => {
    const a = await kart();
    await expect(h.q(`UPDATE adv_onay SET durum = 'onaylandi' WHERE id = $1`, [a])).rejects.toThrow(/adv_onay_onaylayan_chk/);
  });
});

describe('RLS — sahibi yazar, ekip okur', () => {
  it('KRİTİK: ekip arkadaşı oturumu GÖRÜR ama ona mesaj YAZAMAZ ve onu güncelleyemez', async () => {
    const o = await oturumAc();
    expect(await kullaniciOlarak(ARKADAS, `SELECT id FROM adv_oturum`)).toHaveLength(1);
    await expect(
      kullaniciOlarak(
        ARKADAS,
        `INSERT INTO adv_mesaj (oturum_id, org_id, client_id, user_id, sira, rol, icerik) VALUES ($1, $2, $3, $4, 9, 'kullanici', '[]') RETURNING id`,
        [o, IDS.org, IDS.client, IDS.user],
      ),
    ).rejects.toThrow(/row-level security/);
    expect(await kullaniciOlarak(ARKADAS, `UPDATE adv_oturum SET baslik = 'x' RETURNING id`)).toHaveLength(0);
    // Sahibi yazabiliyor: sıfır satır "göremediği" için değil.
    expect(await kullaniciOlarak(IDS.user, `UPDATE adv_oturum SET baslik = 'y' RETURNING id`)).toHaveLength(1);
  });

  it('KRİTİK: yalnız akıştaki mesaj güncellenir (politika ikinci kapı)', async () => {
    const o = await oturumAc();
    await mesaj(o, 1, 'akista');
    await mesaj(o, 2, 'tamam');
    const r = await kullaniciOlarak<{ sira: number }>(IDS.user, `UPDATE adv_mesaj SET girdi_token = 5 RETURNING sira`);
    expect(r.map((x) => x.sira)).toEqual([1]);
  });

  it('başka workspace oturumu görmez', async () => {
    await oturumAc();
    await h.q(`SELECT set_config('app.current_client_ids', '', false)`);
    const r = await (async () => {
      await h.q(`
        SELECT set_config('app.current_org_id', '${IDS.org}', false),
               set_config('app.current_user_id', '${IDS.user}', false),
               set_config('app.current_client_ids', '', false),
               set_config('app.is_org_admin', 'off', false)`);
      await h.q(`SET ROLE ${ROL}`);
      try {
        return await h.q(`SELECT id FROM adv_oturum`);
      } finally {
        await h.q('RESET ROLE');
      }
    })();
    expect(r).toHaveLength(0);
  });
});
