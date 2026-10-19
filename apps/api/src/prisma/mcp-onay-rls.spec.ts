import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MCP_ONAY_ISLEMLERI } from '@advetics/shared';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * ═══ MCP ONAY SATIRI YALNIZCA SAHİBİNE (docs/okuma-api/MCP-YAZMA-MIMARI.md § 5) ═══
 *
 * Satır bir platform işleminin ARGÜMANLARINI taşıyor ve `onayla` onu
 * uyguluyor. Başkasının görebildiği ya da güncelleyebildiği bir onay satırı,
 * onun adına reklam yayınlatmaya yarardı. Anahtar tablosuyla aynı desen:
 * `SET ROLE` + her yazma `RETURNING` ile SAYILIYOR.
 *
 * Ek kural: INSERT anahtarın SAHİBİNİ de istiyor. Kendi kullanıcı
 * kimliğiyle ama başkasının anahtarına bağlı bir satır açmak, o anahtarın
 * etkinlik listesine sahte bir işlem düşürürdü.
 *
 * Ve ATOMİK ALMA: `bekliyor → uygulaniyor` geçişi tek UPDATE; ikinci deneme
 * sıfır satır döner (aynı yayın iki kez kurulmaz). Servisteki sorgunun aynısı.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const SAHIP = 'aaaa0000-0000-0000-0000-00000000000a';
const YABANCI = 'bbbb0000-0000-0000-0000-00000000000b';
const ANAHTAR = 'cccc0000-0000-0000-0000-00000000000c';
const YABANCI_ANAHTAR = 'cccc0000-0000-0000-0000-00000000000d';
const ONAY = 'dddd0000-0000-0000-0000-00000000000d';
const APP_ROLE = 'advetics_mcp_onay_rls_test';

interface Ctx {
  orgId: string;
  userId: string;
}

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  await h.q(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${APP_ROLE}`);
  await h.q(`ALTER TABLE mcp_onaylari ENABLE ROW LEVEL SECURITY`);
  await h.q(`ALTER TABLE okuma_api_anahtarlari ENABLE ROW LEVEL SECURITY`);

  await h.q(`INSERT INTO organizations (id, name, slug, plan, status, created_at, updated_at) VALUES ('${ORG}', 'Ajans', 'ajans', 'starter', 'active', now(), now())`);
  await h.q(`
    INSERT INTO users (id, org_id, email, full_name, password_hash, locale, status, platform_admin, created_at, updated_at) VALUES
      ('${SAHIP}',   '${ORG}', 'hello@profaj.com', 'Sahip',   'h', 'tr', 'active', true, now(), now()),
      ('${YABANCI}', '${ORG}', 'baska@x.com',      'Yabancı', 'h', 'tr', 'active', true, now(), now())
  `);
  await h.q(`
    INSERT INTO okuma_api_anahtarlari (id, user_id, ad, gorunen_onek, anahtar_ozeti, yetki) VALUES
      ('${ANAHTAR}',         '${SAHIP}',   'Claude', 'adv_rw_abc123', '${'a'.repeat(64)}', 'yazma'),
      ('${YABANCI_ANAHTAR}', '${YABANCI}', 'Başka',  'adv_rw_zzz999', '${'b'.repeat(64)}', 'yazma')
  `);
  await h.q(`
    INSERT INTO mcp_onaylari (id, anahtar_id, user_id, islem, hedef, ozet, bitis)
    VALUES ('${ONAY}', '${ANAHTAR}', '${SAHIP}', 'varlik_durdur', '{"varlik_id":"x"}', '["Durum: Yayında → Duraklatıldı"]', now() + interval '15 minutes')
  `);
});

afterAll(async () => h.close());

async function asUser<T = Record<string, unknown>>(sql: string, ctx: Ctx): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id',  '${ctx.orgId}',  false),
           set_config('app.current_user_id', '${ctx.userId}', false),
           set_config('app.is_org_admin',    'on',            false),
           set_config('app.tum_sirketler',   'off',           false)
  `);
  await h.q(`SET ROLE ${APP_ROLE}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

const SAHIP_CTX: Ctx = { orgId: ORG, userId: SAHIP };
const YABANCI_CTX: Ctx = { orgId: ORG, userId: YABANCI };

const ALMA = (kullanici: string, anahtar: string) => `
  UPDATE mcp_onaylari SET durum = 'uygulaniyor', karar_at = now()
   WHERE id = '${ONAY}'::uuid AND user_id = '${kullanici}'::uuid AND anahtar_id = '${anahtar}'::uuid
     AND durum = 'bekliyor' AND bitis > now()
  RETURNING id`;

describe('tarama boşa düşmüyor', () => {
  it('RLS gerçekten AÇIK ve politikalar SELECT/INSERT/UPDATE (DELETE yok)', async () => {
    const [row] = await h.q<{ relrowsecurity: boolean }>(`SELECT relrowsecurity FROM pg_class WHERE relname = 'mcp_onaylari'`);
    expect(row?.relrowsecurity).toBe(true);
    const p = await h.q<{ cmd: string }>(`SELECT cmd FROM pg_policies WHERE tablename = 'mcp_onaylari' ORDER BY cmd`);
    expect(p.map((x) => x.cmd)).toEqual(['INSERT', 'SELECT', 'UPDATE']);
  });

  it('CHECK kısıtları shared listeleriyle aynı değerleri kabul ediyor', async () => {
    await expect(
      h.q(`INSERT INTO mcp_onaylari (anahtar_id, user_id, islem, hedef, ozet, bitis) VALUES ('${ANAHTAR}', '${SAHIP}', 'kampanya_sil', '{}', '[]', now())`),
    ).rejects.toThrow(/mcp_onaylari_islem_chk/);
    await expect(h.q(`UPDATE okuma_api_anahtarlari SET yetki = 'admin' WHERE id = '${ANAHTAR}'`)).rejects.toThrow(/yetki_chk/);
  });

  it('KRİTİK: shared listesindeki HER işlem kısıttan geçiyor (yeni işlem migration\'sız eklenirse onay satırı açılamaz)', async () => {
    // Liste genişleyip migration unutulursa araç "onay açılamadı" yerine ham
    // kısıt hatası verir; 2026-10-20'de `form_yayinla` için yaşanacaktı.
    expect(MCP_ONAY_ISLEMLERI).toContain('form_yayinla');
    for (const islem of MCP_ONAY_ISLEMLERI) {
      const r = await h.q<{ id: string }>(
        `INSERT INTO mcp_onaylari (anahtar_id, user_id, islem, hedef, ozet, bitis) VALUES ('${ANAHTAR}', '${SAHIP}', '${islem}', '{}', '[]', now()) RETURNING id`,
      );
      expect(r, islem).toHaveLength(1);
      await h.q(`DELETE FROM mcp_onaylari WHERE id = '${r[0]!.id}'`);
    }
  });
});

describe('KRİTİK: yalnızca sahibi', () => {
  it('sahibi görüyor, başka kullanıcı (o da platform sahibi) GÖREMİYOR', async () => {
    expect(await asUser(`SELECT id FROM mcp_onaylari`, SAHIP_CTX)).toHaveLength(1);
    expect(await asUser(`SELECT id FROM mcp_onaylari`, YABANCI_CTX)).toHaveLength(0);
  });

  it('KRİTİK: başkası onayı ALAMIYOR (kendi kimliğiyle de, sahibin kimliğiyle de) — sıfır satır', async () => {
    expect(await asUser(ALMA(YABANCI, YABANCI_ANAHTAR), YABANCI_CTX)).toHaveLength(0);
    // Sorguya sahibin kimliğini yazmak politikayı aşmıyor: süzgeç oturumun kullanıcısı.
    expect(await asUser(ALMA(SAHIP, ANAHTAR), YABANCI_CTX)).toHaveLength(0);
    const [d] = await h.q<{ durum: string }>(`SELECT durum FROM mcp_onaylari WHERE id = '${ONAY}'`);
    expect(d?.durum).toBe('bekliyor');
  });

  it('KRİTİK: başkasının ANAHTARINA bağlı satır açılamıyor', async () => {
    // RETURNING yok: dönen satır SELECT politikasına takılıp testi yanlış sebeple geçirmesin.
    await expect(
      asUser(
        `INSERT INTO mcp_onaylari (anahtar_id, user_id, islem, hedef, ozet, bitis)
         VALUES ('${YABANCI_ANAHTAR}', '${SAHIP}', 'varlik_durdur', '{"sizma":true}', '[]', now() + interval '1 minute')`,
        SAHIP_CTX,
      ),
    ).rejects.toThrow(/row-level security/);
    const [say] = await h.q<{ n: number }>(`SELECT count(*)::int AS n FROM mcp_onaylari WHERE hedef ? 'sizma'`);
    expect(say?.n).toBe(0);
  });

  it('kendi anahtarına satır açabiliyor', async () => {
    const r = await asUser(
      `INSERT INTO mcp_onaylari (anahtar_id, user_id, islem, hedef, ozet, bitis)
       VALUES ('${ANAHTAR}', '${SAHIP}', 'varlik_etkinlestir', '{}', '[]', now() + interval '1 minute') RETURNING id`,
      SAHIP_CTX,
    );
    expect(r).toHaveLength(1);
  });

  it('KRİTİK: başka anahtarla (aynı kişi olsa da) alınamıyor', async () => {
    expect(await asUser(ALMA(SAHIP, YABANCI_ANAHTAR), SAHIP_CTX)).toHaveLength(0);
  });

  it('KRİTİK: ATOMİK ALMA — ilk deneme bir satır, ikinci deneme sıfır', async () => {
    expect(await asUser(ALMA(SAHIP, ANAHTAR), SAHIP_CTX)).toHaveLength(1);
    expect(await asUser(ALMA(SAHIP, ANAHTAR), SAHIP_CTX)).toHaveLength(0);
  });

  it('KRİTİK: süresi dolmuş onay alınamıyor', async () => {
    const [y] = await h.q<{ id: string }>(`
      INSERT INTO mcp_onaylari (anahtar_id, user_id, islem, hedef, ozet, bitis)
      VALUES ('${ANAHTAR}', '${SAHIP}', 'butce_degistir', '{}', '[]', now() - interval '1 second') RETURNING id::text`);
    const r = await asUser(
      `UPDATE mcp_onaylari SET durum = 'uygulaniyor' WHERE id = '${y!.id}'::uuid AND durum = 'bekliyor' AND bitis > now() RETURNING id`,
      SAHIP_CTX,
    );
    expect(r).toHaveLength(0);
  });

  it('silme politikası yok: sahibi bile SİLEMİYOR (iz kalıyor)', async () => {
    expect(await asUser(`DELETE FROM mcp_onaylari WHERE id = '${ONAY}' RETURNING id`, SAHIP_CTX)).toHaveLength(0);
  });
});
