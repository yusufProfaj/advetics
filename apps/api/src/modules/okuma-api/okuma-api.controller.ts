import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  okumaAnahtariOlusturSchema,
  type OkumaAnahtariOlustur,
  type OkumaAnahtariOlusturmaYaniti,
  type OkumaAnahtariOzeti,
  type OkumaAraciTanimi,
  type RequestMeta,
  type TenantContext,
} from '@advetics/shared';
import {
  CurrentTenant,
  OkumaAnahtariyla,
  RequestMetaParam,
} from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthedRequest } from '../../common/types/request';
import { mcpIsle } from './mcp-protokol';
import { OkumaAnahtariService, platformSahibiOlmali } from './okuma-anahtari.service';
import { AracArgumanHatasi, OKUMA_ARACLARI, araciBul, aracTanimlari } from './okuma-araclari';
import { OkumaAraclariService } from './okuma-araclari.service';

/**
 * PANEL — anahtar yönetimi. Çerezli oturumla çağrılıyor; okuma anahtarı
 * buraya ULAŞAMIYOR (uç işaretsiz). Ulaşabilseydi bir okuma anahtarı
 * kendine yeni anahtar üretip iptal edilmeyi atlatabilirdi.
 */
@Controller('okuma-api')
export class OkumaApiYonetimController {
  constructor(private readonly anahtarlar: OkumaAnahtariService) {}

  @Get('anahtarlar')
  listele(@CurrentTenant() ctx: TenantContext): Promise<OkumaAnahtariOzeti[]> {
    return this.anahtarlar.listele(ctx);
  }

  @Post('anahtarlar')
  olustur(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(okumaAnahtariOlusturSchema)) girdi: OkumaAnahtariOlustur,
    @RequestMetaParam() meta: RequestMeta,
  ): Promise<OkumaAnahtariOlusturmaYaniti> {
    return this.anahtarlar.olustur(ctx, girdi, meta);
  }

  @Delete('anahtarlar/:id')
  iptalEt(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @RequestMetaParam() meta: RequestMeta,
  ): Promise<OkumaAnahtariOzeti> {
    return this.anahtarlar.iptalEt(ctx, id, meta);
  }

  /** Paneldeki araç listesi — MCP'nin gördüğü listenin aynısı. */
  @Get('araclar')
  araclar(@CurrentTenant() ctx: TenantContext): OkumaAraciTanimi[] {
    platformSahibiOlmali(ctx);
    return aracTanimlari();
  }
}

/**
 * OKUMA UÇLARI — yalnızca `Authorization: Bearer adv_ro_…` ile.
 *
 * `/mcp`: MCP istemcileri (Claude Code, Claude Desktop, Cursor…).
 * `/okuma/araclar/:ad`: aynı araçlar, düz REST (curl, betik, n8n).
 */
@Controller()
@OkumaAnahtariyla()
export class OkumaApiController {
  constructor(private readonly araclar: OkumaAraclariService) {}

  @Post('mcp')
  @HttpCode(HttpStatus.OK)
  async mcp(
    @CurrentTenant() ctx: TenantContext,
    @Req() req: AuthedRequest,
    @Body() govde: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    const yanit = await mcpIsle(govde, {
      araclar: OKUMA_ARACLARI,
      calistir: (arac, args) => this.araclar.calistir(ctx, arac, args),
      hataMetni: (err) => this.araclar.hataMetni(err, req.requestId),
      sunucu: { name: 'advetics-okuma', version: '1.0.0' },
    });
    if (yanit === null) {
      // Yalnızca bildirim geldi: MCP 202 + boş gövde istiyor.
      res.status(HttpStatus.ACCEPTED);
      return undefined;
    }
    return yanit;
  }

  /**
   * SUNUCUDAN AKIŞ (SSE) YOK. Streamable HTTP bu ucun GET'ine 405 dönmeye
   * izin veriyor; istemci o zaman yalnızca POST ile çalışıyor.
   */
  @Get('mcp')
  mcpAkis(@Res() res: Response): void {
    res.status(HttpStatus.METHOD_NOT_ALLOWED).set('Allow', 'POST').end();
  }

  @Get('okuma/araclar')
  liste(): Array<OkumaAraciTanimi & { girdi: Record<string, unknown> }> {
    return OKUMA_ARACLARI.map(({ ad, baslik, aciklama, girdi }) => ({ ad, baslik, aciklama, girdi }));
  }

  @Get('okuma/araclar/:ad')
  async calistir(
    @CurrentTenant() ctx: TenantContext,
    @Param('ad') ad: string,
    @Query() sorgu: Record<string, unknown>,
  ): Promise<unknown> {
    const arac = araciBul(ad);
    if (!arac) throw new NotFoundException(`Bilinmeyen araç: ${ad}`);
    try {
      return await this.araclar.calistir(ctx, arac, sorgu);
    } catch (err) {
      // REST'te argüman hatası 400; diğerleri kendi durum koduyla filtreye.
      if (err instanceof AracArgumanHatasi) throw new BadRequestException(err.message);
      throw err;
    }
  }
}
