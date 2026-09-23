import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { donusAdresi } from './connections.service';

/**
 * OAUTH DÖNÜŞ ADRESİ — kurulum sihirbazı kendi adımını sorguda taşıyor.
 *
 * Sonuç parametreleri elle `?` ile ekleniyordu. Dönüş yolu zaten bir sorgu
 * taşıyınca (`/kurulum?tur=sirket&adim=baglantilar`) ikinci bir `?` doğuyor,
 * tarayıcı onu `adim` değerinin parçası sayıyor ve kullanıcı bağlandıktan
 * sonra sihirbazın BAŞINA dönüyordu. Hata yok, yalnızca yanlış ekran.
 */
const KAYNAK = readFileSync(resolve(__dirname, 'connections.service.ts'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

describe('donusAdresi', () => {
  it('sorgusuz yola `?` ile ekliyor', () => {
    expect(donusAdresi('/ayarlar/baglantilar', 'connection=basarili')).toBe(
      '/ayarlar/baglantilar?connection=basarili',
    );
  });

  it('KRİTİK: sorgulu yola `&` ile ekliyor — ikinci `?` yok', () => {
    const adres = donusAdresi('/kurulum?tur=sirket&adim=baglantilar', 'connection=basarili');
    expect(adres).toBe('/kurulum?tur=sirket&adim=baglantilar&connection=basarili');
    const sorgu = new URL(adres, 'https://x.test').searchParams;
    expect(sorgu.get('adim')).toBe('baglantilar');
    expect(sorgu.get('connection')).toBe('basarili');
  });
});

describe('KRİTİK: geri dönüşün HER dalı yardımcıdan geçiyor', () => {
  it('tarama boşa düşmüyor: handleCallback gövdesi yakalandı', () => {
    const bas = KAYNAK.indexOf('async handleCallback(');
    expect(bas).toBeGreaterThan(0);
    expect(KAYNAK.slice(bas).match(/donusAdresi\(\s*backTo/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
  });

  it('elle birleştirilmiş dönüş adresi KALMADI', () => {
    expect(KAYNAK).not.toContain('`${backTo}?');
  });
});
