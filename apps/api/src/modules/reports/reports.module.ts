import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ShareService } from './share.service';

/** Modül 6 — White-label raporlama. */
@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ShareService],
  exports: [ReportsService, ShareService],
})
export class ReportsModule {}
