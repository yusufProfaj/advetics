import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SPECIAL_AD_CATEGORIES,
  restrictTargetingFor,
  type SimpleDraftInput,
  type TenantContext,
} from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { DraftPublishService } from './draft-publish.service';
import { DraftTreeService } from './draft-tree.service';

/**
 * Özel reklam kategorileri.
 *
 * NEDEN KRİTİK: konut, istihdam ve kredi reklamları düzenlemeye tabi ve
 * kategori beyan edilmeden yayınlanan reklam politika ihlali. CEZASI KAMPANYA
 * SEVİYESİNDE DEĞİL, HESAP SEVİYESİNDE — yani bir müşteri için unutulan
 * beyan, ajansın o reklam hesabındaki bütün kampanyalarını riske atıyor.
 *
 * Bugüne kadar üç yazma yolunda da sabit `[]` gidiyordu.
 */

let h: Harness;
let tree: DraftTreeService;
let svc: DraftPublishService;

const publishDraft = vi.fn();
const canWrite = vi.fn();
const ensureExternalRef = vi.fn();

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const PAGE = '66666666-6666-6666-6666-666666666666';
const CREATIVE = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
const ASSET = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';

function input(patch: Partial<SimpleDraftInput> = {}): SimpleDraftInput {
  return {
    clientId: IDS.client,
    name: 'Konut Kampanyası',
    goal: 'whatsapp',
    targets: [{ platform: 'meta', adAccountId: IDS.adAccount, dailyBudget: '200' }],
    socialProfileId: PAGE,
    creativeId: CREATIVE,
    durationDays: 7,
    ...patch,
  };
}

beforeAll(async () => {
  h = await createHarness();
  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;
  tree = new DraftTreeService(prisma);
  svc = new DraftPublishService(
    prisma,
    tree,
    { get: () => ({ platform: 'meta', publishDraft, canWrite }) } as never,
    { getAccessToken: async () => 'token' } as never,
    { acquire: async () => ({ allowed: true, usagePercent: 5 }), record: async () => {} } as never,
    { ensureExternalRef } as never,
  );
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO social_profiles
       (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', 'page-1', 'Sayfa', now())`,
    [PAGE, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(
    `INSERT INTO ad_creatives (id, org_id, client_id, name, texts, updated_at)
     VALUES ($1, $2, $3, 'Kreatif',
             '{"primaryText":"Metin","headlines":["Başlık"],"longHeadlines":[],"descriptions":["Açıklama"]}'::jsonb,
             now())`,
    [CREATIVE, IDS.org, IDS.client],
  );
  await h.q(
    `INSERT INTO assets
       (id, org_id, client_id, kind, name, file_name, mime_type, byte_size,
        width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $2, $3, 'image', 'Kare', 'a.jpg', 'image/jpeg', 100, 1080, 1080,
             'k/a', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', now())`,
    [ASSET, IDS.org, IDS.client],
  );
  await h.q(
    `INSERT INTO ad_creative_assets (id, org_id, creative_id, asset_id, position)
     VALUES (gen_random_uuid(), $1, $2, $3, 0)`,
    [IDS.org, CREATIVE, ASSET],
  );

  publishDraft.mockReset();
  canWrite.mockReset();
  ensureExternalRef.mockReset();
  canWrite.mockReturnValue({ ok: true, missing: [] });
  ensureExternalRef.mockResolvedValue('hash-1');
  publishDraft.mockResolvedValue({
    campaignId: 'c-1',
    adSetId: 'as-1',
    creativeId: 'cr-1',
    adId: 'ad-1',
  });
});

async function kategoriAta(...kategoriler: string[]): Promise<void> {
  await h.q(`UPDATE clients SET special_ad_categories = $1::text[] WHERE id = $2`, [
    kategoriler,
    IDS.client,
  ]);
}

describe('beyan platforma gidiyor', () => {
  it('KRİTİK: müşterinin kategorisi yayın isteğine giriyor', async () => {
    /**
     * Bugüne kadar sabit `[]` gidiyordu — yani emlak müşterisi olan bir
     * ajans, farkında olmadan her kampanyada politika ihlali üretiyordu.
     */
    await kategoriAta('HOUSING');
    const c = await tree.createFromSimple(CTX, input());
    await svc.publish(CTX, c.campaigns[0]!.id);

    const req = publishDraft.mock.calls[0]![1] as { specialAdCategories: string[] };
    expect(req.specialAdCategories).toEqual(['HOUSING']);
  });

  it('kategorisiz müşteride BOŞ DİZİ gidiyor — alan atlanmıyor', async () => {
    /**
     * Boş geçmek ile hiç göndermemek aynı şey değil: Meta alanı hiç görmezse
     * kendi varsayımını uyguluyor. Boşu da açıkça göndermek gerekiyor.
     */
    const c = await tree.createFromSimple(CTX, input());
    await svc.publish(CTX, c.campaigns[0]!.id);

    const req = publishDraft.mock.calls[0]![1] as { specialAdCategories: string[] };
    expect(req.specialAdCategories).toEqual([]);
  });

  it('birden çok kategori birlikte gidiyor', async () => {
    await kategoriAta('HOUSING', 'CREDIT');
    const c = await tree.createFromSimple(CTX, input());
    await svc.publish(CTX, c.campaigns[0]!.id);

    const req = publishDraft.mock.calls[0]![1] as { specialAdCategories: string[] };
    expect(req.specialAdCategories).toEqual(['HOUSING', 'CREDIT']);
  });
});

describe('hedefleme kısıtı', () => {
  it('KRİTİK: özel kategoride yaş ve cinsiyet daraltması GÖNDERİLMİYOR', async () => {
    /**
     * Meta bu kategorilerde daraltmaya izin vermiyor. Alanları yine göndermek
     * isteğin reddedilmesi demek — ya da daha kötüsü, Meta kabul edip
     * sessizce yok sayıyor ve kullanıcı 25-44 yaş kadın hedeflediğini
     * sanıyor.
     */
    const kisitli = restrictTargetingFor(['HOUSING'], {
      geo_locations: { countries: ['TR'] },
      age_min: 25,
      age_max: 45,
      genders: [2],
    });

    expect(kisitli.targeting.age_max).toBeUndefined();
    expect(kisitli.targeting.genders).toBeUndefined();
    // YAŞ SIFIRLANMIYOR, 18'E SABİTLENİYOR: alanı hiç göndermemek "her yaş"
    // demek ve Meta özel kategorilerde 18+ istiyor.
    expect(kisitli.targeting.age_min).toBe(18);
    // Coğrafya DOKUNULMUYOR: kısıt yaş/cinsiyet/ayrıntılı hedeflemede.
    expect(kisitli.targeting.geo_locations).toEqual({ countries: ['TR'] });
  });

  it('NE DÜŞTÜĞÜ sayılıyor — sessiz eleme yok', async () => {
    const kisitli = restrictTargetingFor(['HOUSING'], {
      age_min: 25,
      age_max: 45,
      genders: [1],
    });
    expect(kisitli.removed).toEqual(['yaş alt sınırı', 'yaş üst sınırı', 'cinsiyet']);
  });

  it('kategorisiz müşteride hedefleme DEĞİŞMİYOR', async () => {
    const hedefleme = { age_min: 25, age_max: 45, genders: [2] };
    const sonuc = restrictTargetingFor([], hedefleme);
    expect(sonuc.targeting).toBe(hedefleme);
    expect(sonuc.removed).toEqual([]);
  });

  it('yayın isteğinde kısıt UYGULANMIŞ hâlde gidiyor', async () => {
    await kategoriAta('EMPLOYMENT');
    const c = await tree.createFromSimple(CTX, input());
    await svc.publish(CTX, c.campaigns[0]!.id);

    const req = publishDraft.mock.calls[0]![1] as { targeting: Record<string, unknown> };
    expect(req.targeting.genders).toBeUndefined();
    expect(req.targeting.age_max).toBeUndefined();
  });
});

describe('kontrol ekranı', () => {
  it('KRİTİK: beyan ve kısıt YAYINDAN ÖNCE söyleniyor', async () => {
    /**
     * Kullanıcı 25-44 yaş kadın hedefleyen bir taslak kurmuş olabilir ve
     * konut kategorisi yüzünden o daraltma uygulanmayacak. Yayından sonra
     * fark etmesi, yanlış kitleye harcanan bütçe demek.
     */
    await kategoriAta('HOUSING');
    const c = await tree.createFromSimple(CTX, input());
    const check = await svc.check(CTX, c.campaigns[0]!.id);

    expect(check.warnings.join(' ')).toContain('Konut');
    // ENGEL DEĞİL UYARI: beyan doğruysa yayın devam etmeli.
    expect(check.ok).toBe(true);
  });

  it('kategorisiz müşteride uyarı YOK', async () => {
    const c = await tree.createFromSimple(CTX, input());
    const check = await svc.check(CTX, c.campaigns[0]!.id);
    expect(check.warnings.join(' ')).not.toContain('özel reklam kategorisi');
  });
});

describe('veritabanı kısıtı', () => {
  it('tanınmayan kategori REDDEDİLİYOR', async () => {
    /**
     * Tanınmayan değer Meta tarafından reddediliyor ve hata mesajı hangi
     * alanın sorunlu olduğunu söylemiyor. Yazma anında yakalamak, yayın
     * anında anlaşılmaz bir hata almaktan iyi.
     */
    await expect(kategoriAta('EMLAK')).rejects.toThrow(/clients_special_categories_chk/);
  });

  it('bilinen kategorilerin hepsi kabul ediliyor', async () => {
    await kategoriAta(...SPECIAL_AD_CATEGORIES);
    const [row] = await h.q<{ special_ad_categories: string[] }>(
      `SELECT special_ad_categories FROM clients WHERE id = $1`,
      [IDS.client],
    );
    expect(row!.special_ad_categories).toHaveLength(SPECIAL_AD_CATEGORIES.length);
  });
});
