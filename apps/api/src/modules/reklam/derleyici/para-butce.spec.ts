import { describe, expect, it } from 'vitest';
import {
  aylikTutardanSecenekler,
  enCokHarcama,
  microsToMinor,
  minorToMicros,
  onKatKontrolu,
  tutarAyristir,
  tutarGoster,
} from '@advetics/shared';

const TL = (n: number) => BigInt(n) * 1_000_000n;

describe('tutarAyristir — Türkçe yazım, float yok', () => {
  it('1.500 bin beş yüz; 1.500,50 kuruşlu; 1500,5 de geçerli', () => {
    expect(tutarAyristir('1.500', 'TRY')).toEqual({ tur: 'tamam', micros: TL(1500) });
    expect(tutarAyristir('1.500,50', 'TRY')).toEqual({ tur: 'tamam', micros: 1_500_500_000n });
    expect(tutarAyristir('1500,5', 'TRY')).toEqual({ tur: 'tamam', micros: 1_500_500_000n });
    expect(tutarAyristir(' 1.234.567 ', 'TRY')).toEqual({ tur: 'tamam', micros: TL(1234567) });
  });

  it('KRİTİK: "1.5" belirsiz — bir buçuk mu bin beş yüz mü — REDDEDİLİR', () => {
    expect(tutarAyristir('1.5', 'TRY').tur).toBe('hata');
    expect(tutarAyristir('1,500.50', 'TRY').tur).toBe('hata');
  });

  it('para biriminin ondalığından fazla basamak girişte reddedilir', () => {
    expect(tutarAyristir('10,505', 'TRY').tur).toBe('hata');
    expect(tutarAyristir('100,5', 'JPY').tur).toBe('hata');
    expect(tutarAyristir('1,125', 'KWD')).toEqual({ tur: 'tamam', micros: 1_125_000n });
  });

  it('boş, sıfır, eksi reddedilir', () => {
    for (const g of ['', '0', '0,00', '-5']) expect(tutarAyristir(g, 'TRY').tur).toBe('hata');
  });
});

describe('micros ↔ Meta birimi', () => {
  it('TRY kuruş, JPY yen, KWD fils', () => {
    expect(microsToMinor(TL(500), 'TRY')).toBe(50_000n);
    expect(microsToMinor(TL(500), 'JPY')).toBe(500n);
    expect(microsToMinor(TL(5), 'KWD')).toBe(5_000n);
  });

  it('KRİTİK: tam bölünmeyen tutar KIRPILMAZ, hata verir', () => {
    expect(() => microsToMinor(1_000_001n, 'TRY')).toThrow(/tam değil/);
  });

  it('gidiş-dönüş tam eşit (geri okumada para kabul edilemez fark sınıfında)', () => {
    for (const m of [TL(1), 1_500_500_000n, TL(999999)]) {
      expect(minorToMicros(microsToMinor(m, 'TRY'), 'TRY')).toBe(m);
    }
  });

  it('gösterim BigInt’ten, Türkçe biçim', () => {
    expect(tutarGoster(1_500_500_000n, 'TRY')).toBe('1.500,50 TL');
    expect(tutarGoster(TL(1234567), 'JPY')).toBe('1.234.567 JPY');
  });
});

describe('enCokHarcama — BTC-05', () => {
  it('KRİTİK: tasarımdaki örnek — günlük 500 TL, 3-23 Kasım 2026: ortalama 10.500, en çok 12.250', () => {
    const r = enCokHarcama(
      { tip: 'gunluk', micros: TL(500), seviye: 'kampanya' },
      { baslangic: '2026-11-03', bitis: '2026-11-23' },
    );
    expect(r.ortalama).toBe(TL(10500));
    expect(r.enCok).toBe(TL(12250));
    expect(r.haftalikTavan).toBe(TL(3500));
  });

  it('tek günlük dönem: 1,75 × D (haftalık tavanın altında)', () => {
    const r = enCokHarcama(
      { tip: 'gunluk', micros: TL(500), seviye: 'kampanya' },
      { baslangic: '2026-11-03', bitis: '2026-11-03' },
    );
    expect(r.enCok).toBe(TL(875));
  });

  it('bitişsiz günlükte "en çok" YOK, ay yaklaşığı ve haftalık tavan var', () => {
    const r = enCokHarcama({ tip: 'gunluk', micros: TL(500), seviye: 'kampanya' }, { baslangic: '2026-11-03', bitis: null });
    expect(r).toEqual({ ortalama: null, enCok: null, haftalikTavan: TL(3500), ayYaklasik: TL(15200) });
  });

  it('toplam bütçede üst sınır T; bitişsiz toplam reddedilir', () => {
    const b = { tip: 'toplam' as const, micros: TL(5000), seviye: 'kampanya' as const };
    expect(enCokHarcama(b, { baslangic: '2026-11-01', bitis: '2026-11-12' }).enCok).toBe(TL(5000));
    expect(() => enCokHarcama(b, { baslangic: '2026-11-01', bitis: null })).toThrow(/bitiş/);
  });

  it('yaz saati geçişini aşan dönemde gün kaymıyor (Avrupa, 25 Ekim 2026)', () => {
    const r = enCokHarcama(
      { tip: 'gunluk', micros: TL(100), seviye: 'kampanya' },
      { baslangic: '2026-10-20', bitis: '2026-10-30' },
    );
    expect(r.ortalama).toBe(TL(1100));
  });
});

describe('aylık seçenekler ve 10 kat', () => {
  it('ayda 20.000 → günlük 657 (aşağı yuvarlanmış), toplam 20.000', () => {
    expect(aylikTutardanSecenekler(TL(20000))).toEqual({ gunlukMicros: TL(657), toplamMicros: TL(20000) });
  });

  it('harcamasız günler sayılmaz; 7 günden az geçmişte koşmaz', () => {
    expect(onKatKontrolu(TL(9000), [TL(800), 0n, 0n, TL(800)])).toEqual({ tur: 'kosmadi' });
    const gecmis = [...Array(7).fill(TL(800)), ...Array(20).fill(0n)];
    expect(onKatKontrolu(TL(8000), gecmis)).toEqual({ tur: 'temiz' });
    expect(onKatKontrolu(TL(9000), gecmis)).toMatchObject({ tur: 'uyari', ortalamaMicros: TL(800) });
  });
});
