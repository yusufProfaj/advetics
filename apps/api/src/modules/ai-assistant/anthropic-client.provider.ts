import type { Provider } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { CONFIG, type AppConfig } from '../../config/configuration';

export const ANTHROPIC_CLIENT = 'ANTHROPIC_CLIENT';

/**
 * İstemcinin kullandığımız dar yüzü: testler gerçek SDK'yı kurmadan sahte
 * `{messages:{create}}` verebilsin. Eski AI Asistan servisinde duruyordu;
 * asistan kaldırılınca (2026-10-07) kullananlar (Bilgi Bankası, kitle
 * önerisi) için buraya taşındı.
 */
export interface AnthropicLike {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

/**
 * `Anthropic` istemcisini AYRI bir provider olarak kaydediyoruz —
 * servislerin kendi constructor'ında `new Anthropic(...)`
 * çağırmaması için. Servisler testte gerçek SDK'yı hiç import etmeden, sahte
 * bir istemciyle (`{messages:{create: vi.fn()}}`) kurulabiliyor.
 */
export const anthropicClientProvider: Provider = {
  provide: ANTHROPIC_CLIENT,
  useFactory: (config: AppConfig): Anthropic | null =>
    config.aiAssistant.apiKey ? new Anthropic({ apiKey: config.aiAssistant.apiKey }) : null,
  inject: [CONFIG],
};
