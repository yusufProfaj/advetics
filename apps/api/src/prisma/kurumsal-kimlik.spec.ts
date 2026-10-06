import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../test/pglite-harness';

/**
 * ═══ KURUMSAL KİMLİK MIGRATION'I — YALNIZCA ESKİ VARSAYILAN DEĞİŞİR ═══
 *
 * Marka profili CSS'i eziyor; eski varsayılanla duran profiller güncellenmezse
 * yeni kimlik hiçbir panelde görünmezdi. Ama rengini BİLEREK seçmiş bir
 * beyaz etiket profiline dokunmak, ürünün ana vaadini bozmak olurdu.
 * Koşum şemayı migration'ların tamamından kuruyor; eski satırlar burada
 * migration ELLE yeniden çalıştırılarak sınanıyor (üretim sırası: satır
 * önce var, migration sonra).
 */
const SQL = readFileSync(
  resolve(__dirname, '../../prisma/migrations/20261006120000_kurumsal_kimlik_varsayilanlari/migration.sql'),
  'utf8',
);

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
});

/** `clientId` null = şirketin varsayılan profili (şirket başına tek). */
async function profil(id: string, clientId: string | null, renk: string, aksan: string, font: string): Promise<void> {
  await h.q(
    `INSERT INTO branding_profiles (id, org_id, client_id, primary_color, accent_color, font_family, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())`,
    [id, IDS.org, clientId, renk, aksan, font],
  );
}

/** Migration birden çok deyim taşıyor; hazırlanmış sorgu tek deyim kabul ediyor. */
const uygula = () => h.pg.exec(SQL);

describe('kurumsal kimlik migration', () => {
  it('KRİTİK: eski varsayılan güncelleniyor, bilerek seçilmiş değer KORUNUYOR — alan alan', async () => {
    await profil('aaaaaaaa-0000-0000-0000-000000000001', null, '#E11D2E', '#F97316', 'Inter');
    await profil('aaaaaaaa-0000-0000-0000-000000000002', IDS.client, '#2563EB', '#F97316', 'Roboto');
    await uygula();
    const r = (await h.q(
      `SELECT id::text AS id, primary_color, accent_color, font_family FROM branding_profiles ORDER BY id`,
    )) as Array<Record<string, string>>;
    const satirlar = r;
    expect(satirlar[0]).toMatchObject({ primary_color: '#FF2400', accent_color: '#D21D00', font_family: 'Open Sans' });
    // Rengi ve yazı tipi seçilmiş; yalnızca dokunulmamış aksan güncelleniyor.
    expect(satirlar[1]).toMatchObject({ primary_color: '#2563EB', accent_color: '#D21D00', font_family: 'Roboto' });
  });

  it('küçük harfle yazılmış eski renk de yakalanıyor', async () => {
    await profil('aaaaaaaa-0000-0000-0000-000000000003', null, '#e11d2e', '#f97316', 'Inter');
    await uygula();
    const s = (await h.q<Record<string, string>>(`SELECT primary_color, accent_color FROM branding_profiles`))[0]!;
    expect(s).toMatchObject({ primary_color: '#FF2400', accent_color: '#D21D00' });
  });
});
