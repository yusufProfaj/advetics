import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../../test/pglite-harness';
import { workspaceTasi } from '../manager-account/workspace-tasima';
import { HESABIN_KENDI_VERISI, hesapVerisiniTasi } from '../connections/hesap-verisi-tasima';
import { webhookDenetle } from '@advetics/shared';
import { ozelAdres } from '../tenancy/site-oku';
import type { RuleRecord } from '@advetics/shared';
import { kuralBildirimiYaz } from './kural-bildirimi';
import type { TxLike } from './sinyal-hesap';

/**
 * AJAN 4 · KAPI TESTLERİ (Paket A). Ajan 2'nin yazmadığı dört iddia:
 *
 *  1. Workspace ŞİRKET değiştirirken sinyal tabloları da gidiyor. Üç tablo
 *     `(client_id, org_id)` kompozit yabancı anahtarını ON UPDATE CASCADE ile
 *     taşıyor ve `WORKSPACE_TABLOLARI`nda da duruyor; `workspaceTasi` önce
 *     tabloların org_id'sini yazıp SONRA `clients.org_id`'yi güncelliyor.
 *     Arada satır (client, hedef org) çiftine bakıyor ve o çift henüz yok.
 *  2. Hesap el değiştirince sinyal KARDEŞ ŞİRKETTEKİ workspace'e taşınıyor
 *     (servisin gerçek fonksiyonu, kopya sorgu değil).
 *  3. Emniyet süpürmesi DÜŞMÜŞ bir sinyal işini "zaten hesaplanmış" sayıp
 *     yeniden açmamalı.
 *  4. Hesap taşıma RLS testi `HESABIN_KENDI_VERISI`ndeki her tabloyu sınıyor.
 */

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';
const UST = 'a0000000-0000-0000-0000-00000000000a';
const USER = '99999999-9999-9999-9999-999999999999';
const WS = 'aaaa1111-1111-1111-1111-111111111111';
const WS_B = 'bbbb1111-1111-1111-1111-111111111111';
const CONN = 'c0000000-0000-0000-0000-0000000000c1';
const ACC = 'dddd1111-1111-1111-1111-111111111111';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
  await h.q(`INSERT INTO manager_accounts (id, name, slug, status, created_at, updated_at)
             VALUES ('${UST}', 'D', 'd', 'active', now(), now())`);
  await h.q(`INSERT INTO organizations (id, name, slug, plan, status, manager_account_id, created_at, updated_at) VALUES
             ('${ORG_A}','A','a','starter','active','${UST}',now(),now()),
             ('${ORG_B}','B','b','starter','active','${UST}',now(),now())`);
  await h.q(`INSERT INTO users (id, org_id, email, full_name, password_hash, locale, status, created_at, updated_at)
             VALUES ('${USER}','${ORG_A}','u@x.com','U','h','tr','active',now(),now())`);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, timezone, reporting_currency, status, contact_emails, created_at, updated_at) VALUES
             ('${WS}','${ORG_A}','Taşınan','tasinan','Europe/Istanbul','TRY','active','{}',now(),now()),
             ('${WS_B}','${ORG_B}','Kardeş','kardes','Europe/Istanbul','TRY','active','{}',now(),now())`);
  await h.q(`INSERT INTO platform_connections (id, org_id, client_id, platform, external_user_id, account_label, access_token_enc, status, connected_by_user_id, created_at, updated_at)
             VALUES ('${CONN}','${ORG_A}',NULL,'meta','fb','Ajans','\\x00','active','${USER}',now(),now())`);
  await h.q(`INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
             VALUES ('${ACC}','${ORG_A}','${WS}','${CONN}','meta','act_1','Hesap','TRY','Europe/Istanbul',now())`);
});

afterAll(async () => {
  await h.close();
});

async function sinyalTohumla(): Promise<void> {
  await h.q(`TRUNCATE sinyaller, bildirim_kanallari, bildirim_gonderimleri`);
  await h.q(
    `INSERT INTO sinyaller (org_id, client_id, ad_account_id, platform, anahtar, tur, kod, seviye, varlik_id, varlik_adi, gun, onem, para_birimi)
     SELECT c.org_id, c.id, '${ACC}', 'meta', 'saglik:donusum_kesildi:-:account:${ACC}', 'saglik', 'donusum_kesildi',
            'account', '${ACC}', 'Hesap', '2026-10-11', 'yuksek', 'TRY'
       FROM clients c WHERE c.id = '${WS}'`,
  );
  const [k] = await h.q<{ id: string }>(
    `INSERT INTO bildirim_kanallari (org_id, client_id, tur, ad, hedef_ipucu, alicilar, olaylar)
     SELECT c.org_id, c.id, 'eposta', 'E', '1 alıcı', ARRAY['x@y.com'], ARRAY['sinyal'] FROM clients c WHERE c.id = '${WS}'
     RETURNING id::text AS id`,
  );
  await h.q(
    `INSERT INTO bildirim_gonderimleri (org_id, client_id, kanal_id, olay, anahtar, ozet, govde)
     SELECT c.org_id, c.id, '${k!.id}', 'sinyal', 'ozet:2026-10-12', '1 yeni sinyal', '{}'::jsonb FROM clients c WHERE c.id = '${WS}'`,
  );
}

describe('AJAN 4 — workspace şirket değiştiriyor', () => {
  it('KRİTİK: sinyali ve bildirim kanalı olan workspace başka şirkete TAŞINABİLİYOR', async () => {
    await sinyalTohumla();
    await h.q('BEGIN');
    try {
      await workspaceTasi({ $executeRaw: (sql) => h.db.$executeRaw(sql) }, WS, ORG_A, ORG_B);
      await h.q('COMMIT');
    } catch (e) {
      await h.q('ROLLBACK');
      throw e;
    }
    for (const t of ['sinyaller', 'bildirim_kanallari', 'bildirim_gonderimleri']) {
      const r = await h.q<{ org_id: string }>(`SELECT org_id::text AS org_id FROM ${t} WHERE client_id = '${WS}'`);
      expect(r.map((x) => x.org_id), t).toEqual([ORG_B]);
    }
    // Geri al: sonraki test A'dan başlasın.
    await h.q(`UPDATE clients SET org_id = '${ORG_A}' WHERE id = '${WS}'`);
  });
});

describe('AJAN 4 — hesap kardeş şirketteki workspace’e geçiyor', () => {
  it('KRİTİK: gerçek hesapVerisiniTasi sinyali hedef workspace ve HEDEF ŞİRKETE yazıyor', async () => {
    await h.q(`UPDATE clients SET org_id = '${ORG_A}' WHERE id = '${WS}'`);
    await sinyalTohumla();
    const sonuc = await hesapVerisiniTasi(
      h.db as never,
      ACC,
      WS_B,
    );
    expect(sonuc.tasinan['sinyaller']).toBe(1);
    const [r] = await h.q<{ client_id: string; org_id: string }>(
      `SELECT client_id::text AS client_id, org_id::text AS org_id FROM sinyaller WHERE ad_account_id = '${ACC}'`,
    );
    expect(r).toEqual({ client_id: WS_B, org_id: ORG_B });
  });
});

const API = join(__dirname, '..', '..', '..');
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('AJAN 4 — emniyet süpürmesi', () => {
  const KAYNAK = yorumsuz(readFileSync(join(API, 'src/queue/sync-processor.service.ts'), 'utf8'));
  const bas = KAYNAK.indexOf('private async sinyalSupurmesi(');
  if (bas < 0) throw new Error('sinyalSupurmesi bulunamadı — tarama boşa düşer');
  const govde = KAYNAK.slice(bas, KAYNAK.indexOf('async markSucceeded(', bas));

  it('tarama gövdeyi gerçekten yakaladı', () => {
    expect(govde).toContain("jobType: 'signals_evaluate', dateFrom: gun");
  });

  it('KRİTİK: DÜŞMÜŞ sinyal işi "zaten hesaplanmış" sayılmıyor (durum süzgeci var)', () => {
    const i = govde.indexOf("jobType: 'signals_evaluate', dateFrom: gun");
    const satir = govde.slice(govde.lastIndexOf('where:', i), govde.indexOf('}', i) + 1);
    expect(satir).toMatch(/status/);
  });
});

describe('AJAN 4 — hesap taşıma RLS kapsaması', () => {
  it('KRİTİK: hesap-tasima-rls.spec TASINAN listesi HESABIN_KENDI_VERISI’ndeki her tabloyu içeriyor', () => {
    /*
     * Ajan 2 düzeltmesi (N-b): liste artık elle değil KAYNAKTAN türetiliyor;
     * iddia "her tablo listede" yerine "liste kaynağın kendisi". Elle yazılı
     * bir liste geri gelirse bu satır düşer.
     */
    const spec = yorumsuz(readFileSync(join(API, 'src/prisma/hesap-tasima-rls.spec.ts'), 'utf8'));
    expect(spec).toMatch(/const TASINAN = HESABIN_KENDI_VERISI\.map\(\(t\) => t\.tablo\);/);
    expect(spec).toMatch(/for \(const t of TASINAN\)/);
    expect(HESABIN_KENDI_VERISI.map((t) => t.tablo)).toContain('sinyaller');
  });
});

describe('AJAN 4 — webhook adresi atlatma denemeleri', () => {
  const REDDEDILMELI: Array<['slack' | 'teams', string]> = [
    ['slack', 'https://hooks.slack.com@evil.com/services/x'],
    ['slack', 'https://evil.com#@hooks.slack.com/services/x'],
    ['slack', 'https://evil.com\\@hooks.slack.com/services/x'],
    ['slack', 'https://hooks.slack.com.evil.com/services/x'],
    ['slack', 'https://hooks.slack.com./services/x'],
    ['slack', 'https://hooks.slack.com:8443/services/x'],
    ['slack', 'http://hooks.slack.com/services/x'],
    ['slack', 'https://hooks.slack.com/services/../x'],
    ['slack', 'https://2130706433/services/x'],
    ['slack', 'https://0x7f000001/services/x'],
    ['slack', 'https://[::ffff:127.0.0.1]/services/x'],
    ['teams', 'https://x.webhook.office.com.evil.com/a'],
    ['teams', 'https://webhook.office.com/a'],
    ['teams', 'https://xwebhook.office.com/a'],
    ['teams', 'https://x.logic.azure.com:444/a'],
  ];
  it.each(REDDEDILMELI)('%s reddediliyor: %s', (tur, adres) => {
    expect(webhookDenetle(tur, adres).gecerli).toBe(false);
  });

  it('büyük harf ana makine normalleşip kabul ediliyor', () => {
    const d = webhookDenetle('slack', 'https://HOOKS.SLACK.COM/services/T/B/x');
    expect(d).toEqual({ gecerli: true, adres: 'https://hooks.slack.com/services/T/B/x' });
  });
});

describe('AJAN 4 — çözülen IP iç ağ denetimi (ozelAdres)', () => {
  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1', '169.254.169.254', '0.0.0.0', 'fe80::1', 'fd00::1'])('%s iç ağ', (ip) => {
    expect(ozelAdres(ip)).toBe(true);
  });
  // IPv4-eşlemeli adresin ONALTILIK yazımı ve IPv4-uyumlu/NAT64 biçimleri.
  it.each(['::ffff:7f00:1', '::ffff:a9fe:a9fe', '::127.0.0.1', '64:ff9b::a9fe:a9fe'])('%s iç ağ (onaltılık/gömülü IPv4)', (ip) => {
    expect(ozelAdres(ip)).toBe(true);
  });
});

describe('AJAN 4 — kural bildirimi workspace sınırı (worker BYPASSRLS)', () => {
  it('KRİTİK: başarısız eylem bildirimi YALNIZ kuralın workspace’inin kanalına gidiyor', async () => {
    await h.q(`UPDATE clients SET org_id = '${ORG_A}' WHERE id = '${WS}'`);
    await h.q(`TRUNCATE sinyaller, bildirim_kanallari, bildirim_gonderimleri`);
    const KURAL = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    const RUN = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    const kanal = async (ws: string) =>
      (await h.q<{ id: string }>(
        `INSERT INTO bildirim_kanallari (org_id, client_id, tur, ad, hedef_ipucu, alicilar, olaylar)
         SELECT c.org_id, c.id, 'eposta', 'E', '1', ARRAY['x@y.com'], ARRAY['kural'] FROM clients c WHERE c.id = '${ws}'
         RETURNING id::text AS id`,
      ))[0]!.id;
    const kendi = await kanal(WS);
    await kanal(WS_B);
    await h.q(`INSERT INTO rules (id, org_id, client_id, name, level, conditions, action, guard, updated_at)
               VALUES ('${KURAL}', '${ORG_A}', '${WS}', 'K', 'campaign', '[{"metric":"cpa","op":"gt","value":1}]'::jsonb, '{"type":"pause"}'::jsonb, '{}'::jsonb, now())`);
    await h.q(`INSERT INTO rule_runs (id, org_id, rule_id, dry_run, started_at) VALUES ('${RUN}', '${ORG_A}', '${KURAL}', false, now())`);
    await h.q(`INSERT INTO rule_action_logs (id, org_id, rule_id, run_id, entity_level, entity_id, entity_name, entity_external_id, action_type, outcome, reason, error)
               VALUES (gen_random_uuid(), '${ORG_A}', '${KURAL}', '${RUN}', 'campaign', gen_random_uuid(), 'Kampanya', 'c1', 'pause', 'failed', 'r', 'e')`);
    const kural = { id: KURAL, name: 'K', clientId: WS, dryRun: false, action: { type: 'pause' } } as unknown as RuleRecord;
    expect(await kuralBildirimiYaz(h.db as unknown as TxLike, kural, RUN)).toBe(1);
    expect(await h.q(`SELECT kanal_id::text AS k FROM bildirim_gonderimleri`)).toEqual([{ k: kendi }]);
  });
});

describe('AJAN 4 — başka şirket kullanıcısı (SET ROLE + RETURNING)', () => {
  it('KRİTİK: başka şirketin bağlamı, client listesinde workspace olsa bile satır göremiyor ve güncelleyemiyor', async () => {
    await h.q(`UPDATE clients SET org_id = '${ORG_A}' WHERE id = '${WS}'`);
    await sinyalTohumla();
    const ROL = 'advetics_ajan4_test';
    await h.q(`DO $$ BEGIN CREATE ROLE ${ROL} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await h.q(`GRANT USAGE ON SCHEMA public, app TO ${ROL}`);
    await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL}`);
    const T = ['sinyaller', 'bildirim_kanallari', 'bildirim_gonderimleri'];
    for (const t of T) await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
    try {
      await h.q(`SELECT set_config('app.current_org_id', '${ORG_B}', false), set_config('app.current_user_id', '${USER}', false),
                        set_config('app.current_client_ids', '${WS}', false), set_config('app.is_org_admin', 'on', false),
                        set_config('app.current_active_client_id', '', false), set_config('app.tum_sirketler', 'off', false)`);
      await h.q(`SET ROLE ${ROL}`);
      for (const t of T) {
        expect((await h.q(`SELECT 1 FROM ${t}`)).length, t).toBe(0);
        expect((await h.q(`UPDATE ${t} SET org_id = org_id RETURNING 1`)).length, t).toBe(0);
      }
    } finally {
      await h.q('RESET ROLE');
      for (const t of T) await h.q(`ALTER TABLE ${t} DISABLE ROW LEVEL SECURITY`);
    }
  });
});
