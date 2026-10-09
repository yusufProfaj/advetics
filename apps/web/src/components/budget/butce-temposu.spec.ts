import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BudgetPacing, BudgetRecord } from '@advetics/shared';
import { asimYuzdesi, sayiEki, tempoCumleleri } from './butce-temposu';

/**
 * AYIN TEMPOSU — cümleler ÇALIŞTIRILARAK sınanıyor. Kart bu dizinin
 * çizimi; kartın onu gerçekten kullandığı en altta kaynak taramasıyla.
 */

const MILYON = 1_000_000n;
const tl = (n: number): string => (BigInt(n) * MILYON).toString();

const butce = (tutarTl: number): BudgetRecord => ({
  id: 'b',
  clientId: 'c',
  adAccountId: null,
  adAccountName: null,
  platform: null,
  month: '2026-10',
  amountMicros: tl(tutarTl),
  currency: 'TRY',
  dailyCapMicros: null,
  alertThresholdPct: 80,
  autoPauseAtPct: null,
  note: null,
  updatedAt: '2026-10-01T00:00:00Z',
});

/** 9 Ekim: 8 gün geçti (dün dâhil), 31 günlük ay. */
const pacing = (ek: Partial<BudgetPacing> = {}): BudgetPacing => ({
  budget: butce(80_000),
  spentMicros: tl(20_000),
  remainingMicros: tl(60_000),
  spentRatio: 0.25,
  elapsedRatio: 8 / 31,
  paceDelta: 0.25 - 8 / 31,
  status: 'on_track',
  suggestedDailyMicros: tl(2_609),
  projectedMicros: tl(77_500),
  throughDate: '2026-10-08',
  monthStart: '2026-10-01',
  monthEnd: '2026-10-31',
  daysElapsed: 8,
  daysTotal: 31,
  daysRemaining: 23,
  daysWithData: 8,
  alertTriggered: false,
  excludedCurrencies: [],
  ...ek,
});

const BUGUN = '2026-10-09';

describe('sayıdan sonraki ek', () => {
  it('KRİTİK: okunuşa göre — "%26’sı", "%31’i", "%10’u", "%100’ü"', () => {
    const beklenen: Record<number, string> = {
      0: 'ı', 1: 'i', 2: 'si', 3: 'ü', 4: 'ü', 5: 'i', 6: 'sı', 7: 'si', 8: 'i', 9: 'u',
      10: 'u', 20: 'si', 26: 'sı', 30: 'u', 31: 'i', 40: 'ı', 50: 'si', 60: 'ı', 70: 'i',
      80: 'i', 90: 'ı', 100: 'ü', 130: 'u', 200: 'ü', 1000: 'i',
    };
    for (const [n, ek] of Object.entries(beklenen)) expect(sayiEki(Number(n)), n).toBe(ek);
  });
});

describe('tempo cümleleri', () => {
  it('KRİTİK: oranlar, tahmin ve günlük öneri', () => {
    const c = tempoCumleleri(pacing(), 'TRY', BUGUN);
    expect(c.map((x) => x.metin)).toEqual([
      'Dün itibarıyla ayın %26’sı geçti, bütçenin %25’i harcandı',
      'Bu hızla ay sonu: 77.500 ₺',
      'Kalan günlerde günde 2.609 ₺ harcanabilir',
    ]);
    expect(c.some((x) => x.uyari)).toBe(false);
  });

  it('KRİTİK: tahmin bütçeyi aşıyorsa uyarı tonu ve aşım yüzdesi', () => {
    const c = tempoCumleleri(pacing({ projectedMicros: tl(87_400) }), 'TRY', BUGUN);
    const tahmin = c[1]!;
    // (87.400 - 80.000) / 80.000 = %9,25 → yukarı: %10
    expect(tahmin.metin).toBe('Bu hızla ay sonu: 87.400 ₺ · bütçeyi %10 aşar');
    expect(tahmin.uyari).toBe(true);
  });

  it('KRİTİK: bütçeyi kuruşla aşan tahmin "%0 aşar" demiyor', () => {
    const c = tempoCumleleri(pacing({ projectedMicros: (80_000n * MILYON + 300_000n).toString() }), 'TRY', BUGUN);
    expect(c[1]!.metin).toContain('bütçeyi %1 aşar');
    expect(c[1]!.uyari).toBe(true);
  });

  it('tahmin tam bütçe ise uyarı yok', () => {
    const c = tempoCumleleri(pacing({ projectedMicros: tl(80_000) }), 'TRY', BUGUN);
    expect(c[1]!.uyari).toBe(false);
  });

  it('bütçe yoksa cümle yok (kart "Tanımla →" diyor)', () => {
    expect(tempoCumleleri(pacing({ budget: null, spentRatio: null }), 'TRY', BUGUN)).toEqual([]);
  });

  it('ayın ilk günü: oran uydurulmuyor, nedeni yazıyor', () => {
    const c = tempoCumleleri(
      pacing({ daysElapsed: 0, elapsedRatio: 0, projectedMicros: null, throughDate: '2026-10-01' }),
      'TRY',
      '2026-10-01',
    );
    expect(c).toEqual([{ metin: 'Ay yeni başladı, tempo yarın hesaplanır', uyari: false }]);
  });

  it('KRİTİK: karışık para biriminde tutar cümlesi YOK, oran var', () => {
    const c = tempoCumleleri(pacing(), null, BUGUN);
    expect(c).toHaveLength(1);
    expect(c[0]!.metin).toContain('harcandı');
    expect(c.map((x) => x.metin).join(' ')).not.toContain('₺');
  });

  it('bütçe dolduysa "günde 0 ₺" yazılmıyor', () => {
    const c = tempoCumleleri(pacing({ suggestedDailyMicros: '0' }), 'TRY', BUGUN);
    expect(c.map((x) => x.metin).join(' ')).not.toContain('harcanabilir');
  });

  it('veri dünde değilse "dün" denmiyor, tarih yazılıyor', () => {
    const c = tempoCumleleri(pacing({ throughDate: '2026-10-05' }), 'TRY', BUGUN);
    expect(c[0]!.metin.startsWith('5 Eki itibarıyla')).toBe(true);
  });

  it('panel metni: uzun tire yok', () => {
    for (const x of tempoCumleleri(pacing({ projectedMicros: tl(90_000) }), 'TRY', BUGUN)) {
      expect(x.metin).not.toContain('—');
    }
  });
});

describe('asimYuzdesi', () => {
  it('KRİTİK: aşım YUKARI yuvarlanıyor — 30 kuruşluk aşım "%0" değil', () => {
    expect(asimYuzdesi(BigInt(tl(10_000)) + 300_000n, BigInt(tl(10_000)))).toBe(1n);
    expect(asimYuzdesi(BigInt(tl(15_000)), BigInt(tl(10_000)))).toBe(50n);
  });

  it('aşmıyorsa ya da bütçe sıfırsa null', () => {
    expect(asimYuzdesi(BigInt(tl(10_000)), BigInt(tl(10_000)))).toBeNull();
    expect(asimYuzdesi(BigInt(tl(5_000)), BigInt(tl(10_000)))).toBeNull();
    expect(asimYuzdesi(BigInt(tl(5_000)), 0n)).toBeNull();
  });
});

/*
 * 2026-10-09: eski `butce-karti.tsx` kalktı; Genel Bakış'ın bütçe kartı
 * onaylanan taslaktan (`taslak/genel-bakis-kartlari.tsx#ButceKarti`) ve
 * tempo satırlarını kendi düzeninde çiziyor. Eski kartın cümle kuralları
 * oraya taşındı.
 */
describe('Genel Bakış bütçe kartı tempo kurallarını taşıyor', () => {
  const KAYNAK = readFileSync(join(__dirname, '..', 'taslak', 'genel-bakis-kartlari.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const KART = KAYNAK.slice(KAYNAK.indexOf('export function ButceKarti'), KAYNAK.indexOf('export function DonusumKarti'));

  it('BOŞA DÜŞME BEKÇİSİ: kart kaynağı okundu', () => {
    expect(KART.length).toBeGreaterThan(1000);
  });

  it('KRİTİK: aşım ORTAK fonksiyondan — yuvarlama iki yerde ayrışmasın', () => {
    expect(KART).toContain('asimYuzdesi(tahmin, BigInt(o.budget.amountMicros))');
    expect(KART).not.toContain('butce - 1n');
  });

  it('KRİTİK: ayın ilk günü tahmin yerine nedeni yazılıyor', () => {
    // Pacing dünde duruyor; 1'inde tahmin boş ya da anlamsız.
    expect(KART).toContain('const yeniBasladi = o.daysElapsed === 0;');
    expect(KART).toContain('Ay yeni başladı, tempo yarın hesaplanır');
    expect(KART).toContain('{!yeniBasladi && birim && tahmin !== null && (');
  });

  it('KRİTİK: dolan bütçede "0 ₺ / gün" yazılmıyor', () => {
    // Sunucu öneriyi 0 gönderiyor; satır düşüyor, durum hapı "Doldu" diyor.
    expect(KART).toContain('o.daysRemaining > 0 && o.suggestedDailyMicros !== null && BigInt(o.suggestedDailyMicros) > 0n');
    expect(KART).toContain('{!yeniBasladi && birim && gunlukVar && (');
  });

  it('karışık para biriminde tutar yazılmıyor', () => {
    expect(KART).toContain('Hesaplarda farklı para birimi var; toplam gösterilemiyor.');
  });
});
