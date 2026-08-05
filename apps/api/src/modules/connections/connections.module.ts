import { Module } from '@nestjs/common';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { MetaWebhookService } from './meta-webhook.service';
import { GoogleProvider } from './providers/google.provider';
import { MetaProvider } from './providers/meta.provider';
import { TokenVaultService } from './token-vault.service';

/**
 * Modül 2 — Platform bağlantıları.
 *
 * Provider'lar dışa AÇILIR: Modül 3'ün sync worker'ları ve Modül 5'in kural
 * motoru aynı adapter'ları kullanacak. TokenVaultService de dışa açık —
 * token'a ihtiyaç duyan her katman oradan geçmek zorunda.
 */
@Module({
  controllers: [ConnectionsController],
  providers: [
    MetaWebhookService,ConnectionsService, TokenVaultService, MetaProvider, GoogleProvider],
  exports: [ConnectionsService, TokenVaultService, MetaProvider, GoogleProvider],
})
export class ConnectionsModule {}
