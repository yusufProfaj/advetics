import { HttpException, Injectable, Logger } from '@nestjs/common';
import type { TenantContext } from '@advetics/shared';
import { TenantContextService } from '../auth/tenant-context.service';
import { PlatformApiError } from '../connections/provider.types';
import { MetricsService } from '../metrics/metrics.service';
import { AracArgumanHatasi, type AracOrtami, type OkumaAraci } from './okuma-araclari';

/**
 * Araçları Nest dünyasına bağlayan ince katman: kapsam çözümü ve hata metni.
 */
@Injectable()
export class OkumaAraclariService {
  private readonly logger = new Logger(OkumaAraclariService.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * `ctx` anahtarın EV bağlamı — yalnızca KİMİN sorduğunu taşıyor. Kapsam
   * her çağrıda araç argümanından YENİDEN çözülüyor; ev bağlamını
   * kullanmak, argümanı vermeyen çağrıyı istemeden ev şirketine kilitlerdi.
   */
  calistir(ctx: TenantContext, arac: OkumaAraci, args: unknown): Promise<unknown> {
    const ortam: AracOrtami = {
      coz: (s) => this.tenantContext.resolve(ctx.userId, s.workspaceId, s.sirketId, s.ustHesapId),
      metrics: this.metrics,
    };
    return arac.calistir(args, ortam);
  }

  /**
   * Modele gidecek hata cümlesi. "Beklenmeyen bir hata oluştu" bu projede
   * bir turu tamamen kaybettirdi (CLAUDE.md): bilinen her hata türü KENDİ
   * mesajıyla gidiyor; yalnızca gerçekten bilinmeyen hata genel cümleye
   * düşüyor ve ayrıntısı log'da.
   */
  hataMetni(err: unknown, requestId: string): string {
    if (err instanceof AracArgumanHatasi) return `Argüman hatası: ${err.message}`;
    if (err instanceof HttpException) {
      const r = err.getResponse();
      const mesaj =
        typeof r === 'object' && r !== null && 'message' in r
          ? (r as { message: unknown }).message
          : err.message;
      return `HTTP ${err.getStatus()}: ${Array.isArray(mesaj) ? mesaj.join('; ') : String(mesaj)}`;
    }
    if (err instanceof PlatformApiError) return `Platform hatası: ${err.message}`;
    this.logger.error(`Okuma aracı düştü (istek ${requestId}): ${err instanceof Error ? err.stack : String(err)}`);
    return `Beklenmeyen sunucu hatası (istek kimliği ${requestId}). Ayrıntı sunucu günlüğünde.`;
  }
}
