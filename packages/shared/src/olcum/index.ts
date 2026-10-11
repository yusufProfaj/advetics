import { z } from 'zod';
import type { RehberAmacKodu } from '../reklam/rehber/amaclar';

/**
 * ═══ ÖLÇÜM KURULUMU — SÖZLEŞME (docs/olcum/MIMARI.md) ═══
 *
 * Reklamların neyi saydığını platform başına GERÇEK durumuyla gösteren
 * Marka Merkezi bölümü. Karar fonksiyonları SAF ve burada: API onları
 * çağırıyor, panel yalnız sonucu çiziyor. İki tarafta ayrı yazılan bir
 * durum kuralı doğduğu anda ayrışır.
 */

export const OLCUM_TURLERI = ['site_formu', 'satin_alma', 'arama', 'mesaj_ve_form'] as const;
export type OlcumTuru = (typeof OLCUM_TURLERI)[number];

export const OLCUM_TURU_ADLARI: Record<OlcumTuru, { ad: string; aciklama: string }> = {
  site_formu: { ad: 'Sitede form gönderimi', aciklama: 'Sitedeki iletişim ya da başvuru formu' },
  satin_alma: { ad: 'Sitede satın alma', aciklama: 'Ödeme tamamlandığında' },
  arama: { ad: 'Telefon araması', aciklama: 'Reklamdaki arama düğmesi ya da sitedeki numara' },
  mesaj_ve_form: { ad: 'Reklam içi form ve WhatsApp', aciklama: 'Meta reklamının kendi formu ve WhatsApp sohbeti' },
};

/** Türü kullanan reklam amaçları (AdvCampaign). */
export const OLCUM_TURU_AMACLARI: Record<OlcumTuru, readonly RehberAmacKodu[]> = {
  site_formu: ['SITE'],
  satin_alma: ['SATIS'],
  arama: ['TELEFON'],
  mesaj_ve_form: ['FORM', 'WHATSAPP'],
};

/**
 * Google kategorileri → tür. ÖLÇÜLDÜ (Ege Birlik, 2026-10-11): `CONTACT`
 * kategorili `cta_click` 30 günde 15.756 sayım aldı — bir tıklama, form
 * değil. Form türüne katmak "form ölçülüyor" yalanı olurdu; listede yok.
 */
export const GOOGLE_KATEGORI_TURU: Readonly<Record<string, OlcumTuru>> = {
  SUBMIT_LEAD_FORM: 'site_formu',
  REQUEST_QUOTE: 'site_formu',
  BOOK_APPOINTMENT: 'site_formu',
  SIGNUP: 'site_formu',
  PURCHASE: 'satin_alma',
  PHONE_CALL_LEAD: 'arama',
};

/** Meta piksel olayları → tür (yalnız sitede atılan olaylar). */
export const META_OLAY_TURU: Readonly<Record<string, OlcumTuru>> = {
  Lead: 'site_formu',
  CompleteRegistration: 'site_formu',
  Contact: 'site_formu',
  SubmitApplication: 'site_formu',
  Purchase: 'satin_alma',
};

export const OLCUM_HUCRE_DURUMLARI = [
  'kaydediliyor',
  'ikincil',
  'sinyal_yok',
  'tanim_yok',
  'platform_sayiyor',
  'platformda_yok',
  'hesap_yok',
  'bilinmiyor',
] as const;
export type OlcumHucreDurumu = (typeof OLCUM_HUCRE_DURUMLARI)[number];

export interface OlcumHucresi {
  durum: OlcumHucreDurumu;
  /** Kısa durum sözü ("Kaydediliyor"). */
  etiket: string;
  /** NEDEN — her durumda dolu; boş hücre yok. */
  neden: string;
  /** Dönemdeki sayım (Google 30 gün, Meta 7 gün); bilinmiyorsa null. */
  sayim: number | null;
}

export interface OlcumSatiri {
  tur: OlcumTuru;
  meta: OlcumHucresi;
  google: OlcumHucresi;
  amaclar: readonly RehberAmacKodu[];
}

/** Google Ads dönüşüm işlemi (salt okunur ayna). */
export interface GoogleDonusumIslemi {
  id: string;
  ad: string;
  /** ENABLED | HIDDEN | REMOVED | … (Google'ın değeri, çevrilmeden). */
  durum: string;
  kategori: string;
  /** WEBPAGE, GOOGLE_ANALYTICS_4_CUSTOM, AD_CALL … */
  tur: string;
  birincil: boolean;
  /** Son 30 gün `all_conversions` (metrik sorgusunda satırı yoksa 0). */
  sayim30Gun: number;
}

/** Meta pikseli ve son 7 günün olay sayıları. */
export interface MetaPikselOlcumu {
  id: string;
  ad: string;
  sonCalisma: string | null;
  kullanilamaz: boolean;
  /** Olay adı → sayım (7 gün). `null`: istatistik okunamadı. */
  olaylar: Record<string, number> | null;
}

export type SiteTaramaDurumu = 'tarandi' | 'adres_yok' | 'ulasilamadi';

export interface SiteTaramasi {
  durum: SiteTaramaDurumu;
  adres: string | null;
  /** `ulasilamadi` iken okuma hatasının kendisi. */
  hata: string | null;
  tagManager: string[];
  analytics: string[];
  googleAds: string[];
  metaPiksel: string[];
  /** Tanınan e-ticaret altyapısı (Shopify, WooCommerce, ikas …) ya da null. */
  altyapi: string | null;
  /** Tag Manager dosyaları da okundu mu (okunamayanlar `hata`ya değil buraya). */
  tagManagerOkunamayan: string[];
}

export type OlcumOneriKodu = 'HESAP_ATA' | 'BIRINCIL_YAP' | 'SITE_ADRESI' | 'GOOGLE_KURULUM' | 'META_OLAY' | 'OKUNAMADI' | 'HEPSI_HAZIR';

export interface OlcumOneriAdimi {
  metin: string;
  ayrinti: string | null;
  /** Değişikliğin yeri: kullanıcı neyin SİTESİNDE değiştiğini görmeli. */
  yer: 'google_ads' | 'tag_manager' | 'site' | 'meta' | 'advetics';
}

export type OlcumEylemi =
  | { tur: 'birincil_yap'; donusumId: string; donusumAdi: string }
  | { tur: 'marka_merkezi'; bolum: 'baglantilar' | 'ayarlar' }
  | null;

export interface OlcumOnerisi {
  kod: OlcumOneriKodu;
  baslik: string;
  metin: string;
  adimlar: OlcumOneriAdimi[];
  eylem: OlcumEylemi;
  /** Faz 1'de yapılamayan kısım (Tag Manager izni) AÇIKÇA söylenir. */
  kisit: string | null;
}

export interface OlcumOkumaHatasi {
  kaynak: 'site' | 'google' | 'meta';
  mesaj: string;
}

export interface OlcumDurumuYaniti {
  clientId: string;
  site: SiteTaramasi;
  /** Atanmış hesaplar; yoksa null (HESAP_ATA). */
  googleHesabi: { id: string; ad: string; musteriNo: string; donusumKimligi: string | null } | null;
  metaHesabi: { id: string; ad: string } | null;
  /**
   * Workspace'e atanmış AMA okunmayan diğer hesaplar (ilki okunuyor). Sessiz
   * kesme yok: ekran "N hesap daha var" der (Ajan 4, K1).
   */
  ekHesaplar: Array<{ platform: 'meta' | 'google'; ad: string }>;
  satirlar: OlcumSatiri[];
  /** İçe aktarılmış Analytics işlemi var mı (Google Ads ↔ Analytics bağlı). null: okunamadı. */
  analyticsBagli: boolean | null;
  googleIslemleri: { satirlar: GoogleDonusumIslemi[]; toplam: number } | null;
  metaPikselleri: { satirlar: MetaPikselOlcumu[]; toplam: number } | null;
  oneri: OlcumOnerisi;
  okumaHatalari: OlcumOkumaHatasi[];
  /** ISO; önbellekten geldiyse önbelleğin zamanı. */
  zaman: string;
}

export const olcumBirincilYapSchema = z.object({
  clientId: z.string().uuid(),
  donusumId: z.string().regex(/^\d{1,20}$/),
});
export type OlcumBirincilYap = z.infer<typeof olcumBirincilYapSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Site taraması (saf): HTML ya da gtm.js metninden kimlikler
// ─────────────────────────────────────────────────────────────────────────────

const tekil = (xs: Iterable<string>) => [...new Set(xs)].sort();

/**
 * Kimlikler METİNDEN. Olay adları ÇIKARILMIYOR: `gtm.js` onları değişkenle
 * taşıyor (`"vtp_eventName":["macro",1]`, ölçüldü) ve sayfa adresinden
 * tetikleyici tahmini sessiz hata üretir. Meta pikseli iki biçimde:
 * sayfada `fbq('init','…')`, gtm.js içinde kaçışlı `fbq(\"init\",\"…\")`.
 */
export function siteKimlikleri(metin: string): Pick<SiteTaramasi, 'tagManager' | 'analytics' | 'googleAds' | 'metaPiksel'> {
  const hepsi = (re: RegExp, grup = 0) => [...metin.matchAll(re)].map((m) => m[grup]!);
  return {
    tagManager: tekil(hepsi(/\bGTM-[A-Z0-9]{4,12}\b/g)),
    analytics: tekil(hepsi(/\bG-[A-Z0-9]{6,14}\b/g)),
    googleAds: tekil(hepsi(/\bAW-\d{6,14}\b/g)),
    metaPiksel: tekil(hepsi(/fbq\(\s*\\?["']init\\?["']\s*,\s*\\?["'](\d{8,20})\\?["']/g, 1)),
  };
}

/**
 * E-ticaret altyapısı İMZASI. Bulunamaması "satış yok" demek değil; yalnız
 * Meta'da `Purchase` de yoksa satış önerisi yapılmıyor (emlak sitesine "satış
 * kur" demek yanlış iş).
 */
const ALTYAPI_IMZALARI: ReadonlyArray<[string, RegExp]> = [
  ['Shopify', /cdn\.shopify\.com|Shopify\.theme/i],
  ['WooCommerce', /woocommerce/i],
  ['ikas', /ikas\.(?:com|io)|cdn\.myikas/i],
  ['Ticimax', /ticimax/i],
  ['IdeaSoft', /ideasoft/i],
  ['T-Soft', /tsoft|t-soft/i],
  ['OpenCart', /catalog\/view\/theme|route=checkout/i],
  ['Magento', /mage\/cookies|Magento_/i],
];
export function altyapiBul(html: string): string | null {
  return ALTYAPI_IMZALARI.find(([, re]) => re.test(html))?.[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Satırlar (saf)
// ─────────────────────────────────────────────────────────────────────────────

const binlik = (n: number) => Math.round(n).toLocaleString('tr-TR');

function hucre(durum: OlcumHucreDurumu, neden: string, sayim: number | null = null): OlcumHucresi {
  const ETIKET: Record<OlcumHucreDurumu, string> = {
    kaydediliyor: 'Kaydediliyor',
    ikincil: 'Sayılıyor, teklifte kullanılmıyor',
    sinyal_yok: 'Sayım yok',
    tanim_yok: 'Ölçülmüyor',
    platform_sayiyor: 'Platform sayıyor',
    platformda_yok: 'Bu platformda yok',
    hesap_yok: 'Hesap atanmamış',
    bilinmiyor: 'Okunamadı',
  };
  return { durum, etiket: ETIKET[durum], neden, sayim };
}

/**
 * Google hücresi — türün EN İYİ işlemi. Sıra: birincil+sayım > ikincil+sayım
 * > birincil (sayımsız) > gizli. Birden çok işlem varsa sayısı söylenir.
 */
export function googleHucresi(tur: OlcumTuru, islemler: readonly GoogleDonusumIslemi[] | null, hata: string | null, hesapVar: boolean): OlcumHucresi {
  if (tur === 'mesaj_ve_form') return hucre('platformda_yok', "Google'da reklam içi form ve WhatsApp reklamı yok");
  if (!hesapVar) return hucre('hesap_yok', "Bu workspace'e Google Ads hesabı atanmamış");
  if (islemler === null) return hucre('bilinmiyor', hata ?? 'Google Ads okunamadı');
  const bu = islemler.filter((i) => GOOGLE_KATEGORI_TURU[i.kategori] === tur && i.durum !== 'REMOVED');
  const etkin = bu.filter((i) => i.durum === 'ENABLED');
  const ek = (i: GoogleDonusumIslemi) => (bu.length > 1 ? ` (${bu.length} işlemden "${i.ad}")` : ` ("${i.ad}")`);
  const birincilSayim = etkin.find((i) => i.birincil && i.sayim30Gun > 0);
  if (birincilSayim) return hucre('kaydediliyor', `Son 30 günde ${binlik(birincilSayim.sayim30Gun)} sayım${ek(birincilSayim)}`, birincilSayim.sayim30Gun);
  const ikincil = etkin.find((i) => !i.birincil && i.sayim30Gun > 0);
  if (ikincil) {
    return hucre('ikincil', `Son 30 günde ${binlik(ikincil.sayim30Gun)} sayım var ama "birincil" değil; Google teklifi bu sayımı kullanmıyor${ek(ikincil)}`, ikincil.sayim30Gun);
  }
  const birincil = etkin.find((i) => i.birincil);
  if (birincil) return hucre('sinyal_yok', `Tanımlı ama son 30 günde sayım gelmedi${ek(birincil)}`, 0);
  if (etkin.length) return hucre('sinyal_yok', `Tanımlı, birincil değil ve son 30 günde sayım yok${ek(etkin[0]!)}`, 0);
  const gizli = bu.find((i) => i.durum === 'HIDDEN');
  if (gizli) return hucre('tanim_yok', `Analytics'te tanımı var ama Google Ads'e alınmamış ("${gizli.ad}")`);
  return hucre('tanim_yok', 'Google Ads hesabında bu dönüşüm tanımlı değil');
}

/** Meta hücresi: site olayları pikselden, reklam içi sonuçlar platformdan. */
export function metaHucresi(
  tur: OlcumTuru,
  pikseller: readonly MetaPikselOlcumu[] | null,
  hata: string | null,
  hesapVar: boolean,
  /** Piksel listesi sayfa sınırında kesildiyse "yok" kesin değildir (Ajan 4, Ö3). */
  kesildi = false,
): OlcumHucresi {
  if (!hesapVar) return hucre('hesap_yok', "Bu workspace'e Meta reklam hesabı atanmamış");
  if (tur === 'mesaj_ve_form') return hucre('platform_sayiyor', 'Meta formu ve WhatsApp sohbetini kendisi sayıyor; sitede kod gerekmez');
  if (tur === 'arama') return hucre('platform_sayiyor', 'Meta arama reklamındaki aramaları kendisi sayıyor');
  if (pikseller === null) return hucre('bilinmiyor', hata ?? 'Meta pikselleri okunamadı');
  const calisan = pikseller.filter((p) => !p.kullanilamaz && p.sonCalisma);
  if (calisan.length === 0) {
    if (kesildi) return hucre('bilinmiyor', 'Piksel listesi kesildi; bütün pikseller sorulamadı');
    return hucre('tanim_yok', pikseller.length === 0 ? 'Reklam hesabında piksel yok' : 'Piksel var ama hiç çalışmamış');
  }
  let toplam = 0;
  let okunamayan = 0;
  const adlar = new Set<string>();
  for (const p of calisan) {
    if (p.olaylar === null) {
      okunamayan++;
      continue;
    }
    for (const [olay, n] of Object.entries(p.olaylar)) {
      if (META_OLAY_TURU[olay] === tur && n > 0) {
        toplam += n;
        adlar.add(olay);
      }
    }
  }
  if (toplam > 0) return hucre('kaydediliyor', `Son 7 günde ${binlik(toplam)} olay (${[...adlar].sort().join(', ')})`, toplam);
  if (okunamayan === calisan.length) return hucre('bilinmiyor', 'Piksel istatistikleri okunamadı');
  if (kesildi) return hucre('bilinmiyor', 'Piksel listesi kesildi; olay bulunamadı ama bütün pikseller sorulamadı');
  const beklenen = tur === 'satin_alma' ? 'Purchase' : 'Lead';
  return hucre('sinyal_yok', `Piksel çalışıyor ama son 7 günde ${beklenen} olayı gelmedi${okunamayan ? ` (${okunamayan} pikselin istatistiği okunamadı)` : ''}`, 0);
}

export interface OlcumGirdisi {
  googleHesapVar: boolean;
  metaHesapVar: boolean;
  googleIslemleri: readonly GoogleDonusumIslemi[] | null;
  googleHata: string | null;
  metaPikselleri: readonly MetaPikselOlcumu[] | null;
  metaHata: string | null;
  /** Piksel listesi sayfa sınırında kesildi mi. */
  metaKesildi?: boolean;
  site: SiteTaramasi;
}

export function olcumSatirlari(g: OlcumGirdisi): OlcumSatiri[] {
  return OLCUM_TURLERI.map((tur) => ({
    tur,
    meta: metaHucresi(tur, g.metaPikselleri, g.metaHata, g.metaHesapVar, g.metaKesildi === true),
    google: googleHucresi(tur, g.googleIslemleri, g.googleHata, g.googleHesapVar),
    amaclar: OLCUM_TURU_AMACLARI[tur],
  }));
}

/** İçe aktarılmış Analytics işlemi = Google Ads ↔ Analytics bağlı (ölçüldü, Ç-2). */
export function analyticsBagliMi(islemler: readonly GoogleDonusumIslemi[] | null): boolean | null {
  if (islemler === null) return null;
  return islemler.some((i) => i.tur.startsWith('GOOGLE_ANALYTICS_4'));
}

// ─────────────────────────────────────────────────────────────────────────────
// En uygun öneri (saf, tek)
// ─────────────────────────────────────────────────────────────────────────────

export const TAG_MANAGER_KISITI =
  "Tag Manager'a otomatik ekleme için Google izni gerekiyor; izin eklenene kadar bu adımı sitenin yöneticisi yapar.";

/**
 * Satış önerisi YALNIZ satış izi varsa: altyapı imzası ya da Meta'da
 * Purchase. Emlak sitesine "satış dönüşümü kur" demek boşa iş ve ekranda
 * kalıcı bir yalancı eksik.
 */
export function satisIziVar(site: SiteTaramasi, satirlar: readonly OlcumSatiri[]): boolean {
  const meta = satirlar.find((s) => s.tur === 'satin_alma')?.meta;
  return site.altyapi !== null || meta?.durum === 'kaydediliyor';
}

export function enUygunOneri(g: OlcumGirdisi, satirlar: readonly OlcumSatiri[]): OlcumOnerisi {
  if (!g.googleHesapVar && !g.metaHesapVar) {
    return {
      kod: 'HESAP_ATA',
      baslik: "Bu workspace'e reklam hesabı atanmamış",
      metin: 'Ölçüm hesaplardan okunuyor. Önce Meta ya da Google Ads hesabını bu workspace’e ata.',
      adimlar: [],
      eylem: { tur: 'marka_merkezi', bolum: 'baglantilar' },
      kisit: null,
    };
  }

  // Sayım var ama teklif kullanmıyor: tek tıkla düzelir, en ucuz kazanç.
  for (const tur of ['site_formu', 'satin_alma', 'arama'] as const) {
    const h = satirlar.find((s) => s.tur === tur)!.google;
    if (h.durum !== 'ikincil' || !g.googleIslemleri) continue;
    const i = g.googleIslemleri.find((x) => GOOGLE_KATEGORI_TURU[x.kategori] === tur && x.durum === 'ENABLED' && !x.birincil && x.sayim30Gun > 0)!;
    return {
      kod: 'BIRINCIL_YAP',
      baslik: `Google "${OLCUM_TURU_ADLARI[tur].ad.toLowerCase()}" sayıyor ama reklamları buna göre iyileştirmiyor`,
      metin: `"${i.ad}" son 30 günde ${binlik(i.sayim30Gun)} sayım aldı; "birincil" olmadığı için Google teklifi onu hedeflemiyor. Birincil yapınca kampanyalar bu sonuca göre optimize edilir.`,
      adimlar: [{ metin: `"${i.ad}" işlemini birincil yap`, ayrinti: 'Google Ads › Hedefler › Dönüşümler; sitende değişiklik yok', yer: 'google_ads' }],
      eylem: { tur: 'birincil_yap', donusumId: i.id, donusumAdi: i.ad },
      kisit: null,
    };
  }

  if (g.site.durum !== 'tarandi') {
    return {
      kod: 'SITE_ADRESI',
      baslik: g.site.durum === 'adres_yok' ? 'Site adresi girilmemiş' : 'Site okunamadı',
      metin:
        g.site.durum === 'adres_yok'
          ? "Sitede hangi etiketlerin olduğunu görebilmemiz için Workspace ayarları'na site adresini yaz."
          : `Siteni tarayamadık: ${g.site.hata ?? 'bilinmeyen hata'}. Adresi kontrol et ya da biraz sonra yeniden tara.`,
      adimlar: [],
      eylem: { tur: 'marka_merkezi', bolum: 'ayarlar' },
      kisit: null,
    };
  }

  const satis = satisIziVar(g.site, satirlar);
  for (const tur of ['site_formu', 'satin_alma'] as const) {
    if (tur === 'satin_alma' && !satis) continue;
    const h = satirlar.find((s) => s.tur === tur)!.google;
    if (h.durum !== 'tanim_yok' && h.durum !== 'sinyal_yok') continue;
    const gtm = g.site.tagManager[0] ?? null;
    const ad = OLCUM_TURU_ADLARI[tur].ad.toLowerCase();
    return {
      kod: 'GOOGLE_KURULUM',
      baslik: `Google Ads ${ad} görmüyor`,
      metin:
        h.durum === 'tanim_yok'
          ? `Google reklamları ${ad} bilmeden iyileştiriliyor. ${gtm ? `Sitende Tag Manager (${gtm}) bulundu; kurulum oradan yapılır.` : 'Sitende Tag Manager bulunamadı; etiket doğrudan sayfaya eklenir.'}`
          : `${h.neden}. Etiket sitede çalışmıyor olabilir.`,
      adimlar: [
        { metin: `Google Ads'te "${OLCUM_TURU_ADLARI[tur].ad}" dönüşümünü aç`, ayrinti: 'Kategori ve sayım biz seçeriz', yer: 'google_ads' },
        { metin: gtm ? `Tag Manager'a (${gtm}) dönüşüm etiketi ekle` : 'Sitenin her sayfasına Google etiketini ekle', ayrinti: 'Tetikleyici: formun gönderildiği an', yer: gtm ? 'tag_manager' : 'site' },
        { metin: 'Yayınla ve ilk sayımı bekle', ayrinti: '"Kaydediliyor" görülmeden bitmiş sayılmaz', yer: 'site' },
      ],
      eylem: null,
      kisit: TAG_MANAGER_KISITI,
    };
  }

  const formMeta = satirlar.find((s) => s.tur === 'site_formu')!.meta;
  if (formMeta.durum === 'sinyal_yok' || formMeta.durum === 'tanim_yok') {
    return {
      kod: 'META_OLAY',
      baslik: 'Meta sitendeki form gönderimlerini görmüyor',
      metin: `${formMeta.neden}. Meta "Siteme gelsinler" reklamlarını form dolduranlara göre iyileştiremiyor.`,
      adimlar: [{ metin: 'Pikselde form gönderiminde "Lead" olayını tetikle', ayrinti: g.site.tagManager[0] ? `Tag Manager (${g.site.tagManager[0]}) üzerinden` : 'Sitenin form koduna', yer: g.site.tagManager[0] ? 'tag_manager' : 'site' }],
      eylem: null,
      kisit: TAG_MANAGER_KISITI,
    };
  }

  // BİLİNMEYEN VERİ ÜSTÜNE OLUMLU HÜKÜM YOK (Ajan 4, B2): bir hücre okunamadıysa
  // "hepsi hazır" demek, okuyamadığımız şeyi çalışıyor saymak olurdu.
  const okunamayan = satirlar.flatMap((r) => [
    ...(r.meta.durum === 'bilinmiyor' ? [`Meta · ${OLCUM_TURU_ADLARI[r.tur].ad}: ${r.meta.neden}`] : []),
    ...(r.google.durum === 'bilinmiyor' ? [`Google · ${OLCUM_TURU_ADLARI[r.tur].ad}: ${r.google.neden}`] : []),
  ]);
  if (okunamayan.length) {
    return {
      kod: 'OKUNAMADI',
      baslik: 'Ölçümlerin bir kısmı okunamadı',
      metin: 'Okuyabildiklerimizde eksik yok; okuyamadıklarımız için bir şey söyleyemiyoruz. Biraz sonra yeniden tara.',
      adimlar: okunamayan.map((m) => ({ metin: m, ayrinti: null, yer: 'advetics' as const })),
      eylem: null,
      kisit: null,
    };
  }

  return {
    kod: 'HEPSI_HAZIR',
    baslik: 'Kullanılabilir bütün ölçümler hazır',
    metin: satis ? 'Form, satış ve aramalar platformlara ulaşıyor.' : 'Form ve aramalar platformlara ulaşıyor. Sitede satış akışı bulunmadı; satın alma ölçümü bu site için gerekmiyor.',
    adimlar: [],
    eylem: null,
    kisit: null,
  };
}
