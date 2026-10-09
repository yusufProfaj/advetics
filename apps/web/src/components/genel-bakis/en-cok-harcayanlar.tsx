import Link from 'next/link';
import type { MetricsBreakdownRow } from '@advetics/shared';
import { platformKanali } from '@advetics/shared';
import { baglanti } from '@/lib/baglanti';
import { formatMoney, formatNumber, microsOf } from '@/lib/format';
import { PlatformLogo } from '@/components/platform-logo';
import { REKLAM_YONETICISI } from '@/lib/reklam-yoneticisi';

/** Genel Bakış'ta kaç kampanya görünür; tam liste Reklam Yöneticisi'nde. */
export const OZET_KAMPANYA_SAYISI = 5;

/**
 * ═══ GENEL BAKIŞ › EN ÇOK HARCAYAN KAMPANYALAR ═══
 *
 * Google Ads'in hesap genel bakışındaki "Kampanyalar" kartı: tablonun
 * kendisi değil, ona açılan kapı. Kırılım tablosu (sekmeler, sıralama,
 * önizleme) Reklam Yöneticisi'ne taşındı; burada yalnızca paranın nereye
 * gittiği ve her satırdan o kampanyanın reklam setlerine inen bağlantı.
 *
 * SESSİZ KESME YOK: `toplamBilinmiyor` doğruysa sunucu sınıra ulaştı demek
 * ve "en az N" yazılıyor; değilse kaç satırdan kaçının göründüğü yazılı.
 *
 * Satırlar sunucunun sırasıyla (harcamaya göre) geliyor; burada yeniden
 * sıralamak, "en çok harcayan" başlığıyla ayrışan ikinci bir kural olurdu.
 */
export function EnCokHarcayanlar({
  rows,
  toplamBilinmiyor,
  currency,
  tasinan,
}: {
  rows: MetricsBreakdownRow[];
  /** Sunucudan istenen sınır kadar satır geldiyse gerçek sayı bilinmiyor. */
  toplamBilinmiyor: boolean;
  currency: string | null;
  tasinan: Record<string, string | undefined>;
}) {
  const gosterilen = rows.slice(0, OZET_KAMPANYA_SAYISI);
  const toplamHarcama = rows.reduce((a, r) => a + BigInt(r.spendMicros), 0n);

  return (
    <section
      aria-labelledby="en-cok-harcayanlar"
      className="overflow-hidden rounded-xl border border-line bg-surface shadow-kart"
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 id="en-cok-harcayanlar" className="text-sm font-semibold text-ink">
          En çok harcayan kampanyalar
        </h2>
        <Link
          href={baglanti(REKLAM_YONETICISI, tasinan, { seviye: 'campaign' })}
          className="ml-auto text-xs font-semibold text-brand-strong hover:underline"
        >
          Reklam Yöneticisi’nde aç →
        </Link>
      </div>

      {gosterilen.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-muted">Bu dönemde harcaması olan kampanya yok.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-[11px] uppercase tracking-wide text-ink-muted">
                <th className="px-4 py-2 text-left font-medium">Kampanya</th>
                <th className="px-3 py-2 text-right font-medium">Harcama</th>
                <th className="px-3 py-2 text-right font-medium">Pay</th>
                <th className="px-3 py-2 text-right font-medium">Dönüşüm</th>
                <th className="px-4 py-2 text-right font-medium">Dönüşüm başı maliyet</th>
              </tr>
            </thead>
            <tbody>
              {gosterilen.map((r) => {
                // PAY İLK N SATIRIN İÇİNDEN değil, GELEN BÜTÜN satırların
                // toplamından: yoksa beşinci kampanya her zaman küçük, ilk
                // kampanya her zaman büyük görünürdü.
                const pay =
                  toplamHarcama === 0n ? 0 : Number((BigInt(r.spendMicros) * 1000n) / toplamHarcama) / 10;
                return (
                  <tr key={r.entityId} className="border-b border-line transition-colors last:border-0 hover:bg-surface-muted">
                    <td className="max-w-0 px-4 py-2.5">
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${r.status === 'active' ? 'bg-ok' : 'bg-ink-muted/50'}`}
                          title={r.status === 'active' ? 'Yayında' : 'Yayında değil'}
                        />
                        <PlatformLogo kind={platformKanali(r.platform)} className="h-3.5 w-3.5 shrink-0" />
                        <Link
                          href={baglanti(REKLAM_YONETICISI, tasinan, { seviye: 'ad_group', kampanya: r.entityId })}
                          title={r.name}
                          className="truncate font-medium text-ink hover:text-brand-strong hover:underline"
                        >
                          {r.name}
                        </Link>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums text-ink">
                      {formatMoney(r.spendMicros, currency ?? r.currency)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="flex items-center justify-end gap-2">
                        <span className="block h-1.5 w-16 overflow-hidden rounded-full bg-surface-sunken">
                          <span
                            className="pay-cubugu block h-full rounded-full bg-brand"
                            style={{ width: `${Math.min(100, pay)}%` }}
                          />
                        </span>
                        <span className="w-10 text-right text-xs tabular-nums text-ink-muted">%{pay.toLocaleString('tr-TR')}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-ink-muted">{formatNumber(r.conversions)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                      {r.cpa === null ? '—' : formatMoney(microsOf(r.cpa), currency ?? r.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-line px-4 py-2 text-xs text-ink-muted">
        {toplamBilinmiyor
          ? `${gosterilen.length} kampanya gösteriliyor · en az ${rows.length} kampanya harcadı`
          : `${gosterilen.length} / ${rows.length} kampanya gösteriliyor`}
      </div>
    </section>
  );
}
