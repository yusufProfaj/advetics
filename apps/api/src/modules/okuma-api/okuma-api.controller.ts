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
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  MAX_VIDEO_BYTES,
  MCP_YUKLEME_BASLIGI,
  okumaAnahtariOlusturSchema,
  type McpOnayListesi,
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
  Public,
  RequestMetaParam,
} from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthedRequest } from '../../common/types/request';
import { MCP_TALIMATLARI, MCP_YAZMA_TALIMATLARI, mcpIsle, type McpAraci } from './mcp-protokol';
import { McpOnayService } from './mcp-onay.service';
import { YAZMA_ARACLARI, type YazmaAraci } from './mcp-yazma-araclari';
import { McpYazmaService, type YazmaIstegi } from './mcp-yazma.service';
import { OkumaAnahtariService, platformSahibiOlmali } from './okuma-anahtari.service';
import { AracArgumanHatasi, OKUMA_ARACLARI, araciBul, aracTanimlari, type OkumaAraci } from './okuma-araclari';
import { OkumaAraclariService } from './okuma-araclari.service';

/**
 * PANEL — anahtar yönetimi. Çerezli oturumla çağrılıyor; okuma anahtarı
 * buraya ULAŞAMIYOR (uç işaretsiz). Ulaşabilseydi bir okuma anahtarı
 * kendine yeni anahtar üretip iptal edilmeyi atlatabilirdi.
 */
@Controller('okuma-api')
export class OkumaApiYonetimController {
  constructor(
    private readonly anahtarlar: OkumaAnahtariService,
    private readonly onaylar: McpOnayService,
  ) {}

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

  /** Paneldeki araç listesi — MCP'nin gördüğü listenin aynısı (okuma + yazma, ayrı ayrı). */
  @Get('araclar')
  araclar(@CurrentTenant() ctx: TenantContext): OkumaAraciTanimi[] {
    platformSahibiOlmali(ctx);
    return aracTanimlari();
  }

  @Get('yazma-araclari')
  yazmaAraclari(@CurrentTenant() ctx: TenantContext): OkumaAraciTanimi[] {
    platformSahibiOlmali(ctx);
    return YAZMA_ARACLARI.map(({ ad, baslik, aciklama }) => ({ ad, baslik, aciklama }));
  }

  /** "MCP etkinliği": bu kullanıcının bütün anahtarlarının son onay satırları. */
  @Get('onaylar')
  onayListesi(@CurrentTenant() ctx: TenantContext): Promise<McpOnayListesi> {
    platformSahibiOlmali(ctx);
    return this.onaylar.listele(ctx);
  }
}

/**
 * Bu isteğin geldiği MCP adresinden yükleme adresi. İstemci `/mcp`e o
 * adresle ULAŞTI; aynı kök yükleme için de çalışır. Sunucu yapılandırmasından
 * türetmek, yerelde (web 3000, API 4000) ya da başka bir alan adında yanlış
 * adres verirdi.
 */
export function yuklemeAdresi(req: AuthedRequest): string {
  const proto = (req.get('x-forwarded-proto') ?? req.protocol ?? 'https').split(',')[0]!.trim();
  const host = (req.get('x-forwarded-host') ?? req.get('host') ?? '').split(',')[0]!.trim();
  const yol = (req.originalUrl ?? '/mcp').split('?')[0]!.replace(/\/mcp\/?$/, '');
  return `${proto}://${host}${yol}/mcp/yukleme`;
}

const YAZMA_ADLARI = new Set(YAZMA_ARACLARI.map((a) => a.ad));

/**
 * OKUMA UÇLARI — yalnızca `Authorization: Bearer adv_ro_…` ile.
 *
 * `/mcp`: MCP istemcileri (Claude Code, Claude Desktop, Cursor…).
 * `/okuma/araclar/:ad`: aynı araçlar, düz REST (curl, betik, n8n).
 */
@Controller()
@OkumaAnahtariyla()
export class OkumaApiController {
  constructor(
    private readonly araclar: OkumaAraclariService,
    private readonly yazma: McpYazmaService,
  ) {}

  @Post('mcp')
  @HttpCode(HttpStatus.OK)
  async mcp(
    @CurrentTenant() ctx: TenantContext,
    @Req() req: AuthedRequest,
    @Body() govde: unknown,
    @Res({ passthrough: true }) res: Response,
  ): Promise<unknown> {
    /*
     * YETKİ SATIRDAN (bekçi her istekte okudu). Okuma anahtarı yazma
     * araçlarını LİSTEDE görmüyor; çağırırsa da `McpYazmaService.calistir`
     * reddediyor (liste görüntü, kapı orası).
     */
    const yetki = req.anahtarYetkisi ?? 'okuma';
    const istek: YazmaIstegi = {
      ctx,
      anahtarId: req.okumaAnahtariId ?? '',
      yetki,
      requestId: req.requestId,
      yuklemeAdresi: yuklemeAdresi(req),
    };
    const araclar: readonly McpAraci[] = yetki === 'yazma' ? [...OKUMA_ARACLARI, ...YAZMA_ARACLARI] : OKUMA_ARACLARI;
    const yanit = await mcpIsle(govde, {
      araclar,
      calistir: (arac, args) =>
        YAZMA_ADLARI.has(arac.ad)
          ? this.yazma.calistir(istek, arac as YazmaAraci, args)
          : this.araclar.calistir(ctx, arac as OkumaAraci, args),
      hataMetni: (err) => this.araclar.hataMetni(err, req.requestId),
      sunucu: { name: yetki === 'yazma' ? 'advetics' : 'advetics-okuma', version: '2.0.0' },
      talimat: yetki === 'yazma' ? MCP_YAZMA_TALIMATLARI : MCP_TALIMATLARI,
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

/**
 * MCP YÜKLEME UCU — `@Public`: kimlik `x-advetics-yukleme` jetonundan
 * (`McpYazmaService.yukle`). Bearer DEĞİL: Bearer değeri JWT / anahtar
 * bekçisine gider ve kabukta çalışan curl'ün elinde anahtar yok.
 */
@Controller('mcp')
export class McpYuklemeController {
  constructor(private readonly yazma: McpYazmaService) {}

  @Post('yukleme')
  @Public()
  @HttpCode(HttpStatus.CREATED)
  // Sınır VİDEOnunki; görselin 30 MB sınırı Varlıklar servisinde.
  @UseInterceptors(FileInterceptor('dosya', { limits: { fileSize: MAX_VIDEO_BYTES, files: 1 } }))
  yukle(
    @Req() req: AuthedRequest,
    @UploadedFile() dosya: { buffer: Buffer; originalname: string } | undefined,
  ): Promise<unknown> {
    return this.yazma.yukle(req.get(MCP_YUKLEME_BASLIGI) ?? undefined, dosya);
  }
}
