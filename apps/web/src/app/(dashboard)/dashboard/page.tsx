import Link from 'next/link';
import type {
  MetricLevel,
  Platform,
  MetricsBreakdownRow,
  MetricsSummary,
  MetricsTimeseriesPoint,
} from '@advetics/shared';
import { METRIC_LEVELS } from '@advetics/shared';
import { requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { rangeParams, resolveRange } from '@/lib/date-range';
import { baglanti } from '@/lib/baglanti';
import { TarihSecici } from '@/components/tarih-secici';
import { RefreshButton } from '@/components/refresh-button';
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
import { MetricStrip } from '@/components/metric-strip';
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

  /*
   * KAPSAM ÖNCE OKUNUYOR: "Tüm zamanlar" ön ayarı elimizdeki en eski veri
   * gününe dayanıyor. Sabit bir alt sınır hem yüzlerce boş günü tarar hem de
   * 400 günlük sunucu sınırına takılıp hata sayfası üretirdi.
   *
   * Hata YUTULMUYOR ama aralığı da düşürmüyor: kapsam alınamazsa "Tüm
   * zamanlar" 90 güne düşüyor ve bu `date-range.ts` içinde yazılı.
   */
  const kapsam = await serverApiFetch<{ earliestDate: string | null }>(
    `/metrics/coverage?from=${first(params.baslangic) ?? '2026-01-01'}&to=${first(params.bitis) ?? '2026-01-01'}`,
  ).catch(() => null);

  const range = resolveRange({
    aralik: first(params.aralik),
    baslangic: first(params.baslangic),
    bitis: first(params.bitis),
    karsilastir: first(params.karsilastir),
    enEskiGun: kapsam?.earliestDate ?? null,
  });
  const level = resolveLevel(first(params.seviye));
  const platform = resolvePlatform(first(params.platform));

  /*
   * BAĞLANTILARDA TAŞINAN SÜZGEÇLER — TEK YERDE.
   *
   * Platform sekmesi ve kırılım sekmesi bağlantılarını elle birleştiriyordu
   * ve kırılım sekmesi `platform`ı DÜŞÜRÜYORDU: kullanıcı "Meta" seçip
   * "Reklam seti"ne basınca süzgeç sessizce sıfırlanıyordu. Özel tarih
   * aralığı gelince taşınacak anahtar sayısı üçten beşe çıktı ve elle
   * birleştirme sürdürülemez hâle geldi.
   */
  const tasinan = {
    ...rangeParams(range),
    platform: platform ?? undefined,
    seviye: level,
  };

  const base = new URLSearchParams({ from: range.from, to: range.to });
  /*
   * KARŞILAŞTIRMA PENCERESİ AÇIKÇA GİDİYOR. Sunucu eskiden bunu koşulsuz
   * kendisi hesaplıyordu; kullanıcı ne kapatabiliyor ne "önceki yıl"
   * seçebiliyordu. Pencereyi panel hesaplayıp EKRANDA YAZDIĞI için (seçicide
   * "1–31 Tem ile karşılaştırılacak") sorguya da o gitmeli — iki taraf ayrı
   * hesaplarsa yazan dönem ile karşılaştırılan dönem ayrışır.
   */
  if (range.compareFrom && range.compareTo) {
    base.set('compareFrom', range.compareFrom);
    base.set('compareTo', range.compareTo);
  }
  // PLATFORM FİLTRESİ ÜÇ SORGUYA DA gidiyor: özet, grafik ve dağılım aynı
  // kapsamı göstermeli. Yalnızca tabloya uygulamak, üstteki kartların
  // "toplam" gösterirken tablonun tek platformu listelemesi demek olurdu —
  // aynı ekranda iki farklı gerçek.
  if (platform) base.set('platform', platform);
  const breakdownQs = new URLSearchParams(base);
  breakdownQs.set('level', level);
  breakdownQs.set('limit', '25');

  // Bir uç noktanın düşmesi TÜM ekranı düşürmemeli: panel açılıp "veri
  // alınamadı" demeli, 500 sayfası göstermemeli.
  const [summary, series, breakdown] = await Promise.all([
    serverApiFetch<MetricsSummary>(`/metrics/summary?${base}`).catch(() => null),
    // Tek günlük aralıkta grafik çizilmiyor; sorguyu da atlıyoruz.
    range.days > 1
      ? serverApiFetch<MetricsTimeseriesPoint[]>(`/metrics/timeseries?${base}`).catch(() => null)
      : Promise.resolve<MetricsTimeseriesPoint[]>([]),
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
          {/*
            TAMAMLANMAMIŞ GÜN AÇIKÇA YAZILIYOR. Sabah 09:00'da görülen düşük
            harcama "kampanya durmuş" diye okunuyor; oysa gün bitmemiş.
            Hiçbir hata üretmeyen ama yanlış karar aldıran gösterim tam olarak
            budur.
          */}
          {range.incomplete && (
            <p className="mt-1 text-xs text-warn">
              Gün henüz tamamlanmadı — rakamlar gün boyunca artmaya devam edecek.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PlatformTabs current={platform} tasinan={tasinan} />
          <TarihSecici aralik={range} enEskiGun={kapsam?.earliestDate ?? null} />
          {/*
            "GEÇMİŞ VERİYİ ÇEK" DÜĞMESİ KALDIRILDI — işi iki yere dağıldı ve
            ikisi de kendiliğinden çalışıyor:
              · Hesap bir müşteriye ATANDIĞINDA 90 günlük geçmiş kendiliğinden
                kuyruğa giriyor.
              · "Şimdi güncelle" artık EKRANDA SEÇİLİ ARALIĞI yeniliyor,
                yalnızca bugünü değil.
            Üçüncü bir düğme, kullanıcıya hangisine basacağını sorduruyordu.
          */}
          <RefreshButton dateFrom={range.from} dateTo={range.to} rangeLabel={range.label} />
        </div>
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

          {/* İZLENMEYEN HESAPLAR SESSİZCE DÜŞMÜYOR.
              Kapatılan bir hesabın harcaması toplamdan çıkıyor ve sebebini
              görmeyen kullanıcı "harcama neden azaldı" diye sorar. Sayıyı
              yazmak o soruyu önceden cevaplıyor. */}
          {summary.hiddenAccounts > 0 && (
            <Notice tone="warn">
              <strong>{summary.hiddenAccounts} hesap izlenmiyor</strong> ve bu rakamlara dâhil
              değil. Verileri silinmedi — hesabı Platform Bağlantıları sayfasından yeniden
              izlemeye alırsan geçmişiyle birlikte geri gelir.
            </Notice>
          )}

          {isStale(summary.lastFetchedAt) && (
            <Notice tone="warn">
              Veriler {formatRelative(summary.lastFetchedAt)} güncellendi. Senkronizasyon
              worker&apos;ı çalışmıyor olabilir.
            </Notice>
          )}

          <Cards summary={summary} />
          <SecondaryStrip summary={summary} />

          {/* TEK GÜNLÜK ARALIKTA GRAFİK YOK.
              Bir gün için zaman serisi tek bir bar demek: kocaman boş bir
              kutuda hiçbir eğilim göstermeyen tek çubuk. Kartlar aynı bilgiyi
              daha okunur veriyor. Saat bazlı kırılım olsa anlamlı olurdu ama
              `insights_daily` günlük granülerlikte. */}
          {range.days > 1 &&
            (series === null ? (
              <Notice tone="error">Grafik verisi alınamadı.</Notice>
            ) : (
              <MetricsChart
                points={series}
                from={range.from}
                to={range.to}
                currency={summary.currency}
              />
            ))}

          {breakdown === null ? (
            <Notice tone="error">Dağılım verisi alınamadı.</Notice>
          ) : (
            <BreakdownTable
              rows={breakdown}
              level={level}
              tasinan={tasinan}
              currency={summary.currency}
            />
          )}

          <p className="text-xs text-ink-muted">
            Son güncelleme: {formatRelative(summary.lastFetchedAt)} · {summary.accountCount} reklam
            hesabı ·{' '}
            {/* Bu cümle KOŞULLU olmak zorunda. "Bugün" penceresi eklenmeden
                önce koşulsuzdu ve doğruydu; artık Bugün seçiliyken tam tersini
                söylüyor olurdu — ekranın kendi verisiyle çelişen bir açıklama,
                yanlış sayıdan daha çok güven kaybettirir. */}
            {range.incomplete
              ? 'Bugüne bakıyorsunuz — gün bitmediği için rakamlar artmaya devam edecek'
              : 'Bugün dâhil değil — tamamlanmamış bir gün tüm oranları aşağı çeker'}
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
      {/* ROAS YERİNE ERİŞİM — gelir takip edilmiyorsa.
          Lead formu ve mesajlaşma kampanyalarında gelir değeri hiç yok ve
          ROAS kartı sürekli "—" gösteriyor: bir kart boyunca yer kaplayıp
          hiçbir şey söylemiyor. Erişim o hesaplarda anlamlı bir dördüncü
          metrik. Gelir varsa ROAS geri geliyor — asıl karar metriği o. */}
      {summary.roas === null ? (
        <MetricCard
          label={summary.reachKind === 'exact' ? 'Erişim' : 'Günlük ort. erişim'}
          value={formatNumber(summary.reach)}
          hint={
            summary.reach === null
              ? 'platform bildirmiyor'
              : summary.reachAcrossAccounts
                ? 'hesaplar arası mükerrer olabilir'
                : summary.reachKind === 'daily_average'
                  ? 'tekil erişim toplanamaz'
                  : undefined
          }
        />
      ) : (
        <MetricCard label="ROAS" value={formatRoas(summary.roas)} change={changePercent(summary.roas, prev?.roas)} />
      )}
    </div>
  );
}

/** İkincil metrikler — bağlam veriyor, karar verdirmiyor. */
function SecondaryStrip({ summary }: { summary: MetricsSummary }) {
  const prev = summary.previous;
  const currency = summary.currency;

  return (
    <MetricStrip
      items={[
        {
          label: 'Gösterim',
          value: formatNumber(summary.impressions),
          change: changePercent(summary.impressions, prev?.impressions),
        },
        {
          label: 'Tık',
          value: formatNumber(summary.clicks),
          change: changePercent(summary.clicks, prev?.clicks),
        },
        {
          label: 'CTR',
          value: formatPercent(summary.ctr),
          change: summary.ctr === null ? null : changePercent(summary.ctr, prev?.ctr),
        },
        {
          label: 'CPC',
          value: formatMoney(microsOf(summary.cpc), currency),
          // Artış kötü: tık başına maliyet yükselmesi iyi haber değil.
          inverse: true,
          change: summary.cpc === null ? null : changePercent(summary.cpc, prev?.cpc),
        },
      ]}
    />
  );
}

/**
 * Platform sekmeleri.
 *
 * "Tümü" varsayılan çünkü bu ürünün ana vaadi iki platformu TEK ekranda
 * toplamak. Sekmeler o vaadi bozmuyor, derinleşme yolu açıyor: bir platformun
 * kampanyalarına odaklanmak istediğinde diğerinin gürültüsü kalkıyor.
 *
 * Seçim URL'de taşınıyor — sayfa sunucu bileşeni ve seçim için JS inmiyor;
 * ayrıca bağlantı paylaşılabilir oluyor.
 */
function PlatformTabs({
  current,
  tasinan,
}: {
  current: Platform | null;
  tasinan: Record<string, string | undefined>;
}) {
  const options: Array<{ key: Platform | null; label: string }> = [
    { key: null, label: 'Tümü' },
    { key: 'meta', label: 'Meta' },
    { key: 'google', label: 'Google' },
  ];
  return (
    <nav className="flex gap-1 rounded-lg bg-surface-sunken p-0.5" aria-label="Platform">
      {options.map((o) => {
        const active = current === o.key;
        return (
          <Link
            key={o.label}
            href={baglanti('/dashboard', tasinan, { platform: o.key ?? undefined })}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              active ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {o.label}
          </Link>
        );
      })}
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

/**
 * Platform parametresi.
 *
 * Bilinmeyen değer "tümü"ye düşüyor, hata vermiyor: URL elle düzenlenmiş
 * olabilir ve bir yazım hatası yüzünden panelin açılmaması abartı olurdu.
 */
function resolvePlatform(raw: string | undefined): Platform | null {
  return raw === 'meta' || raw === 'google' ? raw : null;
}

function resolveLevel(raw: string | undefined): MetricLevel {
  // `account` sekmesi YOK: hesap seviyesi zaten üstteki kartlar. Tabloda
  // göstermek aynı sayıyı iki kez göstermek olurdu.
  return METRIC_LEVELS.includes(raw as MetricLevel) && raw !== 'account'
    ? (raw as MetricLevel)
    : 'campaign';
}
