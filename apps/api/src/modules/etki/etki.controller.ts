import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  etkiListeSorgusuSchema,
  type EtkiAyrintisi,
  type EtkiListeSorgusu,
  type EtkiListesi,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodQuery } from '../../common/pipes/zod-validation.pipe';
import { EtkiService } from './etki.service';

/**
 * ETKİ UÇLARI — yol ve izin `ETKI_UCLARI` (shared/etki/etki.ts) ile BİREBİR;
 * `etki-kayit.spec.ts` kaynak taramasıyla karşılaştırıyor. İzin düz dize:
 * kayarsa TypeScript susar ve müşteri hesabı (rule.read yok) ekranı açar.
 * OKUMA-YALNIZ: yazma ucu yok, satırları iş yazıyor.
 */
@Controller('etki')
export class EtkiController {
  constructor(private readonly etki: EtkiService) {}

  @Get()
  @RequirePermissions('rule.read')
  liste(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(etkiListeSorgusuSchema)) sorgu: EtkiListeSorgusu,
  ): Promise<EtkiListesi> {
    return this.etki.liste(ctx, sorgu);
  }

  @Get(':id')
  @RequirePermissions('rule.read')
  tek(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<EtkiAyrintisi> {
    return this.etki.tek(ctx, id);
  }
}
