import { describe, expect, it } from 'vitest';
import { matchRatio, videoOraniUygun } from '@advetics/shared';

/**
 * ═══ VİDEO ORANI: KOVA DEĞİL ARALIK ═══
 *
 * Görsel üç kovaya oturuyor çünkü Meta bir yerleşim için görsel bulamazsa
 * reklamı orada HİÇ göstermiyor. Video öyle değil: tek video bütün
 * yerleşimlere gidiyor ve Meta onu yerleşim başına kendisi kırpıyor.
 *
 * Bu ayrım yapılmadığında akışın EN YAYGIN video oranı (4:5) panelde
 * seçilemez oluyordu — hiçbir kovaya %8 toleransla girmiyor, tıklanamıyor ve
 * altındaki "kırpıp kullan" görsel kırpıcısına gidiyor.
 */
describe('video oranı', () => {
  it('KRİTİK: 4:5 video KABUL EDİLİYOR — görsel kovası onu reddediyor', () => {
    expect(videoOraniUygun(1080, 1350)).toBe(true);
    // Kanıt: aynı ölçü görsel kuralında düşüyor. İki kural GERÇEKTEN farklı.
    expect(matchRatio(1080, 1350)).toBeNull();
  });

  it('yaygın reklam oranlarının hepsi geçiyor', () => {
    expect(videoOraniUygun(1080, 1080)).toBe(true); // kare
    expect(videoOraniUygun(1080, 1920)).toBe(true); // 9:16 Reels
    expect(videoOraniUygun(1920, 1080)).toBe(true); // 16:9
    expect(videoOraniUygun(1200, 628)).toBe(true); // 1.91:1
  });

  it('KRİTİK: aralığın DIŞI reddediliyor', () => {
    /*
     * Meta 9:16'dan dar ve 1.91:1'den geniş videoyu kabul etmiyor. Sınırsız
     * bırakmak, yayın anında reddedilecek bir dosyayı seçtirmek olurdu.
     */
    expect(videoOraniUygun(1080, 2400)).toBe(false); // 0,45 — çok dar
    expect(videoOraniUygun(2400, 1000)).toBe(false); // 2,4 — çok geniş
  });

  it('ölçüsü okunamayan video seçilemiyor', () => {
    expect(videoOraniUygun(0, 0)).toBe(false);
  });
});
