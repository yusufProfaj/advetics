import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import Link from 'next/link';
import type { ReklamHazirligi } from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { Baslik, Kutu, dugmeSinifi } from '@/reklam/ui';
import { ReklamStudyosu } from '@/reklam/studyo/studyo';

export const metadata = { title: 'Reklam Stüdyosu (önizleme) · Advetics' };
export const dynamic = 'force-dynamic';

/**
 * REKLAM STÜDYOSU — görselleri bırak, tek cümle yaz; asistan taslağı kurar
 * (kullanıcı kararı 2026-10-07). Yeni reklam modülü: eski ekranlardan
 * bileşen almıyor. Menüde henüz YOK: gerçek yayın uyum katmanı bağlanınca
 * "Reklam Oluştur" buraya taşınacak; o güne kadar menüden gelen kullanıcının
 * reklam kurabildiği yol kapanmasın.
 */
export default async function ReklamStudyosuPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const params = await searchParams;
  const clientId = sayfaWorkspaceId(session, first(params.musteri));
  if (!clientId) {
    return <WorkspaceGerekli ekran="Reklam Stüdyosu" neden="Reklam bir workspace’in reklam hesabında kuruluyor." {...workspaceSecimVerisi(session)} />;
  }
  if (!hasPermission(session, 'bulk.write')) return <Kutu ton="uyari" baslik="Reklam oluşturma yetkin yok">Workspace yöneticine danış.</Kutu>;
  let hazirlik: ReklamHazirligi;
  try {
    hazirlik = await serverApiFetch<ReklamHazirligi>(`/reklam/hazirlik?clientId=${clientId}`);
  } catch (e) {
    return <Kutu ton="tehlike" baslik="Reklam hazırlığı okunamadı">{e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.'}</Kutu>;
  }
  const client = session.availableClients.find((c) => c.id === clientId);
  return (
    <div className="space-y-5">
      <Baslik
        baslik="Reklam Stüdyosu"
        aciklama={<><strong className="text-ink">{client?.name ?? 'Workspace'}</strong> · önizleme sürümü</>}
        ust={<Link href={`/reklam/yeni?musteri=${clientId}`} className="text-xs text-ink-muted hover:text-ink">Taslaklar →</Link>}
      />
      {(hazirlik.hesaplar.length === 0 || hazirlik.sayfalar.length === 0) && (
        <Kutu ton="uyari" baslik={hazirlik.hesaplar.length === 0 ? 'Bu workspace’e Meta reklam hesabı atanmamış' : 'Bu workspace’te Facebook sayfası yok'}
          eylem={<Link href={`/marka-merkezi?bolum=baglantilar&musteri=${clientId}`} className={dugmeSinifi('ikincil', true)}>Bağlantılara git</Link>}>
          Taslak kurulur ama yayınlanamaz.
        </Kutu>
      )}
      <ReklamStudyosu clientId={clientId} hazirlik={hazirlik} />
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
