import { Global, Module } from '@nestjs/common';
import { AlertsModule } from '../modules/alerts/alerts.module';
import { ConnectionsModule } from '../modules/connections/connections.module';
import { AutoBoostModule } from '../modules/autoboost/autoboost.module';
import { ReportsModule } from '../modules/reports/reports.module';
import { RulesModule } from '../modules/rules/rules.module';
import { BoostsModule } from '../modules/boosts/boosts.module';
import { SinyalIsModule } from '../modules/sinyal/sinyal-is.module';
import { EtkiIsModule } from '../modules/etki/etki-is.module';
import { InsightsSyncService } from './insights-sync.service';
import { LeadSyncService } from './lead-sync.service';
import { OrganicSyncService } from './organic-sync.service';
import { KeywordSyncService } from './keyword-sync.service';
import { KirilimSyncService } from './kirilim-sync.service';
import { SearchTermSyncService } from './search-term-sync.service';
import { QuotaGuardService } from './quota-guard.service';
import { StructureSyncService } from './structure-sync.service';
import { SyncQueueService } from './sync-queue.service';
import { SyncProcessorService } from './sync-processor.service';
import { GeriBeslemeGonderimService } from '../modules/geri-besleme/geri-besleme-gonderim.service';
import { VeriKaynagiIsService } from '../modules/veri-kaynagi/veri-kaynagi-is.service';

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
  imports: [AutoBoostModule, ConnectionsModule, RulesModule, BoostsModule, AlertsModule, ReportsModule, SinyalIsModule, EtkiIsModule],
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
    KirilimSyncService,
    /*
     * Paket E gönderim işi BURADA, kendi modülünde değil: kota bekçisine
     * (bu modül) ve bağlantı kasasına (ConnectionsModule, zaten içe alınmış)
     * bağımlı; ayrı bir modül olup buraya içe alınsaydı kota bekçisini bu
     * modülden istemek döngü kurardı (LeadSyncService ile aynı yer).
     */
    GeriBeslemeGonderimService,
    /*
     * Paket F — veri kaynağı işleri. BURADA, ayrı bir modülde değil: kuyruk
     * ve kota bekçisine bağlı ve QueueModule'ü içe alan bir modül döngüsel
     * kayıt olurdu (SinyalIsModule notu). Bağımlılıkları (TokenVault,
     * ProviderRegistry) ConnectionsModule'den geliyor. Nest kaydı AÇILIŞTA
     * patlar: `veri-kaynagi-kayit.spec.ts` kaynak taramasıyla kilitliyor.
     */
    VeriKaynagiIsService,
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
