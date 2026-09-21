import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { ConnectionsModule } from '../connections/connections.module';
import { TenancyModule } from '../tenancy/tenancy.module';
import { anthropicClientProvider } from '../ai-assistant/anthropic-client.provider';
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
  /*
   * ANTHROPIC SAĞLAYICISI BURADA DA KAYITLI — `AiAssistantModule` İMPORT
   * EDİLMİYOR.
   *
   * O modül `DraftTreeModule`u import ediyor (asistan taslak kampanya
   * kurabiliyor); ters yönde import etmek döngüsel bağımlılık demekti ve
   * Nest bunu DERLEMEDE değil AÇILIŞTA patlatıyor. Sağlayıcı yalnızca
   * `CONFIG`e bakan bir fabrika, yani ikinci kez kaydetmenin bedeli yok.
   */
  imports: [ConnectionsModule, AssetsModule, TenancyModule],
  controllers: [DraftTreeController, CreativeController],
  providers: [
    DraftTreeService,
    DraftPublishService,
    CreativeService,
    ReklamMetniService,
    anthropicClientProvider,
  ],
  exports: [DraftTreeService, CreativeService],
})
export class DraftTreeModule {}
