import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  OKUMA_ANAHTARI_UST_SINIR,
  type OkumaAnahtariOlustur,
  type OkumaAnahtariOlusturmaYaniti,
  type OkumaAnahtariOzeti,
  type RequestMeta,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { anahtarUret } from '../auth/okuma-anahtari';

/**
 * Panelin "Okuma API" sekmesi: anahtar listele, oluştur, iptal et.
 *
 * Bütün yollar `withTenant` içinde ve satırı RLS süzüyor (yalnızca sahibi).
 * Platform sahipliği burada AYRICA kontrol ediliyor: politika "senin
 * satırın mı" diye bakıyor, "anahtar taşıyabilir misin" diye değil.
 */
const OZET_ALANLARI = {
  id: true,
  ad: true,
  gorunenOnek: true,
  createdAt: true,
  bitis: true,
  sonKullanim: true,
  sonKullanimIp: true,
  iptal: true,
} satisfies Prisma.OkumaAnahtariSelect;

type OzetSatiri = Prisma.OkumaAnahtariGetPayload<{ select: typeof OZET_ALANLARI }>;

export function ozete(s: OzetSatiri, simdi: Date = new Date()): OkumaAnahtariOzeti {
  return {
    id: s.id,
    ad: s.ad,
    gorunenOnek: s.gorunenOnek,
    olusturulma: s.createdAt.toISOString(),
    bitis: s.bitis?.toISOString() ?? null,
    sonKullanim: s.sonKullanim?.toISOString() ?? null,
    sonKullanimIp: s.sonKullanimIp,
    iptal: s.iptal?.toISOString() ?? null,
    durum: s.iptal ? 'iptal' : s.bitis && s.bitis.getTime() <= simdi.getTime() ? 'suresi_doldu' : 'etkin',
  };
}

export function platformSahibiOlmali(ctx: TenantContext): void {
  if (!ctx.platformAdmin) {
    throw new ForbiddenException('Okuma API yalnızca platform sahibi hesabına açık');
  }
}

@Injectable()
export class OkumaAnahtariService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listele(ctx: TenantContext): Promise<OkumaAnahtariOzeti[]> {
    platformSahibiOlmali(ctx);
    const satirlar = await this.prisma.withTenant(ctx, (tx) =>
      tx.okumaAnahtari.findMany({
        where: { userId: ctx.userId },
        orderBy: { createdAt: 'desc' },
        select: OZET_ALANLARI,
      }),
    );
    const simdi = new Date();
    return satirlar.map((s) => ozete(s, simdi));
  }

  async olustur(
    ctx: TenantContext,
    girdi: OkumaAnahtariOlustur,
    meta: RequestMeta,
  ): Promise<OkumaAnahtariOlusturmaYaniti> {
    platformSahibiOlmali(ctx);
    const { anahtar, ozet, gorunenOnek } = anahtarUret();
    const bitis =
      girdi.gecerlilikGun === null ? null : new Date(Date.now() + girdi.gecerlilikGun * 86_400_000);

    const satir = await this.prisma.withTenant(ctx, async (tx) => {
      /*
       * ÜST SINIR ETKİN ANAHTARLARDA. Unutulmuş anahtarlar birikirse
       * hangisinin nerede kullanıldığı okunmaz hâle gelir; sınır kullanıcıyı
       * eskisini iptal etmeye itiyor. İptal ve süresi dolmuş satırlar
       * sayılmıyor (iz olarak duruyorlar).
       */
      const etkin = await tx.okumaAnahtari.count({
        where: {
          userId: ctx.userId,
          iptal: null,
          OR: [{ bitis: null }, { bitis: { gt: new Date() } }],
        },
      });
      if (etkin >= OKUMA_ANAHTARI_UST_SINIR) {
        throw new BadRequestException(
          `En çok ${OKUMA_ANAHTARI_UST_SINIR} etkin anahtar olabilir. Kullanmadığın birini iptal et.`,
        );
      }
      const yeni = await tx.okumaAnahtari.create({
        data: { userId: ctx.userId, ad: girdi.ad, gorunenOnek, anahtarOzeti: ozet, bitis },
        select: OZET_ALANLARI,
      });
      await this.audit.record(tx, ctx, {
        action: 'okuma_anahtari.olustur',
        targetType: 'okuma_api_anahtari',
        targetId: yeni.id,
        clientId: null,
        after: { ad: yeni.ad, gorunenOnek, bitis: bitis?.toISOString() ?? null },
        ip: meta.ip,
        userAgent: meta.userAgent,
        requestId: meta.requestId,
      });
      return yeni;
    });

    return { ozet: ozete(satir), anahtar };
  }

  async iptalEt(ctx: TenantContext, id: string, meta: RequestMeta): Promise<OkumaAnahtariOzeti> {
    platformSahibiOlmali(ctx);
    return this.prisma.withTenant(ctx, async (tx) => {
      /*
       * `updateMany` + SAYIM: başkasının (ya da var olmayan) anahtarını iptal
       * etmeye çalışmak RLS yüzünden SIFIR satır etkiliyor ve hata vermiyor.
       * Sıfırı "iptal edildi" diye döndürmek, çalışmaya devam eden bir
       * anahtarı ekranda ölü gösterirdi.
       */
      const { count } = await tx.okumaAnahtari.updateMany({
        where: { id, userId: ctx.userId, iptal: null },
        data: { iptal: new Date() },
      });
      const satir = await tx.okumaAnahtari.findFirst({ where: { id, userId: ctx.userId }, select: OZET_ALANLARI });
      if (!satir) throw new NotFoundException('Anahtar bulunamadı');
      if (count > 0) {
        await this.audit.record(tx, ctx, {
          action: 'okuma_anahtari.iptal',
          targetType: 'okuma_api_anahtari',
          targetId: id,
          clientId: null,
          ip: meta.ip,
          userAgent: meta.userAgent,
          requestId: meta.requestId,
        });
      }
      return ozete(satir);
    });
  }
}
