import { describe, expect, it } from 'vitest';
import { modelGecmisi } from './model-gecmisi';

describe('modelGecmisi', () => {
  it('KRİTİK: cevapsız araç çağrısıyla biten yarım tur geçmişten ATILIR (API reddederdi)', () => {
    const g = modelGecmisi([
      { rol: 'kullanici', icerik: [{ text: 'a' }] },
      { rol: 'asistan', icerik: [{ role: 'model', parts: [{ functionCall: { id: 'x', name: 'hazirlik_oku', args: {} } }] }] },
      { rol: 'kullanici', icerik: [{ text: 'b' }] },
    ]);
    expect(g).toEqual([{ role: 'user', parts: [{ text: 'a' }, { text: 'b' }] }]);
  });

  it('düşünce imzası ve araç sonucu parçaları DÖNÜŞTÜRÜLMEDEN geri gidiyor', () => {
    const parcalar = [{ functionCall: { id: 'c1', name: 'konum_ara', args: {} }, thoughtSignature: 'imza-c1' }];
    const g = modelGecmisi([
      { rol: 'kullanici', icerik: [{ text: 'İzmir' }] },
      {
        rol: 'asistan',
        icerik: [
          { role: 'model', parts: parcalar },
          { role: 'user', parts: [{ functionResponse: { id: 'c1', name: 'konum_ara', response: { hal: 'tamam' } } }] },
          { role: 'model', parts: [{ text: 'tamam' }] },
        ],
      },
    ]);
    expect(JSON.stringify(g)).toContain('"thoughtSignature":"imza-c1"');
    expect(g.map((m) => m.role)).toEqual(['user', 'model', 'user', 'model']);
  });
});
