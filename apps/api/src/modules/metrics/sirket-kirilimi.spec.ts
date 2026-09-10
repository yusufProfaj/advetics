import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MetricsOrganizationRow, TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { MetricsService } from './metrics.service';

/**
 * ═══ ŞİRKET KIRILIMI — AJANS ("TÜM ŞİRKETLER") GÖRÜNÜMÜ ═══
 *
 * Hiyerarşi AJANS › ŞİRKET › WORKSPACE. Bu uç en üst katmanı besliyor ve
 * müşteri kırılımıyla aynı tuzakları taşıyor, bir katman yukarıda:
 *
 *   · ÇİFT SAYIM — `insights_daily` aynı harcamayı DÖRT seviyede tutuyor.
 *     Seviye filtresi düşerse ajans HER ŞİRKETE dört katı harcama raporlar
 *     ve hiçbir yere hata düşmez.
 *   · KAYIP ŞİRKET — harcaması olmayan şirket ana taramadan HİÇ dönmüyor.
 *     Ayrı sorulmazsa yeni açılmış bir şirket ekranda görünmez ve kullanıcı
 *     onu açtığını doğrulayamaz.
 *   · ŞİŞİK SAYAÇ — ajansın tek Meta kimliği yüzlerce hesabı havuza
 *     düşürüyor; havuzu saymak her şirkette aynı anlamsız sayıyı yazardı.
 */
let h: Harness;
let svc: MetricsService;

const ORG_B = 'b0000000-0000-0000-0000-00000000000b';
const ORG_BOS = 'c0000000-0000-0000-0000-00000000000c';
const MUSTERI_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const MUSTERI_ARSIV = 'aaaaaaaa-0000-0000-0000-aaaaaaaaaaaa';
const BAGLANTI_B = 'b3333333-0000-0000-0000-333333333333';
const KULLANICI_B = 'b5555555-0000-0000-0000-555555555555';
const HESAP_B = 'bbbbbbbb-0000-0000-0000-bbbbbbbbbbbb';
const HESAP_ARSIV = 'aaaaaaaa-1111-0000-0000-aaaaaaaaaaaa';
const HESAP_HAVUZ = 'dddddddd-0000-0000-0000-dddddddddddd';
const KAMPANYA_A = '66666666-6666-6666-6666-666666666666';
const GRUP_A = '77777777-7777-7777-7777-777777777777';
const REKLAM_A = '88888888-8888-8888-8888-888888888888';
const KAMPANYA_B = '99999999-9999-9999-9999-999999999999';
const KAMPANYA_ARSIV = 'a9999999-9999-9999-9999-999999999999';

/**
 * BAĞLAM AJANS KAPSAMINDA: `tumSirketler` açık ve `clientIds` her iki
 * şirketin workspace'lerini taşıyor. RLS bu testte kapalı (worker rolü
 * BYPASSRLS taklit ediyor) ama bağlam yine de gerçekçi kuruluyor —
 * `withTenant` sahtesi eksik bağlamda patlıyor.
 */
const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client, MUSTERI_B, MUSTERI_ARSIV],
  isOrgAdmin: true,
  tumSirketler: true,
} as TenantContext;

/** Aynı harcamayı DÖRT seviyeye de yazar — platformun yaptığı şey bu. */
async function metrikYaz(p: {
  clientId: string;
  adAccountId: string;
  platform: 'meta' | 'google';
  campaignId: string;
  date: string;
  spendMicros: string;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  currency?: string;
  yalnizKampanya?: boolean;
}): Promise<void> {
  const seviyeler: Array<[string, string, string]> = p.yalnizKampanya
    ? [['campaign', p.campaignId, 'c']]
    : [
        ['account', p.adAccountId, 'act'],
        ['campaign', p.campaignId, 'c'],
        ['ad_group', GRUP_A, 'g'],
        ['ad', REKLAM_A, 'a'],
      ];
  for (const [level, entityId, externalId] of seviyeler) {
    await h.q(
      `INSERT INTO insights_daily
         (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
          date, breakdown_key, impressions, clicks, spend_micros, conversions,
          conversion_value_micros, currency, reach)
       VALUES ($1,$2,$3::"Platform",$4::"EntityLevel",$5,$6,$7::date,'',$8,$9,$10,$11,0,$12,0)`,
      [
        p.clientId,
        p.adAccountId,
        p.platform,
        level,
        entityId,
        externalId,
        p.date,
        p.impressions ?? 100,
        p.clicks ?? 10,
        p.spendMicros,
        p.conversions ?? 1,
        p.currency ?? 'TRY',
      ],
    );
  }
}

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());

beforeEach(async () => {
  await h.reset();
  // Şirket A: "Test" — seedTenant'ın kurduğu org, workspace ve Meta hesabı.
  await seedTenant(h);

  // Şirket B — AYRI BİR ORGANİZASYON. Ekranın konusu tam olarak birden çok
  // şirketi yan yana göstermek.
  await h.q(
    `INSERT INTO organizations (id, name, slug, updated_at)
     VALUES ($1, 'B Şirketi', 'b-sirketi', now())`,
    [ORG_B],
  );
  // Şirket C — HİÇ WORKSPACE'İ YOK. Yeni açılmış bir şirketin hâli.
  await h.q(
    `INSERT INTO organizations (id, name, slug, updated_at)
     VALUES ($1, 'C Şirketi', 'c-sirketi', now())`,
    [ORG_BOS],
  );

  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $2, 'B Workspace', 'b-workspace', now())`,
    [MUSTERI_B, ORG_B],
  );
  // A şirketinde ARŞİVLENMİŞ bir workspace — verisi toplama girmemeli.
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, status, updated_at)
     VALUES ($1, $2, 'Arşiv Workspace', 'arsiv-workspace', 'archived', now())`,
    [MUSTERI_ARSIV, IDS.org],
  );

  // Bağlantıyı kuran kullanıcı ZORUNLU (`connected_by_user_id NOT NULL`) ve
  // B şirketinin kendi kullanıcısı olmak zorunda.
  await h.q(
    `INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at)
     VALUES ($1, $2, 'b@advetics.com', 'x', 'B Kullanıcı', now())`,
    [KULLANICI_B, ORG_B],
  );
  await h.q(
    `INSERT INTO platform_connections
       (id, org_id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1, $2, NULL, 'google', 'active', 'u2', 'B', '\\x00', '{}', $3, now())`,
    [BAGLANTI_B, ORG_B, KULLANICI_B],
  );
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, sync_enabled, updated_at)
     VALUES ($1,$2,$3,$4,'google','g-1','B hesabı','TRY','Europe/Istanbul',true,now())`,
    [HESAP_B, ORG_B, MUSTERI_B, BAGLANTI_B],
  );
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, sync_enabled, updated_at)
     VALUES ($1,$2,$3,$4,'meta','act_arsiv','Arşiv hesabı','TRY','Europe/Istanbul',true,now())`,
    [HESAP_ARSIV, IDS.org, MUSTERI_ARSIV, IDS.connection],
  );
  /*
   * HAVUZ HESABI — `client_id IS NULL`, yani ajansın gördüğü ama hiçbir
   * workspace'e atanmamış hesap. Sayaçta GÖRÜNMEMELİ.
   */
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, sync_enabled, updated_at)
     VALUES ($1,$2,NULL,$3,'meta','act_havuz','Havuz hesabı','TRY','Europe/Istanbul',true,now())`,
    [HESAP_HAVUZ, IDS.org, IDS.connection],
  );

  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
     VALUES ($1,$2,$3,'meta','c1','A Kampanya','active','daily',now())`,
    [KAMPANYA_A, IDS.adAccount, IDS.client],
  );
  await h.q(
    `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
     VALUES ($1,$2,$3,$4,'meta','g1','A Set','active','none',now())`,
    [GRUP_A, KAMPANYA_A, IDS.adAccount, IDS.client],
  );
  await h.q(
    `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id, name, status, updated_at)
     VALUES ($1,$2,$3,$4,'meta','a1','A Reklam','active',now())`,
    [REKLAM_A, GRUP_A, IDS.adAccount, IDS.client],
  );
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
     VALUES ($1,$2,$3,'google','c2','B Kampanya','active','daily',now())`,
    [KAMPANYA_B, HESAP_B, MUSTERI_B],
  );
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
     VALUES ($1,$2,$3,'meta','c9','Arşiv Kampanya','active','daily',now())`,
    [KAMPANYA_ARSIV, HESAP_ARSIV, MUSTERI_ARSIV],
  );

  const prisma = {
    withTenant: async <T>(ctx: TenantContext, fn: (tx: unknown) => Promise<T>): Promise<T> => {
      if (!ctx?.orgId || !ctx?.userId) throw new Error('Tenant bağlamı olmadan sorgu');
      return fn(h.db);
    },
  } as unknown as PrismaService;
  svc = new MetricsService(prisma);
});

const ARALIK = { from: '2026-08-01', to: '2026-08-31' } as const;

function bul(rows: MetricsOrganizationRow[], ad: string): MetricsOrganizationRow {
  const r = rows.find((x) => x.name === ad);
  if (!r) throw new Error(`${ad} satırı yok — testin dayanağı kayboldu`);
  return r;
}

describe('şirket kırılımı — gruplama ve çift sayım', () => {
  it('harcamayı ŞİRKET bazında ayırıyor — workspace bazında değil', async () => {
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-10',
      spendMicros: '100000000',
      yalnizKampanya: true,
    });
    await metrikYaz({
      clientId: MUSTERI_B,
      adAccountId: HESAP_B,
      platform: 'google',
      campaignId: KAMPANYA_B,
      date: '2026-08-10',
      spendMicros: '250000000',
      yalnizKampanya: true,
    });

    const rows = await svc.byOrganization(CTX, ARALIK);

    /*
     * ŞİRKET SAYISI İDDİA EDİLİYOR. Gruplama anahtarı yanlışlıkla
     * `client_id` olsaydı satır sayısı workspace sayısına eşit olurdu ve
     * tutarlar tek tek doğru görünmeye devam ederdi — hatanın görüneceği
     * tek yer bu sayı.
     */
    expect(rows).toHaveLength(3);
    expect(bul(rows, 'Test').spendMicros).toBe('100000000');
    expect(bul(rows, 'B Şirketi').spendMicros).toBe('250000000');
  });

  it('REGRESYON: dört seviyeye yazılmış harcamayı BİR kez sayar', async () => {
    /*
     * Seviye filtresi kaybolursa 4× çıkıyor ve hiçbir hata düşmüyor —
     * ajans her şirkete dört katı harcama raporlar. Bu ekran para
     * konuşuyor; sessizce yanlış olması en pahalı hâl.
     */
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-10',
      spendMicros: '100000000',
    });

    const rows = await svc.byOrganization(CTX, ARALIK);
    expect(bul(rows, 'Test').spendMicros).toBe('100000000');
  });

  it('platform dağılımının toplamı şirket toplamına EŞİT', async () => {
    // İki platform, aynı şirket: dağılım ayrı hesaplanırsa aynı satırda iki
    // farklı gerçek yazar.
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-10',
      spendMicros: '100000000',
      yalnizKampanya: true,
    });
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'google',
      campaignId: KAMPANYA_A,
      date: '2026-08-11',
      spendMicros: '40000000',
      yalnizKampanya: true,
    });

    const satir = bul(await svc.byOrganization(CTX, ARALIK), 'Test');
    const dagilimToplami = satir.byPlatform.reduce((a, p) => a + BigInt(p.spendMicros), 0n);
    expect(dagilimToplami.toString()).toBe(satir.spendMicros);
    expect(satir.byPlatform.map((p) => p.platform)).toEqual(['meta', 'google']);
  });
});

describe('şirket kırılımı — kaybolmaması gereken satırlar', () => {
  it('HİÇ HARCAMASI OLMAYAN şirket de listeleniyor', async () => {
    // Yalnızca A harcıyor. B ve C ana taramadan HİÇ dönmüyor; ayrı sorgu
    // olmasa ekrandan sessizce düşerlerdi.
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-10',
      spendMicros: '100000000',
      yalnizKampanya: true,
    });

    const rows = await svc.byOrganization(CTX, ARALIK);
    expect(rows.map((r) => r.name).sort()).toEqual(['B Şirketi', 'C Şirketi', 'Test']);
    expect(bul(rows, 'C Şirketi').spendMicros).toBe('0');
    // Harcamayanlar SONDA: sıralama cari dönem harcamasına göre.
    expect(rows[0]?.name).toBe('Test');
  });

  it('WORKSPACE’İ OLMAYAN şirkette clientCount SIFIR', async () => {
    /*
     * `COUNT(cl.id)` kullanılıyor, `COUNT(*)` DEĞİL: `LEFT JOIN` eşleşme
     * bulamayınca da bir satır üretiyor ve `COUNT(*)` onu 1 sayardı — boş
     * bir şirket "1 workspace" görünürdü.
     */
    const rows = await svc.byOrganization(CTX, ARALIK);
    expect(bul(rows, 'C Şirketi').clientCount).toBe(0);
    // A şirketinde iki workspace var ama biri ARŞİVLİ — sayım onu almıyor.
    expect(bul(rows, 'Test').clientCount).toBe(1);
    expect(bul(rows, 'B Şirketi').clientCount).toBe(1);
  });
});

describe('şirket kırılımı — sayıma girmemesi gerekenler', () => {
  it('ARŞİVLENMİŞ workspace’in harcaması şirket toplamına GİRMİYOR', async () => {
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-10',
      spendMicros: '100000000',
      yalnizKampanya: true,
    });
    await metrikYaz({
      clientId: MUSTERI_ARSIV,
      adAccountId: HESAP_ARSIV,
      platform: 'meta',
      campaignId: KAMPANYA_ARSIV,
      date: '2026-08-10',
      spendMicros: '999000000',
      yalnizKampanya: true,
    });

    // Arşiv müşteri kırılımında da elenmiş durumda; iki ekranın farklı
    // toplam göstermesi ikisinin de yanlış sanılması demek.
    expect(bul(await svc.byOrganization(CTX, ARALIK), 'Test').spendMicros).toBe('100000000');
  });

  it('HAVUZ hesabı (client_id NULL) adAccountCount’a girmiyor', async () => {
    /*
     * Ajansın tek Meta kimliği yüzlerce hesap görüyor ve hepsi havuza
     * düşüyor. Havuzu saymak her şirkette aynı şişkin sayıyı yazmak ve
     * gerçekten izlenen hesap sayısını gizlemek olurdu — Genel Bakış'taki
     * "N hesap izlenmiyor" sayacında aynı hata bir kez yaşandı.
     *
     * A şirketinde ÜÇ hesap var: atanmış (seedTenant), arşiv müşterinin
     * hesabı ve HAVUZ. Sayım havuzu almıyor.
     */
    const rows = await svc.byOrganization(CTX, ARALIK);
    expect(bul(rows, 'Test').adAccountCount).toBe(2);
    expect(bul(rows, 'B Şirketi').adAccountCount).toBe(1);
    expect(bul(rows, 'C Şirketi').adAccountCount).toBe(0);
  });

  it('izlemesi KAPALI hesap sayılmıyor', async () => {
    await h.q(`UPDATE ad_accounts SET sync_enabled = false WHERE id = $1`, [HESAP_ARSIV]);
    expect(bul(await svc.byOrganization(CTX, ARALIK), 'Test').adAccountCount).toBe(1);
  });
});

describe('şirket kırılımı — para birimi', () => {
  it('KARIŞIK para biriminde currency null ve birimler listeleniyor', async () => {
    // 1 USD + 1 TRY = 2 ne? Kur çevrimi yok; tutar yerine uyarı gösteriliyor.
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-10',
      spendMicros: '100000000',
      currency: 'TRY',
      yalnizKampanya: true,
    });
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'google',
      campaignId: KAMPANYA_A,
      date: '2026-08-11',
      spendMicros: '5000000',
      currency: 'USD',
      yalnizKampanya: true,
    });

    const satir = bul(await svc.byOrganization(CTX, ARALIK), 'Test');
    expect(satir.currency).toBeNull();
    expect(satir.currencies).toEqual(['TRY', 'USD']);
    // Para birimi taşımayan metrikler toplanmaya DEVAM ediyor.
    expect(satir.clicks).toBe(20);
  });

  it('TEK para biriminde currency dolu', async () => {
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-10',
      spendMicros: '100000000',
      yalnizKampanya: true,
    });
    expect(bul(await svc.byOrganization(CTX, ARALIK), 'Test').currency).toBe('TRY');
  });
});

describe('şirket kırılımı — karşılaştırma penceresi', () => {
  it('önceki dönemde veri yoksa previous NULL', async () => {
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-10',
      spendMicros: '100000000',
      yalnizKampanya: true,
    });

    // Sıfırlı bir nesne döndürmek her yeni şirketi "-%100" gösterirdi.
    const rows = await svc.byOrganization(CTX, {
      ...ARALIK,
      compareFrom: '2026-07-01',
      compareTo: '2026-07-31',
    });
    expect(bul(rows, 'Test').previous).toBeNull();
  });

  it('önceki dönem AYRI toplanıyor — cari döneme karışmıyor', async () => {
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-07-15',
      spendMicros: '30000000',
      yalnizKampanya: true,
    });
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-10',
      spendMicros: '100000000',
      yalnizKampanya: true,
    });

    const satir = bul(
      await svc.byOrganization(CTX, {
        ...ARALIK,
        compareFrom: '2026-07-01',
        compareTo: '2026-07-31',
      }),
      'Test',
    );
    expect(satir.spendMicros).toBe('100000000');
    expect(satir.previous?.spendMicros).toBe('30000000');
  });
});

// -----------------------------------------------------------------------------
// UÇ NOKTA KAYITLI MI
//
// Servis metodunu yazmak yetmiyor: uç eklenmezse panel 404 alır ve ekranda
// "Şirket dağılımı alınamadı" yazar — kod doğru, özellik yok. Nest rota kaydı
// derlemede değil ÇALIŞMA ANINDA çözülüyor, o yüzden kaynak taramasıyla
// kilitleniyor.
// -----------------------------------------------------------------------------
describe('uç nokta kaydı', () => {
  const KAYNAK = readFileSync(resolve(__dirname, 'metrics.controller.ts'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('GET /metrics/organizations kayıtlı ve servise bağlı', () => {
    // İddia YORUMSUZ kaynakta: bu kuralı ANLATAN yorum aynı dosyada duruyor
    // ve `toContain` ikisini ayırt etmiyor.
    expect(KAYNAK).toContain("@Get('organizations')");
    expect(KAYNAK).toContain('this.metrics.byOrganization(ctx, query)');
  });

  it('izin kontrolü var — insights.read', () => {
    /*
     * Dilim `@Get('organizations')`tan metot gövdesinin sonuna kadar
     * çıkarılıyor; sabit uzunluklu bir pencere komşu uç noktanın
     * dekoratörünü yakalar ve iddia kaldırıldığında da geçerdi.
     */
    const bas = KAYNAK.indexOf("@Get('organizations')");
    const son = KAYNAK.indexOf('byOrganization(', bas);
    expect(bas).toBeGreaterThan(-1);
    expect(son).toBeGreaterThan(bas);
    expect(KAYNAK.slice(bas, son)).toContain("@RequirePermissions('insights.read')");
  });
});
