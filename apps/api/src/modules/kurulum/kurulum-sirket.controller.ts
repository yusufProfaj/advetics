import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { sirketKurulumBeyaniSchema, type SirketKurulumBeyaniIstegi, type SirketKurulumYaniti, type TenantContext } from '@advetics/shared';
import { CurrentTenant, RequireOrgAdmin, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { KurulumBeyanService } from './kurulum-beyan.service';

interface IstekBilgisi {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * ŞİRKET KURULUMU (docs/kurulum-sihirbazi/MIMARI.md § 2a, § 7). Şirket
 * `ctx.orgId` — oturumdaki seçili şirket. Uç bir şirket kimliği ALMIYOR:
 * alsaydı başka şirketin güvenlik kararı adresten yazdırılmaya
 * çalışılabilirdi ve tek savunma RLS kalırdı.
 *
 * Okuma `client.read` (son kontrol ekranı herkese kimin ne dediğini
 * yazıyor); beyan yalnız şirket yöneticisi (`PANEL_KAPILARI
 * ['sirketKurulum.beyan']`; RLS de aynı kuralı taşıyor).
 */
@Controller('kurulum/sirket')
export class KurulumSirketController {
  constructor(private readonly beyan: KurulumBeyanService) {}

  @Get()
  @RequirePermissions('client.read')
  oku(@CurrentTenant() ctx: TenantContext): Promise<SirketKurulumYaniti> {
    return this.beyan.sirketDurumu(ctx);
  }

  @Put('beyan')
  @RequireOrgAdmin()
  beyanYaz(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(sirketKurulumBeyaniSchema)) dto: SirketKurulumBeyaniIstegi,
    @Req() req: IstekBilgisi,
  ): Promise<SirketKurulumYaniti> {
    const ua = req.headers['user-agent'];
    return this.beyan.sirketBeyanYaz(ctx, dto, { ip: req.ip ?? null, userAgent: typeof ua === 'string' ? ua : null });
  }
}
