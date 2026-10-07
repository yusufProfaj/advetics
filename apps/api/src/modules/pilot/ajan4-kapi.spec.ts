import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException, HttpException } from '@nestjs/common';
import {
  degisiklikUygula,
  onayKapisi,
  pilotGecisMumkunMu,
  planDegistirSchema,
  planUret,
  resolvePermissions,
  type PlanOnerisi,
  type TenantContext,
} from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import { planGirdisi, M, T } from '../../../test/pilot-fixture';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { MetinUretici } from '../../yapay-zeka/gemini';
import type { PilotKurulumKuyrugu } from './kurulum-kuyrugu';
import { PilotPlanService } from './plan.service';
import { PilotService } from './pilot.service';
import { PilotBeyanService } from './beyan.service';
import { gercekYayinAcikMi } from './gercek-yayin';
import { pilotSupurmesi } from './kurulum-supurme';

/**
 * ═══ AJAN 4 · TEST & GÜVENLİK KAPISI (Pilot Tur 1) ═══
 *
 * Diğer pilot spec'lerinin TAMAMLAYICISI; aynı şeyi ikinci kez kilitlemiyor.
 *   · RLS: J-02 (silme yok) sekiz tabloda, J-04 (başka org, aynı client),
 *     worker tablolarına panelden INSERT, kompozit FK.
 *   · IDOR: her plan/pilot/beyan ucunun servisi BAŞKA workspace bağlamıyla
 *     çağrılıyor ve satırlar DOKUNULMADAN kalıyor (J-05).
 *   · Rol: müşteri yazamaz; onay yalnız `musteride`; gerekçe KIRPILARAK.
 *   · Para: satır toplamı = plan toplamı, Meta dönem toplamı, karışık birim.
 *
 * `it.fails` = AÇIK BULGU KİLİDİ. Gövde İSTENEN davranışı iddia ediyor ve
 * bugün düşüyor; bulguyu düzelten ajan `it.fails`i `it`e çevirir. Düzeltme
 * gelip çevrilmezse `it.fails` KIRMIZIYA döner — yani bulgu sessizce
 * kapanamaz, kapandığı da sessiz kalamaz. Her birinin yanında "düzgün
 * kurulduğunu" gösteren bir KARDEŞ test var: it.fails yanlış sebepten
 * (kurulum hatası) düşüyor olamasın.
 */
let h: Harness;
let plan: PilotPlanService;
let pilot: PilotService;
let beyan: PilotBeyanService;
const kuyruk = { planEkle: vi.fn<(id: string, tetik: string, yeniden?: boolean) => Promise<void>>() };
const audit = { record: vi.fn() };
const yz = null as MetinUretici | null;

const OTEKI = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BASKA_ORG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MA = '12121212-1212-4121-8121-121212121212';
const MUSTERI_ORG = '13131313-1313-4131-8131-131313131313';
const KITLE = '77777777-0000-4000-8000-000000000001';
const VARLIK = '88888888-0000-4000-8000-000000000001';
const SIMDI = new Date('2026-10-07T06:00:00Z');
const ROL = 'adv_ajan4_test';
const TABLOLAR = [
  'pilot_planlari',
  'pilot_plan_surumleri',
  'pilot_uyum_denetimleri',
  'pilot_uyum_isaretleri',
  'pilot_kurulum_satirlari',
  'pilot_nesneleri',
  'pilot_taramalari',
  'pilot_onerileri',
] as const;

const AJANS = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  isOrgAdmin: true,
  role: 'admin',
  permissions: [...resolvePermissions('admin')],
} as unknown as TenantContext;
const MUSTERI = { ...AJANS, isOrgAdmin: false, role: 'client_viewer', permissions: [...resolvePermissions('client_viewer')] } as unknown as TenantContext;
/** Başka workspace'in kişisi: aynı org, plan ona ait DEĞİL. */
const YABANCI_AJANS = { ...AJANS, clientIds: [OTEKI], activeClientId: OTEKI } as unknown as TenantContext;
const YABANCI_MUSTERI = { ...MUSTERI, clientIds: [OTEKI], activeClientId: OTEKI } as unknown as TenantContext;

beforeAll(async () => {
  h = await createHarness();
  const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
  plan = new PilotPlanService(prisma, kuyruk as unknown as PilotKurulumKuyrugu, yz);
  pilot = new PilotService(prisma);
  beyan = new PilotBeyanService(prisma, audit as unknown as AuditService);
  await h.q(`DO $$ BEGIN CREATE ROLE ${ROL} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${ROL}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL}`);
  await h.q(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${ROL}`);
}, 60_000);
afterAll(async () => h?.close());

beforeEach(async () => {
  kuyruk.planEkle.mockReset();
  kuyruk.planEkle.mockResolvedValue(undefined);
  audit.record.mockReset();
  await h.reset();
  await seedTenant(h);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Öteki', 'oteki', now())`, [OTEKI, IDS.org]);
  await h.q(`INSERT INTO ajans_ayari (org_id, pilot_gercek_yayin, pilot_gercek_yayin_at, pilot_gercek_yayin_sebebi) VALUES ($1, true, now(), 'test kurulumu')`, [IDS.org]);
  await h.q(`UPDATE clients SET ozel_kategori_beyan_zamani = now() WHERE id = $1`, [IDS.client]);
  await h.q(`INSERT INTO monthly_budgets (id, org_id, client_id, month, amount_micros, currency, updated_at) VALUES (gen_random_uuid(), $1, $2, '2026-11-01', 120000000000, 'TRY', now())`, [IDS.org, IDS.client]);
  await h.q(`INSERT INTO audience_templates (id, org_id, client_id, name, updated_at) VALUES ($1, $2, $3, 'Genel', now())`, [KITLE, IDS.org, IDS.client]);
  await h.q(
    `INSERT INTO client_profiles (id, org_id, client_id, ana_amac, sektor, varsayilan_kitle_id, updated_at) VALUES (gen_random_uuid(), $1, $2, 'website', 'Kahve makinesi üretimi', $3, now())`,
    [IDS.org, IDS.client, KITLE],
  );
  await h.q(
    `INSERT INTO assets (id, org_id, client_id, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $2, $3, 'Görsel', 'a.jpg', 'image/jpeg', 1, 1080, 1080, 'k/a', 'aaaaaaaaaaaaaaaa1', now())`,
    [VARLIK, IDS.org, IDS.client],
  );
});

const hazirla = () => plan.hazirla(AJANS, { clientId: IDS.client, donem: '2026-11' }, SIMDI);
async function musteride(): Promise<{ id: string; oz: string }> {
  const { id } = await hazirla();
  await plan.eylem(AJANS, id, { eylem: 'musteriye_gonder', surum: 1 }, SIMDI);
  return { id, oz: (await plan.detay(MUSTERI, id, SIMDI)).plan.icerikOzeti };
}
/** ConflictException gövdesindeki ret kodları. */
async function retKodlari(p: Promise<unknown>): Promise<string[]> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ConflictException) {
      const r = e.getResponse() as { retler?: Array<{ kod: string }> };
      return (r.retler ?? []).map((x) => x.kod);
    }
    throw e;
  }
  throw new Error('ret bekleniyordu, kabul edildi');
}
const planSatiri = (id: string) =>
  h.q<{ durum: string; surum: number; updated_at: Date; onay_rolu: string | null; musteri_notu: string | null }>(
    'SELECT durum, surum, updated_at, onay_rolu, musteri_notu FROM pilot_planlari WHERE id = $1',
    [id],
  );

// ─── 1. RLS (SET ROLE + RETURNING) ─────────────────────────────────────────

async function rolOlarak<T = Record<string, unknown>>(
  ayar: { org: string; clients: string; admin?: boolean; manager?: string; user?: string },
  tablolar: readonly string[],
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id', '${ayar.org}', false),
           set_config('app.current_user_id', '${ayar.user ?? IDS.user}', false),
           set_config('app.current_client_ids', '${ayar.clients}', false),
           set_config('app.is_org_admin', '${ayar.admin ? 'on' : 'off'}', false),
           set_config('app.current_active_client_id', '', false),
           set_config('app.current_manager_account_id', '${ayar.manager ?? ''}', false),
           set_config('app.tum_sirketler', 'off', false)`);
  for (const t of tablolar) await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  await h.q(`SET ROLE ${ROL}`);
  try {
    return await h.q<T>(sql, params);
  } finally {
    await h.q('RESET ROLE');
    for (const t of tablolar) await h.q(`ALTER TABLE ${t} DISABLE ROW LEVEL SECURITY`);
  }
}

async function herTablodaSatir(): Promise<Record<string, string>> {
  const [p] = await h.q<{ id: string }>(`INSERT INTO pilot_planlari (org_id, client_id, donem, icerik_ozeti) VALUES ($1, $2, '2026-11', $3) RETURNING id::text`, [IDS.org, IDS.client, 'd'.repeat(64)]);
  const [s] = await h.q<{ id: string }>(`INSERT INTO pilot_plan_surumleri (plan_id, org_id, client_id, surum, icerik, icerik_ozeti, kaynak) VALUES ($1, $2, $3, 1, '{}', $4, 'uretici') RETURNING id::text`, [p!.id, IDS.org, IDS.client, 'd'.repeat(64)]);
  const [d] = await h.q<{ id: string }>(`INSERT INTO pilot_uyum_denetimleri (plan_id, org_id, client_id, surum, icerik_ozeti, katalog_surumu, an, bulgular, profil) VALUES ($1, $2, $3, 1, $4, 'k', 'plan', '[]', '{}') RETURNING id::text`, [p!.id, IDS.org, IDS.client, 'd'.repeat(64)]);
  const [i] = await h.q<{ id: string }>(`INSERT INTO pilot_uyum_isaretleri (plan_id, org_id, client_id, surum, kural_kimligi, mesaj, user_id) VALUES ($1, $2, $3, 1, 'GNL-08', 'm', $4) RETURNING id::text`, [p!.id, IDS.org, IDS.client, IDS.user]);
  const [k] = await h.q<{ id: string }>(`INSERT INTO pilot_kurulum_satirlari (plan_id, org_id, client_id, onaylanan_surum, satir_anahtari, platform, ad) VALUES ($1, $2, $3, 1, 'meta:soguk:x', 'meta', 'A') RETURNING id::text`, [p!.id, IDS.org, IDS.client]);
  const [n] = await h.q<{ id: string }>(`INSERT INTO pilot_nesneleri (kurulum_satir_id, org_id, client_id, tur, ad, sira) VALUES ($1, $2, $3, 'kampanya', 'k1', 1) RETURNING id::text`, [k!.id, IDS.org, IDS.client]);
  const [t] = await h.q<{ id: string }>(`INSERT INTO pilot_taramalari (org_id, client_id) VALUES ($1, $2) RETURNING id::text`, [IDS.org, IDS.client]);
  const [o] = await h.q<{ id: string }>(
    `INSERT INTO pilot_onerileri (tarama_id, org_id, client_id, tur, hedef_seviye, hedef_nesne_id, hedef, neden, olculer, beklenen_etki, eylem, geri_alma, gecerlilik_sonu)
     VALUES ($1, $2, $3, 'harcayip_donusmeyen', 'reklam', gen_random_uuid(), '{}', 'n', '[]', '{}', '{}', '{}', now() + interval '1 day') RETURNING id::text`,
    [t!.id, IDS.org, IDS.client],
  );
  return {
    pilot_planlari: p!.id,
    pilot_plan_surumleri: s!.id,
    pilot_uyum_denetimleri: d!.id,
    pilot_uyum_isaretleri: i!.id,
    pilot_kurulum_satirlari: k!.id,
    pilot_nesneleri: n!.id,
    pilot_taramalari: t!.id,
    pilot_onerileri: o!.id,
  };
}

describe('RLS — sekiz tablo', () => {
  it('KRİTİK: kendi workspace’inde bile HİÇBİR pilot satırı panelden SİLİNEMEZ (J-02; 0 satır, satır yerinde)', async () => {
    const id = await herTablodaSatir();
    for (const t of TABLOLAR) {
      // Görünürlük kardeşi: aynı bağlam satırı GÖRÜYOR, yani 0 silme "göremedim" değil "politika yok".
      const g = await rolOlarak({ org: IDS.org, clients: IDS.client }, TABLOLAR, `SELECT id FROM ${t} WHERE id::text = $1`, [id[t]]);
      expect(g, `${t} görünmeli`).toHaveLength(1);
      const r = await rolOlarak({ org: IDS.org, clients: IDS.client }, TABLOLAR, `DELETE FROM ${t} WHERE id::text = $1 RETURNING id`, [id[t]]);
      expect(r, `${t} silinmemeli`).toHaveLength(0);
    }
    for (const t of TABLOLAR) expect(await h.q(`SELECT 1 FROM ${t} WHERE id::text = $1`, [id[t]])).toHaveLength(1);
  });

  it('KRİTİK: BAŞKA org bağlamı aynı client kimliğini taşısa da sekiz tabloda 0 satır görür ve 0 satır günceller (J-04)', async () => {
    const id = await herTablodaSatir();
    await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Başka', 'baska', now())`, [BASKA_ORG]);
    for (const t of TABLOLAR) {
      expect(await rolOlarak({ org: BASKA_ORG, clients: IDS.client, admin: true }, TABLOLAR, `SELECT id FROM ${t}`), t).toHaveLength(0);
      expect(await rolOlarak({ org: BASKA_ORG, clients: IDS.client, admin: true }, TABLOLAR, `UPDATE ${t} SET org_id = org_id WHERE id::text = $1 RETURNING id`, [id[t]]), t).toHaveLength(0);
    }
  });

  it('KRİTİK: worker tablolarına (kurulum, nesne, tarama, öneri) ve denetime başka workspace adına panelden INSERT YOK', async () => {
    const id = await herTablodaSatir();
    const ctx = { org: IDS.org, clients: IDS.client };
    await expect(rolOlarak(ctx, TABLOLAR, `INSERT INTO pilot_nesneleri (kurulum_satir_id, org_id, client_id, tur, ad, sira) VALUES ($1, $2, $3, 'kampanya', 'k2', 2) RETURNING id`, [id.pilot_kurulum_satirlari, IDS.org, IDS.client])).rejects.toThrow(/row-level security/);
    await expect(rolOlarak(ctx, TABLOLAR, `INSERT INTO pilot_taramalari (org_id, client_id) VALUES ($1, $2) RETURNING id`, [IDS.org, IDS.client])).rejects.toThrow(/row-level security/);
    await expect(
      rolOlarak(
        ctx,
        TABLOLAR,
        `INSERT INTO pilot_onerileri (tarama_id, org_id, client_id, tur, hedef_seviye, hedef_nesne_id, hedef, neden, olculer, beklenen_etki, eylem, geri_alma, gecerlilik_sonu)
         VALUES ($1, $2, $3, 'yorulan_kreatif', 'reklam', gen_random_uuid(), '{}', 'n', '[]', '{}', '{}', '{}', now()) RETURNING id`,
        [id.pilot_taramalari, IDS.org, IDS.client],
      ),
    ).rejects.toThrow(/row-level security/);
    // Denetim: kendi workspace'ine yazılır (servis yazıyor), başkasına YAZILAMAZ.
    const [po] = await h.q<{ id: string }>(`INSERT INTO pilot_planlari (org_id, client_id, donem, icerik_ozeti) VALUES ($1, $2, '2026-11', $3) RETURNING id::text`, [IDS.org, OTEKI, 'e'.repeat(64)]);
    await expect(
      rolOlarak(ctx, TABLOLAR, `INSERT INTO pilot_uyum_denetimleri (plan_id, org_id, client_id, surum, icerik_ozeti, katalog_surumu, an, bulgular, profil) VALUES ($1, $2, $3, 1, $4, 'k', 'plan', '[]', '{}') RETURNING id`, [po!.id, IDS.org, OTEKI, 'e'.repeat(64)]),
    ).rejects.toThrow(/row-level security/);
    // Değişmez denetim: UPDATE politikası yok → 0 satır (görünür olduğu halde).
    expect(await rolOlarak(ctx, TABLOLAR, `UPDATE pilot_uyum_denetimleri SET bulgular = '[]' WHERE id::text = $1 RETURNING id`, [id.pilot_uyum_denetimleri])).toHaveLength(0);
  });

  it('KRİTİK: kompozit FK — A’nın client_id’siyle B’nin planına sürüm/işaret/kurulum satırı bağlanamaz', async () => {
    const [pb] = await h.q<{ id: string }>(`INSERT INTO pilot_planlari (org_id, client_id, donem, icerik_ozeti) VALUES ($1, $2, '2026-11', $3) RETURNING id::text`, [IDS.org, OTEKI, 'e'.repeat(64)]);
    await expect(h.q(`INSERT INTO pilot_plan_surumleri (plan_id, org_id, client_id, surum, icerik, icerik_ozeti, kaynak) VALUES ($1, $2, $3, 2, '{}', $4, 'uretici')`, [pb!.id, IDS.org, IDS.client, 'e'.repeat(64)])).rejects.toThrow(/foreign key/);
    await expect(h.q(`INSERT INTO pilot_uyum_isaretleri (plan_id, org_id, client_id, surum, kural_kimligi, mesaj, user_id) VALUES ($1, $2, $3, 1, 'GNL-08', 'm', $4)`, [pb!.id, IDS.org, IDS.client, IDS.user])).rejects.toThrow(/foreign key/);
    await expect(h.q(`INSERT INTO pilot_kurulum_satirlari (plan_id, org_id, client_id, onaylanan_surum, satir_anahtari, platform, ad) VALUES ($1, $2, $3, 1, 'meta:x', 'meta', 'A')`, [pb!.id, IDS.org, IDS.client])).rejects.toThrow(/foreign key/);
  });
});

// ─── 2. Gerçek yayın anahtarı RLS altında (müşteri hesabının bağlamı) ─────────

describe('gerçek yayın anahtarı — müşteri bağlamında RLS altında okunuyor mu', () => {
  const ANAHTAR_TABLOLARI = ['organizations', 'manager_accounts', 'ajans_ayari'] as const;
  beforeEach(async () => {
    await h.q(`INSERT INTO manager_accounts (id, name, slug, updated_at) VALUES ($1, 'MA', 'ma', now())`, [MA]);
    await h.q(`UPDATE organizations SET manager_account_id = $1 WHERE id = $2`, [MA, IDS.org]);
    await h.q(`UPDATE manager_accounts SET ajans_org_id = $2 WHERE id = $1`, [MA, IDS.org]);
    await h.q(`INSERT INTO organizations (id, name, slug, manager_account_id, updated_at) VALUES ($1, 'Müşteri şirketi', 'musteri-org', $2, now())`, [MUSTERI_ORG, MA]);
  });
  /** `gercekYayinAcikMi`yi verilen bağlamda, gerçek politikalarla koşar. */
  async function anahtarOku(ayar: { org: string; manager: string; admin: boolean }) {
    await h.q(`
      SELECT set_config('app.current_org_id', '${ayar.org}', false),
             set_config('app.current_user_id', '${IDS.user}', false),
             set_config('app.current_client_ids', '', false),
             set_config('app.is_org_admin', '${ayar.admin ? 'on' : 'off'}', false),
             set_config('app.current_active_client_id', '', false),
             set_config('app.current_manager_account_id', '${ayar.manager}', false),
             set_config('app.tum_sirketler', 'off', false)`);
    for (const t of ANAHTAR_TABLOLARI) await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
    await h.q(`SET ROLE ${ROL}`);
    try {
      return await gercekYayinAcikMi(h.db, ayar.org);
    } finally {
      await h.q('RESET ROLE');
      for (const t of ANAHTAR_TABLOLARI) await h.q(`ALTER TABLE ${t} DISABLE ROW LEVEL SECURITY`);
    }
  }

  it('KARDEŞ (kurulum doğru): üst hesabı bağlamda olan AJANS personeli müşteri şirketinde anahtarı AÇIK okur', async () => {
    expect(await anahtarOku({ org: MUSTERI_ORG, manager: MA, admin: true })).toEqual({ acik: true, okunamadi: null });
  });

  // BULGU B-1 (Ajan 2): müşteri hesabının (client_viewer) bağlamında
  // `current_manager_account_id` BOŞ (üst hesap üyeliği yok). manager_accounts
  // politikası satırı gizliyor → `ajansOrgu` null → anahtar "kapalı" ve
  // `ajansinKendiSirketi` false → MÜŞTERİNİN ONAYI HER ZAMAN `kapali` KİPİ.
  // Anahtar açıkken bile müşteri onayı platforma hiçbir şey yazmıyor; plan
  // `kismen_kuruldu`ya düşüyor ve ajans "Şimdi kur"a basmak zorunda (3 değil
  // 4 tıklama, Ç-6 "müşteri onayı yeter" kararı fiilen çalışmıyor). Güvenli
  // yöne düşüyor (para harcamıyor) ama sessiz: testler RLS kapalı koştuğu
  // için plan.service.spec müşteri onayında `gercek` görüyor.
  it.fails('BULGU B-1: müşteri hesabı bağlamında da ajansın AÇIK anahtarı açık okunmalı', async () => {
    expect(await anahtarOku({ org: MUSTERI_ORG, manager: '', admin: false })).toEqual({ acik: true, okunamadi: null });
  });
});

// ─── 3. IDOR: her servis ucu başka workspace bağlamıyla ─────────────────────

describe('IDOR — başka workspace’in kişisi hiçbir uçtan dokunamaz (J-05)', () => {
  it('KRİTİK: plan uçlarının hepsi reddediyor ve plan, sürüm, kuyruk DOKUNULMADAN kalıyor', async () => {
    const { id } = await hazirla();
    const [once] = await planSatiri(id);
    const sur = { surum: 1 };
    const denemeler: Array<[string, () => Promise<unknown>]> = [
      ['listele', () => plan.listele(YABANCI_AJANS, IDS.client)],
      ['hazirla', () => plan.hazirla(YABANCI_AJANS, { clientId: IDS.client, donem: '2026-12' }, SIMDI)],
      ['detay', () => plan.detay(YABANCI_AJANS, id, SIMDI)],
      ['yenidenHazirla', () => plan.yenidenHazirla(YABANCI_AJANS, id, { ...sur, onay: true }, SIMDI)],
      ['degistir', () => plan.degistir(YABANCI_AJANS, id, { ...sur, degisiklikler: [{ tur: 'satir_cikar', anahtar: 'x' }] }, SIMDI)],
      ['uyumIsaret', () => plan.uyumIsaret(YABANCI_AJANS, id, { ...sur, kuralKimligi: 'GNL-08', mesaj: 'm' }, SIMDI)],
      ['eylem', () => plan.eylem(YABANCI_AJANS, id, { eylem: 'musteriye_gonder', ...sur }, SIMDI)],
      ['eylem iptal', () => plan.eylem(YABANCI_AJANS, id, { eylem: 'iptal', ...sur }, SIMDI)],
      ['degisiklikIste', () => plan.degisiklikIste(YABANCI_MUSTERI, id, { ...sur, not: 'n' }, SIMDI)],
      ['onayla', () => plan.onayla(YABANCI_MUSTERI, id, { ...sur, icerikOzeti: 'a'.repeat(64) }, SIMDI)],
      ['onayla ajans', () => plan.onayla(YABANCI_AJANS, id, { ...sur, icerikOzeti: 'a'.repeat(64), musteriAdinaGerekce: 'x'.repeat(30) }, SIMDI)],
      ['kurulum', () => plan.kurulum(YABANCI_AJANS, id)],
      ['pdf', () => plan.pdf(YABANCI_AJANS, id)],
      ['bugun', () => pilot.bugun(YABANCI_AJANS, IDS.client, SIMDI)],
      ['oneriler', () => pilot.oneriler(YABANCI_AJANS, IDS.client, null)],
      ['beyan oku', () => beyan.oku(YABANCI_AJANS, IDS.client)],
      ['beyan yaz', () => beyan.yaz(YABANCI_AJANS, { clientId: IDS.client, ozelKategoriler: ['HOUSING'], sektor: 'Konut' }, { ip: null, userAgent: null })],
    ];
    for (const [ad, f] of denemeler) {
      await expect(f(), ad).rejects.toBeInstanceOf(HttpException);
      await expect(f(), ad).rejects.toThrow(/bulunamadı|erişimin yok/);
    }
    const [sonra] = await planSatiri(id);
    expect(sonra).toEqual(once);
    expect(await h.q('SELECT 1 FROM pilot_plan_surumleri WHERE plan_id = $1', [id])).toHaveLength(1);
    expect(await h.q(`SELECT 1 FROM pilot_planlari WHERE client_id = $1 AND donem = '2026-12'`, [IDS.client])).toHaveLength(0);
    expect(kuyruk.planEkle).not.toHaveBeenCalled();
    const [c] = await h.q<{ k: string[] }>('SELECT special_ad_categories AS k FROM clients WHERE id = $1', [IDS.client]);
    expect(c!.k ?? []).toEqual([]);
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('KRİTİK: öneri "geç" başka workspace’in kartında 404, kart değişmeden', async () => {
    const [t] = await h.q<{ id: string }>(`INSERT INTO pilot_taramalari (org_id, client_id) VALUES ($1, $2) RETURNING id::text`, [IDS.org, IDS.client]);
    const [o] = await h.q<{ id: string }>(
      `INSERT INTO pilot_onerileri (tarama_id, org_id, client_id, tur, hedef_seviye, hedef_nesne_id, hedef, neden, olculer, beklenen_etki, eylem, geri_alma, gecerlilik_sonu)
       VALUES ($1, $2, $3, 'harcayip_donusmeyen', 'reklam', gen_random_uuid(), '{}', 'n', '[]', '{}', '{}', '{}', now() + interval '1 day') RETURNING id::text`,
      [t!.id, IDS.org, IDS.client],
    );
    await expect(pilot.gec(YABANCI_AJANS, o!.id)).rejects.toThrow(/bulunamadı/);
    await expect(pilot.gec(MUSTERI, o!.id)).rejects.toThrow(/ajans hesabından/);
    const [r] = await h.q<{ durum: string }>('SELECT durum FROM pilot_onerileri WHERE id = $1', [o!.id]);
    expect(r!.durum).toBe('yeni');
    // Kardeş: doğru bağlam geçebiliyor (ret yanlış sebepten değil).
    expect((await pilot.gec(AJANS, o!.id)).durum).toBe('gecildi');
  });
});

// ─── 4. Rol ve onay kapısı ──────────────────────────────────────────────────

describe('rol: müşteri plan yazamaz, onay yalnız musteride', () => {
  it('KRİTİK: müşteri hesabı hiçbir yazma ucunu geçemez; plan dokunulmadan', async () => {
    const { id } = await hazirla();
    const [once] = await planSatiri(id);
    for (const f of [
      () => plan.yenidenHazirla(MUSTERI, id, { surum: 1, onay: true }, SIMDI),
      () => plan.degistir(MUSTERI, id, { surum: 1, degisiklikler: [{ tur: 'satir_cikar', anahtar: 'x' }] }, SIMDI),
      () => plan.uyumIsaret(MUSTERI, id, { surum: 1, kuralKimligi: 'GNL-08', mesaj: 'm' }, SIMDI),
      () => plan.eylem(MUSTERI, id, { eylem: 'musteriye_gonder', surum: 1 }, SIMDI),
      () => plan.eylem(MUSTERI, id, { eylem: 'iptal', surum: 1 }, SIMDI),
      () => beyan.yaz(MUSTERI, { clientId: IDS.client, ozelKategoriler: [], sektor: 'Kahve' }, { ip: null, userAgent: null }),
    ]) {
      await expect(f()).rejects.toThrow(/ajans/);
    }
    expect((await planSatiri(id))[0]).toEqual(once);
  });

  it('KRİTİK: taslaktaki planı müşteri ONAYLAYAMAZ (DURUM), doğru özetle bile', async () => {
    const { id } = await hazirla();
    const oz = (await plan.detay(MUSTERI, id, SIMDI)).plan.icerikOzeti;
    expect(await retKodlari(plan.onayla(MUSTERI, id, { surum: 1, icerikOzeti: oz }, SIMDI))).toContain('DURUM');
    expect((await planSatiri(id))[0]!.durum).toBe('taslak');
    expect(kuyruk.planEkle).not.toHaveBeenCalled();
  });

  it('KRİTİK: gerekçe KIRPILARAK sayılır — boşlukla şişirilmiş 19 karakter reddedilir; CHECK de aynı kuralı tutar', async () => {
    const { id, oz } = await musteride();
    const sisik = `  ${'a'.repeat(19)}${' '.repeat(30)}`;
    expect(await retKodlari(plan.onayla(AJANS, id, { surum: 1, icerikOzeti: oz, musteriAdinaGerekce: sisik }, SIMDI))).toEqual(['GEREKCE']);
    expect((await planSatiri(id))[0]!.durum).toBe('musteride');
    // Servisi atlayan bir yazım (worker/BYPASSRLS) da kırpılmış uzunluğa takılır.
    await expect(
      h.q(
        `UPDATE pilot_planlari SET durum='onaylandi', onay_rolu='ajans', onay_zamani=now(), onaylanan_surum=1, onaylanan_ozet=$2, yayin_kipi='test', musteri_adina_gerekce=$3 WHERE id=$1`,
        [id, oz, sisik],
      ),
    ).rejects.toThrow(/pilot_planlari_gerekce_chk/);
  });

  it('KRİTİK: onaydan SONRA plan değiştirilemez, geri çekilemez; onay izi trigger’la değişmez', async () => {
    const { id, oz } = await musteride();
    await plan.onayla(MUSTERI, id, { surum: 1, icerikOzeti: oz }, SIMDI);
    const anahtar = (await plan.detay(AJANS, id, SIMDI)).icerik.satirlar[0]!.anahtar;
    await expect(plan.degistir(AJANS, id, { surum: 1, degisiklikler: [{ tur: 'satir_cikar', anahtar }] }, SIMDI)).rejects.toThrow(/düzenlenemez/);
    await expect(plan.eylem(AJANS, id, { eylem: 'geri_cek', surum: 1 }, SIMDI)).rejects.toThrow(/uygun değil/);
    await expect(h.q(`UPDATE pilot_planlari SET onaylanan_ozet = $2 WHERE id = $1`, [id, 'f'.repeat(64)])).rejects.toThrow(/onay izi degismez/);
    await expect(h.q(`UPDATE pilot_planlari SET yayin_kipi = 'test' WHERE id = $1`, [id])).rejects.toThrow(/yalniz gercege/);
  });

  it('KRİTİK: "Şimdi kur" onaylanan özet güncel özetle ayrışmışsa REDDEDER ve kuyruğa girmez (S-6)', async () => {
    const { id, oz } = await musteride();
    await plan.onayla(MUSTERI, id, { surum: 1, icerikOzeti: oz }, SIMDI);
    kuyruk.planEkle.mockClear();
    await h.q(`UPDATE pilot_planlari SET durum = 'kismen_kuruldu', icerik_ozeti = $2 WHERE id = $1`, [id, 'f'.repeat(64)]);
    await expect(plan.eylem(AJANS, id, { eylem: 'yeniden_dene', surum: 1 }, SIMDI)).rejects.toThrow(/yeniden onay/);
    expect(kuyruk.planEkle).not.toHaveBeenCalled();
    expect((await planSatiri(id))[0]!.durum).toBe('kismen_kuruldu');
  });

  it('KRİTİK: gönderildikten sonra Aylık Bütçe düşürülürse ya da silinirse onay REDDEDİLİR (taze okuma)', async () => {
    const { id, oz } = await musteride();
    await h.q(`UPDATE monthly_budgets SET amount_micros = 1000000 WHERE client_id = $1`, [IDS.client]);
    expect(await retKodlari(plan.onayla(MUSTERI, id, { surum: 1, icerikOzeti: oz }, SIMDI))).toContain('BUTCE_ASIMI');
    await h.q(`DELETE FROM monthly_budgets WHERE client_id = $1`, [IDS.client]);
    expect(await retKodlari(plan.onayla(MUSTERI, id, { surum: 1, icerikOzeti: oz }, SIMDI))).toContain('BUTCE_YOK');
    expect((await planSatiri(id))[0]!.durum).toBe('musteride');
    expect(kuyruk.planEkle).not.toHaveBeenCalled();
  });

  it('KARDEŞ: müşteri görünümünde uyum ayrıntısı alanı boş (servis süzüyor)', async () => {
    const { id } = await musteride();
    expect((await plan.detay(MUSTERI, id, SIMDI)).uyum).toBeNull();
  });

  // BULGU B-2 (Ajan 2): `detayKur` `onayKapisi`ni rolden bağımsız döndürüyor.
  // Müşteri yanıtında `ajansNotu` (ör. "Pilot gerçek yayın anahtarı kapalı:
  // ... platforma hiçbir şey yazılmadı") ve retlerde `ajansMesaji` duruyor;
  // `plan.yayinKipi` da müşteriye gidiyor. Panel çizmiyor (pilot-ekrani.spec
  // "uyum ve yayın kipi notu müşteriye çizilmiyor") ama API yanıtı Ç-6 ve
  // onay.ts'in "müşteriye SÖYLEMEZ" sözünü tutmuyor.
  it.fails('BULGU B-2: müşteri yanıtında ajans notu / yayın kipi / anahtar cümlesi YOK', async () => {
    await h.q(`UPDATE ajans_ayari SET pilot_gercek_yayin = false`);
    const { id } = await musteride();
    const d = await plan.detay(MUSTERI, id, SIMDI);
    // Kardeş koşul: kurulum doğru, plan gerçekten anahtar kapalıyken onaylanabilir.
    expect(d.yapilabilir).toContain('onayla');
    expect(JSON.stringify(d)).not.toMatch(/anahtarı kapalı|test kipinde|platforma hiçbir şey|Uyum denetçisinde/);
    expect(d.onayKapisi?.tur === 'kabul' ? d.onayKapisi.ajansNotu : null).toBeNull();
  });
});

// ─── 5. Para ────────────────────────────────────────────────────────────────

const toplamSatir = (p: PlanOnerisi) => p.satirlar.reduce((a, s) => a + BigInt(s.tutar.deger), 0n);

describe('para zinciri', () => {
  it('KRİTİK: satır toplamı + dağıtılmamış = plan toplamı = ayın harcanmamış kalanı; Meta dönem toplamı (lifetime) ve tutarın kendisi', () => {
    const g = planGirdisi({ ayHarcanan: { deger: 20_000n * M, kaynak: { tur: 'gecmis_veri', kimlik: 'insights_daily', zaman: T } }, donem: '2026-10' });
    const p = planUret(g);
    expect(p.toplam.dolu).toBe(true);
    const toplam = BigInt(p.toplam.dolu ? p.toplam.deger : '0');
    expect(toplam).toBe(100_000n * M);
    expect(toplamSatir(p) + BigInt(p.dagitilmamis.micros)).toBe(toplam);
    for (const s of p.satirlar.filter((x) => x.platform === 'meta')) {
      expect(s.butce.deger.tip).toBe('toplam');
      expect(s.butce.deger.micros).toBe(s.tutar.deger);
      // Tam para birimi (M-4): Meta'ya giden tutar kırpılmadan minor'a iner.
      expect(BigInt(s.tutar.deger) % M).toBe(0n);
    }
  });

  it('KRİTİK: karışık para birimi, bilinmeyen harcanan ve biten bütçe TOPLAM ÜRETMEZ (boş + neden, satır yok)', () => {
    const k = planUret(planGirdisi({ hesaplar: [{ id: 'a', platform: 'meta', paraBirimi: 'TRY' }, { id: 'b', platform: 'google', paraBirimi: 'USD' }] }));
    expect(k.toplam).toEqual({ dolu: false, emptyReason: 'karisik_birim' });
    expect(k.satirlar).toHaveLength(0);
    const b = planUret(planGirdisi({ ayHarcanan: null }));
    expect(b.toplam).toEqual({ dolu: false, emptyReason: 'harcanan_bilinmiyor' });
    expect(b.satirlar).toHaveLength(0);
    const s = planUret(planGirdisi({ ayHarcanan: { deger: 130_000n * M, kaynak: { tur: 'gecmis_veri', kimlik: 'x', zaman: T } } }));
    expect(s.toplam).toEqual({ dolu: false, emptyReason: 'ay_butcesi_bitti' });
  });

  it('KRİTİK: değişiklik plan toplamını AŞAMAZ; 19 haneli tutar şemada reddedilir (A-13, BIGINT taşması yerine 400)', () => {
    const p = planUret(planGirdisi());
    const kim = { tur: 'kullanici' as const, kimlik: 'u', zaman: T };
    const a = p.satirlar[0]!.anahtar;
    expect(degisiklikUygula(p, [{ tur: 'satir_tutari_fark', anahtar: a, farkMicros: (1n * M).toString(), yon: 'artir' }], kim).tur).toBe('ret');
    expect(planDegistirSchema.safeParse({ surum: 1, degisiklikler: [{ tur: 'satir_tutari', anahtar: a, tutarMicros: '9'.repeat(19) }] }).success).toBe(false);
  });

  it('KARDEŞ: satır toplamı bütçeyi aşmayan plan BUTCE_ASIMI almaz', () => {
    const p = planUret(planGirdisi());
    const r = onayKapisi({ durum: 'musteride', surum: 1, icerikOzeti: 'a', istek: { surum: 1, icerikOzeti: 'a' }, rol: 'musteri', plan: p, aylikButceMicros: 120_000n * M, uyum: 'gecti', ajansinKendiSirketi: false, gercekYayinAcik: true });
    expect(r.tur).toBe('kabul');
  });

  // BULGU B-3 (Ajan 1): `onayKapisi` bütçeyi BEYAN EDİLEN `plan.toplam` ile
  // karşılaştırıyor; harcanacak olan SATIRLARIN toplamı. Bugün yalnız
  // `degisiklikUygula` "satırlar ≤ toplam"ı tutuyor ve saklanan sürüm
  // şeması bunu doğrulamıyor. Toplamı tutarlı, satırları şişmiş bir sürüm
  // (elle yazım, ileride ikinci bir yazıcı) PARA HARCAYAN kapıdan geçer.
  it.fails('BULGU B-3: satır toplamı Aylık Bütçe’yi aşan plan, beyan edilen toplam küçük olsa da BUTCE_ASIMI', () => {
    const p = planUret(planGirdisi());
    const sisik: PlanOnerisi = { ...p, satirlar: p.satirlar.map((s, i) => (i === 0 ? { ...s, tutar: { ...s.tutar, deger: (BigInt(s.tutar.deger) + 500_000n * M).toString() } } : s)) };
    expect(toplamSatir(sisik)).toBeGreaterThan(120_000n * M);
    const r = onayKapisi({ durum: 'musteride', surum: 1, icerikOzeti: 'a', istek: { surum: 1, icerikOzeti: 'a' }, rol: 'musteri', plan: sisik, aylikButceMicros: 120_000n * M, uyum: 'gecti', ajansinKendiSirketi: false, gercekYayinAcik: true });
    expect(r.tur === 'ret' && r.retler.map((x) => x.kod)).toContain('BUTCE_ASIMI');
  });
});

// ─── 6. Kurulum: ara durumda takılan satır ──────────────────────────────────

describe('kurulum işçisi — ara durumda takılan satır', () => {
  async function kuruluyorPlan(satirDurumu: string): Promise<string> {
    const { id, oz } = await musteride();
    await plan.onayla(MUSTERI, id, { surum: 1, icerikOzeti: oz }, SIMDI);
    await h.q(`UPDATE pilot_planlari SET durum = 'kuruluyor', updated_at = now() - interval '2 hours' WHERE id = $1`, [id]);
    await h.q(
      `INSERT INTO pilot_kurulum_satirlari (plan_id, org_id, client_id, onaylanan_surum, satir_anahtari, platform, ad, durum, updated_at)
       VALUES ($1, $2, $3, 1, 'meta:soguk:x', 'meta', 'A', $4, now() - interval '2 hours')`,
      [id, IDS.org, IDS.client, satirDurumu],
    );
    return id;
  }
  const supur = async () => {
    const ekle = vi.fn(async () => undefined);
    const n = await pilotSupurmesi({ tx: (fn) => fn(h.db as never), planEkle: ekle }, new Date());
    return n;
  };

  it('KARDEŞ: işçi taslakta öldüyse süpürme planı yeniden kuyruğa alıyor', async () => {
    await kuruluyorPlan('taslak');
    expect(await supur()).toBe(1);
  });

  // BULGU B-4 (Ajan 2): satır işi `prova`/`kuruluyor`/`geri_okundu_ayni`/
  // `aciliyor`dayken beklenmeyen bir hatayla düşerse (attempts: 1; `gecis`
  // iyimser kilidi, DB hatası, ya da BullMQ stalled sınırı) `failed`
  // dinleyicisi YALNIZ `taslak`ı kapatıyor, süpürme YALNIZ `taslak`a
  // bakıyor ve ajansın `kuruluyor`dan çıkışı yok (`iptal`/`kapat` kaynak
  // listesinde değil). Plan kalıcı `kuruluyor`, kısmi tekil indeks o ayı
  // KİLİTLİYOR (yeni plan açılamaz) ve ekran "Kampanyalar kuruluyor" diyor.
  // CLAUDE.md "kısmi tekil indeks + son durumu olmayan durum makinesi".
  it.fails('BULGU B-4: ara durumda takılmış satırın bir ÇIKIŞI var (süpürme ya da ajans eylemi)', async () => {
    const id = await kuruluyorPlan('prova');
    const supurmeAldi = (await supur()) > 0;
    const ajansCikabilir = pilotGecisMumkunMu('kuruluyor', 'kapat', 'ajans') || pilotGecisMumkunMu('kuruluyor', 'iptal', 'ajans');
    expect(supurmeAldi || ajansCikabilir).toBe(true);
    void id;
  });
});

// ─── 7. Kaynak taramaları ───────────────────────────────────────────────────

function yorumsuz(ad: string): string {
  return readFileSync(join(__dirname, ad), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('kaynak taramaları', () => {
  it('KRİTİK: hiçbir pilot ucu müşterinin özel kategori/anahtar YAZMASINA izin veren izni taşımıyor', async () => {
    const { PILOT_UCLARI } = await import('@advetics/shared');
    const musteri = new Set(resolvePermissions('client_viewer'));
    const yazabildigi = PILOT_UCLARI.filter((u) => u.yontem !== 'GET' && musteri.has(u.izin)).map((u) => u.yol).sort();
    // Müşterinin geçebildiği yazma uçları YALNIZ bu ikisi; serviste rol ikinci kapı.
    expect(yazabildigi).toEqual(['/pilot/planlar/:id/degisiklik-iste', '/pilot/planlar/:id/onayla']);
  });

  it('KRİTİK: anahtar uçları — okuma müşteride yok, yazma yalnız org.write; servis isOrgAdmin + ajans şirketi', () => {
    const k = yorumsuz('gercek-yayin.ts');
    const d = k.slice(k.indexOf('async degistir('));
    expect(d.slice(0, 400)).toContain('if (!ctx.isOrgAdmin)');
    expect(d).toContain('if (ajans !== ctx.orgId)');
    expect(new Set(resolvePermissions('client_viewer')).has('strategy.write')).toBe(false);
    expect(new Set(resolvePermissions('ad_manager')).has('org.write')).toBe(false);
  });

  it('KRİTİK: model çağrısı olan her yolun çıktısı sayı doğrulamasından geçiyor (gerekçe, değiştir, reklam metni)', () => {
    const m = yorumsuz('plan-metni.ts');
    expect(m.slice(m.indexOf('export async function gerekceEkle'))).toMatch(/yzMetniEkle\(/);
    const s = yorumsuz('plan.service.ts');
    const deg = s.slice(s.indexOf('async degistir('), s.indexOf('async uyumIsaret('));
    expect(deg).toContain('degisiklikCumleyleUyumluMu(g.cumle, degisiklikler)');
    expect(deg).toContain('degisiklikUygula(');
    const t = yorumsuz('taslak-baglami.ts');
    expect(t.slice(t.indexOf('export async function reklamMetniYaz'))).toContain('yzMetniDenetle(');
  });

  it('KRİTİK: yapay zekâ girdisi anahtarı ya da beyanı yazamaz — model çağıran dosyalar bu servisleri içe aktarmıyor', () => {
    for (const f of ['plan-metni.ts', 'taslak-baglami.ts']) {
      const k = yorumsuz(f);
      expect(k, f).not.toMatch(/gercek-yayin|beyan\.service|ajans_ayari|special_ad_categories\s*=/);
    }
  });

  // BULGU B-5 (Ajan 2, düşük): işçinin `derle` adımı kitle şablonunu
  // `client_id` süzgeci OLMADAN okuyor (worker BYPASSRLS); aynı dosyanın
  // `kitleBilgisi`si süzüyor. Kimlik plandan geliyor ve planı ajans yazıyor;
  // bugün sızıntı yolu yok ama "aynı süzgeci iki yerde yazma" dersi.
  it.fails('BULGU B-5: işçideki her audience_templates sorgusu client_id ile süzülüyor', () => {
    const k = yorumsuz('kurulum-isleyici.ts');
    const sorgular = k.split('FROM audience_templates').slice(1).map((x) => x.slice(0, 120));
    expect(sorgular.length).toBeGreaterThan(1);
    for (const q of sorgular) expect(q).toContain('client_id');
  });
});
