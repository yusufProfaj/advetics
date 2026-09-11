/**
 * ═══ ÜST HESAP PAKETLERİ ═══
 *
 * Üst hesap bir ÜRÜN olarak satılıyor: kendi reklam hesabını kendi
 * bağlantısıyla bağlamak isteyen kişiye. Paket, o hesabın kısıtlarını
 * belirliyor.
 *
 * ┌─ SAYILAR KODDA, VERİTABANINDA DEĞİL ──────────────────────────────────┐
 * │ Kısıtları kolon olarak tutmak akla yakın görünüyordu. Değil: aynı sayı │
 * │ iki yerde (paket tanımı ve satır) durur, biri güncellenip diğeri       │
 * │ unutulur ve fark YALNIZCA kısıtın yanlış uygulanmasıyla görünür —     │
 * │ yani bir müşteri ya hak ettiğini alamaz ya da fazlasını alır.          │
 * │                                                                        │
 * │ Veritabanında yalnızca PAKETİN ADI duruyor. Bir paketin sınırı         │
 * │ değiştiğinde tek satır değişiyor ve bütün hesaplar aynı anda uyuyor.   │
 * └────────────────────────────────────────────────────────────────────────┘
 */

export const MANAGER_PAKETLERI = ['baslangic', 'buyume', 'ajans'] as const;
export type ManagerPaket = (typeof MANAGER_PAKETLERI)[number];

export interface PaketSiniri {
  /** Ekranda yazan ad. */
  etiket: string;
  /** Bir cümlelik açıklama — paket seçerken ne aldığı belli olsun. */
  aciklama: string;
  /**
   * Bu üst hesabın altında açılabilecek EN FAZLA şirket. `null` = sınırsız.
   *
   * `null` ile `0` AYRI: ikincisi "hiç açamaz" demek ve bir paket için
   * geçerli bir kısıt olabilir. Sınırsızı `0` ya da `-1` ile ifade etmek,
   * karşılaştırmayı okuyan herkesin o sözleşmeyi hatırlamasını gerektirirdi.
   */
  maxSirket: number | null;
  /**
   * Bu üst hesabın altındaki şirketlere ATANABİLECEK en fazla reklam hesabı.
   * `null` = sınırsız.
   *
   * ATAMA sayılıyor, KEŞİF değil: ajansın tek Meta kimliği yüzlerce hesap
   * görüyor ve havuzdaki bir hesap kimsenin kotasını harcamıyor. Kısıt,
   * hesabın bir workspace'e bağlandığı anda anlamlı.
   */
  maxReklamHesabi: number | null;
}

export const PAKET_SINIRLARI: Record<ManagerPaket, PaketSiniri> = {
  baslangic: {
    etiket: 'Başlangıç',
    aciklama: 'Tek şirket, iki reklam hesabı. Kendi hesabını bağlayıp başlamak için.',
    maxSirket: 1,
    maxReklamHesabi: 2,
  },
  buyume: {
    etiket: 'Büyüme',
    aciklama: 'Beş şirkete kadar, on reklam hesabı.',
    maxSirket: 5,
    maxReklamHesabi: 10,
  },
  ajans: {
    etiket: 'Ajans',
    aciklama: 'Sınırsız şirket ve reklam hesabı. Birden çok şirket yöneten ajanslar için.',
    maxSirket: null,
    maxReklamHesabi: null,
  },
};

/**
 * Kısıt aşıldı mı — `null` sınır HER ZAMAN geçiyor.
 *
 * Karşılaştırmayı çağıranın yazması, `null`u bir yerde `0` sanan bir
 * karşılaştırmanın sınırsız paketi TAMAMEN KAPATMASI demekti. Tek yerde.
 */
export function paketAsildiMi(sinir: number | null, mevcut: number): boolean {
  return sinir !== null && mevcut >= sinir;
}
