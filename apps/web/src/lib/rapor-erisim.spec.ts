import { describe, expect, it } from 'vitest';
import {
  COLUMN_TOTALS,
  DEFAULT_COLUMNS,
  GOOGLE_ERISIM_YOK,
  erisimDipnotlari,
  erisimHucresi,
  erisimYok,
  kampanyaTablolari,
  resolveColumns,
  sonucHucresi,
  sumRows,
  tabloNotlari,
  type RaporErisim,
  type ReportCampaignRow,
} from '@advetics/shared';

/**
 * ERİŞİM, FREKANS, BGM VE SONUÇ — panel ve PDF'in PAYLAŞTIĞI karar.
 *
 * Erişim bir süre günlük satırların ORTALAMASIYDI ve "*" ile basılıyordu;
 * Google satırları 0 yazıyordu. Doğru hâl: dönemin tekil erişimi platformdan,
 * alınamazsa "okunamadı", platform vermiyorsa "—" ve sebebi dipnotta.
 */
const olculdu = (reach: number, frequency: number | null = null): RaporErisim => ({ reach, frequency, durum: 'olculdu', neden: null });

function satir(over: Partial<ReportCampaignRow> = {}): ReportCampaignRow {
  return {
    id: 'k',
    name: 'Kampanya',
    status: 'active',
    objective: null,
    impressions: 3000,
    clicks: 30,
    spendMicros: '30000000',
    conversions: 4,
    conversionValueMicros: '0',
    ctr: 1,
    cpc: 1,
    cpm: 10,
    cpa: 7.5,
    roas: null,
    erisim: olculdu(1000, 3),
    erisimKampanyasi: false,
    conversionCounts: { form: 0, message: 0, purchase: 0, calls: 0, calls20s: 0, callClicks: 0 },
    dayCount: 30,
    video: { izlenme: null, okunamadi: false, harcamaMicros: '0', p25: null, p50: null, p75: null, p100: null },
    ...over,
  };
}

describe('erişim hücresi', () => {
  it('KRİTİK: üç hâl üç ayrı metin: sayı / "okunamadı" / "—" — 0 asla uydurulmuyor', () => {
    expect(erisimHucresi('reach', olculdu(12345, 2.5))).toBe('12.345');
    expect(erisimHucresi('frequency', olculdu(12345, 2.5))).toBe('2,50');
    expect(erisimHucresi('reach', erisimYok('okunamadi', 'kota'))).toBe('okunamadı');
    expect(erisimHucresi('frequency', erisimYok('okunamadi', 'kota'))).toBe('okunamadı');
    expect(erisimHucresi('reach', erisimYok('desteklenmiyor', GOOGLE_ERISIM_YOK))).toBe('—');
  });

  it('sonuç: erişim kampanyasında erişim, diğerinde dönüşüm', () => {
    expect(sonucHucresi(satir({ erisimKampanyasi: true, erisim: olculdu(5000, 1.2) }))).toBe('5.000');
    expect(sonucHucresi(satir({ erisimKampanyasi: true, erisim: erisimYok('okunamadi', 'x') }))).toBe('okunamadı');
    expect(sonucHucresi(satir({ erisimKampanyasi: false, conversions: 4 }))).toBe('4');
  });
});

describe('toplam satırı', () => {
  it('KRİTİK: erişim TOPLAMI satırların toplamı DEĞİL, tablonun dönem erişimi', () => {
    // İki satır 1000 + 1000 = 2000 olurdu; hesabın dönem erişimi 1500.
    const t = sumRows([satir(), satir({ id: 'b' })], olculdu(1500));
    expect(COLUMN_TOTALS.reach!(t, 'TRY')).toBe('1.500');
  });

  it('KRİTİK: toplam frekans = toplam gösterim ÷ dönem erişimi', () => {
    // 6000 gösterim ÷ 1500 kişi = 4,00 (satır frekanslarının ortalaması 3 olurdu).
    const t = sumRows([satir(), satir({ id: 'b' })], olculdu(1500));
    expect(COLUMN_TOTALS.frequency!(t, 'TRY')).toBe('4,00');
  });

  it('KRİTİK: dönem erişimi okunamadıysa toplam erişim ve frekans "okunamadı"', () => {
    const t = sumRows([satir()], erisimYok('okunamadi', 'kota'));
    expect(COLUMN_TOTALS.reach!(t, 'TRY')).toBe('okunamadı');
    expect(COLUMN_TOTALS.frequency!(t, 'TRY')).toBe('okunamadı');
  });

  it('BGM toplamı = toplam harcama ÷ toplam gösterim × 1000; sonuç toplanamaz', () => {
    const t = sumRows([satir(), satir({ id: 'b' })], olculdu(1500));
    // 60 ₺ / 6000 × 1000 = 10 ₺
    expect(COLUMN_TOTALS.cpm!(t, 'TRY')).toContain('10');
    expect(COLUMN_TOTALS.result).toBeNull();
  });
});

describe('veriyle açılan erişim sütunları', () => {
  it('KRİTİK: frekans erişim ÖLÇÜLDÜYSE varsayılana eklenir; Google tablosunda eklenmez', () => {
    expect(resolveColumns(undefined, DEFAULT_COLUMNS.meta_campaigns, [satir()])).toContain('frequency');
    const google = satir({ erisim: erisimYok('desteklenmiyor', GOOGLE_ERISIM_YOK) });
    expect(resolveColumns(undefined, DEFAULT_COLUMNS.google_campaigns, [google])).not.toContain('frequency');
  });

  it('KRİTİK: sonuç ve BGM yalnız erişim kampanyası varsa eklenir', () => {
    expect(resolveColumns(undefined, DEFAULT_COLUMNS.meta_campaigns, [satir()])).not.toContain('result');
    const c = resolveColumns(undefined, DEFAULT_COLUMNS.meta_campaigns, [satir(), satir({ id: 'e', erisimKampanyasi: true })]);
    expect(c).toContain('result');
    expect(c).toContain('cpm');
  });

  it('KRİTİK: kullanıcının kendi seçimine erişim sütunu EKLENMEZ', () => {
    expect(resolveColumns(['spend', 'clicks'], DEFAULT_COLUMNS.meta_campaigns, [satir({ erisimKampanyasi: true })])).toEqual([
      'spend',
      'clicks',
    ]);
  });

  it('KRİTİK: Google varsayılanında erişim YOK (Google tekil erişim vermiyor)', () => {
    expect(DEFAULT_COLUMNS.google_campaigns).not.toContain('reach');
  });
});

describe('sonuç tablosu', () => {
  it('KRİTİK: Sonuç ve BGM ANA tabloda değil, ayrı tabloda (ana tabloya binince PDF harcamayı kırpıyordu)', () => {
    const satirlar = [satir(), satir({ id: 'e', erisimKampanyasi: true })];
    const t = kampanyaTablolari(['spend', 'reach', 'frequency', 'result', 'cpm'], satirlar);
    expect(t.ana).toEqual(['spend', 'reach', 'frequency']);
    expect(t.sonuc?.sutunlar).toEqual(['result', 'cpm']);
    // Bütün kampanyalar listede ve kaç tanesinin erişim için kurulduğu yazılı.
    expect(t.sonuc?.satirlar).toHaveLength(2);
    expect(t.sonuc?.aciklama).toContain('2 kampanyadan 1');
    expect(kampanyaTablolari(['spend'], satirlar).sonuc).toBeNull();
  });
});

describe('erişim notları ve dipnotları', () => {
  it('KRİTİK: okunamama sebebi tablonun ÜSTÜNDE, yalnız ilgili platformda', () => {
    const data = { unknownCallActions: [], callClicksErrors: [], erisimHatalari: [{ platform: 'meta' as const, mesaj: 'kota engeli (usage_high)' }] };
    expect(tabloNotlari(data, 'meta_campaigns').join(' ')).toContain('kota engeli (usage_high)');
    expect(tabloNotlari(data, 'google_campaigns').join(' ')).not.toContain('kota');
  });

  it('KRİTİK: Google satırında erişim seçildiyse dipnot "Google tekil erişim vermiyor"', () => {
    const g = satir({ erisim: erisimYok('desteklenmiyor', GOOGLE_ERISIM_YOK) });
    const notlar = erisimDipnotlari(['spend', 'reach'], [g], erisimYok('desteklenmiyor', GOOGLE_ERISIM_YOK));
    expect(notlar).toHaveLength(1);
    expect(notlar[0]).toContain(GOOGLE_ERISIM_YOK);
    // Erişim sütunu yoksa dipnot da yok.
    expect(erisimDipnotlari(['spend'], [g], erisimYok('desteklenmiyor', GOOGLE_ERISIM_YOK))).toEqual([]);
  });
});
