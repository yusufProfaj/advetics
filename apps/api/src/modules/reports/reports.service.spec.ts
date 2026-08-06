import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { ReportsService } from './reports.service';

/**
 * ReportsService — GERÇEK Postgres motoruna (PGlite) karşı.
 *
 * En kritik iddia ÖNCELİĞİN TOPLANABİLİR OLMAMASI. Kova çözümü "ilk dolu tür
 * kazanır" ve bu SATIR BAZLI bir işlem; önce toplayıp sonra çözmek sessizce
 * yanlış sonuç veriyor.
 *
 * Canlı raporda tam bu oldu: `Dönüşüm 132` ile `Form 86 + Mesaj 39 = 125`
 * çelişti. `conversions` satır bazlı çözülüp saklanıyor, rapor ise toplandıktan
 * sonra çözüyordu ve 7 dönüşüm kayboluyordu.
 *
 * İkinci kritik iddia LATERAL ÇOĞALTMASI: aksiyon dizisini açmak satırları
 * çoğaltıyor ve metrik toplamlarını aynı sorguda yapmak harcamayı katlıyor.
 */

let h: Harness;
let svc: ReportsService;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const CAMP_A = '66666666-6666-6666-6666-666666666666';
const CAMP_B = '99999999-9999-9999-9999-999999999999';

const RANGE = { clientId: IDS.client, from: '2026-08-01', to: '2026-08-02' };

async function seedCampaign(id: string, name: string): Promise<void> {
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, objective, status, budget_mode, updated_at)
     VALUES ($1, $2, $3, 'meta', $4, $5, 'OUTCOME_LEADS', 'active', 'daily', now())`,
    [id, IDS.adAccount, IDS.client, `ext-${name}`, name],
  );
}

/** Kampanya-gün satırı; `actions` ham dizisi doğrudan veriliyor. */
async function seedRow(params: {
  entityId: string;
  date: string;
  spendMicros?: string;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  reach?: number;
  actions?: Array<{ action_type: string; value: string }>;
}): Promise<void> {
  await h.q(
    `INSERT INTO insights_daily
       (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
        date, breakdown_key, impressions, clicks, spend_micros, conversions,
        conversion_value_micros, currency, reach, raw_metrics)
     VALUES ($1, $2, 'meta', 'campaign', $3, 'ext', $4::date, '', $5, $6, $7, $8, 0, 'TRY', $9, $10::jsonb)`,
    [
      IDS.client,
      IDS.adAccount,
      params.entityId,
      params.date,
      params.impressions ?? 100,
      params.clicks ?? 10,
      params.spendMicros ?? '1000000',
      params.conversions ?? 0,
      params.reach ?? 0,
      JSON.stringify({ actions: params.actions ?? [] }),
    ],
  );
}

beforeAll(async () => {
  h = await createHarness();
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await seedCampaign(CAMP_A, 'Kampanya A');
  await seedCampaign(CAMP_B, 'Kampanya B');

  const prisma = {
    withTenant: async <T>(ctx: TenantContext, fn: (tx: unknown) => Promise<T>): Promise<T> => {
      if (!ctx?.orgId || !ctx?.userId) throw new Error('Tenant bağlamı olmadan sorgu');
      return fn(h.db);
    },
  } as unknown as PrismaService;

  svc = new ReportsService(prisma);
});

describe('ReportsService — dönüşüm kovaları', () => {
  it('REGRESYON: öncelik SATIR BAZINDA çözülüyor, toplandıktan sonra değil', async () => {
    // Kampanya A `lead` bildiriyor, kampanya B yalnızca onsite yedeğini.
    //
    // Satır bazlı çöz → topla:  68 + 7 = 75   ✅
    // Topla → çöz:              SUM(lead)=68 dolu → 68   ❌ (7 kayıp)
    await seedRow({
      entityId: CAMP_A,
      date: '2026-08-01',
      actions: [{ action_type: 'lead', value: '68' }],
    });
    await seedRow({
      entityId: CAMP_B,
      date: '2026-08-01',
      actions: [{ action_type: 'onsite_conversion.lead_grouped', value: '7' }],
    });

    const data = await svc.build(CTX, RANGE);

    expect(data.platforms).toHaveLength(1);
    expect(data.platforms[0]!.conversionCounts.form).toBe(75);

    // Kampanya satırlarının toplamı platform bloğuyla AYNI olmak zorunda:
    // müşteri ikisini yan yana görüyor.
    const campaignSum = data.metaCampaigns.reduce((n, c) => n + c.conversionCounts.form, 0);
    expect(campaignSum).toBe(75);
  });

  it('REGRESYON: örtüşen türler aynı satırda TOPLANMAZ', async () => {
    // Canlı veriden: `lead` ve `onsite_conversion.lead_grouped` ikisi de 40 ve
    // AYNI 40 lead'i anlatıyor.
    await seedRow({
      entityId: CAMP_A,
      date: '2026-08-01',
      actions: [
        { action_type: 'lead', value: '40' },
        { action_type: 'onsite_conversion.lead_grouped', value: '40' },
      ],
    });

    const data = await svc.build(CTX, RANGE);
    expect(data.platforms[0]!.conversionCounts.form).toBe(40);
  });

  it('REGRESYON: mesaj ailesinde üçlü sayım yok', async () => {
    await seedRow({
      entityId: CAMP_A,
      date: '2026-08-01',
      actions: [
        { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '20' },
        { action_type: 'onsite_conversion.total_messaging_connection', value: '20' },
        { action_type: 'onsite_conversion.messaging_first_reply', value: '19' },
      ],
    });

    const data = await svc.build(CTX, RANGE);
    expect(data.platforms[0]!.conversionCounts.message).toBe(20);
  });

  it('günler arasında toplanıyor', async () => {
    for (const date of ['2026-08-01', '2026-08-02']) {
      await seedRow({
        entityId: CAMP_A,
        date,
        actions: [{ action_type: 'lead', value: '5' }],
      });
    }
    const data = await svc.build(CTX, RANGE);
    expect(data.platforms[0]!.conversionCounts.form).toBe(10);
  });

  it('günlük seride her günün kendi sayısı var', async () => {
    await seedRow({
      entityId: CAMP_A,
      date: '2026-08-01',
      actions: [{ action_type: 'lead', value: '3' }],
    });
    await seedRow({
      entityId: CAMP_A,
      date: '2026-08-02',
      actions: [{ action_type: 'lead', value: '9' }],
    });

    const data = await svc.build(CTX, RANGE);
    expect(data.daily.map((d) => [d.date, d.conversionCounts.form])).toEqual([
      ['2026-08-01', 3],
      ['2026-08-02', 9],
    ]);
  });

  it('aksiyonsuz gün kaybolmuyor', async () => {
    // `jsonb_array_elements` boş dizide satır üretmiyor; harcaması olan ama
    // dönüşümü olmayan gün grafikten düşmemeli.
    await seedRow({ entityId: CAMP_A, date: '2026-08-01', actions: [] });
    await seedRow({
      entityId: CAMP_A,
      date: '2026-08-02',
      actions: [{ action_type: 'lead', value: '4' }],
    });

    const data = await svc.build(CTX, RANGE);
    expect(data.daily).toHaveLength(2);
    expect(data.daily[0]!.conversionCounts.form).toBe(0);
  });
});

describe('ReportsService — LATERAL çoğaltması', () => {
  it('REGRESYON: harcama aksiyon SAYISI kadar KATLANMIYOR', async () => {
    // 5 aksiyon taşıyan bir gün LATERAL join ile 5 satıra açılıyor. Metrikleri
    // aynı sorguda toplamak harcamayı 5 katına çıkarırdı ve müşteriye 5 kat
    // harcama raporlanırdı.
    await seedRow({
      entityId: CAMP_A,
      date: '2026-08-01',
      spendMicros: '1000000',
      impressions: 100,
      clicks: 10,
      actions: [
        { action_type: 'lead', value: '1' },
        { action_type: 'like', value: '2' },
        { action_type: 'post_engagement', value: '3' },
        { action_type: 'video_view', value: '4' },
        { action_type: 'link_click', value: '5' },
      ],
    });

    const data = await svc.build(CTX, RANGE);
    expect(data.platforms[0]!.spendMicros).toBe('1000000');
    expect(data.platforms[0]!.impressions).toBe(100);
    expect(data.platforms[0]!.clicks).toBe(10);
  });
});

describe('ReportsService — erişim', () => {
  it('kampanya erişimi TOPLANMIYOR, günlük ortalaması alınıyor', async () => {
    // Aynı kişi kampanyayı iki gün de görmüş olabilir; toplamak müşteriye iki
    // kat kitle söylemek olur.
    for (const date of ['2026-08-01', '2026-08-02']) {
      await seedRow({ entityId: CAMP_A, date, reach: 800 });
    }
    const data = await svc.build(CTX, RANGE);
    expect(data.metaCampaigns[0]!.reach).toBe(800);
    expect(data.metaCampaigns[0]!.reachIsDailyAverage).toBe(true);
  });

  it('tek günde erişim TAM ve ortalama işareti yok', async () => {
    await seedRow({ entityId: CAMP_A, date: '2026-08-01', reach: 800 });
    const data = await svc.build(CTX, {
      ...RANGE,
      from: '2026-08-01',
      to: '2026-08-01',
    });
    expect(data.metaCampaigns[0]!.reach).toBe(800);
    expect(data.metaCampaigns[0]!.reachIsDailyAverage).toBe(false);
  });
});

describe('ReportsService — veri kapsaması', () => {
  it('kampanyanın kaç günü ölçüldüğünü bildiriyor', async () => {
    // CANLI DURUM: Ege Birlik kampanyaları 6 günün çoğunu kapsıyor, yeni
    // senkronize edilen Fenbay kampanyaları yalnızca 1 gününü. Farkı
    // göstermeden rapor göndermek "bu kampanya çalışmamış" izlenimi veriyor.
    for (const date of ['2026-08-01', '2026-08-02']) {
      await seedRow({ entityId: CAMP_A, date, actions: [{ action_type: 'lead', value: '5' }] });
    }
    await seedRow({ entityId: CAMP_B, date: '2026-08-02' });

    const data = await svc.build(CTX, RANGE);
    const byName = new Map(data.metaCampaigns.map((c) => [c.name, c]));

    expect(data.rangeDays).toBe(2);
    expect(byName.get('Kampanya A')!.dayCount).toBe(2);
    expect(byName.get('Kampanya B')!.dayCount).toBe(1);
  });
});

describe('ReportsService — yapı', () => {
  it('tek platformda TOPLAM bloğu YOK', async () => {
    // Aynı sayıları iki kez göstermek "bunlar neden farklı?" sorusunu doğuruyor.
    await seedRow({ entityId: CAMP_A, date: '2026-08-01' });
    const data = await svc.build(CTX, RANGE);
    expect(data.platforms).toHaveLength(1);
    expect(data.total).toBeNull();
  });

  it('iki platformda TOPLAM var ve toplamı doğru', async () => {
    await seedRow({ entityId: CAMP_A, date: '2026-08-01', spendMicros: '1000000' });
    await h.q(
      `INSERT INTO insights_daily
         (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
          date, breakdown_key, impressions, clicks, spend_micros, conversions,
          conversion_value_micros, currency, reach, raw_metrics)
       VALUES ($1, $2, 'google', 'campaign', $3, 'ext-g', '2026-08-01'::date, '',
               50, 5, 2000000, 0, 0, 'TRY', 0, '{}'::jsonb)`,
      [IDS.client, IDS.adAccount, CAMP_B],
    );

    const data = await svc.build(CTX, RANGE);
    expect(data.platforms).toHaveLength(2);
    expect(data.total).not.toBeNull();
    expect(data.total!.spendMicros).toBe('3000000');
    expect(data.total!.label).toBe('TOPLAM');
  });

  it('şablon yoksa TÜM bölümler geliyor', async () => {
    await seedRow({ entityId: CAMP_A, date: '2026-08-01' });
    const data = await svc.build(CTX, RANGE);
    // "Şablon tanımlanmadı" diye boş rapor üretmek, kullanıcıyı hiçbir şey
    // göstermeyen bir ekranla baş başa bırakmak olurdu.
    expect(data.sections).toContain('cover');
    expect(data.sections).toContain('summary');
    expect(data.sections).toContain('closing');
  });

  it('anahtar kelimeler NULL — "veri yok" değil "yetenek yok"', async () => {
    await seedRow({ entityId: CAMP_A, date: '2026-08-01' });
    const data = await svc.build(CTX, RANGE);
    // Boş dizi "anahtar kelimen yok" demek olurdu; null "henüz toplamıyoruz".
    expect(data.keywords).toBeNull();
  });

  it('marka varsayılanları dolu geliyor', async () => {
    await seedRow({ entityId: CAMP_A, date: '2026-08-01' });
    const data = await svc.build(CTX, RANGE);
    expect(data.branding.primaryColor).toMatch(/^#/);
    expect(data.title).toBeTruthy();
  });

  it('olmayan müşteri için bulunamadı', async () => {
    await expect(
      svc.build(CTX, { ...RANGE, clientId: '00000000-0000-0000-0000-000000000000' }),
    ).rejects.toThrow(/bulunamadı/);
  });
});
