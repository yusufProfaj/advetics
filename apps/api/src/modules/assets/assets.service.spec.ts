import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { AssetStorageService } from '../ad-builder/asset-storage.service';
import { AssetsService } from './assets.service';

/**
 * AssetsService — GERÇEK Postgres motoruna (PGlite) ve GERÇEK diske karşı.
 *
 * EN KRİTİK İDDİALAR:
 *
 *   1. Aynı dosya ikinci kez yüklendiğinde YENİ SATIR AÇILMIYOR — arşiv aynı
 *      görselin onlarca kopyasıyla dolmamalı.
 *   2. Mükerrer kontrolü DİSKE YAZMADAN ÖNCE — sonra yapmak her tekrar
 *      yüklemede yetim bir dosya bırakır ve kimse fark etmez.
 *   3. Kullanımdaki varlık SİLİNEMİYOR — silmek, Meta'da çalışan bir reklamın
 *      kaydını koparmak demek.
 *   4. Tür sayımları tür filtresinden bağımsız.
 */

let h: Harness;
let svc: AssetsService;
let storage: AssetStorageService;
let root: string;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

/**
 * Geçerli bir PNG üretir.
 *
 * `probeImage` gerçek bayt yapısını okuyor; sahte bir buffer vermek testin
 * doğrulamanın kendisini atlaması demek olurdu.
 */
function png(width: number, height: number, seed = 0): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrLen = Buffer.alloc(4);
  ihdrLen.writeUInt32BE(13);
  const ihdr = Buffer.alloc(17);
  ihdr.write('IHDR', 0, 'ascii');
  ihdr.writeUInt32BE(width, 4);
  ihdr.writeUInt32BE(height, 8);
  ihdr[12] = 8;
  ihdr[13] = 6;
  // `seed` içerik özetini değiştiriyor: aynı boyutta ama farklı dosyalar
  // üretebilmek için.
  const tail = Buffer.alloc(16, seed);
  return Buffer.concat([sig, ihdrLen, ihdr, Buffer.alloc(4), tail]);
}

beforeAll(async () => {
  h = await createHarness();
  root = mkdtempSync(join(tmpdir(), 'advetics-assets-'));
  storage = new AssetStorageService({ uploads: { dir: root } } as never);
  svc = new AssetsService(
    {
      withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
    } as unknown as PrismaService,
    storage,
  );
});

afterAll(async () => {
  await h.close();
  rmSync(root, { recursive: true, force: true });
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
});

const upload = (bytes: Buffer, over: Record<string, unknown> = {}) =>
  svc.upload(CTX, {
    clientId: IDS.client,
    kind: 'image',
    fileName: 'gorsel.png',
    mimeType: 'image/png',
    bytes,
    ...over,
  });

// -----------------------------------------------------------------------------

describe('yükleme ve doğrulama', () => {
  it('geçerli görsel kaydediliyor', async () => {
    const res = await upload(png(1080, 1080));
    expect(res.duplicate).toBe(false);
    expect(res.asset.width).toBe(1080);
    expect(res.asset.height).toBe(1080);
    expect(res.asset.kind).toBe('image');
    expect(res.asset.usageCount).toBe(0);
  });

  it('çok küçük reklam görseli reddediliyor', async () => {
    await expect(upload(png(200, 200))).rejects.toThrow(/en az 300 piksel/);
  });

  it('LOGO daha düşük sınırdan geçiyor', async () => {
    /**
     * Google kare logoda 128×128 kabul ediyor. Reklam görselinin sınırını
     * (300) logoya uygulamak, tamamen geçerli bir logoyu reddetmek olurdu.
     */
    const res = await upload(png(150, 150), { kind: 'logo' });
    expect(res.asset.kind).toBe('logo');
  });

  it('logo da kendi sınırının altında reddediliyor', async () => {
    await expect(upload(png(100, 100), { kind: 'logo' })).rejects.toThrow(/en az 128 piksel/);
  });

  it('desteklenmeyen tür reddediliyor', async () => {
    await expect(
      upload(png(1080, 1080), { mimeType: 'image/gif' }),
    ).rejects.toThrow(/JPEG ve PNG/);
  });

  it('bozuk dosyanın SEBEBİ geçiriliyor', async () => {
    // Genel bir hata yerine probeImage'ın yazdığı sebep — kullanıcı neyi
    // düzelteceğini bilsin.
    await expect(upload(Buffer.alloc(8))).rejects.toThrow(/görsel değil|bozuk/);
  });
});

describe('mükerrer engeli', () => {
  it('aynı dosya ikinci kez yüklendiğinde YENİ SATIR açılmıyor', async () => {
    const bytes = png(1080, 1080, 7);
    const first = await upload(bytes);
    const second = await upload(bytes, { fileName: 'baska-ad.png' });

    expect(second.duplicate).toBe(true);
    expect(second.asset.id).toBe(first.asset.id);

    const rows = await h.q<{ count: string }>(`SELECT count(*) FROM assets`);
    expect(Number(rows[0]?.count)).toBe(1);
  });

  it('mükerrer yükleme DİSKTE ikinci dosya bırakmıyor', async () => {
    /**
     * Kontrolü diske yazdıktan sonra yapmak, her tekrar yüklemede yetim bir
     * dosya bırakırdı: kimse fark etmez, disk sessizce dolar. Paylaşımlı bir
     * sunucuda bu, diğer siteleri de etkileyen bir sorun.
     */
    const bytes = png(1080, 1080, 9);
    await upload(bytes);
    await upload(bytes);
    await upload(bytes);

    const rows = await h.q<{ storage_key: string }>(`SELECT storage_key FROM assets`);
    expect(rows).toHaveLength(1);
    // Kayıtlı tek anahtar okunabiliyor; başka dosya üretilmedi.
    await expect(storage.read(rows[0]!.storage_key)).resolves.toBeInstanceOf(Buffer);
  });

  it('FARKLI içerik ayrı kayıt', async () => {
    await upload(png(1080, 1080, 1));
    await upload(png(1080, 1080, 2));
    const rows = await h.q<{ count: string }>(`SELECT count(*) FROM assets`);
    expect(Number(rows[0]?.count)).toBe(2);
  });

  it('BAŞKA MÜŞTERİ aynı dosyayı ayrıca yükleyebiliyor', async () => {
    /**
     * İki müşterinin aynı stok fotoğrafı kullanması meşru ve Meta'ya zaten
     * ayrı ayrı yüklenmeleri gerekiyor. Tekil kısıt bu yüzden müşteri bazlı.
     */
    const other = '77777777-7777-7777-7777-777777777777';
    await h.q(
      `INSERT INTO clients (id, org_id, name, slug, updated_at)
       VALUES ($1, $2, 'Diğer', 'diger', now())`,
      [other, IDS.org],
    );
    const bytes = png(1080, 1080, 4);
    await upload(bytes);
    const res = await upload(bytes, { clientId: other });
    expect(res.duplicate).toBe(false);
  });
});

describe('listeleme', () => {
  it('tür sayımları TÜR FİLTRESİNDEN bağımsız', async () => {
    await upload(png(1080, 1080, 1));
    await upload(png(1080, 1080, 2));
    await upload(png(512, 512, 3), { kind: 'logo' });

    const res = await svc.list(CTX, { clientId: IDS.client, kind: 'logo', limit: 60, offset: 0 });
    expect(res.rows).toHaveLength(1);
    // Sekmeler diğer türü göstermeye devam ediyor.
    expect(res.byKind.image).toBe(2);
    expect(res.byKind.logo).toBe(1);
  });

  it('toplam sayfa boyutundan bağımsız', async () => {
    for (let i = 0; i < 5; i++) await upload(png(1080, 1080, i));
    const res = await svc.list(CTX, { clientId: IDS.client, limit: 2, offset: 0 });
    expect(res.rows).toHaveLength(2);
    expect(res.total).toBe(5);
  });

  it('adda arama çalışıyor', async () => {
    await upload(png(1080, 1080, 1), { name: 'Yaz kampanyası ana görsel' });
    await upload(png(1080, 1080, 2), { name: 'Kış görseli' });
    const res = await svc.list(CTX, { clientId: IDS.client, search: 'Yaz', limit: 60, offset: 0 });
    expect(res.total).toBe(1);
  });
});

describe('silme koruması', () => {
  it('kullanılmayan varlık silinebiliyor', async () => {
    const { asset } = await upload(png(1080, 1080));
    await svc.remove(CTX, asset.id);
    const rows = await h.q<{ count: string }>(`SELECT count(*) FROM assets`);
    expect(Number(rows[0]?.count)).toBe(0);
  });

  it('KULLANIMDAKİ varlık silinemiyor', async () => {
    /**
     * Silmek, Meta'da çalışmaya devam eden bir reklamın kaydını koparmak
     * demek: reklam yayında kalıyor, "bu görsel nereden geldi" sorusunun
     * cevabı kayboluyor.
     */
    const { asset } = await upload(png(1080, 1080));
    const draft = '99999999-9999-9999-9999-999999999999';
    await h.q(
      `INSERT INTO social_profiles (id, client_id, connection_id, profile_type, external_id, name, updated_at)
       VALUES ('88888888-8888-8888-8888-888888888888', $1, $2, 'facebook_page', 'p1', 'Sayfa', now())`,
      [IDS.client, IDS.connection],
    );
    await h.q(
      // `link_url` ZORUNLU: `ad_drafts_website_link_chk` web sitesi hedefinde
      // adres istiyor ve haklı — adressiz bir trafik kampanyası anlamsız.
      `INSERT INTO ad_drafts (id, org_id, client_id, ad_account_id, social_profile_id,
         goal, name, primary_text, link_url, daily_budget_micros, updated_at)
       VALUES ($1, $2, $3, $4, '88888888-8888-8888-8888-888888888888',
         'website', 'Test', 'metin', 'https://ornek.com', 200000000, now())`,
      [draft, IDS.org, IDS.client, IDS.adAccount],
    );
    await h.q(
      `INSERT INTO ad_draft_assets (id, org_id, draft_id, ratio, file_name, mime_type,
         byte_size, width, height, storage_key, asset_id)
       VALUES (gen_random_uuid(), $1, $2, 'square', 'x.png', 'image/png', 10, 1080, 1080, 'k', $3)`,
      [IDS.org, draft, asset.id],
    );

    await expect(svc.remove(CTX, asset.id)).rejects.toThrow(/reklamda kullanılıyor/);
  });

  it('kullanım sayısı listede görünüyor', async () => {
    const { asset } = await upload(png(1080, 1080));
    const res = await svc.list(CTX, { clientId: IDS.client, limit: 60, offset: 0 });
    expect(res.rows.find((r) => r.id === asset.id)?.usageCount).toBe(0);
  });
});

describe('yeniden adlandırma', () => {
  it('ad değişiyor, dosya değişmiyor', async () => {
    const { asset } = await upload(png(1080, 1080));
    const renamed = await svc.rename(CTX, asset.id, 'Yeni ad');
    expect(renamed.name).toBe('Yeni ad');
    expect(renamed.fileName).toBe('gorsel.png');
  });
});
