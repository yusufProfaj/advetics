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

export const SAGLIK_KONTROLLERI = ['sifir_gosterim', 'reklam_onaysiz', 'donusum_kesildi'] as const;
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
  {
    kod: 'ga4_anahtar_etkinlik_yok',
    ad: 'Analytics\'te anahtar etkinlik yok',
    neden:
      'Anahtar etkinlik listesi saklanmıyor (kurulum/ga4.ts canlı okuyor). workspace_kurulum.son_dogrulama.ga4 ANLIK olay sayısı, anahtar etkinlik değil, ve yalnız rehberde "Doğrula" basılınca yazılıyor.',
  },
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
export type SaglikDisaridaKodu = (typeof SAGLIK_DISARIDA)[number]['kod'];
