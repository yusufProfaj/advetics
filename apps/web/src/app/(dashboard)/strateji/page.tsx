import type { ReactNode } from 'react';
import { STRATEJI_SAYFA_IZNI, type PlanDetayi, type PlanListesi as PlanListesiVerisi } from '@advetics/shared';
import { serverApiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { hasPermission, requireSession } from '@/lib/session';
import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { Uyari } from '@/components/ui/uyari';
import { PlanListesi } from '@/components/strateji/plan-listesi';
import { PlanEkrani } from '@/components/strateji/plan-ekrani';
import { bolumCoz, donemEtiketi, gelecekAy, okumaHatasi, planSec, ucAdresi } from '@/components/strateji/hesap';

export const metadata = { title: 'AdvStrategy · Advetics' };
export const dynamic = 'force-dynamic';

/**
 * ═══ ADVSTRATEGY — AYLIK MEDYA PLANI ═══
 *
 * "Gelecek ay ne yapacağız?" sorusunun cevabı: bütçe dağılımı, Google arama
 * kurgusu ve kitle × kreatif matrisi tek planda. Plan onaylanınca
 * AdvCampaign'de hazır oturumlar açılır; plan platforma YAZMAZ (Ç-2).
 *
 * TEK SAYFA, İÇ MENÜ (`?bolum=`), Marka Merkezi deseni: bölümleri ayrı
 * sayfaya bölmek bu projede iki kez hata üretti. Seçili plan da adreste
 * (`?plan=`), yani bağlantı paylaşılabiliyor.
 *
 * SAYFA KAPISI menü satırıyla AYNI anahtar (`STRATEJI_SAYFA_IZNI`): ayrı
 * yazılırsa menüde görünüp açılmayan bir satır doğar.
 */
export default async function StratejiPage({
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
        ekran="AdvStrategy"
        neden="Medya planı bir workspace’in reklam bütçesi için hazırlanıyor."
        {...workspaceSecimVerisi(session)}
      />
    );
  }

  const baslik = (aciklama?: ReactNode) => <SayfaBasligi baslik="AdvStrategy" aciklama={aciklama} />;

  if (!hasPermission(session, STRATEJI_SAYFA_IZNI)) {
    return (
      <div className="space-y-5">
        {baslik()}
        <Uyari ton="uyari" baslik="Medya planlarını görme yetkin yok.">
          Yöneticine sor.
        </Uyari>
      </div>
    );
  }

  const yazabilir = hasPermission(session, 'strategy.write');
  const bolum = bolumCoz(first(params.bolum));
  const workspaceAdi = session.availableClients.find((c) => c.id === clientId)?.name ?? null;
  const aciklama = (
    <>
      {workspaceAdi && <strong className="font-medium text-ink">{workspaceAdi}</strong>}
      {workspaceAdi && ' · '}
      Gelecek ayın bütçesi, arama kelimeleri ve kim hangi reklamı görecek. Onaylanan plan AdvCampaign’e aktarılır.
    </>
  );

  /*
   * DÖRT HÂL AYRI. Liste okunamazsa sunucunun cümlesi ekranda; boş liste
   * nedeniyle (`PlanListesi`); plan okunamazsa liste yine görünür ve hata
   * yalnız sağ tarafta. Hatayı boş listeye çeviren bir yakalayıcı burada
   * "plan yok" ile "çağrı düştü"yü aynı ekrana çevirirdi.
   */
  const liste = await serverApiFetch<PlanListesiVerisi>(baglanti(ucAdresi('/strateji/planlar'), { clientId })).then(
    (v) => ({ ok: true as const, v }),
    (e: unknown) => ({ ok: false as const, hata: okumaHatasi(e) }),
  );

  if (!liste.ok) {
    return (
      <div className="space-y-5">
        {baslik(aciklama)}
        <Uyari ton="tehlike" baslik="Planlar alınamadı.">
          {liste.hata}
        </Uyari>
      </div>
    );
  }

  const secim = planSec(liste.v.planlar, first(params.plan));
  const detay = secim.plan
    ? await serverApiFetch<PlanDetayi>(ucAdresi('/strateji/planlar/:id', secim.plan.id)).then(
        (v) => ({ ok: true as const, v }),
        (e: unknown) => ({ ok: false as const, hata: okumaHatasi(e) }),
      )
    : null;

  return (
    <div className="space-y-5">
      {baslik(aciklama)}

      {secim.adrestekiYok && secim.plan && (
        <Uyari ton="uyari" baslik="Bağlantıdaki plan bu workspace’te bulunamadı.">
          En yeni plan açıldı: {donemEtiketi(secim.plan.donem)}.
        </Uyari>
      )}

      <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <PlanListesi
          clientId={clientId}
          liste={liste.v}
          seciliId={secim.plan?.id ?? null}
          bolum={bolum}
          yazabilir={yazabilir}
          varsayilanDonem={gelecekAy(new Date())}
        />

        {detay === null ? null : detay.ok ? (
          // `key` PLANDAN: başka plana geçince taslaklar sıfırlanmalı, taşınmamalı.
          <PlanEkrani key={detay.v.plan.id} clientId={clientId} ilkDetay={detay.v} bolum={bolum} yazabilir={yazabilir} />
        ) : (
          <Uyari ton="tehlike" baslik="Plan alınamadı.">
            {detay.hata}
          </Uyari>
        )}
      </div>
    </div>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
