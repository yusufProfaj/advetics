import type { KuralSonucu, UyumGirdisi, UyumMetni } from '../tipler';
import { kalipBul } from '../sozluk';

/** Bütün metinleri yeriyle gezer: satır metinleri satırın anahtarında, plan metni `plan`da. */
export function metinler(g: UyumGirdisi): Array<{ yer: string; m: UyumMetni }> {
  return [
    ...g.satirlar.flatMap((s) => s.metinler.map((m) => ({ yer: s.yer, m }))),
    ...g.planMetinleri.map((m) => ({ yer: 'plan', m })),
  ];
}

/**
 * Sözlük kuralı: her YER için ilk eşleşen kalıbı bir bulguya çevirir.
 * Yer başına tek bulgu: aynı satırda üç kez "garanti" geçmesi üç işaret
 * istemesin; eşleşen kelime mesajda yazılı.
 */
export function sozlukKurali(g: UyumGirdisi, kaliplar: readonly string[], alanlar?: ReadonlyArray<UyumMetni['alan']>): KuralSonucu[] {
  const yerler = new Map<string, KuralSonucu>();
  for (const { yer, m } of metinler(g)) {
    if (alanlar && !alanlar.includes(m.alan)) continue;
    const k = kalipBul(m.metin, kaliplar);
    if (!k) continue;
    const ai = m.uretici === 'ai';
    const once = yerler.get(yer);
    // AI kaynaklı eşleşme öne geçer: seviye onunla sertleşiyor.
    if (!once || (ai && !once.ai)) yerler.set(yer, { yer, durum: 'kaldi', ek: `"${k}" geçiyor`, ai });
  }
  return [...yerler.values()];
}

export const SON_KONTROL = '2026-10-07';
export const YURURLUKTE = '2026-01-01';
