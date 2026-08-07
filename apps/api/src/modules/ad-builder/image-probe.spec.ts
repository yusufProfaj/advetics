import { describe, expect, it } from 'vitest';
import { probeImage } from './image-probe';

/**
 * Görsel boyutu okuma.
 *
 * NEDEN BU TESTLER: oran doğrulaması tamamen buna dayanıyor. Yanlış okunan
 * bir boyut sessiz — dikey görsel kare sanılır, Meta'ya öyle gider ve akışta
 * kırpılmış görünür. Kullanıcı reklamı yayınladıktan sonra fark eder.
 *
 * JPEG'de en kolay yapılan hata GENİŞLİK/YÜKSEKLİK SIRASINI ters okumak:
 * spec'te yükseklik önce geliyor. Ters okuma 1080×1920 bir görseli 1920×1080
 * gösterir ve "dikey" kutusuna bırakılan görsel "yatay" diye reddedilir.
 */

/** Verilen boyutta minimal geçerli bir PNG başlığı üretir. */
function png(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8); // IHDR uzunluğu
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

/**
 * Verilen boyutta minimal geçerli bir JPEG üretir.
 *
 * Önüne bir APP0 (JFIF) segmenti konuyor: gerçek dosyalarda SOF asla ilk
 * segment değil ve taramanın gerçekten çalıştığını görmek gerekiyor.
 */
function jpeg(width: number, height: number, extraSegments = 1): Buffer {
  const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];

  for (let i = 0; i < extraSegments; i++) {
    const app = Buffer.alloc(18);
    app.writeUInt8(0xff, 0);
    app.writeUInt8(0xe0, 1);
    app.writeUInt16BE(16, 2); // uzunluk
    app.write('JFIF\0', 4, 'ascii');
    parts.push(app);
  }

  const sof = Buffer.alloc(11);
  sof.writeUInt8(0xff, 0);
  sof.writeUInt8(0xc0, 1); // SOF0
  sof.writeUInt16BE(9, 2); // uzunluk
  sof.writeUInt8(8, 4); // hassasiyet
  sof.writeUInt16BE(height, 5); // YÜKSEKLİK ÖNCE
  sof.writeUInt16BE(width, 7);
  sof.writeUInt8(1, 9); // bileşen sayısı
  parts.push(sof);

  return Buffer.concat(parts) as Buffer;
}

describe('PNG', () => {
  it('boyutu sabit ofsetten okuyor', () => {
    const r = probeImage(png(1080, 1080));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.info).toEqual({ width: 1080, height: 1080, mimeType: 'image/png' });
    }
  });

  it('DİKEY png: genişlik ve yükseklik karışmıyor', () => {
    const r = probeImage(png(1080, 1920));
    expect(r.ok && r.info.width).toBe(1080);
    expect(r.ok && r.info.height).toBe(1920);
  });

  it('IHDR yoksa reddediyor', () => {
    const bad = png(100, 100);
    bad.write('XXXX', 12, 'ascii');
    expect(probeImage(bad).ok).toBe(false);
  });
});

describe('JPEG', () => {
  it('SOF segmentini TARAYARAK buluyor', () => {
    // Gerçek dosyalarda SOF asla ilk segment değil; EXIF ve renk profili
    // blokları önce geliyor.
    const r = probeImage(jpeg(1200, 628, 3));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.info).toEqual({ width: 1200, height: 628, mimeType: 'image/jpeg' });
    }
  });

  it('KRİTİK: yükseklik/genişlik sırası doğru', () => {
    // Spec'te YÜKSEKLİK önce geliyor. Ters okuma 1080×1920 dikey görseli
    // 1920×1080 yatay gösterir ve oran doğrulaması tam ters çalışır.
    const r = probeImage(jpeg(1080, 1920));
    expect(r.ok && r.info.width).toBe(1080);
    expect(r.ok && r.info.height).toBe(1920);
  });

  it('progressive JPEG (SOF2) da okunuyor', () => {
    const buf = jpeg(800, 800);
    // SOF0 → SOF2. Konum: 2 (SOI) + 18 (APP0) + 1 = 21.
    buf.writeUInt8(0xc2, 21);
    const r = probeImage(buf);
    expect(r.ok && r.info.width).toBe(800);
  });

  it('DHT segmenti SOF sanılmıyor', () => {
    // 0xc4 aralık içinde ama SOF değil; boyut okumaya çalışmak çöp değer
    // üretirdi ve o çöp oran doğrulamasından geçebilirdi.
    const parts: Buffer[] = [Buffer.from([0xff, 0xd8])];
    const dht = Buffer.alloc(12);
    dht.writeUInt8(0xff, 0);
    dht.writeUInt8(0xc4, 1);
    dht.writeUInt16BE(10, 2);
    parts.push(dht);
    parts.push(Buffer.from(jpeg(640, 480).subarray(2)));
    const r = probeImage(Buffer.concat(parts) as Buffer);
    expect(r.ok && r.info.width).toBe(640);
    expect(r.ok && r.info.height).toBe(480);
  });

  it('SOF bulunamazsa reddediyor', () => {
    // SOI + SOS (sıkıştırılmış veri başlangıcı), arada SOF yok.
    const buf = Buffer.concat([
      Buffer.from([0xff, 0xd8]),
      Buffer.from([0xff, 0xda, 0x00, 0x0c]),
      Buffer.alloc(20),
    ]) as Buffer;
    expect(probeImage(buf).ok).toBe(false);
  });
});

describe('reddedilen dosyalar', () => {
  it('UZANTIYA DEĞİL İÇERİĞE bakıyor', () => {
    // `.jpg` uzantılı bir PDF, uzantıya güvenildiğinde Meta'ya gider ve
    // orada anlaşılmaz bir hata döner.
    const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(40)]) as Buffer;
    const r = probeImage(pdf);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('JPG ve PNG');
  });

  it('HEIC için yönlendirici mesaj', () => {
    // iPhone varsayılanı HEIC ve bu, kullanıcının en sık karşılaşacağı hata.
    // "Desteklenmiyor" demek yetmez, ne yapacağını söylemek gerekiyor.
    const heic = Buffer.concat([
      Buffer.alloc(4),
      Buffer.from('ftypheic'),
      Buffer.alloc(30),
    ]) as Buffer;
    const r = probeImage(heic);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('HEIC');
  });

  it('çok küçük dosya', () => {
    expect(probeImage(Buffer.alloc(10)).ok).toBe(false);
  });

  it('boş dosya çökmüyor', () => {
    expect(probeImage(Buffer.alloc(0)).ok).toBe(false);
  });
});
