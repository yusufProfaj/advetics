import { hasPermission, requireSession } from '@/lib/session';
import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { Uyari } from '@/components/ui/uyari';
import { ButceIcerik } from '@/components/butce/butce-icerik';

export const metadata = { title: 'Aylık Bütçe · Advetics' };
export const dynamic = 'force-dynamic';

/**
 * PLANLA › AYLIK BÜTÇE (2026-10-09, kullanıcı kararı).
 *
 * Bu adres 2026-10-06'dan beri Marka Merkezi'ne yönleniyordu; bütçe artık
 * yine kendi sayfası ve Marka Merkezi'nin `?bolum=butce` adresi BURAYA
 * yönleniyor (yönün tersine dönmesi, eski yer imlerinin kırılmaması için).
 *
 * KAPI `budget.read`: menü satırı `budget.write` istiyor (müşteri hesabı
 * kaydedemeyeceği bir forma menüden gitmesin), ama doğrudan bağlantıyla
 * gelen okuma yetkilisi tabloyu salt okunur görüyor — bileşen yazma
 * düğmelerini `budget.write`e bağlıyor.
 */
export default async function ButcePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession();
  const params = await searchParams;

  const clientId = sayfaWorkspaceId(session, first(params.musteri));
  if (!clientId) {
    return (
      <WorkspaceGerekli
        ekran="Aylık Bütçe"
        neden="Bütçe bir workspace’in reklam hesapları için tanımlanıyor."
        {...workspaceSecimVerisi(session)}
      />
    );
  }

  const baslik = (
    <SayfaBasligi
      baslik="Aylık Bütçe"
      aciklama="Ay ay harcama hedefi ve gidişat. Plan AdvStrategy’de, burada ayın taahhüdü."
    />
  );

  if (!hasPermission(session, 'budget.read')) {
    return (
      <div className="space-y-5">
        {baslik}
        <Uyari ton="uyari" baslik="Bütçeleri görme yetkin yok.">
          Yöneticine sor.
        </Uyari>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {baslik}
      <ButceIcerik clientId={clientId} params={params} />
    </div>
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
