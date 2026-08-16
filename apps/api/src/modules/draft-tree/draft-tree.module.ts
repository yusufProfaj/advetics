import { Module } from '@nestjs/common';
import { DraftTreeController } from './draft-tree.controller';
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
  controllers: [DraftTreeController],
  providers: [DraftTreeService],
  exports: [DraftTreeService],
})
export class DraftTreeModule {}
