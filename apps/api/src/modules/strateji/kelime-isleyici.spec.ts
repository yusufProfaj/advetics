import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import { PlatformApiError } from '../connections/provider.types';
import { BEKLENMEYEN_HATA, kelimeIsiniIsle, type KelimeIsleyiciBagimliliklari } from './kelime-isleyici';
import type { HamKelimeFikri } from './kelime-tekil';

/**
 * Kelime araması işleyicisi — gerçek şema (PGlite). Google sahte; tablo,
 * ON CONFLICT ifade indeksi ve plan durum kolonları gerçek.
 */
let h: Harness;
const GOOGLE = '44444444-0000-4000-8000-0000000000aa';
const ARAMA = '66666666-0000-4000-8000-0000000000a1';
const YENI_ARAMA = '66666666-0000-4000-8000-0000000000a2';
const log = vi.fn<(m: string) => void>();
let planId: string;

const fikirler = vi.fn<KelimeIsleyiciBagimliliklari['fikirler']>();
const tokenAl = vi.fn<KelimeIsleyiciBagimliliklari['tokenAl']>();
const bag = (): KelimeIsleyiciBagimliliklari => ({
  tx: (fn) => fn(h.db as never),
  tokenAl,
  fikirler,
  simdi: () => new Date('2026-10-08T10:00:00Z'),
  log,
});
const f = (kelime: string, hacim: string | null): HamKelimeFikri => ({
  kelime,
  aylikArama: hacim,
  rekabet: 'HIGH',
  teklifAltMicros: '1000000',
  teklifUstMicros: '5000000',
});

beforeAll(async () => {
  h = await createHarness();
}, 60_000);
afterAll(async () => h?.close());
beforeEach(async () => {
  fikirler.mockReset();
  tokenAl.mockReset();
  log.mockReset();
  tokenAl.mockResolvedValue('tok');
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, sync_enabled, manager_external_id, updated_at)
     VALUES ($1, $2, $3, $4, 'google', '1234567890', 'G', 'TRY', 'Europe/Istanbul', true, '999', now())`,
    [GOOGLE, IDS.org, IDS.client, IDS.connection],
  );
  const [p] = await h.q<{ id: string }>(
    `INSERT INTO strateji_planlari (org_id, client_id, donem, toplam_butce_micros, para_birimi, kelime_arama, kelime_arama_zamani, kelime_arama_id)
     VALUES ($1, $2, '2026-11', 1000000, 'TRY', 'kuyrukta', now(), $3) RETURNING id::text`,
    [IDS.org, IDS.client, ARAMA],
  );
  planId = p!.id;
});

const plan = async () =>
  (await h.q<{ kelime_arama: string; kelime_son_hata: string | null; kelime_erisim: string | null; kelime_toplam: number | null }>(
    'SELECT kelime_arama, kelime_son_hata, kelime_erisim, kelime_toplam FROM strateji_planlari WHERE id = $1',
    [planId],
  ))[0]!;

describe('kelime araması işleyicisi', () => {
  it('KRİTİK: başarı → tekilleştirilmiş satırlar yazılır, toplam ve erişim kaydedilir; hedefleme AÇIK', async () => {
    fikirler.mockResolvedValue([f('türk kahve makinesi', '74000'), f('turk kahve makinesi', '74000'), f('filtre kahve', '49500')]);
    const s = await kelimeIsiniIsle(bag(), { planId, aramaId: ARAMA, tohumlar: ['filtre kahve'] });
    expect(s).toEqual({ durum: 'bitti', yazilan: 2, toplam: 2 });
    expect(fikirler).toHaveBeenCalledWith(
      'tok',
      '1234567890',
      { tohumlar: ['filtre kahve'], dilKaynagi: 'languageConstants/1037', konumKaynaklari: ['geoTargetConstants/2792'] },
      '999',
    );
    expect(tokenAl).toHaveBeenCalledWith(IDS.connection);
    const rows = await h.q<{ kelime: string; varyantlar: string[]; aylik_arama: string; secili: boolean }>(
      'SELECT kelime, varyantlar, aylik_arama::text, secili FROM strateji_kelimeleri ORDER BY aylik_arama DESC',
    );
    expect(rows).toEqual([
      { kelime: 'türk kahve makinesi', varyantlar: ['turk kahve makinesi'], aylik_arama: '74000', secili: false },
      { kelime: 'filtre kahve', varyantlar: [], aylik_arama: '49500', secili: false },
    ]);
    expect(await plan()).toEqual({ kelime_arama: 'bitti', kelime_son_hata: null, kelime_erisim: 'var', kelime_toplam: 2 });
  });

  it('KRİTİK: sıfır fikir BAŞARI DEĞİL — hata olarak ve nedeniyle kaydedilir', async () => {
    fikirler.mockResolvedValue([]);
    const s = await kelimeIsiniIsle(bag(), { planId, aramaId: ARAMA, tohumlar: ['zzz'] });
    expect(s.durum).toBe('hata');
    expect(await plan()).toMatchObject({ kelime_arama: 'hata', kelime_erisim: 'var', kelime_toplam: 0 });
    expect((await plan()).kelime_son_hata).toMatch(/fikir döndürmedi/);
  });

  it('KRİTİK: Google yetki reddi → erişim "yok" ve Google’ın mesajı saklanır', async () => {
    fikirler.mockRejectedValue(new PlatformApiError('google', 'permission_denied', 'DEVELOPER_TOKEN_NOT_APPROVED'));
    await kelimeIsiniIsle(bag(), { planId, aramaId: ARAMA, tohumlar: ['x y'] });
    expect(await plan()).toMatchObject({ kelime_arama: 'hata', kelime_erisim: 'yok', kelime_son_hata: 'DEVELOPER_TOKEN_NOT_APPROVED' });
  });

  it('başka platform hatası erişimi değiştirmez; mesaj saklanır', async () => {
    fikirler.mockRejectedValue(new PlatformApiError('google', 'rate_limited', 'RESOURCE_EXHAUSTED'));
    await kelimeIsiniIsle(bag(), { planId, aramaId: ARAMA, tohumlar: ['x y'] });
    expect(await plan()).toMatchObject({ kelime_arama: 'hata', kelime_erisim: null, kelime_son_hata: 'RESOURCE_EXHAUSTED' });
  });

  it('KRİTİK: yeni arama SEÇİLİ satırı ve grubunu korur, seçilmemişleri değiştirir; toplam kalanı sayar', async () => {
    fikirler.mockResolvedValueOnce([f('filtre kahve', '49500'), f('eski kelime', '100'), f('secili eski', '50')]);
    await kelimeIsiniIsle(bag(), { planId, aramaId: ARAMA, tohumlar: ['a b'] });
    await h.q(`UPDATE strateji_kelimeleri SET secili = true, grup = 'Kahve' WHERE kelime IN ('filtre kahve', 'secili eski')`);
    fikirler.mockResolvedValueOnce([f('Filtre Kahve', '60500'), f('yeni kelime', '200')]);
    await h.q(`UPDATE strateji_planlari SET kelime_arama = 'kuyrukta'`);
    await kelimeIsiniIsle(bag(), { planId, aramaId: ARAMA, tohumlar: ['c d'] });
    const rows = await h.q<{ kelime: string; secili: boolean; grup: string | null; aylik_arama: string }>(
      'SELECT kelime, secili, grup, aylik_arama::text FROM strateji_kelimeleri ORDER BY kelime',
    );
    expect(rows).toEqual([
      // Metrik tazelendi, seçim ve grup korundu; ad ilk yazılan kalıyor.
      { kelime: 'filtre kahve', secili: true, grup: 'Kahve', aylik_arama: '60500' },
      { kelime: 'secili eski', secili: true, grup: 'Kahve', aylik_arama: '50' },
      { kelime: 'yeni kelime', secili: false, grup: null, aylik_arama: '200' },
    ]);
    expect((await plan()).kelime_toplam).toBe(3);
  });

  it('plan arama sırasında taslaktan çıktıysa sonuç YAZILMAZ ve nedeni plana yazılır', async () => {
    await h.q(`UPDATE strateji_planlari SET durum = 'onayda'`);
    const s = await kelimeIsiniIsle(bag(), { planId, aramaId: ARAMA, tohumlar: ['a b'] });
    expect(s.durum).toBe('hata');
    expect(fikirler).not.toHaveBeenCalled();
    expect((await plan()).kelime_son_hata).toMatch(/taslaktan çıktı/);
  });

  it('Google hesabı arada kaldırıldıysa çağrı YAPILMAZ', async () => {
    await h.q('UPDATE ad_accounts SET client_id = NULL WHERE id = $1', [GOOGLE]);
    await kelimeIsiniIsle(bag(), { planId, aramaId: ARAMA, tohumlar: ['a b'] });
    expect(tokenAl).not.toHaveBeenCalled();
    expect(fikirler).not.toHaveBeenCalled();
    expect(await plan()).toMatchObject({ kelime_arama: 'hata' });
  });

  it('KRİTİK: beklenmeyen hata plana HAM METİN olarak yazılmaz; sabit cümle plana, ayrıntı log’a', async () => {
    tokenAl.mockRejectedValue(new Error('PrismaClientKnownRequestError: relation "platform_connections" gizli ayrıntı'));
    await kelimeIsiniIsle(bag(), { planId, aramaId: ARAMA, tohumlar: ['x y'] });
    const p = await plan();
    expect(p.kelime_arama).toBe('hata');
    expect(p.kelime_son_hata).toBe(BEKLENMEYEN_HATA);
    expect(p.kelime_son_hata).not.toMatch(/Prisma|platform_connections/);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('gizli ayrıntı'));
  });

  it('KRİTİK: bayat iş (plandaki arama kimliği başka) hiçbir şey yazmaz ve Google’ı çağırmaz', async () => {
    await h.q(`UPDATE strateji_planlari SET kelime_arama_id = $1`, [YENI_ARAMA]);
    const s = await kelimeIsiniIsle(bag(), { planId, aramaId: ARAMA, tohumlar: ['a b'] });
    expect(s.durum).toBe('atlandi');
    expect(tokenAl).not.toHaveBeenCalled();
    expect(await plan()).toMatchObject({ kelime_arama: 'kuyrukta', kelime_son_hata: null });
  });

  it('KRİTİK: Google çağrısı sürerken yeni arama başlarsa eski işin sonucu YAZILMAZ', async () => {
    fikirler.mockImplementation(async () => {
      // Kullanıcı bu arada yeniden aradı: plan yeni kimliği taşıyor.
      await h.q(`UPDATE strateji_planlari SET kelime_arama_id = $1, kelime_arama = 'kuyrukta'`, [YENI_ARAMA]);
      return [f('eski sonuc', '100')];
    });
    const s = await kelimeIsiniIsle(bag(), { planId, aramaId: ARAMA, tohumlar: ['a b'] });
    expect(s.durum).toBe('atlandi');
    const [n] = await h.q<{ n: number }>('SELECT count(*)::int AS n FROM strateji_kelimeleri');
    expect(n!.n).toBe(0);
    expect((await plan()).kelime_arama).toBe('kuyrukta');
  });

  it('bayat işin hatası yeni aramanın durumunu ezmez', async () => {
    fikirler.mockImplementation(async () => {
      await h.q(`UPDATE strateji_planlari SET kelime_arama_id = $1, kelime_arama = 'kuyrukta'`, [YENI_ARAMA]);
      throw new PlatformApiError('google', 'permission_denied', 'RED');
    });
    await kelimeIsiniIsle(bag(), { planId, aramaId: ARAMA, tohumlar: ['a b'] });
    expect(await plan()).toMatchObject({ kelime_arama: 'kuyrukta', kelime_son_hata: null, kelime_erisim: null });
  });
});
