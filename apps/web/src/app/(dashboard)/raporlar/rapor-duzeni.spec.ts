import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ RAPORLAR: DÜZEN VE DİL KARARLARI ═══
 *
 * Hiçbiri hata üretmiyor. Bozulduklarında sayfa çalışmaya devam ediyor,
 * yalnızca okunmaz hâle geliyor ya da teşhis edilemeyen bir hata gösteriyor.
 */
const yorumsuz = (yol: string): string =>
  readFileSync(yol, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

const SAYFA = yorumsuz(join(__dirname, 'page.tsx'));
const BILESEN = (ad: string): string =>
  yorumsuz(join(__dirname, '..', '..', '..', 'components', 'report', ad));

describe('tarama boşa düşmüyor', () => {
  it('kaynak okundu', () => {
    expect(SAYFA).toContain('export default async function ReportsPage');
    expect(SAYFA.length).toBeGreaterThan(3000);
  });
});

describe('hata görünürlüğü', () => {
  it('KRİTİK: rapor isteği `.catch(() => null)` ile YUTULMUYOR', () => {
    /*
     * Bu depoda adı konmuş bir yasak ve tam burada duruyordu: 401 (oturum
     * düştü), 403 (yetki yok), 500 (sorgu hatası) ve "API kapalı"
     * hâllerinin hepsi aynı cümleye çevriliyordu. Kullanıcı hangisi
     * olduğunu anlayamıyor, sunucu log'una bakmadan teşhis edilemiyordu.
     */
    expect(SAYFA).not.toContain('.catch(() => null)');
    expect(SAYFA).toContain('raporHatasi');
  });

  it('KRİTİK: sunucunun kendi cümlesi EKRANDA', () => {
    const i = SAYFA.indexOf('Rapor oluşturulamadı');
    expect(i, 'hata kutusu yok').toBeGreaterThan(-1);
    const dilim = SAYFA.slice(i, i + 200);
    expect(dilim).toContain('{raporHatasi');
  });

  it('KRİTİK: "API çalışıyor mu?" gibi teknik cümle YOK', () => {
    // Müşterinin okuduğu ekranda hem anlamsız hem ürkütücü.
    expect(SAYFA).not.toContain('API çalışıyor mu');
  });

  it('hata kutusu ekran okuyucuya ACİL olarak duyuruluyor', () => {
    const i = SAYFA.indexOf('Rapor oluşturulamadı');
    expect(SAYFA.slice(Math.max(0, i - 300), i)).toContain('role="alert"');
  });
});

describe('uyarılar', () => {
  it('KRİTİK: hepsi TEK kutuda ve belgeden ÖNCE', () => {
    /*
     * Üçü ayrı ayrı tam genişlikte renkli kutulardı (şablon listesi düştü ·
     * dönem bitmedi · harcama yok) ve aynı anda çıkabiliyorlardı. Üstelik
     * ikisi belgenin ALTINDA, biri üstünde duruyordu: aynı türden bilgi
     * sayfanın iki ucuna dağılmıştı.
     */
    expect(SAYFA).toContain('<Uyarilar');
    expect(SAYFA).toContain('function Uyarilar(');
    const uyari = SAYFA.indexOf('<Uyarilar');
    const belge = SAYFA.indexOf('<ReportDocument');
    expect(belge, 'belge bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    expect(uyari).toBeLessThan(belge);
  });

  it('KRİTİK: hiç uyarı yoksa boş çerçeve çizilmiyor', () => {
    expect(SAYFA).toContain('if (dolu.length === 0) return null;');
  });
});

describe('ekrandaki dil', () => {
  it('KRİTİK: rapor EKRANLARINDA cümle içinde uzun tire yok', () => {
    /*
     * Panel metin kuralı. Belgenin KENDİSİ (`report-document`,
     * `kitle-ozeti`) bu taramanın dışında: orası PDF'in aynası ve metni
     * PDF ile BİRLİKTE değişmek zorunda, yoksa ekranla basılan belge
     * ayrışır.
     */
    const ekranlar = [
      'share-controls.tsx',
      'faturalar.tsx',
      'sablon-yonetimi.tsx',
      'rapor-planla.tsx',
      'rapor-gonder.tsx',
      'mail-govde-editoru.tsx',
    ];
    const bulunan: string[] = [];
    for (const ad of ekranlar) {
      for (const satir of BILESEN(ad).split('\n')) {
        // TEK KARAKTERLİK `'—'` bir YER TUTUCU, cümle değil: tabloda
        // "değer yok" demenin yerleşik işareti.
        if (satir.includes('—') && !/['"`]—['"`]/.test(satir)) {
          bulunan.push(`${ad}: ${satir.trim().slice(0, 60)}`);
        }
      }
    }
    expect(bulunan).toEqual([]);
    for (const satir of SAYFA.split('\n')) {
      expect(satir.includes('—'), `sayfada tire: ${satir.trim().slice(0, 60)}`).toBe(false);
    }
  });
});

describe('rapor klasöründeki PANEL bileşenleri belirteç kullanıyor', () => {
  it('KRİTİK: paylaşım menüsü ve yazdırma düğmesi ham palet taşımıyor', () => {
    /*
     * Tema bekçisinin istisnası bir süre `components/report/` klasörünün
     * TAMAMIYDI ve fazla genişti: o klasörde belge dışında panel arayüzü de
     * duruyor. Bu ikisi istisnanın altında kalıp karanlık temada bozuk
     * kalmıştı.
     */
    const palet = /\b(bg|text|border|ring)-(slate|gray|red|amber|emerald|green|blue|sky|rose)-\d{2,3}\b/;
    for (const ad of ['share-controls.tsx', 'print-button.tsx']) {
      expect(palet.test(BILESEN(ad)), `${ad} ham palet taşıyor`).toBe(false);
    }
  });
});
