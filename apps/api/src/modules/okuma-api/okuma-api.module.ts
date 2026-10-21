import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { AuditModule } from '../audit/audit.module';
import { BoostsModule } from '../boosts/boosts.module';
import { ConnectionsModule } from '../connections/connections.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { CampaignActionsModule } from '../campaign-actions/campaign-actions.module';
import { FormsModule } from '../forms/forms.module';
import { MetricsModule } from '../metrics/metrics.module';
import { RehberModule } from '../reklam/rehber/rehber.module';
import { McpBoostService } from './mcp-boost.service';
import { McpOnayService } from './mcp-onay.service';
import { McpYazmaService } from './mcp-yazma.service';
import { McpYuklemeController, OkumaApiController, OkumaApiYonetimController } from './okuma-api.controller';
import { OkumaAnahtariService } from './okuma-anahtari.service';
import { OkumaAraclariService } from './okuma-araclari.service';

/**
 * OKUMA API — platform sahibinin MCP kapısı. Kimlik doğrulama tarafı
 * (`OkumaAnahtariDogrulayici`) AuthModule'de: global bekçi onu istiyor.
 * `TenantContextService` AuthModule global olduğu için import gerekmiyor.
 */
@Module({
  // Yazma araçları panelin servislerini çağırıyor (MCP-YAZMA-MIMARI § 3):
  // ikinci bir yazma yolu yok, o yüzden modüller içe alınıyor.
  // Boost (`MCP-BOOST-MIMARI.md`): panelin boost servisi, kitle şablonları ve
  // hedefleme araması; yine ikinci bir yazma yolu yok.
  imports: [AuditModule, MetricsModule, RehberModule, CampaignActionsModule, AssetsModule, FormsModule, BoostsModule, TenancyModule, ConnectionsModule],
  controllers: [OkumaApiYonetimController, OkumaApiController, McpYuklemeController],
  providers: [OkumaAnahtariService, OkumaAraclariService, McpOnayService, McpYazmaService, McpBoostService],
})
export class OkumaApiModule {}
