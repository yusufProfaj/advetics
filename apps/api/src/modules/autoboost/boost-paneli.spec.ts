import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TenantContext } from '@advetics/shared';
import { AutoBoostReadService } from './autoboost-read.service';
import { AutoBoostLaunchService } from './autoboost-launch.service';

/**
 * ═══ BOOST PANELİ: SIRA, SONUÇ VE TEKRAR ═══
 *
 * Panel üç kararı birden taşıyor ve üçü de sessizce bozulabiliyor:
 *
 *   1. SIRA — kartlar GÖNDERİNİN yayın tarihine göre diziliyor, reklamın
 *      açıldığı tarihe göre değil. Yayınlanmış kart listeden çıkmıyor, yerini
 *      koruyor.
 *   2. SONUÇ — yayındaki kartın harcaması ve dönüşümü kartta yazıyor. Sayı
 *      yoksa SEBEBİ yazıyor: "kampanya senkronize edilmedi" ile "hiç gösterim
 *      almadı" aynı şey değil.
 *   3. TEKRAR — kapanmış kart karara geri açılabiliyor, ama aynı gönderi için
 *      ikinci bir AKTİF kampanya açılamıyor.
 *
 * Testler GERÇEK SORGUYU koşuyor (PGlite): sıralama, dış birleşimler ve RLS
 * davranışı kaynak taramasıyla görülmüyor.
 */
let h: Harness;
let svc: AutoBoostReadService;
let yayin: AutoBoostLaunchService;

const PROFIL = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
const KAMPANYA = 'cccccccc-1111-1111-1111-cccccccccccc';

const CTX = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  isOrgAdmin: true,
} as TenantContext;

beforeAll(async () => {
  h = await createHarness();
  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;
  svc = new AutoBoostReadService(prisma);
  /*
   * YAYIN SERVİSİ YALNIZCA `prisma` İLE KURULUYOR.
   *
   * `tekrarBoostla` platforma hiç gitmiyor — kartı karara geri açmak bir
   * veritabanı işi. Kalan bağımlılıklar için çalışan bir taklit yazmak,
   * sınanmayan bir yolu ayakta tutmak olurdu; çağrılırlarsa test ÇALIŞMA
   * ANINDA patlasın diye boş bırakılıyorlar.
   */
  yayin = new AutoBoostLaunchService(
    prisma,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type,
       external_id, name, sync_enabled, linked_ad_account_id, updated_at)
     VALUES ($1,$2,$3,$4,'instagram_business','ig-1','Sayfa',true,$5,now())`,
    [PROFIL, IDS.org, IDS.client, IDS.connection, IDS.adAccount],
  );
  await h.q(
    `INSERT INTO auto_boost_presets (id, org_id, client_id, platform, social_profile_id,
       enabled, budget_mode, daily_budget_micros, duration_days, settings, updated_at)
     VALUES (gen_random_uuid(),$1,$2,'meta',$3,true,'daily',250000000,7,
             '{"targeting":{"countries":["TR"]},"callToAction":"LEARN_MORE"}'::jsonb, now())`,
    [IDS.org, IDS.client, PROFIL],
  );
});

/** Kuyruğa tek kart — `publishedAt` ve durum testin kendi değişkeni. */
async function kart(opts: {
  id: string;
  disKimlik: string;
  gonderiTarihi: string | null;
  durum?: string;
  kuyrugaGiris?: string;
  kampanyaKimligi?: string | null;
}): Promise<void> {
  await h.q(
    `INSERT INTO auto_boost_queue_items
       (id, org_id, client_id, platform, social_profile_id, external_id, title,
        published_at, status, external_campaign_id, launched_at, created_at, updated_at)
     VALUES ($1,$2,$3,'meta',$4,$5,'Başlık',$6,$7,$8,$9,
             COALESCE($10::timestamptz, now()), now())`,
    [
      opts.id,
      IDS.org,
      IDS.client,
      PROFIL,
      opts.disKimlik,
      opts.gonderiTarihi,
      opts.durum ?? 'pending',
      opts.kampanyaKimligi ?? null,
      // YAYIN TARİHİ FİXTURE'DA AYRI: aynı parametreyi hem durum kolonuna hem
      // bir CASE içine vermek Postgres'te tip çıkarımını çelişkiye düşürüyor
      // ("inconsistent types deduced for parameter").
      (opts.durum ?? 'pending') === 'launched' ? new Date().toISOString() : null,
      opts.kuyrugaGiris ?? null,
    ],
  );
}

describe('SIRA — gönderi tarihine göre', () => {
  it('düzenek gerçekten kart üretiyor', async () => {
    await kart({ id: uuid(1), disKimlik: 'm1', gonderiTarihi: '2026-09-01T10:00:00Z' });
    const liste = await svc.listQueue(CTX, IDS.client);
    expect(liste.items).toHaveLength(1);
  });

  it('KRİTİK: sıralama GÖNDERİ tarihine göre — kuyruğa giriş sırasına DEĞİL', async () => {
    /*
     * Kuyruğa giriş sırası gönderi sırasıyla aynı değil: geçmiş içerik çekimi
     * eski gönderileri BİRDEN kuyruğa atıyor ve hepsinin `created_at`i aynı
     * dakika. O sıraya göre dizmek, kullanıcının içerik takvimiyle hiç
     * ilgisi olmayan bir liste üretiyordu.
     *
     * Burada iki kart TERS sırada kuyruğa giriyor: eski gönderi ÖNCE
     * kuyruğa, yeni gönderi SONRA. Doğru çıktı yeni gönderinin üstte olması.
     */
    await kart({
      id: uuid(1),
      disKimlik: 'eski',
      gonderiTarihi: '2026-01-05T10:00:00Z',
      kuyrugaGiris: '2026-09-20T10:00:00Z',
    });
    await kart({
      id: uuid(2),
      disKimlik: 'yeni',
      gonderiTarihi: '2026-09-18T10:00:00Z',
      kuyrugaGiris: '2026-09-20T09:00:00Z',
    });

    const liste = await svc.listQueue(CTX, IDS.client);
    expect(liste.items.map((i) => i.externalId)).toEqual(['yeni', 'eski']);
  });

  it('KRİTİK: YAYINLANMIŞ KART LİSTEDE KALIYOR ve tarih sırasındaki yerini KORUYOR', async () => {
    /*
     * Kullanıcının isteği birebir buydu. Yayınlananları sona atmak ya da
     * listeden çıkarmak, gönderi akışını okunmaz yapardı: kullanıcı kendi
     * içerik takvimine bakıyor ve boostlanmış olanların nerede olduğunu
     * görmek istiyor.
     */
    await kart({ id: uuid(1), disKimlik: 'a', gonderiTarihi: '2026-09-20T10:00:00Z' });
    await kart({
      id: uuid(2),
      disKimlik: 'b',
      gonderiTarihi: '2026-09-15T10:00:00Z',
      durum: 'launched',
    });
    await kart({ id: uuid(3), disKimlik: 'c', gonderiTarihi: '2026-09-10T10:00:00Z' });

    const liste = await svc.listQueue(CTX, IDS.client);
    // Yayınlanmış kart ORTADA — tarihi oraya düşüyor.
    expect(liste.items.map((i) => i.externalId)).toEqual(['a', 'b', 'c']);
  });

  it('TARİHİ OLMAYAN KART EN SONA düşüyor', async () => {
    // Araya serpiştirmek sıralamayı okunmaz yapardı.
    await kart({ id: uuid(1), disKimlik: 'tarihsiz', gonderiTarihi: null });
    await kart({ id: uuid(2), disKimlik: 'tarihli', gonderiTarihi: '2020-01-01T10:00:00Z' });

    const liste = await svc.listQueue(CTX, IDS.client);
    expect(liste.items.map((i) => i.externalId)).toEqual(['tarihli', 'tarihsiz']);
  });

  it('KRİTİK: ONAY BEKLEYEN KART LİMİTİN ALTINDA KALMIYOR', async () => {
    /*
     * ═══ SEÇİM SIRASI GÖSTERİM SIRASIYLA AYNI DEĞİL ═══
     *
     * Sorgu 50 satır alıyor. Yalnızca tarihe göre sıralayıp kesmek,
     * yüzlerce yayınlanmış gönderisi olan bir workspace'te ONAY BEKLEYEN
     * kartı limitin altında bırakırdı: kullanıcının yapacak işi olan tek
     * kart ekrandan sessizce düşerdi.
     *
     * Burada 55 yayınlanmış kart var ve hepsi bekleyenden YENİ; bekleyen
     * kart yine listede olmalı.
     */
    for (let i = 0; i < 55; i += 1) {
      await kart({
        id: uuid(100 + i),
        disKimlik: `y${i}`,
        gonderiTarihi: `2026-09-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`,
        durum: 'launched',
      });
    }
    await kart({
      id: uuid(1),
      disKimlik: 'bekleyen',
      gonderiTarihi: '2020-01-01T10:00:00Z',
    });

    const liste = await svc.listQueue(CTX, IDS.client);
    expect(liste.items.map((i) => i.externalId)).toContain('bekleyen');
    // SESSİZ KESME YOK: toplam yine doğru sayılıyor.
    expect(liste.total).toBe(56);
  });
});

describe('SONUÇ — yayındaki kartın performansı', () => {
  async function kampanyaVeMetrik(harcama: number, gosterim: number): Promise<void> {
    await h.q(
      `INSERT INTO campaigns (id, client_id, ad_account_id, platform, external_id,
         name, status, updated_at)
       VALUES ($1,$2,$3,'meta','camp-1','Boost','active',now())`,
      [KAMPANYA, IDS.client, IDS.adAccount],
    );
    await h.q(
      `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level,
         entity_id, entity_external_id, breakdown_key, date, impressions, clicks,
         spend_micros, conversions, currency)
       VALUES ($1,$2,'meta','campaign',$3,'camp-1','','2026-09-15',$4,120,$5,4,'TRY')`,
      [IDS.client, IDS.adAccount, KAMPANYA, gosterim, harcama],
    );
  }

  it('KRİTİK: yayındaki kartın HARCAMASI ve DÖNÜŞÜMÜ kartta', async () => {
    await kampanyaVeMetrik(7_461_060_000, 54_207);
    await kart({
      id: uuid(1),
      disKimlik: 'a',
      gonderiTarihi: '2026-09-15T10:00:00Z',
      durum: 'launched',
      kampanyaKimligi: 'camp-1',
    });

    const [k] = (await svc.listQueue(CTX, IDS.client)).items;
    expect(k!.performance).toEqual({
      spendMicros: '7461060000',
      impressions: 54_207,
      clicks: 120,
      conversions: 4,
    });
    expect(k!.performanceNote).toBeNull();
  });

  it('KRİTİK: KAMPANYA SATIRI YOKSA SIFIR DEĞİL, SEBEP dönüyor', async () => {
    /*
     * Kampanya satırı yapı taramasından geliyor ve boost açıldıktan SONRA
     * oluşuyor. Sıfır göndermek, yeni açılmış çalışan bir kampanyayı "hiç
     * harcamadı" diye göstermek olurdu ve kullanıcı onu bozuk sanardı.
     */
    await kart({
      id: uuid(1),
      disKimlik: 'a',
      gonderiTarihi: '2026-09-15T10:00:00Z',
      durum: 'launched',
      kampanyaKimligi: 'camp-yok',
    });

    const [k] = (await svc.listQueue(CTX, IDS.client)).items;
    expect(k!.performance).toBeNull();
    expect(k!.performanceNote).toContain('senkronize');
  });

  it('KRİTİK: KAMPANYA VAR AMA GÜN VERİSİ YOKSA SIFIR GÖSTERİLMİYOR', async () => {
    /*
     * Toplamlar `COALESCE` ile sıfıra düşüyor, yani "hiç satır yok" ile
     * "satırlar sıfır" aynı görünüyordu. İkisi farklı iş: birincisinde metrik
     * senkronizasyonu henüz koşmadı, ikincisinde kampanya gerçekten gösterim
     * almadı. "0,00 ₺" yazmak, çalışan bir reklamı ölü göstermek olurdu.
     */
    await h.q(
      `INSERT INTO campaigns (id, client_id, ad_account_id, platform, external_id,
         name, status, updated_at)
       VALUES ($1,$2,$3,'meta','camp-1','Boost','active',now())`,
      [KAMPANYA, IDS.client, IDS.adAccount],
    );
    await kart({
      id: uuid(1),
      disKimlik: 'a',
      gonderiTarihi: '2026-09-15T10:00:00Z',
      durum: 'launched',
      kampanyaKimligi: 'camp-1',
    });

    const [k] = (await svc.listQueue(CTX, IDS.client)).items;
    expect(k!.performance).toBeNull();
    expect(k!.performanceNote).toContain('gün verisi');
  });

  it('KRİTİK: ONAY BEKLEYEN KARTTA performans HİÇ YOK', async () => {
    // Henüz yayınlanmamış bir kartın harcaması da yok; sıfır göstermek
    // "yayınlandı ama hiç harcamadı" diye okunurdu.
    await kart({ id: uuid(1), disKimlik: 'a', gonderiTarihi: '2026-09-15T10:00:00Z' });
    const [k] = (await svc.listQueue(CTX, IDS.client)).items;
    expect(k!.performance).toBeNull();
    expect(k!.performanceNote).toBeNull();
  });

  it('KRİTİK: performans DIŞ BİRLEŞİMLE geliyor — kart kaybolmuyor', async () => {
    /*
     * `campaigns` ve `insights_daily` RLS'li. İç birleşim yazılsaydı,
     * kampanyası henüz senkronize edilmemiş her yayınlanmış kart LİSTEDEN
     * TAMAMEN düşerdi ve belirtisi "boostladığım gönderi kayboldu" olurdu.
     */
    await kart({
      id: uuid(1),
      disKimlik: 'a',
      gonderiTarihi: '2026-09-15T10:00:00Z',
      durum: 'launched',
      kampanyaKimligi: null,
    });
    expect((await svc.listQueue(CTX, IDS.client)).items).toHaveLength(1);
  });
});

describe('TEKRAR — kapanmış kartı karara geri açmak', () => {
  it('KRİTİK: yayınlanmış kartta engel YOK', async () => {
    await kart({
      id: uuid(1),
      disKimlik: 'a',
      gonderiTarihi: '2026-09-15T10:00:00Z',
      durum: 'launched',
    });
    const [k] = (await svc.listQueue(CTX, IDS.client)).items;
    expect(k!.reBoostBlockedReason).toBeNull();
  });

  it('KRİTİK: ÖNCEKİ BOOST HÂLÂ YAYINDAYSA engel VAR ve tarihi yazıyor', async () => {
    /*
     * `boosts_active_post_uniq` aynı gönderi için ikinci bir aktif boost'a
     * izin vermiyor. Engeli onay anında öğrenmek, kullanıcıya sebebi
     * yazmayan bir veritabanı hatası göstermek olurdu.
     */
    const post = 'dddddddd-1111-1111-1111-dddddddddddd';
    await h.q(
      `INSERT INTO organic_posts (id, org_id, client_id, social_profile_id, external_id,
         media_type, published_at, updated_at)
       VALUES ($1,$2,$3,$4,'a','image', now() - interval '3 days', now())`,
      [post, IDS.org, IDS.client, PROFIL],
    );
    await h.q(
      // ÜÇ KİMLİK BİRDEN: boosts_active_ids_chk yayındaki bir boost'ta üçünü
      // de zorunlu kılıyor.
      `INSERT INTO boosts (id, org_id, client_id, ad_account_id, organic_post_id, status,
         budget_mode, daily_budget_micros, duration_days, objective, reason,
         created_on_platform_at, external_campaign_id, external_ad_set_id,
         external_ad_id, approved_at, updated_at)
       VALUES (gen_random_uuid(),$1,$2,$3,$4,'active','daily',250000000,7,
               'OUTCOME_ENGAGEMENT','test', now() - interval '3 days',
               'c-1','as-1','ad-1', now(), now())`,
      [IDS.org, IDS.client, IDS.adAccount, post],
    );
    await kart({
      id: uuid(1),
      disKimlik: 'a',
      gonderiTarihi: '2026-09-15T10:00:00Z',
      durum: 'launched',
    });

    const [k] = (await svc.listQueue(CTX, IDS.client)).items;
    expect(k!.reBoostBlockedReason).toContain('hâlâ yayında');
  });

  it('KRİTİK: SÜRESİ DOLMUŞ boost engel DEĞİL', async () => {
    /*
     * Gecelik tarama süresi dolan boost'u `completed` yapıyor ve o durum
     * kısmi indeksin dışında. Bitmiş bir boost'u engel saymak, bir gönderiyi
     * bir kez boostlandıktan sonra ÖMÜR BOYU kilitlemek olurdu — bu depoda
     * bir kez tam olarak o yaşandı.
     */
    const post = 'dddddddd-2222-2222-2222-dddddddddddd';
    await h.q(
      `INSERT INTO organic_posts (id, org_id, client_id, social_profile_id, external_id,
         media_type, published_at, updated_at)
       VALUES ($1,$2,$3,$4,'a','image', now() - interval '30 days', now())`,
      [post, IDS.org, IDS.client, PROFIL],
    );
    await h.q(
      `INSERT INTO boosts (id, org_id, client_id, ad_account_id, organic_post_id, status,
         budget_mode, daily_budget_micros, duration_days, objective, reason,
         created_on_platform_at, external_campaign_id, external_ad_set_id,
         external_ad_id, approved_at, updated_at)
       VALUES (gen_random_uuid(),$1,$2,$3,$4,'completed','daily',250000000,7,
               'OUTCOME_ENGAGEMENT','test', now() - interval '30 days',
               'c-2','as-2','ad-2', now(), now())`,
      [IDS.org, IDS.client, IDS.adAccount, post],
    );
    await kart({
      id: uuid(1),
      disKimlik: 'a',
      gonderiTarihi: '2026-09-15T10:00:00Z',
      durum: 'launched',
    });

    const [k] = (await svc.listQueue(CTX, IDS.client)).items;
    expect(k!.reBoostBlockedReason).toBeNull();
  });

  it('KRİTİK: YAYINA ALINMAKTA OLAN kart tekrar boostlanamıyor', async () => {
    // Platform çağrısı sürüyor; kartı geri açmak, oluşmuş bir kampanyayı
    // kayıtsız bırakırdı.
    await kart({
      id: uuid(1),
      disKimlik: 'a',
      gonderiTarihi: '2026-09-15T10:00:00Z',
      durum: 'launching',
    });
    const [k] = (await svc.listQueue(CTX, IDS.client)).items;
    expect(k!.reBoostBlockedReason).toContain('işleniyor');
  });

  it('YAYIN TARİHİ kartta taşınıyor — gönderi tarihinden AYRI', async () => {
    await kart({
      id: uuid(1),
      disKimlik: 'a',
      gonderiTarihi: '2026-09-15T10:00:00Z',
      durum: 'launched',
    });
    const [k] = (await svc.listQueue(CTX, IDS.client)).items;
    expect(k!.publishedAt).toContain('2026-09-15');
    expect(k!.launchedAt).not.toBeNull();
    expect(k!.launchedAt).not.toBe(k!.publishedAt);
  });
});

/** Okunur sabit kimlikler — testin kendisi hangi kartı konuştuğunu göstersin. */
function uuid(n: number): string {
  return `eeeeeeee-0000-0000-0000-${String(n).padStart(12, '0')}`;
}

describe('TEKRAR BOOSTLA — durum geri alınıyor', () => {
  async function durum(id: string): Promise<string> {
    const [r] = await h.q<{ status: string }>(
      `SELECT status FROM auto_boost_queue_items WHERE id = $1`,
      [id],
    );
    return r!.status;
  }

  it('KRİTİK: yayınlanmış kart karara GERİ AÇILIYOR', async () => {
    await kart({
      id: uuid(1),
      disKimlik: 'a',
      gonderiTarihi: '2026-09-15T10:00:00Z',
      durum: 'launched',
    });

    await yayin.tekrarBoostla(CTX, uuid(1));
    expect(await durum(uuid(1))).toBe('pending');
  });

  it('KRİTİK: REDDEDİLMİŞ kart da geri açılıyor', async () => {
    // Reddetmek kalıcı bir karar olmamalı: kullanıcı fikrini değiştirdiğinde
    // elinde hiçbir düğme kalmıyordu.
    await kart({
      id: uuid(2),
      disKimlik: 'b',
      gonderiTarihi: '2026-09-15T10:00:00Z',
      durum: 'rejected',
    });
    await yayin.tekrarBoostla(CTX, uuid(2));
    expect(await durum(uuid(2))).toBe('pending');
  });

  it('KRİTİK: ÖNCEKİ YAYININ İZİ SİLİNMİYOR', async () => {
    /*
     * `external_campaign_id` ve `launched_at` yerinde kalıyor. Silmek,
     * "daha önce boostlanmıştı" bilgisini bu ekrandan sessizce kaldırırdı;
     * kart yeniden onaylanırsa yayın yolu zaten üzerine yazıyor.
     */
    await kart({
      id: uuid(3),
      disKimlik: 'c',
      gonderiTarihi: '2026-09-15T10:00:00Z',
      durum: 'launched',
      kampanyaKimligi: 'camp-eski',
    });
    await yayin.tekrarBoostla(CTX, uuid(3));

    const [r] = await h.q<{ external_campaign_id: string | null; launched_at: Date | null }>(
      `SELECT external_campaign_id, launched_at FROM auto_boost_queue_items WHERE id = $1`,
      [uuid(3)],
    );
    expect(r!.external_campaign_id).toBe('camp-eski');
    expect(r!.launched_at).not.toBeNull();
  });

  it('KRİTİK: YAYINA ALINMAKTA OLAN kart REDDEDİLİYOR', async () => {
    /*
     * Platform çağrısı sürüyor; kartı geri açmak, oluşmuş bir kampanyayı
     * kayıtsız bırakır ve ikinci bir onay İKİNCİ bir reklam açardı.
     */
    await kart({
      id: uuid(4),
      disKimlik: 'd',
      gonderiTarihi: '2026-09-15T10:00:00Z',
      durum: 'launching',
    });
    await expect(yayin.tekrarBoostla(CTX, uuid(4))).rejects.toThrow(/işleniyor/);
    expect(await durum(uuid(4))).toBe('launching');
  });

  it('KRİTİK: ZATEN ONAY BEKLEYEN kart reddediliyor', async () => {
    await kart({ id: uuid(5), disKimlik: 'e', gonderiTarihi: '2026-09-15T10:00:00Z' });
    await expect(yayin.tekrarBoostla(CTX, uuid(5))).rejects.toThrow(/zaten onay bekliyor/);
  });

  it('KRİTİK: ÖNCEKİ BOOST YAYINDAYSA REDDEDİLİYOR — sebebiyle', async () => {
    /*
     * `boosts_active_post_uniq` ikinci bir aktif boost'a izin vermiyor.
     * Kartı karara açıp onayda veritabanı hatası vermek, kullanıcıya sebebi
     * yazmayan bir ret göstermek olurdu.
     */
    const post = 'dddddddd-3333-3333-3333-dddddddddddd';
    await h.q(
      `INSERT INTO organic_posts (id, org_id, client_id, social_profile_id, external_id,
         media_type, published_at, updated_at)
       VALUES ($1,$2,$3,$4,'f','image', now() - interval '2 days', now())`,
      [post, IDS.org, IDS.client, PROFIL],
    );
    await h.q(
      `INSERT INTO boosts (id, org_id, client_id, ad_account_id, organic_post_id, status,
         budget_mode, daily_budget_micros, duration_days, objective, reason,
         created_on_platform_at, external_campaign_id, external_ad_set_id,
         external_ad_id, approved_at, updated_at)
       VALUES (gen_random_uuid(),$1,$2,$3,$4,'active','daily',250000000,7,
               'OUTCOME_ENGAGEMENT','test', now() - interval '2 days',
               'c-3','as-3','ad-3', now(), now())`,
      [IDS.org, IDS.client, IDS.adAccount, post],
    );
    await kart({
      id: uuid(6),
      disKimlik: 'f',
      gonderiTarihi: '2026-09-15T10:00:00Z',
      durum: 'launched',
    });

    await expect(yayin.tekrarBoostla(CTX, uuid(6))).rejects.toThrow(/hâlâ yayında/);
    expect(await durum(uuid(6))).toBe('launched');
  });
});
