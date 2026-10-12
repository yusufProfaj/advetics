import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, IDS, seedTenant, type Harness } from '../../test/pglite-harness';
import { ayarAc } from '../../test/geri-besleme-tohum';
import type { PrismaAdminService } from '../prisma/prisma-admin.service';
import { LeadSyncService } from './lead-sync.service';

/**
 * ═══ YENİ LEAD → GEÇMİŞ + HAM LEAD, TEK DEYİM (Paket E, MIMARI § 5.1) ═══
 *
 * `persist` gerçek Postgres'te koşuyor (CTE'nin kendisi sınanıyor; kopyası
 * değil). KRİTİK: yalnız GERÇEKTEN yeni satırda geçmiş ve olay doğuyor;
 * mükerrer (webhook + tarama) ikinci bir olay üretmiyor; ayar kapalıyken
 * olay yok; 7 günden eski form olay üretmiyor ve sayılıyor.
 */
let h: Harness;
const PROFIL = '77777777-7777-4777-8777-777777777777';

type Persist = (
  profile: { id: string; clientId: string; orgId: string; pageToken: string },
  leads: Array<{ externalLeadId: string; externalFormId: string | null; externalAdId: string | null; fields: Array<{ name: string; value: string }>; submittedAt: Date }>,
  source: 'webhook' | 'reconcile',
) => Promise<{ yazilan: number; eskiOlay: number }>;

function persist(): Persist {
  const svc = new LeadSyncService(h.db as unknown as PrismaAdminService, {} as never, {} as never, {} as never);
  return (svc as unknown as { persist: Persist }).persist.bind(svc);
}

const PROFILE = { id: PROFIL, clientId: IDS.client, orgId: IDS.org, pageToken: 'x' };
const kayit = (id: string, submittedAt: Date) => ({
  externalLeadId: id,
  externalFormId: null,
  externalAdId: null,
  fields: [{ name: 'full_name', value: 'Ayşe Kaya' }],
  submittedAt,
});

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', 'fb-1', 'Sayfa', now())`,
    [PROFIL, IDS.org, IDS.client, IDS.connection],
  );
});

describe('persist', () => {
  it('KRİTİK: ayar açıkken yeni lead geçmiş + ham lead olayı (bekliyor, hemen) üretiyor; mükerrer üretmiyor', async () => {
    await ayarAc(h);
    const p = persist();
    const simdi = new Date();
    expect(await p(PROFILE, [kayit('123456789012345', new Date(simdi.getTime() - 60_000))], 'webhook')).toEqual({ yazilan: 1, eskiOlay: 0 });
    // Tarama aynı kaydı tekrar görüyor.
    expect(await p(PROFILE, [kayit('123456789012345', new Date(simdi.getTime() - 60_000))], 'reconcile')).toEqual({ yazilan: 0, eskiOlay: 0 });

    const g = await h.q<{ yeni_durum: string; kaynak: string }>('SELECT yeni_durum, kaynak FROM lead_durum_gecmisi');
    expect(g).toEqual([{ yeni_durum: 'new', kaynak: 'sistem' }]);
    const o = await h.q<{ asama: string; durum: string; olay_kimligi: string; lead_id: string }>(
      'SELECT asama, durum, olay_kimligi, lead_id::text AS lead_id FROM geri_besleme_olaylari',
    );
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ asama: 'ham_lead', durum: 'bekliyor', olay_kimligi: `adv-${o[0]!.lead_id}-ham_lead` });
    const [l] = await h.q<{ id: string }>('SELECT id::text AS id FROM leads');
    expect(o[0]!.lead_id).toBe(l!.id);
  });

  it('ayar kapalıyken geçmiş yazılıyor, olay yazılmıyor', async () => {
    await persist()(PROFILE, [kayit('123456789012345', new Date())], 'webhook');
    expect(await h.q('SELECT 1 FROM lead_durum_gecmisi')).toHaveLength(1);
    expect(await h.q('SELECT 1 FROM geri_besleme_olaylari')).toHaveLength(0);
  });

  it('KRİTİK: mutabakatla geç gelen 7 günden eski lead olay ÜRETMİYOR ve sayılıyor', async () => {
    await ayarAc(h);
    const r = await persist()(PROFILE, [kayit('223456789012345', new Date(Date.now() - 9 * 86_400_000))], 'reconcile');
    expect(r).toEqual({ yazilan: 1, eskiOlay: 1 });
    expect(await h.q('SELECT 1 FROM geri_besleme_olaylari')).toHaveLength(0);
  });
});
