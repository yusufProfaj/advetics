import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import {
  backfillSchema,
  refreshRangeSchema,
  type BackfillInput,
  type RefreshRangeInput,
  type SyncAccountStatus,
  type SyncExcludedCounts,
  type SyncJobStatusRow,
  type SyncStatusResponse,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncQueueService } from '../../queue/sync-queue.service';
import { supurmeDisiSebep } from '../../queue/supurme-kapsami';

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
/**
 * Teşhis ekranında gösterilen iş sayısı.
 *
 * Sınırın kendisi zararsız ama SESSİZ OLMASI zararlı: toplam da dönüyor
 * (`recentJobsTotal`) ki ekran "son 25 / toplam 340" yazabilsin. Kesilen bir
 * listeyi tam liste sanmak, bu projede tekrar eden hata türü.
 */
const RECENT_JOB_LIMIT = 25;

@Controller('sync')
export class SyncController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: SyncQueueService,
  ) {}

  /**
   * "BU MÜŞTERİDE VERİ NEDEN YOK" SORUSUNUN CEVAP YERİ.
   *
   * Bu uç önce yalnızca "en son ne zaman güncellendi" diyordu. Yetmediği
   * canlıda görüldü: bir workspace'te Meta verisi hiç gelmiyordu, bağlantı
   * doğruydu ve panelde bakılacak TEK BİR ALAN yoktu. Ayırt edilmesi gereken
   * altı hâlin hepsi aynı boş grafiğe düşüyordu ve tek teşhis yolu sunucuya
   * SSH ile girip `sync-cli -- jobs` çalıştırmaktı.
   *
   * Üç şey birden dönüyor, çünkü teşhis üçünün KESİŞİMİNDE:
   *
   *   1. `accounts` — hesap hesap: yapı taraması koştu mu, metrik geldi mi,
   *      zamanlanmış süpürme bu hesabı alıyor mu, almıyorsa NEDEN.
   *   2. `excluded` — süzgeçlerin eledikleri, sebep sebep sayılmış. Elenen
   *      hesabın listede olmaması da bir bilgi ve sessiz kalmamalı.
   *   3. `recentJobs` — işlerin kendi sonucu. `error_message` bugüne kadar da
   *      yazılıyordu (Meta'nın subcode ve fbtrace'i dahil) ama okuyan hiçbir
   *      uç nokta yoktu.
   *
   * EN SİNSİ HÂL `recentJobs` OLMADAN GÖRÜNMÜYOR: iş `succeeded` biter,
   * `rowsUpserted` 0'dır. Yapı taraması henüz kampanya satırlarını yazmadan
   * metrik işi koştuysa bütün satırlar eşlenemeyip atlanıyor, iş başarılı
   * sayılıyor ve BİR DAHA denenmiyor. Belirtisi tam olarak "atadım, veri
   * gelmiyor".
   */
  @Get('status')
  @RequirePermissions('insights.read')
  async status(@CurrentTenant() ctx: TenantContext): Promise<SyncStatusResponse> {
    const { rows, jobs, jobsTotal } = await this.prisma.withTenant(ctx, async (tx) => {
      /*
       * YALNIZCA ATANMIŞ HESAPLAR. `clientId: { not: null }` şart:
       * `ad_accounts` RLS politikasının NULL dalı org yöneticisine havuzun
       * TAMAMINI açıyor (aktif müşteri seçiliyken bile). Süzgeç olmadan bu
       * ekran ajansın yüzlerce atanmamış hesabını bu müşterinin sorunuymuş
       * gibi listelerdi.
       */
      const rows = await tx.adAccount.findMany({
        where: { clientId: { not: null } },
        orderBy: [{ platform: 'asc' }, { name: 'asc' }],
        select: {
          id: true,
          name: true,
          platform: true,
          status: true,
          syncEnabled: true,
          lastStructureSyncAt: true,
          lastInsightsSyncAt: true,
          connection: { select: { status: true } },
          client: { select: { status: true } },
        },
      });

      /*
       * İŞLER AYNI TRANSACTION İÇİNDE. Ayrı `withTenant` çağrısı ikinci bir
       * etkileşimli transaction açardı; iki kısa sorgu için bedeli yersiz.
       */
      const [jobs, jobsTotal] = await Promise.all([
        tx.syncJob.findMany({
          orderBy: { createdAt: 'desc' },
          take: RECENT_JOB_LIMIT,
          select: {
            id: true,
            jobType: true,
            entityLevel: true,
            status: true,
            attempts: true,
            rowsUpserted: true,
            apiCallsUsed: true,
            errorCode: true,
            errorMessage: true,
            adAccountId: true,
            createdAt: true,
            startedAt: true,
            finishedAt: true,
          },
        }),
        tx.syncJob.count(),
      ]);

      return { rows, jobs, jobsTotal };
    });

    const excluded: SyncExcludedCounts = {
      syncDisabled: 0,
      clientInactive: 0,
      connectionInactive: 0,
      accountStatus: 0,
    };

    const accounts: SyncAccountStatus[] = rows.map((a) => {
      const sweepReason = supurmeDisiSebep(a);

      // Sayaçlar sebeple AYNI SIRAYI izliyor: bir hesap birden fazla koşula
      // takılabilir ve iki kez sayılırsa toplam hesap sayısını aşar.
      if (sweepReason !== null) {
        if (!a.syncEnabled) excluded.syncDisabled++;
        else if (a.client === null || a.client.status !== 'active') excluded.clientInactive++;
        else if (a.connection.status !== 'active') excluded.connectionInactive++;
        else excluded.accountStatus++;
      }

      /*
       * YAPI ENGELİ SÜPÜRME ENGELİNDEN SONRA GELİYOR ama ondan bağımsız:
       * süpürmeye giren bir hesapta bile yapı taraması hiç koşmadıysa metrik
       * satırları yazılamıyor. Metrik yazımının ön şartı kampanya satırının
       * veritabanında olması — eşlenemeyen satır atlanıyor ve iş "başarılı"
       * kapanıyor.
       */
      const structureReady = a.lastStructureSyncAt !== null;
      const blockedReason =
        sweepReason ??
        (!structureReady
          ? 'Yapı taraması bu hesapta hiç koşmadı — kampanya satırları olmadan metrikler yazılamıyor. "Şimdi güncelle" önce yapıyı çeker.'
          : a.lastInsightsSyncAt === null
            ? 'Hesap izleniyor ve yapı taraması koştu ama metrik hiç çekilmedi. Aşağıdaki iş listesinde bu hesabın son işine bakın.'
            : null);

      return {
        id: a.id,
        name: a.name,
        platform: a.platform,
        status: a.status,
        syncEnabled: a.syncEnabled,
        connectionStatus: a.connection.status,
        lastStructureSyncAt: a.lastStructureSyncAt?.toISOString() ?? null,
        lastInsightsSyncAt: a.lastInsightsSyncAt?.toISOString() ?? null,
        inScheduledSweep: sweepReason === null,
        structureReady,
        blockedReason,
      };
    });

    const adiyle = new Map(rows.map((a) => [a.id, a.name]));

    const recentJobs: SyncJobStatusRow[] = jobs.map((j) => ({
      // `sync_jobs.id` BIGSERIAL. BigInt'i olduğu gibi döndürmek
      // `JSON.stringify` içinde patlıyor ve uç nokta 500 veriyor.
      id: j.id.toString(),
      jobType: j.jobType,
      entityLevel: j.entityLevel,
      status: j.status,
      attempts: j.attempts,
      rowsUpserted: j.rowsUpserted,
      apiCallsUsed: j.apiCallsUsed,
      errorCode: j.errorCode,
      errorMessage: j.errorMessage,
      adAccountId: j.adAccountId,
      adAccountName: j.adAccountId ? (adiyle.get(j.adAccountId) ?? null) : null,
      createdAt: j.createdAt.toISOString(),
      startedAt: j.startedAt?.toISOString() ?? null,
      finishedAt: j.finishedAt?.toISOString() ?? null,
    }));

    // İZLENEN hesaplar üzerinden — eski sözleşme korunuyor. En ESKİ
    // senkronizasyon belirleyici: bir hesap bayatsa panelin tamamı bayat
    // sayılır. En yenisini göstermek, güncellenmemiş hesabı gizlerdi.
    const izlenen = accounts.filter((a) => a.syncEnabled);
    const stamps = izlenen
      .map((a) => a.lastInsightsSyncAt)
      .filter((d): d is string => d !== null)
      .map((d) => new Date(d).getTime());

    return {
      accountCount: izlenen.length,
      neverSyncedCount: izlenen.filter((a) => a.lastInsightsSyncAt === null).length,
      oldestSyncAt: stamps.length > 0 ? new Date(Math.min(...stamps)).toISOString() : null,
      accounts,
      excluded,
      recentJobs,
      recentJobsTotal: jobsTotal,
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
  async refresh(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(refreshRangeSchema)) dto: RefreshRangeInput,
  ) {
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
    /*
     * EKRANDA SEÇİLİ ARALIK YENİLENİYOR — yalnızca bugün DEĞİL.
     *
     * Düğme bir süre sabit `isoToday()` gönderiyordu. Kullanıcı "Son 30 gün"
     * seçip düğmeye basıyor, hiçbir şey değişmiyordu: tazelenen tek gün
     * aralığın içinde olsa bile geri kalan 29 güne hiç dokunulmuyordu.
     *
     * İKİ FARKLI İŞ, ÇÜNKÜ MALİYETLERİ FARKLI:
     *   · BUGÜN → `insights_realtime`, yalnızca hesap ve kampanya seviyesi.
     *     Gün içi ad seviyesi kotayı 20-50× artırıyor ve gün içinde ad bazlı
     *     karar istatistiksel olarak anlamsız.
     *   · GEÇMİŞ GÜNLER → `insights_backfill`, kampanya/reklam seti/reklam.
     *     Gün kapandı, veri oturdu; atıf penceresi de burada düzeliyor.
     *
     * Aralık verilmezse eski davranış: yalnızca bugün.
     */
    const bugun = isoToday();
    const dateFrom = dto.dateFrom ?? bugun;
    const dateTo = dto.dateTo ?? bugun;
    // Geçmiş kısmı bugünden ÖNCE biten parça. Aralık yalnızca bugünü
    // kapsıyorsa geçmiş işi hiç açılmıyor — boşuna kota.
    const gecmisSonu = dateTo < bugun ? dateTo : oncekiGun(bugun);
    const gecmisVar = dateFrom < bugun;
    const bugunVar = dateTo >= bugun;

    for (const account of accounts) {
      const isler: Array<{ jobType: 'structure' | 'insights_realtime' | 'insights_backfill'; dateFrom?: string; dateTo?: string }> =
        [{ jobType: 'structure' }];
      if (gecmisVar) {
        isler.push({ jobType: 'insights_backfill', dateFrom, dateTo: gecmisSonu });
      }
      if (bugunVar) {
        isler.push({ jobType: 'insights_realtime', dateFrom: bugun, dateTo: bugun });
      }

      for (const is of isler) {
        const res = await this.queue.enqueue({
          clientId: account.clientId,
          platform: account.platform,
          jobType: is.jobType,
          adAccountId: account.id,
          interactive: true,
          ...(is.dateFrom ? { dateFrom: is.dateFrom, dateTo: is.dateTo } : {}),
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
/**
 * Bir gün öncesi — YYYY-MM-DD dizgesi üzerinden.
 *
 * `Date`'e çevirip geri yazmak saat dilimi kayması üretiyor (CLAUDE.md);
 * UTC gün başına sabitleyip çıkarmak kaymayı kapatıyor.
 */
function oncekiGun(gun: string): string {
  const d = new Date(`${gun}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
