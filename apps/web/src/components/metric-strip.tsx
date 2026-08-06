import { formatPercent } from '@/lib/format';

/**
 * İkincil metrikler için tek satır şerit.
 *
 * Neden kart değil: Gösterim/Tık/CTR/CPC karar verdirmiyor, bağlam veriyor.
 * Dört ayrı karta yaymak birincil dörtlüyle (Harcama/Dönüşüm/CPA/ROAS ya da
 * Erişim) aynı görsel ağırlığı almalarına yol açıyor ve göz nereye bakacağını
 * bilemiyor. Şerit hiyerarşiyi geri veriyor.
 */
export function MetricStrip({
  items,
}: {
  items: Array<{ label: string; value: string; change?: number | null; inverse?: boolean }>;
}) {
  return (
    <div className="flex flex-wrap divide-y divide-line rounded-xl border border-line bg-surface sm:divide-x sm:divide-y-0">
      {items.map((item) => {
        const good =
          item.change === null || item.change === undefined
            ? null
            : item.inverse
              ? item.change < 0
              : item.change > 0;
        return (
          <div key={item.label} className="min-w-0 flex-1 basis-1/2 px-4 py-2.5 sm:basis-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              {item.label}
            </p>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className="text-base font-semibold tabular-nums text-ink">{item.value}</span>
              {item.change !== null && item.change !== undefined && (
                <span
                  className={`text-[11px] font-medium tabular-nums ${
                    good ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {item.change > 0 ? '↑' : '↓'}
                  {formatPercent(Math.abs(item.change), 1)}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
