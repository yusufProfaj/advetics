import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  PAYLASIM_EN_UZUN_GUN,
  PAYLASIM_GECMIS_GUN,
  gunEkle,
  paylasimAraligiKarari,
  paylasimAraligiSchema,
  paylasimSiniri,
  type ReportData,
  type TenantContext,
} from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { KreatifAdresiService } from './kreatif-adresi.service';
import type { DonemErisimiService } from '../erisim/donem-erisimi.service';
import { ReportsService } from './reports.service';
import { ShareService } from './share.service';

/**
 * ═══ PAYLAŞIM LİNKİNDE TARİH ARALIĞI (2026-10-21) ═══
 *
 * Link artık `?from&to` alıyor. Sınanan üç şey:
 *  1. Adres doğrulaması: ikisi birden, gerçek takvim günü, sıralı.
 *  2. Sınır (3 yıl geri, bugün, 400 gün) sunucuda ve sınırın KENDİSİ dahil.
 *  3. KAPSAM: aralık workspace'i değiştiremez. Aynı şirketin başka bir
 *     workspace'inin verisi aynı günlerde dururken token yalnız kendi
 *     workspace'ini sayar; kiracı bağlamı paylaşım kaydından kuruluyor.
 */

const BUGUN = '2026-10-21';

describe('paylasimAraligiSchema — adres doğrulaması', () => {
  it('aralıksız istek geçer (paylaşılan dönem)', () => {
    expect(paylasimAraligiSchema.safeParse({}).success).toBe(true);
  });
  it('KRİTİK: yalnız biri verilirse reddedilir (sessizce paylaşılan bitişle birleşmez)', () => {
    expect(paylasimAraligiSchema.safeParse({ from: '2026-09-01' }).success).toBe(false);
    expect(paylasimAraligiSchema.safeParse({ to: '2026-09-01' }).success).toBe(false);
  });
  it('takvimde olmayan gün ve ters aralık reddedilir', () => {
    expect(paylasimAraligiSchema.safeParse({ from: '2026-02-31', to: '2026-03-02' }).success).toBe(false);
    expect(paylasimAraligiSchema.safeParse({ from: '2026-9-1', to: '2026-09-02' }).success).toBe(false);
    expect(paylasimAraligiSchema.safeParse({ from: '2026-09-10', to: '2026-09-01' }).success).toBe(false);
    expect(paylasimAraligiSchema.safeParse({ from: '2026-09-01', to: '2026-09-01' }).success).toBe(true);
  });
});

describe('paylasimAraligiKarari — sınır', () => {
  const s = paylasimSiniri(BUGUN);
  it('sınır değerleri: 3 yıl geri, bugün, 400 gün', () => {
    expect(s).toEqual({ enErken: gunEkle(BUGUN, -PAYLASIM_GECMIS_GUN), enGec: BUGUN, enUzunGun: 400 });
    expect(PAYLASIM_GECMIS_GUN).toBe(1095);
  });
  it('KRİTİK: en erken gün dahil, bir gün öncesi "erken"', () => {
    expect(paylasimAraligiKarari({ from: s.enErken, to: gunEkle(s.enErken, 10) }, BUGUN)).toEqual({ tamam: true });
    expect(paylasimAraligiKarari({ from: gunEkle(s.enErken, -1), to: gunEkle(s.enErken, 10) }, BUGUN)).toMatchObject({ tamam: false, ret: 'erken' });
  });
  it('KRİTİK: bugün dahil, yarın "gec"', () => {
    expect(paylasimAraligiKarari({ from: '2026-10-01', to: BUGUN }, BUGUN)).toEqual({ tamam: true });
    expect(paylasimAraligiKarari({ from: '2026-10-01', to: '2026-10-22' }, BUGUN)).toMatchObject({ tamam: false, ret: 'gec' });
  });
  it('KRİTİK: 400 gün geçer, 401 "uzun"', () => {
    expect(paylasimAraligiKarari({ from: gunEkle(BUGUN, -(PAYLASIM_EN_UZUN_GUN - 1)), to: BUGUN }, BUGUN)).toEqual({ tamam: true });
    expect(paylasimAraligiKarari({ from: gunEkle(BUGUN, -PAYLASIM_EN_UZUN_GUN), to: BUGUN }, BUGUN)).toMatchObject({ tamam: false, ret: 'uzun' });
  });
});

describe('ShareService.readByToken — kapsam ve aralık (PGlite)', () => {
  let h: Harness;
  let svc: ShareService;
  let baglamlar: TenantContext[];

  const KOMSU = '22222222-2222-2222-2222-2222222222b2';
  const KOMSU_BAGLANTI = '33333333-3333-3333-3333-3333333333b3';
  const KOMSU_HESAP = '44444444-4444-4444-4444-4444444444b4';
  const SABLON = '66666666-0000-4000-8000-000000000001';
  const TOKEN = 'paylasim-araligi-test-tokeni';

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await h.close();
  });

  beforeEach(async () => {
    await h.reset();
    await seedTenant(h);
    // AYNI ŞİRKETİN İKİNCİ WORKSPACE'İ: token'ın açmaması gereken veri.
    await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Komşu', 'komsu', now())`, [KOMSU, IDS.org]);
    await h.q(
      `INSERT INTO platform_connections (id, org_id, client_id, platform, status, external_user_id, account_label,
         access_token_enc, granted_scopes, connected_by_user_id, updated_at)
       VALUES ($1, $2, $3, 'meta', 'active', 'u2', 'Komşu', '\\x00', '{}', $4, now())`,
      [KOMSU_BAGLANTI, IDS.org, KOMSU, IDS.user],
    );
    await h.q(
      `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, sync_enabled, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', 'act_komsu', 'Komşu hesap', 'TRY', 'Europe/Istanbul', true, now())`,
      [KOMSU_HESAP, IDS.org, KOMSU, KOMSU_BAGLANTI],
    );
    await h.q(
      `INSERT INTO report_templates (id, org_id, client_id, name, sections, status, updated_at)
       VALUES ($1, $2, $3, 'Şablon', '["summary"]'::jsonb, 'published', now())`,
      [SABLON, IDS.org, IDS.client],
    );
    await h.q(
      `INSERT INTO report_shares (id, template_id, org_id, client_id, token_hash, date_from, date_to)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, '2026-09-01', '2026-09-30')`,
      [SABLON, IDS.org, IDS.client, createHash('sha256').update(TOKEN).digest('hex')],
    );

    baglamlar = [];
    const reports = new ReportsService(
      {
        withTenant: async <T>(c: TenantContext, fn: (tx: unknown) => Promise<T>) => {
          baglamlar.push(c);
          return fn(h.db);
        },
      } as unknown as PrismaService,
      { tazele: async (_c: TenantContext, d: ReportData) => d } as unknown as KreatifAdresiService,
      { oku: async () => ({ tur: 'okunamadi', neden: 'test: platform yok' }) } as unknown as DonemErisimiService,
    );
    // Yönetim bağlantısının bu servisin kullandığı iki çağrısı, gerçek tablodan.
    const admin = {
      reportShare: {
        findUnique: async ({ where }: { where: { tokenHash: string } }) => {
          const [r] = await h.q<Record<string, unknown>>(
            `SELECT id, org_id, client_id, template_id, date_from, date_to, expires_at, revoked_at
               FROM report_shares WHERE token_hash = $1`,
            [where.tokenHash],
          );
          return r
            ? {
                id: r.id, orgId: r.org_id, clientId: r.client_id, templateId: r.template_id,
                dateFrom: new Date(r.date_from as string | Date), dateTo: new Date(r.date_to as string | Date),
                expiresAt: r.expires_at, revokedAt: r.revoked_at,
              }
            : null;
        },
        update: async ({ where }: { where: { id: string } }) =>
          h.q(`UPDATE report_shares SET view_count = view_count + 1 WHERE id = $1`, [where.id]),
      },
    } as unknown as PrismaAdminService;
    svc = new ShareService({} as PrismaService, admin, reports);
  });

  async function gun(client: string, hesap: string, date: string, spend: string) {
    await h.q(
      `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date, breakdown_key,
         impressions, clicks, spend_micros, conversions, conversion_value_micros, currency, reach, raw_metrics)
       VALUES ($1, $2, 'meta', 'campaign', gen_random_uuid(), 'x', $3::date, '', 100, 1, $4, 0, 0, 'TRY', 0, '{}'::jsonb)`,
      [client, hesap, date, spend],
    );
  }
  const harcama = (d: ReportData) => d.daily.reduce((t, g) => t + BigInt(g.spendMicros), 0n);
  const sayac = async () => (await h.q<{ view_count: number }>(`SELECT view_count FROM report_shares`))[0]!.view_count;

  it('aralık verilmezse paylaşılan dönem; yanıt varsayılanı ve sınırı taşır', async () => {
    await gun(IDS.client, IDS.adAccount, '2026-09-10', '1000000');
    await gun(IDS.client, IDS.adAccount, '2026-10-05', '7000000');
    const d = await svc.readByToken(TOKEN, undefined, BUGUN);
    expect([d.from, d.to]).toEqual(['2026-09-01', '2026-09-30']);
    expect(harcama(d)).toBe(1_000_000n);
    expect(d.paylasim).toMatchObject({ varsayilanFrom: '2026-09-01', varsayilanTo: '2026-09-30', enGec: BUGUN, enUzunGun: 400 });
    expect(d.paylasim.veriAraligi).toBeUndefined();
  });

  it('KRİTİK: seçilen aralık uygulanır ama YALNIZ token\'ın workspace\'i sayılır', async () => {
    await gun(IDS.client, IDS.adAccount, '2026-10-05', '7000000');
    await gun(KOMSU, KOMSU_HESAP, '2026-10-05', '900000000');
    const d = await svc.readByToken(TOKEN, { from: '2026-10-01', to: '2026-10-20' }, BUGUN);
    expect([d.from, d.to]).toEqual(['2026-10-01', '2026-10-20']);
    // İki ayrı sorgu: günlük seri ve özet kartları (platform bloğu).
    expect(harcama(d)).toBe(7_000_000n);
    expect(d.platforms.map((b) => b.spendMicros)).toEqual(['7000000']);
    expect(d.client.id).toBe(IDS.client);
    // Kiracı bağlamı paylaşım kaydından: tek workspace, müşteri rolü.
    expect(baglamlar.length).toBeGreaterThan(0);
    for (const c of baglamlar) {
      expect(c.clientIds).toEqual([IDS.client]);
      expect(c.activeClientId).toBe(IDS.client);
      expect(c.role).toBe('client_viewer');
      expect(c.tumSirketler).toBe(false);
    }
  });

  it('KRİTİK: sınır dışı aralık 400 ve görüntüleme sayılmaz', async () => {
    const s = paylasimSiniri(BUGUN);
    await expect(svc.readByToken(TOKEN, { from: gunEkle(s.enErken, -1), to: '2026-01-01' }, BUGUN)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.readByToken(TOKEN, { from: '2026-10-01', to: '2026-10-22' }, BUGUN)).rejects.toThrow(/en geç/);
    await expect(svc.readByToken(TOKEN, { from: '2025-01-01', to: '2026-10-01' }, BUGUN)).rejects.toThrow(/en fazla 400/);
    expect(await sayac()).toBe(0);
  });

  it('geçersiz token aralık hatası değil 404 alır (linkin varlığı doğrulanmaz)', async () => {
    await expect(svc.readByToken('yok', { from: '2000-01-01', to: '2000-01-02' }, BUGUN)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('KRİTİK: boş dönemde veri aralığı yazılır ve komşu workspace\'in verisi KARIŞMAZ', async () => {
    await gun(IDS.client, IDS.adAccount, '2026-03-03', '1000000');
    await gun(IDS.client, IDS.adAccount, '2026-10-20', '1000000');
    await gun(KOMSU, KOMSU_HESAP, '2024-01-15', '1000000');
    const d = await svc.readByToken(TOKEN, { from: '2025-01-01', to: '2025-01-31' }, BUGUN);
    expect(d.daily).toEqual([]);
    expect(d.paylasim.veriAraligi).toEqual({ from: '2026-03-03', to: '2026-10-20' });
  });

  it('sınır içinde hiç veri yoksa veriAraligi null ("aranmadı" değil)', async () => {
    await gun(KOMSU, KOMSU_HESAP, '2026-10-05', '1000000');
    const d = await svc.readByToken(TOKEN, { from: '2026-10-01', to: '2026-10-20' }, BUGUN);
    expect(d.paylasim.veriAraligi).toBeNull();
  });
});
