import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { KAYNAK_TANIMI, type TenantContext } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { PlatformApiError } from '../connections/provider.types';
import { Ga4Istemcisi } from '../connections/providers/ga4';
import { VeriKaynagiService } from './veri-kaynagi.service';

/**
 * ═══ VERİ KAYNAĞI SERVİSİ — GERÇEK VERİTABANI ═══
 *
 * Platform çağrısı Ga4Istemcisi PROTOTİPİ üzerinden taklit ediliyor; servis
 * sorguları PGlite'ta gerçek koşuyor. RLS burada kapalı (worker rolü
 * taklidi); politikalar `veri-kaynagi-rls.spec.ts`te SET ROLE ile.
 */
let h: Harness;
let svc: VeriKaynagiService;
const enqueue = vi.fn();
const B = '99999999-9999-4999-8999-999999999999';
const GA4 = KAYNAK_TANIMI.ga4.scope!;
const ctx = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client, B],
  activeClientId: IDS.client,
  permissions: ['client.read', 'connection.write', 'connection.manage', 'insights.read'],
} as unknown as TenantContext;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
afterEach(() => {
  vi.restoreAllMocks();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h, { platform: 'google', externalId: '1234567890' });
  await h.q(`UPDATE platform_connections SET granted_scopes = $1`, [['https://www.googleapis.com/auth/adwords', GA4]]);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Öbür Workspace', 'obur', now())`, [B, IDS.org]);
  // Öbür workspace'in kendi Google bağlantısı (ajans havuzu yok: baglantiSec onu seçer).
  await h.q(
    `INSERT INTO platform_connections (id, org_id, client_id, platform, status, external_user_id, account_label, access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'google', 'active', 'u2', 'B', '\\x00', $3, $4, now())`,
    [IDS.org, B, ['https://www.googleapis.com/auth/adwords', GA4], IDS.user],
  );
  enqueue.mockReset().mockResolvedValue({ enqueued: true, syncJobId: '1' });
  const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
  svc = new VeriKaynagiService(
    prisma,
    h.db as never,
    { getAccessToken: vi.fn().mockResolvedValue('tok') } as never,
    { get: vi.fn().mockReturnValue({}) } as never,
    { enqueue } as never,
    { record: vi.fn() } as never,
  );
  vi.spyOn(Ga4Istemcisi.prototype, 'mulkAyari').mockResolvedValue({ ad: 'Ege Birlik', saatDilimi: 'Europe/Istanbul', paraBirimi: 'TRY' });
});

describe('liste', () => {
  it('KRİTİK: bağlanabilir türler NEDENİYLE; izin eksikse düğmenin bağlantısı dönüyor; kimlik_enc yanıtta yok', async () => {
    await h.q(`UPDATE platform_connections SET granted_scopes = $1`, [['https://www.googleapis.com/auth/adwords']]);
    const r = await svc.liste(ctx, IDS.client);
    const ga4 = r.baglanabilir.find((b) => b.tur === 'ga4')!;
    expect(ga4.engel).toMatch(/Analytics okuma izni yok/);
    expect(ga4.izinBaglantiId).toBe(IDS.connection);
    expect(r.baglanabilir.find((b) => b.tur === 'search_console')!.engel).toMatch(/sonraki aşamada/);
    expect(JSON.stringify(r)).not.toMatch(/kimlik_?[eE]nc/);
  });

  it('Google bağlantısı yoksa "bağla" der, izin demez', async () => {
    await h.q(`UPDATE platform_connections SET status = 'revoked', revoked_at = now()`);
    const r = await svc.liste(ctx, IDS.client);
    expect(r.baglanabilir.find((b) => b.tur === 'ga4')!.engel).toMatch(/Google bağlantısı yok/);
  });

  it('kurulumdaki mülk farklıysa kart SÖYLÜYOR, sessizce biri seçilmiyor', async () => {
    await svc.bagla(ctx, { clientId: IDS.client, tur: 'ga4', disKimlik: 'properties/312845771' }, {});
    await h.q(`INSERT INTO workspace_kurulum (client_id, org_id, ga4_mulk_id) VALUES ($1, $2, '999999999')`, [IDS.client, IDS.org]);
    const r = await svc.liste(ctx, IDS.client);
    expect(r.kaynaklar[0]!.kurulumUyusmazligi).toEqual({ kurulumMulkId: '999999999' });
  });
});

describe('bagla', () => {
  it('KRİTİK: girişte biçim denetimi (ölçüm kimliği reddedilir, platforma gidilmez)', async () => {
    await expect(svc.bagla(ctx, { clientId: IDS.client, tur: 'ga4', disKimlik: 'G-ABC123XYZ' }, {})).rejects.toThrow(/mülk kimliği yalnız rakamdan/);
    expect(Ga4Istemcisi.prototype.mulkAyari).not.toHaveBeenCalled();
  });

  it('KRİTİK: kaydeder, yapıyı etkileşimli kuyruğa alır; mülk ayarı satıra yazılır', async () => {
    const o = await svc.bagla(ctx, { clientId: IDS.client, tur: 'ga4', disKimlik: '312845771' }, {});
    expect(o).toMatchObject({ tur: 'ga4', disKimlik: '312845771', ad: 'Ege Birlik', durum: 'etkin', saatDilimi: 'Europe/Istanbul', anahtarEtkinlikler: null });
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ jobType: 'kaynak_yapi', veriKaynagiId: o.id, interactive: true }));
  });

  it('KRİTİK: aynı mülk başka workspace\'te etkinse 409 ve o workspace\'in ADI', async () => {
    await svc.bagla(ctx, { clientId: B, tur: 'ga4', disKimlik: '312845771' }, {});
    await expect(svc.bagla(ctx, { clientId: IDS.client, tur: 'ga4', disKimlik: '312845771' }, {})).rejects.toThrow(/"Öbür Workspace" workspace’ine bağlı/);
  });

  it('kaldırılıp yeniden bağlanınca AYNI satır canlanır (ikinci satır yok)', async () => {
    const o = await svc.bagla(ctx, { clientId: IDS.client, tur: 'ga4', disKimlik: '312845771' }, {});
    await svc.kaldir(ctx, o.id, {});
    const y = await svc.bagla(ctx, { clientId: IDS.client, tur: 'ga4', disKimlik: '312845771' }, {});
    expect(y.id).toBe(o.id);
    expect(await h.q(`SELECT count(*)::int AS n FROM veri_kaynaklari`)).toEqual([{ n: 1 }]);
  });

  it('başka workspace\'te KALDIRILMIŞ mülk buraya verisiyle taşınır (denormalize client_id dahil)', async () => {
    const o = await svc.bagla(ctx, { clientId: B, tur: 'ga4', disKimlik: '312845771' }, {});
    await h.q(
      `INSERT INTO ga4_gunluk (gun, veri_kaynagi_id, satir_hash, client_id, org_id, kaynak_ortam, oturum) VALUES ('2026-10-01', $1, repeat('a', 64), $2, $3, 'a / b', 3)`,
      [o.id, B, IDS.org],
    );
    await svc.kaldir(ctx, o.id, {});
    const y = await svc.bagla(ctx, { clientId: IDS.client, tur: 'ga4', disKimlik: '312845771' }, {});
    expect(y.id).toBe(o.id);
    expect(y.clientId).toBe(IDS.client);
    expect(await h.q(`SELECT client_id::text FROM ga4_gunluk`)).toEqual([{ client_id: IDS.client }]);
  });

  it('workspace\'te ikinci bir GA4 mülkü bağlanamaz (hangisinin okunacağı belirsiz kalırdı)', async () => {
    await svc.bagla(ctx, { clientId: IDS.client, tur: 'ga4', disKimlik: '312845771' }, {});
    await expect(svc.bagla(ctx, { clientId: IDS.client, tur: 'ga4', disKimlik: '412845771' }, {})).rejects.toThrow(/zaten 312845771/);
  });

  it('Google erişim reddini GOOGLE\'IN CÜMLESİYLE söylüyor ("Beklenmeyen bir hata" değil)', async () => {
    vi.spyOn(Ga4Istemcisi.prototype, 'mulkAyari').mockRejectedValue(new PlatformApiError('google', 'permission_denied', 'User does not have sufficient permissions.'));
    await expect(svc.bagla(ctx, { clientId: IDS.client, tur: 'ga4', disKimlik: '312845771' }, {})).rejects.toThrow(/erişimi yok.*sufficient permissions/);
  });

  it('F2/F3 türü bu aşamada bağlanamıyor (çalışmayan seçenek açılmaz)', async () => {
    await expect(svc.bagla(ctx, { clientId: IDS.client, tur: 'search_console', disKimlik: 'sc-domain:ornek.com' }, {})).rejects.toThrow(/bu aşamada/);
  });
});

describe('kurulumdanBagla (Ç-5)', () => {
  it('workspace\'te kaynak yoksa bağlar; farklı mülk varsa DOKUNMAZ ve söyler', async () => {
    expect(await svc.kurulumdanBagla(ctx, IDS.client, '312845771')).toBe('Analytics okuması bağlandı.');
    expect(await svc.kurulumdanBagla(ctx, IDS.client, '312845771')).toBeNull();
    expect(await svc.kurulumdanBagla(ctx, IDS.client, '555555555')).toMatch(/farklı/);
    expect(await h.q(`SELECT dis_kimlik, created_by FROM veri_kaynaklari`)).toEqual([{ dis_kimlik: '312845771', created_by: null }]);
  });
});

describe('rapor uçları: boş listenin NEDENİ', () => {
  const q = { clientId: IDS.client, from: '2026-09-01', to: '2026-09-30' };

  it('KRİTİK: kaynak yok / çekim koşmadı / izin eksik / veri yok DÖRT AYRI cevap', async () => {
    expect((await svc.takipAcigi(ctx, q)).emptyReason).toBe('kaynak_yok');
    const o = await svc.bagla(ctx, { clientId: IDS.client, tur: 'ga4', disKimlik: '312845771' }, {});
    expect((await svc.takipAcigi(ctx, q)).emptyReason).toBe('cekim_kosmadi');
    await h.q(`UPDATE veri_kaynaklari SET durum = 'izin_eksik'`);
    expect((await svc.trafik(ctx, q)).emptyReason).toBe('izin_eksik');
    await h.q(`UPDATE veri_kaynaklari SET durum = 'etkin', son_basarili_cekim = now() WHERE id = $1`, [o.id]);
    expect((await svc.trafik(ctx, q)).emptyReason).toBe('veri_yok');
  });

  it('trafik: Google satırı Ads kimliğiyle kampanyaya eşlenir; toplam oturum ve ücretli oturum ayrı', async () => {
    const o = await svc.bagla(ctx, { clientId: IDS.client, tur: 'ga4', disKimlik: '312845771' }, {});
    await h.q(`UPDATE veri_kaynaklari SET son_basarili_cekim = now()`);
    const [c] = await h.q<{ id: string }>(
      `INSERT INTO campaigns (id, client_id, ad_account_id, platform, external_id, name, status, updated_at) VALUES (gen_random_uuid(), $1, $2, 'google', '24337936076', 'Konut', 'active', now()) RETURNING id::text`,
      [IDS.client, IDS.adAccount],
    );
    for (const [hash, ortam, ads, n] of [
      ['a', 'google / cpc', '24337936076', 40],
      ['b', 'google / organic', null, 60],
    ] as const) {
      await h.q(
        `INSERT INTO ga4_gunluk (gun, veri_kaynagi_id, satir_hash, client_id, org_id, kaynak_ortam, kampanya_adi, ads_kampanya_kimligi, oturum, anahtar_etkinlik)
         VALUES ('2026-09-10', $1, repeat($2, 64), $3, $4, $5, 'Konut', $6, $7, 2)`,
        [o.id, hash, IDS.client, IDS.org, ortam, ads, n],
      );
    }
    const r = await svc.trafik(ctx, q);
    expect(r.toplam).toEqual({ oturum: 100, ucretliOturum: 40, anahtarEtkinlik: 4 });
    expect(r.gosterilen).toBe(r.toplamSatir);
    expect(r.satirlar.find((s) => s.kaynakOrtam === 'google / cpc')!.esleme).toEqual({ sonuc: 'kimlik', kampanyaId: c!.id, kampanyaAdi: 'Konut', platform: 'google' });
    expect(r.satirlar.find((s) => s.kaynakOrtam === 'google / organic')!.esleme).toEqual({ sonuc: 'eslenemedi', neden: 'ucretli_degil' });
  });
});
