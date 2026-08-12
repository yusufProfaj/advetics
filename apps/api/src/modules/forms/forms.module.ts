import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { FormPublisherService } from './form-publisher.service';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';

/** Formlar kütüphanesi — Meta Anlık Form. */
@Module({
  imports: [ConnectionsModule],
  controllers: [FormsController],
  providers: [FormsService, FormPublisherService],
  exports: [FormsService],
})
export class FormsModule {}
