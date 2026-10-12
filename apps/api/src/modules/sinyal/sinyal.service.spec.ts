import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { sinyalListeSorgusuSchema, type TenantContext } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import type { AppConfig } from '../../config/configuration';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { CampaignActionsService, SeviyeliUygulamaSonucu } from '../campaign-actions/campaign-actions.service';
import { ON_KOSUL_NOTU } from './sinyal-hesap';
import { SinyalService } from './sinyal.service';

/**
 * SİNYAL SERVİSİ — gerçek Postgres (PGlite), sahte platform yazması.
 *
 * KRİTİK İDDİALAR:
 *   · boş liste NEDENİNİ söylüyor (hesap yok / hesaplanmadı / sinyal yok / süzgeç),
 *   · sessiz koşumda yalnız org yöneticisi görüyor,
 *   · kapat ikinci kez 409 (sessiz başarı yok),
 *   · Uygula özet uymuyorsa platforma GİTMİYOR; geri okuma uyuşmazsa sinyal açık kalıyor.
 */

let h: Harness;
const KAMPANYA = '99999999-9999-9999-9999-999999999999';
const SIMDI = new Date('2026-10-12T06:00:00Z');

const CTX = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: null,
  isOrgAdmin: true,
  permissions: [],
} as unknown as TenantContext;

function kur(sessizKosum = false, dogrulama: 'dogrulandi' | 'uyusmadi' = 'dogrulandi') {
  const prisma = { withTenant: async (_c: TenantContext, fn: (tx: unknown) => Promise<unknown>) => fn(h.db) } as unknown as PrismaService;
  const uygula = vi.fn(async () => ({ dogrulama, platformDegeri: 'Duraklatıldı' }) as unknown as SeviyeliUygulamaSonucu);
  const record = vi.fn(async () => undefined);
  const svc = new SinyalService(
    prisma,
    { uygula } as unknown as CampaignActionsService,
    { record } as unknown as AuditService,
    { sinyal: { sessizKosum } } as unknown as AppConfig,
  );
  return { svc, uygula, record };
}

const sorgu = (ek: Record<string, unknown> = {}) => sinyalListeSorgusuSchema.parse({ clientId: IDS.client, ...ek });

async function sinyal(): Promise<string> {
  const [r] = await h.q<{ id: string }>(
    `INSERT INTO sinyaller (org_id, client_id, ad_account_id, platform, anahtar, tur, kod, yon, seviye, varlik_id, varlik_adi, ust_adi,
       gun, gozlenen, beklenen_orta, beklenen_alt, beklenen_ust, nokta, z, onem, para_birimi, kanit)
     VALUES ($1, $2, $3, 'meta', $4, 'anomali', 'harcama', 'artis', 'campaign', $5, 'Kampanya', 'Hesap',
       '2026-10-11', 400, 100, 85, 115, 6, 60, 'yuksek', 'TRY', '{}'::jsonb) RETURNING id::text AS id`,
    [IDS.org, IDS.client, IDS.adAccount, `anomali:harcama:artis:campaign:${KAMPANYA}`, KAMPANYA],
  );
  return r!.id;
}

async function hesaplandi() {
  await h.q(`UPDATE ad_accounts SET last_insights_sync_at = $1`, [SIMDI.toISOString()]);
  await h.q(
    `INSERT INTO sync_jobs (client_id, ad_account_id, job_type, status, date_from, date_to, finished_at, note)
     VALUES ($1, $2, 'signals_evaluate', 'succeeded', '2026-10-11', '2026-10-11', $3, '0 bulgu')`,
    [IDS.client, IDS.adAccount, SIMDI.toISOString()],
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
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
     VALUES ($1, $2, $3, 'meta', 'c-1', 'Kampanya', 'active', 'none', now())`,
    [KAMPANYA, IDS.adAccount, IDS.client],
  );
});

describe('liste', () => {
  it('KRİTİK: boş liste NEDENİNİ söylüyor — hiç hesaplanmadı ile sinyal yok AYRI', async () => {
    const { svc } = kur();
    await h.q(`UPDATE ad_accounts SET last_insights_sync_at = $1`, [SIMDI.toISOString()]);
    const once = await svc.liste(CTX, sorgu(), SIMDI);
    expect(once.emptyReason).toBe('hesaplanmadi');
    expect(once.hesaplar[0]!.durum).toBe('hic_hesaplanmadi');

    // Ön koşul reddiyle biten iş "hesaplandı" SAYILMIYOR.
    await h.q(
      `INSERT INTO sync_jobs (client_id, ad_account_id, job_type, status, finished_at, note)
       VALUES ($1, $2, 'signals_evaluate', 'succeeded', now(), $3)`,
      [IDS.client, IDS.adAccount, `${ON_KOSUL_NOTU} metrik yok`],
    );
    expect((await svc.liste(CTX, sorgu(), SIMDI)).emptyReason).toBe('hesaplanmadi');

    await hesaplandi();
    const sonra = await svc.liste(CTX, sorgu(), SIMDI);
    // Geçmişi yetmeyen hesap: anomali aranamadı, "her şey yolunda" değil.
    expect(sonra.emptyReason).toBe('gecmis_yetersiz');
    expect(sonra.kontrolEdilmeyen).toHaveLength(4);
  });

  it('dolu liste: cümle, eylem ve özet sözleşme biçiminde', async () => {
    const { svc } = kur();
    const id = await sinyal();
    const l = await svc.liste(CTX, sorgu(), SIMDI);
    expect(l.toplam).toBe(1);
    expect(l.sayilar).toEqual({ acik: 1, kapatildi: 0, kendiliginden_kapandi: 0 });
    const s = l.sinyaller[0]!;
    expect(s).toMatchObject({ id, baslik: 'Maliyet beklenenin 4 katı', eylem: { tur: 'durdur', seviye: 'campaign', varlikId: KAMPANYA }, kisit: null });
    expect(s.ozet).toMatch(/^[0-9a-f]{64}$/);
    expect(s.gozlenen?.metin).toContain('400');
  });

  it('süzgeç her şeyi elerse neden "suzgec_bos"', async () => {
    const { svc } = kur();
    await sinyal();
    expect((await svc.liste(CTX, sorgu({ tur: 'saglik' }), SIMDI)).emptyReason).toBe('suzgec_bos');
  });

  it('KRİTİK: sessiz koşumda yalnız org yöneticisi görüyor; diğerine boş + bayrak, "sinyal yok" DEĞİL', async () => {
    const { svc } = kur(true);
    await sinyal();
    expect((await svc.liste(CTX, sorgu(), SIMDI)).sinyaller).toHaveLength(1);
    const diger = await svc.liste({ ...CTX, isOrgAdmin: false } as TenantContext, sorgu(), SIMDI);
    expect(diger).toMatchObject({ sinyaller: [], sessizKosum: true, emptyReason: null });
  });

  it('başka workspace 403', async () => {
    const { svc } = kur();
    await expect(svc.liste({ ...CTX, clientIds: [] } as TenantContext, sorgu(), SIMDI)).rejects.toThrow(/erişimin yok/);
  });
});

describe('kapat / geri aç', () => {
  it('KRİTİK: kapat → kapatıldı; ikinci kapat 409; geri aç → açık', async () => {
    const { svc } = kur();
    const id = await sinyal();
    const k = await svc.kapat(CTX, id, 'bilerek');
    expect(k.durum).toBe('kapatildi');
    expect(k.kapatma).toMatchObject({ neden: 'kullanici', kim: 'Test Kullanıcı', not: 'bilerek' });
    expect((await h.q(`SELECT kapatma_z::float8 AS z FROM sinyaller`))[0]).toEqual({ z: 60 });
    await expect(svc.kapat(CTX, id, undefined)).rejects.toBeInstanceOf(ConflictException);
    const a = await svc.geriAc(CTX, id);
    expect(a.durum).toBe('acik');
    expect(a.kapatma).toBeNull();
    await expect(svc.geriAc(CTX, id)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('uygula', () => {
  it('KRİTİK: özet uymuyorsa platforma HİÇ gidilmiyor (409)', async () => {
    const { svc, uygula } = kur();
    const id = await sinyal();
    await expect(svc.uygula(CTX, 'Ali', id, 'a'.repeat(64))).rejects.toBeInstanceOf(ConflictException);
    expect(uygula).not.toHaveBeenCalled();
  });

  it('KRİTİK: doğrulanınca sinyal "uygulandı" ile kapanıyor; durdurma yolu kampanya düzeyinde', async () => {
    const { svc, uygula, record } = kur();
    const id = await sinyal();
    const s = await svc.tek(CTX, id);
    const r = await svc.uygula(CTX, 'Ali', id, s.ozet);
    expect(uygula).toHaveBeenCalledWith(expect.objectContaining({ activeClientId: IDS.client }), { seviye: 'campaign', id: KAMPANYA }, { type: 'pause' });
    expect(r.dogrulama).toBe('dogrulandi');
    expect(r.sinyal.durum).toBe('kapatildi');
    expect(r.sinyal.kapatma?.neden).toBe('uygulandi');
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('KRİTİK: geri okuma UYUŞMAZSA sinyal AÇIK kalıyor, sonuç kayıtta', async () => {
    const { svc } = kur(false, 'uyusmadi');
    const id = await sinyal();
    const s = await svc.tek(CTX, id);
    const r = await svc.uygula(CTX, 'Ali', id, s.ozet);
    expect(r.sinyal.durum).toBe('acik');
    expect((await h.q<{ u: { dogrulama: string } }>(`SELECT uygulama AS u FROM sinyaller`))[0]!.u.dogrulama).toBe('uyusmadi');
  });

  it('LinkedIn sinyali eylemsiz ve nedenli; Uygula platforma gitmeden 400', async () => {
    const { svc, uygula } = kur();
    const id = await sinyal();
    await h.q(`UPDATE sinyaller SET platform = 'linkedin'`);
    const s = await svc.tek(CTX, id);
    expect(s.eylem).toBeNull();
    expect(s.kisit).toContain('LinkedIn');
    await expect(svc.uygula(CTX, 'Ali', id, s.ozet)).rejects.toThrow(/LinkedIn/);
    expect(uygula).not.toHaveBeenCalled();
  });
});
