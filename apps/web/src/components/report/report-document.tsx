import type {
  ConversionCounts,
  MetricTotals,
  ReportCampaignRow,
  ReportData,
  ReportPlatformBlock,
} from '@advetics/shared';
import {
  COLUMN_LABELS,
  CONVERSION_BUCKETS,
  DEFAULT_COLUMNS,
  METRIC_LABELS,
  resolveColumns,
  sumRows,
  COLUMN_TOTALS,
  type ColumnKey,
} from '@advetics/shared';
import type { ReactNode } from 'react';
import { formatDayLong, formatMoney, formatNumber, formatPercent, microsOf } from '@/lib/format';
import { ConversionChart } from './conversion-chart';

/**
 * Rapor belgesi — YAZDIRMAYA HAZIR.
 *
 * Ekranda okunabilir, `Ctrl+P` ile PDF'e basılabilir. Sunucu tarafı PDF
 * üretimi (Puppeteer/Chrome) kasıtlı olarak YOK: o sunucuda 11 canlı site var
 * ve headless Chrome 200-300 MB RAM demek. Yazdırma CSS'i sayfa sonlarını,
 * kenar boşluklarını ve renk basımını ayarlıyor.
 *
 * Marka renkleri `branding_profiles`tan geliyor ve satır içi CSS değişkeni
 * olarak basılıyor — Tailwind sınıfları derleme anında sabit, müşteri bazlı
 * renk ancak çalışma anında enjekte edilebilir.
 *
 * Bölüm sırası ŞABLONDAN geliyor. Bileşen kendi sırasını dayatmıyor: ajans
 * bir müşteride anahtar kelimeleri öne, diğerinde hiç göstermek istemeyebilir.
 */
export function ReportDocument({ data }: { data: ReportData }) {
  const { branding } = data;

  return (
    <>
      {/* Marka renkleri + yazdırma kuralları. Satır içi çünkü değerler
          çalışma anında müşteriden geliyor. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            .rpt {
              --rpt-brand: ${escapeCss(branding.primaryColor)};
              --rpt-accent: ${escapeCss(branding.accentColor)};
            }
            @media print {
              /* Her bölüm yeni sayfada — referans belgede de böyle. */
              .rpt-page { break-before: page; }
              .rpt-page:first-of-type { break-before: auto; }
              /* Tablo satırı iki sayfaya BÖLÜNMESİN: yarım satır okunamaz. */
              .rpt tr, .rpt .rpt-card { break-inside: avoid; }
              /* Tarayıcı varsayılanı arka planları basmıyor; marka rengi ve
                 vurgular kaybolurdu. */
              .rpt { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .rpt-noprint { display: none !important; }
            }
            @page { margin: 14mm; }
          `,
        }}
      />

      <div className="rpt mx-auto max-w-[880px] bg-white px-8 py-10 text-slate-900 print:px-0 print:py-0">
        {data.sections.map((section) => {
          switch (section) {
            case 'cover':
              return <Cover key={section} data={data} />;
            case 'summary':
              return <Summary key={section} data={data} />;
            case 'meta_campaigns':
              return (
                <CampaignPage
                  key={section}
                  title="Kampanyalar"
                  platform="Meta Ads"
                  rows={data.metaCampaigns}
                  currency={data.currency}
                  rangeDays={data.rangeDays}
                  daily={data.daily}
                  from={data.from}
                  to={data.to}
                  secim={data.options.meta_campaigns?.metrics}
                  varsayilan={DEFAULT_COLUMNS.meta_campaigns}
                />
              );
            case 'google_campaigns':
              return (
                <CampaignPage
                  key={section}
                  title="Kampanyalar"
                  platform="Google Ads"
                  rows={data.googleCampaigns}
                  currency={data.currency}
                  rangeDays={data.rangeDays}
                  secim={data.options.google_campaigns?.metrics}
                  varsayilan={DEFAULT_COLUMNS.google_campaigns}
                />
              );
            case 'google_keywords':
              return <Keywords key={section} data={data} />;
            case 'google_search_terms':
              return <SearchTerms key={section} data={data} />;
            case 'top_ads':
              return <TopAds key={section} data={data} />;
            case 'closing':
              return <Closing key={section} data={data} />;
            default:
              return null;
          }
        })}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Bölümler                                                                    */
/* -------------------------------------------------------------------------- */

function Cover({ data }: { data: ReportData }) {
  return (
    <section className="rpt-page flex min-h-[70vh] flex-col justify-between print:min-h-[240mm]">
      <div className="flex items-start justify-between gap-6">
        <DateBadge from={data.from} to={data.to} />
        {/*
          ADVETICS LOGOSU — ajansın kendi logosu DEĞİL.
          Kapakta her zaman bu basılıyor; `branding.logoUrl` panel arayüzünde
          kullanılmaya devam ediyor ama rapor kapağında kullanılmıyor. Beyaz
          etiket vaadinden bilinçli bir sapma.

          Dosya `public/` altından: PDF'teki kopyasıyla AYNI dosya olmak
          zorunda, yoksa ekran ile belge farklı logo gösterir
          (`marka-logosu.spec.ts` bunu yakalıyor).
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/advetics-logo.png" alt="Advetics" className="max-h-12 max-w-[170px] object-contain" />
      </div>

      <div className="py-16">
        <h1 className="text-[52px] font-bold uppercase leading-[0.95] tracking-tight text-slate-900">
          {data.title.split(' ').map((word, i) => (
            <span key={i} className="block">
              {word}
            </span>
          ))}
        </h1>
        <p
          className="mt-6 text-2xl font-semibold"
          style={{ color: 'var(--rpt-brand)' }}
        >
          {data.client.name}
        </p>
      </div>

      <div className="h-1.5 w-24 rounded-full" style={{ background: 'var(--rpt-brand)' }} />
    </section>
  );
}

function Summary({ data }: { data: ReportData }) {
  const blocks = [...data.platforms, ...(data.total ? [data.total] : [])];

  return (
    <section className="rpt-page pt-10">
      <PageHead title="Reklam Özet Raporu" subtitle={platformNames(data)} data={data} />

      {blocks.length === 0 ? (
        <Empty>Bu dönemde harcama kaydı yok.</Empty>
      ) : (
        <div className="mt-6 grid gap-4">
          {blocks.map((block) => (
            <SummaryBlock key={block.label} block={block} currency={data.currency} />
          ))}
        </div>
      )}

      {/* EKSİK DÖNEM UYARISI — belgenin kendisinde.
          Panelde uyarı görmek yetmiyor: müşteriye giden PDF'te de yazmalı,
          yoksa alan kişi elindeki belgenin tam ayı kapsadığını sanıyor. */}
      {!coversWholeMonth(data.from, data.to) && (
        <Note>
          Bu rapor <strong>{formatDayLong(data.from)} — {formatDayLong(data.to)}</strong> arasını
          kapsar; ay tamamlanmadan hazırlanmıştır. Devam eden günün verisi gün içinde
          değiştiği için dâhil edilmemiştir.
        </Note>
      )}

      {data.currency === null && data.platforms.length > 1 && (
        <Note>
          Hesaplar farklı para birimlerinde olduğu için genel toplam
          birleştirilmedi. Tutarlar platform bazında ayrı verilmiştir.
        </Note>
      )}

      <Footnotes keys={['cpa']} />
    </section>
  );
}

function SummaryBlock({
  block,
  currency,
}: {
  block: ReportPlatformBlock;
  currency: string | null;
}) {
  const isTotal = block.label === 'TOPLAM';
  const money = currency ?? block.currency;

  return (
    <div
      className={`rpt-card rounded-xl border p-5 ${
        isTotal ? 'border-transparent text-white' : 'border-slate-200 bg-white'
      }`}
      style={isTotal ? { background: 'var(--rpt-brand)' } : undefined}
    >
      <p
        className={`text-xs font-bold uppercase tracking-[0.12em] ${
          isTotal ? 'text-white/85' : 'text-slate-500'
        }`}
      >
        {block.label}
      </p>
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
        <Stat label="Maliyet" value={formatMoney(block.spendMicros, money)} dark={isTotal} big />
        <Stat label="Gösterim" value={formatNumber(block.impressions)} dark={isTotal} />
        <Stat label="Tıklama" value={formatNumber(block.clicks)} dark={isTotal} />
        <Stat label="Dönüşüm" value={formatNumber(block.conversions)} dark={isTotal} />
        <Stat
          label={METRIC_LABELS.cpa.label}
          value={formatMoney(microsOf(block.cpa), money)}
          dark={isTotal}
        />
      </dl>
      <BucketLine counts={block.conversionCounts} dark={isTotal} />
    </div>
  );
}

/**
 * ═══ KAMPANYA TABLOSU SÜTUNLARI — TEK KAYIT DEFTERİ ═══
 *
 * Başlık satırı, gövde hücreleri, TOPLAM satırı ve dipnotlar bir süre AYRI
 * AYRI elle eşleniyordu ve tek bir bayrakla (`showBuckets`) iki sabit sete
 * dallanıyordu. Üç yerde elle eşlenen bir liste, birinin güncellenmemesi
 * hâlinde tablo başlığı ile toplam satırının sessizce ayrışması demek — ve
 * TypeScript bunu söylemiyor, çünkü hepsi ayrı JSX blokları.
 *
 * Artık her sütun BİR KEZ tanımlı: nasıl okunacağı, nasıl toplanacağı ve
 * dipnot gerektirip gerektirmediği. Şablondan gelen seçim bu defterden
 * sütunları seçiyor.
 */
interface Sutun {
  /** Sağa hizalı sayı sütunu mu (ad sütunu hariç hepsi öyle). */
  hucre: (r: ReportCampaignRow, money: string | null) => ReactNode;
  /**
   * TOPLAM satırındaki değer. `null` = TOPLANAMAZ.
   *
   * Erişim tekil kişi sayısı ve günler arasında toplanamıyor; oraya bir sayı
   * yazmak uydurma olurdu. "—" basılıyor.
   */
}

const SUTUNLAR: Record<ColumnKey, Sutun> = {
  spend: {
    hucre: (r, m) => formatMoney(r.spendMicros, m, { decimals: 2 }),
  },
  impressions: {
    hucre: (r) => formatNumber(r.impressions),
  },
  clicks: { hucre: (r) => formatNumber(r.clicks) },
  reach: {
    hucre: (r) => (
      <>
        {formatNumber(r.reach)}
        {r.reachIsDailyAverage && <span className="text-slate-400">*</span>}
      </>
    ),
  },
  ctr: { hucre: (r) => formatPercent(r.ctr) },
  cpc: {
    hucre: (r, m) => formatMoney(microsOf(r.cpc), m),
  },
  cpa: {
    hucre: (r, m) => formatMoney(microsOf(r.cpa), m),
  },
  conversions: {
    hucre: (r) => formatNumber(r.conversions),
  },
  form: {
    hucre: (r) => formatNumber(r.conversionCounts.form),
  },
  message: {
    hucre: (r) => formatNumber(r.conversionCounts.message),
  },
  purchase: {
    hucre: (r) => formatNumber(r.conversionCounts.purchase),
  },
};

function CampaignPage({
  title,
  platform,
  rows,
  currency,
  rangeDays,
  daily,
  from,
  to,
  secim,
  varsayilan,
}: {
  title: string;
  platform: string;
  rows: ReportCampaignRow[];
  currency: string | null;
  rangeDays: number;
  daily?: ReportData['daily'];
  from?: string;
  to?: string;
  /** Şablondan gelen sütun seçimi; yoksa `varsayilan` kullanılıyor. */
  secim?: ColumnKey[];
  varsayilan: readonly ColumnKey[];
}) {
  if (rows.length === 0) {
    return (
      <section className="rpt-page pt-10">
        <PageHead title={title} subtitle={platform} />
        <Empty>Bu dönemde {platform} verisi yok.</Empty>
      </section>
    );
  }

  const sutunlar = resolveColumns(secim, varsayilan);
  const totals = sumRows(rows);
  // Karışık para biriminde `currency` null geliyor ve `formatMoney` sembol
  // basmıyor — tek bir sembol göstermek yanlış olurdu.
  const money = currency;
  // Erişim en az bir satırda günlük ortalamaysa dipnot gerekiyor.
  const anyAverage = rows.some((r) => r.reachIsDailyAverage);

  // EKSİK KAPSAMA. Yeni senkronize edilmiş bir kampanya aralığın yalnızca bir
  // kısmını kapsıyor ve harcaması düşük görünüyor — müşteri bunu "bu kampanya
  // çalışmamış" diye okuyor. Farkı göstermeden rapor göndermek yanıltıcı.
  //
  // Eşik yarım aralık: bir iki günlük eksik veri normal (gün dönümü, geri
  // düzeltme), yarısından azı ise gerçek bir boşluk.
  const partial = rows.filter((r) => r.dayCount > 0 && r.dayCount < rangeDays / 2);

  return (
    <section className="rpt-page pt-10">
      <PageHead title={title} subtitle={platform} />

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-slate-300 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
              <th className="py-2 pr-3">Kampanya Adı</th>
              {sutunlar.map((k) => (
                <th key={k} className="px-2 py-2 text-right">
                  {COLUMN_LABELS[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100">
                <td className="max-w-[220px] py-2.5 pr-3 font-medium">
                  <span className="block truncate" title={r.name}>
                    {r.name}
                    {r.dayCount > 0 && r.dayCount < rangeDays / 2 && (
                      <span
                        className="ml-1 align-middle text-[10px] font-semibold text-amber-600"
                        title={`Yalnızca ${r.dayCount} günlük veri var`}
                      >
                        †
                      </span>
                    )}
                  </span>
                </td>
                {sutunlar.map((k) => (
                  <td
                    key={k}
                    className={`px-2 py-2.5 text-right tabular-nums ${
                      k === 'spend' ? 'font-semibold' : ''
                    }`}
                  >
                    {SUTUNLAR[k].hucre(r, money)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td className="py-2.5 pr-3 text-[11px] uppercase tracking-wide text-slate-500">
                Genel toplam
              </td>
              {/*
                TOPLAM SATIRI BAŞLIKLARLA AYNI LİSTEDEN. Ayrı yazıldığında
                sütun eklenip toplamı eklenmeyince tablo sessizce kayıyordu.
                `toplam === null` olan sütun (erişim) "—" basıyor: tekil kişi
                sayısı günler arasında toplanamaz.
              */}
              {sutunlar.map((k) => {
                const t = COLUMN_TOTALS[k];
                return (
                  <td
                    key={k}
                    className={`px-2 py-2.5 text-right ${
                      t === null ? 'text-slate-400' : 'tabular-nums'
                    }`}
                  >
                    {t === null ? '—' : t(totals, money)}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {daily && daily.length > 1 && from && to && (
        <div className="mt-8">
          <ConversionChart points={daily} from={from} to={to} />
        </div>
      )}

      {/*
        DİPNOTLAR DA AYNI LİSTEDEN. Eskiden her çağrı yerinde elle yazılıydı:
        tabloda olmayan bir metriğin dipnotu basılıyor, olan birininki
        eksik kalıyordu.
      */}
      <Footnotes
        keys={sutunlar.filter((k): k is keyof typeof METRIC_LABELS => k in METRIC_LABELS)}
        buckets={sutunlar.some((k) => k === 'form' || k === 'message')}
        extra={[
          anyAverage
            ? '* Erişim tekil kişi sayısıdır ve günler arasında toplanamaz; bu sütun günlük ortalamayı gösterir.'
            : null,
          partial.length > 0
            ? `† Bu kampanyaların raporlanan dönemde yalnızca bir bölümü ölçülmüştür (${partial
                .map((r) => `${r.dayCount}/${rangeDays} gün`)
                .join(', ')}); rakamlar tüm dönemi temsil etmez.`
            : null,
        ]
          .filter((v): v is string => v !== null)
          .join('\n')}
      />
    </section>
  );
}

function Keywords({ data }: { data: ReportData }) {
  return (
    <section className="rpt-page pt-10">
      <PageHead title="Anahtar Kelime Performansı" subtitle="Google Ads" />
      {data.keywords === null ? (
        // "Veri yok" DEĞİL "bu yetenek henüz yok". Boş tablo göstermek
        // müşteriye "anahtar kelimen yok" demek olurdu.
        <Note>
          Anahtar kelime verisi henüz toplanmıyor. Google Ads API erişimi
          onaylandığında bu bölüm otomatik olarak dolacak.
        </Note>
      ) : data.keywords.length === 0 ? (
        <Empty>Bu dönemde anahtar kelime verisi yok.</Empty>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-slate-300 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                <th className="py-2 pr-3">Anahtar Kelime</th>
                <th className="px-2 py-2 text-right">Harcama</th>
                <th className="px-2 py-2 text-right">Gösterim</th>
                <th className="px-2 py-2 text-right">Tıklama</th>
                <th className="px-2 py-2 text-right">{METRIC_LABELS.ctr.label}</th>
                <th className="py-2 pl-2 text-right">{METRIC_LABELS.cpc.label}</th>
              </tr>
            </thead>
            <tbody>
              {data.keywords.map((k) => (
                <tr key={k.keyword} className="border-b border-slate-100">
                  <td className="py-2.5 pr-3">{k.keyword}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {formatMoney(k.spendMicros, data.currency, { decimals: 2 })}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">
                    {formatNumber(k.impressions)}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatNumber(k.clicks)}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums">{formatPercent(k.ctr)}</td>
                  <td className="py-2.5 pl-2 text-right tabular-nums">
                    {formatMoney(microsOf(k.cpc), data.currency)}
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

/**
 * ARAMA TERİMLERİ — kullanıcının gerçekten YAZDIĞI sorgular.
 *
 * Anahtar kelime bizim hedeflediğimiz şey; bu, kullanıcının yazdığı şey.
 * Fark paranın nereye gittiğini gösteriyor: geniş eşlemeli bir kelime hiç
 * istemediğimiz sorgulara da gösterim alabiliyor.
 */
function SearchTerms({ data }: { data: ReportData }) {
  return (
    <section className="rpt-page pt-10">
      <PageHead title="Arama Terimleri" subtitle="Google Ads" />
      {data.searchTerms === null ? (
        // "Veri yok" DEĞİL "bu yetenek yok": Google bağlantısı olmayan bir
        // müşteride arama terimi diye bir şey yok.
        <Empty>Bu müşteride Google Ads bağlantısı bulunmuyor.</Empty>
      ) : data.searchTerms.length === 0 ? (
        <Empty>Bu dönemde arama terimi verisi yok.</Empty>
      ) : (
        <>
          <p className="mt-4 text-xs text-slate-500">
            Kullanıcıların arama kutusuna yazdığı sorgular.{' '}
            <span className="font-semibold text-amber-600">†</span> işaretli olanlar
            henüz anahtar kelime ya da negatif olarak tanımlı değil.
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300 text-left text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                  <th className="py-2 pr-3">Arama Terimi</th>
                  <th className="px-2 py-2">Eşleşen Kelime</th>
                  <th className="px-2 py-2 text-right">Harcama</th>
                  <th className="px-2 py-2 text-right">Tıklama</th>
                  <th className="px-2 py-2 text-right">{METRIC_LABELS.ctr.label}</th>
                  <th className="py-2 pl-2 text-right">Dönüşüm</th>
                </tr>
              </thead>
              <tbody>
                {data.searchTerms.map((t) => (
                  <tr key={t.term} className="border-b border-slate-100">
                    <td className="max-w-[220px] py-2.5 pr-3 font-medium">
                      <span className="block truncate" title={t.term}>
                        {/*
                          TANIMSIZ TERİM İŞARETLENİYOR. `NONE` olan bir terim
                          para harcıyor ama ne anahtar kelime ne negatif
                          olarak tanımlı — raporun en eyleme dönük satırı bu.
                        */}
                        {t.status === 'NONE' && (
                          <span
                            className="mr-1 align-middle text-[10px] font-semibold text-amber-600"
                            title="Anahtar kelime ya da negatif olarak tanımlı değil"
                          >
                            †
                          </span>
                        )}
                        {t.term}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-slate-500">{t.keyword ?? '—'}</td>
                    <td className="px-2 py-2.5 text-right font-semibold tabular-nums">
                      {formatMoney(t.spendMicros, data.currency, { decimals: 2 })}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">
                      {formatNumber(t.clicks)}
                    </td>
                    <td className="px-2 py-2.5 text-right tabular-nums">{formatPercent(t.ctr)}</td>
                    <td className="py-2.5 pl-2 text-right tabular-nums">
                      {formatNumber(t.conversions)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Footnotes keys={['ctr']} />
        </>
      )}
    </section>
  );
}

const PLATFORM_ADI: Record<string, string> = { meta: 'Meta Ads', google: 'Google Ads' };

/**
 * Sayfa sırası — raporun geri kalanıyla AYNI (özet blokları, kampanya
 * tabloları). Ayrılırsa okuyan aynı belgede iki farklı düzenle karşılaşır.
 */
const PLATFORM_SIRASI = ['meta', 'google'] as const;

/**
 * ÖNE ÇIKAN REKLAMLAR — PLATFORM BAŞINA AYRI SAYFA.
 *
 * Tek listede karışık gösterildiğinde harcaması büyük olan platform listeyi
 * tamamen dolduruyordu: Google'ın en iyi reklamı Meta'nın altında hiç
 * görünmüyordu. Rapor iki platformu her yerde ayrı anlatıyor, bu bölüm de öyle.
 *
 * Reklamı olmayan platform için sayfa AÇILMIYOR — boş bir sayfa "burada bir
 * şey olacaktı" izlenimi bırakır. Eksikliğin sebebi ilk sayfanın üstünde.
 */
function TopAds({ data }: { data: ReportData }) {
  const eksik = data.topAdsMissingPlatforms;
  const platformlar = PLATFORM_SIRASI.filter((pf) =>
    data.topAds.some((a) => a.platform === pf),
  );

  if (platformlar.length === 0) {
    // Hiç reklam yoksa TEK sayfa: eksikliğin sebebini yazacak bir yer lazım.
    return eksik.length === 0 ? null : <TopAdsSayfasi data={data} platform={null} ilk />;
  }

  return (
    <>
      {platformlar.map((pf, i) => (
        <TopAdsSayfasi key={pf} data={data} platform={pf} ilk={i === 0} />
      ))}
    </>
  );
}

/**
 * METİN REKLAMI ÖNİZLEMESİ — Google arama reklamının "kreatifi".
 *
 * Arama reklamının görseli yok ve olmayacak; onu anlatan şey METNİ.
 * Öncesinde yerine boş bir gri kutu duruyordu ve raporu okuyan reklamın ne
 * dediğini göremiyordu — kutu "burada bir görsel olacaktı" gibi görünüyordu.
 *
 * Gerçek arama sonucunun yapısı taklit ediliyor: "Reklam" rozeti, görünen
 * adres, başlık, açıklama. Uydurma yok — hepsi `creatives` tablosundan
 * geliyor ve olmayan alan çizilmiyor.
 */
function MetinReklamiOnizleme({ ad }: { ad: ReportData['topAds'][number] }) {
  return (
    <div className="w-40 shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <p className="text-[9px] font-bold text-slate-600">Reklam</p>
      {ad.displayUrl && (
        <p className="truncate text-[9px] text-slate-500">{ad.displayUrl}</p>
      )}
      <p
        className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-tight"
        style={{ color: 'var(--rpt-brand)' }}
      >
        {ad.headline ?? ad.name}
      </p>
      {ad.description && (
        <p className="mt-1 line-clamp-3 text-[9px] leading-snug text-slate-600">
          {ad.description}
        </p>
      )}
    </div>
  );
}

function TopAdsSayfasi({
  data,
  platform,
  ilk,
}: {
  data: ReportData;
  platform: (typeof PLATFORM_SIRASI)[number] | null;
  ilk: boolean;
}) {
  const eksik = ilk ? data.topAdsMissingPlatforms : [];
  const reklamlar = platform
    ? data.topAds.filter((a) => a.platform === platform)
    : data.topAds;

  return (
    <section className="rpt-page pt-10">
      <PageHead
        title="Öne Çıkan Reklamlar"
        subtitle={platform ? PLATFORM_ADI[platform]! : 'En yüksek harcamaya göre'}
      />

      {/*
        EKSİK PLATFORM LİSTENİN ÜSTÜNDE.

        Bölüm harcamaya göre sıralıyor ve platform ayırmıyor; bir platformun
        reklam seviyesi satırı hiç yoksa liste sessizce yalnızca diğerini
        gösteriyor ve okuyan "Meta'nın öne çıkan reklamı yokmuş" diye anlıyor.
        Doğrusu "o dönemde Meta için reklam seviyesi veri toplanmadı" ve bu,
        listeyi okumadan ÖNCE bilinmesi gereken bir kısıt.
      */}
      {eksik.length > 0 && (
        <Note>
          <strong>{eksik.map((p) => PLATFORM_ADI[p] ?? p).join(' ve ')}</strong> için bu dönemde
          reklam seviyesi veri yok — geçmiş çekimi kampanya seviyesinde yapılıyor, reklam
          kırılımı yalnızca son günler için toplanıyor. Aşağıdaki liste bu yüzden diğer
          platformu gösteriyor.
        </Note>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {reklamlar.map((ad) => (
          <div key={ad.id} className="rpt-card flex gap-4 rounded-xl border border-slate-200 p-4">
            {ad.imageUrl ? (
              <div className="aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={ad.imageUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <MetinReklamiOnizleme ad={ad} />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[11px] uppercase tracking-wide text-slate-500">
                {ad.campaignName}
              </p>
              <p className="mt-0.5 line-clamp-2 text-sm font-semibold">
                {ad.headline ?? ad.name}
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <Stat label="Harcama" value={formatMoney(ad.spendMicros, data.currency)} />
                <Stat label="Dönüşüm" value={formatNumber(ad.conversions)} />
                <Stat label={METRIC_LABELS.ctr.label} value={formatPercent(ad.ctr)} />
                <Stat
                  label={METRIC_LABELS.cpa.label}
                  value={formatMoney(microsOf(ad.cpa), data.currency)}
                />
              </dl>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Closing({ data }: { data: ReportData }) {
  return (
    <section className="rpt-page flex min-h-[50vh] flex-col items-center justify-center pt-10 text-center print:min-h-[200mm]">
      <h2 className="text-4xl font-bold uppercase tracking-tight">Teşekkür Ederiz</h2>
      {data.closingText && (
        <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-600">{data.closingText}</p>
      )}
      <div
        className="mt-8 h-1.5 w-16 rounded-full"
        style={{ background: 'var(--rpt-brand)' }}
      />
      <div className="mt-10 text-xs text-slate-400">
        {data.branding.footerText && <p>{data.branding.footerText}</p>}
        {!data.branding.hidePoweredBy && <p className="mt-1">Advetics ile hazırlanmıştır</p>}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Parçalar                                                                    */
/* -------------------------------------------------------------------------- */

function PageHead({
  title,
  subtitle,
  data,
}: {
  title: string;
  subtitle: string;
  data?: ReportData;
}) {
  return (
    <header className="flex items-end justify-between gap-4 border-b border-slate-200 pb-3">
      <div>
        <h2 className="text-2xl font-bold uppercase tracking-tight">{title}</h2>
        <p
          className="mt-0.5 text-sm font-semibold uppercase tracking-wide"
          style={{ color: 'var(--rpt-brand)' }}
        >
          {subtitle}
        </p>
      </div>
      {data && <DateBadge from={data.from} to={data.to} />}
    </header>
  );
}

function DateBadge({ from, to }: { from: string; to: string }) {
  return (
    <span className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-500">
      {formatDayLong(from)} — {formatDayLong(to)}
    </span>
  );
}

function Stat({
  label,
  value,
  dark = false,
  big = false,
}: {
  label: string;
  value: string;
  dark?: boolean;
  big?: boolean;
}) {
  return (
    <div>
      <dt
        className={`text-[10px] font-semibold uppercase tracking-wide ${
          dark ? 'text-white/75' : 'text-slate-500'
        }`}
      >
        {label}
      </dt>
      <dd
        className={`tabular-nums ${big ? 'text-xl font-bold' : 'text-sm font-semibold'} ${
          dark ? 'text-white' : 'text-slate-900'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

/**
 * Dönüşüm kovaları satırı.
 *
 * Hepsi sıfırsa hiç gösterilmiyor: "Form 0 · Mesaj 0 · Satış 0" satırı yer
 * kaplayıp bilgi taşımıyor ve müşteriye başarısızlık gibi okunuyor. Tek
 * "Dönüşüm" sayısı zaten yukarıda.
 */
function BucketLine({ counts, dark = false }: { counts: ConversionCounts; dark?: boolean }) {
  const shown = (Object.keys(CONVERSION_BUCKETS) as Array<keyof typeof CONVERSION_BUCKETS>).filter(
    (k) => counts[k] > 0,
  );
  if (shown.length === 0) return null;

  return (
    <p className={`mt-3 text-xs ${dark ? 'text-white/85' : 'text-slate-600'}`}>
      {shown.map((k, i) => (
        <span key={k}>
          {i > 0 && <span className={dark ? 'text-white/40' : 'text-slate-300'}> · </span>}
          <span className="font-semibold">{CONVERSION_BUCKETS[k].label}:</span>{' '}
          <span className="tabular-nums">{formatNumber(counts[k])}</span>
        </span>
      ))}
    </p>
  );
}

/**
 * Metrik tanımları.
 *
 * Referans belgede her sayfanın altında var ve bu iyi bir alışkanlık: müşteri
 * EBM'nin ne olduğunu hatırlamak zorunda kalmıyor, kısaltmanın yanında tanımı
 * duruyor.
 */
function Footnotes({
  keys,
  extra,
  buckets = false,
}: {
  keys: Array<keyof typeof METRIC_LABELS>;
  extra?: string;
  buckets?: boolean;
}) {
  const lines = keys
    .map((k) => {
      const m = METRIC_LABELS[k];
      return 'hint' in m && m.hint ? `${m.label} (${m.tr}): ${m.hint}` : null;
    })
    .filter((v): v is string => v !== null);

  if (buckets) {
    lines.push(`Form: ${CONVERSION_BUCKETS.form.hint}`);
    lines.push(`Mesaj: ${CONVERSION_BUCKETS.message.hint}`);
  }
  // `extra` birden fazla not taşıyabiliyor; satır satır ayrılıyor.
  if (extra) lines.push(...extra.split('\n').filter((l) => l.length > 0));
  if (lines.length === 0) return null;

  return (
    <div className="mt-6 space-y-1 border-t border-slate-100 pt-3 text-[11px] leading-relaxed text-slate-500">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mt-6 rounded-lg border-l-[3px] bg-slate-50 px-4 py-3 text-sm text-slate-600"
      style={{ borderLeftColor: 'var(--rpt-accent)' }}
    >
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-8 rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
      {children}
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Yardımcılar                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Aralık tam bir takvim ayını kapsıyor mu.
 *
 * Kapsamıyorsa belgeye uyarı düşüyor: müşteri elindeki raporun "Ağustos
 * raporu" mu yoksa "Ağustos'un ilk yarısı" mı olduğunu bilmeli. Aradaki fark
 * bütçe konuşmasında doğrudan yanlış anlaşılma üretiyor.
 */
function coversWholeMonth(from: string, to: string): boolean {
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (start.getUTCDate() !== 1) return false;
  if (start.getUTCMonth() !== end.getUTCMonth() || start.getUTCFullYear() !== end.getUTCFullYear()) {
    // Ay sınırını aşan aralıklar (örneğin son 30 gün) bu uyarının konusu değil.
    return true;
  }
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  return end.getUTCDate() === lastDay;
}

function platformNames(data: ReportData): string {
  const names = data.platforms.map((p) => p.label.toUpperCase());
  return names.length > 0 ? names.join(' + ') : 'PLATFORM YOK';
}

/** Kampanya satırlarının toplamı — erişim HARİÇ (toplanamaz). */
/*
 * `sumRows` VE TOPLAM BİÇİMLERİ ARTIK PAYLAŞILAN PAKETTE.
 *
 * Burada yerel bir kopya vardı ve PDF tarafında HİÇ toplam yoktu: aynı
 * rapor ekranda toplamlı, müşteriye giden belgede toplamsız çıkıyordu.
 * Tek kaynak, iki gösterimin ayrışmasını imkânsız kılıyor.
 */

/**
 * Marka renginin CSS'e enjeksiyonunu güvenli kılar.
 *
 * Değer veritabanından geliyor ve `<style>` içine basılıyor; kaçırılmamış bir
 * değer CSS enjeksiyonuna açık olurdu. Yalnızca hex renk biçimine izin
 * veriyoruz, aksi hâlde varsayılana düşüyoruz.
 */
function escapeCss(value: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(value) ? value : '#E11D2E';
}
