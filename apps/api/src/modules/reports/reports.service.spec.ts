import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ReportData, TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { KreatifAdresiService } from './kreatif-adresi.service';
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

  /*
   * KREATİF ADRESİ TAZELEME BU TESTLERDE DEVRE DIŞI.
   *
   * Buradaki testler SORGULARI sınıyor; tazeleme ise transaction kapandıktan
   * sonra platforma çıkan ayrı bir adım ve kendi testi var
   * (`kreatif-adresi.spec.ts`). Gerçeğini bağlamak, sorgu testlerini ağ ve
   * token'a bağımlı yapardı. `tazele` veriyi OLDUĞU GİBİ döndürüyor, yani bu
   * dosyadaki iddialar tazelemeden etkilenmiyor.
   */
  const kreatifAdresi = {
    tazele: async (_ctx: TenantContext, data: ReportData): Promise<ReportData> => data,
  } as unknown as KreatifAdresiService;

  svc = new ReportsService(prisma, kreatifAdresi);
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

  it('KRİTİK: REKLAM SEVİYESİ verisi olmayan platform bildiriliyor', async () => {
    /*
     * "Öne Çıkan Reklamlar" harcamaya göre sıralıyor ve platform ayırmıyor.
     * Meta'nın reklam seviyesi satırı hiç yoksa bölüm sessizce yalnızca
     * Google'ı gösteriyor ve okuyan "Meta'nın öne çıkan reklamı yokmuş" diye
     * anlıyor.
     *
     * Sebep yapısal: 90 günlük ilk çekim BİLEREK yalnızca kampanya
     * seviyesinde koşuyor — reklam kırılımı yalnızca gecelik iş ve 7 günlük
     * geri düzeltmeden geliyor. Üretimde tam olarak bu görüldü: temmuz
     * raporunda dört Google arama reklamı, tek Meta reklamı yok.
     */
    // Meta: yalnızca KAMPANYA seviyesi (ilk çekimin bıraktığı hâl).
    await seedRow({ entityId: CAMP_A, date: '2026-08-01', spendMicros: '1000000' });
    // Google: kampanya + REKLAM seviyesi.
    for (const [seviye, id] of [
      ['campaign', CAMP_B],
      ['ad', CAMP_B],
    ] as const) {
      await h.q(
        `INSERT INTO insights_daily
           (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
            date, breakdown_key, impressions, clicks, spend_micros, conversions,
            conversion_value_micros, currency, reach, raw_metrics)
         VALUES ($1, $2, 'google', $4::"EntityLevel", $3, 'ext-g', '2026-08-01'::date, '',
                 50, 5, 2000000, 0, 0, 'TRY', 0, '{}'::jsonb)`,
        [IDS.client, IDS.adAccount, id, seviye],
      );
    }

    const data = await svc.build(CTX, RANGE);
    expect(data.topAdsMissingPlatforms).toEqual(['meta']);
  });

  it('KRİTİK: öne çıkan reklamlar PLATFORM BAŞINA on ikiyle sınırlı', async () => {
    /*
     * Tek listede 6 iken harcaması büyük olan platform listeyi tamamen
     * dolduruyordu: Google'ın en iyi reklamı Meta'nın altında hiç
     * görünmüyordu. Sınır artık platform BAŞINA uygulanıyor.
     *
     * On beş reklam yazılıyor: sınırın gerçekten kestiğini görmek için
     * sınırdan fazlası gerekiyor.
     */
    for (const [platform, kampanya] of [
      ['meta', CAMP_A],
      ['google', CAMP_B],
    ] as const) {
      for (let i = 0; i < 15; i++) {
        const adId = `${platform === 'meta' ? 'a' : 'b'}${String(i).padStart(7, '0')}-0000-0000-0000-000000000000`;
        await h.q(
          `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, updated_at)
           VALUES ($1, $2, $3, $4, $5::"Platform", $6, 'G', now())
           ON CONFLICT DO NOTHING`,
          [adId, kampanya, IDS.adAccount, IDS.client, platform, `g-${platform}-${i}`],
        );
        await h.q(
          `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id, name, updated_at)
           VALUES ($1, $1, $2, $3, $4::"Platform", $5, $6, now())`,
          [adId, IDS.adAccount, IDS.client, platform, `ad-${platform}-${i}`, `${platform} ${i}`],
        );
        await h.q(
          `INSERT INTO insights_daily
             (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
              date, breakdown_key, impressions, clicks, spend_micros, conversions,
              conversion_value_micros, currency, reach, raw_metrics)
           VALUES ($1, $2, $3::"Platform", 'ad', $4, $5, '2026-08-01'::date, '',
                   10, 1, $6, 0, 0, 'TRY', 0, '{}'::jsonb)`,
          [IDS.client, IDS.adAccount, platform, adId, `ad-${platform}-${i}`, String((i + 1) * 1_000_000)],
        );
      }
    }

    const data = await svc.build(CTX, RANGE);
    const meta = data.topAds.filter((a) => a.platform === 'meta');
    const google = data.topAds.filter((a) => a.platform === 'google');
    expect(meta).toHaveLength(12);
    expect(google).toHaveLength(12);
    // En çok harcayan başta: sınır rastgele değil, sıralamanın tepesinden.
    expect(meta[0]!.spendMicros).toBe('15000000');
  });

  it('KRİTİK: HİÇ HARCAMAYAN platform "eksik" diye bildirilmiyor', async () => {
    /*
     * Uyarının anlamı "harcama var ama reklam kırılımı yok". Harcamamış bir
     * platform için de yazmak, olmayan bir eksikliği her raporda bildirmek
     * olurdu — ve her raporda duran bir uyarı okunmaz hâle gelir, gerçek
     * eksiklik onun içinde kaybolur.
     */
    await seedRow({ entityId: CAMP_A, date: '2026-08-01', spendMicros: '1000000' });
    // Google: satır VAR ama harcama SIFIR ve reklam seviyesi yok.
    await h.q(
      `INSERT INTO insights_daily
         (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
          date, breakdown_key, impressions, clicks, spend_micros, conversions,
          conversion_value_micros, currency, reach, raw_metrics)
       VALUES ($1, $2, 'google', 'campaign', $3, 'ext-g0', '2026-08-01'::date, '',
               10, 0, 0, 0, 0, 'TRY', 0, '{}'::jsonb)`,
      [IDS.client, IDS.adAccount, CAMP_B],
    );

    const data = await svc.build(CTX, RANGE);
    // Meta harcadı ve reklam kırılımı yok → bildiriliyor.
    // Google harcamadı → bildirilmiyor.
    expect(data.topAdsMissingPlatforms).toEqual(['meta']);
  });

  it('her iki platformda reklam verisi varsa eksik bildirilmiyor', async () => {
    // Her raporda duran bir uyarı okunmaz hâle gelir ve gerçek bir eksiklik
    // onun içinde kaybolur.
    for (const [platform, id] of [
      ['meta', CAMP_A],
      ['google', CAMP_B],
    ] as const) {
      for (const seviye of ['campaign', 'ad'] as const) {
        await h.q(
          `INSERT INTO insights_daily
             (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
              date, breakdown_key, impressions, clicks, spend_micros, conversions,
              conversion_value_micros, currency, reach, raw_metrics)
           VALUES ($1, $2, $5::"Platform", $4::"EntityLevel", $3, 'e-' || $5 || $4,
                   '2026-08-01'::date, '', 50, 5, 2000000, 0, 0, 'TRY', 0, '{}'::jsonb)`,
          [IDS.client, IDS.adAccount, id, seviye, platform],
        );
      }
    }

    const data = await svc.build(CTX, RANGE);
    expect(data.topAdsMissingPlatforms).toEqual([]);
  });

  /**
   * ═══ GÖRSEL ADRESİ: `asset_urls` İÇİNDE HER ZAMAN ADRES YOK ═══
   *
   * Google sağlayıcısı uzun süre `asset_urls`'e Google Ads'in KAYNAK ADINI
   * yazdı (`customers/…/assets/…`) — okuduğu alan `AdImageAsset.asset` ve o
   * bir URL değil. Kaynak adı da bir string olduğu için `typeof u ===
   * 'string'` süzgecinden geçiyor, `imageUrl`e yazılıyor ve TRUTHY oluyordu:
   * PDF "görseli var ama alınamadı" dalına giriyor, görüntülü reklamın metin
   * önizlemesine HİÇ ULAŞMIYOR ve dipnottaki sayaç şişiyordu — gerçek bir
   * arıza uydurma bir arızanın içinde kayboluyordu.
   *
   * Sağlayıcı bugün gerçek adresi çekiyor ama `asset_urls` tarihî satırlar
   * taşıyor ve bu sorgunun süzgeci bir kez de ayrışmıştı (panel yolu kontrol
   * ediyordu, rapor yolu etmiyordu). Bu yüzden iddia GERÇEK VERİTABANINA
   * karşı ve `imageUrl` alanının kendisine çapalı.
   */
  async function seedReklamVeKreatif(params: {
    adId: string;
    platform: 'meta' | 'google';
    campaignId: string;
    assetUrls: unknown[];
    spendMicros: string;
  }): Promise<void> {
    const kreatifId = params.adId.replace(/^./, 'c');
    await h.q(
      `INSERT INTO creatives (id, ad_account_id, client_id, platform, external_id, headline, asset_urls, updated_at)
       VALUES ($1, $2, $3, $4::"Platform", $5, 'Başlık', $6::jsonb, now())`,
      [
        kreatifId,
        IDS.adAccount,
        IDS.client,
        params.platform,
        `cr-${params.adId}`,
        JSON.stringify(params.assetUrls),
      ],
    );
    await h.q(
      `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, updated_at)
       VALUES ($1, $2, $3, $4, $5::"Platform", $6, 'G', now())`,
      [
        params.adId,
        params.campaignId,
        IDS.adAccount,
        IDS.client,
        params.platform,
        `g-${params.adId}`,
      ],
    );
    await h.q(
      `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id, name, creative_id, updated_at)
       VALUES ($1, $1, $2, $3, $4::"Platform", $5, 'Reklam', $6, now())`,
      [params.adId, IDS.adAccount, IDS.client, params.platform, `ad-${params.adId}`, kreatifId],
    );
    await h.q(
      `INSERT INTO insights_daily
         (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
          date, breakdown_key, impressions, clicks, spend_micros, conversions,
          conversion_value_micros, currency, reach, raw_metrics)
       VALUES ($1, $2, $3::"Platform", 'ad', $4, $5, '2026-08-01'::date, '',
               10, 1, $6, 0, 0, 'TRY', 0, '{}'::jsonb)`,
      [
        IDS.client,
        IDS.adAccount,
        params.platform,
        params.adId,
        `ad-${params.adId}`,
        params.spendMicros,
      ],
    );
  }

  const KAYNAK_ADI = 'customers/1234567890/assets/98765';
  const GERCEK_ADRES = 'https://tpc.googlesyndication.com/simgad/98765';

  it('KRİTİK: Google KAYNAK ADI `imageUrl`e SIZMIYOR', async () => {
    await seedReklamVeKreatif({
      adId: 'd0000001-0000-0000-0000-000000000000',
      platform: 'google',
      campaignId: CAMP_B,
      assetUrls: [KAYNAK_ADI],
      spendMicros: '5000000',
    });

    const data = await svc.build(CTX, RANGE);
    const reklam = data.topAds.find((a) => a.id === 'd0000001-0000-0000-0000-000000000000');

    expect(reklam, 'reklam listeye girmedi — test boşa düştü').toBeDefined();
    expect(reklam!.imageUrl).toBeNull();
  });

  it('KRİTİK: GERÇEK adres `imageUrl`e geçiyor', async () => {
    /*
     * Önceki iddianın tek başına anlamı yok: `imageUrl`i her zaman `null`
     * yapan bir mutasyon da onu geçirirdi. Süzgecin ELEDİĞİ ve GEÇİRDİĞİ
     * birlikte kilitleniyor.
     */
    await seedReklamVeKreatif({
      adId: 'd0000002-0000-0000-0000-000000000000',
      platform: 'google',
      campaignId: CAMP_B,
      assetUrls: [GERCEK_ADRES],
      spendMicros: '4000000',
    });

    const data = await svc.build(CTX, RANGE);
    const reklam = data.topAds.find((a) => a.id === 'd0000002-0000-0000-0000-000000000000');

    expect(reklam!.imageUrl).toBe(GERCEK_ADRES);
  });

  it('KRİTİK: karışık dizide kaynak adı atlanıp ADRES seçiliyor', async () => {
    /*
     * Sıra garanti değil: tarihî bir satırda kaynak adı ÖNDE olabiliyor.
     * "İlkini al" diyen bir kod burada yine kaynak adını seçerdi ve hata
     * yalnızca bazı reklamlarda görünürdü — teşhisi en zor tür.
     */
    await seedReklamVeKreatif({
      adId: 'd0000003-0000-0000-0000-000000000000',
      platform: 'google',
      campaignId: CAMP_B,
      assetUrls: [KAYNAK_ADI, GERCEK_ADRES],
      spendMicros: '3000000',
    });

    const data = await svc.build(CTX, RANGE);
    const reklam = data.topAds.find((a) => a.id === 'd0000003-0000-0000-0000-000000000000');

    expect(reklam!.imageUrl).toBe(GERCEK_ADRES);
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

/**
 * ═══ ŞABLONUN RAPORA ULAŞMASI ═══
 *
 * Şablon kaydediliyordu ama belgeye YALNIZCA `sections` ulaşıyordu:
 * `options` kolonu okunmuyordu bile. Bir ayarı kaydedip hiçbir yerde
 * göremeyen kullanıcı, özelliğin bozuk olduğunu değil kendi yaptığını
 * yanlış yaptığını düşünür.
 */
describe('ReportsService — şablon', () => {
  async function sablonEkle(over: {
    clientId?: string | null;
    sections?: string[];
    options?: unknown;
    title?: string;
    updatedAt?: string;
  } = {}): Promise<string> {
    const rows = await h.q<{ id: string }>(
      `INSERT INTO report_templates (id, org_id, client_id, name, title, sections, options, status, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'Şablon', $3, $4::jsonb, $5::jsonb, 'published', $6::timestamptz)
       RETURNING id`,
      [
        IDS.org,
        over.clientId === undefined ? IDS.client : over.clientId,
        over.title ?? 'Başlık',
        JSON.stringify(over.sections ?? ['cover', 'summary', 'closing']),
        JSON.stringify(over.options ?? {}),
        over.updatedAt ?? '2026-08-01T00:00:00Z',
      ],
    );
    return rows[0]!.id;
  }

  it('KRİTİK: bölüm AYARLARI belgeye ulaşıyor', async () => {
    await sablonEkle({ options: { meta_campaigns: { metrics: ['spend', 'clicks'], limit: 5 } } });
    const data = await svc.build(CTX, RANGE);
    expect(data.options.meta_campaigns).toEqual({ metrics: ['spend', 'clicks'], limit: 5 });
  });

  it('bölüm sırası şablondan geliyor', async () => {
    await sablonEkle({ sections: ['closing', 'cover'] });
    expect((await svc.build(CTX, RANGE)).sections).toEqual(['closing', 'cover']);
  });

  it('KRİTİK: bozuk options belgeye HAM geçmiyor', async () => {
    await sablonEkle({ options: { meta_campaigns: { metrics: ['uydurma'] } } });
    expect((await svc.build(CTX, RANGE)).options).toEqual({});
  });

  it('şablon yoksa TÜM bölümler — boş rapor üretilmiyor', async () => {
    const data = await svc.build(CTX, RANGE);
    expect(data.sections.length).toBeGreaterThan(3);
    expect(data.options).toEqual({});
  });

  it('KRİTİK: aynı müşteride iki şablon varsa EN SON GÜNCELLENEN geliyor', async () => {
    /*
     * Sıralama eskiden yalnızca `client_id NULLS LAST` idi: aynı müşteriye
     * ikinci bir şablon kaydedilince hangisinin geleceği BELİRSİZDİ ve
     * çağrıdan çağrıya değişebilirdi — sessizce yanlış rapor.
     */
    await sablonEkle({ sections: ['cover'], updatedAt: '2026-08-01T00:00:00Z' });
    await sablonEkle({ sections: ['closing'], updatedAt: '2026-08-10T00:00:00Z' });
    expect((await svc.build(CTX, RANGE)).sections).toEqual(['closing']);
  });

  it('müşteriye özel şablon ORG VARSAYILANININ önünde', async () => {
    await sablonEkle({ clientId: null, sections: ['cover'] });
    await sablonEkle({ clientId: IDS.client, sections: ['summary'] });
    expect((await svc.build(CTX, RANGE)).sections).toEqual(['summary']);
  });

  it('KRİTİK: BAŞKA müşterinin şablonu kimliğiyle kullanılamıyor', async () => {
    /*
     * `templateId` adres çubuğundan geliyor. Org yöneticisi RLS'i geçtiği
     * için sahiplik kontrolü olmadan başka bir müşterinin şablonuyla rapor
     * üretilebiliyordu — o müşterinin başlığı ve kapanış metniyle.
     */
    await h.q(
      `INSERT INTO clients (id, org_id, slug, name, timezone, reporting_currency, status, created_at, updated_at)
       VALUES ($1, $2, 'diger-musteri', 'Diğer Müşteri', 'Europe/Istanbul', 'TRY', 'active', now(), now())`,
      ['dddddddd-dddd-dddd-dddd-dddddddddddd', IDS.org],
    );
    const yabanci = await sablonEkle({
      clientId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      sections: ['closing'],
      title: 'Yabancı başlık',
    });

    const data = await svc.build(CTX, { ...RANGE, templateId: yabanci });
    // Yabancı şablon YOK SAYILIYOR: varsayılan bölümlere düşülüyor.
    expect(data.sections.length).toBeGreaterThan(3);
    expect(data.title).not.toBe('Yabancı başlık');
  });
});

/**
 * ARAMA TERİMLERİ — kullanıcının gerçekten YAZDIĞI sorgular.
 *
 * `keywords` ile aynı `null` kuralı: Google bağlantısı yoksa "bu yetenek
 * yok" demek için `null`. Boş dizi göstermek "hiç arama yok" demek olurdu.
 */
describe('ReportsService — arama terimleri', () => {
  async function googleHesap(): Promise<void> {
    await h.q("UPDATE ad_accounts SET platform = 'google', sync_enabled = true WHERE id = $1", [
      IDS.adAccount,
    ]);
  }

  async function terim(over: Record<string, unknown> = {}): Promise<void> {
    await h.q(
      `INSERT INTO search_term_insights
         (client_id, ad_account_id, term_hash, search_term, keyword_text, status,
          date, impressions, clicks, spend_micros, conversions, conversion_value_micros, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11, 0, 'TRY')`,
      [
        IDS.client,
        IDS.adAccount,
        (over.hash as string) ?? 'h1',
        (over.term as string) ?? 'urla satılık villa',
        (over.keyword as string) ?? 'urla villa',
        (over.status as string) ?? 'NONE',
        (over.date as string) ?? '2026-08-01',
        (over.impressions as number) ?? 100,
        (over.clicks as number) ?? 10,
        (over.spend as string) ?? '5000000',
        (over.conversions as number) ?? 1,
      ],
    );
  }

  it('KRİTİK: Google bağlantısı yoksa null — "yetenek yok" ile "veri yok" farklı', async () => {
    const data = await svc.build(CTX, RANGE);
    expect(data.searchTerms).toBeNull();
  });

  it('Google varsa ama terim yoksa BOŞ DİZİ', async () => {
    await googleHesap();
    expect((await svc.build(CTX, RANGE)).searchTerms).toEqual([]);
  });

  it('terimler harcamaya göre sıralı geliyor', async () => {
    await googleHesap();
    await terim({ hash: 'h1', term: 'az harcayan', spend: '1000000' });
    await terim({ hash: 'h2', term: 'çok harcayan', spend: '9000000' });
    const t = (await svc.build(CTX, RANGE)).searchTerms!;
    expect(t.map((x) => x.term)).toEqual(['çok harcayan', 'az harcayan']);
  });

  it('AYNI terim farklı günlerde BİRLEŞİYOR', async () => {
    // Müşteriye aynı sorguyu iki satır göstermek "aynı şeye iki kez mi para
    // verdik" sorusunu doğurur.
    await googleHesap();
    await terim({ hash: 'h1', date: '2026-08-01', clicks: 10, spend: '5000000' });
    await terim({ hash: 'h1', date: '2026-08-02', clicks: 4, spend: '2000000' });
    const t = (await svc.build(CTX, RANGE)).searchTerms!;
    expect(t).toHaveLength(1);
    expect(t[0]!.clicks).toBe(14);
    expect(t[0]!.spendMicros).toBe('7000000');
  });

  it('KRİTİK: durumda TANIMLI olan kazanıyor — bitmiş iş listede kalmamalı', async () => {
    /*
     * Terim bir gün eklenmiş, başka bir gün tanımsız görünmüş olabilir.
     * "NONE" göstermek kullanıcıyı zaten yaptığı işi tekrar yapmaya iterdi.
     */
    await googleHesap();
    await terim({ hash: 'h1', date: '2026-08-01', status: 'NONE' });
    await terim({ hash: 'h1', date: '2026-08-02', status: 'ADDED' });
    expect((await svc.build(CTX, RANGE)).searchTerms![0]!.status).toBe('ADDED');
  });

  it("KRİTİK: kural ALFABETİK sıraya bağlı DEĞİL", async () => {
    /*
     * Bugünkü durum adlarının hepsi ('ADDED', 'EXCLUDED', 'ADDED_EXCLUDED')
     * alfabetik olarak 'NONE'dan ÖNCE geliyor; yani basit bir `MIN()` de
     * tesadüfen doğru sonucu veriyor ve ilk yazdığım test bunu ayırt
     * edemiyordu — mutasyon denemesinde görüldü.
     *
     * Google yarın 'UNKNOWN' gibi 'NONE'dan SONRA gelen bir durum eklerse o
     * tesadüf bozulur ve tanımlı bir terim "tanımsız" görünür. Kural bu
     * yüzden açıkça "NONE olmayan kazanır" diye yazılı.
     */
    await googleHesap();
    await terim({ hash: 'h1', date: '2026-08-01', status: 'NONE' });
    await terim({ hash: 'h1', date: '2026-08-02', status: 'UNKNOWN' });
    expect((await svc.build(CTX, RANGE)).searchTerms![0]!.status).toBe('UNKNOWN');
  });

  it('gösterim almamış terim listeye GİRMİYOR', async () => {
    await googleHesap();
    await terim({ hash: 'h1', impressions: 0, clicks: 0 });
    expect((await svc.build(CTX, RANGE)).searchTerms).toEqual([]);
  });

  it('aralık DIŞINDAKİ gün sayılmıyor', async () => {
    await googleHesap();
    await terim({ hash: 'h1', date: '2026-09-01' });
    expect((await svc.build(CTX, RANGE)).searchTerms).toEqual([]);
  });
});
