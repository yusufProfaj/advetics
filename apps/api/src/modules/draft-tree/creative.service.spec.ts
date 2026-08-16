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

describe('güncelleme', () => {
  it('metin havuzu ve görseller güncelleniyor', async () => {
    const c = await svc.create(CTX, input({ assetIds: [ASSET_A] }));
    const guncel = await svc.update(CTX, c.id, {
      ...input(),
      name: 'Yeni ad',
      texts: {
        primaryText: 'Yeni metin',
        headlines: ['Bir', 'İki', 'Üç'],
        longHeadlines: [],
        descriptions: ['Açıklama bir', 'Açıklama iki'],
      },
      assetIds: [ASSET_B, ASSET_A],
    });

    expect(guncel.name).toBe('Yeni ad');
    expect(guncel.texts.headlines).toEqual(['Bir', 'İki', 'Üç']);
    // SIRA DA GÜNCELLENİYOR: kullanıcı görselleri yeniden sıralamış olabilir
    // ve fark hesabı bunu göremezdi.
    expect(guncel.assets.map((a) => a.name)).toEqual(['Dikey', 'Kare']);
  });

  it('KRİTİK: yayınlanmış reklamda kullanılan kreatif DEĞİŞTİRİLEMİYOR', async () => {
    /**
     * Değişiklik platformda hiçbir şeyi değiştirmiyor (Meta ve Google kendi
     * kopyalarını aldı) ama panelde yayındaki reklamdan FARKLI bir şey
     * gösteriyor. "Reklamda ne yazıyor" sorusunun cevabı yanlış olur — ve o
     * soru kampanya kötü gittiğinde sorulur.
     */
    const c = await svc.create(CTX, input());
    await yayinlanmisReklamEkle(c.id);

    await expect(svc.update(CTX, c.id, input({ name: 'Değişti' }))).rejects.toThrow(
      /yayınlanmış reklamda kullanılıyor/i,
    );
  });

  it('mesaj KOPYALAMAYI söylüyor — sadece engellemiyor', async () => {
    // Engellemek tek başına kullanıcıya yapacak bir şey bırakmıyor.
    const c = await svc.create(CTX, input());
    await yayinlanmisReklamEkle(c.id);
    await expect(svc.update(CTX, c.id, input())).rejects.toThrow(/Kopyasını oluştur/);
  });

  it('YAYINLANMAMIŞ taslakta kullanılan kreatif değiştirilebiliyor', async () => {
    // Taslak henüz platforma gitmedi; ayrışacak bir gerçek yok.
    const c = await svc.create(CTX, input());
    await taslakReklamEkle(c.id, 'draft');
    const guncel = await svc.update(CTX, c.id, input({ name: 'Değişti' }));
    expect(guncel.name).toBe('Değişti');
  });

  it('başka müşterinin görseli güncellemede de reddediliyor', async () => {
    const c = await svc.create(CTX, input());
    await expect(
      svc.update(CTX, c.id, input({ assetIds: [ASSET_OTHER] })),
    ).rejects.toThrow(/başka bir müşteriye ait/i);
  });
});

describe('kopyalama', () => {
  it('metin, görsel ve sıra kopyalanıyor', async () => {
    const c = await svc.create(CTX, input({ assetIds: [ASSET_B, ASSET_A] }));
    const kopya = await svc.duplicate(CTX, c.id);

    expect(kopya.id).not.toBe(c.id);
    expect(kopya.texts).toEqual(c.texts);
    expect(kopya.assets.map((a) => a.name)).toEqual(['Dikey', 'Kare']);
  });

  it('ADA "kopya" ekleniyor', async () => {
    // İki özdeş ad, listede hangisinin hangisi olduğunu bulmayı imkânsız
    // kılardı.
    const c = await svc.create(CTX, input({ name: 'Yaz kreatifi' }));
    const kopya = await svc.duplicate(CTX, c.id);
    expect(kopya.name).toBe('Yaz kreatifi (kopya)');
  });

  it('YAYINLANMIŞ kreatif kopyalanabiliyor — düzenlemenin yolu bu', async () => {
    const c = await svc.create(CTX, input());
    await yayinlanmisReklamEkle(c.id);

    const kopya = await svc.duplicate(CTX, c.id);
    // Kopya hiçbir reklamda kullanılmıyor, dolayısıyla düzenlenebiliyor.
    const guncel = await svc.update(CTX, kopya.id, input({ name: 'Düzenlendi' }));
    expect(guncel.name).toBe('Düzenlendi');
  });
});

/** Kreatifi yayınlanmış bir reklama bağlar. */
async function yayinlanmisReklamEkle(creativeId: string): Promise<void> {
  await taslakReklamEkle(creativeId, 'published');
}

async function taslakReklamEkle(creativeId: string, status: string): Promise<void> {
  const campaignId = crypto.randomUUID();
  const groupId = crypto.randomUUID();
  /**
   * `published` durumu kısıtlar yüzünden dış kimlik VE tarih istiyor
   * (`draft_campaigns_published_chk`): kimliksiz bir "yayında" kaydı,
   * panelde çalışıyor görünen ama platformda bulunamayan bir harcama olurdu.
   * Değerler burada JS'te hesaplanıyor — aynı parametreyi hem karşılaştırma
   * hem değer olarak kullanmak Postgres'in tipi çıkaramamasına yol açıyordu.
   */
  const yayinda = status === 'published';
  await h.q(
    `INSERT INTO draft_campaigns
       (id, org_id, client_id, platform, ad_account_id, name, goal,
        budget_mode, budget_amount_micros, status, external_campaign_id,
        published_at, updated_at)
     VALUES ($1, $2, $3, 'meta', $4, 'Kampanya', 'whatsapp', 'daily', 200000000,
             $5, $6, $7::timestamptz, now())`,
    [
      campaignId,
      IDS.org,
      IDS.client,
      IDS.adAccount,
      status,
      yayinda ? 'c-1' : null,
      yayinda ? new Date().toISOString() : null,
    ],
  );
  await h.q(
    `INSERT INTO draft_ad_groups (id, org_id, campaign_id, name, updated_at)
     VALUES ($1, $2, $3, 'Grup', now())`,
    [groupId, IDS.org, campaignId],
  );
  await h.q(
    `INSERT INTO draft_ads (id, org_id, ad_group_id, creative_id, name, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'Reklam', now())`,
    [IDS.org, groupId, creativeId],
  );
}
