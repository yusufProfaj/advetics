import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeadFormInput, LeadFormRecord, TenantContext } from '@advetics/shared';
import { formGeriOkumaDenetimi } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { FormsService, GERI_OKUMA_BEKLIYOR } from './forms.service';
import { PlatformApiError } from '../connections/provider.types';
import { FormPublisherService } from './form-publisher.service';
import { FORM_YAYIN_BELIRSIZ, publishBlockers } from './form-versioning';
import { kutuphaneFormuGovdesi } from './form-govdesi';

/**
 * YAYIN KİLİDİ VE KİMLİĞİN HEMEN YAZILMASI (Ajan 4 B-1, Ö-2, Ö-3).
 *
 * Meta'da form silinemiyor: `createLeadForm` döndükten sonraki her hata
 * satırı yeniden denenebilir bırakırsa ikinci form açılır. Bu dosya
 * `form-mukerrer.spec.ts`in tamamlayıcısı: kimlik yazımı da düşerse ne
 * olduğu, satır `failed`a hiç düşmediği ve geri okumanın teşekkür ekranı /
 * sorular / gizlilik adresinde "temiz" demediği.
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

function kur(okuma: (fields: string) => Promise<Record<string, unknown>>) {
  const prisma = { withTenant: async <T>(_c: unknown, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
  const prov = {
    canWrite: () => ({ ok: true, missing: [] }),
    createLeadForm: vi.fn(async () => '777'),
    readLeadForm: vi.fn(async (_c: unknown, r: { fields: string }) => okuma(r.fields)),
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

/** Gönderilenin birebir yankısı (geri okumanın "temiz" dediği hâl). */
function yanki(f: LeadFormRecord): Record<string, unknown> {
  const r = kutuphaneFormuGovdesi(f, 'page-1');
  if (r.tur !== 'govde') throw new Error(JSON.stringify(r.retler));
  const a = r.govde.alanlar as Record<string, any>;
  return {
    id: '777',
    locale: 'TR_TR',
    is_optimized_for_quality: true,
    block_display_for_non_targeted_viewer: true,
    legal_content: { custom_disclaimer: a.custom_disclaimer },
    privacy_policy_url: a.privacy_policy.url,
    questions: a.questions,
    thank_you_page: a.thank_you_page,
  };
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

describe('kimlik HEMEN ve AYRI yazılıyor', () => {
  it('düzgün yolda yankı temiz: published, kimlikli, uyarısız', async () => {
    const f = await forms.create(CTX, GIRDI);
    const { svc } = kur(async () => yanki(f));
    const r = await svc.publish(CTX, f.id);
    expect(r).toMatchObject({ status: 'published', externalFormId: '777', readbackWarning: null });
  });

  it('KRİTİK: kimlik yazımı düşerse satır `publishing` (belirsiz) kalır, yeniden yayın Meta’ya GİTMEZ ve mesaj Meta’yı söyler', async () => {
    const f = await forms.create(CTX, GIRDI);
    const { svc, prov } = kur(async () => yanki(f));
    vi.spyOn(forms, 'kimlikYaz').mockRejectedValueOnce(new Error('bağlantı koptu'));
    await expect(svc.publish(CTX, f.id)).rejects.toThrow(/Meta'da form açılmış olabilir \(kimlik 777\)/);
    const ara = await forms.get(CTX, f.id);
    expect(ara.status).toBe('publishing');
    expect(publishBlockers(ara)).toContain(FORM_YAYIN_BELIRSIZ);
    await expect(svc.publish(CTX, f.id)).rejects.toThrow(/yarım kaldı/);
    expect(prov.createLeadForm).toHaveBeenCalledTimes(1);
    // Belirsiz satır düzenlenemez ve silinemez.
    await expect(forms.update(CTX, f.id, { ...GIRDI, name: 'X', thankYouBody: 'Y' })).rejects.toThrow(/yarım kaldı/);
    await expect(forms.remove(CTX, f.id)).rejects.toThrow();
  });

  it('geri okuma sonucu kaydedilemezse satır yayında ve "geri okuma tamamlanmadı" uyarısıyla', async () => {
    const f = await forms.create(CTX, GIRDI);
    const { svc } = kur(async () => yanki(f));
    vi.spyOn(forms, 'markPublished').mockRejectedValueOnce(new Error('zaman aşımı'));
    await expect(svc.publish(CTX, f.id)).rejects.toThrow(/Meta'da yayında \(kimlik 777\)/);
    expect(await forms.get(CTX, f.id)).toMatchObject({ status: 'published', externalFormId: '777', readbackWarning: GERI_OKUMA_BEKLIYOR });
  });

  it('KRİTİK: kimliği yazılmış satır `failed`a düşemez (markFailed koşullu)', async () => {
    const f = await forms.create(CTX, GIRDI);
    const { svc } = kur(async () => yanki(f));
    await svc.publish(CTX, f.id);
    await forms.markFailed(CTX, f.id, 'geç gelen hata');
    expect((await forms.get(CTX, f.id)).status).toBe('published');
  });

  it('Meta form AÇMADIYSA satır failed ve yeniden yayınlanabilir (tek doğru failed)', async () => {
    const f = await forms.create(CTX, GIRDI);
    const { svc, prov } = kur(async () => yanki(f));
    // Meta'nın AÇIK reddi: sınıflanmış, `transient` değil. Sınıflanmamış
    // hata belirsiz sayılıyor (form-yarim-yayin.spec.ts).
    prov.createLeadForm.mockRejectedValueOnce(new PlatformApiError('meta', 'permission_denied', '(#200) izin yok'));
    await expect(svc.publish(CTX, f.id)).rejects.toThrow(/izin yok/);
    expect((await forms.get(CTX, f.id)).status).toBe('failed');
    await svc.publish(CTX, f.id);
    expect(prov.createLeadForm).toHaveBeenCalledTimes(2);
  });
});

describe('yayın kilidi (sahiplenme)', () => {
  it('KRİTİK: sahiplenme koşullu — ikinci sahiplenme sıfır satır', async () => {
    const f = await forms.create(CTX, GIRDI);
    expect(await forms.yayinSahiplen(CTX, f.id)).toBe(true);
    expect(await forms.yayinSahiplen(CTX, f.id)).toBe(false);
  });
});

describe('geri okuma: teşekkür ekranı, sorular, gizlilik (Ö-3)', () => {
  const gonderilen = () => {
    const r = kutuphaneFormuGovdesi({ ...(GIRDI as object), id: 'f', status: 'draft', thankYouCtaUrl: null, version: 1, readbackWarning: null, externalFormId: null } as never, 'page-1');
    if (r.tur !== 'govde') throw new Error('ret');
    return r.govde.alanlar as Record<string, any>;
  };

  it('aynı yankı temiz; numara biçimi farklı ama rakamları aynıysa da temiz', () => {
    const a = gonderilen();
    const y = { id: '7', locale: 'TR_TR', is_optimized_for_quality: true, block_display_for_non_targeted_viewer: true, legal_content: { custom_disclaimer: a.custom_disclaimer }, privacy_policy_url: a.privacy_policy.url, questions: a.questions, thank_you_page: { ...a.thank_you_page, business_phone_number: '902321234567' } };
    expect(formGeriOkumaDenetimi(a, y).sonuc).toBe('temiz');
  });

  it('KRİTİK: başka numara, başka düğme, eksik soru, başka gizlilik adresi FARK', () => {
    const a = gonderilen();
    const temel = { id: '7', locale: 'TR_TR', is_optimized_for_quality: true, block_display_for_non_targeted_viewer: true, legal_content: { custom_disclaimer: a.custom_disclaimer }, privacy_policy_url: a.privacy_policy.url, questions: a.questions, thank_you_page: a.thank_you_page };
    expect(formGeriOkumaDenetimi(a, { ...temel, thank_you_page: { ...a.thank_you_page, business_phone_number: '+905551112233' } }).sonuc).toBe('fark');
    expect(formGeriOkumaDenetimi(a, { ...temel, thank_you_page: { button_type: 'NONE' } }).sonuc).toBe('fark');
    expect(formGeriOkumaDenetimi(a, { ...temel, questions: { data: [a.questions[0]] } }).sonuc).toBe('fark');
    expect(formGeriOkumaDenetimi(a, { ...temel, questions: [a.questions[1], a.questions[0]] }).sonuc).toBe('fark');
    // Meta FAZLADAN soru eklediyse (ilk sorular aynı): yalnız sayı kıyası yakalar.
    expect(formGeriOkumaDenetimi(a, { ...temel, questions: [...a.questions, { type: 'EMAIL' }] }).sonuc).toBe('fark');
    expect(formGeriOkumaDenetimi(a, { ...temel, privacy_policy_url: 'https://baska.com/kvkk' }).sonuc).toBe('fark');
  });

  it('teşekkür ekranı / sorular / gizlilik dönmezse "doğrulanamadı", temiz DEĞİL', () => {
    const a = gonderilen();
    const temel = { id: '7', locale: 'TR_TR', is_optimized_for_quality: true, block_display_for_non_targeted_viewer: true, legal_content: { custom_disclaimer: a.custom_disclaimer }, privacy_policy_url: a.privacy_policy.url, questions: a.questions, thank_you_page: a.thank_you_page };
    for (const alan of ['thank_you_page', 'questions', 'privacy_policy_url']) {
      const o: Record<string, unknown> = { ...temel };
      delete o[alan];
      expect(formGeriOkumaDenetimi(a, o).sonuc, alan).toBe('dogrulanamadi');
    }
    expect(formGeriOkumaDenetimi(a, { ...temel, thank_you_page: { button_type: 'CALL_BUSINESS' } }).sonuc).toBe('dogrulanamadi');
  });

  it('KRİTİK (B-1b): bicimsiz onay kutusu listesi (null eleman, dizge olmayan metin) PATLAMAZ ve temiz sayılmaz', () => {
    const a = gonderilen();
    const temel = { id: '7', locale: 'TR_TR', is_optimized_for_quality: true, block_display_for_non_targeted_viewer: true, privacy_policy_url: a.privacy_policy.url, questions: a.questions, thank_you_page: a.thank_you_page };
    const bicimsiz = { ...temel, legal_content: { custom_disclaimer: { checkboxes: [null, { key: 'onay_1', text: 5 }, ...a.custom_disclaimer.checkboxes] } } };
    expect(() => formGeriOkumaDenetimi(a, bicimsiz)).not.toThrow();
    const r = formGeriOkumaDenetimi(a, bicimsiz);
    expect(r.sonuc).toBe('dogrulanamadi');
    expect(JSON.stringify(r)).toMatch(/2 onay kutusu tanınmayan biçimde/);
    expect(formGeriOkumaDenetimi(a, { ...temel, legal_content: { custom_disclaimer: { checkboxes: 'bozuk' } } }).sonuc).not.toBe('temiz');
  });

  it('KRİTİK: Graph ALAN reddederse temel alanlarla yeniden okunur ve okunmayan kısım "doğrulanamadı" yazılır', async () => {
    const f = await forms.create(CTX, GIRDI);
    const istenen: string[] = [];
    const { svc } = kur(async (fields) => {
      istenen.push(fields);
      if (fields.includes('thank_you_page')) throw new Error('(#100) Tried accessing nonexisting field (thank_you_page) on node type (LeadgenForm)');
      return { id: '777', locale: 'TR_TR', is_optimized_for_quality: true, block_display_for_non_targeted_viewer: true };
    });
    const r = await svc.publish(CTX, f.id);
    expect(istenen).toHaveLength(2);
    expect(istenen[1]).not.toContain('thank_you_page');
    expect(r.status).toBe('published');
    expect(r.readbackWarning).toMatch(/doğrulanamadı.*Teşekkür ekranı/);
  });
});
