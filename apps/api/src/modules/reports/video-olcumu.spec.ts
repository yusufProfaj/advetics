import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COLUMN_TOTALS,
  DEFAULT_COLUMNS,
  VIDEO_KEYS,
  bosRaporVideo,
  kampanyaTablolari,
  resolveColumns,
  sumRows,
  tabloNotlari,
  videoHucresi,
  type RaporVideo,
  type ReportCampaignRow,
  type ReportData,
  type TenantContext,
} from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import {
  GOOGLE_VIDEO_KANALLARI,
  GoogleProvider,
  googleVideoHam,
  googleVideoSorgusu,
} from '../connections/providers/google.provider';
import { META_VIDEO_CEYREK_ALANLARI, MetaProvider, metaInsightAlanlari } from '../connections/providers/meta.provider';
import type { KreatifAdresiService } from './kreatif-adresi.service';
import { ReportsService } from './reports.service';

/**
 * ═══ VİDEO ÖLÇÜMÜ VE RAPORU (2026-10-13) ═══
 *
 *  B2 Meta: "izlenme" YALNIZ ThruPlay; 3 sn oynatma ayrı (`raw.video`).
 *     Çeyrekler isteğe bağlı alan: reddedilirse istek çeyreksiz tekrar,
 *     hata ham gövdede.
 *  B3 Google: TrueView ayrı ek sorguda, yalnız video kanalında; düşerse
 *     ana çekim sürer, hata ham gövdede, izlenme NULL (0 değil).
 *  B4 Rapor: sütunlar veriyle açılır (kullanıcı seçimine eklenmez),
 *     okunamayan "okunamadı" yazar, panel ve PDF aynı biçimci.
 * Canlı çağrı YOK.
 */

const YANIT = (govde: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => govde,
    text: async () => JSON.stringify(govde),
  }) as unknown as Response;

const ISTEK = { level: 'campaign', dateFrom: '2026-10-01', dateTo: '2026-10-01', timezone: 'Europe/Istanbul' } as const;
const aksiyon = (v: string) => [{ action_type: 'video_view', value: v }];

describe('B2 — Meta: ThruPlay ve oynatma ayrı, çeyrekler ham gövdede', () => {
  let orijinal: typeof fetch;
  beforeEach(() => {
    orijinal = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = orijinal;
  });
  const meta = () => new MetaProvider({ platforms: { meta: { appId: 'a', appSecret: 's', apiVersion: 'v25.0' } } } as never);
  const ctx = { accessToken: 't', accountExternalId: 'act_1' } as never;

  it('KRİTİK: izlenme YALNIZ ThruPlay; ThruPlay yoksa oynatmaya DÜŞMEZ (0), oynatma ayrı', async () => {
    globalThis.fetch = vi.fn(async () =>
      YANIT({
        data: [
          {
            date_start: '2026-10-01', campaign_id: 'c1', impressions: '1000', spend: '10',
            video_thruplay_watched_actions: aksiyon('120'), video_play_actions: aksiyon('900'),
            video_p25_watched_actions: aksiyon('400'), video_p50_watched_actions: aksiyon('250'),
            video_p75_watched_actions: aksiyon('150'), video_p100_watched_actions: aksiyon('90'),
          },
          { date_start: '2026-10-01', campaign_id: 'c2', impressions: '500', spend: '5', video_play_actions: aksiyon('300') },
          { date_start: '2026-10-01', campaign_id: 'c3', impressions: '500', spend: '5' },
        ],
      }),
    ) as unknown as typeof fetch;
    const r = await meta().fetchInsights(ctx, ISTEK as never);
    const [c1, c2, c3] = r.rows;
    expect(c1!.videoViews).toBe(120);
    expect(c1!.raw).toMatchObject({ video: { oynatma: 900, p25: 400, p50: 250, p75: 150, p100: 90 } });
    expect(c2!.videoViews).toBe(0);
    expect(c2!.raw).toMatchObject({ video: { oynatma: 300 } });
    // Videosuz satıra video nesnesi eklenmiyor (rapor sütunu açmasın).
    expect(c3!.raw).not.toHaveProperty('video');
  });

  it('KRİTİK: çeyrek alanı REDDEDİLİRSE istek çeyreksiz tekrarlanır; ThruPlay gelir, çeyrekler null, hata gövdede', async () => {
    const f = vi.fn(async (url: string) => {
      const alanlar = new URL(url).searchParams.get('fields') ?? '';
      if (alanlar.includes('video_p25_watched_actions')) {
        return YANIT({ error: { message: '(#100) video_p25_watched_actions is not valid for fields param', type: 'OAuthException', code: 100 } }, 400);
      }
      return YANIT({ data: [{ date_start: '2026-10-01', campaign_id: 'c1', impressions: '1000', spend: '10', video_thruplay_watched_actions: aksiyon('120') }] });
    });
    globalThis.fetch = f as unknown as typeof fetch;
    const r = await meta().fetchInsights(ctx, ISTEK as never);
    expect(f).toHaveBeenCalledTimes(2);
    const ikinci = new URL(f.mock.calls[1]![0]).searchParams.get('fields')!;
    for (const a of META_VIDEO_CEYREK_ALANLARI) expect(ikinci).not.toContain(a);
    expect(ikinci).toContain('video_thruplay_watched_actions');
    expect(r.rows[0]!.videoViews).toBe(120);
    expect(r.rows[0]!.raw).toMatchObject({ video: { p25: null, p100: null }, videoMetricsError: expect.stringContaining('video_p25') });
  });

  it('başka bir hata TEKRARLANMAZ, fırlatılır (gerçek arıza çeyreksiz başarıya dönmemeli)', async () => {
    const f = vi.fn(async () => YANIT({ error: { message: '(#100) Invalid parameter', code: 100 } }, 400));
    globalThis.fetch = f as unknown as typeof fetch;
    await expect(meta().fetchInsights(ctx, ISTEK as never)).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('alan listesi: çeyrekler yalnız istenince; belgedeki dört ad', () => {
    expect(metaInsightAlanlari('campaign', false)).not.toContain('video_p25_watched_actions');
    expect(metaInsightAlanlari('campaign', true)).toEqual(expect.arrayContaining([...META_VIDEO_CEYREK_ALANLARI]));
    expect([...META_VIDEO_CEYREK_ALANLARI]).toEqual([
      'video_p25_watched_actions',
      'video_p50_watched_actions',
      'video_p75_watched_actions',
      'video_p100_watched_actions',
    ]);
  });
});

describe('B3 — Google: TrueView ayrı sorguda, yalnız video kanalında', () => {
  afterEach(() => vi.restoreAllMocks());
  const saglayici = () =>
    new GoogleProvider({ platforms: { google: { clientId: 'c', clientSecret: 's', developerToken: 'd', apiVersion: 'v25' } } } as never);
  const ANA = [
    { campaign: { id: '55', advertisingChannelType: 'VIDEO' }, segments: { date: '2026-10-01' }, customer: { currencyCode: 'TRY' }, metrics: { impressions: 1000, clicks: 10, costMicros: '5000000' } },
    { campaign: { id: '66', advertisingChannelType: 'SEARCH' }, segments: { date: '2026-10-01' }, customer: { currencyCode: 'TRY' }, metrics: { impressions: 200, clicks: 20, costMicros: '3000000' } },
  ];
  const cagir = (p: GoogleProvider, video: (q: string) => unknown) => {
    const sorgular: string[] = [];
    vi.spyOn(p as never, 'searchGaqlPaged').mockImplementation((async (_t: string, _c: string, q: string) => {
      sorgular.push(q);
      if (q.includes('video_trueview_views')) return video(q);
      if (q.includes('FROM campaign') && q.includes('cost_micros')) return ANA;
      return [];
    }) as never);
    return sorgular;
  };

  it('KRİTİK: başarıda video kampanyası TrueView + çeyrek SAYISI (oran × gösterim); arama kampanyası NULL', async () => {
    const p = saglayici();
    cagir(p, () => [
      { campaign: { id: '55' }, segments: { date: '2026-10-01' }, metrics: { videoTrueviewViews: '320', videoQuartileP25Rate: 0.5, videoQuartileP50Rate: 0.3, videoQuartileP75Rate: 0.2, videoQuartileP100Rate: 0.1 } },
    ]);
    const r = await p.fetchInsights({ accessToken: 't', accountExternalId: '1234567890' } as never, ISTEK as never);
    const v = r.rows.find((x) => x.entityExternalId === '55')!;
    const s = r.rows.find((x) => x.entityExternalId === '66')!;
    expect(v.videoViews).toBe(320);
    expect(v.raw).toMatchObject({ video: { oynatma: null, p25: 500, p50: 300, p75: 200, p100: 100 } });
    // Ana satırın gösterimi/harcaması değişmiyor (segment yok, çoğaltma yok).
    expect(v.impressions).toBe(1000);
    expect(v.spendMicros).toBe(5_000_000n);
    expect(s.videoViews).toBeNull();
    expect(s.raw).not.toHaveProperty('video');
    expect(s.raw).not.toHaveProperty('videoMetricsError');
  });

  it('KRİTİK: ek sorgu DÜŞERSE ana çekim sürer; video satırında izlenme NULL ve hata gövdede (0 yazılmaz)', async () => {
    const p = saglayici();
    cagir(p, () => {
      throw new Error("UNRECOGNIZED_FIELD 'metrics.video_trueview_views'");
    });
    const r = await p.fetchInsights({ accessToken: 't', accountExternalId: '1234567890' } as never, ISTEK as never);
    const v = r.rows.find((x) => x.entityExternalId === '55')!;
    expect(r.rows).toHaveLength(2);
    expect(v.videoViews).toBeNull();
    expect(v.raw).toMatchObject({ videoMetricsError: expect.stringContaining('video_trueview_views') });
    expect(v.raw).not.toHaveProperty('video');
    // Video olmayan kampanyaya hata yazılmıyor: arama raporu "okunamadı" demesin.
    expect(r.rows.find((x) => x.entityExternalId === '66')!.raw).not.toHaveProperty('videoMetricsError');
  });

  it('video kanalı yoksa ek sorgu HİÇ koşmaz (kota); reklam seviyesinde de sorulmaz', async () => {
    const p = saglayici();
    const sorgular: string[] = [];
    vi.spyOn(p as never, 'searchGaqlPaged').mockImplementation((async (_t: string, _c: string, q: string) => {
      sorgular.push(q);
      return q.includes('cost_micros') ? [ANA[1]] : [];
    }) as never);
    const r = await p.fetchInsights({ accessToken: 't', accountExternalId: '1234567890' } as never, ISTEK as never);
    expect(r.rows).toHaveLength(1);
    expect(sorgular.some((q) => q.includes('video_trueview_views'))).toBe(false);

    const p2 = saglayici();
    const s2 = cagir(p2, () => []);
    await p2.fetchInsights({ accessToken: 't', accountExternalId: '1234567890' } as never, { ...ISTEK, level: 'ad' } as never);
    expect(s2.some((q) => q.includes('video_trueview_views'))).toBe(false);
  });

  it('KRİTİK: ana sorgu video alanı TAŞIMIYOR (kanal yalnız kampanyada); ek sorgu YALNIZ video metrikleri ve kanal süzgeci', async () => {
    const p = saglayici();
    const sorgular = cagir(p, () => []);
    await p.fetchInsights({ accessToken: 't', accountExternalId: '1234567890' } as never, ISTEK as never);
    const ana = sorgular.find((q) => q.includes('cost_micros'))!;
    expect(ana).not.toMatch(/video_/);
    expect(ana).toContain('campaign.advertising_channel_type');
    // Diğer seviyelerde nitelik yolu farklı: kanal yalnız kampanyada.
    const p2 = saglayici();
    const s2 = cagir(p2, () => []);
    await p2.fetchInsights({ accessToken: 't', accountExternalId: '1234567890' } as never, { ...ISTEK, level: 'ad_group' } as never);
    expect(s2.find((q) => q.includes('cost_micros'))).not.toContain('advertising_channel_type');
    const ek = googleVideoSorgusu('2026-10-01', '2026-10-02');
    expect(ek).toContain('metrics.video_trueview_views');
    expect(ek).not.toMatch(/impressions|cost_micros|conversions|clicks/);
    // Satırı çoğaltan bir segment yok: yalnız tarih.
    expect(ek.match(/segments\.\w+/g)).toEqual(['segments.date', 'segments.date']);
    for (const k of GOOGLE_VIDEO_KANALLARI) expect(ek).toContain(`'${k}'`);
    // Kaynakta ana sorgu bu üreticiden geçiyor (elle ikinci kopya yok).
    const KAYNAK = readFileSync(join(__dirname, '../connections/providers/google.provider.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const bas = KAYNAK.indexOf('async fetchInsights(');
    const son = KAYNAK.indexOf('private async donusumDetaylari(');
    expect(bas).toBeGreaterThan(-1);
    expect(son).toBeGreaterThan(bas);
    const govde = KAYNAK.slice(bas, son);
    expect(govde).toContain('metrics.cost_micros');
    expect(govde).not.toContain('video_trueview');
    expect(govde).toContain('this.videoOlcumleri(');
  });

  it('oran ölçüm satırı yoksa çeyrek 0; alan dönmediyse null', () => {
    expect(googleVideoHam(undefined, 100)).toEqual({ oynatma: null, p25: 0, p50: 0, p75: 0, p100: 0 });
    expect(googleVideoHam({ izlenme: 1, p25: null, p50: 0.5, p75: null, p100: null }, 100).p25).toBeNull();
  });
});

describe('B4 — rapor sütunları (paylaşılan karar)', () => {
  const v = (over: Partial<RaporVideo> = {}): RaporVideo => ({ ...bosRaporVideo(), ...over });
  const satir = (video: RaporVideo, spend = '1000000') =>
    ({ spendMicros: spend, impressions: 0, clicks: 0, conversions: 0, conversionValueMicros: '0', conversionCounts: { form: 0, message: 0, purchase: 0, calls: 0, calls20s: 0, callClicks: 0 }, video }) as unknown as ReportCampaignRow;

  it('KRİTİK: izlenme varsa varsayılan sütunlara eklenir, yoksa eklenmez; çeyrek yalnız çeyrek verisiyle', () => {
    const izl = resolveColumns(undefined, DEFAULT_COLUMNS.meta_campaigns, [satir(v({ izlenme: 50, harcamaMicros: '1000000' }))]);
    expect(izl).toEqual(expect.arrayContaining(['videoViews', 'costPerView']));
    expect(izl).not.toContain('videoP25');
    expect(resolveColumns(undefined, DEFAULT_COLUMNS.meta_campaigns, [satir(v({ izlenme: 50, p25: 30 }))])).toEqual(expect.arrayContaining([...VIDEO_KEYS]));
    expect(resolveColumns(undefined, DEFAULT_COLUMNS.meta_campaigns, [satir(v({ izlenme: 0 }))]).some((k) => (VIDEO_KEYS as readonly string[]).includes(k))).toBe(false);
  });

  it('KRİTİK: okunamayan izlenme de sütunu açar ve "okunamadı" yazar, 0 DEĞİL', () => {
    const r = satir(v({ okunamadi: true }));
    expect(resolveColumns(undefined, DEFAULT_COLUMNS.google_campaigns, [r])).toContain('videoViews');
    expect(videoHucresi('videoViews', r.video, 'TRY')).toBe('okunamadı');
    expect(videoHucresi('costPerView', r.video, 'TRY')).toBe('okunamadı');
    // Sorulmamış (hata yok) "—".
    expect(videoHucresi('videoViews', bosRaporVideo(), 'TRY')).toBe('—');
  });

  it('kullanıcının kendi seçimine video sütunu EKLENMEZ', () => {
    expect(resolveColumns(['spend', 'clicks'], DEFAULT_COLUMNS.meta_campaigns, [satir(v({ izlenme: 50 }))])).toEqual(['spend', 'clicks']);
  });

  it('KRİTİK: toplam null\'ları atlar; izlenme başı maliyet yalnız okunan günlerin harcamasıyla', () => {
    const t = sumRows([
      satir(v({ izlenme: 100, harcamaMicros: '50000000', p25: 40 }), '50000000'),
      satir(v({ izlenme: null, okunamadi: true }), '900000000'),
      satir(v({ izlenme: 100, harcamaMicros: '150000000', p25: null }), '150000000'),
    ]);
    expect(t.video.izlenme).toBe(200);
    expect(t.video.p25).toBe(40);
    expect(t.video.okunamadi).toBe(true);
    // (50 + 150) ₺ / 200 izlenme = 1 ₺ — okunamayan satırın 900 ₺'si paya girmiyor.
    expect(COLUMN_TOTALS.costPerView!(t, 'TRY')).toBe(videoHucresi('costPerView', v({ izlenme: 1, harcamaMicros: '1000000' }), 'TRY'));
  });

  /*
   * Ajan 4 mutasyon boşluğu: null'u 0 sayan bir toplayıcı yukarıdaki testi
   * GEÇİYORDU (bir satır dolu olunca toplam yine 200). Bütün satırlar
   * okunamadıysa toplam da okunamadı kalmalı; "0 izlenme" müşteriye
   * alınamayan ölçümü "kimse izlemedi" diye söyler.
   */
  it('KRİTİK: bütün satırlar okunamadıysa TOPLAM da okunamadı, 0 değil', () => {
    const t = sumRows([satir(v({ izlenme: null, okunamadi: true }), '900000000'), satir(v({ izlenme: null, okunamadi: true }), '100000000')]);
    expect(t.video.izlenme).toBeNull();
    expect(t.video.p25).toBeNull();
    expect(COLUMN_TOTALS.videoViews!(t, 'TRY')).toBe('okunamadı');
    expect(COLUMN_TOTALS.costPerView!(t, 'TRY')).toBe('okunamadı');
  });

  it('KRİTİK: video sütunları ana tabloya girmez; video tablosu yalnız ölçümü olan kampanyalar ve sayısı yazılı', () => {
    const satirlar = [satir(v({ izlenme: 50 })), satir(v({ izlenme: 0 })), satir(v({ okunamadi: true }))];
    const sutunlar = resolveColumns(undefined, DEFAULT_COLUMNS.meta_campaigns, satirlar);
    const b = kampanyaTablolari(sutunlar, satirlar);
    expect(b.ana.some((k) => (VIDEO_KEYS as readonly string[]).includes(k))).toBe(false);
    expect(b.ana).toEqual([...DEFAULT_COLUMNS.meta_campaigns]);
    expect(b.video!.sutunlar).toEqual(['videoViews', 'costPerView']);
    expect(b.video!.satirlar).toHaveLength(2);
    expect(b.video!.aciklama).toBe('Video ölçümü olan 2 kampanya (tablodaki 3 kampanyadan).');
    expect(kampanyaTablolari(['spend'], satirlar).video).toBeNull();
  });

  it('video hata notu ilgili platformun tablosunun üstünde, öbüründe değil', () => {
    const d = { unknownCallActions: [], callClicksErrors: [], videoMetricsErrors: [{ platform: 'google' as const, mesaj: 'UNRECOGNIZED_FIELD_v' }] };
    expect(tabloNotlari(d, 'google_campaigns').some((n) => n.includes('UNRECOGNIZED_FIELD_v') && n.includes('okunamadı'))).toBe(true);
    expect(tabloNotlari(d, 'meta_campaigns')).toEqual([]);
  });
});

describe('B4 — rapor sorgusu (PGlite)', () => {
  let h: Harness;
  let svc: ReportsService;
  const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], isOrgAdmin: true } as TenantContext;
  const VIDEO_K = '6b6b6b6b-0000-4000-8000-000000000001';
  const ARAMA_K = '6b6b6b6b-0000-4000-8000-000000000002';
  const META_K = '6b6b6b6b-0000-4000-8000-000000000003';
  const RANGE = { clientId: IDS.client, from: '2026-08-01', to: '2026-08-03' };

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
    await seedTenant(h);
    for (const [id, p] of [[VIDEO_K, 'google'], [ARAMA_K, 'google'], [META_K, 'meta']] as const) {
      await h.q(
        `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
         VALUES ($1, $2, $3, $4::"Platform", $5, $5, 'active', 'daily', now())`,
        [id, IDS.adAccount, IDS.client, p, `k-${id.slice(-4)}`],
      );
    }
    svc = new ReportsService(
      { withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService,
      { tazele: async (_c: TenantContext, d: ReportData) => d } as unknown as KreatifAdresiService,
    );
  });

  async function gun(id: string, platform: 'meta' | 'google', date: string, videoViews: number | null, raw: Record<string, unknown>, spend = '10000000') {
    await h.q(
      `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date, breakdown_key,
         impressions, clicks, spend_micros, conversions, conversion_value_micros, video_views, currency, reach, raw_metrics)
       VALUES ($1, $2, $3::"Platform", 'campaign', $4, 'x', $5::date, '', 1000, 10, $6, 0, 0, $7, 'TRY', 0, $8::jsonb)`,
      [IDS.client, IDS.adAccount, platform, id, date, spend, videoViews, JSON.stringify(raw)],
    );
  }

  it('KRİTİK: okunan günler toplanır, okunamayan gün NULL kalır ve işaretlenir; arama kampanyası "—"', async () => {
    await gun(VIDEO_K, 'google', '2026-08-01', 100, { video: { oynatma: null, p25: 60, p50: 40, p75: 20, p100: 10 } }, '20000000');
    await gun(VIDEO_K, 'google', '2026-08-02', null, { videoMetricsError: 'UNRECOGNIZED_FIELD_v' }, '500000000');
    await gun(ARAMA_K, 'google', '2026-08-01', null, {});
    const d = await svc.build(CTX, RANGE);
    const video = d.googleCampaigns.find((c) => c.id === VIDEO_K)!.video;
    expect(video).toEqual({ izlenme: 100, okunamadi: true, harcamaMicros: '20000000', p25: 60, p50: 40, p75: 20, p100: 10 });
    const arama = d.googleCampaigns.find((c) => c.id === ARAMA_K)!.video;
    expect(arama.izlenme).toBeNull();
    expect(arama.okunamadi).toBe(false);
    expect(videoHucresi('videoViews', arama, 'TRY')).toBe('—');
    expect(d.videoMetricsErrors).toEqual([{ platform: 'google', mesaj: 'UNRECOGNIZED_FIELD_v' }]);
  });

  it('KRİTİK: hiç okunmamış kampanya "okunamadı" (NULL), 0 değil; Meta ThruPlay sayılır', async () => {
    await gun(VIDEO_K, 'google', '2026-08-01', null, { videoMetricsError: 'x' });
    await gun(META_K, 'meta', '2026-08-01', 70, { actions: [], video: { oynatma: 500, p25: 200, p50: 100, p75: 80, p100: 60 } });
    await gun(META_K, 'meta', '2026-08-02', 30, { actions: [] });
    const d = await svc.build(CTX, RANGE);
    const g = d.googleCampaigns.find((c) => c.id === VIDEO_K)!.video;
    expect(g.izlenme).toBeNull();
    expect(videoHucresi('videoViews', g, 'TRY')).toBe('okunamadı');
    const m = d.metaCampaigns.find((c) => c.id === META_K)!.video;
    expect(m.izlenme).toBe(100);
    expect(m.p25).toBe(200);
    expect(m.harcamaMicros).toBe('20000000');
  });
});
