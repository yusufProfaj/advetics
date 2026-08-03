import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { TenantContext } from '@advetics/shared';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { TenantClient } from '../../prisma/prisma.service';

export interface AuditEntry {
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  clientId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * Denetim kaydı.
 *
 * Bu tablo append-only'dur: `advetics_app` rolünün UPDATE/DELETE yetkisi
 * veritabanı seviyesinde geri alınmıştır ve RLS'te UPDATE/DELETE politikası
 * tanımlı değildir. Silinebilen bir denetim kaydı denetim kaydı değildir.
 *
 * Modül 5'te kural motoru buraya `actorType='rule'` ile yazacak; müşteriye
 * "bütçeni neden kim değiştirdi" sorusunun cevabı bu tablodan üretilecek.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly admin: PrismaAdminService) {}

  /**
   * Tenant bağlamı içinde kayıt açar.
   *
   * ÖNEMLİ: Çağıran, kendi transaction client'ını (`tx`) geçmelidir. Böylece
   * denetim kaydı, kaydettiği değişiklikle AYNI transaction'da yazılır —
   * değişiklik geri alınırsa denetim kaydı da geri alınır, ve tersi.
   * "İşlem başarısız oldu ama logda başarılı görünüyor" durumu oluşmaz.
   */
  async record(tx: TenantClient, ctx: TenantContext, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({
      data: {
        orgId: ctx.orgId,
        clientId: entry.clientId ?? ctx.activeClientId,
        actorType: 'user',
        actorId: ctx.userId,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        before: entry.before ?? undefined,
        after: entry.after ?? undefined,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent?.slice(0, 512) ?? null,
        requestId: entry.requestId ?? null,
      },
    });
  }

  /**
   * Bağlam kurulmadan önceki olaylar için (login, register, davet kabul,
   * şifre sıfırlama). Bu akışlarda tanımlı bir tenant bağlamı yoktur.
   *
   * Bu metod hata fırlatmaz: denetim kaydı yazılamadı diye kullanıcının
   * girişinin başarısız olmasını istemeyiz. Hata log'a düşer.
   */
  async recordUnauthenticated(
    orgId: string,
    entry: AuditEntry & { actorId?: string | null; actorLabel?: string | null },
  ): Promise<void> {
    try {
      await this.admin.auditLog.create({
        data: {
          orgId,
          clientId: entry.clientId ?? null,
          actorType: entry.actorId ? 'user' : 'system',
          actorId: entry.actorId ?? null,
          actorLabel: entry.actorLabel ?? null,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          before: entry.before ?? undefined,
          after: entry.after ?? undefined,
          ip: entry.ip ?? null,
          userAgent: entry.userAgent?.slice(0, 512) ?? null,
          requestId: entry.requestId ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`Denetim kaydı yazılamadı: ${entry.action}`, err as Error);
    }
  }
}
