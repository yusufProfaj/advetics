import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import {
  kaynakBaglaSchema,
  kaynakDonemSorgusuSchema,
  kaynakListeSorgusuSchema,
  kaynakSecenekSorgusuSchema,
  type Ga4TrafikYaniti,
  type KaynakBaglaIstegi,
  type KaynakDonemSorgusu,
  type KaynakListeSorgusu,
  type KaynakSecenekSorgusu,
  type KaynakSecenekleriYaniti,
  type TakipAcigiYaniti,
  type TenantContext,
  type VeriKaynagiOzeti,
  type VeriKaynaklariYaniti,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import { VeriKaynagiService } from './veri-kaynagi.service';

interface IstekBilgisi {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * VERİ KAYNAĞI UÇLARI (F1) — yol ve izin `KAYNAK_UCLARI` (shared
 * veri-kaynagi/uclar.ts) ile BİREBİR; `veri-kaynagi-kayit.spec.ts` kaynak
 * taramasıyla karşılaştırıyor. İzin düz dize: kayarsa TypeScript susar ve
 * müşteri hesabı bağlantı ekranını açar. F2/F3 uçları (`arama-ortusmesi`,
 * `urun-performansi`) o dalgalarda.
 *
 * SIRA ÖNEMLİ: sabit yollar (`secenekler`, `ga4/trafik`, `takip-acigi`)
 * parametreli yoldan ÖNCE değil, zaten farklı yöntem/derinlikte; `:id`
 * yalnız DELETE ve POST alt yollarında.
 */
@Controller('veri-kaynaklari')
export class VeriKaynagiController {
  constructor(private readonly kaynak: VeriKaynagiService) {}

  private meta(req: IstekBilgisi) {
    const ua = req.headers['user-agent'];
    return { ip: req.ip ?? null, userAgent: typeof ua === 'string' ? ua : null };
  }

  @Get()
  @RequirePermissions('client.read')
  liste(@CurrentTenant() ctx: TenantContext, @Query(zodQuery(kaynakListeSorgusuSchema)) q: KaynakListeSorgusu): Promise<VeriKaynaklariYaniti> {
    return this.kaynak.liste(ctx, q.clientId);
  }

  @Get('secenekler')
  @RequirePermissions('connection.write')
  secenekler(@CurrentTenant() ctx: TenantContext, @Query(zodQuery(kaynakSecenekSorgusuSchema)) q: KaynakSecenekSorgusu): Promise<KaynakSecenekleriYaniti> {
    return this.kaynak.secenekler(ctx, q.clientId);
  }

  @Post()
  @RequirePermissions('connection.manage')
  bagla(@CurrentTenant() ctx: TenantContext, @Body(zodBody(kaynakBaglaSchema)) dto: KaynakBaglaIstegi, @Req() req: IstekBilgisi): Promise<VeriKaynagiOzeti> {
    return this.kaynak.bagla(ctx, dto, this.meta(req));
  }

  @Delete(':id')
  @RequirePermissions('connection.manage')
  kaldir(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Req() req: IstekBilgisi) {
    return this.kaynak.kaldir(ctx, id, this.meta(req));
  }

  @Post(':id/yenile')
  @RequirePermissions('connection.write')
  yenile(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.kaynak.yenile(ctx, id);
  }

  @Post(':id/duraklat')
  @RequirePermissions('connection.write')
  duraklat(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Req() req: IstekBilgisi): Promise<VeriKaynagiOzeti> {
    return this.kaynak.duraklat(ctx, id, this.meta(req));
  }

  @Get('ga4/trafik')
  @RequirePermissions('insights.read')
  trafik(@CurrentTenant() ctx: TenantContext, @Query(zodQuery(kaynakDonemSorgusuSchema)) q: KaynakDonemSorgusu): Promise<Ga4TrafikYaniti> {
    return this.kaynak.trafik(ctx, q);
  }

  @Get('takip-acigi')
  @RequirePermissions('insights.read')
  takipAcigi(@CurrentTenant() ctx: TenantContext, @Query(zodQuery(kaynakDonemSorgusuSchema)) q: KaynakDonemSorgusu): Promise<TakipAcigiYaniti> {
    return this.kaynak.takipAcigi(ctx, q);
  }
}
