import { Global, Module, type Provider } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config/configuration';
import { GeminiIstemcisi } from './gemini';

export const YAPAY_ZEKA = 'YAPAY_ZEKA';

/**
 * Yapay zekâ istemcisi: anahtar yoksa `null`. Kullanan servisler bunu
 * "asistan bağlı değil" diye SÖYLÜYOR; açılışta patlamak yapay zekâ
 * kullanmayan bütün ekranları da düşürürdü.
 *
 * `@Global`: istemci durumsuz bir HTTP sarmalayıcı; her modülün ayrı import
 * satırı modül döngüsü doğuruyordu (eski Anthropic modülünün dersi:
 * Tenancy → AiAssistant → Tenancy).
 */
const saglayici: Provider = {
  provide: YAPAY_ZEKA,
  useFactory: (c: AppConfig): GeminiIstemcisi | null =>
    c.yapayZeka.apiKey ? new GeminiIstemcisi({ apiKey: c.yapayZeka.apiKey, model: c.yapayZeka.model }) : null,
  inject: [CONFIG],
};

@Global()
@Module({ providers: [saglayici], exports: [saglayici] })
export class YapayZekaModule {}
