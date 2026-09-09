import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * ═══ BİR KULLANICI BİRDEN ÇOK ŞİRKETTE ORG GENELİ OLABİLİR ═══
 *
 * `memberships_user_org_scope_uniq` kısmi tekil indeksi yalnızca
 * `(user_id)` taşıyordu: bir kullanıcı HAYATI BOYUNCA tek bir org geneli
 * üyeliğe sahip olabiliyordu. "Bir kullanıcı = bir organizasyon"
 * dünyasında doğruydu; üst hesap (MCC) katmanıyla çürüdü — danışman
 * altındaki HER şirkette org geneli yetkili olmak zorunda.
 *
 * CANLIDA GÖRÜLDÜ VE BELİRTİSİ HİÇ AÇIKLAYICI DEĞİLDİ: "Şirket ekle" ne
 * yazılırsa yazılsın "Bu kayıt zaten mevcut" diyordu. Hata yeni şirketten
 * değil, kullanıcının BAŞKA bir şirketteki üyeliğinden geliyordu ve
 * ekranda o bilgiye götüren hiçbir iz yoktu.
 *
 * İNDEKS `01_constraints.sql`DE, Prisma migration'ında DEĞİL — yani
 * `prisma migrate deploy` bunu uygulamıyor, `db:rls` uyguluyor.
 */
let h: Harness;

const UST = 'a0000000-0000-0000-0000-00000000000a';
const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';
const USER = '99999999-9999-9999-9999-999999999999';
const WS_A = 'aaaa1111-1111-1111-1111-111111111111';

beforeAll(async () => {
  h = await createHarness();
  await h.q(`
    INSERT INTO manager_accounts (id, name, slug, status, created_at, updated_at)
    VALUES ('${UST}', 'Danışmanlık', 'dan', 'active', now(), now())
  `);
  await h.q(`
    INSERT INTO organizations (id, name, slug, plan, status, manager_account_id, created_at, updated_at) VALUES
      ('${ORG_A}', 'A', 'a', 'starter', 'active', '${UST}', now(), now()),
      ('${ORG_B}', 'B', 'b', 'starter', 'active', '${UST}', now(), now())
  `);
  await h.q(`
    INSERT INTO users (id, org_id, email, full_name, password_hash, locale, status, created_at, updated_at)
    VALUES ('${USER}', '${ORG_A}', 'u@x.com', 'U', 'h', 'tr', 'active', now(), now())
  `);
  await h.q(`
    INSERT INTO clients (id, org_id, name, slug, timezone, reporting_currency, status, contact_emails, created_at, updated_at)
    VALUES ('${WS_A}', '${ORG_A}', 'A WS', 'a-ws', 'Europe/Istanbul', 'TRY', 'active', '{}', now(), now())
  `);
});

afterAll(async () => {
  await h.close();
});

async function uyelikYaz(orgId: string, clientId: string | null) {
  return h.q(
    `INSERT INTO memberships (id, user_id, org_id, client_id, role, created_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'owner', now(), now())`,
    [USER, orgId, clientId],
  );
}

describe('org geneli üyelik tekilliği', () => {
  it('BOŞA DÜŞME BEKÇİSİ: indeks GERÇEKTEN kurulu', async () => {
    /*
     * `01_constraints.sql` uygulanmasaydı aşağıdaki "reddediliyor" testi
     * de "kabul ediliyor" testi de geçerdi ve paket hiçbir şey ölçmezdi.
     */
    const rows = await h.q<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes
       WHERE tablename = 'memberships' AND indexname LIKE '%org_scope%'`,
    );
    expect(rows.map((r) => r.indexname)).toEqual(['memberships_org_scope_uniq']);
  });

  it('KRİTİK: ESKİ indeks düşürülmüş — aynı adla yeniden kurulmuyor', async () => {
    /*
     * Aynı adla `CREATE ... IF NOT EXISTS` yazmak, TANIMI DEĞİŞMİŞ bir
     * indeksi SESSİZCE ATLAR ve düzeltme hiç uygulanmazdı. Adın değişmesi
     * bu yüzden kararın parçası.
     */
    const rows = await h.q<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_indexes
       WHERE indexname = 'memberships_user_org_scope_uniq'`,
    );
    expect(rows[0]?.n).toBe('0');
  });

  it('KRİTİK: AYNI kullanıcı İKİ ŞİRKETTE org geneli olabiliyor', async () => {
    // Kullanıcının bildirdiği hata: ikinci şirket açılırken bu satır
    // yazılamıyordu ve ekranda "Bu kayıt zaten mevcut" görünüyordu.
    await uyelikYaz(ORG_A, null);
    await expect(uyelikYaz(ORG_B, null)).resolves.toBeDefined();

    const rows = await h.q<{ n: string }>(
      `SELECT count(*)::text AS n FROM memberships WHERE user_id = '${USER}' AND client_id IS NULL`,
    );
    expect(rows[0]?.n).toBe('2');
  });

  it('KRİTİK: AYNI ŞİRKETTE ikinci org geneli üyelik hâlâ REDDEDİLİYOR', async () => {
    /*
     * Genişletilen her kısıt iki yönde de ölçülmek zorunda: indeksin var
     * oluş sebebi (bir kullanıcıya aynı org'da iki kez org geneli yetki
     * verilmesin) korunuyor mu.
     */
    await expect(uyelikYaz(ORG_A, null)).rejects.toThrow();
  });

  it('workspace bazlı üyelik bu indeksten etkilenmiyor', async () => {
    // Kısmi indeks yalnızca `client_id IS NULL` satırları kapsıyor.
    await expect(uyelikYaz(ORG_A, WS_A)).resolves.toBeDefined();
  });
});
