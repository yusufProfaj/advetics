import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeadFormRecord } from '@advetics/shared';
import { MetaProvider } from '../connections/providers/meta.provider';
import { alanReddiMi, metaFormlariCoz, metaSayfaFormlariOku, seciliFormHali } from '../reklam/rehber/platform-okuma';
import { FormPublisherService } from './form-publisher.service';
import { kutuphaneFormuGovdesi } from './form-govdesi';

/**
 * ═══ TEK FORM ÜRETİCİSİ ═══
 *
 * Meta'da form açan gövde YALNIZ `derleForm`dan (shared) geliyor. Önceden
 * `MetaProvider` iki üretici taşıyordu: kütüphane yolu onay kutularını
 * Graph'te olmayan bir `legal_content` sarmalayıcısıyla gönderiyordu, gömülü
 * yol Advetics'in gizlilik sayfasına düşüyordu. Bu dosya (1) ikinci bir
 * üreticiyi kaynak taramasıyla yasaklıyor, (2) Graph'e giden isteği fixture
 * ile sınıyor, (3) yayından sonraki geri okumanın uyuşmazlığı SESSİZ
 * bırakmadığını kilitliyor.
 */
const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const KOK = join(__dirname, '../../..');

function tsDosyalari(dizin: string): string[] {
  const out: string[] = [];
  for (const ad of readdirSync(dizin)) {
    const yol = join(dizin, ad);
    if (statSync(yol).isDirectory()) {
      if (ad === 'node_modules' || ad === 'dist') continue;
      out.push(...tsDosyalari(yol));
    } else if (/\.tsx?$/.test(ad) && !/\.spec\.tsx?$/.test(ad)) out.push(yol);
  }
  return out;
}

describe('kaynak taraması: ikinci form üreticisi yok', () => {
  const dosyalar = [...tsDosyalari(join(KOK, 'src')), ...tsDosyalari(join(KOK, '../../packages/shared/src'))];

  it('tarama gerçekten dosya gördü (boşa düşmüyor)', () => {
    expect(dosyalar.length).toBeGreaterThan(100);
    expect(dosyalar.some((d) => d.endsWith('reklam/meta/form.ts'))).toBe(true);
    expect(dosyalar.some((d) => d.endsWith('providers/meta.provider.ts'))).toBe(true);
  });

  it('KRİTİK: form gövdesinin anahtarlarını (onay kutusu, teşekkür ekranı, kalite adımı) YALNIZ shared form.ts yazıyor', () => {
    const yazanlar = dosyalar.filter((d) => /\b(custom_disclaimer|thank_you_page|context_card|is_optimized_for_quality|legal_content)\s*:/.test(yorumsuz(readFileSync(d, 'utf8'))));
    expect(yazanlar.map((d) => d.slice(d.indexOf('src/')))).toEqual(['src/reklam/meta/form.ts']);
  });

  it('sağlayıcıda gömülü form yok; createLeadForm gövde KURMUYOR, yalnız gönderiyor', () => {
    const p = yorumsuz(readFileSync(join(KOK, 'src/modules/connections/providers/meta.provider.ts'), 'utf8'));
    expect(p).not.toContain('createEmbeddedLeadForm');
    const bas = p.indexOf('async createLeadForm(');
    const son = p.indexOf('async readLeadForm(');
    expect(bas).toBeGreaterThan(0);
    expect(son).toBeGreaterThan(bas);
    const govde = p.slice(bas, son);
    expect(govde).toContain('Object.entries(req.alanlar)');
    expect(govde).not.toMatch(/questions|privacy_policy|JSON\.stringify\(\{/);
  });

  it('yayın yolu gövdeyi kutuphaneFormuGovdesi → derleForm ile alıyor ve geri okuyor', () => {
    const y = yorumsuz(readFileSync(join(__dirname, 'form-publisher.service.ts'), 'utf8'));
    expect(y).toContain('kutuphaneFormuGovdesi(form, auth.pageExternalId)');
    expect(y).toMatch(/markPublished\(ctx, formId, externalId, uyari\)/);
    expect(yorumsuz(readFileSync(join(__dirname, 'form-govdesi.ts'), 'utf8'))).toContain('return derleForm(');
  });
});

// ─── Fixture'lar ────────────────────────────────────────────────────────────

const KAYIT: LeadFormRecord = {
  id: 'f1',
  clientId: 'c1',
  socialProfileId: 's1',
  socialProfileName: 'Sayfa',
  name: 'Teklif formu',
  formType: 'more_volume',
  headline: 'Ücretsiz keşif',
  intro: '24 saatte arıyoruz.',
  prefillQuestions: ['FULL_NAME', 'PHONE'],
  customQuestions: [{ type: 'multiple_choice', label: 'Ne zaman?', options: ['Hemen', 'Sonra'] }],
  privacyPolicyUrl: 'https://ege.com.tr/kvkk',
  privacyPolicyLinkText: 'KVKK',
  consentBoxes: [{ text: 'KVKK metnini okudum.', required: true }],
  thankYouHeadline: 'Teşekkürler',
  thankYouBody: 'Arayacağız.',
  thankYouCtaText: 'Bizi ara',
  thankYouCtaUrl: null,
  thankYouCtaType: 'CALL_BUSINESS',
  thankYouPhone: '+902321234567',
  readbackWarning: null,
  status: 'draft',
  externalFormId: null,
  version: 1,
  rootId: 'f1',
  supersededById: null,
  error: null,
  publishedAt: null,
  createdAt: '2026-10-12T00:00:00.000Z',
};

describe('kütüphane formu → derleyici', () => {
  it('KRİTİK: "daha fazla hacim" formu is_optimized_for_quality=false AÇIKÇA; KVKK kutusu zorunlu ve üst seviye', () => {
    const r = kutuphaneFormuGovdesi(KAYIT, '111');
    if (r.tur !== 'govde') throw new Error(JSON.stringify(r.retler));
    const a = r.govde.alanlar as Record<string, any>;
    expect(r.govde.uc).toBe('111/leadgen_forms');
    expect(a.is_optimized_for_quality).toBe(false);
    expect(a.locale).toBe('TR_TR');
    expect(a.custom_disclaimer.checkboxes).toEqual([{ key: 'onay_1', text: 'KVKK metnini okudum.', is_required: true, is_checked_by_default: false }]);
    expect(a.thank_you_page).toMatchObject({ button_type: 'CALL_BUSINESS', business_phone_number: '+902321234567' });
    expect(a.context_card).toEqual({ title: 'Ücretsiz keşif', content: ['24 saatte arıyoruz.'], style: 'LIST_STYLE', button_text: 'Devam' });
    expect(a.questions[2]).toMatchObject({ type: 'CUSTOM', key: 'soru_1', label: 'Ne zaman?' });
  });

  it('Advetics’in gizlilik sayfası artık REDDEDİLİYOR (gömülü yolun eski yedeği)', () => {
    const r = kutuphaneFormuGovdesi({ ...KAYIT, privacyPolicyUrl: 'https://advetics.com/gizlilik' }, '111');
    expect(r.tur === 'ret' && r.retler.map((x) => x.kod)).toEqual(['FRM-01']);
  });
});

const YANIT = (govde: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => govde, text: async () => JSON.stringify(govde) }) as unknown as Response;
const provider = () => new MetaProvider({ platforms: { meta: { appId: 'a', appSecret: 's', apiVersion: 'v25.0' } } } as never);

let orijinal: typeof fetch;
beforeEach(() => {
  orijinal = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = orijinal;
  vi.restoreAllMocks();
});

describe('Graph isteği (fixture)', () => {
  it('KRİTİK: POST /{sayfa}/leadgen_forms sayfa token’ıyla; custom_disclaimer ÜST SEVİYE JSON, legal_content yok, boolean’lar açık', async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => YANIT({ id: '777' }));
    globalThis.fetch = f as unknown as typeof fetch;
    const r = kutuphaneFormuGovdesi(KAYIT, '111');
    if (r.tur !== 'govde') throw new Error('ret');
    const id = await provider().createLeadForm({ accessToken: 'U', accountExternalId: '111' }, { pageExternalId: '111', pageAccessToken: 'SAYFA', alanlar: r.govde.alanlar });
    expect(id).toBe('777');
    const [adres, init] = f.mock.calls[0]!;
    expect(adres).toBe('https://graph.facebook.com/v25.0/111/leadgen_forms');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer SAYFA');
    const p = new URLSearchParams(String(init!.body));
    expect(p.has('legal_content')).toBe(false);
    expect(JSON.parse(p.get('custom_disclaimer')!).checkboxes[0]).toEqual({ key: 'onay_1', text: 'KVKK metnini okudum.', is_required: true, is_checked_by_default: false });
    expect(p.get('locale')).toBe('TR_TR');
    expect(p.get('is_optimized_for_quality')).toBe('false');
    expect(p.get('block_display_for_non_targeted_viewer')).toBe('true');
  });

  it('geri okuma GET /{form}?fields=… sayfa token’ıyla', async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => YANIT({ id: '777', locale: 'TR_TR' }));
    globalThis.fetch = f as unknown as typeof fetch;
    const o = await provider().readLeadForm({ accessToken: 'U', accountExternalId: '111' }, { pageAccessToken: 'SAYFA', formId: '777', fields: 'id,locale' });
    expect(o).toEqual({ id: '777', locale: 'TR_TR' });
    expect(f.mock.calls[0]![0]).toBe('https://graph.facebook.com/v25.0/777?fields=id%2Clocale');
    await expect(provider().readLeadForm({ accessToken: 'U', accountExternalId: '1' }, { pageAccessToken: 'S', formId: '7/../x', fields: 'id' })).rejects.toThrow(/geçersiz/);
  });
});

describe('yayın: geri okuma uyuşmazlığı SESSİZ değil', () => {
  function kur(okuma: () => Promise<Record<string, unknown>>) {
    const markPublished = vi.fn(async () => undefined);
    const markFailed = vi.fn(async () => undefined);
    const forms = { get: vi.fn(async () => KAYIT), markPublished, markFailed, yayinSahiplen: vi.fn(async () => true), metaIstegiBasladi: vi.fn(async () => undefined), kimlikYaz: vi.fn(async () => undefined) };
    const prov = {
      canWrite: () => ({ ok: true, missing: [] }),
      createLeadForm: vi.fn(async () => '777'),
      readLeadForm: vi.fn(okuma),
    };
    const prisma = {
      withTenant: vi.fn(async (_c: unknown, fn: (tx: unknown) => unknown) =>
        fn({ $queryRaw: async () => [{ external_id: '111', page_access_token_enc: new Uint8Array([1]), granted_scopes: [], status: 'active' }] }),
      ),
    };
    const svc = new FormPublisherService(
      prisma as never,
      forms as never,
      { get: () => prov } as never,
      { decrypt: () => 'SAYFA' } as never,
      { acquire: async () => ({ allowed: true }), record: async () => undefined } as never,
    );
    return { svc, markPublished, markFailed, prov };
  }
  const ctx = { orgId: 'o', userId: 'u', clientIds: ['c1'] } as never;

  it('KRİTİK: KVKK kutusu Meta’da yoksa form YAYINDA ama uyarı kayda yazılıyor', async () => {
    const { svc, markPublished, markFailed } = kur(async () => ({ id: '777', locale: 'TR_TR', is_optimized_for_quality: false, block_display_for_non_targeted_viewer: true, legal_content: { custom_disclaimer: { checkboxes: [] } } }));
    await svc.publish(ctx, 'f1');
    expect(markFailed).not.toHaveBeenCalled();
    const uyari = (markPublished.mock.calls[0] as unknown[])[3] as string;
    expect(uyari).toMatch(/farklı duruyor/);
    expect(uyari).toContain('KVKK metnini okudum.');
  });

  it('geri okuma düşerse "doğrulanamadı" yazılıyor, temiz sayılmıyor', async () => {
    const { svc, markPublished } = kur(async () => {
      throw new Error('(#100) Tried accessing nonexisting field (legal_content)');
    });
    await svc.publish(ctx, 'f1');
    expect((markPublished.mock.calls[0] as unknown[])[3]).toMatch(/doğrulanamadı.*nonexisting field/);
  });

  it('aynı dönerse uyarı null', async () => {
    const r = kutuphaneFormuGovdesi(KAYIT, '111');
    if (r.tur !== 'govde') throw new Error('ret');
    const a = r.govde.alanlar as Record<string, unknown>;
    const { svc, markPublished } = kur(async () => ({
      id: '777',
      locale: 'TR_TR',
      is_optimized_for_quality: false,
      block_display_for_non_targeted_viewer: true,
      legal_content: { custom_disclaimer: a.custom_disclaimer },
      privacy_policy_url: 'https://ege.com.tr/kvkk',
      questions: a.questions,
      thank_you_page: { button_type: 'CALL_BUSINESS', business_phone_number: '+90 232 123 45 67' },
    }));
    await svc.publish(ctx, 'f1');
    expect((markPublished.mock.calls[0] as unknown[])[3]).toBeNull();
  });

  it('derleyici reddi Meta’ya GİTMEDEN (geri alınamaz adımın önünde)', async () => {
    const { svc, prov } = kur(async () => ({}));
    (svc as unknown as { forms: { get: () => Promise<LeadFormRecord> } }).forms.get = async () => ({ ...KAYIT, privacyPolicyLinkText: 'x'.repeat(71) });
    await expect(svc.publish(ctx, 'f1')).rejects.toThrow(/bağlantı metni/);
    expect(prov.createLeadForm).not.toHaveBeenCalled();
  });
});

describe('rehber form listesi: tür ve soru sayısı', () => {
  it('alan dönerse okunur, dönmezse BİLİNMİYOR (more_volume sayılmaz)', () => {
    const r = metaFormlariCoz({
      data: [
        { id: '1', name: 'A', status: 'ACTIVE', is_optimized_for_quality: true, questions: [{}, {}, {}] },
        { id: '2', name: 'B', status: 'ACTIVE', is_optimized_for_quality: false, questions: { data: [{}] } },
        { id: '3', name: 'C', status: 'ACTIVE' },
      ],
    });
    expect(r.satirlar.map((x) => [x.tur, x.soruSayisi])).toEqual([['higher_intent', 3], ['more_volume', 1], [null, null]]);
    expect(seciliFormHali('1', '1', r.satirlar)).toMatchObject({ tur: 'higher_intent', soruSayisi: 3 });
  });

  it('KRİTİK: ek alan reddedilirse liste TEMEL alanlarla yeniden istenir (form seçici boş kalmaz); başka hata yukarı', async () => {
    const istekler: string[] = [];
    const f = vi.fn(async (u: string) => {
      istekler.push(u);
      return u.includes('is_optimized_for_quality')
        ? YANIT({ error: { message: '(#100) Tried accessing nonexisting field (is_optimized_for_quality) on node type (LeadgenForm)', code: 100 } }, 400)
        : YANIT({ data: [{ id: '1', name: 'A', status: 'ACTIVE' }] });
    });
    const l = await metaSayfaFormlariOku('v25.0', '9001', 'T', f as unknown as typeof fetch);
    expect(l.satirlar).toHaveLength(1);
    expect(istekler).toHaveLength(2);
    expect(alanReddiMi(new Error('Meta: (#100) Tried accessing nonexisting field (x)'))).toBe(true);
    expect(alanReddiMi(new Error('(#200) izin yok'))).toBe(false);
    const izin = vi.fn(async () => YANIT({ error: { message: '(#200) izin yok', code: 200 } }, 403));
    await expect(metaSayfaFormlariOku('v25.0', '9001', 'T', izin as unknown as typeof fetch)).rejects.toThrow(/izin/);
    expect(izin).toHaveBeenCalledTimes(1);
  });
});
