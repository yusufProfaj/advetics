import Link from 'next/link';
import type { AdsExploreQuery, AdsExploreResult, Platform } from '@advetics/shared';
import { AD_SORT_FIELDS, AD_STATUSES, PLATFORMS } from '@advetics/shared';
import { PLATFORM_KISA_ADLARI } from '@advetics/shared';
import { requireSession } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { rangeParams, resolveRange } from '@/lib/date-range';
import { TarihSecici } from '@/components/tarih-secici';
import { formatDayLong, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { AdCard } from '@/components/ad-card';

/*
 * BAŞLIK TÜRKÇE. Menüde "Reklam Keşfi" yazıp ekranda "Ads Explorer" görmek,
 * kullanıcının doğru sayfada olduğundan şüphe etmesine yol açıyordu.
 * CLAUDE.md: "Arayüz Türkçe ve iş dilinde." URL değişmiyor — bağlantılar
 * paylaşılmış olabilir.
 */
export const metadata = { title: 'Reklam Keşfi · Advetics' };
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

  const range = resolveRange({
    aralik: first(params.aralik),
    baslangic: first(params.baslangic),
    bitis: first(params.bitis),
    karsilastir: first(params.karsilastir),
  });
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
  /*
   * KAMPANYA ÇİPLERİ SESSİZCE KESİLİYORDU. Liste `slice(0, 6)` ile
   * kırpılıyor ve kalanların VAR OLDUĞU hiçbir yerde yazmıyordu: elli
   * kampanyalı bir hesapta kullanıcı kırk dördünü hiç göremiyor, süzgecin
   * eksik olduğunu bilmiyordu. Bu depoda sessiz kesme adı konmuş bir hata
   * türü. Sayı artık yazılı ve tek tıkla açılıyor.
   */
  const tumKampanyalar = first(params.tumkampanya) === '1';
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
    /*
     * HATA KODU EKRANDAN KALKTI, MESAJ KALDI. `(AD_LIST_FAILED, HTTP 500)`
     * paneli kullanan kişiye hiçbir şey anlatmıyor ve ürkütücü görünüyor;
     * sunucunun kendi cümlesi teşhis için yeterli. Kod ve durum sunucu
     * log'unda zaten duruyor.
     */
    hata =
      err instanceof ApiRequestError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Bilinmeyen hata.';
  }

  /** Mevcut süzgeçleri koruyarak yeni bir bağlantı üretir. */
  const linkWith = (over: Record<string, string | undefined>): string => {
    const next = new URLSearchParams();
    const current: Record<string, string | undefined> = {
      // TARİH ANAHTARLARININ HEPSİ. Yalnızca `aralik` taşınsaydı özel bir
      // aralık seçip herhangi bir süzgece basmak onu sessizce 30 güne
      // döndürürdü — "aralık bazen kayboluyor" belirtisi.
      ...rangeParams(range),
      sirala: sort,
      yon: dir,
      durum: status,
      hesap: adAccountId,
      kampanya: campaignId,
      ara: q,
      sorunlu: onlyIssues ? '1' : undefined,
      tumkampanya: tumKampanyalar ? '1' : undefined,
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
            {formatDayLong(range.from)} - {formatDayLong(range.to)}
            {result && ` · ${formatNumber(result.total)} reklam`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* PLATFORM ŞERİDİ. Google Ads'te arama reklamlarının görseli yok,
              Meta'da her reklamın var: ikisini tek listede karıştırmak hem
              tarama hem de rapora alma işini zorlaştırıyor. */}
          <nav className="flex gap-1 rounded-lg bg-surface-sunken p-0.5" aria-label="Platform">
            {/*
              SEKMELER `PLATFORMS`TAN — elle yazılan liste üçüncü platformu
              ekranda hiç göstermiyordu.
            */}
            {[
              { key: undefined as Platform | undefined, label: 'Tümü' },
              ...PLATFORMS.map((pl) => ({
                key: pl as Platform | undefined,
                label: PLATFORM_KISA_ADLARI[pl],
              })),
            ].map((p) => (
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
        <TarihSecici aralik={range} enEskiGun={null} />
        </div>
      </header>

      {/* Arama — düz GET formu, istemci JS'i yok. */}
      <form action="/ads-explorer" method="get" className="flex flex-wrap gap-2">
        {/* TARİH ANAHTARLARI GİZLİ ALAN OLARAK. Form GET ile URL'i baştan
            kurduğu için burada olmayan her parametre ARAMA YAPINCA düşüyor. */}
        {Object.entries(rangeParams(range)).map(([k, v]) =>
          v === undefined ? null : <input key={k} type="hidden" name={k} value={v} />,
        )}
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
        <Notice>Reklamlar alınamadı. {hata ?? 'Sebep bilinmiyor.'}</Notice>
      ) : (
        <>
          {/*
            ═══ SÜZGEÇLER TEK KUTUDA VE ETİKETLİ ═══
            Hesap, durum, kampanya ve sıralama DÖRT AYRI satırdı; aralarında
            hiçbir çerçeve yoktu ve hepsi aynı yuvarlak çipe benziyordu.
            Kullanıcı hangi satırın ne süzdüğünü ancak deneyerek öğreniyordu,
            üstelik dördü birlikte ilk ekranın tamamını kaplıyordu. Aynı
            süzgeçler tek kapta, her boyut kendi etiketiyle.
          */}
          <div className="space-y-2 rounded-xl border border-line bg-surface px-4 py-3">
            {result.facets.adAccounts.length > 1 && (
              <SuzgecSatiri etiket="Hesap">
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
              </SuzgecSatiri>
            )}

            <SuzgecSatiri etiket="Durum">
              <FilterChip
                href={linkWith({ durum: undefined, sorunlu: undefined, sayfa: undefined })}
                active={!status && !onlyIssues}
              >
                Tümü
              </FilterChip>
              {result.facets.issueCount > 0 && (
                <FilterChip
                  href={linkWith({
                    sorunlu: onlyIssues ? undefined : '1',
                    durum: undefined,
                    sayfa: undefined,
                  })}
                  active={onlyIssues}
                  tone="danger"
                >
                  Sorunlu ({result.facets.issueCount})
                </FilterChip>
              )}
              {result.facets.statuses.map((st) => (
                <FilterChip
                  key={st.status}
                  href={linkWith({
                    durum: status === st.status ? undefined : st.status,
                    sorunlu: undefined,
                    sayfa: undefined,
                  })}
                  active={status === st.status}
                >
                  {STATUS_LABEL[st.status] ?? st.status} ({st.count})
                </FilterChip>
              ))}
            </SuzgecSatiri>

            {result.facets.campaigns.length > 1 && (
              <SuzgecSatiri etiket="Kampanya">
                {(() => {
                  const sinir = tumKampanyalar ? result.facets.campaigns.length : 8;
                  const gosterilen = result.facets.campaigns.slice(0, sinir);
                  const kalan = result.facets.campaigns.length - gosterilen.length;
                  return (
                    <>
                      {gosterilen.map((c) => (
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
                      {/* SESSİZ KESME YOK: kaçının gizlendiği yazılı ve açılıyor. */}
                      {kalan > 0 && (
                        <FilterChip href={linkWith({ tumkampanya: '1' })} active={false}>
                          +{kalan} kampanya daha
                        </FilterChip>
                      )}
                      {tumKampanyalar && result.facets.campaigns.length > 8 && (
                        <FilterChip href={linkWith({ tumkampanya: undefined })} active={false}>
                          Listeyi kısalt
                        </FilterChip>
                      )}
                    </>
                  );
                })()}
              </SuzgecSatiri>
            )}

            <SuzgecSatiri etiket="Sırala">
              {AD_SORT_FIELDS.map((f) => {
                const active = sort === f;
                // Aynı alana tekrar tıklamak yönü çeviriyor — tablo başlığı
                // davranışının bilinen karşılığı.
                const nextDir = active && dir === 'desc' ? 'asc' : 'desc';
                return (
                  <Link
                    key={f}
                    href={linkWith({ sirala: f, yon: nextDir, sayfa: undefined })}
                    aria-current={active ? 'true' : undefined}
                    className={`rounded-md px-2 py-1 font-medium transition ${
                      active ? 'bg-brand-soft text-brand-strong' : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    {SORT_LABEL[f]}
                    {active && (dir === 'desc' ? ' ↓' : ' ↑')}
                  </Link>
                );
              })}
            </SuzgecSatiri>
          </div>

          {/*
            SÜZGEÇ TOPLAMI — SAYFANIN değil, süzgecin tamamının.
            12 piksellik gri bir satırdı ve dipnot gibi duruyordu; oysa
            ekrandaki en önemli sayı bloğu bu: seçilen süzgecin toplam
            harcaması. Rakamlar artık okunur boyutta ve etiketleri üstte.
          */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-line bg-surface px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
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

          {result.rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center">
              <p className="text-sm font-medium text-ink">Bu süzgeçle reklam yok</p>
              <p className="mt-1 text-sm text-ink-muted">
                Süzgeçleri kaldır ya da tarih aralığını genişlet.
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
  /*
   * ÇİP ADI KIRPILIYOR. Kampanya adları 80 karakteri bulabiliyor ve tek bir
   * çip satırın tamamını kaplayıp süzgeci okunmaz yapıyordu. Tam ad `title`
   * ile duruyor: kırpmak bilgiyi GİZLEMEK değil, ertelemek.
   */
  const base =
    'inline-block max-w-[16rem] truncate align-bottom rounded-full px-2.5 py-1 font-medium transition ring-1 ring-inset';
  const cls = active
    ? tone === 'danger'
      ? 'bg-danger/15 text-danger ring-danger/30'
      : 'bg-brand-soft text-brand-strong ring-brand/30'
    : tone === 'danger'
      ? 'text-danger ring-danger/20 hover:bg-danger/10'
      : 'text-ink-muted ring-line hover:text-ink';
  return (
    <Link href={href} title={typeof children === 'string' ? children : undefined} className={`${base} ${cls}`}>
      {children}
    </Link>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="truncate text-base font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}

/**
 * Süzgeç satırı — solda ne süzdüğü, sağda seçenekler.
 *
 * Etiket olmadan dört satır da aynı yuvarlak çipe benziyordu ve kullanıcı
 * hangisinin ne yaptığını ancak deneyerek öğreniyordu.
 */
function SuzgecSatiri({ etiket, children }: { etiket: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="w-16 shrink-0 text-[11px] text-ink-muted">{etiket}</span>
      {children}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger-strong">
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
