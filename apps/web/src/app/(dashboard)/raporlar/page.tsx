import Link from 'next/link';
import type { ReportData } from '@advetics/shared';
import { requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { formatDayLong } from '@/lib/format';
import { ReportDocument } from '@/components/report/report-document';
import { ShareControls } from '@/components/report/share-controls';

export const metadata = { title: 'Raporlar — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Rapor önizleme ve paylaşım.
 *
 * Ay seçimi TAKVİMSEL, "son 30 gün" gibi kayan değil: rapor bir belge ve
 * müşteriye "Temmuz raporu" gönderiliyor, "son 30 gün raporu" değil. Panelin
 * kayan aralıkları oradaki soru farklı olduğu için doğru — burada yanlış olurdu.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const months = recentMonths(6);
  const selected = months.find((m) => m.key === first(params.ay)) ?? months[0]!;

  const clientId = first(params.musteri) ?? session.activeClientId ?? session.availableClients[0]?.id;

  if (!clientId) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <h1 className="text-sm font-semibold text-ink">Önce bir müşteri seç</h1>
        <p className="mt-2 text-sm text-ink-muted">
          Rapor müşteri bazında üretiliyor. Üstteki seçiciden bir müşteri seçin.
        </p>
      </div>
    );
  }

  const qs = new URLSearchParams({ clientId, from: selected.from, to: selected.to });
  const report = await serverApiFetch<ReportData>(`/reports/preview?${qs}`).catch(() => null);

  const linkWith = (over: Record<string, string | undefined>): string => {
    const next = new URLSearchParams();
    const current: Record<string, string | undefined> = {
      ay: selected.key,
      musteri: clientId,
      ...over,
    };
    for (const [k, v] of Object.entries(current)) if (v) next.set(k, v);
    return `/raporlar?${next}`;
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Raporlar</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            {formatDayLong(selected.from)} — {formatDayLong(selected.to)}
          </p>
        </div>
        <nav className="flex flex-wrap gap-1 rounded-lg bg-surface-sunken p-0.5" aria-label="Dönem">
          {months.map((m) => (
            <Link
              key={m.key}
              href={linkWith({ ay: m.key })}
              aria-current={selected.key === m.key ? 'page' : undefined}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                selected.key === m.key
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-muted hover:text-ink'
              }`}
            >
              {m.label}
            </Link>
          ))}
        </nav>
      </header>

      {report === null ? (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-red-900">
          Rapor oluşturulamadı. API çalışıyor mu?
        </div>
      ) : (
        <>
          <ShareControls
            clientId={clientId}
            from={selected.from}
            to={selected.to}
            hasData={report.platforms.length > 0}
          />

          {report.platforms.length === 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-sm text-amber-900">
              Bu dönemde harcama kaydı yok — rapor boş görünecek. Senkronizasyonun
              bu tarihleri kapsadığından emin olun.
            </div>
          )}

          {/* Önizleme müşterinin göreceğinin BİREBİR aynısı: aynı bileşen,
              aynı veri. Ayrı bir "önizleme görünümü" yazmak, gönderilen
              belgeyle ekranda görülenin zamanla ayrışması demek olurdu. */}
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            <ReportDocument data={report} />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Son N takvim ayı.
 *
 * Bugünün ayı DA dâhil ama etiketinde "(devam eden)" yazıyor: ayın ortasında
 * gönderilen bir rapor eksik veri içeriyor ve bunu ajansın bilmesi gerekiyor.
 */
function recentMonths(count: number): Array<{ key: string; label: string; from: string; to: string }> {
  const out: Array<{ key: string; label: string; from: string; to: string }> = [];
  const now = new Date();

  for (let i = 0; i < count; i++) {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const ongoing = i === 0;

    out.push({
      key: iso(first).slice(0, 7),
      label:
        first.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) +
        (ongoing ? ' (devam eden)' : ''),
      from: iso(first),
      // Devam eden ayda bugüne kadar; geçmiş ayda ayın sonuna kadar.
      to: ongoing ? iso(now) : iso(last),
    });
  }

  return out;
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
