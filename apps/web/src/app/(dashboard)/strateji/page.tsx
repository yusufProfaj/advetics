import type { ReactNode } from 'react';
import {
  STRATEJI_SAYFA_IZNI,
  stratejiGorunumKapisi,
  stratejiGorunumu,
  stratejiUcYolu,
  type PlanDetayi,
} from '@advetics/shared';
import { serverApiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { hasPermission, requireSession } from '@/lib/session';
import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { PlanEkrani } from '@/components/strateji/plan-ekrani';
import { bolumCoz, gelecekAy, okumaHatasi, ucAdresi } from '@/components/strateji/hesap';
import { StratejiGorunumleri } from '@/components/strateji/v2/gorunumler';
import { Bildirim } from '@/components/strateji/v2/ortak';
import { STRATEJI_DURUM_ETIKETI, donemMetni, monteGorunumler } from '@/components/strateji/v2/hesap';
import { PlanSecici, YeniStrateji } from '@/components/strateji/v2/plan-secici';
import type { AktarimOnizlemesi, Gerceklesen, StratejiDetayi, StratejiGirdileri, StratejiListesi, StratejiYorumlari } from '@advetics/shared';

export const metadata = { title: 'AdvStrategy · Advetics' };
export const dynamic = 'force-dynamic';

type Okuma<T> = { tur: 'veri'; v: T } | { tur: 'hata'; mesaj: string };
const oku = <T,>(yol: string): Promise<Okuma<T>> =>
  serverApiFetch<T>(yol).then(
    (v) => ({ tur: 'veri' as const, v }),
    (e: unknown) => ({ tur: 'hata' as const, mesaj: okumaHatasi(e) }),
  );

/**
 * ═══ ADVSTRATEGY v2 — STRATEJİ, BELGE, AKTARIM (YENIDEN-TASARIM.md) ═══
 *
 * TEK SAYFA, ÜÇ GÖRÜNÜM (`?gorunum=duzenle|belge|aktar`). Hangisinin
 * açılacağına sözleşmenin `stratejiGorunumKapisi` karar verir: müşteri hesabı
 * (`strategy.read` + `approve`) `?gorunum=duzenle` yazsa da BELGEYİ görür ve
 * düzenleyici hiç monte edilmez (`monteGorunumler`).
 *
 * SAYFA KAPISI menü satırıyla AYNI anahtar (`STRATEJI_SAYFA_IZNI`).
 *
 * ESKİ PLANLAR (`bicim = 1`) SİLİNMEDİ: aynı listede, v1 ekranıyla SALT
 * OKUNUR açılıyor (§ 1.8). v1 bileşenleri yalnız bunun için duruyor.
 *
 * DÖRT HÂL AYRI: liste okunamadı, liste boş (nedeniyle), plan okunamadı,
 * yan okumalar (girdiler, yorumlar, önizleme) düştü. Yan okumanın düşmesi
 * planı göstermeyi engellemez; hata kendi kutusunda yazar.
 */
export default async function StratejiPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const params = await searchParams;

  const clientId = sayfaWorkspaceId(session, first(params.musteri));
  if (!clientId) {
    return <WorkspaceGerekli ekran="AdvStrategy" neden="Strateji bir workspace'in reklam bütçesi için hazırlanıyor." {...workspaceSecimVerisi(session)} />;
  }

  const baslik = (aciklama?: ReactNode, eylemler?: ReactNode) => <SayfaBasligi baslik="AdvStrategy" aciklama={aciklama} eylemler={eylemler} />;

  const gorunum = stratejiGorunumKapisi(session.permissions, stratejiGorunumu(first(params.gorunum)));
  if (!hasPermission(session, STRATEJI_SAYFA_IZNI) || gorunum === null) {
    return (
      <div className="space-y-5">
        {baslik()}
        <Bildirim baslik="Stratejileri görme yetkin yok.">
          Yöneticine sor.
        </Bildirim>
      </div>
    );
  }

  const yazabilir = hasPermission(session, 'strategy.write');
  const workspaceAdi = session.availableClients.find((c) => c.id === clientId)?.name ?? null;

  const liste = await oku<StratejiListesi>(baglanti(stratejiUcYolu('/strateji/v2/planlar'), { clientId }));
  if (liste.tur === 'hata') {
    return (
      <div className="space-y-5">
        {baslik(workspaceAdi)}
        <Bildirim hata baslik="Stratejiler alınamadı.">
          {liste.mesaj}
        </Bildirim>
      </div>
    );
  }

  const istenen = first(params.plan);
  const secili = liste.v.planlar.find((p) => p.id === istenen) ?? liste.v.planlar[0] ?? null;
  const acikVar = liste.v.planlar.some((p) => p.bicim === 2 && (p.durum === 'taslak' || p.durum === 'onayda' || p.durum === 'revizyon'));
  const eylemler = (
    <>
      <PlanSecici clientId={clientId} liste={liste.v} seciliId={secili?.id ?? null} gorunum={gorunum} />
      {/* Workspace başına TEK açık strateji (kısmi tekil indeks): açık varken yeni düğmesi yok, sunucunun 409'unu beklemiyoruz. */}
      {yazabilir && !acikVar && liste.v.planlar.length > 0 && <YeniStrateji clientId={clientId} varsayilanAy={gelecekAy(new Date())} baslangictaAcik={false} />}
    </>
  );

  if (!secili) {
    return (
      <div className="space-y-5">
        {baslik(workspaceAdi, null)}
        {yazabilir ? (
          <YeniStrateji clientId={clientId} varsayilanAy={gelecekAy(new Date())} baslangictaAcik />
        ) : (
          // BOŞ LİSTE NEDENİNİ SÖYLÜYOR: okuyan hesabın yapacağı iş beklemek.
          <p className="rounded-xl border border-dashed border-line bg-surface p-5 text-center text-sm text-ink-muted">Bu workspace için henüz strateji yok. Ajansınız hazırlayınca burada görünür.</p>
        )}
      </div>
    );
  }

  const adresteYok = Boolean(istenen) && secili.id !== istenen;

  // ── Eski medya planı: v1 ekranı, salt okunur ──
  if (secili.bicim === 1) {
    const v1 = await oku<PlanDetayi>(ucAdresi('/strateji/planlar/:id', secili.id));
    return (
      <div className="space-y-5">
        {baslik(<>{workspaceAdi} · Eski medya planı, salt okunur. Yeni stratejiler AdvCampaign'e aktarılabilir.</>, eylemler)}
        {adresteYok && <AdresteYok />}
        {v1.tur === 'veri' ? (
          <PlanEkrani key={secili.id} clientId={clientId} ilkDetay={v1.v} bolum={bolumCoz(first(params.bolum))} yazabilir={false} />
        ) : (
          <Bildirim hata baslik="Plan alınamadı.">
            {v1.mesaj}
          </Bildirim>
        )}
      </div>
    );
  }

  const detay = await oku<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar/:id', { id: secili.id }));
  if (detay.tur === 'hata') {
    return (
      <div className="space-y-5">
        {baslik(workspaceAdi, eylemler)}
        <Bildirim hata baslik="Strateji alınamadı.">
          {detay.mesaj}
        </Bildirim>
      </div>
    );
  }

  const { plan } = detay.v;
  const monte = monteGorunumler(session.permissions);
  const onayli = plan.durum === 'onaylandi' || plan.durum === 'kapandi';
  const aktarilabilir = plan.durum === 'onaylandi' && plan.onaylananSurum === plan.surum;
  const id = { id: plan.id };
  // Yan okumalar paralel; her biri kendi hatasını taşır.
  const [girdiler, yorumlar, onizleme, gerceklesen] = await Promise.all([
    monte.includes('duzenle') ? oku<StratejiGirdileri>(stratejiUcYolu('/strateji/v2/planlar/:id/girdiler', id)) : Promise.resolve(null),
    oku<StratejiYorumlari>(stratejiUcYolu('/strateji/v2/planlar/:id/yorumlar', id)),
    monte.includes('aktar') ? (aktarilabilir ? oku<AktarimOnizlemesi>(stratejiUcYolu('/strateji/v2/planlar/:id/aktarim-onizleme', id)) : Promise.resolve({ tur: 'onaysiz' as const })) : Promise.resolve(null),
    onayli ? oku<Gerceklesen>(stratejiUcYolu('/strateji/v2/planlar/:id/gerceklesen', id)) : Promise.resolve(null),
  ]);

  return (
    <div className="space-y-5">
      {baslik(
        <>
          {workspaceAdi && <strong className="font-medium text-ink">{workspaceAdi}</strong>}
          {workspaceAdi && ' · '}
          {donemMetni(plan.baslangic, plan.bitis)} stratejisi · {STRATEJI_DURUM_ETIKETI[plan.durum]} · sürüm {plan.surum}
        </>,
        eylemler,
      )}
      {adresteYok && <AdresteYok />}
      <StratejiGorunumleri
        key={plan.id}
        clientId={clientId}
        ilkDetay={detay.v}
        gorunum={gorunum}
        monte={monte}
        izinler={session.permissions}
        girdiler={girdiler}
        yorumlar={yorumlar.tur === 'veri' ? { tur: 'veri', v: yorumlar.v.yorumlar } : yorumlar}
        onizleme={onizleme}
        gerceklesen={gerceklesen}
      />
    </div>
  );
}

/** Bağlantıdaki strateji bulunamadı: başkası gösteriliyor ve bu SÖYLENİYOR. */
function AdresteYok() {
  return (
    <Bildirim baslik="Bağlantıdaki strateji bu workspace'te bulunamadı.">
      En yeni strateji açıldı.
    </Bildirim>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
