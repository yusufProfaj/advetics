import Link from 'next/link';
import {
  AD_DRAFT_STATUS_LABELS,
  GOAL_META,
  type AdDraftRecord,
} from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { AdWizard } from '@/components/ad-builder/ad-wizard';

export const metadata = { title: 'Reklam Oluştur — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Reklam Oluşturucu — Modül 4 (CREATE).
 *
 * Bu sayfanın hedef kullanıcısı REKLAMCILIK BİLMİYOR. Ekranda hedef,
 * optimizasyon, yerleşim ya da teklif stratejisi geçmiyor; hepsi sunucuda
 * karara bağlanıyor.
 */
export default async function AdBuilderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const clientId =
    first(params.musteri) ?? session.activeClientId ?? session.availableClients[0]?.id;

  if (!clientId) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <h1 className="text-sm font-semibold text-ink">Önce bir müşteri seç</h1>
      </div>
    );
  }

  const canWrite = hasPermission(session, 'bulk.write');

  const [connections, drafts] = await Promise.all([
    serverApiFetch<
      Array<{
        adAccounts: Array<{ id: string; name: string; currency: string }>;
        socialProfiles: Array<{ id: string; name: string; profileType: string }>;
      }>
    >(`/connections?clientId=${clientId}`).catch(() => []),
    serverApiFetch<AdDraftRecord[]>(`/ad-drafts?clientId=${clientId}`).catch(() => []),
  ]);

  const accounts = connections.flatMap((c) => c.adAccounts ?? []);
  // REKLAM SAYFA ADINA YAYINLANIYOR ve Instagram hesabı tek başına bunu
  // yapamıyor — Meta reklamı her zaman bir Facebook sayfasına bağlıyor.
  const pages = connections
    .flatMap((c) => c.socialProfiles ?? [])
    .filter((p) => p.profileType === 'facebook_page');

  const editId = first(params.taslak);
  const editing = editId ? drafts.find((d) => d.id === editId) : undefined;

  if (accounts.length === 0 || pages.length === 0) {
    return <Missing hasAccounts={accounts.length > 0} hasPages={pages.length > 0} />;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Reklam Oluştur</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Görselleri seç, ne yazacağını söyle, gerisini biz hallederiz.
        </p>
      </header>

      {canWrite ? (
        <AdWizard
          key={editing?.id ?? 'new'}
          clientId={clientId}
          accounts={accounts}
          pages={pages}
          existing={editing}
        />
      ) : (
        <Notice>Reklam oluşturmak için yetkin yok.</Notice>
      )}

      {drafts.length > 0 && (
        <section className="rounded-xl border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">
            Önceki reklamların
          </h2>
          <ul>
            {drafts.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 px-4 py-2.5 last:border-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{d.name}</p>
                  <p className="text-[11px] text-ink-muted">
                    {GOAL_META[d.goal].label} · {AD_DRAFT_STATUS_LABELS[d.status]} ·{' '}
                    {formatRelative(d.createdAt)}
                    {d.error && <span className="text-rose-700"> · {d.error}</span>}
                  </p>
                </div>
                {d.status !== 'published' && canWrite && (
                  <Link
                    href={`/reklam-olustur?taslak=${d.id}`}
                    className="shrink-0 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-sunken"
                  >
                    Devam et
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Eksik ön koşul ekranı.
 *
 * NE EKSİK olduğunu tek tek söylüyor. "Bağlantı kurmalısın" demek yetmez:
 * kullanıcının hangisini kurduğunu ve hangisinin kaldığını görmesi gerekiyor.
 */
function Missing({ hasAccounts, hasPages }: { hasAccounts: boolean; hasPages: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
      <h1 className="text-sm font-semibold text-ink">Reklam vermek için iki şey gerekiyor</h1>
      <ul className="mx-auto mt-3 max-w-sm space-y-1.5 text-left text-sm">
        <li className={hasAccounts ? 'text-ink-muted line-through' : 'text-ink'}>
          {hasAccounts ? '✓' : '○'} Bir reklam hesabı
        </li>
        <li className={hasPages ? 'text-ink-muted line-through' : 'text-ink'}>
          {hasPages ? '✓' : '○'} Bir Facebook sayfası
        </li>
      </ul>
      <p className="mx-auto mt-3 max-w-md text-xs text-ink-muted">
        Reklam her zaman bir Facebook sayfası adına yayınlanır. Instagram hesabı tek başına
        yeterli değil.
      </p>
      <Link
        href="/ayarlar/baglantilar"
        className="mt-4 inline-block rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
      >
        Platform bağlantılarına git
      </Link>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
      {children}
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
