import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  GERI_BESLEME_PLATFORMLARI,
  geriBeslemeAyarSchema,
  geriBeslemeOlayListeSchema,
  geriBeslemeYenidenDeneSchema,
  type GeriBeslemeAyarGirdisi,
  type GeriBeslemeAyari,
  type GeriBeslemeOlayListeSorgusu,
  type GeriBeslemeOlaylariYaniti,
  type GeriBeslemeYenidenDeneGirdisi,
  type GeriBeslemeYenidenDeneSonucu,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import { GeriBeslemeService, type GeriBeslemeAyarYaniti } from './geri-besleme.service';

/**
 * İSTEK DOĞRULAYICILARI (tip değil): ayar okuma ve kontrol uçlarının girdisi
 * sözleşmede şema olarak yok; alanlar `GeriBeslemeAyari` ile aynı.
 * `secenekler=evet` yalnız ayar penceresinden: Meta piksel listesini okur
 * (bkz. `GeriBeslemeService.ayar`).
 */
const ayarSorgusu = z.object({
  clientId: z.string().uuid(),
  platform: z.enum(GERI_BESLEME_PLATFORMLARI).default('meta'),
  secenekler: z.enum(['evet', 'hayir']).default('hayir'),
});
const kontrolGirdisi = z.object({
  clientId: z.string().uuid(),
  platform: z.enum(GERI_BESLEME_PLATFORMLARI).default('meta'),
});

/**
 * GERİ BESLEME UÇLARI — yol ve izin `GERI_BESLEME_UCLARI`
 * (shared/geri-besleme/uclar.ts) ile BİREBİR; `geri-besleme-kayit.spec.ts`
 * kaynak taramasıyla karşılaştırıyor. İzin düz dize: kayarsa TypeScript susar
 * ve müşteri hesabı veri aktarımını açabilir.
 *
 * KALİTE İŞARETİ BURADA DEĞİL: `PUT /leads/:id` (lead.write) aynı
 * transaction'da geçmiş ve aşama satırlarını yazıyor.
 */
@Controller('geri-besleme')
export class GeriBeslemeController {
  constructor(private readonly gb: GeriBeslemeService) {}

  @Get('ayar')
  @RequirePermissions('lead.read')
  ayar(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(ayarSorgusu)) q: z.infer<typeof ayarSorgusu>,
  ): Promise<GeriBeslemeAyari> {
    return this.gb.ayar(ctx, q.clientId, q.secenekler === 'evet');
  }

  @Put('ayar')
  @RequirePermissions('connection.manage')
  ayarYaz(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(geriBeslemeAyarSchema)) dto: GeriBeslemeAyarGirdisi,
  ): Promise<GeriBeslemeAyarYaniti> {
    return this.gb.ayarYaz(ctx, dto);
  }

  @Post('ayar/kontrol')
  @RequirePermissions('connection.manage')
  kontrol(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(kontrolGirdisi)) dto: z.infer<typeof kontrolGirdisi>,
  ): Promise<GeriBeslemeAyari> {
    return this.gb.kontrol(ctx, dto.clientId);
  }

  @Get('olaylar')
  @RequirePermissions('lead.read')
  olaylar(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(geriBeslemeOlayListeSchema)) q: GeriBeslemeOlayListeSorgusu,
  ): Promise<GeriBeslemeOlaylariYaniti> {
    return this.gb.olaylar(ctx, q);
  }

  @Post('olaylar/yeniden-dene')
  @RequirePermissions('lead.write')
  yenidenDene(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(geriBeslemeYenidenDeneSchema)) dto: GeriBeslemeYenidenDeneGirdisi,
  ): Promise<GeriBeslemeYenidenDeneSonucu> {
    return this.gb.yenidenDene(ctx, dto);
  }
}
