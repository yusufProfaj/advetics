import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BulkBatchInput, TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { PlatformApiError } from '../connections/provider.types';
import { BulkService } from './bulk.service';

/**
 * BulkService — GERÇEK Postgres motoruna (PGlite) karşı.
 *
 * NEDEN BU TESTLER: 60 reklamlık bir partide kısmi başarı NORMAL. En kritik
 * iddialar:
 *
 *   1. Doğrulama YAYINDAN ÖNCE ve geçersiz satırlar platforma HİÇ gitmiyor.
 *   2. Yeniden yayınlama `published` satırları ATLIYOR — aynı reklam iki kez
 *      oluşmuyor.
 *   3. Bir satırın patlaması partiyi durdurmuyor.
 *   4. Parti durumu satırlardan TÜRETİLİYOR, elle yazılmıyor.
 */

let h: Harness;
let svc: BulkService;
const createAd = vi.fn();
const canWrite = vi.fn();
const ensureExternalRef = vi.fn();

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

function batchInput(over: Partial<BulkBatchInput> = {}): BulkBatchInput {
  return {
    name: 'Ağustos varyasyonları',
    clientId: IDS.client,
    adAccountId: IDS.adAccount,
    defaults: { adSetExternalId: 'adset-1', pageExternalId: 'page-1' },
    items: [
      {
        rowNumber: 1,
        name: 'Varyasyon A',
        primaryText: 'Kısa metin',
        headline: 'Başlık',
        linkUrl: 'https://example.com',
        callToAction: 'LEARN_MORE',
        mediaRef: 'a'.repeat(32),
      },
    ],
    ...over,
  } as BulkBatchInput;
}

function row(n: number, over: Record<string, unknown> = {}) {
  return {
    rowNumber: n,
    name: `Varyasyon ${n}`,
    primaryText: 'Kısa metin',
    headline: 'Başlık',
    linkUrl: 'https://example.com',
    callToAction: 'LEARN_MORE',
    mediaRef: 'a'.repeat(32),
    ...over,
  };
}

beforeAll(async () => {
  h = await createHarness();
  svc = new BulkService(
    {
      withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
    } as unknown as PrismaService,
    { get: () => ({ platform: 'meta', createAd, canWrite }) } as never,
    { getAccessToken: async () => 'token' } as never,
    { acquire: async () => ({ allowed: true, usagePercent: 5 }), record: async () => {} } as never,
    // Arşiv yükleyicisi: hash'i olduğu gibi döndürüyor. Gerçek önbellek
    // mantığı kendi testlerinde; burada yayın yolunun arşiv varlığını
    // ÇÖZÜMLEDİĞİNİ doğruluyoruz.
    { ensureExternalRef: ensureExternalRef } as never,
  );
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  createAd.mockReset();
  canWrite.mockReset();
  canWrite.mockReturnValue({ ok: true, missing: [] });
  ensureExternalRef.mockReset();
  ensureExternalRef.mockResolvedValue('hesap-hash-1');
  let n = 0;
  createAd.mockImplementation(async () => {
    n++;
    return { externalAdId: `ad-${n}`, externalCreativeId: `cr-${n}` };
  });
  await h.q(`UPDATE platform_connections SET granted_scopes = $1 WHERE id = $2`, [
    ['ads_read', 'ads_management', 'business_management'],
    IDS.connection,
  ]);
});

// -----------------------------------------------------------------------------

describe('parti oluşturma ve doğrulama', () => {
  it('geçerli satır PENDING, parti VALIDATED', async () => {
    const b = await svc.create(CTX, batchInput());
    expect(b.items[0]?.status).toBe('pending');
    expect(b.status).toBe('validated');
  });

  it('KRİTİK: doğrulama KAYIT ANINDA yapılıyor', async () => {
    // "Kaydet" ve sonra "doğrula" iki tıklama olsaydı, ikinciyi unutmak
    // sorunları yayın anına ertelemek demek olurdu.
    const b = await svc.create(
      CTX,
      batchInput({ items: [row(1, { headline: 'x'.repeat(300) })] as never }),
    );
    expect(b.items[0]?.status).toBe('invalid');
    expect(b.items[0]?.issues[0]?.severity).toBe('error');
    // Geçersiz satır varken parti TASLAK kalıyor.
    expect(b.status).toBe('draft');
  });

  it('UYARI yayını engellemiyor', async () => {
    // Kırpılacak bir başlık kullanıcının bilinçli tercihi olabilir.
    const b = await svc.create(CTX, batchInput({ items: [row(1, { headline: 'x'.repeat(50) })] as never }));
    expect(b.items[0]?.status).toBe('pending');
    expect(b.items[0]?.issues[0]?.severity).toBe('warning');
  });

  it('PARTİ GENELİ sorun satırın yanında görünüyor', async () => {
    // Ayrı bir "parti uyarıları" kutusunda göstermek, kullanıcıyı sorunu
    // hangi satırda olduğunu aramaya zorlardı.
    const b = await svc.create(
      CTX,
      batchInput({ items: [row(1, { name: 'Aynı' }), row(2, { name: 'Aynı' })] as never }),
    );
    expect(b.items[0]?.issues.some((i) => i.message.includes('1, 2'))).toBe(true);
    expect(b.items[1]?.issues.some((i) => i.message.includes('1, 2'))).toBe(true);
  });

  it('başka müşterinin hesabına parti açılamaz', async () => {
    const other = '99999999-9999-9999-9999-999999999999';
    await h.q(
      `INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1,$2,'D','d',now())`,
      [other, IDS.org],
    );
    await expect(
      svc.create(CTX, batchInput({ clientId: other })),
    ).rejects.toThrow(/bu müşteriye bağlı değil/i);
  });
});

// -----------------------------------------------------------------------------

describe('yayınlama', () => {
  it('satırlar platforma yazılıyor ve PAUSED açılıyor', async () => {
    const b = await svc.create(CTX, batchInput({ items: [row(1), row(2)] as never }));
    const res = await svc.publish(CTX, b.id);

    expect(res.published).toBe(2);
    expect(createAd).toHaveBeenCalledTimes(2);
    // Ad set ve sayfa kimlikleri parti ayarlarından geliyor.
    expect(createAd.mock.calls[0]?.[1]).toMatchObject({
      adSetExternalId: 'adset-1',
      pageExternalId: 'page-1',
    });
  });

  it('KRİTİK: GEÇERSİZ satır platforma HİÇ gitmiyor', async () => {
    const b = await svc.create(
      CTX,
      batchInput({ items: [row(1), row(2, { headline: 'x'.repeat(300) })] as never }),
    );
    const res = await svc.publish(CTX, b.id);

    expect(createAd).toHaveBeenCalledTimes(1);
    expect(res.published).toBe(1);
    // SESSİZCE ATLANMIYOR — sayı raporlanıyor.
    expect(res.skipped).toBe(1);
  });

  it('KRİTİK: bir satırın patlaması partiyi DURDURMUYOR', async () => {
    // Tek kötü satır yüzünden kalan 59'u yazmamak, kullanıcıyı hepsini
    // yeniden denemeye zorlar.
    createAd.mockReset();
    createAd
      .mockRejectedValueOnce(new PlatformApiError('meta', 'permanent', '(#100) Geçersiz görsel'))
      .mockResolvedValue({ externalAdId: 'ad-2', externalCreativeId: 'cr-2' });

    const b = await svc.create(CTX, batchInput({ items: [row(1), row(2)] as never }));
    const res = await svc.publish(CTX, b.id);

    expect(res.published).toBe(1);
    expect(res.failed).toBe(1);

    const detail = await svc.get(CTX, b.id);
    expect(detail.items[0]?.status).toBe('failed');
    expect(detail.items[0]?.error).toContain('#100');
    expect(detail.items[1]?.status).toBe('published');
  });

  it('KRİTİK: YENİDEN YAYINLAMA published satırları ATLIYOR', async () => {
    // Aynı reklamın iki kez oluşması, 60 reklamlık bir partide 60 mükerrer
    // reklam demek.
    createAd.mockReset();
    createAd
      .mockRejectedValueOnce(new PlatformApiError('meta', 'permanent', 'hata'))
      .mockResolvedValue({ externalAdId: 'ad-x', externalCreativeId: 'cr-x' });

    const b = await svc.create(CTX, batchInput({ items: [row(1), row(2)] as never }));
    await svc.publish(CTX, b.id);
    createAd.mockClear();

    // İkinci tur: yalnızca başarısız satır yeniden deneniyor.
    const second = await svc.publish(CTX, b.id);
    expect(createAd).toHaveBeenCalledTimes(1);
    expect(second.published).toBe(1);
  });

  it('AD SET kimliği yoksa yayın HİÇ BAŞLAMIYOR', async () => {
    // Eksik ayarla başlamak, ilk satırda patlayıp geri kalanı belirsiz
    // bırakmak demek olurdu.
    const b = await svc.create(CTX, batchInput({ defaults: { pageExternalId: 'page-1' } }));
    await expect(svc.publish(CTX, b.id)).rejects.toThrow(/ad set ve sayfa kimliği/i);
    expect(createAd).not.toHaveBeenCalled();
  });

  it('ads_management yoksa yayın başlamıyor', async () => {
    canWrite.mockReturnValue({ ok: false, missing: ['ads_management'] });
    const b = await svc.create(CTX, batchInput());
    await expect(svc.publish(CTX, b.id)).rejects.toThrow(/ads_management/);
    expect(createAd).not.toHaveBeenCalled();
  });

  it('bağlantı etkin değilse yayın başlamıyor', async () => {
    await h.q(`UPDATE platform_connections SET status = 'needs_reauth' WHERE id = $1`, [
      IDS.connection,
    ]);
    const b = await svc.create(CTX, batchInput());
    await expect(svc.publish(CTX, b.id)).rejects.toThrow(/etkin değil/i);
  });
});

// -----------------------------------------------------------------------------

describe('parti durumu', () => {
  it('durum SATIRLARDAN türetiliyor', async () => {
    // Elle yazmak, 3 satırı başarısız bir partiyi "yayınlandı" gösterirdi.
    const b = await svc.create(CTX, batchInput({ items: [row(1), row(2)] as never }));
    await svc.publish(CTX, b.id);
    expect((await svc.get(CTX, b.id)).status).toBe('published');
  });

  it('durum sayımları listede görünüyor', async () => {
    const b = await svc.create(
      CTX,
      batchInput({ items: [row(1), row(2, { headline: 'x'.repeat(300) })] as never }),
    );
    const list = await svc.list(CTX, IDS.client);
    const found = list.find((x) => x.id === b.id);
    expect(found?.counts.pending).toBe(1);
    expect(found?.counts.invalid).toBe(1);
    expect(found?.itemCount).toBe(2);
  });
});

// -----------------------------------------------------------------------------

describe('silme', () => {
  it('taslak parti siliniyor', async () => {
    const b = await svc.create(CTX, batchInput());
    await svc.remove(CTX, b.id);
    expect(await svc.list(CTX, IDS.client)).toHaveLength(0);
  });

  it('KRİTİK: YAYINLANMIŞ parti SİLİNEMİYOR', async () => {
    // Kaydı silmek platformdaki reklamları silmiyor; geriye izlenemeyen
    // reklamlar kalırdı.
    const b = await svc.create(CTX, batchInput());
    await svc.publish(CTX, b.id);
    await expect(svc.remove(CTX, b.id)).rejects.toThrow(/yayınlanmış/i);
  });
});

// -----------------------------------------------------------------------------
// ARŞİV GÖRSELİ
// -----------------------------------------------------------------------------

/** Kütüphaneye bir varlık koyar. */
async function seedAsset(name: string, hash = 'x'): Promise<string> {
  const rows = await h.q<{ id: string }>(
    `INSERT INTO assets (id, org_id, client_id, kind, name, file_name, mime_type,
       byte_size, width, height, storage_key, content_hash, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'image', $3, 'f.png', 'image/png',
       100, 1080, 1080, 'k/' || $4, $4, now())
     RETURNING id::text AS id`,
    [IDS.org, IDS.client, name, `${hash}${name}`.padEnd(20, 'z')],
  );
  return rows[0]!.id;
}

describe('arşiv görseli', () => {
  it('ad ÇÖZÜMLENİYOR ve satır geçerli oluyor', async () => {
    await seedAsset('yaz-kampanya-1');
    const b = await svc.create(
      CTX,
      batchInput({ items: [row(1, { mediaRef: null, assetName: 'yaz-kampanya-1' })] }),
    );
    expect(b.items[0]?.status).toBe('pending');
    expect(b.items[0]?.assetId).not.toBeNull();
    expect(b.items[0]?.assetName).toBe('yaz-kampanya-1');
  });

  it('BÜYÜK/KÜÇÜK harf farkı eşleşmeyi bozmuyor', async () => {
    // Kullanıcı Excel'den yapıştırıyor; harf farkı yüzünden eşleşmemek
    // sebebi gözle görülmeyen bir hata olurdu.
    await seedAsset('Yaz-Kampanya-2');
    const b = await svc.create(
      CTX,
      batchInput({ items: [row(1, { mediaRef: null, assetName: 'yaz-kampanya-2' })] }),
    );
    expect(b.items[0]?.status).toBe('pending');
  });

  it('bulunamayan ad SATIRI GEÇERSİZ yapıyor', async () => {
    const b = await svc.create(
      CTX,
      batchInput({ items: [row(1, { mediaRef: null, assetName: 'olmayan' })] }),
    );
    expect(b.items[0]?.status).toBe('invalid');
    expect(b.items[0]?.issues.map((i) => i.message).join(' ')).toContain('adında görsel yok');
  });

  it('ÇİFT AD belirsizlik hatası — sessizce biri seçilmiyor', async () => {
    /**
     * Arşivde adlar tekil değil. Birini seçmek, yanlış görselle yayınlanan ve
     * hiçbir yerde hata üretmeyen bir reklam demek olurdu.
     */
    await seedAsset('ayni-ad', 'a');
    await seedAsset('ayni-ad', 'b');
    const b = await svc.create(
      CTX,
      batchInput({ items: [row(1, { mediaRef: null, assetName: 'ayni-ad' })] }),
    );
    expect(b.items[0]?.status).toBe('invalid');
    expect(b.items[0]?.issues.map((i) => i.message).join(' ')).toContain('2 görsel var');
  });

  it('HEM ham referans HEM arşiv adı reddediliyor', async () => {
    // Hangisinin kazandığı belirsiz kalırsa yanlış görselle yayınlanan bir
    // reklam sessizce yanlış olur.
    const b = await svc.create(
      CTX,
      batchInput({ items: [row(1, { mediaRef: 'a'.repeat(32), assetName: 'yaz-1' })] }),
    );
    expect(b.items[0]?.status).toBe('invalid');
    expect(b.items[0]?.issues.map((i) => i.message).join(' ')).toContain('belirsiz');
  });

  it('yayında HESABA ÖZEL hash çözümleniyor', async () => {
    /**
     * Meta hash'i reklam hesabı başına. Arşivde saklanan bir hash'i başka
     * hesapta kullanmak ya reddediliyor ya da kreatifi GÖRSELSİZ oluşturuyor.
     */
    const assetId = await seedAsset('yaz-kampanya-3');
    const b = await svc.create(
      CTX,
      batchInput({ items: [row(1, { mediaRef: null, assetName: 'yaz-kampanya-3' })] }),
    );
    await svc.publish(CTX, b.id);

    expect(ensureExternalRef).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ assetId, adAccountId: IDS.adAccount }),
    );
    // Sağlayıcıya giden değer önbellekten dönen hesap hash'i.
    expect(createAd.mock.calls[0]?.[1]).toMatchObject({ mediaRef: 'hesap-hash-1' });
  });

  it('ham referanslı satır arşive UĞRAMIYOR', async () => {
    const b = await svc.create(CTX, batchInput());
    await svc.publish(CTX, b.id);
    expect(ensureExternalRef).not.toHaveBeenCalled();
  });
});
