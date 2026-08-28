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

/**
 * ═══ TABLO — ÜÇ BÖLÜM İÇİN TEK ÇİZİCİ ═══
 *
 * Kampanya tablosu düzgün bir tabloydu; anahtar kelime ve arama terimi
 * sayfaları ise DÜZ LİSTEYDİ: solda terim, sağda birleştirilmiş bir metrik
 * dizesi ("203,76 ₺   20 tık   1 dönüşüm"). Panelde üçü de sütunlu tablo.
 * Aynı raporun iki gösterimi arasındaki en görünür ayrışma buydu — ve
 * kullanıcının tarifi *"birbirleriyle alakası yok"*.
 *
 * Üçü de artık BURADAN geçiyor. Ayrı ayrı çizilirken biri düzeltilip diğeri
 * unutuluyordu; tek çizici bunu imkânsız kılıyor.
 *
 * Panelin tablo dili birebir taşınıyor: 7 punto BÜYÜK HARF başlık (slate-500),
 * altında 1,6 punto slate-300 kural, satırlar arasında 0,5 punto slate-100
 * ayırıcı, sayılar SAĞA yaslı.
 */
export interface TabloSutunu<T> {
  baslik: string;
  /** Sütunun genişlik PAYI. Toplam paya bölünüp kullanılabilir alana yayılıyor. */
  pay: number;
  /** Sayı sütunları sağa yaslı; yalnızca ilk (ad) sütunu sola. */
  sag?: boolean;
  /** Harcama sütunu kalın — gözün ilk gitmesi gereken sayı o. */
  kalinDeger?: boolean;
  deger: (satir: T) => string;
}

export function tablo<T>(
  s: PDFPage,
  opts: {
    sutunlar: Array<TabloSutunu<T>>;
    satirlar: T[];
    x: number;
    y: number;
    genislik: number;
    altSinir: number;
    normal: PDFFont;
    kalin: PDFFont;
    /** Son satır olarak çizilecek toplam; `null` = toplam satırı yok. */
    toplam?: { etiket: string; degerler: Array<string | null> } | null;
  },
): { y: number; cizilen: number } {
  const { sutunlar, satirlar, x, genislik } = opts;
  let y = opts.y;

  const toplamPay = sutunlar.reduce((a, c) => a + c.pay, 0);
  const genislikler = sutunlar.map((c) => (c.pay / toplamPay) * genislik);
  /** Sütunun sol kenarı. */
  const solX = (i: number): number =>
    x + genislikler.slice(0, i).reduce((a, b) => a + b, 0);
  /** Metnin çizileceği x — sağa yaslıysa sütunun sağ kenarından geri sayılıyor. */
  const yazX = (i: number, metin: string, font: PDFFont, punto: number): number =>
    sutunlar[i]!.sag
      ? solX(i) + genislikler[i]! - font.widthOfTextAtSize(metin, punto)
      : solX(i);

  // Başlık
  sutunlar.forEach((c, i) => {
    const metin = c.baslik.toLocaleUpperCase('tr');
    s.drawText(metin, { x: yazX(i, metin, opts.kalin, 7), y, size: 7, font: opts.kalin, color: SLATE.s500 });
  });
  y -= 7;
  s.drawLine({
    start: { x, y },
    end: { x: x + genislik, y },
    thickness: 1.6,
    color: SLATE.s300,
  });
  y -= 14;

  let cizilen = 0;
  for (const satir of satirlar) {
    // Toplam satırına yer bırak: son satırı çizip toplamı düşürmek, tablonun
    // en çok bakılan rakamını sessizce yutmak olurdu.
    if (y < opts.altSinir + (opts.toplam ? 18 : 0)) break;

    s.drawLine({
      start: { x, y: y - 5 },
      end: { x: x + genislik, y: y - 5 },
      thickness: 0.5,
      color: SLATE.s100,
    });

    sutunlar.forEach((c, i) => {
      const font = c.kalinDeger ? opts.kalin : opts.normal;
      const ham = c.deger(satir);
      const metin = kisalt(ham, font, 8.5, genislikler[i]! - 6);
      s.drawText(metin, {
        x: yazX(i, metin, font, 8.5),
        y,
        size: 8.5,
        font,
        color: SLATE.s900,
      });
    });
    y -= 15;
    cizilen++;
  }

  if (opts.toplam) {
    y -= 4;
    s.drawLine({
      start: { x, y: y + 10 },
      end: { x: x + genislik, y: y + 10 },
      thickness: 1.6,
      color: SLATE.s300,
    });
    s.drawText(opts.toplam.etiket.toLocaleUpperCase('tr'), {
      x,
      y,
      size: 7.5,
      font: opts.kalin,
      color: SLATE.s500,
    });
    opts.toplam.degerler.forEach((deger, i) => {
      // İlk sütun etiketin kendisi; değerler ikinciden başlıyor.
      const sutunNo = i + 1;
      if (sutunNo >= sutunlar.length) return;
      /*
       * TOPLANAMAYAN SÜTUNA "—". Boş bırakmak "hesaplanmadı" gibi okunuyordu;
       * sıfır yazmak ise erişimde "iki kat kitle" demek olurdu.
       */
      /*
       * TOPLAM DA KISALTILIYOR. Gövde hücreleri kısaltılırken toplam satırı
       * ham çiziliyordu: uzun bir toplam sütunundan taşıp komşu sütunun
       * üstüne biniyordu ve iki sayı üst üste okunmaz hâle geliyordu.
       * Taşma kırpmadan daha kötü — kırpma en azından görünür.
       */
      const metin = kisalt(deger ?? '—', opts.kalin, 8.5, genislikler[sutunNo]! - 6);
      s.drawText(metin, {
        x: yazX(sutunNo, metin, opts.kalin, 8.5),
        y,
        size: 8.5,
        font: opts.kalin,
        color: deger === null ? SLATE.s400 : SLATE.s900,
      });
    });
    y -= 15;
  }

  return { y, cizilen };
}

/** Metni sütuna sığdırır; sığmıyorsa sondan kısaltıp üç nokta koyar. */
export function kisalt(metin: string, font: PDFFont, punto: number, maks: number): string {
  if (font.widthOfTextAtSize(metin, punto) <= maks) return metin;
  let kesik = metin;
  while (kesik.length > 1 && font.widthOfTextAtSize(`${kesik}…`, punto) > maks) {
    kesik = kesik.slice(0, -1);
  }
  return `${kesik}…`;
}

/**
 * ═══ HALKA GRAFİĞİ ═══
 *
 * Panel raporundaki halkaların PDF karşılığı. Aynı sayfa iki yerde
 * gösteriliyor ve biri diğerinde olmayan bir bölüm çizerse belge ile ekran
 * ayrışıyor — bu depoda bir kez yaşandı ve referans olarak panel seçildi.
 *
 * DİLİMLER ÇOKGENLE ÇİZİLİYOR, YAY KOMUTUYLA DEĞİL. `pdf-lib`in SVG yol
 * ayrıştırıcısına `A` (arc) komutu vermek sürüme bağlı bir bahis; `M`/`L`/`Z`
 * her sürümde çalışıyor. Yayı yeterince küçük parçalara bölmek 24 punto
 * yarıçapta gözle ayırt edilemiyor.
 *
 * TAM DAİRE DE ÇALIŞIYOR: tek dilim %100 olduğunda çokgen kapanıyor ve halka
 * dolu çiziliyor. Yay komutuyla aynı durum dejenere bir yay üretip HİÇBİR ŞEY
 * çizmezdi — tek cinsiyetli bir hesapta halka boş görünürdü.
 */
export function halka(
  s: PDFPage,
  opts: {
    cx: number;
    cy: number;
    disR: number;
    icR: number;
    dilimler: Array<{ oran: number; renk: RGB }>;
  },
): void {
  let baslangic = -Math.PI / 2; // Saat 12'den başla — panelle aynı.

  for (const d of opts.dilimler) {
    if (d.oran <= 0) continue;
    const aci = d.oran * 2 * Math.PI;
    // Adım sayısı açıyla ölçekleniyor: küçük dilimde fazladan nokta
    // hesaplamak boşuna, büyük dilimde az nokta köşeli görünür.
    const adim = Math.max(3, Math.ceil((aci / (2 * Math.PI)) * 64));
    const noktalar: string[] = [];

    for (let i = 0; i <= adim; i++) {
      const a = baslangic + (aci * i) / adim;
      noktalar.push(`${(opts.cx + Math.cos(a) * opts.disR).toFixed(2)} ${(opts.cy + Math.sin(a) * opts.disR).toFixed(2)}`);
    }
    for (let i = adim; i >= 0; i--) {
      const a = baslangic + (aci * i) / adim;
      noktalar.push(`${(opts.cx + Math.cos(a) * opts.icR).toFixed(2)} ${(opts.cy + Math.sin(a) * opts.icR).toFixed(2)}`);
    }

    s.drawSvgPath(`M ${noktalar.join(' L ')} Z`, {
      x: 0,
      y: s.getHeight(),
      color: d.renk,
      borderWidth: 0,
    });

    baslangic += aci;
  }
}

/**
 * Tek çizgilik eğri — günlük form serisi.
 *
 * Nokta ETİKETLERİ yalnızca ilk, son ve en yüksek günde: 31 günlük bir seride
 * her noktayı etiketlemek sayıları üst üste bindiriyor ve hiçbiri okunmuyor.
 * Panel de aynı üç noktayı etiketliyor.
 */
export function egri(
  s: PDFPage,
  font: PDFFont,
  opts: {
    x: number;
    y: number;
    genislik: number;
    yukseklik: number;
    degerler: number[];
    renk: RGB;
  },
): void {
  const { degerler } = opts;
  if (degerler.length < 2) return;

  const enYuksek = Math.max(...degerler, 1);
  const px = (i: number): number => opts.x + (i / (degerler.length - 1)) * opts.genislik;
  const py = (v: number): number => opts.y + (v / enYuksek) * opts.yukseklik;

  // Taban çizgisi — eğrinin nereye oturduğu görünsün.
  s.drawLine({
    start: { x: opts.x, y: opts.y },
    end: { x: opts.x + opts.genislik, y: opts.y },
    thickness: 0.6,
    color: SLATE.s200,
  });

  for (let i = 1; i < degerler.length; i++) {
    s.drawLine({
      start: { x: px(i - 1), y: py(degerler[i - 1]!) },
      end: { x: px(i), y: py(degerler[i]!) },
      thickness: 1.2,
      color: opts.renk,
    });
  }

  const zirve = degerler.indexOf(enYuksek);
  for (const i of [...new Set([0, zirve, degerler.length - 1])]) {
    s.drawCircle({ x: px(i), y: py(degerler[i]!), size: 1.8, color: opts.renk });
    const metin = String(degerler[i]);
    s.drawText(metin, {
      x: px(i) - font.widthOfTextAtSize(metin, 6) / 2,
      y: py(degerler[i]!) + 4,
      size: 6,
      font,
      color: SLATE.s500,
    });
  }
}
