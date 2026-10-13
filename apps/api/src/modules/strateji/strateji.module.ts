import { Module } from '@nestjs/common';
import { StratejiController } from './strateji.controller';
import { StratejiService } from './strateji.service';
import { StratejiKelimeKuyrugu } from './kelime-kuyrugu';
import { RehberModule } from '../reklam/rehber/rehber.module';
import { ReklamModule } from '../reklam/reklam.module';
import { OlcumModule } from '../olcum/olcum.module';
import { ReportsModule } from '../reports/reports.module';
import { StratejiV2Controller, RehberStratejiController } from './v2/strateji-v2.controller';
import { StratejiV2Service } from './v2/strateji-v2.service';
import { OnayBaglantisiService } from './v2/onay-baglantisi.service';

/**
 * AdvStrategy — v1 aylık medya planı (salt okunur, docs/advstrategy/MIMARI.md)
 * ve v2 strateji (docs/advstrategy/YENIDEN-TASARIM.md).
 *
 * v2 BAŞKA İŞ MODÜLLERİNİ İÇE AKTARIYOR — bilerek ve tek yönlü:
 *  - RehberModule: aktarım rehberin KENDİ yazımını (`rehberSatiriEkle`),
 *    kalem metni rehberin metin motorunu, öneri rehberin hazırlığını kullanıyor
 *    (ikinci bir rehber/metin yolu yazılmadı).
 *  - ReklamModule: platform çağrısız hazırlık okuması (`ReklamHazirlikService`).
 *  - OlcumModule: ölçüm hücreleri (motorun "dönüşüm önce" kuralı, riskler).
 *  - ReportsModule: müşteriye gönderim çekirdeği (`RaporGonderService`).
 * Hiçbiri stratejiyi tanımıyor: döngü yok. Nest modül kaydı DERLEMEDE değil
 * AÇILIŞTA patlıyor; `nest-grafigi.spec.ts` grafiği gerçekten çözüyor.
 */
@Module({
  imports: [RehberModule, ReklamModule, OlcumModule, ReportsModule],
  controllers: [StratejiController, StratejiV2Controller, RehberStratejiController],
  providers: [StratejiService, StratejiKelimeKuyrugu, StratejiV2Service, OnayBaglantisiService],
})
export class StratejiModule {}
