import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AJANS_UST_HESAP, createHarness, IDS, seedAjans, seedTenant, type Harness } from '../../test/pglite-harness';
import { planMetni, temizlikPlani, temizlikUygula, type Sorgucu } from '../../prisma/yinelenen-baglanti-karari';

/**
 * ═══ YİNELENEN GOOGLE BAĞLANTISI TEMİZLİĞİ — ÇALIŞTIRILARAK ═══
 *
 * Üretimdeki hâlin küçük kopyası: ajansın Google bağlantısı ajans
 * şirketinde; müşteri şirketinde aynı kişinin açtığı KOPYA bağlantı ve onun
 * keşfiyle yazılmış havuz satırları. Betik yalnız güvenle silinebileni
 * siliyor; her atlamanın sebebi ayrı sayılıyor.
 */
const MUSTERI_ORG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MUSTERI_WS = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const EGE_ORG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const EGE_WS = 'b1b1b1b1-b1b1-4b1b-8b1b-b1b1b1b1b1b1';
const KOPYA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const H_KOPYA = 'a0000000-0000-4000-8000-000000000001'; // silinecek
const H_ONCEDEN = 'a0000000-0000-4000-8000-000000000002'; // kopyadan önce vardı
const H_BAGIMLI = 'a0000000-0000-4000-8000-000000000003'; // sync_jobs satırı var
const H_KARSILIKSIZ = 'a0000000-0000-4000-8000-000000000004'; // ajansta yok
const H_ATANMIS = 'a0000000-0000-4000-8000-000000000005'; // atanmış: dokunma
const H_AJANS_ATANMIS_KOPYASI = 'a0000000-0000-4000-8000-000000000006'; // karşılığı ajansın ATADIĞI hesap

let h: Harness;
const db = () => h.db as unknown as Sorgucu;

const hesap = (id: string, ext: string, olusma: string, client: string | null = null) =>
  h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, sync_enabled, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'google', $5, 'Kopya', 'TRY', 'Europe/Istanbul', false, $6, now())`,
    [id, MUSTERI_ORG, client, KOPYA, ext, olusma],
  );

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  // Ajans: IDS.org, bağlantı IDS.connection (havuz), atanmış hesabı 5550000001.
  await seedTenant(h, { platform: 'google', externalId: '5550000001' });
  await seedAjans(h);
  await h.q(`UPDATE platform_connections SET client_id = NULL, external_user_id = '9608136521' WHERE id = $1`, [IDS.connection]);
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, sync_enabled, updated_at)
     VALUES (gen_random_uuid(), $1, NULL, $2, 'google', '5550000002', 'Ajans havuz', 'TRY', 'Europe/Istanbul', false, now()),
            (gen_random_uuid(), $1, NULL, $2, 'google', '5550000003', 'Ajans havuz', 'TRY', 'Europe/Istanbul', false, now()),
            (gen_random_uuid(), $1, NULL, $2, 'google', '5550000005', 'Ajans havuz', 'TRY', 'Europe/Istanbul', false, now())`,
    [IDS.org, IDS.connection],
  );
  await h.q(`INSERT INTO organizations (id, name, slug, manager_account_id, updated_at) VALUES ($1, 'Metropol', 'metropol', $2, now())`, [MUSTERI_ORG, AJANS_UST_HESAP]);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Metropol WS', 'metropol-ws', now())`, [MUSTERI_WS, MUSTERI_ORG]);
  /*
   * Ajansın BAŞKA bir müşteriye (Ege) atadığı hesap: ödünç satır Ege
   * şirketinde, ajans şirketinde değil. Kopya keşif Metropol'de onun için
   * ayrı satır açtı (Metropol'de o hesabın satırı yoktu).
   */
  await h.q(`INSERT INTO organizations (id, name, slug, manager_account_id, updated_at) VALUES ($1, 'Ege', 'ege', $2, now())`, [EGE_ORG, AJANS_UST_HESAP]);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Ege WS', 'ege-ws', now())`, [EGE_WS, EGE_ORG]);
  await h.q(`UPDATE ad_accounts SET org_id = $2, client_id = $3 WHERE id = $1`, [IDS.adAccount, EGE_ORG, EGE_WS]);
  // KOPYA bağlantı 10:05'te açıldı.
  await h.q(
    `INSERT INTO platform_connections (id, org_id, client_id, platform, status, external_user_id, account_label, access_token_enc, granted_scopes, connected_by_user_id, created_at, updated_at)
     VALUES ($1, $2, NULL, 'google', 'active', '103389823382444834376', 'Google Ads', '\\x01', '{a,b}', $3, '2026-10-13T10:05:00Z', now())`,
    [KOPYA, MUSTERI_ORG, IDS.user],
  );
  await hesap(H_KOPYA, '5550000002', '2026-10-13T10:05:10Z');
  await hesap(H_ONCEDEN, '5550000003', '2026-10-01T00:00:00Z');
  await hesap(H_BAGIMLI, '5550000005', '2026-10-13T10:05:10Z');
  await hesap(H_KARSILIKSIZ, '7770000001', '2026-10-13T10:05:10Z');
  // Karşılığı ajansın BAŞKA şirkete atadığı hesap — ödünç satır ajans şirketinde değil.
  await h.q(`UPDATE ad_accounts SET external_id = '5550000009' WHERE id = $1`, [IDS.adAccount]);
  await hesap(H_AJANS_ATANMIS_KOPYASI, '5550000009', '2026-10-13T10:05:10Z');
  await h.q(`INSERT INTO sync_jobs (client_id, ad_account_id, job_type, status) VALUES ($1, $2, 'structure', 'succeeded')`, [MUSTERI_WS, H_BAGIMLI]);
});

describe('KRİTİK: plan', () => {
  it('yalnız güvenli kopya silinecek; her atlama sebebiyle ayrı', async () => {
    const plan = await temizlikPlani(db(), [KOPYA]);
    const b = plan.baglantilar[0]!;
    expect(new Set(b.hesaplar.silinecek)).toEqual(new Set([H_KOPYA, H_AJANS_ATANMIS_KOPYASI]));
    expect(b.hesaplar.atlanan.oncedenVardi).toEqual([H_ONCEDEN]);
    expect(b.hesaplar.atlanan.bagimliVar.map((x) => x.id)).toEqual([H_BAGIMLI]);
    // FK'sız kolon da yakalandı: tablolar katalogdan okunuyor.
    expect(b.hesaplar.atlanan.bagimliVar[0]!.tablolar).toContain('sync_jobs.ad_account_id');
    expect(b.hesaplar.atlanan.ajanstaKarsiligiYok).toEqual([H_KARSILIKSIZ]);
    expect(b.iptal.yapilacak).toBe(true);
    expect(planMetni(plan)).toContain('TOPLAM: silinecek reklam hesabı 2');
  });

  it('KRİTİK: ajansın KENDİ bağlantısı ve bilinmeyen kimlik reddediliyor', async () => {
    const plan = await temizlikPlani(db(), [IDS.connection, 'ffffffff-ffff-4fff-8fff-ffffffffffff']);
    expect(plan.baglantilar).toEqual([]);
    expect(plan.reddedilen.map((r) => r.sebep)).toEqual([expect.stringContaining('AJANS şirketinde'), 'bağlantı bulunamadı']);
  });

  it('KRİTİK: kopyaya atanmış satır varsa satıra dokunulmaz ve bağlantı iptal edilmez', async () => {
    await hesap(H_ATANMIS, '5550000099', '2026-10-13T10:05:10Z', MUSTERI_WS);
    const b = (await temizlikPlani(db(), [KOPYA])).baglantilar[0]!;
    expect(b.hesaplar.atanmis).toEqual([H_ATANMIS]);
    expect(b.iptal).toMatchObject({ yapilacak: false });
  });
});

describe('KRİTİK: uygulama', () => {
  it('siler, iptal eder; atlananlar ve ajansın satırları yerinde', async () => {
    const plan = await temizlikPlani(db(), [KOPYA]);
    const sonuc = await temizlikUygula(db(), plan);
    expect(sonuc).toEqual({ silinenHesap: 2, silinenProfil: 0, iptalEdilen: 1 });

    const kalan = (await h.q<{ id: string }>(`SELECT id::text FROM ad_accounts WHERE connection_id = $1 ORDER BY id`, [KOPYA])).map((r) => r.id);
    expect(kalan).toEqual([H_ONCEDEN, H_BAGIMLI, H_KARSILIKSIZ].sort());
    expect((await h.q<{ n: number }>(`SELECT count(*)::int AS n FROM ad_accounts WHERE connection_id = $1`, [IDS.connection]))[0]!.n).toBe(4);
    const [k] = await h.q<{ status: string; revoked: boolean; scopes: string[] }>(
      `SELECT status::text, revoked_at IS NOT NULL AS revoked, granted_scopes AS scopes FROM platform_connections WHERE id = $1`,
      [KOPYA],
    );
    expect(k).toEqual({ status: 'revoked', revoked: true, scopes: [] });
    const [a] = await h.q<{ status: string }>(`SELECT status::text FROM platform_connections WHERE id = $1`, [IDS.connection]);
    expect(a!.status).toBe('active');
  });

  it('plan ile uygulama arasında atanan satır silinmiyor (SQL koşulu yeniden soruyor)', async () => {
    const plan = await temizlikPlani(db(), [KOPYA]);
    await h.q(`UPDATE ad_accounts SET client_id = $2 WHERE id = $1`, [H_KOPYA, MUSTERI_WS]);
    await temizlikUygula(db(), plan);
    expect((await h.q(`SELECT 1 FROM ad_accounts WHERE id = $1`, [H_KOPYA])).length).toBe(1);
  });
});

describe('betik varsayılan olarak yazmıyor', () => {
  it('uygulama yalnız --uygula ile ve tek transaction içinde', () => {
    const src = readFileSync(join(__dirname, '../../prisma/yinelenen-baglanti-temizle.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).toContain("const UYGULA = process.argv.includes('--uygula');");
    const bas = src.indexOf('if (!UYGULA) {');
    if (bas < 0) throw new Error('kuru dal bulunamadı');
    const kuru = src.slice(bas, src.indexOf('}', bas));
    expect(kuru).not.toContain('temizlikUygula');
    expect(src).toMatch(/\$transaction\([\s\S]*temizlikPlani\(tx[\s\S]*temizlikUygula\(tx/);
  });
});
