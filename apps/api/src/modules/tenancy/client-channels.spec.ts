import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { ClientChannelsService } from './client-channels.service';

/**
 * BAĞLI KANALLAR — beş kanal, iki tablo.
 *
 * Sınanan şey EŞLEME ve GÖRÜNÜRLÜK: kullanıcı "Meta Ads / Google Ads /
 * Facebook / Instagram / YouTube" diye düşünüyor, veritabanı `ad_accounts`
 * (platforma göre) ve `social_profiles` (profil tipine göre) diye tutuyor.
 * Yanlış eşleme sessiz: hesap bir kanalda görünüp diğerinde kaybolur.
 *
 * En kritik iddia şu: BAŞKA MÜŞTERİYE ATANMIŞ hesap bu ekranda HİÇ
 * görünmemeli — ne bağlı listede ne seçilebilir listede.
 */
let h: Harness;
let svc: ClientChannelsService;

const OTEKI = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client, OTEKI],
  activeClientId: IDS.client,
  isOrgAdmin: true,
} as TenantContext;

beforeAll(async () => {
  h = await createHarness();
  const prisma = {
    withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;
  svc = new ClientChannelsService(prisma);
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $2, 'Öteki Müşteri', 'oteki', now())`,
    [OTEKI, IDS.org],
  );
  /*
   * SEED'İN KENDİ HESABI TEMİZLENİYOR. `seedTenant` bir reklam hesabı
   * yazıyor ve müşteriye atanmış durumda; bu paketin bütün iddiaları SAYIYA
   * dayandığı için ("bir tane görünüyor", "hiç görünmüyor") o satır her
   * beklentiyi bir kaydırırdı.
   */
  await h.q('DELETE FROM ad_accounts');
  await h.q('DELETE FROM social_profiles');
});

/** Havuzda (client_id NULL) ya da bir müşteriye atanmış reklam hesabı. */
async function hesap(
  id: string,
  platform: 'meta' | 'google',
  clientId: string | null,
  over: { managerIsSelf?: boolean; sync?: boolean } = {},
): Promise<void> {
  const ext = `act_${id.slice(0, 6)}`;
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name,
        currency, timezone, status, manager_external_id, sync_enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5::"Platform", $6, $7, 'TRY', 'Europe/Istanbul', 'active', $8, $9, now())`,
    [
      id,
      IDS.org,
      clientId,
      IDS.connection,
      platform,
      ext,
      `Hesap ${id.slice(0, 4)}`,
      over.managerIsSelf ? ext : null,
      over.sync ?? false,
    ],
  );
}

async function profil(
  id: string,
  tip: 'facebook_page' | 'instagram_business' | 'youtube_channel',
  clientId: string | null,
): Promise<void> {
  await h.q(
    `INSERT INTO social_profiles
       (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, $5::"SocialProfileType", $6, $7, now())`,
    [id, IDS.org, clientId, IDS.connection, tip, `ext-${id.slice(0, 6)}`, `Profil ${id.slice(0, 4)}`],
  );
}

const uuid = (n: number): string => `${String(n).repeat(8)}-0000-0000-0000-000000000000`.slice(0, 36);

const grup = async (kind: string) => {
  const r = await svc.list(CTX, IDS.client);
  return r.groups.find((g) => g.kind === kind)!;
};

describe('kanal eşlemesi', () => {
  it('KRİTİK: Meta ve Google hesapları KENDİ kanallarında — kimlikle', async () => {
    await hesap(uuid(1), 'meta', IDS.client);
    await hesap(uuid(2), 'google', IDS.client);

    expect((await grup('meta_ads')).connected.map((i) => i.id)).toEqual([uuid(1)]);
    expect((await grup('google_ads')).connected.map((i) => i.id)).toEqual([uuid(2)]);
  });

  it('KRİTİK: üç profil tipi ÜÇ AYRI kanala düşüyor — KİMLİKLE', async () => {
    /*
     * SAYI DEĞİL KİMLİK KONTROL EDİLİYOR ve bunun sebebi ölçüldü: ilk
     * sürümde her kanalın "1 öğe" taşıdığı sınanıyordu ve mutasyon testi
     * boş çıktı — `instagram` eşlemesini `facebook_page`'e çevirdim, üç
     * kanal da yine "1 öğe" gösterdi ve test GEÇTİ. Yanlış veriyi doğru
     * sayıda göstermek, tam olarak yakalanması gereken hata.
     */
    await profil(uuid(3), 'facebook_page', IDS.client);
    await profil(uuid(4), 'instagram_business', IDS.client);
    await profil(uuid(5), 'youtube_channel', IDS.client);

    expect((await grup('facebook')).connected.map((i) => i.id)).toEqual([uuid(3)]);
    expect((await grup('instagram')).connected.map((i) => i.id)).toEqual([uuid(4)]);
    expect((await grup('youtube')).connected.map((i) => i.id)).toEqual([uuid(5)]);
  });
});

describe('GÖRÜNÜRLÜK — asıl güvenlik iddiası', () => {
  it('KRİTİK: BAŞKA müşteriye atanmış hesap HİÇ görünmüyor', async () => {
    // Bu müşterinin kendi hesabı da var: "hiçbir şey dönmüyor" ile "yalnızca
    // yabancı olan elenmiş" ayrımı ancak ikisi birlikte sınanınca kuruluyor.
    await hesap(uuid(6), 'meta', OTEKI);
    await hesap(uuid(1), 'meta', IDS.client);

    const g = await grup('meta_ads');
    expect(g.connected.map((i) => i.id)).toEqual([uuid(1)]);
    expect(g.available).toHaveLength(0);
    expect([...g.connected, ...g.available].map((i) => i.id)).not.toContain(uuid(6));
  });

  it('havuzdaki hesap SEÇİLEBİLİR listede', async () => {
    await hesap(uuid(7), 'meta', null);
    const g = await grup('meta_ads');
    expect(g.available).toHaveLength(1);
    expect(g.connected).toHaveLength(0);
  });

  it('bu müşteriye atanmış hesap BAĞLI listede', async () => {
    await hesap(uuid(8), 'meta', IDS.client);
    const g = await grup('meta_ads');
    expect(g.connected).toHaveLength(1);
    expect(g.available).toHaveLength(0);
  });
});

describe('ayrıntılar', () => {
  it('KRİTİK: yönetici (MCC) hesabı işaretleniyor — gizlenmiyor', async () => {
    // Gizlemek, aradığı hesabı bulamayan kullanıcıya senkronizasyonun bozuk
    // olduğunu düşündürürdü.
    await hesap(uuid(9), 'google', null, { managerIsSelf: true });
    const g = await grup('google_ads');
    expect(g.available).toHaveLength(1);
    expect(g.available[0]!.isManager).toBe(true);
  });

  it('izleme durumu dönüyor — kapalıysa veri gelmiyor demek', async () => {
    await hesap(uuid(1), 'meta', IDS.client, { sync: true });
    expect((await grup('meta_ads')).connected[0]!.syncEnabled).toBe(true);
  });

  it('KRİTİK: hiç kanal yoksa SEBEBİ dönüyor', async () => {
    // "Havuz boş" ile "ajans henüz bağlanmadı" farklı iki iş, ikisi de boş
    // liste olarak görünüyor.
    const r = await svc.list(CTX, IDS.client);
    expect(r.emptyReason).not.toBeNull();
    expect(r.emptyReason).toContain('Platform');
  });

  it('kanal varken emptyReason BOŞ', async () => {
    await hesap(uuid(1), 'meta', null);
    expect((await svc.list(CTX, IDS.client)).emptyReason).toBeNull();
  });
});
