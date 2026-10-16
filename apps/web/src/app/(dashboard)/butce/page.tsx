import { hasPermission, requireSession } from '@/lib/session';
import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { Uyari } from '@/components/ui/uyari';
import { ButceIcerik } from '@/components/butce/butce-icerik';
import { menuBolumuEtiketi, menuSatiriEtiketi } from '@/lib/nav-sections';
import { dilAl } from '@/dil/sunucu';
import { butceSozlugu } from '@/dil/sozlukler/butce';
import { sec } from '@advetics/shared';

/** Başlık istek anında: dil çerezden okunuyor. */
export async function generateMetadata() {
  return { title: `${menuSatiriEtiketi('/butce', await dilAl())} · Advetics` };
}
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
  const dil = await dilAl();
  const d = sec(butceSozlugu, dil).sayfa;
  const ad = menuSatiriEtiketi('/butce', dil);
  const params = await searchParams;

  const clientId = sayfaWorkspaceId(session, first(params.musteri));
  if (!clientId) {
    return (
      <WorkspaceGerekli
        ekran={ad}
        neden={d.workspaceNeden}
        {...workspaceSecimVerisi(session)}
      />
    );
  }

  const basliklar = {
    baslik: ad,
    aciklama: d.aciklama,
    bolum: menuBolumuEtiketi('/butce', dil),
  };
  const baslik = <SayfaBasligi {...basliklar} />;

  if (!hasPermission(session, 'budget.read')) {
    return (
      <div className="space-y-5">
        {baslik}
        <Uyari ton="uyari" baslik={d.yetkiYok}>
          {d.yoneticineSor}
        </Uyari>
      </div>
    );
  }

  return (
    // Başlık İÇERİKTE çiziliyor: birincil "Bütçeyi düzenle" ayın verisini
    // (var olan şemsiye bütçe) istiyor ve o veri orada okunuyor.
    <ButceIcerik clientId={clientId} params={params} baslik={basliklar} />
  );
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
