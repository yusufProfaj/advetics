import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { KURULUM_HATA_KODLARI, OTOMATIK_SIRA, eksikleriTamamlaKapsami, type TenantContext } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { GOOGLE_OLCUM_SCOPES } from '../connections/providers/google.provider';
import { AdsKurulumIstemcisi } from './ads-kurulum';
import { KurulumController } from './kurulum.controller';
import { KurulumService, hesapYetkisi, kullanilmayanAdimlar, kullanilmayanOku, platformBeyaniOku } from './kurulum.service';

/**
 * ═══ KULLANILMAYAN PLATFORM BEYANI + KURULUM HESAP KAPISI ═══
 * (docs/panel-sadelestirme/MIMARI.md Ç-6, Ç-20)
 *
 * Üç iddia, üçü de sessiz bir hatanın kilidi:
 *   1. Beyan GERÇEKTEN saklanıyor ve okuma onu döndürüyor (panelin sayacı
 *      bunu okuyor; yanıtta `[]` sabit kalsaydı beyan kaydedilir ama hiçbir
 *      şey değişmezdi).
 *   2. "Eksikleri tamamla" kullanılmayan platformun adımına DOKUNMUYOR
 *      (Google'ı kullanmayan workspace'te Google Ads dönüşümü açmak).
 *   3. Kurulum'dan hesap seçmek havuz atamasıyla AYNI kapı
 *      (`connection.manage` olmadan havuzdan hesap alınamıyor).
 */
const GOOGLE_BAGLANTI = '77777777-7777-4777-8777-777777777777';
const GOOGLE_HESAP = '88888888-8888-4888-8888-888888888888';

let h: Harness;
let svc: KurulumService;
const kayit = vi.fn();
const ctx = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  permissions: ['client.read', 'client.write', 'connection.write', 'connection.manage'],
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
  await seedTenant(h, { platform: 'meta' });
  await h.q(`UPDATE clients SET website = 'https://ornek.com' WHERE id = $1`, [IDS.client]);
  await h.q(
    `INSERT INTO platform_connections (id, org_id, client_id, platform, status, external_user_id, account_label, access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1, $2, $3, 'google', 'active', 'g1', 'G', '\\x00', $4, $5, now())`,
    [GOOGLE_BAGLANTI, IDS.org, IDS.client, ['https://www.googleapis.com/auth/adwords', ...GOOGLE_OLCUM_SCOPES], IDS.user],
  );
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, sync_enabled, updated_at)
     VALUES ($1, $2, $3, $4, 'google', '1234567890', 'G hesap', 'TRY', 'Europe/Istanbul', true, now())`,
    [GOOGLE_HESAP, IDS.org, IDS.client, GOOGLE_BAGLANTI],
  );
  kayit.mockReset();
  const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
  svc = new KurulumService(
    prisma,
    { refreshAccounts: vi.fn(), assignAdAccount: vi.fn() } as never,
    { getAccessToken: vi.fn().mockResolvedValue('tok') } as never,
    { get: vi.fn().mockReturnValue({}) } as never,
    { durum: vi.fn().mockResolvedValue({ site: { durum: 'ulasilamadi', adres: 'https://ornek.com', hata: 'x', tagManager: [], analytics: [], metaPiksel: [], altyapi: null, tagManagerOkunamayan: [] } }) } as never,
    { record: kayit } as never,
    { platforms: { google: { developerToken: 'dev', apiVersion: 'v25' }, meta: { apiVersion: 'v25.0' } } } as never,
    { kurulumdanBagla: vi.fn().mockResolvedValue(null) } as never,
  );
});

const satir = async () =>
  (await h.q<{ kullanilmayan_platformlar: string[] }>(`SELECT kullanilmayan_platformlar FROM workspace_kurulum WHERE client_id = $1`, [IDS.client]))[0];

describe('beyan saklanıyor ve okunuyor', () => {
  it('KRİTİK: PUT beyanı yazar; okuma yanıtı onu döndürür; boş liste geri alır', async () => {
    expect((await svc.oku(ctx, IDS.client)).kullanilmayanPlatformlar).toEqual([]);
    const y = await svc.platformlar(ctx, IDS.client, ['google'], {});
    expect(y.kullanilmayanPlatformlar).toEqual(['google']);
    expect((await satir())!.kullanilmayan_platformlar).toEqual(['google']);
    expect((await svc.oku(ctx, IDS.client)).kullanilmayanPlatformlar).toEqual(['google']);
    expect((await svc.platformlar(ctx, IDS.client, [], {})).kullanilmayanPlatformlar).toEqual([]);
    expect((await satir())!.kullanilmayan_platformlar).toEqual([]);
  });

  it('denetim kaydı düşülür (geri alınabilir bir karar ama kimin verdiği bilinmeli)', async () => {
    await svc.platformlar(ctx, IDS.client, ['meta'], {});
    expect(kayit).toHaveBeenCalledWith(expect.anything(), ctx, expect.objectContaining({ action: 'kurulum.platform_beyani', after: { kullanilmayanlar: ['meta'] } }));
  });

  it('başka bir kurulum alanını EZMİYOR (yalnız kendi kolonu)', async () => {
    await h.q(`INSERT INTO workspace_kurulum (client_id, org_id, hesap_sahibi, gtm_kimligi) VALUES ($1, $2, 'ajans', 'GTM-ABCD12')`, [IDS.client, IDS.org]);
    await svc.platformlar(ctx, IDS.client, ['meta'], {});
    const r = (await h.q<Record<string, unknown>>(`SELECT hesap_sahibi, gtm_kimligi FROM workspace_kurulum WHERE client_id = $1`, [IDS.client]))[0]!;
    expect(r).toEqual({ hesap_sahibi: 'ajans', gtm_kimligi: 'GTM-ABCD12' });
  });

  it('aktif workspace dışında yazılmaz (kurulumun diğer yazmalarıyla aynı kural)', async () => {
    await expect(svc.platformlar({ ...ctx, activeClientId: null } as TenantContext, IDS.client, ['meta'], {})).rejects.toThrow(/önce üstten/);
    await expect(svc.platformlar({ ...ctx, clientIds: [] } as TenantContext, IDS.client, ['meta'], {})).rejects.toThrow(/erişimin yok/);
  });

  it('okuyucu tanınmayan değeri atar (eski/bozuk satır ekranda uydurma platform yazdırmasın)', () => {
    expect(kullanilmayanOku({ kullanilmayan_platformlar: ['google', 'tiktok'] })).toEqual(['google']);
    expect(kullanilmayanOku({ kullanilmayan_platformlar: null })).toEqual([]);
    expect(kullanilmayanOku({})).toEqual([]);
  });
});

/** Reddin GÖVDESİ — panel 409'un iki anlamını `code` ile ayırıyor. */
async function kodu(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
  } catch (e) {
    if (!(e instanceof ConflictException)) throw e;
    const r = e.getResponse() as { code?: string };
    return r.code ?? null;
  }
  throw new Error('reddedilmedi');
}

describe('platform beyanının izi — kim, ne zaman (entegrasyon, MIMARI § 15)', () => {
  const iz = async () =>
    (await h.q<{ e: string | null; t: Date | null }>(`SELECT platform_beyan_eden AS e, platform_beyan_tarihi AS t FROM workspace_kurulum WHERE client_id = $1`, [IDS.client]))[0];

  it('KRİTİK: beyan izi beyanla AYNI deyimde yazılır, yanıtta kim/ne zaman; beyan kalkınca iz de kalkar', async () => {
    const once = Date.now();
    const y = await svc.platformlar(ctx, IDS.client, ['google'], {});
    expect(y.platformBeyani?.beyanEden?.id).toBe(IDS.user);
    expect(typeof y.platformBeyani?.beyanEden?.ad).toBe('string');
    expect(Date.parse(y.platformBeyani!.tarih!)).toBeGreaterThanOrEqual(once - 1000);
    expect((await iz())!.e).toBe(IDS.user);
    expect((await svc.oku(ctx, IDS.client)).platformBeyani).toEqual(y.platformBeyani);
    const geri = await svc.platformlar(ctx, IDS.client, [], {});
    expect(geri.platformBeyani).toBeNull();
    expect(await iz()).toEqual({ e: null, t: null });
  });

  it('iz kolonlarından ÖNCE verilmiş beyan: tarih UYDURULMAZ (null), beyan yine görünür', async () => {
    await h.q(`INSERT INTO workspace_kurulum (client_id, org_id, kullanilmayan_platformlar) VALUES ($1, $2, ARRAY['meta'])`, [IDS.client, IDS.org]);
    expect((await svc.oku(ctx, IDS.client)).platformBeyani).toEqual({ beyanEden: null, tarih: null });
    expect(platformBeyaniOku({ kullanilmayan_platformlar: [] , platform_beyan_eden: IDS.user })).toBeNull();
  });

  it('KRİTİK: kullanıcı silinince beyan KALIR, ad bilinmiyor olur (ON DELETE SET NULL)', async () => {
    await svc.platformlar(ctx, IDS.client, ['meta'], {});
    const [fk] = await h.q<{ d: string }>(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'workspace_kurulum_platform_beyan_eden_fkey'`);
    expect(fk!.d).toMatch(/REFERENCES users\(id\) ON UPDATE CASCADE ON DELETE SET NULL/);
  });
});

describe('409 KODLARI — panel metne değil koda bakıyor (entegrasyon)', () => {
  it('KRİTİK: seçili workspace değilse KURULUM_WORKSPACE_SECILMELI', async () => {
    expect(await kodu(svc.platformlar({ ...ctx, activeClientId: null } as TenantContext, IDS.client, ['meta'], {}))).toBe(KURULUM_HATA_KODLARI.workspaceSecilmeli);
    expect(await kodu(svc.tamamla({ ...ctx, activeClientId: null } as TenantContext, IDS.client, {}))).toBe(KURULUM_HATA_KODLARI.workspaceSecilmeli);
  });

  it('KRİTİK: aynı workspace\'te işlem sürerken KURULUM_SURUYOR (yoklamaya çevrilen TEK kod)', async () => {
    (svc as unknown as { calisan: Set<string> }).calisan.add(IDS.client);
    expect(await kodu(svc.tamamla(ctx, IDS.client, {}))).toBe(KURULUM_HATA_KODLARI.suruyor);
  });
});

describe('veritabanı son savunma hattı', () => {
  it('KRİTİK: tanınmayan platform ve iki platform birden REDDEDİLİYOR', async () => {
    await h.q(`INSERT INTO workspace_kurulum (client_id, org_id) VALUES ($1, $2)`, [IDS.client, IDS.org]);
    await expect(h.q(`UPDATE workspace_kurulum SET kullanilmayan_platformlar = ARRAY['tiktok'] WHERE client_id = $1`, [IDS.client])).rejects.toThrow(/kullanilmayan_kume/);
    await expect(h.q(`UPDATE workspace_kurulum SET kullanilmayan_platformlar = ARRAY['meta','google'] WHERE client_id = $1`, [IDS.client])).rejects.toThrow(/en_cok_bir/);
  });

  it('KRİTİK: ÜRETİM SIRASI — eski satırlar migration\'dan sonra boş beyanla kalır, kısıtlar kurulur', async () => {
    /*
     * pglite-harness şemayı BÜTÜN migration'lardan kuruyor; üretimde ise
     * satırlar migration'dan ÖNCE duruyor. Sırayı elle kur: kolonu (ve ona
     * bağlı kısıtları) düşür, eski bir satır yaz, migration'ı yeniden uygula.
     */
    await h.pg.exec(`ALTER TABLE workspace_kurulum DROP COLUMN kullanilmayan_platformlar`);
    await h.q(`INSERT INTO workspace_kurulum (client_id, org_id, hesap_sahibi) VALUES ($1, $2, 'sirket')`, [IDS.client, IDS.org]);
    await h.pg.exec(
      readFileSync(join(__dirname, '../../../prisma/migrations/20261016400000_kurulum_kullanilmayan_platformlar/migration.sql'), 'utf8'),
    );
    expect((await satir())!.kullanilmayan_platformlar).toEqual([]);
    await expect(h.q(`UPDATE workspace_kurulum SET kullanilmayan_platformlar = ARRAY['meta','google']`)).rejects.toThrow(/en_cok_bir/);
  });
});

describe('"Eksikleri tamamla" kullanılmayan platforma dokunmuyor', () => {
  it('KRİTİK: Google kullanılmıyorsa Google Ads dönüşümü ve Analytics ↔ Ads bağı DENENMİYOR', async () => {
    const donusumListesi = vi.spyOn(AdsKurulumIstemcisi.prototype, 'donusumIslemleri').mockResolvedValue([]);
    vi.spyOn(AdsKurulumIstemcisi.prototype, 'harcamaVar').mockResolvedValue(false);
    // Platforma GERÇEKTEN çıkmasın: karşı örnekte adım işlem açmaya kadar gidiyor.
    vi.spyOn(AdsKurulumIstemcisi.prototype, 'donusumAc').mockResolvedValue('customers/1234567890/conversionActions/9');
    vi.spyOn(AdsKurulumIstemcisi.prototype, 'gonderAdresiOku').mockResolvedValue(null);
    // Analytics ↔ Ads bağı kurulu (gerçek ağa çıkmasın); dönüşüm adımı tetik
    // seçili olduğu için OTOMATİK — beyan yoksa "Eksikleri tamamla" onu dener.
    await h.q(
      `INSERT INTO workspace_kurulum (client_id, org_id, ga4_mulk_id, ga4_olcum_kimligi, ga4_ads_bagli, donusum_tetigi)
       VALUES ($1, $2, '1', 'G-ABC1234', true, '{"formYolu": "/tesekkurler", "telefon": false, "whatsapp": false}')`,
      [IDS.client, IDS.org],
    );

    const beyanli = await (async () => {
      await svc.platformlar(ctx, IDS.client, ['google'], {});
      return svc.tamamla(ctx, IDS.client, {});
    })();
    const kodlar = beyanli.sonuclar.map((s) => s.kod);
    expect(kodlar).not.toContain('ads_donusum');
    expect(kodlar).not.toContain('ga4_ads_bag');
    expect(donusumListesi).not.toHaveBeenCalled();

    // KARŞI ÖRNEK: beyan kaldırılınca aynı adım denenir (iddia boşa düşmüyor).
    await svc.platformlar(ctx, IDS.client, [], {});
    const beyansiz = await svc.tamamla(ctx, IDS.client, {});
    expect(beyansiz.sonuclar.map((s) => s.kod)).toContain('ads_donusum');
  });

  it('adım → platform eşlemesi panelin tek listesinden türüyor (ikinci tablo yok)', () => {
    expect([...kullanilmayanAdimlar(['google'])].sort()).toEqual(['ads_donusum', 'ga4_ads_bag', 'google_hesap', 'google_odeme']);
    expect([...kullanilmayanAdimlar(['meta'])].sort()).toEqual(['meta_hesap', 'meta_odeme', 'meta_piksel', 'sayfa']);
    expect(kullanilmayanAdimlar([]).size).toBe(0);
    // Panelin düğme kapsamıyla AYNI küme: Google kullanılmıyorsa panel de bu
    // kodların hiçbirini "düğme yapar" saymıyor.
    const otomatikHepsi = OTOMATIK_SIRA.map((kod) => ({ kod, otomatik: true }));
    const panel = eksikleriTamamlaKapsami({
      kurulum: { adimlar: otomatikHepsi } as never,
      hazirlama: null,
      hazirlik: null,
      kullanilmayanlar: ['google'],
      beyanlar: [],
    }).kurulumAdimlari;
    for (const k of kullanilmayanAdimlar(['google'])) expect(panel).not.toContain(k);
  });
});

describe('Kurulum hesap kapısı = havuz atama kapısı (Ç-20)', () => {
  it('KRİTİK: connection.manage olmadan hesap seçilemez ve seçenekler listelenemez', async () => {
    const dar = { ...ctx, permissions: ['client.read', 'client.write', 'connection.write'] } as unknown as TenantContext;
    await expect(svc.adim(dar, IDS.client, { kod: 'google_hesap', secim: { tur: 'mevcut', adAccountId: GOOGLE_HESAP } }, {})).rejects.toThrow(/bağlantı yönetme yetkisi/);
    await expect(svc.adim(dar, IDS.client, { kod: 'sayfa', sayfaId: GOOGLE_HESAP }, {})).rejects.toThrow(/bağlantı yönetme yetkisi/);
    await expect(svc.secenekler(dar, IDS.client, 'meta_hesap')).rejects.toThrow(/bağlantı yönetme yetkisi/);
  });

  it('hesapYetkisi ikisini birden istiyor', () => {
    expect(hesapYetkisi({ permissions: ['connection.write', 'connection.manage'] } as never)).toBe(true);
    expect(hesapYetkisi({ permissions: ['connection.write'] } as never)).toBe(false);
    expect(hesapYetkisi({ permissions: ['connection.manage'] } as never)).toBe(false);
  });
});

describe('uç', () => {
  it('PUT /clients/:id/kurulum/platformlar client.write ile ve sözleşme şemasıyla', () => {
    const kaynak = readFileSync(join(__dirname, 'kurulum.controller.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const i = kaynak.indexOf("@Put('platformlar')");
    if (i < 0) throw new Error('uç bulunamadı');
    const dilim = kaynak.slice(i, kaynak.indexOf('}', kaynak.indexOf('platformlar(', i)));
    expect(dilim).toContain("@RequirePermissions('client.write')");
    expect(dilim).toContain('zodBody(kurulumPlatformBeyaniSchema)');
    expect(typeof KurulumController.prototype.platformlar).toBe('function');
  });
});
