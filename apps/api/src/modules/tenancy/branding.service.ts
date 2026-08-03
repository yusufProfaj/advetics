import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { TenantContext, UpsertBrandingInput } from '@advetics/shared';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface ResolvedBranding {
  logoUrl: string | null;
  logoDarkUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  emailFromName: string;
  emailFromAddress: string | null;
  footerText: string | null;
  hidePoweredBy: boolean;
  source: 'client' | 'organization';
}

/**
 * White-label marka profili.
 *
 * Çözümleme sırası: müşteriye özel profil → organizasyon varsayılanı.
 * Müşteri profilinde BOŞ bırakılan her alan organizasyon değerini devralır;
 * böylece "sadece logoyu değiştir" senaryosu tüm paleti kopyalamayı gerektirmez.
 */
@Injectable()
export class BrandingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: PrismaAdminService,
    private readonly audit: AuditService,
  ) {}

  async resolve(ctx: TenantContext, clientId: string | null): Promise<ResolvedBranding> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const [orgDefault, clientProfile] = await Promise.all([
        tx.brandingProfile.findFirst({ where: { clientId: null } }),
        clientId ? tx.brandingProfile.findUnique({ where: { clientId } }) : Promise.resolve(null),
      ]);

      if (!orgDefault && !clientProfile) {
        throw new NotFoundException('Marka profili bulunamadı');
      }

      return this.merge(orgDefault, clientProfile);
    });
  }

  /**
   * Custom domain çözümlemesi.
   *
   * Kimlik doğrulaması YOKTUR ve olamaz: bu, Next.js middleware'inin
   * `rapor.musterim.com` isteği geldiğinde hangi markayı render edeceğini
   * öğrendiği yerdir; henüz bir oturum yoktur.
   *
   * Sızdırılan bilgi bilinçli olarak markalama ile sınırlıdır — logo, renk,
   * yazı tipi. Hiçbir müşteri verisi, kullanıcı bilgisi veya id dönmez.
   * Yalnızca DOĞRULANMIŞ domain'ler yanıtlanır.
   */
  async resolveByDomain(host: string): Promise<ResolvedBranding | null> {
    const domain = host.toLowerCase().split(':')[0];
    if (!domain) return null;

    const profile = await this.admin.brandingProfile.findFirst({
      where: { customDomain: domain, domainVerifiedAt: { not: null } },
    });
    if (!profile) return null;

    const orgDefault = await this.admin.brandingProfile.findFirst({
      where: { orgId: profile.orgId, clientId: null },
    });

    return this.merge(orgDefault, profile);
  }

  async upsert(ctx: TenantContext, input: UpsertBrandingInput, meta: Meta) {
    return this.prisma.withTenant(ctx, async (tx) => {
      if (input.clientId) {
        const client = await tx.client.findUnique({ where: { id: input.clientId } });
        if (!client) throw new NotFoundException('Müşteri bulunamadı');
      }

      const existing = input.clientId
        ? await tx.brandingProfile.findUnique({ where: { clientId: input.clientId } })
        : await tx.brandingProfile.findFirst({ where: { clientId: null } });

      // Custom domain değiştiyse doğrulama sıfırlanır. Doğrulanmamış bir domain
      // servis edilmez — aksi halde başkasının alan adını kendi paneline
      // yönlendirmek mümkün olurdu.
      const domainChanged =
        input.customDomain !== undefined && input.customDomain !== existing?.customDomain;

      const data = {
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.logoDarkUrl !== undefined ? { logoDarkUrl: input.logoDarkUrl } : {}),
        ...(input.faviconUrl !== undefined ? { faviconUrl: input.faviconUrl } : {}),
        ...(input.primaryColor !== undefined ? { primaryColor: input.primaryColor } : {}),
        ...(input.accentColor !== undefined ? { accentColor: input.accentColor } : {}),
        ...(input.fontFamily !== undefined ? { fontFamily: input.fontFamily } : {}),
        ...(input.emailFromName !== undefined ? { emailFromName: input.emailFromName } : {}),
        ...(input.emailFromAddress !== undefined
          ? { emailFromAddress: input.emailFromAddress }
          : {}),
        ...(input.footerText !== undefined ? { footerText: input.footerText } : {}),
        ...(input.hidePoweredBy !== undefined ? { hidePoweredBy: input.hidePoweredBy } : {}),
        ...(domainChanged
          ? {
              customDomain: input.customDomain ?? null,
              domainVerifiedAt: null,
              domainVerifyToken: input.customDomain
                ? `advetics-verify=${randomBytes(16).toString('hex')}`
                : null,
            }
          : {}),
      };

      const saved = existing
        ? await tx.brandingProfile.update({ where: { id: existing.id }, data })
        : await tx.brandingProfile.create({
            data: { orgId: ctx.orgId, clientId: input.clientId, ...data },
          });

      await this.audit.record(tx, ctx, {
        action: 'branding.updated',
        targetType: 'branding_profile',
        targetId: saved.id,
        clientId: input.clientId,
        before: existing
          ? { primaryColor: existing.primaryColor, customDomain: existing.customDomain }
          : null,
        after: { primaryColor: saved.primaryColor, customDomain: saved.customDomain },
        ...meta,
      });

      return saved;
    });
  }

  private merge(
    orgDefault: {
      logoUrl: string | null;
      logoDarkUrl: string | null;
      faviconUrl: string | null;
      primaryColor: string;
      accentColor: string;
      fontFamily: string;
      emailFromName: string;
      emailFromAddress: string | null;
      footerText: string | null;
      hidePoweredBy: boolean;
    } | null,
    clientProfile: {
      logoUrl: string | null;
      logoDarkUrl: string | null;
      faviconUrl: string | null;
      primaryColor: string;
      accentColor: string;
      fontFamily: string;
      emailFromName: string;
      emailFromAddress: string | null;
      footerText: string | null;
      hidePoweredBy: boolean;
    } | null,
  ): ResolvedBranding {
    const base = orgDefault ?? clientProfile;
    if (!base) throw new NotFoundException('Marka profili bulunamadı');

    return {
      logoUrl: clientProfile?.logoUrl ?? base.logoUrl,
      logoDarkUrl: clientProfile?.logoDarkUrl ?? base.logoDarkUrl,
      faviconUrl: clientProfile?.faviconUrl ?? base.faviconUrl,
      primaryColor: clientProfile?.primaryColor ?? base.primaryColor,
      accentColor: clientProfile?.accentColor ?? base.accentColor,
      fontFamily: clientProfile?.fontFamily ?? base.fontFamily,
      emailFromName: clientProfile?.emailFromName ?? base.emailFromName,
      emailFromAddress: clientProfile?.emailFromAddress ?? base.emailFromAddress,
      footerText: clientProfile?.footerText ?? base.footerText,
      hidePoweredBy: clientProfile?.hidePoweredBy ?? base.hidePoweredBy,
      source: clientProfile ? 'client' : 'organization',
    };
  }
}
