import Link from 'next/link';
import { platformKanali, PLATFORM_KISA_ADLARI } from '@advetics/shared';
import { baglanti } from '@/lib/baglanti';
import { DeltaRozeti } from '@/components/delta-rozeti';
import { PlatformLogo } from '@/components/platform-logo';
import { SIRALAMA_YONU, type Siralama } from '@/lib/kirilim-siralama';
import type { MetricsBreakdownRow, MetricLevel, Platform } from '@advetics/shared';
import {
  formatDecimal,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRoas,
  changePercent,
} from '@/lib/format';

const LEVEL_TABS: Array<{ key: MetricLevel; label: string }> = [
  { key: 'campaign', label: 'Kampanya' },
  { key: 'ad_group', label: 'Reklam seti' },
  { key: 'ad', label: 'Reklam' },
];

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  paused: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  deleted: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  pending_review: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  ended: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  unknown: 'bg-slate-100 text-slate-600 ring-slate-500/20',
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
 * Kırılım tablosu.
 *
 * Seviye sekmeleri LİNK, buton değil: seçim URL'de duruyor, sunucuda render
 * ediliyor ve paylaşılabiliyor. İstemci state'i kullanmak üçünü kaybettirirdi.
 *
 * `parentName` gösterilmesi zorunlu: reklam adları ad set'ler arasında tekrar
 * ediyor (aynı creative birden fazla sette kullanılıyor) ve üst varlık olmadan
 * tabloda hangi satırın hangisi olduğu ayırt edilemiyor. Canlı veride üç ayrı
 * satır "Reklam B-1 · Kreatif 1" olarak görünüyordu.
 */
export function BreakdownTable({
  rows,
  level,
  tasinan,
  currency,
  siralama,
  limit,
}: {
  rows: MetricsBreakdownRow[];
  level: MetricLevel;
  tasinan: Record<string, string | undefined>;
  currency: string | null;
  /** Ekrandaki sıra — satır KÜMESİNİ değiştirmiyor, bkz. `kirilim-siralama.ts`. */
  siralama: Siralama;
  /** Sunucudan istenen satır sayısı — kesme ekranda YAZILABİLSİN diye. */
  limit: number;
}) {
  // ÖLÜ KOLONU GÖSTERMİYORUZ.
  //
  // Hiçbir satırda dönüşüm değeri yoksa ROAS kolonu baştan sona "—" oluyor:
  // yatay yer kaplıyor, göz taramasını uzatıyor ve hiçbir şey söylemiyor.
  // Kartta ROAS yerine erişim gösterme kararının tablodaki karşılığı bu.
  //
  // Tek satırda bile gelir varsa kolon kalıyor — o zaman karşılaştırma anlamlı.
  const showRoas = rows.some((r) => r.roas !== null);

  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">Performans dağılımı</h3>
        <nav className="flex gap-1 rounded-lg bg-surface-sunken p-0.5" aria-label="Kırılım seviyesi">
          {LEVEL_TABS.map((tab) => (
            <Link
              key={tab.key}
              // TAŞINAN SÜZGEÇLERLE. Eskiden yalnızca `aralik` yazılıyordu ve
              // `platform` DÜŞÜYORDU: "Meta" seçip seviye değiştiren kullanıcı
              // sessizce bütün platformlara dönüyordu.
              href={baglanti('/dashboard', tasinan, { seviye: tab.key })}
              aria-current={level === tab.key ? 'page' : undefined}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                level === tab.key
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </header>

      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-ink-muted">
          Bu aralıkta bu seviyede veri yok.
        </p>
      ) : (
        // Yatay kaydırma KENDİ kabında: sayfanın gövdesi yatay kaymamalı.
        <div className="overflow-x-auto">
          <table className={`w-full text-sm ${showRoas ? 'min-w-[920px]' : 'min-w-[840px]'}`}>
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-muted">
                <th className="px-4 py-2 font-semibold">Ad</th>
                {/*
                  MECRA SÜTUNU — ADIN HEMEN YANINDA.
                  Platform bilgisi tabloda HİÇ YOKTU: aynı listede Meta ve
                  Google kampanyaları yan yana duruyor ve hangi harcamanın
                  hangi mecraya gittiği yalnızca kampanya adından tahmin
                  edilebiliyordu. Üstteki platform sekmesi süzüyor ama
                  "Tümü" seçiliyken satır bazında cevap vermiyor.
                */}
                <SiraliBaslik
                  etiket="Mecra"
                  anahtar="mecra"
                  aktif={siralama}
                  tasinan={tasinan}
                  className="px-3 py-2"
                />
                <SiraliBaslik
                  etiket="Harcama"
                  anahtar="harcama"
                  aktif={siralama}
                  tasinan={tasinan}
                  className="px-3 py-2 text-right"
                />
                <SiraliBaslik
                  etiket="Gösterim"
                  anahtar="gosterim"
                  aktif={siralama}
                  tasinan={tasinan}
                  className="px-3 py-2 text-right"
                />
                <SiraliBaslik
                  etiket="Tık"
                  anahtar="tik"
                  aktif={siralama}
                  tasinan={tasinan}
                  className="px-3 py-2 text-right"
                />
                {/* CTR SIRALANMIYOR: türetilmiş bir oran ve gösterimi sıfır
                    olan satırlarda `null`. Sıralanabilir göstermek, aynı
                    tabloda anlamı olmayan bir düzen üretirdi. */}
                <th className="px-3 py-2 text-right font-semibold">CTR</th>
                <SiraliBaslik
                  etiket="Dönüşüm"
                  anahtar="donusum"
                  aktif={siralama}
                  tasinan={tasinan}
                  className="px-3 py-2 text-right"
                />
                <SiraliBaslik
                  etiket="CPA"
                  anahtar="cpa"
                  aktif={siralama}
                  tasinan={tasinan}
                  className={`px-3 py-2 text-right ${showRoas ? '' : 'pr-4'}`}
                />
                {showRoas && <th className="px-4 py-2 text-right font-semibold">ROAS</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.entityId}-${r.currency}`} className="border-b border-line/60 last:border-0">
                  <td className="max-w-[260px] px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-ink" title={r.name}>
                        {r.name}
                      </span>
                      <StatusPill status={r.status} />
                    </div>
                    {r.parentName && (
                      <p className="truncate text-xs text-ink-muted" title={r.parentName}>
                        {r.parentName}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Mecra platform={r.platform} />
                  </td>
                  {/*
                    DELTA HÜCRENİN ALTINDA, YENİ SÜTUN DEĞİL.
                    Tablo zaten sabit genişlikte (min-w-[820px]); altı metrik
                    için altı ek sütun onu mobilde tamamen yatay kaydırmaya
                    mahkûm ederdi.
                  */}
                  <td className="px-3 py-2.5 text-right font-medium tabular-nums text-ink">
                    {/* Satır kendi para birimini taşıyor: karışık para
                        biriminde tek bir sembol göstermek yanlış olurdu. */}
                    {formatMoney(r.spendMicros, currency ?? r.currency)}
                    <Delta simdi={mikroSayi(r.spendMicros)} once={mikroSayi(r.previous?.spendMicros)} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                    {formatNumber(r.impressions)}
                    <Delta simdi={r.impressions} once={r.previous?.impressions} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                    {formatNumber(r.clicks)}
                    <Delta simdi={r.clicks} once={r.previous?.clicks} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">
                    {formatPercent(r.ctr)}
                    <Delta simdi={r.ctr} once={r.previous?.ctr} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-ink">
                    {formatDecimal(r.conversions, 0)}
                    <Delta simdi={r.conversions} once={r.previous?.conversions} />
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right tabular-nums text-ink-muted ${
                      showRoas ? '' : 'pr-4'
                    }`}
                  >
                    {formatMoney(
                      r.cpa === null ? null : String(Math.round(r.cpa * 1_000_000)),
                      currency ?? r.currency,
                    )}
                    {/* CPA'da ARTIŞ KÖTÜ — `inverse`. */}
                    <Delta simdi={r.cpa} once={r.previous?.cpa} inverse />
                  </td>
                  {showRoas && (
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                      {formatRoas(r.roas)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/*
        SESSİZ KESME YOK.
        Tablo her zaman HARCAMAYA GÖRE İLK N satırı gösteriyor ve sıralama o
        kümenin içinde çalışıyor. Bu yazılmazsa "mecraya göre sıraladım ama
        Google kampanyalarımın çoğu listede yok" hâli hiçbir yerde
        açıklanmaz. Not yalnızca kesme İHTİMALİ varsa basılıyor — her
        ekranda duran bir uyarı okunmaz hâle gelir.
      */}
      {rows.length >= limit && (
        <p className="border-t border-line px-4 py-2 text-xs text-ink-muted">
          Harcamaya göre ilk {limit} satır gösteriliyor
          {siralama !== 'harcama' ? ' — sıralama bu satırların içinde yapılıyor' : ''}.
        </p>
      )}
    </section>
  );
}

/**
 * SIRALANABİLİR SÜTUN BAŞLIĞI — LİNK, BUTON DEĞİL.
 *
 * Seçim URL'de duruyor: sayfa sunucu bileşeni kalıyor, bağlantı
 * paylaşılabiliyor ve tarayıcının geri tuşu çalışıyor. Buton yazmak üçünü de
 * kaybettirir ve tabloyu istemci bileşenine çevirirdi.
 *
 * YÖN SÜTUNA GÖMÜLÜ (`SIRALAMA_YONU`) ve OKLA GÖSTERİLİYOR. İki tıklamalı
 * artan/azalan bir başlık ikinci bir URL parametresi isterdi; her sütunun
 * zaten doğru bir yönü var ve CPA'nınki diğerlerinin TERSİ — göstermeden
 * bırakmak, kullanıcının "en pahalı CPA" beklerken en ucuzu görmesi demekti.
 */
function SiraliBaslik({
  etiket,
  anahtar,
  aktif,
  tasinan,
  className,
}: {
  etiket: string;
  anahtar: Siralama;
  aktif: Siralama;
  tasinan: Record<string, string | undefined>;
  className: string;
}) {
  const secili = aktif === anahtar;
  const yon = SIRALAMA_YONU[anahtar];
  return (
    <th
      className={`${className} font-semibold`}
      aria-sort={secili ? (yon === 'artan' ? 'ascending' : 'descending') : 'none'}
    >
      <Link
        href={baglanti('/dashboard', tasinan, { sirala: anahtar })}
        className={`inline-flex items-center gap-1 transition hover:text-ink ${
          secili ? 'text-ink' : ''
        }`}
      >
        {etiket}
        <span aria-hidden className={secili ? '' : 'opacity-0'}>
          {yon === 'artan' ? '↑' : '↓'}
        </span>
      </Link>
    </th>
  );
}

/**
 * Mecra hücresi — logo VE metin.
 *
 * Yalnızca logo koymak, markayı tanımayan için okunamaz bir sütun demek;
 * yalnızca metin koymak da göz taramasını yavaşlatıyor (bu tablo aynı
 * ekranda platform sekmeleriyle birlikte duruyor ve oradaki işaretlerle
 * eşleşmesi gerekiyor).
 */
function Mecra({ platform }: { platform: Platform }) {
  return (
    <span className="flex items-center gap-1.5">
      <PlatformLogo kind={platformKanali(platform)} className="h-3.5 w-3.5 shrink-0" />
      <span className="text-xs text-ink-muted">{PLATFORM_KISA_ADLARI[platform]}</span>
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
        STATUS_STYLE[status] ?? STATUS_STYLE.unknown
      }`}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

/**
 * Hücrenin altındaki değişim rozeti.
 *
 * `changePercent` `null` döndüğünde hiçbir şey basılmıyor: önceki dönem yok
 * ya da sıfırsa karşılaştırma TANIMSIZ. "%0" ya da "%100" göstermek ikisi de
 * yanlış olurdu ve yeni açılmış her varlık "-%100" görünürdü.
 */
function Delta({
  simdi,
  once,
  inverse,
}: {
  simdi: number | null | undefined;
  once: number | null | undefined;
  inverse?: boolean;
}) {
  if (once === undefined || once === null) return null;
  /*
   * `simdi` null olabiliyor (CTR gösterim yoksa, CPA dönüşüm yoksa) ve o
   * durumda karşılaştırma TANIMSIZ: "önceki dönemde CPA vardı, şimdi
   * hesaplanamıyor" bir düşüş değil. Sıfır saymak "-%100" gösterirdi.
   */
  if (simdi === null || simdi === undefined) return null;
  const d = changePercent(simdi, once);
  if (d === null) return null;
  return (
    <span className="mt-0.5 block">
      <DeltaRozeti change={d} inverse={inverse} size="xs" />
    </span>
  );
}

/** Micros string'i sayıya — oran hesabı için; gösterimde kullanılmıyor. */
function mikroSayi(micros: string | null | undefined): number | null {
  if (micros === null || micros === undefined) return null;
  try {
    return Number(BigInt(micros)) / 1_000_000;
  } catch {
    return null;
  }
}
