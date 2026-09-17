import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  aiAssistantConfirmInputSchema,
  aiAssistantMessageInputSchema,
  type AiAssistantConfirmInput,
  type AiAssistantConversationSummary,
  type AiAssistantMessageInput,
  type AsistanPlatformu,
  type AiAssistantThread,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { AiAssistantService, type SendMessageResult } from './ai-assistant.service';
import type { ToolResult } from './tool-types';

/**
 * Panel içi AI kampanya asistanı.
 *
 * ASGARİ İZİN `bulk.read` — sohbeti açabilmek için. Her tool kendi iznini
 * (`bulk.write`, `budget.write`, ...) `assertPermissions` ile AYRICA
 * kontrol ediyor (Adım 2); bu yüzden `analyst` gibi bir rol sohbeti açıp
 * taslak hazırlayabilir ama `pause_campaign`/`update_budget` onay kartını
 * tıklayınca `budget.write` eksikse reddedilir.
 */
@Controller('ai-assistant')
export class AiAssistantController {
  constructor(private readonly assistant: AiAssistantService) {}

  @Post('messages')
  @RequirePermissions('bulk.read')
  send(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(aiAssistantMessageInputSchema)) input: AiAssistantMessageInput,
  ): Promise<SendMessageResult> {
    return this.assistant.sendMessage(ctx, input);
  }

  /**
   * Sohbetin okunabilir hâli — panel sayfa yenilendiğinde buradan geri yükleniyor.
   *
   * `bulk.read` YETİYOR: yalnızca okuyor ve `assertOwnConversation` zaten
   * başkasının sohbetini reddediyor.
   */
  /**
   * Bu kullanıcının bu workspace'teki sohbetleri — en fazla üç.
   *
   * `bulk.read` YETİYOR: yalnızca okuyor ve liste zaten SAHİBİNE özel.
   */
  @Get('conversations')
  @RequirePermissions('bulk.read')
  conversations(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
    @Query('platform') platform?: string,
  ): Promise<AiAssistantConversationSummary[]> {
    /*
     * SÖZLÜKLE DARALTMA — iki yollu dallanma DEĞİL.
     *
     * `google ise şu, değilse Meta` biçiminde yazmak bu depoda taranıp
     * reddediliyor: üçüncü bir platform eklendiğinde sessizce yanlış değeri
     * üretiyor. Bilinmeyen değer Meta'ya düşüyor ve sebebi burada yazılı —
     * asistanı olmayan bir platform istendiğinde sohbeti patlatmak yerine
     * varsayılanla açılıyor.
     */
    const bilinen: Record<string, AsistanPlatformu> = { meta: 'meta', google: 'google' };
    return this.assistant.listConversations(ctx, clientId, bilinen[platform ?? ''] ?? 'meta');
  }

  /**
   * Sohbeti siler. GERİ ALINMIYOR.
   *
   * `bulk.write` — okuma yetkisi olan herkesin başkasının (kendi de olsa)
   * çalışma alanını silebilmesi gerekmiyor; silme bir yazma işi.
   */
  @Delete('conversations/:conversationId')
  @RequirePermissions('bulk.write')
  removeConversation(
    @CurrentTenant() ctx: TenantContext,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ): Promise<{ silindi: true }> {
    return this.assistant.deleteConversation(ctx, conversationId);
  }

  @Get('conversations/:conversationId')
  @RequirePermissions('bulk.read')
  thread(
    @CurrentTenant() ctx: TenantContext,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ): Promise<AiAssistantThread> {
    return this.assistant.getThread(ctx, conversationId);
  }

  /**
   * Onay kartı tıklandığında çağrılıyor. TEK KULLANIMLIK: aynı
   * `confirmationId` ikinci kez gelirse `AiAssistantService.confirm`
   * `{status:'failed'}` döner, ikinci bir platform çağrısı yapılmaz.
   */
  @Post('conversations/:conversationId/confirm')
  @RequirePermissions('budget.write')
  confirm(
    @CurrentTenant() ctx: TenantContext,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Body(zodBody(aiAssistantConfirmInputSchema)) input: AiAssistantConfirmInput,
  ): Promise<ToolResult> {
    return this.assistant.confirm(ctx, conversationId, input.confirmationId);
  }
}
