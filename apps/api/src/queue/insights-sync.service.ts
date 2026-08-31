import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { UnrecoverableError } from 'bullmq';
import { assertAssigned } from '../common/utils/ad-account-assignment';
import { PrismaAdminService } from '../prisma/prisma-admin.service';
import {
  PlatformApiError,
  type InsightsLevel,
  type PlatformInsights,
} from '../modules/connections/provider.types';
import { ProviderRegistry } from '../modules/connections/provider.registry';
import { TokenVaultService } from '../modules/connections/token-vault.service';
import { shiftDate } from '../modules/budgets/budget-pacing';
import { QuotaGuardService } from './quota-guard.service';

/**
 * L2 / L3 / L4 — günlük metrikleri platformdan çekip `insights_daily`'ye yazar.
 *
 * Bu servisin çözdüğü dört problem:
 *
 *   1. DIŞ KİMLİK → İÇ UUID. Platform metrikleri kendi kimlikleriyle
 *      döndürüyor; `insights_daily.entity_id` ise bizim UUID'miz. Eşleme
 *      yapılamayan satır YAZILAMAZ — yapı senkronizasyonu önce çalışmak
 *      zorunda. Sessizce atlamak "metrik yok" gibi görünürdü.
 *
 *   2. IDEMPOTENT UPSERT. Aynı gün birden çok kez çekiliyor (L2 gün içi 30
 *      dakikada bir, L3 gece, L4 geri düzeltme). Doğal birincil anahtar
 *      (date, entity_level, entity_id, breakdown_key) üzerinden `ON CONFLICT`
 *      ile yazıyoruz: mükerrer satır oluşmuyor, son değer kazanıyor.
 *
 *   3. PARTITION VARLIĞI. `insights_daily` aylık RANGE partition'lı. Yazılacak
 *      tarihin partition'ı yoksa Postgres hata veriyor. Ay dönümünde veya
 *      geriye dönük backfill'de bu gerçek bir risk.
 *
 *   4. GERİ DÜZELTME. Meta atıf penceresi nedeniyle dünün verisini günler
 *      sonra değiştiriyor. Aynı satırı tekrar yazmak bu yüzden bir hata değil,
 *      TASARIM — `fetched_at` en son ne zaman doğrulandığını söylüyor.
 */

export interface InsightsSyncResult {
  rows: number;
  apiCalls: number;
  skipped: number;
  note?: string;
}

/** Hangi iş türü hangi seviyeleri çekiyor. */
/**
 * DERİN SEVİYELERDE TARİH PENCERESİ PARÇALANIYOR.
 *
 * Meta insights çağrısı `time_increment=1` ile gidiyor, yani yanıt
 * GÜN × VARLIK satırı taşıyor. 90 gün × reklam seviyesi tek istekte,
 * büyük bir hesapta *"Please reduce the amount of data you're asking for"*
 * ile düşüyor — sayfa boyutunu yarılayan uyarlama o hatayı karşılıyor ama
 * istek gövdesinin kendisi zaten çok büyük olduğunda yarılamak da yetmiyor.
 *
 * 15 gün, kampanya seviyesinde bugün sorunsuz çalışan 90 günün altıda biri.
 * Sayı büyütülürse aynı hata geri gelir; küçültülürse çağrı sayısı ve
 * dolayısıyla kota tüketimi artar.
 *
 * `account`/`campaign` seviyeleri PARÇALANMIYOR: bugün tek istekte çalışıyor
 * ve gereksiz yere çağrı sayısını üçe katlamanın anlamı yok.
 */
const DERIN_SEVIYE_PENCERESI = 15;
const DERIN_SEVIYELER: ReadonlySet<InsightsLevel> = new Set(['ad_group', 'ad']);

/**
 * Bir seviye için istek pencereleri.
 *
 * SINIF DIŞINDA VE SAF: parçalama matematiği bu değişikliğin taşıyıcı
 * parçası — 90 günü kaç isteğe böldüğü, aralarında boşluk ya da örtüşme
 * olup olmadığı. Özel bir metot olarak kalsaydı ancak kaynak taramasıyla
 * sınanabilirdi ve tarama "bölme var" der ama "doğru bölüyor" DEMEZ.
 *
 * Sığ seviyeler (hesap, kampanya) tek pencere: bugün 90 günü sorunsuz
 * çekiyorlar ve bölmek çağrı sayısını, dolayısıyla kota tüketimini gereksiz
 * yere katlıyor.
 *
 * Tarihler `YYYY-MM-DD` STRING olarak taşınıyor ve karşılaştırma da öyle
 * yapılıyor: `Date`e çevirmek bu kod tabanında saat dilimi kayması üretiyor
 * ve bir günü sessizce atlatıyor.
 */
export function istekPencereleri(
  level: InsightsLevel,
  from: string,
  to: string,
): Array<{ from: string; to: string }> {
  if (!DERIN_SEVIYELER.has(level)) return [{ from, to }];

  const out: Array<{ from: string; to: string }> = [];
  let bas = from;
  while (bas <= to) {
    const son = shiftDate(bas, DERIN_SEVIYE_PENCERESI - 1);
    out.push({ from: bas, to: son > to ? to : son });
    bas = shiftDate(son, 1);
  }
  return out;
}

const LEVELS_FOR_JOB: Record<string, InsightsLevel[]> = {
  // L2 gün içi: YALNIZCA hesap ve kampanya.
  //
  // Ad seviyesinde gün içi veri çekmek kota tüketimini 20-50× artırıyor ve
  // gün içinde ad bazlı karar vermek istatistiksel olarak anlamsız — örneklem
  // çok küçük. Mimari dokümandaki L2 tanımı bu.
  insights_realtime: ['account', 'campaign'],
  // L3 günlük: tüm seviyeler. Gün kapandı, veri oturdu.
  insights_daily: ['account', 'campaign', 'ad_group', 'ad'],
  // L4 geri düzeltme: atıf penceresi kampanya ve altında değişiyor.
  insights_backfill: ['campaign', 'ad_group', 'ad'],
  /*
   * L7 ilk backfill: 90 GÜN, TÜM SEVİYELER — reklam dahil.
   *
   * Uzun süre yalnızca `campaign` çekiliyordu ve gerekçesi kotaydı. Bedeli
   * üretimde görüldü: "Öne Çıkan Reklamlar" bölümü yalnızca o dönemde
   * gecelik senkronize etmiş platformun reklamlarını gösteriyordu, çünkü
   * reklam kırılımı SADECE gecelik iş ve 7 günlük geri düzeltmeden
   * geliyordu. Geçmiş bir ayın reklam verisi hiçbir zaman oluşmuyor ve
   * kendiliğinden de oluşmuyordu.
   *
   * Kota maliyeti gerçek ve kabul edilmiş bir karar. Riski taşınabilir
   * kılan şey `DERIN_SEVIYE_PENCERESI`: derin seviyeler 90 günü tek istekte
   * değil, parça parça istiyor.
   */
  initial_backfill: ['campaign', 'ad_group', 'ad'],
};

@Injectable()
export class InsightsSyncService {
  private readonly logger = new Logger(InsightsSyncService.name);

  constructor(
    private readonly db: PrismaAdminService,
    private readonly providers: ProviderRegistry,
    private readonly vault: TokenVaultService,
    private readonly quota: QuotaGuardService,
  ) {}

  async syncAccount(params: {
    adAccountId: string;
    jobType: string;
    /** YYYY-MM-DD. */
    dateFrom: string;
    dateTo: string;
  }): Promise<InsightsSyncResult> {
    const levels = LEVELS_FOR_JOB[params.jobType];
    if (!levels) {
      throw new UnrecoverableError(`${params.jobType} için metrik seviyesi tanımlı değil`);
    }

    const found = await this.db.adAccount.findUniqueOrThrow({
      where: { id: params.adAccountId },
      select: {
        id: true,
        clientId: true,
        connectionId: true,
        platform: true,
        externalId: true,
        managerExternalId: true,
        timezone: true,
        // Metrik yazımının ÖN ŞARTI. Aşağıda "hiçbir satır yazılamadı"
        // durumunun tekrar denenebilir olup olmadığına bu alan karar veriyor.
        lastStructureSyncAt: true,
      },
    });

    // ATANMAMIŞ HESAP BURADA DURUR. `insights_daily.client_id` NULL yazılırsa
    // satırlar hiçbir raporda görünmez ama kota harcanmış olur — en pahalı
    // sessiz hata türü.
    const account = assertAssigned(found);

    /*
     * ═══ YAPI KOŞMADIYSA PLATFORMA HİÇ GİTMİYORUZ ═══
     *
     * Bu kontrol ÖNCE aşağıdaydı — satırlar çekildikten SONRA. Canlıda ne
     * ürettiği görüldü ve bir KİLİTLENMEYDİ:
     *
     *   1. Yapı taraması hiç koşmamış bir Meta hesabında metrik işi 3.151
     *      satır çekiyor (kampanya + reklam seti + reklam, 90 gün, onlarca
     *      sayfa) ve hiçbirini yazamıyor.
     *   2. İş tekrar denenebilir sayılıyor ve BEŞ KEZ daha aynı şeyi yapıyor.
     *   3. Bu turlar hesabın kota yüzdesini %90'ın üstüne çıkarıyor.
     *   4. Kota bekçisi bundan sonra HER işi reddediyor — YAPI TARAMASI DA
     *      DAHİL (`structure` katmanının üst sınırı da %90).
     *   5. Yapı hiç koşamadığı için metrikler hiç eşlenemiyor. Başa dön.
     *
     * Yani metrik işi, bağlı olduğu yapı işinin kotasını yiyordu. Panelde
     * görünen tablo: "Yapı: hiç", metrik işi "5. deneme · failed", son iş
     * "throttled" — ve hiçbir zaman ilerlemiyor.
     *
     * Kontrol artık ÇAĞRIDAN ÖNCE ve maliyeti SIFIR API çağrısı. İş yine
     * tekrar denenebilir düşüyor ama kota harcamadan düşüyor, böylece yapı
     * taraması nefes alacak yer buluyor.
     */
    if (account.lastStructureSyncAt === null) {
      throw new PlatformApiError(
        account.platform,
        'transient',
        'Bu hesapta yapı taraması hiç koşmadı — kampanya satırları olmadan metrik ' +
          'yazılamıyor. Metrik çekimi kotayı boşa harcamamak için hiç başlatılmadı; ' +
          'yapı taraması tamamlanınca tekrar denenecek.',
      );
    }

    const provider = this.providers.get(account.platform);
    const accessToken = await this.vault.getAccessToken(account.connectionId, provider);

    // Partition'ları ÖNCE hazırla. Yazma anında eksik partition hatası, işi
    // retry kuyruğuna atıp kotayı boşa harcatır.
    await this.ensurePartitions(params.dateFrom, params.dateTo);

    let totalRows = 0;
    let totalCalls = 0;
    let totalSkipped = 0;
    let incomplete = false;

    for (const level of levels) {
      for (const pencere of istekPencereleri(level, params.dateFrom, params.dateTo)) {
        let result: PlatformInsights;
        try {
          result = await provider.fetchInsights(
            {
              accessToken,
              accountExternalId: account.externalId,
              loginCustomerId: account.managerExternalId ?? undefined,
              onRateLimit: (snapshot) =>
                this.quota.record({
                  platform: account.platform,
                  clientId: account.clientId,
                  adAccountId: account.id,
                  endpoint: `insights:${level}`,
                  snapshot,
                }),
            },
            {
              level,
              dateFrom: pencere.from,
              dateTo: pencere.to,
              timezone: account.timezone,
            },
          );
        } catch (err) {
          if (err instanceof PlatformApiError && err.kind === 'rate_limited') {
            await this.quota.tripBreaker(
              account.platform,
              account.id,
              err.detail?.retryAfterSeconds ?? 900,
            );
          }
          throw err;
        }

        totalCalls += result.apiCalls;
        if (!result.complete) incomplete = true;

        /*
         * HER PARÇA HEMEN YAZILIYOR, sonda toplu değil. İş ortasında
         * düşerse (kota, ağ) o ana kadarki günler veritabanında kalıyor ve
         * tekrar denemede upsert onları aynen üzerine yazıyor — kayıp yok,
         * mükerrer yok. Sonda yazmak, doksan günlük bir çekimin son
         * adımdaki bir hatayla tamamen boşa gitmesi demekti.
         */
        const written = await this.writeRows(account, level, result);
        totalRows += written.rows;
        totalSkipped += written.skipped;
      }
    }

    // Kısmi sonuçta işi başarılı SAYMIYORUZ: eksik bir gün "senkronize edildi"
    // görünürse kimse geri dönüp tamamlamıyor ve rapor sessizce eksik kalıyor.
    if (incomplete) {
      throw new PlatformApiError(
        account.platform,
        'transient',
        `Metrikler kısmi geldi (${params.dateFrom}..${params.dateTo}) — ${totalRows} satır yazıldı, iş tekrar denenecek`,
      );
    }

    const note = [
      `${params.dateFrom}${params.dateFrom === params.dateTo ? '' : `..${params.dateTo}`}`,
      levels.join('/'),
      `${totalRows} satır`,
      totalSkipped > 0 ? `${totalSkipped} atlandı` : undefined,
    ]
      .filter(Boolean)
      .join(' · ');

    /*
     * ═══ HİÇBİR SATIR YAZILAMADI: BAŞARI DEĞİL ═══
     *
     * Bu dal "atadım ama veri gelmiyor" belirtisinin kaynağı. Metrik satırı,
     * ait olduğu kampanya/reklam satırı veritabanında yoksa YAZILAMIYOR ve
     * atlanıyor. İş bugüne kadar `succeeded` + `rows=0` kapanıyordu, BİR DAHA
     * denenmiyordu ve kullanıcı boş bir grafik görüyordu.
     *
     * İKİ AYRI DURUM VE YALNIZCA BİRİ TEKRAR DENENEBİLİR:
     *
     *   · YAPI TARAMASI HİÇ KOŞMADI → gerçekten geçici. `structure` ile
     *     `initial_backfill` art arda, gecikmesiz kuyruğa giriyor; öncelik
     *     farkı SIRA veriyor, BARİYER vermiyor ve worker dördü paralel
     *     çalıştırıyor. Yapı hâlâ koşarken metrik işi başlayabiliyor.
     *     Tekrar denemek doğru: backoff yapının bitmesine zaman tanıyor.
     *
     *   · YAPI KOŞTU AMA VARLIK YİNE DE YOK → ARŞİVLENMİŞ kampanya. Meta
     *     `effective_status` filtresi olmadan arşivlenmiş varlıkları
     *     döndürmüyor (meta.provider.ts), yani o kampanyalar bizde hiç yok ve
     *     HİÇBİR ZAMAN olmayacak. Tekrar denemek beş kez kota harcayıp aynı
     *     yere varmak olurdu. Bu yüzden başarı sayılıyor — ama notu artık
     *     `sync_jobs`'a yazılıyor ve panelde "başarılı · 0 satır" olarak
     *     GÖRÜNÜYOR.
     */
    /*
     * DAMGA EN SONDA — BAŞARISIZ BİR TUR "SENKRONİZE EDİLDİ" DEMEZ.
     *
     * `lastInsightsSyncAt` bir süre çekim biter bitmez, YAZMADAN ÖNCE
     * atılıyordu. Sonucu canlıda görüldü: hiçbir satır yazamayan ve tekrar
     * denenmek üzere düşen bir iş bile hesaba taze bir damga bırakıyordu.
     * Teşhis ekranında "Yapı: hiç · Metrik: 10:46" yan yana duruyor ve
     * "metrik geldi ama yapı yok" gibi okunuyordu — oysa metrik de gelmemişti.
     *
     * Damga artık YALNIZCA tur gerçekten tamamlandığında atılıyor. Başarısız
     * turda eski değer kalıyor ve bayatlık uyarısı doğru çalışıyor.
     */
    await this.db.adAccount.update({
      where: { id: account.id },
      data: { lastInsightsSyncAt: new Date() },
    });

    return { rows: totalRows, apiCalls: totalCalls, skipped: totalSkipped, note };
  }

  // ---------------------------------------------------------------------------
  // Yazma
  // ---------------------------------------------------------------------------

  private async writeRows(
    account: { id: string; clientId: string; platform: 'meta' | 'google'; externalId: string },
    level: InsightsLevel,
    result: PlatformInsights,
  ): Promise<{ rows: number; skipped: number }> {
    const rows = result.rows.filter((r) => r.level === level);
    if (rows.length === 0) return { rows: 0, skipped: 0 };

    const idMap = await this.resolveEntityIds(account, level, rows.map((r) => r.entityExternalId));

    const usable = rows.filter((r) => idMap.has(r.entityExternalId));
    const skipped = rows.length - usable.length;
    if (skipped > 0) {
      // Eşlenemeyen satır, yapı senkronizasyonunun eksik olduğunu gösterir.
      // Metriği atmak veri kaybı — bu yüzden görünür olmak zorunda.
      this.logger.warn(
        `${account.platform} hesap ${account.id}: ${skipped}/${rows.length} ${level} metriği ` +
          'eşlenemedi (varlık veritabanında yok). Yapı senkronizasyonu çalıştırılmalı.',
      );
    }
    if (usable.length === 0) return { rows: 0, skipped };

    // Toplu upsert — satır başına sorgu atmak 30 gün × 4 seviye × N varlıkta
    // binlerce round-trip demek.
    const values = usable.map(
      (r) => Prisma.sql`(
        ${account.clientId}::uuid, ${account.id}::uuid, ${account.platform}::"Platform",
        ${level}::"EntityLevel", ${idMap.get(r.entityExternalId)!}::uuid,
        ${r.entityExternalId.slice(0, 128)},
        ${r.date}::date,
        '',
        ${r.impressions}, ${r.clicks}, ${r.spendMicros},
        ${r.conversions}, ${r.conversionValueMicros},
        ${r.videoViews}, ${r.engagements}, ${r.reach},
        ${r.frequency ?? null},
        ${JSON.stringify(r.raw)}::jsonb,
        ${r.currency},
        now()
      )`,
    );

    // POSTGRES'İN BAĞLI PARAMETRE SINIRI 32.767 — satır başına 18 parametre
    // bağlanıyor (aşağıdaki VALUES listesi). Büyük bir hesapta `ad`
    // seviyesinde tek pencerede binlerce satır gelebiliyor (örn. 1900 reklam
    // × 7 gün ≈ 13.300 satır × 18 ≈ 240.000 parametre) ve chunk'sız tek INSERT
    // bu sınırı aşıp "too many bind variables" ile DETERMİNİSTİK olarak
    // düşüyordu — satır sayısı değişmediği için her yeniden deneme aynı
    // hatayla düşüyor, retry işe yaramıyordu. 1000 satırlık parçalar
    // (1000 × 18 = 18.000) sınırın belirgin altında kalıyor.
    const CHUNK_SIZE = 1000;
    let affected = 0;
    try {
      for (let i = 0; i < values.length; i += CHUNK_SIZE) {
        const chunk = values.slice(i, i + CHUNK_SIZE);
        affected += await this.db.$executeRaw(
          Prisma.sql`
          INSERT INTO insights_daily (
            client_id, ad_account_id, platform, entity_level, entity_id,
            entity_external_id, date, breakdown_key,
            impressions, clicks, spend_micros,
            conversions, conversion_value_micros,
            video_views, engagements, reach, frequency,
            raw_metrics, currency, fetched_at
          ) VALUES ${Prisma.join(chunk)}
          -- Doğal birincil anahtar. breakdown_key boş string ('') çünkü NULL
          -- birincil anahtarda hiçbir zaman eşleşmiyor ve her senkronizasyonda
          -- satır MÜKERRER olurdu.
          ON CONFLICT (date, entity_level, entity_id, breakdown_key) DO UPDATE SET
            -- MUSTERI DE GUNCELLENIYOR. Hesap baska bir musteriye atandiginda
            -- eski satirlarin client_id'si degismiyordu; upsert onu atladigi
            -- icin "yeniden senkronize et" tavsiyesi de ise yaramiyordu.
            -- Kaynak HER ZAMAN hesabin o anki musterisi.
            client_id = EXCLUDED.client_id,
            impressions = EXCLUDED.impressions,
            clicks = EXCLUDED.clicks,
            spend_micros = EXCLUDED.spend_micros,
            conversions = EXCLUDED.conversions,
            conversion_value_micros = EXCLUDED.conversion_value_micros,
            video_views = EXCLUDED.video_views,
            engagements = EXCLUDED.engagements,
            reach = EXCLUDED.reach,
            frequency = EXCLUDED.frequency,
            raw_metrics = EXCLUDED.raw_metrics,
            currency = EXCLUDED.currency,
            -- Atıf penceresi yüzünden aynı gün günler sonra değişiyor; bu satırın
            -- ne zaman son kez doğrulandığını bilmek raporda "bayat veri"
            -- uyarısının dayanağı.
            fetched_at = now()
        `,
        );
      }
    } catch (err) {
      // PARTITION HATASINI AÇIKLA.
      //
      // Postgres'in mesajı ("no partition of relation ... found for row")
      // sebebi hiç anlatmıyor ve ilk bakışta kod hatası gibi görünüyor.
      // `ensurePartitions` DDL yetkisi yoksa sessizce geçiyor (worker rolünün
      // yetkisi olmayabilir), o yüzden gerçek arıza ancak burada ortaya
      // çıkıyor — ne yapılacağını söylemek zorundayız.
      const message = err instanceof Error ? err.message : String(err);
      if (/no partition of relation/i.test(message)) {
        throw new Error(
          `insights_daily partition'ı eksik (${rows[0]?.date ?? '?'}). ` +
            'Partition kurulumunu uygula: pnpm --filter @advetics/api db:rls ' +
            '— ya da veritabanında: SELECT app.ensure_insights_partitions();',
        );
      }
      throw err;
    }

    return { rows: affected, skipped };
  }

  /**
   * Dış kimlikleri iç UUID'lere çevirir.
   *
   * Hesap seviyesi özel: platform hesabın kendi kimliğini döndürüyor, karşılığı
   * `ad_accounts.id`. Diğer seviyeler kendi tablolarından okunuyor.
   *
   * Soft delete edilmiş varlıklar da eşleniyor: platformda silinen bir
   * kampanyanın geçmiş metrikleri raporda kalmalı.
   */
  private async resolveEntityIds(
    account: { id: string; platform: 'meta' | 'google'; externalId: string },
    level: InsightsLevel,
    externalIds: string[],
  ): Promise<Map<string, string>> {
    const unique = [...new Set(externalIds)];

    if (level === 'account') {
      // Meta `act_` önekli döndürüyor, keşifte de öyle kaydediyoruz; yine de
      // her iki biçimi eşliyoruz.
      const map = new Map<string, string>();
      for (const id of unique) {
        const bare = id.replace(/^act_/, '');
        if (id === account.externalId || bare === account.externalId.replace(/^act_/, '')) {
          map.set(id, account.id);
        }
      }
      return map;
    }

    const where = { platform: account.platform, externalId: { in: unique } };
    const select = { id: true, externalId: true };

    const found =
      level === 'campaign'
        ? await this.db.campaign.findMany({ where, select })
        : level === 'ad_group'
          ? await this.db.adGroup.findMany({ where, select })
          : await this.db.ad.findMany({ where, select });

    return new Map(found.map((e) => [e.externalId, e.id]));
  }

  /**
   * Yazılacak tarih aralığının partition'larını garanti eder.
   *
   * `app.ensure_insights_partition` idempotent ve ucuz. Ay dönümünde ya da
   * geriye dönük bir backfill'de eksik partition, tüm işi düşürür — ve hata
   * mesajı ("no partition of relation found for row") sebebi hiç anlatmaz.
   */

  private async ensurePartitions(dateFrom: string, dateTo: string): Promise<void> {
    // Ay başlarını dolaşıyoruz: aralık kaç ay sürerse sürsün her ay için bir
    // çağrı yeterli.
    const months = new Set<string>();
    const cursor = new Date(`${dateFrom}T00:00:00Z`);
    const end = new Date(`${dateTo}T00:00:00Z`);
    while (cursor <= end) {
      months.add(`${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}-01`);
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    // Bitiş ayı döngüde atlanmış olabilir (ayın son günü + ay ekleme).
    months.add(`${end.getUTCFullYear()}-${String(end.getUTCMonth() + 1).padStart(2, '0')}-01`);

    for (const month of months) {
      try {
        await this.db.$queryRaw`SELECT app.ensure_insights_partition(${month}::date)`;
      } catch (err) {
        // DDL yetkisi yoksa fonksiyon sessizce atlıyor; DEFAULT partition
        // yazmayı yine de kurtarıyor. Görünür olsun ama işi düşürmesin.
        this.logger.warn(
          `${month} partition kontrolü yapılamadı: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }
}
