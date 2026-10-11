import { Module } from '@nestjs/common';
import { OlcumModule } from '../olcum/olcum.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { HazirlamaController } from './hazirlama.controller';
import { HazirlamaService } from './hazirlama.service';

/**
 * HAZIR WORKSPACE. NEST MODÜL KAYDI AÇILIŞTA PATLIYOR: Ölçüm servisi
 * `OlcumModule`den, marka/AI/kitle servisleri `TenancyModule`den; Prisma,
 * Crypto ve Config global. `hazirlama.spec.ts` listeyi kaynak taramasıyla
 * kilitliyor.
 */
@Module({
  imports: [OlcumModule, TenancyModule],
  controllers: [HazirlamaController],
  providers: [HazirlamaService],
})
export class HazirlamaModule {}
