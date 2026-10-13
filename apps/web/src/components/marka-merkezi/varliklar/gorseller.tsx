import type { AssetListResult } from '@advetics/shared';
import { requireSession } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { kapi, markaMerkeziAdresi } from '@/lib/panel-adresleri';
import { AssetLibrary } from '@/components/assets/asset-library';
import { gorselTuru } from '@/components/assets/gorsel-turleri';
import { Uyari } from '@/components/ui/uyari';

/**
 * Varlık arşivi — Base › Varlıklar › Görseller.
 *
 * ÜÇ SORUNU ÇÖZÜYOR: aynı görseli her kampanyada yeniden yüklemek, toplu
 * oluşturucuda `image_hash` değerini elle yazmak (o değeri bulmak için Ads
 * Manager'a gitmek gerekiyordu) ve Google PMax logosunun yerinin olmaması.
 *
 * LOGO SÜZGECİ YOK (Ç-11): logonun evi Marka › Logo. `tur=logo` adresi
 * sayfada oraya yönleniyor; buraya gelirse "Tümü" açılır.
 *
 * OKUMA HATASI YUTULMUYOR: eski sürüm `.catch(() => null)` ile "Arşiv
 * yüklenemedi." diyordu ve sunucunun sebebi (yetki, workspace bulunamadı)
 * kayboluyordu. Sebep olduğu gibi ekranda.
 */
export async function GorsellerIcerik({
  clientId,
  params,
}: {
  clientId: string;
  params: Record<string, string | string[] | undefined>;
}) {
  const session = await requireSession();
  const kind = gorselTuru(first(params.tur));

  const query = new URLSearchParams({ clientId, limit: '60', offset: '0' });
  if (kind) query.set('kind', kind);

  const sonuc = await serverApiFetch<AssetListResult>(`/assets?${query.toString()}`).then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, hata: e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.' }),
  );

  if (!sonuc.ok) {
    return (
      <Uyari ton="tehlike" baslik="Görsel arşivi alınamadı.">
        {sonuc.hata}
      </Uyari>
    );
  }

  return (
    <AssetLibrary
      initial={sonuc.v}
      clientId={clientId}
      activeKind={kind}
      canWrite={kapi(session, 'varlik.yaz')}
      logoAdresi={markaMerkeziAdresi('marka', clientId, 'logo')}
    />
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
