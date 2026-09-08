import { Module } from '@nestjs/common';
import { CampaignActionsModule } from '../campaign-actions/campaign-actions.module';
import { ConnectionsModule } from '../connections/connections.module';
import { DraftTreeModule } from '../draft-tree/draft-tree.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { AiAssistantController } from './ai-assistant.controller';
import { AiAssistantService } from './ai-assistant.service';
import { anthropicClientProvider } from './anthropic-client.provider';

@Module({
  imports: [TenancyModule, ConnectionsModule, DraftTreeModule, CampaignActionsModule],
  controllers: [AiAssistantController],
  providers: [AiAssistantService, anthropicClientProvider],
})
export class AiAssistantModule {}
