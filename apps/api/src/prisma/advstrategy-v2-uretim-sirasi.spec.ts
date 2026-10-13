import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { sonrakiTablolar, tablolarsizRls } from '../../test/sonraki-tablolar';

/**
 * ═══ ADVSTRATEGY v2 MIGRATION'I ÜRETİM SIRASINDA ═══
 *
 * Bu migration ÜRETİMDE DOLU olabilen `strateji_planlari`nın CHECK'lerini
 * düşürüp kuruyor, kolon tipini genişletiyor ve kısmi tekil indeksini
 * yeniden kuruyor. `pglite-harness` her şeyi boş şemaya baştan kurduğu için
 * eski satırlarla çakışmayı GÖREMEZ (CLAUDE.md). Üretim hâli elle:
 *
 *   önceki migration'lar → `prisma/sql/*` (önceki deploy'un db:rls'i)
 *   → v1 VERİSİ (taslak, onaylı, aktarılmış, iptal planlar; matris)
 *   → bu migration → `prisma/sql/*` (bu deploy'un db:rls'i)
 */
const MIGRATIONS = join(__dirname, '../../prisma/migrations');
const SQL_DIR = join(__dirname, '../../prisma/sql');
const BU = '20261018100000_advstrategy_v2';
const ORG = '11111111-1111-1111-1111-111111111111';
const WS = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER = '10000000-0000-0000-0000-000000000001';
const V1_ONAYLI = '20000000-0000-4000-8000-000000000001';
const V1_TASLAK = '20000000-0000-4000-8000-000000000002';

let pg: PGlite;

async function sqlDosyalari(onceki = false): Promise<void> {
  const dosyalar = readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql')).sort();
  expect(dosyalar).toContain('02_rls.sql');
  const tum = readdirSync(MIGRATIONS).filter((d) => /^\d/.test(d)).sort();
  // Önceki deploy'un db:rls'i bu migration'ın tablolarını BİLMİYORDU.
  const sonraki = sonrakiTablolar(MIGRATIONS, tum.filter((d) => d >= BU));
  for (const f of dosyalar) {
    let sql = readFileSync(join(SQL_DIR, f), 'utf8');
    if (onceki && f === '02_rls.sql') {
      const temiz = tablolarsizRls(sql, sonraki);
      expect(temiz.bulunamayan, 'sonraki tablolar RLS dizisinde bulunamadı').toEqual([]);
      sql = temiz.sql;
    }
    await pg.exec(sql);
  }
}

beforeAll(async () => {
  pg = new PGlite();
  const tum = readdirSync(MIGRATIONS).filter((d) => /^\d/.test(d)).sort();
  expect(tum, 'sınanan migration bulunamadı — tarama boşa düştü').toContain(BU);
  for (const d of tum.filter((x) => x < BU)) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
  await sqlDosyalari(true);

  await pg.exec(`
    INSERT INTO organizations (id, name, slug, updated_at) VALUES ('${ORG}', 'Ajans', 'ajans', now());
    INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ('${WS}', '${ORG}', 'WS', 'ws', now());
    INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at) VALUES ('${USER}', '${ORG}', 'a@x.com', 'x', 'A', now());
    INSERT INTO strateji_planlari (id, org_id, client_id, donem, durum, toplam_butce_micros, para_birimi, onay_rolu, onay_zamani, onaylanan_surum)
      VALUES ('${V1_ONAYLI}', '${ORG}', '${WS}', '2026-10', 'onaylandi', 1000000, 'TRY', 'musteri', now(), 1),
             ('20000000-0000-4000-8000-000000000003', '${ORG}', '${WS}', '2026-09', 'aktarildi', 1000000, 'TRY', 'ajans', now(), 1);
    INSERT INTO strateji_planlari (id, org_id, client_id, donem, toplam_butce_micros, para_birimi)
      VALUES ('${V1_TASLAK}', '${ORG}', '${WS}', '2026-11', 1000000, 'TRY');
    INSERT INTO strateji_matrisi (plan_id, org_id, client_id, sira, platform, katman, niyet, tutar_micros)
      VALUES ('${V1_TASLAK}', '${ORG}', '${WS}', 1, 'meta', 'soguk', 'FORM', 1);
  `);

  await pg.exec(readFileSync(join(MIGRATIONS, BU, 'migration.sql'), 'utf8'));
  for (const d of tum.filter((x) => x > BU)) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
  await sqlDosyalari();
}, 240_000);

afterAll(async () => {
  await pg?.close();
});

async function q<T>(sql: string): Promise<T[]> {
  return (await pg.query<T>(sql)).rows;
}

const v2Plan = (durum = 'taslak', bas = '2026-12-01', bit = '2026-12-31') =>
  q(`INSERT INTO strateji_planlari (org_id, client_id, bicim, donem, baslangic, bitis, durum, toplam_butce_micros, para_birimi)
     VALUES ('${ORG}', '${WS}', 2, '${bas.slice(0, 7)}', '${bas}', '${bit}', '${durum}', 1000000, 'TRY') RETURNING id::text`) as Promise<Array<{ id: string }>>;

describe('advstrategy v2 migration’ı üretim sırasında', () => {
  it('KRİTİK: v1 satırları geçerli kalır; hepsi bicim 1, v2 kolonları boş/varsayılan', async () => {
    const r = await q<{ bicim: number; bolumler: unknown; riskler: unknown }>(`SELECT bicim, bolumler, riskler FROM strateji_planlari ORDER BY id`);
    expect(r).toHaveLength(3);
    for (const x of r) expect(x).toEqual({ bicim: 1, bolumler: {}, riskler: [] });
  });

  it('KRİTİK: v1 açık plan indeksi YALNIZ v1 — aynı ayda v2 strateji açılabiliyor; v2 başına tek AÇIK', async () => {
    await v2Plan('taslak', '2026-11-01', '2026-11-30');
    await expect(v2Plan('onayda', '2027-01-01', '2027-01-31')).rejects.toThrow(/strateji_planlari_acik_v2_key/);
    // v1 kuralı korunuyor: aynı ayda ikinci açık v1 plan reddediliyor.
    await expect(
      q(`INSERT INTO strateji_planlari (org_id, client_id, donem, toplam_butce_micros, para_birimi) VALUES ('${ORG}', '${WS}', '2026-11', 1, 'TRY')`),
    ).rejects.toThrow(/strateji_planlari_acik_donem_key/);
  });

  it('KRİTİK: durum CHECK v1 ∪ v2 — aktarildi yalnız v1, revizyon/kapandi yalnız v2', async () => {
    await expect(q(`UPDATE strateji_planlari SET durum = 'revizyon' WHERE id = '${V1_TASLAK}'`)).rejects.toThrow(/strateji_planlari_durum_chk/);
    await expect(v2Plan('aktarildi', '2027-03-01', '2027-03-31')).rejects.toThrow(/durum_chk|onay_izi_chk/);
  });

  it('KRİTİK: onay_rolu genişledi (baglanti, 8 karakter); bağlantı onayında ad ve e-posta ZORUNLU', async () => {
    await expect(
      q(`UPDATE strateji_planlari SET onay_rolu = 'baglanti' WHERE id = '${V1_ONAYLI}'`),
    ).rejects.toThrow(/strateji_planlari_beyan_chk/);
    await q(`UPDATE strateji_planlari SET onay_rolu = 'baglanti', onaylayan_ad = 'Ad Soyad', onaylayan_eposta = 'a@b.com' WHERE id = '${V1_ONAYLI}'`);
    const [r] = await q<{ onay_rolu: string }>(`SELECT onay_rolu FROM strateji_planlari WHERE id = '${V1_ONAYLI}'`);
    expect(r!.onay_rolu).toBe('baglanti');
  });

  it('v2 dönemi en çok üç ay; kapanmış planda onay izi zorunlu', async () => {
    await expect(v2Plan('iptal', '2027-01-01', '2027-06-30')).rejects.toThrow(/v2_donem_chk/);
    await expect(v2Plan('kapandi', '2027-01-01', '2027-01-31')).rejects.toThrow(/onay_izi_chk/);
  });

  it('KRİTİK: yeni tablolar RLS AÇIK + ZORLANIYOR; yorumlarda yalnız INSERT + SELECT politikası', async () => {
    for (const t of ['strateji_kalemleri', 'strateji_yorumlari', 'strateji_onay_baglantilari']) {
      const [c] = await q<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(`SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = '${t}'`);
      expect(c, t).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    }
    const p = await q<{ cmd: string }>(`SELECT cmd FROM pg_policies WHERE tablename = 'strateji_yorumlari' ORDER BY cmd`);
    expect(p.map((x) => x.cmd)).toEqual(['INSERT', 'SELECT']);
    const b = await q<{ cmd: string }>(`SELECT cmd FROM pg_policies WHERE tablename = 'strateji_onay_baglantilari' ORDER BY cmd`);
    expect(b.map((x) => x.cmd)).toEqual(['INSERT', 'SELECT', 'UPDATE']);
  });

  it('kalem kısıtları: pay yalnız iki platformda; plan silinince kalem gider, rehber silinince bağ düşer', async () => {
    const [p] = await v2Plan('iptal', '2027-05-01', '2027-05-31');
    const ekle = (meta: boolean, google: boolean, pay: number | null) =>
      q(`INSERT INTO strateji_kalemleri (plan_id, org_id, client_id, sira, amac, meta_acik, google_acik, meta_payi, butce_micros, baslangic, bitis)
         VALUES ('${p!.id}', '${ORG}', '${WS}', ${Math.floor(Math.random() * 1000)}, 'SITE', ${meta}, ${google}, ${pay ?? 'NULL'}, 1, '2027-05-02', '2027-05-30')`);
    await expect(ekle(true, false, 50)).rejects.toThrow(/strateji_kalemleri_pay_chk/);
    await expect(ekle(true, true, null)).rejects.toThrow(/strateji_kalemleri_pay_chk/);
    await expect(ekle(false, false, null)).rejects.toThrow(/strateji_kalemleri_platform_chk/);
    await ekle(true, true, 60);
    // NULL TUZAĞI: tek uçlu yaş ve rolsüz beyan CHECK'te NULL döner ve GEÇERDİ.
    await expect(
      q(`INSERT INTO strateji_kalemleri (plan_id, org_id, client_id, sira, amac, meta_acik, google_acik, butce_micros, baslangic, bitis, yas_min)
         VALUES ('${p!.id}', '${ORG}', '${WS}', 999, 'SITE', true, false, 1, '2027-05-02', '2027-05-30', 25)`),
    ).rejects.toThrow(/strateji_kalemleri_yas_chk/);
    await expect(q(`UPDATE strateji_planlari SET onaylayan_ad = 'X' WHERE id = '${V1_TASLAK}'`)).rejects.toThrow(/strateji_planlari_beyan_chk/);
    await q(`DELETE FROM strateji_planlari WHERE id = '${p!.id}'`);
    const [n] = await q<{ n: number }>(`SELECT count(*)::int AS n FROM strateji_kalemleri WHERE plan_id = '${p!.id}'`);
    expect(n!.n).toBe(0);
  });
});
