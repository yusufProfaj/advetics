import Link from 'next/link';
import type { AdsExploreQuery, AdsExploreResult } from '@advetics/shared';
import { AD_SORT_FIELDS, AD_STATUSES, PLATFORMS } from '@advetics/shared';
import { requireSession } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { RANGE_PRESETS, resolveRange } from '@/lib/date-range';
import { formatDayLong, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { AdCard } from '@/components/ad-card';

/*
 * BAŞLIK TÜRKÇE. Menüde "Reklam Keşfi" yazıp ekranda "Ads Explorer" görmek,
 * kullanıcının doğru sayfada olduğundan şüphe etmesine yol açıyordu.
 * CLAUDE.md: "Arayüz Türkçe ve iş dilinde." URL değişmiyor — bağlantılar
 * paylaşılmış olabilir.
 */
export const metadata = { title: 'Reklam Keşfi — Advetics' };
export const dynamic = 'force-dynamic';

const SORT_LABEL: Record<string, string> = {
  spend: 'Harcama',
  impressions: 'Gösterim',
  clicks: 'Tık',
  conversions: 'Dönüşüm',
  ctr: 'CTR',
  cpa: 'CPA',
  name: 'Ad',
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
 * Modül 4 — Ads Explorer.
 *
 * Tüm süzgeç durumu URL'DE. Sunucuda render ediliyor, paylaşılabiliyor ve
 * "reddedilmiş reklamlar" gibi bir görünümü ekip arkadaşına link olarak
 * gönderebiliyorsun. İstemci state'i bunu kaybettirirdi.
 *
 * Arama alanı bir FORM (GET): tek istemci bileşeni bile gerekmiyor, tarayıcı
 * formu kendisi URL'e çeviriyor.
 */
export default async function AdsExplorerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSession();
  const params = await searchParams;

  const range = resolveRange(first(params.aralik));
  const sort = pick(first(params.sirala), AD_SORT_FIELDS, 'spend');
  const dir = first(params.yon) === 'asc' ? 'asc' : 'desc';
  const status = pick(first(params.durum), AD_STATUSES, undefined);
  const adAccountId = first(params.hesap);
  const campaignId = first(params.kampanya);
  const q = first(params.ara)?.trim() || undefined;
  const onlyIssues = first(params.sorunlu) === '1';
  /*
   * PLATFORM SÜZGECİ. Şemada (`adsExploreQuerySchema`) ve serviste zaten
   * vardı; panel onu HİÇ göndermiyordu. Meta ve Google reklamları tek listede
   * karışık duruyor ve hangisinin hangi platforma ait olduğu ancak kampanya
   * adından tahmin edilebiliyordu — oysa `ads.platform` kolonu baştan beri
   * orada.
   */
  const platform = pick(first(params.platform), PLATFORMS, undefined);
  const page = Math.max(1, Number(first(params.sayfa) ?? 1) || 1);

  const qs = new URLSearchParams({
    from: range.from,
    to: range.to,
    sort,
    dir,
    page: String(page),
    pageSize: '25',
  });
  if (status) qs.set('status', status);
  if (adAccountId) qs.set('adAccountId', adAccountId);
  if (campaignId) qs.set('campaignId', campaignId);
  if (q) qs.set('q', q);
  if (onlyIssues) qs.set('onlyIssues', 'true');
  if (platform) qs.set('platform', platform);

  /*
   * HATA YUTULMUYOR. `.catch(() => null)` 401 (oturum), 403 (izin), 500
   * (sorgu hatası) ve "API kapalı" hâllerini AYNI cümleye çeviriyordu:
   * "Reklamlar alınamadı. API çalışıyor mu?" — sunucu log'una bakmadan
   * hangisi olduğunu anlamak imkânsızdı. CLAUDE.md'deki
   * `.catch(() => setX([]))` yasağının aynısı.
   */
  let result: AdsExploreResult | null = null;
  let hata: string | null = null;
  try {
    result = await serverApiFetch<AdsExploreResult>(`/ads?${qs}`);
  } catch (err) {
    hata =
      err instanceof ApiRequestError
        ? `${err.message} (${err.code}, HTTP ${err.status})`
        : err instanceof Error
          ? err.message
          : 'Bilinmeyen hata';
  }

  /** Mevcut süzgeçleri koruyarak yeni bir bağlantı üretir. */
  const linkWith = (over: Record<string, string | undefined>): string => {
    const next = new URLSearchParams();
    const current: Record<string, string | undefined> = {
      aralik: range.key,
      sirala: sort,
      yon: dir,
      durum: status,
      hesap: adAccountId,
      kampanya: campaignId,
      ara: q,
      sorunlu: onlyIssues ? '1' : undefined,
      platform,
      ...over,
    };
    for (const [k, v] of Object.entries(current)) if (v) next.set(k, v);
    return `/ads-explorer?${next}`;
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Reklam Keşfi</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            {formatDayLong(range.from)} — {formatDayLong(range.to)}
            {result && ` · ${formatNumber(result.total)} reklam`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* PLATFORM ŞERİDİ. Google Ads'te arama reklamlarının görseli yok,
              Meta'da her reklamın var: ikisini tek listede karıştırmak hem
              tarama hem de rapora alma işini zorlaştırıyor. */}
          <nav className="flex gap-1 rounded-lg bg-surface-sunken p-0.5" aria-label="Platform">
            {(
              [
                { key: undefined, label: 'Tümü' },
                { key: 'meta' as const, label: 'Meta Ads' },
                { key: 'google' as const, label: 'Google Ads' },
              ] as const
            ).map((p) => (
              <Link
                key={p.label}
                href={linkWith({ platform: p.key, kampanya: undefined, sayfa: undefined })}
                aria-current={platform === p.key ? 'page' : undefined}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  platform === p.key
                    ? 'bg-surface text-ink shadow-sm'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {p.label}
              </Link>
            ))}
          </nav>
        <nav className="flex gap-1 rounded-lg bg-surface-sunken p-0.5" aria-label="Tarih aralığı">
          {RANGE_PRESETS.map((p) => (
            <Link
              key={p.key}
              href={linkWith({ aralik: p.key, sayfa: undefined })}
              aria-current={range.key === p.key ? 'page' : undefined}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                range.key === p.key ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {p.label}
            </Link>
          ))}
          </nav>
        </div>
      </header>

      {/* Arama — düz GET formu, istemci JS'i yok. */}
      <form action="/ads-explorer" method="get" className="flex flex-wrap gap-2">
        <input type="hidden" name="aralik" value={range.key} />
        <input type="hidden" name="sirala" value={sort} />
        <input type="hidden" name="yon" value={dir} />
        {status && <input type="hidden" name="durum" value={status} />}
        {adAccountId && <input type="hidden" name="hesap" value={adAccountId} />}
        {campaignId && <input type="hidden" name="kampanya" value={campaignId} />}
        {onlyIssues && <input type="hidden" name="sorunlu" value="1" />}
        {platform && <input type="hidden" name="platform" value={platform} />}
        <input
          type="search"
          name="ara"
          defaultValue={q ?? ''}
          placeholder="Reklam adı, başlık ya da metin ara…"
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition hover:opacity-90"
        >
          Ara
        </button>
        {q && (
          <Link
            href={linkWith({ ara: undefined, sayfa: undefined })}
            className="rounded-lg border border-line px-3 py-2 text-sm text-ink-muted transition hover:text-ink"
          >
            Temizle
          </Link>
        )}
      </form>

      {result === null ? (
        <Notice>Reklamlar alınamadı — {hata ?? 'sebep bilinmiyor'}</Notice>
      ) : (
        <>
          {/* REKLAM HESABI SÜZGECİ — kampanyalardan önce ve AYRI satırda.
              Ajans görünümünde onlarca kampanya var ve hangi müşteriye ait
              olduğu ancak hesaptan anlaşılıyor. Hesap seçilince kampanya
              listesi de o hesaba daralıyor. */}
          {result.facets.adAccounts.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-ink-muted">Hesap:</span>
              <FilterChip
                href={linkWith({ hesap: undefined, kampanya: undefined, sayfa: undefined })}
                active={!adAccountId}
              >
                Tümü
              </FilterChip>
              {result.facets.adAccounts.map((acc) => (
                <FilterChip
                  key={acc.id}
                  href={linkWith({
                    hesap: adAccountId === acc.id ? undefined : acc.id,
                    // Hesap değişince kampanya seçimi geçersiz kalıyor.
                    kampanya: undefined,
                    sayfa: undefined,
                  })}
                  active={adAccountId === acc.id}
                >
                  {acc.name} ({acc.adCount})
                </FilterChip>
              ))}
            </div>
          )}

          {/* Süzgeçler */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <FilterChip href={linkWith({ durum: undefined, sorunlu: undefined, sayfa: undefined })} active={!status && !onlyIssues}>
              Tümü
            </FilterChip>
            {result.facets.issueCount > 0 && (
              <FilterChip
                href={linkWith({ sorunlu: onlyIssues ? undefined : '1', durum: undefined, sayfa: undefined })}
                active={onlyIssues}
                tone="danger"
              >
                Sorunlu ({result.facets.issueCount})
              </FilterChip>
            )}
            {result.facets.statuses.map((s) => (
              <FilterChip
                key={s.status}
                href={linkWith({
                  durum: status === s.status ? undefined : s.status,
                  sorunlu: undefined,
                  sayfa: undefined,
                })}
                active={status === s.status}
              >
                {STATUS_LABEL[s.status] ?? s.status} ({s.count})
              </FilterChip>
            ))}

            {result.facets.campaigns.length > 1 && (
              <>
                <span className="mx-1 h-4 w-px bg-line" />
                {result.facets.campaigns.slice(0, adAccountId ? 20 : 6).map((c) => (
                  <FilterChip
                    key={c.id}
                    href={linkWith({
                      kampanya: campaignId === c.id ? undefined : c.id,
                      sayfa: undefined,
                    })}
                    active={campaignId === c.id}
                  >
                    {c.name} ({c.adCount})
                  </FilterChip>
                ))}
              </>
            )}
          </div>

          {/* Süzgeç toplamı — SAYFANIN değil, süzgecin tamamının */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-xl border border-line bg-surface px-4 py-2.5 text-xs">
            <Total label="Harcama" value={formatMoney(result.totals.spendMicros, result.currency)} />
            <Total label="Gösterim" value={formatNumber(result.totals.impressions)} />
            <Total label="Tık" value={formatNumber(result.totals.clicks)} />
            <Total label="CTR" value={formatPercent(result.totals.ctr)} />
            <Total label="Dönüşüm" value={formatNumber(result.totals.conversions)} />
            <Total
              label="CPA"
              value={formatMoney(
                result.totals.cpa === null ? null : String(Math.round(result.totals.cpa * 1_000_000)),
                result.currency,
              )}
            />
          </div>

          {/* Sıralama */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-ink-muted">Sırala:</span>
            {AD_SORT_FIELDS.map((f) => {
              const active = sort === f;
              // Aynı alana tekrar tıklamak yönü çeviriyor — tablo başlığı
              // davranışının bilinen karşılığı.
              const nextDir = active && dir === 'desc' ? 'asc' : 'desc';
              return (
                <Link
                  key={f}
                  href={linkWith({ sirala: f, yon: nextDir, sayfa: undefined })}
                  className={`rounded-md px-2 py-1 font-medium transition ${
                    active ? 'bg-brand-soft text-brand' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {SORT_LABEL[f]}
                  {active && (dir === 'desc' ? ' ↓' : ' ↑')}
                </Link>
              );
            })}
          </div>

          {result.rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center">
              <p className="text-sm font-medium text-ink">Bu süzgeçle reklam yok</p>
              <p className="mt-1 text-sm text-ink-muted">
                Süzgeçleri gevşetin ya da tarih aralığını genişletin.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {result.rows.map((ad) => (
                <AdCard key={ad.id} ad={ad} currency={result.currency} />
              ))}
            </div>
          )}

          <Pagination
            page={result.page}
            pageSize={result.pageSize}
            total={result.total}
            linkWith={linkWith}
          />
        </>
      )}
    </div>
  );
}

function Pagination({
  page,
  pageSize,
  total,
  linkWith,
}: {
  page: number;
  pageSize: number;
  total: number;
  linkWith: (over: Record<string, string | undefined>) => string;
}) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;

  return (
    <nav className="flex items-center justify-between gap-3 text-sm" aria-label="Sayfalama">
      <p className="text-ink-muted">
        Sayfa {page} / {pages}
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Link
            href={linkWith({ sayfa: String(page - 1) })}
            className="rounded-lg border border-line px-3 py-1.5 text-ink-muted transition hover:text-ink"
          >
            ← Önceki
          </Link>
        )}
        {page < pages && (
          <Link
            href={linkWith({ sayfa: String(page + 1) })}
            className="rounded-lg border border-line px-3 py-1.5 text-ink-muted transition hover:text-ink"
          >
            Sonraki →
          </Link>
        )}
      </div>
    </nav>
  );
}

function FilterChip({
  href,
  active,
  tone,
  children,
}: {
  href: string;
  active: boolean;
  tone?: 'danger';
  children: React.ReactNode;
}) {
  const base = 'rounded-full px-2.5 py-1 font-medium transition ring-1 ring-inset';
  const cls = active
    ? tone === 'danger'
      ? 'bg-red-500/15 text-red-400 ring-red-500/30'
      : 'bg-brand-soft text-brand ring-brand/30'
    : tone === 'danger'
      ? 'text-red-400 ring-red-500/20 hover:bg-red-500/10'
      : 'text-ink-muted ring-line hover:text-ink';
  return (
    <Link href={href} className={`${base} ${cls}`}>
      {children}
    </Link>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-ink-muted">{label}: </span>
      <span className="font-semibold tabular-nums text-ink">{value}</span>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">
      {children}
    </div>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pick<T extends string, D extends T | undefined>(
  raw: string | undefined,
  allowed: readonly T[],
  fallback: D,
): T | D {
  return allowed.includes(raw as T) ? (raw as T) : fallback;
}
