import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CreativeInput, TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { CreativeService } from './creative.service';

/**
 * Kreatif kütüphanesi.
 *
 * En kritik iddia: görsellerin AYNI müşteriye ait olduğu kontrol ediliyor.
 * RLS bunu yakalamıyor — iki satır da aynı `org_id`'ye sahip ve politika
 * ikisini de geçirir. Bir müşterinin görselini diğerinin reklamında
 * yayınlamak sessiz ve ciddi bir hata.
 */

let h: Harness;
let svc: CreativeService;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const OTHER_CLIENT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ASSET_A = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
const ASSET_B = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1';
const ASSET_OTHER = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';

function input(patch: Partial<CreativeInput> = {}): CreativeInput {
  return {
    clientId: IDS.client,
    name: 'Yaz kreatifi',
    texts: {
      primaryText: 'Yaz indirimi başladı',
      headlines: ['Yaz indirimi', 'Şimdi keşfet'],
      longHeadlines: [],
      descriptions: ['Sınırlı süre'],
    },
    assetIds: [ASSET_A],
    ...patch,
  };
}

beforeAll(async () => {
  h = await createHarness();
  svc = new CreativeService({
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
    `INSERT INTO assets
       (id, org_id, client_id, kind, name, file_name, mime_type, byte_size,
        width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $4, $5, 'image', 'Kare', 'a.jpg', 'image/jpeg', 100, 1080, 1080,
             'k/a', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', now()),
            ($2, $4, $5, 'image', 'Dikey', 'b.jpg', 'image/jpeg', 100, 1080, 1920,
             'k/b', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', now()),
            ($3, $4, $6, 'image', 'Yabancı', 'c.jpg', 'image/jpeg', 100, 1080, 1080,
             'k/c', 'cccccccccccccccccccccccccccccccc', now())`,
    [ASSET_A, ASSET_B, ASSET_OTHER, IDS.org, IDS.client, OTHER_CLIENT],
  );
});

describe('oluşturma', () => {
  it('metin havuzu ve görsellerle kreatif kuruluyor', async () => {
    const c = await svc.create(CTX, input({ assetIds: [ASSET_A, ASSET_B] }));

    expect(c.name).toBe('Yaz kreatifi');
    expect(c.texts.headlines).toEqual(['Yaz indirimi', 'Şimdi keşfet']);
    expect(c.texts.primaryText).toBe('Yaz indirimi başladı');
    expect(c.assets.map((a) => a.name)).toEqual(['Kare', 'Dikey']);
  });

  it('SIRA kullanıcının verdiği sıra', async () => {
    // Meta tek görselli kreatifte ilk elemanı kullanıyor; sıranın veriden
    // gelmesi "önce kare" tercihinin korunması demek.
    const c = await svc.create(CTX, input({ assetIds: [ASSET_B, ASSET_A] }));
    expect(c.assets.map((a) => a.name)).toEqual(['Dikey', 'Kare']);
  });

  it('görselsiz kreatif kurulabiliyor', async () => {
    // Kullanıcı önce metni yazıp görseli sonra ekleyebilmeli; zorunlu kılmak,
    // `ad_drafts`'ta yaşanan "3. adım hiç çalışmıyor" hatasının aynısı olurdu.
    const c = await svc.create(CTX, input({ assetIds: [] }));
    expect(c.assets).toEqual([]);
  });

  it('KRİTİK: başka müşterinin görseli reddediliyor', async () => {
    await expect(
      svc.create(CTX, input({ assetIds: [ASSET_A, ASSET_OTHER] })),
    ).rejects.toThrow(/başka bir müşteriye ait/i);
  });

  it('reddedilen kreatif HİÇBİR SATIR bırakmıyor', async () => {
    await expect(svc.create(CTX, input({ assetIds: [ASSET_OTHER] }))).rejects.toThrow();
    expect(await h.q(`SELECT id FROM ad_creatives`)).toHaveLength(0);
    expect(await h.q(`SELECT id FROM ad_creative_assets`)).toHaveLength(0);
  });

  it('bulunamayan görselin SAYISI söyleniyor', async () => {
    await expect(
      svc.create(CTX, input({ assetIds: [ASSET_A, '00000000-0000-0000-0000-000000000000'] })),
    ).rejects.toThrow(/1 görsel arşivde bulunamadı/);
  });

  it('AYNI GÖRSEL İKİ KEZ eklenemiyor ve TEŞHİS DOĞRU', async () => {
    /**
     * Meta böyle bir kreatifi kabul edip ikinci kopyayı sessizce yok sayıyor;
     * kullanıcı iki farklı görsel yüklediğini sanıyor.
     *
     * MESAJIN KENDİSİ TEST EDİLİYOR çünkü ilk yazımda yanlıştı: mükerrer
     * kontrolü yoktu, SQL tekrarları tekilleştiriyordu ve kullanıcı
     * "1 görsel arşivde bulunamadı" mesajı alıyordu. Görsel arşivde duruyordu;
     * sorun tekrarın kendisiydi. Yanlış teşhis, bu projedeki en pahalı hata
     * sınıfı.
     */
    await expect(
      svc.create(CTX, input({ assetIds: [ASSET_A, ASSET_A] })),
    ).rejects.toThrow(/iki kez eklenemez/i);
  });
});

describe('listeleme', () => {
  it('müşterinin kreatifleri dönüyor', async () => {
    await svc.create(CTX, input({ name: 'Birinci' }));
    await svc.create(CTX, input({ name: 'İkinci' }));
    const list = await svc.list(CTX, IDS.client);
    expect(list.map((c) => c.name).sort()).toEqual(['Birinci', 'İkinci']);
  });

  it('eksik metin havuzu okunurken TAMAMLANIYOR', async () => {
    /**
     * Şema alanları zorunlu tutuyor ama veritabanındaki eski bir satır
     * yalnızca `headlines` taşıyor olabilir; `undefined` bir dizi üzerinde
     * `.map` çağırmak arayüzde beyaz ekran demek.
     */
    await h.q(
      `INSERT INTO ad_creatives (id, org_id, client_id, name, texts, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'Eski', '{"headlines":["Tek"]}'::jsonb, now())`,
      [IDS.org, IDS.client],
    );
    const [c] = await svc.list(CTX, IDS.client);
    expect(c!.texts.descriptions).toEqual([]);
    expect(c!.texts.longHeadlines).toEqual([]);
  });
});

describe('silme', () => {
  it('kullanılmayan kreatif siliniyor', async () => {
    const c = await svc.create(CTX, input());
    await svc.remove(CTX, c.id);
    expect(await h.q(`SELECT id FROM ad_creatives`)).toHaveLength(0);
    // Arşiv görseli KALIYOR: kütüphaneye ait, kreatife değil.
    expect(await h.q(`SELECT id FROM assets`)).toHaveLength(3);
  });

  it('KRİTİK: kullanımdaki kreatif silinemiyor ve SEBEBİ yazıyor', async () => {
    /**
     * Yabancı anahtar bunu zaten engelliyor ama oradan çıkan hata ham bir
     * kısıt ihlali: kullanıcı "silinemedi" görür, sebebini görmez.
     */
    const c = await svc.create(CTX, input());
    const campaignId = 'c0000000-0000-4000-8000-000000000001';
    const groupId = 'c0000000-0000-4000-8000-000000000002';
    await h.q(
      `INSERT INTO draft_campaigns
         (id, org_id, client_id, platform, ad_account_id, name, goal,
          budget_mode, budget_amount_micros, updated_at)
       VALUES ($1, $2, $3, 'meta', $4, 'Kampanya', 'whatsapp', 'daily', 200000000, now())`,
      [campaignId, IDS.org, IDS.client, IDS.adAccount],
    );
    await h.q(
      `INSERT INTO draft_ad_groups (id, org_id, campaign_id, name, updated_at)
       VALUES ($1, $2, $3, 'Grup', now())`,
      [groupId, IDS.org, campaignId],
    );
    await h.q(
      `INSERT INTO draft_ads (id, org_id, ad_group_id, creative_id, name, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Reklam', now())`,
      [IDS.org, groupId, c.id],
    );

    await expect(svc.remove(CTX, c.id)).rejects.toThrow(/1 reklamda kullanılıyor/);
  });
});
