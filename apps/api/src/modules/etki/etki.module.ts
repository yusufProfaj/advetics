import { Module } from '@nestjs/common';
import { EtkiController } from './etki.controller';
import { EtkiService } from './etki.service';

/**
 * Değişiklik etkisi, API tarafı (docs/etki/MIMARI.md). Okuma-yalnız: tek
 * bağımlılık Prisma (global). İş tarafı `EtkiIsModule` (QueueModule içe
 * alıyor).
 *
 * NEST KAYDI AÇILIŞTA PATLAR: `controllers`/`providers` ve AppModule kaydı
 * `etki-kayit.spec.ts` ile kilitli.
 */
@Module({
  controllers: [EtkiController],
  providers: [EtkiService],
})
export class EtkiModule {}
