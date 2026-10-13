import { karakterSayisi } from './metin';

/**
 * TALEP YARATMA VİDEO KANALLARI — TEK KAYNAK (VIDEO denetimi B20).
 *
 * Gövde (`google-demandgen.ts#demandGenAtomikIstek`, rehber yolu), geri
 * okuma (`google-yayin.ts`) ve Kontrol'ün "Nerede" hücresi (`kararlar.ts`)
 * bu sabiti okuyor. Önceden hücre amaç kartının düz cümlesini ("YouTube")
 * yazıyordu, gövde ise yedi bayrağın altısını ayrı bir blokta tutuyordu:
 * biri değişince öbürü haber vermeden yalan söylerdi. Cümle artık sabitten
 * TÜRETİLİYOR; `derle-google.spec` derlenmiş gövdenin bayraklarını ve
 * hücrenin metnini aynı sabite karşı kilitliyor.
 *
 * Alan adları v25 `DemandGenSelectedChannels`. Yedisi de AÇIKÇA yazılıyor:
 * blok gönderilmezse varsayılan ALL_CHANNELS ve video Gmail, Keşfet,
 * Haritalar ve Görüntülü Reklam Ağı'na da gider (hata yok). `maps: false`
 * görsel grubunda zaten yazılıyordu; video grubunda eksikti (B14d). Akıllı
 * Boost'un canlıda doğrulanmış gövdesine dokunulmuyor: o yol kendi altı
 * bayrağını yazmaya devam ediyor.
 */
export const DEMAND_GEN_VIDEO_KANALLARI = {
  youtubeInStream: true,
  youtubeInFeed: true,
  youtubeShorts: true,
  discover: false,
  gmail: false,
  display: false,
  maps: false,
} as const;

export type DemandGenKanali = keyof typeof DEMAND_GEN_VIDEO_KANALLARI;

/** Ekrandaki adlar; sıra = cümledeki sıra. */
export const DEMAND_GEN_KANAL_ETIKETI: Record<DemandGenKanali, string> = {
  youtubeInStream: 'YouTube video arası',
  youtubeInFeed: 'YouTube akışı',
  youtubeShorts: 'Shorts',
  gmail: 'Gmail',
  discover: 'Keşfet',
  display: 'Görüntülü Reklam Ağı',
  maps: 'Haritalar',
};

/** Kanal bayraklarından "nerede" hücresinin iki parçası (açık / kapalı). */
export function kanalCumlesi(k: Readonly<Record<DemandGenKanali, boolean>>): { acik: string; kapali: string } {
  const sira = Object.keys(DEMAND_GEN_KANAL_ETIKETI) as DemandGenKanali[];
  const ad = (x: DemandGenKanali[]) => x.map((y) => DEMAND_GEN_KANAL_ETIKETI[y]).join(', ');
  return { acik: ad(sira.filter((x) => k[x])), kapali: ad(sira.filter((x) => !k[x])) };
}

/**
 * VİDEO REKLAMININ UZUN BAŞLIĞI (VIDEO denetimi B14c). Eski kod uzun
 * başlığı da açıklamayı da AYNI listeden (`aciklamalar`) dolduruyordu: aynı
 * metin iki alana gidiyor ve Google onu iki kez gösterebiliyordu. Karar
 * (yönetici): EN UZUN BAŞLIK uzun başlık olur, açıklamalar ayrı kalır ve
 * uzun başlıkla aynı metni taşıyan açıklama düşer. Metin uydurulmuyor.
 * Başlık yoksa `null` (derleyici zaten başlıksız reddediyor).
 */
export function videoUzunBaslik(basliklar: readonly string[], aciklamalar: readonly string[]): { uzunBaslik: string; aciklamalar: string[] } | null {
  const temiz = basliklar.map((s) => s.trim()).filter(Boolean);
  if (!temiz.length) return null;
  // Eşit uzunlukta İLK başlık: sıra kullanıcının sırası, kararlı çıktı.
  const uzun = temiz.reduce((a, b) => (karakterSayisi(b) > karakterSayisi(a) ? b : a));
  return { uzunBaslik: uzun, aciklamalar: aciklamalar.map((s) => s.trim()).filter((s) => s && s !== uzun) };
}

/** Talep Yaratma video reklamında en çok başlık (v25 `DemandGenVideoResponsiveAdInfo`). */
export const DEMAND_GEN_VIDEO_EN_COK_BASLIK = 5;

/**
 * KARE LOGO KURALI (B17): Google'ın `logoImages` alanı 1:1 ve en az 128×128
 * istiyor (proto kısıtı). Maks. Performans'ta, Talep Yaratma video ve görsel
 * reklamında AYNI alan; eksik listesi ve derleyici bu tek listeyi okuyor.
 */
export const GOOGLE_KARE_LOGO_KURGULARI: readonly string[] = ['MAKS_PERFORMANS', 'TALEP_YARATMA_VIDEO', 'TALEP_YARATMA_GORSEL'];
