import { Module } from '@nestjs/common';
import { OdemeMailiGonderici } from './odeme-maili-gonderici.service';
import { OdemeTetigiService } from './odeme-tetigi.service';

/**
 * ÖDEME TETİĞİ AYRI MODÜLDE — ve bu bir döngüyü önlüyor.
 *
 * Tetiği hesap durumunu YAZAN yol (`ConnectionsService`) çağırıyor; özet
 * maili atan `AlertsModule` ise zaten `ConnectionsModule`e bağlı. Tetik
 * `AlertsModule` içinde olsaydı iki modül birbirini çağırırdı ve Nest bunu
 * derlemede değil AÇILIŞTA patlatır. Bu modül yalnızca küresel Prisma ve
 * Crypto'ya dayanıyor; iki taraf da onu içe alıyor.
 */
@Module({
  providers: [OdemeMailiGonderici, OdemeTetigiService],
  exports: [OdemeMailiGonderici, OdemeTetigiService],
})
export class OdemeTetigiModule {}
