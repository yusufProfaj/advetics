import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * REKLAM KARTI — "GÖRSEL YOK" ÜÇ FARKLI ŞEYDİ.
 *
 * Aynı boş 4:5 kutu şunların hepsini temsil ediyordu ve üçünün yapılacak işi
 * farklı:
 *
 *   · Google ARAMA reklamı — görsel ZATEN YOK. Kutu göstermek raporda ve
 *     ekranda görüntü kirliliği üretiyor.
 *   · Google Display — kaynak adı URL sanılıp KIRIK GÖRSEL çıkıyordu.
 *   · Meta kreatifi — CDN adresi ölmüş ya da hiç senkronize edilmemiş.
 *
 * Kaynak taraması, çünkü bunlar render kararları ve birim testiyle
 * yakalanmaları için bütün ağacı kurmak gerekirdi; ayrışma ise tek satırlık.
 */
const KART = readFileSync(join(__dirname, 'ad-card.tsx'), 'utf8');

function govde(): string {
  const bas = KART.indexOf('export function AdCard(');
  if (bas === -1) {
    throw new Error('AdCard bulunamadı — tarama boşa düştü, testi güncelle.');
  }
  const g = KART.slice(bas, KART.indexOf('\nfunction PreviewLink'));
  if (!g.includes('PreviewLink')) {
    throw new Error('AdCard dilimi görseli render etmiyor — tarama boşa düştü.');
  }
  return g;
}

describe('AdCard', () => {
  it('ARAMA reklamı platform + kreatif türünden ayırt ediliyor', () => {
    /*
     * İDDİA `aramaReklami` TANIMINA ÇAPALI. İlk yazımda gövdenin tamamında
     * `ad.platform === 'google'` aranıyordu; o dizge platform ROZETİNDE de
     * geçtiği için platform kontrolünü tanımdan silmek testi düşürmüyordu.
     * Mutasyonla yakalandı.
     *
     * Yalnızca `creativeType`e bakmak yetmez: Meta'da da SEARCH geçen bir tür
     * çıkarsa görsel kutusu haksız yere gizlenir.
     */
    const g = govde();
    const bas = g.indexOf('const aramaReklami');
    if (bas === -1) {
      throw new Error('aramaReklami tanımı bulunamadı — tarama boşa düştü, testi güncelle.');
    }
    const tanim = g.slice(bas, g.indexOf(';', bas));
    expect(tanim).toContain("ad.platform === 'google'");
    expect(tanim).toContain('/SEARCH/i');
  });

  it('KRİTİK: arama reklamında GÖRSEL KUTUSU yerine METİN ÖNİZLEMESİ var', () => {
    /*
     * KARAR GENİŞLEDİ. Önce yalnızca "boş kutu gösterilmesin" idi ve doğruydu:
     * boş bir 4:5 kutu "eksik bir şey var" izlenimi veriyor. Ama yerine
     * hiçbir şey koymamak ekranın asıl sorusunu cevapsız bırakıyordu: bu
     * reklam NE DİYOR. Metin reklamının kreatifi metnidir.
     */
    const g = govde();
    expect(g).toContain('<AramaReklamiOnizleme');
    // Görsel kutusu arama reklamı dalında DEĞİL: koşul önizlemeyi seçiyor.
    expect(g).toContain('{aramaReklami ? (');
  });

  it('KRİTİK: açıklama için YEDEK alan okunuyor', () => {
    /*
     * Google, RSA açıklamalarının ilkini `primaryText`e yazıyor ve
     * `description`ı boş bırakıyor (`mapGoogleCreative`). Yalnızca
     * `description` okumak her arama reklamının açıklamasını sessizce
     * kaybetmek demekti; raporda tam olarak bu oluyordu.
     */
    expect(govde()).toContain('ad.creative?.description ?? ad.creative?.primaryText');
  });

  it('KRİTİK: başlık ve metin kartta İKİ KEZ basılmıyor', () => {
    // Kreatif başlığı önizleme kutusunda duruyor; gövdede reklamın kendi adı
    // yazıyor ve gövde metni arama reklamında hiç tekrarlanmıyor.
    const g = govde();
    expect(g).toContain('const baslikMetni = aramaReklami ? ad.name');
    expect(g).toContain('{!aramaReklami && ad.creative?.primaryText && (');
  });

  it('yüklenemeyen görsel için İSTEMCİ bileşeni kullanılıyor', () => {
    // `onError` sunucu bileşenine bağlanamıyor. Çıplak `<img>` kalırsa
    // tarayıcı kırık resim ikonu gösteriyor — şemanın ve bileşenin kendi
    // yorumunun yasakladığı şey.
    const g = govde();
    expect(g).toContain('<KreatifGorsel');
    expect(g).not.toContain('<img');
  });

  it('"görsel alınamadı" ile "görsel yok" AYRI cümleler', () => {
    // İkisi aynı olsaydı ayrım yapmanın anlamı kalmazdı.
    const g = govde();
    expect(g).toContain('görsel alınamadı');
    // Metin kısaldı ve uzun tire kalktı (panel metin kuralı); AYRIM aynı.
    expect(g).toContain('Arama reklamı, görseli yok');
  });

  it('PLATFORM ROZETİ basılıyor — iki platform tek listede', () => {
    expect(govde()).toContain('<PlatformLogo');
  });
});

describe('KreatifGorsel', () => {
  const KAYNAK = readFileSync(join(__dirname, 'kreatif-gorsel.tsx'), 'utf8');

  it("'use client' EN ÜSTTE — onError olmadan yer tutucu çalışmaz", () => {
    expect(KAYNAK.trimStart().startsWith("'use client'")).toBe(true);
  });

  it('onError yer tutucuya düşürüyor', () => {
    expect(KAYNAK).toContain('onError');
    expect(KAYNAK).toContain('setDustu(true)');
  });
});
