import { Injectable } from '@nestjs/common';
import type { Platform } from '@advetics/shared';
import { GoogleProvider } from './providers/google.provider';
import { MetaProvider } from './providers/meta.provider';
import type { IAdPlatformProvider } from './provider.types';

/**
 * Platform → adapter eşlemesi.
 *
 * Neden ayrı bir sınıf: bu eşlemeye ÜÇ ayrı katman ihtiyaç duyuyor —
 * bağlantı yönetimi (Modül 2), senkronizasyon worker'ları (Modül 3) ve kural
 * motoru (Modül 5). Eşleme `ConnectionsService` içinde private kalırsa
 * `queue/` katmanı bağlantı yönetimine bağımlı hâle gelir; bu, sync'i test
 * etmek için OAuth akışını da ayağa kaldırmak demek olurdu.
 *
 * Kapsam kilidi: `Platform` birleşimi yalnızca `meta` ve `google` içeriyor, bu
 * yüzden `Record` eksiksiz olmak ZORUNDA — üçüncü bir platform eklenirse
 * derleme burada kırılır. Kasıtlı.
 */
@Injectable()
export class ProviderRegistry {
  private readonly byPlatform: Record<Platform, IAdPlatformProvider>;

  constructor(meta: MetaProvider, google: GoogleProvider) {
    this.byPlatform = { meta, google };
  }

  get(platform: Platform): IAdPlatformProvider {
    return this.byPlatform[platform];
  }

  /** Yapılandırılmış (app id/secret girilmiş) platformlar. */
  configured(): IAdPlatformProvider[] {
    return Object.values(this.byPlatform).filter((p) => p.isConfigured());
  }

  all(): IAdPlatformProvider[] {
    return Object.values(this.byPlatform);
  }
}
