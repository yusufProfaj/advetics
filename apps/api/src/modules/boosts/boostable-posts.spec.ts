import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { BoostExecutorService } from './boost-executor.service';
import { BoostsService } from './boosts.service';

/**
 * Elle boost — gönderi seçim listesi.
 *
 * NEDEN BU TESTLER: bu listenin işi "hangi gönderiyi öne çıkarayım" sorusuna
 * cevap vermek ve YANLIŞ CEVABIN İKİ BİÇİMİ VAR, ikisi de sessiz:
 *
 *   · Öne çıkarılamayan bir gönderiyi çıkarılabilir göstermek → kullanıcı
 *     formu doldurur, yayına basar ve ham bir hatayla karşılaşır.
 *   · Öne çıkarılamayan bir gönderiyi LİSTEDEN GİZLEMEK → kullanıcı aradığı
 *     gönderiyi bulamaz ve senkronizasyonun bozuk olduğunu sanır.
 *
 * İkincisi daha sinsi olduğu için karar şu: hiçbir gönderi gizlenmiyor,
 * engelli olanlar SEBEBİYLE dönüyor.
 */

let h: Harness;
let svc: BoostsService;
/** `withTenant`e geçirilen bağlamlar — kapsam kararını doğrulamak için. */
let seenContexts: TenantContext[] = [];

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const FB = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
const IG = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb';
const FB_UNLINKED = 'cccccccc-3333-3333-3333-cccccccccccc';

async function seedProfile(
  id: string,
  type: 'facebook_page' | 'instagram_business',
  linked = true,
  /**
   * Instagram satırının ana Facebook sayfası. NULL = "Hesapları yenile"
   * çalıştırılmamış; o durumda gönderi listede ENGELLİ görünüyor.
   */
  anaSayfa: string | null = '345736801957026',
): Promise<void> {
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type,
       external_id, name, linked_ad_account_id, parent_page_external_id,
       sync_enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, now())`,
    [
      id,
      IDS.org,
      IDS.client,
      IDS.connection,
      type,
      `ext-${id.slice(0, 8)}`,
      `Profil ${id.slice(0, 4)}`,
      linked ? IDS.adAccount : null,
      // CHECK kısıtı: ana sayfa yalnızca Instagram satırlarında dolu olabilir.
      type === 'instagram_business' ? anaSayfa : null,
    ],
  );
}

async function seedPost(
  id: string,
  profileId: string,
  publishedAt: string,
  boostedAt: string | null = null,
): Promise<void> {
  await h.q(
    `INSERT INTO organic_posts (id, org_id, client_id, social_profile_id, external_id,
       media_type, message, published_at, impressions, reach, likes, comments, shares,
       saves, video_views, engagements, boosted_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'photo', 'test', $6::timestamptz, 20000, 12000,
             400, 100, 50, 50, 0, 600, $7::timestamptz, now())`,
    // DIŞ KİMLİK SON HANEDEN: `organic_posts` (social_profile_id, external_id)
    // ikilisinde tekil ve test kimliklerinin ilk sekiz hanesi ortak.
    [id, IDS.org, IDS.client, profileId, `post-${id.slice(-4)}`, publishedAt, boostedAt],
  );
}

function postId(n: number): string {
  return `dddddddd-0000-0000-0000-00000000000${n}`;
}

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
  svc = new BoostsService(
    {
      withTenant: async <T>(c: TenantContext, fn: (tx: unknown) => Promise<T>) => {
        // BAĞLAM YAKALANIYOR: PGlite koşumunda RLS zorlanmıyor, dolayısıyla
        // "satır geldi mi" testi kapsamı SINAMIYOR — düzeltme kaldırılsa bile
        // geçerdi. Sınanan şey kararın kendisi: hangi bağlam kuruldu.
        seenContexts.push(c);
        return fn(h.db);
      },
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
  seenContexts = [];
});

describe('listeleme ve sıra', () => {
  it('gönderiler TARİHE göre, yeniden eskiye', async () => {
    // Kural motoru en çok etkileşim alanı seçiyor çünkü kararı o veriyor.
    // Burada kararı kullanıcı veriyor ve aradığı gönderi neredeyse her zaman
    // "az önce paylaştığım" oluyor — kuralın asla seçemeyeceği yeni gönderi.
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z');
    await seedPost(postId(2), FB, '2026-08-14T12:00:00Z');
    await seedPost(postId(3), FB, '2026-08-12T12:00:00Z');

    const out = await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 });
    expect(out.items.map((p) => p.id)).toEqual([postId(2), postId(3), postId(1)]);
  });

  it('KRİTİK: kesilen liste TOPLAMI söylüyor', async () => {
    // Sessiz kesme yok. İki satır gören kullanıcı bunun tamamı mı yoksa
    // kesilmiş bir liste mi olduğunu bilmek zorunda.
    await seedProfile(FB, 'facebook_page');
    for (let i = 1; i <= 5; i++) {
      await seedPost(postId(i), FB, `2026-08-1${i}T12:00:00Z`);
    }

    const out = await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 2 });
    expect(out.items).toHaveLength(2);
    expect(out.total).toBe(5);
    expect(out.limit).toBe(2);
  });

  it('boş listede toplam sıfır', async () => {
    const out = await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 });
    expect(out.items).toEqual([]);
    expect(out.total).toBe(0);
    expect(out.limit).toBe(30);
    // Boşluğun SEBEBİ de dönüyor; ayrı bir describe onu sınıyor.
    expect(out.emptyReason).not.toBeNull();
  });

  it('sayfa süzgeci uygulanıyor', async () => {
    await seedProfile(FB, 'facebook_page');
    await seedProfile(IG, 'instagram_business');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z');
    await seedPost(postId(2), IG, '2026-08-11T12:00:00Z');

    const out = await svc.listBoostablePosts(CTX, {
      clientId: IDS.client,
      socialProfileId: FB,
      limit: 30,
    });
    expect(out.items).toHaveLength(1);
    expect(out.total).toBe(1);
  });

  it('etkileşim oranı hesaplanıyor, erişim sıfırsa null', async () => {
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z');
    await h.q(`UPDATE organic_posts SET reach = 0 WHERE id = $1`, [postId(1)]);
    await seedPost(postId(2), FB, '2026-08-11T12:00:00Z');

    const out = await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 });
    const [yeni, eski] = out.items;
    // 600 / 12.000 = %5
    expect(yeni!.engagementRate).toBeCloseTo(5);
    // Sıfır erişimde oran SIFIR DEĞİL, hesaplanamaz.
    expect(eski!.engagementRate).toBeNull();
  });
});

describe('engeller — gizlenmiyor, sebebiyle dönüyor', () => {
  it('öne çıkarılabilir gönderide engel de uyarı da YOK', async () => {
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z');

    const [p] = (await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 })).items;
    expect(p!.blockedReason).toBeNull();
    expect(p!.warning).toBeNull();
    expect(p!.adAccountId).toBe(IDS.adAccount);
  });

  it('KRİTİK: Instagram gönderisi ARTIK SEÇİLEBİLİR', async () => {
    // K17 kapandı ve Instagram dalı yazıldı. Bu test bir zamanlar tersini
    // sınıyordu; engel Instagram'a değil, ana sayfası bilinmeyen Instagram'a.
    await seedProfile(IG, 'instagram_business');
    await seedPost(postId(1), IG, '2026-08-10T12:00:00Z');

    const out = await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.profileType).toBe('instagram_business');
    expect(out.items[0]!.blockedReason).toBeNull();
  });

  it('KRİTİK: ANA SAYFASI OLMAYAN Instagram gönderisi engelli', async () => {
    // Meta'da her reklam bir Facebook sayfasına bağlı; Instagram satırındaki
    // external_id sayfa kimliği değil. Sayfa kimliği yoksa reklam ya reddedilir
    // ya da YANLIŞ kimlikle oluşur.
    await seedProfile(IG, 'instagram_business', true, null);
    await seedPost(postId(1), IG, '2026-08-10T12:00:00Z');

    const out = await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 });
    expect(out.items[0]!.blockedReason).toMatch(/Hesapları yenile/i);
  });

  it('bağlı reklam hesabı olmayan sayfa engelli ve NE YAPILACAĞINI söylüyor', async () => {
    await seedProfile(FB_UNLINKED, 'facebook_page', false);
    await seedPost(postId(1), FB_UNLINKED, '2026-08-10T12:00:00Z');

    const [p] = (await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 })).items;
    expect(p!.blockedReason).toMatch(/reklam hesabı yok/i);
    // Mesaj DOĞRU EKRANI söylüyor: seçici Müşteriler ekranında, Platform
    // Bağlantıları'nda değil. Yanlış ekrana yönlendiren bir teşhis, teşhis
    // olmaktan çıkıyor.
    expect(p!.blockedReason).toMatch(/Müşteriler ekranı/i);
    expect(p!.blockedReason).toMatch(/Boost hesabı/i);
    expect(p!.adAccountId).toBeNull();
  });

  it('KRİTİK: canlı boost’u olan gönderi engelli', async () => {
    // Kısmi tekil indeks ikinci canlı boost'u zaten reddediyor; ekranın bunu
    // YAYINDAN ÖNCE bilmesi gerekiyor, yoksa kullanıcı formu doldurup ham bir
    // kısıt ihlaliyle karşılaşır.
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z');
    await h.q(
      `INSERT INTO boosts (id, org_id, client_id, organic_post_id, ad_account_id,
         status, daily_budget_micros, duration_days, objective, reason, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'candidate', 100000000, 3,
               'OUTCOME_ENGAGEMENT', 'canlı', now())`,
      [IDS.org, IDS.client, postId(1), IDS.adAccount],
    );

    const [p] = (await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 })).items;
    expect(p!.blockedReason).toMatch(/zaten yayında ya da onay bekleyen/i);
  });

  it('REDDEDİLMİŞ boost engel SAYILMIYOR', async () => {
    // Kısmi tekil indeks yalnızca canlı durumları çakıştırıyor; reddedilmiş
    // bir boost sonrası gönderi yeniden öne çıkarılabilmeli.
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z');
    await h.q(
      `INSERT INTO boosts (id, org_id, client_id, organic_post_id, ad_account_id,
         status, daily_budget_micros, duration_days, objective, reason, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'rejected', 100000000, 3,
               'OUTCOME_ENGAGEMENT', 'reddedildi', now())`,
      [IDS.org, IDS.client, postId(1), IDS.adAccount],
    );

    const [p] = (await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 })).items;
    expect(p!.blockedReason).toBeNull();
  });

  it('ENGEL SIRASI: ana sayfa eksikliği, bağlı hesap eksikliğinden önce', async () => {
    // Kullanıcı TEK bir sebep görüyor ve o sebep en temeli olmalı. İkisi de
    // eksikse "reklam hesabı ata" demek, çözülse bile işe yaramayacak bir işe
    // göndermek olurdu — ana sayfa olmadan boost hiç kurulamıyor.
    await seedProfile(IG, 'instagram_business', false, null);
    await seedPost(postId(1), IG, '2026-08-10T12:00:00Z');

    const [p] = (await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 })).items;
    expect(p!.blockedReason).toMatch(/Hesapları yenile/i);
    expect(p!.blockedReason).not.toMatch(/reklam hesabı yok/i);
  });
});

describe('uyarı — engel değil (K20)', () => {
  it('KRİTİK: daha önce öne çıkarılmış gönderi UYARI alıyor, ENGEL DEĞİL', async () => {
    // Gönderiyi seçen kullanıcının kendisi; kararı geri çevirmek değil,
    // bilgilendirmek doğru. Kural yolunda aynı gönderi ikinci kez seçilmiyor
    // ve o kısıt yerinde duruyor.
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z', '2026-08-12T12:00:00Z');

    const [p] = (await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 })).items;
    expect(p!.blockedReason).toBeNull();
    expect(p!.warning).toMatch(/daha önce/i);
    expect(p!.boostedAt).not.toBeNull();
  });

  it('canlı boost varken UYARI değil ENGEL yazıyor', async () => {
    // İkisi birden gösterilseydi kullanıcı hangisinin bağlayıcı olduğunu
    // bilemezdi.
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z', '2026-08-12T12:00:00Z');
    await h.q(
      // ONAYLI BOOST `approved_at` TAŞIMAK ZORUNDA — `boosts_approval_chk`.
      `INSERT INTO boosts (id, org_id, client_id, organic_post_id, ad_account_id,
         status, daily_budget_micros, duration_days, objective, reason,
         approved_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'approved', 100000000, 3,
               'OUTCOME_ENGAGEMENT', 'onaylı', now(), now())`,
      [IDS.org, IDS.client, postId(1), IDS.adAccount],
    );

    const [p] = (await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 })).items;
    expect(p!.blockedReason).not.toBeNull();
    expect(p!.warning).toBeNull();
  });
});

/**
 * BOŞ LİSTENİN SEBEBİ — üç durum, üç farklı yapılacak iş.
 *
 * ÜRETİMDE YAŞANDI: 199 sosyal profilin hepsi müşteriye atanmamıştı, ekran
 * boş bir liste gösterdi ve kullanıcı senkronizasyonun bozuk olduğunu
 * düşündü. Boş liste tek başına bir cevap değil.
 */
describe('boş listenin sebebi', () => {
  it('KRİTİK: hiç sayfa atanmamışsa ATAMA söyleniyor', async () => {
    const out = await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 });
    expect(out.items).toHaveLength(0);
    expect(out.emptyReason).toMatch(/atanmış bir sayfa yok/i);
    expect(out.emptyReason).toMatch(/Müşteriler ekranı/i);
  });

  it('KRİTİK: sayfa atanmış ama izleme kapalıysa İZLEME söyleniyor', async () => {
    // Bu iki durum bugüne kadar birebir aynı görünüyordu: boş liste.
    await seedProfile(FB, 'facebook_page');
    await h.q(`UPDATE social_profiles SET sync_enabled = false WHERE id = $1`, [FB]);

    const out = await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 });
    expect(out.emptyReason).toMatch(/izleme/i);
    expect(out.emptyReason).toMatch(/1 sayfası/);
  });

  it('izleme açık ama gönderi yoksa SENKRONİZASYON söyleniyor', async () => {
    await seedProfile(FB, 'facebook_page');
    const out = await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 });
    expect(out.emptyReason).toMatch(/henüz gönderi çekilmemiş/i);
    // SIKLIK DOĞRU: organik süpürme saatte bir koşuyor. "Günde iki kez" boost
    // kuralının sıklığı ve o cümle kullanıcıyı boşuna yarım gün bekletirdi.
    expect(out.emptyReason).toMatch(/saatte bir/i);
    expect(out.emptyReason).not.toMatch(/günde iki kez/i);
  });

  it('KRİTİK: son senkronizasyon DÜŞTÜYSE sebebi platformun kendi metniyle yazılıyor', async () => {
    /*
     * Canlıda yaşandı: izleme açıktı, iş kuyruğa girdi, Meta reddetti ve ekran
     * hâlâ "henüz çekilmemiş, bekle" diyordu. Beklemek hiçbir şeyi
     * değiştirmeyecekti — hata KALICIYDI (eksik izin). Platformun mesajı
     * yapılacak işi doğrudan söylüyor, o yüzden olduğu gibi gösteriliyor.
     */
    await seedProfile(FB, 'facebook_page');
    await h.q(
      `INSERT INTO sync_jobs (client_id, job_type, status, error_code, error_message, created_at)
       VALUES ($1, 'organic_posts', 'failed', 'permission_denied',
               '(#10) This endpoint requires the pages_read_engagement permission', now())`,
      [IDS.client],
    );

    const out = await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 });
    expect(out.emptyReason).toMatch(/pages_read_engagement/);
    // "Bekle" DEMİYOR: beklemek bu hatayı çözmüyor.
    expect(out.emptyReason).not.toMatch(/saatte bir/i);
  });

  it('BAŞARILI son senkronizasyonda hata metni gösterilmiyor', async () => {
    // Eski bir hata sonsuza kadar ekranda kalmamalı; sorgu yalnızca `failed`
    // satırlara bakıyor ve başarılı tur sonrası liste zaten dolu oluyor.
    await seedProfile(FB, 'facebook_page');
    await h.q(
      `INSERT INTO sync_jobs (client_id, job_type, status, created_at)
       VALUES ($1, 'organic_posts', 'succeeded', now())`,
      [IDS.client],
    );

    const out = await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 });
    expect(out.emptyReason).toMatch(/saatte bir/i);
  });

  it('liste doluyken sebep YAZILMIYOR', async () => {
    // Dolu listede sebep hesaplamak, her açılışta bir sorguyu boşuna
    // koşturmak olurdu.
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z');
    const out = await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 });
    expect(out.emptyReason).toBeNull();
  });
});

/**
 * KAPSAM — oturumdaki seçim değil, İSTEĞİN kendisi.
 *
 * `app.can_access_client()` panelde seçili müşteriye daraltıyor. Akıllı Boost
 * sayfası müşteriyi adres çubuğundaki `?musteri=` ile alıyor ve sekmeyle
 * değiştiriliyor; ikisi rahatlıkla farklı olabiliyor. Kapsam oturumdan
 * kurulsaydı ekran, yetkisi olan bir kullanıcıya SESSİZCE boş liste
 * gösterirdi — ne hata, ne uyarı.
 *
 * Aynı hata `GET /connections` için bir kez yaşandı (§0.2).
 */
describe('kapsam istekten kuruluyor', () => {
  const BASKA = '99999999-9999-9999-9999-999999999999';

  it('KRİTİK: bağlam İSTENEN müşteriye kuruluyor, oturumdakine değil', async () => {
    // PGlite'ta RLS zorlanmadığı için "satır geldi mi" diye bakmak bu kararı
    // SINAMIYOR. Sınanan şey doğrudan kararın kendisi.
    const baskaSecili = { ...CTX, activeClientId: BASKA } as TenantContext;
    await svc.listBoostablePosts(baskaSecili, { clientId: IDS.client, limit: 30 });

    expect(seenContexts).not.toHaveLength(0);
    for (const c of seenContexts) expect(c.activeClientId).toBe(IDS.client);
  });

  it('harcama özeti de aynı kapsamda', async () => {
    const baskaSecili = { ...CTX, activeClientId: BASKA } as TenantContext;
    await svc.spendSummary(baskaSecili, IDS.client);
    for (const c of seenContexts) expect(c.activeClientId).toBe(IDS.client);
  });

  it('boost listesi de aynı kapsamda', async () => {
    const baskaSecili = { ...CTX, activeClientId: BASKA } as TenantContext;
    await svc.listBoosts(baskaSecili, { clientId: IDS.client });
    for (const c of seenContexts) expect(c.activeClientId).toBe(IDS.client);
  });
});

/**
 * TEK TIKLA YAYIN — düğmenin TIKLANMADAN ÖNCE durumunu bilmesi.
 *
 * "Doğrulama kullanım anında değil, giriş anında": bu alan olmasaydı düğme
 * her satırda etkin görünür, kullanıcı tıklar ve "ön ayar yok" hatasını ancak
 * o zaman görürdü.
 */
describe('ön ayar hazır mı (presetReady)', () => {
  /** Bilgi Bankası ön ayarı. `profil` NULL ise müşteri varsayılanı. */
  async function seedPreset(
    id: string,
    profil: string | null,
    enabled = true,
  ): Promise<void> {
    await h.q(
      `INSERT INTO auto_boost_presets
         (id, org_id, client_id, platform, social_profile_id, enabled,
          budget_mode, daily_budget_micros, duration_days, settings, updated_at)
       VALUES ($1, $2, $3, 'meta', $4, $5, 'daily', 100000000, 3,
               '{"platform":"meta","goal":"engagement","locations":[],"ageMin":18,"ageMax":65,"genders":"all","savedAudienceId":null}'::jsonb,
               now())`,
      [id, IDS.org, IDS.client, profil, enabled],
    );
  }

  const P1 = 'eeeeeeee-0000-0000-0000-000000000001';
  const P2 = 'eeeeeeee-0000-0000-0000-000000000002';

  it('ön ayar YOKSA hazır değil', async () => {
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z');

    const [p] = (await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 })).items;
    expect(p!.presetReady).toBe(false);
  });

  it('müşteri varsayılanı VARSA hazır', async () => {
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z');
    await seedPreset(P1, null);

    const [p] = (await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 })).items;
    expect(p!.presetReady).toBe(true);
  });

  it('KRİTİK: KAPALI ön ayar hazır SAYILMIYOR', async () => {
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z');
    await seedPreset(P1, null, false);

    const [p] = (await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 })).items;
    expect(p!.presetReady).toBe(false);
  });

  it('KRİTİK: SAYFAYA ÖZEL kapalı ön ayar, müşteri varsayılanını EZİYOR', async () => {
    /*
     * Yayın yolu (`gonderiyiYayinla`) ön ayarı `ORDER BY social_profile_id
     * NULLS LAST LIMIT 1` ile seçiyor ve `enabled`'ı SÜZMÜYOR — yani sayfaya
     * özel kapalı bir ön ayar varsa yayın "kapalı" diyerek duruyor. Liste
     * `enabled`'ı LATERAL içinde süzseydi müşteri varsayılanına düşer,
     * "hazır" derdi ve düğme tıklanınca hata verirdi.
     */
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z');
    await seedPreset(P1, null, true); // müşteri varsayılanı AÇIK
    await seedPreset(P2, FB, false); // sayfaya özel KAPALI

    const [p] = (await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 })).items;
    expect(p!.presetReady).toBe(false);
  });

  it('KRİTİK: iki ön ayar varken satır ÇOĞALMIYOR ve toplam yalan söylemiyor', async () => {
    /*
     * LATERAL içindeki LIMIT 1 düşerse aynı gönderi iki satır olarak döner:
     * liste iki kez görünür ve `COUNT(*) OVER ()` toplamı da iki yazar.
     * Hiçbir mevcut test bunu yakalamıyordu.
     */
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z');
    await seedPreset(P1, null);
    await seedPreset(P2, FB);

    const liste = await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 });
    expect(liste.items).toHaveLength(1);
    expect(liste.total).toBe(1);
  });
});
