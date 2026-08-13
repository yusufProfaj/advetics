import { ASSET_KINDS, type AssetKind, type AssetListResult } from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { AssetLibrary } from '@/components/assets/asset-library';

export const metadata = { title: 'Görsel Arşivi — Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Varlık arşivi (BASE).
 *
 * ÜÇ SORUNU ÇÖZÜYOR: aynı görseli her kampanyada yeniden yüklemek, toplu
 * oluşturucuda `image_hash` değerini elle yazmak (o değeri bulmak için Ads
 * Manager'a gitmek gerekiyordu) ve Google PMax logosunun yerinin olmaması.
 */
export default async function AssetsPage({
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

  const kindParam = first(params.tur);
  const kind = (ASSET_KINDS as readonly string[]).includes(kindParam ?? '')
    ? (kindParam as AssetKind)
    : null;

  const query = new URLSearchParams({ clientId, limit: '60', offset: '0' });
  if (kind) query.set('kind', kind);

  const result = await serverApiFetch<AssetListResult>(`/assets?${query.toString()}`).catch(
    () => null,
  );

  if (!result) {
    return (
      <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
        Arşiv yüklenemedi.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-ink">Görsel Arşivi</h1>
        <p className="mt-0.5 text-sm text-ink-muted">
          Bir kez yükle, her kampanyada kullan. Logolar da burada — Google Performance Max
          logosuz kampanya oluşturmuyor.
        </p>
      </header>

      <AssetLibrary
        initial={result}
        clientId={clientId}
        activeKind={kind}
        canWrite={hasPermission(session, 'bulk.write')}
      />
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
