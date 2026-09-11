import type { Platform } from '../constants/platforms';

/**
 * ═══ UYARI SİSTEMİ ═══
 *
 * Panelde "bir şeyler ters" hâllerinin hepsi bugün AYRI ekranlarda ve çoğu
 * yalnızca o ekrana girildiğinde görünüyor: hesabın platformda kapatılmış
 * olması Platform Bağlantıları'nda, senkronizasyonun düşmesi Senkronizasyon
 * ekranında, hesabı olmayan müşteri Müşteriler ekranında. Kullanıcı bu
 * ekranlara ancak bir sorun olduğunu ZATEN bildiğinde giriyor.
 *
 * ÜRETİLEN HER UYARI MEVCUT VERİDEN OKUNUYOR. Yeni bir platform çağrısı
 * gerektiren hiçbir uyarı yok — uydurulmuş bir uyarı, hiç uyarı olmamasından
 * kötüdür: kullanıcıyı var olmayan bir sorunu aramaya gönderir.
 */

export const UYARI_KODLARI = [
  /** Hesap platformda kapatılmış/askıya alınmış — reklamlar yayınlanmıyor. */
  'hesap_platformda_kapali',
  /** Ödeme sorunu: bakiye ödenmemiş, ek süre ya da ödeme bekliyor. */
  'hesap_odeme_sorunu',
  /** Platform risk incelemesinde — ödemeden AYRI, yapılacak iş farklı. */
  'hesap_risk_incelemesi',
  /** Bağlantı yeniden yetkilendirme istiyor. */
  'baglanti_yetki_istiyor',
  /** Token süresi dolmuş ya da dolmak üzere. */
  'baglanti_token_suresi',
  /** Hesap atanmış ama izleme kapalı — veri hiç çekilmiyor. */
  'hesap_izleme_kapali',
  /** Müşteriye hiç reklam hesabı atanmamış. */
  'musteride_hesap_yok',
  /** İzlemede ama bugüne kadar hiç metrik gelmemiş. */
  'veri_hic_gelmedi',
  /** Metrikler bayat — süpürme koşmuyor olabilir. */
  'veri_bayat',
  /** Senkronizasyon işi kalıcı olarak düşüyor. */
  'is_dusuyor',
] as const;
export type UyariKodu = (typeof UYARI_KODLARI)[number];

export interface Uyari {
  kod: UyariKodu;
  /**
   * `error` = şu anda para/veri kaybı var (reklam yayınlanmıyor, veri hiç
   * gelmiyor). `warn` = kurulum eksik ya da bozulmak üzere.
   *
   * Ayrım keyfi değil: panelde `error` gizlenebiliyor ama sayacı kalıyor,
   * `warn` tamamen kapanabiliyor.
   */
  siddet: 'error' | 'warn';
  /** Tek cümle, kullanıcı diliyle. Ekranda kalın yazılıyor. */
  baslik: string;
  /** Neden böyle ve ne yapılacak. Başlık tek başına eyleme dönüşmüyorsa buradadır. */
  detay: string;

  /** `null` = ajans geneli (bir müşteriye bağlı değil). */
  clientId: string | null;
  clientName: string | null;
  adAccountId: string | null;
  adAccountName: string | null;
  platform: Platform | null;

  /** Panel içi çözüm bağlantısı. `null` = panelden çözülemiyor (platform işi). */
  eylem: { etiket: string; href: string } | null;

  /**
   * Uyarının dayandığı verinin son okunma anı.
   *
   * BAYATLIK GÖRÜNÜR OLMAK ZORUNDA: hesabın platformdaki durumu yalnızca
   * "Hesapları yenile" ile tazeleniyordu ve haftalarca eski kalabiliyordu.
   * Tarihi göstermeyen bir uyarı, düzeltilmiş bir sorunu haftalarca ekranda
   * tutar ve kullanıcı bütün uyarılara güvenmeyi bırakır.
   */
  veriZamani: string | null;
}

export interface UyariYaniti {
  uyarilar: Uyari[];
  /**
   * Kapsamdaki TOPLAM uyarı sayısı — liste kesilmiş olabilir.
   * Sessiz kesme yok: "3 uyarı" ile "gösterilen 3, toplam 27" farklı şeyler.
   */
  toplam: number;
  uretildi: string;

  /**
   * ═══ BAĞLANTI DURUMLARI — UYARI DEĞİL, BİLGİ ═══
   *
   * Yetkinin kaç gün sonra dolacağı bir SORUN değil; sorun hâline gelmeden
   * önce bakılabilen bir DURUM. Uyarı listesine koymak, her gün "yeniden
   * yetkilendir" diye dürtmek demekti ve kullanıcının bildirdiği arıza tam
   * olarak buydu: *"sürekli şimdi yetkilendir bildirimi gözüküp duruyor."*
   *
   * Bu liste bildirim panelinin ayrı bir bölümünde, SESSİZ duruyor: sayıyı
   * merak eden bakıyor, kimse dürtülmüyor. Uyarı yalnızca tazeleme
   * gerçekten başarısız olduğunda (`uyarilar` içinde) doğuyor.
   *
   * AYNI UÇTAN GELİYOR çünkü aynı sorgudan çıkıyor: `alerts.service` zaten
   * bağlantıları okuyor. İkinci bir uç, panelin ikinci bir tur atması ve
   * iki listenin ayrışabilmesi demekti.
   */
  baglantilar: BaglantiDurumu[];
}

/** Bildirim panelindeki "Durum" bölümünün satırı. */
export interface BaglantiDurumu {
  id: string;
  platform: Platform;
  /** Yetkilendirmeyi yapan hesabın etiketi — hangi bağlantı olduğu belli olsun. */
  etiket: string | null;
  /** `active` | `needs_reauth` | `error` | `revoked` */
  durum: string;
  /**
   * Yetkinin dolmasına kalan TAM gün. `null` = platform bir son tarih
   * bildirmiyor (Google'da refresh token süresiz).
   *
   * NEGATİF OLABİLİR ve öyle kalıyor: "-3 gün" ile "0 gün" farklı şeyler
   * ve sıfıra kırpmak, süresi üç gün önce dolmuş bir bağlantıyı bugün
   * dolmuş gibi gösterirdi.
   */
  kalanGun: number | null;
  /** Bu bağlantıya bağlı atanmış hesap sayısı — durumun ağırlığı. */
  etkilenenHesap: number;
}
