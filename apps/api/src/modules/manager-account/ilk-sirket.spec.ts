import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { createHarness, type Harness } from '../../../test/pglite-harness';
import { ilkSirketAc } from './ilk-sirket';

/**
 * `ilkSirketAc` gerçek veritabanında: şirket + org geneli owner üyeliği.
 * Kaynak taraması "çağrılıyor" der; burası "çağrılınca ne olur".
 */
let h: Harness;
const MGR = 'aaaaaaaa-0000-0000-0000-00000000000f';
const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '55555555-5555-5555-5555-555555555555';

beforeAll(async () => {
  h = await createHarness();
}, 180_000);
afterAll(() => h.close());

beforeEach(async () => {
  await h.reset();
  await h.q(`INSERT INTO manager_accounts (id, name, slug, updated_at) VALUES ($1,'Yılmaz Mobilya','yilmaz',now())`, [MGR]);
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1,'Advetics','advetics',now())`, [ORG]);
  await h.q(`INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at) VALUES ($1,$2,'a@b.c','x','A',now())`, [USER, ORG]);
});

/** Koşum ortamının PGlite bağlantısını Prisma'nın `TransactionClient` yüzeyine sarar. */
function tx() {
  return h.db as unknown as Parameters<typeof ilkSirketAc>[0];
}

describe('ilkSirketAc', () => {
  it('KRİTİK: şirket üst hesabın ALTINDA ve açan kişi org geneli OWNER', async () => {
    const org = await ilkSirketAc(tx(), { managerAccountId: MGR, ad: 'Yılmaz Mobilya', userId: USER });
    const [satir] = await h.q<{ manager_account_id: string; name: string }>(
      'SELECT manager_account_id, name FROM organizations WHERE id = $1', [org.id]);
    expect(satir?.manager_account_id).toBe(MGR);
    expect(satir?.name).toBe('Yılmaz Mobilya');
    const uyelik = await h.q<{ role: string; client_id: string | null }>(
      'SELECT role, client_id FROM memberships WHERE user_id = $1 AND org_id = $2', [USER, org.id]);
    expect(uyelik).toEqual([{ role: 'owner', client_id: null }]);
  });

  it('KRİTİK: kısa ad çakışınca TEKİLLEŞİYOR — ikinci "Yılmaz Mobilya" düşmüyor', async () => {
    // İlk şirket üst hesabın adıyla açılıyor; aynı adlı iki müşteri
    // olabilir ve `slug` tekil. Çakışmada patlamak, kuruluşu yarım bırakırdı.
    const a = await ilkSirketAc(tx(), { managerAccountId: MGR, ad: 'Yılmaz Mobilya', userId: USER });
    const b = await ilkSirketAc(tx(), { managerAccountId: MGR, ad: 'Yılmaz Mobilya', userId: USER });
    expect(a.slug).not.toBe(b.slug);
  });
});
