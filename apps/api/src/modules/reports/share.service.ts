import { ForbiddenException, GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { REPORT_SECTIONS, type ReportData, type ShareInput, type TenantContext } from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { ReportsService } from './reports.service';

/**
 * Paylaşım linkleri.
 *
 * İki ayrı erişim yolu ve ikisi FARKLI veritabanı bağlantısı kullanıyor:
 *
 *   · Panelden yönetim (oluştur, listele, iptal) → RLS'li bağlantı. Kullanıcı
 *     yalnızca yetkili olduğu müşterinin linklerini görüyor.
 *   · Linkin kendisiyle anonim okuma → YÖNETİM bağlantısı. Oturum yok,
 *     dolayısıyla RLS bağlamı da yok ve politikalar hiçbir satır göstermezdi.
 *     Erişim kontrolü token'ın kendisi.
 *
 * Bu, `data_deletion_requests` ile aynı desen: kimlik doğrulaması olmayan bir
 * yol, RLS'i atlamak için değil, RLS'in uygulanamayacağı için yönetim
 * bağlantısını kullanıyor. Tek satır çekiliyor ve o satırın kimliği token.
 */
@Injectable()
export class ShareService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly admin: PrismaAdminService,
    private readonly reports: ReportsService,
  ) {}

  /**
   * Yeni paylaşım linki üretir.
   *
   * Ham token YALNIZCA burada, bir kez döndürülüyor; veritabanında SHA-256
   * hash'i duruyor. Veritabanı sızarsa linkler kullanılamaz kalır — refresh
   * token'larda da aynı yaklaşım var.
   */
  async create(
    ctx: TenantContext,
    input: ShareInput,
  ): Promise<{ token: string; id: string; expiresAt: Date | null }> {
    // 32 bayt = 256 bit entropi. Kısaltmak linki tahmin edilebilir yapardı ve
    // bu link müşterinin tüm reklam verisini açıyor.
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const expiresAt =
      input.expiresInDays === undefined
        ? null
        : new Date(Date.now() + input.expiresInDays * 86_400_000);

    const share = await this.prisma.withTenant(ctx, async (tx) => {
      const templateId = input.templateId ?? (await this.resolveTemplate(tx, ctx, input.clientId));

      const created = await tx.reportShare.create({
        data: {
          templateId,
          orgId: ctx.orgId,
          clientId: input.clientId,
          tokenHash,
          dateFrom: new Date(`${input.from}T00:00:00Z`),
          dateTo: new Date(`${input.to}T00:00:00Z`),
          expiresAt,
          createdBy: ctx.userId,
        },
        select: { id: true, expiresAt: true },
      });
      return created;
    });

    return { token, id: share.id, expiresAt: share.expiresAt };
  }

  /**
   * Şablonu bulur, yoksa VARSAYILAN OLUŞTURUR.
   *
   * `report_shares.template_id` zorunlu bir yabancı anahtar. Kullanıcıyı önce
   * şablon oluşturmaya zorlamak, ilk raporu göndermenin önüne gereksiz bir adım
   * koymak olurdu — varsayılan şablon tüm bölümleri içeriyor ve sonradan
   * düzenlenebiliyor.
   *
   * Arama sırası: müşteriye özel şablon, sonra organizasyon varsayılanı
   * (`clientId = null`). İkisi de yoksa müşteriye özel bir tane oluşturuluyor.
   */
  private async resolveTemplate(
    tx: TenantTx,
    ctx: TenantContext,
    clientId: string,
  ): Promise<string> {
    const existing = await tx.reportTemplate.findFirst({
      where: { OR: [{ clientId }, { clientId: null }] },
      // Müşteriye özel olan önce: `nulls: 'last'` org varsayılanını sona atıyor.
      orderBy: { clientId: { sort: 'asc', nulls: 'last' } },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await tx.reportTemplate.create({
      data: {
        orgId: ctx.orgId,
        clientId,
        name: 'Varsayılan rapor',
        sections: [...REPORT_SECTIONS],
        status: 'published',
        createdBy: ctx.userId,
      },
      select: { id: true },
    });
    return created.id;
  }

  async revoke(ctx: TenantContext, shareId: string): Promise<void> {
    await this.prisma.withTenant(ctx, async (tx) => {
      const updated = await tx.reportShare.updateMany({
        where: { id: shareId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // `updateMany` RLS altında 0 satır dönebilir: ya link yok ya da
      // kullanıcının o müşteriye yetkisi yok. İkisini ayırmıyoruz —
      // varlığını sızdırmamak doğru davranış.
      if (updated.count === 0) throw new NotFoundException('Paylaşım linki bulunamadı');
    });
  }

  /**
   * Anonim okuma — linkin kendisiyle.
   *
   * Rapor verisi, paylaşım kaydındaki SABİT tarih aralığıyla üretiliyor.
   * Kullanıcının verdiği bir tarih parametresi KABUL EDİLMİYOR: linki alan
   * kişi aralığı değiştirip görmemesi gereken bir dönemi açamamalı.
   */
  async readByToken(token: string): Promise<ReportData> {
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const share = await this.admin.reportShare.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        orgId: true,
        clientId: true,
        templateId: true,
        dateFrom: true,
        dateTo: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    // Geçersiz token ile iptal edilmiş linki AYIRMIYORUZ: ikisi de 404.
    // "Bu link vardı ama iptal edildi" demek, linkin bir zamanlar geçerli
    // olduğunu doğrulamak olurdu.
    if (!share || share.revokedAt) throw new NotFoundException('Rapor bulunamadı');

    // Süresi dolmuş link 410: burada AYIRIYORUZ çünkü müşterinin "ajanstan
    // yeni link iste" diyebilmesi gerekiyor ve bu bilgi bir sır değil.
    if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Bu raporun süresi doldu. Ajansınızdan yeni bir link isteyin.');
    }

    // Görüntüleme sayacı — ajans müşterinin raporu açtığını görebilsin.
    // Hata verirse raporu göstermeyi engellemiyor: telemetri kaybı, raporu
    // kaybetmekten iyidir.
    await this.admin.reportShare
      .update({
        where: { id: share.id },
        data: { viewCount: { increment: 1 }, lastViewAt: new Date() },
      })
      .catch(() => undefined);

    // Rapor verisini üretmek için SAHTE bir tenant bağlamı kuruyoruz.
    //
    // `ReportsService` tüm sorgularını `withTenant` içinde çalıştırıyor ve bu
    // doğru: rapor mantığının RLS'siz bir yolu OLMAMALI. Bağlam paylaşım
    // kaydından türetiliyor — kullanıcı girdisinden değil — dolayısıyla token
    // hangi müşteriye aitse yalnızca onun verisi görünüyor.
    const ctx: TenantContext = {
      orgId: share.orgId,
      userId: SHARE_READER_ID,
      clientIds: [share.clientId],
      isOrgAdmin: false,
    } as TenantContext;

    return this.reports.build(ctx, {
      clientId: share.clientId,
      from: this.dateText(share.dateFrom),
      to: this.dateText(share.dateTo),
      templateId: share.templateId,
    });
  }

  /** `DATE` → YYYY-MM-DD, saat dilimi kayması olmadan. */
  private dateText(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

/**
 * Anonim rapor okuyucusunun sabit kimliği.
 *
 * `withTenant` bir `userId` istiyor (bağlamsız çağrı programlama hatası sayılıp
 * fırlatılıyor). Gerçek bir kullanıcı olmadığı için sabit bir UUID kullanıyoruz;
 * denetim kaydında görüldüğünde "bu bir paylaşım linki okumasıydı" diye
 * tanınabilsin.
 *
 * `users` tablosunda karşılığı YOK ve olmamalı: bu kimlik yetki vermiyor,
 * yalnızca bağlamı dolduruyor. Erişim kararını token veriyor.
 */
const SHARE_READER_ID = '00000000-0000-0000-0000-000000000001';

/** `withTenant` içindeki istemcinin bu servisin kullandığı yüzeyi. */
interface TenantTx {
  reportShare: {
    create(args: unknown): Promise<{ id: string; expiresAt: Date | null }>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  reportTemplate: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
    create(args: unknown): Promise<{ id: string }>;
  };
}
