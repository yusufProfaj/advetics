import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

/**
 * ═══ KİTLE PLATFORMU MIGRATION'I ESKİ VERİ ÜSTÜNDE ═══
 *
 * `20261025100000_kitle_platformu` veri DÖNÜŞTÜRÜYOR: iki platformun
 * alanını taşıyan kitleyi ikiye bölüyor. `pglite-harness` şemayı boş
 * kurduğu için bunu göremez; burada önceki migration'lar → eski satırlar →
 * bu migration sırası koşuluyor. Sessiz kayıp burada iki biçimde olurdu:
 * Google verisi silinip kopyası açılmaz, ya da varsayılan kitle / AdvStrategy
 * bağları yeni kimliğe kayıp eski kayıt boşa düşer.
 */
const MIGRATIONS = join(__dirname, '../../prisma/migrations');
const BU = '20261025100000_kitle_platformu';
const ORG = '11111111-1111-1111-1111-111111111111';
const WS = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const WS2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const IKISI = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
const SADECE_G = 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2';
const SADECE_M = 'a3a3a3a3-a3a3-a3a3-a3a3-a3a3a3a3a3a3';
const YALIN = 'a4a4a4a4-a4a4-a4a4-a4a4-a4a4a4a4a4a4';
const CAKISAN = 'a5a5a5a5-a5a5-a5a5-a5a5-a5a5a5a5a5a5';
const BOZUK = 'a6a6a6a6-a6a6-a6a6-a6a6-a6a6a6a6a6a6';
const PLAN = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';

const G_DOLU = `'{"ilgiler":[{"id":"80432","ad":"Real Estate","tur":"in_market"}],"kelimeler":["izmir daire"]}'::jsonb`;
const ILGI = `'[{"id":"6003","name":"Gayrimenkul"}]'::jsonb`;

let pg: PGlite;
const q = async <T>(sql: string) => (await pg.query<T>(sql)).rows;

beforeAll(async () => {
  pg = new PGlite();
  const tum = readdirSync(MIGRATIONS).filter((d) => /^\d/.test(d)).sort();
  expect(tum, 'sınanan migration bulunamadı').toContain(BU);
  for (const d of tum.filter((x) => x < BU)) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));

  await pg.exec(`
    INSERT INTO organizations (id, name, slug, updated_at) VALUES ('${ORG}', 'Ajans', 'ajans', now());
    INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ('${WS}', '${ORG}', 'WS', 'ws', now()), ('${WS2}', '${ORG}', 'WS2', 'ws2', now());
    INSERT INTO audience_templates (id, org_id, client_id, name, interests, google_hedefleri, updated_at) VALUES
      ('${IKISI}', '${ORG}', '${WS}', 'Ev sahipleri', ${ILGI}, ${G_DOLU}, now()),
      ('${SADECE_G}', '${ORG}', '${WS}', 'Konut arayan', '[]', ${G_DOLU}, now()),
      ('${SADECE_M}', '${ORG}', '${WS}', 'Meta ilgi', ${ILGI}, '{"ilgiler":[],"kelimeler":[]}', now()),
      ('${YALIN}', '${ORG}', '${WS}', 'Yalnız konum', '[]', '{"ilgiler":[],"kelimeler":[]}', now()),
      -- Kopyanın adı ("Çakışan · Google") workspace'te zaten var.
      ('${CAKISAN}', '${ORG}', '${WS2}', 'Çakışan', ${ILGI}, ${G_DOLU}, now()),
      (gen_random_uuid(), '${ORG}', '${WS2}', 'Çakışan · Google', '[]', '{"ilgiler":[],"kelimeler":[]}', now()),
      -- Bozuk biçim: dizi değil. Migration düşmemeli, satır Meta kalmalı.
      ('${BOZUK}', '${ORG}', '${WS2}', 'Bozuk', '[]', '{"ilgiler":"x","kelimeler":null}', now());
    INSERT INTO client_profiles (id, org_id, client_id, varsayilan_kitle_id, updated_at)
      VALUES (gen_random_uuid(), '${ORG}', '${WS}', '${IKISI}', now());
    INSERT INTO strateji_planlari (id, org_id, client_id, donem, toplam_butce_micros, para_birimi)
      VALUES ('${PLAN}', '${ORG}', '${WS}', '2026-11', 1000000, 'TRY');
    INSERT INTO strateji_matrisi (plan_id, org_id, client_id, sira, platform, katman, niyet, kitle_sablonu_id, tutar_micros) VALUES
      ('${PLAN}', '${ORG}', '${WS}', 1, 'meta', 'soguk', 'FORM', '${IKISI}', 1),
      ('${PLAN}', '${ORG}', '${WS}', 2, 'google', 'soguk', 'SITE', '${IKISI}', 1);
  `);

  await pg.exec(readFileSync(join(MIGRATIONS, BU, 'migration.sql'), 'utf8'));
  for (const d of tum.filter((x) => x > BU)) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
}, 240_000);

afterAll(async () => {
  await pg?.close();
});

type Satir = { id: string; name: string; platform: string; interests: unknown; google_hedefleri: { ilgiler: unknown[]; kelimeler: unknown[] } };
const satir = async (id: string) =>
  (await q<Satir>(`SELECT id::text, name, platform, interests, google_hedefleri FROM audience_templates WHERE id = '${id}'`))[0];

describe('kitle platformu migration\'ı', () => {
  it('KRİTİK: iki platformlu kitle bölünüyor; eski kimlik Meta kalıyor, Google verisi kopyada', async () => {
    const eski = await satir(IKISI);
    expect(eski).toMatchObject({ name: 'Ev sahipleri', platform: 'meta', interests: [{ id: '6003', name: 'Gayrimenkul' }] });
    expect(eski!.google_hedefleri).toEqual({ ilgiler: [], kelimeler: [] });

    const kopya = await q<Satir>(`SELECT id::text, name, platform, interests, google_hedefleri FROM audience_templates WHERE name = 'Ev sahipleri · Google'`);
    expect(kopya).toHaveLength(1);
    expect(kopya[0]).toMatchObject({ platform: 'google', interests: [] });
    expect(kopya[0]!.google_hedefleri.kelimeler).toEqual(['izmir daire']);
    expect(kopya[0]!.google_hedefleri.ilgiler).toHaveLength(1);
  });

  it('KRİTİK: varsayılan kitle ve AdvStrategy Meta satırı eski kimlikte, Google satırı kopyada', async () => {
    expect(await q<{ id: string }>(`SELECT varsayilan_kitle_id::text AS id FROM client_profiles WHERE client_id = '${WS}'`)).toEqual([{ id: IKISI }]);
    const [kopya] = await q<{ id: string }>(`SELECT id::text FROM audience_templates WHERE name = 'Ev sahipleri · Google'`);
    expect(await q<{ platform: string; k: string }>(`SELECT platform, kitle_sablonu_id::text AS k FROM strateji_matrisi ORDER BY sira`)).toEqual([
      { platform: 'meta', k: IKISI },
      { platform: 'google', k: kopya!.id },
    ]);
  });

  it('yalnız Google verili kitle bölünmeden Google oluyor; yalnız Meta ve yalın kitle Meta kalıyor', async () => {
    expect((await satir(SADECE_G))!.platform).toBe('google');
    expect((await satir(SADECE_M))!.platform).toBe('meta');
    expect((await satir(YALIN))!.platform).toBe('meta');
    // Bölünmeyenlerin kopyası açılmadı: WS'te 4 eski + 1 kopya.
    expect(await q<{ n: number }>(`SELECT count(*)::int AS n FROM audience_templates WHERE client_id = '${WS}'`)).toEqual([{ n: 5 }]);
  });

  it('KRİTİK: ad çakışınca kopya kimlik ekiyle açılıyor, veri kaybolmuyor', async () => {
    const adlar = (await q<{ name: string }>(`SELECT name FROM audience_templates WHERE client_id = '${WS2}' AND platform = 'google' ORDER BY name`)).map((r) => r.name);
    expect(adlar).toEqual([`Çakışan · Google ${CAKISAN.slice(0, 8)}`]);
  });

  it('bozuk biçimli Google alanı migration\'ı düşürmüyor, satır Meta kalıyor', async () => {
    expect((await satir(BOZUK))!.platform).toBe('meta');
  });

  it('KRİTİK: platform varsayılansız ve kısıtlı; geçici tablo kalmadı', async () => {
    await expect(pg.exec(`INSERT INTO audience_templates (org_id, client_id, name, updated_at) VALUES ('${ORG}', '${WS}', 'platformsuz', now())`)).rejects.toThrow(/platform/);
    await expect(
      pg.exec(`INSERT INTO audience_templates (org_id, client_id, name, platform, updated_at) VALUES ('${ORG}', '${WS}', 'tiktok', 'tiktok', now())`),
    ).rejects.toThrow(/audience_templates_platform_chk/);
    expect(await q<{ n: number }>(`SELECT count(*)::int AS n FROM pg_class WHERE relname = 'kitle_bolme'`)).toEqual([{ n: 0 }]);
  });
});
