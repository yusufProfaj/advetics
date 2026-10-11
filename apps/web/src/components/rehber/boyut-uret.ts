import { GORSEL_ORANLARI, type GorselOrani } from '@advetics/shared';

/**
 * ═══ OTOMATİK BOYUT ÜRETİMİ (kullanıcı kararı, 2026-10-12) ═══
 *
 * Kullanıcı çoğu zaman tek boyut atıyor (çoğunlukla kare) ve banner setinde
 * eksik boyutun yerleşimi KAPANIYOR: kare tek başına Hikâye ve Reels'i
 * kapatıyor, yani erişimin önemli bir kısmı. Eksik boyutlar atılan görselden
 * TARAYICIDA üretiliyor (paylaşımlı sunucuya görsel işleme programı
 * kurulmuyor; video kapağı da aynı yoldan alınıyor).
 *
 * İKİ YÖNTEM, KESMEYEN TERCİH EDİLİR:
 * - `kirp`: oranlar yakınsa (fark < %12) ortadan hafif kırpma. Kenardan
 *   en çok ~%6 gidiyor; tasarımcıların bıraktığı güvenli alan içinde.
 * - `sigdir`: oran uzaksa (kare → 9:16, kare → 1.91:1) görselin TAMAMI
 *   ortalanır, boşluk aynı görselin bulanık ve koyulaştırılmış kopyasıyla
 *   dolar. Yazı ve logo KESİLMEZ; kırpmak "Kampanya %20" yazısını yarıda
 *   bırakabilirdi ve bunu ilk gören müşteri olurdu.
 */
export const HEDEF_OLCULER: Record<GorselOrani, readonly [number, number]> = {
  dikey: [1080, 1920],
  dik45: [1080, 1350],
  kare: [1080, 1080],
  yatay: [1200, 628],
};

/** Oran farkı bu eşiğin altındaysa kırpılır (kenar kaybı ~%6'yı geçmez). */
export const KIRPMA_ESIGI = 0.12;

export type UretimYontemi = 'kirp' | 'sigdir';

export function uretimYontemi(kaynakEn: number, kaynakBoy: number, hedef: GorselOrani): UretimYontemi {
  const [en, boy] = HEDEF_OLCULER[hedef];
  const k = kaynakEn / kaynakBoy;
  const h = en / boy;
  return Math.abs(k - h) / h < KIRPMA_ESIGI ? 'kirp' : 'sigdir';
}

/** Setin eksik boyutları, kılavuz sırasıyla. */
export function eksikOranlar(mevcut: Iterable<GorselOrani>): GorselOrani[] {
  const var_ = new Set(mevcut);
  return GORSEL_ORANLARI.filter((o) => !var_.has(o));
}

/** Kaynağın hedefe "kaplayarak" (cover) ya da "sığarak" (contain) yerleşimi: x, y, en, boy. */
export function yerlesim(kaynakEn: number, kaynakBoy: number, hedefEn: number, hedefBoy: number, kapla: boolean): [number, number, number, number] {
  const olcek = kapla ? Math.max(hedefEn / kaynakEn, hedefBoy / kaynakBoy) : Math.min(hedefEn / kaynakEn, hedefBoy / kaynakBoy);
  const en = kaynakEn * olcek;
  const boy = kaynakBoy * olcek;
  return [(hedefEn - en) / 2, (hedefBoy - boy) / 2, en, boy];
}

/**
 * Tarayıcıda üretim. Kalite 0.9 JPEG: Meta ve Google'ın görsel sınırlarının
 * çok altında kalıyor, yükleme kontrolü (`medyaKontrol`) aynı yoldan geçiyor.
 */
export async function boyutUret(kaynak: Blob, hedef: GorselOrani): Promise<Blob> {
  const bmp = await createImageBitmap(kaynak);
  try {
    const [en, boy] = HEDEF_OLCULER[hedef];
    const c = document.createElement('canvas');
    c.width = en;
    c.height = boy;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Tarayıcı görsel üretemedi (canvas yok).');
    if (uretimYontemi(bmp.width, bmp.height, hedef) === 'kirp') {
      ctx.drawImage(bmp, ...yerlesim(bmp.width, bmp.height, en, boy, true));
    } else {
      // Arka plan: aynı görsel, kaplayarak, bulanık ve %35 koyu.
      ctx.save();
      ctx.filter = 'blur(28px) brightness(0.65)';
      const [x, y, w, h] = yerlesim(bmp.width, bmp.height, en, boy, true);
      // Bulanıklık kenarda şeffaflık bırakmasın diye biraz taşır.
      ctx.drawImage(bmp, x - 40, y - 40, w + 80, h + 80);
      ctx.restore();
      ctx.drawImage(bmp, ...yerlesim(bmp.width, bmp.height, en, boy, false));
    }
    return await new Promise<Blob>((ok, hata) => c.toBlob((b) => (b ? ok(b) : hata(new Error('Görsel üretilemedi.'))), 'image/jpeg', 0.9));
  } finally {
    bmp.close();
  }
}
