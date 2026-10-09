import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {
  asistanMesajSchema,
  oneriUygulaSchema,
  type AsistanOturumu,
  type Oneri,
  type OneriListesi,
  type OneriUygulaGirdisi,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, CurrentUser, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { RequestActor } from '../../common/types/request';
import { AsistanService } from './asistan/asistan.service';
import { AsistanHatasi, type AsistanOlayi } from './asistan/dongu';
import { IyilestirService, type UygulaSonucu } from './iyilestir.service';

const oturumAcSchema = z.object({ clientId: z.string().uuid() });

/**
 * İYİLEŞTİR UÇLARI (MIMARI § 5). Yetkiler kullanıcı kararı: okuma
 * `insights.read`, uygula/yoksay `budget.write` (yönetici, reklam
 * yöneticisi). Müşteri hesabı İyileştir'i görmez.
 *
 * `clientId` SORGUDA: öneri anahtarı müşteriyi taşımıyor ve gövde şeması
 * sözleşmede yalnız `ozet`.
 */
@Controller('iyilestir')
export class IyilestirController {
  constructor(
    private readonly iyilestir: IyilestirService,
    private readonly asistan: AsistanService,
  ) {}

  @Get('oneriler')
  @RequirePermissions('insights.read')
  oneriler(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<OneriListesi> {
    return this.iyilestir.liste(ctx, clientId);
  }

  /**
   * `?prova=true`: Google'da `validateOnly` (hiçbir şey değişmez, karar
   * yazılmaz). İlk canlı Google çağrısı bununla yapılacak (MIMARI § 3);
   * Meta'da prova yok ve istek reddediliyor.
   */
  @Post('oneriler/:anahtar/uygula')
  @RequirePermissions('budget.write')
  uygula(
    @CurrentTenant() ctx: TenantContext,
    @CurrentUser() actor: RequestActor | undefined,
    @Param('anahtar') anahtar: string,
    @Query('clientId', ParseUUIDPipe) clientId: string,
    @Query('prova') prova: string | undefined,
    @Body(zodBody(oneriUygulaSchema)) dto: OneriUygulaGirdisi,
  ): Promise<UygulaSonucu> {
    if (prova !== undefined && prova !== 'true' && prova !== 'false') {
      throw new BadRequestException('prova yalnız true ya da false olabilir');
    }
    return this.iyilestir.uygula(ctx, actor?.fullName ?? 'Bilinmeyen kullanıcı', clientId, anahtar, dto.ozet, {
      prova: prova === 'true',
    });
  }

  @Post('oneriler/:anahtar/yoksay')
  @RequirePermissions('budget.write')
  yoksay(
    @CurrentTenant() ctx: TenantContext,
    @Param('anahtar') anahtar: string,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<Oneri> {
    return this.iyilestir.yoksay(ctx, clientId, anahtar);
  }

  // ── AI Asistan ──────────────────────────────────────────────────────────

  @Post('asistan/oturumlar')
  @RequirePermissions('insights.read')
  oturumAc(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(oturumAcSchema)) dto: z.infer<typeof oturumAcSchema>,
  ): Promise<AsistanOturumu & { asistanBagli: boolean }> {
    return this.asistan.oturumAc(ctx, dto.clientId);
  }

  @Get('asistan/oturumlar/:id')
  @RequirePermissions('insights.read')
  oturumOku(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AsistanOturumu & { asistanBagli: boolean }> {
    return this.asistan.oturumOku(ctx, id);
  }

  /**
   * SSE. Olaylar: `basladi` {mesajId}, `metin` {parca}, `parca`
   * {parca: AsistanParcasi}, `bitti` {mesaj: AsistanMesaji}.
   *
   * İSTEMCİ KOPARSA TUR YİNE BİTİRİLİYOR: jeneratör sonuna kadar
   * tüketiliyor, yalnız yazma atlanıyor (AdvCampaign ucuyla aynı karar);
   * yarıda bırakılan tur asistan mesajını hiç yazmazdı.
   * Oturum, kota ve model yok hataları akıştan ÖNCE HTTP hatası olarak döner.
   */
  @Post('asistan/oturumlar/:id/mesajlar')
  @RequirePermissions('insights.read')
  async mesaj(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(asistanMesajSchema)) dto: z.infer<typeof asistanMesajSchema>,
    @Res() res: Response,
  ): Promise<void> {
    const akis = this.asistan.tur(ctx, id, dto.metin);
    let ilk: IteratorResult<AsistanOlayi>;
    try {
      ilk = await akis.next();
    } catch (e) {
      throw httpHatasi(e);
    }
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    // Advetics'in KENDİ yanıt başlığı: vekil sunucu yapılandırmasına
    // dokunmadan akışı tamponsuz ister (CLAUDE.md § 1).
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    let acik = true;
    res.on('close', () => {
      acik = false;
    });
    const yaz = (e: AsistanOlayi) => {
      if (acik) res.write(`event: ${e.tur}\ndata: ${JSON.stringify(e)}\n\n`);
    };
    try {
      if (!ilk.done) yaz(ilk.value);
      for await (const e of akis) yaz(e);
    } catch (e) {
      yaz({ tur: 'parca', parca: { tur: 'hata', mesaj: e instanceof Error ? e.message : String(e) } });
    } finally {
      if (acik) res.end();
    }
  }
}

function httpHatasi(e: unknown): HttpException {
  if (e instanceof HttpException) return e;
  if (e instanceof AsistanHatasi) {
    if (e.kod === 'YOK') return new NotFoundException(e.message);
    if (e.kod === 'SAHIP_DEGIL') return new ForbiddenException(e.message);
    if (e.kod === 'KOTA') return new HttpException(e.message, HttpStatus.TOO_MANY_REQUESTS);
    return new ServiceUnavailableException(e.message);
  }
  return new HttpException(e instanceof Error ? e.message : String(e), 500);
}
