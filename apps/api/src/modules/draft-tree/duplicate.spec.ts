import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SimpleDraftInput, TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { DraftTreeService } from './draft-tree.service';

/**
 * Kampanya çoğaltma — eski toplu oluşturucunun yerini alıyor.
 *
 * ESKİSİ BİR TABLOYDU: kullanıcı Excel'de sekiz sütun hazırlıyor, panele
 * yapıştırıyor ve üstelik Meta ad set kimliğiyle sayfa kimliğini ELLE
 * yazıyordu — ikisi de zaten veritabanımızda duruyorken. Sütun kayması en
 * yaygın hataydı.
 *
 * Yenisinin iddiası: kaynak kampanya ZATEN DOĞRULANMIŞ bir ağaç ve kullanıcı
 * yalnızca DEĞİŞENİ yazıyor.
 */

let h: Harness;
let tree: DraftTreeService;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const PAGE = '66666666-6666-6666-6666-666666666666';
const CREATIVE_A = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
const CREATIVE_B = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';
const OTHER_CLIENT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OTHER_CREATIVE = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';

function input(patch: Partial<SimpleDraftInput> = {}): SimpleDraftInput {
  return {
    clientId: IDS.client,
    name: 'Kaynak Kampanya',
    goal: 'whatsapp',
    targets: [{ platform: 'meta', adAccountId: IDS.adAccount, dailyBudget: '200' }],
    socialProfileId: PAGE,
    creativeId: CREATIVE_A,
    durationDays: 7,
    ...patch,
  };
}

beforeAll(async () => {
  h = await createHarness();
  tree = new DraftTreeService({
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService);
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $2, 'Diğer', 'diger', now())`,
    [OTHER_CLIENT, IDS.org],
  );
  await h.q(
    `INSERT INTO social_profiles
       (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', 'page-1', 'Sayfa', now())`,
    [PAGE, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(
    `INSERT INTO ad_creatives (id, org_id, client_id, name, texts, updated_at)
     VALUES ($1, $4, $5, 'A', '{"headlines":["A"]}'::jsonb, now()),
            ($2, $4, $5, 'B', '{"headlines":["B"]}'::jsonb, now()),
            ($3, $4, $6, 'Yabancı', '{}'::jsonb, now())`,
    [CREATIVE_A, CREATIVE_B, OTHER_CREATIVE, IDS.org, IDS.client, OTHER_CLIENT],
  );
});

async function kaynak(): Promise<string> {
  const g = await tree.createFromSimple(CTX, input());
  return g.campaigns[0]!.id;
}

describe('çoğaltma', () => {
  it('YALNIZCA DEĞİŞEN yazılıyor, gerisi kaynaktan geliyor', async () => {
    /**
     * Tablodan en büyük fark bu: eski akışta kullanıcı her satırda sekiz
     * sütunu da doldurmak zorundaydı, üstelik değişmeyenleri de.
     */
    const id = await kaynak();
    const sonuc = await tree.duplicate(CTX, {
      sourceCampaignId: id,
      variants: [{ name: 'Varyasyon A' }],
    });

    expect(sonuc.failed).toEqual([]);
    const kopya = sonuc.created[0]!;
    expect(kopya.name).toBe('Varyasyon A');
    // Bütçe, hedef, hesap, sayfa — hepsi kaynaktan.
    expect(kopya.budgetAmountMicros).toBe('200000000');
    expect(kopya.goal).toBe('whatsapp');
    expect(kopya.adGroups[0]!.socialProfileId).toBe(PAGE);
  });

  it('KÖKEN kaydediliyor — "bu kampanya neyin kopyası"', async () => {
    // Listede aynı görünen üç satırın hangisinin kopya olduğunu bilmeden,
    // beklenmedik bir harcamanın kaynağı bulunamıyor.
    const id = await kaynak();
    const sonuc = await tree.duplicate(CTX, {
      sourceCampaignId: id,
      variants: [{ name: 'Varyasyon A' }],
    });
    expect(sonuc.created[0]!.source).toBe('duplicate');
    expect(sonuc.created[0]!.sourceCampaignId).toBe(id);
  });

  it('bütçe ve kreatif varyasyon başına değiştirilebiliyor', async () => {
    const id = await kaynak();
    const sonuc = await tree.duplicate(CTX, {
      sourceCampaignId: id,
      variants: [
        { name: 'Ucuz', budget: '50' },
        { name: 'Pahalı', budget: '900', creativeIds: [CREATIVE_B] },
      ],
    });

    expect(sonuc.created).toHaveLength(2);
    expect(sonuc.created[0]!.budgetAmountMicros).toBe('50000000');
    expect(sonuc.created[1]!.budgetAmountMicros).toBe('900000000');
    expect(sonuc.created[1]!.adGroups[0]!.ads[0]!.creativeId).toBe(CREATIVE_B);
  });

  it('BÜTÇE VERİLMEZSE kaynağınki — sıfır ya da varsayılan değil', async () => {
    /**
     * Sıfıra düşürmek ya da varsayılan uydurmak, kullanıcının fark etmediği
     * bir harcama değişikliği olurdu.
     */
    const id = await kaynak();
    const sonuc = await tree.duplicate(CTX, {
      sourceCampaignId: id,
      variants: [{ name: 'Aynı bütçe' }],
    });
    expect(sonuc.created[0]!.budgetAmountMicros).toBe('200000000');
  });

  it('çoklu kreatif kopyalanıyor ve reklamlar NUMARALANIYOR', async () => {
    const id = await kaynak();
    const sonuc = await tree.duplicate(CTX, {
      sourceCampaignId: id,
      variants: [{ name: 'İki varyant', creativeIds: [CREATIVE_A, CREATIVE_B] }],
    });
    expect(sonuc.created[0]!.adGroups[0]!.ads.map((a) => a.name)).toEqual([
      'İki varyant — 1',
      'İki varyant — 2',
    ]);
  });
});

describe('KISMİ BAŞARI — yirmi kopyanın üçü düşebilir', () => {
  it('düşen varyasyon diğerlerini durdurmuyor', async () => {
    /**
     * Tek bir hata fırlatmak, kurulmuş kampanyaları gizlemek olurdu. Bu,
     * kampanya yayınındaki kısmi başarı kararının (K13) çoğaltmadaki
     * karşılığı.
     */
    const id = await kaynak();
    const sonuc = await tree.duplicate(CTX, {
      sourceCampaignId: id,
      variants: [
        { name: 'Geçerli' },
        { name: 'Yabancı kreatif', creativeIds: [OTHER_CREATIVE] },
        { name: 'Yine geçerli' },
      ],
    });

    expect(sonuc.created.map((c) => c.name)).toEqual(['Geçerli', 'Yine geçerli']);
    expect(sonuc.failed).toHaveLength(1);
    expect(sonuc.failed[0]!.name).toBe('Yabancı kreatif');
    expect(sonuc.failed[0]!.reason).toContain('başka bir müşteriye ait');
  });

  it('düşen varyasyon YARIM SATIR bırakmıyor', async () => {
    const id = await kaynak();
    await tree.duplicate(CTX, {
      sourceCampaignId: id,
      variants: [{ name: 'Yabancı', creativeIds: [OTHER_CREATIVE] }],
    });
    // Yalnızca kaynak kampanya kalmalı.
    expect(await h.q(`SELECT id FROM draft_campaigns`)).toHaveLength(1);
  });
});

describe('sınırlar', () => {
  it('KRİTİK: gönderi boost’u çoğaltılamıyor', async () => {
    /**
     * Aynı gönderiyi ikinci kez öne çıkarmak, aynı kitleye aynı içeriği tekrar
     * göstermek ve bütçeyi ikiye katlamak demek — `boost-selector` bunu zaten
     * engelliyor ("bu gönderi daha önce boost edildi").
     */
    const id = await kaynak();
    // Kreatifi gönderiyle değiştir: boost reklamının kreatifi yok.
    const postId = 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1';
    await h.q(
      `INSERT INTO organic_posts
         (id, org_id, client_id, social_profile_id, external_id, media_type,
          published_at, updated_at)
       VALUES ($1, $2, $3, $4, 'post-1', 'photo', now(), now())`,
      [postId, IDS.org, IDS.client, PAGE],
    );
    await h.q(
      `UPDATE draft_ads SET creative_id = NULL, organic_post_id = $1`,
      [postId],
    );

    const sonuc = await tree.duplicate(CTX, {
      sourceCampaignId: id,
      variants: [{ name: 'Boost kopyası' }],
    });
    expect(sonuc.created).toHaveLength(0);
    expect(sonuc.failed[0]!.reason).toContain('ikinci kez öne çıkarılmaz');
  });

  it('kaynak bulunamazsa hata', async () => {
    await expect(
      tree.duplicate(CTX, {
        sourceCampaignId: '00000000-0000-0000-0000-000000000000',
        variants: [{ name: 'x' }],
      }),
    ).rejects.toThrow(/bulunamadı/i);
  });
});
