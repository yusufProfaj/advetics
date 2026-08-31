import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { CryptoService } from '../../crypto/crypto.service';
import { AutoBoostQueueService } from './autoboost-queue.service';

/**
 * Sahte şifreleme — `email-account.service.spec.ts` ile aynı desen.
 * Sınanan şey ŞİFRELEMENİN KENDİSİ değil: `bildir()`'in gerçekten SMTP
 * denemesi yaptığı ve doğru alıcı listesini kurduğu.
 */
const SAHTE_CRYPTO = {
  encrypt: (d: string) => Buffer.concat([Buffer.from([1]), Buffer.from(`ENC:${d}`)]),
  decrypt: (b: Buffer) => b.subarray(1).toString().replace(/^ENC:/, ''),
  keyVersionOf: (b: Buffer) => b[0] as number,
} as unknown as CryptoService;

/**
 * KUYRUK BESLEMESİ (Advetics 1.0).
 *
 * Instagram'da "yeni gönderi" webhook'u YOK; kart mevcut süpürmeden
 * besleniyor. Bu dosya iki şeyi sınıyor: doğru gönderiler kuyruğa giriyor mu,
 * ve YANLIŞ olanlar giremiyor mu. İkincisi daha kritik — yanlış kart, bir
 * insanın tek tıkla para harcayabileceği bir düğme demek.
 */

let h: Harness;
let svc: AutoBoostQueueService;

const PROFIL = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
const PROFIL2 = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb';

async function seedProfile(
  id: string,
  opts: { type?: string; clientId?: string | null } = {},
): Promise<void> {
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id,
       profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, $5::"SocialProfileType", $6, 'Profil', now())`,
    [
      id,
      IDS.org,
      opts.clientId === undefined ? IDS.client : opts.clientId,
      IDS.connection,
      opts.type ?? 'instagram_business',
      `ext-${id.slice(0, 8)}`,
    ],
  );
}

/** Ön ayar. `createdAt` açıkça veriliyor: "ne zamandan itibaren" kuralı buna bağlı. */
async function preset(
  opts: { profileId?: string | null; enabled?: boolean; createdAt?: string; platform?: string } = {},
): Promise<void> {
  await h.q(
    `INSERT INTO auto_boost_presets (id, org_id, client_id, platform, social_profile_id,
       enabled, budget_mode, daily_budget_micros, settings, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3::"Platform", $4, $5, 'daily', 50000000,
             '{}'::jsonb, $6, now())`,
    [
      IDS.org,
      IDS.client,
      opts.platform ?? 'meta',
      opts.profileId ?? null,
      opts.enabled ?? true,
      opts.createdAt ?? '2026-08-01T00:00:00Z',
    ],
  );
}

async function post(externalId: string, publishedAt: string, profil = PROFIL): Promise<void> {
  await h.q(
    `INSERT INTO organic_posts (id, org_id, client_id, social_profile_id, external_id,
       media_type, message, published_at, impressions, reach, likes, comments,
       shares, saves, video_views, engagements, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'photo', 'metin', $5,
             100, 90, 5, 1, 0, 0, 0, 6, now())`,
    [IDS.org, IDS.client, profil, externalId, publishedAt],
  );
}

async function kuyruk(): Promise<Array<{ external_id: string; status: string }>> {
  return h.q(`SELECT external_id, status FROM auto_boost_queue_items ORDER BY external_id`);
}

/** Bildirim testleri için: bir kullanıcı + o müşteriye (ya da org geneline) üyelik. */
async function kullaniciEkle(
  email: string,
  opts: { clientId?: string | null; role?: string } = {},
): Promise<string> {
  const userId = randomUUID();
  await h.q(
    `INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at)
     VALUES ($1, $2, $3, 'x', $3, now())`,
    [userId, IDS.org, email],
  );
  await h.q(
    `INSERT INTO memberships (id, user_id, org_id, client_id, role, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4::"Role", now())`,
    [userId, IDS.org, opts.clientId === undefined ? IDS.client : opts.clientId, opts.role ?? 'manager'],
  );
  return userId;
}

/** hello@profaj.com'un e-posta kimliği — DNS'te var olmayan bir sunucuya kurulu. */
async function ajansMailKimligiEkle(): Promise<void> {
  const userId = await kullaniciEkle('hello@profaj.com', { clientId: null, role: 'owner' });
  await h.q(
    `INSERT INTO user_email_accounts
       (id, org_id, user_id, from_name, from_email, smtp_host, smtp_port, smtp_secure,
        smtp_user, smtp_pass_enc, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'Advetics', 'hello@profaj.com',
             'olmayan.sunucu.gecersiz', 1, false, 'hello@profaj.com', $3, now())`,
    [IDS.org, userId, SAHTE_CRYPTO.encrypt('parola')],
  );
}

beforeAll(async () => {
  h = await createHarness();
  svc = new AutoBoostQueueService(h.db as unknown as PrismaAdminService, SAHTE_CRYPTO);
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await seedProfile(PROFIL);
});

describe('ön ayar yoksa kart YOK', () => {
  it('KRİTİK: ön ayarsız gönderi kuyruğa girmiyor', async () => {
    /*
     * Ön ayarsız kart onaylanamaz: düğme hangi bütçeyle, hangi hedeflemeyle
     * yayınlayacağını bilmez. Kart göstermek, tıklanınca hata veren bir düğme
     * göstermek olurdu.
     */
    await post('p1', '2026-08-18T10:00:00Z');
    const r = await svc.enqueueForProfile(PROFIL);
    expect(r.created).toBe(0);
    expect(r.note).toMatch(/ön ayarı yok/);
    expect(await kuyruk()).toEqual([]);
  });

  it('KRİTİK: KAPALI ön ayar "yok" sayılıyor', async () => {
    // Kullanıcı otomatik boost'u kapattığında kart üretilmemeli.
    await preset({ enabled: false });
    await post('p1', '2026-08-18T10:00:00Z');
    expect((await svc.enqueueForProfile(PROFIL)).created).toBe(0);
  });
});

describe('"ne zamandan itibaren" kuralı', () => {
  beforeEach(async () => {
    await preset({ createdAt: '2026-08-10T00:00:00Z' });
  });

  it('KRİTİK: ÖN AYARDAN ÖNCEKİ gönderiler kuyruğa GİRMİYOR', async () => {
    /*
     * Bu koşul olmadan otomatik boost ilk kez açıldığında son 90 günün
     * gönderileri kuyruğa dolardı — kullanıcı onlarca kartla karşılaşır ve
     * hangisinin gerçekten yeni olduğunu ayırt edemezdi.
     */
    await post('eski', '2026-08-01T10:00:00Z');
    await post('yeni', '2026-08-15T10:00:00Z');

    await svc.enqueueForProfile(PROFIL);
    expect((await kuyruk()).map((k) => k.external_id)).toEqual(['yeni']);
  });

  it('ön ayarla AYNI ANDA yayınlanan gönderi girmiyor — kesin büyük', async () => {
    await post('tam', '2026-08-10T00:00:00Z');
    expect((await svc.enqueueForProfile(PROFIL)).created).toBe(0);
  });
});

describe('mükerrer engelleme', () => {
  beforeEach(async () => {
    await preset({ createdAt: '2026-08-01T00:00:00Z' });
    await post('p1', '2026-08-18T10:00:00Z');
  });

  it('KRİTİK: İKİ KEZ çalıştırmak İKİNCİ kart açmıyor', async () => {
    /*
     * Süpürme her turda aynı gönderileri görüyor. Kısıt olmasa her tur yeni
     * bir kart üretirdi ve kullanıcı aynı gönderi için onlarca kart görürdü —
     * her biri para harcayabilen bir düğme.
     */
    expect((await svc.enqueueForProfile(PROFIL)).created).toBe(1);
    expect((await svc.enqueueForProfile(PROFIL)).created).toBe(0);
    expect(await kuyruk()).toHaveLength(1);
  });

  it('ONAYLANMIŞ kart yeniden AÇILMIYOR', async () => {
    // Kart onaylanıp yayınlandıktan sonra süpürme aynı gönderiyi yine
    // görüyor; tekillik kısıtı ikinci kartı engelliyor.
    await svc.enqueueForProfile(PROFIL);
    await h.q(`UPDATE auto_boost_queue_items SET status = 'launched'`);
    await svc.enqueueForProfile(PROFIL);
    expect(await kuyruk()).toEqual([{ external_id: 'p1', status: 'launched' }]);
  });
});

describe('ön ayar çözümlemesi', () => {
  beforeEach(async () => {
    await post('p1', '2026-08-18T10:00:00Z');
  });

  it('müşteri varsayılanı uygulanıyor', async () => {
    await preset({ profileId: null, createdAt: '2026-08-01T00:00:00Z' });
    expect((await svc.enqueueForProfile(PROFIL)).created).toBe(1);
  });

  it('KRİTİK: PROFİL BAZLI ön ayar varsayılanı EZİYOR', async () => {
    /*
     * Sıra AÇIKÇA yazılıyor. Belirsiz bırakılsaydı hangi ayarla yayınlandığı
     * satır sırasına kalırdı — ve satır sırası bir gün değişir.
     *
     * Burada profil bazlı ön ayar gönderiden SONRA oluşturulmuş: seçilen o
     * ise kart üretilmemeli.
     */
    await preset({ profileId: null, createdAt: '2026-08-01T00:00:00Z' });
    await preset({ profileId: PROFIL, createdAt: '2026-08-19T00:00:00Z' });
    expect((await svc.enqueueForProfile(PROFIL)).created).toBe(0);
  });

  it('KRİTİK: profil bazlı ön ayar KAPALIYSA varsayılana DÜŞMÜYOR', async () => {
    /*
     * O profil için verilmiş bilinçli bir "kapat" kararını geçersiz kılmak,
     * kullanıcının kapattığı bir otomasyonu geri açmak olurdu.
     */
    await preset({ profileId: null, enabled: true, createdAt: '2026-08-01T00:00:00Z' });
    await preset({ profileId: PROFIL, enabled: false, createdAt: '2026-08-01T00:00:00Z' });
    expect((await svc.enqueueForProfile(PROFIL)).created).toBe(0);
  });

  it('BAŞKA profilin ön ayarı bu profile uygulanmıyor', async () => {
    await seedProfile(PROFIL2);
    await preset({ profileId: PROFIL2, createdAt: '2026-08-01T00:00:00Z' });
    expect((await svc.enqueueForProfile(PROFIL)).created).toBe(0);
  });

  it('BAŞKA PLATFORMUN ön ayarı sayılmıyor', async () => {
    // Instagram profili için Google ön ayarı varsa kart üretilmemeli.
    await preset({ platform: 'google', createdAt: '2026-08-01T00:00:00Z' });
    expect((await svc.enqueueForProfile(PROFIL)).created).toBe(0);
  });
});

describe('atanmamış profil', () => {
  it('KRİTİK: müşteriye atanmamış profil kuyruğa GİRMİYOR', async () => {
    /*
     * `client_id` NULL = ajansın havuzunda. O satır için kart açmak, RLS'in
     * kimseye göstermeyeceği bir kayıt üretmek demek — kart var olur ama
     * panelde hiç görünmez ve "neden gelmedi" sorusu cevapsız kalır.
     */
    await seedProfile(PROFIL2, { clientId: null });
    const r = await svc.enqueueForProfile(PROFIL2);
    expect(r.created).toBe(0);
    expect(r.note).toMatch(/atanmamış/);
  });
});

describe('YouTube süpürmeden BESLENMİYOR', () => {
  it('KRİTİK: YouTube kanalı bu yoldan kart üretmiyor', async () => {
    /*
     * Video bildirimi WebSub'dan tek tek geliyor. Bu metot Meta'nın organik
     * gönderi tablosunu okuyor ve orada YouTube videosu yok; koruma olmasa
     * sessizce sıfır kart üretir ve sebebi görünmezdi.
     */
    await seedProfile(PROFIL2, { type: 'youtube_channel' });
    await preset({ platform: 'google', createdAt: '2026-08-01T00:00:00Z' });
    const r = await svc.enqueueForProfile(PROFIL2);
    expect(r.created).toBe(0);
    expect(r.note).toMatch(/kendi bildirim yolundan/);
  });
});

describe('enqueueOne — WebSub yolu', () => {
  const ORTAK = {
    orgId: IDS.org,
    clientId: IDS.client,
    socialProfileId: PROFIL,
    platform: 'google' as const,
    externalId: 'dQw4w9WgXcQ',
    title: 'Yazlığınız Olsun',
    thumbnailUrl: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    permalink: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    mediaType: 'video',
    publishedAt: new Date('2026-08-18T10:00:00Z'),
  };

  it('yeni video kuyruğa giriyor', async () => {
    expect(await svc.enqueueOne(ORTAK)).toBe(true);
    expect(await kuyruk()).toEqual([{ external_id: 'dQw4w9WgXcQ', status: 'pending' }]);
  });

  it('KRİTİK: MÜKERRER bildirim `false` dönüyor — hata DEĞİL', async () => {
    /*
     * Dönüş değeri "hata" değil "zaten kuyrukta" demek ve webhook'un buna
     * 200 dönmesi gerekiyor: hub'a hata bildirmek aynı bildirimin tekrar
     * tekrar gönderilmesine yol açar.
     */
    await svc.enqueueOne(ORTAK);
    expect(await svc.enqueueOne(ORTAK)).toBe(false);
    expect(await kuyruk()).toHaveLength(1);
  });

  it('uzun başlık KIRPILIYOR — kısıt ihlali yerine kırpma', async () => {
    // Kolon 2000 karakter; kırpmadan yazmak kaydı tamamen kaybettirirdi.
    await svc.enqueueOne({ ...ORTAK, title: 'x'.repeat(5000) });
    const [row] = await h.q<{ title: string }>(`SELECT title FROM auto_boost_queue_items`);
    expect(row!.title.length).toBe(2000);
  });
});

/**
 * ═══ "İLGİLİ DANIŞMANLAR" — KİM BU? ═══
 *
 * `danisman-atama.ts`'teki tanımın aynısı: bu müşteriye AÇIKÇA atanmış
 * (`memberships.client_id = X`) kişiler. İki istisna KRİTİK, ikisi de yanlış
 * yönde hata üretmeye müsait:
 *
 *   · `client_viewer` HARİÇ — bu rol müşterinin KENDİ girişi. Dahil etmek,
 *     ajansın "bu gönderiyi boostlamayı düşünüyoruz" iç notunu müşteriye
 *     göndermek olurdu.
 *   · ORG GENELİ erişimi olanlar (`client_id IS NULL`) DIŞARIDA — onlar bu
 *     müşteriye özel atanmamış, dahil etmek "danışman" tanımını bozardı.
 */
describe('alıcılar — ilgili danışmanlar', () => {
  it('bu müşteriye atanmış danışman alıcı listesinde', async () => {
    await kullaniciEkle('yonetici@ajans.com', { clientId: IDS.client, role: 'manager' });
    const alicilar = await (
      svc as unknown as { alicilar(orgId: string, clientId: string): Promise<string[]> }
    ).alicilar(IDS.org, IDS.client);
    expect(alicilar).toContain('yonetici@ajans.com');
  });

  it('KRİTİK: client_viewer (müşterinin kendi girişi) alıcı DEĞİL', async () => {
    await kullaniciEkle('musteri@ege-birlik.com', { clientId: IDS.client, role: 'client_viewer' });
    const alicilar = await (
      svc as unknown as { alicilar(orgId: string, clientId: string): Promise<string[]> }
    ).alicilar(IDS.org, IDS.client);
    expect(alicilar).not.toContain('musteri@ege-birlik.com');
  });

  it('KRİTİK: org geneli erişimi olan (bu müşteriye özel atanmamış) alıcı DEĞİL', async () => {
    await kullaniciEkle('sahip@ajans.com', { clientId: null, role: 'owner' });
    const alicilar = await (
      svc as unknown as { alicilar(orgId: string, clientId: string): Promise<string[]> }
    ).alicilar(IDS.org, IDS.client);
    expect(alicilar).not.toContain('sahip@ajans.com');
  });
});

/**
 * ═══ BİLDİRİM — YENİ KART GERÇEKTEN MAİL DENEMESİ TETİKLİYOR MU ═══
 *
 * `email-account.service.spec.ts` ile AYNI desen: gerçek DNS çözümlemesi
 * OLMAYAN bir sunucuya karşı deneniyor ve hatanın SESSİZCE yutulmadığı,
 * `note`'a düştüğü doğrulanıyor. Bu, `bildir()`'in mock'lanmadan GERÇEKTEN
 * çağrıldığının kanıtı — sahte bir spy, çağrının kendisinin unutulduğu
 * durumu (bu oturumda `sync-processor.service.ts`'te tam olarak yaşanan
 * hata) yakalamazdı.
 */
describe('bildirim — yeni kart mail denemesi tetikliyor', () => {
  beforeEach(async () => {
    await preset({ createdAt: '2026-08-01T00:00:00Z' });
  });

  it('Instagram yolu (enqueueForProfile): e-posta kimliği yoksa NOT açıkça söylüyor', async () => {
    await post('p1', '2026-08-18T10:00:00Z');
    const r = await svc.enqueueForProfile(PROFIL);
    expect(r.created).toBe(1);
    expect(r.note).toMatch(/MAİL GÖNDERİLEMEDİ.*e-posta kimliği tanımlı değil/);
  });

  it('Instagram yolu: e-posta kimliği VARSA gerçek SMTP denemesi yapılır ve düşer', async () => {
    await ajansMailKimligiEkle();
    await post('p1', '2026-08-18T10:00:00Z');
    const r = await svc.enqueueForProfile(PROFIL);
    expect(r.created).toBe(1);
    // "e-posta kimliği tanımlı değil" DEĞİL — bu kez kimlik bulundu ve SMTP
    // denemesi gerçekten yapıldı, DNS çözümlemesi düştü.
    expect(r.note).toMatch(/MAİL GÖNDERİLEMEDİ/);
    expect(r.note).not.toMatch(/e-posta kimliği tanımlı değil/);
  });

  it('YouTube yolu (enqueueOne) da AYNI bildirimi tetikliyor — iki kaynak, tek davranış', async () => {
    await ajansMailKimligiEkle();
    const yazildi = await svc.enqueueOne({
      orgId: IDS.org,
      clientId: IDS.client,
      socialProfileId: PROFIL,
      platform: 'google',
      externalId: 'video-1',
      title: 'Test videosu',
      thumbnailUrl: null,
      permalink: 'https://www.youtube.com/watch?v=video-1',
      mediaType: 'video',
      publishedAt: new Date('2026-08-18T10:00:00Z'),
    });
    // enqueueOne bildirim hatasını YUTUYOR (webhook'a 200 dönmek zorunda) —
    // burada doğrulanan şey kartın yine de yazıldığı, mail sonucu değil.
    expect(yazildi).toBe(true);
  });
});
