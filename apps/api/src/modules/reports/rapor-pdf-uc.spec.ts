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

/** `Content-Disposition` başlığını üreten fonksiyonun gövdesi. */
function basligiUreten(): string {
  const bas = KAYNAK.indexOf('function pdfBasligi(');
  if (bas === -1) {
    throw new Error('pdfBasligi bulunamadı — tarama boşa düştü, testi güncelle.');
  }
  return KAYNAK.slice(bas);
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
    // Başlık artık `pdfBasligi()` üretiyor; uç onu ÇAĞIRMAK zorunda.
    expect(g).toContain('pdfBasligi(data)');
    expect(basligiUreten()).toContain('attachment; filename=');
  });

  it('KRİTİK: dosya adı MÜŞTERİ ADI ve BAŞLIK taşıyor — UUID değil', () => {
    /*
     * Kullanıcının bildirdiği hâl mail ekinde
     * `b4719dbf-...-2026-08-01_2026-08-31.pdf` idi: gelen kutusunda adı
     * olmayan bir dosya. İndirme ucu da aynı üreticiden geçiyor, çünkü aynı
     * belgenin iki yolu aynı adı vermek zorunda.
     */
    expect(basligiUreten()).toContain('raporDosyaAdi({');
    expect(basligiUreten()).toContain('musteriAdi: data.client.name');
    expect(basligiUreten()).toContain('baslik: data.title');
  });

  it('KRİTİK: başlık İKİ alan birden taşıyor — ASCII yedeği ve UTF-8', () => {
    /*
     * `filename` yalnızca ASCII taşıyabiliyor: Türkçe bir ad koymak bazı
     * istemcilerde başlığı bozuyor ve dosya "download" adıyla kaydediliyor.
     * `filename*` (RFC 6266) yüzde kodlu UTF-8 taşıyor ve modern tarayıcılar
     * onu tercih ediyor. Yalnızca birini yazmak ya okunur adı kaybetmek ya da
     * eski istemcilerde adı tamamen kaybetmek demek.
     */
    const f = basligiUreten();
    expect(f).toContain('asciiDosyaAdi(ad)');
    expect(f).toContain("filename*=UTF-8''");
    expect(f).toContain('encodeURIComponent(ad)');
  });

  it('okuma izni isteniyor', () => {
    expect(pdfGovdesi()).toContain("@RequirePermissions('report.read')");
  });
});
