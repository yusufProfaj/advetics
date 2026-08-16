import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { backfillSchema, type BackfillInput, type TenantContext } from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
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
    const profiles = await this.enabledProfiles(ctx);
    if (accounts.length === 0 && profiles.length === 0) {
      throw new BadRequestException(
        'Bu müşteride izlemeye alınmış hesap ya da sayfa yok. Platform Bağlantıları ' +
          've Müşteriler ekranından izlemeye al.',
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

    /**
     * ORGANİK GÖNDERİLER DE BU DÜĞMEDE — sonradan eklendi.
     *
     * Düğme "Şimdi güncelle" diyordu ama YALNIZCA reklam hesaplarını
     * kapsıyordu; organik gönderi süpürmesi ayrı bir zamanlanmış işti
     * (`sweep:organic`, saatte bir). Sonucu canlıda görüldü: kullanıcı sayfayı
     * izlemeye aldı, "Şimdi güncelle"ye bastı ve hiçbir gönderi gelmedi —
     * çünkü o düğme organiğe hiç dokunmuyordu. Adı ile yaptığı iş
     * ayrışıyordu.
     *
     * MALİYETİ KÜÇÜK: sayfa başına tek bir Graph çağrısı ve yalnızca İZLEMEYE
     * ALINMIŞ sayfalar için. Geçmiş metriklerin aksine (`backfill`) burada
     * geri alınamaz bir kota harcaması yok.
     */
    for (const profile of profiles) {
      const res = await this.queue.enqueue({
        clientId: profile.clientId,
        platform: 'meta',
        jobType: 'organic_posts',
        socialProfileId: profile.id,
        interactive: true,
      });
      if (res.enqueued) queued++;
      else skipped++;
    }

    return {
      accountCount: accounts.length,
      // SAYFA SAYISI AYRI DÖNÜYOR: "3 hesap güncelleniyor" derken iki sayfanın
      // da kuyruğa girdiğini söylememek, bu düğmenin baştaki hatasını
      // tekrarlamak olurdu.
      profileCount: profiles.length,
      queued,
      skipped,
    };
  }

  /**
   * GEÇMİŞ METRİKLERİ ÇEK — "Şimdi güncelle"den ayrı, çünkü maliyeti ayrı.
   *
   * `insights_realtime` yalnızca bugünü kapsıyor. Yeni bağlanan bir müşterinin
   * geçmişi ise 90 gün × hesap sayısı kadar çağrı demek; bunu aynı düğmeye
   * bağlamak, her tıkta kotayı geri alınamaz biçimde harcamak olurdu.
   *
   * `apply: false` (varsayılan) HİÇBİR ŞEY YAPMIYOR, yalnızca ne olacağını
   * söylüyor. Sunucudaki `sync-cli`ın deseni bu ve sebebi somut: kapsamsız
   * çalıştırılan ilk sürüm 27 hesaplık bir portföy için 288 hesap saymıştı.
   *
   * YAPI TARAMASI OLMAYAN HESAP ATLANIYOR ve sayısı DÖNÜYOR. Metrik satırı,
   * ait olduğu kampanya satırı veritabanında yoksa yazılamıyor — sessizce
   * atlansa kullanıcı "90 gün çektim ama veri yok" derdi ve sebebi hiçbir
   * ekranda yazmazdı.
   */
  @Post('backfill')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('sync.trigger')
  async backfill(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(backfillSchema)) dto: BackfillInput,
  ) {
    if (!ctx.activeClientId) {
      throw new BadRequestException(
        'Önce bir müşteri seçin — geçmiş veri seçili müşterinin hesapları için çekilir.',
      );
    }

    const accounts = await this.enabledAccounts(ctx);
    if (accounts.length === 0) {
      throw new BadRequestException(
        'Bu müşteride izlemeye alınmış hesap yok. Platform Bağlantıları ekranından hesap seçin.',
      );
    }

    const ready = accounts.filter((a) => a.lastStructureSyncAt !== null);
    const noStructure = accounts.length - ready.length;

    // Aralık DÜNDE bitiyor. Bugünü de kapsasaydı "Şimdi güncelle" ile aynı
    // günü iki kez çekerdik; kuyruk mükerrer işi eliyor ama tarih aralıkları
    // farklı olduğu için elemezdi.
    const dateFrom = isoDaysAgo(dto.days);
    const dateTo = isoDaysAgo(1);

    if (!dto.apply) {
      return {
        applied: false,
        accountCount: ready.length,
        noStructure,
        dateFrom,
        dateTo,
        queued: 0,
        skipped: 0,
      };
    }

    let queued = 0;
    let skipped = 0;

    for (const account of ready) {
      const res = await this.queue.enqueue({
        clientId: account.clientId,
        platform: account.platform,
        jobType: 'insights_backfill',
        adAccountId: account.id,
        dateFrom,
        dateTo,
      });
      if (res.enqueued) queued++;
      else skipped++;
    }

    return {
      applied: true,
      accountCount: ready.length,
      noStructure,
      dateFrom,
      dateTo,
      queued,
      skipped,
    };
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
  /**
   * İzlemeye alınmış SAYFALAR — organik gönderi süpürmesinin girdisi.
   *
   * Süpürme işinin kendi süzgeciyle aynı koşullar (`sync-processor`):
   * izleme açık, müşteriye atanmış, bağlantı etkin.
   */
  private async enabledProfiles(ctx: TenantContext) {
    const rows = await this.prisma.withTenant(ctx, (tx) =>
      tx.socialProfile.findMany({
        where: { syncEnabled: true, clientId: { not: null }, connection: { status: 'active' } },
        select: { id: true, clientId: true, name: true },
      }),
    );
    return rows.filter((p): p is typeof p & { clientId: string } => p.clientId !== null);
  }

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
          lastStructureSyncAt: true,
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

/** N gün öncesi, UTC, `YYYY-MM-DD`. */
function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
