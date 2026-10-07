import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { pilotTaslakEksikleri, planUret, satirdanTaslak } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import type { MetinUretici } from '../../yapay-zeka/gemini';
import { planGirdisi, T, U } from '../../../test/pilot-fixture';
import { reklamMetniYaz, secim, taslakBaglamiOku } from './taslak-baglami';

/**
 * ═══ TASLAK BAĞLAMI VE REKLAM METNİ ═══
 * Okuyucu gerçek şemaya karşı; metin süzgeci sahte Gemini ile.
 */
let h: Harness;
const SAYFA = '66666666-0000-4000-8000-000000000001';
const SAYFA2 = '66666666-0000-4000-8000-000000000002';
const IG = '66666666-0000-4000-8000-000000000003';
const KITLE = '77777777-0000-4000-8000-000000000001';
const IKINCI = '44444444-0000-4000-8000-0000000000bb';
const SIMDI = new Date('2026-10-07T06:00:00Z');

beforeAll(async () => {
  h = await createHarness();
}, 60_000);
afterAll(async () => h?.close());
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, linked_ad_account_id, updated_at)
     VALUES ($1, $3, $4, $5, 'facebook_page', 'p1', 'Sayfa', $6, now()),
            ($2, $3, $4, $5, 'instagram_business', 'ig1', 'IG', NULL, now())`,
    [SAYFA, IG, IDS.org, IDS.client, IDS.connection, IDS.adAccount],
  );
  await h.q(`UPDATE social_profiles SET parent_page_external_id = 'p1' WHERE id = $1`, [IG]);
  await h.q(
    `INSERT INTO audience_templates (id, org_id, client_id, name, locations, updated_at)
     VALUES ($1, $2, $3, 'Genel', '[{"key":"TR","type":"country","label":"Türkiye","countryCode":"TR"}]', now())`,
    [KITLE, IDS.org, IDS.client],
  );
  await h.q(`UPDATE clients SET website = 'https://ornek.com', ozel_kategori_beyan_zamani = now() WHERE id = $1`, [IDS.client]);
});

const oku = () =>
  taslakBaglamiOku(h.db, { planId: U(50), planSurum: 1, onayZamani: T, clientId: IDS.client, platform: 'meta', takvim: { baslangic: '2026-11-01', bitis: '2026-11-30' }, simdi: SIMDI });

describe('taslak bağlamı', () => {
  it('KRİTİK: tek hesap/tek sayfa seçilir; IG sayfaya bağlı olan; konum kitle şablonundan KOPYA', async () => {
    const { baglam } = await oku();
    expect(baglam.hesap?.deger).toBe(IDS.adAccount);
    expect(baglam.sayfa?.deger).toBe(SAYFA);
    expect(baglam.instagram?.deger).toBe(IG);
    expect(baglam.kitleKonumlari.get(KITLE)?.deger).toEqual([{ tur: 'country', key: 'TR', etiket: 'Türkiye', ulkeKodu: 'TR' }]);
    expect(baglam.hedefAdres?.deger).toBe('https://ornek.com');
    expect(baglam.ozelKategoriler?.deger).toEqual([]);
    expect(baglam.onayKaynagi).toMatchObject({ tur: 'onayli_plan', kimlik: `${U(50)}@1` });
  });

  it('KRİTİK: özel kategori sorusu cevaplanmadıysa bağlam null ve taslak OZK-SORU ile durur', async () => {
    await h.q(`UPDATE clients SET ozel_kategori_beyan_zamani = NULL WHERE id = $1`, [IDS.client]);
    const { baglam } = await oku();
    expect(baglam.ozelKategoriler).toBeNull();
    const plan = planUret(planGirdisi({ hesaplar: [{ id: U(3), platform: 'meta', paraBirimi: 'TRY' }] }));
    const t = satirdanTaslak(plan.satirlar[0]!, baglam);
    expect(pilotTaslakEksikleri(t).map((e) => e.kod)).toContain('OZK-SORU');
  });

  it('KRİTİK: birden çok hesap varken bağ yoksa SEÇİLMEZ (tahmin yok)', () => {
    expect(secim(['a', 'b'], [{ id: 's', dis: 'p', hesap: null }])).toMatchObject({ hesap: null, sayfa: { id: 's' } });
    expect(secim(['a', 'b'], [{ id: 's', dis: 'p', hesap: 'b' }])).toMatchObject({ hesap: 'b', hesapNedeni: 'Sayfanın boost hesabı' });
    expect(secim(['a'], [{ id: 's1', dis: 'p1', hesap: null }, { id: 's2', dis: 'p2', hesap: null }])).toMatchObject({ hesap: 'a', sayfa: null });
  });

  it('iki sayfa varken boost hesabı eşleşen sayfa seçilir', async () => {
    await h.q(
      `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, sync_enabled, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', 'act_5550002', 'İkinci', 'TRY', 'Europe/Istanbul', true, now())`,
      [IKINCI, IDS.org, IDS.client, IDS.connection],
    );
    await h.q(
      `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at) VALUES ($1, $2, $3, $4, 'facebook_page', 'p2', 'Sayfa 2', now())`,
      [SAYFA2, IDS.org, IDS.client, IDS.connection],
    );
    const { baglam } = await oku();
    expect(baglam.hesap?.deger).toBe(IDS.adAccount);
    expect(baglam.sayfa?.deger).toBe(SAYFA);
  });
});

describe('reklam metni', () => {
  const sahte = (cevap: unknown): MetinUretici =>
    ({ model: 'sahte', uret: async () => ({ parcalar: [{ text: JSON.stringify(cevap) }], sebep: 'bitti', aciklama: null, girdiToken: 0, ciktiToken: 0, onbellekToken: 0 }) }) as unknown as MetinUretici;
  const marka = { ad: 'Kahveci', uslup: null, vaatler: ['2 yıl garanti'], bilgi: null, hedefKitle: null, sablonlar: [] };
  const taslak = () => {
    const plan = planUret(planGirdisi());
    return satirdanTaslak(plan.satirlar[0]!, {
      planId: U(50), planSurum: 1, onayKaynagi: { tur: 'onayli_plan', kimlik: 'x@1', zaman: T }, takvim: plan.takvim!,
      hesap: null, sayfa: null, instagram: null, kitleKonumlari: new Map(), ozelKategoriler: null, hedefAdres: null, formSablonuId: null, tabanNegatifler: null, zaman: T,
    });
  };

  it('KRİTİK: marka bilgisinde olmayan sayı → metin kullanılmaz', async () => {
    const r = await reklamMetniYaz(sahte({ metinler: [{ baslik: 'Kahve', metin: 'Bu hafta %30 indirim' }] }), taslak(), { marka, yasalUyari: null }, [{ id: U(21), ad: 'a' }]);
    expect(r).toMatchObject({ tur: 'ret' });
    // Markanın kendi sayısı serbest.
    const ok = await reklamMetniYaz(sahte({ metinler: [{ baslik: 'Kahve', metin: '2 yıl garantiyle' }] }), taslak(), { marka, yasalUyari: null }, [{ id: U(21), ad: 'a' }]);
    expect(ok.tur).toBe('tamam');
  });

  it('KRİTİK: yasal uyarı model yazmadıysa metnin BAŞINA eklenir ve söylenir; uzun başlık kısaltılır', async () => {
    const r = await reklamMetniYaz(
      sahte({ metinler: [{ baslik: 'Sabah kahveniz için çok güzel bir makine burada', metin: 'Taze kahve keyfi' }] }),
      taslak(),
      { marka, yasalUyari: 'Kampanya stoklarla sınırlıdır.' },
      [{ id: U(21), ad: 'a' }],
    );
    if (r.tur !== 'tamam') throw new Error(r.mesaj);
    expect(r.metinler[0]!.metin.startsWith('Kampanya stoklarla sınırlıdır.')).toBe(true);
    expect(r.metinler[0]!.baslik.length).toBeLessThanOrEqual(40);
    expect(r.notlar.join(' ')).toMatch(/yasal uyarı/);
    expect(r.notlar.join(' ')).toMatch(/kısaltıldı/);
  });

  it('model bağlı değilse ret (sessiz boş metin değil)', async () => {
    expect(await reklamMetniYaz(null, taslak(), { marka, yasalUyari: null }, [])).toMatchObject({ tur: 'ret' });
  });
});
