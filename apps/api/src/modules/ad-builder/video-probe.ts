/**
 * ═══ VİDEO BOYUTU VE SÜRESİ — BAĞIMLILIK EKLEMEDEN ═══
 *
 * `ffprobe` ya da `fluent-ffmpeg` eklemek cazip ama ffmpeg bir SİSTEM
 * İKİLİSİ ve bu proje 11 başka sitenin paylaştığı bir VPS'te çalışıyor:
 * sistem geneli bir paket kurmak tam da kaçınmamız gereken dokunuş
 * (CLAUDE.md §1). `image-probe.ts` aynı gerekçeyle yazılmıştı.
 *
 * MP4/MOV kutu (box/atom) yapısı boyutu ve süreyi BAŞLIKTAN veriyor:
 *
 *   ftyp        — biçim imzası
 *   moov        — üstveri kabı
 *     mvhd      — zaman ölçeği ve toplam süre
 *     trak      — her iz (video, ses)
 *       tkhd    — izin genişlik/yükseklik (16.16 sabit noktalı, SONDA)
 *
 * NEDEN ÖLÇÜYORUZ: Meta dikey videoyu Reels'e, yatayı akışa koyuyor ve
 * yerleşim kararı bizim tarafımızda veriliyor. Dosya adına güvenmek, dikey
 * bir videoyu yatay sanıp yanlış yerleşime göndermek demek — reklam
 * yayınlanır ve kırpılmış görünür.
 *
 * SÜRE DE ÖLÇÜLÜYOR: Meta reklam videosunda üst sınır var ve sınırı yayın
 * anında öğrenmek, kullanıcının dosyayı yükleyip kampanyayı kurup en sonda
 * reddedilmesi demek. Doğrulama GİRİŞ ANINDA.
 */

export interface VideoInfo {
  width: number;
  height: number;
  /** Saniye. Ölçülemezse `null` — uydurulmuş bir sayı, sınır kontrolünü yalanlar. */
  durationSec: number | null;
  mimeType: 'video/mp4' | 'video/quicktime';
}

export type VideoProbeResult =
  | { ok: true; info: VideoInfo }
  | { ok: false; reason: string };

/**
 * `ftyp` KUTUSU ZORUNLU DEĞİL AMA BEKLENEN.
 *
 * Bazı kameralar dosyayı `ftyp` olmadan yazıyor; o durumda `moov` aramaya
 * devam ediyoruz. Baştan reddetmek, geçerli bir videoyu "bozuk" demek olurdu.
 */
const MP4_MARKALARI = new Set(['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'qt  ', 'dash']);

export function probeVideo(buf: Buffer): VideoProbeResult {
  if (buf.length < 32) return { ok: false, reason: 'Dosya çok küçük — video değil.' };

  const ftyp = kutuBul(buf, 0, buf.length, 'ftyp');
  const marka = ftyp ? buf.toString('latin1', ftyp.govdeBas, ftyp.govdeBas + 4) : null;
  const quicktime = marka === 'qt  ';
  if (marka !== null && !MP4_MARKALARI.has(marka)) {
    return {
      ok: false,
      reason: 'Bu dosya MP4 ya da MOV değil. Reklam videosu MP4 olarak yüklenmeli.',
    };
  }

  const moov = kutuBul(buf, 0, buf.length, 'moov');
  if (!moov) {
    /*
     * `moov` DOSYANIN SONUNDA OLABİLİYOR ve bu bir hata değil: çoğu kamera
     * ve düzenleyici üstveriyi en sona yazıyor. Tarama bütün dosyayı
     * geziyor, yani buraya düşmek gerçekten bozuk/eksik dosya demek.
     */
    return {
      ok: false,
      reason:
        'Videonun üstverisi okunamadı. Dosya eksik yüklenmiş olabilir; tekrar dene.',
    };
  }

  const olculer = izOlculeri(buf, moov.govdeBas, moov.govdeSon);
  if (!olculer) {
    return { ok: false, reason: 'Videonun en/boy bilgisi okunamadı.' };
  }

  return {
    ok: true,
    info: {
      width: olculer.width,
      height: olculer.height,
      durationSec: sure(buf, moov.govdeBas, moov.govdeSon),
      mimeType: quicktime ? 'video/quicktime' : 'video/mp4',
    },
  };
}

interface Kutu {
  govdeBas: number;
  govdeSon: number;
}

/**
 * Belirtilen aralıkta bir kutuyu arar.
 *
 * ═══ 64 BİTLİK BOYUT DA OKUNUYOR ═══
 *
 * Kutu boyutu 1 ise gerçek boyut sonraki 8 baytta duruyor ve bu, 4 GB'ı
 * geçen dosyalarda değil, BAZI DÜZENLEYİCİLERİN her kutuda kullandığı bir
 * biçim. Yalnızca 32 bit okumak o dosyalarda taramayı sonsuz döngüye ya da
 * yanlış ofsete sokuyor.
 */
function kutuBul(buf: Buffer, bas: number, son: number, tip: string): Kutu | null {
  let i = bas;
  while (i + 8 <= son) {
    const boyut32 = buf.readUInt32BE(i);
    const ad = buf.toString('latin1', i + 4, i + 8);
    let govdeBas = i + 8;
    let toplam = boyut32;

    if (boyut32 === 1) {
      if (i + 16 > son) return null;
      // 64 bitlik boyut. `Number` dönüşümü güvenli: 2^53'ü aşan bir kutu
      // zaten belleğe sığmıyor.
      toplam = Number(buf.readBigUInt64BE(i + 8));
      govdeBas = i + 16;
    } else if (boyut32 === 0) {
      // 0 = "dosyanın sonuna kadar".
      toplam = son - i;
    }

    if (toplam < 8 || i + toplam > son) {
      /*
       * BOZUK BOYUT TARAMAYI DURDURUYOR, KAYDIRMIYOR.
       *
       * Bir bayt ileri kayıp devam etmek, rastgele veride "moov" dizesi
       * bulup çöp ölçüler döndürebiliyor — sessizce yanlış boyut, bu
       * projenin en sevmediği hata türü.
       */
      return null;
    }

    if (ad === tip) return { govdeBas, govdeSon: i + toplam };
    i += toplam;
  }
  return null;
}

/**
 * En büyük görüntü izinin ölçüleri.
 *
 * ═══ SES İZİ DE `tkhd` TAŞIYOR ═══
 *
 * Ses izinde genişlik/yükseklik SIFIR yazıyor. İlk `trak`ı almak, ses izi
 * önce gelen dosyalarda 0×0 döndürürdü ve kullanıcı "videonun boyutu
 * okunamadı" görürdü. Sıfır olmayan ilk iz alınıyor.
 *
 * DÖNDÜRÜLMÜŞ VİDEO: `tkhd` bir dönüşüm matrisi de taşıyor ve telefonla
 * dikey çekilmiş videolar çoğu zaman 1920×1080 + 90° dönüş olarak yazılıyor.
 * Matris okunup en/boy TAKAS EDİLİYOR; yoksa dikey bir video yatay sanılır
 * ve yanlış yerleşime gider.
 */
function izOlculeri(
  buf: Buffer,
  bas: number,
  son: number,
): { width: number; height: number } | null {
  let i = bas;
  while (i + 8 <= son) {
    const kutu = kutuBul(buf, i, son, 'trak');
    if (!kutu) return null;

    const tkhd = kutuBul(buf, kutu.govdeBas, kutu.govdeSon, 'tkhd');
    if (tkhd) {
      const govde = tkhd.govdeBas;
      const surum = buf.readUInt8(govde);
      /*
       * MATRİS OFSETİ — ELLE SAYILDI VE SINANDI.
       *
       * `tkhd` sürüm 0 gövdesi: 4 (sürüm+bayrak) + 4 oluşturma + 4 değişim
       * + 4 iz kimliği + 4 ayrılmış + 4 süre + 8 ayrılmış + 2 katman +
       * 2 grup + 2 ses + 2 ayrılmış = 40. Sürüm 1'de tarih ve süre 64 bit,
       * yani üç alan 4'er bayt büyüyor: 52.
       *
       * İLK YAZIMDA 80/92 YAZMIŞTIM ve ölçüler hep sıfır okunuyordu —
       * "videonun en/boy bilgisi okunamadı". Sentetik bir MP4 üretip
       * ÇALIŞTIRMADAN fark edilemezdi: kod derleniyor, tip doğru, sonuç
       * sessizce yanlış.
       */
      const matrisBas = govde + (surum === 1 ? 52 : 40);
      if (matrisBas + 44 <= tkhd.govdeSon) {
        // Ölçüler matristen SONRA, 16.16 sabit noktalı.
        const olcuBas = matrisBas + 36;
        const w = buf.readUInt32BE(olcuBas) / 65536;
        const h = buf.readUInt32BE(olcuBas + 4) / 65536;
        if (w > 0 && h > 0) {
          // Matrisin a ve b katsayıları: 90°/270° dönüşte a = 0 ve b ≠ 0.
          const a = buf.readInt32BE(matrisBas);
          const b = buf.readInt32BE(matrisBas + 4);
          const dondurulmus = a === 0 && b !== 0;
          return dondurulmus
            ? { width: Math.round(h), height: Math.round(w) }
            : { width: Math.round(w), height: Math.round(h) };
        }
      }
    }
    i = kutu.govdeSon;
  }
  return null;
}

/** `mvhd`den toplam süre. Okunamazsa `null` — uydurma bir sayı sınırı yalanlar. */
function sure(buf: Buffer, bas: number, son: number): number | null {
  const mvhd = kutuBul(buf, bas, son, 'mvhd');
  if (!mvhd) return null;
  const govde = mvhd.govdeBas;
  const surum = buf.readUInt8(govde);

  try {
    if (surum === 1) {
      const olcek = buf.readUInt32BE(govde + 20);
      const adet = Number(buf.readBigUInt64BE(govde + 24));
      return olcek > 0 ? adet / olcek : null;
    }
    const olcek = buf.readUInt32BE(govde + 12);
    const adet = buf.readUInt32BE(govde + 16);
    return olcek > 0 ? adet / olcek : null;
  } catch {
    return null;
  }
}
