/**
 * Akıllı varlık yönlendirme — tek görsel seti, iki platform.
 *
 * PROBLEM: kullanıcı üç görsel yüklüyor ve bunların Meta'da beş, Google
 * Performance Max'te dört ayrı yuvaya dağılması gerekiyor. Yuvaların oranları
 * ÇAKIŞMIYOR ve bu, gözle bakınca fark edilmiyor:
 *
 *   · Meta Hikâye 9:16 (0.5625) — Google dikey 4:5 (0.8). AYNI DEĞİL ve fark
 *     CİDDİ: hikâye görseli Google dikey yuvasına konursa alanın %30'u
 *     kalıyor. Kullanılamaz.
 *   · Meta yatay 16:9 (1.778) — her iki platformun yatay yuvası 1.91:1
 *     (1.91). Fark var ama KÜÇÜK: kırpma alanın %7'sini alıyor ve bu, iki
 *     oranı aynı yuvada saymayı haklı çılaracak kadar az. Tolerans bunu
 *     bilerek yutuyor; daraltmak 1920×1080 gibi son derece yaygın bir
 *     boyutu sebepsiz reddetmek olurdu.
 *
 * Yani asıl mesele "her oran farkı sorundur" değil, farkın NE KADAR
 * olduğunu hesaplamak. Kimse hesaplamıyor; platformlar sessizce kırpıyor.
 *
 * BU YÜZDEN YÖNLENDİRME ÖLÇÜLEN BOYUTA GÖRE YAPILIYOR, `matchRatio`'nun
 * döndürdüğü kovaya göre DEĞİL. Kova bir arayüz kolaylığı — "kare / dikey /
 * yatay" diye üç kutu göstermek için var. Yönlendirme gerçek sayılarla
 * çalışmak zorunda, yoksa 1080×1080 ile 1200×628 aynı muameleyi görür.
 *
 * NOT: Google PMax gereksinimleri Google Ads belgelerinden çıkarıldı ve
 * CANLIDA DOĞRULANMADI — Google yazma yolu henüz hiç yazılmadı.
 */

// -----------------------------------------------------------------------------
// Yuvalar
// -----------------------------------------------------------------------------

export const ASSET_PLATFORMS = ['meta', 'google'] as const;
export type AssetPlatform = (typeof ASSET_PLATFORMS)[number];

export interface AssetSlot {
  key: string;
  platform: AssetPlatform;
  label: string;
  /** Nerede görünüyor — kullanıcı neden gerektiğini anlasın. */
  shownAt: string;
  /** En/boy. */
  aspect: number;
  /** Platformun reddettiği alt sınır. */
  minWidth: number;
  minHeight: number;
  /** Altında kalırsa net görünmüyor — reddedilmiyor ama kötü duruyor. */
  recommendedWidth: number;
  recommendedHeight: number;
  /**
   * Bu yuva olmadan reklam yayınlanamıyor mu.
   *
   * Meta'da yalnızca akış zorunlu: diğerleri boşsa reklam o yerleşimde
   * gösterilmiyor ama yayınlanıyor. Google PMax'te varlık grubu eksik
   * varlıkla OLUŞTURULAMIYOR — istek reddediliyor.
   */
  required: boolean;
}

/**
 * Yuva tablosu.
 *
 * Meta yuvaları `RATIO_META` ile aynı oranları taşıyor ama AYRI duruyor:
 * `RATIO_META` kullanıcının yüklediği üç kutuyu tanımlıyor (arayüz),
 * buradakiler platformun gerçekten istediği yerleri (yönlendirme). İkisini
 * birleştirmek, arayüzü değiştirmek istediğimizde platform kurallarını da
 * değiştirmek demek olurdu.
 */
export const ASSET_SLOTS: readonly AssetSlot[] = [
  // --- Meta ---
  {
    key: 'meta_feed',
    platform: 'meta',
    label: 'Akış',
    shownAt: 'Facebook ve Instagram akışı',
    aspect: 1,
    minWidth: 600,
    minHeight: 600,
    recommendedWidth: 1080,
    recommendedHeight: 1080,
    // Kare tek evrensel yedek: Meta bir yerleşim için görsel bulamazsa
    // reklamı orada göstermiyor.
    required: true,
  },
  {
    key: 'meta_story',
    platform: 'meta',
    label: 'Hikâye / Reels',
    shownAt: 'Hikâyeler, Reels',
    aspect: 9 / 16,
    minWidth: 600,
    minHeight: 1067,
    recommendedWidth: 1080,
    recommendedHeight: 1920,
    required: false,
  },
  {
    key: 'meta_link',
    platform: 'meta',
    label: 'Yatay yerleşim',
    shownAt: 'Sağ sütun, video akışları',
    // 1.91:1 — Meta'nın bağlantı reklamı için verdiği gerçek oran.
    // `RATIO_META.horizontal` 16:9 diyor ve ikisi de toleransa sığıyor;
    // burada gerçek hedefi yazıyoruz çünkü kırpma hesabı buna bakıyor.
    aspect: 1.91,
    minWidth: 600,
    minHeight: 314,
    recommendedWidth: 1200,
    recommendedHeight: 628,
    required: false,
  },

  // --- Google Performance Max ---
  {
    key: 'google_landscape',
    platform: 'google',
    label: 'Yatay görsel',
    shownAt: 'Arama, Görüntülü Reklam Ağı, Discover',
    aspect: 1.91,
    minWidth: 600,
    minHeight: 314,
    recommendedWidth: 1200,
    recommendedHeight: 628,
    // PMax varlık grubu bu olmadan OLUŞTURULMUYOR.
    required: true,
  },
  {
    key: 'google_square',
    platform: 'google',
    label: 'Kare görsel',
    shownAt: 'Arama, Gmail, Discover',
    aspect: 1,
    minWidth: 300,
    minHeight: 300,
    recommendedWidth: 1200,
    recommendedHeight: 1200,
    required: true,
  },
  {
    key: 'google_portrait',
    platform: 'google',
    label: 'Dikey görsel',
    shownAt: 'YouTube Shorts, Discover',
    // 4:5 — META HİKÂYESİ (9:16) DEĞİL. Karıştırmak, %70'i kırpılmış bir
    // görselin Shorts'ta yayınlanması demek.
    aspect: 4 / 5,
    minWidth: 480,
    minHeight: 600,
    recommendedWidth: 960,
    recommendedHeight: 1200,
    required: false,
  },
];

/**
 * Google PMax'in logo zorunluluğu.
 *
 * AYRI TUTULUYOR çünkü logo bir REKLAM GÖRSELİ DEĞİL: her kampanyada
 * değişmiyor, markaya ait ve bir kez yüklenip tekrar tekrar kullanılıyor.
 * Reklam görselleriyle aynı kutuya koymak, kullanıcıdan her kampanyada
 * logosunu yeniden yüklemesini istemek olurdu.
 *
 * ŞU AN YÜKLEME AKIŞINDA YOK ve bu, Google PMax'in önündeki gerçek engel —
 * kapsama raporu bunu açıkça söylüyor, sessizce atlamıyor.
 */
export const GOOGLE_LOGO_SLOTS: readonly AssetSlot[] = [
  {
    key: 'google_logo_square',
    platform: 'google',
    label: 'Kare logo',
    shownAt: 'Tüm Google yerleşimleri',
    aspect: 1,
    minWidth: 128,
    minHeight: 128,
    recommendedWidth: 1200,
    recommendedHeight: 1200,
    required: true,
  },
  {
    key: 'google_logo_wide',
    platform: 'google',
    label: 'Geniş logo',
    shownAt: 'Bazı görüntülü reklam yerleşimleri',
    aspect: 4,
    minWidth: 512,
    minHeight: 128,
    recommendedWidth: 1200,
    recommendedHeight: 300,
    required: false,
  },
];

// -----------------------------------------------------------------------------
// Kırpma modeli
// -----------------------------------------------------------------------------

/**
 * Oran farkı toleransı — bu kadarı kırpma sayılmıyor.
 *
 * `RATIO_TOLERANCE` (%8) ile aynı gerekçe: telefondan çekilmiş 1080×1077 bir
 * görseli "kare değil" diye reddetmek, kullanıcıya neyi yanlış yaptığını
 * anlatamamak demek.
 */
export const SLOT_TOLERANCE = 0.08;

/**
 * Kırpmadan sonra korunan alan oranının ALT SINIRLARI.
 *
 * Her iki platform da uymayan görseli otomatik kırpıyor — hata vermiyor,
 * sessizce kesiyor. Sorun şu: kesmenin ne kadarının kabul edilebilir olduğu
 * hesaplanabilir bir şey ve kimse hesaplamıyor.
 *
 * 9:16 bir görseli 1.91:1'e kırpmak alanın %70'ini atıyor: metin gidiyor,
 * ürün yarısı kesiliyor, sonuç kullanılamaz. 4:5'i 1:1'e kırpmak %20 atıyor
 * ve genelde sorun olmuyor.
 */
export const CROP_GOOD = 0.8;
export const CROP_USABLE = 0.5;

export type SlotFit = 'exact' | 'crop' | 'heavy_crop' | 'too_small' | 'no';

export interface SlotMatch {
  slot: AssetSlot;
  fit: SlotFit;
  /** Kırpma sonrası korunan alan oranı (0–1). */
  retained: number;
  /** Önerilen çözünürlüğün altında mı — reddedilmiyor ama bulanık görünüyor. */
  lowResolution: boolean;
}

/**
 * Bir görselin bir yuvaya ne kadar uyduğu.
 *
 * SIRA ÖNEMLİ: önce boyut (platform reddediyor), sonra oran (platform
 * kırpıyor). Boyutu yetersiz bir görselin oranının mükemmel olması bir şey
 * ifade etmiyor.
 */
export function fitToSlot(
  asset: { width: number; height: number },
  slot: AssetSlot,
): SlotMatch {
  const actual = asset.width / asset.height;
  const target = slot.aspect;

  /**
   * KORUNAN ALAN = küçük oran / büyük oran.
   *
   * Kırpma tek eksende oluyor: daha "geniş" olan görselden yanlar, daha
   * "dar" olandan üst-alt kesiliyor. İki oranın küçüğünün büyüğüne bölümü,
   * kırpma sonrası kalan alanın kesridir.
   */
  const retained = Math.min(actual, target) / Math.max(actual, target);

  const drift = Math.abs(actual - target) / target;

  /**
   * BOYUT KONTROLÜ KIRPILMIŞ HÂLE GÖRE.
   *
   * Ham genişlik/yüksekliğe bakmak yanıltıcı: 1080×1920 bir Hikâye görseli
   * 1.91:1'e kırpıldığında 1080×565 kalıyor ve o hâliyle sınırı geçiyor —
   * ama başka bir görsel için geçmeyebilir. Platformun gördüğü şey kırpılmış
   * hâl.
   *
   * TOLERANS İÇİNDEYSE KIRPMA HESAPLANMIYOR ve bunun somut bir sebebi var:
   * 1200×628 (Meta'nın kendi önerdiği boyut) 1.91:1 hedefine kırpılınca
   * `round(628 × 1.91) = 1199` çıkıyor. Bir piksel. Önerilen 1200 ile
   * karşılaştırınca görsel "çözünürlüğü düşük" damgası yiyor — platformun
   * önerdiği boyutu yükleyen kullanıcıya "bulanık görünecek" demek. Tolerans
   * içinde pratikte kırpma olmuyor; orijinal boyutlara bakmak doğrusu.
   */
  const cropped =
    drift <= SLOT_TOLERANCE
      ? { width: asset.width, height: asset.height }
      : actual > target
        ? { width: Math.round(asset.height * target), height: asset.height }
        : { width: asset.width, height: Math.round(asset.width / target) };

  if (cropped.width < slot.minWidth || cropped.height < slot.minHeight) {
    return { slot, fit: 'too_small', retained, lowResolution: true };
  }

  const lowResolution =
    cropped.width < slot.recommendedWidth || cropped.height < slot.recommendedHeight;

  if (drift <= SLOT_TOLERANCE) return { slot, fit: 'exact', retained: 1, lowResolution };
  if (retained >= CROP_GOOD) return { slot, fit: 'crop', retained, lowResolution };
  if (retained >= CROP_USABLE) return { slot, fit: 'heavy_crop', retained, lowResolution };
  return { slot, fit: 'no', retained, lowResolution };
}

/** Yuvayı gerçekten dolduran uyum seviyeleri. */
export function fills(fit: SlotFit): boolean {
  return fit === 'exact' || fit === 'crop';
}

// -----------------------------------------------------------------------------
// Kapsama
// -----------------------------------------------------------------------------

export interface SlotCoverage {
  slot: AssetSlot;
  /** Bu yuvayı en iyi dolduran görselin kimliği. */
  assetId: string | null;
  fit: SlotFit;
  retained: number;
  lowResolution: boolean;
}

export interface AssetCoverage {
  platform: AssetPlatform;
  slots: SlotCoverage[];
  /** Yayını engelleyen eksikler. */
  blockers: string[];
  /** Engellemeyen ama söylenmesi gereken şeyler. */
  warnings: string[];
}

/**
 * Yüklenen görsel setinden platform kapsaması.
 *
 * HER YUVAYA EN İYİ GÖRSEL ATANIYOR, ilk uyan değil. Sıralama:
 *
 *   1. Uyum seviyesi (tam > kırpma > ağır kırpma).
 *   2. Aynı seviyede korunan alan yüksek olan.
 *   3. Eşitlikte çözünürlüğü yeterli olan.
 *
 * "İlk uyan" almak, kullanıcının yüklediği sıraya göre farklı sonuç vermek
 * demek olurdu — aynı üç görsel, farklı sırada yüklendiğinde farklı kapsama.
 *
 * BİR GÖRSEL BİRDEN ÇOK YUVAYI DOLDURABİLİR ve bu kasıtlı: 1200×628 bir
 * görsel hem Meta yatay hem Google yatay yuvasını dolduruyor. Platformlara
 * ayrı ayrı yüklenecek ama kullanıcıdan iki kez istemeye gerek yok.
 */
export function coverageFor(
  platform: AssetPlatform,
  assets: ReadonlyArray<{ id: string; width: number; height: number }>,
): AssetCoverage {
  const slots = ASSET_SLOTS.filter((s) => s.platform === platform);
  const out: SlotCoverage[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const slot of slots) {
    const matches = assets
      .map((a) => ({ id: a.id, ...fitToSlot(a, slot) }))
      .filter((m) => m.fit !== 'no' && m.fit !== 'too_small')
      .sort((a, b) => rank(b.fit) - rank(a.fit) || b.retained - a.retained);

    const best = matches[0];

    if (!best) {
      out.push({ slot, assetId: null, fit: 'no', retained: 0, lowResolution: false });
      if (slot.required) {
        blockers.push(
          `${slot.label} için uygun görsel yok (${ratioLabel(slot.aspect)}). ` +
            `${slot.shownAt} yerleşiminde reklam gösterilemez.`,
        );
      } else {
        warnings.push(
          `${slot.label} boş — ${slot.shownAt} yerleşiminde reklam gösterilmeyecek.`,
        );
      }
      continue;
    }

    out.push({
      slot,
      assetId: best.id,
      fit: best.fit,
      retained: best.retained,
      lowResolution: best.lowResolution,
    });

    /**
     * AĞIR KIRPMA YUVA DOLU SAYILMIYOR ama görsel de ATILMIYOR.
     *
     * Platform onu yine kullanacak — bizim seçme şansımız yok. Yapabildiğimiz
     * tek şey ne olacağını ÖNCEDEN söylemek: "%64'ü kırpılacak" cümlesi,
     * yayından sonra Ads Manager'da yarısı kesilmiş bir görsel görmekten iyi.
     */
    if (best.fit === 'heavy_crop') {
      const lost = Math.round((1 - best.retained) * 100);
      const message =
        `${slot.label}: en uygun görselin %${lost}'i kırpılacak. ` +
        `${ratioLabel(slot.aspect)} oranında bir görsel yüklemek daha iyi sonuç verir.`;
      if (slot.required) blockers.push(message);
      else warnings.push(message);
    } else if (best.lowResolution) {
      warnings.push(
        `${slot.label}: çözünürlük önerilenin altında ` +
          `(${slot.recommendedWidth}×${slot.recommendedHeight}). Reddedilmez ama bulanık görünür.`,
      );
    }
  }

  /**
   * GOOGLE PMAX LOGO OLMADAN OLUŞTURULMUYOR.
   *
   * Bu bir uyarı değil ENGEL: varlık grubu logosuz reddediliyor. Şu an logo
   * yükleme akışı YOK ve bunu sessizce atlamak, Google kampanyasının yayın
   * anında anlaşılmaz bir hatayla düşmesi demek olurdu.
   */
  if (platform === 'google') {
    blockers.push(
      'Kare logo eksik. Google Performance Max varlık grubu logo olmadan ' +
        'oluşturulamıyor — logo yükleme henüz bu akışta yok.',
    );
  }

  return { platform, slots: out, blockers, warnings };
}

function rank(fit: SlotFit): number {
  switch (fit) {
    case 'exact':
      return 3;
    case 'crop':
      return 2;
    case 'heavy_crop':
      return 1;
    default:
      return 0;
  }
}

/** Oranı kullanıcının tanıyacağı biçimde yazar. */
export function ratioLabel(aspect: number): string {
  const known: Array<[number, string]> = [
    [1, '1:1'],
    [1.91, '1.91:1'],
    [9 / 16, '9:16'],
    [4 / 5, '4:5'],
    [4, '4:1'],
    [16 / 9, '16:9'],
  ];
  for (const [value, label] of known) {
    if (Math.abs(aspect - value) < 0.01) return label;
  }
  return aspect.toFixed(2);
}

export const SLOT_FIT_LABELS: Record<SlotFit, string> = {
  exact: 'Tam uyuyor',
  crop: 'Hafif kırpılacak',
  heavy_crop: 'Ağır kırpılacak',
  too_small: 'Çözünürlük yetersiz',
  no: 'Uygun görsel yok',
};
