import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePermissions, type TenantContext } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import { SahteMeta } from '../../../test/reklam-sahte-meta';
import type { PrismaService } from '../../prisma/prisma.service';
import type { MetinUretici } from '../../yapay-zeka/gemini';
import { MetaBelirsizHata, MetaKesinHata, type TxRunner } from '../reklam/yayin-motoru';
import type { PilotKurulumKuyrugu } from './kurulum-kuyrugu';
import { pilotIsiniIsle, type PilotIsleyiciBagimliliklari } from './kurulum-isleyici';
import { PilotPlanService } from './plan.service';

/**
 * ═══ PİLOT KURULUM İŞÇİSİ — gerçek şema + SAHTE META ═══
 *
 * Plan servis üzerinden hazırlanıp onaylanıyor (gerçek akış), sonra işçi
 * plan ve satır işlerini koşuyor. Sahte Meta gönderileni saklayıp aynen
 * geri okuyor; testler sapma ve hata enjekte ediyor. Her iddia platforma
 * KAÇ çağrı gittiğini de sayıyor: "hiç gidilmedi" bu modülün ana sözü.
 */
let h: Harness;
let svc: PilotPlanService;
let meta: SahteMeta;
let kuyruktaki: string[];
const kilitler = new Map<string, string>();
const SAYFA = '66666666-0000-4000-8000-000000000001';
const KITLE = '77777777-0000-4000-8000-000000000001';
const VARLIK = '88888888-0000-4000-8000-000000000001';
const SIMDI = new Date('2026-10-07T06:00:00Z');

const yz: MetinUretici = {
  model: 'sahte',
  uret: vi.fn(async (g: { sistem: string }) => {
    const metin = g.sistem.includes('reklam metni')
      ? JSON.stringify({ metinler: [{ baslik: 'Taze kahve', metin: 'Sabahların yeni tadı.' }] })
      : 'Plan geçmiş veriye dayanıyor.';
    return { parcalar: [{ text: metin }], sebep: 'bitti', aciklama: null, girdiToken: 0, ciktiToken: 0, onbellekToken: 0 };
  }),
} as unknown as MetinUretici;

const AJANS = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  isOrgAdmin: true,
  role: 'admin',
  permissions: [...resolvePermissions('admin')],
} as unknown as TenantContext;

const tx: TxRunner = (fn) => fn(h.db as never);
function bag(): PilotIsleyiciBagimliliklari {
  return {
    tx,
    crypto: { decrypt: () => 'tok' },
    apiSurumu: 'v25.0',
    yuklemeKoku: '/tmp',
    kilit: {
      async al(a, s) {
        if (kilitler.has(a)) return false;
        kilitler.set(a, s);
        return true;
      },
      async birak(a, s) {
        if (kilitler.get(a) === s) kilitler.delete(a);
      },
    },
    kilitOneki: 'test',
    yz,
    kuyruk: { satirEkle: async (id: string) => void kuyruktaki.push(id) },
    portKur: () => meta,
    simdi: () => SIMDI,
  };
}

beforeAll(async () => {
  h = await createHarness();
  const prisma = { withTenant: <T>(_c: TenantContext, fn: (t: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
  svc = new PilotPlanService(prisma, { planEkle: async () => undefined } as unknown as PilotKurulumKuyrugu, yz);
}, 60_000);
afterAll(async () => h?.close());

beforeEach(async () => {
  meta = new SahteMeta();
  kuyruktaki = [];
  kilitler.clear();
  await h.reset();
  await seedTenant(h);
  await h.q(`UPDATE clients SET ozel_kategori_beyan_zamani = now(), website = 'https://ornek.com' WHERE id = $1`, [IDS.client]);
  await h.q(`INSERT INTO monthly_budgets (id, org_id, client_id, month, amount_micros, currency, updated_at) VALUES (gen_random_uuid(), $1, $2, '2026-11-01', 30000000000, 'TRY', now())`, [IDS.org, IDS.client]);
  await h.q(
    `INSERT INTO audience_templates (id, org_id, client_id, name, locations, updated_at)
     VALUES ($1, $2, $3, 'Genel', '[{"key":"TR","type":"country","label":"Türkiye","countryCode":"TR"}]', now())`,
    [KITLE, IDS.org, IDS.client],
  );
  await h.q(
    `INSERT INTO client_profiles (id, org_id, client_id, ana_amac, sektor, varsayilan_kitle_id, updated_at) VALUES (gen_random_uuid(), $1, $2, 'website', 'Kahve makinesi üretimi', $3, now())`,
    [IDS.org, IDS.client, KITLE],
  );
  await h.q(
    `INSERT INTO assets (id, org_id, client_id, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $2, $3, 'Görsel', 'a.jpg', 'image/jpeg', 1, 1080, 1080, 'k/a', 'aaaaaaaaaaaaaaaa1', now())`,
    [VARLIK, IDS.org, IDS.client],
  );
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, linked_ad_account_id, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', 'p1', 'Sayfa', $5, now())`,
    [SAYFA, IDS.org, IDS.client, IDS.connection, IDS.adAccount],
  );
  await h.q(`INSERT INTO ajans_ayari (org_id, atif_standardi, atif_secim_at) VALUES ($1, 'tik7', now())`, [IDS.org]);
});

/** Planı gerçek akışla onaylatır; `kip` verilirse onay izi doğrudan yazılır (test/kapalı kipi). */
async function onayliPlan(kip?: 'test' | 'kapali'): Promise<string> {
  const { id } = await svc.hazirla(AJANS, { clientId: IDS.client, donem: '2026-11' }, SIMDI);
  await svc.eylem(AJANS, id, { eylem: 'musteriye_gonder', surum: 1 }, SIMDI);
  const oz = (await svc.detay(AJANS, id, SIMDI)).plan.icerikOzeti;
  if (kip) {
    await h.q(
      `UPDATE pilot_planlari SET durum = 'onaylandi', onaylanan_surum = 1, onaylanan_ozet = icerik_ozeti, onay_rolu = 'musteri', onay_zamani = now(), yayin_kipi = $2 WHERE id = $1`,
      [id, kip],
    );
  } else {
    await svc.onayla(AJANS, id, { surum: 1, icerikOzeti: oz, musteriAdinaGerekce: 'Müşteri toplantıda onay verdi, 7 Ekim' }, SIMDI);
  }
  return id;
}

async function kos(planId: string, yeniden = false): Promise<void> {
  await pilotIsiniIsle(bag(), { tur: 'plan', planId, yeniden }, 'is1');
  while (kuyruktaki.length > 0) await pilotIsiniIsle(bag(), { tur: 'satir', satirId: kuyruktaki.shift()! }, 'is2');
}
const satirlar = (planId: string) =>
  h.q<{ durum: string; platform_mesaji: string | null }>('SELECT durum, platform_mesaji FROM pilot_kurulum_satirlari WHERE plan_id = $1', [planId]);
const planDurumu = async (id: string) => (await h.q<{ durum: string }>('SELECT durum FROM pilot_planlari WHERE id = $1', [id]))[0]!.durum;

describe('gerçek kip', () => {
  it('KRİTİK: prova → PAUSED kurulum → geri okuma → yukarıdan aşağı açma; plan kuruldu', async () => {
    const id = await onayliPlan();
    await kos(id);
    expect(await satirlar(id)).toEqual([{ durum: 'acildi', platform_mesaji: null }]);
    expect(await planDurumu(id)).toBe('kuruldu');
    expect(meta.provalar.length).toBeGreaterThan(0);
    expect(meta.acmaSirasi).toEqual(['campaigns', 'adsets', 'ads']);
    // Önek açma çağrısında kalktı.
    const kampanya = [...meta.kayitlar.values()].find((k) => k.uc === 'campaigns')!;
    expect(String(kampanya.alanlar.name)).not.toContain('açılmadı');
    // Meta bütçesi dönem toplamı (M-2).
    expect(kampanya.alanlar.lifetime_budget).toBeDefined();
  });

  it('KRİTİK: yazma kesici basılıysa Meta’ya HİÇBİR çağrı gitmez, satır sebebiyle düşer', async () => {
    await h.q(`UPDATE ajans_ayari SET meta_yazma_durduruldu = true, durdurma_sebebi = 'olay', durdurma_at = now() WHERE org_id = $1`, [IDS.org]);
    const id = await onayliPlan();
    await kos(id);
    const [s] = await satirlar(id);
    expect(s!.durum).toBe('dustu');
    expect(s!.platform_mesaji).toMatch(/durduruldu: olay/);
    expect(meta.postSayisi).toBe(0);
    expect(meta.provalar).toEqual([]);
    expect(await planDurumu(id)).toBe('kismen_kuruldu');
  });

  it('KRİTİK: eksik varken prova çağrısı YAPILMAZ (sayfa yok → kota harcanmaz)', async () => {
    await h.q(`DELETE FROM social_profiles WHERE id = $1`, [SAYFA]);
    const id = await onayliPlan();
    await kos(id);
    const [s] = await satirlar(id);
    expect(s!.durum).toBe('dustu');
    expect(s!.platform_mesaji).toMatch(/Facebook sayfası/);
    expect(meta.provalar).toEqual([]);
  });

  it('KRİTİK: kesin ret sonraki halkaları kurmaz; "Şimdi kur" reddedilmiş nesneyi YENİDEN GÖNDERMEZ', async () => {
    meta.olusturHatasi = (uc) => (uc === 'adsets' ? { hata: new MetaKesinHata('Geçersiz hedefleme', 100) } : null);
    const id = await onayliPlan();
    await kos(id);
    const [s] = await satirlar(id);
    expect(s).toMatchObject({ durum: 'dustu' });
    expect(s!.platform_mesaji).toMatch(/Geçersiz hedefleme/);
    expect(meta.sayi('ads')).toBe(0);
    const once = meta.postSayisi;
    await svc.eylem(AJANS, id, { eylem: 'yeniden_dene', surum: 1 }, SIMDI);
    await kos(id, true);
    expect(meta.postSayisi).toBe(once);
    expect((await satirlar(id))[0]!.platform_mesaji).toMatch(/mükerrer/);
  });

  it('KRİTİK: belirsiz sonuç kayit_belirsiz; ikinci POST yok', async () => {
    meta.olusturHatasi = (uc) => (uc === 'campaigns' ? { hata: new MetaBelirsizHata('zaman aşımı'), yineDeOlustur: 1 } : null);
    const id = await onayliPlan();
    await kos(id);
    expect((await satirlar(id))[0]!.durum).toBe('kayit_belirsiz');
    expect(meta.sayi('campaigns')).toBe(1);
    expect(meta.postSayisi).toBe(1);
  });

  it('KRİTİK: geri okumada bütçe farklı dönerse açılmaz (fark_var)', async () => {
    meta.okumaBozucu = (_id, o) => ('lifetime_budget' in o ? { ...o, lifetime_budget: '1' } : o);
    const id = await onayliPlan();
    await kos(id);
    expect((await satirlar(id))[0]!.durum).toBe('fark_var');
    expect(meta.acmaSirasi).toEqual([]);
  });

  it('prova kotası doluysa iş ERTELENİR (Meta’ya gidilmez)', async () => {
    const id = await onayliPlan();
    await pilotIsiniIsle(bag(), { tur: 'plan', planId: id, yeniden: false }, 'is1');
    await h.q(
      `INSERT INTO pilot_kurulum_satirlari (plan_id, org_id, client_id, onaylanan_surum, satir_anahtari, platform, ad, ad_account_id, prova_zamani)
       VALUES ($1, $2, $3, 1, 'x1', 'meta', 'x', $4, now()), ($1, $2, $3, 1, 'x2', 'meta', 'x', $4, now())`,
      [id, IDS.org, IDS.client, IDS.adAccount],
    );
    const r = await pilotIsiniIsle(bag(), { tur: 'satir', satirId: kuyruktaki[0]! }, 'is2');
    expect(r).toMatchObject({ tur: 'ertele' });
    expect(meta.provalar).toEqual([]);
  });
});

describe('test ve kapalı kip', () => {
  it('KRİTİK: test kipi kurar, geri okur, AÇMAZ ve arşivler', async () => {
    const id = await onayliPlan('test');
    await kos(id);
    expect((await satirlar(id))[0]!.durum).toBe('test_kipinde_kuruldu');
    expect(meta.acmaSirasi).toEqual([]);
    expect([...meta.kayitlar.values()].find((k) => k.uc === 'campaigns')!.status).toBe('ARCHIVED');
    expect(await planDurumu(id)).toBe('kuruldu');
  });

  it('KRİTİK: kapalı kipte platforma HİÇ gidilmez ve plan kuruldu SAYILMAZ', async () => {
    const id = await onayliPlan('kapali');
    await kos(id);
    expect((await satirlar(id))[0]!.durum).toBe('kurulmadi_kapali');
    expect(meta.postSayisi + meta.provalar.length).toBe(0);
    expect(await planDurumu(id)).toBe('kismen_kuruldu');
  });
});

describe('süpürme', () => {
  it('KRİTİK: kuyruğa giremeyen onaylı plan süpürmeyle kuyruğa girer; düşmüş satır kendiliğinden denenmez', async () => {
    const { pilotSupurmesi } = await import('./kurulum-supurme');
    const id = await onayliPlan();
    const ekle = vi.fn(async () => undefined);
    // Henüz 5 dakika olmadı: dokunulmaz.
    expect(await pilotSupurmesi({ tx, planEkle: ekle }, new Date())).toBe(0);
    await h.q(`UPDATE pilot_planlari SET updated_at = now() - interval '10 minutes' WHERE id = $1`, [id]);
    expect(await pilotSupurmesi({ tx, planEkle: ekle }, new Date())).toBe(1);
    expect(ekle).toHaveBeenCalledWith(id, expect.stringMatching(/^sup\d+$/));
    // Kurulup düşmüş satırlı plan süpürmeye girmez.
    meta.olusturHatasi = () => ({ hata: new MetaKesinHata('ret', 100) });
    await kos(id);
    await h.q(`UPDATE pilot_planlari SET updated_at = now() - interval '10 minutes'`);
    ekle.mockClear();
    expect(await pilotSupurmesi({ tx, planEkle: ekle }, new Date())).toBe(0);
  });
});
