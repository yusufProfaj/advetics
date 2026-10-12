import { Module } from '@nestjs/common';
import { CampaignActionsModule } from '../campaign-actions/campaign-actions.module';
import { BildirimController } from './bildirim.controller';
import { BildirimService } from './bildirim.service';
import { SinyalController } from './sinyal.controller';
import { SinyalIsModule } from './sinyal-is.module';
import { SinyalService } from './sinyal.service';

/**
 * Sinyaller + bildirim kanalları, API tarafı (docs/sinyal/MIMARI.md).
 * `CampaignActionsModule` Uygula'nın TEK yazma yolu; `SinyalIsModule`
 * teslim servisi (deneme mesajı aynı gönderim yolundan geçiyor).
 *
 * NEST KAYDI AÇILIŞTA PATLAR: `imports`/`providers` ve AppModule kaydı
 * `sinyal-kayit.spec.ts` ile kilitli.
 */
@Module({
  imports: [CampaignActionsModule, SinyalIsModule],
  controllers: [SinyalController, BildirimController],
  providers: [SinyalService, BildirimService],
})
export class SinyalModule {}
