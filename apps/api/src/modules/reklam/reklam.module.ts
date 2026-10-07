import { Module } from '@nestjs/common';
import { ReklamController } from './reklam.controller';
import { ReklamHazirlikService } from './hazirlik.service';
import { ReklamTaslakService } from './taslak.service';
import { AjansAyariService } from './ajans-ayari.service';
import { ReklamYayinService } from './yayin.service';
import { ReklamKuyrugu } from './reklam-kuyrugu';
import { ReklamAiTaslakService } from './ai-taslak.service';
import { ReklamGorselService } from './gorsel.service';
import { AdvSohbetController } from './sohbet/sohbet.controller';
import { AdvSohbetService } from './sohbet/sohbet.service';
import { AdvOnayService } from './sohbet/onay.service';

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
  controllers: [ReklamController, AdvSohbetController],
  providers: [ReklamHazirlikService, ReklamTaslakService, AjansAyariService, ReklamYayinService, ReklamKuyrugu, ReklamAiTaslakService, ReklamGorselService, AdvSohbetService, AdvOnayService],
  exports: [ReklamKuyrugu],
})
export class ReklamModule {}
