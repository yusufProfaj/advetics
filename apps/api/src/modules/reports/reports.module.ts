import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ShareService } from './share.service';
import { ReportTemplatesService } from './report-templates.service';
import { RaporPdfService } from './rapor-pdf.service';
import { RaporGonderService } from './rapor-gonder.service';
import { RaporPlaniService } from './rapor-plani.service';

/** Modül 6 — White-label raporlama. */
@Module({
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ShareService,
    ReportTemplatesService,
    RaporPdfService,
    RaporGonderService,
    RaporPlaniService,
  ],
  exports: [ReportsService, ShareService, RaporPdfService, RaporGonderService, RaporPlaniService],
})
export class ReportsModule {}
