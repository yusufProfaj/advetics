import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import type { OnayKarti, SohbetOlayi, TenantContext } from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../../common/decorators';
import { zodBody } from '../../../common/pipes/zod-validation.pipe';
import { SohbetHatasi } from './dongu';
import { AdvOnayService } from './onay.service';
import { AdvSohbetService, type EkranMesaji, type OturumOzeti } from './sohbet.service';

const oturumAcSchema = z.object({ clientId: z.string().uuid() });
const mesajSchema = z.object({
  metin: z.string().max(4000).default(''),
  medyalar: z.array(z.object({ varlikId: z.string().uuid(), kapakVarlikId: z.string().uuid().optional() })).max(10).default([]),
});
const onaylaSchema = z.object({ mod: z.enum(['yayinla', 'test_kipi']) });

/**
 * ADVCAMPAIGN SOHBET UÇLARI (TASARIM-PLAN § 4.1, § 4.7).
 *
 * Mesaj ucu `text/event-stream` döndürüyor. İSTEMCİ KOPARSA TUR YİNE
 * BİTİRİLİYOR: jeneratör sonuna kadar tüketiliyor, yalnız yazma atlanıyor.
 * Yarıda bırakılan bir tur, kayıtta sonsuza kadar "akista" kalırdı ve
 * ekran "yazıyor" demeye devam ederdi.
 *
 * `X-Accel-Buffering: no` Advetics'in KENDİ yanıt başlığı: paylaşımlı
 * sunucuda vekil sunucu yapılandırmasına dokunmadan akışı tamponsuz ister
 * (CLAUDE.md § 1). Tamponlanırsa istemci "sonra=" ile yeniden okur.
 */
@Controller('reklam')
export class AdvSohbetController {
  constructor(
    private readonly sohbet: AdvSohbetService,
    private readonly onay: AdvOnayService,
  ) {}

  @Post('sohbet/oturumlar')
  @RequirePermissions('bulk.write')
  oturumAc(@CurrentTenant() ctx: TenantContext, @Body(zodBody(oturumAcSchema)) dto: z.infer<typeof oturumAcSchema>): Promise<OturumOzeti> {
    return this.sohbet.oturumAc(ctx, dto.clientId);
  }

  @Get('sohbet/oturumlar')
  @RequirePermissions('bulk.read')
  oturumlar(@CurrentTenant() ctx: TenantContext, @Query('clientId', ParseUUIDPipe) clientId: string): Promise<{ satirlar: OturumOzeti[]; toplam: number; asistanBagli: boolean }> {
    return this.sohbet.oturumlar(ctx, clientId);
  }

  @Get('sohbet/oturumlar/:id/mesajlar')
  @RequirePermissions('bulk.read')
  mesajlar(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('sonra') sonra?: string,
  ): Promise<{ oturum: OturumOzeti; mesajlar: EkranMesaji[] }> {
    const n = sonra === undefined ? 0 : Number(sonra);
    if (!Number.isInteger(n) || n < 0) throw new BadRequestException('sonra bir sıra numarası olmalı');
    return this.sohbet.mesajlar(ctx, id, n);
  }

  @Post('sohbet/oturumlar/:id/mesajlar')
  @RequirePermissions('bulk.write')
  async mesajGonder(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(mesajSchema)) dto: z.infer<typeof mesajSchema>,
    @Res() res: Response,
  ): Promise<void> {
    if (!dto.metin.trim() && dto.medyalar.length === 0) throw new BadRequestException('Bir şey yaz ya da medya bırak.');
    const akis = this.sohbet.tur(ctx, id, { metin: dto.metin, medyalar: dto.medyalar });
    // İlk olayı başlık göndermeden önce al: oturum/medya hataları HTTP
    // hatası olarak dönsün, akışın içine gömülmesin.
    let ilk: IteratorResult<SohbetOlayi>;
    try {
      ilk = await akis.next();
    } catch (e) {
      throw httpHatasi(e);
    }
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    let acik = true;
    res.on('close', () => {
      acik = false;
    });
    const yaz = (e: SohbetOlayi) => {
      if (acik) res.write(`event: ${e.tur}\ndata: ${JSON.stringify(e)}\n\n`);
    };
    try {
      if (!ilk.done) yaz(ilk.value);
      for await (const e of akis) yaz(e);
    } catch (e) {
      yaz({ tur: 'hata', hata: 'ulasilamadi', mesaj: e instanceof Error ? e.message : String(e) });
    } finally {
      if (acik) res.end();
    }
  }

  @Get('onaylar/:id')
  @RequirePermissions('bulk.read')
  onayOku(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<{ id: string; durum: string; kart: OnayKarti; yayinId: string | null }> {
    return this.onay.oku(ctx, id);
  }

  /** Kullanıcının kartta tıklaması. Model bu uca erişemiyor. */
  @Post('onaylar/:id/onayla')
  @RequirePermissions('bulk.write')
  onayla(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(onaylaSchema)) dto: z.infer<typeof onaylaSchema>,
  ): Promise<{ yayinId: string }> {
    return this.onay.onayla(ctx, id, dto.mod);
  }
}

function httpHatasi(e: unknown): HttpException {
  if (e instanceof HttpException) return e;
  if (e instanceof SohbetHatasi) {
    if (e.kod === 'YOK') return new NotFoundException(e.message);
    if (e.kod === 'SAHIP_DEGIL') return new ForbiddenException(e.message);
    return new BadRequestException(e.message);
  }
  return new HttpException(e instanceof Error ? e.message : String(e), 500);
}
