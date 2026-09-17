import { Module } from '@nestjs/common';
import { BoostsModule } from '../boosts/boosts.module';
import { CampaignActionsModule } from '../campaign-actions/campaign-actions.module';
import { ConnectionsModule } from '../connections/connections.module';
import { DraftTreeModule } from '../draft-tree/draft-tree.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { anthropicClientProvider } from './anthropic-client.provider';

@Module({
  /*
   * `BoostsModule` — GÖNDERİ REKLAMI. Asistan gönderiyi kendi yayınlamıyor,
   * canlıda doğrulanmış boost yolunu çağırıyor: ikinci bir yayın yolu
   * yazmak, Instagram medyasının üç kimlik uzayı gibi canlıda öğrenilmiş
   * bilgiyi eksik tekrarlamak olurdu.
   */
  imports: [TenancyModule, ConnectionsModule, DraftTreeModule, CampaignActionsModule, BoostsModule],
  controllers: [AiAssistantController],
  providers: [AiAssistantService, anthropicClientProvider],
})
export class AiAssistantModule {}
