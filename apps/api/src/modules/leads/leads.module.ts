import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { QueueModule } from '../../queue/queue.module';
import { LeadgenWebhookService } from './leadgen-webhook.service';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';

/** Potansiyel müşteriler (Lead CRM) + Meta leadgen webhook. */
@Module({
  imports: [ConnectionsModule, QueueModule],
  controllers: [LeadsController],
  providers: [LeadsService, LeadgenWebhookService],
  exports: [LeadsService],
})
export class LeadsModule {}
