import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MetricsModule } from '../metrics/metrics.module';
import { OkumaApiController, OkumaApiYonetimController } from './okuma-api.controller';
import { OkumaAnahtariService } from './okuma-anahtari.service';
import { OkumaAraclariService } from './okuma-araclari.service';

/**
 * OKUMA API — platform sahibinin MCP kapısı. Kimlik doğrulama tarafı
 * (`OkumaAnahtariDogrulayici`) AuthModule'de: global bekçi onu istiyor.
 * `TenantContextService` AuthModule global olduğu için import gerekmiyor.
 */
@Module({
  imports: [AuditModule, MetricsModule],
  controllers: [OkumaApiYonetimController, OkumaApiController],
  providers: [OkumaAnahtariService, OkumaAraclariService],
})
export class OkumaApiModule {}
