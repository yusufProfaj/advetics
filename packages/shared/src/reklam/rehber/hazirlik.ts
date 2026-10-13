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
/**
 * Bir YouTube videosunun reklam için gereken hâli (B15). `videos.list
 * part=snippet,status,contentDetails` (1 kota birimi, 50 kimliğe kadar).
 * `null` = YouTube o alanı döndürmedi; "bilinmiyor" ile "hayır" karışmasın.
 */
export interface YoutubeVideoBilgisi {
  videoId: string;
  baslik: string;
  kucukResim: string | null;
  /** Saniye (ISO 8601 `PT1M5S` çözülmüş). */
  sureSn: number | null;
  /** `public` / `unlisted` / `private`. */
  gizlilik: string | null;
  /** `status.embeddable`: false ise video başka yerde (reklamda) oynatılamaz. */
  gomulebilir: boolean | null;
  /** Reklama konamıyorsa SEBEBİ (giriş anında engel); konabiliyorsa `null`. */
  engel: string | null;
}

/**
 * Gizli ya da yerleştirilemeyen video Google video reklamında GÖSTERİLEMEZ:
 * kurulum provada ya da (daha kötüsü) yayında, gösterimsiz kalarak düşer.
 * Kural TEK yerde: sunucu okuma ucu, eksik listesi ve panel bunu çağırıyor.
 * Liste dışı (`unlisted`) video reklamda kullanılabiliyor; engel değil.
 */
export function youtubeVideoEngeli(v: { gizlilik?: string | null; gomulebilir?: boolean | null }): string | null {
  if (v.gizlilik === 'private') return "Bu video YouTube'da gizli; reklamda gösterilemez. Herkese açık ya da liste dışı yap.";
  if (v.gomulebilir === false) return "Bu videonun başka sitelerde oynatılması YouTube'da kapalı; reklamda gösterilemez. Video ayarlarında yerleştirmeye izin ver.";
  return null;
}

export interface YoutubeVideoListesi {
  satirlar: Array<{
    videoId: string;
    baslik: string;
    kucukResim: string | null;
    yayinTarihi: string | null;
    /** B15: ayrıntı okunduysa dolu; okunamadıysa `null` ve sebep `ayrintiHatasi`nda. */
    sureSn?: number | null;
    gizlilik?: string | null;
    gomulebilir?: boolean | null;
  }>;
  /**
   * Süre ve gizlilik ayrı çağrıyla okunuyor; o çağrı düşerse liste yine
   * gelir ama SEBEP ekranda yazar (boş alanlar "her şey yolunda" sanılmasın).
   */
  ayrintiHatasi?: string | null;
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
  /**
   * Meta pikseli son 7 günde satın alma saydı mı. Rehberde SEÇİLİ pikselin
   * değeri (`seciliPiksel.satinAlma7Gun`); hazırlıkta piksel seçili değil ve
   * yalnız hesapta TEK kullanılabilir piksel varsa onunki, piksel hiç yoksa
   * `false`, birden çoksa `null` (seçime bağlı).
   */
  metaSatisOlcumu: UcHal;
  /** Google Ads'te birincil satın alma dönüşüm işlemi etkin mi. */
  googleSatisOlcumu: UcHal;
  /**
   * Son 30 günde SATIN ALMA kategorisinde sayılan dönüşüm (Maks. Performans
   * hacim uyarısı). `null` = okunamadı ya da okunmadı; alan yok = eski
   * istemci/önbellek. Sıfır "okunamadı" ile karışmaz: sıfır bir sayı.
   */
  googleSatis30Gun?: number | null;
  /**
   * Marka Merkezi logosu Maks. Performans'ın LOGO kuralına uyuyor mu (1:1,
   * en az 128×128; Google belgesi). `null` = ölçü bilinmiyor.
   */
  googleLogoKare?: UcHal;
  /** Google Ads'te herhangi bir birincil dönüşüm işlemi etkin mi (teklif seçimi buna bakar). */
  googleDonusumEtkin: UcHal;
  /** Marka Merkezi'nde logo ve işletme adı (Talep Yaratma zorunlu tutuyor). */
  googleLogoVeAd: boolean;
  /**
   * SEÇİLİ formun Meta'daki hâli (FORM amacı, Ç-3). `null` = bilinmiyor:
   * form seçilmedi ya da seçili sayfanın formları henüz okunmadı/okunamadı.
   *
   * Gizlilik adresi FORMUN KENDİSİNDE: Meta anlık formu gizlilik politikası
   * bağlantısı olmadan kabul etmiyor, yani var olan bir formun adresi
   * Meta'da duruyor. Burada bir süre "Marka Merkezi'nde gizlilik adresi"
   * aranıyordu ve o alan Marka Merkezi'nde hiç yoktu: değer iki yerde sabit
   * `false` yazılıydı ve Form amacı HER ZAMAN engelde kalıyordu.
   */
  seciliForm: SeciliFormHali | null;
  /**
   * SEÇİLİ pikselin Meta'daki hâli (SATIS, Dalga 3). `null` = bilinmiyor:
   * piksel seçilmedi ya da seçili hesabın pikselleri okunmadı/okunamadı.
   * İsteğe bağlı: eski istemciler alanı tanımıyor.
   */
  seciliPiksel?: SeciliPikselHali | null;
}

export interface SeciliPikselHali {
  /** Meta'daki adı; piksel hesabın listesinde yoksa `null`. */
  ad: string | null;
  /** Piksel SEÇİLİ reklam hesabının piksellerinden biri mi. */
  hesaptaVar: boolean;
  /** Meta pikseli kullanılamaz işaretlemiş mi (`is_unavailable`). */
  kullanilamaz: boolean;
  /** `last_fired_time` hiç yok: piksel siteye kurulmamış ya da hiç olay almamış. */
  hicCalismadi: boolean;
  /** Son olay okuma anından önceki 7 gün içinde mi. */
  son7GundeCalisti: boolean;
  /** Son 7 günde satın alma sayıldı mı; okunamadıysa `null`. */
  satinAlma7Gun: UcHal;
  /**
   * Son 7 günün satın alma SAYISI (`satinAlma7Gun` ile aynı okumadan);
   * okunamadıysa `null`. Karar tablosu haftalık hacmi buradan söylüyor.
   */
  satinAlma7GunSayisi?: number | null;
}

/**
 * Seçili Meta reklam hesabının pikselleri
 * (`GET /reklam/rehber/pikseller?clientId=&adAccountId=`, Dalga 3).
 * DÖRT HÂL: okunamadı = uç hata döner (Meta'nın mesajıyla); boş =
 * `satirlar` boş ve `bosNeden` dolu; liste = `satirlar`. "Okunuyor" panelin.
 */
export interface RehberPikselListesi {
  satirlar: RehberPikseli[];
  toplam: number;
  /** Meta listesi sayfa sınırında kesildiyse: ekranda "ilk N piksel" yazılır. */
  kesildi: boolean;
  bosNeden: string | null;
}

export interface RehberPikseli {
  id: string;
  ad: string;
  /** Son olay anı (ISO 8601); hiç olay yoksa `null`. */
  sonCalisma: string | null;
  kullanilamaz: boolean;
  /** Son 7 günde satın alma sayıldı mı (`/{piksel}/stats`); okunamadıysa `null`. */
  satinAlma7Gun: UcHal;
  /** Son 7 günün satın alma sayısı; okunamadıysa `null`. */
  satinAlma7GunSayisi?: number | null;
}

export interface SeciliFormHali {
  /** Meta'daki adı; form sayfanın yayında listesinde yoksa `null`. */
  ad: string | null;
  /** Form SEÇİLİ sayfanın yayında (ACTIVE) formlarından biri mi. */
  sayfadaYayinda: boolean;
  /** Formun Meta'da gizlilik politikası adresi var mı. */
  gizlilikAdresi: boolean;
  /**
   * Formun türü Meta'dan (`is_optimized_for_quality`): `higher_intent` =
   * daha yüksek niyet, `more_volume` = daha fazla hacim. `null` = okunamadı
   * (alan dönmedi): onay ekranı "bilinmiyor" der, tahmin etmez. İsteğe
   * bağlı: eski önbellek satırı alanı taşımıyor.
   */
  tur?: 'more_volume' | 'higher_intent' | null;
  /** Formdaki soru sayısı (`questions`); `null` = okunamadı. */
  soruSayisi?: number | null;
}

/**
 * Seçili sayfanın Meta'daki YAYINDA anlık formları
 * (`GET /reklam/rehber/form-sablonlari?clientId=&sayfaId=`, Ç-2).
 *
 * Kaynak Meta (`/{sayfa}/leadgen_forms`), Advetics'in `lead_forms` tablosu
 * DEĞİL: formların çoğu Reklam Yöneticisi'nde kuruluyor ve bizde satırı
 * yok; eski liste onları hiç göstermiyordu. Advetics'te yayınlanmış formlar
 * aynı Meta kimliğiyle zaten listede; adları Advetics'teki adla yazılır.
 * Taslak, arşivlenmiş ve silinmiş formlar listede YOK: seçilseler reklam
 * Meta'da reddedilirdi.
 *
 * DÖRT HÂL: okunamadı = uç hata döner (platformun mesajıyla); boş = `satirlar`
 * boş ve `bosNeden` dolu; liste = `satirlar`. "Okunuyor" panelin kendi hâli.
 */
export interface RehberFormListesi {
  satirlar: Array<{ id: string; ad: string; gizlilikAdresi: string | null }>;
  /** Yayında form sayısı (dönen satır sayısı; kesme yok). */
  toplam: number;
  /** Meta listesi sayfa sınırında kesildiyse: ekranda "ilk N form" yazılır. */
  kesildi: boolean;
  bosNeden: string | null;
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
  /*
   * Form listesi burada DEĞİL (Dalga 2): liste SEÇİLİ sayfaya bağlı ve
   * Meta'dan okunuyor; hazırlık ilk sayfanın Advetics kayıtlarını okuyordu ve
   * Meta'da kurulan form listeye hiç düşmüyordu. Ayrı uç: `RehberFormListesi`.
   */
  /** Kullanıcı ajans yöneticisi mi: `deneme` açılışlı amaçları yalnız o görür. */
  ajansYoneticisi: boolean;
  /**
   * HAZIR WORKSPACE varsayılanları (Dalga 3): rehber açılınca piksel, bütçe
   * ve kategori cevabı bunlardan önden dolar. Hazırlık hiç koşmadıysa `null`.
   */
  hazirlama: { pikselId: string | null; gunlukButceMicros: string | null; gunlukButceParaBirimi: string | null; kategoriCevaplandi: boolean } | null;
}

/**
 * İki platform da uygunsa ikisi seçili gelir (kullanıcı kararı K-3).
 * Uygunluk = görünür + hesabı atanmış + bilinen bir ön koşulu EKSİK değil.
 * Saf: panel önerinin SEBEBİNİ yazarken de bunu okur.
 *
 * SATIŞTA GOOGLE, satın alma dönüşümü KESİN yoksa (`false`) açılmaz: Maks.
 * Performans o hâlde kurulamıyor (G-DONUSUM engeli) ve canlı turda
 * (2026-10-11) ekran "ikisi de hazır" deyip kullanıcıyı Google'ı elle
 * kapatmaya bırakıyordu. `null` (okunamadı) kapatmaz: bilinmeyen bir şey
 * yüzünden platform saklanmaz, engel ekranda söylenir.
 */
export function googleOnKosulEksik(amac: RehberAmacKodu, h: Partial<Pick<RehberHazirligi, 'onKosullar'>>): boolean {
  return amac === 'SATIS' && h.onKosullar?.googleSatisOlcumu === false;
}

export function onerilenPlatformlar(
  amac: RehberAmacKodu,
  h: Pick<RehberHazirligi, 'hesaplar' | 'googleHesaplari' | 'ajansYoneticisi'> & Partial<Pick<RehberHazirligi, 'onKosullar'>>,
  gorunurMu: (amac: RehberAmacKodu, p: RehberPlatformu, ajansYoneticisi: boolean) => boolean,
): Record<RehberPlatformu, boolean> {
  return {
    meta: gorunurMu(amac, 'meta', h.ajansYoneticisi) && h.hesaplar.length > 0,
    google: gorunurMu(amac, 'google', h.ajansYoneticisi) && h.googleHesaplari.length > 0 && !googleOnKosulEksik(amac, h),
  };
}
