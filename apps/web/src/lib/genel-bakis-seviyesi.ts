import type { MetricLevel } from '@advetics/shared';

/**
 * ═══ GENEL BAKIŞ: WORKSPACE › MECRA › HESAP › KAMPANYA › REKLAM SETİ › REKLAM ═══
 *
 * Workspace seçildiğinde tablo doğrudan KAMPANYA listeliyordu: Meta, Google
 * ve LinkedIn kampanyaları, farklı reklam hesaplarının kampanyaları tek düz
 * listede. Kullanıcının istediği (2026-10-02): önce mecra, mecraya tıklayınca
 * o mecranın hesapları, hesaba tıklayınca o hesabın kampanyaları.
 *
 * İLK İKİ BASAMAK `MetricLevel` DEĞİL. Mecra ve hesap satırları
 * `insights_daily`nin bir seviyesi değil, kampanya satırlarının TOPLAMI
 * (`/metrics/hesaplar`). `account` seviyesini kullanmak LinkedIn'de boş
 * tablo demekti: orada hesap seviyesi metrik hiç çekilmiyor.
 *
 * KARAR SAF BİR FONKSİYONDA: panelde bileşen render eden test altyapısı
 * yok ve sayfanın içindeki bir koşul zinciri yalnızca kaynak taramasıyla
 * sınanabiliyordu (CLAUDE.md "REACT EFFECT'İNİN İÇİNDEKİ KARAR TEST
 * EDİLEMİYOR — DIŞARI ÇIKAR"). Burada çalıştırılarak sınanıyor.
 */
export const PANEL_SEVIYELERI = ['mecra', 'hesap', 'campaign', 'ad_group', 'ad'] as const;
export type PanelSeviyesi = (typeof PANEL_SEVIYELERI)[number];

/** Tablonun `/metrics/breakdown`tan mı yoksa `/metrics/hesaplar`dan mı beslendiği. */
export function varlikSeviyesi(s: PanelSeviyesi): Exclude<MetricLevel, 'account'> | null {
  return s === 'mecra' || s === 'hesap' ? null : s;
}

/**
 * Adresteki parametrelerden gösterilecek seviye.
 *
 *   · Odak her şeyi ezer: reklam seti → reklam, kampanya → (en az) reklam seti.
 *     Kampanyanın içindeyken kampanya, hesap ya da mecra listesi göstermek,
 *     kartlar tek kampanyayı anlatırken tablonun başka bir şeyi listelemesi
 *     olurdu.
 *   · Açıkça istenen varlık seviyesi (kampanya / set / reklam) korunuyor:
 *     "Kampanya" sekmesi workspace'in BÜTÜN kampanyalarını göstermeye devam
 *     ediyor, eski bağlantılar kırılmıyor.
 *   · Mecra ve hesap YALNIZCA anlamlıyken: hesap seçiliyken hesap listesi
 *     tek satır, mecra seçiliyken mecra listesi tek satır olurdu. O hâlde
 *     varsayılana düşülüyor.
 *   · Varsayılan basamak adresin derinliği: hesap → kampanya, mecra →
 *     hesap, hiçbiri → mecra.
 */
export function panelSeviyesiCoz(p: {
  seviye: string | undefined;
  platform: string | null | undefined;
  hesap: string | undefined;
  kampanya: string | undefined;
  reklamSeti: string | undefined;
}): PanelSeviyesi {
  if (p.reklamSeti) return 'ad';
  const istenen = PANEL_SEVIYELERI.find((s) => s === p.seviye);
  if (p.kampanya) return istenen === 'ad' ? 'ad' : 'ad_group';
  if (istenen === 'campaign' || istenen === 'ad_group' || istenen === 'ad') return istenen;
  if (istenen === 'mecra' && !p.platform && !p.hesap) return 'mecra';
  if (istenen === 'hesap' && !p.hesap) return 'hesap';
  return p.hesap ? 'campaign' : p.platform ? 'hesap' : 'mecra';
}

/**
 * HESAP KİMLİĞİ YALNIZCA UUID İSE TAŞINIYOR.
 *
 * Adres elle düzenlenebiliyor ve API `adAccountId`yi UUID olarak doğruluyor;
 * bozuk bir değer dört sorguyu birden 400 ile düşürür ve ekran "veriler
 * alınamadı" derdi. Düşürmek, kullanıcıyı mecra basamağına geri koyuyor.
 */
export function hesapCoz(raw: string | undefined): string | undefined {
  return raw && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
    ? raw
    : undefined;
}

/**
 * PLATFORM SEKMESİNİN DÜŞÜRDÜKLERİ.
 *
 * Hesap TEK bir mecraya ait: Meta hesabının içindeyken "Google"a basmak,
 * hesap süzgeci kalırsa boş ekran demekti. Mecra değişince hesap ve onun
 * altındaki odak düşüyor ve seviye varsayılana bırakılıyor — hesabın
 * içindeki "kampanya" seviyesi, yeni mecrada hesapların listesine dönüyor.
 *
 * Hesap seçili değilken kampanya odağı ESKİSİ GİBİ korunuyor (önceki
 * davranış; o kararı bu iş değiştirmiyor).
 */
export function platformSekmesiSorgusu(
  hedef: string | null,
  simdiki: { platform: string | null; hesap: string | undefined; seviye: PanelSeviyesi },
): Record<string, string | undefined> {
  const hesapDusuyor = simdiki.hesap !== undefined && hedef !== simdiki.platform;
  const seviyeSerbest = hesapDusuyor || simdiki.seviye === 'mecra' || simdiki.seviye === 'hesap';
  return {
    platform: hedef ?? undefined,
    ...(hesapDusuyor ? { hesap: undefined, kampanya: undefined, reklamSeti: undefined } : {}),
    seviye: seviyeSerbest ? undefined : simdiki.seviye,
  };
}
