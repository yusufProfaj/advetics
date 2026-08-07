import { describe, expect, it } from 'vitest';
import type { BoostCondition } from '@advetics/shared';
import {
  boostMetricValue,
  fitsInCap,
  remainingCapMicros,
  selectPost,
  type PostSnapshot,
  type SelectionContext,
} from './boost-selector';

/**
 * Boost aday seçimi.
 *
 * NEDEN BU TESTLER: Modül 5'in TERSİ asimetri. Orada yanlış karar harcamayı
 * durduruyor, burada BAŞLATIYOR. Yanlış duraklatılan kampanya yeniden açılır;
 * yanlış harcanan para geri gelmez.
 */

const NOW = new Date('2026-08-07T12:00:00Z');

function post(over: Partial<PostSnapshot> = {}): PostSnapshot {
  return {
    postId: 'p1',
    // 24 saat önce — yaş penceresinin ortasında.
    publishedAt: new Date('2026-08-06T12:00:00Z'),
    impressions: 20_000,
    reach: 12_000,
    likes: 400,
    comments: 30,
    shares: 20,
    saves: 50,
    videoViews: 0,
    engagements: 500,
    boostedAt: null,
    ...over,
  };
}

function ctx(over: Partial<SelectionContext> = {}): SelectionContext {
  return {
    conditions: [{ metric: 'engagement_rate', operator: 'gte', value: 4 }],
    combinator: 'and',
    minPostAgeHours: 6,
    maxPostAgeHours: 72,
    now: NOW,
    ...over,
  };
}

describe('boostMetricValue', () => {
  it('etkileşim oranı YÜZDE olarak', () => {
    // 500 / 12.000 = %4,17. Eşik de yüzde giriliyor; ondalık dönseydi
    // "4" eşiği her gönderiyi eşleştirirdi.
    expect(boostMetricValue('engagement_rate', post())).toBeCloseTo(4.1667, 3);
  });

  it('ERİŞİM SIFIRSA oran TANIMSIZ', () => {
    // Sıfır saymak, hiç görülmemiş bir gönderiyi "%0 etkileşim" diye elemek
    // olurdu; oysa doğru cevap "veri yok".
    expect(boostMetricValue('engagement_rate', post({ reach: 0 }))).toBeNull();
  });

  it('mutlak metrikler doğrudan', () => {
    expect(boostMetricValue('likes', post())).toBe(400);
    expect(boostMetricValue('saves', post())).toBe(50);
  });
});

describe('selectPost — yaş penceresi', () => {
  it('ÇOK YENİ gönderi seçilmiyor', () => {
    // İlk saatlerdeki etkileşim gönderinin gerçek performansını temsil
    // etmiyor: takipçilerin ilk dalgası her gönderide benzer.
    const r = selectPost(
      post({ publishedAt: new Date('2026-08-07T09:00:00Z') }),
      ctx({ minPostAgeHours: 6 }),
    );
    expect(r.selected).toBe(false);
    expect(r.skipReason).toBe('too_new');
    expect(r.reason).toContain('beklenmeli');
  });

  it('ÇOK ESKİ gönderi seçilmiyor', () => {
    const r = selectPost(
      post({ publishedAt: new Date('2026-08-01T12:00:00Z') }),
      ctx({ maxPostAgeHours: 72 }),
    );
    expect(r.selected).toBe(false);
    expect(r.skipReason).toBe('too_old');
  });

  it('pencere içindeki gönderi seçilebiliyor', () => {
    expect(selectPost(post(), ctx()).selected).toBe(true);
  });

  it('SINIRDA olan gönderi seçiliyor', () => {
    // Tam 6 saatlik gönderi "en az 6 saat" koşulunu sağlıyor.
    const r = selectPost(
      post({ publishedAt: new Date('2026-08-07T06:00:00Z') }),
      ctx({ minPostAgeHours: 6 }),
    );
    expect(r.selected).toBe(true);
  });
});

describe('selectPost — tekrar boost', () => {
  it('KRİTİK: daha önce boost edilmiş gönderi seçilmiyor', () => {
    // İkinci boost bütçeyi ikiye katlar ve aynı kitleye aynı içeriği
    // tekrar gösterir.
    const r = selectPost(post({ boostedAt: new Date('2026-08-06T18:00:00Z') }), ctx());
    expect(r.selected).toBe(false);
    expect(r.skipReason).toBe('already_boosted');
  });
});

describe('selectPost — koşullar', () => {
  it('eşik altındaki gönderi seçilmiyor', () => {
    const r = selectPost(
      post({ engagements: 100 }), // %0,83
      ctx({ conditions: [{ metric: 'engagement_rate', operator: 'gte', value: 4 }] }),
    );
    expect(r.selected).toBe(false);
    expect(r.skipReason).toBe('conditions_not_met');
  });

  it('AND: hepsi sağlanmalı', () => {
    const conds: BoostCondition[] = [
      { metric: 'engagement_rate', operator: 'gte', value: 4 },
      { metric: 'shares', operator: 'gte', value: 100 },
    ];
    expect(selectPost(post(), ctx({ conditions: conds })).selected).toBe(false);
  });

  it('OR: biri yeterli', () => {
    const conds: BoostCondition[] = [
      { metric: 'engagement_rate', operator: 'gte', value: 4 },
      { metric: 'shares', operator: 'gte', value: 100 },
    ];
    const r = selectPost(post(), ctx({ conditions: conds, combinator: 'or' }));
    expect(r.selected).toBe(true);
    // GEREKÇE yalnızca SAĞLANAN koşulu anıyor.
    expect(r.reason).toContain('Etkileşim oranı');
    expect(r.reason).not.toContain('Paylaşım');
  });

  it('ERİŞİM VERİSİ YOKSA seçilmiyor', () => {
    // Sıfır erişim ya henüz ölçülmemiş ya gerçekten kimseye ulaşmamış.
    // İkisini ayırt edemiyoruz; boost etmek ilkinde erken, ikincisinde
    // yanlış olurdu.
    const r = selectPost(post({ reach: 0 }), ctx());
    expect(r.selected).toBe(false);
    expect(r.skipReason).toBe('no_reach');
  });

  it('gerekçe okunabilir', () => {
    expect(selectPost(post(), ctx()).reason).toBe('Etkileşim oranı % 4,17 ≥ 4');
  });
});

describe('aylık tavan', () => {
  it('kalan tutar taahhütten düşülüyor', () => {
    expect(remainingCapMicros(10_000_000_000n, 3_000_000_000n)).toBe(7_000_000_000n);
  });

  it('tavan AŞILMIŞSA kalan SIFIR, negatif değil', () => {
    expect(remainingCapMicros(10_000_000_000n, 12_000_000_000n)).toBe(0n);
  });

  it('KRİTİK: boost TOPLAM maliyetiyle değerlendiriliyor', () => {
    // 3 günlük 500 ₺/gün = 1.500 ₺ taahhüt. Yalnızca günlük bütçeye
    // bakmak, ay sonunda tavanın üç katına çıkmaya izin verirdi.
    expect(fitsInCap(500_000_000n, 3, 1_000_000_000n)).toBe(false);
    expect(fitsInCap(500_000_000n, 3, 1_500_000_000n)).toBe(true);
  });

  it('KISMİ BOOST YOK — sığmıyorsa açılmıyor', () => {
    // Bütçeyi kalan tutara düşürüp açmak cazip ama yanlış: kuralın
    // tanımladığı günlük bütçe bir performans varsayımı ve onu tek taraflı
    // değiştirmek, kullanıcının kurmadığı bir kampanya açmak olur.
    expect(fitsInCap(500_000_000n, 3, 1_499_999_999n)).toBe(false);
  });
});
