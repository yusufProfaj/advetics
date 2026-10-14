import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  kelimeAraSchema,
  kelimeGuncelleSchema,
  metinOnerIstegiSchema,
  onayBaglantisiOlusturSchema,
  stratejiAktarSchema,
  stratejiBolumleriKaydetSchema,
  stratejiEylemSchema,
  stratejiGonderSchema,
  stratejiKalemleriKaydetSchema,
  stratejiSihirbazOlusturSchema,
  stratejiSihirbazKaydetSchema,
  kitleOnerSchema,
  stratejiIncelemeParcasi,
  stratejiOnaySchema,
  stratejiRevizyonSchema,
  stratejiYorumSchema,
  type AktarimOnizlemesi,
  type BaglantiBelgesi,
  type BaglantiListesi,
  type BolumlerGovdesi,
  type Gerceklesen,
  type GonderGovdesi,
  type GonderimSonucu,
  type KalemMetinOnerisi,
  type KelimeAraGirdisi,
  type KelimeGuncelleGirdisi,
  type MetinOnerIstegi,
  type OnayBaglantisiOlusturGirdisi,
  type OnayBaglantisiOlusturuldu,
  type OnayBaglantisiOzeti,
  type RehberinStratejisi,
  type StratejiAktarGirdisi,
  type StratejiAktarimSonucu,
  type StratejiDetayi,
  type StratejiEylemGirdisi,
  type StratejiGirdileri,
  type StratejiKalemleriKaydetGirdisi,
  type StratejiListesi,
  type StratejiSihirbazOlusturGirdisi,
  type StratejiSihirbazKaydetGirdisi,
  type StratejiSihirbazGirdileri,
  type StratejiKitleOnerisi,
  type KitleOnerGirdisi,
  type StratejiIncelemeSatiri,
  type StratejiOnerisi,
  type StratejiRevizyonGirdisi,
  type StratejiYorumlari,
  type TenantContext,
  type YorumGovdesi,
} from '@advetics/shared';
import { CurrentTenant, Public, RequestMetaParam, RequirePermissions } from '../../../common/decorators';
import { zodBody } from '../../../common/pipes/zod-validation.pipe';
import { StratejiV2Service } from './strateji-v2.service';
import { OnayBaglantisiService } from './onay-baglantisi.service';

/**
 * AdvStrategy v2 uçları — `STRATEJI_V2_UCLARI` (packages/shared/src/strateji/v2/adresler.ts)
 * TEK KAYNAK: her (yöntem, yol, izin) üçlüsü o listeyle aynı ve
 * `strateji-v2-uclari.spec.ts` kaynak taramasıyla kilitliyor. Oturumsuz uç
 * YALNIZ ikisi (`/onay/:token`). Gövde şemaları ve yanıt tipleri sözleşmeden;
 * bu dosyada şema ya da tip tanımı yok.
 */
@Controller('strateji/v2')
export class StratejiV2Controller {
  constructor(
    private readonly svc: StratejiV2Service,
    private readonly baglanti: OnayBaglantisiService,
  ) {}

  @Get('planlar')
  @RequirePermissions('strategy.read')
  planlar(@CurrentTenant() ctx: TenantContext, @Query('clientId', ParseUUIDPipe) clientId: string): Promise<StratejiListesi> {
    return this.svc.listele(ctx, clientId);
  }

  @Post('planlar')
  @RequirePermissions('strategy.write')
  olustur(@CurrentTenant() ctx: TenantContext, @Body(zodBody(stratejiSihirbazOlusturSchema)) dto: StratejiSihirbazOlusturGirdisi): Promise<StratejiDetayi> {
    return this.svc.olustur(ctx, dto);
  }

  @Get('sihirbaz-girdileri')
  @RequirePermissions('strategy.write')
  sihirbazGirdileri(@CurrentTenant() ctx: TenantContext, @Query('clientId', ParseUUIDPipe) clientId: string): Promise<StratejiSihirbazGirdileri> {
    return this.svc.sihirbazGirdileri(ctx, clientId);
  }

  @Put('planlar/:id/sihirbaz')
  @RequirePermissions('strategy.write')
  sihirbaz(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(stratejiSihirbazKaydetSchema)) dto: StratejiSihirbazKaydetGirdisi,
  ): Promise<StratejiDetayi> {
    return this.svc.sihirbazKaydet(ctx, id, dto);
  }

  @Post('planlar/:id/kitle-oner')
  @RequirePermissions('strategy.write')
  kitleOner(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(kitleOnerSchema)) dto: KitleOnerGirdisi): Promise<StratejiKitleOnerisi> {
    return this.svc.kitleOner(ctx, id, dto);
  }

  @Get('planlar/:id/inceleme/:parca')
  @RequirePermissions('strategy.write')
  inceleme(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Param('parca') ham: string): Promise<StratejiIncelemeSatiri> {
    const parca = stratejiIncelemeParcasi(ham);
    // Bilinmeyen parça 400 (NEDENİYLE): sessizce boş satır dönmek panelde "okundu" gibi görünürdü.
    if (!parca) throw new BadRequestException(`Bilinmeyen inceleme parçası: ${ham}`);
    return this.svc.inceleme(ctx, id, parca);
  }

  @Get('planlar/:id')
  @RequirePermissions('strategy.read')
  detay(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<StratejiDetayi> {
    return this.svc.detay(ctx, id);
  }

  @Get('planlar/:id/girdiler')
  @RequirePermissions('strategy.write')
  girdiler(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<StratejiGirdileri> {
    return this.svc.girdiler(ctx, id);
  }

  @Post('planlar/:id/oner')
  @RequirePermissions('strategy.write')
  oner(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<StratejiOnerisi> {
    return this.svc.oner(ctx, id);
  }

  @Put('planlar/:id/kalemler')
  @RequirePermissions('strategy.write')
  kalemler(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(stratejiKalemleriKaydetSchema)) dto: StratejiKalemleriKaydetGirdisi,
  ): Promise<StratejiDetayi> {
    return this.svc.kalemleriKaydet(ctx, id, dto);
  }

  @Put('planlar/:id/bolumler')
  @RequirePermissions('strategy.write')
  bolumler(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(stratejiBolumleriKaydetSchema)) dto: BolumlerGovdesi): Promise<StratejiDetayi> {
    return this.svc.bolumleriKaydet(ctx, id, dto);
  }

  @Post('planlar/:id/kalemler/:kalemId/metin-oner')
  @RequirePermissions('strategy.write')
  metinOner(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('kalemId', ParseUUIDPipe) kalemId: string,
    @Body(zodBody(metinOnerIstegiSchema)) dto: MetinOnerIstegi,
  ): Promise<KalemMetinOnerisi> {
    return this.svc.kalemMetinOner(ctx, id, kalemId, dto);
  }

  @Post('planlar/:id/kelime-ara')
  @RequirePermissions('strategy.write')
  kelimeAra(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(kelimeAraSchema)) dto: KelimeAraGirdisi): Promise<StratejiDetayi> {
    return this.svc.kelimeAra(ctx, id, dto);
  }

  @Patch('planlar/:id/kelimeler')
  @RequirePermissions('strategy.write')
  kelimeler(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(kelimeGuncelleSchema)) dto: KelimeGuncelleGirdisi): Promise<StratejiDetayi> {
    return this.svc.kelimeGuncelle(ctx, id, dto);
  }

  /**
   * SİLME (2026-10-14). `strategy.write`: oluşturan yetki silebilir; müşteri
   * hesabı (`client_viewer`) bu yetkiyi taşımıyor. İz denetim kaydında.
   */
  @Delete('planlar/:id')
  @RequirePermissions('strategy.write')
  sil(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<{ id: string }> {
    return this.svc.sil(ctx, id);
  }

  @Post('planlar/:id/eylem')
  @RequirePermissions('strategy.write')
  eylem(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(stratejiEylemSchema)) dto: StratejiEylemGirdisi): Promise<StratejiDetayi> {
    return this.svc.eylem(ctx, id, dto);
  }

  @Post('planlar/:id/onayla')
  @RequirePermissions('strategy.approve')
  onayla(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(stratejiOnaySchema)) dto: { surum: number }): Promise<StratejiDetayi> {
    return this.svc.onayla(ctx, id, dto.surum);
  }

  @Post('planlar/:id/revizyon')
  @RequirePermissions('strategy.approve')
  revizyon(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(stratejiRevizyonSchema)) dto: StratejiRevizyonGirdisi): Promise<StratejiDetayi> {
    return this.svc.revizyon(ctx, id, dto);
  }

  @Get('planlar/:id/yorumlar')
  @RequirePermissions('strategy.read')
  yorumlar(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<StratejiYorumlari> {
    return this.svc.yorumlar(ctx, id);
  }

  @Post('planlar/:id/yorumlar')
  @RequirePermissions('strategy.read')
  yorumYaz(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(stratejiYorumSchema)) dto: YorumGovdesi): Promise<StratejiYorumlari> {
    return this.svc.yorumYaz(ctx, id, dto);
  }

  @Post('planlar/:id/onay-baglantisi')
  @RequirePermissions('strategy.write')
  baglantiOlustur(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(onayBaglantisiOlusturSchema)) dto: OnayBaglantisiOlusturGirdisi,
  ): Promise<OnayBaglantisiOlusturuldu> {
    return this.baglanti.olustur(ctx, id, dto);
  }

  @Get('planlar/:id/onay-baglantilari')
  @RequirePermissions('strategy.write')
  baglantilar(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<BaglantiListesi> {
    return this.baglanti.listele(ctx, id);
  }

  @Post('onay-baglantilari/:baglantiId/iptal')
  @RequirePermissions('strategy.write')
  baglantiIptal(@CurrentTenant() ctx: TenantContext, @Param('baglantiId', ParseUUIDPipe) baglantiId: string): Promise<OnayBaglantisiOzeti> {
    return this.baglanti.iptal(ctx, baglantiId);
  }

  /**
   * OTURUMSUZ — girişsiz onay bağlantısı. `noindex`, `no-store`,
   * `Referrer-Policy: no-referrer`: token YOLDA ve başka siteye ya da önbelleğe
   * sızmamalı. CORS: panel kök alan adı `CORS_ORIGINS`te; çerezsiz istek
   * kimlik bilgisi taşımadığı için ek ayar gerekmiyor.
   */
  @Get('onay/:token')
  @Public()
  async onayBelgesi(@Param('token') token: string, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<BaglantiBelgesi> {
    gizlilikBasliklari(res);
    return this.baglanti.belge(token, req.ip ?? null);
  }

  @Post('onay/:token/karar')
  @Public()
  async onayKarari(@Param('token') token: string, @Body() govde: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<BaglantiBelgesi> {
    gizlilikBasliklari(res);
    // Gövde serviste `baglantiKarariSchema` ile doğrulanıyor: deneme sınırı
    // ve token biçimi GÖVDEDEN ÖNCE sayılmalı (biçimsiz gövdeyle sınırı atlatmak olmasın).
    return this.baglanti.karar(token, govde, { ip: req.ip ?? null, userAgent: req.get?.('user-agent') ?? null });
  }

  @Get('planlar/:id/aktarim-onizleme')
  @RequirePermissions('strategy.read')
  aktarimOnizleme(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<AktarimOnizlemesi> {
    return this.svc.aktarimOnizleme(ctx, id);
  }

  @Post('planlar/:id/aktar')
  @RequirePermissions('strategy.write')
  aktar(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(stratejiAktarSchema)) dto: StratejiAktarGirdisi): Promise<StratejiAktarimSonucu> {
    return this.svc.aktar(ctx, id, dto);
  }

  @Get('planlar/:id/gerceklesen')
  @RequirePermissions('strategy.read')
  gerceklesen(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<Gerceklesen> {
    return this.svc.gerceklesen(ctx, id);
  }

  /** PDF — `@Res` ile ham bayt (Nest'in JSON serileştiricisi Buffer'ı nesneye çevirirdi). Sürüm ZORUNLU. */
  @Get('planlar/:id/pdf')
  @RequirePermissions('strategy.read')
  async pdf(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('surum', ParseIntPipe) surum: number,
    @Res() res: Response,
  ): Promise<void> {
    const { bayt, dosyaAdi } = await this.svc.pdf(ctx, id, surum);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${dosyaAdi}"`);
    res.setHeader('Content-Length', String(bayt.byteLength));
    res.send(bayt);
  }

  @Post('planlar/:id/gonder')
  @RequirePermissions('strategy.write')
  gonder(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(stratejiGonderSchema)) dto: GonderGovdesi,
    @RequestMetaParam() meta: { ip: string | null; userAgent: string | null },
  ): Promise<GonderimSonucu> {
    return this.svc.gonder(ctx, id, dto, meta);
  }
}

/**
 * Rehber ekranının "Stratejiden" kutusu. Yol rehberin altında ama uç
 * strateji modülünde: rehber stratejiyi TANIMIYOR (bağımlılık tek yönlü,
 * rehber modülü → strateji döngüsü yok). Bağlı kalem yoksa `null` (boş gövde).
 */
@Controller('reklam/rehberler')
export class RehberStratejiController {
  constructor(private readonly svc: StratejiV2Service) {}

  @Get(':id/strateji')
  @RequirePermissions('bulk.read')
  strateji(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<RehberinStratejisi | null> {
    return this.svc.rehberStratejisi(ctx, id);
  }
}

function gizlilikBasliklari(res: Response): void {
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
}
