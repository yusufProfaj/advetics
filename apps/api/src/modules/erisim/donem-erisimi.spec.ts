import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MetaProvider } from '../connections/providers/meta.provider';
import { GECMIS_ONBELLEK_MS, TAZE_ONBELLEK_MS, DonemErisimiService, donemKapandiMi, type ErisimHesabi } from './donem-erisimi.service';

/**
 * ═══ DÖNEMİN TEKİL ERİŞİMİ (erişim ölçümü düzeltmesi, 2026-10-13) ═══
 *
 * Rapor ve kural motoru erişimi günlük satırlardan türetiyordu: rapor
 * ortalamayı basıyor (kitle kat kat küçük), kural motoru frekansı pencere
 * uzunluğu kadar büyük hesaplıyordu (çalışan reklam "yoruldu" diye
 * durduruluyordu). Doğru kaynak Meta'nın `all_days` hesabı. Canlı çağrı YOK:
 * istek biçimi ve okuyucunun kota/önbellek/hata sırası sınanıyor.
 */

const YANIT = (govde: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => govde,
    text: async () => JSON.stringify(govde),
  }) as unknown as Response;

describe('Meta fetchPeriodReach — istek ve ayrıştırma', () => {
  let orijinal: typeof fetch;
  beforeEach(() => {
    orijinal = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = orijinal;
  });
  const meta = () => new MetaProvider({ platforms: { meta: { appId: 'a', appSecret: 's', apiVersion: 'v25.0' } } } as never);
  const ctx = { accessToken: 't', accountExternalId: 'act_1' };

  it('KRİTİK: dönemin TAMAMI tek satır (`all_days`), raporun aralığı, açık atıf ayarları, dar alan listesi', async () => {
    const f = vi.fn(async (_u: string) => YANIT({ data: [] }));
    globalThis.fetch = f as unknown as typeof fetch;
    await meta().fetchPeriodReach(ctx, { level: 'campaign', dateFrom: '2026-08-01', dateTo: '2026-08-31' });
    const url = new URL(String(f.mock.calls[0]![0]));
    // `time_increment=1` günlük satır verir ve günlük erişim toplanamaz.
    expect(url.searchParams.get('time_increment')).toBe('all_days');
    expect(url.searchParams.get('level')).toBe('campaign');
    expect(JSON.parse(url.searchParams.get('time_range')!)).toEqual({ since: '2026-08-01', until: '2026-08-31' });
    expect(url.searchParams.get('use_unified_attribution_setting')).toBe('true');
    expect(url.searchParams.get('action_report_time')).toBe('impression');
    expect(url.searchParams.get('fields')!.split(',').sort()).toEqual(['campaign_id', 'frequency', 'impressions', 'reach']);
    expect(url.pathname).toContain('/act_1/insights');
  });

  it('seviye kimlik alanı: set seviyesinde `adset`/`adset_id`, hesapta kimlik alanı yok', async () => {
    const f = vi.fn(async (_u: string) => YANIT({ data: [{ reach: '10', impressions: '20' }] }));
    globalThis.fetch = f as unknown as typeof fetch;
    const hesap = await meta().fetchPeriodReach(ctx, { level: 'account', dateFrom: '2026-08-01', dateTo: '2026-08-02' });
    expect(new URL(String(f.mock.calls[0]![0])).searchParams.get('fields')).toBe('reach,impressions,frequency');
    expect(hesap.rows).toEqual([{ entityExternalId: 'act_1', reach: 10, impressions: 20, frequency: null }]);
    await meta().fetchPeriodReach(ctx, { level: 'ad_group', dateFrom: '2026-08-01', dateTo: '2026-08-02' });
    const u2 = new URL(String(f.mock.calls[1]![0]));
    expect(u2.searchParams.get('level')).toBe('adset');
    expect(u2.searchParams.get('fields')).toContain('adset_id');
  });

  it('KRİTİK: reach alanı BOŞ dönen varlık satır olarak gelmiyor (0 uydurulmuyor)', async () => {
    globalThis.fetch = vi.fn(async () =>
      YANIT({
        data: [
          { campaign_id: 'c1', reach: '1500', impressions: '2400', frequency: '1.6' },
          { campaign_id: 'c2', impressions: '50' },
        ],
      }),
    ) as unknown as typeof fetch;
    const r = await meta().fetchPeriodReach(ctx, { level: 'campaign', dateFrom: '2026-08-01', dateTo: '2026-08-02' });
    expect(r.rows).toEqual([{ entityExternalId: 'c1', reach: 1500, impressions: 2400, frequency: 1.6 }]);
    expect(r.complete).toBe(true);
  });

  it('sayfa sınırında biterse `complete: false` (eksik varlık sessizce "yok" sayılmasın)', async () => {
    globalThis.fetch = vi.fn(async () =>
      YANIT({ data: [{ campaign_id: 'c', reach: '1', impressions: '1' }], paging: { next: 'https://graph.facebook.com/v25.0/next' } }),
    ) as unknown as typeof fetch;
    const r = await meta().fetchPeriodReach(ctx, { level: 'campaign', dateFrom: '2026-08-01', dateTo: '2026-08-02' });
    expect(r.complete).toBe(false);
  });
});

describe('DonemErisimiService — kota, önbellek, hata', () => {
  const HESAP: ErisimHesabi = {
    id: 'h1',
    clientId: 'c1',
    platform: 'meta',
    externalId: 'act_1',
    connectionId: 'b1',
    managerExternalId: null,
  };
  const SIMDI = new Date('2026-09-10T10:00:00Z');

  function kur(opts: { kota?: boolean; hata?: Error; destek?: boolean; tamam?: boolean } = {}) {
    const iz: string[] = [];
    const fetchPeriodReach = vi.fn(async () => {
      iz.push('platform');
      if (opts.hata) throw opts.hata;
      return { rows: [{ entityExternalId: 'k1', reach: 100, impressions: 300, frequency: 3 }], apiCalls: 1, complete: opts.tamam ?? true };
    });
    const provider = opts.destek === false ? {} : { fetchPeriodReach };
    const svc = new DonemErisimiService(
      { get: () => provider } as never,
      { getAccessToken: async () => { iz.push('token'); return 'tok'; } } as never,
      {
        acquire: async (a: { layer: string }) => {
          iz.push(`kota:${a.layer}`);
          return { allowed: opts.kota ?? true, reason: 'usage_high' };
        },
        record: async () => {},
      } as never,
    );
    return { svc, iz, fetchPeriodReach };
  }
  const istek = { seviye: 'campaign' as const, from: '2026-08-01', to: '2026-08-31' };

  it('KRİTİK: ÖNCE kota, SONRA token ve çağrı; kota reddederse platforma gidilmiyor ve sebep dönüyor', async () => {
    const ok = kur();
    expect((await ok.svc.oku(HESAP, istek, { katman: 'report_reach', etiket: 't', simdi: SIMDI })).tur).toBe('olculdu');
    expect(ok.iz).toEqual(['kota:report_reach', 'token', 'platform']);

    const red = kur({ kota: false });
    const r = await red.svc.oku(HESAP, istek, { katman: 'rule_reach', etiket: 't', simdi: SIMDI });
    expect(r).toEqual({ tur: 'okunamadi', neden: 'kota engeli (usage_high)' });
    expect(red.iz).toEqual(['kota:rule_reach']);
  });

  it('KRİTİK: aynı hesap + seviye + dönem önbellekten; farklı dönem yeniden soruluyor', async () => {
    const { svc, fetchPeriodReach } = kur();
    await svc.oku(HESAP, istek, { katman: 'report_reach', etiket: 't', simdi: SIMDI });
    await svc.oku(HESAP, istek, { katman: 'report_reach', etiket: 't', simdi: SIMDI });
    expect(fetchPeriodReach).toHaveBeenCalledTimes(1);
    await svc.oku(HESAP, { ...istek, to: '2026-08-30' }, { katman: 'report_reach', etiket: 't', simdi: SIMDI });
    expect(fetchPeriodReach).toHaveBeenCalledTimes(2);
  });

  it('KRİTİK: platform hatası FIRLATILMIYOR, "okunamadı" + mesaj; hata önbelleğe yazılmıyor', async () => {
    const { svc, fetchPeriodReach } = kur({ hata: new Error('(#17) User request limit reached') });
    const r = await svc.oku(HESAP, istek, { katman: 'report_reach', etiket: 't', simdi: SIMDI });
    expect(r).toEqual({ tur: 'okunamadi', neden: '(#17) User request limit reached' });
    await svc.oku(HESAP, istek, { katman: 'report_reach', etiket: 't', simdi: SIMDI });
    expect(fetchPeriodReach).toHaveBeenCalledTimes(2);
  });

  it('sağlayıcı uygulamıyorsa "desteklenmiyor" ve kota bile sorulmuyor', async () => {
    const { svc, iz } = kur({ destek: false });
    const r = await svc.oku({ ...HESAP, platform: 'google' }, istek, { katman: 'report_reach', etiket: 't', simdi: SIMDI });
    expect(r).toEqual({ tur: 'desteklenmiyor', neden: 'Google tekil erişim vermiyor' });
    expect(iz).toEqual([]);
  });

  it('eksik sayfa "okunamadı" (bulunmayan varlık "0 kişi" olmasın)', async () => {
    const { svc } = kur({ tamam: false });
    expect((await svc.oku(HESAP, istek, { katman: 'report_reach', etiket: 't', simdi: SIMDI })).tur).toBe('okunamadi');
  });

  it('önbellek ömrü: kapanmış dönem uzun, bugünü/dünü kapsayan kısa', () => {
    expect(donemKapandiMi('2026-09-08', SIMDI)).toBe(true);
    expect(donemKapandiMi('2026-09-09', SIMDI)).toBe(false);
    expect(GECMIS_ONBELLEK_MS).toBeGreaterThan(TAZE_ONBELLEK_MS);
  });
});

describe('kaynak bekçileri', () => {
  it('KRİTİK: kural ve rapor erişimi AYNI okuyucudan; günlük ortalama payda geri gelmiyor', () => {
    const yorumsuz = (f: string) =>
      readFileSync(join(__dirname, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/^\s*--.*$/gm, '');
    const kural = yorumsuz('../rules/rules.service.ts');
    const rapor = yorumsuz('../reports/reports.service.ts');
    if (!kural.includes('async loadWindows(') || !rapor.includes('async campaignRows(')) {
      throw new Error('tarama boşa düştü: metot adları değişti, testi güncelle');
    }
    expect(kural).toContain('this.donemErisimi.oku(');
    expect(rapor).toContain('this.donemErisimi.oku(');
    expect(kural).not.toMatch(/AVG\(\s*NULLIF\(\s*reach/);
    expect(rapor).not.toMatch(/SUM\(i\.reach\)/);
  });
});
