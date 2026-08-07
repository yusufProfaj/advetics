import { describe, expect, it } from 'vitest';
import type { BulkItemInput } from '@advetics/shared';
import { isPublishable, validateBatch, validateItem } from './bulk-validator';

/**
 * Toplu oluşturma doğrulaması.
 *
 * NEDEN BU TESTLER: bu modülün asıl değeri yayınlamak değil, YAYINLAMADAN
 * ÖNCE DOĞRULAMAK. Doğrulama kaçırırsa 41. satırda patlıyoruz ve 40 reklam
 * oluşmuş, 20 oluşmamış hâlde kalıyoruz. Kısmi başarı, hiç başlamamış
 * olmaktan çok daha pahalı.
 */

function item(over: Partial<BulkItemInput> = {}): BulkItemInput {
  return {
    rowNumber: 1,
    name: 'Reklam 1',
    primaryText: 'Kısa metin',
    headline: 'Başlık',
    description: 'Açıklama',
    linkUrl: 'https://example.com',
    callToAction: 'LEARN_MORE',
    mediaRef: 'img-123',
    ...over,
  } as BulkItemInput;
}

describe('metin sınırları', () => {
  it('geçerli satırda sorun yok', () => {
    expect(validateItem(item())).toEqual([]);
  });

  it('SINIR AŞIMI hata, kaç karakter fazla olduğunu söylüyor', () => {
    // "Çok uzun" demek yeterli değil; kullanıcı kaç karakter kesmesi
    // gerektiğini bilmeli.
    const issues = validateItem(item({ headline: 'x'.repeat(260) }));
    const err = issues.find((i) => i.field === 'headline' && i.severity === 'error');
    expect(err?.message).toContain('5 karakter fazla');
  });

  it('KIRPILMA uyarı, hata DEĞİL', () => {
    // Meta bunu kabul ediyor ama akışta kesiyor. Engellemek, kullanıcının
    // bilinçli tercihini engellemek olurdu.
    const issues = validateItem(item({ headline: 'x'.repeat(50) }));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.severity).toBe('warning');
    expect(issues[0]?.message).toContain('kırpılacak');
    expect(isPublishable(issues)).toBe(true);
  });

  it('TÜM metin alanları boşsa uyarı — sütun kayması işareti', () => {
    const issues = validateItem(
      item({ primaryText: null, headline: null, description: null }),
    );
    expect(issues.some((i) => i.message.includes('kaymış'))).toBe(true);
  });
});

describe('URL', () => {
  it('protokolsüz URL hata', () => {
    const issues = validateItem(item({ linkUrl: 'example.com' }));
    expect(issues[0]?.severity).toBe('error');
    expect(issues[0]?.message).toContain('http://');
  });

  it('KRİTİK: javascript: protokolü reddediliyor', () => {
    // `new URL()` bunu GEÇERLİ sayıyor. Yalnızca ayrıştırmaya bakan bir
    // doğrulama bunu kaçırırdı.
    const issues = validateItem(item({ linkUrl: 'javascript:alert(1)' }));
    expect(issues[0]?.severity).toBe('error');
    expect(issues[0]?.message).toContain('Desteklenmeyen protokol');
  });

  it('mailto: de reddediliyor', () => {
    expect(validateItem(item({ linkUrl: 'mailto:a@b.co' }))[0]?.severity).toBe('error');
  });

  it('http UYARI, hata değil', () => {
    const issues = validateItem(item({ linkUrl: 'http://example.com' }));
    expect(issues[0]?.severity).toBe('warning');
    expect(isPublishable(issues)).toBe(true);
  });
});

describe('eylem düğmesi', () => {
  it('bilinmeyen CTA hata', () => {
    // Meta yalnızca "Invalid parameter" diyor ve hangi alanın sorunlu
    // olduğunu söylemiyor.
    const issues = validateItem(item({ callToAction: 'BUY_STUFF' }));
    expect(issues.some((i) => i.field === 'callToAction' && i.severity === 'error')).toBe(true);
  });

  it('küçük harfli CTA kabul ediliyor', () => {
    expect(validateItem(item({ callToAction: 'learn_more' }))).toEqual([]);
  });

  it('KRİTİK: bağlantı gerektiren CTA URL olmadan hata', () => {
    // Meta bunu bazen kabul edip düğmeyi hiç göstermiyor — sessiz kayıp.
    const issues = validateItem(item({ callToAction: 'SHOP_NOW', linkUrl: null }));
    expect(issues.some((i) => i.field === 'linkUrl' && i.severity === 'error')).toBe(true);
  });

  it('mesajlaşma CTA URL istemiyor', () => {
    expect(validateItem(item({ callToAction: 'WHATSAPP_MESSAGE', linkUrl: null }))).toEqual([]);
  });
});

describe('zorunlu alanlar', () => {
  it('görsel referansı olmadan yayınlanamıyor', () => {
    const issues = validateItem(item({ mediaRef: null }));
    expect(isPublishable(issues)).toBe(false);
  });

  it('boş ad hata', () => {
    expect(isPublishable(validateItem(item({ name: '   ' })))).toBe(false);
  });
});

describe('parti geneli', () => {
  it('MÜKERRER AD uyarısı, satır numaralarıyla', () => {
    // Yapıştırma hatasının en yaygın işareti: aynı satır iki kez kopyalanmış.
    const extra = validateBatch([
      item({ rowNumber: 1, name: 'Yaz Kampanyası' }),
      item({ rowNumber: 2, name: 'Kış Kampanyası' }),
      item({ rowNumber: 3, name: 'yaz kampanyası' }),
    ]);
    expect(extra.get(1)?.[0]?.message).toContain('1, 3');
    expect(extra.get(3)).toBeDefined();
    expect(extra.get(2)).toBeUndefined();
  });

  it('benzersiz adlarda uyarı yok', () => {
    const extra = validateBatch([
      item({ rowNumber: 1, name: 'A' }),
      item({ rowNumber: 2, name: 'B' }),
    ]);
    expect(extra.size).toBe(0);
  });
});

describe('isPublishable', () => {
  it('yalnızca error engelliyor', () => {
    expect(isPublishable([{ field: 'x', severity: 'warning', message: 'y' }])).toBe(true);
    expect(isPublishable([{ field: 'x', severity: 'error', message: 'y' }])).toBe(false);
  });
});
