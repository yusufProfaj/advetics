/**
 * ═══ SAĞLIK KONTROLLERİ (B-4) — YALNIZ VERİSİ DEPODA OLANLAR ═══
 *
 * ORPHEX-BOSLUK § 2 altı kontrol önerdi. Depo okundu (2026-10-12) ve
 * her birinin verisinin NEREDE durduğu aşağıda. Verisi veritabanında
 * olmayan kontrol bu listeye GİRMEDİ: o kontrol ya platform çağrısı ister
 * (Paket A'nın "kota etkisi sıfır" ilkesini bozar) ya da yalnız bir kişinin
 * ekranı açtığı anın bellek önbelleğinde durur (bugün var, yarın yok =
 * aynı kod iki gün iki farklı sonuç). Dışarıda kalanlar `SAGLIK_DISARIDA`
 * içinde nedeniyle; ekran bunları "henüz kontrol edilmiyor" diye SÖYLER,
 * yokmuş gibi davranmaz.
 *
 * Her kontrol hesaplama işinde SAF bir fonksiyon olacak
 * (`kontrol(veri) → bulgu | null`, Ajan 2); liste ve anlamı burada.
 */

/*
 * PAKET F1 KONTROLLERİ SONDA (veri-kaynagi/saglik.ts#KAYNAK_SAGLIK_TANIMI):
 * verisi artık depoda (veri_kaynaklari.yapi, ga4_gunluk,
 * ga4_anahtar_etkinlik_gunluk). `ga4_anahtar_etkinlik_yok` SAGLIK_DISARIDA'dan
 * buraya TAŞINDI; iki listede birden dursaydı ekran onu hem "kontrol
 * ediliyor" hem "kontrol edilmiyor" diye yazardı. GA4 bağlı olmayan
 * workspace'te dördü de SUSAR (bilinmeyen = yok değil). F2/F3 kodları
 * (`search_console_yok`, `urun_onaysiz`) o dalgalar gelince eklenir.
 */
export const SAGLIK_KONTROLLERI = [
  'sifir_gosterim',
  'reklam_onaysiz',
  'donusum_kesildi',
  'ga4_anahtar_etkinlik_yok',
  'ga4_veri_gelmiyor',
  'takip_acigi',
  'utm_eksik',
] as const;
export type SaglikKontrolu = (typeof SAGLIK_KONTROLLERI)[number];

export interface SaglikKontrolTanimi {
  /** Panel başlığı (kısa, sade, uzun tire yok). */
  ad: string;
  seviye: 'account' | 'campaign' | 'ad_group' | 'ad';
  /** Verinin depodaki yeri — Ajan 2 SQL'i buradan kurar, Ajan 4 bununla sınar. */
  kaynak: string;
  /** Koşul, kelimeyle. Sayılar `SAGLIK` sabitinde. */
  kosul: string;
  /** Veri bu sıklıkla tazeleniyor; kontrol bundan sık anlamlı değil. */
  tazelik: string;
}

export const SAGLIK_KONTROL_TANIMI: Record<SaglikKontrolu, SaglikKontrolTanimi> = {
  sifir_gosterim: {
    ad: 'Etkin ama 7 gündür hiç gösterilmiyor',
    seviye: 'campaign',
    kaynak:
      'campaigns.status = active (+ ad_groups.status) · insights_daily (campaign/ad_group seviyesi, impressions toplamı) · ad_accounts.last_insights_sync_at · campaigns.created_at',
    kosul:
      'Platformda etkin, en az SAGLIK.sifirGosterimGun gündür bizde kayıtlı, son SAGLIK.sifirGosterimGun tam günde gösterim toplamı 0 VE hesabın günlük metrik çekimi taze. Meta sıfır teslimli günde SATIR DÖNDÜRMÜYOR: "satır yok" ile "0" aynı sayılır, ama yalnız çekim tazeyse.',
    tazelik: 'yapı 6 saatte bir, günlük metrik günde bir',
  },
  reklam_onaysiz: {
    ad: 'Reklam reddedildi ya da kısıtlı',
    seviye: 'ad',
    kaynak:
      'ads.review_status, ads.disapproval_reasons (structure-sync yazıyor) · yorum ve ayrıştırma ads/review-issues.ts#parseReviewIssues + hasReviewIssue (Reklam Yöneticisi "Sorunlu" süzgeciyle AYNI fonksiyon)',
    kosul:
      'Reklam silinmemiş, durumu etkin ve hasReviewIssue doğru. İkinci bir "sorunlu" tanımı YAZILMAZ: Reklam Yöneticisi ile Sinyaller farklı sayı gösterirse ikisine de güven kalmaz.',
    tazelik: 'yapı taraması, 6 saatte bir',
  },
  donusum_kesildi: {
    ad: 'Dönüşümler kayıt edilmiyor olabilir',
    seviye: 'account',
    kaynak: 'insights_daily (campaign seviyesi toplamı: conversions, impressions)',
    kosul:
      'Son SAGLIK.donusumPencereGun günde (dönüşüm gecikmesi kadar geriden) gösterim eşiği geçilmiş ama dönüşüm 0; önceki SAGLIK.donusumOncekiGun günde en az SAGLIK.donusumOncekiEnAz dönüşüm vardı. Yani "hiç dönüşüm yok" DEĞİL, "vardı, kesildi": farkındalık kampanyası hiç dönüşüm saymaz ve onu uyarmak yanlış alarm.',
    tazelik: 'günlük metrik + gece geri düzeltme',
  },
  /*
   * Paket F1. Workspace kapsamlı iki kontrol (`ga4_anahtar_etkinlik_yok`,
   * `ga4_veri_gelmiyor`) HESAP seviyesinde yazılıyor: sinyal satırı bir reklam
   * hesabına bağlı (`sinyaller.ad_account_id NOT NULL`) ve sözleşmeyi
   * genişletmek yerine kontrol yalnız TIKLAMA ALAN hesapta açılıyor (boşta
   * duran hesap aynı uyarıyı ikinci kez basmasın).
   */
  ga4_anahtar_etkinlik_yok: {
    ad: 'Analytics\'te anahtar etkinlik yok',
    seviye: 'account',
    kaynak: 'veri_kaynaklari.yapi.anahtarEtkinlikler (kaynak_yapi işi, Admin API keyEvents) + insights_daily (hesabın son 7 gün tıklaması)',
    kosul:
      'Workspace\'te etkin GA4 kaynağı var, yapı işi son 36 saatte koştu ve anahtar etkinlik listesi BOŞ; hesap son 7 günde tıklama aldı. Yapı koşmadıysa SUSAR.',
    tazelik: 'kaynak yapısı günde bir',
  },
  ga4_veri_gelmiyor: {
    ad: 'Analytics veri almıyor',
    seviye: 'account',
    kaynak: 'ga4_gunluk (oturum) + insights_daily (tıklama) + veri_kaynaklari.son_basarili_cekim',
    kosul:
      'Son 3 tam günde (Analytics işlenme gecikmesi dışında) hesabın reklam tıklaması TAKIP_ACIGI.enAzTiklama ve üstü ama workspace\'in GA4 oturumu 0; GA4 günlük çekimi son 36 saatte başarılı. Çekim koşmadıysa SUSAR (boş tablo "sitede kimse yok" demek değil).',
    tazelik: 'kaynak günlük çekimi günde bir',
  },
  takip_acigi: {
    ad: 'Platform ile site dönüşümleri tutmuyor',
    seviye: 'campaign',
    kaynak: 'ga4_anahtar_etkinlik_gunluk + insights_daily (eşleme sorgu anında, veri-kaynagi/esleme.ts)',
    kosul: 'Son 14 günde (son 2 gün hariç) takipAcigi() etiketi platform_fazla, site_fazla ya da site_hic_gormuyor. veri_yetersiz SİNYAL ÜRETMEZ.',
    tazelik: 'kaynak günlük çekimi günde bir',
  },
  utm_eksik: {
    ad: 'Reklam bağlantılarında kampanya etiketi yok',
    seviye: 'account',
    kaynak: 'ga4_gunluk (ücretli Meta/LinkedIn trafiği, kampanya "(not set)")',
    kosul:
      'Son 14 günde hesabın platformundan gelen ücretli oturumların %30\'undan fazlasında kampanya etiketi yok. Google otomatik etiketlemeyle eşlendiği için Google hesapları bu kontrole girmez.',
    tazelik: 'kaynak günlük çekimi günde bir',
  },
};

/**
 * Eşikler. ÖLÇÜLECEK (Ajan 5, sessiz koşum) — anomali sabitlerindeki not
 * burada da geçerli.
 */
export const SAGLIK = {
  sifirGosterimGun: 7,
  /** Günlük metrik çekimi bundan eskiyse kontrol SUSAR ve hesap "veri bayat" yazar. */
  veriTazelikSaat: 36,
  donusumPencereGun: 7,
  donusumOncekiGun: 28,
  donusumOncekiEnAz: 10,
  /** Pencerede bu kadar gösterim yoksa "dönüşüm 0" bir bilgi değil. */
  donusumPencereEnAzGosterim: 5000,
  /** F1: `takip_acigi` ve `utm_eksik` penceresi (son N gün, işlenme gecikmesi hariç). */
  kaynakPencereGun: 14,
  /** F1: `ga4_veri_gelmiyor` penceresi (tam gün). */
  ga4SessizGun: 3,
  /** F1: ücretli oturumların bu payından fazlası etiketsizse `utm_eksik`. */
  utmEksikPay: 0.3,
  /** F1: `utm_eksik` bu kadar ücretli oturum yoksa susar (küçük hacimde pay anlamsız). */
  utmEksikEnAzOturum: 50,
} as const;

/**
 * DIŞARIDA KALANLAR — Orphex taslağında olup verisi depoda OLMAYANLAR.
 * Ekran "Kontrol edilmeyenler" satırında bunları adıyla ve nedeniyle
 * listeler; kullanıcı neyin izlenmediğini bilmeli.
 */
export const SAGLIK_DISARIDA = [
  {
    kod: 'meta_kitle_kucuk',
    ad: 'Meta özel kitlesi 1.000 kişinin altında',
    neden:
      'Kitle listesi depoda saklanmıyor; yalnız istek anında Meta\'dan okunuyor (connections.service#listCustomAudiences). Kontrol için her gün her hesaba bir Meta çağrısı gerekir.',
  },
  // `ga4_anahtar_etkinlik_yok` buradan SAGLIK_KONTROLLERI'ne taşındı (Paket
  // F1: liste artık veri_kaynaklari.yapi'de saklanıyor).
  {
    kod: 'donusum_islemi_pasif',
    ad: 'Google dönüşüm işlemi yok ya da pasif',
    neden:
      'Dönüşüm işlemleri Ölçüm ekranı açılınca Google\'dan canlı okunuyor ve yalnız sunucu belleğinde önbellekte duruyor (olcum.service onbellek). Yerine depodan hesaplanabilen "dönüşümler kesildi" kontrolü var.',
  },
  {
    kod: 'pmax_varlik_eksik',
    ad: 'Performance Max öğe grubunda asgari öğe yok',
    neden:
      'Öğe grubu içeriği yalnız AdvCampaign\'in kendi kurduğu kampanyanın geri okumasında soruluyor (reklam/google/google-yayin.ts); senkronizasyon öğe gruplarını hiç çekmiyor.',
  },
] as const;
/**
 * KOŞULLU DIŞARIDA KALAN (Ajan 4, Ö-2). `utm_eksik` yalnız etiketleme BİZİM
 * kontrolümüzdeyken koşar: Google otomatik etiketle her zaman, Meta yalnız
 * AdvCampaign etiketi açıkken (`META_UTM_ETIKETI=1`, reklam/utm-etiketi.ts).
 * Kapalıyken Meta tıklaması GA4'te "facebook / referral" görünür, ücretli
 * sayılmaz ve kontrol HİÇBİR ŞEY görmeden "temiz" derdi. O yüzden kapalıyken
 * Meta tarafı koşmamış sayılır (açık sinyali "düzeldi" diye kapatmaz) ve
 * ekranda bu satırla SÖYLENİR.
 */
export const SAGLIK_KOSULLU_DISARIDA = [
  {
    kod: 'utm_eksik_meta',
    ad: 'Meta reklamlarında kampanya etiketi',
    neden: 'Meta reklamları kampanya etiketi olmadan gidiyor (ayar kapalı)',
  },
] as const;

export type SaglikDisaridaKodu = (typeof SAGLIK_DISARIDA)[number]['kod'] | (typeof SAGLIK_KOSULLU_DISARIDA)[number]['kod'];
