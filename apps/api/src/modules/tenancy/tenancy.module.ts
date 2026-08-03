import { Module } from '@nestjs/common';
import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { OrganizationsController } from './organizations.controller';

@Module({
  controllers: [
    OrganizationsController,
    ClientsController,
    MembersController,
    BrandingController,
  ],
  providers: [ClientsService, MembersService, BrandingService],
  exports: [ClientsService, BrandingService],
})
export class TenancyModule {}
