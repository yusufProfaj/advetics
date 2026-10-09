/**
 * Rehberin hazırlık okuması (`GET /reklam/rehber/hazirlik`).
 *
 * Mevcut `ReklamHazirligi` (Meta: hesap, sayfa, Instagram, görsel, marka,
 * kitle) GENİŞLETİLİYOR, yeniden yazılmıyor: Google hesabı, YouTube kanalı ve
 * iki platformun ÖN KOŞULLARI ekleniyor.
 *
 * ÖN KOŞULLAR ÜÇ HÂLLİ (`true` / `false` / `null`): `null` = "kontrol
 * edemedik" (izin yok, çağrı düştü). Panel turunda iki ön koşul ölçüldü:
 * Lead Ads koşulları kabul edilmemiş sayfada form reklamı reddediliyor,
 * WhatsApp Business hesabı yoksa WhatsApp reklamı açılmıyor. Bilinmeyeni
 * "yok" saymak sağlam kurulumu bozmaya gönderir; "var" saymak yayında
 * patlar. Eksik listesi `null`ı UYARI olarak gösterir, engel olarak değil.
 */
import type { ReklamHazirligi } from '../hazirlik';
import type { RehberAmacKodu, RehberPlatformu } from './amaclar';

export type UcHal = boolean | null;

export interface RehberGoogleHesabi {
  id: string;
  ad: string;
  /** `123-456-7890` biçiminde, ekranda gösterilir. */
  musteriNo: string;
  paraBirimi: string;
  saatDilimi: string;
}

export interface RehberYoutubeKanali {
  id: string;
  ad: string;
}

/**
 * Bağlı YouTube kanalının videoları (`GET /reklam/rehber/youtube-videolari`).
 * Google video reklamı YouTube'daki bir videoyu istiyor; kullanıcıya bağlantı
 * yapıştırtmak yerine kanaldan seçtirilir. Sessiz kesme yok: `toplam`.
 */
export interface YoutubeVideoListesi {
  satirlar: Array<{ videoId: string; baslik: string; kucukResim: string | null; yayinTarihi: string | null }>;
  /** DÖNEN video sayısı (YouTube tek sayfada en çok 50 veriyor). */
  toplam: number;
  /** 50 döndüyse kanalda daha fazlası olabilir: ekranda "son 50 video" yazılır. */
  dahaFazlaVar: boolean;
  bosNeden: string | null;
}

export interface RehberOnKosullari {
  /** Seçili sayfada Lead Ads koşulları kabul edilmiş mi (Meta `leadgen_tos_accepted`). */
  metaFormKosullari: UcHal;
  /** Sayfaya bağlı WhatsApp Business hattı var mı. */
  metaWhatsapp: UcHal;
  /** Meta pikseli son 7 günde satın alma olayı göndermiş mi. */
  metaSatisOlcumu: UcHal;
  /** Google Ads'te birincil satın alma dönüşüm işlemi etkin mi. */
  googleSatisOlcumu: UcHal;
  /** Google Ads'te herhangi bir birincil dönüşüm işlemi etkin mi (teklif seçimi buna bakar). */
  googleDonusumEtkin: UcHal;
  /** Marka Merkezi'nde logo ve işletme adı (Talep Yaratma zorunlu tutuyor). */
  googleLogoVeAd: boolean;
  /** Form reklamı için KVKK/gizlilik adresi Marka Merkezi'nde. */
  gizlilikAdresi: boolean;
}

export interface RehberHazirligi extends ReklamHazirligi {
  googleHesaplari: RehberGoogleHesabi[];
  youtubeKanallari: RehberYoutubeKanali[];
  onKosullar: RehberOnKosullari;
  /**
   * Platformun GÜNLÜK asgari bütçesi, micros dizge. Meta'nın değeri hesaptan
   * okunur (panel turunda bu hesapta 49,34 ₺, `#1885272`); okunamazsa `null`
   * ve ekran sayı UYDURMAZ, "kontrol edilemedi" der. Google Talep Yaratma
   * için 5 USD karşılığı (Google 2026-04-01 kuralı, canlıda ölçüldü).
   * Google Arama'nın resmî asgarisi yok: `null` = sınır yok.
   */
  asgariGunluk: {
    meta: string | null;
    googleTalepYaratma: string | null;
  };
  /** Marka Merkezi'ndeki telefon ve site adresi (adım 4 önden dolar). */
  iletisim: { telefon: string | null; siteAdresi: string | null };
  /**
   * Seçili sayfanın kayıtlı anlık form şablonları (FORM amacı). Boş liste ile
   * okunamayan liste ayrı: `null` = okunamadı. Ajan 3 bulgusu: liste olmadan
   * FORM amacı panelden tamamlanamıyordu.
   */
  formSablonlari: Array<{ id: string; ad: string }> | null;
  /** Kullanıcı ajans yöneticisi mi: `deneme` açılışlı amaçları yalnız o görür. */
  ajansYoneticisi: boolean;
}

/**
 * İki platform da uygunsa ikisi seçili gelir (kullanıcı kararı K-3).
 * Uygunluk = görünür + hesabı atanmış. Saf: panel önerinin SEBEBİNİ
 * yazarken de bunu okur.
 */
export function onerilenPlatformlar(
  amac: RehberAmacKodu,
  h: Pick<RehberHazirligi, 'hesaplar' | 'googleHesaplari' | 'ajansYoneticisi'>,
  gorunurMu: (amac: RehberAmacKodu, p: RehberPlatformu, ajansYoneticisi: boolean) => boolean,
): Record<RehberPlatformu, boolean> {
  return {
    meta: gorunurMu(amac, 'meta', h.ajansYoneticisi) && h.hesaplar.length > 0,
    google: gorunurMu(amac, 'google', h.ajansYoneticisi) && h.googleHesaplari.length > 0,
  };
}
