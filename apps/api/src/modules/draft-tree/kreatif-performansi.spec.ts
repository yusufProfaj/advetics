import { describe, expect, it } from 'vitest';
import { siralaKreatifler, YETERLI_GOSTERIM, type KreatifOlcumu } from './kreatif-performansi';

/**
 * Bu sıralamanın yanlış olması SESSİZ: kullanıcı listenin başındaki kreatife
 * benzeyen bir reklam kurar ve neden çalışmadığını hiç öğrenemez.
 */
const olcum = (id: string, impressions: number, clicks: number, spend = 0): KreatifOlcumu => ({
  creativeId: id,
  impressions,
  clicks,
  conversions: 0,
  spendMicros: BigInt(spend),
});

describe('yeterli örnek', () => {
  it('KRİTİK: üç gösterimlik kreatif listeye GİRMİYOR', () => {
    /*
     * 3 gösterim / 1 tıklama = %33 CTR. Eşik olmasaydı bu satır listenin
     * başına otururdu ve "en iyi kreatif" diye okunurdu.
     */
    const { siralanan } = siralaKreatifler([olcum('gürültü', 3, 1), olcum('gerçek', 10_000, 200)]);
    expect(siralanan.map((s) => s.creativeId)).toEqual(['gerçek']);
  });

  it('KRİTİK: elenen kreatif SAYILIYOR — sessiz kesme yok', () => {
    const { yetersiz } = siralaKreatifler([
      olcum('a', 3, 1),
      olcum('b', 10, 2),
      olcum('c', 10_000, 100),
    ]);
    expect(yetersiz).toBe(2);
  });

  it('eşiğin TAM ÜSTÜ giriyor', () => {
    // Sınırın hangi tarafta olduğu belirsiz kalmasın.
    const { siralanan } = siralaKreatifler([olcum('sinir', YETERLI_GOSTERIM, 10)]);
    expect(siralanan).toHaveLength(1);
  });
});

describe('sıralama', () => {
  it('KRİTİK: CTR büyükten küçüğe', () => {
    const { siralanan } = siralaKreatifler([
      olcum('düşük', 10_000, 100),
      olcum('yüksek', 10_000, 400),
    ]);
    expect(siralanan.map((s) => s.creativeId)).toEqual(['yüksek', 'düşük']);
    expect(siralanan[0]!.ctr).toBeCloseTo(4, 5);
  });

  it('KRİTİK: eşit CTR’de HARCAMASI BÜYÜK olan önce', () => {
    // Aynı CTR'de daha çok para harcamış kreatif daha çok sınanmış demek.
    const { siralanan } = siralaKreatifler([
      olcum('az', 10_000, 100, 1_000_000),
      olcum('çok', 10_000, 100, 9_000_000),
    ]);
    expect(siralanan.map((s) => s.creativeId)).toEqual(['çok', 'az']);
  });

  it('liste KESİLİYOR', () => {
    const cok = Array.from({ length: 20 }, (_, i) => olcum(`k${i}`, 10_000, 100 + i));
    expect(siralaKreatifler(cok, 6).siralanan).toHaveLength(6);
  });

  it('DÖNÜŞÜM sıralamaya girmiyor', () => {
    /*
     * Her müşteride dönüşüm takibi kurulu değil; kurulu olmayan hesapta
     * dönüşüm her zaman sıfır ve ona göre sıralamak listeyi rastgele yapardı.
     */
    const a = { ...olcum('ctr-yüksek', 10_000, 400), conversions: 0 };
    const b = { ...olcum('dönüşüm-yüksek', 10_000, 100), conversions: 50 };
    expect(siralaKreatifler([a, b]).siralanan[0]!.creativeId).toBe('ctr-yüksek');
  });
});
