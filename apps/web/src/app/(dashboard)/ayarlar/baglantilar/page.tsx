import type { ConnectionSummary, ProviderAvailability } from '@advetics/shared';
import { serverApiFetch } from '@/lib/api';
import { requireSession } from '@/lib/session';
import { ConnectButtons } from '@/components/connect-buttons';
import { ConnectionCard } from '@/components/connection-card';
import { HavuzKartlari } from '@/components/connections/havuz-kartlari';
import { IzlenenHesaplar } from '@/components/connections/izlenen-hesaplar';
import { CallbackBanner } from '@/components/callback-banner';

export const metadata = { title: 'Platform Bağlantıları — Advetics' };

export default async function ConnectionsPage() {
  const session = await requireSession();

  /**
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
   * Bugünkü model 2: tek ajans bağlantısı, hesaplar müşteriye ATANIYOR ve
   * atama artık izlemeyi de açıp geçmiş veriyi kuyruğa alıyor — "ata, sonra
   * izlemeyi aç, sonra bekle" üçlüsü tek adıma indi.
   *
   * `/connections` müşteri parametresi OLMADAN çağrılıyor: bu ekran atama
   * ekranı ve havuzdaki hesapların tamamını göstermek zorunda.
   */
  const [availability, connections] = await Promise.all([
    serverApiFetch<ProviderAvailability[]>('/connections/availability').catch(() => []),
    serverApiFetch<ConnectionSummary[]>('/connections').catch(() => []),
  ]);

  return (
    /*
     * 4xl'DEN 7xl'E — TAM GENİŞLİĞE DEĞİL.
     *
     * Beş havuz kartı 896px'te iki kolona sıkışıyordu. Ama bu ekran kartların
     * yanında uzun açıklama metinleri de taşıyor (platform onayları, izin
     * listeleri) ve onlar tam genişlikte satır başına 200 karakteri geçip
     * okunmaz hâle geliyor. 7xl ikisini birden tutuyor.
     */
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Platform Bağlantıları</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Meta ve Google Ads hesabını <strong>bir kez</strong> bağla; gelen reklam
          hesaplarını ve sayfaları müşterilere ata. Atama izlemeyi de açıyor ve
          90 günlük geçmişi kuyruğa alıyor — ayrıca bir şey yapmana gerek yok.
        </p>
      </div>

      <CallbackBanner />

      {/* Bağlantı kurmak bütün müşterileri etkiliyor — API de bunu org
          yöneticisiyle sınırlıyor. Düğmeyi yetkisi olmayana göstermek,
          tıklayınca 403 almak demekti. */}
      {session.isOrgAdmin ? (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold">Yeni bağlantı</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Bağlantı ajansa kurulur, müşteriye değil: aynı Facebook kullanıcısıyla
            ikinci bir yetkilendirme platformda ilk token’ı geçersiz kılıyor.
            Müşteri ayrımı hesap ATAMASIYLA yapılıyor.
          </p>
          <ConnectButtons availability={availability} />
        </section>
      ) : (
        <div className="rounded-xl border border-line bg-surface-muted p-5">
          <h2 className="text-sm font-semibold">Bağlantı kurma yetkisi yok</h2>
          <p className="mt-1.5 text-sm text-ink-muted">
            Platform bağlantısı kurmak, kaldırmak ve hesapları müşterilere atamak
            organizasyon yöneticisinin işi. Aşağıdaki listeyi görebilirsin.
          </p>
        </div>
      )}

      {connections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-8 text-center">
          <p className="text-sm text-ink-muted">Henüz bağlantı yok.</p>
        </div>
      ) : (
        <>
          {/*
            HAVUZ KARTLARI — eski satır satır liste yerine.
            Her bağlantının altında bütün hesaplar listeleniyordu; 284 hesapta
            ekran metrelerce uzuyor ve "hangi hesap boşta" sorusu ancak
            kaydırarak cevaplanabiliyordu. Şimdi kanal başına tek kart ve
            liste POP-UP'ta, arama kutusuyla.
          */}
          <HavuzKartlari
            connections={connections}
            clients={session.availableClients}
            canManage={session.isOrgAdmin}
          />

          <IzlenenHesaplar connections={connections} clients={session.availableClients} />

          {/*
            BAĞLANTI DURUMU KARTLARI DURUYOR ama artık hesap listesi taşımıyor:
            token süresi, eksik izinler ve "yeniden yetkilendir" düğmesi burada
            ve başka hiçbir yerde yok.
          */}
          <div className="space-y-3">
            {connections.map((c) => (
              <ConnectionCard
                key={c.id}
                connection={c}
                clients={session.availableClients}
                canManage={session.isOrgAdmin}
                compact
              />
            ))}
          </div>
        </>
      )}

      {/* Onay süreçleri koda paralel yürümek zorunda — bu yüzden panelde görünür. */}
      <section className="rounded-xl border border-line bg-surface-muted p-5">
        <h2 className="text-sm font-semibold">Platform onayları</h2>
        <p className="mt-1.5 text-sm text-ink-muted">
          Bağlantılar teknik olarak hazır, ama platformlar üretim erişimi için onay ister.
          Bu süreçler 2–6 hafta sürüyor ve geliştirmeye paralel yürütülmeli.
        </p>
        <ul className="mt-3 space-y-1.5 text-sm">
          <li>
            <strong>Meta App Review</strong> — <code className="text-xs">ads_management</code>,{' '}
            <code className="text-xs">ads_read</code>,{' '}
            <code className="text-xs">business_management</code>,{' '}
            <code className="text-xs">pages_read_engagement</code>,{' '}
            <code className="text-xs">instagram_manage_insights</code> · Business Verification
            ve ekran kaydı demo zorunlu
          </li>
          <li>
            <strong>Meta Tech Provider</strong> — müşteri hesaplarını yönetmek için gerekli
          </li>
          <li>
            <strong>Google Ads Developer Token</strong> — Basic Access onayı olmadan yalnızca
            test hesapları görünür
          </li>
        </ul>
      </section>
    </div>
  );
}
