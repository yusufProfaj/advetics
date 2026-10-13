import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReportData, TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { KreatifAdresiService } from './kreatif-adresi.service';
import type { DonemErisimiService } from '../erisim/donem-erisimi.service';
import { ReportsService } from './reports.service';

/**
 * ═══ KOVA SQL'İ ESKİSİYLE BİREBİR (Ajan 4, 9aecbf2b kapısı) ═══
 *
 * 9aecbf2b kova SQL'ini elle yazılmış sütunlardan KOVA LİSTESİNDEN üretilen
 * sütunlara çevirdi ve dört sorguya (platform, kampanya, gün, kova alt
 * sorgusu) aynı anda dokundu. Bu değişiklik BÜTÜN müşterilerin raporunu
 * etkiliyor ve yanlışlığı hata vermez: bir sütun yanlış adla seçilirse ya da
 * öncelik sırası kayarsa tablo sessizce başka bir sayı gösterir.
 *
 * Bu dosya ESKİ sorguyu (9aecbf2b^ `bucketSelect`, form/mesaj/satış, aksiyon
 * listeleri o günkü hâliyle ELLE kopyalanmış) aynı fixture'da çalıştırıp yeni
 * servisin ürettiği üç kovayla kıyaslıyor: kampanya, platform ve gün
 * greninde. Liste `CONVERSION_BUCKETS`tan OKUNMUYOR: okunsaydı listeyi
 * değiştiren bir hata iki tarafı birden değiştirir ve test yeşil kalırdı.
 *
 * Fixture kenar hâlleri bilerek taşıyor: öncelik yedeği, sıfır değerli
 * öncelikli tür (NULLIF), aynı türün dizide iki kez geçmesi, ondalık değer,
 * dizi olmayan `actions`, hiç `actions` olmayan satır, arama eylemleriyle
 * karışık satır (yeni kovalar eskileri ETKİLEMEMELİ) ve Google satırı.
 */

const ESKI_KOVALAR: Record<'form' | 'message' | 'purchase', string[]> = {
  form: ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'leadgen_grouped', 'onsite_conversion.lead_form_submit'],
  message: ['onsite_conversion.messaging_conversation_started_7d', 'onsite_conversion.total_messaging_connection'],
  purchase: ['omni_purchase', 'purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_conversion.purchase'],
};

/** 9aecbf2b^ `bucketSelect` — tek fark: bağlı parametre yerine literal (türler sabit). */
function eskiKovaSorgusu(grp: string): string {
  const pick = (k: keyof typeof ESKI_KOVALAR) =>
    `COALESCE(${ESKI_KOVALAR[k]
      .map((t) => `NULLIF(SUM(CASE WHEN act->>'action_type' = '${t}' THEN COALESCE((act->>'value')::numeric, 0) END), 0)`)
      .join(', ')}, 0)`;
  return `
    SELECT grp::text AS grp, SUM(form) AS form, SUM(message) AS message, SUM(purchase) AS purchase
    FROM (
      SELECT ${grp} AS grp, ${pick('form')} AS form, ${pick('message')} AS message, ${pick('purchase')} AS purchase
      FROM insights_daily i2
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(i2.raw_metrics -> 'actions') = 'array'
             THEN i2.raw_metrics -> 'actions'
             ELSE '[]'::jsonb END
      ) AS act
      WHERE i2.client_id = $1::uuid
        AND i2.date BETWEEN $2::date AND $3::date
        AND i2.entity_level = 'campaign'::"EntityLevel"
      GROUP BY ${grp}, i2.entity_id, i2.date
    ) resolved
    GROUP BY grp`;
}

let h: Harness;
let svc: ReportsService;

const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], isOrgAdmin: true } as TenantContext;
const CAMP_A = '66666666-6666-6666-6666-666666666666';
const CAMP_B = '99999999-9999-9999-9999-999999999999';
const CAMP_G = '77777777-7777-7777-7777-777777777777';
const RANGE = { clientId: IDS.client, from: '2026-08-01', to: '2026-08-03' };

async function kampanya(id: string, ad: string, platform: 'meta' | 'google'): Promise<void> {
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, objective, status, budget_mode, updated_at)
     VALUES ($1, $2, $3, $4::"Platform", $5, $6, 'OUTCOME_LEADS', 'active', 'daily', now())`,
    [id, IDS.adAccount, IDS.client, platform, `ext-${ad}`, ad],
  );
}

async function satir(entityId: string, date: string, raw: unknown, platform: 'meta' | 'google' = 'meta'): Promise<void> {
  await h.q(
    `INSERT INTO insights_daily
       (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
        date, breakdown_key, impressions, clicks, spend_micros, conversions,
        conversion_value_micros, currency, reach, raw_metrics)
     VALUES ($1, $2, $3::"Platform", 'campaign', $4, 'ext', $5::date, '', 100, 10, 1000000, 0, 0, 'TRY', 0, $6::jsonb)`,
    [IDS.client, IDS.adAccount, platform, entityId, date, JSON.stringify(raw)],
  );
}

const a = (action_type: string, value: string) => ({ action_type, value });

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await kampanya(CAMP_A, 'A', 'meta');
  await kampanya(CAMP_B, 'B', 'meta');
  await kampanya(CAMP_G, 'G', 'google');

  // A: öncelik, NULLIF, tekrar eden tür, ondalık, arama eylemleriyle karışık.
  await satir(CAMP_A, '2026-08-01', {
    actions: [
      a('lead', '0'),
      a('onsite_conversion.lead_grouped', '7'),
      a('onsite_conversion.messaging_conversation_started_7d', '3'),
      a('onsite_conversion.total_messaging_connection', '3'),
      a('omni_purchase', '2.6'),
      a('purchase', '9'),
      a('click_to_call_native_call_placed', '5'),
      a('click_to_call_call_confirm', '8'),
    ],
  });
  await satir(CAMP_A, '2026-08-02', { actions: [a('lead', '4'), a('lead', '1'), a('leadgen_grouped', '99')] });
  await satir(CAMP_A, '2026-08-03', { actions: { not: 'array' } });
  // B: yalnız yedek türler; bir gün hiç `actions` yok.
  await satir(CAMP_B, '2026-08-01', { actions: [a('offsite_conversion.fb_pixel_lead', '2'), a('onsite_conversion.total_messaging_connection', '6'), a('onsite_conversion.purchase', '1.4')] });
  await satir(CAMP_B, '2026-08-02', {});
  await satir(CAMP_B, '2026-08-03', { actions: [a('onsite_conversion.lead_form_submit', '3'), a('click_to_call_native_20s_call_connect', '2')] });
  // Google: aksiyon yok, ham sayaç var (eski kovalarda 0 olmalı).
  await satir(CAMP_G, '2026-08-01', { callClicks: 4 }, 'google');

  const prisma = {
    withTenant: async <T>(_ctx: TenantContext, fn: (tx: unknown) => Promise<T>): Promise<T> => fn(h.db),
  } as unknown as PrismaService;
  const kreatifAdresi = { tazele: async (_c: TenantContext, d: ReportData) => d } as unknown as KreatifAdresiService;
  // Erişim bu dosyanın konusu değil: platform çağrısı yok, "okunamadı".
  svc = new ReportsService(prisma, kreatifAdresi, { oku: async () => ({ tur: 'okunamadi', neden: 'test: platform yok' }) } as unknown as DonemErisimiService);
});

type Uc = { form: number; message: number; purchase: number };
async function eski(grp: string): Promise<Map<string, Uc>> {
  const rows = await h.q<{ grp: string; form: string; message: string; purchase: string }>(eskiKovaSorgusu(grp), [RANGE.clientId, RANGE.from, RANGE.to]);
  return new Map(rows.map((x) => [x.grp, { form: Math.round(Number(x.form)), message: Math.round(Number(x.message)), purchase: Math.round(Number(x.purchase)) }]));
}
const uc = (c: Uc): Uc => ({ form: c.form, message: c.message, purchase: c.purchase });

describe('kova SQL — eski sorguyla birebir', () => {
  it('KRİTİK: kampanya greninde form/mesaj/satış eskisiyle AYNI', async () => {
    const data = await svc.build(CTX, RANGE);
    const ref = await eski('i2.entity_id');
    const yeni = [...data.metaCampaigns, ...data.googleCampaigns];
    expect(yeni.length).toBe(3);
    for (const c of yeni) {
      expect({ id: c.id, ...uc(c.conversionCounts) }).toEqual({ id: c.id, ...(ref.get(c.id) ?? { form: 0, message: 0, purchase: 0 }) });
    }
    // Fixture boşa düşmüyor: kıyas gerçekten dolu sayılarla yapıldı.
    expect(ref.get(CAMP_A)).toEqual({ form: 12, message: 3, purchase: 3 });
  });

  it('KRİTİK: platform greninde eskisiyle AYNI; Google bloğunda eski kovalar 0', async () => {
    const data = await svc.build(CTX, RANGE);
    const ref = await eski('i2.platform');
    for (const p of data.platforms) {
      expect({ p: p.platform, ...uc(p.conversionCounts) }).toEqual({ p: p.platform, ...(ref.get(p.platform) ?? { form: 0, message: 0, purchase: 0 }) });
    }
    expect(data.platforms.find((p) => p.platform === 'google')!.conversionCounts).toMatchObject({ form: 0, message: 0, purchase: 0, callClicks: 4 });
  });

  it('KRİTİK: gün greninde eskisiyle AYNI', async () => {
    const data = await svc.build(CTX, RANGE);
    const ref = await eski('i2.date');
    expect(data.daily.length).toBe(3);
    for (const d of data.daily) {
      expect({ d: d.date, ...uc(d.conversionCounts) }).toEqual({ d: d.date, ...(ref.get(d.date) ?? { form: 0, message: 0, purchase: 0 }) });
    }
  });

  it('yeni kovalar eskileri etkilemiyor ve kendi değerlerini taşıyor', async () => {
    const data = await svc.build(CTX, RANGE);
    const A = data.metaCampaigns.find((c) => c.id === CAMP_A)!;
    const B = data.metaCampaigns.find((c) => c.id === CAMP_B)!;
    expect(A.conversionCounts.calls).toBe(5);
    expect(B.conversionCounts.calls20s).toBe(2);
    expect(A.conversionCounts.callClicks).toBe(0);
  });
});

/**
 * HAM SAYAÇ BEKÇİSİ (`jsonb_typeof = 'number'`). 9aecbf2b'nin testi yalnız
 * anahtarın HİÇ olmadığı hâli (`callClicksError`) sınıyordu ve bekçiyi
 * silen mutasyon yeşil geçti. Sayı olmayan bir değer (`"4"`, hata nesnesi)
 * bekçisiz `::numeric` dönüşümünde patlar ve TEK satır yüzünden müşterinin
 * BÜTÜN raporu açılmaz.
 */
describe('ham sayaç — sayı olmayan değer raporu düşürmüyor', () => {
  it('KRİTİK: callClicks dizgeyse ya da nesneyse rapor üretiliyor, o satır sayılmıyor', async () => {
    await satir(CAMP_G, '2026-08-02', { callClicks: 'dört' }, 'google');
    await satir(CAMP_G, '2026-08-03', { callClicks: { hata: 'x' } }, 'google');
    const data = await svc.build(CTX, RANGE);
    expect(data.googleCampaigns.find((c) => c.id === CAMP_G)!.conversionCounts.callClicks).toBe(4);
    expect(data.daily.map((d) => d.conversionCounts.callClicks)).toEqual([4, 0, 0]);
  });
});
