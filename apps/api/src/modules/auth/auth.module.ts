import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TenantContextService } from './tenant-context.service';
import { TokenService } from './token.service';

/**
 * Global çünkü JwtAuthGuard uygulama genelinde APP_GUARD olarak bağlıdır ve
 * bağımlılıklarının her modülden çözülebilmesi gerekir.
 */
@Global()
@Module({
  imports: [JwtModule.register({}), AuditModule],
  controllers: [AuthController],
  providers: [AuthService, TokenService, TenantContextService, JwtAuthGuard],
  exports: [AuthService, TokenService, TenantContextService, JwtAuthGuard],
})
export class AuthModule {}
