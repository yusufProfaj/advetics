import type { MetricsTimeseriesPoint } from '@advetics/shared';
import { formatDayLong, formatDayShort, formatMoney, formatNumber } from '@/lib/format';

/**
 * Günlük harcama ve dönüşüm grafiği — SATIR İÇİ SVG.
 *
 * Grafik kütüphanesi KULLANILMIYOR. Gerekçeler:
 *   · Recharts/Chart.js paket boyutuna 100 KB+ ekliyor ve bu panelin ilk
 *     ekranı zaten üç ağ isteği bekliyor.
 *   · Sunucuda render edilebiliyor: JS yüklenmeden grafik görünüyor.
 *   · Tooltip için `<title>` yeterli — tarayıcının kendi ipucu, sıfır JS.
 *
 * Sunucu bileşeni: hiçbir etkileşim state'i yok.
 *
 * VERİ OLMAYAN GÜN ATLANIYOR, sıfırla doldurulmuyor. API harcama olmayan
 * günleri döndürmüyor (platform da döndürmüyor) ve sıfır uydurmak "o gün
 * reklam durdu" demekle aynı. Barlar tarihe göre konumlanıyor, sıraya göre
 * değil — boşluk boşluk olarak görünüyor.
 */
export function MetricsChart({
  points,
  from,
  to,
  currency,
}: {
  points: MetricsTimeseriesPoint[];
  from: string;
  to: string;
  currency: string | null;
}) {
  if (points.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl border border-line bg-surface">
        <p className="text-sm text-ink-muted">Bu aralıkta veri yok.</p>
      </div>
    );
  }

  const W = 1000;
  const H = 220;
  const PAD = { top: 16, right: 8, bottom: 26, left: 8 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const dayMs = 86_400_000;
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  const totalDays = Math.max(1, Math.round((end - start) / dayMs) + 1);

  // Bar genişliği gün sayısına göre: 90 günde ince çizgiler, 7 günde kalın
  // barlar. Sabit genişlik uzun aralıklarda üst üste binerdi.
  const slot = plotW / totalDays;
  const barW = Math.max(1.5, Math.min(28, slot * 0.62));

  const spends = points.map((p) => Number(BigInt(p.spendMicros) / 1000n) / 1000);
  const maxSpend = Math.max(...spends, 1);
  const maxConv = Math.max(...points.map((p) => p.conversions), 1);

  const xOf = (date: string): number => {
    const idx = Math.round((Date.parse(`${date}T00:00:00Z`) - start) / dayMs);
    return PAD.left + idx * slot + slot / 2;
  };
  const yOfSpend = (spend: number): number => PAD.top + plotH - (spend / maxSpend) * plotH;
  const yOfConv = (conv: number): number => PAD.top + plotH - (conv / maxConv) * plotH;

  // Dönüşüm çizgisi: yalnızca dönüşümü olan günleri birleştiriyor. Sıfır
  // günlerden geçirmek çizgiyi tabana çekip yanlış bir düşüş anlatırdı.
  const convPoints = points.filter((p) => p.conversions > 0);
  const linePath = convPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(p.date).toFixed(1)} ${yOfConv(p.conversions).toFixed(1)}`)
    .join(' ');

  // Eksen etiketleri: en fazla 6 tarih. Daha fazlası üst üste biniyor.
  const labelEvery = Math.max(1, Math.ceil(points.length / 6));

  return (
    <figure className="rounded-xl border border-line bg-surface p-4">
      <figcaption className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">Günlük harcama ve dönüşüm</h3>
        <div className="flex items-center gap-3 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-brand" />
            Harcama
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width="14" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="14" y2="4" stroke="var(--brand-accent)" strokeWidth="2" />
            </svg>
            Dönüşüm
          </span>
        </div>
      </figcaption>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-56 w-full"
        role="img"
        aria-label={`${formatDayLong(from)} — ${formatDayLong(to)} arası günlük harcama ve dönüşüm grafiği`}
      >
        {/* Yatay kılavuz: dörde bölünmüş. Daha fazlası veriyi gölgeliyor. */}
        {[0, 0.25, 0.5, 0.75, 1].map((r) => (
          <line
            key={r}
            x1={PAD.left}
            x2={W - PAD.right}
            y1={PAD.top + plotH * r}
            y2={PAD.top + plotH * r}
            stroke="var(--line)"
            strokeWidth="1"
            strokeDasharray={r === 1 ? undefined : '3 3'}
          />
        ))}

        {points.map((p, i) => {
          const spend = spends[i]!;
          const x = xOf(p.date);
          const y = yOfSpend(spend);
          return (
            <g key={p.date}>
              <rect
                x={x - barW / 2}
                y={y}
                width={barW}
                height={Math.max(1, PAD.top + plotH - y)}
                rx={Math.min(3, barW / 2)}
                fill="var(--brand-primary)"
                opacity="0.85"
              >
                {/* Tarayıcının kendi ipucu — JS gerektirmiyor. */}
                <title>
                  {`${formatDayLong(p.date)}\n` +
                    `Harcama: ${formatMoney(p.spendMicros, currency)}\n` +
                    `Gösterim: ${formatNumber(p.impressions)}\n` +
                    `Tık: ${formatNumber(p.clicks)}\n` +
                    `Dönüşüm: ${formatNumber(p.conversions)}`}
                </title>
              </rect>
            </g>
          );
        })}

        {convPoints.length > 1 && (
          <path d={linePath} fill="none" stroke="var(--brand-accent)" strokeWidth="2" />
        )}
        {convPoints.map((p) => (
          <circle
            key={`c-${p.date}`}
            cx={xOf(p.date)}
            cy={yOfConv(p.conversions)}
            r="3"
            fill="var(--brand-accent)"
          >
            <title>{`${formatDayLong(p.date)}\nDönüşüm: ${formatNumber(p.conversions)}`}</title>
          </circle>
        ))}

        {points.map((p, i) =>
          i % labelEvery === 0 ? (
            <text
              key={`t-${p.date}`}
              x={xOf(p.date)}
              y={H - 8}
              textAnchor="middle"
              fontSize="11"
              fill="var(--ink-muted)"
            >
              {formatDayShort(p.date)}
            </text>
          ) : null,
        )}
      </svg>
    </figure>
  );
}
