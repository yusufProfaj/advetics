import Link from 'next/link';
import type { MetricsSummary, Platform } from '@advetics/shared';
import { PLATFORMS, PLATFORM_KISA_ADLARI } from '@advetics/shared';
import { baglanti } from '@/lib/baglanti';
import {
  changePercent,
  changePercentMicros,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRoas,
  microsOf,
} from '@/lib/format';
import { MetricCard } from '@/components/metric-card';
import { MetricStrip } from '@/components/metric-strip';
import { dugmeSinifi } from '@/components/ui/dugme';
import { platformSekmesiSorgusu, type PanelSeviyesi } from '@/lib/genel-bakis-seviyesi';

/**
 * ═══ ÖZET PARÇALARI: GENEL BAKIŞ VE REKLAM YÖNETİCİSİ ORTAK ═══
 *
 * İkisi de aynı özeti (`/metrics/summary`) aynı kutularla gösteriyor.
 * 2026-10-09'a kadar bu parçalar Genel Bakış sayfasının içindeydi; iniş
 * tablosu Reklam Yöneticisi'ne taşınınca ikinci bir kopya doğacaktı ve
 * aynı metriği iki ekranda iki ayrı kural (CPA'nın yönü, erişimin ipucu)
 * yazardı.
 */

export function PerformansKutulari({
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
    <div className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
      <MetricCard
          bitisik
        terim="harcama"
        value={spendValue}
        change={changePercentMicros(summary.spendMicros, prev?.spendMicros)}
        emphasis
      />
      <MetricCard
          bitisik
        terim="donusum"
        value={formatNumber(summary.conversions)}
        change={changePercent(summary.conversions, prev?.conversions)}
      />
      <MetricCard
          bitisik
        terim="cpa"
        value={formatMoney(microsOf(summary.cpa), currency)}
        // ARTIŞ KÖTÜ: dönüşüm başına maliyet yükseliyorsa kırmızı olmalı.
        inverse
        change={summary.cpa === null ? null : changePercent(summary.cpa, prev?.cpa)}
        hint={summary.cpa === null ? 'henüz sonuç yok' : undefined}
      />
      {/* ROAS YERİNE ERİŞİM — gelir takip edilmiyorsa.
          Lead formu ve mesajlaşma kampanyalarında gelir değeri hiç yok ve
          ROAS kartı sürekli "—" gösteriyor: bir kart boyunca yer kaplayıp
          hiçbir şey söylemiyor. Erişim o hesaplarda anlamlı bir dördüncü
          metrik. Gelir varsa ROAS geri geliyor — asıl karar metriği o. */}
      {summary.roas === null ? (
        <MetricCard
          bitisik
          terim="erisim"
          value={formatNumber(summary.reach)}
          /* GÜNLÜK ORTALAMA ÖNCE SÖYLENİR. Çok hesaplı ve çok günlü
             aralıkta ipucu yalnızca "mükerrer olabilir" diyordu; sayı bir
             GÜNÜN ortalamasıyken dönemin tekil kişi sayısı gibi okunuyordu.
             Sayının NE olduğu, nasıl şiştiğinden önemli. */
          hint={
            summary.reach === null
              ? 'platform bildirmiyor'
              : summary.reachKind === 'daily_average'
                ? summary.reachAcrossAccounts
                  ? 'günlük ortalama, hesaplar arası mükerrer olabilir'
                  : 'günlük ortalama, kişiler günler arasında toplanamaz'
                : summary.reachAcrossAccounts
                  ? 'hesaplar arası mükerrer olabilir'
                  : undefined
          }
        />
      ) : (
        <MetricCard bitisik terim="roas" value={formatRoas(summary.roas)} change={changePercent(summary.roas, prev?.roas)} />
      )}
    </div>
  );
}

/** İkincil metrikler — bağlam veriyor, karar verdirmiyor. */
export function IkincilSerit({
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
      bitisik
      items={[
        {
          terim: 'gosterim',
          value: formatNumber(summary.impressions),
          change: changePercent(summary.impressions, prev?.impressions),
        },
        {
          terim: 'tik',
          value: formatNumber(summary.clicks),
          change: changePercent(summary.clicks, prev?.clicks),
        },
        {
          terim: 'ctr',
          value: formatPercent(summary.ctr),
          change: summary.ctr === null ? null : changePercent(summary.ctr, prev?.ctr),
        },
        {
          terim: 'cpc',
          value: formatMoney(microsOf(summary.cpc), currency),
          // Artış kötü: tık başına maliyet yükselmesi iyi haber değil.
          inverse: true,
          change: summary.cpc === null ? null : changePercent(summary.cpc, prev?.cpc),
        },
        {
          /* BGBM — sunucu zaten hesaplıyordu (`totals().cpm`), ekranda
             yoktu. Teslimat pahalılaştığında CPC ile CTR'ı ayrı ayrı okuyup
             tahmin yürütmek yerine kitleye ulaşmanın fiyatını doğrudan
             gösteriyor. */
          terim: 'cpm',
          value: formatMoney(microsOf(summary.cpm), currency),
          inverse: true,
          change: summary.cpm === null ? null : changePercent(summary.cpm, prev?.cpm),
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
export function PlatformSekmeleri({
  yol,
  current,
  hesap,
  seviye,
  tasinan,
}: {
  /** Sekmenin gittiği sayfa: Genel Bakış ve Reklam Yöneticisi aynı şeridi taşıyor. */
  yol: string;
  current: Platform | null;
  hesap: string | undefined;
  seviye: PanelSeviyesi;
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
            // Mecra değişince hesap düşüyor: hesap tek mecraya ait
            // (`platformSekmesiSorgusu`).
            href={baglanti(
              yol,
              tasinan,
              platformSekmesiSorgusu(o.key, { platform: current, hesap, seviye }),
            )}
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

export function VeriYokDurumu() {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
      <h2 className="text-sm font-semibold text-ink">Henüz veri yok</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-muted">
        Bir platform bağlayıp reklam hesabını bir workspace&apos;e ata. Veriler kısa süre içinde
        burada görünür.
      </p>
      <Link
        href="/ayarlar/baglantilar"
        className={`mt-4 ${dugmeSinifi()}`}
      >
        Bağlantılara git
      </Link>
    </div>
  );
}
