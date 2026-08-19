import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { AuditService } from '../audit/audit.service';
import { ConnectionsService } from './connections.service';

/**
 * REKLAM HESABI ATAMA — planın 6. adımı.
 *
 * Ajansın tek Meta kimliği 157 hesaba erişiyor; hangisinin hangi müşteriye ait
 * olduğu bu yolla belirleniyor. Test edilen dört karar da sessiz hata
 * üretebilecek yerlerde:
 *
 *   1. Bağlam `activeClientId: null` ile kuruluyor mu — kurulmazsa Postgres
 *      atamayı reddediyor (yeni satır SELECT politikasının dışına çıkıyor) ve
 *      hata "satır politikayı ihlal ediyor" olarak çıkıyor.
 *   2. Atama kalkınca izleme kapanıyor mu — kapanmazsa hesap "izleniyor"
 *      görünür ama süpürme işi onu eler ve hiç veri gelmez.
 *   3. Değişiklik yokken denetim kaydı yazılmıyor mu.
 *   4. Yönetici (MCC) hesabı atanamıyor mu.
 */
let h: Harness;
let svc: ConnectionsService;
/** `withTenant`e geçirilen bağlam — 1. maddeyi doğrulamak için yakalanıyor. */
let seenContexts: TenantContext[] = [];

const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const POOL_ACCOUNT = '99999999-9999-9999-9999-999999999999';
const MCC_ACCOUNT = '98989898-9898-9898-9898-989898989898';
const POOL_PROFILE = '97979797-9797-9797-9797-979797979797';

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client, CLIENT_B],
  activeClientId: IDS.client,
  isOrgAdmin: true,
} as TenantContext;

const META = { ip: null, userAgent: null, requestId: 'test' };

/** Atama sonrası kuyruğa giden işler. */
let kuyruk: Array<Record<string, unknown>> = [];

beforeAll(async () => {
  h = await createHarness();

  const prisma = {
    withTenant: async <T>(ctx: TenantContext, fn: (tx: unknown) => Promise<T>) => {
      seenContexts.push(ctx);
      return fn(h.db);
    },
  } as unknown as PrismaService;

  // AuditService yalnızca verilen `tx`e yazıyor; yönetim bağlantısına
  // dokunmuyor (o yalnızca `recordUnauthenticated` yolunda kullanılıyor).
  const audit = new AuditService(null as unknown as PrismaAdminService);

  svc = new ConnectionsService(
    prisma,
    null as never,
    null as never,
    audit,
    null as never,
    null as never,
    // KUYRUK KAYDEDİCİ — atama artık geçmiş veriyi kuyruğa alıyor ve
    // sınanacak şey tam olarak o. Fırlatan bir yerine koyma, `catch` içinde
    // yutulur ve testler "kuyruğa girdi" iddiasını hiç doğrulamazdı.
    { enqueue: (payload: Record<string, unknown>) => {
        kuyruk.push(payload);
        return Promise.resolve({ enqueued: true });
      } } as never,
  );
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  seenContexts = [];
  kuyruk = [];
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $2, 'İkinci Müşteri', 'ikinci', now())`,
    [CLIENT_B, IDS.org],
  );
  // Havuzda bekleyen hesap: keşiften geldi, henüz kimseye atanmadı.
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, sync_enabled, updated_at)
     VALUES ($1, $2, NULL, $3, 'meta', 'act_pool', 'Havuz hesabı', 'TRY',
             'Europe/Istanbul', false, now())`,
    [POOL_ACCOUNT, IDS.org, IDS.connection],
  );
});

async function accountRow(id: string) {
  const rows = await h.q<{ client_id: string | null; sync_enabled: boolean }>(
    'SELECT client_id, sync_enabled FROM ad_accounts WHERE id = $1',
    [id],
  );
  return rows[0]!;
}

async function auditActions(): Promise<string[]> {
  const rows = await h.q<{ action: string }>('SELECT action FROM audit_logs ORDER BY id');
  return rows.map((r) => r.action);
}

describe('atama', () => {
  it('havuzdaki hesap müşteriye atanıyor', async () => {
    const res = await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);

    expect(res.changed).toBe(true);
    expect(res.clientId).toBe(IDS.client);
    expect((await accountRow(POOL_ACCOUNT)).client_id).toBe(IDS.client);
    expect(await auditActions()).toEqual(['ad_account.assigned']);
  });

  it('KRİTİK: bağlam AKTİF MÜŞTERİ SEÇİMİ KAPALI kuruluyor', async () => {
    /*
     * Postgres'te UPDATE sonrası yeni satır, tablonun SELECT politikasından da
     * geçmek zorunda. `can_access_client()` seçili müşteriye daraltıyor; A
     * seçiliyken hesabı B'ye atamak satırı görüş alanının dışına çıkarıyor ve
     * UPDATE reddediliyor.
     *
     * Bu test o gerekliliği KODDA kilitliyor: `assignAdAccount` bağlamı
     * `activeClientId: null` ile kurmazsa burada düşer. (Politikanın kendisi
     * `ad-account-pool-rls.spec.ts` içinde sınanıyor — orada RLS gerçekten
     * açık.)
     */
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, CLIENT_B, META);

    expect(seenContexts.length).toBeGreaterThan(0);
    for (const ctx of seenContexts) {
      expect(ctx.activeClientId).toBeNull();
    }
    // Çağıranın bağlamı DEĞİŞMİYOR — yalnızca bu işlem için daraltma kapalı.
    expect(CTX.activeClientId).toBe(IDS.client);
  });

  it('KRİTİK: atama kalkınca İZLEME DE kapanıyor', async () => {
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    await svc.setAccountSync(CTX, POOL_ACCOUNT, true, META);
    expect((await accountRow(POOL_ACCOUNT)).sync_enabled).toBe(true);

    const res = await svc.assignAdAccount(CTX, POOL_ACCOUNT, null, META);

    expect(res.clientId).toBeNull();
    const row = await accountRow(POOL_ACCOUNT);
    expect(row.client_id).toBeNull();
    // Açık kalsaydı: hesap ekranda "izleniyor" görünür, süpürme işi onu eler,
    // hiç veri gelmez ve hiçbir hata çıkmaz.
    expect(row.sync_enabled).toBe(false);
  });

  it('DEĞİŞİKLİK YOKSA denetim kaydı yazılmıyor', async () => {
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    const res = await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);

    expect(res.changed).toBe(false);
    // Denetim kaydı "ne değişti" sorusunu cevaplıyor; değişmeyen bir işlemi
    // yazmak, gerçek değişikliklerin arasına gürültü koymak olurdu.
    expect(await auditActions()).toEqual(['ad_account.assigned']);
  });

  it('YÖNETİCİ (MCC) hesabı atanamıyor', async () => {
    // Yönetici hesabı reklam yayınlamıyor; atamak boş bir senkronizasyon turu
    // ve boşa kota demek.
    await h.q(
      `INSERT INTO ad_accounts
         (id, org_id, client_id, connection_id, platform, external_id, name, currency,
          timezone, manager_external_id, sync_enabled, updated_at)
       VALUES ($1, $2, NULL, $3, 'google', 'mcc-1', 'MCC', 'TRY', 'Europe/Istanbul',
               'mcc-1', false, now())`,
      [MCC_ACCOUNT, IDS.org, IDS.connection],
    );

    await expect(svc.assignAdAccount(CTX, MCC_ACCOUNT, IDS.client, META)).rejects.toThrow(
      /yönetici/i,
    );
  });

  it('ERİŞİLEMEYEN müşteriye atanamıyor', async () => {
    const foreign = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
    await expect(svc.assignAdAccount(CTX, POOL_ACCOUNT, foreign, META)).rejects.toThrow(
      /Müşteri bulunamadı/,
    );
  });

  it('ATANMAMIŞ hesap izlemeye alınamıyor', async () => {
    // Doğrulama KULLANIM anında değil GİRİŞ anında: kullanıcı hesabın
    // senkronize edilmeyeceğini, veri gelmediğini fark ettiğinde değil,
    // düğmeye bastığında öğrenmeli.
    await expect(svc.setAccountSync(CTX, POOL_ACCOUNT, true, META)).rejects.toThrow(
      /atanmamış/i,
    );
  });
});

// -----------------------------------------------------------------------------
// Sosyal profiller — aynı havuz modeli
// -----------------------------------------------------------------------------

describe('reklam hesabı izlemesi — kapsam', () => {
  it('BAŞKA müşteri seçiliyken de izleme açılabiliyor', async () => {
    // Sayfanınkiyle aynı gerekçe ve aynı ekran.
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);

    seenContexts = [];
    const baskaSecili: TenantContext = { ...CTX, activeClientId: CLIENT_B } as TenantContext;
    await svc.setAccountSync(baskaSecili, POOL_ACCOUNT, true, META);

    for (const ctx of seenContexts) expect(ctx.activeClientId).toBeNull();
  });
});

describe('sayfa ataması', () => {
  beforeEach(async () => {
    await h.q(
      `INSERT INTO social_profiles
         (id, org_id, client_id, connection_id, profile_type, external_id, name,
          sync_enabled, updated_at)
       VALUES ($1, $2, NULL, $3, 'facebook_page', 'page-havuz', 'Havuz sayfası',
               false, now())`,
      [POOL_PROFILE, IDS.org, IDS.connection],
    );
  });

  async function profileRow(id: string) {
    const rows = await h.q<{ client_id: string | null; sync_enabled: boolean }>(
      'SELECT client_id, sync_enabled FROM social_profiles WHERE id = $1',
      [id],
    );
    return rows[0]!;
  }

  it('havuzdaki sayfa müşteriye atanıyor', async () => {
    const res = await svc.assignSocialProfile(CTX, POOL_PROFILE, IDS.client, META);

    expect(res.changed).toBe(true);
    expect((await profileRow(POOL_PROFILE)).client_id).toBe(IDS.client);
    expect(await auditActions()).toEqual(['social_profile.assigned']);
  });

  it('bağlam AKTİF MÜŞTERİ SEÇİMİ KAPALI kuruluyor', async () => {
    // Reklam hesabındakiyle aynı Postgres kuralı: UPDATE sonrası yeni satır
    // SELECT politikasından da geçmek zorunda.
    seenContexts = [];
    await svc.assignSocialProfile(CTX, POOL_PROFILE, CLIENT_B, META);
    for (const ctx of seenContexts) expect(ctx.activeClientId).toBeNull();
  });

  /**
   * SAYFANIN GÖNDERİ İZLEMESİ — bu anahtar SONRADAN eklendi.
   *
   * Ajans geneli havuz modeline geçilirken reklam hesaplarına yazılan izleme
   * anahtarı sayfalara yazılmamıştı ve sonucu üretimde ölçüldü: 199 sosyal
   * profilin hepsi `sync_enabled = false` ve o alanı değiştirebilecek tek bir
   * uç nokta yoktu. Kullanıcı sayfayı atıyor, hata almıyor, gönderi gelmiyor
   * ve sebebi hiçbir ekranda yazmıyordu. Auto-Boost'un girdisi bu yüzden
   * boştu.
   */
  it('KRİTİK: atanmış sayfanın gönderi izlemesi AÇILABİLİYOR', async () => {
    await svc.assignSocialProfile(CTX, POOL_PROFILE, IDS.client, META);
    await svc.setProfileSync(CTX, POOL_PROFILE, true, META);
    expect((await profileRow(POOL_PROFILE)).sync_enabled).toBe(true);
  });

  it('izleme kapatılabiliyor', async () => {
    await svc.assignSocialProfile(CTX, POOL_PROFILE, IDS.client, META);
    await svc.setProfileSync(CTX, POOL_PROFILE, true, META);
    await svc.setProfileSync(CTX, POOL_PROFILE, false, META);
    expect((await profileRow(POOL_PROFILE)).sync_enabled).toBe(false);
  });

  it('KRİTİK: ATANMAMIŞ sayfa izlemeye alınamıyor', async () => {
    // İzin verilseydi süpürme işi sayfayı client_id süzgecinde eler, kullanıcı
    // ekranda "izlemede" görür ve hiçbir gönderi gelmezdi — reklam
    // hesaplarındakiyle birebir aynı gerekçe.
    await expect(svc.setProfileSync(CTX, POOL_PROFILE, true, META)).rejects.toThrow(
      /henüz bir müşteriye atanmamış/i,
    );
    expect((await profileRow(POOL_PROFILE)).sync_enabled).toBe(false);
  });

  it('KRİTİK: BAŞKA müşteri seçiliyken de izleme açılabiliyor', async () => {
    /*
     * Müşteriler ekranı BÜTÜN müşterilerin kartlarını yan yana gösteriyor.
     * `app.can_access_client()` ise oturumdaki seçili müşteriye daraltıyor:
     * yönetici A seçiliyken B'nin sayfasını izlemeye almaya çalıştığında RLS
     * satırı gizliyor ve hata "Sayfa bulunamadı" oluyordu — sayfa oradaydı,
     * eksik olan yetki değil KAPSAMDI. Atama ucu bunu baştan beri
     * `activeClientId: null` ile çözüyordu; izleme anahtarı yazılırken
     * atlanmıştı ve üretimde tam olarak bu yaşandı.
     */
    await svc.assignSocialProfile(CTX, POOL_PROFILE, IDS.client, META);

    seenContexts = [];
    const baskaSecili: TenantContext = { ...CTX, activeClientId: CLIENT_B } as TenantContext;
    await svc.setProfileSync(baskaSecili, POOL_PROFILE, true, META);

    for (const ctx of seenContexts) expect(ctx.activeClientId).toBeNull();
    expect((await profileRow(POOL_PROFILE)).sync_enabled).toBe(true);
  });

  it('izleme değişikliği DENETİM KAYDINA yazılıyor', async () => {
    // Gönderi çekmeyi açmak kota tüketen bir karar; kimin ne zaman açtığı
    // sorulabilmeli.
    await svc.assignSocialProfile(CTX, POOL_PROFILE, IDS.client, META);
    await svc.setProfileSync(CTX, POOL_PROFILE, true, META);
    expect(await auditActions()).toEqual([
      'social_profile.assigned',
      'social_profile.sync_enabled',
    ]);
  });

  /**
   * BOOST FATURALANDIRMA HESABI — bu uç nokta hiç yoktu.
   *
   * `linked_ad_account_id` sekiz yerde OKUNUYOR ama hiçbir yerde
   * yazılmıyordu; boost'un zorunlu ön koşulu ayarlanamıyor ve elle boost
   * ekranı her gönderide "bağlı reklam hesabı yok" diyordu. `sync_enabled`
   * ile aynı boşluk.
   */
  describe('boost faturalandırma hesabı', () => {
    async function linked(): Promise<string | null> {
      const rows = await h.q<{ linked_ad_account_id: string | null }>(
        'SELECT linked_ad_account_id::text AS linked_ad_account_id FROM social_profiles WHERE id = $1',
        [POOL_PROFILE],
      );
      return rows[0]!.linked_ad_account_id;
    }

    it('KRİTİK: hesap eşleştirilebiliyor', async () => {
      await svc.assignSocialProfile(CTX, POOL_PROFILE, IDS.client, META);
      await svc.setProfileAdAccount(CTX, POOL_PROFILE, IDS.adAccount, META);
      expect(await linked()).toBe(IDS.adAccount);
    });

    it('eşleşme kaldırılabiliyor', async () => {
      await svc.assignSocialProfile(CTX, POOL_PROFILE, IDS.client, META);
      await svc.setProfileAdAccount(CTX, POOL_PROFILE, IDS.adAccount, META);
      await svc.setProfileAdAccount(CTX, POOL_PROFILE, null, META);
      expect(await linked()).toBeNull();
    });

    it('KRİTİK: BAŞKA MÜŞTERİNİN hesabı eşleştirilemiyor', async () => {
      /*
       * Havuz modelinde hesap ve sayfa ayrı ayrı atanıyor, yani farklı
       * müşterilere ait olmaları mümkün. İzin vermek, bir müşterinin
       * gönderisini başka müşterinin hesabından faturalandırmak demek — ve
       * harcanan para geri gelmiyor.
       */
      await svc.assignSocialProfile(CTX, POOL_PROFILE, CLIENT_B, META);
      await expect(
        svc.setProfileAdAccount(CTX, POOL_PROFILE, IDS.adAccount, META),
      ).rejects.toThrow(/aynı müşteride/i);
      expect(await linked()).toBeNull();
    });

    it('KRİTİK: BAŞKA müşteri seçiliyken de eşleştirilebiliyor', async () => {
      // Müşteriler ekranı bütün müşterilerin kartlarını gösteriyor; oturumdaki
      // daraltma yüzünden "bulunamadı" ile düşmemeli.
      await svc.assignSocialProfile(CTX, POOL_PROFILE, IDS.client, META);
      seenContexts = [];
      const baskaSecili: TenantContext = { ...CTX, activeClientId: CLIENT_B } as TenantContext;
      await svc.setProfileAdAccount(baskaSecili, POOL_PROFILE, IDS.adAccount, META);

      for (const ctx of seenContexts) expect(ctx.activeClientId).toBeNull();
      expect(await linked()).toBe(IDS.adAccount);
    });

    it('eşleştirme DENETİM KAYDINA yazılıyor', async () => {
      // Faturalandırma hesabını değiştirmek para kararı; kimin ne zaman
      // değiştirdiği sorulabilmeli.
      await svc.assignSocialProfile(CTX, POOL_PROFILE, IDS.client, META);
      await svc.setProfileAdAccount(CTX, POOL_PROFILE, IDS.adAccount, META);
      expect(await auditActions()).toEqual([
        'social_profile.assigned',
        'social_profile.boost_account_linked',
      ]);
    });
  });

  it('atama kalkınca İZLEME DE kapanıyor', async () => {
    await svc.assignSocialProfile(CTX, POOL_PROFILE, IDS.client, META);
    await h.q('UPDATE social_profiles SET sync_enabled = true WHERE id = $1', [POOL_PROFILE]);

    await svc.assignSocialProfile(CTX, POOL_PROFILE, null, META);

    const row = await profileRow(POOL_PROFILE);
    expect(row.client_id).toBeNull();
    expect(row.sync_enabled).toBe(false);
  });

  it('KRİTİK: müşterisi değişen sayfanın FORMLARI eski müşteride kalıyor ve sayısı bildiriliyor', async () => {
    /*
     * Formlar ve toplanmış kayıtlar TAŞINMIYOR — bir markanın topladığı
     * potansiyel müşteriler başka bir markanın CRM'ine geçemez. Ama bu
     * SÖYLENMEZSE kullanıcı formlarını kaybettiğini sanar ve yanlış yerde
     * arar.
     */
    await svc.assignSocialProfile(CTX, POOL_PROFILE, IDS.client, META);
    await h.q(
      `INSERT INTO lead_forms
         (id, org_id, client_id, social_profile_id, name, form_type, prefill_questions,
          privacy_policy_url, root_id, created_by, updated_at)
       VALUES ($5, $1, $2, $3, 'Form', 'more_volume', '["EMAIL"]'::jsonb,
               'https://advetics.com/gizlilik', $5, $4, now())`,
      [IDS.org, IDS.client, POOL_PROFILE, IDS.user, '12121212-1212-1212-1212-121212121212'],
    );

    const res = await svc.assignSocialProfile(CTX, POOL_PROFILE, CLIENT_B, META);

    expect(res.clientId).toBe(CLIENT_B);
    expect(res.leftBehindForms).toBe(1);
    // Form GERÇEKTEN eski müşteride duruyor.
    const forms = await h.q<{ client_id: string }>('SELECT client_id FROM lead_forms');
    expect(forms[0]?.client_id).toBe(IDS.client);
  });
});

describe('ATAMA TEK ADIM — izleme açılıyor ve geçmiş kuyruğa giriyor', () => {
  /**
   * NEDEN: müşterilerin kendi Facebook hesabı yok, ajans onların Business
   * Manager'ına partner olarak ekleniyor. Yani bağlantı ajans seviyesinde
   * kalmak zorunda ve bir workspace'in verisi HESAP ONA ATANINCA başlıyor.
   *
   * "Ata → izlemeyi aç → bekle" üçlüsü kullanıcının angarya dediği şeydi ve
   * ikinci adımı atlamak "atadım ama veri gelmiyor" hâlini üretiyordu.
   */
  it('KRİTİK: atama İZLEMEYİ AÇIYOR — ayrı bir adım yok', async () => {
    const sonuc = await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    expect(sonuc.syncEnabled).toBe(true);

    const [satir] = await h.q<{ sync_enabled: boolean }>(
      `SELECT sync_enabled FROM ad_accounts WHERE id = $1`,
      [POOL_ACCOUNT],
    );
    expect(satir!.sync_enabled).toBe(true);
  });

  it('KRİTİK: geçmiş veri kuyruğa giriyor — önce structure, sonra initial_backfill', async () => {
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    expect(kuyruk.map((i) => i.jobType)).toEqual(['structure', 'initial_backfill']);
    expect(kuyruk.every((i) => i.adAccountId === POOL_ACCOUNT)).toBe(true);
    expect(kuyruk.every((i) => i.clientId === IDS.client)).toBe(true);
  });

  it('KRİTİK: geçmiş 90 gün ve KAMPANYA seviyesinde', async () => {
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    const b = kuyruk.find((i) => i.jobType === 'initial_backfill')!;
    expect(b.entityLevel).toBe('campaign');
    const gun =
      (new Date(`${b.dateTo as string}T00:00:00Z`).getTime() -
        new Date(`${b.dateFrom as string}T00:00:00Z`).getTime()) /
      86_400_000;
    expect(Math.round(gun)).toBe(90);
  });

  it('KRİTİK: ATAMA KALKARKEN kuyruğa iş GİRMİYOR', async () => {
    // Havuza geri konan hesap senkronize edilmiyor; geçmiş çekmek boşa kota.
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    kuyruk = [];
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, null, META);
    expect(kuyruk).toHaveLength(0);
  });

  it('DEĞİŞİKLİK YOKSA kuyruğa iş girmiyor — aynı atama iki kez', async () => {
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    kuyruk = [];
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    expect(kuyruk).toHaveLength(0);
  });
});
