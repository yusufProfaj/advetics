import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { KreatifEtiketService } from './kreatif-etiket.service';

/**
 * WORKER TARAFI (Paket D): `creative_tags` işi. `QueueModule` bunu içe
 * alıyor; ReportsModule'ü (tazeleme çekirdeği) içe alması döngü değil:
 * QueueModule onu zaten içe alıyor ve ReportsModule kuyruğu global
 * modülden okuyor. Nest kaydı açılışta patlar; `kreatif-zeka-kayit.spec.ts`.
 */
@Module({
  imports: [ReportsModule],
  providers: [KreatifEtiketService],
  exports: [KreatifEtiketService],
})
export class KreatifZekaIsModule {}
