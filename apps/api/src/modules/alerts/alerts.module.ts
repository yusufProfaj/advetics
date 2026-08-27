import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { CryptoModule } from '../../crypto/crypto.module';
import { ConnectionsModule } from '../connections/connections.module';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { HesapDurumuKontrolService } from './hesap-durumu-kontrol.service';

/**
 * `forwardRef` KUYRUK YÜZÜNDEN DEĞİL, BAĞLANTILAR YÜZÜNDEN: kontrol servisi
 * `ConnectionsService`i çağırıyor ve kuyruk modülü de bu modülü çağırıyor.
 * Döngü olmadığından emin olmak için ikisi de tembel çözülüyor.
 */
@Module({
  imports: [PrismaModule, CryptoModule, forwardRef(() => ConnectionsModule)],
  controllers: [AlertsController],
  providers: [AlertsService, HesapDurumuKontrolService],
  exports: [HesapDurumuKontrolService],
})
export class AlertsModule {}
