import type { ConnectionSummary, ProviderAvailability } from '@advetics/shared';
import { ApiRequestError, serverApiFetch } from '@/lib/api';
import { hasPermission, requireSession } from '@/lib/session';
import { TopluTazeleme } from '@/components/connections/toplu-tazeleme';
import { KanalKartlari } from '@/components/connections/kanal-kartlari';
import { HavuzKartlari } from '@/components/connections/havuz-kartlari';
import { YouTubeKanalEkle } from '@/components/connections/youtube-kanal-ekle';
import { IzlenenHesaplar } from '@/components/connections/izlenen-hesaplar';
import { CallbackBanner } from '@/components/callback-banner';

export const metadata = { title: 'Platform Bağlantıları · Advetics' };

/**
 * ═══ PLATFORM BAĞLANTILARI ═══
 *
 * BAĞLANTI AJANS SEVİYESİNDE — WORKSPACE SEÇİMİ ÖN KOŞUL DEĞİL.
 *
 * Bu ekran üç kez model değiştirdi; üçüncüsünün sebebi bir varsayımın
 * ÇÜRÜMESİ ve o varsayım burada yazılı kalmalı:
 *
 *   1. En başta "önce bir müşteri seç" diyordu. Aynı Meta kimliğini müşteri
 *      başına yeniden yetkilendirmek gerekiyordu ve platform her
 *      yetkilendirmede öncekinin token'ını geçersiz kıldığı için
 *      bağlantıları KOPARIYORDU.
 *   2. Bağlantı ajansa taşındı, hesaplar havuza düştü, müşteriye atanıyor.
 *   3. Bir süre "her workspace kendi Meta hesabıyla bağlanır" modeli
 *      denendi. ÇÜRÜDÜ: müşterilerin kendi Facebook hesabı yok, ajans
 *      onların Business Manager'ına partner olarak ekleniyor. Yani her
 *      yetkilendirme AYNI Facebook kullanıcısı oluyor ve
 *      `orgId + platform + externalUserId` tekil anahtarında tek satıra
 *      çakışıyor. Workspace başına bağlantı fiziksel olarak mümkün değil.
 *
 * ┌─ EKRANIN SIRASI = KULLANICININ SORULARININ SIRASI ──────────────────────┐
 * │ Sayfa sekiz bloktu ve sıraları kullanıcının sorduğu sırayla ilgisizdi: │
 * │ veri tazeleme EN ÜSTTE, bağlantı sağlığı EN ALTTA, aynı hesaplar üç    │
 * │ ayrı yerde üç ayrı kelimeyle sayılıyordu ve en altta geliştirici       │
 * │ notları duruyordu. Kullanıcının tarifi "hepsi birbirine karışmış".     │
 * │                                                                         │
 * │ Bugünkü sıra tek bir hikâye:                                            │
 * │   1. KANALLAR   — bağlı mıyım, sağlıklı mı, değilse nasıl bağlanırım   │
 * │   2. HAVUZ      — hangi hesaplar henüz kimseye ait değil                │
 * │   3. ATANANLAR  — hangi workspace neyi kullanıyor                       │
 * │   4. BAKIM      — veriyi elle tazeleme                                  │
 * │                                                                         │
 * │ Bağlanma düğmesi ayrı bir kutudan çıkıp KANAL KARTININ İÇİNE girdi:    │
 * │ "bağlan" bir kanalın DURUMLARINDAN biri ve ayrı kutuda dururken Meta   │
 * │ zaten bağlıyken bile aynı düğmeyi gösteriyordu.                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * "PLATFORM ONAYLARI" BÖLÜMÜ EKRANDAN KALKTI. Meta App Review izin adları,
 * "Business Verification ve ekran kaydı demo zorunlu", "2-6 hafta sürüyor ve
 * geliştirmeye paralel yürütülmeli" gibi satırlar bir GELİŞTİRME notuydu ve
 * beyaz etiketli bir üründe ajansın müşterisinin okuduğu ekranda duruyordu.
 * İçerik `docs/DEPLOYMENT.md`e taşındı; silinmedi, yeri değişti.
 */
export default async function ConnectionsPage() {
  const session = await requireSession();
  const canManage = hasPermission(session, 'connection.manage');

  /*
   * HATA YUTULMUYOR. İkisi de `.catch(() => [])` ile alınıyordu ve bu
   * depoda adı konmuş bir yasak: "hiç bağlantı yok" ile "liste okunamadı"
   * aynı boş ekrana çevriliyordu. Birincisi tamamen normal bir durum ve
   * ekran ona göre bir şey söylüyor; ikincisinde kullanıcı var olan
   * bağlantısını kaybettiğini sanıyor.
   *
   * `/connections` müşteri parametresi OLMADAN çağrılıyor: bu ekran atama
   * ekranı ve havuzdaki hesapların tamamını göstermek zorunda.
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
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Platform Bağlantıları</h1>
        {/*
          BAŞLIK METNİ ÜÇ CÜMLEDEN BİRE İNDİ. Eski hâli bağlantının neden
          ajansa kurulduğunu, token'ların neden çakıştığını ve atamanın neyi
          tetiklediğini anlatıyordu: gerekçe KOD YORUMUNA ait, ekrana değil.
        */}
        <p className="mt-1 max-w-prose text-sm text-ink-muted">
          Reklam hesaplarını buradan bağlıyorsun. Gelen hesapları workspace&apos;lere
          atadığında veri akışı kendiliğinden başlıyor.
        </p>
      </header>

      <CallbackBanner />

      {yuklemeHatasi && (
        <div
          role="alert"
          className="rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger-strong"
        >
          <strong>Bağlantılar okunamadı.</strong> <span>{yuklemeHatasi}</span>
        </div>
      )}

      {/* 1. KANALLAR: bağlı mıyım, sağlıklı mı, değilse nasıl bağlanırım. */}
      <KanalKartlari
        availability={availability}
        connections={connections}
        canManage={canManage}
      />

      {!canManage && (
        <p className="text-xs text-ink-muted">
          Bağlantı kurmak, kaldırmak ve hesap atamak yöneticinin işi. Listeyi görebilirsin.
        </p>
      )}

      {connections.length > 0 && (
        <>
          {/* 2. HAVUZ: hangi hesaplar henüz kimseye ait değil. */}
          <section className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">Atanmamış hesaplar</h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Bir hesabı workspace&apos;e atadığında veri akışı başlıyor ve 90 günlük geçmiş
                kuyruğa giriyor.
              </p>
            </div>
            <HavuzKartlari
              connections={connections}
              clients={session.availableClients}
              canManage={canManage}
              workspaceAcabilir={hasPermission(session, 'client.write')}
            />

            {/*
              YOUTUBE KANALI HAVUZUN YANINDA, AYRI BİR EKRANDA DEĞİL.

              Kanal eklemek havuza hesap eklemekle aynı iş ve sonucu da aynı
              yere düşüyor: üstteki YouTube kartının sayacı. Akıllı Boost
              ekranında duruyordu ve orada bağlantı kurulumunu boost
              yetkisinin yanına koyuyordu.
            */}
            <YouTubeKanalEkle canManage={canManage} />
          </section>

          {/* 3. ATANANLAR: hangi workspace neyi kullanıyor. */}
          <IzlenenHesaplar connections={connections} clients={session.availableClients} />
        </>
      )}

      {/*
        4. BAKIM EN ALTTA. Bu blok sayfanın EN ÜSTÜNDEYDİ ve ekranın ilk
        gördüğü şey bir bakım işlemiydi; üstelik adı ("Tüm verileri
        güncelle") kanal kartındaki "Hesapları tara" ile karışıyordu. İkisi
        farklı iş: biri metrik çekiyor, diğeri hesap listesini okuyor.
      */}
      {session.isOrgAdmin && session.availableClients.length > 0 && (
        <TopluTazeleme
          workspaceler={session.availableClients.map((c) => ({ id: c.id, name: c.name }))}
        />
      )}
    </div>
  );
}

/** Hata mesajını çıkarır — platformun kendi cümlesi ekranda görünmeli. */
function hataMetni(e: unknown): string {
  return e instanceof ApiRequestError ? e.message : 'Bağlantı kurulamadı.';
}
