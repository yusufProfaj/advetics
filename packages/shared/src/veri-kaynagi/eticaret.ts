/**
 * ═══ F3 · E-TİCARET VE ÜRÜN PERFORMANSI (iskelet) ═══
 *
 * Üç kaynak ailesi, tek ürün anahtarı:
 *  - Reklamın ürün verisi (platform işi `urun_performansi`): Google
 *    `shopping_performance_view` (Performance Max perakende dahil; alan
 *    adları canlıda ölçülecek), Meta `product_id` kırılımı (yalnız gösterim/
 *    harcama gibi Meta İÇİ metrikler belgeli; site satın alması ürün başına
 *    gelmeyebilir, ÖLÇÜLECEK).
 *  - Ürün listesi: Merchant API (Content API for Shopping 2026-08-18'de
 *    emekliye ayrıldı, eylülden beri aralıklı 410 dönüyor; YENİ KOD YALNIZ
 *    Merchant API), Meta kataloğu.
 *  - Gerçek satış: mağaza siparişi (ikas, Ticimax, Shopify).
 *
 * ORTAK ANAHTAR ürün kimliği (feed `offerId` = Meta `retailer_id` = mağaza
 * SKU'su, çoğu kurulumda). Eşleşmeyen ürün TAHMİNLE eşlenmez; eşlenemeyen
 * harcama payı ekranda yazılır.
 */

export const MAGAZA_ALTYAPILARI = ['ikas', 'ticimax', 'shopify'] as const;
export type MagazaAltyapisi = (typeof MAGAZA_ALTYAPILARI)[number];

/**
 * Mağaza bağlantısının ölçülmüş/bulunamamış gerçekleri. `bilinmiyor` alanlar
 * ÖLÇÜLMEDEN kod yazılmaz (MIMARI F3, ölçüm listesi).
 */
export const MAGAZA_GERCEKLERI: Record<MagazaAltyapisi, { kimlik: string; uc: string; hizSiniri: string; onay: string }> = {
  ikas: {
    kimlik: 'Özel uygulama client_id/secret → https://<mağaza>.myikas.com/api/admin/oauth/token (client_credentials), token ~4 saat',
    uc: 'POST https://api.myikas.com/api/v1/admin/graphql',
    hizSiniri: 'bilinmiyor (belgede yok)',
    onay: 'Özel uygulama mağaza panelinde açılıyor; ikas App Store onayı gerekip gerekmediği bilinmiyor',
  },
  ticimax: {
    kimlik: 'Mağaza panelinden üretilen yetki kodu (UyeKodu), WCF/SOAP, HTTPS',
    uc: 'Mağazanın kendi alan adında servis (WSDL mağaza/destekten istenecek)',
    hizSiniri: 'bilinmiyor',
    onay: 'bilinmiyor (paket şartı belgede yok)',
  },
  shopify: {
    kimlik: 'Dev Dashboard uygulaması (2026-01-01\'den beri mağaza panelinde yeni özel uygulama açılamıyor); farklı organizasyondaki müşteri mağazası için App Store (onaylı) dağıtım gerekebilir',
    uc: 'POST https://<mağaza>.myshopify.com/admin/api/<sürüm>/graphql.json',
    hizSiniri: 'Maliyet tabanlı kova (örnek: 1000 puan, 50/sn); sorgu başına en çok 1000 puan',
    onay: 'Custom dağıtım: onaysız ama tek mağaza/aynı organizasyon. read_orders yalnız son 60 gün',
  },
};

/**
 * ═══ SİPARİŞTE SAKLANAN ALANLAR — KAPALI LİSTE ═══
 *
 * Kişisel veri (ad, e-posta, telefon, adres, IP) SAKLANMAZ ve İSTENMEZ:
 * ürün başına gelir için gerekmiyor, saklandığı an KVKK yükü ve sızıntı
 * yüzeyi oluyor. Shopify bunu "korunan müşteri verisi" seviyeleriyle
 * zaten ayırıyor; biz Seviye 1'in de altında kalıyoruz. GraphQL sorgusu bu
 * listeden üretilir; Ajan 4 sorgu metninde `email|phone|address|firstName|
 * lastName|customer {` geçmediğini kaynak taramasıyla kilitler.
 */
export const SIPARIS_SAKLANAN_ALANLAR = [
  'siparis_kimligi',
  'siparis_tarihi',
  'durum',
  'para_birimi',
  'brut_mikro',
  'indirim_mikro',
  'kargo_mikro',
  'iade_mikro',
  'net_mikro',
  'kaynak_ipucu',
  'utm_kampanya',
] as const;

export const SIPARIS_YASAK_ALANLAR = ['ad', 'soyad', 'e_posta', 'telefon', 'adres', 'ip', 'musteri_kimligi'] as const;

/**
 * Sipariş durumu, altyapıdan bağımsız. İPTAL GELİRE GİRMEZ; KISMİ İADE
 * net tutardan düşülür. Altyapının kendi durum adları Ajan 2'nin eşleme
 * tablosunda; bilinmeyen durum `bilinmiyor` ve gelire GİRMEZ (tahmin yok)
 * ama sayısı ekranda yazılır.
 */
export const SIPARIS_DURUMLARI = ['tamamlandi', 'kismi_iade', 'tam_iade', 'iptal', 'beklemede', 'bilinmiyor'] as const;
export type SiparisDurumu = (typeof SIPARIS_DURUMLARI)[number];
export const GELIRE_GIREN_DURUMLAR: readonly SiparisDurumu[] = ['tamamlandi', 'kismi_iade', 'beklemede'];

/** Ürün kimliği normalleştirme: yalnız baş/son boşluk. Büyük/küçük harf KORUNUR (SKU'larda anlamlı olabilir). */
export function urunKimligiNormalize(k: string): string {
  return k.trim();
}

/**
 * Google Merchant/Ads ürün kimliği "online:tr:TR:SKU123" biçiminde gelebilir;
 * Meta `retailer_id` ve mağaza SKU'su yalnız "SKU123". Önekli biçim
 * çözülmezse hiçbir ürün eşleşmez ve ekran "takip açığı" yerine "veri yok"
 * gösterir. ÖLÇÜLECEK: `shopping_performance_view` hangi biçimi döndürüyor.
 */
export function googleUrunKimligi(ham: string): string {
  const parca = ham.split(':');
  return urunKimligiNormalize(parca.length === 4 && /^(online|local)$/i.test(parca[0]!) ? parca[3]! : ham);
}

export const URUN_ETIKETLERI = ['gelir_yuksek', 'gelir_dusuk', 'satis_yok', 'takip_acigi', 'eslenemedi'] as const;
export type UrunEtiketi = (typeof URUN_ETIKETLERI)[number];

/**
 * Ürün başına "reklam harcaması → gelir" ve etiket.
 * - `eslenemedi`: reklam ürününün mağazada/katalogda karşılığı yok.
 * - `takip_acigi`: platformun ürüne yazdığı değer mağazanın net gelirinin
 *   1,5 katından fazla ya da yarısından az (ÖLÇÜLECEK eşik) VE iki taraf da
 *   anlamlı hacimde. Para birimi farklıysa kıyas YAPILMAZ (kur tahmini yok).
 * - `satis_yok`: harcama var, mağazada net satış 0.
 * - `gelir_yuksek`/`gelir_dusuk`: mağaza net geliri / harcama ≥ 1 mi (brüt marj yok;
 *   ekran "kâr değil, gelir/harcama" der).
 */
export function urunEtiketi(g: {
  harcamaMikro: bigint;
  platformDegerMikro: bigint;
  magazaNetMikro: bigint | null;
  ayniParaBirimi: boolean;
}): UrunEtiketi {
  if (g.magazaNetMikro === null) return 'eslenemedi';
  if (g.harcamaMikro > 0n && g.magazaNetMikro === 0n) return 'satis_yok';
  if (g.ayniParaBirimi && g.platformDegerMikro > 0n && g.magazaNetMikro > 0n) {
    const oran = Number(g.magazaNetMikro) / Number(g.platformDegerMikro);
    if (oran < 0.5 || oran > 1.5) return 'takip_acigi';
  }
  return g.magazaNetMikro >= g.harcamaMikro ? 'gelir_yuksek' : 'gelir_dusuk';
}
