import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AtifDurumu, AtifStandardi, TenantContext } from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

export type { AtifDurumu };

/**
 * Ajans geneli atıf standardı (TASARIM.md § 7.7.2, OK-16).
 *
 * VARSAYILAN YOK: seçilene kadar yeni modül yayın yapmıyor. "Onaylanana
 * kadar önerilen değer uygulanır" demek, onaysız bir karar vermek olurdu.
 * Standart yalnız YENİ reklam setlerine yazılıyor; çalışanlar değişmez.
 */
@Injectable()
export class AjansAyariService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async atifOku(ctx: TenantContext): Promise<AtifDurumu> {
    return this.prisma.withTenant(ctx, async (tx) => {
      // Önce kendi şirketi, yoksa ajansınki; politika ikisini de açıyor.
      const satirlar = await tx.$queryRaw<Array<{ org_id: string; atif_standardi: AtifStandardi | null; atif_secim_at: Date | null }>>(Prisma.sql`
        SELECT org_id::text, atif_standardi, atif_secim_at FROM ajans_ayari`);
      const kendi = satirlar.find((s) => s.org_id === ctx.orgId && s.atif_standardi);
      const s = kendi ?? satirlar.find((x) => x.atif_standardi) ?? null;
      return {
        standart: s?.atif_standardi ?? null,
        secimAt: s?.atif_secim_at ? new Date(s.atif_secim_at).toISOString() : null,
        secebilir: ctx.isOrgAdmin,
      };
    });
  }

  async atifSec(ctx: TenantContext, standart: AtifStandardi, meta: { ip: string | null; userAgent: string | null; requestId?: string }): Promise<AtifDurumu> {
    if (!ctx.isOrgAdmin) throw new ForbiddenException('Atıf standardını yalnız ajans yöneticisi seçebilir.');
    return this.prisma.withTenant(ctx, async (tx) => {
      const [once] = await tx.$queryRaw<Array<{ atif_standardi: string | null }>>(Prisma.sql`
        SELECT atif_standardi FROM ajans_ayari WHERE org_id = ${ctx.orgId}::uuid`);
      const [s] = await tx.$queryRaw<Array<{ atif_secim_at: Date }>>(Prisma.sql`
        INSERT INTO ajans_ayari (org_id, atif_standardi, atif_secen_id, atif_secim_at, updated_at)
        VALUES (${ctx.orgId}::uuid, ${standart}, ${ctx.userId}::uuid, now(), now())
        ON CONFLICT (org_id) DO UPDATE
          SET atif_standardi = EXCLUDED.atif_standardi,
              atif_secen_id = EXCLUDED.atif_secen_id,
              atif_secim_at = EXCLUDED.atif_secim_at,
              updated_at = now()
        RETURNING atif_secim_at`);
      // Politikası olmayan yazma SIFIR satır döner, hata vermez: say.
      if (!s) throw new ForbiddenException('Atıf standardı kaydedilemedi.');
      await this.audit.record(tx, ctx, {
        action: 'ajans_ayari.atif_standardi',
        targetType: 'ajans_ayari',
        targetId: ctx.orgId,
        clientId: null,
        before: { atifStandardi: once?.atif_standardi ?? null },
        after: { atifStandardi: standart },
        ...meta,
      });
      return { standart, secimAt: new Date(s.atif_secim_at).toISOString(), secebilir: true };
    });
  }

  /**
   * "Meta'ya yazmayı durdur" (§ 11.10). Yalnız ajans yöneticisi, sebep
   * ZORUNLU. Süren yayınlar bir sonraki adım sınırında bekletilir; anahtar
   * kapanınca kendiliğinden devam ETMEZLER.
   */
  async yazmaAnahtari(
    ctx: TenantContext,
    durdur: boolean,
    sebep: string | null,
    meta: { ip: string | null; userAgent: string | null; requestId?: string },
  ): Promise<{ durduruldu: boolean; sebep: string | null }> {
    if (!ctx.isOrgAdmin) throw new ForbiddenException('Meta’ya yazmayı yalnız ajans yöneticisi durdurabilir.');
    const temiz = sebep?.trim() || null;
    if (durdur && !temiz) throw new ForbiddenException('Durdurma sebebi yazılmalı.');
    return this.prisma.withTenant(ctx, async (tx) => {
      const [s] = await tx.$queryRaw<Array<{ ok: number }>>(Prisma.sql`
        INSERT INTO ajans_ayari (org_id, meta_yazma_durduruldu, durduran_id, durdurma_at, durdurma_sebebi, updated_at)
        VALUES (${ctx.orgId}::uuid, ${durdur}, ${durdur ? ctx.userId : null}::uuid,
                ${durdur ? new Date() : null}, ${durdur ? temiz : null}, now())
        ON CONFLICT (org_id) DO UPDATE
          SET meta_yazma_durduruldu = EXCLUDED.meta_yazma_durduruldu,
              durduran_id = EXCLUDED.durduran_id,
              durdurma_at = EXCLUDED.durdurma_at,
              durdurma_sebebi = EXCLUDED.durdurma_sebebi,
              updated_at = now()
        RETURNING 1 AS ok`);
      if (!s) throw new ForbiddenException('Anahtar kaydedilemedi.');
      await this.audit.record(tx, ctx, {
        action: durdur ? 'ajans_ayari.meta_yazma_durduruldu' : 'ajans_ayari.meta_yazma_acildi',
        targetType: 'ajans_ayari',
        targetId: ctx.orgId,
        clientId: null,
        after: { durduruldu: durdur, sebep: temiz },
        ...meta,
      });
      return { durduruldu: durdur, sebep: durdur ? temiz : null };
    });
  }
}
