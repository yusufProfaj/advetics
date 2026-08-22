import { Global, Module } from '@nestjs/common';
import { ConnectionsModule } from '../modules/connections/connections.module';
import { AutoBoostModule } from '../modules/autoboost/autoboost.module';
import { RulesModule } from '../modules/rules/rules.module';
import { BoostsModule } from '../modules/boosts/boosts.module';
import { InsightsSyncService } from './insights-sync.service';
import { LeadSyncService } from './lead-sync.service';
import { OrganicSyncService } from './organic-sync.service';
import { KeywordSyncService } from './keyword-sync.service';
import { SearchTermSyncService } from './search-term-sync.service';
import { QuotaGuardService } from './quota-guard.service';
import { StructureSyncService } from './structure-sync.service';
import { SyncQueueService } from './sync-queue.service';
import { SyncProcessorService } from './sync-processor.service';

/**
 * Kuyruk ve kota altyapısı.
 *
 * @Global: hem API süreci (iş kuyruğa koymak için) hem worker süreci (işleri
 * tüketmek için) aynı servisleri kullanıyor. İki ayrı entrypoint, tek modül.
 *
 * ConnectionsModule'ü içe alıyoruz (ProviderRegistry + TokenVaultService için).
 * Ters yön YOK ve olmamalı: ConnectionsModule kuyruğa iş koymak istediğinde
 * bu modül @Global olduğu için import etmeye gerek duymuyor — etseydi döngüsel
 * bağımlılık oluşurdu.
 */
@Global()
@Module({
  imports: [AutoBoostModule, ConnectionsModule, RulesModule, BoostsModule],
  providers: [
    QuotaGuardService,
    SyncQueueService,
    SyncProcessorService,
    StructureSyncService,
    InsightsSyncService,
    OrganicSyncService,
    LeadSyncService,
    KeywordSyncService,
    SearchTermSyncService,
  ],
  exports: [
    QuotaGuardService,
    SyncQueueService,
    SyncProcessorService,
    StructureSyncService,
    InsightsSyncService,
    OrganicSyncService,
    LeadSyncService,
    KeywordSyncService,
    SearchTermSyncService,
  ],
})
export class QueueModule {}
