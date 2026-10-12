import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { VeriKaynagiController } from './veri-kaynagi.controller';
import { VeriKaynagiService } from './veri-kaynagi.service';

/**
 * Veri kaynakları, API tarafı (docs/veri-kaynagi/MIMARI.md § 3). Token kasası
 * ve sağlayıcılar `ConnectionsModule`den; Prisma, Audit, Config ve kuyruk
 * (`QueueModule`, @Global) global. Worker tarafı (`VeriKaynagiIsService`)
 * QueueModule'ün içinde. Servis dışa açık: kurulum rehberi mülkü kurunca
 * kaynağı bağlıyor (Ç-5).
 *
 * NEST KAYDI AÇILIŞTA PATLAR: `imports`/`providers` ve AppModule kaydı
 * `veri-kaynagi-kayit.spec.ts` ile kilitli.
 */
@Module({
  imports: [ConnectionsModule],
  controllers: [VeriKaynagiController],
  providers: [VeriKaynagiService],
  exports: [VeriKaynagiService],
})
export class VeriKaynagiModule {}
