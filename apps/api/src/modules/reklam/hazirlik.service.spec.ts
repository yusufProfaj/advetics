import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { ReklamHazirlikService } from './hazirlik.service';

/**
 * Reklam modülü hazırlık okuması — gerçek şema (PGlite).
 *
 * En kritik iddia: HAVUZ ve BAŞKA WORKSPACE satırları seçenek olarak
 * GELMİYOR. Testler RLS'siz koşuyor, yani süzgeç servisin kendi `where`
 * koşulunda olmak zorunda — tam da istenen şey bu (RLS havuzu org
 * yöneticisine bilerek açıyor).
 */
let h: Harness;
let svc: ReklamHazirlikService;

const OTEKI = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CTX = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client, OTEKI],
  activeClientId: IDS.client,
  isOrgAdmin: true,
} as TenantContext;

const uuid = (n: number): string => `${String(n).repeat(8)}-0000-4000-8000-000000000000`;

beforeAll(async () => {
  h = await createHarness();
  const prisma = {
    withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;
  svc = new ReklamHazirlikService(prisma);
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Öteki', 'oteki', now())`,
    [OTEKI, IDS.org],
  );
  await h.q('DELETE FROM ad_accounts');
  await h.q('DELETE FROM social_profiles');
});

async function hesap(id: string, platform: 'meta' | 'google', clientId: string | null) {
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name,
       currency, timezone, status, updated_at)
     VALUES ($1, $2, $3, $4, $5::"Platform", $6, $7, 'TRY', 'Europe/Istanbul', 'active', now())`,
    [id, IDS.org, clientId, IDS.connection, platform, `act_${id.slice(0, 6)}`, `Hesap ${id.slice(0, 1)}`],
  );
}
async function profil(id: string, tip: string, clientId: string | null) {
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, $5::"SocialProfileType", $6, $7, now())`,
    [id, IDS.org, clientId, IDS.connection, tip, `ext-${id.slice(0, 6)}`, `Profil ${id.slice(0, 1)}`],
  );
}

describe('reklam hazırlığı', () => {
  it('KRİTİK: yalnız bu workspace’in META hesabı gelir — havuz, öteki workspace ve Google gelmez', async () => {
    await hesap(uuid(1), 'meta', IDS.client);
    await hesap(uuid(2), 'meta', null);
    await hesap(uuid(3), 'meta', OTEKI);
    await hesap(uuid(4), 'google', IDS.client);
    const r = await svc.oku(CTX, IDS.client);
    expect(r.hesaplar.map((x) => x.id)).toEqual([uuid(1)]);
    expect(r.hesaplar[0]).toMatchObject({ paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul' });
  });

  it('sayfa ve Instagram ayrı listede; YouTube kanalı hiçbirine girmez', async () => {
    await profil(uuid(5), 'facebook_page', IDS.client);
    await profil(uuid(6), 'instagram_business', IDS.client);
    await profil(uuid(7), 'youtube_channel', IDS.client);
    await profil(uuid(8), 'facebook_page', null);
    const r = await svc.oku(CTX, IDS.client);
    expect(r.sayfalar.map((x) => x.id)).toEqual([uuid(5)]);
    expect(r.instagramHesaplari.map((x) => x.id)).toEqual([uuid(6)]);
  });

  it('görseller kesiliyorsa toplam AYRICA yazılıyor; öteki workspace’in görseli gelmez', async () => {
    for (let i = 0; i < 3; i++) {
      await h.q(
        `INSERT INTO assets (id, org_id, client_id, kind, name, file_name, mime_type, byte_size, width, height,
           storage_key, content_hash, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'image', 'g', 'f.png', 'image/png', 1, 1080, 1350, 'k' || $3, $3, now())`,
        [IDS.org, i === 2 ? OTEKI : IDS.client, String(i).repeat(64)],
      );
    }
    const r = await svc.oku(CTX, IDS.client);
    expect(r.gorseller.toplam).toBe(2);
    expect(r.gorseller.satirlar).toHaveLength(2);
    expect(r.gorseller.satirlar[0]!.onizlemeAdresi).toMatch(/^\/assets\/[0-9a-f-]{36}\/preview$/);
  });

  it('marka profili yoksa "yok" der, varsa yasal uyarı ve varsayılan kitle özeti gelir', async () => {
    expect((await svc.oku(CTX, IDS.client)).marka.profilVar).toBe(false);
    const kitle = uuid(9);
    await h.q(
      `INSERT INTO audience_templates (id, org_id, client_id, name, locations, age_min, age_max, updated_at)
       VALUES ($1, $2, $3, 'İzmir', $4::jsonb, 25, 45, now())`,
      [kitle, IDS.org, IDS.client, JSON.stringify([{ key: '2347', type: 'region', label: 'İzmir, Türkiye', countryCode: 'TR' }])],
    );
    await h.q(
      `INSERT INTO client_profiles (id, org_id, client_id, yasal_uyari, metin_sablonlari, varsayilan_kitle_id, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'Yatırım tavsiyesi değildir.', ARRAY['Merhaba'], $3, now())`,
      [IDS.org, IDS.client, kitle],
    );
    const r = await svc.oku(CTX, IDS.client);
    expect(r.marka).toEqual({ yasalUyari: 'Yatırım tavsiyesi değildir.', metinSablonlari: ['Merhaba'], profilVar: true });
    expect(r.varsayilanKitle?.ozet).toContain('25-45 yaş');
    expect(r.varsayilanKitle?.ozet).toContain('İzmir');
    expect(r.varsayilanKitle?.konumlar).toEqual([{ tur: 'region', key: '2347', etiket: 'İzmir, Türkiye', ulkeKodu: 'TR' }]);
  });

  it('özel kategori tabanı: CREDIT halefine çevrilir, tanınmayan DÜŞÜRÜLMEZ ayrı söylenir', async () => {
    await h.q(`ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_special_categories_chk`);
    await h.q(`UPDATE clients SET special_ad_categories = ARRAY['HOUSING', 'CREDIT', 'GARIP'] WHERE id = $1`, [IDS.client]);
    const r = await svc.oku(CTX, IDS.client);
    expect(r.ozelKategoriTabani).toEqual(['HOUSING', 'FINANCIAL_PRODUCTS_SERVICES']);
    expect(r.taninmayanKategoriler).toEqual(['GARIP']);
  });

  it('erişimi olmayan workspace REDDEDİLİR (boş cevap değil)', async () => {
    await expect(svc.oku({ ...CTX, clientIds: [IDS.client] }, OTEKI)).rejects.toThrow(/erişimin yok/);
  });
});

/**
 * MODÜL SINIRI: yeni reklam modülü eski reklam yollarından hiçbir şey ALMAZ
 * (kullanıcı kararı 2026-10-07). Aşama 7'de eskiler silinince bu modül
 * derlemede değil AÇILIŞTA kırılırdı. Tarama yorumsuz kaynakta.
 */
describe('reklam modülü sınırı', () => {
  const YASAK = ['ad-builder', 'draft-tree', '/bulk/', 'campaign-actions', 'ai-assistant', '/connections/', '/assets/'];
  const dosyalar = readdirSync(__dirname).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));

  it('modül dosyaları gerçekten okundu', () => {
    expect(dosyalar).toEqual(expect.arrayContaining(['reklam.module.ts', 'hazirlik.service.ts']));
  });

  it('hiçbir dosya eski reklam modüllerini içe aktarmıyor', () => {
    for (const f of dosyalar) {
      const importlar = readFileSync(join(__dirname, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .filter((l) => /^\s*import\b|from\s+'/.test(l))
        .join('\n');
      for (const y of YASAK) expect(importlar, `${f} → ${y}`).not.toContain(y);
    }
  });

  it('KRİTİK: her @Injectable sınıf modülün providers listesinde (Nest açılışta patlar, derlemede değil)', () => {
    const modul = readFileSync(join(__dirname, 'reklam.module.ts'), 'utf8');
    const providers = /providers:\s*\[([^\]]*)\]/.exec(modul)![1]!;
    const servisler = dosyalar.flatMap((f) =>
      [...readFileSync(join(__dirname, f), 'utf8').matchAll(/@Injectable\(\)\s*export class (\w+)/g)].map((m) => m[1]!),
    );
    expect(servisler.length).toBeGreaterThanOrEqual(5);
    for (const s of servisler) expect(providers, s).toContain(s);
  });
});
