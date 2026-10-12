import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ETIKET_SINIRI } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import { briefAyir, etiketAyir, istanbulGunu, sayacDurumu } from './sayac';

/**
 * ═══ MALİYET BEKÇİSİ — AYIRMA TEK DEYİM ═══
 *
 * Sınırın KENDİSİ veritabanında: ayırma `WHERE istek < sınır` taşıyan tek
 * bir upsert. Burada paralel ayırmalar sınırın bir fazlasını bile
 * alamıyor; aylık ve küresel toplam da aynı deyimde.
 *
 * NOT: PGlite tek bağlantı, yani paralel `Promise.all` gerçekte sırayla
 * koşuyor. Bu test "oku-karşılaştır-yaz" ayrımını yakalıyor (ayrı okuma
 * yapan bir uygulama burada da sınırı aşardı, çünkü sayım deyimler arası
 * okunur); satır kilidiyle yarış davranışı Postgres'in garantisi.
 */

let h: Harness;
const GUN = '2026-10-12';
const DIGER = '33333333-0000-4000-8000-000000000001';

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
});

const ayir = () => etiketAyir(h.db, { orgId: IDS.org, clientId: IDS.client, gun: GUN });

describe('etiket ayırma', () => {
  it('KRİTİK: dört paralel ayırma sınırı AŞAMIYOR (iki hak kalmışken tam iki tanesi geçiyor)', async () => {
    await h.q(`INSERT INTO kreatif_etiket_sayaci (org_id, client_id, gun, etiket_istek) VALUES ($1, $2, $3, $4)`, [
      IDS.org,
      IDS.client,
      GUN,
      ETIKET_SINIRI.workspaceGunluk - 2,
    ]);
    const sonuc = await Promise.all([ayir(), ayir(), ayir(), ayir()]);
    expect(sonuc.filter(Boolean)).toHaveLength(2);
    const [r] = await h.q<{ etiket_istek: number }>(`SELECT etiket_istek FROM kreatif_etiket_sayaci`);
    expect(r!.etiket_istek).toBe(ETIKET_SINIRI.workspaceGunluk);
  });

  it('ilk ayırma satırı açıyor; günlük sınırda reddediyor', async () => {
    expect(await ayir()).toBe(true);
    await h.q(`UPDATE kreatif_etiket_sayaci SET etiket_istek = $1`, [ETIKET_SINIRI.workspaceGunluk]);
    expect(await ayir()).toBe(false);
  });

  it('KRİTİK: AYLIK sınır başka günlerin toplamından; yeni günün ilk ayırması bile reddediliyor', async () => {
    await h.q(`INSERT INTO kreatif_etiket_sayaci (org_id, client_id, gun, etiket_istek) VALUES ($1, $2, '2026-10-03', $3)`, [
      IDS.org,
      IDS.client,
      ETIKET_SINIRI.workspaceAylik,
    ]);
    expect(await ayir()).toBe(false);
    // Önceki ayın toplamı bu ayı etkilemiyor.
    await h.q(`UPDATE kreatif_etiket_sayaci SET gun = '2026-09-28'`);
    expect(await ayir()).toBe(true);
  });

  it('KÜRESEL sınır başka workspace’lerin toplamından', async () => {
    await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Diğer', 'diger', now())`, [DIGER, IDS.org]);
    await h.q(`INSERT INTO kreatif_etiket_sayaci (org_id, client_id, gun, etiket_istek) VALUES ($1, $2, $3, $4)`, [
      IDS.org,
      DIGER,
      GUN,
      ETIKET_SINIRI.kureselGunluk,
    ]);
    expect(await ayir()).toBe(false);
    const d = await sayacDurumu(h.db, IDS.client, GUN);
    expect(d.kureselBugun).toBe(ETIKET_SINIRI.kureselGunluk);
  });
});

describe('brief ayırma', () => {
  it('günde en çok briefGunluk; altıncısı reddediliyor', async () => {
    const r: boolean[] = [];
    for (let i = 0; i < ETIKET_SINIRI.briefGunluk + 1; i++) r.push(await briefAyir(h.db, { orgId: IDS.org, clientId: IDS.client, gun: GUN }));
    expect(r.filter(Boolean)).toHaveLength(ETIKET_SINIRI.briefGunluk);
    expect(r.at(-1)).toBe(false);
  });
});

describe('İstanbul günü', () => {
  it('UTC 21:30 İstanbul’da ertesi gün', () => {
    expect(istanbulGunu(new Date('2026-10-11T21:30:00Z'))).toBe('2026-10-12');
  });
});
