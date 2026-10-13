import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { VARSAYILAN_DONUS, donusAdresi } from './connections.service';

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

/**
 * VARSAYILAN DÖNÜŞ PANELİN ÜRETİCİSİNDEN ve ÇAPASIZ (2026-10-13). Sayfa
 * taşınınca elle yazılmış yol ölü adrese döndürürdü; çapalı bir adresin
 * arkasına eklenen `?connection=…` ise çapanın parçası sayılıp sunucuya hiç
 * gitmez ve "bağlandı" bandı görünmezdi.
 */
describe('KRİTİK: varsayılan OAuth dönüşü', () => {
  it('Platform bağlantıları sekmesi, çapa YOK', () => {
    expect(VARSAYILAN_DONUS).toBe('/ayarlar/baglantilar');
    expect(VARSAYILAN_DONUS).not.toContain('#');
    const u = new URL(donusAdresi(VARSAYILAN_DONUS, 'connection=basarili'), 'https://x.test');
    expect(u.searchParams.get('connection')).toBe('basarili');
  });

  it('servis panel yolunu elle yazmıyor; üç dal da sabiti kullanıyor', () => {
    expect(KAYNAK).not.toMatch(/['"`]\/ayarlar\//);
    expect(KAYNAK.match(/VARSAYILAN_DONUS/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
