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
  platform: 'meta' as 'meta' | 'google',
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
        `INSERT INTO audience_templates (org_id, client_id, name, platform, age_min, age_max, updated_at)
         VALUES ($1, $2, 'x', 'meta', 50, 30, now())`,
        [IDS.org, IDS.client],
      ),
    ).rejects.toThrow(/audience_templates_yas/);
  });
});

describe('Google karşılığı (2026-10-16)', () => {
  const GOOGLE = { ilgiler: [{ id: '80432', ad: '/Sports & Fitness/Golf Enthusiasts', tur: 'affinity' as const }], kelimeler: ['golf sopası', 'golf kulübü'] };

  it('KRİTİK: kaydediliyor, geri okunuyor, güncellemede değişiyor', async () => {
    const s = await svc.create(CTX, girdi({ platform: 'google', google: GOOGLE }), {});
    expect(s.google).toEqual(GOOGLE);
    expect((await svc.list(CTX, IDS.client)).items[0]!.google).toEqual(GOOGLE);
    const g = await svc.update(CTX, s.id, girdi({ platform: 'google', google: { ilgiler: [], kelimeler: ['golf'] } }), {});
    expect(g.google).toEqual({ ilgiler: [], kelimeler: ['golf'] });
  });

  it('alanı göndermeyen eski istemci boş karşılık yazar; Meta tarafı etkilenmez', async () => {
    const s = await svc.create(CTX, girdi(), {});
    expect(s.google).toEqual({ ilgiler: [], kelimeler: [] });
    expect(s.locations).toEqual([IZMIR]);
  });

  it('bozuk Google kaydı şablonu düşürmüyor, boş okunuyor', async () => {
    const s = await svc.create(CTX, girdi(), {});
    await h.q(`UPDATE audience_templates SET google_hedefleri = '{"ilgiler":[{"id":"x"}]}'::jsonb WHERE id = $1`, [s.id]);
    const okunan = (await svc.list(CTX, IDS.client)).items[0]!;
    expect(okunan.google).toEqual({ ilgiler: [], kelimeler: [] });
    expect(okunan.name).toBe('İzmir kadın');
  });
});

describe('kitlenin platformu (2026-10-20)', () => {
  it('KRİTİK: platform kaydediliyor ve liste platforma göre süzülüyor', async () => {
    await svc.create(CTX, girdi({ name: 'M' }), {});
    await svc.create(CTX, girdi({ name: 'G', platform: 'google' }), {});
    const ad = async (p?: 'meta' | 'google') => (await svc.list(CTX, IDS.client, p)).items.map((x) => `${x.name}:${x.platform}`);
    expect(await ad()).toEqual(['G:google', 'M:meta']);
    expect(await ad('meta')).toEqual(['M:meta']);
    expect(await ad('google')).toEqual(['G:google']);
  });

  it('KRİTİK: süzülen listede de varsayılan kimlik kaybolmuyor', async () => {
    const m = await svc.create(CTX, girdi({ name: 'M' }), {});
    await svc.varsayilanYap(CTX, IDS.client, m.id, {});
    expect((await svc.list(CTX, IDS.client, 'google')).varsayilanId).toBe(m.id);
  });

  it('KRİTİK: platform kayıttan sonra değiştirilemiyor, kayıt yerinde kalıyor', async () => {
    const s = await svc.create(CTX, girdi(), {});
    await expect(svc.update(CTX, s.id, girdi({ platform: 'google' }), {})).rejects.toThrow(/platformu kayıttan sonra değiştirilemez/);
    expect((await svc.list(CTX, IDS.client)).items[0]!.platform).toBe('meta');
  });

  it('KRİTİK: platform dışı alan şemada reddediliyor (sessizce atılmıyor)', () => {
    const ilgi = [{ id: '6003', name: 'Gayrimenkul' }];
    const google = { ilgiler: [], kelimeler: ['izmir daire'] };
    const sorun = (v: Record<string, unknown>) => kitleSablonuInputSchema.safeParse(girdi(v)).error?.issues.map((i) => i.path.join('.'));
    expect(sorun({ platform: 'google', interests: ilgi })).toEqual(['interests']);
    expect(sorun({ platform: 'meta', google })).toEqual(['google']);
    expect(sorun({ platform: 'google', google })).toBeUndefined();
    expect(sorun({ platform: 'meta', interests: ilgi })).toBeUndefined();
    expect(kitleSablonuInputSchema.safeParse({ ...girdi(), platform: undefined }).success).toBe(false);
  });
});

describe('reklam setinin kitlesini kütüphaneye almak', () => {
  const KAMPANYA = '66666666-6666-4666-8666-666666666662';
  const SET = '77777777-7777-4777-8777-777777777779';
  async function setKur(targeting: unknown, clientId: string = IDS.client, platform = 'meta') {
    await h.q(
      `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
       VALUES ($1, $2, $3, $4::"Platform", 'c9', 'K', 'active', 'daily', now())`,
      [KAMPANYA, IDS.adAccount, clientId, platform],
    );
    await h.q(
      `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, targeting, updated_at)
       VALUES ($1, $2, $3, $4, $5::"Platform", 'g9', 'Set', 'active', 'none', $6::jsonb, now())`,
      [SET, KAMPANYA, IDS.adAccount, clientId, platform, JSON.stringify(targeting)],
    );
  }

  it('KRİTİK: hedefleme şablona çevriliyor; taşınamayan parça SÖYLENİYOR', async () => {
    await setKur({
      geo_locations: { regions: [{ key: '2622', name: 'İzmir', country: 'TR' }], custom_locations: [{ latitude: 38.4, longitude: 27.1, radius: 5 }] },
      age_min: 25,
      age_max: 44,
      genders: [2],
      flexible_spec: [{ interests: [{ id: '6003', name: 'Golf' }], behaviors: [{ id: '1', name: 'Sık seyahat' }] }],
      custom_audiences: [{ id: '238', name: 'Site ziyaretçileri' }],
    });
    const r = await svc.settenOlustur(CTX, { clientId: IDS.client, adGroupId: SET, name: 'Golf İzmir' }, {});
    expect(r.kayit).toMatchObject({ platform: 'meta', name: 'Golf İzmir', ageMin: 25, ageMax: 44, genders: 'female', interests: [{ id: '6003', name: 'Golf' }] });
    expect(r.kayit.locations).toEqual([{ key: '2622', type: 'region', label: 'İzmir', countryCode: 'TR' }]);
    expect(r.kayit.ozelKitleler).toMatchObject([{ id: '238', mod: 'dahil', hesapId: IDS.adAccount }]);
    expect(r.atilanlar.join(' ')).toMatch(/adres çevresi/);
    expect(r.atilanlar.join(' ')).toMatch(/davranış/);
  });

  it('KRİTİK: başka workspace’in seti kopyalanamaz (404)', async () => {
    await setKur({ geo_locations: { countries: ['TR'] } }, BASKA);
    await expect(svc.settenOlustur(CTX, { clientId: IDS.client, adGroupId: SET, name: 'X' }, {})).rejects.toThrow(/bulunamadı/);
  });

  it('Google setinin hedeflemesi okunmuyor: nedeniyle reddediliyor', async () => {
    await setKur(null, IDS.client, 'google');
    await expect(svc.settenOlustur(CTX, { clientId: IDS.client, adGroupId: SET, name: 'X' }, {})).rejects.toThrow(/yalnız Meta/);
  });
});
