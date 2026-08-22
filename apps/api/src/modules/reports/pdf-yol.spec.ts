import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * YAZI TİPİ YOLU — GELİŞTİRMEDE VE DERLENMİŞ HÂLDE AYNI OLMAK ZORUNDA.
 *
 * `nest build` çıktıyı `dist/` altına aynı yapıyla koyuyor. Yol
 * `__dirname`'e göre çözülüyor ve ikisinde de üç seviye yukarısı `apps/api`:
 *
 *   src/modules/reports  → ../../../ → apps/api
 *   dist/modules/reports → ../../../ → apps/api
 *
 * Bu tesadüf değil ama KIRILGAN: dosya bir alt dizine taşınırsa yol
 * geliştirmede çalışmaya devam eder ve YALNIZCA ÜRETİMDE kırılır — çünkü
 * testler `src` altından koşuyor. Bu yüzden derinlik burada sayılıyor.
 *
 * `deleteOutDir: true` da bir sebep: fontlar `dist` İÇİNDE olsaydı her
 * derlemede silinirdi. `assets/` dışarıda ve dokunulmuyor.
 */
const KAYNAK = readFileSync(join(__dirname, 'pdf-yazi-tipi.ts'), 'utf8');

describe('yazı tipi yolu', () => {
  it('KRİTİK: yol `__dirname`e göre ve üç seviye yukarıda', () => {
    /*
     * `process.cwd()` kullanmak worker'ın nereden başlatıldığına bağlı olurdu
     * ve pm2 altında çalışma dizini garanti değil.
     *
     * İDDİA SABİT TANIMINA ÇAPALI. İlk yazımda dosyanın tamamında
     * `process.cwd()` arıyordum ve o dizge YORUMDA geçtiği için test kodla
     * ilgisiz biçimde düşüyordu — bu oturumda üçüncü kez aynı tuzak.
     */
    const satir = KAYNAK.split('\n').find((l) => l.startsWith('const FONT_DIZINI'));
    if (!satir) {
      throw new Error('FONT_DIZINI tanımı bulunamadı — tarama boşa düştü, testi güncelle.');
    }
    expect(satir).toContain("resolve(__dirname, '../../../assets/fonts')");
    expect(satir).not.toContain('process.cwd()');
  });

  it('KRİTİK: dosya `src/modules/<x>` derinliğinde — yol bu derinliğe bağlı', () => {
    /*
     * Bu test dosyanın YERİNİ kilitliyor. Bir alt dizine taşınırsa
     * geliştirmede sorun çıkmaz (testler src'den koşar) ama üretimde font
     * bulunamaz ve rapor PDF'i patlar.
     */
    const gorece = resolve(__dirname).split('/apps/api/')[1];
    expect(gorece, 'dosya taşınmış — pdf-yazi-tipi.ts içindeki yol da güncellenmeli').toBe(
      'src/modules/reports',
    );
  });

  it('fontlar `dist` DIŞINDA — deleteOutDir onları silmemeli', () => {
    const dizin = resolve(__dirname, '../../../assets/fonts');
    expect(dizin).not.toContain('/dist/');
    expect(existsSync(join(dizin, 'DejaVuSans.ttf'))).toBe(true);
    expect(existsSync(join(dizin, 'DejaVuSans-Bold.ttf'))).toBe(true);
  });

  it('lisans dosyası fontların yanında', () => {
    // Gömülü bir yazı tipi dağıtılıyor; lisansın kaynakla birlikte durması
    // gerekiyor.
    const dizin = resolve(__dirname, '../../../assets/fonts');
    expect(existsSync(join(dizin, 'LICENSE-DejaVu.txt'))).toBe(true);
  });
});
