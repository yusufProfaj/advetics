import { redirect } from 'next/navigation';
import {
  STRATEJI_SAYFA_IZNI,
  eskiGorunumEkrani,
  olusturmaAdimiMi,
  stratejiDuzenlenebilirMi,
  stratejiEkrani,
  stratejiEkranKapisi,
  stratejiPanelAdresi,
  stratejiUcYolu,
  type PlanDetayi,
} from '@advetics/shared';
import { sec, type Dil } from '@advetics/shared';
import { dilAl } from '@/dil/sunucu';
import { stratejiV2Sozlugu } from '@/dil/sozlukler/strateji-v2';
import { menuBolumuEtiketi, menuSatiriEtiketi } from '@/lib/nav-sections';
import { serverApiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { hasPermission, requireSession } from '@/lib/session';
import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import { HataDurumu } from '@/components/ui/hal';
import { SayfaBasligi } from '@/components/ui/sayfa-basligi';
import { PlanEkrani } from '@/components/strateji/plan-ekrani';
import { bolumCoz, okumaHatasi, ucAdresi } from '@/components/strateji/hesap';
import { adrestekiHedefler } from '@/components/strateji/v2/akis';
import { StratejiGirisi, StratejiListesiEkrani } from '@/components/strateji/v2/giris';
import { KampanyaKurulumu } from '@/components/strateji/v2/kurulum';
import { RaporEkrani } from '@/components/strateji/v2/rapor-ekrani';
import { StratejiSihirbazi } from '@/components/strateji/v2/sihirbaz';
import { Bildirim } from '@/components/strateji/v2/ortak';
import type { AktarimOnizlemesi, Gerceklesen, StratejiDetayi, StratejiListesi, StratejiSihirbazGirdileri, StratejiYorumlari } from '@advetics/shared';

/** Başlık istek anında: dil çerezden okunuyor; sayfa adı menünün kendi çevirisinden. */
export async function generateMetadata() {
  return { title: `${menuSatiriEtiketi('/strateji', await dilAl())} · Advetics` };
}
export const dynamic = 'force-dynamic';

type Okuma<T> = { tur: 'veri'; v: T } | { tur: 'hata'; mesaj: string };
/** Okuma yardımcısı dilli: ağ hatasının "ulaşılamadı" cümlesi de ekranın dilinde. */
const okuYap =
  (dil: Dil) =>
  <T,>(yol: string): Promise<Okuma<T>> =>
    serverApiFetch<T>(yol).then(
      (v) => ({ tur: 'veri' as const, v }),
      (e: unknown) => ({ tur: 'hata' as const, mesaj: okumaHatasi(e, dil) }),
    );

/**
 * ═══ ADVSTRATEGY — ADIM ADIM AKIŞ (kullanıcı onaylı taslak `simulasyon.html`) ═══
 *
 * Kullanıcı sekmeli ekranı (strateji / belge / aktarım) *"çok karışık"*
 * buldu ve istedi: *"stratejiye tıkladılar ve 2 seçenek var raporu incele ya
 * da strateji oluştur"*. Ekran adreste (`?adim=`), kapıyı sözleşme veriyor
 * (`stratejiEkranKapisi`):
 *
 * - giriş: iki büyük kart.
 * - Strateji oluştur: yedi adım (Hedef → … → Gönder), istemcide geçer.
 * - Raporu incele: liste → kurumsal rapor (onay) → onaylıysa "Kampanyaları
 *   kur" (tek tek).
 *
 * MÜŞTERİ HESABI yalnız "Raporu incele" yolunu görür: kapı onu `raporlar`a
 * düşürür ve oluşturma ile kurma bileşenleri hiç monte edilmez.
 *
 * ESKİ ADRESLER ölmez: `?gorunum=belge|aktar|duzenle` yeni ekrana yönlenir
 * (maillerdeki ve rehberin "Stratejiden" kutusundaki bağlantılar).
 * ESKİ PLANLAR (`bicim = 1`) listede, v1 ekranıyla SALT OKUNUR açılır.
 *
 * DÖRT HÂL AYRI: liste okunamadı, liste boş (nedeniyle), plan okunamadı, yan
 * okumalar düştü; hatalar kendi kutusunda yazar.
 */
export default async function StratejiPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const params = await searchParams;
  const dil = await dilAl();
  const d = sec(stratejiV2Sozlugu, dil).sayfa;
  const oku = okuYap(dil);

  const clientId = sayfaWorkspaceId(session, first(params.musteri));
  if (!clientId) {
    return <WorkspaceGerekli ekran={menuSatiriEtiketi('/strateji', dil)} neden={d.workspaceGerekli} {...workspaceSecimVerisi(session)} />;
  }

  const planParam = first(params.plan) ?? null;
  const eski = eskiGorunumEkrani(first(params.gorunum));
  if (eski && !first(params.adim)) redirect(stratejiPanelAdresi({ musteri: clientId, plan: eski === 'giris' ? null : planParam, adim: eski }));

  const baslik = (aciklama?: React.ReactNode) => <SayfaBasligi bolum={menuBolumuEtiketi('/strateji', dil)} baslik={menuSatiriEtiketi('/strateji', dil)} aciklama={aciklama} />;
  const ekran = stratejiEkranKapisi(session.permissions, stratejiEkrani(first(params.adim)));
  if (!hasPermission(session, STRATEJI_SAYFA_IZNI) || ekran === null) {
    return (
      <div className="space-y-5">
        {baslik()}
        <Bildirim baslik={d.yetkiYok}>{d.yoneticineSor}</Bildirim>
      </div>
    );
  }
  const workspaceAdi = session.availableClients.find((c) => c.id === clientId)?.name ?? null;
  const ws = workspaceAdi ? <strong className="font-medium text-ink">{workspaceAdi}</strong> : null;
  // ⋯ menüsündeki "Kampanyaları kur" yalnız kurma ekranına girebilene: kapı AYNI fonksiyon.
  const kurabilir = stratejiEkranKapisi(session.permissions, 'kur') === 'kur';
  // İptal ve silme oluşturma yetkisiyle aynı kapı; müşteri hesabında yok.
  const yonetebilir = session.permissions.includes('strategy.write');

  // ── Strateji oluştur (yedi adım) ──
  if (olusturmaAdimiMi(ekran)) {
    const [girdiler, detay] = await Promise.all([
      oku<StratejiSihirbazGirdileri>(baglanti(stratejiUcYolu('/strateji/v2/sihirbaz-girdileri'), { clientId })),
      planParam ? oku<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar/:id', { id: planParam })) : Promise.resolve(null),
    ]);
    if (detay?.tur === 'hata') {
      return (
        <div className="space-y-5">
          {baslik(ws)}
          <HataDurumu baslik={d.stratejiAlinamadi} mesaj={detay.mesaj} />
        </div>
      );
    }
    // PLAN BAŞKA WORKSPACE'İN (Ajan 4, 2026-10-13): girdiler (hedef kapıları,
    // Meta asgarisi, bölge önerisi) adresteki `musteri`den, plan ise kendi
    // workspace'inden okunuyordu. İki workspace'e erişen ajans çalışanı
    // `?musteri=A&plan=<B'nin planı>` ile açınca B'nin planını A'nın
    // kapılarıyla düzenliyordu; hiçbir hata yok. Planın workspace'ine yönlen.
    if (detay && detay.v.plan.clientId !== clientId) {
      redirect(stratejiPanelAdresi({ musteri: detay.v.plan.clientId, plan: detay.v.plan.id, adim: ekran }));
    }
    // Onaya gitmiş ya da onaylanmış strateji düzenlenmez: raporuna.
    if (detay && !stratejiDuzenlenebilirMi(detay.v.plan.durum) && ekran !== 'gonder') {
      redirect(stratejiPanelAdresi({ musteri: clientId, plan: detay.v.plan.id, adim: 'rapor' }));
    }
    return (
      <StratejiSihirbazi
        key={detay?.v.plan.id ?? 'yeni'}
        clientId={clientId}
        ilkDetay={detay?.v ?? null}
        ilkAdim={ekran}
        ilkAmaclar={adrestekiHedefler(first(params.amaclar))}
        girdiler={girdiler}
        izinler={session.permissions}
      />
    );
  }

  const liste = await oku<StratejiListesi>(baglanti(stratejiUcYolu('/strateji/v2/planlar'), { clientId }));
  if (liste.tur === 'hata') {
    return (
      <div className="space-y-5">
        {baslik(ws)}
        <HataDurumu baslik={d.stratejilerAlinamadi} mesaj={liste.mesaj} />
      </div>
    );
  }

  // ── Giriş: iki kart ──
  if (ekran === 'giris') {
    const acik = liste.v.planlar.find((p) => p.bicim === 2 && (p.durum === 'taslak' || p.durum === 'revizyon'));
    // "Taslağa devam et" kaldığı adımı açsın: adım planın sihirbaz durumunda.
    const acikDetay = acik ? await oku<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar/:id', { id: acik.id })) : null;
    return (
      <StratejiGirisi
        clientId={clientId}
        planlar={liste.v.planlar}
        toplam={liste.v.toplam}
        kurabilir={kurabilir}
        yonetebilir={yonetebilir}
        aciklama={ws ? <WsMetni metin={d.girisAciklama} ws={ws} /> : undefined}
        devamAdimi={acikDetay?.tur === 'veri' ? (acikDetay.v.sihirbaz?.adim ?? null) : null}
      />
    );
  }

  // ── Raporu incele: liste ──
  const secili = planParam ? (liste.v.planlar.find((p) => p.id === planParam) ?? null) : null;
  if (ekran === 'raporlar' || !secili) {
    return (
      <div className="space-y-5">
        {baslik(ws)}
        {planParam && !secili && <Bildirim baslik={d.baglantidakiYok}>{d.listedenSec}</Bildirim>}
        <StratejiListesiEkrani clientId={clientId} planlar={liste.v.planlar} toplam={liste.v.toplam} kurabilir={kurabilir} yonetebilir={yonetebilir} />
      </div>
    );
  }

  // ── Eski medya planı: v1 ekranı, salt okunur ──
  if (secili.bicim === 1) {
    const v1 = await oku<PlanDetayi>(ucAdresi('/strateji/planlar/:id', secili.id));
    return (
      <div className="space-y-5">
        {baslik(<>{ws} · {d.eskiPlan}</>)}
        {v1.tur === 'veri' ? (
          <PlanEkrani key={secili.id} clientId={clientId} ilkDetay={v1.v} bolum={bolumCoz(first(params.bolum))} yazabilir={false} />
        ) : (
          <HataDurumu baslik={d.planAlinamadi} mesaj={v1.mesaj} />
        )}
      </div>
    );
  }

  const id = { id: secili.id };
  const detay = await oku<StratejiDetayi>(stratejiUcYolu('/strateji/v2/planlar/:id', id));
  if (detay.tur === 'hata') {
    return (
      <div className="space-y-5">
        {baslik(ws)}
        <HataDurumu baslik={d.stratejiAlinamadi} mesaj={detay.mesaj} />
      </div>
    );
  }
  const { plan } = detay.v;
  const onayli = plan.durum === 'onaylandi' || plan.durum === 'kapandi';

  // ── Kampanyaları kur (tek tek) ──
  if (ekran === 'kur') {
    const onizleme = plan.durum === 'onaylandi' && plan.onaylananSurum === plan.surum ? await oku<AktarimOnizlemesi>(stratejiUcYolu('/strateji/v2/planlar/:id/aktarim-onizleme', id)) : null;
    return (
      <div className="space-y-5">
        {baslik(ws)}
        <KampanyaKurulumu clientId={clientId} ilkDetay={detay.v} ilkKalem={first(params.kalem) ?? null} onizleme={onizleme} izinler={session.permissions} />
      </div>
    );
  }

  // ── Rapor ──
  const [yorumlar, gerceklesen] = await Promise.all([
    oku<StratejiYorumlari>(stratejiUcYolu('/strateji/v2/planlar/:id/yorumlar', id)),
    onayli ? oku<Gerceklesen>(stratejiUcYolu('/strateji/v2/planlar/:id/gerceklesen', id)) : Promise.resolve(null),
  ]);
  return (
    <div className="space-y-5">
      {baslik(ws)}
      <RaporEkrani
        key={plan.id}
        clientId={clientId}
        ilkDetay={detay.v}
        yorumlar={yorumlar.tur === 'veri' ? { tur: 'veri', v: yorumlar.v.yorumlar } : yorumlar}
        gerceklesen={gerceklesen}
        izinler={session.permissions}
      />
    </div>
  );
}

/** "{ws}" yer tutucusu çevirinin içinde: sözcük sırası dile göre değişiyor, ad kalın kalıyor. */
function WsMetni({ metin, ws }: { metin: string; ws: React.ReactNode }) {
  const [once = '', sonra = ''] = metin.split('{ws}');
  return (
    <>
      {once}
      {ws}
      {sonra}
    </>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
