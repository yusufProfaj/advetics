import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeadFormInput, TenantContext } from '@advetics/shared';
import { FORM_YAYIN_YASLI_DAKIKA } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { PlatformApiError } from '../connections/provider.types';
import { FormsService } from './forms.service';
import { FormPublisherService } from './form-publisher.service';
import { FormsController } from './forms.controller';

/**
 * AJAN 4 KAPISI — yarım kalan form yayını (14a0adb2).
 *
 * (1) OKUMA YAN ETKİSİ RLS ALTINDA. Ayırma liste/detay OKUMASINDA bir UPDATE.
 * Koşum ortamı RLS'i kapattığı için `form-yarim-yayin.spec.ts` bunu hiç
 * sınamıyor: müşteri hesabı (org yöneticisi DEĞİL, tek workspace) okurken
 * UPDATE reddedilseydi okuma TAMAMEN düşerdi — "formlarım açılmıyor". Burada
 * `SET ROLE` ile politika gerçekten uygulanıyor ve servisin GERÇEK sorgusu
 * koşuyor (kopya değil). Başka workspace'in satırına da dokunulmamalı.
 *
 * (2) BELİRSİZ META HATASI. Damganın amacı "Meta'da form açılmış olabilir"
 * hâlini `failed`dan ayırmak. Zaman aşımı / ağ hatası / 5xx (`transient`)
 * TAM OLARAK o hâl: istek Meta'ya ulaşmış ve form açılmış olabilir. Satır
 * `failed` olursa yeniden yayın ikinci formu açar (CLAUDE.md "Kayıt
 * yazılamazsa satır failed DEĞİL").
 */
let h: Harness;
const APP_ROLE = 'advetics_form_rls_test';
const PROFILE = '66666666-6666-6666-6666-666666666667';
const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PROFILE_B = '66666666-6666-6666-6666-66666666666b';
const ADMIN = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client, CLIENT_B], isOrgAdmin: true } as TenantContext;
const MUSTERI = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], isOrgAdmin: false } as TenantContext;

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

/** RLS'siz (worker taklidi) servis — kurulum için. */
let duz: FormsService;

/**
 * Politika uygulanan servis: her `withTenant` bağlamı kurar ve sahibi
 * olmayan role geçer (üretimdeki `SET LOCAL` + uygulama rolünün taklidi).
 */
function rlsServisi(): FormsService {
  const prisma = {
    withTenant: async <T>(c: TenantContext, fn: (tx: unknown) => Promise<T>) => {
      await h.q(`
        SELECT set_config('app.current_org_id', '${c.orgId}', false),
               set_config('app.current_user_id', '${c.userId}', false),
               set_config('app.current_client_ids', '${c.clientIds.join(',')}', false),
               set_config('app.is_org_admin', '${c.isOrgAdmin ? 'on' : 'off'}', false),
               set_config('app.current_active_client_id', '', false)`);
      await h.q(`SET ROLE ${APP_ROLE}`);
      try {
        return await fn(h.db);
      } finally {
        await h.q('RESET ROLE');
      }
    },
  } as unknown as PrismaService;
  return new FormsService(prisma);
}

async function yaslandir(id: string): Promise<void> {
  await h.q(`UPDATE lead_forms SET updated_at = now() - make_interval(mins => $2::int) WHERE id = $1`, [id, FORM_YAYIN_YASLI_DAKIKA + 1]);
}
const durum = async (id: string) =>
  (await h.q<{ status: string }>(`SELECT status FROM lead_forms WHERE id = $1`, [id]))[0]!.status;

beforeAll(async () => {
  h = await createHarness();
  duz = new FormsService({ withTenant: async <T>(_c: unknown, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService);
  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  await h.q(`ALTER TABLE lead_forms ENABLE ROW LEVEL SECURITY`);
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'B', 'b', now())`, [CLIENT_B, IDS.org]);
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, page_access_token_enc, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', 'page-1', 'Sayfa', '\\x01', now()),
            ($5, $2, $6, $4, 'facebook_page', 'page-2', 'Sayfa B', '\\x01', now())`,
    [PROFILE, IDS.org, IDS.client, IDS.connection, PROFILE_B, CLIENT_B],
  );
  vi.restoreAllMocks();
});

describe('okuma anındaki ayırma RLS altında (müşteri hesabı)', () => {
  it('KRİTİK: org yöneticisi OLMAYAN kullanıcının listesi düşmüyor ve kendi yarım satırı ayrılıyor', async () => {
    const f = await duz.create(ADMIN, GIRDI);
    await duz.yayinSahiplen(ADMIN, f.id);
    await duz.metaIstegiBasladi(ADMIN, f.id);
    await yaslandir(f.id);

    const liste = await rlsServisi().list(MUSTERI, IDS.client);
    expect(liste.map((x) => [x.id, x.status])).toEqual([[f.id, 'uncertain']]);
    expect(await durum(f.id)).toBe('uncertain');
  });

  it('KRİTİK: başka workspace’in yarım satırına DOKUNULMUYOR (okuma yan etkisi kapsamın dışına taşmıyor)', async () => {
    const b = await duz.create(ADMIN, { ...GIRDI, clientId: CLIENT_B, socialProfileId: PROFILE_B });
    await duz.yayinSahiplen(ADMIN, b.id);
    await yaslandir(b.id);

    // Müşteri B'yi göremiyor; kendi listesini okumak B'nin satırını değiştirmemeli.
    await rlsServisi().list(MUSTERI, IDS.client);
    await expect(rlsServisi().get(MUSTERI, b.id)).rejects.toThrow(/bulunamadı/);
    expect(await durum(b.id)).toBe('publishing');
  });

  it('detay da RLS altında ayırıyor (yayın `get` ile başlıyor)', async () => {
    const f = await duz.create(ADMIN, GIRDI);
    await duz.yayinSahiplen(ADMIN, f.id);
    await yaslandir(f.id);
    expect((await rlsServisi().get(MUSTERI, f.id)).status).toBe('failed');
  });
});

describe('belirsiz Meta hatası (zaman aşımı / ağ / 5xx)', () => {
  function kur(hata: unknown) {
    const prisma = { withTenant: async <T>(_c: unknown, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
    const prov = {
      canWrite: () => ({ ok: true, missing: [] }),
      createLeadForm: vi.fn(async () => {
        throw hata;
      }),
      readLeadForm: vi.fn(async () => {
        throw new Error('okunmadı');
      }),
    };
    const svc = new FormPublisherService(
      prisma as never,
      duz,
      { get: () => prov } as never,
      { decrypt: () => 'SAYFA' } as never,
      { acquire: async () => ({ allowed: true }), record: async () => undefined } as never,
    );
    return { svc, prov };
  }

  it('KRİTİK: zaman aşımı (`transient`) satırı failed YAPMAMALI — Meta formu açmış olabilir (uncertain)', async () => {
    const f = await duz.create(ADMIN, GIRDI);
    const { svc } = kur(new PlatformApiError('meta', 'transient', 'İstek 30000ms içinde tamamlanmadı'));
    await expect(svc.publish(ADMIN, f.id)).rejects.toThrow();
    // `failed` = yeniden denenebilir = ikinci form. Belirsizlik `uncertain` ister.
    expect(await durum(f.id)).toBe('uncertain');
  });

  it('kesin ret (`permanent`) failed kalır: Meta isteği reddetti, form açılmadı', async () => {
    const f = await duz.create(ADMIN, GIRDI);
    const { svc } = kur(new PlatformApiError('meta', 'permanent', '(#100) Invalid parameter'));
    await expect(svc.publish(ADMIN, f.id)).rejects.toThrow();
    expect(await durum(f.id)).toBe('failed');
  });
});

describe('onay kapısı: yalnız `true` onay sayılır', () => {
  it('KRİTİK: "evet", 1, gövdesiz istek belirsiz satırı AÇMAZ; yalnız true geçer', async () => {
    const gelen: unknown[] = [];
    const ctl = new FormsController({} as never, { publish: async (_c: unknown, _i: unknown, o: unknown) => void gelen.push(o) } as never);
    for (const body of [{ belirsizOnayi: 'evet' }, { belirsizOnayi: 1 }, { belirsizOnayi: 'true' }, undefined, { belirsizOnayi: true }]) {
      await ctl.publish(ADMIN, 'x', body as never);
    }
    expect(gelen).toEqual([{ belirsizOnayi: false }, { belirsizOnayi: false }, { belirsizOnayi: false }, { belirsizOnayi: false }, { belirsizOnayi: true }]);
  });
});
