import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import { kreatifTohumla } from '../../../test/kreatif-tohum';
import type { PrismaService } from '../../prisma/prisma.service';
import type { KreatifAdresiService } from './kreatif-adresi.service';
import { kreatifGorseliAkit } from './kreatif-gorsel-akisi';

/**
 * ═══ ORTAK KREATİF GÖRSELİ AKIŞI — REKLAM KİMLİĞİ YOLU (2026-10-14) ═══
 *
 * Reklam Yöneticisi önizlemesi ölü Meta adresi yüzünden "görsel alınamadı"
 * diyordu; `GET /ads/:id/gorsel` aynı çekirdeği REKLAM kimliğiyle çağırıyor.
 * Kreatif kimliği yolu `kreatif-zeka.service.spec.ts`te.
 */
let h: Harness;
const GUNLER = ['2026-10-01'];
const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], activeClientId: null, isOrgAdmin: true } as unknown as TenantContext;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h, { platform: 'meta' });
});

const prisma = () => ({ withTenant: vi.fn(async (_c: TenantContext, fn: (tx: unknown) => Promise<unknown>) => fn(h.db)) }) as unknown as PrismaService;

describe('kreatifGorseliAkit — reklam kimliğiyle', () => {
  it('KRİTİK: reklamdan kreatife iniyor ve O kreatifin adresini tazeliyor', async () => {
    const t = await kreatifTohumla(h, { objective: 'OUTCOME_SALES', gunler: GUNLER });
    const adres = { hesapAdresleri: vi.fn(async (..._a: unknown[]) => ({ adresler: new Map([[t.externalId, { hata: 'sunucu 403' }]]), kotaEngeli: null })) };
    await expect(kreatifGorseliAkit(prisma(), adres as unknown as KreatifAdresiService, CTX, { adId: t.adId }, 'reklam_onizleme_gorsel')).rejects.toThrow(
      'Görsel alınamadı: sunucu 403',
    );
    // Doğru kreatif soruldu; katman anonim tetiklenebilir trafikle aynı (%50).
    expect(adres.hesapAdresleri.mock.calls[0]![1]).toEqual([t.externalId]);
    expect(adres.hesapAdresleri.mock.calls[0]![2]).toMatchObject({ katman: 'report_creative', etiket: 'reklam_onizleme_gorsel' });
  });

  it('başka workspace’in reklamı: platforma hiç gidilmeden "bulunamadı"', async () => {
    const t = await kreatifTohumla(h, { objective: 'OUTCOME_SALES', gunler: GUNLER });
    const adres = { hesapAdresleri: vi.fn() };
    const yabanci = { ...CTX, clientIds: ['99999999-0000-4000-8000-000000000000'] } as TenantContext;
    await expect(kreatifGorseliAkit(prisma(), adres as unknown as KreatifAdresiService, yabanci, { adId: t.adId }, 'x')).rejects.toThrow('Kreatif bulunamadı');
    expect(adres.hesapAdresleri).not.toHaveBeenCalled();
  });

  it('kreatifi olmayan reklam "bulunamadı" (boş görsel değil)', async () => {
    const t = await kreatifTohumla(h, { objective: 'OUTCOME_SALES', gunler: GUNLER });
    await h.q(`UPDATE ads SET creative_id = NULL WHERE id = $1`, [t.adId]);
    await expect(kreatifGorseliAkit(prisma(), { hesapAdresleri: vi.fn() } as unknown as KreatifAdresiService, CTX, { adId: t.adId }, 'x')).rejects.toThrow(
      'Kreatif bulunamadı',
    );
  });
});

describe('reklam görsel ucu (kaynak taraması)', () => {
  const KAYNAK = readFileSync(join(__dirname, '../ads/ads.controller.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  it('KRİTİK: insights.read ile açık (müşteri hesabı önizlemeyi görüyor) ve ortak çekirdeği reklam kimliğiyle çağırıyor', () => {
    const i = KAYNAK.indexOf("@Get(':id/gorsel')");
    if (i < 0) throw new Error('görsel ucu bulunamadı — tarama boşa düştü');
    const govde = KAYNAK.slice(i, KAYNAK.indexOf('\n  }\n', i));
    expect(govde).toContain("@RequirePermissions('insights.read')");
    expect(govde).toContain('kreatifGorseliAkit(this.prisma, this.adres, ctx, { adId: id }');
  });
});
