import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PDFPage } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { halka } from './pdf-cizim';

/**
 * ═══ HALKA GRAFİĞİ SAYFANIN NERESİNE DÜŞÜYOR ═══
 *
 * Canlıda çıkan hata: Kitle Özeti sayfasında dört halka, başlıkları ve
 * lejantlarının yanında değil SAYFANIN EN ALTINDA çiziliyordu; aralarında da
 * boş bir şerit kalıyordu. HİÇBİR HATA DÜŞMEDİ — çizim başarılıydı, yalnızca
 * yanlış yerdeydi. Bunu ilk gören müşteriye giden PDF oldu.
 *
 * Sebep: `drawSvgPath` önce `translate(x, y)` sonra `scale(1, -1)` uyguluyor
 * (pdf-lib 1.17.1 `operations.js` — "SVG path Y axis is opposite pdf-lib's").
 * Yol noktaları MUTLAK PDF koordinatıyla yazılıp `y: sayfaYuksekligi`
 * verildiğinde çizilen nokta `H - pdfY` oluyor, yani grafik sayfanın yatay
 * orta ekseninde AYNALANIYOR.
 *
 * ┌─ NEDEN "drawSvgPath çağrıldı" DEMEK YETMİYOR ─────────────────────────┐
 * │ `rapor-sablonlari.spec.ts` halka()'nın drawSvgPath kullandığını ve yay │
 * │ komutu yazmadığını zaten kontrol ediyordu ve hatalı sürümde de GEÇTİ.  │
 * │ Bir çizimin YAPILDIĞINI doğrulamak, NEREYE yapıldığını doğrulamıyor.   │
 * │ Bu test dönüşümü BİREBİR uygulayıp sonucu ölçüyor.                     │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Dönüşüm testte ELLE yazılıyor ve bu bilinçli: `halka()` ile aynı kaynağı
 * paylaşsalardı ikisi birlikte yanlış olabilirdi. Aşağıdaki `PDF_LIB_KAYNAGI`
 * testi de dönüşümün pdf-lib'de gerçekten böyle olduğunu kütüphanenin
 * kendi kaynağından kanıtlıyor — sürüm yükseltmesinde varsayım sessizce
 * eskimesin.
 */

/** A4. `rapor-pdf.service.ts` içindeki BOY ile aynı. */
const BOY = 841.89;
const EN = 595.28;

interface Cagri {
  yol: string;
  x: number;
  y: number;
}

/**
 * `halka()` yalnızca `drawSvgPath` ve `getHeight` kullanıyor; gerçek bir
 * `PDFDocument` kurmak testi yavaşlatır ve içerik akışını Flate'ten çözmeyi
 * gerektirirdi. Sahte sayfa çağrıyı OLDUĞU GİBİ yakalıyor.
 */
function sahteSayfa(): { s: PDFPage; cagrilar: Cagri[] } {
  const cagrilar: Cagri[] = [];
  const s = {
    getHeight: () => BOY,
    getWidth: () => EN,
    drawSvgPath: (yol: string, opts: { x: number; y: number }) => {
      cagrilar.push({ yol, x: opts.x, y: opts.y });
    },
  } as unknown as PDFPage;
  return { s, cagrilar };
}

/**
 * Bir çağrıyı pdf-lib'in UYGULADIĞI dönüşümden geçirip sayfa üzerindeki
 * gerçek noktaları veriyor: `translate(x, y)` ardından `scale(1, -1)`,
 * yani `(x + pathX, y - pathY)`.
 */
function sayfadakiNoktalar(c: Cagri): Array<{ x: number; y: number }> {
  const sayilar = c.yol
    .replace(/[MLZ]/g, ' ')
    .trim()
    .split(/\s+/)
    .map(Number);
  expect(sayilar.length % 2, `yol tek sayıda koordinat taşıyor: ${c.yol.slice(0, 80)}`).toBe(0);
  expect(sayilar.some(Number.isNaN), 'yolda sayı olmayan bir değer var').toBe(false);

  const noktalar: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < sayilar.length; i += 2) {
    noktalar.push({ x: c.x + sayilar[i]!, y: c.y - sayilar[i + 1]! });
  }
  return noktalar;
}

/**
 * Kitle Özeti sayfasındaki GERÇEK değerler.
 *
 * `baslik()` `BOY - 124` döndürüyor, özet kartlarından sonra 50 punto
 * düşülüyor, halka merkezi oradan 58 punto aşağıda. Sabitler burada elle
 * yazılı çünkü test bu sayfanın YERLEŞİMİNİ değil `halka()`nın davranışını
 * kilitliyor; yerleşim değişirse bu test değişmemeli.
 */
const CY = BOY - 124 - 50 - 58; // 609.89
const CX = 100;
const DIS_R = 26;
const IC_R = 15;

const DILIMLER = [
  { oran: 0.568, renk: rgb(0.9, 0.2, 0.2) },
  { oran: 0.398, renk: rgb(0.2, 0.2, 0.3) },
  { oran: 0.034, renk: rgb(0.6, 0.6, 0.6) },
];

describe('halka() — sayfadaki konum', () => {
  it('KRİTİK: halka İSTENEN merkeze çiziliyor, aynalanmış konuma değil', () => {
    const { s, cagrilar } = sahteSayfa();
    halka(s, { cx: CX, cy: CY, disR: DIS_R, icR: IC_R, dilimler: DILIMLER });

    expect(cagrilar.length, 'her dilim için bir yol bekleniyor').toBe(DILIMLER.length);

    const hepsi = cagrilar.flatMap(sayfadakiNoktalar);
    const enKucukY = Math.min(...hepsi.map((n) => n.y));
    const enBuyukY = Math.max(...hepsi.map((n) => n.y));

    /*
     * Tolerans 0.5 punto: yol noktaları `toFixed(2)` ile yuvarlanıyor ve
     * çokgen yaklaşımı dış yarıçapa TAM oturmuyor (kirişler yayın içinde
     * kalıyor). Aynalanmış konumla arada 232 puntoluk fark var; 0.5 punto
     * bunu ayırt etmeye fazlasıyla yetiyor.
     */
    expect(enKucukY).toBeGreaterThan(CY - DIS_R - 0.5);
    expect(enBuyukY).toBeLessThan(CY + DIS_R + 0.5);

    /*
     * AYNALANMIŞ KONUM AÇIKÇA REDDEDİLİYOR.
     *
     * Üstteki iki iddia da bunu kapsıyor ama hatanın ADI burada yazılı
     * olmalı: bir sonraki okuyucu testin neyi koruduğunu iddiadan
     * anlayabilmeli. `BOY - CY` = 232, halkanın düştüğü yer tam orasıydı.
     */
    const aynaMerkez = BOY - CY;
    expect(Math.abs((enKucukY + enBuyukY) / 2 - aynaMerkez)).toBeGreaterThan(DIS_R);
  });

  it('halka gerçekten HALKA — dış ve iç yarıçap korunuyor', () => {
    const { s, cagrilar } = sahteSayfa();
    halka(s, { cx: CX, cy: CY, disR: DIS_R, icR: IC_R, dilimler: DILIMLER });

    const uzakliklar = cagrilar
      .flatMap(sayfadakiNoktalar)
      .map((n) => Math.hypot(n.x - CX, n.y - CY));

    // Her nokta ya dış ya iç yarıçapta; arada başıboş nokta olmamalı.
    for (const d of uzakliklar) {
      const disaMi = Math.abs(d - DIS_R) < 0.05;
      const iceMi = Math.abs(d - IC_R) < 0.05;
      expect(disaMi || iceMi, `beklenmeyen yarıçap: ${d.toFixed(2)}`).toBe(true);
    }
    expect(uzakliklar.some((d) => Math.abs(d - DIS_R) < 0.05)).toBe(true);
    expect(uzakliklar.some((d) => Math.abs(d - IC_R) < 0.05)).toBe(true);
  });

  it('KRİTİK: ilk dilim SAAT 12den başlıyor ve saat yönünde ilerliyor', () => {
    /*
     * Panelle aynı olması gereken tek şey renk sırası değil, BAŞLANGIÇ AÇISI
     * ve YÖN de. Konum düzeltilirken yön ters çevrilseydi aynı kova iki
     * belgede halkanın farklı yerinde görünürdü ve karşılaştıran kişi bunu
     * veri farkı sanardı — sessiz ve pahalı.
     */
    const { s, cagrilar } = sahteSayfa();
    halka(s, { cx: CX, cy: CY, disR: DIS_R, icR: IC_R, dilimler: DILIMLER });

    const ilk = sayfadakiNoktalar(cagrilar[0]!);
    const bas = ilk[0]!;

    // Saat 12 = merkezin TAM ÜSTÜ (PDF'te y yukarı doğru büyüyor).
    expect(bas.x).toBeCloseTo(CX, 1);
    expect(bas.y).toBeCloseTo(CY + DIS_R, 1);

    /*
     * Saat yönü: ilk yaydan sonraki nokta SAĞA kaymalı. Sola kayıyorsa
     * dilimler ters dönüyor demektir.
     */
    expect(ilk[1]!.x).toBeGreaterThan(bas.x);
  });

  it('halka sayfanın DIŞINA taşmıyor', () => {
    const { s, cagrilar } = sahteSayfa();
    halka(s, { cx: CX, cy: CY, disR: DIS_R, icR: IC_R, dilimler: DILIMLER });

    for (const n of cagrilar.flatMap(sayfadakiNoktalar)) {
      expect(n.x).toBeGreaterThan(0);
      expect(n.x).toBeLessThan(EN);
      expect(n.y).toBeGreaterThan(0);
      expect(n.y).toBeLessThan(BOY);
    }
  });

  it('tek dilim %100 iken halka DOLU çiziliyor — boş kalmıyor', () => {
    // Tek cinsiyetli bir hesapta dejenere yay hiçbir şey çizmezdi.
    const { s, cagrilar } = sahteSayfa();
    halka(s, {
      cx: CX,
      cy: CY,
      disR: DIS_R,
      icR: IC_R,
      dilimler: [{ oran: 1, renk: rgb(0, 0, 0) }],
    });

    expect(cagrilar.length).toBe(1);
    const noktalar = sayfadakiNoktalar(cagrilar[0]!);
    // Dört yönün dördü de temsil edilmeli; yarım çizilen bir daire geçmesin.
    expect(noktalar.some((n) => n.y > CY + IC_R)).toBe(true);
    expect(noktalar.some((n) => n.y < CY - IC_R)).toBe(true);
    expect(noktalar.some((n) => n.x > CX + IC_R)).toBe(true);
    expect(noktalar.some((n) => n.x < CX - IC_R)).toBe(true);
  });

  it('oranı sıfır olan dilim hiç çizilmiyor', () => {
    const { s, cagrilar } = sahteSayfa();
    halka(s, {
      cx: CX,
      cy: CY,
      disR: DIS_R,
      icR: IC_R,
      dilimler: [
        { oran: 0.5, renk: rgb(0, 0, 0) },
        { oran: 0, renk: rgb(1, 1, 1) },
        { oran: 0.5, renk: rgb(0.5, 0.5, 0.5) },
      ],
    });
    expect(cagrilar.length).toBe(2);
  });
});

/**
 * ═══ VARSAYIMIN KENDİSİ ═══
 *
 * Yukarıdaki testler `(x + pathX, y - pathY)` dönüşümünü DOĞRU varsayıyor.
 * Varsayım yanlışsa hepsi birlikte yanlış olur ve yeşil kalır. O yüzden
 * dönüşüm kütüphanenin kendi kaynağından kanıtlanıyor: pdf-lib bir gün
 * `scale(1, -1)` uygulamaktan vazgeçerse bu test düşsün ve testlerin
 * tamamının yeniden düşünülmesi gerektiğini söylesin.
 */
describe('pdf-lib dönüşümü — varsayım kaynaktan doğrulanıyor', () => {
  it('drawSvgPath translate SONRASI scale(1, -1) uyguluyor', () => {
    const yol = require.resolve('pdf-lib/cjs/api/operations.js');
    const kaynak = readFileSync(yol, 'utf8');

    const i = kaynak.indexOf('drawSvgPath = function');
    expect(i, 'drawSvgPath bulunamadı — tarama boşa düştü, pdf-lib sürümünü kontrol et').toBeGreaterThan(-1);
    const govde = kaynak.slice(i, i + 1200);

    expect(govde).toContain('translate(options.x, options.y)');
    expect(govde).toMatch(/scale\(1,\s*-1\)/);
    // Sıra da önemli: ölçekleme translate'ten SONRA geliyor.
    expect(govde.indexOf('translate(options.x, options.y)')).toBeLessThan(
      govde.search(/scale\(1,\s*-1\)/),
    );
  });

  it('pdf-lib sürümü sabitlenmiş — davranış sürümle değişebilir', () => {
    const pkg = JSON.parse(
      readFileSync(join(__dirname, '../../../package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };
    // Aralık işareti (^ ~) taşımayan tam sürüm: bu dosyadaki kanıt onunla eşleşiyor.
    expect(pkg.dependencies?.['pdf-lib']).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
