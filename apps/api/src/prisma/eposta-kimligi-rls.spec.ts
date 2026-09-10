import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * ═══ E-POSTA KİMLİĞİ KİŞİYE AİT, ŞİRKETE DEĞİL ═══
 *
 * `user_email_accounts` politikaları `app.org_kapsaminda(org_id) AND
 * user_id = app.current_user_id()` idi ve SATIRI SAHİBİNDEN GİZLİYORDU:
 * satır oluşturulduğu şirkette duruyor, kullanıcı başka bir şirkete
 * geçtiğinde `org_kapsaminda` tutmuyor.
 *
 * Belirtisi kullanıcıdan birebir şöyle geldi: "e-posta ayarları ajans
 * kısmında sorun yaratmıyor fakat şirkete geçiş yaptığımda hata alıyorum".
 * Zinciri:
 *
 *   1. `SELECT` boş dönüyor → panel BOŞ form gösteriyor.
 *   2. "Kaydet" `mevcut.length === 0` görüp INSERT dalına giriyor.
 *   3. `user_id` TEKİL → benzersizlik ihlali.
 *   4. Ham SQL hatası eşlenmemiş dala düşüyor → "Beklenmeyen bir hata oluştu".
 *
 * Dördüncü adım ayrıca düzeltildi (`all-exceptions.filter.ts`), ama KÖK
 * SEBEP burada: kimlik kişiye ait ve `org_id` bir erişim sınırı değil.
 *
 * PAKET RLS'İ AÇIYOR. `pglite-harness` politikaları kurduktan sonra RLS'i
 * kapatıyor (worker BYPASSRLS ile bağlanıyor); `SET ROLE` ile sahibi
 * olmayan bir role geçmek politikanın kendisini sınamaya yetiyor.
 */
let h: Harness;

const ORG_AJANS = '11111111-1111-1111-1111-111111111111';
const ORG_SIRKET = '22222222-2222-2222-2222-222222222222';
const ORG_YABANCI = '33333333-3333-3333-3333-333333333333';

const DANISMAN = 'aaaa0000-0000-0000-0000-00000000000a';
const BASKASI = 'bbbb0000-0000-0000-0000-00000000000b';
/**
 * HİÇ SATIRI OLMAYAN üçüncü kullanıcı.
 *
 * Sadece `DANISMAN` adına INSERT denemek YETMİYOR: onun satırı zaten var ve
 * `user_id` TEKİL, yani istek `WITH CHECK` gevşetilse bile benzersizlik
 * ihlaliyle düşerdi. Test geçer ama YANLIŞ SEBEPLE — mutasyonda yakalandı.
 */
const UCUNCU = 'dddd0000-0000-0000-0000-00000000000d';

const APP_ROLE = 'advetics_eposta_rls_test';

interface Ctx {
  orgId: string;
  userId: string;
}

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  await h.q(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${APP_ROLE}`);
  await h.q(`ALTER TABLE user_email_accounts ENABLE ROW LEVEL SECURITY`);

  await h.q(`
    INSERT INTO organizations (id, name, slug, plan, status, created_at, updated_at) VALUES
      ('${ORG_AJANS}',   'Ajans',    'ajans',    'starter', 'active', now(), now()),
      ('${ORG_SIRKET}',  '3A Makina','3a-makina','starter', 'active', now(), now()),
      ('${ORG_YABANCI}', 'Yabancı',  'yabanci',  'starter', 'active', now(), now())
  `);
  await h.q(`
    INSERT INTO users (id, org_id, email, full_name, password_hash, locale, status, created_at, updated_at) VALUES
      ('${DANISMAN}', '${ORG_AJANS}',   'danisman@x.com', 'Danışman', 'h', 'tr', 'active', now(), now()),
      ('${BASKASI}',  '${ORG_YABANCI}', 'baskasi@x.com',  'Başkası',  'h', 'tr', 'active', now(), now()),
      ('${UCUNCU}',   '${ORG_AJANS}',   'ucuncu@x.com',   'Üçüncü',   'h', 'tr', 'active', now(), now())
  `);

  /*
   * SATIR AJANS ŞİRKETİNDE OLUŞTURULUYOR — üretimdeki hâlin aynısı.
   * Danışman kimliğini ajanstayken kurdu; sonra şirkete geçiyor.
   */
  await h.q(`
    INSERT INTO user_email_accounts
      (id, org_id, user_id, from_name, from_email, smtp_host, smtp_port, smtp_secure,
       smtp_user, smtp_pass_enc, key_version, created_at, updated_at)
    VALUES (gen_random_uuid(), '${ORG_AJANS}', '${DANISMAN}', 'Advetics', 'hello@profaj.com',
            'smtp.gmail.com', 465, true, 'hello@profaj.com', '\\x00', 1, now(), now())
  `);
});

afterAll(async () => h.close());

async function asUser<T = Record<string, unknown>>(sql: string, ctx: Ctx): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id',  '${ctx.orgId}',  false),
           set_config('app.current_user_id', '${ctx.userId}', false),
           set_config('app.is_org_admin',    'on',            false),
           set_config('app.tum_sirketler',   'off',           false)
  `);
  await h.q(`SET ROLE ${APP_ROLE}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

const AJANSTA: Ctx = { orgId: ORG_AJANS, userId: DANISMAN };
const SIRKETTE: Ctx = { orgId: ORG_SIRKET, userId: DANISMAN };
const YABANCI: Ctx = { orgId: ORG_AJANS, userId: BASKASI };

describe('tarama boşa düşmüyor', () => {
  it('RLS gerçekten AÇIK — kapalıyken bütün iddialar boşa geçerdi', async () => {
    const [row] = await h.q<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'user_email_accounts'`,
    );
    expect(row?.relrowsecurity).toBe(true);
  });
});

describe('KRİTİK: sahibi her şirkette görüyor', () => {
  it('AJANSTA görünüyor — bugün de çalışan hâl', async () => {
    const rows = await asUser(`SELECT id FROM user_email_accounts`, AJANSTA);
    expect(rows).toHaveLength(1);
  });

  it('KRİTİK: BAŞKA ŞİRKETE geçince de görünüyor', async () => {
    /*
     * Bozuk hâlde burası SIFIR satır dönüyordu ve panel boş form
     * gösteriyordu — hata değil, "ayarın yok" gibi. Asıl arıza kaydetme
     * anında çıkıyordu.
     */
    const rows = await asUser(`SELECT id FROM user_email_accounts`, SIRKETTE);
    expect(rows).toHaveLength(1);
  });

  it('KRİTİK: BAŞKA ŞİRKETTEYKEN GÜNCELLENEBİLİYOR', async () => {
    /*
     * `UPDATE` sonrası yeni satır SELECT politikasından da geçmek zorunda.
     * Org yüklemi dursaydı burası sıfır satır etkilerdi — ve sıfır satırlık
     * bir UPDATE politikadan bağımsız olarak BAŞARILI dönüyor, yani
     * `RETURNING` ile SAYMAK şart.
     */
    const rows = await asUser<{ id: string }>(
      `UPDATE user_email_accounts SET from_name = 'Yeni' WHERE user_id = '${DANISMAN}' RETURNING id`,
      SIRKETTE,
    );
    expect(rows).toHaveLength(1);
  });
});

describe('KRİTİK: kapsam DARALDI, genişlemedi', () => {
  it('BAŞKA KULLANICI satırı GÖREMİYOR — aynı şirkette bile', async () => {
    /*
     * Satır kullanıcının uygulama parolasını (şifreli) taşıyor ve onu
     * okuyabilmek, o hesabın adına mail gönderebilmek demek. Org yöneticisi
     * bile göremiyor ve bu kural DEĞİŞMEDİ.
     */
    const rows = await asUser(`SELECT id FROM user_email_accounts`, YABANCI);
    expect(rows).toHaveLength(0);
  });

  it('BAŞKA KULLANICI GÜNCELLEYEMİYOR', async () => {
    const rows = await asUser<{ id: string }>(
      `UPDATE user_email_accounts SET from_name = 'Ele geçirildi' RETURNING id`,
      YABANCI,
    );
    expect(rows).toHaveLength(0);
  });

  it('KRİTİK: BAŞKASININ ADINA SATIR AÇILAMIYOR', async () => {
    /*
     * `WITH CHECK` yüklemi: `user_id = app.current_user_id()`.
     *
     * HEDEF `UCUNCU` — `DANISMAN` DEĞİL. İlk yazımda `DANISMAN` adına
     * deneniyordu ve onun satırı ZATEN VAR: `user_id` tekil olduğu için
     * istek, `WITH CHECK` tamamen kaldırılsa BİLE benzersizlik ihlaliyle
     * düşüyordu. Test geçiyordu ama politikaya hiç dokunmuyordu —
     * mutasyonda (WITH CHECK → `true`) yakalandı.
     */
    await expect(
      asUser(
        `INSERT INTO user_email_accounts
           (id, org_id, user_id, from_name, from_email, smtp_host, smtp_port, smtp_secure,
            smtp_user, smtp_pass_enc, key_version, created_at, updated_at)
         VALUES (gen_random_uuid(), '${ORG_AJANS}', '${UCUNCU}', 'Sahte', 's@x.com',
                 'smtp.x.com', 465, true, 's@x.com', '\\x00', 1, now(), now())`,
        YABANCI,
      ),
    ).rejects.toThrow();
  });

  it('BOŞA DÜŞME BEKÇİSİ: aynı INSERT SAHİBİ tarafından ÇALIŞIYOR', async () => {
    /*
     * Yukarıdaki iddia "her INSERT reddediliyor" ile de geçerdi. Aynı
     * satırı kendi sahibi yazabiliyorsa, reddin sebebi politika demektir.
     */
    const rows = await asUser<{ id: string }>(
      `INSERT INTO user_email_accounts
         (id, org_id, user_id, from_name, from_email, smtp_host, smtp_port, smtp_secure,
          smtp_user, smtp_pass_enc, key_version, created_at, updated_at)
       VALUES (gen_random_uuid(), '${ORG_SIRKET}', '${UCUNCU}', 'Kendi', 'u@x.com',
               'smtp.x.com', 465, true, 'u@x.com', '\\x00', 1, now(), now())
       RETURNING id`,
      { orgId: ORG_AJANS, userId: UCUNCU },
    );
    expect(rows).toHaveLength(1);
  });
});
