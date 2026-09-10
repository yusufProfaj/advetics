import Link from 'next/link';
import type {
  MetricLevel,
  Platform,
  MetricsBreakdownRow,
  MetricsClientRow,
  MetricsOrganizationRow,
  MetricsSummary,
  MetricsTimeseries,
} from '@advetics/shared';
import { METRIC_LEVELS, PLATFORMS } from '@advetics/shared';
import { PLATFORM_KISA_ADLARI } from '@advetics/shared';
import { requireSession } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
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
  microsOf,
} from '@/lib/format';
import { MetricCard } from '@/components/metric-card';
import { MetricStrip } from '@/components/metric-strip';
import { MetricsChart } from '@/components/metrics-chart';
import { BreakdownTable } from '@/components/breakdown-table';
import { MusteriTablosu } from '@/components/musteri-tablosu';
import { SirketTablosu } from '@/components/sirket-tablosu';
import { kirilimSirala, siralamaCoz } from '@/lib/kirilim-siralama';

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

/**
 * Kırılım tablosunun satır sınırı.
 *
 * SABİT BİR YERDE çünkü iki tüketicisi var: sorgu (`limit=`) ve tablo
 * (kesmeyi ekranda YAZAN not). İkisini ayrı yazmak, biri değişince notun
 * yanlış sayıyı söylemesi demekti — panelde "Üst sınır 10 MB" elle yazılıyken
 * tam olarak bu oldu.
 */
const KIRILIM_LIMITI = 25;

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
  const siralama = siralamaCoz(first(params.sirala));

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
    // Sıralama da TAŞINIYOR: seviye ya da platform değiştiren kullanıcının
    // seçtiği sütun düşerse süzgeç kaybolması hatasının aynısı olurdu.
    sirala: siralama,
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
  breakdownQs.set('limit', String(KIRILIM_LIMITI));

  // Bir uç noktanın düşmesi TÜM ekranı düşürmemeli: panel açılıp "veri
  // alınamadı" demeli, 500 sayfası göstermemeli.
  /*
   * ═══ EKRANIN ÜÇ KATMANI: AJANS › ŞİRKET › WORKSPACE ═══
   *
   * Genel Bakış artık hiyerarşiyi izliyor ve her katmanda BİR ALT KATMANI
   * listeliyor:
   *
   *   · Ajans kapsamında ("Tüm şirketler")  → ŞİRKET tablosu
   *   · Şirket kapsamında, workspace seçili değilse → WORKSPACE tablosu
   *   · Workspace seçiliyse → kampanya/reklam kırılımı
   *
   * ÖNCEDEN AJANS KATMANI YOKTU: "Tüm şirketler" seçildiğinde bütün
   * şirketlerin workspace'leri tek düz tabloda listeleniyordu ve hangi
   * satırın hangi şirkete ait olduğu HİÇBİR YERDE yazmıyordu — "Tüm
   * müşteriler"de kampanya listelenirken düzeltilen hatanın bir üst
   * katmandaki tekrarı.
   *
   * SIRA ÖNEMLİ: ajans kontrolü ÖNCE geliyor. `tumSirketler` modunda
   * `activeClientId` daima null ve `availableClients` bütün şirketlerin
   * workspace'lerini taşıyor, yani `mcc` koşulu da doğru olurdu ve ekran
   * yine düz workspace listesi gösterirdi.
   *
   * WORKSPACE KATMANININ KOŞULU AKTİF SEÇİM, kullanıcının rolü DEĞİL: tek
   * workspace'i olan bir şirkette de `activeClientId` null olabiliyor ve
   * orada tek satırlık bir workspace tablosu, kampanya listesinden daha az
   * şey söylerdi — o yüzden `> 1` koşulu duruyor.
   */
  /*
   * Hata mesajı `Promise.all` içinden YAZILIYOR: `allSettled`a çevirmek beş
   * dalın hepsinin sonucunu açmayı gerektirirdi ve buradaki soru tek —
   * "özet neden gelmedi".
   */
  let ozetHatasi: string | null = null;

  const ajansGorunumu = session.tumSirketler;
  const mcc =
    !ajansGorunumu && session.activeClientId === null && session.availableClients.length > 1;

  /*
   * ═══ HATA YUTULMUYOR — "Metrikler alınamadı" TEK BAŞINA BİR ŞEY SÖYLEMİYOR
   * ═══
   *
   * Bu çağrı `.catch(() => null)` ile susturuluyordu ve ekranda tek bir
   * cümle kalıyordu: "Metrikler alınamadı. API çalışıyor mu?" Kullanıcı
   * ajans görünümünde bu ekranı gördü, şirket görünümünde görmedi ve
   * SEBEBİ HİÇBİR YERDE YAZMIYORDU — teşhis için sunucu loguna bakmak
   * gerekiyordu. Bu depoda adı konmuş yasağın ta kendisi.
   *
   * Sebep artık platformun KENDİ cümlesiyle ekranda; sayfa yine açılıyor.
   */
  const [summary, series, breakdown, musteriler, sirketler] = await Promise.all([
    serverApiFetch<MetricsSummary>(`/metrics/summary?${base}`).catch((e: unknown) => {
      ozetHatasi = hataMetni(e);
      return null;
    }),
    // Tek günlük aralıkta grafik çizilmiyor; sorguyu da atlıyoruz.
    range.days > 1
      ? serverApiFetch<MetricsTimeseries>(`/metrics/timeseries?${base}`).catch(() => null)
      : Promise.resolve<MetricsTimeseries>({ points: [], previous: null }),
    // Üst katman görünümlerinde kampanya tablosu ÇEKİLMİYOR: gösterilmeyecek
    // bir sorguyu koşmak, en ağır sorgusu boşa giden bir ekran demekti.
    mcc || ajansGorunumu
      ? Promise.resolve(null)
      : serverApiFetch<MetricsBreakdownRow[]>(`/metrics/breakdown?${breakdownQs}`).catch(
          () => null,
        ),
    mcc
      ? serverApiFetch<MetricsClientRow[]>(`/metrics/clients?${base}`).catch(() => null)
      : Promise.resolve(null),
    ajansGorunumu
      ? serverApiFetch<MetricsOrganizationRow[]>(`/metrics/organizations?${base}`).catch(
          () => null,
        )
      : Promise.resolve(null),
  ]);

  const activeClient = session.availableClients.find((c) => c.id === session.activeClientId);
  /*
   * BAŞLIK GÖVDEYLE AYNI ŞEYİ SÖYLEMEK ZORUNDA. Ajans kapsamında "Tüm
   * workspace'ler" yazmak, tablo ŞİRKET listelerken başlığın başka bir
   * katmandan bahsetmesi olurdu; bu depoda başlık≠gövde ayrışması bir kez
   * "veri sızıntısı" sanıldı.
   */
  const scopeLabel = ajansGorunumu
    ? 'Tüm şirketler'
    : (activeClient?.name ?? 'Tüm workspace’ler');

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
          <strong>Metrikler alınamadı.</strong>
          {ozetHatasi && <span className="ml-1">{ozetHatasi}</span>}
          <span className="ml-1">
            Sorun sürerse{' '}
            <code className="rounded bg-surface-sunken px-1">pm2 logs advetics-api</code> çıktısına
            bakın.
          </span>
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

          <Cards summary={summary} karsilastir={range.karsilastirma !== 'yok'} />
          <SecondaryStrip summary={summary} karsilastir={range.karsilastirma !== 'yok'} />

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
                points={series.points}
                previous={series.previous}
                from={range.from}
                to={range.to}
                compareFrom={range.compareFrom}
                compareTo={range.compareTo}
                currency={summary.currency}
              />
            ))}

          {ajansGorunumu ? (
            sirketler === null ? (
              <Notice tone="error">Şirket dağılımı alınamadı.</Notice>
            ) : (
              <SirketTablosu rows={sirketler} karsilastir={range.karsilastirma !== 'yok'} />
            )
          ) : mcc ? (
            musteriler === null ? (
              <Notice tone="error">Workspace dağılımı alınamadı.</Notice>
            ) : (
              <MusteriTablosu rows={musteriler} karsilastir={range.karsilastirma !== 'yok'} />
            )
          ) : breakdown === null ? (
            <Notice tone="error">Dağılım verisi alınamadı.</Notice>
          ) : (
            <BreakdownTable
              /*
               * SIRALAMA BURADA UYGULANIYOR, SORGUDA DEĞİL. Satır kümesi her
               * zaman "harcamaya göre ilk N"; `ORDER BY`ı SQL'e taşımak
               * kümeyi de değiştirirdi ve "mecraya göre sırala" diyen
               * kullanıcı bir platformu tabloda HİÇ göremezdi.
               */
              rows={kirilimSirala(breakdown, siralama)}
              level={level}
              tasinan={tasinan}
              currency={summary.currency}
              siralama={siralama}
              limit={KIRILIM_LIMITI}
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

function Cards({
  summary,
  karsilastir,
}: {
  summary: MetricsSummary;
  karsilastir: boolean;
}) {
  /*
   * KARŞILAŞTIRMA KAPALIYSA DELTA DA YOK.
   *
   * Sunucu geriye dönük uyum için önceki dönemi yine döndürüyor (rapor bu
   * ucu parametresiz çağırıyor). Onu ekranda göstermek, seçicide "Karşılaştır
   * kapalı" yazarken kartlarda yüzde değişim basmak demek olurdu — düğme
   * yaptığını söylemeyen bir düğme olurdu.
   */
  const prev = karsilastir ? summary.previous : null;
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
function SecondaryStrip({
  summary,
  karsilastir,
}: {
  summary: MetricsSummary;
  karsilastir: boolean;
}) {
  const prev = karsilastir ? summary.previous : null;
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
  /*
   * SEKMELER `PLATFORMS`TAN. Elle yazılıydı ve tuhaf bir hâl üretiyordu:
   * `resolvePlatform` LinkedIn'i URL'den ÇÖZÜYOR ama tıklanacak sekme YOK —
   * yani özellik var, girişi yok.
   */
  const options: Array<{ key: Platform | null; label: string }> = [
    { key: null, label: 'Tümü' },
    ...PLATFORMS.map((p) => ({ key: p as Platform | null, label: PLATFORM_KISA_ADLARI[p] })),
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
/** Hata mesajını çıkarır — platformun kendi cümlesi ekranda görünmeli. */
function hataMetni(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı.';
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
  /*
   * LİSTEDEN ÇÖZÜLÜYOR, ELLE DALLANMIYOR.
   *
   * Burada `raw === 'meta' || raw === 'google'` yazıyordu ve üçüncü platform
   * eklenince en can sıkıcı hâli üretecekti: LinkedIn süzgecini seçen
   * kullanıcı bilinmeyen değer sayılıp SESSİZCE "tümü"ye dönerdi. Hata yok,
   * uyarı yok — sadece yanlış rakamlar. CLAUDE.md'deki "süzgeç bazen
   * kayboluyor" hatasının aynısı.
   */
  return PLATFORMS.find((p) => p === raw) ?? null;
}

function resolveLevel(raw: string | undefined): MetricLevel {
  // `account` sekmesi YOK: hesap seviyesi zaten üstteki kartlar. Tabloda
  // göstermek aynı sayıyı iki kez göstermek olurdu.
  return METRIC_LEVELS.includes(raw as MetricLevel) && raw !== 'account'
    ? (raw as MetricLevel)
    : 'campaign';
}
