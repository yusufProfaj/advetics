import type { GeminiIstemcisi } from '../../../yapay-zeka/gemini';
import type { ModelAdimi } from './dongu';

/**
 * Gemini ile tek bir döngü adımı (TASARIM-PLAN § 4.3; yapay zekâ 2026-10-08'de
 * Gemini'ye taşındı).
 *
 * - AKIŞ: metin parçaları geldikçe ekrana gidiyor; araç çağrısı adım bitince
 *   TAM hâliyle okunuyor (yarım girdi çalıştırılmaz).
 * - Düşünme düzeyi `medium` AÇIKÇA: soru seçimi ve metin yazımı biraz akıl
 *   yürütme istiyor; `high` sohbette gecikmeyi kabul edilemez kılardı.
 *   Varsayılana bırakmak, varsayılan değiştiğinde davranışın haber vermeden
 *   kayması demek (CLAUDE.md).
 * - Parçalar dönüştürülmeden döner; düşünce imzaları bir sonraki adıma aynen
 *   gider (gemini.ts).
 */
export function geminiAdimi(istemci: Pick<GeminiIstemcisi, 'akis'>): ModelAdimi {
  return ({ sistem, araclar, mesajlar, enCokCikti, metinParcasi }) =>
    istemci.akis({ sistem, araclar, mesajlar, enCokCikti, dusunme: 'medium' }, metinParcasi);
}
