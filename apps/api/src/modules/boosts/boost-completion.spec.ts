import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import { BoostExecutorService } from './boost-executor.service';

/**
 * ═══ GÖNDERİ BİR KEZ BOOSTLANINCA ÖMÜR BOYU KİLİTLENİYORDU ═══
 *
 * `boosts_active_post_uniq` kısmi tekil indeksi 'active' durumunu kapsıyor ve
 * aynı gönderi için ikinci satırı reddediyor. Ama hiçbir kod yolu bir boost'u
 * 'active' durumundan ÇIKARMIYORDU: yürütücü yalnızca 'creating', 'active' ve
 * 'failed' yazıyor, durum listesinde bitmiş bir boost'un karşılığı yoktu.
 *
 * Sonuç, kullanıcının doğrudan istediği şeyi imkânsız kılıyordu: "önceden
 * yayınlandıysa tekrar boostla". Kampanya Meta'da çoktan durmuş olsa bile
 * (ad set `end_time` ile oluşturuluyor) bizim kaydımız "hâlâ yayında"
 * diyordu ve düğme sonsuza kadar kapalı kalıyordu.
 *
 * BU DOSYA HEM BİTİRMEYİ HEM DE ASIL VAADİ SINIYOR: bitmiş boost'un ardından
 * aynı gönderiye ikinci bir boost AÇILABİLİYOR mu.
 */

let h: Harness;
let svc: BoostExecutorService;

const PAGE = '77777777-7777-7777-7777-777777777777';
const POST = '66666666-6666-6666-6666-666666666666';
const BOOST = '99999999-9999-9999-9999-999999999999';
const BOOST2 = '99999999-9999-9999-9999-999999999998';

beforeAll(async () => {
  h = await createHarness();
  svc = new BoostExecutorService(
    {} as never,
    {} as never,
    {} as never,
    // ADMIN PRISMA yerine harness'ın kendi istemcisi: `completeEndedBoosts`
    // BYPASSRLS ile koşuyor ve bu koşum ortamı zaten o rolü temsil ediyor.
    h.db as never,
  );
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(
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
     VALUES ($1, $2, $3, $4, 'post-abcdefgh', 'photo', now() - interval '20 days', now())`,
    [POST, IDS.org, IDS.client, PAGE],
  );
});

/** Platformda oluşmuş, yayındaki bir boost. `gunOnce` = kaç gün önce oluştu. */
async function yayindaBoost(id: string, gunOnce: number, sure = 3): Promise<void> {
  await h.q(
    `INSERT INTO boosts
       (id, org_id, client_id, organic_post_id, ad_account_id, status,
        budget_mode, daily_budget_micros, duration_days, objective, reason,
        created_on_platform_at, external_campaign_id, external_ad_set_id,
        external_ad_id, approved_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'active', 'daily', 100000000, $6,
             'OUTCOME_ENGAGEMENT', 'test', now() - make_interval(days => $7::int),
             -- ÜÇ KİMLİK BİRDEN: boosts_active_ids_chk yayındaki bir boost'ta
             -- üçünü de zorunlu kılıyor.
             'c-1', 'as-1', 'ad-1', now(), now())`,
    [id, IDS.org, IDS.client, POST, IDS.adAccount, sure, gunOnce],
  );
}

const durum = async (id: string): Promise<string> => {
  const [r] = await h.q<{ status: string }>(`SELECT status FROM boosts WHERE id = $1`, [id]);
  return r!.status;
};

describe('süresi dolmuş boost bitiriliyor', () => {
  it('KRİTİK: süresi geçmiş boost "completed" oluyor', async () => {
    await yayindaBoost(BOOST, 5, 3); // 5 gün önce başladı, 3 günlüktü
    const sonuc = await svc.completeEndedBoosts();

    expect(sonuc.rows).toBe(1);
    expect(await durum(BOOST)).toBe('completed');
  });

  it('KRİTİK: süresi DOLMAMIŞ boost’a dokunulmuyor', async () => {
    // Erken bitirmek, Meta'da hâlâ harcayan bir kampanya dururken ikinci
    // kampanyanın açılmasına izin vermek olurdu — çift harcama.
    await yayindaBoost(BOOST, 1, 7); // 1 gün önce başladı, 7 günlük
    const sonuc = await svc.completeEndedBoosts();

    expect(sonuc.rows).toBe(0);
    expect(await durum(BOOST)).toBe('active');
  });

  it('platformda hiç oluşmamış boost bitirilmiyor', async () => {
    await h.q(
      `INSERT INTO boosts
         (id, org_id, client_id, organic_post_id, ad_account_id, status,
          budget_mode, daily_budget_micros, duration_days, objective, reason,
          external_campaign_id, external_ad_set_id, external_ad_id,
          approved_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', 'daily', 100000000, 1,
               'OUTCOME_ENGAGEMENT', 'test', 'c-9', 'as-9', 'ad-9', now(), now())`,
      [BOOST, IDS.org, IDS.client, POST, IDS.adAccount],
    );
    expect((await svc.completeEndedBoosts()).rows).toBe(0);
    expect(await durum(BOOST)).toBe('active');
  });

  it('kaç satırın bitirildiği NOTTA yazılı — sessiz kesme yok', async () => {
    await yayindaBoost(BOOST, 9, 3);
    expect((await svc.completeEndedBoosts()).note).toContain('1');
  });
});

describe('TEKRAR BOOSTLAMA — kullanıcının asıl istediği', () => {
  /** Aynı gönderiye ikinci boost denemesi; kısmi tekil indeks son söz. */
  async function ikinciBoostDene(): Promise<boolean> {
    const satirlar = await h.q<{ id: string }>(
      `INSERT INTO boosts
         (id, org_id, client_id, organic_post_id, ad_account_id, status,
          budget_mode, daily_budget_micros, duration_days, objective, reason,
          approved_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'approved', 'daily', 100000000, 3,
               'OUTCOME_ENGAGEMENT', 'ikinci', now(), now())
       ON CONFLICT DO NOTHING
       RETURNING id::text AS id`,
      [BOOST2, IDS.org, IDS.client, POST, IDS.adAccount],
    );
    return satirlar.length > 0;
  }

  it('KRİTİK: boost YAYINDAYKEN ikinci boost REDDEDİLİYOR', async () => {
    await yayindaBoost(BOOST, 1, 7);
    expect(await ikinciBoostDene()).toBe(false);
  });

  it('KRİTİK: boost BİTTİKTEN sonra aynı gönderi TEKRAR boostlanabiliyor', async () => {
    /*
     * BU DOSYANIN VAR OLMA SEBEBİ. Bu iddia bitirme taraması yazılmadan önce
     * YANLIŞTI: gönderi ilk boost'tan sonra sonsuza kadar kilitliydi.
     */
    await yayindaBoost(BOOST, 5, 3);
    expect(await ikinciBoostDene()).toBe(false); // henüz bitirilmedi

    await svc.completeEndedBoosts();

    expect(await ikinciBoostDene()).toBe(true);
  });

  it('eski boost kaydı SİLİNMİYOR — harcama muhasebesi ve "daha önce boostlandı" uyarısı ona bağlı', async () => {
    await yayindaBoost(BOOST, 5, 3);
    await svc.completeEndedBoosts();

    const [eski] = await h.q<{ external_campaign_id: string; daily_budget_micros: string }>(
      `SELECT external_campaign_id, daily_budget_micros::text AS daily_budget_micros
         FROM boosts WHERE id = $1`,
      [BOOST],
    );
    expect(eski!.external_campaign_id).toBe('c-1');
    expect(eski!.daily_budget_micros).toBe('100000000');
  });

  it('KRİTİK: gönderi listesindeki ENGEL kalkıyor', async () => {
    // `has_live_boost` durum listesine bakıyor; 'completed' o listede yok.
    await yayindaBoost(BOOST, 5, 3);

    const canli = async (): Promise<boolean> => {
      const [r] = await h.q<{ v: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM boosts b
           WHERE b.organic_post_id = $1
             AND b.status IN ('candidate', 'approved', 'creating', 'active')
         ) AS v`,
        [POST],
      );
      return r!.v;
    };

    expect(await canli()).toBe(true);
    await svc.completeEndedBoosts();
    expect(await canli()).toBe(false);
  });
});
