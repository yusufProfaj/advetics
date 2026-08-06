import type { ReportData } from '@advetics/shared';
import { CONVERSION_BUCKETS } from '@advetics/shared';
import { formatDayShort, formatNumber } from '@/lib/format';

/**
 * Günlük Form / Mesaj grafiği — referans belgenin 3. sayfasındaki grafik.
 *
 * Satır içi SVG, kütüphane yok: rapor yazdırılacak ve baskıda canvas tabanlı
 * grafikler bulanıklaşıyor. SVG vektör kaldığı için PDF'te keskin çıkıyor.
 *
 * İki seri GRUPLU BAR olarak çiziliyor, üst üste yığılmış değil. Yığmak
 * "toplam dönüşüm" izlenimi verirdi; oysa form ve mesaj ayrı işler ve
 * müşterinin sorusu "hangisi artıyor".
 */
export function ConversionChart({
  points,
  from,
  to,
}: {
  points: ReportData['daily'];
  from: string;
  to: string;
}) {
  const W = 900;
  const H = 220;
  const PAD = { top: 16, right: 8, bottom: 28, left: 34 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const dayMs = 86_400_000;
  const start = Date.parse(`${from}T00:00:00Z`);
  const totalDays = Math.max(
    1,
    Math.round((Date.parse(`${to}T00:00:00Z`) - start) / dayMs) + 1,
  );

  const max = Math.max(
    1,
    ...points.map((p) => Math.max(p.conversionCounts.form, p.conversionCounts.message)),
  );

  const slot = plotW / totalDays;
  // İki bar yan yana: slot'un %70'ini paylaşıyorlar.
  const barW = Math.max(1.2, (slot * 0.7) / 2);

  const xOf = (date: string): number => {
    const idx = Math.round((Date.parse(`${date}T00:00:00Z`) - start) / dayMs);
    return PAD.left + idx * slot + slot / 2;
  };
  const hOf = (v: number): number => (v / max) * plotH;

  // Y ekseni: 4 çizgi yeterli, fazlası veriyi gölgeliyor.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((r) => Math.round(max * r));
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));

  return (
    <figure className="rpt-card">
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-700">
          Günlük dönüşüm seyri
        </h3>
        <div className="flex items-center gap-4 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: 'var(--rpt-brand)' }}
            />
            {CONVERSION_BUCKETS.form.label}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: 'var(--rpt-accent)' }}
            />
            {CONVERSION_BUCKETS.message.label}
          </span>
        </div>
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[200px] w-full"
        role="img"
        aria-label={`${from} ile ${to} arası günlük form ve mesaj dönüşüm sayıları`}
      >
        {ticks.map((t, i) => {
          const y = PAD.top + plotH - (i / (ticks.length - 1)) * plotH;
          return (
            <g key={t + '-' + i}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y}
                y2={y}
                stroke="#E2E8F0"
                strokeWidth="1"
                strokeDasharray={i === 0 ? undefined : '3 3'}
              />
              <text x={PAD.left - 6} y={y + 3.5} textAnchor="end" fontSize="10" fill="#94A3B8">
                {t}
              </text>
            </g>
          );
        })}

        {points.map((p) => {
          const x = xOf(p.date);
          const f = p.conversionCounts.form;
          const m = p.conversionCounts.message;
          return (
            <g key={p.date}>
              {f > 0 && (
                <rect
                  x={x - barW - 0.6}
                  y={PAD.top + plotH - hOf(f)}
                  width={barW}
                  height={hOf(f)}
                  fill="var(--rpt-brand)"
                >
                  <title>{`${formatDayShort(p.date)} · Form: ${formatNumber(f)}`}</title>
                </rect>
              )}
              {m > 0 && (
                <rect
                  x={x + 0.6}
                  y={PAD.top + plotH - hOf(m)}
                  width={barW}
                  height={hOf(m)}
                  fill="var(--rpt-accent)"
                >
                  <title>{`${formatDayShort(p.date)} · Mesaj: ${formatNumber(m)}`}</title>
                </rect>
              )}
            </g>
          );
        })}

        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text
              key={`t-${p.date}`}
              x={xOf(p.date)}
              y={H - 9}
              textAnchor="middle"
              fontSize="10"
              fill="#94A3B8"
            >
              {formatDayShort(p.date)}
            </text>
          ) : null,
        )}
      </svg>
    </figure>
  );
}
