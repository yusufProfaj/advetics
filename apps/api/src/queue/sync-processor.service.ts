import { Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import type { Platform } from '@advetics/shared';
import { PrismaAdminService } from '../prisma/prisma-admin.service';
import { QuotaGuardService, type QuotaLayer } from './quota-guard.service';
import { SyncQueueService } from './sync-queue.service';
import { layerForJob, type SyncJobPayload } from './queues';

/**
 * İş işleyicisi.
 *
 * İki tür iş var:
 *
 *   1. SÜPÜRME (`clientId` boş) — zamanlayıcıdan gelir, hangi hesapların
 *      senkronize edilmesi gerektiğini bulup HESAP BAŞINA iş kuyruğa koyar.
 *      Kendisi API çağrısı yapmaz.
 *   2. HESAP İŞİ — tek bir reklam hesabı için gerçek senkronizasyon. Kota
 *      kontrolünden geçmek ZORUNDA.
 *
 * Bu ikiye ayırmanın sebebi kota: kota HESAP bazlıdır. Tek bir dev iş yazıp
 * içinde 40 hesabı dolaşmak, ilk hesap bloklandığında kalan 39'unu da
 * durdururdu. Hesap başına iş, birinin bloklanmasının diğerlerini
 * etkilememesini sağlıyor.
 */
@Injectable()
export class SyncProcessorService {
  private readonly logger = new Logger(SyncProcessorService.name);

  constructor(
    private readonly db: PrismaAdminService,
    private readonly quota: QuotaGuardService,
    private readonly queue: SyncQueueService,
  ) {}

  async process(payload: SyncJobPayload): Promise<{ rows: number; note?: string }> {
    // Süpürme işi: clientId boş gelir.
    if (!payload.clientId) return this.fanOut(payload);
    return this.processAccountJob(payload);
  }

  /**
   * Süpürme — senkronize edilecek hesapları bulup iş açar.
   *
   * `syncEnabled` KAPALI hesaplar atlanır. Bağlantı kurulduğunda hesaplar
   * varsayılan olarak kapalı geliyor; 40 hesaplı bir Business Manager'ı bağlayan
   * biri istemeden 40 hesabın kotasını yakmasın diye.
   */
  private async fanOut(payload: SyncJobPayload): Promise<{ rows: number; note: string }> {
    const accounts = await this.db.adAccount.findMany({
      where: {
        syncEnabled: true,
        status: { in: ['active', 'paused'] },
        connection: { status: 'active' },
        client: { status: 'active' },
      },
      select: {
        id: true,
        clientId: true,
        platform: true,
        timezone: true,
        lastInsightsSyncAt: true,
        lastStructureSyncAt: true,
      },
    });

    let enqueued = 0;
    let skipped = 0;

    for (const acct of accounts) {
      // Organik post işleri reklam hesabına değil sosyal profile ait.
      if (payload.jobType === 'organic_posts') continue;

      const dates = this.datesForJob(payload.jobType, acct.timezone);

      const res = await this.queue.enqueue({
        clientId: acct.clientId,
        platform: acct.platform as Platform,
        jobType: payload.jobType,
        adAccountId: acct.id,
        dateFrom: dates?.from,
        dateTo: dates?.to,
      });
      if (res.enqueued) enqueued++;
      else skipped++;
    }

    // Organik postlar için sosyal profilleri ayrıca dolaş.
    if (payload.jobType === 'organic_posts') {
      const profiles = await this.db.socialProfile.findMany({
        where: {
          syncEnabled: true,
          connection: { status: 'active', platform: 'meta' },
          client: { status: 'active' },
        },
        select: { id: true, clientId: true },
      });
      for (const p of profiles) {
        const res = await this.queue.enqueue({
          clientId: p.clientId,
          platform: 'meta',
          jobType: 'organic_posts',
          socialProfileId: p.id,
        });
        if (res.enqueued) enqueued++;
        else skipped++;
      }
    }

    const note = `${payload.jobType}: ${enqueued} iş açıldı, ${skipped} atlandı (zaten kuyrukta)`;
    this.logger.log(note);
    return { rows: 0, note };
  }

  /**
   * İş türüne göre hangi tarih aralığının çekileceğini belirler.
   *
   * Tarihler HESABIN ZAMAN DİLİMİNDE hesaplanıyor ve string olarak taşınıyor.
   * UTC'ye göre hesaplamak, farklı zaman dilimlerindeki hesaplar için yanlış
   * günü çekmek demek — Los Angeles'taki bir hesap için UTC "dün", henüz
   * bitmemiş bugün olabilir.
   */
  private datesForJob(
    jobType: SyncJobPayload['jobType'],
    timezone: string,
  ): { from: string; to: string } | undefined {
    const todayInTz = this.todayIn(timezone);

    switch (jobType) {
      case 'insights_realtime':
        return { from: todayInTz, to: todayInTz };
      case 'insights_daily': {
        const y = this.shiftDays(todayInTz, -1);
        return { from: y, to: y };
      }
      case 'insights_backfill':
        // L4 — son 7 gün. Atıf pencereleri yüzünden dünün verisi 3 gün sonra
        // hâlâ değişiyor; bir kez çekip bırakmak ROAS'ı sistematik eksik gösterir.
        return { from: this.shiftDays(todayInTz, -7), to: this.shiftDays(todayInTz, -1) };
      default:
        return undefined;
    }
  }

  /** Verilen zaman diliminde bugünün tarihi, YYYY-MM-DD. */
  private todayIn(timezone: string): string {
    try {
      // en-CA formatı YYYY-MM-DD üretiyor — elle parçalamaktan güvenli.
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    } catch {
      this.logger.warn(`Geçersiz zaman dilimi "${timezone}", UTC kullanılıyor`);
      return new Date().toISOString().slice(0, 10);
    }
  }

  /** YYYY-MM-DD üzerinde gün kaydırma — Date nesnesine çevirmeden. */
  private shiftDays(isoDate: string, days: number): string {
    const d = new Date(`${isoDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /**
   * Tek hesabın senkronizasyonu.
   *
   * Kota kontrolü BURADA, API çağrısından önce. Reddedilirse iş kuyruğa geri
   * dönüyor — worker BEKLEMİYOR. Beklemek o worker slotunu başka hesapların
   * işlerine kapatırdı.
   */
  private async processAccountJob(payload: SyncJobPayload): Promise<{ rows: number; note?: string }> {
    const syncJobId = BigInt(payload.syncJobId);

    await this.db.syncJob.update({
      where: { id: syncJobId },
      data: { status: 'running', startedAt: new Date(), attempts: { increment: 1 } },
    });

    if (payload.adAccountId) {
      const layer = layerForJob(payload) as QuotaLayer;
      const gate = await this.quota.acquire({
        platform: payload.platform,
        adAccountId: payload.adAccountId,
        layer,
      });

      if (!gate.allowed) {
        await this.db.syncJob.update({
          where: { id: syncJobId },
          data: {
            status: 'throttled',
            nextRetryAt: new Date(Date.now() + (gate.retryAfterMs ?? 60_000)),
            errorCode: gate.reason?.slice(0, 80) ?? 'quota_denied',
          },
        });
        // BullMQ'ya gecikmeli tekrar için sinyal: hata fırlatıp backoff'a
        // bırakmak yerine açık bir gecikme vermek daha öngörülebilir.
        throw new QuotaThrottleError(gate.reason ?? 'kota reddi', gate.retryAfterMs ?? 60_000);
      }
    }

    // ---------------------------------------------------------------------
    // Gerçek senkronizasyon mantığı henüz yazılmadı.
    //
    // UnrecoverableError kullanıyoruz: retry etmek anlamsız, kota harcar ve
    // başarısız kuyruğu şişirir. sync_jobs tablosunda `not_implemented` olarak
    // görünüyor — hangi katmanın eksik olduğu teşhiste net.
    // ---------------------------------------------------------------------
    await this.db.syncJob.update({
      where: { id: syncJobId },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        errorCode: 'not_implemented',
        errorMessage: `${payload.jobType} işleyicisi henüz yazılmadı`,
      },
    });
    throw new UnrecoverableError(`${payload.jobType} işleyicisi henüz yazılmadı`);
  }

  async markSucceeded(syncJobId: string, rows: number, apiCalls: number): Promise<void> {
    await this.db.syncJob.update({
      where: { id: BigInt(syncJobId) },
      data: {
        status: 'succeeded',
        finishedAt: new Date(),
        rowsUpserted: rows,
        apiCallsUsed: apiCalls,
        errorCode: null,
        errorMessage: null,
      },
    });
  }
}

/** Kota reddi — BullMQ'nun normal hata akışından ayırt edilebilir olmalı. */
export class QuotaThrottleError extends Error {
  constructor(
    message: string,
    readonly retryAfterMs: number,
  ) {
    super(message);
    this.name = 'QuotaThrottleError';
  }
}
