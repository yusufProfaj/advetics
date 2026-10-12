import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADV_UTM_ETIKETI, advUtmEtiketi } from './utm-etiketi';

/**
 * Ç-6 (docs/veri-kaynagi/MIMARI.md): AdvCampaign Meta reklamına kampanya
 * KİMLİĞİ etiketi, ama müşterinin kendi utm_ parametresi varsa DOKUNULMAZ.
 */
describe('advUtmEtiketi', () => {
  it('KRİTİK: etiketsiz site bağlantısına kimlik makrosu', () => {
    expect(advUtmEtiketi('TRAFIK', 'https://ornek.com/konut')).toBe(ADV_UTM_ETIKETI);
    expect(ADV_UTM_ETIKETI).toContain('utm_campaign={{campaign.id}}');
  });

  it('KRİTİK (mutasyon M4): bağlantıda zaten utm_ varsa (büyük/küçük harf, parça dahil) DOKUNULMAZ', () => {
    expect(advUtmEtiketi('TRAFIK', 'https://ornek.com/?utm_source=bulten')).toBeNull();
    expect(advUtmEtiketi('SATIS', 'https://ornek.com/a?x=1&UTM_Campaign=yaz')).toBeNull();
    expect(advUtmEtiketi('TRAFIK', 'https://ornek.com/#utm_medium=x')).toBeNull();
    // Yolda geçen "utm_" bir parametre değil.
    expect(advUtmEtiketi('TRAFIK', 'https://ornek.com/utm_rehberi')).toBe(ADV_UTM_ETIKETI);
  });

  it('siteye gitmeyen niyette ve adressiz reklamda etiket yok', () => {
    expect(advUtmEtiketi('WHATSAPP', 'https://ornek.com')).toBeNull();
    expect(advUtmEtiketi('FORM', 'https://ornek.com')).toBeNull();
    expect(advUtmEtiketi('TELEFON', null)).toBeNull();
    expect(advUtmEtiketi('TRAFIK', null)).toBeNull();
  });

  it('yayın derlemesi etiketi bu fonksiyondan alıyor (sabit null değil)', () => {
    const src = readFileSync(join(__dirname, 'yayin-baslat.ts'), 'utf8').replace(/\/\/.*$/gm, '');
    expect(src).toMatch(/urlEtiketleri: advUtmEtiketi\(alanlar\.niyet!\.deger, alanlar\.hedefAdres\?\.deger \?\? null\)/);
    expect(src).not.toMatch(/urlEtiketleri: null/);
  });
});
