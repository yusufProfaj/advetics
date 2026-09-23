import { Global, Module } from '@nestjs/common';
import { anthropicClientProvider } from './anthropic-client.provider';

/**
 * ═══ ANTHROPIC İSTEMCİSİ AYRI BİR MODÜLDE ═══
 *
 * İstemci `AiAssistantModule` içindeydi ve o modül `TenancyModule`i import
 * ediyor. Bilgi Bankası taslağı da aynı istemciye ihtiyaç duyunca
 * `TenancyModule → AiAssistantModule → TenancyModule` DÖNGÜSÜ doğdu.
 *
 * Nest modül grafiği DERLEMEDE DEĞİL AÇILIŞTA çözülüyor: döngü `nest build`
 * ile fark edilmez, hata deploy'un ortasında görünür. `forwardRef` ile
 * susturmak da çözüm değil — bağımlılığı gizler, kaldırmaz.
 *
 * `@Global`: istemci durumsuz bir HTTP sarmalayıcı ve iki ayrı örnek
 * tutmanın kazancı yok; her modülün ayrı import satırı yazması ise bu
 * bağımlılığı görünmez kılardı.
 */
@Global()
@Module({
  providers: [anthropicClientProvider],
  exports: [anthropicClientProvider],
})
export class AnthropicModule {}
