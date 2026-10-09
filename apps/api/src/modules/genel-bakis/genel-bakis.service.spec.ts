import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { BEKLEYEN_IS_SINIRI, resolvePermissions, type TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { GenelBakisService } from './genel-bakis.service';

/**
 * Bekleyen işler — gerçek şema (PGlite), üretim migration'larından.
 * RLS burada KAPALI (worker rolü taklidi); kapsamı servisin kendi
 * `client_id = ANY(...)` süzgeci ve 403 kapısı taşıyor, testler onu sınıyor.
 */
let h: Harness;
let svc: GenelBakisService;

/** Servisin gönderdiği her SQL — "sorulmadı" iddiası buradan okunuyor. */
let sorgular: string[] = [];
/** withTenant'a verilen bağlamlar — `activeClientId` eşitlemesi için. */
let baglamlar: TenantContext[] = [];
/** Eşleşen sorguyu düşürür: kaynak arızası taklidi. */
let dusur: RegExp | null = null;

const OTEKI = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const YABANCI = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const PROFIL = '66666666-0000-4000-8000-000000000001';

/** 15 Ekim: ay = 2026-10, harcama kapsamı 1–14 Ekim (dün dahil, bugün değil). */
const SIMDI = new Date('2026-10-15T09:00:00Z');

const AJANS = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client, OTEKI],
  activeClientId: IDS.client,
  isOrgAdmin: true,
  tumSirketler: false,
  role: 'admin',
  permissions: [...resolvePermissions('admin')],
} as unknown as TenantContext;
const MUSTERI = {
  ...AJANS,
  clientIds: [IDS.client],
  isOrgAdmin: false,
  role: 'client_viewer',
  permissions: [...resolvePermissions('client_viewer')],
} as unknown as TenantContext;

beforeAll(async () => {
  h = await createHarness();
  const prisma = {
    withTenant: <T>(c: TenantContext, fn: (tx: unknown) => Promise<T>) => {
      baglamlar.push(c);
      return fn({
        $queryRaw: (sql: Prisma.Sql) => {
          sorgular.push(sql.sql);
          if (dusur?.test(sql.sql)) return Promise.reject(new Error('yapay arıza'));
          return h.db.$queryRaw(sql);
        },
      });
    },
  } as unknown as PrismaService;
  svc = new GenelBakisService(prisma);
}, 60_000);
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  sorgular = [];
  baglamlar = [];
  dusur = null;
  await h.reset();
  await seedTenant(h);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Öteki', 'oteki', now())`, [
    OTEKI,
    IDS.org,
  ]);
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, 'instagram_business', 'ig-1', 'Hesap', now())`,
    [PROFIL, IDS.org, IDS.client, IDS.connection],
  );
});

async function kart(durum: string, olusturma: string, client: string = IDS.client): Promise<void> {
  await h.q(
    `INSERT INTO auto_boost_queue_items
       (id, org_id, client_id, platform, social_profile_id, external_id, status, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'meta', $3, gen_random_uuid()::text, $4, $5, now())`,
    [IDS.org, client, PROFIL, durum, olusturma],
  );
}

async function plan(
  durum: 'taslak' | 'onayda' | 'onaylandi' | 'aktarildi',
  donem: string,
  guncelleme: string,
  client: string = IDS.client,
  onay: string | null = null,
): Promise<void> {
  const onayli = durum === 'onaylandi' || durum === 'aktarildi';
  await h.q(
    `INSERT INTO strateji_planlari
       (org_id, client_id, donem, durum, toplam_butce_micros, para_birimi,
        onay_rolu, onay_zamani, onaylanan_surum, updated_at)
     VALUES ($1, $2, $3, $4, 1, 'TRY', $5, $6, $7, $8)`,
    [IDS.org, client, donem, durum, onayli ? 'ajans' : null, onayli ? (onay ?? guncelleme) : null, onayli ? 1 : null, guncelleme],
  );
}

async function harcama(tarih: string, tl: number, seviye = 'campaign', client: string = IDS.client): Promise<void> {
  await h.q(
    `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date,
                                 spend_micros, currency)
     VALUES ($1, $2, 'meta', $3, gen_random_uuid(), 'x', $4, $5, 'TRY')`,
    [client, IDS.adAccount, seviye, tarih, BigInt(tl) * 1_000_000n],
  );
}

async function butce(ay: string, hesap: string | null = null): Promise<void> {
  await h.q(
    `INSERT INTO monthly_budgets (id, org_id, client_id, ad_account_id, month, amount_micros, currency, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 1000000, 'TRY', now())`,
    [IDS.org, IDS.client, hesap, ay],
  );
}

const sor = (ctx = AJANS, clientId?: string, now = SIMDI) => svc.bekleyenler(ctx, clientId ? { clientId } : {}, now);

describe('boost_onay', () => {
  it('KRİTİK: yalnız pending sayılıyor; kontrol/yayında/reddedilen dışarıda; enEski en eski pending', async () => {
    await kart('pending', '2026-10-10T10:00:00Z');
    await kart('pending', '2026-10-02T08:00:00Z');
    await kart('kontrol', '2026-09-01T08:00:00Z');
    await kart('launched', '2026-09-01T08:00:00Z');
    await kart('rejected', '2026-09-01T08:00:00Z');
    const y = await sor(AJANS, IDS.client);
    const satir = y.isler.filter((i) => i.tur === 'boost_onay');
    expect(satir).toEqual([
      { tur: 'boost_onay', clientId: IDS.client, clientAdi: 'Workspace', sayi: 2, enEski: '2026-10-02T08:00:00.000Z' },
    ]);
  });

  it('workspace başına bir satır; clientId verilince öteki workspace sayılmıyor', async () => {
    await kart('pending', '2026-10-10T10:00:00Z');
    await kart('pending', '2026-10-11T10:00:00Z', OTEKI);
    const hepsi = await sor(AJANS);
    expect(hepsi.isler.filter((i) => i.tur === 'boost_onay').map((i) => i.clientId).sort()).toEqual(
      [IDS.client, OTEKI].sort(),
    );
    const tek = await sor(AJANS, IDS.client);
    expect(tek.isler.map((i) => i.clientId)).toEqual([IDS.client]);
  });
});

describe('strateji_onay ve strateji_aktar', () => {
  it('KRİTİK: onayda ve onaylandi ayrı türler; taslak/aktarildi sayılmıyor', async () => {
    await plan('onayda', '2026-11', '2026-10-05T00:00:00Z');
    await plan('onaylandi', '2026-12', '2026-10-09T00:00:00Z', IDS.client, '2026-10-01T12:00:00Z');
    await plan('taslak', '2027-01', '2026-09-01T00:00:00Z');
    await plan('aktarildi', '2027-02', '2026-09-01T00:00:00Z');
    const y = await sor(AJANS, IDS.client);
    expect(y.isler.find((i) => i.tur === 'strateji_onay')).toMatchObject({ sayi: 1, enEski: '2026-10-05T00:00:00.000Z' });
    // ONAY ZAMANI, updated_at değil: aktarım bekleyen planın yaşı onaydan sayılır.
    expect(y.isler.find((i) => i.tur === 'strateji_aktar')).toMatchObject({ sayi: 1, enEski: '2026-10-01T12:00:00.000Z' });
    expect(y.isler).toHaveLength(2);
  });
});

describe('butce_yok', () => {
  it('KRİTİK: bu ay harcama var, bütçe yok → tek satır, sayi 1, enEski null', async () => {
    await harcama('2026-10-03', 500);
    const y = await sor(AJANS, IDS.client);
    expect(y.isler).toEqual([{ tur: 'butce_yok', clientId: IDS.client, clientAdi: 'Workspace', sayi: 1, enEski: null }]);
  });

  it('KRİTİK: HESAP bütçesi de "bütçe var" sayılıyor', async () => {
    await harcama('2026-10-03', 500);
    await butce('2026-10-01', IDS.adAccount);
    expect((await sor(AJANS, IDS.client)).isler).toEqual([]);
  });

  it('workspace geneli bütçe varsa satır yok; GEÇEN AYIN bütçesi sayılmıyor', async () => {
    await harcama('2026-10-03', 500);
    await butce('2026-09-01');
    expect((await sor(AJANS, IDS.client)).isler).toHaveLength(1);
    await butce('2026-10-01');
    expect((await sor(AJANS, IDS.client)).isler).toEqual([]);
  });

  it('KRİTİK: harcama yalnız kampanya seviyesinden; reklam seviyesi tek başına satır üretmiyor', async () => {
    await harcama('2026-10-03', 500, 'ad');
    expect((await sor(AJANS, IDS.client)).isler).toEqual([]);
  });

  it('KRİTİK: bütçe ekranının ay tanımı — bugün ve geçen ay sayılmıyor, sıfır harcama sayılmıyor', async () => {
    await harcama('2026-10-15', 500); // bugün: veri eksik, pacing de saymıyor
    await harcama('2026-09-30', 500); // geçen ay
    await harcama('2026-10-04', 0);
    expect((await sor(AJANS, IDS.client)).isler).toEqual([]);
  });

  it('ayın ilk günü kapsam boş: sorgu hiç gönderilmiyor ve satır yok', async () => {
    await harcama('2026-10-01', 500);
    const y = await sor(AJANS, IDS.client, new Date('2026-10-01T09:00:00Z'));
    expect(y.isler).toEqual([]);
    expect(sorgular.some((s) => s.includes('monthly_budgets'))).toBe(false);
  });

  it('kapsam dışı workspace\'in harcaması sayılmıyor', async () => {
    await harcama('2026-10-03', 500, 'campaign', OTEKI);
    expect((await sor(MUSTERI)).isler).toEqual([]);
    expect((await sor(AJANS)).isler.map((i) => i.clientId)).toEqual([OTEKI]);
  });
});

describe('yetki', () => {
  it('KRİTİK: müşteri hesabı yalnız strateji_onay sorar; diğerleri sorulmayan ve SQL bile gitmiyor', async () => {
    await kart('pending', '2026-10-10T10:00:00Z');
    await plan('onayda', '2026-11', '2026-10-05T00:00:00Z');
    await plan('onaylandi', '2026-12', '2026-10-05T00:00:00Z');
    await harcama('2026-10-03', 500);
    const y = await sor(MUSTERI, IDS.client);
    expect(y.isler.map((i) => i.tur)).toEqual(['strateji_onay']);
    expect(y.sorulmayan).toEqual(['boost_onay', 'strateji_aktar', 'butce_yok']);
    expect(y.hatalar).toEqual([]);
    expect(sorgular).toHaveLength(1);
    expect(sorgular.some((s) => s.includes('auto_boost_queue_items'))).toBe(false);
    expect(sorgular.some((s) => s.includes('insights_daily'))).toBe(false);
  });

  it('admin hiçbir türü sorulmayan saymıyor', async () => {
    expect((await sor(AJANS)).sorulmayan).toEqual([]);
  });

  it('KRİTİK: erişilemeyen workspace 403 ve hiçbir sorgu gitmiyor', async () => {
    await expect(sor(AJANS, YABANCI)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(sor(MUSTERI, OTEKI)).rejects.toBeInstanceOf(ForbiddenException);
    expect(sorgular).toEqual([]);
  });

  it('activeClientId isteğin kapsamına eşitleniyor (seçili workspace "hepsi"ni daraltmasın)', async () => {
    await sor(AJANS);
    expect(baglamlar.length).toBeGreaterThan(0);
    expect(baglamlar.every((c) => c.activeClientId === null)).toBe(true);
    baglamlar = [];
    await sor({ ...AJANS, activeClientId: null } as TenantContext, OTEKI);
    expect(baglamlar.every((c) => c.activeClientId === OTEKI)).toBe(true);
  });
});

describe('kaynak arızası', () => {
  it('KRİTİK: düşen kaynak hatalar\'a yazılıyor, diğerleri geliyor', async () => {
    await kart('pending', '2026-10-10T10:00:00Z');
    await plan('onayda', '2026-11', '2026-10-05T00:00:00Z');
    await harcama('2026-10-03', 500);
    dusur = /auto_boost_queue_items/;
    const y = await sor(AJANS, IDS.client);
    expect(y.hatalar).toEqual([{ tur: 'boost_onay', mesaj: 'Akıllı Boost kuyruğu okunamadı' }]);
    expect(y.isler.map((i) => i.tur)).toEqual(['strateji_onay', 'butce_yok']);
  });

  it('her kaynak AYRI transaction: bir arıza diğerlerinin bağlamını paylaşmıyor', async () => {
    await sor(AJANS);
    // Dört tür, dört withTenant. Tek transaction'da biri düşerse Postgres
    // geri kalanını "current transaction is aborted" ile düşürürdü.
    expect(baglamlar).toHaveLength(4);
  });
});

describe('sıralama ve kesme', () => {
  it('önce tür önceliği, sonra en eski', async () => {
    await plan('onayda', '2026-11', '2026-09-01T00:00:00Z');
    await kart('pending', '2026-10-10T10:00:00Z');
    await kart('pending', '2026-10-01T10:00:00Z', OTEKI);
    const y = await sor(AJANS);
    expect(y.isler.map((i) => [i.tur, i.clientId])).toEqual([
      ['boost_onay', OTEKI],
      ['boost_onay', IDS.client],
      ['strateji_onay', IDS.client],
    ]);
  });

  it('KRİTİK: sınırda kesiliyor, toplam kesilmeden; kalanlar en eskiler', async () => {
    const n = BEKLEYEN_IS_SINIRI + 7;
    const idler = await h.q<{ id: string }>(
      `INSERT INTO clients (id, org_id, name, slug, updated_at)
       SELECT gen_random_uuid(), $1, 'W-' || g, 'w-' || g, now() FROM generate_series(1, $2::int) g
       RETURNING id::text`,
      [IDS.org, n],
    );
    // g. workspace'in planı g gün önce onaya gitti: en eskiler en büyük g.
    await h.q(
      `INSERT INTO strateji_planlari (org_id, client_id, donem, durum, toplam_butce_micros, para_birimi, updated_at)
       SELECT $1, c.id, '2026-11', 'onayda', 1, 'TRY', '2026-10-14'::timestamptz - (substring(c.name from 3)::int || ' days')::interval
       FROM clients c WHERE c.name LIKE 'W-%'`,
      [IDS.org],
    );
    const ctx = { ...AJANS, clientIds: idler.map((r) => r.id) } as TenantContext;
    const y = await sor(ctx);
    expect(y.toplam).toBe(n);
    expect(y.isler).toHaveLength(BEKLEYEN_IS_SINIRI);
    expect(y.isler[0]!.clientAdi).toBe(`W-${n}`);
    expect(y.isler.map((i) => i.clientAdi)).not.toContain('W-1');
  });

  it('kapsam boşsa sorgu yok, boş yanıt', async () => {
    const y = await sor({ ...AJANS, clientIds: [] } as unknown as TenantContext);
    expect(y).toMatchObject({ isler: [], toplam: 0, hatalar: [], sorulmayan: [] });
    expect(sorgular).toEqual([]);
  });
});

describe('kaynak taraması — Nest kaydı ve uç', () => {
  const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const APP = yorumsuz(readFileSync(join(__dirname, '../../app.module.ts'), 'utf8'));
  const MODUL = yorumsuz(readFileSync(join(__dirname, 'genel-bakis.module.ts'), 'utf8'));
  const UC = yorumsuz(readFileSync(join(__dirname, 'genel-bakis.controller.ts'), 'utf8'));

  /**
   * Listeyi KÖŞELİ PARANTEZ SAYARAK kesiyor: ilk kapanan parantez,
   * `ConfigModule.forRoot({ envFilePath: [...] })` gibi iç içe bir dizinin
   * sonu olabiliyor ve dilim modül adına hiç ulaşmıyordu.
   */
  const liste = (kaynak: string, anahtar: string) => {
    const i = kaynak.indexOf(`${anahtar}: [`);
    if (i < 0) throw new Error(`${anahtar} listesi bulunamadı — tarama boşa düştü`);
    let derinlik = 0;
    for (let j = kaynak.indexOf('[', i); j < kaynak.length; j++) {
      if (kaynak[j] === '[') derinlik++;
      else if (kaynak[j] === ']' && --derinlik === 0) return kaynak.slice(i, j + 1);
    }
    throw new Error(`${anahtar} listesi kapanmıyor`);
  };

  it('KRİTİK: GenelBakisModule AppModule imports listesinde', () => {
    expect(liste(APP, 'imports')).toMatch(/\bGenelBakisModule\b/);
  });

  it('servis sağlayıcıda, controller controllers listesinde', () => {
    expect(liste(MODUL, 'providers')).toContain('GenelBakisService');
    expect(liste(MODUL, 'controllers')).toContain('GenelBakisController');
  });

  it('uç: GET genel-bakis/bekleyenler, kapı insights.read, sorgu sözleşme şemasından', () => {
    expect(UC).toContain(`@Controller('genel-bakis')`);
    const i = UC.indexOf(`@Get('bekleyenler')`);
    expect(i, 'uç bulunamadı').toBeGreaterThan(-1);
    const govde = UC.slice(i, UC.indexOf('}', i));
    expect(govde).toContain(`@RequirePermissions('insights.read')`);
    expect(govde).toContain('zodQuery(bekleyenIslerSorgusuSchema)');
    expect(govde).toContain('@CurrentTenant()');
  });
});
