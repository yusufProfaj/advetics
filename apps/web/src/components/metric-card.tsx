import { formatPercent } from '@/lib/format';

/**
 * KPI kartı.
 *
 * `change` null ise değişim satırı hiç GÖSTERİLMİYOR — "%0" göstermek "değişim
 * yok" demek, oysa karşılaştırma yapılamadığını (önceki dönem boş ya da sıfır)
 * anlatmak gerekiyor. Boş bırakmak sessiz ama dürüst.
 *
 * `inverse`: bazı metriklerde ARTIŞ kötüdür. CPA yükseliyorsa kırmızı olmalı,
 * yeşil değil. Bunu çağıran tarafa bırakmak her kullanımda hata riski demek.
 */
export function MetricCard({
  label,
  value,
  hint,
  change,
  inverse = false,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint?: string;
  change?: number | null;
  inverse?: boolean;
  emphasis?: boolean;
}) {
  const good = change === null || change === undefined ? null : inverse ? change < 0 : change > 0;

  return (
    <div
      className={`rounded-xl border p-4 ${
        emphasis ? 'border-brand/30 bg-brand-soft/40' : 'border-line bg-surface'
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">{value}</p>

      <div className="mt-1 flex min-h-[18px] items-center gap-2 text-xs">
        {change !== null && change !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 font-medium tabular-nums ${
              good ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            <Arrow up={change > 0} />
            {formatPercent(Math.abs(change), 1)}
          </span>
        )}
        {hint && <span className="truncate text-ink-muted">{hint}</span>}
      </div>
    </div>
  );
}

function Arrow({ up }: { up: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="shrink-0">
      <path
        d={up ? 'M5 1.5 L9 7 L1 7 Z' : 'M5 8.5 L1 3 L9 3 Z'}
        fill="currentColor"
      />
    </svg>
  );
}
