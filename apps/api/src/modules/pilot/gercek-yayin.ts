import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { GercekYayinGirdisi, PilotGercekYayinDurumu, TenantContext } from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { OkumaTx } from './plan-girdisi';

/**
 * ═══ PİLOT GERÇEK YAYIN ANAHTARI — TEK KAPI ═══
 *
 * Kullanıcı kararı (2026-10-07): yeni kurulum motoru Meta'da hiç denenmedi,
 * ilk canlı tur TEST KİPİNDE. Anahtar kapalıyken uyum geçse bile `yayinKipi`
 * `test` üretir (kur → geri oku → açmadan arşivle). Kip trigger'la kilitli
 * olduğu için onay anındaki değer kalır; anahtar sonradan açılırsa bekleyen
 * planlar ajansın "Şimdi kur"uyla (S-6) gerçeğe geçer, müşteriye tekrar
 * sorulmaz.
 *
 * KİMİN ANAHTARI: AJANS ŞİRKETİNİN. Müşteri şirketleri ajansın satırına
 * bağlı; müşteri şirketinin kendi satırı gerçeği AÇAMAZ (açabilseydi bir
 * şirket yöneticisi ajansın test kararını kendi şirketinde delerdi).
 * Ajansı belli olmayan şirket (üst hesap var, `ajans_org_id` yok) → KAPALI.
 * OKUNAMAZSA KAPALI: anahtarı bilmeden gerçek yayın, kapalı olduğu bir
 * anda para harcatmak olabilir.
 */
export async function ajansOrgu(tx: OkumaTx, orgId: string): Promise<string | null> {
  const [o] = await tx.$queryRaw<Array<{ mid: string | null; ajans: string | null }>>(Prisma.sql`
    SELECT o.manager_account_id::text AS mid, ma.ajans_org_id::text AS ajans
      FROM organizations o LEFT JOIN manager_accounts ma ON ma.id = o.manager_account_id
     WHERE o.id = ${orgId}::uuid`);
  if (!o) return null;
  return o.mid === null ? orgId : o.ajans;
}

export async function gercekYayinAcikMi(tx: OkumaTx, orgId: string): Promise<{ acik: boolean; okunamadi: string | null }> {
  try {
    const ajans = await ajansOrgu(tx, orgId);
    if (!ajans) return { acik: false, okunamadi: 'Şirketin ajansı belirlenemedi; gerçek yayın kapalı sayılıyor.' };
    const [a] = await tx.$queryRaw<Array<{ acik: boolean }>>(Prisma.sql`
      SELECT pilot_gercek_yayin AS acik FROM ajans_ayari WHERE org_id = ${ajans}::uuid`);
    return { acik: a?.acik === true, okunamadi: null };
  } catch (e) {
    return { acik: false, okunamadi: `Anahtar okunamadı: ${(e as Error).message}` };
  }
}

@Injectable()
export class PilotGercekYayinService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async durum(ctx: TenantContext): Promise<PilotGercekYayinDurumu> {
    if (ctx.role === 'client_viewer') throw new ForbiddenException('Bu ayar ajans hesabından görülür.');
    return this.prisma.withTenant(ctx, (tx) => this.oku(tx as unknown as OkumaTx, ctx));
  }

  private async oku(tx: OkumaTx, ctx: TenantContext): Promise<PilotGercekYayinDurumu> {
    const k = await gercekYayinAcikMi(tx, ctx.orgId);
    const ajans = await ajansOrgu(tx, ctx.orgId).catch(() => null);
    const [r] = ajans
      ? await tx.$queryRaw<Array<{ ad: string | null; zaman: Date | null; sebep: string | null }>>(Prisma.sql`
          SELECT u.full_name AS ad, a.pilot_gercek_yayin_at AS zaman, a.pilot_gercek_yayin_sebebi AS sebep
            FROM ajans_ayari a LEFT JOIN users u ON u.id = a.pilot_gercek_yayin_degistiren
           WHERE a.org_id = ${ajans}::uuid`)
      : [];
    return {
      acik: k.acik,
      degistiren: r?.ad ?? null,
      zaman: r?.zaman ? new Date(r.zaman).toISOString() : null,
      sebep: r?.sebep ?? null,
      degistirebilir: ctx.isOrgAdmin && ctx.permissions.includes('org.write') && ajans === ctx.orgId,
      okunamadi: k.okunamadi,
    };
  }

  async degistir(ctx: TenantContext, g: GercekYayinGirdisi, meta: { ip: string | null; userAgent: string | null; requestId?: string }): Promise<PilotGercekYayinDurumu> {
    if (!ctx.isOrgAdmin) throw new ForbiddenException('Gerçek yayın anahtarını yalnız ajans yöneticisi değiştirebilir.');
    return this.prisma.withTenant(ctx, async (t) => {
      const tx = t as unknown as OkumaTx;
      const ajans = await ajansOrgu(tx, ctx.orgId);
      if (ajans !== ctx.orgId) throw new ForbiddenException('Bu anahtar ajans şirketinden değiştirilir; müşteri şirketleri ajansın anahtarına bağlı.');
      const [once] = await tx.$queryRaw<Array<{ acik: boolean }>>(Prisma.sql`SELECT pilot_gercek_yayin AS acik FROM ajans_ayari WHERE org_id = ${ctx.orgId}::uuid`);
      const [s] = await tx.$queryRaw<Array<{ ok: number }>>(Prisma.sql`
        INSERT INTO ajans_ayari (org_id, pilot_gercek_yayin, pilot_gercek_yayin_degistiren, pilot_gercek_yayin_at, pilot_gercek_yayin_sebebi, updated_at)
        VALUES (${ctx.orgId}::uuid, ${g.acik}, ${ctx.userId}::uuid, now(), ${g.sebep}, now())
        ON CONFLICT (org_id) DO UPDATE
          SET pilot_gercek_yayin = EXCLUDED.pilot_gercek_yayin,
              pilot_gercek_yayin_degistiren = EXCLUDED.pilot_gercek_yayin_degistiren,
              pilot_gercek_yayin_at = EXCLUDED.pilot_gercek_yayin_at,
              pilot_gercek_yayin_sebebi = EXCLUDED.pilot_gercek_yayin_sebebi,
              updated_at = now()
        RETURNING 1 AS ok`);
      // Politikası olmayan yazma SIFIR satır döner, hata vermez: say.
      if (!s) throw new ForbiddenException('Anahtar kaydedilemedi.');
      await this.audit.record(t, ctx, {
        action: g.acik ? 'ajans_ayari.pilot_gercek_yayin_acildi' : 'ajans_ayari.pilot_gercek_yayin_kapandi',
        targetType: 'ajans_ayari',
        targetId: ctx.orgId,
        clientId: null,
        before: { acik: once?.acik ?? false },
        after: { acik: g.acik, sebep: g.sebep },
        ...meta,
      });
      return this.oku(tx, ctx);
    });
  }
}
