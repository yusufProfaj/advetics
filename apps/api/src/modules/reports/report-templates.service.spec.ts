import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { ReportTemplatesService } from './report-templates.service';

/**
 * RAPOR ŞABLONU CRUD — GERÇEK Postgres'e (PGlite) karşı.
 *
 * Sınanan şey ham SQL ve JSONB davranışı; hiçbiri TypeScript tarafından
 * görülmüyor. Ayrıca bu servis geç yazıldı ve etrafındaki her şey (tablo,
 * RLS politikaları, belgeyi şablondan render eden zincir) BAŞTAN BERİ
 * hazırdı — yani buradaki hatalar "eksik özellik" değil, sessizce yanlış
 * rapor üretme biçimi olurdu.
 */
let h: Harness;
let svc: ReportTemplatesService;
let denetim: Array<{ action: string; before?: unknown; after?: unknown }>;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  isOrgAdmin: true,
} as TenantContext;

const META = { ip: null, userAgent: null, requestId: null };

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  denetim = [];
  svc = new ReportTemplatesService(
    { withTenant: async <T>(_c: TenantContext, fn: (t: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService,
    {
      record: async (_tx: unknown, _c: unknown, e: { action: string }) => {
        denetim.push(e);
      },
    } as unknown as AuditService,
  );
});

const SABLON = {
  name: 'Aylık müşteri raporu',
  sections: ['cover', 'summary', 'meta_campaigns', 'closing'] as const,
};

describe('oluşturma', () => {
  it('şablon kaydediliyor ve listede görünüyor', async () => {
    await svc.create(CTX, { ...SABLON, sections: [...SABLON.sections] }, META);
    const liste = await svc.list(CTX);
    expect(liste).toHaveLength(1);
    expect(liste[0]!.name).toBe('Aylık müşteri raporu');
    expect(liste[0]!.sections).toEqual(['cover', 'summary', 'meta_campaigns', 'closing']);
  });

  it('KRİTİK: bölüm SIRASI kaydediliyor — belge sırayı buradan alıyor', async () => {
    // Sıra bir dizinin doğal özelliği; satır bazlı `order` kolonu her yeniden
    // sıralamada N satır UPDATE demek olurdu (şema yorumu).
    await svc.create(
      CTX,
      { name: 'Ters', sections: ['closing', 'cover', 'summary'] },
      META,
    );
    expect((await svc.list(CTX))[0]!.sections).toEqual(['closing', 'cover', 'summary']);
  });

  it('bölüm ayarları (options) kaydediliyor', async () => {
    await svc.create(
      CTX,
      {
        ...SABLON,
        sections: [...SABLON.sections],
        options: { meta_campaigns: { metrics: ['spend', 'clicks'], limit: 10 } },
      },
      META,
    );
    expect((await svc.list(CTX))[0]!.options.meta_campaigns).toEqual({
      metrics: ['spend', 'clicks'],
      limit: 10,
    });
  });

  it('denetim kaydı yazılıyor', async () => {
    await svc.create(CTX, { ...SABLON, sections: [...SABLON.sections] }, META);
    expect(denetim.map((d) => d.action)).toContain('report_template.create');
  });
});

describe('bozuk kayıt savunması', () => {
  it('KRİTİK: uydurulmuş bölüm adı ELENİYOR', async () => {
    await h.q(
      `INSERT INTO report_templates (id, org_id, client_id, name, sections, status, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'Bozuk', '["cover","zart","closing"]'::jsonb, 'published', now())`,
      [IDS.org, IDS.client],
    );
    expect((await svc.list(CTX))[0]!.sections).toEqual(['cover', 'closing']);
  });

  it('KRİTİK: aynı bölüm iki kez yazılmışsa TEKİLLEŞTİRİLİYOR', async () => {
    // Belge tekrarı iki kez basıyor ve React aynı `key` ile iki düğüm
    // üretiyor.
    await h.q(
      `INSERT INTO report_templates (id, org_id, client_id, name, sections, status, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'Tekrarlı', '["cover","cover","summary"]'::jsonb, 'published', now())`,
      [IDS.org, IDS.client],
    );
    expect((await svc.list(CTX))[0]!.sections).toEqual(['cover', 'summary']);
  });

  it('hepsi geçersizse TÜM bölümlere dönülüyor — boş rapor üretilmiyor', async () => {
    await h.q(
      `INSERT INTO report_templates (id, org_id, client_id, name, sections, status, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'Çöp', '["zart","zurt"]'::jsonb, 'published', now())`,
      [IDS.org, IDS.client],
    );
    expect((await svc.list(CTX))[0]!.sections.length).toBeGreaterThan(3);
  });

  it('KRİTİK: bozuk options SESSİZCE TAŞINMIYOR', async () => {
    /*
     * Ham JSON'u belgeye geçirmek, uydurulmuş bir anahtarın sessizce yok
     * sayılması demek olurdu — `auto_boost_presets.settings` yorumundaki
     * kararın aynısı. Bozuk kayıt boş nesneye düşüyor ve rapor varsayılan
     * sütunlarına dönüyor.
     */
    await h.q(
      `INSERT INTO report_templates (id, org_id, client_id, name, sections, options, status, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'Bozuk ayar', '["cover"]'::jsonb,
               '{"meta_campaigns":{"metrics":["uydurma_metrik"]}}'::jsonb, 'published', now())`,
      [IDS.org, IDS.client],
    );
    expect((await svc.list(CTX))[0]!.options).toEqual({});
  });
});

describe('silme', () => {
  it('KRİTİK: kaç paylaşım linkinin gittiği SÖYLENİYOR', async () => {
    /*
     * `report_shares.template_id` ON DELETE CASCADE: şablonu silmek o
     * şablondan üretilmiş bütün linkleri de siliyor. Müşteriye gönderilmiş
     * bir rapor haber vermeden 404 olurdu. Silme yapılıyor ama sessiz
     * kalmıyor.
     */
    const { id } = await svc.create(CTX, { ...SABLON, sections: [...SABLON.sections] }, META);
    for (const t of ['tok1', 'tok2']) {
      await h.q(
        `INSERT INTO report_shares (id, org_id, client_id, template_id, token_hash, date_from, date_to, created_by, created_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, '2026-07-01', '2026-07-31', $5, now())`,
        [IDS.org, IDS.client, id, t, IDS.user],
      );
    }

    const sonuc = await svc.remove(CTX, id, META);
    expect(sonuc.revokedShares).toBe(2);
    expect(await svc.list(CTX)).toHaveLength(0);
  });

  it('KRİTİK: denetim kaydı KAÇ LİNKİN gittiğini taşıyor', async () => {
    // Sayı silmeden ÖNCE okunuyor: `report_shares` CASCADE ile gidiyor, sonra
    // saysak her zaman 0 çıkardı ve silmenin en pahalı yan etkisi denetimde
    // görünmezdi.
    const { id } = await svc.create(CTX, { ...SABLON, sections: [...SABLON.sections] }, META);
    await h.q(
      `INSERT INTO report_shares (id, org_id, client_id, template_id, token_hash, date_from, date_to, created_by, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'tok', '2026-07-01', '2026-07-31', $4, now())`,
      [IDS.org, IDS.client, id, IDS.user],
    );
    await svc.remove(CTX, id, META);

    const kayit = denetim.find((d) => d.action === 'report_template.delete');
    expect(kayit).toBeDefined();
    expect((kayit!.before as { revokedShares: number }).revokedShares).toBe(1);
  });

  it('olmayan şablon 404', async () => {
    await expect(
      svc.remove(CTX, '00000000-0000-0000-0000-000000000123', META),
    ).rejects.toThrow(/bulunamadı/i);
  });
});

describe('yetki', () => {
  it('KRİTİK: org varsayılanını org yöneticisi OLMAYAN değiştiremiyor', async () => {
    /*
     * RLS bunu zaten uyguluyor ama SESSİZCE: politika 0 satır döndürüyor ve
     * ekran "kaydedildi" der. Sebebi söyleyebilmek için kontrol burada da
     * yapılıyor.
     */
    const musteriCtx = { ...CTX, isOrgAdmin: false } as TenantContext;
    await expect(
      svc.create(musteriCtx, { name: 'Org geneli', sections: ['cover'], clientId: null }, META),
    ).rejects.toThrow(/org yöneticisi/i);
  });

  it('müşteriye özel şablonu yönetici olmayan da oluşturabiliyor', async () => {
    const musteriCtx = { ...CTX, isOrgAdmin: false } as TenantContext;
    await expect(
      svc.create(musteriCtx, { name: 'Müşteri şablonu', sections: ['cover'], clientId: IDS.client }, META),
    ).resolves.toBeDefined();
  });
});

describe('güncelleme', () => {
  it('sıra ve ayarlar güncelleniyor', async () => {
    const { id } = await svc.create(CTX, { ...SABLON, sections: [...SABLON.sections] }, META);
    await svc.update(
      CTX,
      id,
      { name: 'Yeni ad', sections: ['summary', 'cover'], options: { summary: { limit: 5 } } },
      META,
    );
    const t = (await svc.list(CTX))[0]!;
    expect(t.name).toBe('Yeni ad');
    expect(t.sections).toEqual(['summary', 'cover']);
    expect(t.options.summary).toEqual({ limit: 5 });
  });

  it('olmayan şablon 404', async () => {
    await expect(
      svc.update(CTX, '00000000-0000-0000-0000-000000000123', { name: 'x', sections: ['cover'] }, META),
    ).rejects.toThrow(/bulunamadı/i);
  });
});
