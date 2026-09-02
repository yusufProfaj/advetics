import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ShareService } from './share.service';
import { ReportTemplatesService } from './report-templates.service';
import { RaporPdfService } from './rapor-pdf.service';
import { RaporGonderService } from './rapor-gonder.service';
import { RaporPlaniService } from './rapor-plani.service';
import { FaturaService } from './fatura.service';
import { AssetStorageService } from '../ad-builder/asset-storage.service';

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
    FaturaService,
    // Fatura PDF'leri varlık arşiviyle AYNI depolama katmanını kullanıyor;
    // ikinci bir dosya yolu açmak yedekleme ve izin kurallarını ikiye bölerdi.
    AssetStorageService,
  ],
  exports: [
    ReportsService,
    ShareService,
    RaporPdfService,
    RaporGonderService,
    RaporPlaniService,
    FaturaService,
  ],
})
export class ReportsModule {}
