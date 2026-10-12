import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { LeadFormInput, TenantContext } from '@advetics/shared';
import { FORM_YAYIN_YASLI_DAKIKA } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { FormsService } from './forms.service';

/**
 * AYIRMA OKUMAYI DÜŞÜREMEZ (Ajan 4 N-1).
 *
 * Yarım kalan yayının ayrılması liste/detay OKUMASINDA bir UPDATE. UPDATE
 * bir politika tarafından REDDEDİLİRSE (burada WITH CHECK false ile
 * daraltılmış bir UPDATE politikası) okuma yine dönmeli ve satır
 * `publishing` kalmalı (yeniden yayın kapalı = güvenli taraf). Ayırma aynı
 * işlemde olsaydı düşen deyim işlemin kalanını da öldürürdü; o yüzden test
 * her `withTenant`ı GERÇEK bir işlem (BEGIN/COMMIT/ROLLBACK) olarak kuruyor.
 */
let h: Harness;
const APP_ROLE = 'advetics_form_ayirma_rls';
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

let duz: FormsService;

function rlsServisi(): FormsService {
  const prisma = {
    withTenant: async <T>(c: TenantContext, fn: (tx: unknown) => Promise<T>) => {
      await h.q('BEGIN');
      try {
        await h.q(`
          SELECT set_config('app.current_org_id', '${c.orgId}', true),
                 set_config('app.current_user_id', '${c.userId}', true),
                 set_config('app.current_client_ids', '${c.clientIds.join(',')}', true),
                 set_config('app.is_org_admin', '${c.isOrgAdmin ? 'on' : 'off'}', true),
                 set_config('app.current_active_client_id', '', true)`);
        await h.q(`SET LOCAL ROLE ${APP_ROLE}`);
        const r = await fn(h.db);
        await h.q('COMMIT');
        return r;
      } catch (e) {
        await h.q('ROLLBACK');
        throw e;
      }
    },
  } as unknown as PrismaService;
  return new FormsService(prisma);
}

async function yarimSatir(): Promise<string> {
  const f = await duz.create(CTX, GIRDI);
  await duz.yayinSahiplen(CTX, f.id);
  await h.q(`UPDATE lead_forms SET updated_at = now() - make_interval(mins => $2::int) WHERE id = $1`, [f.id, FORM_YAYIN_YASLI_DAKIKA + 1]);
  return f.id;
}

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
  await h.q(`DROP POLICY IF EXISTS ayirma_daralt ON lead_forms`);
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, page_access_token_enc, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', 'page-1', 'Sayfa', '\\x01', now())`,
    [PROFILE, IDS.org, IDS.client, IDS.connection],
  );
});

describe('ayırma UPDATE’i reddedilirse okuma yine döner', () => {
  it('ön koşul: politika daraltılmamışken ayırma RLS altında çalışıyor', async () => {
    const id = await yarimSatir();
    expect((await rlsServisi().get(CTX, id)).status).toBe('failed');
  });

  it('KRİTİK: daraltılmış UPDATE politikasında liste ve detay DÜŞMÜYOR, satır publishing kalıyor', async () => {
    const id = await yarimSatir();
    await h.q(`CREATE POLICY ayirma_daralt ON lead_forms AS RESTRICTIVE FOR UPDATE USING (true) WITH CHECK (false)`);
    const svc = rlsServisi();
    // Politika GERÇEKTEN reddediyor (yoksa aşağıdaki iddia boşa düşerdi).
    await expect(svc.markFailed(CTX, id, 'x')).rejects.toThrow(/row-level security/);

    const liste = await svc.list(CTX, IDS.client);
    expect(liste.map((x) => [x.id, x.status])).toEqual([[id, 'publishing']]);
    expect((await svc.get(CTX, id)).status).toBe('publishing');
  });
});
