import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AppConfigModule } from './config/config.module';
import { CryptoModule } from './crypto/crypto.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConnectionsModule } from './modules/connections/connections.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { HealthController } from './modules/health/health.controller';
import { TenancyModule } from './modules/tenancy/tenancy.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Monorepo kökündeki tek .env — tüm servisler aynı dosyadan beslenir.
      envFilePath: [resolve(__dirname, '../../../.env')],
    }),
    AppConfigModule,
    PrismaModule,
    CryptoModule,
    AuditModule,
    AuthModule,
    TenancyModule,
    QueueModule,
    ConnectionsModule,
  ],
  controllers: [HealthController],
  providers: [
    // Sıra önemlidir: önce kimlik doğrulama (bağlamı kurar),
    // sonra yetki kontrolü (bağlamı okur).
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
