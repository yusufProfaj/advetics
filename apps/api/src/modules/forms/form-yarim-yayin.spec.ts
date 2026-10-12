import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeadFormInput, TenantContext } from '@advetics/shared';
import { FORM_YAYIN_BELIRSIZ_NOTU, FORM_YAYIN_YARIM_NOTU, FORM_YAYIN_YASLI_DAKIKA } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { FormsService } from './forms.service';
import { FormPublisherService } from './form-publisher.service';
import { FORM_YAYIN_ONAY_GEREKIR, publishBlockers } from './form-versioning';

/**
 * YARIM KALAN FORM YAYINI (Ajan 4 bulgusu).
 *
 * Süreç sahiplenmeden SONRA ölürse satır sonsuza kadar `publishing`
 * kalıyordu: yeniden yayın kapalı, panelde açan yol yok. Ölüm noktası iki
 * farklı iş istiyor ve ayıran şey Meta isteğinden hemen önce basılan damga
 * (`meta_request_started_at`):
 *   damga yok  → Meta'ya hiçbir şey gitmedi → `failed`, yeniden yayınlanabilir
 *   damga var  → Meta'da form açılmış olabilir → `uncertain`, yalnız onayla
 * Taze `publishing` satırına (yayın sürüyor) DOKUNULMAZ.
 */
let h: Harness;
let forms: FormsService;
const PROFILE = '66666666-6666-6666-6666-666666666667';
const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], isOrgAdmin: true } as TenantContext;
const GIRDI = {
  clientId: IDS.client,
  socialProfileId: PROFILE,
  name: 'Teklif formu',
  formType: 'higher_intent',
  prefillQuestions: ['FULL_NAME', 'PHONE'],
  customQuestions: [],
  privacyPolicyUrl: 'https://ege.com.tr/kvkk',
  privacyPolicyLinkText: 'KVKK',
  consentBoxes: [{ text: 'KVKK metnini okudum.', required: true }],
  thankYouHeadline: 'Teşekkürler',
  thankYouBody: 'Arayacağız.',
  thankYouCtaText: 'Bizi ara',
  thankYouCtaType: 'CALL_BUSINESS',
  thankYouPhone: '+902321234567',
} as LeadFormInput;

function kur() {
  const prisma = { withTenant: async <T>(_c: unknown, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
  const prov = {
    canWrite: () => ({ ok: true, missing: [] }),
    createLeadForm: vi.fn(async () => '777'),
    // Geri okuma bu dosyanın konusu değil; okunamadı uyarısı yeterli.
    readLeadForm: vi.fn(async () => {
      throw new Error('okunmadı');
    }),
  };
  const svc = new FormPublisherService(
    prisma as never,
    forms,
    { get: () => prov } as never,
    { decrypt: () => 'SAYFA' } as never,
    { acquire: async () => ({ allowed: true }), record: async () => undefined } as never,
  );
  return { svc, prov };
}

/** Satırı yaş eşiğinin ötesine iter (süreç o kadar önce öldü). */
async function yaslandir(id: string, dakika = FORM_YAYIN_YASLI_DAKIKA + 1): Promise<void> {
  await h.q(`UPDATE lead_forms SET updated_at = now() - make_interval(mins => $2::int) WHERE id = $1`, [id, dakika]);
}

async function damga(id: string): Promise<string | null> {
  const [r] = await h.q<{ meta_request_started_at: string | null }>(`SELECT meta_request_started_at FROM lead_forms WHERE id = $1`, [id]);
  return r!.meta_request_started_at;
}

beforeAll(async () => {
  h = await createHarness();
  forms = new FormsService({ withTenant: async <T>(_c: unknown, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService);
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, page_access_token_enc, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', 'page-1', 'Sayfa', '\\x01', now())`,
    [PROFILE, IDS.org, IDS.client, IDS.connection],
  );
  vi.restoreAllMocks();
});

describe('damga Meta isteğinden HEMEN önce', () => {
  it('KRİTİK: Meta çağrıldığı anda satırda damga var', async () => {
    const f = await forms.create(CTX, GIRDI);
    const { svc, prov } = kur();
    let cagriAnindaDamga: string | null | undefined;
    prov.createLeadForm.mockImplementationOnce(async () => {
      cagriAnindaDamga = await damga(f.id);
      return '777';
    });
    await svc.publish(CTX, f.id);
    expect(cagriAnindaDamga).not.toBeNull();
    expect(cagriAnindaDamga).toBeDefined();
  });

  it('KRİTİK: damga yazılamazsa Meta’ya GİDİLMEZ ve satır failed (güvenle yeniden denenebilir)', async () => {
    const f = await forms.create(CTX, GIRDI);
    const { svc, prov } = kur();
    vi.spyOn(forms, 'metaIstegiBasladi').mockRejectedValueOnce(new Error('bağlantı koptu'));
    await expect(svc.publish(CTX, f.id)).rejects.toThrow(/Meta'ya istek gitmedi/);
    expect(prov.createLeadForm).not.toHaveBeenCalled();
    expect((await forms.get(CTX, f.id)).status).toBe('failed');
  });
});

describe('Meta hatası: kesin ret mi, belirsiz mi', () => {
  it('KRİTİK: sınıflanmamış hata (ağ kopması) failed DEĞİL uncertain — istek gitmiş olabilir', async () => {
    const f = await forms.create(CTX, GIRDI);
    const { svc, prov } = kur();
    prov.createLeadForm.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(svc.publish(CTX, f.id)).rejects.toThrow(/form açılmış olabilir/);
    const r = await forms.get(CTX, f.id);
    expect(r.status).toBe('uncertain');
    expect(r.error).toContain('fetch failed');
    // Onaysız yeniden yayın Meta'ya gitmiyor.
    await expect(svc.publish(CTX, f.id)).rejects.toThrow(/Yeniden dene/);
    expect(prov.createLeadForm).toHaveBeenCalledTimes(1);
  });
});

describe('yarım kalan yayın okuma anında ayrılıyor', () => {
  it('KRİTİK: damgasız yaşlı publishing → failed + not, yeniden yayınlanabilir', async () => {
    const f = await forms.create(CTX, GIRDI);
    expect(await forms.yayinSahiplen(CTX, f.id)).toBe(true);
    await yaslandir(f.id);

    const r = await forms.get(CTX, f.id);
    expect(r).toMatchObject({ status: 'failed', error: FORM_YAYIN_YARIM_NOTU, externalFormId: null });
    expect(publishBlockers(r)).toEqual([]);

    const { svc, prov } = kur();
    expect((await svc.publish(CTX, f.id)).status).toBe('published');
    expect(prov.createLeadForm).toHaveBeenCalledTimes(1);
  });

  it('KRİTİK: damgalı yaşlı publishing → uncertain, onaysız yayın Meta’ya GİTMEZ, düzenleme ve silme kapalı', async () => {
    const f = await forms.create(CTX, GIRDI);
    await forms.yayinSahiplen(CTX, f.id);
    await forms.metaIstegiBasladi(CTX, f.id);
    await yaslandir(f.id);

    // Liste de ayırıyor (Formlar ekranı ve rehber listeden okuyor).
    const [l] = await forms.list(CTX, IDS.client);
    expect(l).toMatchObject({ id: f.id, status: 'uncertain', error: FORM_YAYIN_BELIRSIZ_NOTU });
    expect(publishBlockers(l!)).toContain(FORM_YAYIN_ONAY_GEREKIR);

    const { svc, prov } = kur();
    await expect(svc.publish(CTX, f.id)).rejects.toThrow(/Yeniden dene/);
    expect(prov.createLeadForm).not.toHaveBeenCalled();
    // Sunucu kapısı ikinci kat: sahiplenme de onaysız uncertain'ı almıyor.
    expect(await forms.yayinSahiplen(CTX, f.id)).toBe(false);
    await expect(forms.update(CTX, f.id, { ...GIRDI, name: 'X', thankYouBody: 'Y' })).rejects.toThrow(/yarım kaldı/);
    await expect(forms.remove(CTX, f.id)).rejects.toThrow();
  });

  it('KRİTİK: TAZE publishing (damgalı da damgasız da) dokunulmaz — yayın sürüyor olabilir', async () => {
    const a = await forms.create(CTX, GIRDI);
    const b = await forms.create(CTX, { ...GIRDI, name: 'İkinci' });
    await forms.yayinSahiplen(CTX, a.id);
    await forms.yayinSahiplen(CTX, b.id);
    await forms.metaIstegiBasladi(CTX, b.id);
    // Eşiğin hemen altı: dokunulmamalı.
    await yaslandir(a.id, FORM_YAYIN_YASLI_DAKIKA - 1);
    await yaslandir(b.id, FORM_YAYIN_YASLI_DAKIKA - 1);

    const liste = await forms.list(CTX, IDS.client);
    expect(liste.map((x) => [x.id, x.status, x.error]).sort()).toEqual(
      [
        [a.id, 'publishing', null],
        [b.id, 'publishing', null],
      ].sort(),
    );
    expect((await forms.get(CTX, b.id)).status).toBe('publishing');
  });
});

describe('bilinçli yeniden dene', () => {
  it('KRİTİK: onayla uncertain yeniden yayınlanır; damga yeni deneme için sıfırlanıp yeniden basılır', async () => {
    const f = await forms.create(CTX, GIRDI);
    await forms.yayinSahiplen(CTX, f.id);
    await forms.metaIstegiBasladi(CTX, f.id);
    await yaslandir(f.id);
    expect((await forms.get(CTX, f.id)).status).toBe('uncertain');

    const { svc, prov } = kur();
    const r = await svc.publish(CTX, f.id, { belirsizOnayi: true });
    expect(r).toMatchObject({ status: 'published', externalFormId: '777', error: null });
    expect(prov.createLeadForm).toHaveBeenCalledTimes(1);
  });

  it('onay, Meta kimliği olan satırı AÇMAZ (orada form kesin var)', async () => {
    const f = await forms.create(CTX, GIRDI);
    await h.q(`UPDATE lead_forms SET status = 'uncertain', external_form_id = '555' WHERE id = $1`, [f.id]);
    const { svc, prov } = kur();
    await expect(svc.publish(CTX, f.id, { belirsizOnayi: true })).rejects.toThrow(/zaten bir kimliği var/);
    expect(prov.createLeadForm).not.toHaveBeenCalled();
  });

  it('KRİTİK: Meta eşikten geç cevap verirse (satır bu arada uncertain) kimlik YİNE yazılır', async () => {
    const f = await forms.create(CTX, GIRDI);
    await forms.yayinSahiplen(CTX, f.id);
    await forms.metaIstegiBasladi(CTX, f.id);
    await yaslandir(f.id);
    expect((await forms.get(CTX, f.id)).status).toBe('uncertain');
    await forms.kimlikYaz(CTX, f.id, '888');
    expect(await forms.get(CTX, f.id)).toMatchObject({ status: 'published', externalFormId: '888' });
  });
});
