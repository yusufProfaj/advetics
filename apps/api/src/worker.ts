import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { UnrecoverableError, Worker } from 'bullmq';
import Redis from 'ioredis';
import { AppModule } from './app.module';
import { PrismaAdminService } from './prisma/prisma-admin.service';
import { CONFIG, type AppConfig } from './config/configuration';
import { QuotaGuardService } from './queue/quota-guard.service';
import { SyncQueueService } from './queue/sync-queue.service';
import { QuotaThrottleError, SyncProcessorService } from './queue/sync-processor.service';
import { SYNC_QUEUE, type SyncJobPayload } from './queue/queues';

/**
 * Worker süreci — API'den AYRI çalışır.
 *
 * Neden ayrı süreç:
 *   · Senkronizasyon işleri dakikalarca sürüyor (Meta async insight job'ları,
 *     90 günlük backfill saatler alıyor). Aynı süreçte HTTP isteklerine
 *     yanıt vermek olay döngüsünü tıkardı.
 *   · Worker'ı bağımsız yeniden başlatabilmek gerekiyor: bir sync hatası API'yi
 *     düşürmemeli.
 *   · Ölçeklendirme ayrı: API'yi çoğaltmak ucuz, worker'ı çoğaltmak kotayı
 *     tüketir.
 *
 * ÖNEMLİ: worker `fork` modunda TEK instance çalışmalı. Cluster moduna
 * alınırsa zamanlanmış işler instance sayısı kadar tetiklenir ve bütçeler
 * birden fazla kez değiştirilir. Bkz. ecosystem.config.js
 *
 * HTTP dinlemiyor — `createApplicationContext` kullanıyoruz. Böylece worker'a
 * dışarıdan istek gelmesi imkânsız.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Worker');
  // `bufferLogs: true` KULLANMIYORUZ — kullanmak worker'ı log'suz bırakıyor.
  //
  // `bufferLogs` tüm log'ları Logger sınıfının STATİK tamponuna alıyor ve
  // tamponu yalnızca `flushLogs()` boşaltıyor. HTTP uygulamasında bunu
  // `listen()` kendisi yapıyor (bkz. main.ts, orada bufferLogs güvenli), ama
  // `createApplicationContext` yalnızca "logger override edilirse boşalt"
  // bayrağını kuruyor. Worker `useLogger()` çağırmadığı için boşaltma hiç
  // olmuyor: açılış satırları, kota uyarıları, iş sonuçları — hiçbiri
  // stdout'a düşmüyor ve pm2 log dosyaları BOŞ kalıyor.
  //
  // Bir kez yaşandı: worker Redis'e bağlanıp 5 zamanlayıcıyı kurdu, pm2
  // "online" gösterdi, log dosyaları tamamen boştu. Çalıştığını yalnızca
  // Redis anahtarlarına bakarak doğrulayabildik.
  //
  // Tampon ayrıca hiç boşaltılmadığı için sınırsız büyüyor (5.000 satır
  // ~184 KB) — 7/24 çalışan bir süreçte yavaş bir bellek sızıntısı.
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();

  const config = app.get<AppConfig>(CONFIG);
  const quota = app.get(QuotaGuardService);
  const queueService = app.get(SyncQueueService);
  const processor = app.get(SyncProcessorService);

  if (!config.redis.url) {
    logger.error('REDIS_URL tanımlı değil — worker başlatılamıyor.');
    await app.close();
    process.exit(1);
  }

  // Redis'e gerçekten erişebildiğimizi açılışta doğrula. Sessizce başlayıp
  // hiçbir iş almamak, en zor teşhis edilen arıza türü.
  if (!(await quota.ping())) {
    logger.error(`Redis'e erişilemiyor (${config.redis.url}, db ${config.redis.db}).`);
    await app.close();
    process.exit(1);
  }
  logger.log(`Redis bağlı — db ${config.redis.db}, önek "${config.redis.keyPrefix}"`);

  // insights_daily partition'larının hazır olduğunu garanti et.
  //
  // Ay dönümünde bakım işi kaçmışsa yazma hatası alırdık. Açılışta çağırmak
  // ucuz ve idempotent.
  try {
    const parts = await app.get(PrismaAdminService).$queryRaw<Array<{ partition_name: string }>>`
      SELECT * FROM app.ensure_insights_partitions()
    `;
    const created = parts.filter((p) => p.partition_name.includes('oluşturuldu')).length;
    logger.log(
      `insights_daily partition kontrolü: ${parts.length} ay kapsandı${
        created > 0 ? `, ${created} yeni oluşturuldu` : ''
      }`,
    );
  } catch (err) {
    // Partition oluşturma DDL gerektiriyor; worker rolünün yetkisi yoksa
    // fonksiyon zaten sessizce atlıyor. Yine de görünür olsun.
    logger.warn(
      `Partition kontrolü yapılamadı: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const schedules = await queueService.installSchedules();
  schedules.forEach((s) => logger.log(`  zamanlanmış: ${s}`));

  const connection = new Redis(config.redis.url, {
    db: config.redis.db,
    maxRetriesPerRequest: null,
  });

  const worker = new Worker<SyncJobPayload>(
    SYNC_QUEUE,
    async (job) => {
      const started = Date.now();
      const label = `${job.name}#${job.id}`;
      try {
        const result = await processor.process(job.data);
        logger.log(
          `${label} tamam — ${result.rows} satır, ${Date.now() - started}ms${
            result.note ? ` · ${result.note}` : ''
          }`,
        );
        return result;
      } catch (err) {
        // Kota reddi normal işleyişin parçası, hata değil. Gecikmeli tekrar
        // için BullMQ'ya bırakıyoruz ama log seviyesini düşürüyoruz — aksi
        // hâlde log'lar kota uyarılarıyla dolar ve gerçek hatalar kaybolur.
        if (err instanceof QuotaThrottleError) {
          logger.warn(`${label} kota nedeniyle beklemede: ${err.message}`);
          await job.moveToDelayed(Date.now() + err.retryAfterMs, job.token);
          return { rows: 0, note: 'throttled' };
        }
        if (err instanceof UnrecoverableError) {
          logger.warn(`${label} kalıcı hata (tekrar denenmeyecek): ${err.message}`);
        } else {
          logger.error(`${label} başarısız: ${err instanceof Error ? err.message : String(err)}`);
        }
        throw err;
      }
    },
    {
      connection,
      prefix: config.redis.keyPrefix,
      // Eşzamanlılık kasıtlı olarak düşük. Kota HESAP bazlı ve paylaşımlı bir
      // sunucudayız; agresif paralellik hem platform kotasını hem sunucu
      // kaynağını tüketir. Ölçek gerektiğinde artırılır.
      concurrency: 4,
      // Kuyruk genelinde saniyede en fazla 5 iş başlat. Kota bekçisi hesap
      // bazlı koruyor; bu ise toplam ivmeyi sınırlıyor.
      limiter: { max: 5, duration: 1_000 },
    },
  );

  worker.on('failed', (job, err) => {
    logger.error(`İş ${job?.id ?? '?'} nihai olarak başarısız: ${err.message}`);
  });
  worker.on('error', (err) => {
    logger.error(`Worker hatası: ${err.message}`);
  });

  logger.log('Worker hazır — kuyruk: sync, eşzamanlılık: 4');

  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`${signal} alındı, işler tamamlanıyor…`);
    // close(): çalışan işlerin bitmesini bekler, yenisini almaz. Zorla
    // kapatmak yarım kalmış senkronizasyon bırakır.
    await worker.close();
    await connection.quit().catch(() => connection.disconnect());
    await app.close();
    logger.log('Worker kapandı.');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void bootstrap();
