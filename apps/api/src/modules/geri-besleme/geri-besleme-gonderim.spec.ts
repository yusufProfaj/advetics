import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import { ayarAc, lead, olay, olaylar, PIKSEL, UZUN_LEAD_ID } from '../../../test/geri-besleme-tohum';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { QuotaGuardService } from '../../queue/quota-guard.service';
import { PlatformApiError } from '../connections/provider.types';
import type { ProviderRegistry } from '../connections/provider.registry';
import type { TokenVaultService } from '../connections/token-vault.service';
import { GeriBeslemeGonderimService } from './geri-besleme-gonderim.service';

/**
 * ═══ GÖNDERİM İŞİ — gerçek Postgres + META CEVAP FİKSTÜRLERİ ═══
 *
 * Canlı Meta çağrısı YOK: `fetch` sahte ve cevap gövdeleri Meta'nın belgelenen
 * biçiminde (başarı `{events_received, fbtrace_id}`, hata `{error:{code,
 * error_subcode, message}}`). Kod tablosu ÖLÇÜLMEDİ (M-5); fikstürler belgeden.
 *
 * KRİTİK İDDİALAR:
 *   · 17 haneli lead kimliği JSON METNİNDE bozulmadan, sayı literali olarak gidiyor,
 *   · gövdede kişisel veri ve `test_event_code` yok, CRM alanları var,
 *   · tek kötü olay partiyi düşürünce yarılama YALNIZ onu reddediyor,
 *   · izin hatası AYAR hatası: satırlar bekliyor, deneme artmıyor, iş duruyor,
 *   · "200 döndü" yetmiyor: events_received uyuşmazsa tekrar denenecek,
 *   · ön koşul eksikse PLATFORM ÇAĞRISI SIFIR,
 *   · 7 günü geçen olay partiye girmeden `suresi_doldu`,
 *   · geri alma penceresindeki (vadesi gelmemiş) satır gönderilmiyor.
 */
let h: Harness;
const SIMDI = new Date('2026-10-12T10:00:00Z');
const saatOnce = (n: number) => new Date(SIMDI.getTime() - n * 3_600_000);
const L1 = 'bbbbbbbb-0000-4000-8000-000000000001';
const L2 = 'bbbbbbbb-0000-4000-8000-000000000002';
const L3 = 'bbbbbbbb-0000-4000-8000-000000000003';
const KOTU = '999999999999999';

type Cagri = { url: string; govde: string; yetki: string | null };
let cagrilar: Cagri[] = [];
let cevap: (govde: string) => { status: number; body: unknown };

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

let tokenHatasi: Error | null = null;
let kotaIzni = true;
function kur(): GeriBeslemeGonderimService {
  return new GeriBeslemeGonderimService(
    h.db as unknown as PrismaAdminService,
    {
      getAccessToken: vi.fn(async () => {
        if (tokenHatasi) throw tokenHatasi;
        return 'TOKEN-GIZLI';
      }),
    } as unknown as TokenVaultService,
    { get: () => ({}) } as unknown as ProviderRegistry,
    {
      acquire: vi.fn(async () => (kotaIzni ? { allowed: true } : { allowed: false, reason: 'usage_80pct_exceeds_layer_limit_75' })),
      record: vi.fn(async () => undefined),
    } as unknown as QuotaGuardService,
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
  cagrilar = [];
  tokenHatasi = null;
  kotaIzni = true;
  cevap = (g) => ({ status: 200, body: { events_received: (JSON.parse(g.replace(/"lead_id":(\d+)/g, '"lead_id":"$1"')) as { data: unknown[] }).data.length, fbtrace_id: 'AbC' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const govde = String(init.body ?? '');
      cagrilar.push({ url, govde, yetki: new Headers(init.headers).get('authorization') });
      const c = cevap(govde);
      return json(c.status, c.body);
    }),
  );
  await lead(h, { id: L1, externalId: UZUN_LEAD_ID, submittedAt: saatOnce(3) });
  await lead(h, { id: L2, externalId: '223456789012345', submittedAt: saatOnce(3) });
  await lead(h, { id: L3, externalId: KOTU, submittedAt: saatOnce(3) });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('başarı ve istek gövdesi', () => {
  it('KRİTİK: 17 haneli kimlik JSON metninde bozulmadan SAYI olarak gidiyor; kişisel veri ve test_event_code yok', async () => {
    await ayarAc(h);
    await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(3) });
    const r = await kur().calistir(IDS.client, SIMDI);

    expect(cagrilar).toHaveLength(1);
    const c = cagrilar[0]!;
    expect(c.url).toBe(`https://graph.facebook.com/v25.0/${PIKSEL}/events`);
    expect(c.yetki).toBe('Bearer TOKEN-GIZLI');
    expect(c.url).not.toContain('TOKEN');
    // Metin seviyesinde: tırnaksız ve BİREBİR aynı rakamlar (Number() 12345678901234568 yapardı).
    expect(c.govde).toContain(`"lead_id":${UZUN_LEAD_ID}`);
    expect(c.govde).not.toContain('12345678901234568');
    expect(c.govde).toContain('"action_source":"system_generated"');
    expect(c.govde).toContain('"event_source":"crm"');
    expect(c.govde).toContain('"lead_event_source":"Advetics"');
    expect(c.govde).toContain(`"event_id":"adv-${L1}-ham_lead"`);
    expect(c.govde).not.toMatch(/test_event_code|"em"|"ph"|"fn"|Ayşe|full_name/);

    expect(r.rows).toBe(1);
    const [o] = await h.q<{ durum: string; gonderilen_hedef: string; platform_yaniti: { events_received: number; fbtrace_id: string } }>(
      'SELECT durum, gonderilen_hedef, platform_yaniti FROM geri_besleme_olaylari',
    );
    expect(o).toMatchObject({ durum: 'iletildi', gonderilen_hedef: PIKSEL, platform_yaniti: { events_received: 1, fbtrace_id: 'AbC' } });
    const [a] = await h.q<{ son_basarili_gonderim: Date | null }>('SELECT son_basarili_gonderim FROM geri_besleme_ayarlari');
    expect(a!.son_basarili_gonderim).not.toBeNull();
  });

  it('KRİTİK: gönderim sürerken geri alınan (iptal) satır Meta kabul ettiyse İLETİLDİ yazılıyor; platform gerçeği kazanır', async () => {
    await ayarAc(h);
    await olay(h, { leadId: L1, asama: 'ulasildi', olayZamani: saatOnce(1), durum: 'basarisiz', deneme: 1 });
    const varsayilan = cevap;
    // Yarış: istek yoldayken kullanıcı aşamayı geri alıyor.
    cevap = (g) => {
      void h.q(`UPDATE geri_besleme_olaylari SET durum = 'iptal', sonraki_deneme = NULL`);
      return varsayilan(g);
    };
    await kur().calistir(IDS.client, SIMDI);
    expect((await olaylar(h))[0]).toMatchObject({ durum: 'iletildi', deneme: 2 });
  });

  it('aynı lead’in aşamaları huni sırasıyla gidiyor', async () => {
    await ayarAc(h);
    await olay(h, { leadId: L2, asama: 'satisa_dondu', olayZamani: saatOnce(1) });
    await olay(h, { leadId: L2, asama: 'ham_lead', olayZamani: saatOnce(3) });
    await olay(h, { leadId: L2, asama: 'ulasildi', olayZamani: saatOnce(1) });
    await kur().calistir(IDS.client, SIMDI);
    const adlar = [...cagrilar[0]!.govde.matchAll(/"event_name":"(\w+)"/g)].map((m) => m[1]);
    expect(adlar).toEqual(['ham_lead', 'ulasildi', 'satisa_dondu']);
  });
});

describe('parti reddi ve yarılama', () => {
  it('KRİTİK: tek kötü olay partiyi düşürünce yarılanıyor; YALNIZ o reddediliyor, diğerleri iletiliyor', async () => {
    await ayarAc(h);
    await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(3) });
    await olay(h, { leadId: L2, asama: 'ham_lead', olayZamani: saatOnce(3) });
    await olay(h, { leadId: L3, asama: 'ham_lead', olayZamani: saatOnce(3) });
    const varsayilan = cevap;
    cevap = (g) =>
      g.includes(KOTU)
        ? { status: 400, body: { error: { code: 100, message: 'Invalid parameter', error_user_msg: 'lead_id geçersiz', fbtrace_id: 'X1' } } }
        : varsayilan(g);

    await kur().calistir(IDS.client, SIMDI);
    const durum = Object.fromEntries(
      (await h.q<{ lead_id: string; durum: string; hata: string | null }>('SELECT lead_id::text AS lead_id, durum, hata FROM geri_besleme_olaylari')).map(
        (o) => [o.lead_id, o],
      ),
    );
    expect(durum[L1]!.durum).toBe('iletildi');
    expect(durum[L2]!.durum).toBe('iletildi');
    expect(durum[L3]!.durum).toBe('reddedildi');
    // Meta'nın cümlesi AYNEN saklanıyor.
    expect(durum[L3]!.hata).toContain('Invalid parameter');
    // 3'lü parti → [2,1] → [1,1]: kötü olay tek başına kalana kadar.
    expect(cagrilar.length).toBeGreaterThanOrEqual(3);
    expect(cagrilar.length).toBeLessThanOrEqual(5);
  });

  it('kimliği 15-17 hane olmayan kayıt partiye HİÇ girmiyor', async () => {
    await lead(h, { id: 'bbbbbbbb-0000-4000-8000-000000000009', externalId: '12345', submittedAt: saatOnce(3) });
    await ayarAc(h);
    await olay(h, { leadId: 'bbbbbbbb-0000-4000-8000-000000000009', asama: 'ham_lead', olayZamani: saatOnce(3) });
    await kur().calistir(IDS.client, SIMDI);
    expect(cagrilar).toHaveLength(0);
    expect((await olaylar(h))[0]!.durum).toBe('reddedildi');
  });
});

describe('ayar hatası', () => {
  it('KRİTİK: izin hatası satırları BEKLETİYOR (deneme artmıyor), ayar hataya düşüyor ve iş duruyor', async () => {
    await ayarAc(h);
    for (const l of [L1, L2]) await olay(h, { leadId: l, asama: 'ham_lead', olayZamani: saatOnce(3) });
    cevap = () => ({ status: 403, body: { error: { code: 200, message: '(#200) Requires ads_management permission to manage the object' } } });
    const r = await kur().calistir(IDS.client, SIMDI);
    expect(cagrilar).toHaveLength(1);
    expect(r.note).toContain('ayar hatası');
    for (const o of await olaylar(h)) expect(o).toMatchObject({ durum: 'bekliyor', deneme: 0 });
    const [a] = await h.q<{ son_ayar_hatasi: string }>('SELECT son_ayar_hatasi FROM geri_besleme_ayarlari');
    expect(a!.son_ayar_hatasi).toContain('Requires ads_management');
  });

  it('başarılı gönderim ayar hatasını temizliyor', async () => {
    await ayarAc(h);
    await h.q(`UPDATE geri_besleme_ayarlari SET son_ayar_hatasi = 'eski hata', son_ayar_hatasi_zamani = now()`);
    await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(3) });
    await kur().calistir(IDS.client, SIMDI);
    const [a] = await h.q<{ son_ayar_hatasi: string | null }>('SELECT son_ayar_hatasi FROM geri_besleme_ayarlari');
    expect(a!.son_ayar_hatasi).toBeNull();
  });

  it('token kasası "geçersiz token" derse çağrı yapılmıyor, ayar hataya düşüyor', async () => {
    await ayarAc(h);
    await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(3) });
    tokenHatasi = new PlatformApiError('meta', 'invalid_token', 'Error validating access token');
    await kur().calistir(IDS.client, SIMDI);
    expect(cagrilar).toHaveLength(0);
    expect((await olaylar(h))[0]).toMatchObject({ durum: 'bekliyor', deneme: 0 });
  });
});

describe('geçici hata ve "200 doğrulama değil"', () => {
  it('KRİTİK: 200 ama events_received eksikse iletildi YAZILMIYOR; tekrar denenecek ve sebebi notta', async () => {
    await ayarAc(h);
    for (const l of [L1, L2]) await olay(h, { leadId: l, asama: 'ham_lead', olayZamani: saatOnce(3) });
    cevap = () => ({ status: 200, body: { events_received: 1, fbtrace_id: 'Z' } });
    await kur().calistir(IDS.client, SIMDI);
    for (const o of await olaylar(h)) {
      expect(o.durum).toBe('basarisiz');
      expect(o.deneme).toBe(1);
      expect(o.hata).toContain('2 sonuçtan 1');
      expect(new Date(o.sonraki_deneme!).getTime()).toBe(SIMDI.getTime() + 5 * 60_000);
    }
  });

  it('5xx geçici; BEŞİNCİ denemede vazgeçiliyor', async () => {
    await ayarAc(h);
    await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(3), durum: 'basarisiz', deneme: 4 });
    cevap = () => ({ status: 503, body: { error: { code: 2, message: 'Service temporarily unavailable' } } });
    await kur().calistir(IDS.client, SIMDI);
    expect((await olaylar(h))[0]).toMatchObject({ durum: 'vazgecildi', deneme: 5, hata: expect.stringContaining('temporarily unavailable') });
  });
});

describe('ön koşul ve pencere', () => {
  it('KRİTİK: ayar kapalıyken platform çağrısı SIFIR, satırlara dokunulmuyor, not sebebi söylüyor', async () => {
    await ayarAc(h, { etkin: false });
    await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(3) });
    const r = await kur().calistir(IDS.client, SIMDI);
    expect(cagrilar).toHaveLength(0);
    expect(r).toMatchObject({ rows: 0, apiCalls: 0, note: expect.stringContaining('kapalı') });
    expect((await olaylar(h))[0]).toMatchObject({ durum: 'bekliyor', deneme: 0 });
  });

  it('KRİTİK: bağlantı yeniden yetki istiyorsa çağrı SIFIR', async () => {
    await ayarAc(h);
    await h.q(`UPDATE platform_connections SET status = 'needs_reauth'`);
    await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(3) });
    const r = await kur().calistir(IDS.client, SIMDI);
    expect(cagrilar).toHaveLength(0);
    expect(r.note).toContain('yeniden yetki');
  });

  it('KRİTİK: 7 günü geçen olay partiye girmeden suresi_doldu; aynı turdaki taze olay gidiyor', async () => {
    await ayarAc(h);
    await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(24 * 8) });
    await olay(h, { leadId: L2, asama: 'ham_lead', olayZamani: saatOnce(3) });
    await kur().calistir(IDS.client, SIMDI);
    expect(cagrilar).toHaveLength(1);
    expect(cagrilar[0]!.govde).not.toContain(UZUN_LEAD_ID);
    const d = Object.fromEntries(
      (await h.q<{ lead_id: string; durum: string }>('SELECT lead_id::text AS lead_id, durum FROM geri_besleme_olaylari')).map((o) => [o.lead_id, o.durum]),
    );
    expect(d).toEqual({ [L1]: 'suresi_doldu', [L2]: 'iletildi' });
  });

  it('KRİTİK: geri alma penceresindeki (vadesi gelmemiş) işaret gönderilmiyor', async () => {
    await ayarAc(h);
    await olay(h, { leadId: L1, asama: 'satisa_dondu', olayZamani: SIMDI, sonrakiDeneme: new Date(SIMDI.getTime() + 15 * 60_000) });
    const r = await kur().calistir(IDS.client, SIMDI);
    expect(cagrilar).toHaveLength(0);
    expect(r.note).toBe('gönderilecek sonuç yok');
  });

  it('kota reddedince çağrı yok, satırlar bir sonraki tura kalıyor', async () => {
    await ayarAc(h);
    await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(3) });
    kotaIzni = false;
    const r = await kur().calistir(IDS.client, SIMDI);
    expect(cagrilar).toHaveLength(0);
    expect(r.note).toContain('kota');
    expect((await olaylar(h))[0]).toMatchObject({ durum: 'bekliyor', deneme: 0 });
  });

  it('süpürme yalnız ayarı AÇIK ve vadesi gelmiş satırı olan workspace’leri döndürüyor', async () => {
    await ayarAc(h);
    await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(3) });
    expect(await kur().bekleyenWorkspaceler(SIMDI)).toEqual([IDS.client]);
    await h.q(`UPDATE geri_besleme_ayarlari SET etkin = false`);
    expect(await kur().bekleyenWorkspaceler(SIMDI)).toEqual([]);
  });
});
