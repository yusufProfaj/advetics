import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { AdBuilderController } from './ad-builder.controller';
import { AdBuilderService } from './ad-builder.service';
import { AdPublisherService } from './ad-publisher.service';
import { AssetStorageService } from './asset-storage.service';

/** Modül 4 (CREATE) — Reklam Oluşturucu. */
@Module({
  imports: [ConnectionsModule],
  controllers: [AdBuilderController],
  providers: [AdBuilderService, AdPublisherService, AssetStorageService],
  exports: [AdBuilderService],
})
export class AdBuilderModule {}
