import type { Provider } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { CONFIG, type AppConfig } from '../../config/configuration';

export const ANTHROPIC_CLIENT = 'ANTHROPIC_CLIENT';

/**
 * `Anthropic` istemcisini AYRI bir provider olarak kaydediyoruz —
 * `AiAssistantService`in kendi constructor'ında `new Anthropic(...)`
 * çağırmaması için. Servis testte gerçek SDK'yı hiç import etmeden, sahte
 * bir istemciyle (`{messages:{create: vi.fn()}}`) doğrudan `new
 * AiAssistantService(...)` ile kurulabiliyor.
 */
export const anthropicClientProvider: Provider = {
  provide: ANTHROPIC_CLIENT,
  useFactory: (config: AppConfig): Anthropic | null =>
    config.aiAssistant.apiKey ? new Anthropic({ apiKey: config.aiAssistant.apiKey }) : null,
  inject: [CONFIG],
};
