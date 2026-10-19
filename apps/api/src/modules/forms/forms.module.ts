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
  // Yayıncı MCP yazma araçları için de dışarıda (`form_yayinla`): ikinci bir
  // form yayın yolu yazılmasın, panelin kapıları (sahiplenme, belirsiz hâl,
  // geri okuma) orada da geçerli olsun.
  exports: [FormsService, FormPublisherService],
})
export class FormsModule {}
