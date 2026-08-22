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

  it('KRİTİK: metrik işi GECİKMELİ, yapı işi değil — öncelik bariyer değil', async () => {
    // Worker dört işi paralel çalıştırıyor; öncelik (structure 4, backfill 10)
    // yalnızca SIRA veriyor. Gecikme olmadan metrik işi yapı işi hâlâ
    // koşarken başlayabiliyor ve bütün satırlar eşlenemeyip atlanıyor.
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    const y = kuyruk.find((i) => i.jobType === 'structure')!;
    const b = kuyruk.find((i) => i.jobType === 'initial_backfill')!;
    expect(y.delayMs).toBeUndefined();
    expect(b.delayMs).toBeGreaterThan(0);
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

/**
 * HESAP EL DEĞİŞTİRİNCE VERİSİ DE TAŞINIYOR.
 *
 * Bu bloğun var oluş sebebi tek bir üretim belirtisi: bir reklam hesabı A
 * müşterisinden B'ye alındıktan sonra A'nın raporunda ARTIK ONA AİT OLMAYAN
 * harcama görünmeye devam ediyordu, B ise hiçbir geçmiş göremiyordu. Hata yok,
 * log yok — yalnızca yanlış bir sayı ve yanlış müşteriye gitmiş bir PDF.
 *
 * Testler GERÇEK veritabanıyla koşuyor (PGlite): `client_id` denormalize bir
 * kolon ve iddiaların tamamı SQL'in ne yaptığıyla ilgili — sahte bir Prisma
 * bunu doğrulayamazdı.
 */
describe('hesap el değiştirince verisi de taşınıyor', () => {
  const KAMPANYA = '11111111-2222-3333-4444-555555555555';
  const GRUP = '11111111-2222-3333-4444-555555555556';
  const REKLAM = '11111111-2222-3333-4444-555555555557';
  const KREATIF = '11111111-2222-3333-4444-555555555558';

  /** Hesabın A müşterisindeyken biriken verisi. */
  async function eskiVeriYaz(clientId: string) {
    await h.q(
      `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, updated_at)
       VALUES ($1, $2, $3, 'meta', 'c-1', 'Kampanya', now())`,
      [KAMPANYA, POOL_ACCOUNT, clientId],
    );
    await h.q(
      `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', 'g-1', 'Grup', now())`,
      [GRUP, KAMPANYA, POOL_ACCOUNT, clientId],
    );
    await h.q(
      `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id, name, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', 'a-1', 'Reklam', now())`,
      [REKLAM, GRUP, POOL_ACCOUNT, clientId],
    );
    await h.q(
      `INSERT INTO creatives (id, ad_account_id, client_id, platform, external_id, updated_at)
       VALUES ($1, $2, $3, 'meta', 'k-1', now())`,
      [KREATIF, POOL_ACCOUNT, clientId],
    );
    await h.q(
      `INSERT INTO insights_daily
         (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
          date, breakdown_key, impressions, clicks, spend_micros, conversions,
          conversion_value_micros, currency)
       VALUES ($1, $2, 'meta', 'campaign', $3, 'c-1', '2026-08-01'::date, '',
               1000, 50, 250000000, 3, 0, 'TRY')`,
      [clientId, POOL_ACCOUNT, KAMPANYA],
    );
    await h.q(
      `INSERT INTO keyword_insights
         (client_id, ad_account_id, external_criterion_id, keyword, match_type, date, currency)
       VALUES ($1, $2, 'kw-1', 'ankara nakliyat', 'EXACT', '2026-08-01'::date, 'TRY')`,
      [clientId, POOL_ACCOUNT],
    );
    await h.q(
      `INSERT INTO search_term_insights
         (client_id, ad_account_id, term_hash, search_term, date, currency)
       VALUES ($1, $2, repeat('a', 64), 'ankara evden eve', '2026-08-01'::date, 'TRY')`,
      [clientId, POOL_ACCOUNT],
    );
    await h.q(
      `INSERT INTO sync_jobs (client_id, ad_account_id, job_type, status)
       VALUES ($1, $2, 'structure', 'succeeded')`,
      [clientId, POOL_ACCOUNT],
    );
  }

  async function musteriler(tablo: string): Promise<string[]> {
    const rows = await h.q<{ client_id: string }>(
      `SELECT DISTINCT client_id FROM ${tablo} WHERE ad_account_id = $1`,
      [POOL_ACCOUNT],
    );
    return rows.map((r) => r.client_id);
  }

  it('KRİTİK: hesabın bütün verisi yeni müşteriye geçiyor', async () => {
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    await eskiVeriYaz(IDS.client);

    const res = await svc.assignAdAccount(CTX, POOL_ACCOUNT, CLIENT_B, META);

    for (const t of [
      'campaigns',
      'ad_groups',
      'ads',
      'creatives',
      'insights_daily',
      'keyword_insights',
      'search_term_insights',
      'sync_jobs',
    ]) {
      expect(await musteriler(t), `${t} taşınmadı`).toEqual([CLIENT_B]);
    }
    // SEKİZ TABLO, SEKİZ SATIR. Sayı yanıtta dönüyor çünkü panelde yazılıyor:
    // "taşındı" demek yetmiyor, KAÇ kayıt taşındığı görünmeli.
    expect(res.movedRows).toBe(8);
  });

  it('KRİTİK: eski müşteride TEK BİR satır bile kalmıyor', async () => {
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    await eskiVeriYaz(IDS.client);
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, CLIENT_B, META);

    /*
     * BÖLÜNMÜŞ GEÇMİŞ ARANIYOR. Yarısı taşınan bir hesap, hiç taşınmayandan
     * DAHA KÖTÜ: iki müşterinin de rakamı yanlış oluyor ve ikisi de kendi
     * içinde tutarlı göründüğü için kimse fark etmiyor.
     */
    const kalan = await h.q<{ n: string }>(
      `SELECT count(*) AS n FROM (
         SELECT client_id FROM campaigns            WHERE ad_account_id = $1
         UNION ALL SELECT client_id FROM ad_groups  WHERE ad_account_id = $1
         UNION ALL SELECT client_id FROM ads        WHERE ad_account_id = $1
         UNION ALL SELECT client_id FROM creatives  WHERE ad_account_id = $1
         UNION ALL SELECT client_id FROM insights_daily       WHERE ad_account_id = $1
         UNION ALL SELECT client_id FROM keyword_insights     WHERE ad_account_id = $1
         UNION ALL SELECT client_id FROM search_term_insights WHERE ad_account_id = $1
         UNION ALL SELECT client_id FROM sync_jobs            WHERE ad_account_id = $1
       ) t WHERE client_id = $2`,
      [POOL_ACCOUNT, IDS.client],
    );
    expect(Number(kalan[0]!.n)).toBe(0);
  });

  it('KRİTİK: havuzdan geçen hesapta da taşıma tam — süzgeç ad_account_id', async () => {
    /*
     * A → havuz → B yolu. İkinci adımda `before.clientId` NULL olduğu için
     * "eski müşterinin satırları" diye bir şey kalmıyor; satırlar hâlâ A'da.
     * Taşıma `client_id`'ye göre süzseydi bu yol SESSİZCE hiçbir şey taşımaz
     * ve hata tam olarak eski hâline dönerdi — üstelik yalnızca bu sırada.
     */
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    await eskiVeriYaz(IDS.client);
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, null, META);

    expect(await musteriler('campaigns')).toEqual([IDS.client]);

    const res = await svc.assignAdAccount(CTX, POOL_ACCOUNT, CLIENT_B, META);
    expect(await musteriler('campaigns')).toEqual([CLIENT_B]);
    expect(await musteriler('insights_daily')).toEqual([CLIENT_B]);
    expect(res.movedRows).toBe(8);
  });

  it('havuza geri konunca veri taşınmıyor — eski müşterinin geçmişi', async () => {
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    await eskiVeriYaz(IDS.client);

    const res = await svc.assignAdAccount(CTX, POOL_ACCOUNT, null, META);

    // Çocuk tabloların `client_id`'si NOT NULL — boşaltılamıyor. Doğru
    // davranış da bu: veri o müşteriye aitken toplandı.
    expect(await musteriler('insights_daily')).toEqual([IDS.client]);
    expect(res.movedRows).toBe(0);

    /*
     * KALDIRMADA TEK DENETİM SATIRI. Yeniden atamada eski müşteriye AYRI bir
     * satır yazılıyor; aynı dal kaldırmada da koşarsa aynı müşteri için İKİ
     * `unassigned` satırı çıkıyor ve denetim izi mükerrer bir olay anlatıyor.
     */
    expect(await auditActions()).toEqual(['ad_account.assigned', 'ad_account.unassigned']);

    // KAÇ KAYDIN KALDIĞI SAYIYLA DÖNÜYOR. "Kaldır"a basan kullanıcı verinin
    // silinmediğini ve nerede durduğunu görmeli; sessiz kalması "hesabı
    // kaldırdım, geçmişim gitti mi" sorusunu üretiyordu.
    expect(res.stayingRows).toBe(8);
  });

  it('KRİTİK: İKİ ADIMLI atamada da kalanlar raporlanıyor', async () => {
    /*
     * PANELDEKİ GERÇEK YOL BU. Arayüzde "A'dan B'ye taşı" diye tek bir işlem
     * yok: kullanıcı önce "Kaldır"a basıyor (hesap havuza düşüyor), sonra
     * B'ye atıyor. İkinci adımda `before.clientId` NULL.
     *
     * "Kalan" sayısı eski müşteriye göre süzülseydi tam olarak bu yolda —
     * yani kullanıcının kullandığı tek yolda — hiçbir şey raporlanmazdı ve
     * A'nın bütçesi sessizce geride kalırdı.
     */
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    await h.q(
      `INSERT INTO monthly_budgets (id, org_id, client_id, ad_account_id, month, amount_micros, currency, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, '2026-08-01'::date, 5000000000, 'TRY', now())`,
      [IDS.org, IDS.client, POOL_ACCOUNT],
    );

    await svc.assignAdAccount(CTX, POOL_ACCOUNT, null, META);
    const res = await svc.assignAdAccount(CTX, POOL_ACCOUNT, CLIENT_B, META);

    expect(res.leftBehind).toEqual({ 'aylık bütçe': 1 });
  });

  it('KRİTİK: müşterinin KENDİ kayıtları taşınmıyor ve sayıyla bildiriliyor', async () => {
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    await h.q(
      `INSERT INTO monthly_budgets (id, org_id, client_id, ad_account_id, month, amount_micros, currency, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, '2026-08-01'::date, 5000000000, 'TRY', now())`,
      [IDS.org, IDS.client, POOL_ACCOUNT],
    );
    await h.q(
      `INSERT INTO rules (id, org_id, client_id, ad_account_id, name, level, conditions, action, guard, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'CPA kuralı', 'campaign', '[{"metric":"cpa","op":"gt","value":100}]'::jsonb, '{"type":"pause"}'::jsonb, '{}'::jsonb, now())`,
      [IDS.org, IDS.client, POOL_ACCOUNT],
    );

    const res = await svc.assignAdAccount(CTX, POOL_ACCOUNT, CLIENT_B, META);

    /*
     * BÜTÇE VE KURAL BİRİNİN KARARI, platformun aynası değil. B'nin hesabına
     * A'nın hiç görmediği bir kural koymak, o kuralın B'nin kampanyalarını
     * durdurması demek olurdu. Ayrıca `monthly_budgets_account_uniq` kısmi
     * tekil indeksi taşımayı ORTASINDA patlatabilirdi.
     */
    const butce = await h.q<{ client_id: string }>(
      'SELECT client_id FROM monthly_budgets WHERE ad_account_id = $1',
      [POOL_ACCOUNT],
    );
    expect(butce[0]!.client_id).toBe(IDS.client);

    // SESSİZ BIRAKILMIYOR — `assignSocialProfile`'daki `leftBehindForms`
    // deseninin aynısı.
    expect(res.leftBehind).toEqual({ 'aylık bütçe': 1, kural: 1 });
  });

  it('aynı müşteriye tekrar atamak hiçbir satıra dokunmuyor', async () => {
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    await eskiVeriYaz(IDS.client);

    const res = await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);

    expect(res.changed).toBe(false);
    // Alan HER DALDA var: `undefined` okuyup "0 kayıt" yazan bir panel,
    // hiçbir şey yapılmadığında yanlış cümle kurardı.
    expect(res.movedRows).toBe(0);
    expect(res.leftBehind).toEqual({});
  });

  it('KRİTİK: "kalan" sayısı YALNIZCA eski müşterinin kayıtlarını sayıyor', async () => {
    /*
     * HESAP GERİ DÖNÜYOR: B → A → B. Her müşteri kendi döneminde bir kural
     * yazmış oluyor ve ikisi de aynı hesabı işaret ediyor.
     *
     * Sayım eski müşteriye göre süzülmezse, B'ye geri dönüşte B'NİN KENDİ
     * kuralı da "eski müşteride kaldı" diye raporlanıyor. Panelde çıkan cümle
     * "2 kural eski müşteride kaldı" oluyor ve kullanıcı olmayan bir kaybı
     * aramaya başlıyor — sessiz hatanın tersi: gürültülü yalan.
     */
    const kural = async (clientId: string, ad: string) =>
      h.q(
        `INSERT INTO rules (id, org_id, client_id, ad_account_id, name, level, conditions, action, guard, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'campaign',
                 '[{"metric":"cpa","op":"gt","value":100}]'::jsonb, '{"type":"pause"}'::jsonb, '{}'::jsonb, now())`,
        [IDS.org, clientId, POOL_ACCOUNT, ad],
      );

    await svc.assignAdAccount(CTX, POOL_ACCOUNT, CLIENT_B, META);
    await kural(CLIENT_B, 'B kuralı');
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    await kural(IDS.client, 'A kuralı');

    const res = await svc.assignAdAccount(CTX, POOL_ACCOUNT, CLIENT_B, META);

    // Hesapta iki kural var ama eski müşteride kalan YALNIZCA biri.
    const toplam = await h.q<{ n: string }>(
      'SELECT count(*) AS n FROM rules WHERE ad_account_id = $1',
      [POOL_ACCOUNT],
    );
    expect(Number(toplam[0]!.n)).toBe(2);
    expect(res.leftBehind).toEqual({ kural: 1 });
  });

  it('KRİTİK: eski müşterinin ŞEMSİYE bütçesi bildiriliyor', async () => {
    /*
     * ŞEMSİYE BÜTÇE `ad_account_id IS NULL` İLE DURUYOR — yani hesapla
     * ilişkisi yok ve hesaba göre sayan hiçbir sorguya düşmüyor. Bu yüzden
     * "kalan" listesinde hiç görünmüyordu.
     *
     * Oysa taşımadan en çok o etkileniyor: ay ortasında hesap gidince eski
     * müşterinin ay içi harcaması bir anda düşüyor, kural motorunun bütçe
     * bekçisi olmayan bir boşluk görüyor ve kuralların bütçe ARTIRMASINA
     * izin veriyor. Yeni müşteride ise harcama var, bütçe yok. İkisi de
     * para harcatan ve hiçbir ekranda görünmeyen kaymalar.
     */
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    await eskiVeriYaz(IDS.client);
    await h.q(
      `INSERT INTO monthly_budgets (id, org_id, client_id, ad_account_id, month, amount_micros, currency, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NULL, date_trunc('month', now())::date, 5000000000, 'TRY', now())`,
      [IDS.org, IDS.client],
    );

    const res = await svc.assignAdAccount(CTX, POOL_ACCOUNT, CLIENT_B, META);
    expect(res.clientWide).toEqual({ 'ay geneli (şemsiye) bütçe': 1 });
  });

  it('KRİTİK: "TÜM HESAPLAR" kuralı da bildiriliyor', async () => {
    /*
     * KURALLARIN EN YAYGIN ŞEKLİ BU. `rules.ad_account_id` NULL = müşterinin
     * TÜM reklam hesapları (şemanın kendi yorumu). Hesaba çivilenmiş kural
     * azınlıkta; sayım yalnızca `= hesap` deseydi, taşınan hesabı GERÇEKTEN
     * yöneten kural hiç raporlanmazdı ve panelde "kural: 0" yazardı.
     *
     * Şemsiye bütçedeki boşluğun aynısı — biri fark edilip diğeri
     * atlanmıştı.
     */
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    await eskiVeriYaz(IDS.client);
    await h.q(
      `INSERT INTO rules (id, org_id, client_id, ad_account_id, name, level, conditions, action, guard, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NULL, 'Tüm hesaplar · CPA', 'campaign',
               '[{"metric":"cpa","op":"gt","value":250}]'::jsonb, '{"type":"pause"}'::jsonb, '{}'::jsonb, now())`,
      [IDS.org, IDS.client],
    );

    const res = await svc.assignAdAccount(CTX, POOL_ACCOUNT, CLIENT_B, META);
    expect(res.clientWide).toEqual({ 'tüm hesapları kapsayan kural': 1 });
    // Hesaba çivilenmiş kural YOK — o listede görünmemeli.
    expect(res.leftBehind).toEqual({});
  });

  it('KRİTİK: hesap İKİ müşteriden geçmişse sayım yine çalışıyor', async () => {
    /*
     * ÖNCEKİ SAHİP BİRDEN FAZLA OLABİLİR. Hesap A→B→C gezdiyse ve upsert'ler
     * araya girmişse, satırlar iki farklı müşteride birden duruyor.
     *
     * Bu testin var oluş sebebi: sorgu `client_id IN (${sahipler}::uuid)`
     * biçimindeydi ve cast LİSTE SONUNA düşüyordu — `IN ($1,$2)::uuid`.
     * Tek sahiple çalışıyor, İKİ sahiple Postgres sözdizimi hatası veriyor.
     * Yani hata yalnızca hesabın gezdiği, tam da bu özelliğin var olma
     * sebebi olan durumda ortaya çıkıyordu.
     */
    const UCUNCU = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    await h.q(
      `INSERT INTO clients (id, org_id, name, slug, updated_at)
       VALUES ($1, $2, 'Üçüncü', 'ucuncu', now())`,
      [UCUNCU, IDS.org],
    );
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    await eskiVeriYaz(IDS.client);
    // Satırların bir kısmı ikinci müşteride: hesap oradan da geçmiş.
    await h.q('UPDATE campaigns SET client_id = $1 WHERE ad_account_id = $2', [
      UCUNCU,
      POOL_ACCOUNT,
    ]);
    await h.q(
      `INSERT INTO monthly_budgets (id, org_id, client_id, ad_account_id, month, amount_micros, currency, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NULL, date_trunc('month', now())::date, 1000000, 'TRY', now())`,
      [IDS.org, UCUNCU],
    );

    const res = await svc.assignAdAccount(
      { ...CTX, clientIds: [IDS.client, CLIENT_B, UCUNCU] },
      POOL_ACCOUNT,
      CLIENT_B,
      META,
    );

    expect(res.movedRows).toBe(8);
    expect(res.clientWide).toEqual({ 'ay geneli (şemsiye) bütçe': 1 });
  });

  it('KAPANMIŞ ayın şemsiye bütçesi bildirilmiyor', async () => {
    // Geçmiş ayın bütçesi artık bir eşik değil, kayıt. Onu da bildirmek
    // her taşımada anlamsız bir uyarı üretirdi ve uyarı körlüğü yaratırdı.
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    await eskiVeriYaz(IDS.client);
    await h.q(
      `INSERT INTO monthly_budgets (id, org_id, client_id, ad_account_id, month, amount_micros, currency, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NULL,
               (date_trunc('month', now()) - interval '1 month')::date, 5000000000, 'TRY', now())`,
      [IDS.org, IDS.client],
    );

    const res = await svc.assignAdAccount(CTX, POOL_ACCOUNT, CLIENT_B, META);
    expect(res.clientWide).toEqual({});
  });

  it('KRİTİK: ESKİ müşteri de kendi denetim satırını alıyor', async () => {
    /*
     * KAYBEDEN TARAFIN KAYDI. Denetim satırı yalnızca YENİ müşteriye
     * yazılıyordu; doğrudan A→B atamasında A hiçbir iz almıyordu. Oysa
     * raporundaki rakam değişen taraf A ve B'nin kaydını RLS ona
     * göstermiyor — "geçen ay bu sayı başkaydı" sorusunun cevabı hiçbir
     * yerde olmazdı.
     */
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    await eskiVeriYaz(IDS.client);
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, CLIENT_B, META);

    const rows = await h.q<{ client_id: string; action: string }>(
      `SELECT client_id, action FROM audit_logs
        WHERE target_id = $1 AND action LIKE 'ad_account.%' ORDER BY id`,
      [POOL_ACCOUNT],
    );

    /*
     * İDDİA SAYIYA ÇAPALI, "son iki satır"a DEĞİL.
     *
     * İlk yazımda son iki satırın müşterilerine bakıyordum ve eski müşteri
     * satırını silmek testi DÜŞÜRMÜYORDU: geriye kalan iki satır (havuzdan
     * A'ya atama + A'dan B'ye atama) zaten tam olarak o iki müşteriyi
     * taşıyordu. Test geçiyordu ama hiçbir şey tutmuyordu.
     */
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => `${r.action}:${r.client_id === IDS.client ? 'A' : 'B'}`)).toEqual([
      'ad_account.assigned:A',
      'ad_account.assigned:B',
      'ad_account.unassigned:A',
    ]);
  });

  it('KRİTİK: hesap el değiştirince BOOST FATURA BAĞI koparılıyor', async () => {
    /*
     * `linkAdAccountForBoost` "hesap ve sayfa AYNI müşteride olmak zorunda"
     * kuralını EŞLEŞTİRME anında zorluyor. Ama hesap sonradan el değiştirince
     * kimse bağı koparmıyordu: A'nın sayfasındaki gönderi B'nin reklam
     * hesabından faturalanmaya devam ediyordu — kuralın var oluş sebebinin
     * tam kendisi, üstelik para harcayan tarafta ve hiçbir ekranda görünmeden.
     */
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    await h.q(
      `INSERT INTO social_profiles
         (id, org_id, client_id, connection_id, profile_type, external_id, name,
          linked_ad_account_id, updated_at)
       VALUES ($1, $2, $3, $4, 'facebook_page', 'page_1', 'A sayfası', $5, now())`,
      [POOL_PROFILE, IDS.org, IDS.client, IDS.connection, POOL_ACCOUNT],
    );

    const res = await svc.assignAdAccount(CTX, POOL_ACCOUNT, CLIENT_B, META);

    expect(res.unlinkedBoostPages).toBe(1);
    const rows = await h.q<{ linked_ad_account_id: string | null }>(
      'SELECT linked_ad_account_id FROM social_profiles WHERE id = $1',
      [POOL_PROFILE],
    );
    expect(rows[0]!.linked_ad_account_id).toBeNull();
  });

  it('sayfa da AYNI müşterideyse bağ korunuyor', async () => {
    /*
     * Bağı toptan koparmak, hesabı ve sayfası aynı müşteride kalan bir
     * kurulumda çalışan Akıllı Boost'u sessizce durdururdu — düzeltilen
     * hatanın aynısı, ters yönde.
     */
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    await h.q(
      `INSERT INTO social_profiles
         (id, org_id, client_id, connection_id, profile_type, external_id, name,
          linked_ad_account_id, updated_at)
       VALUES ($1, $2, $3, $4, 'facebook_page', 'page_1', 'B sayfası', $5, now())`,
      [POOL_PROFILE, IDS.org, CLIENT_B, IDS.connection, POOL_ACCOUNT],
    );

    const res = await svc.assignAdAccount(CTX, POOL_ACCOUNT, CLIENT_B, META);

    expect(res.unlinkedBoostPages).toBe(0);
    const rows = await h.q<{ linked_ad_account_id: string | null }>(
      'SELECT linked_ad_account_id FROM social_profiles WHERE id = $1',
      [POOL_PROFILE],
    );
    expect(rows[0]!.linked_ad_account_id).toBe(POOL_ACCOUNT);
  });

  it('denetim kaydı taşınan satır sayılarını da tutuyor', async () => {
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, IDS.client, META);
    await eskiVeriYaz(IDS.client);
    await svc.assignAdAccount(CTX, POOL_ACCOUNT, CLIENT_B, META);

    const rows = await h.q<{ after: Record<string, unknown> }>(
      `SELECT after FROM audit_logs WHERE action = 'ad_account.assigned' ORDER BY id DESC LIMIT 1`,
    );
    const after = rows[0]!.after as { tasinanSatirlar?: Record<string, number> };
    expect(after.tasinanSatirlar?.insights_daily).toBe(1);
    expect(after.tasinanSatirlar?.campaigns).toBe(1);
  });
});
