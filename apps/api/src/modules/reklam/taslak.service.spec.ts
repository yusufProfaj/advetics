import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ALAN_KAYNAKLARI,
  ATIF_STANDARTLARI,
  OLUSTURAN_YUZLER,
  ONAY_TURLERI,
  TASLAK_DURUMLARI,
  type TenantContext,
} from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { ReklamTaslakService } from './taslak.service';

/**
 * Yeni reklam taslağı — gerçek şema (PGlite), üretim migration'larından.
 */
let h: Harness;
let svc: ReklamTaslakService;

const OTEKI = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const HESAP = '44444444-0000-4000-8000-000000000001';
const HAVUZ = '44444444-0000-4000-8000-000000000002';
const SAYFA = '55555555-0000-4000-8000-000000000001';
const CTX = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client, OTEKI],
  activeClientId: IDS.client,
  isOrgAdmin: true,
} as TenantContext;

beforeAll(async () => {
  h = await createHarness();
  const prisma = {
    withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;
  svc = new ReklamTaslakService(prisma);
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Öteki', 'oteki', now())`, [OTEKI, IDS.org]);
  await h.q('DELETE FROM ad_accounts');
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
     VALUES ($1, $3, $4, $5, 'meta', 'act_1', 'H', 'TRY', 'Europe/Istanbul', now()),
            ($2, $3, NULL, $5, 'meta', 'act_2', 'Havuz', 'TRY', 'Europe/Istanbul', now())`,
    [HESAP, HAVUZ, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', 'p1', 'Sayfa', now())`,
    [SAYFA, IDS.org, IDS.client, IDS.connection],
  );
});

const k = (deger: unknown) => ({ deger, kaynak: 'kullanici' as const });

describe('taslak yaşam döngüsü', () => {
  it('boş taslak: sürümsüz, eksik listesi DOLU (boş liste "hazır" okunurdu)', async () => {
    const t = await svc.olustur(CTX, IDS.client, 'acemi', null);
    expect(t).toMatchObject({ durum: 'taslak', aktifSurumNo: 0, icerikOzeti: null });
    expect(t.eksikler.map((e) => e.kod)).toContain('NIYET');
    expect(t.eksikler.map((e) => e.kod)).toContain('OK-17');
  });

  it('her değişiklik yeni sürüm; aynı içerik ikinci sürüm YAZMAZ', async () => {
    const t = await svc.olustur(CTX, IDS.client, 'acemi', null);
    const a = await svc.surumYaz(CTX, t.id, { niyet: k('SITE') });
    expect(a.aktifSurumNo).toBe(1);
    const b = await svc.surumYaz(CTX, t.id, { niyet: k('SITE') });
    expect(b.aktifSurumNo).toBe(1);
    const c = await svc.surumYaz(CTX, t.id, { niyet: k('FORM') });
    expect(c.aktifSurumNo).toBe(2);
    const [s] = await h.q<{ n: number }>('SELECT count(*)::int AS n FROM taslak_surumu');
    const n = s!.n;
    expect(n).toBe(2);
  });

  it('kim ve zaman SUNUCUDA basılıyor', async () => {
    const t = await svc.olustur(CTX, IDS.client, 'acemi', null);
    const s = await svc.surumYaz(CTX, t.id, { niyet: k('SITE') });
    expect(s.alanlar.niyet).toMatchObject({ deger: 'SITE', kaynak: 'kullanici', kim: IDS.user });
    expect(Date.parse(s.alanlar.niyet!.zaman)).not.toBeNaN();
  });

  it('KRİTİK: havuzdaki ya da başka workspace’in hesabı seçilemez', async () => {
    const t = await svc.olustur(CTX, IDS.client, 'acemi', null);
    await expect(svc.surumYaz(CTX, t.id, { reklamHesabiId: k(HAVUZ) })).rejects.toThrow(/atanmış değil/);
    const s = await svc.surumYaz(CTX, t.id, { reklamHesabiId: k(HESAP), sayfaId: k(SAYFA) });
    expect(s.adAccountId).toBe(HESAP);
  });

  it('PROVA olmadan taslak HAZIR olmaz (eksikler dolu olsa da tam olsa da)', async () => {
    const t = await svc.olustur(CTX, IDS.client, 'acemi', null);
    const s = await svc.surumYaz(CTX, t.id, {
      niyet: k('SITE'),
      reklamHesabiId: k(HESAP),
      sayfaId: k(SAYFA),
      konumlar: k([{ tur: 'region', key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' }]),
      kavramlar: k([{ varlikId: '66666666-0000-4000-8000-000000000001', baslik: 'B', metin: 'M' }]),
      hedefAdres: k('https://ornek.com.tr'),
      butce: k({ tip: 'gunluk', micros: '500000000' }),
      takvim: k({ baslangic: '2026-10-08', bitis: null }),
    });
    expect(s.eksikler.map((e) => e.kod)).toEqual(['OK-17']);
    expect(s.durum).toBe('taslak');
  });

  it('şemaya uymayan değer reddedilir ve sürüm yazılmaz', async () => {
    const t = await svc.olustur(CTX, IDS.client, 'acemi', null);
    await expect(svc.surumYaz(CTX, t.id, { butce: k({ tip: 'gunluk', micros: 500.5 }) })).rejects.toThrow();
    const [s] = await h.q<{ n: number }>('SELECT count(*)::int AS n FROM taslak_surumu');
    const n = s!.n;
    expect(n).toBe(0);
  });

  it('arşivlenen taslağa yazılamaz; listede görünmez ama toplamdan da düşer', async () => {
    const t = await svc.olustur(CTX, IDS.client, 'acemi', null);
    await svc.olustur(CTX, IDS.client, 'acemi', null);
    await svc.arsivle(CTX, t.id);
    await expect(svc.surumYaz(CTX, t.id, { niyet: k('SITE') })).rejects.toThrow(/arşivde/);
    const l = await svc.listele(CTX, IDS.client);
    expect(l.toplam).toBe(1);
    expect(l.satirlar).toHaveLength(1);
  });

  it('erişimi olmayan workspace’te taslak açılmaz', async () => {
    await expect(svc.olustur({ ...CTX, clientIds: [IDS.client] }, OTEKI, 'acemi', null)).rejects.toThrow(/erişimin yok/);
  });
});

describe('veritabanı kısıtları', () => {
  it('KRİTİK: taslak_surumu içeriği BYPASSRLS rolünde bile DEĞİŞMEZ (trigger)', async () => {
    const t = await svc.olustur(CTX, IDS.client, 'acemi', null);
    await svc.surumYaz(CTX, t.id, { niyet: k('SITE') });
    await expect(h.q(`UPDATE taslak_surumu SET alanlar = '{}'::jsonb`)).rejects.toThrow(/degismez/);
    // Workspace taşıması için client/org değişimi serbest.
    await h.q(`UPDATE taslak_surumu SET org_id = org_id`);
  });

  it('onay türü yalnız onaydayken; arşiv zamanı yalnız arşivdeyken', async () => {
    const t = await svc.olustur(CTX, IDS.client, 'acemi', null);
    await expect(h.q(`UPDATE reklam_taslagi SET onay_turu = 'ajans' WHERE id = $1`, [t.id])).rejects.toThrow();
    await expect(h.q(`UPDATE reklam_taslagi SET durum = 'arsivlendi' WHERE id = $1`, [t.id])).rejects.toThrow();
  });

  /*
   * CHECK LİSTELERİ SABİTLERLE AYRIŞAMAZ: kodda yeni durum eklenip CHECK
   * unutulursa INSERT üretimde patlar; tersi, kod tanımadığı bir değeri
   * okur. Migration metni ile sabitler karşılaştırılıyor.
   */
  it('KRİTİK: CHECK listeleri packages/shared sabitleriyle aynı', () => {
    const sql = readFileSync(
      join(__dirname, '../../../prisma/migrations/20261007120000_reklam_taslak_cekirdegi/migration.sql'),
      'utf8',
    );
    const liste = (kisit: string, kolon: string) => {
      const i = sql.indexOf(`"${kisit}"`);
      expect(i, kisit).toBeGreaterThan(-1);
      const m = new RegExp(`"${kolon}" IN \\(([^)]*)\\)`).exec(sql.slice(i));
      return m![1]!.split(',').map((x) => x.trim().replace(/'/g, ''));
    };
    expect(liste('reklam_taslagi_durum_chk', 'durum')).toEqual([...TASLAK_DURUMLARI]);
    expect(liste('reklam_taslagi_onay_chk', 'onay_turu')).toEqual([...ONAY_TURLERI]);
    expect(liste('reklam_taslagi_yuz_chk', 'olusturan_yuz')).toEqual([...OLUSTURAN_YUZLER]);
    expect(liste('ajans_ayari_atif_chk', 'atif_standardi')).toEqual([...ATIF_STANDARTLARI]);
    expect(ALAN_KAYNAKLARI).toContain('ai_onerisi');
  });
});

/**
 * RLS — gerçek politikalar, sahibi olmayan rolle (CLAUDE.md: "patlamadı"
 * yetmez, ETKİLENEN SATIRI say).
 */
describe('RLS', () => {
  const ROL = 'advetics_reklam_test';
  beforeAll(async () => {
    await h.q(`DO $$ BEGIN CREATE ROLE ${ROL} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await h.q(`GRANT USAGE ON SCHEMA public, app TO ${ROL}`);
    await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL}`);
    for (const t of ['reklam_taslagi', 'taslak_surumu', 'ajans_ayari']) {
      await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
    }
  });

  async function kullaniciOlarak<T = Record<string, unknown>>(sql: string, clientIds: string[], admin = false): Promise<T[]> {
    await h.q(`
      SELECT set_config('app.current_org_id', '${IDS.org}', false),
             set_config('app.current_user_id', '${IDS.user}', false),
             set_config('app.current_client_ids', '${clientIds.join(',')}', false),
             set_config('app.is_org_admin', '${admin ? 'on' : 'off'}', false),
             set_config('app.current_active_client_id', '', false)`);
    await h.q(`SET ROLE ${ROL}`);
    try {
      return await h.q<T>(sql);
    } finally {
      await h.q('RESET ROLE');
    }
  }

  it('KRİTİK: sürüm UPDATE’i politikayla SIFIR satır etkiler (RETURNING ile sayıldı)', async () => {
    const t = await svc.olustur(CTX, IDS.client, 'acemi', null);
    await svc.surumYaz(CTX, t.id, { niyet: k('SITE') });
    const gorulen = await kullaniciOlarak(`SELECT id FROM taslak_surumu`, [IDS.client]);
    expect(gorulen).toHaveLength(1); // görüyor — sıfır satır "göremediği" için değil
    const r = await kullaniciOlarak(`UPDATE taslak_surumu SET org_id = org_id RETURNING id`, [IDS.client]);
    expect(r).toHaveLength(0);
  });

  it('başka workspace’in taslağı görünmez', async () => {
    await svc.olustur(CTX, IDS.client, 'acemi', null);
    expect(await kullaniciOlarak(`SELECT id FROM reklam_taslagi`, [OTEKI])).toHaveLength(0);
    expect(await kullaniciOlarak(`SELECT id FROM reklam_taslagi`, [IDS.client])).toHaveLength(1);
  });

  it('atıf standardını yalnız yönetici yazar; herkes okur', async () => {
    const yaz = `INSERT INTO ajans_ayari (org_id, atif_standardi, atif_secen_id, atif_secim_at)
                 VALUES ('${IDS.org}', 'tik7_gor1', '${IDS.user}', now()) RETURNING org_id`;
    await expect(kullaniciOlarak(yaz, [IDS.client], false)).rejects.toThrow(/row-level security/);
    expect(await kullaniciOlarak(yaz, [IDS.client], true)).toHaveLength(1);
    expect(await kullaniciOlarak(`SELECT atif_standardi FROM ajans_ayari`, [IDS.client], false)).toEqual([
      { atif_standardi: 'tik7_gor1' },
    ]);
  });
});
