import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { GeriBeslemeController } from './geri-besleme.controller';
import { GeriBeslemeService } from './geri-besleme.service';

/**
 * Lead geri besleme, API tarafı (docs/geri-besleme/MIMARI.md). Gönderim
 * işi (`GeriBeslemeGonderimService`) QueueModule'de: kota bekçisi ve kuyruk
 * orada ve bu modülü oraya içe aldırmak döngü kurardı. Kuyruk (`SyncQueueService`)
 * QueueModule @Global olduğu için ayrıca içe alınmıyor.
 *
 * NEST KAYDI AÇILIŞTA PATLAR: `imports`/`providers` ve AppModule kaydı
 * `geri-besleme-kayit.spec.ts` ile kilitli.
 */
@Module({
  imports: [ConnectionsModule],
  controllers: [GeriBeslemeController],
  providers: [GeriBeslemeService],
  // İyileştir'in form optimizasyonu kartı geri beslemenin durumunu okuyor.
  exports: [GeriBeslemeService],
})
export class GeriBeslemeModule {}
