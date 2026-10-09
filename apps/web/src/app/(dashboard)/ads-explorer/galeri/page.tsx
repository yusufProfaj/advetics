import Link from 'next/link';
import { SuzgecMenusu } from '@/components/suzgec-menusu';
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
 * REKLAM GALERİSİ (2026-10-09): bu ekran menüde "Reklam Keşfi" idi. Reklam
 * Yöneticisi şirketten reklama inen tabloya dönünce reklam KARTLARI, arama
 * ve "Sorunlu" süzgeci buraya, onun alt sayfasına taşındı: o tabloda
 * reklamları metinle aramanın ve reddedilenleri tek tıkla toplamanın
 * karşılığı yok, kaldırmak çalışan bir işi silmek olurdu.
 *
 * BAŞLIK TÜRKÇE. Menüde "Reklam Keşfi" yazıp ekranda "Ads Explorer" görmek,
 * kullanıcının doğru sayfada olduğundan şüphe etmesine yol açıyordu.
 * CLAUDE.md: "Arayüz Türkçe ve iş dilinde." URL değişmiyor — bağlantılar
 * paylaşılmış olabilir.
 */
export const metadata = { title: 'Reklam Galerisi · Advetics' };
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
      platform,
      ...over,
    };
    for (const [k, v] of Object.entries(current)) if (v) next.set(k, v);
    return `/ads-explorer/galeri?${next}`;
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/ads-explorer" className="text-xs font-medium text-ink-muted hover:text-ink">
            ‹ Reklam Yöneticisi
          </Link>
          <h1 className="sayfa-baslik">Reklam Galerisi</h1>
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

      {/*
        ═══ SÜZGEÇLER TEK ARAÇ ÇUBUĞUNDA ═══
        Arama bir satır, altında hesap/durum/kampanya/sıralama DÖRT satır çip
        vardı; uzun hesap ve kampanya adları satırları ikiye üçe bölüyor ve
        süzgeçler ilk ekranın yarısını kaplıyordu. Artık tek çubuk: arama +
        her boyut için etiketli bir açılır menü (`SuzgecMenusu`) + "Sorunlu"
        düğmesi. Seçili süzgeçler altta, tek tıkla kaldırılan etiketler.
        Bağlantıların hepsi `linkWith` ile sunucuda kuruluyor: adres
        süzgeci taşımaya devam ediyor.

        "Sorunlu" MENÜDE DEĞİL, DÜĞME: sayısı sıfırdan büyükse dikkat
        istiyor ve bir menünün içinde görünmez olurdu.
      */}
      <div className="space-y-2 rounded-xl border border-line bg-surface p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          {/* Arama — düz GET formu, istemci JS'i yok. */}
          <form action="/ads-explorer/galeri" method="get" className="flex min-w-[16rem] flex-1 items-center gap-2">
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
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Reklam ara</span>
              <svg viewBox="0 0 20 20" fill="none" aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted">
                <path d="M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM17 17l-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                name="ara"
                defaultValue={q ?? ''}
                placeholder="Reklam adı, başlık ya da metin ara…"
                className="w-full rounded-lg border border-line bg-surface py-1.5 pl-8 pr-3 text-sm text-ink placeholder:text-ink-muted"
              />
            </label>
            <button type="submit" className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white">
              Ara
            </button>
          </form>

          {result !== null && (
            <div className="flex flex-wrap items-center gap-2">
              {result.facets.adAccounts.length > 1 && (
                <SuzgecMenusu
                  etiket="Hesap"
                  deger={result.facets.adAccounts.find((a) => a.id === adAccountId)?.name ?? (adAccountId ? 'Seçili hesap' : 'Tümü')}
                  secili={Boolean(adAccountId)}
                  secenekler={[
                    {
                      href: linkWith({ hesap: undefined, kampanya: undefined, sayfa: undefined }),
                      ad: 'Tümü',
                      aktif: !adAccountId,
                    },
                    ...result.facets.adAccounts.map((acc) => ({
                      // Hesap değişince kampanya seçimi geçersiz kalıyor.
                      href: linkWith({ hesap: acc.id, kampanya: undefined, sayfa: undefined }),
                      ad: acc.name,
                      sayi: acc.adCount,
                      aktif: adAccountId === acc.id,
                    })),
                  ]}
                />
              )}

              <SuzgecMenusu
                etiket="Durum"
                deger={status ? (STATUS_LABEL[status] ?? status) : 'Tümü'}
                secili={Boolean(status)}
                secenekler={[
                  { href: linkWith({ durum: undefined, sayfa: undefined }), ad: 'Tümü', aktif: !status },
                  ...result.facets.statuses.map((st) => ({
                    href: linkWith({ durum: st.status, sorunlu: undefined, sayfa: undefined }),
                    ad: STATUS_LABEL[st.status] ?? st.status,
                    sayi: st.count,
                    aktif: status === st.status,
                  })),
                ]}
              />

              {result.facets.campaigns.length > 1 && (
                <SuzgecMenusu
                  etiket="Kampanya"
                  deger={result.facets.campaigns.find((c) => c.id === campaignId)?.name ?? (campaignId ? 'Seçili kampanya' : 'Tümü')}
                  secili={Boolean(campaignId)}
                  secenekler={[
                    { href: linkWith({ kampanya: undefined, sayfa: undefined }), ad: 'Tümü', aktif: !campaignId },
                    ...result.facets.campaigns.map((c) => ({
                      href: linkWith({ kampanya: c.id, sayfa: undefined }),
                      ad: c.name,
                      sayi: c.adCount,
                      aktif: campaignId === c.id,
                    })),
                  ]}
                />
              )}

              <SuzgecMenusu
                etiket="Sırala"
                deger={`${SORT_LABEL[sort]} ${dir === 'desc' ? '↓' : '↑'}`}
                secili={false}
                secenekler={AD_SORT_FIELDS.map((f) => {
                  const active = sort === f;
                  // Aynı alana tekrar tıklamak yönü çeviriyor — tablo başlığı
                  // davranışının bilinen karşılığı.
                  const nextDir = active && dir === 'desc' ? 'asc' : 'desc';
                  return {
                    href: linkWith({ sirala: f, yon: nextDir, sayfa: undefined }),
                    ad: SORT_LABEL[f],
                    aktif: active,
                    ek: active ? (dir === 'desc' ? '↓ çoktan aza' : '↑ azdan çoğa') : undefined,
                  };
                })}
              />

              {result.facets.issueCount > 0 && (
                <Link
                  href={linkWith({ sorunlu: onlyIssues ? undefined : '1', durum: undefined, sayfa: undefined })}
                  aria-current={onlyIssues ? 'true' : undefined}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                    onlyIssues
                      ? 'border-danger/40 bg-danger-soft text-danger-strong'
                      : 'border-danger/25 text-danger-strong hover:bg-danger-soft'
                  }`}
                >
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-danger" />
                  Sorunlu ({result.facets.issueCount})
                </Link>
              )}
            </div>
          )}
        </div>

        {/*
          SEÇİLİ SÜZGEÇLER — ne süzüldüğü tek bakışta ve her biri tek tıkla
          kalkıyor. Menüde seçili olan düğmenin içinde de yazıyor; ama dört
          düğmeyi tek tek okumak yerine "şu an neye bakıyorum" burada.
        */}
        {(() => {
          const etiketler: Array<{ ad: string; href: string }> = [];
          if (q) etiketler.push({ ad: `Arama: “${q}”`, href: linkWith({ ara: undefined, sayfa: undefined }) });
          if (adAccountId)
            etiketler.push({
              ad: `Hesap: ${result?.facets.adAccounts.find((a) => a.id === adAccountId)?.name ?? 'seçili'}`,
              href: linkWith({ hesap: undefined, kampanya: undefined, sayfa: undefined }),
            });
          if (status)
            etiketler.push({ ad: `Durum: ${STATUS_LABEL[status] ?? status}`, href: linkWith({ durum: undefined, sayfa: undefined }) });
          if (campaignId)
            etiketler.push({
              ad: `Kampanya: ${result?.facets.campaigns.find((c) => c.id === campaignId)?.name ?? 'seçili'}`,
              href: linkWith({ kampanya: undefined, sayfa: undefined }),
            });
          if (onlyIssues) etiketler.push({ ad: 'Yalnızca sorunlu', href: linkWith({ sorunlu: undefined, sayfa: undefined }) });
          if (etiketler.length === 0) return null;
          return (
            <div className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2 text-xs">
              {etiketler.map((e) => (
                <Link
                  key={e.ad}
                  href={e.href}
                  title={`${e.ad} süzgecini kaldır`}
                  className="inline-flex items-center gap-1 rounded-full bg-surface-sunken px-2.5 py-1 text-ink transition hover:bg-danger-soft hover:text-danger-strong"
                >
                  <span className="max-w-[16rem] truncate">{e.ad}</span>
                  <span aria-hidden>×</span>
                </Link>
              ))}
              <Link
                href={linkWith({ ara: undefined, hesap: undefined, durum: undefined, kampanya: undefined, sorunlu: undefined, sayfa: undefined })}
                className="ml-1 text-ink-muted underline-offset-2 hover:text-ink hover:underline"
              >
                Tümünü temizle
              </Link>
            </div>
          );
        })()}
      </div>

      {result === null ? (
        <Notice>Reklamlar alınamadı. {hata ?? 'Sebep bilinmiyor.'}</Notice>
      ) : (
        <>
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


function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-muted">{label}</p>
      <p className="truncate text-base font-semibold tabular-nums text-ink">{value}</p>
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
