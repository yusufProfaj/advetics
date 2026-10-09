import type { RehberHazirligi, RehberKaydi, RehberListesi } from '@advetics/shared';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import { RehberEkrani } from '@/components/rehber/rehber-ekrani';
import { RehberGirisi, RehberMesaji } from '@/components/rehber/rehber-girisi';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { hasPermission, requireSession } from '@/lib/session';

export const metadata = { title: 'AdvCampaign · Advetics' };
export const dynamic = 'force-dynamic';

/**
 * ADVCAMPAIGN — reklam kurmanın tek yolu. 2026-10-10'dan beri sohbet değil
 * altı adımlı REHBER (kullanıcı onayladı: `docs/advcampaign/rehber-taslak.html`,
 * mimari `docs/advcampaign/MIMARI-REHBER.md`). Yapay zekâ yalnız düğme
 * arkasında ("Metin öner", "Anahtar kelime öner").
 *
 * İki hâl, tek adres: `?rehber=` yoksa giriş (açık rehberler + "Yeni
 * reklam"), varsa rehberin kendisi odaklı kipte. Rehber kimliği adreste:
 * yenileyen ya da bağlantıyı paylaşan kişi aynı rehbere döner.
 */
export default async function AdvCampaignPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const params = await searchParams;
  const clientId = sayfaWorkspaceId(session, first(params.musteri));
  if (!clientId) {
    return <WorkspaceGerekli ekran="AdvCampaign" neden="Reklam bir workspace’in reklam hesabında kuruluyor." {...workspaceSecimVerisi(session)} />;
  }
  if (!hasPermission(session, 'bulk.write')) {
    return <RehberMesaji baslik="Reklam oluşturma yetkin yok">Workspace yöneticine danış.</RehberMesaji>;
  }
  const workspaceAdi = session.availableClients.find((c) => c.id === clientId)?.name ?? 'Workspace';
  const listeAdresi = baglanti('/reklam', { musteri: clientId });
  const rehberId = first(params.rehber);

  if (!rehberId) {
    /*
     * İYİLEŞTİR ASİSTANININ DEVRİ (`devretAdresi`, `?oturum=`) sohbet
     * oturumunu açıyordu; sohbet kalktı. Oturum kimliği rehber kimliği
     * DEĞİL ve yok sayılmıyor: giriş, isteğin rehberde yeniden kurulacağını
     * söylüyor. Sessizce listeye düşmek, kartın "aktarıldı" sözünü yalan
     * bırakırdı.
     */
    const devredildi = first(params.oturum) !== undefined;
    let liste: RehberListesi | null = null;
    let listeHatasi: string | null = null;
    try {
      liste = await serverApiFetch<RehberListesi>(`/reklam/rehberler?clientId=${encodeURIComponent(clientId)}`);
    } catch (e) {
      listeHatasi = hata(e);
    }
    return <RehberGirisi clientId={clientId} workspaceAdi={workspaceAdi} liste={liste} listeHatasi={listeHatasi} devredildi={devredildi} />;
  }

  const [r, h] = await Promise.allSettled([
    serverApiFetch<RehberKaydi>(`/reklam/rehberler/${encodeURIComponent(rehberId)}`),
    serverApiFetch<RehberHazirligi>(`/reklam/rehber/hazirlik?clientId=${encodeURIComponent(clientId)}`),
  ]);
  // Okuma hataları AYRI cümleyle: rehber olmadan devam edilemez, hazırlık
  // olmadan hiçbir hesap ya da sayfa seçilemez.
  if (r.status === 'rejected') {
    return (
      <RehberMesaji baslik="Reklam taslağı okunamadı" geri={listeAdresi}>
        {hata(r.reason)}
      </RehberMesaji>
    );
  }
  if (h.status === 'rejected') {
    return (
      <RehberMesaji baslik="Reklam hazırlığı okunamadı" geri={listeAdresi}>
        {hata(h.reason)} Sayfayı yenilemeyi dene.
      </RehberMesaji>
    );
  }
  // Adresteki workspace ile rehberinki ayrışırsa YANLIŞ workspace'in
  // hesapları seçenek olarak gelirdi.
  if (r.value.clientId !== clientId) {
    return (
      <RehberMesaji baslik="Bu reklam başka bir workspace’e ait" geri={listeAdresi}>
        Listeye dönüp yeniden aç.
      </RehberMesaji>
    );
  }
  return (
    <RehberEkrani
      key={r.value.id}
      ilkKayit={r.value}
      hazirlik={h.value}
      sirketAdi={workspaceSecimVerisi(session).sirketAdi}
      workspaceAdi={workspaceAdi}
    />
  );
}

function hata(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.';
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
