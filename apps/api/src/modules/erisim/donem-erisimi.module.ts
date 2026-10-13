import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { DonemErisimiService } from './donem-erisimi.service';

/**
 * Dönem erişimi okuyucusu — rapor ve kural motoru AYNI örneği kullanıyor
 * (tek önbellek, tek kota sırası). İki modülde ayrı ayrı `providers`a
 * yazmak iki önbellek demekti: rapor ile kural aynı pencereyi iki kez
 * sorup kotayı iki kez yerdi.
 *
 * QueueModule İÇE ALINMIYOR: `@Global` ve `QuotaGuardService` zaten
 * enjekte edilebiliyor; içe almak QueueModule → RulesModule → bu modül
 * döngüsünü kurardı (rules.module.ts ile aynı gerekçe).
 */
@Module({
  imports: [ConnectionsModule],
  providers: [DonemErisimiService],
  exports: [DonemErisimiService],
})
export class DonemErisimiModule {}
