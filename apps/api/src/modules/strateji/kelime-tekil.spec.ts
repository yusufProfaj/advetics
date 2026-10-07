import { describe, expect, it } from 'vitest';
import { DIGER_GRUBU, kelimeGrubu, kelimeSonucunuHazirla, sadelestir, tekillestir, KELIME_YAZMA_SINIRI, type HamKelimeFikri } from './kelime-tekil';

/**
 * Varyant tekilleştirme — ÇALIŞTIRILARAK. Örnek değerler Ö-1 ölçümünden
 * (2026-10-08, "filtre kahve, french press", Türkçe + Türkiye).
 */
const f = (kelime: string, hacim: string | null, rekabet: string | null = 'HIGH', alt: string | null = '1000000', ust: string | null = '5000000'): HamKelimeFikri => ({
  kelime,
  aylikArama: hacim,
  rekabet,
  teklifAltMicros: alt,
  teklifUstMicros: ust,
});

describe('varyant tekilleştirme', () => {
  it('KRİTİK: aynı metrik + Türkçe sadeleştirmede aynı metin → TEK satır, diğeri varyant', () => {
    const r = tekillestir([f('türk kahve makinesi', '74000'), f('turk kahve makinesi', '74000')]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kelime: 'türk kahve makinesi', varyantlar: ['turk kahve makinesi'], aylikArama: 74000n });
  });

  it('KRİTİK: metrik farklıysa sadeleştirilmiş metin aynı olsa da AYRI satır', () => {
    expect(tekillestir([f('türk kahve makinesi', '74000'), f('turk kahve makinesi', '9900')])).toHaveLength(2);
    expect(tekillestir([f('kahve', '74000', 'HIGH'), f('kahvé', '74000', 'LOW')])).toHaveLength(2);
    expect(tekillestir([f('kahve', '74000', 'HIGH', '1'), f('Kahve', '74000', 'HIGH', '2')])).toHaveLength(1); // ikinci geçiş: aynı lower()
  });

  it('KRİTİK: aynı hacim kovası, FARKLI kelime → ayrı satır (yalnız parmak izi yetmez)', () => {
    expect(tekillestir([f('filtre kahve', '49500'), f('french press', '49500')])).toHaveLength(2);
  });

  it('veritabanı anahtarı: yalnız harf büyüklüğünde ayrışan iki fikir tek satır, yüksek hacim kazanır', () => {
    const r = tekillestir([f('IPHONE', '100', 'LOW'), f('iphone', '5000', 'HIGH')]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kelime: 'iphone', varyantlar: ['IPHONE'], aylikArama: 5000n });
  });

  it('sadeleştirme: Türkçe karakterler ve büyük İ/I', () => {
    expect(sadelestir('  Çay  Şeker ĞÜÖ  ')).toBe('cay seker guo');
    expect(sadelestir('İzmir')).toBe('izmir');
    expect(sadelestir('IĞDIR')).toBe('igdir');
  });

  it('hacim yoksa NULL kalır (sıfır değil); bilinmeyen rekabet NULL; bozuk sayı NULL', () => {
    const [a] = tekillestir([f('x y', null, 'UNSPECIFIED', '12.5', null)]);
    expect(a).toMatchObject({ aylikArama: null, rekabet: null, teklifAltMicros: null, teklifUstMicros: null });
  });

  it('boş ya da sütuna sığmayan fikir yazılmaz', () => {
    expect(tekillestir([f('   ', '10'), f('a'.repeat(81), '10'), f('ok', '10')]).map((s) => s.kelime)).toEqual(['ok']);
  });
});

describe('sırala ve kes', () => {
  it('KRİTİK: hacim azalan, NULL en sonda; toplam KESMEDEN ÖNCEKİ tekil sayı', () => {
    const ham = [f('az', '10'), f('yok', null), f('cok', '90500'), f('orta', '1000'), f('türk kahve', '5'), f('turk kahve', '5')];
    const r = kelimeSonucunuHazirla(ham, 3);
    expect(r.satirlar.map((s) => s.kelime)).toEqual(['cok', 'orta', 'az']);
    expect(r.toplam).toBe(5);
  });

  it('varsayılan sınır sabit; seçim ucunun tek istek sınırının (500) altında', () => {
    const ham = Array.from({ length: 400 }, (_, i) => f(`kelime ${i}`, String(1000 + i)));
    const r = kelimeSonucunuHazirla(ham);
    expect(r.satirlar).toHaveLength(KELIME_YAZMA_SINIRI);
    expect(r.toplam).toBe(400);
    expect(KELIME_YAZMA_SINIRI).toBeLessThanOrEqual(500);
    expect(r.satirlar[0]!.kelime).toBe('kelime 399');
  });
});

describe('kelime gruplama (MIMARI § 6.2)', () => {
  const T = ['kahve makinesi', 'kahve', 'French Press'];
  it('KRİTİK: kelime İÇERDİĞİ EN UZUN tohuma gider; grup adı tohumun kendisi', () => {
    expect(kelimeGrubu('türk kahve makinesi', 100n, T, 1000)).toBe('kahve makinesi');
    expect(kelimeGrubu('filtre kahve', 100n, T, 1000)).toBe('kahve');
    // Sıra bağımsız: kısa tohum önce yazılsa da daha DAR (uzun) olan kazanır.
    expect(kelimeGrubu('türk kahve makinesi', 100n, ['kahve', 'kahve makinesi'], 1000)).toBe('kahve makinesi');
  });

  it('KRİTİK: karşılaştırma Türkçe sadeleştirmeyle (büyük harf ve ç/ş farkı grup ayırmaz)', () => {
    expect(kelimeGrubu('french press fiyat', 10n, T, 1000)).toBe('French Press');
    expect(kelimeGrubu('KAHVE MAKİNESİ', 10n, T, 1000)).toBe('kahve makinesi');
    expect(kelimeGrubu('cay', 10n, ['çay'], 1000)).toBe('çay');
  });

  it('KRİTİK: tohum içermeyen kelime eşik ve üstüyse kendi grubu, altındaysa Diğer; hacmi bilinmeyen Diğer', () => {
    expect(kelimeGrubu('philips espresso', 165000n, T, 1000)).toBe('philips espresso');
    expect(kelimeGrubu('philips espresso', 1000n, T, 1000)).toBe('philips espresso');
    expect(kelimeGrubu('philips espresso', 999n, T, 1000)).toBe(DIGER_GRUBU);
    expect(kelimeGrubu('philips espresso', null, T, 1000)).toBe(DIGER_GRUBU);
  });

  it('eşit uzunlukta ilk yazılan tohum kazanır (kararlı çıktı)', () => {
    expect(kelimeGrubu('abc xyz', 1n, ['abc', 'xyz'], 1000)).toBe('abc');
    expect(kelimeGrubu('abc xyz', 1n, ['xyz', 'abc'], 1000)).toBe('xyz');
  });
});
