import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../../test/pglite-harness';

/**
 * ═══ GENEL İNDEKSİN SÜTUN SIRASI — VE BİR YANLIŞ TEŞHİSİN KAYDI ═══
 *
 * Bu dosya bir süre TERSİNİ savundu ve o hâliyle commit edildi. Kayıt
 * duruyor çünkü aynı yanlış çıkarım kolayca tekrarlanır.
 *
 * GÖZLEM: üretim planında `entity_level` eşitliği `Index Cond`a girmiyor,
 * heap `Filter`ında kalıyor; tek bir aylık partition'da 30.033 satır
 * okunup 24.364'ü atılıyor (5.357 heap bloğu, gereken 5.512 satır).
 *
 * YANLIŞ TEŞHİS: "eşitlik sütunu aralık sütununun arkasında kalmış, sırayı
 * değiştir." Kural doğru, buradaki sebep o değil. Sıra
 * `(client_id, entity_level, date DESC)` yapıldı ve ÜRETİM PLANI BİREBİR
 * AYNI KALDI — `entity_level` ikinci sütunken bile `Index Cond`a girmedi,
 * `date` ise üçüncü sütunken girdi.
 *
 * GERÇEK SEBEP: tablo RLS taşıyor ve Postgres güvenlik yüklemlerinden ÖNCE
 * yalnızca LEAKPROOF operatörleri çalıştırıyor. `date_ge`/`date_le`
 * leakproof, `enum_eq` değil. `entity_level` hiçbir sıralamada tarama
 * sınırı olamıyor. Çare kısmi indeks —
 * `entity-level-kismi-indeks.spec.ts` bunu ölçerek gösteriyor.
 *
 * SIRA NEDEN GERİ ALINDI: kısmi indeksler `campaign` ve `account`
 * seviyelerini üstlendikten sonra bu genel indeks, seviyesi PARAMETREDEN
 * gelen sorgulara (kırılım ekranı) kalıyor. Orada `entity_level` zaten
 * indekse giremiyor ama `date` girebiliyor — yani `date`in İKİNCİ sütun
 * olması işe yarıyor.
 *
 * İDDİA ŞEMAYA DEĞİL VERİTABANINA ÇAPALI. `schema.prisma` doğru yazılıp
 * migration unutulsa da, migration yazılıp `db:deploy` koşmasa da sonuç
 * aynı: üretimde eski indeks durmaya devam eder. Koşum ortamı şemayı
 * ÜRETİM MIGRATION'LARINDAN kuruyor.
 */
let h: Harness;

beforeAll(async () => {
  h = await createHarness();
}, 120_000);

afterAll(async () => {
  await h.close();
});

/** Bir indeksin sütunlarını SIRASIYLA döndürür. */
async function indeksSutunlari(indeks: string): Promise<string[]> {
  const satirlar = await h.q<{ attname: string; ord: number }>(
    `SELECT a.attname, k.ord
       FROM pg_class i
       JOIN pg_index ix ON ix.indexrelid = i.oid
       JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord) ON true
       JOIN pg_attribute a ON a.attrelid = ix.indrelid AND a.attnum = k.attnum
      WHERE i.relname = $1
      ORDER BY k.ord`,
    [indeks],
  );
  return satirlar.map((s) => s.attname);
}

describe('tarama boşa düşmüyor', () => {
  it('koşum ortamı indeksleri gerçekten görebiliyor', async () => {
    // Sorgu hiçbir şey bulamazsa aşağıdaki iddialar da BOŞ dizilerle
    // karşılaştırılır ve her zaman geçerdi.
    const pk = await indeksSutunlari('insights_daily_pkey');
    expect(pk.length).toBeGreaterThan(0);
  });
});

describe('KRİTİK: genel indeksin sütun sırası', () => {
  it('`date` İKİNCİ — tarama sınırı olabilen tek sütun o', async () => {
    expect(await indeksSutunlari('insights_daily_client_id_date_entity_level_idx')).toEqual([
      'client_id',
      'date',
      'entity_level',
    ]);
  });

  it('DENENİP GERİ ALINAN SIRA KALMADI — iki indeks yazmayı da yavaşlatırdı', async () => {
    expect(await indeksSutunlari('insights_daily_client_id_entity_level_date_idx')).toEqual([]);
  });

  it('hesap bazlı indeks DOKUNULMADAN duruyor', async () => {
    /*
     * O indeks `entity_level` taşımıyor ve taşımamalı: `ad_account_id`
     * üzerinden giden sorgular (veri taşıma, kota bekçisi) seviyeye
     * bakmıyor. "Tutarlılık olsun" diye ona da eklemek, yazma maliyetini
     * hiçbir okuma kazancı olmadan artırırdı.
     */
    expect(await indeksSutunlari('insights_daily_ad_account_id_date_idx')).toEqual([
      'ad_account_id',
      'date',
    ]);
  });
});

describe('KRİTİK: her partition indeksi ALIYOR', () => {
  it('aylık partition ebeveynin indeksini devralıyor', async () => {
    /*
     * Partition'lı ebeveyne kurulan indeks her partition'a iniyor — ama
     * bu, ebeveyne KURULMUŞ olmasına bağlı. Partition'a ayrıca indeks
     * yazan bir migration, yeni aylarda sessizce indeksiz partition
     * bırakırdı ve belirtisi yalnızca "bu ay yavaş" olurdu.
     */
    await h.q(`SELECT app.ensure_insights_partition('2026-08-01'::date)`);
    const partitionIndeksleri = await h.q<{ relname: string }>(
      `SELECT c.relname
         FROM pg_class c
         JOIN pg_index ix ON ix.indexrelid = c.oid
        WHERE ix.indrelid = 'public.insights_daily_2026_08'::regclass`,
    );
    const adlar = partitionIndeksleri.map((p) => p.relname);
    expect(adlar.length).toBeGreaterThan(0);
    expect(adlar.some((a) => a.includes('date_entity_level'))).toBe(true);
    expect(adlar.some((a) => a.includes('entity_level_date'))).toBe(false);
  });
});

describe('KRİTİK: şema ile migration AYRIŞMIYOR', () => {
  /*
   * `schema.prisma` veritabanını DEĞİŞTİRMİYOR — migration değiştiriyor.
   * İkisi ayrışırsa `prisma migrate` bir sonraki geliştirmede kendiliğinden
   * bir "düzeltme" migration'ı üretir ve o, üretimde indeksi geri çevirir.
   */
  const SEMA = readFileSync(
    resolve(__dirname, '..', '..', '..', 'prisma', 'schema.prisma'),
    'utf8',
  );

  it('şema veritabanındaki sırayı yazıyor', () => {
    expect(SEMA).toContain('@@index([clientId, date(sort: Desc), entityLevel])');
    expect(SEMA).not.toContain('@@index([clientId, entityLevel, date(sort: Desc)])');
  });
});
