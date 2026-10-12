import { Module } from '@nestjs/common';
import { EtkiHesapService } from './etki-hesap.service';

/**
 * WORKER TARAFI: keşif + değerlendirme işi. HİÇBİR modülü içe almıyor
 * (Prisma global): `QueueModule` bunu içe alıyor ve ters yönde bir
 * bağımlılık döngüsel kayıt olurdu. Nest kaydı açılışta patlar, derlemede
 * değil; `etki-kayit.spec.ts` kaynak taramasıyla kilitliyor.
 */
@Module({
  providers: [EtkiHesapService],
  exports: [EtkiHesapService],
})
export class EtkiIsModule {}
