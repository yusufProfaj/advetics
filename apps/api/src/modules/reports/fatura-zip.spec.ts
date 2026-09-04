import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FATURA_KABUL,
  FATURA_TURLERI,
  faturaRetSebebi,
  faturaTuruAnla,
} from '@advetics/shared';

/**
 * ═══ FATURA ARTIK ZIP DE OLABİLİYOR ═══
 *
 * Platformlar dönem faturalarını çoğu zaman tek tek PDF yerine tek bir arşiv
 * olarak indirtiyor; ajans onu açıp tek tek yüklemek zorunda kalıyordu.
 *
 * EKRAN GÖRÜNTÜSÜ REDDİ BOZULMADI ve bu testin yarısı onu koruyor: fatura
 * resmi bir belge, müşteriye giden pakete telefon fotoğrafı koymak onu belge
 * olmaktan çıkarır.
 */

const pdf = (): Buffer => Buffer.from('%PDF-1.7\nmerhaba');
const zip = (): Buffer => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(20)]);

describe('faturaTuruAnla', () => {
  it('PDF ve ZIP tanınıyor', () => {
    expect(faturaTuruAnla(pdf())?.mime).toBe('application/pdf');
    expect(faturaTuruAnla(zip())?.mime).toBe('application/zip');
  });

  it('KRİTİK: EKRAN GÖRÜNTÜSÜ hâlâ reddediliyor', () => {
    /*
     * ZIP eklenirken en kolay hata, kontrolü tamamen gevşetmek olurdu.
     * JPEG ve PNG sihirli baytları açıkça sınanıyor.
     */
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(faturaTuruAnla(jpeg)).toBeNull();
    expect(faturaTuruAnla(png)).toBeNull();
  });

  it('KRİTİK: BOŞ arşiv (PK\\x05\\x06) reddediliyor', () => {
    /*
     * ZIP'in üç imzası var ve ikisi bizim için geçersiz. Boş bir arşivi kabul
     * etmek, müşteriye içi boş bir ek göndermek demekti.
     */
    const bos = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(18)]);
    expect(faturaTuruAnla(bos)).toBeNull();
  });

  it('KRİTİK: ÇOK PARÇALI arşiv (PK\\x07\\x08) reddediliyor', () => {
    // Tek parça tek başına açılamıyor; kabul etmek açılamayan bir ek demekti.
    const parcali = Buffer.concat([Buffer.from([0x50, 0x4b, 0x07, 0x08]), Buffer.alloc(18)]);
    expect(faturaTuruAnla(parcali)).toBeNull();
  });

  it('imza kadar bile olmayan dosya patlatmıyor', () => {
    expect(faturaTuruAnla(Buffer.from([0x25]))).toBeNull();
    expect(faturaTuruAnla(Buffer.alloc(0))).toBeNull();
  });

  it('UZANTIYA ve content-type\'a bakmıyor — yalnızca gövdeye', () => {
    /*
     * Tarayıcı `content-type`ı UZANTIDAN tahmin ediyor: `.pdf` uzantılı bir
     * JPEG "application/pdf" olarak geliyor. Fonksiyon zaten yalnızca bayt
     * alıyor; bu iddia imzanın bozulmasına karşı.
     */
    const sahtePdf = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(faturaTuruAnla(sahtePdf)).toBeNull();
  });
});

describe('faturaRetSebebi — sebep AYRIŞTIRILIYOR', () => {
  it('KRİTİK: boş arşiv, çok parçalı arşiv ve görsel AYRI cümleler', () => {
    /*
     * "Bu dosya kabul edilmiyor" tek başına kullanıcıyı ne yapacağını bilmez
     * bırakıyor; üçünün yapılacak işi farklı.
     */
    const bos = faturaRetSebebi(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const parcali = faturaRetSebebi(Buffer.from([0x50, 0x4b, 0x07, 0x08]));
    const gorsel = faturaRetSebebi(Buffer.from([0xff, 0xd8, 0xff]));
    const bilinmeyen = faturaRetSebebi(Buffer.from('rastgele metin'));

    expect(bos).toContain('BOŞ');
    expect(parcali).toContain('çok parçalı');
    expect(gorsel).toContain('görsel');
    expect(new Set([bos, parcali, gorsel, bilinmeyen]).size, 'sebepler ayrışmıyor').toBe(4);
  });
});

/**
 * ═══ KABUL LİSTESİ İKİ YERDE ═══
 *
 * Uygulama `FATURA_TURLERI`ne, veritabanı `fatura_belgeleri_mime_chk`
 * kısıtına bakıyor. Üçüncü bir tür eklenip CHECK güncellenmezse yükleme
 * uygulamadan geçer ve veritabanında 23514 ile patlar — kullanıcıya
 * "Beklenmeyen bir hata" olarak görünür. Bu depoda o cümle bir turu tamamen
 * kaybettirdi.
 */
describe('kabul listesi — uygulama ve veritabanı AYNI', () => {
  it('KRİTİK: CHECK kısıtı FATURA_TURLERI ile birebir', () => {
    const dizin = join(__dirname, '..', '..', '..', 'prisma', 'migrations');
    const dosyalar = readdirSync(dizin).filter((d) => d.includes('fatura_zip'));
    expect(dosyalar.length, 'ZIP migration\'ı bulunamadı — tarama boşa düştü').toBe(1);

    const sql = readFileSync(join(dizin, dosyalar[0]!, 'migration.sql'), 'utf8');
    const kisit = /CHECK \("mime_type" IN \(([^)]+)\)\)/.exec(sql)?.[1];
    expect(kisit, 'CHECK kısıtı bulunamadı — tarama boşa düştü').toBeDefined();

    const dbTurleri = [...kisit!.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
    const kodTurleri = FATURA_TURLERI.map((t) => t.mime).sort();
    expect(dbTurleri).toEqual(kodTurleri);
  });

  it('panelin `accept` değeri kod listesinden türüyor', () => {
    // Elle yazılmış bir `accept`, listeye tür eklenince sessizce eskiyordu.
    expect(FATURA_KABUL).toBe('.pdf,.zip');
    const panel = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'web', 'src', 'components', 'report', 'faturalar.tsx'),
      'utf8',
    );
    expect(panel).toContain('accept={FATURA_KABUL}');
  });
});

/**
 * ═══ KAYNAK TARAMASI: TÜR UÇTAN UCA TAŞINIYOR ═══
 *
 * Türün kullanıldığı ÜÇ yer var ve üçü de eskiden "PDF" olduğunu VARSAYIYORDU.
 * Biri güncellenmezse belirtisi farklı: yanlış uzantıyla diske yazma, mail
 * ekinin açılamaması ya da panelde bozuk görüntüleyici.
 */
describe('kaynak taraması — tür üç yerde de satırdan', () => {
  const SERVIS = readFileSync(join(__dirname, 'fatura.service.ts'), 'utf8');
  const CONTROLLER = readFileSync(join(__dirname, 'reports.controller.ts'), 'utf8');

  it('DİSKE yazarken bulunan tür kullanılıyor', () => {
    expect(SERVIS).toContain('mimeType: tur.mime');
  });

  it('KRİTİK: MAİL EKİ türü satırdan alıyor — sabit değil', () => {
    expect(SERVIS).toContain('contentType: r.mime_type');
    /*
     * İDDİA GERÇEK BİR GERİLEMEYE ÇAPALI. Önce
     * `not.toContain('contentType: FATURA_MIME')` yazmıştım ve o VAKUM bir
     * iddiaydı: `FATURA_MIME` sabiti depoda artık HİÇ YOK, yani iddia hiçbir
     * zaman düşemezdi. Gerileme, birinin buraya düz bir dizge yazması olurdu.
     */
    const kod = SERVIS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(kod, 'sabit içerik tipi geri gelmiş').not.toMatch(/contentType:\s*'application\//);
  });

  it('KRİTİK: EK ADININ UZANTISI türden — ZIP `.pdf` adıyla gitmiyor', () => {
    expect(SERVIS).toContain('FATURA_TURLERI.find((t) => t.mime === mime)?.uzanti');
  });

  it('KRİTİK: `bytes()` SELECT\'i mime_type ÇEKİYOR', () => {
    /*
     * `$queryRaw<T>` DENETİMSİZ bir dönüşüm: alanı SELECT'e eklemeyi unutmak
     * TypeScript'e hiçbir şey söyletmiyor, alan `undefined` geliyor ve
     * `setHeader('Content-Type', undefined)` çalışma anında patlıyor.
     */
    expect(SERVIS).toContain('SELECT storage_key, file_name, mime_type FROM fatura_belgeleri');
  });

  it('KRİTİK: indirme ucu türü satırdan bildiriyor ve sniffing kapalı', () => {
    const kod = CONTROLLER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(kod).toContain("res.setHeader('Content-Type', mimeType)");
    expect(kod).toContain("'X-Content-Type-Options', 'nosniff'");
    // ZIP sekmede açılmaya çalışılmıyor.
    expect(kod).toContain("mimeType === 'application/pdf' ? 'inline' : 'attachment'");
  });

  it('KRİTİK: depolama uzantısı sessizce `jpg`e düşmüyor', () => {
    const depo = readFileSync(
      join(__dirname, '..', 'ad-builder', 'asset-storage.service.ts'),
      'utf8',
    );
    expect(depo).toContain("'application/zip': 'zip'");
    // Bilinmeyen tür `jpg` olursa arşiv diske görsel gibi yazılırdı.
    expect(depo).toContain("?? 'bin'");
  });
});
