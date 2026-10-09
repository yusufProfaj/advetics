import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../../connections/connections.module';
import { AutoBoostModule } from '../../autoboost/autoboost.module';
import { ReklamModule } from '../reklam.module';
import { RehberController } from './rehber.controller';
import { RehberService } from './rehber.service';

/**
 * ADVCAMPAIGN REHBERİ (docs/advcampaign/MIMARI-REHBER.md).
 *
 * AYRI MODÜL, çünkü Google'a gidiyor: token kasası ve Google sağlayıcısı
 * `ConnectionsModule`de. `ReklamModule` bilerek hiçbir iş modülünü içe
 * aktarmıyor (eski reklam yolları silinince grafiği kırılmasın); rehber onu
 * ve bağlantı modülünü içe aktarıyor, tersi değil.
 *
 * NEST MODÜL KAYDI DERLEMEDE DEĞİL AÇILIŞTA PATLIYOR: `RehberService`in
 * istediği her sağlayıcı ya buradaki `imports`tan ya global modüllerden
 * (Prisma, Crypto, Config, YapayZeka, Queue/QuotaGuard) gelmeli.
 * `rehber-modulu.spec.ts` bu listeyi kaynak taramasıyla kilitliyor.
 */
@Module({
  // AutoBoostModule: YouTube kanalının video listesi (`YouTubeApiService`,
  // Akıllı Boost'un okuma kodu; ikinci bir YouTube istemcisi yazılmadı).
  imports: [ConnectionsModule, ReklamModule, AutoBoostModule],
  controllers: [RehberController],
  providers: [RehberService],
})
export class RehberModule {}
