import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import Link from 'next/link';
import type { AtifDurumu, ReklamHazirligi, ReklamTaslakKaydi } from '@advetics/shared';
import { requireSession } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { Baslik, Kutu } from '@/reklam/ui';
import { Onizleme } from '@/reklam/studyo/onizleme';

export const metadata = { title: 'Reklam Önizlemesi · Advetics' };
export const dynamic = 'force-dynamic';

/** Asistanın taslağının önizlemesi ve onayı (`reklam/studyo/onizleme.tsx`). */
export default async function OnizlemePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const params = await searchParams;
  const clientId = sayfaWorkspaceId(session, first(params.musteri));
  const taslakId = first(params.taslak);
  if (!clientId) return <WorkspaceGerekli ekran="Reklam Önizlemesi" neden="Taslak bir workspace’e ait." {...workspaceSecimVerisi(session)} />;
  if (!taslakId) return <Kutu ton="uyari" baslik="Taslak seçilmedi"><Link className="underline" href={`/reklam?musteri=${clientId}`}>Stüdyoya dön</Link></Kutu>;
  const [t, h, a] = await Promise.allSettled([
    serverApiFetch<ReklamTaslakKaydi>(`/reklam/taslaklar/${encodeURIComponent(taslakId)}`),
    serverApiFetch<ReklamHazirligi>(`/reklam/hazirlik?clientId=${clientId}`),
    serverApiFetch<AtifDurumu>('/reklam/ajans-ayari/atif'),
  ]);
  const hata = (e: unknown) => (e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');
  if (t.status === 'rejected') return <Kutu ton="tehlike" baslik="Taslak okunamadı">{hata(t.reason)}</Kutu>;
  if (h.status === 'rejected') return <Kutu ton="tehlike" baslik="Reklam hazırlığı okunamadı">{hata(h.reason)}</Kutu>;
  if (t.value.clientId !== clientId) return <Kutu ton="tehlike" baslik="Bu taslak başka bir workspace’e ait">Stüdyoya dönüp yeniden aç.</Kutu>;
  const client = session.availableClients.find((c) => c.id === clientId);
  return (
    <div className="space-y-5">
      <Baslik baslik="Reklam Önizlemesi" ust={<Link href={`/reklam?musteri=${clientId}`} className="text-xs text-ink-muted hover:text-ink">← AdvCampaign</Link>} />
      <Onizleme
        key={t.value.id}
        ilkTaslak={t.value}
        hazirlik={h.value}
        ilkAtif={a.status === 'fulfilled' ? a.value : null}
        yonetici={a.status === 'fulfilled' ? a.value.secebilir : false}
        workspaceAdi={client?.name ?? 'Workspace'}
      />
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
