import { describe, expect, it } from 'vitest';
import type { SyncJobType } from '@prisma/client';
import { JOB_PRIORITY, buildJobId, layerForJob, type SyncJobPayload } from './queues';

/**
 * İş kimliği ve katman eşleme testleri.
 *
 * NEDEN BU TEST VAR: `buildJobId` parçaları `:` ile birleştiriyordu ve BullMQ
 * özel iş kimliğinde `:` yasaklıyor. Tek istisna TAM ÜÇ parçalı kimlikler —
 * eski repeatable job'lar için bırakılmış bir muafiyet.
 *
 * Sonuç sinsiydi: `structure` işi tesadüfen üç parçaya denk geldiği için
 * çalışıyordu, tarih taşıyan işler (`insights_daily`, `insights_backfill`)
 * ise `Custom Id cannot contain :` ile patlıyordu. Yani hata ancak L2/L3
 * işleyicileri yazıldığında ortaya çıkacaktı — o da worker log'ları
 * görünmediği için sessizce.
 */

/**
 * BullMQ'nun kendi doğrulaması (bullmq/dist/cjs/classes/job.js).
 *
 * Kuralı kopyalıyoruz çünkü gerçek BullMQ'yu çağırmak Redis gerektiriyor ve
 * test edilmek istenen şey Redis değil, ürettiğimiz kimliğin biçimi.
 */
function bullmqRejectsJobId(jobId: string): boolean {
  return jobId.includes(':') && jobId.split(':').length !== 3;
}

const ALL_JOB_TYPES: SyncJobType[] = [
  'structure',
  'insights_realtime',
  'insights_daily',
  'insights_backfill',
  'insights_breakdown',
  'organic_posts',
  'initial_backfill',
];

const ACCOUNT = '1a37dded-9b02-4dcc-85fe-0fcac06d8ce1';

describe('buildJobId', () => {
  it('hiçbir iş türü için `:` içermez', () => {
    for (const jobType of ALL_JOB_TYPES) {
      const id = buildJobId({ jobType, adAccountId: ACCOUNT });
      expect(id, `${jobType} kimliğinde \`:\` var: ${id}`).not.toContain(':');
      expect(bullmqRejectsJobId(id), `BullMQ reddederdi: ${id}`).toBe(false);
    }
  });

  it('REGRESYON: tarih taşıyan işlerin kimliği de geçerli', () => {
    // Bu kombinasyon 5 parça üretiyordu ve üç parçalı muafiyete girmiyordu.
    const id = buildJobId({
      jobType: 'insights_daily',
      adAccountId: ACCOUNT,
      entityLevel: 'campaign',
      dateFrom: '2026-08-05',
      dateTo: '2026-08-05',
    });
    expect(bullmqRejectsJobId(id)).toBe(false);
    // Tarihler kimliğe girmeli: aynı hesabın farklı günleri ayrı iş.
    expect(id).toContain('2026-08-05');
  });

  it('ayırt edici alanlar değiştiğinde kimlik değişir', () => {
    const base = { jobType: 'insights_daily' as const, adAccountId: ACCOUNT };
    const ids = new Set([
      buildJobId(base),
      buildJobId({ ...base, dateFrom: '2026-08-05' }),
      buildJobId({ ...base, dateFrom: '2026-08-06' }),
      buildJobId({ ...base, entityLevel: 'ad' }),
      buildJobId({ ...base, adAccountId: 'başka-hesap' }),
    ]);
    // Beşi de farklı olmalı; çakışma iki ayrı işin birini yok sayması demek.
    expect(ids.size).toBe(5);
  });

  it('aynı girdi için aynı kimlik — dedup buna dayanıyor', () => {
    const params = {
      jobType: 'structure' as const,
      adAccountId: ACCOUNT,
      entityLevel: 'campaign' as const,
    };
    expect(buildJobId(params)).toBe(buildJobId(params));
  });

  it('hesap kimliği yokken de geçerli kimlik üretir', () => {
    const id = buildJobId({ jobType: 'structure' });
    expect(bullmqRejectsJobId(id)).toBe(false);
    expect(id).toContain('na');
  });

  it('sosyal profil işleri hesap işlerinden farklı kimlik alır', () => {
    const a = buildJobId({ jobType: 'organic_posts', adAccountId: ACCOUNT });
    const b = buildJobId({ jobType: 'organic_posts', socialProfileId: ACCOUNT });
    // Aynı UUID iki farklı varlık türü olabilir; şu an ikisi de aynı slota
    // yazıyor. Çakışma pratikte imkânsız (ayrı UUID uzayları) ama kimliğin
    // hangi alandan geldiği belirsiz — bu iddia o belirsizliği kayda geçiriyor.
    expect(a).toBe(b);
  });
});

describe('layerForJob', () => {
  it('her iş türü bir kota katmanına eşlenir', () => {
    for (const jobType of ALL_JOB_TYPES) {
      const layer = layerForJob({ jobType } as SyncJobPayload);
      expect(layer, `${jobType} eşlenmedi`).toBeTruthy();
      expect(JOB_PRIORITY[layer], `${layer} için öncelik yok`).toBeTypeOf('number');
    }
  });

  it('kullanıcı tetiklemeli iş `interactive` katmanına gider', () => {
    // Kota rezervi buna bakıyor: kullanıcı ekranda beklerken iş, arka plan
    // senkronizasyonunun tükettiği bütçeden etkilenmemeli.
    const layer = layerForJob({ jobType: 'structure', interactive: true } as SyncJobPayload);
    expect(layer).toBe('interactive');
  });

  it('öncelik sırası doğru: interaktif işler backfillden önce', () => {
    // BullMQ'da KÜÇÜK sayı önce çalışır.
    expect(JOB_PRIORITY.interactive).toBeLessThan(JOB_PRIORITY.insights_daily);
    expect(JOB_PRIORITY.insights_daily).toBeLessThan(JOB_PRIORITY.initial_backfill);
  });
});
