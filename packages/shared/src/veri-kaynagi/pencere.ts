import type { KaynakTuru } from './kaynak';

/**
 * ═══ ÇEKİM PENCERELERİ — SAF FONKSİYON, ÇALIŞTIRILARAK SINANIR ═══
 *
 * `datesForJob` deseninin kaynak karşılığı. Bir günlük boşluk sessizce eksik
 * veri, bir günlük örtüşme boşa kota (`istekPencereleri` dersi); ikisi de
 * kaynak taramasıyla görünmez. Bütün tarihler `YYYY-MM-DD` dizgesi.
 *
 * "Bugün" KAYNAĞIN saat diliminde hesaplanır: GA4 mülkünün kendi dilimi,
 * Search Console ise HER ZAMAN Pasifik (ÖLÇÜLECEK; Google'ın yardım
 * sayfası raporları Pasifik saatine göre veriyor). Reklam hesabının
 * dilimini kullanmak gece yarısına yakın olayları komşu güne yazar.
 */

export interface KaynakPencereTanimi {
  /** Günlük iş: bugünden kaç gün geriden başlar (dahil). */
  gunlukGeri: number;
  /** Günlük iş: en yeni gün, bugünden kaç gün geride (dahil). */
  gunlukSon: number;
  /** İlk bağlantıda geçmiş: kaç gün. */
  gecmisGun: number;
  /** Geçmiş çekimi bu kadar günlük parçalara bölünür (her parça hemen yazılır). */
  parcaGun: number;
}

export const KAYNAK_PENCERESI: Record<KaynakTuru, KaynakPencereTanimi> = {
  /*
   * GA4 dünü işlemeyi 24-48 saatte bitiriyor (ÖLÇÜLECEK: resmî sayfada
   * sayı bulunamadı) ve anahtar etkinlikler sonradan düzeliyor; son 3 gün
   * her gece yeniden çekilir (reklamdaki `insights_backfill` gibi). Upsert.
   */
  ga4: { gunlukGeri: 3, gunlukSon: 1, gecmisGun: 90, parcaGun: 30 },
  /* Search Console 2-3 gün geriden geliyor; `dataState: final` yalnız kesinleşeni verir. */
  search_console: { gunlukGeri: 5, gunlukSon: 2, gecmisGun: 90, parcaGun: 15 },
  /* Merchant ürün performansı: GA4 gibi, sonradan düzeliyor. */
  merchant_center: { gunlukGeri: 3, gunlukSon: 1, gecmisGun: 90, parcaGun: 30 },
  /* Katalog bir anlık görüntü; tarih penceresi yok (yapı işi). */
  meta_katalog: { gunlukGeri: 0, gunlukSon: 0, gecmisGun: 0, parcaGun: 1 },
  /*
   * Sipariş: iade ve iptal GÜNLER SONRA geliyor; son 14 gün her gece
   * yeniden okunur, yoksa iade edilen sipariş net gelirde kalır.
   */
  ikas: { gunlukGeri: 14, gunlukSon: 0, gecmisGun: 90, parcaGun: 15 },
  ticimax: { gunlukGeri: 14, gunlukSon: 0, gecmisGun: 90, parcaGun: 15 },
  /* Shopify `read_orders` yalnız son 60 günü veriyor (eskisi `read_all_orders` onayı). */
  shopify: { gunlukGeri: 14, gunlukSon: 0, gecmisGun: 60, parcaGun: 15 },
};

function gunKaydir(gun: string, n: number): string {
  const [y, m, d] = gun.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/** Günlük işin tek penceresi. Katalog gibi tarihsiz kaynakta `null`. */
export function kaynakGunlukPencere(tur: KaynakTuru, bugun: string): { from: string; to: string } | null {
  const p = KAYNAK_PENCERESI[tur];
  if (p.gunlukGeri === 0 && p.gunlukSon === 0) return null;
  return { from: gunKaydir(bugun, -p.gunlukGeri), to: gunKaydir(bugun, -p.gunlukSon) };
}

/**
 * Geçmiş çekiminin parçaları, YENİDEN ESKİYE (en değerli veri önce yazılsın:
 * kota yarıda biterse elde kalan son günler olsun). Parçalar boşluksuz ve
 * örtüşmesiz; son parça kısa olabilir. Geçmiş, günlük pencerenin hemen
 * öncesine kadar değil BUGÜNE kadar iner: ilk bağlantıda günlük iş henüz
 * koşmadı ve aradaki günler boş kalırdı (örtüşme upsert, zararsız).
 */
export function kaynakGecmisParcalari(tur: KaynakTuru, bugun: string): Array<{ from: string; to: string }> {
  const p = KAYNAK_PENCERESI[tur];
  if (p.gecmisGun === 0) return [];
  const son = gunKaydir(bugun, -p.gunlukSon);
  const ilk = gunKaydir(son, -(p.gecmisGun - 1));
  const parcalar: Array<{ from: string; to: string }> = [];
  let to = son;
  while (to >= ilk) {
    let from = gunKaydir(to, -(p.parcaGun - 1));
    if (from < ilk) from = ilk;
    parcalar.push({ from, to });
    to = gunKaydir(from, -1);
  }
  return parcalar;
}
