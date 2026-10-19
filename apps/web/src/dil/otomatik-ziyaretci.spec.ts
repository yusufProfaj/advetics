import { describe, expect, it } from 'vitest';
import { otomatikZiyaretciMi } from './otomatik-ziyaretci';

/**
 * Dil ekranı botta çizilmiyor (`otomatik-ziyaretci.ts`). İki yönü de kilitli:
 * Google araçları soru GÖRMEMELİ, gerçek tarayıcı soruyu GÖRMELİ (yoksa
 * İngilizce konuşan ziyaretçi Türkçe siteyi görür ve kimse fark etmez).
 */
describe('otomatikZiyaretciMi', () => {
  it.each([
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Google-Site-Verification/1.0',
    'Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse',
    'AdsBot-Google (+http://www.google.com/adsbot.html)',
    'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
  ])('bot: %s', (ua) => {
    expect(otomatikZiyaretciMi(ua)).toBe(true);
  });

  it.each([
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0',
    '',
  ])('insan tarayıcısı soruyu görür: %s', (ua) => {
    expect(otomatikZiyaretciMi(ua)).toBe(false);
  });

  it('başlık yoksa insan sayılır', () => {
    expect(otomatikZiyaretciMi(null)).toBe(false);
  });
});
