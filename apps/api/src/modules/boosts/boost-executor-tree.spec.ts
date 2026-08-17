import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { TenantContext } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { PlatformApiError } from '../connections/provider.types';
import { BoostExecutorService } from './boost-executor.service';
import { BoostsService } from './boosts.service';

/**
 * Boost kural motoru — KAMPANYA AĞACINA BAĞLANDI.
 *
 * Kuraldan doğan bir boost artık elle kurulan kampanyalarla aynı listede,
 * aynı durum modeliyle ve "nereden geldi" bilgisiyle duruyor. Beklenmedik bir
 * harcamanın kaynağını bulmanın tek yolu bu bağ.
 *
 * `boosts` TABLOSU KALIYOR ve işi değişmiyor: onay kuyruğu ve aylık tavan
 * muhasebesi. Ağaç "hangi kampanyalar var", `boosts` "hangi boost onaylandı
 * ve ne kadar taahhüt edildi" sorusunun cevabı.
 */

let h: Harness;
/**
 * Test çalıştırıcısı — yürütücü artık hazır bir `tx` değil, "şu işi bir
 * transaction'da koştur" diyen bir fonksiyon alıyor. Sebebi üretimde
 * öğrenildi: platform çağrısı transaction içinde kalınca Prisma'nın 5 saniyelik
 * sınırı doluyor ve hata bile kaydedilemiyor.
 */
const runner = <T>(fn: (tx: never) => Promise<T>): Promise<T> => fn(h.db as never);
let svc: BoostExecutorService;
let boosts: BoostsService;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const createBoost = vi.fn();
const canWrite = vi.fn();

const POST = '66666666-6666-6666-6666-666666666666';
const PAGE = '77777777-7777-7777-7777-777777777777';
const RULE = '88888888-8888-8888-8888-888888888888';
const BOOST = '99999999-9999-9999-9999-999999999999';

/**
 * Elle boost yolu bu dosyada sınanmıyor (kendi testi var); yürütücü yalnızca
 * yapıcı bağımlılığını karşılıyor. Gerçek bir yürütücü vermek, bu testleri
 * ilgisiz bir bileşenin davranışına bağlardı.
 */
function executorStub(): BoostExecutorService {
  return {
    createOneApproved: async () => ({ ok: true as const }),
  } as unknown as BoostExecutorService;
}

beforeAll(async () => {
  h = await createHarness();
  svc = new BoostExecutorService(
    { get: () => ({ platform: 'meta', createBoost, canWrite }) } as never,
    { getAccessToken: async () => 'token' } as never,
    { acquire: async () => ({ allowed: true, usagePercent: 5 }), record: async () => {} } as never,
  );
  boosts = new BoostsService(
    {
      withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
    } as unknown as PrismaService,
    // ELLE BOOST YOLU BU TESTLERDE KULLANILMIYOR; yürütücü yalnızca
    // bağımlılığı karşılamak için veriliyor.
    executorStub(),
  );
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);

  await h.q(
    // FATURALANDIRMA HESABI ŞART: `runRule` bağlı reklam hesabı olmayan
    // sayfayı atlıyor — açılamayacak bir boost'u onay kuyruğuna koymak
    // kullanıcıyı boşuna meşgul ederdi.
    `INSERT INTO social_profiles
       (id, org_id, client_id, connection_id, profile_type, external_id, name,
        linked_ad_account_id, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', 'page-1', 'Sayfa', $5, now())`,
    [PAGE, IDS.org, IDS.client, IDS.connection, IDS.adAccount],
  );
  await h.q(
    `INSERT INTO organic_posts
       (id, org_id, client_id, social_profile_id, external_id, media_type,
        published_at, updated_at)
     VALUES ($1, $2, $3, $4, 'post-abcdefgh', 'photo', now() - interval '2 days', now())`,
    [POST, IDS.org, IDS.client, PAGE],
  );
  await h.q(
    `INSERT INTO boost_rules
       (id, org_id, client_id, social_profile_id, name,
        conditions, combinator, daily_budget_micros, duration_days,
        monthly_cap_micros, objective, updated_at)
     VALUES ($1, $2, $3, $4, 'Etkileşim kuralı',
             '[{"metric":"engagements","operator":"gte","value":100}]'::jsonb,
             'and', 100000000, 3, 3000000000, 'OUTCOME_ENGAGEMENT', now())`,
    [RULE, IDS.org, IDS.client, PAGE],
  );

  createBoost.mockReset();
  canWrite.mockReset();
  canWrite.mockReturnValue({ ok: true, missing: [] });
  createBoost.mockResolvedValue({
    externalCampaignId: 'c-1',
    externalAdSetId: 'as-1',
    externalAdId: 'ad-1',
  });
});

/** Onaylanmış bir boost ekler. */
async function onaylanmisBoost(ruleId: string | null = RULE): Promise<void> {
  await h.q(
    `INSERT INTO boosts
       (id, org_id, client_id, boost_rule_id, organic_post_id, ad_account_id,
        status, daily_budget_micros, duration_days,
        objective, reason, approved_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'approved', 100000000, 3,
             'OUTCOME_ENGAGEMENT', 'Etkileşim 120 ≥ 100', now(), now())`,
    [BOOST, IDS.org, IDS.client, ruleId, POST, IDS.adAccount],
  );
}

describe('boost ağaca yazılıyor', () => {
  it('kuraldan doğan boost KAMPANYA olarak görünüyor', async () => {
    await onaylanmisBoost();
    const sonuc = await svc.createApproved(runner, IDS.client);
    expect(sonuc).toEqual({ created: 1, failed: 0 });

    const [kampanya] = await h.q<{
      name: string;
      status: string;
      source: string;
      boost_rule_id: string;
      external_campaign_id: string;
      goal: string | null;
    }>(`SELECT name, status, source, boost_rule_id::text AS boost_rule_id,
               external_campaign_id, goal
        FROM draft_campaigns`);

    expect(kampanya!.status).toBe('published');
    expect(kampanya!.external_campaign_id).toBe('c-1');
    // KÖKEN: hangi kural açtı.
    expect(kampanya!.source).toBe('boost_rule');
    expect(kampanya!.boost_rule_id).toBe(RULE);
    // Boost'un hedefi yok: hedef basit yüzeyin üç seçeneğinden biri ve
    // "gönderiyi öne çıkar" onlardan biri değil.
    expect(kampanya!.goal).toBeNull();
  });

  it('reklam KREATİFSİZ, gönderiye bağlı', async () => {
    /**
     * Boost edilen gönderinin metni ve görseli ZATEN META'DA. Kreatif
     * kütüphanemizde karşılığı yok ve `draft_ads_source_chk` ikisinden tam
     * birinin dolu olmasını zorunlu kılıyor.
     */
    await onaylanmisBoost();
    await svc.createApproved(runner, IDS.client);

    const [reklam] = await h.q<{
      creative_id: string | null;
      organic_post_id: string;
      external_ad_id: string;
    }>(`SELECT creative_id::text AS creative_id, organic_post_id::text AS organic_post_id,
               external_ad_id FROM draft_ads`);

    expect(reklam!.creative_id).toBeNull();
    expect(reklam!.organic_post_id).toBe(POST);
    expect(reklam!.external_ad_id).toBe('ad-1');
  });

  it('dış kimlikler ağacın KENDİ SEVİYELERİNE yazılıyor', async () => {
    await onaylanmisBoost();
    await svc.createApproved(runner, IDS.client);

    const [grup] = await h.q<{ external_ad_set_id: string; social_profile_id: string }>(
      `SELECT external_ad_set_id, social_profile_id::text AS social_profile_id
       FROM draft_ad_groups`,
    );
    expect(grup!.external_ad_set_id).toBe('as-1');
    expect(grup!.social_profile_id).toBe(PAGE);
  });

  it('KURALSIZ (elle onaylanan) boost "manual" kökenli', async () => {
    /**
     * `draft_campaigns_boost_rule_chk` kuraldan doğan kampanyanın kuralını
     * taşımasını zorunlu kılıyor; kuralsız bir boost'ta o alan boş ve satır
     * 'manual' olmalı — yoksa kısıt düşerdi.
     */
    await onaylanmisBoost(null);
    const sonuc = await svc.createApproved(runner, IDS.client);
    expect(sonuc.created).toBe(1);

    const [kampanya] = await h.q<{ source: string; boost_rule_id: string | null }>(
      `SELECT source, boost_rule_id::text AS boost_rule_id FROM draft_campaigns`,
    );
    expect(kampanya!.source).toBe('manual');
    expect(kampanya!.boost_rule_id).toBeNull();
  });

  it('boosts TABLOSU İŞİNİ SÜRDÜRÜYOR — tavan muhasebesi orada', async () => {
    // Ağaç "hangi kampanyalar var", `boosts` "ne kadar taahhüt edildi"
    // sorusunun cevabı. İkisi birbirinin yerini almıyor.
    await onaylanmisBoost();
    await svc.createApproved(runner, IDS.client);

    const [boost] = await h.q<{ status: string; daily_budget_micros: string }>(
      `SELECT status, daily_budget_micros::text AS daily_budget_micros FROM boosts`,
    );
    expect(boost!.status).toBe('active');
    // Taahhüt hesabı günlük bütçe × süre üzerinden yapılıyor; `boosts`
    // ikisini de tutuyor ve ağaç onların yerini almıyor.
    expect(boost!.daily_budget_micros).toBe('100000000');
  });
});

describe('başarısızlık', () => {
  it('platform hatasında ağaca HİÇBİR SATIR yazılmıyor', async () => {
    // Oluşmamış bir kampanyayı listede göstermek, olmayan bir harcamayı var
    // saymak olurdu.
    createBoost.mockRejectedValue(
      new PlatformApiError('meta', 'permanent', 'Gönderi boost edilemiyor'),
    );
    await onaylanmisBoost();
    const sonuc = await svc.createApproved(runner, IDS.client);

    expect(sonuc).toEqual({ created: 0, failed: 1 });
    expect(await h.q(`SELECT id FROM draft_campaigns`)).toHaveLength(0);

    const [boost] = await h.q<{ status: string; error: string }>(
      `SELECT status, error FROM boosts`,
    );
    expect(boost!.status).toBe('failed');
    expect(boost!.error).toContain('boost edilemiyor');
  });

  it('KRİTİK: ağaç yazılamazsa boost YİNE oluşmuş sayılıyor', async () => {
    /**
     * Ağaç satırı yazılamazsa boost platformda ÇOKTAN oluştu ve para
     * harcıyor. Hata fırlatmak, oluşan boost'u "başarısız" göstermek olurdu —
     * ve bir sonraki tur onu ikinci kez oluşturmayı denerdi.
     *
     * Ağacı bozmanın en temiz yolu: reklam hesabını sil, yabancı anahtar
     * düşsün. `boosts` satırı yine `active` kalmalı.
     */
    await onaylanmisBoost();
    // Kampanya satırı `ad_account_id` yabancı anahtarına bağlı; hesabı
    // silmek ağaç yazımını düşürüyor ama boost akışını değil.
    await h.q(`ALTER TABLE draft_campaigns DROP CONSTRAINT draft_campaigns_ad_account_id_fkey`);
    await h.q(
      `ALTER TABLE draft_campaigns ADD CONSTRAINT draft_campaigns_ad_account_id_fkey
       FOREIGN KEY (ad_account_id) REFERENCES ad_accounts(id) ON DELETE CASCADE
       DEFERRABLE INITIALLY IMMEDIATE`,
    );
    await h.q(`UPDATE boosts SET ad_account_id = ad_account_id`);

    const sonuc = await svc.createApproved(runner, IDS.client);
    expect(sonuc.created).toBe(1);

    const [boost] = await h.q<{ status: string }>(`SELECT status FROM boosts`);
    expect(boost!.status).toBe('active');
  });
});

describe('ADAY AŞAMASINDA ağaç doğuyor', () => {
  beforeEach(async () => {
    // Kuralın koşulunu sağlayan bir gönderi: iki günlük ve 120 etkileşimli.
    await h.q(
      `UPDATE organic_posts SET engagements = 120, reach = 1000, impressions = 2000
       WHERE id = $1`,
      [POST],
    );
  });

  it('KRİTİK: aday üretilirken TASLAK kampanya da yazılıyor', async () => {
    /**
     * Bugüne kadar bir boost adayı yalnızca `boosts` tablosunda vardı ve
     * kampanya listesinde hiç görünmüyordu. Onay ekranı "ne yayınlanacak"
     * sorusuna tek cümlelik bir özetle cevap veriyordu; oysa onaylanan şey
     * PARA TAAHHÜDÜ.
     */
    const sonuc = await boosts.runRule(h.db, RULE, new Date());
    expect(sonuc.created).toBe(1);

    const [kampanya] = await h.q<{ status: string; source: string; boost_rule_id: string }>(
      `SELECT status, source, boost_rule_id::text AS boost_rule_id FROM draft_campaigns`,
    );
    // TASLAK olarak doğuyor, yayınlanmış olarak değil.
    expect(kampanya!.status).toBe('draft');
    expect(kampanya!.source).toBe('boost_rule');
    expect(kampanya!.boost_rule_id).toBe(RULE);
  });

  it('boost ile taslak BİRBİRİNE BAĞLI', async () => {
    await boosts.runRule(h.db, RULE, new Date());
    const [boost] = await h.q<{ draft_campaign_id: string | null }>(
      `SELECT draft_campaign_id::text AS draft_campaign_id FROM boosts`,
    );
    const [kampanya] = await h.q<{ id: string }>(`SELECT id::text AS id FROM draft_campaigns`);
    expect(boost!.draft_campaign_id).toBe(kampanya!.id);
  });

  it('KRİTİK: onaylanan aday İKİNCİ bir kampanya doğurmuyor', async () => {
    /**
     * Aday aşamasında taslak yazıldı; yayın onu güncellemeli. İkinci bir
     * kampanya açmak, kullanıcının listede aynı boost'u iki kez görmesi ve
     * hangisinin gerçek olduğunu bilememesi demek olurdu.
     */
    await boosts.runRule(h.db, RULE, new Date());
    await h.q(`UPDATE boosts SET status = 'approved', approved_at = now()`);

    const sonuc = await svc.createApproved(runner, IDS.client);
    expect(sonuc.created).toBe(1);

    const kampanyalar = await h.q<{ status: string; external_campaign_id: string }>(
      `SELECT status, external_campaign_id FROM draft_campaigns`,
    );
    expect(kampanyalar).toHaveLength(1);
    expect(kampanyalar[0]!.status).toBe('published');
    expect(kampanyalar[0]!.external_campaign_id).toBe('c-1');

    // Dış kimlikler ağacın kendi seviyelerine yazılıyor.
    const [grup] = await h.q<{ external_ad_set_id: string }>(
      `SELECT external_ad_set_id FROM draft_ad_groups`,
    );
    expect(grup!.external_ad_set_id).toBe('as-1');
    const [reklam] = await h.q<{ external_ad_id: string }>(
      `SELECT external_ad_id FROM draft_ads`,
    );
    expect(reklam!.external_ad_id).toBe('ad-1');
  });

  it('KRİTİK: REDDEDİLEN adayın taslağı siliniyor', async () => {
    /**
     * Bırakmak, kampanya listesinde asla yayınlanmayacak bir taslak bırakmak
     * olurdu — kullanıcı onu görüp "bunu ben mi unuttum" diye düşünürdü. Onay
     * reddi, o kampanyanın hiç var olmaması demek.
     */
    await boosts.runRule(h.db, RULE, new Date());
    const [boost] = await h.q<{ id: string }>(`SELECT id::text AS id FROM boosts`);

    await boosts.decide(CTX, boost!.id, false);

    expect(await h.q(`SELECT id FROM draft_campaigns`)).toHaveLength(0);
    // Boost kaydı KALIYOR: denetim izi ve tavan muhasebesi orada.
    const [kalan] = await h.q<{ status: string }>(`SELECT status FROM boosts`);
    expect(kalan!.status).toBe('rejected');
  });

  it('onaylanan adayın taslağı DURUYOR', async () => {
    await boosts.runRule(h.db, RULE, new Date());
    const [boost] = await h.q<{ id: string }>(`SELECT id::text AS id FROM boosts`);
    await boosts.decide(CTX, boost!.id, true);
    expect(await h.q(`SELECT id FROM draft_campaigns`)).toHaveLength(1);
  });
});

/**
 * KURAL YOLUNUN DAVRANIŞI DEĞİŞMEDİ.
 *
 * `BoostRequest` elle boost için iki kipli bütçe ve hedefleme alanı kazandı
 * (K16, K18). Kural yolu ikisini de KULLANMIYOR ve kullanmamalı: kuralın aylık
 * tavanı günlük bütçe × süre üzerinden hesaplanıyor, hedefleme ise kural
 * ekranında hiç sorulmuyor.
 *
 * Bu iki testin tek işi o kararı kilitlemek. Yeni alanların "madem var,
 * buradan da geçirelim" diye kural yoluna sızması, aynı kuralın aynı tavanla
 * farklı sayıda boost açmaya başlaması demek olurdu — ve bu hiçbir yerde hata
 * üretmezdi.
 */
/**
 * PLATFORM ÇAĞRISI TRANSACTION'IN DIŞINDA — mimari kural, üretimde öğrenildi.
 *
 * `withTenant` RLS bağlamı için ETKİLEŞİMLİ bir transaction açıyor
 * (`set_config(..., is_local => true)` transaction ömrüne bağlı) ve Prisma'nın
 * varsayılan sınırı 5 saniye. Boost ise Meta'ya üç-dört HTTP çağrısı yapıyor;
 * üretimde 12,5 saniye sürdü ve şu oldu:
 *
 *   · Transaction öldü, ardından `fail()` bile yazamadı — Meta'nın hata metni
 *     KAYBOLDU ve kullanıcı yalnızca "beklenmeyen bir hata" gördü.
 *   · Kayıt `approved`'da kaldı. Ama çağrı BAŞARILI olmuş olabilir: o zaman
 *     platformda para harcayan bir kampanya var ve bizde hiçbir izi yok.
 *
 * Bu testler kuralı doğrudan kodluyor: çağrı anında AÇIK bir transaction
 * olmamalı. Süre ölçen bir test yazmak yerine bunu ölçüyorlar, çünkü sorun
 * yavaşlık değil YERLEŞİM.
 */
describe('platform çağrısı transaction dışında', () => {
  it('KRİTİK: createBoost çağrılırken açık transaction YOK', async () => {
    let icinde = false;
    let cagriAnindaIcindeydi: boolean | null = null;

    const izleyen = async <T>(fn: (tx: never) => Promise<T>): Promise<T> => {
      icinde = true;
      try {
        return await fn(h.db as never);
      } finally {
        icinde = false;
      }
    };

    createBoost.mockImplementation(async () => {
      cagriAnindaIcindeydi = icinde;
      return { externalCampaignId: 'c-1', externalAdSetId: 'as-1', externalAdId: 'ad-1' };
    });

    await onaylanmisBoost();
    await svc.createApproved(izleyen, IDS.client);

    expect(cagriAnindaIcindeydi).toBe(false);
  });

  it('DB işi BİRDEN FAZLA kısa transaction’da koşuyor', async () => {
    // Tek bir uzun transaction olsaydı sayaç 1 olurdu. En az üç adım var:
    // bekleyenleri oku, `creating` işaretle, sonucu yaz.
    let tur = 0;
    const sayan = async <T>(fn: (tx: never) => Promise<T>): Promise<T> => {
      tur++;
      return fn(h.db as never);
    };

    await onaylanmisBoost();
    await svc.createApproved(sayan, IDS.client);

    expect(tur).toBeGreaterThanOrEqual(3);
  });

  it('KRİTİK: sonuç yazımı düşerse dış kimlikler LOG’A yazılıp hata fırlatılıyor', async () => {
    /*
     * Boost platformda oluştu ve para harcamaya başladı; kaydedilemedi. Sessiz
     * kalmak, kayıtsız bir kampanyayı Ads Manager'da aramak zorunda bırakmak
     * demek. `false` dönmek de yanlış olurdu: ikinci deneme İKİNCİ bir kampanya
     * açardı.
     */
    let ilk = true;
    const sonAdimdaDusen = async <T>(fn: (tx: never) => Promise<T>): Promise<T> => {
      // İlk iki tur (oku + creating) geçiyor; sonucu yazan tur düşüyor.
      if (!ilk && createBoost.mock.calls.length > 0) {
        throw new Error('Transaction already closed');
      }
      ilk = false;
      return fn(h.db as never);
    };

    await onaylanmisBoost();
    await expect(svc.createApproved(sonAdimdaDusen, IDS.client)).rejects.toThrow(
      /Meta'da OLUŞTU ama kaydedilemedi/,
    );

    // KAYIT `creating` KALIYOR, `failed` DEĞİL. `failed` yazmak satırı yeniden
    // denenebilir yapardı ve ikinci bir kampanya açılırdı; `pending()` yalnızca
    // `approved` satırları alıyor, yani `creating` tekrar denenmiyor.
    const [row] = await h.q<{ status: string }>(`SELECT status FROM boosts`);
    expect(row!.status).toBe('creating');
  });
});

describe('kural yolu — yeni alanlar sızmıyor', () => {
  it('KRİTİK: bütçe GÜNLÜK kipte gönderiliyor', async () => {
    await onaylanmisBoost();
    await svc.createApproved(runner, IDS.client);

    expect(createBoost.mock.calls[0]![1].budget).toEqual({
      mode: 'daily',
      dailyMicros: 100_000_000n,
    });
  });

  it('KRİTİK: Facebook sayfası SAYFA GÖNDERİSİ yolundan gidiyor', async () => {
    // Instagram dalı yazıldıktan sonra bu ayrımın kilitli kalması gerekiyor:
    // sayfa gönderisi `object_story_id` ile gömülü geçiyor, Instagram ise ayrı
    // bir kreatif çağrısı istiyor. Kaynak tipi bunu belirliyor.
    await onaylanmisBoost();
    await svc.createApproved(runner, IDS.client);

    expect(createBoost.mock.calls[0]![1].source).toEqual({
      surface: 'facebook_page',
      pageExternalId: 'page-1',
      postExternalId: 'post-abcdefgh',
    });
  });

  it('KRİTİK: hedefleme GÖNDERİLMİYOR — sağlayıcının varsayılanı geçerli', async () => {
    // Kural ekranında hedefleme sorulmuyor; burada bir değer üretmek
    // kullanıcının vermediği bir kararı onun adına vermek olurdu.
    await onaylanmisBoost();
    await svc.createApproved(runner, IDS.client);

    expect(createBoost.mock.calls[0]![1].targeting).toBeUndefined();
  });
});
