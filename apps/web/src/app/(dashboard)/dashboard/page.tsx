import Link from 'next/link';
import type {
  MetricLevel,
  MetricsBreakdownRow,
  MetricsSummary,
  MetricsTimeseriesPoint,
} from '@advetics/shared';
import { METRIC_LEVELS } from '@advetics/shared';
import { requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { RANGE_PRESETS, resolveRange } from '@/lib/date-range';
import {
  changePercent,
  changePercentMicros,
  formatDayLong,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelative,
  formatRoas,
  isStale,
} from '@/lib/format';
import { MetricCard } from '@/components/metric-card';
import { MetricsChart } from '@/components/metrics-chart';
import { BreakdownTable } from '@/components/breakdown-table';

export const metadata = { title: 'Genel Bakış — Advetics' };

/**
 * Unified Dashboard.
 *
 * Üç uç nokta PARALEL çekiliyor. Sırayla beklemek toplam gecikmeyi üçe
 * katlardı; hiçbiri diğerinin sonucuna ihtiyaç duymuyor.
 *
 * Sunucu bileşeni: veri sunucuda çekiliyor, tarayıcıya JS inmeden ekran hazır
 * geliyor. Aralık ve seviye seçimi URL'de olduğu için etkileşim için de JS
 * gerekmiyor — seçiciler birer link.
 *
 * `force-dynamic`: metrikler her istekte tazeleniyor. Next.js'in varsayılan
 * önbelleği burada yanlış olurdu — kullanıcı "yenile"ye bastığında bayat sayı
 * görmesi, panelin güvenilirliğini bitirir.
 */
export const dynamic = 'force-dynamic';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const range = resolveRange(first(params.aralik));
  const level = resolveLevel(first(params.seviye));

  const base = new URLSearchParams({ from: range.from, to: range.to });
  const breakdownQs = new URLSearchParams(base);
  breakdownQs.set('level', level);
  breakdownQs.set('limit', '25');

  // Bir uç noktanın düşmesi TÜM ekranı düşürmemeli: panel açılıp "veri
  // alınamadı" demeli, 500 sayfası göstermemeli.
  const [summary, series, breakdown] = await Promise.all([
    serverApiFetch<MetricsSummary>(`/metrics/summary?${base}`).catch(() => null),
    serverApiFetch<MetricsTimeseriesPoint[]>(`/metrics/timeseries?${base}`).catch(() => null),
    serverApiFetch<MetricsBreakdownRow[]>(`/metrics/breakdown?${breakdownQs}`).catch(() => null),
  ]);

  const activeClient = session.availableClients.find((c) => c.id === session.activeClientId);
  const scopeLabel = activeClient?.name ?? 'Tüm müşteriler';

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Genel Bakış</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            {scopeLabel} · {formatDayLong(range.from)} — {formatDayLong(range.to)}
          </p>
        </div>
        <RangeTabs current={range.key} level={level} />
      </header>

      {summary === null ? (
        <Notice tone="error">
          Metrikler alınamadı. API çalışıyor mu? Sorun sürerse{' '}
          <code className="rounded bg-surface-sunken px-1">pm2 logs advetics-api</code> çıktısına
          bakın.
        </Notice>
      ) : summary.accountCount === 0 ? (
        <EmptyState />
      ) : (
        <>
          {summary.currency === null && summary.byCurrency.length > 1 && (
            <Notice tone="warn">
              <strong>Birden fazla para birimi var</strong> (
              {summary.byCurrency.map((c) => c.currency).join(', ')}). Kur çevrimi henüz yok, bu
              yüzden toplamlar birleştirilmiyor — tutarlar para birimi başına ayrı gösteriliyor.
            </Notice>
          )}

          {isStale(summary.lastFetchedAt) && (
            <Notice tone="warn">
              Veriler {formatRelative(summary.lastFetchedAt)} güncellendi. Senkronizasyon
              worker&apos;ı çalışmıyor olabilir.
            </Notice>
          )}

          <Cards summary={summary} />

          {series === null ? (
            <Notice tone="error">Grafik verisi alınamadı.</Notice>
          ) : (
            <MetricsChart
              points={series}
              from={range.from}
              to={range.to}
              currency={summary.currency}
            />
          )}

          {breakdown === null ? (
            <Notice tone="error">Dağılım verisi alınamadı.</Notice>
          ) : (
            <BreakdownTable
              rows={breakdown}
              level={level}
              rangeKey={range.key}
              currency={summary.currency}
            />
          )}

          <p className="text-xs text-ink-muted">
            Son güncelleme: {formatRelative(summary.lastFetchedAt)} · {summary.accountCount} reklam
            hesabı · Bugün dâhil değil — tamamlanmamış bir gün tüm oranları aşağı çeker
          </p>
        </>
      )}
    </div>
  );
}

function Cards({ summary }: { summary: MetricsSummary }) {
  const prev = summary.previous;
  const currency = summary.currency;

  // Karışık para biriminde tek bir harcama toplamı göstermek yanlış olurdu;
  // tutarları para birimi başına yan yana veriyoruz.
  const spendValue =
    currency === null && summary.byCurrency.length > 1
      ? summary.byCurrency
          .map((c) => formatMoney(c.spendMicros, c.currency, { compact: true }))
          .join(' + ')
      : formatMoney(summary.spendMicros, currency);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <MetricCard
        label="Harcama"
        value={spendValue}
        change={changePercentMicros(summary.spendMicros, prev?.spendMicros)}
        emphasis
      />
      <MetricCard
        label="Dönüşüm"
        value={formatNumber(summary.conversions)}
        change={changePercent(summary.conversions, prev?.conversions)}
      />
      <MetricCard
        label="CPA"
        value={formatMoney(microsOf(summary.cpa), currency)}
        // ARTIŞ KÖTÜ: dönüşüm başına maliyet yükseliyorsa kırmızı olmalı.
        inverse
        change={summary.cpa === null ? null : changePercent(summary.cpa, prev?.cpa)}
        hint={summary.cpa === null ? 'dönüşüm yok' : undefined}
      />
      <MetricCard
        label="ROAS"
        value={formatRoas(summary.roas)}
        change={summary.roas === null ? null : changePercent(summary.roas, prev?.roas)}
        hint={summary.roas === null ? 'gelir takip edilmiyor' : undefined}
      />

      <MetricCard
        label="Gösterim"
        value={formatNumber(summary.impressions)}
        change={changePercent(summary.impressions, prev?.impressions)}
      />
      <MetricCard
        label="Tık"
        value={formatNumber(summary.clicks)}
        change={changePercent(summary.clicks, prev?.clicks)}
      />
      <MetricCard
        label="CTR"
        value={formatPercent(summary.ctr)}
        change={summary.ctr === null ? null : changePercent(summary.ctr, prev?.ctr)}
      />
      <MetricCard
        label="CPC"
        value={formatMoney(microsOf(summary.cpc), currency)}
        inverse
        change={summary.cpc === null ? null : changePercent(summary.cpc, prev?.cpc)}
      />
    </div>
  );
}

function RangeTabs({ current, level }: { current: string; level: MetricLevel }) {
  return (
    <nav className="flex gap-1 rounded-lg bg-surface-sunken p-0.5" aria-label="Tarih aralığı">
      {RANGE_PRESETS.map((p) => (
        <Link
          key={p.key}
          href={`/dashboard?aralik=${p.key}&seviye=${level}`}
          aria-current={current === p.key ? 'page' : undefined}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            current === p.key ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
          }`}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
      <h2 className="text-sm font-semibold text-ink">Henüz metrik yok</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
        Bir platform bağlayın ve reklam hesabını senkronizasyona açın. İlk veri, worker
        senkronizasyonu tamamladıktan sonra burada görünür.
      </p>
      <Link
        href="/ayarlar/baglantilar"
        className="mt-4 inline-flex rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90"
      >
        Bağlantılara git
      </Link>
    </div>
  );
}

function Notice({ tone, children }: { tone: 'warn' | 'error'; children: React.ReactNode }) {
  const cls =
    tone === 'warn'
      ? 'border-amber-300 bg-amber-50 text-amber-900'
      : 'border-red-300 bg-red-50 text-red-900';
  return (
    <div className={`rounded-lg border px-3.5 py-2.5 text-sm ${cls}`} role="status">
      {children}
    </div>
  );
}

/** Oranı micros string'e çevirir — `formatMoney` tek bir giriş biçimi bekliyor. */
function microsOf(value: number | null): string | null {
  if (value === null) return null;
  return String(Math.round(value * 1_000_000));
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resolveLevel(raw: string | undefined): MetricLevel {
  // `account` sekmesi YOK: hesap seviyesi zaten üstteki kartlar. Tabloda
  // göstermek aynı sayıyı iki kez göstermek olurdu.
  return METRIC_LEVELS.includes(raw as MetricLevel) && raw !== 'account'
    ? (raw as MetricLevel)
    : 'campaign';
}
