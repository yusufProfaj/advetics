import { BadRequestException, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { TenantContext } from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncQueueService } from '../../queue/sync-queue.service';

/**
 * Panelden senkronizasyon tetikleme — "Şimdi güncelle".
 *
 * NEDEN GEREKLİ: veri bugüne kadar yalnızca zamanlanmış işlerle (yapı için 6
 * saatte bir) ve sunucudaki `sync-cli` ile geliyordu. Bir hesabı yeni bağlayan
 * ya da bir değişikliği doğrulamak isteyen kişi ya 6 saat bekliyor ya SSH
 * açıyordu. `sync.trigger` yetkisi de tam bunun için tanımlanmış ama bugüne
 * kadar kodda kullanılmıyordu.
 *
 * İŞ KUYRUĞA KONUYOR, ÇALIŞTIRILMIYOR. İşi worker alıyor; böylece kota
 * bekçisi, tekrar deneme ve devre kesici normal yolundan geçiyor. İstek
 * içinde senkronizasyon koşturmak bu korumaları atlamak ve HTTP isteğini
 * dakikalarca açık tutmak olurdu.
 */
@Controller('sync')
export class SyncController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: SyncQueueService,
  ) {}

  /**
   * Aktif müşterinin İZLENEN hesaplarının durumu.
   *
   * Panelin "en son ne zaman güncellendi" sorusuna cevap veriyor. Bu bilgi
   * olmadan kullanıcı yenile düğmesine basıp basmamayı tahmin ediyor — ve
   * bayat veriyi taze sanmak, bu projede en pahalı hata türü.
   */
  @Get('status')
  @RequirePermissions('insights.read')
  async status(@CurrentTenant() ctx: TenantContext) {
    const accounts = await this.enabledAccounts(ctx);

    // En ESKİ senkronizasyon belirleyici: bir hesap bayatsa panelin tamamı
    // bayat sayılır. En yenisini göstermek, güncellenmemiş hesabı gizlerdi.
    const stamps = accounts
      .map((a) => a.lastInsightsSyncAt)
      .filter((d): d is Date => d !== null)
      .map((d) => d.getTime());

    return {
      accountCount: accounts.length,
      neverSyncedCount: accounts.filter((a) => a.lastInsightsSyncAt === null).length,
      oldestSyncAt: stamps.length > 0 ? new Date(Math.min(...stamps)).toISOString() : null,
    };
  }

  /**
   * Aktif müşterinin izlenen hesaplarını şimdi senkronize et.
   *
   * SIRA ÖNEMLİ: önce yapı, sonra metrik. Metrik satırları, ait oldukları
   * kampanya satırı veritabanında yoksa ATLANIYOR (insights-sync.service ->
   * writeRows, `skipped`). Yapı işine daha yüksek öncelik veriliyor; aynı
   * anda kuyruktalarsa yapı önce çalışıyor.
   *
   * MÜKERRER KORUMASI kuyrukta: `SyncQueueService.enqueue` aynı işi ikinci kez
   * eklemiyor ve `enqueued: false` dönüyor. Düğmeye üst üste basmak kotayı
   * ikinci kez harcamıyor; kaç işin atlandığı da cevapta yazıyor.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('sync.trigger')
  async refresh(@CurrentTenant() ctx: TenantContext) {
    if (!ctx.activeClientId) {
      // Müşteri seçilmeden tetiklemek, TÜM portföyün kotasını tek tıkla
      // harcamak demekti. Seçim zorunlu.
      throw new BadRequestException(
        'Önce bir müşteri seçin — güncelleme seçili müşterinin hesapları için çalışır.',
      );
    }

    const accounts = await this.enabledAccounts(ctx);
    if (accounts.length === 0) {
      throw new BadRequestException(
        'Bu müşteride izlemeye alınmış hesap yok. Platform Bağlantıları ekranından hesap seçin.',
      );
    }

    let queued = 0;
    let skipped = 0;

    // Yapı ÖNCE ekleniyor. `enqueue` öncelik parametresi almıyor; sıra
    // kuyruğa ekleme sırasıyla belirleniyor ve metrik işinin yapıdan sonra
    // gelmesi bu yüzden burada garanti ediliyor.
    for (const account of accounts) {
      for (const jobType of ['structure', 'insights_realtime'] as const) {
        const res = await this.queue.enqueue({
          clientId: account.clientId,
          platform: account.platform,
          jobType,
          adAccountId: account.id,
          interactive: true,
          ...(jobType === 'insights_realtime'
            ? { dateFrom: isoToday(), dateTo: isoToday() }
            : {}),
        });
        if (res.enqueued) queued++;
        else skipped++;
      }
    }

    return { accountCount: accounts.length, queued, skipped };
  }

  /** Aktif müşterinin izlenen hesapları. RLS zaten müşteriye daraltıyor. */
  /**
   * İzlemeye alınmış hesaplar.
   *
   * `clientId: { not: null }` ŞART. Bağlantılar ajans seviyesine taşındıktan
   * sonra havuzda müşteriye atanmamış hesaplar duruyor ve org yöneticisi
   * bunları RLS altında GÖREBİLİYOR (havuzu yönetebilmesi için). Süzgeç
   * olmasaydı "Şimdi güncelle" atanmamış bir hesap için iş açar, iş
   * `client_id`'si NULL bir `sync_jobs` satırı üretir ve o satır hiçbir
   * panelde görünmezdi.
   */
  private async enabledAccounts(ctx: TenantContext) {
    const rows = await this.prisma.withTenant(ctx, (tx) =>
      tx.adAccount.findMany({
        where: { syncEnabled: true, clientId: { not: null }, connection: { status: 'active' } },
        select: {
          id: true,
          clientId: true,
          platform: true,
          name: true,
          lastInsightsSyncAt: true,
        },
      }),
    );

    // Süzgeç veritabanında; buradaki daraltma yalnızca TİP için. Prisma
    // `{ not: null }` koşulunu tipe yansıtmıyor ve `clientId` `string | null`
    // kalıyor.
    return rows.filter((a): a is typeof a & { clientId: string } => a.clientId !== null);
  }
}

/** Bugün, UTC. Metrikler `YYYY-MM-DD` string bekliyor — Date kayma üretiyor. */
function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
