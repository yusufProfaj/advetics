import { describe, expect, it } from 'vitest';
import { COLUMN_KEYS, DEFAULT_COLUMNS, resolveColumns } from '@advetics/shared';

/**
 * SÜTUN KARARI PAYLAŞILAN PAKETTE.
 *
 * Aynı rapor iki yerde render ediliyor: panelde HTML, sunucuda PDF. İkisi
 * ayrı listeye baksaydı aynı rapor iki farklı sütun setiyle çıkardı ve farkı
 * müşteriye giden belgede gören olurdu.
 *
 * Bu paket artık KAYNAK TARAMASI DEĞİL, gerçek davranış sınıyor — mantık
 * bileşenin içinden çıkıp dışa açık bir fonksiyona taşındı.
 */
describe('resolveColumns', () => {
  it('seçim varsa o kullanılıyor — SIRASIYLA', () => {
    expect(resolveColumns(['clicks', 'spend'], DEFAULT_COLUMNS.meta_campaigns)).toEqual([
      'clicks',
      'spend',
    ]);
  });

  it('KRİTİK: boş seçim VARSAYILANA dönüyor — boş tablo gösterilmiyor', () => {
    expect(resolveColumns([], DEFAULT_COLUMNS.meta_campaigns)).toEqual([
      ...DEFAULT_COLUMNS.meta_campaigns,
    ]);
    expect(resolveColumns(undefined, DEFAULT_COLUMNS.google_campaigns)).toEqual([
      ...DEFAULT_COLUMNS.google_campaigns,
    ]);
  });

  it('KRİTİK: tanınmayan anahtarlar ELENİYOR', () => {
    // Şablon eski bir metrik adı taşıyorsa belge onu basmaya çalışıp
    // patlamamalı.
    expect(resolveColumns(['spend', 'uydurma'], DEFAULT_COLUMNS.meta_campaigns)).toEqual([
      'spend',
    ]);
  });

  it('hepsi tanınmıyorsa VARSAYILANA dönüyor', () => {
    expect(resolveColumns(['zart', 'zurt'], DEFAULT_COLUMNS.meta_campaigns)).toEqual([
      ...DEFAULT_COLUMNS.meta_campaigns,
    ]);
  });
});

describe('DEFAULT_COLUMNS', () => {
  it('KRİTİK: Google varsayılanında form/mesaj YOK', () => {
    // Google `actions` dizisi döndürmüyor; o sütunlar her zaman 0 çıkardı ve
    // "hiç form gelmedi" diye okunurdu.
    expect(DEFAULT_COLUMNS.google_campaigns).not.toContain('form');
    expect(DEFAULT_COLUMNS.google_campaigns).not.toContain('message');
  });

  it('Meta varsayılanında form ve mesaj VAR', () => {
    expect(DEFAULT_COLUMNS.meta_campaigns).toContain('form');
    expect(DEFAULT_COLUMNS.meta_campaigns).toContain('message');
  });

  it('bütün varsayılan anahtarlar GEÇERLİ sütun anahtarı', () => {
    // Bir varsayılana geçersiz anahtar yazmak, o tablonun sessizce
    // varsayılana dönmesi demek olurdu — sonsuz döngü değil ama yanlış tablo.
    for (const set of Object.values(DEFAULT_COLUMNS)) {
      for (const k of set) {
        expect(COLUMN_KEYS as readonly string[], `${k} geçersiz`).toContain(k);
      }
    }
  });
});
