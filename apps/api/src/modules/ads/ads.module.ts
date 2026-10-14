import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { AdsController } from './ads.controller';
import { AdsService } from './ads.service';

/** Modül 4 — Ads Explorer. */
@Module({
  /*
   * RAPORLAR MODÜLÜ: önizleme görselini tazelemek için kreatif adresi
   * çekirdeği (`KreatifAdresiService`) orada. Ters yön yok: raporlama
   * reklam keşfini tanımıyor, döngü oluşmuyor.
   */
  imports: [ReportsModule],
  controllers: [AdsController],
  providers: [AdsService],
  exports: [AdsService],
})
export class AdsModule {}
