import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ YOUTUBE ÖN AYARI: YALNIZCA BÜTÇE ═══
 *
 * Kullanıcının tarifi *"çok büyük angarya"*: marka, logo, adres ve üç metin
 * elle giriliyordu ve metinler her videoda AYNIYDI. Bu tarama formun o hâle
 * dönmemesini kilitliyor. Tarama yorumsuz kaynakta; kuralı anlatan yorum
 * eski alan adlarını taşıyor.
 */
const KAYNAK = readFileSync(join(__dirname, 'boost-on-ayarlari-formu.tsx'), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const bas = KAYNAK.indexOf('function GoogleForm(');
const FORM = KAYNAK.slice(bas, KAYNAK.indexOf('\nfunction Acik(', bas));

describe('YouTube ön ayarı', () => {
  it('tarama boşa düşmüyor', () => {
    expect(bas).toBeGreaterThan(-1);
    expect(FORM).toContain('Günlük bütçe');
  });

  it('KRİTİK: marka, logo, adres ve metin ALANI YOK', () => {
    for (const eski of ['setHeadline', 'setLongHeadline', 'setDescription', 'setBusinessName', 'setLogoAssetId', 'setFinalUrl']) {
      expect(FORM, eski).not.toContain(eski);
    }
    expect(FORM).not.toContain('headlines:');
  });

  it('otomatik değerler yayınla AYNI uçtan ve kaynaklarıyla gösteriliyor', () => {
    expect(FORM).toContain('/autoboost/presets/youtube-otomatik?clientId=');
    expect(KAYNAK).toContain('<OtomatikBilgiler');
    expect(KAYNAK).toContain('otomatik.eksikler.map');
  });

  it('otomatik bilgilerin hatası YUTULMUYOR', () => {
    expect(FORM).toContain('setOtomatikHata(');
    expect(KAYNAK).toContain('Otomatik bilgiler okunamadı: {hata}');
  });

  it('eski elle seçilmiş değerler sessizce atılmıyor', () => {
    expect(FORM).toContain('const koru = eskiSecim && !otomatigeGec;');
  });

  it('hedef konum ekranda yazılı — sunucunun gönderdiği Türkiye', () => {
    expect(FORM).toContain('Hedef konum:');
    expect(FORM).toContain('Türkiye');
  });

  it('kartın onaylanınca YAYINA GİRDİĞİ ve küçük bütçe uyarısı yazılı', () => {
    expect(FORM).toContain('yayına girer');
    expect(FORM).toContain('küçük bir');
    expect(FORM).not.toContain('duraklatılmış');
  });
});
