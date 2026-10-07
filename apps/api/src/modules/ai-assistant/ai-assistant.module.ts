import { Module } from '@nestjs/common';
import { ConnectionsModule } from '../connections/connections.module';
import { KitleOnerisiController } from './kitle-onerisi.controller';
import { KitleOnerisiService } from './kitle-onerisi.service';

@Module({
  /*
   * AI ASİSTAN SOHBETİ KALDIRILDI (2026-10-07, kullanıcı kararı): reklam
   * oluşturma sohbeti AdvCampaign'e (`modules/reklam`) taşınıyor. Burada
   * yalnız Marka Merkezi'nin "Kitleyi tarif et" önerisi kaldı.
   */
  imports: [ConnectionsModule],
  controllers: [KitleOnerisiController],
  // İstemci `AnthropicModule`de (global): Bilgi Bankası taslağı da aynı
  // istemciyi kullanıyor ve burada tutmak modül döngüsü üretiyordu.
  providers: [KitleOnerisiService],
})
export class AiAssistantModule {}
