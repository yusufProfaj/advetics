import {
  CALL_TO_ACTIONS,
  TEXT_LIMITS,
  type BulkIssue,
  type BulkItemInput,
} from '@advetics/shared';

/**
 * Toplu oluşturma doğrulaması — SAF fonksiyonlar, platform çağrısı yok.
 *
 * BU MODÜLÜN ASIL DEĞERİ BURASI. 60 reklamlık bir partiyi Meta'ya göndermek
 * kolay; sorun 41. satırda başlık 3 karakter uzun olduğunda çıkıyor. O noktada
 * 40 reklam oluşmuş, 20 oluşmamış ve kullanıcı hangisinin hangisi olduğunu
 * bilmiyor.
 *
 * Platformun reddedeceği her şeyi ÖNCE BİZ reddediyoruz; ayrıca platformun
 * kabul edip kötü sonuç vereceği şeyleri UYARIYORUZ.
 */

/**
 * Bir satırı doğrular.
 *
 * `error` yayını engelliyor, `warning` engellemiyor. Kırpılacak bir başlık
 * kötü ama kullanıcının bilinçli tercihi olabilir; onu engellemek aracı
 * kullanılamaz kılardı.
 */
export function validateItem(item: BulkItemInput): BulkIssue[] {
  const issues: BulkIssue[] = [];

  if (!item.name.trim()) {
    issues.push({ field: 'name', severity: 'error', message: 'Reklam adı boş olamaz.' });
  }

  // METİN ALANLARININ EN AZ BİRİ DOLU OLMALI.
  //
  // Meta metinsiz bir reklamı kabul ediyor (yalnızca görsel) ama pratikte
  // böyle bir reklam yapıştırma hatasının işareti: kullanıcı sütunları
  // kaydırmış olabilir. Uyarı, hata değil.
  if (!item.primaryText && !item.headline && !item.description) {
    issues.push({
      field: 'primaryText',
      severity: 'warning',
      message: 'Hiçbir metin alanı dolu değil — sütunlar kaymış olabilir.',
    });
  }

  pushLength(issues, 'primaryText', item.primaryText, TEXT_LIMITS.primaryText, 'Birincil metin');
  pushLength(issues, 'headline', item.headline, TEXT_LIMITS.headline, 'Başlık');
  pushLength(issues, 'description', item.description, TEXT_LIMITS.description, 'Açıklama');

  // KIRPILMA UYARILARI.
  //
  // Meta bu uzunlukları KABUL EDİYOR ama akışta kesiyor. Reddedilmediği için
  // kullanıcı sorunu ancak reklam yayına girdikten sonra görüyor — o da
  // bakarsa.
  pushTruncate(
    issues,
    'primaryText',
    item.primaryText,
    TEXT_LIMITS.primaryTextTruncateAt,
    'Birincil metin',
  );
  pushTruncate(issues, 'headline', item.headline, TEXT_LIMITS.headlineTruncateAt, 'Başlık');
  pushTruncate(
    issues,
    'description',
    item.description,
    TEXT_LIMITS.descriptionTruncateAt,
    'Açıklama',
  );

  if (item.linkUrl) {
    const url = validateUrl(item.linkUrl);
    if (url) issues.push(url);
  }

  if (item.callToAction) {
    const cta = item.callToAction.trim().toUpperCase();
    if (!(CALL_TO_ACTIONS as readonly string[]).includes(cta)) {
      // Meta bilinmeyen bir CTA'yı reddediyor ve hata mesajı yalnızca
      // "Invalid parameter" diyor — hangi alanın sorunlu olduğunu söylemiyor.
      issues.push({
        field: 'callToAction',
        severity: 'error',
        message: `Bilinmeyen eylem düğmesi: ${item.callToAction}. Geçerli değerler: ${CALL_TO_ACTIONS.slice(0, 4).join(', ')}…`,
      });
    }
  }

  // BAĞLANTI GEREKTİREN CTA'LAR.
  //
  // "Şimdi satın al" düğmesi hedef URL olmadan anlamsız ve Meta bunu bazen
  // kabul edip düğmeyi hiç göstermiyor — sessiz kayıp.
  const needsLink = ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'DOWNLOAD', 'APPLY_NOW', 'GET_QUOTE'];
  if (item.callToAction && needsLink.includes(item.callToAction.trim().toUpperCase()) && !item.linkUrl) {
    issues.push({
      field: 'linkUrl',
      severity: 'error',
      message: `"${item.callToAction}" düğmesi hedef URL gerektiriyor.`,
    });
  }

  /**
   * GÖRSEL KAYNAĞI: ARŞİV ADI YA DA HAM HASH — İKİSİNDEN BİRİ.
   *
   * İkisini birden kabul etmek hangisinin kazandığını belirsiz bırakırdı ve
   * yanlış görselle yayınlanan bir reklam sessizce yanlış olur: kimse hata
   * görmez, yalnızca reklam beklenenden farklıdır.
   */
  const hasMedia = Boolean(item.mediaRef);
  const hasAsset = Boolean(item.assetName);

  if (!hasMedia && !hasAsset) {
    issues.push({
      field: 'mediaRef',
      severity: 'error',
      message: 'Arşiv görseli adı ya da ham görsel referansı zorunlu.',
    });
  } else if (hasMedia && hasAsset) {
    issues.push({
      field: 'assetName',
      severity: 'error',
      message:
        'Hem arşiv adı hem ham referans girilmiş. Hangisinin kullanılacağı belirsiz — birini boş bırak.',
    });
  }

  return issues;
}

function pushLength(
  issues: BulkIssue[],
  field: string,
  value: string | null | undefined,
  limit: number,
  label: string,
): void {
  if (!value) return;
  if (value.length > limit) {
    issues.push({
      field,
      severity: 'error',
      message: `${label} ${value.length} karakter — sınır ${limit}. ${value.length - limit} karakter fazla.`,
    });
  }
}

function pushTruncate(
  issues: BulkIssue[],
  field: string,
  value: string | null | undefined,
  limit: number,
  label: string,
): void {
  if (!value || value.length <= limit) return;
  issues.push({
    field,
    severity: 'warning',
    message: `${label} ${value.length} karakter — akışta ${limit} karakterden sonrası kırpılacak.`,
  });
}

/**
 * URL doğrulaması.
 *
 * `new URL()` YETMİYOR: `javascript:alert(1)` geçerli bir URL ve
 * `mailto:x@y.z` de öyle. Reklamın hedef bağlantısı yalnızca http(s)
 * olabilir; diğerlerini Meta zaten reddediyor ama hata mesajı yardımcı
 * olmuyor.
 */
function validateUrl(raw: string): BulkIssue | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      field: 'linkUrl',
      severity: 'error',
      message: `Geçersiz URL: ${raw.slice(0, 80)}. Başında http:// ya da https:// olmalı.`,
    };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      field: 'linkUrl',
      severity: 'error',
      message: `Desteklenmeyen protokol: ${url.protocol}. Yalnızca http ve https kullanılabilir.`,
    };
  }

  if (url.protocol === 'http:') {
    // Meta http bağlantıları kabul ediyor ama tarayıcılar uyarı gösteriyor
    // ve dönüşüm oranı düşüyor. Engellemiyoruz, söylüyoruz.
    return {
      field: 'linkUrl',
      severity: 'warning',
      message: 'Bağlantı https değil — tarayıcılar güvenlik uyarısı gösterebilir.',
    };
  }

  return null;
}

/**
 * Parti geneli doğrulama — satır bazında YAKALANAMAYAN sorunlar.
 *
 * Ayrı bir fonksiyon çünkü bunlar satırlar ARASINDAKİ ilişkilere bakıyor ve
 * tek bir satıra atfedilemiyorlar.
 */
export function validateBatch(items: BulkItemInput[]): Map<number, BulkIssue[]> {
  const extra = new Map<number, BulkIssue[]>();

  // MÜKERRER REKLAM ADI.
  //
  // Meta aynı adda iki reklamı kabul ediyor ve sonra Ads Manager'da
  // hangisinin hangisi olduğu anlaşılmıyor. Yapıştırma hatasının en yaygın
  // işareti de bu: aynı satır iki kez kopyalanmış.
  const byName = new Map<string, number[]>();
  for (const item of items) {
    const key = item.name.trim().toLowerCase();
    const list = byName.get(key) ?? [];
    list.push(item.rowNumber);
    byName.set(key, list);
  }

  for (const [, rows] of byName) {
    if (rows.length < 2) continue;
    for (const row of rows) {
      const list = extra.get(row) ?? [];
      list.push({
        field: 'name',
        severity: 'warning',
        message: `Aynı reklam adı ${rows.length} satırda kullanılmış (${rows.join(', ')}. satırlar).`,
      });
      extra.set(row, list);
    }
  }

  return extra;
}

/** Satır yayınlanabilir mi — yalnızca `error` engelliyor. */
export function isPublishable(issues: BulkIssue[]): boolean {
  return !issues.some((i) => i.severity === 'error');
}
