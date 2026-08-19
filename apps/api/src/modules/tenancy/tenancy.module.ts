import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { ClientSetupService } from './client-setup.service';
import { ClientChannelsService } from './client-channels.service';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { OrganizationsController } from './organizations.controller';

@Module({
  // ConnectionsModule: kurulum sihirbazı hesap atamasını MEVCUT yoldan
  // yapıyor (izlemeyi açan ve geçmişi kuyruğa alan yol). Ters yön yok —
  // ConnectionsModule TenancyModule'ü içe almıyor, döngü doğmuyor.
  imports: [ConnectionsModule],
  controllers: [
    OrganizationsController,
    ClientsController,
    MembersController,
    BrandingController,
  ],
  providers: [ClientsService, MembersService, BrandingService, ClientSetupService, ClientChannelsService],
  exports: [ClientsService, BrandingService],
})
export class TenancyModule {}
