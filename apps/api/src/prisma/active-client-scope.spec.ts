import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * AKTİF MÜŞTERİ DARALTMASI — `app.can_access_client` davranışı.
 *
 * NEDEN BU TEST ÖZEL: koşum ortamı politikaları kurduktan sonra RLS
 * ZORLAMASINI KAPATIYOR (worker rolünün BYPASSRLS'ini taklit etmek için), yani
 * normal testler bir RLS boşluğunu yakalayamıyor. Ama `DISABLE ROW LEVEL
 * SECURITY` yalnızca politikaların UYGULANMASINI durduruyor; `02_rls.sql`
 * içindeki FONKSİYONLAR veritabanında duruyor ve doğrudan çağrılabiliyor.
 * Bu paket tam olarak bunu yapıyor — kararın kendisini sınıyor.
 *
 * NE DÜZELTİLDİ: org yöneticisi panelde Çiftçi Grup'u seçmesine rağmen
 * Mirnas'ın kampanyalarını görüyordu. Seçim hesaplanıyor ve oturum bağlamında
 * duruyordu ama hiçbir yerde kullanılmıyordu; metrik sorgusunda da client
 * süzgeci yoktu. Ayrım tamamen bu fonksiyona bırakılmıştı ve fonksiyon
 * yöneticiye "hepsini görebilirsin" diyordu.
 *
 * Testin kilitlediği asıl kural, düzeltmenin YANLIŞ yapılabileceği yerde:
 * seçim yalnızca DARALTMALI. Erişemediğin bir müşteriyi seçmek sana o
 * müşteriyi AÇMAMALI — aksi hâlde müşteri seçici bir yetki yükseltme aracına
 * dönerdi.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLIENT_C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

beforeAll(async () => {
  h = await createHarness();
});

afterAll(async () => {
  await h.close();
});

/**
 * Bağlamı kurar.
 *
 * `is_local = false` (oturum ömrü) kullanılıyor: üretimde `true` ve
 * transaction ömürlü, ama burada set etmek ile okumak AYRI sorgular ve
 * transaction ömürlü bir değer ikinci sorguya ulaşmazdı.
 */
async function setContext(opts: {
  clientIds: string[];
  isOrgAdmin: boolean;
  activeClientId?: string | null;
  withContext?: boolean;
}): Promise<void> {
  const hasContext = opts.withContext ?? true;
  await h.q(`
    SELECT
      set_config('app.current_org_id',           '${hasContext ? ORG : ''}', false),
      set_config('app.current_user_id',          '${hasContext ? USER : ''}', false),
      set_config('app.current_client_ids',       '${opts.clientIds.join(',')}', false),
      set_config('app.is_org_admin',             '${opts.isOrgAdmin ? 'on' : 'off'}', false),
      set_config('app.current_active_client_id', '${opts.activeClientId ?? ''}', false)
  `);
}

async function canAccess(target: string): Promise<boolean> {
  const rows = await h.q<{ ok: boolean }>(`SELECT app.can_access_client('${target}') AS ok`);
  return rows[0]!.ok;
}

describe('can_access_client — yetki katmanı (değişmedi)', () => {
  it('org yöneticisi seçim yokken HER müşteriyi görüyor', async () => {
    await setContext({ clientIds: [CLIENT_A], isOrgAdmin: true, activeClientId: null });
    expect(await canAccess(CLIENT_A)).toBe(true);
    // Listesinde olmayan bir müşteri bile: org geneli yetki bunu kapsıyor ve
    // "Tümü" görünümünün çalışması buna bağlı.
    expect(await canAccess(CLIENT_C)).toBe(true);
  });

  it('portföy yöneticisi yalnızca kendi müşterilerini görüyor', async () => {
    await setContext({ clientIds: [CLIENT_A, CLIENT_B], isOrgAdmin: false, activeClientId: null });
    expect(await canAccess(CLIENT_A)).toBe(true);
    expect(await canAccess(CLIENT_B)).toBe(true);
    expect(await canAccess(CLIENT_C)).toBe(false);
  });

  it('bağlam kurulmamışsa hiçbir şey görünmüyor', async () => {
    await setContext({ clientIds: [CLIENT_A], isOrgAdmin: true, withContext: false });
    expect(await canAccess(CLIENT_A)).toBe(false);
  });
});

describe('can_access_client — seçim katmanı (düzeltme)', () => {
  it('ORG YÖNETİCİSİ müşteri seçtiğinde SADECE onu görüyor', async () => {
    // Hatanın ta kendisi: bu senaryoda daha önce ikisi de true dönüyordu ve
    // panel Çiftçi Grup seçiliyken Mirnas'ın kampanyalarını gösteriyordu.
    await setContext({ clientIds: [CLIENT_A, CLIENT_B], isOrgAdmin: true, activeClientId: CLIENT_A });
    expect(await canAccess(CLIENT_A)).toBe(true);
    expect(await canAccess(CLIENT_B)).toBe(false);
  });

  it('portföy yöneticisi seçtiğinde de daralıyor', async () => {
    await setContext({
      clientIds: [CLIENT_A, CLIENT_B],
      isOrgAdmin: false,
      activeClientId: CLIENT_B,
    });
    expect(await canAccess(CLIENT_A)).toBe(false);
    expect(await canAccess(CLIENT_B)).toBe(true);
  });

  it('seçim GENİŞLETMİYOR — erişilemeyen müşteriyi seçmek onu açmıyor', async () => {
    // Düzeltmenin yanlış yapılabileceği tek yer burası. Seçimi tek başına
    // yeterli saymak, müşteri seçicisini bir yetki yükseltme aracına
    // çevirirdi: portföyünde olmayan bir kimliği göndermek yeterdi.
    await setContext({ clientIds: [CLIENT_A], isOrgAdmin: false, activeClientId: CLIENT_C });
    expect(await canAccess(CLIENT_C)).toBe(false);
    // Seçim geçersiz olduğunda erişilebilir müşteri de daralıyor; uygulama
    // katmanı geçersiz seçimi zaten null'a düşürüyor (tenant-context.service).
    expect(await canAccess(CLIENT_A)).toBe(false);
  });

  it('seçim temizlenince org geneli görünüm geri geliyor', async () => {
    await setContext({ clientIds: [CLIENT_A, CLIENT_B], isOrgAdmin: true, activeClientId: CLIENT_A });
    expect(await canAccess(CLIENT_B)).toBe(false);

    // Boş string = seçim yok. Üretimde de böyle gönderiliyor; değişkeni hiç
    // yazmamak yerine açıkça boşaltmak, havuzdan gelen bağlantıda önceki
    // isteğin değerinin kalmasını imkânsız kılıyor.
    await setContext({ clientIds: [CLIENT_A, CLIENT_B], isOrgAdmin: true, activeClientId: null });
    expect(await canAccess(CLIENT_B)).toBe(true);
  });
});
