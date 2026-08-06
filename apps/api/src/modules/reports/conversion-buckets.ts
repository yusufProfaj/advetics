import { CONVERSION_BUCKETS, type ConversionBucket, type ConversionCounts } from '@advetics/shared';

/**
 * Adlandırılmış dönüşüm kovalarını `raw_metrics` içinden çıkarır.
 *
 * NEDEN SORGU ANINDA: hangi Meta aksiyon türünün hangi kovaya girdiği bir
 * KARAR, gerçek değil — ve zamanla değişiyor (Meta yeni aksiyon türleri
 * ekliyor, ajans "mesaj"ın tanımını değiştiriyor). Kova sayıları kolon olarak
 * saklanırsa her tanım değişikliğinde 90 günlük veriyi platformdan yeniden
 * çekmek gerekir. Ham aksiyon dizisi durduğu için yeniden hesaplamak bedava.
 *
 * Bu, Modül 3'te `raw_metrics`i saklama kararının somut karşılığı.
 *
 * ŞEKİL (Meta insights `actions` alanı):
 *   [{ action_type: 'lead', value: '12' },
 *    { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '3' }]
 *
 * `value` STRING geliyor ve ondalık olabiliyor (Meta kesirli atıf uyguluyor:
 * bir dönüşüm iki reklama 0.5/0.5 dağıtılabiliyor).
 */

/** Aksiyon türü → kova. Ters indeks, her satırda liste taramamak için. */
const TYPE_TO_BUCKET = new Map<string, ConversionBucket>();
for (const [bucket, def] of Object.entries(CONVERSION_BUCKETS)) {
  for (const type of def.actionTypes) {
    TYPE_TO_BUCKET.set(type, bucket as ConversionBucket);
  }
}

export function emptyCounts(): ConversionCounts {
  return { form: 0, message: 0, purchase: 0 };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Tek bir `raw_metrics` gövdesinden kova sayılarını çıkarır.
 *
 * Beklenmeyen şekilde SIFIR döndürüyor, fırlatmıyor: bir bozuk satır tüm
 * raporun üretilmesini engellememeli. Rapor müşteriye gidiyor ve "rapor
 * oluşturulamadı" demek, bir sütunun eksik olmasından çok daha kötü.
 */
export function bucketsFromRaw(raw: unknown): ConversionCounts {
  const counts = emptyCounts();
  if (!isRecord(raw)) return counts;

  const actions = raw.actions;
  if (!Array.isArray(actions)) return counts;

  for (const item of actions) {
    if (!isRecord(item)) continue;
    const type = typeof item.action_type === 'string' ? item.action_type : null;
    if (!type) continue;

    const bucket = TYPE_TO_BUCKET.get(type);
    if (!bucket) continue;

    const value = Number(item.value ?? 0);
    if (Number.isFinite(value)) counts[bucket] += value;
  }

  return counts;
}

/** Birden fazla gövdenin kovalarını toplar (gün gün gelen satırlar için). */
export function sumBuckets(list: Iterable<ConversionCounts>): ConversionCounts {
  const total = emptyCounts();
  for (const c of list) {
    total.form += c.form;
    total.message += c.message;
    total.purchase += c.purchase;
  }
  return total;
}

/**
 * Kesirli atıfı yuvarlar — GÖSTERİM için.
 *
 * Meta bir dönüşümü iki reklama 0.5/0.5 dağıtabiliyor ve toplamda 12.0000001
 * gibi değerler çıkıyor. Müşteriye "12,0000001 form" göstermek anlamsız;
 * toplama bittikten sonra bir kez yuvarlıyoruz. Ara toplamlarda yuvarlamak
 * hata biriktirirdi.
 */
export function roundCounts(counts: ConversionCounts): ConversionCounts {
  return {
    form: Math.round(counts.form),
    message: Math.round(counts.message),
    purchase: Math.round(counts.purchase),
  };
}
