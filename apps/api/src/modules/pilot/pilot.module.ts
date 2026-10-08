import { Module } from '@nestjs/common';
import { PilotController } from './pilot.controller';
import { PilotPlanService } from './plan.service';
import { PilotService } from './pilot.service';
import { PilotKurulumKuyrugu } from './kurulum-kuyrugu';
import { PilotGercekYayinService } from './gercek-yayin';
import { PilotBeyanService } from './beyan.service';
import { PilotVarlikService } from './plan-varlik';

/**
 * Pilot — yapay zekâ ile hesap yönetimi (docs/advcampaign/MIMARI.md).
 *
 * BAŞKA BİR İŞ MODÜLÜNÜ İÇE AKTARMIYOR. PrismaService, CONFIG,
 * YAPAY_ZEKA, AuditService ve AssetStorageService (StorageModule) global
 * modüllerden geliyor. Platform çağrıları API sürecinde
 * DEĞİL, worker'da (`worker.ts` → `kurulum-isleyici.ts`); Nest grafiğine
 * yeni bir kenar eklenmiyor (CLAUDE.md "NEST MODÜL KAYDI DERLEMEDE DEĞİL
 * AÇILIŞTA PATLIYOR"; `pilot-kayit.spec.ts` kilitliyor).
 */
@Module({
  controllers: [PilotController],
  providers: [PilotPlanService, PilotService, PilotKurulumKuyrugu, PilotGercekYayinService, PilotBeyanService, PilotVarlikService],
})
export class PilotModule {}
