import { SetMetadata, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Permission } from '@advetics/shared';
import type { AuthedRequest } from '../types/request';

/**
 * Rotayı kimlik doğrulamadan muaf tutar.
 *
 * JwtAuthGuard global olarak bağlıdır — yani varsayılan KİLİTLİDİR. Bir rotayı
 * açmak kasıtlı bir eylem gerektirir. Tersi (varsayılan açık, kilitlemek için
 * decorator) er ya da geç unutulan bir endpoint üretir.
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/** Rotanın gerektirdiği yetkiler. Hepsi birden sağlanmalıdır (AND). */
export const PERMISSIONS_KEY = 'requiredPermissions';
export const RequirePermissions = (
  ...permissions: Permission[]
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSIONS_KEY, permissions);

/** Yalnızca org geneli yetkili roller (owner/admin) erişebilir. */
export const ORG_ADMIN_KEY = 'requiresOrgAdmin';
export const RequireOrgAdmin = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ORG_ADMIN_KEY, true);

/** İsteğin tenant bağlamını enjekte eder. */
export const CurrentTenant = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.tenant;
});

/** Kimliği doğrulanmış kullanıcının temel bilgilerini enjekte eder. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return req.actor;
});

/** Denetim kaydı için istek meta verisi. */
export const RequestMetaParam = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  return {
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
    requestId: req.requestId,
  };
});
