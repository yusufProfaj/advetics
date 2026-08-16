import type { AssetListResult, CreativeRecord } from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { CreativeLibrary } from '@/components/ad-builder/creative-library';

export const metadata = { title: 'Kreatifler — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Kreatif kütüphanesi.
 *
 * NEDEN KÜTÜPHANEDE, "Oluştur" altında değil: kreatif bir kampanyaya ait
 * değil, MÜŞTERİYE ait. Aynı metin ve görsel on kampanyada kullanılabiliyor
 * ve "geçen ayki reklamı tekrarla" ancak böyle mümkün. Formlar ve Görsel
 * Arşivi de aynı sebeple burada.
 */
export default async function CreativesPage({
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

  const [creatives, library] = await Promise.all([
    serverApiFetch<CreativeRecord[]>(`/creatives?clientId=${clientId}`).catch(() => []),
    serverApiFetch<AssetListResult>(
      `/assets?clientId=${clientId}&kind=image&limit=60&offset=0`,
    ).catch(() => null),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Kreatifler</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          <strong className="text-ink">{client?.name ?? 'Müşteri'}</strong> · metin havuzu ve
          görseller. Her platform kendi paketini bu havuzdan kuruyor.
        </p>
      </header>

      {canWrite ? (
        <CreativeLibrary
          clientId={clientId}
          creatives={creatives}
          libraryAssets={library?.rows ?? []}
        />
      ) : (
        <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          Kreatif düzenlemek için yetkin yok.
        </div>
      )}
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
