import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  backfillSchema,
  bulkRefreshSchema,
  refreshRangeSchema,
  type BulkRefreshEstimate,
  type BulkRefreshInput,
  type BulkRefreshKurtarma,
  type BulkRefreshProgress,
  type BulkRefreshStarted,
  type BulkRefreshTani,
  type BackfillInput,
  type RefreshRangeInput,
  type SyncAccountStatus,
  type SyncExcludedCounts,
  type SyncJobStatusRow,
  type SyncStatusResponse,
  type TenantContext,
} from '@advetics/shared';
import { Prisma, type SyncJobType } from '@prisma/client';
import type { Platform } from '@advetics/shared';
import { CurrentTenant, RequireOrgAdmin, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { SyncQueueService } from '../../queue/sync-queue.service';
import { buildJobId, type SyncJobPayload } from '../../queue/queues';
import { supurmeDisiSebep } from '../../queue/supurme-kapsami';
import { AuditService } from '../audit/audit.service';
import type { AuthedRequest } from '../../common/types/request';
import { EN_AZ_ORNEK, ilerleme, pencereler, planla } from './toplu-tazeleme';

/**
 * İş türü → kullanıcıya gösterilecek aşama metni.
 *
 * Yüzde tek başına "neyin %40'ı" sorusunu cevaplamıyor; aşama metni onu
 * cevaplıyor ve TAHMİNLE DEĞİL en son koşan işin türünden türetiliyor.
 */
/**
 * Partide hiçbir iş bu süre boyunca kıpırdamadıysa TANI KOŞULUYOR.
 *
 * Tanı, bitmemiş her iş için Redis'e ayrı bir soru demek ve çubuk beş
 * saniyede bir yoklanıyor: 1.200 işlik bir partide her yoklamada yüzlerce
 * sorgu, paylaşımlı bir sunucuda kabul edilemez. Parti ilerlerken tanıya
 * ihtiyaç da yok — soru ancak çubuk DURDUĞUNDA anlamlı.
 *
 * On dakika: en yavaş iş (90 günlük reklam seviyesi geçmiş, parçalar hâlinde)
 * bile bu süre içinde en az bir parça yazıyor.
 */
const DURGUNLUK_MS = 10 * 60_000;

/**
 * Tanıda en fazla kaç işe bakılır.
 *
 * Sınırın kendisi zararsız, SESSİZ OLMASI zararlı olurdu: kaç işe bakıldığı
 * ve kaç iş açık olduğu ikisi birden dönüyor.
 */
const TANI_SINIRI = 200;

/**
 * Tek kurtarma turunda en fazla kaç iş geri konur.
 *
 * Her iş bir Redis sorgusu ve bir tablo güncellemesi; sınırsız bir tur
 * paylaşımlı sunucuda HTTP isteğini dakikalarca açık tutardı. Kalan iş
 * sayısı yanıtta DÖNÜYOR — sessiz kesme yok, kullanıcı düğmeye tekrar
 * basacağını biliyor.
 */
const KURTARMA_SINIRI = 300;

/**
 * AÇIK DURUMLAR — çubuğu bitmekten alıkoyan satırlar.
 *
 * `throttled` de buraya dâhil ve sebebi somut: kota reddi bir HATA değil,
 * iş kota penceresi açılınca devam edecek. Ama tabloda `throttled` duran bir
 * satırın kuyrukta karşılığı olmayabiliyor ve o zaman "bekliyor" cümlesi
 * yalan oluyor.
 */
const ACIK_DURUMLAR = ['queued', 'running', 'throttled'] as const;

const ASAMA_METNI: Partial<Record<string, string>> = {
  structure: 'Kampanya yapısı taranıyor',
  insights_backfill: 'Geçmiş metrikler çekiliyor',
  insights_breakdowns: 'Kitle kırılımları çekiliyor',
};

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
/**
 * "Şimdi güncelle"de metrik işine tanınan bekleme.
 *
 * Yapı taramasının bitmesine pay bırakıyor. Garanti değil — gerçek güvence
 * metrik işinin yapı koşmamışsa hiç başlamaması (`insights-sync.service.ts`).
 */
const YAPI_ICIN_TANINAN_SURE_MS = 90_000;

const RECENT_JOB_LIMIT = 25;

/**
 * "Sıfır satır yazdı" hangi iş türlerinde bir ARIZA işareti.
 *
 * Organik gönderi ya da potansiyel müşteri işi sıfır satırla bitebilir ve bu
 * normaldir — o gün yeni gönderi yoktur. Metrik işinde sıfır satır ise ya
 * yapı taraması eksik ya varlık arşivlenmiş demek.
 */
const METRIK_ISLERI = [
  'insights_realtime',
  'insights_daily',
  'insights_backfill',
  'initial_backfill',
  // `as const` DEĞİL: Prisma `in` süzgeci mutable dizi bekliyor.
] satisfies SyncJobType[];

/** `sonIsSorgusu` dönüşü — ham SQL snake_case veriyor. */
interface HamIs {
  id: bigint;
  job_type: string;
  entity_level: string | null;
  status: string;
  attempts: number;
  rows_upserted: number;
  rows_skipped: number | null;
  api_calls_used: number;
  error_code: string | null;
  error_message: string | null;
  note: string | null;
  ad_account_id: string;
  created_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

/**
 * HESAP BAŞINA TEK SATIR — `DISTINCT ON` ile.
 *
 * Prisma'da "her gruptan en yenisi" doğrudan yok; alternatif hesap başına
 * ayrı sorgu açmak olurdu. Ham SQL `withTenant` içinde koşuyor, yani RLS
 * aynen uygulanıyor.
 *
 * İŞ TÜRÜ BAŞINA ayrı satır: "son iş" tek başına bir kilidi gizliyordu.
 * Bir Meta hesabında yapı taraması kotaya takılıp `throttled` kalmıştı ama
 * daha yeni bir metrik işi olduğu için o satır hiçbir yerde görünmüyordu.
 */
async function sonIsSorgusu(
  tx: { $queryRaw: <T>(q: Prisma.Sql) => Promise<T> },
): Promise<Map<string, HamIs[]>> {
  const rows = await tx.$queryRaw<HamIs[]>(Prisma.sql`
    SELECT DISTINCT ON (ad_account_id, job_type)
           id, job_type, entity_level, status, attempts,
           rows_upserted, rows_skipped, api_calls_used,
           error_code, error_message, note,
           ad_account_id, created_at, started_at, finished_at
      FROM sync_jobs
     WHERE ad_account_id IS NOT NULL
     ORDER BY ad_account_id, job_type, created_at DESC
  `);
  const out = new Map<string, HamIs[]>();
  for (const r of rows) {
    const liste = out.get(r.ad_account_id);
    if (liste) liste.push(r);
    else out.set(r.ad_account_id, [r]);
  }
  // Düşen işler ÖNCE: kullanıcının aradığı satır arıza satırı.
  for (const liste of out.values()) {
    liste.sort((a, b) => {
      const ay = a.status === 'failed' ? 0 : 1;
      const by = b.status === 'failed' ? 0 : 1;
      return ay !== by ? ay - by : b.created_at.getTime() - a.created_at.getTime();
    });
  }
  return out;
}

/** Ham satırı sözleşmedeki şekle çevirir. */
function isSatiri(r: HamIs, adiyle: Map<string, string>): SyncJobStatusRow {
  return {
    // BIGSERIAL: olduğu gibi döndürmek JSON.stringify içinde patlıyor.
    id: r.id.toString(),
    jobType: r.job_type,
    entityLevel: r.entity_level,
    status: r.status,
    attempts: r.attempts,
    rowsUpserted: r.rows_upserted,
    apiCallsUsed: r.api_calls_used,
    errorCode: r.error_code,
    errorMessage: r.error_message,
    rowsSkipped: r.rows_skipped,
    note: r.note,
    adAccountId: r.ad_account_id,
    adAccountName: adiyle.get(r.ad_account_id) ?? null,
    createdAt: r.created_at.toISOString(),
    startedAt: r.started_at?.toISOString() ?? null,
    finishedAt: r.finished_at?.toISOString() ?? null,
  };
}

@Controller('sync')
export class SyncController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: SyncQueueService,
    private readonly audit: AuditService,
  ) {}

  /**
   * "BU MÜŞTERİDE VERİ NEDEN YOK" SORUSUNUN CEVAP YERİ.
   *
   * Bu uç önce yalnızca "en son ne zaman güncellendi" diyordu. Yetmediği
   * canlıda görüldü: bir workspace’te Meta verisi hiç gelmiyordu, bağlantı
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
    const { rows, jobs, jobsTotal, failedCount, emptyCount, runningCount, sonIsler } =
      await this.prisma.withTenant(ctx, async (tx) => {
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
      const [jobs, jobsTotal, failedCount, emptyCount, runningCount, sonIsler] =
        await Promise.all([
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
            rowsSkipped: true,
            note: true,
            adAccountId: true,
            createdAt: true,
            startedAt: true,
            finishedAt: true,
          },
        }),
        tx.syncJob.count(),
        /*
         * SAYAÇLAR VERİTABANINDAN — gösterilen 25 satırdan DEĞİL.
         *
         * İlk sürüm bunları `recentJobs` dizisinden türetiyordu ve "5 düşen
         * iş" aslında "gösterilen 25 işin 5'i" anlamına geliyordu. Kesilmiş
         * bir listeden sayı üretmek, sessiz kesmenin başka bir biçimi.
         */
        tx.syncJob.count({ where: { status: 'failed' } }),
        tx.syncJob.count({
          where: { status: 'succeeded', rowsUpserted: 0, jobType: { in: METRIK_ISLERI } },
        }),
        tx.syncJob.count({ where: { status: { in: ['running', 'queued', 'throttled'] } } }),
        /*
         * HESAP BAŞINA SON İŞ. `DISTINCT ON` Prisma'da yok; ham SQL
         * `withTenant` içinde koşuyor, yani RLS aynen uygulanıyor.
         */
        sonIsSorgusu(tx),
      ]);

      return { rows, jobs, jobsTotal, failedCount, emptyCount, runningCount, sonIsler };
    });

    const adiyle = new Map(rows.map((a) => [a.id, a.name]));

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
        lastJobs: (sonIsler.get(a.id) ?? []).map((r) => isSatiri(r, adiyle)),
      };
    });

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
      rowsSkipped: j.rowsSkipped,
      note: j.note,
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
      jobCounts: { failed: failedCount, emptySuccess: emptyCount, running: runningCount },
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
        'Önce bir workspace seçin — güncelleme seçili workspace’in hesapları için çalışır.',
      );
    }

    const accounts = await this.enabledAccounts(ctx);
    const profiles = await this.enabledProfiles(ctx);
    if (accounts.length === 0 && profiles.length === 0) {
      throw new BadRequestException(
        'Bu workspace’te izlemeye alınmış hesap ya da sayfa yok. Platform Bağlantıları ' +
          've Workspace’ler ekranından izlemeye al.',
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
      const isler: Array<{
        jobType:
          | 'structure'
          | 'insights_realtime'
          | 'insights_backfill'
          | 'insights_breakdowns'
          | 'keyword_insights'
          | 'search_terms';
        dateFrom?: string;
        dateTo?: string;
      }> = [{ jobType: 'structure' }];
      if (gecmisVar) {
        isler.push({ jobType: 'insights_backfill', dateFrom, dateTo: gecmisSonu });
      }
      if (bugunVar) {
        isler.push({ jobType: 'insights_realtime', dateFrom: bugun, dateTo: bugun });
      }

      /*
       * ═══ KIRILIMLAR DA BU DÜĞMEDE ═══
       *
       * Organik gönderilerde öğrenilen dersin aynısı: düğme "Şimdi güncelle"
       * diyor ama raporun bir bölümüne hiç dokunmuyorsa adı ile yaptığı iş
       * ayrışıyor. Kırılım tabloları raporda duruyor; kullanıcı düğmeye
       * basıp tabloların boş kalmasını "arıza" diye okur ve sebebini hiçbir
       * ekranda bulamaz.
       *
       * YAPI TARAMASINA BAĞLI DEĞİL — gecikme de YOK. Metrik işleri
       * kampanya satırına bağlanıyor ve o yüzden yapıyı bekliyor; kırılım
       * ise hesap seviyesinde toplanmış geliyor ve hiçbir varlık satırına
       * eşlenmiyor. Boşuna beklemek, kullanıcının ekranda beklediği süreyi
       * uzatırdı.
       *
       * GEÇMİŞ ARALIK KULLANILIYOR, bugün değil: kırılım verisi gün
       * kapandıktan sonra oturuyor ve gecelik süpürme de aynı pencereyi
       * (son 7 gün) çekiyor. Aralık yalnızca bugünü kapsıyorsa iş hiç
       * açılmıyor — boşuna kota.
       */
      if (gecmisVar) {
        isler.push({ jobType: 'insights_breakdowns', dateFrom, dateTo: gecmisSonu });
      }

      /*
       * ═══ ANAHTAR KELİME VE ARAMA TERİMİ DE BU DÜĞMEDE ═══
       *
       * Kırılımlarda ve organik gönderilerde öğrenilen dersin aynısı: düğme
       * "Şimdi güncelle" diyor ama raporun bir bölümüne hiç dokunmuyorsa adı
       * ile yaptığı iş ayrışıyor. İkisi de Google şablonunun bölümleri ve
       * kullanıcı düğmeye basıp o tabloların boş kalmasını "arıza" diye
       * okuyor.
       *
       * YALNIZCA GOOGLE HESAPLARINDA. Meta'da anahtar kelime ve arama terimi
       * diye bir şey YOK; sağlayıcı boş dizi dönüyor ama iş yine de token
       * çözüyor, kuyruk satırı yazıyor ve teşhis ekranında "0 satır" olarak
       * görünüp "neden boş" sorusunu doğuruyor. Erken çıkış servislerde de
       * var, burada iş HİÇ AÇILMIYOR.
       *
       * GEÇMİŞ ARALIK: ikisi de gün bazlı ve bugünün verisi kapanmamış.
       * Gecelik süpürme de aynı pencereyi (son 7 gün) kullanıyor.
       */
      if (gecmisVar && account.platform === 'google') {
        isler.push({ jobType: 'keyword_insights', dateFrom, dateTo: gecmisSonu });
        isler.push({ jobType: 'search_terms', dateFrom, dateTo: gecmisSonu });
      }

      for (const is of isler) {
        const res = await this.queue.enqueue({
          clientId: account.clientId,
          platform: account.platform,
          jobType: is.jobType,
          adAccountId: account.id,
          interactive: true,
          /*
           * METRİK İŞLERİ GECİKMELİ, YAPI İŞİ DEĞİL.
           *
           * Atama yolunda bu gecikme vardı, "Şimdi güncelle" yolunda yoktu ve
           * fark canlıda ölçüldü: bir Meta hesabında yapı taraması 11:33'te
           * koşarken aynı dakikada başlayan metrik işi 422 satır çekip
           * hiçbirini yazamadı ("0 satır · 422 atlandı"), bir dakika sonraki
           * iş ise 86 satır yazdı. Aradaki tek fark yapı taramasının
           * bitmesiydi.
           *
           * Öncelik farkı (yapı 4, metrik 10) bir BARİYER DEĞİL: worker dört
           * işi paralel çalıştırıyor.
           */
          /*
           * GECİKME YALNIZCA METRİK İŞLERİNE. Yapı ve kırılım beklemiyor:
           * yapı zaten ilk iş, kırılım ise hiçbir varlık satırına
           * eşlenmediği için yapıya bağlı değil.
           */
          /*
           * GECİKME KIRILIM DIŞINDAKİ HER ŞEYE. Metrikler kampanya satırına,
           * anahtar kelime ve arama terimi ise REKLAM GRUBUNA eşleniyor;
           * yapı taraması bitmeden koşarlarsa eşleşme bulunamıyor ve satır
           * `ad_group_id = null` ile bağlamsız yazılıyor — atılmıyor ama
           * raporda hangi gruba ait olduğu kayboluyor.
           *
           * Kırılım tek istisna: hesap seviyesinde toplanmış geliyor ve
           * hiçbir varlık satırına eşlenmiyor.
           */
          ...(is.jobType === 'structure' || is.jobType === 'insights_breakdowns'
            ? {}
            : { delayMs: YAPI_ICIN_TANINAN_SURE_MS }),
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
        'Önce bir workspace seçin — geçmiş veri seçili workspace’in hesapları için çekilir.',
      );
    }

    const accounts = await this.enabledAccounts(ctx);
    if (accounts.length === 0) {
      throw new BadRequestException(
        'Bu workspace’te izlemeye alınmış hesap yok. Platform Bağlantıları ekranından hesap seçin.',
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

  /**
   * ═══ TOPLU VERİ TAZELEME ═══
   *
   * Seçilen workspace’lerin son N yılının bütün verisi. `backfill` ucundan
   * farkı: TEK MÜŞTERİ değil, seçilen workspace’lerin HEPSİ; ve aralık tek
   * bir işe sığmadığı için pencerelere bölünüyor.
   *
   * `apply: false` (varsayılan) HİÇBİR ŞEY YAPMIYOR, yalnızca ne olacağını
   * söylüyor. Kota geri alınamaz biçimde harcanıyor ve iki yıllık bir tazeleme
   * yüzlerce çağrı demek — kullanıcı ne kadar olduğunu görmeden basmamalı.
   *
   * AKTİF MÜŞTERİ SEÇİMİ ARANMIYOR — `backfill`in aksine. Bu uç zaten hangi
   * workspace’lerin kapsandığını AÇIKÇA alıyor; ayrıca aktif müşteri istemek,
   * "Tüm müşteriler" görünümündeyken düğmenin çalışmaması demekti ve düğmenin
   * bulunduğu ekran (Platform Bağlantıları) tam olarak o görünümde açılıyor.
   */
  @Post('bulk-refresh')
  @HttpCode(HttpStatus.OK)
  @RequireOrgAdmin()
  @RequirePermissions('sync.trigger')
  async bulkRefresh(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(bulkRefreshSchema)) dto: BulkRefreshInput,
    @Req() req: AuthedRequest,
  ): Promise<BulkRefreshEstimate | BulkRefreshStarted> {
    /*
     * ERİŞİLEBİLİR OLMAYAN WORKSPACE SESSİZCE ATLANMIYOR.
     * RLS zaten süzüyor ama fark kullanıcıya söylenmezse "12 seçtim, 9
     * işlendi" hâli sebepsiz kalır.
     */
    const izinli = dto.clientIds.filter((id) => ctx.clientIds.includes(id));
    if (izinli.length === 0) {
      throw new BadRequestException('Seçilen workspace’lere erişiminiz yok.');
    }

    const tumHesaplar = await this.enabledAccounts(ctx);
    const hesaplar = tumHesaplar.filter((a) => izinli.includes(a.clientId));

    /*
     * YAPI TARAMASI OLMAYAN HESAP ATLANMIYOR — yapı işi zaten planın İLK
     * adımı ve aynı turda koşuyor. `backfill` ucunda atlanıyordu çünkü orada
     * yapı işi açılmıyor; burada açılıyor ve atlamak, yeni bağlanan bir
     * hesabın geçmişinin hiç gelmemesi demekti.
     */
    const yapisiz = hesaplar.filter((a) => a.lastStructureSyncAt === null).length;

    const bugun = isoToday();
    const dateTo = oncekiGun(bugun);
    const dateFrom = isoDaysAgo(dto.years * 365);
    const araliklar = pencereler(dateFrom, dateTo);

    const plan = planla({
      hesaplar: hesaplar.map((a) => ({
        id: a.id,
        clientId: a.clientId,
        platform: a.platform as Platform,
      })),
      from: dateFrom,
      to: dateTo,
      kirilimlar: dto.breakdowns,
    });

    if (!dto.apply) {
      return {
        applied: false,
        clientCount: izinli.length,
        accountCount: hesaplar.length,
        noStructure: yapisiz,
        windowCount: araliklar.length,
        jobCount: plan.length,
        dateFrom,
        dateTo,
      };
    }

    if (hesaplar.length === 0) {
      throw new BadRequestException(
        'Seçilen workspace’lerde izlemeye alınmış hesap yok. Platform Bağlantıları ekranından izlemeye alın.',
      );
    }

    const parti = await this.prisma.withTenant(ctx, (tx) =>
      tx.syncBatch.create({
        data: {
          orgId: ctx.orgId,
          createdByUserId: ctx.userId,
          clientIds: izinli,
          dateFrom: new Date(`${dateFrom}T00:00:00Z`),
          dateTo: new Date(`${dateTo}T00:00:00Z`),
        },
        select: { id: true },
      }),
    );

    let queued = 0;
    let skipped = 0;
    for (const is of plan) {
      const res = await this.queue.enqueue({
        clientId: is.clientId,
        platform: is.platform,
        jobType: is.jobType,
        adAccountId: is.adAccountId,
        batchId: parti.id,
        /*
         * `interactive` DEĞİL. Kullanıcı ekranda ilerlemeyi izliyor ama bu
         * iş saatler sürüyor; `interactive` bayrağı kuyruktaki takılmış iş
         * tespitini agresifleştiriyor ve yüzlerce işlik bir partide meşru
         * gecikmeleri "takılmış" sayıp kaldırırdı.
         */
        ...(is.dateFrom ? { dateFrom: is.dateFrom, dateTo: is.dateTo } : {}),
      });
      if (res.enqueued) queued++;
      else skipped++;
    }

    /*
     * PAYDA KUYRUĞA GİREN İŞ SAYISI, PLANLANAN DEĞİL. Mükerrer engeline
     * takılan iş `sync_jobs` satırı yazmıyor; planı payda yapmak yüzdeyi
     * asla %100'e çıkarmazdı.
     */
    await this.prisma.withTenant(ctx, (tx) =>
      tx.syncBatch.update({
        where: { id: parti.id },
        data: { totalJobs: queued, skippedJobs: skipped },
      }),
    );

    await this.prisma.withTenant(ctx, (tx) =>
      this.audit.record(tx, ctx, {
        action: 'sync.bulk_refresh',
        targetType: 'sync_batch',
        targetId: parti.id,
        after: { clientIds: izinli, dateFrom, dateTo, queued, skipped },
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
        requestId: req.requestId,
      }),
    );

    return {
      applied: true,
      batchId: parti.id,
      jobCount: queued,
      skipped,
      accountCount: hesaplar.length,
    };
  }

  /**
   * Parti ilerlemesi — çubuğun beslendiği yer.
   *
   * ORTALAMA SÜRE YALNIZCA BU PARTİDEN. Genel bir ortalama kullanmak, küçük
   * bir hesabın hızlı işleriyle büyük bir hesabın yavaş işlerini karıştırıp
   * tahmini sistematik olarak yanlış yapardı.
   */
  @Get('bulk-refresh/:id')
  @RequirePermissions('insights.read')
  async bulkRefreshProgress(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BulkRefreshProgress> {
    /*
     * TANI TRANSACTION'IN DIŞINDA. `withTenant` etkileşimli bir transaction
     * açıyor ve Prisma'nın sınırı 5 saniye; tanı her açık iş için Redis'e
     * ayrı bir soru demek ve iki yüz soru o sınırı rahatça aşar. Transaction
     * ölürse yanıt da ölür ve kullanıcı çubuğu tamamen kaybeder.
     */
    const veri = await this.prisma.withTenant(ctx, async (tx) => {
      const parti = await tx.syncBatch.findUnique({
        where: { id },
        select: {
          id: true,
          dateFrom: true,
          dateTo: true,
          clientIds: true,
          totalJobs: true,
          skippedJobs: true,
          createdAt: true,
        },
      });
      if (!parti) throw new NotFoundException('Tazeleme partisi bulunamadı');

      const sayimlar = await tx.syncJob.groupBy({
        by: ['status'],
        where: { batchId: id },
        _count: { _all: true },
      });
      const say = (s: string): number =>
        sayimlar.find((r) => r.status === s)?._count._all ?? 0;

      /*
       * ORTALAMA SÜRE TAMAMLANMIŞ İŞLERDEN. `startedAt`/`finishedAt` ikisi
       * de dolu olanlar sayılıyor: yalnızca `finishedAt`e bakmak, kuyrukta
       * bekleme süresini de işlem süresi sanmak demekti ve tahmini kat kat
       * şişirirdi.
       */
      const sureler = await tx.$queryRaw<Array<{ ort: number | null; n: bigint | number }>>(
        Prisma.sql`
          SELECT AVG(EXTRACT(EPOCH FROM (finished_at - started_at)))::float8 AS ort,
                 COUNT(*) AS n
          FROM sync_jobs
          WHERE batch_id = ${id}::uuid
            AND started_at IS NOT NULL
            AND finished_at IS NOT NULL
        `,
      );
      const ornek = Number(sureler[0]?.n ?? 0);
      const ortalama = ornek >= EN_AZ_ORNEK ? (sureler[0]?.ort ?? null) : null;

      const p = ilerleme(
        parti.totalJobs,
        {
          tamamlanan: say('succeeded'),
          dusen: say('failed'),
          kosan: say('running'),
          iptal: say('cancelled'),
        },
        ortalama,
      );

      /*
       * SON HAREKET — partinin YAŞADIĞINI gösteren tek işaret.
       *
       * Yüzde hareketsiz olabilir ama iş koşuyor olabilir (tek bir 90 günlük
       * çekim on dakika sürüyor). Ayırt eden şey yüzde değil, herhangi bir
       * işin en son ne zaman başladığı ya da bittiği.
       */
      const hareket = await tx.$queryRaw<Array<{ son: Date | null }>>(
        Prisma.sql`
          SELECT MAX(GREATEST(started_at, finished_at)) AS son
          FROM sync_jobs
          WHERE batch_id = ${id}::uuid
        `,
      );
      const sonHareket = hareket[0]?.son ?? null;
      const durgun =
        !p.bitti && Date.now() - (sonHareket ?? parti.createdAt).getTime() > DURGUNLUK_MS;

      /*
       * AŞAMA METNİ — yüzde tek başına "neyin %40'ı" sorusunu cevaplamıyor.
       * En son koşan işin türünden türetiliyor, tahminle değil.
       */
      const sonIs = await tx.syncJob.findFirst({
        where: { batchId: id, status: { in: ['running', 'succeeded'] } },
        orderBy: { createdAt: 'desc' },
        select: { jobType: true },
      });

      // Tanı için açık işlerin KUYRUK KİMLİKLERİ — sorgunun kendisi dışarıda
      // koşuyor, satırlar burada okunuyor (RLS bu transaction'da).
      const acikIsler = durgun
        ? await tx.syncJob.findMany({
            where: { batchId: id, status: { in: [...ACIK_DURUMLAR] } },
            orderBy: { createdAt: 'asc' },
            take: TANI_SINIRI,
            select: { id: true, queueJobId: true, nextRetryAt: true },
          })
        : [];

      return { parti, p, sonHareket, durgun, sonIs, acikIsler, acikToplam: p.toplam - (p.tamamlanan + p.dusen + p.iptal) };
    });

    const { parti, p } = veri;
    const tani = veri.durgun
      ? await this.partiTanisi(veri.acikIsler, veri.sonHareket, veri.acikToplam)
      : null;

    const asama = p.bitti
      ? 'Tamamlandı'
      : tani !== null && tani.kayip > 0
        ? 'Takıldı'
        : veri.sonIs === null
          ? 'Kuyrukta bekliyor'
          : ASAMA_METNI[veri.sonIs.jobType] ?? 'İşleniyor';

    return {
      batchId: parti.id,
      dateFrom: parti.dateFrom.toISOString().slice(0, 10),
      dateTo: parti.dateTo.toISOString().slice(0, 10),
      clientCount: parti.clientIds.length,
      ...p,
      asama,
      atlanan: parti.skippedJobs,
      tani,
    };
  }

  /**
   * ═══ DURAN BİR PARTİNİN BİTMEMİŞ İŞLERİ NEREDE ═══
   *
   * İki hâl aynı görünüyor ve İKİSİ TAMAMEN FARKLI:
   *
   *   · İş kuyrukta duruyor — kota penceresi açılınca ya da sıra gelince
   *     koşacak. Yapılacak bir şey yok, beklemek doğru davranış.
   *   · İş yalnızca TABLODA duruyor — BullMQ kaydı yok. Worker deploy
   *     sırasında öldürülmüş, iş takılmış sayılıp atılmış ya da Redis
   *     temizlenmiş olabilir. Bu satırı hiçbir worker almayacak; çubuk
   *     sonsuza kadar %99'da kalır ve o veri hiç gelmez.
   *
   * Tablodan okunan durum ikisini AYIRT EDEMİYOR; ayıran tek şey kuyruğa
   * sorulan soru.
   */
  private async partiTanisi(
    acikIsler: Array<{ queueJobId: string | null; nextRetryAt: Date | null }>,
    sonHareket: Date | null,
    acikToplam: number,
  ): Promise<BulkRefreshTani> {
    const kimlikler = acikIsler
      .map((i) => i.queueJobId)
      .filter((k): k is string => k !== null);
    const durum = await this.queue.kuyruktaMi(kimlikler);

    let kuyrukta = 0;
    let kayip = 0;
    let enYakin: Date | null = null;
    for (const is of acikIsler) {
      // KUYRUK KİMLİĞİ OLMAYAN SATIR KAYIP SAYILIYOR. Kimlik `enqueue`
      // sırasında yazılıyor; yoksa o satır kuyruğa hiç ulaşmamış demek.
      const canli = is.queueJobId !== null && durum.get(is.queueJobId) === true;
      if (canli) {
        kuyrukta++;
        if (is.nextRetryAt && (enYakin === null || is.nextRetryAt < enYakin)) {
          enYakin = is.nextRetryAt;
        }
      } else {
        kayip++;
      }
    }

    return {
      kuyrukta,
      kayip,
      enYakinDeneme: enYakin?.toISOString() ?? null,
      sonHareket: sonHareket?.toISOString() ?? null,
      bakilan: acikIsler.length,
      acikToplam,
    };
  }

  /**
   * ═══ TAKILAN İŞLERİ GERİ KOY ═══
   *
   * Kuyruktan düşmüş bir iş kendiliğinden geri gelmiyor: `sync_jobs` satırı
   * açık kalıyor, çubuk %99'da duruyor ve o hesabın o dönemi HİÇ gelmiyor.
   * Bugüne kadar tek çözüm partiyi baştan başlatmaktı — 1.266 işin 1.259'unu
   * yeniden koşturmak, saatler ve kota demek.
   *
   * YENİ SATIR AÇILMIYOR, VAR OLAN SATIR GERİ KONUYOR. Yüzdenin paydası
   * partinin açılışında sabitlendi; yeni satır açmak eski satırı sonsuza
   * kadar açık bırakır ve çubuk yine bitmezdi.
   *
   * KURTARILAMAYAN İŞ KAPATILIYOR, ASILI BIRAKILMIYOR. Hesabı silinmiş ya da
   * izlemeden çıkarılmış bir işi yeniden koymak anlamsız; o satır `cancelled`
   * olarak kapanıyor ve sebebi yazılıyor. Aksi hâlde çubuk yine bitmez ve
   * kullanıcı aynı düğmeye sonsuza kadar basardı.
   */
  @Post('bulk-refresh/:id/kurtar')
  @HttpCode(HttpStatus.OK)
  @RequireOrgAdmin()
  @RequirePermissions('sync.trigger')
  async bulkRefreshKurtar(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
  ): Promise<BulkRefreshKurtarma> {
    const { isler, acikToplam } = await this.prisma.withTenant(ctx, async (tx) => {
      const parti = await tx.syncBatch.findUnique({ where: { id }, select: { id: true } });
      if (!parti) throw new NotFoundException('Tazeleme partisi bulunamadı');

      const acik = { batchId: id, status: { in: [...ACIK_DURUMLAR] } };
      return {
        acikToplam: await tx.syncJob.count({ where: acik }),
        isler: await tx.syncJob.findMany({
          where: acik,
          orderBy: { createdAt: 'asc' },
          take: KURTARMA_SINIRI,
          select: {
            id: true,
            clientId: true,
            adAccountId: true,
            jobType: true,
            entityLevel: true,
            dateFrom: true,
            dateTo: true,
            priority: true,
            queueJobId: true,
          },
        }),
      };
    });

    // Hesabın HÂLÂ izlendiğini doğrula — süzgeç `enabledAccounts` ile aynı.
    // Ayrı yazmak, bir gün ikisinin ayrışması demek.
    const hesapIdler = isler
      .map((i) => i.adAccountId)
      .filter((h): h is string => h !== null);
    const hesaplar = new Map(
      (await this.enabledAccounts(ctx))
        .filter((h) => hesapIdler.includes(h.id))
        .map((h) => [h.id, h]),
    );

    const durum = await this.queue.kuyruktaMi(
      isler.map((i) => i.queueJobId).filter((k): k is string => k !== null),
    );

    let yenidenKuyruklanan = 0;
    let kuyrukta = 0;
    let vazgecilen = 0;

    for (const is of isler) {
      if (is.queueJobId !== null && durum.get(is.queueJobId) === true) {
        kuyrukta++;
        continue;
      }

      const hesap = is.adAccountId ? hesaplar.get(is.adAccountId) : undefined;
      const sebep = kurtarmaEngeli(is, hesap);
      if (sebep !== null) {
        await this.prisma.withTenant(ctx, (tx) =>
          tx.syncJob.update({
            where: { id: is.id },
            data: {
              status: 'cancelled',
              finishedAt: new Date(),
              errorCode: 'kurtarilamadi',
              errorMessage: sebep,
            },
          }),
        );
        vazgecilen++;
        continue;
      }

      const payload: SyncJobPayload = {
        syncJobId: is.id.toString(),
        clientId: is.clientId,
        platform: hesap!.platform as Platform,
        jobType: is.jobType,
        adAccountId: is.adAccountId ?? undefined,
        entityLevel: is.entityLevel ?? undefined,
        dateFrom: is.dateFrom?.toISOString().slice(0, 10),
        dateTo: is.dateTo?.toISOString().slice(0, 10),
      };
      const jobId =
        is.queueJobId ??
        buildJobId({
          jobType: is.jobType,
          adAccountId: is.adAccountId ?? undefined,
          entityLevel: is.entityLevel ?? undefined,
          dateFrom: payload.dateFrom,
          dateTo: payload.dateTo,
        });

      /*
       * ÖNCE TABLO, SONRA KUYRUK — `enqueue` ile aynı sıra ve aynı sebep.
       * Ters sırada worker işi alıp `running` yazabiliyor ve bizim
       * güncellememiz onu `queued`a geri çekiyor: iş koşuyorken tabloda
       * kuyrukta görünüyor.
       */
      await this.prisma.withTenant(ctx, (tx) =>
        tx.syncJob.update({
          where: { id: is.id },
          data: {
            status: 'queued',
            startedAt: null,
            finishedAt: null,
            nextRetryAt: null,
            errorCode: null,
            errorMessage: null,
            queueJobId: jobId,
          },
        }),
      );

      try {
        await this.queue.yenidenKuyrukla(payload, jobId, is.priority);
        yenidenKuyruklanan++;
      } catch (err) {
        // Kuyruğa eklenemeyen iş ÖKSÜZ BIRAKILMIYOR: `queued` kalan satır
        // hiç koşmaz ve çubuk yine bitmez.
        await this.prisma.withTenant(ctx, (tx) =>
          tx.syncJob.update({
            where: { id: is.id },
            data: {
              status: 'failed',
              finishedAt: new Date(),
              errorCode: 'enqueue_failed',
              errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
            },
          }),
        );
        vazgecilen++;
      }
    }

    await this.prisma.withTenant(ctx, (tx) =>
      this.audit.record(tx, ctx, {
        action: 'sync.bulk_refresh_recover',
        targetType: 'sync_batch',
        targetId: id,
        after: { yenidenKuyruklanan, kuyrukta, vazgecilen },
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
        requestId: req.requestId,
      }),
    );

    return {
      yenidenKuyruklanan,
      kuyrukta,
      vazgecilen,
      kalan: Math.max(0, acikToplam - isler.length),
    };
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

/**
 * Bir işi geri koymanın önünde ne var — ya da `null`.
 *
 * SEBEP CÜMLESİ SATIRA YAZILIYOR. "Kurtarılamadı" tek başına kullanıcıyı
 * olmayan bir arızayı aramaya gönderiyor; hesabın izlemeden çıkarılmış
 * olması tamamen meşru bir sebep ve söylenmesi gerekiyor.
 */
function kurtarmaEngeli(
  is: { jobType: SyncJobType; adAccountId: string | null; dateFrom: Date | null; dateTo: Date | null },
  hesap: { id: string } | undefined,
): string | null {
  if (is.adAccountId === null) return 'İş bir reklam hesabına bağlı değil.';
  if (!hesap) return 'Reklam hesabı artık izlenmiyor ya da bağlantısı kapalı.';
  // Metrik işleri tarihsiz koşamıyor: worker `missing_dates` ile düşürüyor
  // ve o düşüş de kotayı harcıyor. Baştan kapatmak daha ucuz.
  if (is.jobType !== 'structure' && (is.dateFrom === null || is.dateTo === null)) {
    return 'İşin tarih aralığı eksik.';
  }
  return null;
}
