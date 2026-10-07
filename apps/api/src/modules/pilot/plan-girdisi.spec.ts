import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { planUret } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import { katmanTuret, planGirdisiOku } from './plan-girdisi';

/**
 * ═══ PLAN GİRDİSİ OKUYUCUSU — gerçek şema (PGlite) ═══
 *
 * Okuyucu üretim sorgularını koşuyor; testler sonucu `planUret`e de veriyor
 * ki "okunan" ile "plana giren" arasındaki bağ da sınansın.
 */
let h: Harness;
const OTEKI = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HAVUZ = '44444444-0000-4000-8000-0000000000ff';
const GOOGLE = '44444444-0000-4000-8000-0000000000aa';
const KITLE = '77777777-0000-4000-8000-000000000001';
const KITLE_SICAK = '77777777-0000-4000-8000-000000000002';
const KITLE_BELIRSIZ = '77777777-0000-4000-8000-000000000003';
const VARLIK = '88888888-0000-4000-8000-000000000001';
const VARLIK_B = '88888888-0000-4000-8000-000000000002';
// 7 Ekim 2026, 09:00 İstanbul.
const SIMDI = new Date('2026-10-07T06:00:00Z');

beforeAll(async () => {
  h = await createHarness();
}, 60_000);
afterAll(async () => h?.close());

async function metrik(hesap: string, platform: string, tarih: string, tl: number, donusum: number, seviye = 'campaign', varlik?: string) {
  await h.q(
    `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date, spend_micros, conversions, currency)
     VALUES ($1, $2, $3, $4, COALESCE($8::uuid, gen_random_uuid()), 'x', $5, $6, $7, 'TRY')`,
    [IDS.client, hesap, platform, seviye, tarih, BigInt(tl) * 1_000_000n, donusum, varlik ?? null],
  );
}
async function metrikIsi(hesap: string, bitti: string) {
  await h.q(
    `INSERT INTO sync_jobs (client_id, ad_account_id, job_type, status, finished_at) VALUES ($1, $2, 'insights_daily', 'succeeded', $3)`,
    [IDS.client, hesap, bitti],
  );
}

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Öteki', 'oteki', now())`, [OTEKI, IDS.org]);
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, sync_enabled, updated_at)
     VALUES ($1, $3, $4, $5, 'google', '5550001111', 'G', 'TRY', 'Europe/Istanbul', true, now()),
            ($2, $3, NULL, $5, 'meta', 'act_77777', 'Havuz', 'TRY', 'Europe/Istanbul', false, now())`,
    [GOOGLE, HAVUZ, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(
    `INSERT INTO monthly_budgets (id, org_id, client_id, month, amount_micros, currency, updated_at)
     VALUES (gen_random_uuid(), $1, $2, '2026-10-01', 100000000000, 'TRY', now()), (gen_random_uuid(), $1, $2, '2026-11-01', 120000000000, 'TRY', now())`,
    [IDS.org, IDS.client],
  );
  await h.q(
    `INSERT INTO audience_templates (id, org_id, client_id, name, ozel_kitleler, updated_at) VALUES
       ($1, $4, $5, 'Genel', '[]', now()),
       ($2, $4, $5, 'Instagram etkileşimi', '[{"id":"1","name":"IG etkileşim 180","tip":"ozel","mod":"dahil","hesapId":"${IDS.adAccount}","hesapAdi":"H"}]', now()),
       ($3, $4, $5, 'Liste', '[{"id":"2","name":"CRM listesi","tip":"ozel","mod":"dahil","hesapId":"${IDS.adAccount}","hesapAdi":"H"}]', now())`,
    [KITLE, KITLE_SICAK, KITLE_BELIRSIZ, IDS.org, IDS.client],
  );
  await h.q(
    `INSERT INTO client_profiles (id, org_id, client_id, ana_amac, varsayilan_kitle_id, urun_kategorileri, updated_at) VALUES (gen_random_uuid(), $1, $2, 'website', $3, ARRAY['kahve makinesi'], now())`,
    [IDS.org, IDS.client, KITLE],
  );
  await h.q(
    `INSERT INTO assets (id, org_id, client_id, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $3, $4, 'Görsel A', 'a.jpg', 'image/jpeg', 1, 1080, 1080, 'k/a', 'aaaaaaaaaaaaaaaa1', now()),
            ($2, $3, $5, 'Başkasının', 'b.jpg', 'image/jpeg', 1, 1080, 1080, 'k/b', 'aaaaaaaaaaaaaaaa2', now())`,
    [VARLIK, VARLIK_B, IDS.org, IDS.client, OTEKI],
  );
});

describe('plan girdisi', () => {
  it('KRİTİK: havuz hesabı ve başka workspace’in varlığı girdiye girmez', async () => {
    const { girdi } = await planGirdisiOku(h.db, IDS.client, '2026-11', SIMDI);
    expect(girdi.hesaplar.map((x) => x.id).sort()).toEqual([IDS.adAccount, GOOGLE].sort());
    expect(girdi.varliklar.map((v) => v.id)).toEqual([VARLIK]);
    expect(girdi.bugun).toBe('2026-10-07');
    expect(girdi.aylikButce?.micros).toBe(120_000_000_000n);
  });

  it('KRİTİK: 90 gün yalnız kampanya seviyesinden (seviyeler toplanmaz); kesirli dönüşüm aşağı', async () => {
    await metrik(IDS.adAccount, 'meta', '2026-09-01', 1000, 10.75);
    await metrik(IDS.adAccount, 'meta', '2026-09-01', 900, 9, 'ad');
    await metrik(IDS.adAccount, 'meta', '2026-06-01', 5000, 50); // pencere dışı
    const { girdi } = await planGirdisiOku(h.db, IDS.client, '2026-11', SIMDI);
    expect(girdi.gecmis?.pencere).toEqual({ from: '2026-07-09', to: '2026-10-06' });
    expect(girdi.gecmis?.platformlar).toEqual([{ platform: 'meta', harcamaMicros: 1000_000_000n, sonuc: 10 }]);
  });

  it('gelecek ay için harcanan 0 ve kaynağı adlı kural', async () => {
    const { girdi } = await planGirdisiOku(h.db, IDS.client, '2026-11', SIMDI);
    expect(girdi.ayHarcanan).toMatchObject({ deger: 0n, kaynak: { tur: 'sabit_kural', kimlik: 'GELECEK_AY' } });
  });

  it('KRİTİK: cari ayda senkron eskiyse harcanan BİLİNMİYOR (null), plan toplamı boş + neden', async () => {
    await metrik(IDS.adAccount, 'meta', '2026-10-03', 30_000, 1);
    await metrikIsi(IDS.adAccount, '2026-10-07T03:00:00Z');
    await metrikIsi(GOOGLE, '2026-10-04T03:00:00Z'); // dünden eski
    const r = await planGirdisiOku(h.db, IDS.client, '2026-10', SIMDI);
    expect(r.girdi.ayHarcanan).toBeNull();
    const p = planUret(r.girdi);
    expect(p.toplam).toEqual({ dolu: false, emptyReason: 'harcanan_bilinmiyor' });
  });

  it('KRİTİK: cari ayda senkron tazeyse harcanan ayın başından DÜNE kadar; bugün dahil değil', async () => {
    await metrik(IDS.adAccount, 'meta', '2026-10-03', 30_000, 1);
    await metrik(IDS.adAccount, 'meta', '2026-10-07', 5_000, 0); // bugün
    await metrik(IDS.adAccount, 'meta', '2026-09-30', 7_000, 0); // geçen ay
    await metrikIsi(IDS.adAccount, '2026-10-06T22:00:00Z'); // 7 Ekim 01:00 İstanbul
    await metrikIsi(GOOGLE, '2026-10-05T22:30:00Z'); // 6 Ekim 01:30 İstanbul = dünün içinde
    const r = await planGirdisiOku(h.db, IDS.client, '2026-10', SIMDI);
    expect(r.girdi.ayHarcanan).toMatchObject({ deger: 30_000_000_000n, kaynak: { pencere: { from: '2026-10-01', to: '2026-10-06' } } });
    const p = planUret(r.girdi);
    expect(p.toplam).toMatchObject({ dolu: true, deger: '70000000000' });
  });

  it('kitle katmanı: özel kitlesiz → soğuk, etkileşim adı → sıcak, okunamayan ad → null (plana girmez)', async () => {
    const { girdi } = await planGirdisiOku(h.db, IDS.client, '2026-11', SIMDI);
    const k = new Map(girdi.kitleler.map((x) => [x.id, x]));
    expect(k.get(KITLE)).toMatchObject({ katman: 'soguk', varsayilan: true });
    expect(k.get(KITLE_SICAK)!.katman).toBe('sicak');
    expect(k.get(KITLE_BELIRSIZ)!.katman).toBeNull();
    const p = planUret(girdi);
    expect(p.satirlar.some((s) => s.kitle?.dolu && s.kitle.deger.id === KITLE_BELIRSIZ)).toBe(false);
  });

  it('katmanTuret: hariç tutulan kitle katmanı belirlemez; benzer kitle soğuk', () => {
    const o = (name: string, tip: 'ozel' | 'benzer', mod: 'dahil' | 'haric') => ({ id: '1', name, tip, mod, hesapId: IDS.adAccount, hesapAdi: 'H' });
    expect(katmanTuret([o('Site ziyaretçisi', 'ozel', 'haric')])).toBe('soguk');
    expect(katmanTuret([o('Benzer %1', 'benzer', 'dahil')])).toBe('soguk');
    expect(katmanTuret([o('Site ziyaretçisi 30 gün', 'ozel', 'dahil')])).toBe('yeniden_pazarlama');
    expect(katmanTuret('bozuk')).toBe('soguk');
  });

  it('KRİTİK: varlık performansı reklam seviyesinden, hash eşleşmesiyle', async () => {
    const [cr] = await h.q<{ id: string }>(
      `INSERT INTO creatives (id, ad_account_id, client_id, platform, external_id, raw, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'meta', 'cr1', '{"object_story_spec":{"link_data":{"image_hash":"HASH1"}}}', now()) RETURNING id::text`,
      [IDS.adAccount, IDS.client],
    );
    await h.q(`INSERT INTO asset_platform_refs (id, org_id, asset_id, platform, ad_account_id, external_ref) VALUES (gen_random_uuid(), $1, $2, 'meta', $3, 'HASH1')`, [IDS.org, VARLIK, IDS.adAccount]);
    const [c] = await h.q<{ id: string }>(
      `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, updated_at) VALUES (gen_random_uuid(), $1, $2, 'meta', 'c1', 'K', now()) RETURNING id::text`,
      [IDS.adAccount, IDS.client],
    );
    const [g] = await h.q<{ id: string }>(
      `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, 'meta', 'g1', 'G', now()) RETURNING id::text`,
      [c!.id, IDS.adAccount, IDS.client],
    );
    const [ad] = await h.q<{ id: string }>(
      `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id, name, creative_id, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, 'meta', 'a1', 'R', $4, now()) RETURNING id::text`,
      [g!.id, IDS.adAccount, IDS.client, cr!.id],
    );
    await metrik(IDS.adAccount, 'meta', '2026-09-10', 400, 8, 'ad', ad!.id);
    const { girdi } = await planGirdisiOku(h.db, IDS.client, '2026-11', SIMDI);
    expect(girdi.varliklar[0]!.performans).toMatchObject({ harcamaMicros: 400_000_000n, sonuc: 8 });
  });

  it('kelime fikri: kelime başına en yeni çekim; grubu olmayan tohumla gruplanır', async () => {
    const [p] = await h.q<{ id: string }>(
      `INSERT INTO strateji_planlari (org_id, client_id, donem, toplam_butce_micros, para_birimi) VALUES ($1, $2, '2026-11', 1, 'TRY') RETURNING id::text`,
      [IDS.org, IDS.client],
    );
    await h.q(
      `INSERT INTO strateji_kelimeleri (plan_id, org_id, client_id, kelime, aylik_arama, grup, cekim_zamani, kaynak_istek)
       VALUES ($1, $2, $3, 'filtre kahve makinesi', 9900, NULL, '2026-10-01', '{}')`,
      [p!.id, IDS.org, IDS.client],
    );
    const { girdi } = await planGirdisiOku(h.db, IDS.client, '2026-11', SIMDI);
    expect(girdi.kelimeler).toEqual([expect.objectContaining({ kelime: 'filtre kahve makinesi', grup: 'kahve makinesi', aylikArama: 9900 })]);
  });
});
