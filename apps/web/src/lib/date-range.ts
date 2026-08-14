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

/**
 * `offset: 1` = bugün HARİÇ. Aşağıdaki `resolveRange` yorumunda gerekçesi var.
 *
 * "Bugün" TEK BAŞINA bir istisna ve bilinçli: itiraz tamamlanmamış bir günü
 * ÇOK GÜNLÜK ORTALAMAYA katmaya karşıydı — 30 günlük ortalamaya yarım gün
 * eklemek "CPA düştü" yanılsaması üretiyor. Yalnızca bugüne bakmakta böyle bir
 * karışım yok; kullanıcı hangi güne baktığını biliyor. Yine de günün
 * tamamlanmadığı ekranda YAZILIYOR (`incomplete`), çünkü sabah 09:00'da
 * görülen düşük harcamayı "kampanya durmuş" diye okumak kolay.
 */
export const RANGE_PRESETS = [
  { key: 'bugun', label: 'Bugün', days: 1, offset: 0 },
  { key: 'dun', label: 'Dün', days: 1, offset: 1 },
  { key: '7g', label: 'Son 7 gün', days: 7, offset: 1 },
  { key: '30g', label: 'Son 30 gün', days: 30, offset: 1 },
  { key: '60g', label: 'Son 60 gün', days: 60, offset: 1 },
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
  /**
   * Aralık BUGÜNÜ içeriyor mu — yani veri hâlâ değişecek mi.
   *
   * Arayüz bunu yazmak zorunda. Gün ortasında görülen düşük harcama "kampanya
   * durmuş" diye okunuyor; oysa gün bitmemiş. Bu, hiçbir hata üretmeyen ama
   * yanlış karar aldıran bir gösterim.
   */
  incomplete: boolean;
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

  return {
    key: preset.key,
    label: preset.label,
    from,
    to,
    days: preset.days,
    incomplete: preset.offset === 0,
  };
}

/** Bugünün tarihi — "bugün" kartı için ayrı sorgulanıyor. */
export function today(): string {
  return isoShift(0);
}
