import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seviyeLiterali } from './seviye-literali';
import { createHarness, type Harness } from '../../../test/pglite-harness';

/**
 * ═══ `entity_level` NEDEN İNDEKSE GİREMİYOR — VE ÇARESİ ═══
 *
 * Ajans genel bakışı 49 şirketle yavaştı. Üretim planı (2026-08 partition'ı,
 * 30 günlük pencere) şunu gösterdi:
 *
 *   Index Cond:  client_id = ANY (...) AND date >= ... AND date <= ...
 *   Filter:      ... AND (entity_level = 'campaign'::"EntityLevel")
 *   Rows Removed by Filter: 24.364
 *   Heap Blocks: exact=5.357        (gereken satır: 5.512)
 *
 * `entity_level` İNDEKSTE OLMASINA rağmen `Index Cond`a girmiyordu. İlk
 * teşhisim sütun sırasıydı ("eşitlik önce, aralık sonra") — sıra
 * değiştirildi ve ÜRETİM PLANI BİREBİR AYNI KALDI. Kural doğru, sebep o
 * değildi.
 *
 * GERÇEK SEBEP: tablo RLS taşıyor ve Postgres güvenlik yüklemlerinden ÖNCE
 * yalnızca LEAKPROOF operatörleri çalıştırıyor. `date_ge`/`date_le`
 * leakproof (o yüzden `Index Cond`a giriyorlar), `enum_eq` değil. Yani
 * `entity_level` HİÇBİR sütun sırasında tarama sınırı olamıyor.
 *
 * ÇARE KISMİ İNDEKS: yüklemi çalışma anında değerlendirilmiyor, planlayıcı
 * PLAN ANINDA kanıtlıyor. Leakproof sırası devreye hiç girmiyor.
 *
 * ═══ BU TEST NEYİ TUTUYOR ═══
 *
 * İki şey ve İKİSİ DE sessizce bozulabilir:
 *   · kısmi indeksin var olması (`01_constraints.sql`),
 *   · sorgunun seviyeyi LİTERAL yazması (bağlı parametre kanıtı bozuyor).
 * Biri gittiğinde sorgu aynı sonucu döndürmeye devam ediyor, testler yeşil
 * kalıyor, yalnızca yavaşlıyor.
 */
let h: Harness;
const ROLE = 'advetics_kismi_indeks';
const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '55555555-5555-5555-5555-555555555555';
const CONN = '33333333-3333-3333-3333-333333333333';
const ADACC = '44444444-4444-4444-4444-444444444444';
const CLIENTS = [
  '22222222-2222-2222-2222-222222222221',
  '22222222-2222-2222-2222-222222222222',
];

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${ROLE}`);
  await h.q(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${ROLE}`);

  // Koşum ortamı RLS'i kapatmıştı; bu paketin KONUSU RLS'in plana etkisi.
  await h.q(`ALTER TABLE insights_daily ENABLE ROW LEVEL SECURITY`);

  await h.q(`INSERT INTO organizations (id,name,slug,updated_at) VALUES ($1,'O','o',now())`, [ORG]);
  for (const [i, c] of CLIENTS.entries()) {
    await h.q(`INSERT INTO clients (id,org_id,name,slug,updated_at) VALUES ($1,$2,$3,$4,now())`, [
      c,
      ORG,
      `C${i}`,
      `c${i}`,
    ]);
  }
  await h.q(
    `INSERT INTO users (id,org_id,email,password_hash,full_name,updated_at)
     VALUES ($1,$2,'a@b.c','x','A',now())`,
    [USER, ORG],
  );
  await h.q(
    `INSERT INTO platform_connections
       (id, org_id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1,$2,$3,'meta','active','u1','T','\\x00','{}',$4,now())`,
    [CONN, ORG, CLIENTS[0], USER],
  );
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, sync_enabled, updated_at)
     VALUES ($1,$2,$3,$4,'meta','act_1','H','TRY','Europe/Istanbul',true,now())`,
    [ADACC, ORG, CLIENTS[0], CONN],
  );

  /*
   * PARTITION SONRADAN AÇILIYOR — VE BU TESTİN PARÇASI.
   * Kısmi indeks `01_constraints.sql` ile EBEVEYNE kuruldu; buradaki
   * partition ondan SONRA doğuyor. Devralmazsa yeni her ay sessizce
   * indekssiz kalırdı.
   */
  await h.q(`SELECT app.ensure_insights_partition('2026-08-01'::date)`);
  await h.q(
    `INSERT INTO insights_daily
       (date, entity_level, entity_id, breakdown_key, client_id, ad_account_id, platform,
        entity_external_id, impressions, clicks, spend_micros, conversions,
        conversion_value_micros, currency)
     SELECT ('2026-08-01'::date + (g % 28)),
            (ARRAY['account','campaign','ad_group','ad']::"EntityLevel"[])[1 + (g % 4)],
            gen_random_uuid(), '', $1::uuid, $2::uuid, 'meta', 'x',
            1, 1, 1, 0, 0, 'TRY'
       FROM generate_series(1, 4000) g`,
    [CLIENTS[0], ADACC],
  );
  await h.q('ANALYZE insights_daily');
}, 180_000);

afterAll(() => h.close());

/** Politikaların uygulandığı rolle plan alır. */
async function plan(sql: string): Promise<string> {
  await h.q(
    `SELECT set_config('app.current_org_id','${ORG}',false),
            set_config('app.current_user_id','${USER}',false),
            set_config('app.current_client_ids','${CLIENTS.join(',')}',false),
            set_config('app.is_org_admin','on',false),
            set_config('app.current_active_client_id','',false)`,
  );
  await h.q(`SET ROLE ${ROLE}`);
  try {
    // Küçük fixture'da seq scan her zaman kazanır; ölçülen şey MALİYET
    // değil, planlayıcının yüklemi indekse ALIP ALAMADIĞI.
    await h.q('SET enable_seqscan = off');
    const satirlar = await h.q<Record<string, string>>(sql);
    return satirlar.map((s) => String(Object.values(s)[0])).join('\n');
  } finally {
    await h.q('RESET ROLE');
  }
}

const LITERAL = `EXPLAIN SELECT SUM(impressions) FROM insights_daily
   WHERE date BETWEEN '2026-08-01'::date AND '2026-08-28'::date
     AND entity_level = 'campaign'::"EntityLevel"
     AND client_id = ANY('{${CLIENTS.join(',')}}'::uuid[])`;

describe('tarama boşa düşmüyor', () => {
  it('plan gerçekten üretiliyor ve tabloya değiyor', async () => {
    const p = await plan(LITERAL);
    expect(p).toContain('insights_daily_2026_08');
  });
});

describe('KRİTİK: kısmi indeks `entity_level`i FİLTREDEN kaldırıyor', () => {
  it('literal seviyede `entity_level` planda HİÇ geçmiyor', async () => {
    /*
     * İddia "kısmi indeks kullanıldı" değil "yüklem çalışma anında
     * DEĞERLENDİRİLMİYOR" — asıl kazanç bu. İndeks adına çapalanan bir
     * iddia, Postgres adlandırmayı değiştirdiğinde boşa düşerdi.
     */
    const p = await plan(LITERAL);
    expect(p).not.toContain('entity_level');
  });

  it('KRİTİK: BAĞLI PARAMETRE aynı kazancı VERMİYOR', async () => {
    /*
     * Kısmi indeksin yüklemi PLAN ANINDA kanıtlanmak zorunda. Değer
     * parametreyse plan anında bilinmiyor, kanıt kurulamıyor ve
     * `entity_level` yine `Filter`da kalıyor.
     *
     * Bu test bir ÖZELLİĞİ değil bir TUZAĞI kilitliyor: `Prisma.sql`
     * içinde `${SABIT}` yazmak sabiti parametreye çeviriyor ve kazanç
     * sessizce kayboluyor.
     */
    await h.q(`SET ROLE ${ROLE}`);
    try {
      await h.q(`PREPARE p_seviye(text) AS SELECT SUM(impressions) FROM insights_daily
         WHERE date BETWEEN '2026-08-01'::date AND '2026-08-28'::date
           AND entity_level = $1::"EntityLevel"
           AND client_id = ANY('{${CLIENTS.join(',')}}'::uuid[])`);
    } finally {
      await h.q('RESET ROLE');
    }
    const p = await plan(`EXPLAIN EXECUTE p_seviye('campaign')`);
    expect(p).toContain('entity_level');
  });
});

describe('KRİTİK: kısmi indeksler GERÇEKTEN kurulu', () => {
  it('iki seviye için de var ve YÜKLEM taşıyorlar', async () => {
    const satirlar = await h.q<{ indexdef: string; indexname: string }>(
      `SELECT indexname, indexdef FROM pg_indexes
        WHERE tablename = 'insights_daily' AND indexname LIKE 'insights_daily_%'
        ORDER BY indexname`,
    );
    const tanimlar = satirlar.map((s) => s.indexdef).join('\n');
    expect(tanimlar).toMatch(/insights_daily_kampanya_idx[\s\S]*?WHERE \(entity_level = 'campaign'/);
    expect(tanimlar).toMatch(/insights_daily_hesap_idx[\s\S]*?WHERE \(entity_level = 'account'/);
  });

  it('KRİTİK: SONRADAN açılan partition indeksi DEVRALIYOR', async () => {
    // Ebeveyne değil partition'a tek tek yazan bir kurulum, yeni her ayda
    // sessizce indekssiz partition bırakırdı.
    await h.q(`SELECT app.ensure_insights_partition('2027-03-01'::date)`);
    const satirlar = await h.q<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_index ix
         JOIN pg_class i ON i.oid = ix.indexrelid
        WHERE ix.indrelid = 'public.insights_daily_2027_03'::regclass
          AND ix.indpred IS NOT NULL`,
    );
    expect(Number(satirlar[0]?.n ?? 0)).toBe(2);
  });
});

describe('seviyeLiterali', () => {
  it('literal üretiyor, parametre DEĞİL', () => {
    expect(seviyeLiterali('campaign').sql).toBe(`'campaign'::"EntityLevel"`);
    expect(seviyeLiterali('campaign').values).toEqual([]);
  });

  it('KRİTİK: tanınmayan seviye PATLIYOR', () => {
    /*
     * `Prisma.raw` metni doğrudan sorguya yazıyor. Bugün değer bir derleme
     * zamanı sabiti ama "her zaman öyle kalacak" varsayımı bakımdan sağ
     * çıkmıyor.
     */
    expect(() => seviyeLiterali('kampanya' as never)).toThrow(/Bilinmeyen metrik seviyesi/);
  });
});

describe('KRİTİK: servis LİTERAL biçimi kullanıyor', () => {
  const KAYNAK = readFileSync(resolve(__dirname, 'metrics.service.ts'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('BOŞA DÜŞME BEKÇİSİ: kaynak okundu', () => {
    expect(KAYNAK).toContain('FROM insights_daily');
    expect(KAYNAK.length).toBeGreaterThan(5000);
  });

  it('parametreli biçim KALMADI', () => {
    expect(KAYNAK).not.toContain('${TOTALS_LEVEL}::"EntityLevel"');
    expect(KAYNAK).toContain('const TOPLAM_SEVIYESI = seviyeLiterali(TOTALS_LEVEL);');
  });

  it('toplam seviyesini süzen HER sorgu literali kullanıyor', () => {
    // Sayı sabitlenmiyor (sorgu eklenebilir); aranan şey parametreli
    // biçimin HİÇ kalmaması ve literalin birden çok yerde geçmesi.
    const literal = KAYNAK.split('entity_level = ${TOPLAM_SEVIYESI}').length - 1;
    expect(literal).toBeGreaterThanOrEqual(6);
  });
});
