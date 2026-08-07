import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import type { EntityLevel, Platform, SyncJobType } from '@prisma/client';
import { CONFIG, type AppConfig } from '../config/configuration';
import { PrismaAdminService } from '../prisma/prisma-admin.service';
import { JOB_PRIORITY, SYNC_QUEUE, buildJobId, layerForJob, type SyncJobPayload } from './queues';

/**
 * Senkronizasyon işlerini kuyruğa koyar.
 *
 * Her iş İKİ yere yazılıyor:
 *   · `sync_jobs` tablosu — kalıcı iz. BullMQ işleri Redis'te yaşıyor ve Redis
 *     temizlenince kaybolur; "en son ne zaman senkronize edildi" sorusunun
 *     cevabı veritabanında durmalı.
 *   · BullMQ kuyruğu — asıl çalıştırma.
 *
 * Sıra önemli: önce tablo, sonra kuyruk. Tersi olursa worker işi tablo kaydı
 * oluşmadan alabilir ve `syncJobId`'yi bulamaz.
 */
@Injectable()
export class SyncQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(SyncQueueService.name);
  private readonly connection: Redis | null;
  private readonly queueOrNull: Queue<SyncJobPayload> | null;

  constructor(
    @Inject(CONFIG) config: AppConfig,
    private readonly db: PrismaAdminService,
  ) {
    // REDIS_URL yoksa açılışta fırlatmıyoruz — gerekçe QuotaGuardService'te.
    if (!config.redis.url) {
      this.connection = null;
      this.queueOrNull = null;
      return;
    }
    // maxRetriesPerRequest null: BullMQ bunu şart koşuyor, aksi hâlde uzun
    // süren blocking komutlarda bağlantıyı düşürüyor.
    this.connection = new Redis(config.redis.url, {
      db: config.redis.db,
      maxRetriesPerRequest: null,
    });

    this.queueOrNull = new Queue<SyncJobPayload>(SYNC_QUEUE, {
      connection: this.connection,
      // PAYLAŞIMLI REDIS: önek olmadan BullMQ anahtarları diğer sitelerin
      // anahtarlarıyla aynı ad alanına düşer.
      prefix: config.redis.keyPrefix,
      defaultJobOptions: {
        attempts: 5,
        // Exponential + jitter: rate limit sonrası hepsi aynı anda dönmesin.
        backoff: { type: 'exponential', delay: 5_000 },
        // Başarılı işleri saklamak Redis'i şişirir; kalıcı iz zaten tabloda.
        removeOnComplete: { age: 3600, count: 500 },
        // Başarısızları daha uzun tutuyoruz — teşhis için lazım.
        removeOnFail: { age: 86_400 },
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.connection) return;
    await this.queueOrNull?.close().catch(() => undefined);
    await this.connection.quit().catch(() => this.connection?.disconnect());
  }

  /** Kuyruk kullanılabilir mi — controller'lar buna göre 503 döner. */
  get isEnabled(): boolean {
    return this.queueOrNull !== null;
  }

  private get queue(): Queue<SyncJobPayload> {
    if (!this.queueOrNull) {
      throw new Error(
        'REDIS_URL tanımlı değil — senkronizasyon kuyruğu çalışamaz. Sunucudaki .env ' +
          'dosyasına REDIS_URL, REDIS_DB ve REDIS_KEY_PREFIX ekleyin (bkz. .env.example).',
      );
    }
    return this.queueOrNull;
  }

  /**
   * İş kuyruğa ekler. Aynı iş kuyruktaysa TEKRAR EKLENMEZ.
   *
   * `jobId` deduplication'ı BullMQ tarafında yapıyor: zamanlanmış bir iş
   * gecikirse ve bir sonraki tetikleme gelirse mükerrer senkronizasyon
   * çalışmıyor, kota iki kez harcanmıyor.
   */
  async enqueue(params: {
    clientId: string;
    platform: Platform;
    jobType: SyncJobType;
    adAccountId?: string;
    socialProfileId?: string;
    /** Modül 5 — kural işi. Bkz. SyncJobPayload.ruleId */
    ruleId?: string;
    entityLevel?: EntityLevel;
    /** YYYY-MM-DD. Date nesnesi DEĞİL — saat dilimi kayması için bkz. queues.ts */
    dateFrom?: string;
    dateTo?: string;
    interactive?: boolean;
    delayMs?: number;
  }): Promise<{ enqueued: boolean; syncJobId?: string; reason?: string }> {
    const jobId = buildJobId(params);

    // Kuyrukta zaten var mı — tabloya gereksiz kayıt açmadan önce bakıyoruz.
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'waiting' || state === 'active' || state === 'delayed') {
        return { enqueued: false, reason: `zaten kuyrukta (${state})` };
      }
      // Tamamlanmış/başarısız işin kimliği yeniden kullanılabilsin.
      await existing.remove().catch(() => undefined);
    }

    const record = await this.db.syncJob.create({
      data: {
        clientId: params.clientId,
        adAccountId: params.adAccountId ?? null,
        socialProfileId: params.socialProfileId ?? null,
        jobType: params.jobType,
        entityLevel: params.entityLevel ?? null,
        // Prisma DATE kolonuna string veremiyor; burada Date'e çeviriyoruz ama
        // UTC gün başına sabitleyerek — kayma olmasın.
        dateFrom: params.dateFrom ? new Date(`${params.dateFrom}T00:00:00Z`) : null,
        dateTo: params.dateTo ? new Date(`${params.dateTo}T00:00:00Z`) : null,
        status: 'queued',
        priority: JOB_PRIORITY[layerForJob({ ...params, syncJobId: '' } as SyncJobPayload)],
        queueJobId: jobId,
      },
      select: { id: true, priority: true },
    });

    const payload: SyncJobPayload = {
      syncJobId: record.id.toString(),
      clientId: params.clientId,
      platform: params.platform,
      jobType: params.jobType,
      adAccountId: params.adAccountId,
      socialProfileId: params.socialProfileId,
      ruleId: params.ruleId,
      entityLevel: params.entityLevel,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      interactive: params.interactive,
    };

    // Kuyruğa ekleme başarısız olursa tablo kaydını ÖKSÜZ BIRAKMA.
    //
    // Kayıt kuyruktan önce oluşuyor (worker'ın syncJobId'yi bulabilmesi için).
    // `queue.add` fırlatırsa satır sonsuza kadar `queued` kalıyor: hiçbir
    // worker onu almıyor, kimse hata görmüyor ve "en son ne zaman senkronize
    // edildi" telemetrisi yalan söylüyor. Bir kez oldu — geçersiz bir jobId
    // yüzünden tarih taşıyan tüm işler bu şekilde birikiyordu.
    try {
      await this.queue.add(params.jobType, payload, {
        jobId,
        priority: record.priority,
        delay: params.delayMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.db.syncJob.update({
        where: { id: record.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          errorCode: 'enqueue_failed',
          errorMessage: message.slice(0, 1000),
        },
      });
      this.logger.error(`İş kuyruğa eklenemedi (${jobId}): ${message}`);
      throw err;
    }

    return { enqueued: true, syncJobId: record.id.toString() };
  }

  /**
   * Tekrarlanan işleri kurar — mimari dokümandaki katmanlı takvim.
   *
   * BullMQ repeatable job'ları Redis'te KİLİTLENİR: iki API instance'ı aynı
   * zamanlayıcıyı kurarsa iş yine tek kez çalışır. `node-cron` bunu yapmıyor
   * ve her instance ayrı tetikleyerek bütçeyi iki kez değiştirirdi.
   */
  async installSchedules(): Promise<string[]> {
    const installed: string[] = [];

    const schedules: Array<{ name: string; pattern: string; jobType: SyncJobType }> = [
      // L1 — yapı: 6 saatte bir
      { name: 'sweep:structure', pattern: '17 */6 * * *', jobType: 'structure' },
      // L2 — sıcak metrikler: 30 dakikada bir
      { name: 'sweep:realtime', pattern: '*/30 * * * *', jobType: 'insights_realtime' },
      // L3 — dünün tam metrikleri: her saat başı kontrol, hesabın TZ'sine göre
      // gün dönümünü geçenler işlenir (tek bir UTC saatinde çalıştırmak
      // farklı zaman dilimlerindeki hesaplar için yanlış olurdu)
      { name: 'sweep:daily', pattern: '7 * * * *', jobType: 'insights_daily' },
      // L4 — geri düzeltme: günde bir, gece
      { name: 'sweep:backfill', pattern: '23 3 * * *', jobType: 'insights_backfill' },
      // L6 — organik postlar: saatte bir
      { name: 'sweep:organic', pattern: '41 * * * *', jobType: 'organic_posts' },
      // Modül 5 — kural değerlendirmesi: saatte bir.
      //
      // Veri günlük granülerlikte, yani saatte birden sık değerlendirmenin
      // dayanağı yok. Ama günde bir de yetmiyor: L3 senkronizasyonu hesabın
      // KENDİ zaman dilimine göre farklı saatlerde tamamlanıyor ve kural o
      // veri düştüğü anda çalışabilmeli. Saatlik tarama, bekleme süresiyle
      // birlikte hem duyarlı hem sakin bir davranış veriyor.
      { name: 'sweep:rules', pattern: '13 * * * *', jobType: 'rules_evaluate' },
      // Modül 7 — boost: GÜNDE İKİ KEZ, saatte bir değil.
      //
      // Organik metrikler yavaş değişiyor ve boost kararı bir gönderi için
      // yalnızca BİR KEZ veriliyor. Saatlik tarama aynı sonucu 24 kez
      // hesaplardı; günde iki kez hem sabah hem akşam paylaşımlarını
      // yakalıyor.
      { name: 'sweep:boosts', pattern: '29 8,20 * * *', jobType: 'boosts_evaluate' },
    ];

    for (const s of schedules) {
      // Dakika değerleri kasıtlı olarak farklı (17, 7, 23, 41): hepsi aynı
      // dakikada tetiklenirse kota aynı anda tüketilir ve platform bloklar.
      await this.queue.upsertJobScheduler(
        s.name,
        { pattern: s.pattern, tz: 'UTC' },
        {
          name: `sweep:${s.jobType}`,
          data: {
            syncJobId: '',
            clientId: '',
            platform: 'meta',
            jobType: s.jobType,
          } satisfies SyncJobPayload,
          opts: { priority: JOB_PRIORITY[layerForJob({ jobType: s.jobType } as SyncJobPayload)] },
        },
      );
      installed.push(`${s.name} (${s.pattern})`);
    }

    this.logger.log(`Zamanlanmış süpürme işleri kuruldu: ${installed.length}`);
    return installed;
  }

  /** Kuyruk sağlığı — panelde ve /health'te gösterilecek. */
  async stats(): Promise<Record<string, number>> {
    if (!this.queueOrNull) return {};
    const counts = await this.queue.getJobCounts(
      'waiting',
      'active',
      'delayed',
      'failed',
      'completed',
    );
    return counts as Record<string, number>;
  }

  /** Testler ve bakım için — kuyruk nesnesine doğrudan erişim. */
  get raw(): Queue<SyncJobPayload> {
    return this.queue;
  }
}
