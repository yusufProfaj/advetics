import { Module } from '@nestjs/common';
import { BudgetsModule } from '../budgets/budgets.module';
import { CampaignActionsModule } from '../campaign-actions/campaign-actions.module';
import { GeriBeslemeModule } from '../geri-besleme/geri-besleme.module';
import { MetricsModule } from '../metrics/metrics.module';
import { AsistanService } from './asistan/asistan.service';
import { IyilestirController } from './iyilestir.controller';
import { IyilestirService } from './iyilestir.service';

/**
 * İyileştir v1 + AI Asistan v1 (docs/iyilestir/MIMARI.md).
 *
 * Üç iş modülüne bağlı ve üçü de servisini dışa açıyor: `CampaignActionsModule`
 * (TEK yazma yolu), `BudgetsModule` (aylık bütçe kapısı), `MetricsModule`
 * (asistanın okuma araçları). `GeriBeslemeModule` form optimizasyonu
 * kartının kapısı için (lead geri beslemesinin durumu). Yapay zekâ global
 * `YapayZekaModule`dan.
 *
 * NEST KAYDI AÇILIŞTA PATLAR, DERLEMEDE DEĞİL (CLAUDE.md): `imports` ve
 * `providers` `iyilestir-kayit.spec.ts` kaynak taramasıyla kilitli.
 */
@Module({
  imports: [CampaignActionsModule, BudgetsModule, MetricsModule, GeriBeslemeModule],
  controllers: [IyilestirController],
  providers: [IyilestirService, AsistanService],
})
export class IyilestirModule {}
