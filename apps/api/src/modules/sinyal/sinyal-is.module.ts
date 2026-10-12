import { Module } from '@nestjs/common';
import { BildirimTeslimService } from './bildirim-teslim.service';
import { SinyalHesapService } from './sinyal-hesap.service';

/**
 * WORKER TARAFI: hesaplama işi ve teslim. HİÇBİR modülü içe almıyor
 * (Prisma, Crypto, Config global): `QueueModule` bunu içe alıyor ve ters
 * yönde bir bağımlılık döngüsel kayıt olurdu. Nest kaydı açılışta patlar,
 * derlemede değil; `sinyal-kayit.spec.ts` kaynak taramasıyla kilitliyor.
 */
@Module({
  providers: [SinyalHesapService, BildirimTeslimService],
  exports: [SinyalHesapService, BildirimTeslimService],
})
export class SinyalIsModule {}
