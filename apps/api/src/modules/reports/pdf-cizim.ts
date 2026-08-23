import { rgb, type RGB, type PDFFont, type PDFPage } from 'pdf-lib';
import { CONVERSION_BUCKETS, formatNumber, type ReportDailyPoint } from '@advetics/shared';

/**
 * ═══ PDF ÇİZİM KATMANI — PANELDEKİ RAPORUN AYNISI ═══
 *
 * REFERANS PANELDEKİ BELGE (`apps/web/src/components/report/report-document.tsx`),
 * benim tasarım tercihlerim DEĞİL. İlk denemede kendi renk şemamı kurmuştum —
 * tam sayfa lacivert bant, turuncu rozetler, zebra satırlar, veri çubukları —
 * ve kullanıcının cevabı "çok pastel boya çizimi gibi olmuş" oldu. Haklıydı:
 * aynı raporun iki gösterimi iki farklı görsel dil konuşuyordu.
 *
 * Panelin dili şu: BEYAZ zemin, ince slate kuralları, yuvarlatılmış çerçeveli
 * kartlar ve marka rengi YALNIZCA üç yerde — bölüm alt başlığı, TOPLAM
 * kartının dolgusu ve kapaktaki kısa çizgi. Buradaki her sabit oradan
 * ölçülerek alındı; birini değiştirmek iki belgeyi ayrıştırır.
 */

/** Panelin slate paleti (Tailwind). Sayılar tahmin değil, ölçülmüş değerler. */
export const SLATE = {
  s900: rgb(0.059, 0.09, 0.165),
  s700: rgb(0.204, 0.255, 0.333),
  s600: rgb(0.278, 0.333, 0.412),
  s500: rgb(0.392, 0.455, 0.545),
  s400: rgb(0.58, 0.639, 0.722),
  s300: rgb(0.796, 0.835, 0.882),
  s200: rgb(0.886, 0.91, 0.941),
  s100: rgb(0.945, 0.961, 0.976),
  s50: rgb(0.973, 0.98, 0.988),
  beyaz: rgb(1, 1, 1),
} as const;

/**
 * `#RRGGBB` → pdf-lib rengi.
 *
 * BOZUK DEĞER PATLAMAMALI. Marka rengi panelden serbest metin olarak
 * giriliyor; tek bir hatalı karakter yüzünden müşteriye giden belgenin
 * üretilmemesi kabul edilemez — nötr slate'e düşülüyor.
 */
export function renk(hex: string | null | undefined, varsayilan: RGB = SLATE.s900): RGB {
  if (!hex) return varsayilan;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return varsayilan;
  const n = parseInt(m[1]!, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Rengin üstünde beyaz mı koyu mu okunur — TOPLAM kartının yazı rengi. */
export function okunakliYazi(zemin: RGB): RGB {
  // Algısal parlaklık (ITU-R BT.601). Düz ortalama koyu maviyi açık sayıp
  // üstüne koyu yazı basıyordu.
  const l = 0.299 * zemin.red + 0.587 * zemin.green + 0.114 * zemin.blue;
  return l > 0.6 ? SLATE.s900 : SLATE.beyaz;
}

/**
 * TARİH ROZETİ — panelin `DateBadge`i: ince slate çerçeve, yuvarlak uçlar.
 *
 * pdf-lib'de gerçek yuvarlak uç yok; `borderRadius` desteklenmiyor. Dikdörtgen
 * + iki ucundaki daire ile aynı biçim kuruluyor. Kaçınılan alternatif düz bir
 * dikdörtgendi ve panelin yanında "başka bir belge" gibi duruyordu.
 */
export function rozet(
  s: PDFPage,
  opts: { metin: string; x: number; y: number; font: PDFFont; punto?: number },
): number {
  const punto = opts.punto ?? 8;
  const yaziG = opts.font.widthOfTextAtSize(opts.metin, punto);
  const h = punto + 8;
  const r = h / 2;
  const g = yaziG + 16;

  s.drawRectangle({
    x: opts.x + r,
    y: opts.y,
    width: g - 2 * r,
    height: h,
    color: SLATE.beyaz,
    borderColor: SLATE.s200,
    borderWidth: 0.8,
  });
  for (const cx of [opts.x + r, opts.x + g - r]) {
    s.drawCircle({ x: cx, y: opts.y + r, size: r, color: SLATE.beyaz, borderColor: SLATE.s200, borderWidth: 0.8 });
  }
  // Uçlardaki dairelerin çizgisi gövdeyi kesiyor; içeriyi tekrar boyayıp
  // yalnızca dış hat kalıyor.
  s.drawRectangle({ x: opts.x + r, y: opts.y + 0.8, width: g - 2 * r, height: h - 1.6, color: SLATE.beyaz });

  s.drawText(opts.metin, {
    x: opts.x + 8,
    y: opts.y + (h - punto) / 2 + 1,
    size: punto,
    font: opts.font,
    color: SLATE.s500,
  });
  return g;
}

/**
 * GÜNLÜK DÖNÜŞÜM SEYRİ — panelin `ConversionChart`ının aynısı.
 *
 * İKİ SERİ GRUPLU BAR, yığılmış DEĞİL. Yığmak "toplam dönüşüm" izlenimi
 * verirdi; oysa form ve mesaj ayrı işler ve müşterinin sorusu "hangisi
 * artıyor". Bu karar panelde alınmış ve gerekçesi orada yazılı; PDF'in ondan
 * ayrılması aynı grafiğin iki farklı hikâye anlatması demek olurdu.
 */
export function donusumGrafigi(
  s: PDFPage,
  opts: {
    noktalar: ReportDailyPoint[];
    from: string;
    to: string;
    x: number;
    y: number;
    genislik: number;
    yukseklik: number;
    formRengi: RGB;
    mesajRengi: RGB;
    font: PDFFont;
    kalin: PDFFont;
  },
): number {
  const { noktalar, x, y, genislik, yukseklik } = opts;
  if (noktalar.length === 0) return y;

  const SOL = 26;
  const cizimG = genislik - SOL;
  const GUN_MS = 86_400_000;
  const bas = Date.parse(`${opts.from}T00:00:00Z`);
  const gunSayisi = Math.max(
    1,
    Math.round((Date.parse(`${opts.to}T00:00:00Z`) - bas) / GUN_MS) + 1,
  );
  const enBuyuk = Math.max(
    1,
    ...noktalar.map((p) => Math.max(p.conversionCounts.form, p.conversionCounts.message)),
  );
  const dilim = cizimG / gunSayisi;
  const barG = Math.max(1.2, (dilim * 0.7) / 2);
  const taban = y - yukseklik;

  s.drawText('Günlük dönüşüm seyri', {
    x,
    y: y + 14,
    size: 9,
    font: opts.kalin,
    color: SLATE.s700,
  });

  // Efsane sağda — panelde de öyle.
  let ex = x + genislik;
  for (const [anahtar, c] of [
    ['message', opts.mesajRengi],
    ['form', opts.formRengi],
  ] as const) {
    const etiket = CONVERSION_BUCKETS[anahtar].label;
    const w = opts.font.widthOfTextAtSize(etiket, 7.5);
    ex -= w;
    s.drawText(etiket, { x: ex, y: y + 14, size: 7.5, font: opts.font, color: SLATE.s500 });
    ex -= 12;
    s.drawRectangle({ x: ex + 3, y: y + 13, width: 6, height: 6, color: c });
    ex -= 10;
  }

  // Y ekseni: dört çizgi yeterli, fazlası veriyi gölgeliyor.
  for (const r of [0, 0.25, 0.5, 0.75, 1]) {
    const yy = taban + yukseklik * r;
    s.drawLine({
      start: { x: x + SOL, y: yy },
      end: { x: x + genislik, y: yy },
      thickness: 0.5,
      color: r === 0 ? SLATE.s300 : SLATE.s100,
    });
    const etiket = formatNumber(Math.round(enBuyuk * r));
    s.drawText(etiket, {
      x: x + SOL - 4 - opts.font.widthOfTextAtSize(etiket, 6.5),
      y: yy - 2,
      size: 6.5,
      font: opts.font,
      color: SLATE.s400,
    });
  }

  const xOf = (tarih: string): number =>
    x + SOL + Math.round((Date.parse(`${tarih}T00:00:00Z`) - bas) / GUN_MS) * dilim + dilim / 2;

  for (const p of noktalar) {
    const cx = xOf(p.date);
    const ciftler: Array<[number, RGB, number]> = [
      [p.conversionCounts.form, opts.formRengi, -barG],
      [p.conversionCounts.message, opts.mesajRengi, 0],
    ];
    for (const [deger, c, kaydir] of ciftler) {
      if (deger <= 0) continue;
      s.drawRectangle({
        x: cx + kaydir,
        y: taban,
        width: barG,
        height: Math.max(0.6, (deger / enBuyuk) * yukseklik),
        color: c,
      });
    }
  }

  return taban - 14;
}
