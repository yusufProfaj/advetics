import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ConnectionsModule } from '../connections/connections.module';
import { QueueModule } from '../../queue/queue.module';
import { CampaignActionsController } from './campaign-actions.controller';
import { CampaignActionsService } from './campaign-actions.service';

/**
 * Yayınlanmış kampanyada elle tetiklenen aksiyon (bütçe/pause/resume).
 *
 * `RulesModule`'den BAĞIMSIZ: kural motoru kendi toplu akışını kullanıyor
 * (`rule-executor.service.ts`), bu modül tek-kampanya, elle tetiklenen yolu
 * taşıyor. İkisi `IAdPlatformProvider.applyAction`'da buluşuyor.
 */
@Module({
  // `QueueModule` — kampanya KOPYALANDIKTAN sonra yapı taraması kuyruğa
  // alınıyor: kopya platformda var ama `campaigns` tablosuna onu ancak
  // tarama yazıyor ve o altı saatte bir koşuyor.
  imports: [ConnectionsModule, AuditModule, QueueModule],
  controllers: [CampaignActionsController],
  providers: [CampaignActionsService],
  exports: [CampaignActionsService],
})
export class CampaignActionsModule {}
