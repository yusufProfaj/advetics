import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PDFFont, PDFPage } from 'pdf-lib';
import { rgb } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { egri, halka } from './pdf-cizim';

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

/**
 * ═══ GÜNLÜK EĞRİ — SIFIR SERİ RAPORU DÜŞÜRÜYORDU ═══
 *
 * ÜRETİMDE ÇIKTI: kullanıcı kendi şablonuyla PDF indirmeye çalıştı ve
 * `HTTP 500 · "Beklenmeyen bir hata oluştu"` aldı. Sunucu log'undaki gerçek
 * hata: `options.y must be of type number, but was actually NaN`.
 *
 * Sebep `egri()` içinde iki farklı işin TEK SAYIYA yüklenmesiydi:
 *   const enYuksek = Math.max(...degerler, 1);   // ölçek tavanı
 *   const zirve    = degerler.indexOf(enYuksek); // tepe noktası
 * Seri tamamen sıfırsa `enYuksek` 1'e sabitleniyor ama 1 dizide YOK:
 * `indexOf` -1, `degerler[-1]` `undefined`, `py(undefined)` NaN ve pdf-lib
 * fırlatıyor. Tek bir nokta etiketi yüzünden BELGENİN TAMAMI kayboluyordu.
 *
 * TAMAMEN SIFIR BİR SERİ İSTİSNA DEĞİL: form dönüşümü hiç olmayan bir
 * müşteride, yalnızca mesaj alan bir hesapta ya da dar bir tarih aralığında
 * gayet normal.
 *
 * NEDEN KAÇTI: `rapor-pdf.service.spec.ts` fixture'ında `daily: []` yazıyordu
 * ve `egri()` `length < 2` ile hemen dönüyor — yani bu fonksiyon hiçbir
 * testte HİÇ ÇALIŞMIYORDU.
 */
describe('egri() — sıfır seri', () => {
  function yakala(): { s: PDFPage; cizimler: Array<{ tip: string; y: unknown }> } {
    const cizimler: Array<{ tip: string; y: unknown }> = [];
    const s = {
      getHeight: () => BOY,
      getWidth: () => EN,
      drawLine: (o: { start: { y: number }; end: { y: number } }) => {
        cizimler.push({ tip: 'line', y: o.start.y });
        cizimler.push({ tip: 'line', y: o.end.y });
      },
      drawCircle: (o: { y: number }) => cizimler.push({ tip: 'circle', y: o.y }),
      drawText: (_t: string, o: { y: number }) => cizimler.push({ tip: 'text', y: o.y }),
    } as unknown as PDFPage;
    return { s, cizimler };
  }

  const font = {
    widthOfTextAtSize: (t: string, p: number) => t.length * p * 0.5,
  } as unknown as PDFFont;

  const CIZIM = { x: 40, y: 300, genislik: 500, yukseklik: 48, renk: rgb(1, 0, 0) };

  it('KRİTİK: seri TAMAMEN SIFIRSA hiçbir koordinat NaN olmuyor', () => {
    const { s, cizimler } = yakala();
    egri(s, font, { ...CIZIM, degerler: [0, 0, 0, 0, 0] });

    expect(cizimler.length, 'hiçbir şey çizilmedi — çağrı sessizce düşmüş olabilir').toBeGreaterThan(0);
    for (const c of cizimler) {
      expect(Number.isFinite(c.y), `${c.tip} çiziminde geçersiz y: ${String(c.y)}`).toBe(true);
    }
  });

  it('KRİTİK: sıfır seride tepe noktası YİNE de etiketleniyor', () => {
    /*
     * Sadece "patlamıyor" yetmez: eski kodda `zirve = -1` idi ve
     * `[...new Set([0, -1, n-1])]` üç nokta üretiyordu. Düzeltme tepe
     * noktasını gerçek değerlerde arıyor, yani sıfır seride tepe İLK gün
     * oluyor ve ilk/son ile birleşince İKİ nokta kalıyor.
     */
    const { s, cizimler } = yakala();
    egri(s, font, { ...CIZIM, degerler: [0, 0, 0] });

    const daireler = cizimler.filter((c) => c.tip === 'circle');
    expect(daireler.length).toBe(2);
    // Hepsi tabanda: değer sıfır, yükseklik sıfır.
    for (const d of daireler) expect(d.y).toBe(CIZIM.y);
  });

  it('gerçek tepe DOĞRU günde etiketleniyor', () => {
    const { s, cizimler } = yakala();
    egri(s, font, { ...CIZIM, degerler: [1, 9, 2, 4] });

    const daireler = cizimler.filter((c) => c.tip === 'circle');
    // İlk (1), tepe (9) ve son (4) — üç ayrı gün.
    expect(daireler.length).toBe(3);
    const tepe = CIZIM.y + (9 / 9) * CIZIM.yukseklik;
    expect(daireler.some((d) => d.y === tepe)).toBe(true);
  });

  it('KRİTİK: TEPE, ÖLÇEK TAVANINDA DEĞİL GERÇEK DEĞERLERDE aranıyor', () => {
    /*
     * BU TEST OLMADAN ASIL DÜZELTME KİLİTLİ DEĞİL — mutasyonla öğrenildi.
     *
     * `zirve` satırını hatalı hâline (`indexOf(enYuksek)`) döndürdüğümde
     * diğer bütün iddialar GEÇTİ, çünkü bir alt satırdaki savunma
     * (`Number.isFinite` kontrolü) NaN'ı yutup çıktıyı aynı yapıyor.
     * Yani testler düzeltmeyi değil savunmayı doğruluyordu.
     *
     * Ayrım yalnızca tepe değeri 1'in ALTINDA olan bir seride görünüyor:
     * hatalı sürüm 1'i arıyor, dizide bulamıyor, tepe noktası SESSİZCE
     * etiketlenmeden kalıyor. Sayaçlar tam sayı olduğu için bu bugün
     * üretimde oluşmuyor, ama `egri()` imzası `number[]` diyor ve bir gün
     * oran serisi verildiğinde tepe kaybolurdu — sessizce.
     */
    const { s, cizimler } = yakala();
    egri(s, font, { ...CIZIM, degerler: [0.2, 0.5, 0.1] });

    const daireler = cizimler.filter((c) => c.tip === 'circle');
    expect(daireler.length, 'ilk, tepe ve son ayrı ayrı etiketlenmeli').toBe(3);

    // Tepe (0.5) ölçek tavanı 1'e göre çiziliyor: taban + yarım yükseklik.
    const tepeY = CIZIM.y + (0.5 / 1) * CIZIM.yukseklik;
    expect(daireler.some((d) => d.y === tepeY), 'tepe noktası etiketlenmemiş').toBe(true);
  });

  it('tek noktalı seri hiç çizilmiyor — sıfıra bölme yok', () => {
    const { s, cizimler } = yakala();
    egri(s, font, { ...CIZIM, degerler: [5] });
    expect(cizimler.length).toBe(0);
  });

  it('negatif değer bile koordinatı bozmuyor', () => {
    // Bugün olamıyor ama olduğunda belgeyi düşürmemeli.
    const { s, cizimler } = yakala();
    egri(s, font, { ...CIZIM, degerler: [-3, 0, -1] });
    for (const c of cizimler) expect(Number.isFinite(c.y)).toBe(true);
  });
});
