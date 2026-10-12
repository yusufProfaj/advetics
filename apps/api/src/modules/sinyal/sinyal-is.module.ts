import { Module } from '@nestjs/common';
import { BildirimTeslimService } from './bildirim-teslim.service';
import { SinyalHesapService } from './sinyal-hesap.service';
import { HaftalikOzetIsModule } from '../haftalik-ozet/haftalik-ozet-is.module';

/**
 * WORKER TARAFI: hesaplama işi ve teslim. Tek içe aldığı modül
 * `HaftalikOzetIsModule` (Paket B ajans özeti teslimden gidiyor) ve o da
 * HİÇBİR modülü içe almıyor; geri kalanı global (Prisma, Crypto, Config).
 * `QueueModule` bunu içe alıyor ve ters yönde bir bağımlılık döngüsel
 * kayıt olurdu. Nest kaydı açılışta patlar,
 * derlemede değil; `sinyal-kayit.spec.ts` kaynak taramasıyla kilitliyor.
 */
@Module({
  imports: [HaftalikOzetIsModule],
  providers: [SinyalHesapService, BildirimTeslimService],
  exports: [SinyalHesapService, BildirimTeslimService],
})
export class SinyalIsModule {}
