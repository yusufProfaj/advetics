import Link from 'next/link';
import type { CreativeRecord, LeadFormRecord } from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { ExpertAdBuilder } from '@/components/ad-builder/expert-builder';

export const metadata = { title: 'Kampanya Kur — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Uzman yüzeyi.
 *
 * BASİT YÜZEYLE AYNI AĞACA YAZIYOR ama başka bir iş yapıyor: orada Meta'nın
 * sorduğu her soruya biz cevap veriyoruz, burada kullanıcı cevaplıyor.
 * Terminoloji de simetrik — basit yüzeyde Meta'nın dili hiç geçmiyor, burada
 * aynen geçiyor.
 */
export default async function ExpertAdPage({
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
  const client = session.availableClients.find((c) => c.id === clientId);

  const [connections, creatives, forms] = await Promise.all([
    serverApiFetch<
      Array<{
        adAccounts: Array<{ id: string; name: string; currency: string; platform: string }>;
        socialProfiles: Array<{ id: string; name: string; profileType: string }>;
      }>
    >(`/connections?clientId=${clientId}`).catch(() => []),
    serverApiFetch<CreativeRecord[]>(`/creatives?clientId=${clientId}`).catch(() => []),
    serverApiFetch<LeadFormRecord[]>(`/lead-forms?clientId=${clientId}`).catch(() => []),
  ]);

  const accounts = connections
    .flatMap((c) => c.adAccounts ?? [])
    .filter((a) => a.platform === 'meta');
  const pages = connections
    .flatMap((c) => c.socialProfiles ?? [])
    .filter((p) => p.profileType === 'facebook_page');

  if (accounts.length === 0 || pages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center">
        <h1 className="text-sm font-semibold text-ink">
          Bu müşteride Meta reklam hesabı ya da sayfa atanmamış
        </h1>
        <Link
          href="/ayarlar/baglantilar"
          className="mt-4 inline-block rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white"
        >
          Platform bağlantılarına git
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Kampanya Kur</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            <strong className="text-ink">{client?.name ?? 'Müşteri'}</strong> · amaç,
            optimizasyon, kitle ve yerleşim üzerinde tam kontrol.
          </p>
        </div>
        <Link
          href={`/reklam-olustur/basit?musteri=${clientId}`}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-sunken"
        >
          Hızlı Reklam&apos;a geç
        </Link>
      </header>

      {canWrite ? (
        <ExpertAdBuilder
          clientId={clientId}
          accounts={accounts}
          pages={pages}
          creatives={creatives}
          forms={forms}
        />
      ) : (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          Kampanya kurmak için yetkin yok.
        </div>
      )}
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
