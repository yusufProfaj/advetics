import { describe, expect, it } from 'vitest';
import { probeVideo } from './video-probe';

/**
 * ═══ VİDEO ÖLÇÜSÜ — SENTETİK MP4 ÜRETİLİP ÇALIŞTIRILARAK SINANIYOR ═══
 *
 * Bu dosyanın var oluş sebebi somut: `tkhd` matris ofsetini ilk yazımda
 * 80/92 olarak yazmıştım (doğrusu 40/52) ve ölçüler HEP SIFIR okunuyordu.
 * Kod derleniyor, tipler doğru, hiçbir hata düşmüyor — yalnızca her video
 * "en/boy bilgisi okunamadı" diyor.
 *
 * Kaynak taramasıyla yakalanamazdı: yanlış olan şey bir sayıydı. Kutuları
 * ELLE KURUP FONKSİYONU ÇALIŞTIRMAK tek yol.
 */

/** MP4 kutusu: 4 bayt boyut + 4 bayt tip + gövde. */
function kutu(tip: string, govde: Buffer): Buffer {
  const bas = Buffer.alloc(8);
  bas.writeUInt32BE(govde.length + 8, 0);
  bas.write(tip, 4, 'latin1');
  return Buffer.concat([bas, govde]);
}

function ftyp(marka = 'isom'): Buffer {
  const govde = Buffer.alloc(16);
  govde.write(marka, 0, 'latin1');
  govde.writeUInt32BE(512, 4);
  govde.write('iso2', 8, 'latin1');
  return kutu('ftyp', govde);
}

/** `mvhd` sürüm 0 — zaman ölçeği ve süre. */
function mvhd(olcek: number, adet: number): Buffer {
  const govde = Buffer.alloc(100);
  govde.writeUInt32BE(olcek, 12);
  govde.writeUInt32BE(adet, 16);
  return kutu('mvhd', govde);
}

/**
 * `tkhd` sürüm 0.
 *
 * Gövde: 4 (sürüm+bayrak) + 4 + 4 + 4 + 4 + 4 + 8 + 2 + 2 + 2 + 2 = 40,
 * sonra 36 baytlık matris, sonra 16.16 sabit noktalı en/boy.
 */
function tkhd(w: number, h: number, dondurulmus = false): Buffer {
  const govde = Buffer.alloc(84);
  govde.writeUInt32BE(1, 12); // iz kimliği
  // Matris 40. bayttan başlıyor.
  if (dondurulmus) {
    // 90°: a = 0, b = 1 (16.16)
    govde.writeInt32BE(0, 40);
    govde.writeInt32BE(65536, 44);
    govde.writeInt32BE(-65536, 52);
  } else {
    govde.writeInt32BE(65536, 40);
    govde.writeInt32BE(65536, 56);
  }
  govde.writeUInt32BE(w * 65536, 76);
  govde.writeUInt32BE(h * 65536, 80);
  return kutu('tkhd', govde);
}

function video(params: {
  w: number;
  h: number;
  dondurulmus?: boolean;
  sesIziOnce?: boolean;
  olcek?: number;
  adet?: number;
  marka?: string;
}): Buffer {
  const izler = params.sesIziOnce
    ? [kutu('trak', tkhd(0, 0)), kutu('trak', tkhd(params.w, params.h, params.dondurulmus))]
    : [kutu('trak', tkhd(params.w, params.h, params.dondurulmus))];
  return Buffer.concat([
    ftyp(params.marka),
    kutu('moov', Buffer.concat([mvhd(params.olcek ?? 1000, params.adet ?? 12500), ...izler])),
  ]);
}

describe('ölçü okuma', () => {
  it('KRİTİK: dikey videonun en ve boyu doğru', () => {
    // Bu iddia, matris ofseti yanlışken SIFIR okuyup düşüyor — dosyanın
    // var oluş sebebi.
    const r = probeVideo(video({ w: 1080, h: 1920 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.info.width).toBe(1080);
    expect(r.info.height).toBe(1920);
  });

  it('KRİTİK: DÖNDÜRÜLMÜŞ video en/boy TAKAS EDİLİYOR', () => {
    /*
     * Telefonla dikey çekilen videolar çoğu zaman 1920×1080 + 90° dönüş
     * olarak yazılıyor. Matris okunmazsa dikey bir video YATAY sanılır ve
     * yanlış yerleşime gider — reklam yayınlanır, akışta kırpılmış görünür.
     */
    const r = probeVideo(video({ w: 1920, h: 1080, dondurulmus: true }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.info.width).toBe(1080);
    expect(r.info.height).toBe(1920);
  });

  it('KRİTİK: SES İZİ ÖNCE gelse de görüntü izi bulunuyor', () => {
    /*
     * Ses izinde genişlik/yükseklik SIFIR yazıyor. İlk `trak`ı almak, ses
     * izi önce gelen dosyalarda 0×0 döndürürdü.
     */
    const r = probeVideo(video({ w: 1080, h: 1080, sesIziOnce: true }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.info.width).toBe(1080);
  });
});

describe('süre', () => {
  it('saniye olarak okunuyor', () => {
    const r = probeVideo(video({ w: 1080, h: 1080, olcek: 600, adet: 9000 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.info.durationSec).toBe(15);
  });

  it('KRİTİK: okunamayan süre `null` — uydurulmuş bir sayı DEĞİL', () => {
    /*
     * Sıfır döndürmek, süre sınırı kontrolünü sessizce geçirirdi: 10
     * dakikalık bir video "0 saniye" diye kabul edilip yayında reddedilirdi.
     */
    const mvhdsiz = Buffer.concat([ftyp(), kutu('moov', kutu('trak', tkhd(1080, 1080)))]);
    const r = probeVideo(mvhdsiz);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.info.durationSec).toBeNull();
  });
});

describe('reddedilenler', () => {
  it('video olmayan dosya SEBEBİYLE reddediliyor', () => {
    const r = probeVideo(Buffer.from('bu bir video degil, yalnizca metin'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('üstverisi okunamadı');
  });

  it('çok küçük dosya', () => {
    const r = probeVideo(Buffer.alloc(10));
    expect(r.ok).toBe(false);
  });

  it('KRİTİK: TANINMAYAN MARKA reddediliyor', () => {
    // WebM ya da AVI dosyası `ftyp` taşımıyor ya da başka marka yazıyor;
    // Meta reklam videosunda MP4 istiyor.
    const r = probeVideo(video({ w: 1080, h: 1080, marka: 'webm' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain('MP4');
  });

  it('KRİTİK: BOZUK KUTU BOYUTU taramayı durduruyor', () => {
    /*
     * Bir bayt ileri kayıp devam etmek, rastgele veride "moov" dizesi bulup
     * ÇÖP ÖLÇÜ döndürebiliyor — sessizce yanlış boyut, bu projenin en
     * sevmediği hata türü.
     */
    const bozuk = Buffer.concat([ftyp(), Buffer.from([0xff, 0xff, 0xff, 0xff]), Buffer.from('moov')]);
    const r = probeVideo(bozuk);
    expect(r.ok).toBe(false);
  });
});

describe('MOV', () => {
  it('QuickTime markası video/quicktime olarak işaretleniyor', () => {
    const r = probeVideo(video({ w: 1080, h: 1080, marka: 'qt  ' }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.info.mimeType).toBe('video/quicktime');
  });
});
