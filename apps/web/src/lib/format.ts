/**
 * Biçimlendirme yardımcıları.
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

/**
 * Yüzde değişim.
 *
 * `null` döner: önceki dönem yoksa ya da SIFIRSA. Sıfırdan artışı "%∞" ya da
 * "%100" göstermek ikisi de yanlış — karşılaştırma tanımsız.
 */
export function changePercent(
  current: number,
  previous: number | null | undefined,
): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Micros string'leri için yüzde değişim — Number'a inmeden oran alıyor. */
export function changePercentMicros(
  current: string,
  previous: string | null | undefined,
): number | null {
  if (previous === null || previous === undefined) return null;
  try {
    const prev = BigInt(previous);
    if (prev === 0n) return null;
    const cur = BigInt(current);
    // Oran için Number'a inmek güvenli: bölme sonucu küçük bir ondalık.
    return (Number(cur - prev) / Number(prev)) * 100;
  } catch {
    return null;
  }
}

/** "2026-08-05" → "5 Ağu" */
export function formatDayShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(TR, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** "2026-08-05" → "5 Ağustos 2026" */
export function formatDayLong(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString(TR, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * "3 dk önce" / "2 sa önce".
 *
 * Mutlak zaman yerine göreli: kullanıcının sorusu "veri ne kadar taze" ve
 * cevabı bir saat damgasından çıkarmak zihinsel iş yükü.
 */
export function formatRelative(iso: string | null): string {
  if (!iso) return 'hiç';
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'az önce';
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.floor(hours / 24);
  return `${days} gün önce`;
}

/** Veri bayat mı — mimari dokümandaki eşik 2 saat. */
export function isStale(iso: string | null): boolean {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() > 2 * 60 * 60 * 1000;
}
