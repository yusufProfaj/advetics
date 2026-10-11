import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HAZIRLAMA_DURUMLARI,
  gunlukButceBasligi,
  hazirlamaDurumu,
  kategoriBasligi,
  pikselSec,
  varsayilanGunlukButce,
  type TenantContext,
} from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { HazirlamaService, bosAlanlariDoldur, sayfaSitesi } from './hazirlama.service';

/**
 * ═══ HAZIR WORKSPACE (HAZIR-WORKSPACE-PLANI.md § Dalga 3) ═══
 *
 * Kilitlenenler: tablo CHECK listesi = sözleşme sabiti; saf kararlar (piksel,
 * bütçe, site adresi, boş alan); servisin üç sessiz hata yolu (iş düşerse
 * satır yine yazılır ve yeniden tetiklenmez, kategori yazılamazsa
 * "cevaplandı" basılmaz, seçenek dışı piksel kabul edilmez); Nest modül
 * kaydı (açılışta patlar, derlemede değil).
 */
const yorumsuz = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('sözleşme ve tablo aynı', () => {
  it('KRİTİK: CHECK listesi = HAZIRLAMA_DURUMLARI', () => {
    const sql = readFileSync(join(__dirname, '../../../prisma/migrations/20261012100000_workspace_hazirlama/migration.sql'), 'utf8');
    const m = /"durum" IN \(([^)]+)\)/.exec(sql);
    if (!m) throw new Error('CHECK bulunamadı');
    expect(m[1]!.split(',').map((x) => x.trim().replace(/'/g, ''))).toEqual([...HAZIRLAMA_DURUMLARI]);
  });

  it('KRİTİK: modül kaydı — Ölçüm ve Tenancy içe alınıyor, uygulamaya kayıtlı', () => {
    const mod = yorumsuz(readFileSync(join(__dirname, 'hazirlama.module.ts'), 'utf8'));
    expect(mod).toMatch(/imports:\s*\[[^\]]*OlcumModule[^\]]*TenancyModule/);
    expect(mod).toMatch(/providers:\s*\[\s*HazirlamaService\s*\]/);
    const app = yorumsuz(readFileSync(join(__dirname, '../../app.module.ts'), 'utf8'));
    expect(app).toMatch(/^\s*HazirlamaModule,/m);
    const olcum = yorumsuz(readFileSync(join(__dirname, '../olcum/olcum.module.ts'), 'utf8'));
    expect(olcum).toMatch(/exports:\s*\[[^\]]*OlcumService/);
    const tenancy = yorumsuz(readFileSync(join(__dirname, '../tenancy/tenancy.module.ts'), 'utf8'));
    for (const s of ['ClientProfileService', 'KitleSablonuService', 'BilgiBankasiAiService']) expect(tenancy).toMatch(new RegExp(`exports:\\s*\\[[^\\]]*${s}`));
  });
});

describe('saf kararlar', () => {
  const p = (id: string, sonCalisma: string | null = null, kullanilamaz = false) => ({ id, ad: `P${id}`, sonCalisma, kullanilamaz });

  it('KRİTİK: piksel — sitedeki tek eşleşme kazanır; iki aday soru; hiç yoksa nedeniyle yok', () => {
    expect(pikselSec([p('1', 'x'), p('2', 'x')], ['2'])).toMatchObject({ tur: 'secildi', id: '2' });
    expect(pikselSec([p('1', 'x'), p('2', 'x')], [])).toMatchObject({ tur: 'soru' });
    expect(pikselSec([p('1', 'x'), p('2')], [])).toMatchObject({ tur: 'secildi', id: '1' });
    expect(pikselSec([p('1', 'x', true)], ['1'])).toMatchObject({ tur: 'yok' });
    expect(pikselSec([p('1')], [])).toMatchObject({ tur: 'yok' });
  });

  it('bütçe: TRY tabanı 500 ₺, asgarinin iki katı tabanı geçerse o; bilinmeyen asgari etkisiz', () => {
    expect(varsayilanGunlukButce('TRY', [null])).toBe(500_000_000n);
    expect(varsayilanGunlukButce('TRY', [300_000_000n])).toBe(600_000_000n);
    expect(varsayilanGunlukButce('USD', [])).toBe(20_000_000n);
  });

  it('genel durum: soru > eksik/hata > hazır', () => {
    const a = (durum: 'tamam' | 'hata') => ({ kod: 'site' as const, durum, baslik: '', neden: '' });
    expect(hazirlamaDurumu([a('hata')], [{ kod: 'kategori', soru: '' }])).toBe('soru');
    expect(hazirlamaDurumu([a('hata')], [])).toBe('eksik');
    expect(hazirlamaDurumu([a('tamam')], [])).toBe('hazir');
  });

  it('sayfa sitesi: ilk adres, https, sosyal ağ adresi site sayılmaz', () => {
    expect(sayfaSitesi('www.ornek.com.tr http://ikinci.com')).toBe('https://www.ornek.com.tr/');
    expect(sayfaSitesi('http://ornek.com/a')).toBe('https://ornek.com/a');
    expect(sayfaSitesi('https://instagram.com/ornek')).toBeNull();
    expect(sayfaSitesi(null)).toBeNull();
  });

  it('KRİTİK: AI taslağı yalnız BOŞ alana yazar', () => {
    expect(bosAlanlariDoldur({ markaAdi: 'Dolu', sektor: '', vaatler: [] }, { markaAdi: 'AI', sektor: 'Emlak', vaatler: ['x'] }, ['markaAdi', 'sektor', 'vaatler'])).toEqual({
      sektor: 'Emlak',
      vaatler: ['x'],
    });
  });

  it('başlıklar: kategori Türkçe adıyla, bütçe para birimiyle', () => {
    expect(kategoriBasligi(['HOUSING'])).toBe('Konut');
    expect(kategoriBasligi([])).toBe('Özel kategori yok');
    expect(gunlukButceBasligi(750_000_000n, 'TRY')).toBe('Günlük 750 ₺');
    expect(gunlukButceBasligi(20_000_000n, 'usd')).toBe('Günlük 20 USD');
  });
});

describe('servis (PGlite)', () => {
  let h: Harness;
  let svc: HazirlamaService;
  const olcumDurum = vi.fn();
  const ctx = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], activeClientId: null, permissions: ['client.read', 'client.write'] } as unknown as TenantContext;
  const auditKayit = vi.fn();
  const profilGet = vi.fn();

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
    await seedTenant(h, { platform: 'meta' });
    olcumDurum.mockReset();
    auditKayit.mockReset();
    // Marka alanlarının hepsi dolu: marka adımı AI'ya gitmeden "dolu" der.
    profilGet.mockReset().mockResolvedValue(
      Object.fromEntries(['markaAdi', 'sektor', 'markaBilgileri', 'bilgiBankasi', 'hedefKitle', 'uslup', 'urunKategorileri', 'vaatler'].map((a) => [a, a.endsWith('i') && a !== 'markaAdi' && a !== 'markaBilgileri' && a !== 'bilgiBankasi' ? ['x'] : 'x'])),
    );
    const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
    svc = new HazirlamaService(
      prisma,
      { durum: olcumDurum } as never,
      { taslak: vi.fn() } as never,
      { get: profilGet, upsert: vi.fn() } as never,
      { create: vi.fn(), varsayilanYap: vi.fn() } as never,
      { decrypt: vi.fn() } as never,
      { platforms: { meta: { apiVersion: 'v25.0' } } } as never,
      { record: auditKayit } as never,
    );
  });

  const satir = async () =>
    (await h.q<{ durum: string; girdi_imzasi: string | null; kategori_cevaplandi: boolean; adimlar: unknown }>(`SELECT * FROM workspace_hazirlama WHERE client_id = $1`, [IDS.client]))[0];

  it('KRİTİK: iş tamamen düşerse satır imzasıyla yazılır ve okuma işi YENİDEN başlatmaz', async () => {
    let cagri = 0;
    const duser = {
      withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) =>
        fn({
          ...h.db,
          $queryRaw: async (q: { sql: string }) => {
            if (q.sql.includes('AS kategoriler')) {
              cagri += 1;
              throw new Error('veritabanı düştü');
            }
            return h.db.$queryRaw(q as never);
          },
        }),
    };
    const s2 = new HazirlamaService(duser as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    expect((await s2.oku(ctx, IDS.client)).durum).toBe('calisiyor');
    await vi.waitFor(async () => expect((await s2.oku(ctx, IDS.client)).durum).toBe('eksik'));
    const s = await satir();
    expect(s!.girdi_imzasi).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(s!.adimlar)).toContain('veritabanı düştü');
    await s2.oku(ctx, IDS.client);
    expect(cagri).toBe(1);
  });

  it('KRİTİK: dustu() satırı "eksik" ve sebebiyle yazar', async () => {
    await svc.dustu(ctx, IDS.client, 'a'.repeat(64), 'Graph yanıt vermedi');
    const s = await satir();
    expect(s!.durum).toBe('eksik');
    expect(JSON.stringify(s!.adimlar)).toContain('Graph yanıt vermedi');
    expect(s!.girdi_imzasi).toBe('a'.repeat(64));
  });

  it('hesap atanmamışsa okuma işi başlatmaz', async () => {
    await h.q(`UPDATE ad_accounts SET client_id = NULL`);
    const y = await svc.oku(ctx, IDS.client);
    expect(y.durum).toBe('bekliyor');
    expect(olcumDurum).not.toHaveBeenCalled();
  });

  it('KRİTİK: kategori cevabı clients\'a yazılır ve "cevaplandı" basılır; soru düşer', async () => {
    await h.q(
      `INSERT INTO workspace_hazirlama (client_id, org_id, durum, sorular) VALUES ($1, $2, 'soru', '[{"kod":"kategori","soru":"?"}]')`,
      [IDS.client, IDS.org],
    );
    const y = await svc.cevap(ctx, IDS.client, { kod: 'kategori', kategoriler: ['HOUSING'] });
    expect(y.sorular).toEqual([]);
    expect(y.varsayilanlar.kategoriCevaplandi).toBe(true);
    expect(y.adimlar.find((a) => a.kod === 'kategori')?.baslik).toBe('Konut');
    const [c] = await h.q<{ special_ad_categories: string[] }>(`SELECT special_ad_categories FROM clients WHERE id = $1`, [IDS.client]);
    expect(c!.special_ad_categories).toEqual(['HOUSING']);
    // Denetim kaydı: önceki ve sonraki beyan.
    expect(auditKayit).toHaveBeenCalledTimes(1);
    expect(auditKayit.mock.calls[0]![2]).toMatchObject({ action: 'client.updated', before: { specialAdCategories: [] }, after: { specialAdCategories: ['HOUSING'] } });
  });

  it('KRİTİK: bekleyen soru yoksa kategori cevabı REDDEDİLİR (beyan sessizce silinemez)', async () => {
    await h.q(`UPDATE clients SET special_ad_categories = '{HOUSING}' WHERE id = $1`, [IDS.client]);
    await h.q(`INSERT INTO workspace_hazirlama (client_id, org_id, durum) VALUES ($1, $2, 'hazir')`, [IDS.client, IDS.org]);
    await expect(svc.cevap(ctx, IDS.client, { kod: 'kategori', kategoriler: [] })).rejects.toThrow(/beklemiyor/);
    const [c] = await h.q<{ special_ad_categories: string[] }>(`SELECT special_ad_categories FROM clients WHERE id = $1`, [IDS.client]);
    expect(c!.special_ad_categories).toEqual(['HOUSING']);
  });

  // ── calistir: başarılı yol (Ajan 4, B2) ────────────────────────────────
  // Elle verilen imza gerçek imzayla eşleşmez; YAZABİLEN okuma işi yeniden
  // başlatırdı. Sonucu yalnız okuyabilen bağlamla okuyoruz (B1 kuralı).
  const okuyan = { ...ctx, permissions: ['client.read'] } as unknown as TenantContext;
  const olcumYaniti = (pikseller: string[], sitede: string[]) => ({
    oneri: { kod: 'HEPSI_HAZIR', baslik: 'Ölçüm hazır', metin: 'Tamam' },
    metaPikselleri: { satirlar: pikseller.map((id) => ({ id, ad: `Piksel ${id}`, sonCalisma: '2026-10-11', kullanilamaz: false })) },
    site: { metaPiksel: sitede },
    okumaHatalari: [],
  });

  it('KRİTİK: sorulmamış ve boş kategori "cevaplandı" SAYILMAZ, soru çıkar; rehber "yok" dolduramaz', async () => {
    olcumDurum.mockResolvedValue(olcumYaniti(['111'], ['111']));
    await svc.calistir(ctx, IDS.client, 'b'.repeat(64));
    const s = await satir();
    expect(s!.kategori_cevaplandi).toBe(false);
    const y = await svc.oku(okuyan, IDS.client);
    expect(y.sorular.map((q) => q.kod)).toContain('kategori');
    expect(y.durum).toBe('soru');
  });

  it('KRİTİK: workspace kaydında beyan varsa kategori cevaplandı sayılır, soru çıkmaz', async () => {
    await h.q(`UPDATE clients SET special_ad_categories = '{HOUSING}' WHERE id = $1`, [IDS.client]);
    olcumDurum.mockResolvedValue(olcumYaniti(['111'], ['111']));
    await svc.calistir(ctx, IDS.client, 'b'.repeat(64));
    expect((await satir())!.kategori_cevaplandi).toBe(true);
    const y = await svc.oku(okuyan, IDS.client);
    expect(y.sorular.map((q) => q.kod)).not.toContain('kategori');
    expect(y.adimlar.find((a) => a.kod === 'kategori')?.baslik).toBe('Konut');
  });

  it('KRİTİK: sitedeki piksel seçilir, iki aday soru olur; bütçe para birimiyle saklanır', async () => {
    olcumDurum.mockResolvedValue(olcumYaniti(['111', '222'], ['222']));
    await svc.calistir(ctx, IDS.client, 'b'.repeat(64));
    let y = await svc.oku(okuyan, IDS.client);
    expect(y.varsayilanlar.pikselId).toBe('222');
    expect(y.varsayilanlar.gunlukButceParaBirimi).toBe('TRY');
    expect(y.varsayilanlar.gunlukButceMicros).toBe('500000000');

    await h.q(`DELETE FROM workspace_hazirlama`);
    olcumDurum.mockResolvedValue(olcumYaniti(['111', '222'], []));
    await svc.calistir(ctx, IDS.client, 'b'.repeat(64));
    y = await svc.oku(okuyan, IDS.client);
    expect(y.varsayilanlar.pikselId).toBeNull();
    expect(y.sorular.find((q) => q.kod === 'piksel')).toMatchObject({ secenekler: [{ deger: '111' }, { deger: '222' }] });
  });

  it('KRİTİK: para birimi değişince eski tutar korunmaz, yeniden önerilir', async () => {
    olcumDurum.mockResolvedValue(olcumYaniti(['111'], ['111']));
    await svc.calistir(ctx, IDS.client, 'b'.repeat(64));
    await h.q(`UPDATE ad_accounts SET currency = 'USD'`);
    await svc.calistir(ctx, IDS.client, 'c'.repeat(64));
    const y = await svc.oku(okuyan, IDS.client);
    expect(y.varsayilanlar.gunlukButceParaBirimi).toBe('USD');
    expect(y.varsayilanlar.gunlukButceMicros).toBe('20000000');
    expect(y.adimlar.find((a) => a.kod === 'butce')?.baslik).toBe('Günlük 20 USD');
  });

  it('KRİTİK: site Facebook sayfasından yazılır; imza iş sonunda yeniden hesaplanır (okuma yeniden tetiklemez)', async () => {
    await h.q(
      `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, page_access_token_enc, updated_at)
       VALUES ('66666666-6666-4666-8666-666666666666', $1, $2, $3, 'facebook_page', 'p1', 'Sayfa', '\\x01', now())`,
      [IDS.org, IDS.client, IDS.connection],
    );
    const getir = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ website: 'www.ornek.com' }), { status: 200 }));
    olcumDurum.mockResolvedValue(olcumYaniti(['111'], ['111']));
    try {
      const ilk = await svc.oku(ctx, IDS.client);
      expect(ilk.durum).toBe('calisiyor');
      await vi.waitFor(async () => expect((await svc.oku(ctx, IDS.client)).durum).not.toBe('calisiyor'));
      const [c] = await h.q<{ website: string }>(`SELECT website FROM clients WHERE id = $1`, [IDS.client]);
      expect(c!.website).toBe('https://www.ornek.com/');
      const y = await svc.oku(ctx, IDS.client);
      expect(y.adimlar.find((a) => a.kod === 'site')).toMatchObject({ durum: 'tamam', baslik: 'https://www.ornek.com/' });
      expect(y.durum).not.toBe('calisiyor');
      expect(olcumDurum).toHaveBeenCalledTimes(1);
    } finally {
      getir.mockRestore();
    }
  });

  it('KRİTİK: site sıfır satırla yazılırsa (arada kullanıcı yazdı) kayıttaki adres kullanılır', async () => {
    await h.q(
      `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, page_access_token_enc, updated_at)
       VALUES ('66666666-6666-4666-8666-666666666666', $1, $2, $3, 'facebook_page', 'p1', 'Sayfa', '\\x01', now())`,
      [IDS.org, IDS.client, IDS.connection],
    );
    const getir = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      // Graph cevap verirken kullanıcı Workspace ayarları'ndan adres yazıyor.
      await h.q(`UPDATE clients SET website = 'https://kullanici.com' WHERE id = $1`, [IDS.client]);
      return new Response(JSON.stringify({ website: 'www.sayfa.com' }), { status: 200 });
    });
    olcumDurum.mockResolvedValue(olcumYaniti(['111'], ['111']));
    try {
      await svc.calistir(ctx, IDS.client, 'b'.repeat(64));
      const y = await svc.oku({ ...ctx, permissions: [] } as unknown as TenantContext, IDS.client);
      expect(y.adimlar.find((a) => a.kod === 'site')?.baslik).toBe('https://kullanici.com');
    } finally {
      getir.mockRestore();
    }
  });

  it('KRİTİK: yalnız okuyabilen kullanıcı işi BAŞLATMAZ (site/marka yazımı ve paralı çağrı yok)', async () => {
    const y = await svc.oku({ ...ctx, permissions: ['client.read'] } as unknown as TenantContext, IDS.client);
    expect(y.durum).toBe('bekliyor');
    await new Promise((r) => setTimeout(r, 50));
    expect(olcumDurum).not.toHaveBeenCalled();
    expect(await satir()).toBeUndefined();
  });

  it('KRİTİK: kategori yazılamazsa (sıfır satır) "cevaplandı" BASILMAZ', async () => {
    await h.q(
      `INSERT INTO workspace_hazirlama (client_id, org_id, durum, sorular) VALUES ($1, $2, 'soru', '[{"kod":"kategori","soru":"?"}]')`,
      [IDS.client, IDS.org],
    );
    const yazmaz = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn({ ...h.db, $queryRaw: async (q: { sql: string }) => (q.sql.startsWith('UPDATE clients') ? [] : h.db.$queryRaw(q as never)) }) };
    const s2 = new HazirlamaService(yazmaz as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, { record: vi.fn() } as never);
    await expect(s2.cevap(ctx, IDS.client, { kod: 'kategori', kategoriler: [] })).rejects.toThrow(/kaydedilemedi/);
    expect((await satir())!.kategori_cevaplandi).toBe(false);
  });

  it('KRİTİK: seçenekler dışındaki piksel kabul edilmez', async () => {
    await h.q(
      `INSERT INTO workspace_hazirlama (client_id, org_id, durum, sorular) VALUES ($1, $2, 'soru', '[{"kod":"piksel","soru":"?","secenekler":[{"deger":"111","etiket":"A"}]}]')`,
      [IDS.client, IDS.org],
    );
    await expect(svc.cevap(ctx, IDS.client, { kod: 'piksel', pikselId: '999' })).rejects.toThrow(/seçenekler/);
    const y = await svc.cevap(ctx, IDS.client, { kod: 'piksel', pikselId: '111' });
    expect(y.varsayilanlar.pikselId).toBe('111');
  });

  it('bütçe cevabı hesabın para birimiyle başlık yazar', async () => {
    await h.q(`INSERT INTO workspace_hazirlama (client_id, org_id, durum) VALUES ($1, $2, 'hazir')`, [IDS.client, IDS.org]);
    const y = await svc.cevap(ctx, IDS.client, { kod: 'butce', gunlukButceMicros: '750000000' });
    expect(y.adimlar.find((a) => a.kod === 'butce')?.baslik).toBe('Günlük 750 ₺');
    expect(y.varsayilanlar.gunlukButceMicros).toBe('750000000');
  });

  it('başka workspace reddedilir', async () => {
    await expect(svc.oku({ ...ctx, clientIds: [] } as TenantContext, IDS.client)).rejects.toThrow(/erişimin yok/);
  });
});
