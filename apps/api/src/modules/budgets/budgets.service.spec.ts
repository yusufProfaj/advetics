import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { BudgetsService, toMicros } from './budgets.service';

/**
 * BudgetsService — GERÇEK Postgres motoruna (PGlite) karşı.
 *
 * En kritik iddia TEKİLLİK. `UNIQUE (client_id, ad_account_id, month)` doğru
 * görünüyor ama Postgres'te NULL hiçbir şeye eşit olmadığı için müşteri geneli
 * satırlar birbirine çarpmıyor: aynı ay için ikinci bir bütçe girilebiliyor ve
 * pacing rastgele birini okuyor. Bu TypeScript'in göremeyeceği bir hata ve
 * çalışma anında da hata vermiyor — yalnızca yanlış sayı üretiyor.
 *
 * İkinci kritik iddia HARCAMA SEVİYESİ. `insights_daily` aynı harcamayı dört
 * seviyede tutuyor; seviye filtresi düşerse bütçe tüketimi 4 katına çıkar ve
 * her müşteri "bütçeni aştın" uyarısı alır.
 */

let h: Harness;
let svc: BudgetsService;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const ACCOUNT_B = '77777777-7777-7777-7777-777777777777';
const CAMPAIGN = '66666666-6666-6666-6666-666666666666';
/**
 * İkinci hesabın kampanyası AYRI bir id.
 *
 * `insights_daily`in birincil anahtarı (date, entity_level, entity_id,
 * breakdown_key) — `ad_account_id` DÂHİL DEĞİL. İki hesaba aynı varlık
 * kimliğiyle satır yazmak çakışıyor; gerçekte de iki hesabın aynı kampanyası
 * olmuyor.
 */
const CAMPAIGN_B = '66666666-6666-6666-6666-66666666666b';

/** İkinci reklam hesabı — bir müşterinin birden fazla projesi olabiliyor. */
async function seedSecondAccount(currency = 'TRY'): Promise<void> {
  await h.q(
    `INSERT INTO ad_accounts
       (id, client_id, connection_id, platform, external_id, name, currency,
        timezone, sync_enabled, updated_at)
     VALUES ($1, $2, $3, 'meta', 'ext-b', 'Proje B', $4, 'Europe/Istanbul', true, now())`,
    [ACCOUNT_B, IDS.client, IDS.connection, currency],
  );
}

async function seedSpend(params: {
  adAccountId?: string;
  date: string;
  spendMicros: string;
  level?: string;
  entityId?: string;
  currency?: string;
}): Promise<void> {
  await h.q(
    `INSERT INTO insights_daily
       (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
        date, breakdown_key, impressions, clicks, spend_micros, conversions,
        conversion_value_micros, currency, raw_metrics)
     VALUES ($1, $2, 'meta', $3::"EntityLevel", $4, 'ext', $5::date, '', 100, 10, $6, 0, 0, $7, '{}'::jsonb)`,
    [
      IDS.client,
      params.adAccountId ?? IDS.adAccount,
      params.level ?? 'campaign',
      params.entityId ?? CAMPAIGN,
      params.date,
      params.spendMicros,
      params.currency ?? 'TRY',
    ],
  );
}

beforeAll(async () => {
  h = await createHarness();
  svc = new BudgetsService({
    withTenant: async <T>(_ctx: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService);
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
});

// -----------------------------------------------------------------------------
// Tekillik — asıl tuzak
// -----------------------------------------------------------------------------

describe('tekillik kısıtı', () => {
  it('AYNI AY için ikinci bir MÜŞTERİ GENELİ bütçe oluşturmaz, GÜNCELLER', async () => {
    // Düz `UNIQUE (client_id, ad_account_id, month)` bunu engellemezdi:
    // NULL = NULL karşılaştırması Postgres'te NULL, yani "çakışmadı".
    await svc.upsert(CTX, {
      clientId: IDS.client,
      month: '2026-08',
      amount: '30000',
      alertThresholdPct: 80,
    });
    await svc.upsert(CTX, {
      clientId: IDS.client,
      month: '2026-08',
      amount: '45000',
      alertThresholdPct: 80,
    });

    const rows = await h.q<{ count: string | number }>(
      `SELECT COUNT(*) AS count FROM monthly_budgets WHERE ad_account_id IS NULL`,
    );
    expect(Number(rows[0]?.count)).toBe(1);

    const all = await svc.list(CTX, {});
    expect(all).toHaveLength(1);
    // İkinci yazım ÜZERİNE YAZDI — yeni satır eklemedi.
    expect(all[0]?.amountMicros).toBe('45000000000');
  });

  it('HAM SQL ile ikinci müşteri geneli satır eklenemez', async () => {
    // Servis katmanını atlayan bir yol kalmasın: kısıt VERİTABANINDA.
    await svc.upsert(CTX, {
      clientId: IDS.client,
      month: '2026-08',
      amount: '30000',
      alertThresholdPct: 80,
    });
    await expect(
      h.q(
        `INSERT INTO monthly_budgets (id, org_id, client_id, ad_account_id, month,
           amount_micros, currency, alert_threshold_pct, updated_at)
         VALUES (gen_random_uuid(), $1, $2, NULL, '2026-08-01', 1, 'TRY', 80, now())`,
        [IDS.org, IDS.client],
      ),
    ).rejects.toThrow();
  });

  it('MÜŞTERİ GENELİ ve HESAP BAZLI bütçe aynı ay birlikte var olabilir', async () => {
    // Şemsiye bütçe + proje bütçesi aynı anda anlamlı: ajans hem şirket
    // toplamını hem proje kırılımını izliyor.
    await svc.upsert(CTX, {
      clientId: IDS.client,
      month: '2026-08',
      amount: '30000',
      alertThresholdPct: 80,
    });
    await svc.upsert(CTX, {
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      month: '2026-08',
      amount: '20000',
      alertThresholdPct: 80,
    });
    expect(await svc.list(CTX, {})).toHaveLength(2);
  });

  it('İKİ FARKLI HESABA aynı ay ayrı bütçe verilebilir', async () => {
    await seedSecondAccount();
    await svc.upsert(CTX, {
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      month: '2026-08',
      amount: '20000',
      alertThresholdPct: 80,
    });
    await svc.upsert(CTX, {
      clientId: IDS.client,
      adAccountId: ACCOUNT_B,
      month: '2026-08',
      amount: '10000',
      alertThresholdPct: 80,
    });
    expect(await svc.list(CTX, {})).toHaveLength(2);
  });

  it('AYNI HESAP + AYNI AY ikinci kez yazılınca günceller', async () => {
    await svc.upsert(CTX, {
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      month: '2026-08',
      amount: '20000',
      alertThresholdPct: 80,
    });
    const updated = await svc.upsert(CTX, {
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      month: '2026-08',
      amount: '25000',
      alertThresholdPct: 90,
      note: 'artırıldı',
    });
    expect(await svc.list(CTX, {})).toHaveLength(1);
    expect(updated.amountMicros).toBe('25000000000');
    expect(updated.alertThresholdPct).toBe(90);
    expect(updated.note).toBe('artırıldı');
  });
});

// -----------------------------------------------------------------------------
// Veritabanı kısıtları
// -----------------------------------------------------------------------------

describe('veritabanı kısıtları', () => {
  it('AYIN İLK GÜNÜ olmayan bir tarih reddediliyor', async () => {
    // Ay bir NOKTA olarak saklanıyor. 15'ini yazan satır pacing sorgusunun
    // aradığı `month = '2026-08-01'` ile eşleşmez ve bütçe YOKMUŞ gibi
    // davranılır — sessiz kayıp.
    await expect(
      h.q(
        `INSERT INTO monthly_budgets (id, org_id, client_id, month, amount_micros,
           currency, alert_threshold_pct, updated_at)
         VALUES (gen_random_uuid(), $1, $2, '2026-08-15', 1000000, 'TRY', 80, now())`,
        [IDS.org, IDS.client],
      ),
    ).rejects.toThrow();
  });

  it('SIFIR ve NEGATİF bütçe reddediliyor', async () => {
    for (const amount of [0, -1000]) {
      await expect(
        h.q(
          `INSERT INTO monthly_budgets (id, org_id, client_id, month, amount_micros,
             currency, alert_threshold_pct, updated_at)
           VALUES (gen_random_uuid(), $1, $2, '2026-08-01', $3, 'TRY', 80, now())`,
          [IDS.org, IDS.client, amount],
        ),
      ).rejects.toThrow();
    }
  });

  it('makul olmayan eşik yüzdesi reddediliyor', async () => {
    await expect(
      h.q(
        `INSERT INTO monthly_budgets (id, org_id, client_id, month, amount_micros,
           currency, alert_threshold_pct, updated_at)
         VALUES (gen_random_uuid(), $1, $2, '2026-08-01', 1000000, 'TRY', 500, now())`,
        [IDS.org, IDS.client],
      ),
    ).rejects.toThrow();
  });

  it('ama %120 gibi bilinçli bir tolerans KABUL EDİLİYOR', async () => {
    // Üst sınır 100 değil: ay sonunda tolerans tanımak geçerli bir strateji.
    const b = await svc.upsert(CTX, {
      clientId: IDS.client,
      month: '2026-08',
      amount: '30000',
      alertThresholdPct: 100,
      autoPauseAtPct: 120,
    });
    expect(b.autoPauseAtPct).toBe(120);
  });
});

// -----------------------------------------------------------------------------
// Girdi doğrulaması
// -----------------------------------------------------------------------------

describe('upsert doğrulaması', () => {
  it('BAŞKA MÜŞTERİNİN hesabına bütçe yazılamaz', async () => {
    // Sessiz veri hatası olurdu: bütçe hiçbir zaman eşleşmeyen bir harcamaya
    // bakar ve pacing kalıcı olarak "hiç harcanmamış" gösterirdi.
    const otherClient = '88888888-8888-8888-8888-888888888888';
    await h.q(
      `INSERT INTO clients (id, org_id, name, slug, updated_at)
       VALUES ($1, $2, 'Diğer', 'diger', now())`,
      [otherClient, IDS.org],
    );
    await expect(
      svc.upsert(CTX, {
        clientId: otherClient,
        adAccountId: IDS.adAccount,
        month: '2026-08',
        amount: '10000',
        alertThresholdPct: 80,
      }),
    ).rejects.toThrow(/bu müşteriye bağlı değil/i);
  });

  it('GÜNLÜK LİMİT aylık bütçeden büyük olamaz', async () => {
    await expect(
      svc.upsert(CTX, {
        clientId: IDS.client,
        month: '2026-08',
        amount: '30000',
        dailyCap: '40000',
        alertThresholdPct: 80,
      }),
    ).rejects.toThrow(/günlük limit/i);
  });

  it('OTOMATİK DURDURMA eşiği uyarı eşiğinin altında olamaz', async () => {
    // Önce durdurup sonra uyarmak, uyarıyı işlevsiz kılar.
    await expect(
      svc.upsert(CTX, {
        clientId: IDS.client,
        month: '2026-08',
        amount: '30000',
        alertThresholdPct: 90,
        autoPauseAtPct: 80,
      }),
    ).rejects.toThrow(/uyarı eşiğinden küçük/i);
  });

  it('para birimi verilmezse MÜŞTERİNİN raporlama birimi kullanılıyor', async () => {
    const b = await svc.upsert(CTX, {
      clientId: IDS.client,
      month: '2026-08',
      amount: '30000',
      alertThresholdPct: 80,
    });
    expect(b.currency).toBe('TRY');
  });

  it('AY doğru okunuyor — saat dilimi kaydırmıyor', async () => {
    // `DATE` kolonu yerel gece yarısı bir `Date` olarak dönüyor;
    // `toISOString()` UTC+3'te bir gün geriye kaydırır ve Ağustos Temmuz
    // görünür. Bu proje bu hatayı grafik ekseninde bir kez yaşadı.
    const b = await svc.upsert(CTX, {
      clientId: IDS.client,
      month: '2026-01',
      amount: '30000',
      alertThresholdPct: 80,
    });
    expect(b.month).toBe('2026-01');
    const listed = await svc.list(CTX, { month: '2026-01' });
    expect(listed).toHaveLength(1);
  });

  it('otomatik durdurma VARSAYILAN OLARAK KAPALI', async () => {
    const b = await svc.upsert(CTX, {
      clientId: IDS.client,
      month: '2026-08',
      amount: '30000',
      alertThresholdPct: 80,
    });
    expect(b.autoPauseAtPct).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// Pacing — harcamanın okunması
// -----------------------------------------------------------------------------

describe('pacing', () => {
  it('HARCAMA TEK SEVİYEDEN okunuyor — dört katına çıkmıyor', async () => {
    // `insights_daily` aynı harcamayı hesap/kampanya/ad set/reklam
    // seviyelerinde tutuyor. Seviye filtresi düşerse her müşteri bütçesini
    // aşmış görünür.
    for (const level of ['account', 'campaign', 'ad_group', 'ad']) {
      await seedSpend({ date: '2026-08-03', spendMicros: '1000000000', level, entityId: CAMPAIGN });
    }
    await svc.upsert(CTX, {
      clientId: IDS.client,
      month: '2026-08',
      amount: '30000',
      alertThresholdPct: 80,
    });

    const p = await svc.pacing(CTX, { clientId: IDS.client, month: '2026-08' }, new Date('2026-08-07T10:00:00Z'));
    expect(p.overall.spentMicros).toBe('1000000000');
  });

  it('BUGÜNÜN harcaması pacing hesabına GİRMİYOR', async () => {
    // Panel ile rapor arasındaki tutarsızlık tam olarak buydu. Gün bitmeden
    // gelen kısmi veri, her sabah "yavaş gidiyoruz" demek olurdu.
    await seedSpend({ date: '2026-08-06', spendMicros: '1000000000' });
    await seedSpend({ date: '2026-08-07', spendMicros: '9000000000' });
    await svc.upsert(CTX, {
      clientId: IDS.client,
      month: '2026-08',
      amount: '30000',
      alertThresholdPct: 80,
    });

    const p = await svc.pacing(CTX, { clientId: IDS.client, month: '2026-08' }, new Date('2026-08-07T10:00:00Z'));
    expect(p.overall.spentMicros).toBe('1000000000');
    expect(p.overall.throughDate).toBe('2026-08-06');
  });

  it('GEÇMİŞ AY tüm günleriyle okunuyor', async () => {
    await seedSpend({ date: '2026-07-31', spendMicros: '5000000000' });
    await svc.upsert(CTX, {
      clientId: IDS.client,
      month: '2026-07',
      amount: '30000',
      alertThresholdPct: 80,
    });
    const p = await svc.pacing(CTX, { clientId: IDS.client, month: '2026-07' }, new Date('2026-08-07T10:00:00Z'));
    expect(p.overall.spentMicros).toBe('5000000000');
    expect(p.overall.throughDate).toBe('2026-07-31');
    expect(p.overall.daysRemaining).toBe(0);
  });

  it('BAŞKA AYIN harcaması sızmıyor', async () => {
    await seedSpend({ date: '2026-07-31', spendMicros: '9000000000' });
    await seedSpend({ date: '2026-08-05', spendMicros: '1000000000' });
    await svc.upsert(CTX, {
      clientId: IDS.client,
      month: '2026-08',
      amount: '30000',
      alertThresholdPct: 80,
    });
    const p = await svc.pacing(CTX, { clientId: IDS.client, month: '2026-08' }, new Date('2026-08-07T10:00:00Z'));
    expect(p.overall.spentMicros).toBe('1000000000');
  });

  it('MÜŞTERİ GENELİ toplam hesapların toplamına EŞİT', async () => {
    // İki ayrı sorgu yazılsaydı zamanla ayrışabilirlerdi; panelde
    // açıklanamayan bir fark olarak görünürdü. Tek kaynaktan türetiliyor.
    await seedSecondAccount();
    await seedSpend({ date: '2026-08-04', spendMicros: '3000000000' });
    await seedSpend({ adAccountId: ACCOUNT_B, entityId: CAMPAIGN_B, date: '2026-08-04', spendMicros: '2000000000' });

    const p = await svc.pacing(CTX, { clientId: IDS.client, month: '2026-08' }, new Date('2026-08-07T10:00:00Z'));
    const sum = p.accounts.reduce((acc, a) => acc + BigInt(a.spentMicros), 0n);
    expect(sum.toString()).toBe(p.overall.spentMicros);
    expect(p.overall.spentMicros).toBe('5000000000');
  });

  it('BÜTÇESİ OLMAYAN hesap da listeleniyor', async () => {
    // Bütçe tanımlamayı unutulan hesabı listeden düşürmek, tam da
    // görülmesi gereken durumu görünmez kılardı.
    await seedSecondAccount();
    await seedSpend({ adAccountId: ACCOUNT_B, entityId: CAMPAIGN_B, date: '2026-08-04', spendMicros: '2000000000' });
    await svc.upsert(CTX, {
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      month: '2026-08',
      amount: '10000',
      alertThresholdPct: 80,
    });

    const p = await svc.pacing(CTX, { clientId: IDS.client, month: '2026-08' }, new Date('2026-08-07T10:00:00Z'));
    expect(p.accounts).toHaveLength(2);
    const b = p.accounts.find((a) => a.adAccountId === ACCOUNT_B);
    expect(b?.status).toBe('no_budget');
    expect(b?.spentMicros).toBe('2000000000');
    // Bütçesi olan hesap üstte.
    expect(p.accounts[0]?.adAccountId).toBe(IDS.adAccount);
  });

  it('KARIŞIK PARA BİRİMİ toplanmıyor, bildiriliyor', async () => {
    // 1 USD + 1 TRY = 2 ne? `fx_rates` çevrimi yok. Karışık toplamı bütçeyle
    // karşılaştırmak anlamsız bir sayı üretir ve o sayı panelde görünür.
    await seedSecondAccount('USD');
    await seedSpend({ date: '2026-08-04', spendMicros: '3000000000', currency: 'TRY' });
    await seedSpend({
      adAccountId: ACCOUNT_B,
      entityId: CAMPAIGN_B,
      date: '2026-08-04',
      spendMicros: '2000000000',
      currency: 'USD',
    });
    await svc.upsert(CTX, {
      clientId: IDS.client,
      month: '2026-08',
      amount: '30000',
      currency: 'TRY',
      alertThresholdPct: 80,
    });

    const p = await svc.pacing(CTX, { clientId: IDS.client, month: '2026-08' }, new Date('2026-08-07T10:00:00Z'));
    expect(p.overall.spentMicros).toBe('3000000000');
    expect(p.overall.excludedCurrencies).toEqual(['USD']);
    // Müşteri geneli para birimi karışık → null.
    expect(p.currency).toBeNull();
  });

  it('VERİ KAPSAMASI gün sayısıyla bildiriliyor', async () => {
    // Fenbay hesaplarında yaşanan durum: 6 günün yalnızca biri senkronize.
    await seedSpend({ date: '2026-08-02', spendMicros: '1000000000' });
    await svc.upsert(CTX, {
      clientId: IDS.client,
      month: '2026-08',
      amount: '30000',
      alertThresholdPct: 80,
    });
    const p = await svc.pacing(CTX, { clientId: IDS.client, month: '2026-08' }, new Date('2026-08-07T10:00:00Z'));
    expect(p.overall.daysElapsed).toBe(6);
    expect(p.overall.daysWithData).toBe(1);
  });

  it('bütçe hiç yoksa da harcama dönüyor', async () => {
    await seedSpend({ date: '2026-08-04', spendMicros: '3000000000' });
    const p = await svc.pacing(CTX, { clientId: IDS.client, month: '2026-08' }, new Date('2026-08-07T10:00:00Z'));
    expect(p.overall.status).toBe('no_budget');
    expect(p.overall.spentMicros).toBe('3000000000');
  });

  it('AY VERİLMEZSE içinde bulunulan ay', async () => {
    await seedSpend({ date: '2026-08-04', spendMicros: '3000000000' });
    const p = await svc.pacing(CTX, { clientId: IDS.client }, new Date('2026-08-07T10:00:00Z'));
    expect(p.month).toBe('2026-08');
  });

  it('AYIN 1İNDE harcama sorgusu HİÇ ÇALIŞMIYOR', async () => {
    // `throughDate` ayın başlangıcından önce; aralık ters olurdu ve
    // `BETWEEN '2026-08-01' AND '2026-07-31'` sessizce boş dönerdi.
    // Sorguyu hiç kurmamak niyeti açık kılıyor.
    await seedSpend({ date: '2026-07-31', spendMicros: '9000000000' });
    const p = await svc.pacing(CTX, { clientId: IDS.client, month: '2026-08' }, new Date('2026-08-01T10:00:00Z'));
    expect(p.overall.spentMicros).toBe('0');
    expect(p.overall.daysElapsed).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Silme
// -----------------------------------------------------------------------------

describe('remove', () => {
  it('siler', async () => {
    const b = await svc.upsert(CTX, {
      clientId: IDS.client,
      month: '2026-08',
      amount: '30000',
      alertThresholdPct: 80,
    });
    await svc.remove(CTX, b.id);
    expect(await svc.list(CTX, {})).toHaveLength(0);
  });

  it('olmayan kaydı silmek HATA veriyor — sessiz başarı değil', async () => {
    await expect(
      svc.remove(CTX, '00000000-0000-0000-0000-000000000009'),
    ).rejects.toThrow();
  });
});

// -----------------------------------------------------------------------------
// Para çevrimi
// -----------------------------------------------------------------------------

describe('toMicros', () => {
  it('tam sayı', () => {
    expect(toMicros('45000').toString()).toBe('45000000000');
  });

  it('iki ondalık', () => {
    expect(toMicros('45000.50').toString()).toBe('45000500000');
  });

  it('TÜRKÇE ondalık ayırıcı (virgül)', () => {
    // Arayüz Türkçe; "1500,75" yazan kullanıcı var.
    expect(toMicros('1500,75').toString()).toBe('1500750000');
  });

  it('tek ondalık basamak doğru dolduruluyor', () => {
    // "45000.5" → 45000,50 olmalı, 45000,05 değil.
    expect(toMicros('45000.5').toString()).toBe('45000500000');
  });

  it('FLOAT ÜZERİNDEN GEÇMİYOR', () => {
    // `Math.round(Number('0.07') * 1e6)` bazı değerlerde 1 micro kaydırıyor.
    // Tek kayıtta önemsiz; bütçe eşiği karşılaştırmasında
    // "%100,0000001 harcandı" gibi bir tetiklemeye yetiyor.
    expect(toMicros('0.07').toString()).toBe('70000');
    expect(toMicros('8.29').toString()).toBe('8290000');
  });

  it('çok büyük tutarlar', () => {
    // `Number` 2^53'te hassasiyet kaybediyor; BigInt kaybetmiyor.
    expect(toMicros('999999999999.99').toString()).toBe('999999999999990000');
  });
});
