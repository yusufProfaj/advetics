import { Module } from '@nestjs/common';
import { StratejiController } from './strateji.controller';
import { StratejiService } from './strateji.service';
import { StratejiKelimeKuyrugu } from './kelime-kuyrugu';

/**
 * AdvStrategy — aylık medya planı (docs/advstrategy/MIMARI.md).
 *
 * BAŞKA BİR İŞ MODÜLÜNÜ İÇE AKTARMIYOR. PrismaService ve CONFIG global
 * modüllerden geliyor. Kelime aramasının Google çağrısı API sürecinde
 * DEĞİL, worker'da (`worker.ts`) koşuyor; token kasası ve sağlayıcı oraya
 * `app.get` ile alınıyor. Bu yüzden ConnectionsModule'e bağımlılık yok ve
 * Nest grafiğine yeni bir kenar eklenmiyor (CLAUDE.md "NEST MODÜL KAYDI
 * DERLEMEDE DEĞİL AÇILIŞTA PATLIYOR"; `strateji-modulu.spec.ts` kilitliyor).
 */
@Module({
  controllers: [StratejiController],
  providers: [StratejiService, StratejiKelimeKuyrugu],
})
export class StratejiModule {}
