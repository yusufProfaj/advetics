import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { kalemSecenekleri, yorumKalemEtiketi } from './hesap';

/*
 * ═══ REVİZYON HANGİ KAMPANYA İÇİN (pazar araştırması 2026-10-15) ═══
 * Kalem kimliği sunucuda saklanıyordu ama panel ne gönderiyor ne
 * gösteriyordu: müşteri "şunu değiştirin" dediğinde ajans hangisi
 * olduğunu tahmin ediyordu.
 */
const KAYNAK = readFileSync(join(__dirname, 'onay-kutusu.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('yorumun kampanyası', () => {
  it('KRİTİK: kalemli yorum sırasıyla etiketleniyor, kalemsiz etiketsiz', () => {
    expect(yorumKalemEtiketi(2)).toBe('2. kampanya hakkında');
    expect(yorumKalemEtiketi(null)).toBeNull();
  });

  it('seçenekler belgedeki sırayla', () => {
    const s = kalemSecenekleri([
      { id: 'b', sira: 2, amac: 'FORM' },
      { id: 'a', sira: 1, amac: 'SITE' },
    ]);
    expect(s.map((x) => x.id)).toEqual(['a', 'b']);
    expect(s[0]!.etiket.startsWith('1. ')).toBe(true);
  });

  it('KRİTİK: revizyon ve yorum gövdesi seçilen kalemi taşıyor, liste etiketi gösteriyor', () => {
    expect(KAYNAK).toContain("{ surum, yorum: yorum.trim(), kalemId: kalemId || null }");
    expect(KAYNAK).toContain("{ surum, metin: yorum.trim(), kalemId: kalemId || null }");
    expect(KAYNAK).toContain('yorumKalemEtiketi(y.kalemSira)');
  });
});
