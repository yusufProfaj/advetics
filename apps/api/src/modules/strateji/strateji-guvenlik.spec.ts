import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import 'reflect-metadata';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { resolvePermissions, type Permission, type TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../../common/decorators';
import { assertPermissions } from '../../common/guards/permissions.guard';
import { StratejiService } from './strateji.service';
import { StratejiController } from './strateji.controller';
import type { StratejiKelimeKuyrugu } from './kelime-kuyrugu';

/**
 * ═══ AJAN 4 — ADVSTRATEGY GÜVENLİK KAPISI ═══
 *
 * Mevcut paketlerin (strateji.service.spec, strateji-rls.spec) BAKMADIĞI
 * yerler: (1) başka workspace'in plan kimliğiyle HER uç, (2) "tüm şirketler"
 * modunda org_id'nin HEDEF müşteriden okunduğu (mevcut test ev şirketi ile
 * hedef şirket AYNI olduğu için bunu ayırt edemiyordu), (3) uç başına yetki
 * — client_viewer her yazma ucunda 403, onayda değil, (4) para üst sınırı,
 * (5) kelime işçisinin transaction çalıştırıcısı.
 *
 * Harness RLS'i KAPALI kuruyor: buradaki izolasyon iddiaları servisin
 * İKİNCİ kapısını (ctx.clientIds) sınıyor. RLS'in kendisi strateji-rls*.spec.
 */
let h: Harness;
let svc: StratejiService;
const kuyrukEkle = vi.fn<(is: { planId: string; tohumlar: string[] }) => Promise<void>>();

const OTEKI = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const KARDES_ORG = 'cccccccc-0000-4000-8000-00000000000c';
const KARDES_WS = 'cccccccc-0000-4000-8000-0000000000c1';
const KARDES_KITLE = '77777777-0000-4000-8000-0000000000c1';
const GOOGLE = '44444444-0000-4000-8000-0000000000aa';

const AJANS = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client, OTEKI],
  activeClientId: IDS.client,
  isOrgAdmin: true,
  role: 'admin',
  permissions: [...resolvePermissions('admin')],
} as unknown as TenantContext;

/** Yalnız IDS.client'a erişimi olan reklam yöneticisi. OTEKI'yi bilmiyor. */
const DAR = {
  ...AJANS,
  clientIds: [IDS.client],
  isOrgAdmin: false,
  role: 'ad_manager',
  permissions: [...resolvePermissions('ad_manager')],
} as unknown as TenantContext;

/**
 * "Tüm şirketler" modu: ctx.orgId EV şirketi (IDS.org) kalıyor, clientIds
 * kardeş şirketin workspace'ini de taşıyor (tenant-context.service.ts).
 */
const TUM_SIRKETLER = {
  ...AJANS,
  clientIds: [IDS.client, OTEKI, KARDES_WS],
  activeClientId: null,
} as unknown as TenantContext;

beforeAll(async () => {
  h = await createHarness();
  const prisma = {
    withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;
  svc = new StratejiService(prisma, { ekle: kuyrukEkle } as unknown as StratejiKelimeKuyrugu);
}, 60_000);
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  kuyrukEkle.mockReset();
  kuyrukEkle.mockResolvedValue(undefined);
  await h.reset();
  await seedTenant(h);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Öteki', 'oteki', now())`, [OTEKI, IDS.org]);
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Kardeş', 'kardes', now())`, [KARDES_ORG]);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Kardeş WS', 'kardes-ws', now())`, [
    KARDES_WS,
    KARDES_ORG,
  ]);
  await h.q(
    `INSERT INTO audience_templates (id, org_id, client_id, name, updated_at) VALUES ($1, $2, $3, 'Kardeş kitlesi', now())`,
    [KARDES_KITLE, KARDES_ORG, KARDES_WS],
  );
});

async function otekininPlani(): Promise<string> {
  const d = await svc.olustur(AJANS, { clientId: OTEKI, donem: '2026-11', toplamButce: '100.000', paraBirimi: 'TRY' });
  await svc.dagilimKaydet(AJANS, d.plan.id, { surum: 1, satirlar: [{ platform: 'meta', katman: 'soguk', tutar: '10.000' }] });
  return d.plan.id;
}

async function planDurumu(id: string) {
  const [p] = await h.q<{ durum: string; surum: number; kelime_arama: string; son_oneri: unknown; dagilim: number; matris: number }>(
    `SELECT durum, surum, kelime_arama, son_oneri,
            (SELECT count(*)::int FROM strateji_dagilimlari d WHERE d.plan_id = p.id) AS dagilim,
            (SELECT count(*)::int FROM strateji_matrisi m WHERE m.plan_id = p.id) AS matris
       FROM strateji_planlari p WHERE id = $1`,
    [id],
  );
  return p!;
}

describe('IDOR — başka workspace’in plan kimliğiyle her uç', () => {
  it('KRİTİK: okuma ve her yazma ucu 404; plan satırı, dağılım ve kuyruk DOKUNULMADAN kalır', async () => {
    const id = await otekininPlani();
    const once = await planDurumu(id);
    expect(once).toMatchObject({ durum: 'taslak', surum: 2, dagilim: 1, matris: 0 });

    const cagrilar: Array<[string, () => Promise<unknown>]> = [
      ['detay', () => svc.detay(DAR, id)],
      ['dagilimKaydet', () => svc.dagilimKaydet(DAR, id, { surum: 2, satirlar: [] })],
      ['dagilimOner', () => svc.dagilimOner(DAR, id)],
      [
        'matrisKaydet',
        () =>
          svc.matrisKaydet(DAR, id, {
            surum: 2,
            satirlar: [
              { platform: 'google', katman: 'soguk', niyet: 'SITE', kitleSablonuId: null, kelimeGrubu: null, varlikIdleri: [], tutar: '1' },
            ],
          }),
      ],
      ['kelimeAra', () => svc.kelimeAra(DAR, id, { tohumlar: ['kahve'] })],
      ['kelimeGuncelle', () => svc.kelimeGuncelle(DAR, id, { surum: 2, satirlar: [{ id: '99999999-0000-4000-8000-000000000000', secili: true }] })],
      ['eylem onaya_gonder', () => svc.eylem(DAR, id, { eylem: 'onaya_gonder', surum: 2 })],
      ['eylem iptal', () => svc.eylem(DAR, id, { eylem: 'iptal', surum: 2 })],
      ['onayla', () => svc.onayla(DAR, id, 2)],
    ];
    for (const [ad, f] of cagrilar) {
      await expect(f(), ad).rejects.toMatchObject({ status: 404 });
    }

    expect(await planDurumu(id)).toEqual(once);
    expect(kuyrukEkle).not.toHaveBeenCalled();
  });

  it('KRİTİK: liste ve plan açma başka workspace için 403', async () => {
    await expect(svc.listele(DAR, OTEKI)).rejects.toMatchObject({ status: 403 });
    await expect(
      svc.olustur(DAR, { clientId: OTEKI, donem: '2026-12', toplamButce: '1', paraBirimi: 'TRY' }),
    ).rejects.toMatchObject({ status: 403 });
    const [n] = await h.q<{ n: number }>(`SELECT count(*)::int AS n FROM strateji_planlari WHERE client_id = $1`, [OTEKI]);
    expect(n!.n).toBe(0);
  });

  it('KRİTİK: kendi planında başka planın kelime kimliği güncellenemez, öteki satır değişmez', async () => {
    const otekiId = await otekininPlani();
    const [k] = await h.q<{ id: string }>(
      `INSERT INTO strateji_kelimeleri (plan_id, org_id, client_id, kelime, cekim_zamani, kaynak_istek)
       VALUES ($1, $2, $3, 'gizli kelime', now(), '{}') RETURNING id::text`,
      [otekiId, IDS.org, OTEKI],
    );
    const benim = await svc.olustur(DAR, { clientId: IDS.client, donem: '2026-11', toplamButce: '1.000' });
    await expect(
      svc.kelimeGuncelle(DAR, benim.plan.id, { surum: 1, satirlar: [{ id: k!.id, secili: true, grup: 'çalındı' }] }),
    ).rejects.toThrow(/bu planda yok/);
    const [s] = await h.q<{ secili: boolean; grup: string | null }>('SELECT secili, grup FROM strateji_kelimeleri WHERE id = $1', [k!.id]);
    expect(s).toEqual({ secili: false, grup: null });
  });
});

describe('“tüm şirketler” modu — org_id HEDEF workspace’ten', () => {
  it('KRİTİK: kardeş şirketin workspace’ine açılan plan ve çocuk satırlar KARDEŞ org_id taşır (ctx.orgId değil)', async () => {
    const d = await svc.olustur(TUM_SIRKETLER, { clientId: KARDES_WS, donem: '2026-11', toplamButce: '50.000', paraBirimi: 'TRY' });
    await svc.dagilimKaydet(TUM_SIRKETLER, d.plan.id, {
      surum: 1,
      satirlar: [{ platform: 'meta', katman: 'soguk', tutar: '10.000' }],
    });
    await svc.matrisKaydet(TUM_SIRKETLER, d.plan.id, {
      surum: 2,
      satirlar: [
        { platform: 'meta', katman: 'soguk', niyet: 'FORM', kitleSablonuId: KARDES_KITLE, kelimeGrubu: null, varlikIdleri: [], tutar: '5.000' },
      ],
    });
    const o = await svc.onayla(TUM_SIRKETLER, d.plan.id, 3).catch((e: unknown) => e);
    // Taslak onaylanamaz (409); önemli olan org_id'ler.
    expect(o).toMatchObject({ status: 409 });

    const orgs = await h.q<{ t: string; org_id: string }>(
      `SELECT 'plan' AS t, org_id::text FROM strateji_planlari WHERE id = $1
       UNION ALL SELECT 'dagilim', org_id::text FROM strateji_dagilimlari WHERE plan_id = $1
       UNION ALL SELECT 'matris', org_id::text FROM strateji_matrisi WHERE plan_id = $1`,
      [d.plan.id],
    );
    expect(orgs).toHaveLength(3);
    for (const r of orgs) expect(r.org_id, r.t).toBe(KARDES_ORG);
  });

  it('KRİTİK: tüm şirketler modunda bile kardeş şirketin kitlesi başka workspace’in matrisine giremez', async () => {
    const d = await svc.olustur(TUM_SIRKETLER, { clientId: IDS.client, donem: '2026-11', toplamButce: '50.000' });
    await svc.dagilimKaydet(TUM_SIRKETLER, d.plan.id, { surum: 1, satirlar: [{ platform: 'meta', katman: 'soguk', tutar: '10.000' }] });
    await expect(
      svc.matrisKaydet(TUM_SIRKETLER, d.plan.id, {
        surum: 2,
        satirlar: [
          { platform: 'meta', katman: 'soguk', niyet: 'FORM', kitleSablonuId: KARDES_KITLE, kelimeGrubu: null, varlikIdleri: [], tutar: '1' },
        ],
      }),
    ).rejects.toThrow(/bu workspace’e ait değil/);
  });
});

describe('uç başına yetki (PermissionsGuard ile aynı çekirdek)', () => {
  const proto = StratejiController.prototype as unknown as Record<string, unknown>;
  const uclar = Object.getOwnPropertyNames(proto)
    .filter((ad) => ad !== 'constructor' && typeof proto[ad] === 'function')
    .map((ad) => {
      const fn = proto[ad] as object;
      return {
        ad,
        yontem: Reflect.getMetadata(METHOD_METADATA, fn) as RequestMethod | undefined,
        yol: Reflect.getMetadata(PATH_METADATA, fn) as string | undefined,
        izin: Reflect.getMetadata(PERMISSIONS_KEY, fn) as Permission[] | undefined,
      };
    })
    .filter((u) => u.yol !== undefined);

  const musteri = { permissions: [...resolvePermissions('client_viewer')] } as unknown as TenantContext;
  const yonetici = { permissions: [...resolvePermissions('ad_manager')] } as unknown as TenantContext;
  const izinVar = (ctx: TenantContext, izin: Permission[]) => {
    try {
      assertPermissions(ctx, ...izin);
      return true;
    } catch {
      return false;
    }
  };

  it('BOŞA DÜŞME BEKÇİSİ: yansımadan on bir uç okundu', () => {
    // İkinci tur: GET .../pdf eklendi (Ajan 2, MIMARI § 6.3).
    expect(uclar).toHaveLength(11);
  });

  it('KRİTİK: HER uçta izin dekoratörü var (eksik dekoratör = guard true döner = açık uç)', () => {
    for (const u of uclar) expect(u.izin?.length ?? 0, `${u.ad} izinsiz`).toBeGreaterThan(0);
  });

  it('KRİTİK: client_viewer her YAZMA ucunda reddedilir; okur ve onaylar', () => {
    for (const u of uclar) {
      const okuma = u.yontem === RequestMethod.GET;
      const onay = u.ad === 'onayla';
      expect(izinVar(musteri, u.izin!), `${u.ad} (${u.yol})`).toBe(okuma || onay);
    }
  });

  it('KRİTİK: onay ucu YALNIZ strategy.approve ister; yazma izni tek başına onaylatmaz', () => {
    const onay = uclar.find((u) => u.ad === 'onayla')!;
    expect(onay.izin).toEqual(['strategy.approve']);
    const yalnizYazar = { permissions: ['strategy.read', 'strategy.write'] } as unknown as TenantContext;
    expect(izinVar(yalnizYazar, onay.izin!)).toBe(false);
    expect(izinVar(yonetici, onay.izin!)).toBe(true);
  });
});

describe('para', () => {
  it('sıfır, eksi, JPY küsuratı ve belirsiz "1.5" plan açarken 400', async () => {
    for (const [toplamButce, paraBirimi] of [['0', 'TRY'], ['-5', 'TRY'], ['1.000,5', 'JPY'], ['1.5', 'TRY'], ['1,123', 'TRY']] as const) {
      await expect(
        svc.olustur(AJANS, { clientId: IDS.client, donem: '2026-11', toplamButce, paraBirimi }),
        `${toplamButce} ${paraBirimi}`,
      ).rejects.toMatchObject({ status: 400 });
    }
    const kwd = await svc.olustur(AJANS, { clientId: IDS.client, donem: '2026-11', toplamButce: '1,125', paraBirimi: 'KWD' });
    expect(kwd.plan.toplamButceMicros).toBe('1125000');
  });

  it('KRİTİK: BIGINT sınırını aşan bütçe ANLAMLI 400 ile reddedilir (veritabanı taşma hatası değil)', async () => {
    // 10 trilyon TL = 1e19 micros > 2^63-1. tutarAyristir üst sınır koymuyor.
    const r = await svc
      .olustur(AJANS, { clientId: IDS.client, donem: '2026-11', toplamButce: '10.000.000.000.000', paraBirimi: 'TRY' })
      .catch((e: unknown) => e);
    expect(r).toMatchObject({ status: 400 });
    expect(String((r as Error).message)).toMatch(/bütçe/i);
  });

  it('sunucu dağılım toplamı ve matris hücre aşımını panelden bağımsız reddediyor (sıfır hücre dahil)', async () => {
    const d = await svc.olustur(AJANS, { clientId: IDS.client, donem: '2026-11', toplamButce: '1.000' });
    await expect(
      svc.dagilimKaydet(AJANS, d.plan.id, {
        surum: 1,
        satirlar: [
          { platform: 'meta', katman: 'soguk', tutar: '600' },
          { platform: 'google', katman: 'soguk', tutar: '400,01' },
        ],
      }),
    ).rejects.toThrow(/aşıyor/);
    await svc.dagilimKaydet(AJANS, d.plan.id, { surum: 1, satirlar: [{ platform: 'meta', katman: 'soguk', tutar: '0' }] });
    await expect(
      svc.matrisKaydet(AJANS, d.plan.id, {
        surum: 2,
        satirlar: [
          { platform: 'google', katman: 'soguk', niyet: 'SITE', kitleSablonuId: null, kelimeGrubu: null, varlikIdleri: [], tutar: '0,01' },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('kelime araması — kilit ve kota', () => {
  it('aynı plana art arda arama: ikincisi 409, kuyruğa TEK iş', async () => {
    await h.q(
      `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, sync_enabled, updated_at)
       VALUES ($1, $2, $3, $4, 'google', '1234567890', 'G', 'TRY', 'Europe/Istanbul', true, now())`,
      [GOOGLE, IDS.org, IDS.client, IDS.connection],
    );
    const d = await svc.olustur(AJANS, { clientId: IDS.client, donem: '2026-11', toplamButce: '1.000' });
    await svc.kelimeAra(AJANS, d.plan.id, { tohumlar: ['kahve'] });
    await expect(svc.kelimeAra(AJANS, d.plan.id, { tohumlar: ['çay'] })).rejects.toMatchObject({ status: 409 });
    expect(kuyrukEkle).toHaveBeenCalledTimes(1);
  });
});

describe('kelime işçisi — iki kısa transaction GERÇEKTEN transaction mı', () => {
  /*
   * İşleyici "1. ön koşul, 2. platform çağrısı, 3. yazım" diye İKİ KISA
   * TRANSACTION varsayıyor: 3. adımda `SELECT ... FOR UPDATE`, ardından
   * seçilmemişleri DELETE + yenileri INSERT + plan UPDATE. worker.ts ise
   * çalıştırıcıyı `(fn) => fn(admin)` diye kuruyor: transaction YOK. Her
   * deyim kendi başına commit oluyor; FOR UPDATE kilidi deyim biter bitmez
   * bırakılıyor ve DELETE ile INSERT arasında bir hata olursa seçilmemiş
   * fikirler silinmiş, yenileri yazılmamış ve plan 'calisiyor'da kalmış olur.
   * Kilit yokken plan arada onaya gönderilirse ON CONFLICT DO UPDATE onaydaki
   * planın SEÇİLİ kelimelerinin hacim/teklif değerlerini değiştirir.
   */
  const KAYNAK = readFileSync(join(__dirname, '../../worker.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const bas = KAYNAK.indexOf('kelimeIsiniIsle(');
  const govde = bas >= 0 ? KAYNAK.slice(bas, KAYNAK.indexOf('job.data', bas)) : '';

  it('gövde gerçekten yakalandı', () => {
    expect(bas).toBeGreaterThan(0);
    expect(govde).toMatch(/tx:/);
  });

  it('KRİTİK: kelime işçisinin `tx` çalıştırıcısı bir $transaction açıyor', () => {
    const satir = /tx:\s*([^\n]+)/.exec(govde)?.[1] ?? '';
    expect(satir).toContain('$transaction');
  });
});
