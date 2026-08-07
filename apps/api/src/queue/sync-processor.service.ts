import { Injectable, Logger } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { PlatformApiError } from '../modules/connections/provider.types';
import type { Platform } from '@advetics/shared';
import { PrismaAdminService } from '../prisma/prisma-admin.service';
import { QuotaGuardService, type QuotaLayer } from './quota-guard.service';
import { InsightsSyncService } from './insights-sync.service';
import { StructureSyncService } from './structure-sync.service';
import { SyncQueueService } from './sync-queue.service';
import { layerForJob, type SyncJobPayload } from './queues';
import type { TenantContext } from '@advetics/shared';
import { RulesService } from '../modules/rules/rules.service';
import { RuleExecutorService } from '../modules/rules/rule-executor.service';
import { OrganicSyncService } from './organic-sync.service';
import { BoostsService } from '../modules/boosts/boosts.service';
import { BoostExecutorService } from '../modules/boosts/boost-executor.service';

/**
 * Worker'ın sentetik kiracı bağlamındaki kullanıcı kimliği.
 *
 * Gerçek bir kullanıcı DEĞİL ve olmamalı: kuralın aldığı aksiyonun failini
 * bir kişiye yazmak yanlış olurdu. Denetim kaydına zaten `actorType='rule'`
 * ve kuralın adı yazılıyor; bu kimlik yalnızca bağlam nesnesini doldurmak
 * için var ve `rule_runs`/`audit_logs` içinde hiçbir yere düşmüyor.
 */
const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000002';

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
    private readonly structure: StructureSyncService,
    private readonly insights: InsightsSyncService,
    private readonly rules: RulesService,
    private readonly executor: RuleExecutorService,
    private readonly organic: OrganicSyncService,
    private readonly boosts: BoostsService,
    private readonly boostExecutor: BoostExecutorService,
  ) {}

  async process(payload: SyncJobPayload): Promise<{ rows: number; note?: string }> {
    // Süpürme işi: clientId boş gelir.
    if (!payload.clientId) return this.fanOut(payload);
    // KURAL İŞİ hesap işinden AYRI yol izliyor: bir kural birden fazla
    // hesaba dokunabiliyor, dolayısıyla iş seviyesinde tek bir hesabın
    // kotasına bakmak yanlış olurdu. Kota kontrolü aksiyon başına,
    // uygulayıcının içinde.
    if (payload.ruleId) return this.processRuleJob(payload);
    if (payload.jobType === 'boosts_evaluate') return this.processBoostJob(payload);
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
    if (payload.jobType === 'rules_evaluate') return this.fanOutRules();
    if (payload.jobType === 'boosts_evaluate') return this.fanOutBoosts();

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
  /**
   * Kural süpürmesi — etkin kuralları bulup KURAL BAŞINA iş açar.
   *
   * Tek bir dev iş yazıp içinde tüm kuralları dolaşmak cazip ama yanlış:
   * bir kuralın patlaması kalan kuralları durdururdu. Ayrı işler ayrıca
   * BullMQ'nun tekrar deneme mekanizmasını kural başına veriyor.
   */
  private async fanOutRules(): Promise<{ rows: number; note: string }> {
    const rules = await this.db.rule.findMany({
      where: {
        enabled: true,
        client: { status: 'active' },
      },
      select: { id: true, clientId: true },
    });

    let enqueued = 0;
    let skipped = 0;
    for (const r of rules) {
      const res = await this.queue.enqueue({
        clientId: r.clientId,
        // Kural değerlendirmesi platformdan BAĞIMSIZ: aynı kural hem Meta
        // hem Google varlıklarını kapsayabiliyor. Alan zorunlu olduğu için
        // bir değer vermek gerekiyor ve bu değer hiçbir yerde kota anahtarı
        // olarak kullanılmıyor — kota aksiyon anında, varlığın GERÇEK
        // platformuyla alınıyor.
        platform: 'meta',
        jobType: 'rules_evaluate',
        ruleId: r.id,
      });
      if (res.enqueued) enqueued++;
      else skipped++;
    }

    return {
      rows: enqueued,
      note: `${rules.length} kural · ${enqueued} kuyruğa alındı · ${skipped} zaten kuyrukta`,
    };
  }

  /**
   * Boost süpürmesi — MÜŞTERİ başına iş açıyor, kural başına değil.
   *
   * Kural motorundan farkı: boost akışının ikinci yarısı (onaylanmışları
   * platformda oluşturmak) müşteri seviyesinde ve kurallardan bağımsız.
   * Elle onaylanmış bir boost, kuralı silinmiş olsa bile oluşturulmalı.
   */
  private async fanOutBoosts(): Promise<{ rows: number; note: string }> {
    const clients = await this.db.client.findMany({
      where: {
        status: 'active',
        OR: [{ boostRules: { some: { enabled: true } } }, { boosts: { some: { status: 'approved' } } }],
      },
      select: { id: true },
    });

    let enqueued = 0;
    for (const c of clients) {
      const res = await this.queue.enqueue({
        clientId: c.id,
        platform: 'meta',
        jobType: 'boosts_evaluate',
      });
      if (res.enqueued) enqueued++;
    }
    return { rows: enqueued, note: `${clients.length} müşteri · ${enqueued} kuyruğa alındı` };
  }

  /**
   * Bir müşterinin boost kurallarını çalıştırır ve onaylanmışları oluşturur.
   *
   * İKİ ADIM AYNI İŞTE ama SIRA ÖNEMLİ: önce aday üretmek, sonra onaylıları
   * oluşturmak. Ters sırada, bu turda otomatik onaylanan bir aday bir sonraki
   * tura kadar beklerdi — yarım gün gecikme.
   */
  private async processBoostJob(payload: SyncJobPayload): Promise<{ rows: number; note: string }> {
    const syncJobId = BigInt(payload.syncJobId);
    await this.db.syncJob.update({
      where: { id: syncJobId },
      data: { status: 'running', startedAt: new Date(), attempts: { increment: 1 } },
    });

    const rules = await this.db.boostRule.findMany({
      where: { clientId: payload.clientId, enabled: true },
      select: { id: true },
    });

    let candidates = 0;
    const notes: string[] = [];
    for (const r of rules) {
      const out = await this.boosts.runRule(this.db, r.id, new Date());
      candidates += out.created;
      notes.push(...out.notes);
    }

    const created = await this.boostExecutor.createApproved(this.db, payload.clientId);

    await this.db.syncJob.update({
      where: { id: syncJobId },
      data: {
        status: 'succeeded',
        finishedAt: new Date(),
        rowsUpserted: candidates + created.created,
      },
    });

    return {
      rows: candidates + created.created,
      note: [
        `${candidates} aday`,
        `${created.created} boost oluşturuldu`,
        created.failed > 0 ? `${created.failed} başarısız` : null,
        ...notes,
      ]
        .filter(Boolean)
        .join(' · '),
    };
  }

  /**
   * Tek bir kuralı değerlendirir.
   *
   * KİRACI BAĞLAMI SENTETİK. Worker'ın oturumu yok; bağlam kuralın kendi
   * org/client değerlerinden kuruluyor ve `PrismaAdminService` (BYPASSRLS)
   * ile çalışıyor. Bu, senkronizasyon işlerinin izlediği yolun aynısı —
   * worker RLS'e tabi olsaydı hiçbir satır göremezdi.
   */
  private async processRuleJob(payload: SyncJobPayload): Promise<{ rows: number; note: string }> {
    const syncJobId = BigInt(payload.syncJobId);
    await this.db.syncJob.update({
      where: { id: syncJobId },
      data: { status: 'running', startedAt: new Date(), attempts: { increment: 1 } },
    });

    const rule = await this.rules.getForWorker(this.db, payload.ruleId!);
    if (!rule) {
      // Kural silinmiş olabilir: iş kuyruğa girdikten sonra silinen bir kural
      // için hata fırlatmak, tekrar denemelerle sonsuza kadar başarısız bir iş
      // bırakırdı. Sessizce başarılı saymak da yanlış — sebebi not düşüyoruz.
      await this.db.syncJob.update({
        where: { id: syncJobId },
        data: { status: 'succeeded', finishedAt: new Date(), rowsUpserted: 0 },
      });
      return { rows: 0, note: 'kural bulunamadı (silinmiş olabilir)' };
    }

    const ctx = {
      userId: SYSTEM_ACTOR_ID,
      orgId: rule.orgId,
      clientIds: [rule.clientId],
      activeClientId: rule.clientId,
      role: 'owner',
      isOrgAdmin: true,
      permissions: [],
    } as unknown as TenantContext;

    const res = await this.executor.execute(this.db, ctx, rule.record);

    await this.db.syncJob.update({
      where: { id: syncJobId },
      data: { status: 'succeeded', finishedAt: new Date(), rowsUpserted: res.actionCount },
    });

    return {
      rows: res.actionCount,
      note: `${rule.record.name}: ${res.matchedCount} eşleşme · ${res.actionCount} aksiyon${
        rule.record.dryRun ? ' (prova)' : ''
      }`,
    };
  }

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

    // -----------------------------------------------------------------------
    // Katman yönlendirmesi.
    //
    // Yazılmamış katmanlar UnrecoverableError fırlatıyor: retry etmek anlamsız,
    // kota harcar ve başarısız kuyruğu şişirir. `sync_jobs.error_code` =
    // `not_implemented` — hangi katmanın eksik olduğu teşhiste net.
    // -----------------------------------------------------------------------
    if (payload.jobType === 'structure') {
      if (!payload.adAccountId) {
        await this.markFailed(syncJobId, 'missing_account', 'structure işi hesap kimliği olmadan geldi');
        throw new UnrecoverableError('structure işi hesap kimliği olmadan geldi');
      }

      try {
        const result = await this.structure.syncAccount({
          adAccountId: payload.adAccountId,
          // Kullanıcı elle tetiklediyse tam tarama yap: "yenile"ye basan biri
          // silinmiş kampanyanın kaybolmasını bekliyor.
          full: payload.interactive === true,
        });
        await this.markSucceeded(payload.syncJobId, result.rows, result.apiCalls);
        return { rows: result.rows, note: result.note };
      } catch (err) {
        await this.recordFailure(syncJobId, err);
        throw err;
      }
    }

    if (
      payload.jobType === 'insights_realtime' ||
      payload.jobType === 'insights_daily' ||
      payload.jobType === 'insights_backfill' ||
      payload.jobType === 'initial_backfill'
    ) {
      if (!payload.adAccountId) {
        await this.markFailed(syncJobId, 'missing_account', `${payload.jobType} hesap kimliği olmadan geldi`);
        throw new UnrecoverableError(`${payload.jobType} hesap kimliği olmadan geldi`);
      }
      // Tarih olmadan metrik çekilemez. Süpürme işi tarihleri hesabın zaman
      // dilimine göre hesaplıyor; elle tetiklenen bir işte eksik olabilir.
      if (!payload.dateFrom || !payload.dateTo) {
        await this.markFailed(syncJobId, 'missing_dates', `${payload.jobType} tarih aralığı olmadan geldi`);
        throw new UnrecoverableError(`${payload.jobType} tarih aralığı olmadan geldi`);
      }

      try {
        const result = await this.insights.syncAccount({
          adAccountId: payload.adAccountId,
          jobType: payload.jobType,
          dateFrom: payload.dateFrom,
          dateTo: payload.dateTo,
        });
        await this.markSucceeded(payload.syncJobId, result.rows, result.apiCalls);
        return { rows: result.rows, note: result.note };
      } catch (err) {
        await this.recordFailure(syncJobId, err);
        throw err;
      }
    }

    if (payload.jobType === 'organic_posts') {
      if (!payload.socialProfileId) {
        await this.markFailed(syncJobId, 'missing_profile', 'organic_posts sosyal profil olmadan geldi');
        throw new UnrecoverableError('organic_posts sosyal profil olmadan geldi');
      }
      try {
        const result = await this.organic.syncProfile(payload.socialProfileId);
        await this.markSucceeded(payload.syncJobId, result.rows, 1);
        return { rows: result.rows, note: result.note };
      } catch (err) {
        await this.recordFailure(syncJobId, err);
        throw err;
      }
    }

    await this.markFailed(
      syncJobId,
      'not_implemented',
      `${payload.jobType} işleyicisi henüz yazılmadı`,
    );
    throw new UnrecoverableError(`${payload.jobType} işleyicisi henüz yazılmadı`);
  }

  private async markFailed(syncJobId: bigint, code: string, message: string): Promise<void> {
    await this.db.syncJob.update({
      where: { id: syncJobId },
      data: {
        status: 'failed',
        finishedAt: new Date(),
        errorCode: code.slice(0, 80),
        errorMessage: message.slice(0, 1000),
      },
    });
  }

  /**
   * Hatayı tabloya yazar ve tekrar denenebilirliğini işaretler.
   *
   * `throttled` ile `failed` ayrımı önemli: throttled bir iş normal işleyişin
   * parçası ve panelde alarm üretmemeli, failed ise müdahale gerektiriyor.
   */
  private async recordFailure(syncJobId: bigint, err: unknown): Promise<void> {
    const platformError = err instanceof PlatformApiError ? err : undefined;
    const retryable = platformError?.retryable ?? !(err instanceof UnrecoverableError);

    // Ham platform gövdesini LOGLA.
    //
    // `errorMessage` kolonu 1000 karakterle sınırlı ve normalize edilmiş mesajı
    // taşıyor. Meta'nın tam yanıtı (hangi alan reddedildi, fbtrace_id) yalnızca
    // `detail.raw` içinde ve oraya kimse bakamıyor — kalıcı bir hatayı teşhis
    // etmek için tek elimizdeki şey bu.
    if (platformError && !platformError.retryable) {
      this.logger.error(
        `Platform hatası (${platformError.platform}/${platformError.kind}): ` +
          JSON.stringify(platformError.detail?.raw ?? {}).slice(0, 2000),
      );
    }

    await this.db.syncJob.update({
      where: { id: syncJobId },
      data: {
        status: platformError?.kind === 'rate_limited' ? 'throttled' : 'failed',
        finishedAt: retryable ? null : new Date(),
        nextRetryAt: retryable
          ? new Date(Date.now() + (platformError?.detail?.retryAfterSeconds ?? 300) * 1000)
          : null,
        errorCode: (platformError?.kind ?? 'unknown').slice(0, 80),
        errorMessage: (err instanceof Error ? err.message : String(err)).slice(0, 1000),
      },
    });

    // Token geçersizse bağlantıyı işaretle: aynı token'la 5 kez daha denemek
    // kotayı boşa harcıyor ve kullanıcı sorunu hiç görmüyor.
    if (platformError?.kind === 'invalid_token') {
      const job = await this.db.syncJob.findUnique({
        where: { id: syncJobId },
        select: { adAccountId: true },
      });
      if (job?.adAccountId) {
        const account = await this.db.adAccount.findUnique({
          where: { id: job.adAccountId },
          select: { connectionId: true },
        });
        if (account) {
          await this.db.platformConnection.update({
            where: { id: account.connectionId },
            data: { status: 'needs_reauth' },
          });
          this.logger.warn(
            `Bağlantı ${account.connectionId} needs_reauth olarak işaretlendi: ${platformError.message}`,
          );
        }
      }
    }
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
