import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DelayedError, UnrecoverableError, Worker } from 'bullmq';
import Redis from 'ioredis';
import { AppModule } from './app.module';
import { PrismaAdminService } from './prisma/prisma-admin.service';
import { CONFIG, type AppConfig } from './config/configuration';
import { QuotaGuardService } from './queue/quota-guard.service';
import { SyncQueueService } from './queue/sync-queue.service';
import { QuotaThrottleError, SyncProcessorService } from './queue/sync-processor.service';
import { nihaiBasarisizlik } from './queue/nihai-basarisizlik';
import { SYNC_QUEUE, type SyncJobPayload } from './queue/queues';
import { CryptoService } from './crypto/crypto.service';
import { REKLAM_YAYIN_KUYRUGU, type ReklamIsi } from './modules/reklam/reklam-kuyrugu';
import { redisKilidi, reklamIsiniIsle } from './modules/reklam/yayin-isleyici';
import { STRATEJI_KELIME_KUYRUGU, type KelimeAramaIsi } from './modules/strateji/kelime-kuyrugu';
import { BEKLENMEYEN_HATA, kelimeIsiniIsle } from './modules/strateji/kelime-isleyici';
import { ProviderRegistry } from './modules/connections/provider.registry';
import { TokenVaultService } from './modules/connections/token-vault.service';
import type { GoogleProvider } from './modules/connections/providers/google.provider';
import { PILOT_KURULUM_KUYRUGU, PilotKurulumKuyrugu, type PilotKurulumIsi } from './modules/pilot/kurulum-kuyrugu';
import { pilotIsiniIsle } from './modules/pilot/kurulum-isleyici';
import { pilotSupurmesi } from './modules/pilot/kurulum-supurme';
import { YAPAY_ZEKA } from './yapay-zeka/yapay-zeka.module';
import type { MetinUretici } from './yapay-zeka/gemini';

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
          /*
           * `DelayedError` FIRLATILMALI, değer DÖNÜLMEMELİ. Dönülen değer
           * BullMQ'ya "iş bitti" diyor ve worker, artık `delayed`de duran işi
           * `completed`e taşımaya çalışıyor; kilit gittiği için bu çağrı
           * düşüyor ve düşüş `failed` yoluna giriyor (BullMQ 5.81
           * `worker.js` → `handleCompleted` / `handleFailed`; kaynaktan
           * okundu, canlı log'da ayrıca doğrulanmadı). İş yine de
           * bekliyordu, ama her kota reddi log'a bir hata yazıyordu. Platform
           * geneli kesici bir anda yüzlerce işi buradan geçireceği için
           * belgelenen yola dönüldü: `handleFailed` DelayedError'ı tanıyor,
           * denemeyi saymıyor ve işe dokunmuyor.
           */
          throw new DelayedError();
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

  /*
   * ═══ KUYRUKTAN DÜŞEN İŞ TABLOYA DA YAZILIYOR ═══
   *
   * Burası uzun süre yalnızca log yazıyordu ve bu bir boşluktu: `sync_jobs`
   * satırını normalde işleyicinin kendisi kapatıyor, ama işleyicinin HİÇ
   * KOŞMADIĞI yollar var. En sık olanı `stalled`: worker deploy sırasında
   * öldürülüyor, kilit düşüyor, BullMQ işi bir kez geri veriyor ve
   * `maxStalledCount` aşılınca atıyor. İşleyici çalışmadığı için tabloya tek
   * satır yazılmıyor ve kayıt sonsuza kadar `running` kalıyor.
   *
   * Sonucu canlıda görüldü: toplu tazeleme çubuğu 1259/1266'da saatlerce
   * durdu, ekranda "İşleniyor" yazıyordu ve hiçbir hata hiçbir yerde yoktu.
   *
   * YALNIZCA AÇIK SATIRA DOKUNULUYOR (`updateMany` + durum süzgeci).
   * İşleyici satırı zaten `succeeded` yazmışsa üstüne yazmak, başarılı bir
   * işi başarısız göstermek olurdu.
   */
  worker.on('failed', (job, err) => {
    logger.error(`İş ${job?.id ?? '?'} başarısız: ${err.message}`);
    if (!job) return;
    const nihai = nihaiBasarisizlik({
      attemptsMade: job.attemptsMade,
      opts: job.opts,
      kalici: err instanceof UnrecoverableError,
    });
    if (!nihai) return;

    const syncJobId = job.data?.syncJobId;
    if (!syncJobId) return;
    void app
      .get(PrismaAdminService)
      .syncJob.updateMany({
        where: { id: BigInt(syncJobId), status: { in: ['queued', 'running', 'throttled'] } },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          errorCode: 'kuyruk_vazgecti',
          errorMessage: err.message.slice(0, 1000),
        },
      })
      .catch((e: unknown) =>
        logger.error(
          `İş ${job.id} tabloda kapatılamadı: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
  });
  worker.on('error', (err) => {
    logger.error(`Worker hatası: ${err.message}`);
  });

  /*
   * YENİ REKLAM MODÜLÜ — kendi kuyruğu ve işleyicisi. Eşzamanlılık 2:
   * hesap başına tek yazıcı kilidi zaten var; aynı anda iki FARKLI hesaba
   * yayın yeterli ve senkron işlerinin Meta kotasıyla yarışmasın.
   * Deneme 1: motor her belirsizliği kendi durumuna çeviriyor; BullMQ'nun
   * kendiliğinden tekrarı sonucu bilinmeyen bir POST'u yeniden gönderirdi.
   */
  const admin = app.get(PrismaAdminService);
  const reklamWorker = new Worker<ReklamIsi>(
    REKLAM_YAYIN_KUYRUGU,
    async (job) => {
      const sonuc = await reklamIsiniIsle(
        {
          tx: (fn) => fn(admin as never),
          crypto: app.get(CryptoService),
          apiSurumu: config.platforms.meta.apiVersion,
          yuklemeKoku: config.uploads.dir,
          kilit: redisKilidi(connection),
          kilitOneki: config.redis.keyPrefix,
        },
        job.data,
        `${job.id}`,
      );
      if (sonuc.tur === 'ertele') {
        // Kilit dolu ya da prova kotası: deneme SAYILMADAN ertelenir.
        await job.moveToDelayed(Date.now() + (job.data.adim === 'prova' ? 90_000 : 30_000), job.token);
        throw new DelayedError();
      }
      logger.log(`reklam-yayin ${job.id} → ${sonuc.durum}`);
      return sonuc;
    },
    { connection, prefix: config.redis.keyPrefix, concurrency: 2 },
  );
  reklamWorker.on('failed', (job, err) => {
    // Nihai düşüş: yayın satırı olduğu durumda kalır (motor her adımı
    // yazmıştı); sebep kaydedilir, kuyruk tarayıcısı ve insan devralır.
    if (!job) return;
    if (job.data.adim === 'prova') {
      // Bekleyen prova sonsuza kadar "soruluyor" kalmasın.
      void admin
        .$executeRaw`UPDATE prova SET durum = 'dogrulanamadi', sebep = ${`İş durdu: ${err.message}`.slice(0, 2000)}, bitti_at = now() WHERE id = ${job.data.provaId}::uuid AND durum = 'bekliyor'`
        .catch((e: unknown) => logger.error(`Prova ${job.data.adim} kapatılamadı: ${e instanceof Error ? e.message : String(e)}`));
      logger.error(`reklam-yayin ${job.id} (prova) düştü: ${err.message}`);
      return;
    }
    const yayinId = job.data.yayinId;
    void admin
      .$executeRaw`UPDATE yayin SET sebep = ${`İş durdu: ${err.message}`.slice(0, 2000)} WHERE id = ${yayinId}::uuid AND sonlandi_at IS NULL`
      .catch((e: unknown) => logger.error(`Yayın ${yayinId} sebebi yazılamadı: ${e instanceof Error ? e.message : String(e)}`));
    logger.error(`reklam-yayin ${job.id} düştü: ${err.message}`);
  });

  /*
   * ADVSTRATEGY KELİME ARAMASI — Google `GenerateKeywordIdeas` 1 QPS.
   * Sınır KUYRUK düzeyinde (`limiter`): kaç API süreci iş eklerse eklesin
   * Google'a saniyede en çok bir istek gider. Eşzamanlılık 1. İşleyici her
   * sonucu plan satırına yazıyor; `failed` dinleyicisi yalnız işleyicinin
   * HİÇ yazamadığı düşüşü (beklenmeyen hata, işçi kapanırken atılan iş)
   * kapatıyor, yoksa plan sonsuza kadar "aranıyor" derdi.
   */
  const googleSaglayici = app.get(ProviderRegistry).get('google');
  const kasa = app.get(TokenVaultService);
  const kelimeWorker = new Worker<KelimeAramaIsi>(
    STRATEJI_KELIME_KUYRUGU,
    async (job) => {
      const sonuc = await kelimeIsiniIsle(
        {
          // GERÇEK TRANSACTION. İşleyicinin yazım adımı (FOR UPDATE → DELETE →
          // INSERT → plan UPDATE) tek transaction varsayıyor; çalıştırıcı
          // `fn(admin)` olsaydı her deyim ayrı commit olur, kilit deyim biter
          // bitmez bırakılır ve INSERT düşerse seçilmemiş fikirler silinmiş
          // kalırdı. Platform çağrısı iki çalıştırıcı çağrısının ARASINDA.
          tx: (fn) => admin.$transaction((t) => fn(t as never)),
          tokenAl: (connectionId) => kasa.getAccessToken(connectionId, googleSaglayici),
          fikirler: (token, musteri, girdi, yonetici) =>
            (googleSaglayici as unknown as GoogleProvider).kelimeFikirleri(token, musteri, girdi, yonetici),
          log: (m) => logger.error(m),
        },
        job.data,
      );
      logger.log(`strateji-kelime ${job.id} → ${sonuc.durum}`);
      return sonuc;
    },
    { connection, prefix: config.redis.keyPrefix, concurrency: 1, limiter: { max: 1, duration: 1000 } },
  );
  kelimeWorker.on('failed', (job, err) => {
    if (!job) return;
    // Ham hata metni plana YAZILMAZ (müşteri de görüyor); sabit cümle plana,
    // ayrıntı log'a. Yalnız bu işin araması hâlâ aktifse kapatılır: daha
    // yeni bir aramanın durumunu bayat bir işin düşüşü ezmesin.
    void admin
      .$executeRaw`UPDATE strateji_planlari SET kelime_arama = 'hata', kelime_son_hata = ${BEKLENMEYEN_HATA} WHERE id = ${job.data.planId}::uuid AND kelime_arama_id = ${job.data.aramaId}::uuid AND kelime_arama IN ('kuyrukta', 'calisiyor')`
      .catch((e: unknown) => logger.error(`Plan ${job.data.planId} kelime durumu kapatılamadı: ${e instanceof Error ? e.message : String(e)}`));
    logger.error(`strateji-kelime ${job.id} düştü: ${err.message}`);
  });

  /*
   * PİLOT KURULUMU — plan ve satır işleri. Eşzamanlılık 2: hesap başına
   * yazıcı kilidi aynı hesaba ikinci yazıcıyı zaten erteliyor. Deneme 1:
   * motor her belirsizliği kendi durumuna çeviriyor; BullMQ'nun tekrarı
   * sonucu bilinmeyen bir POST'u yeniden gönderirdi.
   */
  const pilotKuyruk = app.get(PilotKurulumKuyrugu);
  const pilotWorker = new Worker<PilotKurulumIsi>(
    PILOT_KURULUM_KUYRUGU,
    async (job) => {
      const sonuc = await pilotIsiniIsle(
        {
          tx: (fn) => fn(admin as never),
          crypto: app.get(CryptoService),
          apiSurumu: config.platforms.meta.apiVersion,
          yuklemeKoku: config.uploads.dir,
          kilit: redisKilidi(connection),
          kilitOneki: config.redis.keyPrefix,
          yz: app.get<MetinUretici | null>(YAPAY_ZEKA),
          kuyruk: { satirEkle: (id, tetik, ms) => pilotKuyruk.satirEkle(id, tetik, ms) },
        },
        job.data,
        `${job.id}`,
      );
      if (sonuc.tur === 'ertele') {
        // Kilit dolu ya da prova kotası: deneme SAYILMADAN ertelenir.
        await job.moveToDelayed(Date.now() + sonuc.ms, job.token);
        throw new DelayedError();
      }
      logger.log(`pilot-kurulum ${job.id} → ${sonuc.durum}`);
      return sonuc;
    },
    { connection, prefix: config.redis.keyPrefix, concurrency: 2 },
  );
  pilotWorker.on('failed', (job, err) => {
    // Nihai düşüş: işleyici yazamadan öldüyse satır 'taslak'ta kalır ve
    // plan sonsuza kadar "kuruluyor" derdi. Yalnız HİÇ başlamamış satır
    // kapatılıyor; ara durumdaki satıra dokunulmuyor (Meta'ya gitmiş olabilir).
    if (!job || job.data.tur !== 'satir') {
      logger.error(`pilot-kurulum ${job?.id ?? '?'} düştü: ${err.message}`);
      return;
    }
    void admin
      .$executeRaw`UPDATE pilot_kurulum_satirlari SET durum = 'dustu', platform_mesaji = ${`İş durdu: ${err.message}`.slice(0, 2000)}, updated_at = now() WHERE id = ${job.data.satirId}::uuid AND durum = 'taslak'`
      .catch((e: unknown) => logger.error(`Pilot satırı ${job.data.tur === 'satir' ? job.data.satirId : ''} kapatılamadı: ${e instanceof Error ? e.message : String(e)}`));
    logger.error(`pilot-kurulum ${job.id} (satır) düştü: ${err.message}`);
  });
  // Onaylanıp kuyruğa giremeyen planlar ve kuyruktan düşmüş satırlar için
  // süpürme (CLAUDE.md "sync_jobs satırı bir niyet kaydı, kuyruk ise gerçek").
  const pilotSupurmeZamanlayici = setInterval(() => {
    void pilotSupurmesi({ tx: (fn) => fn(admin as never), planEkle: (id, tetik) => pilotKuyruk.planEkle(id, tetik) })
      .then((n) => n > 0 && logger.log(`pilot süpürmesi: ${n} plan yeniden kuyrukta`))
      .catch((e: unknown) => logger.error(`pilot süpürmesi düştü: ${e instanceof Error ? e.message : String(e)}`));
  }, 10 * 60_000);

  logger.log('Worker hazır — kuyruk: sync (4), reklam-yayin (2), strateji-kelime (1, 1 QPS), pilot-kurulum (2)');

  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`${signal} alındı, işler tamamlanıyor…`);
    // close(): çalışan işlerin bitmesini bekler, yenisini almaz. Zorla
    // kapatmak yarım kalmış senkronizasyon bırakır.
    await worker.close();
    await reklamWorker.close();
    await kelimeWorker.close();
    clearInterval(pilotSupurmeZamanlayici);
    await pilotWorker.close();
    await connection.quit().catch(() => connection.disconnect());
    await app.close();
    logger.log('Worker kapandı.');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void bootstrap();
