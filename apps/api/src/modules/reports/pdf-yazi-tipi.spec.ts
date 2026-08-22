import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { glifVarMi, yaziTipiOku } from './pdf-yazi-tipi';

/**
 * ═══ PDF'TE TÜRKÇE — SESSİZ HATANIN EN PAHALI BİÇİMİ ═══
 *
 * PDF'in standart yazı tipleri WinAnsi kodlaması kullanıyor: `ğ`, `ş`, `ı`
 * o kodlamada YOK, `₺` (U+20BA) hiç yok. Gömülü yazı tipi olmadan üretilen
 * belgede "Gösterim" ve "₺34.026,44" bozuk çıkar ve bunu ilk gören MÜŞTERİ
 * olur.
 *
 * Bu paket iki şeyi ayrı ayrı tutuyor:
 *   1. Yazı tipi gerçekten o karakterleri TAŞIYOR (cmap taraması).
 *   2. Gömülü yazı tipiyle çizim GEÇİYOR, standart yazı tipiyle DÜŞÜYOR.
 *
 * İkincisi olmadan birincisi yetmez: doğru fontu yükleyip yanlış yerde
 * kullanmak da mümkün.
 */
const TURKCE = 'Gösterim · Tıklama · Dönüşüm · ₺34.026,44 · %1,58 · ğĞşŞıİçÇöÖüÜ';

describe('yazı tipi kapsamı', () => {
  for (const kip of ['normal', 'bold'] as const) {
    it(`${kip}: Türkçe glifler ve ₺ VAR`, () => {
      const veri = yaziTipiOku(kip);
      const kodlar: Array<[string, number]> = [
        ['ğ', 0x011f],
        ['Ğ', 0x011e],
        ['ş', 0x015f],
        ['Ş', 0x015e],
        ['ı', 0x0131],
        ['İ', 0x0130],
        ['ç', 0x00e7],
        ['ö', 0x00f6],
        ['ü', 0x00fc],
        ['₺', 0x20ba],
        ['—', 0x2014],
        ['†', 0x2020],
      ];
      const eksik = kodlar.filter(([, k]) => !glifVarMi(veri, k)).map(([a]) => a);
      expect(eksik, `eksik glifler: ${eksik.join(', ')}`).toEqual([]);
    });
  }

  it('yazı tipi dosyaları GERÇEKTEN okunuyor — boş tampon değil', () => {
    // Anti-boşluk: `glifVarMi` bozuk bir tamponda da `false` döndürür ve
    // yukarıdaki testler "eksik" diye düşerdi; ama dosya hiç okunmasa
    // `readFileSync` patlardı. Yine de boyutu kontrol ediyoruz.
    for (const kip of ['normal', 'bold'] as const) {
      expect(yaziTipiOku(kip).byteLength).toBeGreaterThan(100_000);
    }
  });

  it('KRİTİK: dosya YOKSA açıkça patlıyor — sessizce boş/standart yazı tipine düşmüyor', () => {
    /*
     * Sessizce düşmek en kötü davranış: PDF üretilir, hata çıkmaz, Türkçe
     * bozuk gider ve bunu ilk gören müşteri olur.
     *
     * OLMAYAN BİR DİZİN veriliyor. İlk yazımda geçersiz bir ANAHTAR
     * gönderiyordum ve test TypeError yüzünden geçiyordu — yani eksik dosya
     * yolunu hiç sınamıyordu. Mutasyonla yakalandı.
     */
    expect(() => yaziTipiOku('normal', '/boyle-bir-dizin-yok-42')).toThrow(
      /yazı tipi bulunamadı/i,
    );
  });
});

describe('pdf-lib ile çizim', () => {
  it('KRİTİK: STANDART yazı tipi Türkçeyi ÇİZEMİYOR — kanıt', async () => {
    /*
     * Bu testin amacı gömmenin gerekliliğini KANITLAMAK. Bir gün biri
     * "standart font yeter" diye değiştirirse, aşağıdaki test değil BU test
     * onun neden yetmediğini gösteriyor.
     */
    const doc = await PDFDocument.create();
    const sayfa = doc.addPage();
    const std = await doc.embedFont(StandardFonts.Helvetica);
    expect(() => sayfa.drawText(TURKCE, { font: std, size: 10 })).toThrow();
  });

  it('KRİTİK: GÖMÜLÜ yazı tipiyle Türkçe çiziliyor ve PDF üretiliyor', async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(yaziTipiOku('normal'), { subset: true });
    const sayfa = doc.addPage();
    expect(() => sayfa.drawText(TURKCE, { font, size: 10, x: 40, y: 700 })).not.toThrow();

    const bayt = await doc.save();
    // Gerçek bir PDF mi — "üretildi" demek yetmiyor.
    expect(Buffer.from(bayt.subarray(0, 5)).toString('ascii')).toBe('%PDF-');
    expect(bayt.byteLength).toBeGreaterThan(1000);
  });

  it('gömülü yazı tipi metin GENİŞLİĞİNİ ölçebiliyor — tablo hizası buna bağlı', async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(yaziTipiOku('normal'), { subset: true });
    const dar = font.widthOfTextAtSize('1', 10);
    const genis = font.widthOfTextAtSize('₺34.026,44', 10);
    expect(genis).toBeGreaterThan(dar);
  });

  it('ALT KÜME gömülüyor — tam font 700 KB, belge ona şişmemeli', async () => {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const font = await doc.embedFont(yaziTipiOku('normal'), { subset: true });
    doc.addPage().drawText('Gösterim', { font, size: 10, x: 40, y: 700 });
    const bayt = await doc.save();
    // Tam font gömülseydi belge tek başına ~700 KB olurdu.
    expect(bayt.byteLength).toBeLessThan(200_000);
  });
});
