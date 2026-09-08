import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ClientProfileRecord, TenantContext, UpsertClientProfileInput } from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * Bilgi Bankası — müşterinin genel profili.
 *
 * `BrandingService`in izlediği upsert desenini tekrarlıyor ama org
 * varsayılanına DÜŞMÜYOR: `branding_profiles`ın aksine bu satırın ajans
 * geneli bir hâli yok, `clientId` zorunlu — profil yoksa `null` alanlarla
 * boş bir kayıt anlamına geliyor, org değerine "geri düşme" diye bir kavram
 * gerekmiyor.
 */
@Injectable()
export class ClientProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(ctx: TenantContext, clientId: string): Promise<ClientProfileRecord> {
    const profile = await this.prisma.withTenant(ctx, (tx) =>
      tx.clientProfile.findUnique({ where: { clientId } }),
    );
    if (profile) return toRecord(profile);

    // KAYIT YOK = BOŞ PROFİL, 404 DEĞİL. Her müşteri profil satırıyla
    // başlamıyor (ilk kez ziyaret edildiğinde yaratılıyor); "henüz
    // doldurulmadı" ile "müşteri bulunamadı" farklı durumlar ve ikincisi
    // burada değil `ClientsService` katmanında zaten kontrol ediliyor.
    return {
      id: '',
      clientId,
      hedefKitle: null,
      markaBilgileri: null,
      bilgiBankasi: null,
      logoAssetId: null,
      updatedAt: '',
    };
  }

  async upsert(
    ctx: TenantContext,
    input: UpsertClientProfileInput,
    meta: Meta,
  ): Promise<ClientProfileRecord> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const client = await tx.client.findUnique({ where: { id: input.clientId } });
      if (!client) throw new NotFoundException('Müşteri bulunamadı');

      // LOGO, BU MÜŞTERİNİN VARLIĞI OLMAK ZORUNDA.
      //
      // `logoAssetId` gövdeden geliyor ve tek doğrulaması Zod'un `uuid()`i,
      // yani BİÇİM. Migration'daki yabancı anahtar da yalnızca "böyle bir
      // varlık var" diyor — KİMİN olduğunu söylemiyor. Kontrol olmadan bir
      // kullanıcı kendi müşterisinin profiline BAŞKA bir müşterinin (hatta
      // başka bir organizasyonun) varlık kimliğini yazabiliyor ve INSERT
      // sorunsuz geçiyor.
      //
      // "Zaten `assets` SELECT politikası okumayı engelliyor" YETERLİ DEĞİL:
      // o politika okuma yolunu koruyor, saklanan referansı değil. Satır
      // yanlış kiracıyı gösterdiği anda, logoyu SUNUCU TARAFINDA çözen bir
      // sonraki yol (rapor PDF'i kiracı bağlamı olmayan bir bağlantıyla
      // çiziliyor) bunu sessiz bir sızıntıya çevirir. Yanlış referansı
      // SAKLAMAK zaten hatadır.
      //
      // `null` GEÇERLİ: logoyu kaldırmak meşru bir işlem, kontrol yalnızca
      // bir kimlik verildiğinde çalışıyor.
      if (input.logoAssetId) {
        const sahip = await tx.$queryRaw<{ id: string }[]>(
          Prisma.sql`SELECT id FROM assets WHERE id = ${input.logoAssetId}::uuid AND client_id = ${input.clientId}::uuid`,
        );
        if (sahip.length === 0) {
          // Mesaj SEBEBİ söylüyor: "geçersiz kimlik" demek, doğru dosyayı
          // seçtiğini bilen kullanıcıyı olmayan bir arızayı aramaya gönderir.
          throw new BadRequestException(
            'Seçilen logo bu müşterinin görsel arşivinde bulunamadı — logo yalnızca aynı müşterinin varlıklarından seçilebilir.',
          );
        }
      }

      const existing = await tx.clientProfile.findUnique({ where: { clientId: input.clientId } });

      const data = {
        ...(input.hedefKitle !== undefined ? { hedefKitle: input.hedefKitle } : {}),
        ...(input.markaBilgileri !== undefined ? { markaBilgileri: input.markaBilgileri } : {}),
        ...(input.bilgiBankasi !== undefined ? { bilgiBankasi: input.bilgiBankasi } : {}),
        ...(input.logoAssetId !== undefined ? { logoAssetId: input.logoAssetId } : {}),
      };

      const saved = existing
        ? await tx.clientProfile.update({ where: { id: existing.id }, data })
        : await tx.clientProfile.create({
            data: { orgId: ctx.orgId, clientId: input.clientId, ...data },
          });

      await this.audit.record(tx, ctx, {
        action: 'client_profile.updated',
        targetType: 'client_profile',
        targetId: saved.id,
        clientId: input.clientId,
        before: existing
          ? {
              hedefKitle: existing.hedefKitle,
              markaBilgileri: existing.markaBilgileri,
              bilgiBankasi: existing.bilgiBankasi,
              logoAssetId: existing.logoAssetId,
            }
          : null,
        after: {
          hedefKitle: saved.hedefKitle,
          markaBilgileri: saved.markaBilgileri,
          bilgiBankasi: saved.bilgiBankasi,
          logoAssetId: saved.logoAssetId,
        },
        ...meta,
      });

      return toRecord(saved);
    });
  }
}

function toRecord(row: {
  id: string;
  clientId: string;
  hedefKitle: string | null;
  markaBilgileri: string | null;
  bilgiBankasi: string | null;
  logoAssetId: string | null;
  updatedAt: Date;
}): ClientProfileRecord {
  return {
    id: row.id,
    clientId: row.clientId,
    hedefKitle: row.hedefKitle,
    markaBilgileri: row.markaBilgileri,
    bilgiBankasi: row.bilgiBankasi,
    logoAssetId: row.logoAssetId,
    updatedAt: row.updatedAt.toISOString(),
  };
}
