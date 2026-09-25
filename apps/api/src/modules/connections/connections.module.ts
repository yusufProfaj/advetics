import { Module } from '@nestjs/common';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { MetaWebhookService } from './meta-webhook.service';
import { ProviderRegistry } from './provider.registry';
import { GoogleProvider } from './providers/google.provider';
import { LinkedInProvider } from './providers/linkedin.provider';
import { MetaProvider } from './providers/meta.provider';
import { TokenVaultService } from './token-vault.service';
import { OdemeTetigiModule } from '../alerts/odeme-tetigi.module';

/**
 * Modül 2 — Platform bağlantıları.
 *
 * Provider'lar dışa AÇILIR: Modül 3'ün sync worker'ları ve Modül 5'in kural
 * motoru aynı adapter'ları kullanacak. TokenVaultService de dışa açık —
 * token'a ihtiyaç duyan her katman oradan geçmek zorunda.
 */
@Module({
  // ÖDEME TETİĞİ: hesap durumu yazılan her yol sorunu o an bildiriyor.
  // Ayrı modül çünkü `AlertsModule` zaten bu modüle bağlı (döngü olurdu).
  imports: [OdemeTetigiModule],
  controllers: [ConnectionsController],
  providers: [
    MetaWebhookService,
    ConnectionsService,
    TokenVaultService,
    ProviderRegistry,
    MetaProvider,
    GoogleProvider,
    LinkedInProvider,
  ],
  exports: [ConnectionsService, TokenVaultService, ProviderRegistry],
})
export class ConnectionsModule {}
