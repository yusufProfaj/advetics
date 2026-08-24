import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOGO_DOSYASI, logoOku } from './pdf-yazi-tipi';

/**
 * ═══ ADVETICS LOGOSU — İKİ KOPYA, TEK DOSYA ═══
 *
 * Rapor kapağında her zaman Advetics logosu basılıyor; ajansın kendi
 * `branding.logoUrl` değeri kapakta KULLANILMIYOR (panelde kullanılmaya
 * devam ediyor). Beyaz etiket vaadinden bilinçli bir sapma.
 *
 * Dosya İKİ YERDE duruyor ve durmak zorunda: PDF sunucuda üretiliyor ve
 * dosyayı diskten okuyor, panel raporu tarayıcıda render ediliyor ve statik
 * dosyayı `public/` altından sunuyor. İkisi ayrışırsa ekrandaki rapor ile
 * müşteriye giden belge FARKLI logo gösterir — ve bunu kimse fark etmez.
 */
const API_LOGO = resolve(__dirname, '../../../assets/marka', LOGO_DOSYASI);
const WEB_LOGO = resolve(__dirname, '../../../../web/public', LOGO_DOSYASI);

const ozet = (yol: string): string =>
  createHash('sha256').update(readFileSync(yol)).digest('hex');

/**
 * Yorum satırlarını atar.
 *
 * Kaldırılan şeyi ANLATAN yorum aynı dosyada duruyor ve `toContain` ikisini
 * ayırt etmiyor: "ajansın logosu kullanılmıyor" iddiam, kullanılmadığını
 * yazan yorumun kendisine takılıp düşüyordu. Bu oturumda beşinci kez.
 */
function kod(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('marka logosu', () => {
  it('KRİTİK: API ve panel kopyaları AYNI dosya', () => {
    expect(ozet(WEB_LOGO)).toBe(ozet(API_LOGO));
  });

  it('KRİTİK: logo okunabiliyor ve PNG', () => {
    /*
     * `pdf-lib` yalnızca JPEG ve PNG gömüyor. Dosya bir gün WebP ile
     * değiştirilirse `embedPng` anlaşılmaz bir hata fırlatır ve kapak
     * logosuz basılır — sessizce.
     */
    const bayt = logoOku();
    expect(bayt, 'logo okunamadı').not.toBeNull();
    expect([...bayt!.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('KRİTİK: dosya yoksa PATLAMIYOR — kapak logosuz basılır', () => {
    /*
     * Yazı tipinden farklı: eksik yazı tipi belgeyi okunamaz yapıyor
     * (Türkçe karakterler sessizce düşüyor) ve orada AÇIKÇA patlamak doğru.
     * Eksik logo yalnızca kapağı sadeleştiriyor; bir logo yüzünden müşteriye
     * giden raporun hiç üretilmemesi kabul edilemez.
     */
    expect(logoOku(join(__dirname, 'olmayan-dizin'))).toBeNull();
  });

  it('KRİTİK: PDF servisi logoyu DİSKTEN okuyor, ağdan değil', () => {
    /*
     * Uzaktan indirmek, müşteriye giden bir belgenin üretimini ağa bağımlı
     * yapardı: adres cevap vermediğinde rapor logosuz çıkar ve bunu ilk
     * gören müşteri olur.
     */
    const kaynak = readFileSync(join(__dirname, 'rapor-pdf.service.ts'), 'utf8');
    const i = kaynak.indexOf('private async logoyuHazirla');
    expect(i, 'logo hazırlayıcı bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const govde = kaynak.slice(i, kaynak.indexOf('\n  }', i));
    expect(govde).toContain('logoOku()');
    expect(govde).not.toContain('fetch');
  });

  it('KRİTİK: kapakta ajansın logosu KULLANILMIYOR', () => {
    // Karar bu: `branding.logoUrl` panelde duruyor ama rapor kapağında
    // Advetics logosu basılıyor. İkisi karışırsa hangi logonun basıldığı
    // müşteriye göre değişir ve test bunu yakalamaz hâle gelir.
    const kaynak = readFileSync(join(__dirname, 'rapor-pdf.service.ts'), 'utf8');
    expect(kod(kaynak)).not.toContain('branding.logoUrl');
  });
});
