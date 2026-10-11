import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { OlcumModule } from '../olcum/olcum.module';
import { KurulumController } from './kurulum.controller';
import { KurulumService } from './kurulum.service';

/**
 * KURULUM REHBERİ. NEST MODÜL KAYDI AÇILIŞTA PATLIYOR: bağlantı servisi,
 * token kasası ve sağlayıcılar `ConnectionsModule`den, site taraması
 * `OlcumModule`den; Prisma, Config ve Audit global. `kurulum.spec.ts`
 * listeyi kaynak taramasıyla kilitliyor.
 */
@Module({
  imports: [ConnectionsModule, OlcumModule],
  controllers: [KurulumController],
  providers: [KurulumService],
})
export class KurulumModule {}
