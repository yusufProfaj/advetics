import { ConflictException, ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext, UpdateClientInput } from '@advetics/shared';
import { ORG_ADMIN_KEY, PERMISSIONS_KEY } from '../../common/decorators';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { createHarness, type Harness } from '../../../test/pglite-harness';
import { ClientsController } from './clients.controller';
import { ClientsService, DURUM_KAPISI_MESAJI, durumYazabilirMi } from './clients.service';

/**
 * ═══ WORKSPACE ARŞİVİ — LİSTE, GERİ AL, ARKA KAPI (MIMARI Ç-4) ═══
 *
 * Üç boşluk vardı ve üçü de sessizdi:
 *
 *   1. Arşivlenen workspace panelden bir daha HİÇ görünmüyordu: `GET
 *      /clients` arşivlileri bilerek eliyor ve arşivi listeleyen bir uç yoktu.
 *   2. Geri alma ucu yoktu; eski pencere "durumu aktif yap" diyordu ve o
 *      alanı gösteren ekran yoktu.
 *   3. `PATCH /clients/:id` `status` alanını `client.write` ile kabul
 *      ediyordu: arşiv kapısı (`client.delete` + org yöneticisi) arka
 *      kapıdan aşılabiliyordu.
 */

const CTX_YONETICI: TenantContext = {
  orgId: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  clientIds: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],
  activeClientId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  isOrgAdmin: true,
  permissions: ['client.read', 'client.write', 'client.delete'],
} as TenantContext;

/** Reklam yöneticisi: `client.write` var, `client.delete` ve org yöneticiliği yok. */
const CTX_REKLAM_YONETICISI: TenantContext = {
  ...CTX_YONETICI,
  isOrgAdmin: false,
  permissions: ['client.read', 'client.write'],
} as TenantContext;

const META = { ip: null, userAgent: null, requestId: 'test' };

// ─────────────────────────────────────────────────────────────────────────────
// 1. Servis — sahte transaction (sınanan: kapı ve UPDATE'e geçen alanlar)
// ─────────────────────────────────────────────────────────────────────────────

interface Kayit {
  withTenantCagrisi: TenantContext[];
  yazilan: Record<string, unknown> | null;
  denetim: Array<Record<string, unknown>>;
  findManyArg: Record<string, unknown> | null;
}

function servis(mevcutDurum = 'archived'): { svc: ClientsService; k: Kayit } {
  const k: Kayit = { withTenantCagrisi: [], yazilan: null, denetim: [], findManyArg: null };
  const tx = {
    client: {
      findUnique: async () => ({
        id: 'c1',
        name: 'Ege',
        slug: 'ege',
        timezone: 'Europe/Istanbul',
        reportingCurrency: 'TRY',
        status: mevcutDurum,
        archivedAt: mevcutDurum === 'archived' ? new Date('2026-10-01T00:00:00Z') : null,
      }),
      findMany: async (arg: Record<string, unknown>) => {
        k.findManyArg = arg;
        return [
          { id: 'c1', name: 'Ege', slug: 'ege', archivedAt: new Date('2026-10-01T00:00:00Z'), _count: { adAccounts: 2 } },
          { id: 'c2', name: 'Eski', slug: 'eski', archivedAt: null, _count: { adAccounts: 0 } },
        ];
      },
      update: async ({ data }: { data: Record<string, unknown> }) => {
        k.yazilan = data;
        return { id: 'c1', name: 'Ege', slug: 'ege', timezone: 'Europe/Istanbul', reportingCurrency: 'TRY', status: 'active', ...data };
      },
    },
  };
  const prisma = {
    withTenant: async <T>(c: TenantContext, fn: (t: unknown) => Promise<T>) => {
      k.withTenantCagrisi.push(c);
      return fn(tx);
    },
  } as unknown as PrismaService;
  const audit = {
    record: async (_tx: unknown, _ctx: unknown, e: Record<string, unknown>) => {
      k.denetim.push(e);
    },
  } as unknown as AuditService;
  return { svc: new ClientsService(prisma, audit), k };
}

describe('KRİTİK: PATCH status arka kapısı — 403, sessiz yok sayma değil', () => {
  it('reklam yöneticisi status gönderince 403 ve veritabanına HİÇ gidilmiyor', async () => {
    const { svc, k } = servis('active');
    await expect(
      svc.update(CTX_REKLAM_YONETICISI, 'c1', { status: 'archived' } as UpdateClientInput, META),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(k.withTenantCagrisi).toHaveLength(0);
    expect(k.yazilan).toBeNull();
  });

  it('mesaj neden ve yeri söylüyor', async () => {
    const { svc } = servis('active');
    await expect(
      svc.update(CTX_REKLAM_YONETICISI, 'c1', { status: 'paused' } as UpdateClientInput, META),
    ).rejects.toThrow(DURUM_KAPISI_MESAJI);
  });

  it('org yöneticisi olup client.delete taşımayan da reddediliyor (iki koşul birlikte)', async () => {
    const ctx = { ...CTX_YONETICI, permissions: ['client.read', 'client.write'] } as TenantContext;
    expect(durumYazabilirMi(ctx)).toBe(false);
    const { svc } = servis('active');
    await expect(svc.update(ctx, 'c1', { status: 'archived' } as UpdateClientInput, META)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('client.delete taşıyıp org yöneticisi OLMAYAN reddediliyor', () => {
    expect(
      durumYazabilirMi({ isOrgAdmin: false, permissions: ['client.write', 'client.delete'] } as TenantContext),
    ).toBe(false);
  });

  it('yönetici status yazabiliyor; arşivden çıkan satırın archived_at’i temizleniyor', async () => {
    const { svc, k } = servis('archived');
    await svc.update(CTX_YONETICI, 'c1', { status: 'active' } as UpdateClientInput, META);
    expect(k.yazilan).toMatchObject({ status: 'active', archivedAt: null });
  });

  it('status taşımayan düzenleme reklam yöneticisine AÇIK kalıyor (kapı yalnız status için)', async () => {
    const { svc, k } = servis('active');
    await svc.update(CTX_REKLAM_YONETICISI, 'c1', { contactName: 'Ayşe' } as UpdateClientInput, META);
    expect(k.yazilan).toMatchObject({ contactName: 'Ayşe' });
    expect(k.yazilan).not.toHaveProperty('status');
    expect(k.yazilan).not.toHaveProperty('archivedAt');
  });
});

describe('arşivden geri al', () => {
  it('KRİTİK: durumu active, archived_at’i NULL yapıyor ve denetim kaydı yazıyor', async () => {
    const { svc, k } = servis('archived');
    await svc.restore(CTX_YONETICI, 'c1', META);
    expect(k.yazilan).toEqual({ status: 'active', archivedAt: null });
    expect(k.denetim).toHaveLength(1);
    expect(k.denetim[0]).toMatchObject({
      action: 'client.restored',
      targetType: 'client',
      targetId: 'c1',
      clientId: 'c1',
      before: { status: 'archived', archivedAt: '2026-10-01T00:00:00.000Z' },
      after: { status: 'active' },
    });
  });

  it('KRİTİK: seçili workspace daraltması kapalı (activeClientId: null)', async () => {
    const { svc, k } = servis('archived');
    await svc.restore(CTX_YONETICI, 'c1', META);
    expect(k.withTenantCagrisi[0]?.activeClientId).toBeNull();
  });

  it('arşivde olmayan workspace 409 — yazma ve denetim kaydı YOK', async () => {
    const { svc, k } = servis('active');
    await expect(svc.restore(CTX_YONETICI, 'c1', META)).rejects.toBeInstanceOf(ConflictException);
    expect(k.yazilan).toBeNull();
    expect(k.denetim).toHaveLength(0);
  });
});

describe('arşiv listesi', () => {
  it('yalnız arşivlileri istiyor, tarihi ISO dizgesine çeviriyor ve hesap sayısını taşıyor', async () => {
    const { svc, k } = servis();
    const liste = await svc.listArchived(CTX_YONETICI);
    expect(k.findManyArg).toMatchObject({ where: { status: 'archived' } });
    expect(k.withTenantCagrisi[0]?.activeClientId).toBeNull();
    expect(liste).toEqual([
      { id: 'c1', name: 'Ege', slug: 'ege', archivedAt: '2026-10-01T00:00:00.000Z', _count: { adAccounts: 2 } },
      { id: 'c2', name: 'Eski', slug: 'eski', archivedAt: null, _count: { adAccounts: 0 } },
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Uç — kapı ve yönlendirme
// ─────────────────────────────────────────────────────────────────────────────

describe('KRİTİK: uç kapıları', () => {
  const meta = (m: keyof ClientsController) =>
    ({
      izinler: Reflect.getMetadata(PERMISSIONS_KEY, ClientsController.prototype[m]) as string[] | undefined,
      orgYoneticisi: Reflect.getMetadata(ORG_ADMIN_KEY, ClientsController.prototype[m]) as boolean | undefined,
    });

  it('geri al = arşivle: client.delete + org yöneticisi (panelde workspace.geriAl)', () => {
    expect(meta('geriAl')).toEqual({ izinler: ['client.delete'], orgYoneticisi: true });
    expect(meta('archive')).toEqual(meta('geriAl'));
  });

  it('arşiv listesi normal listeyle aynı kapı (client.read)', () => {
    expect(meta('list')).toEqual({ izinler: ['client.read'], orgYoneticisi: undefined });
  });

  it('?arsiv=1 arşivi, başka her değer normal listeyi döndürüyor', async () => {
    const cagri: string[] = [];
    const c = new ClientsController(
      {
        list: async () => {
          cagri.push('list');
          return [];
        },
        listArchived: async () => {
          cagri.push('arsiv');
          return [];
        },
      } as unknown as ClientsService,
      {} as never,
      {} as never,
      {} as never,
    );
    await c.list(CTX_YONETICI, '1');
    await c.list(CTX_YONETICI, undefined);
    await c.list(CTX_YONETICI, 'evet');
    expect(cagri).toEqual(['arsiv', 'list', 'list']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. RLS — politika GERÇEKTEN açık (SET ROLE + RETURNING, CLAUDE.md deseni)
// ─────────────────────────────────────────────────────────────────────────────

let h: Harness;
const ORG = '11111111-1111-1111-1111-111111111111';
const ORG_BASKA = '1e1e1e1e-1e1e-1e1e-1e1e-1e1e1e1e1e1e';
const USER = '22222222-2222-2222-2222-222222222222';
const WS_AKTIF = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const WS_ARSIV = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const WS_BASKA_ARSIV = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const APP_ROLE = 'advetics_arsiv_rls_test';

interface Ctx {
  clientIds: string[];
  isOrgAdmin: boolean;
}

async function asUser<T = Record<string, unknown>>(sql: string, ctx: Ctx): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id',           '${ORG}', false),
           set_config('app.current_user_id',          '${USER}', false),
           set_config('app.current_client_ids',       '${ctx.clientIds.join(',')}', false),
           set_config('app.is_org_admin',             '${ctx.isOrgAdmin ? 'on' : 'off'}', false),
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
 * OTURUMUN `clientIds`i ARŞİVLİLERİ İÇERMİYOR (`tenant-context.service.ts`
 * `status: { not: 'archived' }`). Testin bağlamı bunu taklit ediyor:
 * yöneticinin listesinde de arşivli yok, onu gösteren `is_org_admin()`.
 */
const YONETICI: Ctx = { clientIds: [WS_AKTIF], isOrgAdmin: true };
const REKLAM_YONETICISI: Ctx = { clientIds: [WS_AKTIF], isOrgAdmin: false };

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  await h.q(`ALTER TABLE clients ENABLE ROW LEVEL SECURITY`);
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await h.q(
    `INSERT INTO organizations (id, name, slug, updated_at)
     VALUES ($1, 'Ajans', 'ajans', now()), ($2, 'Başka', 'baska', now())`,
    [ORG, ORG_BASKA],
  );
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, status, archived_at, updated_at)
     VALUES ($1, $4, 'Aktif', 'aktif', 'active', NULL, now()),
            ($2, $4, 'Arşivli', 'arsivli', 'archived', now(), now()),
            ($3, $5, 'Başkasının arşivi', 'baska-arsiv', 'archived', now(), now())`,
    [WS_AKTIF, WS_ARSIV, WS_BASKA_ARSIV, ORG, ORG_BASKA],
  );
});

const ARSIV_SORGUSU = `SELECT name FROM clients WHERE status = 'archived' ORDER BY name`;
const geriAlSql = (id: string) =>
  `UPDATE clients SET status = 'active', archived_at = NULL WHERE id = '${id}' RETURNING id`;

describe('KRİTİK: arşiv RLS — liste ve geri alma aynı sınırda', () => {
  it('org yöneticisi KENDİ şirketinin arşivini görüyor, başka şirketinkini görmüyor', async () => {
    const satirlar = await asUser<{ name: string }>(ARSIV_SORGUSU, YONETICI);
    expect(satirlar.map((s) => s.name)).toEqual(['Arşivli']);
  });

  it('org yöneticisi olmayan arşivi GÖRMÜYOR (oturum listesinde arşivli yok)', async () => {
    expect(await asUser(ARSIV_SORGUSU, REKLAM_YONETICISI)).toEqual([]);
  });

  it('KRİTİK: yöneticinin geri alması GERÇEKTEN bir satırı değiştiriyor (RETURNING ile sayıldı)', async () => {
    const r = await asUser<{ id: string }>(geriAlSql(WS_ARSIV), YONETICI);
    expect(r).toEqual([{ id: WS_ARSIV }]);
    const [satir] = await h.q<{ status: string; archived_at: string | null }>(
      `SELECT status, archived_at FROM clients WHERE id = $1`,
      [WS_ARSIV],
    );
    expect(satir).toEqual({ status: 'active', archived_at: null });
  });

  it('KRİTİK: başka şirketin arşivi geri alınamıyor — sıfır satır, veri değişmedi', async () => {
    expect(await asUser(geriAlSql(WS_BASKA_ARSIV), YONETICI)).toEqual([]);
    const [satir] = await h.q<{ status: string }>(`SELECT status FROM clients WHERE id = $1`, [WS_BASKA_ARSIV]);
    expect(satir?.status).toBe('archived');
  });

  it('yönetici olmayanın UPDATE’i sıfır satır (uç zaten 403; RLS ikinci hat)', async () => {
    expect(await asUser(geriAlSql(WS_ARSIV), REKLAM_YONETICISI)).toEqual([]);
  });
});
