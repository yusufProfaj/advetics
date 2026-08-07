import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { BoostsController } from './boosts.controller';
import { BoostsService } from './boosts.service';
import { BoostExecutorService } from './boost-executor.service';

/**
 * Modül 7 — Auto-Boost.
 *
 * QueueModule içe ALINMIYOR: `@Global` olduğu için QuotaGuardService zaten
 * enjekte edilebiliyor ve içe almak, QueueModule'ün bu modülü zamanlanmış
 * çalıştırma için içe almasıyla döngü üretirdi (bkz. RulesModule).
 */
@Module({
  imports: [ConnectionsModule],
  controllers: [BoostsController],
  providers: [BoostsService, BoostExecutorService],
  exports: [BoostsService, BoostExecutorService],
})
export class BoostsModule {}
