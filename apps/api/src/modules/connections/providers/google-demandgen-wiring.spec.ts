import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DEMAND GEN ZİNCİRİ KAYNAKTA BAĞLI MI?
 *
 * Gövde kurucuları ayrı test edildi ama o testler gövdelerin DOĞRU olduğunu
 * söylüyor, KULLANILDIĞINI söylemiyor. Aynı boşluk `labelBoostError`'da
 * mutasyonla bulunmuştu: fonksiyon doğruydu, çağrılmıyordu.
 *
 * Zincir gerçek HTTP gerektirdiği için birim testiyle okunamıyor.
 */
const SOURCE = readFileSync(join(__dirname, 'google.provider.ts'), 'utf8');

const GOVDE = (() => {
  const bas = SOURCE.indexOf('  async createVideoBoost(');
  if (bas < 0) throw new Error('createVideoBoost bulunamadı — tarama boşa düşer');
  const i = SOURCE.indexOf('{', SOURCE.indexOf('adId: string }>', bas));
  let d = 0;
  for (let j = i; j < SOURCE.length; j++) {
    if (SOURCE[j] === '{') d++;
    else if (SOURCE[j] === '}') {
      d--;
      if (d === 0) return SOURCE.slice(i, j + 1);
    }
  }
  throw new Error('gövde kapanmadı');
})();

describe('createVideoBoost — zincir kaynakta bağlı', () => {
  it('tarama BOŞA DÜŞMÜYOR', () => {
    expect(GOVDE.length).toBeGreaterThan(800);
    expect(GOVDE).toContain('campaignBudgets');
  });

  it('KRİTİK: Demand Gen gövde kurucuları KULLANILIYOR', () => {
    /*
     * Arama kampanyasının kurucuları (`campaignBody`, `adGroupBody`) yanlışlıkla
     * kullanılsaydı kampanya SEARCH tipinde açılır ve YouTube'da hiç
     * yayınlanmazdı — hatasız.
     */
    expect(GOVDE).toContain('demandGenCampaignBody');
    expect(GOVDE).toContain('demandGenAdGroupBody');
    expect(GOVDE).toContain('demandGenVideoAdBody');
  });

  it('KRİTİK: ARAMA kurucuları bu zincirde YOK', () => {
    expect(GOVDE).not.toMatch(/\bcampaignBody\(/);
    expect(GOVDE).not.toMatch(/\badGroupBody\(/);
    expect(GOVDE).not.toContain('responsiveSearchAdBody');
    expect(GOVDE).not.toContain('keywordsBody');
  });

  it('KRİTİK: video varlığı reklamdan ÖNCE oluşturuluyor', () => {
    // Video inline verilemiyor; sıra ters olsa reklam var olmayan bir kaynak
    // adına referans verirdi.
    const v = GOVDE.indexOf('createYouTubeVideoAsset');
    const a = GOVDE.indexOf('demandGenVideoAdBody');
    expect(v).toBeGreaterThan(0);
    expect(a).toBeGreaterThan(v);
  });

  it('KRİTİK: hata durumunda GERİ ALMA var', () => {
    // Yetim bütçe para harcamıyor ama aynı adla ikinci bütçe açılamıyor
    // (DUPLICATE_NAME) ve bir sonraki deneme sebepsiz düşerdi.
    expect(GOVDE).toContain('created');
    expect(GOVDE).toContain('removeBody');
    expect(GOVDE).toContain('.reverse()');
  });

  it('KRİTİK: video varlığı geri alma listesine GİRMİYOR', () => {
    /*
     * Varlıklar hesap seviyesinde ve yeniden kullanılabiliyor; silmek aynı
     * videoyu ikinci kez tanıtmak istendiğinde yeniden yükleme demek olurdu.
     * `created.push` yalnızca üç kampanya nesnesi için çağrılıyor.
     */
    const pushSayisi = (GOVDE.match(/created\.push\(/g) ?? []).length;
    expect(pushSayisi).toBe(3);
  });

  it('bitiş tarihi SÜREDEN türetiliyor', () => {
    // Bitiş verilmezse kampanya süresiz çalışır; "7 günlük boost" sonsuza
    // kadar harcayan bir kampanya olurdu.
    expect(GOVDE).toContain('durationDays');
    expect(GOVDE).toContain('endDate');
  });
});
