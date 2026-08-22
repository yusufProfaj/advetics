/**
 * DEĞER BİÇİMLENDİRME — PANEL VE PDF AYNI ÇIKTIYI VERMEK ZORUNDA.
 *
 * Bu fonksiyonlar bir süre yalnızca `apps/web` içindeydi. Rapor PDF'i
 * sunucuda üretilince aynı sayıları ikinci kez biçimlendirmek gerekiyordu ve
 * ikinci bir uygulama, doğduğu anda ayrışırdı: panelde "₺34.026,44", PDF'te
 * "34026.44 TRY" — hiçbir hata vermeden, ve farkı müşteriye giden belgede
 * gören olurdu.
 *
 * İKİ KURAL:
 *
 *   1. `null` "—" olarak gösterilir, "0" olarak DEĞİL. API'de `null`
 *      "hesaplanamaz" demek: gösterim yoksa CTR, dönüşüm yoksa CPA, gelir
 *      takip edilmiyorsa ROAS. "%0" ya da "0.00×" göstermek müşteriye
 *      "kampanyan çalışmıyor" demek olur — oysa doğrusu "bu metrik burada
 *      geçerli değil".
 *
 *   2. Para micros STRING olarak geliyor ve `Number`a çevrilmeden
 *      biçimlendiriliyor. `Number(micros) / 1e6` 2^53'ün üstünde hassasiyet
 *      kaybediyor; büyük hesaplarda yıllık harcama bu sınıra yaklaşıyor.
 *
 * TÜRKÇE YERELİ NODE'DA DA ÇALIŞIYOR: `Intl.NumberFormat.supportedLocalesOf`
 * ile doğrulandı. Node ICU'suz derlenmiş olsaydı sunucudaki sayılar sessizce
 * İngilizce biçime düşer ve panelden farklı olurdu.
 */

const TR = 'tr-TR';

/** Para birimi kodu → sembol. Bilinmeyen kod olduğu gibi gösterilir. */
const SYMBOL: Record<string, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

/**
 * Micros string'i okunabilir paraya çevirir — BIGINT ARİTMETİĞİYLE.
 *
 * `Number` üzerinden geçmek büyük tutarlarda kuruş kaybettiriyor. Tam ve
 * kesirli kısmı BigInt ile ayırıp yalnızca gösterim için birleştiriyoruz.
 */
export function formatMoney(
  micros: string | null | undefined,
  currency: string | null,
  opts: { compact?: boolean; decimals?: number } = {},
): string {
  if (micros === null || micros === undefined) return '—';

  let value: bigint;
  try {
    value = BigInt(micros);
  } catch {
    return '—';
  }

  const negative = value < 0n;
  if (negative) value = -value;

  const whole = value / 1_000_000n;
  const frac = value % 1_000_000n;

  const symbol = currency ? (SYMBOL[currency] ?? currency) : '';
  const sign = negative ? '-' : '';

  if (opts.compact) {
    // Kısa gösterim yalnızca KART BAŞLIKLARI için: 7,6B gibi. Tabloda
    // kullanılmıyor — orada kuruş farkı önemli.
    const n = Number(whole);
    const compact =
      n >= 1_000_000
        ? `${(n / 1_000_000).toLocaleString(TR, { maximumFractionDigits: 1 })}M`
        : n >= 1_000
          ? `${(n / 1_000).toLocaleString(TR, { maximumFractionDigits: 1 })}B`
          : n.toLocaleString(TR);
    return `${sign}${compact}${symbol ? ` ${symbol}` : ''}`;
  }

  const decimals = opts.decimals ?? 2;
  const fracText = frac.toString().padStart(6, '0').slice(0, decimals);
  const wholeText = whole.toLocaleString(TR);
  const body = decimals > 0 ? `${wholeText},${fracText}` : wholeText;
  return `${sign}${body}${symbol ? ` ${symbol}` : ''}`;
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString(TR, { maximumFractionDigits: 0 });
}

export function formatDecimal(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return '—';
  return value.toLocaleString(TR, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return '—';
  return `%${value.toLocaleString(TR, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function formatRoas(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value.toLocaleString(TR, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
}
