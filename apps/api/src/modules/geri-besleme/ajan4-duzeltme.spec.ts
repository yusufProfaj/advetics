import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import { ayarAc, lead, olay, olaylar, UZUN_LEAD_ID } from '../../../test/geri-besleme-tohum';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { QuotaGuardService } from '../../queue/quota-guard.service';
import type { ProviderRegistry } from '../connections/provider.registry';
import type { TokenVaultService } from '../connections/token-vault.service';
import { LeadgenWebhookService } from '../leads/leadgen-webhook.service';
import { GeriBeslemeGonderimService } from './geri-besleme-gonderim.service';
import { geriBeslemeUyariSatirlari, leadKimligiUyariSatirlari, leadKimligiUyarisi, LEAD_KIMLIGI_SAYI } from './geri-besleme-uyari';
import { leadRozetleri } from './lead-rozet';

/**
 * ═══ AJAN 4 KAPI BULGULARININ DÜZELTMELERİ — DAVRANIŞ KİLİTLERİ ═══
 *
 * `ajan4-kapi.spec.ts` bulguyu kilitliyor; bu dosya düzeltmenin YAN
 * iddialarını: sahiplenilen satırın akıbeti (Ö-1), "kurulum eksik"e düşüş
 * (Ö-2), sistematik retin satırları reddetmemesi (Ö-3), sayı gelen webhook
 * kimliği (N-5). Canlı Meta yok; `fetch` sahte.
 */
let h: Harness;
const SIMDI = new Date('2026-10-12T10:00:00Z');
const saatOnce = (n: number) => new Date(SIMDI.getTime() - n * 3_600_000);
const L1 = 'eeeeeeee-0000-4000-8000-000000000001';
let cagri = 0;
let cevap: () => { status: number; body: unknown };

function kur(): GeriBeslemeGonderimService {
  return new GeriBeslemeGonderimService(
    h.db as unknown as PrismaAdminService,
    { getAccessToken: vi.fn(async () => 'T') } as unknown as TokenVaultService,
    { get: () => ({}) } as unknown as ProviderRegistry,
    { acquire: vi.fn(async () => ({ allowed: true })), record: vi.fn(async () => undefined) } as unknown as QuotaGuardService,
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
  cagri = 0;
  cevap = () => ({ status: 200, body: { events_received: 1 } });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      cagri++;
      const c = cevap();
      return new Response(JSON.stringify(c.body), { status: c.status, headers: { 'content-type': 'application/json' } });
    }),
  );
  await lead(h, { id: L1, externalId: UZUN_LEAD_ID, submittedAt: saatOnce(3) });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Ö-1 · sahiplenme', () => {
  it('KRİTİK: yaşlanan "gönderiliyor" satırı "sonucu bilinmiyor" işaretleniyor, YENİDEN GÖNDERİLMİYOR, uyarıda ve rozette görünüyor', async () => {
    await ayarAc(h);
    const id = await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(3) });
    await h.q(`UPDATE geri_besleme_olaylari SET durum = 'gonderiliyor', sahiplenme_zamani = $2, updated_at = $3 WHERE id = $1`, [
      id,
      new Date(SIMDI.getTime() - 31 * 60_000).toISOString(),
      SIMDI.toISOString(),
    ]);
    const s = kur();
    expect(await s.yasliSahiplenmeleriIsaretle(SIMDI)).toBe(1);
    // İkinci tur aynı satırı tekrar işaretlemiyor (sayı şişmesin).
    expect(await s.yasliSahiplenmeleriIsaretle(SIMDI)).toBe(0);
    await s.calistir(IDS.client, SIMDI);
    expect(cagri).toBe(0);
    expect((await olaylar(h))[0]).toMatchObject({ durum: 'gonderiliyor' });
    const [u] = await geriBeslemeUyariSatirlari(h.db, SIMDI);
    expect(u).toMatchObject({ sorunlu: 1, ornek_hata: expect.stringContaining('Sonucu bilinmiyor') });
    const r = await leadRozetleri(h.db, [{ id: L1, clientId: IDS.client }]);
    expect(r.get(L1)?.metin).toBe('Meta’ya gönderildi, sonucu bilinmiyor');
  });

  it('taze sahiplenme işaretlenmiyor (istek hâlâ yolda olabilir)', async () => {
    await ayarAc(h);
    const id = await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(3) });
    await h.q(`UPDATE geri_besleme_olaylari SET durum = 'gonderiliyor', sahiplenme_zamani = $2 WHERE id = $1`, [
      id,
      new Date(SIMDI.getTime() - 5 * 60_000).toISOString(),
    ]);
    expect(await kur().yasliSahiplenmeleriIsaretle(SIMDI)).toBe(0);
  });

  it('KRİTİK: gönderilmeyen sahiplenme (ayar hatası) satırı geri bırakıyor; deneme artmıyor, sahiplenme zamanı temizleniyor', async () => {
    await ayarAc(h);
    await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(3) });
    cevap = () => ({ status: 403, body: { error: { code: 200, message: '(#200) Permissions error' } } });
    await kur().calistir(IDS.client, SIMDI);
    const [o] = await h.q<{ durum: string; deneme: number; sahiplenme_zamani: Date | null }>(
      'SELECT durum, deneme::int AS deneme, sahiplenme_zamani FROM geri_besleme_olaylari',
    );
    expect(o).toEqual({ durum: 'bekliyor', deneme: 0, sahiplenme_zamani: null });
  });
});

describe('Ö-2 · hesap kalmadı', () => {
  it('KRİTİK: ayar "kurulum eksik"e düşüyor (bağlantı boşaltıldı, sebep yazıldı) ve uyarı çıkıyor', async () => {
    await ayarAc(h);
    await olay(h, { leadId: L1, asama: 'ham_lead', olayZamani: saatOnce(3) });
    await h.q(`UPDATE ad_accounts SET client_id = NULL`);
    await kur().calistir(IDS.client, SIMDI);
    const [a] = await h.q<{ baglanti_id: string | null; son_ayar_hatasi: string }>('SELECT baglanti_id, son_ayar_hatasi FROM geri_besleme_ayarlari');
    expect(a!.baglanti_id).toBeNull();
    expect(a!.son_ayar_hatasi).toContain('hesap kalmadı');
    expect(await geriBeslemeUyariSatirlari(h.db, SIMDI)).toHaveLength(1);
    // Sonraki tur da çağrı yapmıyor ve aynı sebebi söylüyor.
    const r = await kur().calistir(IDS.client, SIMDI);
    expect(cagri).toBe(0);
    expect(r.note).toContain('hesap kalmadı');
  });
});

describe('Ö-3 · sistematik ret', () => {
  it('KRİTİK: bütün olaylar aynı hatayla düşünce satırlar REDDEDİLMİYOR (bekliyor, deneme 0), ayara Meta’nın cümlesi yazılıyor', async () => {
    await ayarAc(h);
    for (let i = 0; i < 8; i++) {
      const id = `ffffffff-0000-4000-8000-${String(i).padStart(12, '0')}`;
      await lead(h, { id, externalId: `4${String(i).padStart(14, '0')}`, submittedAt: saatOnce(3) });
      await olay(h, { leadId: id, asama: 'ham_lead', olayZamani: saatOnce(3) });
    }
    cevap = () => ({ status: 400, body: { error: { code: 100, error_subcode: 2804050, message: 'Invalid parameter: lead_id' } } });
    const r = await kur().calistir(IDS.client, SIMDI);
    expect(cagri).toBe(3);
    expect(r.note).toContain('ayar hatası');
    for (const o of await olaylar(h)) expect(o).toMatchObject({ durum: 'bekliyor', deneme: 0 });
    const [a] = await h.q<{ son_ayar_hatasi: string }>('SELECT son_ayar_hatasi FROM geri_besleme_ayarlari');
    expect(a!.son_ayar_hatasi).toContain('Invalid parameter: lead_id');
  });

  it('KRİTİK: iki yarı FARKLI hata koduyla düşerse sistematik SAYILMIYOR, yarılama sürüyor', async () => {
    await ayarAc(h);
    for (let i = 0; i < 4; i++) {
      const id = `ffffffff-0000-4000-8000-${String(i).padStart(12, '0')}`;
      await lead(h, { id, externalId: `6${String(i).padStart(14, '0')}`, submittedAt: saatOnce(3) });
      await olay(h, { leadId: id, asama: 'ham_lead', olayZamani: saatOnce(3) });
    }
    let n = 0;
    cevap = () => {
      n++;
      // 1: parti, 2: ilk yarı aynı kodla, 3: ikinci yarı BAŞKA kodla düşer; sonra tekliler: yalnız ilki kötü.
      if (n === 1 || n === 2 || n === 4) return { status: 400, body: { error: { code: 100, error_subcode: 2804050, message: 'Invalid parameter' } } };
      if (n === 3) return { status: 400, body: { error: { code: 2635, message: 'Başka bir sorun' } } };
      return { status: 200, body: { events_received: 1 } };
    };
    await kur().calistir(IDS.client, SIMDI);
    expect(cagri).toBe(7);
    const d = (await olaylar(h)).map((o) => o.durum).sort();
    expect(d).toEqual(['iletildi', 'iletildi', 'iletildi', 'reddedildi']);
  });

  it('yarılardan biri FARKLI sonuç verirse tek kötü olay yarılamayla bulunuyor (sistematik sayılmıyor)', async () => {
    await ayarAc(h);
    const idler: string[] = [];
    for (let i = 0; i < 4; i++) {
      const id = `ffffffff-0000-4000-8000-${String(i).padStart(12, '0')}`;
      idler.push(id);
      await lead(h, { id, externalId: `5${String(i).padStart(14, '0')}`, submittedAt: saatOnce(3) });
      await olay(h, { leadId: id, asama: 'ham_lead', olayZamani: saatOnce(3) });
    }
    let n = 0;
    cevap = () => {
      n++;
      // 1: tüm parti düşer; 2: ilk yarı (kötü olay orada) düşer; 3: ikinci yarı geçer; sonra tekli bölmeler.
      if (n === 1 || n === 2 || n === 4) return { status: 400, body: { error: { code: 100, message: 'Invalid parameter' } } };
      return { status: 200, body: { events_received: n === 3 ? 2 : 1 } };
    };
    await kur().calistir(IDS.client, SIMDI);
    const d = (await olaylar(h)).map((o) => o.durum).sort();
    expect(d).toEqual(['iletildi', 'iletildi', 'iletildi', 'reddedildi']);
  });
});

describe('N-5 · webhook kimliği sayı geldi', () => {
  it('KRİTİK: kayıt kuyruğa ALINMIYOR, teşhis satırı yazılıyor ve uyarı çıkıyor', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: true }));
    const create = vi.fn(async () => ({}));
    const svc = new LeadgenWebhookService(
      { platforms: { meta: { appSecret: 'x', webhookVerifyToken: 'y' } } } as never,
      { socialProfile: { findFirst: async () => ({ id: 'p1', clientId: IDS.client }) }, syncJob: { create } } as never,
      { enqueue } as never,
    );
    const r = await svc.handle({
      object: 'page',
      entry: [{ id: 'page-1', changes: [{ field: 'leadgen', value: { leadgen_id: 12345678901234568 as unknown as string, page_id: 'page-1' } }] }],
    });
    expect(enqueue).not.toHaveBeenCalled();
    expect(r).toEqual({ queued: 0, skipped: 1 });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ errorCode: LEAD_KIMLIGI_SAYI, status: 'failed', clientId: IDS.client }) });

    await h.q(
      `INSERT INTO sync_jobs (client_id, job_type, status, error_code, created_at) VALUES ($1, 'lead_fetch', 'failed', $2, $3)`,
      [IDS.client, LEAD_KIMLIGI_SAYI, SIMDI.toISOString()],
    );
    const [u] = await leadKimligiUyariSatirlari(h.db, SIMDI);
    expect(leadKimligiUyarisi(u!)).toMatchObject({ kod: 'geri_besleme_dusuyor', siddet: 'warn', clientId: IDS.client });
  });

  it('dize kimlik eskisi gibi kuyruğa giriyor (bekçi)', async () => {
    const enqueue = vi.fn(async () => ({ enqueued: true }));
    const svc = new LeadgenWebhookService(
      { platforms: { meta: { appSecret: 'x', webhookVerifyToken: 'y' } } } as never,
      { socialProfile: { findFirst: async () => ({ id: 'p1', clientId: IDS.client }) } } as never,
      { enqueue } as never,
    );
    await svc.handle({ object: 'page', entry: [{ id: 'page-1', changes: [{ field: 'leadgen', value: { leadgen_id: UZUN_LEAD_ID, page_id: 'page-1' } }] }] });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ externalLeadId: UZUN_LEAD_ID }));
  });
});
