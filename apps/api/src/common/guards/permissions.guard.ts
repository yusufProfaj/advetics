import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission, TenantContext } from '@advetics/shared';
import { ORG_ADMIN_KEY, PERMISSIONS_KEY } from '../decorators';
import type { AuthedRequest } from '../types/request';

/**
 * Yetki çekirdeği — İKİ GİRİŞ NOKTASINDAN ÇAĞRILIYOR.
 *
 * Guard bunu HTTP isteği üstünden çağırıyor; AI asistanının tool-executor'ı
 * (senkron tool çağrıları, ayrı bir HTTP round-trip'i yok) da AYNI
 * fonksiyonu her yazma tool'undan önce çağırıyor. İkinci bir yetkilendirme
 * yolu (örn. tool-executor içine kopyalanmış bir kontrol) doğduğu anda
 * ayrışma riski taşırdı — biri güncellenip diğeri unutulursa bir rol iki
 * yerden iki farklı cevap alır.
 */
export function assertPermissions(ctx: TenantContext, ...perms: Permission[]): void {
  if (perms.length === 0) return;

  const granted = new Set(ctx.permissions);
  const missing = perms.filter((p) => !granted.has(p));
  if (missing.length > 0) {
    throw new ForbiddenException(`Eksik yetki: ${missing.join(', ')}`);
  }
}

export function assertOrgAdmin(ctx: TenantContext): void {
  if (!ctx.isOrgAdmin) {
    throw new ForbiddenException('Bu işlem organizasyon yöneticisi yetkisi gerektirir');
  }
}

/**
 * Yetki kontrolü.
 *
 * Bu guard RLS'in YERİNE GEÇMEZ, onun üstüne biner:
 *   - Guard "bu eylemi yapabilir misin?" sorusunu yanıtlar (403 üretir).
 *   - RLS "hangi satırları görebilirsin?" sorusunu yanıtlar (satırı yok sayar).
 *
 * İkisi de gereklidir. Guard olmadan bir analyst kendi müşterisinin bütçesini
 * değiştirebilirdi; RLS olmadan bir kod hatası başka müşterinin satırlarını sızdırırdı.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiresOrgAdmin = this.reflector.getAllAndOverride<boolean | undefined>(ORG_ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length && !requiresOrgAdmin) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const tenant = req.tenant;

    if (!tenant) {
      throw new ForbiddenException('Yetki bağlamı bulunamadı');
    }

    if (requiresOrgAdmin) assertOrgAdmin(tenant);
    if (required?.length) assertPermissions(tenant, ...required);

    return true;
  }
}
