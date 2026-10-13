import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { HAZIRLAMA_TETIKLEME_SORGUSU, hazirlamaCevapSchema, type HazirlamaCevabi, type HazirlamaYaniti, type TenantContext } from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { HazirlamaService } from './hazirlama.service';

/**
 * Hazır workspace (HAZIR-WORKSPACE-PLANI.md § Dalga 3). Okuma hazırlığı da
 * TETİKLER (imza değiştiyse): hesap atandıktan sonra bölüm açıldığında iş
 * kendiliğinden koşar.
 */
@Controller('clients')
export class HazirlamaController {
  constructor(private readonly hazirlama: HazirlamaService) {}

  /**
   * `?tetikle=hayir` SAYAÇ OKUMASI: satır olduğu gibi döner, iş başlamaz
   * (`hazirlamaSayacYolu`, shared). Yalnız TAM eşleşme kapatır: tanınmayan
   * bir değer bugünkü davranışa (tetikle) düşer, çünkü hazırlığı gösteren
   * ekranın tetiklemesi ürünün sözü — kapatmak açık bir istek olmalı.
   */
  @Get(':id/hazirlama')
  @RequirePermissions('client.read')
  oku(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(HAZIRLAMA_TETIKLEME_SORGUSU.anahtar) tetikle?: string,
  ): Promise<HazirlamaYaniti> {
    return this.hazirlama.oku(ctx, id, { tetikle: tetikle !== HAZIRLAMA_TETIKLEME_SORGUSU.kapali });
  }

  @Post(':id/hazirlama')
  @RequirePermissions('client.write')
  yeniden(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<HazirlamaYaniti> {
    return this.hazirlama.yeniden(ctx, id);
  }

  @Post(':id/hazirlama/cevap')
  @RequirePermissions('client.write')
  cevap(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(hazirlamaCevapSchema)) dto: HazirlamaCevabi,
  ): Promise<HazirlamaYaniti> {
    return this.hazirlama.cevap(ctx, id, dto);
  }
}
