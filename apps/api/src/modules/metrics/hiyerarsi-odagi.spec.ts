import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { MetricsService } from './metrics.service';

/**
 * ═══ HİYERARŞİ ODAĞI — GOOGLE ADS'TEKİ GİBİ İNMEK ═══
 *
 * Şirket › workspace › kampanya › reklam seti › reklam. Bir kampanyaya
 * tıklandığında ekranın TAMAMI ona daralıyor: kartlar, grafik ve tablo.
 *
 * İKİ FARKLI ANLAM, TEK PARAMETRE. Özet ve grafikte `campaignId` odak
 * VARLIĞIN KENDİSİ; kırılım tablosunda ÜST VARLIK (altındakiler). İkisini
 * karıştırmak sessiz hata üretir: özet boş döner ya da tablo bütün
 * workspace'i listeler.
 *
 * SEVİYE DE DEĞİŞMEK ZORUNDA. Toplamlar hesap seviyesinden okunuyor ve bir
 * kampanya kimliği o seviyede hiçbir satırla eşleşmiyor; yalnızca
 * `entity_id` süzen bir kod her odakta BOŞ EKRAN üretirdi — hata vermeden.
 */
let h: Harness;
let svc: MetricsService;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const K1 = '66666666-0001-0001-0001-666666666666';
const K2 = '66666666-0002-0002-0002-666666666666';
const S1 = '77777777-0001-0001-0001-777777777777';
const S2 = '77777777-0002-0002-0002-777777777777';
const R1 = '88888888-0001-0001-0001-888888888888';
const R2 = '88888888-0002-0002-0002-888888888888';

const GUN = '2026-08-10';
const ARALIK = { from: '2026-08-01', to: '2026-08-31' } as const;

async function kampanya(id: string, ad: string, dis: string): Promise<void> {
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name,
       status, budget_mode, updated_at)
     VALUES ($1,$2,$3,'meta',$4,$5,'active','daily',now())`,
    [id, IDS.adAccount, IDS.client, dis, ad],
  );
}

async function set(id: string, kampanyaId: string, ad: string, dis: string): Promise<void> {
  await h.q(
    `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id,
       name, status, budget_mode, updated_at)
     VALUES ($1,$2,$3,$4,'meta',$5,$6,'active','none',now())`,
    [id, kampanyaId, IDS.adAccount, IDS.client, dis, ad],
  );
}

async function reklam(id: string, setId: string, ad: string, dis: string): Promise<void> {
  await h.q(
    `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id,
       name, status, updated_at)
     VALUES ($1,$2,$3,$4,'meta',$5,$6,'active',now())`,
    [id, setId, IDS.adAccount, IDS.client, dis, ad],
  );
}

async function metrik(
  seviye: string,
  entityId: string,
  dis: string,
  harcama: string,
  reach = 0,
): Promise<void> {
  await h.q(
    `INSERT INTO insights_daily
       (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
        date, breakdown_key, impressions, clicks, spend_micros, conversions,
        conversion_value_micros, currency, reach)
     VALUES ($1,$2,'meta',$3::"EntityLevel",$4,$5,$6::date,'',100,10,$7,1,'0','TRY',$8)`,
    [IDS.client, IDS.adAccount, seviye, entityId, dis, GUN, harcama, reach],
  );
}

beforeAll(async () => {
  h = await createHarness();
  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;
  svc = new MetricsService(prisma);
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);

  await kampanya(K1, 'Kampanya 1', 'c1');
  await kampanya(K2, 'Kampanya 2', 'c2');
  await set(S1, K1, 'Set 1-A', 'g1');
  await set(S2, K2, 'Set 2-A', 'g2');
  await reklam(R1, S1, 'Reklam 1-A-1', 'a1');
  await reklam(R2, S2, 'Reklam 2-A-1', 'a2');

  /*
   * PLATFORM AYNI HARCAMAYI DÖRT SEVİYEDE BİLDİRİYOR. Hesap satırı iki
   * kampanyanın TOPLAMI; odak testinin anlamı da burada: odaklıyken
   * okunan sayı hesap toplamı DEĞİL, kampanyanın kendisi olmalı.
   */
  await metrik('account', IDS.adAccount, 'act_999', '300000000', 5000);
  await metrik('campaign', K1, 'c1', '100000000', 1000);
  await metrik('campaign', K2, 'c2', '200000000', 2000);
  await metrik('ad_group', S1, 'g1', '100000000');
  await metrik('ad_group', S2, 'g2', '200000000');
  await metrik('ad', R1, 'a1', '100000000');
  await metrik('ad', R2, 'a2', '200000000');
});

describe('özet odağa daralıyor', () => {
  it('odaksız özet HESAP toplamını veriyor', async () => {
    const r = await svc.summary(CTX, { ...ARALIK } as never);
    expect(r.spendMicros).toBe('300000000');
  });

  it('KRİTİK: kampanyaya odaklanınca o kampanyanın harcaması geliyor', async () => {
    const r = await svc.summary(CTX, { ...ARALIK, campaignId: K1 } as never);
    expect(r.spendMicros).toBe('100000000');
  });

  it('KRİTİK: reklam setine odaklanınca setin harcaması geliyor', async () => {
    const r = await svc.summary(CTX, { ...ARALIK, adGroupId: S2 } as never);
    expect(r.spendMicros).toBe('200000000');
  });

  it('KRİTİK: reklam seti kampanyayı EZİYOR — ikisi AND ile birleşmiyor', async () => {
    /*
     * `entity_id` tek bir varlık; ikisini AND ile birleştirmek aynı satırın
     * hem kampanya hem reklam seti kimliği taşımasını beklemek olurdu ve
     * sonuç HER ZAMAN boş çıkardı.
     */
    const r = await svc.summary(CTX, { ...ARALIK, campaignId: K1, adGroupId: S1 } as never);
    expect(r.spendMicros).toBe('100000000');
  });

  it('KRİTİK: ERİŞİM DE ODAKTAN okunuyor', async () => {
    /*
     * Hesap seviyesinden okumaya devam etmek, tek bir kampanyaya inmiş
     * kullanıcıya BÜTÜN HESABIN erişimini kampanyanınmış gibi gösterirdi.
     */
    const r = await svc.summary(CTX, { ...ARALIK, campaignId: K1 } as never);
    expect(r.reach).toBe(1000);
  });

  it('platformun o seviyede erişimi yoksa BİLİNMİYOR — sıfır değil', async () => {
    // Reklam seti satırlarına erişim yazılmadı; "0" göstermek uydurma olurdu.
    const r = await svc.summary(CTX, { ...ARALIK, adGroupId: S1 } as never);
    expect(r.reach).toBeNull();
  });
});

describe('grafik odağa daralıyor', () => {
  it('KRİTİK: zaman serisi de kampanyanın rakamını veriyor', async () => {
    /*
     * Kartlar kampanyayı, grafik workspace'i gösterseydi aynı ekranda iki
     * farklı gerçek olurdu.
     */
    const r = await svc.timeseries(CTX, { ...ARALIK, campaignId: K1 } as never);
    expect(r.points).toHaveLength(1);
    expect(r.points[0]?.spendMicros).toBe('100000000');
  });
});

describe('kırılımda odak ÜST VARLIK demek', () => {
  it('KRİTİK: kampanyanın ALTINDAKİ reklam setleri geliyor', async () => {
    const r = await svc.breakdown(CTX, {
      ...ARALIK,
      level: 'ad_group',
      limit: 50,
      campaignId: K1,
    } as never);
    expect(r.map((x) => x.entityId)).toEqual([S1]);
  });

  it('KRİTİK: kampanyanın ALTINDAKİ reklamlar geliyor — set verilmeden', async () => {
    /*
     * Kampanyaya inip "Reklam" sekmesine geçen kullanıcı, o kampanyanın
     * reklamlarını görmeli. Süzgeç yalnızca reklam seti üzerinden yazılsaydı
     * bütün workspace'in reklamları listelenirdi.
     */
    const r = await svc.breakdown(CTX, {
      ...ARALIK,
      level: 'ad',
      limit: 50,
      campaignId: K2,
    } as never);
    expect(r.map((x) => x.entityId)).toEqual([R2]);
  });

  it('KRİTİK: reklam setinin ALTINDAKİ reklamlar geliyor', async () => {
    const r = await svc.breakdown(CTX, {
      ...ARALIK,
      level: 'ad',
      limit: 50,
      adGroupId: S1,
    } as never);
    expect(r.map((x) => x.entityId)).toEqual([R1]);
  });

  it('KRİTİK: KAMPANYA SEVİYESİNDE odak UYGULANMIYOR — liste boşalmıyor', async () => {
    /*
     * Kampanya satırlarında `g` ve `ag` NULL; `NULL = x` hiçbir satırı
     * geçirmez ve kampanya listesi BOŞ çıkardı. Arayüz odağı zaten
     * temizliyor ama sunucu buna bahis oynamıyor.
     */
    const r = await svc.breakdown(CTX, {
      ...ARALIK,
      level: 'campaign',
      limit: 50,
      campaignId: K1,
    } as never);
    expect(r.map((x) => x.entityId).sort()).toEqual([K1, K2].sort());
  });

  it('odaksız kırılım BÜTÜN setleri veriyor', async () => {
    const r = await svc.breakdown(CTX, { ...ARALIK, level: 'ad_group', limit: 50 } as never);
    expect(r).toHaveLength(2);
  });
});

describe('ekmek kırıntısının isimleri', () => {
  it('KRİTİK: reklam setinden kampanya TÜRETİLİYOR', async () => {
    // Adres yalnızca reklam seti taşıyor olsa bile üst basamak çizilebilmeli.
    const r = await svc.hierarchyPath(CTX, { adGroupId: S1 });
    expect(r.adGroup).toEqual({ id: S1, name: 'Set 1-A' });
    expect(r.campaign).toEqual({ id: K1, name: 'Kampanya 1' });
  });

  it('yalnızca kampanya verildiğinde set null', async () => {
    const r = await svc.hierarchyPath(CTX, { campaignId: K2 });
    expect(r.campaign?.name).toBe('Kampanya 2');
    expect(r.adGroup).toBeNull();
  });

  it('KRİTİK: ad METRİKTEN DEĞİL YAPIDAN okunuyor', async () => {
    /*
     * Kırılım satırları adı taşıyor ama liste boş olabiliyor: seçili
     * aralıkta o kampanyanın hiç verisi yoksa şerit adsız kalırdı.
     */
    await h.q(`DELETE FROM insights_daily`);
    const r = await svc.hierarchyPath(CTX, { campaignId: K1 });
    expect(r.campaign?.name).toBe('Kampanya 1');
  });
});
