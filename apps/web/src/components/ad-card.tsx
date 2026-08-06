import type { AdExplorerRow } from '@advetics/shared';
import { formatMoney, formatNumber, formatPercent, formatRoas } from '@/lib/format';

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-500 ring-emerald-500/25',
  paused: 'bg-amber-500/10 text-amber-500 ring-amber-500/25',
  deleted: 'bg-slate-500/10 text-slate-400 ring-slate-500/25',
  pending_review: 'bg-sky-500/10 text-sky-400 ring-sky-500/25',
  ended: 'bg-slate-500/10 text-slate-400 ring-slate-500/25',
  unknown: 'bg-slate-500/10 text-slate-400 ring-slate-500/25',
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
 * Reklam kartı — creative içeriği + performans yan yana.
 *
 * Tablo yerine kart: Ads Explorer'ın sorusu "hangi reklam neyi yapıyor" ve
 * cevabın yarısı GÖRSEL. Bir satırda 60 karakterlik metin parçası göstermek
 * "bu reklam neye benziyor" sorusunu yanıtlamıyor; Modül 3'ün tablosu zaten
 * sayı karşılaştırması için var.
 *
 * Görsel adresleri platform CDN'inden ve SÜRESİ DOLABİLİYOR. `<img>` doğrudan
 * kullanılıyor (Next Image uzak alan yapılandırması gerektiriyor ve süresi
 * dolan adres için optimizasyon boşa gidiyor). Yüklenemezse arka plandaki yer
 * tutucu görünüyor — kırık resim ikonu panelin bozuk olduğu izlenimi verir.
 */
export function AdCard({ ad, currency }: { ad: AdExplorerRow; currency: string | null }) {
  const money = currency ?? ad.currency ?? null;
  const image = ad.creative?.assetUrls[0];
  const hasIssues = ad.issues.length > 0;

  return (
    <article
      className={`overflow-hidden rounded-xl border bg-surface ${
        hasIssues ? 'border-red-500/40' : 'border-line'
      }`}
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row">
        {/* Görsel */}
        <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-lg bg-surface-sunken sm:h-28 sm:w-28">
          {image ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={image}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-ink-muted">
              görsel yok
            </div>
          )}
        </div>

        {/* İçerik */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                STATUS_STYLE[ad.deleted ? 'deleted' : ad.status] ?? STATUS_STYLE.unknown
              }`}
            >
              {STATUS_LABEL[ad.deleted ? 'deleted' : ad.status] ?? ad.status}
            </span>
            {ad.creative?.creativeType && (
              <span className="rounded bg-surface-sunken px-1.5 py-0.5 text-[10px] text-ink-muted">
                {ad.creative.creativeType}
              </span>
            )}
            {ad.creative?.ctaType && (
              <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand">
                {ad.creative.ctaType}
              </span>
            )}
          </div>

          <h3 className="mt-1.5 truncate text-sm font-semibold text-ink" title={ad.name}>
            {ad.creative?.headline ?? ad.name}
          </h3>
          <p className="truncate text-xs text-ink-muted">
            {ad.campaignName} · {ad.adGroupName}
          </p>

          {ad.creative?.primaryText && (
            // `line-clamp-2`: creative metni bazen 500 karakter ve kartı
            // uzatmak listeyi taramayı imkânsız kılıyor.
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-ink-muted">
              {ad.creative.primaryText}
            </p>
          )}

          {ad.creative?.destinationUrl && (
            <p className="mt-1.5 truncate text-[11px] text-ink-muted">
              →{' '}
              <span className="text-brand/80" title={ad.creative.destinationUrl}>
                {ad.creative.displayUrl ?? ad.creative.destinationUrl}
              </span>
            </p>
          )}
        </div>

        {/* Metrikler */}
        <dl className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-1.5 text-xs sm:w-48">
          <Metric label="Harcama" value={formatMoney(ad.spendMicros, money)} strong />
          <Metric label="Dönüşüm" value={formatNumber(ad.conversions)} strong />
          <Metric label="Gösterim" value={formatNumber(ad.impressions)} />
          <Metric label="Tık" value={formatNumber(ad.clicks)} />
          <Metric label="CTR" value={formatPercent(ad.ctr)} />
          <Metric
            label="CPA"
            value={formatMoney(
              ad.cpa === null ? null : String(Math.round(ad.cpa * 1_000_000)),
              money,
            )}
          />
          {/* ROAS yalnızca gelir varsa — "0.00×" kampanyanın battığını söyler. */}
          {ad.roas !== null && <Metric label="ROAS" value={formatRoas(ad.roas)} />}
        </dl>
      </div>

      {hasIssues && (
        <div className="border-t border-red-500/30 bg-red-500/5 px-4 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-red-400">
            İnceleme sorunu{ad.reviewStatus ? ` · ${ad.reviewStatus}` : ''}
          </p>
          <ul className="mt-1 space-y-0.5">
            {ad.issues.slice(0, 4).map((issue, i) => (
              <li key={`${issue.topic}-${i}`} className="text-xs text-ink">
                <span className="font-medium">{issue.topic}</span>
                {issue.detail && <span className="text-ink-muted"> — {issue.detail}</span>}
              </li>
            ))}
            {ad.issues.length > 4 && (
              <li className="text-xs text-ink-muted">+{ad.issues.length - 4} sorun daha</li>
            )}
          </ul>
        </div>
      )}
    </article>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className={`tabular-nums ${strong ? 'font-semibold text-ink' : 'text-ink-muted'}`}>
        {value}
      </dd>
    </div>
  );
}
