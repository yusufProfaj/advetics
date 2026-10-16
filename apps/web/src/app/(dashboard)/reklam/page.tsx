import { sec, siteYokMu, type RehberHazirligi, type RehberKaydi, type RehberListesi } from '@advetics/shared';
import { WorkspaceGerekli } from '@/components/workspace-gerekli';
import { RehberEkrani } from '@/components/rehber/rehber-ekrani';
import { RehberGirisi, RehberMesaji } from '@/components/rehber/rehber-girisi';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { baglanti } from '@/lib/baglanti';
import { beyanGirdisi, beyanlariOku } from '@/lib/kurulum-beyanlari';
import { sayfaWorkspaceId, workspaceSecimVerisi } from '@/lib/sayfa-workspace';
import { hasPermission, requireSession } from '@/lib/session';
import { menuSatiriEtiketi } from '@/lib/nav-sections';
import { dilAl } from '@/dil/sunucu';
import { reklamSozlugu } from '@/dil/sozlukler/reklam';

/** Sekme başlığı istek anında: dil çerezden okunuyor, ad menüyle aynı kaynaktan. */
export async function generateMetadata() {
  return { title: `${menuSatiriEtiketi('/reklam', await dilAl())} · Advetics` };
}
export const dynamic = 'force-dynamic';

/**
 * ADVCAMPAIGN — reklam kurmanın tek yolu. 2026-10-10'dan beri sohbet değil
 * altı adımlı REHBER (kullanıcı onayladı: `docs/advcampaign/rehber-taslak.html`,
 * mimari `docs/advcampaign/MIMARI-REHBER.md`). Yapay zekâ yalnız düğme
 * arkasında ("Metin öner", "Anahtar kelime öner").
 *
 * İki hâl, tek adres: `?rehber=` yoksa giriş (üç sekme: Yayındakiler,
 * Taslaklar, Arşiv; sekme `?sekme=`de, `lib/reklam-girisi.ts`), varsa
 * rehberin kendisi odaklı kipte. Rehber kimliği adreste:
 * yenileyen ya da bağlantıyı paylaşan kişi aynı rehbere döner.
 */
export default async function AdvCampaignPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const dil = await dilAl();
  const d = sec(reklamSozlugu, dil);
  const params = await searchParams;
  const clientId = sayfaWorkspaceId(session, first(params.musteri));
  if (!clientId) {
    return <WorkspaceGerekli ekran={menuSatiriEtiketi('/reklam', dil)} neden={d.sayfa.workspaceNeden} {...workspaceSecimVerisi(session)} />;
  }
  if (!hasPermission(session, 'bulk.write')) {
    return <RehberMesaji baslik={d.sayfa.yetkiYok}>{d.sayfa.yetkiYokGovde}</RehberMesaji>;
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
      listeHatasi = hata(e, d.ortak.sunucuYok);
    }
    return (
      <RehberGirisi
        clientId={clientId}
        workspaceAdi={workspaceAdi}
        liste={liste}
        listeHatasi={listeHatasi}
        sekmeParam={first(params.sekme)}
        devredildi={devredildi}
      />
    );
  }

  const kayitOku = () => serverApiFetch<RehberKaydi>(`/reklam/rehberler/${encodeURIComponent(rehberId)}`);
  let [r, h] = await Promise.allSettled([
    kayitOku(),
    // rehberId: ön koşullar bu rehberin SEÇİLİ sayfasından okunsun (ilkinden değil).
    serverApiFetch<RehberHazirligi>(`/reklam/rehber/hazirlik?clientId=${encodeURIComponent(clientId)}&rehberId=${encodeURIComponent(rehberId)}`),
  ]);
  // HAZIRLIKTAN SONRA KAYIT BİR KEZ DAHA: kaydın eksik listesi platform
  // bilgisini (Meta asgari bütçesi, Google dönüşümü) hazırlığın doldurduğu
  // önbellekten okuyor. Paralel okumada önbellek soğuksa (deploy sonrası,
  // 15 dk sonra) kayıt önce hesaplanıyor ve "asgari bütçe okunamadı" uyarısı
  // bir sonraki yazmaya kadar ekranda kalıyordu (canlı, 2026-10-11). Kayıt
  // okuması yalnız veritabanı, ucuz.
  if (r.status === 'fulfilled' && h.status === 'fulfilled') {
    const ikinci = await Promise.allSettled([kayitOku()]);
    if (ikinci[0].status === 'fulfilled') r = ikinci[0];
  }
  // Okuma hataları AYRI cümleyle: rehber olmadan devam edilemez, hazırlık
  // olmadan hiçbir hesap ya da sayfa seçilemez.
  if (r.status === 'rejected') {
    return (
      <RehberMesaji baslik={d.sayfa.taslakOkunamadi} geri={listeAdresi}>
        {hata(r.reason, d.ortak.sunucuYok)}
      </RehberMesaji>
    );
  }
  if (h.status === 'rejected') {
    return (
      <RehberMesaji baslik={d.sayfa.hazirlikOkunamadi} geri={listeAdresi}>
        {hata(h.reason, d.ortak.sunucuYok)} {d.sayfa.hazirlikTekrar}
      </RehberMesaji>
    );
  }
  // Adresteki workspace ile rehberinki ayrışırsa YANLIŞ workspace'in
  // hesapları seçenek olarak gelirdi.
  if (r.value.clientId !== clientId) {
    return (
      <RehberMesaji baslik={d.sayfa.baskaWorkspace} geri={listeAdresi}>
        {d.sayfa.baskaWorkspaceGovde}
      </RehberMesaji>
    );
  }
  /*
   * "WEB SİTEMİZ YOK" BEYANI (kurulum sihirbazı, kullanıcı kararı 2): site
   * isteyen amaç kartları üstü çizili ve sebebiyle. Okunamazsa `null` ve
   * hiçbir amaç kapanmaz — çalışan bir amacı gizlemek yanlış alarmın tersi.
   */
  const siteYok = siteYokMu(beyanGirdisi(await beyanlariOku(serverApiFetch, clientId)));
  return (
    <RehberEkrani
      key={r.value.id}
      ilkKayit={r.value}
      hazirlik={h.value}
      sirketAdi={workspaceSecimVerisi(session).sirketAdi}
      workspaceAdi={workspaceAdi}
      formYayinIzni={hasPermission(session, 'bulk.publish')}
      siteYok={siteYok}
    />
  );
}

function hata(e: unknown, sunucuYok: string): string {
  return e instanceof ApiRequestError ? e.message : sunucuYok;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
