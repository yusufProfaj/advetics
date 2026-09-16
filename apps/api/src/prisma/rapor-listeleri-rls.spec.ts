import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * ═══ KURULAN PLAN VE YÜKLENEN FATURA LİSTEDE GÖRÜNMÜYORDU ═══
 *
 * Kullanıcının bildirdiği hâl: planlamayı kuruyor, "Kurulu planlama yok"
 * yazmaya devam ediyor; faturayı yüklüyor, "yüklenmiş fatura yok" yazıyor ama
 * AYNI dosyayı tekrar yüklemeye kalkınca "bu zaten yüklü" diyor.
 *
 * O ikinci cümle teşhisin anahtarı: mükerrer engeli TABLO seviyesinde bir
 * tekil indeks ve indeks RLS'e TABİ DEĞİL. Yani satır yazılmış, kullanıcının
 * SELECT'i onu görmüyor.
 *
 * ═══ SEBEP: RLS'Lİ BİR TABLOYA YAPILAN INNER JOIN ANA SATIRI SÜZÜYOR ═══
 *
 * Her iki listede de `JOIN users u` vardı (planı kuranın / faturayı
 * yükleyenin adı için). `users` politikası KASITLI OLARAK DAR:
 *
 *   org_kapsaminda(org_id) AND (is_org_admin() OR id = current_user_id())
 *
 * `org_kapsaminda` normal modda `org_id = current_org_id()` demek. Ajans
 * yöneticisi KARDEŞ bir şirkete geçtiğinde `ctx.orgId` o şirket oluyor ama
 * `users.org_id` EV şirketi olarak kalıyor (`tenant-context.service.ts`
 * bunu bilerek ayırıyor: okuma kapsamı genişliyor, yazma tek şirkete çivili).
 * Sonuç: kullanıcının KENDİ satırı bile görünmez oluyor ve INNER JOIN
 * plan/fatura satırlarının TAMAMINI eliyor.
 *
 * Hiçbir hata yok, hiçbir log yok — yalnızca boş bir liste.
 */
let h: Harness;

const ORG_EV = '11111111-1111-1111-1111-111111111111';
const ORG_KARDES = '22222222-2222-2222-2222-222222222222';
const UST_HESAP = '33333333-3333-3333-3333-333333333333';
const USER = '44444444-4444-4444-4444-444444444444';
const CLIENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PLAN = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const FATURA = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const APP_ROLE = 'advetics_rapor_rls_test';

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  for (const t of ['users', 'clients', 'report_schedules', 'fatura_belgeleri']) {
    await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  }
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await h.q(
    `INSERT INTO manager_accounts (id, name, slug, updated_at)
     VALUES ($1, 'Profaj', 'profaj', now())`,
    [UST_HESAP],
  );
  // İKİ ŞİRKET, TEK ÜST HESAP: ajansın kendi şirketi ve altındaki bir şirket.
  await h.q(
    `INSERT INTO organizations (id, name, slug, manager_account_id, updated_at)
     VALUES ($1, 'Ajans', 'ajans', $3, now()), ($2, 'Kardeş Şirket', 'kardes', $3, now())`,
    [ORG_EV, ORG_KARDES, UST_HESAP],
  );
  // KULLANICI EV ŞİRKETİNDE. Kardeş şirkete geçtiğinde satırı taşınmıyor.
  await h.q(
    `INSERT INTO users (id, org_id, email, full_name, updated_at)
     VALUES ($1, $2, 'hello@profaj.com', 'Sahip', now())`,
    [USER, ORG_EV],
  );
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $2, 'Workspace', 'workspace', now())`,
    [CLIENT, ORG_KARDES],
  );
  await h.q(
    `INSERT INTO report_schedules
       (id, org_id, client_id, created_by_user_id, frequency, day_of_week, hour,
        range_key, to_emails, next_run_at, updated_at)
     VALUES ($1, $2, $3, $4, 'weekly', 1, 9, '7g', '{}', now(), now())`,
    [PLAN, ORG_KARDES, CLIENT, USER],
  );
  await h.q(
    `INSERT INTO fatura_belgeleri
       (id, org_id, client_id, platform, donem, file_name, storage_key, byte_size,
        mime_type, dosya_hash, uploaded_by_user_id, uploaded_at)
     VALUES ($1, $2, $3, 'meta', '2026-08', 'fatura.pdf', 'k/1', 1234,
             'application/pdf', 'abc', $4, now())`,
    [FATURA, ORG_KARDES, CLIENT, USER],
  );
});

/** Kardeş şirket seçili ajans yöneticisi — kullanıcının bildirdiği durum. */
async function kardesSirkette<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id',           '${ORG_KARDES}', false),
           set_config('app.current_user_id',          '${USER}', false),
           set_config('app.current_client_ids',       '${CLIENT}', false),
           set_config('app.is_org_admin',             'on', false),
           set_config('app.current_active_client_id', '${CLIENT}', false),
           set_config('app.tum_sirketler',            'off', false)
  `);
  await h.q(`SET ROLE ${APP_ROLE}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

/**
 * SERVİSİN KENDİ SORGUSUNU ÇIKARIR VE ÇALIŞTIRIR.
 *
 * Sorguyu teste KOPYALAMAK burada işe yaramaz: kopya düzeltilmiş hâli
 * taşırdı ve servis eski hâlinde kalsa bile test yeşil geçerdi. Çalıştırılan
 * şey ŞU AN GÖNDERİLEN SQL olmak zorunda.
 */
function servisSorgusu(dosya: string, tablo: string): string {
  const kaynak = readFileSync(join(__dirname, '..', 'modules', 'reports', dosya), 'utf8');
  const bas = kaynak.indexOf('async listele');
  if (bas === -1) throw new Error(`${dosya}: listele bulunamadı — tarama boşa düştü`);
  const im = 'Prisma.sql`';
  const sqlBas = kaynak.indexOf(im, bas);
  if (sqlBas === -1) throw new Error(`${dosya}: sorgu bulunamadı — tarama boşa düştü`);
  const sqlSon = kaynak.indexOf('`', sqlBas + im.length);
  const sql = kaynak.slice(sqlBas + im.length, sqlSon);
  if (!sql.includes(tablo)) throw new Error(`${dosya}: yanlış sorgu yakalandı`);
  // Tek bağlı parametre var; testte düz değer geçiyoruz.
  return sql.replaceAll('${clientId}', `'${CLIENT}'`);
}

describe('REGRESYON: servisin GERÇEK sorgusu satırı getiriyor', () => {
  it('KRİTİK: kurulan plan kardeş şirkette LİSTEDE', async () => {
    /*
     * Kullanıcının bildirdiği hâl: "planladığımda planlanan bilgiler
     * gözükmüyor". Satır tabloda duruyordu; onu `users` join'i eliyordu.
     */
    const rows = await kardesSirkette(servisSorgusu('rapor-plani.service.ts', 'report_schedules'));
    expect(rows, 'plan listesi boş döndü — join yine süzüyor').toHaveLength(1);
  });

  it('KRİTİK: yüklenen fatura kardeş şirkette LİSTEDE', async () => {
    /*
     * "fatura eklediğimde eklenen fatura gözükmüyor, tekrar eklemeye
     * çalıştığımda bu zaten yüklü diyor."
     */
    const rows = await kardesSirkette(servisSorgusu('fatura.service.ts', 'fatura_belgeleri'));
    expect(rows, 'fatura listesi boş döndü — join yine süzüyor').toHaveLength(1);
  });

  it('KRİTİK: görünmeyen kullanıcı satırı ADI BOŞ bırakıyor, satırı DÜŞÜRMÜYOR', async () => {
    // LEFT JOIN'in bedeli bu ve kabul edilen bedel: ad okunamıyor ama fatura
    // görünüyor. Ters tercih, satırın tamamen kaybolması demekti.
    const rows = await kardesSirkette<{ uploaded_by_name: string | null }>(
      servisSorgusu('fatura.service.ts', 'fatura_belgeleri'),
    );
    expect(rows[0]?.uploaded_by_name ?? null).toBeNull();
  });

  it('KRİTİK: BAŞKASININ planında gönderen hazırlığı "bilinmiyor"', async () => {
    /*
     * E-posta kimliği satırını RLS yalnızca sahibine gösteriyor. Eski ifade
     * bunu `false` okuyup ÇALIŞAN bir planı "çalışmayacak" diye
     * işaretliyordu; yanlış alarm kullanıcıyı sağlam kurulumu bozmaya
     * gönderir.
     */
    const baskasi = '55555555-5555-5555-5555-555555555555';
    await h.q(
      `INSERT INTO users (id, org_id, email, full_name, updated_at)
       VALUES ($1, $2, 'danisman@profaj.com', 'Danışman', now())`,
      [baskasi, ORG_EV],
    );
    await h.q(`UPDATE report_schedules SET created_by_user_id = $1 WHERE id = $2`, [
      baskasi,
      PLAN,
    ]);
    const rows = await kardesSirkette<{ sender_ready: boolean | null }>(
      servisSorgusu('rapor-plani.service.ts', 'report_schedules'),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sender_ready).toBeNull();
  });

  it('KENDİ planında cevap KESİN — bilinmiyor değil', async () => {
    // Ters yön: her plana `null` diyen bir kısayol da yukarıdaki testi
    // geçerdi ve gerçek uyarıyı tamamen susturdu.
    const rows = await kardesSirkette<{ sender_ready: boolean | null }>(
      servisSorgusu('rapor-plani.service.ts', 'report_schedules'),
    );
    expect(rows[0]?.sender_ready).toBe(false);
  });
});

describe('ÖLÇÜM: sebep gerçekten `users` join’i mi', () => {
  it('KRİTİK: plan satırı TABLODA görünüyor', async () => {
    // Politikanın kendisi doğru: satır erişilebilir. Sorun satırda değil.
    const rows = await kardesSirkette(
      `SELECT id::text FROM report_schedules WHERE client_id = '${CLIENT}'::uuid`,
    );
    expect(rows).toHaveLength(1);
  });

  it('KRİTİK: fatura satırı TABLODA görünüyor', async () => {
    const rows = await kardesSirkette(
      `SELECT id::text FROM fatura_belgeleri WHERE client_id = '${CLIENT}'::uuid`,
    );
    expect(rows).toHaveLength(1);
  });

  it('KRİTİK: kullanıcının KENDİ satırı kardeş şirkette GÖRÜNMÜYOR', async () => {
    /*
     * Teşhisin kalbi. `users` politikası org kapsamıyla başlıyor ve
     * kullanıcının org'u EV şirketi; kardeş şirket seçiliyken kendi satırını
     * bile okuyamıyor. Bu politikanın hatası DEĞİL, kasıtlı darlığı.
     */
    const rows = await kardesSirkette(`SELECT id::text FROM users`);
    expect(rows).toHaveLength(0);
  });

  it('KRİTİK: INNER JOIN plan satırını SİLİYOR', async () => {
    const rows = await kardesSirkette(`
      SELECT s.id::text FROM report_schedules s
      JOIN users u ON u.id = s.created_by_user_id
      WHERE s.client_id = '${CLIENT}'::uuid
    `);
    expect(rows, 'inner join satırı elemeliydi').toHaveLength(0);
  });

  it('KRİTİK: INNER JOIN fatura satırını SİLİYOR', async () => {
    const rows = await kardesSirkette(`
      SELECT f.id::text FROM fatura_belgeleri f
      JOIN users u ON u.id = f.uploaded_by_user_id
      WHERE f.client_id = '${CLIENT}'::uuid
    `);
    expect(rows).toHaveLength(0);
  });
});
