import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../test/pglite-harness';
import { workspaceTasi } from '../modules/manager-account/workspace-tasima';
import { kullanicilariAyir, sirketBosaltilsinMi } from '../../prisma/workspace-sirket-karari';

/**
 * ═══ HER WORKSPACE'E KENDİ ŞİRKETİ — TOPLU TAŞIMA ═══
 *
 * Bu script üretim verisinde 30 tabloda `org_id` güncelliyor ve geri alma
 * yolu yok. Sınanması gereken üç şey var ve üçü de SESSİZ hata üretiyor:
 *
 *   1. YANLIŞ ŞİRKETİ BOŞALTMAK — zaten düzende olan bir şirketin
 *      workspace'ini alıp ikinci bir kopya şirket açmak.
 *   2. YANLIŞ KULLANICIYI TAŞIMAK — iki workspace'e birden yetkili bir
 *      hesabı ilkinin şirketine atmak; ikinci workspace'teki erişimi
 *      sessizce kayboluyor.
 *   3. KULLANICIYI HİÇ TAŞIMAMAK — müşterinin kendi giriş hesabı ajansta
 *      kalıyor, üyeliği yeni şirkete gidiyor ve hesap GİRİŞTE kilitleniyor.
 *      `TenantContextService` aktif şirketi `users.org_id`den çözüyor,
 *      üyelikleri o şirkete süzüyor ve hiçbiri kalmazsa 401 atıyor.
 *
 * Üçüncüsü GERÇEK VERİYLE sınanıyor: taşıma koşuluyor ve sonrasında
 * kullanıcının `org_id`si ile üyeliğinin `org_id`si KARŞILAŞTIRILIYOR.
 * İkisi ayrışırsa o hesap giriş yapamaz.
 */

describe('sirketBosaltilsinMi', () => {
  it('AJANSIN KENDİ şirketi her zaman boşalıyor — tek workspace’i olsa bile', () => {
    /*
     * Ajans organizasyonu bir kabuk olmalı; içinde müşteri verisi tutması
     * bu ayrımın var olma sebebine aykırı. Koşulu "birden çok workspace"e
     * bağlamak, ajansın tek müşterisi kaldığında onu ajansın içinde
     * bırakırdı.
     */
    expect(sirketBosaltilsinMi(true, 1)).toBe(true);
    expect(sirketBosaltilsinMi(true, 12)).toBe(true);
  });

  it('TEK workspace’i olan normal şirkete DOKUNULMUYOR', () => {
    // Zaten istenen düzende; yeni bir şirket açmak aynı şeyin ikinci
    // kopyasını üretmek olurdu. Script bu sayede TEKRAR ÇALIŞTIRILABİLİR.
    expect(sirketBosaltilsinMi(false, 1)).toBe(false);
  });

  it('BİRDEN ÇOK workspace’i olan şirket boşalıyor', () => {
    expect(sirketBosaltilsinMi(false, 2)).toBe(true);
  });

  it('BOŞ şirket işe girmiyor — açılacak yeni şirket yok', () => {
    expect(sirketBosaltilsinMi(true, 0)).toBe(false);
    expect(sirketBosaltilsinMi(false, 0)).toBe(false);
  });
});

describe('kullanicilariAyir', () => {
  const W = 'ws-1';

  const kullanici = (
    email: string,
    memberships: Array<{ clientId: string | null; role: string }>,
    ustHesap = false,
  ) => ({
    id: email,
    email,
    memberships,
    managerMemberships: ustHesap ? [{ id: 'm1' }] : [],
  });

  it('MÜŞTERİNİN KENDİ HESABI taşınıyor — yoksa girişte kilitlenir', () => {
    const { tasinacak } = kullanicilariAyir(
      [kullanici('musteri@x.com', [{ clientId: W, role: 'client_viewer' }])],
      W,
    );
    expect(tasinacak.map((u) => u.email)).toEqual(['musteri@x.com']);
    expect(tasinacak[0]?.rol).toBe('client_viewer');
  });

  it('KRİTİK: ORG GENELİ üyeliği olan ajans personeli TAŞINMIYOR', () => {
    /*
     * Erişimi kaynak şirkette duruyor ve üst hesap üzerinden yeni şirkete
     * zaten geçebiliyor. Taşımak, ajans çalışanını bir müşteri şirketine
     * hapsetmek olurdu.
     */
    const { tasinacak, kalanRiskli } = kullanicilariAyir(
      [
        kullanici('ajans@profaj.com', [
          { clientId: null, role: 'owner' },
          { clientId: W, role: 'manager' },
        ]),
      ],
      W,
    );
    expect(tasinacak).toEqual([]);
    // Uyarı da ÜRETİLMİYOR: erişimini kaybetmiyor.
    expect(kalanRiskli).toEqual([]);
  });

  it('KRİTİK: ÜST HESABA bağlı kullanıcı TAŞINMIYOR', () => {
    const { tasinacak, kalanRiskli } = kullanicilariAyir(
      [kullanici('sahip@profaj.com', [{ clientId: W, role: 'manager' }], true)],
      W,
    );
    expect(tasinacak).toEqual([]);
    expect(kalanRiskli).toEqual([]);
  });

  it('KRİTİK: İKİ WORKSPACE’E yetkili hesap taşınMIYOR ve UYARI üretiyor', () => {
    /*
     * İki şirkete birden taşınamaz. `some` ile yazılmış bir süzgeç onu
     * ilkinin şirketine atardı ve ikinci workspace'teki erişimi SESSİZCE
     * kaybolurdu — bu gerçek bir belirsizlik ve script onu sessizce
     * çözmemeli.
     */
    const { tasinacak, kalanRiskli } = kullanicilariAyir(
      [
        kullanici('ikili@x.com', [
          { clientId: W, role: 'client_viewer' },
          { clientId: 'ws-2', role: 'client_viewer' },
        ]),
      ],
      W,
    );
    expect(tasinacak).toEqual([]);
    expect(kalanRiskli.map((u) => u.email)).toEqual(['ikili@x.com']);
  });

  it('ÜYELİĞİ OLMAYAN kullanıcı taşınmıyor — boş `every` doğru dönüyor', () => {
    // `[].every(...)` HER ZAMAN true: yüklem tek başına bırakılsaydı hiç
    // üyeliği olmayan bir hesap bu workspace'e taşınırdı.
    const { tasinacak, kalanRiskli } = kullanicilariAyir([kullanici('bos@x.com', [])], W);
    expect(tasinacak).toEqual([]);
    expect(kalanRiskli.map((u) => u.email)).toEqual(['bos@x.com']);
  });
});

// -----------------------------------------------------------------------------
// GERÇEK VERİ — taşımadan sonra kimse kilitlenmiyor
// -----------------------------------------------------------------------------

let h: Harness;

const YENI_ORG = 'e0000000-0000-0000-0000-00000000000e';
const MUSTERI_HESABI = 'f1111111-0000-0000-0000-111111111111';
const AJANS_PERSONELI = 'f2222222-0000-0000-0000-222222222222';
const KAMPANYA = '66666666-6666-6666-6666-666666666666';

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);

  await h.q(
    `INSERT INTO organizations (id, name, slug, updated_at)
     VALUES ($1, 'Workspace A.Ş', 'workspace-as', now())`,
    [YENI_ORG],
  );

  // Müşterinin KENDİ giriş hesabı — yalnızca bu workspace'e bağlı.
  await h.q(
    `INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at)
     VALUES ($1, $2, 'musteri@x.com', 'x', 'Müşteri', now())`,
    [MUSTERI_HESABI, IDS.org],
  );
  await h.q(
    `INSERT INTO memberships (id, user_id, org_id, client_id, role, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'client_viewer', now(), now())`,
    [MUSTERI_HESABI, IDS.org, IDS.client],
  );

  // Ajans personeli — org geneli üyeliği VAR, taşınmamalı.
  await h.q(
    `INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at)
     VALUES ($1, $2, 'ajans@profaj.com', 'x', 'Ajans', now())`,
    [AJANS_PERSONELI, IDS.org],
  );
  await h.q(
    `INSERT INTO memberships (id, user_id, org_id, client_id, role, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, NULL, 'owner', now(), now())`,
    [AJANS_PERSONELI, IDS.org],
  );

  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
     VALUES ($1,$2,$3,'meta','c1','Kampanya','active','daily',now())`,
    [KAMPANYA, IDS.adAccount, IDS.client],
  );
  await h.q(
    `INSERT INTO monthly_budgets
       (id, org_id, client_id, ad_account_id, month, amount_micros, currency, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, NULL, '2026-09-01', 1000000, 'TRY', now(), now())`,
    [IDS.org, IDS.client],
  );
});

/** Scriptin uyguladığı adımların aynısı — tek transaction gerektirmiyor. */
async function tasi(kullaniciIdler: string[]): Promise<void> {
  // Köprü HARNESS'İN KENDİSİNDEN: `workspace-tasima.spec.ts` de aynısını
  // kullanıyor ve elle yazılmış ikinci bir köprü, doğduğu anda ayrışırdı.
  await workspaceTasi({ $executeRaw: (sql) => h.db.$executeRaw(sql) }, IDS.client, IDS.org, YENI_ORG);
  if (kullaniciIdler.length > 0) {
    await h.q(`UPDATE users SET org_id = $1 WHERE id = ANY($2::uuid[])`, [
      YENI_ORG,
      kullaniciIdler,
    ]);
  }
}

describe('taşımadan sonra kimse kilitlenmiyor', () => {
  it('KRİTİK: müşteri hesabının org_id’si ÜYELİĞİYLE aynı şirkete bakıyor', async () => {
    /*
     * KİLİTLENMENİN TANIMI BU. `TenantContextService` aktif şirketi
     * `users.org_id`den çözüyor ve üyelikleri o şirkete süzüyor; ikisi
     * ayrışırsa süzgeç boş kalıyor ve giriş 401 ile düşüyor.
     */
    await tasi([MUSTERI_HESABI]);

    const [satir] = await h.q<{ user_org: string; uyelik_org: string }>(
      `SELECT u.org_id AS user_org, m.org_id AS uyelik_org
         FROM users u JOIN memberships m ON m.user_id = u.id
        WHERE u.id = $1`,
      [MUSTERI_HESABI],
    );
    expect(satir?.user_org).toBe(YENI_ORG);
    expect(satir?.uyelik_org).toBe(YENI_ORG);
  });

  it('KRİTİK: kullanıcı TAŞINMAZSA ayrışma OLUŞUYOR — testin dayanağı', async () => {
    /*
     * Bu test yukarıdakinin BOŞA DÜŞMEDİĞİNİ kanıtlıyor: kullanıcıyı
     * taşımayan bir koşumda `users.org_id` ile üyeliğin `org_id`si
     * gerçekten ayrışıyor. Ayrışma imkânsız olsaydı yukarıdaki iddia
     * hiçbir şey tutmuyor olurdu.
     */
    await tasi([]);

    const [satir] = await h.q<{ user_org: string; uyelik_org: string }>(
      `SELECT u.org_id AS user_org, m.org_id AS uyelik_org
         FROM users u JOIN memberships m ON m.user_id = u.id
        WHERE u.id = $1`,
      [MUSTERI_HESABI],
    );
    expect(satir?.user_org).toBe(IDS.org);
    expect(satir?.uyelik_org).toBe(YENI_ORG);
    expect(satir?.user_org).not.toBe(satir?.uyelik_org);
  });

  it('AJANS PERSONELİ kaynak şirkette kalıyor ve org geneli üyeliği DE kalıyor', async () => {
    // Org geneli üyelik `client_id IS NULL` taşıyor; `workspaceTasi`
    // yalnızca bu workspace'e bağlı satırları güncelliyor.
    await tasi([MUSTERI_HESABI]);

    const [satir] = await h.q<{ user_org: string; uyelik_org: string }>(
      `SELECT u.org_id AS user_org, m.org_id AS uyelik_org
         FROM users u JOIN memberships m ON m.user_id = u.id
        WHERE u.id = $1 AND m.client_id IS NULL`,
      [AJANS_PERSONELI],
    );
    expect(satir?.user_org).toBe(IDS.org);
    expect(satir?.uyelik_org).toBe(IDS.org);
  });

  it('KRİTİK: workspace verisi de taşınıyor — bütçe ve reklam hesabı', async () => {
    /*
     * "Taşıdım ama içi boş" hâli: yalnızca `clients.org_id` güncellenseydi
     * bütçe, kural ve raporlar eski şirkette kalır ve RLS onları yeni
     * şirkete AÇMAZDI. Reklam hesabı ise kompozit yabancı anahtarla
     * (`ON UPDATE CASCADE`) POSTGRES tarafından taşınıyor — o yolun da
     * gerçekten işlediği burada görülüyor.
     */
    await tasi([MUSTERI_HESABI]);

    const [client] = await h.q<{ org_id: string }>(`SELECT org_id FROM clients WHERE id = $1`, [
      IDS.client,
    ]);
    const [butce] = await h.q<{ org_id: string }>(
      `SELECT org_id FROM monthly_budgets WHERE client_id = $1`,
      [IDS.client],
    );
    const [hesap] = await h.q<{ org_id: string }>(
      `SELECT org_id FROM ad_accounts WHERE id = $1`,
      [IDS.adAccount],
    );

    expect(client?.org_id).toBe(YENI_ORG);
    expect(butce?.org_id).toBe(YENI_ORG);
    expect(hesap?.org_id).toBe(YENI_ORG);
  });
});

// -----------------------------------------------------------------------------
// SCRIPTİN KENDİSİ — kaynak taraması
// -----------------------------------------------------------------------------

describe('script güvenceleri', () => {
  const KAYNAK = readFileSync(resolve(__dirname, '..', '..', 'prisma', 'workspace-basina-sirket.ts'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('BOŞA DÜŞME BEKÇİSİ: kaynak okundu', () => {
    expect(KAYNAK.length).toBeGreaterThan(1000);
  });

  it('KRİTİK: VARSAYILAN KURU ÇALIŞMA — `--apply` olmadan yazma yok', () => {
    /*
     * Geri dönüşü olmayan bir işlemin yanlışlıkla çalışması, bu projede
     * kabul edilebilecek en pahalı hata. `reset-clients.ts` ile aynı kural.
     */
    expect(KAYNAK).toContain("const APPLY = ARGV.includes('--apply')");
    expect(KAYNAK).toContain('if (!APPLY) {');
  });

  it('KRİTİK: WORKSPACE BAŞINA TEK transaction', () => {
    // Hepsini tek transaction'a koymak, kırkıncıda düşen bir taşımanın otuz
    // dokuz başarılıyı da geri alması demekti.
    const bas = KAYNAK.indexOf('for (const p of planlar)');
    expect(bas).toBeGreaterThan(-1);
    expect(KAYNAK.slice(bas)).toContain('prisma.$transaction(');
  });

  it('KRİTİK: transaction zaman aşımı BÜYÜTÜLMÜŞ', () => {
    // Varsayılan 5 saniye: 30 tabloda UPDATE ve büyük bir workspace'te
    // `leads` tek başına on binlerce satır.
    expect(KAYNAK).toContain('timeout: 120_000');
  });

  it('KRİTİK: bir hata döngüyü KESMİYOR', () => {
    // Kesseydi listenin kuyruğu hiç denenmemiş olur ve kullanıcı tekrar
    // denerken ilk onda çakışma yerdi.
    const bas = KAYNAK.indexOf('for (const p of planlar)');
    expect(KAYNAK.slice(bas)).toContain('} catch (e) {');
    expect(KAYNAK.slice(bas)).toContain('hatalar.push(');
  });

  it('KRİTİK: kullanıcılar taşımadan SONRA güncelleniyor', () => {
    const bas = KAYNAK.indexOf('workspaceTasi(');
    const son = KAYNAK.indexOf('auditLog.create');
    expect(bas).toBeGreaterThan(-1);
    expect(son).toBeGreaterThan(bas);
    expect(KAYNAK.slice(bas, son)).toContain('tx.user.updateMany');
  });

  it('KRİTİK: üst hesap üyeliği ORG GENELİ role süzülüyor', () => {
    /*
     * `memberships` üzerindeki CHECK kısıtı `client_id IS NOT NULL OR
     * role <> 'client_viewer'` diyor: org geneli bir `client_viewer` satırı
     * veritabanı tarafından reddedilir ve o workspace'in TAMAMI geri
     * alınırdı — kırk taşımanın ortasında anlaşılmaz bir hata.
     *
     * Süzgeç `isOrgScopedRole`tan okunuyor, rol adları KOPYALANMIYOR.
     */
    expect(KAYNAK).toContain('.filter((u) => isOrgScopedRole(u.role))');
  });

  it('KRİTİK: taşıma DENETİM KAYDINA yazılıyor', () => {
    // 30 tabloya dokunan bir iş iz bırakmalı: hangi workspace nereye gitti
    // ve hangi kullanıcılar taşındı.
    expect(KAYNAK).toContain("action: 'manager_account.workspace_moved'");
  });
});
