import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { AssetUploaderService } from './asset-uploader.service';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';

/** Varlık arşivi (BASE). */
@Module({
  imports: [ConnectionsModule],
  controllers: [AssetsController],
  providers: [AssetsService, AssetUploaderService],
  exports: [AssetsService, AssetUploaderService],
})
export class AssetsModule {}
