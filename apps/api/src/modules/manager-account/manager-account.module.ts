import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ManagerAccountController } from './manager-account.controller';
import { ManagerAccountService } from './manager-account.service';

/**
 * NEST MODÜL KAYDI DERLEMEDE DEĞİL AÇILIŞTA PATLIYOR (CLAUDE.md).
 * `ust-hesap-kayit.spec.ts` bu dosyayı kaynak taramasıyla kilitliyor.
 */
@Module({
  imports: [AuditModule],
  controllers: [ManagerAccountController],
  providers: [ManagerAccountService],
  exports: [ManagerAccountService],
})
export class ManagerAccountModule {}
