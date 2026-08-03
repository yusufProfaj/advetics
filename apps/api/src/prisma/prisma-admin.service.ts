import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CONFIG, type AppConfig } from '../config/configuration';

/**
 * RLS'i ATLAYAN Prisma istemcisi. `advetics_worker` rolü ile bağlanır (BYPASSRLS).
 *
 * ⚠️ BU İSTEMCİ TENANT İZOLASYONU SAĞLAMAZ.
 *
 * Kullanımı YALNIZCA şu üç durumla sınırlıdır ve bu liste genişletilmemelidir:
 *
 *   1. Kimlik doğrulama ÖNCESİ akışlar — bağlam henüz yok:
 *      login, register, davet kabul, şifre sıfırlama, refresh token rotasyonu.
 *
 *   2. JwtAuthGuard'ın bağlamı kurmak için yaptığı okuma —
 *      kullanıcının membership'lerini okumak, bağlamı kurmanın ön koşulu.
 *      (Tavuk-yumurta problemi; başka çözümü yok.)
 *
 *   3. Arka plan worker'ları (Modül 3+) — sync ve kural motoru doğası gereği
 *      tenant sınırını aşar.
 *
 * Bir HTTP endpoint'inin iş mantığında bu istemciyi görüyorsan, orada bir hata
 * vardır. Kod incelemesinde bu dosyaya yapılan her yeni referans sorgulanmalıdır.
 */
@Injectable()
export class PrismaAdminService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaAdminService.name);

  constructor(@Inject(CONFIG) config: AppConfig) {
    super({ datasourceUrl: config.database.workerUrl });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.warn('Yönetim veritabanı bağlantısı kuruldu (RLS ATLANIR: advetics_worker)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
