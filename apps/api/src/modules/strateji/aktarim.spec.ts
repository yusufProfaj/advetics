import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { aktarimIstemi, resolvePermissions, type TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AppConfig } from '../../config/configuration';
import { StratejiService } from './strateji.service';
import type { StratejiKelimeKuyrugu } from './kelime-kuyrugu';

/**
 * AKTARIM — onaylı plan → AdvCampaign oturumları (MIMARI § 6.1). Gerçek şema
 * (PGlite); oturumlar `adv_oturum`a gerçekten yazılıyor.
 *
 * AdvCampaign SOHBET servisi 2026-10-10'da API'den kaldırıldı: bu oturumları
 * okuyan uç artık YOK ve onu sınayan test silindi. Aktarımın rehbere
 * (reklam_rehberi) taşınması açık iş (docs/advcampaign/devir/ajan2.md).
 */
let h: Harness;
let svc: StratejiService;

const KARDES_ORG = 'cccccccc-0000-4000-8000-00000000000c';
const KARDES_WS = 'cccccccc-0000-4000-8000-0000000000c1';
const KITLE = '77777777-0000-4000-8000-000000000001';
const KARDES_KITLE = '77777777-0000-4000-8000-0000000000c1';
const V1 = '88888888-0000-4000-8000-000000000001';
const V2 = '88888888-0000-4000-8000-000000000002';

const AJANS = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client, KARDES_WS],
  activeClientId: IDS.client,
  isOrgAdmin: true,
  tumSirketler: false,
  role: 'admin',
  permissions: [...resolvePermissions('admin')],
} as unknown as TenantContext;

const CONFIG = {
  yapayZeka: { model: 'gemini-test' },
  uploads: { dir: '/tmp' },
  platforms: { meta: { apiVersion: 'v25.0' } },
} as unknown as AppConfig;

beforeAll(async () => {
  h = await createHarness();
  const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
  svc = new StratejiService(prisma, { ekle: async () => undefined } as unknown as StratejiKelimeKuyrugu, CONFIG);
}, 60_000);
afterAll(async () => h?.close());
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Kardeş', 'kardes', now())`, [KARDES_ORG]);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Kardeş WS', 'kardes-ws', now())`, [KARDES_WS, KARDES_ORG]);
  await h.q(
    `INSERT INTO audience_templates (id, org_id, client_id, name, updated_at)
     VALUES ($1, $3, $4, 'İzmir kadın 25-44', now()), ($2, $5, $6, 'Kardeş kitlesi', now())`,
    [KITLE, KARDES_KITLE, IDS.org, IDS.client, KARDES_ORG, KARDES_WS],
  );
  await h.q(
    `INSERT INTO assets (id, org_id, client_id, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $3, $4, 'Kare', 'a.jpg', 'image/jpeg', 1, 1080, 1080, 'k/a', 'aaaaaaaaaaaaaaaa1', now()),
            ($2, $3, $4, 'Dikey', 'b.jpg', 'image/jpeg', 1, 1080, 1920, 'k/b', 'aaaaaaaaaaaaaaaa2', now())`,
    [V1, V2, IDS.org, IDS.client],
  );
});

type MatrisGirdisi = Parameters<StratejiService['matrisKaydet']>[2]['satirlar'][number];
const satir = (o: Partial<MatrisGirdisi> = {}): MatrisGirdisi => ({
  platform: 'meta',
  katman: 'soguk',
  niyet: 'FORM',
  kitleSablonuId: KITLE,
  kelimeGrubu: null,
  varlikIdleri: [V1, V2],
  tutar: '10.000',
  ...o,
});

/** Onaylanmış plan: dağılım + verilen matris satırları, onaya gönderilmiş ve onaylanmış. */
async function onayliPlan(satirlar: MatrisGirdisi[], ctx = AJANS, clientId: string = IDS.client) {
  const d = await svc.olustur(ctx, { clientId, donem: '2026-11', toplamButce: '100.000', paraBirimi: 'TRY' });
  await svc.dagilimKaydet(ctx, d.plan.id, {
    surum: 1,
    satirlar: [
      { platform: 'meta', katman: 'soguk', tutar: '50.000' },
      { platform: 'google', katman: 'soguk', tutar: '20.000' },
    ],
  });
  await svc.matrisKaydet(ctx, d.plan.id, { surum: 2, satirlar });
  await svc.eylem(ctx, d.plan.id, { eylem: 'onaya_gonder', surum: 3 });
  await svc.onayla(ctx, d.plan.id, 3);
  return d.plan.id;
}

const oturumlar = () =>
  h.q<{ id: string; org_id: string; client_id: string; user_id: string; baslik: string; hazir_istem: string; hazir_medyalar: string[]; strateji_matris_id: string; model: string }>(
    `SELECT id::text, org_id::text, client_id::text, user_id::text, baslik, hazir_istem, hazir_medyalar::text[] AS hazir_medyalar,
            strateji_matris_id::text, model
       FROM adv_oturum ORDER BY baslik`,
  );

describe('aktarım', () => {
  it('KRİTİK: aktarılabilir satır oturum açar, diğerleri NEDENİYLE atlanır; plan aktarildi', async () => {
    const id = await onayliPlan([
      satir(),
      satir({ platform: 'google', niyet: 'SITE', kitleSablonuId: null, varlikIdleri: [], tutar: '5.000' }),
      satir({ niyet: 'WHATSAPP', tutar: '1.000' }),
      satir({ niyet: 'SITE', tutar: '0' }),
    ]);
    const d = await svc.eylem(AJANS, id, { eylem: 'aktar', surum: 3 });
    expect(d.plan.durum).toBe('aktarildi');
    const matris = d.matris.map((m) => m.id);
    expect(d.plan.aktarim!.aktarilan).toHaveLength(1);
    expect(d.plan.aktarim!.aktarilan[0]!.matrisSatiriId).toBe(matris[0]);
    expect(d.plan.aktarim!.atlanan).toEqual([
      { matrisSatiriId: matris[1], neden: 'platform_kapali' },
      { matrisSatiriId: matris[2], neden: 'niyet_desteklenmiyor' },
      { matrisSatiriId: matris[3], neden: 'butce_sifir' },
    ]);
    expect(d.yapilabilir).toEqual([]);

    const [o] = await oturumlar();
    expect(o).toMatchObject({
      id: d.plan.aktarim!.aktarilan[0]!.oturumId,
      org_id: IDS.org,
      client_id: IDS.client,
      user_id: IDS.user,
      baslik: 'Form doldursunlar · İzmir kadın 25-44',
      hazir_medyalar: [V1, V2],
      strateji_matris_id: matris[0],
      model: 'gemini-test',
    });
    // Hazır metin sözleşmenin üreticisinden; ikinci bir metin kurucusu yok.
    expect(o!.hazir_istem).toBe(
      aktarimIstemi({
        platform: 'meta', katman: 'soguk', niyet: 'FORM', kitleAdi: 'İzmir kadın 25-44', varlikIdleri: [V1, V2],
        planlananVarlikSayisi: 2, tutarMicros: 10_000_000_000n, paraBirimi: 'TRY', donem: '2026-11', not: null,
      }),
    );
    // Mesaj YAZILMADI: hazır metin yalnız giriş kutusunun önerisi.
    const [n] = await h.q<{ n: number }>('SELECT count(*)::int AS n FROM adv_mesaj');
    expect(n!.n).toBe(0);
  });

  it('KRİTİK: hiçbir satır aktarılamazsa plan onaylandi KALIR ve 400 nedenleri sayar', async () => {
    const id = await onayliPlan([
      satir({ platform: 'google', niyet: 'SITE', kitleSablonuId: null, varlikIdleri: [] }),
      satir({ platform: 'google', niyet: 'SITE', kitleSablonuId: null, varlikIdleri: [], tutar: '1' }),
      satir({ niyet: 'WHATSAPP' }),
    ]);
    await expect(svc.eylem(AJANS, id, { eylem: 'aktar', surum: 3 })).rejects.toThrow(
      /Aktarılabilecek satır yok: 2 satırın platformu.*, 1 satırın amacı/,
    );
    expect((await svc.detay(AJANS, id)).plan.durum).toBe('onaylandi');
    expect(await oturumlar()).toHaveLength(0);
  });

  it('KRİTİK: tekrar denemede açılmış oturum YENİDEN AÇILMAZ (yarıda düşen aktarım)', async () => {
    const id = await onayliPlan([satir(), satir({ varlikIdleri: [V1], tutar: '5.000' })]);
    const d = await svc.detay(AJANS, id);
    // Önceki deneme ilk satırın oturumunu açıp düşmüş.
    const [onceki] = await h.q<{ id: string }>(
      `INSERT INTO adv_oturum (org_id, client_id, user_id, baslik, model, strateji_matris_id)
       VALUES ($1, $2, $3, 'önceki', 'm', $4) RETURNING id::text`,
      [IDS.org, IDS.client, IDS.user, d.matris[0]!.id],
    );
    const a = await svc.eylem(AJANS, id, { eylem: 'aktar', surum: 3 });
    expect(a.plan.aktarim!.aktarilan.map((x) => x.oturumId)).toContain(onceki!.id);
    expect(await oturumlar()).toHaveLength(2);
    // Tekil indeks son kapı: aynı satıra ikinci oturum veritabanında da yazılamaz.
    await expect(
      h.q(`INSERT INTO adv_oturum (org_id, client_id, user_id, baslik, model, strateji_matris_id) VALUES ($1, $2, $3, 'x', 'm', $4)`, [
        IDS.org, IDS.client, IDS.user, d.matris[0]!.id,
      ]),
    ).rejects.toThrow(/adv_oturum_strateji_matris_key/);
  });

  it('KRİTİK: silinmiş kitle ya da görsel satırı sessizce eksiltmez, kaynak_silinmis ile atlar', async () => {
    const id = await onayliPlan([satir(), satir({ varlikIdleri: [V1], tutar: '5.000' })]);
    await h.q('DELETE FROM assets WHERE id = $1', [V2]);
    const a = await svc.eylem(AJANS, id, { eylem: 'aktar', surum: 3 });
    expect(a.plan.aktarim!.atlanan).toEqual([{ matrisSatiriId: a.matris[0]!.id, neden: 'kaynak_silinmis' }]);
    expect(a.plan.aktarim!.aktarilan).toHaveLength(1);
  });

  it('KRİTİK: reklam kurma izni (bulk.write) yoksa 403 ve hiçbir oturum açılmaz', async () => {
    const id = await onayliPlan([satir()]);
    const yalnizPlan = { ...AJANS, permissions: AJANS.permissions.filter((i) => i !== 'bulk.write') } as TenantContext;
    await expect(svc.eylem(yalnizPlan, id, { eylem: 'aktar', surum: 3 })).rejects.toMatchObject({ status: 403 });
    expect(await oturumlar()).toHaveLength(0);
  });

  it('KRİTİK: onaylanan sürüm planın sürümü değilse aktarım 409 (onaylanmamış belge gitmez)', async () => {
    const id = await onayliPlan([satir()]);
    await h.q('UPDATE strateji_planlari SET onaylanan_surum = 2 WHERE id = $1', [id]);
    await expect(svc.eylem(AJANS, id, { eylem: 'aktar', surum: 3 })).rejects.toThrow(/yeniden onaylanmalı/);
    expect(await oturumlar()).toHaveLength(0);
  });

  it('bayat sürümle aktarım 409', async () => {
    const id = await onayliPlan([satir()]);
    await expect(svc.eylem(AJANS, id, { eylem: 'aktar', surum: 2 })).rejects.toMatchObject({ status: 409 });
    expect(await oturumlar()).toHaveLength(0);
  });

  it('KRİTİK: "tüm şirketler" modunda oturum org_id’si HEDEF workspace’ten (ctx.orgId değil)', async () => {
    const tum = { ...AJANS, activeClientId: null, tumSirketler: true } as unknown as TenantContext;
    const id = await onayliPlan([satir({ kitleSablonuId: KARDES_KITLE, varlikIdleri: [] })], tum, KARDES_WS);
    await svc.eylem(tum, id, { eylem: 'aktar', surum: 3 });
    const [o] = await oturumlar();
    expect(o).toMatchObject({ org_id: KARDES_ORG, client_id: KARDES_WS });
  });
});
