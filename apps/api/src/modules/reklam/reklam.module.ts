import { Module } from '@nestjs/common';
import { ReklamController } from './reklam.controller';
import { ReklamHazirlikService } from './hazirlik.service';
import { ReklamTaslakService } from './taslak.service';
import { AjansAyariService } from './ajans-ayari.service';

/**
 * Yeni Reklam Oluştur modülü (docs/meta-reklam-brief/tasarim/TASARIM.md).
 *
 * BAŞKA BİR İŞ MODÜLÜNÜ İÇE AKTARMIYOR — bilerek. Eski reklam yolları
 * (ad-builder, draft-tree, bulk) Aşama 7'de silinecek; yeni modül onlara
 * bağlıysa silme Nest grafiğini açılışta kırar ve bu derlemede GÖRÜNMEZ
 * (CLAUDE.md "NEST MODÜL KAYDI DERLEMEDE DEĞİL AÇILIŞTA PATLIYOR").
 * PrismaService global modülden geliyor. `reklam-modulu.spec.ts` bu sınırı
 * kaynak taramasıyla kilitliyor.
 */
@Module({
  controllers: [ReklamController],
  providers: [ReklamHazirlikService, ReklamTaslakService, AjansAyariService],
})
export class ReklamModule {}
