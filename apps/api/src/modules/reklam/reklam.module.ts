import { Module } from '@nestjs/common';
import { ReklamController } from './reklam.controller';
import { ReklamHazirlikService } from './hazirlik.service';
import { ReklamTaslakService } from './taslak.service';
import { AjansAyariService } from './ajans-ayari.service';
import { ReklamYayinService } from './yayin.service';
import { ReklamKuyrugu } from './reklam-kuyrugu';
import { ReklamAiTaslakService } from './ai-taslak.service';
import { ReklamGorselService } from './gorsel.service';

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
/*
 * AdvCampaign SOHBETİ 2026-10-10'da API'den kaldırıldı (karar K-2: yapay
 * zekâ yalnız düğme arkasında; rehber `rehber/rehber.module.ts`). Tabloları
 * (`adv_oturum`, `adv_mesaj`, `adv_onay`) SİLİNMEDİ: veri.
 *
 * EXPORTS: rehber modülü taslak, hazırlık, yayın ve kuyruk servislerini
 * kullanıyor (ikinci bir taslak/yayın yolu yazmadan).
 */
@Module({
  controllers: [ReklamController],
  providers: [ReklamHazirlikService, ReklamTaslakService, AjansAyariService, ReklamYayinService, ReklamKuyrugu, ReklamAiTaslakService, ReklamGorselService],
  exports: [ReklamKuyrugu, ReklamHazirlikService, ReklamTaslakService, ReklamYayinService],
})
export class ReklamModule {}
