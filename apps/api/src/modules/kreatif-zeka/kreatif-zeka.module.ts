import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { KreatifZekaController } from './kreatif-zeka.controller';
import { KreatifZekaService } from './kreatif-zeka.service';

/**
 * Kreatif zekâsı, API tarafı (docs/kreatif-zeka/MIMARI.md). Görsel ucu
 * raporun TAZELEME ÇEKİRDEĞİNİ kullanıyor (`KreatifAdresiService`,
 * ReportsModule'den): ikinci bir tazeleyici yazılmadı. Prisma, kuyruk ve
 * yapay zekâ istemcisi global.
 *
 * NEST KAYDI AÇILIŞTA PATLAR, derlemede değil: `kreatif-zeka-kayit.spec.ts`
 * kaynak taramasıyla kilitliyor.
 */
@Module({
  imports: [ReportsModule],
  controllers: [KreatifZekaController],
  providers: [KreatifZekaService],
})
export class KreatifZekaModule {}
