import { rgb, type RGB, type PDFFont, type PDFPage } from 'pdf-lib';
import { formatNumber, type ReportDailyPoint } from '@advetics/shared';

/**
 * ═══ PDF ÇİZİM YARDIMCILARI — RENK, TABLO BANDI, GRAFİK ═══
 *
 * Rapor PDF'i uzun süre "boş metin gibi" görünüyordu ve sebebi tek tek
 * bakınca küçük ama üst üste geldiğinde belirleyici: marka rengi hiç
 * kullanılmıyordu, tabloların başlık bandı ve satır ayırıcısı yoktu, ve
 * elde duran günlük seri (`data.daily`) HİÇ ÇİZİLMİYORDU. Panelde grafiği
 * gören danışman aynı raporu PDF olarak indirince yalnızca sayı listesi
 * alıyordu.
 *
 * GRAFİK VEKTÖREL ÇİZİLİYOR, GÖRSEL DEĞİL. `pdf-lib` dikdörtgen ve çizgi
 * çizebiliyor; bir bar grafiği için bu yeterli. Sunucuda görsel üretmek
 * (canvas, headless tarayıcı) paylaşımlı VPS'te yeni bir ikili bağımlılık
 * demekti ve bu proje tam olarak ondan kaçınmak için `pdf-lib` seçti.
 */

/** Varsayılan gri — marka rengi okunamadığında. */
const NOTR: RGB = rgb(0.16, 0.17, 0.2);

/**
 * `#RRGGBB` → pdf-lib rengi.
 *
 * BOZUK DEĞER PATLAMAMALI. Marka rengi panelden serbest metin olarak
 * giriliyor; tek bir hatalı karakter yüzünden müşteriye giden belgenin
 * üretilmemesi kabul edilemez — nötr renge düşülüyor.
 */
export function renk(hex: string | null | undefined, varsayilan: RGB = NOTR): RGB {
  if (!hex) return varsayilan;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return varsayilan;
  const n = parseInt(m[1]!, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Rengin üstünde beyaz mı siyah mı okunur — bandın yazı rengi buna bağlı. */
export function okunakliYazi(zemin: RGB): RGB {
  // Algısal parlaklık (ITU-R BT.601). Basit ortalama, koyu maviyi açık
  // sayıp üstüne siyah yazıyordu.
  const l = 0.299 * zemin.red + 0.587 * zemin.green + 0.114 * zemin.blue;
  return l > 0.6 ? rgb(0.1, 0.1, 0.12) : rgb(1, 1, 1);
}

/**
 * GÜNLÜK HARCAMA VE DÖNÜŞÜM GRAFİĞİ.
 *
 * Panelin grafiğiyle AYNI kararlar: barlar harcama, çizgi dönüşüm, veri
 * olmayan gün ATLANIYOR (sıfırla doldurmak "o gün reklam durdu" demekle
 * aynı) ve barlar tarihe göre konumlanıyor — sıraya göre değil, yoksa
 * boşluklar kayboluyor.
 *
 * Dönen değer: çizimden sonraki `y`. Çağıran sayfayı buradan sürdürüyor.
 */
export function grafik(
  s: PDFPage,
  opts: {
    noktalar: ReportDailyPoint[];
    from: string;
    to: string;
    x: number;
    y: number;
    genislik: number;
    yukseklik: number;
    barRengi: RGB;
    cizgiRengi: RGB;
    font: PDFFont;
    gri: RGB;
  },
): number {
  const { noktalar, x, y, genislik, yukseklik } = opts;
  if (noktalar.length === 0) return y;

  const GUN_MS = 86_400_000;
  const bas = Date.parse(`${opts.from}T00:00:00Z`);
  const son = Date.parse(`${opts.to}T00:00:00Z`);
  const gunSayisi = Math.max(1, Math.round((son - bas) / GUN_MS) + 1);
  const dilim = genislik / gunSayisi;
  const barGenisligi = Math.max(1, Math.min(18, dilim * 0.62));

  const harcama = noktalar.map((p) => Number(BigInt(p.spendMicros) / 1000n) / 1000);
  const donusum = noktalar.map(
    (p) => p.conversionCounts.form + p.conversionCounts.message + p.conversionCounts.purchase,
  );
  const enBuyukHarcama = Math.max(...harcama, 1);
  const enBuyukDonusum = Math.max(...donusum, 1);

  const xOf = (tarih: string): number =>
    x + Math.round((Date.parse(`${tarih}T00:00:00Z`) - bas) / GUN_MS) * dilim + dilim / 2;

  // Taban çizgisi — barların nereye oturduğu belli olsun.
  s.drawLine({
    start: { x, y: y - yukseklik },
    end: { x: x + genislik, y: y - yukseklik },
    thickness: 0.5,
    color: opts.gri,
  });

  noktalar.forEach((p, i) => {
    const h = (harcama[i]! / enBuyukHarcama) * yukseklik;
    s.drawRectangle({
      x: xOf(p.date) - barGenisligi / 2,
      y: y - yukseklik,
      width: barGenisligi,
      height: Math.max(0.5, h),
      color: opts.barRengi,
      opacity: 0.85,
    });
  });

  /*
   * DÖNÜŞÜM ÇİZGİSİ yalnızca dönüşümü OLAN günleri birleştiriyor. Sıfır
   * günlerden geçirmek çizgiyi tabana çekip yanlış bir düşüş anlatırdı —
   * paneldeki grafikte de aynı karar veriliyor.
   */
  const dolu = noktalar.map((p, i) => ({ p, d: donusum[i]! })).filter((n) => n.d > 0);
  for (let i = 1; i < dolu.length; i++) {
    const a = dolu[i - 1]!;
    const b = dolu[i]!;
    s.drawLine({
      start: { x: xOf(a.p.date), y: y - yukseklik + (a.d / enBuyukDonusum) * yukseklik },
      end: { x: xOf(b.p.date), y: y - yukseklik + (b.d / enBuyukDonusum) * yukseklik },
      thickness: 1.4,
      color: opts.cizgiRengi,
    });
  }

  // Uçlardaki tarih ve tepe değerler — eksen yerine geçiyor. Tam bir eksen
  // bu boyutta okunmuyor, uçlar ölçeği anlatmaya yetiyor.
  const kucuk = 7;
  s.drawText(`en yüksek ${formatNumber(Math.round(enBuyukHarcama))}`, {
    x,
    y: y + 4,
    size: kucuk,
    font: opts.font,
    color: opts.gri,
  });
  const sagMetin = `${formatNumber(enBuyukDonusum)} dönüşüm`;
  s.drawText(sagMetin, {
    x: x + genislik - opts.font.widthOfTextAtSize(sagMetin, kucuk),
    y: y + 4,
    size: kucuk,
    font: opts.font,
    color: opts.gri,
  });

  return y - yukseklik - 12;
}
