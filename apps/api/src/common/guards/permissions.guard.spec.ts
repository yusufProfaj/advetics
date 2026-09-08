import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { assertOrgAdmin, assertPermissions } from './permissions.guard';

/**
 * `assertPermissions`/`assertOrgAdmin` — HTTP guard'ın ve AI asistanının
 * tool-executor'ının PAYLAŞTIĞI yetki çekirdeği.
 *
 * KRİTİK: bu iki fonksiyon doğduğu andan itibaren tek yetkilendirme yolu.
 * Burada bir mutasyon (örn. `missing.length > 0` yerine `> 1`) sessizce
 * eksik yetkiyi görmezden gelirdi — hem HTTP uçlarında hem chat tool
 * çağrılarında.
 */

function ctx(perms: string[] = [], isOrgAdmin = false): TenantContext {
  return {
    orgId: 'org-1',
    userId: 'user-1',
    clientIds: [],
    isOrgAdmin,
    permissions: perms,
  } as unknown as TenantContext;
}

describe('assertPermissions', () => {
  it('tüm izinler varken sessizce geçiyor', () => {
    expect(() =>
      assertPermissions(ctx(['bulk.read', 'bulk.write']), 'bulk.write' as never),
    ).not.toThrow();
  });

  it('hiç izin istenmiyorsa (boş liste) her zaman geçiyor', () => {
    expect(() => assertPermissions(ctx([]))).not.toThrow();
  });

  it('EKSİK İZİN 403 fırlatıyor VE eksik olanı isimle söylüyor', () => {
    // Genel "yetkisiz" mesajı değil — hangi izin eksik, ki teşhis edilebilsin.
    expect(() =>
      assertPermissions(ctx(['bulk.read']), 'bulk.write' as never, 'budget.write' as never),
    ).toThrow(ForbiddenException);

    try {
      assertPermissions(ctx(['bulk.read']), 'bulk.write' as never, 'budget.write' as never);
      throw new Error('beklenen hata fırlamadı');
    } catch (err) {
      expect((err as ForbiddenException).message).toContain('bulk.write');
      expect((err as ForbiddenException).message).toContain('budget.write');
    }
  });

  it('KISMİ eksiklik de reddediliyor — bir izin yeterli değil', () => {
    expect(() =>
      assertPermissions(ctx(['bulk.write']), 'bulk.write' as never, 'bulk.publish' as never),
    ).toThrow(/bulk\.publish/);
  });
});

describe('assertOrgAdmin', () => {
  it('org yöneticisiyse geçiyor', () => {
    expect(() => assertOrgAdmin(ctx([], true))).not.toThrow();
  });

  it('org yöneticisi DEĞİLSE 403 fırlatıyor', () => {
    expect(() => assertOrgAdmin(ctx([], false))).toThrow(ForbiddenException);
  });
});
