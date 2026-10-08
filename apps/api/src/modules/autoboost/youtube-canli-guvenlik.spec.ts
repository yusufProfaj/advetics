import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { YarimKurulumHatasi, googleYalinKimlik } from '../connections/providers/google-demandgen';
import { AutoBoostLaunchService } from './autoboost-launch.service';
import { AutoBoostReadService } from './autoboost-read.service';

/**
 * ═══ YOUTUBE AKILLI BOOST · CANLIYA ÇIKMADAN ÖNCE PARA GÜVENLİĞİ ═══
 *
 * `docs/akilli-boost/YOUTUBE-CANLI-PLAN.md` Aşama 0. Her blok bir
 * bulguyu kilitliyor ve hepsi aynı soruya bağlı: aynı video için İKİNCİ
 * bir kampanya açılabilir mi, ya da açılmış bir kampanya görünmez olabilir
 * mi?
 *
 *   P1  yayındaki YouTube kartı tekrar onaylanamıyor
 *   P2  Google başarılı + kayıt düştü → kart `kontrol`, `failed` DEĞİL
 *   P4  geri alma eksik → kart `kontrol`
 *   P5  Google yazma kesicisi ve kota bekçisi kilitten ÖNCE
 *   P6  `launching`te takılan kart `kontrol` oluyor
 *   G1  kartın kampanya kimliği yalın sayı → senkronlanan satırla eşleşiyor
 *   G5  uygulanan ayar kilitle birlikte yazılıyor
 *
 * GERÇEK SORGU (PGlite). Platform tarafı taklit: sınanan şey Google'a ne
 * gittiği değil (`youtube-yayin-sirasi.spec.ts`), Google'ın cevabına göre
 * KARTIN ne olduğu.
 */
let h: Harness;
let svc: AutoBoostLaunchService;
let oku: AutoBoostReadService;

const KANAL = 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa';
const KART = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb';
const LOGO = 'cccccccc-2222-2222-2222-cccccccccccc';

const CTX = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  isOrgAdmin: true,
} as TenantContext;

const METIN = { baslik: 'Yeni proje', uzunBaslik: 'Yeni proje videosu', aciklama: 'Ege Birlik Yapı kanalında' };

/** Google'ın döndürdüğü KAYNAK ADLARI — yayın yolu bunları yalın sayıya indirmeli. */
const KURULAN = {
  campaignId: 'customers/1234567890/campaigns/456',
  adGroupId: 'customers/1234567890/adGroups/111',
  adId: 'customers/1234567890/adGroupAds/111~789',
};

let createVideoBoost: ReturnType<typeof vi.fn>;
let quotaAcquire: ReturnType<typeof vi.fn>;
/** Bu dizgeyi içeren UPDATE düşsün — "Google başarılı, kayıt yazılamadı" hâli. */
let dusecekYazma: string | null;

beforeAll(async () => {
  h = await createHarness();
  const db = new Proxy(h.db, {
    get(hedef, ad, alici) {
      if (ad === '$executeRaw') {
        return async (sql: { strings?: readonly string[] }) => {
          if (dusecekYazma && (sql.strings ?? []).join('?').includes(dusecekYazma)) {
            throw new Error('veritabanı bağlantısı koptu');
          }
          return hedef.$executeRaw(sql as never);
        };
      }
      return Reflect.get(hedef, ad, alici) as unknown;
    },
  });
  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(db),
  } as unknown as PrismaService;
  createVideoBoost = vi.fn();
  quotaAcquire = vi.fn();
  svc = new AutoBoostLaunchService(
    prisma,
    null as never,
    null as never,
    { get: () => ({ createVideoBoost }) } as never,
    { getAccessToken: async () => 'tok' } as never,
    { ensureExternalRef: async () => 'customers/1234567890/assets/9' } as never,
    {
      reklamHesabi: async () => ({ durum: 'kanal', hesapId: IDS.adAccount }),
      kanalaBagla: async () => undefined,
      yayinDegerleri: async () => ({ businessName: 'Ege Birlik', logoAssetId: LOGO, finalUrl: 'https://ege.com' }),
    } as never,
    null as never,
    { isEnabled: true, acquire: quotaAcquire } as never,
  );
  oku = new AutoBoostReadService(prisma);
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  dusecekYazma = null;
  createVideoBoost.mockReset().mockResolvedValue(KURULAN);
  quotaAcquire.mockReset().mockResolvedValue({ allowed: true });
  await h.reset();
  await seedTenant(h, { platform: 'google', externalId: '1234567890' });
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type,
       external_id, name, sync_enabled, linked_ad_account_id, updated_at)
     VALUES ($1,$2,$3,$4,'youtube_channel','UCege','Ege Birlik Yapı',true,$5,now())`,
    [KANAL, IDS.org, IDS.client, IDS.connection, IDS.adAccount],
  );
  await h.q(
    `INSERT INTO auto_boost_presets (id, org_id, client_id, platform, social_profile_id,
       enabled, budget_mode, daily_budget_micros, duration_days, settings, updated_at)
     VALUES (gen_random_uuid(),$1,$2,'google',NULL,true,'daily',100000000,3,
             '{"platform":"google","locations":[],"ageRanges":[]}'::jsonb, now())`,
    [IDS.org, IDS.client],
  );
  await kart();
});

async function kart(opts: { durum?: string; launchedGunOnce?: number | null; uygulanan?: object | null } = {}) {
  await h.q(`DELETE FROM auto_boost_queue_items WHERE id = $1`, [KART]);
  await h.q(
    `INSERT INTO auto_boost_queue_items
       (id, org_id, client_id, platform, social_profile_id, external_id, title, status,
        launched_at, applied_settings, external_campaign_id, created_at, updated_at)
     VALUES ($1,$2,$3,'google',$4,'vid12345678','Yeni proje',$5,
             CASE WHEN $6::int IS NULL THEN NULL ELSE now() - make_interval(days => $6::int) END,
             $7::jsonb, $8, now(), now())`,
    [
      KART,
      IDS.org,
      IDS.client,
      KANAL,
      opts.durum ?? 'pending',
      opts.launchedGunOnce ?? null,
      opts.uygulanan ? JSON.stringify(opts.uygulanan) : null,
      opts.durum === 'launched' ? '456' : null,
    ],
  );
}

async function durum(): Promise<{ status: string; error: string | null; external_campaign_id: string | null; external_ad_id: string | null; applied_settings: Record<string, unknown> | null }> {
  const [r] = await h.q<{
    status: string;
    error: string | null;
    external_campaign_id: string | null;
    external_ad_id: string | null;
    applied_settings: Record<string, unknown> | null;
  }>(`SELECT status, error, external_campaign_id, external_ad_id, applied_settings FROM auto_boost_queue_items WHERE id = $1`, [KART]);
  return r!;
}

const yayinla = () => svc.decide(CTX, KART, true, { texts: METIN });

describe('düzenek', () => {
  it('başarılı yayın: kart launched ve Google tam bir kez çağrıldı', async () => {
    const r = await yayinla();
    expect(r.status).toBe('launched');
    expect((await durum()).status).toBe('launched');
    expect(createVideoBoost).toHaveBeenCalledTimes(1);
  });
});

describe('G1: kimlikler YALIN — kart senkronlanan kampanyayla eşleşiyor', () => {
  it('KRİTİK: kaynak adı değil yalın sayı yazılıyor (reklam: dalganın sağı)', async () => {
    await yayinla();
    const d = await durum();
    expect(d.external_campaign_id).toBe('456');
    expect(d.external_ad_id).toBe('789');
  });

  it('KRİTİK: okuma katmanı yapı taramasının satırını buluyor — "henüz senkronize edilmedi" demiyor', async () => {
    await yayinla();
    await h.q(
      `INSERT INTO campaigns (id, client_id, ad_account_id, platform, external_id, name, status, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'google', '456', 'Ege — Video', 'active', now())`,
      [IDS.client, IDS.adAccount],
    );
    const liste = await oku.listQueue(CTX, IDS.client);
    const k = liste.items.find((i) => i.id === KART)!;
    expect(k.performanceNote).not.toMatch(/senkronize edilmedi/);
  });

  it('yalın kimlik üreticisi', () => {
    expect(googleYalinKimlik('customers/1/campaigns/2')).toBe('2');
    expect(googleYalinKimlik('customers/1/adGroupAds/3~4')).toBe('4');
    expect(googleYalinKimlik('5')).toBe('5');
  });
});

describe('G5: uygulanan ayar kilitle birlikte yazılıyor', () => {
  it('süre, bütçe ve konum kampanyanın kurulduğu hâliyle kartta', async () => {
    await yayinla();
    expect((await durum()).applied_settings).toMatchObject({
      platform: 'google',
      durationDays: 3,
      dailyBudgetMicros: '100000000',
    });
  });

  it('süreç Google çağrısında ölse bile ayar yazılmış — kilit anında', async () => {
    createVideoBoost.mockImplementation(async () => {
      // Kilit atıldı, Google çağrısı sürüyor: tam bu anda okunan satır.
      const d = await durum();
      expect(d.status).toBe('launching');
      expect(d.applied_settings).toMatchObject({ durationDays: 3 });
      return KURULAN;
    });
    await yayinla();
    expect(createVideoBoost).toHaveBeenCalledTimes(1);
  });
});

describe('KRİTİK P1: yayındaki YouTube kartı TEKRAR onaylanamıyor', () => {
  it('KRİTİK: yayından hemen sonra tekrar reddediliyor — aynı video için ikinci kampanya yok', async () => {
    await yayinla();
    await expect(svc.tekrarBoostla(CTX, KART)).rejects.toThrow(/hâlâ yayında/);
    expect((await durum()).status).toBe('launched');
  });

  it('okuma katmanı da aynı engeli gösteriyor — düğme baştan kapalı', async () => {
    await yayinla();
    const k = (await oku.listQueue(CTX, IDS.client)).items.find((i) => i.id === KART)!;
    expect(k.reBoostBlockedReason).toMatch(/hâlâ yayında/);
  });

  it('süre dolunca açılıyor (3 günlük kampanya, 4 gün önce)', async () => {
    await kart({ durum: 'launched', launchedGunOnce: 4, uygulanan: { durationDays: 3 } });
    await expect(svc.tekrarBoostla(CTX, KART)).resolves.toMatchObject({ status: 'pending' });
  });

  it('süre dolmadıysa kapalı (3 günlük kampanya, 2 gün önce)', async () => {
    await kart({ durum: 'launched', launchedGunOnce: 2, uygulanan: { durationDays: 3 } });
    await expect(svc.tekrarBoostla(CTX, KART)).rejects.toThrow(/hâlâ yayında/);
  });

  it('ESKİ KAYIT (uygulanan ayar yok): 30 gün varsayılıyor — 20 gün önce kapalı, 31 gün önce açık', async () => {
    await kart({ durum: 'launched', launchedGunOnce: 20 });
    await expect(svc.tekrarBoostla(CTX, KART)).rejects.toThrow(/hâlâ yayında/);
    await kart({ durum: 'launched', launchedGunOnce: 31 });
    await expect(svc.tekrarBoostla(CTX, KART)).resolves.toMatchObject({ status: 'pending' });
  });
});

describe('KRİTİK P2: Google başarılı, kayıt düştü → kart kontrol', () => {
  it('KRİTİK: kart failed DEĞİL kontrol ve kampanya kimliği hata metninde', async () => {
    dusecekYazma = "status = 'launched'";
    const r = await yayinla();
    expect(r.status).toBe('kontrol');
    const d = await durum();
    expect(d.status).toBe('kontrol');
    expect(d.error).toContain('456');
  });

  it('KRİTİK: kontrol kartı onaysız tekrar yayınlanamıyor', async () => {
    dusecekYazma = "status = 'launched'";
    await yayinla();
    await expect(svc.tekrarBoostla(CTX, KART)).rejects.toThrow(/kontrol et/);
    expect((await durum()).status).toBe('kontrol');
  });

  it('kullanıcı hesapta baktığını onaylayınca açılıyor', async () => {
    await kart({ durum: 'kontrol' });
    await expect(svc.tekrarBoostla(CTX, KART, true)).resolves.toMatchObject({ status: 'pending' });
  });

  it('kontrol kartı kapatılabiliyor', async () => {
    await kart({ durum: 'kontrol' });
    await expect(svc.kapat(CTX, KART)).resolves.toMatchObject({ status: 'rejected' });
  });
});

describe('P4: geri alma eksik → kontrol; tam geri alındıysa failed', () => {
  it('KRİTİK: yarım kurulum kartı kontrol yapıyor', async () => {
    createVideoBoost.mockRejectedValue(
      new YarimKurulumHatasi(new Error('RESOURCE_EXHAUSTED'), ['kampanya customers/1/campaigns/9']),
    );
    const r = await yayinla();
    expect(r.status).toBe('kontrol');
    const d = await durum();
    expect(d.status).toBe('kontrol');
    expect(d.error).toContain('customers/1/campaigns/9');
  });

  it('düz hata kartı failed yapıyor ve tekrar yayına açık', async () => {
    createVideoBoost.mockRejectedValue(new Error('INVALID_ARGUMENT'));
    const r = await yayinla();
    expect(r.status).toBe('failed');
    expect((await durum()).status).toBe('failed');
    await expect(svc.tekrarBoostla(CTX, KART)).resolves.toMatchObject({ status: 'pending' });
  });
});

describe('KRİTİK P5: kesici ve kota KİLİTTEN ÖNCE', () => {
  it('KRİTİK: Google yazması durdurulduysa kart pending kalıyor ve Google çağrılmıyor', async () => {
    await h.q(
      `INSERT INTO ajans_ayari (org_id, google_yazma_durduruldu, google_durdurma_at, google_durdurma_sebebi, updated_at)
       VALUES ($1, true, now(), 'ilk canlı deneme sonrası inceleme', now())`,
      [IDS.org],
    );
    await expect(yayinla()).rejects.toThrow(/Google'a yazma ajans tarafından durduruldu: ilk canlı/);
    expect((await durum()).status).toBe('pending');
    expect(createVideoBoost).not.toHaveBeenCalled();
  });

  it('Meta anahtarı Google yayınını DURDURMUYOR — iki anahtar bağımsız', async () => {
    await h.q(
      `INSERT INTO ajans_ayari (org_id, meta_yazma_durduruldu, durdurma_at, durdurma_sebebi, updated_at)
       VALUES ($1, true, now(), 'meta arızası', now())`,
      [IDS.org],
    );
    await expect(yayinla()).resolves.toMatchObject({ status: 'launched' });
  });

  it('KRİTİK: kota doluysa kart pending kalıyor ve Google çağrılmıyor', async () => {
    quotaAcquire.mockResolvedValue({ allowed: false, reason: 'platform_kotasi_dolu', retryAfterMs: 600_000 });
    await expect(yayinla()).rejects.toThrow(/kotası şu an dolu.*10 dakika/);
    expect((await durum()).status).toBe('pending');
    expect(createVideoBoost).not.toHaveBeenCalled();
  });

  it('kota yayın hesabı ve öncelikli katmanla soruluyor', async () => {
    await yayinla();
    expect(quotaAcquire).toHaveBeenCalledWith({ platform: 'google', adAccountId: IDS.adAccount, layer: 'interactive' });
  });
});

describe('P6: launching te takılan kart', () => {
  async function takil(dakikaOnce: number) {
    await kart({ durum: 'launching' });
    await h.q(
      `UPDATE auto_boost_queue_items SET updated_at = now() - make_interval(mins => $2::int) WHERE id = $1`,
      [KART, dakikaOnce],
    );
  }

  it('KRİTİK: 15 dakikadan eski launching kontrol oluyor', async () => {
    await takil(20);
    expect(await svc.takilanlariIsaretle(CTX, IDS.client)).toBe(1);
    const d = await durum();
    expect(d.status).toBe('kontrol');
    expect(d.error).toMatch(/kurulmuş olabilir/);
  });

  it('hâlâ koşan yayına dokunmuyor (5 dakika)', async () => {
    await takil(5);
    expect(await svc.takilanlariIsaretle(CTX, IDS.client)).toBe(0);
    expect((await durum()).status).toBe('launching');
  });
});

describe('migration: eski kayıtların kimlikleri yalın sayıya iniyor', () => {
  it('Google satırları düzeliyor, Meta satırına dokunulmuyor', async () => {
    await h.q(
      `UPDATE auto_boost_queue_items
          SET status = 'launched', external_campaign_id = $2, external_ad_group_id = $3, external_ad_id = $4
        WHERE id = $1`,
      [KART, KURULAN.campaignId, KURULAN.adGroupId, KURULAN.adId],
    );
    const sql = readFileSync(
      join(__dirname, '../../../prisma/migrations/20261008170000_google_yazma_kesici/migration.sql'),
      'utf8',
    );
    // Yorumlar ';' taşıyor: deyimi kendi başından sonuna kadar al, bölme.
    const guncellemeler = sql.match(/UPDATE "auto_boost_queue_items"[\s\S]*?;/g) ?? [];
    // KAPSAM: Meta satırına (aynı biçimde bir değer taşısa bile) dokunulmamalı.
    await h.q(
      `INSERT INTO auto_boost_queue_items
         (id, org_id, client_id, platform, social_profile_id, external_id, status,
          external_campaign_id, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'meta', $3, 'ig-x', 'launched', 'customers/1/campaigns/2', now(), now())`,
      [IDS.org, IDS.client, KANAL],
    );
    expect(guncellemeler).toHaveLength(3);
    for (const g of guncellemeler) await h.q(g);
    const [r] = await h.q<{ c: string; g: string; a: string }>(
      `SELECT external_campaign_id AS c, external_ad_group_id AS g, external_ad_id AS a
         FROM auto_boost_queue_items WHERE id = $1`,
      [KART],
    );
    expect(r).toEqual({ c: '456', g: '111', a: '789' });
    const [m] = await h.q<{ c: string }>(
      `SELECT external_campaign_id AS c FROM auto_boost_queue_items WHERE platform = 'meta'`,
    );
    expect(m?.c).toBe('customers/1/campaigns/2');
  });
});

describe('kaynak kilitleri', () => {
  const kaynak = readFileSync(join(__dirname, 'autoboost-launch.service.ts'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  const google = kaynak.slice(kaynak.indexOf('private async launchGoogle('), kaynak.indexOf('async tekrarBoostla('));

  it('dilim gerçekten yakalandı', () => {
    expect(google.length).toBeGreaterThan(2000);
  });

  it('KRİTİK: kesici ve kota KİLİTTEN önce', () => {
    const kilit = google.indexOf("SET status = 'launching'");
    expect(kilit).toBeGreaterThan(0);
    expect(google.indexOf('googleYazmaAcikMi(')).toBeGreaterThan(0);
    expect(google.indexOf('googleYazmaAcikMi(')).toBeLessThan(kilit);
    expect(google.indexOf('this.quota.acquire(')).toBeGreaterThan(0);
    expect(google.indexOf('this.quota.acquire(')).toBeLessThan(kilit);
  });

  it('NEST: kota bekçisi global kuyruk modülünden geliyor', () => {
    const kuyruk = readFileSync(join(__dirname, '../../queue/queue.module.ts'), 'utf8');
    expect(kuyruk).toMatch(/@Global\(\)/);
    expect(kuyruk).toMatch(/exports:\s*\[[^\]]*QuotaGuardService/);
  });
});
