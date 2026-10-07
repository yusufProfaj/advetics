import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { ConnectionsModule } from '../connections/connections.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { CreativeService } from './creative.service';
import { ReklamMetniService } from './reklam-metni.service';
import { DraftPublishService } from './draft-publish.service';
import { CreativeController, DraftTreeController } from './draft-tree.controller';
import { DraftTreeService } from './draft-tree.service';

/**
 * Kampanya taslağı ağacı — yeniden tasarlanan "Oluştur" bölümünün çekirdeği.
 *
 * `AdBuilderModule` İLE YAN YANA YAŞIYOR. Eski modül yayında ve çalışıyor;
 * ağaç onun yerini alacak ama göç ayrı bir iş (tasarım belgesi K11). İkisini
 * bir anda değiştirmek, çalışan tek yayın yolunu test edilmemiş bir yolla
 * değiştirmek olurdu.
 */
@Module({
  // Yapay zekâ istemcisi global `YapayZekaModule`den geliyor; burada ikinci
  // bir kayıt yok (iki istemci, iki ayrı model yapılandırması demekti).
  imports: [ConnectionsModule, AssetsModule, TenancyModule],
  controllers: [DraftTreeController, CreativeController],
  providers: [
    DraftTreeService,
    DraftPublishService,
    CreativeService,
    ReklamMetniService,
  ],
  exports: [DraftTreeService, CreativeService],
})
export class DraftTreeModule {}
