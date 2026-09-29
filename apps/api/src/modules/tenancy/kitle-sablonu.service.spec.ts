import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { kitleSablonuInputSchema, kitleOzeti, type KitleOzel, type TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { KitleSablonuService } from './kitle-sablonu.service';

/**
 * ═══ KİTLE ŞABLONLARI — GERÇEK ŞEMAYA KARŞI ═══
 */
let h: Harness;
let svc: KitleSablonuService;

const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], isOrgAdmin: true } as TenantContext;
const BASKA = '9a9a9a9a-9a9a-9a9a-9a9a-9a9a9a9a9a9a';

const IZMIR = { key: '2622', type: 'region' as const, label: 'İzmir, Türkiye', countryCode: 'TR' };
const girdi = (patch: Record<string, unknown> = {}) => ({
  clientId: IDS.client,
  name: 'İzmir kadın',
  locations: [IZMIR],
  ageMin: 25,
  ageMax: 45,
  genders: 'female' as const,
  interests: [] as Array<{ id: string; name: string }>,
  ozelKitleler: [] as KitleOzel[],
  ...patch,
});

beforeAll(async () => {
  h = await createHarness();
  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;
  svc = new KitleSablonuService(prisma, new AuditService({} as never));
});
afterAll(async () => h.close());
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Başka', 'baska-ws', now())`,
    [BASKA, IDS.org],
  );
});

describe('şablon yaşam döngüsü', () => {
  it('oluşturuluyor, listeleniyor, güncelleniyor, siliniyor', async () => {
    const s = await svc.create(CTX, girdi(), {});
    expect(s).toMatchObject({ name: 'İzmir kadın', locations: [IZMIR], ageMin: 25, ageMax: 45, genders: 'female' });

    const g = await svc.update(CTX, s.id, girdi({ name: 'İzmir', ageMax: 65 }), {});
    expect(g.name).toBe('İzmir');
    expect((await svc.list(CTX, IDS.client)).items.map((x) => x.name)).toEqual(['İzmir']);

    await svc.remove(CTX, IDS.client, s.id, {});
    expect((await svc.list(CTX, IDS.client)).items).toEqual([]);
  });

  it('ilgi alanları kaydediliyor ve geri okunuyor', async () => {
    const s = await svc.create(CTX, girdi({ interests: [{ id: '6003', name: 'Lüks araçlar' }] }), {});
    expect(s.interests).toEqual([{ id: '6003', name: 'Lüks araçlar' }]);
    const g = await svc.update(CTX, s.id, girdi({ interests: [] }), {});
    expect(g.interests).toEqual([]);
  });

  it('KRİTİK: özel kitlenin hesabı BU workspace\'in Meta hesabı olmak zorunda', async () => {
    const ozel = (hesapId: string) => ({ id: '9', name: 'K', tip: 'ozel' as const, mod: 'dahil' as const, hesapId, hesapAdi: 'H' });
    await h.q(`UPDATE ad_accounts SET platform = 'meta' WHERE id = $1`, [IDS.adAccount]);
    const s = await svc.create(CTX, girdi({ ozelKitleler: [ozel(IDS.adAccount)] }), {});
    expect(s.ozelKitleler).toHaveLength(1);
    // Var olmayan / başka workspace'in hesabı:
    await expect(
      svc.create(CTX, girdi({ name: 'yabancı', ozelKitleler: [ozel('9b9b9b9b-9b9b-9b9b-9b9b-9b9b9b9b9b9b')] }), {}),
    ).rejects.toThrow('Meta hesapları arasında yok');
    // Aynı hesap Google olunca da reddediliyor.
    await h.q(`UPDATE ad_accounts SET platform = 'google' WHERE id = $1`, [IDS.adAccount]);
    await expect(svc.update(CTX, s.id, girdi({ ozelKitleler: [ozel(IDS.adAccount)] }), {})).rejects.toThrow(
      'Meta hesapları arasında yok',
    );
  });

  it('aynı adla ikinci şablon SEBEBİYLE reddediliyor', async () => {
    await svc.create(CTX, girdi(), {});
    await expect(svc.create(CTX, girdi(), {})).rejects.toThrow('Bu adla bir kitle şablonu zaten var');
  });

  it('KRİTİK: silinecek satır yoksa başarı DEĞİL — bulunamadı', async () => {
    const s = await svc.create(CTX, girdi(), {});
    // Başka workspace'in kimliğiyle silmek: sıfır satır.
    await expect(svc.remove(CTX, BASKA, s.id, {})).rejects.toThrow('bulunamadı');
    expect((await svc.list(CTX, IDS.client)).items).toHaveLength(1);
  });

  it('her işlem denetim kaydı bırakıyor', async () => {
    const s = await svc.create(CTX, girdi(), {});
    await svc.remove(CTX, IDS.client, s.id, {});
    const r = await h.q<{ action: string }>(
      `SELECT action FROM audit_logs WHERE action LIKE 'audience_template.%' ORDER BY id`,
    );
    expect(r.map((x) => x.action)).toEqual(['audience_template.created', 'audience_template.deleted']);
  });
});

describe('varsayılan şablon', () => {
  it('belirleniyor ve listede işaretli geliyor', async () => {
    const s = await svc.create(CTX, girdi(), {});
    await svc.varsayilanYap(CTX, IDS.client, s.id, {});
    const l = await svc.list(CTX, IDS.client);
    expect(l.varsayilanId).toBe(s.id);
    expect(l.items[0]!.varsayilan).toBe(true);
  });

  it('KRİTİK: BAŞKA workspace’in şablonu varsayılan yapılamıyor', async () => {
    const yabanci = await svc.create(CTX, girdi({ clientId: BASKA }), {});
    await expect(svc.varsayilanYap(CTX, IDS.client, yabanci.id, {})).rejects.toThrow('arasında yok');
  });

  it('varsayılan şablon silinince varsayılan BOŞA düşüyor, silinmiş satırı göstermiyor', async () => {
    const s = await svc.create(CTX, girdi(), {});
    await svc.varsayilanYap(CTX, IDS.client, s.id, {});
    await svc.remove(CTX, IDS.client, s.id, {});
    expect((await svc.list(CTX, IDS.client)).varsayilanId).toBeNull();
  });

  it('KRİTİK: org_id MÜŞTERİDEN — "Tüm şirketler" modunda ctx ev şirketini taşısa bile', async () => {
    const EV = '12121212-1212-1212-1212-121212121212';
    await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Ev', 'ev-org', now())`, [EV]);
    const s = await svc.create({ ...CTX, orgId: EV }, girdi(), {});
    await svc.varsayilanYap({ ...CTX, orgId: EV }, IDS.client, s.id, {});
    const [t] = await h.q<{ org_id: string }>('SELECT org_id FROM audience_templates WHERE id = $1', [s.id]);
    const [p] = await h.q<{ org_id: string }>('SELECT org_id FROM client_profiles WHERE client_id = $1', [IDS.client]);
    expect(t!.org_id).toBe(IDS.org);
    expect(p!.org_id).toBe(IDS.org);
  });
});

describe('şema kuralları', () => {
  const gecer = (patch: Record<string, unknown>) => kitleSablonuInputSchema.safeParse(girdi(patch));

  it('KRİTİK: ülke + o ülkenin ili REDDEDİLİYOR — Meta ikisini birleştirip ülke geneline gösterir', () => {
    const r = gecer({ locations: [{ key: 'TR', type: 'country', label: 'Türkiye', countryCode: 'TR' }, IZMIR] });
    expect(r.success).toBe(false);
    expect(r.success ? '' : r.error.issues[0]!.message).toContain('ülkenin tamamına');
  });

  it('farklı ülke + il meşru', () => {
    expect(gecer({ locations: [{ key: 'DE', type: 'country', label: 'Almanya', countryCode: 'DE' }, IZMIR] }).success).toBe(true);
  });

  it('aynı konum iki kez, ters yaş aralığı ve 18 altı reddediliyor', () => {
    expect(gecer({ locations: [IZMIR, IZMIR] }).success).toBe(false);
    expect(gecer({ ageMin: 50, ageMax: 30 }).success).toBe(false);
    expect(gecer({ ageMin: 16 }).success).toBe(false);
  });

  it('özet ekran ile kontrol listesinde aynı cümle', () => {
    expect(kitleOzeti(girdi())).toBe('İzmir, Türkiye · 25-45 yaş · Kadın');
    expect(kitleOzeti(girdi({ locations: [], ageMin: 18, ageMax: 65, genders: 'all' }))).toBe('Türkiye geneli · 18+ yaş');
  });

  it('veritabanı da ters yaşı reddediyor — şemayı atlayan bir yazma yolu kalıcı hata üretmesin', async () => {
    await expect(
      h.q(
        `INSERT INTO audience_templates (org_id, client_id, name, age_min, age_max, updated_at)
         VALUES ($1, $2, 'x', 50, 30, now())`,
        [IDS.org, IDS.client],
      ),
    ).rejects.toThrow(/audience_templates_yas/);
  });
});
