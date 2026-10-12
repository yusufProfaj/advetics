import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeadFormInput, TenantContext } from '@advetics/shared';
import { formGeriOkumaDenetimi } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { FormsService } from './forms.service';
import { FormPublisherService } from './form-publisher.service';
import { kutuphaneFormuGovdesi } from './form-govdesi';

/**
 * ═══ AJAN 4 KAPISI — MÜKERRER FORM ═══
 *
 * Meta'da form SİLİNEMİYOR ve DÜZENLENEMİYOR. `createLeadForm` başarıyla
 * döndükten SONRA olan her şey (geri okuma, karşılaştırma, `markPublished`)
 * yayınla AYNI `try` bloğunda ve oradaki `catch` satırı `failed`a çeviriyor.
 * `failed` = `publishBlockers` boş = "Yarım kalan formlar"da yeniden
 * "Meta'da yayınla" = Meta'da İKİNCİ form. CLAUDE.md "Kayıt yazılamazsa satır
 * `failed` DEĞİL `creating` kalmalı" kuralının form karşılığı.
 *
 * Bu testler KIRMIZI bırakıldı (düzeltme bulguyu üreten ajanın).
 */

let h: Harness;
let forms: FormsService;
const PROFILE = '66666666-6666-6666-6666-666666666666';
const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], isOrgAdmin: true } as TenantContext;

const GIRDI: LeadFormInput = {
  clientId: IDS.client,
  socialProfileId: PROFILE,
  name: 'Teklif formu',
  formType: 'more_volume',
  prefillQuestions: ['FULL_NAME', 'PHONE'],
  customQuestions: [],
  privacyPolicyUrl: 'https://ege.com.tr/kvkk',
  privacyPolicyLinkText: 'KVKK',
  consentBoxes: [{ text: 'KVKK metnini okudum.', required: true }],
  thankYouHeadline: 'Teşekkürler',
  thankYouBody: 'Arayacağız.',
  thankYouCtaText: 'Siteye git',
} as LeadFormInput;

function kur(okuma: () => Promise<Record<string, unknown>>) {
  const prisma = { withTenant: async <T>(_c: unknown, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
  let sayac = 0;
  const prov = {
    canWrite: () => ({ ok: true, missing: [] }),
    createLeadForm: vi.fn(async () => String(777 + sayac++)),
    readLeadForm: vi.fn(okuma),
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

async function temizOkuma(id: string): Promise<Record<string, unknown>> {
  const f = await forms.get(CTX, id);
  const r = kutuphaneFormuGovdesi(f, 'page-1');
  if (r.tur !== 'govde') throw new Error('ret');
  const a = r.govde.alanlar as Record<string, unknown>;
  return { id: '777', locale: 'TR_TR', is_optimized_for_quality: false, block_display_for_non_targeted_viewer: true, legal_content: { custom_disclaimer: a.custom_disclaimer } };
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

describe('KRİTİK: Meta formu açıldıktan sonraki hata satırı `failed` YAPMAMALI', () => {
  it('ön koşul: düzgün yolda tek form açılıyor ve satır published (test boşa düşmüyor)', async () => {
    const f = await forms.create(CTX, GIRDI);
    const { svc, prov } = kur(() => temizOkuma(f.id));
    const r = await svc.publish(CTX, f.id);
    expect(r.status).toBe('published');
    expect(r.externalFormId).toBe('777');
    expect(prov.createLeadForm).toHaveBeenCalledTimes(1);
  });

  it('B-1: markPublished düşerse (veritabanı/transaction) yeniden yayın Meta’da İKİNCİ form AÇMAMALI', async () => {
    const f = await forms.create(CTX, GIRDI);
    const { svc, prov } = kur(() => temizOkuma(f.id));
    const gercek = forms.markPublished.bind(forms);
    const spy = vi.spyOn(forms, 'markPublished').mockRejectedValueOnce(new Error('Transaction already closed'));

    await expect(svc.publish(CTX, f.id)).rejects.toThrow();
    // Meta'daki form kimliği HİÇBİR YERDE yok ve satır yeniden denenebilir.
    const ara = await forms.get(CTX, f.id);
    expect(ara.status, 'Meta formu açıldı ama satır failed: yeniden yayın ikinci form açar').not.toBe('failed');

    spy.mockImplementation(gercek);
    await svc.publish(CTX, f.id).catch(() => undefined);
    expect(prov.createLeadForm, 'aynı kayıt için Meta’da İKİ form').toHaveBeenCalledTimes(1);
  });

  it('B-1b: geri okuma beklenmedik biçim döndürürse (karşılaştırıcı patlar) form yine YAYINDA sayılmalı', async () => {
    // Graph liste elemanı null / metin dizge değil: `x.key` ve `text?.trim()`
    // TypeError atıyor, catch satırı failed yapıyor.
    const f = await forms.create(CTX, GIRDI);
    const { svc } = kur(async () => ({ id: '777', locale: 'TR_TR', legal_content: { custom_disclaimer: { checkboxes: [null, { key: 'x', text: 5 }] } } }));
    await svc.publish(CTX, f.id).catch(() => undefined);
    const son = await forms.get(CTX, f.id);
    expect(son.status).toBe('published');
    expect(son.externalFormId).toBe('777');
    expect(son.readbackWarning).toBeTruthy();
  });

  it('Ö: aynı form için eşzamanlı iki yayın isteği (iki sekme) tek Meta formu açmalı', async () => {
    const f = await forms.create(CTX, GIRDI);
    const { svc, prov } = kur(() => temizOkuma(f.id));
    await Promise.allSettled([svc.publish(CTX, f.id), svc.publish(CTX, f.id)]);
    expect(prov.createLeadForm).toHaveBeenCalledTimes(1);
  });
});

describe('geri okuma: doğrulanmayan alan "temiz" sayılmamalı', () => {
  it('Ö: CALL_BUSINESS numarası (biçimi CANLIDA ÖLÇÜLMEDİ) geri okunmuyor; Meta yok sayarsa sonuç "temiz"', () => {
    const r = kutuphaneFormuGovdesi(
      { ...(GIRDI as object), id: 'f', status: 'draft', thankYouCtaType: 'CALL_BUSINESS', thankYouPhone: '+902321234567', thankYouCtaText: 'Bizi ara', thankYouCtaUrl: null, version: 1 } as never,
      'page-1',
    );
    if (r.tur !== 'govde') throw new Error(JSON.stringify(r.retler));
    const a = r.govde.alanlar as Record<string, unknown>;
    expect((a.thank_you_page as Record<string, unknown>).button_type).toBe('CALL_BUSINESS');
    const okunan = { id: '777', locale: 'TR_TR', is_optimized_for_quality: false, block_display_for_non_targeted_viewer: true, legal_content: { custom_disclaimer: a.custom_disclaimer } };
    expect(formGeriOkumaDenetimi(a, okunan, null).sonuc).not.toBe('temiz');
  });
});

describe('N-1: gömülü form kalktı — formsuz ON_AD kampanya AÇILMADAN duruyor (eksik test, M7 mutasyonu yaşıyordu)', () => {
  it('publishDraft gövdesinde ret, ilk `/campaigns` POST’undan ÖNCE', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const p = readFileSync(join(__dirname, '../connections/providers/meta.provider.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const bas = p.indexOf('async publishDraft(');
    expect(bas).toBeGreaterThan(0);
    const govde = p.slice(bas);
    const ret = govde.search(/if \(!leadFormId && req\.spec\.destinationType === 'ON_AD'\) \{\s*throw new PlatformApiError\(\s*'meta',\s*'permanent'/);
    const kampanya = govde.indexOf('`${act}/campaigns`');
    expect(ret).toBeGreaterThan(0);
    expect(kampanya).toBeGreaterThan(ret);
  });
});

describe('N-2: KVKK kutuları HİÇ dönmezse "temiz" DEĞİL (eksik test, M5 mutasyonu yaşıyordu)', () => {
  it('legal_content gelmeyen okuma → dogrulanamadi ve uyarı KVKK’yı adıyla söylüyor', () => {
    const r = kutuphaneFormuGovdesi({ ...(GIRDI as object), id: 'f', status: 'draft', thankYouCtaUrl: null, version: 1 } as never, 'page-1');
    if (r.tur !== 'govde') throw new Error(JSON.stringify(r.retler));
    const a = r.govde.alanlar as Record<string, unknown>;
    const s = formGeriOkumaDenetimi(a, { id: '777', locale: 'TR_TR', is_optimized_for_quality: false, block_display_for_non_targeted_viewer: true }, null);
    expect(s.sonuc).toBe('dogrulanamadi');
    expect(JSON.stringify(s)).toMatch(/KVKK/);
  });
});
