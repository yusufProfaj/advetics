import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TenantContext } from '@advetics/shared';
import { BoostKontrolService } from './boost-kontrol.service';
import { AutoBoostLaunchService } from './autoboost-launch.service';

/**
 * ═══ YAYINDAKİ BOOST'UN KONTROLÜ ═══
 *
 * Kart yayına girdikten sonra panelde yapılacak hiçbir şey kalmıyordu: reklam
 * Meta'da harcamaya devam ediyor, kullanıcı onu durdurmak için Ads Manager'a
 * gidiyordu.
 *
 * Bu paket GERÇEK VERİTABANIYLA koşuyor (PGlite) çünkü sınanan şeylerin çoğu
 * durum geçişi ve kısıt: hangi durumdan hangisine geçilebiliyor, platform
 * çağrısı düştüğünde kayıt ne oluyor.
 */
let h: Harness;
let svc: BoostKontrolService;
let yayin: AutoBoostLaunchService;

const SAYFA = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
const POST = 'bbbbbbbb-1111-1111-1111-bbbbbbbbbbbb';
const BOOST = 'cccccccc-1111-1111-1111-cccccccccccc';
const KART = 'dddddddd-1111-1111-1111-dddddddddddd';

const applyAction = vi.fn();

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

  svc = new BoostKontrolService(
    prisma,
    { get: () => ({ platform: 'meta', applyAction }) } as never,
    { getAccessToken: async () => 'token' } as never,
  );
  yayin = new AutoBoostLaunchService(
    prisma,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    // YouTube çözümleyicisi ve API — bu testler Meta yolunu sınıyor.
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
  applyAction.mockReset();
  applyAction.mockResolvedValue({ ok: true });

  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type,
       external_id, name, sync_enabled, updated_at)
     VALUES ($1,$2,$3,$4,'instagram_business','ig-1','Sayfa',true,now())`,
    [SAYFA, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(
    `INSERT INTO organic_posts (id, org_id, client_id, social_profile_id, external_id,
       media_type, published_at, updated_at)
     VALUES ($1,$2,$3,$4,'m-1','image', now() - interval '2 days', now())`,
    [POST, IDS.org, IDS.client, SAYFA],
  );
});

/** Yayına alınmış bir kart + boost kaydı. */
async function yayindaKart(durum: string, butceKipi = 'daily'): Promise<void> {
  await h.q(
    `INSERT INTO boosts (id, org_id, client_id, ad_account_id, organic_post_id, status,
       budget_mode, daily_budget_micros, total_budget_micros, duration_days, objective, reason,
       created_on_platform_at, external_campaign_id, external_ad_set_id, external_ad_id,
       approved_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,7,'OUTCOME_ENGAGEMENT','test',
             now() - interval '1 day','camp-1','adset-1','ad-1', now(), now())`,
    [
      BOOST,
      IDS.org,
      IDS.client,
      IDS.adAccount,
      POST,
      durum,
      butceKipi,
      // `boosts_budget_chk` KİPE GÖRE TEK KOLON İSTİYOR: günlük bütçeli
      // satırda toplam NULL, toplam bütçeli satırda günlük NULL olmak zorunda.
      // İkisini birden doldurmak, tanınmayan bir kip kadar ciddi sayılıyor.
      butceKipi === 'daily' ? 250_000_000 : null,
      butceKipi === 'lifetime' ? 1_750_000_000 : null,
    ],
  );
  await h.q(
    `INSERT INTO auto_boost_queue_items (id, org_id, client_id, platform, social_profile_id,
       external_id, title, published_at, status, boost_id, external_campaign_id,
       launched_at, updated_at)
     VALUES ($1,$2,$3,'meta',$4,'m-1','Başlık', now() - interval '2 days','launched',$5,
             'camp-1', now(), now())`,
    [KART, IDS.org, IDS.client, SAYFA, BOOST],
  );
}

async function boostDurumu(): Promise<string> {
  const [r] = await h.q<{ status: string }>(`SELECT status FROM boosts WHERE id = $1`, [BOOST]);
  return r!.status;
}

describe('DURAKLAT', () => {
  it('düzenek gerçekten çalışıyor', async () => {
    await yayindaKart('active');
    await svc.duraklat(CTX, KART);
    expect(applyAction).toHaveBeenCalledTimes(1);
  });

  it('KRİTİK: KAMPANYA seviyesinde `pause` gönderiliyor', async () => {
    await yayindaKart('active');
    await svc.duraklat(CTX, KART);
    expect(applyAction.mock.calls[0]![1]).toEqual({
      type: 'pause',
      level: 'campaign',
      externalId: 'camp-1',
    });
  });

  it('KRİTİK: kayıt `paused` oluyor', async () => {
    await yayindaKart('active');
    await svc.duraklat(CTX, KART);
    expect(await boostDurumu()).toBe('paused');
  });

  it('KRİTİK: PLATFORM ÇAĞRISI DÜŞERSE KAYIT DEĞİŞMİYOR', async () => {
    /*
     * ═══ SIRA: ÖNCE PLATFORM, SONRA VERİTABANI ═══
     *
     * Ters sırada yazılsaydı, çağrı düştüğünde panel "duraklatıldı" yazarken
     * Meta harcamaya devam ederdi — bu üründeki en pahalı sessiz hata türü.
     */
    await yayindaKart('active');
    applyAction.mockRejectedValue(new Error('Meta reddetti'));

    await expect(svc.duraklat(CTX, KART)).rejects.toThrow(/Meta reddetti/);
    expect(await boostDurumu()).toBe('active');
  });

  it('KRİTİK: ZATEN DURAKLATILMIŞ boost yeniden duraklatılamıyor', async () => {
    await yayindaKart('paused');
    await expect(svc.duraklat(CTX, KART)).rejects.toThrow(/yayındaki/);
    // PLATFORMA HİÇ GİDİLMİYOR: sıfır maliyetli bir ret, boşa çağrıdan iyi.
    expect(applyAction).not.toHaveBeenCalled();
  });
});

describe('SÜRDÜR', () => {
  it('KRİTİK: `resume` gönderiliyor ve kayıt `active` oluyor', async () => {
    await yayindaKart('paused');
    await svc.surdur(CTX, KART);
    expect(applyAction.mock.calls[0]![1]).toMatchObject({ type: 'resume', level: 'campaign' });
    expect(await boostDurumu()).toBe('active');
  });

  it('KRİTİK: ÜST SEVİYE DURAKLATMA UYARISI mesajda', async () => {
    /*
     * Meta ACTIVE'i kabul ediyor ama hesap ya da kampanya üst seviyede
     * duraklatılmışsa reklam yine çıkmıyor (`effective_status` farklı
     * kalıyor). Söylememek, kullanıcıya yayına döndü sanan bir ekran
     * göstermek olurdu ve fark ancak harcama gelmeyince anlaşılırdı.
     */
    await yayindaKart('paused');
    const r = await svc.surdur(CTX, KART);
    expect(r.message).toContain('üst seviyede duraklatılmışsa');
  });

  it('YAYINDAKİ boost sürdürülemiyor', async () => {
    await yayindaKart('active');
    await expect(svc.surdur(CTX, KART)).rejects.toThrow(/duraklatılmış/);
  });
});

describe('İPTAL', () => {
  it('KRİTİK: kampanya DURDURULUYOR ve kayıt `completed` oluyor', async () => {
    /*
     * KAMPANYA SİLİNMİYOR. Meta'da silinen kampanyanın metrikleri de gidiyor:
     * harcanan para raporlardan kayboluyor ve geçmiş rapor kendiliğinden
     * değişiyor.
     */
    await yayindaKart('active');
    await svc.iptal(CTX, KART);
    expect(applyAction.mock.calls[0]![1]).toMatchObject({ type: 'pause' });
    expect(await boostDurumu()).toBe('completed');
  });

  it('KRİTİK: DURAKLATILMIŞ boost da iptal edilebiliyor', async () => {
    // Kullanıcı önce durduruyor, sonra karar veriyor; o akışın sonu burası.
    await yayindaKart('paused');
    await svc.iptal(CTX, KART);
    expect(await boostDurumu()).toBe('completed');
  });

  it('KRİTİK: İPTAL SONRASI GÖNDERİ YENİDEN BOOSTLANABİLİYOR', async () => {
    /*
     * `boosts_active_post_uniq` kısmi tekil indeksi 'completed' durumunu
     * kapsamıyor. Kapsasaydı iptal edilen bir gönderi ÖMÜR BOYU kilitli
     * kalırdı — bu depoda bir kez tam olarak o yaşandı.
     */
    await yayindaKart('active');
    await svc.iptal(CTX, KART);

    const [r] = await h.q<{ n: number }>(
      `SELECT count(*)::int AS n FROM boosts
       WHERE organic_post_id = $1
         AND status IN ('candidate','approved','creating','active','paused')`,
      [POST],
    );
    expect(r!.n).toBe(0);
  });
});

describe('BÜTÇE', () => {
  it('KRİTİK: bütçe AD SET seviyesine yazılıyor', async () => {
    /*
     * Meta boost'unda bütçe kampanyada değil ad set'te duruyor; kampanyaya
     * yazmak Meta tarafında sessizce yok sayılıyor.
     */
    await yayindaKart('active');
    await svc.butceGuncelle(CTX, KART, 300_000_000n);
    expect(applyAction.mock.calls[0]![1]).toMatchObject({
      type: 'set_budget',
      level: 'ad_group',
      externalId: 'adset-1',
      budgetMode: 'daily',
    });
  });

  it('KRİTİK: BÜTÇE KİPİ KAYITTAN OKUNUYOR, VARSAYILMIYOR', async () => {
    // Günlük bütçeli bir ad set'e `lifetime_budget` yazmak Meta'da
    // reddediliyor ve mesaj hangi alanın yanlış olduğunu söylemiyor.
    await yayindaKart('active', 'lifetime');
    await svc.butceGuncelle(CTX, KART, 300_000_000n);
    expect(applyAction.mock.calls[0]![1]).toMatchObject({ budgetMode: 'lifetime' });
  });

  it('KRİTİK: KENDİ KAYDIMIZ DA GÜNCELLENİYOR', async () => {
    // Yalnızca platformda değiştirmek, panelde eski tutarı göstermek demek
    // olurdu ve toplam taahhüt bu kolondan okunuyor.
    await yayindaKart('active');
    await svc.butceGuncelle(CTX, KART, 300_000_000n);
    const [r] = await h.q<{ daily_budget_micros: string }>(
      `SELECT daily_budget_micros::text FROM boosts WHERE id = $1`,
      [BOOST],
    );
    expect(r!.daily_budget_micros).toBe('300000000');
  });
});

describe('KARTI KAPAT', () => {
  it('KRİTİK: yayınlanmış kart `rejected` oluyor', async () => {
    await yayindaKart('completed');
    await yayin.kapat(CTX, KART);
    const [r] = await h.q<{ status: string }>(
      `SELECT status FROM auto_boost_queue_items WHERE id = $1`,
      [KART],
    );
    expect(r!.status).toBe('rejected');
  });

  it('KRİTİK: YAYINDAKİ KAMPANYAYA DOKUNMUYOR', async () => {
    /*
     * Kapatmak yalnızca kartın durumu. Yayındaki reklamı durdurmak İPTAL'in
     * işi; birleştirmek, listeden kaldırmak isteyen kullanıcının farkında
     * olmadan yayındaki reklamı durdurması olurdu.
     */
    await yayindaKart('active');
    await yayin.kapat(CTX, KART);
    expect(applyAction).not.toHaveBeenCalled();
    expect(await boostDurumu()).toBe('active');
  });
});
