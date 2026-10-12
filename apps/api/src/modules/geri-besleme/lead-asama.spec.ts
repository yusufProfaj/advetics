import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import { ayarAc, lead, olay, olaylar } from '../../../test/geri-besleme-tohum';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { LeadsService } from '../leads/leads.service';
import { acilisGeriDoldurma, durumDegisti, kapanisIptal } from './lead-asama';

/**
 * ═══ DURUM → AŞAMA SATIRLARI, GERÇEK POSTGRES (PGlite) ═══
 *
 * KRİTİK İDDİALAR (MIMARI § 3, § 4.2, Ç-6, Ç-13):
 *   · geçmiş satırı ayar KAPALIYKEN de yazılıyor; olay yazılmıyor,
 *   · Yeni → Müşteri oldu atlanan aşamaları dolduruyor, işaretler 15 dk bekliyor,
 *   · pencerede geri alınan aşama İPTAL, platforma gitmiş olana DOKUNULMUYOR,
 *   · yeniden işaret AYNI satırı açıyor (ikinci satır yok = idempotens),
 *   · 7 günü geçen aşamanın satırı HİÇ açılmıyor ve sayılıyor,
 *   · `PUT /leads/:id` yolu (LeadsService.update) bunları GERÇEKTEN çağırıyor.
 */
let h: Harness;
const LEAD = 'aaaaaaaa-0000-4000-8000-000000000001';
const LEAD_ESKI = 'aaaaaaaa-0000-4000-8000-000000000002';
const SIMDI = new Date('2026-10-12T10:00:00Z');
const saatOnce = (n: number) => new Date(SIMDI.getTime() - n * 3_600_000);

const degis = (onceki: string, yeni: string, ek: Partial<Parameters<typeof durumDegisti>[1]> = {}) =>
  durumDegisti(h.db, {
    leadId: LEAD,
    clientId: IDS.client,
    orgId: IDS.org,
    onceki: onceki as never,
    yeni: yeni as never,
    submittedAt: saatOnce(2),
    userId: IDS.user,
    kaynak: 'panel',
    simdi: SIMDI,
    ...ek,
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
  await lead(h, { id: LEAD, externalId: '123456789012345', submittedAt: saatOnce(2) });
});

describe('geçmiş', () => {
  it('KRİTİK: ayar kapalıyken geçmiş YAZILIYOR, olay yazılmıyor (açılışta geri doldurma buna dayanıyor)', async () => {
    const r = await degis('new', 'won');
    expect(r.ayarEtkin).toBe(false);
    const g = await h.q<{ onceki_durum: string; yeni_durum: string; kaynak: string }>(
      'SELECT onceki_durum, yeni_durum, kaynak FROM lead_durum_gecmisi',
    );
    expect(g).toEqual([{ onceki_durum: 'new', yeni_durum: 'won', kaynak: 'panel' }]);
    expect(await olaylar(h)).toEqual([]);
  });

  it('aynı duruma "değişim" yazılmıyor (not güncellemesi)', async () => {
    await degis('won', 'won');
    expect(await h.q('SELECT 1 FROM lead_durum_gecmisi')).toHaveLength(0);
  });
});

describe('aşama planı (ayar açık)', () => {
  beforeEach(async () => {
    await ayarAc(h);
  });

  it('KRİTİK: Yeni → Müşteri oldu: atlanan aşamalar dolduruluyor; işaretler 15 dk bekliyor, ham lead beklemiyor', async () => {
    const r = await degis('new', 'won');
    expect(r.olusturulan).toBe(4);
    const satirlar = await h.q<{ asama: string; sonraki_deneme: Date; olay_kimligi: string; olay_zamani: Date }>(
      'SELECT asama, sonraki_deneme, olay_kimligi, olay_zamani FROM geri_besleme_olaylari ORDER BY asama',
    );
    const by = Object.fromEntries(satirlar.map((s) => [s.asama, s]));
    expect(Object.keys(by).sort()).toEqual(['ham_lead', 'nitelikli', 'satisa_dondu', 'ulasildi']);
    expect(new Date(by.ham_lead!.sonraki_deneme).getTime()).toBe(SIMDI.getTime());
    expect(new Date(by.satisa_dondu!.sonraki_deneme).getTime()).toBe(SIMDI.getTime() + 15 * 60_000);
    // Ham lead zamanı formun doldurulduğu an; işaret zamanı değişim anı.
    expect(new Date(by.ham_lead!.olay_zamani).getTime()).toBe(saatOnce(2).getTime());
    expect(new Date(by.satisa_dondu!.olay_zamani).getTime()).toBe(SIMDI.getTime());
    expect(by.satisa_dondu!.olay_kimligi).toBe(`adv-${LEAD}-satisa_dondu`);
  });

  it('KRİTİK: pencerede geri alınan aşama İPTAL ediliyor; ham lead asla iptal edilmiyor', async () => {
    await degis('new', 'won');
    const r = await degis('won', 'contacted');
    expect(r.iptal).toBe(2);
    const durum = Object.fromEntries((await olaylar(h)).map((o) => [o.asama, o.durum]));
    expect(durum).toEqual({ ham_lead: 'bekliyor', ulasildi: 'bekliyor', nitelikli: 'iptal', satisa_dondu: 'iptal' });
  });

  it('KRİTİK: yeniden işaret AYNI satırı açıyor; aşama başına tek satır (ikinci satır yok)', async () => {
    await degis('new', 'won');
    await degis('won', 'new');
    const r = await degis('new', 'won', { simdi: new Date(SIMDI.getTime() + 60_000) });
    expect(r.olusturulan).toBe(0);
    expect(r.yenidenAcilan).toBe(3);
    const s = await olaylar(h);
    expect(s).toHaveLength(4);
    expect(s.every((o) => o.durum === 'bekliyor')).toBe(true);
  });

  it('KRİTİK: platforma GİTMİŞ aşamaya dokunulmuyor (CAPI’de silme yok)', async () => {
    await olay(h, { leadId: LEAD, asama: 'ham_lead', durum: 'iletildi', olayZamani: saatOnce(2) });
    await olay(h, { leadId: LEAD, asama: 'ulasildi', durum: 'iletildi', olayZamani: saatOnce(1) });
    const r = await degis('contacted', 'lost');
    expect(r.iptal).toBe(0);
    const durum = Object.fromEntries((await olaylar(h)).map((o) => [o.asama, o.durum]));
    expect(durum).toEqual({ ham_lead: 'iletildi', ulasildi: 'iletildi', uygun_degil: 'bekliyor' });
  });

  it('KRİTİK: 7 günü geçen ham lead’in satırı AÇILMIYOR ve sayılıyor; ileri aşama (bugün) açılıyor', async () => {
    await lead(h, { id: LEAD_ESKI, externalId: '223456789012345', submittedAt: saatOnce(24 * 10) });
    const r = await degis('new', 'contacted', { leadId: LEAD_ESKI, submittedAt: saatOnce(24 * 10) });
    expect(r.eskiAtlanan).toBe(1);
    expect((await olaylar(h, LEAD_ESKI)).map((o) => o.asama)).toEqual(['ulasildi']);
  });
});

describe('açılış ve kapanış', () => {
  it('KRİTİK: açılışta yalnız 7 gün içindekiler kuyruğa giriyor; eskiler sayılıyor', async () => {
    await lead(h, { id: LEAD_ESKI, externalId: '223456789012345', submittedAt: saatOnce(24 * 10) });
    // Bu hafta işaretlenmiş lead (geçmişte kayıt var)
    await h.q(`UPDATE leads SET status = 'qualified' WHERE id = $1`, [LEAD]);
    await h.q(
      `INSERT INTO lead_durum_gecmisi (org_id, client_id, lead_id, onceki_durum, yeni_durum, kaynak, created_at)
       VALUES ($1, $2, $3, 'new', 'qualified', 'panel', $4)`,
      [IDS.org, IDS.client, LEAD, saatOnce(1).toISOString()],
    );
    await ayarAc(h);
    const d = await acilisGeriDoldurma(h.db, { clientId: IDS.client, orgId: IDS.org, simdi: SIMDI });
    expect(d).toEqual({ kuyruga: 3, eskiOlduguIcinAtlanan: 1 });
    expect((await olaylar(h, LEAD)).map((o) => o.asama)).toEqual(['ham_lead', 'nitelikli', 'ulasildi']);
    expect(await olaylar(h, LEAD_ESKI)).toEqual([]);
  });

  it('kapanış bekleyenleri iptal ediyor, gitmiş olana dokunmuyor', async () => {
    await ayarAc(h);
    await olay(h, { leadId: LEAD, asama: 'ham_lead', durum: 'iletildi', olayZamani: saatOnce(2) });
    await olay(h, { leadId: LEAD, asama: 'ulasildi', durum: 'basarisiz', olayZamani: saatOnce(1) });
    expect(await kapanisIptal(h.db, IDS.client)).toBe(1);
    expect((await olaylar(h)).map((o) => o.durum)).toEqual(['iletildi', 'iptal']);
  });
});

describe('PUT /leads/:id yolu', () => {
  const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], activeClientId: null, isOrgAdmin: true, permissions: [] } as unknown as TenantContext;
  const svc = () =>
    new LeadsService(
      { withTenant: async (_c: TenantContext, fn: (tx: unknown) => Promise<unknown>) => fn(h.db) } as unknown as PrismaService,
      {} as AuditService,
    );

  it('KRİTİK: durum güncellemesi geçmiş + aşama satırlarını AYNI istekte yazıyor ve rozet dönüyor', async () => {
    // Servis gerçek saati kullanıyor: lead GERÇEK şimdiden bir saat önce.
    await h.q(`UPDATE leads SET submitted_at = now() - interval '1 hour' WHERE id = $1`, [LEAD]);
    await ayarAc(h);
    const r = await svc().update(CTX, LEAD, { status: 'qualified' });
    expect(r.status).toBe('qualified');
    expect(await h.q('SELECT 1 FROM lead_durum_gecmisi')).toHaveLength(1);
    expect((await olaylar(h)).map((o) => o.asama)).toEqual(['ham_lead', 'nitelikli', 'ulasildi']);
    expect(r.geriBesleme?.tur).toBe('bekliyor');
    expect(r.geriBesleme?.asamalar).toHaveLength(3);
  });

  it('not güncellemesi (durum aynı) geçmiş ve olay üretmiyor', async () => {
    await ayarAc(h);
    await svc().update(CTX, LEAD, { status: 'new', note: 'arandı, meşgul' });
    expect(await h.q('SELECT 1 FROM lead_durum_gecmisi')).toHaveLength(0);
    expect(await olaylar(h)).toEqual([]);
  });

  it('liste her satıra rozet ekliyor; ayar kapalıyken tür "kapali"', async () => {
    const r = await svc().list(CTX, { clientId: IDS.client, limit: 50, offset: 0 } as never);
    expect(r.rows[0]?.geriBesleme).toMatchObject({ tur: 'kapali', asamalar: [] });
  });
});
