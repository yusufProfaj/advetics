import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  KURULUM_SATIR_DURUMLARI,
  NESNE_DURUMLARI,
  ONERI_ACIK_DURUMLARI,
  ONERI_DURUMLARI,
  ONERI_TURLERI,
  PILOT_PLAN_DURUMLARI,
  PILOT_PLAN_SON_DURUMLARI,
} from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';

/**
 * ═══ PİLOT ŞEMASI ↔ SÖZLEŞME ═══
 *
 * CHECK listeleri ve kısmi indeks yüklemleri VERİTABANINDAN okunuyor
 * (`pg_get_constraintdef`), migration metninden değil: metni taramak,
 * sonradan bir ALTER'ın değiştirdiği kısıtı göremezdi. Liste büyür CHECK
 * büyümezse yeni durum üretimde UPDATE'te patlar; tersi, kodun hiç
 * yazmayacağı bir durumu veritabanının kabul etmesi.
 */
let h: Harness;
const OZET = 'b'.repeat(64);

beforeAll(async () => {
  h = await createHarness();
}, 60_000);
afterAll(async () => h?.close());
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
});

async function checkDegerleri(tablo: string, kisit: string): Promise<string[]> {
  const [r] = await h.q<{ d: string }>(
    `SELECT pg_get_constraintdef(c.oid) AS d FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
      WHERE t.relname = $1 AND c.conname = $2`,
    [tablo, kisit],
  );
  if (!r) throw new Error(`Kısıt yok: ${tablo}.${kisit} — tarama boşa düşerdi`);
  return [...r.d.matchAll(/'([^']+)'::/g)].map((m) => m[1]!).sort();
}
async function indeksYuklemi(ad: string): Promise<string[]> {
  const [r] = await h.q<{ d: string }>(`SELECT pg_get_indexdef(indexrelid) AS d FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid WHERE c.relname = $1`, [ad]);
  if (!r) throw new Error(`İndeks yok: ${ad}`);
  return [...r.d.matchAll(/'([^']+)'::/g)].map((m) => m[1]!).sort();
}
const sirala = (a: readonly string[]) => [...a].sort();

describe('CHECK ↔ shared sabitleri', () => {
  it('KRİTİK: plan, kurulum, nesne, öneri durumları ve öneri türleri BİREBİR aynı', async () => {
    expect(await checkDegerleri('pilot_planlari', 'pilot_planlari_durum_chk')).toEqual(sirala(PILOT_PLAN_DURUMLARI));
    expect(await checkDegerleri('pilot_kurulum_satirlari', 'pilot_kurulum_satirlari_durum_chk')).toEqual(sirala(KURULUM_SATIR_DURUMLARI));
    expect(await checkDegerleri('pilot_nesneleri', 'pilot_nesneleri_durum_chk')).toEqual(sirala(NESNE_DURUMLARI));
    expect(await checkDegerleri('pilot_onerileri', 'pilot_onerileri_durum_chk')).toEqual(sirala(ONERI_DURUMLARI));
    expect(await checkDegerleri('pilot_onerileri', 'pilot_onerileri_tur_chk')).toEqual(sirala(ONERI_TURLERI));
  });

  it('KRİTİK: açık plan indeksi tam olarak SON durumları dışarıda bırakıyor; açık öneri indeksi açık durumları kapsıyor', async () => {
    expect(await indeksYuklemi('pilot_planlari_acik_donem_key')).toEqual(sirala(PILOT_PLAN_SON_DURUMLARI));
    expect(await indeksYuklemi('pilot_onerileri_acik_key')).toEqual(sirala(ONERI_ACIK_DURUMLARI));
  });
});

async function plan(over: Record<string, unknown> = {}): Promise<string> {
  const alanlar = { org_id: IDS.org, client_id: IDS.client, donem: '2026-11', icerik_ozeti: OZET, ...over };
  const k = Object.keys(alanlar);
  const [r] = await h.q<{ id: string }>(
    `INSERT INTO pilot_planlari (${k.join(', ')}) VALUES (${k.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id::text`,
    Object.values(alanlar),
  );
  return r!.id;
}
const onayli = {
  durum: 'onaylandi',
  onay_rolu: 'musteri',
  onay_zamani: '2026-10-07T10:00:00Z',
  onaylanan_surum: 1,
  onaylanan_ozet: OZET,
  yayin_kipi: 'kapali',
};

describe('onay izi', () => {
  it('KRİTİK: onaylanmış plan onay izi olmadan yazılamaz', async () => {
    await expect(plan({ durum: 'onaylandi' })).rejects.toThrow(/pilot_planlari_onay_izi_chk/);
    await expect(plan({ ...onayli, yayin_kipi: null })).rejects.toThrow(/pilot_planlari_onay_izi_chk/);
    expect(await plan(onayli)).toMatch(/[0-9a-f-]{36}/);
  });

  it('KRİTİK: ajans müşteri adına onayında 20 karakterden kısa gerekçe reddedilir', async () => {
    await expect(plan({ ...onayli, onay_rolu: 'ajans', musteri_adina_gerekce: 'ok' })).rejects.toThrow(/pilot_planlari_gerekce_chk/);
    await plan({ ...onayli, onay_rolu: 'ajans', musteri_adina_gerekce: 'Müşteri telefonda onay verdi, 7 Ekim' });
  });

  it('KRİTİK: onay izi değişmez; yayın kipi yalnız gerçeğe doğru değişir (S-6)', async () => {
    const id = await plan(onayli);
    await expect(h.q(`UPDATE pilot_planlari SET onaylanan_ozet = $2 WHERE id = $1`, [id, 'c'.repeat(64)])).rejects.toThrow(/onay izi degismez/);
    await expect(h.q(`UPDATE pilot_planlari SET onaylanan_surum = 2 WHERE id = $1`, [id])).rejects.toThrow(/onay izi degismez/);
    await h.q(`UPDATE pilot_planlari SET yayin_kipi = 'gercek' WHERE id = $1`, [id]);
    await expect(h.q(`UPDATE pilot_planlari SET yayin_kipi = 'test' WHERE id = $1`, [id])).rejects.toThrow(/yalniz gercege/);
    // Durum ilerlemesi serbest.
    await h.q(`UPDATE pilot_planlari SET durum = 'kuruluyor' WHERE id = $1`, [id]);
  });

  it('iptal edilen ay yeni plana açılır; açık ay ikinci planı reddeder', async () => {
    const a = await plan();
    await expect(plan()).rejects.toThrow(/pilot_planlari_acik_donem_key/);
    await h.q(`UPDATE pilot_planlari SET durum = 'iptal' WHERE id = $1`, [a]);
    await plan();
  });
});

describe('değişmez kayıtlar', () => {
  it('KRİTİK: plan sürümünün içeriği değişmez; workspace taşıması (org_id) serbest', async () => {
    const p = await plan();
    await h.q(
      `INSERT INTO pilot_plan_surumleri (plan_id, org_id, client_id, surum, icerik, icerik_ozeti, kaynak) VALUES ($1, $2, $3, 1, '{"a":1}', $4, 'uretici')`,
      [p, IDS.org, IDS.client, OZET],
    );
    await expect(h.q(`UPDATE pilot_plan_surumleri SET icerik = '{"a":2}' WHERE plan_id = $1`, [p])).rejects.toThrow(/degismez/);
    await expect(h.q(`UPDATE pilot_plan_surumleri SET icerik_ozeti = $2 WHERE plan_id = $1`, [p, 'c'.repeat(64)])).rejects.toThrow(/degismez/);
    const r = await h.q(`UPDATE pilot_plan_surumleri SET org_id = org_id WHERE plan_id = $1 RETURNING id`, [p]);
    expect(r).toHaveLength(1);
  });

  it('KRİTİK: uyum denetimi değişmez; plan anında satır anahtarı yok, taslak anında var', async () => {
    const p = await plan();
    const ekle = (an: string, satir: string | null) =>
      h.q<{ id: string }>(
        `INSERT INTO pilot_uyum_denetimleri (plan_id, org_id, client_id, surum, icerik_ozeti, katalog_surumu, an, satir_anahtari, bulgular, profil)
         VALUES ($1, $2, $3, 1, $4, '2026.10.1', $5, $6, '[]', '{}') RETURNING id::text`,
        [p, IDS.org, IDS.client, OZET, an, satir],
      );
    const [d] = await ekle('plan', null);
    await expect(ekle('plan', 'meta:soguk:x')).rejects.toThrow(/pilot_uyum_denetimleri_satir_chk/);
    await expect(ekle('taslak', null)).rejects.toThrow(/pilot_uyum_denetimleri_satir_chk/);
    await expect(h.q(`UPDATE pilot_uyum_denetimleri SET bulgular = '[{"x":1}]' WHERE id = $1`, [d!.id])).rejects.toThrow(/degismez/);
  });

  it('KRİTİK: nesne gövdesi değişmez, durumu ilerler; aynı kurulumda aynı ad ikinci kez açılmaz', async () => {
    const p = await plan(onayli);
    const [s] = await h.q<{ id: string }>(
      `INSERT INTO pilot_kurulum_satirlari (plan_id, org_id, client_id, onaylanan_surum, satir_anahtari, platform, ad)
       VALUES ($1, $2, $3, 1, 'meta:soguk:x', 'meta', 'A') RETURNING id::text`,
      [p, IDS.org, IDS.client],
    );
    await expect(
      h.q(`INSERT INTO pilot_kurulum_satirlari (plan_id, org_id, client_id, onaylanan_surum, satir_anahtari, platform, ad) VALUES ($1, $2, $3, 1, 'meta:soguk:x', 'meta', 'A')`, [p, IDS.org, IDS.client]),
    ).rejects.toThrow(/pilot_kurulum_satirlari_satir_key/);
    const [n] = await h.q<{ id: string }>(
      `INSERT INTO pilot_nesneleri (kurulum_satir_id, org_id, client_id, tur, ad, sira, derlenmis_govde) VALUES ($1, $2, $3, 'kampanya', 'kampanya', 1, '{"a":1}') RETURNING id::text`,
      [s!.id, IDS.org, IDS.client],
    );
    await expect(h.q(`UPDATE pilot_nesneleri SET derlenmis_govde = '{"a":2}' WHERE id = $1`, [n!.id])).rejects.toThrow(/govdesi degismez/);
    const r = await h.q(`UPDATE pilot_nesneleri SET durum = 'gonderiliyor' WHERE id = $1 RETURNING id`, [n!.id]);
    expect(r).toHaveLength(1);
  });
});
