import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { GenelBakisController } from './genel-bakis.controller';
import { GenelBakisService } from './genel-bakis.service';

/**
 * Yalnızca okuma ve yalnızca Prisma. Bütçe, Boost ve strateji modüllerini
 * İÇE ALMIYOR: ihtiyaç duyulan şey onların servisleri değil tabloları ve
 * sabitleri; servis içe almak, bir okuma kutusu için o modüllerin bütün
 * bağımlılık zincirini (kuyruk, bağlantılar) açılışa bağlardı.
 */
@Module({
  imports: [PrismaModule],
  controllers: [GenelBakisController],
  providers: [GenelBakisService],
})
export class GenelBakisModule {}
