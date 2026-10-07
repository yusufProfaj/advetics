import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  ATIF_STANDARTLARI,
  OLUSTURAN_YUZLER,
  taslakAlanlariSchema,
  type AtifStandardi,
  type ReklamHazirligi,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthedRequest } from '../../common/types/request';
import { ReklamHazirlikService } from './hazirlik.service';
import { ReklamTaslakService, type AlanDegisikligi, type TaslakKaydi } from './taslak.service';
import { AjansAyariService, type AtifDurumu } from './ajans-ayari.service';
import { ReklamYayinService, type YayinGorunumu } from './yayin.service';
import type { YayinBaslatSonucu } from './yayin-baslat';

const taslakOlusturSchema = z.object({
  clientId: z.string().uuid(),
  yuz: z.enum(OLUSTURAN_YUZLER).default('acemi'),
  asilCumle: z.string().trim().max(2000).nullable().default(null),
});

/**
 * Panelin yazabileceği kaynaklar yalnız `kullanici` ve `marka_merkezi`.
 * `workspace_profili` (kilitli, müşteri kaydından) ve `derleyici` sunucunun:
 * istemci bir alanı "müşteri kaydından geldi" diye işaretleyip kilidini
 * taklit edemez. `null` = alanı temizle.
 */
const alanAdlari = Object.keys(taslakAlanlariSchema.shape) as [string, ...string[]];
const surumYazSchema = z.object({
  degisiklikler: z.record(
    z.enum(alanAdlari),
    z.object({ deger: z.unknown(), kaynak: z.enum(['kullanici', 'marka_merkezi']) }).nullable(),
  ),
});

const yayinlaSchema = z.object({
  surumNo: z.number().int().min(1),
  icerikOzeti: z.string().regex(/^[0-9a-f]{64}$/),
  testKipi: z.boolean(),
});

const atifSecSchema = z.object({ standart: z.enum(ATIF_STANDARTLARI) });
const yazmaAnahtariSchema = z.object({
  durdur: z.boolean(),
  sebep: z.string().trim().max(500).nullable().default(null),
});

/**
 * Yeni reklam modülünün uçları. Önek `reklam`: eski `ad-builder`,
 * `draft-tree`, `bulk` uçlarından AYRI; ikisi bir süre birlikte yaşayacak ve
 * Aşama 7'de eskiler silinecek.
 */
@Controller('reklam')
export class ReklamController {
  constructor(
    private readonly hazirlik: ReklamHazirlikService,
    private readonly taslak: ReklamTaslakService,
    private readonly ajans: AjansAyariService,
    private readonly yayin: ReklamYayinService,
  ) {}

  @Get('hazirlik')
  @RequirePermissions('bulk.write')
  hazirlikOku(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<ReklamHazirligi> {
    return this.hazirlik.oku(ctx, clientId);
  }

  @Get('taslaklar')
  @RequirePermissions('bulk.read')
  taslaklar(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<{ satirlar: TaslakKaydi[]; toplam: number }> {
    return this.taslak.listele(ctx, clientId);
  }

  @Post('taslaklar')
  @RequirePermissions('bulk.write')
  taslakOlustur(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(taslakOlusturSchema)) dto: z.infer<typeof taslakOlusturSchema>,
  ): Promise<TaslakKaydi> {
    return this.taslak.olustur(ctx, dto.clientId, dto.yuz, dto.asilCumle);
  }

  @Get('taslaklar/:id')
  @RequirePermissions('bulk.read')
  taslakOku(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<TaslakKaydi> {
    return this.taslak.oku(ctx, id);
  }

  @Put('taslaklar/:id/surum')
  @RequirePermissions('bulk.write')
  surumYaz(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(surumYazSchema)) dto: z.infer<typeof surumYazSchema>,
  ): Promise<TaslakKaydi> {
    return this.taslak.surumYaz(ctx, id, dto.degisiklikler as AlanDegisikligi);
  }

  @Post('taslaklar/:id/arsivle')
  @RequirePermissions('bulk.write')
  arsivle(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<TaslakKaydi> {
    return this.taslak.arsivle(ctx, id);
  }

  @Get('ajans-ayari/atif')
  @RequirePermissions('bulk.read')
  atifOku(@CurrentTenant() ctx: TenantContext): Promise<AtifDurumu> {
    return this.ajans.atifOku(ctx);
  }

  @Put('ajans-ayari/atif')
  @RequirePermissions('org.write')
  atifSec(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(atifSecSchema)) dto: { standart: AtifStandardi },
    @Req() req: AuthedRequest,
  ): Promise<AtifDurumu> {
    return this.ajans.atifSec(ctx, dto.standart, {
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      requestId: req.requestId,
    });
  }

  /** "Meta'ya yazmayı durdur" — ajans yöneticisi, sebep zorunlu. */
  @Put('ajans-ayari/meta-yazma')
  @RequirePermissions('org.write')
  yazmaAnahtari(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(yazmaAnahtariSchema)) dto: z.infer<typeof yazmaAnahtariSchema>,
    @Req() req: AuthedRequest,
  ): Promise<{ durduruldu: boolean; sebep: string | null }> {
    return this.ajans.yazmaAnahtari(ctx, dto.durdur, dto.sebep, {
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      requestId: req.requestId,
    });
  }

  /**
   * YAYINLA — tek uç, tek izin (`bulk.publish`). Panel, AI kartı, kopya ve
   * toplu yayın hepsi buradan; ikinci bir uç yazılırsa ön kontrolün bir
   * adımı onda eksik kalır ve bunu hiçbir ekran göstermez.
   */
  @Post('taslaklar/:id/yayinla')
  @RequirePermissions('bulk.publish')
  yayinla(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(yayinlaSchema)) dto: z.infer<typeof yayinlaSchema>,
  ): Promise<YayinBaslatSonucu> {
    return this.yayin.baslat(ctx, { taslakId: id, ...dto });
  }

  @Get('taslaklar/:id/yayin')
  @RequirePermissions('bulk.read')
  aktifYayin(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<YayinGorunumu | null> {
    return this.yayin.aktif(ctx, id);
  }

  @Get('yayinlar/:id')
  @RequirePermissions('bulk.read')
  yayinOku(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<YayinGorunumu> {
    return this.yayin.oku(ctx, id);
  }

  /** İnsan düğmeleri: kaldığı yerden devam, geri al (arşiv), yeniden kontrol et. */
  @Post('yayinlar/:id/:adim')
  @RequirePermissions('bulk.publish')
  yayinAdimi(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('adim') adim: string,
  ): Promise<YayinGorunumu> {
    const harita = { devam: 'devam', 'geri-al': 'geri_al', 'yeniden-oku': 'yeniden_oku' } as const;
    const a = harita[adim as keyof typeof harita];
    if (!a) throw new BadRequestException('Bilinmeyen adım');
    return this.yayin.adim(ctx, id, a);
  }
}
