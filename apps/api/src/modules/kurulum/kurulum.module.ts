import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { OlcumModule } from '../olcum/olcum.module';
import { VeriKaynagiModule } from '../veri-kaynagi/veri-kaynagi.module';
import { GtmEnvanterKuyrugu } from './gtm-envanter';
import { KurulumBeyanService } from './kurulum-beyan.service';
import { KurulumController } from './kurulum.controller';
import { KurulumSirketController } from './kurulum-sirket.controller';
import { KurulumService } from './kurulum.service';

/**
 * KURULUM REHBERİ. NEST MODÜL KAYDI AÇILIŞTA PATLIYOR: bağlantı servisi,
 * token kasası ve sağlayıcılar `ConnectionsModule`den, site taraması
 * `OlcumModule`den, mülk kurulunca GA4 okumasını bağlayan servis
 * `VeriKaynagiModule`den (MIMARI Ç-5); Tag Manager envanter kuyruğu bu
 * modülün kendi sağlayıcısı; Prisma, Config ve Audit global. `kurulum.spec.ts`
 * listeyi kaynak taramasıyla kilitliyor.
 */
@Module({
  imports: [ConnectionsModule, OlcumModule, VeriKaynagiModule],
  controllers: [KurulumController, KurulumSirketController],
  // Beyan servisi (sihirbaz, MIMARI § 5) yalnız Prisma ve Audit istiyor; ikisi global.
  providers: [KurulumService, KurulumBeyanService, GtmEnvanterKuyrugu],
})
export class KurulumModule {}
