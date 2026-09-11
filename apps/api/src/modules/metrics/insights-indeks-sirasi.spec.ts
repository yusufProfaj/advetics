import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../../test/pglite-harness';

/**
 * ═══ EŞİTLİK ÖNCE, ARALIK SONRA ═══
 *
 * `insights_daily` indeksi `(client_id, date DESC, entity_level)` idi ve
 * ikinci sütun bir ARALIK yüklemi (`date BETWEEN`). B-tree'de aralık
 * sütunundan SONRA gelen sütun tarama sınırı olamıyor, yani `entity_level`
 * eşitliği indekste değil HEAP'te uygulanıyordu.
 *
 * Üretim planı (bkz. `prisma/olcum-metrik.ts`) tek bir aylık partition için:
 * indeks 30.033 satır döndürüyor, 5.357 heap bloğu okunuyor ve satırların
 * %84'ü atılıyor — gereken 5.512 satır.
 *
 * ═══ NEDEN BU TEST GEREKLİ ═══
 *
 * Sıra bozulduğunda HİÇBİR ŞEY PATLAMIYOR: sorgular aynı sonucu döndürüyor,
 * testler yeşil kalıyor, yalnızca yavaşlıyor. Bu depoda düzeltilen
 * hataların neredeyse tamamı bu türden — sessiz.
 *
 * İDDİA ŞEMAYA DEĞİL VERİTABANINA ÇAPALI. `schema.prisma` doğru yazılıp
 * migration unutulsa da, migration yazılıp `db:deploy` koşmasa da sonuç
 * aynı: üretimde eski indeks durmaya devam eder. Koşum ortamı şemayı
 * ÜRETİM MIGRATION'LARINDAN kuruyor, yani burada görülen sıra üretimde
 * oluşacak sıra.
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

describe('KRİTİK: indeks sütun sırası', () => {
  it('eşitlik sütunları ARALIK sütunundan ÖNCE', async () => {
    expect(await indeksSutunlari('insights_daily_client_id_entity_level_date_idx')).toEqual([
      'client_id',
      'entity_level',
      'date',
    ]);
  });

  it('ESKİ SIRA KALMADI — iki indeks birden taşımak yazmayı da yavaşlatırdı', async () => {
    expect(await indeksSutunlari('insights_daily_client_id_date_entity_level_idx')).toEqual([]);
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
    expect(adlar.some((a) => a.includes('entity_level_date'))).toBe(true);
    expect(adlar.some((a) => a.includes('date_entity_level'))).toBe(false);
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

  it('şema yeni sırayı yazıyor', () => {
    expect(SEMA).toContain('@@index([clientId, entityLevel, date(sort: Desc)])');
    expect(SEMA).not.toContain('@@index([clientId, date(sort: Desc), entityLevel])');
  });
});
