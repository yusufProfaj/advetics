import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GERI_BESLEME_OLAY_DURUMLARI, geriBeslemeAyarSchema, geriBeslemeOlayListeSchema, type TenantContext } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import { ayarAc, lead, olay, olaylar, PIKSEL } from '../../../test/geri-besleme-tohum';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SyncQueueService } from '../../queue/sync-queue.service';
import type { AuditService } from '../audit/audit.service';
import { PlatformApiError } from '../connections/provider.types';
import type { ProviderRegistry } from '../connections/provider.registry';
import type { TokenVaultService } from '../connections/token-vault.service';
import { GeriBeslemeService } from './geri-besleme.service';

/**
 * ═══ AYAR VE GEÇMİŞ UÇLARI — gerçek Postgres, sahte Meta ═══
 *
 * KRİTİK İDDİALAR:
 *   · açılış son 7 günü kuyruğa alıyor ve eskilerin SAYISINI dönüyor (Ç-13),
 *   · veri kümesi workspace'in piksel listesinde değilse KAYIT YOK (tahmin yok, Ç-7),
 *   · kapanış bekleyenleri iptal ediyor ve sayıyor,
 *   · açılış/kapanış/değişiklik DENETİM KAYDINA yazılıyor (Ç-8),
 *   · yeniden dene: ulaşmış satıra DOKUNMUYOR, 7 günü geçeni ayrı sayıyor,
 *   · boş geçmiş NEDENİNİ söylüyor, sayılar süzgeçten bağımsız,
 *   · başka workspace'e erişim 403 (RLS'in sessiz boşluğuna bırakılmıyor).
 */
let h: Harness;
const LEAD = 'cccccccc-0000-4000-8000-000000000001';
const ESKI = 'cccccccc-0000-4000-8000-000000000002';
const BASKA = 'dddddddd-0000-4000-8000-000000000001';
const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], activeClientId: null, isOrgAdmin: true, permissions: [] } as unknown as TenantContext;

let pikseller: Array<{ id: string; ad: string }> = [];
let pikselHatasi: Error | null = null;
let record: ReturnType<typeof vi.fn>;
let enqueue: ReturnType<typeof vi.fn>;
let veriKumesi: ReturnType<typeof vi.fn>;

function kur(): GeriBeslemeService {
  record = vi.fn(async () => undefined);
  enqueue = vi.fn(async () => ({ enqueued: true }));
  const svc = new GeriBeslemeService(
    { withTenant: async (_c: TenantContext, fn: (tx: unknown) => Promise<unknown>) => fn(h.db) } as unknown as PrismaService,
    { record } as unknown as AuditService,
    { getAccessToken: async () => 'TOKEN' } as unknown as TokenVaultService,
    {
      get: () => ({
        fetchAdPixels: async () => {
          if (pikselHatasi) throw pikselHatasi;
          return { satirlar: pikseller.map((p) => ({ ...p, sonCalisma: null, kullanilamaz: false, satinAlma7Gun: null })), kesildi: false };
        },
      }),
    } as unknown as ProviderRegistry,
    { isEnabled: true, enqueue } as unknown as SyncQueueService,
  );
  veriKumesi = vi.fn(async () => ({ ad: 'Ege pikseli', crm: false, kullanilamaz: false }));
  svc.istemci = { veriKumesiOku: veriKumesi } as never;
  return svc;
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
  pikseller = [{ id: PIKSEL, ad: 'Ege pikseli' }];
  pikselHatasi = null;
  const simdi = Date.now();
  await lead(h, { id: LEAD, externalId: '123456789012345', submittedAt: new Date(simdi - 3_600_000) });
  await lead(h, { id: ESKI, externalId: '223456789012345', submittedAt: new Date(simdi - 10 * 86_400_000) });
});

const ac = (ek: Record<string, unknown> = {}) =>
  geriBeslemeAyarSchema.parse({ clientId: IDS.client, platform: 'meta', etkin: true, datasetId: PIKSEL, aydinlatmaOnayi: true, ...ek });

describe('ayar yazma', () => {
  it('KRİTİK: açılış son 7 günü kuyruğa alıyor, eskileri sayıyor, denetim kaydı yazıyor ve işi hemen tetikliyor', async () => {
    const svc = kur();
    const r = await svc.ayarYaz(CTX, ac());
    expect(r.degisim).toEqual({ kuyruga: 1, eskiOlduguIcinAtlanan: 1, iptalEdilen: 0 });
    expect(r).toMatchObject({ etkin: true, datasetId: PIKSEL, datasetAdi: 'Ege pikseli', durum: 'bekliyor' });
    expect((await olaylar(h, LEAD)).map((o) => o.asama)).toEqual(['ham_lead']);
    expect(await olaylar(h, ESKI)).toEqual([]);
    expect(record).toHaveBeenCalledWith(expect.anything(), CTX, expect.objectContaining({ action: 'geri_besleme.acildi' }));
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ jobType: 'lead_feedback_send', clientId: IDS.client }));
    const [a] = await h.q<{ baglanti_id: string; aydinlatma_onaylayan: string }>(
      'SELECT baglanti_id::text AS baglanti_id, aydinlatma_onaylayan::text AS aydinlatma_onaylayan FROM geri_besleme_ayarlari',
    );
    expect(a).toEqual({ baglanti_id: IDS.connection, aydinlatma_onaylayan: IDS.user });
  });

  it('KRİTİK: veri kümesi workspace’in piksel listesinde yoksa KAYIT YOK', async () => {
    await expect(kur().ayarYaz(CTX, ac({ datasetId: '5555555555' }))).rejects.toThrow(BadRequestException);
    expect(await h.q('SELECT 1 FROM geri_besleme_ayarlari')).toHaveLength(0);
  });

  it('piksel listesi HİÇ okunamadıysa kayıt yok ve Meta’nın cümlesi taşınıyor', async () => {
    pikselHatasi = new PlatformApiError('meta', 'permission_denied', '(#200) Missing permissions');
    await expect(kur().ayarYaz(CTX, ac())).rejects.toThrow(/Missing permissions/);
    expect(await h.q('SELECT 1 FROM geri_besleme_ayarlari')).toHaveLength(0);
  });

  it('aydınlatma onayı olmadan açmak şemada reddediliyor', () => {
    expect(() => ac({ aydinlatmaOnayi: false })).toThrow();
  });

  it('KRİTİK: kapanış bekleyenleri iptal ediyor ve sayısını dönüyor; denetim kaydı', async () => {
    const svc = kur();
    await svc.ayarYaz(CTX, ac());
    const r = await svc.ayarYaz(CTX, ac({ etkin: false, aydinlatmaOnayi: false }));
    expect(r.degisim).toEqual({ kuyruga: 0, eskiOlduguIcinAtlanan: 0, iptalEdilen: 1 });
    expect(r.durum).toBe('kapali');
    expect((await olaylar(h))[0]!.durum).toBe('iptal');
    expect(record).toHaveBeenLastCalledWith(expect.anything(), CTX, expect.objectContaining({ action: 'geri_besleme.kapatildi' }));
  });

  it('KRİTİK: yeniden kayıt sistematik ret durdurmasını kaldırıyor (Ö-4)', async () => {
    const svc = kur();
    await svc.ayarYaz(CTX, ac());
    await h.q(`UPDATE geri_besleme_ayarlari SET gonderim_durduruldu = true, son_ayar_hatasi = 'aynı hata'`);
    await svc.ayarYaz(CTX, ac());
    const [a] = await h.q<{ gonderim_durduruldu: boolean; son_ayar_hatasi: string | null }>(
      'SELECT gonderim_durduruldu, son_ayar_hatasi FROM geri_besleme_ayarlari',
    );
    expect(a).toEqual({ gonderim_durduruldu: false, son_ayar_hatasi: null });
  });

  it('açıkken yeniden kaydetmek geri doldurmayı tekrarlamıyor', async () => {
    const svc = kur();
    await svc.ayarYaz(CTX, ac());
    const r = await svc.ayarYaz(CTX, ac());
    expect(r.degisim).toBeNull();
    expect(await olaylar(h)).toHaveLength(1);
  });

  it('başka workspace 403', async () => {
    await expect(kur().ayarYaz(CTX, ac({ clientId: BASKA }))).rejects.toThrow(ForbiddenException);
  });
});

describe('ayar okuma', () => {
  it('kapalıyken durum ve neden dolu; seçenek istenmediyse Meta’ya gidilmiyor ve not bunu söylüyor', async () => {
    pikselHatasi = new Error('çağrılmamalıydı');
    const r = await kur().ayar(CTX, IDS.client);
    expect(r).toMatchObject({ etkin: false, durum: 'kapali', secenekler: [], secenekNotu: 'Seçenekler bu istekte okunmadı.' });
    expect(r.neden.length).toBeGreaterThan(0);
    expect(r.uygunlukEksikleri).toContain('az_lead');
    expect(Object.keys(r.sayilar)).toHaveLength(GERI_BESLEME_OLAY_DURUMLARI.length);
  });

  it('seçenekler: hazırlığın pikseli varsayılan; okunamazsa liste boş değil ve not Meta’nın cümlesi', async () => {
    await h.q(`INSERT INTO workspace_hazirlama (client_id, org_id, durum, piksel_id, updated_at) VALUES ($1, $2, 'hazir', $3, now())`, [
      IDS.client,
      IDS.org,
      PIKSEL,
    ]);
    pikselHatasi = new Error('(#100) Unsupported get request');
    const r = await kur().ayar(CTX, IDS.client, true);
    expect(r.secenekler).toEqual([{ id: PIKSEL, ad: `Piksel ${PIKSEL}`, varsayilan: true, crm: null }]);
    expect(r.secenekNotu).toContain('Unsupported get request');
  });

  it('bağlantı yeniden yetki isterse durum kurulum_eksik ve neden söylüyor', async () => {
    await ayarAc(h);
    await h.q(`UPDATE platform_connections SET status = 'needs_reauth'`);
    const r = await kur().ayar(CTX, IDS.client);
    expect(r.durum).toBe('kurulum_eksik');
    expect(r.neden).toContain('yeniden yetki');
  });

  it('ayar hatası platformun cümlesiyle', async () => {
    await ayarAc(h);
    await h.q(`UPDATE geri_besleme_ayarlari SET son_ayar_hatasi = '(#200) Requires ads_management permission'`);
    const r = await kur().ayar(CTX, IDS.client);
    expect(r).toMatchObject({ durum: 'hata', neden: '(#200) Requires ads_management permission' });
  });
});

describe('kontrol', () => {
  it('is_crm okunup yazılıyor (çağrı transaction dışında)', async () => {
    await ayarAc(h);
    const svc = kur();
    await svc.kontrol(CTX, IDS.client);
    expect(veriKumesi).toHaveBeenCalledWith(PIKSEL, 'TOKEN');
    const [a] = await h.q<{ dataset_crm: boolean; son_kontrol: Date | null }>('SELECT dataset_crm, son_kontrol FROM geri_besleme_ayarlari');
    expect(a).toMatchObject({ dataset_crm: false });
    expect(a!.son_kontrol).not.toBeNull();
  });

  it('erişim hatası açık ayarı hataya düşürüyor ve Meta hatası yukarı çıkıyor', async () => {
    await ayarAc(h);
    const svc = kur();
    veriKumesi.mockRejectedValueOnce(new PlatformApiError('meta', 'permission_denied', '(#10) Pixel not shared'));
    await expect(svc.kontrol(CTX, IDS.client)).rejects.toBeInstanceOf(PlatformApiError);
    const [a] = await h.q<{ son_ayar_hatasi: string }>('SELECT son_ayar_hatasi FROM geri_besleme_ayarlari');
    expect(a!.son_ayar_hatasi).toContain('Pixel not shared');
  });
});

describe('geçmiş ve yeniden dene', () => {
  it('KRİTİK: boş geçmiş NEDENİNİ söylüyor (kapalı / süzgeç / gönderim yok)', async () => {
    const svc = kur();
    const q = (ek: Record<string, unknown> = {}) => geriBeslemeOlayListeSchema.parse({ clientId: IDS.client, ...ek });
    expect((await svc.olaylar(CTX, q())).emptyReason).toBe('ayar_kapali');
    await ayarAc(h);
    expect((await svc.olaylar(CTX, q())).emptyReason).toBe('gonderim_yok');
    await olay(h, { leadId: LEAD, asama: 'ham_lead', durum: 'iletildi', olayZamani: new Date() });
    const r = await svc.olaylar(CTX, q({ durum: 'vazgecildi' }));
    expect(r).toMatchObject({ toplam: 0, emptyReason: 'suzgecte_yok' });
    // Sayılar süzgeçten bağımsız.
    expect(r.sayilar.iletildi).toBe(1);
    const dolu = await svc.olaylar(CTX, q());
    expect(dolu).toMatchObject({ toplam: 1, emptyReason: null });
    expect(dolu.satirlar[0]).toMatchObject({ leadAdi: 'Ayşe Kaya', asama: 'ham_lead', durum: 'iletildi' });
  });

  it('KRİTİK: yeniden dene ulaşmış satıra dokunmuyor, 7 günü geçeni ayrı sayıyor, kalanı sıraya koyuyor', async () => {
    await ayarAc(h);
    const ulasan = await olay(h, { leadId: LEAD, asama: 'ham_lead', durum: 'iletildi', olayZamani: new Date() });
    const vazgecilen = await olay(h, { leadId: LEAD, asama: 'ulasildi', durum: 'vazgecildi', olayZamani: new Date(), sonrakiDeneme: null });
    const eski = await olay(h, { leadId: ESKI, asama: 'ulasildi', durum: 'reddedildi', olayZamani: new Date(Date.now() - 8 * 86_400_000), sonrakiDeneme: null });
    const svc = kur();
    const r = await svc.yenidenDene(CTX, { clientId: IDS.client, olayIdleri: [ulasan, vazgecilen, eski] });
    expect(r).toEqual({ kuyruga: 1, suresiGecen: 1, zatenUlasan: 1 });
    const d = Object.fromEntries((await h.q<{ id: string; durum: string; deneme: number }>('SELECT id::text AS id, durum, deneme::int AS deneme FROM geri_besleme_olaylari')).map((o) => [o.id, o]));
    expect(d[ulasan]!.durum).toBe('iletildi');
    expect(d[vazgecilen]).toMatchObject({ durum: 'bekliyor', deneme: 0 });
    expect(d[eski]!.durum).toBe('reddedildi');
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
});
