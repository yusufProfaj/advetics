import { ASSET_RATIOS, MIN_IMAGE_EDGE, RATIO_META, type AssetRatio } from './ad-builder.schema';

/**
 * Kırpma matematiği — SAF FONKSİYONLAR, canvas yok, DOM yok.
 *
 * NEDEN BU ARAÇ VAR: ürünün vaadi "reklamcılık bilmeyen biri kullanabilsin"
 * ama en sert duvar reklamcılıkta değil, GÖRSELDE. Meta'nın kare yuvası
 * zorunlu ve telefondan çekilmiş 4:3 bir fotoğraf hiçbir kovaya oturmuyor.
 * Bugüne kadar verdiğimiz talimat "kırp ve yeniden yükle" idi — yani asıl işi
 * kullanıcıya bırakıyorduk.
 *
 * MATEMATİK ARAYÜZDEN AYRI TUTULUYOR çünkü hatası SESSİZ: yanlış hesaplanan
 * bir kırpma, ürünün yarısı kesilmiş bir reklam demek ve bunu ancak yayına
 * çıktıktan sonra bakan biri varsa fark eder. Saf fonksiyon doğrudan test
 * edilebiliyor.
 */

/**
 * Odak noktası — 0..1 aralığında oran.
 *
 * PİKSEL DEĞİL ORAN: kullanıcı 4000×3000 bir fotoğrafta odak seçiyor ama
 * kırpma 1080×1080 üretiyor. Pikseli saklamak, kaynak görsel değiştiğinde
 * odağın anlamsız bir yere düşmesi demek olurdu.
 *
 * Varsayılan merkez (0.5, 0.5) değil, ÜST ORTA (0.5, 0.4): insan fotoğrafında
 * yüz genelde üst yarıda ve dikey kırpmada merkez, çeneden kesiyor.
 */
export interface FocalPoint {
  x: number;
  y: number;
}

export const DEFAULT_FOCAL: FocalPoint = { x: 0.5, y: 0.4 };

export interface CropPlan {
  ratio: AssetRatio;
  /** Kaynak görselden alınacak dikdörtgen. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Üretilecek görselin boyutu. */
  outWidth: number;
  outHeight: number;
  /** Kaynağın ne kadarı korunuyor (0..1). */
  retained: number;
  /**
   * Üretilebilir mi. `false` ise `reason` dolu.
   *
   * KIRPMA ÇÖZÜNÜRLÜK DÜŞÜRÜYOR ve bu, aracın en kolay gözden kaçan yan
   * etkisi: 800×600 bir fotoğraftan 9:16 kırpmak 338×600 üretiyor ve kısa
   * kenar Meta'nın alt sınırının altına düşüyor.
   */
  usable: boolean;
  reason?: string;
}

/** Oranın önerilen genişliği — çıktı bundan büyük üretilmiyor. */
const RECOMMENDED_WIDTH: Record<AssetRatio, number> = {
  square: 1080,
  vertical: 1080,
  horizontal: 1920,
};

/**
 * Bir oran için kırpma planı üretir.
 *
 * BÜYÜTME YOK. Kaynak küçükse çıktı da küçük kalıyor; yukarı ölçeklemek
 * bulanık bir görseli "yeterli çözünürlükte" gibi göstermek olurdu ve Meta
 * bunu reddetmiyor — yalnızca kötü görünüyor.
 */
export function planCrop(
  source: { width: number; height: number },
  ratio: AssetRatio,
  focal: FocalPoint = DEFAULT_FOCAL,
): CropPlan {
  const target = RATIO_META[ratio].aspect;
  const { width: W, height: H } = source;

  // Kaynaktan alınabilecek EN BÜYÜK hedef oranlı dikdörtgen.
  let sw: number;
  let sh: number;
  if (W / H > target) {
    // Kaynak daha geniş: yükseklik tam kullanılıyor, genişlik kırpılıyor.
    sh = H;
    sw = H * target;
  } else {
    sw = W;
    sh = W / target;
  }
  sw = Math.floor(sw);
  sh = Math.floor(sh);

  /**
   * ODAK NOKTASI SINIRA DAYANIRSA KAYDIRILIYOR, KIRPMA KÜÇÜLTÜLMÜYOR.
   *
   * Kullanıcı sol kenara yakın bir odak seçtiğinde dikdörtgeni içeri
   * sıkıştırmak yerine kenara yaslıyoruz. Küçültmek, aynı odak için farklı
   * boyutlarda çıktılar üretirdi ve kullanıcı neden bir kırpmanın daha düşük
   * çözünürlüklü olduğunu anlayamazdı.
   */
  const sx = clamp(Math.round(clamp01(focal.x) * W - sw / 2), 0, W - sw);
  const sy = clamp(Math.round(clamp01(focal.y) * H - sh / 2), 0, H - sh);

  // Önerilen boyuttan büyük üretmiyoruz: dosya boyutu büyür, Meta zaten
  // küçültüyor ve yükleme kotasını boşa harcarız.
  const cap = RECOMMENDED_WIDTH[ratio];
  const scale = sw > cap ? cap / sw : 1;
  const outWidth = Math.round(sw * scale);
  const outHeight = Math.round(sh * scale);

  const retained = (sw * sh) / (W * H);
  const shortEdge = Math.min(outWidth, outHeight);

  return {
    ratio,
    sx,
    sy,
    sw,
    sh,
    outWidth,
    outHeight,
    retained,
    usable: shortEdge >= MIN_IMAGE_EDGE,
    reason:
      shortEdge >= MIN_IMAGE_EDGE
        ? undefined
        : `Kırpınca ${outWidth}×${outHeight} kalıyor; en kısa kenar en az ` +
          `${MIN_IMAGE_EDGE} piksel olmalı, yoksa reklamda bulanık görünür.`,
  };
}

/** Üç oranın planı birden. */
export function planAllCrops(
  source: { width: number; height: number },
  focal: FocalPoint = DEFAULT_FOCAL,
): CropPlan[] {
  return ASSET_RATIOS.map((r) => planCrop(source, r, focal));
}

/**
 * Kaynak görsel bu araç için yeterli mi.
 *
 * ERKEN VE AÇIK CEVAP: kullanıcı odak noktasını sürükleyip üç kırpmayı
 * ürettikten sonra "olmadı" duymamalı. Kare her zaman en kolay oran, yani
 * kare bile çıkmıyorsa hiçbiri çıkmaz.
 */
export function canCrop(source: { width: number; height: number }): {
  ok: boolean;
  reason?: string;
} {
  const square = planCrop(source, 'square');
  if (square.usable) return { ok: true };
  return {
    ok: false,
    reason:
      `Bu görsel kırpmak için küçük (${source.width}×${source.height}). ` +
      `Kare kırpıldığında ${square.outWidth}×${square.outHeight} kalıyor; ` +
      `en az ${MIN_IMAGE_EDGE} piksel gerekiyor.`,
  };
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.min(Math.max(v, min), max);
}
