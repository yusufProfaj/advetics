import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import Link from 'next/link';
import type { AtifDurumu, ReklamHazirligi } from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { Baslik, Kutu } from '@/reklam/ui';
import { SohbetEkrani } from '@/reklam/sohbet/sohbet-ekrani';

export const metadata = { title: 'AdvCampaign · Advetics' };
export const dynamic = 'force-dynamic';

type Oturumlar = {
  satirlar: Array<{ id: string; baslik: string; taslakId: string | null; durum: string; sahibiBenMiyim: boolean; updatedAt: string }>;
  toplam: number;
  asistanBagli: boolean;
};

/**
 * ADVCAMPAIGN — reklam kurmanın tek yolu (kullanıcı kararı 2026-10-07):
 * sohbetle yönetilen, yapay zekâ odaklı akış. Asistan soruları tek tek
 * sorar, taslağı kurar, Meta'nın kontrolüne gönderir ve onay kartını
 * gösterir; yayın kullanıcının kartta onaylamasıyla. Eski Reklam Oluştur /
 * AI Asistan / Toplu Oluştur kaldırıldı. Gerçek yayın uyum kontrolü
 * bağlanana kadar yalnız prova ve test kipi.
 */
export default async function AdvCampaignPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const params = await searchParams;
  const clientId = sayfaWorkspaceId(session, first(params.musteri));
  if (!clientId) {
    return <WorkspaceGerekli ekran="AdvCampaign" neden="Reklam bir workspace’in reklam hesabında kuruluyor." {...workspaceSecimVerisi(session)} />;
  }
  if (!hasPermission(session, 'bulk.write')) return <Kutu ton="uyari" baslik="Reklam oluşturma yetkin yok">Workspace yöneticine danış.</Kutu>;
  const [h, o, a] = await Promise.allSettled([
    serverApiFetch<ReklamHazirligi>(`/reklam/hazirlik?clientId=${clientId}`),
    serverApiFetch<Oturumlar>(`/reklam/sohbet/oturumlar?clientId=${clientId}`),
    serverApiFetch<AtifDurumu>('/reklam/ajans-ayari/atif'),
  ]);
  const hata = (e: unknown) => (e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.');
  // Okuma hataları AYRI cümleyle: hazırlık olmadan hiçbir şey kurulamaz,
  // oturum listesi olmadan yeni oturumla devam edilemez gibi görünmesin.
  if (h.status === 'rejected') return <Kutu ton="tehlike" baslik="Reklam hazırlığı okunamadı">{hata(h.reason)}</Kutu>;
  if (o.status === 'rejected') return <Kutu ton="tehlike" baslik="Sohbet oturumları okunamadı">{hata(o.reason)}</Kutu>;
  const client = session.availableClients.find((c) => c.id === clientId);
  const oturum = first(params.oturum);
  return (
    <div className="space-y-4">
      <Baslik
        baslik="AdvCampaign"
        aciklama={<><strong className="text-ink">{client?.name ?? 'Workspace'}</strong> · görselini bırak, ne istediğini yaz; gerisini birlikte kuralım</>}
        ust={<Link href={`/reklam/yeni?musteri=${clientId}`} className="text-xs text-ink-muted hover:text-ink">Taslaklar →</Link>}
      />
      <SohbetEkrani
        clientId={clientId}
        hazirlik={h.value}
        workspaceAdi={client?.name ?? 'Workspace'}
        yonetici={a.status === 'fulfilled' ? a.value.secebilir : false}
        atif={a.status === 'fulfilled' ? a.value : null}
        ilkOturumlar={o.value}
        ilkOturumId={oturum && o.value.satirlar.some((x) => x.id === oturum) ? oturum : null}
        asistanBagli={o.value.asistanBagli}
      />
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
