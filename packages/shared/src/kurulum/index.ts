import { z } from 'zod';

/**
 * ═══ WORKSPACE KURULUM REHBERİ — SÖZLEŞME (docs/kurulum/MIMARI.md) ═══
 *
 * Kullanıcı (2026-10-12): her projenin ayrı Meta, Google Ads, Tag Manager ve
 * Analytics'i olmalı; ajans atamıyorsa rehber hesapları, dönüşüm kurulumunu ve
 * doğrulamayı yürütür, ajans atadıysa eksikler görünür ve tek tuşla tamamlanır.
 */

export const KURULUM_GRUPLARI = ['hesaplar', 'olcum', 'marka'] as const;
export type KurulumGrubu = (typeof KURULUM_GRUPLARI)[number];

export const KURULUM_ADIM_KODLARI = [
  'meta_hesap',
  'meta_odeme',
  'sayfa',
  'google_hesap',
  'google_odeme',
  'google_izin',
  'gtm_konteyner',
  'ga4_mulk',
  'meta_piksel',
  'ads_donusum',
  'ga4_ads_bag',
  'gtm_etiket',
  'site_kodu',
  'dogrulama',
  'marka',
] as const;
export type KurulumAdimKodu = (typeof KURULUM_ADIM_KODLARI)[number];

/** Sözlük, dallanma değil: yeni adım eklenince derleme kırılsın. */
export const KURULUM_ADIM_GRUBU: Record<KurulumAdimKodu, KurulumGrubu> = {
  meta_hesap: 'hesaplar',
  meta_odeme: 'hesaplar',
  sayfa: 'hesaplar',
  google_hesap: 'hesaplar',
  google_odeme: 'hesaplar',
  google_izin: 'olcum',
  gtm_konteyner: 'olcum',
  ga4_mulk: 'olcum',
  meta_piksel: 'olcum',
  ads_donusum: 'olcum',
  ga4_ads_bag: 'olcum',
  gtm_etiket: 'olcum',
  site_kodu: 'olcum',
  dogrulama: 'olcum',
  marka: 'marka',
};

export const KURULUM_ADIM_ADI: Record<KurulumAdimKodu, string> = {
  meta_hesap: 'Meta reklam hesabı',
  meta_odeme: 'Meta ödeme yöntemi',
  sayfa: 'Facebook sayfası ve Instagram',
  google_hesap: 'Google Ads hesabı',
  google_odeme: 'Google Ads faturalandırma',
  google_izin: 'Tag Manager ve Analytics izni',
  gtm_konteyner: 'Tag Manager konteyneri',
  ga4_mulk: 'Google Analytics mülkü',
  meta_piksel: 'Meta pikseli',
  ads_donusum: 'Google Ads dönüşümleri',
  ga4_ads_bag: 'Analytics ile Google Ads bağlantısı',
  gtm_etiket: 'Ölçüm etiketleri',
  site_kodu: 'Sitedeki kod',
  dogrulama: 'Ölçüm doğrulaması',
  marka: 'Marka bilgileri ve varsayılanlar',
};

/**
 * `kullanicida`: sistemin YAPAMAYACAĞI, kullanıcının platformda yapması
 * gereken iş (ödeme yöntemi, site kodu). `eksik` ile ayrı: eksik olanı
 * sistem yapabilir, kullanıcıda olanı yapamaz; ikisini aynı göstermek
 * "Eksikleri tamamla"ya basıp hiçbir şey olmamasını açıklanamaz kılardı.
 */
export const KURULUM_ADIM_DURUMLARI = ['tamam', 'eksik', 'kullanicida', 'hata', 'atlandi'] as const;
export type KurulumAdimDurumu = (typeof KURULUM_ADIM_DURUMLARI)[number];

export const HESAP_SAHIPLERI = ['ajans', 'sirket'] as const;
export type HesapSahibi = (typeof HESAP_SAHIPLERI)[number];

export type KurulumEylemi =
  /** Tek tık, sistem yapar. */
  | { tur: 'otomatik'; etiket: string }
  /** Mevcut olanı seç ya da yeni aç; seçenekler ayrı uçtan gelir (platforma gider). */
  | { tur: 'secim'; etiket: string }
  /** Platformun kendi sayfasında kullanıcı yapar (ödeme yöntemi). */
  | { tur: 'dis'; etiket: string; adres: string }
  /** OAuth izin genişletme. */
  | { tur: 'izin'; etiket: string; baglantiId: string }
  /** Kullanıcıdan bilgi (teşekkür sayfası, geliştirici e-postası). */
  | { tur: 'girdi'; etiket: string };

export interface KurulumAdimi {
  kod: KurulumAdimKodu;
  grup: KurulumGrubu;
  durum: KurulumAdimDurumu;
  /** Kısa sonuç ("act_123 · Proje A", "GTM-ABC123"). */
  baslik: string;
  /** NEDEN — her durumda dolu; hata ise platformun mesajı. */
  neden: string;
  eylem: KurulumEylemi | null;
  /** "Eksikleri tamamla" bu adımı kendisi yapabilir mi (şu anki durumda). */
  otomatik: boolean;
}

export interface KurulumYaniti {
  clientId: string;
  workspaceAdi: string;
  /** Site adresi (Workspace ayarları); geliştirici e-postası ve web akışı için. */
  site: string | null;
  hesapSahibi: HesapSahibi | null;
  adimlar: KurulumAdimi[];
  ozet: { tamam: number; toplam: number; otomatikYapilabilir: number; kullanicida: number };
  /** Konteyner varsa siteye eklenecek kod. */
  siteKodu: { gtmKimligi: string; head: string; body: string } | null;
  /** Kayıtlı dönüşüm tetikleri; "Yaz ve yayınla" bunları yeniden gönderir. */
  donusumTetigi: DonusumTetigi | null;
}

export interface KurulumSecenegi {
  deger: string;
  etiket: string;
  /** "sitede görüldü", "İstanbul saati yok" gibi kısa not. */
  not?: string;
}

export interface KurulumSecenekleri {
  kod: KurulumAdimKodu;
  /** Mevcut varlıklar (ata/kullan). */
  mevcut: KurulumSecenegi[];
  /** Yeni açmak için üst kaplar (BM, MCC, GTM hesabı, GA hesabı); boşsa yeni açılamaz. */
  ustler: KurulumSecenegi[];
  /** Liste neden boş ya da kısıtlı (izin yok, bağlantı yok…). */
  not: string | null;
}

export interface KurulumAdimSonucu {
  kod: KurulumAdimKodu;
  durum: 'yapildi' | 'atlandi' | 'hata';
  mesaj: string;
}

const kimlik = z.string().trim().min(1).max(200);
const projeAdi = z.string().trim().min(2).max(100);

/** Teşekkür sayfası yolu: "/tesekkurler" ya da tam adres; sorgu ve parça atılır. */
export const tesekkurYoluSchema = z
  .string()
  .trim()
  .min(2)
  .max(300)
  // Shared'da URL yok (tarayıcı/Node tipleri yüklü değil): yol elle ayrılır.
  // Şema ve alan adı atılır, sorgu (?) ve parça (#) kesilir, sondaki / gider.
  .transform((s) => {
    const yol = s.replace(/^[a-z]+:\/\/[^/]+/i, '').split(/[?#]/)[0] ?? '';
    return yol.replace(/\/+$/, '') || '/';
  })
  .refine((s) => s.startsWith('/') && s !== '/', 'Teşekkür sayfasının yolunu yaz (örn. /tesekkurler). Ana sayfa olamaz: her ziyaret dönüşüm sayılırdı.');

export const donusumTetigiSchema = z.object({
  /** null = sitede form yok ya da teşekkür sayfası yok; form dönüşümü kurulmaz (nedeni yazar). */
  formYolu: tesekkurYoluSchema.nullable(),
  telefon: z.boolean(),
  whatsapp: z.boolean(),
});
export type DonusumTetigi = z.infer<typeof donusumTetigiSchema>;

export const kurulumIstegiSchema = z.discriminatedUnion('kod', [
  z.object({ kod: z.literal('hesap_sahibi'), deger: z.enum(HESAP_SAHIPLERI) }),
  z.object({
    kod: z.literal('meta_hesap'),
    secim: z.discriminatedUnion('tur', [
      z.object({ tur: z.literal('mevcut'), adAccountId: z.string().uuid() }),
      z.object({ tur: z.literal('yeni'), businessId: z.string().regex(/^\d{5,30}$/), ad: projeAdi }),
    ]),
  }),
  z.object({ kod: z.literal('sayfa'), sayfaId: z.string().uuid() }),
  z.object({
    kod: z.literal('google_hesap'),
    secim: z.discriminatedUnion('tur', [
      z.object({ tur: z.literal('mevcut'), adAccountId: z.string().uuid() }),
      z.object({ tur: z.literal('yeni'), mccId: z.string().regex(/^\d{10}$/), ad: projeAdi }),
      /** Şirketin mevcut hesabına MCC bağlantı daveti; şirket Google Ads'te kabul eder. */
      z.object({ tur: z.literal('davet'), mccId: z.string().regex(/^\d{10}$/), musteriNo: z.string().regex(/^\d{3}-?\d{3}-?\d{4}$/) }),
    ]),
  }),
  z.object({
    kod: z.literal('gtm_konteyner'),
    secim: z.discriminatedUnion('tur', [
      z.object({ tur: z.literal('mevcut'), konteynerYolu: z.string().regex(/^accounts\/\d+\/containers\/\d+$/) }),
      z.object({ tur: z.literal('yeni'), gtmHesapId: z.string().regex(/^\d+$/) }),
    ]),
  }),
  z.object({
    kod: z.literal('ga4_mulk'),
    secim: z.discriminatedUnion('tur', [
      z.object({ tur: z.literal('mevcut'), mulkId: z.string().regex(/^\d+$/) }),
      z.object({ tur: z.literal('yeni'), gaHesapId: z.string().regex(/^\d+$/) }),
    ]),
  }),
  z.object({
    kod: z.literal('meta_piksel'),
    secim: z.discriminatedUnion('tur', [
      z.object({ tur: z.literal('mevcut'), pikselId: z.string().regex(/^\d{5,30}$/) }),
      z.object({ tur: z.literal('yeni') }),
    ]),
  }),
  /** Ödeme yöntemini platformdan okur ("Kontrol et"). */
  z.object({ kod: z.literal('meta_odeme') }),
  z.object({ kod: z.literal('google_odeme') }),
  z.object({ kod: z.literal('ads_donusum') }),
  z.object({ kod: z.literal('ga4_ads_bag') }),
  z.object({ kod: z.literal('gtm_etiket'), tetik: donusumTetigiSchema }),
  z.object({ kod: z.literal('site_kodu') }),
  z.object({ kod: z.literal('dogrulama') }),
]);
export type KurulumIstegi = z.infer<typeof kurulumIstegiSchema>;

export const kurulumSecenekSorgusuSchema = z.object({
  kod: z.enum(['meta_hesap', 'sayfa', 'google_hesap', 'gtm_konteyner', 'ga4_mulk', 'meta_piksel']),
});

/** "Eksikleri tamamla"nın sırası: bağımlılık sırası (konteyner ve mülk etiketlerden önce). */
export const OTOMATIK_SIRA: readonly KurulumAdimKodu[] = ['sayfa', 'meta_piksel', 'gtm_konteyner', 'ga4_mulk', 'ads_donusum', 'ga4_ads_bag', 'gtm_etiket'];

/**
 * Google Tag Manager'ın resmî kurulum kodu. `head` sayfanın <head>'ine,
 * `body` <body> açılışının hemen ardına. Kimlik dışında hiçbir şey
 * değişmiyor; kendi biçimimizi yazmak, kurulumu tarif eden Google
 * belgeleriyle ayrışan bir kod demek olurdu.
 */
export function gtmKodu(gtmKimligi: string): { head: string; body: string } {
  if (!/^GTM-[A-Z0-9]{4,12}$/.test(gtmKimligi)) throw new Error(`Geçersiz Tag Manager kimliği: ${gtmKimligi}`);
  return {
    head:
      `<!-- Google Tag Manager -->\n<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':\n` +
      `new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],\n` +
      `j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=\n` +
      `'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);\n` +
      `})(window,document,'script','dataLayer','${gtmKimligi}');</script>\n<!-- End Google Tag Manager -->`,
    body:
      `<!-- Google Tag Manager (noscript) -->\n<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gtmKimligi}"\n` +
      `height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>\n<!-- End Google Tag Manager (noscript) -->`,
  };
}

export function kurulumOzeti(adimlar: readonly KurulumAdimi[]): KurulumYaniti['ozet'] {
  return {
    tamam: adimlar.filter((a) => a.durum === 'tamam').length,
    toplam: adimlar.filter((a) => a.durum !== 'atlandi').length,
    otomatikYapilabilir: adimlar.filter((a) => a.otomatik).length,
    kullanicida: adimlar.filter((a) => a.durum === 'kullanicida').length,
  };
}
