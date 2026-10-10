import { Prisma } from '@prisma/client';
import type { TenantContext } from '@advetics/shared';

/**
 * REHBERİN "AJANS YÖNETİCİSİ" KURALI — TEK YER.
 *
 * `deneme` açılışlı amaçları (REHBER_ACILIS) yalnız ajans yöneticisi görür.
 * Kural iki uçta okunuyordu ve AYRIŞTI (Ajan 4, BULGU-5): hazırlık ucu eski
 * ifadeyle (ajans şirketinin İÇİNDEYKEN) panelin görünürlüğünü, rehber
 * servisi yeni ifadeyle sunucunun kararını veriyordu. Sonuç: ajans çalışanı
 * müşteri şirketine geçince sunucu "açık" derken panel kartı gizliyor; üst
 * hesabı olmayan şirketin admininde panel kartı gösterip sunucu reddediyor.
 *
 * Kural: platform sahibi YA DA bağlamdaki üst hesabın ADMIN üyesi. Müşteri
 * şirketinin kendi yöneticisi `isOrgAdmin` ama üst hesap üyesi değil.
 * Üst hesap yoksa ajans bilinmiyor → kapalı (CLAUDE.md "havuzun iki sahibi").
 * `manager_memberships` RLS'i yalnız bağlamdaki üst hesabı gösteriyor ve
 * `managerAccountId` sunucuda üyelik listesine karşı çözülüyor.
 */
type Sorgucu = { $queryRaw: <T = unknown>(q: Prisma.Sql) => Promise<T> };

export async function ajansYoneticisiMi(tx: Sorgucu, ctx: Pick<TenantContext, 'platformAdmin' | 'managerAccountId' | 'userId'>): Promise<boolean> {
  if (ctx.platformAdmin) return true;
  if (!ctx.managerAccountId) return false;
  const [r] = await tx.$queryRaw<Array<{ var: boolean }>>(Prisma.sql`
    SELECT EXISTS (
      SELECT 1 FROM manager_memberships
       WHERE manager_account_id = ${ctx.managerAccountId}::uuid AND user_id = ${ctx.userId}::uuid AND role = 'admin'
    ) AS var`);
  return r?.var === true;
}
