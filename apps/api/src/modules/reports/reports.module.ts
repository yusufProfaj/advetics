import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { KreatifAdresiService } from './kreatif-adresi.service';
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
  /*
   * BAĞLANTILAR MODÜLÜ: kreatif görselinin TAZE adresini almak için token ve
   * sağlayıcı gerekiyor. Saklanan Meta CDN adresi imzalı ve ölüyor; raporun
   * görselleri onsuz gelmiyor. Ters yönde bağımlılık YOK — `ConnectionsModule`
   * raporlamayı tanımıyor, yani döngü oluşmuyor.
   */
  imports: [ConnectionsModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    KreatifAdresiService,
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
