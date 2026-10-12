import { Module } from '@nestjs/common';
import { GenelBakisService } from '../genel-bakis/genel-bakis.service';
import { OzetService } from './ozet.service';

/**
 * HAFTALIK ÖZETİN ÇEKİRDEĞİ: üret, sakla, oku. HİÇBİR modülü içe almıyor
 * (Prisma, Config, Yapay zekâ global): bunu içe alanlar `ReportsModule`
 * (müşteri planı) ve `SinyalIsModule` (ajans kanalı) ve ikisi de
 * `QueueModule`ün altında. Ters yönde tek bir içe alma döngüsel kayıt
 * olurdu ve Nest kaydı derlemede değil AÇILIŞTA patlar
 * (`haftalik-ozet-kayit.spec.ts` kaynak taramasıyla kilitliyor).
 *
 * `GenelBakisService` BURADA AYRI BİR ÖRNEK: durumsuz bir okuma servisi ve
 * yalnız Prisma + Config istiyor; `GenelBakisModule`ü içe almak onun
 * denetleyicisini de bu modülün altına kaydederdi.
 */
@Module({
  providers: [OzetService, GenelBakisService],
  exports: [OzetService],
})
export class HaftalikOzetIsModule {}
