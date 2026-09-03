import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

/**
 * ═══ SEKME İKONU ═══
 *
 * Kullanıcının bildirdiği hâl: tarayıcı sekmesinde genel bir "dünya" simgesi
 * görünüyordu. Sebep basitti — `app/` altında hiçbir `icon`/`favicon` dosyası
 * yoktu, yani Next.js hiçbir `<link rel="icon">` üretmiyor ve tarayıcı
 * varsayılana düşüyordu.
 *
 * Bu dosya iki şeyi kilitliyor: ikonların VAR olduğu ve işaretin logodan
 * KOPMADIĞI.
 */

const APP = __dirname;
const ISARET = readFileSync(join(APP, 'marka-isareti.tsx'), 'utf8');

/** Yorumsuz kaynak — iddialar açıklamalara değil KODA çapalanmalı. */
function kod(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
}

/**
 * PNG'yi çözüp piksellerini verir.
 *
 * Kütüphane eklemedim: tek bir testin ihtiyacı için bağımlılık, paylaşımlı
 * sunucuda kurulum yükü demek ve bu depo `pdf-lib`i tam da o yüzden seçti.
 */
function pikseller(yol: string): { w: number; h: number; veri: Buffer; kanal: number } {
  const b = readFileSync(yol);
  const w = b.readUInt32BE(16);
  const h = b.readUInt32BE(20);
  const colorType = b[25];
  const kanal = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  expect(kanal, `desteklenmeyen PNG renk tipi: ${colorType}`).toBeGreaterThan(0);

  const parcalar: Buffer[] = [];
  let off = 8;
  while (off < b.length) {
    const len = b.readUInt32BE(off);
    if (b.subarray(off + 4, off + 8).toString() === 'IDAT') {
      parcalar.push(b.subarray(off + 8, off + 8 + len));
    }
    off += 12 + len;
  }
  const ham = inflateSync(Buffer.concat(parcalar));

  // PNG satır süzgeçleri çözülüyor (None/Sub/Up/Average/Paeth).
  const adim = w * kanal;
  const veri = Buffer.alloc(h * adim);
  for (let y = 0; y < h; y++) {
    const f = ham[y * (adim + 1)]!;
    const satir = ham.subarray(y * (adim + 1) + 1, (y + 1) * (adim + 1));
    for (let x = 0; x < adim; x++) {
      const a = x >= kanal ? veri[y * adim + x - kanal]! : 0;
      const ust = y > 0 ? veri[(y - 1) * adim + x]! : 0;
      const ustSol = x >= kanal && y > 0 ? veri[(y - 1) * adim + x - kanal]! : 0;
      let v = satir[x]!;
      if (f === 1) v += a;
      else if (f === 2) v += ust;
      else if (f === 3) v += (a + ust) >> 1;
      else if (f === 4) {
        const p = a + ust - ustSol;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - ust);
        const pc = Math.abs(p - ustSol);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? ust : ustSol;
      }
      veri[y * adim + x] = v & 255;
    }
  }
  return { w, h, veri, kanal };
}

describe('sekme ikonu — dosyalar var', () => {
  it('KRİTİK: `icon` ve `apple-icon` MEVCUT', () => {
    /*
     * Hatanın tamamı buydu: dosya yoksa Next.js `<link rel="icon">`
     * üretmiyor ve tarayıcı kendi genel simgesini gösteriyor. Hiçbir hata
     * düşmüyor — sessiz bir eksiklik.
     */
    expect(() => readFileSync(join(APP, 'icon.tsx'))).not.toThrow();
    expect(() => readFileSync(join(APP, 'apple-icon.tsx'))).not.toThrow();
  });

  it('KRİTİK: her iki ikon da AYNI işareti çiziyor', () => {
    // Ayrı çizilselerdi aynı ürün iki marka gibi görünürdü.
    for (const dosya of ['icon.tsx', 'apple-icon.tsx']) {
      const s = kod(readFileSync(join(APP, dosya), 'utf8'));
      expect(s, `${dosya} ortak işareti kullanmıyor`).toContain('markaIsareti(size.width)');
    }
  });

  it('Open Graph görseli de AYNI rengi kullanıyor', () => {
    /*
     * `opengraph-image.tsx` kendi kırmızısını (#e11d2e) yazıyordu ve o değer
     * logonun kırmızısı DEĞİLDİ — aynı markanın iki gösterimi ayrışmıştı.
     */
    const og = kod(readFileSync(join(APP, 'opengraph-image.tsx'), 'utf8'));
    expect(og).toContain('ADVETICS_KIRMIZI');
    expect(og, 'elle yazılmış kırmızı geri gelmiş').not.toContain('#e11d2e');
  });

  it('ikon boyutları tarayıcının beklediği ölçülerde', () => {
    expect(kod(readFileSync(join(APP, 'icon.tsx'), 'utf8'))).toContain('width: 32, height: 32');
    // 180 Apple'ın istediği en büyük ölçü; küçükleri ondan türetiliyor.
    expect(kod(readFileSync(join(APP, 'apple-icon.tsx'), 'utf8'))).toContain(
      'width: 180, height: 180',
    );
  });
});

describe('işaret rengi — logodan ÖLÇÜLÜYOR', () => {
  it('KRİTİK: ADVETICS_KIRMIZI logonun baskın kırmızısıyla AYNI', () => {
    /*
     * Renk elle yazılmış bir sabit ve logo ayrı bir ikili dosya: biri
     * güncellenip diğeri unutulursa sekme ikonu logodan farklı bir kırmızı
     * gösterir ve kimse fark etmez. `marka-logosu.spec.ts` iki logo kopyası
     * için aynı kararı veriyor — bu, aynı korumanın renk hâli.
     *
     * ÖLÇÜM: logodaki "i" harfinin noktası tek kırmızı bölge. Doygun kırmızı
     * pikseller sayılıp en sık görüleni alınıyor; kenar yumuşatma yüzünden
     * ara tonlar var ve baskın değer gerçek marka rengi.
     */
    const yol = join(APP, '..', '..', 'public', 'advetics-logo.png');
    const { w, h, veri, kanal } = pikseller(yol);

    const sayac = new Map<string, number>();
    for (let i = 0; i < w * h; i++) {
      const r = veri[i * kanal]!;
      const g = veri[i * kanal + 1]!;
      const b = veri[i * kanal + 2]!;
      const alfa = kanal === 4 ? veri[i * kanal + 3]! : 255;
      if (alfa < 200) continue;
      // Doygun kırmızı: kırmızı bileşen diğer ikisini belirgin biçimde aşıyor.
      if (r > 120 && r > g * 1.8 && r > b * 1.8) {
        const k = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
        sayac.set(k, (sayac.get(k) ?? 0) + 1);
      }
    }

    expect(sayac.size, 'logoda kırmızı bulunamadı — tarama boşa düştü').toBeGreaterThan(0);
    const baskin = [...sayac.entries()].sort((a, b) => b[1] - a[1])[0]![0];

    const sabit = /ADVETICS_KIRMIZI = '(#[0-9a-f]{6})'/.exec(ISARET)?.[1];
    expect(sabit, 'ADVETICS_KIRMIZI bulunamadı — tarama boşa düştü').toBeDefined();
    expect(sabit).toBe(baskin);
  });
});

describe('işaretin çizimi', () => {
  it('KRİTİK: harf METİN değil ÇİZİM', () => {
    /*
     * Önce `fontWeight: 700` ile metin olarak yazıldı ve üretilen ikona
     * BAKILDIĞINDA harf ince çıkıyordu: `ImageResponse`un gömülü varsayılan
     * fontu kalın kesimi taşımıyor ve ağırlık SESSİZCE yok sayılıyor.
     * Logonun ayırt edici özelliği ağır geometrik harfleri.
     */
    const k = kod(ISARET);
    expect(k).toContain('<svg');
    expect(k).toContain('strokeWidth');
    expect(k, 'font ağırlığına geri dönülmüş — satori onu yok sayıyor').not.toContain(
      'fontWeight',
    );
  });

  it('KRİTİK: ölçüler KENARA ORANLI — 32 ve 180 aynı çizimi veriyor', () => {
    /*
     * Sabit piksel değeri 32'lik ikonda doğru görünüp 180'likte neredeyse
     * kare bırakırdı. `viewBox` da bu yüzden 100×100: koordinatlar kenar
     * uzunluğundan bağımsız.
     */
    const k = kod(ISARET);
    expect(k).toContain('kenar * 0.22');
    expect(k).toContain('viewBox="0 0 100 100"');
  });

  it('bu renk AJANSIN `--brand-primary` rengi DEĞİL', () => {
    /*
     * `--brand-primary` müşteriye göre değişiyor (beyaz etiket). Sekme ikonu
     * ÜRÜNÜN kendisini temsil ediyor; ajans rengini değiştirdi diye tarayıcı
     * sekmesi değişmemeli.
     */
    const k = kod(ISARET);
    expect(k).not.toContain('--brand-primary');
    expect(k).not.toContain('var(--brand');
  });
});
