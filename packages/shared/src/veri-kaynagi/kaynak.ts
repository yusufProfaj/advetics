import { z } from 'zod';

/**
 * ═══ VERİ KAYNAĞI — REKLAM PLATFORMU DEĞİL ═══
 *
 * GA4, Search Console, Merchant Center, Meta kataloğu ve mağaza altyapıları
 * (ikas, Ticimax, Shopify) `PLATFORMS`a ve Prisma `enum Platform`a GİRMEZ.
 * Gerekçe ölçülebilir: `Platform` değeri eklemek CLAUDE.md'nin "platform
 * eklemenin gerçek yüzeyi"ni tetikliyor: 29 metotlu `IAdPlatformProvider`,
 * `provider.registry.ts` (`Record<Platform, ...>`), `PLATFORM_METRIK_SEVIYELERI`,
 * `ENTITY_LEVEL_LABELS`, `rapor-pdf.service.ts#PLATFORM_SIRASI` ve LinkedIn
 * eklenirken sayılan 47 elle yazılmış liste. Bir GA4 mülkünün kampanyası,
 * bütçesi, reklamı, kotası yok; o listelerin her biri ya boş bir dal ya da
 * GA4'ü "dördüncü reklam platformu" sanıp harcama toplamına sokan bir döngü
 * olurdu. En sinsi olanı ikincisi: `PLATFORMS` üzerinde dönen bir toplam
 * GA4 satırını SIFIR harcamalı bir platform sayar ve hiçbir hata düşmez.
 *
 * Ayrı kavram şunu da sağlıyor: kaynak verisi `insights_daily`ye YAZILMAZ.
 * O tablonun her toplama sorgusu "reklam metriği" varsayıyor; site oturumu
 * oraya girerse panelin her harcama/ dönüşüm rakamı sessizce bozulur.
 *
 * İSTİSNA (bilinçli): ürün bazında REKLAM performansı (Google
 * `shopping_performance_view`, Meta `product_id` kırılımı) bir veri kaynağı
 * DEĞİL, reklam hesabının kendi verisi. Onlar platform işi (`urun_performansi`,
 * `tablolar.ts`) ve hesapla birlikte taşınır. Kaynak yalnız REKLAM DIŞI veri:
 * site davranışı, organik arama, ürün listesi, mağaza siparişi.
 */

export const KAYNAK_TURLERI = [
  'ga4',
  'search_console',
  'merchant_center',
  'meta_katalog',
  'ikas',
  'ticimax',
  'shopify',
] as const;
export type KaynakTuru = (typeof KAYNAK_TURLERI)[number];

/** Alt paket: F1 GA4, F2 Search Console, F3 e-ticaret. Dalga sırası MIMARI § 0. */
export const KAYNAK_PAKETLERI = ['F1', 'F2', 'F3'] as const;
export type KaynakPaketi = (typeof KAYNAK_PAKETLERI)[number];

/**
 * Kimlik doğrulama biçimi.
 *
 * - `google_oauth`: AJANSIN VAR OLAN Google bağlantısı (`platform_connections`,
 *   platform `google`), izin `include_granted_scopes` ile genişletilir.
 *   AYRI bir Google bağlantısı AÇILMAZ: aynı Google kimliğini ikinci kez
 *   yetkilendirmek platformun önceki token'ı geçersiz kılmasıyla bağlantıları
 *   koparıyordu (CLAUDE.md § 5, "AJANSIN BAĞLANTISI BİR KEZ KURULUR").
 * - `meta_oauth`: var olan Meta bağlantısı (katalog okuma).
 * - `magaza_anahtari`: mağazanın kendi panelinde üretilen kimlik (ikas özel
 *   uygulama client id/secret, Ticimax üye kodu, Shopify uygulama token'ı).
 *   Platform bağlantısı yok; şifreli olarak kaynak satırında durur.
 */
export const KAYNAK_KIMLIK_BICIMLERI = ['google_oauth', 'meta_oauth', 'magaza_anahtari'] as const;
export type KaynakKimlikBicimi = (typeof KAYNAK_KIMLIK_BICIMLERI)[number];

export interface KaynakTanimi {
  ad: string;
  paket: KaynakPaketi;
  kimlik: KaynakKimlikBicimi;
  /**
   * Gereken OAuth izni (yalnız `google_oauth`). TEK izin: okuma için hangisi
   * yetiyorsa o. Ölçüm kurulumunun beş iznini birden istemek, yalnız rapor
   * okumak isteyen kullanıcıyı Tag Manager yayın iznine zorlamak olurdu.
   */
  scope: string | null;
  /** Dış kimliğin örneği (ekranda yer tutucu). */
  ornek: string;
  /** Resmî belge (doğrulandı 2026-10-12, MIMARI § 1). */
  belge: string;
  /** Kodun bu kaynağa YAZMA yapıp yapmadığı. Hepsi `false`: Paket F salt okuma. */
  yazar: false;
}

export const KAYNAK_TANIMI: Record<KaynakTuru, KaynakTanimi> = {
  ga4: {
    ad: 'Google Analytics 4',
    paket: 'F1',
    kimlik: 'google_oauth',
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    ornek: '123456789',
    belge: 'https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport',
    yazar: false,
  },
  search_console: {
    ad: 'Google Search Console',
    paket: 'F2',
    kimlik: 'google_oauth',
    scope: 'https://www.googleapis.com/auth/webmasters.readonly',
    ornek: 'sc-domain:ornek.com',
    belge: 'https://developers.google.com/webmaster-tools/v1/searchanalytics/query',
    yazar: false,
  },
  merchant_center: {
    ad: 'Google Merchant Center',
    paket: 'F3',
    kimlik: 'google_oauth',
    /*
     * SALT OKUMA İZNİ YOK: Merchant API'nin tek izni `content` ve yazma da
     * veriyor. Kod yalnız okur; Ajan 4 kaynak taramasıyla Merchant istemcisinde
     * `:insert`, `:delete`, `PATCH` olmadığını kilitler.
     */
    scope: 'https://www.googleapis.com/auth/content',
    ornek: '123456789',
    belge: 'https://developers.google.com/merchant/api/reference/rest/reports_v1/accounts.reports/search',
    yazar: false,
  },
  meta_katalog: {
    ad: 'Meta ürün kataloğu',
    paket: 'F3',
    kimlik: 'meta_oauth',
    scope: null,
    ornek: '1234567890123456',
    belge: 'https://developers.facebook.com/docs/marketing-api/reference/product-catalog/products/',
    yazar: false,
  },
  ikas: {
    ad: 'ikas',
    paket: 'F3',
    kimlik: 'magaza_anahtari',
    scope: null,
    ornek: 'magazam.myikas.com',
    belge: 'https://ikas.dev/docs/api/getting-started/authentication',
    yazar: false,
  },
  ticimax: {
    ad: 'Ticimax',
    paket: 'F3',
    kimlik: 'magaza_anahtari',
    scope: null,
    ornek: 'www.magazam.com',
    belge: 'https://www.ticimax.com/web-servis-api/',
    yazar: false,
  },
  shopify: {
    ad: 'Shopify',
    paket: 'F3',
    kimlik: 'magaza_anahtari',
    scope: null,
    ornek: 'magazam.myshopify.com',
    belge: 'https://shopify.dev/docs/api/admin-graphql/latest/objects/Order',
    yazar: false,
  },
};

/**
 * Bağlantıda eksik olan izin. `null` = izin tamam ya da izin gerekmiyor.
 *
 * Tek izni kontrol eder; ölçüm izinlerinin hepsi aranmaz (yukarıdaki not).
 */
export function eksikKaynakIzni(tur: KaynakTuru, verilenIzinler: readonly string[]): string | null {
  const s = KAYNAK_TANIMI[tur].scope;
  if (s === null) return null;
  return verilenIzinler.includes(s) ? null : s;
}

/**
 * Bağlantının durumu. Durum makinesi kasıtlı olarak DÜZ: hepsinden her
 * birine geçilebiliyor, karar hep son işin sonucundan. `kaldirildi` satırı
 * SİLMEZ: geçmiş veri raporlarda kalır, aynı mülk yeniden bağlanınca aynı
 * satır canlanır (ikinci satır ve çift sayım yok).
 */
export const KAYNAK_DURUMLARI = ['etkin', 'izin_eksik', 'erisim_yok', 'hata', 'duraklatildi', 'kaldirildi'] as const;
export type KaynakDurumu = (typeof KAYNAK_DURUMLARI)[number];

/** Zamanlanmış işin süpürdüğü durumlar. `hata` DAHİL: geçici hata bir sonraki gün düzelir. */
export const KAYNAK_SUPURULEN_DURUMLAR: readonly KaynakDurumu[] = ['etkin', 'hata'];

/**
 * DIŞ KİMLİK DENETİMİ — GİRİŞ ANINDA.
 *
 * Mağaza adresleri SUNUCUNUN İSTEK ATACAĞI ADRES. Shopify ve ikas sabit
 * alan adında (`endsWith`, `includes` DEĞİL: `x.myshopify.com.evil.com`).
 * Ticimax mağazanın KENDİ alan adında: orada liste tutulamaz, koruma
 * çözülen IP'de (CLAUDE.md "SERBEST URL İNDİRİLECEKSE KORUMA ÇÖZÜLEN
 * IP'DE", `tenancy/site-oku.ts#ozelAdres`); burada yalnız biçim.
 */
const IP_LITERALI = /^(\d{1,3}\.){3}\d{1,3}$|^\[?[0-9a-f:]+\]?$/i;
const ALAN_ADI = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export type DisKimlikSonucu = { gecerli: true; deger: string } | { gecerli: false; neden: string };

export function disKimlikDenetle(tur: KaynakTuru, ham: string): DisKimlikSonucu {
  const d = ham.trim();
  if (!d) return { gecerli: false, neden: 'Boş bırakılamaz.' };
  switch (tur) {
    case 'ga4':
      // "properties/123" de kabul: Admin API'den kopyalanan biçim.
      {
        const m = /^(?:properties\/)?(\d{6,12})$/.exec(d);
        if (!m) return { gecerli: false, neden: 'Analytics mülk kimliği yalnız rakamdan oluşur (G- ile başlayan ölçüm kimliği değil).' };
        return { gecerli: true, deger: m[1]! };
      }
    case 'merchant_center': {
      const m = /^(?:accounts\/)?(\d{5,20})$/.exec(d);
      if (!m) return { gecerli: false, neden: 'Merchant Center hesap kimliği yalnız rakamdan oluşur.' };
      return { gecerli: true, deger: m[1]! };
    }
    case 'meta_katalog':
      if (!/^\d{8,20}$/.test(d)) return { gecerli: false, neden: 'Katalog kimliği yalnız rakamdan oluşur.' };
      return { gecerli: true, deger: d };
    case 'search_console': {
      // İki mülk türü: alan adı mülkü ve adres önekli mülk. Adres önekli
      // mülkün sonundaki "/" Search Console'da kimliğin PARÇASI; atmak
      // başka bir mülk adı demek, o yüzden olduğu gibi saklanır.
      if (d.startsWith('sc-domain:')) {
        const alan = d.slice('sc-domain:'.length).toLowerCase();
        if (!ALAN_ADI.test(alan)) return { gecerli: false, neden: 'Alan adı mülkü "sc-domain:ornek.com" biçiminde olmalı.' };
        return { gecerli: true, deger: `sc-domain:${alan}` };
      }
      if (!/^https?:\/\/[^\s/]+\/.*$/.test(d)) return { gecerli: false, neden: 'Adres mülkü "https://www.ornek.com/" biçiminde, sonunda "/" ile olmalı.' };
      return { gecerli: true, deger: d };
    }
    case 'ikas':
    case 'shopify':
    case 'ticimax': {
      const alan = d.toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
      if (alan.includes('/') || alan.includes('@') || alan.includes(':')) return { gecerli: false, neden: 'Yalnız alan adı yazın (yol, port ya da kullanıcı adı olmadan).' };
      if (IP_LITERALI.test(alan)) return { gecerli: false, neden: 'IP adresi kabul edilmiyor, alan adı yazın.' };
      if (!ALAN_ADI.test(alan)) return { gecerli: false, neden: 'Geçerli bir alan adı değil.' };
      if (tur === 'shopify' && !alan.endsWith('.myshopify.com')) return { gecerli: false, neden: 'Shopify mağaza adresi "magaza.myshopify.com" biçiminde olmalı (kendi alan adınız değil).' };
      if (tur === 'ikas' && !alan.endsWith('.myikas.com')) return { gecerli: false, neden: 'ikas mağaza adresi "magaza.myikas.com" biçiminde olmalı.' };
      return { gecerli: true, deger: alan };
    }
  }
}

export const kaynakBaglaSchema = z.object({
  clientId: z.string().uuid(),
  tur: z.enum(KAYNAK_TURLERI),
  disKimlik: z.string().min(1).max(300),
  /** Yalnız `magaza_anahtari`: mağaza panelinde üretilen kimlik. Şifreli saklanır, yanıtta DÖNMEZ. */
  gizli: z
    .object({ anahtar: z.string().min(8).max(500), gizliAnahtar: z.string().min(8).max(500).optional() })
    .optional(),
});
export type KaynakBaglaIstegi = z.infer<typeof kaynakBaglaSchema>;

/** Panelde tek kaynak satırı. Şifreli kimlik ASLA yok; `kimlikIpucu` yalnız son 4 karakter. */
export interface VeriKaynagiOzeti {
  id: string;
  clientId: string;
  tur: KaynakTuru;
  disKimlik: string;
  ad: string;
  durum: KaynakDurumu;
  /** Platformun cümlesi aynen (izin yok, mülk bulunamadı...). */
  sonHata: string | null;
  sonBasariliCekim: string | null;
  /** Kaynağın saat dilimi (GA4 mülkü, Search Console her zaman Pasifik). */
  saatDilimi: string | null;
  paraBirimi: string | null;
  kimlikIpucu: string | null;
  /**
   * Kurulum rehberindeki mülk ile okunan mülk farklıysa dolu (yalnız GA4).
   * İki kayıt da kalıyor (kurulum = kurduğumuz, kaynak = okuduğumuz); ayrıştıklarında
   * SÖYLENİR, sessizce biri seçilmez.
   */
  kurulumUyusmazligi: { kurulumMulkId: string } | null;
}

export interface VeriKaynaklariYaniti {
  kaynaklar: VeriKaynagiOzeti[];
  /** Bağlanabilecek ama bağlanmamış türler ve neden (izin eksik, Google bağlantısı yok). */
  baglanabilir: Array<{ tur: KaynakTuru; engel: string | null }>;
}
