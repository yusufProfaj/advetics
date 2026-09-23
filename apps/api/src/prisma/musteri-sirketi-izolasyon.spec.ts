import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * ═══ MÜŞTERİ ŞİRKETİNİN ADMİNİ, AJANSIN PORTFÖYÜNÜ GÖREMEZ ═══
 *
 * Kurulum gerçek: Profaj'ın üst hesabı altında 48 şirket var ve her biri bir
 * müşteri. Bir müşteriye (3A Makina) KENDİ şirketinde `admin` verilince o
 * kişi kendi sayfasını, kanalını ve reklam hesabını KENDİSİ ekleyebilmeli —
 * kurulum derdi ajansta kalmasın diye. Karşılığında verilemeyecek tek şey
 * şu: ajansın DİĞER müşterilerinden tek bir satır.
 *
 * ┌─ NEDEN KAYNAK OKUMAK YETMİYOR ────────────────────────────────────────┐
 * │ `admin` rolü BÜTÜN yetkileri taşıyor (`ROLE_PERMISSIONS.admin = ALL`) │
 * │ ve `app.is_org_admin()` açık geliyor. Yani sınır rolde DEĞİL,          │
 * │ politikaların okuduğu GUC'larda: `current_org_id`,                     │
 * │ `current_manager_account_id` ve `current_client_ids`. Üçünün birlikte  │
 * │ ne ürettiği ancak ÇALIŞTIRILARAK görülür.                              │
 * └───────────────────────────────────────────────────────────────────────┘
 *
 * `pglite-harness` politikaları kurduktan sonra RLS'i KAPATIYOR (üretimde
 * worker BYPASSRLS ile bağlanıyor, doğru taklit bu). Bu paket ilgili
 * tablolarda RLS'i geri açıp `SET ROLE` ile sahibi olmayan bir role geçiyor:
 * superuser politikaları atlıyor, sıradan rol atlamıyor. Sınanan şey
 * kopyalanmış bir SQL değil POLİTİKANIN KENDİSİ.
 */
let h: Harness;

const UST_PROFAJ = 'aaaa0000-0000-0000-0000-0000000000aa';

const ORG_PROFAJ = '11111111-1111-1111-1111-111111111111';
const ORG_3A = '22222222-2222-2222-2222-222222222222';
const ORG_BILTAS = '33333333-3333-3333-3333-333333333333';

const WS_3A = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
const WS_BILTAS = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';

const USER_PROFAJ = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
const USER_3A = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1';

const CONN_PROFAJ = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';
const CONN_3A = 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1';
const CONN_3A_META = 'f2f2f2f2-f2f2-f2f2-f2f2-f2f2f2f2f2f2';

const ACC_PROFAJ_HAVUZ = '01010101-0101-0101-0101-010101010101';
const ACC_BILTAS = '02020202-0202-0202-0202-020202020202';
const ACC_3A = '03030303-0303-0303-0303-030303030303';
const ACC_3A_HAVUZ = '04040404-0404-0404-0404-040404040404';

const SAYFA_PROFAJ_HAVUZ = '05050505-0505-0505-0505-050505050505';
const SAYFA_BILTAS = '06060606-0606-0606-0606-060606060606';
const KANAL_3A = '07070707-0707-0707-0707-070707070707';
const SAYFA_3A_HAVUZ = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a';

const KAMP_BILTAS = '08080808-0808-0808-0808-080808080808';
const KAMP_3A = '09090909-0909-0909-0909-090909090909';

/** Politika uygulanan rol. Tabloların sahibi DEĞİL — RLS ancak öyle işliyor. */
const APP_ROLE = 'advetics_musteri_izolasyon_test';

const RLS_TABLOLARI = [
  /*
   * `manager_accounts` DA AÇIK: havuz politikası ajans şirketini
   * `app.ajans_org_id()` ile bu tablodan okuyor ve üretimde o okuma da bir
   * politikadan geçiyor. Kapalı bıraksaydık fonksiyon koşum ortamında her
   * satırı görür, üretimde görmeyebilirdi.
   */
  'manager_accounts',
  'organizations',
  'clients',
  'platform_connections',
  'ad_accounts',
  'social_profiles',
  'campaigns',
  'insights_daily',
] as const;

beforeAll(async () => {
  h = await createHarness();

  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  await h.q(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${APP_ROLE}`);

  for (const t of RLS_TABLOLARI) {
    await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  }

  await h.q(
    `INSERT INTO manager_accounts (id, name, slug, status, updated_at)
     VALUES ($1, 'Profaj Reklamcılık', 'profaj', 'active', now())`,
    [UST_PROFAJ],
  );

  /*
   * ÜÇ ŞİRKET DE AYNI ÜST HESABIN ALTINDA. Ayrı üst hesaplara koymak testi
   * KOLAYLAŞTIRIRDI ve tam da ölçmek istediğimiz şeyi kaçırırdı: tehlike
   * kardeş şirketlerde, yabancı şirketlerde değil.
   */
  await h.q(
    `INSERT INTO organizations (id, name, slug, status, manager_account_id, updated_at)
     VALUES ($1, 'Profaj Reklamcılık', 'profaj-org', 'active', $4, now()),
            ($2, '3A Makina',          '3a',         'active', $4, now()),
            ($3, 'Biltaş',             'biltas',     'active', $4, now())`,
    [ORG_PROFAJ, ORG_3A, ORG_BILTAS, UST_PROFAJ],
  );
  /*
   * AJANS ŞİRKETİ PROFAJ. Havuzu kardeş şirketlere açan tek şey bu satır;
   * yazılmasaydı Profaj'ın havuzu da yalnızca kendi şirketinde kalırdı.
   */
  await h.q(`UPDATE manager_accounts SET ajans_org_id = $1 WHERE id = $2`, [ORG_PROFAJ, UST_PROFAJ]);
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $3, '3A Makina', '3a-ws', now()),
            ($2, $4, 'Biltaş',    'biltas-ws', now())`,
    [WS_3A, WS_BILTAS, ORG_3A, ORG_BILTAS],
  );
  await h.q(
    `INSERT INTO users (id, org_id, email, full_name, updated_at)
     VALUES ($1, $3, 'yonetici@profaj.com', 'Profaj Yöneticisi', now()),
            ($2, $4, 'admin@3amakina.com',  '3A Yöneticisi',     now())`,
    [USER_PROFAJ, USER_3A, ORG_PROFAJ, ORG_3A],
  );

  /*
   * İKİ AYRI YETKİLENDİRME.
   *
   * `CONN_PROFAJ` ajansın tek Meta kimliği: altındaki havuz 481 hesap
   * taşıyor ve çoğu BAŞKA müşterilere ait. `CONN_3A` ise 3A'nın kendi
   * admininin kurduğu bağlantı — bu paketin savunduğu self-servis yolun
   * karşılığı.
   */
  await h.q(
    `INSERT INTO platform_connections
       (id, org_id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1, $3, NULL, 'meta',   'active', 'profaj-bm', 'Profaj BM',  '\\x00', '{}', $5, now()),
            ($2, $4, NULL, 'google', 'active', '3a-google', '3A Google',  '\\x00', '{}', $6, now()),
            ($7, $4, NULL, 'meta',   'active', '3a-meta',   '3A Meta',    '\\x00', '{}', $6, now())`,
    [CONN_PROFAJ, CONN_3A, ORG_PROFAJ, ORG_3A, USER_PROFAJ, USER_3A, CONN_3A_META],
  );

  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, updated_at)
     VALUES ($1,  $5, NULL, $9,  'meta',   'act_havuz',  'PROFAJ HAVUZU', 'TRY', 'Europe/Istanbul', now()),
            ($2,  $7, $8,   $9,  'meta',   'act_biltas', 'BILTAS HESABI', 'TRY', 'Europe/Istanbul', now()),
            ($3,  $6, $11,  $10, 'google', 'g_3a',       '3A HESABI',     'TRY', 'Europe/Istanbul', now()),
            ($4,  $6, NULL, $10, 'google', 'g_3a_havuz', '3A HAVUZU',     'TRY', 'Europe/Istanbul', now())`,
    [
      ACC_PROFAJ_HAVUZ,
      ACC_BILTAS,
      ACC_3A,
      ACC_3A_HAVUZ,
      ORG_PROFAJ,
      ORG_3A,
      ORG_BILTAS,
      WS_BILTAS,
      CONN_PROFAJ,
      CONN_3A,
      WS_3A,
    ],
  );

  await h.q(
    `INSERT INTO social_profiles
       (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $4, NULL, $7, 'facebook_page',   'page_havuz',  'PROFAJ HAVUZ SAYFASI', now()),
            ($2, $6, $5,   $7, 'facebook_page',   'page_biltas', 'BILTAS SAYFASI',       now()),
            ($3, $8, $9,   $10,'youtube_channel', 'yt_3a',       '3A YOUTUBE KANALI',    now()),
            ($11,$8, NULL, $12,'facebook_page',   'page_3a',     '3A HAVUZ SAYFASI',     now())`,
    [
      SAYFA_PROFAJ_HAVUZ,
      SAYFA_BILTAS,
      KANAL_3A,
      ORG_PROFAJ,
      WS_BILTAS,
      ORG_BILTAS,
      CONN_PROFAJ,
      ORG_3A,
      WS_3A,
      CONN_3A,
      SAYFA_3A_HAVUZ,
      CONN_3A_META,
    ],
  );

  await h.q(
    `INSERT INTO campaigns
       (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
     VALUES ($1, $3, $5, 'meta',   'c_biltas', 'BILTAS KAMPANYASI', 'active', 'none', now()),
            ($2, $4, $6, 'google', 'c_3a',     '3A KAMPANYASI',     'active', 'none', now())`,
    [KAMP_BILTAS, KAMP_3A, ACC_BILTAS, ACC_3A, WS_BILTAS, WS_3A],
  );

  await h.q(
    `INSERT INTO insights_daily
       (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
        date, currency, spend_micros)
     VALUES ($1, $3, 'meta',   'campaign', $5, 'c_biltas', DATE '2026-09-01', 'TRY', 1000000),
            ($2, $4, 'google', 'campaign', $6, 'c_3a',     DATE '2026-09-01', 'TRY', 2000000)`,
    [WS_BILTAS, WS_3A, ACC_BILTAS, ACC_3A, KAMP_BILTAS, KAMP_3A],
  );
});

afterAll(async () => {
  await h.close();
});

interface Ctx {
  orgId: string;
  userId: string;
  clientIds: string[];
  isOrgAdmin: boolean;
  /** Üst hesap üyeliği OLMAYAN kullanıcıda boş — `TenantContextService` null yazıyor. */
  managerAccountId?: string | null;
  activeClientId?: string | null;
  /** "Tüm şirketler" modu — `app.tum_sirketler()`. */
  tumSirketler?: boolean;
}

async function asUser<T = Record<string, unknown>>(sql: string, ctx: Ctx): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id',            '${ctx.orgId}', false),
           set_config('app.current_user_id',           '${ctx.userId}', false),
           set_config('app.current_client_ids',        '${ctx.clientIds.join(',')}', false),
           set_config('app.is_org_admin',              '${ctx.isOrgAdmin ? 'on' : 'off'}', false),
           set_config('app.current_manager_account_id','${ctx.managerAccountId ?? ''}', false),
           set_config('app.current_active_client_id',  '${ctx.activeClientId ?? ''}', false),
           set_config('app.tum_sirketler',             '${ctx.tumSirketler ? 'on' : 'off'}', false)
  `);
  await h.q(`SET ROLE ${APP_ROLE}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

/**
 * 3A MAKİNA'NIN KENDİ YÖNETİCİSİ.
 *
 * `isOrgAdmin` AÇIK ve bu testin can alıcı noktası: rol `admin`, yani
 * kullanıcı ekleyebiliyor, platform bağlayabiliyor, hesap atayabiliyor.
 * `managerAccountId` YOK — üst hesap üyeliği verilmediği için
 * `TenantContextService` oraya null yazıyor ve `app.ajansa_ait_org` ikinci
 * dalını hiç değerlendiremiyor.
 */
const ADMIN_3A: Ctx = {
  orgId: ORG_3A,
  userId: USER_3A,
  clientIds: [WS_3A],
  isOrgAdmin: true,
  managerAccountId: null,
};

/** Ajansın yöneticisi — üst hesap üyeliği VAR. Pozitif kontrol. */
const ADMIN_PROFAJ: Ctx = {
  orgId: ORG_PROFAJ,
  userId: USER_PROFAJ,
  clientIds: [],
  isOrgAdmin: true,
  managerAccountId: UST_PROFAJ,
};

/**
 * AJANSIN YÖNETİCİSİ, MÜŞTERİ ŞİRKETİNİN İÇİNDEYKEN.
 *
 * Kullanıcının kurmak istediği model birebir bu: *"ben Profaj'ım, üstte
 * hesaplarım var, alttakine kullandırabilirim ama PROFAJ OLARAK
 * girdiğimde."* Aynı `orgId` (3A), aynı `clientIds` — tek fark üst hesap
 * üyeliği. Ekranın altındaki havuz o üyelikten geliyor.
 */
const PROFAJ_3A_ICINDE: Ctx = {
  orgId: ORG_3A,
  userId: USER_PROFAJ,
  clientIds: [WS_3A],
  isOrgAdmin: true,
  managerAccountId: UST_PROFAJ,
};

async function adlar(tablo: string, ctx: Ctx): Promise<string[]> {
  const rows = await asUser<{ name: string }>(`SELECT name FROM ${tablo} ORDER BY name`, ctx);
  return rows.map((r) => r.name);
}

describe('KURULUM GERÇEKTEN YAZILDI — tarama boşa düşmüyor', () => {
  it('bütün satırlar RLS kapalıyken görünüyor', async () => {
    /*
     * BU TEST OLMADAN AŞAĞIDAKİ HER "GÖRMÜYOR" İDDİASI BEDAVA GEÇERDİ.
     * Bir INSERT sessizce düşseydi (yanlış kolon, tutmayan kısıt) tablo boş
     * kalır ve izolasyon kanıtlanmış GİBİ görünürdü.
     */
    const hesaplar = await h.q<{ n: string }>('SELECT count(*) AS n FROM ad_accounts');
    expect(Number(hesaplar[0]?.n)).toBe(4);
    const sayfalar = await h.q<{ n: string }>('SELECT count(*) AS n FROM social_profiles');
    expect(Number(sayfalar[0]?.n)).toBe(4);
    const kampanyalar = await h.q<{ n: string }>('SELECT count(*) AS n FROM campaigns');
    expect(Number(kampanyalar[0]?.n)).toBe(2);
    const metrikler = await h.q<{ n: string }>('SELECT count(*) AS n FROM insights_daily');
    expect(Number(metrikler[0]?.n)).toBe(2);
  });

  it('AJANS YÖNETİCİSİ havuzu görüyor — politika satırları gizlemiyor', async () => {
    // Pozitif kontrol: aşağıdaki boş listeler "RLS her şeyi kapatıyor"
    // yüzünden değil, KAPSAM yüzünden boş.
    expect(await adlar('ad_accounts', ADMIN_PROFAJ)).toContain('PROFAJ HAVUZU');
    expect(await adlar('social_profiles', ADMIN_PROFAJ)).toContain('PROFAJ HAVUZ SAYFASI');
  });
});

describe('KRİTİK: 3A yöneticisi AJANSIN portföyünden tek satır göremiyor', () => {
  it('reklam hesapları — Profaj havuzu ve Biltaş hesabı YOK', async () => {
    /*
     * Havuz dalı `org_id = ANY (app.ajans_org_idleri()) AND
     * app.can_manage_pool()` diyor. `can_manage_pool()` bu kullanıcıda AÇIK
     * (org yöneticisi), yani satırları eleyen tek şey `ajans_org_idleri()`
     * ve o küme üst hesap kimliği null olduğu için TEK ELEMANLI.
     */
    const gorunen = await adlar('ad_accounts', ADMIN_3A);
    expect(gorunen).not.toContain('PROFAJ HAVUZU');
    expect(gorunen).not.toContain('BILTAS HESABI');
  });

  it('sayfalar ve kanallar — ajansın havuz sayfası ve Biltaş sayfası YOK', async () => {
    const gorunen = await adlar('social_profiles', ADMIN_3A);
    expect(gorunen).not.toContain('PROFAJ HAVUZ SAYFASI');
    expect(gorunen).not.toContain('BILTAS SAYFASI');
  });

  it('şirket listesi — kardeş şirketlerin ADI bile görünmüyor', async () => {
    // Müşteri portföyü ticari bilgi: ajansın hangi şirketlerle çalıştığını
    // görmek, tek satır metrik görmeden de bir sızıntı.
    expect(await adlar('organizations', ADMIN_3A)).toEqual(['3A Makina']);
  });

  it('workspace listesi — yalnızca kendi workspace’i', async () => {
    expect(await adlar('clients', ADMIN_3A)).toEqual(['3A Makina']);
  });

  it('bağlantılar — ajansın Meta yetkilendirmesi görünmüyor', async () => {
    const gorunen = await asUser<{ account_label: string }>(
      'SELECT account_label FROM platform_connections ORDER BY account_label',
      ADMIN_3A,
    );
    expect(gorunen.map((r) => r.account_label)).toEqual(['3A Google', '3A Meta']);
  });

  it('kampanyalar — başka şirketin kampanyası YOK', async () => {
    expect(await adlar('campaigns', ADMIN_3A)).toEqual(['3A KAMPANYASI']);
  });

  it('metrikler — başka şirketin harcaması YOK', async () => {
    const satirlar = await asUser<{ spend_micros: string }>(
      'SELECT spend_micros FROM insights_daily',
      ADMIN_3A,
    );
    expect(satirlar.map((r) => Number(r.spend_micros))).toEqual([2000000]);
  });
});

describe('KRİTİK: 3A yöneticisi KENDİ varlıklarını görüyor', () => {
  it('kendi hesabını ve kendi havuzunu görüyor', async () => {
    /*
     * Bu paketin diğer yarısı. İzolasyonu "hiçbir şey görünmesin" diye
     * kurmak kolay; istenen şey self-servis: 3A kendi Google hesabını
     * bağlayıp kendi hesaplarını KENDİ atayabilmeli. Havuz satırı
     * (`client_id IS NULL`) görünmezse atama ekranı kalıcı olarak boş kalır.
     */
    expect(await adlar('ad_accounts', ADMIN_3A)).toEqual(['3A HAVUZU', '3A HESABI']);
  });

  it('kendi YouTube kanalını görüyor', async () => {
    expect(await adlar('social_profiles', ADMIN_3A)).toEqual(['3A HAVUZ SAYFASI', '3A YOUTUBE KANALI']);
  });
});

describe('KRİTİK: AJANS, MÜŞTERİNİN İÇİNDEYKEN KENDİ HAVUZUNU KULLANABİLİYOR', () => {
  it('Profaj, 3A şirketinin içinde kendi havuzunu GÖRÜYOR', async () => {
    /*
     * Atama ekranının çalışması buna bağlı. Görünmezse ajans kendi
     * yetkilendirmesinden gelen bir hesabı müşteriye ATAYAMAZ ve müşterinin
     * tek yolu kendi hesabını bağlamak olurdu — istenen model bu değil,
     * istenen model İKİSİ BİRDEN.
     */
    expect(await adlar('ad_accounts', PROFAJ_3A_ICINDE)).toContain('PROFAJ HAVUZU');
  });

  it('aynı ekranda 3A’nın kendi hesabı da duruyor', async () => {
    const gorunen = await adlar('ad_accounts', PROFAJ_3A_ICINDE);
    expect(gorunen).toContain('3A HESABI');
  });

  it('KRİTİK: buradayken BAŞKA şirketin ATANMIŞ hesabı yine görünmüyor', async () => {
    /*
     * Havuz (`client_id IS NULL`) ajans geneli, ATANMIŞ satır ise kendi
     * şirketine çivili. Ajans yöneticisi bile 3A'nın içindeyken Biltaş'ın
     * hesabını görmüyor: yanlış müşterinin verisi yanlış ekranda durmasın.
     */
    expect(await adlar('ad_accounts', PROFAJ_3A_ICINDE)).not.toContain('BILTAS HESABI');
  });
});

describe('KRİTİK: ÜST HESAP ÜYELİĞİ SINIRI KALDIRIYOR — bu yüzden verilmiyor', () => {
  it('aynı kullanıcı üst hesap üyeliği alırsa AJANSIN HAVUZUNU GÖRÜYOR', async () => {
    /*
     * ═══ BU TEST BİR UYARI ═══
     *
     * `ManagerMembership` rolü üst hesabın altındaki HER şirkette geçerli
     * sayılıyor. 3A'nın yöneticisine "üst hesap ekibine" eklemek, 48
     * şirketin tamamını ona açmak demek — ve panelde bu iki ekleme yolu
     * yan yana duruyor (`/ayarlar/ekip` üst hesap bölümü ile şirket bölümü).
     *
     * Kaybolan sınırı ÖLÇÜYORUZ ki bir gün "üyelik verelim, nasılsa RLS
     * tutar" diyen biri bu satırı okusun: RLS TUTMUYOR, tutması da
     * beklenmiyor. Sınır ÜYELİĞİN KENDİSİ.
     */
    const uyelikli: Ctx = { ...ADMIN_3A, managerAccountId: UST_PROFAJ };
    const gorunen = await adlar('ad_accounts', uyelikli);
    expect(gorunen).toContain('PROFAJ HAVUZU');
  });

  it('üyelik yokken aynı sorgu havuzu GÖSTERMİYOR — fark yalnızca üyelikte', async () => {
    // İki iddianın tek farkı `managerAccountId`. Yukarıdaki test tek başına
    // dursaydı "havuz zaten hep görünüyor" ihtimalini elemezdi.
    expect(await adlar('ad_accounts', ADMIN_3A)).not.toContain('PROFAJ HAVUZU');
  });
});

/**
 * AJANSIN YÖNETİCİSİ, BAŞKA BİR MÜŞTERİNİN (Biltaş) İÇİNDEYKEN.
 *
 * Tehlikeli yön bu: ajans yöneticisinin elinde bütün şirketler var ve bir
 * müşterinin kendi bağladığı hesap, başka bir müşterinin ekranında
 * görünürse ona atanabilir.
 */
const PROFAJ_BILTAS_ICINDE: Ctx = {
  orgId: ORG_BILTAS,
  userId: USER_PROFAJ,
  clientIds: [WS_BILTAS],
  isOrgAdmin: true,
  managerAccountId: UST_PROFAJ,
};

/** "Tüm şirketler" modu — `orgId` ev şirketi kalıyor, kapsam ajans geneli. */
const PROFAJ_TUM: Ctx = {
  orgId: ORG_PROFAJ,
  userId: USER_PROFAJ,
  clientIds: [WS_3A, WS_BILTAS],
  isOrgAdmin: true,
  managerAccountId: UST_PROFAJ,
  tumSirketler: true,
};

describe('KRİTİK: MÜŞTERİNİN KENDİ HAVUZU BAŞKA MÜŞTERİYE AÇILMIYOR', () => {
  it('Biltaş’ın içindeyken 3A’nın kendi bağladığı hesap GÖRÜNMÜYOR — ajansınki görünüyor', async () => {
    /*
     * Eski yüklem (`org_id = ANY (app.ajans_org_idleri())`) iki havuzu
     * ayırt etmiyordu: 3A'nın kendi Meta'sı da ajans geneline açılıyordu.
     * İki iddia BİRLİKTE: yalnızca "3A'nınki yok" deseydik, bütün havuzu
     * kapatan bir hata da bu testi geçerdi.
     */
    const gorunen = await adlar('ad_accounts', PROFAJ_BILTAS_ICINDE);
    expect(gorunen).not.toContain('3A HAVUZU');
    expect(gorunen).toContain('PROFAJ HAVUZU');
  });

  it('Biltaş’ın içindeyken 3A’nın bağlantıları GÖRÜNMÜYOR', async () => {
    const gorunen = await asUser<{ account_label: string }>(
      'SELECT account_label FROM platform_connections ORDER BY account_label',
      PROFAJ_BILTAS_ICINDE,
    );
    expect(gorunen.map((r) => r.account_label)).toEqual(['Profaj BM']);
  });

  it('Biltaş’ın içindeyken 3A’nın havuz sayfası GÖRÜNMÜYOR', async () => {
    const gorunen = await adlar('social_profiles', PROFAJ_BILTAS_ICINDE);
    expect(gorunen).not.toContain('3A HAVUZ SAYFASI');
    expect(gorunen).toContain('PROFAJ HAVUZ SAYFASI');
  });

  it('KRİTİK: 3A’nın hesabı Biltaş’a ATANAMIYOR — sıfır satır', async () => {
    /*
     * "Patlamadı" bir RLS testi için yeterli değil: politikası tutmayan bir
     * UPDATE hata vermez, sessizce sıfır satır etkiler (CLAUDE.md). Etkilenen
     * satır RETURNING ile SAYILIYOR.
     */
    const r = await asUser<{ id: string }>(
      `UPDATE ad_accounts SET client_id = '${WS_BILTAS}', org_id = '${ORG_BILTAS}'
        WHERE id = '${ACC_3A_HAVUZ}' RETURNING id`,
      PROFAJ_BILTAS_ICINDE,
    );
    expect(r).toEqual([]);
  });

  it('KRİTİK: 3A’nın bağlantısı Biltaş’tan KOPARILAMIYOR — sıfır satır', async () => {
    const r = await asUser<{ id: string }>(
      `UPDATE platform_connections SET status = 'revoked'
        WHERE id = '${CONN_3A_META}' RETURNING id`,
      PROFAJ_BILTAS_ICINDE,
    );
    expect(r).toEqual([]);
  });

  it('3A’nın İÇİNDEYKEN ajans 3A’nın kendi havuzunu görüyor — kendi şirketine atayabilsin', async () => {
    // Müşterinin kendi bağladığı hesabı ajans da yönetebiliyor, ama YALNIZCA
    // o müşterinin içinde.
    expect(await adlar('ad_accounts', PROFAJ_3A_ICINDE)).toContain('3A HAVUZU');
  });

  it('"TÜM ŞİRKETLER" modunda müşteri havuzu listelenmiyor — ajansınki listeleniyor', async () => {
    /*
     * Modda `org_kapsaminda` bütün şirketleri açıyor; havuz onu kullansaydı
     * atama ekranı her müşterinin kendi hesabını tek listede gösterir ve
     * hedef workspace'i de bütün şirketlerden seçtirirdi.
     */
    const gorunen = await adlar('ad_accounts', PROFAJ_TUM);
    expect(gorunen).not.toContain('3A HAVUZU');
    expect(gorunen).toContain('PROFAJ HAVUZU');
  });
});

describe('KRİTİK: AJANS BİLİNMİYORSA HAVUZ KAPALI DÜŞÜYOR', () => {
  it('ajans_org_id boşken Biltaş’tan ajans havuzu görünmüyor', async () => {
    /*
     * Açık düşmek, eksik bir veriyi sızıntıya çevirirdi. Kolon yeni ve
     * doldurma bir sorguya dayanıyor; boş kalan bir hesapta davranış
     * "havuz yalnızca kendi şirketinde" olmalı.
     */
    await h.q(`UPDATE manager_accounts SET ajans_org_id = NULL WHERE id = $1`, [UST_PROFAJ]);
    try {
      expect(await adlar('ad_accounts', PROFAJ_BILTAS_ICINDE)).not.toContain('PROFAJ HAVUZU');
      // Ajansın kendi şirketinde havuzu hâlâ görüyor: kapanan yalnızca paylaşım.
      expect(await adlar('ad_accounts', ADMIN_PROFAJ)).toContain('PROFAJ HAVUZU');
    } finally {
      await h.q(`UPDATE manager_accounts SET ajans_org_id = $1 WHERE id = $2`, [ORG_PROFAJ, UST_PROFAJ]);
    }
  });
});

describe('ajans_org_id — veritabanı kısıtları', () => {
  it('KRİTİK: başka üst hesabın şirketi ajans olarak YAZILAMIYOR', async () => {
    /*
     * Basit yabancı anahtar yalnızca şirketin VAR olduğunu söylerdi. Başka
     * bir üst hesabın şirketini buraya yazmak, onun havuzunu bu hesabın
     * bütün şirketlerine açardı. Kompozit anahtar ikisini birlikte istiyor.
     */
    const YABANCI_UST = 'bbbb0000-0000-0000-0000-0000000000bb';
    const YABANCI_ORG = '44444444-4444-4444-4444-444444444444';
    await h.q(
      `INSERT INTO manager_accounts (id, name, slug, status, updated_at)
       VALUES ($1, 'Başka Ajans', 'baska', 'active', now())`,
      [YABANCI_UST],
    );
    await h.q(
      `INSERT INTO organizations (id, name, slug, status, manager_account_id, updated_at)
       VALUES ($1, 'Başka', 'baska-org', 'active', $2, now())`,
      [YABANCI_ORG, YABANCI_UST],
    );
    await expect(
      h.q(`UPDATE manager_accounts SET ajans_org_id = $1 WHERE id = $2`, [YABANCI_ORG, UST_PROFAJ]),
    ).rejects.toThrow(/manager_accounts_ajans_org_ayni_hesap_fkey/);
  });

  it('KRİTİK: ajans şirketi başka üst hesaba TAŞINAMIYOR', async () => {
    // Taşınabilseydi eski hesap havuzunu sessizce kaybeder, yeni hesap ise
    // başka birinin ajansının havuzunu görürdü.
    const YABANCI_UST = 'bbbb0000-0000-0000-0000-0000000000bb';
    await expect(
      h.q(`UPDATE organizations SET manager_account_id = $1 WHERE id = $2`, [YABANCI_UST, ORG_PROFAJ]),
    ).rejects.toThrow(/manager_accounts_ajans_org_ayni_hesap_fkey/);
  });
});
