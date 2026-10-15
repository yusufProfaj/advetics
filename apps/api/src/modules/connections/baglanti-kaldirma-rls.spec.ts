import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { AuditService } from '../audit/audit.service';
import { ConnectionsService } from './connections.service';

/**
 * ═══ BAĞLANTIYI KALDIRMAK — GERÇEK RLS ALTINDA (2026-10-15 üretimi) ═══
 *
 * Olay: ajansın Google bağlantısı (Advetics şirketi, 56 workspace'i
 * besliyordu) kardeş bir müşteri şirketinin (Profaj Reklam Hesabı)
 * ekranından kaldırıldı. İki ayrı hata birlikte çıktı:
 *
 *   1. Kapı yoktu: havuz bağlantısının yazma politikası ajans havuzunu her
 *      kardeş şirketten yazılabilir kılıyor ve servis başka bir şey
 *      sormuyordu.
 *   2. İzleme yarım kapandı: güncelleme `withTenant` altında koştu ve RLS
 *      yalnız o şirketin satırını gösterdi — 56 hesabın 1'i kapandı, 55'i
 *      ölü bir token'la açık kaldı.
 *
 * Varsayılan koşum ortamında RLS kapalı ve ikinci hata ORADA GÖRÜNMEZ: her
 * satır güncellenir, test yeşil geçer. Bu paket politikaları `SET ROLE` ile
 * uyguluyor ve etkilenen satırı RETURNING ile sayıyor (CLAUDE.md §3 Test:
 * sıfır satırlık UPDATE politikadan bağımsız olarak başarılı döner).
 */
let h: Harness;
let svc: ConnectionsService;
const iptal = vi.fn(async () => undefined);

const UST = 'aaaa0000-0000-0000-0000-0000000000aa';
const ORG_AJANS = '11111111-1111-1111-1111-111111111111';
const ORG_PROFAJ = '22222222-2222-2222-2222-222222222222';
const ORG_BILTAS = '33333333-3333-3333-3333-333333333333';
const WS_AJANS = 'a0a0a0a0-a0a0-a0a0-a0a0-a0a0a0a0a0a0';
const WS_PROFAJ = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
const WS_BILTAS = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';
const USER_AJANS = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
const CONN_AJANS = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';
const ACC_PROFAJ = '01010101-0101-0101-0101-010101010101';
const ACC_BILTAS = '02020202-0202-0202-0202-020202020202';
const ACC_HAVUZ = '03030303-0303-0303-0303-030303030303';
const SAYFA_BILTAS = '05050505-0505-0505-0505-050505050505';

const ROL = 'advetics_baglanti_kaldirma_test';
const RLS = [
  'manager_accounts',
  'organizations',
  'clients',
  'platform_connections',
  'ad_accounts',
  'social_profiles',
  'audit_logs',
];
const META = { ip: null, userAgent: null, requestId: 'test' };

const ortak = {
  userId: USER_AJANS,
  clientIds: [WS_AJANS, WS_PROFAJ, WS_BILTAS],
  activeClientId: null,
  isOrgAdmin: true,
  managerAccountId: UST,
  tumSirketler: false,
  permissions: ['connection.write', 'connection.manage'],
};
/** Ajans yöneticisi, AJANS şirketinde. */
const AJANSTA = { ...ortak, orgId: ORG_AJANS } as unknown as TenantContext;
/** Aynı kişi, KARDEŞ şirkete geçmiş — olayın yaşandığı bağlam. */
const KARDESTE = { ...ortak, orgId: ORG_PROFAJ, activeClientId: WS_PROFAJ } as unknown as TenantContext;

async function baglam(ctx: TenantContext): Promise<void> {
  await h.q(`
    SELECT set_config('app.current_org_id',             '${ctx.orgId}', false),
           set_config('app.current_user_id',            '${ctx.userId}', false),
           set_config('app.current_client_ids',         '${ctx.clientIds.join(',')}', false),
           set_config('app.is_org_admin',               '${ctx.isOrgAdmin ? 'on' : 'off'}', false),
           set_config('app.can_manage_pool',            'on', false),
           set_config('app.current_manager_account_id', '${ctx.managerAccountId ?? ''}', false),
           set_config('app.current_active_client_id',   '${ctx.activeClientId ?? ''}', false),
           set_config('app.tum_sirketler',              '${ctx.tumSirketler ? 'on' : 'off'}', false)
  `);
}

/** Kısıtlı rol açıkken BYPASSRLS gibi davranan istemci. */
function adminTaklidi(): PrismaAdminService {
  /*
   * ROL YALNIZCA ÖNCEDEN AÇIKSA GERİ KONUYOR. İlk yazımda koşulsuz geri
   * konuyordu: transaction DIŞINDAKİ bir admin çağrısından (mail için
   * workspace adı) sonra kısıtlı rol açık kalıyor, sonraki doğrulama
   * sorguları satırları göremiyor ve temizlik "permission denied" ile
   * düşüyordu. Yedi test, üretimle ilgisiz bir sebeple kırmızıydı.
   */
  const rolsuz = async <T>(fn: () => Promise<T>): Promise<T> => {
    const [r] = await h.q<{ u: string }>('SELECT current_user AS u');
    const acikti = r?.u === ROL;
    if (acikti) await h.q('RESET ROLE');
    try {
      return await fn();
    } finally {
      if (acikti) await h.q(`SET ROLE ${ROL}`);
    }
  };
  const db = h.db as unknown as Record<string, unknown>;
  const sar = (hedef: Record<string, unknown>): Record<string, unknown> =>
    new Proxy(hedef, {
      get(t, ad) {
        const v = t[ad as string];
        if (typeof v === 'function') {
          return (...a: unknown[]) => rolsuz(() => (v as (...x: unknown[]) => Promise<unknown>)(...a));
        }
        if (v && typeof v === 'object') return sar(v as Record<string, unknown>);
        return v;
      },
    });
  const admin = sar(db) as Record<string, unknown>;
  // Transaction: yazmalar sırayla koşuyor, her biri kendi rolsüz sarmalında.
  admin.$transaction = async (fn: (a: unknown) => Promise<unknown>) => fn(admin);
  return admin as unknown as PrismaAdminService;
}

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${ROL} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${ROL}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL}`);
  await h.q(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${ROL}`);
  await h.q(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${ROL}`);
  for (const t of RLS) await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);

  const admin = adminTaklidi();
  const prisma = {
    withTenant: async <T>(ctx: TenantContext, fn: (tx: unknown) => Promise<T>) => {
      await baglam(ctx);
      await h.q(`SET ROLE ${ROL}`);
      try {
        return await fn(h.db);
      } finally {
        await h.q('RESET ROLE');
      }
    },
  } as unknown as PrismaService;
  svc = new ConnectionsService(
    prisma,
    admin as never,
    { revokeOnPlatform: iptal } as never,
    new AuditService(admin),
    { get: () => ({}) } as never,
    null as never,
    { enqueue: () => Promise.resolve({ enqueued: true }) } as never,
    {} as never,
    { degerlendir: () => { throw new Error('ödeme tetiği beklenmiyor'); } } as never,
    { gonder: vi.fn() } as never,
    { izinleBaslat: vi.fn().mockResolvedValue(0) } as never,
  );
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  iptal.mockClear();
  await h.q(
    `INSERT INTO manager_accounts (id, name, slug, status, updated_at)
     VALUES ($1, 'Profaj', 'profaj', 'active', now())`,
    [UST],
  );
  await h.q(
    `INSERT INTO organizations (id, name, slug, status, manager_account_id, updated_at)
     VALUES ($1, 'Advetics', 'advetics', 'active', $4, now()),
            ($2, 'Profaj Reklam Hesabı', 'profaj-rh', 'active', $4, now()),
            ($3, 'Biltaş', 'biltas', 'active', $4, now())`,
    [ORG_AJANS, ORG_PROFAJ, ORG_BILTAS, UST],
  );
  await h.q(`UPDATE manager_accounts SET ajans_org_id = $1 WHERE id = $2`, [ORG_AJANS, UST]);
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $4, 'Ajans WS', 'ajans-ws', now()),
            ($2, $5, 'Profaj WS', 'profaj-ws', now()),
            ($3, $6, 'Biltaş WS', 'biltas-ws', now())`,
    [WS_AJANS, WS_PROFAJ, WS_BILTAS, ORG_AJANS, ORG_PROFAJ, ORG_BILTAS],
  );
  await h.q(
    `INSERT INTO users (id, org_id, email, full_name, updated_at)
     VALUES ($1, $2, 'y@profaj.com', 'Ajans', now())`,
    [USER_AJANS, ORG_AJANS],
  );
  await h.q(
    `INSERT INTO platform_connections
       (id, org_id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1, $2, NULL, 'google', 'active', '9608136521', 'Google Ads', '\\x00', '{adwords}', $3, now())`,
    [CONN_AJANS, ORG_AJANS, USER_AJANS],
  );
  // Ajansın bağlantısından İKİ şirkete ödünç verilmiş iki hesap + havuzda bir hesap.
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, status, sync_enabled, updated_at)
     VALUES ($1, $4, $5, $9, 'google', '111', 'PROFAJ', 'TRY', 'Europe/Istanbul', 'active', true, now()),
            ($2, $6, $7, $9, 'google', '222', 'BILTAS', 'TRY', 'Europe/Istanbul', 'active', true, now()),
            ($3, $8, NULL, $9, 'google', '333', 'HAVUZ', 'TRY', 'Europe/Istanbul', 'active', false, now())`,
    [ACC_PROFAJ, ACC_BILTAS, ACC_HAVUZ, ORG_PROFAJ, WS_PROFAJ, ORG_BILTAS, WS_BILTAS, ORG_AJANS, CONN_AJANS],
  );
  await h.q(
    `INSERT INTO social_profiles
       (id, org_id, client_id, connection_id, profile_type, external_id, name, sync_enabled, updated_at)
     VALUES ($1, $2, $3, $4, 'youtube_channel', 'yt_b', 'BILTAS KANAL', true, now())`,
    [SAYFA_BILTAS, ORG_BILTAS, WS_BILTAS, CONN_AJANS],
  );
});

const acikHesaplar = async () =>
  (
    await h.q<{ id: string }>(
      `SELECT id::text FROM ad_accounts WHERE connection_id = $1 AND sync_enabled ORDER BY id`,
      [CONN_AJANS],
    )
  ).map((r) => r.id);
const durum = async () =>
  (await h.q<{ status: string }>('SELECT status FROM platform_connections WHERE id = $1', [CONN_AJANS]))[0]!.status;

describe('KÖK SEBEP — neden yönetim istemcisi', () => {
  it('KRİTİK: kullanıcının RLS bağlamında bağlantının satırlarının hepsi GÜNCELLENEMİYOR', async () => {
    /*
     * Çözümün GEREKÇESİ. Atanmış satır kendi şirketine çivili; ajans
     * bağlamından kardeş şirketlere ödünç verilmiş hesaplar görünmüyor.
     * Politika bir gün değişip burada iki satır dönerse, yönetim
     * istemcisine gerek kalmamıştır ve buradaki gerekçe yeniden okunmalı.
     */
    for (const ctx of [AJANSTA, KARDESTE]) {
      await baglam(ctx);
      await h.q(`SET ROLE ${ROL}`);
      try {
        const donen = await h.q<{ id: string }>(
          `UPDATE ad_accounts SET sync_enabled = false
            WHERE connection_id = $1 AND client_id IS NOT NULL RETURNING id::text`,
          [CONN_AJANS],
        );
        expect(donen.length).toBeLessThan(2);
      } finally {
        await h.q('RESET ROLE');
      }
      await h.q(`UPDATE ad_accounts SET sync_enabled = true WHERE client_id IS NOT NULL`);
    }
  });
});

describe('KRİTİK: ajansın bağlantısı yalnız ajans şirketinden kaldırılıyor', () => {
  it('kardeş şirketten REDDEDİLİYOR — platformdaki token da öldürülmüyor', async () => {
    await expect(svc.disconnect(KARDESTE, CONN_AJANS, META, 2)).rejects.toThrow(
      /Advetics şirketinin ve 2 workspace'i besliyor.*Yalnızca Advetics şirketinden/,
    );
    expect(iptal).not.toHaveBeenCalled();
    expect(await durum()).toBe('active');
    expect(await acikHesaplar()).toEqual([ACC_PROFAJ, ACC_BILTAS]);
  });

  it('önizleme kardeş şirkette kapalı ve sebebini söylüyor', async () => {
    const o = await svc.disconnectOnizleme(KARDESTE, CONN_AJANS);
    expect(o).toMatchObject({ kaldirabilir: false, workspaceSayisi: 2, sahipSirketAdi: 'Advetics' });
    expect(o.sebep).toContain('Yalnızca Advetics şirketinden');
  });

  it('önizleme ajans şirketinde BÜTÜN şirketleri sayıyor (2 workspace, 2 izlenen hesap)', async () => {
    expect(await svc.disconnectOnizleme(AJANSTA, CONN_AJANS)).toEqual({
      kaldirabilir: true,
      sebep: null,
      sahipSirketAdi: 'Advetics',
      workspaceSayisi: 2,
      izlenenHesapSayisi: 2,
    });
  });

  it('onay sayısı yoksa ya da tutmuyorsa REDDEDİLİYOR', async () => {
    await expect(svc.disconnect(AJANSTA, CONN_AJANS, META)).rejects.toThrow(/2 workspace'i besliyor/);
    await expect(svc.disconnect(AJANSTA, CONN_AJANS, META, 1)).rejects.toThrow(/2 workspace'i besliyor/);
    expect(iptal).not.toHaveBeenCalled();
    expect(await durum()).toBe('active');
  });
});

describe('KRİTİK: izleme TEK KARARLA kapanıyor — başka şirkete ödünç verilenler dahil', () => {
  it('iki şirketteki iki hesap ve sayfa kapanıyor, atamalar kalıyor', async () => {
    const r = await svc.disconnect(AJANSTA, CONN_AJANS, META, 2);
    expect(r).toEqual({ ok: true, adAccounts: 2, socialProfiles: 1 });
    expect(iptal).toHaveBeenCalledTimes(1);
    expect(await durum()).toBe('revoked');
    expect(await acikHesaplar()).toEqual([]);
    const [s] = await h.q<{ sync_enabled: boolean }>('SELECT sync_enabled FROM social_profiles WHERE id = $1', [SAYFA_BILTAS]);
    expect(s?.sync_enabled).toBe(false);
    // Atama silinmiyor: yeniden bağlanınca `resumeSync` aynı izlemeyi açar.
    const atamalar = await h.q<{ client_id: string }>(
      `SELECT client_id::text FROM ad_accounts WHERE connection_id = $1 AND client_id IS NOT NULL ORDER BY id`,
      [CONN_AJANS],
    );
    expect(atamalar.map((a) => a.client_id)).toEqual([WS_PROFAJ, WS_BILTAS]);
  });

  it('iz: connection.revoked kaç satırın durduğunu yazıyor', async () => {
    await svc.disconnect(AJANSTA, CONN_AJANS, META, 2);
    const [k] = await h.q<{ action: string; org_id: string; after: Record<string, number> }>(
      `SELECT action, org_id::text, after FROM audit_logs WHERE target_id = $1`,
      [CONN_AJANS],
    );
    expect(k).toEqual({
      action: 'connection.revoked',
      org_id: ORG_AJANS,
      after: { workspaceSayisi: 2, kapananHesap: 2, kapananSayfa: 1 },
    });
  });
});
