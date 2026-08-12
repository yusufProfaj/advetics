import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LeadFormInput, TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { FormsService } from './forms.service';

/**
 * FormsService — GERÇEK Postgres motoruna (PGlite) karşı.
 *
 * NEDEN BU TESTLER: sürüm zinciri tamamen SESSİZ bozulabilen bir yapı.
 * Kopmuş bir zincir hata vermiyor — yalnızca kütüphanede aynı formun iki
 * satırı beliriyor ya da "yenisi var" uyarısı hiç çıkmıyor. En kritik
 * iddialar:
 *
 *   1. İlk sürümde `root_id = id` — kısıt bunu zorluyor ve `gen_random_uuid()`
 *      iki kez çağrılsaydı bu test kırılırdı.
 *   2. Yayınlanmış formu düzenlemek YENİ SATIR üretiyor, eskisini bozmuyor.
 *   3. Kütüphane listesi yalnızca ZİNCİRİN SON HALKASINI gösteriyor.
 *   4. Yayınlanmış form SİLİNEMİYOR.
 */

let h: Harness;
let svc: FormsService;

const PROFILE = '66666666-6666-6666-6666-666666666666';
const OTHER_CLIENT = '77777777-7777-7777-7777-777777777777';
const OTHER_PROFILE = '88888888-8888-8888-8888-888888888888';

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

function input(over: Partial<LeadFormInput> = {}): LeadFormInput {
  return {
    clientId: IDS.client,
    socialProfileId: PROFILE,
    name: 'Yaz kampanyası formu',
    formType: 'more_volume',
    prefillQuestions: ['FULL_NAME', 'PHONE'],
    customQuestions: [],
    privacyPolicyUrl: 'https://ornek.com/gizlilik',
    privacyPolicyLinkText: 'Gizlilik Politikası',
    consentBoxes: [],
    thankYouHeadline: 'Teşekkürler!',
    thankYouBody: 'Size döneceğiz.',
    thankYouCtaText: 'Siteye git',
    ...over,
  };
}

beforeAll(async () => {
  h = await createHarness();
  svc = new FormsService({
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService);
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO social_profiles
       (id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, 'facebook_page', 'page-1', 'Örnek Sayfa', now())`,
    [PROFILE, IDS.client, IDS.connection],
  );
});

/** Bir formu yayınlanmış hâle getirir — Meta çağrısı olmadan. */
async function markPublished(id: string, externalId = 'fbform-1'): Promise<void> {
  await h.q(
    `UPDATE lead_forms SET status = 'published', external_form_id = $2, published_at = now()
     WHERE id = $1`,
    [id, externalId],
  );
}

// -----------------------------------------------------------------------------

describe('oluşturma', () => {
  it('ilk sürümde kök KENDİSİ', async () => {
    // `gen_random_uuid()` INSERT içinde iki kez yazılsaydı iki farklı değer
    // üretir ve bu test yabancı anahtar hatasıyla düşerdi.
    const f = await svc.create(CTX, input());
    expect(f.version).toBe(1);
    expect(f.rootId).toBe(f.id);
  });

  it('sorular ve onay kutuları olduğu gibi dönüyor', async () => {
    const f = await svc.create(
      CTX,
      input({
        prefillQuestions: ['FULL_NAME', 'EMAIL', 'PHONE'],
        customQuestions: [
          { type: 'multiple_choice', label: 'Bütçen?', options: ['1-5M', '5M+'] },
        ],
        consentBoxes: [{ text: 'KVKK onayı', required: true }],
      }),
    );
    expect(f.prefillQuestions).toEqual(['FULL_NAME', 'EMAIL', 'PHONE']);
    expect(f.customQuestions[0]?.options).toEqual(['1-5M', '5M+']);
    expect(f.consentBoxes[0]?.required).toBe(true);
  });

  it('BAŞKA MÜŞTERİNİN sayfası reddediliyor', async () => {
    // RLS aynı organizasyon içinde bunu YAKALAMIYOR: iki satır da aynı
    // org_id'ye sahip. Form yanlış markanın sayfasında yayınlanırdı.
    await h.q(
      `INSERT INTO clients (id, org_id, name, slug, updated_at)
       VALUES ($1, $2, 'Diğer', 'diger', now())`,
      [OTHER_CLIENT, IDS.org],
    );
    await h.q(
      `INSERT INTO social_profiles
         (id, client_id, connection_id, profile_type, external_id, name, updated_at)
       VALUES ($1, $2, $3, 'facebook_page', 'page-2', 'Diğer Sayfa', now())`,
      [OTHER_PROFILE, OTHER_CLIENT, IDS.connection],
    );
    await expect(
      svc.create(CTX, input({ socialProfileId: OTHER_PROFILE })),
    ).rejects.toThrow(/bu müşteriye ait değil/);
  });

  it('sorusuz form veritabanı seviyesinde reddediliyor', async () => {
    // Zod da engelliyor ama kısıt son savunma hattı: doğrudan SQL yazan bir
    // betik ya da ileride eklenen bir yol bunu atlayamamalı.
    await expect(
      h.q(
        `INSERT INTO lead_forms
           (id, org_id, client_id, social_profile_id, name, prefill_questions,
            privacy_policy_url, root_id, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Boş', '[]'::jsonb,
                 'https://x.com/g', gen_random_uuid(), now())`,
        [IDS.org, IDS.client, PROFILE],
      ),
    ).rejects.toThrow();
  });
});

describe('taslak düzenleme', () => {
  it('taslak YERİNDE güncelleniyor — yeni satır yok', async () => {
    const f = await svc.create(CTX, input());
    const u = await svc.update(CTX, f.id, input({ prefillQuestions: ['EMAIL'] }));

    expect(u.id).toBe(f.id);
    expect(u.version).toBe(1);
    const rows = await h.q<{ count: string }>(`SELECT count(*) FROM lead_forms`);
    expect(Number(rows[0]?.count)).toBe(1);
  });
});

describe('yayınlanmış formu düzenleme', () => {
  it('YENİ SÜRÜM oluşuyor, eskisi bozulmuyor', async () => {
    const v1 = await svc.create(CTX, input());
    await markPublished(v1.id);

    const v2 = await svc.update(CTX, v1.id, input({ prefillQuestions: ['EMAIL', 'CITY'] }));

    expect(v2.id).not.toBe(v1.id);
    expect(v2.version).toBe(2);
    // Kök AYNI KALIYOR — zincir bu alan üzerinden kuruluyor.
    expect(v2.rootId).toBe(v1.id);
    expect(v2.status).toBe('draft');
    // Yeni sürüm Meta'da HENÜZ YOK; kendi kimliğini yayınlanınca alacak.
    expect(v2.externalFormId).toBeNull();

    const old = await svc.get(CTX, v1.id);
    expect(old.status).toBe('superseded');
    expect(old.supersededById).toBe(v2.id);
    // ESKİ FORM META'DA YAŞAMAYA DEVAM EDİYOR — kimliği silinmiyor.
    expect(old.externalFormId).toBe('fbform-1');
  });

  it('üçüncü sürüm de aynı kökü taşıyor', async () => {
    // Zincirin en kolay kırıldığı yer: 2. sürümün kökü 1'e, 3'ünkü 2'ye
    // bağlanırsa "tüm sürümler" sorgusu eksik cevap verir.
    const v1 = await svc.create(CTX, input());
    await markPublished(v1.id, 'fbform-1');
    const v2 = await svc.update(CTX, v1.id, input({ prefillQuestions: ['EMAIL'] }));
    await markPublished(v2.id, 'fbform-2');
    const v3 = await svc.update(CTX, v2.id, input({ prefillQuestions: ['CITY'] }));

    expect(v3.version).toBe(3);
    expect(v3.rootId).toBe(v1.id);

    const all = await svc.versions(CTX, v3.id);
    expect(all.map((f) => f.version)).toEqual([1, 2, 3]);
  });

  it('yalnızca ad değişince yeni sürüm YOK', async () => {
    const v1 = await svc.create(CTX, input({ name: 'Eski ad' }));
    await markPublished(v1.id);
    const u = await svc.update(CTX, v1.id, input({ name: 'Yeni ad' }));

    expect(u.id).toBe(v1.id);
    expect(u.name).toBe('Yeni ad');
    expect(u.status).toBe('published');
    // Meta kimliği DEĞİŞMİYOR: Meta'daki form olduğu gibi duruyor.
    expect(u.externalFormId).toBe('fbform-1');
    const rows = await h.q<{ count: string }>(`SELECT count(*) FROM lead_forms`);
    expect(Number(rows[0]?.count)).toBe(1);
  });

  it('yayınlanmış formda içerik alanları yerinde DEĞİŞMİYOR', async () => {
    // Ad güncellemesi diğer alanlara sızsaydı, panel Meta'daki formdan farklı
    // bir içerik gösterirdi — "reklamda ne yazıyor" sorusuna yanlış cevap.
    const v1 = await svc.create(CTX, input({ name: 'A', thankYouBody: 'İlk metin' }));
    await markPublished(v1.id);
    await svc.update(CTX, v1.id, input({ name: 'B', thankYouBody: 'İlk metin' }));

    const after = await svc.get(CTX, v1.id);
    expect(after.thankYouBody).toBe('İlk metin');
  });
});

describe('kütüphane listesi', () => {
  it('YALNIZCA zincirin son halkası görünüyor', async () => {
    const v1 = await svc.create(CTX, input({ name: 'Form A' }));
    await markPublished(v1.id);
    const v2 = await svc.update(CTX, v1.id, input({ name: 'Form A', prefillQuestions: ['EMAIL'] }));
    await svc.create(CTX, input({ name: 'Form B' }));

    const list = await svc.list(CTX, IDS.client);
    expect(list).toHaveLength(2);
    expect(list.map((f) => f.id)).toContain(v2.id);
    expect(list.map((f) => f.id)).not.toContain(v1.id);
  });
});

describe('silme', () => {
  it('taslak silinebiliyor', async () => {
    const f = await svc.create(CTX, input());
    await svc.remove(CTX, f.id);
    const rows = await h.q<{ count: string }>(`SELECT count(*) FROM lead_forms`);
    expect(Number(rows[0]?.count)).toBe(0);
  });

  it('YAYINLANMIŞ form silinemiyor', async () => {
    // Silmek, Meta'da yaşamaya ve bilgi toplamaya devam eden bir formu
    // görünmez kılmak demek: gelen kişilerin kaynağı bulunamaz.
    const f = await svc.create(CTX, input());
    await markPublished(f.id);
    await expect(svc.remove(CTX, f.id)).rejects.toThrow(/Yayınlanmış form silinemiyor/);
  });

  it('eski sürüm silinemiyor', async () => {
    const v1 = await svc.create(CTX, input());
    await markPublished(v1.id);
    await svc.update(CTX, v1.id, input({ prefillQuestions: ['EMAIL'] }));
    await expect(svc.remove(CTX, v1.id)).rejects.toThrow(/silinemiyor/);
  });
});

describe('yayın kaydı', () => {
  it('kimliksiz yayın durumu veritabanı seviyesinde reddediliyor', async () => {
    // `lead_forms_published_chk`. Kimliksiz "yayında" satırı, arayüzde
    // yayında görünen ama hiçbir reklamda kullanılamayan bir form demek.
    const f = await svc.create(CTX, input());
    await expect(
      h.q(`UPDATE lead_forms SET status = 'published' WHERE id = $1`, [f.id]),
    ).rejects.toThrow();
  });

  it('markPublished durumu ve kimliği birlikte yazıyor', async () => {
    const f = await svc.create(CTX, input());
    await svc.markPublished(CTX, f.id, 'fbform-42');
    const after = await svc.get(CTX, f.id);
    expect(after.status).toBe('published');
    expect(after.externalFormId).toBe('fbform-42');
    expect(after.publishedAt).not.toBeNull();
  });

  it('markFailed sebebi kaydediyor', async () => {
    const f = await svc.create(CTX, input());
    await svc.markFailed(CTX, f.id, 'Gizlilik politikası adresine erişilemedi');
    const after = await svc.get(CTX, f.id);
    expect(after.status).toBe('failed');
    expect(after.error).toContain('Gizlilik');
  });
});
