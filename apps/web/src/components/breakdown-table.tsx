import Link from 'next/link';
import type { MetricsBreakdownRow, MetricLevel } from '@advetics/shared';
import {
  formatDecimal,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRoas,
} from '@/lib/format';

const LEVEL_TABS: Array<{ key: MetricLevel; label: string }> = [
  { key: 'campaign', label: 'Kampanya' },
  { key: 'ad_group', label: 'Reklam seti' },
  { key: 'ad', label: 'Reklam' },
];

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  paused: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  deleted: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  pending_review: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  ended: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  unknown: 'bg-slate-100 text-slate-600 ring-slate-500/20',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktif',
  paused: 'Duraklatıldı',
  deleted: 'Silindi',
  pending_review: 'İncelemede',
  ended: 'Bitti',
  unknown: 'Bilinmiyor',
};

/**
 * Kırılım tablosu.
 *
 * Seviye sekmeleri LİNK, buton değil: seçim URL'de duruyor, sunucuda render
 * ediliyor ve paylaşılabiliyor. İstemci state'i kullanmak üçünü kaybettirirdi.
 *
 * `parentName` gösterilmesi zorunlu: reklam adları ad set'ler arasında tekrar
 * ediyor (aynı creative birden fazla sette kullanılıyor) ve üst varlık olmadan
 * tabloda hangi satırın hangisi olduğu ayırt edilemiyor. Canlı veride üç ayrı
 * satır "Reklam B-1 · Kreatif 1" olarak görünüyordu.
 */
export function BreakdownTable({
  rows,
  level,
  rangeKey,
  currency,
}: {
  rows: MetricsBreakdownRow[];
  level: MetricLevel;
  rangeKey: string;
  currency: string | null;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">Performans dağılımı</h3>
        <nav className="flex gap-1 rounded-lg bg-surface-sunken p-0.5" aria-label="Kırılım seviyesi">
          {LEVEL_TABS.map((tab) => (
            <Link
              key={tab.key}
              href={`/dashboard?aralik=${rangeKey}&seviye=${tab.key}`}
              aria-current={level === tab.key ? 'page' : undefined}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                level === tab.key
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>

      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-ink-muted">
          Bu aralıkta bu seviyede veri yok.
        </p>
      ) : (
        // Yatay kaydırma KENDİ kabında: sayfanın gövdesi yatay kaymamalı.
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-muted">
                <th className="px-4 py-2 font-semibold">Ad</th>
                <th className="px-3 py-2 text-right font-semibold">Harcama</th>
                <th className="px-3 py-2 text-right font-semibold">Gösterim</th>
                <th className="px-3 py-2 text-right font-semibold">Tık</th>
                <th className="px-3 py-2 text-right font-semibold">CTR</th>
                <th className="px-3 py-2 text-right font-semibold">Dönüşüm</th>
                <th className="px-3 py-2 text-right font-semibold">CPA</th>
                <th className="px-4 py-2 text-right font-semibold">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.entityId}-${r.currency}`} className="border-b border-line/60 last:border-0">
                  <td className="max-w-[260px] px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-ink" title={r.name}>
                        {r.name}
                      </span>
                      <StatusPill status={r.status} />
                    </div>
                    {r.parentName && (
                      <p className="truncate text-xs text-ink-muted" title={r.parentName}>
                        {r.parentName}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums text-ink">
                    {/* Satır kendi para birimini taşıyor: karışık para
                        biriminde tek bir sembol göstermek yanlış olurdu. */}
                    {formatMoney(r.spendMicros, currency ?? r.currency)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                    {formatNumber(r.impressions)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                    {formatNumber(r.clicks)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                    {formatPercent(r.ctr)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                    {formatDecimal(r.conversions, 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                    {formatMoney(
                      r.cpa === null ? null : String(Math.round(r.cpa * 1_000_000)),
                      currency ?? r.currency,
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                    {formatRoas(r.roas)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
        STATUS_STYLE[status] ?? STATUS_STYLE.unknown
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
