import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { googleYalinKimlik } from '../connections/providers/google-demandgen';
import { PlatformApiError } from '../connections/provider.types';
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
  logoAssetResource: null as string | null,
};

let createVideoBoost: ReturnType<typeof vi.fn>;
let videoBoostProva: ReturnType<typeof vi.fn>;
let quotaAcquire: ReturnType<typeof vi.fn>;
let kanalaBagla: ReturnType<typeof vi.fn>;
let refKaydet: ReturnType<typeof vi.fn>;
/** Logo hesapta kayıtlı mı (kaynak adı) yoksa yayında yeni mi oluşturulacak. */
let logoGirdisi: { resource: string } | { yeniGorsel: { name: string; bytes: Buffer } };
let hesapKarari: { durum: string; hesapId: string };
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
  videoBoostProva = vi.fn();
  quotaAcquire = vi.fn();
  kanalaBagla = vi.fn();
  refKaydet = vi.fn();
  svc = new AutoBoostLaunchService(
    prisma,
    null as never,
    null as never,
    { get: () => ({ createVideoBoost, videoBoostProva }) } as never,
    { getAccessToken: async () => 'tok' } as never,
    { googleLogoGirdisi: async () => logoGirdisi, refKaydet } as never,
    {
      reklamHesabi: async () => hesapKarari,
      kanalaBagla,
      // Gerçek servis gibi: ön ayar/kart adresi verilmişse o, yoksa workspace.
      yayinDegerleri: async (_c: unknown, _k: unknown, _p: unknown, g: { finalUrl?: string }) => ({
        businessName: 'Ege Birlik',
        logoAssetId: LOGO,
        finalUrl: g.finalUrl ?? 'https://ege.com',
      }),
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
  videoBoostProva.mockReset().mockResolvedValue({ islemSayisi: 6 });
  quotaAcquire.mockReset().mockResolvedValue({ allowed: true });
  kanalaBagla.mockReset();
  refKaydet.mockReset().mockResolvedValue(undefined);
  logoGirdisi = { resource: 'customers/1234567890/assets/9' };
  hesapKarari = { durum: 'kanal', hesapId: IDS.adAccount };
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

describe('P4: cevap belirsizse kontrol; kesin retse failed', () => {
  it('KRİTİK: zaman aşımı / 5xx / eksik yanıt (transient) kartı kontrol yapıyor — kampanya kurulmuş olabilir', async () => {
    createVideoBoost.mockRejectedValue(new PlatformApiError('google', 'transient', 'İstek 30000ms içinde tamamlanmadı'));
    const r = await yayinla();
    expect(r.status).toBe('kontrol');
    const d = await durum();
    expect(d.status).toBe('kontrol');
    expect(d.error).toMatch(/kurulmuş olabilir.*30000ms/);
  });

  it('kesin ret (permanent) kartı failed yapıyor ve tekrar yayına açık', async () => {
    createVideoBoost.mockRejectedValue(new PlatformApiError('google', 'permanent', 'INVALID_ARGUMENT'));
    const r = await yayinla();
    expect(r.status).toBe('failed');
    expect((await durum()).status).toBe('failed');
    await expect(svc.tekrarBoostla(CTX, KART)).resolves.toMatchObject({ status: 'pending' });
  });

  it('platform dışı hata da failed', async () => {
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
  const google = kaynak.slice(kaynak.indexOf('private async launchGoogle('), kaynak.indexOf('async provaGoogle('));

  it('dilim gerçekten yakalandı', () => {
    expect(google.length).toBeGreaterThan(2000);
  });

  it('KRİTİK: kesici ve kota KİLİTTEN önce', () => {
    const kilit = google.indexOf("SET status = 'launching'");
    expect(kilit).toBeGreaterThan(0);
    expect(google.indexOf('googleYazmaAcikMi(')).toBeGreaterThan(0);
    expect(google.indexOf('googleYazmaAcikMi(')).toBeLessThan(kilit);
    expect(google.indexOf('this.kotaKapisi(')).toBeGreaterThan(0);
    expect(google.indexOf('this.kotaKapisi(')).toBeLessThan(kilit);
  });

  it('NEST: kota bekçisi global kuyruk modülünden geliyor', () => {
    const kuyruk = readFileSync(join(__dirname, '../../queue/queue.module.ts'), 'utf8');
    expect(kuyruk).toMatch(/@Global\(\)/);
    expect(kuyruk).toMatch(/exports:\s*\[[^\]]*QuotaGuardService/);
  });
});

describe('logo: yayında oluşturulursa önbelleğe yazılıyor', () => {
  it('yeni logo → yayın sonrası kaynak adı önbelleğe', async () => {
    logoGirdisi = { yeniGorsel: { name: 'Ege logo', bytes: Buffer.from('png') } };
    createVideoBoost.mockResolvedValue({ ...KURULAN, logoAssetResource: 'customers/1234567890/assets/77' });
    await yayinla();
    expect(createVideoBoost.mock.calls[0]?.[1]).toMatchObject({ logo: logoGirdisi });
    expect(refKaydet).toHaveBeenCalledWith(expect.anything(), {
      assetId: LOGO,
      adAccountId: IDS.adAccount,
      platform: 'google',
      ref: 'customers/1234567890/assets/77',
    });
  });

  it('kayıtlı logoda önbelleğe yazma yok', async () => {
    await yayinla();
    expect(refKaydet).not.toHaveBeenCalled();
  });
});

describe('K3: duraklatılmış kur', () => {
  it('istenirse kampanya PAUSED kuruluyor ve mesaj bunu söylüyor', async () => {
    const r = await svc.decide(CTX, KART, true, { texts: METIN, duraklatilmis: true });
    expect(createVideoBoost.mock.calls[0]?.[2]).toEqual({ acilis: 'PAUSED' });
    expect(r.message).toMatch(/DURAKLATILMIŞ/);
    expect((await durum()).applied_settings).toMatchObject({ duraklatilmis: true });
  });

  it('varsayılan açık', async () => {
    await yayinla();
    expect(createVideoBoost.mock.calls[0]?.[2]).toEqual({ acilis: 'ENABLED' });
  });
});

describe('KRİTİK: PROVA — Google yalnızca doğruluyor, hiçbir şey değişmiyor', () => {
  it('KRİTİK: kabul → özet, kart pending kalıyor, yayın çağrısı YOK', async () => {
    const r = await svc.provaGoogle(CTX, KART, { texts: METIN });
    expect(r.ok).toBe(true);
    expect(r.hatalar).toEqual([]);
    expect(r.ozet).toMatchObject({
      gunlukButceMicros: '100000000',
      sureGun: 3,
      konumlar: ['Türkiye'],
      yaslar: [],
      isletmeAdi: 'Ege Birlik',
      adres: 'https://ege.com',
      baslik: 'Yeni proje',
      logo: 'kayitli',
      acilis: 'ENABLED',
      islemSayisi: 6,
    });
    expect((await durum()).status).toBe('pending');
    expect((await durum()).applied_settings).toBeNull();
    expect(createVideoBoost).not.toHaveBeenCalled();
  });

  it('KRİTİK: kartın hedef adresi provaya VE yayına gidiyor (iki projeli workspace, 2026-10-09)', async () => {
    const adres = 'https://gardenvillaskusadasi.com/';
    const r = await svc.provaGoogle(CTX, KART, { texts: METIN, hedefAdres: adres });
    expect(r.ozet.adres).toBe(adres);
    expect(videoBoostProva.mock.calls[0]![1]).toMatchObject({ finalUrl: adres });
    await svc.decide(CTX, KART, true, { texts: METIN, hedefAdres: adres });
    expect(createVideoBoost.mock.calls[0]![1]).toMatchObject({ finalUrl: adres });
  });

  it('KRİTİK: prova ile yayın Google’a AYNI isteği veriyor', async () => {
    await svc.provaGoogle(CTX, KART, { texts: METIN });
    await yayinla();
    const [provaIstek, provaSecenek] = videoBoostProva.mock.calls[0]!.slice(1);
    const [yayinIstek, yayinSecenek] = createVideoBoost.mock.calls[0]!.slice(1);
    const adsiz = (x: { name: string }) => ({ ...x, name: x.name.replace(/\d{1,2}[./]\d{1,2}[./]?\d{0,4}/g, '') });
    expect(adsiz(provaIstek)).toEqual(adsiz(yayinIstek));
    expect(provaSecenek).toEqual(yayinSecenek);
  });

  it('kartta düzenlenen bütçe ve duraklatma provaya gidiyor', async () => {
    const r = await svc.provaGoogle(CTX, KART, {
      budget: { mode: 'daily', amount: '250', durationDays: 5 },
      texts: METIN,
      duraklatilmis: true,
    });
    expect(r.ozet.gunlukButceMicros).toBe('250000000');
    expect(r.ozet.sureGun).toBe(5);
    expect(videoBoostProva.mock.calls[0]?.[2]).toEqual({ acilis: 'PAUSED' });
  });

  it('KRİTİK: Google reddederse alan alan, Türkçe yerle', async () => {
    videoBoostProva.mockRejectedValue(
      new PlatformApiError('google', 'permanent', 'Request contains an invalid argument.', {
        raw: {
          error: {
            details: [
              {
                errors: [
                  {
                    errorCode: { stringLengthError: 'TOO_LONG' },
                    message: 'Too long.',
                    location: {
                      fieldPathElements: [
                        { fieldName: 'mutate_operations', index: 5 },
                        { fieldName: 'ad_group_ad_operation' },
                        { fieldName: 'create' },
                        { fieldName: 'ad' },
                        { fieldName: 'demand_gen_video_responsive_ad' },
                        { fieldName: 'headlines', index: 0 },
                        { fieldName: 'text' },
                      ],
                    },
                  },
                ],
              },
            ],
          },
        },
      }),
    );
    const r = await svc.provaGoogle(CTX, KART, { texts: METIN });
    expect(r.ok).toBe(false);
    expect(r.hatalar).toEqual([
      {
        kod: 'stringLengthError=TOO_LONG',
        mesaj: 'Too long.',
        nerede: 'Reklam › başlık',
        // HAM YOL DA TAŞINIYOR: ilk canlı provada yalnız etiket vardı ve
        // "Reklam › ad" hangi alanın eksik olduğunu söylemedi.
        alan: 'mutate_operations[5].ad_group_ad_operation.create.ad.demand_gen_video_responsive_ad.headlines[0].text',
        ayrinti: null,
      },
    ]);
    expect((await durum()).status).toBe('pending');
  });

  it('alan ayrıntısı yoksa genel mesaj — boş hata listesi yok', async () => {
    videoBoostProva.mockRejectedValue(new PlatformApiError('google', 'permission_denied', 'USER_PERMISSION_DENIED'));
    const r = await svc.provaGoogle(CTX, KART, { texts: METIN });
    expect(r.hatalar).toEqual([
      { kod: 'permission_denied', mesaj: 'USER_PERMISSION_DENIED', nerede: null, alan: null, ayrinti: null },
    ]);
  });

  it('Google yazma kesicisi kapalıyken de prova yapılabiliyor (teşhis için)', async () => {
    await h.q(
      `INSERT INTO ajans_ayari (org_id, google_yazma_durduruldu, google_durdurma_at, google_durdurma_sebebi, updated_at)
       VALUES ($1, true, now(), 'inceleme', now())`,
      [IDS.org],
    );
    await expect(svc.provaGoogle(CTX, KART, { texts: METIN })).resolves.toMatchObject({ ok: true });
  });

  it('prova kanala hesap YAZMIYOR; yayın yazıyor (tek hesap hâli)', async () => {
    hesapKarari = { durum: 'tek-hesap', hesapId: IDS.adAccount };
    await svc.provaGoogle(CTX, KART, { texts: METIN });
    expect(kanalaBagla).not.toHaveBeenCalled();
    await yayinla();
    expect(kanalaBagla).toHaveBeenCalledTimes(1);
  });

  it('kota doluysa prova da Google’a gitmiyor', async () => {
    quotaAcquire.mockResolvedValue({ allowed: false, reason: 'platform_kotasi_dolu', retryAfterMs: 60_000 });
    await expect(svc.provaGoogle(CTX, KART, { texts: METIN })).rejects.toThrow(/kotası şu an dolu/);
    expect(videoBoostProva).not.toHaveBeenCalled();
  });
});
