import { ASSET_KINDS, type AssetKind, type AssetListResult } from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { serverApiFetch } from '@/lib/api';
import { AssetLibrary } from '@/components/assets/asset-library';


/**
 * Varlık arşivi (BASE).
 *
 * ÜÇ SORUNU ÇÖZÜYOR: aynı görseli her kampanyada yeniden yüklemek, toplu
 * oluşturucuda `image_hash` değerini elle yazmak (o değeri bulmak için Ads
 * Manager'a gitmek gerekiyordu) ve Google PMax logosunun yerinin olmaması.
 */
/**
 * MARKA MERKEZİ › VARLIKLAR İÇİNDE ÇİZİLİYOR (2026-10-06). Eskiden
 * `/kutuphane/gorseller` ayrı sayfasıydı ve menüde görünmüyordu; o adres artık
 * buraya yönleniyor. Başlık ve workspace kapısı Marka Merkezi'nde.
 */
export async function GorsellerIcerik({
  clientId,
  params,
}: {
  clientId: string;
  params: Record<string, string | string[] | undefined>;
}) {
  const session = await requireSession();

  // SESSİZCE İLK WORKSPACE'E DÜŞÜLMÜYOR — gerekçe `lib/sayfa-workspace.ts`.

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
      <div className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger-strong ring-1 ring-inset ring-danger/30">
        Arşiv yüklenemedi.
      </div>
    );
  }

  return (
    <div className="space-y-5">

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
