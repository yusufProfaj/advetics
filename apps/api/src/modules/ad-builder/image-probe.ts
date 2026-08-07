/**
 * Görsel boyutu okuma — BAĞIMLILIK EKLEMEDEN.
 *
 * `sharp` ya da `image-size` eklemek cazip ama `sharp` yerel derleme
 * gerektiriyor ve bu proje 11 başka sitenin paylaştığı bir VPS'te çalışıyor:
 * derleme araçları kurmak ya da node sürümüne bağlı ikili indirmek, tam da
 * kaçınmamız gereken sistem geneli dokunuş.
 *
 * Yalnızca iki format kabul ediyoruz (JPEG, PNG) ve ikisinin de boyutu
 * başlıktan okunabiliyor: PNG'de sabit ofset, JPEG'de segment taraması.
 * Toplam ~70 satır ve tamamen saf.
 *
 * BOYUT NEDEN ÖNEMLİ: kullanıcının yüklediği görselin gerçekten kare olup
 * olmadığını yalnızca ölçerek biliyoruz. Dosya adına ya da kullanıcının
 * hangi kutuya bıraktığına güvenmek, dikey görseli kare diye Meta'ya
 * göndermek demek — reklam yayınlanır ve akışta kırpılmış görünür.
 */

export interface ImageInfo {
  width: number;
  height: number;
  mimeType: 'image/jpeg' | 'image/png';
}

export type ProbeResult =
  | { ok: true; info: ImageInfo }
  | { ok: false; reason: string };

export function probeImage(buf: Buffer): ProbeResult {
  if (buf.length < 24) return { ok: false, reason: 'Dosya çok küçük — görsel değil.' };

  if (isPng(buf)) {
    const png = readPng(buf);
    return png
      ? { ok: true, info: { ...png, mimeType: 'image/png' } }
      : { ok: false, reason: 'PNG dosyası bozuk görünüyor.' };
  }

  if (isJpeg(buf)) {
    const jpeg = readJpeg(buf);
    return jpeg
      ? { ok: true, info: { ...jpeg, mimeType: 'image/jpeg' } }
      : { ok: false, reason: 'JPEG dosyası bozuk görünüyor.' };
  }

  // DOSYA UZANTISINA DEĞİL İÇERİĞE bakıyoruz. `.jpg` uzantılı bir PDF ya da
  // HEIC, uzantıya güvenildiğinde Meta'ya gider ve orada anlaşılmaz bir hata
  // döner.
  return {
    ok: false,
    reason: 'Yalnızca JPG ve PNG kabul ediliyor. iPhone HEIC ise JPG olarak dışa aktar.',
  };
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function isPng(buf: Buffer): boolean {
  return buf.subarray(0, 8).equals(PNG_MAGIC);
}

/**
 * PNG: boyut daima IHDR chunk'ında, sabit ofsette.
 *
 * 8 bayt imza + 4 bayt uzunluk + 4 bayt tip ("IHDR") = 16. Genişlik 16-19,
 * yükseklik 20-23, ikisi de big-endian.
 */
function readPng(buf: Buffer): { width: number; height: number } | null {
  if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return width > 0 && height > 0 ? { width, height } : null;
}

function isJpeg(buf: Buffer): boolean {
  return buf[0] === 0xff && buf[1] === 0xd8;
}

/**
 * JPEG: boyut SOF (Start Of Frame) segmentinde ve yeri sabit DEĞİL.
 *
 * Dosya, değişken uzunlukta segmentlerden oluşuyor; EXIF ve renk profili
 * bloklarını atlayıp SOF'a ulaşmak gerekiyor. Bu yüzden tarama.
 *
 * SOF2 (progressive) ve SOF0 (baseline) dâhil tüm SOF türleri aynı yapıda:
 * 2 bayt uzunluk + 1 bayt hassasiyet + 2 bayt YÜKSEKLİK + 2 bayt GENİŞLİK.
 * Sıra dikkat: yükseklik ÖNCE geliyor ve ters okumak dikey görseli yatay
 * gösterir — oran doğrulaması bu yüzden yanlış çalışırdı.
 */
function readJpeg(buf: Buffer): { width: number; height: number } | null {
  let offset = 2;

  while (offset < buf.length - 9) {
    if (buf[offset] !== 0xff) {
      offset++;
      continue;
    }

    const marker = buf[offset + 1] as number;

    // Dolgu baytları ve boyut taşımayan işaretçiler.
    if (marker === 0xff) {
      offset++;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd9)) {
      offset += 2;
      continue;
    }

    const length = buf.readUInt16BE(offset + 2);
    if (length < 2) return null;

    // SOF0–SOF15, ancak DHT (0xc4), JPG (0xc8) ve DAC (0xcc) SOF DEĞİL.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

    if (isSof) {
      if (offset + 9 > buf.length) return null;
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return width > 0 && height > 0 ? { width, height } : null;
    }

    // SOS (0xda) sonrası sıkıştırılmış veri başlıyor; SOF bulunamadıysa
    // taramaya devam etmenin anlamı yok.
    if (marker === 0xda) return null;

    offset += 2 + length;
  }

  return null;
}
