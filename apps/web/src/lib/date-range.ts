/**
 * Tarih aralığı çözümlemesi — URL'den okunur, sunucuda hesaplanır.
 *
 * Aralık URL parametresinde tutuluyor (`?aralik=30g`): panel paylaşılabilir,
 * yenilendiğinde seçim kaybolmuyor ve sunucu tarafında render edilebiliyor.
 * İstemci state'inde tutmak üçünü de kaybettirirdi.
 *
 * TARİHLER STRING ve UTC. Kullanıcının tarayıcı saat dilimine göre hesaplamak
 * cazip ama yanlış: "dün" reklam HESABININ zaman diliminde tanımlı ve metrikler
 * o dilime göre yazılıyor (bkz. insights_daily). İkisini karıştırmak panelde
 * bir günlük kayma üretir.
 */

export const RANGE_PRESETS = [
  { key: 'dun', label: 'Dün', days: 1, offset: 1 },
  { key: '7g', label: 'Son 7 gün', days: 7, offset: 1 },
  { key: '30g', label: 'Son 30 gün', days: 30, offset: 1 },
  { key: '90g', label: 'Son 90 gün', days: 90, offset: 1 },
] as const;

export type RangeKey = (typeof RANGE_PRESETS)[number]['key'];

export const DEFAULT_RANGE: RangeKey = '30g';

function isoShift(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface ResolvedRange {
  key: RangeKey;
  label: string;
  from: string;
  to: string;
  days: number;
}

/**
 * `?aralik=` değerini aralığa çevirir.
 *
 * Bilinmeyen değer sessizce varsayılana düşüyor: URL'i elle düzenleyen birine
 * hata sayfası göstermek yerine çalışan bir panel vermek daha iyi.
 */
export function resolveRange(raw: string | undefined): ResolvedRange {
  const preset =
    RANGE_PRESETS.find((p) => p.key === raw) ??
    RANGE_PRESETS.find((p) => p.key === DEFAULT_RANGE)!;

  // `offset: 1` — bugün DAHİL DEĞİL.
  //
  // Bugünün verisi gün içinde sürekli değişiyor (L2 her 30 dakikada bir
  // güncelliyor) ve tamamlanmamış bir günü ortalamaya katmak tüm oranları
  // aşağı çekiyor: "CPA düştü" diye sevinilen şey aslında günün henüz
  // bitmemiş olması. Bugünü ayrıca göstermek daha dürüst.
  const to = isoShift(-preset.offset);
  const from = isoShift(-(preset.offset + preset.days - 1));

  return { key: preset.key, label: preset.label, from, to, days: preset.days };
}

/** Bugünün tarihi — "bugün" kartı için ayrı sorgulanıyor. */
export function today(): string {
  return isoShift(0);
}
