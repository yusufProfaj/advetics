/**
 * AdvCampaign rehberinin YEDİ AMACI ve her amacın iki platformdaki kurgusu
 * (docs/advcampaign/REHBER-PLANI.md § 3, arastirma/A4-panel-turu.md § 4.2).
 *
 * Kullanıcı tek bir SONUÇ seçiyor; Meta'nın amacı/optimizasyonu ve Google'ın
 * kampanya türü/teklifi buradan türüyor ve kullanıcıya sorulmuyor. Meta dalı
 * mevcut niyet kataloğuna (`NIYET_KATALOGU`) bağlanıyor: ikinci bir Meta
 * eşlemesi yazmak, derleyici ile ekranın ayrışması demek.
 *
 * AÇILIŞ AMAÇ × PLATFORM BAŞINA ve TEK SABİTTE (`REHBER_ACILIS`). CLAUDE.md:
 * çalışmayan seçenek gösterilmez. Bir platform canlı turu geçince buradaki
 * satırı `acik` olur; kod değişikliği tek satır ve commit'inde ölçümün kanıtı
 * yazılır. Panel, sunucunun eksik listesi ve yayın kapısı AYNI sabiti okuyor.
 */
import type { NiyetKodu } from '../meta/niyetler';

export const REHBER_AMAC_KODLARI = ['SITE', 'FORM', 'WHATSAPP', 'TELEFON', 'VIDEO', 'ERISIM', 'SATIS'] as const;
export type RehberAmacKodu = (typeof REHBER_AMAC_KODLARI)[number];

export const REHBER_PLATFORMLARI = ['meta', 'google'] as const;
export type RehberPlatformu = (typeof REHBER_PLATFORMLARI)[number];

/**
 * Google kurgusu. `TALEP_YARATMA` = Demand Gen: YouTube video reklamının
 * API'den kurulabilen TEK yolu (Video kampanyası API'de salt okunur, CLAUDE.md).
 * Panel turunda Google "YouTube" hedefinde yalnız Video sunuyordu; bu yüzden
 * panelin seçimini kopyalamıyoruz.
 */
export type GoogleKurgu = 'ARAMA' | 'TALEP_YARATMA_VIDEO' | 'TALEP_YARATMA_GORSEL' | 'MAKS_PERFORMANS';

/** Arama kampanyasında "hedefe nasıl ulaşılacak" (Google'ın kendi sorusu). */
export type GoogleUlasma = 'site' | 'form' | 'telefon';

export interface RehberAmaci {
  kod: RehberAmacKodu;
  ekranAdi: string;
  /** Kartın altındaki tek cümle: kullanıcı ne ALACAK. */
  neAlacaksin: string;
  meta: {
    niyet: NiyetKodu;
    /** Kurulacak şeyin iş dilindeki adı ("Trafik kampanyası · sayfa görüntüleme"). */
    kurulacak: string;
  };
  google:
    | { kurgu: GoogleKurgu; ulasma: GoogleUlasma | null; kurulacak: string; nerede: string }
    /** Karşılığı yok: kart Google'ı üstü çizili gösterir ve sebebi yazar. */
    | { kurgu: null; sebep: string };
}

export const REHBER_AMACLARI: Record<RehberAmacKodu, RehberAmaci> = {
  SITE: {
    kod: 'SITE',
    ekranAdi: 'Siteme gelsinler',
    neAlacaksin: 'Sitene gelen kişi sayısı artar.',
    meta: { niyet: 'SITE', kurulacak: 'Trafik kampanyası · sayfa görüntüleme' },
    google: { kurgu: 'ARAMA', ulasma: 'site', kurulacak: 'Arama kampanyası · aramalarda metin reklam', nerede: 'Google Arama' },
  },
  FORM: {
    kod: 'FORM',
    ekranAdi: 'Form doldursunlar',
    neAlacaksin: 'Adını ve telefonunu bırakan kişiler.',
    meta: { niyet: 'FORM', kurulacak: 'Potansiyel müşteri · anlık form' },
    google: { kurgu: 'ARAMA', ulasma: 'form', kurulacak: 'Arama kampanyası · form uzantısı', nerede: 'Google Arama' },
  },
  WHATSAPP: {
    kod: 'WHATSAPP',
    ekranAdi: "WhatsApp'tan yazsınlar",
    neAlacaksin: "Sana WhatsApp'tan mesaj atanlar.",
    meta: { niyet: 'WHATSAPP', kurulacak: 'Potansiyel müşteri · WhatsApp sohbeti' },
    google: { kurgu: null, sebep: "Google'da WhatsApp reklamı yok" },
  },
  TELEFON: {
    kod: 'TELEFON',
    ekranAdi: 'Beni arasınlar',
    neAlacaksin: 'Reklamdan doğrudan seni arayanlar.',
    meta: { niyet: 'TELEFON', kurulacak: 'Arama düğmeli reklam' },
    google: { kurgu: 'ARAMA', ulasma: 'telefon', kurulacak: 'Arama kampanyası · arama uzantısı', nerede: 'Google Arama' },
  },
  VIDEO: {
    kod: 'VIDEO',
    ekranAdi: 'Videom izlensin',
    neAlacaksin: 'Videonu sonuna kadar izleyenler.',
    meta: { niyet: 'VIDEO_IZLENME', kurulacak: 'Etkileşim · video izlenme (Reels, akış)' },
    google: { kurgu: 'TALEP_YARATMA_VIDEO', ulasma: null, kurulacak: 'Talep Yaratma · YouTube ve Shorts', nerede: 'YouTube' },
  },
  ERISIM: {
    kod: 'ERISIM',
    ekranAdi: 'Bölgemde çok kişi görsün',
    neAlacaksin: 'Bölgendeki en çok kişiye ulaşır.',
    meta: { niyet: 'ERISIM', kurulacak: 'Bilinirlik · erişim, haftada en çok 2 kez' },
    google: { kurgu: 'TALEP_YARATMA_GORSEL', ulasma: null, kurulacak: 'Talep Yaratma · YouTube, Gmail, Keşfet', nerede: 'YouTube, Gmail, Keşfet' },
  },
  SATIS: {
    kod: 'SATIS',
    ekranAdi: 'Sitemden satış gelsin',
    neAlacaksin: 'Sitende alışveriş yapanlar.',
    meta: { niyet: 'SATIS', kurulacak: 'Satış · satın alma' },
    google: { kurgu: 'MAKS_PERFORMANS', ulasma: null, kurulacak: 'Maks. Performans · bütün Google', nerede: 'Bütün Google' },
  },
};

/**
 * - `acik`: herkes görür, gerçek yayın.
 * - `deneme`: YALNIZ ajans yöneticisi görür ve kurulum DURAKLATILMIŞ kalır
 *   (açılmaz). Canlı tur bu kipte, Profaj'ın kendi hesabında yapılır.
 * - `kapali`: kimse görmez (kod yazılmadı ya da ölçüm başarısız).
 */
export type AcilisDurumu = 'acik' | 'deneme' | 'kapali';

/**
 * TEK AÇILIŞ TABLOSU. Bir satırı `acik` yapan commit'in gövdesinde canlı
 * turun kanıtı (hesap, platform kimliği, gözle doğrulama) YAZILIR.
 * Başlangıç: ilk dalga `deneme` (REHBER-PLANI § 3), gerisi `kapali`.
 */
export const REHBER_ACILIS: Record<RehberAmacKodu, Record<RehberPlatformu, AcilisDurumu>> = {
  SITE: { meta: 'deneme', google: 'deneme' },
  // FORM Dalga 2'ye kaydı (Ajan 2 bulgusu, 2026-10-10): mevcut Meta zinciri
  // form kimliğini boş geçiyor ve gizlilik adresinin Marka Merkezi'nde alanı
  // yok; açık bırakmak "her seferinde engelde duran" bir kart göstermek olurdu.
  FORM: { meta: 'kapali', google: 'kapali' },
  WHATSAPP: { meta: 'kapali', google: 'kapali' },
  TELEFON: { meta: 'kapali', google: 'kapali' },
  VIDEO: { meta: 'kapali', google: 'deneme' },
  ERISIM: { meta: 'kapali', google: 'kapali' },
  SATIS: { meta: 'kapali', google: 'kapali' },
};

/**
 * Bu kullanıcı bu amaç × platformu görebilir mi. Google karşılığı olmayan
 * amaçta tablo ne derse desin `false`: tablo yanlışlıkla açılsa bile
 * derleyicisi olmayan bir dala yol açılmasın.
 */
export function platformGorunurMu(amac: RehberAmacKodu, platform: RehberPlatformu, ajansYoneticisi: boolean): boolean {
  if (platform === 'google' && REHBER_AMACLARI[amac].google.kurgu === null) return false;
  const d = REHBER_ACILIS[amac][platform];
  return d === 'acik' || (d === 'deneme' && ajansYoneticisi);
}

/** Amaç kartı gösterilir mi: en az bir platformu görünür olmalı. */
export function amacGorunurMu(amac: RehberAmacKodu, ajansYoneticisi: boolean): boolean {
  return REHBER_PLATFORMLARI.some((p) => platformGorunurMu(amac, p, ajansYoneticisi));
}

/**
 * Bu amaç × platform yayında AÇILABİLİR mi (yoksa duraklatılmış kalır).
 * `deneme` kurulur, geri okunur, AÇILMAZ — canlı tur parayı harcamadan
 * Meta/Google'ın neyi farklı döndürdüğünü ölçer.
 */
export function platformAcilabilirMi(amac: RehberAmacKodu, platform: RehberPlatformu): boolean {
  return REHBER_ACILIS[amac][platform] === 'acik';
}
