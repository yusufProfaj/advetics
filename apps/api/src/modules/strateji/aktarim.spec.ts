import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolvePermissions, V1_AKTARIM_KAPALI_SEBEBI, type TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AppConfig } from '../../config/configuration';
import { StratejiService, yapilabilirEylemler } from './strateji.service';
import type { StratejiKelimeKuyrugu } from './kelime-kuyrugu';

/**
 * AKTARIM — 2026-10-13'ten beri KAPALI. Gerçek şema (PGlite).
 *
 * Eski aktarım `adv_oturum`a (kaldırılmış AdvCampaign sohbeti) yazıyordu;
 * okuyan ekran yoktu ve kullanıcı "aktarıldı" görüp AdvCampaign'de hiçbir
 * şey bulamıyordu. Yeni aktarım (kalem → rehber taslağı):
 * docs/advstrategy/YENIDEN-TASARIM.md § 4.
 */
let h: Harness;
let svc: StratejiService;

const KARDES_ORG = 'cccccccc-0000-4000-8000-00000000000c';
const KARDES_WS = 'cccccccc-0000-4000-8000-0000000000c1';
const KITLE = '77777777-0000-4000-8000-000000000001';
const KARDES_KITLE = '77777777-0000-4000-8000-0000000000c1';
const V1 = '88888888-0000-4000-8000-000000000001';
const V2 = '88888888-0000-4000-8000-000000000002';

const AJANS = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client, KARDES_WS],
  activeClientId: IDS.client,
  isOrgAdmin: true,
  tumSirketler: false,
  role: 'admin',
  permissions: [...resolvePermissions('admin')],
} as unknown as TenantContext;

const CONFIG = {
  yapayZeka: { model: 'gemini-test' },
  uploads: { dir: '/tmp' },
  platforms: { meta: { apiVersion: 'v25.0' } },
} as unknown as AppConfig;

beforeAll(async () => {
  h = await createHarness();
  const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
  svc = new StratejiService(prisma, { ekle: async () => undefined } as unknown as StratejiKelimeKuyrugu, CONFIG);
}, 60_000);
afterAll(async () => h?.close());
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Kardeş', 'kardes', now())`, [KARDES_ORG]);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Kardeş WS', 'kardes-ws', now())`, [KARDES_WS, KARDES_ORG]);
  await h.q(
    `INSERT INTO audience_templates (id, org_id, client_id, name, platform, updated_at)
     VALUES ($1, $3, $4, 'İzmir kadın 25-44', 'meta', now()), ($2, $5, $6, 'Kardeş kitlesi', 'meta', now())`,
    [KITLE, KARDES_KITLE, IDS.org, IDS.client, KARDES_ORG, KARDES_WS],
  );
  await h.q(
    `INSERT INTO assets (id, org_id, client_id, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $3, $4, 'Kare', 'a.jpg', 'image/jpeg', 1, 1080, 1080, 'k/a', 'aaaaaaaaaaaaaaaa1', now()),
            ($2, $3, $4, 'Dikey', 'b.jpg', 'image/jpeg', 1, 1080, 1920, 'k/b', 'aaaaaaaaaaaaaaaa2', now())`,
    [V1, V2, IDS.org, IDS.client],
  );
});

type MatrisGirdisi = Parameters<StratejiService['matrisKaydet']>[2]['satirlar'][number];
const satir = (o: Partial<MatrisGirdisi> = {}): MatrisGirdisi => ({
  platform: 'meta',
  katman: 'soguk',
  niyet: 'FORM',
  kitleSablonuId: KITLE,
  kelimeGrubu: null,
  varlikIdleri: [V1, V2],
  tutar: '10.000',
  ...o,
});

/** Onaylanmış plan: dağılım + verilen matris satırları, onaya gönderilmiş ve onaylanmış. */
async function onayliPlan(satirlar: MatrisGirdisi[], ctx = AJANS, clientId: string = IDS.client) {
  const d = await svc.olustur(ctx, { clientId, donem: '2026-11', toplamButce: '100.000', paraBirimi: 'TRY' });
  await svc.dagilimKaydet(ctx, d.plan.id, {
    surum: 1,
    satirlar: [
      { platform: 'meta', katman: 'soguk', tutar: '50.000' },
      { platform: 'google', katman: 'soguk', tutar: '20.000' },
    ],
  });
  await svc.matrisKaydet(ctx, d.plan.id, { surum: 2, satirlar });
  await svc.eylem(ctx, d.plan.id, { eylem: 'onaya_gonder', surum: 3 });
  await svc.onayla(ctx, d.plan.id, 3);
  return d.plan.id;
}

const oturumlar = () =>
  h.q<{ id: string; org_id: string; client_id: string; user_id: string; baslik: string; hazir_istem: string; hazir_medyalar: string[]; strateji_matris_id: string; model: string }>(
    `SELECT id::text, org_id::text, client_id::text, user_id::text, baslik, hazir_istem, hazir_medyalar::text[] AS hazir_medyalar,
            strateji_matris_id::text, model
       FROM adv_oturum ORDER BY baslik`,
  );

describe('aktarım KAPALI (V1_AKTARIM_KAPALI_SEBEBI, 2026-10-13)', () => {
  /*
   * Eski aktarım `adv_oturum`a yazıyordu ve o tabloyu okuyan ekran yok:
   * plan "aktarıldı" oluyor, AdvCampaign'de taslak açılmıyordu. Bu testler
   * kapının GERÇEKTEN kapalı olduğunu kilitler: ret, plana ve tabloya
   * dokunmadan; düğme hiç çizilmez.
   */
  it('KRİTİK: onaylı planın aktarımı NEDENİYLE reddedilir; oturum açılmaz, plan onaylandi kalır', async () => {
    const id = await onayliPlan([satir(), satir({ niyet: 'SITE', tutar: '5.000' })]);
    await expect(svc.eylem(AJANS, id, { eylem: 'aktar', surum: 3 })).rejects.toMatchObject({
      status: 400,
      message: V1_AKTARIM_KAPALI_SEBEBI,
    });
    expect(await oturumlar()).toHaveLength(0);
    const d = await svc.detay(AJANS, id);
    expect(d.plan.durum).toBe('onaylandi');
    expect(d.plan.aktarim).toBeNull();
  });

  it('KRİTİK: tam yetkili ajans bile onaylı planda "aktar" eylemini görmez (düğme çizilmez)', async () => {
    const id = await onayliPlan([satir()]);
    expect((await svc.detay(AJANS, id)).yapilabilir).not.toContain('aktar');
    expect(yapilabilirEylemler('onaylandi', [...resolvePermissions('admin')])).not.toContain('aktar');
    // Kapı yalnız aktarımı kapatıyor; onaylı planın iptali yerinde.
    expect(yapilabilirEylemler('onaylandi', [...resolvePermissions('admin')])).toContain('iptal');
  });

  it('KRİTİK: ret istek ne olursa olsun AYNI cümle (bayat sürüm, yetkisiz, başka plan)', async () => {
    const id = await onayliPlan([satir()]);
    const yalnizPlan = { ...AJANS, permissions: AJANS.permissions.filter((i) => i !== 'bulk.write') } as TenantContext;
    for (const [ctx, pid, surum] of [
      [AJANS, id, 2],
      [yalnizPlan, id, 3],
      [AJANS, '00000000-0000-4000-8000-000000000000', 3],
    ] as const) {
      await expect(svc.eylem(ctx, pid, { eylem: 'aktar', surum })).rejects.toMatchObject({ message: V1_AKTARIM_KAPALI_SEBEBI });
    }
    expect(await oturumlar()).toHaveLength(0);
  });

  it('KRİTİK: strateji modülünün kaynağında adv_oturum YAZIMI yok', () => {
    const kaynak = readFileSync(join(__dirname, 'strateji.service.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    // Gövde gerçekten okundu (boş dilim "yok" iddiasını her zaman doğru yapardı).
    expect(kaynak).toContain('async aktar(');
    expect(kaynak).not.toMatch(/INSERT\s+INTO\s+adv_oturum/i);
  });
});
