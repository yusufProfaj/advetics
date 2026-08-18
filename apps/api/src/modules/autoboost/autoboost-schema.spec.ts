import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';

/**
 * ADVETICS 1.0 — ÖN AYAR VE ONAY KUYRUĞU ŞEMASI.
 *
 * BU DOSYADAKİ TESTLERİN TAMAMI PARA HARCAMAYI ENGELLEYEN KISITLARI SINIYOR.
 * Şemanın "kurulabildiğini" değil, yanlış veriyi REDDETTİĞİNİ doğruluyor —
 * çünkü buradaki her kısıt, uygulama katmanında unutulabilecek bir kontrolün
 * son savunma hattı.
 */

let h: Harness;

const PROFIL = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
const PROFIL2 = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb';

async function seedProfile(id: string, type = 'instagram_business'): Promise<void> {
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id,
       profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, $5::"SocialProfileType", $6, 'Profil', now())`,
    [id, IDS.org, IDS.client, IDS.connection, type, `ext-${id.slice(0, 8)}`],
  );
}

async function preset(over: Record<string, unknown> = {}): Promise<void> {
  const v = {
    platform: 'meta',
    social_profile_id: null,
    budget_mode: 'daily',
    daily: 50_000_000,
    total: null,
    ...over,
  };
  await h.q(
    `INSERT INTO auto_boost_presets (id, org_id, client_id, platform, social_profile_id,
       budget_mode, daily_budget_micros, total_budget_micros, settings, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3::"Platform", $4, $5, $6, $7, '{}'::jsonb, now())`,
    [IDS.org, IDS.client, v.platform, v.social_profile_id, v.budget_mode, v.daily, v.total],
  );
}

async function kuyruk(externalId: string, profil = PROFIL): Promise<void> {
  await h.q(
    `INSERT INTO auto_boost_queue_items (id, org_id, client_id, platform,
       social_profile_id, external_id, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'meta', $3, $4, now())`,
    [IDS.org, IDS.client, profil, externalId],
  );
}

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await seedProfile(PROFIL);
});

describe('şema kuruldu', () => {
  it('iki tablo da var', async () => {
    const rows = await h.q<{ tablename: string }>(
      `SELECT tablename FROM pg_tables
       WHERE tablename IN ('auto_boost_presets', 'auto_boost_queue_items')
       ORDER BY tablename`,
    );
    expect(rows.map((r) => r.tablename)).toEqual([
      'auto_boost_presets',
      'auto_boost_queue_items',
    ]);
  });

  it('KRİTİK: ikisinde de DÖRT RLS POLİTİKASI var', async () => {
    /*
     * RLS bu projenin son savunma hattı: politika yazılmazsa bir müşterinin
     * kaydı başka müşteriye görünür.
     *
     * `relrowsecurity` KONTROL EDİLMİYOR ve sebebi harness: test ortamı RLS'i
     * BÜTÜN tablolarda kapatıyor (`boosts` ve `boost_rules` dahil) çünkü
     * varsayılan olarak BYPASSRLS taklit ediliyor. O bayrağı iddia etmek
     * migration'ı değil harness'ı test etmek olurdu. Anlamlı olan, dört
     * komutun da politikaya sahip olması.
     */
    const rows = await h.q<{ tablename: string; cmd: string }>(
      `SELECT tablename, cmd FROM pg_policies
       WHERE tablename IN ('auto_boost_presets', 'auto_boost_queue_items')
       ORDER BY tablename, cmd`,
    );
    for (const tablo of ['auto_boost_presets', 'auto_boost_queue_items']) {
      const komutlar = rows.filter((r) => r.tablename === tablo).map((r) => r.cmd).sort();
      expect(komutlar).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
    }
  });

  it('`youtube_channel` profil türü KULLANILABİLİR', async () => {
    // Enum değeri AYRI migration'da eklendi; aynı dosyada olsaydı burada
    // "unsafe use of new value" ile düşerdi.
    await expect(seedProfile(PROFIL2, 'youtube_channel')).resolves.not.toThrow();
  });
});

describe('bütçe kısıtı', () => {
  it('günlük kipte günlük tutar zorunlu', async () => {
    await expect(preset({ budget_mode: 'daily', daily: null })).rejects.toThrow();
  });

  it('toplam kipte toplam tutar zorunlu', async () => {
    await expect(
      preset({ budget_mode: 'lifetime', daily: null, total: null }),
    ).rejects.toThrow();
  });

  it('KRİTİK: İKİSİ BİRDEN dolu olamaz', async () => {
    /*
     * İkisi de doluysa hangisinin geçerli olduğu belirsiz ve okuyan kod
     * birini seçmek zorunda kalır — iki farklı yer iki farklı seçim yaparsa
     * biri kat kat fazla harcar.
     */
    await expect(
      preset({ budget_mode: 'daily', daily: 50_000_000, total: 300_000_000 }),
    ).rejects.toThrow();
  });

  it('geçerli günlük ön ayar kabul ediliyor', async () => {
    await expect(preset()).resolves.not.toThrow();
  });

  it('Meta tarafında TOPLAM bütçe serbest', async () => {
    await expect(
      preset({ budget_mode: 'lifetime', daily: null, total: 300_000_000 }),
    ).resolves.not.toThrow();
  });
});

describe('Google kısıtı', () => {
  it('KRİTİK: Google tarafında TOPLAM bütçe REDDEDİLİYOR', async () => {
    /*
     * Google'da bütçe ayrı bir kaynak (`CampaignBudget`) ve GÜNLÜK; toplam
     * diye bir kip yok. Toplamı günlüğe bölmek panelde yazan tutar ile
     * hesaptan çıkanı ayrıştırırdı. Kısıt veritabanında çünkü uygulama
     * katmanında unutulabilir.
     */
    await expect(
      preset({
        platform: 'google',
        budget_mode: 'lifetime',
        daily: null,
        total: 300_000_000,
      }),
    ).rejects.toThrow();
  });

  it('Google GÜNLÜK bütçeyle kabul ediliyor', async () => {
    await expect(preset({ platform: 'google' })).resolves.not.toThrow();
  });
});

describe('ön ayar tekilliği', () => {
  it('KRİTİK: aynı müşteri+platform için İKİNCİ varsayılan ön ayar açılamıyor', async () => {
    /*
     * İki ön ayar olsaydı "onaylanınca hangisi uygulanacak" sorusunun cevabı
     * olmazdı ve seçim sessizce satır sırasına kalırdı.
     */
    await preset();
    await expect(preset()).rejects.toThrow();
  });

  it('FARKLI platform için ikinci ön ayar açılabiliyor', async () => {
    await preset({ platform: 'meta' });
    await expect(preset({ platform: 'google' })).resolves.not.toThrow();
  });

  it('KRİTİK: profil bazlı ön ayar varsayılanı ENGELLEMİYOR', async () => {
    /*
     * NULL'lar tekil indekste birbirine eşit sayılmıyor; bu yüzden İKİ ayrı
     * kısmi indeks var. Tek indeks olsaydı "bütün profiller için" satırı iki
     * kez yazılabilirdi.
     */
    await preset({ social_profile_id: null });
    await expect(preset({ social_profile_id: PROFIL })).resolves.not.toThrow();
  });

  it('AYNI profil için ikinci ön ayar açılamıyor', async () => {
    await preset({ social_profile_id: PROFIL });
    await expect(preset({ social_profile_id: PROFIL })).rejects.toThrow();
  });
});

describe('kuyruk idempotency — ÇİFT REKLAMI ENGELLEYEN KISIT', () => {
  it('KRİTİK: aynı gönderi İKİNCİ KEZ kuyruğa giremiyor', async () => {
    /*
     * BU TABLODAKİ EN ÖNEMLİ KISIT. Webhook teslimi garanti değil ve mükerrer
     * olabiliyor: Meta başarısız saydığını tekrar gönderiyor, YouTube WebSub
     * video güncellendiğinde yeniden bildiriyor. Kısıt olmasa aynı gönderi
     * için iki kart düşer, ikisi de onaylanırsa AYNI İÇERİK İÇİN İKİ REKLAM
     * açılır — iki kat para.
     */
    await kuyruk('17895695668004550');
    await expect(kuyruk('17895695668004550')).rejects.toThrow();
  });

  it('FARKLI gönderi kuyruğa girebiliyor', async () => {
    await kuyruk('17895695668004550');
    await expect(kuyruk('17895695668004551')).resolves.not.toThrow();
  });

  it('AYNI kimlik FARKLI profilde kabul ediliyor', async () => {
    // Kapsam profil bazında: iki farklı kanalda teorik çakışma meşru bir
    // kaydı reddetmemeli.
    await seedProfile(PROFIL2, 'youtube_channel');
    await kuyruk('abc123', PROFIL);
    await expect(kuyruk('abc123', PROFIL2)).resolves.not.toThrow();
  });

  it('kuyruk kaydı `pending` doğuyor', async () => {
    await kuyruk('x1');
    const [row] = await h.q<{ status: string }>(
      `SELECT status FROM auto_boost_queue_items`,
    );
    expect(row!.status).toBe('pending');
  });
});

describe('ön ayar silinince kuyruk kaydı YAŞIYOR', () => {
  it('KRİTİK: yayınlanmış kaydın geçmişi ön ayarla birlikte kaybolmuyor', async () => {
    /*
     * `applied_settings` kopyayı zaten taşıyor; kaydı da silmek "bu reklam
     * hangi ayarlarla yayınlandı" sorusunu cevapsız bırakırdı.
     */
    await preset();
    const [p] = await h.q<{ id: string }>(`SELECT id::text AS id FROM auto_boost_presets`);
    await h.q(
      `INSERT INTO auto_boost_queue_items (id, org_id, client_id, platform,
         social_profile_id, external_id, applied_preset_id, applied_settings, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'meta', $3, 'x9', $4, '{"a":1}'::jsonb, now())`,
      [IDS.org, IDS.client, PROFIL, p!.id],
    );

    await h.q(`DELETE FROM auto_boost_presets WHERE id = $1`, [p!.id]);

    const [row] = await h.q<{ applied_preset_id: string | null; applied_settings: unknown }>(
      `SELECT applied_preset_id::text AS applied_preset_id, applied_settings
       FROM auto_boost_queue_items`,
    );
    expect(row).toBeDefined();
    expect(row!.applied_preset_id).toBeNull();
    expect(row!.applied_settings).toEqual({ a: 1 });
  });
});
