import { Injectable } from '@nestjs/common';
import type { Platform } from '@advetics/shared';
import { GoogleProvider } from './providers/google.provider';
import { LinkedInProvider } from './providers/linkedin.provider';
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
 * `Record<Platform, ...>` EKSİKSİZ OLMAK ZORUNDA ve bu kasıtlı: yeni bir
 * platform eklenince derleme TAM BURADA kırılıyor. 2026-09-07'de LinkedIn
 * eklenirken ağ gerçekten çalıştı — sağlayıcıyı kaydetmeyi unutmak imkânsız
 * oldu.
 *
 * Bu ağın kapsamadığı bir şey var: NEST MODÜL KAYDI. `connections.module.ts`
 * içindeki sağlayıcı listesi eksik kalırsa DERLEME GEÇER, hata AÇILIŞTA
 * gelir ve deploy'un ortasında görünür. `linkedin-kayit.spec.ts` bunu kaynak
 * taramasıyla kilitliyor.
 */
@Injectable()
export class ProviderRegistry {
  private readonly byPlatform: Record<Platform, IAdPlatformProvider>;

  constructor(meta: MetaProvider, google: GoogleProvider, linkedin: LinkedInProvider) {
    this.byPlatform = { meta, google, linkedin };
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
