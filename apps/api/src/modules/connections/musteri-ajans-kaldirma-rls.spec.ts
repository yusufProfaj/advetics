import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { AuditService } from '../audit/audit.service';
import { ConnectionsService } from './connections.service';

/**
 * ═══ MÜŞTERİ AJANSIN ATAMASINI KALDIRIYOR — GERÇEK RLS ALTINDA ═══
 *
 * Kullanıcının kararı (2026-09-28): müşteri ajansın atadığı hesabı
 * KALDIRABİLİR ama TAŞIYAMAZ, ve kaldırma iz bırakır (denetim kaydı + ajansa
 * mail).
 *
 * Varsayılan koşum ortamında RLS kapalı ve çözülen sorun orada HİÇ
 * görünmüyor: kaldırılan satır ajansın şirketine dönüyor, müşteri onu artık
 * göremiyor ve Postgres UPDATE'i "new row violates row-level security policy"
 * ile reddediyor. Bu paket politikaları `SET ROLE` ile gerçekten uyguluyor.
 *
 * TEK BAĞLANTI TUZAĞI: PGlite'ta tek oturum var. BYPASSRLS istemcisinin
 * taklidi her çağrıdan önce kısıtlı rolü BIRAKIP sonra GERİ ALIYOR; yoksa
 * "admin" yazması da RLS'e takılır ve test üretimi ölçmezdi.
 */
let h: Harness;
let svc: ConnectionsService;
const mail = vi.fn(async () => ({ alici: 'ajans@profaj.test' }));

const UST = 'aaaa0000-0000-0000-0000-0000000000aa';
const ORG_AJANS = '11111111-1111-1111-1111-111111111111';
const ORG_3A = '22222222-2222-2222-2222-222222222222';
const ORG_BILTAS = '33333333-3333-3333-3333-333333333333';
const WS_3A = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
const WS_3A_IKINCI = 'a2a2a2a2-a2a2-a2a2-a2a2-a2a2a2a2a2a2';
const WS_BILTAS = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';
const USER_AJANS = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
const USER_3A = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1';
const CONN_AJANS = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';
/** Ajansın bağlantısından gelen, 3A'ya atanmış hesap. Kaldırılacak olan. */
const ACC = '01010101-0101-0101-0101-010101010101';
/** Aynısı ama Biltaş'ta — 3A admininin dokunamaması gereken. */
const ACC_BILTAS = '02020202-0202-0202-0202-020202020202';
/** Ajansın bağlantısından gelen, 3A'ya atanmış sayfa. */
const SAYFA = '05050505-0505-0505-0505-050505050505';

const ROL = 'advetics_musteri_kaldirma_test';
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

/** 3A'nın admini — üst hesap üyeliği YOK. */
const ADMIN_3A = {
  orgId: ORG_3A,
  userId: USER_3A,
  clientIds: [WS_3A, WS_3A_IKINCI],
  activeClientId: null,
  isOrgAdmin: true,
  managerAccountId: null,
  tumSirketler: false,
  permissions: ['connection.write'],
} as unknown as TenantContext;

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
    null as never,
    new AuditService(admin),
    null as never,
    null as never,
    { enqueue: () => Promise.resolve({ enqueued: true }) } as never,
    {} as never,
    { degerlendir: () => { throw new Error('ödeme tetiği beklenmiyor'); } } as never,
    { gonder: mail } as never,
  );
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  mail.mockClear();
  mail.mockImplementation(async () => ({ alici: 'ajans@profaj.test' }));
  await h.q(
    `INSERT INTO manager_accounts (id, name, slug, status, updated_at)
     VALUES ($1, 'Profaj', 'profaj', 'active', now())`,
    [UST],
  );
  await h.q(
    `INSERT INTO organizations (id, name, slug, status, manager_account_id, updated_at)
     VALUES ($1, 'Profaj', 'profaj-org', 'active', $4, now()),
            ($2, '3A Makina', '3a', 'active', $4, now()),
            ($3, 'Biltaş', 'biltas', 'active', $4, now())`,
    [ORG_AJANS, ORG_3A, ORG_BILTAS, UST],
  );
  await h.q(`UPDATE manager_accounts SET ajans_org_id = $1 WHERE id = $2`, [ORG_AJANS, UST]);
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $4, '3A Makina', '3a-ws', now()),
            ($2, $4, '3A İkinci', '3a-ws2', now()),
            ($3, $5, 'Biltaş', 'biltas-ws', now())`,
    [WS_3A, WS_3A_IKINCI, WS_BILTAS, ORG_3A, ORG_BILTAS],
  );
  await h.q(
    `INSERT INTO users (id, org_id, email, full_name, updated_at)
     VALUES ($1, $3, 'y@profaj.com', 'Ajans', now()),
            ($2, $4, 'a@3a.com', '3A', now())`,
    [USER_AJANS, USER_3A, ORG_AJANS, ORG_3A],
  );
  await h.q(
    `INSERT INTO platform_connections
       (id, org_id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1, $2, NULL, 'meta', 'active', 'ajans-bm', 'Ajans BM', '\\x00', '{}', $3, now())`,
    [CONN_AJANS, ORG_AJANS, USER_AJANS],
  );
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, status, sync_enabled, updated_at)
     VALUES ($1, $3, $4, $6, 'meta', 'act_3a', '3A REKLAM', 'TRY', 'Europe/Istanbul', 'active', true, now()),
            ($2, $5, $7, $6, 'meta', 'act_b', 'BILTAS REKLAM', 'TRY', 'Europe/Istanbul', 'active', true, now())`,
    [ACC, ACC_BILTAS, ORG_3A, WS_3A, ORG_BILTAS, CONN_AJANS, WS_BILTAS],
  );
  await h.q(
    `INSERT INTO social_profiles
       (id, org_id, client_id, connection_id, profile_type, external_id, name, sync_enabled, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', 'page_3a', '3A SAYFA', true, now())`,
    [SAYFA, ORG_3A, WS_3A, CONN_AJANS],
  );
});

const hesap = async (id: string) =>
  (
    await h.q<{ org_id: string; client_id: string | null; sync_enabled: boolean }>(
      'SELECT org_id::text, client_id::text, sync_enabled FROM ad_accounts WHERE id = $1',
      [id],
    )
  )[0]!;

describe('KÖK SEBEP — neden BYPASSRLS', () => {
  it('KRİTİK: şirketin kendi RLS bağlamında satırı ajansa geri vermek REDDEDİLİYOR', async () => {
    /*
     * Bu iddia çözümün GEREKÇESİNİ belgeliyor. Politika bir gün değişip bu
     * UPDATE geçerse, dar BYPASSRLS dalına artık gerek yoktur ve buradaki
     * gerekçe yeniden okunmalı.
     */
    await baglam(ADMIN_3A);
    await h.q(`SET ROLE ${ROL}`);
    try {
      await expect(
        h.q(`UPDATE ad_accounts SET client_id = NULL, org_id = $1 WHERE id = $2`, [ORG_AJANS, ACC]),
      ).rejects.toThrow(/row-level security/);
    } finally {
      await h.q('RESET ROLE');
    }
  });
});

describe('şirket admini ajans atamasını KALDIRABİLİYOR', () => {
  it('KRİTİK: hesap ajansın havuzuna dönüyor, izleme kapanıyor', async () => {
    const r = await svc.assignAdAccount(ADMIN_3A, ACC, null, META);
    expect(r).toMatchObject({ changed: true, clientId: null, syncEnabled: false });
    expect(await hesap(ACC)).toEqual({ org_id: ORG_AJANS, client_id: null, sync_enabled: false });
  });

  it('KRİTİK: iz — denetim kaydı şirketin kendisinde ve workspace\'inde', async () => {
    await svc.assignAdAccount(ADMIN_3A, ACC, null, META);
    const kayit = await h.q<{ action: string; org_id: string; client_id: string; actor_id: string }>(
      `SELECT action, org_id::text, client_id::text, actor_id::text FROM audit_logs
        WHERE target_id = $1::text`,
      [ACC],
    );
    expect(kayit).toEqual([
      { action: 'ad_account.unassigned_by_client', org_id: ORG_3A, client_id: WS_3A, actor_id: USER_3A },
    ]);
  });

  it('KRİTİK: iz — ajansa mail gidiyor ve yanıt bunu söylüyor', async () => {
    const r = await svc.assignAdAccount(ADMIN_3A, ACC, null, META);
    expect(mail).toHaveBeenCalledTimes(1);
    const [konu, govde] = mail.mock.calls[0] as unknown as [string, string];
    expect(konu).toContain('3A Makina');
    expect(govde).toContain('3A REKLAM');
    expect(r).toMatchObject({ ajansaBildirildi: true });
  });

  it('KRİTİK: mail gitmezse kaldırma DURUYOR ama başarısızlık yazılıyor ve söyleniyor', async () => {
    mail.mockImplementation(async () => {
      throw new Error('SMTP reddetti');
    });
    const r = await svc.assignAdAccount(ADMIN_3A, ACC, null, META);
    expect(r).toMatchObject({ clientId: null, ajansaBildirildi: false });
    expect((await hesap(ACC)).client_id).toBeNull();
    const [not] = await h.q<{ action: string; after: { sebep: string } }>(
      `SELECT action, after FROM audit_logs WHERE action = 'ajans_bildirimi_gonderilemedi'`,
    );
    expect(not?.after.sebep).toContain('SMTP reddetti');
  });

  it('sayfa için de aynı dal', async () => {
    const r = await svc.assignSocialProfile(ADMIN_3A, SAYFA, null, META);
    expect(r).toMatchObject({ clientId: null, ajansaBildirildi: true });
    const [s] = await h.q<{ org_id: string; client_id: string | null }>(
      'SELECT org_id::text, client_id::text FROM social_profiles WHERE id = $1',
      [SAYFA],
    );
    expect(s).toEqual({ org_id: ORG_AJANS, client_id: null });
  });
});

describe('sınırlar HÂLÂ yerinde', () => {
  it('KRİTİK: şirket admini ajans hesabını kendi başka workspace\'ine TAŞIYAMIYOR', async () => {
    await expect(svc.assignAdAccount(ADMIN_3A, ACC, WS_3A_IKINCI, META)).rejects.toThrow(
      /yalnızca ajans/,
    );
    expect((await hesap(ACC)).client_id).toBe(WS_3A);
    expect(mail).not.toHaveBeenCalled();
  });

  it('KRİTİK: başka şirketin atanmış hesabına dokunamıyor', async () => {
    // RLS satırı zaten gizliyor; servis "bulunamadı" diyor, BYPASSRLS dalına
    // hiç girilmiyor.
    await expect(svc.assignAdAccount(ADMIN_3A, ACC_BILTAS, null, META)).rejects.toThrow(
      /bulunamadı/,
    );
    expect((await hesap(ACC_BILTAS)).client_id).toBe(WS_BILTAS);
    expect(mail).not.toHaveBeenCalled();
  });
});
