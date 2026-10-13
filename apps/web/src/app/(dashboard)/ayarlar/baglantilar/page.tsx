import { redirect } from 'next/navigation';
import { PANEL_KAPILARI, type ConnectionSummary, type ProviderAvailability } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { kapi } from '@/lib/panel-adresleri';
import { ayarSekmesiAcik } from '@/lib/ayar-kapilari';
import { Serit } from '@/components/ui/hal';
import { AyarKapsami, AyarlarSayfasi, aktifSirketAdi } from '@/components/ayar-kapsam';
import { TopluTazeleme } from '@/components/connections/toplu-tazeleme';
import { KanalKartlari, PlatformBaglaMenusu } from '@/components/connections/kanal-kartlari';
import { HavuzKartlari } from '@/components/connections/havuz-kartlari';
import { YouTubeKanalEkle } from '@/components/connections/youtube-kanal-ekle';
import { YouTubeKanalBul } from '@/components/connections/youtube-kanal-bul';
import { IzlenenHesaplar } from '@/components/connections/izlenen-hesaplar';
import { CallbackBanner } from '@/components/callback-banner';

export const metadata = { title: 'Platform bağlantıları · Advetics' };

/**
 * ═══ PLATFORM BAĞLANTILARI ═══
 *
 * BAĞLANTI AJANS (ŞİRKET) SEVİYESİNDE — WORKSPACE SEÇİMİ ÖN KOŞUL DEĞİL.
 *
 * Bu ekran üç kez model değiştirdi; üçüncüsünün sebebi bir varsayımın
 * ÇÜRÜMESİ ve o varsayım burada yazılı kalmalı:
 *
 *   1. En başta "önce bir müşteri seç" diyordu. Aynı Meta kimliğini müşteri
 *      başına yeniden yetkilendirmek gerekiyordu ve platform her
 *      yetkilendirmede öncekinin token'ını geçersiz kıldığı için
 *      bağlantıları KOPARIYORDU.
 *   2. Bağlantı ajansa taşındı, hesaplar havuza düştü, müşteriye atanıyor.
 *   3. "Her workspace kendi Meta hesabıyla bağlanır" denendi ve ÇÜRÜDÜ:
 *      müşterilerin kendi Facebook hesabı yok, ajans onların Business
 *      Manager'ına partner olarak ekleniyor; her yetkilendirme AYNI
 *      kullanıcı ve `orgId + platform + externalUserId` tek satıra çakışıyor.
 *
 * EKRANIN SIRASI = KULLANICININ SORULARININ SIRASI: 1. kanallar (bağlı
 * mıyım, sağlıklı mı) · 2. havuz (kimseye ait olmayan hesaplar) + YouTube
 * kanalı ekleme · 3. izlenenler (hangi workspace neyi kullanıyor) · 4. bakım
 * (veriyi elle tazeleme). Her blok kendi çapasını taşıyor
 * (`AYARLAR_CAPALARI.baglantilar`): bildirim zili ve Kurulum bu çapalara
 * bağlanıyor.
 *
 * KAPILAR `PANEL_KAPILARI`NDAN (2026-10-13). Eskiden tek bayrak
 * (`connection.manage`) bağlamayı, kaldırmayı, atamayı ve kanal eklemeyi
 * birlikte açıyordu; API ise kaldırmada org yöneticisi, kanal eklemede
 * yalnız `connection.write` istiyordu. Bayrak bir düğmeyi göstersin diye
 * diğerini yanlış kişiye açıyordu.
 */
export default async function PlatformBaglantilariSayfasi() {
  const session = await requireSession();
  if (!ayarSekmesiAcik(session, 'baglantilar')) redirect('/dashboard');

  const yetkilendirir = kapi(session, 'baglanti.yetkilendir');
  const atayabilir = kapi(session, 'hesap.ata');
  const kanalEkler = kapi(session, 'youtube.ekle');

  /*
   * HATA YUTULMUYOR (`.catch(() => [])` bu depoda yasak): "hiç bağlantı yok"
   * normal bir durum ve ekran ona göre bir şey söylüyor; "liste okunamadı"
   * da boş görünürse kullanıcı var olan bağlantısını kaybettiğini sanır.
   *
   * `/connections` müşteri parametresi OLMADAN: havuzun tamamı görünmeli.
   */
  const [uygunlukSonuc, baglantiSonuc] = await Promise.allSettled([
    serverApiFetch<ProviderAvailability[]>('/connections/availability'),
    serverApiFetch<ConnectionSummary[]>('/connections'),
  ]);

  const availability = uygunlukSonuc.status === 'fulfilled' ? uygunlukSonuc.value : [];
  const connections = baglantiSonuc.status === 'fulfilled' ? baglantiSonuc.value : [];
  const yuklemeHatasi =
    uygunlukSonuc.status === 'rejected'
      ? hataMetni(uygunlukSonuc.reason)
      : baglantiSonuc.status === 'rejected'
        ? hataMetni(baglantiSonuc.reason)
        : null;

  return (
    <AyarlarSayfasi
      session={session}
      ust={<AyarKapsami duzey="sirket" ad={aktifSirketAdi(session)} />}
      baslik="Platform bağlantıları"
      aciklama="Reklam hesaplarını buradan bağlıyorsun. Bir hesabı workspace’e atadığında veri akışı kendiliğinden başlar."
      /*
        BÖLÜMÜN BİRİNCİL EYLEMİ BAŞLIĞIN SAĞINDA: "Platform bağla". Kapı
        kapalıysa düğme yok ve sebebi kartların altında yazıyor.
      */
      eylemler={
        yetkilendirir && availability.length > 0 ? (
          /* YALNIZ PLATFORM ADLARI: hesap listesi istemciye ikinci kez taşınmasın. */
          <PlatformBaglaMenusu
            availability={availability}
            connections={connections.map((c) => ({ platform: c.platform }))}
          />
        ) : undefined
      }
      /* Liste zaten çekildi: yan menünün kırmızı noktası ikinci istek atmasın. */
      baglantilar={baglantiSonuc.status === 'fulfilled' ? connections : null}
    >
      <CallbackBanner />

      {yuklemeHatasi && (
        <Serit ton="hata" baslik="Bağlantılar okunamadı">
          {yuklemeHatasi}
        </Serit>
      )}

      {/* 1. KANALLAR: bağlı mıyım, sağlıklı mı, değilse nasıl bağlanırım. */}
      <div id="kanallar" className="grid scroll-mt-24 gap-2">
        <KanalKartlari
          availability={availability}
          connections={connections}
          canManage={yetkilendirir}
          kaldirabilir={kapi(session, 'baglanti.kaldir')}
        />
        {!yetkilendirir && (
          <p className="m-0 text-12 text-ink-muted">{PANEL_KAPILARI['baglanti.yetkilendir'].neden}</p>
        )}
      </div>

      {connections.length > 0 && (
        <>
          {/* 2. HAVUZ: hangi hesaplar henüz kimseye ait değil. */}
          <section id="havuz" className="grid scroll-mt-24 gap-2">
            <HavuzKartlari
              connections={connections}
              clients={session.availableClients}
              canManage={atayabilir}
              workspaceAcabilir={kapi(session, 'workspace.ekle')}
            />
            {!atayabilir && <p className="m-0 text-12 text-ink-muted">{PANEL_KAPILARI['hesap.ata'].neden}</p>}
          </section>

          {/*
            YOUTUBE KANALI HAVUZUN YANINDA: kanal eklemek havuza hesap
            eklemekle aynı iş ve sonucu da aynı yere düşüyor. Adres
            bilinmiyorsa isimle arama AYNI KARTTA; workspace'e tek adımda
            bağlamak için Marka Merkezi › Kurulum'daki kanallar bloğu.
          */}
          <section id="youtube" className="scroll-mt-24">
            <YouTubeKanalEkle canManage={kanalEkler}>
              {kanalEkler && (
                <>
                  <p className="m-0 text-13 font-semibold text-ink">Adresi bilmiyor musun? İsimle ara</p>
                  <YouTubeKanalBul clientId={null} workspaceAdi={null} />
                </>
              )}
            </YouTubeKanalEkle>
          </section>

          {/* 3. ATANANLAR: hangi workspace neyi kullanıyor. */}
          <div id="izlenen" className="scroll-mt-24">
            <IzlenenHesaplar connections={connections} clients={session.availableClients} />
          </div>
        </>
      )}

      {/*
        4. BAKIM EN ALTTA. "Tüm verileri güncelle" metrik çekiyor; kanal
        kartındaki "Hesapları tara" hesap listesini okuyor. İkisi farklı iş.
      */}
      <div id="tazeleme" className="scroll-mt-24">
        {kapi(session, 'veri.topluGuncelle') && session.availableClients.length > 0 ? (
          <TopluTazeleme workspaceler={session.availableClients.map((c) => ({ id: c.id, name: c.name }))} />
        ) : null}
      </div>
    </AyarlarSayfasi>
  );
}

/** Hata mesajını çıkarır — platformun kendi cümlesi ekranda görünmeli. */
function hataMetni(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı.';
}
