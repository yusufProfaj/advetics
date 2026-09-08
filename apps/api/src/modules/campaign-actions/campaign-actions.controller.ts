import { Controller, Param, ParseUUIDPipe, Post, Body } from '@nestjs/common';
import { campaignActionInputSchema, type CampaignActionInput, type TenantContext } from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { CampaignActionsService, type CampaignActionResult } from './campaign-actions.service';

/**
 * Yayınlanmış kampanyada bütçe/durum değiştirme — ELLE tetiklenen tek yol.
 *
 * BUGÜN BUNU ÇAĞIRAN İKİ YER: AI asistanının onay kartı ve (ileride) panelin
 * kendi "Duraklat"/"Bütçeyi değiştir" butonu. İkisi de AYNI izni
 * (`budget.write`) ve AYNI servis çağrısını paylaşıyor — ikinci bir yazma
 * yolu açmamak için endpoint burada, tool-executor'dan önce kuruldu.
 */
@Controller('campaigns')
export class CampaignActionsController {
  constructor(private readonly actions: CampaignActionsService) {}

  @Post(':id/actions')
  @RequirePermissions('budget.write')
  async apply(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) campaignId: string,
    @Body(zodBody(campaignActionInputSchema)) input: CampaignActionInput,
  ): Promise<CampaignActionResult> {
    if (input.type === 'set_budget') {
      return this.actions.applyAction(ctx, campaignId, {
        type: 'set_budget',
        amountMicros: BigInt(input.amountMicros),
        budgetMode: input.budgetMode,
      });
    }
    return this.actions.applyAction(ctx, campaignId, { type: input.type });
  }
}
