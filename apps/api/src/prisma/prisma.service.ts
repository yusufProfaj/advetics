import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import type { TenantContext } from '@advetics/shared';
import { CONFIG, type AppConfig } from '../config/configuration';

/**
 * Transaction içinde kullanılacak, RLS bağlamı kurulmuş Prisma istemcisi.
 *
 * `$transaction`, `$connect` gibi bağlantı düzeyi metodları içermez — bu
 * kasıtlıdır: transaction içinde yeni bir transaction açmak veya bağlantıyı
 * kapatmak, kurulan RLS bağlamını bozar.
 */
export type TenantClient = Prisma.TransactionClient;

/**
 * RLS UYGULANAN Prisma istemcisi.
 *
 * `advetics_app` rolü ile bağlanır. Bu rol tablo sahibi değildir ve BYPASSRLS'e
 * sahip değildir — dolayısıyla her sorgusu politikalardan geçer.
 *
 * TÜM tenant verisi `withTenant()` üzerinden okunmalı/yazılmalıdır. Bu metodun
 * dışında bu istemciyi doğrudan kullanmak, RLS bağlamı kurulmadığı için
 * BOŞ SONUÇ döndürür (hata değil, sessiz boşluk). Bu davranış kasıtlıdır:
 * güvenli varsayılan, "her şeyi göster" değil "hiçbir şey gösterme"dir.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(@Inject(CONFIG) config: AppConfig) {
    super({
      datasourceUrl: config.database.url,
      log: config.isProduction ? ['error'] : ['error', 'warn'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('PostgreSQL bağlantısı kuruldu (RLS uygulanan rol: advetics_app)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Verilen tenant bağlamıyla bir transaction açar ve RLS oturum değişkenlerini
   * `SET LOCAL` semantiğiyle kurar.
   *
   * Neden transaction: `set_config(..., is_local => true)` yalnızca transaction
   * ömrü boyunca geçerlidir. Bu, connection pool'da bir sonraki isteğe bağlam
   * sızmasını imkansız kılar. Bedeli istek başına bir transaction'dır; RLS'in
   * havuzlanmış bağlantı ile birlikte kullanılmasının kabul edilmiş maliyeti budur.
   *
   * @example
   * const clients = await prisma.withTenant(ctx, (tx) => tx.client.findMany());
   */
  async withTenant<T>(ctx: TenantContext, fn: (tx: TenantClient) => Promise<T>): Promise<T> {
    if (!ctx?.orgId || !ctx?.userId) {
      // Bağlamsız çağrı bir programlama hatasıdır. Sessizce boş sonuç
      // döndürmek yerine gürültülü şekilde patlamayı tercih ediyoruz.
      throw new InternalServerErrorException('Tenant bağlamı olmadan veritabanı erişimi denendi');
    }

    return this.$transaction(async (tx) => {
      /**
       * `app.current_active_client_id` — panelde SEÇİLİ müşteri.
       *
       * `current_client_ids` ile ayrı tutuluyor: o erişebileceği müşteriler,
       * bu şu an baktığı müşteri. Erişim listesini seçime daraltmak, müşteri
       * seçicisinin kendi listesini de daraltıp kullanıcıyı seçtiği müşteriye
       * KİLİTLERDİ — geri dönemezdi.
       *
       * Seçim yokken BOŞ STRING gönderiliyor, değişken atlanmıyor. Atlamak,
       * havuzdan gelen bağlantıda önceki isteğin değerinin kalması demekti;
       * `set_config(..., true)` transaction ömürlü olsa da her isteğin kendi
       * değerini AÇIKÇA yazması, bir sonraki bakımda bu varsayımın yanlış
       * çıkma ihtimalini ortadan kaldırıyor.
       */
      await tx.$queryRaw`
        SELECT
          set_config('app.current_org_id',          ${ctx.orgId},                 true),
          set_config('app.current_user_id',         ${ctx.userId},                true),
          set_config('app.current_client_ids',      ${ctx.clientIds.join(',')},   true),
          set_config('app.is_org_admin',            ${ctx.isOrgAdmin ? 'on' : 'off'}, true),
          set_config('app.current_active_client_id', ${ctx.activeClientId ?? ''}, true)
      `;
      return fn(tx);
    });
  }

  /**
   * Bağlamın gerçekten uygulandığını doğrular. Sağlık kontrolü ve testler için.
   * Üretimde bir regresyonun sessizce geçmesini engeller.
   */
  async assertRlsActive(ctx: TenantContext): Promise<boolean> {
    return this.withTenant(ctx, async (tx) => {
      const rows = await tx.$queryRaw<Array<{ ok: boolean }>>`
        SELECT app.current_org_id() = ${ctx.orgId}::uuid AS ok
      `;
      return rows[0]?.ok === true;
    });
  }
}
