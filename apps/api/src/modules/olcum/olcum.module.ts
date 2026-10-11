import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { OlcumController } from './olcum.controller';
import { OlcumService } from './olcum.service';

/**
 * ÖLÇÜM KURULUMU (docs/olcum/MIMARI.md).
 *
 * NEST MODÜL KAYDI DERLEMEDE DEĞİL AÇILIŞTA PATLIYOR: `OlcumService`in
 * istediği token kasası ve sağlayıcılar `ConnectionsModule`den; Prisma,
 * Crypto, Audit ve kota bekçisi global modüllerden. `olcum-modulu.spec.ts`
 * bu listeyi kaynak taramasıyla kilitliyor.
 */
@Module({
  imports: [ConnectionsModule],
  controllers: [OlcumController],
  providers: [OlcumService],
})
export class OlcumModule {}
