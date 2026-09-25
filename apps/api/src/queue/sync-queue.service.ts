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
/**
 * Bir işin "takılmış" sayılması için geçmesi gereken süre.
 *
 * 30 dakika: en uzun yapı taraması bile bunun altında bitiyor ve kota
 * geciktirmesi tipik olarak 5 dakika. Bu süreyi aşan bir `active`/`delayed`
 * iş, koşan bir iş değil kilitlenmiş bir kimliktir.
 */
const TAKILMIS_IS_MS = 30 * 60_000;

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
    /**
     * Toplu tazeleme partisi.
     *
     * İlerleme çubuğu bu kolona göre sayıyor; verilmezse iş tek başına
     * açılmış sayılıyor ve hiçbir partinin yüzdesine karışmıyor.
     */
    batchId?: string;
    /** Potansiyel müşteri kimliği (`lead_fetch`). */
    externalLeadId?: string;
    /** Formun Meta kimliği (`leads_reconcile`). */
    externalFormId?: string;
    entityLevel?: EntityLevel;
    /** YYYY-MM-DD. Date nesnesi DEĞİL — saat dilimi kayması için bkz. queues.ts */
    dateFrom?: string;
    dateTo?: string;
    interactive?: boolean;
    delayMs?: number;
  }): Promise<{ enqueued: boolean; syncJobId?: string; reason?: string }> {
    const jobId = buildJobId(params);

    /*
     * ═══ MÜKERRER ENGELİ KALICI BİR KİLİDE DÖNÜŞEBİLİYOR ═══
     *
     * İş kimliği tarih taşımayan türlerde SABİT (`structure` gibi). Kuyrukta
     * aynı kimlikle bir iş varsa buradan `enqueued: false` ile dönülüyor ve
     * DİKKAT: bu, `sync_jobs` satırı yazılmadan ÖNCE oluyor. Yani engellenen
     * çağrı hiçbir iz bırakmıyor.
     *
     * Canlıda ürettiği tablo şuydu: bir Meta hesabında yapı taraması kotaya
     * takılıp `delayed`e düşüyor, orada uzun süre bekliyor, ve o sırada
     * kullanıcının bastığı her "Şimdi güncelle" sessizce reddediliyor.
     * Panelde "Yapı: hiç" yazıyor, iş listesinde o hesaba ait TEK BİR yapı
     * satırı bile yok, ve durum kendiliğinden hiç düzelmiyor.
     *
     * ÜÇ DURUM, ÜÇ FARKLI KARAR:
     *
     *   · `waiting` — sırasını bekliyor, yakında koşacak. Dokunma.
     *   · `delayed` — geciktirilmiş. Kullanıcı EKRANDA BEKLİYORSA (interactive)
     *     ya da gecikme makul bir süreyi aştıysa bu bir kilit; işi kaldır ve
     *     yenisini koy.
     *   · `active` — işleniyor. Worker gerçekten çalışıyorsa dokunmamalı; ama
     *     worker öldüyse iş sonsuza kadar `active` kalıyor. İşleme başlama
     *     zamanı eskiyse takılmış say.
     *
     * İŞLERİ TEKRAR KOYMAK GÜVENLİ: yapı ve metrik yazımları upsert
     * (`ON CONFLICT`), aynı işin iki kez koşması mükerrer satır üretmiyor.
     */
    const existing = await this.queue.getJob(jobId);
    if (existing) {
      const state = await existing.getState();
      const yas = Date.now() - (existing.processedOn ?? existing.timestamp ?? Date.now());

      const takilmis =
        (state === 'delayed' && (params.interactive === true || yas > TAKILMIS_IS_MS)) ||
        (state === 'active' && yas > TAKILMIS_IS_MS);

      if (!takilmis && (state === 'waiting' || state === 'active' || state === 'delayed')) {
        return {
          enqueued: false,
          reason: `zaten kuyrukta (${state}, ${Math.round(yas / 60_000)} dk)`,
        };
      }

      if (takilmis) {
        this.logger.warn(
          `Takılmış iş kaldırılıyor: ${jobId} (${state}, ${Math.round(yas / 60_000)} dk) — ` +
            'yerine yenisi kuyruğa alınıyor.',
        );
      }
      // Tamamlanmış/başarısız/takılmış işin kimliği yeniden kullanılabilsin.
      await existing.remove().catch(() => undefined);
    }

    const record = await this.db.syncJob.create({
      data: {
        clientId: params.clientId,
        adAccountId: params.adAccountId ?? null,
        socialProfileId: params.socialProfileId ?? null,
        jobType: params.jobType,
        entityLevel: params.entityLevel ?? null,
        // TOPLU TAZELEME PARTİSİ. `null` = tek başına açılmış iş; ilerleme
        // çubuğu bu kolona göre sayıyor.
        batchId: params.batchId ?? null,
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
      externalLeadId: params.externalLeadId,
      externalFormId: params.externalFormId,
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

    const schedules: Array<{
      name: string;
      pattern: string;
      jobType: SyncJobType;
      /**
       * Saat dilimi. Varsayılan UTC ve süpürmelerin çoğu için DOĞRU olan bu:
       * onlar veri PENCERESİ hakkında ve hesabın kendi zaman dilimine göre
       * ayrıca hesaplanıyor.
       *
       * İSTİSNA İNSANIN OKUDUĞU İŞLER. "Sabah 8'de kontrol et ve mail at"
       * cümlesindeki 8, ajansın saati — UTC'de 8 demek İstanbul'da 11 demek
       * ve mail öğleye doğru gelirdi.
       */
      tz?: string;
    }> = [
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
      /*
       * L6 — ORGANİK GÖNDERİLER: 15 DAKİKADA BİR.
       *
       * Saatte birdi ve kullanıcının isteği "gönderi paylaşıldığı an bildirim
       * gelsin" oldu. GERÇEK TETİKLEYİCİ MÜMKÜN DEĞİL: Instagram'da "yeni
       * gönderi" webhook'u YOK (2026-08 araştırması, iki bağımsız
       * sınayıcıyla doğrulandı) ve Facebook Sayfa `feed` alanı da
       * kullanılamıyor — crosspost açık müşteride tetikleniyor, IG-only
       * paylaşanda hiç. Tespitin tek yolu yoklama.
       *
       * Dörde katlanan çağrı sayısı sosyal profil BAŞINA saatte dört istek
       * demek; kota reklam hesabı tarafında tutuluyor ve organik uçlar o
       * bütçeyi paylaşmıyor. Daha sık (5 dk) yapmak, kazanılan on dakika
       * için üç kat daha fazla çağrı olurdu.
       */
      { name: 'sweep:organic', pattern: '*/15 * * * *', jobType: 'organic_posts' },
      // Modül 5 — kural değerlendirmesi: saatte bir.
      //
      // Veri günlük granülerlikte, yani saatte birden sık değerlendirmenin
      // dayanağı yok. Ama günde bir de yetmiyor: L3 senkronizasyonu hesabın
      // KENDİ zaman dilimine göre farklı saatlerde tamamlanıyor ve kural o
      // veri düştüğü anda çalışabilmeli. Saatlik tarama, bekleme süresiyle
      // birlikte hem duyarlı hem sakin bir davranış veriyor.
      { name: 'sweep:rules', pattern: '13 * * * *', jobType: 'rules_evaluate' },
      // Anahtar kelime: günde bir, gece. Rapor aylık okunuyor ve gün içinde
      // tazelemenin karşılığı yok; sabah 4'te dünün verisi hazır oluyor.
      { name: 'sweep:keywords', pattern: '47 4 * * *', jobType: 'keyword_insights' },
      /*
       * Anahtar kelimelerden 20 dakika sonra: ikisi de aynı kota katmanında
       * ve aynı anda koşmaları büyük hesaplarda birbirinin önünü kesiyor.
       */
      { name: 'sweep:searchterms', pattern: '7 5 * * *', jobType: 'search_terms' },
      /*
       * Advetics 1.0 — KIRILIMLAR: gecede bir, arama terimlerinden 25 dakika
       * sonra. Üçü de aynı kota katmanında (`insights_breakdown`) ve aynı
       * anda koşmaları büyük hesaplarda birbirinin önünü kesiyor.
       */
      { name: 'sweep:breakdowns', pattern: '32 5 * * *', jobType: 'insights_breakdowns' },
      // Modül 7 — boost: GÜNDE İKİ KEZ, saatte bir değil.
      //
      // Organik metrikler yavaş değişiyor ve boost kararı bir gönderi için
      // yalnızca BİR KEZ veriliyor. Saatlik tarama aynı sonucu 24 kez
      // hesaplardı; günde iki kez hem sabah hem akşam paylaşımlarını
      // yakalıyor.
      { name: 'sweep:boosts', pattern: '29 8,20 * * *', jobType: 'boosts_evaluate' },
      // Advetics 1.0 — YouTube bildirim aboneliği yenileme: SAATTE BİR.
      //
      // Kiralama ~10 gün ve yenileme %80'inde (yaklaşık 8. gün) yapılıyor,
      // yani günde bir tarama da yeterdi. Saatlik olmasının sebebi ayrı:
      // HİÇ DOĞRULANMAMIŞ abonelikler de bu turda yeniden deneniyor ve orada
      // gecikme doğrudan kullanıcıya yansıyor — kanalı ekleyip bildirimin
      // gelmesini bekleyen biri bir gün beklememeli.
      { name: 'sweep:websub', pattern: '53 * * * *', jobType: 'websub_renew' },
      // Advetics 1.0 — süresi dolmuş boost'ları bitirme: SAATTE BİR.
      //
      // Bu tarama koşmazsa bir gönderi bir kez boostlandıktan sonra BİR DAHA
      // boostlanamıyor: `boosts_active_post_uniq` 'active' durumunu kapsıyor.
      // Gecikme doğrudan kullanıcıya yansıyor — kampanyası dün biten bir
      // gönderiyi tekrar öne çıkarmak isteyen biri ertesi günü beklememeli.
      // Saatlik olması, en kötü ihtimalle bir saatlik gecikme demek.
      { name: 'sweep:boost-complete', pattern: '37 * * * *', jobType: 'boost_complete' },
      /*
       * Advetics 1.0 — HESAP DURUMU: GÜNDE İKİ KEZ, AJANSIN SAATİYLE.
       *
       * Reklam hesabının platformdaki durumu (`account_status`,
       * `customer.status`) başka hiçbir zamanlanmış işte tazelenmiyordu:
       * `listAdAccounts`ı çağıran tek yol kullanıcının elle bastığı
       * "Hesapları yenile" idi. Bir hesabın ödemesi alınmasa panel bunu
       * haftalarca öğrenmiyordu.
       *
       * SAAT DİLİMİ AÇIKÇA `Europe/Istanbul`. Diğer bütün süpürmeler UTC ve
       * bu doğru — onlar veri penceresi hakkında. Bu iş ise İNSANIN OKUDUĞU
       * bir mail üretiyor: 08:00 UTC, İstanbul'da 11:00 demek ve "sabah
       * kontrol" isteği karşılanmamış olurdu.
       *
       * 08:05 ve 13:05: dakika sıfır değil çünkü tam saatlerde başka
       * süpürmeler ve platform tarafında yoğunluk var; beş dakika kaydırmak
       * kota çakışmasını ucuza azaltıyor.
       */
      {
        name: 'sweep:account-status',
        pattern: '5 8,13 * * *',
        jobType: 'account_status',
        tz: 'Europe/Istanbul',
      },
      /*
       * Advetics 1.0 — ÖDEME NABZI: 15 DAKİKADA BİR.
       *
       * Ödeme sorunu görüldüğü AN mail gidiyor (`OdemeTetigiService`) ama
       * Meta ve Google bunu bize bildirmiyor: Meta'nın reklam hesabı
       * webhook'larında hesap durumu alanı yok, Google Ads'in hiç webhook'u
       * yok. Tetiğin bir şey görebilmesi için durumun SORULMASI gerekiyor ve
       * bu satır ne sıklıkla sorulacağını belirliyor. Günde iki kezlik tam
       * tazeleme en kötü ihtimalle ~19 saatlik bir gecikme demekti; bu
       * satırla en fazla 15 dakika.
       *
       * UCUZ OLDUĞU İÇİN SIK: yalnızca workspace'e atanmış hesaplar, yalnızca
       * durum alanları; Meta'da hesap başına bir okuma (kota o hesabın
       * kendi kovasından), Google'da yönetici başına bir sorgu.
       *
       * DAKİKALAR 11/26/41/56: diğer süpürmelerin hiçbiriyle (0/15/30/45,
       * 5, 7, 13, 17, 19, 23, 29, 32, 37, 47, 53) çakışmıyor.
       */
      { name: 'sweep:payment-check', pattern: '11,26,41,56 * * * *', jobType: 'payment_check' },
      /*
       * Advetics 1.0 — ZAMANLANMIŞ RAPOR: SAATTE BİR, AJANSIN SAATİYLE.
       *
       * Planlama "her Pazartesi 09:00" gibi bir SAAT taşıyor; tarama saatte
       * bir koşup zamanı gelenleri alıyor. Günde bir koşsaydı kullanıcının
       * seçtiği saatin hiçbir anlamı kalmazdı.
       *
       * SAAT DİLİMİ `Europe/Istanbul` ve bu ikinci istisna — birincisi
       * `sweep:account-status`. Gerekçe aynı: bu iş İNSANIN OKUDUĞU bir mail
       * üretiyor. UTC saymak "sabah 9" isteğini öğlene kaydırırdı.
       *
       * Dakika 19: diğer süpürmelerle (7, 13, 17, 37, 41, 53) çakışmıyor.
       */
      {
        name: 'sweep:report-schedules',
        pattern: '19 * * * *',
        jobType: 'report_schedule',
        tz: 'Europe/Istanbul',
      },
    ];

    for (const s of schedules) {
      // Dakika değerleri kasıtlı olarak farklı (17, 7, 23, 41): hepsi aynı
      // dakikada tetiklenirse kota aynı anda tüketilir ve platform bloklar.
      await this.queue.upsertJobScheduler(
        s.name,
        { pattern: s.pattern, tz: s.tz ?? 'UTC' },
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

  /**
   * ═══ KUYRUĞA SOR: BU İŞ GERÇEKTEN KOŞACAK MI? ═══
   *
   * `sync_jobs` satırı bir NİYET kaydı, bir garanti değil. Satır `queued`
   * yazıyorken BullMQ işi Redis'te olmayabilir: worker deploy sırasında
   * öldürülmüş ve iş `maxStalledCount` sınırını aşmış olabilir, Redis
   * temizlenmiş olabilir, ya da `removeOnComplete` işi silmişken tablo
   * güncellemesi hiç yapılmamış olabilir.
   *
   * O satır sonsuza kadar açık kalıyor, hiçbir worker onu almıyor ve toplu
   * tazeleme çubuğu %99'da duruyor — canlıda bildirilen belirti tam olarak
   * buydu (1259/1266, saatlerce değişmedi). Tablodan okunan durum bu soruyu
   * CEVAPLAYAMAZ; tek doğru kaynak kuyruğun kendisi.
   *
   * `prioritized` DE BEKLEYEN SAYILIYOR. BullMQ öncelikli eklenen işleri
   * `waiting` listesine değil ayrı bir sıralı listeye koyuyor ve `getState()`
   * onlara `prioritized` diyor; bu ürün her işi öncelikle ekliyor, yani
   * yalnızca `waiting` arayan bir kontrol NORMAL bekleyen işlerin TAMAMINI
   * "kayıp" sayardı.
   */
  async kuyruktaMi(jobIds: string[]): Promise<Map<string, boolean>> {
    const out = new Map<string, boolean>();
    if (!this.queueOrNull) return out;
    for (const id of jobIds) {
      const job = await this.queue.getJob(id).catch(() => null);
      if (!job) {
        out.set(id, false);
        continue;
      }
      const state = await job.getState().catch(() => 'unknown');
      out.set(
        id,
        state === 'waiting' ||
          state === 'waiting-children' ||
          state === 'prioritized' ||
          state === 'active' ||
          state === 'delayed',
      );
    }
    return out;
  }

  /**
   * VAR OLAN BİR `sync_jobs` SATIRINI YENİDEN KUYRUĞA KOYAR.
   *
   * `enqueue`den farkı: YENİ SATIR AÇMIYOR. Toplu tazelemede yüzdenin
   * paydası partinin açılışında sayılan iş sayısı; kurtarma yeni satır
   * açsaydı eski satır sonsuza kadar açık kalır ve çubuk yine bitmezdi.
   * Aynı `syncJobId` ile aynı işi yeniden koşturmak güvenli — yapı ve metrik
   * yazımlarının hepsi upsert.
   */
  async yenidenKuyrukla(payload: SyncJobPayload, jobId: string, priority: number): Promise<void> {
    const mevcut = await this.queue.getJob(jobId).catch(() => null);
    // Tamamlanmış/başarısız bir kimlik yeniden kullanılamıyor: BullMQ aynı
    // kimlikle ikinci bir iş kabul etmiyor ve SESSİZCE hiçbir şey yapmıyor.
    if (mevcut) await mevcut.remove().catch(() => undefined);
    await this.queue.add(payload.jobType, payload, { jobId, priority });
  }

  /** Testler ve bakım için — kuyruk nesnesine doğrudan erişim. */
  get raw(): Queue<SyncJobPayload> {
    return this.queue;
  }
}
