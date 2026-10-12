import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { HaftalikOzetController } from './haftalik-ozet.controller';
import { HaftalikOzetIsModule } from './haftalik-ozet-is.module';
import { HaftalikOzetService } from './haftalik-ozet.service';

/**
 * Haftalık özet, API tarafı (docs/haftalik-ozet/MIMARI.md § 3). Çekirdek
 * (`HaftalikOzetIsModule`) üretim ve saklama; `ReportsModule` müşteri planı
 * (report_schedules) ve TEK SMTP gönderim yolu (RaporGonderService).
 * Ters yön yok: ReportsModule bu modülü değil çekirdeği içe alıyor.
 *
 * NEST KAYDI AÇILIŞTA PATLAR: `imports`/`providers` ve AppModule kaydı
 * `haftalik-ozet-kayit.spec.ts` ile kilitli.
 */
@Module({
  imports: [HaftalikOzetIsModule, ReportsModule],
  controllers: [HaftalikOzetController],
  providers: [HaftalikOzetService],
})
export class HaftalikOzetModule {}
