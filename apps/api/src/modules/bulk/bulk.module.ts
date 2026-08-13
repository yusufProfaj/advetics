import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { ConnectionsModule } from '../connections/connections.module';
import { BulkController } from './bulk.controller';
import { BulkService } from './bulk.service';

/** Modül 8 — Toplu Oluşturucu. */
@Module({
  imports: [ConnectionsModule, AssetsModule],
  controllers: [BulkController],
  providers: [BulkService],
  exports: [BulkService],
})
export class BulkModule {}
