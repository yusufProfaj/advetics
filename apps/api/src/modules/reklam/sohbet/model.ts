import Anthropic from '@anthropic-ai/sdk';
import { REKLAM_AI_MODELI } from '../ai-taslak.service';
import type { ModelAdimi } from './dongu';

/**
 * Claude ile tek bir döngü adımı (TASARIM-PLAN § 4.3).
 *
 * - Model tek kaynaktan (`REKLAM_AI_MODELI`, Opus 5.5).
 * - AKIŞ: metin parçaları geldikçe ekrana gidiyor; araç girdisi akışta
 *   değil, adım bitince tam hâliyle okunuyor (yarım JSON çalıştırılmaz).
 * - Uyarlanabilir düşünme + `effort: medium`: soru seçimi ve metin yazımı
 *   bir miktar akıl yürütme istiyor, ama her adımda yüksek çaba gecikmeyi
 *   sohbet için kabul edilemez kılardı.
 * - Sistem istemi ve araç tanımları ÖNBELLEKTE (`cache_control`): her turda
 *   aynılar; önbelleksiz her adım tam istem kadar girdi faturası demek.
 * - Ret sınıflandırıcısı isteği reddederse sunucu tarafı yedek zinciri
 *   (`fallbacks: 'default'`) aynı çağrıda devreye giriyor (mevcut desen).
 *
 * Düşünme blokları geçmişte DEĞİŞTİRİLMEDEN kalıyor (kayıt `icerik`i ham
 * saklıyor): değiştirilmiş blok bir sonraki adımda reddedilirdi.
 */
export function claudeAdimi(istemci: Anthropic): ModelAdimi {
  return async ({ sistem, araclar, mesajlar, enCokCikti, metinParcasi }) => {
    const tanimlar = araclar.map((a, i) => (i === araclar.length - 1 ? { ...a, cache_control: { type: 'ephemeral' as const } } : a));
    const akis = istemci.beta.messages.stream({
      model: REKLAM_AI_MODELI,
      max_tokens: enCokCikti,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: [{ type: 'text', text: sistem, cache_control: { type: 'ephemeral' } }],
      tools: tanimlar as never,
      messages: mesajlar as never,
    } as never);
    akis.on('text', (p: string) => metinParcasi(p));
    const m = await akis.finalMessage();
    return {
      content: m.content as unknown as Array<Record<string, unknown>>,
      stop_reason: m.stop_reason,
      girdiToken: m.usage.input_tokens,
      ciktiToken: m.usage.output_tokens,
      onbellekToken: (m.usage.cache_read_input_tokens ?? 0) + (m.usage.cache_creation_input_tokens ?? 0),
    };
  };
}
