import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ADV_UTM_ETIKETI, advUtmEtiketi, utmEtiketiAcik } from './utm-etiketi';

/**
 * Ç-6 (docs/veri-kaynagi/MIMARI.md): AdvCampaign Meta reklamına kampanya
 * KİMLİĞİ etiketi, ama müşterinin kendi utm_ parametresi varsa DOKUNULMAZ.
 */
describe('advUtmEtiketi', () => {
  /*
   * VARSAYILAN KAPALI (META_UTM_ETIKETI): Meta'nın url_tags'i geri okumada
   * aynen döndürdüğü ölçülmedi; açık doğsaydı bugün çalışan her yayın
   * "fark"ta durabilirdi. Kapalıyken etiket HİÇ yazılmaz.
   */
  it('KRİTİK: ayar yoksa ya da 0 ise etiket yazılmıyor', () => {
    expect(utmEtiketiAcik({})).toBe(false);
    expect(utmEtiketiAcik({ META_UTM_ETIKETI: '0' })).toBe(false);
    expect(utmEtiketiAcik({ META_UTM_ETIKETI: 'true' })).toBe(false);
    expect(utmEtiketiAcik({ META_UTM_ETIKETI: '1' })).toBe(true);
    expect(advUtmEtiketi('TRAFIK', 'https://ornek.com/konut', false)).toBeNull();
  });

  it('KRİTİK: etiketsiz site bağlantısına kimlik makrosu', () => {
    expect(advUtmEtiketi('TRAFIK', 'https://ornek.com/konut', true)).toBe(ADV_UTM_ETIKETI);
    expect(ADV_UTM_ETIKETI).toContain('utm_campaign={{campaign.id}}');
  });

  it('KRİTİK (mutasyon M4): bağlantıda zaten utm_ varsa (büyük/küçük harf, parça dahil) DOKUNULMAZ', () => {
    expect(advUtmEtiketi('TRAFIK', 'https://ornek.com/?utm_source=bulten', true)).toBeNull();
    expect(advUtmEtiketi('SATIS', 'https://ornek.com/a?x=1&UTM_Campaign=yaz', true)).toBeNull();
    expect(advUtmEtiketi('TRAFIK', 'https://ornek.com/#utm_medium=x', true)).toBeNull();
    // Yolda geçen "utm_" bir parametre değil.
    expect(advUtmEtiketi('TRAFIK', 'https://ornek.com/utm_rehberi', true)).toBe(ADV_UTM_ETIKETI);
  });

  it('siteye gitmeyen niyette ve adressiz reklamda etiket yok', () => {
    expect(advUtmEtiketi('WHATSAPP', 'https://ornek.com', true)).toBeNull();
    expect(advUtmEtiketi('FORM', 'https://ornek.com', true)).toBeNull();
    expect(advUtmEtiketi('TELEFON', null, true)).toBeNull();
    expect(advUtmEtiketi('TRAFIK', null, true)).toBeNull();
  });

  it('yayın derlemesi etiketi bu fonksiyondan alıyor (sabit null değil)', () => {
    const src = readFileSync(join(__dirname, 'yayin-baslat.ts'), 'utf8').replace(/\/\/.*$/gm, '');
    expect(src).toMatch(/urlEtiketleri: advUtmEtiketi\(alanlar\.niyet!\.deger, alanlar\.hedefAdres\?\.deger \?\? null\)/);
    expect(src).not.toMatch(/urlEtiketleri: null/);
  });
});
