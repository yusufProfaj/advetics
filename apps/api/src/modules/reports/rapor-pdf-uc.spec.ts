import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * PDF İNDİRME UCU.
 *
 * Kaynak taraması: sınanan şey HTTP başlıkları ve denetim kaydı — ikisi de
 * NestJS bağlamı olmadan birim testiyle kurulamıyor, ayrışma ise tek
 * satırlık.
 */
const KAYNAK = readFileSync(join(__dirname, 'reports.controller.ts'), 'utf8');

function pdfGovdesi(): string {
  const bas = KAYNAK.indexOf("  @Get('pdf')");
  if (bas === -1) {
    throw new Error('PDF ucu bulunamadı — tarama boşa düştü, testi güncelle.');
  }
  const g = KAYNAK.slice(bas, KAYNAK.indexOf("  @Get('templates')"));
  if (!g.includes('pdfService.uret')) {
    throw new Error('PDF ucu dilimi üretim çağırmıyor — tarama boşa düştü.');
  }
  return g;
}

describe('GET /reports/pdf', () => {
  it('KRİTİK: rapor DIŞARI ÇIKTIĞI için denetime yazılıyor', () => {
    // Potansiyel müşteri CSV'si bu emsali kurdu: "kim, ne zaman, hangi
    // müşterinin raporunu indirdi" sorusunun cevabı olmalı.
    const g = pdfGovdesi();
    expect(g).toContain("action: 'report.pdf_download'");
    expect(g).toContain('clientId: query.clientId');
  });

  it('KRİTİK: denetim ÜRETİMDEN SONRA — transaction 5 saniyede ölüyor', () => {
    /*
     * PDF üretimi saniyeler sürebiliyor. `withTenant` etkileşimli bir
     * transaction açıyor ve Prisma'nın sınırı 5 saniye; üretimi içine almak
     * büyük bir raporda transaction'ın ölmesi ve denetimin de yazılamaması
     * demek olurdu.
     */
    const g = pdfGovdesi();
    expect(g.indexOf('pdfService.uret')).toBeLessThan(g.indexOf('withTenant'));
  });

  it('indirme başlıkları doğru — tarayıcı sekmede AÇMAMALI', () => {
    const g = pdfGovdesi();
    expect(g).toContain("'application/pdf'");
    expect(g).toContain('attachment; filename=');
  });

  it('KRİTİK: dosya adı ASCII’ye indirgeniyor', () => {
    /*
     * Türkçe karakterler ve boşluklar bazı istemcilerde
     * `Content-Disposition` ayrıştırmasını bozuyor ve dosya "download"
     * adıyla kaydediliyor.
     */
    const bas = KAYNAK.indexOf('function dosyaAdi(');
    if (bas === -1) {
      throw new Error('dosyaAdi bulunamadı — tarama boşa düştü.');
    }
    const f = KAYNAK.slice(bas);
    expect(f).toContain('[ğĞ]');
    expect(f).toContain('[^a-zA-Z0-9]+');
  });

  it('okuma izni isteniyor', () => {
    expect(pdfGovdesi()).toContain("@RequirePermissions('report.read')");
  });
});
