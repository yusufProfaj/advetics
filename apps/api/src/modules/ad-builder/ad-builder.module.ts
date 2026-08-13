import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { AssetsModule } from '../assets/assets.module';
import { AdBuilderController } from './ad-builder.controller';
import { AdBuilderService } from './ad-builder.service';
import { AdPublisherService } from './ad-publisher.service';

/** Modül 4 (CREATE) — Reklam Oluşturucu. */
@Module({
  imports: [ConnectionsModule, AssetsModule],
  controllers: [AdBuilderController],
  providers: [AdBuilderService, AdPublisherService],
  exports: [AdBuilderService],
})
export class AdBuilderModule {}
