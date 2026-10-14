import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { organikKarsilastirma, type TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { AutoBoostReadService } from './autoboost-read.service';

/*
 * ═══ KARTTA ORGANİK KIYAS (pazar araştırması 2026-10-15) ═══
 * Organikte ortalamanın altında giden gönderiyi boostlamak genelde verimsiz
 * (docs/pazar/akilli-boost.md). Kart artık gönderinin organik erişimini
 * aynı hesabın son on gönderisiyle kıyaslıyor; karar kullanıcıda.
 */
const SIMDI = Date.parse('2026-10-15T12:00:00Z');
const saatOnce = (h: number) => new Date(SIMDI - h * 3_600_000).toISOString();
const o = (erisim: number | null, ort: number | null, ornek = 10) => ({ erisim, etkilesim: null, ortalamaErisim: ort, ortalamaEtkilesim: null, ornek });

describe('organikKarsilastirma', () => {
  it('KRİTİK: 48 saati geçmiş ve ortalamanın %70 altındaysa düşük + verimsiz notu', () => {
    const k = organikKarsilastirma(o(300, 1000), saatOnce(72), SIMDI)!;
    expect(k.dusuk).toBe(true);
    expect(k.metin).toBe('Organik erişim son 10 gönderinin ortalamasının %70 altında · Organikte zayıf giden gönderiyi boostlamak genelde verimsiz');
  });

  it('KRİTİK: yeni gönderi (48 saatten genç) düşük SAYILMAZ, "artabilir" der', () => {
    const k = organikKarsilastirma(o(300, 1000), saatOnce(10), SIMDI)!;
    expect(k.dusuk).toBe(false);
    expect(k.metin).toContain('gönderi yeni, erişim artabilir');
  });

  it('üstündeyse bunu söyler, uyarı yok', () => {
    const k = organikKarsilastirma(o(1500, 1000), saatOnce(72), SIMDI)!;
    expect(k).toEqual({ metin: 'Organik erişim son 10 gönderinin ortalamasının %50 üstünde', dusuk: false });
  });

  it('veri yetmiyorsa satır YOK (tahmin yok)', () => {
    expect(organikKarsilastirma(null, saatOnce(72), SIMDI)).toBeNull();
    expect(organikKarsilastirma(o(null, 1000), saatOnce(72), SIMDI)).toBeNull();
    expect(organikKarsilastirma(o(300, 1000, 2), saatOnce(72), SIMDI)).toBeNull();
    expect(organikKarsilastirma(o(300, 0), saatOnce(72), SIMDI)).toBeNull();
  });
});

let h: Harness;
const PROFIL = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], activeClientId: IDS.client, isOrgAdmin: true } as TenantContext;

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
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, sync_enabled, updated_at)
     VALUES ($1,$2,$3,$4,'instagram_business','ig-1','Sayfa',true,now())`,
    [PROFIL, IDS.org, IDS.client, IDS.connection],
  );
});

async function gonderi(dis: string, reach: number, gunOnce: number) {
  await h.q(
    `INSERT INTO organic_posts (id, org_id, client_id, social_profile_id, external_id, media_type, message, published_at,
       impressions, reach, likes, comments, shares, saves, video_views, engagements, updated_at)
     VALUES (gen_random_uuid(),$1,$2,$3,$4,'photo','x', now() - ($5::int * interval '1 day'),1,$6,0,0,0,0,0,$7,now())`,
    [IDS.org, IDS.client, PROFIL, dis, gunOnce, reach, reach / 10],
  );
}

describe('kart sorgusu organik sayıları taşıyor', () => {
  it('KRİTİK: ortalama kartın KENDİ gönderisini dışarıda bırakıyor', async () => {
    await gonderi('kart', 100, 0);
    for (const [i, r] of [1000, 2000, 3000].entries()) await gonderi(`eski${i}`, r, i + 1);
    await h.q(
      `INSERT INTO auto_boost_queue_items (id, org_id, client_id, platform, social_profile_id, external_id, title, status, created_at, updated_at)
       VALUES (gen_random_uuid(),$1,$2,'meta',$3,'kart','Başlık','pending',now(),now())`,
      [IDS.org, IDS.client, PROFIL],
    );
    const prisma = { withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
    const [kart] = (await new AutoBoostReadService(prisma).listQueue(CTX, IDS.client)).items;
    expect(kart!.organik).toEqual({ erisim: 100, etkilesim: 10, ortalamaErisim: 2000, ortalamaEtkilesim: 200, ornek: 3 });
  });
});

describe('kart satırı (kaynak taraması)', () => {
  it('yalnız onay bekleyen kartta ve ortak karar fonksiyonundan', () => {
    const k = readFileSync(join(__dirname, '../../../../web/src/components/autoboost/bildirim-havuzu.tsx'), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(k).toContain("kayit.status === 'pending' &&");
    expect(k).toContain('const k = organikKarsilastirma(kayit.organik, kayit.publishedAt);');
  });
});
