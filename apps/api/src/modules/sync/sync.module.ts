import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue/queue.module';
import { SyncController } from './sync.controller';

/**
 * Panelden senkronizasyon tetikleme.
 *
 * AYRI MODÜL ve bunun sebebi somut: uç nokta doğal olarak ConnectionsModule'e
 * aitmiş gibi duruyor ama o modül QueueModule'ü almıyor ve almaya zorlamak
 * döngüsel bağımlılık riski taşıyordu — QueueModule provider'ları için
 * bağlantı katmanına bakıyor. İnce bir modül, `forwardRef` ile uğraşmaktan
 * ucuz; `forwardRef` ihtiyacı genelde yanlış yerleştirilmiş bir bağımlılığın
 * işareti.
 */
@Module({
  imports: [QueueModule],
  controllers: [SyncController],
})
export class SyncModule {}
