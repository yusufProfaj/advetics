import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import Link from 'next/link';
import { NIYET_KATALOGU, type AtifDurumu, type NiyetKodu, type ReklamHazirligi, type ReklamTaslakKaydi } from '@advetics/shared';
import { hasPermission, requireSession } from '@/lib/session';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { formatRelative } from '@/lib/format';
import { Baslik, Kutu, dugmeSinifi } from '@/reklam/ui';
import { YeniReklamAkisi } from '@/reklam/akis/yeni-reklam-akisi';
import { YeniTaslakDugmesi } from '@/reklam/akis/yeni-taslak-dugmesi';

export const metadata = { title: 'Yeni Reklam (önizleme) · Advetics' };
export const dynamic = 'force-dynamic';

/**
 * Yeni Reklam Oluştur — Acemi akışı (docs/meta-reklam-brief/tasarim/TASARIM.md
 * § 03-04). YENİ REKLAM MODÜLÜ (`apps/web/src/reklam/`, kullanıcı kararı
 * 2026-10-07: "tamamen ayrı modül"): eski Reklam Oluştur / Hızlı Reklam /
 * ad-builder koduna hiçbir şey eklemiyor ve onlardan bileşen almıyor.
 *
 * MENÜDE YOK, BİLEREK: yayın motoru bağlı değil ve menüye konan bir ekran
 * "kullanılabilir" sözü verir. Adres doğrudan: /reklam/yeni.
 *
 * `?taslak=` yoksa açık taslaklar ve "Yeni reklam başlat"; varsa akış.
 */
export default async function YeniReklamPage({
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
        ekran="Yeni Reklam"
        neden="Reklam bir workspace’in reklam hesabında kuruluyor."
        {...workspaceSecimVerisi(session)}
      />
    );
  }
  if (!hasPermission(session, 'bulk.write')) {
    return <Kutu ton="uyari" baslik="Reklam oluşturma yetkin yok">Workspace yöneticine danış.</Kutu>;
  }
  const client = session.availableClients.find((c) => c.id === clientId);
  const workspaceAdi = client?.name ?? 'Workspace';
  const taslakId = first(params.taslak);

  const ust = (
    <Link
      href={taslakId ? `/reklam/yeni?musteri=${clientId}` : `/reklam?musteri=${clientId}`}
      className="text-xs text-ink-muted hover:text-ink"
    >
      ← {taslakId ? 'Taslaklar' : 'AdvCampaign'}
    </Link>
  );
  const onizleme = (
    <Kutu ton="bilgi" baslik="Önizleme">
      Yeni reklam akışı yapım aşamasında. Seçimlerin taslak olarak kaydedilir; Meta’ya hiçbir şey gönderilmez.
    </Kutu>
  );

  if (!taslakId) {
    let liste: { satirlar: ReklamTaslakKaydi[]; toplam: number };
    try {
      liste = await serverApiFetch(`/reklam/taslaklar?clientId=${clientId}`);
    } catch (e) {
      return <Kutu ton="tehlike" baslik="Taslaklar okunamadı">{hata(e)}</Kutu>;
    }
    return (
      <div className="space-y-5">
        <Baslik ust={ust} baslik="Yeni Reklam" aciklama={<strong className="text-ink">{workspaceAdi}</strong>} />
        {onizleme}
        <YeniTaslakDugmesi clientId={clientId} />
        <section className="rounded-xl border border-line bg-surface">
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">
            Açık taslaklar{' '}
            <span className="font-normal text-ink-muted">
              ({liste.satirlar.length < liste.toplam ? `${liste.satirlar.length} / ${liste.toplam} gösteriliyor` : liste.toplam})
            </span>
          </h2>
          {liste.satirlar.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-muted">Bu workspace’te açık taslak yok.</p>
          ) : (
            <ul className="divide-y divide-line">
              {liste.satirlar.map((t) => (
                <li key={t.id}>
                  <Link
                    href={`/reklam/yeni?musteri=${clientId}&taslak=${t.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-surface-muted"
                  >
                    <span>
                      <b>{t.niyetKodu ? NIYET_KATALOGU[t.niyetKodu as NiyetKodu]?.ekranAdi ?? t.niyetKodu : 'Amaç seçilmedi'}</b>
                      <span className="ml-2 text-xs text-ink-muted">
                        {t.eksikler.filter((e) => e.kod !== 'OK-17').length} eksik · sürüm {t.aktifSurumNo}
                      </span>
                    </span>
                    <span className="text-xs text-ink-muted">{formatRelative(t.updatedAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }

  const [taslakSonuc, hazirlikSonuc, atifSonuc] = await Promise.allSettled([
    serverApiFetch<ReklamTaslakKaydi>(`/reklam/taslaklar/${encodeURIComponent(taslakId)}`),
    serverApiFetch<ReklamHazirligi>(`/reklam/hazirlik?clientId=${clientId}`),
    serverApiFetch<AtifDurumu>('/reklam/ajans-ayari/atif'),
  ]);
  if (taslakSonuc.status === 'rejected') {
    return <Kutu ton="tehlike" baslik="Taslak okunamadı">{hata(taslakSonuc.reason)}</Kutu>;
  }
  if (hazirlikSonuc.status === 'rejected') {
    return <Kutu ton="tehlike" baslik="Reklam hazırlığı okunamadı">{hata(hazirlikSonuc.reason)} Sayfayı yenilemeyi dene.</Kutu>;
  }
  const taslak = taslakSonuc.value;
  const hazirlik = hazirlikSonuc.value;
  // Adresteki workspace ile taslağınki ayrışırsa YANLIŞ workspace'in
  // hesapları seçenek olarak gelirdi.
  if (taslak.clientId !== clientId) {
    return <Kutu ton="tehlike" baslik="Bu taslak başka bir workspace’e ait">Taslak listesine dönüp yeniden aç.</Kutu>;
  }

  if (hazirlik.hesaplar.length === 0 || hazirlik.sayfalar.length === 0) {
    return (
      <div className="space-y-5">
        <Baslik ust={ust} baslik="Yeni Reklam" />
        <Kutu
          ton="uyari"
          baslik={hazirlik.hesaplar.length === 0 ? 'Bu workspace’e Meta reklam hesabı atanmamış' : 'Bu workspace’te Facebook sayfası yok'}
          eylem={
            <Link href={`/marka-merkezi?bolum=baglantilar&musteri=${clientId}`} className={dugmeSinifi('ikincil', true)}>
              Bağlantılara git
            </Link>
          }
        >
          Reklam hazırlığı Marka Merkezi’nde bir kez yapılır.
        </Kutu>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Baslik
        ust={ust}
        baslik="Yeni Reklam"
        aciklama={
          <>
            <strong className="text-ink">{workspaceAdi}</strong> · beş soru, bir kontrol ekranı.
          </>
        }
      />
      {onizleme}
      {hazirlik.taninmayanKategoriler.length > 0 && (
        <Kutu ton="uyari" baslik="Workspace kaydında tanınmayan reklam kategorisi">
          {hazirlik.taninmayanKategoriler.join(', ')}. Ajans yöneticisi workspace kaydını düzeltmeli.
        </Kutu>
      )}
      {!hazirlik.marka.profilVar && (
        <Kutu ton="uyari" baslik="Marka profili kurulmamış">
          Metin şablonları ve yasal uyarı Marka Merkezi’nden gelir; şu an boş.
        </Kutu>
      )}
      <YeniReklamAkisi
        key={taslak.id}
        clientId={clientId}
        workspaceAdi={workspaceAdi}
        hazirlik={hazirlik}
        ilkTaslak={taslak}
        ilkAtif={atifSonuc.status === 'fulfilled' ? atifSonuc.value : null}
        yonetici={atifSonuc.status === 'fulfilled' ? atifSonuc.value.secebilir : false}
      />
    </div>
  );
}

function hata(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Sunucuya ulaşılamadı.';
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
