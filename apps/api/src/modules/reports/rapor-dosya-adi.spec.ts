import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { asciiDosyaAdi, raporDosyaAdi } from '@advetics/shared';

/**
 * ═══ RAPOR PDF'İNİN DOSYA ADI ═══
 *
 * Kullanıcının bildirdiği hâl: mail ekindeki PDF
 * `b4719dbf-e149-4ca6-80af-19ebaeb67dd9-2026-08-01_2026-08-31.pdf` adıyla
 * gidiyordu — müşterinin gelen kutusunda adı olmayan bir dosya.
 *
 * Sebep, aynı belgeyi üreten ÜÇ yolun ayrışmasıydı: indirme ucu müşteri adını
 * kullanıyordu (ama küçük harfe indirip başlığı atarak), iki mail yolu ise
 * müşterinin UUID'sini yazıyordu.
 */
describe('raporDosyaAdi', () => {
  const TEMEL = {
    musteriAdi: 'Çiftçi Grup',
    baslik: 'Dijital Pazarlama Raporu',
    from: '2026-08-01',
    to: '2026-08-31',
  };

  it('KRİTİK: müşteri adı, başlık ve tarih aralığı — bu sırayla', () => {
    expect(raporDosyaAdi(TEMEL)).toBe(
      'Çiftçi Grup - Dijital Pazarlama Raporu - 2026-08-01_2026-08-31.pdf',
    );
  });

  it('KRİTİK: TÜRKÇE karakterler KORUNUYOR', () => {
    /*
     * Ad, müşterinin gördüğü şey. ASCII'ye indirgemek "Kaşkaloğlu"yu
     * "kaskaloglu" yapardı ve okunurluk bu işin tamamı. Mail ekinde bu
     * güvenli: nodemailer ek adını RFC 2231'e göre kodluyor.
     */
    const ad = raporDosyaAdi({ ...TEMEL, musteriAdi: 'Kaşkaloğlu Göz Hastanesi' });
    expect(ad).toContain('Kaşkaloğlu Göz Hastanesi');
  });

  it('KRİTİK: BAŞLIK şablondan geliyor — sabit yazılmıyor', () => {
    /*
     * Kapağı "Aylık Performans" olan bir raporun eki "Dijital Pazarlama
     * Raporu" adıyla gitseydi, belge ile adı çelişirdi.
     */
    const ad = raporDosyaAdi({ ...TEMEL, baslik: 'Aylık Performans Özeti' });
    expect(ad).toContain('Aylık Performans Özeti');
    expect(ad).not.toContain('Dijital Pazarlama');
  });

  it('KRİTİK: dosya sisteminde YASAK karakterler ayıklanıyor', () => {
    /*
     * Müşteri adı kullanıcı girdisi. Windows bu karakterleri reddediyor ve
     * `Content-Disposition` başlığında tırnak, başlığı ortasından kapatıyor.
     */
    const ad = raporDosyaAdi({ ...TEMEL, musteriAdi: 'A/B: "test" | x*?<>\\' });
    expect(ad).not.toMatch(/[\\/:*?"<>|]/);
    expect(ad).toContain('A B test x');
  });

  it('KRİTİK: satır sonu ayıklanıyor — başlık enjeksiyonu yüzeyi', () => {
    /*
     * Müşteri adına kaçmış bir satır sonu `Content-Disposition` başlığını
     * ikiye bölerdi. Ad kullanıcı girdisi ve HTTP başlığına giriyor.
     */
    const ad = raporDosyaAdi({ ...TEMEL, musteriAdi: 'Firma\r\nX-Injected: 1' });
    expect(ad).not.toMatch(/[\r\n]/);
  });

  it('uzun müşteri adı kırpılıyor — dosya adı sınırı var', () => {
    const ad = raporDosyaAdi({ ...TEMEL, musteriAdi: 'A'.repeat(300) });
    expect(ad.length).toBeLessThan(200);
    expect(ad).toContain('2026-08-01_2026-08-31.pdf');
  });

  it('müşteri adı ve başlık boşsa TANINABİLİR bir yedek', () => {
    // Boş bir ad, ekin ".pdf" olarak görünmesi demek.
    const ad = raporDosyaAdi({ ...TEMEL, musteriAdi: '   ', baslik: '' });
    expect(ad).toBe('Rapor - 2026-08-01_2026-08-31.pdf');
  });

  it('KRİTİK: UUID artık ADA GİRMİYOR', () => {
    // Kullanıcının bildirdiği hatanın ta kendisi.
    expect(raporDosyaAdi(TEMEL)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
  });
});

describe('asciiDosyaAdi', () => {
  it('Türkçe harfler karşılıklarına çevriliyor', () => {
    expect(asciiDosyaAdi('Çiftçi Grup - Rapor.pdf')).toBe('ciftci-Grup-Rapor.pdf');
  });

  it('uzantı korunuyor', () => {
    expect(asciiDosyaAdi('Şirket - Rapor - 2026-08-01_2026-08-31.pdf')).toMatch(/\.pdf$/);
  });

  it('sonuç YALNIZCA ASCII', () => {
    const out = asciiDosyaAdi('Kaşkaloğlu Göz — Ağustos.pdf');
    // eslint-disable-next-line no-control-regex
    expect(out).toMatch(/^[\x20-\x7E]+$/);
    expect(out).not.toMatch(/[\\/:*?"<>|]/);
  });

  it('her şey elenirse tanınabilir bir yedek', () => {
    expect(asciiDosyaAdi('日本語')).toBe('rapor.pdf');
  });
});

/**
 * ═══ KAYNAK TARAMASI: ÜÇ TÜKETİCİ DE AYNI ÜRETİCİDEN ═══
 *
 * Hatanın sebebi fonksiyonun yanlış olması değil, ÜÇ YERDE AYRI yazılmasıydı.
 * Biri güncellenip diğeri unutulursa aynı rapor iki farklı adla gider ve fark
 * yalnızca müşterinin gelen kutusunda görünür.
 */
describe('kaynak taraması — dosya adı tek üreticiden', () => {
  const GONDER = readFileSync(join(__dirname, 'rapor-gonder.service.ts'), 'utf8');
  const CONTROLLER = readFileSync(join(__dirname, 'reports.controller.ts'), 'utf8');

  function dilim(kaynak: string, bas: string, son: string): string {
    const i = kaynak.indexOf(bas);
    expect(i, `"${bas}" bulunamadı — tarama boşa düştü`).toBeGreaterThan(-1);
    const j = kaynak.indexOf(son, i);
    expect(j, `"${son}" bulunamadı — tarama boşa düştü`).toBeGreaterThan(-1);
    return kaynak.slice(i, j);
  }

  it('ELLE gönderim üreticiyi kullanıyor', () => {
    expect(dilim(GONDER, 'async gonder(', 'async zamanlanmisGonder(')).toContain(
      'raporDosyaAdi({',
    );
  });

  it('KRİTİK: PLANLI gönderim de AYNI üreticiyi kullanıyor', () => {
    expect(
      dilim(GONDER, 'async zamanlanmisGonder(', 'private async musteriEpostalari('),
    ).toContain('raporDosyaAdi({');
  });

  it('İNDİRME ucu da aynı üreticiyi kullanıyor', () => {
    expect(CONTROLLER).toContain('raporDosyaAdi({');
  });

  it('KRİTİK: müşteri KİMLİĞİ ek adında GEÇMİYOR', () => {
    /*
     * Eski hâl `${input.clientId}-${input.from}_${input.to}.pdf` idi.
     * İddia YORUMA değil KODA çapalı: yorumlar bu hatayı ANLATIYOR ve
     * `toContain` ikisini ayırt etmiyor.
     */
    const kod = GONDER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(kod).not.toContain('clientId}-${');
    expect(kod).not.toContain('params.clientId}-${');
  });

  it('KRİTİK: indirme başlığı İKİ alan birden taşıyor', () => {
    /*
     * `filename` yalnızca ASCII taşıyabiliyor; `filename*` (RFC 6266) UTF-8.
     * Yalnızca birini yazmak, ya Türkçe adı kaybetmek ya da bazı
     * istemcilerde dosyanın "download" adıyla kaydedilmesi demek.
     */
    expect(CONTROLLER).toContain("filename*=UTF-8''");
    expect(CONTROLLER).toContain('asciiDosyaAdi(ad)');
  });
});
